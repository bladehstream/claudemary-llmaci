/* ============================================================
   Props for The World.  400km -> 12,800km.

   This is PHYSICAL GEOGRAPHY, from a city and a waterfall at the
   bottom to the planet itself at the top. Nothing in space,
   nothing in orbit, no other worlds: the only things above the
   ground are weather, because weather is part of a landscape.

   ONE WORLD UNIT IS 250 KILOMETRES, and that is a DISPLAY
   CONVENTION ONLY (`unit: 'planet'`). It tells the HUD and the
   collection log how to print a number and nothing else; every
   dimension below is a plain number in the same band the physics
   was tuned in, exactly as the house is authored in metres. See
   the note above TIERS in util/math.js for why authoring in true
   metres breaks instead of being purer.

   The ratio is chosen so the stage's GOAL is Earth: the goal of
   51.2 units is 12,800km against a real 12,742km. The rung at
   the very top of the ladder is therefore the planet, and eating
   it is the last thing that happens in the stage.

   Everything here is a SCENERY PIECE, not a model. The camera
   sits hundreds of units back, so a waterfall is a notch, a
   white sheet and a plunge pool; a forest is a mass of canopy
   blobs on a floor patch; a continent is a shaped slab with
   biomes painted on it. Segment counts stay at 6-13 because the
   stage carries ~2,800 of these at once and silhouette plus
   colour is all that survives the trip.

   SIZING. `pickup` is the cube root of the bounding box, so a
   rung is set by the box and not by how much detail is on it.
   Every build below takes its whole scale from one number, and
   all thirty-three of those numbers live in `RUNG` — so moving a
   rung is a one-line edit that cannot leave the drawing
   inconsistent with itself. The rungs step by about 1.24x,
   unbroken from 15km to 13,775km, comfortably inside the 1.55x
   that `tools/balance.mjs` calls a hole; the stage's scatter
   scale ranges then fill in between them.

   SHAPE. Collision radius is half the longest HORIZONTAL span
   while `pickup` is the cube root of the box, so a long flat
   thing fences the map off while reading as small. That is the
   trap for exactly the props this theme wants — a mountain
   range, a river system, a cloud front. So every one of them
   MEANDERS, ARCS or CLUMPS rather than running straight: see
   `arcPeaks`, and the wobble terms in the canyon, the glacier
   and the front. Nothing here has a radius much over one
   pickup.

   MASS LIVES AT THE TOP AND THERE IS NOTHING TO BE DONE ABOUT
   IT. Growth counts `boxVol * fill` and boxVol is pickup cubed,
   so the planet, the oceans and the continents carry most of the
   stage between them and everything below an ice sheet is
   texture. Re-size one of those and the finishing size moves;
   re-size a waterfall and nothing happens. Both numbers that
   decide whether the stage can be finished at all come out of
   that: a prop needs a ball of `pickup / 0.88`, and the biggest
   ball that can exist is set by the same total mass. Measure
   with `node tools/balance.mjs 0.9 --runs=9 --only=world` and
   read `size ceiling` and `too big to ever collect`.
   ============================================================ */

import { defineProp } from './index.js';

/**
 * Every prop in this file is tagged, categorised and unitted identically, and
 * all three are load-bearing: no tag and the stage's scatter pool is empty, no
 * unit and a continent prints as a bare number in the same column as a drawing
 * pin.
 */
const P = (def) => defineProp({ cat: 'world', tags: ['world'], unit: 'planet', ...def });

const TAU = Math.PI * 2;

/* ------------------------------------------------------------------
   A landscape palette.

   render/palette.js is a toy-box — bright plastics, brick, wood — and it is
   shared with seven other stages, none of which wants the pale green of a
   canopy or the dead white of a salt crust. So this stage brings its own tin
   and does not touch the shared one. Exported only so the stage's terrain can
   paint its sea and its ice out of the same colours as the props standing on
   them.
   ------------------------------------------------------------------ */
export const G = {
  // water
  ocean:      0x1a5390,
  oceanDeep:  0x103a6c,
  abyss:      0x0a2748,
  shelf:      0x2f93bd,
  lagoon:     0x63cbd6,
  surf:       0xd9f1f9,
  foam:       0xf2fbff,
  river:      0x4fb4dc,
  lake:       0x2f7fb8,
  marsh:      0x4d7a63,
  silt:       0xa79263,

  // vegetation and soil
  land:       0x6f9c4c,
  landDry:    0xa6ae5d,
  forest:     0x3f7c3a,
  forestDk:   0x275527,
  jungle:     0x2c7d3f,
  jungleDk:   0x1d5b2c,
  steppe:     0xb3a962,
  tundra:     0x8a9270,
  sand:       0xe1c684,
  sandDeep:   0xc4a05a,
  salt:       0xf3f0e4,
  saltDk:     0xd9d3bd,

  // rock
  rock:       0x8b8175,
  rockDk:     0x5d564f,
  scree:      0xa7a094,
  granite:    0x7a7f88,
  crust:      0x463f3a,
  basalt:     0x2d2a30,
  ash:        0x6e6a6c,
  lava:       0xff7a30,
  ember:      0xffb055,

  // ice
  ice:        0xe7f5fc,
  iceBlue:    0xb6dcf0,
  iceDeep:    0x8ec6e6,
  snow:       0xfcfdff,

  // air
  cloud:      0xf6fbff,
  cloudGrey:  0xccd8e5,
  storm:      0x9aacbe,
  rain:       0x7fa8c8,

  // reef, and the one made thing in the stage
  coral:      0xf08a6a,
  coralPink:  0xf0a8c0,
  kelp:       0x4a7a4a,
  city:       0xc9ccd2,
  cityDk:     0x8d939c,
  glass:      0x7fa6c4,
  lamp:       0xffd98a,
};

/* ------------------------------------------------------------------
   THE LADDER, in one table.

   Each entry is the single scale number its build is written in terms of, and
   `pickup` comes out very nearly proportional to it — so a rung is moved by
   editing one number here rather than by rescaling a drawing by hand and
   getting two of its nine dimensions wrong. The comment on each line is the
   rung the number currently lands on, measured, not intended.
   ------------------------------------------------------------------ */
const RUNG = {
  wd_city:         0.0306690,   // 15km
  wd_waterfall:    0.0386324,   // 19km
  wd_reef:         0.0570728,   // 23km
  wd_mountain:     0.0596385,   // 28km
  wd_volcano:      0.0645375,   // 35km
  wd_craterlake:   0.0833728,   // 44km
  wd_canyon:       0.100247,   // 54km
  wd_glacier:      0.130163,   // 67km
  wd_forest:       0.208080,   // 83km
  wd_thunderhead:  0.182750,   // 102km
  wd_lake:         0.261888,   // 126km
  wd_delta:        0.369042,   // 157km
  wd_fjord:        0.368147,   // 194km
  wd_island:       0.405956,   // 240km
  wd_saltflat:     0.569752,   // 297km
  wd_escarpment:   0.655730,   // 367km
  wd_cloudfront:   0.742194,   // 455km
  wd_range:        0.742831,   // 563km
  wd_greatlake:    1.21621,   // 696km
  wd_rainforest:   1.82541,   // 862km
  wd_storm:        1.66520,   // 1067km
  wd_dunesea:      2.95754,   // 1320km
  wd_icefield:     3.42230,   // 1634km
  wd_peninsula:    3.70468,   // 2022km
  wd_riversystem:  4.47370,   // 2503km
  wd_cordillera:   3.68431,   // 3097km
  wd_icesheet:     6.52107,   // 3834km
  wd_desertbelt:   8.87426,   // 4744km
  wd_archipelago:  10.9238,   // 5872km
  wd_inland_sea:  10.9613,   // 7267km
  wd_continent:   18.2748,   // 8994km
  wd_ocean:       19.8522,   // 11,132km
  wd_planet:      24.8176,   // 13,775km
};

/* ------------------------------------------------------------------
   Shared builders.

   A lake, a crater lake, a great lake and an inland sea are the same drawing
   four times over at different sizes with different things round it, and
   writing that four times over is how the four of them end up subtly
   inconsistent.
   ------------------------------------------------------------------ */

/**
 * Unit vector for a point on a sphere, in the rotation convention the builder
 * uses. `applyOpts` composes Euler 'YXZ', so a primitive's own +Y axis ends up
 * along (sin rx sin ry, cos rx, sin rx cos ry) — which means `rx` is the polar
 * angle and `ry` the azimuth, and the same pair both places a surface feature
 * and lays it flat against the surface.
 */
function dirV(rx, ry) {
  const s = Math.sin(rx);
  return { x: s * Math.sin(ry), y: Math.cos(rx), z: s * Math.cos(ry) };
}

/**
 * Stick a shallow disc on the surface of a globe of radius R centred at
 * (0, R, 0) — continents, ice caps, deserts, seas.
 *
 * `lift` is a fraction of R and is the ONLY thing keeping overlapping features
 * out of each other's planes: two discs of different colours at the same
 * radius with the same orientation are coplanar over their whole overlap,
 * which is the shimmer `npm run coplanar` exists to catch. Callers stagger it
 * per feature.
 */
function patch(b, R, rx, ry, rad, thick, col, lift, seg = 8, taper = 1.06) {
  const d = dirV(rx, ry);
  b.cyl(rad, rad * taper, R * thick, col,
    { x: d.x * R * lift, y: R + d.y * R * lift, z: d.z * R * lift, rx, ry }, seg);
}

/** Polar ice, north and south. */
function caps(b, R, col, size, rnd) {
  patch(b, R, 0.0, 0, R * size, 0.13, col, 0.9, 10, 0.72);
  patch(b, R, Math.PI, 0, R * size * (0.7 + rnd() * 0.4), 0.13, col, 0.9, 10, 0.72);
}

/** A weather layer on a globe: bright puffs floating just clear of the surface. */
function weather(b, R, n, col, rnd, lift = 1.035) {
  for (let i = 0; i < n; i++) {
    const rx = Math.acos(1 - 2 * rnd()), ry = rnd() * TAU;
    const d = dirV(rx, ry);
    const rr = R * (0.1 + rnd() * 0.13);
    b.ellip(rr, rr * 0.34, rr * 0.72, col,
      { x: d.x * R * lift, y: R + d.y * R * lift, z: d.z * R * lift, rx, ry }, 8, 4);
  }
}

/**
 * A line of peaks with snow on the tall ones. `y` is the height the feet sit
 * at. Straight, so only for short spans inside something else.
 */
function peaks(b, len, h, rnd, ang, n, rock = G.rock, cap = G.snow, y = 0) {
  const ca = Math.cos(ang), sa = Math.sin(ang);
  for (let i = 0; i < n; i++) {
    const t = (i / Math.max(1, n - 1) - 0.5) * len;
    const off = (rnd() - 0.5) * len * 0.17;
    const hh = h * (0.55 + rnd() * 0.55);
    const rr = hh * (0.6 + rnd() * 0.32);
    b.cone(rr, hh, rock, { x: ca * t - sa * off, y: y + hh / 2, z: sa * t + ca * off }, 8);
    if (hh > h * 0.8) {
      b.cone(rr * 0.4, hh * 0.32, cap, { x: ca * t - sa * off, y: y + hh * 0.86, z: sa * t + ca * off }, 7);
    }
  }
}

/**
 * Peaks along a CIRCULAR ARC, which is how every mountain range in this file
 * is drawn and not for prettiness.
 *
 * Collision radius is half the longest horizontal span while `pickup` is the
 * cube root of the box, so a range drawn as a straight line of a hundred peaks
 * has a radius three times its pickup: it fences off a corridor of the map
 * while reading as a small thing you should be able to walk round. An arc puts
 * the same peaks in a footprint that is nearly square, and real ranges curve
 * anyway.
 */
function arcPeaks(b, rad, sweep, phase, h, n, rnd, rock, cap, y = 0, jitter = 0.14) {
  for (let i = 0; i < n; i++) {
    const a = phase + (i / Math.max(1, n - 1) - 0.5) * sweep;
    const d = rad * (1 + (rnd() - 0.5) * jitter);
    const hh = h * (0.55 + rnd() * 0.55);
    const rr = hh * (0.5 + rnd() * 0.3);
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    b.cone(rr, hh, rock, { x, y: y + hh / 2, z }, 8);
    if (hh > h * 0.76) b.cone(rr * 0.42, hh * 0.3, cap, { x, y: y + hh * 0.85, z }, 7);
  }
}

