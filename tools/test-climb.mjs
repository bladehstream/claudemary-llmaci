/* ============================================================
   Things slightly too big to eat are RAMPS, not walls.

   User, 2026-07-29:
     "i remember the game having no friction, only gravity
      slowing you down if you try to roll over something too
      big (ie you can roll over things that are slightly too
      big to stick to)"

   So the size ladder gets a soft edge. Just above `pickupRatio`
   you cannot collect a thing, but you can still mount it if you
   arrive with enough speed — and the speed is SPENT doing it,
   at the honest exchange rate v^2 -> v^2 - 2gh. Arrive slowly
   and you stall on the slope and roll back down.

   Two things must hold at once, and they pull opposite ways:
     1. FAST at a low obstacle -> you get over it.
     2. SLOW at the same one   -> you do not.
   A build that always climbs is as wrong as one that never
   does; only the pair proves gravity is the gate.

   Test cases are chosen FROM THE CATALOG rather than by hand,
   at the exact size where each prop stops being edible, because
   hand-picked props turned out to be nowhere near the climb
   limit and every case failed for the wrong reason.
   ============================================================ */

import * as THREE from 'three';
import { buildCatalog, ARCHETYPES, getProp } from '../src/world/props/index.js';
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
import { Katamari, TUNING } from '../src/world/Katamari.js';
import { makeRng, formatSizeShort } from '../src/util/math.js';

buildCatalog();
const mat = new THREE.MeshLambertMaterial({ vertexColors: true });

function stageWith(id, size) {
  const B = Math.max(30, size * 120);
  return {
    id: 'test', name: 'test', seed: 99, startSize: size, goal: 99, time: 60, speed: 1,
    cell: Math.max(0.5, size), chunk: 0, spawn: null,
    bounds: { minX: -B, maxX: B, minZ: -B, maxZ: B },
    camera: { pitch: 0.35, distance: 6 },
    build(w) { w.plat(-B, -B, B, B, 0); w.placeId(id, 0, 0, 0, 1); },
  };
}

/**
 * Roll at the prop with the stick held, arriving at `approach` m/s — which is
 * set by giving the stage that top speed, not by letting go early. Releasing
 * would brake the ball to a halt long before it got there; brake is a real
 * rate now, not a gentle drag.
 *
 * Holding the stick does not defeat the energy gate: `resolve` tests current
 * speed against the WHOLE remaining rise, not the per-tick increment, so a
 * ball that cannot crest the obstacle never gets marked as standing on it no
 * matter how long it leans.
 */
function charge(id, size, approach, cap = approach) {
  const world = new World(mat).build(stageWith(id, size));
  const kat = new Katamari(mat, size / 2);
  kat.setStageProfile(size, Math.max(cap, 0.02), 50);
  const arch = getProp(id);
  const span = Math.hypot(arch.dims.w, arch.dims.d) / 2;
  const start = span + size * 8 + 1;
  kat.reset(size / 2, new THREE.Vector3(-start, world.groundAt(-start, 0) + size / 2, 0));

  const rng = makeRng(4);
  const H = 1 / 480;
  const finish = span + size;
  let t = 0, peak = 0;
  while (t < 30) {
    // Hold only while under the requested approach speed, so `cap` above it
    // leaves the ball cruising at `approach` rather than at its own top speed.
    const sp = Math.hypot(kat.vel.x, kat.vel.z);
    kat.step(H, { moveX: sp < approach ? 1 : 0, moveZ: 0, dash: false }, 0, world);   // camYaw 0 maps moveX to +X
    world.resolve(kat, H, rng);
    world.time += H; t += H;
    const lift = kat.pos.y - kat.radius - world.groundAt(kat.pos.x, kat.pos.z);
    if (lift > peak) peak = lift;
    if (kat.pos.x > finish) return { over: true, peak };
  }
  return { over: false, peak };
}

/* Pick real props: too big to eat at the test size, and low enough that the
   climb rule should apply with margin on both sides of the energy gate. */
const cases = [];
for (const a of ARCHETYPES) {
  if (a.scenery || !a.dims) continue;
  const D = (a.pickup / TUNING.pickupRatio) * 0.96;      // just too SMALL to stick to it
  const ratio = a.dims.h / (D / 2);                      // rise, in ball radii
  if (ratio < 0.25 || ratio > TUNING.climbFrac * 0.7) continue;
  if (D < 0.04 || D > 3) continue;                       // keep the sim quick
  cases.push({ id: a.id, size: D, rise: a.dims.h, ratio });
}
cases.sort((x, y) => x.ratio - y.ratio);
const pick = [0, 0.25, 0.5, 0.75, 0.99].map((f) => cases[Math.floor(f * (cases.length - 1))])
  .filter((c, i, arr) => c && arr.indexOf(c) === i);

console.log(`climbFrac = ${TUNING.climbFrac} radii.  ${cases.length} catalog props sit in the climbable band.\n`);
console.log('prop              ball     rise   rise/R   edible?   fast approach   slow approach');
let failed = 0;
for (const c of pick) {
  const arch = getProp(c.id);
  const edible = arch.pickup <= c.size * TUNING.pickupRatio;
  // The gate is `rise <= climbFrac * R * (v/topSpeed)^2`, and these runs hold
  // the stick so v == topSpeed. So what decides it is purely the ratio of the
  // rise to climbFrac*R — vary the ball's top speed and nothing changes. To
  // test the gate we vary the ball's speed BELOW its cap instead, by giving
  // the stage a higher cap than the run can reach in the distance available.
  const R = c.size / 2;
  const needFrac = c.rise / (TUNING.climbFrac * R);      // (v/topSpeed)^2 required
  const vRef = 2.2 * c.size;                             // a sane cruising speed
  const fast = charge(c.id, c.size, vRef, vRef);                        // v == cap
  const slow = charge(c.id, c.size, vRef, vRef / Math.sqrt(needFrac) * 2.2);  // v well under cap
  const ok = !edible && fast.over && !slow.over;
  if (!ok) failed++;
  console.log(
    `  ${c.id.padEnd(16)} ${formatSizeShort(c.size).padStart(6)} ${formatSizeShort(c.rise).padStart(8)} ` +
    `${c.ratio.toFixed(2).padStart(8)} ${(edible ? 'EDIBLE' : 'no').padStart(9)} ` +
    `${(fast.over ? 'rolled over' : 'BLOCKED').padStart(15)} ${(slow.over ? 'ROLLED OVER' : 'stopped').padStart(15)}` +
    `${ok ? '' : '   <- FAIL'}`);
}
console.log(`\n${failed ? `${failed} FAILED — climbing is not gated on speed` : 'PASS — fast gets you over, slow does not; gravity is the gate'}`);
process.exit(failed ? 1 : 0);
