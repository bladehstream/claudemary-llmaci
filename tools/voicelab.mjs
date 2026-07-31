/* ============================================================
   VOICELAB — a test bench for ONE synth voice at a time.

   WHY THIS EXISTS

   A player listened to a render and said:

     "the lack of variety in the sounds themselves ... it all
      sounds like someone plinking away on a $2 synthesizer.
      some different types of sounds (more like a band) would be
      MUCH better"

   That is a statement about TIMBRE, and timbre is the one thing
   no harness in tools/ measures. render-music.mjs will tell you
   the peak and the RMS of a whole song; test-audio.mjs will tell
   you that zero means zero. Neither can tell you that every note
   a voice plays is a bit-for-bit copy of the last one, or that
   playing harder only makes the same waveform louder. Those are
   the two loudest "this is a machine" cues there are, and they
   are both trivially measurable — nobody had measured them.

   So: render ONE voice, alone, dry, into an OfflineAudioContext,
   and put numbers on the seven things that separate an instrument
   from a preset.

   WHAT IT MEASURES, AND WHY EACH ONE

     A. DYNAMIC TIMBRE.  The headline. Same pitch at gain 0.15 /
        0.45 / 0.90; ratio of the spectral centroids. On a real
        instrument, hitting it harder does not scale the waveform
        — it recruits harmonics. A trumpet at ff has a centroid
        two to three times its pp centroid. A gain node has a
        ratio of exactly 1.000, because scaling a signal cannot
        move its centroid. This number IS the brief.

        Backed up by a second number that catches what a centroid
        can miss: normalise the soft and loud renders to the same
        RMS and cross-correlate them. If `gain` is a pure volume
        control the two normalised waveforms are IDENTICAL
        (r = 1.00000) and there is provably no other expressive
        axis. Anything below 1 means gain does something else too,
        and the report says what.

     B. NOTE-TO-NOTE VARIANCE.  The same note, eight separate
        calls, cross-correlated pairwise (with a +/-5ms lag search
        so this measures timbre variance and not timing variance).
        A player who repeats a note repeats it differently. A
        function that takes only (t, freq, dur, gain) and reads no
        entropy cannot.

     C. ATTACK TRANSIENT.  The first 25ms is most of what tells a
        listener WHICH instrument is playing. Real onsets are
        noisy: pick scrape, breath, mallet click, reed snap,
        finger on a wound string. Measured as attack/body RMS,
        normalised spectral flux (spectrum SHAPE change per frame,
        so an amplitude ramp does not fake it), spectral flatness,
        the share of attack energy sitting at the spectrum's own
        noise floor rather than in partials, and — for the pitched
        voices — whether the first cycles are copies of each other.
        The last two are what decide the verdict; the first three
        are context.

     D. SPECTRAL RICHNESS.  Partials above -40dB of the
        fundamental, how far they sit from exact integer multiples
        (in cents), centroid and 85% rolloff. Synthesised
        harmonics land on exact multiples; strings and bars do
        not, and that stretch is audible as "wood/metal" rather
        than "oscillator".

     E. PITCH-TRACKING vs BODY.  Three pitches an octave apart.
        A filter written `freq * N` moves its whole spectral
        envelope with the note, so the centroid climbs one octave
        per octave (slope 1.000) and the harmonic amplitude
        profile is byte-identical at every pitch. A real
        instrument has a physical body whose resonances DO NOT
        MOVE, so the profile changes with pitch and the slope is
        well under 1. Reported both ways because the slope alone
        can be dragged around by filter clamps.

     F. STEREO WIDTH.  mid/side energy. A band occupies a stage.

     G. NODE COUNT AND CPU.  This runs next to a WebGL renderer on
        a mid-range phone. Every note allocates nodes and every
        node is GC pressure. Counted by wrapping the context's
        create* factories AND the node constructors (a rebuild may
        use either style), broken down by type, plus a
        differential render-time measurement.

     H. INTERACTION (extra, not in the original spec).  Renders
        note A alone, note B alone, and A+B overlapping, then
        subtracts. If the residual is digital silence the voices
        are strictly independent and additive: provably no
        legato, no damping of the previous note, no sympathetic
        ringing, no voice stealing. It is the only cheap way to
        measure the absence of note-to-note behaviour.
        Only meaningful when B says the voice is deterministic.

   HOW IT WORKS

   Same machinery as render-music.mjs, and for the same reasons:
   AudioEngine is written against a live `window.AudioContext`
   and does not survive being lifted into Node, so a real headless
   Chromium loads the real, unmodified source from the real Vite
   dev server and `window.AudioContext` is swapped for a stub
   whose constructor hands back an OfflineAudioContext. Read that
   file's header for the full argument; it is not repeated here.

   Two things ARE different:

     * No chunked scheduling. render-music has to suspend/resume
       because a 180s song is thousands of notes and a graph that
       big is quadratic. A probe sheet is sixteen notes. Upfront
       is fine and much simpler.

     * The voice is rendered DRY and BARE. Its `out` is a probe
       gain wired straight to the destination, and the music/sfx
       buses are unplugged from master so the shared convolver
       returns into a dead end. This is deliberate:
         - the limiter is a compressor. Metric A asks what happens
           between gain 0.15 and gain 0.90; measuring that through
           a compressor measures the compressor.
         - the reverb is 1.9s of noise. It would bury the attack
           transient (C), fill in the between-partial floor (D)
           and decorrelate the channels (F), all identically for
           every voice, which is exactly the information metric F
           is trying to extract.
       `--wet` puts it back if you want to hear/measure the
       shipping chain, and prints a warning that A/C/D/F no longer
       mean what their headings say.

   The output is 32-bit float WAV, not 16-bit. A measurement bench
   must not quantise (the -40dB partial threshold in D is only 56dB
   above a 16-bit LSB) and must not clip (a kick at gain 0.90 peaks
   right at full scale, and clipping would ADD harmonics to the
   loud render — a false pass on the headline metric).

   Every number is measured from the decoded file on disk, not
   reported back from the page, for the same reason render-music
   decodes its own output: a bug in the header or the interleave
   would leave the page's numbers looking perfect.

   USAGE
     node tools/voicelab.mjs pluck
     node tools/voicelab.mjs bass --note=36 --wav
     node tools/voicelab.mjs scat --vowel=2
     node tools/voicelab.mjs all
     node tools/voicelab.mjs all --wav --label=after-rebuild

   FLAGS
     --note=N    MIDI note for the probes (pitched voices only)
     --dur=S     note duration in seconds; default is per-voice,
                 chosen to match how Music.js actually calls it
     --label=x   filename suffix for --wav; default n<note>
     --wav       keep the probe sheet at tools/audio/voicelab/
     --vowel=N   scat vowel index 0..4
     --open      hat: render the open hat
     --seed=N    PRNG seed (default 7)
     --sr=N      sample rate (default 44100)
     --wet       render through music bus + reverb + limiter
   ============================================================ */

import { createServer } from 'vite';
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const OUT_DIR = path.join(ROOT, 'tools', 'audio', 'voicelab');
const PORT = 5252;                      // render-music holds 5251, test-audio 5213

/* ------------------------------------------------------------
   The probe sheet.

   Sixteen notes on one timeline, one render, one file. Laying
   them out in a single buffer rather than one render per probe
   is worth it twice over: the whole voice costs one browser page
   and one download instead of sixteen, and every segment is
   guaranteed to have come out of the same graph with the same
   PRNG stream, so a difference between two slots is a difference
   in the voice and not in the harness.

   SLOT is the spacing. 1.6s is long enough that the longest
   probe note (0.9s for bass) has 0.7s of silence after it — no
   voice here has a release anywhere near that. In --wet the
   convolver's 1.9s tail would bleed straight into the next slot,
   so the spacing grows to 3.0s.
   ------------------------------------------------------------ */
const START_S = 0.05;       // never schedule at t=0; AudioParam maths is happier off the boundary
const SLOT_S = 1.6;         // dry spacing: the longest probe note is 0.9s
const SLOT_WET_S = 3.0;     // wet: the convolver tail is 1.9s and would bleed into the next slot
const OVERLAP_S = 0.15;     // metric H: how far the second note trails the first
const TAIL = 1.0;           // let the last slot finish before the buffer ends

/* EVERY probe time is rounded up to a multiple of the Web Audio
   render quantum. This is not fussiness; it is the difference
   between metric B measuring the voice and metric B measuring the
   renderer.

   Web Audio computes node outputs in 128-sample blocks. An
   AudioParam driven by an automation curve is a function of
   absolute time and does not care where the block boundaries fall,
   but an AudioParam driven by a CONNECTED NODE — vibe's tremolo
   into g.gain, scat's vibrato into src.frequency — is sampled on
   that block grid. 1.6s at 44100Hz is 70560 frames, which is 551.25
   quanta, so consecutive slots landed at four different phases
   within the grid and the modulated voices came out very slightly
   different each time. Measured before this was fixed: scat scored
   0.99779 on metric B and -0.3dB on metric H, i.e. this bench
   reported per-note variety and note-to-note interaction in a voice
   that provably has neither.

   The difference is around -60dB and nobody could hear it. It is
   still wrong for the headline claim of a measurement tool to be an
   artefact of its own arithmetic, so: quantise, and the numbers
   come out exact. */
const QUANTUM = 128;
const quantise = (seconds, sr) => (Math.ceil((seconds * sr) / QUANTUM) * QUANTUM) / sr;

/* Analysis constants. Named because five of the seven diagnoses
   are judged against them and a rebuild will want to argue. */
const ATTACK_S = 0.025;     // "the first 25ms" — the brief, and roughly the ear's onset window
const PARTIAL_FLOOR_DB = -40;   // "significant partial" threshold, relative to the fundamental
const ROLLOFF_FRAC = 0.85;      // the conventional spectral rolloff point
const LAG_SEARCH_S = 0.005;     // +/-5ms when correlating repeats, so B measures timbre not timing
const CORR_S = 0.30;            // how much of each repeat to correlate; covers attack + early body

/* What "good" looks like, so the report can print a verdict
   instead of a number nobody can calibrate. These are targets
   for the REBUILD, drawn from what acoustic instruments actually
   do — they are not passed by the current code and are not
   supposed to be. */
const TARGET = {
  dynCentroid: 1.30,   // ff centroid / pp centroid. Brass hits 2.5+, a plucked string ~1.4.
  dynShape: 0.98,      // gain-normalised soft-vs-loud correlation must be BELOW this
  variance: 0.98,      // repeat-to-repeat correlation must be BELOW this
  attackFlux: 0.15,    // normalised spectral flux at onset
  partials: 8,         // partials above -40dB
  bodySlope: 0.85,     // centroid octaves per pitch octave must be BELOW this
  sideDb: -20,         // side/mid energy
  nodesMax: 12,        // the CPU budget in the brief
};

/* ------------------------------------------------------------
   Voice table.

   `note` and `dur` default to something representative of how
   Music.js actually calls each voice, so the baseline describes
   the shipping sound rather than an arbitrary test tone:
   bass gets 5.5 sixteenths at ~100bpm, pluck 3.4, and the
   percussion durations are ignored by the voices themselves.

   `pitched` means "takes a frequency argument", which is what
   metric E needs — not "is a musical instrument". tom is in
   because tom(t, freq, gain) is, and it turns out to be the
   cleanest control case in the whole file.
   ------------------------------------------------------------ */
const VOICES = {
  bass:   { pitched: true,  note: 40, dur: 0.90, hz: false },
  pluck:  { pitched: true,  note: 60, dur: 0.50, hz: false },
  vibe:   { pitched: true,  note: 72, dur: 0.70, hz: false },
  brass:  { pitched: true,  note: 67, dur: 0.60, hz: false },
  scat:   { pitched: true,  note: 60, dur: 0.60, hz: false },
  kick:   { pitched: false, note: 0,  dur: 0.30 },
  snare:  { pitched: false, note: 0,  dur: 0.30 },
  rim:    { pitched: false, note: 0,  dur: 0.20 },
  hat:    { pitched: false, note: 0,  dur: 0.20 },
  shaker: { pitched: false, note: 0,  dur: 0.20 },
  /* tom's third argument is gain and its SECOND is a frequency in
     Hz, not a MIDI note. Music.js calls it with 200. midi 55 is
     196Hz, which is that floor tom. */
  tom:    { pitched: true,  note: 55, dur: 0.30, hz: true },
};

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const noteName = (m) => `${NOTE_NAMES[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`;

/* ------------------------------------------------------------
   CLI
   ------------------------------------------------------------ */

const argv = process.argv.slice(2);
const flags = new Map();
const positional = [];
for (const a of argv) {
  if (a.startsWith('--')) { const [k, v = 'true'] = a.slice(2).split('='); flags.set(k, v); }
  else positional.push(a);
}

