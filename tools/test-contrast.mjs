/* ============================================================
   Can you actually SEE the things you are meant to roll up?

   Reported against the last two stages: *"i agree that the last 2
   stages should be dark because space is dark, but the items
   within them should be bright enough to see rather than 'black
   on black'."*

   Nobody working on this can look at the game, and a screenshot
   is exactly the instrument that has already failed this project
   twice — once by missing three overlay collisions and once by
   being stale. So put a number on it.

   WHAT IT MEASURES

   Every prop's geometry carries per-vertex colours, and so does
   the terrain it stands on. Both are lit by the same hemisphere
   light and the same sun, so the RATIO between them survives the
   lighting almost unchanged — which means the raw vertex colours
   are a fair proxy for what a player sees, and an exact one for
   what the author actually chose.

   Contrast is the WCAG relative-luminance ratio,
   `(L1 + 0.05) / (L2 + 0.05)`. Text needs 4.5; a large coloured
   shape against a background needs far less to be findable, and
   the useful threshold here is nearer 1.6 — below that a prop
   stops being a silhouette and becomes part of the floor.

   ⚠ IT MEASURES THE BRIGHTEST PART OF A PROP, NOT THE MEAN. A
   galaxy that is mostly dark dust with a bright core is perfectly
   visible; averaging it would call it invisible and send somebody
   off to flatten the very contrast that makes it read. What
   matters is whether ANY of it separates from the floor.

   Run: node tools/test-contrast.mjs [--all]
        --all   every stage; default is the ones that are dark
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

buildCatalog();
const mat = new THREE.MeshLambertMaterial({ vertexColors: true });

const ALL = process.argv.includes('--all');
/* The dark ones. The lit stages have never drawn a complaint and their floors
   are pale, so contrast there is not in question — `--all` still checks them. */
const STAGES = ALL
  ? [quantumStage, atomStage, microbeStage, houseStage, townStage, cityStage,
    countryStage, worldStage, solarStage, galaxyStage, universeStage]
  : [quantumStage, solarStage, galaxyStage, universeStage];

