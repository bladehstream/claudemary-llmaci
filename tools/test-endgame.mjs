/* ============================================================
   End-of-round conditions.

   1. Stripping the stage of everything collectable ends the round
      on its own, without waiting out the clock.
   2. Enter finishes early once the goal is met.
   3. Enter does NOT finish before the goal (that would just be
      quitting with extra steps).
   4. The clock still ends the round normally.
   ============================================================ */

import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let chromium;
try { chromium = (await import('playwright')).chromium; }
catch { console.error('needs Playwright: npm i -D playwright && npx playwright install chromium'); process.exit(2); }

const server = await createServer({ root: ROOT, server: { port: 5205 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://localhost:5205/', { waitUntil: 'load' });
await page.waitForFunction(() => window.__llmaci?.state === 'title', null, { timeout: 90000 });

async function startHouse() {
  await page.evaluate(() => window.__llmaci.onAction('pick-stage', { dataset: { stage: 'house' } }));
  await page.waitForFunction(() => window.__llmaci.state === 'intro', null, { timeout: 120000 });
  await page.evaluate(() => window.__llmaci.begin());
  await page.waitForTimeout(250);
}

const results = [];
const check = (name, pass, detail = '') => { results.push({ name, pass, detail }); };

/* ---- 1. strip the stage ---- */
await startHouse();
const stripped = await page.evaluate(() => {
  const g = window.__llmaci, k = g.kat, f = g.world.field;
  // swallow everything, biggest-first so the katamari keeps growing into range
  for (let pass = 0; pass < 60; pass++) {
    const lim = k.diameter * 0.88;
    let got = 0;
    for (let i = 0; i < f.n; i++) {
      if (!f.alive[i] || f.pickup[i] > lim) continue;
      k.attach(f.arch[i], { x: f.x[i], y: f.y[i], z: f.z[i] }, f.variant[i], 0, Math.random);
      f.remove(i); got++;
    }
    if (!got) break;
  }
  return { live: f.liveCount, total: f.n, size: k.diameter, timeLeft: g.timeLeft };
});
/* Two separate assertions: that exhaustion is DETECTED, and that the round then
 * ENDS. The budget between them is pure wall-clock arithmetic, and it is worth
 * writing down because it has already failed once for a reason with nothing to
 * do with the endgame:
 *
 *   grace period          3.2s of GAME time  (Game.exhaustedIn)
 *   dt clamped to         0.1s per frame     (Game._loop)
 *   => at least 32 FRAMES must render, whatever the hardware does
 *
 * Under swiftshader one frame carrying a katamari with 1,442 objects stuck to it
 * takes several wall seconds, so 32 frames is minutes. 120s passed comfortably
 * at three stages; adding three more took the archetype catalogue from ~180 to
 * 277 and the per-frame cost with it, and this started reporting "still playing"
 * — which reads exactly like a broken endgame and is not one. If it fails again,
 * check the frame rate before you go looking at the game logic.
 *
 * SECOND TIME, SAME LESSON, WORTH WRITING DOWN: it failed again with
 * `balance --runs=9` running in the background over eleven stages. Measured on an
 * idle box a loaded frame costs ~0.9s, so the 32 frames take 25s of the 300s
 * allowed and there is no problem at all. Under that CPU load they did not fit.
 * Do not run this concurrently with the balance sweep, and do not believe a
 * failure here that was measured while something else was saturating the cores. */
await page.waitForFunction(() => window.__llmaci.exhausted === true, null, { timeout: 120000 })
  .then(() => check('empty stage is detected', true,
    `${stripped.total - stripped.live}/${stripped.total} props, ${stripped.timeLeft.toFixed(0)}s still on the clock`))
  .catch(() => check('empty stage is detected', false, 'never flagged exhausted'));
await page.waitForFunction(() => window.__llmaci.state === 'results', null, { timeout: 300000 })
  .then(() => check('stripped stage ends the round', true))
  .catch(() => check('stripped stage ends the round', false, 'still playing'));

const clearedUi = await page.evaluate(() => ({
  title: document.getElementById('results-title')?.textContent,
  cleared: document.getElementById('results-cleared')?.textContent,
  king: document.getElementById('king-text')?.textContent,
}));
check('cleared round gets its own title', clearedUi.title === 'Nothing Left', `title="${clearedUi.title}"`);
check('results report how much was rolled up', /^\d+%$/.test(clearedUi.cleared || ''), `"${clearedUi.cleared}"`);

/* ---- 2. Enter finishes early once past the goal ---- */
await page.evaluate(() => window.__llmaci.toTitle());
await startHouse();
await page.evaluate(() => {
  const g = window.__llmaci, k = g.kat, f = g.world.field;
  for (let pass = 0; pass < 60 && k.diameter < g.stage.goal * 1.05; pass++) {
    const lim = k.diameter * 0.88;
    let got = 0;
    for (let i = 0; i < f.n; i++) {
      if (!f.alive[i] || f.pickup[i] > lim) continue;
      k.attach(f.arch[i], { x: f.x[i], y: f.y[i], z: f.z[i] }, f.variant[i], 0, Math.random);
      f.remove(i); got++;
      if (k.diameter >= g.stage.goal * 1.05) break;
    }
    if (!got) break;
  }
});
await page.waitForFunction(() => window.__llmaci.goalMet === true, null, { timeout: 10000 }).catch(() => {});
const goalMet = await page.evaluate(() => window.__llmaci.goalMet);
check('goal flag set after passing the goal', goalMet === true);
await page.keyboard.press('Enter');
await page.waitForTimeout(400);
check('Enter finishes early after the goal',
  await page.evaluate(() => window.__llmaci.state === 'results'));

/* ---- 3. Enter does nothing before the goal ---- */
await page.evaluate(() => window.__llmaci.toTitle());
await startHouse();
await page.keyboard.press('Enter');
await page.waitForTimeout(400);
check('Enter is ignored before the goal',
  await page.evaluate(() => window.__llmaci.state === 'playing'));

/* ---- 4. the clock still works ---- */
await page.evaluate(() => { window.__llmaci.timeLeft = 0.05; });
await page.waitForFunction(() => window.__llmaci.state === 'results', null, { timeout: 10000 })
  .then(() => check('clock still ends the round', true))
  .catch(() => check('clock still ends the round', false));

await browser.close();
await server.close();

let failed = 0;
for (const r of results) {
  if (!r.pass) failed++;
  console.log(`  ${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? `  (${r.detail})` : ''}`);
}
if (errors.length) { console.log('\npage errors:', errors); failed += errors.length; }
console.log(`\n${failed ? `${failed} FAILED` : 'all end-of-round conditions behave'}`);
process.exit(failed ? 1 : 0);
