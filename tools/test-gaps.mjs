/* ============================================================
   Props you should be able to roll UNDER or BETWEEN.

   A table is not a solid block. Neither is a chair, a bench, a
   swing set or a bridge. Each is mostly air with a few legs in
   it, and a katamari small enough to fit under the top and
   narrow enough to fit between the legs has to be able to get
   through — in the original that is half the fun of being tiny.

   User report, 2026-07-29:
     "tables have an 'invisible wall' where i can't roll
      underneath them if i am small enough; they act like a
      solid block rather than a table with gaps"

   This drives a katamari straight at the middle of a prop's
   side and checks it comes out the other side. It runs the
   REAL World.resolve, so it fails for the same reason play
   does.
   ============================================================ */

import * as THREE from 'three';
import { buildCatalog, getProp } from '../src/world/props/index.js';
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
import { World } from '../src/world/World.js';
import { Katamari } from '../src/world/Katamari.js';
import { makeRng } from '../src/util/math.js';

buildCatalog();
const mat = new THREE.MeshLambertMaterial({ vertexColors: true });

/** A featureless 40x40 floor with exactly one prop on it, at the origin. */
function stageWith(id, rotY) {
  return {
    id: 'test', name: 'test', seed: 4242, startSize: 0.05, goal: 99, time: 60, speed: 1,
    cell: 1, chunk: 0, spawn: null,
    bounds: { minX: -20, maxX: 20, minZ: -20, maxZ: 20 },
    camera: { pitch: 0.35, distance: 6 },
    build(w) {
      w.plat(-20, -20, 20, 20, 0);
      w.placeId(id, 0, 0, rotY, 1);
    },
  };
}

/**
 * Roll at the prop from `from`, heading at the origin, and report the
 * closest approach to the prop's centre plus whether we got past it.
 * "Past" means reaching the mirror of the start point on the far side.
 */
function chargeThrough(id, size, rotY, axis) {
  const world = new World(mat).build(stageWith(id, rotY));
  const kat = new Katamari(mat, size / 2);
  kat.setStageProfile(size, 1.2, 50);

  // Start clear of the prop and finish clear of it on the far side. A fixed
  // 3m would begin INSIDE a 10.5m bus, which then trivially "passes".
  const arch = getProp(id);
  const span = Math.hypot(arch.dims.w, arch.dims.d) / 2;
  const start = span + Math.max(1.5, size * 6);
  const from = axis === 'x' ? { x: -start, z: 0 } : { x: 0, z: -start };
  kat.reset(size / 2, new THREE.Vector3(from.x, world.groundAt(from.x, from.z) + size / 2, from.z));

  const rng = makeRng(5);
  const H = 1 / 120;
  const dir = axis === 'x' ? { mx: 1, mz: 0 } : { mx: 0, mz: 1 };
  let closest = Infinity, t = 0;
  const finish = span + 0.3;
  while (t < 60) {
    kat.step(H, { moveX: dir.mx, moveZ: dir.mz, dash: false }, 0, world);
    world.resolve(kat, H, rng);
    world.time += H; t += H;
    const d = Math.hypot(kat.pos.x, kat.pos.z);
    if (d < closest) closest = d;
    if ((axis === 'x' && kat.pos.x > finish) || (axis === 'z' && kat.pos.z > finish)) {
      return { through: true, closest, t };
    }
  }
  return { through: false, closest, t };
}

/* The height of the lowest thing overhead, and the widest gap between
   uprights, are both properties of the model — so state the size that
   should obviously fit and let the test say whether it does. */
const CASES = [
  { id: 'lowtable', size: 0.10, why: 'legs 34cm tall, ~85cm apart' },
  { id: 'lowtable', size: 0.22, why: 'still well under the 34cm top' },
  { id: 'desk', size: 0.14, why: 'kneehole is 60cm+ wide and 70cm tall', axis: 'z' },
  { id: 'chair', size: 0.10, why: 'seat is 44cm up, legs ~38cm apart' },
  { id: 'bench', size: 0.12, why: 'a bench is legs and a plank' },
  { id: 'swingset', size: 0.5, why: 'you are meant to roll through a swing set' },
];

/* The other half of the job. Giving props real gaps is only correct if the
   solid ones are still solid — a collision volume that MISSES geometry lets
   the katamari roll through a fridge, which is a far worse bug than the one
   being fixed. Every one of these must still stop a ball dead.

   Ball sizes here are the SMALLEST a player can be when they meet the prop,
   i.e. the starting size of the earliest stage it appears in. A 25cm ball
   does fit under a car — cars have 31cm of ground clearance in this model —
   but the town starts you at 50cm, so no player is ever small enough to
   find out. `npm run underpass` lists every reachable gap in the catalog. */
const SOLID = [
  { id: 'fridge', size: 0.05 },
  { id: 'washingmachine', size: 0.05 },
  { id: 'crate_stack', size: 0.05 },
  { id: 'car', size: 0.5 },
  { id: 'bus', size: 0.5 },
  { id: 'house_small', size: 0.5 },
  { id: 'rock_big', size: 0.5 },
];

const results = [];
for (const c of CASES) {
  const arch = getProp(c.id);
  if (!arch) { results.push({ ...c, skip: true }); continue; }
  // Try both cardinal approaches and both prop rotations; passing ANY of
  // them is enough to prove the gap exists and is usable.
  let best = null;
  for (const rot of [0, Math.PI / 2]) {
    for (const axis of [c.axis ?? 'x', 'z']) {
      const r = chargeThrough(c.id, c.size, rot, axis);
      if (!best || r.through > best.through || r.closest < best.closest) best = { ...r, rot, axis };
      if (r.through) break;
    }
    if (best?.through) break;
  }
  results.push({ ...c, ...best, arch });
}

let failed = 0;
console.log('prop          ball    top of prop   half-diagonal   closest approach   result');
for (const r of results) {
  if (r.skip) { console.log(`  ${r.id}: not in catalog — skipped`); continue; }
  if (!r.through) failed++;
  const half = Math.hypot(r.arch.dims.w, r.arch.dims.d) / 2;
  console.log(
    `  ${r.id.padEnd(11)} ${(r.size * 100).toFixed(0).padStart(4)}cm ` +
    `${(r.arch.dims.h * 100).toFixed(0).padStart(9)}cm ${(half * 100).toFixed(0).padStart(13)}cm ` +
    `${(r.closest * 100).toFixed(0).padStart(15)}cm   ${r.through ? 'PASS rolled through' : 'FAIL blocked'}  (${r.why})`);
}
console.log(`\n${failed ? `${failed} of ${results.length} FAILED — props with gaps are acting like solid blocks` : 'all gaps are passable'}`);

console.log('\nsolid props must still block:');
let leaks = 0;
for (const s of SOLID) {
  const arch = getProp(s.id);
  if (!arch) { console.log(`  ${s.id}: not in catalog — skipped`); continue; }
  let wentThrough = false, closest = Infinity;
  for (const axis of ['x', 'z']) {
    const r = chargeThrough(s.id, s.size, 0, axis);
    if (r.through) wentThrough = true;
    closest = Math.min(closest, r.closest);
  }
  if (wentThrough) leaks++;
  console.log(`  ${s.id.padEnd(16)} ${(s.size * 100).toFixed(0).padStart(4)}cm ball  closest ` +
    `${(closest * 100).toFixed(0).padStart(5)}cm   ${wentThrough ? 'FAIL rolled straight through' : 'PASS blocked'}`);
}

const bad = failed + leaks;
console.log(`\n${bad ? `${bad} FAILED` : 'gaps are passable and solids are solid'}`);
process.exit(bad ? 1 : 0);
