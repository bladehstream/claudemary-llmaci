/* ============================================================
   Stage 9 — The Galaxy.  50ly -> 1,600ly, ten minutes.

   A quarter of the Milky Way, 25,600 light years across, seen
   nearly face-on. You start out in the thin edge of the disc
   where the stars are old and a long way apart, and finish
   holding a chunk of a spiral arm.

   ONE WORLD UNIT IS ONE LIGHT YEAR. That is a display convention
   only (`unit: 'light'`); the physics never learns it, and
   everything below is written as plain numbers in the band the
   engine was tuned in — see the note above TIERS in util/math.js
   for why authoring in true metres breaks instead of impressing
   anyone.

   THE SHAPE OF THE PLACE. Four heights, stepping up towards the
   core in the north-east:

     0    the outer disc — the whole map's floor, quiet and sparse
     90   the Arm — a broad diagonal terrace of dust and young stars
     210  the Nursery — a plateau of cold cloud behind the arm
     340  the Core Rise — the hot middle, with the glare in it

   The Arm is a staircase of square platforms, because a platform
   is an axis-aligned rectangle and a spiral is not; the actual
   spiral is painted on the floor underneath everything as ground
   detail, four arms of it winding out of the core. Its ends stop
   short of the map edges on purpose, so the arm is a feature you
   climb rather than a fence you are trapped behind — there is
   always a way round as well as six ways up.

   THE OUTER 1,500ly OF THE DISC IS A FLAT LAP with no terrace in
   it, and the four corners, the ramps and the bowl you start in
   are keep-outs for anything big. All four are reachability
   rules with a measurement behind them rather than composition —
   see LAP, `avoid`, `ways` and SQUEEZE in build().

   THREE THINGS ARE GENUINELY IMPASSABLE (`w.bound`, not `w.plat`,
   so they never become climbable): the Dust Wall out in the disc,
   which is broken into three blocks you drive between; the Core's
   Glare, a pillar of light in the middle of the core deck that
   you circle; and the legs of the Nebula Arch, whose span is
   drawn 700ly up in terrain and therefore has no collision at all
   — you roll under it.

   DECALS ARE TINY AND RAMPS ARE STAIRCASES. Both were paid for in
   somebody else's iterations. The starting radius is 25, so every
   flat thing painted on a floor here sits between 1 and 6 above
   it; a decal at chest height saws the katamari in half and fills
   the screen edge-on. And every ramp is a RUN OF SHORT STEPS
   (`slope` below, lifted from stages/microbe.js): one long tilted
   slab is a single triangle whose average height is halfway up
   the slope while its footprint covers the whole ramp, which
   reads as a floor at chest height across the lower half of every
   ramp. `npm run decals` measures both.
   ============================================================ */

import { G } from '../props/galaxy.js';

/** Everything that hovers, so a pass can say "not those" when it wants floor. */
const AIR = ['g_neutron', 'g_pulsar', 'g_reflection', 'g_stream'];

