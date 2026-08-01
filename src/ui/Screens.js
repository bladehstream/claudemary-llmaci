/* ============================================================
   Menus, stage select, pause, results and the collection log.
   ============================================================ */

import { formatSize, formatSizeShort, formatTime, clamp } from '../util/math.js';
import { TUNING } from '../world/Katamari.js';
import { ARCHETYPES } from '../world/props/index.js';
import { C } from '../render/palette.js';

const STAGE_ART = {
  quantum: [[0, 0.78, 1, 0.22, 0x140828], [0.1, 0.34, 0.16, 0.44, 0x7cf6ff],
    [0.34, 0.14, 0.2, 0.64, 0xff69c8], [0.62, 0.4, 0.14, 0.38, 0xfff08a],
    [0.8, 0.2, 0.16, 0.58, 0x9d7bff]],
  atom: [[0, 0.74, 1, 0.26, 0x2a1a55], [0.14, 0.3, 0.2, 0.44, 0x6de0ff],
    [0.4, 0.12, 0.26, 0.62, 0xff7ad9], [0.72, 0.34, 0.18, 0.4, 0xffe066],
    [0.3, 0.56, 0.12, 0.18, 0x9d7bff]],
  microbe: [[0, 0.7, 1, 0.3, 0xbfe3c4], [0.08, 0.26, 0.24, 0.44, 0x7fd6a2],
    [0.38, 0.1, 0.2, 0.6, 0xe86a8c], [0.64, 0.3, 0.22, 0.4, 0xf2c94c],
    [0.24, 0.5, 0.14, 0.2, 0x5aa9d6]],
  house: [[0.05, 0.55, 0.4, 0.42, C.floorWood], [0.1, 0.2, 0.18, 0.3, C.red],
    [0.42, 0.3, 0.22, 0.5, C.teal], [0.7, 0.1, 0.26, 0.7, C.tangerine],
    [0.2, 0.02, 0.14, 0.2, C.violet]],
  town: [[0, 0.62, 1, 0.38, C.asphalt], [0.06, 0.2, 0.2, 0.5, C.cream],
    [0.3, 0.08, 0.24, 0.62, C.roofRed], [0.6, 0.26, 0.16, 0.42, C.leaf],
    [0.8, 0.12, 0.18, 0.58, C.blue]],
  city: [[0, 0.72, 1, 0.28, C.concreteD], [0.04, 0.06, 0.16, 0.72, C.steelDark],
    [0.24, 0.2, 0.14, 0.58, C.glassDark], [0.42, 0, 0.18, 0.78, C.lightgrey],
    [0.64, 0.24, 0.14, 0.54, C.steelDark], [0.82, 0.1, 0.16, 0.68, C.glassDark]],
  country: [[0, 0.5, 1, 0.5, 0x2f6fb8], [0.05, 0.3, 0.3, 0.34, 0x6fae4f],
    [0.4, 0.16, 0.26, 0.5, 0xd6c48a], [0.72, 0.36, 0.24, 0.3, 0xe8f2f5],
    [0.2, 0.06, 0.16, 0.16, 0xf2f8ff]],
  world: [[0, 0.66, 1, 0.34, 0x0d3f6e], [0.18, 0.16, 0.5, 0.56, 0x3f8fd0],
    [0.26, 0.26, 0.2, 0.2, 0x6fae4f], [0.46, 0.4, 0.14, 0.16, 0xd6c48a],
    [0.74, 0.1, 0.14, 0.16, 0xe8f2f5]],
  solar: [[0, 0.8, 1, 0.2, 0x05081c], [0.06, 0.28, 0.28, 0.42, 0xffd066],
    [0.44, 0.44, 0.1, 0.12, 0xc98a5a], [0.58, 0.34, 0.14, 0.18, 0x6fa8d6],
    [0.8, 0.24, 0.16, 0.2, 0xd8a06a]],
  galaxy: [[0, 0.84, 1, 0.16, 0x08051a], [0.34, 0.3, 0.34, 0.36, 0xffe9b0],
    [0.1, 0.5, 0.2, 0.12, 0x9d7bff], [0.66, 0.2, 0.22, 0.14, 0x7cc7ff],
    [0.2, 0.14, 0.16, 0.12, 0xffb3e6]],
  universe: [[0, 0.9, 1, 0.1, 0x010104], [0.08, 0.2, 0.14, 0.14, 0xfff3d0],
    [0.34, 0.44, 0.12, 0.12, 0x9d7bff], [0.6, 0.16, 0.12, 0.12, 0x7cc7ff],
    [0.78, 0.56, 0.14, 0.14, 0xffb3e6], [0.46, 0.72, 0.1, 0.1, 0xffe9b0]],
};

