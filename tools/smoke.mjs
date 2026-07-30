/* Headless smoke test: boot the game, walk the menus, start each stage,
   drive the katamari with synthetic input, and report errors + perf. */
import { createServer } from 'vite';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'tools', 'shots');

/** Playwright is an optional dev tool, so fail with advice rather than a stack trace. */
async function loadChromium() {
  try {
    return (await import('playwright')).chromium;
  } catch {
    console.error('This harness needs Playwright:\n  npm i -D playwright\n  npx playwright install chromium');
    process.exit(2);
  }
}

const chromium = await loadChromium();
fs.mkdirSync(OUT, { recursive: true });

const server = await createServer({ root: ROOT, server: { port: 5199 }, logLevel: 'error' });
await server.listen();
const url = 'http://localhost:5199/';

// CHROMIUM_PATH lets a sandbox point at a preinstalled build; otherwise use
// whatever `npx playwright install chromium` put on this machine.
const browser = await chromium.launch({
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });

const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 5).join('\n')));

await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => window.__katamari && window.__katamari.state === 'title', { timeout: 60000 });
console.log('booted, catalog build ms =', await page.evaluate(() => Math.round(window.__katamari.buildTime)));
await page.screenshot({ path: `${OUT}/00-title.png` });

/* Ask the game rather than restating the list. This was hard-coded to the three
   original stages and quietly stayed that way while the ladder grew to eleven, so
   the harness whose entire job is "photograph every stage" had not looked at
   eight of them. `test-stages` covers correctness across all eleven; this covers
   the part only an eyeball can check. */
const stages = await page.evaluate(() => window.__llmaci.stageIds());
for (const id of stages) {
  const t0 = Date.now();
  await page.evaluate((sid) => window.__katamari.onAction('pick-stage', { dataset: { stage: sid } }), id);
  await page.waitForFunction(() => window.__katamari.state === 'intro', { timeout: 120000 });
  const buildMs = Date.now() - t0;
  const info = await page.evaluate(() => ({ props: window.__katamari.world.totalProps }));
  console.log(`${id}: build ${buildMs}ms, props ${info.props}`);
  await page.screenshot({ path: `${OUT}/${id}-intro.png` });

  await page.evaluate(() => window.__katamari.begin());
  await page.waitForTimeout(400);

  const samples = [];
  for (let i = 0; i < 26; i++) {
    await page.keyboard.down('KeyW');
    await page.evaluate((n) => { window.__katamari.rig.yaw += Math.sin(n * 0.7) * 0.55; }, i);
    await page.waitForTimeout(320);
    samples.push(await page.evaluate(() => {
      const g = window.__katamari;
      return { d: g.kat.diameter, n: g.kat.collectedCount, att: g.kat.attached.length,
        calls: g.scene.renderer.info.render.calls, tris: g.scene.renderer.info.render.triangles };
    }));
  }
  await page.keyboard.up('KeyW');
  const last = samples[samples.length - 1];
  console.log(`  after ~8s: size ${last.d.toFixed(3)}m, ${last.n} objects, ${last.att} attached, ${last.calls} draw calls, ${(last.tris / 1000).toFixed(0)}k tris`);
  await page.screenshot({ path: `${OUT}/${id}-play.png` });

  const fps = await page.evaluate(() => new Promise((res) => {
    let n = 0; const t0 = performance.now();
    const tick = () => { if (++n < 90) requestAnimationFrame(tick); else res(Math.round(n / ((performance.now() - t0) / 1000))); };
    requestAnimationFrame(tick);
  }));
  console.log(`  fps (software GL): ${fps}`);

  await page.evaluate(() => { window.__katamari.timeLeft = 0.05; });
  await page.waitForFunction(() => window.__katamari.state === 'results', { timeout: 20000 });
  await page.screenshot({ path: `${OUT}/${id}-results.png` });
  await page.evaluate(() => window.__katamari.toTitle());
  await page.waitForTimeout(200);
}

console.log('\n=== errors ===');
console.log(errors.length ? errors.join('\n---\n') : 'none');

await browser.close();
await server.close();
process.exit(errors.length ? 1 : 0);
