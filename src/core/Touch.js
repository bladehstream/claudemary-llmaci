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

/* ------------------------------------------------------------
   THE RESPONSE CURVE

   The first cut used an 18-degree band on drive and 20 on turn, and the player
   reported it felt "very on/off". Two separate causes; the smaller one is here.

   18 degrees is a SMALL wrist movement. Tip a phone to a comfortable reading
   angle and you have already spent most of it, so the middle of the band — the
   part that is supposed to be proportional — is a region you pass through
   rather than sit in. Both bands are roughly doubled below: 34 degrees of
   usable travel on drive, 39 on turn, which is a movement you can aim.

   The LARGER cause was not in this file at all. `Katamari.step` normalised the
   input vector and accelerated to a fixed cap, so however carefully `read()`
   computed a proportional value, the drive axis was a switch. Fixed there.
   Widening these constants alone would have changed nothing you could feel on
   the drive axis — worth remembering the next time a feel complaint looks like
   it wants a constant tuned.

   EXPO, NOT STEPS. The ask was to quantise the range into 20% increments, and
   that is the one change that makes this worse: the signal is already
   continuous, so notching it can only throw resolution away, and five notches
   is a coarser control than the infinite ones already on offer. What "I can't
   find the middle" actually wants is more of the PHYSICAL travel spent in the
   lower half of the OUTPUT — which is what an exponent does. At half
   deflection, EXPO 1.5 gives 35% instead of 50%, so the gentle half of the band
   buys the gentle third of the speed and the abrupt part is pushed out to the
   end where you are deliberately shoving. Same reason a gamepad stick has one.

   AND THE WIDTH IS A SLIDER, because it has to be. Widening the band trades
   "twitchy" for "I have to wave the phone around", and where that trade lands
   depends on whether the player is sitting up, lying down or holding the phone
   one-handed — none of which is knowable from here. The first attempt at this
   used RANGE 38 with EXPO 1.6, which measured beautifully and would have given
   30% of top speed at a comfortable 20-degree tilt, i.e. an hour of crawling
   across a city. `rangeMul` (Options -> Tilt range, 0.6x to 1.6x) scales both
   bands so the answer is one slider away instead of one round trip away.
   ------------------------------------------------------------ */

/** Degrees away from neutral that count as "not moving" — hands are not steady. */
const DEADZONE = 4;
/** Degrees away from neutral for full thrust, at a `rangeMul` of 1. */
const RANGE = 30;
/** Where we assume the phone is held before we have ever seen a reading. */
const DEFAULT_NEUTRAL = 50;
/** Camera pan rate from a held button, radians/sec. Matches Q/E on the keyboard. */
export const PAN_RATE = 2.1;
/** Degrees of roll before turning starts. Wider than the drive deadzone: your
 *  wrist rolls a little every time you tip the phone forward, and a turn that
 *  creeps on while you are only trying to drive is worse than a slow one. */
const TURN_DEAD = 6;
/** Degrees of roll for a full-rate turn, at a `rangeMul` of 1. */
const TURN_RANGE = 36;
/** Shape of both axes. 1 is linear; above 1 gives away the low end. */
const EXPO = 1.5;

/**
 * Degrees from neutral -> -1..1, deadzoned and expo'd.
 *
 * One function for both axes because they differ only in their constants, and
 * two near-identical inline blocks is how a pair like that drifts apart.
 */
function curve(offset, dead, range) {
  const mag = (Math.abs(offset) - dead) / (range - dead);
  if (mag <= 0) return 0;
  return Math.sign(offset) * Math.pow(clamp(mag, 0, 1), EXPO);
}

/**
 * Low-pass the raw sensor.
 *
 * `deviceorientation` jitters at the degree level even on a phone lying still,
 * and that noise does not average out in the hand — it reads as the ball
 * shivering, which pushes you toward holding the phone near the ends of the
 * band where the value is clamped and therefore steady. That is a second,
 * sneakier route to "it feels on/off", and widening the band makes it MORE
 * visible rather than less, because more of the band is now in the region where
 * a degree of noise maps to a change you can see.
 *
 * One pole, ~70ms, and deliberately light: this is a steering input, and
 * anything heavier trades the jitter for lag, which is the worse of the two.
 * Written frame-rate independent so it behaves the same at 30fps and at 120.
 */
