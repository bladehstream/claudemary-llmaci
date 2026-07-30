/* ============================================================
   Sound effects — all synthesised, all reactive to the size of
   the katamari. A 5cm ball ticks and clicks; a 150m one grinds
   and booms. Same code, different parameters.
   ============================================================ */

import { mtof } from './AudioEngine.js';
import { clamp, lerp } from '../util/math.js';

export class Sfx {
  constructor(engine) {
    this.e = engine;
    this.rollStarted = false;
    this.lastPickup = 0;
    this.pickupStack = 0;
  }

  /** Persistent rolling texture. Started once, then parameterised. */
  startRoll() {
    const e = this.e;
    if (!e.ready || this.rollStarted) return;
    const ctx = e.ctx;

    // grinding band
    this.rollSrc = e.noiseSource(1);
    this.rollFilter = ctx.createBiquadFilter();
    this.rollFilter.type = 'bandpass';
    this.rollFilter.frequency.value = 500;
    this.rollFilter.Q.value = 0.7;
    this.rollGain = ctx.createGain();
    this.rollGain.gain.value = 0;
    /* A HARD GATE IN FRONT OF THE WHOLE ROLLING VOICE.
     *
     * The noise source and the rumble oscillator are started once and run for
     * the lifetime of the page — that is the right design for a continuous
     * texture, but it means the ONLY thing keeping them quiet is a gain, and a
     * gain that is only written while a round is in progress keeps whatever it
     * last held. Quit to the title mid-roll and the hiss stayed at full level
     * forever: "there is a persistent background hiss/thrumming embedded in the
     * sound effects track even when not playing a round". Pausing was no better
     * — it called `updateRoll` with grounded=false, which used to target a
     * deliberate non-zero floor and so parked a permanent bandpassed hiss at
     * around 500Hz.
     *
     * So the level and the on/off are now separate jobs. `updateRoll` shapes the
     * texture; `setRolling` decides whether any of it is audible, and the game
     * calls it on every state change. Zero here is a real zero. */
    this.rollBus = ctx.createGain();
    this.rollBus.gain.value = 0;
    this.rollSrc.connect(this.rollFilter);
    this.rollFilter.connect(this.rollGain);
    this.rollGain.connect(this.rollBus);
    this.rollBus.connect(e.sfx);
    this.rollSrc.start();

    // low body that only shows up when the ball is huge
    this.rumble = ctx.createOscillator();
    this.rumble.type = 'sawtooth';
    this.rumble.frequency.value = 48;
    this.rumbleFilter = ctx.createBiquadFilter();
    this.rumbleFilter.type = 'lowpass';
    this.rumbleFilter.frequency.value = 160;
    this.rumbleGain = ctx.createGain();
    this.rumbleGain.gain.value = 0;
    this.rumble.connect(this.rumbleFilter);
    this.rumbleFilter.connect(this.rumbleGain);
    this.rumbleGain.connect(this.rollBus);   // gated with the hiss, not separately
    this.rumble.start();

    this.rollStarted = true;
  }

  /**
   * Is the katamari rolling at all? Called on every game state change, not per
   * frame. Ramped rather than switched so it does not click, and hard-zeroed
   * afterwards so "off" is silence rather than an exponential tail.
   */
  setRolling(on) {
    if (!this.rollStarted) return;
    const t = this.e.now;
    this.rollBus.gain.cancelScheduledValues(t);
    if (on) {
      this.rollBus.gain.setTargetAtTime(1, t, 0.05);
    } else {
      this.rollBus.gain.setTargetAtTime(0, t, 0.04);
      this.rollBus.gain.setValueAtTime(0, t + 0.25);
    }
  }

  stopRoll() {
    if (!this.rollStarted) return;
    try { this.rollSrc.stop(); this.rumble.stop(); } catch { /* already stopped */ }
    this.rollStarted = false;
  }

