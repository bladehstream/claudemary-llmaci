/* ============================================================
   Every number the game takes off a prop, in one line each.

   This exists so a change to HOW props are built can be proved
   not to change WHAT the game thinks they are. `pickup` drives
   the growth ladder, `volume` drives how fast you grow, and
   `radius` drives what fences the map off — a build-pipeline
   change that shifts any of them by a percent will not show up
   as a bug for another two hours, in `balance`, as a stage that
   used to clear 9 times in 9 and now clears 5.

   Run it, save the output, make the change, run it again, diff.

     node tools/catalogue-digest.mjs > /tmp/before.txt
     node tools/catalogue-digest.mjs --only=solar,galaxy,universe

   `--only=` filters by stage tag. `--tris` adds triangle counts,
   which are the one column expected to move during an art pass.
   ============================================================ */

import * as THREE from 'three';
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
const TRIS = process.argv.includes('--tris');

buildCatalog();

const rows = ARCHETYPES
  .filter((p) => !ONLY || p.tags.some((t) => ONLY.includes(t)))
  .sort((a, b) => (a.id < b.id ? -1 : 1));

let tot = 0;
for (const p of rows) {
  const tris = p.geos.reduce((s, g) => s + g.attributes.position.count / 3, 0) / p.geos.length;
  tot += tris;
  const parts = p.parts.reduce((s, a) => s + a.length / 6, 0) / p.parts.length;
  console.log(
    `${p.id.padEnd(20)}`
    + ` pickup ${p.pickup.toFixed(4).padStart(11)}`
    + ` vol ${p.volume.toFixed(4).padStart(13)}`
    + ` rad ${p.radius.toFixed(4).padStart(10)}`
    + ` h ${p.height.toFixed(4).padStart(10)}`
    + ` w/d ${p.dims.w.toFixed(3).padStart(9)}/${p.dims.d.toFixed(3).padStart(9)}`
    + ` boxes ${String(parts).padStart(4)}`
    + (TRIS ? ` tris ${String(Math.round(tris)).padStart(5)}` : ''),
  );
}
console.log(`\n${rows.length} archetypes${TRIS ? `, ${Math.round(tot)} triangles per variant set` : ''}`);
