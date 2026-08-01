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
const stage = process.argv[2] || 'house';
const server = await createServer({ root: ROOT, server: { port: 5201 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
const errs = [];
page.on('pageerror', e => errs.push(e.message));
await page.goto('http://localhost:5201/', { waitUntil: 'load' });
await page.waitForFunction(() => window.__llmaci?.state === 'title', null, { timeout: 90000 });
await page.screenshot({ path: path.join(OUT, 'final-title.png') });
await page.evaluate(s => window.__llmaci.onAction('pick-stage', { dataset: { stage: s } }), stage);
await page.waitForFunction(() => window.__llmaci.state === 'intro', null, { timeout: 120000 });
await page.evaluate(() => window.__llmaci.begin());
await page.waitForTimeout(600);
// hand-place a grown katamari with attached objects so the shot is representative
await page.evaluate(() => {
  const g = window.__llmaci, k = g.kat, w = g.world, f = w.field;
  for (let pass = 0; pass < 260; pass++) {
    let best = -1, bd = 1e9;
    const lim = k.diameter * 0.88;
    for (let i = 0; i < f.n; i++) {
      if (!f.alive[i] || f.pickup[i] > lim) continue;
      const d = Math.hypot(f.x[i] - k.pos.x, f.z[i] - k.pos.z);
      if (d < bd) { bd = d; best = i; }
    }
    if (best < 0) break;
    // roll there properly so the spinner turns and attachments spread
    const dx = f.x[best] - k.pos.x, dz = f.z[best] - k.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    for (let n = 0; n < 240 && Math.hypot(f.x[best] - k.pos.x, f.z[best] - k.pos.z) > k.radius * 0.5; n++) {
      k.step(1 / 60, { moveX: (f.x[best] - k.pos.x) / d, moveZ: (f.z[best] - k.pos.z) / d, dash: false }, 0, w);
      w.resolve(k, 1 / 60, Math.random);
      if (!f.alive[best]) break;
    }
    if (f.alive[best]) {
      k.pos.x = f.x[best]; k.pos.z = f.z[best];
      k.pos.y = w.groundAt(k.pos.x, k.pos.z) + k.radius;
      k.attach(f.arch[best], { x: f.x[best], y: f.y[best] + 0.001, z: f.z[best] }, f.variant[best], 0, Math.random);
      f.remove(best);
    }
  }
  k.layoutAttached();
  g.rig._initialised = false;
});
await page.waitForTimeout(900);
await page.screenshot({ path: path.join(OUT, `final-${stage}.png`) });
console.log(stage, 'size', await page.evaluate(() => window.__llmaci.kat.diameter.toFixed(2)),
  'attached', await page.evaluate(() => window.__llmaci.kat.attached.length),
  'calls', await page.evaluate(() => window.__llmaci.scene.renderer.info.render.calls),
  'errors', errs.length ? errs : 'none');
await browser.close(); await server.close(); process.exit(0);
