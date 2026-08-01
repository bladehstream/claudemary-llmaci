/* ============================================================
   Props for The Galaxy.  50ly -> 1,600ly.

   ONE WORLD UNIT IS ONE LIGHT YEAR, and that is a DISPLAY
   convention only (`unit: 'light'`). Everything below is written
   as plain numbers in the same band the physics was tuned in,
   exactly as the house is written in metres — see the note above
   TIERS in util/math.js for why authoring a nebula in true
   metres breaks the simulation instead of dignifying it.

   Everything in here is a SILHOUETTE, not a model. The camera
   sits a few thousand light years up and the stage carries some
   three thousand of these at once, so a globular cluster is
   twenty-two small spheres and an emission nebula is fifteen
   blobs. Detail spent below that is vertices thrown away.

   THREE RULES SHAPED EVERY SHAPE IN THIS FILE, and each of them
   cost somebody a run.

   1. NOTHING BIG IS WIDER THAN IT IS TALL. `pickup` is the cube
      root of the bounding box while the collision radius is half
      the longest HORIZONTAL span — and a nebula, a dust lane and
      an accretion disc all *want* to be wide and flat. Authored
      that way they read to the player as something small and to
      the physics as a fence a third of a region across.
      Measured: at 0.5 the first draft of this stage put 66% of
      the arm's surface inside some obstacle's footprint and a
      250ly katamari spent three minutes wedged on it, growing by
      nothing.
      So everything from a black hole upwards is stretched
      VERTICALLY instead — a dust chimney, a jet, a pillar, a
      stream looping out of the plane. Growth counts
      `boxVol * fill` and boxVol is pickup cubed whatever the
      aspect, so a 1.24:1 stretch costs no mass at all and takes
      a fifth off the radius and a third off the footprint. Ratios
      run from 0.83x to 1.45x of pickup per axis, tall on Y.

   2. SIX ANCHOR BLOBS PIN THE BOX. A cloud drawn out of random
      blobs measures differently on every variant, `pickup` is
      measured across all of them, and the rung drifts. `puff`
      and `band` put one blob tangent to each face of the
      intended box and let the rest fall where they like, so the
      measured size IS the authored size.

   3. WIDE THINGS ARE BUILT OUT OF SEPARATE LUMPS. Collision uses
      one box per primitive (see `collisionParts` in index.js),
      capped at 14 — so a disc built as eight arcs has seven real
      gaps in it and a ball can roll between them, where the same
      disc built as one annulus is a solid plate. Nothing here is
      a long horizontal plate floating at its own mid-height.

   `fill` is honest: a star is nearly a sphere at 0.5, a shell of
   gas with a hundred light years of nothing in it is 0.05. Growth
   counts `boxVol * fill`, so this is also where the stage's mass
   lives — the six biggest archetypes carry most of it and
   everything from a rogue planet to a pulsar is texture.
   Re-sizing anything above `g_molecular` moves the final ball
   and the size ceiling with it; re-sizing a red dwarf does not.
   Measure with `node tools/balance.mjs 0.9 --runs=9 --only=galaxy`.

   The ladder runs 16 -> 1,780 in 28 rungs, none more than about
   30% above the one below, and the stage scatters each of them
   over a scale range that fills in between the rungs and takes
   the top out to ~1,890. `balance` calls anything above 1.55x a
   hole.
   ============================================================ */

import { defineProp } from './index.js';
import { C } from '../../render/palette.js';
import {
  TAU, corona, prominence, shell, jet, ring, annulus, gradedDisc,
  spiralArm, swarm, wisps, pillars, core,
} from './spacekit.js';

const U = 'light';

/**
 * Tag, category default and unit on every one of them, and all three are
 * load-bearing: no tag and the stage's scatter pool is empty, no unit and the
 * collection log prints a spiral arm as a bare number in the same column as a
 * drawing pin.
 */
const P = (def) => defineProp({ cat: 'galaxy', tags: ['galaxy'], unit: U, ...def });

/* ------------------------------------------------------------------
   A galaxy's palette.

   The shared set in render/palette.js is a toy-box of bright plastics and
   brick, and this stage needs three things it has none of: a near-black to
   put everything against, the specific whites and blues of hot stars, and
   the sour magentas and teals of excited gas. Not added to palette.js on
   purpose — that set is shared with nine other stages and none of them wants
   an event-horizon black. Exported only so the stage's terrain can paint its
   disc and its dust out of the same tin as the things standing on it.
   ------------------------------------------------------------------ */
export const G = {
  /* the dark */
  event:     0x08070d,   // the black of a hole: darker than the sky
  voidDeep:  0x0b0916,
  void:      0x141026,
  dust:      0x241a3d,
  dustWarm:  0x3a2340,
  dustLit:   0x4d3564,
  ash:       0x2e2838,

  /* stellar */
  white:     0xfdfcff,
  blueWhite: 0xd9e6ff,
  blue:      0x7fb0ff,
  blueDeep:  0x3a5ad8,
  cyan:      0x6fe4ee,
  teal:      0x1f8f9c,
  gold:      0xffdd94,
  amber:     0xffab52,
  ember:     0xff6b3a,
  emberDk:   0xb43a24,
  rust:      0x8a3520,

  /* nebula */
  magenta:   0xe45ad0,
  rose:      0xff8fb4,
  violet:    0x8a4ade,
  indigo:    0x3f2d8c,
  plum:      0x5c2c6d,
  jade:      0x63e0a6,

  /* exotic */
  halo:      0xa8d4ff,
  glare:     0xfff4cf,
  xray:      0xbfe4ff,

  /* the stage's floors, so the terrain and the props agree */
  disc:      0x0d0b18,
  discDust:  0x1a1330,
  armFloor:  0x241a3c,
  nurseryFloor: 0x3b2246,
  coreFloor: 0x3a1a24,
  wallDust:  0x171227,
};

