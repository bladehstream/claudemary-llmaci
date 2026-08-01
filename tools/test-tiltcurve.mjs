/* ============================================================
   What does the phone ACTUALLY do as you tilt it?

   The player's report was "it feels very on/off for the
   directions", and their proposed fix was to quantise the tilt
   into 20% steps. Quantising a continuous signal cannot make it
   feel less stepped, so either the signal is not continuous or
   something downstream is discarding it — and the way to find
   out which is to sweep the sensor and write down what the
   katamari does, not to read the source and have an opinion.

   Two sweeps, both at a fixed katamari size so `topSpeedFor`
   is constant across the run:

     BETA  (drive)  -> steady-state speed, as a fraction of the
                       stage's top speed
     GAMMA (turn)   -> camera yaw rate, rad/s

   A proportional control gives a ramp. A binary one gives a
   step, and every reading above the deadzone is identical.

   Run: node tools/test-tiltcurve.mjs
   ============================================================ */

import { createServer } from 'vite';
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const server = await createServer({ root: ROOT, server: { port: 5233 }, logLevel: 'error' });
await server.listen();

const browser = await chromium.launch({
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'],
});

const PHONE = { width: 390, height: 844 };
const initScript = `
  window.__tilt = { beta: 50, gamma: 0, listeners: [] };
  class FakeDOE extends Event {
    constructor(t, i) { super(t); this.alpha = 0; this.beta = i.beta; this.gamma = i.gamma; this.absolute = false; }
    static requestPermission() { setTimeout(() => window.__setBeta(window.__tilt.beta), 20); return Promise.resolve('granted'); }
  }
  window.DeviceOrientationEvent = FakeDOE;
  const realAdd = window.addEventListener.bind(window);
  window.addEventListener = function (t, fn, o) {
    if (t === 'deviceorientation') window.__tilt.listeners.push(fn);
    return realAdd(t, fn, o);
  };
  const fire = () => { for (const fn of window.__tilt.listeners) fn({ beta: window.__tilt.beta, gamma: window.__tilt.gamma, alpha: 0 }); };
  window.__setBeta  = (b) => { window.__tilt.beta = b; fire(); };
  window.__setGamma = (g) => { window.__tilt.gamma = g; fire(); };
`;

const ctx = await browser.newContext({ viewport: PHONE, hasTouch: true, deviceScaleFactor: 2 });
await ctx.addInitScript(initScript);
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.message)));
await page.goto('http://localhost:5233/', { waitUntil: 'load' });
await page.waitForFunction(() => window.__llmaci?.state === 'title', null, { timeout: 120000 });

await page.evaluate(() => {
  const g = window.__llmaci;
  g.onAction('pick-stage', { dataset: { stage: 'house' } });
});
await page.waitForFunction(() => window.__llmaci.state === 'intro', null, { timeout: 180000 });
await page.evaluate(async () => {
  await window.__llmaci.touch.requestTilt();
  window.__llmaci.begin();
});
await page.waitForFunction(() => window.__llmaci.state === 'playing', null, { timeout: 20000 });
await page.evaluate(() => new Promise((r) => { let n = 0; const t = () => (++n > 8 ? r() : requestAnimationFrame(t)); requestAnimationFrame(t); }));

/* Neutral at 50, and pin it there so a stray reading cannot re-zero mid-sweep.
   Everything below is measured as an offset from this. */
await page.evaluate(() => { window.__setBeta(50); window.__setGamma(0); window.__llmaci.touch.calibrate(); });

/* Remember the spawn so every sample starts from the same clear ground.
   The first version of this only zeroed the velocity, and the ball spent the
   whole sweep driving forward across the house — by the 18° row it had reached
   a wall, so two rows read 3% of top speed and the "is it proportional?"
   verdict counted that obstruction as evidence of proportional control. The
   table was right and the summary underneath it was wrong, which is the more
   dangerous of the two failures. */
const SPAWN = await page.evaluate(() => {
  const p = window.__llmaci.kat.pos;
  return { x: p.x, y: p.y, z: p.z };
});
const reset = (extra = {}) => page.evaluate((s) => {
  const g = window.__llmaci;
  g.kat.pos.set(s.x, s.y, s.z);
  g.kat.vel.x = 0; g.kat.vel.z = 0; g.kat.vel.y = 0;
}, SPAWN).then(() => page.evaluate(extra.fn || (() => {})));

