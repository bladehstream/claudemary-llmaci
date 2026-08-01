/* ============================================================
   The Solar System — everything in orbit around one star.

   ONE WORLD UNIT IS ONE GIGAMETRE (a million kilometres). A
   moon is 0.11 units across because a moon is 110Mm across in
   this stage's reading of the sky, and the physics never learns
   the difference. See the note above TIERS in util/math.js for
   why this is NOT authored in true metres: every epsilon in the
   engine carries an absolute number, and a body 1.4e9 m wide
   would walk straight through all of them.

   The ladder runs 15Mm (a dust grain) to 1Gm392Mm (the Sun) as
   authored, and the stage scales its landmarks up to about
   1Gm900Mm. Rungs are packed tightest between 40Mm and 1Gm,
   which is where the round is actually played.

   THE SUN IS THE LAST RUNG AND IT IS 1Gm392Mm ACROSS, which is
   the real number and also the reason the stage's goal is 1Gm600Mm:
   you have to be able to swallow the star and come out slightly
   bigger than it. Re-sizing `sun` therefore moves two things at
   once — the size you need to eat it (`pickup / 0.88`) and, because
   it is a fifth of the stage's whole mass, the size you can ever
   reach. `node tools/balance.mjs --only=solar` prints both; read
   "too big to ever collect" before and after touching it.

   NOTHING HERE IS LONG AND THIN. Collision radius is half the
   longest HORIZONTAL span while pickup is the cube root of the
   box, so a wide flat ring is a fence that reads as a pebble. The
   ring systems are tilted about 40 degrees so their span buys
   height instead of floor, the tails and streams are stubby and
   angled upward, and the arcs (prominences, coronal loops) are
   taller than they are wide.
   ============================================================ */

import { defineProp } from './index.js';
import { C } from '../../render/palette.js';
import {
  gradedDisc, ring, shell, jet, prominence, swarm, wisps, core,
} from './spacekit.js';

const TAU = Math.PI * 2;

/** Every prop on this stage reads in gigametres. */
const U = 'giga';

/**
 * Tag, category and unit are identical on all thirty of these and all three are
 * load-bearing: no tag and the stage's scatter pool is empty, no unit and the
 * collection log prints a star as a bare number next to a speck of dust.
 */
const P = (def) => defineProp({ cat: 'solar', tags: ['solar'], unit: U, ...def });

/* ------------------------------------------------------------------
   A dark sky lit by exactly one thing.

   Not in palette.js on purpose: that set is a toy-box of bright plastics and
   painted wood, and it has no deep-space blue-black, no photosphere gold and no
   methane cyan. Two families here and they mean opposite ends of the map — warm
   golds and oranges for anything near the star, icy blues and whites for the
   outer bodies. Exported so the stage's terrain can paint its orbital tracks and
   its solar limb out of the same tin as the props standing on them; nothing else
   should reach for it.
   ------------------------------------------------------------------ */
export const S = {
  /* rock, regolith, dust */
  dust:      0x6f645a,
  dustPale:  0x968878,
  rock:      0x8b7d6d,
  rockLt:    0xa89684,
  rockDk:    0x584d44,
  basalt:    0x463f46,
  regolith:  0x796a5c,
  crater:    0x4d443c,
  rust:      0xa9673c,
  rustDk:    0x74422a,

  /* ices, and the cold end of the map */
  ice:       0xd9edf8,
  icePale:   0xf1f8ff,
  iceDeep:   0x9cc9e6,
  iceBlue:   0x77aedd,
  iceShadow: 0x4a76a4,
  frostDk:   0x2f4f76,

  /* atmospheres */
  methane:   0x5cc7d8,
  methaneDk: 0x2d86a6,
  ammonia:   0xbfe6ea,
  ocean:     0x21538f,
  oceanDeep: 0x143460,
  cloud:     0xeaf1fa,
  cloudWarm: 0xf7e5c4,

  /* gas-giant belts */
  band:      0xe9ba79,
  bandDk:    0xb87f47,
  bandPale:  0xf8ddb0,
  storm:     0xd8563c,
  stormDk:   0x9c3524,

  /* the star */
  photo:     0xffc94f,
  photoHot:  0xfff3b4,
  limb:      0xff9a2c,
  plasma:    0xff7828,
  plasmaPl:  0xffc169,
  corona:    0xffe3a6,
  umbra:     0x82401a,
  penumbra:  0xc76d1e,

  /* fields and plasma at a distance */
  field:     0x7286dd,
  fieldDim:  0x3a4795,
  wind:      0x8ed6ff,
  windDim:   0x4783c2,
  aurora:    0x6ce0b4,

  /* volcanic */
  lava:      0xff6b2b,
  sulfur:    0xe6c249,
  ash:       0x39333c,
};

/* ------------------------------------------------------------------
   BASE SIZES.

   One number per archetype, and every dimension in that archetype's build is a
   multiple of it, so a rung can be moved without redrawing the body. `pickup`
   is the cube root of the bounding box, which for these shapes lands between
   1.5x and 2x the base size — the table below was solved against the measured
   result rather than guessed, so do not "tidy" the decimals.

   The rungs step up by 20-30% each from 15Mm to 1Gm and by ~10% above that.
   `balance` calls anything over 1.55x a hole in the ladder.
   ------------------------------------------------------------------ */
const SZ = {
  dust:        0.00888,   // 15Mm
  meteoroid:   0.01162,   // 21
  zodiacal:    0.01586,   // 26
  asteroid:    0.01612,   // 33
  rubble:      0.02735,   // 43
  comet:       0.02215,   // 56
  kbo:         0.03860,   // 73
  shepherd:    0.04929,   // 92
  moonlet:     0.06047,   // 115
  wind:        0.10487,   // 138
  centaur:     0.08201,   // 160
  moonCrater:  0.08873,   // 185
  beltCluster: 0.11635,   // 215
  moonIce:     0.10518,   // 250
  moonVolcano: 0.12423,   // 285
  trojan:      0.15994,   // 330
  dwarf:       0.17248,   // 380
  magnetotail: 0.23997,   // 430
  sunspot:     0.27920,   // 490
  bowshock:    0.40847,   // 550
  rocky:       0.28429,   // 620
  ocean:       0.29074,   // 710
  loop:        0.44739,   // 780
  icegiant:    0.31878,   // 850
  flare:       0.37390,   // 930
  gasgiant:    0.44493,   // 990Mm
  ring:        0.68210,   // 1Gm060
  prominence:  0.55151,   // 1Gm100
  heliopause:  0.61394,   // 1Gm180
  sun:         0.57525,   // 1Gm392 — the real number, see the note on `sol_sun`
};

