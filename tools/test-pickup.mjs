/* ============================================================
   How loud is a pickup, really, as a function of item size?

   The player: "the pickup sounds for smaller items are too
   loud/intrusive compared to the pickup sounds for larger
   items."

   The obvious reading is that the amplitude scaling is wrong.
   But `Sfx.pickup` already scales amplitude with size —
   `lerp(0.1, 0.34, r)`, a 10dB spread — so on the face of it
   small items are ALREADY much quieter and the complaint should
   not be possible.

   The catch is that it also scales PITCH, from MIDI 86 (~1.3kHz)
   for the smallest item down to MIDI 46 (~116Hz) for the
   largest. Human hearing is far more sensitive at 1.3kHz than at
   116Hz — the gap is around 20dB on any equal-loudness contour —
   so a 10dB amplitude reduction can be completely swamped, and
   the small "tick" ends up PERCEPTUALLY LOUDER than the big
   "thud" despite being physically quieter.

   Physical RMS cannot see that. So this measures both:

     - raw RMS and peak, what a meter sees;
     - A-WEIGHTED RMS, which applies the standard IEC 61672
       frequency weighting and is a rough stand-in for what an
       ear hears.

   If the raw curve falls with size while the A-weighted curve is
   flat or rises, the complaint is about FREQUENCY, not gain, and
   scaling the amplitude alone would be treating the symptom.

   Run: node tools/test-pickup.mjs [--steps=11] [--wav]
   ============================================================ */

import { createServer } from 'vite';
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const PORT = 5261;
const SR = 44100;
const args = process.argv.slice(2);
const STEPS = +(args.find((a) => a.startsWith('--steps='))?.slice(8) || 11);
const KEEP = args.includes('--wav');

const server = await createServer({ root: ROOT, server: { port: PORT }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'],
});
const page = await browser.newPage();
await page.route('**/__pickup.html', (route) =>
  route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><meta charset=utf-8><title>p</title>' }));
await page.goto(`http://localhost:${PORT}/__pickup.html`, { waitUntil: 'load' });

/* Each probe is rendered in its OWN offline context and its own 1.2s window.
   Rendering them into one timeline would let the tail of a long "thud" overlap
   the next probe, and the whole point is to measure each one alone. */
const FART = args.includes('--fart');

const probes = await page.evaluate(async ({ steps, sr, fart }) => {
  const { AudioEngine } = await import('/src/audio/AudioEngine.js');
  const { Sfx } = await import('/src/audio/Sfx.js');

  const out = [];
  for (let i = 0; i < steps; i++) {
    const r = steps === 1 ? 0 : i / (steps - 1);
    const oac = new OfflineAudioContext({ numberOfChannels: 2, length: Math.ceil(2.0 * sr), sampleRate: sr });
    window.AudioContext = function () { return oac; };
    window.webkitAudioContext = window.AudioContext;
    const e = new AudioEngine();
    e.init();
    const sfx = new Sfx(e);
    sfx.fartMode = fart;
    /* Samples decode asynchronously and gameplay deliberately does not wait,
       falling back to the procedural voice until they land. A harness MUST
       wait, or it silently measures the fallback and reports the sample path
       as working when it was never exercised. */
    if (fart) await sfx._loadFarts();
    /* `pickup` rate-limits itself off `e.now` via `lastPickup`, and a fresh
       context starts at 0 every time, so each probe is a first pickup and the
       arpeggio stacking never engages. That is what we want — measure one hit,
       not a burst. */
    sfx.pickup(r, 1);
    const buf = await oac.startRendering();
    const L = buf.getChannelData(0), R = buf.numberOfChannels > 1 ? buf.getChannelData(1) : L;
    const mono = new Float32Array(L.length);
    for (let n = 0; n < L.length; n++) mono[n] = (L[n] + R[n]) / 2;
    out.push({ r, samples: Array.from(mono) });
  }

  /* VARIETY PROBE, fart mode only. The joke dies if every one is identical,
     and the music voices just demonstrated that "identical" is exactly what
     you get unless something forces otherwise. Eight at the SAME size. */
  let repeats = null;
  if (fart) {
    repeats = [];
    for (let i = 0; i < 8; i++) {
      const oac = new OfflineAudioContext({ numberOfChannels: 2, length: Math.ceil(2.0 * sr), sampleRate: sr });
      window.AudioContext = function () { return oac; };
      window.webkitAudioContext = window.AudioContext;
      const e = new AudioEngine();
      e.init();
      const sfx = new Sfx(e);
      sfx.fartMode = true;
      await sfx._loadFarts();
      sfx._fartCount = i;          // walk the contour variants too
      sfx.fart(0.5);
      const buf = await oac.startRendering();
      const L = buf.getChannelData(0);
      repeats.push(Array.from(L));
    }
  }
  return { out, repeats };
}, { steps: STEPS, sr: SR, fart: FART }).then((x) => { globalThis.__repeats = x.repeats; return x.out; });

/* ---- analysis, in Node ---- */

/** IEC 61672 A-weighting magnitude at f Hz. The standard analogue expression. */
function aWeight(f) {
  const f2 = f * f;
  const num = 12194 ** 2 * f2 * f2;
  const den = (f2 + 20.6 ** 2)
    * Math.sqrt((f2 + 107.7 ** 2) * (f2 + 737.9 ** 2))
    * (f2 + 12194 ** 2);
  return (num / den) * 1.2589254; // +2.0dB normalisation so A(1kHz) = 1
}

/** Radix-2 FFT, in place, real+imag arrays. */
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < len / 2; k++) {
        const c = Math.cos(ang * k), s = Math.sin(ang * k);
        const ur = re[i + k], ui = im[i + k];
        const vr = re[i + k + len / 2] * c - im[i + k + len / 2] * s;
        const vi = re[i + k + len / 2] * s + im[i + k + len / 2] * c;
        re[i + k] = ur + vr; im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
      }
    }
  }
}