/**
 * A blobby landmass sitting on the sea: overlapping discs with cliff sides, a
 * deck one shade lighter set very slightly proud, and a pale shelf skirt at
 * the waterline so the coast reads as a coast rather than a cut-out.
 *
 * Returns the lobes as [x, z, r, top] so callers put ranges and forests on
 * solid ground instead of hanging them over the water. Three passes rather
 * than three primitives per lobe, so one lobe's skirt never draws across its
 * neighbour's deck.
 */
function landmass(b, R, H, rnd, cliff, deck, lobes = 5, spread = 1) {
  const parts = [[0, 0, R, H]];
  for (let i = 0; i < lobes; i++) {
    const a = (i / lobes) * TAU + (rnd() - 0.5) * 0.9;
    const d = R * (0.5 + rnd() * 0.34) * spread;
    parts.push([Math.cos(a) * d, Math.sin(a) * d, R * (0.28 + rnd() * 0.26), H * (0.7 + rnd() * 0.26)]);
  }
  for (const [x, z, r, h] of parts) b.cylOn(r * 1.14, h * 0.1, G.shelf, { x, z }, 9);
  for (const [x, z, r, h] of parts) b.cylOn(r, h, cliff, { x, z }, 10);
  const out = [];
  for (const [x, z, r, h] of parts) {
    b.cyl(r * 0.97, r * 0.97, h * 0.18, deck, { x, y: h * 1.02, z }, 10);
    out.push([x, z, r * 0.97, h * 1.11]);
  }
  return out;
}

/**
 * A body of standing water — the honest way to draw a hole.
 *
 * A ring of shore blocks carries ALL the height and the water itself is discs
 * sunk inside them, because a flat plate of water held up at its own
 * mid-height reads as a bridge and a rimless disc reads as a sticker. The
 * outline wobbles so a lake is not a circle, and `gapAt` leaves the outlets
 * open. Returns the water surface height, for islands.
 */
function basin(b, R, H, rnd, o = {}) {
  const {
    shore = G.land, rim = G.rockDk, crest = G.forest,
    water = G.lake, deep = G.oceanDeep,
    n = 14, gap = 7, gapAt = 5, wobble = 0.1, phase = 0,
  } = o;
  for (let i = 0; i < n; i++) {
    if (i % gap === gapAt) continue;
    const a = (i / n) * TAU;
    const rad = R * (0.86 + Math.sin(i * 1.7 + phase) * wobble);
    const hh = H * (0.55 + rnd() * 0.5);
    b.boxOn(R * 0.34, hh, R * 0.48, i % 3 ? shore : rim,
      { x: Math.cos(a) * rad, z: Math.sin(a) * rad, ry: -a });
    b.ellip(R * 0.15, hh * 0.18, R * 0.11, i % 2 ? crest : rim,
      { x: Math.cos(a) * rad, y: hh * 0.98, z: Math.sin(a) * rad, ry: -a }, 6, 3);
  }
  /* The water body is based BELOW the shore blocks rather than level with them.
     Every `boxOn` and `cylOn` in a prop puts its underside at y 0, so a rimmed
     lake had the shore's undersides and the water's underside in one plane over
     a twentieth of its footprint — buried and invisible, but `npm run coplanar`
     counts it and it was the worst finding in the file. Sinking the water is
     also what a lake bed does. */
  const surf = H * 0.4;
  b.cylOn(R * 0.84, surf + H * 0.07, water, { y: -H * 0.07 }, 13);
  b.cylOn(R * 0.54, H * 0.05, deep, { y: surf - H * 0.02 }, 11);
  return surf;
}

/**
 * A spiral of cloud arms round an eye — every cyclone in the file.
 * Ellipsoids rather than boxes: a storm has no straight edges, and an
 * ellipsoid's silhouette survives being 1/400th of the screen.
 */
function spiral(b, R, H, arms, rnd, colA, colB, turns = 2.9) {
  for (let a = 0; a < arms; a++) {
    const ph = (a / arms) * TAU;
    for (let i = 0; i < 9; i++) {
      const t = i / 8;
      const rad = R * (0.18 + t * 0.82);
      const ang = ph + t * turns;
      const rr = R * (0.07 + t * 0.1);
      b.ellip(rr, H * (0.36 - t * 0.17), rr * 1.5, t > 0.58 ? colB : colA,
        { x: Math.cos(ang) * rad, y: H * (0.6 - t * 0.2), z: Math.sin(ang) * rad, ry: -ang }, 7, 4);
    }
  }
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU;
    b.ellip(R * 0.08, H * 0.5, R * 0.08, colA,
      { x: Math.cos(a) * R * 0.16, y: H * 0.58, z: Math.sin(a) * R * 0.16 }, 7, 4);
  }
}

/**
 * Canopy: big blobs with small ones filling between, on a two-tone floor.
 *
 * Kept deliberately low-poly. A forest is one of the commonest things in the
 * stage and there are eight hundred of them at once; at 7x5 segments a blob
 * the canopies alone were most of the frame.
 */
function canopy(b, R, H, rnd, big, small, nBig, nSmall, y = 0) {
  for (let i = 0; i < nBig; i++) {
    const a = rnd() * TAU, d = R * 0.86 * Math.sqrt(rnd());
    const rr = R * (0.15 + rnd() * 0.12);
    b.sphere(rr, rnd() < 0.42 ? small : big,
      { x: Math.cos(a) * d, y: y + rr * 0.6, z: Math.sin(a) * d }, 6, 4);
  }
  for (let i = 0; i < nSmall; i++) {
    const a = rnd() * TAU, d = R * 0.94 * Math.sqrt(rnd());
    b.cone(R * 0.07, H * 0.6, small, { x: Math.cos(a) * d, y: y + H * 0.3, z: Math.sin(a) * d }, 6);
  }
}

/* ==================================================================
   GROUND LEVEL — 15km to 67km.  A thing you could drive across in a
   day, and the smallest rung the ball can still see.
   ================================================================== */

/* The one made thing in the stage, and it is here because a city is the unit a
   player measures a landscape against: 15km reads as small the moment it is
   next to a mountain. Tallest in the middle with the height falling off as the
   square of the distance out, which is the only thing that makes a cluster of
   boxes read as a city rather than as a quarry. */
P({ id: 'wd_city', name: 'City', cat: 'settlement', fill: 0.13, variants: 4, weight: 17,
  build(b, r, v) {
    const S = RUNG.wd_city;
    b.cylOn(S * 1.18, S * 0.05, G.cityDk, {}, 9);
    b.cylOn(S * 1.04, S * 0.04, G.city, { y: S * 0.048 }, 9);
    b.boxOn(S * 2.3, S * 0.035, S * 0.17, G.river, { y: S * 0.074, ry: 0.35 + v * 0.42 });
    for (let i = 0; i < 13; i++) {
      const a = r() * TAU, d = S * Math.sqrt(r());
      const f = 1 - d / S;
      const hh = S * (0.14 + f * f * 0.9 + r() * 0.16);
      const ww = S * (0.085 + r() * 0.07);
      b.boxOn(ww, hh, ww * (0.7 + r() * 0.6), i % 4 === 1 ? G.glass : G.city,
        { x: Math.cos(a) * d, y: S * 0.088, z: Math.sin(a) * d, ry: r() * 0.6 });
    }
    // suburbs strung out along the roads, which is what sets the footprint
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + v * 0.4;
      b.boxOn(S * 0.44, S * 0.055, S * 0.26, G.cityDk,
        { x: Math.cos(a) * S * 1.08, y: S * 0.055, z: Math.sin(a) * S * 1.08, ry: -a });
    }
    if (v > 1) b.ellip(S * 0.48, S * 0.05, S * 0.48, G.lamp, { y: S * 0.12 }, 8, 4);
  } });

/* A waterfall, which is really a waterfall AND the gorge below it, because the
   fall on its own is a white rectangle. Two shoulders of plateau with the
   notch between them, the sheet going over, the plunge pool, and the gorge
   walking away downstream with a wobble in it. */
P({ id: 'wd_waterfall', name: 'Waterfall', cat: 'nature', fill: 0.26, variants: 3, weight: 16,
  build(b, r, v) {
    const S = RUNG.wd_waterfall;
    const H = S * 1.0;
    for (const s of [-1, 1]) {
      b.boxOn(S * 0.92, H * (0.9 + r() * 0.12), S * 1.1, G.rockDk, { x: s * S * 0.74, z: S * 0.6 });
      b.boxOn(S * 0.86, H * 0.11, S * 1.04, s > 0 ? G.forest : G.land,
        { x: s * S * 0.74, y: H * 0.88, z: S * 0.6 });
    }
    b.boxOn(S * 0.42, H * 0.07, S * 1.0, G.river, { y: H * 0.9, z: S * 0.66 });
    b.boxOn(S * 0.44, H * 0.94, S * 0.2, G.foam, { z: S * 0.08 });
    b.boxOn(S * 0.28, H * 0.98, S * 0.11, G.snow, { z: S * 0.15 });
    // the plunge pool and the spray standing over it
    b.cylOn(S * 0.6, H * 0.07, G.lagoon, { z: -S * 0.32 }, 10);
    b.cylOn(S * 0.42, H * 0.05, G.river, { y: H * 0.058, z: -S * 0.32 }, 9);
    for (let i = 0; i < 3; i++) {
      b.ellip(S * (0.18 + r() * 0.14), H * 0.11, S * 0.18, G.foam,
        { x: (r() - 0.5) * S * 0.6, y: H * (0.14 + r() * 0.3), z: -S * 0.18 }, 7, 4);
    }
    // the gorge, wobbling so it is not a slot
    for (let i = 0; i < 2; i++) {
      const z = -S * (0.78 + i * 0.62);
      const wob = Math.sin(i * 1.5 + v) * S * 0.26;
      for (const s of [-1, 1]) {
        b.boxOn(S * 0.5, H * (0.48 + r() * 0.3), S * 0.66, G.rock, { x: s * S * 0.76 + wob, z });
      }
      b.boxOn(S * 0.36, H * 0.05, S * 0.7, G.river, { x: wob, y: H * 0.02, z });
    }
  } });

/* A reef. The lagoon inside is what makes it read as a reef and not as a rock,
   so the flat is a broken ring with the passes left open. */
P({ id: 'wd_reef', name: 'Coral Reef', cat: 'sea', surface: 'water',
  fill: 0.16, variants: 3, weight: 15,
  build(b, r, v) {
    const S = RUNG.wd_reef;
    const R = S * 1.1, H = S * 0.5;
    b.cylOn(R * 0.98, H * 0.2, G.lagoon, {}, 12);
    b.cylOn(R * 0.64, H * 0.07, G.shelf, { y: H * 0.185 }, 10);
    const N = 11;
    for (let i = 0; i < N; i++) {
      if (i % 5 === 3 - v) continue;
      const a = (i / N) * TAU;
      const hh = H * (0.6 + r() * 0.6);
      b.boxOn(R * 0.34, hh, R * 0.46, i % 3 ? G.coral : G.rock,
        { x: Math.cos(a) * R * 0.82, z: Math.sin(a) * R * 0.82, ry: -a });
      b.ellip(R * 0.17, hh * 0.2, R * 0.12, i % 2 ? G.foam : G.surf,
        { x: Math.cos(a) * R * 0.98, y: hh * 0.9, z: Math.sin(a) * R * 0.98, ry: -a }, 6, 3);
    }
    for (let i = 0; i < 6; i++) {
      const a = r() * TAU, d = R * 0.58 * Math.sqrt(r());
      b.sphere(R * (0.07 + r() * 0.07), i % 3 ? G.coralPink : G.coral,
        { x: Math.cos(a) * d, y: H * 0.22, z: Math.sin(a) * d }, 6, 4);
    }
    // a sand cay, the only dry land on the whole thing
    b.cylOn(R * 0.15, H * 0.3, G.sand, { x: R * 0.28, y: H * 0.2, z: -R * 0.22 }, 8);
    if (v > 0) for (let i = 0; i < 3; i++) {
      b.sphere(R * 0.05, G.kelp,
        { x: R * 0.28 + (r() - 0.5) * R * 0.18, y: H * 0.56, z: -R * 0.22 + (r() - 0.5) * R * 0.18 }, 6, 4);
    }
  } });