/* ------------------------------------------------------------------
   Shared builders. A cratered moon, a dwarf planet and a rocky planet are the
   same drawing three times over at different sizes and with different paint,
   and writing that three times over is how they end up subtly inconsistent.
   ------------------------------------------------------------------ */

/**
 * An irregular body: a squashed core with a few lobes welded on.
 * Every lobe is kept inside the core's own X/Z extent so the bounding box —
 * and therefore `pickup` — is set by the core alone.
 */
function lump(b, Z, r, col, colDk, lobes = 4) {
  b.ellip(Z, Z * 0.84, Z * 0.92, col, { y: Z * 0.84 }, 9, 6);
  for (let i = 0; i < lobes; i++) {
    const a = (i / lobes) * TAU + r() * 0.7;
    const d = Z * 0.42;
    b.ellip(Z * 0.46, Z * 0.4, Z * 0.44, i % 2 ? colDk : col, {
      x: Math.cos(a) * d, y: Z * (0.58 + (i % 3) * 0.16), z: Math.sin(a) * d,
    }, 7, 5);
  }
}

/** Unit vector from two spherical angles, plus the YXZ rotation that points +Y along it. */
function surf(a, e) {
  const se = Math.sin(e);
  const x = se * Math.cos(a), y = Math.cos(e), z = se * Math.sin(a);
  return { x, y, z, rz: -Math.atan2(x, y), rx: Math.atan2(z, y) };
}

/**
 * Impact basins on a spherical body of radius Z centred at (0, Z, 0).
 *
 * Drawn as thin discs lying FLAT ON the surface, not as bumps: a crater is a
 * hole and a hole cannot be modelled by adding a sphere. The disc is set a
 * hair inside the surface so it reads as a floor rather than a lid, and some
 * of them get an ejecta ring one step further out.
 *
 * THE DARK BASIN HAS TO WIN. The first draft put the pale ring at 1.45x the
 * basin, which is 52% of the crater's area in the light colour — the moons came
 * out mottled with white hexagons rather than pitted. 1.18x leaves the ring as
 * a hairline, which is what an ejecta blanket looks like from a million
 * kilometres off, and nine segments stop a small disc reading as a hexagon.
 */
function craters(b, Z, r, n, dark, rim) {
  for (let i = 0; i < n; i++) {
    const s = surf(r() * TAU, Math.acos(1 - 2 * r()));
    const rr = Z * (0.13 + r() * 0.17);
    const o = { x: s.x * Z * 0.965, y: Z + s.y * Z * 0.965, z: s.z * Z * 0.965, rx: s.rx, rz: s.rz };
    if (r() < 0.34) {
      b.cyl(rr * 1.18, rr * 1.18, Z * 0.035, rim,
        { ...o, x: s.x * Z * 0.95, y: Z + s.y * Z * 0.95, z: s.z * Z * 0.95 }, 9);
    }
    b.cyl(rr, rr, Z * 0.04, dark, o, 9);
  }
}

/**
 * Latitude belts around a spherical body, as thin flat rings.
 *
 * Stacked squashed cylinders would be the obvious way to band a planet and it
 * is the wrong way: two stacked discs share a horizontal plane and z-fight
 * across the whole overlap, which is the class `npm run coplanar` exists to
 * catch. A torus has no flat faces at all.
 */
function belts(b, Z, list, tube = 0.045) {
  for (const [h, col] of list) {
    const rr = Math.sqrt(Math.max(0.04, 1 - h * h)) * Z;
    b.torus(rr, tube * Z, col, { y: Z + h * Z, rx: Math.PI / 2 }, 4, 12);
  }
}

/** A spot of weather sitting proud of the surface. */
function oval(b, Z, a, h, w, col) {
  const s = surf(a, Math.acos(h));
  b.ellip(Z * w, Z * w * 0.34, Z * w * 0.6, col, {
    x: s.x * Z * 0.94, y: Z + s.y * Z * 0.94, z: s.z * Z * 0.94,
    rx: s.rx, rz: s.rz, ry: a,
  }, 9, 5);
}

/**
 * An arc of blobs from the ground, up and back down again — prominences and
 * coronal loops, which are the same shape at two sizes.
 *
 * TALLER THAN IT IS WIDE, always. An arch whose crown sits at its own
 * mid-height is a girder through the katamari; one whose crown is well above
 * the biggest ball the stage can grow is a thing you roll under.
 */
function arc(b, span, rise, thick, r, colA, colB, n = 11) {
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = t * Math.PI;
    const rr = thick * (0.62 + Math.sin(a) * 0.55);
    b.sphere(rr, i % 2 ? colA : colB, {
      x: -Math.cos(a) * span * 0.5,
      y: Math.sin(a) * rise + thick * 0.5,
      z: Math.sin(t * 6.2 + r()) * thick * 0.7,
    }, 7, 5);
  }
}

/* ==================================================================
   DUST AND DEBRIS   (15Mm - 60Mm)
   ================================================================== */

P({ id: 'sol_dust', name: 'Dust Grain', fill: 0.45, variants: 3, weight: 14,
  build(b, r, v) {
    const Z = SZ.dust;
    const col = [S.dust, S.dustPale, S.rockDk][v];
    b.ellip(Z, Z * 0.8, Z * 0.9, col, { y: Z * 0.8 }, 7, 5);
    b.ellip(Z * 0.45, Z * 0.36, Z * 0.42, S.dustPale,
      { x: Z * 0.35, y: Z * 0.95, z: -Z * 0.2 }, 6, 4);
  } });

P({ id: 'sol_meteoroid', name: 'Meteoroid', fill: 0.55, variants: 3, weight: 13,
  build(b, r, v) {
    const Z = SZ.meteoroid;
    lump(b, Z, r, [S.rock, S.basalt, S.rockDk][v], S.crater, 3);
    // a facet of exposed metal, which is what most of these actually are
    b.cyl(Z * 0.34, Z * 0.34, Z * 0.06, C.steelDark,
      { x: Z * 0.3, y: Z * 1.42, z: Z * 0.2, rx: 0.3, rz: -0.25 }, 7);
  } });

P({ id: 'sol_zodiacal', name: 'Zodiacal Dust Clump', fill: 0.1, variants: 3, weight: 11,
  build(b, r, v) {
    const Z = SZ.zodiacal;
    // a puff of nothing much: eleven specks loosely held together by gravity
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * TAU + v;
      const d = Z * (0.2 + ((i * 5) % 7) * 0.11);
      b.sphere(Z * (0.12 + (i % 3) * 0.05), i % 2 ? S.dustPale : S.dust, {
        x: Math.cos(a) * d, y: Z * (0.3 + ((i * 3) % 5) * 0.28), z: Math.sin(a) * d * 0.88,
      }, 6, 4);
    }
  } });

