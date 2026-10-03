/* Photograph the menus on the real GPU: title, stage select, intro, HUD in play, results.
     node tools/shot-menus.mjs [--size=1600x900] [--tag=x] */
import { createServer } from 'vite';
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const [W, H] = opt('size', '1600x900').split('x').map(Number);
const TAG = opt('tag', 'menus');
const OUT = path.join(ROOT, 'tools', 'shots', 'look');
fs.mkdirSync(OUT, { recursive: true });
const server = await createServer({ root: ROOT, server: { port: 0, open: false }, logLevel: 'error' });
await server.listen();
const BASE = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
await page.goto(`${BASE}/`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__llmaci?.state === 'title', null, { timeout: 120000 });
await page.waitForTimeout(1500);
const shot = async (n) => { await page.screenshot({ path: path.join(OUT, `${TAG}-${n}.png`) }); console.log(`${TAG}-${n}.png`); };
await shot('1-title');
await page.evaluate(() => { const g = window.__llmaci; g.save.cleared = g.stageIds().slice(0, 5); g.onAction('play'); });
await page.waitForTimeout(800); await shot('2-select');
await page.evaluate(() => window.__llmaci.onAction('pick-stage', { dataset: { stage: 'house' } }));
await page.waitForFunction(() => window.__llmaci.state === 'intro', null, { timeout: 120000 });
await page.waitForTimeout(800); await shot('3-intro');
await page.evaluate(() => window.__llmaci.begin());
await page.waitForTimeout(2500);
// a few catches in the feed, one of each size class, so the shot shows it
await page.evaluate(() => {
  const h = window.__llmaci.hud;
  h.pushPickup('Paperclip', 0.1); h.pushPickup('Rubber Duck', 0.4); h.pushPickup('Teapot', 0.7);
});
await page.waitForTimeout(400); await shot('4-hud');
await page.evaluate(() => { const g = window.__llmaci; g.kat.radius = g.stage.goal * 0.55; g.finish('time'); });
await page.waitForTimeout(1500); await shot('5-results');
if (errs.length) console.log(errs.slice(0, 4).join('\n'));
await browser.close(); await server.close();