const db = (x) => (x > 1e-12 ? 20 * Math.log10(x) : -Infinity);

function analyse(samples) {
  const x = Float32Array.from(samples);
  let peak = 0, sum = 0;
  for (const v of x) { const a = Math.abs(v); if (a > peak) peak = a; sum += v * v; }
  // RMS over the sounding part only; trailing silence would dilute it and a
  // long thud would score lower than a short tick purely for lasting longer.
  let last = 0;
  for (let i = x.length - 1; i >= 0; i--) if (Math.abs(x[i]) > peak * 0.001) { last = i; break; }
  const dur = (last + 1) / SR;
  const rms = Math.sqrt(sum / Math.max(1, last + 1));

  // Spectrum of the whole event, zero-padded to a power of two.
  let N = 1; while (N < last + 1) N <<= 1;
  N = Math.min(N, 65536);
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let i = 0; i < Math.min(N, last + 1); i++) re[i] = x[i];
  fft(re, im);
  let aSum = 0, rawSum = 0, cenNum = 0, cenDen = 0;
  for (let k = 1; k < N / 2; k++) {
    const f = (k * SR) / N;
    const mag2 = re[k] * re[k] + im[k] * im[k];
    const w = aWeight(f);
    aSum += mag2 * w * w;
    rawSum += mag2;
    cenNum += f * Math.sqrt(mag2);
    cenDen += Math.sqrt(mag2);
  }
  // Scale the A-weighted energy back into the same units as the raw RMS so the
  // two columns are directly comparable rather than two arbitrary scales.
  const aRms = rms * Math.sqrt(aSum / Math.max(1e-30, rawSum));
  return { peak, rms, aRms, dur, centroid: cenDen > 0 ? cenNum / cenDen : 0 };
}

const rows = probes.map((p) => ({ r: p.r, ...analyse(p.samples) }));

const maxRms = Math.max(...rows.map((x) => x.rms));
const maxA = Math.max(...rows.map((x) => x.aRms));