  /**
   * @param {number} speedFrac 0..1.6 of top speed
   * @param {number} diameter metres
   * @param {boolean} grounded
   */
  updateRoll(speedFrac, diameter, grounded, lumpy) {
    if (!this.rollStarted) return;
    const t = this.e.now;
    const v = clamp(speedFrac, 0, 1.4);
    // Bigger ball -> lower, broader grind.
    const centre = lerp(1500, 120, clamp(Math.log10(Math.max(0.02, diameter)) / 2.6 + 0.55, 0, 1));
    this.rollFilter.frequency.setTargetAtTime(centre * (0.7 + v * 0.7), t, 0.08);
    this.rollFilter.Q.setTargetAtTime(0.6 + lumpy * 1.6, t, 0.1);
    /* HALVED from 0.14, by request: "that hissing sound (like loud sand falling)
     * is very distracting". Only this band moved — the rumble below and every
     * one-shot are untouched, because the note said everything else was fine.
     *
     * Worth knowing before putting it back up: this is the only voice in the
     * game that is ON CONTINUOUSLY. Every other effect is a transient the ear
     * forgives, so a level that reads as balanced next to them is still too loud
     * after six minutes of holding W. Judge it against the music across a whole
     * round, never against the other effects one at a time. */
    this.rollGain.gain.setTargetAtTime(grounded ? v * 0.07 : 0, t, 0.06);

    const rf = clamp(70 - Math.log10(Math.max(0.05, diameter)) * 16, 26, 80);
    this.rumble.frequency.setTargetAtTime(rf, t, 0.2);
    this.rumbleGain.gain.setTargetAtTime(
      grounded ? clamp((diameter - 0.6) / 40, 0, 1) * v * 0.1 : 0, t, 0.1);
  }

  /**
   * The pickup "plip". Pitch tracks how big the object was relative
   * to the ball, so a whole building lands with a satisfying thud
   * while a thumbtack just ticks.
   */
  pickup(relSize, absSize) {
    const e = this.e;
    if (!e.ready) return;
    const now = e.now;
    // rapid-fire pickups stack into a little arpeggio instead of a mush
    if (now - this.lastPickup < 0.09) this.pickupStack = Math.min(6, this.pickupStack + 1);
    else this.pickupStack = 0;
    this.lastPickup = now;

    const t = now + 0.005;
    const r = clamp(relSize, 0, 1);
    const base = lerp(86, 46, Math.pow(r, 0.6)) + this.pickupStack * 1.2;
    const freq = mtof(base);
    const dur = lerp(0.07, 0.3, r);

    const ctx = e.ctx;
    const o = ctx.createOscillator();
    o.type = r > 0.45 ? 'triangle' : 'sine';
    o.frequency.setValueAtTime(freq * 1.5, t);
    o.frequency.exponentialRampToValueAtTime(freq, t + 0.03);
    const g = ctx.createGain();
    const amp = lerp(0.1, 0.34, r);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(amp, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(e.sfx);
    o.start(t); o.stop(t + dur + 0.02);

    // crunchy transient — more of it for bigger objects
    const n = e.noiseSource(1 + r);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = lerp(4200, 700, r);
    bp.Q.value = 1.2;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(lerp(0.05, 0.22, r), t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + lerp(0.04, 0.16, r));
    n.connect(bp); bp.connect(ng); ng.connect(e.sfx);
    n.start(t); n.stop(t + 0.24);

    if (r > 0.55) {
      const th = ctx.createOscillator();
      th.type = 'sine';
      th.frequency.setValueAtTime(110, t);
      th.frequency.exponentialRampToValueAtTime(42, t + 0.18);
      const tg = ctx.createGain();
      tg.gain.setValueAtTime(0.3 * r, t);
      tg.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      th.connect(tg); tg.connect(e.sfx);
      th.start(t); th.stop(t + 0.32);
    }
  }

  /** Bumping into something you cannot eat yet. */
  bump(impact, diameter) {
    const e = this.e;
    if (!e.ready) return;
    const ctx = e.ctx;
    const t = e.now + 0.004;
    const strength = clamp(impact, 0, 1.6);
    const f0 = clamp(220 - Math.log10(Math.max(0.05, diameter)) * 44, 55, 260);

    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(f0 * 1.7, t);
    o.frequency.exponentialRampToValueAtTime(f0 * 0.7, t + 0.14);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16 + strength * 0.22, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
    o.connect(g); g.connect(e.sfx);
    o.start(t); o.stop(t + 0.28);

    const n = e.noiseSource(0.8);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 1400;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.06 + strength * 0.12, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    n.connect(lp); lp.connect(ng); ng.connect(e.sfx);
    n.start(t); n.stop(t + 0.14);
  }

  /** Objects rattling off after a hard hit. */
  knock(count) {
    const e = this.e;
    if (!e.ready) return;
    const ctx = e.ctx;
    for (let i = 0; i < Math.min(count, 8); i++) {
      const t = e.now + 0.02 + i * (0.035 + Math.random() * 0.05);
      const o = ctx.createOscillator();
      o.type = 'square';
      const f = mtof(64 + Math.random() * 18);
      o.frequency.setValueAtTime(f, t);
      o.frequency.exponentialRampToValueAtTime(f * 0.6, t + 0.08);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.09, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
      o.connect(g); g.connect(e.sfx);
      o.start(t); o.stop(t + 0.12);
    }
  }

  /** Milestone chime when the readout ticks over a round number. */
  sizeUp(level) {
    const e = this.e;
    if (!e.ready) return;
    const t0 = e.now + 0.01;
    [0, 4, 7, 12, 16].forEach((iv, i) => {
      const t = t0 + i * 0.048;
      e.vibe(t, mtof(76 + iv + (level % 3)), 0.5, 0.16);
    });
  }

  /** Goal reached — a warm major triad. */
  goal() {
    const e = this.e;
    if (!e.ready) return;
    const t0 = e.now + 0.01;
    [65, 69, 72, 77].forEach((n, i) => {
      e.brass(t0 + i * 0.05, mtof(n), 0.7, 0.12);
      e.vibe(t0 + i * 0.05, mtof(n + 12), 0.9, 0.12);
    });
  }

  /** Ten-second countdown blip. */
  tick(urgent) {
    const e = this.e;
    if (!e.ready) return;
    const ctx = e.ctx;
    const t = e.now + 0.005;
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = urgent ? 1180 : 880;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.14, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
    o.connect(g); g.connect(e.sfx);
    o.start(t); o.stop(t + 0.14);
  }

  /** Whistle at time-up. */
  timeUp() {
    const e = this.e;
    if (!e.ready) return;
    const ctx = e.ctx;
    const t = e.now + 0.02;
    for (const [f, off] of [[1320, 0], [1760, 0.18], [880, 0.36]]) {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.setValueAtTime(f, t + off);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t + off);
      g.gain.exponentialRampToValueAtTime(0.16, t + off + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + off + 0.34);
      o.connect(g); g.connect(e.sfx);
      o.start(t + off); o.stop(t + off + 0.4);
    }
  }