/* Let the ball reach a steady state at each angle. Under swiftshader a frame
   is a clamped 0.1s of game time, so 22 frames is ~2.2s of in-game
   acceleration — comfortably past the point where `along` has walked to
   whatever cap it is going to reach. */
const settle = (n) => page.evaluate((k) => new Promise((res) => {
  let i = 0; const t = () => (++i > k ? res() : requestAnimationFrame(t)); requestAnimationFrame(t);
}), n);

console.log('\n=== DRIVE: tip the phone forward (beta below the 50 neutral) ===');
console.log('  offset   input      speed      % of top');
const drive = [];
for (const off of [0, 2, 4, 6, 8, 11, 14, 18, 22, 28, 35, 45]) {
  await page.evaluate((s) => {
    const g = window.__llmaci;
    // Back to spawn, stationary — not just stationary. See SPAWN above.
    g.kat.pos.set(s.x, s.y, s.z);
    g.kat.vel.x = 0; g.kat.vel.z = 0; g.kat.vel.y = 0;
    window.__setBeta(s.b);
  }, { ...SPAWN, b: 50 - off });
  await settle(22);
  const r = await page.evaluate(() => {
    const g = window.__llmaci;
    return {
      inp: Math.abs(g.touch.read().moveZ),
      speed: Math.hypot(g.kat.vel.x, g.kat.vel.z),
      top: g.kat.topSpeed,
    };
  });
  const frac = r.speed / r.top;
  drive.push({ off, inp: r.inp, frac });
  console.log(`  ${String(off).padStart(4)}°   ${r.inp.toFixed(3)}   ${r.speed.toFixed(4)}   ${(frac * 100).toFixed(1)}%`);
}

console.log('\n=== TURN: roll the phone (gamma) ===');
console.log('  offset   input      yaw rate');
const turn = [];
for (const off of [0, 3, 6, 9, 12, 16, 20, 26, 33, 42, 55]) {
  await page.evaluate((s) => {
    const g = window.__llmaci;
    g.kat.pos.set(s.x, s.y, s.z);
    g.kat.vel.x = 0; g.kat.vel.z = 0; g.kat.vel.y = 0;
    window.__setGamma(s.g);
  }, { ...SPAWN, g: off });
  /* Enough frames for the ~70ms sensor filter to settle at the new angle.
     Two was not: the filter carries over from the previous row, so a short
     settle measures the tail of the last sample and every rate reads low. */
  await settle(5);
  const r = await page.evaluate(() => new Promise((res) => {
    const g = window.__llmaci;
    const y0 = g.rig.yaw, t0 = performance.now();
    let n = 0;
    const tick = () => {
      if (++n < 10) return requestAnimationFrame(tick);
      res({ inp: g.touch.read().turn, rate: (g.rig.yaw - y0) / ((performance.now() - t0) / 1000) });
    };
    requestAnimationFrame(tick);
  }));
  turn.push({ off, inp: r.inp, rate: Math.abs(r.rate) });
  console.log(`  ${String(off).padStart(4)}°   ${r.inp.toFixed(3)}   ${Math.abs(r.rate).toFixed(3)} rad/s`);
}

/* ---- the verdict ----
   NOT "is there any spread in the output" — an obstruction produces spread and
   the first version of this read a wall as proof of proportional control.

   The question is whether a SMALL input produces a SMALL output. So compare
   the output at the gentlest live input against the output at full deflection.
   A proportional control gives a low ratio; a switch gives 1.0, because every
   live angle is the same angle as far as the game is concerned. */
