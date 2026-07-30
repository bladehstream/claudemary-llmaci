/* The Options slider must actually move TUNING.speedP, persist across a
   reload, and be applied before a stage is built — not just stored. This
   number has been round-tripped six times; the whole point of exposing it is
   that the player can settle it without another rebuild, so it has to work. */
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const server = await createServer({ root: ROOT, server: { port: 5209 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
let fail = 0;
const check = (name, ok, extra = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '   ' + extra : ''}`);
  if (!ok) fail++;
};

await page.goto('http://localhost:5209/', { waitUntil: 'load' });
await page.waitForFunction(() => window.__llmaci?.state === 'title', { timeout: 90000 });

const def = await page.evaluate(() => ({
  opt: window.__llmaci.options.speedCurve, set: window.__llmaci.options.speedCurveSet,
}));
check('default matches the shipped exponent', Math.abs(def.opt - 0.56) < 1e-9, `got ${def.opt}`);
check('starts marked as untouched', def.set === false, `got ${def.set}`);

// Drag the slider to 20 and confirm the live tuning value follows.
await page.evaluate(() => {
  const el = document.getElementById('opt-speedcurve');
  el.value = '20';
  el.dispatchEvent(new Event('input', { bubbles: true }));
});
const after = await page.evaluate(() => ({
  opt: window.__llmaci.options.speedCurve,
  tuning: window.__llmaci.tuning.speedP,
  note: document.getElementById('opt-speedcurve-note').textContent,
  val: document.getElementById('opt-speedcurve-val').textContent,
}));
check('slider writes options.speedCurve', Math.abs(after.opt - 0.2) < 1e-9, `got ${after.opt}`);
check('slider writes TUNING.speedP', Math.abs(after.tuning - 0.2) < 1e-9, `got ${after.tuning}`);
check('readout updates', after.val === '20', `got "${after.val}"`);
check('note quotes a crossing time', /takes \d+s/.test(after.note), after.note.slice(0, 60) + '...');

// Reload: the value must survive AND be pushed back into TUNING, not just
// restored into the options object.
await page.reload({ waitUntil: 'load' });
await page.waitForFunction(() => window.__llmaci?.state === 'title', { timeout: 90000 });
const restored = await page.evaluate(() => ({
  opt: window.__llmaci.options.speedCurve,
  tuning: window.__llmaci.tuning.speedP,
  slider: document.getElementById('opt-speedcurve').value,
}));
check('survives reload', Math.abs(restored.opt - 0.2) < 1e-9, `got ${restored.opt}`);
check('reload re-applies to TUNING', Math.abs(restored.tuning - 0.2) < 1e-9, `got ${restored.tuning}`);
check('slider re-syncs', restored.slider === '20', `got "${restored.slider}"`);

/* A saved value the player NEVER chose must not pin them to an old build's
   default — that would silently exclude returning players from every future
   retune, which is the one audience a retune exists for. */
await page.evaluate(() => {
  const k = Object.keys(localStorage).find((s) => s.includes('llmaci') || s.includes('katamari'))
    || Object.keys(localStorage)[0];
  const d = JSON.parse(localStorage.getItem(k));
  d.options.speedCurve = 0.25;          // an old shipped default...
  d.options.speedCurveSet = false;      // ...that was never chosen
  localStorage.setItem(k, JSON.stringify(d));
});
await page.reload({ waitUntil: 'load' });
await page.waitForFunction(() => window.__llmaci?.state === 'title', { timeout: 90000 });
const migrated = await page.evaluate(() => ({
  opt: window.__llmaci.options.speedCurve, tuning: window.__llmaci.tuning.speedP,
}));
check('an untouched saved default adopts the new shipped one',
  Math.abs(migrated.opt - 0.56) < 1e-9 && Math.abs(migrated.tuning - 0.56) < 1e-9,
  `got ${migrated.opt} / ${migrated.tuning}`);

// And it has to reach the katamari that actually gets built.
await page.evaluate(() => window.__llmaci.onAction('pick-stage', { dataset: { stage: 'house' } }));
await page.waitForFunction(() => window.__llmaci.state === 'intro', { timeout: 120000 });
await page.evaluate(() => window.__llmaci.begin());
await page.waitForTimeout(400);
// `kat.topSpeed` is only written inside `step`, so drive a few real frames
// rather than trusting the constructor's placeholder of 1.
const live = await page.evaluate(() => {
  const g = window.__llmaci, k = g.kat;
  for (let i = 0; i < 12; i++) {
    k.step(1 / 60, { moveX: 0, moveZ: -1, dash: false }, 0, g.world);
    g.world.resolve(k, 1 / 60, Math.random);
  }
  return { top: k.topSpeed, stage: k.stageSpeed, start: k.stageStart, d: k.diameter, p: g.tuning.speedP };
});
const expected = live.stage * Math.pow(Math.max(1, live.d / live.start), live.p);
check('katamari top speed uses the chosen exponent',
  Math.abs(live.top - expected) < 1e-6, `top ${live.top.toFixed(4)} vs ${expected.toFixed(4)}`);

await browser.close();
await server.close();
console.log(fail ? `\n${fail} FAILED` : '\nPASS — the speed curve is settable, sticky and live');
process.exit(fail ? 1 : 0);