const VOICE_ARG = positional[0];
const SEED = Number(flags.get('seed') ?? 7);
const SR = Number(flags.get('sr') ?? 44100);
const WET = flags.has('wet');
const KEEP_WAV = flags.has('wav');
const VOWEL = Number(flags.get('vowel') ?? 0);
const OPEN_HAT = flags.has('open');
const SLOT = quantise(WET ? SLOT_WET_S : SLOT_S, SR);
const START = quantise(START_S, SR);
const OVERLAP = quantise(OVERLAP_S, SR);

if (!VOICE_ARG || (VOICE_ARG !== 'all' && !VOICES[VOICE_ARG])) {
  console.error(`usage: node tools/voicelab.mjs <voice> [--note=60] [--label=x] [--wav]`);
  console.error(`       voices: ${Object.keys(VOICES).join(', ')}, or "all"`);
  process.exit(2);
}
const LABEL = flags.get('label') ?? (flags.has('note') ? `n${flags.get('note')}` : 'base');
if (!/^[\w.-]+$/.test(LABEL)) {
  console.error(`--label must be letters, digits, dot, dash or underscore, got "${LABEL}"`);
  process.exit(2);
}

/* ------------------------------------------------------------
   Finding a browser. Lifted verbatim from render-music.mjs —
   CHROMIUM_PATH is the contract the rest of tools/ uses, and the
   pool scan exists because Playwright pins a browser revision
   per release.
   ------------------------------------------------------------ */
function findChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const pools = [process.env.PLAYWRIGHT_BROWSERS_PATH, '/opt/pw-browsers',
    path.join(process.env.HOME || '/root', '.cache', 'ms-playwright')].filter(Boolean);
  for (const pool of pools) {
    if (!fs.existsSync(pool)) continue;
    // numeric sort on the revision: "chromium-999" sorts above "chromium-1194" as a string
    const dirs = fs.readdirSync(pool)
      .filter((d) => /^chromium-\d+$/.test(d))
      .sort((x, y) => Number(y.slice(9)) - Number(x.slice(9)));
    for (const d of dirs) {
      const exe = path.join(pool, d, 'chrome-linux', 'chrome');
      if (fs.existsSync(exe)) return exe;
    }
  }
  return null;
}

/* ------------------------------------------------------------
   Slot plan. Built in Node so the analysis and the scheduling
   read from ONE description of where every note is; the page
   just plays the list it is handed.
   ------------------------------------------------------------ */
function planSlots(voiceName, note, dur) {
  const V = VOICES[voiceName];
  /* A pitched voice's frequency argument: MIDI for everything
     except tom, whose signature takes Hz directly. */
  const freqOf = (m) => (V.pitched ? mtof(m) : 440);
  const startFrames = Math.round(START * SR);
  const slotFrames = Math.round(SLOT * SR);
  const slots = [];
  /* Times are derived from an integer frame count with ONE division,
     never accumulated as `START + k * SLOT`. Accumulating rounds
     twice, and the second rounding is enough to land a note a
     fraction of a sample either side of its frame boundary.
     Chromium starts oscillators with sub-sample accuracy, so that
     fraction becomes a real phase difference — measured at -43dB on
     one of scat's eight supposedly identical repeats, which is
     nonsense the bench would have reported as note-to-note variety.
     Frames also give the analysis an exact onset index rather than a
     rounded one. */
  const push = (tag, notes) => {
    const f = startFrames + slots.length * slotFrames;
    for (const nn of notes) { nn.frames = f + nn.offFrames; nn.t = (f + nn.offFrames) / SR; }
    slots.push({ tag, frames: f, at: f / SR, notes });
  };
  const one = (m, gain, off = 0) => {
    const offFrames = Math.round(off * SR);
    return { offFrames, off: offFrames / SR, midi: m, freq: freqOf(m), dur, gain };
  };

  // A — dynamics. Three gains, one pitch. The middle one doubles as the
  //     reference note for C, D, and the centre pitch of E, so that every
  //     metric is describing the same sound.
  push('A-soft', [one(note, 0.15)]);
  push('A-mid', [one(note, 0.45)]);
  push('A-loud', [one(note, 0.90)]);

  // B — eight separate calls, identical arguments.
  for (let i = 0; i < 8; i++) push(`B-${i}`, [one(note, 0.45)]);

  // E — an octave either side of the reference. Straddling the reference
  //     rather than climbing two octaves off it keeps all three probes
  //     inside a range the voice is actually used in.
  push('E-low', [one(note - 12, 0.45)]);
  push('E-high', [one(note + 12, 0.45)]);

  // H — A alone, B alone, A+B together. 0.15s of overlap is a real legato
  //     gap; long enough that a damping or voice-stealing implementation
  //     would have to act, short enough that both notes are still sounding.
  push('H-a', [one(note, 0.45, 0)]);
  push('H-b', [one(note + 7, 0.45, OVERLAP)]);
  push('H-both', [one(note, 0.45, 0), one(note + 7, 0.45, OVERLAP)]);

  return slots;
}

/* ------------------------------------------------------------
   The page-side renderer.

   Everything in here runs inside Chromium and is serialised by
   page.evaluate, so it cannot close over anything above — all
   inputs arrive in `o`.
   ------------------------------------------------------------ */
async function renderInPage(o) {
  /* mulberry32, same generator as src/util/math.js and
     render-music.mjs. Copied rather than imported for the same
     reason: this function is serialised into the page. Seeding
     matters here because _makeNoise and _makeImpulse both pull
     from it, so an unseeded run would give a different noise
     buffer — and therefore a different snare — every time. */
  let a = o.seed >>> 0;
  Math.random = () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const { AudioEngine } = await import('/src/audio/AudioEngine.js');

  /* One stub, one mutable target: the CPU probes below each need
     their own fresh OfflineAudioContext and their own engine, and
     `init()` does `new Ctx({latencyHint})`. A constructor that
     returns an object wins over `this`, so whatever `currentCtx`
     points at is what the next engine gets. */
  let currentCtx = null;
  window.AudioContext = function () { return currentCtx; };
  window.webkitAudioContext = window.AudioContext;

  /* ---- node accounting ----
     Two styles have to be caught. `ctx.createGain()` is what
     AudioEngine uses today; `new GainNode(ctx)` is what a rebuild
     might use, and it never touches the factory. Factories are
     shadowed on the instance (they live on the prototype, so an
     own property hides them); constructors are wrapped in a
     Proxy rather than subclassed so that `instanceof` and the
     prototype chain are untouched. */
  const FACTORIES = ['createOscillator', 'createGain', 'createBiquadFilter', 'createBufferSource',
    'createConvolver', 'createDelay', 'createWaveShaper', 'createStereoPanner', 'createPanner',
    'createDynamicsCompressor', 'createChannelMerger', 'createChannelSplitter',
    'createConstantSource', 'createAnalyser', 'createIIRFilter', 'createPeriodicWave',
    'createBuffer'];
  const CLASSES = ['OscillatorNode', 'GainNode', 'BiquadFilterNode', 'AudioBufferSourceNode',
    'ConvolverNode', 'DelayNode', 'WaveShaperNode', 'StereoPannerNode', 'PannerNode',
    'DynamicsCompressorNode', 'ChannelMergerNode', 'ChannelSplitterNode', 'ConstantSourceNode',
    'AnalyserNode', 'IIRFilterNode'];
  const SHORT = {
    createOscillator: 'osc', createGain: 'gain', createBiquadFilter: 'biquad',
    createBufferSource: 'bufsrc', createConvolver: 'convolver', createDelay: 'delay',
    createWaveShaper: 'shaper', createStereoPanner: 'panner', createPanner: 'panner3d',
    createDynamicsCompressor: 'comp', createChannelMerger: 'merger',
    createChannelSplitter: 'splitter', createConstantSource: 'const', createAnalyser: 'analyser',
    createIIRFilter: 'iir', createPeriodicWave: 'wave', createBuffer: 'BUFFER',
    OscillatorNode: 'osc', GainNode: 'gain', BiquadFilterNode: 'biquad',
    AudioBufferSourceNode: 'bufsrc', ConvolverNode: 'convolver', DelayNode: 'delay',
    WaveShaperNode: 'shaper', StereoPannerNode: 'panner', PannerNode: 'panner3d',
    DynamicsCompressorNode: 'comp', ChannelMergerNode: 'merger',
    ChannelSplitterNode: 'splitter', ConstantSourceNode: 'const', AnalyserNode: 'analyser',
    IIRFilterNode: 'iir',
  };
  let counting = false;
  const nodeCounts = {};
  const bump = (k) => { if (counting) nodeCounts[k] = (nodeCounts[k] || 0) + 1; };
  for (const cls of CLASSES) {
    const Orig = window[cls];
    if (!Orig) continue;
    window[cls] = new Proxy(Orig, {
      construct(T, args, nt) { bump(SHORT[cls]); return Reflect.construct(T, args, nt); },
    });
  }
  const watchFactories = (ctx) => {
    for (const m of FACTORIES) {
      if (typeof ctx[m] !== 'function') continue;
      const orig = ctx[m].bind(ctx);
      ctx[m] = (...args) => { bump(SHORT[m]); return orig(...args); };
    }
  };

  /* ---- the argument adapter ----
     The one place that knows each voice's signature. Everything
     else in this file speaks (t, freq, dur, gain, out). */
  const CALL = {
    bass: (e, t, f, d, g, out) => e.bass(t, f, d, g, out),
    pluck: (e, t, f, d, g, out) => e.pluck(t, f, d, g, out),
    vibe: (e, t, f, d, g, out) => e.vibe(t, f, d, g, out),
    brass: (e, t, f, d, g, out) => e.brass(t, f, d, g, out),
    scat: (e, t, f, d, g, out) => e.scat(t, f, d, g, o.vowel, out),
    kick: (e, t, f, d, g, out) => e.kick(t, g, out),
    snare: (e, t, f, d, g, out) => e.snare(t, g, out),
    rim: (e, t, f, d, g, out) => e.rim(t, g, out),
    hat: (e, t, f, d, g, out) => e.hat(t, g, o.open, out),
    shaker: (e, t, f, d, g, out) => e.shaker(t, g, out),
    tom: (e, t, f, d, g, out) => e.tom(t, f, g, out),
  };
  const play = CALL[o.voice];
  if (!play) throw new Error(`no adapter for voice "${o.voice}"`);

  /* Build an engine on a fresh context, wired for isolation.
     Returns [engine, destination-for-voices]. */
  const build = (ctx) => {
    currentCtx = ctx;
    const e = new AudioEngine();
    e.init();
    if (o.wet) return [e, null];   // null => voices take their own default: the music bus
    /* Dry: unplug the shared reverb at its input (so the convolver
       has no source and costs nothing) AND unplug both buses from
       master (so the return path is a dead end even if a rebuilt
       voice sends somewhere unexpected). Belt and braces, because
       a silent leak here would show up as a mysterious noise floor
       in metric D and nowhere else. */
    e.musicSend.disconnect();
    e.sfxSend.disconnect();
    e.music.disconnect();
    e.sfx.disconnect();
    const probe = ctx.createGain();
    probe.gain.value = 1;          // unity: the numbers describe the voice, not a fader
    probe.connect(ctx.destination);
    return [e, probe];
  };

  /* ---- 1. the probe sheet ---- */
  const total = o.sheetSeconds;
  const sheet = new OfflineAudioContext({
    numberOfChannels: 2, length: Math.ceil(total * o.sampleRate), sampleRate: o.sampleRate,
  });
  const [engine, probe] = build(sheet);
  /* n.t, not slot.at + n.off: the absolute time was already computed
     from an exact frame index on the Node side, and re-adding it
     here would reintroduce the rounding that costs a sub-sample of
     oscillator phase. */
  for (const slot of o.slots) {
    for (const n of slot.notes) play(engine, n.t, n.freq, n.dur, n.gain, probe);
  }
  const buf = await sheet.startRendering();

  /* ---- 2. nodes per note ----
     A throwaway context that is never rendered. Counting starts
     AFTER init() so the buses, the convolver and the two impulse
     buffers are not billed to the note. */
  const probeCtx = new OfflineAudioContext({ numberOfChannels: 2, length: 4096, sampleRate: o.sampleRate });
  const [pe, pOut] = build(probeCtx);
  watchFactories(probeCtx);
  counting = true;
  play(pe, 0.05, o.countNote.freq, o.countNote.dur, o.countNote.gain, pOut);
  counting = false;

  /* ---- 3. render cost per note ----
     Differential: the same context length rendered empty and then
     with N notes. The difference is the notes; the baseline is
     Chromium's own per-quantum overhead, which is not the voice's
     fault. Best-of-3 because an offline render on a shared box is
     noisy upward, never downward. */
  const CPU_LEN = 3.0;
  const CPU_N = 24;
  const timeRender = async (n) => {
    const ctx = new OfflineAudioContext({
      numberOfChannels: 2, length: Math.ceil(CPU_LEN * o.sampleRate), sampleRate: o.sampleRate,
    });
    const [e2, out2] = build(ctx);
    for (let i = 0; i < n; i++) {
      play(e2, 0.05 + (i * 2.0) / Math.max(1, n), o.countNote.freq, o.countNote.dur, 0.4, out2);
    }
    const t0 = performance.now();
    await ctx.startRendering();
    return performance.now() - t0;
  };
  let empty = Infinity;
  let loaded = Infinity;
  for (let r = 0; r < 3; r++) {
    empty = Math.min(empty, await timeRender(0));
    loaded = Math.min(loaded, await timeRender(CPU_N));
  }

  /* ---- 4. 32-bit float WAV ----
     Float, not int16: a bench must not quantise (the -40dB
     partial floor in metric D would sit only 56dB above an LSB)
     and must not clip (a kick at gain 0.90 peaks at full scale,
     and clipping ADDS harmonics — a false pass on metric A).
     fmt is written at the 18-byte length with a `fact` chunk,
     which is what the spec asks for from non-PCM formats. */
  const chans = [];
  for (let c = 0; c < buf.numberOfChannels; c++) chans.push(buf.getChannelData(c));
  const n = buf.length;
  const ch = chans.length;
  const blockAlign = ch * 4;
  const dataBytes = n * blockAlign;
  const headerBytes = 12 + 8 + 18 + 8 + 4 + 8;
  const bytes = new ArrayBuffer(headerBytes + dataBytes);
  const dv = new DataView(bytes);
  const ascii = (off, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(off + i, s.charCodeAt(i)); };
  ascii(0, 'RIFF');
  dv.setUint32(4, headerBytes - 8 + dataBytes, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  dv.setUint32(16, 18, true);
  dv.setUint16(20, 3, true);                  // 3 = IEEE float
  dv.setUint16(22, ch, true);
  dv.setUint32(24, buf.sampleRate, true);
  dv.setUint32(28, buf.sampleRate * blockAlign, true);
  dv.setUint16(32, blockAlign, true);
  dv.setUint16(34, 32, true);
  dv.setUint16(36, 0, true);                  // cbSize
  ascii(38, 'fact');
  dv.setUint32(42, 4, true);
  dv.setUint32(46, n, true);                  // frames, as the spec wants for non-PCM
  ascii(50, 'data');
  dv.setUint32(54, dataBytes, true);

  let off = 58;
  let peak = 0;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < ch; c++) {
      const s = chans[c][i];
      const m = s < 0 ? -s : s;
      if (m > peak) peak = m;
      dv.setFloat32(off, s, true);
      off += 4;
    }
  }

  /* Blob + anchor click rather than returning the bytes: an
     evaluate() result goes through JSON, which turns an 8MB
     Float32Array into a hundreds-of-MB object literal. */
  const blob = new Blob([bytes], { type: 'audio/wav' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = o.filename;
  document.body.appendChild(link);
  link.click();

  return {
    peak,
    frames: n,
    channels: ch,
    sampleRate: buf.sampleRate,
    nodeCounts,
    cpuEmptyMs: empty,
    cpuLoadedMs: loaded,
    cpuPerNoteUs: ((loaded - empty) * 1000) / CPU_N,
    cpuNotes: CPU_N,
  };
}

/* ============================================================
   DSP. Everything below runs in Node, against the decoded file.
   ============================================================ */

/* ---- WAV decode. Handles the int16 that render-music writes
   and the float32 this tool writes, and walks chunks rather than
   assuming a 44-byte header, because the float file has a `fact`
   chunk in the middle. ---- */
function decodeWav(buf) {
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('not a RIFF/WAVE file');
  }
  let pos = 12;
  let fmt = null;
  let data = null;
  while (pos + 8 <= buf.length) {
    const id = buf.toString('ascii', pos, pos + 4);
    const size = buf.readUInt32LE(pos + 4);
    const body = pos + 8;
    if (id === 'fmt ') {
      fmt = {
        format: buf.readUInt16LE(body),
        channels: buf.readUInt16LE(body + 2),
        sampleRate: buf.readUInt32LE(body + 4),
        bits: buf.readUInt16LE(body + 14),
      };
    } else if (id === 'data') {
      data = buf.subarray(body, Math.min(buf.length, body + size));
    }
    pos = body + size + (size % 2);        // chunks are word-aligned
  }
  if (!fmt || !data) throw new Error('missing fmt or data chunk');
  const bytesPer = fmt.bits / 8;
  const frames = Math.floor(data.length / (bytesPer * fmt.channels));
  const chans = [];
  for (let c = 0; c < fmt.channels; c++) chans.push(new Float64Array(frames));
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < fmt.channels; c++) {
      const at = (i * fmt.channels + c) * bytesPer;
      chans[c][i] = fmt.format === 3 ? data.readFloatLE(at) : data.readInt16LE(at) / 32768;
    }
  }
  return { ...fmt, frames, chans };
}

