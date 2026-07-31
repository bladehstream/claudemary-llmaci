/* ============================================================
   Phone controls: tilt to drive, thumb buttons to look.

   The scheme, decided with the player: tip the top of the phone
   AWAY from you to roll forward and back toward you to reverse,
   pan the camera with two buttons under your left thumb, and
   dash with your right. The katamari always rolls along the
   camera's forward axis, so panning while tilting is how you
   steer — tank controls, and the same thing a chase-cam racing
   game does.

   Four things here are not optional and each one is a way this
   silently does nothing on a real phone:

   1. iOS NEEDS AN EXPLICIT PERMISSION GRANT, from inside a user
      gesture. `DeviceOrientationEvent.requestPermission()` only
      exists on Safari; calling it outside a tap resolves to
      'denied' with no prompt shown, and simply adding the
      listener without asking gets you an event that never fires.
      So the ask is wired to a real button on the intro screen,
      not to page load.

   2. IT ONLY WORKS OVER HTTPS. Secure context is required by
      every implementation. That is free on Pages and a trap on a
      laptop dev server reached by IP from a phone — use a tunnel
      or accept that tilt is dead there and the fallback runs.

   3. NEUTRAL HAS TO BE CALIBRATED. Nobody holds a phone flat.
      beta is 0 lying on a table and 90 held upright, so a
      comfortable reading angle is somewhere near 50 — which,
      against a fixed zero, reads as permanent full throttle. The
      neutral angle is captured when a round starts and can be
      re-zeroed mid-round from a button, because people shift
      position on a sofa.

   4. THERE MUST BE A PATH FOR "NO". A player who declines the
      permission, or whose browser has no sensor, still has a
      game in front of them. Declining swaps the recentre button
      for a forward/back pair and everything else is identical.

   Landscape is deliberately NOT supported: beta stops being the
   front-to-back axis once the phone is on its side, and rather
   than ship a sign-flip table nobody has tested on a real
   device, `orientationHint` asks for the phone back in portrait
   and tilt input holds at zero until it is.
   ============================================================ */

import { clamp } from '../util/math.js';

/** Degrees away from neutral that count as "not moving" — hands are not steady. */
const DEADZONE = 4;
/** Degrees away from neutral for full thrust. A wrist rolls this far comfortably. */
const RANGE = 22;
/** Where we assume the phone is held before we have ever seen a reading. */
const DEFAULT_NEUTRAL = 50;
/** Camera pan rate from a held button, radians/sec. Matches Q/E on the keyboard. */
export const PAN_RATE = 2.1;
/** Degrees of roll before turning starts. Wider than the drive deadzone: your
 *  wrist rolls a little every time you tip the phone forward, and a turn that
 *  creeps on while you are only trying to drive is worse than a slow one. */
const TURN_DEAD = 6;
/** Degrees of roll for a full-rate turn. */
const TURN_RANGE = 26;

/** True on a device driven by a finger rather than a mouse. */
export function isCoarsePointer() {
  const coarse = typeof window.matchMedia === 'function'
    && window.matchMedia('(pointer: coarse)').matches;
  const touch = 'ontouchstart' in window || (navigator.maxTouchPoints || 0) > 0;
  return coarse && touch;
}

