/* ============================================================
   The score scheduler.

   Uses the standard look-ahead pattern: a timer wakes up every
   ~25ms and schedules any 16th notes that fall inside the next
   ~140ms, so timing comes from the audio clock rather than from
   rAF and never drifts.

   Arrangement is adaptive in two directions. `intensity` (driven
   by how close you are to the goal) fades LAYERS in: drums and
   bass are always there, comping arrives early, the melody and
   scat come in as you grow, brass only once you are doing well.
   The last 30 seconds shift into a faster, brighter "hurry"
   arrangement. And `form.js` varies the TREATMENT of those layers
   bar by bar — fills, bass patterns, comping placements, what
   happens to the tune this time round.

   ⚠ `step` IS ABSOLUTE AND DOES NOT WRAP. It used to wrap at
   `song.bars * 16`, which made the score's period exactly equal
   to the loop's: 9.2s in the menu, heard 39 times a round, with
   6.2% of a round being new material. `form.js` needs to know
   which time round the tune this is, so the counter runs on and
   the wrapped position is derived where it is needed. Anything
   driving `_scheduleStep` from outside (`test-repetition`,
   `render-music`) must pass the ABSOLUTE step, or it measures a
   variation layer that never varies.
   ============================================================ */

import { mtof } from './AudioEngine.js';
import { SONGS, CHORDS, KITS, RESULTS_FANFARE } from './songs.js';
import { barPlan, songSeed, treatMelody } from './form.js';
import { clamp } from '../util/math.js';

const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD = 0.14;

/**
 * Level trim per voice, so a role can change instrument without changing the
 * mix. Measured against `vibe` at 1.0 — these are the ratios that made the
 * five tonal voices sit at the same perceived level in `voicelab`.
 */
const VOICE_GAIN = { vibe: 1, pluck: 0.62, brass: 0.78, scat: 0.58, bass: 1.5 };

