/* ============================================================
   Is it actually silent when it should be?

   Two reports this exists to prevent regressing:

     "there is a persistent background hiss/thrumming embedded in
      the sound effects track even when not playing a round"
     "turning the music or sound effects to 0 should make them
      silent, not just quiet"

   Both were real and neither was visible to any other harness,
   because nothing measured the output. This runs the real game in
   a real browser, hangs an AnalyserNode off the master bus and
   reads RMS — so it measures what a player hears, including the
   reverb tails and the always-on rolling voice, which is exactly
   where both bugs lived.
   ============================================================ */

import { createServer } from 'vite';
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const server = await createServer({ root: ROOT, server: { port: 5213 }, logLevel: 'error' });
await server.listen();

const browser = await chromium.launch({
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 640, height: 420 } });
await page.goto('http://localhost:5213/', { waitUntil: 'load' });
await page.waitForFunction(() => window.__llmaci?.state === 'title', null, { timeout: 120000 });

let fail = 0;
const check = (name, ok, extra = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '   ' + extra : ''}`);
  if (!ok) fail++;
};

// Bring the audio graph up and hang a meter off the master bus.
await page.evaluate(() => {
  const g = window.__llmaci;
  g._ensureAudio();
  const e = g.audio;
  const an = e.ctx.createAnalyser();
  an.fftSize = 2048;
  e.master.connect(an);            // post-fader, pre-limiter: what the buses sum to
  const buf = new Float32Array(an.fftSize);
  window.__rms = () => {
    an.getFloatTimeDomainData(buf);
    let s = 0;
    for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
    return Math.sqrt(s / buf.length);
  };
});

/**
 * Worst RMS seen over `ms`, so a periodic tail cannot hide between samples.
 *
 * `fire` is called before every sample. One-shots are 0.1-0.3s transients, so
 * triggering them once and then measuring later reads as silence whatever the
 * fader is doing — the first version of this test failed its own "sfx at 1 is
 * audible" control for exactly that reason. Anything asserting a sound IS there
 * has to keep making it while the meter is running.
 */
const peakRms = async (ms, fire = null) => {
  let worst = 0;
  for (let i = 0; i < Math.max(1, Math.round(ms / 120)); i++) {
    if (fire) await page.evaluate(fire);
    worst = Math.max(worst, await page.evaluate(() => window.__rms()));
    await page.waitForTimeout(120);
  }
  return worst;
};
const FIRE_SFX = () => { const g = window.__llmaci; for (let i = 0; i < 3; i++) g.sfx.pickup(0.6, 1); };

const SILENT = 1e-4;   // -80 dBFS; below anything a speaker reproduces

/* ---- 1. the title screen, with the music deliberately off ---- */
await page.evaluate(() => { window.__llmaci.setOption('music', 0); });
await page.waitForTimeout(700);
const idle = await peakRms(1500);
check('title screen is silent with music at 0', idle < SILENT, `rms ${idle.toExponential(2)}`);

/* ---- 2. play, then quit, and make sure nothing follows us out ---- */
await page.evaluate(() => {
  const g = window.__llmaci;
  g.setOption('music', 0.6);
  g.onAction('pick-stage', { dataset: { stage: 'house' } });
});
await page.waitForFunction(() => window.__llmaci.state === 'intro', null, { timeout: 180000 });
await page.evaluate(() => window.__llmaci.begin());
// roll for real so the continuous voice is wide open when we leave
await page.evaluate(() => {
  const g = window.__llmaci;
  for (let i = 0; i < 90; i++) {
    g.kat.step(1 / 60, { moveX: 1, moveZ: -1, dash: true }, 0, g.world);
    g.world.resolve(g.kat, 1 / 60, Math.random);
  }
  g.sfx.updateRoll(1.2, g.kat.diameter, true, 0);
});
await page.waitForTimeout(400);
const rolling = await peakRms(500);
check('rolling actually makes a sound', rolling > SILENT * 5, `rms ${rolling.toExponential(2)}`);

await page.evaluate(() => { const g = window.__llmaci; g.setOption('music', 0); g.toTitle(); });
await page.waitForTimeout(900);
const afterQuit = await peakRms(1800);
check('nothing survives quitting to the title', afterQuit < SILENT, `rms ${afterQuit.toExponential(2)}`);

/* ---- 3. zero on either slider means zero, reverb tails included ---- */
await page.evaluate(() => {
  const g = window.__llmaci;
  g.setOption('music', 1);
  g.setOption('sfx', 1);
  g.music.play('menu');
});
await page.waitForTimeout(1400);
const loud = await peakRms(900);
check('music at 1 is audible', loud > SILENT * 20, `rms ${loud.toExponential(2)}`);

await page.evaluate(() => { window.__llmaci.setOption('music', 0); });
await page.waitForTimeout(1200);          // longer than the 1.9s impulse decays to nothing
const musicOff = await peakRms(2400);
check('music at 0 is silent, tails and all', musicOff < SILENT, `rms ${musicOff.toExponential(2)}`);

await page.evaluate(() => {
  const g = window.__llmaci;
  g.setOption('music', 0);
  g.setOption('sfx', 1);
});
await page.waitForTimeout(300);
const sfxOn = await peakRms(900, FIRE_SFX);
check('sound effects at 1 are audible', sfxOn > SILENT * 5, `rms ${sfxOn.toExponential(2)}`);

await page.evaluate(() => { window.__llmaci.setOption('sfx', 0); });
await page.waitForTimeout(600);
// Keep triggering them the whole time — a fader at zero has to swallow live
// sounds, not merely stop leaking the tail of an old one.
const sfxOff = await peakRms(2400, FIRE_SFX);
check('sound effects at 0 are silent, tails and all', sfxOff < SILENT, `rms ${sfxOff.toExponential(2)}`);

/* ---- 4. the transport survives a drifted clock ----------------------------
 *
 * ⚠ THIS SECTION EXISTS BECAUSE OF "the background music got crackly and then
 * stopped entirely", reported from the main menu after finishing a stage.
 *
 * A browser throttles a hidden tab's timers to roughly one per second, while
 * `AudioContext.currentTime` keeps running at real time. `Music._tick` walks
 * `nextTime` forward in step-sized increments, so a player who leaves the menu
 * open for two minutes and comes back has a `nextTime` two MINUTES behind —
 * about a thousand 16th notes owed. And the menu is exactly where a player
 * leaves the game sitting, which is why the report came from there.
 *
 * Web Audio starts a source scheduled at a past timestamp immediately, so a
 * catch-up loop dumps its entire per-tick allowance AT ONCE, every 25ms, until
 * it closes the gap: thousands of overlapping voices into a limiter. That is
 * the "crackly". Then, once the arithmetic in some voice computes a negative
 * absolute time, `setValueAtTime` throws a RangeError — measured, 60 of them in
 * a second and a half — and because the throw escapes the `setInterval`
 * callback BEFORE `nextTime` is advanced, the next tick retries the same step
 * and throws again, forever. That is the "stopped entirely", and it is why
 * starting a new round fixed it: `play()` resets the clock.
 *
 * Two independent defences, asserted separately below, because either one alone
 * leaves a hole:
 *   - resync, so no note is ever scheduled in the past;
 *   - a try/catch per step, so any FUTURE slip in any of eleven voices costs
 *     one dropped note instead of all remaining music.
 *
 * The drift is imposed rather than waited for: hiding a tab under Playwright
 * does not reliably reproduce timer throttling, and two minutes is not a
 * reasonable thing to put in a test suite.
 */
const VOICES = ['kick', 'snare', 'hat', 'rim', 'shaker', 'tom',
  'bass', 'pluck', 'vibe', 'scat', 'brass'];

await page.evaluate(() => {
  const g = window.__llmaci;
  g.setOption('music', 1);
  g.setOption('sfx', 0);
  g.music.play('menu');
});
await page.waitForTimeout(1400);

// Anything escaping the scheduler's setInterval callback lands here.
const pageErrors = [];
page.on('pageerror', (err) => pageErrors.push(String(err)));

/* Count every note the scheduler hands the engine.
 *
 * ⚠ THE HEADLINE NUMBER HERE IS NOTES PER SECOND, NOT LOUDNESS. An earlier
 * version compared peak RMS before and after, and it was flaky at 3x: the
 * resync deliberately lands on a bar boundary, so recovery always replays a
 * downbeat — kick, bass root and a four-note comp together, the loudest moment
 * in the loop — while the "normal" window might have sampled between them. RMS
 * measures which notes landed; the bug is HOW MANY. Count them instead, and
 * keep a much looser RMS bound as a second opinion. */
await page.evaluate((voices) => {
  const g = window.__llmaci;
  window.__drift = { past: [], notes: 0, undo: [] };
  for (const name of voices) {
    const fn = g.audio[name].bind(g.audio);
    g.audio[name] = (t, ...rest) => {
      const d = window.__drift;
      d.notes++;
      if (t < g.audio.now - 0.02) d.past.push(t - g.audio.now);
      return fn(t, ...rest);
    };
    window.__drift.undo.push(() => { g.audio[name] = fn; });
  }
}, VOICES);

const WINDOW = 1800;
const notesSoFar = () => page.evaluate(() => window.__drift.notes);
const n0 = await notesSoFar();
const normal = await peakRms(WINDOW);          // same window length as recovery,
const n1 = await notesSoFar();                 // so both get the same chance at a downbeat
check('the menu loop is playing before we break its clock', normal > SILENT * 20 && n1 > n0,
  `rms ${normal.toExponential(2)}, ${n1 - n0} notes`);

// Two minutes of hidden-tab drift, imposed in one go.
await page.evaluate(() => {
  const g = window.__llmaci;
  window.__drift.before = g.music.step;
  g.music.nextTime = g.audio.now - 120;
});
const recovering = await peakRms(WINDOW);
const drift = await page.evaluate(() => {
  const g = window.__llmaci; const m = g.music; const d = window.__drift;
  d.undo.forEach((u) => u());
  return {
    past: d.past.length,
    worst: d.past.length ? Math.min(...d.past) : 0,
    notes: d.notes,
    resynced: m.nextTime >= g.audio.now,
    advanced: m.step !== d.before,
    playing: m.playing,
  };
});
const during = drift.notes - n1;
const before = n1 - n0;

check('120s of drift schedules nothing in the past', drift.past === 0,
  drift.past ? `${drift.past} notes, worst ${drift.worst.toFixed(2)}s late` : `${drift.notes} notes, all ahead`);
check('the transport resyncs instead of catching up', drift.resynced && drift.advanced && drift.playing,
  `nextTime ${drift.resynced ? 'ahead' : 'BEHIND'}, step ${drift.advanced ? 'moving' : 'STUCK'}`);
/* A catch-up loop would fire 64 steps of notes per 25ms tick until it closed a
 * 120s gap — hundreds of times the normal rate, for tens of seconds. 2x is a
 * generous bound that still leaves two orders of magnitude of daylight. */
check('recovery does not dump a wall of notes', during < before * 2,
  `${during} notes in ${WINDOW}ms vs ${before} normal`);
// Pre-limiter tap, so a dump reads as a genuinely enormous number rather than
// being flattened to look normal by the limiter a player would hear.
check('recovery does not spike the master bus', recovering < normal * 6,
  `rms ${recovering.toExponential(2)} vs ${normal.toExponential(2)} normal`);

/* Now the second defence on its own: make every voice throw the exact error
 * that was measured, and confirm the transport keeps its footing. */
const thrown = await page.evaluate(async (voices) => {
  const g = window.__llmaci; const m = g.music;
  const saved = {}; let hits = 0;
  for (const name of voices) {
    saved[name] = g.audio[name];
    g.audio[name] = () => {
      hits++;
      throw new RangeError('Time must be a finite non-negative number: -118.973');
    };
  }
  const before = m.step;
  await new Promise((r) => setTimeout(r, 1400));
  for (const name of voices) g.audio[name] = saved[name];
  return { hits, advanced: m.step !== before, playing: m.playing, ahead: m.nextTime > g.audio.now };
}, VOICES);
check('a throwing voice is actually reached', thrown.hits > 0, `${thrown.hits} throws`);
check('one bad note does not kill the scheduler', thrown.advanced && thrown.playing && thrown.ahead,
  `step ${thrown.advanced ? 'moving' : 'STUCK'}, nextTime ${thrown.ahead ? 'ahead' : 'BEHIND'}`);
check('nothing escaped the scheduler', pageErrors.length === 0,
  pageErrors.length ? pageErrors[0].slice(0, 120) : '');

// And it is still audible afterwards, i.e. we restored the voices and the
// transport did not merely survive in silence.
await page.waitForTimeout(600);
const after = await peakRms(1200);
check('the music is still there when the errors stop', after > SILENT * 20,
  `rms ${after.toExponential(2)}`);

await browser.close();
await server.close();
console.log(fail ? `\n${fail} FAILED` : '\nsilence is silent and zero is zero');
process.exit(fail ? 1 : 0);
