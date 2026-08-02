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
    this._friendEl = document.getElementById('friend-marker');
  }

  /**
   * World point to a screen position that always points somewhere useful.
   *
   * ⚠ A POINT BEHIND THE CAMERA PROJECTS TO A MIRRORED POSITION, so the naive
   * version sends you confidently in exactly the wrong direction. `project`
   * gives `z > 1` for those, and flipping both axes puts the marker back on the
   * correct side before the edge clamp runs.
   *
   * Shared by the straggler finder and the co-op friend marker — they want the
   * identical behaviour, and the behind-the-camera flip is precisely the sort
   * of subtlety that gets fixed in one copy and not the other.
   *
   * @returns {{sx: number, sy: number, off: boolean}} `off` = clamped to an edge
   */
  static _project(p, camera, w, h, pad) {
    _fv.set(p.x, p.y, p.z).project(camera);
    const behind = _fv.z > 1;
    let sx = (_fv.x * 0.5 + 0.5) * w;
    let sy = (-_fv.y * 0.5 + 0.5) * h;
    if (behind) { sx = w - sx; sy = h - sy; }
    const off = behind || sx < pad || sx > w - pad || sy < pad || sy > h - pad;
    if (off) {
      const cx = w / 2, cy = h / 2;
      const dx = sx - cx, dy = sy - cy;
      const m = Math.max(1e-3, Math.max(Math.abs(dx) / (cx - pad), Math.abs(dy) / (cy - pad)));
      sx = cx + dx / m;
      sy = cy + dy / m;
    }
    return { sx, sy, off };
  }

  /**
   * Where the other player is, during a co-op round.
   *
   * Always on screen in some form, unlike the straggler finder: a ghost you
   * cannot find is the difference between playing together and playing
   * alongside, and the two of you start a couple of ball-widths apart and
   * diverge from there. Wears the friend's own colour so it reads as them
   * rather than as another piece of HUD furniture.
   */
  setFriend(pos, camera, colour) {
    const el = this._friendEl;
    if (!el) return;
    if (!pos) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    const w = window.innerWidth, h = window.innerHeight;
    const { sx, sy, off } = HUD._project(pos, camera, w, h, 40);
    el.classList.toggle('off', off);
    el.style.left = `${sx}px`;
    el.style.top = `${sy}px`;
    if (colour !== this._friendColour) {
      this._friendColour = colour;
      el.style.setProperty('--friend', `#${(colour >>> 0).toString(16).padStart(6, '0')}`);
    }
  }

  clearFriend() {
    if (this._friendEl) this._friendEl.classList.add('hidden');
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
      // Shared with the co-op friend marker; see `_project` for why a point
      // behind the camera needs both axes flipped before the edge clamp.
      const { sx, sy, off } = HUD._project(p, camera, w, h, pad);
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

  /**
   * "Turn your phone upright."
   *
   * Shown while a tilt-controlled round is held sideways. It is not decoration:
   * `Game._stepPlaying` zeroes the input at the same time, because beta stops
   * being the front-to-back axis once the phone is on its side and driving off
   * whatever it reads instead is worse than stopping.
   */
  setRotateHint(on) {
    if (!this._rotateEl) this._rotateEl = document.getElementById('rotate-hint');
    if (!this._rotateEl || on === this._rotateOn) return;
    this._rotateOn = on;
    this._rotateEl.classList.toggle('hidden', !on);
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
    /* The touch build has its own quit button with its own fill, driven by the
       same timer — one hold duration for the whole game. */
    if (!this._mqFill) this._mqFill = document.getElementById('mc-quit-fill');
    if (!this._mqBtn) this._mqBtn = document.getElementById('mc-quit');
    if (this._mqFill) {
      this._mqFill.style.transform = `scaleY(${f.toFixed(3)})`;
      this._mqBtn.classList.toggle('arming', f > 0.001);
    }
  }

  show() { this.root.classList.remove('hidden'); }
  hide() { this.root.classList.add('hidden'); }

  setCanFinish(on) {
    this._canFinish = on;
    if (this.finishPrompt && !this._exhausted) this.finishPrompt.classList.toggle('hidden', !on);
    if (!this._exhausted) {
      /* "Press Enter" is a lie on a phone, and the long version wrapped to
         three lines and spilled out of the goal panel. The touch wording is
         also shorter, which is what actually fixes the overflow. */
      const touch = document.body.classList.contains('touch');
      this.goalMet.innerHTML = !on ? 'GOAL REACHED — keep rolling!'
        : touch ? 'GOAL REACHED — keep rolling, or tap below to finish'
        : 'GOAL REACHED — keep rolling, or press <b>Enter</b> to finish';
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
    /* Same forced write, same reason — see `setDash`. */
    this._dashFrac = -1;
    this._dashCharge = -1;
    this.setDash(1, 0);
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

  /**
   * Draw the dash meter on the phone's DASH button.
   *
   * @param {number} reserve  the dash bar, 0..1
   * @param {number} charge   the super-dash charge, 0..1
   *
   * ⚠ SAME SHORT-CIRCUIT AS `setQuitHold`, AND THE SAME TRAP WITH IT. Both
   * values are quantised before comparing, because they change by a few
   * ten-thousandths every frame and an un-quantised guard never fires — this
   * would then write two style properties sixty times a second forever. And
   * because it short-circuits, `reset()` has to force `_dashFrac = -1` or a
   * round that ended mid-dash leaves a half-empty button for the next one.
   *
   * Both writes are composited properties (`transform`, a custom property
   * feeding a gradient) so neither costs layout.
   */
  setDash(reserve, charge) {
    if (!this._mdFill) {
      this._mdFill = document.getElementById('mc-dash-fill');
      this._mdRing = document.getElementById('mc-dash-ring');
      this._mdBtn = document.querySelector('.mc-dash');
    }
    if (!this._mdFill) return;
    const r = Math.round(clamp(reserve, 0, 1) * 100) / 100;
    const c = Math.round(clamp(charge, 0, 1) * 100) / 100;
    if (r === this._dashFrac && c === this._dashCharge) return;
    this._dashFrac = r;
    this._dashCharge = c;
    this._mdFill.style.transform = `scaleY(${r.toFixed(2)})`;
    if (this._mdRing) this._mdRing.style.setProperty('--charge', c.toFixed(2));
    if (this._mdBtn) this._mdBtn.classList.toggle('charged', c > 0.995);
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
