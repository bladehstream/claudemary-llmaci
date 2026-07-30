/* ============================================================
   Stage 0 — The Atom.  1Å -> 3nm2Å, five minutes.

   You start as a hydrogen atom in the free-particle soup at the
   middle of a probability field, and finish having eaten a
   protein domain.

   The map is four energy levels stepping outward from the court
   you spawn in. Each is a real step up, each has ramps onto it,
   and each carries bigger things than the one inside it — so the
   layout itself is the size ladder. North of the court the field
   condenses into matter: an ionic lattice on the west plate and
   an organic plateau on the east, with the double helix standing
   over it.

   Display units are 'atomic': one world unit is one nanometre.
   NOTHING in the simulation knows that. The stage is authored in
   the same numeric band the house's metres live in — see the note
   above TIERS in util/math.js for why authoring in true metres
   breaks the physics rather than the readout.
   ============================================================ */

import { C } from '../../render/palette.js';

/* ---------------- ground layers ----------------

   THESE NUMBERS ANSWER TWO QUESTIONS, NOT ONE.

   1. No two big flat horizontal faces may share a Y, or they
      z-fight across their whole overlap — which is what striped
      the house roofs and made the city's road markings flicker.
      That is the constraint the city stage documents.

   2. A decal must sit FAR BELOW THE BALL'S RADIUS, or it saws the
      katamari in half. Nobody wrote this one down until the
      culture stage put its mucus film at 0.030 on a ball that
      starts 0.05 across — the film plane went through the middle
      of the ball and, because the camera orbits at ball height,
      filled the screen edge-on with the ball hidden behind it.

   The house is the reference for (2): plank lines at +0.003 on the
   same 0.05 starting ball, under 1/8 of the starting radius. This
   stage starts at 0.1, so the starting radius is 0.05 and the
   budget is about 0.006. `node tools/test-decals.mjs` is the
   guard; it samples every position a ball could occupy and looks
   for a roughly-horizontal terrain face 0.45 to 1.55 radii up.

   The three base layers sit BELOW the walkable surface rather
   than above it, which sidesteps (2) entirely down there — an
   electron is 26pm tall and a decal above the floor would bury a
   third of it anyway. */
const Y_BASE  = 0;        // walkable surface of the probability field
const Y_HEX   = -0.006;   // hex cells painted on it
const Y_GRID  = -0.018;   // the lattice lines under those
const Y_DIM   = -0.028;   // the darker wash under the court
const Y_PLANE = -0.04;    // the field itself

/* The terraces. Each riser's top face IS the walkable height, and
   each terrace's surface markings sit `DEC` above it — which has to
   satisfy both constraints at once: big enough that a 52-unit plate
   and its markings do not z-fight near the ball (the house uses
   0.005 over 26 units), and small enough to stay a decal. 0.011 is
   22% of the starting radius, comfortably under the 45% the decal
   test calls a floor, and under half of it. */
const DEC     = 0.011;
/** Edge lip, which has to clear the terrace top but stay under the markings. */
const LIP_Y   = 0.005;
const Y_S1    = 0.55;     // shell I — the two side terraces
const Y_S2    = 1.10;     // shell II — the outer band, south
const Y_LAT   = 1.62;     // the ionic lattice plate, north-west
const Y_ORG   = 2.14;     // the organic plateau, north-east

/* Ramp plates. `World.ramp` gives the katamari an infinitely thin
   collision plane, so the visible slab has to be hung UNDER it —
   centre a slab on that plane and half its thickness stands proud
   of the surface the ball is actually rolling along, and the ball
   sinks into the ramp it is climbing. The half-thickness has to be
   measured VERTICALLY, which on a tilted slab is longer than half
   the thickness. */
const RAMP_SINK = (thickness, tilt) => (thickness / 2) / Math.cos(Math.abs(tilt));
/** ...and then a hair further down, so nothing ever pokes through. */
const RAMP_EPS = 0.004;
/**
 * How much HEIGHT one drawn segment of a ramp may span.
 *
 * A ramp is drawn as a run of short slabs, not one long one, and the reason is
 * `test-decals`: it buckets a terrain triangle by the AVERAGE height of its
 * three corners and compares that against the ground under the sampled point.
 * One slab across a 9nm ramp is a triangle whose average height sits halfway
 * up the slope, so it reads as a floor at chest height over the whole band of
 * the ramp that happens to be half a ball below it — 777 of this stage's 820
 * failures, 9.5% of every position in the stage, from eight slabs.
 *
 * Cut into segments, each triangle's average tracks the ground beneath it and
 * the error is bounded by the height the segment spans. The bound has to hold
 * at the STARTING radius of 0.05, where the test's floor is 0.45 x 0.05 =
 * 0.0225: a triangle's average sits within 2/3 of a segment's rise of the
 * ground under any point it covers, so 0.028 leaves a comfortable margin.
 */