P({ id: 'sol_asteroid', name: 'Asteroid', fill: 0.55, variants: 4, weight: 12,
  build(b, r, v) {
    const Z = SZ.asteroid;
    lump(b, Z, r, [S.rock, S.rockDk, S.basalt, S.rust][v], S.crater, 4);
    craters(b, Z, r, 4, S.crater, S.rockLt);
  } });

P({ id: 'sol_rubble', name: 'Rubble-Pile Asteroid', fill: 0.4, variants: 3, weight: 11,
  build(b, r, v) {
    const Z = SZ.rubble;
    /* Not one rock: a loose heap of them, barely holding on to each other.
       Piled into a mound rather than spread out — a flat sprawl of boulders
       would be a wide obstacle reading as a small snack. */
    for (let i = 0; i < 12; i++) {
      const a = i * 2.399963 + v;
      const t = i / 12;
      const d = Z * 0.72 * (1 - t * 0.75);
      b.ellip(Z * (0.3 - t * 0.12), Z * (0.26 - t * 0.1), Z * (0.28 - t * 0.11),
        i % 3 === 0 ? S.rockLt : i % 3 === 1 ? S.rock : S.rockDk, {
          x: Math.cos(a) * d, y: Z * (0.24 + t * 0.9), z: Math.sin(a) * d * 0.9, ry: a,
        }, 6, 4);
    }
  } });

P({ id: 'sol_comet', name: 'Comet Nucleus', sizeMul: 1.3986, fill: 0.4925, variants: 3, weight: 10,
  build(b, r, v) {
    /* ⚠ A COMET IS ITS TAIL, and the tail was the one thing this could not
       have. The old comment: "a fan of grains lifting AWAY from the ground
       rather than lying along it. Laid flat it would triple the collision
       radius for a fifth of the pickup size." So the most recognisable object
       in the sky was drawn as a snowball with a puff of crumbs going upwards.

       Ghost measures nothing, so it gets both real tails, laid back where
       tails lie: the ION tail straight, narrow and blue, blown dead away from
       the star, and the DUST tail broader, warmer and CURVED, because the
       grains are heavier and lag behind the nucleus along its orbit. Two
       tails at different angles is the whole silhouette; one is a smudge.

       ⚠ 137 instances, so it had to get cheaper doing it: 612 -> ~540. The
       nine-sphere crumb fan is gone, and the nucleus drops a lobe. */
    const Z = SZ.comet;
    lump(b, Z, r, S.crater, S.basalt, 2);
    b.decor((d) => {
      d.ellip(Z * 0.66, Z * 0.58, Z * 0.62, S.icePale, { y: Z * 0.92 }, 6, 4);
      // ion tail — straight, thin, and much longer than the box
      for (let i = 0; i < 2; i++) {
        const t = i;
        d.ellip(Z * (1.7 - t * 0.2), Z * (0.15 - t * 0.045), Z * (0.15 - t * 0.045), S.wind, {
          x: -Z * (1.7 + t * 3.1), y: Z * (1.0 + t * 0.22),
        }, 6, 4);
      }
      // dust tail — broader, warmer, and swept off the orbit
      for (let i = 0; i < 3; i++) {
        const t = i / 2;
        d.ellip(Z * (1.15 - t * 0.2), Z * (0.28 - t * 0.07), Z * (0.32 - t * 0.08),
          i % 2 ? S.ice : S.ammonia, {
            x: -Z * (1.25 + t * 2.3), y: Z * (0.86 + t * 0.08),
            z: Z * (0.3 + t * 1.0), ry: -0.34 - t * 0.4,
          }, 6, 4);
      }
    });
  } });

/* ==================================================================
   SMALL BODIES AND MOONS   (70Mm - 300Mm)
   ================================================================== */

P({ id: 'sol_kbo', name: 'Kuiper Belt Object', fill: 0.5, variants: 3, weight: 10,
  build(b, r, v) {
    const Z = SZ.kbo;
    lump(b, Z, r, [S.rust, S.rustDk, S.crater][v], S.basalt, 4);
    // tholin-red, with frost collected in the low ground
    for (let i = 0; i < 5; i++) {
      const s = surf(r() * TAU, Math.acos(1 - 2 * r()));
      b.cyl(Z * (0.18 + r() * 0.14), Z * (0.18 + r() * 0.14), Z * 0.05, S.icePale, {
        x: s.x * Z * 0.9, y: Z * 0.86 + s.y * Z * 0.8, z: s.z * Z * 0.9, rx: s.rx, rz: s.rz,
      }, 7);
    }
  } });

P({ id: 'sol_shepherd', name: 'Shepherd Moon', fill: 0.4, variants: 2, weight: 9,
  build(b, r, v) {
    const Z = SZ.shepherd;
    // a potato that keeps a ringlet in line, with the ringlet trailing it
    b.ellip(Z, Z * 0.7, Z * 0.78, S.icePale, { y: Z * 0.7 }, 9, 6);
    b.ellip(Z * 0.4, Z * 0.34, Z * 0.36, S.ice, { x: Z * 0.5, y: Z * 0.9, z: Z * 0.15 }, 7, 5);
    craters(b, Z * 0.8, r, 3, S.iceShadow, S.icePale);
    // the dust it is herding: a short arc of grains lifted clear of the ground
    for (let i = 0; i < 8; i++) {
      const t = i / 7;
      b.sphere(Z * 0.11, i % 2 ? S.ice : S.dustPale, {
        x: Z * (-0.9 - t * 0.6), y: Z * (0.5 + t * 1.05), z: Z * Math.sin(t * 3 + v) * 0.4,
      }, 5, 4);
    }
  } });

P({ id: 'sol_moonlet', name: 'Small Moon', fill: 0.52, variants: 3, weight: 9,
  build(b, r, v) {
    const Z = SZ.moonlet;
    lump(b, Z, r, [S.regolith, S.rock, S.icePale][v], S.rockDk, 4);
    craters(b, Z * 0.92, r, 6, S.crater, S.rockLt);
  } });

