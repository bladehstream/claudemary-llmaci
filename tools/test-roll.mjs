/* ============================================================
   The ball must roll the way it is travelling.

   User report, 2026-07-29:
     "the ball counter-rotates in the direction of motion ie
      when its rolling forward, it rotates like it's rolling
      backwards. that is very jarring."

   Rolling without slipping means the contact point is
   stationary, which fixes the spin axis exactly:

     omega x (-R * up) = -v    =>    omega = (v.z, 0, -v.x) / R

   The cleanest observable is the CONTACT POINT: track the
   material point currently touching the ground and see how far
   it moves in world space over one tick.

     correct rolling      -> it does not move at all      (0x)
     counter-rotating     -> it moves at twice ball speed (2x)

   Measuring the top of the ball instead is tempting but noisy:
   over a finite tick the point travels an arc, so its chord
   tilts and the reading drifts away from a clean +1 for
   reasons that have nothing to do with the bug.
   ============================================================ */

import * as THREE from 'three';
import { buildCatalog } from '../src/world/props/index.js';
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

const stage = {
  id: 'test', name: 'test', seed: 1, startSize: 0.4, goal: 99, time: 60, speed: 2,
  cell: 4, chunk: 0, spawn: null,
  bounds: { minX: -60, maxX: 60, minZ: -60, maxZ: 60 },
  camera: { pitch: 0.35, distance: 6 },
  build(w) { w.plat(-60, -60, 60, 60, 0); },
};

const HEADINGS = [
  ['+X  (east)', 1, 0], ['-X  (west)', -1, 0],
  ['+Z  (south)', 0, 1], ['-Z  (north)', 0, -1],
  ['NE  diagonal', 0.7071, -0.7071], ['SW  diagonal', -0.7071, 0.7071],
];

const rows = [];
for (const [label, mx, mz] of HEADINGS) {
  const world = new World(mat).build(stage);
  const kat = new Katamari(mat, stage.startSize / 2);
  kat.setStageProfile(stage.startSize, 2, 50);
  kat.reset(stage.startSize / 2, new THREE.Vector3(0, world.groundAt(0, 0) + stage.startSize / 2, 0));
  const rng = makeRng(3);
  const H = 1 / 120;

  // Roll for a while so the spinner accumulates a real rotation.
  for (let t = 0; t < 2.5; t += H) {
    kat.step(H, { moveX: mx, moveZ: mz, dash: false }, 0, world);
    world.resolve(kat, H, rng);
    world.time += H;
  }

  const R = kat.radius;
  const q0 = kat.spinner.quaternion.clone();
  const p0 = kat.pos.clone();
  const speed0 = Math.hypot(kat.vel.x, kat.vel.z);

  // The material point that is touching the ground right now, expressed in
  // the spinner's own (rotating) frame so we can follow that same speck of
  // katamari after the ball has turned.
  const local = new THREE.Vector3(0, -R, 0).applyQuaternion(q0.clone().invert());
  const worldBefore = p0.clone().add(local.clone().applyQuaternion(q0));

  kat.step(H, { moveX: mx, moveZ: mz, dash: false }, 0, world);
  world.resolve(kat, H, rng);
  world.time += H;

  const worldAfter = kat.pos.clone().add(local.clone().applyQuaternion(kat.spinner.quaternion));
  const slip = worldAfter.clone().sub(worldBefore);
  const ratio = slip.length() / Math.max(1e-9, speed0 * H);

  rows.push({ label, ratio });
}

console.log('How far does the point TOUCHING THE GROUND move in one tick,');
console.log('as a multiple of how far the ball moved?\n');
console.log('    0x = rolling correctly      2x = spinning exactly backwards\n');
console.log('  heading          slip     result');
let failed = 0;
for (const r of rows) {
  const ok = r.ratio < 0.25;
  if (!ok) failed++;
  console.log(`  ${r.label.padEnd(14)} ${r.ratio.toFixed(3).padStart(6)}x   ` +
    `${ok ? 'ok' : (r.ratio > 1.5 ? 'COUNTER-ROTATING' : 'slipping')}`);
}
console.log(`\n${failed ? `${failed} FAILED — the ball does not roll with its travel` : 'PASS — the contact point is stationary; the ball rolls the way it moves'}`);
process.exit(failed ? 1 : 0);