export class TouchControls {
  constructor() {
    this.enabled = false;          // is the mobile scheme in use at all
    this.tilt = 'idle';            // idle | granted | denied | unsupported
    this.neutral = DEFAULT_NEUTRAL;
    this.raw = null;               // last axis reading, degrees, or null
    this.thrust = 0;               // -1..1, forward positive
    this.pan = 0;                  // -1, 0 or 1 from the buttons
    this.rawTurn = null;           // last roll reading, degrees, or null
    this.neutralTurn = 0;
    this.turnMode = 'tilt';        // 'tilt' | 'buttons'
    this.quitHeld = false;
    this.dash = false;
    this.manual = 0;               // -1..1 from the fallback drive buttons
    this.portrait = true;
    this._held = new Map();        // pointerId -> button element

    /**
     * Fired ONCE, when the first real reading lands. Not decoration: granting
     * the permission and receiving a reading are separate moments, and the UI
     * has to be decided by the second one.
     *
     * `requestPermission()` resolves as soon as the player taps Allow, but no
     * `deviceorientation` event has arrived yet — so anything that asks
     * `tiltLive` at that instant sees false and lays out the no-sensor
     * fallback. On a real handset the first reading turns up a frame later and
     * nothing would ever re-check, leaving a player with working tilt AND the
     * on-screen drive buttons, permanently. Caught by `test-mobile`.
     */
    this.onLive = null;

    this._onOrient = (e) => {
      /* `absolute` events carry compass drift we do not want and fire on some
         devices in addition to the relative ones; either is fine for a relative
         tilt, so take whichever arrives and keep using that source. */
      const b = e.beta;
      if (b === null || b === undefined || Number.isNaN(b)) return;
      const first = this.raw === null;
      this.raw = b;
      /* gamma is the ROLL axis — tip the phone left or right and this moves,
         which is the natural gesture for steering. It is only meaningful while
         the phone is upright, which is already enforced by `needsRotate`. */
      const g = e.gamma;
      if (g !== null && g !== undefined && !Number.isNaN(g)) this.rawTurn = g;
      if (this._needsCalibrate) {
        this.neutral = b;
        if (this.rawTurn !== null) this.neutralTurn = this.rawTurn;
        this._needsCalibrate = false;
      }
      if (first && this.onLive) this.onLive();
    };
    this._onOrientationChange = () => this._readOrientation();
    this._readOrientation();
  }

  /* ------------------------------------------------------------
     Availability
     ------------------------------------------------------------ */

  /** Does this browser expose the sensor at all? */
  static hasSensor() {
    return typeof window !== 'undefined' && 'DeviceOrientationEvent' in window;
  }

  /** Does it gate the sensor behind an explicit prompt (Safari on iOS)? */
  static needsPermission() {
    return TouchControls.hasSensor()
      && typeof window.DeviceOrientationEvent.requestPermission === 'function';
  }

  /**
   * Ask for the sensor. MUST be called synchronously from a user gesture on
   * iOS — a promise chain that starts in a timer has already lost the gesture
   * and resolves 'denied' without ever showing the dialog.
   *
   * @returns {Promise<'granted'|'denied'|'unsupported'>}
   */
  async requestTilt() {
    if (!TouchControls.hasSensor()) return (this.tilt = 'unsupported');
    try {
      if (TouchControls.needsPermission()) {
        const res = await window.DeviceOrientationEvent.requestPermission();
        if (res !== 'granted') return (this.tilt = 'denied');
      }
    } catch {
      /* Throws rather than resolving when called outside a gesture, or on a
         non-secure origin. Both mean the same thing to the player. */
      return (this.tilt = 'denied');
    }
    window.addEventListener('deviceorientation', this._onOrient);
    window.addEventListener('orientationchange', this._onOrientationChange);
    if (window.screen && window.screen.orientation) {
      window.screen.orientation.addEventListener('change', this._onOrientationChange);
    }
    this.tilt = 'granted';
    this.calibrate();
    /* If nothing arrives shortly, the listener attached but the platform is not
       feeding it — an emulator, a desktop with the flag on, a locked-down
       browser. Fall back rather than leave the player tilting at nothing. */
    setTimeout(() => { if (this.tilt === 'granted' && this.raw === null) this.tilt = 'unsupported'; }, 1500);
    return this.tilt;
  }

  /** Zero both neutral angles to however the phone is being held right now. */
  calibrate() {
    if (this.raw !== null) {
      this.neutral = this.raw;
      if (this.rawTurn !== null) this.neutralTurn = this.rawTurn;
    } else this._needsCalibrate = true;
  }

  /** Is tilt-steering actually available and selected? */
  get turnByTilt() {
    return this.turnMode === 'tilt' && this.tiltLive && this.portrait && this.rawTurn !== null;
  }

  get tiltLive() { return this.tilt === 'granted' && this.raw !== null; }