P({ id: 'sol_wind', name: 'Solar-Wind Stream', sizeMul: 1.5802, fill: 0.1973, variants: 3, weight: 8,
  surface: 'air', flyHeight: 0.055,
  build(b, r, v) {
    /* "Kept SHORT: a stream long enough to look like a stream is a fence."
       It is no longer a fence, so it is no longer short. A solar-wind stream
       is a long thin ribbon of charged gas with the field frozen into it,
       curling as the star rotates under it — the Parker spiral. That curl is
       the only thing that distinguishes it from a smear, and it needs length
       to be visible at all. */
    const Z = SZ.wind;
    core(b, Z * 0.5, Z * 0.5, Z * 0.5, S.windDim, { y: Z * 0.5, k: 0.86 });
    b.decor((d) => {
      for (let i = 0; i < 11; i++) {
        const t = i / 10;
        const a = -0.5 + t * 1.15;                    // the spiral's curl
        d.ellip(Z * (0.42 - t * 0.14), Z * (0.16 - t * 0.05), Z * (0.13 - t * 0.04),
          i % 2 ? S.wind : S.windDim, {
            x: Z * (-1.2 + t * 5.2), y: Z * (0.5 + Math.sin(t * 3 + v) * 0.22),
            z: Z * (Math.sin(a) * 1.3 - 0.4), ry: -a,
          }, 6, 4);
      }
      d.sphere(Z * 0.2, S.corona, { x: -Z * 1.5, y: Z * 0.5 }, 6, 4);
    });
  } });

P({ id: 'sol_centaur', name: 'Centaur', fill: 0.45, variants: 2, weight: 8,
  build(b, r, v) {
    const Z = SZ.centaur;
    // half comet, half asteroid, and it cannot decide which
    lump(b, Z, r, v ? S.rust : S.regolith, S.crater, 4);
    craters(b, Z * 0.9, r, 4, S.crater, S.dustPale);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + v;
      b.sphere(Z * 0.13, S.ammonia, {
        x: Math.cos(a) * Z * 0.8, y: Z * (1.5 + (i % 3) * 0.24), z: Math.sin(a) * Z * 0.7,
      }, 5, 4);
    }
  } });

P({ id: 'sol_moon_crater', name: 'Cratered Moon', fill: 0.56, variants: 3, weight: 8,
  build(b, r, v) {
    const Z = SZ.moonCrater;
    const col = [S.regolith, S.rockLt, S.dustPale][v];
    b.sphere(Z, col, { y: Z }, 11, 8);
    craters(b, Z, r, 11, S.crater, S.rockLt);
    // one great basin with a central peak, because they all have one
    const s = surf(1.1 + v, 1.0);
    b.cyl(Z * 0.5, Z * 0.5, Z * 0.05, S.basalt,
      { x: s.x * Z * 0.95, y: Z + s.y * Z * 0.95, z: s.z * Z * 0.95, rx: s.rx, rz: s.rz }, 10);
    b.cone(Z * 0.1, Z * 0.16, col,
      { x: s.x * Z * 1.0, y: Z + s.y * Z * 1.0, z: s.z * Z * 1.0, rx: s.rx, rz: s.rz }, 6);
  } });

P({ id: 'sol_beltcluster', name: 'Asteroid-Belt Cluster', fill: 0.12, variants: 3, weight: 7,
  build(b, r, v) {
    const Z = SZ.beltCluster;
    /* A family of fragments from one break-up, drifting together. Heaped
       upward rather than scattered flat, for the same reason as the rubble
       pile: horizontal span is collision radius and vertical span is free. */
    for (let i = 0; i < 14; i++) {
      const a = i * 2.399963 + v * 0.8;
      const t = i / 14;
      const d = Z * (0.85 - t * 0.6);
      b.ellip(Z * (0.26 - t * 0.1), Z * (0.22 - t * 0.08), Z * (0.24 - t * 0.09),
        i % 3 === 0 ? S.rock : i % 3 === 1 ? S.rockDk : S.rockLt, {
          x: Math.cos(a) * d, y: Z * (0.22 + t * 1.5), z: Math.sin(a) * d * 0.86, ry: a,
        }, 6, 4);
    }
  } });

P({ id: 'sol_moon_ice', name: 'Ice Moon', fill: 0.55, variants: 3, weight: 7,
  build(b, r, v) {
    const Z = SZ.moonIce;
    b.sphere(Z, [S.icePale, S.ice, S.iceDeep][v], { y: Z }, 11, 8);
    /* The cracks: a shell of a moon this smooth has almost no craters, it has
       a network of fractures where the ice has pulled apart. Thin slabs laid
       tangent to the surface along great circles. */
    for (let i = 0; i < 7; i++) {
      const a0 = r() * TAU, e0 = 0.5 + r() * 2.1;
      for (let k = 0; k < 5; k++) {
        const s = surf(a0 + k * 0.34, e0 + Math.sin(k * 1.3 + i) * 0.22);
        b.box(Z * 0.5, Z * 0.03, Z * 0.05, k % 2 ? S.iceShadow : S.frostDk, {
          x: s.x * Z * 0.99, y: Z + s.y * Z * 0.99, z: s.z * Z * 0.99,
          rx: s.rx, rz: s.rz, ry: a0 * 2 + k,
        });
      }
    }
    b.cyl(Z * 0.34, Z * 0.34, Z * 0.05, S.frostDk, { y: Z * 1.97 }, 9);
    // a geyser off the south pole
    if (v !== 1) b.cone(Z * 0.14, Z * 0.5, S.ammonia, { y: Z * 2.24 }, 6);
  } });

P({ id: 'sol_moon_volcano', name: 'Volcanic Moon', fill: 0.55, variants: 2, weight: 6,
  build(b, r, v) {
    const Z = SZ.moonVolcano;
    b.sphere(Z, S.sulfur, { y: Z }, 11, 8);
    // sulphur plains, black calderas and one plume caught in the act
    for (let i = 0; i < 9; i++) {
      const s = surf(r() * TAU, Math.acos(1 - 2 * r()));
      const rr = Z * (0.14 + r() * 0.2);
      b.cyl(rr, rr, Z * 0.04, i % 3 ? S.ash : S.lava, {
        x: s.x * Z * 0.97, y: Z + s.y * Z * 0.97, z: s.z * Z * 0.97, rx: s.rx, rz: s.rz,
      }, 8);
    }
    const p = surf(0.8 + v * 2, 0.75);
    b.cone(Z * 0.16, Z * 0.2, S.ash, {
      x: p.x * Z * 1.02, y: Z + p.y * Z * 1.02, z: p.z * Z * 1.02, rx: p.rx, rz: p.rz }, 7);
    for (let i = 0; i < 5; i++) {
      const t = i / 4;
      b.sphere(Z * (0.16 - t * 0.08), t < 0.4 ? S.lava : S.ash, {
        x: p.x * Z * (1.1 + t * 0.7), y: Z + p.y * Z * (1.1 + t * 0.7), z: p.z * Z * (1.1 + t * 0.7),
      }, 6, 4);
    }
  } });

