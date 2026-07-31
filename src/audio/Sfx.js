/* ============================================================
   Sound effects — all synthesised, all reactive to the size of
   the katamari. A 5cm ball ticks and clicks; a 150m one grinds
   and booms. Same code, different parameters.
   ============================================================ */

import { mtof } from './AudioEngine.js';
import { clamp, lerp } from '../util/math.js';
import { TUNING } from '../world/Katamari.js';
import { FART_SAMPLES, FART_CLASSES } from './fartSamples.js';

/* The largest thing that can be collected, as a fraction of the katamari's
   diameter. Imported rather than re-typed as 0.88: it is a balance lever that
   has been retuned before, and a copy here would silently drift the moment it
   moves again — leaving the loudest pickup sound permanently unreachable. */
const PICKUP_RATIO = TUNING.pickupRatio;

export class Sfx {
  constructor(engine) {
    this.e = engine;
    this.rollStarted = false;
    this.lastPickup = 0;
    this.pickupStack = 0;
    /** Toggled by the ten-tap easter egg. See `Sfx.fart`. */
    this.fartMode = false;
    this._fartCount = 0;
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
   *
   * ⚠ THE AMPLITUDE SCALING HERE LOOKS LIKE IT WORKS AND MOSTLY DOES NOT.
   *
   * The player: "the pickup sounds for smaller items are too loud/intrusive
   * compared to the pickup sounds for larger items." On the face of it that
   * should be impossible — `amp` already spans lerp(0.1, 0.34, r), and
   * `npm run pickup` confirms the smallest item is a full 19.0 dB below the
   * largest by raw RMS.
   *
   * But this function also scales PITCH, from MIDI 86 (~1.3kHz) down to MIDI
   * 46 (~116Hz), and the ear is far more sensitive up there. A-weighted — a
   * rough stand-in for perceived loudness — the same measurement reads:
   *
   *     rel 0.00   raw -19.0 dB   A-weighted  -2.8 dB   centroid 2890 Hz
   *     rel 0.40   raw  -7.3 dB   A-weighted   0.0 dB   centroid 2333 Hz  <- loudest
   *     rel 1.00   raw   0.0 dB   A-weighted  -3.1 dB   centroid 1012 Hz
   *
   * The pitch mapping eats 16.2 dB of the 19 dB the gain curve was buying, so
   * the audible spread was under 3 dB and the loudest thing in the game was a
   * MID-SIZED pickup. Anyone tuning the numbers below by ear and reasoning
   * from the gain values alone will conclude they already did the thing.
   *
   * `SIZE_DUCK` is the fix asked for: half volume for the smallest item,
   * ramping to full at the largest, which buys back roughly 6 dB and makes
   * the perceived curve slope the way the gain curve always claimed to.
   */
  pickup(relSize, absSize) {
    const e = this.e;
    if (!e.ready) return;
    if (this.fartMode) return this.fart(relSize);
    const now = e.now;
    // rapid-fire pickups stack into a little arpeggio instead of a mush
    if (now - this.lastPickup < 0.09) this.pickupStack = Math.min(6, this.pickupStack + 1);
    else this.pickupStack = 0;
    this.lastPickup = now;

    const t = now + 0.005;
    const r = clamp(relSize, 0, 1);

    /* NORMALISE AGAINST WHAT IS ACTUALLY COLLECTABLE, NOT AGAINST THE BALL.
       `Game._handleEvents` passes `size / diameter`, but nothing above
       `diameter * TUNING.pickupRatio` (0.88) can ever be picked up — so `r`
       tops out at 0.88 and the top of every ramp in here was unreachable. The
       player asked for full volume "based on the maximum pickup size", which
       is this, not the raw ratio. Kept separate from `r` so the pitch and
       duration curves below stay exactly as they were tuned. */
    const rMax = clamp(r / PICKUP_RATIO, 0, 1);

    /* Continuous, not stepped. The request was "10% increments", and six steps
       between 0.5 and 1.0 is ~1.6 dB per step — above the ~1 dB just-noticeable
       difference, so it WOULD be audible, as stepping. Since a lerp is also
       less code than a quantiser there is nothing to trade off here: quantise
       only if the stepping is wanted as an effect. */
    const SIZE_DUCK = lerp(0.5, 1, rMax);

    const base = lerp(86, 46, Math.pow(r, 0.6)) + this.pickupStack * 1.2;
    const freq = mtof(base);
    const dur = lerp(0.07, 0.3, r);

    const ctx = e.ctx;
    const o = ctx.createOscillator();
    o.type = r > 0.45 ? 'triangle' : 'sine';
    o.frequency.setValueAtTime(freq * 1.5, t);
    o.frequency.exponentialRampToValueAtTime(freq, t + 0.03);
    const g = ctx.createGain();
    const amp = lerp(0.1, 0.34, r) * SIZE_DUCK;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(amp, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(e.sfx);
    o.start(t); o.stop(t + dur + 0.02);

    /* Crunchy transient — more of it for bigger objects. Ducked by the SAME
       factor as the tone: this layer is broadband and centred at 4.2kHz for
       small items, which is the most sensitive part of human hearing and
       therefore carries more of the "intrusive" than the tone does. Ducking
       only the tone would have moved the measurement and not the complaint. */
    const n = e.noiseSource(1 + r);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = lerp(4200, 700, r);
    bp.Q.value = 1.2;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(lerp(0.05, 0.22, r) * SIZE_DUCK, t);
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

  /* ============================================================
     FART MODE

     Unlocked by tapping the play area ten times. It replaces every
     pickup sound. Requested, in as many words, for a friend who
     "LOVES toilet humour", and the brief was: small items short and
     higher, large items lower and longer.

     Physically a fart is a slack membrane flapping under pressure,
     and that is the whole recipe — the buzz is not a tone with
     vibrato on it, it is an oscillator whose pitch is being
     *violently* modulated by a second, much slower one. Four parts:

       1. a sawtooth for the buzz, since the flapping is nowhere
          near sinusoidal and needs the harmonics;
       2. a FLUTTER LFO at 12-40Hz driving that sawtooth's frequency
          hard — this is the single thing that makes it read as a
          fart rather than as a bass note, and its depth is a large
          fraction of the carrier, not a few cents;
       3. a resonant lowpass standing in for the body cavity, which
          also keeps the sawtooth from being unpleasantly bright;
       4. a noise layer for the air escaping.

     ⚠ EVERY ONE MUST DIFFER FROM THE LAST. This is the same lesson
     the music voices just learned the hard way (see the voicelab
     notes): an identical waveform repeated is instantly recognised
     as a machine. Here it also kills the joke, which depends
     entirely on not knowing exactly what is coming. So pitch,
     length, flutter rate, flutter depth and the pitch contour are
     all randomised per event, and `_fartCount` guarantees a
     different contour shape every fourth one.
     ============================================================ */

  /**
   * Decode the baked samples, once, in the background.
   *
   * Fire-and-forget on purpose. `decodeAudioData` is async and the first fart
   * happens the instant the player finishes their tenth tap, so waiting for it
   * would mean the unlock is a banner followed by silence. Until this resolves
   * — and forever, if no samples were ever baked — `fart` uses the procedural
   * voice, which is a complete implementation rather than a placeholder.
   */
  _loadFarts() {
    if (this._fartLoad || !FART_SAMPLES.length || !this.e.ctx) return this._fartLoad;
    this._fartBufs = [];
    /* The promise is returned and stored, not discarded, purely so a harness
       can await the decode. Gameplay never waits on it — see above. */
    this._fartLoad = Promise.all(FART_SAMPLES.map((s, i) => {
      /* base64 -> bytes. `atob` rather than fetch(data:) because a data URL
         fetch is blocked by the page's own CSP in some hosting setups, and
         this has to work off file:// as well, where fetch is refused outright. */
      const bin = atob(s.mp3);
      const buf = new Uint8Array(bin.length);
      for (let k = 0; k < bin.length; k++) buf[k] = bin.charCodeAt(k);
      return this.e.ctx.decodeAudioData(buf.buffer)
        .then((audio) => { this._fartBufs[i] = audio; })
        .catch(() => { /* one bad sample must not take the rest down */ });
    }));
    return this._fartLoad;
  }

  /**
   * @param {number} relSize 0..1, the item's size relative to the katamari.
   */
  fart(relSize) {
    const e = this.e;
    if (!e.ready) return;
    this._loadFarts();
    if (this._fartBufs && this._fartBufs.some(Boolean)) return this._fartSample(relSize);
    const ctx = e.ctx;
    const now = e.now;

    /* Rapid-fire pickups would otherwise overlap into a solid drone, which is
       both unpleasant and much less funny than discrete events. Same 0.09s
       window the tuned pickup uses for its arpeggio. */
    if (now - this.lastPickup < 0.09) this.pickupStack = Math.min(6, this.pickupStack + 1);
    else this.pickupStack = 0;
    this.lastPickup = now;

    const t = now + 0.005;
    const r = clamp(relSize, 0, 1);
    const rMax = clamp(r / PICKUP_RATIO, 0, 1);
    const rnd = (a, b) => a + Math.random() * (b - a);

    /* The brief: small = short and higher, large = low and long. 230Hz down to
       58Hz is a bit over two octaves, which is roughly the range a real one
       covers and enough that a pebble and a skyscraper are unmistakably
       different events. Randomised +/-12% so no two are the same note. */
    const f0 = lerp(230, 58, Math.pow(rMax, 0.75)) * rnd(0.88, 1.12);
    const dur = lerp(0.13, 0.78, Math.pow(rMax, 0.85)) * rnd(0.85, 1.2);

    /* Small ones flutter FASTER. A quick high squeak is a tight aperture; a
       long low one is a slack one. Tying rate to size rather than randomising
       it freely is what makes the size difference read as a difference in
       kind, not just in pitch. */
    const flutterHz = lerp(38, 13, rMax) * rnd(0.8, 1.25);
    /* Depth as a FRACTION OF THE CARRIER, not a fixed number of Hz — at 0.45
       the pitch is swinging by nearly half its own value every cycle, which is
       what produces the brap. A fixed Hz depth would be violent on the low
       ones and inaudible on the high ones. */
    const flutterDepth = f0 * rnd(0.28, 0.5);

    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    /* Pressure drops as it empties, so the pitch sags. Every fourth one instead
       RISES at the end — the strained variety — because a contour that always
       falls becomes predictable within about a minute of play. */
    const cheeky = (this._fartCount++ % 4) === 3;
    osc.frequency.setValueAtTime(f0 * rnd(1.05, 1.25), t);
    osc.frequency.exponentialRampToValueAtTime(f0, t + dur * 0.18);
    osc.frequency.exponentialRampToValueAtTime(cheeky ? f0 * 1.45 : f0 * 0.62, t + dur);

    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(flutterHz, t);
    // The flap slows as the pressure goes, same as the pitch.
    lfo.frequency.linearRampToValueAtTime(flutterHz * 0.7, t + dur);
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = flutterDepth;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);

    /* The body. Q 6 is deliberately resonant: it is doing the job of a cavity,
       and without it a sawtooth this low just sounds like a broken bass synth.
       Tracking f0 keeps the character constant across the size range. */
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = rnd(4, 8);
    lp.frequency.setValueAtTime(f0 * rnd(5, 8), t);
    lp.frequency.exponentialRampToValueAtTime(f0 * 2.2, t + dur);

    const g = ctx.createGain();
    /* Ducked by size on the same principle as the tuned pickup — see the note
       there. Small ones are both higher-pitched AND more frequent, so without
       this the joke becomes a nuisance inside thirty seconds. */
    const amp = lerp(0.10, 0.30, rMax) * lerp(0.5, 1, rMax);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(amp, t + 0.012);
    g.gain.setValueAtTime(amp, t + dur * 0.55);
    // Ends abruptly rather than fading politely away.
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    osc.connect(lp); lp.connect(g); g.connect(e.sfx);
    osc.start(t); osc.stop(t + dur + 0.02);
    lfo.start(t); lfo.stop(t + dur + 0.02);

    /* The air. Bandpassed noise, quiet, riding the same envelope — it is the
       difference between "a buzzing sound" and "a wet one". */
    const n = e.noiseSource(rnd(0.7, 1.3));
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = lerp(1400, 520, rMax);
    bp.Q.value = 0.8;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.exponentialRampToValueAtTime(amp * rnd(0.25, 0.5), t + 0.02);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + dur * rnd(0.7, 1));
    n.connect(bp); bp.connect(ng); ng.connect(e.sfx);
    n.start(t); n.stop(t + dur + 0.05);
  }

  /**
   * The same thing with real recordings, when someone has baked some in.
   *
   * ⚠ N SAMPLES WILL LOOP AND THAT IS THE WHOLE RISK HERE. A player eats
   * hundreds of things a round; eight recordings played straight become eight
   * sounds they have memorised, which is exactly the complaint that started
   * this project's entire audio thread — the music repeating every 15 seconds.
   * The procedural voice never repeats (measured: worst-case 0.281 similarity
   * across 28 pairs). Samples only beat it if they are varied per play, so:
   *
   *   - item size picks a CLASS (small / medium / large), and then one member
   *     of that class AT RANDOM. Several candidates per size is the whole
   *     point: one sample per size is one sound the player memorises, and
   *     recordings only beat the synth if more than one can turn up.
   *   - `playbackRate` shifts every single play, which moves pitch and length
   *     together the way a tape speed does — the cheapest convincing variation
   *     there is, and the reason a dozen samples can cover a whole round;
   *   - a lowpass rolls off with size, so a "big" one is duller as well as
   *     lower rather than merely slower.
   */
  _fartSample(relSize) {
    const e = this.e;
    const ctx = e.ctx;
    const now = e.now;
    if (now - this.lastPickup < 0.09) this.pickupStack = Math.min(6, this.pickupStack + 1);
    else this.pickupStack = 0;
    this.lastPickup = now;

    const t = now + 0.005;
    const r = clamp(relSize, 0, 1);
    const rMax = clamp(r / PICKUP_RATIO, 0, 1);
    const rnd = (a, b) => a + Math.random() * (b - a);

    /* PICK THE CLASS, THEN A MEMBER OF IT.

       The bake tool sorted the samples by length and banded them into thirds,
       so `cls` already means "short / middling / long" — which is the only
       property of a recording that reliably tracks how big a thing sounds.

       The +/-0.3 jitter SOFTENS THE BOUNDARIES on purpose. With hard
       thresholds, two items either side of a boundary always sound like
       different categories, and a player rolling steadily through a size range
       hears the sound set switch over like a gear change. Blurring the edge
       means near a boundary you sometimes get either side, and the transition
       becomes gradual without needing any crossfade. */
    const nCls = Math.max(1, FART_CLASSES.length);
    const cls = clamp(Math.round(rMax * (nCls - 1) + rnd(-0.3, 0.3)), 0, nCls - 1);

    const bufs = this._fartBufs;
    let pool = [];
    for (let k = 0; k < FART_SAMPLES.length; k++) {
      if (FART_SAMPLES[k].cls === cls && bufs[k]) pool.push(k);
    }
    // Nothing decoded in this class yet — anything is better than silence.
    if (!pool.length) { for (let k = 0; k < bufs.length; k++) if (bufs[k]) pool.push(k); }
    if (!pool.length) return;

    /* Never the same one twice running. With six samples in a class, uniform
       random repeats immediately about one time in six, and an immediate repeat
       is the single most noticeable way a sample set gives itself away — far
       more so than the same sound turning up again a minute later. One reroll
       is enough and cannot loop. */
    let i = pool[Math.floor(Math.random() * pool.length)];
    if (i === this._lastFartIdx && pool.length > 1) {
      i = pool[Math.floor(Math.random() * pool.length)];
      if (i === this._lastFartIdx) i = pool[(pool.indexOf(i) + 1) % pool.length];
    }
    this._lastFartIdx = i;
    const buf = bufs[i];
    if (!buf) return;

    const src = ctx.createBufferSource();
    src.buffer = buf;
    /* Rate does pitch and length in one move. Two terms, doing two jobs:

       - the SIZE BIAS, 1.35 down to 0.68, very nearly an octave, so a pebble is
         audibly a different creature from a skyscraper;
       - the PER-PLAY JITTER, +/-14%, which is a bit over two semitones and is
         what stops a handful of recordings from becoming a handful of sounds
         the player has memorised. Deliberately wider than the +/-8% that felt
         "safe": with only a few source clips this jitter IS most of the
         variety, and subtle variation on a fart is a wasted opportunity.

       Floored at 0.55 because below that an mp3 of a fart stops sounding like a
       fart and starts sounding like a dying tractor — funny exactly once. */
    src.playbackRate.value = clamp(lerp(1.35, 0.68, rMax) * rnd(0.86, 1.14), 0.55, 1.8);

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = lerp(6000, 1400, rMax) * rnd(0.85, 1.2);

    const g = ctx.createGain();
    // Same 50%-to-100% size duck as every other pickup sound. See `pickup`.
    g.gain.value = lerp(0.55, 1.0, rMax) * lerp(0.5, 1, rMax) * rnd(0.9, 1.1);

    src.connect(lp); lp.connect(g); g.connect(e.sfx);
    src.start(t);
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
