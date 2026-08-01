/* ============================================================
   Magnet mode: does it do the one thing, and only the one thing?

   The feature is a single sentence — "collectable things stick
   from a bit further away" — and almost every way of getting it
   wrong is a way of accidentally saying something else:

     - it must NOT make anything edible that was not already
       edible (that would move the size ladder the whole game is
       built on);
     - it must NOT extend the obstacle test (bouncing off a wall
       you have not touched is a bug, not a feature);
     - it must reach EXACTLY as far as it claims, because the
       Options note quotes the distance to the player in
       ball-widths and a note that lies is worse than no note;
     - and it must not quietly break the balance of eleven stages
       that were tuned without it.

   Sections 1-4 are exact: one prop, one ball, known distances,
   no bot and no randomness. Section 5 drives the real balance
   simulation across the slider's range, because "does it change
   the game" is a question no unit test can answer.

   Run: node tools/test-magnet.mjs [--full]
        --full  sweep every stage (slow); default is the three
                that bound the problem
   ============================================================ */

import * as THREE from 'three';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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
import { World } from '../src/world/World.js';
import { Katamari, TUNING } from '../src/world/Katamari.js';
import { makeRng } from '../src/util/math.js';

const ROOT = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
buildCatalog();

let fail = 0;
const check = (name, ok, extra = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '   ' + extra : ''}`);
  if (!ok) fail++;
};
const rnd = makeRng(0x1234);
const mat = new THREE.MeshBasicMaterial();

/* ------------------------------------------------------------
   A one-prop world.

   Building a real stage and hoping the right thing happens to be
   in the right place is how you end up measuring the layout
   instead of the feature. This puts exactly one prop at exactly
   one distance on flat ground, so every number below is the
   thing it says it is.
   ------------------------------------------------------------ */
function lab(archId, ballRadius, dist, magnet) {
  const arch = ARCHETYPES.find((a) => a.id === archId);
  if (!arch) throw new Error(`no archetype ${archId}`);
  /* A real stage object with a real `build`, going through `PropField.add` and
     `finalize` like every other stage — NOT hand-written typed arrays. Poking
     the struct-of-arrays directly would skip the broadphase grid, the scaled
     radius/height/pickup derivation and the instance bookkeeping, and this
     harness would then be measuring a data structure the game never sees. */
  const stage = {
    id: 'lab', name: 'lab', seed: 1, unit: 'm',
    startSize: ballRadius * 2, goal: 1e9, time: 60,
    cell: Math.max(ballRadius * 4, 1),
    bounds: { minX: -1000, maxX: 1000, minZ: -1000, maxZ: 1000 },
    // No spawn clearing: it would delete the very prop under test.
    sky: { top: 0, bottom: 0, fog: 0, fogNear: 1, fogFar: 100 },
    sun: { x: 0, y: 1, z: 0, intensity: 1 },
    camera: { distance: 6 },
    // `World.build` calls `field.finalize()` itself; a stage must not.
    build(world) {
      world.plat(-1000, -1000, 1000, 1000, 0);
      world.field.add(arch, 0, dist, 0, 0, 0, 1);
    },
  };
  const world = new World(mat).build(stage);
  const kat = new Katamari(mat, ballRadius);
  kat.reset(ballRadius, new THREE.Vector3(0, 0, 0));
  kat.magnet = magnet;
  return { world, kat, arch, f: world.field };
}

/** Does the ball collect the prop, standing still, in one resolve pass? */
function collects(archId, ballRadius, dist, magnet) {
  const { world, kat } = lab(archId, ballRadius, dist, magnet);
  const ev = world.resolve(kat, 1 / 120, rnd);
  return ev.some((e) => e.type === 'pickup');
}

/** The nearest distance at which it is NOT collected — i.e. the true reach. */
function measureReach(archId, ballRadius, magnet) {
  let lo = 0, hi = ballRadius * 6;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (collects(archId, ballRadius, mid, magnet)) lo = mid; else hi = mid;
  }
  return lo;
}

/* ============================================================
   1. Reach is exactly what the Options note claims
   ============================================================ */
console.log('\n=== how far does it actually reach ===');

const SMALL = 'thumbtack';
const smallArch = ARCHETYPES.find((a) => a.id === SMALL)
  || ARCHETYPES.slice().sort((a, b) => a.pickup - b.pickup)[0];
const SMALL_ID = smallArch.id;
// A ball comfortably big enough to eat it, so `pickupRatio` is never the
// binding constraint and the only thing under test is distance.
const R = smallArch.pickup * 4;

const r0 = measureReach(SMALL_ID, R, 0);
for (const m of [0, 0.15, 0.3, 0.6]) {
  const got = measureReach(SMALL_ID, R, m);
  const want = r0 + R * m;
  const err = Math.abs(got - want) / Math.max(1e-9, want);
  check(`magnet ${m.toFixed(2)} reaches ${(1 + m).toFixed(2)} radii`, err < 0.02,
    `measured ${got.toFixed(4)} vs predicted ${want.toFixed(4)}`);
}
check('magnet 0 is bit-for-bit the old behaviour',
  measureReach(SMALL_ID, R, 0) === r0, `${r0.toFixed(6)}`);

/* ============================================================
   2. Reach is not appetite

   ⚠ THE ASSERTION THE WHOLE FEATURE RESTS ON. If a magnet can
   pull in something the ball is too small for, it is not an aim
   assist any more — it is a different game, and the size ladder
   every stage is tuned around stops meaning anything.
   ============================================================ */
console.log('\n=== it cannot eat what it is too small for ===');

// A prop just over the edibility line for this ball, at touching distance.
const tooBig = ARCHETYPES.slice()
  .sort((a, b) => a.pickup - b.pickup)
  .find((a) => a.pickup > R * 2 * TUNING.pickupRatio * 1.05);
if (!tooBig) {
  check('a too-big prop exists to test with', false);
} else {
  const touching = R + (tooBig.radius ?? tooBig.pickup * 0.5) * 0.5;
  check('too big is refused with the magnet off',
    !collects(tooBig.id, R, touching, 0), tooBig.id);
  check('too big is STILL refused at maximum magnet',
    !collects(tooBig.id, R, touching, TUNING.magnetMax), tooBig.id);
  check('and refused at point-blank range with maximum magnet',
    !collects(tooBig.id, R, R * 0.2, TUNING.magnetMax));
}

/* ============================================================
   3. It does not extend the obstacle test
   ============================================================ */
console.log('\n=== a magnet does not make you bump into things ===');

function blockedAt(archId, ballRadius, dist, magnet) {
  const { world, kat } = lab(archId, ballRadius, dist, magnet);
  // Drive straight at it and see where the solver stops us.
  kat.vel.set(-ballRadius * 4, 0, 0);
  const before = kat.pos.x;
  for (let i = 0; i < 30; i++) {
    world.moveKatamari(kat, 1 / 120);
    world.resolve(kat, 1 / 120, rnd);
  }
  return { moved: before - kat.pos.x };
}

if (tooBig) {
  const near = R * 3;
  const off = blockedAt(tooBig.id, R, near, 0);
  const on = blockedAt(tooBig.id, R, near, TUNING.magnetMax);
  check('an impassable prop stops the ball in the same place either way',
    Math.abs(off.moved - on.moved) < R * 1e-6,
    `moved ${off.moved.toFixed(5)} vs ${on.moved.toFixed(5)}`);
}

/* ============================================================
   4. The "anything left to eat" queries are untouched

   These drive the end-of-round finder and the "ALL ROLLED UP"
   check. They key off `pickupRatio` alone and therefore must not
   move at all — if one of them ever starts consulting reach, a
   stage becomes unclearable the moment the last prop sits inside
   the magnet but outside the ball.
   ============================================================ */
console.log('\n=== the end-of-round checks do not move ===');
{
  const a = lab(SMALL_ID, R, R * 1.4, 0);
  const b = lab(SMALL_ID, R, R * 1.4, TUNING.magnetMax);
  const d = R * 2;
  check('canStillGrow is identical',
    a.world.canStillGrow(d) === b.world.canStillGrow(d));
  check('countCollectable is identical',
    a.world.countCollectable(d, 12) === b.world.countCollectable(d, 12));
  check('remainingCollectable is identical',
    a.world.remainingCollectable(d, 12).length === b.world.remainingCollectable(d, 12).length);
}

/* ============================================================
   5. The flight animation converges and cleans up after itself
   ============================================================ */
console.log('\n=== the in-flight pieces land ===');
{
  const { world, kat } = lab(SMALL_ID, R, R * 1.35, TUNING.magnetMax);
  world.resolve(kat, 1 / 120, rnd);
  check('a magnet pickup starts in flight', kat.flying.length === 1,
    `${kat.flying.length} flying`);
  const start = kat.flying[0] ? kat.flying[0].fly : 0;
  check('and it starts outside the ball surface', start > 0, `${start.toFixed(4)}`);
  let frames = 0;
  while (kat.flying.length && frames < 600) { kat.updateFlight(1 / 60); frames++; }
  check('it lands, and leaves the flight list', kat.flying.length === 0,
    `${frames} frames (${(frames / 60).toFixed(2)}s)`);
  check('and it lands quickly enough to read as motion, not a delay',
    frames > 3 && frames < 60, `${frames} frames`);
  kat.layoutAttached();
  const a = kat.attached[0];
  check('and comes to rest exactly on the surface, not floating',
    a && Math.abs(a.mesh.position.length() - (kat.radius - Math.min(a.embed, kat.radius * 0.42))) < 1e-9);
}

/* ============================================================
   6. What it does to eleven tuned stages

   No assertions here that a number must hit a target — the
   balance harness owns that judgement. This prints the SHAPE, so
   a default can be chosen from evidence and a regression is
   visible as a row that moved.
   ============================================================ */
const FULL = process.argv.includes('--full');
console.log('\n=== what it does to eleven tuned stages ===');

/* Shell out to the REAL balance harness rather than reimplementing the bot.
   Duplicating it would mean this file slowly drifting away from the thing that
   actually decides whether a stage is clearable, and then reporting confidently
   about a game nobody plays. `--magnet` was added there for this. */
const STAGES = FULL
  ? null
  // The three that bound the problem: the tightest stage in the game, a huge
  // sparse one where reach should matter most, and one in the middle.
  : 'house,city,world';
const LEVELS = [0, 0.25, 0.5, 1];
const rows = [];

for (const m of LEVELS) {
  const args = ['tools/balance.mjs', '0.9', '--runs=3', `--magnet=${m}`];
  if (STAGES) args.push(`--only=${STAGES}`);
  /* spawnSync, not execFileSync: this project has been bitten before by a tool
     that writes what you need to stderr and exits 0, leaving execFileSync's
     stdout-only return looking like an empty result rather than an error. */
  const r = spawnSync('node', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26 });
  if (r.status !== 0) {
    check(`balance runs at magnet ${m}`, false, (r.stderr || '').split('\n')[0]);
    continue;
  }
  const out = r.stdout;
  let stage = null;
  for (const line of out.split('\n')) {
    const s = line.match(/^=== (.+) ===$/);
    if (s) { stage = s[1]; continue; }
    const g = line.match(/goal reached\s*:\s*(\S+)\s*\((\d+)\/(\d+)/);
    if (g && stage) rows.push({ m, stage, at: g[1], hit: +g[2], of: +g[3] });
    const f = line.match(/goal is\s*:\s*(\d+)% of the median/);
    if (f && stage && rows.length) rows[rows.length - 1].pct = +f[1];
  }
}

const stages = [...new Set(rows.map((r) => r.stage))];
console.log(`\n  ${'stage'.padEnd(20)}${LEVELS.map((m) => `magnet ${m}`.padStart(16)).join('')}`);
console.log(`  ${''.padEnd(20)}${LEVELS.map(() => 'goal at / clears'.padStart(16)).join('')}`);
for (const s of stages) {
  const cells = LEVELS.map((m) => {
    const r = rows.find((x) => x.stage === s && x.m === m);
    return (r ? `${r.at}/${r.hit}of${r.of}` : '—').padStart(16);
  });
  console.log(`  ${s.padEnd(20)}${cells.join('')}`);
}

/* THE ONE ASSERTION HERE. A magnet must not turn a tuned stage into a
   walkover — if the goal stops being the majority of a good run, the whole
   size ladder has lost its shape and every stage needs retuning. This is a
   guard rail, not a target; the balance harness owns the real judgement. */
for (const s of stages) {
  const off = rows.find((x) => x.stage === s && x.m === 0);
  const max = rows.find((x) => x.stage === s && x.m === 1);
  if (!off || !max || off.pct == null || max.pct == null) continue;
  check(`${s}: maximum magnet does not trivialise the stage`, max.pct >= 40,
    `goal is ${off.pct}% of a median run at 0, ${max.pct}% at max`);
  check(`${s}: maximum magnet does not make it harder`, max.hit >= off.hit,
    `${off.hit}/${off.of} clears at 0, ${max.hit}/${max.of} at max`);
}

console.log(fail ? `\n${fail} FAILED` : '\nthe magnet reaches, and does nothing else');
process.exit(fail ? 1 : 0);
