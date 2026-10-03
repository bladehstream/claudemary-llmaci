/* Probe: which part of the new lighting stack changes a stage's colour?
   Loads one stage at 'high', then samples the centre-bottom of the frame under
   each variant. Throwaway diagnostics — kept because the next time a stage's
   mood shifts, this is the first question again. */
import { createServer } from 'vite';
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stage = process.argv[2] || 'galaxy';
const server = await createServer({ root: ROOT, server: { port: 5232 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
await page.goto('http://localhost:5232/', { waitUntil: 'load' });
await page.waitForFunction(() => window.__llmaci?.state === 'title', null, { timeout: 120000 });
await page.evaluate((s) => { const g = window.__llmaci; g.setOption('quality', 'high'); g.save.cleared = g.stageIds(); g.onAction('pick-stage', { dataset: { stage: s } }); }, stage);
await page.waitForFunction(() => window.__llmaci.state === 'intro', null, { timeout: 180000 });
await page.evaluate(() => window.__llmaci.begin());
await page.waitForTimeout(2500);

const sample = () => page.evaluate(() => new Promise((res) => requestAnimationFrame(() => {
  const g = window.__llmaci;
  g.scene.render();
  const gl = g.scene.renderer.getContext();
  const px = new Uint8Array(4 * 9);
  const out = [];
  for (const [fx, fy] of [[0.5, 0.1], [0.25, 0.15], [0.75, 0.15]]) {
    gl.readPixels(Math.floor(gl.drawingBufferWidth * fx), Math.floor(gl.drawingBufferHeight * fy), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    out.push(`${px[0]},${px[1]},${px[2]}`);
  }
  res(out.join('  '));
})));

const variants = [
  ['as built', () => {}],
  ['env off', (g) => { g.scene.material.envMapIntensity = 0; }],
  ['+ no AO (direct render)', (g) => { g.scene._savedPost = g.scene.post; g.scene.post = null; }],
  ['+ no tone map', (g) => { g.scene.renderer.toneMapping = 0; g.scene.material.needsUpdate = true; }],
  ['+ hemi only', (g) => { g.scene.sun.intensity = 0; g.scene.fill.intensity = 0; }],
];
for (const [name, fn] of variants) {
  await page.evaluate(`(${fn.toString()})(window.__llmaci)`);
  await page.waitForTimeout(300);
  console.log(`${name.padEnd(26)} ${await sample()}`);
}
await browser.close();
await server.close();