P({ id: 'sol_trojan', name: 'Trojan Swarm', fill: 0.1, variants: 3, weight: 6,
  build(b, r, v) {
    const Z = SZ.trojan;
    /* Everything trapped at one Lagrange point, milling about. Two big ones
       and a crowd, piled into a lens rather than a sheet. */
    for (let i = 0; i < 16; i++) {
      const a = i * 2.399963 + v;
      const t = i / 16;
      const d = Z * (0.95 - t * 0.7);
      const rr = Z * (0.24 - t * 0.1) * (i < 2 ? 1.7 : 1);
      b.ellip(rr, rr * 0.84, rr * 0.9, i % 4 === 0 ? S.rustDk : i % 2 ? S.rock : S.basalt, {
        x: Math.cos(a) * d, y: Z * (0.24 + t * 1.35), z: Math.sin(a) * d * 0.8, ry: a,
      }, 6, 4);
    }
  } });

P({ id: 'sol_dwarf', name: 'Dwarf Planet', fill: 0.55, variants: 3, weight: 6,
  build(b, r, v) {
    const Z = SZ.dwarf;
    const col = [S.rustDk, S.dustPale, S.iceDeep][v];
    b.sphere(Z, col, { y: Z }, 11, 8);
    // a bright nitrogen plain on one side, dark tholin on the other
    const p = surf(0.6 + v, 1.35);
    b.ellip(Z * 0.62, Z * 0.62 * 0.3, Z * 0.5, S.icePale, {
      x: p.x * Z * 0.9, y: Z + p.y * Z * 0.9, z: p.z * Z * 0.9, rx: p.rx, rz: p.rz }, 10, 5);
    const q = surf(3.4 + v, 1.9);
    b.ellip(Z * 0.44, Z * 0.44 * 0.3, Z * 0.4, S.rustDk, {
      x: q.x * Z * 0.92, y: Z + q.y * Z * 0.92, z: q.z * Z * 0.92, rx: q.rx, rz: q.rz }, 9, 5);
    b.cyl(Z * 0.36, Z * 0.36, Z * 0.05, S.icePale, { y: Z * 1.98 }, 9);
    craters(b, Z, r, 4, S.crater, S.dustPale);
    // its one moon, tide-locked and far too big for it
    if (v !== 2) b.sphere(Z * 0.3, S.rock, { x: Z * 1.05, y: Z * 1.5, z: -Z * 0.5 }, 8, 6);
  } });

/* ==================================================================
   FIELDS AND PLASMA   (400Mm - 950Mm)
   ================================================================== */

P({ id: 'sol_magnetotail', name: 'Magnetotail', sizeMul: 2.1661, fill: 0.7114, variants: 2, weight: 5,
  build(b, r, v) {
    /* ⚠ THE OLD COMMENT SAID WHY IT WAS WRONG AND THEN DID IT ANYWAY: "the
       lobes go UP and back, not out along the floor: a tail drawn honestly
       along the ground is three times the collision radius for the same
       mouthful." A magnetotail that goes upwards is not a magnetotail. It is
       a plume.

       Drawn honestly now, because ghost is not measured: the planet is the
       solid body, the two lobes stream away downwind along the plane, the
       neutral sheet lies between them where it belongs, and the bow shock
       stands off the sunward side as a real curved sheet rather than five
       boxes on a fan. The tail reaches four times the box, which is still
       short for the real thing. */
    const Z = SZ.magnetotail;
    b.sphere(Z * 0.42, S.fieldDim, { y: Z * 0.62 }, 9, 6);
    b.sphere(Z * 0.3, S.rock, { y: Z * 0.62 }, 8, 6);
    b.decor((d) => {
      for (const s of [-1, 1]) {
        for (let i = 0; i < 6; i++) {
          const t = i / 5;
          d.ellip(Z * (0.42 + t * 0.5), Z * (0.2 - t * 0.08), Z * (0.2 - t * 0.06),
            i % 2 ? S.field : S.fieldDim, {
              x: Z * (0.9 + t * 3.1), y: Z * (0.62 + s * (0.16 + t * 0.1)),
              z: s * Z * (0.1 + t * 0.16),
            }, 6, 4);
        }
      }
      // the neutral sheet, between the lobes
      d.ellip(Z * 2.1, Z * 0.03, Z * 0.26, S.aurora, { x: Z * 2.2, y: Z * 0.62 }, 6, 4);
      // the bow shock, a real curved sheet standing off the sunward side
      shell(d, Z * 0.95, S.wind, { y: Z * 0.62, th: 0.05, open: 0.62, rx: -1.5708, sx: 0.42 }, 16);
    });
  } });

P({ id: 'sol_sunspot', name: 'Sunspot Group', fill: 0.3, variants: 2, weight: 5,
  build(b, r, v) {
    const Z = SZ.sunspot;
    /* A piece of photosphere with the spots still in it — a MOUND, not a
       plate. A flat slab would be a lid at chest height for anything half its
       width, and this is one of the widest things in the middle of the ladder. */
    b.dome(Z, S.photo, {}, 11);
    b.ellip(Z * 0.98, Z * 0.3, Z * 0.9, S.photo, { y: -Z * 0.02 }, 11, 5);
    // granulation
    for (let i = 0; i < 12; i++) {
      const a = i * 2.399963 + v;
      const d = Z * 0.86 * Math.sqrt((i + 0.5) / 12);
      b.sphere(Z * 0.16, i % 3 ? S.photoHot : S.limb,
        { x: Math.cos(a) * d, y: Z * 0.5 + Math.cos(d / Z) * Z * 0.42, z: Math.sin(a) * d }, 6, 4);
    }
    // umbra and penumbra, the spots themselves
    for (let i = 0; i < 4; i++) {
      const a = 1.1 + i * 1.5 + v, d = Z * (0.2 + (i % 3) * 0.2);
      const rr = Z * (0.15 + (i % 2) * 0.1);
      const y = Z * 0.55 + Math.cos(d / Z) * Z * 0.46;
      b.cyl(rr * 1.7, rr * 1.7, Z * 0.05, S.penumbra,
        { x: Math.cos(a) * d, y, z: Math.sin(a) * d }, 8);
      b.cyl(rr, rr, Z * 0.07, S.umbra,
        { x: Math.cos(a) * d, y: y + Z * 0.02, z: Math.sin(a) * d }, 8);
    }
  } });

