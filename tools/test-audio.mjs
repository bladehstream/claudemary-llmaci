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
await page.waitForFunction(() => window.__llmaci?.state === 'title', { timeout: 120000 });

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
await page.waitForFunction(() => window.__llmaci.state === 'intro', { timeout: 180000 });
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

await browser.close();
await server.close();
console.log(fail ? `\n${fail} FAILED` : '\nsilence is silent and zero is zero');
process.exit(fail ? 1 : 0);
