/* Stage-select thumbnails, photographed from the real game on the real GPU.

     node tools/thumbs.mjs [stage ...] [--grow=3] [--size=640x360] [--q=82]

   v1's stage cards drew four coloured bars on a gradient for each stage — a
   placeholder that outlived the thing it was holding a place for. A card that
   shows the actual room, street or nebula you are about to roll around in is
   the cheapest piece of persuasion the menu has, so these are real frames:
   load the stage, begin, grow the ball to --grow times its start size so the
   shot has some world in it, let the camera settle, and save a JPEG into
   public/thumbs/<stage>.jpg. Re-run after any change to a stage's look. */
import { createServer } from 'vite';
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const [W, H] = opt('size', '640x360').split('x').map(Number);
const GROW = Number(opt('grow', '3'));
const Q = Number(opt('q', '82'));
const PITCH = Number(opt('pitch', '0.44'));
const DIST = Number(opt('dist', '1.35'));
const OUT = path.join(ROOT, 'public', 'thumbs');
fs.mkdirSync(OUT, { recursive: true });

const server = await createServer({ root: ROOT, server: { port: 0 }, logLevel: 'error' });
await server.listen();
const BASE = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({
  channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: W, height: H } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${BASE}/`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__llmaci?.state === 'title', null, { timeout: 120000 });
await page.evaluate(() => window.__llmaci.setOption('quality', 'high'));

let stages = args.filter((a) => !a.startsWith('--'));
if (!stages.length) stages = await page.evaluate(() => window.__llmaci.stageIds());

for (const id of stages) {
  await page.evaluate((s) => {
    const g = window.__llmaci;
    g.toTitle();
    g.save.cleared = g.stageIds();
    g.onAction('pick-stage', { dataset: { stage: s } });
  }, id);
  await page.waitForFunction(() => window.__llmaci.state === 'intro', null, { timeout: 180000 });
  await page.evaluate(([m, PITCH, DIST]) => {
    const g = window.__llmaci;
    g.begin();
    g.hud.hide?.();
    for (const el of document.querySelectorAll('.prompt, #prompt, .hold-hint, #touch')) el.style.visibility = 'hidden';
    // volume too: the next pickup recomputes the radius FROM the volume, and
    // a radius set alone snaps back to the start size on the first thing it eats
    g.kat.volume = (4 / 3) * Math.PI * ((g.stage.startSize * m) / 2) ** 3;
    g.kat.setRadius((g.stage.startSize * m) / 2);
    g.kat.pos.y = g.kat.groundY + g.kat.radius;
    /* A postcard, not a gameplay frame: higher and further back than the
       play camera, so the ball sits in the lower third and the stage fills
       the rest. The rig eases to these over the settle time below. */
    g.rig.pitch = PITCH;
    g.rig.distMul *= DIST;
  }, [GROW, PITCH, DIST]);
  await page.waitForTimeout(3500);
  const file = path.join(OUT, `${id}.jpg`);
  await page.screenshot({ path: file, type: 'jpeg', quality: Q });
  console.log(`${id}.jpg  ${(fs.statSync(file).size / 1024).toFixed(0)} KB`);
}
if (errors.length) console.log(`page errors (${errors.length}):\n  ` + errors.slice(0, 5).join('\n  '));
await browser.close();
await server.close();
