/* ============================================================
   Stage 8 — The Solar System.  50Mm -> 1Gm600Mm, nine and a
   half minutes.

   You start in the asteroid belt as a young gas giant — fifty
   megametres across, which is Neptune to the nearest planet —
   and finish having swallowed the star.

   THE MAP IS FOUR ORBITS WIDE. The Sun's limb fills the western
   edge, impassable and enormous, and the ground steps UP and
   OUTWARD from it in four terraces: the scorched inner zone
   where the rocky planets and the plasma live, the belt you
   spawn in, the outer zone of gas giants under a ring arch you
   roll under, and the cold rim at the heliopause. Every terrace
   boundary is a full-depth ramp, so there is no edge of this map
   you cannot walk over — the terraces are a progression, not a
   set of gates.

   Bigger things sit further out, with one deliberate exception:
   the Sun itself is at the bottom of the hill, back where you
   started from. The last rung of the ladder sends you home.

   Display units are 'giga': one world unit is one gigametre, a
   million kilometres, so the readout runs 15Mm to 1Gm600Mm.
   NOTHING in the simulation knows that — see the note above
   TIERS in util/math.js for why authoring in true metres breaks
   the physics rather than the readout.
   ============================================================ */

import { C } from '../../render/palette.js';
import { S } from '../props/solar.js';

/* ---------------- ground layers ----------------

   TWO CONSTRAINTS, NOT ONE, and they pull in different directions.

   1. No two big flat horizontal faces may share a Y, or they z-fight across
      their whole overlap. That is the rule the city stage documents.

   2. A decal must sit FAR BELOW THE STARTING BALL'S RADIUS or it saws the
      katamari in half. The culture stage put its mucus film at 0.030 on a ball
      that starts 0.05 across, so the film plane went through the middle of the
      ball and — the camera orbits at ball height — filled the screen edge-on
      with the ball hidden behind it.

   This stage starts at 0.05 too, so the starting radius is 0.025 and
   `test-decals` calls anything from 0.011 up a floor. The house is the
   reference for how small a decal should really be: plank lines at +0.003 on
   the same ball. Everything painted below sits between 0.0022 and 0.0034 above
   whatever it is painted on, which is a tenth of the starting radius and still
   hundreds of depth-buffer steps at this camera distance.

   The TERRACE heights are a different thing entirely: those are steps you are
   meant to climb, and each has a full-depth ramp so it is never a wall. */
const Y_BASE = 0;          // the inner zone: bare space, the lowest orbit
const Y_BELT = 0.14;       // the asteroid belt
const Y_OUTER = 0.34;      // the gas-giant zone
const Y_RIM = 0.56;        // the cold rim, out at the heliopause

/** Paint offset per terrace. Different on each so no two decal planes coincide. */
const DEC_BASE = 0.0022;
const DEC_BELT = 0.0026;
const DEC_OUTER = 0.0030;
const DEC_RIM = 0.0034;
/**
 * A terrace lip: clears the terrace top, and its own top face stays a decal.
 *
 * A 0.02-thick band centred 0.0014 up puts its lid 0.0114 above the deck, which
 * is 46% of the starting radius — over the line `test-decals` draws and 68 of
 * this stage's first 68 failures. Thin and low: 0.006 up is a quarter of the
 * radius, and a bright edge on a step is a colour change, not a relief.
 */
const LIP_Y = 0.0012;
const LIP_H = 0.0096;

/**
 * How much HEIGHT one drawn ramp segment may span.
 *
 * A ramp is a RUN OF SHORT STEPS, never one long tilted plate, and the reason
 * is `test-decals`: it buckets a terrain triangle by the average height of its
 * three corners. One slab across a nine-unit ramp is a triangle whose average
 * sits halfway up the slope while its footprint covers the whole ramp, so it
 * reads as a floor at chest height over the entire lower half of it — and again,
 * upside down, for the slab's buried underside. That was 421 of the culture
 * stage's 728 failures and 777 of the atom stage's 820.
 *
 * Cut into steps, each triangle's average tracks the ground beneath it and the
 * error is bounded by half a step. 0.009 is 18% of the starting radius of
 * 0.025, comfortably under the 45% the test calls a floor.
 */
const RISE = 0.009;

/* ---------------- the map ---------------- */
const BX = 15, BZ = 14;