  /* ---------------- interface ---------------- */

  ui(kind = 'move') {
    const e = this.e;
    if (!e.ready) return;
    const ctx = e.ctx;
    const t = e.now + 0.003;
    const f = kind === 'confirm' ? 660 : kind === 'back' ? 330 : 520;
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.setValueAtTime(f, t);
    if (kind === 'confirm') o.frequency.exponentialRampToValueAtTime(f * 1.5, t + 0.07);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.09, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    o.connect(g); g.connect(e.sfx);
    o.start(t); o.stop(t + 0.14);
  }

  /**
   * Nonsense royal chatter — pitched blips whose contour follows the
   * text, in the spirit of a talking-head voice that isn't language.
   */
  voice(text, pitch = 0) {
    const e = this.e;
    if (!e.ready) return;
    const ctx = e.ctx;
    const words = String(text).split(/\s+/).slice(0, 26);
    let t = e.now + 0.06;
    const vowels = [0, 3, 1, 4, 2];
    words.forEach((wRaw, wi) => {
      const w = wRaw.replace(/[^a-z]/gi, '');
      if (!w) return;
      const syl = clamp(Math.round(w.length / 2.6), 1, 3);
      for (let i = 0; i < syl; i++) {
        const code = w.charCodeAt(i % w.length) || 100;
        const note = 52 + pitch + (code % 7) + (wi % 3) * 2;
        const dur = 0.075 + (code % 4) * 0.014;
        e.scat(t, mtof(note), dur * 1.4, 0.12, vowels[(code + i) % vowels.length]);
        t += dur + 0.012;
      }
      t += 0.045;
    });
  }
}