P({ id: 'sol_bowshock', name: 'Bow Shock', fill: 0.06, variants: 2, weight: 5,
  surface: 'air', flyHeight: 0.2,
  build(b, r, v) {
    const Z = SZ.bowshock;
    /* Where the wind piles up against a magnetosphere: a crescent standing on
       edge. Standing, so the span is height rather than floor.

       DRAWN IN ROUNDED FORMS, NOT SLABS. The first version was eighteen thin
       boxes along the arc, and a row of boxes reads as scaffolding however you
       colour it — the shot came back looking like a stack of blue shelves
       floating over the deck. Overlapping flattened ellipsoids give the same
       silhouette and read as gas, which is what this is. They also cannot be
       coplanar with each other, so the shimmer goes with them. */
    for (let i = 0; i <= 9; i++) {
      const a = -1.15 + (i / 9) * 2.3;
      const ca = Math.cos(a);
      const h = Z * (0.76 - Math.abs(a) * 0.24);
      b.ellip(Z * 0.09, h, Z * 0.3, i % 2 ? S.wind : S.windDim, {
        x: Z * (ca * 0.5 - 0.1), y: h, z: Z * Math.sin(a) * 0.85, ry: a,
      }, 7, 6);
      b.ellip(Z * 0.06, h * 0.72, Z * 0.22, S.wind, {
        x: Z * (ca * 0.5 - 0.32), y: h * 0.86, z: Z * Math.sin(a) * 0.92, ry: a,
      }, 6, 5);
    }
    for (let i = 0; i < 6; i++) {
      const a = -0.9 + (i / 5) * 1.8;
      b.sphere(Z * 0.15, S.aurora, { x: Z * Math.cos(a) * 0.35, y: Z * 1.5, z: Z * Math.sin(a) * 0.7 }, 6, 4);
    }
  } });

P({ id: 'sol_loop', name: 'Coronal Loop', fill: 0.08, variants: 3, weight: 4,
  surface: 'air', flyHeight: 0.32,
  build(b, r, v) {
    const Z = SZ.loop;
    // a field line drawn in glowing gas, and taller than it is wide
    arc(b, Z * 1.6, Z * 2.5, Z * 0.16, r, S.plasmaPl, S.corona, 11);
    for (const s of [-1, 1]) {
      b.cyl(Z * 0.28, Z * 0.4, Z * 0.24, S.limb, { x: s * Z * 0.8, y: Z * 0.12 }, 8);
    }
    if (v) arc(b, Z * 1.1, Z * 1.8, Z * 0.1, r, S.corona, S.plasmaPl, 9);
  } });

P({ id: 'sol_flare', name: 'Flare', fill: 0.06, variants: 3, weight: 3,
  surface: 'air', flyHeight: 0.4,
  build(b, r, v) {
    const Z = SZ.flare;
    /* A burst, drawn as a fan of tongues going UP. Everything about this prop
       is vertical: it is 6% fill and the box is what the ladder measures. */
    b.sphere(Z * 0.4, S.photoHot, { y: Z * 0.42 }, 9, 6);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU + v * 0.4;
      const lean = 0.35 + (i % 3) * 0.2;
      const len = Z * (1.6 + (i % 4) * 0.5);
      b.cone(Z * (0.16 + (i % 2) * 0.06), len, i % 2 ? S.plasma : S.plasmaPl, {
        x: Math.cos(a) * Z * (0.3 + lean * len / Z * 0.28),
        y: Z * 0.5 + len * 0.44,
        z: Math.sin(a) * Z * (0.3 + lean * len / Z * 0.28),
        rz: -Math.cos(a) * lean * 0.5, rx: Math.sin(a) * lean * 0.5,
      }, 6);
    }
    for (let i = 0; i < 7; i++) {
      const a = i * 2.399963 + v;
      b.sphere(Z * 0.14, S.corona, {
        x: Math.cos(a) * Z * 0.5, y: Z * (1.9 + (i % 3) * 0.5), z: Math.sin(a) * Z * 0.5,
      }, 6, 4);
    }
  } });

/* ==================================================================
   PLANETS   (600Mm - 1Gm100Mm)
   ================================================================== */

P({ id: 'sol_rocky', name: 'Rocky Planet', fill: 0.56, variants: 3, weight: 5,
  build(b, r, v) {
    const Z = SZ.rocky;
    const ground = [S.rust, S.rockLt, S.regolith][v];
    b.sphere(Z, ground, { y: Z }, 12, 8);
    /* The thin atmosphere: one shell 4% out, in a pale wash. It is the whole
       difference between a rock and a world, and it costs 96 triangles. */
    b.sphere(Z * 1.04, [S.cloudWarm, S.ammonia, S.cloud][v], { y: Z }, 12, 8);
    belts(b, Z, [[-0.62, S.rustDk], [-0.2, S.crater], [0.24, S.rustDk], [0.6, S.dustPale]], 0.03);
    craters(b, Z, r, 7, S.crater, S.rockLt);
    b.cyl(Z * 0.3, Z * 0.3, Z * 0.05, S.icePale, { y: Z * 1.98 }, 9);
    b.cyl(Z * 0.26, Z * 0.26, Z * 0.05, S.icePale, { y: Z * 0.02 }, 9);
    // one great rift and one shield volcano
    const p = surf(1.4 + v, 1.5);
    for (let k = 0; k < 5; k++) {
      const s = surf(1.4 + v + k * 0.3, 1.5 + Math.sin(k) * 0.18);
      b.box(Z * 0.4, Z * 0.03, Z * 0.07, S.basalt, {
        x: s.x * Z * 0.99, y: Z + s.y * Z * 0.99, z: s.z * Z * 0.99, rx: s.rx, rz: s.rz, ry: k });
    }
    b.cone(Z * 0.16, Z * 0.14, S.basalt, {
      x: -p.x * Z * 1.0, y: Z - p.y * Z * 1.0, z: -p.z * Z * 1.0, rx: -p.rx, rz: -p.rz }, 7);
  } });

P({ id: 'sol_ocean', name: 'Ocean Planet', fill: 0.55, variants: 3, weight: 4,
  build(b, r, v) {
    const Z = SZ.ocean;
    b.sphere(Z, S.ocean, { y: Z }, 12, 8);
    b.sphere(Z * 1.035, S.cloud, { y: Z }, 12, 8);
    // shelves, a few islands and the cloud that comes with all that water
    for (let i = 0; i < 7; i++) {
      const s = surf(r() * TAU, Math.acos(1 - 2 * r()));
      const rr = Z * (0.2 + r() * 0.24);
      b.cyl(rr * 1.4, rr * 1.4, Z * 0.035, S.oceanDeep, {
        x: s.x * Z * 0.96, y: Z + s.y * Z * 0.96, z: s.z * Z * 0.96, rx: s.rx, rz: s.rz }, 8);
      if (i < 3) {
        b.ellip(rr * 0.8, Z * 0.05, rr * 0.6, i ? S.dustPale : S.sulfur, {
          x: s.x * Z * 0.99, y: Z + s.y * Z * 0.99, z: s.z * Z * 0.99, rx: s.rx, rz: s.rz }, 8, 4);
      }
    }
    for (let i = 0; i < 8; i++) {
      const a = i * 2.399963 + v;
      const s = surf(a, 0.7 + (i % 4) * 0.5);
      b.ellip(Z * 0.34, Z * 0.06, Z * 0.16, S.cloud, {
        x: s.x * Z * 1.07, y: Z + s.y * Z * 1.07, z: s.z * Z * 1.07,
        rx: s.rx, rz: s.rz, ry: a * 1.6 }, 9, 4);
    }
    b.cyl(Z * 0.3, Z * 0.3, Z * 0.05, S.icePale, { y: Z * 2.05 }, 9);
  } });