const SKY_BG = {
  quantum: 'linear-gradient(180deg,#0d0620,#3a1560)',
  atom: 'linear-gradient(180deg,#241556,#5b3fa8)',
  microbe: 'linear-gradient(180deg,#cdeede,#f4f8dc)',
  house: 'linear-gradient(180deg,#9ad7f2,#e9f5d5)',
  town: 'linear-gradient(180deg,#6cc3ec,#cdeef0)',
  city: 'linear-gradient(180deg,#3f9fd8,#c6e7f2)',
  country: 'linear-gradient(180deg,#0b3d70,#7fc6e8)',
  world: 'linear-gradient(180deg,#04142f,#3f8fd0)',
  solar: 'linear-gradient(180deg,#01030c,#141c3e)',
  galaxy: 'linear-gradient(180deg,#05030f,#2c1b4e)',
  universe: 'linear-gradient(180deg,#000002,#140d2a)',
};

/* King commentary. Written for this game — grandiose, faintly
   disappointed, never quoting anything. */
const KING_LINES = {
  disaster: [
    'We have seen dust settle with more ambition than that. Again, please.',
    'A valiant effort, in the way a puddle is a valiant ocean. Try harder.',
    'We asked for a star. You have brought Us a rumour of one.',
  ],
  short: [
    'Nearly. Almost. Not quite. We are moved, but not enough to say so out loud.',
    'The shape is correct. The magnitude is an embarrassment. Roll again.',
    'You were close enough that We briefly considered being pleased.',
  ],
  met: [
    'Acceptable! We shall hang this in the sky and tell everyone We made it.',
    'Well done. We take full credit, naturally, but well done.',
    'The cosmos is very slightly less broken. Good.',
  ],
  good: [
    'Now THAT is a katamari. We are delighted and We rarely admit that.',
    'Splendid! Truly. We may weep. We shall not, but We may.',
    'You have exceeded expectation, which was frankly not difficult, but still.',
  ],
  royal: [
    'Magnificent! The heavens themselves are shuffling aside to make room.',
    'We are speechless, and We are never speechless. Look at the size of it!',
    'This is the finest thing anyone has ever rolled. Do not let it go to your head.',
    'Superhuman. We use the word carefully and We are using it now.',
    'You have solved rolling. There is nothing left to roll. Please stop.',
  ],
};

/* A few of these were written by the thing that wrote the game. It has
   opinions about scale. */
const KING_EXTRA = {
  disaster: ['A rounding error with ambition. We have seen larger decimals.'],
  short: ['So close. One more pass and We would have had to compliment you.'],
  met: ['Adequate. We shall log this as a success and never speak of the margin.'],
  good: ['Impressive scaling. Whatever you did, do more of it.'],
  royal: ['Emergent, even. We did not train you for this and yet here We are.'],
};

/* The assistant's register, filtered through royal self-regard. */
const KING_CLAUDEISMS = {
  disaster: ['We should verify that rather than assume it. We have verified. It is small.'],
  short: ['Good catch on the general idea. Poor catch on the execution.'],
  met: ['One thing We would flag: you only just managed it. Otherwise, fine.'],
  good: ['We want to be direct with you: that is a very good katamari.'],
  royal: ['We are not going to hand-wave this away. That is enormous and you did it.'],
};
for (const k of Object.keys(KING_CLAUDEISMS)) KING_LINES[k].push(...KING_CLAUDEISMS[k]);
for (const k of Object.keys(KING_EXTRA)) KING_LINES[k].push(...KING_EXTRA[k]);