const verdict = (rows, key, label, unit) => {
  const live = rows.filter((r) => r.inp > 0.001).sort((a, b) => a.inp - b.inp);
  if (live.length < 2) { console.log(`  ${label}: too few live steps to judge`); return; }
  const lo = live[0], hi = live[live.length - 1];
  const ratio = hi[key] > 1e-6 ? lo[key] / hi[key] : 1;
  /* Perfectly linear would put this at lo.inp/hi.inp. Anything close to 1.0
     means the gentlest touch already commands everything a full tilt does. */
  const ideal = lo.inp / hi.inp;
  console.log(`  ${label}: gentlest live input ${lo.inp.toFixed(2)} -> ${lo[key].toFixed(3)}${unit}`);
  console.log(`  ${' '.repeat(label.length)}  full input      ${hi.inp.toFixed(2)} -> ${hi[key].toFixed(3)}${unit}`);
  console.log(`  ${' '.repeat(label.length)}  ratio ${ratio.toFixed(2)} (linear would be ${ideal.toFixed(2)}) — ${
    ratio > 0.9 ? 'BINARY: a nudge commands as much as a full tilt' : 'proportional'}`);
};

console.log('\n=== verdict ===');
verdict(drive, 'frac', 'drive', ' of top speed');
verdict(turn, 'rate', 'turn ', ' rad/s');

/* ---- the slider actually moves the band ----
   The whole argument for shipping `tiltRange` as an option is that nobody can
   pick this number from here, which is worth nothing if the slider is inert. */
console.log('\n=== Options -> Tilt range ===');
console.log('  mul     input at 20° tilt');
const atTwenty = [];
for (const mul of [0.6, 1.0, 1.6]) {
  await page.evaluate((m) => {
    const g = window.__llmaci;
    g.setOption('tiltRange', m);
    window.__setBeta(30);            // 20 degrees below the 50 neutral
  }, mul);
  await settle(6);
  const inp = await page.evaluate(() => Math.abs(window.__llmaci.touch.read().moveZ));
  atTwenty.push(inp);
  console.log(`  ${mul.toFixed(1)}x    ${inp.toFixed(3)}`);
}
const monotonic = atTwenty[0] > atTwenty[1] && atTwenty[1] > atTwenty[2];
console.log(`  ${monotonic ? 'PASS' : 'FAIL'}  a narrower band gives more thrust for the same tilt`);

/* ---- and the filter actually filters ----
   Sensor noise is the second route to "feels on/off": a shivering ball pushes
   you to hold the phone at the clamped ends where the signal is steady. Feed a
   jittering angle and check the output moves less than the input does. */
console.log('\n=== sensor smoothing ===');
await page.evaluate(() => window.__llmaci.setOption('tiltRange', 1));
/* AT 60fps, DRIVEN DIRECTLY — not once per rAF.
   The first version stepped the filter on requestAnimationFrame, and under
   swiftshader that is ~10fps. A 70ms time constant cannot filter a signal
   sampled every 100ms — there is nothing between the samples to average — so
   it measured 10.9 points of swing and reported a broken filter. Nothing was
   broken; the harness was asking a 70ms filter to work at a 100ms sample rate.
   A phone runs this at 60fps, so drive `update()` at 60fps and measure what a
   phone would actually see. */
const jitter = await page.evaluate(() => {
  const g = window.__llmaci;
  const DT = 1 / 60;
  const NOISE = 3;                                     // degrees peak to peak
  const run = (filtered) => {
    const outs = [];
    // Deterministic zig-zag, not random: noise is noise, and a fixed input
    // makes the number reproducible run to run.
    for (let i = 0; i < 60; i++) {
      window.__setBeta(30 + (i % 2 ? NOISE / 2 : -NOISE / 2));
      if (filtered) g.touch.update(DT);
      else { g.touch.fRaw = g.touch.raw; g.touch.fTurn = g.touch.rawTurn; }
      outs.push(Math.abs(g.touch.read().moveZ));
    }
    const tail = outs.slice(20);                       // past the settling ramp
    return Math.max(...tail) - Math.min(...tail);
  };
  return { raw: run(false), filtered: run(true) };
});
console.log(`  3° of jitter, unfiltered: ${(jitter.raw * 100).toFixed(1)} points of output swing`);
console.log(`  3° of jitter, filtered:   ${(jitter.filtered * 100).toFixed(1)} points`);
const cut = jitter.raw > 1e-6 ? 1 - jitter.filtered / jitter.raw : 0;
console.log(`  ${jitter.filtered < jitter.raw * 0.5 ? 'PASS' : 'FAIL'}  the filter removes ${(cut * 100).toFixed(0)}% of it`);
console.log(`\n  page errors: ${errors.length ? errors.join(' | ') : 'none'}`);

await browser.close();
await server.close();
