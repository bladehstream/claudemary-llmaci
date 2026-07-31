/* ============================================================
   Render-free balance simulation.

   Drives the real Katamari + World physics with a greedy bot
   that steers at the nearest thing it can currently eat, and
   reports the growth curve. This is how the stage timings and
   the packing/pickup constants get tuned — software GL is far
   too slow to learn anything from an actual play session.

   usage:  node tools/balance.mjs [skill] [--only=house,city] [--speed=33] [--runs=5]
           skill 1.0 = perfect routing, 0.6 = fumbling around
           --only   restrict to named stages (default: all three)
           --speed  override stage.speed for the simulated stages, so a
                    candidate movement tuning can be checked against the
                    growth curve before it is written into a stage file
           --runs   seeds per bot (default 5). Read the MEDIAN, not the best:
                    each bot is deterministic per seed, so one run is one
                    path, and a path responds chaotically to tuning changes.
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
import { Katamari, TUNING, stageSpeedFor } from '../src/world/Katamari.js';
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
import { makeRng, formatSize, formatSizeShort, formatTime } from '../src/util/math.js';

const flag = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
const SKILL = parseFloat(process.argv[2]?.startsWith('--') ? '0.82' : process.argv[2] || '0.82');
const DASH = !process.argv.includes('--nodash');
const ONLY = flag('only')?.split(',').map((s) => s.trim()).filter(Boolean) ?? null;
const SPEED = flag('speed') ? parseFloat(flag('speed')) : null;
/* `--time=N` overrides every stage's clock for this run. Added to sweep for the
   clock a stage needs to be fully clearable, rather than guessing a multiplier
   and re-editing eleven files to find out. */
const COLLECT = process.argv.includes('--collect');
const TIMEOVR = (() => {
  const a = process.argv.find((x) => x.startsWith('--time='));
  return a ? parseFloat(a.split('=')[1]) : null;
})();
/** Seeds per bot. One run is one path and a path is a chaotic function of the tuning. */
const RUNS = flag('runs') ? Math.max(1, parseInt(flag('runs'), 10)) : 5;
/* Growth knobs, for answering "how do we make a stage last longer?" without
   editing the game between runs. `packing` is how much of an object's volume
   swells the ball; `pickup` is how big a thing can be relative to you and
   still stick. Lowering either slows growth — but packing also lowers the
   SIZE CEILING (max ball volume = total stage mass x packing) while pickup
   does not, which is usually the deciding difference. */
if (flag('packing')) TUNING.packing = parseFloat(flag('packing'));
if (flag('pickup')) TUNING.pickupRatio = parseFloat(flag('pickup'));
/* Sweep knobs for the speed model. `speedP` is the top-speed exponent; `agility`
   overrides the huge-end accel/brake/turn multiplier (the small end is a fixed
   9.0). `timeMul` and `densityMul` scale every stage's clock and prop count, so
   "does this exponent work if the stage is longer / fuller?" is one run, not an
   edit-measure-revert cycle. */
if (flag('speedP')) TUNING.speedP = parseFloat(flag('speedP'));
if (flag('agility')) {
  const a = parseFloat(flag('agility'));
  TUNING.accelMulHuge = TUNING.brakeMulHuge = TUNING.turnMulHuge = a;
}
const TIME_MUL = flag('timeMul') ? parseFloat(flag('timeMul')) : 1;
const DENSITY_MUL = flag('densityMul') ? parseFloat(flag('densityMul')) : 1;
buildCatalog();

const mat = new THREE.MeshLambertMaterial({ vertexColors: true });

/* How far the targeter may chase, in ball diameters. Infinity reproduces every
   number this harness printed before the flag existed. */
const VISION = (() => {
  const a = process.argv.find((x) => x.startsWith('--vision='));
  return a ? parseFloat(a.split('=')[1]) : Infinity;
})();

