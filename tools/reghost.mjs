/* ============================================================
   Put `pickup` and `volume` back where they were.

   Moving a prop's identity into ghost geometry shrinks the box
   the game measures, and the game measures that box for two
   numbers that decide whether a stage is playable:

     pickup = cbrt(boxVol) * sizeMul    the growth ladder
     volume = boxVol * fill             how fast you grow

   Shrink the solid core and both fall. Left alone, the last three
   stages would quietly become a different game — every object a
   rung easier to swallow and worth less when you do.

   So: record the catalogue BEFORE the art change, and after it
   ask what `sizeMul` and `fill` each prop now needs to land on
   the same two numbers.

     node tools/catalogue-digest.mjs > /tmp/base.txt     # before
     ... do the art ...
     node tools/reghost.mjs /tmp/base.txt --only=galaxy

   Prints one line per prop that has moved, with the values to
   paste in. `--tol=` sets how big a move is worth reporting
   (default 0.5%). Re-run `catalogue-digest.mjs` afterwards and
   diff against the baseline: the pickup and volume columns should
   be identical, and only `w/d`, `h`, `rad` and `boxes` should
   have changed.
   ============================================================ */

import fs from 'node:fs';
import { buildCatalog, ARCHETYPES } from '../src/world/props/index.js';
import '../src/world/props/quantum.js';
import '../src/world/props/atom.js';
import '../src/world/props/microbe.js';
import '../src/world/props/house.js';
import '../src/world/props/town.js';
import '../src/world/props/city.js';
import '../src/world/props/country.js';
import '../src/world/props/world.js';
import '../src/world/props/solar.js';
import '../src/world/props/galaxy.js';
import '../src/world/props/universe.js';
import '../src/world/props/nature.js';
import '../src/world/props/ai.js';

const flag = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1];
const ONLY = flag('only')?.split(',').map((s) => s.trim()).filter(Boolean) ?? null;
const TOL = flag('tol') ? parseFloat(flag('tol')) : 0.005;
const baseFile = process.argv[2];
if (!baseFile || baseFile.startsWith('--')) {
  console.error('usage: node tools/reghost.mjs <baseline from catalogue-digest.mjs> [--only=tag]');
  process.exit(1);
}

/* The digest's format, parsed back. Deliberately parsing the human-readable
   output rather than adding a JSON mode: one format means one thing to keep
   true, and this file is the only reader. */
const base = new Map();
for (const line of fs.readFileSync(baseFile, 'utf8').split('\n')) {
  const m = line.match(/^(\S+)\s+pickup\s+([\d.]+)\s+vol\s+([\d.]+)\s+rad\s+([\d.]+)/);
  if (m) base.set(m[1], { pickup: +m[2], volume: +m[3], radius: +m[4] });
}
if (!base.size) { console.error(`no archetypes parsed out of ${baseFile}`); process.exit(1); }

buildCatalog();

const cbrt = (x) => Math.cbrt(x);
let moved = 0, missing = 0;
const rows = ARCHETYPES
  .filter((p) => !ONLY || p.tags.some((t) => ONLY.includes(t)))
  .sort((a, b) => (a.id < b.id ? -1 : 1));

console.log(`baseline: ${base.size} archetypes from ${baseFile}`);
console.log(`checking ${rows.length}${ONLY ? ` tagged ${ONLY.join('/')}` : ''}, `
  + `reporting moves over ${(TOL * 100).toFixed(1)}%\n`);

for (const p of rows) {
  const b = base.get(p.id);
  if (!b) { console.log(`  NEW      ${p.id} — no baseline, nothing to match`); missing++; continue; }
  const dp = Math.abs(p.pickup - b.pickup) / b.pickup;
  const dv = Math.abs(p.volume - b.volume) / Math.max(1e-12, b.volume);
  if (dp < TOL && dv < TOL) continue;
  moved++;
  const wantSizeMul = p.sizeMul * (b.pickup / p.pickup);
  const wantFill = p.fill * (b.volume / Math.max(1e-12, p.volume));
  const dr = (p.radius - b.radius) / b.radius;
  console.log(`  ${p.id.padEnd(18)} pickup ${(dp * 100 >= 0 ? '+' : '')}${((p.pickup / b.pickup - 1) * 100).toFixed(1)}%`
    + `  vol ${((p.volume / b.volume - 1) * 100).toFixed(1)}%`
    + `  rad ${(dr * 100).toFixed(1)}%`);
  console.log(`  ${' '.repeat(18)} sizeMul: ${p.sizeMul} -> ${wantSizeMul.toPrecision(5)}`
    + `   fill: ${p.fill} -> ${Math.min(1, wantFill).toPrecision(4)}`
    + (wantFill > 1 ? '   ⚠ CLAMPED AT 1 — the solid core is too small to carry the mass, grow it' : ''));
}

console.log(`\n${moved} archetype(s) moved${missing ? `, ${missing} new` : ''}.`);
if (!moved) console.log('pickup and volume are exactly where they were.');
process.exit(0);