P({ id: 'wd_mountain', name: 'Mountain', cat: 'nature', fill: 0.30, variants: 4, weight: 15,
  build(b, r, v) {
    const S = RUNG.wd_mountain;
    const R = S * 1.0, H = S * 1.7;
    b.cylOn(R * 1.02, H * 0.055, G.scree, {}, 11);
    b.cylOn(R * 0.78, H * 0.05, G.rockDk, { y: H * 0.052 }, 10);
    b.cone(R * 0.66, H, G.rock, { y: H * 0.5 }, 9);
    b.cone(R * 0.26, H * 0.3, G.snow, { y: H * 0.86 }, 8);
    // shoulders, each with its own summit so the massif is not one cone
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + v * 0.5;
      const hh = H * (0.4 + r() * 0.3);
      const px = Math.cos(a) * R * 0.58, pz = Math.sin(a) * R * 0.58;
      b.cone(R * (0.24 + r() * 0.1), hh, G.rockDk, { x: px, y: hh * 0.5 + H * 0.05, z: pz }, 8);
      if (hh > H * 0.58) b.cone(R * 0.1, hh * 0.26, G.snow, { x: px, y: H * 0.05 + hh * 0.86, z: pz }, 7);
    }
    // arêtes running down off the summit, and a glacier in one of the cirques
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU + 0.4 + v;
      b.wedge(R * 0.2, H * 0.32, R * 0.86, G.rock,
        { x: Math.cos(a) * R * 0.42, y: H * 0.1, z: Math.sin(a) * R * 0.42, ry: -a + 1.57 });
    }
    b.boxOn(R * 0.22, H * 0.1, R * 0.66, G.iceBlue,
      { x: -R * 0.32, y: H * 0.16, z: R * 0.28, ry: 0.6, rx: -0.12 });
    b.cylOn(R * 0.13, H * 0.03, G.lake, { x: R * 0.56, y: H * 0.065, z: R * 0.46 }, 8);
  } });

P({ id: 'wd_volcano', name: 'Volcano', cat: 'nature', fill: 0.28, variants: 3, weight: 14,
  build(b, r, v) {
    const S = RUNG.wd_volcano;
    const R = S * 1.0, H = S * 1.5;
    b.cylOn(R * 1.04, H * 0.055, G.basalt, {}, 11);
    b.cylOn(R * 0.84, H * 0.05, G.ash, { y: H * 0.052 }, 10);
    // two stacked tapers, so the crater rim is a real rim and not a point
    b.taperOn(R * 0.34, R * 0.78, H * 0.72, G.rockDk, { y: H * 0.05 }, 11);
    b.taperOn(R * 0.28, R * 0.34, H * 0.2, G.basalt, { y: H * 0.755 }, 10);
    b.cylOn(R * 0.23, H * 0.05, G.crust, { y: H * 0.9 }, 10);
    b.cylOn(R * 0.12, H * 0.04, G.lava, { y: H * 0.925 }, 9);
    // lava running down the flanks, each tongue with real vertical extent
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU + v * 0.6;
      b.boxOn(R * 0.14, H * (0.16 + r() * 0.2), R * 0.64, i % 2 ? G.lava : G.ember,
        { x: Math.cos(a) * R * 0.42, y: H * 0.1, z: Math.sin(a) * R * 0.42, ry: -a + 1.57 });
    }
    // the plume, which is most of the silhouette
    for (let i = 0; i < 4; i++) {
      const rr = R * (0.16 + i * 0.12);
      b.ellip(rr, H * 0.11, rr * 0.86, i % 2 ? G.ash : G.cloudGrey,
        { x: (i - 1) * R * 0.11, y: H * (1.0 + i * 0.18), z: (i % 3 - 1) * R * 0.1 }, 8, 5);
    }
    if (v > 0) b.cone(R * 0.2, H * 0.3, G.ash, { x: R * 0.6, y: H * 0.2, z: -R * 0.38 }, 8);
    if (v === 2) b.cone(R * 0.07, H * 0.08, G.ember, { x: R * 0.6, y: H * 0.36, z: -R * 0.38 }, 6);
  } });

P({ id: 'wd_craterlake', name: 'Crater Lake', cat: 'nature', fill: 0.30, variants: 3, weight: 14,
  build(b, r, v) {
    const S = RUNG.wd_craterlake;
    const R = S * 1.2, H = S * 0.9;
    const surf = basin(b, R, H, r, {
      shore: G.rockDk, rim: G.rock, crest: G.forest,
      water: G.lake, deep: G.abyss, n: 12, gap: 12, gapAt: 3 + v, wobble: 0.05, phase: v,
    });
    // the cinder cone standing out of the middle of it
    b.cone(R * 0.2, H * 0.62, G.ash, { x: R * 0.08, y: surf + H * 0.31, z: -R * 0.1 }, 9);
    b.cylOn(R * 0.07, H * 0.03, G.crust, { x: R * 0.08, y: surf + H * 0.6, z: -R * 0.1 }, 7);
    // hot springs at the waterline, and the outflow cut through the rim
    for (let i = 0; i < 3; i++) {
      const a = r() * TAU, d = R * 0.66;
      b.ellip(R * 0.07, H * 0.02, R * 0.05, G.lagoon,
        { x: Math.cos(a) * d, y: surf + H * 0.02, z: Math.sin(a) * d }, 7, 3);
    }
    const oa = ((3 + v) / 12) * TAU;
    b.boxOn(R * 0.16, H * 0.06, R * 0.7, G.river,
      { x: Math.cos(oa) * R * 1.02, y: H * 0.1, z: Math.sin(oa) * R * 1.02, ry: -oa + 1.57 });
  } });

/* A canyon. Built as paired wall stations with a MEANDER, because a straight
   trench is the long-flat-thing trap and because a canyon meanders anyway.
   Each wall is a block with real vertical extent and a terrace stepping down
   into the gorge, and the river is at the bottom where it belongs. */
P({ id: 'wd_canyon', name: 'Canyon', cat: 'nature', fill: 0.30, variants: 3, weight: 14,
  build(b, r, v) {
    const S = RUNG.wd_canyon;
    const W = S * 1.0, L = S * 2.6, H = S * 1.0;
    const N = 7, seg = (L / N) * 1.16;
    for (let i = 0; i < N; i++) {
      const t = (i / (N - 1) - 0.5) * L;
      const wob = Math.sin(i * 1.05 + v * 1.3) * W * 0.42;
      for (const s of [-1, 1]) {
        const hh = H * (0.82 + r() * 0.3);
        b.boxOn(W * 0.62, hh, seg, G.sandDeep, { x: s * W * 0.72 + wob, z: t });
        b.boxOn(W * 0.56, hh * 0.13, seg * 0.96, i % 2 ? G.sand : G.steppe,
          { x: s * W * 0.72 + wob, y: hh * 0.9, z: t });
        b.boxOn(W * 0.2, hh * 0.5, seg * 0.9, G.rockDk, { x: s * W * 0.34 + wob, z: t });
      }
      b.boxOn(W * 0.28, H * 0.06, seg, G.river, { x: wob, z: t });
      if (i % 3 === 1) {
        b.cylOn(W * 0.1, H * 0.03, G.silt, { x: wob + W * 0.1, y: H * 0.055, z: t }, 7);
      }
    }
  } });

/* A valley glacier, bent into an S so it clumps instead of running. The ice
   thins downhill, the moraine is a dark stripe down the middle, and the snout
   calves into a meltwater lake. */
P({ id: 'wd_glacier', name: 'Glacier', cat: 'ice', fill: 0.30, variants: 3, weight: 13,
  build(b, r, v) {
    const S = RUNG.wd_glacier;
    const W = S * 1.0, L = S * 2.4, H = S * 0.9;
    const N = 8, seg = (L / N) * 1.18;
    const bendAt = (f) => Math.sin(f * 3.4 + v) * W * 0.46;
    for (let i = 0; i < N; i++) {
      const f = i / (N - 1);
      const t = (f - 0.5) * L, bend = bendAt(f);
      const ice = H * (0.62 - f * 0.4);
      for (const s of [-1, 1]) {
        const hh = H * (0.92 - f * 0.34) * (0.9 + r() * 0.25);
        b.boxOn(W * 0.46, hh, seg, G.rockDk, { x: s * W * 0.6 + bend, z: t });
        if (f < 0.62) {
          b.boxOn(W * 0.4, hh * 0.2, seg * 0.94, G.snow, { x: s * W * 0.6 + bend, y: hh * 0.86, z: t });
        }
      }
      b.boxOn(W * 0.56, ice, seg, G.ice, { x: bend, z: t });
      b.boxOn(W * 0.5, ice * 0.1, seg * 0.9, G.iceBlue, { x: bend, y: ice * 0.88, z: t });
      b.boxOn(W * 0.055, ice * 0.06, seg * 0.96, G.rockDk, { x: bend + W * 0.09, y: ice * 0.97, z: t });
      if (i % 2 === 1) {
        b.boxOn(W * 0.5, ice * 0.05, seg * 0.1, G.iceDeep, { x: bend, y: ice * 0.95, z: t + seg * 0.22 });
      }
    }
    // the snout, and the lake it drops its bergs into
    const eb = bendAt(1);
    b.cylOn(W * 0.52, H * 0.06, G.lake, { x: eb, y: 0, z: L * 0.5 + seg * 0.7 }, 10);
    for (let i = 0; i < 3; i++) {
      b.boxOn(W * 0.1, H * 0.1, W * 0.09, G.ice,
        { x: eb + (r() - 0.5) * W * 0.7, y: H * 0.05, z: L * 0.5 + seg * (0.4 + r() * 0.6), ry: r() * 3 });
    }
  } });

/* ==================================================================
   A DAY'S WEATHER AND A REGION'S WORTH OF GROUND — 83km to 455km
   ================================================================== */

P({ id: 'wd_forest', name: 'Forest', cat: 'nature', fill: 0.22, variants: 3, weight: 14,
  build(b, r, v) {
    const S = RUNG.wd_forest;
    const R = S * 1.1, H = S * 0.8;
    b.cylOn(R, H * 0.13, G.forestDk, {}, 12);
    b.cylOn(R * 0.88, H * 0.06, G.forest, { y: H * 0.125 }, 11);
    canopy(b, R, H, r, G.forest, G.forestDk, 15, 7, H * 0.24);
    // a clearing with a stream through it, and one burnt patch
    b.boxOn(R * 1.66, H * 0.06, R * 0.13, G.river, { y: H * 0.17, ry: 0.5 + v });
    b.cylOn(R * 0.2, H * 0.04, G.land, { x: -R * 0.38, y: H * 0.18, z: R * 0.28 }, 9);
    if (v > 0) b.ellip(R * 0.36, H * 0.1, R * 0.26, G.cloud, { x: R * 0.2, y: H * 0.9, z: -R * 0.2 }, 7, 4);
  } });

/* A thunderhead. All the vertical extent this stage's weather has: the rain
   shaft is the base, the tower is the middle and the anvil is the top, which
   is also the order in which a player reads it. A flat cloud disc at its own
   mid-height would read as a floor. */
P({ id: 'wd_thunderhead', name: 'Thunderhead', cat: 'sky', surface: 'air', flyHeight: 0.7,
  fill: 0.10, variants: 3, weight: 13,
  build(b, r, v) {
    const S = RUNG.wd_thunderhead;
    const R = S * 0.9, H = S * 2.6;
    for (let i = 0; i < 5; i++) {
      b.boxOn(R * (0.2 + r() * 0.14), H * (0.3 + r() * 0.2), R * (0.2 + r() * 0.12),
        i % 2 ? G.rain : G.storm, { x: (r() - 0.5) * R * 0.9, z: (r() - 0.5) * R * 0.9, ry: r() });
    }
    for (let i = 0; i < 7; i++) {
      const f = i / 6;
      const rr = R * (0.3 + f * 0.26);
      b.ellip(rr, rr * 0.9, rr * 0.92, f < 0.3 ? G.storm : G.cloud,
        { x: (r() - 0.5) * R * 0.4, y: H * (0.28 + f * 0.5), z: (r() - 0.5) * R * 0.4 }, 8, 5);
    }
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU + v;
      b.ellip(R * (0.38 + r() * 0.2), H * 0.045, R * 0.28, i % 3 ? G.cloud : G.cloudGrey,
        { x: Math.cos(a) * R * 0.7, y: H * (0.85 + r() * 0.08), z: Math.sin(a) * R * 0.7, ry: -a }, 8, 4);
    }
    b.ellip(R * 0.48, H * 0.045, R * 0.48, G.snow, { y: H * 0.94 }, 9, 4);
    if (v > 0) for (let i = 0; i < 3; i++) {
      b.boxOn(R * 0.03, H * 0.15, R * 0.03, G.lamp,
        { x: (r() - 0.5) * R * 0.8, y: H * (0.06 + i * 0.08), z: (r() - 0.5) * R * 0.8, rz: (r() - 0.5) * 0.6 });
    }
  } });