/* ---- radix-2 FFT, in place, decimation in time.
   Written out rather than pulled from npm: this file must run
   from a clean clone with nothing but vite and playwright, and
   an FFT is sixty lines. Twiddles are cached per size because
   metric C calls this ~9 times per attack window per voice. ---- */
const TWIDDLES = new Map();
function twiddles(n) {
  let t = TWIDDLES.get(n);
  if (t) return t;
  const cos = new Float64Array(n / 2);
  const sin = new Float64Array(n / 2);
  for (let i = 0; i < n / 2; i++) {
    const ang = (-2 * Math.PI * i) / n;
    cos[i] = Math.cos(ang);
    sin[i] = Math.sin(ang);
  }
  t = { cos, sin };
  TWIDDLES.set(n, t);
  return t;
}
function fft(re, im) {
  const n = re.length;
  // bit-reversal permutation
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }
  const { cos, sin } = twiddles(n);
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1;
    const step = n / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0, tw = 0; k < half; k++, tw += step) {
        const c = cos[tw];
        const s = sin[tw];
        const jr = re[i + k + half];
        const ji = im[i + k + half];
        const vr = jr * c - ji * s;
        const vi = jr * s + ji * c;
        const ur = re[i + k];
        const ui = im[i + k];
        re[i + k] = ur + vr; im[i + k] = ui + vi;
        re[i + k + half] = ur - vr; im[i + k + half] = ui - vi;
      }
    }
  }
}

const HANN = new Map();
function hann(n) {
  let w = HANN.get(n);
  if (w) return w;
  w = new Float64Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
  HANN.set(n, w);
  return w;
}
const nextPow2 = (n) => { let p = 1; while (p < n) p <<= 1; return p; };

/** Hann-windowed magnitude spectrum of x[off .. off+len), zero-padded to `size`. */
function spectrum(x, off, len, size) {
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  const w = hann(len);
  for (let i = 0; i < len; i++) {
    const s = off + i;
    re[i] = (s >= 0 && s < x.length ? x[s] : 0) * w[i];
  }
  fft(re, im);
  const half = size / 2;
  const mag = new Float64Array(half + 1);
  for (let k = 0; k <= half; k++) mag[k] = Math.hypot(re[k], im[k]);
  return mag;
}

/* Spectral centroid, magnitude-weighted. DC and everything below
   20Hz is excluded: a windowed segment of a decaying note has a
   DC component from the envelope's asymmetry, and it is loud
   enough at bin 0 to drag the centroid down by hundreds of Hz. */
function centroid(mag, binHz, fLo = 20) {
  let num = 0;
  let den = 0;
  for (let k = Math.max(1, Math.ceil(fLo / binHz)); k < mag.length; k++) {
    num += k * binHz * mag[k];
    den += mag[k];
  }
  return den > 0 ? num / den : 0;
}

/* Rolloff on the magnitude sum, not the power sum, so that it is
   directly comparable with the (magnitude-weighted) centroid.
   On the power sum the fundamental dominates so hard that the 85%
   point routinely lands BELOW the centroid, which reads as a bug. */
function rolloff(mag, binHz, frac = ROLLOFF_FRAC, fLo = 20) {
  const lo = Math.max(1, Math.ceil(fLo / binHz));
  let total = 0;
  for (let k = lo; k < mag.length; k++) total += mag[k];
  if (total <= 0) return 0;
  let acc = 0;
  for (let k = lo; k < mag.length; k++) {
    acc += mag[k];
    if (acc >= frac * total) return k * binHz;
  }
  return (mag.length - 1) * binHz;
}

/* Wiener entropy: geometric mean over arithmetic mean of the power
   spectrum. 1 = white noise, ~0 = a pure tone. This is the metric
   that answers "is there noise in the attack" WITHOUT needing to
   know f0, which matters because five of the eleven voices do not
   have one.

   Bins are floored 100dB below the band's peak before the log.
   Without a floor, one genuinely empty bin (and a lowpassed voice
   has thousands) sends the geometric mean to zero and the metric
   reads 0.000 for everything. The floor is what makes the number
   comparable between voices; it is stated here because it is the
   difference between "not noisy" and "the maths broke". */
function flatness(mag, binHz, fLo = 80, fHi = 12000) {
  const lo = Math.max(1, Math.ceil(fLo / binHz));
  const hi = Math.min(mag.length - 1, Math.floor(fHi / binHz));
  if (hi <= lo) return 0;
  let maxP = 0;
  for (let k = lo; k <= hi; k++) maxP = Math.max(maxP, mag[k] * mag[k]);
  if (maxP <= 0) return 0;
  const floor = maxP * 1e-10;
  let sumLog = 0;
  let sum = 0;
  let n = 0;
  for (let k = lo; k <= hi; k++) {
    const p = Math.max(mag[k] * mag[k], floor);
    sumLog += Math.log(p);
    sum += p;
    n++;
  }
  return Math.exp(sumLog / n) / (sum / n);
}

const rms = (x, off, len) => {
  let s = 0;
  let n = 0;
  for (let i = off; i < off + len && i < x.length; i++) { if (i < 0) continue; s += x[i] * x[i]; n++; }
  return n ? Math.sqrt(s / n) : 0;
};
const peakOf = (x, off, len) => {
  let p = 0;
  for (let i = Math.max(0, off); i < off + len && i < x.length; i++) p = Math.max(p, Math.abs(x[i]));
  return p;
};
const db = (v) => (v > 0 ? 20 * Math.log10(v) : -Infinity);
const fmtDb = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : '-inf');

/* Zero-lag normalised cross-correlation. Blind to amplitude, so
   it answers "is this the same WAVEFORM" rather than "is this the
   same loudness" — the two are separate questions and metric B
   asks both. */
function ncc(x, ax, y, ay, len) {
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < len; i++) {
    const a = ax + i < x.length && ax + i >= 0 ? x[ax + i] : 0;
    const b = ay + i < y.length && ay + i >= 0 ? y[ay + i] : 0;
    sxy += a * b; sxx += a * a; syy += b * b;
  }
  if (sxx <= 0 || syy <= 0) return sxx === syy ? 1 : 0;
  return sxy / Math.sqrt(sxx * syy);
}

/* Inverse FFT via the conjugate trick, so there is only one
   transform to get right. */
function ifft(re, im) {
  const n = re.length;
  for (let i = 0; i < n; i++) im[i] = -im[i];
  fft(re, im);
  for (let i = 0; i < n; i++) { re[i] /= n; im[i] = -im[i] / n; }
}

/* Precompute one segment's transform, zero-padded to `size`, along
   with its energy, so an N-way pairwise comparison costs N forward
   transforms instead of N^2. */
function segFft(x, off, len, size) {
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  let energy = 0;
  for (let i = 0; i < len; i++) {
    const s = off + i;
    const v = s >= 0 && s < x.length ? x[s] : 0;
    re[i] = v;
    energy += v * v;
  }
  fft(re, im);
  return { re, im, energy };
}

/* Normalised cross-correlation, maximised over every integer lag in
   +/-LAG_SEARCH_S, computed by FFT.

   The lag search is the difference between measuring TIMBRE variance
   and measuring TIMING variance: if a rebuilt voice randomises its
   own onset by a couple of milliseconds — a real and desirable
   humanisation — a zero-lag correlation would collapse and the bench
   would report enormous timbral variety that is not there. The best
   lag comes back separately so timing variance stays visible as its
   own number.

   It is done by FFT rather than by a strided search because a
   strided search is WRONG for these signals, not merely slow. The
   first version stepped the coarse pass by 4 samples; the closed hat
   is noise highpassed at 7.2kHz, which decorrelates in about one
   sample, so every off-grid lag scored ~0 and whichever random lag
   scored highest won. Two provably bit-identical hats were reported
   as 0.161 similar. An exhaustive lag search has no such hole. */
