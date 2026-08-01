/* Put a katamari at an exact spot in a stage, grow it, and photograph it.
   For chasing down "this looks wrong" reports against real geometry. */
import { createServer } from 'vite';
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'tools', 'shots'); fs.mkdirSync(OUT, { recursive: true });
const [stage, tag, sx, sz, size, yaw, distMul, pitch] = process.argv.slice(2);
const server = await createServer({ root: ROOT, server: { port: 5215 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH,
  args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 660 } });
await page.goto('http://localhost:5215/', { waitUntil: 'load' });
await page.waitForFunction(() => window.__llmaci?.state === 'title', null, { timeout: 120000 });
await page.evaluate(s => window.__llmaci.onAction('pick-stage', { dataset: { stage: s } }), stage);
await page.waitForFunction(() => window.__llmaci.state === 'intro', null, { timeout: 180000 });
await page.evaluate(() => window.__llmaci.begin());
await page.waitForTimeout(500);
await page.evaluate(([dm, p]) => { if (dm) window.__dist = dm; if (p) window.__pitch = p; },
  [distMul ? parseFloat(distMul) : 0, pitch ? parseFloat(pitch) : 0]);
const info = await page.evaluate(([x, z, d, y]) => {
  const g = window.__llmaci, k = g.kat, w = g.world, f = w.field;
  // grow by eating whatever is small enough, near the target, until at size
  for (let pass = 0; pass < 40 && k.diameter < d; pass++) {
    const lim = k.diameter * 0.88;
    for (let i = 0; i < f.n && k.diameter < d; i++) {
      if (!f.alive[i] || f.pickup[i] > lim) continue;
      k.attach(f.arch[i], { x: f.x[i], y: f.y[i], z: f.z[i] }, f.variant[i], 0, Math.random);
      f.remove(i);
    }
  }
  k.pos.set(x, w.groundAt(x, z) + k.radius, z);
  k.vel.set(0, 0, 0);
  g.rig.yaw = y; g.rig._initialised = false;
  if (window.__dist) g.rig.distMul = window.__dist;
  if (window.__pitch) g.rig.pitch = window.__pitch;
  for (let i = 0; i < 40; i++) { w.resolve(k, 1 / 60, Math.random); g.rig.update(1 / 60, k, w); }
  // what is standing within two radii — the usual culprit when a shot looks wrong
  const near = [];
  w.field.query(x, z, k.radius * 4, (i) => {
    if (!w.field.alive[i]) return;
    near.push(`${w.field.arch[i].id}@${Math.hypot(w.field.x[i] - x, w.field.z[i] - z).toFixed(3)}`
      + `/r${w.field.rad[i].toFixed(3)}/y${w.field.y[i].toFixed(3)}`);
  });
  return { d: k.diameter, y: k.pos.y, ground: w.groundAt(x, z), att: k.attached.length,
    near: near.slice(0, 10) };
}, [parseFloat(sx), parseFloat(sz), parseFloat(size), parseFloat(yaw || '0.8')]);
await page.waitForTimeout(1200);
const file = path.join(OUT, `${stage}-${tag}.png`);
await page.screenshot({ path: file });
console.log(`${file}  D=${info.d.toFixed(4)} y=${info.y.toFixed(4)} ground=${info.ground.toFixed(4)} attached=${info.att}`);
console.log('  near:', info.near.join('  '));
await browser.close(); await server.close();