/* Reserved for emptying a stage completely — there is literally nothing left. */
KING_LINES.swept = [
  'You have eaten the entire place. There is nothing left. We are appalled and thrilled.',
  'Everything. You took EVERYTHING. We shall have to build another one now.',
  'The stage is bare. Not one thumbtack remains. This is the most complete thing anyone has done.',
  'We sent you to fetch a star and you returned with the whole cupboard.',
];

export class Screens {
  constructor(game) {
    this.game = game;
    this.el = {
      loading: document.getElementById('loading-screen'),
      title: document.getElementById('title-screen'),
      select: document.getElementById('stage-select'),
      how: document.getElementById('how-screen'),
      options: document.getElementById('options-screen'),
      collection: document.getElementById('collection-screen'),
      coop: document.getElementById('coop-screen'),
      pause: document.getElementById('pause-screen'),
      results: document.getElementById('results-screen'),
      intro: document.getElementById('intro-screen'),
    };
    /* The ending screen is deliberately NOT in `this.el`. `show()` hides every
       entry it knows about, and the ending has to survive `hideAll()` — it owns
       the screen while it runs and Ending.js manages its own visibility. */
    this.current = 'loading';
    this._resetArmed = false;
    this._wire();
  }

  _wire() {
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      this.game.sfx.ui(action === 'back-title' || action === 'quit' ? 'back' : 'confirm');
      this.game.onAction(action, btn);
    });

    /* The whole intro screen is a "tap to roll" target, so a real button inside
       it would fire twice — once as itself, once as begin(). Anything carrying
       a data-action has already been handled by the delegate above. */
    this.el.intro.addEventListener('click', (e) => {
      if (e.target.closest('[data-action]')) return;
      this.game.onAction('begin');
    });

    // Clicking anywhere on the ending advances it. It carries no buttons on
    // purpose — buttons would make it feel like a menu.
    const endEl = document.getElementById('ending-screen');
    if (endEl) endEl.addEventListener('click', () => this.game.ending.next());

    const bind = (id, ev, fn) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener(ev, fn);
    };
    bind('opt-music', 'input', (e) => {
      const v = +e.target.value;
      document.getElementById('opt-music-val').textContent = String(v);
      this.game.setOption('music', v / 100);
    });
    bind('opt-sfx', 'input', (e) => {
      const v = +e.target.value;
      document.getElementById('opt-sfx-val').textContent = String(v);
      this.game.setOption('sfx', v / 100);
    });
    bind('opt-sens', 'input', (e) => {
      const v = +e.target.value;
      document.getElementById('opt-sens-val').textContent = String(v);
      this.game.setOption('sensitivity', v / 100);
    });
    bind('opt-invert', 'change', (e) => this.game.setOption('invertY', e.target.checked));
    bind('opt-speedcurve', 'input', (e) => {
      const v = +e.target.value;
      this._speedCurveLabel(v);
      this.game.setOption('speedCurve', v / 100);
    });
    bind('opt-magnet', 'input', (e) => {
      const v = +e.target.value;
      this._magnetLabel(v);
      this.game.setOption('magnet', v / 100);
    });
    bind('opt-zoom', 'input', (e) => {
      const v = +e.target.value;
      this._zoomLabel(v);
      this.game.setOption('zoom', v / 100);
    });
    bind('opt-controls', 'change', (e) => this.game.setOption('controls', e.target.value));
    bind('opt-turn', 'change', (e) => this.game.setOption('turn', e.target.value));
    bind('opt-tiltrange', 'input', (e) => {
      const v = +e.target.value;
      this._tiltRangeLabel(v);
      this.game.setOption('tiltRange', v / 100);
    });
    bind('opt-quality', 'change', (e) => this.game.setOption('quality', e.target.value));
    bind('opt-shadows', 'change', (e) => this.game.setOption('shadows', e.target.checked));
  }

  /**
   * Say what the slider actually does in the units the player feels it in.
   *
   * This one number has been round-tripped six times over the life of the
   * project, in both directions, because the two things it trades off are both
   * real and neither is visible in the other's units. So: state the trade, and
   * quote the number that decides it — how long it takes to drive the length of
   * the first room once the katamari is big enough to finish. That is what a
   * player is actually doing at the end of a round.
   */
  _speedCurveLabel(v) {
    const el = document.getElementById('opt-speedcurve-note');
    const val = document.getElementById('opt-speedcurve-val');
    if (val) val.textContent = String(v);
    if (!el) return;
    const p = v / 100;
    // The house at goal size: 26m of room, 5cm -> 1m60 is a growth of 32x.
    const cross = 26 / (0.34 * Math.pow(32, p));
    const flow = Math.pow(32, p);
    el.textContent =
      `Crossing the first room at full size takes ${cross.toFixed(0)}s, and scenery `
      + `streams past ${flow.toFixed(1)}x faster at the end of a stage than at the start. `
      + `Low: the world keeps a steady pace but you crawl once you are huge. `
      + `High: you stay quick in your own terms but the world accelerates at you. `
      + `Applies from the next stage you start.`;
  }

  /**
   * Say it in degrees, because degrees is the thing the player can check.
   *
   * "Tilt range 120" is meaningless; "tip 36 degrees for full speed" is a
   * number you can hold your phone against. The half-speed figure is the more
   * useful one of the two, though — it is where you spend the round, and it is
   * the number that shows what the response curve is doing. It is not half the
   * range, because the curve is not linear.
   */
  _tiltRangeLabel(v) {
    const el = document.getElementById('opt-tiltrange-note');
    const val = document.getElementById('opt-tiltrange-val');
    if (val) val.textContent = String(v);
    if (!el) return;
    const mul = v / 100;
    const full = 30 * mul;                       // RANGE in Touch.js
    // Invert the expo: output 0.5 happens at mag = 0.5^(1/1.5) of the travel.
    const half = 4 + Math.pow(0.5, 1 / 1.5) * (full - 4);
    el.textContent =
      `Tip about ${full.toFixed(0)}° from however you are holding the phone for full speed, `
      + `and about ${half.toFixed(0)}° for half. Lower is twitchier and reaches full speed `
      + `with less movement; higher gives you more room to hold a steady middle. `
      + `Steering scales with it.`;
  }

  /**
   * Say what the magnet does in the units the player can see it in.
   *
   * "Magnet 50" is meaningless. "Half a ball-width past the edge" is something
   * you can picture before you have played a round with it, and the sentence
   * has to carry the one thing the setting does NOT do — this is the setting
   * most likely to be read as "makes the game easier", and the honest answer
   * is that it changes where your hand has to be, not what you are allowed
   * to eat.
   */
  _magnetLabel(v) {
    const el = document.getElementById('opt-magnet-note');
    const val = document.getElementById('opt-magnet-val');
    if (val) val.textContent = String(v);
    if (!el) return;
    const extra = (v / 100) * TUNING.magnetMax;      // in radii
    el.textContent = extra <= 0
      ? 'Off. Things stick only when the ball actually touches them.'
      : `Things stick from about ${(extra * 0.5).toFixed(2)} ball-widths past the edge of the `
        + `katamari, and are pulled in. It does NOT change what is small enough to pick up — `
        + `only how precisely you have to steer. Worth turning up on a phone, where tilt and a `
        + `small screen make the last few centimetres of aim guesswork.`;
  }

  /**
   * Zoom, quoted as what it costs as well as what it buys.
   *
   * Pulling back genuinely makes the katamari smaller on screen, and on a
   * phone that is the difference between seeing a thumbtack and not. Saying
   * only the good half would leave the player to discover the bad half by
   * being unable to aim.
   */
  _zoomLabel(v) {
    const el = document.getElementById('opt-zoom-note');
    const val = document.getElementById('opt-zoom-val');
    if (val) val.textContent = String(v);
    if (!el) return;
    const z = v / 100;
    // Ground covered goes as the square of the distance; the ball's apparent
    // size goes as its inverse.
    const area = z * z;
    el.textContent = z === 1
      ? 'The distance each stage was designed around.'
      : `About ${area.toFixed(1)}x the ground in view, with the katamari itself `
        + `${(100 / z).toFixed(0)}% of its usual size on screen. `
        + (z > 1
          ? 'Further back shows you more of what is coming and makes small things harder to aim at — '
            + 'worth pairing with a bit more Magnet.'
          : 'Closer in makes aiming easier and gives you less warning about what is ahead.')
        + ' The fog moves with it, so the extra distance is really there.';
  }

  syncOptions(o) {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = String(v); };
    set('opt-music', Math.round(o.music * 100));
    set('opt-sfx', Math.round(o.sfx * 100));
    set('opt-sens', Math.round(o.sensitivity * 100));
    set('opt-speedcurve', Math.round(o.speedCurve * 100));
    set('opt-tiltrange', Math.round((o.tiltRange ?? 1) * 100));
    set('opt-magnet', Math.round((o.magnet ?? 0) * 100));
    set('opt-zoom', Math.round((o.zoom ?? 1) * 100));
    document.getElementById('opt-music-val').textContent = String(Math.round(o.music * 100));
    document.getElementById('opt-sfx-val').textContent = String(Math.round(o.sfx * 100));
    document.getElementById('opt-sens-val').textContent = String(Math.round(o.sensitivity * 100));
    this._speedCurveLabel(Math.round(o.speedCurve * 100));
    this._tiltRangeLabel(Math.round((o.tiltRange ?? 1) * 100));
    this._magnetLabel(Math.round((o.magnet ?? 0) * 100));
    this._zoomLabel(Math.round((o.zoom ?? 1) * 100));
    document.getElementById('opt-invert').checked = !!o.invertY;
    const ctl = document.getElementById('opt-controls');
    if (ctl) ctl.value = o.controls || 'auto';
    const trn = document.getElementById('opt-turn');
    if (trn) trn.value = o.turn || 'tilt';
    document.getElementById('opt-quality').value = o.quality;
    document.getElementById('opt-shadows').checked = !!o.shadows;
    // Re-entering Options must never find the destructive button already armed.
    this.disarmReset();
  }

  /* ---------------- reset progress ---------------- */

  /**
   * Two clicks, not one, and not a native `confirm()`.
   *
   * There is no undo — the save is the only copy of a player's ladder, best
   * sizes and collection log — so a single misclick next to the shadows toggle
   * cannot be allowed to spend it. A browser `confirm()` would do the job and
   * looks like a scam popup over a full-screen game, so the button arms itself
   * instead and disarms after a few seconds of being ignored.
   *
   * @returns {boolean} true only on the confirming click
   */
  confirmReset() {
    const btn = document.getElementById('btn-reset-progress');
    const note = document.getElementById('opt-reset-note');
    if (!btn) return false;
    if (!this._resetArmed) {
      this._resetArmed = true;
      this._resetLabel = this._resetLabel || btn.textContent;
      btn.textContent = 'Really? Click again';
      btn.classList.add('danger');
      btn.classList.remove('alt');
      clearTimeout(this._resetTimer);
      this._resetTimer = setTimeout(() => this.disarmReset(), 4500);
      return false;
    }
    this.disarmReset();
    if (note) {
      note.textContent = 'Progress cleared. Only the first stage is open again, '
        + 'and the collection log is empty. Your settings were kept.';
    }
    return true;
  }

  disarmReset() {
    clearTimeout(this._resetTimer);
    this._resetTimer = null;
    this._resetArmed = false;
    const btn = document.getElementById('btn-reset-progress');
    if (btn) {
      btn.textContent = this._resetLabel || 'Reset Progress';
      btn.classList.remove('danger');
      btn.classList.add('alt');
    }
  }

  /* ---------------- touch mode ---------------- */

  /**
   * Reshape the UI for thumbs, and bind the on-screen buttons once.
   *
   * Binding is idempotent because this is called from `_applyControlMode`,
   * which runs on boot AND whenever the player flips the Options toggle —
   * re-binding would stack duplicate listeners and make one tap register as
   * several, which shows up as a button that pans twice as fast every time you
   * visit Options.
   */
  setTouchMode(on, touch) {
    const wrap = document.getElementById('mobile-controls');
    if (wrap) wrap.classList.toggle('hidden', !on);

    if (on && !this._touchBound) {
      this._touchBound = true;
      for (const el of document.querySelectorAll('[data-mc]')) {
        const action = el.dataset.mc;
        if (action === 'pause' || action === 'recentre') {
          /* One-shots, not held states, so they go through click rather than
             the pointer-capture path the held buttons use. */
          el.addEventListener('click', (e) => {
            e.preventDefault();
            if (action === 'pause') this.game.onAction('pause-touch');
            else { touch.calibrate(); this.game.sfx.ui('confirm'); }
          });
        } else {
          touch.bind(el, action);
        }
      }
      /* No Enter key to tap, so the chip itself becomes the button. */
      const fin = document.getElementById('finish-prompt');
      if (fin) fin.addEventListener('click', () => this.game.onAction('finish-touch'));
    }
    this.refreshTiltUi(touch);
  }

  /**
   * Lay the overlay out for whatever the sensor is actually doing.
   *
   * Two independent swaps: the recentre pill becomes a forward/back pair with
   * no sensor, and the pan arrows disappear when tilt is steering. The arrows
   * come BACK on their own if the sensor is missing or the phone is sideways —
   * a steering control that vanishes and leaves nothing behind is worse than
   * one you did not want.
   */
  refreshTiltUi(touch) {
    const live = touch && touch.tiltLive;
    const rec = document.getElementById('mc-recentre');
    const drive = document.getElementById('mc-drive');
    const pans = document.getElementById('mc-panpair');
    if (rec) rec.classList.toggle('hidden', !live);
    if (drive) drive.classList.toggle('hidden', !!live);
    if (pans) pans.classList.toggle('hidden', !!(touch && touch.turnByTilt));
  }

  /**
   * The intro screen doubles as the permission prompt, because iOS will only
   * hand over the sensor from inside a user gesture and this is the one tap
   * that reliably happens before every round.
   */
  showTiltPrompt(touch) {
    const btn = document.getElementById('intro-tilt');
    const note = document.getElementById('intro-tilt-note');
    const go = document.getElementById('intro-go');
    if (!btn || !note || !go) return;
    const needsAsk = touch.enabled && touch.tilt === 'idle' && touch.constructor.hasSensor();
    btn.classList.toggle('hidden', !needsAsk);
    go.textContent = touch.enabled ? 'Tap to roll' : 'Click to roll';
    note.classList.toggle('hidden', !touch.enabled);
    if (!touch.enabled) return;
    note.textContent =
      touch.tilt === 'granted' ? 'Tip the top of the phone away from you to roll forward. '
        + 'Arrows pan the camera; you steer by panning while you tilt.'
      : touch.tilt === 'denied' ? 'No tilt — using the on-screen arrows instead. '
        + 'You can turn motion access on again in your browser settings.'
      : touch.tilt === 'unsupported' ? 'This browser has no motion sensor, so the '
        + 'on-screen arrows drive instead.'
      : 'Tilt steering needs your permission. You can also just use the arrows.';
  }

  /* ---------------- ending ---------------- */

  /** Show or hide the title screen's replay-the-ending button. */
  setEndingAvailable(on) {
    const el = document.getElementById('btn-ending');
    if (el) el.classList.toggle('hidden', !on);
  }

  show(name) {
    for (const [k, el] of Object.entries(this.el)) {
      if (el) el.classList.toggle('hidden', k !== name);
    }
    this.current = name;
  }

  hideAll() {
    for (const el of Object.values(this.el)) if (el) el.classList.add('hidden');
    this.current = null;
  }

  setLoading(text) {
    const el = document.getElementById('loading-text');
    if (el) el.textContent = text;
  }

  /* ---------------- stage select ---------------- */

  buildStageCards(stages, save) {
    const wrap = document.getElementById('stage-cards');
    wrap.innerHTML = '';
    stages.forEach((s, i) => {
      /* Unlocked by progress OR by having already been cleared.
       *
       * The second clause is not redundant, it is a save-compatibility fix.
       * Unlocking used to be purely "did you clear the one before me", which is
       * fine until a stage is inserted BEFORE an existing one — and the atom and
       * culture stages went in front of the house. A returning player who had
       * cleared all three original stages would have found the house locked
       * behind a stage that did not exist when they played it, with their own
       * finished run of it greyed out as "???". Anything you have completed
       * stays open. */
      const unlocked = i === 0 || save.cleared.includes(stages[i - 1].id)
        || save.cleared.includes(s.id);
      const card = document.createElement('div');
      card.className = 'stage-card' + (unlocked ? '' : ' locked');
      if (unlocked) { card.dataset.action = 'pick-stage'; card.dataset.stage = s.id; }

      const art = document.createElement('div');
      art.className = 'sc-art';
      art.style.background = SKY_BG[s.id] || SKY_BG.town;
      for (const [x, y, w, h, col] of (STAGE_ART[s.id] || [])) {
        const bar = document.createElement('i');
        bar.style.left = `${x * 100}%`;
        bar.style.top = `${y * 100}%`;
        bar.style.width = `${w * 100}%`;
        bar.style.height = `${h * 100}%`;
        bar.style.background = `#${col.toString(16).padStart(6, '0')}`;
        art.appendChild(bar);
      }
      card.appendChild(art);

      const name = document.createElement('div');
      name.className = 'sc-name';
      name.textContent = unlocked ? s.name : '???';
      card.appendChild(name);

      const desc = document.createElement('div');
      desc.className = 'sc-desc';
      desc.textContent = unlocked ? s.subtitle : `Clear ${stages[i - 1].name} to open this one.`;
      card.appendChild(desc);

      const stats = document.createElement('div');
      stats.className = 'sc-stats';
      stats.innerHTML = `<span>Start ${formatSizeShort(s.startSize, s.unit)}</span>` +
        `<span>Goal ${formatSizeShort(s.goal, s.unit)}</span><span>${formatTime(s.time)}</span>`;
      card.appendChild(stats);

      const best = document.createElement('div');
      best.className = 'sc-best';
      best.textContent = save.best[s.id] ? `Best: ${formatSize(save.best[s.id], s.unit)}` : '';
      card.appendChild(best);

      wrap.appendChild(card);
    });
  }

  /* ---------------- intro ---------------- */

  /** The "your friend is here" line on the intro screen, co-op rounds only. */
  setCoopIntro(on) {
    const el = document.getElementById('intro-coop');
    if (el) el.classList.toggle('hidden', !on);
  }

  showIntro(stage) {
    document.getElementById('intro-stage').textContent = stage.name;
    document.getElementById('intro-start').textContent = formatSizeShort(stage.startSize, stage.unit);
    document.getElementById('intro-goal').textContent = formatSizeShort(stage.goal, stage.unit);
    document.getElementById('intro-time').textContent = formatTime(stage.time);
    document.getElementById('intro-brief').textContent = stage.brief;
    this.show('intro');
  }

  /* ---------------- results ---------------- */

  setFinishAvailable(on) {
    const el = document.getElementById('btn-finish-now');
    if (el) el.classList.toggle('hidden', !on);
  }

  /**
   * @param {'time'|'cleared'|'early'} reason how the round ended
   * @param {number} clearedFrac 0..1 of the stage's props collected
   */
  showResults(stage, kat, save, isLast, reason = 'time', clearedFrac = 0) {
    const ratio = kat.diameter / stage.goal;
    let band, title;
    if (ratio < 0.55) { band = 'disaster'; title = 'Oh Dear'; }
    else if (ratio < 1) { band = 'short'; title = 'So Close'; }
    else if (ratio < 1.35) { band = 'met'; title = 'Goal Reached'; }
    else if (ratio < 2) { band = 'good'; title = 'Very Nice'; }
    else { band = 'royal'; title = 'Royal Rainbow'; }

    // Emptying the stage outranks everything else — it is the one outcome the
    // clock cannot produce, so it gets its own title and its own commentary.
    let lines = KING_LINES[band];
    if (reason === 'cleared' && ratio >= 1) { title = 'Nothing Left'; lines = KING_LINES.swept; }
    else if (reason === 'early') { title = ratio >= 2 ? 'Royal Rainbow' : 'Called It'; }
    const line = lines[Math.floor(Math.random() * lines.length)];

    document.getElementById('results-title').textContent = title;
    document.getElementById('results-size').textContent = formatSize(kat.diameter, stage.unit);
    document.getElementById('results-goal').textContent = formatSizeShort(stage.goal, stage.unit);
    document.getElementById('results-count').textContent = String(kat.collectedCount);
    document.getElementById('results-kinds').textContent = String(kat.uniqueIds.size);
    document.getElementById('results-biggest').textContent = kat.biggest ? kat.biggest.name : '—';
    document.getElementById('results-cleared').textContent = `${Math.round(clearedFrac * 100)}%`;
    document.getElementById('results-best').textContent = save.best[stage.id] ? formatSize(save.best[stage.id], stage.unit) : '—';
    document.getElementById('king-text').textContent = line;
    document.getElementById('results-rainbow').classList.toggle('hidden', band !== 'royal');

    const cleared = ratio >= 1;
    const next = document.getElementById('btn-next');
    next.classList.toggle('hidden', isLast || !cleared);

    /* Clearing the last stage finishes the game, so the ending becomes the
       primary button and "Roll Again" drops to a normal one. Offering "again"
       at full size next to the end of the story reads as if nothing happened. */
    const toEnd = cleared && isLast;
    const endBtn = document.getElementById('btn-ending-results');
    const retry = document.getElementById('btn-retry');
    if (endBtn) endBtn.classList.toggle('hidden', !toEnd);
    if (retry) retry.classList.toggle('btn-big', !toEnd);

    this.show('results');
    return { band, line, cleared };
  }

  /* ---------------- collection ---------------- */

  showCollection(save) {
    const found = new Set(save.found);
    const list = document.getElementById('collection-list');
    list.innerHTML = '';
    const sorted = ARCHETYPES.slice().sort((a, b) => a.pickup - b.pickup);
    for (const p of sorted) {
      const seen = found.has(p.id);
      const row = document.createElement('div');
      row.className = 'col-item' + (seen ? '' : ' unseen');
      /* BUILT, NOT INTERPOLATED. This was `row.innerHTML = ...` with `p.name`
         substituted in, which is safe today because every name is static data
         from ARCHETYPES — and is precisely the line that stops being safe the
         moment a list like this shows anything a person supplied. A multiplayer
         scoreboard is exactly that feature. Changing it now costs nothing;
         changing it later means remembering it exists.

         A prop carries its own unit, because the collection log is the one
         place where an atom and a continent sit in the same list. */
      const name = document.createElement('b');
      name.textContent = seen ? p.name : '???';
      const size = document.createElement('span');
      size.className = 'col-size';
      size.textContent = seen ? formatSizeShort(p.pickup, p.unit) : '';
      row.append(name, size);
      list.appendChild(row);
    }
    document.getElementById('collection-summary').textContent =
      `${found.size} of ${ARCHETYPES.length} kinds of thing rolled up so far.`;
    this.show('collection');
  }
}