const RAMP_STEP = 0.028;

const BX = 26, BZ = 22;   // half-extents of the playable floor
/** The court: the only part of the base plane left uncovered. */
const CX = 11, CZ0 = -11, CZ1 = 6;

const FIELD    = 0x150e2e;
const FIELD_LO = 0x0f0a22;
const HEXA     = 0x241a4e;
const HEXB     = 0x2e2064;
const LINE     = 0x1d1440;
const RISER    = 0x231954;
const RISER2   = 0x2b1f66;
const EDGE     = 0x6a48c8;
const EDGE2    = 0x3fb7d8;
const RAMPC    = 0x352578;
// The containment wall is the one thing in the stage that is not luminous,
// so it takes the shared neutral rather than another violet.
const WALLC    = C.black;
const WALLLIT  = 0x7b4ee0;

export const atomStage = {
  id: 'atom',
  name: 'The Atom',
  subtitle: 'Everything is mostly empty space. Fill it.',
  brief: 'You are one hydrogen atom in a cloud of loose particles. Sweep up the ' +
    'electrons and nuclei around you until you can take whole molecules, then take ' +
    'the ramps out to the higher shells — the salt lattice to the north-west, the ' +
    'organic plateau under the double helix to the north-east, and the outer band ' +
    'to the south, where the folded proteins are.',
  /**
   * DISPLAY UNITS ONLY. One world unit means one nanometre / micrometre /
   * kilometre depending on the stage; the physics never learns this. See the
   * note above TIERS in util/math.js for why authoring in true metres breaks.
   */
  unit: 'atomic',
  seed: 19271024,
  startSize: 0.1,
  goal: 3.2,
  time: 300,
  speed: 0.68,
  density: 1,
  spread: 1,
  cell: 1.8,
  chunk: 0,
  spawn: { x: 4, z: -6 },
  spawnClear: 0.6,
  bounds: { minX: -26, maxX: 26, minZ: -22, maxZ: 22 },
  // Dark and luminous. The fog is close enough to hide the far wall at the
  // starting size and opens out with the ball, as everywhere else.
  sky: { top: 0x0a0620, bottom: 0x2a1a5e, fog: 0x160d36, fogNear: 16, fogFar: 62 },
  // Low and cool: nothing here is lit by a sun, it is lit by itself.
  sun: { x: 0.35, y: 0.9, z: 0.45, intensity: 0.82 },
  camera: { pitch: 0.36, distance: 6.4 },

  build(w, r) {
    const t = w.terrain;
    const TAU = Math.PI * 2;

    /* ---------------- the probability field ---------------- */
    w.plat(-BX, -BZ, BX, BZ, Y_BASE);
    t.quad(BX * 2, BZ * 2, FIELD, { y: Y_PLANE });
    t.quad(CX * 2 + 4, CZ1 - CZ0 + 4, FIELD_LO, { y: Y_DIM, z: (CZ0 + CZ1) / 2 });

    /** Lattice lines: the faint square grid the hexes sit on. */
    const gridLines = (x0, z0, x1, z1, y, step, col, wide) => {
      for (let x = Math.ceil(x0 / step) * step; x <= x1; x += step) {
        t.box(wide, 0.01, z1 - z0, col, { x, y: y - 0.005, z: (z0 + z1) / 2 });
      }
      for (let z = Math.ceil(z0 / step) * step; z <= z1; z += step) {
        t.box(x1 - x0, 0.01, wide, col, { x: (x0 + x1) / 2, y: y - 0.005, z });
      }
    };

    /**
     * Hex cells — a six-sided cylinder is a hexagon, and at eight tris a
     * cell this is the cheapest way to say "the floor is a probability
     * density and not a floor".
     */
    const hexField = (x0, z0, x1, z1, y, step, a, bcol, chance) => {
      const dz = step * 0.866;
      let row = 0;
      for (let z = z0 + dz * 0.5; z < z1; z += dz, row++) {
        for (let x = x0 + (row % 2 ? step * 0.5 : 0) + step * 0.5; x < x1; x += step) {
          if (r() > chance) continue;
          const hot = r() < 0.14;
          t.cyl(step * 0.44, step * 0.44, 0.012, hot ? bcol : a, { x, y: y - 0.006, z }, 6);
        }
      }
    };

    gridLines(-CX, CZ0, CX, CZ1, Y_GRID, 2.4, LINE, 0.09);
    hexField(-CX, CZ0, CX, CZ1, Y_HEX, 2.4, HEXA, HEXB, 0.82);

    /* ---------------- shell I: the two side terraces ---------------- */
    const terrace = (x0, z0, x1, z1, top, col, edgeCol) => {
      const wq = x1 - x0, dq = z1 - z0;
      t.box(wq, top + 0.5, dq, col, { x: (x0 + x1) / 2, y: (top - 0.5) / 2, z: (z0 + z1) / 2 });
      // A bright lip on every exposed edge, so a step reads as a step. Its
      // TOP has to clear the terrace's own top face or it is buried inside
      // the riser and never seen at all.
      const lip = 0.22, ly = top + LIP_Y - 0.025;
      t.box(wq, 0.05, lip, edgeCol, { x: (x0 + x1) / 2, y: ly, z: z0 + lip / 2 });
      t.box(wq, 0.05, lip, edgeCol, { x: (x0 + x1) / 2, y: ly, z: z1 - lip / 2 });
      t.box(lip, 0.05, dq, edgeCol, { x: x0 + lip / 2, y: ly, z: (z0 + z1) / 2 });
      t.box(lip, 0.05, dq, edgeCol, { x: x1 - lip / 2, y: ly, z: (z0 + z1) / 2 });
      w.plat(x0, z0, x1, z1, top);
    };

    terrace(-BX, CZ0, -CX, CZ1, Y_S1, RISER, EDGE);
    terrace(CX, CZ0, BX, CZ1, Y_S1, RISER, EDGE);
    hexField(-BX, CZ0, -CX, CZ1, Y_S1 + DEC, 2.6, HEXB, EDGE2, 0.4);
    hexField(CX, CZ0, BX, CZ1, Y_S1 + DEC, 2.6, HEXB, EDGE2, 0.4);

    /* ---------------- shell II: the outer band ---------------- */
    terrace(-BX, -BZ, BX, CZ0, Y_S2, RISER2, EDGE);
    hexField(-BX, -BZ, BX, CZ0, Y_S2 + DEC, 3.0, HEXB, EDGE2, 0.34);

    /* ---------------- the ionic lattice plate ---------------- */
    terrace(-BX, CZ1, 0, BZ, Y_LAT, RISER, EDGE2);
    gridLines(-BX, CZ1, 0, BZ, Y_LAT + DEC * 0.5, 2.1, LINE, 0.05);

    /* ---------------- the organic plateau ---------------- */
    terrace(0, CZ1, BX, BZ, Y_ORG, RISER2, EDGE);
    hexField(0, CZ1, BX, BZ, Y_ORG + DEC, 2.8, HEXB, EDGE2, 0.42);

    /* ---------------- ramps ----------------

       EVERY ramp here spans the FULL WIDTH of the edge it climbs, and that is
       the single most important thing about this layout.

       A ramp narrower than the wall it climbs has SIDES, and its sides are
       walls of their own, up to the full height of the terrace. Measured on
       the first draft, which used four-unit ramps cut into the court: a 9Å
       katamari fixed on a glucose eight nanometres away spent three minutes
       shuttling back and forth because a 1nm6Å ramp wall ran between it and
       the target, and the greedy route only looks three ball-widths ahead. A
       ramp is meant to open a boundary, not to fence off the flat it starts
       on.

       Spanning the whole edge also means every ramp OVERLAPS the terrace it
       starts on, which is fine: `groundAt` takes the highest platform at a
       point, so a rising slope wins wherever it is above the flat. Only a
       ramp that DESCENDS into a plate would need cutting clear, and none do.

       Arguments mirror `World.ramp`: `top` is the height at the low end of
       the axis, `topTo` at the high end. */
    const ramp = (x0, z0, x1, z1, top, topTo, axis) => {
      w.ramp(x0, z0, x1, z1, top, topTo, axis);
      const len = axis === 'x' ? x1 - x0 : z1 - z0;
      const wide = axis === 'x' ? z1 - z0 : x1 - x0;
      const rise = topTo - top;
      const tilt = Math.atan2(rise, len);
      const lowY = Math.min(top, topTo);
      // See RAMP_STEP: one slab per ramp is a floor drawn through the ball.
      const seg = Math.max(1, Math.ceil(Math.abs(rise) / RAMP_STEP));
      const slope = Math.hypot(len, rise) / seg;
      for (let i = 0; i < seg; i++) {
        const f = (i + 0.5) / seg;
        // Thick enough to reach down into the deck the ramp climbs out of, so
        // the ramp is a solid wedge rather than a plate hovering over a void.
        // The underside ends up well below the ground, where no test and no
        // player can see it.
        const deep = top + rise * f - lowY + 0.5;
        t.box(axis === 'x' ? slope : wide, deep, axis === 'x' ? wide : slope, RAMPC, {
          x: axis === 'x' ? x0 + len * f : (x0 + x1) / 2,
          y: top + rise * f - RAMP_SINK(deep, tilt) - RAMP_EPS,
          z: axis === 'z' ? z0 + len * f : (z0 + z1) / 2,
          // Rotating about +Z lifts the +X end; rotating about +X drops the
          // +Z end. Hence the sign flip between the two axes.
          rz: axis === 'x' ? tilt : 0,
          rx: axis === 'z' ? -tilt : 0,
        });
      }
    };

    // court -> shell I: the whole west and east edges of the court are slope
    ramp(-CX, CZ0, -CX + 4, CZ1, Y_S1, Y_BASE, 'x');
    ramp(CX - 4, CZ0, CX, CZ1, Y_BASE, Y_S1, 'x');
    // court -> shell II: the whole south edge
    ramp(-CX, CZ0, CX, CZ0 + 5.6, Y_S2, Y_BASE, 'z');
    // shell I -> shell II: the full width of both side terraces
    ramp(-BX, CZ0, -CX, CZ0 + 3.2, Y_S2, Y_S1, 'z');
    ramp(CX, CZ0, BX, CZ0 + 3.2, Y_S2, Y_S1, 'z');
    // shell I (west) -> the lattice plate, full width
    ramp(-BX, CZ1 - 6.2, -CX, CZ1, Y_S1, Y_LAT, 'z');
    // shell I (east) -> the organic plateau, full width
    ramp(CX, CZ1 - 9.2, BX, CZ1, Y_S1, Y_ORG, 'z');
    // lattice plate -> organic plateau, full depth
    ramp(-3.2, CZ1, 0, BZ, Y_LAT, Y_ORG, 'x');

    /* ---------------- containment ---------------- */
    w.bound(-BX - 2, BZ, BX + 2, BZ + 2, 7, WALLC);
    w.bound(-BX - 2, -BZ - 2, BX + 2, -BZ, 7, WALLC);
    w.bound(-BX - 2, -BZ, -BX, BZ, 7, WALLC);
    w.bound(BX, -BZ, BX + 2, BZ, 7, WALLC);
    // field emitters up the walls
    for (let i = -12; i <= 12; i++) {
      const x = i * 2.1;
      if (Math.abs(x) > BX) continue;
      t.box(0.16, 6.4, 0.16, WALLLIT, { x, y: 3.2, z: BZ + 0.9 });
      t.box(0.16, 6.4, 0.16, WALLLIT, { x, y: 3.2, z: -BZ - 0.9 });
    }
    for (let i = -10; i <= 10; i++) {
      const z = i * 2.1;
      if (Math.abs(z) > BZ) continue;
      t.box(0.16, 6.4, 0.16, WALLLIT, { x: -BX - 0.9, y: 3.2, z });
      t.box(0.16, 6.4, 0.16, WALLLIT, { x: BX + 0.9, y: 3.2, z });
    }

    /* Keep-out circles for the big props. The first draft of this stage put a
       line of nanotubes and chlorophylls along the shell II boundary and a
       1nm8Å katamari spent the last two minutes of every run bouncing off it,
       unable to reach the peptides on the other side. A long prop's collision
       radius is half its LENGTH, so a handful of them make a fence. Every big
       scatter below also keeps a couple of units clear of the terrace edges,
       for the same reason. */
    const avoid = [];
    const claim = (x, z, rad) => avoid.push({ x, z, r: rad });

    /* ---------------- the double helix ----------------

       Scenery. It is 9nm of landmark on the highest ground in the stage and
       it is not going in anybody's katamari; the plinth is walkable once you
       are big enough and the core column never is. */
    const HX = 16.5, HZ = 15.5, HR = 1.55, HH = 9.2, HT = 2.4;
    // Square plinth, because `w.wall` can only claim a rectangle and a round
    // visual over a square platform means walking on air at the corners.
    t.box(5.2, 0.42, 5.2, RISER, { x: HX, y: Y_ORG + 0.21, z: HZ });
    t.torus(2.3, 0.09, EDGE2, { x: HX, y: Y_ORG + 0.43, z: HZ, rx: Math.PI / 2 }, 3, 16);
    w.wall(HX - 2.6, HZ - 2.6, HX + 2.6, HZ + 2.6, 0.42, null, Y_ORG);
    /* The helix itself is solid over its WHOLE footprint, not just its axis.
       The rungs reach 1nm5Å out from the middle, so an axis-only column left
       every rung as a horizontal bar at head height for anything standing on
       the plinth underneath it — the same defect as a decal parked at ball
       height, and `test-decals` caught it. Solid to the rung tips, and solid
       enough that `groundAt` reports a wall volume, which also stops the
       scatter passes from parking a prop nine nanometres up in the air. */
    w.wall(HX - 1.75, HZ - 1.75, HX + 1.75, HZ + 1.75, HH, null, Y_ORG + 0.42, 1e6);
    const HY = Y_ORG + 0.42;
    for (let s = 0; s < 2; s++) {
      for (let i = 0; i <= 46; i++) {
        const f = i / 46;
        const a = f * HT * TAU + s * Math.PI;
        t.sphere(0.2, s ? 0xff4bc6 : 0x54c8ff,
          { x: HX + Math.cos(a) * HR, y: HY + 0.2 + f * HH, z: HZ + Math.sin(a) * HR }, 6, 4);
      }
    }
    for (let i = 0; i <= 46; i += 3) {
      const f = i / 46;
      const a = f * HT * TAU;
      const y = HY + 0.2 + f * HH;
      const col = i % 6 === 0 ? 0xffe15c : 0x74ea86;
      t.box(HR * 2, 0.11, 0.11, col, { x: HX, y, z: HZ, ry: -a });
      t.sphere(0.11, 0x59e8d0, { x: HX, y, z: HZ }, 5, 4);
    }
    t.cyl(0.06, 0.06, HH + 0.5, EDGE2, { x: HX, y: HY + 0.2 + HH / 2, z: HZ }, 6);
    claim(HX, HZ, 4.4);

    /* ---------------- big props go down FIRST ----------------

       Everything wide enough to hide something is placed before anything
       small, and every one of them lands in `avoid` as it goes. Two things
       fall out of that, and both were bugs before it existed:

         1. Big props never overlap EACH OTHER, so a cluster of them is a
            copse you can roll between rather than a wall.
         2. No small prop is ever dropped INSIDE a big one's collision
            volume. That was the killer: `World.scatter` places at random
            with no regard for what is already there, so an amino acid could
            land on top of a methane and the methane then could not be
            reached from any direction. A greedy router picks the best
            value-per-second prop it can see, and if that prop is
            unreachable it chases it until the clock runs out — measured at
            a 1nm1Å median on a stage whose goal is 3nm2Å. Sowing big first
            took the same layout to 2nm8Å.

       Counts are per ARCHETYPE rather than per size band, because the mass
       at the top of the ladder is what decides where a run finishes and a
       weighted draw over a band does not let you aim it. One nanotube is
       worth 27 base pairs. */
    const ARCH = {};
    for (const p of w.pool('atom', 0, 1e9)) ARCH[p.id] = p;

    const sow = (id, n, x0, z0, x1, z1, sLo = 1, sHi = 1, pad = 0.25) => {
      const arch = ARCH[id];
      for (let i = 0; i < n; i++) {
        const sc = sLo + r() * (sHi - sLo);
        const rad = arch.radius * sc;
        let ok = false, x = 0, z = 0;
        for (let tries = 0; tries < 40 && !ok; tries++) {
          x = x0 + r() * (x1 - x0);
          z = z0 + r() * (z1 - z0);
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

    /* ---------------- hand-placed landmarks on the outer band ----------------
       Spaced by hand along the far edge. The proteins and the domains are the
       only things in the stage a katamari at the goal size still cannot eat,
       and a row of them anywhere near a shell boundary is a fence. */
    const outer = [
      ['mol_domain', -18.5, -18.5], ['mol_domain', 9, -19], ['mol_domain', 22.5, -17.5],
      ['mol_protein', -9, -20], ['mol_protein', 1, -15.5], ['mol_protein', 15, -20.5],
      ['mol_protein', -24, -14.5],
      ['mol_helix', -14, -15], ['mol_helix', -4, -20], ['mol_helix', 5.5, -14.5],
      ['mol_helix', 19, -14.5], ['mol_helix', 24.5, -20.5],
      ['mol_chlorophyll', -21.5, -20.5], ['mol_chlorophyll', -6, -17.5], ['mol_chlorophyll', 12, -17.5],
    ];
    for (const [id, x, z] of outer) {
      w.placeId(id, x, z, r() * TAU);
      claim(x, z, ARCH[id].radius + 0.3);
    }

    /* ---------------- the ionic lattice ----------------
       A real grid, sitting square to the world, because that is the whole
       point of a crystal — everything else in the stage is scattered. */
    const LX0 = -23.4, LZ0 = 8.4, LSTEP = 2.15, LNX = 10, LNZ = 6;
    for (let i = 0; i < LNX; i++) {
      for (let k = 0; k < LNZ; k++) {
        const x = LX0 + i * LSTEP, z = LZ0 + k * LSTEP;
        w.placeId('mol_saltcell', x, z, 0, 1 + ((i + k) % 2) * 0.3);
        claim(x, z, 0.45);
      }
    }
    /* Bonds between the cells, PAINTED ON THE PLATE rather than strung
       between the ions at their own mid-height.
       The first draft ran them at Y_LAT + 0.24, level with the middle of a
       cell, which looks right in a diagram and is the culture stage's mucus
       film all over again: 0.24 is 94% of the radius at the stage's midpoint
       size, so nineteen nanometres of bright horizontal bar went straight
       through the katamari. Anything horizontal between a decal's height and
       a whole ball's height eventually saws the ball in half, because the
       ball passes through every size on the way to the goal. */
    const strutY = Y_LAT + DEC - 0.005;
    for (let i = 0; i < LNX; i++) {
      t.box(0.05, 0.01, LSTEP * (LNZ - 1), EDGE2,
        { x: LX0 + i * LSTEP, y: strutY, z: LZ0 + LSTEP * (LNZ - 1) / 2 });
    }
    for (let k = 0; k < LNZ; k++) {
      t.box(LSTEP * (LNX - 1), 0.01, 0.05, EDGE2,
        { x: LX0 + LSTEP * (LNX - 1) / 2, y: strutY, z: LZ0 + k * LSTEP });
    }

    /* ---------------- regions ---------------- */
    const R_S2 = [-BX + 1.4, -BZ + 1.4, BX - 1.4, CZ0 - 1.4];        // outer band, south
    const R_S1W = [-BX + 1, CZ0 + 1, -CX - 1, CZ1 - 1];              // shell I west
    const R_S1E = [CX + 1, CZ0 + 1, BX - 1, CZ1 - 1];                // shell I east
    const R_LAT = [-BX + 1.4, CZ1 + 1.4, -1.4, BZ - 1.4];            // lattice plate
    const R_ORG = [1.4, CZ1 + 1.4, BX - 1.4, BZ - 1.4];              // organic plateau
    const R_CT = [-CX + 1.6, CZ0 + 1.6, CX - 1.6, CZ1 - 1.6];        // the court

    /* ---------------- the top of the ladder ----------------
       Placed largest first so the biggest things get the room they need. */
    sow('mol_protein', 1, ...R_S2, 0.9, 1.0);
    sow('mol_protein', 1, ...R_ORG, 0.9, 1.0);
    sow('mol_helix', 1, ...R_S2, 0.9, 1.05);
    sow('mol_helix', 1, ...R_ORG, 0.9, 1.05);
    sow('mol_chlorophyll', 2, ...R_S2, 0.9, 1.05);
    sow('mol_chlorophyll', 2, ...R_ORG, 0.9, 1.05);
    sow('mol_nanotube', 3, ...R_S2, 0.88, 1.05);
    sow('mol_nanotube', 2, ...R_LAT, 0.88, 1.05);
    sow('mol_nanotube', 2, ...R_ORG, 0.88, 1.05);
    sow('mol_haem', 4, ...R_S2, 0.88, 1.05);
    sow('mol_haem', 3, ...R_LAT, 0.88, 1.05);
    sow('mol_haem', 3, ...R_ORG, 0.88, 1.05);
    sow('mol_graphene', 3, ...R_S2, 0.88, 1.05);
    sow('mol_graphene', 4, ...R_LAT, 0.88, 1.05);
    sow('mol_graphene', 2, ...R_ORG, 0.88, 1.05);
    sow('mol_graphene', 2, ...R_S1W, 0.88, 1.0);
    sow('mol_graphene', 2, ...R_S1E, 0.88, 1.0);
    // fullerenes: loose everywhere, and wedged into the lattice as dislocations
    sow('mol_c60', 5, LX0 + 1, LZ0 + 1, LX0 + LSTEP * (LNX - 1) - 1, LZ0 + LSTEP * (LNZ - 1) - 1, 1.0, 1.25);
    sow('mol_c60', 3, ...R_S2, 0.9, 1.1);
    sow('mol_c60', 2, ...R_LAT, 0.9, 1.1);
    sow('mol_c60', 3, ...R_S1W, 0.9, 1.1);
    sow('mol_c60', 3, ...R_S1E, 0.9, 1.1);

    /* ---------------- the middle of the ladder ---------------- */
    sow('mol_peptide', 6, ...R_S2, 0.85, 1.05);
    sow('mol_peptide', 5, ...R_S1W, 0.85, 1.05);
    sow('mol_peptide', 5, ...R_S1E, 0.85, 1.05);
    sow('mol_peptide', 5, ...R_LAT, 0.85, 1.05);
    sow('mol_peptide', 8, ...R_ORG, 0.85, 1.05);
    sow('mol_atp', 6, ...R_S2, 0.85, 1.05);
    sow('mol_atp', 5, ...R_S1W, 0.85, 1.05);
    sow('mol_atp', 5, ...R_S1E, 0.85, 1.05);
    sow('mol_atp', 5, ...R_LAT, 0.85, 1.05);
    sow('mol_atp', 6, ...R_ORG, 0.85, 1.05);
    sow('mol_basepair', 8, ...R_S2, 0.85, 1.05);
    sow('mol_basepair', 6, ...R_S1W, 0.85, 1.05);
    sow('mol_basepair', 6, ...R_S1E, 0.85, 1.05);
    sow('mol_basepair', 4, ...R_LAT, 0.85, 1.05);
    sow('mol_basepair', 8, ...R_ORG, 0.85, 1.05);
    sow('mol_basepair', 4, ...R_CT, 0.85, 1.0);
    sow('mol_nucleotide', 5, ...R_S1W, 0.85, 1.05);
    sow('mol_nucleotide', 5, ...R_S1E, 0.85, 1.05);
    sow('mol_nucleotide', 12, ...R_ORG, 0.85, 1.05);
    sow('mol_nucleotide', 6, ...R_CT, 0.85, 1.0);

    /* ---------------- lipid rafts ----------------
       Lipids sit shoulder to shoulder in the real thing, and a bilayer patch
       reads far better than seventy of them sprinkled evenly. */
    for (const [rx, rz] of [[6.5, 10.5], [21.5, 10], [11, 20]]) {
      sow('mol_lipid', 18, rx - 2.8, rz - 2.4, rx + 2.8, rz + 2.4, 0.85, 1.15, 0.1);
    }
    sow('mol_lipid', 6, ...R_S1W, 0.85, 1.1, 0.1);
    sow('mol_lipid', 6, ...R_S1E, 0.85, 1.1, 0.1);
    sow('mol_lipid', 8, ...R_CT, 0.85, 1.0, 0.1);

    /* ---------------- and then everything else, LARGEST FIRST ----------------

       Same rule as the big props, one tier down and for the same reason. The
       size bands are disjoint and they are laid in DESCENDING order, so a
       water molecule can never be dropped on top of a carbon atom and hide
       it. Running them the obvious way round — small first, big last — cost a
       measured run 220 of its 300 seconds: the router locked onto a carbon
       atom 1nm3Å from the spawn that a methane had landed on, and sat there.

       Only the four smallest archetypes go through `World.scatter`, which
       does no overlap test at all. At 30-55pm across they are smaller than
       the katamari is on its first frame and cannot hide anything. */
    const sowBand = (lo, hi, n, x0, z0, x1, z1, sLo = 0.82, sHi = 1.06, pad = 0.04) => {
      const pool = w.pool('atom', lo, hi);
      if (!pool.length) return;
      const totalW = pool.reduce((a, p) => a + p.weight, 0);
      for (let i = 0; i < n; i++) {
        let pick = r() * totalW, arch = pool[pool.length - 1];
        for (const p of pool) { pick -= p.weight; if (pick <= 0) { arch = p; break; } }
        const sc = sLo + r() * (sHi - sLo);
        const rad = arch.radius * sc;
        let ok = false, x = 0, z = 0;
        for (let tries = 0; tries < 12 && !ok; tries++) {
          x = x0 + r() * (x1 - x0);
          z = z0 + r() * (z1 - z0);
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

    /* Disjoint, so that "descending" means something:
         B5 benzene / salt / glucose / amino acid
         B4 carbon dioxide / ethanol
         B3 hydroxide / water / ammonia / methane
         B2 helium / lithium / carbon / oxygen
         B1 alpha / hydrogen ion / hydrogen                          */
    const B5 = [0.44, 0.79], B4 = [0.30, 0.44], B3 = [0.16, 0.30];
    const B2 = [0.086, 0.16], B1 = [0.05, 0.086];
    const band = (b, n, rect) => sowBand(b[0], b[1], n, ...rect);

    /* ---------------- the free-particle soup ----------------

       Nearly half the stage's prop count sits inside the court, and it has
       to: at 1Å across you cover 68pm of ground a second and the court is
       22nm wide, so if the opening is not thick you spend the first minute
       travelling instead of growing.

       Scale ranges are biased BELOW 1 throughout. An instance's scale
       multiplies its pickup size but NOT the volume it adds to the ball
       (`Katamari.attach` uses the archetype's), so scaling a prop up makes it
       harder to eat for no extra reward, and widens the shadow it casts.
       Down is free; up is a tax. */
    const CT = [-CX + 0.5, CZ0 + 0.5, CX - 0.5, CZ1 - 0.5];
    band(B5, 28, CT); band(B4, 38, CT); band(B3, 76, CT);
    band(B2, 106, CT); band(B1, 112, CT);

    /* ---------------- shell I ---------------- */
    for (const rect of [[-BX + 0.6, CZ0 + 0.6, -CX - 0.6, CZ1 - 0.6],
      [CX + 0.6, CZ0 + 0.6, BX - 0.6, CZ1 - 0.6]]) {
      band(B5, 26, rect); band(B4, 26, rect); band(B3, 40, rect);
      band(B2, 40, rect); band(B1, 24, rect);
    }

    /* ---------------- shell II, the outer band ---------------- */
    const OB = [-BX + 0.8, -BZ + 0.8, BX - 0.8, CZ0 - 0.8];
    band(B5, 30, OB); band(B4, 28, OB); band(B3, 36, OB); band(B2, 26, OB);

    /* ---------------- the lattice plate ---------------- */
    const PL = [-BX + 0.8, CZ1 + 0.8, -0.8, BZ - 0.8];
    band(B5, 26, PL); band(B4, 24, PL); band(B3, 30, PL); band(B2, 22, PL);

    /* ---------------- the organic plateau ---------------- */
    const PT = [0.8, CZ1 + 0.8, BX - 0.8, BZ - 0.8];
    band(B5, 28, PT); band(B4, 26, PT); band(B3, 32, PT); band(B2, 22, PT);

    /* ---------------- loose particles, the only pass that may overlap ---------------- */
    w.scatter({ tag: 'atom', lo: 0.028, hi: 0.05, count: 156, x0: CT[0], z0: CT[1], x1: CT[2], z1: CT[3], scale: [0.82, 1.06], avoid });
    w.scatter({ tag: 'atom', lo: 0.028, hi: 0.05, count: 104, x0: -0.5, z0: -10, x1: 8.5, z1: -1.5, scale: [0.82, 1.06], avoid });
    for (const rect of [[-BX + 0.6, CZ0 + 0.6, -CX - 0.6, CZ1 - 0.6],
      [CX + 0.6, CZ0 + 0.6, BX - 0.6, CZ1 - 0.6], OB, PL, PT]) {
      w.scatter({ tag: 'atom', lo: 0.028, hi: 0.05, count: 30, x0: rect[0], z0: rect[1], x1: rect[2], z1: rect[3], scale: [0.82, 1.06], avoid });
    }
    // a last handful right under the spawn, so the first two seconds pay off
    sowBand(0.05, 0.086, 56, -0.5, -10, 8.5, -1.5);
    sowBand(0.086, 0.16, 38, -0.5, -10, 8.5, -1.5);
  },
};
