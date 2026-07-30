/* ============================================================
   Stage -1 — The Quantum Realm.  50am -> 1fm600am, four and a
   half minutes. The first stage in the game, one floor below the
   atom.

   You start as a quantum fluctuation in the open vacuum and finish
   big enough to swallow a proton. (A real proton is 1.7fm across
   and the goal is 1fm600am, which is the one place in this stage
   where the scale is honest.)

   THE SHAPE OF THE MAP. A cross of open vacuum through the middle
   — that is where you spawn and where the fizz is — with a raised
   field region in each of the four corners, each one a real step
   up, each with a full-width ramp onto it, and each carrying
   bigger things than the one before:

       Lepton Shoal   NW  +75am    electrons, neutrinos, spin
       Colour Field   SW  +170am   quarks, gluons, strings
       Boson Terrace  NE  +300am   W, Z, Higgs, mesons
       Nucleon Shelf  SE  +480am   protons, nuclei

   So the layout IS the size ladder: the further out you get, the
   bigger you have to be to be worth going. Two landmarks anchor
   it — a standing wave across the northern arm and a colour-flux
   arch over the eastern one. Neither is collectable and neither is
   passable; they are there so the place has a skyline.

   Display units are 'femto': one world unit is one femtometre and
   attometres sit under it. NOTHING in the simulation knows that —
   see the note above TIERS in util/math.js for why authoring in
   true metres breaks the physics rather than the readout.
   ============================================================ */

import { C } from '../../render/palette.js';

/* ---------------- ground layers ----------------

   THESE NUMBERS ANSWER TWO QUESTIONS, NOT ONE.

   1. No two big flat horizontal faces may share a Y, or they
      z-fight across their whole overlap — the shimmering-floor
      class, reported on the house roofs and the city's road
      markings.

   2. A DECAL MUST SIT FAR BELOW THE STARTING BALL'S RADIUS, or it
      saws the katamari in half. The culture stage put its mucus
      film at 0.030 on a ball that starts 0.05 across, so the film
      plane went through the middle of the ball and — because the
      camera orbits at ball height — filled the screen edge-on with
      the ball hidden behind it.

   THIS STAGE HAS THE SMALLEST BALL IN THE GAME: 0.05 diameter, so
   a radius of 0.025, so `tools/test-decals` calls anything above
   0.0113 a floor at chest height. The house is the reference for
   what is safe — plank lines at +0.003 on the same ball — and
   every layer here is inside that: the tallest thing painted on
   the vacuum tops out at 0.0044, which is 18% of the starting
   radius and a third of the budget. The gaps BETWEEN layers are
   0.0025 or more, ~0.1 of a radius, which is the same relative
   separation the atom stage uses and comfortably decided at this
   camera distance.  `npm run decals` is the guard. */
const Y_FLOOR  = 0;         // the walkable vacuum
const Y_PLANE  = -0.0040;   // the vacuum sheet itself, just under the surface
const Y_GRID   = -0.0015;   // lattice lines painted on it   (top face)
const Y_SPECK  = 0.0012;    // vacuum-foam specks            (top face)
const Y_FRINGE = 0.0030;    // interference rings (tube centre; tops out at 0.0044)
const FRINGE_T = 0.0014;

/* The four field regions. A deck's height decides when it opens: the katamari
   can WALK AT a step of height h from a diameter of about 1.74h and can pay for
   it out of forward speed from about 2h, so these open at roughly 130am, 300am,
   520am and 840am — one per quarter of the run. Every one of them also has a
   ramp across the FULL width of an edge, so the cliff is rarely what you meet. */
const Y_LEP = 0.075;   // Lepton Shoal, north-west
const Y_COL = 0.170;   // Colour Field, south-west
const Y_BOS = 0.300;   // Boson Terrace, north-east
const Y_NUC = 0.480;   // Nucleon Shelf, south-east

/* A deck is DRAWN this far below the height you walk at, and so is every ramp
   segment. It puts all of it under the collision surface, where `test-decals`
   cannot see it and neither can the player — and it is the cheapest way to be
   certain that no part of a slope is ever a face standing above the ground.
   0.006 is 24% of the starting radius, and you cannot reach the lowest deck
   until the ball is 2.6x that, so nothing ever visibly floats. */
const SKIN = 0.0060;
/** Deck markings, painted between the deck's own face and the walkable top. */
const MARK = 0.0030;
/** The bright rim along a deck's exposed edges — the topmost of the three. */
const RIM  = 0.0010;

/**
 * How much HEIGHT one drawn segment of a ramp may span.
 *
 * A ramp is drawn as a RUN OF SHORT SLABS, never one long one, and the reason is
 * `test-decals`: it buckets a terrain triangle by the AVERAGE height of its three
 * corners. One slab across a four-unit ramp is a triangle whose average sits
 * halfway up the slope while its footprint covers the whole thing, so it reads
 * as a floor at chest height across the entire lower half of the ramp — 421 of
 * the culture stage's 728 failures were nine such plates, and 777 of the atom
 * stage's 820 were eight.
 *
 * Cut into segments, each triangle's average tracks the ground beneath it and
 * the error is bounded by HALF the height one segment spans. At 0.008 that is
 * 0.004, and combined with the 0.006 sink above it means every ramp triangle
 * sits BELOW the ground everywhere on its own footprint, with margin.
 */