/* ------------------------------------------------------------------
   Shared builders. A dark nebula, an emission nebula and a molecular cloud
   are the same drawing three times over in different colours at different
   sizes, and writing that out three times is how the three of them end up
   subtly inconsistent — and how one of them quietly measures 12% off its
   rung.
   ------------------------------------------------------------------ */

/**
 * A cloud of `n` blobs filling the ellipsoid (RX, RY, RZ) centred at
 * (0, y, 0).
 *
 * THE FIRST SIX ARE ANCHORS, one tangent to each face of that box. Without
 * them the box is whatever the random blobs happened to reach, which differs
 * per variant and is measured across all of them, so `pickup` — and therefore
 * the rung this archetype occupies in the growth ladder — moves whenever the
 * seed changes. With them the box is exact and the shape is still free.
 *
 *   shell  keep the filler outside this radial fraction (a remnant, a bubble)
 *   pack   radial bias for the filler; 0.34 is uniform, higher concentrates
 *   lo/hi  blob radius as a fraction of the SHORTEST semi-axis
 *
 * A HOLLOW SHELL IS A CAGE, and a cage the size of a region is a lost run.
 * Collision is one box per blob, so a ring of blobs has gaps a small ball can
 * roll in through and a bigger one cannot roll out of — and it does not have to
 * grow much to stop fitting. Measured: a katamari rolled into a hypernova shell
 * at 300ly across and sat inside it, pinned, for the last five minutes of the
 * round, `balance` reporting 698 stalls and half the clock near-stopped. So
 * anything big enough to swallow a ball whole is either solid or has something
 * solid filling the middle; `shell` above about 0.5 belongs only on props small
 * enough that the ball which would fit inside is smaller than the one you start
 * the stage with.
 */
function puff(b, RX, RY, RZ, n, cols, rnd, o = {}) {
  const yc = o.y ?? RY;
  const m = Math.min(RX, RY, RZ);
  const lo = (o.lo ?? 0.18) * m, hi = (o.hi ?? 0.32) * m;
  const seg = o.seg ?? 7, hseg = o.hseg ?? 5;
  const shell = o.shell ?? 0;
  const pack = o.pack ?? 0.34;
  const AX = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  for (let i = 0; i < n; i++) {
    const rr = lo + rnd() * (hi - lo);
    let fx, fy, fz;
    if (i < 6) {
      fx = AX[i][0]; fy = AX[i][1]; fz = AX[i][2];
    } else {
      const u = rnd() * 2 - 1, ph = rnd() * Math.PI * 2, s = Math.sqrt(1 - u * u);
        const t = shell ? shell + rnd() * (1 - shell) : Math.pow(rnd(), pack);
      fx = Math.cos(ph) * s * t; fy = u * t; fz = Math.sin(ph) * s * t;
    }
    b.sphere(rr, cols[(rnd() * cols.length) | 0],
      { x: fx * (RX - rr), y: yc + fy * (RY - rr), z: fz * (RZ - rr) }, seg, hseg);
  }
}

/**
 * A band of chunks running DIAGONALLY across the box (RX, RY, RZ): a dust lane,
 * a tidal stream, a fragment of arm. Corner to corner, with a gentle bow.
 *
 * EVERY CHUNK REACHES THE FULL HEIGHT OF THE BOX, tapering towards the ends.
 * Drawn as a flat ribbon instead it would be a long horizontal plate sitting at
 * its own mid-height, which reads as a girder through the middle of the
 * katamari — the same defect `npm run decals` exists to catch in terrain.
 *
 * IT IS A WALL AND NOT A HORSESHOE, and that took a whole afternoon to learn.
 * The first version swept the chunks round an arc that entered and left the box
 * on the same side, which is a shape wrapping better than 180 degrees — and the
 * collision boxes go round with it. A katamari that rolled into the bay while it
 * was small could not get back out through the mouth once it had grown, the
 * resolver pushed it off one chunk into the next in a three-cycle that netted
 * zero, and the run ended standing still. One run in five died that way, in the
 * middle of the map, nowhere near a wall. A diagonal has no bay: the ball hits
 * it and drives round either end.
 *
 * The two ends pin X and Z (they sit in opposite corners) and the middle chunk
 * pins Y — so `n` must be ODD.
 */
function band(b, RX, RY, RZ, n, cols, rnd, o = {}) {
  const yc = o.y ?? RY;
  const seg = o.seg ?? 8, hseg = o.hseg ?? 5;
  const bow = o.bow ?? 0.34;                          // sideways sag, well under 1
  const rz = RZ * (o.thick ?? 0.16);
  const rx = (RX / n) * (o.grain ?? 1.6);
  for (let i = 0; i < n; i++) {
    const t = (i / (n - 1)) * 2 - 1;                  // -1 .. 1, corner to corner
    const px = t;
    const pz = t + bow * (1 - t * t);
    const ry = RY * (0.56 + 0.44 * Math.cos(t * Math.PI * 0.5));
    // heading of the band right here, so each chunk lies along it
    const a = -Math.atan2(1 - 2 * bow * t, 1);
    /* The chunk is turned to follow the band, so its footprint is wider than its
       own radii; take that off the reach or the ends overshoot the box. This is
       the exact support of a rotated ellipsoid, not the sum of the two radii —
       the sum is a whole 4% too pessimistic at this angle, which quietly put
       the dust lane, the stream and the arm fragment each a rung low. */
    const ca = Math.cos(a), sa = Math.sin(a);
    const ex = Math.hypot(rx * ca, rz * sa), ez = Math.hypot(rx * sa, rz * ca);
    b.ellip(rx, ry, rz, cols[i % cols.length],
      { x: px * (RX - ex), y: yc, z: pz * (RZ - ez), ry: a }, seg, hseg);
    if (o.knot && i % 2 === 1) {
      b.sphere(rz * 0.5, o.knot, { x: px * (RX - ex) * 0.94, y: yc + ry * 0.5, z: pz * (RZ - ez) * 0.9 }, 6, 4);
    }
  }
}