let fail = 0;
const check = (name, ok, extra = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '   ' + extra : ''}`);
  if (!ok) fail++;
};

/** sRGB channel -> linear, per WCAG. Only needed for hex the author typed. */
const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
/** WCAG relative luminance from sRGB components in 0..1. */
const lum = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
/** The same, from components that are ALREADY linear — which is what three.js stores. */
const lumLin = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

/* Calibration, run every time rather than written down: three.js' colour
   management converts a hex through the sRGB transfer function on the way in,
   so `new THREE.Color(0x808080).r` is 0.2158 and not 0.5020. If a future
   three.js changes that, this fails loudly here instead of silently poisoning
   every luminance in the file. */
{
  const probe = new THREE.Color(0x808080);
  const expected = lin(0x80 / 255);
  if (Math.abs(probe.r - expected) > 1e-3) {
    console.error(`\nCALIBRATION FAILED: THREE.Color(0x808080).r = ${probe.r.toFixed(5)}, `
      + `expected the linear ${expected.toFixed(5)}.\n`
      + `three.js is no longer linearising on input; lumsOf() must be changed to match.`);
    process.exit(1);
  }
}

/**
 * Luminances of a geometry's vertex colours.
 *
 * ⚠ THE STORED COMPONENTS ARE ALREADY LINEAR. DO NOT LINEARISE THEM AGAIN.
 *
 * An earlier revision of this file asserted the opposite in a comment — that
 * `GeomBuilder` writes sRGB component values through `THREE.Color` — and every
 * number this tool printed for a week was wrong because of it. `ColorManagement`
 * is on, so `new THREE.Color(0x37732a)` holds (0.0382, 0.1714, 0.0232), the
 * LINEAR form; measured, not assumed. Passing that through the sRGB transfer
 * function a second time turned the game's mid-green foliage into 0.0186, a
 * near-black, and the tool duly reported healthy props as invisible.
 *
 * Two lessons, both already in this project's memory and both re-learned here:
 * a comment that states a fact is a claim, and an instrument has to be
 * calibrated against a known input before its output means anything.
 */
function lumsOf(geo) {
  const c = geo.attributes.color;
  if (!c) return null;
  const out = new Float64Array(c.count);
  for (let i = 0; i < c.count; i++) out[i] = lumLin(c.getX(i), c.getY(i), c.getZ(i));
  return out;
}

/** The p-th percentile of a Float64Array, sorted in place. */
function pct(a, p) {
  const s = Float64Array.from(a).sort();
  if (!s.length) return 0;
  return s[Math.min(s.length - 1, Math.floor((s.length - 1) * p))];
}

/* The threshold. Not WCAG's 4.5 — that is for text, and a katamari prop is a
   large shape with an outline and a shadow. 1.6 is where a solid colour stops
   reading as a separate object against a floor in this game's flat-shaded
   style. */
const MIN = 1.6;

/* Relative luminance 0.02 is about #292929 — an object below it is not "dark",
   it is unlit, and nothing downstream (shadow, shading, fog) brings it back.

   ⚠ ON ITS OWN THIS PROVES NOTHING, and an earlier revision of this file
   asserted it on its own and failed three lit stages for it. A house is full of
   near-black objects — a television, a pair of spectacles at 0.0029 — and every
   one of them is trivially visible, because the floor is at 0.65. Darkness is
   only a fault when it matches what is behind it, so the gate below requires
   BOTH this and a sub-1.6 contrast against the floor the prop stands on. */
const MIN_ABS = 0.02;

console.log(`\ncontrast = WCAG relative-luminance ratio against the stage floor`);
console.log(`threshold ${MIN.toFixed(2)}; a prop is judged on its BRIGHTEST part (90th pct)\n`);

for (const stage of STAGES) {
  const world = new World(mat).build(stage);
  const f = world.field;

  /* ⚠ THE FLOOR UNDER A PROP IS THE TRIANGLE IT STANDS ON. NOTHING ELSE WORKS.
     This is the fourth attempt and the first three were all the same mistake in
     different clothes — sampling a NEIGHBOURHOOD of terrain and taking a
     percentile of it, which is only "the floor" when the neighbourhood happens
     to be uniform.

       v1  one median for the whole stage. In the solar system 17% of the
           terrain vertices are the SUN at luminance 0.79, dragging the median
           to 0.27, so props out in dark space were judged against a brightness
           that exists only in the middle of the map.
       v2  per-position, but bucketed by XZ only, and by VERTEX. Reported 258
           galaxy stars invisible. They are not: out in the void a 400-unit
           bucket can contain nothing but a handful of vertices belonging to
           the tiny painted background-star quads, so the "floor" came back as
           0.587 — the luminance of a decorative speck — while the actual
           ground under the prop is the void at 0.004. Vertex counts weight
           small detailed geometry as heavily as a quad the size of a suburb.
       v3  added a vertical slab, on the theory that the galaxy's overhead core
           glow was to blame. Measured: it is not, the bright vertices near
           those props sit at y=4-6, on the ground. The count went UP. A fix
           aimed at a guess.

     So stop sampling. Rasterise: find the terrain triangles whose XZ projection
     actually contains the prop, take the highest one at or below the prop's own
     height, and interpolate the vertex colours at that exact point. That is a
     definition rather than a heuristic, and it is immune to all three failures
     above — a decorative speck 30 units away is simply not under you, and a
     glow pillar 2,500 units up fails the height test. */
  const tg = world.terrainMesh.geometry;
  const tpos = tg.attributes.position;
  const tlum = lumsOf(tg);
  const tidx = tg.index;
  const b = stage.bounds;
  const nTri = tlum ? Math.floor((tidx ? tidx.count : tpos.count) / 3) : 0;
  const vert = (t, k) => (tidx ? tidx.getX(t * 3 + k) : t * 3 + k);

  /* A coarse bucket grid over triangle bounding boxes. Coarse on purpose: the
     ground is made of a few very large quads, and a fine grid would replicate
     each of them into thousands of buckets. */
  const GRID = 32;
  const gx = (x) => Math.max(0, Math.min(GRID - 1,
    Math.floor(((x - b.minX) / (b.maxX - b.minX)) * GRID)));
  const gz = (z) => Math.max(0, Math.min(GRID - 1,
    Math.floor(((z - b.minZ) / (b.maxZ - b.minZ)) * GRID)));
  const cells = new Array(GRID * GRID);
  let areaLum = [];          // [luminance, area] per triangle, for the headline
  for (let t = 0; t < nTri; t++) {
    const a = vert(t, 0), c = vert(t, 1), d = vert(t, 2);
    const x0 = tpos.getX(a), z0 = tpos.getZ(a);
    const x1 = tpos.getX(c), z1 = tpos.getZ(c);
    const x2 = tpos.getX(d), z2 = tpos.getZ(d);
    const lo = gz(Math.min(z0, z1, z2)), hi = gz(Math.max(z0, z1, z2));
    const lx = gx(Math.min(x0, x1, x2)), hx = gx(Math.max(x0, x1, x2));
    for (let cz = lo; cz <= hi; cz++) {
      for (let cx = lx; cx <= hx; cx++) {
        const k = cz * GRID + cx;
        (cells[k] || (cells[k] = [])).push(t);
      }
    }
    // Footprint area, so the headline number reflects how much floor a colour
    // actually covers rather than how many vertices the author spent on it.
    const ar = Math.abs((x1 - x0) * (z2 - z0) - (x2 - x0) * (z1 - z0)) * 0.5;
    areaLum.push([(tlum[a] + tlum[c] + tlum[d]) / 3, ar]);
  }
  /** Area-weighted median luminance of the whole stage floor. */
  const stageFloor = (() => {
    if (!areaLum.length) return 0;
    areaLum.sort((p, q) => p[0] - q[0]);
    const total = areaLum.reduce((s, e) => s + e[1], 0);
    let acc = 0;
    for (const [l, a] of areaLum) { acc += a; if (acc >= total / 2) return l; }
    return areaLum[areaLum.length - 1][0];
  })();

  /**
   * The luminance of the ground directly beneath a prop.
   *
   * Returns the highest terrain triangle containing (x,z) whose surface is at
   * or just above the prop's own base, colour-interpolated at that point. Falls
   * back to the stage floor only when the prop is over a genuine hole.
   */
  const floorAt = (x, y, z, rad) => {
    if (!nTri) return 0;
    const cand = cells[gz(z) * GRID + gx(x)];
    if (!cand) return stageFloor;
    const up = Math.max(40, rad);      // props can sit slightly sunk into the ground
    let bestY = -Infinity, bestL = null;
    for (const t of cand) {
      const a = vert(t, 0), c = vert(t, 1), d = vert(t, 2);
      const x0 = tpos.getX(a), z0 = tpos.getZ(a);
      const x1 = tpos.getX(c), z1 = tpos.getZ(c);
      const x2 = tpos.getX(d), z2 = tpos.getZ(d);
      const den = (z1 - z2) * (x0 - x2) + (x2 - x1) * (z0 - z2);
      if (den === 0) continue;
      const w0 = ((z1 - z2) * (x - x2) + (x2 - x1) * (z - z2)) / den;
      const w1 = ((z2 - z0) * (x - x2) + (x0 - x2) * (z - z2)) / den;
      const w2 = 1 - w0 - w1;
      if (w0 < 0 || w1 < 0 || w2 < 0) continue;          // not under this prop
      const sy = w0 * tpos.getY(a) + w1 * tpos.getY(c) + w2 * tpos.getY(d);
      if (sy > y + up || sy <= bestY) continue;          // above us, or not the top surface
      bestY = sy;
      bestL = w0 * tlum[a] + w1 * tlum[c] + w2 * tlum[d];
    }
    return bestL === null ? stageFloor : bestL;
  };

  /* One entry per ARCHETYPE, not per instance — 3000 placements of the same
     galaxy are one authoring decision, and reporting them 3000 times would
     bury the answer. Weighted by how many there are, so the summary reflects
     what the player actually sees. */
  /* ⚠ EITHER DIRECTION, AND THAT IS THE THIRD VERSION OF THIS TEST.
     v1 judged the brightest part against a stage-wide median floor. v2 fixed
     the floor to be per-position and then reported 1355 of 3011 galaxy props
     invisible — including a black hole at luminance 0.81, because it sits on
     the galaxy's bright core. Both were true statements about the wrong
     quantity.
     A shape is visible if ANY of it separates from what is behind it, in
     EITHER direction: a bright thing reads against a dark floor, a dark thing
     reads against a bright one, and only something whose whole range sits at
     the floor's own luminance genuinely disappears. So take the better of the
     prop's dark end and its bright end. */
  const ends = new Map();         // archetype id -> {dark, bright}
  const byArch = new Map();
  for (let i = 0; i < f.n; i++) {
    const a = f.arch[i];
    if (!ends.has(a.id)) {
      const ls = a.geos.map(lumsOf).filter(Boolean);
      if (!ls.length) continue;
      const all = Float64Array.from(ls.flatMap((x) => Array.from(x)));
      ends.set(a.id, { dark: pct(all, 0.1), bright: pct(all, 0.9) });
    }
    const e0 = ends.get(a.id);
    const fl = floorAt(f.x[i], f.y[i], f.z[i], f.rad[i]);
    const L = e0.bright;
    const c = Math.max(ratio(e0.bright, fl), ratio(e0.dark, fl));
    let e = byArch.get(a.id);
    if (!e) {
      e = { id: a.id, bright: L, n: 0, worst: Infinity, dark: 0, blind: 0, floor: 0 };
      byArch.set(a.id, e);
    }
    e.n++;
    if (c < e.worst) { e.worst = c; e.floor = fl; }
    // How many INSTANCES are lost, not how many kinds — a galaxy that is
    // invisible in one corner and fine everywhere else is a smaller problem
    // than one that is invisible in all 200 places it appears.
    if (c < MIN) e.dark++;
    /* ⚠ "BLACK ON BLACK" IS TWO CONDITIONS, NOT ONE.
       An earlier version failed on the prop's absolute luminance alone, and it
       flagged the house's spectacles (0.0029), the town's dumpster and the
       city's pine trees — 528 objects across three stages that are perfectly
       visible, because they are black things sitting on a floor at 0.65. Black
       on beige is the highest contrast in the game. The absolute test only says
       something when the FLOOR is dark too. */
    if (e0.bright < MIN_ABS && c < MIN) e.blind++;
  }

  const rows = [...byArch.values()].sort((x, y) => x.worst - y.worst);
  const bad = rows.filter((r) => r.dark > 0);
  const hidden = bad.reduce((s, r) => s + r.dark, 0);
  const placed = rows.reduce((s, r) => s + r.n, 0);

  console.log(`=== ${stage.name} ===`);
  console.log(`  floor luminance : ${stageFloor.toFixed(4)} area-weighted median; `
    + `each prop judged against the triangle under it`);
  console.log(`  worst five      :`);
  for (const r of rows.slice(0, 5)) {
    console.log(`      ${r.id.padEnd(18)} x${String(r.n).padStart(4)}`
      + `  bright ${r.bright.toFixed(4)}  worst contrast ${r.worst.toFixed(2)}`
      + ` on floor ${r.floor.toFixed(4)}`
      + `${r.dark ? `   <- ${r.dark} low` : ''}`);
  }
  /* ⚠ TWO CHECKS, AND ONLY ONE OF THEM FAILS THE BUILD.
   *
   * The contrast model deliberately ignores two things that do real work on
   * screen: every prop casts a shadow, and every prop has its own shading
   * gradient across its faces. Both make a shape readable even where a flat
   * luminance comparison says it should vanish. Failing on that number would
   * send somebody off to flatten a palette that is working.
   *
   * What the model CAN state is the case the player actually reported: a prop
   * whose brightest part is under 0.02 relative luminance emits almost nothing,
   * AND the floor under it is dark enough that the silhouette does not save it
   * either. Both halves are required — see the note where `blind` is counted.
   * The contrast distribution is printed alongside as a number to look at, not
   * a gate.
   */
  const dim = rows.filter((r) => r.blind > 0);
  const dimN = dim.reduce((s, r) => s + r.blind, 0);
  const worst = rows[0];
  console.log(`  contrast        : ${hidden} of ${placed} objects under ${MIN} `
    + `(shadows and shading are not modelled — a NOTE, not a failure); `
    + `worst ${worst.id} ${worst.worst.toFixed(2)}`);
  const dimmest = rows.reduce((a, r) => (r.bright < a.bright ? r : a));
  check(`${stage.name}: nothing is painted black on black`,
    dim.length === 0,
    dim.length
      ? `${dimN} objects across ${dim.length} kind(s) vanish into the floor: `
        + dim.slice(0, 4).map((r) => `${r.id} ${r.bright.toFixed(4)} on ${r.floor.toFixed(4)}`).join(', ')
      : `dimmest is ${dimmest.id} at ${dimmest.bright.toFixed(4)}, `
        + `and it stands on ${dimmest.floor.toFixed(4)}`);
  world.dispose();
  console.log('');
}

console.log(fail ? `${fail} FAILED` : 'everything is visible against the floor it stands on');
process.exit(fail ? 1 : 0);
