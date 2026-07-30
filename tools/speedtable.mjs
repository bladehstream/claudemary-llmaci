/* ============================================================
   What does the movement actually feel like?

   Per stage and size, MEASURED by running the real Katamari at
   full throttle on empty ground rather than by quoting the
   curve:

     top m/s      the speed it truly settles at
     to top       seconds of holding W before it gets there
     runway       metres covered while getting there
     to stop      seconds after letting go
     coast        how far it slides, in its OWN widths — this and
                  `runway` are what "heavy" actually feels like
     screen-rate  v / camera distance. The camera pulls back in
                  proportion to the katamari, so this is the
                  BALL-relative cue — how fast you look like you
                  are going. It is meant to sag as you grow.
     cross        seconds to drive the length of the stage. This is
                  the WORLD-relative cue, and it is the one players
                  actually complain about: scenery does not scale
                  with you, so a `cross` that halves down a stage
                  reads as the world accelerating at you.

   Measuring rather than quoting matters. The curve said top
   speed climbed the whole time while players reported the late
   game as unplayably slow, twice — because screen-rate was
   collapsing. A later pass nearly shipped an acceleration so low
   that ground friction capped the ball under its nominal top
   speed, which the formula would never have shown. And the coast
   columns exist because friction used to be a constant decay, so
   a 300m katamari at 1440 m/s stopped in the same 0.54s as a
   marble — nothing in the tuning said so.
   ============================================================ */

import * as THREE from 'three';
import { topSpeedFor, TUNING, Katamari, stageSpeedFor } from '../src/world/Katamari.js';
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
import { quantumStage } from '../src/world/stages/quantum.js';
import { atomStage } from '../src/world/stages/atom.js';
import { microbeStage } from '../src/world/stages/microbe.js';
import { houseStage } from '../src/world/stages/house.js';
import { townStage } from '../src/world/stages/town.js';
import { cityStage } from '../src/world/stages/city.js';
import { countryStage } from '../src/world/stages/country.js';
import { worldStage } from '../src/world/stages/world.js';
import { solarStage } from '../src/world/stages/solar.js';
import { galaxyStage } from '../src/world/stages/galaxy.js';
import { universeStage } from '../src/world/stages/universe.js';
import { formatSizeShort, makeRng } from '../src/util/math.js';

buildCatalog();
const mat = new THREE.MeshLambertMaterial({ vertexColors: true });

/** Empty ground big enough that nothing can get in the way. */
function flat(size) {
  const B = Math.max(400, size * 400);
  return {
    id: 'flat', name: 'flat', seed: 1, startSize: size, goal: 99, time: 60, speed: 1,
    cell: Math.max(1, size), chunk: 0, spawn: null,
    bounds: { minX: -B, maxX: B, minZ: -B, maxZ: B },
    camera: { pitch: 0.35, distance: 6 },
    build(w) { w.plat(-B, -B, B, B, 0); },
  };
}

/** Hold W on flat ground from a standstill and watch what happens. */
function measure(D, stage, v0) {
  const world = new World(mat).build(flat(D));
  const kat = new Katamari(mat, D / 2);
  const span = Math.max(4, (stage.goal * 1.5) / stage.startSize);
  kat.setStageProfile(stage.startSize, v0, span);
  // reset() lifts by the radius itself; passing ground + R floats it.
  kat.reset(D / 2, new THREE.Vector3(0, world.groundAt(0, 0), 0));
  const rng = makeRng(11);
  const H = 1 / 120;
  const trace = [];
  const p0 = kat.pos.clone();
  // 20s is far more than enough; the slowest configuration settles in under
  // a second. Record the whole run and find the milestones afterwards —
  // deciding "is this top speed yet?" while still accelerating cannot work.
  for (let t = 0; t < 20; t += H) {
    kat.step(H, { moveX: 0, moveZ: -1, dash: false }, Math.PI, world);
    world.resolve(kat, H, rng);
    world.time += H;
    trace.push({ t: t + H, sp: Math.hypot(kat.vel.x, kat.vel.z), dist: kat.pos.distanceTo(p0) });
  }
  const top = trace.reduce((m, s) => Math.max(m, s.sp), 0);
  const at = trace.find((s) => s.sp >= top * 0.95) || trace[trace.length - 1];

  // Now let go and see how long it takes to give up.
  const pStop = kat.pos.clone();
  let tStop = 0, coast = 0;
  for (let t = 0; t < 20; t += H) {
    kat.step(H, { moveX: 0, moveZ: 0, dash: false }, Math.PI, world);
    world.resolve(kat, H, rng);
    world.time += H;
    tStop = t + H; coast = kat.pos.distanceTo(pStop);
    if (Math.hypot(kat.vel.x, kat.vel.z) <= top * 0.05) break;
  }
  return { top, tTop: at.t, runway: at.dist, tStop, coast };
}