/**
 * A ring of chunks: an accretion disc, broken into arcs on purpose.
 *
 * One flat annulus would be a single wide plate whose collision radius fences
 * off a region while its `pickup` reads as a mouthful, and there would be no
 * way through it. Eight lumps with a warp in them have seven gaps, real
 * thickness, and the same silhouette. `n` divisible by four so a chunk sits on
 * each axis and the box is exact.
 */
function lumpDisc(b, R, rr, ry, yc, cols, warp, n) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    b.ellip(rr, ry, rr, cols[i % cols.length],
      { x: Math.cos(a) * R, y: yc + Math.sin(a) * warp, z: Math.sin(a) * R }, 8, 5);
  }
}

/** A cone of light leaving (0, y0, 0) along +Y (`up` 1) or -Y (-1). */
function jetCone(b, y0, len, r0, col, up = 1, seg = 8) {
  b.cyl(up > 0 ? r0 : 0.8, up > 0 ? 0.8 : r0, len, col, { y: y0 + up * len * 0.5 }, seg);
}

/* ==================================================================
   THINGS WITH A SURFACE — a planet and the main sequence
   ================================================================== */

/**
 * A marking ON the surface of a sphere of radius R — a starspot, a storm, an
 * ice cap. A flat disc laid tangent at (theta, phi), lifted by a hair.
 *
 * ⚠ THIS REPLACES THE IDIOM THAT CAUSED THE COMPLAINT. Every star in this file
 * used to be two overlapping spheres, a big one and a smaller one at 0.78-0.84
 * of its radius pushed off-centre, so the inner one broke the surface in a few
 * places. Rendered, that does not read as a marking: it reads as a hole
 * punched in a billiard ball, which is most of what "random misshapen blobs"
 * was pointing at. A tangent disc reads as a spot because it IS one.
 */
function spot(b, R, th, ph, size, col, o = {}) {
  const y0 = o.y ?? R;
  const dx = Math.sin(ph) * Math.cos(th), dy = Math.cos(ph), dz = Math.sin(ph) * Math.sin(th);
  b.ellip(R * size, R * size * 0.14, R * size * (o.long ?? 1), col, {
    x: dx * R * 0.995, y: y0 + dy * R * 0.995, z: dz * R * 0.995,
    rz: -Math.atan2(dx, dy), rx: Math.atan2(dz, Math.hypot(dx, dy)),
    ghost: true,
  }, 6, 3);
}

/** A latitude band around a sphere — a gas giant's cloud belt. */
function belt(b, R, lat, width, col) {
  const c = Math.cos(lat);
  b.ellip(R * c * 1.006, R * width, R * c * 1.006, col,
    { y: R + Math.sin(lat) * R, ghost: true }, 11, 3);
}

P({ id: 'g_rogue', name: 'Rogue Planet', cat: 'planet', sizeMul: 1.0103, fill: 0.5155, variants: 3, weight: 12,
  build(b, r, v) {
    const R = 8;
    b.sphere(R, [G.dust, G.rust, G.plum][v], { y: R }, 12, 9);
    // No star to light it: a cold cap, a couple of basins, and a faint rim so
    // the silhouette survives against the void.
    spot(b, R, 0, 0.28, 0.42, G.ash);
    spot(b, R, 2.1, 1.5, 0.3, [G.plum, G.emberDk, G.indigo][v], { long: 1.6 });
    spot(b, R, 4.3, 2.0, 0.24, G.void);
    b.decor((d) => {
      d.lathe([[R * 1.0, 0], [R * 1.05, 0]], [G.dustLit, G.slate ?? G.ash, G.indigo][v] ?? G.dustLit,
        { y: R, rx: 0.35 }, 20);
    });
  } });

P({ id: 'g_browndwarf', name: 'Brown Dwarf', cat: 'star', sizeMul: 1.0022, fill: 0.5033, variants: 3, weight: 12,
  build(b, r, v) {
    const R = 10.5;
    b.sphere(R, G.rust, { y: R }, 13, 9);
    // Belts, drawn as bands hugging the surface rather than as discs punched
    // through it — the old version's equator read as a seam.
    const bands = [G.emberDk, G.plum, G.dustWarm];
    for (let i = 0; i < 5; i++) {
      belt(b, R, (i - 2) * 0.34, 0.052 + (i % 2) * 0.03, bands[(i + v) % 3]);
    }
    spot(b, R, 0.8, 1.25, 0.3, G.ember, { long: 1.7 });     // the great storm
    spot(b, R, 3.6, 1.9, 0.18, G.amber, { long: 1.4 });
  } });

P({ id: 'g_reddwarf', name: 'Red Dwarf', cat: 'star', sizeMul: 1.0022, fill: 0.5537, variants: 3, weight: 13,
  build(b, r, v) {
    const R = 13.5;
    b.sphere(R, G.ember, { y: R }, 13, 9);
    // A flare loop off the limb, and a spot group at its feet. A red dwarf's
    // whole personality is that it is small, cool and covered in weather.
    prominence(b, R, G.gold, 0.5, 0.34, { y: R, lift: 0.3 });
    prominence(b, R, G.amber, 3.4, 0.24, { y: R, lift: -0.1, tilt: 0.8 });
    for (let i = 0; i < 4; i++) {
      spot(b, R, r() * TAU, 0.7 + r() * 1.7, 0.13 + r() * 0.1, [G.emberDk, G.rust, G.plum][v]);
    }
  } });

