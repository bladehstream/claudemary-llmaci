/* ============================================================
   The in-game overlay: size readout, timer, goal bar, the feed
   of item names, and the various flashes and banners.
   ============================================================ */

import * as THREE from 'three';
import { formatSize, formatSizeShort, formatTime, clamp } from '../util/math.js';

const _fv = new THREE.Vector3();

export class HUD {
  constructor() {
    this.root = document.getElementById('hud');
    this.sizeEl = document.getElementById('size-readout');
    this.goalEl = document.getElementById('goal-readout');
    this.goalFill = document.getElementById('goal-fill');
    this.goalMet = document.getElementById('goal-met');
    this.timerEl = document.getElementById('timer');
    this.stageEl = document.getElementById('stage-name');
    this.feedEl = document.getElementById('pickup-feed');
    this.countEl = document.getElementById('stat-count');
    this.uniqueEl = document.getElementById('stat-unique');
    this.speedLines = document.getElementById('speed-lines');
    this.flashEl = document.getElementById('flash');
    this.bannerEl = document.getElementById('sizeup-banner');
    this.countdownEl = document.getElementById('countdown');
    this.finishPrompt = document.getElementById('finish-prompt');
    this.quitPrompt = document.getElementById('quit-prompt');
    this.quitFill = document.getElementById('quit-fill');
    this.finderEl = document.getElementById('finder');
    this._finderDots = [];
    /* Static, and deliberately NOT a child of `#finder`. `#finder` is a
       full-screen absolute layer for the edge-clamped dots, so anything inside it
       has to position itself — which is how the counter ended up overlapping the
       Enter chips. It now lives in `.prompt-stack` and is laid out by flexbox. */
    this._finderCount = document.getElementById('finder-count');

    this._lastSizeText = '';
    this._feedItems = [];
    this._flashUntil = 0;
    this._urgent = false;
  }

  /**
   * Point at whatever is left, once there is little enough left to point at.
   *
   * `pts` are world positions; they get projected to screen space and clamped
   * to the edge when off-screen, so a marker always tells you which way to go.
   * Only called when the remaining count is small — see Game.update. Clearing
   * a stage requires collecting the LAST thing, and hunting stragglers across
   * a 4km city by eye is a search with no information, not a skill test.
   */
  setFinder(pts, camera) {
    if (!this.finderEl) return;
    if (!pts || !pts.length) { this.clearFinder(); return; }
    this.finderEl.classList.remove('hidden');
    if (this._finderCount) this._finderCount.classList.remove('hidden');

    const w = this.finderEl.clientWidth || window.innerWidth;
    const h = this.finderEl.clientHeight || window.innerHeight;
    const pad = 34;

    while (this._finderDots.length < pts.length) {
      const d = document.createElement('div');
      d.className = 'finder-dot';
      this.finderEl.appendChild(d);
      this._finderDots.push(d);
    }
    for (let i = 0; i < this._finderDots.length; i++) {
      const dot = this._finderDots[i];
      if (i >= pts.length) { dot.style.display = 'none'; continue; }
      const p = pts[i];

      // World -> camera space, so we can tell in-front from behind. A point
      // behind the camera projects to a mirrored on-screen position, which
      // would send you confidently in exactly the wrong direction.
      _fv.set(p.x, p.y, p.z).project(camera);
      const behind = _fv.z > 1;
      let sx = (_fv.x * 0.5 + 0.5) * w;
      let sy = (-_fv.y * 0.5 + 0.5) * h;
      if (behind) { sx = w - sx; sy = h - sy; }

      const off = behind || sx < pad || sx > w - pad || sy < pad || sy > h - pad;
      if (off) {
        // Clamp to the screen edge along the line from the middle.
        const cx = w / 2, cy = h / 2;
        let dx = sx - cx, dy = sy - cy;
        const m = Math.max(1e-3, Math.max(Math.abs(dx) / (cx - pad), Math.abs(dy) / (cy - pad)));
        sx = cx + dx / m;
        sy = cy + dy / m;
      }
      dot.style.display = '';
      dot.classList.toggle('off', off);
      dot.style.left = `${sx}px`;
      dot.style.top = `${sy}px`;
    }
    if (this._finderCount) {
      this._finderCount.textContent = pts.length === 1
        ? 'ONE THING LEFT'
        : `${pts.length} THINGS LEFT`;
    }
  }