P({ id: 'wd_lake', name: 'Lake', cat: 'nature', fill: 0.28, variants: 3, weight: 13,
  build(b, r, v) {
    const S = RUNG.wd_lake;
    const R = S * 1.15, H = S * 0.85;
    const surf = basin(b, R, H, r, { gapAt: 5 - v, wobble: 0.11, phase: v * 1.4 });
    for (let i = 0; i < 3; i++) {
      const a = r() * TAU, d = R * 0.46 * Math.sqrt(r());
      const px = Math.cos(a) * d, pz = Math.sin(a) * d;
      b.cylOn(R * (0.07 + r() * 0.05), H * 0.16, G.rockDk, { x: px, y: surf - H * 0.04, z: pz }, 8);
      b.sphere(R * 0.05, G.forest, { x: px, y: surf + H * 0.14, z: pz }, 6, 4);
    }
    // the river in, the river out, and the marsh at the shallow end
    b.boxOn(R * 0.15, H * 0.06, R * 0.86, G.river, { x: R * 0.86, y: H * 0.2, z: R * 0.56, ry: 0.7 });
    b.boxOn(R * 0.13, H * 0.05, R * 0.8, G.river, { x: -R * 0.8, y: H * 0.18, z: -R * 0.5, ry: -0.6 });
    b.ellip(R * 0.3, H * 0.03, R * 0.22, G.marsh, { x: -R * 0.36, y: surf + H * 0.01, z: R * 0.34 }, 9, 4);
  } });

/* A river delta: the fan, the distributaries that build it, and the hills the
   trunk river comes out of. Lobed rather than a single triangle, because a
   delta grows by abandoning one lobe and starting another. */
P({ id: 'wd_delta', name: 'River Delta', cat: 'nature', fill: 0.22, variants: 3, weight: 13,
  build(b, r, v) {
    const S = RUNG.wd_delta;
    const R = S * 1.3, H = S * 0.7;
    for (let i = 0; i < 5; i++) {
      const a = -0.9 + (i / 4) * 1.8;
      b.cylOn(R * (0.32 + r() * 0.14), H * (0.3 + r() * 0.2), i % 2 ? G.silt : G.marsh,
        { x: Math.sin(a) * R * 0.5, z: -Math.cos(a) * R * 0.42 }, 10);
    }
    b.cylOn(R * 0.48, H * 0.44, G.marsh, { z: R * 0.36 }, 11);
    for (let i = 0; i < 6; i++) {
      const a = -1.0 + (i / 5) * 2.0 + (r() - 0.5) * 0.16;
      b.boxOn(R * 0.09, H * 0.1, R * 0.86, G.river,
        { x: Math.sin(a) * R * 0.44, y: H * 0.36, z: R * 0.26 - Math.cos(a) * R * 0.44, ry: a });
    }
    b.boxOn(R * 0.19, H * 0.12, R * 0.66, G.river, { y: H * 0.42, z: R * 0.68 });
    for (let i = 0; i < 3; i++) {
      b.cone(R * 0.16, H * (0.8 + r() * 0.5), G.land, { x: (i - 1) * R * 0.46, y: H * 0.5, z: R * 0.9 }, 8);
    }
    // reeds on the lobes, and the bar the sea throws up in front of them
    for (let i = 0; i < 6; i++) {
      const a = -0.9 + r() * 1.8;
      b.sphere(R * 0.07, G.jungle,
        { x: Math.sin(a) * R * 0.44, y: H * 0.5, z: -Math.cos(a) * R * 0.36 }, 6, 4);
    }
    b.ellip(R * 0.86, H * 0.05, R * 0.14, G.lagoon, { y: H * 0.05, z: -R * 0.58, ry: 0.06 }, 11, 4);
    if (v > 0) b.ellip(R * 0.6, H * 0.04, R * 0.09, G.surf, { y: H * 0.07, z: -R * 0.7, ry: -0.05 }, 9, 3);
  } });

/* A fjord coast, and the reason it is built as separate headlands rather than
   as one block with troughs cut into it: you cannot subtract from a primitive.
   Parallel granite ridges with drowned valleys between them is both the honest
   way to draw it and what one actually looks like from above. */
P({ id: 'wd_fjord', name: 'Fjord Coast', cat: 'sea', surface: 'water',
  fill: 0.32, variants: 3, weight: 12,
  build(b, r, v) {
    const S = RUNG.wd_fjord;
    const R = S * 1.15, H = S * 1.0;
    const N = 5;
    for (let i = 0; i < N; i++) {
      const t = (i / (N - 1) - 0.5) * R * 1.7;
      for (let k = 0; k < 3; k++) {
        const zz = (k / 2 - 0.5) * R * 1.24 + Math.sin(i * 1.3 + k + v) * R * 0.16;
        const wob = Math.sin(k * 2.1 + i) * R * 0.1;
        const hh = H * (0.5 + (1 - Math.abs(t) / (R * 0.92)) * 0.6) * (0.85 + r() * 0.3);
        b.cylOn(R * 0.2, H * 0.05, G.shelf, { x: t + wob, z: zz }, 8);
        b.boxOn(R * 0.26, hh, R * 0.42, G.granite, { x: t + wob, z: zz, ry: (r() - 0.5) * 0.2 });
        b.boxOn(R * 0.22, hh * 0.13, R * 0.36, k === 1 ? G.forestDk : G.tundra,
          { x: t + wob, y: hh * 0.9, z: zz });
        if (hh > H * 0.85) b.boxOn(R * 0.13, hh * 0.1, R * 0.22, G.snow, { x: t + wob, y: hh * 1.0, z: zz });
      }
    }
    // the deep water between the headlands
    for (let i = 0; i < 4; i++) {
      const t = (i / 3 - 0.5) * R * 1.5;
      b.ellip(R * 0.1, H * 0.04, R * 0.62, G.abyss, { x: t + R * 0.2, y: H * 0.04, z: 0 }, 8, 4);
    }
    // skerries out in front, and waterfalls off the cliff faces
    for (let i = 0; i < 5; i++) {
      b.sphere(R * (0.04 + r() * 0.05), G.granite,
        { x: (r() - 0.5) * R * 1.7, y: H * 0.02, z: -R * (0.86 + r() * 0.3) }, 6, 4);
    }
    for (let i = 0; i < 5; i++) {
      const hh = H * (0.4 + r() * 0.3);
      b.boxOn(R * 0.035, hh, R * 0.04, G.foam,
        { x: (r() - 0.5) * R * 1.5, y: H * 0.05, z: (r() - 0.5) * R * 1.2 });
    }
  } });

P({ id: 'wd_island', name: 'Island', cat: 'sea', surface: 'water',
  fill: 0.30, variants: 4, weight: 12,
  build(b, r, v) {
    const S = RUNG.wd_island;
    const R = S * 1.15, H = S * 0.72;
    const lobes = landmass(b, R, H, r, G.rockDk, v % 2 ? G.forest : G.land, 4);
    const top = lobes[0][3];
    b.cone(R * 0.34, H * 1.25, G.rock, { y: top + H * 0.6 }, 9);
    if (v > 1) b.cone(R * 0.13, H * 0.32, G.snow, { y: top + H * 1.08 }, 7);
    for (const [x, z, rr, tp] of lobes) {
      for (let i = 0; i < 3; i++) {
        const a = r() * TAU, d = rr * 0.72 * Math.sqrt(r());
        b.sphere(rr * 0.2, r() < 0.5 ? G.jungle : G.forestDk,
          { x: x + Math.cos(a) * d, y: tp, z: z + Math.sin(a) * d }, 6, 4);
      }
    }
    // one beach, and the reef on the sheltered side
    b.ellip(R * 0.38, H * 0.06, R * 0.26, G.sand, { x: R * 0.48, y: H * 0.13, z: R * 0.38 }, 9, 4);
    for (let i = 0; i < 5; i++) {
      const a = -0.8 + (i / 4) * 1.6;
      b.ellip(R * 0.16, H * 0.05, R * 0.1, i % 2 ? G.lagoon : G.coral,
        { x: Math.sin(a) * R * 1.16, y: H * 0.09, z: -Math.cos(a) * R * 1.16, ry: a }, 7, 3);
    }
  } });

P({ id: 'wd_saltflat', name: 'Salt Flat', cat: 'nature', fill: 0.28, variants: 3, weight: 12,
  build(b, r, v) {
    const S = RUNG.wd_saltflat;
    const R = S * 1.3, H = S * 0.72;
    for (let i = 0; i < 12; i++) {
      if (i % 6 === 4) continue;
      const a = (i / 12) * TAU;
      const hh = H * (0.7 + r() * 0.6);
      b.cone(R * 0.3, hh, i % 3 ? G.rockDk : G.sandDeep,
        { x: Math.cos(a) * R * 0.9, y: hh * 0.5, z: Math.sin(a) * R * 0.9 }, 8);
    }
    b.cylOn(R * 0.9, H * 0.26, G.saltDk, {}, 13);
    b.cylOn(R * 0.8, H * 0.05, G.salt, { y: H * 0.25 }, 12);
    // the polygons the crust cracks into
    for (let i = 0; i < 7; i++) {
      b.boxOn(R * 1.44, H * 0.02, R * 0.02, G.saltDk, { y: H * 0.29, ry: (i / 7) * Math.PI + v * 0.3 });
    }
    for (let i = 0; i < 5; i++) {
      const a = r() * TAU, d = R * 0.62 * Math.sqrt(r());
      b.wedge(R * (0.26 + r() * 0.26), H * 0.08, R * 0.05, G.salt,
        { x: Math.cos(a) * d, y: H * 0.3, z: Math.sin(a) * d, ry: r() * 3.1 });
    }
    b.ellip(R * 0.28, H * 0.03, R * 0.2, G.lagoon, { x: -R * 0.22, y: H * 0.31, z: R * 0.2 }, 10, 4);
    if (v > 0) b.ellip(R * 0.14, H * 0.02, R * 0.1, G.shelf, { x: R * 0.3, y: H * 0.31, z: -R * 0.3 }, 8, 3);
  } });

/* A great escarpment: a plateau, the cliff that ends it, and the plain below.
   Arced, so the plateau is behind the curve and the plain in front of it —
   which is both compact and the shape a real one makes. */
P({ id: 'wd_escarpment', name: 'Escarpment', cat: 'nature', fill: 0.30, variants: 3, weight: 12,
  build(b, r, v) {
    const S = RUNG.wd_escarpment;
    const rad = S * 1.1, H = S * 1.2;
    const N = 9, sweep = 2.6;
    for (let i = 0; i < N; i++) {
      const a = -sweep / 2 + (i / (N - 1)) * sweep + v * 0.2;
      const ca = Math.cos(a), sa = Math.sin(a);
      const hh = H * (0.8 + r() * 0.4);
      b.boxOn(rad * 0.62, hh * 0.9, rad * 0.52, G.rockDk, { x: ca * rad * 1.28, z: sa * rad * 1.28, ry: -a });
      b.boxOn(rad * 0.56, hh * 0.14, rad * 0.46, i % 2 ? G.steppe : G.landDry,
        { x: ca * rad * 1.28, y: hh * 0.86, z: sa * rad * 1.28, ry: -a });
      b.boxOn(rad * 0.2, hh, rad * 0.48, G.rock, { x: ca * rad * 0.96, z: sa * rad * 0.96, ry: -a });
      b.cone(rad * 0.22, hh * 0.4, G.scree, { x: ca * rad * 0.76, y: hh * 0.2, z: sa * rad * 0.76 }, 7);
      if (i % 3 === 1) {
        b.boxOn(rad * 0.09, hh * 0.86, rad * 0.4, G.rockDk, { x: ca * rad * 1.02, z: sa * rad * 1.02, ry: -a });
      }
    }
    // the plain at the foot of it, and the river running along the scarp
    for (let i = 0; i < 6; i++) {
      const a = -sweep / 2 + (i / 5) * sweep + v * 0.2;
      b.cylOn(rad * 0.3, H * 0.14, i % 2 ? G.land : G.landDry,
        { x: Math.cos(a) * rad * 0.5, z: Math.sin(a) * rad * 0.5 }, 9);
    }
    for (let i = 0; i < 7; i++) {
      const a = -sweep / 2 + (i / 6) * sweep + v * 0.2;
      b.boxOn(rad * 0.06, H * 0.05, rad * 0.4, G.river,
        { x: Math.cos(a) * rad * 0.66, y: H * 0.14, z: Math.sin(a) * rad * 0.66, ry: -a + 1.57 });
    }
  } });