/* A point of light with a cross through it. The spikes ARE the silhouette — a
   white dwarf drawn as a plain sphere would sit on the same rung as a red dwarf
   and the ladder would have two rungs at one height.
   ⚠ They are ghost now, so they no longer set `pickup` either; `sizeMul` below
   carries that instead. See tools/reghost.mjs. */
P({ id: 'g_whitedwarf', name: 'White Dwarf', cat: 'star', sizeMul: 1.3241, fill: 0.6964, variants: 3, weight: 13,
  build(b, r, v) {
    const R = 17;
    core(b, R, R, R, G.blueWhite, { y: R, k: 0.78 });
    b.sphere(R * 0.4, G.white, { y: R }, 11, 8);
    b.decor((d) => {
      // A diffraction cross: long, needle-thin, tapering to nothing. The old
      // version used square bars of constant thickness and read as scaffolding.
      for (const [sx, sy, sz] of [[1, 0, 0], [0, 1, 0], [0, 0, 1]]) {
        for (const s of [1, -1]) {
          d.cone(R * 0.055, R * 0.98, sy ? G.blueWhite : G.white, {
            x: sx * s * R * 0.49, y: R + sy * s * R * 0.49, z: sz * s * R * 0.49,
            rz: sx ? -s * Math.PI / 2 : 0, rx: sz ? s * Math.PI / 2 : 0,
            ry: 0,
          }, 4);
        }
      }
      d.torus(R * 0.6, R * 0.02, [G.halo, G.cyan, G.blueWhite][v], { y: R, rx: 1.2 }, 4, 16);
    });
  } });

P({ id: 'g_star', name: 'Main-Sequence Star', cat: 'star', sizeMul: 0.984, fill: 0.524, variants: 4, weight: 14,
  build(b, r, v) {
    const R = 21.5;
    const skin = [G.gold, G.white, G.blueWhite, G.amber][v];
    const cool = [G.amber, G.blueWhite, G.cyan, G.ember][v];
    b.sphere(R, skin, { y: R }, 13, 9);
    b.decor((d) => ring(d, R * 1.13, cool, { y: R, rx: 1.42, tube: 0.022 }, 22));
    prominence(b, R, G.ember, 1.0, 0.3, { y: R, lift: 0.4 });
    prominence(b, R, cool, 4.0, 0.22, { y: R, lift: -0.2, tilt: 0.7 });
    // granulation: a scatter of faint cells, so the surface is not a flat fill
    for (let i = 0; i < 5; i++) spot(b, R, r() * TAU, r() * Math.PI, 0.14 + r() * 0.08, cool);
  } });

/* Aspect 1.3 x 0.877 x 0.877 — the widest thing in the file and still only
   0.65 of its own pickup in collision radius. */
P({ id: 'g_binary', name: 'Binary Pair', cat: 'star', sizeMul: 0.9804, fill: 0.3204, variants: 3, weight: 11,
  build(b, r, v) {
    const HX = 35.1, HY = 23.68;
    const big = [G.gold, G.white, G.amber][v], small = [G.ember, G.blueWhite, G.rust][v];
    b.sphere(HY, big, { x: -HX + HY, y: HY }, 13, 9);
    b.sphere(HY * 0.443, small, { x: HX - HY * 0.443, y: HY }, 11, 8);
    b.decor((d) => {
      /* The accretion stream: mass leaving the big star, spiralling in, and
         piling up as a disc round the small one. It curves — a straight bar
         between two stars is a dumbbell and reads as one. */
      const x0 = -HX + HY * 1.9, x1 = HX - HY * 0.9;
      for (let i = 0; i < 9; i++) {
        const t = i / 8;
        const w = HY * (0.13 - t * 0.06);
        d.ellip(w * 2.2, w, w, i > 5 ? G.amber : G.gold, {
          x: x0 + (x1 - x0) * t,
          y: HY + Math.sin(t * Math.PI) * HY * 0.26,
          z: Math.sin(t * Math.PI) * HY * 0.34,
          ry: -0.5 + t,
        }, 6, 4);
      }
      gradedDisc(d, HY * 0.5, HY * 1.15, [G.gold, G.amber, G.ember],
        { x: HX - HY * 0.443, y: HY, rx: 0.32 }, 3, 20);
    });
  } });

P({ id: 'g_redgiant', name: 'Red Giant', cat: 'star', sizeMul: 0.985, fill: 0.4778, variants: 3, weight: 11,
  build(b, r, v) {
    const R = 33.5;
    b.sphere(R, G.ember, { y: R }, 13, 9);
    // Huge, ragged and shedding: a long corona, big loops, and convection cells
    // the size of the whole star, which is what a red giant actually has.
    for (let i = 0; i < 4; i++) {
      prominence(b, R, [G.amber, G.gold, G.rust][i % 3], (i / 4) * TAU + v,
        0.24 + (i % 2) * 0.12, { y: R, lift: 0.2 + (i % 3) * 0.22, tilt: 0.7 + i * 0.2, tube: 0.07 });
    }
    for (let i = 0; i < 4; i++) spot(b, R, (i / 4) * TAU + v, 0.6 + (i % 3) * 0.8, 0.32, G.emberDk);
  } });