export const galaxyStage = {
  id: 'galaxy',
  name: 'The Galaxy',
  subtitle: 'A hundred billion suns and none of them are looking.',
  brief: 'Fifty light years across, out where the disc goes thin and the stars are old. ' +
    'Swallow the drifters and the dwarfs, find a way up onto the arm, and work inward — ' +
    'the nurseries, then the core, where the big dark things are.',
  /**
   * DISPLAY UNITS ONLY — see the note above TIERS in util/math.js. One world
   * unit means one light year here; the physics never learns that.
   */
  unit: 'light',
  seed: 19900424,
  startSize: 50,
  goal: 1800,
  /* 11:30, not the 10:00 the balance bot signs off on.
   *
   * The bot reached the goal at 6:24 of 10:00 here — comfortably inside the
   * clock on paper. But it knows where every prop is, so the one cost it can
   * never charge itself is SEARCH, and this map and the universe's are the two
   * largest in the game at 25,600 units across. Search cost is worst exactly
   * where the bot is blindest: late in a stage, on a huge map, hunting the few
   * remaining things big enough to matter. Shipping the bot's number without
   * that allowance is the mistake that produced "there is no chance of
   * completing even the first area", and it cost two rounds of retuning. The
   * extra 90s puts a human at roughly the fraction of the clock the stages
   * nobody has complained about actually use. */
  /* 10:30, cut from 11:30, and the goal raised from 1600 to 1800.
     ⚠ THE PADDING ABOVE THE BOT'S NUMBER IS STILL HERE, just smaller, and the
     note it replaces explains why it existed: the bot knows where every prop
     is, so the one cost it can never charge itself is SEARCH, and this map is
     one of the two largest in the game. Removing that allowance entirely is
     what once produced "there is no chance of completing even the first area".
     But two things have since eaten most of the search cost it was buying —
     the end-of-round finder, which points at the last stragglers, and magnet
     mode, which forgives the approach. And a player reported the result:
     "i could roll up the galaxy with 3:10 to spare". Measured across the whole
     ladder, the median stage uses 49% of its clock to reach the goal; this one
     was at 56% and is the CLIMAX, so it should be tighter than the middle of
     the game rather than looser. */
  time: 630,
  speed: 330,
  density: 1,
  spread: 1,
  cell: 220,
  chunk: 3300,
  spawn: { x: -8200, z: 6400 },
  spawnClear: 340,
  bounds: { minX: -12800, maxX: 12800, minZ: -12800, maxZ: 12800 },
  /* Near-black, and the fog set close: at a fifth of a map width the far side
     of the disc is a haze of dust rather than a hard edge, which is what makes
     25,600ly read as deep rather than as a big room. */
  sky: { top: 0x030209, bottom: 0x1a0f30, fog: 0x0a0618, fogNear: 4600, fogFar: 20000 },
  sun: { x: 0.36, y: 1, z: 0.46, intensity: 1.12 },
  camera: { pitch: 0.36, distance: 6.6 },

  build(w, r) {
    const t = w.terrain;
    const B = 12800;

    /* ---------------- the lap ----------------

       THE OUTERMOST 1,500ly OF THE DISC IS FLAT, AND NO TERRACE MAY STAND IN
       IT. That is a reachability rule, not a taste one.

       `moveKatamari` clamps the ball's CENTRE one radius inside the bounds, so
       a ball of radius R against a wall is standing R inside it whether it
       likes it or not. Put a terrace closer to the wall than that and the clamp
       lifts the ball onto the terrace while everything sown on the disc behind
       it stays on the floor — and `resolve` only eats what reaches to within a
       tenth of a radius of its own underside. The prop does not become hard to
       get, it becomes impossible, from the size that first reaches the step
       onwards, which is what `npm run reach` calls "outgrown".

       Measured, because it shipped that way: the Core Rise stopped 600ly short
       of the north and east walls and the Nursery's west ramp did the same, so
       at 1,281ly across the clamp stood the ball 275ly up the core ramp with a
       55ly star sitting on the disc 77ly away, and eight stars behind those two
       edges were gone for good. A fine sweep of sizes found fourteen.

       So the lap has to be wider than the biggest radius this stage can make:
       eating every prop here gives a 2,393ly ball, i.e. 1,197ly of radius, and
       1,500 leaves room for the prop mix to shift. Small props may sit right up
       against the wall — the lap being FLAT is exactly what keeps them
       reachable — and things with a footprint stay out of it as well, for the
       second reason given down at `OPEN`. */
    const LAP = 1500;

    /* ---------------- heights ----------------

       Named, spaced, and never two big flat faces in one plane. The deck
       heights are far enough apart to read as terraces and close enough that
       a ramp to any of them stays under a 1:11 grade, which is what the climb
       model can pay for out of forward speed without stalling. */
    const Y_ARM = 90;
    const Y_NURSERY = 210;
    const Y_CORE = 340;
    const D_DUST = 1.6;       // spiral banding, on the disc floor
    const D_STAR = 4.4;       // field stars, above the banding
    const D_DECK = 2.2;       // dust painted on a deck
    const D_DECK2 = 4.8;      // and a second layer over that
    const SINK = 60;          // how far a deck slab reaches below the disc

    /**
     * Declare a ramp AND draw it, as a run of short flat steps.
     *
     * Lifted from stages/microbe.js, where the reasoning is written out at
     * length. The short version: a box carries two triangles per face, so one
     * long tilted plate is a single triangle whose corner-average height sits
     * halfway up the slope while its footprint covers the entire ramp — the
     * decal test, and the eye, read that as a floor at chest height. Short
     * axis-aligned steps instead, each with its top face exactly on the
     * collision plane at its own centre and its body reaching down through the
     * disc, so the wedge is solid and the only error left is half a step of
     * height. RISE 9 holds that to 4.5 against a starting radius of 25.
     */
    const RISE = 9;
    /** Every ramp declares itself here so the keep-out list can protect it. */
    const RAMPS = [];
    const slope = (x0, z0, x1, z1, top, topTo, axis, colour) => {
      w.ramp(x0, z0, x1, z1, top, topTo, axis);
      RAMPS.push([x0, z0, x1, z1, axis]);
      const along = axis === 'x' ? x1 - x0 : z1 - z0;
      const wide = axis === 'x' ? z1 - z0 : x1 - x0;
      const rise = topTo - top;
      const m = Math.max(1, Math.ceil(Math.abs(rise) / RISE));
      const step = (along / m) * 1.02;
      for (let i = 0; i < m; i++) {
        const f = (i + 0.5) / m;
        const p = top + f * rise;            // the collision height right here
        const thick = p + SINK;              // ...down through the disc below
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

    /** A walkable deck: the platform, and one solid slab to see it as. */
    const deck = (x0, z0, x1, z1, top, colour) => {
      w.plat(x0, z0, x1, z1, top);
      t.box(x1 - x0, top + SINK, z1 - z0, colour,
        { x: (x0 + x1) / 2, y: (top - SINK) / 2, z: (z0 + z1) / 2 });
      return [x0, z0, x1, z1, top];
    };

    /* ---------------- the disc ---------------- */
    w.plat(-B, -B, B, B, 0);
    t.quad(B * 2, B * 2, G.disc, { y: 0 });

    /* Faint spiral banding, four arms winding out of the core.
       GROUND DETAIL AND NOTHING ELSE: flat quads a light year or two off the
       floor, each with its own hair of height so no two of them fight for the
       same plane, and all of it far below the 25-unit starting radius. */
    const CX = 8100, CZ = -8100;                 // where the core sits
    let dustN = 0;
    for (let arm = 0; arm < 4; arm++) {
      const ph = (arm / 4) * Math.PI * 2 + 0.4;
      for (let rad = 1100; rad < 31000; rad *= 1.062) {
        const th = Math.log(rad / 1100) / 0.42;
        const a = ph + th;
        const x = CX + Math.cos(a) * rad, z = CZ - Math.sin(a) * rad;
        if (x < -B || x > B || z < -B || z > B) continue;
        const len = Math.min(rad * 0.44, 3300), wid = Math.min(rad * 0.15, 950);
        t.quad(len, wid, dustN % 3 === 2 ? G.dust : G.discDust,
          { x, y: D_DUST + (dustN++ % 13) * 0.21, z, ry: Math.PI / 2 + a });
      }
    }
    // and the field stars between the arms
    for (let i = 0; i < 340; i++) {
      const s = 70 + r() * 190;
      t.quad(s, s * (0.5 + r() * 0.5), i % 7 === 0 ? G.gold : (i % 3 ? G.blueWhite : G.halo), {
        x: (r() - 0.5) * B * 1.96, y: D_STAR + (i % 11) * 0.19, z: (r() - 0.5) * B * 1.96,
        ry: r() * 3.14,
      });
    }

    /* ---------------- the Arm ----------------

       A staircase of eleven overlapping squares running north-west to
       south-east across the middle of the map, each one a hair higher than the
       last. The stagger is belt and braces: the squares OVERLAP, so if they
       shared a height their two skins would fight for the same plane across
       the whole overlap. As it is the higher slab simply covers the lower one
       and the seam is a 0.6 step nothing can feel.

       THE ARM IS THE ONE THING ALLOWED INSIDE THE LAP, and it gets away with it
       two different ways. Its first square runs in UNDER the western boundary,
       so there is no disc behind it to lose anything on. Its last leaves a 300ly
       sliver against the southern one, which would be exactly the terraces'
       trap if anything were sown there — nothing is, because no zone below
       reaches past that square. Keep it that way, or run the square in under the
       wall like the first. */
    const ARM = [];
    const AN = 11, ASTEP = 1900, AHALF = 1700;
    const A0 = (i) => -11200 + i * ASTEP - AHALF;      // rect min x
    const Z0 = (i) => -8200 + i * ASTEP - AHALF;       // rect min z
    const ATOP = (i) => Y_ARM + i * 0.6;
    for (let i = 0; i < AN; i++) {
      ARM.push(deck(A0(i), Z0(i), A0(i) + AHALF * 2, Z0(i) + AHALF * 2, ATOP(i),
        i % 2 ? G.armFloor : G.dust));
    }

    /* Six ways up from the disc and three back up from the inside.
       A RAMP HAS TO SPAN THE WHOLE EDGE IT CLIMBS, or its sides are walls and
       the ball shoulders them instead of climbing. Each of these covers a full
       exposed edge segment of the staircase — the part of a square's face that
       its neighbour does not already cover, which is why they are placed at
       1500/1900 offsets rather than centred. */
    const RL = 2000;                                   // 90 over 2000: 1:22
    const ramp = G.dustLit;
    const upLeft = (i) => slope(A0(i) - RL, Z0(i) + 1500, A0(i), Z0(i) + 3400, 0, ATOP(i), 'x', ramp);
    const upFront = (i) => slope(A0(i), Z0(i) + 3400, A0(i) + 1900, Z0(i) + 3400 + RL, ATOP(i), 0, 'z', ramp);
    const upRight = (i) => slope(A0(i) + 3400, Z0(i), A0(i) + 3400 + RL, Z0(i) + 1900, ATOP(i), 0, 'x', ramp);
    const upBack = (i) => slope(A0(i) + 1500, Z0(i) - RL, A0(i) + 3400, Z0(i), 0, ATOP(i), 'z', ramp);
    upLeft(2); upLeft(5); upLeft(8);
    upFront(3); upFront(6); upFront(9);
    upRight(2); upRight(8); upBack(6);

    /* ---------------- the Nursery ----------------
       Cold cloud behind the arm, on the inner side, raised again. Four
       rectangles TILED EDGE TO EDGE — unlike the arm these do not overlap, so
       the tiny height stagger is only there to keep four big skins out of one
       plane. */
    const NUR = [];
    {
      // North edge held off the wall by a LAP, same rule as the Core Rise.
      const xs = [-6600, -3800, -1000], zs = [-(B - LAP), -9150, -7000];
      let k = 0;
      for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
        NUR.push(deck(xs[i], zs[j], xs[i + 1], zs[j + 1], Y_NURSERY + (k++) * 0.6,
          k % 2 ? G.nurseryFloor : G.dustWarm));
      }
      /* South face and west face. Both stop short of the arm's own
         rectangles — a ramp that runs UNDER a deck has its lower half
         buried, because `groundAt` takes the highest platform, and what is
         left is a ledge rather than a way up. The west one spans its tile's
         whole face, which is why its far edge moved with `zs` above. */
      slope(-5600, -7000, -1000, -4400, Y_NURSERY, 0, 'z', G.dustWarm);
      slope(-9200, -(B - LAP), -6600, -9150, 0, Y_NURSERY, 'x', G.dustWarm);
    }

    /* ---------------- the Core Rise ----------------
       The hot middle: the highest deck, the biggest things on it, and the
       glare standing in the centre of it. */
    const CORE = [];
    {
      /* The north and east edges stop a full LAP short of the walls, and the two
         ramps stop with them — their WIDTHS are what used to run out to the map
         edge, 600ly from it, which is the trap described up at LAP. */
      const xs = [3400, 7800, B - LAP], zs = [-(B - LAP), -7800, -3400];
      let k = 0;
      for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
        CORE.push(deck(xs[i], zs[j], xs[i + 1], zs[j + 1], Y_CORE + (k++) * 0.6,
          k % 2 ? G.coreFloor : G.dustWarm));
      }
      slope(-600, -(B - LAP), 3400, -7800, 0, Y_CORE, 'x', G.coreFloor);
      slope(7800, -3400, B - LAP, 600, Y_CORE, 0, 'z', G.coreFloor);
    }

    /* ---------------- the boundary ----------------
       Genuinely impassable (`solidH` 1e6 inside `bound`), and given a face to
       be seen as: 1,600 tall, so it is never a flat surface anywhere near the
       height of the ball. */
    const WH = 1440;
    w.bound(-B - 220, B, B + 220, B + 220, WH);
    w.bound(-B - 220, -B - 220, B + 220, -B, WH);
    w.bound(-B - 220, -B, -B, B, WH);
    w.bound(B, -B, B + 220, B, WH);
    for (const [x, z, ww, dd] of [[0, B + 110, B * 2 + 440, 220], [0, -B - 110, B * 2 + 440, 220],
      [-B - 110, 0, 220, B * 2], [B + 110, 0, 220, B * 2]]) {
      t.box(ww, 1600, dd, G.wallDust, { x, y: 800, z });
      t.box(ww * 0.99, 300, dd * 0.7, G.dust, { x, y: 1650, z });
    }

    /* ---------------- the impassable landmarks ----------------

       `avoid` is the running keep-out list. It starts with these, collects
       every big prop as it is sown, and is handed to every scatter pass —
       `scatter` does no overlap test of its own, so a 1,200ly dust lane
       dropped on top of a red dwarf buries it and the greedy bot then chases
       something it can never reach until the clock runs out. */
    const avoid = [];

    /* THE FOUR CORNERS ARE KEEP-OUTS, which is the lap rule one step further
       on. At a corner the clamp bites on both axes at once, so the nearest legal
       centre to the corner itself is R*sqrt(2) away — half a radius further than
       the ball can reach — and that wedge grows as the ball does. The zones
       below run a strip right into the south-west corner, 300ly off each wall,
       and a prop landing in it is edible while you are small and unreachable
       for good somewhere past 1,000ly across. 900 clears the wedge at every
       size this stage can make: the tightest point it still allows sits 963ly
       from the legal centre against 1,197 of reach. */
    for (const cx of [-B, B]) for (const cz of [-B, B]) avoid.push({ x: cx, z: cz, r: 900 });

    /* AND A LANE UP THE MIDDLE OF EVERY RAMP IS KEPT CLEAR OF BIG THINGS.
     *
     * A ramp is 1,900 to 4,600ly wide and it is the only way onto the deck above
     * it for a ball too small to mount the edge as a step. Park a 1,200ly arm
     * fragment across one and the lane that is left is narrower than the ball
     * that has to fit through: a katamari needs `R + rad` of clearance from an
     * obstacle's centre, so a 400ly radius beside a 600ly fragment wants 1,000
     * and half of a 1,900 ramp is 950. The deck above stops being reachable.
     *
     * Measured before this existed: at 1,300ly across the whole Core Rise — a
     * fifth of this stage's mass — was a separate connected component of the
     * navigable map, walled off by the landmarks standing in both of its ramps,
     * and 9% of the floor was in pockets like it. One run in nine drove into the
     * triangle of arm fragments at the foot of the core's west ramp and spent
     * the last two minutes of the round in it.
     *
     * THIS LIST IS NOT FOR THE SMALL STUFF, and that distinction is worth the
     * extra array: a red dwarf on a ramp is a mouthful on the way up, and the
     * first cut of this — one keep-out per ramp, wide enough to swallow the
     * whole width — took a third of the stage's mass out with the obstacles and
     * emptied the Nursery, which cost more than the pockets ever did. */
    const ways = [];
    for (const [x0, z0, x1, z1, axis] of RAMPS) {
      const alongX = axis === 'x';
      const len = alongX ? x1 - x0 : z1 - z0;
      const n = Math.max(1, Math.ceil(Math.abs(len) / 700));
      for (let i = 0; i <= n; i++) {
        const f = i / n;
        ways.push(alongX
          ? { x: x0 + f * len, z: (z0 + z1) / 2, r: 700 }
          : { x: (x0 + x1) / 2, z: z0 + f * len, r: 700 });
      }
    }

    /* AND THE BOWL YOU START IN HOLDS NOTHING OVER 250ly.
     *
     * `over` on a keep-out means "only bands starting at this size or above have
     * to dodge me", and the bowl is why it exists. You leave the spawn somewhere
     * between 200 and 400ly across, and at that size a 250 to 800ly nebula is
     * not scenery, it is a wall you cannot pass and cannot eat — a run that gets
     * ringed by them before it is big enough to swallow one has nothing left to
     * grow on and the round is over at three minutes. Measured: a 350ly katamari
     * inside a ring of seven, for seven of the ten minutes. Everything up to
     * 250ly is still welcome here, and deliberately thick on the ground: that is
     * the ladder you climb in the first minute. */
    ways.push({ x: galaxyStage.spawn.x, z: galaxyStage.spawn.z, r: 3540, over: 250 });

    /* The Dust Wall: three blocks with 1,600ly of clear sky between them, out
       in the disc a little south of where you start. Broken on purpose — a
       continuous wall across the outer disc would be a fence, and this is
       meant to be a thing you drive through. */
    for (const x0 of [-9600, -5600, -1600]) {
      const x1 = x0 + 2400;
      w.bound(x0, 8200, x1, 9600, 900);
      t.box(2400, 760, 1400, G.wallDust, { x: x0 + 1200, y: 380, z: 8900 });
      t.box(2100, 420, 1000, G.dust, { x: x0 + 1200, y: 900, z: 8900 });
      for (let i = 0; i < 5; i++) {
        const px = x0 + 260 + i * 470;
        t.box(360, 500 + (i % 3) * 260, 700, G.void, { x: px, y: 900, z: 8900 + (i % 2 ? 240 : -240) });
      }
      avoid.push({ x: x0 + 1200, z: 8900, r: 1700 });
    }

    /* The Core's Glare: a pillar of light standing on the junction of the four
       core tiles, with 2,300ly of walkway on its tightest side — enough for the
       biggest ball this stage can produce to get past either way round. */
    {
      const gx = 7800, gz = -7800, gs = 1200;
      w.bound(gx - gs, gz - gs, gx + gs, gz + gs, 2600);
      t.box(gs * 2, 2600, gs * 2, G.dustWarm, { x: gx, y: Y_CORE + 1300, z: gz });
      t.taperOn(gs * 0.5, gs * 1.7, 2000, G.glare, { x: gx, y: Y_CORE + 2500 }, 10);
      t.taperOn(gs * 0.16, gs * 0.6, 1500, G.white, { x: gx, y: Y_CORE + 4400 }, 9);
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        t.box(700, 1800 + (i % 3) * 700, 700, i % 2 ? G.amber : G.gold,
          { x: gx + Math.cos(a) * gs * 1.5, y: Y_CORE + 1400, z: gz + Math.sin(a) * gs * 1.5, ry: -a });
      }
      avoid.push({ x: gx, z: gz, r: 2600 });
    }

    /* The Nebula Arch. Two legs are solid; the span is TERRAIN ONLY, 700ly up,
       and terrain carries no collision whatsoever — so you roll under it at
       any size, and the 3,800ly between the legs is clear for the biggest ball
       the stage can make. */
    {
      const az = -2500, ay = 700;
      for (const lx of [1100, 5900]) {
        w.bound(lx - 500, az - 500, lx + 500, az + 500, ay);
        t.taperOn(420, 620, ay, G.violet, { x: lx, y: 0, z: az }, 9);
        avoid.push({ x: lx, z: az, r: 1500 });
      }
      for (let i = 0; i < 9; i++) {
        const f = i / 8;
        const x = 1100 + f * 4800;
        const y = ay + Math.sin(f * Math.PI) * 380;
        t.box(680, 300 + Math.sin(f * Math.PI) * 180, 900, i % 2 ? G.magenta : G.violet,
          { x, y, z: az, rz: Math.cos(f * Math.PI) * 0.4 });
      }
      for (let i = 0; i < 6; i++) {
        const f = 0.1 + i * 0.16;
        t.box(520, 260, 620, G.rose, { x: 1100 + f * 4800, y: ay + 560 + (i % 2) * 220, z: az + (i % 2 ? 420 : -420) });
      }
    }

    /* ---------------- surface detail on the decks ----------------
       Every one of these is a flat quad between 2 and 6 above whatever it is
       painted on, which on a 25-radius ball is a stain and not a step. */
    let paintN = 0;
    const paint = (rects, colour, n, scale, dy) => {
      for (let i = 0; i < n; i++) {
        const rc = rects[(r() * rects.length) | 0];
        const ww = (rc[2] - rc[0]) * scale * (0.4 + r() * 0.8);
        const dd = (rc[3] - rc[1]) * scale * (0.4 + r() * 0.8);
        t.quad(ww, dd, colour, {
          x: rc[0] + ww / 2 + r() * Math.max(0, rc[2] - rc[0] - ww),
          y: rc[4] + dy + (paintN++ % 9) * 0.24,
          z: rc[1] + dd / 2 + r() * Math.max(0, rc[3] - rc[1] - dd),
          ry: (r() - 0.5) * 0.6,
        });
      }
    };
    paint(ARM, G.dustLit, 22, 0.34, D_DECK);
    paint(ARM, G.indigo, 14, 0.2, D_DECK2);
    paint(ARM, G.blueWhite, 16, 0.05, D_DECK2);
    paint(NUR, G.plum, 12, 0.34, D_DECK);
    paint(NUR, G.magenta, 9, 0.18, D_DECK2);
    paint(NUR, G.rose, 8, 0.06, D_DECK2);
    paint(CORE, G.rust, 12, 0.32, D_DECK);
    paint(CORE, G.ember, 9, 0.18, D_DECK2);
    paint(CORE, G.gold, 10, 0.05, D_DECK2);

    /* ---------------- where things go ----------------

       Four zones, each a list of rectangles. The two flat ones are the halves
       of the disc either side of the arm, cut as staircases of strips because
       the arm runs diagonally and a rectangle does not: OUTER is everything
       south-west of it (quiet, small, where you start) and INNER everything
       north-east (busier, bigger, and it contains the two plateaus).

       Props scattered into INNER that happen to land on the Nursery or the
       Core sit on top of them, which is wanted — a deck with nothing small on
       it is a deck you cannot make progress on. */
    const OUTER = [
      [-12500, -2000, -8800, 2000],
      [-12500, 2000, -5300, 5500],
      [-12500, 5500, -1800, 9000],
      [-12500, 9000, 1700, 12500],
    ];
    /* INNER is cut AROUND the Nursery and the Core rather than over them, and
       that matters more than it looks: with the plateaus left inside these
       strips they collected their own passes AND a share of the disc's, which
       is how the first draft ended up with 56% of the nursery's floor inside
       some obstacle's footprint.

       AND THE LAP IS SOWN — the first three strips are it. Pulling the two
       plateaus a lap off the north and east walls left 1,500ly of corridor
       behind them with nothing in it at all, and a corridor with no food and a
       340ly cliff down one side is somewhere a small katamari drives into and
       then patrols: traced, a 383ly ball spent 150 seconds of a ten-minute round
       pressed against the core deck's east face. It could see the deck, it could
       not climb 340 at that size, and there was nothing on the floor to grow on.
       These strips carry the disc round the outside of the plateaus instead, and
       they stay out of `OPEN` — which clips at exactly this line — so nothing
       with a footprint lands in them and the lap stays a lap. */
    const INNER = [
      [B - LAP, -(B - LAP), 12500, -3400],       // the lap east of the Core Rise
      [3400, -12500, B - LAP, -(B - LAP)],       // and north of it
      [-6600, -12500, -1000, -(B - LAP)],        // and north of the Nursery
      [-8200, -12500, -6600, -9000],
      [-1000, -12500, 3400, -9000],
      [-1000, -9000, 3400, -5500],
      [-4700, -7000, -1000, -5500],
      [-1200, -5500, 3400, -3400],
      [-1200, -3400, 12500, -2000],
      [2300, -2000, 12500, 1500],
      [5800, 1500, 12500, 5000],
      [9300, 5000, 12500, 8500],
    ];
    const ARMZ = ARM.map(([x0, z0, x1, z1]) => [x0 + 220, z0 + 220, x1 - 220, z1 - 220]);
    const NURZ = NUR.map(([x0, z0, x1, z1]) => [x0 + 240, z0 + 240, x1 - 240, z1 - 240]);
    const COREZ = CORE.map(([x0, z0, x1, z1]) => [x0 + 240, z0 + 240, x1 - 240, z1 - 240]);

    /* THE SECOND REASON FOR THE LAP, and it is not decoration either.
     *
     * The clamp that makes the terraces up there a reachability problem makes a
     * big prop parked against a wall a pocket with only one way out. Measured: a
     * 635ly katamari rolled into the gap between a hypernova and the eastern
     * wall and spent the last five minutes of the round there. So everything
     * with a footprint — band four upwards — is kept a lap off the wall too, and
     * there is always open disc to escape along. Small props still go right up
     * to the edge; nothing can be cornered by a red dwarf. */
    const OPEN = (zone) => zone
      .map((q) => [Math.max(q[0], -B + LAP), Math.max(q[1], -B + LAP),
        Math.min(q[2], B - LAP), Math.min(q[3], B - LAP)])
      .filter((q) => q[2] - q[0] > 500 && q[3] - q[1] > 500);

    const area = (zone) => zone.reduce((s, q) => s + (q[2] - q[0]) * (q[3] - q[1]), 0);
    const pickRect = (zone, total) => {
      let k = r() * total;
      for (const q of zone) { k -= (q[2] - q[0]) * (q[3] - q[1]); if (k <= 0) return q; }
      return zone[zone.length - 1];
    };

    /* HOW MUCH ROOM TO LEAVE BESIDE A LANDMARK, and it is the difference between
       a stage that can be cleared and one that cannot.
     *
     * `claim` in the calls below is a landmark's own footprint and nothing more,
     * so two of them at the minimum separation stand with their EDGES 130 to
     * 230ly apart — a wall to anything bigger than a 200ly katamari, and there
     * are a hundred of them out there. Three in a triangle is a cage, and a cage
     * here is fatal rather than annoying: the ball eats what is inside, grows,
     * can never eat the walls, and the round is decided with eight minutes still
     * on the clock. Traced twice — a 350ly ball ringed in the outer disc for
     * seven minutes, a 1,281ly ball at the foot of the core ramp for two — and
     * the navigable map at 350ly came in 76 pieces with 5.6% of its floor in
     * pockets you cannot get out of.
     *
     * 250 is measured. It is where the pockets stop (0.5% of the floor at 350ly,
     * none at all from 700ly up) for the least mass: `sow` gives up on what will
     * not fit, so about two fifths of the middle rungs never land, which is a
     * fifth of the stage's mass and takes the ceiling from 2,608 to 2,393ly.
     * That is the bargain, and it is worth it several times over — the goal goes
     * from 132% of the median run to 67%, and 13 runs in 15 clear instead of 7.
     * The counts below are therefore what this stage ASKS for; the keep-out is
     * what it gets. */
    const SQUEEZE = 250;

    /**
     * Sow the big things FIRST, testing every candidate against everything
     * already down and adding itself to the keep-out list. `scatter` cannot do
     * this — it has no overlap test at all — and at this end of the ladder the
     * props are 900 to 1,900ly across, so two of them in one place is one of
     * them invisible inside the other.
     */
    const sow = (id, zone, n, s0, s1, claim) => {
      const total = area(zone);
      let placed = 0;
      for (let guard = 0; guard < n * 90 && placed < n; guard++) {
        const q = pickRect(zone, total);
        const x = q[0] + r() * (q[2] - q[0]);
        const z = q[1] + r() * (q[3] - q[1]);
        const sc = s0 + r() * (s1 - s0);
        const rad = claim * sc + SQUEEZE;
        let ok = true;
        for (const a of avoid) {
          const rr = rad + a.r;
          if ((x - a.x) ** 2 + (z - a.z) ** 2 < rr * rr) { ok = false; break; }
        }
        if (ok) for (const a of ways) {
          const rr = rad + a.r;
          if ((x - a.x) ** 2 + (z - a.z) ** 2 < rr * rr) { ok = false; break; }
        }
        if (!ok) continue;
        w.placeId(id, x, z, null, sc);
        avoid.push({ x, z, r: rad });
        placed++;
      }
    };

    /**
     * Spread `count` props of one size band over a zone, by area.
     *
     * `ko` is the keep-out list to respect, and it defaults to the one every
     * prop has to respect. The bands with a footprint pass the longer list —
     * see `ways` above and `stake` below.
     */
    const sprinkle = (zone, lo, hi, count, scale, exclude, ko = avoid) => {
      const total = area(zone);
      for (const q of zone) {
        const n = Math.round(count * ((q[2] - q[0]) * (q[3] - q[1])) / total);
        if (n < 1) continue;
        w.scatter({
          tag: 'galaxy', lo, hi, count: n, scale, avoid: ko, exclude,
          x0: q[0], z0: q[1], x1: q[2], z1: q[3],
        });
      }
    };

    /**
     * As `sprinkle`, but the props CLAIM THE GROUND THEY LAND ON, and this is
     * what makes the descending order of the bands below load-bearing rather
     * than tidy.
     *
     * A prop whose centre falls inside a bigger prop's collision radius cannot
     * be collected until the big one can: the resolver pushes the ball out at
     * the obstacle's edge, so the thing inside is visible, listed as edible, and
     * untouchable. `scatter` has no overlap test of its own — the note on
     * `avoid` above only ever covered the hand-sown landmarks, and the 250-800ly
     * bands are 150 to 370ly of footprint each, which is easily enough to bury a
     * globular cluster.
     *
     * It ruins runs rather than just looking untidy, because the bot — and a
     * player — pick targets by value: measured before this existed, 19% of the
     * stage was buried, 91 of those props were over 200ly, and the greedy bot
     * spent the last eight minutes of a ten-minute round shuttling back and
     * forth in front of a 334ly globular sitting 279ly inside a 285ly emission
     * nebula it could not eat for another 270ly of growth. Four runs in nine
     * ended under a third of the goal that way.
     *
     * THE CLAIM IS THE PROP'S OWN RADIUS PLUS A LITTLE ROOM TO GET PAST IT, and
     * the second half is not decoration. Claiming only the radius puts the next
     * band down flush against this one, and six props laid edge to edge are a
     * wall with no gap in it — measured: a 350ly katamari ringed by seven
     * nebulae and clusters in the outer disc, gaps of 500 to 900 where it needed
     * 670 to 1,140, nothing left inside the ring to eat and therefore no way to
     * ever grow out of it. It sat there for seven of the ten minutes.
     *
     * A quarter of `lo`, and deliberately not the whole story. The honest figure
     * is the biggest ball that still cannot eat this band — a prop of pickup P
     * needs a ball of P/pickupRatio, so that is `lo / (2 * 0.88)`, i.e. 0.57 of
     * `lo` — and leaving that on each side guarantees a ball can thread between
     * any two. It also spreads the middle of the ladder thin enough that runs
     * starve: at 0.57 the stage lost 300 props and the median run fell from
     * 1,537 to 1,205ly. At 0.25 the clear rate matches both 0.57 and 0 (13 to 14
     * runs in 15) and the map stays the most navigable of the three for a router
     * that steers around footprints — so the food stays and the tangent walls go.
     * What actually removes the cages is SQUEEZE, up at the landmarks; those are
     * the only props big enough to build one on their own.
     */
    const stake = (zone, lo, hi, count, scale, exclude) => {
      const from = w.field.placements.length;
      sprinkle(zone, lo, hi, count, scale, exclude,
        avoid.concat(ways.filter((a) => !a.over || lo >= a.over)));
      for (let k = from; k < w.field.placements.length; k++) {
        const p = w.field.placements[k];
        avoid.push({ x: p.x, z: p.z, r: p.arch.radius * p.scale * 1.06 + lo * 0.25 });
      }
    };

    const OOUTER = OPEN(OUTER), OINNER = OPEN(INNER), OARMZ = OPEN(ARMZ);
    const ONURZ = OPEN(NURZ), OCOREZ = OPEN(COREZ);

    /* ---------------- the top of the ladder ----------------

       Descending, because that is the only order in which a keep-out list
       works. Every one of these is 900 to 1,800ly across with a footprint to
       match, so HOW MANY GO WHERE is the single most delicate number in the
       stage — read the note on crowding below the bands.

       Scales stay near 1 at the very top, and the margin got thinner when
       SQUEEZE took the ceiling down to 2,393ly: `g_smbh` needs a ball of 2,010ly
       at scale 1, and at 1.15 it needed 2,310 against 2,320 reachable without
       it — ten light years of margin on the check that decides whether the stage
       can be finished at all. 1.05 puts 226 back. `balance` prints this one as
       "too big to ever collect" and `reach` cannot see it, so it is worth the
       lost mass. */
    sow('g_smbh', OCOREZ, 1, 1.0, 1.05, 910);
    sow('g_smbh', OINNER, 2, 1.0, 1.05, 910);
    sow('g_hypernova', OCOREZ, 4, 0.85, 1.06, 805);
    sow('g_hypernova', OINNER, 8, 0.85, 1.06, 805);
    sow('g_spiralarm', OCOREZ, 4, 0.84, 1.1, 710);
    sow('g_spiralarm', OINNER, 15, 0.84, 1.1, 710);
    sow('g_spiralarm', OARMZ, 4, 0.84, 1.04, 710);
    sow('g_spiralarm', OOUTER, 3, 0.84, 1.0, 710);
    sow('g_stream', OCOREZ, 2, 0.82, 1.14, 620);
    sow('g_stream', OINNER, 9, 0.82, 1.14, 620);
    sow('g_stream', OARMZ, 3, 0.82, 1.06, 620);
    sow('g_stream', OOUTER, 2, 0.82, 1.0, 620);
    sow('g_hii', OCOREZ, 4, 0.8, 1.18, 515);
    sow('g_hii', OINNER, 12, 0.8, 1.18, 515);
    sow('g_hii', ONURZ, 4, 0.8, 1.08, 515);
    sow('g_hii', OARMZ, 4, 0.8, 1.06, 515);
    sow('g_hii', OOUTER, 4, 0.8, 1.0, 515);
    sow('g_dustlane', OCOREZ, 4, 0.78, 1.22, 475);
    sow('g_dustlane', OINNER, 12, 0.78, 1.22, 475);
    sow('g_dustlane', ONURZ, 4, 0.78, 1.1, 475);
    sow('g_dustlane', OARMZ, 4, 0.78, 1.08, 475);
    sow('g_dustlane', OOUTER, 4, 0.78, 1.0, 475);

    /* ---------------- everything else, by band ----------------

       Five bands, each covering four or five archetypes, scattered over a scale
       range wide enough that the union of all of them is a continuous ladder
       rather than 28 spikes: `balance` calls a 1.55x step between adjacent
       sizes a hole, the archetypes themselves are only 1.3x apart, and a
       [0.82, 1.3] range closes every one of them several times over.

       HOW CROWDED A REGION MAY BE IS THE REAL BUDGET HERE, and it is not
       measured in props — it is measured in how much of the floor sits inside
       some obstacle's footprint. Overlapping discs stop percolating at about
       68% coverage, so the number that matters is the typical GAP between
       footprint edges against the radius of the ball that has to fit through.

       The first draft put 1,030 props on the arm, 210 of them 250ly or bigger:
       66% coverage, gaps of a hundred light years, and a 250ly katamari wedged
       there for three of the ten minutes while `balance` reported 266 stalls
       and 20% of the round near-stopped. So the quiet outer disc where you are
       smallest is deliberately the emptiest of big things and the core the
       fullest — by which point you have climbed 340ly to get there and are
       600ly across at the very least.

       Which is why the nursery's and the core's counts came down a sixth when
       those two plateaus came a lap off the walls: the number that has to hold
       is props per unit of DECK, and the decks lost about that much floor.

       Note which end the MASS comes from. Footprint scales as pickup squared
       and mass as pickup cubed, so mass per unit of floor blocked is
       proportional to pickup x fill: one spiral-arm fragment is worth sixteen
       molecular clouds and blocks a third as much ground as they do. Every time
       this stage needed more mass the answer was another arm fragment, never
       another two hundred nebulae. */
    const S_SMALL = [0.8, 1.32];
    const S_MID = [0.82, 1.3];
    const S_BIG = [0.82, 1.26];

    /* EACH REGION IS SOWN BIGGEST FIRST, for the reason written out at `stake`:
       the three bands with a real footprint claim their ground on the way down,
       so nothing later can land inside one of them and sit there uncollectable.
       The two small bands go last and claim nothing — a brown dwarf overlapping
       a red dwarf costs nobody anything, they are both a mouthful. */

    // the outer disc: dwarfs, drifters, and thin enough to cross at any size
    stake(OOUTER, 460, 800, 22, S_BIG);
    stake(OOUTER, 250, 460, 80, S_BIG);
    stake(OUTER, 105, 250, 200, S_MID);
    sprinkle(OUTER, 45, 105, 240, S_SMALL);
    sprinkle(OUTER, 14, 45, 330, S_SMALL);

    // the arm: the middle of the ladder, and the densest SMALL ground there is
    stake(OARMZ, 460, 800, 14, S_BIG);
    stake(OARMZ, 250, 460, 50, S_BIG);
    stake(ARMZ, 105, 250, 130, S_MID);
    sprinkle(ARMZ, 45, 105, 190, S_SMALL);
    sprinkle(ARMZ, 14, 45, 200, S_SMALL);

    // the inner disc
    stake(OINNER, 460, 800, 30, S_BIG);
    stake(OINNER, 250, 460, 90, S_BIG);
    stake(INNER, 105, 250, 250, S_MID);
    sprinkle(INNER, 45, 105, 280, S_SMALL);
    sprinkle(INNER, 14, 45, 330, S_SMALL);

    // the nursery: cold cloud and protostars, and no old dead stars
    stake(ONURZ, 460, 800, 10, S_BIG);
    stake(ONURZ, 250, 460, 25, S_BIG, ['g_blackhole']);
    stake(NURZ, 105, 250, 50, S_MID, ['g_neutron', 'g_pulsar']);
    sprinkle(NURZ, 45, 105, 58, S_SMALL);
    sprinkle(NURZ, 14, 45, 50, S_SMALL, AIR);

    // the core: the exotic end of the catalogue
    stake(OCOREZ, 460, 800, 13, S_BIG, ['g_reflection']);
    stake(OCOREZ, 250, 460, 33, S_BIG, ['g_nursery']);
    stake(COREZ, 105, 250, 58, S_MID);
    sprinkle(COREZ, 45, 105, 66, S_SMALL);
    sprinkle(COREZ, 14, 45, 58, S_SMALL, AIR);

    /* ---------------- the bowl you start in ----------------

       Where the whole run is decided. A 50ly katamari can swallow anything up
       to 44ly, which out here means a rogue planet, a brown dwarf, a red
       dwarf, a white dwarf or a small main-sequence star — so the five
       thousand light years round the spawn are packed with exactly those and a
       ladder's worth of the next rung up. `spawnClear` takes out anything too
       big to eat that lands too close; without this pass the opening minute is
       a very long drive across a very empty disc. */
    const HX = -10700, HZ = 3900, HX1 = -5700, HZ1 = 8900;
    const bowl = [[HX, HZ, HX1, HZ1]];
    sprinkle(bowl, 14, 45, 240, [0.82, 1.3], AIR);
    sprinkle(bowl, 45, 105, 80, [0.8, 1.2]);
    sprinkle(bowl, 105, 250, 22, [0.8, 1.1]);
  },
};
