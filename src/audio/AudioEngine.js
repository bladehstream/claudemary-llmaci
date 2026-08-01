/* ============================================================
   Web Audio plumbing: buses, a procedurally generated reverb,
   a shared noise buffer, and the synth voices that everything
   else in the game is built from.

   Nothing here loads a file. Every sound is generated.
   ============================================================ */

const A4 = 440;

export function mtof(midi) { return A4 * Math.pow(2, (midi - 69) / 12); }

/* ============================================================
   THE STAGE.

   Everything used to sum into one mono bus, so the whole band
   was a single point between the speakers while the reverb —
   whose impulse response is genuinely two-channel — was wide.
   A point source inside a wide room is the sound of a preset,
   not of players.

   These are constant pan positions for a band seen from the
   audience. They are persistent nodes built once in `init()`,
   NOT per-note panners, because a seat that never moves has no
   business costing a node on every sixteenth. A voice pays
   nothing for its position.

   The layout is a real small-group stage:
     - kick and bass dead centre. Low frequencies carry no usable
       localisation cues below ~200Hz anyway, and anything panned
       down there just wastes headroom on one side and breaks
       mono fold-down on a phone speaker.
     - the kit is placed as it sits behind a drummer: snare a
       hair left of centre, hats to their right, floor tom right.
     - comping stage left, vibes stage right, so the two mid-
       register chordal voices stop fighting for the same spot.
     - the singer stands at the mic, centre.
   Brass is centre HERE and spreads itself per note instead; see
   `brass()` for why that one voice pays for a panner.
   ============================================================ */
const STAGE = {
  kick: 0.00,
  bass: 0.00,
  snare: -0.08,
  rim: -0.22,
  tom: 0.34,
  hat: 0.42,
  shaker: -0.55,
  pluck: -0.62,
  vibe: 0.52,
  scat: 0.00,
  brass: 0.00,
};

/* VELOCITY, NOT VOLUME.

   The single loudest "this is a machine" cue in the old code was
   that `gain` only ever scaled amplitude: loud and soft were the
   same waveform at different levels. On a real instrument, force
   changes the SPECTRUM first and the level second — a trumpet
   played hard has a centroid two to three times its quiet one.

   So every rebuilt voice derives a 0..1 velocity from `gain` and
   uses it to open filters, shift the balance between a body and
   a transient, and change envelope shape. `gain` still sets the
   level; velocity is what sets the tone.

   The mapping is logarithmic because loudness is, and it is
   SHARED so the whole band responds to dynamics with one law
   rather than eleven. The bounds have to cover two different
   things at once and both matter:
     - the range Music.js actually uses, which spans roughly
       0.03 (a ghosted shaker) to 0.62 (a downbeat kick);
     - the 0.15 / 0.45 / 0.90 the bench probes at.
   0.025..1.0 is 5.3 octaves and contains both with no voice
   pinned against either end, which would silently turn the
   velocity axis back off for that voice. */
const VEL_LO = 0.025;
const VEL_HI = 1.0;
const VEL_SPAN = Math.log2(VEL_HI / VEL_LO);

/* OUTPUT TRIMS — THE REBUILD MUST NOT ALSO BE A LEVEL CHANGE.
 *
 * Every rebuilt voice stacks more into itself than the old one did: unison
 * strings, a body resonance that boosts a whole region, a noise transient
 * on top of the tone. All of that sums BEFORE the envelope, so a voice
 * written the obvious way runs far hotter than its nominal `gain` — the
 * rebuilt pluck measured 2.46x full scale at gain 0.90 before these existed.
 *
 * That matters for more than clipping. Music.js's balance between the
 * instruments is a set of hand-tuned `gain` arguments, and the master bus
 * ends in a limiter. A voice that silently runs 8dB hot does not just risk
 * clipping, it drags the whole mix into gain reduction and comes back out
 * as "loud AND cheap", which is a worse outcome than the problem being
 * fixed here.
 *
 * So each voice carries a trim chosen by measuring its own probe sheet
 * against the SAME sheet rendered from the pre-rebuild code, until the two
 * match in RMS to within about a decibel. RMS and not peak, deliberately: a
 * voice that has been given a real attack transient SHOULD have a higher
 * crest factor than one that ramped politely out of silence, and forcing
 * the peaks to match would flatten exactly the thing this rebuild exists to
 * add. Matching energy keeps the balance Music.js was tuned around; letting
 * the peaks grow is the point.
 *
 * Reference RMS from the pre-rebuild probe sheets, for whoever tunes this
 * next: pluck 0.0208, brass 0.0619, kick 0.0345, snare 0.0105, rim 0.0120,
 * hat 0.0089, shaker 0.0082, tom 0.0319. */
