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

   ⚠ EVERY NUMBER IS PRINTED TO 10 SIGNIFICANT FIGURES, NOT TO A
   FIXED NUMBER OF DECIMALS. It used to be `.toFixed(4)`, and that
   silently destroyed this file's whole purpose at the small end of
   the catalogue: volume spans 7.7e-8 (a virus) to 4.4e9 (a
   supercluster complex), so four decimal places is ten significant
   figures for the supercluster and *none at all* for the virus —
   `wristwatch` printed `vol 0.0000`. Anything comparing against
   that was dividing by zero. `reghost.mjs` reported 131 of 429
   archetypes moved when nothing had changed at all.

   Ten significant figures is far inside `reghost`'s 0.5% default
   tolerance at both ends. The ten smallest props print in
   exponential form; `reghost.mjs`'s parser accepts it, and
   `npm run reghost` proves the round trip on every run.
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

/* Bump this whenever the number format changes, and bump the matching
   check in reghost.mjs. Not exported — importing this file runs it. */
const FORMAT_STAMP = '# catalogue-digest v2';

buildCatalog();

const rows = ARCHETYPES
  .filter((p) => !ONLY || p.tags.some((t) => ONLY.includes(t)))
  .sort((a, b) => (a.id < b.id ? -1 : 1));

/* Ten significant figures, never a fixed decimal count — see the header. */
const sig = (x) => (Number.isFinite(x) ? x.toPrecision(10) : String(x));

/* A stamp, so a baseline written by the old fixed-decimal build cannot be
   silently compared against a new run. `reghost.mjs` refuses a file without
   it rather than quietly reading four-decimal volumes as exact. */
console.log(`${FORMAT_STAMP}  (pickup/vol/rad/h/w/d at 10 significant figures)`);

let tot = 0;
for (const p of rows) {
  const tris = p.geos.reduce((s, g) => s + g.attributes.position.count / 3, 0) / p.geos.length;
  tot += tris;
  const parts = p.parts.reduce((s, a) => s + a.length / 6, 0) / p.parts.length;
  console.log(
    `${p.id.padEnd(20)}`
    + ` pickup ${sig(p.pickup).padStart(15)}`
    + ` vol ${sig(p.volume).padStart(15)}`
    + ` rad ${sig(p.radius).padStart(15)}`
    + ` h ${sig(p.height).padStart(15)}`
    + ` w/d ${sig(p.dims.w).padStart(15)}/${sig(p.dims.d).padStart(15)}`
    + ` boxes ${parts.toFixed(2).padStart(6)}`
    + (TRIS ? ` tris ${String(Math.round(tris)).padStart(5)}` : ''),
  );
}
console.log(`\n${rows.length} archetypes${TRIS ? `, ${Math.round(tot)} triangles per variant set` : ''}`);