for (const st of [quantumStage, atomStage, microbeStage, houseStage, townStage, cityStage, countryStage, worldStage, solarStage, galaxyStage, universeStage]) {
  const L = st.bounds.maxX - st.bounds.minX;
  console.log(`\n=== ${st.name} — ${formatSizeShort(L, st.unit)} across, ${formatSizeShort(st.startSize, st.unit)} -> goal ${formatSizeShort(st.goal, st.unit)} ===`);
  const sizes = [st.startSize];
  let d = st.startSize;
  while (d < st.goal * 1.5) { d *= 2.6; sizes.push(Math.min(d, st.goal * 1.5)); }
  const v0 = stageSpeedFor(st);
  console.log(`  stage speed at start: ${v0.toFixed(1)} m/s`);
  console.log('   size      top m/s   nominal   to top    runway   to stop    coast   screen-rate    cross');
  for (const D of sizes) {
    const nominal = topSpeedFor(D, st.startSize, v0);
    const m = measure(D, st, v0);
    const screen = m.top / (D * 0.5 * st.camera.distance);
    const capped = m.top < nominal * 0.97 ? '  <- CAPPED BELOW TOP SPEED' : '';
    console.log(
      `  ${formatSizeShort(D, st.unit).padStart(9)} ${m.top.toFixed(1).padStart(8)} ${nominal.toFixed(1).padStart(9)} ` +
      `${(m.tTop.toFixed(2) + 's').padStart(8)} ${(m.runway.toFixed(1) + 'm').padStart(9)} ` +
      `${(m.tStop.toFixed(2) + 's').padStart(9)} ${(m.coast / D).toFixed(1).padStart(6)}w ` +
      `${screen.toFixed(3).padStart(13)} ${((L / m.top).toFixed(0) + 's').padStart(8)}${capped}`);
  }
}
console.log(`\nmodel: topSpeed = stageSpeed * (D / stageStart)^${TUNING.speedP}`);
console.log(`  accel  ${TUNING.accelMulSmall} -> ${TUNING.accelMulHuge}    brake  ${TUNING.brakeMulSmall} -> ${TUNING.brakeMulHuge}` +
  `    turn  ${TUNING.turnMulSmall} -> ${TUNING.turnMulHuge}   (x topSpeed, across a stage)`);
console.log('\nREAD THE `cross` COLUMN FIRST. Players report speed off the WORLD, not off');
console.log('the ball: buildings and kerbs do not scale with you, so how fast the stage');
console.log('streams past is what "too fast" means. It rose 13-16x down a stage at');
console.log('speedP 0.75 and was reported as the game accelerating at you twice.');
console.log('screen-rate is the other cue — ball-widths per second — and it SAGS by');
console.log('design now; that is the katamari "slowing down" as it grows.');
console.log('"to top" and "to stop" rising down a stage = weight, and they are now');
console.log('independent: nothing here is an emergent balance another constant undercuts.');
