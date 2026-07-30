/* ============================================================
   Every stage, in a real browser, start to roll.

   The other harnesses are headless: `balance` drives the physics
   with no renderer at all, `gaps` and `climb` poke the collision
   code directly. None of them would notice a stage that throws on
   its first frame, references a prop id that does not exist, or
   builds geometry WebGL refuses. That gap became real the moment
   the game went from three stages to six.

   For each stage: load it, begin, drive for a couple of seconds,
   and assert the boring things — no page errors, the katamari is
   on the ground rather than falling through it or floating above
   it, the size readout is in that stage's units, and the world
   actually contains something to collect.
   ============================================================ */

import { createServer } from 'vite';
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TIERS } from '../src/util/math.js';

const ROOT = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const server = await createServer({ root: ROOT, server: { port: 5211 }, logLevel: 'error' });
await server.listen();

const browser = await chromium.launch({
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 700, height: 460 } });

const errors = [];
page.on('pageerror', (e) => errors.push(String(e.message)));
page.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|ERR_INTERNET/.test(m.text())) errors.push(m.text()); });

await page.goto('http://localhost:5211/', { waitUntil: 'load' });
await page.waitForFunction(() => window.__llmaci?.state === 'title', { timeout: 120000 });

const stages = await page.evaluate(() => window.__llmaci.stageIds());
let fail = 0;
const check = (name, ok, extra = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '   ' + extra : ''}`);
  if (!ok) fail++;
};

console.log(`\n${stages.length} stages\n`);
for (const id of stages) {
  const before = errors.length;
  await page.evaluate((s) => {
    const g = window.__llmaci;
    if (g.state !== 'title') g.toTitle();
    g.onAction('pick-stage', { dataset: { stage: s } });
  }, id);
  await page.waitForFunction(() => window.__llmaci.state === 'intro', { timeout: 180000 });
  await page.evaluate(() => window.__llmaci.begin());
  await page.waitForTimeout(400);

  // Drive for two seconds of game time in a straight-ish line, then look.
  const r = await page.evaluate(() => {
    const g = window.__llmaci, k = g.kat, w = g.world;
    let heading = 0.7;
    for (let i = 0; i < 120; i++) {
      heading += 0.01;
      k.step(1 / 60, { moveX: Math.cos(heading), moveZ: Math.sin(heading), dash: false }, 0, w);
      w.resolve(k, 1 / 60, Math.random);
      w.time += 1 / 60;
    }
    // Push the size through the real HUD path, otherwise the readout under test
    // is whatever the previous stage left in the DOM — which still matched the
    // unit regex often enough to look like a pass.
    g.hud.setSize(k.diameter, false);
    const ground = w.groundAt(k.pos.x, k.pos.z);
    return {
      stage: g.stage.id, unit: g.stage.unit || 'metric',
      props: w.field.n, live: w.field.liveCount,
      d: k.diameter, start: g.stage.startSize,
      gap: (k.pos.y - k.radius) - ground,
      moved: Math.hypot(k.pos.x - g.stage.spawn.x, k.pos.z - g.stage.spawn.z),
      readout: document.getElementById('size-readout')?.textContent || '',
      collectable: w.countCollectable(k.diameter, 40),
    };
  });

  /* Strict, and anchored on the SMALLEST tier of each ladder — `formatSize`
     always keeps that one, so it is the suffix guaranteed to be present.
     Requiring a DIGIT immediately before it is what keeps this tight: a loose
     /m/ for metric matched "52cm1mm" left over from a previous stage and so
     passed while testing nothing, and it would also match the mega ladder's
     "742km". Derived from TIERS rather than restated — the restated copy covered
     four of the ten ladders and crashed on an undefined lookup when the cosmic
     stages arrived, which is a harness bug dressed as a stage failure. */
  const tiers = TIERS[r.unit];
  const unitOk = !!tiers
    && (!r.readout || new RegExp(`\\d+${tiers[tiers.length - 1][0]}$`).test(r.readout));
  const onGround = Math.abs(r.gap) < r.d * 0.6;

  console.log(`${r.stage}  (${r.props} props, unit ${r.unit})`);
  check('  no page errors', errors.length === before, errors.slice(before).join(' | ').slice(0, 160));
  check('  stage has props', r.props > 200, `${r.props}`);
  check('  something is edible at the start size', r.collectable > 0, `${r.collectable} within reach`);
  check('  katamari sits on the ground', onGround, `gap ${r.gap.toFixed(4)} vs radius ${(r.d / 2).toFixed(4)}`);
  check('  it can actually move from spawn', r.moved > r.d * 0.5, `moved ${r.moved.toFixed(3)}`);
  check('  size readout uses the stage units', unitOk, `"${r.readout}"`);
}

await browser.close();
await server.close();
console.log(fail ? `\n${fail} FAILED` : '\nevery stage loads, renders and rolls');
process.exit(fail ? 1 : 0);