console.log('\n=== pickup() loudness vs item size ===');
console.log('  rel   size/max    peak     RMS   RMS dB   A-wtd  A-wtd dB   centroid    dur');
console.log('  ----  --------  ------  ------  -------  ------  --------  ---------  -----');
for (const x of rows) {
  console.log(
    `  ${x.r.toFixed(2)}  ${(x.r / 0.88).toFixed(2).padStart(8)}` +
    `  ${x.peak.toFixed(4)}  ${x.rms.toFixed(4)}  ${db(x.rms / maxRms).toFixed(1).padStart(7)}` +
    `  ${x.aRms.toFixed(4)}  ${db(x.aRms / maxA).toFixed(1).padStart(8)}` +
    `  ${x.centroid.toFixed(0).padStart(9)}  ${x.dur.toFixed(3)}`);
}

const first = rows[0], last = rows[rows.length - 1];
console.log('\n=== verdict ===');
console.log(`  smallest item, raw:        ${db(first.rms / last.rms).toFixed(1)} dB vs the largest`);
console.log(`  smallest item, A-weighted: ${db(first.aRms / last.aRms).toFixed(1)} dB vs the largest`);
console.log(`  the pitch mapping costs:   ${(db(first.aRms / last.aRms) - db(first.rms / last.rms)).toFixed(1)} dB of the intended reduction`);
const loudest = rows.reduce((a, b) => (b.aRms > a.aRms ? b : a));
console.log(`  PERCEPTUALLY LOUDEST is rel ${loudest.r.toFixed(2)} (${(loudest.r / 0.88 * 100).toFixed(0)}% of max pickup size)`);
console.log(loudest.r < 0.5
  ? '  => small items ARE perceptually the loudest. The complaint is about FREQUENCY\n     weighting as much as gain; scaling amplitude alone treats the symptom.'
  : '  => large items are perceptually loudest, so the complaint is about gain alone.');

/* ---- fart mode: the brief, checked ---- */
if (FART) {
  console.log('\n=== fart mode: does it do what was asked ===');
  const small = rows[0], big = rows[rows.length - 1];
  const pitchOk = small.centroid > big.centroid * 1.3;
  const durOk = big.dur > small.dur * 1.8;
  console.log(`  small: centroid ${small.centroid.toFixed(0)} Hz, ${small.dur.toFixed(3)}s`);
  console.log(`  large: centroid ${big.centroid.toFixed(0)} Hz, ${big.dur.toFixed(3)}s`);
  console.log(`  ${pitchOk ? 'PASS' : 'FAIL'}  small items are higher pitched`);
  console.log(`  ${durOk ? 'PASS' : 'FAIL'}  large items last longer  (${(big.dur / small.dur).toFixed(1)}x)`);

  /* No two the same. Cross-correlate eight renders at one size; anything near
     1.0 means the joke is a loop. */
  const reps = globalThis.__repeats || [];
  let worst = 0, pairs = 0;
  for (let i = 0; i < reps.length; i++) {
    for (let j = i + 1; j < reps.length; j++) {
      const a = reps[i], b = reps[j];
      let num = 0, da = 0, dbv = 0;
      for (let k = 0; k < Math.min(a.length, b.length); k++) { num += a[k] * b[k]; da += a[k] * a[k]; dbv += b[k] * b[k]; }
      const c = Math.abs(num) / Math.max(1e-30, Math.sqrt(da * dbv));
      worst = Math.max(worst, c); pairs++;
    }
  }
  console.log(`  ${worst < 0.9 ? 'PASS' : 'FAIL'}  no two are the same   worst of ${pairs} pairs: ${worst.toFixed(3)} similarity`);
}

if (KEEP) {
  const dir = path.join(ROOT, 'tools', 'audio');
  fs.mkdirSync(dir, { recursive: true });
  console.log(`\n(--wav: probe rendering is per-context; use voicelab-style export if needed)`);
}

await browser.close();
await server.close();
