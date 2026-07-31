/* ============================================================
   How repetitive is the score, in numbers?

   The player's report was "it kinda sucks and is very
   repetitive". That is a feeling, and you cannot regression-test
   a feeling, so this turns it into arithmetic.

   It measures NOTE EVENTS, not audio. `Music._scheduleStep` is
   driven for a whole simulated round against a stub engine that
   writes down every call instead of making a sound. That is far
   more diagnostic than analysing a waveform: an autocorrelation
   peak tells you "something repeats at 12.6s", whereas the event
   log tells you WHICH VOICE repeats, at what period, and on
   which sixteenths it is allowed to speak at all.

   Four measurements, per song:

     LOOP PERIOD    the smallest lag L>0 at which the whole event
                    sequence equals itself shifted by L. This is
                    the headline: how long before a listener has
                    heard literally everything.
     PER-VOICE      the same lag, per instrument, plus a rhythm-
                    only variant with pitch stripped out. Drums
                    and bass loop far faster than the melody and
                    that difference is invisible in the headline.
     UNIQUE BARS    distinct bar-length patterns / bars played.
                    "8 unique of 192" is the shape of the problem.
     ONSET HISTOGRAM  where in the bar each voice is ever allowed
                    to start a note. Exposes hard-coded grids —
                    a bass that only ever speaks on 0/6/10/14 has
                    a flat three-quarters-empty histogram.

   WHAT IS DELIBERATELY NOT IN THE FINGERPRINT
   Amplitude. Every voice's gain is a continuous function of
   `intensity`, so under a ramp no two bars are ever bit-identical
   and every metric would read a perfect score while the music
   still bored you to death. A crescendo is not variety. What
   counts as "the same" here is: same voice, same pitch, same
   note length, same sixteenth. Which layers are PRESENT is still
   captured, because a silent voice emits no events.

   Timing jitter is out for the same reason — `_scheduleStep`
   dithers every step by +/-3ms from `Math.random()`, which is
   humanisation, not composition.

   USAGE
     node tools/test-repetition.mjs                  # all songs, 360s, intensity 0.7
     node tools/test-repetition.mjs house city       # just these
     node tools/test-repetition.mjs --intensity=ramp # 0.2 -> 1.0 across the round
     node tools/test-repetition.mjs --seconds=stage  # each song's real stage time
     node tools/test-repetition.mjs --hurry          # the last-30s arrangement
     node tools/test-repetition.mjs --quiet          # summary table only
   ============================================================ */

import { Music } from '../src/audio/Music.js';
import { SONGS } from '../src/audio/songs.js';
import { makeRng } from '../src/util/math.js';

/* ------------------------------------------------------------
   CLI
   ------------------------------------------------------------ */

const argv = process.argv.slice(2);
const flags = new Map();
const positional = [];
for (const a of argv) {
  if (a.startsWith('--')) {
    const [k, v = 'true'] = a.slice(2).split('=');
    flags.set(k, v);
  } else positional.push(a);
}

const SONG_IDS = positional.length ? positional : Object.keys(SONGS);
for (const id of SONG_IDS) {
  if (!SONGS[id]) {
    console.error(`unknown song "${id}". known: ${Object.keys(SONGS).join(', ')}`);
    process.exit(2);
  }
}

const INTENSITY_ARG = flags.get('intensity') ?? '0.7';
const RAMP = INTENSITY_ARG === 'ramp';
const FIXED_INTENSITY = RAMP ? null : Number(INTENSITY_ARG);
const HURRY = flags.has('hurry');
const QUIET = flags.has('quiet');
const SEED = Number(flags.get('seed') ?? 12345);

/* 360s is the reference round for every number printed here. The real stages
   run 300-810s, so this is deliberately a middle-of-the-road round rather than
   any one stage — it keeps the twelve songs comparable to each other. Pass
   --seconds=stage to use each stage's true `time` instead. */
const SECONDS_ARG = flags.get('seconds') ?? '360';
const STAGE_SECONDS = SECONDS_ARG === 'stage';

/* Pulled from the stage definitions rather than copied, so that retuning a
   stage's clock cannot silently invalidate this harness. `menu` is not a stage;
   it loops under the title screen for as long as you leave it there, so it gets
   the reference round. */