P({ id: 'g_supergiant', name: 'Blue Supergiant', cat: 'star', sizeMul: 0.984, fill: 0.4764, variants: 3, weight: 10,
  build(b, r, v) {
    const R = 41;
    b.sphere(R, G.blueWhite, { y: R }, 13, 9);
    // The wind: a supergiant is blowing itself apart, so it wears a bubble.
    // A wind RING, not a wind shell: a shell round a star is just a bigger
    // star, and an opaque one hides the thing it is decorating.
    b.decor((d) => {
      ring(d, R * 1.22, G.cyan, { y: R * 1.02, rx: 1.35, tube: 0.022 }, 22);
      ring(d, R * 1.34, G.halo, { y: R * 1.0, rx: 1.5, rz: 0.4, tube: 0.016 }, 22);
    });
    for (let i = 0; i < 5; i++) spot(b, R, (i / 5) * TAU, 0.5 + (i % 3) * 0.7, 0.16, G.blue);
  } });

/* ==================================================================
   BIRTH — cocoons, globules, the places stars come from
   ================================================================== */

P({ id: 'g_protostar', name: 'Protostar', cat: 'birth', sizeMul: 1.5819, fill: 0.7125, variants: 3, weight: 10,
  build(b, r, v) {
    /* A star still inside its egg: a dark dusty cocoon, a hot dot at the
       middle, a flat infall disc, and two narrow outflows drilling out of the
       poles. The old jets were cones a third as wide as they were long, which
       renders as an ice-cream cone and read as one. */
    const HX = 46.5, HY = 58, cy = 40;
    core(b, HX, HY * 0.72, HX, G.dust, { y: cy, k: 0.72 });
    b.sphere(13, [G.glare, G.amber, G.gold][v], { y: cy }, 9, 7);
    b.decor((d) => {
      wisps(d, HX, cy * 0.8, HX, 9, [G.dust, G.dustWarm, G.ash], r, { y: cy, head: v, spread: 0.8 });
      gradedDisc(d, 16, HX * 0.92, [G.dustWarm, G.dust, G.ash], { y: cy, rx: 0.28, warp: 0.1 }, 3, 20);
      jet(d, cy + 12, HY * 0.95, G.cyan, { up: 1, r: 0.03, knots: 2, hot: G.jade, lobe: 0.1 });
      jet(d, cy - 12, cy * 0.85, G.cyan, { up: -1, r: 0.03, knots: 2, hot: G.jade });
    });
  } });

P({ id: 'g_bok', name: 'Bok Globule', cat: 'birth', fill: 0.35, variants: 3, weight: 9,
  build(b, r, v) {
    const R = 60;
    puff(b, R, R, R, 12, [G.void, G.dust, G.ash], r, { lo: 0.26, hi: 0.4 });
    // rim-lit on the side facing whatever is eating it away
    for (let i = 0; i < 3; i++) {
      const a = -1.2 + i * 0.9;
      b.sphere(R * 0.15, [G.rose, G.amber, G.magenta][v],
        { x: Math.cos(a) * R * 0.78, y: R + (i - 1) * R * 0.34, z: Math.sin(a) * R * 0.6 }, 6, 4);
    }
  } });

P({ id: 'g_planetary', name: 'Planetary Nebula', cat: 'death', sizeMul: 1.7001, fill: 0.4914, variants: 3, weight: 9,
  build(b, r, v) {
    /* Everybody's mental image of one is a RING with a white dot at the
       middle, and it was thirteen coloured balls. Now it is: the dead core, a
       bright inner ring, a graded torus of ejected shell, and two faint polar
       lobes — the bipolar shape most of them actually have. */
    const R = 71.5;
    const hot = [G.teal, G.magenta, G.violet][v];
    core(b, R, R, R, hot, { y: R, k: 0.6 });
    b.sphere(R * 0.13, G.white, { y: R }, 9, 7);
    b.decor((d) => {
      ring(d, R * 0.3, G.rose, { y: R, rx: 1.15, tube: 0.05 }, 22);
      gradedDisc(d, R * 0.42, R * 0.96, [G.cyan, hot, G.magenta, G.violet],
        { y: R, rx: 1.15, warp: 0.12 }, 4, 24);
      for (const s of [1, -1]) {
        d.ellip(R * 0.28, R * 0.44, R * 0.28, hot, { y: R + s * R * 0.5, ghost: true }, 8, 5);
      }
    });
  } });

P({ id: 'g_remnant', name: 'Supernova Remnant', cat: 'death', sizeMul: 1.5469, fill: 0.2961, variants: 3, weight: 8,
  build(b, r, v) {
    /* A real expanding bubble, open at the top so you can see the cavity —
       which is the thing that reads as "this blew up" and is exactly what a
       cloud of twelve spheres cannot say. Ghost, so it is a picture of a shell
       and not a cage: solid, this shape once pinned a katamari inside itself
       for five minutes and `balance` counted 698 stalls. */
    const R = 85;
    const tint = [G.rose, G.violet, G.jade][v];
    core(b, R, R, R, G.emberDk, { y: R, k: 0.66 });
    b.sphere(R * 0.1, G.xray, { y: R }, 8, 6);
    b.decor((d) => {
      shell(d, R, G.emberDk, { y: R, th: 0.07, open: 0.34 }, 22);
      shell(d, R * 0.82, tint, { y: R, th: 0.05, open: 0.42 }, 18);
      // filaments whipping off the shock front
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * TAU + v, e = (r() - 0.5) * 1.1;
        d.ellip(R * 0.3, R * 0.035, R * 0.035, G.rose, {
          x: Math.cos(a) * R * 0.78, y: R + e * R * 0.55, z: Math.sin(a) * R * 0.78, ry: -a,
        }, 5, 4);
      }
    });
  } });

/* ==================================================================
   THE DEAD AND THE VIOLENT — in the air, because a jet points
   somewhere and pointing it into the floor wastes half of it
   ================================================================== */

