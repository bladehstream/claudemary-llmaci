/* ============================================================
   Render a contact sheet of every prop in a stage.

     node tools/propsheet.mjs galaxy            -> tools/shots/sheet-galaxy.png
     node tools/propsheet.mjs solar galaxy universe
     node tools/propsheet.mjs galaxy --cols=3

   See tools/propsheet.html for what it draws and why the
   background is neutral grey rather than the stage's own sky.
   ============================================================ */

import { createServer } from 'vite';
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'tools', 'shots');
fs.mkdirSync(OUT, { recursive: true });

const flag = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1];
const COLS = flag('cols') ? parseInt(flag('cols'), 10) : 4;
const stages = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (!stages.length) { console.error('usage: node tools/propsheet.mjs <stage> [stage...]'); process.exit(1); }

const server = await createServer({ root: ROOT, server: { port: 5217 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 400, height: 300 } });
page.on('pageerror', (e) => console.error('PAGE ERROR:', String(e).slice(0, 300)));
await page.goto('http://localhost:5217/tools/propsheet.html', { waitUntil: 'load' });
await page.waitForFunction(() => window.__ready === true, null, { timeout: 240000 });

for (const stage of stages) {
  const url = await page.evaluate(([s, c]) => window.__sheet(s, c), [stage, COLS]);
  if (!url || url.length < 1000) { console.error(`${stage}: nothing rendered`); continue; }
  const file = path.join(OUT, `sheet-${stage}.png`);
  fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
  const kb = Math.round(fs.statSync(file).size / 1024);
  console.log(`${file}  ${kb}kB`);
}

await browser.close();
await server.close();