/* A cloud front. Bowed, not straight, for the same reason the ranges arc; and
   the leading edge is towers while the trailing edge is a flat deck with rain
   under it, which is what makes the direction of travel legible. */
P({ id: 'wd_cloudfront', name: 'Cloud Front', cat: 'sky', surface: 'air', flyHeight: 1.1,
  fill: 0.07, variants: 3, weight: 11,
  build(b, r, v) {
    const S = RUNG.wd_cloudfront;
    const L = S * 3.0, H = S * 1.4;
    for (let i = 0; i < 11; i++) {
      const t = i / 10 - 0.5;
      const x = t * L;
      const z = Math.sin(t * 4.2 + v) * L * 0.3;
      const hh = H * (0.55 + r() * 0.5);
      b.ellip(L * 0.07, hh * 0.5, L * 0.05, i % 4 === 3 ? G.storm : G.cloud,
        { x, y: hh * 0.55, z: z - L * 0.07 }, 7, 4);
      b.ellip(L * 0.09, H * 0.15, L * 0.09, i % 3 ? G.cloud : G.cloudGrey,
        { x, y: H * 0.4, z: z + L * 0.1 }, 7, 3);
      if (i % 2) b.boxOn(L * 0.04, H * 0.34, L * 0.04, G.rain, { x, z: z + L * 0.12 });
    }
    // scud running out ahead of it
    for (let i = 0; i < 5; i++) {
      const t = r() - 0.5;
      b.ellip(L * 0.05, H * 0.06, L * 0.03, G.cloud,
        { x: t * L, y: H * (0.14 + r() * 0.3), z: Math.sin(t * 4.2 + v) * L * 0.3 - L * 0.2 }, 6, 3);
    }
  } });

/* ==================================================================
   THINGS A CONTINENT IS MADE OF — 563km to 4,744km
   ================================================================== */

P({ id: 'wd_range', name: 'Mountain Range', cat: 'nature', fill: 0.34, variants: 3, weight: 11,
  build(b, r, v) {
    const S = RUNG.wd_range;
    const rad = S * 1.2, H = S * 1.5;
    const sweep = 3.0 + v * 0.2;
    for (let i = 0; i < 9; i++) {
      const a = -sweep / 2 + (i / 8) * sweep;
      b.cylOn(rad * 0.4, H * 0.17, G.rockDk, { x: Math.cos(a) * rad, z: Math.sin(a) * rad }, 8);
      b.cylOn(rad * 0.34, H * 0.06, G.scree, { x: Math.cos(a) * rad, y: H * 0.16, z: Math.sin(a) * rad }, 8);
    }
    arcPeaks(b, rad, sweep, 0, H, 11, r, G.rock, G.snow, H * 0.2, 0.12);
    arcPeaks(b, rad * 0.72, sweep * 0.9, 0.2, H * 0.66, 8, r, G.rockDk, G.ice, H * 0.14, 0.2);
    arcPeaks(b, rad * 1.32, sweep * 1.04, -0.1, H * 0.36, 9, r, G.scree, G.rock, 0, 0.2);
    // glaciers off the inner face, and the lakes they leave behind
    for (let i = 0; i < 5; i++) {
      const a = -sweep / 2 + (i / 4) * sweep;
      b.boxOn(rad * 0.06, H * 0.09, rad * 0.34, G.iceBlue,
        { x: Math.cos(a) * rad * 0.82, y: H * 0.2, z: Math.sin(a) * rad * 0.82, ry: -a + 1.57, rx: -0.1 });
      b.cylOn(rad * 0.08, H * 0.03, G.lake,
        { x: Math.cos(a) * rad * 0.6, y: H * 0.04, z: Math.sin(a) * rad * 0.6 }, 8);
    }
    // forest on the outer flank, where the rain falls
    for (let i = 0; i < 8; i++) {
      const a = -sweep / 2 + (i / 7) * sweep;
      b.sphere(rad * 0.09, i % 2 ? G.forest : G.forestDk,
        { x: Math.cos(a) * rad * 1.5, y: H * 0.06, z: Math.sin(a) * rad * 1.5 }, 6, 4);
    }
  } });

P({ id: 'wd_greatlake', name: 'Great Lake', cat: 'nature', fill: 0.28, variants: 3, weight: 11,
  build(b, r, v) {
    const S = RUNG.wd_greatlake;
    const R = S * 1.2, H = S * 0.92;
    const surf = basin(b, R, H, r, {
      shore: G.land, rim: G.granite, crest: G.forestDk,
      n: 18, gap: 9, gapAt: 6 - v, wobble: 0.14, phase: v * 2,
    });
    // a second basin sharing a strait with the first
    const ox = R * 0.86, oz = -R * 0.62;
    for (let i = 0; i < 9; i++) {
      const a = -1.2 + (i / 8) * 4.2;
      const hh = H * (0.5 + r() * 0.44);
      b.boxOn(R * 0.26, hh, R * 0.34, i % 3 ? G.land : G.granite,
        { x: ox + Math.cos(a) * R * 0.52, z: oz + Math.sin(a) * R * 0.52, ry: -a });
    }
    b.cylOn(R * 0.5, surf * 0.96, G.lake, { x: ox, y: 0, z: oz }, 12);
    b.cylOn(R * 0.3, H * 0.05, G.oceanDeep, { x: ox, y: surf * 0.94, z: oz }, 10);
    b.boxOn(R * 0.24, surf * 0.9, R * 0.3, G.lake, { x: ox * 0.56, z: oz * 0.5, ry: -0.6 });
    // islands, a long peninsula splitting the main basin, and the outflow river
    for (let i = 0; i < 5; i++) {
      const a = r() * TAU, d = R * 0.5 * Math.sqrt(r());
      const px = Math.cos(a) * d, pz = Math.sin(a) * d;
      b.cylOn(R * (0.05 + r() * 0.06), H * 0.16, G.rockDk, { x: px, y: surf - H * 0.04, z: pz }, 8);
      b.sphere(R * 0.05, G.forest, { x: px, y: surf + H * 0.13, z: pz }, 6, 4);
    }
    for (let i = 0; i < 3; i++) {
      b.cylOn(R * 0.14, H * 0.34, G.land, { x: -R * (0.1 + i * 0.22), y: 0, z: R * (0.44 - i * 0.14) }, 9);
    }
    b.boxOn(R * 0.14, H * 0.06, R * 0.9, G.river, { x: -R * 1.0, y: H * 0.2, z: -R * 0.6, ry: -0.7 });
  } });

P({ id: 'wd_rainforest', name: 'Rainforest', cat: 'nature', fill: 0.24, variants: 3, weight: 11,
  build(b, r, v) {
    const S = RUNG.wd_rainforest;
    const R = S * 1.2, H = S * 0.86;
    b.cylOn(R, H * 0.16, G.jungleDk, {}, 13);
    b.cylOn(R * 0.9, H * 0.06, G.jungle, { y: H * 0.155 }, 12);
    canopy(b, R, H, r, G.jungle, G.jungleDk, 20, 9, H * 0.28);
    // the great river, meandering, with the oxbows it has abandoned
    const ph = v * 1.1;
    for (let i = 0; i < 9; i++) {
      const t = (i / 8 - 0.5) * R * 1.9;
      const z = Math.sin(t / R * 2.6 + ph) * R * 0.42;
      const z2 = Math.sin((t + R * 0.24) / R * 2.6 + ph) * R * 0.42;
      b.boxOn(R * 0.28, H * 0.08, R * 0.14, G.river,
        { x: t, y: H * 0.2, z, ry: -Math.atan2(z2 - z, R * 0.24) });
    }
    for (let i = 0; i < 4; i++) {
      const a = r() * TAU, d = R * 0.6 * Math.sqrt(r());
      b.ellip(R * 0.1, H * 0.03, R * 0.06, G.lake,
        { x: Math.cos(a) * d, y: H * 0.22, z: Math.sin(a) * d, ry: r() * 3.1 }, 8, 3);
    }
    // a rainforest makes its own weather, and one clearing where a tree fell
    for (let i = 0; i < 5; i++) {
      b.ellip(R * (0.28 + r() * 0.14), H * 0.1, R * 0.2, i % 2 ? G.cloud : G.cloudGrey,
        { x: (r() - 0.5) * R * 1.5, y: H * (0.9 + r() * 0.24), z: (r() - 0.5) * R * 1.5 }, 8, 4);
    }
    b.cylOn(R * 0.16, H * 0.05, G.marsh, { x: R * 0.4, y: H * 0.2, z: -R * 0.36 }, 9);
  } });

P({ id: 'wd_storm', name: 'Storm', cat: 'sky', surface: 'water', fill: 0.08, variants: 3, weight: 11,
  build(b, r, v) {
    const S = RUNG.wd_storm;
    const R = S * 2.0, H = S * 0.72;
    spiral(b, R, H, 3 + v, r, G.cloud, G.cloudGrey, 3.0);
    // the eye, and the rain walking across the sea under the arms
    b.cylOn(R * 0.07, H * 0.05, G.oceanDeep, {}, 9);
    for (let i = 0; i < 10; i++) {
      const a = r() * TAU, d = R * (0.24 + r() * 0.66);
      b.boxOn(R * 0.05, H * (0.26 + r() * 0.28), R * 0.05, G.rain,
        { x: Math.cos(a) * d, z: Math.sin(a) * d, ry: a });
    }
    for (let i = 0; i < 6; i++) {
      const a = r() * TAU, d = R * (0.3 + r() * 0.6);
      b.ellip(R * 0.1, H * 0.03, R * 0.06, G.surf,
        { x: Math.cos(a) * d, y: H * 0.02, z: Math.sin(a) * d, ry: -a }, 7, 3);
    }
  } });

P({ id: 'wd_dunesea', name: 'Dune Sea', cat: 'nature', fill: 0.30, variants: 3, weight: 10,
  build(b, r, v) {
    const S = RUNG.wd_dunesea;
    const R = S * 1.3, H = S * 0.8;
    b.cylOn(R, H * 0.34, G.sandDeep, {}, 13);
    b.cylOn(R * 0.98, H * 0.1, G.sand, { y: H * 0.33 }, 13);
    // dune ridges, all combed the same way by the same wind
    const ang = 0.5 + v * 0.6;
    for (let i = 0; i < 11; i++) {
      const off = (i / 10 - 0.5) * R * 1.7;
      const len = R * 1.7 * Math.sqrt(Math.max(0.05, 1 - (off / (R * 0.9)) ** 2));
      const hh = H * (0.3 + r() * 0.36);
      b.wedge(len, hh, R * 0.1, G.sand,
        { x: -Math.sin(ang) * off, y: H * 0.42, z: Math.cos(ang) * off, ry: ang });
    }
    // star dunes where two winds meet, rock outcrops, a wadi and one oasis
    for (let i = 0; i < 3; i++) {
      const a = r() * TAU, d = R * 0.6 * Math.sqrt(r());
      b.cone(R * 0.14, H * 0.5, G.sand, { x: Math.cos(a) * d, y: H * 0.62, z: Math.sin(a) * d }, 7);
    }
    for (let i = 0; i < 5; i++) {
      const a = r() * TAU, d = R * (0.3 + r() * 0.55);
      b.cylOn(R * 0.06, H * (0.3 + r() * 0.4), G.rockDk,
        { x: Math.cos(a) * d, y: H * 0.4, z: Math.sin(a) * d }, 7);
    }
    b.boxOn(R * 1.1, H * 0.07, R * 0.06, G.silt, { y: H * 0.42, ry: ang + 1.4 });
    b.cylOn(R * 0.12, H * 0.04, G.lagoon, { x: R * 0.3, y: H * 0.42, z: -R * 0.3 }, 9);
    for (let i = 0; i < 4; i++) {
      const a = r() * TAU;
      b.sphere(R * 0.045, G.jungle,
        { x: R * 0.3 + Math.cos(a) * R * 0.15, y: H * 0.5, z: -R * 0.3 + Math.sin(a) * R * 0.15 }, 6, 4);
    }
  } });