  clearFinder() {
    if (this.finderEl) this.finderEl.classList.add('hidden');
    // Separate elements now, in separate parents, so both have to be hidden.
    if (this._finderCount) this._finderCount.classList.add('hidden');
  }

  /**
   * How far through the hold-to-quit gesture the player is, 0..1.
   *
   * Called every frame while playing. Written straight to a transform rather
   * than a width so it composites instead of relaunching layout, and skipped
   * entirely when the value has not moved — at rest that is every frame of a
   * normal round, which is the common case.
   */
  setQuitHold(frac) {
    if (!this.quitFill) return;
    const f = clamp(frac, 0, 1);
    if (f === this._quitFrac) return;
    this._quitFrac = f;
    this.quitFill.style.transform = `scaleX(${f.toFixed(3)})`;
    this.quitPrompt.classList.toggle('arming', f > 0.001);
  }

  show() { this.root.classList.remove('hidden'); }
  hide() { this.root.classList.add('hidden'); }

  setCanFinish(on) {
    this._canFinish = on;
    if (this.finishPrompt && !this._exhausted) this.finishPrompt.classList.toggle('hidden', !on);
    if (!this._exhausted) {
      this.goalMet.innerHTML = on
        ? 'GOAL REACHED — keep rolling, or press <b>Enter</b> to finish'
        : 'GOAL REACHED — keep rolling!';
    }
  }

  /**
   * Nothing left in the stage; the round is about to close itself. This banner
   * outranks the goal banner and must survive setGoalProgress(), which runs
   * every frame and would otherwise hide it again when below the goal.
   */
  setExhausted(on) {
    this._exhausted = on;
    if (on) {
      this.goalMet.innerHTML = 'NOTHING LEFT TO ROLL UP — wrapping up…';
      this.goalMet.classList.remove('hidden');
      if (this.finishPrompt) {
        this.finishPrompt.classList.remove('hidden');
        this.finishPrompt.classList.add('urgent');
        this.finishPrompt.querySelector('.fp-text').textContent = 'nothing left — wrapping up';
      }
    }
  }

  reset(stage) {
    this.stageEl.textContent = stage.name;
    // Every readout on this HUD is in the CURRENT stage's units. See util/math.
    this.unit = stage.unit || 'metric';
    /* `setSize` skips the DOM write when the formatted text is unchanged, which
       is a real saving at 60fps — but the text depends on the UNIT as well as the
       number, so the cache has to be dropped when the stage changes or a new
       stage can open showing the previous one's readout. */
    this._lastSizeText = null;
    this.goalEl.textContent = formatSizeShort(stage.goal, this.unit);
    this.goalFill.style.width = '0%';
    this._exhausted = false;
    this.clearFinder();
    this._canFinish = false;
    if (this.finishPrompt) {
      this.finishPrompt.classList.add('hidden');
      this.finishPrompt.classList.remove('urgent');
      /* "TAP", explicitly, because the chip below it says "hold" — the two
         prompts are read together and one of them saying only "Enter" makes the
         pair ambiguous. This overwrites the markup in index.html, so the two
         strings have to agree; `setExhausted` writes a third. */
      this.finishPrompt.querySelector('.fp-text').textContent = 'tap to finish the round';
    }
    this.goalMet.classList.add('hidden');
    this.setCanFinish(false);
    /* Force the write: `setQuitHold` short-circuits on an unchanged value, so
       after a round that ENDED mid-hold the cached 0 would leave a half-filled
       chip on screen for the whole next round. */
    this._quitFrac = -1;
    this.setQuitHold(0);
    this.countEl.textContent = '0';
    this.uniqueEl.textContent = '0';
    this.timerEl.classList.remove('urgent');
    this._urgent = false;
    this.feedEl.innerHTML = '';
    this._feedItems.length = 0;
    this.speedLines.style.opacity = '0';
  }