/** Speed/weight curves are anchored per stage; mirror what Game.loadStage does. */
function applyStageProfile(kat, stage) {
  const width = stage.bounds.maxX - stage.bounds.minX;
  const span = Math.max(4, (stage.goal * 1.5) / stage.startSize);
  kat.setStageProfile(stage.startSize, SPEED ?? stageSpeedFor(stage), span);
}

function findTarget(world, kat, blacklist, now) {
  const f = world.field;
  const limit = kat.diameter * TUNING.pickupRatio;
  const bottom = kat.pos.y - kat.radius;
  const climb = kat.radius * 1.15;
  let best = -1, bestScore = Infinity;
  for (let i = 0; i < f.n; i++) {
    if (!f.alive[i] || f.pickup[i] > limit) continue;
    if (blacklist.get(i) > now) continue;
    const dx = f.x[i] - kat.pos.x, dz = f.z[i] - kat.pos.z;
    const d = Math.hypot(dx, dz);
    // Things on a ledge you cannot climb yet are a trap — deprioritise hard.
    const rise = f.y[i] - bottom;
    const reachPenalty = rise > climb ? 40 + rise * 12 : 1;
    const gain = f.arch[i].volume;
    // Greedy but sane: maximise volume gained per second of travel, which is
    // roughly what a competent player does — head for the biggest thing you
    // can currently swallow, hoovering up whatever is on the way.
    const travel = d / Math.max(0.2, kat.topSpeed || 1) + 0.6;
    const score = -gain / (travel * reachPenalty);
    if (score < bestScore) { bestScore = score; best = i; }
  }
  return best;
}

/** Total collectable volume in a stage vs what the goal actually requires. */
function massReport(world, stage) {
  const f = world.field;
  let total = 0;
  const bands = new Map();
  for (let i = 0; i < f.n; i++) {
    total += f.arch[i].volume;
    const b = Math.floor(Math.log10(Math.max(1e-6, f.pickup[i])) * 2) / 2;
    bands.set(b, (bands.get(b) || 0) + 1);
  }
  const needVol = (Math.PI / 6) * Math.pow(stage.goal, 3);
  const needProps = needVol / TUNING.packing;
  return { total, needProps, ratio: total / needProps, bands };
}


/** True if an uneatable prop sits at this point — the bot's only obstacle sense. */
function blockedBy(world, kat, px, pz) {
  const f = world.field;
  const limit = kat.diameter * TUNING.pickupRatio;
  let hit = false;
  f.query(px, pz, kat.radius, (i) => {
    if (hit || f.pickup[i] <= limit) return;
    const d = Math.hypot(f.x[i] - px, f.z[i] - pz);
    if (d < kat.radius + f.rad[i] * 0.9) hit = true;
  });
  return hit;
}

/**
 * Time between pickups for a player who actually aims at things.
 * Blind-sweep area coverage badly underestimates this: what matters is how
 * far you travel to the NEXT collectable, which for a Poisson-ish scatter of
 * density n props/m2 is about 0.5/sqrt(n). Above ~2.5s per pickup a stage
 * feels like an empty car park.
 */
function densityReport(world, stage) {
  const f = world.field;
  const area = (stage.bounds.maxX - stage.bounds.minX) * (stage.bounds.maxZ - stage.bounds.minZ);
  const rows = [];
  let D = stage.startSize;
  while (D <= stage.goal * 1.15) {
    const limit = D * TUNING.pickupRatio;
    let n = 0;
    for (let i = 0; i < f.n; i++) if (f.pickup[i] <= limit && f.pickup[i] > limit / 12) n++;
    const dens = n / area;
    const width = stage.bounds.maxX - stage.bounds.minX;
    const v0 = stageSpeedFor(stage);
    const v = v0 * Math.pow(Math.max(1, D / stage.startSize), TUNING.speedP);
    const secs = dens > 0 ? 0.5 / (Math.sqrt(dens) * v) : Infinity;
    rows.push(`${formatSizeShort(D, stage.unit)}:${secs > 99 ? '--' : secs.toFixed(1)}s`);
    D *= 2.6;
  }
  return rows.join('  ');
}