P({ id: 'g_neutron', name: 'Neutron Star', cat: 'death', surface: 'air', flyHeight: 90,
  sizeMul: 1.7213, fill: 0.306, variants: 3, weight: 8,
  build(b, r, v) {
    /* A city-sized object with a magnetosphere the size of a solar system:
       a tiny hard dot, a wide thin field ring, and two beams. All the drama is
       in the ratio, so the dot has to stay small and the beams have to stay
       thin. */
    const HX = 83, HY = 145;
    core(b, HX, HY, HX, G.void, { y: HY, k: 0.6 });
    b.sphere(13, G.xray, { y: HY }, 9, 7);
    b.decor((d) => {
      ring(d, HX * 0.92, [G.cyan, G.teal, G.halo][v], { y: HY, rx: 0.2, tube: 0.03 }, 24);
      ring(d, HX * 0.62, G.halo, { y: HY, rx: 0.2, rz: 0.3, tube: 0.02 }, 22);
      jet(d, HY + 12, HY * 0.92, G.blueWhite, { up: 1, r: 0.022, knots: 3, hot: G.white });
      jet(d, HY - 12, HY * 0.92, G.blueWhite, { up: -1, r: 0.022, knots: 3, hot: G.white });
    });
  } });

P({ id: 'g_pulsar', name: 'Pulsar', cat: 'death', surface: 'air', flyHeight: 120,
  fill: 0.06, variants: 3, weight: 7,
  build(b, r, v) {
    const HX = 102.2, HY = 155.2;
    puff(b, HX, HY * 0.4, HX, 10, [G.indigo, G.violet, [G.teal, G.plum, G.blueDeep][v]], r,
      { y: HY, lo: 0.22, hi: 0.34 });
    b.sphere(15, G.white, { y: HY }, 8, 6);
    // two beams off the spin axis; their tips are what pin the box vertically
    const ph = 0.32, L = HY / Math.cos(ph);
    b.cyl(24, 1, L, G.cyan,
      { x: Math.sin(ph) * L * 0.5, y: HY + Math.cos(ph) * L * 0.5, rz: -ph }, 8);
    b.cyl(24, 1, L, G.cyan,
      { x: -Math.sin(ph) * L * 0.5, y: HY - Math.cos(ph) * L * 0.5, rz: Math.PI - ph }, 8);
  } });

/* THE DISC IS EIGHT ARCS, NOT A PLATE. See `disc` above; a single annulus
   here was the exact trap rule 4 of the brief describes. */
P({ id: 'g_blackhole', name: 'Black Hole', cat: 'exotic', sizeMul: 1.8438, fill: 0.7522, variants: 3, weight: 7,
  build(b, r, v) {
    /* ⚠ THE ONE THE PLAYER NAMED: *"we want someone rolling over a black hole
       for it to look like a black hole and feel some sense of connection."*

       Everything except the hole itself is ghost, and that is what finally
       makes it possible. The old version had to build its accretion disc out
       of eight separate lumps thirty units thick, because one flat annulus
       that wide would have been a wall across a fifth of a region — and eight
       lumps in a circle is a necklace, not a disc. As decoration it can be what
       it actually is: four flat rings, tilted and warped, graded from
       white-hot inside to ember outside, a thin photon ring inside them, and
       two pencil-thin jets out of the poles. */
    const HX = 123.75, HY = 169.8;
    core(b, HX, HY * 0.72, HX, G.event, { y: HY, k: 0.62 });
    b.sphere(44, G.event, { y: HY }, 12, 9);
    b.decor((d) => {
      ring(d, 54, C.chrome, { y: HY, rx: 0.34, tube: 0.05 }, 24);
      ring(d, 49, G.glare, { y: HY, rx: 0.34, tube: 0.022 }, 24);
      gradedDisc(d, 62, HX, [G.glare, G.gold, G.amber, [G.ember, G.rose, G.cyan][v]],
        { y: HY, rx: 0.34, warp: 0.16, rise: 6 }, 4, 26);
      jet(d, HY + 40, HY * 0.9, G.xray, { up: 1, r: 0.02, knots: 3, hot: G.white });
      jet(d, HY - 40, HY * 0.9, G.xray, { up: -1, r: 0.02, knots: 3, hot: G.white });
    });
  } });

/* ==================================================================
   CROWDS — clusters and nurseries
   ================================================================== */

P({ id: 'g_globular', name: 'Globular Cluster', cat: 'cluster', sizeMul: 1.2358, fill: 0.4718, variants: 3, weight: 7,
  build(b, r, v) {
    /* ⚠ MANY AND SMALL. Twenty-two blobs at 6-15% of the cluster's radius is a
       bag of marbles: at that size you count them instead of reading the shape
       they make. A hundred and thirty at 3-6% reads as a crowd, and costs less,
       because a 5x4 sphere is 40 triangles. The bright compact core is the
       other half of the read — a globular is a ball of stars with a blaze in
       the middle, not an even scatter. */
    const R = 160;
    core(b, R, R, R, G.gold, { y: R, k: 0.82, seg: 10, hseg: 8 });
    b.sphere(R * 0.15, G.glare, { y: R }, 9, 7);
    swarm(b, R, R, R, 86, [G.gold, G.white, G.amber, [G.blueWhite, G.rose, G.cyan][v]], r,
      { y: R, lo: 0.03, hi: 0.062, bias: 2.4 });
  } });