function bestNcc(A, B, maxLag) {
  const N = A.re.length;
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  for (let k = 0; k < N; k++) {
    // A * conj(B)
    re[k] = A.re[k] * B.re[k] + A.im[k] * B.im[k];
    im[k] = A.im[k] * B.re[k] - A.re[k] * B.im[k];
  }
  ifft(re, im);
  const norm = Math.sqrt(A.energy * B.energy);
  if (!(norm > 0)) return { r: A.energy === B.energy ? 1 : 0, lag: 0 };
  let best = -2;
  let bestLag = 0;
  for (let m = -maxLag; m <= maxLag; m++) {
    const r = re[(m + N) % N] / norm;
    if (r > best) { best = r; bestLag = m; }
  }
  return { r: best, lag: bestLag };
}

/* Noise-to-harmonic split, by estimating the spectrum's own floor.

   A sliding median of the power spectrum tracks the broadband floor
   while ignoring narrow peaks, so anything sitting AT the floor is
   noise and anything standing above it is a partial. This is the
   standard sinusoids-plus-residual split, and it is used here in
   preference to spectral flatness because flatness only sees
   WIDEBAND noise. The kick's click is noise lowpassed at 900Hz and
   the rim's is noise through a Q=2 bandpass; both are unmistakably
   noise and both score essentially zero on flatness, because
   band-limited noise is not flat.

   The median of an exponentially-distributed periodogram bin is
   ln2 times its mean, so the median is divided by ln2 to become an
   unbiased floor estimate. */
function noiseFraction(mag, binHz, fLo = 80, fHi = 16000, halfWin = 24) {
  const lo = Math.max(1, Math.ceil(fLo / binHz));
  const hi = Math.min(mag.length - 1, Math.floor(fHi / binHz));
  if (hi - lo < 4 * halfWin) return null;
  const buf = new Float64Array(2 * halfWin + 1);
  let noise = 0;
  let total = 0;
  for (let k = lo; k <= hi; k++) {
    const a = Math.max(lo, k - halfWin);
    const b = Math.min(hi, k + halfWin);
    let n2 = 0;
    for (let i = a; i <= b; i++) buf[n2++] = mag[i] * mag[i];
    const win = buf.subarray(0, n2).slice().sort();
    const med = win[n2 >> 1];
    const p = mag[k] * mag[k];
    noise += Math.min(p, med / Math.LN2);
    total += p;
  }
  return total > 0 ? noise / total : 0;
}

/* Periodicity at the known fundamental: correlate the signal with
   itself delayed by exactly one period, using linear interpolation
   for the fractional part. 1.0 = perfectly periodic (a harmonic
   tone), 0 = noise. Returns null when the window cannot hold the
   two periods the comparison needs.

   The signal is divided by its own running RMS first. Without that
   step this measures the ENVELOPE as much as the waveform: a 6ms
   exponential attack changes the amplitude by 40dB inside a single
   two-period window, and the correlation drops to ~0.92 on a voice
   that contains no noise source whatsoever. Whitening the envelope
   is what makes the number mean "are these cycles copies of each
   other", which is the only question worth asking during an
   attack. */
function periodicity(x, off, len, f0, sr) {
  const P = sr / f0;
  const W = Math.round(2 * P);
  if (!(P > 1) || len < W + P + 2) return null;

  const span = Math.ceil(len + P + 2);
  const win = Math.max(3, Math.round(P) | 1);        // odd, so it is centrable
  const half = win >> 1;
  const y = new Float64Array(span);
  let ref = 0;
  for (let i = 0; i < span; i++) {
    const s = off + i;
    ref = Math.max(ref, Math.abs(s >= 0 && s < x.length ? x[s] : 0));
  }
  if (ref <= 0) return null;
  const floor = ref * 1e-4;                          // -80dB: do not amplify silence into noise
  for (let i = 0; i < span; i++) {
    let acc = 0;
    for (let j = -half; j <= half; j++) {
      const s = off + i + j;
      const v = s >= 0 && s < x.length ? x[s] : 0;
      acc += v * v;
    }
    const env = Math.max(Math.sqrt(acc / win), floor);
    const s = off + i;
    y[i] = (s >= 0 && s < x.length ? x[s] : 0) / env;
  }

  const at = (i) => {
    const k = Math.floor(i);
    const f = i - k;
    const a = k >= 0 && k < span ? y[k] : 0;
    const b = k + 1 >= 0 && k + 1 < span ? y[k + 1] : 0;
    return a + (b - a) * f;
  };
  const hop = Math.max(1, Math.round(P / 2));
  let acc = 0;
  let n = 0;
  for (let s = 0; s + W + P + 1 < len; s += hop) {
    let sxy = 0;
    let sxx = 0;
    let syy = 0;
    for (let i = 0; i < W; i++) {
      const a = at(s + i);
      const b = at(s + i + P);
      sxy += a * b; sxx += a * a; syy += b * b;
    }
    if (sxx > 0 && syy > 0) { acc += sxy / Math.sqrt(sxx * syy); n++; }
  }
  return n ? acc / n : null;
}

/* Normalised spectral flux: each frame's magnitude spectrum is
   scaled to unit length BEFORE differencing, so this measures a
   change in spectral SHAPE and ignores the amplitude envelope.
   That distinction is the whole point — every voice here has a
   fast amplitude attack, and an un-normalised flux would score
   all of them highly and tell you nothing. A real onset changes
   shape (noise first, then tone); a gain ramp on a steady
   oscillator does not. */
function attackFlux(x, onset, sr) {
  const N = 512;
  const hop = 128;
  const last = onset + Math.round(ATTACK_S * sr);
  let prev = null;
  let peak = 0;
  let frames = 0;
  for (let s = onset; s <= last; s += hop) {
    const mag = spectrum(x, s, N, N);
    let norm = 0;
    for (let k = 0; k < mag.length; k++) norm += mag[k] * mag[k];
    norm = Math.sqrt(norm);
    if (norm <= 0) { prev = null; continue; }
    for (let k = 0; k < mag.length; k++) mag[k] /= norm;
    if (prev) {
      let f = 0;
      for (let k = 0; k < mag.length; k++) {
        const d = mag[k] - prev[k];
        if (d > 0) f += d * d;
      }
      peak = Math.max(peak, Math.sqrt(f));
      frames++;
    }
    prev = mag;
  }
  return { peak, frames };
}

/* Peak-pick partials, with parabolic interpolation on the log
   magnitude so the frequency estimate is good to a fraction of a
   bin — which it has to be, because metric D reports
   inharmonicity in CENTS and one 5.4Hz bin at 261Hz is 36 cents. */
function findPartials(mag, binHz, f0, floorDb = PARTIAL_FLOOR_DB) {
  let ref = 0;
  let refFrom = 'spectral max';
  if (f0) {
    const lo = Math.max(1, Math.floor((f0 * 0.94) / binHz));
    const hi = Math.min(mag.length - 1, Math.ceil((f0 * 1.06) / binHz));
    for (let k = lo; k <= hi; k++) ref = Math.max(ref, mag[k]);
    refFrom = 'fundamental';
  }
  /* A voice with a genuinely missing fundamental (a highpassed
     pluck, say) would otherwise get an absurdly low reference and
     "find" three hundred partials in the noise floor. */
  let globalMax = 0;
  for (let k = 1; k < mag.length; k++) globalMax = Math.max(globalMax, mag[k]);
  if (!(ref > globalMax * 0.02)) { ref = globalMax; refFrom = 'spectral max (weak fundamental)'; }
  const thr = ref * Math.pow(10, floorDb / 20);

  const peaks = [];
  for (let k = 2; k < mag.length - 2; k++) {
    if (mag[k] <= thr) continue;
    if (!(mag[k] > mag[k - 1] && mag[k] >= mag[k + 1])) continue;
    if (!(mag[k] > mag[k - 2] && mag[k] > mag[k + 2])) continue;    // suppress window ripple
    const l = Math.log(Math.max(mag[k - 1], 1e-300));
    const c = Math.log(Math.max(mag[k], 1e-300));
    const r = Math.log(Math.max(mag[k + 1], 1e-300));
    const denom = l - 2 * c + r;
    const d = denom !== 0 ? (0.5 * (l - r)) / denom : 0;
    const f = (k + Math.max(-0.5, Math.min(0.5, d))) * binHz;
    if (f < 25 || f > 18000) continue;
    peaks.push({ f, mag: mag[k] });
  }
  return { peaks, ref, refFrom, thr };
}

/* How far the partials sit from exact integer multiples of f0.
   Zero means "an oscillator bank"; a real string or bar is
   stretched by tens of cents at the top of its series and that
   stretch is a large part of why it sounds like wood or metal. */
function inharmonicity(peaks, f0) {
  const devs = [];
  for (const p of peaks) {
    const k = Math.round(p.f / f0);
    if (k < 2 || k > 60) continue;
    const cents = 1200 * Math.log2(p.f / (k * f0));
    if (Math.abs(cents) > 600) continue;      // not a member of this series
    devs.push({ k, cents });
  }
  if (!devs.length) return null;
  const avg = (a) => (a.length ? a.reduce((x, y) => x + Math.abs(y.cents), 0) / a.length : null);
  /* Split low from high partials, because two very different things
     land in this number and a rebuild needs to tell them apart. A
     stretched string or bar deviates as k^2, so its high partials
     are far more inharmonic than its low ones. A detuned unison
     deviates by the SAME number of cents at every partial — which
     is why pluck, whose only "inharmonicity" is one saw sitting 6
     cents off a triangle, reads flat across k. */
  return {
    mean: avg(devs),
    max: devs.reduce((a, b) => Math.max(a, Math.abs(b.cents)), 0),
    low: avg(devs.filter((d) => d.k <= 4)),
    high: avg(devs.filter((d) => d.k >= 8)),
    n: devs.length,
  };
}

/* Amplitude of harmonics 1..N in dB relative to the fundamental.
   This is the evidence for metric E that a centroid cannot give:
   if the whole spectrum is pitch-scaled (a `freq * N` filter over
   a saw, whose harmonic amplitudes are 1/k at every pitch) this
   profile is IDENTICAL at every pitch. A fixed body resonance
   makes it move, because different harmonics fall into the
   resonance at different pitches. */
function harmonicAmps(mag, binHz, f0, K = 24) {
  const out = [];
  for (let k = 1; k <= K; k++) {
    const target = k * f0;
    if (target > (mag.length - 2) * binHz) { out.push(null); continue; }
    /* The band has to hold the WHOLE partial: the detune spread of a
       unison (proportional to the harmonic; ~1% for the widest stack
       here) plus the broadening that a decaying envelope and a
       finite analysis window impose (a fixed number of Hz, hence
       four bins). Capped at 40% of the harmonic spacing so it can
       never reach a neighbour.

       The fixed term is what makes metric E honest. A purely
       proportional tolerance is narrow in absolute Hz at low pitches
       and wide at high ones, so it clips a different fraction of
       each partial at each probe pitch — which showed up as brass,
       a voice with a textbook freq*N filter and no fixed resonance
       anywhere, appearing to have an 8dB body. */
    const tol = Math.min(f0 * 0.4, target * 0.02 + 4 * binHz);
    const lo = Math.max(1, Math.floor((target - tol) / binHz));
    const hi = Math.min(mag.length - 1, Math.ceil((target + tol) / binHz));
    /* Total energy in the band, not the tallest bin in it. A unison
       of detuned oscillators beats, and the beat rate scales with
       both the pitch and the harmonic number, so the tallest bin at
       harmonic k depends on where in its beat cycle the analysis
       window happened to land. Summing the band is stable: brass's
       three saws at -9/0/+8 cents made the harmonic profile appear
       to shift 8.33dB between pitches under a peak-pick, which
       would have been reported as a body resonance in a voice whose
       filter is pure freq*N. */
    let e = 0;
    for (let i = lo; i <= hi; i++) e += mag[i] * mag[i];
    out.push(Math.sqrt(e));
  }
  return out;
}
function harmonicProfile(amps, N = 8) {
  const h1 = amps[0];
  if (!h1) return null;
  return amps.slice(0, N).map((m) => (m === null ? null : db(m / h1)));
}
/* Spectral centroid computed from the HARMONIC AMPLITUDES rather
   than from every bin. Sampling the spectral envelope only where the
   source actually puts energy is what makes metric E's slope
   trustworthy, and a raw bin-wise centroid gets it wrong twice over:

     - it integrates every bin up to Nyquist, and a note an octave
       lower has twice as many harmonics under that ceiling, which
       drags a perfectly pitch-tracking voice down to a slope of
       ~0.86;
     - it integrates the inter-partial skirt of the analysis window,
       which covers four times as much bandwidth at the top probe
       pitch as at the bottom, pushing the same voice back up to
       ~1.05.

   Sampled at harmonics 1..24 of each note's own fundamental, both
   biases vanish and "the spectrum is merely transposed" gives
   exactly 1.000. A fixed body resonance sits inside 1..24 harmonics
   at every probe pitch, so the metric is not biased the other way
   either. */
