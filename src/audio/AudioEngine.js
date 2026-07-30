/* ============================================================
   Web Audio plumbing: buses, a procedurally generated reverb,
   a shared noise buffer, and the synth voices that everything
   else in the game is built from.

   Nothing here loads a file. Every sound is generated.
   ============================================================ */

const A4 = 440;

export function mtof(midi) { return A4 * Math.pow(2, (midi - 69) / 12); }

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.ready = false;
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

    this.music.connect(this.master);
    this.sfx.connect(this.master);
    this.master.connect(this.limiter);
    this.limiter.connect(ctx.destination);

    this.noise = this._makeNoise(2);
    this.ready = true;
    return ctx;
  }

/**
   * Which reverb a voice should feed: the one that returns into its own bus.
   * Anything not explicitly aimed at the sfx bus is music, which matches the
   * `out || this.music` default every voice already uses.
   */
  _revFor(dest) { return dest === this.sfx ? this.sfxSend : this.musicSend; }

  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }
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

  noiseSource(playbackRate = 1) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    s.playbackRate.value = playbackRate;
    return s;
  }

  /* ============================================================
     Voices. Each schedules itself at absolute time `t` and
     cleans up after itself.
     ============================================================ */

  /** Warm plucked bass — saw through a closing lowpass. */
  bass(t, freq, dur, gain = 0.5, out = null) {
    const ctx = this.ctx;
    const dest = out || this.music;
    const o = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    const f = ctx.createBiquadFilter();
    const g = ctx.createGain();
    o.type = 'sawtooth'; o.frequency.value = freq;
    o2.type = 'sine'; o2.frequency.value = freq / 2;
    f.type = 'lowpass';
    f.Q.value = 5;
    f.frequency.setValueAtTime(Math.min(6000, freq * 9), t);
    f.frequency.exponentialRampToValueAtTime(Math.max(90, freq * 1.6), t + Math.min(0.32, dur));
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(gain * 0.45, t + dur * 0.5);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f); o2.connect(f); f.connect(g); g.connect(dest);
    o.start(t); o2.start(t);
    o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
  }

  /** Nylon-string comp chord: short, bright, slightly detuned. */
  pluck(t, freq, dur, gain = 0.18, out = null) {
    const ctx = this.ctx;
    const dest = out || this.music;
    const g = ctx.createGain();
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq * 2.4;
    f.Q.value = 1.1;
    for (const [type, det, amp] of [['triangle', 0, 1], ['sawtooth', 6, 0.42]]) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      o.detune.value = det;
      const og = ctx.createGain();
      og.gain.value = amp;
      o.connect(og); og.connect(f);
      o.start(t); o.stop(t + dur + 0.05);
    }
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    f.connect(g); g.connect(dest);
    const send = ctx.createGain(); send.gain.value = 0.2;
    g.connect(send); send.connect(this._revFor(dest));
  }

  /** Vibraphone: sine with a touch of FM and a tremolo. */
  vibe(t, freq, dur, gain = 0.3, out = null) {
    const ctx = this.ctx;
    const dest = out || this.music;
    const car = ctx.createOscillator();
    car.type = 'sine'; car.frequency.value = freq;
    const mod = ctx.createOscillator();
    mod.type = 'sine'; mod.frequency.value = freq * 3.01;
    const modGain = ctx.createGain();
    modGain.gain.setValueAtTime(freq * 1.6, t);
    modGain.gain.exponentialRampToValueAtTime(freq * 0.05, t + 0.22);
    mod.connect(modGain); modGain.connect(car.frequency);

    const trem = ctx.createOscillator();
    trem.type = 'sine'; trem.frequency.value = 5.2;
    const tremGain = ctx.createGain(); tremGain.gain.value = 0.16;
    trem.connect(tremGain);

    const g = ctx.createGain();
    tremGain.connect(g.gain);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    car.connect(g); g.connect(dest);
    const send = ctx.createGain(); send.gain.value = 0.4;
    g.connect(send); send.connect(this._revFor(dest));

    car.start(t); mod.start(t); trem.start(t);
    car.stop(t + dur + 0.05); mod.stop(t + dur + 0.05); trem.stop(t + dur + 0.05);
  }

  /** Brass stab: detuned saws through a fast filter sweep. */
  brass(t, freq, dur, gain = 0.22, out = null) {
    const ctx = this.ctx;
    const dest = out || this.music;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.Q.value = 3;
    f.frequency.setValueAtTime(freq * 1.5, t);
    f.frequency.linearRampToValueAtTime(Math.min(8000, freq * 7), t + 0.06);
    f.frequency.exponentialRampToValueAtTime(Math.max(200, freq * 2), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.035);
    g.gain.setValueAtTime(gain, t + Math.max(0.05, dur * 0.6));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    for (const det of [-9, 0, 8]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth'; o.frequency.value = freq; o.detune.value = det;
      const og = ctx.createGain(); og.gain.value = 0.34;
      o.connect(og); og.connect(f);
      o.start(t); o.stop(t + dur + 0.05);
    }
    f.connect(g); g.connect(dest);
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
    const src = ctx.createOscillator();
    src.type = 'sawtooth';
    src.frequency.setValueAtTime(freq * 0.985, t);
    src.frequency.linearRampToValueAtTime(freq, t + 0.05);

    // gentle vibrato once the note has settled
    const vib = ctx.createOscillator(); vib.type = 'sine'; vib.frequency.value = 5.6;
    const vibG = ctx.createGain();
    vibG.gain.setValueAtTime(0, t);
    vibG.gain.linearRampToValueAtTime(freq * 0.012, t + Math.min(0.25, dur * 0.6));
    vib.connect(vibG); vibG.connect(src.frequency);

    const sum = ctx.createGain();
    F.forEach((hz, i) => {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = hz; bp.Q.value = 7 + i * 3;
      const bg = ctx.createGain(); bg.gain.value = [1, 0.55, 0.28][i];
      src.connect(bp); bp.connect(bg); bg.connect(sum);
    });

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.03);
    g.gain.setValueAtTime(gain, t + Math.max(0.06, dur * 0.55));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    sum.connect(g); g.connect(dest);
    const send = ctx.createGain(); send.gain.value = 0.36;
    g.connect(send); send.connect(this._revFor(dest));

    src.start(t); vib.start(t);
    src.stop(t + dur + 0.05); vib.stop(t + dur + 0.05);
  }

  /* ---------------- percussion ---------------- */

  kick(t, gain = 0.9, out = null) {
    const ctx = this.ctx;
    const dest = out || this.music;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(128, t);
    o.frequency.exponentialRampToValueAtTime(44, t + 0.09);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    // click
    const n = this.noiseSource(1);
    const nf = ctx.createBiquadFilter(); nf.type = 'lowpass'; nf.frequency.value = 900;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(gain * 0.32, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
    n.connect(nf); nf.connect(ng); ng.connect(dest);
    n.start(t); n.stop(t + 0.05);
    o.connect(g); g.connect(dest);
    o.start(t); o.stop(t + 0.3);
  }

  snare(t, gain = 0.35, out = null) {
    const ctx = this.ctx;
    const dest = out || this.music;
    const n = this.noiseSource(1);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1900; bp.Q.value = 0.9;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
    n.connect(bp); bp.connect(g); g.connect(dest);
    const send = ctx.createGain(); send.gain.value = 0.3; g.connect(send); send.connect(this._revFor(dest));
    n.start(t); n.stop(t + 0.2);
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = 190;
    const og = ctx.createGain();
    og.gain.setValueAtTime(gain * 0.5, t);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    o.connect(og); og.connect(dest); o.start(t); o.stop(t + 0.1);
  }

  /** Cross-stick / rim click — the heartbeat of the bossa groove. */
  rim(t, gain = 0.34, out = null) {
    const ctx = this.ctx;
    const dest = out || this.music;
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = 420;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    const n = this.noiseSource(1.4);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2600; bp.Q.value = 2;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(gain * 0.6, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);
    o.connect(g); g.connect(dest);
    n.connect(bp); bp.connect(ng); ng.connect(dest);
    const send = ctx.createGain(); send.gain.value = 0.25; g.connect(send); send.connect(this._revFor(dest));
    o.start(t); o.stop(t + 0.08);
    n.start(t); n.stop(t + 0.06);
  }

  hat(t, gain = 0.14, open = false, out = null) {
    const ctx = this.ctx;
    const dest = out || this.music;
    const n = this.noiseSource(1.6);
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 7200;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (open ? 0.24 : 0.038));
    n.connect(hp); hp.connect(g); g.connect(dest);
    n.start(t); n.stop(t + (open ? 0.3 : 0.06));
  }

  shaker(t, gain = 0.1, out = null) {
    const ctx = this.ctx;
    const dest = out || this.music;
    const n = this.noiseSource(1.2);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 6200; bp.Q.value = 1.4;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    n.connect(bp); bp.connect(g); g.connect(dest);
    n.start(t); n.stop(t + 0.12);
  }

  tom(t, freq = 190, gain = 0.3, out = null) {
    const ctx = this.ctx;
    const dest = out || this.music;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(freq * 0.62, t + 0.2);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
    o.connect(g); g.connect(dest);
    o.start(t); o.stop(t + 0.28);
  }
}