function run(stage, seed = 99) {
  const world = new World(mat).build(stage);
  const kat = new Katamari(mat, stage.startSize / 2);
  applyStageProfile(kat, stage);
  const rng = makeRng(seed);
  const spawnY = world.groundAt(stage.spawn.x, stage.spawn.z);
  kat.reset(stage.startSize / 2, new THREE.Vector3(stage.spawn.x, spawnY, stage.spawn.z));
  const f = world.field;

  const H = 1 / 60;
  let t = 0, target = -1, retarget = 0, heading = 0;
  const marks = [];
  const blacklist = new Map();
  let nextMark = 30, goalAt = null;
  let stalls = 0, escapeUntil = 0;
  let lastX = kat.pos.x, lastZ = kat.pos.z, check = 0;

  /** Best value-per-second-of-travel prop we can currently swallow.
   *
   * SEARCHED LOCALLY FIRST, and that is not a detail. Value scales with the
   * cube of size, so a plain volume/travel-time score will send the bot across
   * the entire map for one big prize and ignore the hundred things it is
   * standing in — an 85x volume edge beats a 60x travel penalty every time.
   * In a 26m room that produced a bimodal outcome: runs either happened to
   * beeline past enough clutter to grow, or shuttled between two far prizes
   * and finished at the starting size. Medians then flipped across the gap on
   * a 25% speed change, which is not a property of the game.
   *
   * Players hoover what is near them and only range far when the local stuff
   * is gone, so: consider only what is within `NEAR` ball-diameters, widening
   * until something turns up. */
  const NEAR = 24;
  /**
   * `--vision=N` caps how far the bot may chase, in ball diameters.
   *
   * WITHOUT it the ring search has an escape hatch: at ring 8 the distance
   * filter is dropped entirely, so the bot always finds something SOMEWHERE on
   * the map and drives straight to it with perfect knowledge. That is the
   * single largest reason its numbers do not describe a person. A player
   * hoovers what is around them and wanders when it runs out; they do not
   * teleport their attention to the best remaining prop two hundred diameters
   * away.
   *
   * With a finite vision the bot returns -1 when nothing is in range, and the
   * main loop already responds to that by picking a random heading — which is
   * exactly what wandering looks like. Default is Infinity, so every number
   * this harness has ever printed still reproduces.
   */
  function pickTarget() {
    const limit = kat.diameter * TUNING.pickupRatio;
    const bottom = kat.pos.y - kat.radius;
    const climb = kat.radius * 1.15;
    const v = Math.max(0.2, kat.topSpeed || 1);
    const cap = kat.diameter * VISION;
    for (let ring = 1; ring <= 8; ring++) {
      const reach = Math.min(kat.diameter * NEAR * ring, cap);
      let best = -1, bestScore = 0;
      for (let i = 0; i < f.n; i++) {
        if (!f.alive[i] || f.pickup[i] > limit) continue;
        if (blacklist.get(i) > t) continue;
        const d = Math.hypot(f.x[i] - kat.pos.x, f.z[i] - kat.pos.z);
        if (d > reach && (ring < 8 || isFinite(VISION))) continue;
        const rise = f.y[i] - bottom;
        const pen = rise > climb ? 30 + rise * 10 : 1;
        /* `--collect` drops the volume term, turning the value-maximiser into a
           completionist that always takes the NEAREST edible thing.
           Why it exists: "props left" was being read as a clear rate and it is
           not one. The targeter chases volume, so it skips tiny props on
           purpose — it left 39% of the quantum realm behind and doubling the
           clock did not change that by a single prop, because those props were
           never worth its time. A player trying to empty a stage behaves like
           this instead, and a human did clear the atom stage far closer to
           fully than this bot's 72% suggested was possible. */
        const score = (COLLECT ? 1 : f.arch[i].volume) / ((d / v + 0.6) * pen);
        if (score > bestScore) { bestScore = score; best = i; }
      }
      if (best >= 0) return best;
      // Once the rings have grown past what can be seen, widening is pointless.
      if (kat.diameter * NEAR * ring >= cap) break;
    }
    return -1;
  }

  /** True if an uneatable prop sits at this probe point. */
  function blocked(px, pz) {
    const limit = kat.diameter * TUNING.pickupRatio;
    let hit = false;
    f.query(px, pz, kat.radius, (i) => {
      if (hit || f.pickup[i] > 1e9 || f.pickup[i] <= limit) return;
      if (Math.hypot(f.x[i] - px, f.z[i] - pz) < kat.radius + f.rad[i] * 0.85) hit = true;
    });
    return hit;
  }

  while (t < stage.time) {
    if (t >= check) {
      const moved = Math.hypot(kat.pos.x - lastX, kat.pos.z - lastZ);
      // Measured against topSpeed: a large katamari covers well under one
      // diameter per second, so a diameter-based stall test is always true
      // and quietly degrades the bot into a random walk.
      if (moved < kat.topSpeed * 0.5 * 0.3) {
        stalls++;
        escapeUntil = t + 1.0 + rng() * 1.0;
        if (stalls >= 3 && target >= 0) { blacklist.set(target, t + 20); target = -1; stalls = 0; }
      } else stalls = 0;
      lastX = kat.pos.x; lastZ = kat.pos.z; check = t + 0.5;
    }
    if (t >= retarget || target < 0 || !f.alive[target]) {
      target = pickTarget();
      retarget = t + Math.max(0.15, Math.min(0.6, kat.diameter / Math.max(1, kat.topSpeed)));
    }

    if (target >= 0) {
      const want = Math.atan2(f.z[target] - kat.pos.z, f.x[target] - kat.pos.x)
        + (1 - SKILL) * (rng() - 0.5) * 1.0;
      const R = kat.radius, bottom = kat.pos.y - R, climb = R * 1.15;
      let bestA = want, bestS = -Infinity;
      for (let k = 0; k < 16; k++) {
        const a = want + (k / 16) * Math.PI * 2;
        const ca = Math.cos(a), sa = Math.sin(a);
        let clear = 0;
        for (let step = 1; step <= 3; step++) {
          const px = kat.pos.x + ca * R * 2.4 * step, pz = kat.pos.z + sa * R * 2.4 * step;
          if (!world.canOccupy(px, pz, bottom, climb) || blocked(px, pz)) break;
          clear = step;
        }
        const align = Math.cos(a - want);
        const s = clear * 2.0 + align * 2.2 + (t < escapeUntil ? -align * 4.0 : 0);
        if (s > bestS) { bestS = s; bestA = a; }
      }
      heading = bestA;
    } else if (t >= retarget) heading = rng() * Math.PI * 2;

    kat.step(H, { moveX: Math.cos(heading), moveZ: Math.sin(heading), dash: rng() < 0.5 }, 0, world);
    world.resolve(kat, H, rng);
    world.time += H;
    t += H;

    if (t >= nextMark) { marks.push({ t: nextMark, d: kat.diameter, n: kat.collectedCount }); nextMark += 30; }
    if (!goalAt && kat.diameter >= stage.goal) goalAt = t;
  }
  return { world, kat, marks, goalAt, seed };
}


