/* ============================================================
   Camera-relative movement check.

   For a spread of camera angles, press each of W/A/S/D and assert
   the katamari accelerates in the direction that key should mean
   *given where the camera is actually pointing*. The expected
   direction is taken from the real THREE camera via
   getWorldDirection(), not recomputed from the same yaw the
   movement code uses — otherwise a sign error would cancel out
   on both sides and the test would happily pass.
   ============================================================ */

import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let chromium;
try { chromium = (await import('playwright')).chromium; }
catch { console.error('needs Playwright: npm i -D playwright && npx playwright install chromium'); process.exit(2); }

const server = await createServer({ root: ROOT, server: { port: 5203 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
await page.goto('http://localhost:5203/', { waitUntil: 'load' });
await page.waitForFunction(() => window.__llmaci?.state === 'title', { timeout: 90000 });
await page.evaluate(() => window.__llmaci.onAction('pick-stage', { dataset: { stage: 'house' } }));
await page.waitForFunction(() => window.__llmaci.state === 'intro', { timeout: 120000 });
await page.evaluate(() => window.__llmaci.begin());
await page.waitForTimeout(300);

const results = await page.evaluate(() => {
  const g = window.__llmaci, kat = g.kat, world = g.world, rig = g.rig;
  const out = [];
  const KEYS = {
    W: { moveX: 0, moveZ: -1 }, S: { moveX: 0, moveZ: 1 },
    A: { moveX: -1, moveZ: 0 }, D: { moveX: 1, moveZ: 0 },
  };

  for (let i = 0; i < 8; i++) {
    const yaw = (i / 8) * Math.PI * 2;
    rig.yaw = yaw;
    rig.quickTurn = 0;
    rig._initialised = false;
    // park the ball somewhere open so props don't perturb the test
    kat.pos.set(1.5, kat.radius, -4);
    rig.update(1 / 60, kat, world);
    g.scene.camera.updateMatrixWorld(true);

    // Ground-plane basis taken straight off the real camera.
    const fwd = g.scene.camera.getWorldDirection(kat.pos.clone());
    const fx = fwd.x, fz = fwd.z;
    const fl = Math.hypot(fx, fz) || 1;
    const F = { x: fx / fl, z: fz / fl };
    const R = { x: -F.z, z: F.x };   // right = up x forward, for Y-up

    for (const [name, inp] of Object.entries(KEYS)) {
      kat.vel.set(0, 0, 0);
      kat.pos.set(1.5, kat.radius, -4);
      kat.step(1 / 60, { ...inp, dash: false }, rig.yaw, world);
      const vl = Math.hypot(kat.vel.x, kat.vel.z) || 1;
      const V = { x: kat.vel.x / vl, z: kat.vel.z / vl };
      const want = name === 'W' ? F
        : name === 'S' ? { x: -F.x, z: -F.z }
        : name === 'D' ? R : { x: -R.x, z: -R.z };
      const dot = V.x * want.x + V.z * want.z;
      out.push({ yawDeg: Math.round(yaw * 180 / Math.PI), key: name, dot: +dot.toFixed(3) });
    }
  }
  return out;
});

await browser.close();
await server.close();

let bad = 0;
const byYaw = new Map();
for (const r of results) {
  if (!byYaw.has(r.yawDeg)) byYaw.set(r.yawDeg, []);
  byYaw.get(r.yawDeg).push(r);
  if (r.dot < 0.98) bad++;
}
console.log('dot(actual direction, expected direction) — 1.000 is perfect\n');
console.log('  yaw     W       A       S       D');
for (const [yaw, rows] of byYaw) {
  const get = (k) => rows.find((r) => r.key === k).dot.toFixed(3);
  const mark = rows.every((r) => r.dot >= 0.98) ? ' ok' : ' <-- WRONG';
  console.log(`  ${String(yaw).padStart(4)}°  ${get('W')}  ${get('A')}  ${get('S')}  ${get('D')}${mark}`);
}
console.log(`\n${bad === 0 ? 'PASS — movement is camera-relative at every angle'
  : `FAIL — ${bad}/${results.length} key+angle combinations move the wrong way`}`);
process.exit(bad === 0 ? 0 : 1);
