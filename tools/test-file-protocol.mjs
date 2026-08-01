/* Verify the single-file build actually runs from file:// with no server. */
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = pathToFileURL(path.join(ROOT, 'dist-single', 'claudemary-llmaci.html')).href;
console.log('opening', FILE);

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
         '--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 1100, height: 660 } });
const errors = [], requests = [];
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
page.on('request', r => { if (!r.url().startsWith('file://') && !r.url().startsWith('data:')) requests.push(r.url()); });

await page.goto(FILE, { waitUntil: 'load' });
try {
  await page.waitForFunction(() => window.__llmaci?.state === 'title', null, { timeout: 45000 });
} catch (e) {
  console.log('BOOT FAILED');
  console.log('errors:', errors.length ? errors : '(none captured)');
  console.log('has __llmaci:', await page.evaluate(() => typeof window.__llmaci));
  console.log('loading text:', await page.evaluate(() => document.getElementById('loading-text')?.textContent));
  await browser.close(); process.exit(1);
}
console.log('booted from file:// — catalog', await page.evaluate(() => window.__llmaci.buildTime.toFixed(0)), 'ms');
await page.screenshot({ path: path.join(ROOT, 'dist-single', 'title.png') });

console.log('localStorage usable:', await page.evaluate(() => {
  try { localStorage.setItem('__t', '1'); const v = localStorage.getItem('__t') === '1'; localStorage.removeItem('__t'); return v; }
  catch (e) { return 'blocked: ' + e.name; }
}));
console.log('WebGL:', await page.evaluate(() => {
  const gl = window.__llmaci.scene.renderer.getContext();
  return gl.getParameter(gl.VERSION);
}));
console.log('display font resolved:', await page.evaluate(() => {
  const el = document.querySelector('.game-title .t1');
  return getComputedStyle(el).fontFamily.split(',')[0];
}));
console.log('AudioContext constructible:', await page.evaluate(() => {
  try { const c = new (window.AudioContext || window.webkitAudioContext)(); const s = c.state; c.close(); return s; }
  catch (e) { return 'FAILED: ' + e.message; }
}));

// play a stage for real
await page.evaluate(() => window.__llmaci.onAction('pick-stage', { dataset: { stage: 'house' } }));
await page.waitForFunction(() => window.__llmaci.state === 'intro', null, { timeout: 120000 });
await page.evaluate(() => window.__llmaci.begin());
await page.waitForTimeout(500);
await page.evaluate(() => {
  const g = window.__llmaci, k = g.kat, w = g.world, f = w.field;
  for (let p = 0; p < 120; p++) {
    let best = -1, bd = 1e9; const lim = k.diameter * 0.88;
    for (let i = 0; i < f.n; i++) {
      if (!f.alive[i] || f.pickup[i] > lim) continue;
      const d = Math.hypot(f.x[i] - k.pos.x, f.z[i] - k.pos.z);
      if (d < bd) { bd = d; best = i; }
    }
    if (best < 0) break;
    const dx = f.x[best] - k.pos.x, dz = f.z[best] - k.pos.z, d = Math.hypot(dx, dz) || 1;
    for (let n = 0; n < 200 && f.alive[best]; n++) {
      k.step(1/60, { moveX: dx/d, moveZ: dz/d, dash: false }, 0, w);
      w.resolve(k, 1/60, Math.random);
    }
    if (f.alive[best]) { k.pos.x = f.x[best]; k.pos.z = f.z[best]; k.pos.y = w.groundAt(k.pos.x,k.pos.z)+k.radius;
      k.attach(f.arch[best], {x:f.x[best],y:f.y[best],z:f.z[best]}, f.variant[best], 0, Math.random); f.remove(best); }
  }
  k.layoutAttached(); g.rig._initialised = false;
});
await page.waitForTimeout(800);
console.log('after play:', await page.evaluate(() => `${window.__llmaci.kat.diameter.toFixed(2)}m, ${window.__llmaci.kat.collectedCount} objects`));
await page.screenshot({ path: path.join(ROOT, 'dist-single', 'playing.png') });

console.log('\nnetwork requests off file://:', requests.length ? requests : 'NONE');
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
process.exit(errors.length ? 1 : 0);