P({ id: 'g_opencluster', name: 'Open Cluster', cat: 'cluster', sizeMul: 1.5592, fill: 0.379, variants: 3, weight: 7,
  build(b, r, v) {
    /* Loose and young: few stars, all bright, still sitting in the shredded
       gas they condensed out of. The difference from a globular is that you
       can see between the members — so low bias, and the gas is wisps rather
       than the five fat spheres it used to be. */
    const HX = 168.75, HY = 231.6;
    core(b, HX, HY, HX, [G.indigo, G.dust, G.plum][v], { y: HY, k: 0.66 });
    b.sphere(HX * 0.13, G.white, { y: HY }, 8, 6);
    b.decor((d) => {
      wisps(d, HX, HY * 0.5, HX, 7, [G.indigo, G.dust, G.plum], r,
        { y: HY, head: 0.7 + v, spread: 0.9 });
    });
    swarm(b, HX, HY, HX, 34, [G.blueWhite, G.white, G.blue], r,
      { y: HY, lo: 0.05, hi: 0.1, bias: 1.1 });
  } });

P({ id: 'g_nursery', name: 'Star Nursery', cat: 'birth', fill: 0.15, variants: 3, weight: 6,
  build(b, r, v) {
    const HX = 198, HY = 271.7;
    puff(b, HX, 150, HX, 11, [G.dustWarm, G.dust, [G.plum, G.indigo, G.rose][v]], r,
      { y: 150, lo: 0.24, hi: 0.36 });
    // a pillar standing out of the cloud, and it is what pins the top face
    b.taperOn(26, 62, HY * 2 - 150, G.dustLit, { y: 150 }, 8);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * 6.28 + v;
      b.sphere(HY * 0.075, i % 2 ? G.white : G.gold,
        { x: Math.cos(a) * HX * 0.56, y: 170 + (i % 3) * 64, z: Math.sin(a) * HX * 0.56 }, 7, 5);
    }
    b.sphere(HX * 0.2, G.rose, { x: -HX * 0.3, y: 190, z: HX * 0.24 }, 7, 5);
  } });

/* ==================================================================
   CLOUDS — the big soft things. Low fill, cubic boxes, and the
   collision volume is a dozen separate lumps with gaps between them.
   ================================================================== */

P({ id: 'g_darknebula', name: 'Dark Nebula', cat: 'nebula', fill: 0.09, variants: 3, weight: 6,
  build(b, r, v) {
    const HX = 224.4, HY = 329;
    puff(b, HX, HY, HX, 14, [G.voidDeep, G.void, [G.dust, G.ash, G.plum][v]], r,
      { lo: 0.28, hi: 0.42 });
    // stars caught at the edge, so it reads as a hole rather than a hill
    for (let i = 0; i < 4; i++) {
      const a = r() * 6.28;
      b.sphere(HX * 0.055, G.blueWhite,
        { x: Math.cos(a) * HX * 0.9, y: HY + (r() - 0.5) * HY * 1.2, z: Math.sin(a) * HX * 0.9 }, 6, 4);
    }
  } });

P({ id: 'g_emission', name: 'Emission Nebula', cat: 'nebula', fill: 0.07, variants: 3, weight: 6,
  build(b, r, v) {
    const HX = 259.6, HY = 380.6;
    puff(b, HX, HY, HX, 14, [G.magenta, G.rose, [G.violet, G.ember, G.plum][v]], r,
      { lo: 0.2, hi: 0.34 });
    for (let i = 0; i < 4; i++) {
      const a = r() * 6.28, d = HX * 0.5 * r();
      b.sphere(HX * 0.07, G.white, { x: Math.cos(a) * d, y: HY + (r() - 0.5) * HY, z: Math.sin(a) * d }, 6, 4);
    }
    b.ellip(HX * 0.5, HY * 0.12, HX * 0.16, G.dust, { y: HY * 0.8, ry: 0.6 }, 8, 4);
  } });

P({ id: 'g_reflection', name: 'Reflection Nebula', cat: 'nebula', surface: 'air', flyHeight: 250,
  fill: 0.06, variants: 3, weight: 5,
  build(b, r, v) {
    const HX = 299.2, HY = 438.6;
    puff(b, HX, HY, HX, 14, [G.blue, G.halo, [G.cyan, G.indigo, G.blueDeep][v]], r,
      { lo: 0.2, hi: 0.32 });
    for (let i = 0; i < 4; i++) {
      const a = r() * 6.28, d = HX * 0.55 * r();
      b.sphere(HX * 0.07, G.white, { x: Math.cos(a) * d, y: HY + (r() - 0.5) * HY, z: Math.sin(a) * d }, 6, 4);
    }
  } });

P({ id: 'g_molecular', name: 'Molecular Cloud', cat: 'nebula', fill: 0.08, variants: 3, weight: 5,
  build(b, r, v) {
    const HX = 347.6, HY = 509.6;
    puff(b, HX, HY, HX, 15, [G.voidDeep, G.dust, [G.ash, G.plum, G.dustWarm][v]], r,
      { lo: 0.24, hi: 0.4 });
    // protostars buried in it
    for (let i = 0; i < 4; i++) {
      const a = r() * 6.28, d = HX * 0.6 * r();
      b.sphere(HX * 0.08, G.amber, { x: Math.cos(a) * d, y: HY * (0.5 + r()), z: Math.sin(a) * d }, 6, 4);
    }
  } });

P({ id: 'g_dustlane', name: 'Dust Lane', cat: 'structure', fill: 0.07, variants: 3, weight: 4,
  build(b, r, v) {
    const HX = 418.6, HY = 536.9;
    band(b, HX, HY, HX, 9, [G.void, G.voidDeep, G.dust, [G.ash, G.wallDust, G.dustWarm][v]], r,
      { thick: 0.16, grain: 1.6, knot: G.amber });
  } });