const RISE = 0.008;

const B = 15, D = 13;           // half-extents of the playable vacuum
const AX = 5.0, AZ = 4.6;       // half-widths of the two arms of the cross
const WH = 3.4;                 // containment wall height

/* Colours. Dark and luminous: the floor is nearly black and everything drawn on
   it glows. The containment wall is the one thing in the stage that is not
   lit from within, so it takes the shared neutral rather than another violet. */
const VOID     = 0x0f0824;
const VOID_LO  = 0x0a0518;
const LATTICE  = 0x1b1140;
const SPECK_A  = 0x2a1a5c;
const SPECK_B  = 0x3d2680;
const FRINGE_A = 0x3a2a8e;
const FRINGE_B = 0x2a6fb0;
const DECK_LEP = 0x1c1547;
const DECK_COL = 0x231152;
const DECK_BOS = 0x2b1a5e;
const DECK_NUC = 0x341a63;
const RAMPC    = 0x241a55;
const EDGE_C   = 0x54e6ff;
const EDGE_M   = 0xff5cd6;
const EDGE_V   = 0x9a5cff;
const EDGE_A   = 0xd8ff45;
const WALLC    = C.black;
const WALLLIT  = 0x7b4ee0;

export const quantumStage = {
  id: 'quantum',
  name: 'The Quantum Realm',
  subtitle: 'Nothing here is quite anywhere.',
  brief: 'You are a fluctuation in the vacuum, and so is nearly everything ' +
    'around you. Hoover up the virtual pairs and the loose photons in the open ' +
    'cross until you can take leptons, then take the ramps out to the field ' +
    'regions — the lepton shoal north-west, the colour field south-west, the ' +
    'boson terrace under the standing wave, and the nucleon shelf beyond the ' +
    'flux arch, where the nuclei are. Finish the size of a proton.',
  /**
   * DISPLAY UNITS ONLY — see the note above TIERS in util/math.js. One world
   * unit means one femtometre here; the physics never learns that.
   */
  unit: 'femto',
  seed: 19271205,
  startSize: 0.05,
  goal: 1.6,
  time: 270,
  speed: 0.3,
  /**
   * Clutter dial, multiplying every scatter count in this build.
   *
   * DENSITY IS NOT A "MORE OF THE SAME" DIAL — see the note on World.scatter.
   * Every pass draws from one rng stream, so moving it re-rolls the whole stage.
   * Treat a change here as authoring a new stage and re-measure it as one.
   */
  density: 1,
  spread: 1,
  cell: 0.9,
  chunk: 0,
  // The middle of the crossing: the most open spot in the map, and the point the
  // two interference sources are arranged around.
  spawn: { x: -1.6, z: 0.8 },
  spawnClear: 0.5,
  bounds: { minX: -15, maxX: 15, minZ: -13, maxZ: 13 },
  // Close fog at the start — a 50am ball has no business seeing the far wall —
  // opening out with the ball, as everywhere else.
  sky: { top: 0x090418, bottom: 0x1d0a3a, fog: 0x120626, fogNear: 14, fogFar: 46 },
  // Low and cold: nothing down here is lit by a sun, it is lit by itself.
  sun: { x: 0.3, y: 1, z: 0.5, intensity: 0.95 },
  camera: { pitch: 0.33, distance: 6.2 },

  build(w, r) {
    const t = w.terrain;
    const TAU = Math.PI * 2;

    /* ================= the vacuum ================= */
    w.plat(-B, -D, B, D, Y_FLOOR);
    t.quad(B * 2, D * 2, VOID, { y: Y_PLANE });
    // a darker wash down the middle of the cross, so the arms read as a place
    t.box(B * 2 - 0.4, 0.0008, AZ * 2, VOID_LO, { y: Y_PLANE + 0.0012 });
    t.box(AX * 2, 0.0008, D * 2 - 0.4, VOID_LO, { y: Y_PLANE + 0.0012 });

    /** The faint square lattice the vacuum is quantised on. */
    const lattice = (x0, z0, x1, z1, step, col, wide) => {
      for (let x = Math.ceil(x0 / step) * step; x <= x1; x += step) {
        t.box(wide, 0.0012, z1 - z0, col, { x, y: Y_GRID - 0.0006, z: (z0 + z1) / 2 });
      }
      for (let z = Math.ceil(z0 / step) * step; z <= z1; z += step) {
        t.box(x1 - x0, 0.0012, wide, col, { x: (x0 + x1) / 2, y: Y_GRID - 0.0006, z });
      }
    };
    lattice(-B, -D, B, D, 2.2, LATTICE, 0.05);

    /* Two-source interference, sampled onto the lattice rather than drawn as
       rings. Concentric tori would be cheaper to write and would spill straight
       through the containment wall — 17 units of radius on a 15-unit map — so
       the pattern is evaluated per cell instead, which clips itself to the floor
       for free and costs one six-sided disc per constructive cell. */
    const SRC = [[-6.5, 0], [6.5, 0]];
    const K = TAU / 1.55;
    const cell = 1.05;
    for (let x = -B + cell * 0.5; x < B; x += cell) {
      for (let z = -D + cell * 0.5; z < D; z += cell) {
        const amp = Math.cos(Math.hypot(x - SRC[0][0], z - SRC[0][1]) * K)
          + Math.cos(Math.hypot(x - SRC[1][0], z - SRC[1][1]) * K);
        if (amp < 0.55) continue;
        const hot = amp > 1.55;
        t.cyl(cell * (hot ? 0.4 : 0.3), cell * (hot ? 0.4 : 0.3), FRINGE_T * 2,
          hot ? FRINGE_B : FRINGE_A, { x, y: Y_FRINGE, z }, 6);
      }
    }
    // the two sources themselves, marked
    for (const [sx, sz] of SRC) {
      t.cyl(0.34, 0.34, FRINGE_T * 2, EDGE_C, { x: sx, y: Y_FRINGE, z: sz }, 8);
      t.cyl(0.16, 0.16, FRINGE_T * 2.6, EDGE_A, { x: sx, y: Y_FRINGE + 0.0006, z: sz }, 7);
    }

    /* Vacuum foam: specks of nothing-in-particular, thickest where the
       interference is destructive, because that is where there is room. */
    for (let i = 0; i < 260; i++) {
      const x = -B + r() * B * 2, z = -D + r() * D * 2;
      const rr = 0.06 + r() * 0.13;
      t.cyl(rr, rr, 0.0016, r() < 0.3 ? SPECK_B : SPECK_A, { x, y: Y_SPECK - 0.0008, z }, 6);
    }

    /* ================= the four field regions =================

       Each is a box whose TOP FACE is `SKIN` under the walkable height, a
       platform at the walkable height, markings between the two, and a bright
       rim along the edges that are actually exposed. Nothing stands proud of the
       surface the ball rolls on, which is what keeps `test-decals` at zero. */
    const deck = (x0, z0, x1, z1, top, col) => {
      const wq = x1 - x0, dq = z1 - z0;
      const face = top - SKIN;
      const h = face + 0.6;
      t.box(wq, h, dq, col, { x: (x0 + x1) / 2, y: face - h / 2, z: (z0 + z1) / 2 });
      w.plat(x0, z0, x1, z1, top);
    };
    /** A bright rim strip along one edge of a deck. `axis` is the edge's run. */
    const rim = (x0, z0, x1, z1, top, col) => {
      t.box(x1 - x0, 0.0022, z1 - z0, col,
        { x: (x0 + x1) / 2, y: top - RIM - 0.0011, z: (z0 + z1) / 2 });
    };

    deck(-B, AZ, -AX, D, Y_LEP, DECK_LEP);
    deck(-B, -D, -AX, -AZ, Y_COL, DECK_COL);
    deck(AX, AZ, B, D, Y_BOS, DECK_BOS);
    deck(AX, -D, B, -AZ, Y_NUC, DECK_NUC);

    // exposed edges: each corner deck shows the two that face the cross
    rim(-B, AZ, -AX, AZ + 0.2, Y_LEP, EDGE_C);
    rim(-AX - 0.2, AZ, -AX, D, Y_LEP, EDGE_C);
    rim(-B, -AZ - 0.2, -AX, -AZ, Y_COL, EDGE_A);
    rim(-AX - 0.2, -D, -AX, -AZ, Y_COL, EDGE_A);
    rim(AX, AZ, B, AZ + 0.2, Y_BOS, EDGE_M);
    rim(AX, AZ, AX + 0.2, D, Y_BOS, EDGE_M);
    rim(AX, -AZ - 0.2, B, -AZ, Y_NUC, EDGE_V);
    rim(AX, -D, AX + 0.2, -AZ, Y_NUC, EDGE_V);

    /* Deck markings, one motif each so the four regions are told apart at a
       glance. All of them sit between the deck's drawn face and the height the
       ball rolls at, so none of them can ever be a floor at chest height. */
    // Lepton Shoal: a scatter of orbit dots
    for (let i = 0; i < 90; i++) {
      const x = -B + 0.4 + r() * (B - AX - 0.8), z = AZ + 0.4 + r() * (D - AZ - 0.8);
      t.cyl(0.1 + r() * 0.16, 0.1 + r() * 0.16, 0.002, i % 4 ? SPECK_B : EDGE_C,
        { x, y: Y_LEP - MARK - 0.001, z }, 6);
    }
    // Colour Field: red / green / blue patches, because it is the colour field
    const CC = [0xff4d5e, 0x62ff8a, 0x5aa8ff];
    for (let i = 0; i < 84; i++) {
      const x = -B + 0.4 + r() * (B - AX - 0.8), z = -D + 0.4 + r() * (D - AZ - 0.8);
      t.cyl(0.14 + r() * 0.2, 0.14 + r() * 0.2, 0.002, CC[i % 3],
        { x, y: Y_COL - MARK - 0.001, z }, 6);
    }
    // Boson Terrace: concentric rings round its middle, painted as thin bands
    for (let k = 1; k <= 9; k++) {
      const R = k * 0.44;
      t.torus(R, 0.008, k % 2 ? EDGE_M : SPECK_B,
        { x: (AX + B) / 2, y: Y_BOS - MARK, z: (AZ + D) / 2, rx: Math.PI / 2 }, 3, 26);
    }
    // Nucleon Shelf: a close-packed lattice, which is what nucleons do
    for (let row = 0; row < 9; row++) {
      for (let i = 0; i < 11; i++) {
        const x = AX + 0.6 + i * 0.86 + (row % 2) * 0.43;
        const z = -D + 0.7 + row * 0.78;
        if (x > B - 0.4 || z > -AZ - 0.4) continue;
        t.cyl(0.17, 0.17, 0.002, (row + i) % 3 ? SPECK_A : EDGE_V,
          { x, y: Y_NUC - MARK - 0.001, z }, 6);
      }
    }

    /* ================= ramps =================

       EVERY ramp spans the FULL WIDTH of the edge it climbs, and that is the
       single most important thing about this layout. A ramp narrower than the
       wall it climbs has SIDES, and its sides are walls of their own up to the
       full height of the deck — so it fences off the flat it starts on instead
       of opening the boundary it crosses. The atom stage measured a katamari
       shuttling for three minutes against exactly that.

       Each is drawn as a run of short slabs; see RISE. `top` is the height at
       the low end of the axis, `topTo` at the high end, mirroring `World.ramp`. */
    const slope = (x0, z0, x1, z1, top, topTo, axis, col) => {
      w.ramp(x0, z0, x1, z1, top, topTo, axis);
      const along = axis === 'x' ? x1 - x0 : z1 - z0;
      const wide = axis === 'x' ? z1 - z0 : x1 - x0;
      const rise = topTo - top;
      const m = Math.max(1, Math.ceil(Math.abs(rise) / RISE));
      const step = (along / m) * 1.02;
      for (let i = 0; i < m; i++) {
        const f = (i + 0.5) / m;
        const face = top + f * rise - SKIN;    // the drawn top, sunk clear of collision
        const thick = face + 0.4;              // ...and down through the vacuum below
        const o = { y: face - thick / 2 };
        if (axis === 'x') {
          o.x = x0 + f * along; o.z = (z0 + z1) / 2;
          t.box(step, thick, wide, col, o);
        } else {
          o.x = (x0 + x1) / 2; o.z = z0 + f * along;
          t.box(wide, thick, step, col, o);
        }
      }
    };

    // cross -> Lepton Shoal: the whole southern edge of the deck
    slope(-B, 2.9, -AX, AZ, Y_FLOOR, Y_LEP, 'z', RAMPC);
    // cross -> Colour Field: the whole northern edge
    slope(-B, -AZ, -AX, -2.7, Y_COL, Y_FLOOR, 'z', RAMPC);
    // cross -> Boson Terrace: the whole western edge, up the northern arm
    slope(2.4, AZ, AX, D, Y_FLOOR, Y_BOS, 'x', RAMPC);
    // cross -> Nucleon Shelf: the whole western edge, up the southern arm
    slope(0.6, -D, AX, -AZ, Y_FLOOR, Y_NUC, 'x', RAMPC);

    /* ================= containment ================= */
    w.bound(-B - 0.9, D, B + 0.9, D + 0.9, WH, WALLC);
    w.bound(-B - 0.9, -D - 0.9, B + 0.9, -D, WH, WALLC);
    w.bound(-B - 0.9, -D, -B, D, WH, WALLC);
    w.bound(B, -D, B + 0.9, D, WH, WALLC);
    // field emitters up the walls, so the box reads as apparatus
    for (let i = -7; i <= 7; i++) {
      const x = i * 2.1;
      if (Math.abs(x) > B) continue;
      t.box(0.1, WH - 0.2, 0.1, WALLLIT, { x, y: (WH - 0.2) / 2, z: D + 0.45 });
      t.box(0.1, WH - 0.2, 0.1, WALLLIT, { x, y: (WH - 0.2) / 2, z: -D - 0.45 });
    }
    for (let i = -6; i <= 6; i++) {
      const z = i * 2.1;
      if (Math.abs(z) > D) continue;
      t.box(0.1, WH - 0.2, 0.1, WALLLIT, { x: -B - 0.45, y: (WH - 0.2) / 2, z });
      t.box(0.1, WH - 0.2, 0.1, WALLLIT, { x: B + 0.45, y: (WH - 0.2) / 2, z });
    }

    /* Keep-out circles. `World.scatter` places at random with no regard for what
       is already there, so a wide prop landing on a narrow one buries it — and a
       greedy router that locks onto an unreachable prop chases it until the
       clock runs out without ever tripping the stall detector. Everything wide
       enough to hide something goes down FIRST and lands in this list as it
       goes; every later pass consults it. */
    const avoid = [];
    const claim = (x, z, rad) => avoid.push({ x, z, r: rad });

    /* ================= landmark: the standing wave =================

       Scenery, across the top of the northern arm and flush against the wall so
       it cannot leave a sealed pocket behind it. Solid over its whole footprint:
       `groundAt` reports a wall volume there, which both stops the katamari and
       stops every scatter pass from parking a prop inside it. */
    const SWX0 = -AX, SWX1 = 1.9, SWZ0 = 10.8, SWZ1 = D;
    const SWZC = (SWZ0 + SWZ1) / 2;
    t.box(SWX1 - SWX0, 0.16, SWZ1 - SWZ0, DECK_BOS,
      { x: (SWX0 + SWX1) / 2, y: 0.08, z: SWZC });
    w.wall(SWX0, SWZ0, SWX1, SWZ1, 0.16, null, 0, 1e6);
    {
      const n = 11, span = SWX1 - SWX0 - 0.5;
      for (let i = 0; i < n; i++) {
        const tt = (i + 0.5) / n;
        const x = SWX0 + 0.25 + tt * span;
        const env = Math.sin(tt * Math.PI * 3);
        const h = 0.34 + Math.abs(env) * 2.5;
        const col = env >= 0 ? EDGE_C : EDGE_M;
        // A lobe, standing up. Three depths of it, dimmest at the back, so the
        // ridge has some body instead of being a row of posts.
        for (let k = 0; k < 3; k++) {
          const dz = (k - 1) * 0.62;
          const s = 1 - Math.abs(k - 1) * 0.34;
          t.cyl(0.1 * s, 0.17 * s, h * s, k === 1 ? col : DECK_COL,
            { x, y: 0.16 + (h * s) / 2, z: SWZC + dz }, 7);
          if (k === 1) {
            t.sphere(0.19, col, { x, y: 0.16 + h, z: SWZC + dz }, 7, 5);
            t.sphere(0.09, 0xfff4d6, { x, y: 0.16 + h + 0.2, z: SWZC + dz }, 6, 4);
          }
        }
        // the node markers, painted flat on the plinth
        if (Math.abs(env) < 0.36) {
          t.cyl(0.24, 0.24, 0.004, EDGE_A, { x, y: 0.158, z: SWZC }, 8);
        }
      }
      // the envelope, traced above the lobes
      for (let i = 0; i <= 40; i++) {
        const tt = i / 40;
        const x = SWX0 + 0.25 + tt * span;
        const h = 0.34 + Math.abs(Math.sin(tt * Math.PI * 3)) * 2.5;
        t.sphere(0.05, EDGE_V, { x, y: 0.16 + h + 0.42, z: SWZC }, 5, 4);
      }
    }
    claim((SWX0 + SWX1) / 2, SWZ0 - 0.4, 1.0);

    /* ================= landmark: the colour-flux arch =================

       Two legs and a span over the eastern arm — the gateway between the boson
       terrace and the nucleon shelf. The legs are claimed solid; the span is not
       claimed at all, because it starts three units up and the largest ball this
       stage can ever produce is under three units across, so it is never
       anything but skyline. Nothing about it is horizontal at ball height. */
    const ARX = 9.6, ARZ = 3.5, ARY = 3.0;
    for (const s of [-1, 1]) {
      const z = s * ARZ;
      t.cyl(0.42, 0.62, ARY, RAMPC, { x: ARX, y: ARY / 2, z }, 8);
      for (let k = 0; k < 4; k++) {
        t.torus(0.5 - k * 0.04, 0.05, k % 2 ? EDGE_A : EDGE_M,
          { x: ARX, y: 0.4 + k * 0.68, z, rx: Math.PI / 2 }, 3, 12);
      }
      w.wall(ARX - 0.66, z - 0.66, ARX + 0.66, z + 0.66, ARY, null, 0, 1e6);
      claim(ARX, z, 1.15);
    }
    {
      const n = 22, lift = 2.7;
      const cc = [0xff4d5e, 0x62ff8a, 0x5aa8ff];
      for (let i = 0; i <= n; i++) {
        const tt = i / n, a = tt * Math.PI;
        const z = -Math.cos(a) * ARZ;
        const y = ARY + Math.sin(a) * lift;
        t.sphere(0.2, i % 2 ? EDGE_V : RAMPC, { x: ARX, y, z }, 7, 5);
        // three colour strands winding round the span
        for (let k = 0; k < 3; k++) {
          const ph = tt * TAU * 2.2 + (k * TAU) / 3;
          t.sphere(0.075, cc[k], {
            x: ARX + Math.cos(ph) * 0.3,
            y: y + Math.sin(ph) * 0.3 * Math.cos(a) * 0.6,
            z: z + Math.sin(ph) * 0.3 * Math.sin(a),
          }, 5, 4);
        }
      }
      t.sphere(0.3, 0xfff4d6, { x: ARX, y: ARY + lift + 0.24, z: 0 }, 8, 6);
    }

    /* ================= regions =================

       Inset from the walls by at least 0.8 everywhere. That is not decoration:
       `moveKatamari` clamps the ball's centre to the bounds inset by one radius,
       so at a corner the nearest legal centre is R*sqrt(2) from the corner and a
       prop tucked right into it becomes unreachable AS THE BALL GROWS. An inset
       of 0.3 of the largest radius is enough to keep that from ever happening;
       `npm run reach` is the guard. */
    const CROSS  = [-AX + 0.4, -AZ + 0.4, AX - 0.4, AZ - 0.4];
    const ARM_E  = [AX + 0.4, -AZ + 0.4, B - 0.9, AZ - 0.4];
    const ARM_W  = [-B + 0.9, -2.5, -AX - 0.4, 2.7];
    const ARM_N  = [-AX + 0.4, AZ + 0.4, 2.2, SWZ0 - 0.5];
    const ARM_S  = [-AX + 0.4, -D + 0.9, 0.4, -AZ - 0.4];
    const P_LEP  = [-B + 0.9, AZ + 0.6, -AX - 0.6, D - 0.9];
    const P_COL  = [-B + 0.9, -D + 0.9, -AX - 0.6, -AZ - 0.6];
    const P_BOS  = [AX + 0.6, AZ + 0.6, B - 0.9, D - 0.9];
    const P_NUC  = [AX + 0.6, -D + 0.9, B - 0.9, -AZ - 0.6];

    /* ...and the same four decks with the RAMP LANDING CUT OUT, for anything
       wide enough to be a wall when it lands there.

       This distinction is the most expensive thing in the file. The first draft
       sowed every big prop into the whole deck, which put a neutron at x 5.95, a
       nucleon pair at 6.00 and a nucleus at 6.45 — a solid barrier across the
       top of the southern ramp, one prop-width in from the lip. Measured: at a
       diameter of 1fm16am there was NOT ONE free position anywhere along the
       shelf edge at z = -9, and a katamari that had locked onto a probability
       cloud behind it spent the last ninety seconds of the run shuttling on the
       slope. It never triggered the stall detector, because it was moving the
       whole time. One run in nine finished at 63% of the goal for this reason
       and every other run finished at 140%.

       A big prop anywhere ELSE on a deck is just an obstacle you roll around.
       A big prop at the top of the only ramp is a locked door. */
    const O_LEP  = [-B + 0.9, AZ + 2.3, -AX - 0.6, D - 0.9];
    const O_COL  = [-B + 0.9, -D + 0.9, -AX - 0.6, -AZ - 2.3];
    const O_BOS  = [AX + 2.3, AZ + 0.6, B - 0.9, D - 0.9];
    const O_NUC  = [AX + 2.3, -D + 0.9, B - 0.9, -AZ - 0.6];

    /** The apron at the top and bottom of a ramp: keep everything off the lip. */
    const apron = (x0, z0, x1, z1, rad) => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const n = Math.max(1, Math.round(len / (rad * 1.9)));
      for (let i = 0; i <= n; i++) {
        const f = i / n;
        claim(x0 + (x1 - x0) * f, z0 + (z1 - z0) * f, rad);
      }
    };
    // top of each ramp, half an apron-width onto the deck
    apron(-B + 0.5, AZ + 0.45, -AX - 0.5, AZ + 0.45, 0.45);
    apron(-B + 0.5, -AZ - 0.45, -AX - 0.5, -AZ - 0.45, 0.45);
    apron(AX + 0.45, AZ + 0.5, AX + 0.45, D - 0.5, 0.45);
    apron(AX + 0.45, -D + 0.5, AX + 0.45, -AZ - 0.5, 0.45);
    // and the foot of the two long ones, which are the two that matter
    apron(2.0, AZ + 0.5, 2.0, D - 0.5, 0.4);
    apron(0.2, -D + 0.5, 0.2, -AZ - 0.5, 0.4);

    const ARCH = {};
    for (const p of w.pool('quantum', 0, 1e9)) ARCH[p.id] = p;

    /**
     * Place `n` of one archetype inside a rectangle, respecting and then
     * extending the keep-out list.
     *
     * Counts are per ARCHETYPE rather than per band up here, because the mass at
     * the top of the ladder is what decides where a run finishes and a weighted
     * draw over a band does not let you aim it. One nucleus is worth forty
     * Higgs bosons.
     *
     * Scale ranges are biased BELOW 1 throughout. An instance's scale multiplies
     * its pickup size but NOT the volume it adds to the ball (`Katamari.attach`
     * uses the archetype's), so scaling a prop up makes it harder to eat for no
     * extra reward and widens the shadow it casts. Down is free; up is a tax.
     */
    const sow = (id, n, rect, sLo = 0.88, sHi = 1.0, pad = 0.16) => {
      const arch = ARCH[id];
      if (!arch || n <= 0) return;
      for (let i = 0; i < n; i++) {
        const sc = sLo + r() * (sHi - sLo);
        const rad = arch.radius * sc;
        let ok = false, x = 0, z = 0;
        for (let tries = 0; tries < 40 && !ok; tries++) {
          x = rect[0] + r() * (rect[2] - rect[0]);
          z = rect[1] + r() * (rect[3] - rect[1]);
          ok = true;
          for (const a of avoid) {
            const rr = a.r + rad;
            if ((x - a.x) ** 2 + (z - a.z) ** 2 < rr * rr) { ok = false; break; }
          }
        }
        if (!ok) continue;
        w.placeId(id, x, z, r() * TAU, sc);
        avoid.push({ x, z, r: rad + pad });
      }
    };

    /* ================= matter, placed by hand =================

       The five heaviest archetypes carry three quarters of the stage's mass
       between seventeen objects, and every one of them is still a wall when the
       deck it sits on first opens. Random sowing cannot be trusted with that: it
       has no idea whether the six positions it happened to pick add up to a
       barrier, and on a deck only eight units wide six of these ARE one.

       So they go down by hand, in an L round the OUTER edges of the two high
       decks, leaving the inner half of each deck — the half the ramp arrives on —
       as open floor. That is also the right shape for the eye: the further out
       you get, the bigger the thing standing there. */
    const MATTER = [
      // Nucleon Shelf: the far corner, the outer edge, and one lone island
      ['q_nucleus', 13.0, -10.8], ['q_nucleonpair', 13.1, -7.4],
      ['q_neutron', 10.4, -11.4], ['q_alpha', 7.4, -11.3],
      ['q_proton', 12.6, -5.8], ['q_proton', 9.2, -8.4],
      // Boson Terrace: the same arrangement mirrored
      ['q_nucleus', 13.0, 10.8], ['q_nucleonpair', 13.1, 7.4],
      ['q_neutron', 10.4, 11.3], ['q_alpha', 7.6, 11.4],
      ['q_proton', 12.4, 5.8],
      // the eastern arm, which is open vacuum: obstacles here, not walls
      ['q_neutron', 12.9, -1.2], ['q_nucleonpair', 7.2, -2.4],
      ['q_proton', 6.6, 2.6], ['q_proton', 13.2, 3.0],
    ];
    for (const [id, x, z] of MATTER) {
      w.placeId(id, x, z, r() * TAU, 0.9 + r() * 0.08);
      claim(x, z, ARCH[id].radius + 0.3);
    }

    /* ================= the rest of the top of the ladder =================

       Largest first, so the biggest get the room they need and nothing small is
       ever dropped inside one of their collision volumes. The three that are
       still uneatable when a deck opens — superposition, probability cloud,
       entangled pair — keep to the ramp-free `O_` rectangles; the two that are
       not go anywhere on the deck. Weighted outward throughout. */
    sow('q_superpos', 2, O_NUC, 0.88, 1.02, 0.2);
    sow('q_superpos', 2, O_BOS, 0.88, 1.02, 0.2);
    sow('q_superpos', 1, O_COL, 0.88, 1.02, 0.2);
    sow('q_superpos', 1, ARM_E, 0.88, 1.02, 0.2);
    sow('q_cloud', 3, O_NUC, 0.86, 1.02, 0.16);
    sow('q_cloud', 3, O_BOS, 0.86, 1.02, 0.16);
    sow('q_cloud', 2, O_COL, 0.86, 1.02, 0.16);
    sow('q_cloud', 1, O_LEP, 0.86, 1.02, 0.16);
    sow('q_cloud', 1, ARM_E, 0.86, 1.02, 0.16);
    sow('q_entangled', 3, O_NUC, 0.86, 1.02, 0.14);
    sow('q_entangled', 3, O_BOS, 0.86, 1.02, 0.14);
    sow('q_entangled', 3, O_COL, 0.86, 1.02, 0.14);
    sow('q_entangled', 2, O_LEP, 0.86, 1.02, 0.14);
    sow('q_entangled', 1, ARM_W, 0.86, 1.02, 0.14);
    sow('q_mesonpair', 3, P_NUC, 0.86, 1.02, 0.12);
    sow('q_mesonpair', 3, P_BOS, 0.86, 1.02, 0.12);
    sow('q_mesonpair', 3, P_COL, 0.86, 1.02, 0.12);
    sow('q_mesonpair', 3, P_LEP, 0.86, 1.02, 0.12);
    sow('q_mesonpair', 1, ARM_E, 0.86, 1.02, 0.12);
    sow('q_mesonpair', 1, ARM_S, 0.86, 1.02, 0.12);
    sow('q_higgs', 4, P_NUC, 0.86, 1.02, 0.1);
    sow('q_higgs', 4, P_BOS, 0.86, 1.02, 0.1);
    sow('q_higgs', 3, P_COL, 0.86, 1.02, 0.1);
    sow('q_higgs', 3, P_LEP, 0.86, 1.02, 0.1);
    sow('q_higgs', 1, ARM_E, 0.86, 1.02, 0.1);
    sow('q_higgs', 1, ARM_N, 0.86, 1.02, 0.1);

    /**
     * Everything below the landmarks, by SIZE BAND and in DESCENDING order.
     *
     * Same rule as above, one tier down and for the same reason: the bands are
     * disjoint and laid biggest-first, so a virtual pair can never be dropped on
     * top of a gluon and hide it. Running it the obvious way round — small
     * first, big last — cost the atom stage 220 of its 300 seconds, because the
     * router locked onto a carbon atom that a methane had landed on and sat
     * there.
     */
    const sowBand = (lo, hi, n, rect, sLo = 0.86, sHi = 1.02, pad = 0.03) => {
      if (n <= 0) return;
      const pool = w.pool('quantum', lo, hi);
      if (!pool.length) return;
      const totalW = pool.reduce((a, p) => a + p.weight, 0);
      for (let i = 0; i < n; i++) {
        let pick = r() * totalW, arch = pool[pool.length - 1];
        for (const p of pool) { pick -= p.weight; if (pick <= 0) { arch = p; break; } }
        const sc = sLo + r() * (sHi - sLo);
        const rad = arch.radius * sc;
        let ok = false, x = 0, z = 0;
        for (let tries = 0; tries < 12 && !ok; tries++) {
          x = rect[0] + r() * (rect[2] - rect[0]);
          z = rect[1] + r() * (rect[3] - rect[1]);
          ok = true;
          for (const a of avoid) {
            const rr = a.r + rad;
            if ((x - a.x) ** 2 + (z - a.z) ** 2 < rr * rr) { ok = false; break; }
          }
        }
        if (!ok) continue;
        w.placeId(arch.id, x, z, r() * TAU, sc);
        avoid.push({ x, z, r: rad + pad });
      }
    };

    /* Disjoint bands, so "descending" means something:
         B7  kaon / Feynman vertex
         B6  W boson / Z boson
         B5  muon / pion
         B4  wavefunction lobe / Planck foam / vibrating string
         B3  gluon / interference fringe
         B2  the four quarks
         B1  spin / electron / positron
       ...and the columns are the regions, ordered inward-to-outward. The
       gradient down each column is the whole design: small things live in the
       cross where you start, big things live out on the decks. */
    const REGION = [CROSS, ARM_E, ARM_W, ARM_N, ARM_S, P_LEP, P_COL, P_BOS, P_NUC];
    const TABLE = [
      { lo: 0.400, hi: 0.500, n: [2, 3, 3, 3, 3, 3, 6, 8, 9] },
      { lo: 0.280, hi: 0.400, n: [4, 5, 4, 4, 4, 5, 8, 9, 9] },
      { lo: 0.200, hi: 0.280, n: [6, 8, 6, 6, 6, 8, 10, 10, 8] },
      { lo: 0.125, hi: 0.200, n: [14, 14, 10, 10, 10, 14, 16, 16, 14] },
      { lo: 0.090, hi: 0.125, n: [16, 14, 10, 9, 9, 12, 12, 8, 6] },
      { lo: 0.050, hi: 0.090, n: [45, 40, 28, 24, 24, 30, 24, 10, 5] },
      { lo: 0.030, hi: 0.050, n: [60, 40, 30, 25, 25, 25, 15, 5, 0] },
    ];
    for (const band of TABLE) {
      for (let i = 0; i < REGION.length; i++) sowBand(band.lo, band.hi, band.n[i], REGION[i]);
    }

    /* ================= the vacuum fizz =================

       The only pass that may overlap, and the only one that goes through
       `World.scatter`, which does no overlap test at all. At 15am to 27am across
       these are smaller than the katamari is on its first frame and cannot hide
       anything from anybody.

       Most of them sit in the cross, and they have to: at 50am across you cover
       30am of ground a second, so if the opening is not thick you spend the
       first minute travelling instead of growing. */
    const fizz = (rect, count) => w.scatter({
      tag: 'quantum', lo: 0.010, hi: 0.030, count,
      x0: rect[0], z0: rect[1], x1: rect[2], z1: rect[3],
      scale: [0.86, 1.02], avoid,
    });
    fizz(CROSS, 150);
    fizz(ARM_E, 90);
    fizz(ARM_W, 60);
    fizz(ARM_N, 55);
    fizz(ARM_S, 55);
    fizz(P_LEP, 40);
    fizz(P_COL, 25);
    fizz(P_BOS, 15);

    /* And a last handful right under the spawn, so the first two seconds pay
       off rather than being spent looking for something to eat. */
    const NEST = [
      quantumStage.spawn.x - 2.6, quantumStage.spawn.z - 2.2,
      quantumStage.spawn.x + 2.6, quantumStage.spawn.z + 2.2,
    ];
    fizz(NEST, 70);
    sowBand(0.030, 0.050, 34, NEST);
    sowBand(0.050, 0.090, 16, NEST);
  },
};