/* Terrace boundaries in X, west to east. Every gap between two decks is filled
   by a ramp spanning the FULL DEPTH of the map: a ramp narrower than the edge it
   climbs has sides, and its sides are walls. The atom stage measured what that
   costs — a katamari shuttling back and forth for three minutes because a ramp
   wall ran between it and its target. */
const X_INNER1 = -6.4;     // inner zone ends
const X_BELT0 = -4.6;      // belt deck starts (ramp between)
const X_BELT1 = 0.4;
const X_OUTER0 = 2.2;
const X_OUTER1 = 9.0;
const X_RIM0 = 10.8;

/* THE SUN'S LIMB. A sphere centred far off the western edge, with the wall arc
   set a quarter of a unit OUTSIDE its silhouette so the wall always covers the
   geometry — a sliver of star poking through into walkable space would be a
   floor at some height nobody chose. */
const SUNX = -30, SUNY = -2.0, SUNR = 16.6;
const WALLR = SUNR + 0.25;
/** East edge of the limb wall at this z, or null where the arc has left the map. */
const limbAt = (z) => {
  const k = WALLR * WALLR - z * z;
  if (k <= 0) return null;
  const x = SUNX + Math.sqrt(k);
  return x < -BX - 0.4 ? null : x;
};

/* THE RING ARCH. A ring the size of a small moon's orbit, half buried in the
   outer deck so its two legs stand on the ground and its crown is 2.7 units up
   — well clear of the biggest ball this stage can grow (about 2.6), because a
   crown at ball height is a girder through the katamari rather than something
   you roll under. */
const ARCH_X = 5.6, ARCH_R = 3.0, ARCH_T = 0.3;

/** Terrain palette. Deep blue-black ground, one warm star, ice at the rim. */
const T = {
  voidLo: 0x04081a,
  inner: 0x241a1c,
  innerHot: 0x36231b,
  belt: 0x141a30,
  beltLo: 0x0f1426,
  outer: 0x111c31,
  rim: 0x0d1a30,
  rimIce: 0x1a3255,
  riser: 0x1c2340,
  riserOut: 0x1a2b48,
  riserRim: 0x1d3554,
};