const TRIM = {
  /* bass/vibe/scat, trimmed the same way as the rest: rendered at gain
     0.15/0.45/0.90 and matched on RMS against the SAME sheet from the
     pre-rebuild code, so the balance Music.js was hand-tuned around survives a
     change of timbre. Reference dB from the old code, for whoever tunes this
     next: bass -24.5/-15.0/-9.0, vibe -32.0/-22.9/-17.1, scat
     -41.5/-32.0/-26.0. Rebuilt and untrimmed they came out -0.4, +1.5 and
     +0.5 dB against those. */
  bass: 1.05,
  vibe: 0.84,
  scat: 0.94,
  pluck: 0.33,
  brass: 0.34,
  kick: 0.92,
  snare: 0.80,
  rim: 1.50,
  hat: 0.60,
  shaker: 0.90,
  tom: 0.78,
};

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this._brassN = 0;   // round-robin cursor for the brass section's seats
    this.musicVol = 0.65;
    this.sfxVol = 0.8;
    this.muted = false;
  }

  /** Must be called from a user gesture. */
  init() {
    if (this.ctx) return this.ctx;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    const ctx = new Ctx({ latencyHint: 'interactive' });
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = 0.9;

    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -8;
    this.limiter.knee.value = 12;
    this.limiter.ratio.value = 6;
    this.limiter.attack.value = 0.004;
    this.limiter.release.value = 0.18;

    this.music = ctx.createGain();
    this.music.gain.value = this.musicVol;
    this.sfx = ctx.createGain();
    this.sfx.gain.value = this.sfxVol;

    /* A small plate-ish reverb built from decaying noise — ONE PER BUS.
     *
     * It used to be a single send returning straight into `master`, which put
     * the whole wet signal DOWNSTREAM of the music and sfx faders. Dragging
     * either slider to zero therefore killed the dry path and left the
     * reverb tail playing at full level: "turning the music or sound effects to
     * 0 should make them silent, not just quiet". It also meant the two buses
     * bled into each other's tails, so the music's reverb came out of the sound
     * effects channel.
     *
     * Two convolvers is the honest fix. Each bus taps its own send and returns
     * INTO that bus, so the fader scales dry and wet together and zero means
     * zero. No feedback path: the send is tapped off each voice, not off the bus
     * node, so nothing loops. The impulse buffer is shared. */
    const impulse = this._makeImpulse(1.9, 2.6);
    const makeRev = (bus) => {
      const conv = ctx.createConvolver();
      conv.buffer = impulse;
      const send = ctx.createGain();
      send.gain.value = 0.34;
      const ret = ctx.createGain();
      ret.gain.value = 0.5;
      send.connect(conv);
      conv.connect(ret);
      ret.connect(bus);
      return send;
    };
    this.musicSend = makeRev(this.music);
    this.sfxSend = makeRev(this.sfx);

    /* The seats. One persistent panner per instrument, all feeding the music
     * bus, so placement costs nothing per note and the music fader still
     * scales every dry path — zero on the slider is still a real zero.
     *
     * Guarded because StereoPannerNode is the one node here that an old
     * mobile Safari might not have. Falling back to the bare bus loses the
     * staging and nothing else, which is the right way for this to degrade. */
    this.seats = null;
    if (typeof ctx.createStereoPanner === 'function') {
      this.seats = {};
      for (const name in STAGE) {
        const p = ctx.createStereoPanner();
        p.pan.value = STAGE[name];
        p.connect(this.music);
        this.seats[name] = p;
      }
    }

    this.music.connect(this.master);
    this.sfx.connect(this.master);
    this.master.connect(this.limiter);
    this.limiter.connect(ctx.destination);

    this.noise = this._makeNoise(2);
    this.ready = true;
    this._unlockIOS();
    return ctx;
  }

  /* ============================================================
     ⚠ WHY AN iPHONE PLAYS NOTHING AT ALL

     Reported as "apple iphone users get no audio at all", with
     the same build working everywhere else. It is not a bug in
     the graph, and no amount of checking `ctx.state` finds it.

     iOS puts Web Audio in the AMBIENT audio session category,
     and ambient is silenced by the physical ring/silent switch
     on the side of the phone. A player with that switch down —
     which is most people, most of the time — gets a page that is
     working perfectly and produces no sound, with nothing in the
     console and no way to detect it from inside the page.

     The lever is that an HTMLMediaElement uses the PLAYBACK
     category instead, and starting one promotes the whole
     session. So: keep a silent media element playing, and Web
     Audio comes along with it.

     Three details, each of which makes this silently not work:

       1. THE ELEMENT MUST ACTUALLY BE PLAYING, AND MUST LOOP. A
          one-shot ends, the session reverts, and the sound dies
          again a few seconds in — worse than never working,
          because it presents as intermittent.
       2. `playsinline` is required or iOS may take the element
          fullscreen, and `muted` is NOT usable: a muted element
          does not change the session category, which is the
          entire point. The buffer is genuine digital silence, so
          full volume costs the player nothing.
       3. It has to start from a user gesture like everything else
          on iOS. `init()` is only ever reached from one — see
          `Game._ensureAudio` and its callers.

     The silent WAV is BUILT HERE rather than shipped as a file.
     A WAV is a 44-byte header followed by samples, and silence is
     samples that are zero, so generating it procedurally is about
     fifteen lines and keeps the promise the README makes.
     ============================================================ */
  _unlockIOS() {
    if (this._silentEl || typeof document === 'undefined') return;
    try {
      const SEC = 0.5, RATE = 8000;              // as small as will loop cleanly
      const n = Math.floor(SEC * RATE);
      const buf = new ArrayBuffer(44 + n * 2);
      const dv = new DataView(buf);
      const tag = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
      tag(0, 'RIFF'); dv.setUint32(4, 36 + n * 2, true); tag(8, 'WAVEfmt ');
      dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
      dv.setUint32(24, RATE, true); dv.setUint32(28, RATE * 2, true);
      dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
      tag(36, 'data'); dv.setUint32(40, n * 2, true);
      /* The samples are already zero — an ArrayBuffer starts zeroed. That is
         the entire payload: 8KB of nothing, and no asset file. */
      let bin = '';
      const bytes = new Uint8Array(buf);
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);

      const el = document.createElement('audio');
      el.setAttribute('playsinline', '');
      el.loop = true;
      el.volume = 1;                             // see note 2 — must NOT be muted
      el.src = `data:audio/wav;base64,${btoa(bin)}`;
      const p = el.play();
      if (p && p.catch) p.catch(() => { /* no gesture yet; the next one retries */ });
      this._silentEl = el;

      /* iOS also suspends the context when the page is backgrounded and does
         not reliably resume it on return, which reads as "the sound just
         stopped halfway through the round". Cheap to re-arm both. */
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible') return;
        this.resume();
        const q = this._silentEl && this._silentEl.play();
        if (q && q.catch) q.catch(() => {});
      });
    } catch { /* no document, no autoplay, no matter — Web Audio still tries */ }
  }

  /**
   * Where an instrument stands. Only applies to the music bus: anything
   * explicitly aimed somewhere else (Sfx passes `e.sfx`) is a game event
   * rather than a member of the band and keeps its existing routing.
   */
  _seat(dest, name) {
    return (this.seats && dest === this.music) ? this.seats[name] : dest;
  }

  /** `gain` -> 0..1 velocity. See VEL_LO above for why these bounds. */
  _vel(gain) {
    const v = Math.log2(Math.max(1e-4, gain) / VEL_LO) / VEL_SPAN;
    return v < 0 ? 0 : v > 1 ? 1 : v;
  }

  /**
   * A multiplier around 1 for humanising a constant.
   *
   * Deliberately multiplicative and bounded: `spread` is a fraction, so this
   * can never reach zero and can never run away. Randomness is allowed to
   * make a note different; it is never allowed to make one silent or clipped.
   * Math.random is monkeypatched to a seeded PRNG by the render harness, so
   * this stays reproducible under test.
   */
  _hum(spread) { return 1 + (Math.random() * 2 - 1) * spread; }

