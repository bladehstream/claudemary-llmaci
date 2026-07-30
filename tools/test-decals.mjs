/* ============================================================
   Does any stage draw a floor THROUGH the katamari?

   The bug this exists to catch, from the culture stage:

     const Y_FILM = 0.030;   // mucus film

   The stage starts you at 0.05 diameter — a radius of 0.025 — so that
   flat sheet of mucus passed through the middle of the ball, and
   because the camera orbits at ball height it filled the whole screen
   edge-on with the katamari hidden behind it. Every layer in that
   block had a comment explaining the gap to the layer below, which is
   the OTHER constraint on these numbers, and the one the author was
   thinking about.

   TWO CONSTRAINTS:
     1. no two big flat faces share a Y      (z-fighting)
     2. a decal sits far below the ball's radius   (this test)

   The house has always had (2) right and is the reference: plank lines
   at +0.003 on a 0.05 ball, i.e. under 1/8 of the starting radius.

   Method. Sample a grid over each stage. At every point where a ball
   of the tested size could actually BE, look for a roughly-horizontal
   terrain triangle whose height falls between just above the ball's
   contact point and just below its top. A vertical face there is fine
   — you are allowed to stand against a wall. A horizontal one is a
   floor at chest height, which is either a decal that is too tall or a
   platform skin that has drifted off its deck.
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

/* A face counts as "floor" at |ny| > this. Ramps are legitimately tilted and a
   ramp surface you are standing ON is not a defect, so the bar is high enough to
   exclude anything with a real slope. */
const FLAT = 0.94;
/* Ignore the sliver right at the contact point — that is just the ground, plus
   any deliberate hair's-breadth decal, and the whole point is that those are
   fine. 0.18 of the radius is well above the house's 0.003-on-0.025 (0.12). */
const LOW = 0.45;
/* And stop short of the very top: a ceiling you can roll under is a feature. */
const HIGH = 1.55;
/* A LIVED-WITH BASELINE, not zero.
 *
 * Three stages sit just above zero for reasons that predate this check and have
 * never drawn a complaint: the house's veranda ramp plate (0.7%), the town's kerb
 * geometry (1.0%) and the world's ramp slabs (1.5%). The atom, culture and city
 * stages measure exactly 0. Failing at anything above zero would mean this
 * harness cried wolf on three stages that look fine, and a test nobody trusts is
 * a test nobody runs — so the bar is 2%, which still catches a regression of the
 * kind that started this (the culture stage was at 9.2%, the atom stage 10.0%)
 * while leaving the known-acceptable state green. Tighten it if you ever clean
 * those three up. */
const BUDGET = 0.02;

let fail = 0;
for (const stage of STAGES.filter((s) => !ONLY || ONLY.includes(s.id))) {
  const world = new World(mat).build(stage);
  const geo = world.terrainMesh.geometry;
  const pos = geo.attributes.position;

  /* Bucket the terrain's flat triangles by grid cell so the sampling below is
     not O(samples x triangles) — the country stage has 300k of them. */
  const CELL = Math.max((stage.bounds.maxX - stage.bounds.minX) / 90, stage.startSize * 4);
  const grid = new Map();
  const key = (x, z) => `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const ab = new THREE.Vector3(), ac = new THREE.Vector3(), n = new THREE.Vector3();
  let flatTris = 0;
  for (let t = 0; t + 2 < pos.count; t += 3) {
    a.fromBufferAttribute(pos, t); b.fromBufferAttribute(pos, t + 1); c.fromBufferAttribute(pos, t + 2);
    ab.subVectors(b, a); ac.subVectors(c, a); n.crossVectors(ab, ac);
    const len = n.length();
    if (len < 1e-12 || Math.abs(n.y / len) < FLAT) continue;   // wall, or degenerate
    flatTris++;
    const y = (a.y + b.y + c.y) / 3;
    const tri = {
      y,
      x0: Math.min(a.x, b.x, c.x), x1: Math.max(a.x, b.x, c.x),
      z0: Math.min(a.z, b.z, c.z), z1: Math.max(a.z, b.z, c.z),
    };
    for (let gx = Math.floor(tri.x0 / CELL); gx <= Math.floor(tri.x1 / CELL); gx++) {
      for (let gz = Math.floor(tri.z0 / CELL); gz <= Math.floor(tri.z1 / CELL); gz++) {
        const k = `${gx},${gz}`;
        let list = grid.get(k);
        if (!list) grid.set(k, list = []);
        list.push(tri);
      }
    }
  }

  // Two sizes: the moment you arrive, and midway up the ladder.
  const sizes = [stage.startSize, Math.sqrt(stage.startSize * stage.goal)];
  const worst = [];
  let samples = 0;
  for (const D of sizes) {
    const R = D / 2, N = 64;
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const x = stage.bounds.minX + ((i + 0.5) / N) * (stage.bounds.maxX - stage.bounds.minX);
        const z = stage.bounds.minZ + ((j + 0.5) / N) * (stage.bounds.maxZ - stage.bounds.minZ);
        const ground = world.groundAt(x, z);
        if (ground > 1e5) continue;                       // inside a wall volume
        if (!world.canOccupy(x, z, ground, R * 1.15)) continue;
        samples++;
        /* The face has to be OVER the ball, not merely nearby. That distinction
           is the whole test: a step's top face sits BESIDE a ball that cannot
           climb it yet, which is the game working, and an early version of this
           check flagged 15% of the house for exactly that. A face whose XZ
           footprint covers the ball's own footprint is a different thing — it is
           a floor drawn at chest height with the ball inside it.

           So the face must cover the ball's CENTRE, and sit between 0.45 and
           1.55 radii up — squarely through the body, which is what "clipping"
           looked like. A plate a whisker above a ramp is a different and much
           milder complaint; it is not what this guards. */
        const list = grid.get(key(x, z));
        if (!list) continue;
        const pad = 0;   // must cover the ball's own centre line
        for (const tri of list) {
          const h = tri.y - ground;
          if (h <= R * LOW || h >= R * HIGH) continue;
          if (tri.x1 < x - pad || tri.x0 > x + pad) continue;
          if (tri.z1 < z - pad || tri.z0 > z + pad) continue;
          worst.push({ D, x, z, h, frac: h / R });
          break;
        }
      }
    }
  }

  worst.sort((p, q) => q.frac - p.frac);
  const rate = samples ? worst.length / samples : 0;
  const ok = rate <= BUDGET;
  console.log(`\n=== ${stage.name} ===`);
  console.log(`  flat terrain faces : ${flatTris}`);
  console.log(`  sampled positions  : ${samples}`);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${worst.length} where a floor cuts the ball`
    + `  (${(rate * 100).toFixed(1)}% of positions, budget ${(BUDGET * 100).toFixed(0)}%)`);
  for (const w of worst.slice(0, 6)) {
    console.log(`        at ${formatSizeShort(w.D, stage.unit)}  (${w.x.toFixed(2)}, ${w.z.toFixed(2)})`
      + `  face ${w.h.toFixed(4)} above the ground = ${(w.frac * 100).toFixed(0)}% of the radius`);
  }
  if (!ok) fail++;
}

console.log(fail
  ? `\n${fail} stage(s) draw a floor through the katamari more than the budget allows`
  : '\nno stage draws a floor through the katamari beyond the lived-with baseline');
process.exit(fail ? 1 : 0);