  setSize(metres, pulse) {
    const txt = formatSize(metres, this.unit);
    if (txt !== this._lastSizeText) {
      this.sizeEl.textContent = txt;
      this._lastSizeText = txt;
    }
    if (pulse) {
      this.sizeEl.classList.remove('pulse');
      void this.sizeEl.offsetWidth;
      this.sizeEl.classList.add('pulse');
    }
  }

  setGoalProgress(current, goal, met) {
    // Log scale: the bar would sit near zero for most of the stage otherwise.
    const t = clamp(Math.log(Math.max(1e-6, current / (goal * 0.02))) / Math.log(50), 0, 1);
    this.goalFill.style.width = `${(t * 100).toFixed(1)}%`;
    if (!this._exhausted) this.goalMet.classList.toggle('hidden', !met);
  }

  setTimer(seconds) {
    this.timerEl.textContent = formatTime(seconds);
    const urgent = seconds <= 30;
    if (urgent !== this._urgent) {
      this._urgent = urgent;
      this.timerEl.classList.toggle('urgent', urgent);
    }
  }

  setStats(count, unique) {
    this.countEl.textContent = String(count);
    this.uniqueEl.textContent = String(unique);
  }

  /** @param {number} rel 0..1 how big the item was relative to the katamari */
  pushPickup(name, rel) {
    const el = document.createElement('div');
    el.className = 'pickup-item' + (rel > 0.62 ? ' huge' : rel > 0.34 ? ' big' : '');
    el.textContent = name;
    this.feedEl.appendChild(el);
    const item = { el, until: performance.now() + (rel > 0.5 ? 2600 : 1700) };
    this._feedItems.push(item);
    while (this._feedItems.length > 7) {
      const old = this._feedItems.shift();
      old.el.remove();
    }
  }

  banner(text) {
    // The banner is nowrap at 62px, which fits about 14 characters. Longer
    // quips get scaled down so they stay on screen instead of running off
    // both edges.
    const len = Math.max(1, String(text).length);
    const byLength = 62 * Math.min(1, 14 / len);
    const byViewport = (window.innerWidth * 0.9) / (len * 0.62);
    this.bannerEl.style.fontSize = `${Math.max(20, Math.min(byLength, byViewport)).toFixed(0)}px`;
    this.bannerEl.textContent = text;
    this.bannerEl.classList.remove('show');
    void this.bannerEl.offsetWidth;
    this.bannerEl.classList.add('show');
  }

  countdown(n) {
    this.countdownEl.textContent = String(n);
    this.countdownEl.classList.remove('tick');
    void this.countdownEl.offsetWidth;
    this.countdownEl.classList.add('tick');
  }

  flash(strength = 0.5) {
    this.flashEl.style.transition = 'none';
    this.flashEl.style.opacity = String(strength);
    requestAnimationFrame(() => {
      this.flashEl.style.transition = 'opacity 400ms ease';
      this.flashEl.style.opacity = '0';
    });
  }

  setSpeed(frac) {
    // Only while actually dashing — at cruising speed these read as
    // streaks on the floor rather than as motion.
    const o = clamp((frac - 1.02) / 0.45, 0, 1) * 0.42;
    this.speedLines.style.opacity = o.toFixed(3);
  }

  tickFeed(now) {
    for (let i = this._feedItems.length - 1; i >= 0; i--) {
      const it = this._feedItems[i];
      if (now > it.until) {
        if (!it.fading) { it.fading = true; it.el.classList.add('fading'); it.until = now + 400; }
        else { it.el.remove(); this._feedItems.splice(i, 1); }
      }
    }
  }
}