P({ id: 'wd_icefield', name: 'Icefield', cat: 'ice', fill: 0.38, variants: 3, weight: 10,
  build(b, r, v) {
    const S = RUNG.wd_icefield;
    const R = S * 1.2, H = S * 0.9;
    b.cylOn(R, H * 0.16, G.iceBlue, {}, 13);
    b.dome(R * 0.86, G.snow, { y: H * 0.15 }, 12);
    // outlet glaciers running down off the dome, radially so nothing is long
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU + v * 0.4;
      const d = R * 0.78;
      b.boxOn(R * 0.16, H * 0.2, R * 0.5, G.ice,
        { x: Math.cos(a) * d, y: H * 0.1, z: Math.sin(a) * d, ry: -a + 1.57 });
      b.boxOn(R * 0.13, H * 0.04, R * 0.44, G.iceDeep,
        { x: Math.cos(a) * d, y: H * 0.29, z: Math.sin(a) * d, ry: -a + 1.57 });
    }
    // nunataks poking through, and the melt ponds on the surface
    for (let i = 0; i < 5; i++) {
      const a = r() * TAU, d = R * (0.35 + r() * 0.4);
      b.cone(R * 0.08, H * 0.44, G.rockDk,
        { x: Math.cos(a) * d, y: H * 0.3, z: Math.sin(a) * d }, 7);
    }
    for (let i = 0; i < 6; i++) {
      const a = r() * TAU, d = R * 0.6 * Math.sqrt(r());
      b.ellip(R * 0.09, H * 0.02, R * 0.06, G.iceDeep,
        { x: Math.cos(a) * d, y: H * 0.15 + Math.sqrt(Math.max(0, 1 - (d / (R * 0.86)) ** 2)) * H * 0.62,
          z: Math.sin(a) * d, ry: r() * 3.1 }, 8, 3);
    }
    // crevasse fields where the ice bends over the shoulder
    for (let i = 0; i < 8; i++) {
      const a = r() * TAU, d = R * (0.5 + r() * 0.3);
      b.boxOn(R * 0.2, H * 0.03, R * 0.02, G.iceDeep,
        { x: Math.cos(a) * d, y: H * 0.4, z: Math.sin(a) * d, ry: -a });
    }
  } });

/* A peninsula, hooked rather than straight — a straight finger of land is
   exactly the shape whose collision radius runs away from its pickup. The
   lobes walk round an arc and the mountains follow them. */
P({ id: 'wd_peninsula', name: 'Peninsula', cat: 'land', surface: 'water',
  fill: 0.36, variants: 3, weight: 10,
  build(b, r, v) {
    const S = RUNG.wd_peninsula;
    const rad = S * 1.0, H = S * 0.8;
    const sweep = 2.5 + v * 0.3;
    const N = 6;
    const lobes = [];
    for (let i = 0; i < N; i++) {
      const a = -sweep / 2 + (i / (N - 1)) * sweep;
      const rr = rad * (0.5 - i * 0.045) * (0.9 + r() * 0.2);
      lobes.push([Math.cos(a) * rad, Math.sin(a) * rad, rr, H * (0.7 + r() * 0.4)]);
    }
    for (const [x, z, rr, h] of lobes) b.cylOn(rr * 1.16, h * 0.1, G.shelf, { x, z }, 9);
    for (const [x, z, rr, h] of lobes) b.cylOn(rr, h, G.rockDk, { x, z }, 10);
    for (const [x, z, rr, h] of lobes) {
      b.cyl(rr * 0.96, rr * 0.96, h * 0.18, r() < 0.5 ? G.land : G.forest, { x, y: h * 1.02, z }, 10);
    }
    // the spine of mountains, and the bays on the inside of the hook
    arcPeaks(b, rad, sweep * 0.94, 0, H * 1.1, 9, r, G.rock, G.snow, H * 0.86, 0.1);
    for (let i = 0; i < 5; i++) {
      const a = -sweep / 2 + (i / 4) * sweep;
      b.ellip(rad * 0.14, H * 0.05, rad * 0.1, i % 2 ? G.lagoon : G.shelf,
        { x: Math.cos(a) * rad * 0.62, y: H * 0.06, z: Math.sin(a) * rad * 0.62, ry: -a }, 8, 4);
      b.ellip(rad * 0.1, H * 0.05, rad * 0.08, G.sand,
        { x: Math.cos(a) * rad * 1.34, y: H * 0.1, z: Math.sin(a) * rad * 1.34, ry: -a }, 8, 4);
    }
    // forest on the wet flank, and an island off the tip
    for (let i = 0; i < 9; i++) {
      const p = lobes[Math.floor(r() * lobes.length)];
      const a = r() * TAU, d = p[2] * 0.7 * Math.sqrt(r());
      b.sphere(rad * 0.06, r() < 0.5 ? G.forest : G.forestDk,
        { x: p[0] + Math.cos(a) * d, y: p[3], z: p[1] + Math.sin(a) * d }, 6, 4);
    }
    const tip = lobes[N - 1];
    b.cylOn(rad * 0.1, H * 0.5, G.granite, { x: tip[0] * 1.24, y: 0, z: tip[1] * 1.24 }, 8);
  } });

/* A river system: a catchment, a trunk river meandering right across it, and
   the tributaries reaching in from the divide. Dendritic and CLUMPED — a
   river drawn as one straight line 30 units long would wall off a corridor of
   the map while reading as something you could step over. */
P({ id: 'wd_riversystem', name: 'River System', cat: 'nature', fill: 0.26, variants: 3, weight: 9,
  build(b, r, v) {
    const S = RUNG.wd_riversystem;
    const R = S * 1.35, H = S * 0.85;
    // the catchment floor, in lobes so the basin has an outline
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU + v * 0.3;
      b.cylOn(R * (0.3 + r() * 0.14), H * (0.16 + r() * 0.1), i % 3 ? G.land : G.marsh,
        { x: Math.cos(a) * R * 0.56, z: Math.sin(a) * R * 0.56 }, 10);
    }
    b.cylOn(R * 0.52, H * 0.24, G.land, {}, 11);
    // the divide: hills round the rim, tallest at the headwaters
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * TAU;
      const hh = H * (0.5 + r() * 0.7);
      b.cone(R * (0.16 + r() * 0.08), hh, i % 3 ? G.rockDk : G.rock,
        { x: Math.cos(a) * R * 1.0, y: hh * 0.5, z: Math.sin(a) * R * 1.0 }, 8);
      if (hh > H * 0.95) b.cone(R * 0.06, hh * 0.28, G.snow,
        { x: Math.cos(a) * R * 1.0, y: hh * 0.88, z: Math.sin(a) * R * 1.0 }, 6);
    }
    // the trunk, meandering across the basin
    const ph = v * 1.3;
    for (let i = 0; i < 11; i++) {
      const t = (i / 10 - 0.5) * R * 1.8;
      const z = Math.sin(t / R * 2.4 + ph) * R * 0.46;
      const z2 = Math.sin((t + R * 0.2) / R * 2.4 + ph) * R * 0.46;
      b.boxOn(R * 0.24, H * 0.09, R * 0.13, G.river,
        { x: t, y: H * 0.28, z, ry: -Math.atan2(z2 - z, R * 0.2) });
      if (i % 3 === 1) {
        b.ellip(R * 0.09, H * 0.03, R * 0.05, G.lake, { x: t, y: H * 0.3, z: z + R * 0.14 }, 8, 3);
      }
    }
    // the tributaries, reaching in from the divide to meet it
    for (let i = 0; i < 7; i++) {
      const a = 0.4 + (i / 6) * (TAU - 0.8);
      for (let k = 0; k < 3; k++) {
        const d = R * (0.92 - k * 0.26);
        b.boxOn(R * 0.07, H * 0.07, R * 0.3, G.river,
          { x: Math.cos(a) * d, y: H * 0.28, z: Math.sin(a) * d, ry: -a + 1.57 });
      }
    }
    // the delta at the mouth, and forest through the middle of the basin
    b.ellip(R * 0.3, H * 0.06, R * 0.2, G.silt, { x: R * 0.98, y: H * 0.26, z: 0 }, 10, 4);
    for (let i = 0; i < 9; i++) {
      const a = r() * TAU, d = R * 0.72 * Math.sqrt(r());
      b.sphere(R * 0.07, i % 2 ? G.forest : G.forestDk,
        { x: Math.cos(a) * d, y: H * 0.3, z: Math.sin(a) * d }, 6, 4);
    }
  } });

/* A cordillera: two arcs of peaks with an altiplano between them, volcanoes on
   the inner arc, ice on the outer, and one great canyon draining it. */
P({ id: 'wd_cordillera', name: 'Cordillera', cat: 'nature', fill: 0.34, variants: 3, weight: 9,
  build(b, r, v) {
    const S = RUNG.wd_cordillera;
    const rad = S * 1.15, H = S * 1.5;
    const sweep = 3.0 + v * 0.2;
    // the uplifted mass, as pads along both arcs and the plateau between
    for (let i = 0; i < 11; i++) {
      const a = -sweep / 2 + (i / 10) * sweep;
      for (const f of [0.78, 1.0, 1.22]) {
        b.cylOn(rad * 0.3, H * (f === 1.0 ? 0.3 : 0.22), f === 1.0 ? G.steppe : G.rockDk,
          { x: Math.cos(a) * rad * f, z: Math.sin(a) * rad * f }, 8);
      }
    }
    /* The two arcs stand at DIFFERENT foot heights, which is not decoration: a
       cone's base is a horizontal face, so two arcs of differently-coloured
       cones sharing one `y` put twenty of those faces in one plane and the
       inner range shimmers across all of them. */
    arcPeaks(b, rad * 1.22, sweep, 0, H, 12, r, G.rock, G.snow, H * 0.2, 0.1);
    arcPeaks(b, rad * 0.78, sweep * 0.96, 0.1, H * 0.86, 11, r, G.rockDk, G.ice, H * 0.27, 0.12);
    arcPeaks(b, rad * 1.5, sweep * 1.02, -0.08, H * 0.4, 10, r, G.scree, G.rock, 0, 0.2);
    // volcanoes on the inner arc
    for (let i = 0; i < 4; i++) {
      const a = -sweep / 2 + (0.15 + i * 0.24) * sweep;
      const px = Math.cos(a) * rad * 0.86, pz = Math.sin(a) * rad * 0.86;
      b.cone(rad * 0.14, H * 1.15, G.basalt, { x: px, y: H * 0.28 + H * 0.575, z: pz }, 9);
      b.cone(rad * 0.05, H * 0.16, i % 2 ? G.lava : G.snow, { x: px, y: H * 0.28 + H * 1.06, z: pz }, 7);
    }
    // the altiplano: salt pans and a high lake on it
    for (let i = 0; i < 4; i++) {
      const a = -sweep / 2 + (0.2 + i * 0.2) * sweep;
      b.ellip(rad * 0.15, H * 0.03, rad * 0.1, i % 2 ? G.salt : G.lake,
        { x: Math.cos(a) * rad, y: H * 0.31, z: Math.sin(a) * rad, ry: -a }, 9, 3);
    }
    // the canyon draining the whole thing, out through the outer arc
    for (let i = 0; i < 4; i++) {
      const d = rad * (1.0 + i * 0.2);
      b.boxOn(rad * 0.16, H * 0.06, rad * 0.24, G.river,
        { x: Math.cos(-sweep / 2 + 0.1) * d, y: H * 0.24, z: Math.sin(-sweep / 2 + 0.1) * d, ry: sweep / 2 });
    }
    // glaciers off the outer face
    for (let i = 0; i < 6; i++) {
      const a = -sweep / 2 + (i / 5) * sweep;
      b.boxOn(rad * 0.07, H * 0.1, rad * 0.3, G.iceBlue,
        { x: Math.cos(a) * rad * 1.38, y: H * 0.12, z: Math.sin(a) * rad * 1.38, ry: -a + 1.57, rx: -0.1 });
    }
  } });