/** What a song gets if it does not say. Exactly what every song did before. */
const DEFAULT_VOICES = { melody: 'vibe', comp: 'pluck', bass: 'bass', double: 'vibe' };

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
    /* Set from the song id in `play`. Two songs must never draw the same dice
       for the same bar index, or every stage takes its fills in unison. */
    this.seed = 0;
    this._seedFor = null;
    this._planBar = -1;
    this._plan = null;
    this._melCyc = -1;
    this._mel = [];
  }

  play(songId) {
    const e = this.engine;
    if (!e.ready) return;
    const song = SONGS[songId];
    if (!song) return;
    if (this.song === song && this.playing) return;
    this.stop();
    this.song = song;
    this.seed = songSeed(song.id);
    this._seedFor = song.id;
    e.space = song.space ?? 1;
    this.step = 0;
    this.bar = 0;
    this._planBar = -1;
    this._melCyc = -1;
    this.nextTime = e.now + 0.08;
    this.playing = true;
    this.timer = setInterval(() => this._tick(), LOOKAHEAD_MS);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.playing = false;
  }

  /**
   * @param {boolean} [snap] jump there instead of gliding.
   *
   * The glide is 6% of the remaining gap per 25ms tick, so a drop from a
   * finished stage's 1.0 to the menu's 0.35 takes about a second — a second in
   * which the menu plays the full stage arrangement. Snap when the CONTEXT
   * changes; glide when only the moment does.
   */
  setIntensity(v, snap = false) {
    this._targetIntensity = clamp(v, 0, 1);
    if (snap) this.intensity = this._targetIntensity;
  }
  setHurry(on) { this.hurrying = on; }

  get stepDuration() {
    const bpm = this.song.bpm * (this.hurrying ? 1.08 : 1);
    return 60 / bpm / 4;
  }

  _tick() {
    const e = this.engine;
    if (!e.ready || !this.playing) return;
    this.intensity += (this._targetIntensity - this.intensity) * 0.06;

    /* ⚠ NEVER SCHEDULE IN THE PAST. RESYNC INSTEAD OF CATCHING UP.
     *
     * This scheduler runs on a 25ms `setInterval` and walks `nextTime` forward
     * in step-sized increments. Browsers throttle timers in a hidden tab to
     * roughly one per second, while `AudioContext.currentTime` keeps running —
     * so a player who switches away for two minutes comes back to a `nextTime`
     * that is 120 SECONDS behind, about a thousand steps.
     *
     * Web Audio fires a source scheduled at a past timestamp immediately. So
     * the catch-up loop below, which is capped at 64 steps per tick, then dumps
     * 64 x ~8 voices of notes AT ONCE, every 25ms, until it closes the gap:
     * several thousand overlapping notes into a limiter. That is precisely
     * "the background music got crackly and then stopped entirely", and it
     * explains why starting a new round fixed it — `play()` resets `nextTime`
     * from the current clock.
     *
     * ⚠ AND THE MENU IS WHERE IT BITES, because the menu is the only place a
     * player leaves the game sitting while they do something else.
     *
     * Skipping ahead loses a few bars of a looping theme, which is
     * imperceptible. The alternative is not "hear those bars late" — it is
     * hear all of them simultaneously.
     */
    if (this.nextTime < e.now) {
      this.nextTime = e.now + 0.05;
      // Keep the bar boundary, so the resync lands on a downbeat rather than
      // halfway through a phrase.
      this.step = this.step - (this.step % 16);
    }

    const horizon = e.now + SCHEDULE_AHEAD;
    let guard = 0;
    while (this.nextTime < horizon && guard++ < 64) {
      /* ⚠ ONE BAD NOTE MUST NOT KILL THE SCHEDULER FOREVER.
       *
       * This runs inside a `setInterval`, so an exception escaping here aborts
       * the tick — and since `nextTime` is only advanced AFTER the schedule
       * call, the very next tick tries the same step, throws again, and the
       * music is dead for the rest of the session with the interval still
       * firing forty times a second.
       *
       * That is not hypothetical. Before the resync above existed, a drifted
       * `nextTime` could go negative in absolute terms, and `setValueAtTime`
       * rejects a negative time with a RangeError: measured, 60 of them in a
       * second and a half, one per tick, permanently. The player saw it as the
       * music going "crackly and then stopped entirely", recovering only when
       * a new round called `play()` and reset the clock.
       *
       * The resync makes that particular arithmetic impossible. This makes the
       * FAILURE MODE impossible, which is the more durable of the two: any
       * future slip in any of eleven voices costs one dropped note instead of
       * all remaining music. */
      try {
        this._scheduleStep(this.step, this.nextTime);
      } catch { /* drop the note, keep the transport */ }
      this.nextTime += this.stepDuration;
      /* ⚠ NOT `% (bars * 16)`. See the header — wrapping here is what made the
         piece's period equal to one loop of it. The wrapped position is derived
         inside `_scheduleStep`; this counter is how far into the piece we are,
         and `form.js` is a function of it. At 148bpm the longest stage reaches
         about 6,600 before the round ends, so nothing here needs a modulus for
         precision either. */
      this.step += 1;
    }
  }

  /** @param {number} pos position WITHIN the loop, not the absolute step. */
  _chordAt(pos) {
    const bar = Math.floor(pos / 16) % this.song.prog.length;
    return this.song.prog[bar];
  }

  /**
   * Play `name` — one of the engine's five tonal voices — as a role.
   *
   * ⚠ THIS IS WHY THE STAGES STOPPED SOUNDING ALIKE. Melody was hard-coded to
   * `vibe`, comping to `pluck` and the bass line to `bass` for all twelve
   * songs, so eleven stages spanning forty orders of magnitude were played by
   * the same trio. Which voice takes which role is now the song's decision,
   * and it is a bigger character change than any amount of new notes: the same
   * eight bars on a plucked guitar and on a wordless choir are not the same
   * music.
   *
   * ⚠ THE GAIN TABLE IS NOT DECORATION. These voices were tuned individually
   * and their natural levels differ by more than 2:1 — `vibe` sits at 0.3 and
   * `scat` at 0.16 for the same perceived loudness. Swapping a role to a new
   * voice without renormalising is how a melody change turns into a mix bug.
   */
  _play(name, t, freq, dur, gain, vowel = 0) {
    const e = this.engine;
    const g = gain * (VOICE_GAIN[name] ?? 1);
    switch (name) {
      case 'pluck': return e.pluck(t, freq, dur, g);
      case 'brass': return e.brass(t, freq, dur, g);
      case 'scat': return e.scat(t, freq, dur, g, vowel);
      case 'bass': return e.bass(t, freq, dur, g);
      case 'vibe': default: return e.vibe(t, freq, dur, g);
    }
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

  /**
   * @param {number} absStep steps since the music started. NOT wrapped — see
   *   the file header. The position within the loop is derived here.
   */
  _scheduleStep(absStep, t) {
    const e = this.engine;
    const s = this.song;
    const kit = KITS[s.kit];
    const inten = this.intensity;
    const loop = s.bars * 16;
    /* Double modulus: a driver is allowed to hand us a negative step and the
       loop position must stay a valid index either way. */
    const pos = ((absStep % loop) + loop) % loop;
    const g = pos % 32;
    const inBar = pos % 16;
    const bar = Math.floor(pos / 16);
    const absBar = Math.floor(absStep / 16);

    /* ⚠ ARM THE SEED HERE, NOT ONLY IN `play()`. Two harnesses drive this
       method with `music.song` assigned directly and never call `play`, and a
       seed left at 0 means every song draws the same dice for the same bar —
       twelve stages taking their fills in unison, which measures perfectly
       well and would sound absurd. Making it a property of the song rather
       than of how playback started removes the footgun from every future
       driver too. */
    if (this._seedFor !== s.id) {
      this._seedFor = s.id;
      this.seed = songSeed(s.id);
      this._planBar = -1;
      this._melCyc = -1;
      /* The room the song plays in. Set here rather than only in `play()` for
         the same reason as the seed: two harnesses assign `music.song`
         directly and never call it, and a render of the universe theme in the
         house's small room is a render of a different piece. */
      e.space = s.space ?? 1;
    }
    const V = s.voices || DEFAULT_VOICES;
    const SUS = s.sustain || {};
    const GN = s.gain || {};

    /* The plan is per bar, and the whole point of it is that it is the same
       for all sixteen steps of that bar. Recomputing it per step would be
       wrong as well as wasteful — every voice would draw its own dice. */
    if (absBar !== this._planBar) {
      this._planBar = absBar;
      this._plan = barPlan(s, this.seed, absBar, inten, this.hurrying);
    }
    const p = this._plan;

    /* The tune's treatment lasts a whole cycle, so the rewritten note list is
       cached for that cycle. `treatMelody` walks the entire melody; running it
       once per 16th would be sixteen times the work for the same answer. */
    if (p.cyc !== this._melCyc) {
      this._melCyc = p.cyc;
      this._mel = treatMelody(s.melody, p.melody);
    }

    const jitter = (Math.random() - 0.5) * 0.006;
    t += jitter;

    /* ---------------- drums ----------------
       Three overrides, in order of authority: the break silences the kit down
       to rim and shaker, a fill takes over the bar from `fill.from`, and the
       lift takes the hats out of the back half. Nothing may touch step 0. */
    const hushed = p.fill && inBar >= p.fill.from;
    if (!p.brk && !hushed && kit.kick[g] && inBar !== p.dropKick) e.kick(t, kit.kick[g] * 0.62);
    if (!hushed && kit.rim[g]) e.rim(t, kit.rim[g] * 0.3);
    if (!p.brk && inBar === p.ghostRim && !kit.rim[g] && !hushed) e.rim(t, 0.13);
    if (!p.brk && !hushed && kit.snare && kit.snare[g]) e.snare(t, kit.snare[g] * 0.3);
    const lifted = p.lift && inBar >= 8;
    if (kit.shaker[g] && inten > 0.12 && !lifted && !hushed) {
      e.shaker(t, kit.shaker[g] * (0.7 + inten * 0.5));
    }
    if (!p.brk && kit.hat[g] && inten > 0.3 && !lifted && !hushed) {
      e.hat(t, kit.hat[g] * (0.6 + inten * 0.6), false);
    }
    if (!p.brk && !hushed && kit.tom && kit.tom[g] && inten > 0.6) e.tom(t, 200, kit.tom[g] * 0.5);
    if (p.fill) {
      for (const [fs, voice, vel] of p.fill.hits) {
        if (fs !== inBar) continue;
        /* Scaled by intensity like every other kit voice, so a fill in a quiet
           menu is a quiet fill rather than an announcement. */
        const a = vel * (0.55 + inten * 0.55);
        if (voice === 'kick') e.kick(t, a);
        else if (voice === 'snare') e.snare(t, a);
        else if (voice === 'rim') e.rim(t, a);
        else if (voice === 'tom') e.tom(t, 168 + fs * 7, a);
      }
    }
    if (this.hurrying && pos % 2 === 0) e.hat(t, 0.055, false);

    /* ---------------- bass ---------------- */
    const [root, type] = this._chordAt(pos);
    const bassRoot = root + s.bassOct;
    for (const [bs, iv, dur, amp] of p.bass) {
      if (bs !== inBar) continue;
      let n;
      if (iv === -1) {
        // chromatic approach into the next bar's root
        n = this.song.prog[(bar + 1) % this.song.prog.length][0] + s.bassOct - 1;
      } else n = bassRoot + iv;
      /* `amp` is in BASS units (0.44 is the shipped root). `_play` works in
         vibe units, so convert once here rather than at eight call sites. */
      this._play(V.bass || 'bass', t, mtof(n),
        this.stepDuration * dur * (SUS.bass ?? 1),
        (amp / VOICE_GAIN.bass) * (GN.bass ?? 1));
    }

    /* ---------------- comping ---------------- */
    if (inten > 0.2 && p.comp && p.comp.includes(inBar)) {
      const notes = this._voicing(root, type, p.compLow, 4);
      /* 0.11 was the shipped comping level IN PLUCK UNITS. Converted to vibe
         units once, so moving the role to a choir or a horn section keeps the
         same place in the mix instead of arriving 4dB out. */
      const amp = (0.11 / VOICE_GAIN.pluck) * (0.5 + inten * 0.7)
        * (inBar === 3 ? 1.1 : 0.85) * (GN.comp ?? 1);
      const dur = this.stepDuration * 3.4 * (SUS.comp ?? 1);
      /* The 4ms stagger is a strum. It is right for a plucked voice and wrong
         for a sustained one — a choir that enters four milliseconds apart is a
         choir that is late, so a slow `sustain.comp` spreads the entry wider
         and lets the chord bloom instead. */
      const spread = (SUS.comp ?? 1) > 2 ? 0.05 : 0.004;
      notes.forEach((n, i) => this._play(V.comp || 'pluck', t + i * spread, mtof(n), dur, amp, i % 5));
    }

    /* ---------------- melody ---------------- */
    if (inten > 0.34) {
      for (const [ms, note, dur, kind] of this._mel) {
        if (ms !== pos) continue;
        const mv = V.melody || 'vibe';
        const amp = GN.melody ?? 1;
        /* The 4th element is a VOWEL when the melody is written for the scat
           voice and the marker string 'grace' when `treatMelody` put an
           ornament there. Both live in the same slot because `songs.js` has
           always spelled a scat note as [step, note, dur, vowel] and there was
           no reason to invent a second shape for a note that is one field
           longer. Anything that is not a number is not a vowel. */
        const vowel = typeof kind === 'number' ? kind : 0;
        if (kind === 'grace') {
          /* A grace note is an approach, not a note: short, quiet, and never
             doubled, or it reads as the melody having changed. */
          this._play(mv, t, mtof(note), this.stepDuration * 0.6, (0.08 + inten * 0.05) * amp, 1);
          continue;
        }
        this._play(mv, t, mtof(note), this.stepDuration * dur * 0.95 * (SUS.melody ?? 1),
          (0.2 + inten * 0.14) * amp, vowel);
        /* The octave double is a colour, not a part — `double: null` turns it
           off for songs where a second voice an octave up is one voice too
           many, which is most of the quiet ones. */
        if (inten > 0.55 && V.double) {
          this._play(V.double, t + 0.012, mtof(note + 12),
            this.stepDuration * dur * 0.5 * (SUS.melody ?? 1),
            0.05 / (VOICE_GAIN[V.double] || 1), 4);
        }
      }
    }

    /* ---------------- scat voice ---------------- */
    if (inten > 0.6 && s.scat && p.scat && p.melody !== 'layout') {
      for (const [ms, note, dur, vowel] of s.scat) {
        if (ms === pos) e.scat(t, mtof(note - 12), this.stepDuration * dur * 0.9, 0.1 + inten * 0.07, vowel);
      }
    }

    /* ---------------- brass ---------------- */
    if ((inten > 0.78 || this.hurrying) && s.brass && p.brass && !p.brk) {
      for (const [ms, notes, dur] of s.brass) {
        if (ms === pos) {
          notes.forEach((n, i) => e.brass(t + i * 0.003, mtof(n + p.brassOct), this.stepDuration * dur * 0.9, 0.09));
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