export const solarStage = {
  id: 'solar',
  name: 'The Solar System',
  subtitle: 'Eight planets, one star, no supervision.',
  brief: 'You are a young gas giant loose in the asteroid belt. Sweep up the dust, ' +
    'the meteoroids and the rubble around you until you can take whole moons, then ' +
    'follow the ramps outward — the gas-giant zone under the ring arch, and the cold ' +
    'rim where the heliopause is coming apart. When you are big enough, roll back down ' +
    'the hill to the west: the Sun is 1Gm392Mm across and it is the last thing you eat.',
  /**
   * DISPLAY UNITS ONLY — see the note above TIERS in util/math.js. One world
   * unit means one giga-tier step here; the physics never learns that.
   */
  unit: 'giga',
  seed: 19770905,
  startSize: 0.05,
  goal: 1.6,
  time: 560,
  speed: 0.33,
  density: 1,
  spread: 1,
  cell: 0.9,
  chunk: 0,
  spawn: { x: -2.0, z: -6.0 },
  spawnClear: 0.5,
  bounds: { minX: -15, maxX: 15, minZ: -14, maxZ: 14 },
  sky: { top: 0x02040f, bottom: 0x0b1433, fog: 0x060b20, fogNear: 18, fogFar: 62 },
  // One light, low and warm, coming from the star in the west.
  sun: { x: -0.74, y: 0.6, z: 0.16, intensity: 1.28 },
  camera: { pitch: 0.34, distance: 6.4 },

  build(w, r) {
    const t = w.terrain;
    const TAU = Math.PI * 2;

    /* ================= the ground ================= */
    w.plat(-BX, -BZ, BX, BZ, Y_BASE);
    t.quad(BX * 2, BZ * 2, T.voidLo, { y: Y_BASE - 0.02 });
    // the scorched inner orbit, in two washes so it is not one flat sheet
    t.quad(X_INNER1 + BX, BZ * 2, T.inner, { x: (-BX + X_INNER1) / 2, y: Y_BASE - 0.008 });
    t.quad(4.2, BZ * 1.5, T.innerHot, { x: -11.2, y: Y_BASE - 0.004 });

    /**
     * A terrace: a solid block whose top face IS the walkable height, with a
     * bright lip on its exposed long edges so a step reads as a step.
     *
     * The block reaches BELOW the base plane rather than sitting on it. Its
     * underside would otherwise land in exactly the plane of the base quad, and
     * two big faces in one plane z-fight across their whole overlap.
     */
    const terrace = (x0, z0, x1, z1, top, col, lipCol) => {
      const wq = x1 - x0, dq = z1 - z0;
      t.box(wq, top + 0.12, dq, col, { x: (x0 + x1) / 2, y: (top - 0.12) / 2, z: (z0 + z1) / 2 });
      const lip = 0.2, ly = top + LIP_Y;
      t.box(lip, LIP_H, dq, lipCol, { x: x1 - lip / 2, y: ly, z: (z0 + z1) / 2 });
      t.box(wq, LIP_H, lip, lipCol, { x: (x0 + x1) / 2, y: ly, z: z0 + lip / 2 });
      t.box(wq, LIP_H, lip, lipCol, { x: (x0 + x1) / 2, y: ly, z: z1 - lip / 2 });
      w.plat(x0, z0, x1, z1, top);
    };

    terrace(X_BELT0, -BZ, X_BELT1, BZ, Y_BELT, T.belt, 0x4a5f9e);
    terrace(X_OUTER0, -BZ, X_OUTER1, BZ, Y_OUTER, T.outer, 0x4f6bb2);
    terrace(X_RIM0, -BZ, BX, BZ, Y_RIM, T.rim, 0x5f8fd0);
    // paint each deck's surface one shade off its riser, as a decal not a slab
    t.quad(X_BELT1 - X_BELT0 - 0.5, BZ * 2 - 0.5, T.beltLo,
      { x: (X_BELT0 + X_BELT1) / 2, y: Y_BELT + DEC_BELT, z: 0 });
    t.quad(BX - X_RIM0 - 0.4, BZ * 2 - 0.5, T.rimIce,
      { x: (X_RIM0 + BX) / 2, y: Y_RIM + DEC_RIM, z: 0 });

    /**
     * Declare a ramp AND draw it, as a run of short flat steps.
     *
     * Each step is axis-aligned with its top face exactly on the collision
     * plane at its own centre, so there is no sink term to get wrong, and each
     * reaches from below whatever it stands on up to that surface, so the wedge
     * is solid and its underside stays buried. Lifted from `slope()` in
     * stages/microbe.js, which is where the reasoning is written out.
     */
    const slope = (x0, z0, x1, z1, top, topTo, axis, colour) => {
      w.ramp(x0, z0, x1, z1, top, topTo, axis);
      const along = axis === 'x' ? x1 - x0 : z1 - z0;
      const wide = axis === 'x' ? z1 - z0 : x1 - x0;
      const rise = topTo - top;
      const m = Math.max(1, Math.ceil(Math.abs(rise) / RISE));
      const step = (along / m) * 1.02;
      for (let i = 0; i < m; i++) {
        const f = (i + 0.5) / m;
        const p = top + f * rise;              // the collision height right here
        const thick = p + 0.3;                 // ...down through the deck below
        const o = { y: p - thick / 2 };
        if (axis === 'x') {
          o.x = x0 + f * along; o.z = (z0 + z1) / 2;
          t.box(step, thick, wide, colour, o);
        } else {
          o.x = (x0 + x1) / 2; o.z = z0 + f * along;
          t.box(wide, thick, step, colour, o);
        }
      }
    };

    slope(X_INNER1, -BZ, X_BELT0, BZ, Y_BASE, Y_BELT, 'x', T.riser);
    slope(X_BELT1, -BZ, X_OUTER0, BZ, Y_BELT, Y_OUTER, 'x', T.riserOut);
    slope(X_OUTER1, -BZ, X_RIM0, BZ, Y_OUTER, Y_RIM, 'x', T.riserRim);

    /* ================= orbital tracks =================

       The concentric read of the whole map: the path of everything in it,
       painted in short tangential quads around the star's centre.

       Painted, not built. A raised ring reads from across the map and is
       therefore tall enough to be an obstacle the katamari passes straight
       through, which is the culture stage's growth-ring bug. Flat bands read the
       same from any distance a player ever sees them from. Three lift levels
       because consecutive quads overlap each other and two coplanar quads of
       one colour still shimmer where they cross. */
    const track = (rad, y, col, band, rect) => {
      const seg = Math.max(32, Math.round((TAU * rad) / 0.8));
      const q = (TAU * rad / seg) * 1.3;
      for (let k = 0; k < seg; k++) {
        const a = (k / seg) * TAU;
        const x = SUNX + Math.cos(a) * rad, z = Math.sin(a) * rad;
        if (x < rect[0] || x > rect[2] || z < rect[1] || z > rect[3]) continue;
        t.quad(q, band, col, {
          x, y: y + (k % 3) * 0.0004, z,
          ry: Math.atan2(-Math.cos(a), -Math.sin(a)),
        });
      }
    };
    /* Clipped to each deck INSET BY A THIRD OF A UNIT, not to the deck itself. A
       track quad is placed by its centre and turned to follow the arc, so its
       axis-aligned footprint reaches up to half a unit past that centre — the
       outer deck's westmost arcs were spilling onto ramp B, where the ground is
       a centimetre lower and a paint layer becomes a floor 55% of a radius up.
       That was 68 of this stage's decal failures, at four sample points. */
    const IN = 0.36;
    const R_IN = [-BX, -BZ, X_INNER1 - IN, BZ];
    const R_BE = [X_BELT0 + IN, -BZ, X_BELT1 - IN, BZ];
    const R_OU = [X_OUTER0 + IN, -BZ, X_OUTER1 - IN, BZ];
    const R_RI = [X_RIM0 + IN, -BZ, BX, BZ];
    for (const [rad, hot] of [[17.6, 1], [19.4, 0], [21.2, 0], [22.9, 1]]) {
      track(rad, Y_BASE + DEC_BASE, hot ? 0x5a3a24 : 0x3d2a20, hot ? 0.1 : 0.06, R_IN);
    }
    for (const rad of [26.2, 27.8, 29.4]) {
      track(rad, Y_BELT + DEC_BELT + 0.0006, 0x2c3a68, 0.07, R_BE);
    }
    for (const [rad, hot] of [[33.2, 1], [35.4, 0], [37.6, 1], [39.4, 0]]) {
      track(rad, Y_OUTER + DEC_OUTER, hot ? 0x37508c : 0x263a66, hot ? 0.1 : 0.06, R_OU);
    }
    for (const rad of [41.8, 43.6]) {
      track(rad, Y_RIM + DEC_RIM + 0.0006, 0x2d5484, 0.08, R_RI);
    }

    /* The heliospheric current sheet: the wavy surface where the star's field
       changes sign, running north-south through the belt. Paint, at the same
       tiny offset as everything else on this deck. */
    for (let i = 0; i < 34; i++) {
      const z = -BZ + 0.4 + i * (BZ * 2 - 0.8) / 33;
      const x = (X_BELT0 + X_BELT1) / 2 + Math.sin(z * 0.55) * 1.5;
      t.quad(0.9, 0.16, 0x4c6bb0, {
        x, y: Y_BELT + DEC_BELT + 0.0012, z, ry: Math.cos(z * 0.55) * 0.7,
      });
    }

    /* ================= the Sun's limb =================

       Scenery, and the west wall of the world. Built as z-slices of impassable
       boundary following the sphere's silhouette — cheap, and it cannot leak,
       because each slice is filled from the arc out past the edge of the map.
       Convex INTO the map on purpose: a concave landmark would make a pocket,
       and a pocket at the map edge is where a katamari goes to die. */
    const SL = 0.4;
    for (let z = -BZ - 0.4; z < BZ + 0.4; z += SL) {
      const xe = limbAt(z + SL / 2);
      if (xe == null) continue;
      w.bound(-BX - 0.9, z, xe, z + SL, 0.9);
      // the floor inside it, so the seam at the bottom of the star is not a hole
      t.quad(xe + BX + 0.9, SL * 1.06, 0x120a10, { x: (-BX - 0.9 + xe) / 2, y: Y_BASE + 0.004, z: z + SL / 2 });
    }
    t.sphere(SUNR, S.photo, { x: SUNX, y: SUNY, z: 0 }, 22, 12);
    // granulation and the darker limb, so the star is not one flat gold disc
    for (let i = 0; i < 26; i++) {
      const a = -1.05 + (i % 13) / 12 * 2.1;
      const e = 0.9 + Math.floor(i / 13) * 0.5;
      const rr = SUNR * (0.06 + (i % 5) * 0.02);
      const px = SUNX + Math.cos(a) * Math.sin(e) * SUNR * 0.99;
      const pz = Math.sin(a) * Math.sin(e) * SUNR * 0.99;
      const py = SUNY + Math.cos(e) * SUNR * 0.99;
      t.sphere(rr, i % 3 ? S.photoHot : S.limb, { x: px, y: py, z: pz }, 8, 6);
    }
    // corona: a fringe of streamers standing off the limb
    for (let i = 0; i < 22; i++) {
      const a = -1.15 + (i / 21) * 2.3;
      const len = 1.6 + ((i * 5) % 7) * 0.45;
      const d = SUNR + len * 0.45;
      t.cone(0.55, len, i % 2 ? S.corona : S.plasmaPl, {
        x: SUNX + Math.cos(a * 0.55) * d * 0.999,
        y: SUNY + Math.sin(a) * d * 0.42,
        z: Math.sin(a) * d * 0.9,
        rz: -Math.cos(a) * 1.2, rx: Math.sin(a) * 1.1,
      }, 6);
    }
    // two prominences hanging off it, purely to be looked at
    for (const [aa, sc] of [[0.55, 1.0], [-0.8, 0.72]]) {
      const bx = SUNX + Math.cos(aa) * SUNR * 0.96;
      const bz = Math.sin(aa) * SUNR * 0.96;
      for (let i = 0; i <= 12; i++) {
        const f = i / 12;
        t.sphere(0.38 * sc, i % 2 ? S.plasma : S.plasmaPl, {
          x: bx + Math.sin(f * Math.PI) * 1.5 * sc,
          y: SUNY + SUNR * 0.28 + Math.sin(f * Math.PI) * 5.2 * sc + f * 1.2,
          z: bz + (f - 0.5) * 4.4 * sc,
        }, 7, 5);
      }
    }

    /* ================= the ring arch =================

       The other impassable landmark, and the one you roll under. A ring half
       buried in the outer deck: the two legs are solid walls, the five units
       between them are open deck, and the crown is high enough that the ball is
       never inside it. */
    for (const s of [-1, 1]) {
      w.wall(ARCH_X - 0.48, s * ARCH_R - 0.46, ARCH_X + 0.48, s * ARCH_R + 0.46,
        3.5, 0x2b3a63, Y_OUTER, 1e6);
    }
    t.torus(ARCH_R, ARCH_T, 0x6f86c8, { x: ARCH_X, y: Y_OUTER, z: 0, ry: Math.PI / 2 }, 5, 22);
    t.torus(ARCH_R * 0.86, ARCH_T * 0.55, 0x9fb6ea, { x: ARCH_X, y: Y_OUTER, z: 0, ry: Math.PI / 2 }, 4, 20);
    t.torus(ARCH_R * 1.11, ARCH_T * 0.42, 0x50659f, { x: ARCH_X, y: Y_OUTER, z: 0, ry: Math.PI / 2 }, 4, 20);
    // ring particles caught in the arch
    for (let i = 0; i < 16; i++) {
      const a = 0.25 + (i / 15) * (Math.PI - 0.5);
      const rr = ARCH_R * (0.92 + (i % 3) * 0.1);
      t.sphere(0.1 + (i % 4) * 0.04, i % 2 ? S.icePale : S.iceDeep, {
        x: ARCH_X + ((i % 5) - 2) * 0.1, y: Y_OUTER + Math.sin(a) * rr, z: Math.cos(a) * rr,
      }, 6, 4);
    }

    /* ================= containment ================= */
    const WH = 1.44;
    w.bound(-BX - 0.9, BZ, BX + 0.9, BZ + 0.9, WH, C.black);
    w.bound(-BX - 0.9, -BZ - 0.9, BX + 0.9, -BZ, WH, C.black);
    w.bound(-BX - 0.9, -BZ, -BX, BZ, WH, C.black);
    w.bound(BX, -BZ, BX + 0.9, BZ, WH, C.black);
    // marker pylons, dim, so the edge of the map reads as an edge
    for (let i = 0; i <= 20; i++) {
      const x = -BX + i * (BX * 2) / 20;
      t.box(0.14, 2.1, 0.14, 0x2b4a86, { x, y: 1.05, z: BZ + 0.45 });
      t.box(0.14, 2.1, 0.14, 0x2b4a86, { x, y: 1.05, z: -BZ - 0.45 });
    }
    for (let i = 0; i <= 18; i++) {
      const z = -BZ + i * (BZ * 2) / 18;
      t.box(0.14, 2.1, 0.14, 0x2b4a86, { x: BX + 0.45, y: Y_RIM + 1.05, z });
    }

    /* ================= who goes down first =================

       BIGGEST FIRST, WITH A RUNNING KEEP-OUT LIST. `World.scatter` has no idea
       what is already on the ground, so a prop can land wholly inside a bigger
       one's collision footprint — and a thing you can eat, buried inside a thing
       you cannot, is worse than useless: it is the best-scoring target in its
       neighbourhood and it is unreachable, so the router walks in circles around
       it for the rest of the round without ever tripping the stall detector.
       Measured on the culture stage at nine seeds out of nine.

       So everything with a footprint worth walking round is placed here, in
       descending size order, and each one leaves a keep-out circle behind it.
       The six archetypes below 60Mm — dust through comet nuclei, 48Mm of
       collision radius between them at full scale — are free-scattered at the
       bottom, because nothing that small can hide anything worth having. */
    const ARCH = {};
    for (const p of w.pool('solar', 0, 1e9)) ARCH[p.id] = p;

    const keepOut = [];
    const claim = (x, z, rad, lane) => keepOut.push({ x, z, r: rad + lane });
    /**
     * Is there room for a prop of collision radius `rad` centred here?
     *
     * THE CANDIDATE'S OWN RADIUS HAS TO BE IN THIS SUM, and leaving it out is
     * what made the first draft of this stage unclearable on two seeds in nine.
     * Testing only whether the CENTRE lands outside a keep-out circle lets a
     * planet 0.63 wide park with its centre a hair outside the circle and its
     * body straight through it — so a volcanic moon ended up boxed in by a rocky
     * planet, a magnetotail, a prominence and the Sun's own limb, with every gap
     * narrower than the ball that wanted it. It was the highest-scoring target in
     * its corner of the map and it could not be touched, so both seeds spent
     * seven of their nine minutes orbiting that one spot at 388Mm.
     *
     * `lane` is the width of the corridor LEFT BEHIND by whatever was placed
     * first, and it scales with that prop's own pickup size — the bigger a thing
     * is, the bigger the katamari that will come for its neighbours, and the
     * wider the gap it therefore has to leave.
     */
    const clear = (x, z, rad) => {
      for (const a of keepOut) {
        const rr = a.r + rad;
        if ((x - a.x) ** 2 + (z - a.z) ** 2 < rr * rr) return false;
      }
      return true;
    };
    /** The corridor a prop of this pickup size must leave around itself. */
    const laneFor = (pickup) => Math.max(0.1, pickup * 0.45);

    /* WALLS GET A FENCE. A prop parked flush against a wall is a prop nobody
       gets: closing the last few megametres means grinding along the wall, and
       the approach stops dead the moment the wall says no. Half a unit of
       clearance along the limb and around the arch legs, laid down before
       anything else is placed. */
    for (let z = -BZ; z <= BZ; z += 0.5) {
      const xe = limbAt(z);
      if (xe != null) keepOut.push({ x: xe, z, r: 0.75 });
    }
    for (const s of [-1, 1]) {
      for (let i = 0; i < 6; i++) {
        keepOut.push({ x: ARCH_X - 0.6 + i * 0.24, z: s * ARCH_R, r: 0.8 });
      }
    }
    claim(solarStage.spawn.x, solarStage.spawn.z, 0.85);

    /* Scatter regions, inset from every wall so nothing ends up in a corner: at
       a corner the ball's centre is clamped on BOTH axes, so the nearest legal
       centre is R*sqrt(2) from the corner itself and a wedge of the map goes out
       of reach as the ball grows (`test-reach` is the guard).

       THE INNER ZONE IS ONE RECTANGLE, all the way to the west boundary, and it
       matters that it is. Cutting it into a narrow mid strip plus two corner
       boxes left an empty corridor between the limb and the first column of
       props — nothing to eat in it, and a wall of planets along its eastern side.
       A katamari that wandered in was in a dead pocket. Here the rect simply
       overlaps the limb and the limb's own fence rejects whatever lands inside
       it, which spreads the same props over twice the ground. */
    const REGIONS = {
      inner: [-14.4, -13.4, X_INNER1 - 0.5, 13.4],
      belt:  [X_BELT0 + 0.4, -13.4, X_BELT1 - 0.4, 13.4],
      outer: [X_OUTER0 + 0.4, -13.4, X_OUTER1 - 0.4, 13.4],
      rim:   [X_RIM0 + 0.4, -13.4, BX - 0.6, 13.4],
      // the glacis between two terraces is walkable ground too, and leaving it
      // bare threw away 150 square units of a 840-unit map
      rampA: [X_INNER1 + 0.15, -13.4, X_BELT0 - 0.15, 13.4],
      rampB: [X_BELT1 + 0.15, -13.4, X_OUTER0 - 0.15, 13.4],
      rampC: [X_OUTER1 + 0.15, -13.4, X_RIM0 - 0.15, 13.4],
    };

    /** `stage.density` applied to the hand-written loops; `scatter` does its own. */
    const n = (k) => Math.round(k * (solarStage.density ?? 1));

    /** Place `count` of one archetype in a region, never inside anything down. */
    const sow = (id, count, region, s0, s1) => {
      const [x0, z0, x1, z1] = REGIONS[region];
      const arch = ARCH[id];
      const lane = laneFor(arch.pickup);
      for (let i = 0; i < n(count); i++) {
        const sc = s0 + r() * (s1 - s0);
        const rad = arch.radius * sc;
        let x = 0, z = 0, ok = false;
        for (let k = 0; k < 24 && !ok; k++) {
          x = x0 + r() * (x1 - x0);
          z = z0 + r() * (z1 - z0);
          ok = clear(x, z, rad);
        }
        if (!ok) continue;
        w.placeId(id, x, z, null, sc);
        claim(x, z, rad, lane);
      }
    };

    /* ---------------- the stars themselves ----------------

       Hand-placed, in the inner zone under their own limb, and spaced by hand
       because these ARE the last three rungs and a random draw can leave a hole
       in them or drop two of them on top of each other. Each gets a real
       clearing: a Sun at 1.3 scale is 2.2 units across, and two of them with a
       moon wedged between would make a gate nobody finds.

       These sizes are the reason `balance` has a "too big to ever collect" line.
       The largest here has a pickup of 1Gm837Mm and needs a katamari of
       2Gm088Mm; eating everything else in the stage gets you to about 2Gm535Mm.
       That is 21% of headroom, which is the margin a PLAYER needs rather than
       the margin a perfect bot needs. Do not scale these up without re-reading
       that line. */
    for (const [x, z, sc] of [[-10.4, -5.6, 1.30], [-9.6, 3.4, 1.14], [-11.2, 10.4, 0.98]]) {
      const arch = w.placeId('sol_sun', x, z, r() * TAU, sc);
      claim(x, z, arch.radius * sc, 1.1);
    }

    /* ---------------- everything with a footprint, biggest first ----------------

       [ id, scaleLo, scaleHi, inner, belt, outer, rim, rampA, rampB, rampC ]

       Rows MUST stay in descending pickup order — that ordering is the whole
       guarantee that nothing small is ever buried by something big.

       BIGGER THINGS FURTHER OUT is the shape of the columns: the belt carries
       rubble and moonlets, the outer deck carries the giants, the rim carries
       the heliopause. The inner zone is the exception at both ends — it holds
       the rocky planets and all the plasma, and it holds the star.

       Scale ranges are biased around 1 and never far above it: an instance's
       scale multiplies its pickup size but NOT the volume it adds to the ball
       (`Katamari.attach` uses the archetype's), so scaling a prop up makes it
       harder to eat for no extra reward and widens the shadow it casts. */
    const SOW = [
      ['sol_heliopause',    0.85, 1.08,  0,  0,  1,  3,  0, 0, 0],
      ['sol_prominence',    0.85, 1.08,  5,  0,  0,  0,  0, 0, 0],
      ['sol_ring',          0.85, 1.08,  0,  0,  4,  2,  0, 0, 0],
      ['sol_gasgiant',      0.86, 1.10,  0,  0,  5,  2,  0, 0, 0],
      ['sol_flare',         0.85, 1.10,  6,  0,  1,  0,  0, 0, 0],
      ['sol_icegiant',      0.86, 1.10,  0,  0,  6,  3,  0, 0, 0],
      ['sol_loop',          0.85, 1.10,  7,  1,  1,  0,  0, 0, 0],
      ['sol_ocean',         0.86, 1.10,  1,  0,  6,  2,  0, 1, 0],
      ['sol_rocky',         0.86, 1.10, 10,  0,  3,  0,  1, 0, 0],
      ['sol_bowshock',      0.82, 1.14,  2,  1,  4,  2,  0, 0, 0],
      ['sol_sunspot',       0.84, 1.12, 11,  0,  0,  0,  0, 0, 0],
      ['sol_magnetotail',   0.82, 1.14,  5,  1,  4,  1,  0, 0, 0],
      ['sol_dwarf',         0.84, 1.12,  4,  2,  7,  4,  0, 1, 0],
      ['sol_trojan',        0.82, 1.16,  1,  8,  3,  2,  0, 0, 0],
      ['sol_moon_volcano',  0.84, 1.12,  7,  3,  9,  2,  1, 0, 0],
      ['sol_moon_ice',      0.82, 1.14,  1,  3, 11, 10,  0, 0, 1],
      ['sol_beltcluster',   0.82, 1.16,  1, 12,  4,  3,  1, 1, 0],
      ['sol_moon_crater',   0.82, 1.14,  9,  8, 13,  9,  1, 1, 1],
      ['sol_centaur',       0.82, 1.16,  4,  8, 10, 12,  1, 1, 1],
      ['sol_wind',          0.80, 1.20, 22,  6,  8,  4,  1, 1, 1],
      ['sol_moonlet',       0.80, 1.18, 10, 22, 16, 12,  2, 2, 2],
      ['sol_shepherd',      0.80, 1.18,  8, 16, 12, 10,  2, 2, 2],
      ['sol_kbo',           0.80, 1.20,  4, 16, 20, 30,  2, 2, 2],
    ];
    for (const [id, s0, s1, a, b, c, d, e, f, g] of SOW) {
      sow(id, a, 'inner', s0, s1);
      sow(id, b, 'belt', s0, s1);
      sow(id, c, 'outer', s0, s1);
      sow(id, d, 'rim', s0, s1);
      sow(id, e, 'rampA', s0, s1);
      sow(id, f, 'rampB', s0, s1);
      sow(id, g, 'rampC', s0, s1);
    }

    /* ---------------- the debris ----------------

       Dust grains through comet nuclei, and nothing bigger. `lo`/`hi` are what
       make this pass exist at all: `pool` is empty without them and the whole
       call quietly does nothing.

       Most of it goes in the belt, and it has to. At 50Mm across you cover a
       third of a unit a second and the map is thirty wide, so if the opening is
       not thick the first minute is spent travelling rather than growing. */
    const DUST = { tag: 'solar', lo: 0.010, hi: 0.060, avoid: keepOut, scale: [0.8, 1.2] };
    const box = ([x0, z0, x1, z1]) => ({ x0, z0, x1, z1 });
    w.scatter({ ...DUST, count: 300, ...box(REGIONS.belt) });
    w.scatter({ ...DUST, count: 130, x0: X_BELT0 + 0.4, z0: -11.5, x1: X_BELT1 - 0.4, z1: -1.5 });
    w.scatter({ ...DUST, count: 170, ...box(REGIONS.outer) });
    w.scatter({ ...DUST, count: 100, ...box(REGIONS.rim) });
    w.scatter({ ...DUST, count: 175, ...box(REGIONS.inner) });
    w.scatter({ ...DUST, count: 40, ...box(REGIONS.rampA) });
    w.scatter({ ...DUST, count: 35, ...box(REGIONS.rampB) });
    w.scatter({ ...DUST, count: 30, ...box(REGIONS.rampC) });
  },
};