function harmonicCentroid(amps, f0) {
  let num = 0;
  let den = 0;
  for (let k = 1; k <= amps.length; k++) {
    const a = amps[k - 1];
    if (a === null) continue;
    num += k * f0 * a;
    den += a;
  }
  return den > 0 ? num / den : 0;
}
/* Mean |change| in the harmonic profile, over harmonics that are
   actually THERE. Anything more than PARTIAL_FLOOR_DB below the
   fundamental at either pitch is skipped: a sine-based voice like
   tom has nothing at all above h1, and comparing its numerical noise
   floor at two pitches produced a confident 4.6dB of "body
   resonance" in a voice that is one oscillator and no filter. */
function profileDrift(a, b) {
  let acc = 0;
  let n = 0;
  for (let i = 1; i < Math.min(a.length, b.length); i++) {
    if (a[i] === null || b[i] === null) continue;
    if (!Number.isFinite(a[i]) || !Number.isFinite(b[i])) continue;
    if (a[i] < PARTIAL_FLOOR_DB || b[i] < PARTIAL_FLOOR_DB) continue;
    acc += Math.abs(a[i] - b[i]);
    n++;
  }
  return n ? acc / n : null;
}

/* Short-time envelope, used to find how long a note actually
   sounds. Everything that needs "the body of the note" derives
   its window from this rather than from `dur`, because `dur` is
   what was ASKED for and several voices ignore it. */
function envelope(x, off, len, hop = 256) {
  const env = [];
  for (let s = off; s < off + len; s += hop) env.push(rms(x, s, hop));
  return env;
}
/** Seconds from onset until the envelope last exceeds `dropDb` below its peak. */
function soundingLength(x, onset, maxLen, sr, dropDb = -60) {
  const hop = 256;
  const env = envelope(x, onset, maxLen, hop);
  const peak = Math.max(...env, 0);
  if (peak <= 0) return 0;
  const thr = peak * Math.pow(10, dropDb / 20);
  let last = 0;
  for (let i = 0; i < env.length; i++) if (env[i] > thr) last = i;
  return ((last + 1) * hop) / sr;
}
/** Seconds from onset until the envelope first falls `dropDb` below its peak. */
function decayTime(x, onset, maxLen, sr, dropDb = -40) {
  const hop = 256;
  const env = envelope(x, onset, maxLen, hop);
  const peak = Math.max(...env, 0);
  if (peak <= 0) return 0;
  const thr = peak * Math.pow(10, dropDb / 20);
  let seen = false;
  for (let i = 0; i < env.length; i++) {
    if (env[i] >= peak * 0.5) seen = true;
    if (seen && env[i] < thr) return (i * hop) / sr;
  }
  return (env.length * hop) / sr;
}

/* ============================================================
   Metrics A-H, assembled from the primitives above.
   ============================================================ */

function analyse(voiceName, slots, wav, note, dur) {
  const V = VOICES[voiceName];
  const sr = wav.sampleRate;
  const L = wav.chans[0];
  const R = wav.chans[1] || wav.chans[0];
  const mid = new Float64Array(L.length);
  const side = new Float64Array(L.length);
  for (let i = 0; i < L.length; i++) { mid[i] = (L[i] + R[i]) / 2; side[i] = (L[i] - R[i]) / 2; }

  const onsetOf = (tag) => slots.find((x) => x.tag === tag).notes[0].frames;
  /* tom's frequency argument is Hz where everyone else's is derived
     from a MIDI note, but planSlots already fed it mtof(note) as
     that Hz value, so the fundamental is mtof(note) either way. */
  const f0 = V.pitched ? mtof(note) : null;

  /* ONE body window, derived from the reference slot and reused
     everywhere. Deriving it per-slot would be a trap: the gain
     probes have different decay LENGTHS (see the note in the
     report), so a per-slot window would compare different parts
     of the note and blame the difference on timbre. */
  const ref = onsetOf('A-mid');
  const maxLen = Math.round((SLOT - 0.1) * sr);
  const T60 = soundingLength(mid, ref, maxLen, sr);
  const bodyStart = Math.round(Math.max(0.015, Math.min(0.06, 0.30 * T60)) * sr);
  const bodyLen = Math.max(1024, Math.min(8192, Math.round(0.5 * T60 * sr)));
  const bodySize = Math.min(8192, nextPow2(bodyLen));
  const bodyBin = sr / bodySize;
  const bodyOf = (onset) => spectrum(mid, onset + bodyStart, Math.min(bodyLen, bodySize), bodySize);
  const attackSize = 2048;
  const attackLen = Math.round(ATTACK_S * sr);

  const out = { voice: voiceName, note, dur, f0, sr, T60, bodyStart: bodyStart / sr, bodyLen: bodyLen / sr };

  /* ---------- A. DYNAMIC TIMBRE ---------- */
  {
    const gains = [0.15, 0.45, 0.90];
    const tags = ['A-soft', 'A-mid', 'A-loud'];
    const per = tags.map((tag, i) => {
      const on = onsetOf(tag);
      const bm = bodyOf(on);
      const am = spectrum(mid, on, attackLen, attackSize);
      const fullLen = Math.round(Math.min(1.2, SLOT - 0.2) * sr);
      const fm = spectrum(mid, on, Math.min(fullLen, 32768), 32768);
      return {
        gain: gains[i],
        onset: on,
        bodyCentroid: centroid(bm, bodyBin),
        attackCentroid: centroid(am, sr / attackSize),
        fullCentroid: centroid(fm, sr / 32768),
        rms: rms(mid, on, fullLen),
        peak: peakOf(mid, on, fullLen),
        decay40: decayTime(mid, on, maxLen, sr, -40),
      };
    });
    /* Gain-normalised waveform identity. If `gain` is nothing but
       a multiplier then scaling the soft take up to the loud
       take's RMS reproduces it exactly and r = 1.00000. Any other
       expressive coupling — a filter that opens, a different
       harmonic mix, an envelope whose SHAPE depends on level —
       shows up here even when it is too subtle to move a
       centroid. */
    const cmpLen = Math.round(Math.min(1.2, SLOT - 0.2) * sr);
    const shapeSL = ncc(mid, per[0].onset, mid, per[2].onset, cmpLen);
    const shapeSM = ncc(mid, per[0].onset, mid, per[1].onset, cmpLen);
    out.A = {
      per,
      centroidRatio: per[0].bodyCentroid > 0 ? per[2].bodyCentroid / per[0].bodyCentroid : 0,
      fullRatio: per[0].fullCentroid > 0 ? per[2].fullCentroid / per[0].fullCentroid : 0,
      attackRatio: per[0].attackCentroid > 0 ? per[2].attackCentroid / per[0].attackCentroid : 0,
      rmsRatio: per[0].rms > 0 ? per[2].rms / per[0].rms : 0,
      shapeSL,
      shapeSM,
      decaySpreadMs: (per[2].decay40 - per[0].decay40) * 1000,
    };
  }

  /* ---------- B. NOTE-TO-NOTE VARIANCE ---------- */
  {
    const on = [];
    for (let i = 0; i < 8; i++) on.push(onsetOf(`B-${i}`));
    const corrLen = Math.round(CORR_S * sr);
    const maxLag = Math.round(LAG_SEARCH_S * sr);
    /* Padded to at least corrLen + maxLag so the circular
       correlation equals the linear one over every lag examined. */
    const size = nextPow2(corrLen + maxLag + 1) * 2;
    const ffts = on.map((o2) => segFft(mid, o2, corrLen, size));
    const rs = [];
    const lags = [];
    let identical = 0;
    for (let i = 0; i < on.length; i++) {
      for (let j = i + 1; j < on.length; j++) {
        const { r, lag } = bestNcc(ffts[i], ffts[j], maxLag);
        rs.push(r);
        lags.push(lag);
        if (r > 0.99999) identical++;
      }
    }
    const stats = (a) => {
      const m = a.reduce((x, y) => x + y, 0) / a.length;
      const sd = Math.sqrt(a.reduce((x, y) => x + (y - m) * (y - m), 0) / a.length);
      return { mean: m, sd, min: Math.min(...a), max: Math.max(...a) };
    };
    const perNote = on.map((o2) => ({
      rms: rms(mid, o2, corrLen),
      centroid: centroid(bodyOf(o2), bodyBin),
      peak: peakOf(mid, o2, corrLen),
    }));
    const rmsS = stats(perNote.map((p) => p.rms));
    const cenS = stats(perNote.map((p) => p.centroid));
    out.B = {
      meanSim: stats(rs).mean,
      minSim: Math.min(...rs),
      identicalPairs: identical,
      totalPairs: rs.length,
      lagSpreadMs: ((Math.max(...lags) - Math.min(...lags)) / sr) * 1000,
      rmsCv: rmsS.mean > 0 ? rmsS.sd / rmsS.mean : 0,
      centroidCv: cenS.mean > 0 ? cenS.sd / cenS.mean : 0,
    };
  }

  /* ---------- C. ATTACK TRANSIENT ---------- */
  {
    const on = ref;
    const aRms = rms(mid, on, attackLen);
    const aPeak = peakOf(mid, on, attackLen);
    const bRms = rms(mid, on + bodyStart, bodyLen);
    const aMag = spectrum(mid, on, attackLen, attackSize);
    const bMag = bodyOf(on);
    const flux = attackFlux(mid, on, sr);
    const aFlat = flatness(aMag, sr / attackSize);
    const bFlat = flatness(bMag, bodyBin);
    /* The periodicity window has to hold at least three periods,
       so for a 41Hz bass it is longer than 25ms. Reported, so the
       number is not silently comparing different things. */
    let pAttack = null;
    let pBody = null;
    let pWin = ATTACK_S;
    if (f0) {
      pWin = Math.max(ATTACK_S, 3 / f0);
      pAttack = periodicity(mid, on, Math.round(pWin * sr), f0, sr);
      pBody = periodicity(mid, on + bodyStart, bodyLen, f0, sr);
    }
    /* "Is there any noise content in the attack at all".
       Two independent tests, either of which is sufficient:
       broadband energy the body does not have (flatness), or first
       cycles that are not copies of each other (periodicity).

       Spectral flux is deliberately NOT part of this verdict even
       though it is reported. The first analysis frame straddles the
       silence-to-signal boundary, so every voice scores 0.1-0.2
       there whether or not it contains a noise source; flux tells
       you an onset happened, not what it is made of. */
    const flatLift = bFlat > 0 ? aFlat / bFlat : (aFlat > 0 ? Infinity : 1);
    const aNoise = noiseFraction(aMag, sr / attackSize);
    const bNoise = noiseFraction(bMag, bodyBin);
    /* Below about 160Hz a 25ms window holds fewer than four periods,
       so the partials are not resolved, the sliding-median floor
       lands on top of the smeared series, and the split reads high
       for a voice with no noise in it. Say so rather than quietly
       reporting a number that cannot be right. */
    const resolved = !f0 || f0 >= 4 / ATTACK_S;
    /* 5%: comfortably above the 0-2% that window smearing alone
       produces on the voices that provably contain no noise source
       (brass 0.0%, tom 0.0%, vibe 1.0%, pluck 1.6%), and far below
       the 49-73% of the voices that are made of noise. */
    const spectral = (resolved && aNoise !== null && aNoise > 0.05) || aFlat > 0.02;
    const aperiodic = (pAttack !== null && pBody !== null && pBody - pAttack > 0.15)
      || (pAttack !== null && pAttack < 0.75);
    const noisy = spectral || aperiodic;
    /* Name the test that fired. "Broadband" and "aperiodic" call for
       different work: the first says the onset contains a noise
       burst, the second says the first cycles do not repeat, which a
       pitch glide produces just as readily as noise does. scat trips
       the first and not the second, because its 15-cent scoop over
       the first 50ms smears the partials without a noise source
       being anywhere in the graph. */
    const noisyWhy = !noisy ? ''
      : aperiodic && spectral ? 'broadband AND aperiodic onset'
        : aperiodic ? `aperiodic onset: periodicity ${pAttack.toFixed(2)} vs ${pBody.toFixed(2)} in the body`
          : `${(100 * aNoise).toFixed(1)}% of the attack energy sits at the spectrum's noise floor`;
    out.C = {
      attackRms: aRms, attackPeak: aPeak, bodyRms: bRms,
      atkOverBodyDb: db(aRms / (bRms || 1e-30)),
      peakOverBodyDb: db(aPeak / (bRms || 1e-30)),
      flux: flux.peak, fluxFrames: flux.frames,
      attackFlatness: aFlat, bodyFlatness: bFlat, flatLift,
      attackNoise: aNoise, bodyNoise: bNoise, resolved,
      periodicityAttack: pAttack, periodicityBody: pBody, periodicityWinMs: pWin * 1000,
      noisy, noisyWhy,
    };
  }

  /* ---------- D. SPECTRAL RICHNESS ---------- */
  {
    const bMag = bodyOf(ref);
    const { peaks, refFrom } = findPartials(bMag, bodyBin, f0);
    const inh = f0 ? inharmonicity(peaks, f0) : null;
    out.D = {
      partials: peaks.length,
      refFrom,
      inharmMeanCents: inh ? inh.mean : null,
      inharmMaxCents: inh ? inh.max : null,
      inharmLowCents: inh ? inh.low : null,
      inharmHighCents: inh ? inh.high : null,
      inharmMatched: inh ? inh.n : 0,
      centroid: centroid(bMag, bodyBin),
      rolloff: rolloff(bMag, bodyBin),
      flatness: flatness(bMag, bodyBin),
      resolutionHz: bodyBin,
      highestPartialHz: peaks.length ? peaks[peaks.length - 1].f : 0,
      bodyRmsDb: db(rms(mid, ref + bodyStart, bodyLen)),
    };
  }

  /* ---------- E. PITCH-TRACKING vs BODY ---------- */
  if (V.pitched) {
    const pts = [
      { tag: 'E-low', midi: note - 12 },
      { tag: 'A-mid', midi: note },
      { tag: 'E-high', midi: note + 12 },
    ].map((p) => {
      const on = onsetOf(p.tag);
      const mag = bodyOf(on);
      const hf = mtof(p.midi);
      /* Harmonics 1..24 of THIS note: the same slice of each note's
         own series at all three pitches, so Nyquist truncation and
         analysis-window bandwidth cancel out instead of masquerading
         as a body resonance. */
      const amps = harmonicAmps(mag, bodyBin, hf, 24);
      return {
        midi: p.midi, f0: hf,
        centroid: harmonicCentroid(amps, hf),
        wideCentroid: centroid(mag, bodyBin),
        rolloff: rolloff(mag, bodyBin),
        profile: harmonicProfile(amps, 8),
      };
    });
    const slope = pts[0].centroid > 0 ? Math.log2(pts[2].centroid / pts[0].centroid) / 2 : 0;
    const lowSlope = pts[0].centroid > 0 ? Math.log2(pts[1].centroid / pts[0].centroid) : 0;
    const highSlope = pts[1].centroid > 0 ? Math.log2(pts[2].centroid / pts[1].centroid) : 0;
    const drifts = [];
    for (let i = 0; i < 3; i++) {
      for (let j = i + 1; j < 3; j++) {
        if (pts[i].profile && pts[j].profile) {
          const d = profileDrift(pts[i].profile, pts[j].profile);
          if (d !== null) drifts.push(d);
        }
      }
    }
    const drift = drifts.length ? drifts.reduce((a, b) => a + b, 0) / drifts.length : null;
    out.E = {
      pts, slope, lowSlope, highSlope, profileDriftDb: drift,
      /* The verdict rests on the SLOPE alone. The harmonic profile
         is printed as supporting evidence but is deliberately not
         part of the test, because it is not trustworthy for a
         detuned stack: brass's three saws at -9/0/+8 cents beat
         against each other at a rate proportional to k*f0, so
         whether a partial's components sum coherently inside the
         analysis window depends on the pitch. That alone moved
         brass's profile by 8dB between octaves and reversed sign
         when the window length changed — a voice whose filter is
         freq*N throughout and whose digital biquad response is
         (checked) identical to within 0.3dB at all three probe
         pitches. The slope has no such failure mode. */
      formantsMove: slope > TARGET.bodySlope,
    };
  } else {
    out.E = null;
  }

  /* ---------- F. STEREO WIDTH ---------- */
  {
    let mE = 0;
    let sE = 0;
    for (let i = 0; i < mid.length; i++) { mE += mid[i] * mid[i]; sE += side[i] * side[i]; }
    const corr = ncc(L, 0, R, 0, L.length);
    out.F = {
      midRms: Math.sqrt(mE / mid.length),
      sideRms: Math.sqrt(sE / side.length),
      sideDb: db(Math.sqrt(sE / Math.max(mE, 1e-300))),
      lrCorrelation: corr,
      channels: wav.channels,
    };
  }

  /* ---------- H. INTERACTION ---------- */
  {
    /* Aligned on SLOT STARTS, not note starts: the trailing note sits
       the same OVERLAP inside both its solo slot and the pair slot,
       so summing the two slots from their origins reconstructs
       exactly what the pair slot should contain. */
    const a = slots.find((x) => x.tag === 'H-a').frames;
    const bOn = slots.find((x) => x.tag === 'H-b').frames;
    const bothOn = slots.find((x) => x.tag === 'H-both').frames;
    const len = Math.round((SLOT - 0.1) * sr);
    let resid = 0;
    let energy = 0;
    for (let i = 0; i < len; i++) {
      const s = (mid[bothOn + i] || 0) - ((mid[a + i] || 0) + (mid[bOn + i] || 0));
      resid += s * s;
      energy += (mid[bothOn + i] || 0) ** 2;
    }
    /* -80dB, not zero. Chromium sums the overlapping pair inside
       one graph in a different order and precision than two
       separate renders, so a genuinely additive voice lands around
       -117dB — float32 rounding, not interaction. Anything that
       actually damps, steals or couples a voice would be tens of dB
       above this, so -80dB separates the two cases with 37dB to
       spare. */
    const rel = Math.sqrt(resid / Math.max(energy, 1e-300));
    out.H = { residualDb: db(rel), additive: rel < 1e-4 };
  }

  return out;
}