/**
   * Which reverb a voice should feed: the one that returns into its own bus.
   * Anything not explicitly aimed at the sfx bus is music, which matches the
   * `out || this.music` default every voice already uses.
   */
  _revFor(dest) { return dest === this.sfx ? this.sfxSend : this.musicSend; }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    /* Retry the silent element on EVERY resume, not just at init. Its first
       play() can be rejected — autoplay policy, a gesture that had already
       elapsed — and if that is the only attempt, an iPhone stays silent for the
       whole session with no second chance. `resume()` is called from every
       gesture that matters, so this costs nothing and keeps trying. */
    if (this._silentEl && this._silentEl.paused) {
      const p = this._silentEl.play();
      if (p && p.catch) p.catch(() => {});
    }
  }
  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); }

  get now() { return this.ctx ? this.ctx.currentTime : 0; }

  /* ZERO MEANS ZERO.
   *
   * `setTargetAtTime` is an exponential approach: it never actually arrives, so
   * a target of 0 leaves a decaying residue rather than silence. At -87dB that
   * is inaudible on its own, but it is also the wrong shape — a slider sitting
   * at 0 should be OFF, not asymptotically approaching off. So: ramp for any
   * audible value, and hard-zero at the bottom of the travel. */
  _setBus(node, v) {
    if (!node) return;
    const t = this.now;
    node.gain.cancelScheduledValues(t);
    if (v <= 0.0005) {
      node.gain.setTargetAtTime(0, t, 0.03);
      node.gain.setValueAtTime(0, t + 0.2);   // and then genuinely nothing
    } else {
      node.gain.setTargetAtTime(v, t, 0.05);
    }
  }

  setMusicVolume(v) {
    this.musicVol = v;
    this._setBus(this.music, this.muted ? 0 : v);
  }

  setSfxVolume(v) {
    this.sfxVol = v;
    this._setBus(this.sfx, v);
  }

  setMuted(m) {
    this.muted = m;
    if (this.music) this.music.gain.setTargetAtTime(m ? 0 : this.musicVol, this.now, 0.05);
  }

  _makeImpulse(seconds, decay) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        // a little early-reflection cluster then a smooth tail
        const burst = (i < 1200 && i % 311 < 6) ? 2.2 : 1;
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay) * burst;
      }
    }
    return buf;
  }

  _makeNoise(seconds) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  /**
   * A voice on the shared noise buffer.
   *
   * ROUND-ROBIN THE READ HEAD. This used to start every source at offset 0,
   * which meant every kick in the game read the same 50ms of the same buffer
   * and was therefore bit-for-bit identical to every other kick. Measured:
   * 28 of 28 repeat pairs identical on all eleven voices. Two snare hits in a
   * row being the same waveform is the loudest machine cue there is, and the
   * entropy to fix it was already sitting in the buffer — it was just never
   * being read from anywhere but the start.
   *
   * The offset is injected by shadowing `start` rather than by taking another
   * argument, because the callers that most need it are in Sfx.js and they
   * call `n.start(t)` with no offset. Doing it here fixes the pickup crunch,
   * the bump and the rolling texture at the same time as the drums, without
   * touching a file this change has no business touching. An explicit offset
   * still wins if a caller passes one.
   *
   * 2s of buffer against bursts of at most ~200ms means a wrap is possible;
   * `loop` is on, so a wrap reads from the top rather than falling silent.
   */
  noiseSource(playbackRate = 1) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    s.playbackRate.value = playbackRate;
    const roundRobin = Math.random() * this.noise.duration;
    const realStart = s.start.bind(s);
    s.start = (when = 0, offset = roundRobin, duration) => (
      duration === undefined ? realStart(when, offset) : realStart(when, offset, duration)
    );
    return s;
  }

  /* ============================================================
     Voices. Each schedules itself at absolute time `t` and
     cleans up after itself.
     ============================================================ */

  /**
   * Upright bass, fingered.
   *
   * The old version was a saw plus a sub-sine through a lowpass swept from
   * `freq * 9` to `freq * 1.6`. Measured: centroid ratio 0.991 — playing
   * harder did nothing whatsoever to the tone — 28 of 28 note pairs
   * bit-identical, and a centroid slope of 1.041, meaning the spectrum tracked
   * the note exactly. That last number is the signature of an instrument with
   * no body. A double bass is a large wooden box, and the box does not change
   * size when you move up the neck.
   *
   * The same three changes that fixed the guitar:
   *   - the tone filter is in ABSOLUTE Hz and opened by velocity, so digging
   *     in recruits harmonics rather than only adding decibels;
   *   - a FIXED body resonance that stays put at every pitch;
   *   - a real attack — a finger leaving a wound string, which is most of what
   *     says "bass" rather than "low synth".
   *
   * 11 nodes: 3 osc, 4 gain (sub, envelope, finger, send), 3 biquad, 1 noise.
   * The seat costs none — see STAGE.
   */
  bass(t, freq, dur, gain = 0.5, out = null) {
    const ctx = this.ctx;
    const dest = this._seat(out || this.music, 'bass');
    const v = this._vel(gain);

    /* HOW HARD IT WAS PLUCKED, IN HERTZ. A string dug in near the bridge
       throws energy up the series; played softly over the fingerboard it is
       nearly a sine. 420Hz whispered to ~2.6kHz driven — a narrower span than
       the guitar's, because a bass is a dark instrument even at full tilt and
       taking it higher makes it read as a cello. */
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 1.4;
    const open = 420 + v * v * 2200;
    lp.frequency.setValueAtTime(open, t);
    // Strings lose their highs first. Decays toward a floor, not toward `freq`.
    lp.frequency.exponentialRampToValueAtTime(Math.max(160, open * 0.30),
      t + Math.min(0.5, dur * 0.8));

    /* THE BOX. A double bass resonates around 90Hz (the air mode) and has a
       broad woody shelf near 260Hz. Both are properties of the wood, so both
       are absolute. This is exactly what metric E looks for, and what the old
       `freq * N` filter made structurally impossible. */
    const air = ctx.createBiquadFilter();
    air.type = 'peaking';
    air.frequency.value = 92;
    air.Q.value = 1.6;
    air.gain.value = 5;
    const wood = ctx.createBiquadFilter();
    wood.type = 'peaking';
    wood.frequency.value = 260;
    wood.Q.value = 0.9;
    wood.gain.value = 3.5;

    /* Two strings' worth of motion, humanised per note. One oscillator is a
       tone; two slightly apart are a string. */
    const det = (3 + Math.random() * 5) * (Math.random() < 0.5 ? -1 : 1);
    const o1 = ctx.createOscillator();
    o1.type = 'sawtooth';
    o1.frequency.value = freq;
    o1.detune.value = det;
    /* The sub is what you feel rather than hear. Under the filter so digging
       in does not turn it to mud, and softer notes lean on it more — which is
       what actually happens when you stop exciting the upper partials. */
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.value = freq / 2;
    const subg = ctx.createGain();
    subg.gain.value = 0.55 - v * 0.2;
    o1.connect(lp); sub.connect(subg); subg.connect(lp);
    lp.connect(air); air.connect(wood);

    /* THE FINGER. A wound string released from a fingertip makes a short dull
       thump plus a scrape of the winding. Unlike the guitar's nail this is
       BANDPASSED LOW rather than high-passed: on a bass the click lives under
       the note rather than over it, and putting it up top turns an upright
       into a slap bass. */
    const n = this.noiseSource(0.7);
    const ng = ctx.createGain();
    const fbp = ctx.createBiquadFilter();
    fbp.type = 'bandpass';
    fbp.frequency.value = 320 + v * 900;
    fbp.Q.value = 0.8;
    const thump = 0.5 + v * v * 1.6;
    ng.gain.setValueAtTime(thump, t);
    ng.gain.exponentialRampToValueAtTime(thump * 0.2, t + 0.014);
    ng.gain.exponentialRampToValueAtTime(thump * 1e-3, t + 0.075);
    n.connect(ng); ng.connect(fbp); fbp.connect(wood);
    n.start(t); n.stop(t + 0.08);

    /* Relative floor, linear attack — see the note on `pluck`. An absolute
       floor makes `gain` a backwards note-length control, and an exponential
       ramp from 0.0001 spends its first milliseconds near -80dB and swallows
       the transient whole. */
    const g = ctx.createGain();
    const hum = this._hum(0.05);
    const peak = gain * TRIM.bass;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.004);
    g.gain.exponentialRampToValueAtTime(peak * 0.45, t + dur * 0.5 * hum);
    g.gain.exponentialRampToValueAtTime(peak * 1e-3, t + dur * hum);
    wood.connect(g); g.connect(dest);

    const send = ctx.createGain(); send.gain.value = 0.12;
    g.connect(send); send.connect(this._revFor(dest));

    o1.start(t); sub.start(t);
    o1.stop(t + dur + 0.05); sub.stop(t + dur + 0.05);
  }

  /**
   * Nylon-string comping guitar.
   *
   * The old version was a triangle plus a saw at 6 cents through a bandpass
   * written `freq * 2.4`. Three things were wrong with it and all three are
   * what made it read as a preset:
   *   - the filter tracked the note, so every pitch had an identical spectral
   *     envelope merely transposed. A wooden box cannot follow the note.
   *   - the note began by ramping a gain from silence. A plucked string
   *     begins with a fingernail scraping across a wound string; that scrape
   *     is most of what tells you it is a guitar.
   *   - playing harder only made it louder.
   *
   * So: the tone filter is now in ABSOLUTE Hz and driven by velocity, the
   * body is a fixed resonance that stays put at every pitch, and the attack
   * is a real noise transient routed through the same body as the string.
   *
   * 9 nodes: 2 osc, 3 gain (one for the second string, one envelope, one
   * send), 2 biquad, 1 noise, 1 pick gain.
   */
  pluck(t, freq, dur, gain = 0.18, out = null) {
    const ctx = this.ctx;
    const dest = this._seat(out || this.music, 'pluck');
    const v = this._vel(gain);

    /* HOW HARD IT WAS PLUCKED, IN HERTZ.
     *
     * Plucking a string nearer the bridge, or harder, throws energy into the
     * upper partials; the string is stiffer there and the corner it rolls off
     * at climbs. 900Hz for a whisper, ~6.4kHz dug in. Absolute, not `freq*N`:
     * this is the single change that stops the voice being a transposition of
     * itself at every pitch. */
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 0.9;
    lp.frequency.value = 900 + v * v * 5500;

    /* THE BOX. A classical guitar's top plate and the air inside it resonate
     * at frequencies set by the instrument's size, and those do not move when
     * you finger a different note. 2300Hz is the broad presence region that
     * makes nylon sound like nylon rather than like a filtered sawtooth.
     * Fixed on purpose — this is the thing metric E is looking for. */
    const body = ctx.createBiquadFilter();
    body.type = 'peaking';
    body.frequency.value = 2300;
    body.Q.value = 1.1;
    body.gain.value = 6;

    /* TWO POLARISATIONS, NOT TWO OSCILLATORS.
     *
     * A plucked string vibrates in two planes at once and they are never
     * quite the same length, so they beat against each other — that slow
     * waver is why a real string sounds alive and a single oscillator does
     * not. The detune is humanised per note because no player puts the pick
     * down in exactly the same place twice. */
    const det = (5 + Math.random() * 7) * (Math.random() < 0.5 ? -1 : 1);
    const o1 = ctx.createOscillator();
    o1.type = 'triangle';
    o1.frequency.value = freq;
    o1.detune.value = det * 0.3;
    const o2 = ctx.createOscillator();
    o2.type = 'sawtooth';
    o2.frequency.value = freq;
    o2.detune.value = det;
    const o2g = ctx.createGain();
    // more saw as you dig in: the harder pluck is the buzzier one
    o2g.gain.value = 0.28 + v * 0.34;
    o1.connect(lp); o2.connect(o2g); o2g.connect(lp);
    lp.connect(body);

    /* THE NAIL.
     *
     * A short broadband crack, and it deliberately does NOT go through the
     * string's lowpass. Routing it there was the obvious thing and it was
     * wrong: the scrape then lives in exactly the band the partials already
     * occupy, so it is masked by them no matter how far it is turned up —
     * measured at 0.5-0.9% of attack energy while plainly present in the
     * graph. A fingernail leaving a wound string is BRIGHTER than the note it
     * starts; it has to sit above the string's own rolloff to be heard as a
     * separate event rather than as a slightly louder first cycle.
     *
     * It still passes through the body, because the box colours everything
     * that happens on top of it. Scales as v^2: a soft chord is nearly all
     * tone, a hard one has real bite. */
    const n = this.noiseSource(1);
    const ng = ctx.createGain();
    const pickHp = ctx.createBiquadFilter();
    pickHp.type = 'highpass';
    pickHp.frequency.value = 1200 + v * 1500;
    pickHp.Q.value = 0.7;
    /* Relative to the string, not to `gain` — the envelope downstream applies
     * the level once already, and scaling here as well would square it. */
    const pick = 0.8 + v * v * 2.4;
    const pickEnd = t + 0.009 + (1 - v) * 0.005;   // harder pick = shorter, sharper
    ng.gain.setValueAtTime(pick, t);
    /* TWO STAGES, because a real pluck makes noise for longer than the crack.
     * The nail release is the first few milliseconds; after it the string is
     * still slapping against the fret and the top is still settling, and that
     * carries on for a few tens of milliseconds. A single 60dB-in-9ms decay
     * left 90% of the ear's 25ms onset window as pure oscillator. */
    ng.gain.exponentialRampToValueAtTime(pick * 0.16, pickEnd);
    ng.gain.exponentialRampToValueAtTime(pick * 1e-3, pickEnd + 0.05);
    n.connect(ng); ng.connect(pickHp); pickHp.connect(body);
    n.start(t); n.stop(pickEnd + 0.055);

    /* Decay to a floor PROPORTIONAL to the peak (-60dB), not to an absolute
     * 0.0001. With an absolute floor a loud note has further to fall in the
     * same seconds and therefore dies FASTER than a quiet one — `gain` was
     * secretly a note-length control, backwards, in ten of eleven voices.
     * Relative floor means level and length are independent. */
    const g = ctx.createGain();
    const hum = this._hum(0.07);
    /* A LINEAR 1.2ms ATTACK, NOT AN EXPONENTIAL 3ms ONE.
     *
     * An exponential ramp starting at 0.0001 spends its first milliseconds
     * around -50dB, which swallowed the pick transient whole: measured at 0.9%
     * of attack energy with the noise burst plainly there in the graph. A
     * plucked string has no attack ramp worth the name — the excitation IS the
     * onset — so this only needs to be long enough not to step-click. */
    const peak = gain * TRIM.pluck;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.0012);
    g.gain.exponentialRampToValueAtTime(peak * 1e-3, t + dur * hum);
    body.connect(g); g.connect(dest);

    const send = ctx.createGain(); send.gain.value = 0.2;
    g.connect(send); send.connect(this._revFor(dest));

    o1.start(t); o2.start(t);
    o1.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
  }

  /**
   * Vibraphone: an aluminium bar over a tuned resonator.
   *
   * The old version was one sine with a 3.01x FM partial and a tremolo, which
   * measured centroid ratio 1.001, 28 of 28 bit-identical notes, and a
   * centroid slope of 1.001 — a spectrum that tracked the note exactly.
   *
   * ⚠ THE PARTIALS OF A STRUCK BAR ARE NOT HARMONICS, and that is the single
   * thing that makes a vibraphone sound like metal rather than like a soft
   * synth lead. A free-free bar's natural modes fall at roughly 1 : 2.76 :
   * 5.40 of the fundamental; makers undercut the middle of the bar to pull the
   * second mode down to exactly 4x and the third to about 10x, which is why a
   * vibraphone is tuned and a length of scaffolding is not. Those ratios are
   * fixed properties of the bar, so they are written as ratios and the LEVELS
   * are what velocity moves — a hard mallet excites the high modes, a soft one
   * barely wakes them.
   *
   * The other half of the instrument is the tube under the bar. It is a
   * quarter-wave resonator tuned to the fundamental, so unlike the guitar's
   * box it DOES track the note — that is not a body in metric E's sense and
   * the slope will stay near 1. Faking a fixed body here would be inventing an
   * instrument that does not exist; what fixes the "preset" quality is the
   * inharmonic mode structure and the mallet, not a resonance that has no
   * business being there.
   *
   * 13 nodes: 5 osc (3 modes, tremolo, and the FM shimmer), 5 gain, 1 biquad,
   * 1 noise, 1 mallet gain.
   */
  vibe(t, freq, dur, gain = 0.3, out = null) {
    const ctx = this.ctx;
    const dest = this._seat(out || this.music, 'vibe');
    const v = this._vel(gain);

    const car = ctx.createOscillator();
    car.type = 'sine'; car.frequency.value = freq;
    /* Mode 2 and mode 3, at the ratios an undercut bar is tuned to. Both die
       far faster than the fundamental — high modes radiate more efficiently
       and lose their energy first, which is why a vibraphone note starts
       bright and settles into a hum within a fifth of a second. Detuned by a
       few cents per note because no two strikes land in the same place. */
    const bar = ctx.createGain();
    const modes = [[4.0, 0.42, 0.16], [10.0, 0.14, 0.09]];
    const modeOsc = [];
    for (const [ratio, lvl, tail] of modes) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = freq * ratio;
      o.detune.value = (Math.random() * 2 - 1) * 9;
      const mg = ctx.createGain();
      // Velocity IS mallet hardness: how much of the bar's high modes woke up.
      const lv = lvl * (0.25 + v * 1.5);
      mg.gain.setValueAtTime(lv, t);
      mg.gain.exponentialRampToValueAtTime(lv * tail, t + 0.18 + Math.random() * 0.05);
      mg.gain.exponentialRampToValueAtTime(lv * 1e-3, t + Math.min(dur, 0.9));
      o.connect(mg); mg.connect(bar);
      modeOsc.push(o);
    }
    car.connect(bar);

    /* THE MALLET, AND THE SAME MASKING TRAP THE GUITAR FELL INTO.
     *
     * The obvious build is a soft LOWPASSED knock, because yarn on aluminium
     * is a dull sound. Measured, that contributes 0.0% of the attack energy:
     * it lands in exactly the band the bar's own modes occupy and is masked by
     * them completely, however far it is turned up. Identical to the pluck's
     * fingernail, which measured 0.5-0.9% for the same reason.
     *
     * So it is HIGHPASSED, above the fundamental and above mode 2, where the
     * bar has nothing of its own. Physically that is the right answer as well
     * as the audible one: the click of contact is a much shorter event than
     * the bar's ringing and therefore a much broader one, and what you hear as
     * "the mallet" is precisely the part that is not the note.
     */
    const n = this.noiseSource(1);
    const ng = ctx.createGain();
    const mhp = ctx.createBiquadFilter();
    mhp.type = 'highpass';
    mhp.frequency.value = 2600 + v * 2600;
    mhp.Q.value = 0.7;
    const knock = 1.2 + v * v * 3.2;
    ng.gain.setValueAtTime(knock, t);
    ng.gain.exponentialRampToValueAtTime(knock * 0.12, t + 0.006);
    ng.gain.exponentialRampToValueAtTime(knock * 1e-3, t + 0.022 + (1 - v) * 0.012);
    n.connect(ng); ng.connect(mhp); mhp.connect(bar);
    n.start(t); n.stop(t + 0.04);

    /* THE OLD FM SHIMMER IS GONE, and its absence is the point. It existed to
       fake the inharmonicity of a struck bar with a 3.01x modulator; the bar
       now has its actual modes at 4x and 10x, so keeping the FM as well would
       be paying two nodes a note to blur partials that are finally correct. */

    const trem = ctx.createOscillator();
    trem.type = 'sine'; trem.frequency.value = 5.2 * this._hum(0.04);
    /* THE TREMOLO DEPTH MUST SCALE WITH THE NOTE, AND IT DID NOT.
     *
     * This is the one change inside an otherwise untouched voice, and it is a
     * bug fix rather than a rebuild. A node connected to an AudioParam is
     * ADDED to it, so a fixed 0.16 here was a fixed +/-0.16 riding on an
     * envelope whose entire height is `gain`. Depth was therefore 0.16/gain:
     * about 18% at gain 0.90, but 107% at gain 0.15 — and past that the summed
     * gain goes NEGATIVE once per cycle, inverting the signal 5.2 times a
     * second. That is a ring modulator, not a tremolo.
     *
     * It matters because Music.js doubles every melody note an octave up at
     * gain 0.05 (`_scheduleStep`, the `inten > 0.55` branch), so that doubling
     * was being ring-modulated on every melody note in the game, and the
     * effect got WORSE the more quietly the part was written.
     *
     * Multiplying by `gain` makes the depth a constant 16% of the envelope at
     * every level, which is plainly what the original 0.16 intended. vibe is
     * otherwise untouched and still sounds like the old engine. */
    const peak = gain * TRIM.vibe;
    const tremGain = ctx.createGain(); tremGain.gain.value = 0.16 * peak;
    trem.connect(tremGain);

    /* Relative floor and a linear attack, for the same reasons as everywhere
       else: an absolute 0.0001 made `gain` a backwards note-length control,
       and an exponential ramp out of silence buries the mallet. */
    const g = ctx.createGain();
    const hum = this._hum(0.06);
    tremGain.connect(g.gain);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.002);
    g.gain.exponentialRampToValueAtTime(peak * 1e-3, t + dur * hum);

    bar.connect(g); g.connect(dest);
    const send = ctx.createGain(); send.gain.value = 0.4;
    g.connect(send); send.connect(this._revFor(dest));

    car.start(t); trem.start(t);
    for (const o of modeOsc) { o.start(t); o.stop(t + dur + 0.05); }
    car.stop(t + dur + 0.05); trem.stop(t + dur + 0.05);
  }

  /**
   * Brass section.
   *
   * Brass is the instrument family where "playing harder" is LEAST like
   * turning a volume knob. Blowing harder drives the air column non-linearly
   * and pours energy into the upper partials: a trumpet at ff has a spectral
   * centroid two to three times its pp centroid, which is why a real section
   * sounds like it is straining at the top of a phrase. The old version swept
   * its filter to `freq * 7` regardless of how hard it was played, so loud and
   * soft were the same waveform at different levels — measured centroid ratio
   * 1.000, the flattest possible result.
   *
   * 11 nodes: 3 osc, 4 gain (envelope, breath, send, and none for the saws —
   * they sum straight into the filter and the level lives in TRIM), 2 biquad,
   * 1 noise, 1 panner.
   */
  brass(t, freq, dur, gain = 0.22, out = null) {
    const ctx = this.ctx;
    const dest = this._seat(out || this.music, 'brass');
    const v = this._vel(gain);
    /* Kept modest on purpose: this scales the attack time and the filter
     * sweep, so it is heard as the section not quite arriving together. At
     * +/-12% the measured onset spread was over 10ms, which stops reading as
     * ensemble and starts reading as sloppy. */
    const hum = this._hum(0.07);

    /* HOW HARD IT IS BLOWN, IN HERTZ. Absolute, so the spectral envelope
     * stays put while the note moves through it — a bore is a fixed length of
     * tube and cannot follow the player's fingers. 700Hz is a soft, covered
     * note; ~6.9kHz is a section at full cry. */
    const openTo = 700 + v * v * 6200;
    /* Brass OVERSHOOTS on the attack: the reed-like lip buzz is brightest
     * before the standing wave settles, which is the "blat" at the front of a
     * stab. 1.35x for ~45ms, then it backs off. */
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 2.2;
    lp.frequency.setValueAtTime(420, t);
    lp.frequency.linearRampToValueAtTime(Math.min(12000, openTo * 1.35), t + 0.045 * hum);
    lp.frequency.exponentialRampToValueAtTime(openTo * 0.55, t + dur);

    /* THE BELL. Every brass instrument has a broad fixed resonance from the
     * flare of the bell — around 1200Hz on a trumpet — and it is most of why
     * a trumpet sounds like a trumpet and not like a sawtooth. It does not
     * move with the note; that is the whole point of metric E. */
    const bell = ctx.createBiquadFilter();
    bell.type = 'peaking';
    bell.frequency.value = 1250;
    bell.Q.value = 1.1;
    bell.gain.value = 7;

    /* THREE PLAYERS, NOT THREE OSCILLATORS. The detune spread is humanised
     * per note because a real section's intonation drifts — that slow beating
     * between players is what makes a section sound like several people. */
    const spread = 7 + Math.random() * 7;
    for (const k of [-1, 0, 1]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = freq;
      o.detune.value = k * spread + (Math.random() * 2 - 1) * 3;
      o.connect(lp);
      o.start(t); o.stop(t + dur + 0.05);
    }
    lp.connect(bell);

    const g = ctx.createGain();
    const peak = gain * TRIM.brass;
    /* A harder attack is a faster one — tonguing a loud note is a sharper
     * event than easing into a quiet one. */
    const atk = (0.045 - v * 0.028) * hum;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + atk);
    g.gain.setValueAtTime(peak, t + Math.max(atk + 0.01, dur * 0.6));
    g.gain.exponentialRampToValueAtTime(peak * 1e-3, t + dur);
    bell.connect(g);

    /* THE BREATH.
     *
     * Air noise through the mouthpiece, and it deliberately BYPASSES the tone
     * envelope. A player's air arrives before the standing wave does — the
     * chiff is already there while the note is still building over its 20-45ms
     * attack — so gating it with that same envelope would erase precisely the
     * cue the ear uses to identify a wind instrument. Band-limited around
     * 2kHz, which is where mouthpiece hiss actually lives. */
    const n = this.noiseSource(1);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1500 + v * 1400;
    bp.Q.value = 0.8;
    const bg = ctx.createGain();
    const breath = gain * TRIM.brass * (0.5 + v * 0.9);
    const breathEnd = t + 0.05 + (1 - v) * 0.05;
    bg.gain.setValueAtTime(breath * 0.25, t);
    bg.gain.linearRampToValueAtTime(breath, t + atk * 0.5);
    bg.gain.exponentialRampToValueAtTime(breath * 0.02, breathEnd);
    n.connect(bp); bp.connect(bg);
    n.start(t); n.stop(breathEnd + 0.02);

    /* WHERE THIS PLAYER IS STANDING.
     *
     * The only voice that pays a node per note for its position, and the
     * reason is that a section is not a point: Music.js calls this once per
     * chord tone, so cycling the seat per call spreads the chord physically
     * across the stage instead of stacking every note on one spot. Round-robin
     * rather than random so the section stays balanced left-to-right over any
     * few notes, with a wobble so it never sounds mechanical. */
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (pan) {
      const SEATS = [-0.72, 0.66, -0.34, 0.78, -0.55, 0.40];
      const seat = SEATS[(this._brassN = (this._brassN + 1) % SEATS.length)];
      pan.pan.value = Math.max(-1, Math.min(1, seat + (Math.random() * 2 - 1) * 0.08));
      g.connect(pan); bg.connect(pan); pan.connect(dest);
    } else {
      g.connect(dest); bg.connect(dest);
    }

    /* The send taps the tone only. Close-mic'd brass sends its body to the
     * room; the breath is a few centimetres from the player's face and never
     * reaches the far wall loudly enough to matter. */
    const send = ctx.createGain(); send.gain.value = 0.22;
    g.connect(send); send.connect(this._revFor(dest));
  }

  /**
   * Scat voice — a saw through three formant band-passes.
   * Vowel index picks the formant triple; this is what gives the
   * "da-ba-da-ba" feel without any samples.
   */
  scat(t, freq, dur, gain = 0.16, vowel = 0, out = null) {
    const ctx = this.ctx;
    const dest = out || this.music;
    const FORMANTS = [
      [730, 1090, 2440],   // "ah"
      [530, 1840, 2480],   // "eh"
      [270, 2290, 3010],   // "ee"
      [570, 840, 2410],    // "oh"
      [300, 870, 2240],    // "oo"
    ];
    const F = FORMANTS[vowel % FORMANTS.length];
    const v = this._vel(gain);

    /* ⚠ THE FORMANTS WERE ALREADY RIGHT, AND THAT IS WORTH SAYING OUT LOUD.
     * This voice measured a centroid slope of 0.308 while every other pitched
     * voice sat at 0.999-1.041 — it was the ONLY instrument in the file with a
     * fixed body, because a vocal tract is a fixed length and its resonances
     * do not move when you sing a higher note. The model for the whole rebuild
     * was already here, a few lines above the voices that needed it, and an
     * earlier diagnosis confidently listed it among the things that were
     * missing. Read the whole file before declaring a pattern absent.
     *
     * So this is not a rebuild. It is the three things the voice was missing
     * on top of a body that was already correct: dynamics, a consonant, and
     * any variation at all from one note to the next.
     */

    /* THE GLOTTIS. Singing harder does not move the formants — it changes the
     * SOURCE, because the vocal folds slam shut faster and the pulse acquires
     * a sharper corner. So velocity opens a lowpass on the saw ahead of the
     * tract, which is physically what is happening and also what metric A is
     * asking about. */
    const glottis = ctx.createBiquadFilter();
    glottis.type = 'lowpass';
    glottis.Q.value = 0.7;
    glottis.frequency.value = 700 + v * v * 4600;

    const src = ctx.createOscillator();
    src.type = 'sawtooth';
    // The scoop into the note, humanised — a singer does not land on the pitch
    // from exactly the same distance below it twice.
    const scoop = 0.975 + Math.random() * 0.017;
    src.frequency.setValueAtTime(freq * scoop, t);
    src.frequency.linearRampToValueAtTime(freq, t + 0.04 + Math.random() * 0.03);

    // Gentle vibrato once the note has settled. Rate and depth vary per note;
    // a metronomic vibrato is one of the most synthetic sounds there is.
    const vib = ctx.createOscillator();
    vib.type = 'sine';
    vib.frequency.value = 5.6 * this._hum(0.12);
    const vibG = ctx.createGain();
    vibG.gain.setValueAtTime(0, t);
    vibG.gain.linearRampToValueAtTime(freq * 0.012 * this._hum(0.25),
      t + Math.min(0.25, dur * 0.6));
    vib.connect(vibG); vibG.connect(src.frequency);

    /* THE CONSONANT, THROUGH THE SAME MOUTH.
     *
     * Scat singing is "doo", "bah", "dat" — the syllable begins with a tongue
     * or a lip releasing, and that release is a burst of noise shaped by the
     * very same tract as the vowel that follows it. Routing it through the
     * formants rather than around them is what makes it read as a mouth rather
     * than as a hiss laid over the top.
     *
     * It SHARES the vowel's filters rather than getting three of its own. The
     * first version built a duplicate set at wider Q, which is arguably a shade
     * more accurate — a plosive is broader than a vowel — and cost six extra
     * nodes on a voice already measuring 21 against a budget of 12. Sharing
     * makes the consonant slightly more voiced than a real plosive, which is a
     * far better trade than a melody line allocating twenty-one nodes a note. */
    const n = this.noiseSource(1);
    const ng = ctx.createGain();
    const puff = 0.9 + v * 2.2;
    ng.gain.setValueAtTime(puff, t);
    ng.gain.exponentialRampToValueAtTime(puff * 0.08, t + 0.016);
    ng.gain.exponentialRampToValueAtTime(puff * 1e-3, t + 0.05);
    n.connect(ng);
    n.start(t); n.stop(t + 0.06);

    const sum = ctx.createGain();
    src.connect(glottis);
    F.forEach((hz, i) => {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      // A few cents of wander per note: two utterances of the same syllable
      // are never made with quite the same shape of mouth.
      bp.frequency.value = hz * this._hum(0.03);
      bp.Q.value = 7 + i * 3;
      const bg = ctx.createGain(); bg.gain.value = [1, 0.55, 0.28][i];
      glottis.connect(bp);
      ng.connect(bp);
      bp.connect(bg); bg.connect(sum);
    });

    const g = ctx.createGain();
    const hum = this._hum(0.05);
    const peak = gain * TRIM.scat;
    // Relative floor; the sustain shelf is kept, because a sung note does hold.
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.018);
    g.gain.setValueAtTime(peak, t + Math.max(0.06, dur * 0.55));
    g.gain.exponentialRampToValueAtTime(peak * 1e-3, t + dur * hum);
    sum.connect(g); g.connect(dest);
    const send = ctx.createGain(); send.gain.value = 0.36;
    g.connect(send); send.connect(this._revFor(dest));

    src.start(t); vib.start(t);
    src.stop(t + dur + 0.05); vib.stop(t + dur + 0.05);
  }

  /* ---------------- percussion ---------------- */

  /* EVERY DRUM BELOW DECAYS TO A FLOOR PROPORTIONAL TO ITS OWN PEAK.
   *
   * The old kit ramped to an absolute 0.0001 from a peak of `gain`, so a loud
   * hit had further to fall in the same number of seconds and therefore died
   * FASTER, relative to itself, than a quiet one. `gain` was secretly a
   * note-length control, backwards, and it also meant that any drum built from
   * two parts with different decay floors changed its BALANCE with level: rim
   * measured a centroid ratio of 0.863, i.e. it got audibly darker the harder
   * it was hit. A relative floor makes level and length independent, which is
   * what lets velocity mean spectrum instead. */

  kick(t, gain = 0.9, out = null) {
    const ctx = this.ctx;
    const dest = this._seat(out || this.music, 'kick');
    const v = this._vel(gain);
    const hum = this._hum(0.03);

    /* THE PITCH ENVELOPE IS THE BEATER SPEED. A hard kick starts higher and
     * snaps down faster, because the head is driven further out of its resting
     * tension and returns more violently. 112Hz for a soft one up to ~188Hz
     * dug in, both settling onto the shell's own ~44Hz. */
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime((112 + v * 76) * hum, t);
    o.frequency.exponentialRampToValueAtTime(44 * hum, t + 0.055 + (1 - v) * 0.05);

    const g = ctx.createGain();
    const peak = gain * TRIM.kick;
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(peak * 1e-3, t + (0.24 + (1 - v) * 0.1) * hum);
    o.connect(g); g.connect(dest);
    o.start(t); o.stop(t + 0.36);

    /* THE BEATER.
     *
     * This noise source already existed and was already allocated per note —
     * and contributed 0.0% of the attack energy, because it was lowpassed at
     * 900Hz and so sat underneath a body that is far louder in exactly that
     * band. Turning up what is already in the graph is cheaper than adding
     * another source, so: move it to where felt-on-plastic actually lives
     * (2-4kHz), and scale it as v^2 so a soft kick is nearly pure body and a
     * hard one has a real click on the front. This is most of the kick's
     * dynamic timbre. */
    const n = this.noiseSource(1);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1900 + v * 2100;
    bp.Q.value = 0.7;
    const ng = ctx.createGain();
    const click = gain * TRIM.kick * (0.06 + v * v * 0.5);
    const clickEnd = t + 0.012 + v * 0.012;
    ng.gain.setValueAtTime(click, t);
    ng.gain.exponentialRampToValueAtTime(click * 1e-3, clickEnd);
    n.connect(bp); bp.connect(ng); ng.connect(dest);
    n.start(t); n.stop(clickEnd + 0.01);
  }

  snare(t, gain = 0.35, out = null) {
    const ctx = this.ctx;
    const dest = this._seat(out || this.music, 'snare');
    const v = this._vel(gain);
    const hum = this._hum(0.04);

    /* A SNARE IS TWO INSTRUMENTS AND VELOCITY DECIDES WHICH ONE YOU HEAR.
     *
     * Quietly, the head tone dominates and the wires barely rattle. Hit hard,
     * the wires slam against the bottom head and take over completely — the
     * sound goes from a dull thump to a bright crack, and the centroid moves
     * with it. Crossfading the two with velocity is the single most effective
     * thing available here, and the old version had neither part scaling. */
    const n = this.noiseSource(1);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1400 + v * 2400;
    bp.Q.value = 0.5 + (1 - v) * 0.7;
    const ng = ctx.createGain();
    const wires = gain * TRIM.snare * (0.45 + v * 0.55);
    ng.gain.setValueAtTime(wires, t);
    ng.gain.exponentialRampToValueAtTime(wires * 1e-3, t + (0.07 + v * 0.1) * hum);
    n.connect(bp); bp.connect(ng); ng.connect(dest);
    n.start(t); n.stop(t + 0.26);

    /* The head's two lowest modes. Absolute Hz, humanised only by the tiny
     * amount a real drum detunes as the head is struck off-centre — this is a
     * physical body and it does not move with anything. 1.60 is close to the
     * ideal circular membrane's second axisymmetric mode and is what stops the
     * pair sounding like a tuned interval. */
    const head = gain * TRIM.snare * (0.6 - v * 0.32);
    const og = ctx.createGain();
    og.gain.setValueAtTime(head, t);
    og.gain.exponentialRampToValueAtTime(head * 1e-3, t + (0.055 + (1 - v) * 0.035) * hum);
    for (const hz of [183, 292]) {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = hz * hum;
      o.connect(og);
      o.start(t); o.stop(t + 0.14);
    }
    og.connect(dest);

    const send = ctx.createGain(); send.gain.value = 0.3;
    ng.connect(send); send.connect(this._revFor(dest));
  }

  /** Cross-stick / rim click — the heartbeat of the bossa groove. */
  rim(t, gain = 0.34, out = null) {
    const ctx = this.ctx;
    const dest = this._seat(out || this.music, 'rim');
    const v = this._vel(gain);
    const hum = this._hum(0.05);

    /* Wood on wood. The crack brightens AND grows with how hard the stick is
     * laid in, while the shell ring stays roughly put — which is the right way
     * round. The old rim did the opposite by accident and got darker the
     * harder it was hit. */
    const n = this.noiseSource(1.4);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1700 + v * 3400;
    bp.Q.value = 1.1;
    const ng = ctx.createGain();
    const crack = gain * TRIM.rim * (0.6 + v * v * 1.1);
    ng.gain.setValueAtTime(crack, t);
    ng.gain.exponentialRampToValueAtTime(crack * 1e-3, t + (0.016 + (1 - v) * 0.012) * hum);
    n.connect(bp); bp.connect(ng); ng.connect(dest);
    n.start(t); n.stop(t + 0.06);

    // 415Hz is the shell speaking; it is a fixed lump of wood and stays put.
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = 415 * hum;
    const g = ctx.createGain();
    const ring = gain * TRIM.rim * (0.6 - v * 0.2);
    g.gain.setValueAtTime(ring, t);
    g.gain.exponentialRampToValueAtTime(ring * 1e-3, t + 0.05 * hum);
    o.connect(g); g.connect(dest);
    o.start(t); o.stop(t + 0.09);

    const send = ctx.createGain(); send.gain.value = 0.25;
    g.connect(send); send.connect(this._revFor(dest));
  }

  hat(t, gain = 0.14, open = false, out = null) {
    const ctx = this.ctx;
    const dest = this._seat(out || this.music, 'hat');
    const v = this._vel(gain);
    const hum = this._hum(0.06);

    /* The cheapest voice in the file and it has to stay that way — hats fire
     * on every other sixteenth in four of the kits, and again on top of that
     * in the hurry arrangement. 4 nodes.
     *
     * Struck harder, a cymbal does not merely get louder: the strike excites
     * higher modes and the whole thing rings brighter and longer. Velocity
     * therefore has to reach the tone, and the note below is about where. */
    const n = this.noiseSource(1.6);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    /* 4200Hz, fixed: this is what makes it a hi-hat and not a snare. Set as
     * low as the character allows on purpose — the shelf below can only
     * redistribute energy across whatever band survives this filter, and at
     * 6000Hz there were barely two octaves left up to Nyquist to work with. */
    hp.frequency.value = 4200;

    /* VELOCITY HAS TO CONTROL THE TOP OF THE BAND, NOT THE BOTTOM.
     *
     * The obvious move — sweep the highpass corner with velocity — does
     * nothing measurable, and it is worth writing down why. The source is
     * white noise running all the way to Nyquist, so the spectral centroid
     * sits around 12kHz and is set by where the band ENDS, not where it
     * starts; sliding the corner from 7kHz to 8.7kHz moved the centroid by
     * 2%. A shelf that actually removes the top octave for a light tap moves
     * it properly, and is also the better physical model: a soft stick barely
     * excites a cymbal's high modes, so a quiet hat is genuinely duller and
     * not merely smaller.
     *
     * The slope is set from the range Music.js ACTUALLY PLAYS, not from the
     * bench's probe gains. A hat in this score runs 0.05..0.24, which is
     * velocity 0.19..0.61 — the bench probes 0.15/0.45/0.90, i.e. 0.49..0.97,
     * a completely different part of the curve. Tuning the law to look good at
     * gain 0.90 put every in-game hat on the cut side of the shelf and made
     * the whole kit duller in the only place anyone will hear it. So the
     * slope is set to spend ~12dB across a ghost-to-accent hat, and the bench
     * reads whatever it reads further up the same straight line. */
    const ring = ctx.createBiquadFilter();
    ring.type = 'highshelf';
    ring.frequency.value = 7500;
    ring.gain.value = -20 + v * 28;
    const g = ctx.createGain();
    const peak = gain * TRIM.hat;
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(peak * 1e-3,
      t + (open ? 0.24 : 0.038) * (0.8 + v * 0.5) * hum);
    n.connect(hp); hp.connect(ring); ring.connect(g); g.connect(dest);
    n.start(t); n.stop(t + (open ? 0.34 : 0.08));
  }

  shaker(t, gain = 0.1, out = null) {
    const ctx = this.ctx;
    const dest = this._seat(out || this.music, 'shaker');
    const v = this._vel(gain);
    const hum = this._hum(0.07);

    /* Nearly the cheapest voice in the file and it has to stay that way:
     * samba and culture call this on EVERY sixteenth. 4 nodes, and the fourth
     * is spent for the same reason as the hat's shelf — a bandpass alone
     * rolls off at only 6dB/octave, so its skirt reaches Nyquist and pins the
     * centroid near the top whatever the centre is doing. Measured with the
     * centre sweeping 6.3kHz to 8.9kHz: the centroid moved 14%.
     *
     * A shaker's dynamics are almost entirely in the attack. Shaken harder,
     * more beads arrive at once and they arrive faster, so the burst gets
     * brighter and its onset gets sharper — the level barely matters by
     * comparison. */
    const n = this.noiseSource(1.2);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 4200 + v * 2600;
    bp.Q.value = 1.1;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 0.8;
    lp.frequency.value = 5500 + v * v * 14000;
    const g = ctx.createGain();
    const peak = gain * TRIM.shaker;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.012 * (1 - v * 0.6) * hum);
    g.gain.exponentialRampToValueAtTime(peak * 1e-3, t + 0.08 * hum);
    n.connect(bp); bp.connect(lp); lp.connect(g); g.connect(dest);
    n.start(t); n.stop(t + 0.14);
  }

  tom(t, freq = 190, gain = 0.3, out = null) {
    const ctx = this.ctx;
    const dest = this._seat(out || this.music, 'tom');
    const v = this._vel(gain);
    const hum = this._hum(0.04);

    /* The old tom was one sine and nothing else: 1 partial, spectral flux
     * 0.014, the purest "this is an oscillator" result in the file.
     *
     * A real drumhead has modes at roughly 1 : 1.59 : 2.14 — INHARMONIC, which
     * is exactly why a drum reads as a drum and a sine reads as a test tone.
     * Two of them is enough to stop it being a beep, and the second is cheap. */
    const g = ctx.createGain();
    const peak = gain * TRIM.tom;
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(peak * 1e-3, t + 0.24 * hum);
    const o2g = ctx.createGain();
    o2g.gain.value = 0.4;
    let i = 0;
    for (const ratio of [1, 1.59]) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      // heads drop in pitch as the strike tension relaxes; both modes do it
      o.frequency.setValueAtTime(freq * ratio * hum, t);
      o.frequency.exponentialRampToValueAtTime(freq * ratio * 0.62 * hum, t + 0.2);
      o.connect(i++ ? o2g : g);
      o.start(t); o.stop(t + 0.3);
    }
    o2g.connect(g);
    g.connect(dest);

    /* The stick. Absolute Hz — a wooden tip on a plastic head sounds the same
     * whatever the drum is tuned to, which is also what keeps this voice's
     * spectrum from being a pure transposition of itself at every pitch. */
    const n = this.noiseSource(1);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2200 + v * 2600;
    bp.Q.value = 0.9;
    const ng = ctx.createGain();
    const stick = gain * TRIM.tom * (0.15 + v * v * 0.7);
    const stickEnd = t + 0.014 + (1 - v) * 0.008;
    ng.gain.setValueAtTime(stick, t);
    ng.gain.exponentialRampToValueAtTime(stick * 1e-3, stickEnd);
    n.connect(bp); bp.connect(ng); ng.connect(dest);
    n.start(t); n.stop(stickEnd + 0.01);

    const send = ctx.createGain(); send.gain.value = 0.22;
    g.connect(send); send.connect(this._revFor(dest));
  }
}