const SMOOTH_TAU = 0.07;
function smooth(prev, next, dt) {
  if (prev === null || !isFinite(prev)) return next;
  return next + (prev - next) * Math.exp(-dt / SMOOTH_TAU);
}

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
    /* Scales both bands, from Options -> Tilt range. The DEADZONES deliberately
       do not scale: they exist to swallow a hand tremor, which is an absolute
       number of degrees and does not get bigger because you asked for a longer
       throw. */
    this.rangeMul = 1;
    this.quitHeld = false;
    this.dash = false;
    this.manual = 0;               // -1..1 from the fallback drive buttons
    this.portrait = true;
    this._held = new Map();        // pointerId -> button element
    /* Filtered copies of the two raw angles. Kept separate from `raw`/`rawTurn`
       so `calibrate()` still zeroes to the true reading and the filter is not
       fighting a neutral derived from its own output. Null means "not started",
       which makes the filter snap to the first sample instead of ramping up
       from a stale angle when a new round begins. */
    this.fRaw = null;
    this.fTurn = null;

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
      /* Restart the filter at the new neutral. Leaving it holding the old angle
         means the first fraction of a second after a recentre is a phantom
         input from wherever the phone used to be — which is exactly the moment
         the player is watching to see whether the recentre worked. */
      this.fRaw = this.raw;
      this.fTurn = this.rawTurn;
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
   * Advance the sensor filter. Call ONCE per frame, before `read()`.
   *
   * Filtering happens before the deadzone rather than after, because the other
   * order lets noise chatter across the deadzone edge — the input flicking
   * between zero and something several times a second, which feels like a loose
   * connection rather than like a control.
   *
   * @param {number} dt seconds since the last frame.
   */
  update(dt) {
    if (this.raw !== null) this.fRaw = smooth(this.fRaw, this.raw, dt);
    if (this.rawTurn !== null) this.fTurn = smooth(this.fTurn, this.rawTurn, dt);
  }

  /**
   * Movement for this frame, in the same camera-relative form `Input.readMove`
   * returns, so `Katamari.step` cannot tell the difference.
   *
   * Forward is -Z to match the keyboard (W does `z -= 1`). Tipping the top of
   * the phone away from you LOWERS beta, so forward thrust is
   * `neutral - beta` — get that sign backwards and the game drives itself into
   * your lap.
   *
   * `moveZ` is a THROTTLE, not a direction flag: `Katamari.step` scales its
   * speed cap by the magnitude. It did not always, which is what made every
   * angle past the deadzone feel identical — see the note there.
   *
   * PURE. Advancing the sensor filter lives in `update()` instead, and the
   * split is not tidiness: the first version filtered inside here, which made
   * reading the control mutate it. `test-mobile` inspects `read()` a dozen
   * times per assertion and would have been quietly winding the filter forward
   * every time, and any future debug overlay that sampled the input would have
   * changed the input by sampling it. A getter with a side effect on a
   * once-per-frame contract is a trap for whoever calls it twice.
   */
  read() {
    if (!this.enabled) return { moveX: 0, moveZ: 0, dash: false, pan: 0, turn: 0 };

    let t = 0;
    if (this.tiltLive && this.portrait) {
      t = curve(this.neutral - this.fRaw, DEADZONE, RANGE * this.rangeMul);
    } else if (!this.tiltLive) {
      t = this.manual;
    }
    this.thrust = t;

    /* Turning: roll the phone, or hold a button. Never both — with tilt
       steering on, the pan buttons are hidden, because two live inputs onto one
       axis means the buttons fight whatever your wrist happens to be doing. */
    let turn = this.pan;
    if (this.turnByTilt) {
      turn = curve(this.fTurn - this.neutralTurn, TURN_DEAD, TURN_RANGE * this.rangeMul);
    }
    return { moveX: 0, moveZ: -t, dash: this.dash, pan: this.pan, turn };
  }
}