async function stageSeconds() {
  const out = { menu: 360 };
  const ids = Object.keys(SONGS).filter((k) => k !== 'menu');
  const mods = await Promise.all(ids.map((id) => import(`../src/world/stages/${id}.js`)));
  mods.forEach((m, i) => { out[ids[i]] = Object.values(m)[0].time; });
  return out;
}
const STAGE_TIME = STAGE_SECONDS ? await stageSeconds() : null;

/* ------------------------------------------------------------
   The stub engine.

   Same surface as AudioEngine as far as Music is concerned: the
   eleven voices, `ready`, and `now`. Every call is recorded with
   the step that produced it, which is the axis all the analysis
   runs on. `t` is kept only so the log can be dumped for eyeball
   checks; nothing below indexes by it.
   ------------------------------------------------------------ */

const A4 = 440;
/** Inverse of AudioEngine.mtof, so the log reads in MIDI rather than hertz. */
const ftom = (f) => Math.round(69 + 12 * Math.log2(f / A4));

/* Order matters only for reading the report: rhythm section, then the tune. */
const VOICES = ['kick', 'rim', 'snare', 'shaker', 'hat', 'tom', 'bass', 'pluck', 'vibe', 'scat', 'brass'];

/* Composites. "The drum pattern repeats every 3.2s" is a claim about the whole
   kit, not about the kick — the kick alone is usually 8-step periodic and would
   flatter the score. `pluck` is the comping guitar and `vibe` is the tune; both
   get an alias so the summary table can name what a listener would name. */
const GROUPS = {
  drums: ['kick', 'rim', 'snare', 'shaker', 'hat', 'tom'],
  comp: ['pluck'],
  melody: ['vibe'],
};

class RecordingEngine {
  constructor() {
    this.ready = true;
    this.events = [];
    this.step = 0;          // set by the driver before each _scheduleStep
    this.absStep = 0;       // ...and the un-wrapped position in the round
    this.stepDur = 1;       // ditto; used to express durations in sixteenths
  }

  get now() { return 0; }

  /** durSteps is quantised to 1/100 of a sixteenth: it is derived from
   *  stepDuration by a handful of float multiplies and would otherwise differ
   *  in the last bits between two mathematically identical notes.
   *
   *  absStep is stamped by the driver rather than reconstructed afterwards.
   *  Reconstruction looks easy — events arrive in step order — but a silent
   *  step leaves no trace, so the only honest source of position is the loop
   *  that produced it. */
  _rec(voice, t, freq, dur, amp, vowel) {
    this.events.push({
      step: this.step,
      absStep: this.absStep,
      t,
      voice,
      note: freq == null ? null : ftom(freq),
      durSteps: dur == null ? 0 : Math.round((dur / this.stepDur) * 100) / 100,
      amp: Math.round(amp * 1000) / 1000,
      vowel,
    });
  }

  /* Percussion: no pitch. `tom` does take a frequency but Music always passes
     the same 200Hz, so it is recorded for completeness and would show up as a
     pitch change if that ever stopped being true. */
  kick(t, g = 0.9) { this._rec('kick', t, null, 0, g); }
  snare(t, g = 0.35) { this._rec('snare', t, null, 0, g); }
  rim(t, g = 0.34) { this._rec('rim', t, null, 0, g); }
  hat(t, g = 0.14) { this._rec('hat', t, null, 0, g); }
  shaker(t, g = 0.1) { this._rec('shaker', t, null, 0, g); }
  tom(t, freq = 190, g = 0.3) { this._rec('tom', t, freq, 0, g); }

  /* Pitched voices. */
  bass(t, freq, dur, g = 0.5) { this._rec('bass', t, freq, dur, g); }
  pluck(t, freq, dur, g = 0.18) { this._rec('pluck', t, freq, dur, g); }
  vibe(t, freq, dur, g = 0.3) { this._rec('vibe', t, freq, dur, g); }
  brass(t, freq, dur, g = 0.22) { this._rec('brass', t, freq, dur, g); }
  scat(t, freq, dur, g = 0.16, vowel = 0) { this._rec('scat', t, freq, dur, g, vowel); }
}

/* ------------------------------------------------------------
   Driving the scheduler.

   This is `Music._tick`'s inner loop with the setInterval and the
   audio clock removed: same step advance, same wrap, same
   intensity field, just stepped by hand so a six-minute round
   runs in milliseconds. If _tick's loop body ever diverges from
   this, the harness is measuring a score nobody hears.
   ------------------------------------------------------------ */

