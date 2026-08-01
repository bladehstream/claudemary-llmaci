/* ============================================================
   Stage 11 — The Universe.  50Mpc -> 1,600Mpc, eleven minutes.

   The last stage. 25,600 megaparsecs across, which is about the
   width of the observable universe, and after it the lights go
   out, so the shape of the place is the argument: almost all of it
   is nothing, and everything that is anything is strung along a
   web that gets brighter and heavier the deeper in you go.

   ONE WORLD UNIT IS ONE MEGAPARSEC. Display convention only
   (`unit: 'cosmic'`); everything below is authored as plain
   numbers in the band the physics was tuned in, exactly as the
   house is authored in metres. See the note above TIERS in
   util/math.js for why authoring in true metres breaks.

   THE SHAPE. Five BANDS stepping up from the outer void in the
   north to the far wall in the south, each split into three
   COLUMNS whose leading edges are staggered, so the terraces read
   as structure rather than as a staircase. You start in the cold
   at the foot of the first slope, among dwarf galaxies, and finish
   taking supercluster complexes off the wall.

     band 0   the Outer Void        y   0   dwarfs, ripples, voids
     band 1   the Cold Strand       y  52   galaxies, haloes, filaments
     band 2   the Bright Filament   y 116   filaments, clusters, walls
     band 3   the Web               y 200   clusters, cores, superclusters
     band 4   the Far Wall          y 300   attractors, complexes

   Every band boundary is a RAMP the full width of the column it
   climbs, drawn as a run of short steps (see `slope`) rather than
   one long tilted plate. Two impassable landmarks stand on top of
   all this — the Wall of Galaxies, which runs north-south across
   the grain of the terraces and has to be gated through, and the
   Great Attractor, a mound on the far wall with the heaviest
   things in the universe piled around it — plus two lensing arches
   you roll underneath.

   WHY THE BIG THINGS ARE HAND-SOWN. `World.scatter` does no
   overlap test whatsoever, so a 3,100Mpc-wide complex dropped on
   top of a galaxy group buries it: the group stays collectable,
   the greedy bot chases it forever from outside something it
   cannot climb, and the clock runs out without the stall detector
   ever firing. So everything from a CMB ripple upward goes in
   through `sow`, biggest first, each one refusing a position that
   overlaps something already placed and the solid ones claiming a
   circle that every later `scatter` keeps out of.
   ============================================================ */

import { U_ } from '../props/universe.js';

/**
 * Deck heights, the outer void up to the far wall.
 *
 * FIVE BANDS, not six, and the difference is the whole stage. Six left every
 * usable strip about 2,000 deep, and a strip that shallow is a corridor: two
 * compact groups landing 640 apart across it leave a 60-unit gap, the katamari
 * wedges in the pocket between them, and the run ends at 272Mpc with six
 * minutes left on the clock. Measured obstacle coverage went from 74% of the
 * map to 43% — which is where the world stage sits — on this change plus the
 * prop-count cut below.
 *
 * Each height is also a gate: a deck is a wall until the ball can climb it
 * (about `top / 1.15` of radius), so 52 / 116 / 200 / 300 open at diameters of
 * roughly 90, 200, 350 and 520 — four rungs of the ladder apart.
 */
const H = [0, 52, 116, 200, 300];

/** The floor of each band, and the ramp that climbs onto it. Near-black, all of it. */
const FLOOR = [0x050409, 0x08060f, 0x0a0815, 0x0d0a1c, 0x100d23];
const RAMPC = [0x050409, 0x0b0918, 0x0e0b1e, 0x110e25, 0x15112c];

/** Columns, west to east. */
const COL = [[-12800, -4400], [-4400, 4400], [4400, 12800]];

/**
 * The leading (north) edge of each band, per column. Staggered by 200-600 so
 * the terrace fronts are ragged; the mismatch at a column boundary is a
 * fraction of one band's height, and there is always a ramp within a few
 * thousand units of it, so nothing is ever fenced in.
 *
 * `EDGE[1][2] = -5600` is load-bearing: the spawn sits at z = -6800, and the
 * band-1 ramp in that column runs -6800 to -5600, so the ball starts on flat
 * void at the very foot of the first slope with the whole outer void behind it.
 */
