/* ============================================================
   The score scheduler.

   Uses the standard look-ahead pattern: a timer wakes up every
   ~25ms and schedules any 16th notes that fall inside the next
   ~140ms, so timing comes from the audio clock rather than from
   rAF and never drifts.

   Arrangement is adaptive. `intensity` (driven by how close you
   are to the goal) fades layers in: drums and bass are always
   there, comping arrives early, the melody and scat come in as
   you grow, brass only once you are doing well. The last 30
   seconds shift into a faster, brighter "hurry" arrangement.
   ============================================================ */

import { mtof } from './AudioEngine.js';
import { SONGS, CHORDS, KITS, RESULTS_FANFARE } from './songs.js';
import { clamp } from '../util/math.js';

const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD = 0.14;

export class Music {
  constructor(engine) {
    this.engine = engine;
    this.song = null;
    this.playing = false;
    this.step = 0;
    this.nextTime = 0;
    this.timer = null;
    this.intensity = 0.55;
    this.hurrying = false;
    this._targetIntensity = 0.55;
    this.bar = 0;
  }

  play(songId) {
    const e = this.engine;
    if (!e.ready) return;
    const song = SONGS[songId];
    if (!song) return;
    if (this.song === song && this.playing) return;
    this.stop();
    this.song = song;
    this.step = 0;
    this.bar = 0;
    this.nextTime = e.now + 0.08;
    this.playing = true;
    this.timer = setInterval(() => this._tick(), LOOKAHEAD_MS);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.playing = false;
  }

  setIntensity(v) { this._targetIntensity = clamp(v, 0, 1); }
  setHurry(on) { this.hurrying = on; }

  get stepDuration() {
    const bpm = this.song.bpm * (this.hurrying ? 1.08 : 1);
    return 60 / bpm / 4;
  }

  _tick() {
    const e = this.engine;
    if (!e.ready || !this.playing) return;
    this.intensity += (this._targetIntensity - this.intensity) * 0.06;
    const horizon = e.now + SCHEDULE_AHEAD;
    let guard = 0;
    while (this.nextTime < horizon && guard++ < 64) {
      this._scheduleStep(this.step, this.nextTime);
      this.nextTime += this.stepDuration;
      this.step = (this.step + 1) % (this.song.bars * 16);
    }
  }

  _chordAt(step) {
    const bar = Math.floor(step / 16) % this.song.prog.length;
    return this.song.prog[bar];
  }

  /** Build a close voicing above `low` for a chord. */
  _voicing(root, type, low = 60, max = 5) {
    const ivs = CHORDS[type] || CHORDS.maj7;
    const out = [];
    for (let i = 0; i < Math.min(max, ivs.length); i++) {
      let n = root + ivs[i];
      while (n < low) n += 12;
      while (n > low + 16) n -= 12;
      out.push(n);
    }
    return out;
  }

  _scheduleStep(step, t) {
    const e = this.engine;
    const s = this.song;
    const kit = KITS[s.kit];
    const inten = this.intensity;
    const g = step % 32;
    const bar = Math.floor(step / 16);
    const jitter = (Math.random() - 0.5) * 0.006;
    t += jitter;

    /* ---------------- drums ---------------- */
    if (kit.kick[g]) e.kick(t, kit.kick[g] * 0.62);
    if (kit.rim[g]) e.rim(t, kit.rim[g] * 0.3);
    if (kit.snare && kit.snare[g]) e.snare(t, kit.snare[g] * 0.3);
    if (kit.shaker[g] && inten > 0.12) e.shaker(t, kit.shaker[g] * (0.7 + inten * 0.5));
    if (kit.hat[g] && inten > 0.3) e.hat(t, kit.hat[g] * (0.6 + inten * 0.6), false);
    if (kit.tom && kit.tom[g] && inten > 0.6) e.tom(t, 200, kit.tom[g] * 0.5);
    if (this.hurrying && step % 2 === 0) e.hat(t, 0.055, false);

    /* ---------------- bass ---------------- */
    const [root, type] = this._chordAt(step);
    const inBar = step % 16;
    const bassRoot = root + s.bassOct;
    const fifth = bassRoot + 7;
    if (inBar === 0) e.bass(t, mtof(bassRoot), this.stepDuration * 5.5, 0.44);
    else if (inBar === 6) e.bass(t, mtof(fifth), this.stepDuration * 3.5, 0.34);
    else if (inBar === 10 && inten > 0.5) e.bass(t, mtof(bassRoot), this.stepDuration * 2.5, 0.24);
    else if (inBar === 14 && inten > 0.72) {
      // approach note into the next bar
      const nxt = this.song.prog[(bar + 1) % this.song.prog.length][0] + s.bassOct;
      e.bass(t, mtof(nxt - 1), this.stepDuration * 1.6, 0.22);
    }

    /* ---------------- comping ---------------- */
    if (inten > 0.2) {
      const compSteps = s.kit === 'samba' ? [3, 6, 11, 14] : s.kit === 'drive' ? [4, 10] : [3, 6, 10, 14];
      if (compSteps.includes(inBar)) {
        const notes = this._voicing(root, type, 58, 4);
        const amp = 0.11 * (0.5 + inten * 0.7) * (inBar === 3 ? 1.1 : 0.85);
        notes.forEach((n, i) => e.pluck(t + i * 0.004, mtof(n), this.stepDuration * 3.4, amp));
      }
    }

    /* ---------------- melody ---------------- */
    if (inten > 0.34 && s.melody) {
      for (const [ms, note, dur] of s.melody) {
        if (ms === step) {
          e.vibe(t, mtof(note), this.stepDuration * dur * 0.95, 0.2 + inten * 0.14);
          if (inten > 0.55) e.vibe(t + 0.012, mtof(note + 12), this.stepDuration * dur * 0.5, 0.05);
        }
      }
    }

    /* ---------------- scat voice ---------------- */
    if (inten > 0.6 && s.scat) {
      for (const [ms, note, dur, vowel] of s.scat) {
        if (ms === step) e.scat(t, mtof(note - 12), this.stepDuration * dur * 0.9, 0.1 + inten * 0.07, vowel);
      }
    }

    /* ---------------- brass ---------------- */
    if ((inten > 0.78 || this.hurrying) && s.brass) {
      for (const [ms, notes, dur] of s.brass) {
        if (ms === step) {
          notes.forEach((n, i) => e.brass(t + i * 0.003, mtof(n), this.stepDuration * dur * 0.9, 0.09));
        }
      }
    }
  }

  /** One-shot flourish for the results screen. */
  fanfare() {
    const e = this.engine;
    if (!e.ready) return;
    const t0 = e.now + 0.05;
    for (const [off, notes, dur] of RESULTS_FANFARE) {
      notes.forEach((n, i) => {
        e.brass(t0 + off + i * 0.004, mtof(n), dur, 0.13);
        e.vibe(t0 + off, mtof(n + 12), dur * 1.3, 0.1);
      });
    }
    e.kick(t0, 0.7); e.kick(t0 + 0.16, 0.6); e.kick(t0 + 0.32, 0.8);
    e.snare(t0 + 0.86, 0.4);
  }

  /** A short rising figure when the katamari crosses a size milestone. */
  sizeUpSting(level) {
    const e = this.engine;
    if (!e.ready) return;
    const t0 = e.now + 0.02;
    const base = 72 + (level % 4) * 2;
    [0, 4, 7, 12].forEach((iv, i) => {
      e.vibe(t0 + i * 0.055, mtof(base + iv), 0.42, 0.2);
    });
  }
}