/** Second strategy: lawnmower sweeping with heading momentum. Wins in big
    open stages where committing to a direction beats chasing individual props. */
function runSweeper(stageIn, seed = 7) {
  const stage = TIMEOVR ? { ...stageIn, time: TIMEOVR } : stageIn;
  const world = new World(mat).build(stage);
  const kat = new Katamari(mat, stage.startSize / 2);
  applyStageProfile(kat, stage);
  const rng = makeRng(seed);
  kat.reset(stage.startSize / 2, new THREE.Vector3(stage.spawn.x, world.groundAt(stage.spawn.x, stage.spawn.z), stage.spawn.z));
  const f = world.field;
  const H = 1 / 60;
  let t = 0, heading = rng() * Math.PI * 2, repick = 0, stalls = 0;
  let knocks = 0, knockLost = 0, slow = 0;
  let lastX = kat.pos.x, lastZ = kat.pos.z, check = 0;
  const marks = []; let nextMark = 30, goalAt = null;

  function chooseHeading(panic) {
    const limit = kat.diameter * TUNING.pickupRatio;
    const reach = Math.max(kat.diameter * 14, 8);
    const bins = new Float64Array(24);
    f.query(kat.pos.x, kat.pos.z, reach, (i) => {
      if (f.pickup[i] > limit) return;
      const dx = f.x[i] - kat.pos.x, dz = f.z[i] - kat.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > reach || d < 1e-4) return;
      const b = ((Math.atan2(dz, dx) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2) * 24 | 0;
      const w = f.arch[i].volume / (d + kat.diameter);
      for (let k = -3; k <= 3; k++) bins[(b + k + 24) % 24] += w * (1 - Math.abs(k) * 0.22);
    });
    let best = -1, bestV = -1;
    for (let b = 0; b < 24; b++) {
      const a = (b / 24) * Math.PI * 2;
      const jitter = 1 + (rng() - 0.5) * (1 - SKILL) * 3;
      const keep = panic ? -0.9 : 0.85;
      const v = bins[b] * jitter * (1 + keep * Math.cos(a - heading));
      if (v > bestV) { bestV = v; best = b; }
    }
    if (bestV <= 0) return rng() * Math.PI * 2;
    return (best / 24) * Math.PI * 2 + (rng() - 0.5) * 0.25;
  }

  while (t < stage.time) {
    if (t >= check) {
      const moved = Math.hypot(kat.pos.x - lastX, kat.pos.z - lastZ);
      if (moved < kat.topSpeed * 0.5 * 0.3) {
        stalls++;
        heading = stalls > 1 ? rng() * Math.PI * 2 : heading + Math.PI * (0.6 + rng() * 0.8);
        repick = t + 1.2;
      } else stalls = 0;
      lastX = kat.pos.x; lastZ = kat.pos.z; check = t + 0.5;
    }
    if (t >= repick) {
      heading = chooseHeading(false);
      // Re-decide after a fixed DISTANCE, not a fixed time. A wall-clock
      // interval means a fast katamari commits to a heading for 150m and
      // sails past everything, which reads as "the stage got harder" when
      // really the bot just got blinder.
      const travel = Math.max(kat.diameter * 2.5, 12);
      repick = t + Math.max(0.5, travel / Math.max(1, kat.topSpeed)) * (1 + rng() * 0.6);
    }
    kat.step(H, { moveX: Math.cos(heading), moveZ: Math.sin(heading), dash: DASH && rng() < 0.5 }, 0, world);
    for (const ev of world.resolve(kat, H, rng)) if (ev.type === 'knock') { knocks++; knockLost += ev.count; }
    if (kat.speedFrac < 0.15) slow += H;
    world.time += H; t += H;
    if (t >= nextMark) { marks.push({ t: nextMark, d: kat.diameter, n: kat.collectedCount }); nextMark += 30; }
    if (!goalAt && kat.diameter >= stage.goal) goalAt = t;
  }
  return { world, kat, marks, goalAt, knocks, knockLost, slow, seed };
}


