/* Look at the game on a REAL GPU.

   Every screenshot of v1 was taken by swiftshader on two cores at about a frame a
   second, which means nobody working on this game had ever seen it run. This drives
   the machine's installed Edge (or Chrome) with hardware ANGLE, so frames are real
   frames and the fps column means something.

     node tools/look.mjs [stage ...] [--size=W x H] [--grow=1,3,8] [--out=dir] [--secs=4]

   For each stage: load it, begin, let it settle, then photograph the round at each
   growth factor in --grow (the ball's diameter as a multiple of the stage start
   size), with the camera allowed to catch up between shots. Prints the renderer
   string first — if it says SwiftShader, the numbers below it are not real. */
import { createServer } from 'vite';
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const stages = args.filter((a) => !a.startsWith('--'));
if (!stages.length) stages.push('house');
const [W, H] = opt('size', '1600x900').split('x').map(Number);
const grows = opt('grow', '1,4').split(',').map(Number);
const OUT = path.resolve(ROOT, opt('out', 'tools/shots/look'));
const SECS = Number(opt('secs', '3'));
const TAG = opt('tag', '');
fs.mkdirSync(OUT, { recursive: true });

const server = await createServer({ root: ROOT, server: { port: 0 }, logLevel: 'error' });
await server.listen();
const BASE = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({
  channel: opt('channel', 'msedge'),
  headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu'],
});
const page = await browser.newPage({ viewport: { width: W, height: H } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(`${BASE}/`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__llmaci?.state === 'title', null, { timeout: 120000 });

const gpu = await page.evaluate(() => {
  const gl = window.__llmaci.scene.renderer.getContext();
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
});
console.log(`renderer: ${gpu}`);
const QUALITY = opt('quality', '');
if (QUALITY) await page.evaluate((q) => window.__llmaci.setOption('quality', q), QUALITY);

const fps = (secs) => page.evaluate((s) => new Promise((res) => {
  const t0 = performance.now(); let n = 0; const ft = [];
  let last = t0;
  const tick = (t) => {
    n++; ft.push(t - last); last = t;
    if (t - t0 < s * 1000) requestAnimationFrame(tick);
    else {
      ft.sort((a, b) => a - b);
      res({ fps: (n / ((t - t0) / 1000)).toFixed(1), p95: ft[Math.floor(ft.length * 0.95)].toFixed(1) });
    }
  };
  requestAnimationFrame(tick);
}), secs);

for (const id of stages) {
  await page.evaluate((s) => {
    const g = window.__llmaci;
    g.toTitle();
    g.save.cleared = g.stageIds();
    g.onAction('pick-stage', { dataset: { stage: s } });
  }, id);
  await page.waitForFunction(() => window.__llmaci.state === 'intro', null, { timeout: 180000 });
  await page.evaluate(() => { window.__llmaci.begin(); window.__llmaci.hud.hide?.(); });
  for (const k of grows) {
    await page.evaluate((m) => {
      const g = window.__llmaci;
      // setRadius, not `radius =`: the bare field moves the camera and leaves
      // the ball's own mesh at its old scale, which photographs as a marble.
      g.kat.setRadius((g.stage.startSize * m) / 2);
      g.kat.pos.y = g.kat.groundY + g.kat.radius;   // a stationary ball is not re-seated
    }, k);
    await page.waitForTimeout(SECS * 1000);
    const f = await fps(2);
    const name = `${TAG ? TAG + '-' : ''}${id}-x${k}.png`;
    await page.screenshot({ path: path.join(OUT, name) });
    console.log(`${id} x${k}: ${f.fps} fps (p95 frame ${f.p95}ms) -> ${name}`);
  }
}
if (errors.length) console.log(`page errors (${errors.length}):\n  ` + errors.slice(0, 5).join('\n  '));
await browser.close();
await server.close();