P({ id: 'g_hii', name: 'HII Region', cat: 'nebula', fill: 0.07, variants: 3, weight: 4,
  build(b, r, v) {
    const HX = 457.6, HY = 670.8;
    puff(b, HX, HY, HX, 13, [G.rose, G.magenta, [G.ember, G.violet, G.amber][v]], r,
      { lo: 0.2, hi: 0.34 });
    // the cluster doing the ionising, and two dark pillars pointing at it
    b.sphere(HX * 0.15, G.white, { y: HY }, 8, 6);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * 6.28 + 0.4;
      b.sphere(HX * 0.07, G.blueWhite,
        { x: Math.cos(a) * HX * 0.16, y: HY + Math.sin(a) * HY * 0.2, z: Math.sin(a) * HX * 0.16 }, 6, 4);
    }
    for (let i = 0; i < 2; i++) {
      const a = 1.1 + i * 2.6;
      b.taperOn(HX * 0.05, HX * 0.12, HY * 1.2, G.dust,
        { x: Math.cos(a) * HX * 0.6, y: 0, z: Math.sin(a) * HX * 0.6 }, 7);
    }
  } });

/* ==================================================================
   STRUCTURE — the biggest rungs. Everything here is either a band
   of lumps or a shell of lumps: nothing at this size may be one
   solid piece, because at 1,000ly across a solid piece is a wall.
   ================================================================== */

P({ id: 'g_stream', name: 'Stellar Stream', cat: 'structure', surface: 'air', flyHeight: 420,
  fill: 0.04, variants: 3, weight: 3,
  build(b, r, v) {
    const HX = 542.8, HY = 696.2;
    band(b, HX, HY, HX, 9, [G.gold, G.amber, G.white, [G.blueWhite, G.rose, G.glare][v]], r,
      { thick: 0.11, grain: 1.4, knot: G.white });
  } });

/* 0.1 rather than a nebula's 0.05: this is not a cloud, it is a piece of the
   galaxy — dust, gas and a few million stars — and it is the closest thing this
   catalogue has to the world stage's continents, which is to say it is where a
   quarter of the mass of the whole level lives. */
P({ id: 'g_spiralarm', name: 'Spiral-Arm Fragment', cat: 'structure', fill: 0.1, variants: 3, weight: 3,
  build(b, r, v) {
    const HX = 625.6, HY = 802.4;
    band(b, HX, HY, HX, 9, [G.dust, G.dustLit, G.indigo, [G.plum, G.blueDeep, G.violet][v]], r,
      { thick: 0.2, grain: 1.7, knot: G.rose });
    // the arm's own stars, strung along the inside of the curve
    for (let i = 0; i < 4; i++) {
      const t = -0.75 + i * 0.5;
      b.sphere(HX * 0.11, i % 2 ? G.blueWhite : G.gold,
        { x: t * HX * 0.8, y: HY * 0.9, z: HX * (0.3 - t * t * 0.7) }, 7, 5);
    }
  } });

P({ id: 'g_hypernova', name: 'Hypernova Shell', cat: 'death', fill: 0.06, variants: 2, weight: 2,
  build(b, r, v) {
    const HX = 711, HY = 975.7;
    puff(b, HX, HY, HX, 14, [G.ember, G.emberDk, G.violet, [G.rose, G.magenta][v]], r,
      { shell: 0.5, lo: 0.16, hi: 0.26 });
    /* The ejecta, and the reason this one is not hollow. See the cage note on
       `puff`: at 1,560ly across the hole in a shell is big enough to hold a
       mid-game katamari and the gaps in it are not big enough to let it back
       out. This fills the bottom half of the inside, so a ball is bounced off
       the outside rather than swallowed by it. */
    b.sphere(HX * 0.56, G.emberDk, { y: HX * 0.56 }, 10, 7);
    b.sphere(HX * 0.16, G.xray, { y: HY }, 8, 6);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * 6.28 + v;
      b.box(HX * 0.44, HX * 0.06, HX * 0.06, G.glare,
        { x: Math.cos(a) * HX * 0.45, y: HY + Math.sin(a * 1.7) * HY * 0.4, z: Math.sin(a) * HX * 0.45, ry: -a });
    }
  } });

/* THE TOP RUNG, AND IT HAS TO BE EDIBLE.
 *
 * A prop is collectable when `pickup <= diameter * pickupRatio`, and the
 * largest diameter that can ever exist is set by the stage's own total mass —
 * two numbers authored independently, in different files, which is why it is
 * entirely possible to write something NOTHING can ever swallow. The city
 * shipped with two uneatable mountains and the world stage with an uneatable
 * continent before `balance` learned to print "too big to ever collect".
 *
 * Here: pickup 1,780, so it needs a ball of 2,023ly, against a ceiling of
 * about 2,470ly if you eat the whole galaxy. The stage places it at 1.0-1.06
 * scale, which takes the requirement to 2,145 and leaves ~13% of headroom —
 * the margin a PLAYER needs rather than the margin a perfect bot needs.
 *
 * The two levers pull opposite ways, which is what makes this fiddly: making
 * it smaller lowers the pickup but ALSO lowers the stage's mass, and three of
 * these are 16% of it, so the ceiling comes down too. Raising `fill` adds mass
 * without touching pickup, so that is the lever that buys headroom. Do not
 * change either without re-reading that line out of `balance`. */
P({ id: 'g_smbh', name: 'Supermassive Black Hole', cat: 'exotic', fill: 0.16, variants: 2, weight: 1,
  build(b, r, v) {
    const HX = 801, HY = 1099.2;
    b.sphere(270, G.event, { y: HY }, 12, 8);
    lumpDisc(b, HX - 165, 165, 96, HY,
      [G.glare, G.gold, G.amber, [G.ember, G.rose][v]], 230, 12);
    jetCone(b, HY, HY, 120, G.xray, 1);
    jetCone(b, HY, HY, 120, G.xray, -1);
  } });