console.log(`skill = ${SKILL}   runs = ${RUNS}   vision = ${isFinite(VISION) ? VISION + " diameters" : "unlimited"}${SPEED ? `   speed override = ${SPEED} m/s` : ""}\n`);
for (const stage of [quantumStage, atomStage, microbeStage, houseStage, townStage, cityStage, countryStage, worldStage, solarStage, galaxyStage, universeStage].filter((s) => !ONLY || ONLY.includes(s.id))) {
  const t0 = Date.now();
  if (TIME_MUL !== 1) stage.time = Math.round(stage.time * TIME_MUL);
  if (DENSITY_MUL !== 1) stage.density = (stage.density ?? 1) * DENSITY_MUL;
  if (flag('goal')) stage.goal = parseFloat(flag('goal'));

  /* Both bots are fully deterministic given a seed, so a single run is a
     single path through the stage — and a path is a chaotic function of the
     tuning. One sweeper seed returned 265m in the city while a 25% speed
     change dropped the same seed to 90m; that is the bot finding or missing
     a good lap, not the stage becoming harder. So: several seeds, and judge
     by MEDIAN.

     Judge each bot SEPARATELY and then take the better one. Pooling both
     bots' runs into one median is meaningless, because on every stage one of
     them is simply unsuited to the shape — the lawnmower is hopeless in a
     26m room, the targeter is hopeless across a 1km city — and pooling drags
     the median down to "half the strategies are bad", which was always true
     and says nothing about whether the goal is fair. */
  const seeds = Array.from({ length: RUNS }, (_, i) => 7 + i * 1013);
  const runsA = seeds.map((s) => run(stage, s + 92));
  const runsB = seeds.map((s) => runSweeper(stage, s));
  const bestOf = (rs) => rs.reduce((p, c) => (c.kat.diameter > p.kat.diameter ? c : p));
  const median = (rs) => [...rs].sort((x, y) => x.kat.diameter - y.kat.diameter)[rs.length >> 1];
  const a = bestOf(runsA), b = bestOf(runsB);
  const medA = median(runsA), medB = median(runsB);
  const useB = medB.kat.diameter > medA.kat.diameter;
  const which = useB ? 'sweeper' : 'targeter';
  const strat = useB ? runsB : runsA;
  const best = bestOf(strat);
  const med = useB ? medB : medA;
  const { world, kat, marks, goalAt } = best;
  const simMs = Date.now() - t0;
  console.log(`=== ${stage.name} ===`);
  const mass = massReport(world, stage);
  console.log(`  props in stage : ${world.totalProps}`);
  console.log(`  start / goal   : ${formatSizeShort(stage.startSize, stage.unit)} -> ${formatSizeShort(stage.goal, stage.unit)} in ${formatTime(stage.time)}`);
  console.log(`  mass available : ${mass.total.toFixed(1)} m3 vs ${mass.needProps.toFixed(1)} m3 needed  (${mass.ratio.toFixed(2)}x headroom)`);
  {
    const sizes = [...new Set(Array.from({ length: world.field.n }, (_, i) => +world.field.pickup[i].toFixed(4)))].sort((x, y) => x - y);
    const gaps = [];
    for (let i = 1; i < sizes.length; i++) {
      if (sizes[i] / sizes[i - 1] > 1.55 && sizes[i - 1] > stage.startSize * 0.4 && sizes[i - 1] < stage.goal * 1.4) {
        gaps.push(`${formatSizeShort(sizes[i - 1], stage.unit)}->${formatSizeShort(sizes[i], stage.unit)}`);
      }
    }
    console.log(`  ladder gaps    : ${gaps.length ? gaps.join(', ') : 'none'}`);
  }
  {
    /* TOO BIG TO EVER COLLECT.
     *
     * `ladder gaps` checks that the sizes present in a stage step up smoothly.
     * It cannot see this: an object at the TOP of the ladder that no achievable
     * katamari can swallow, because a prop needs a ball of `pickup /
     * pickupRatio` and the biggest ball that can ever exist is set by the same
     * stage's total mass. The two numbers are authored independently, so they
     * can and do cross.
     *
     * Reported twice by players before this line existed. The city shipped with
     * two mountains at a pickup of 287m against a 272m ceiling, which stood
     * there at the end of every run. Then the world stage shipped with a
     * continent needing 2937km against a reachable 2518km, and the report was
     * "the world scenario can't be completed because there's one island that's
     * impossible to stick even when everything else is captured" — which is
     * exactly what it is, and it looks like a physics bug rather than an
     * arithmetic error in one landmark.
     *
     * The ceiling is measured WITHOUT the object in question, since you have to
     * be big enough before you can eat it and it cannot contribute to that. */
    const f = world.field;
    let total = 0;
    for (let i = 0; i < f.n; i++) total += f.arch[i].volume;
    const diaOf = (vol) => Math.cbrt((6 * vol) / Math.PI);
    const bad = new Map();
    for (let i = 0; i < f.n; i++) {
      const reachable = diaOf((total - f.arch[i].volume) * TUNING.packing);
      const needs = f.pickup[i] / TUNING.pickupRatio;
      if (needs <= reachable) continue;
      const prev = bad.get(f.arch[i].id);
      if (!prev || needs > prev.needs) bad.set(f.arch[i].id, { needs, reachable, pickup: f.pickup[i] });
    }
    console.log(`  size ceiling   : ${formatSizeShort(diaOf(total * TUNING.packing), stage.unit)}`
      + `   (eat everything and this is how big you get)`);
    if (!bad.size) {
      console.log('  too big to ever collect : none');
    } else {
      console.log(`  TOO BIG TO EVER COLLECT : ${bad.size} kind(s) — THIS STAGE CANNOT BE CLEARED`);
      for (const [id, b] of [...bad].sort((x, y) => y[1].needs - x[1].needs).slice(0, 5)) {
        console.log(`      ${id.padEnd(18)} pickup ${formatSizeShort(b.pickup, stage.unit).padStart(10)}`
          + `  needs ${formatSizeShort(b.needs, stage.unit).padStart(10)}`
          + `  most you can be ${formatSizeShort(b.reachable, stage.unit)}`);
      }
    }
  }
  console.log(`  pickup density : ${densityReport(world, stage)}`);
  console.log(`  best strategy  : ${which}  (targeter median ${formatSizeShort(medA.kat.diameter, stage.unit)} / best ${formatSizeShort(a.kat.diameter, stage.unit)};  sweeper median ${formatSizeShort(medB.kat.diameter, stage.unit)} / best ${formatSizeShort(b.kat.diameter, stage.unit)})`);
  console.log(`  ${which} runs : ${[...strat].sort((x, y) => x.kat.diameter - y.kat.diameter).map((r) => `${formatSizeShort(r.kat.diameter, stage.unit)}(#${r.seed})`).join('  ')}`);
  console.log(`  curve (best)   : ${marks.filter((_, i) => i % 2 === 0).map((m) => `${formatTime(m.t)}=${formatSizeShort(m.d, stage.unit)}`).join('  ')}`);
  console.log(`  goal reached   : ${goalAt ? formatTime(goalAt) : 'NEVER'}  (${strat.filter((r) => r.goalAt).length}/${strat.length} ${which} runs reached it)`);
  console.log(`  final          : best ${formatSize(best.kat.diameter, stage.unit)} (${(best.kat.diameter / stage.goal).toFixed(2)}x goal)   MEDIAN ${formatSize(med.kat.diameter, stage.unit)} (${(med.kat.diameter / stage.goal).toFixed(2)}x goal)`);
  console.log(`  goal is        : ${(stage.goal / med.kat.diameter * 100).toFixed(0)}% of the median run  (target 60-75%)`);
  console.log(`  objects        : ${kat.collectedCount} collected, ${kat.uniqueIds.size} kinds`);
  console.log(`  props left     : ${world.field.liveCount} of ${world.totalProps}`);
  if (best.knocks !== undefined) {
    console.log(`  knock-offs     : ${best.knocks} events, ${best.knockLost} objects lost`);
    console.log(`  time near-stopped: ${(best.slow / stage.time * 100).toFixed(0)}%`);
  }
  console.log(`  sim wall time  : ${simMs}ms\n`);
}