P({ id: 'sol_icegiant', name: 'Ice Giant', fill: 0.52, variants: 3, weight: 4,
  build(b, r, v) {
    const Z = SZ.icegiant;
    b.sphere(Z, [S.methane, S.methaneDk, S.iceBlue][v], { y: Z }, 12, 8);
    belts(b, Z, [[-0.7, S.methaneDk], [-0.34, S.ammonia], [0.1, S.methaneDk],
      [0.46, S.ammonia], [0.76, S.ice]], 0.035);
    oval(b, Z, 1.2 + v, 0.34, 0.4, S.frostDk);
    oval(b, Z, 4.1 + v, -0.28, 0.26, S.icePale);
    // a haze shell and the faint dark rings these all turn out to have
    b.sphere(Z * 1.03, S.ammonia, { y: Z }, 12, 8);
    for (let i = 0; i < 2; i++) {
      b.torus(Z * (1.35 + i * 0.2), Z * 0.02, i ? S.iceShadow : S.frostDk,
        { y: Z, rx: Math.PI / 2 - 1.1 }, 4, 14);
    }
  } });

P({ id: 'sol_gasgiant', name: 'Gas Giant', fill: 0.5, variants: 3, weight: 3,
  build(b, r, v) {
    const Z = SZ.gasgiant;
    b.sphere(Z, S.band, { y: Z }, 12, 8);
    // the belts and zones, alternating, tighter towards the poles
    belts(b, Z, [
      [-0.82, S.bandDk], [-0.66, S.bandPale], [-0.46, S.bandDk], [-0.24, S.bandPale],
      [0.0, S.bandDk], [0.22, S.bandPale], [0.44, S.bandDk], [0.64, S.bandPale],
      [0.82, S.bandDk],
    ], 0.05);
    // THE GREAT STORM, three times the size of anything else on the disc
    oval(b, Z, 0.9 + v * 2, -0.32, 0.62, S.storm);
    oval(b, Z, 0.9 + v * 2, -0.32, 0.3, S.stormDk);
    oval(b, Z, 3.6 + v, 0.42, 0.28, S.bandPale);
    b.sphere(Z * 1.025, S.cloudWarm, { y: Z }, 12, 8);
  } });

P({ id: 'sol_ring', name: 'Ring System', sizeMul: 1.6702, fill: 0.4193, variants: 3, weight: 3,
  build(b, r, v) {
    const Z = SZ.ring;
    /* ⚠ THE PROP THIS STAGE'S HEADER RULE WAS WRITTEN ABOUT, AND THE RULE IS
       RETIRED. The old comment here read: "A RING IS THE WORST SHAPE IN THE
       GAME IF YOU LAY IT FLAT: collision radius is half the longest horizontal
       span and pickup is the cube root of the box, so a flat annulus fences
       off the map while reading as a snack." True, and the answer was to tilt
       the whole system 38 degrees so the span bought height instead — a
       compromise that put every ringed planet in the solar system on its side.

       Ghost geometry measures nothing, so the rings can lie where rings lie.
       The planet is the solid body and the only thing the game collides with;
       the rings are a picture, four graded annuli with a gap cut in them,
       tilted a few degrees because that is what looks right rather than
       because the physics demands it.

       ⚠ The planet is 0.47 Z rather than the old 0.40 because it is now the
       ONLY solid part, and `reghost` clamps at `fill: 1` below about 0.44 —
       the mass of the whole system has to fit inside the planet. And the rings
       now reach 1.45 Z, well past the box, which they could never do before:
       that is a real ring system's proportion, three times the planet's
       radius, not the 2.4 the old collision box could afford. */
    const TILT = 0.24;
    const P0 = Z * 0.47;                   // the planet — and the whole solid body
    const C0 = Z * 0.62;                   // held up, so the rings clear the floor
    b.sphere(P0, S.band, { y: C0 }, 11, 8);
    b.decor((d) => {
      /* The planet's own belts are written out rather than taken from
         `belts()`, which centres a body at y = radius — right for something
         sitting on the ground, wrong for a planet held up inside its rings. */
      for (const h of [-0.52, 0, 0.52]) {
        d.torus(Math.sqrt(1 - h * h) * P0, P0 * 0.06, h ? S.bandDk : S.bandPale,
          { y: C0 + h * P0, rx: Math.PI / 2, ghost: true }, 4, 12);
      }
      // the bright inner system, the Cassini gap, then the faint outer sheet
      gradedDisc(d, Z * 0.66, Z * 1.06, [S.bandPale, S.cloudWarm, S.bandPale],
        { y: C0, rx: TILT, warp: 0.03 }, 3, 30);
      gradedDisc(d, Z * 1.16, Z * 1.45, [S.bandDk, S.bandPale],
        { y: C0, rx: TILT, warp: 0.02 }, 2, 30);
      ring(d, Z * 1.11, S.icePale, { y: C0, rx: TILT, tube: 0.006 }, 28);
      // shepherds sitting in the gap, in the plane of the rings
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * TAU + v, rr = Z * 1.11;
        d.sphere(Z * 0.05, S.icePale, {
          x: Math.cos(a) * rr, y: C0 + Math.sin(a) * rr * Math.sin(TILT),
          z: Math.sin(a) * rr * Math.cos(TILT),
        }, 6, 4);
      }
    });
  } });

/* ==================================================================
   THE OUTER LIMITS AND THE STAR   (1Gm100Mm - 1Gm392Mm)
   ================================================================== */