function simulate(songId, seconds, { intensity, ramp, hurry, seed }) {
  const engine = new RecordingEngine();
  const music = new Music(engine);
  const song = SONGS[songId];

  /* `_scheduleStep` calls Math.random() once per step for timing jitter, and a
     future arrangement may well want more randomness than that. Seeding the
     global here means this harness reports the same numbers on every run no
     matter what the score does with randomness, which is the difference
     between a baseline and an anecdote. Restored in a finally below. */
  const realRandom = Math.random;
  const rng = makeRng(seed);
  Math.random = rng;

  try {
    music.song = song;
    music.playing = true;
    music.hurrying = hurry;
    music.step = 0;
    music.bar = 0;
    music.intensity = ramp ? 0.2 : intensity;

    const loopSteps = song.bars * 16;
    /* Captured once. Every period below is reported in seconds by multiplying a
       step count by this, which is only meaningful while the tempo is fixed for
       the whole round -- true today (bpm is per song, and `hurrying` is set
       once here). A future arrangement that moves the tempo mid-round has to
       fix the reporting too, so the assertion after the loop is the tripwire. */
    const stepDur = music.stepDuration;
    let t = 0;
    let n = 0;
    while (t < seconds) {
      /* The real game drives intensity from progress toward the goal
         (Game.js: 0.32 + prog*0.72, smoothed). 0.2 -> 1.0 linear is the same
         shape with the ends squared off, and it crosses every one of the five
         hardcoded layer thresholds, which is the point of the ramp mode. */
      if (ramp) music.intensity = 0.2 + 0.8 * (t / seconds);
      engine.step = music.step;
      engine.absStep = n;
      engine.stepDur = music.stepDuration;
      music._scheduleStep(music.step, t);
      t += music.stepDuration;
      music.step = (music.step + 1) % loopSteps;
      n++;
    }
    if (music.stepDuration !== stepDur) {
      throw new Error(`${songId}: tempo changed mid-round (${stepDur} -> ${music.stepDuration}); `
        + 'every period in this report is a step count times a fixed step duration and is now wrong');
    }
    return { engine, music, song, steps: n, loopSteps, stepDur };
  } finally {
    Math.random = realRandom;
  }
}

/* ------------------------------------------------------------
   Metrics
   ------------------------------------------------------------ */

/* Every threshold in `_scheduleStep`, in one place, so the report can say what
   is switched on and — more importantly — so the ramp mode can tell the
   difference between "new material" and "the same eight bars with one more
   layer on top". Keep in sync with Music._scheduleStep. */
const GATES = [
  ['shaker', 0.12], ['comp', 0.2], ['hat', 0.3], ['melody', 0.34],
  ['bass@10', 0.5], ['melody 8ve', 0.55], ['scat', 0.6], ['tom', 0.6],
  ['bass@14', 0.72], ['brass', 0.78],
];
/** Which layers are audible at an intensity, as a comparable key. */
const gateMask = (inten) => GATES.map(([, g]) => (inten > g ? 1 : 0)).join('');

/**
 * Fold an event list into one fingerprint per step.
 *
 * `key` decides what "the same event" means. Sorting inside a step matters:
 * comping voices are emitted in voicing order and a future arrangement might
 * reorder them without changing a note anyone hears.
 */
function fingerprints(events, steps, key) {
  const per = Array.from({ length: steps }, () => []);
  for (const e of events) per[e.absStep].push(key(e));
  return per.map((a) => (a.length ? a.sort().join('|') : '.'));
}

/** Intern strings to ints so the O(n^2) scan below compares numbers. */
function intern(strings) {
  const map = new Map();
  return Int32Array.from(strings, (s) => {
    let v = map.get(s);
    if (v === undefined) { v = map.size; map.set(s, v); }
    return v;
  });
}

/**
 * Smallest lag L>0 at which the sequence matches itself shifted by L.
 *
 * Only lags up to n/2 are considered: beyond that the overlap is shorter than
 * the evidence needed to believe it, and "the round is one long non-repeating
 * thing" is the answer we want in that case anyway.
 *
 * `minRatio` below 1 admits near-repeats. That matters once anything varies
 * across the round — a fill every eighth bar should not stop the tool from
 * saying "this is an 8-bar loop with a fill".
 */