P({ id: 'wd_icesheet', name: 'Ice Sheet', cat: 'ice', fill: 0.38, variants: 3, weight: 8,
  build(b, r, v) {
    const S = RUNG.wd_icesheet;
    const R = S * 1.25, H = S * 1.0;
    b.cylOn(R, H * 0.2, G.iceBlue, {}, 14);
    b.dome(R * 0.92, G.snow, { y: H * 0.19 }, 13);
    // the rock coast showing through on one side
    for (let i = 0; i < 6; i++) {
      const a = 1.4 + (i / 5) * 1.6;
      b.boxOn(R * 0.2, H * 0.24, R * 0.3, G.granite,
        { x: Math.cos(a) * R * 0.98, z: Math.sin(a) * R * 0.98, ry: -a });
    }
    // the ice shelf, and the front it calves off
    for (let i = 0; i < 7; i++) {
      const a = -1.5 + (i / 6) * 1.9;
      b.boxOn(R * 0.3, H * 0.16, R * 0.4, G.ice,
        { x: Math.cos(a) * R * 1.06, z: Math.sin(a) * R * 1.06, ry: -a });
      b.boxOn(R * 0.26, H * 0.05, R * 0.34, G.iceDeep,
        { x: Math.cos(a) * R * 1.06, y: H * 0.15, z: Math.sin(a) * R * 1.06, ry: -a });
    }
    for (let i = 0; i < 7; i++) {
      const a = -1.5 + r() * 1.9;
      const hh = H * (0.1 + r() * 0.14);
      b.boxOn(R * 0.09, hh, R * 0.08, i % 3 ? G.ice : G.iceBlue,
        { x: Math.cos(a) * R * (1.24 + r() * 0.2), z: Math.sin(a) * R * (1.24 + r() * 0.2), ry: r() * 3 });
    }
    // outlet glaciers grooved down the flanks, nunataks, and the melt lakes
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU + v * 0.3;
      b.boxOn(R * 0.16, H * 0.16, R * 0.46, G.ice,
        { x: Math.cos(a) * R * 0.8, y: H * 0.16, z: Math.sin(a) * R * 0.8, ry: -a + 1.57 });
    }
    for (let i = 0; i < 6; i++) {
      const a = r() * TAU, d = R * (0.5 + r() * 0.42);
      b.cone(R * 0.07, H * 0.4, G.rockDk, { x: Math.cos(a) * d, y: H * 0.3, z: Math.sin(a) * d }, 7);
    }
    for (let i = 0; i < 9; i++) {
      const a = r() * TAU, d = R * 0.72 * Math.sqrt(r());
      const dome = Math.sqrt(Math.max(0, 1 - (d / (R * 0.92)) ** 2));
      b.ellip(R * 0.08, H * 0.02, R * 0.055, G.iceDeep,
        { x: Math.cos(a) * d, y: H * 0.19 + dome * H * 0.84, z: Math.sin(a) * d, ry: r() * 3.1 }, 8, 3);
    }
  } });

P({ id: 'wd_desertbelt', name: 'Desert Belt', cat: 'nature', fill: 0.32, variants: 3, weight: 8,
  build(b, r, v) {
    const S = RUNG.wd_desertbelt;
    const R = S * 1.35, H = S * 0.95;
    b.cylOn(R, H * 0.28, G.sandDeep, {}, 14);
    b.cylOn(R * 0.97, H * 0.08, G.sand, { y: H * 0.27 }, 13);
    // three separate dune fields, each combed by its own wind
    for (let k = 0; k < 3; k++) {
      const ang = 0.4 + k * 1.1 + v * 0.3;
      const cx = Math.cos(k * 2.1 + v) * R * 0.46, cz = Math.sin(k * 2.1 + v) * R * 0.46;
      for (let i = 0; i < 7; i++) {
        const off = (i / 6 - 0.5) * R * 0.8;
        const len = R * 0.8 * Math.sqrt(Math.max(0.06, 1 - (off / (R * 0.44)) ** 2));
        b.wedge(len, H * (0.16 + r() * 0.2), R * 0.06, G.sand,
          { x: cx - Math.sin(ang) * off, y: H * 0.35, z: cz + Math.cos(ang) * off, ry: ang });
      }
    }
    // the bare rock massif in the middle of it, and its escarpment
    b.cylOn(R * 0.26, H * 0.6, G.rockDk, { y: H * 0.3 }, 10);
    b.cylOn(R * 0.22, H * 0.08, G.rock, { y: H * 0.88 }, 10);
    peaks(b, R * 0.34, H * 0.5, r, 0.5 + v, 5, G.rockDk, G.rock, H * 0.9);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU;
      b.boxOn(R * 0.14, H * 0.3, R * 0.2, G.rock,
        { x: Math.cos(a) * R * 0.36, y: H * 0.3, z: Math.sin(a) * R * 0.36, ry: -a });
    }
    // salt pans in the low ground, wadis running off the massif, one oasis
    for (let i = 0; i < 4; i++) {
      const a = r() * TAU, d = R * (0.5 + r() * 0.34);
      b.ellip(R * 0.14, H * 0.02, R * 0.1, i % 2 ? G.salt : G.saltDk,
        { x: Math.cos(a) * d, y: H * 0.36, z: Math.sin(a) * d, ry: r() * 3.1 }, 10, 3);
    }
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + 0.3;
      for (let k = 0; k < 2; k++) {
        b.boxOn(R * 0.06, H * 0.05, R * 0.3, G.silt,
          { x: Math.cos(a) * R * (0.44 + k * 0.26), y: H * 0.36, z: Math.sin(a) * R * (0.44 + k * 0.26), ry: -a + 1.57 });
      }
    }
    b.ellip(R * 0.1, H * 0.025, R * 0.08, G.lagoon, { x: -R * 0.5, y: H * 0.37, z: R * 0.44 }, 9, 3);
    for (let i = 0; i < 4; i++) {
      const a = r() * TAU;
      b.sphere(R * 0.035, G.jungle,
        { x: -R * 0.5 + Math.cos(a) * R * 0.12, y: H * 0.42, z: R * 0.44 + Math.sin(a) * R * 0.12 }, 6, 4);
    }
    // the escarpment that ends the belt on one side
    for (let i = 0; i < 6; i++) {
      const a = 2.2 + (i / 5) * 1.3;
      b.boxOn(R * 0.2, H * 0.34, R * 0.3, G.sandDeep,
        { x: Math.cos(a) * R * 0.86, y: H * 0.28, z: Math.sin(a) * R * 0.86, ry: -a });
    }
  } });

/* ==================================================================
   THINGS A PLANET IS MADE OF — 5,872km to 13,775km

   These carry most of the stage's mass between them, because mass is
   `pickup^3 * fill` and nothing else here is within a factor of two of them.
   Every number below is therefore load-bearing twice over: it sets what the
   ball has to be to swallow the thing, AND it sets the biggest ball that can
   ever exist. See the note at the top of the file.
   ================================================================== */

P({ id: 'wd_archipelago', name: 'Archipelago Chain', cat: 'sea', surface: 'water',
  fill: 0.20, variants: 3, weight: 7,
  build(b, r, v) {
    const S = RUNG.wd_archipelago;
    const rad = S * 1.1, H = S * 0.52;
    const sweep = 3.2 + v * 0.2;
    const N = 9;
    // the shallow shelf the whole chain stands on, as a run of pads
    for (let i = 0; i < N; i++) {
      const a = -sweep / 2 + (i / (N - 1)) * sweep;
      b.cylOn(rad * 0.34, H * 0.07, i % 2 ? G.lagoon : G.shelf,
        { x: Math.cos(a) * rad, z: Math.sin(a) * rad }, 9);
    }
    for (let i = 0; i < N; i++) {
      const a = -sweep / 2 + (i / (N - 1)) * sweep;
      const jog = (r() - 0.5) * 0.12;
      const px = Math.cos(a + jog) * rad * (0.94 + r() * 0.14);
      const pz = Math.sin(a + jog) * rad * (0.94 + r() * 0.14);
      const rr = rad * (0.1 + r() * 0.1);
      const hh = H * (0.7 + r() * 0.8);
      b.cylOn(rr * 1.2, hh * 0.12, G.shelf, { x: px, z: pz }, 9);
      b.cylOn(rr, hh, G.rockDk, { x: px, z: pz }, 10);
      b.cyl(rr * 0.96, rr * 0.96, hh * 0.2, r() < 0.5 ? G.jungle : G.forest,
        { x: px, y: hh * 1.02, z: pz }, 10);
      // every other island is a volcano, which is how island arcs work
      if (i % 2 === 0) {
        b.cone(rr * 0.52, hh * 1.0, G.basalt, { x: px, y: hh * 1.6, z: pz }, 8);
        if (i % 4 === 0) b.cone(rr * 0.18, hh * 0.2, G.lava, { x: px, y: hh * 2.06, z: pz }, 6);
      }
      for (let k = 0; k < 3; k++) {
        const ka = r() * TAU, kd = rr * 0.66 * r();
        b.sphere(rr * 0.2, G.jungleDk, { x: px + Math.cos(ka) * kd, y: hh * 1.16, z: pz + Math.sin(ka) * kd }, 6, 4);
      }
    }
    // reefs and atolls strung between the islands
    for (let i = 0; i < 8; i++) {
      const a = -sweep / 2 + r() * sweep;
      const d = rad * (0.8 + r() * 0.4);
      b.ellip(rad * 0.1, H * 0.06, rad * 0.07, i % 2 ? G.coral : G.lagoon,
        { x: Math.cos(a) * d, y: H * 0.05, z: Math.sin(a) * d, ry: -a }, 8, 3);
    }
  } });

P({ id: 'wd_inland_sea', name: 'Inland Sea', cat: 'sea', surface: 'water',
  fill: 0.34, variants: 3, weight: 7,
  build(b, r, v) {
    const S = RUNG.wd_inland_sea;
    const R = S * 1.25, H = S * 1.0;
    const surf = basin(b, R, H, r, {
      shore: G.landDry, rim: G.rockDk, crest: G.steppe,
      water: G.ocean, deep: G.oceanDeep,
      n: 20, gap: 10, gapAt: 7 - v, wobble: 0.13, phase: v * 1.7,
    });
    // the mountains behind the shore, which is what pens a sea in
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      const hh = H * (0.7 + r() * 0.8);
      b.cone(R * (0.16 + r() * 0.08), hh, i % 3 ? G.rock : G.rockDk,
        { x: Math.cos(a) * R * 1.16, y: hh * 0.5, z: Math.sin(a) * R * 1.16 }, 8);
      if (hh > H * 1.2) b.cone(R * 0.06, hh * 0.26, G.snow,
        { x: Math.cos(a) * R * 1.16, y: hh * 0.88, z: Math.sin(a) * R * 1.16 }, 6);
    }
    // islands, peninsulas reaching in, and the strait out to the ocean
    for (let i = 0; i < 7; i++) {
      const a = r() * TAU, d = R * 0.56 * Math.sqrt(r());
      const px = Math.cos(a) * d, pz = Math.sin(a) * d;
      b.cylOn(R * (0.05 + r() * 0.06), H * 0.2, G.rockDk, { x: px, y: surf - H * 0.06, z: pz }, 8);
      b.sphere(R * 0.05, i % 2 ? G.forest : G.landDry, { x: px, y: surf + H * 0.15, z: pz }, 6, 4);
    }
    for (let i = 0; i < 3; i++) {
      const a = 0.6 + i * 2.1 + v;
      for (let k = 0; k < 3; k++) {
        const d = R * (0.78 - k * 0.2);
        b.cylOn(R * (0.14 - k * 0.03), H * 0.42, i % 2 ? G.landDry : G.land,
          { x: Math.cos(a) * d, z: Math.sin(a) * d }, 9);
      }
    }
    const sa = ((7 - v) / 20) * TAU;
    b.boxOn(R * 0.24, surf * 0.9, R * 0.6, G.ocean,
      { x: Math.cos(sa) * R * 1.0, z: Math.sin(sa) * R * 1.0, ry: -sa + 1.57 });
    // a delta at the mouth of the river that feeds it
    b.ellip(R * 0.2, H * 0.06, R * 0.14, G.silt, { x: -R * 0.7, y: surf - H * 0.02, z: R * 0.5 }, 10, 4);
  } });

