/* ============================================================
   Can the katamari physically GET to everything it may eat?

   `moveKatamari` clamps the ball's CENTRE to the stage bounds
   inset by one radius, so the ball's surface just touches the
   wall. That is right for a wall and wrong for a corner: at a
   corner the centre is clamped on BOTH axes, so the nearest legal
   centre to the corner itself is a radius away diagonally, i.e.
   R*sqrt(2) from the corner — half a radius further than the ball
   can reach. A wedge of the map is therefore unreachable, and it
   GROWS as the ball grows.

   Which makes reachability non-monotonic: a small prop tucked into
   a corner is edible and reachable while you are small, and once
   you outgrow it you can never touch it again. The finder points
   at it, and the stage cannot be cleared. Reported on the world
   stage: "when you reach a certain size it's impossible to pick up
   all the smaller items around the edge of the map".

   For each prop this checks the size at which it FIRST becomes
   edible (pickup / pickupRatio) and every size from there to the
   stage's ceiling, and asks whether any legal centre lies within a
   radius of it.
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
import { TUNING } from '../src/world/Katamari.js';
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
import { formatSizeShort } from '../src/util/math.js';

buildCatalog();
const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
const STAGES = [quantumStage, atomStage, microbeStage, houseStage, townStage, cityStage, countryStage, worldStage, solarStage, galaxyStage, universeStage];
const ONLY = process.argv.find((a) => a.startsWith('--only='))?.split('=')[1]?.split(',');

let fail = 0;
for (const stage of STAGES.filter((s) => !ONLY || ONLY.includes(s.id))) {
  const world = new World(mat).build(stage);
  const f = world.field;
  const B = world.bounds;

  let totalVol = 0;
  for (let i = 0; i < f.n; i++) totalVol += f.arch[i].volume;
  const ceiling = Math.cbrt((6 * totalVol * TUNING.packing) / Math.PI);

  /** Closest the ball's centre may legally get to (px,pz) at radius R. */
  const reach = (px, pz, R) => {
    const cx = Math.min(Math.max(px, B.minX + R), B.maxX - R);
    const cz = Math.min(Math.max(pz, B.minZ + R), B.maxZ - R);
    return Math.hypot(px - cx, pz - cz);
  };

  /* The clamp arithmetic above is necessary but nowhere near sufficient, and
     assuming it was cost a wrong diagnosis: it said every stage was fine while
     the world stage was demonstrably unclearable. So drive the REAL code. For
     each prop, put a ball of the tested size at the best legal position next to
     it and ask `resolve` whether it gets eaten. That covers `canOccupy`, the
     wall volumes, the vertical band, the per-slice profile and the broadphase
     all at once, which is the whole point — the bug was in one of those. */
  const { Katamari } = await import('../src/world/Katamari.js');
  const probe = new Katamari(mat, stage.startSize / 2);
  probe.setStageProfile(stage.startSize, 1, Math.max(4, (stage.goal * 1.5) / stage.startSize));
  const rnd = () => 0.5;

  /* PROBING MUST NOT MUTATE THE WORLD, and forgetting that produced a
     spectacular false positive: `resolve` really does eat what it can reach, so
     the first successful probe removed the prop and every later probe of it —
     and of anything a probe happened to roll over — reported failure. The first
     run of this claimed 4,191 of 4,191 city props were unreachable, which was a
     bug in the instrument, not in the game. Restore `alive` and `liveCount`
     after every probe; the instanced-mesh slot bookkeeping does not matter here
     because nothing is being drawn. */
  const collects = (i, D) => {
    if (!f.alive[i]) return false;
    const R = D / 2;
    const px = f.x[i], pz = f.z[i];
    // Best legal centre: as close to the prop as the bounds allow.
    const cx = Math.min(Math.max(px, B.minX + R), B.maxX - R);
    const cz = Math.min(Math.max(pz, B.minZ + R), B.maxZ - R);
    const gy = world.groundAt(cx, cz);
    if (gy > 1e5) return false;
    /* `Katamari.reset` takes the GROUND height and lifts by the radius itself
       (`pos.y = spawn.y + startRadius`). Passing `gy + R` therefore floats the
       ball a full radius too high, and the vertical band in `resolve` then
       rejects everything shorter than 0.9 radii — which read as "every prop in
       the city is unreachable". Two other harnesses make the same mistake; they
       get away with it only because they step physics afterwards and the ball
       falls back down. */
    probe.reset(R, new THREE.Vector3(cx, gy, cz));
    const live = f.liveCount;
    const eaten = [];
    world.resolve(probe, 1 / 60, rnd);
    for (let k = 0; k < f.n; k++) if (!f.alive[k] && wasAlive[k]) eaten.push(k);
    const got = eaten.includes(i);
    for (const k of eaten) { f.alive[k] = 1; }
    f.liveCount = live;
    return got;
  };
  const wasAlive = Uint8Array.from(f.alive);

  const stuck = [];
  const sizes = [];
  for (let D = stage.startSize; D < ceiling * 1.02; D *= 1.5) sizes.push(D);
  sizes.push(ceiling);
  for (let i = 0; i < f.n; i++) {
    const firstD = f.pickup[i] / TUNING.pickupRatio;
    if (firstD > ceiling) continue;                    // `balance` reports that class
    let everOk = false, lostAt = null;
    for (const D of sizes) {
      if (D < firstD) continue;
      if (collects(i, D)) { everOk = true; lostAt = null; } else if (everOk && lostAt === null) lostAt = D;
    }
    if (!everOk) stuck.push({ i, id: f.arch[i].id, x: f.x[i], z: f.z[i], firstD, lostAt: firstD, why: 'never' });
    else if (lostAt !== null) stuck.push({ i, id: f.arch[i].id, x: f.x[i], z: f.z[i], firstD, lostAt, why: 'outgrown' });
  }

  stuck.sort((a, b) => a.lostAt - b.lostAt);
  const ok = stuck.length === 0;
  console.log(`\n=== ${stage.name} ===`);
  console.log(`  props ${f.n}   ceiling ${formatSizeShort(ceiling, stage.unit)}`);
  const never = stuck.filter((x) => x.why === 'never').length;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${stuck.length} unreachable`
    + `  (${never} never collectable, ${stuck.length - never} outgrown)`);
  for (const s of stuck.slice(0, 8)) {
    console.log(`      ${s.id.padEnd(16)} at (${s.x.toFixed(0)}, ${s.z.toFixed(0)})`
      + `  edible from ${formatSizeShort(s.firstD, stage.unit).padStart(9)}`
      + `  ${s.why === 'never' ? 'NEVER collectable' : `lost past ${formatSizeShort(s.lostAt, stage.unit)}`}`);
  }
  if (!ok) fail++;
}

console.log(fail ? `\n${fail} stage(s) can be made unclearable by growing`
  : '\nnothing can be put out of reach by growing');
process.exit(fail ? 1 : 0);