const EDGE = [
  [-12800, -12800, -12800],
  [-6800, -6200, -5600],
  [-1800, -1200, -600],
  [3400, 4000, 4400],
  [8400, 8800, 9000],
];

/** How much ground each ramp takes out of the band below it. */
const RUN = [0, 1200, 1200, 1200, 1200];

export const universeStage = {
  id: 'universe',
  name: 'The Universe',
  subtitle: 'There is nothing after this. That is rather the point.',
  brief: 'Fifty megaparsecs across, in the cold part, where the web is only a rumour. ' +
    'Eat the dwarf galaxies and the ripples in the oldest light, then climb the slopes ' +
    'south — the strand, the bright filament, the web, the cluster core — and finish on ' +
    'the far wall, where the superclusters are. Nothing out here is coming back.',
  /**
   * DISPLAY UNITS ONLY — see the note above TIERS in util/math.js. One world
   * unit means one cosmic-tier step here; the physics never learns that.
   */
  unit: 'cosmic',
  seed: 13787000,
  startSize: 50,
  goal: 1900,
  /* 10:30, cut from 13:30, with the goal raised from 1600 to 1900.
     Report: "i got to the end of the universe with about 4 minutes to spare".

     Two things made it loose. The clock was the game's longest because this is
     the finale; and the three u_complex props were unreachable (see the note on
     SP.complex in props/universe.js), so a player who had eaten everything else
     had nothing left to do but watch the timer run out.

     Fixing the second one also made the stage FASTER, because those three are
     enormous and now feed the growth curve instead of sitting there: the sweeper
     bot reaches the goal at 6:58, EARLIER than it did against the old, lower
     goal. That is why the clock had to come down three minutes and not one.

     Measured after the cut: goal at 6:58 of 10:30 — 66% of the clock, against
     the galaxy's 71% and a ladder median of 49% — and the goal is 63% of what
     a median run finishes at, inside the 60-75% band. 79 of 3360 props are
     still standing at the whistle, which is the right amount left to chase;
     at 12:00 there were none. Joint longest stage in the game with the galaxy,
     which is the shape the last two should have. */
  time: 630,
  speed: 330,
  density: 1,
  spread: 1,
  cell: 220,
  chunk: 3300,
  spawn: { x: 7400, z: -6800 },
  spawnClear: 340,
  bounds: { minX: -12800, maxX: 12800, minZ: -12800, maxZ: 12800 },
  /* Fog at about 1.7 map-widths of a 50Mpc ball, and near-black, so the outer
     reaches genuinely end in nothing rather than in a visible edge. */
  sky: { top: 0x010104, bottom: 0x0d0820, fog: 0x06050e, fogNear: 4600, fogFar: 21000 },
  sun: { x: 0.45, y: 1, z: 0.45, intensity: 1.0 },
  camera: { pitch: 0.36, distance: 6.8 },

  build(w, r) {
    const t = w.terrain;
    const B = 12800;

    /* The floor of last resort. Every band lays its own platform on top of
       this; without it `groundAt` can come back empty in the corner of a
       staggered edge and a prop placed there vanishes. */
    w.plat(-B, -B, B, B, 0);

    /* ---------------- ground detail ----------------

       ONE RULE GOVERNS ALL OF IT: a decal sits between +2 and +7 of the
       surface it is painted on. The starting ball is 50 across, so its radius
       is 25, and a flat face anywhere near that height saws the katamari in
       half — `npm run decals` fails the stage for it and the player reports it
       as clipping. Nothing here goes above a quarter of the starting radius.

       And every quad takes its own height out of `decoY`, because two big flat
       faces at the SAME height z-fight across their whole overlap. Forty
       levels, 0.11 apart, cycled — neighbouring quads never share a plane and
       the whole stack still fits under the limit above. */
    let deco = 0;
    const decoY = () => 2.0 + (deco++ % 40) * 0.11;      // 2.00 .. 6.29

    /** A strand of the cosmic web, painted flat on a deck as a run of quads. */
    const webStrand = (top, x0, z0, x1, z1, wide, col, n) => {
      const dx = x1 - x0, dz = z1 - z0;
      const L = Math.hypot(dx, dz);
      if (L < 1) return;
      const a = -Math.atan2(dz, dx);
      for (let i = 0; i < n; i++) {
        const f = (i + 0.5) / n;
        t.quad((L / n) * 1.4, wide * (0.4 + 0.9 * Math.sin(f * Math.PI)), col,
          { x: x0 + dx * f, y: top + decoY(), z: z0 + dz * f, ry: a });
      }
    };

    /** A patch of nothing at all — the floor of a void, and its rim. */
    const paintVoid = (top, cx, cz, rad) => {
      t.cylOn(rad, 0.8, U_.hollowRim, { x: cx, y: top + decoY(), z: cz }, 12);
      t.cylOn(rad * 0.68, 0.8, U_.hollow, { x: cx, y: top + decoY(), z: cz }, 11);
      t.cylOn(rad * 0.32, 0.8, 0x07060d, { x: cx, y: top + decoY(), z: cz }, 10);
    };

    /** A patch of something — the light a cluster throws down onto the web. */
    const paintNode = (top, cx, cz, rad, col, inner) => {
      t.cylOn(rad, 0.8, col, { x: cx, y: top + decoY(), z: cz }, 11);
      t.cylOn(rad * 0.46, 0.8, inner, { x: cx, y: top + decoY(), z: cz }, 10);
    };

    /* ---------------- ramps ----------------

       DECLARE A RAMP AND DRAW IT, AS A RUN OF SHORT FLAT STEPS.

       One long tilted plate is the trap, and it fails twice over. A box carries
       two triangles per face, so a 1,100-unit plate is one triangle whose
       footprint covers the entire ramp while its corner-average height sits
       halfway up the slope: `test-decals` — and the eye — reads that as a floor
       at chest height across the whole lower half of every ramp, and again,
       upside down, for the plate's buried underside. The microbe stage lost 421
       of its 728 decal failures to exactly nine of those plates.

       Short steps instead. Each is axis-aligned with its top face exactly on
       the collision plane at its own centre, so there is no sink term left to
       get wrong, and each reaches from well below whatever it stands on up to
       that surface, so the wedge is solid and its underside stays buried. The
       only error left is half a step of height, held to RISE/2 = 4 — a sixth of
       the starting radius, and far finer than the eye at this scale.

       Every ramp spans the FULL WIDTH of its column, and the neighbouring
       columns' ramps sit at the same height a few hundred units north or south,
       so the slopes are continuous right across the map. A narrow ramp has
       sides and those sides are walls. */
    const RISE = 8;
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
        const thick = p + 90;                  // ...down through the deck below
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

    /* ---------------- the bands ----------------

       Each band-column is a walkable rectangle plus a solid block drawn under
       it, so its cliff faces come for free and there is no separate skirt to
       drift out of plane. The block starts at -90 rather than 0 so its
       underside never lands in the base plane. */
    /** Per band: the part of it that is NOT under the next band's ramp. */
    const FLAT = [[], [], [], [], []];

    for (let k = 0; k < 5; k++) {
      for (let c = 0; c < 3; c++) {
        const x0 = COL[c][0], x1 = COL[c][1];
        const z0 = EDGE[k][c];
        const z1 = k === 4 ? B : EDGE[k + 1][c];
        w.plat(x0, z0, x1, z1, H[k]);
        const h = H[k] + 90;
        t.box(x1 - x0, h, z1 - z0, FLOOR[k],
          { x: (x0 + x1) / 2, y: H[k] - h / 2, z: (z0 + z1) / 2 });
        if (k > 0) slope(x0, z0 - RUN[k], x1, z0, H[k - 1], H[k], 'z', RAMPC[k]);
        FLAT[k].push({ x0, x1, z0, z1: k === 4 ? B : z1 - RUN[k + 1] });
      }
    }

    /* ---------------- the boundary ----------------
       Invisible, like the world stage's: a visible wall at the edge of the
       universe would be a joke in poor taste. */
    const WH = 1440;
    w.bound(-B - 220, B, B + 220, B + 220, WH);
    w.bound(-B - 220, -B - 220, B + 220, -B, WH);
    w.bound(-B - 220, -B, -B, B, WH);
    w.bound(B, -B, B + 220, B, WH);

    /* ---------------- painting the web ----------------

       Per band: strands crossing the deck, patches of void, and the glow the
       clusters throw. Strand colours climb from ink at the top of the map to
       old gold at the bottom, which is the whole argument of the stage in six
       steps. */
    const WEB = [
      { n: 10, wide: 280, cols: [U_.ink, U_.spaceLit], voids: 5, nodes: 2, node: U_.violetDim, in: U_.hollow },
      { n: 12, wide: 320, cols: [U_.spaceLit, U_.slate], voids: 4, nodes: 4, node: U_.violet, in: U_.hollowRim },
      { n: 15, wide: 360, cols: [U_.slate, U_.blueDim], voids: 3, nodes: 6, node: U_.blueDim, in: U_.cyan },
      { n: 14, wide: 340, cols: [U_.slate, U_.haloLit], voids: 3, nodes: 6, node: U_.haloLit, in: U_.goldDim },
      { n: 13, wide: 360, cols: [U_.haloLit, U_.goldDim], voids: 2, nodes: 7, node: U_.red, in: U_.ember },
    ];
    for (let k = 0; k < 5; k++) {
      const spec = WEB[k];
      for (let c = 0; c < 3; c++) {
        const rc = FLAT[k][c];
        const px0 = rc.x0 + 140, px1 = rc.x1 - 140;
        const pz0 = rc.z0 + 140, pz1 = rc.z1 - 140;
        if (px1 - px0 < 400 || pz1 - pz0 < 200) continue;
        for (let i = 0; i < spec.n; i++) {
          // strands run mostly along the band, wandering across it
          const ax = px0 + r() * (px1 - px0), az = pz0 + r() * (pz1 - pz0);
          const len = (px1 - px0) * (0.24 + r() * 0.4);
          const dir = r() < 0.5 ? 1 : -1;
          const bx = Math.max(px0, Math.min(px1, ax + dir * len));
          const bz = Math.max(pz0, Math.min(pz1, az + (r() - 0.5) * (pz1 - pz0) * 0.9));
          webStrand(H[k], ax, az, bx, bz, spec.wide * (0.5 + r()), spec.cols[i % 2], 6);
        }
        for (let i = 0; i < spec.voids; i++) {
          const rad = Math.min((pz1 - pz0) * 0.42, 900 + r() * 900);
          if (rad < 200) break;
          paintVoid(H[k], px0 + rad + r() * Math.max(1, px1 - px0 - rad * 2),
            pz0 + rad + r() * Math.max(1, pz1 - pz0 - rad * 2), rad);
        }
        for (let i = 0; i < spec.nodes; i++) {
          const rad = Math.min((pz1 - pz0) * 0.3, 380 + r() * 420);
          if (rad < 120) break;
          paintNode(H[k], px0 + rad + r() * Math.max(1, px1 - px0 - rad * 2),
            pz0 + rad + r() * Math.max(1, pz1 - pz0 - rad * 2), rad, spec.node, spec.in);
        }
      }
    }

    /* ==============================================================
       LANDMARKS

       TWO keep-out lists, because the two things being kept out are different
       sizes. `BLOCK` is generous and only the hand-sown giants respect it — a
       supercluster standing on the Wall of Galaxies would be absurd, and one
       parked in the spawn bowl would end the run in the first ten seconds.
       `SOLID` hugs the impassable footprints and everything respects it: a
       dwarf galaxy is welcome right up against the wall, it just may not stand
       inside it.

       The Great Attractor's circle has to be generous in BOTH, and for a
       reason that is not aesthetic: `test-reach` clamps a prop's probe centre
       to the map bounds inset by a radius, and for a prop in the southern
       strip that clamp lands the probe inside the mound — where `groundAt`
       reads 1e6 and the prop is reported, correctly, as unreachable. The only
       fix is to have no props there.
       ============================================================== */
    const BLOCK = [{ x: 7400, z: -6800, r: 2600 }];   // the spawn bowl: no giants
    const SOLID = [];                                  // the impassable volumes

    /* ---- THE WALL OF GALAXIES ----

       Runs north-south, ACROSS the grain of the terraces, which is the only
       orientation that works: laid east-west it would have to thread between
       four ramps and it would fence a band off completely. Three segments with
       two gates, and both ends open, so it is a landmark to find your way
       through rather than a maze. Drawn as one plinth from below the floor to
       1,120 up, so it stands proud of every deck it crosses; the ground inside
       it is unreachable, which is also why `test-decals` never samples its lid. */
    const WGX = 1450, WGW = 280;
    /* Every gap in this list is a band-1/2/3 ramp in the middle column — a
       segment landing on a slope would stand on it and block the climb. */
    const WGSEG = [[-5800, -3000], [-800, 2400], [4400, 7200]];
    for (const [z0, z1] of WGSEG) {
      w.bound(WGX - WGW, z0, WGX + WGW, z1, 1);
      BLOCK.push({ x: WGX, z: (z0 + z1) / 2, r: WGW + (z1 - z0) / 2 + 360 });
      // small props keep out of the plinth itself and nothing more, so the
      // ground either side of the wall is populated right up to the stone
      for (let z = z0 + 300; z < z1; z += 600) SOLID.push({ x: WGX, z, r: 460 });
      t.box(WGW * 2, 1210, z1 - z0, 0x100d1e, { x: WGX, y: 1210 / 2 - 90, z: (z0 + z1) / 2 });
      t.box(WGW * 1.5, 60, z1 - z0, U_.slateLit, { x: WGX, y: 1090, z: (z0 + z1) / 2 });
      const n = Math.max(3, Math.round((z1 - z0) / 620));
      for (let i = 0; i < n; i++) {
        const z = z0 + ((i + 0.5) / n) * (z1 - z0);
        const rr = 120 + r() * 110;
        t.ellip(rr, rr * 0.72, rr * 0.86,
          i % 3 === 0 ? U_.goldDim : (i % 3 === 1 ? U_.blueDim : U_.redDim),
          { x: WGX + (r() - 0.5) * WGW, y: 1120 + rr * 0.6, z, ry: r() * 6.28 }, 8, 5);
        if (i % 2 === 0) {
          t.ellip(rr * 0.3, rr * 0.26, rr * 0.28, U_.goldPale,
            { x: WGX + (r() - 0.5) * WGW * 0.7, y: 1120 + rr * 0.6, z }, 6, 4);
        }
      }
    }

    /* ---- THE GREAT ATTRACTOR ----

       A mound on the far wall that nothing gets over, with the heaviest things
       in the universe piled round it. Kept well clear of the map's east and
       west edges on purpose: the only clamp line that can reach into it is the
       southern one, so a single keep-out circle covers every position from
       which a prop would be unreachable. */
    const GA = { x: -7600, z: 11200 };
    w.bound(GA.x - 1700, GA.z - 1450, GA.x + 1700, GA.z + 1450, 1);
    BLOCK.push({ x: GA.x, z: GA.z, r: 2380 });
    SOLID.push({ x: GA.x, z: GA.z, r: 2380 });
    {
      const gy = H[4];
      t.cone(1660, 820, 0x110d20, { x: GA.x, y: gy + 820 / 2 - 40, z: GA.z }, 12);
      t.cone(1140, 1240, 0x150f28, { x: GA.x, y: gy + 1240 / 2 - 40, z: GA.z }, 11);
      t.cone(660, 1580, U_.violetDim, { x: GA.x, y: gy + 1580 / 2 - 40, z: GA.z }, 10);
      t.ellip(400, 280, 380, U_.slateLit, { x: GA.x, y: gy + 1540, z: GA.z }, 9, 6);
      t.ellip(200, 150, 190, U_.goldDim, { x: GA.x, y: gy + 1600, z: GA.z }, 9, 6);
      t.sphere(76, U_.glow, { x: GA.x, y: gy + 1650, z: GA.z }, 8, 6);
      // the streams falling in, painted on the deck so they are not girders
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * 6.283;
        webStrand(gy, GA.x + Math.cos(a) * 1750, GA.z + Math.sin(a) * 1500,
          GA.x + Math.cos(a) * 3400, GA.z + Math.sin(a) * 2600, 320, i % 2 ? U_.redDim : U_.goldDim, 5);
      }
    }

    /* ---- THE LENSING ARCHES ----

       Light from behind a cluster bent into a ring, and the only thing in the
       stage you roll UNDERNEATH.

       Two constraints shaped them. The feet are `w.bound` blocks, so the ground
       inside them is unreachable and the decal sampler skips it. And the ring
       starts 430 above the deck: `test-decals` calls a flat face a floor
       through the ball when it sits between 0.45 and 1.55 radii up, which at
       the ladder's midpoint is 64 to 219 — so the whole arch has to be ABOVE
       that band, not merely tall. Spheres rather than boxes for the ring, too:
       a box tilted near vertical has flat end caps, and those landed inside it. */
    const arch = (cx, cz, base, span, height, along) => {
      const hs = span / 2, foot = span * 0.1;
      for (const s of [-1, 1]) {
        const fx = along === 'x' ? cx + s * hs : cx;
        const fz = along === 'x' ? cz : cz + s * hs;
        w.bound(fx - foot, fz - foot, fx + foot, fz + foot, 1);
        BLOCK.push({ x: fx, z: fz, r: foot + 460 });
        SOLID.push({ x: fx, z: fz, r: foot * 1.5 + 120 });
        t.box(foot * 2, 480, foot * 2, U_.slate, { x: fx, y: base + 240, z: fz });
        t.box(foot * 1.4, 70, foot * 1.4, U_.haloLit, { x: fx, y: base + 480, z: fz });
      }
      const N = 11, y0 = base + 430, rise = height - 430;
      for (let i = 0; i < N; i++) {
        const th = ((i + 0.5) / N) * Math.PI;
        const d = -Math.cos(th) * hs * 0.94;
        const y = y0 + Math.sin(th) * rise;
        const rr = span * (0.05 + Math.sin(th) * 0.022);
        const o = { y };
        if (along === 'x') { o.x = cx + d; o.z = cz; } else { o.x = cx; o.z = cz + d; }
        t.sphere(rr, i % 3 === 0 ? U_.bluePale : (i % 3 === 1 ? U_.blueDim : U_.ice), o, 8, 6);
        if (i % 2 === 0) {
          const o2 = { y: y - rr * 0.2 };
          if (along === 'x') { o2.x = cx + d; o2.z = cz + span * 0.06; }
          else { o2.x = cx + span * 0.06; o2.z = cz + d; }
          t.sphere(rr * 0.5, U_.cyan, o2, 6, 4);
        }
      }
      // the cluster doing the bending, sitting under the middle of the ring
      const gc = { x: cx, y: base + 120, z: cz };
      t.ellip(span * 0.07, 120, span * 0.065, U_.goldDim, gc, 9, 6);
      t.sphere(span * 0.022, U_.goldPale, { x: cx, y: base + 170, z: cz }, 7, 5);
    };
    arch(8200, -3600, H[1], 3000, 1020, 'x');
    arch(-8400, 5600, H[3], 3200, 1080, 'x');

    /* ---- THE FOUR CORNERS ARE OUT OF BOUNDS ----

       Not cosmetic. `moveKatamari` clamps the ball's CENTRE to the map inset by
       one radius, so at a corner it is clamped on BOTH axes and the nearest
       legal centre is R*sqrt(2) from the corner — half a radius further out
       than the ball can reach. The dead wedge GROWS with the ball, which makes
       reachability non-monotonic: a dwarf galaxy tucked into a corner is edible
       and reachable at 30Mpc and permanently unreachable at 2,900Mpc, the
       end-of-round finder points straight at it, and the stage cannot be
       cleared. That was reported on the world stage in exactly those words, and
       `node tools/test-reach.mjs` named five props here before this went in.

       1,500 of clearance is what passes with margin at this stage's ceiling:
       the worst remaining case sits 16% inside the limit, so the number
       survives a change to the stage's mass. */
    for (const cx of [-B, B]) {
      for (const cz of [-B, B]) {
        SOLID.push({ x: cx, z: cz, r: 1500 });
        BLOCK.push({ x: cx, z: cz, r: 1500 });
      }
    }

    /* ==============================================================
       SOWING

       Biggest first, with a running keep-out list. `space` stops two giants
       standing inside one another; `claim` is what the small-prop scatters
       avoid, and only the SOLID giants get one — a void, a halo, a ripple, a
       shock front, a filament and a wall are all mostly hole, their collision
       volumes are a ring or a chain of separate clumps, and a dwarf galaxy
       sitting inside one is both reachable and exactly right.
       ============================================================== */
    const avoid = SOLID.slice();
    const taken = [];

    const sow = (id, band, count, s0, s1, space, claim) => {
      const rects = FLAT[band];
      for (let i = 0, guard = 0; i < count && guard < count * 200; guard++) {
        const rc = rects[Math.floor(r() * rects.length) % rects.length];
        const mx = Math.max(1, rc.x1 - rc.x0 - 520);
        const mz = Math.max(1, rc.z1 - rc.z0 - 400);
        const x = rc.x0 + 260 + r() * mx;
        const z = rc.z0 + 200 + r() * mz;
        let ok = true;
        for (const a of taken) {
          const d = a.space + space;
          if ((x - a.x) ** 2 + (z - a.z) ** 2 < d * d) { ok = false; break; }
        }
        if (ok) {
          for (const a of BLOCK) {
            const d = a.r + space;
            if ((x - a.x) ** 2 + (z - a.z) ** 2 < d * d) { ok = false; break; }
          }
        }
        if (!ok) continue;
        w.placeId(id, x, z, null, s0 + r() * (s1 - s0));
        taken.push({ x, z, space });
        if (claim) avoid.push({ x, z, r: claim });
        i++;
      }
    };

    /* THE POPULATION, ARCHETYPE BY BAND.
       Counts per band, north (the outer void) to south (the far wall). Every
       one of these was cut roughly in half from the first draft: at the
       original density `test-reach` and `balance` both passed while 74% of the
       map was inside something the ball could not swallow, and the run ended
       wedged in a pocket at a sixth of the goal. The world stage sits at 43%
       and clears; this sits at the same number now.

       Scales stay at or below 1 for the top rung. Placement scale multiplies
       `pickup` but adds nothing to the stage's MASS, so scaling a complex up
       raises what the game asks of you to swallow it while raising nothing that
       would let you — which is exactly how a stage ends up with something too
       big to ever collect. */
    /* THE POPULATION, ARCHETYPE BY BAND, and the two numbers that matter most
       in the file.

       `space` is how far this thing must stand from anything else already sown.
       It is `own radius + 0.42 x (the diameter at which it becomes edible)`, and
       that formula is the answer to the way the first two drafts failed: three
       obstacles landing in a triangle with 39, 148 and 472 units between their
       flanks is a PEN, and a katamari that rolled in at 400Mpc and grew to
       620Mpc could not get out again. It sat there for 270 seconds. Spacing
       every big thing by most of the size at which the ball outgrows it means a
       gap the ball can still thread is always the same gap it will shortly not
       need.

       `claim` is what the small-prop scatters keep out of — the prop's own
       radius, for the solid ones only. A galaxy scattered inside a cluster's
       envelope can never be reached and the greedy bot will chase it until the
       clock runs out. The open ones — the shock fronts, the walls, the
       filaments, the voids and the haloes — claim nothing, deliberately: a
       dwarf galaxy sitting in the mouth of a void is both reachable and exactly
       right, and it is also what feeds a ball that has wandered in there.

       Counts per band, north (the outer void) to south (the far wall). Halved
       twice from the first draft: at the original density 74% of the map was
       inside something the ball could not swallow, and every run ended wedged.
       The world stage measures 43%; this measures the same now, and the count
       of props above 460Mpc came down from 104 to 50. */
    const SOW = [
      /* id                b0  b1  b2  b3  b4      scale        space claim */
      ['u_complex',       [0,  0,  0,  0,  3], 0.97, 1.0,  2400, 1600],
      ['u_attractor',     [0,  0,  0,  1,  1], 0.92, 1.18, 1750, 1150],
      ['u_supercluster',  [0,  0,  1,  2,  1], 0.85, 1.1,  1600, 1080],
      ['u_core',          [0,  1,  3,  4,  1], 0.84, 1.14, 1100, 720],
      ['u_filament',      [0,  2,  2,  2,  0], 0.8, 1.2,   1150, 0],
      ['u_wall',          [0,  2,  2,  1,  1], 0.82, 1.18, 1120, 0],
      ['u_protocluster',  [0,  1,  2,  1,  1], 0.82, 1.2,  1050, 0],
      ['u_void',          [1,  1,  1,  1,  0], 0.8, 1.3,   1045, 0],
      ['u_cluster',       [0,  4,  4,  4,  3], 0.8, 1.25,   820, 520],
      ['u_shock',         [0,  1,  2,  1,  1], 0.8, 1.3,    840, 0],
      ['u_halo',          [2,  2,  1,  0,  0], 0.78, 1.34,  650, 0],
      ['u_ripple',        [2,  2,  1,  0,  0], 0.76, 1.36,  645, 0],
      /* From here down these could have gone through `scatter`, and in the
         first draft they did — which is how two compact groups ended up 640
         apart across a strip with the ball penned between them. Anything wide
         enough to make a pocket gets a spacing rule instead. */
      ['u_group',         [2,  5,  6,  5,  4], 0.82, 1.32,  525, 320],
      ['u_lens',          [1,  3,  5,  4,  3], 0.82, 1.32,  380, 0],
      ['u_lobes',         [2,  4,  5,  4,  3], 0.82, 1.32,  340, 0],
      ['u_compact',       [2,  6,  7,  7,  4], 0.8, 1.36,   330, 200],
      ['u_merger',        [3,  7,  8,  8,  4], 0.8, 1.36,   264, 0],
      ['u_agn',           [3,  6,  7,  6,  4], 0.8, 1.36,   180, 0],
    ];
    for (const [id, counts, s0, s1, space, claim] of SOW) {
      for (let k = 4; k >= 0; k--) if (counts[k]) sow(id, k, counts[k], s0, s1, space, claim);
    }

    /* ==============================================================
       SCATTERING — everything from a Lyman-alpha blob down.

       `lo`/`hi` are REQUIRED and filter by pickup size: the pool is empty
       without them and the pass silently does nothing. Windows overlap, and
       every one is placed with a range of scales, which is what keeps the
       ladder unbroken between the archetypes' own rungs — the archetypes step
       up 13% at a time and the scale ranges fill in the rest.
       ============================================================== */
    const on = (band, lo, hi, count, scale) => {
      const rects = FLAT[band];
      let area = 0;
      for (const rc of rects) area += (rc.x1 - rc.x0) * (rc.z1 - rc.z0);
      for (const rc of rects) {
        const n = Math.round(count * ((rc.x1 - rc.x0) * (rc.z1 - rc.z0)) / area);
        if (n < 1) continue;
        w.scatter({
          tag: 'universe', lo, hi, count: n, scale, avoid,
          x0: rc.x0 + 130, z0: rc.z0 + 110, x1: rc.x1 - 130, z1: rc.z1 - 110,
        });
      }
    };

    /* window       band:  0    1    2    3    4      scale */
    const WIN = [
      [130, 200, [14,  26,  34,  30, 22], [0.8, 1.4]],    // pairs, Lyman-alpha blobs
      [90, 130, [30,  45,  55,  45, 35], [0.8, 1.42]],    // quasars, giant ellipticals
      [60, 90, [70,  85,  85,  65, 45], [0.78, 1.45]],    // lenticulars, ellipticals
      [36, 60, [180, 150, 130,  80, 40], [0.75, 1.5]],    // spirals, barred spirals
      [14, 36, [620, 340, 260, 150, 80], [0.72, 1.7]],    // dwarfs and irregulars
    ];
    for (const [lo, hi, counts, scale] of WIN) {
      for (let k = 4; k >= 0; k--) if (counts[k]) on(k, lo, hi, counts[k], scale);
    }

    /* ---------------- the cold start ----------------

       Where the whole run is decided. A 50Mpc katamari can swallow anything up
       to 44Mpc, which out here is a dwarf spheroidal, a dwarf galaxy or a small
       irregular and nothing else at all — so the bowl around the spawn is
       packed with exactly those, and with the next two rungs up so there is
       something to grow into within sight. Without this pass the opening two
       minutes are a very long walk across an empty universe. */
    const SX = 7400, SZ = -6800;
    const bowl = (lo, hi, count, scale, rad) => {
      w.scatter({
        tag: 'universe', lo, hi, count, scale, avoid,
        x0: Math.max(-B + 200, SX - rad), z0: Math.max(-B + 200, SZ - rad),
        x1: Math.min(B - 200, SX + rad), z1: Math.min(B - 200, SZ + rad),
      });
    };
    bowl(14, 36, 210, [0.72, 1.65], 3000);
    bowl(14, 36, 130, [0.75, 1.7], 5400);
    bowl(36, 60, 72, [0.75, 1.45], 4200);
    bowl(60, 90, 26, [0.8, 1.3], 5000);
    bowl(90, 130, 12, [0.8, 1.25], 5600);
  },
};