function loopPeriod(seq, minRatio = 1) {
  const n = seq.length;
  const limit = Math.floor(n / 2);
  for (let L = 1; L <= limit; L++) {
    const span = n - L;
    const allowed = Math.floor(span * (1 - minRatio));
    let bad = 0;
    let ok = true;
    for (let i = 0; i < span; i++) {
      if (seq[i] !== seq[i + L] && ++bad > allowed) { ok = false; break; }
    }
    if (ok) return L;
  }
  return null;
}

/** How well the sequence matches itself at one specific lag, 0..1. */
function matchAt(seq, L) {
  const span = seq.length - L;
  if (span <= 0) return 0;
  let same = 0;
  for (let i = 0; i < span; i++) if (seq[i] === seq[i + L]) same++;
  return same / span;
}

/** Distinct N-step chunks vs total chunks. */
function uniqueChunks(fps, size) {
  const seen = new Set();
  let total = 0;
  for (let i = 0; i + size <= fps.length; i += size) {
    seen.add(fps.slice(i, i + size).join(','));
    total++;
  }
  return { unique: seen.size, total };
}

/** Onsets per position in the bar, 16 buckets. */
function onsetHistogram(events) {
  const h = new Array(16).fill(0);
  for (const e of events) h[e.absStep % 16]++;
  return h;
}

/* ------------------------------------------------------------
   Analysis of one song
   ------------------------------------------------------------ */

/* Full identity: voice, pitch, length. Amplitude excluded on purpose — see the
   header. Rhythm-only strips the pitch, which is what exposes a voice whose
   NOTES move but whose GRID never does. */
const KEY_FULL = (e) => `${e.voice}:${e.note ?? '-'}:${e.durSteps}`;
const KEY_RHYTHM = (e) => e.voice;

function analyse(songId, seconds, opts) {
  const sim = simulate(songId, seconds, opts);
  const { engine, song, steps, loopSteps, stepDur } = sim;

  const secPerStep = stepDur;
  const fpFull = intern(fingerprints(engine.events, steps, KEY_FULL));
  const loopFull = loopPeriod(fpFull, 1);
  const loopNear = loopPeriod(fpFull, 0.95);

  const stats = (ev) => (ev.length ? {
    count: ev.length,
    full: loopPeriod(intern(fingerprints(ev, steps, KEY_FULL)), 1),
    rhythm: loopPeriod(intern(fingerprints(ev, steps, KEY_RHYTHM)), 1),
    hist: onsetHistogram(ev),
    pitches: new Set(ev.map((e) => e.note).filter((n) => n != null)).size,
  } : null);

  const perVoice = {};
  for (const v of VOICES) perVoice[v] = stats(engine.events.filter((e) => e.voice === v));

  const perGroup = {};
  for (const [g, members] of Object.entries(GROUPS)) {
    perGroup[g] = stats(engine.events.filter((e) => members.includes(e.voice)));
  }

  const bars = uniqueChunks(fpFull, 16);
  const loops = uniqueChunks(fpFull, loopSteps);

  /* An intensity ramp inflates the unique-bar count without writing a single
     new note: bar 40 differs from bar 8 only because the scat gate opened in
     between. Counting the distinct gate states the ramp passes through lets the
     report divide that inflation back out, so `uniqueBarsPerPhase` is the
     honest "how much material is there" number in both modes. */
  const phases = new Set();
  for (let b = 0; b * 16 < steps; b++) {
    const inten = opts.ramp ? 0.2 + 0.8 * ((b * 16 * stepDur) / seconds) : opts.intensity;
    phases.add(gateMask(inten));
  }

  return {
    songId, song, seconds, steps, loopSteps, secPerStep,
    events: engine.events.length,
    loopFull, loopNear,
    matchAtSongLoop: matchAt(fpFull, loopSteps),
    perVoice, perGroup, bars, loops,
    phases: phases.size,
    barsPerPhase: bars.unique / phases.size,
  };
}

/* ------------------------------------------------------------
   Reporting
   ------------------------------------------------------------ */

const pad = (s, n) => String(s).padEnd(n);
const lpad = (s, n) => String(s).padStart(n);
const fmtSec = (v) => (v == null ? '-' : v.toFixed(1) + 's');