P({ id: 'sol_prominence', name: 'Prominence Arc', fill: 0.08, variants: 2, weight: 2,
  build(b, r, v) {
    const Z = SZ.prominence;
    /* A curtain of plasma hanging off the star, torn loose and drifting. The
       arch is 2.8 units tall against 1.9 wide on purpose — see `arc`. */
    arc(b, Z * 1.9, Z * 2.6, Z * 0.2, r, S.plasma, S.plasmaPl, 12);
    arc(b, Z * 1.3, Z * 1.9, Z * 0.13, r, S.limb, S.corona, 10);
    for (const s of [-1, 1]) {
      b.dome(Z * 0.44, S.photo, { x: s * Z * 0.95 }, 10);
      b.cyl(Z * 0.3, Z * 0.44, Z * 0.3, S.limb, { x: s * Z * 0.95, y: Z * 0.15 }, 9);
    }
    if (v) for (let i = 0; i < 6; i++) {
      b.sphere(Z * 0.12, S.corona,
        { x: (r() - 0.5) * Z * 1.6, y: Z * (2.7 + r() * 0.5), z: (r() - 0.5) * Z * 0.5 }, 6, 4);
    }
  } });

P({ id: 'sol_heliopause', name: 'Heliopause Fragment', fill: 0.09, variants: 2, weight: 2,
  build(b, r, v) {
    const Z = SZ.heliopause;
    /* Where the wind finally loses. A piece of the shock front, standing on
       edge like a sail: a curved wall of ionised gas with the interstellar
       field combed across it. Stands rather than lies, so the biggest thing in
       the outer belt is not also the widest. */
    for (let i = 0; i <= 11; i++) {
      const a = -1.2 + (i / 11) * 2.4;
      const h = Z * (1.3 - Math.abs(a) * 0.36);
      // rounded, and overlapping its neighbours — a row of boxes reads as
      // scaffolding, see the note on `sol_bowshock`
      b.ellip(Z * 0.12, h, Z * 0.34, i % 2 ? S.field : S.fieldDim, {
        x: Z * Math.cos(a) * 0.75, y: h + Z * 0.04, z: Z * Math.sin(a) * 1.0, ry: a,
      }, 7, 6);
    }
    // ripples in the front, and the wind piling into it
    for (let i = 0; i < 7; i++) {
      const a = -1.0 + (i / 6) * 2.0;
      b.sphere(Z * 0.2, i % 2 ? S.wind : S.aurora, {
        x: Z * Math.cos(a) * 0.62, y: Z * (2.1 + Math.cos(a * 2) * 0.4), z: Z * Math.sin(a) * 0.9,
      }, 7, 5);
      b.cyl(Z * 0.04, Z * 0.1, Z * 0.5, S.windDim, {
        x: Z * (Math.cos(a) * 0.75 - 0.5), y: Z * (0.5 + (i % 3) * 0.5), z: Z * Math.sin(a) * 0.95,
        rz: 1.35,
      }, 6);
    }
  } });

/* THE LARGEST SINGLE RUNG, AND IT HAS TO BE EDIBLE.
 *
 * 1Gm392Mm across, which is the Sun's real diameter and the reason this stage
 * asks for 1Gm600Mm. A prop is collectable at `pickup / 0.88`, so the star
 * needs a katamari of 1Gm582Mm — twelve megametres under the goal. That is the
 * whole shape of the round: the last thing you eat is the star, and finishing
 * the stage means being bigger than it.
 *
 * It is also 25% of the stage's mass, which is the other half of the arithmetic.
 * The biggest ball that can ever exist is `stageMass * packing`, measured
 * WITHOUT the object being tested, so shrinking the Sun lowers what it costs to
 * eat AND lowers the ceiling that has to clear it. `fill` is the lever that only
 * pushes one way: 0.6 for a body that is genuinely all the way through.
 *
 * The city shipped two mountains nobody could ever collect, and the world stage
 * shipped a continent, before `balance` learned to print "too big to ever
 * collect". Read that line before touching either number here.
 */
P({ id: 'sol_sun', name: 'The Sun', fill: 0.6, variants: 1, weight: 1,
  build(b, r) {
    const Z = SZ.sun;
    b.sphere(Z, S.photo, { y: Z }, 12, 9);
    // granulation: the convection cells, mottling the disc rather than spotting it
    for (let i = 0; i < 26; i++) {
      const s = surf(r() * TAU, Math.acos(1 - 2 * r()));
      const rr = Z * (0.1 + r() * 0.12);
      b.cyl(rr, rr, Z * 0.03, r() < 0.45 ? S.limb : S.photoHot, {
        x: s.x * Z * 0.99, y: Z + s.y * Z * 0.99, z: s.z * Z * 0.99, rx: s.rx, rz: s.rz }, 9);
    }
    // active regions
    for (let i = 0; i < 5; i++) {
      const s = surf(i * 1.9, 0.7 + (i % 3) * 0.6);
      const rr = Z * (0.07 + (i % 2) * 0.05);
      b.cyl(rr * 1.9, rr * 1.9, Z * 0.035, S.penumbra, {
        x: s.x * Z * 1.0, y: Z + s.y * Z * 1.0, z: s.z * Z * 1.0, rx: s.rx, rz: s.rz }, 8);
      b.cyl(rr, rr, Z * 0.05, S.umbra, {
        x: s.x * Z * 1.01, y: Z + s.y * Z * 1.01, z: s.z * Z * 1.01, rx: s.rx, rz: s.rz }, 8);
    }
    /* The corona: a fringe of broad tongues around the equator.
     *
     * Sixteen narrow spikes all over the sphere made a hedgehog, not a star.
     * Wide, short and low — kept to the equatorial band where a real corona
     * streams from, so the silhouette is a disc with a burr on it rather than a
     * ball of quills. */
    for (let i = 0; i < 11; i++) {
      const s = surf((i / 11) * TAU + 0.2, 1.28 + ((i * 5) % 7) * 0.1);
      const len = Z * (0.24 + ((i * 3) % 5) * 0.07);
      b.cone(Z * 0.3, len, i % 2 ? S.corona : S.plasmaPl, {
        x: s.x * (Z + len * 0.4), y: Z + s.y * (Z + len * 0.4), z: s.z * (Z + len * 0.4),
        rx: s.rx, rz: s.rz }, 8);
    }
    for (let k = 0; k < 2; k++) {
      const s = surf(1.1 + k * 3.0, 1.1 + k * 0.5);
      for (let i = 0; i <= 8; i++) {
        const t = i / 8;
        const h = Math.sin(t * Math.PI) * Z * 0.38;
        const along = (t - 0.5) * Z * 0.5;
        b.sphere(Z * (0.05 + h / Z * 0.1), i % 2 ? S.plasma : S.plasmaPl, {
          x: s.x * (Z + h) - s.z * along, y: Z + s.y * (Z + h), z: s.z * (Z + h) + s.x * along,
        }, 6, 4);
      }
    }
  } });
