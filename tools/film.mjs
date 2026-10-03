/* Drive the ball and photograph it in motion — a filmstrip, because a still
   cannot show whether a pickup FEELS like anything.

     node tools/film.mjs [stage] [--secs=6] [--every=0.25] [--grow=1] [--keys=w,wd,w,wa] [--out=name]

   Holds the given key combos in turn (each for secs/keys.length), shoots a
   frame every `every` seconds, and tiles them into one contact sheet,
   tools/shots/look/<name>.png, 4 frames to a row. Real GPU, real framerate. */
import { createServer } from 'vite';
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const stage = args.find((a) => !a.startsWith('--')) || 'house';
const SECS = Number(opt('secs', '6'));
const EVERY = Number(opt('every', '0.25'));
const GROW = Number(opt('grow', '1'));
const KEYS = opt('keys', 'w,wd,w,wa').split(',');
const NAME = opt('out', `film-${stage}`);
const [W, H] = opt('size', '800x450').split('x').map(Number);
const OUT = path.join(ROOT, 'tools', 'shots', 'look');
fs.mkdirSync(OUT, { recursive: true });

const server = await createServer({ root: ROOT, server: { port: 0 }, logLevel: 'error' });
await server.listen();
const BASE = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto(`${BASE}/`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__llmaci?.state === 'title', null, { timeout: 120000 });
await page.evaluate((s) => {
  const g = window.__llmaci; g.setOption('quality', 'high'); g.save.cleared = g.stageIds();
  g.onAction('pick-stage', { dataset: { stage: s } });
}, stage);
await page.waitForFunction(() => window.__llmaci.state === 'intro', null, { timeout: 180000 });
await page.evaluate((m) => {
  const g = window.__llmaci; g.begin(); g.hud.hide?.();
  if (m !== 1) { g.kat.setRadius((g.stage.startSize * m) / 2); g.kat.pos.y = g.kat.groundY + g.kat.radius; }
}, GROW);
await page.waitForTimeout(800);

const map = { w: 'KeyW', a: 'KeyA', s: 'KeyS', d: 'KeyD' };
const frames = [];
const t0 = Date.now();
let held = [];
let lastSeg = -1;
while ((Date.now() - t0) / 1000 < SECS) {
  const t = (Date.now() - t0) / 1000;
  const seg = Math.min(KEYS.length - 1, Math.floor((t / SECS) * KEYS.length));
  if (seg !== lastSeg) {
    for (const k of held) await page.keyboard.up(k);
    held = [...KEYS[seg]].map((c) => map[c]).filter(Boolean);
    for (const k of held) await page.keyboard.down(k);
    lastSeg = seg;
  }
  if (args.includes('--demo')) {
    // exercise the effects on cue, so they can be judged without needing the
    // drive to happen across something collectable
    await page.evaluate((i) => {
      const g = window.__llmaci, k = g.kat, R = k.radius;
      const p = k.group.position.clone();
      p.x += (Math.random() - 0.5) * R * 2; p.z += (Math.random() - 0.5) * R * 2;
      if (i % 2 === 0) g.fx.pickup(p, 0.15 + (i % 5) * 0.15, R);
      if (i === 7) g.fx.sizeUp({ x: k.pos.x, y: k.pos.y - R, z: k.pos.z }, R);
      if (i === 11) g.fx.bump(k.group.position.clone(), 0.9, R);
    }, frames.length);
  }
  frames.push(await page.screenshot({ type: 'jpeg', quality: 80 }));
  await page.waitForTimeout(EVERY * 1000);
}
for (const k of held) await page.keyboard.up(k);
const stats = await page.evaluate(() => ({ n: window.__llmaci.kat.collectedCount, d: window.__llmaci.kat.diameter }));

// tile the frames into one sheet in the browser itself
const cols = 4;
const rows = Math.ceil(frames.length / cols);
const tw = Math.round(W / 2), th = Math.round(H / 2);
const sheet = await page.evaluate(async ({ imgs, cols, rows, tw, th }) => {
  const c = document.createElement('canvas'); c.width = cols * tw; c.height = rows * th;
  const x = c.getContext('2d');
  for (let i = 0; i < imgs.length; i++) {
    const im = new Image(); im.src = `data:image/jpeg;base64,${imgs[i]}`;
    await im.decode();
    x.drawImage(im, (i % cols) * tw, Math.floor(i / cols) * th, tw, th);
    x.fillStyle = 'rgba(0,0,0,0.5)'; x.fillRect((i % cols) * tw, Math.floor(i / cols) * th, 34, 16);
    x.fillStyle = '#fff'; x.font = '12px sans-serif'; x.fillText(String(i), (i % cols) * tw + 4, Math.floor(i / cols) * th + 12);
  }
  return c.toDataURL('image/jpeg', 0.85).split(',')[1];
}, { imgs: frames.map((f) => f.toString('base64')), cols, rows, tw, th });
fs.writeFileSync(path.join(OUT, `${NAME}.jpg`), Buffer.from(sheet, 'base64'));
console.log(`${frames.length} frames -> tools/shots/look/${NAME}.jpg  (collected ${stats.n}, diameter ${stats.d.toFixed(3)})`);
if (errs.length) console.log(errs.slice(0, 4).join('\n'));
await browser.close(); await server.close();