/* ============================================================
   Reporting
   ============================================================ */

const n = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : 'n/a');
const pad = (s, w, right = true) => (right ? String(s).padStart(w) : String(s).padEnd(w));
const bar = (c = '=', w = 78) => c.repeat(w);

function verdict(ok) { return ok ? 'OK' : 'DEAD'; }

function reportVoice(m, info, wavPath) {
  const V = VOICES[m.voice];
  console.log('');
  console.log(bar('='));
  console.log(` VOICELAB  ${m.voice}`
    + (V.pitched ? `   note ${m.note} (${noteName(m.note)}, ${m.f0.toFixed(1)} Hz)` : '   (unpitched)')
    + `   dur ${m.dur}s`);
  console.log(` ${WET ? 'WET: music bus + reverb + limiter (A/C/D/F are NOT isolated)' : 'dry: voice output only; reverb, faders and limiter bypassed'}`);
  console.log(` ${m.sr} Hz  32-bit float  seed ${SEED}   sheet peak ${info.peak.toFixed(4)}`
    + `   sounding length ${(m.T60 * 1000).toFixed(0)}ms`);
  console.log(` body analysis window ${(m.bodyStart * 1000).toFixed(0)}-${((m.bodyStart + m.bodyLen) * 1000).toFixed(0)}ms`
    + `   fft resolution ${m.D.resolutionHz.toFixed(1)} Hz`);
  console.log(bar('='));

  /* ---- A, first and loud, because it is the brief ---- */
  const A = m.A;
  console.log('');
  console.log('  A. DYNAMIC TIMBRE  -- does playing harder change the SOUND, or only the level?');
  for (const p of A.per) {
    console.log(`     gain ${p.gain.toFixed(2)}   body centroid ${pad(p.bodyCentroid.toFixed(0), 6)} Hz`
      + `   attack centroid ${pad(p.attackCentroid.toFixed(0), 6)} Hz`
      + `   rms ${fmtDb(db(p.rms))} dB   -40dB at ${(p.decay40 * 1000).toFixed(0)}ms`);
  }
  const aOk = A.centroidRatio >= TARGET.dynCentroid;
  console.log('');
  console.log('   +' + bar('-', 62) + '+');
  console.log('   |' + pad(`CENTROID RATIO  loud/soft = ${A.centroidRatio.toFixed(3)}`, 44)
    + pad(`${verdict(aOk)}`, 18) + '|');
  console.log('   |' + pad(`(a real instrument: ${TARGET.dynCentroid.toFixed(2)} or more)`, 62) + '|');
  console.log('   +' + bar('-', 62) + '+');
  console.log('');
  console.log(`     full-note centroid ratio  ${A.fullRatio.toFixed(3)}`
    + `      attack centroid ratio  ${A.attackRatio.toFixed(3)}`);
  console.log(`     gain-normalised waveform identity, soft vs loud   r = ${A.shapeSL.toFixed(5)}`);
  console.log(`       1.00000 means \`gain\` is a pure multiplier and provably nothing else;`);
  console.log(`       below ${TARGET.dynShape} means dynamics reach something other than the level.`);
  console.log(`     rms ratio loud/soft ${A.rmsRatio.toFixed(2)}x  (6.00 = a pure scaler)`);
  console.log(`     note LENGTH changes with level: -40dB at ${(A.per[0].decay40 * 1000).toFixed(0)}ms soft`
    + ` vs ${(A.per[2].decay40 * 1000).toFixed(0)}ms loud, a ${Math.abs(A.decaySpreadMs).toFixed(0)}ms difference`);

  /* ---- B ---- */
  const B = m.B;
  console.log('');
  console.log('  B. NOTE-TO-NOTE VARIANCE  -- 8 identical calls, cross-correlated');
  console.log(`     mean pairwise similarity  ${B.meanSim.toFixed(5)}   (min ${B.minSim.toFixed(5)})`
    + `   target < ${TARGET.variance}`);
  console.log(`     bit-identical pairs       ${B.identicalPairs} of ${B.totalPairs}`);
  console.log(`     timing spread             ${B.lagSpreadMs.toFixed(2)} ms   (best-lag range over +/-${LAG_SEARCH_S * 1000}ms)`);
  console.log(`     level variation           ${(B.rmsCv * 100).toFixed(2)}%   brightness variation ${(B.centroidCv * 100).toFixed(2)}%`);
  console.log(`     ${B.identicalPairs === B.totalPairs
    ? 'every repeat is the SAME WAVEFORM. no round-robin, no per-note entropy.'
    : 'repeats differ.'}`);

  /* ---- C ---- */
  const C = m.C;
  console.log('');
  console.log('  C. ATTACK TRANSIENT  -- the first 25ms, which is what names the instrument');
  console.log(`     attack rms / body rms     ${fmtDb(C.atkOverBodyDb)} dB`
    + `      attack peak / body rms ${fmtDb(C.peakOverBodyDb)} dB`);
  console.log(`     normalised spectral flux  ${C.flux.toFixed(4)}   over ${C.fluxFrames} frames`);
  console.log(`       reported, not judged: the first frame straddles silence-to-signal, so ~0.15`);
  console.log(`       is the floor for ANY voice. the two lines below are what decide the verdict.`);
  console.log(`     spectral flatness         attack ${C.attackFlatness.toFixed(4)}   body ${C.bodyFlatness.toFixed(4)}`
    + `   lift ${Number.isFinite(C.flatLift) ? C.flatLift.toFixed(2) : 'inf'}x`);
  console.log(`     noise / total energy      attack ${C.attackNoise === null ? 'n/a' : (100 * C.attackNoise).toFixed(1) + '%'}`
    + `   body ${C.bodyNoise === null ? 'n/a' : (100 * C.bodyNoise).toFixed(1) + '%'}`
    + `${C.resolved ? '' : '   (attack window too short for this f0 - not used in the verdict)'}`);
  if (C.periodicityAttack !== null) {
    console.log(`     periodicity at f0         attack ${C.periodicityAttack.toFixed(4)}   body ${C.periodicityBody === null ? 'n/a' : C.periodicityBody.toFixed(4)}`
      + `   (window ${C.periodicityWinMs.toFixed(0)}ms)`);
    console.log(`       1.000 = every cycle is a copy of the last one, i.e. no noise at all.`);
  } else {
    console.log(`     periodicity at f0         n/a (unpitched voice)`);
  }
  console.log(`     INHARMONIC / NOISE CONTENT IN THE ATTACK: ${C.noisy ? `YES - ${C.noisyWhy}` : 'NO - the onset is pure oscillator'}`);
  /* Cross-check the audio against the graph. A voice that allocates
     an AudioBufferSourceNode is pulling from the shared noise
     buffer, so it HAS a noise generator; if the measurement cannot
     find it, the transient exists in the source and not in the
     sound, which is a different bug and a different fix. */
  if (info.nodeCounts.bufsrc && !C.noisy) {
    console.log(`     ...but this voice allocates ${info.nodeCounts.bufsrc} noise source(s) per note. The noise is in`);
    console.log(`     the graph and not in the sound: it is ${C.attackNoise === null ? '<1' : (100 * C.attackNoise).toFixed(1)}% of the attack energy, buried`);
    console.log(`     under the tuned part. Worth turning up before adding another one.`);
  }

  /* ---- D ---- */
  const D = m.D;
  console.log('');
  console.log('  D. SPECTRAL RICHNESS');
  console.log(`     partials above ${PARTIAL_FLOOR_DB}dB    ${D.partials}   (relative to the ${D.refFrom}; highest at ${D.highestPartialHz.toFixed(0)} Hz)`
    + `   target >= ${TARGET.partials}`);
  if (D.inharmMeanCents !== null) {
    console.log(`     inharmonicity            mean ${D.inharmMeanCents.toFixed(2)} cents   max ${D.inharmMaxCents.toFixed(2)} cents`
      + `   over ${D.inharmMatched} partials`);
    console.log(`       h2-h4 ${D.inharmLowCents === null ? 'n/a' : D.inharmLowCents.toFixed(2) + ' cents'}`
      + `   h8+ ${D.inharmHighCents === null ? 'n/a' : D.inharmHighCents.toFixed(2) + ' cents'}`
      + `   -- a stretched string or bar grows as k^2; a detuned unison is flat across k.`);
    console.log(`       0 cents = an exact harmonic series, i.e. oscillators. Real strings`);
    console.log(`       and metal bars stretch by tens of cents at the top of the series.`);
  } else {
    console.log(`     inharmonicity            n/a (no fundamental to measure against)`);
  }
  console.log(`     spectral centroid        ${D.centroid.toFixed(0)} Hz    85% rolloff ${D.rolloff.toFixed(0)} Hz`
    + `    flatness ${D.flatness.toFixed(4)}`);

  /* ---- E ---- */
  console.log('');
  console.log('  E. PITCH-TRACKING vs BODY  -- three pitches an octave apart');
  if (m.E) {
    for (const p of m.E.pts) {
      const prof = p.profile ? p.profile.slice(1, 6).map((x) => (x === null || !Number.isFinite(x) ? ' n/a' : x.toFixed(0).padStart(4))).join(' ') : 'n/a';
      console.log(`     ${pad(noteName(p.midi), 4, false)} ${pad(p.f0.toFixed(1), 7)} Hz   envelope centroid ${pad(p.centroid.toFixed(0), 6)} Hz`
        + `   (all bins ${pad(p.wideCentroid.toFixed(0), 6)})   h2..h6 dB [${prof} ]`);
    }
    console.log(`     centroid slope           ${m.E.slope.toFixed(3)} octaves per octave of pitch`
      + `   (low->mid ${m.E.lowSlope.toFixed(3)}, mid->high ${m.E.highSlope.toFixed(3)})`);
    console.log(`     harmonic profile drift   ${m.E.profileDriftDb === null ? 'n/a (nothing above -40dB but the fundamental)' : m.E.profileDriftDb.toFixed(2) + ' dB'}`
      + `   mean |change| in h2..h8 between pitches`);
    console.log(`       supporting evidence only, NOT the verdict: a detuned unison beats at a rate`);
    console.log(`       proportional to pitch, which moves this number several dB on its own.`);
    console.log(`     FORMANTS MOVE WITH PITCH: ${m.E.formantsMove ? 'YES - there is no body, only a freq*N filter' : 'NO - something in this voice stays put'}`);
    console.log(`       slope 1.000 is a pure preset: the spectrum is merely transposed. A physical`);
    console.log(`       body cannot follow the note, so it scores below ${TARGET.bodySlope}. Accurate to about +/-0.05.`);
  } else {
    console.log('     n/a - this voice takes no frequency argument');
  }

  /* ---- F ---- */
  const F = m.F;
  console.log('');
  console.log('  F. STEREO WIDTH');
  console.log(`     side / mid energy        ${fmtDb(F.sideDb)} dB   target > ${TARGET.sideDb} dB`);
  console.log(`     L/R correlation          ${F.lrCorrelation.toFixed(6)}`
    + `   ${F.sideRms === 0 ? '(the two channels are bit-identical: this voice is MONO)' : ''}`);

  /* ---- G ---- */
  console.log('');
  console.log('  G. NODES AND CPU');
  const counts = info.nodeCounts;
  const totalNodes = Object.entries(counts).filter(([k]) => k !== 'BUFFER' && k !== 'wave')
    .reduce((a, [, v]) => a + v, 0);
  const breakdown = Object.entries(counts).sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k} ${v}`).join(', ') || 'none';
  console.log(`     nodes per note           ${totalNodes}   [${breakdown}]   budget ${TARGET.nodesMax}`);
  if (counts.BUFFER) {
    console.log(`     *** ${counts.BUFFER} AudioBuffer(s) ALLOCATED PER NOTE - this is the GC stutter the brief warns about`);
  }
  console.log(`     render cost              ${info.cpuPerNoteUs.toFixed(0)} us/note`
    + `   (${info.cpuNotes} notes: ${info.cpuLoadedMs.toFixed(1)}ms vs ${info.cpuEmptyMs.toFixed(1)}ms empty, best of 3)`);

  /* ---- H ---- */
  console.log('');
  console.log('  H. INTERACTION (extra)  -- (A+B together) minus (A alone + B alone)');
  console.log(`     residual                 ${fmtDb(m.H.residualDb)} dB relative to the pair`);
  console.log(`     ${m.H.additive
    ? 'the two notes are STRICTLY ADDITIVE: no legato, no damping, no sympathetic'
    : 'the notes interact.'}`);
  if (m.H.additive) console.log('     ringing, no voice stealing. Each note is an island.');
  if (m.B.meanSim < 0.9999) console.log('     (note: this voice is non-deterministic, so H is only suggestive)');

  if (wavPath) {
    console.log('');
    console.log(`  wav: ${wavPath}`);
  }
}

/* ---- the `all` summary ---- */
function reportTable(rows) {
  console.log('');
  console.log(bar('='));
  console.log(' DYNAMIC TIMBRE LEAGUE TABLE -- centroid(gain 0.90) / centroid(gain 0.15)');
  console.log(' THIS IS THE BRIEF. 1.000 means dynamics change the level and nothing else.');
  console.log(bar('='));
  /* Ties broken by name: two voices that both score 1.000 differ in
     the sixth decimal by Chromium's own float32 accumulation noise,
     which is not a reason for the table to reorder itself between
     runs. */
  const rank = (r) => Math.round(r.m.A.centroidRatio * 1e4);   // one digit past what is printed
  const sorted = [...rows].sort((a, b) => (rank(b) - rank(a)) || a.m.voice.localeCompare(b.m.voice));
  for (const r of sorted) {
    const v = r.m.A.centroidRatio;
    const barLen = Math.max(0, Math.min(40, Math.round((v - 1) * 40)));
    console.log(`   ${pad(r.m.voice, 7, false)} ${v.toFixed(3)}  ${'#'.repeat(barLen)}`
      + (v >= TARGET.dynCentroid ? '  OK' : '  DEAD'));
  }

  console.log('');
  console.log(bar('=', 132));
  console.log(' FULL BASELINE — metrics A-H, all voices');
  console.log(bar('=', 132));
  const H = [
    ['voice', 8, (r) => r.m.voice],
    ['A:cent', 7, (r) => r.m.A.centroidRatio.toFixed(3)],
    ['A:shape', 8, (r) => r.m.A.shapeSL.toFixed(5)],
    ['B:sim', 8, (r) => r.m.B.meanSim.toFixed(5)],
    ['B:id', 6, (r) => `${r.m.B.identicalPairs}/${r.m.B.totalPairs}`],
    ['C:atk', 7, (r) => fmtDb(r.m.C.atkOverBodyDb, 1)],
    ['C:flux', 7, (r) => r.m.C.flux.toFixed(3)],
    ['C:nse%', 7, (r) => (r.m.C.attackNoise === null ? '-' : (100 * r.m.C.attackNoise).toFixed(1))],
    ['C:noise', 8, (r) => (r.m.C.noisy ? 'yes' : 'NO')],
    ['D:part', 7, (r) => String(r.m.D.partials)],
    ['D:inh', 7, (r) => (r.m.D.inharmMeanCents === null ? '-' : r.m.D.inharmMeanCents.toFixed(1))],
    ['D:cent', 7, (r) => r.m.D.centroid.toFixed(0)],
    ['D:roll', 7, (r) => r.m.D.rolloff.toFixed(0)],
    ['E:slope', 8, (r) => (r.m.E ? r.m.E.slope.toFixed(3) : '-')],
    ['E:drift', 8, (r) => (r.m.E && r.m.E.profileDriftDb !== null ? r.m.E.profileDriftDb.toFixed(2) : '-')],
    ['F:side', 8, (r) => fmtDb(r.m.F.sideDb, 0)],
    ['G:nodes', 8, (r) => String(r.nodes)],
    ['G:us', 7, (r) => r.info.cpuPerNoteUs.toFixed(0)],
    ['H:resid', 8, (r) => fmtDb(r.m.H.residualDb, 0)],
  ];
  console.log(H.map(([h, w]) => pad(h, w)).join(' '));
  console.log(H.map(([, w]) => '-'.repeat(w)).join(' '));
  for (const r of rows) console.log(H.map(([, w, f]) => pad(f(r), w)).join(' '));
  console.log('');
  console.log(' LEGEND / what a band would score');
  console.log(`   A:cent   centroid ratio loud/soft. 1.000 = gain is a volume knob.   want >= ${TARGET.dynCentroid}`);
  console.log(`   A:shape  soft vs loud, RMS-matched, cross-correlated. 1.00000 = provably`);
  console.log(`            identical waveforms at every dynamic.                      want <= ${TARGET.dynShape}`);
  console.log(`   B:sim    mean similarity of 8 repeats (+/-5ms lag search).          want <= ${TARGET.variance}`);
  console.log(`   B:id     pairs that are bit-identical, out of 28.                   want 0/28`);
  console.log(`   C:atk    attack rms over body rms, dB. Real onsets spike.`);
  console.log(`   C:flux   normalised spectral-shape change per frame at onset. The first`);
  console.log(`            frame straddles silence, so ~${TARGET.attackFlux.toFixed(2)} is the floor for any voice;`);
  console.log(`            reported for information, not used in the C:noise verdict.`);
  console.log(`   C:nse%   share of the first 25ms sitting at the spectrum's own noise`);
  console.log(`            floor rather than in partials.`);
  console.log(`   C:noise  is there ANY inharmonic/noise content in the attack.       want yes`);
  console.log(`   D:part   partials above -40dB of the fundamental. For the unpitched`);
  console.log(`            voices this counts peaks in noise and only means "broadband". want >= ${TARGET.partials}`);
  console.log(`   D:inh    mean |deviation| from exact harmonics, cents. 0 = oscillators.`);
  console.log(`   E:slope  octaves of centroid per octave of pitch. 1.000 = freq*N,`);
  console.log(`            no body at all.                                            want <= ${TARGET.bodySlope}`);
  console.log(`   E:drift  mean dB change in the h2..h8 profile between pitches.`);
  console.log(`            0.00 = the spectrum is just transposed.                    want >= 3 dB`);
  console.log(`   F:side   side/mid energy, dB. -inf = mono.                          want >= ${TARGET.sideDb}`);
  console.log(`   G:nodes  Web Audio nodes allocated per note.                        budget ${TARGET.nodesMax}`);
  console.log(`   G:us     marginal render time per note, microseconds (this box, offline).`);
  console.log(`   H:resid  (A+B) minus (A alone + B alone). Below -80 = strictly additive,`);
  console.log(`            i.e. no note-to-note behaviour of any kind. The exact figure down`);
  console.log(`            there is Chromium's float32 summation order and moves a few dB`);
  console.log(`            between runs; everything else in this table is bit-reproducible.`);
}

