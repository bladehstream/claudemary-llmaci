/* ============================================================
   Do any two faces INSIDE a prop share a plane?

   Two coplanar faces of different colours z-fight across their
   whole overlap: the depth test cannot decide between them, so
   which one wins flickers per pixel per frame as the camera moves.
   It reads as shimmering, and it has now been reported three
   times — the house roofs, the city's road markings, and the world
   stage's village roofs.

   `test-decals` catches this between big TERRAIN faces. It cannot
   see inside a prop, because a prop's geometry is merged into the
   archetype catalogue and never becomes part of `terrainMesh` —
   which is exactly where the third report came from.

   The pattern is nearly always the same and worth knowing:

     b.boxOn(w, 2.0, d, WALL, { y: 1.7 })   // top face at 3.7
     b.wedge(w, 1.3, d, ROOF, { y: 3.7 })   // base face at 3.7

   `boxOn` sits a box ON the given y, so its top is at y + h, and
   a roof placed at that exact height has its underside in the same
   plane as the wall's lid. Sink the roof a little into the wall.

   Method: group every triangle by its plane (normal + offset,
   quantised relative to the prop's size), then within a plane look
   for pairs of DIFFERENT-COLOURED triangles whose footprints
   overlap. Same-coloured coplanar faces are invisible even when
   they do fight, so colour is the right discriminator.
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

buildCatalog();

const ONLY = process.argv.find((a) => a.startsWith('--only='))?.split('=')[1]?.split(',');
/** Report an overlap only once it is this fraction of the prop's footprint. */
const MIN_FRAC = 0.01;
/* A LIVED-WITH BUDGET, like `test-decals` has.
 *
 * The catalogue went from 74 props with coplanar faces to 7 — the builder's
 * `separate` pass fixed 66 of them at a stroke, and the apartment's roof cap and
 * the landmass rivers were hand-fixed after this report named them. The seven
 * that remain are all between 1% and 3% of a footprint: island shelves meeting at
 * the waterline, biome patches brushing edges, two book spines. Failing on those
 * would mean this harness cried wolf, and a test nobody trusts is a test nobody
 * runs. 5% or more of a prop's footprint is a real shimmer and fails. */
const BUDGET = 0.05;

const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
const ab = new THREE.Vector3(), ac = new THREE.Vector3(), n = new THREE.Vector3();

/** Axis to drop when projecting a plane to 2D: whichever the normal points along most. */
function planeAxes(nx, ny, nz) {
  const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
  if (ay >= ax && ay >= az) return [0, 2];        // horizontal face -> use x,z
  if (ax >= az) return [2, 1];                    // faces along x   -> use z,y
  return [0, 1];                                  // faces along z   -> use x,y
}

const findings = [];
for (const p of ARCHETYPES) {
  if (ONLY && !ONLY.some((t) => p.tags.includes(t) || p.id === t)) continue;
  const span = Math.max(p.dims.w, p.dims.h, p.dims.d);
  /* Same plane, to within a separation that would actually still fight. Float32
     noise is ~6e-8 of the span, and the builder's own separation step is 2.5e-4
     of it (see `separate` in geom.js), so 1.2e-4 sits cleanly between the two:
     anything the builder has pulled apart passes, anything genuinely coincident
     fails. */
  const eps = Math.max(1e-6, span * 1.2e-4);
  const foot = Math.max(1e-9, p.dims.w * p.dims.d);

  for (let vi = 0; vi < p.geos.length; vi++) {
    const geo = p.geos[vi];
    const pos = geo.attributes.position;
    const col = geo.attributes.color;
    const planes = new Map();

    for (let t = 0; t + 2 < pos.count; t += 3) {
      a.fromBufferAttribute(pos, t); b.fromBufferAttribute(pos, t + 1); c.fromBufferAttribute(pos, t + 2);
      ab.subVectors(b, a); ac.subVectors(c, a); n.crossVectors(ab, ac);
      const len = n.length();
      if (len < 1e-12) continue;
      n.divideScalar(len);
      // Fold antiparallel normals together: a lid and the underside above it are
      // the pair that fights, and their normals point opposite ways.
      let nx = n.x, ny = n.y, nz = n.z;
      if (nx < -1e-9 || (Math.abs(nx) < 1e-9 && (ny < -1e-9 || (Math.abs(ny) < 1e-9 && nz < 0)))) {
        nx = -nx; ny = -ny; nz = -nz;
      }
      const d = nx * a.x + ny * a.y + nz * a.z;
      const q = (v) => Math.round(v / 0.02);
      const key = `${q(nx)},${q(ny)},${q(nz)},${Math.round(d / eps)}`;
      const [u, w] = planeAxes(nx, ny, nz);
      const P = [[a.x, a.y, a.z], [b.x, b.y, b.z], [c.x, c.y, c.z]];
      const tri = {
        n: `${nx.toFixed(2)},${ny.toFixed(2)},${nz.toFixed(2)}`, d,
        u0: Math.min(P[0][u], P[1][u], P[2][u]), u1: Math.max(P[0][u], P[1][u], P[2][u]),
        w0: Math.min(P[0][w], P[1][w], P[2][w]), w1: Math.max(P[0][w], P[1][w], P[2][w]),
        col: `${col.getX(t).toFixed(3)},${col.getY(t).toFixed(3)},${col.getZ(t).toFixed(3)}`,
      };
      let list = planes.get(key);
      if (!list) planes.set(key, list = []);
      list.push(tri);
    }

    let worst = 0, detail = '';
    for (const list of planes.values()) {
      if (list.length < 2) continue;
      const colours = new Set(list.map((t) => t.col));
      if (colours.size < 2) continue;               // same colour: invisible
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          if (list[i].col === list[j].col) continue;
          const ou = Math.min(list[i].u1, list[j].u1) - Math.max(list[i].u0, list[j].u0);
          const ow = Math.min(list[i].w1, list[j].w1) - Math.max(list[i].w0, list[j].w0);
          if (ou <= 0 || ow <= 0) continue;
          const frac = (ou * ow) / foot;
          if (frac > worst) {
            worst = frac;
            detail = `plane n=(${list[i].n}) at ${list[i].d.toFixed(3)}`
              + `  colours ${list[i].col} vs ${list[j].col}`;
          }
        }
      }
    }
    if (worst >= MIN_FRAC) findings.push({ id: p.id, name: p.name, variant: vi, frac: worst, tags: p.tags.join('/'), detail });
  }
}

findings.sort((x, y) => y.frac - x.frac);
const byId = new Map();
for (const f of findings) if (!byId.has(f.id) || byId.get(f.id).frac < f.frac) byId.set(f.id, f);

console.log(`${ARCHETYPES.length} archetypes checked\n`);
const bad = [...byId.values()].filter((f) => f.frac >= BUDGET);
if (!byId.size) {
  console.log('PASS — no prop draws two different-coloured faces in the same plane');
} else {
  console.log(`${bad.length ? 'FAIL' : 'PASS'} — ${byId.size} prop(s) have coplanar faces`
    + `, ${bad.length} above the ${(BUDGET * 100).toFixed(0)}% budget:`);
  for (const f of [...byId.values()].sort((x, y) => y.frac - x.frac)) {
    console.log(`  ${f.id.padEnd(20)} ${(f.tags).padEnd(22)} overlap ${(f.frac * 100).toFixed(0)}% of its footprint`);
    if (process.argv.includes('--why')) console.log(`      ${f.detail}`);
  }
}
process.exit(bad && bad.length ? 1 : 0);