/** 16 columns, one char per sixteenth, log-ish so a busy voice does not clip. */
function histLine(h) {
  const max = Math.max(...h);
  const RAMP_CHARS = ' .:-=+*#%@';
  return h.map((v) => {
    if (v === 0) return '_';
    const i = Math.min(RAMP_CHARS.length - 1, 1 + Math.floor((v / max) * (RAMP_CHARS.length - 2)));
    return RAMP_CHARS[i];
  }).join('');
}

function reportSong(r) {
  const { song } = r;
  const loopSec = r.loopFull == null ? null : r.loopFull * r.secPerStep;
  const nearSec = r.loopNear == null ? null : r.loopNear * r.secPerStep;
  const reps = loopSec ? r.seconds / loopSec : null;

  console.log('');
  console.log(`=== ${r.songId}  "${song.name}"  ${song.bpm}bpm  ${song.bars} bars  kit=${song.kit} ===`);
  console.log(`  round ${r.seconds}s = ${r.steps} sixteenths, ${r.events} note events`);

  if (loopSec == null) {
    console.log(`  LOOP PERIOD: none under ${(r.steps / 2 * r.secPerStep).toFixed(1)}s (nothing repeats exactly in half a round)`);
  } else {
    console.log(`  LOOP PERIOD: ${fmtSec(loopSec)} = ${(r.loopFull / 16).toFixed(0)} bars`
      + `  ->  the player hears it ${reps.toFixed(0)}x per round`);
  }
  if (r.loopNear != null && r.loopNear !== r.loopFull) {
    console.log(`  near-loop (95% identical): ${fmtSec(nearSec)} = ${(r.loopNear / 16).toFixed(1)} bars`);
  }
  console.log(`  self-similarity at the ${song.bars}-bar song loop: ${(r.matchAtSongLoop * 100).toFixed(1)}%`);
  console.log(`  UNIQUE BARS:  ${r.bars.unique} unique of ${r.bars.total} played`
    + `   (${(100 * r.bars.unique / r.bars.total).toFixed(1)}% of the round is new material)`);
  console.log(`  UNIQUE LOOPS: ${r.loops.unique} unique of ${r.loops.total} played`);
  if (r.phases > 1) {
    console.log(`  ...but ${r.phases} of those distinctions are the intensity ramp opening a gate:`);
    console.log(`     ${r.barsPerPhase.toFixed(1)} unique bars per arrangement phase, out of ${song.bars} bars of written material`);
  }

  console.log('  voice        n  pitch  loop(full)  loop(rhy)  onsets: 1e+a2e+a3e+a4e+a');
  const line = (label, p) => {
    if (!p) { console.log(`  ${pad(label, 8)} ${lpad('-', 4)}      -      silent at this intensity`); return; }
    const f = p.full == null ? '>half' : fmtSec(p.full * r.secPerStep);
    const rh = p.rhythm == null ? '>half' : fmtSec(p.rhythm * r.secPerStep);
    const used = p.hist.filter((x) => x > 0).length;
    console.log(`  ${pad(label, 8)} ${lpad(p.count, 4)}  ${lpad(p.pitches, 5)}  ${lpad(f, 10)}  ${lpad(rh, 9)}          ${histLine(p.hist)}  ${used}/16`);
  };
  for (const v of VOICES) line(v, r.perVoice[v]);
  console.log('  --- composite ---');
  line('DRUMKIT', r.perGroup.drums);
}