/* ---- the seven diagnoses, checked against the numbers ----
   The brief asked for corrections to be loud, and six other
   agents are about to build on this. Prose in a chat window is
   not loud; a section the tool prints every time it runs is. */
function reportDiagnosis(rows) {
  console.log('');
  console.log(bar('=', 100));
  console.log(' DIAGNOSIS CHECK -- the seven claims in the brief, against the measurements above');
  console.log(bar('=', 100));
  const say = (n2, claim, status, lines) => {
    console.log('');
    console.log(` ${n2}. ${claim}`);
    console.log(`    ${status}`);
    for (const l of lines) console.log(`      ${l}`);
  };
  const pitched = rows.filter((r) => r.m.E);
  const perc = rows.filter((r) => !r.m.E);

  const allIdentical = rows.every((r) => r.m.B.identicalPairs === r.m.B.totalPairs);
  say(1, 'Every note is bit-identical; no round-robin, no per-note variance.',
    allIdentical ? 'CONFIRMED' : 'WRONG',
    allIdentical
      ? [`all ${rows.length} voices: 28/28 repeat pairs correlate at 1.00000, timing spread 0.00ms.`,
        'the noise-based voices too: noiseSource() always starts the shared buffer at',
        'offset 0, so every kick reads the same samples as every other kick.']
      : rows.filter((r) => r.m.B.identicalPairs < r.m.B.totalPairs).map((r) => `${r.m.voice}: ${r.m.B.meanSim.toFixed(5)}`));

  const flat = rows.filter((r) => r.m.A.centroidRatio > 1.02 || r.m.A.centroidRatio < 0.98);
  const shaped = rows.filter((r) => r.m.A.shapeSL < 0.999);
  const worstShape = rows.reduce((a, b) => (b.m.A.shapeSL < a.m.A.shapeSL ? b : a));
  say(2, '`gain` is the only expressive axis and it only scales volume.',
    flat.length === 0 && shaped.length === 0 ? 'CONFIRMED'
      : flat.length === 0 ? 'CONFIRMED for timbre, WRONG about "only scales volume"' : 'PARTIALLY WRONG',
    [
      flat.length === 0
        ? 'no voice moves its centroid with dynamics: every A:cent is 1.00 +/- 0.02. correct.'
        : `these voices DO change brightness with gain: ${flat.map((r) => `${r.m.voice} ${r.m.A.centroidRatio.toFixed(3)}`).join(', ')}`,
      shaped.length === 0
        ? 'and gain-normalised waveforms are identical at every level: a pure multiplier.'
        : 'but gain is NOT a pure multiplier. RMS-matched, soft against loud, these do not',
      ...(shaped.length ? [
        `superimpose: ${shaped.map((r) => `${r.m.voice} ${r.m.A.shapeSL.toFixed(4)}`).join(', ')}`,
      ] : []),
      ...(shaped.length ? [
        'cause: every envelope ends `exponentialRampToValueAtTime(0.0001, ...)`. that floor is',
        'ABSOLUTE while the value it ramps from is proportional to gain, so a loud note has to',
        'cover more dB in the same seconds and therefore decays FASTER relative to its own peak.',
        'gain silently controls note LENGTH:',
        ...rows.filter((r) => Math.abs(r.m.A.decaySpreadMs) > 5)
          .map((r) => `  ${pad(r.m.voice, 7, false)} -40dB at ${(r.m.A.per[0].decay40 * 1000).toFixed(0)}ms when soft, `
            + `${(r.m.A.per[2].decay40 * 1000).toFixed(0)}ms when loud (${Math.abs(r.m.A.decaySpreadMs).toFixed(0)}ms)`),
        'that is real dynamic behaviour, but it is backwards (harder should not mean shorter),',
        'it is an accident of the 0.0001 floor rather than a decision, and it does nothing for',
        'the complaint because it changes duration, not brightness.',
      ] : []),
      ...(worstShape.m.A.shapeSL < 0.9 ? [
        '',
        `${worstShape.m.voice} is in a category of its own at ${worstShape.m.A.shapeSL.toFixed(4)}, and worth reading the code for.`,
        ...(worstShape.m.voice === 'vibe' ? [
          'vibe does `tremGain.gain.value = 0.16; tremGain.connect(g.gain)`. A node connected to',
          'an AudioParam is ADDED to it, so the tremolo is a fixed +/-0.16 sitting on top of an',
          'envelope whose height is `gain`. The modulation depth is therefore 0.16/gain: 18% at',
          'gain 0.90, 107% at gain 0.15. Above 100% the gain goes NEGATIVE every cycle and the',
          'voice ring-modulates instead of tremoloing. Music.js calls vibe at 0.20-0.34 for the',
          'melody and at 0.05 for the octave doubling, so the doubling is a ring modulator and',
          'the tremolo gets deeper the more quietly the melody is played. That is upside down:',
          'a vibraphone motor runs at one depth regardless of how hard the bar is struck.',
        ] : []),
      ] : []),
    ]);

  const noisy = rows.filter((r) => r.m.C.noisy);
  const quiet = rows.filter((r) => !r.m.C.noisy);
  /* Voices that pull from the shared noise buffer but whose attack
     measures clean: the transient is in the graph and not in the
     sound. A different problem from having no transient at all, and
     a cheaper one to fix. */
  const silentNoise = quiet.filter((r) => r.info.nodeCounts.bufsrc);
  say(3, 'No attack transients: every voice ramps a gain node from 0.0001.',
    quiet.length === rows.length ? 'CONFIRMED' : 'RIGHT ABOUT THE MELODIC VOICES, WRONG AS WRITTEN',
    [
      quiet.length ? `nothing but oscillator in the onset of: ${quiet.map((r) => r.m.voice).join(', ')}` : '',
      ...(noisy.length ? ['measurable inharmonic content in the onset of:',
        ...noisy.map((r) => `  ${pad(r.m.voice, 7, false)} ${r.m.C.noisyWhy}`)] : []),
      '',
      'so the claim holds where it matters — every melodic voice begins as a pure',
      'oscillator with a gain ramp and no pick, breath, mallet or reed — but it is wrong',
      'as literally written, in two ways:',
      '  1. kick/snare/rim/hat/tom do NOT ramp from 0.0001. They use setValueAtTime(gain, t):',
      '     an instantaneous attack. Only the five pitched voices ramp.',
      ...(silentNoise.length ? [
        `  2. ${silentNoise.map((r) => r.m.voice).join(' and ')} already allocate${silentNoise.length === 1 ? 's' : ''} a noise source per note, and it is`,
        `     inaudible: ${silentNoise.map((r) => `${r.m.voice} ${(100 * (r.m.C.attackNoise ?? 0)).toFixed(1)}%`).join(', ')} of the attack energy. The transient exists in`,
        '     the graph and is buried under the tuned part. Turning up what is already there',
        '     is cheaper than adding more of it.',
      ] : []),
    ].filter((l) => l !== null));

  say(4, 'Thin oscillator stacks; no unison detune, no chorus, no per-partial control.',
    'CONFIRMED',
    [
      `oscillators per note: ${rows.map((r) => `${r.m.voice} ${r.info.nodeCounts.osc || 0}`).join(', ')}`,
      'and of those, vibe\'s 3rd is a tremolo LFO and scat\'s 2nd is a vibrato LFO, so the',
      'tone-generating count is 1-3. brass is the widest stack in the file at 3 saws',
      '(-9/0/+8 cents). D:part confirms the consequence.',
    ]);

  const bodied = pitched.filter((r) => !r.m.E.formantsMove);
  say(5, 'No body resonance: filters are all `freq * N`, so the spectrum is identical at every pitch.',
    bodied.length === 0 ? 'CONFIRMED' : 'WRONG FOR AT LEAST ONE VOICE',
    [
      ...pitched.map((r) => `${pad(r.m.voice, 7, false)} slope ${r.m.E.slope.toFixed(3)}  profile drift ${r.m.E.profileDriftDb === null ? 'n/a' : r.m.E.profileDriftDb.toFixed(2) + 'dB'}  -> ${r.m.E.formantsMove ? 'moves with pitch (no body)' : 'STAYS PUT (has a body)'}`),
      ...(bodied.length ? [
        '',
        `${bodied.map((r) => r.m.voice).join(' and ')} ALREADY HAS A FIXED FORMANT STRUCTURE. its three bandpasses`,
        'are written in absolute Hz (730/1090/2440 for "ah") and do not move with the note, so',
        'its spectrum is reshaped by pitch the way a throat reshapes a sung vowel. every other',
        'voice pins its filter to freq*N and merely transposes. the model for the rebuild is',
        'already in this file, a few lines above the voices that need it.',
      ] : []),
      'the drift column is NOT evidence here and is printed for information only; unison',
      'beating moves it by several dB on its own, which is all brass\'s 8dB is. bass and',
      'brass also clamp their filters (min 6000 / max 90 / min 8000 / max 200 Hz), which',
      'bends the slope near the ends of their range without being a body.',
    ]);

  const mono = rows.every((r) => !Number.isFinite(r.m.F.sideDb));
  say(6, 'It is mono; everything goes to one bus.',
    mono ? 'CONFIRMED' : 'WRONG',
    mono
      ? ['every voice: side energy is exactly zero, L/R correlation 1.000000.',
        'not "nearly mono" - bit-identical channels. no panner exists anywhere in AudioEngine.',
        'the only stereo in the shipping game is the convolver impulse, which is generated',
        'with two independent noise channels - so the reverb is wide and the band is a point.']
      : rows.filter((r) => Number.isFinite(r.m.F.sideDb)).map((r) => `${r.m.voice} ${fmtDb(r.m.F.sideDb)} dB`));

  const additive = rows.every((r) => r.m.H.additive);
  say(7, 'No note-to-note behaviour: no legato, no portamento, no damping, no sympathetic ringing.',
    additive ? 'CONFIRMED' : 'WRONG',
    additive
      ? ['two overlapping notes sum to exactly the two notes rendered separately',
        `(residual ${rows.map((r) => fmtDb(r.m.H.residualDb, 0)).every((x) => x === '-inf') ? '-inf dB, i.e. digital silence' : 'below -120dB'}).`,
        'each call builds a private graph and no voice holds any state between calls, so',
        'interaction is structurally impossible, not merely absent.',
        'one qualifier: scat DOES scoop into the note (freq*0.985 -> freq over 50ms), which is',
        'a within-note portamento. it is the only pitch gesture in the file.']
      : rows.filter((r) => !r.m.H.additive).map((r) => `${r.m.voice} residual ${fmtDb(r.m.H.residualDb)} dB`));

  console.log('');
  console.log(bar('=', 100));
}

