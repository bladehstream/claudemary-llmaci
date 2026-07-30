/* ============================================================
   Keyboard + mouse input with pointer lock, plus a drag
   fallback for anyone who does not want their cursor captured.
   ============================================================ */

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.locked = false;
    this.dragging = false;
    this.sensitivity = 1;
    this.invertY = false;
    this.enabled = false;
    this.onKey = null;          // (code) => void, for one-shot bindings
    /* Release is a separate hook because one key now has both a tap meaning and
       a hold meaning: Enter finishes the round on a tap and quits to the title
       on a hold. A tap cannot be recognised on keydown — you do not yet know it
       is a tap — so the tap action has to fire here. */
    this.onKeyUp = null;

    this._onKeyDown = (e) => {
      if (e.repeat) { e.preventDefault?.(); return; }
      this.keys.add(e.code);
      if (this.onKey) this.onKey(e.code, e);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab'].includes(e.code)) e.preventDefault();
    };
    this._onKeyUp = (e) => {
      this.keys.delete(e.code);
      if (this.onKeyUp) this.onKeyUp(e.code, e);
    };
    /* Losing focus mid-hold must NOT read as a completed hold, and clearing the
       set is what guarantees that: the hold timer is driven off `down()`, so an
       alt-tab away releases it on the next frame. */
    this._onBlur = () => this.keys.clear();

    this._onMouseMove = (e) => {
      if (!this.enabled) return;
      if (this.locked) {
        this.mouseDX += e.movementX || 0;
        this.mouseDY += e.movementY || 0;
      } else if (this.dragging) {
        this.mouseDX += e.movementX || 0;
        this.mouseDY += e.movementY || 0;
      }
    };
    this._onDown = (e) => { if (e.button === 0) this.dragging = true; };
    this._onUp = () => { this.dragging = false; };
    this._onLockChange = () => {
      this.locked = document.pointerLockElement === this.canvas;
    };

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', this._onBlur);
    window.addEventListener('mousemove', this._onMouseMove);
    canvas.addEventListener('mousedown', this._onDown);
    window.addEventListener('mouseup', this._onUp);
    document.addEventListener('pointerlockchange', this._onLockChange);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  requestLock() {
    if (!this.locked && this.canvas.requestPointerLock) {
      const p = this.canvas.requestPointerLock();
      if (p && p.catch) p.catch(() => { /* user gesture required, drag fallback still works */ });
    }
  }

  releaseLock() {
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
  }

  down(...codes) { return codes.some((c) => this.keys.has(c)); }

  /** Movement vector in camera space, magnitude clamped to 1. */
  readMove() {
    let x = 0, z = 0;
    // Arrows are a complete alternative to WASD. They used to move on the
    // vertical axis but spin the camera on the horizontal one, which is a
    // confusing half-and-half; Q/E are the documented camera keys.
    if (this.down('KeyW', 'ArrowUp')) z -= 1;
    if (this.down('KeyS', 'ArrowDown')) z += 1;
    if (this.down('KeyA', 'ArrowLeft')) x -= 1;
    if (this.down('KeyD', 'ArrowRight')) x += 1;
    const m = Math.hypot(x, z);
    if (m > 1) { x /= m; z /= m; }
    return { moveX: x, moveZ: z, mag: Math.min(1, m) };
  }

  /** Consume and return accumulated mouse delta. */
  takeLook() {
    const dx = this.mouseDX, dy = this.mouseDY;
    this.mouseDX = 0; this.mouseDY = 0;
    return { dx, dy };
  }

  /** Keyboard camera nudge. */
  readCameraNudge() {
    let n = 0;
    if (this.down('KeyQ')) n -= 1;
    if (this.down('KeyE')) n += 1;
    return n;
  }

  get dash() { return this.down('ShiftLeft', 'ShiftRight'); }

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('blur', this._onBlur);
    window.removeEventListener('mousemove', this._onMouseMove);
    window.removeEventListener('mouseup', this._onUp);
    document.removeEventListener('pointerlockchange', this._onLockChange);
  }
}