  /* ------------------------------------------------------------
     Orientation
     ------------------------------------------------------------ */

  _readOrientation() {
    const a = (window.screen && window.screen.orientation
      && typeof window.screen.orientation.angle === 'number')
      ? window.screen.orientation.angle
      : (typeof window.orientation === 'number' ? window.orientation : 0);
    const byAngle = a === 0 || a === 180;
    /* The angle is authoritative where it exists, but some in-app browsers
       report 0 forever, so cross-check the viewport shape. */
    const byShape = window.innerHeight >= window.innerWidth;
    this.portrait = byAngle && byShape;
  }

  /** True when the phone is on its side and tilt input is therefore parked. */
  get needsRotate() { return this.enabled && this.tiltLive && !this.portrait; }

  /* ------------------------------------------------------------
     Buttons
     ------------------------------------------------------------ */

  /**
   * Wire an on-screen button. Pointer events rather than touch events so this
   * works with a stylus and with a mouse in a desktop browser's device mode,
   * and `setPointerCapture` so a thumb that slides off the button while held
   * still releases it — without capture, sliding off leaves the button stuck
   * on for the rest of the round.
   */
  bind(el, action) {
    if (!el) return;
    const down = (e) => {
      e.preventDefault();
      try { el.setPointerCapture(e.pointerId); } catch { /* not all pointers can be captured */ }
      this._held.set(e.pointerId, action);
      el.classList.add('held');
      this._apply();
    };
    const up = (e) => {
      this._held.delete(e.pointerId);
      el.classList.remove('held');
      this._apply();
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    /* A pointer released outside the window never fires pointerup on the
       element; without this a button can latch on when the OS steals focus. */
    el.addEventListener('lostpointercapture', up);
  }

  _apply() {
    const held = new Set(this._held.values());
    this.pan = (held.has('pan-right') ? 1 : 0) - (held.has('pan-left') ? 1 : 0);
    this.manual = (held.has('drive-fwd') ? 1 : 0) - (held.has('drive-back') ? 1 : 0);
    this.dash = held.has('dash');
    this.quitHeld = held.has('quit');
  }

  /** Drop every held button — call when leaving play, or they latch. */
  releaseAll() {
    this._held.clear();
    this.pan = 0; this.manual = 0; this.dash = false; this.quitHeld = false;
    for (const el of document.querySelectorAll('.mc-btn.held')) el.classList.remove('held');
  }

  /* ------------------------------------------------------------
     Read
     ------------------------------------------------------------ */

  /**
   * Movement for this frame, in the same camera-relative form `Input.readMove`
   * returns, so `Katamari.step` cannot tell the difference.
   *
   * Forward is -Z to match the keyboard (W does `z -= 1`). Tipping the top of
   * the phone away from you LOWERS beta, so forward thrust is
   * `neutral - beta` — get that sign backwards and the game drives itself into
   * your lap.
   */
  read() {
    if (!this.enabled) return { moveX: 0, moveZ: 0, dash: false, pan: 0, turn: 0 };

    let t = 0;
    if (this.tiltLive && this.portrait) {
      const off = this.neutral - this.raw;
      const mag = Math.max(0, Math.abs(off) - DEADZONE) / (RANGE - DEADZONE);
      t = Math.sign(off) * clamp(mag, 0, 1);
    } else if (!this.tiltLive) {
      t = this.manual;
    }
    this.thrust = t;

    /* Turning: roll the phone, or hold a button. Never both — with tilt
       steering on, the pan buttons are hidden, because two live inputs onto one
       axis means the buttons fight whatever your wrist happens to be doing. */
    let turn = this.pan;
    if (this.turnByTilt) {
      const off = this.rawTurn - this.neutralTurn;
      const mag = Math.max(0, Math.abs(off) - TURN_DEAD) / (TURN_RANGE - TURN_DEAD);
      turn = Math.sign(off) * clamp(mag, 0, 1);
    }
    return { moveX: 0, moveZ: -t, dash: this.dash, pan: this.pan, turn };
  }
}