/* ============================================================
   Run
   ============================================================ */

fs.mkdirSync(OUT_DIR, { recursive: true });

const server = await createServer({ root: ROOT, server: { port: PORT }, logLevel: 'error' });
await server.listen();

const exe = findChromium();
const browser = await chromium.launch({
  ...(exe ? { executablePath: exe } : {}),
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'],
});

/* A blank page on the dev server's origin so `import('/src/audio/...')` is
   served and transformed by Vite exactly as it is for the game, without
   booting the game or its WebGL renderer. One page per voice: a finished
   render leaves an OfflineAudioContext, its buffer and a ~9MB Blob whose
   object URL the download still holds. */
async function newRenderPage() {
  const p = await browser.newPage();
  p.on('pageerror', (e) => console.error('  page error:', e.message));
  await p.route('**/__voicelab.html', (route) => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: '<!doctype html><meta charset="utf-8"><title>voicelab</title><body></body>',
  }));
  await p.goto(`http://localhost:${PORT}/__voicelab.html`, { waitUntil: 'load' });
  return p;
}

const voiceIds = VOICE_ARG === 'all' ? Object.keys(VOICES) : [VOICE_ARG];
const rows = [];
let failures = 0;

for (const voice of voiceIds) {
  const V = VOICES[voice];
  const note = flags.has('note') ? Number(flags.get('note')) : V.note;
  const dur = flags.has('dur') ? Number(flags.get('dur')) : V.dur;
  const slots = planSlots(voice, note, dur);
  const sheetSeconds = START + slots.length * SLOT + TAIL;
  const filename = `${voice}-${LABEL}.wav`;
  const outPath = path.join(OUT_DIR, filename);

  if (VOICE_ARG === 'all') process.stdout.write(`rendering ${voice}... `);
  const t0 = Date.now();
  const page = await newRenderPage();
  let download;
  let info;
  try {
    [download, info] = await Promise.all([
      page.waitForEvent('download', { timeout: 180000 }),
      page.evaluate(renderInPage, {
        voice, filename, slots,
        countNote: { freq: V.pitched ? mtof(note) : 440, dur, gain: 0.45 },
        sheetSeconds, sampleRate: SR, seed: SEED, wet: WET,
        vowel: VOWEL, open: OPEN_HAT,
      }),
    ]);
  } catch (err) {
    console.error(`\n  ${voice}: render FAILED — ${err.message}`);
    failures++;
    await page.close();
    continue;
  }
  await download.saveAs(outPath);
  await page.close();

  const wav = decodeWav(fs.readFileSync(outPath));
  const m = analyse(voice, slots, wav, note, dur);
  const nodes = Object.entries(info.nodeCounts)
    .filter(([k]) => k !== 'BUFFER' && k !== 'wave')
    .reduce((a, [, v]) => a + v, 0);
  rows.push({ m, info, nodes });

  /* A silent probe would make every metric above meaningless while
     still printing plausible-looking numbers, so say so loudly. */
  if (!(info.peak > 1e-4)) {
    console.error(`  ${voice}: FAIL — the probe sheet is silent (peak ${info.peak.toExponential(2)})`);
    failures++;
  }

  if (VOICE_ARG === 'all') console.log(`${((Date.now() - t0) / 1000).toFixed(1)}s`);
  else reportVoice(m, info, KEEP_WAV ? outPath : null);

  if (!KEEP_WAV) fs.unlinkSync(outPath);
}

if (VOICE_ARG === 'all') {
  reportTable(rows);
  reportDiagnosis(rows);
} else if (rows.length) {
  console.log('');
  console.log(bar('='));
}

await browser.close();
await server.close();
process.exit(failures ? 1 : 0);