P({ id: 'wd_continent', name: 'Continent', cat: 'land', fill: 0.55, variants: 3, weight: 6,
  build(b, r, v) {
    const S = RUNG.wd_continent;
    const R = S * 1.05, H = S * 0.6;
    const biome = [G.land, G.steppe, G.forest][v];
    const lobes = landmass(b, R, H, r, G.rockDk, biome, 6);
    const top = lobes[0][3];
    // the biomes, each on its own plane so no two discs z-fight
    for (let i = 0; i < 7; i++) {
      const a = r() * TAU, d = R * 0.6 * Math.sqrt(r());
      b.cylOn(R * (0.14 + r() * 0.2), H * 0.05, [G.jungle, G.landDry, G.forest, G.steppe][i % 4],
        { x: Math.cos(a) * d, y: top - H * 0.02 - i * H * 0.001, z: Math.sin(a) * d }, 9);
    }
    b.cylOn(R * 0.36, H * 0.07, G.sand, { x: R * 0.24, y: top - H * 0.034, z: -R * 0.2 }, 10);
    b.cylOn(R * 0.3, H * 0.05, G.sandDeep, { x: R * 0.3, y: top - H * 0.02, z: -R * 0.26 }, 9);
    b.cylOn(R * 0.32, H * 0.08, G.snow, { x: -R * 0.3, y: top - H * 0.048, z: -R * 0.42 }, 10);
    // an inland sea in its own basin — both discs need their own plane, or a
    // shelf sharing a biome patch's height z-fights across the overlap
    b.cylOn(R * 0.2, H * 0.06, G.shelf, { x: -R * 0.28, y: top - H * 0.062, z: R * 0.3 }, 10);
    b.cylOn(R * 0.15, H * 0.05, G.ocean, { x: -R * 0.28, y: top - H * 0.078, z: R * 0.3 }, 10);
    // three ranges, arced, with the rivers coming off them
    for (let i = 0; i < 3; i++) {
      arcPeaks(b, R * (0.4 + r() * 0.24), 2.2 + r(), r() * TAU, H * (0.5 + r() * 0.3),
        8, r, G.rock, G.snow, top - H * 0.03, 0.16);
    }
    for (let i = 0; i < 3; i++) {
      const a = r() * TAU;
      for (let k = 0; k < 4; k++) {
        const d = R * (0.16 + k * 0.24);
        b.boxOn(R * 0.05, H * 0.035, R * 0.24, G.river,
          { x: Math.cos(a + k * 0.3) * d, y: top - H * 0.026, z: Math.sin(a + k * 0.3) * d, ry: -a - k * 0.3 + 1.57 });
      }
    }
    // forest cover, deserts of dune, and the great lakes
    for (let i = 0; i < 16; i++) {
      const p = lobes[Math.floor(r() * lobes.length)];
      const a = r() * TAU, d = p[2] * 0.8 * Math.sqrt(r());
      b.sphere(R * (0.028 + r() * 0.03), r() < 0.5 ? G.jungle : G.forestDk,
        { x: p[0] + Math.cos(a) * d, y: p[3], z: p[1] + Math.sin(a) * d }, 6, 4);
    }
    for (let i = 0; i < 4; i++) {
      const a = r() * TAU, d = R * 0.52 * Math.sqrt(r());
      b.ellip(R * 0.08, H * 0.03, R * 0.06, G.lake,
        { x: Math.cos(a) * d, y: top + H * 0.005, z: Math.sin(a) * d, ry: r() * 3.1 }, 9, 3);
    }
    for (let i = 0; i < 5; i++) {
      b.wedge(R * (0.2 + r() * 0.14), H * 0.06, R * 0.05, G.sand,
        { x: R * (0.14 + r() * 0.3), y: top - H * 0.01, z: -R * (0.1 + r() * 0.3), ry: 0.6 + r() * 0.4 });
    }
  } });

/* An ocean, drawn as the rimmed thing it is: continental margins round the
   outside carrying all the height, the abyssal floor sunk in three shades
   inside them, and a mid-ocean ridge arcing down the middle of it. A flat
   plate of water would read as a bridge; a bowl reads as a hole. */
P({ id: 'wd_ocean', name: 'Ocean', cat: 'sea', surface: 'water',
  fill: 0.40, variants: 3, weight: 5,
  build(b, r, v) {
    const S = RUNG.wd_ocean;
    const R = S * 1.5, H = S * 0.86;
    // the margins, with the gaps where the straits are
    const N = 18;
    for (let i = 0; i < N; i++) {
      if (i % 7 === 5 - v) continue;
      const a = (i / N) * TAU;
      const hh = H * (0.6 + r() * 0.5);
      b.boxOn(R * 0.3, hh, R * 0.42, i % 3 ? G.rockDk : G.crust,
        { x: Math.cos(a) * R * 0.92, y: -H * 0.1, z: Math.sin(a) * R * 0.92, ry: -a });
      b.ellip(R * 0.16, hh * 0.14, R * 0.11, i % 2 ? G.shelf : G.land,
        { x: Math.cos(a) * R * 0.94, y: hh * 0.88, z: Math.sin(a) * R * 0.94, ry: -a }, 8, 4);
    }
    // the floor
    b.cylOn(R * 0.94, H * 0.24, G.ocean, {}, 14);
    b.cylOn(R * 0.76, H * 0.07, G.oceanDeep, { y: H * 0.23 }, 13);
    b.cylOn(R * 0.46, H * 0.05, G.abyss, { y: H * 0.29 }, 12);
    // the mid-ocean ridge, arced across it, with the rift down its crest
    const rphase = v * 1.1;
    arcPeaks(b, R * 0.5, 3.4, rphase, H * 0.44, 13, r, G.basalt, G.rockDk, H * 0.3, 0.22);
    for (let i = 0; i < 9; i++) {
      const a = rphase + (i / 8 - 0.5) * 3.4;
      b.boxOn(R * 0.06, H * 0.06, R * 0.16, G.abyss,
        { x: Math.cos(a) * R * 0.5, y: H * 0.4, z: Math.sin(a) * R * 0.5, ry: -a + 1.57 });
    }
    // a trench with its island arc behind it
    for (let i = 0; i < 8; i++) {
      const a = 1.2 + (i / 7) * 1.5;
      b.boxOn(R * 0.1, H * 0.16, R * 0.24, G.abyss,
        { x: Math.cos(a) * R * 0.8, y: H * 0.18, z: Math.sin(a) * R * 0.8, ry: -a });
      const hh = H * (0.4 + r() * 0.4);
      b.cone(R * 0.07, hh, G.basalt,
        { x: Math.cos(a) * R * 0.66, y: H * 0.3 + hh * 0.5, z: Math.sin(a) * R * 0.66 }, 8);
      if (i % 2 === 0) b.cyl(R * 0.05, R * 0.05, H * 0.04, G.jungle,
        { x: Math.cos(a) * R * 0.66, y: H * 0.3 + hh, z: Math.sin(a) * R * 0.66 }, 8);
    }
    // seamount chains, atolls on the drowned ones
    for (let k = 0; k < 3; k++) {
      const ca = r() * TAU;
      for (let i = 0; i < 5; i++) {
        const d = R * (0.2 + i * 0.14);
        const hh = H * (0.3 + r() * 0.45);
        const px = Math.cos(ca + i * 0.18) * d, pz = Math.sin(ca + i * 0.18) * d;
        b.cone(R * 0.055, hh, G.rockDk, { x: px, y: H * 0.3 + hh * 0.5, z: pz }, 7);
        if (i % 2) b.ellip(R * 0.05, H * 0.02, R * 0.04, G.lagoon, { x: px, y: H * 0.3 + hh, z: pz }, 8, 3);
      }
    }
    // and the gyre of weather standing over the whole thing
    for (let i = 0; i < 10; i++) {
      const a = r() * TAU, d = R * 0.8 * Math.sqrt(r());
      b.ellip(R * (0.12 + r() * 0.08), H * 0.05, R * 0.09, i % 3 ? G.cloud : G.cloudGrey,
        { x: Math.cos(a) * d, y: H * (0.62 + r() * 0.3), z: Math.sin(a) * d, ry: -a }, 8, 4);
    }
  } });

/* ==================================================================
   THE PLANET — the top of the ladder and the last thing eaten.

   The goal is 51.2 units, which at 250km a unit is 12,800km against Earth's
   real 12,742km. So this is the prize the whole stage is aimed at, and it is
   deliberately a rung ABOVE the goal: you become the size of the world, and
   then you eat one.
 *
 * A prop is collectable when `pickup <= diameter * 0.88`, and the largest
 * diameter that can ever exist is `cbrt(6 * stageMass * 0.48 / pi)` — both out
 * of the same stage, authored independently, so they can and do cross. When
 * they cross the object sits there at the end of every run being the thing you
 * did not get, and it reads as a physics bug rather than as arithmetic. The
 * city shipped that twice and the country stage once.
 *
 * Two levers and they pull opposite ways. Shrinking R lowers the pickup but
 * also lowers the stage's mass — this one body is a fifth of it — so the
 * ceiling comes down with it. Raising `fill` adds mass without touching the
 * pickup, so it lifts the ceiling on its own.
 *
 * Do not tune either number without re-running `balance --only=world` and
 * reading `too big to ever collect`.
   ================================================================== */

P({ id: 'wd_planet', name: 'The Planet', cat: 'body', fill: 0.58, variants: 3, weight: 4,
  build(b, r, v) {
    const R = RUNG.wd_planet;
    b.sphere(R, G.ocean, { y: R }, 12, 8);
    // the deeps, in overlapping clusters so they read as basins
    for (let i = 0; i < 4; i++) {
      const rx = Math.acos(1 - 2 * r()), ry = r() * TAU;
      for (let k = 0; k < 3; k++) {
        patch(b, R, rx + (r() - 0.5) * 0.55, ry + (r() - 0.5) * 0.8,
          R * (0.14 + r() * 0.16), 0.1,
          [G.oceanDeep, G.abyss, G.shelf][(i + k) % 3], 0.951 + k * 0.013);
      }
    }
    // the continents: clusters of tangent discs, each cluster its own landmass,
    // with a shelf round the biggest lobe of it
    for (let i = 0; i < 6; i++) {
      const rx = Math.acos(1 - 2 * r()), ry = r() * TAU;
      patch(b, R, rx, ry, R * 0.24, 0.09, G.shelf, 0.964, 9, 1.1);
      for (let k = 0; k < 5; k++) {
        patch(b, R, rx + (r() - 0.5) * 0.7, ry + (r() - 0.5) * 0.95,
          R * (0.1 + r() * 0.14), 0.1,
          [G.land, G.jungle, G.steppe, G.forest, G.landDry][(i + k + v) % 5],
          0.984 + k * 0.011, 8, 1.08);
      }
    }
    // the deserts, on the two dry latitudes where they belong
    for (let i = 0; i < 4; i++) {
      const rx = 1.05 + (r() - 0.5) * 0.55, ry = r() * TAU;
      patch(b, R, rx, ry, R * 0.12, 0.1, i ? G.sand : G.sandDeep, 1.042 + i * 0.006, 8, 1.1);
    }
    // two mountain chains, and the great rivers coming off them
    for (let c = 0; c < 2; c++) {
      const ryM = r() * TAU;
      for (let i = 0; i < 8; i++) {
        patch(b, R, 0.7 + i * 0.14, ryM + Math.sin(i * 0.6 + c) * 0.24,
          R * 0.04, 0.1, i % 2 ? G.rock : G.snow, 1.054 + (i % 3) * 0.006, 6, 1.6);
      }
    }
    for (let i = 0; i < 4; i++) {
      const rx = Math.acos(1 - 2 * r()), ry = r() * TAU;
      patch(b, R, rx, ry, R * 0.05, 0.1, i % 2 ? G.river : G.lake, 1.068 + i * 0.006, 7, 1.1);
    }
    // ice at both poles, and the weather that never stops
    caps(b, R, G.snow, 0.32, r);
    weather(b, R, 17, G.cloud, r, 1.024);
    weather(b, R, 6, G.cloudGrey, r, 1.044);
    // one cyclone, sitting on the ocean where you would see it from up here
    {
      const rx = 0.8 + r() * 1.4, ry = r() * TAU, d = dirV(rx, ry);
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * TAU;
        patch(b, R, rx + Math.cos(a) * 0.14, ry + Math.sin(a) * 0.2,
          R * 0.03, 0.09, G.cloud, 1.09 + (i % 3) * 0.007, 6, 1.3);
      }
      b.ellip(R * 0.02, R * 0.02, R * 0.02, G.storm,
        { x: d.x * R * 1.1, y: R + d.y * R * 1.1, z: d.z * R * 1.1 }, 6, 4);
    }
    // the terminator: a band of city light on the night side, the only sign
    // anybody lives here
    const ryN = r() * TAU;
    for (let i = 0; i < 8; i++) {
      patch(b, R, 0.5 + i * 0.26, ryN + (r() - 0.5) * 0.5,
        R * 0.03, 0.09, G.lamp, 1.104 + (i % 3) * 0.007, 6, 1.3);
    }
  } });