function reportTable(rows) {
  console.log('');
  console.log('=============================================================================================');
  console.log(` SUMMARY   ${RAMP ? 'intensity ramp 0.2->1.0' : `intensity ${FIXED_INTENSITY}`}`
    + `   ${HURRY ? 'HURRYING' : 'not hurrying'}   round ${STAGE_SECONDS ? 'per stage' : SECONDS_ARG + 's'}`);
  console.log('=============================================================================================');
  console.log(' song       bpm bars kit       round   LOOP  bars  reps  uniqBars  |  drumkit   bass   comp  melody');
  console.log(' ---------- --- ---- --------- ------ ------ ----- ----- --------- + ------- ------ ------ -------');
  for (const r of rows) {
    const loopSec = r.loopFull == null ? null : r.loopFull * r.secPerStep;
    const reps = loopSec ? (r.seconds / loopSec).toFixed(0) : '-';
    /* Rhythm-only for the three groove columns: the question they answer is
       "how often does this part play the same figure again", and a bass line
       walking the same rhythm through eight chords is still one figure. */
    const rhy = (p) => (p && p.rhythm != null ? fmtSec(p.rhythm * r.secPerStep) : p ? '>half' : '-');
    console.log(` ${pad(r.songId, 10)} ${lpad(r.song.bpm, 3)} ${lpad(r.song.bars, 4)} ${pad(r.song.kit, 9)}`
      + ` ${lpad(r.seconds + 's', 6)} ${lpad(fmtSec(loopSec), 6)}`
      + ` ${lpad(loopSec ? (r.loopFull / 16).toFixed(0) : '-', 5)} ${lpad(reps, 5)}`
      + ` ${lpad(r.bars.unique + '/' + r.bars.total, 9)} |`
      + ` ${lpad(rhy(r.perGroup.drums), 7)} ${lpad(rhy(r.perVoice.bass), 6)}`
      + ` ${lpad(rhy(r.perGroup.comp), 6)} ${lpad(rhy(r.perGroup.melody), 7)}`);
  }

  /* One number to watch across proposals. Averaging the per-song share of new
     material weights every song equally, which is right: a fix that only helps
     the four 16-bar songs has not fixed the game. */
  const share = rows.reduce((a, r) => a + r.bars.unique / r.bars.total, 0) / rows.length;
  const worst = rows.reduce((a, r) => (a.bars.unique / a.bars.total < r.bars.unique / r.bars.total ? a : r));
  console.log('');
  console.log(` NEW-MATERIAL SHARE (mean unique bars / bars played): ${(share * 100).toFixed(1)}%`);
  console.log(` WORST SONG: ${worst.songId} at ${(100 * worst.bars.unique / worst.bars.total).toFixed(1)}%`
    + ` (${worst.bars.unique} unique bars in a ${worst.seconds}s round)`);

  /* The one line that stops the ramp mode's headline being read as good news. */
  if (RAMP) {
    const perPhase = rows.reduce((a, r) => a + r.barsPerPhase, 0) / rows.length;
    const written = rows.reduce((a, r) => a + r.song.bars, 0) / rows.length;
    console.log('');
    console.log(` READ THAT NUMBER CAREFULLY. Under a ramp the unique-bar count counts the same`);
    console.log(` written bar again every time a layer gate opens. Divided back out:`);
    console.log(` ${perPhase.toFixed(1)} unique bars per arrangement phase against ${written.toFixed(1)} bars of`);
    console.log(` written material -- i.e. the ramp adds NO new material, only new layer combinations.`);
  }
}

/* ------------------------------------------------------------
   Run
   ------------------------------------------------------------ */

const rows = [];
for (const id of SONG_IDS) {
  const seconds = STAGE_SECONDS ? STAGE_TIME[id] : Number(SECONDS_ARG);
  const r = analyse(id, seconds, { intensity: FIXED_INTENSITY, ramp: RAMP, hurry: HURRY, seed: SEED });
  rows.push(r);
  if (!QUIET) reportSong(r);
}
reportTable(rows);

/* Layer gating is a step function of intensity, so at any fixed value some
   voices are simply absent. Saying so beats letting someone conclude the brass
   part does not exist. */
if (!RAMP) {
  const gates = [['shaker', 0.12], ['comping (pluck)', 0.2], ['hat', 0.3], ['melody (vibe)', 0.34],
    ['bass step 10', 0.5], ['scat', 0.6], ['tom', 0.6], ['bass step 14', 0.72], ['brass', 0.78]];
  const on = gates.filter(([, g]) => FIXED_INTENSITY > g).map(([n]) => n);
  const off = gates.filter(([, g]) => FIXED_INTENSITY <= g).map(([n, g]) => `${n}(>${g})`);
  console.log('');
  console.log(` at intensity ${FIXED_INTENSITY}:`);
  console.log(`   ungated (always on, if the kit has the part): kick, rim, snare, bass steps 0 and 6`);
  console.log(`   gated on:  ${on.join(', ')}`);
  console.log(`   gated off: ${off.length ? off.join(', ') : '(nothing)'}`);
}
console.log('');
