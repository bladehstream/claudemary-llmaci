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

   ⚠ THREE RULES USED TO SHAPE EVERY SHAPE IN THIS FILE. TWO OF
   THEM ARE RETIRED, and they are written out here because the
   file still reads as if they bind, and because the reason they
   are gone is the most useful thing to know before adding a prop.

   1. RETIRED — "nothing big is wider than it is tall". `pickup`
      is the cube root of the bounding box and the collision
      radius is half the longest HORIZONTAL span, so a disc, a
      dust lane and a ring all read as small mouthfuls and behaved
      as fences a third of a region across. Measured at the time:
      66% of the arm fragment's surface sat inside some obstacle's
      footprint and a 250ly katamari spent three minutes wedged on
      it. Everything was therefore stretched vertically instead.
      `{ ghost: true }` measures nothing, so a shape can now be as
      wide and as flat as the thing it is a picture of. What still
      holds is that the SOLID part — the `core` — should stay
      compact and roughly cubic, for exactly the old reason.

   2. STILL BINDING — the box has to be pinned by something. A
      cloud drawn from random blobs measures differently on every
      variant, `pickup` is measured across all of them, and the
      rung drifts. `core` pins it now instead of six anchor blobs:
      one honest ellipsoid, the same on every variant.

   3. RETIRED — "wide things are built out of separate lumps".
      Collision uses one box per primitive, capped at 14, so a disc
      built as eight arcs had seven real gaps a ball could roll
      through where one annulus was a solid plate. Ghost geometry
      is not in `partBoxes` at all, so a single flat annulus is now
      the cheap AND the safe way to draw a disc — it was only ever
      the pretty one.

   ⚠ AND THE RULE THAT REPLACED THEM. Ghosting a prop's body
   shrinks the box the game measures, and `pickup` and `volume`
   both come off that box — the supernova remnant's fell 90% and
   99.9% on the first pass. So every prop whose identity is ghost
   needs a solid `core`, and every change to one needs
   `node tools/reghost.mjs tools/catalogue-baseline.txt --only=galaxy`
   to say the numbers did not move. `fill` is the lever for making
   a small core carry its mass, not `k`: a core big enough to
   satisfy the mass directly is a core big enough to hide the prop
   behind, which has now cost two rebuilds.

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
  spiralArm, swarm, wisps, pillars, sheet, core,
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
   THE FOUR LOCAL BUILDERS THAT USED TO LIVE HERE ARE ALL GONE, and it is
   worth being specific about why, because every one of them was a workaround
   for the same thing and not one of them was about how anything looked.

     puff      a cloud had to be a bag of separate lumps
     band      a lane had to be a row of them
     lumpDisc  a disc had to be broken into arcs
     jetCone   a jet had to be fat, or it measured as nothing

   All four existed because collision measured every triangle a prop drew, so
   the shape a thing wanted and the shape it could afford were different
   shapes. `ghost` retired the reason for all four at once, and their
   replacements in spacekit.js — `wisps`, `shell`, `spiralArm`, `gradedDisc`,
   `jet` — say the same things with a direction, a cavity, a curve and an
   honest thinness.

   Only `spot` and `belt` are still local, and both are additions rather than
   compromises: a marking laid tangent to a surface, and a latitude band.
   ------------------------------------------------------------------ */

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

P({ id: 'g_rogue', name: 'Rogue Planet', cat: 'planet', sizeMul: 1.0258, fill: 0.5395, variants: 3, weight: 12,
  build(b, r, v) {
    /* ⚠ FACETED, AND THAT IS FREE. A sphere at 12x9 is smooth; at 7x6 it is a
       visible polyhedron, costs 40% fewer triangles, and stops this reading as
       the ninth ball in a row. It is also the only PLANET in a stage of stars,
       so looking like a chunk of frozen rock rather than a small sun is the
       correct read as well as the varied one. */
    const R = 8;
    b.sphere(R, [G.dust, G.rust, G.plum][v], { y: R }, 7, 6);
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

P({ id: 'g_browndwarf', name: 'Brown Dwarf', cat: 'star', sizeMul: 0.98479, fill: 0.4775, variants: 3, weight: 12,
  build(b, r, v) {
    /* Faceted at 8x6 rather than smooth at 13x9: a brown dwarf is barely a
       star and mostly a very large planet, and the banding reads better on
       flats than on a curve. Cheaper too. */
    const R = 10.5;
    b.sphere(R, G.rust, { y: R }, 8, 6);
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
P({ id: 'g_whitedwarf', name: 'White Dwarf', cat: 'star', sizeMul: 1.3908, fill: 0.8071, variants: 3, weight: 13,
  build(b, r, v) {
    /* ⚠ WHITE DWARFS CRYSTALLISE. That is not a stylisation — as they cool,
       the carbon-oxygen interior freezes into a lattice, and it was discovered
       in real data. So this one gets to be a faceted solid at 6x5 instead of a
       smooth ball, which is both the honest shape and 45% cheaper on a prop
       placed 217 times. */
    const R = 17;
    core(b, R, R, R, G.blueWhite, { y: R, k: 0.78, seg: 6, hseg: 5 });
    b.sphere(R * 0.4, G.white, { y: R }, 7, 6);
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
    b.decor((d) => ring(d, R * 1.13, cool, { y: R, rx: 0.15, tube: 0.022 }, 22));
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

P({ id: 'g_redgiant', name: 'Red Giant', cat: 'star', sizeMul: 0.96789, fill: 0.4533, variants: 3, weight: 11,
  build(b, r, v) {
    /* ⚠ THE ONE STAR THAT SHOULD NOT BE ROUND. A red giant's convection cells
       are a third the width of the star — Betelgeuse has been imaged and it is
       measurably NOT a circle. Every other star here is a sphere because a
       star is a sphere; this one is a sphere because nobody looked it up.

       The lumps are ghost and straddle the limb, so the SILHOUETTE breaks
       while the solid body is untouched — no change to `pickup`, `volume`,
       collision radius or anything `balance` can feel. That is the cheap way
       to buy a different outline on a prop placed 231 times. */
    const R = 33.5;
    b.sphere(R, G.ember, { y: R }, 12, 8);
    b.decor((d) => {
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU + v * 0.7, e = 0.7 + ((i * 5) % 7) * 0.24;
        const k = R * (0.34 + (i % 3) * 0.09);
        const dx = Math.sin(e) * Math.cos(a), dy = Math.cos(e), dz = Math.sin(e) * Math.sin(a);
        d.ellip(k * 1.25, k, k * 1.25, i % 2 ? G.ember : G.emberDk, {
          x: dx * R * 0.88, y: R + dy * R * 0.88, z: dz * R * 0.88,
        }, 6, 5);
      }
    });
    // a long corona, big loops, and convection cells the size of the star
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
      ring(d, R * 1.22, G.cyan, { y: R * 1.02, rx: 0.22, tube: 0.022 }, 22);
      ring(d, R * 1.34, G.halo, { y: R * 1.0, rx: 0.07, rz: 0.4, tube: 0.016 }, 22);
      /* ⚠ A BOW SHOCK, because most blue supergiants are runaways — kicked out
         of the cluster that made them and ploughing through the interstellar
         medium fast enough to pile it up in front. It is the one feature that
         makes this silhouette not-a-ball, and `sheet()` (added for the solar
         stage's shock fronts) is exactly the primitive for it. Ghost, so the
         solid body and every number off it are untouched. */
      sheet(d, R * 1.62, R * 0.92, 1.65, G.halo,
        { y: R * 0.42, t: 0.03, bow: 0.26, phi0: v * 2.1 }, 16);
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

P({ id: 'g_bok', name: 'Bok Globule', cat: 'birth', sizeMul: 1.1771, fill: 0.5708, variants: 3, weight: 9,
  build(b, r, v) {
    /* ⚠ 171 INSTANCES — THE LEANEST PROP IN THE STAGE'S BUDGET. It is 6% of
       every triangle the galaxy draws, more than the black hole and the
       supermassive hole put together, so anything spent here is spent 171
       times. It goes to `wisps` not for detail but because directional shards
       cost fewer triangles than round blobs at the same apparent size, and a
       globule that is drifting reads better than a heap that is not.

       What it IS: a small dark cloud silhouetted against something bright,
       being boiled away from one side. So it is dark, it has a heading, and
       the erosion is rim-lighting on the windward face — three cheap facts. */
    const R = 60;
    const lit = [G.rose, G.amber, G.magenta][v];
    wisps(b, R, R * 0.94, R, 9, [G.void, G.dust, G.ash], r,
      { y: R, head: 0.5 + v * 1.3, spread: 0.75, solid: true });
    b.decor((d) => {
      for (let i = 0; i < 3; i++) {
        const a = (0.5 + v * 1.3) + (i - 1) * 0.55;
        d.sphere(R * 0.13, lit,
          { x: Math.cos(a) * R * 0.82, y: R + (i - 1) * R * 0.3, z: Math.sin(a) * R * 0.82 }, 6, 4);
      }
    });
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
      ring(d, R * 0.3, G.rose, { y: R, rx: 0.42, tube: 0.05 }, 22);
      gradedDisc(d, R * 0.42, R * 0.96, [G.cyan, hot, G.magenta, G.violet],
        { y: R, rx: 0.42, warp: 0.12 }, 4, 24);
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
      ring(d, HX * 0.92, [G.cyan, G.teal, G.halo][v], { y: HY, rx: 0.18, tube: 0.03 }, 24);
      ring(d, HX * 0.62, G.halo, { y: HY, rx: 0.1, rz: 0.3, tube: 0.02 }, 22);
      jet(d, HY + 12, HY * 0.92, G.blueWhite, { up: 1, r: 0.022, knots: 3, hot: G.white });
      jet(d, HY - 12, HY * 0.92, G.blueWhite, { up: -1, r: 0.022, knots: 3, hot: G.white });
    });
  } });

P({ id: 'g_pulsar', name: 'Pulsar', cat: 'death', surface: 'air', flyHeight: 120,
  sizeMul: 1.9665, fill: 0.4563, variants: 3, weight: 7,
  build(b, r, v) {
    /* ⚠ 97 INSTANCES, SO THIS ONE GETS CHEAPER, NOT RICHER. The budget in this
       stage is instance count, not archetype count: the supermassive hole is
       placed three times and can afford to be lavish, this is placed
       ninety-seven and cannot. It went 704 -> ~470 triangles and reads better,
       because ten blobs of magnetosphere were spending most of that on the
       part nobody looks at.

       All the drama in a pulsar is a RATIO — a city-sized object throwing
       beams a light year long — so the dot stays small and the beams stay
       thin. They are cones rather than `jet`s on purpose: a pulsar's beams are
       emission opening out from the magnetic poles, not collimated matter, and
       they are the one place in this file where a cone is the honest shape. */
    const HX = 102.2, HY = 155.2, K = 0.62;
    const tint = [G.teal, G.plum, G.blueDeep][v];
    core(b, HX, HY * 0.62, HX, G.indigo, { y: HY, k: K });
    b.sphere(11, G.white, { y: HY }, 8, 6);
    b.decor((d) => {
      const ph = 0.34, L = HY * 1.5;
      for (const s of [1, -1]) {
        d.cyl(HX * 0.13, 0.8, L, G.cyan, {
          x: s * Math.sin(ph) * L * 0.5, y: HY + s * Math.cos(ph) * L * 0.5,
          rz: s > 0 ? -ph : Math.PI - ph, ghost: true,
        }, 7);
      }
      // the field, edge-on to the beams
      ring(d, HX * 0.86, tint, { y: HY, rx: 0.14, tube: 0.022 }, 18);
    });
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
    /* ⚠ EVERY RADIUS HERE IS MEASURED AGAINST THE CORE, NOT AGAINST HX.
       `core(k: 0.62)` draws the ellipsoid that IS the black sphere on screen,
       at 0.62 * HX = 76.7. The first draft put the photon rings at 54 and 49
       and an event-horizon sphere at 44 — all three entirely inside that,
       drawn every frame and never once visible, and the disc's inner sixth
       was buried with them. About 680 triangles per instance rendering the
       inside of an opaque ball. The bright ring hugging the dark circle is
       the single most recognisable thing about a black hole, and it was in
       the file, and nobody could see it.

       ⚠ AND THE RINGS WERE PERPENDICULAR TO THEIR OWN DISC. `ring()` is a
       torus and `b.torus` builds in the XY plane (vertical); `annulus()` is
       a lathe about Y and builds in XZ (horizontal). Passing both the same
       `rx: 0.34` tilts one from flat and the other from upright, leaving them
       90 degrees apart. A ring meant to lie in the disc needs
       `rx: PI/2 + tilt`. */
    const HX = 123.75, HY = 169.8, R = HX * 0.62, TILT = 0.34;
    core(b, HX, HY * 0.72, HX, G.event, { y: HY, k: 0.62 });
    b.decor((d) => {
      ring(d, R * 1.05, C.chrome, { y: HY, rx: TILT, tube: 0.03 }, 24);
      gradedDisc(d, R * 1.16, HX * 1.16, [G.glare, G.gold, G.amber, [G.ember, G.rose, G.cyan][v]],
        { y: HY, rx: TILT, warp: 0.16, rise: 6 }, 4, 26);
      jet(d, HY + R * 0.5, HY * 0.9, G.xray, { up: 1, r: 0.02, knots: 3, hot: G.white });
      jet(d, HY - R * 0.5, HY * 0.9, G.xray, { up: -1, r: 0.02, knots: 3, hot: G.white });
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

P({ id: 'g_opencluster', name: 'Open Cluster', cat: 'cluster', sizeMul: 1.4404, fill: 0.2988, variants: 3, weight: 7,
  build(b, r, v) {
    /* Loose and young: few stars, all bright, still sitting in the shredded
       gas they condensed out of. The difference from a globular is that you
       can see between the members — so low bias, and the gas is wisps rather
       than the five fat spheres it used to be. */
    const HX = 168.75, HY = 231.6;
    wisps(b, HX, HY * 0.62, HX, 8, [G.indigo, G.dust, G.plum], r,
      { y: HY, head: 0.7 + v, spread: 0.9, solid: true });
    b.sphere(HX * 0.13, G.white, { y: HY }, 8, 6);
    swarm(b, HX, HY, HX, 34, [G.blueWhite, G.white, G.blue], r,
      { y: HY, lo: 0.05, hi: 0.1, bias: 1.1 });
  } });

P({ id: 'g_nursery', name: 'Star Nursery', cat: 'birth', sizeMul: 1.0913, fill: 0.1949, variants: 3, weight: 6,
  build(b, r, v) {
    /* ONE pillar was standing in for the shape everybody knows from a
       photograph, and one pillar is a chimney. `pillars` is in spacekit for
       exactly this: a stand of them, tapered, leaning away from whatever is
       eating them, each with a lit tip where the gas is being boiled off.
       That, the cloud they rise out of and the cluster doing the boiling are
       the three things that make a nursery recognisable.

       The cloud stays SOLID — it is a lumpy solid and always was safe as one,
       and ghosting it would need a core big enough to hide the pillars. Only
       the pillars and the young stars are decoration. */
    const HX = 198, HY = 271.7, FLOOR = 150;
    const tint = [G.plum, G.indigo, G.rose][v];
    wisps(b, HX, FLOOR * 0.62, HX, 10, [G.dustWarm, G.dust, tint], r,
      { y: FLOOR * 0.8, head: 0.6 + v, spread: 0.85, solid: true });
    // one solid stack, so the top face of the box is pinned by something real
    b.taperOn(24, 58, HY * 2 - FLOOR, G.dustLit, { y: FLOOR }, 8);
    b.decor((d) => {
      pillars(d, HX * 0.78, HY * 1.25, 5, G.dustLit, G.glare, r, { y: FLOOR * 0.7 });
      // the cluster doing the eating, above the stand
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU + v;
        d.sphere(HY * (0.055 + (i % 3) * 0.016), i % 2 ? G.white : G.gold, {
          x: Math.cos(a) * HX * 0.5, y: HY * 1.24 + (i % 3) * HY * 0.16, z: Math.sin(a) * HX * 0.5,
        }, 6, 5);
      }
      d.ellip(HX * 0.22, HX * 0.15, HX * 0.22, G.rose,
        { x: -HX * 0.3, y: HY * 1.1, z: HX * 0.24 }, 7, 5);
    });
  } });

/* ==================================================================
   CLOUDS — the big soft things. Low fill, cubic boxes, and the
   collision volume is a dozen separate lumps with gaps between them.
   ================================================================== */

P({ id: 'g_darknebula', name: 'Dark Nebula', cat: 'nebula', sizeMul: 1.2597, fill: 0.1799, variants: 3, weight: 6,
  build(b, r, v) {
    /* A cloud IS amorphous, so this stays soft — but soft along a HEADING.
       Fourteen spheres scattered at random have no direction and read as a
       heap; the same volume as overlapping shards laid along one axis reads as
       something drifting. The rim stars are what make it a hole rather than a
       hill. */
    const HX = 224.4, HY = 329;
    wisps(b, HX, HY * 0.72, HX, 13, [G.voidDeep, G.void, [G.dust, G.ash, G.plum][v]], r,
      { y: HY, head: 0.5 + v * 1.1, spread: 0.7, solid: true });
    b.decor((d) => {
      for (let i = 0; i < 6; i++) {
        const a = r() * TAU;
        d.sphere(HX * 0.05, G.blueWhite,
          { x: Math.cos(a) * HX * 0.94, y: HY + (r() - 0.5) * HY * 1.3, z: Math.sin(a) * HX * 0.94 }, 5, 4);
      }
    });
  } });

P({ id: 'g_emission', name: 'Emission Nebula', cat: 'nebula', sizeMul: 1.2966, fill: 0.1526, variants: 3, weight: 6,
  build(b, r, v) {
    /* Gas lit from inside by the stars that just formed in it: a bright
       cavity wall, the young cluster in the middle, and a dark lane cutting
       across — the three things that make one recognisable. */
    const HX = 259.6, HY = 380.6;
    const tint = [G.violet, G.ember, G.plum][v];
    wisps(b, HX, HY * 0.72, HX, 11, [G.rose, G.magenta, tint], r,
      { y: HY, head: v * 1.4, spread: 0.8, solid: true });
    b.decor((d) => {
      for (let i = 0; i < 6; i++) {
        const a = r() * TAU, dd = HX * 0.45 * r();
        d.sphere(HX * 0.06, G.white, { x: Math.cos(a) * dd, y: HY + (r() - 0.5) * HY * 0.8, z: Math.sin(a) * dd }, 5, 4);
      }
      d.ellip(HX * 0.62, HY * 0.09, HX * 0.13, G.dust, { y: HY * 0.86, ry: 0.6 }, 7, 4);
    });
  } });

P({ id: 'g_reflection', name: 'Reflection Nebula', cat: 'nebula', surface: 'air', flyHeight: 250,
  sizeMul: 1.1702, fill: 0.09615, variants: 3, weight: 5,
  build(b, r, v) {
    /* The only nebula in the catalogue that is not lit from within: this is
       plain dust that happens to be next to a bright star, scattering its
       light back at you — which is why they are blue, and why the star is
       OUTSIDE the cloud rather than buried in it. So the star sits proud on
       one flank, the near side is bright and the far side falls away to the
       dust it actually is. Fourteen even spheres could say none of that.

       Solid, like the other clouds: lumpy and safe as one. */
    const HX = 299.2, HY = 438.6;
    const tint = [G.cyan, G.indigo, G.blueDeep][v];
    wisps(b, HX, HY * 0.86, HX, 13, [G.blue, G.halo, tint], r,
      { y: HY, head: 0.4 + v * 1.2, spread: 0.8, solid: true });
    b.decor((d) => {
      // the illuminating star, off to one side and outside the gas
      const a = 0.6 + v * 2.1;
      const sx = Math.cos(a) * HX * 1.45, sz = Math.sin(a) * HX * 1.45;
      d.sphere(HX * 0.15, G.white, { x: sx, y: HY * 1.3, z: sz }, 9, 7);
      d.sphere(HX * 0.27, G.halo, { x: sx, y: HY * 1.3, z: sz }, 7, 5);
      // the lit face, brightest nearest the star
      for (let i = 0; i < 5; i++) {
        const t = i / 4, aa = a + (t - 0.5) * 1.5;
        d.ellip(HX * 0.2, HX * 0.13, HX * 0.2, i % 2 ? G.halo : G.blue, {
          x: Math.cos(aa) * HX * 0.66, y: HY * (0.9 + t * 0.3), z: Math.sin(aa) * HX * 0.66,
        }, 6, 5);
      }
    });
  } });

P({ id: 'g_molecular', name: 'Molecular Cloud', cat: 'nebula', sizeMul: 1.2805, fill: 0.168, variants: 3, weight: 5,
  build(b, r, v) {
    /* The biggest cold thing in the stage: long, dark, filamentary, with
       stars igniting inside it. Drifting along one axis for the same reason as
       the dark nebula. */
    const HX = 347.6, HY = 509.6;
    wisps(b, HX, HY * 0.75, HX, 15, [G.voidDeep, G.dust, [G.ash, G.plum, G.dustWarm][v]], r,
      { y: HY, head: 1.1 + v * 0.9, spread: 0.85, solid: true });
    b.decor((d) => {
      for (let i = 0; i < 5; i++) {
        const a = r() * TAU, dd = HX * 0.6 * r();
        d.sphere(HX * 0.07, G.amber, { x: Math.cos(a) * dd, y: HY * (0.5 + r()), z: Math.sin(a) * dd }, 5, 4);
      }
    });
  } });

P({ id: 'g_dustlane', name: 'Dust Lane', cat: 'structure', sizeMul: 2.3782, fill: 0.9416, variants: 3, weight: 4,
  build(b, r, v) {
    /* ⚠ THE PROP RULE 1 OF THE OLD HEADER WAS WRITTEN ABOUT. A dust lane is
       the definitive wide-and-flat object — it is a lane, it has no business
       being as tall as it is broad — and the whole reason it was nine fat
       lumps in a row is that a genuinely flat one would have been a wall
       across a fifth of a region. `ghost` is what that rule was waiting for.

       So it is what it is now: a long thin ribbon of dark dust lying across
       the plane, silhouetted, with the far-side starlight it is blocking
       showing through the gaps. Its collision is a compact core, and a ball
       rolls straight over the lane instead of along it. */
    /* ⚠ THE CORE HAS TO BE SMALL ENOUGH THAT THE LANE IS THE SILHOUETTE.
       First pass used k 0.5, and a 209-unit dark ball next to a 469-unit dark
       lane is not a lane, it is a ball with a wisp on it — the same "opaque
       core hides the prop" fault as the hypernova, in its third costume.
       `fill` is the lever: 0.43 puts the core at 180 against a lane 795 long,
       a ratio of four and a half to one, and 0.43 is as small as it goes
       before `fill` passes 1. */
    const HX = 418.6, HY = 536.9, K = 0.43;
    const tint = [G.ash, G.wallDust, G.dustWarm][v];
    core(b, HX, HY, HX, G.voidDeep, { y: HY, k: K });
    b.decor((d) => {
      // the lane: long, thin, and lying across the plane rather than in it
      wisps(d, HX * 1.9, HY * 0.15, HX * 0.3, 18,
        [G.void, G.voidDeep, G.dust, tint], r, { y: HY, head: 0.2, spread: 0.16 });
      // the starlight it is standing in front of, showing through the gaps
      for (let i = 0; i < 9; i++) {
        const t = i / 8;
        d.sphere(HX * (0.05 + (i % 3) * 0.02), i % 3 ? G.amber : G.gold, {
          x: (t - 0.5) * HX * 3.1, y: HY + Math.sin(t * 5 + v) * HY * 0.2,
          z: Math.cos(t * 3.5) * HX * 0.34, ghost: true,
        }, 5, 4);
      }
    });
  } });

P({ id: 'g_hii', name: 'HII Region', cat: 'nebula', sizeMul: 1.4076, fill: 0.1952, variants: 3, weight: 4,
  build(b, r, v) {
    /* PILLARS. This is the one shape in the stage that everybody has already
       seen a photograph of, and the old build spent thirteen spheres on gas
       and two thin cones on the pillars — exactly backwards. Now the pillars
       are the silhouette: tall, tapered, leaning away from the cluster that is
       eating them, each with a lit tip. */
    const HX = 457.6, HY = 670.8;
    const tint = [G.ember, G.violet, G.amber][v];
    wisps(b, HX, HY * 0.66, HX, 9, [G.magenta, tint, G.rose], r,
      { y: HY, head: v, spread: 0.9, solid: true });
    b.sphere(HX * 0.15, G.white, { y: HY }, 9, 7);
    b.decor((d) => {
      pillars(d, HX * 0.82, HY * 1.5, 7, G.dust, G.rose, r, { y: 0 });
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * TAU + 0.4;
        d.sphere(HX * 0.06, G.blueWhite,
          { x: Math.cos(a) * HX * 0.18, y: HY + Math.sin(a) * HY * 0.22, z: Math.sin(a) * HX * 0.18 }, 5, 4);
      }
    });
  } });

/* ==================================================================
   STRUCTURE — the biggest rungs. Everything here is either a band
   of lumps or a shell of lumps: nothing at this size may be one
   solid piece, because at 1,000ly across a solid piece is a wall.
   ================================================================== */

P({ id: 'g_stream', name: 'Stellar Stream', cat: 'structure', surface: 'air', flyHeight: 420,
  sizeMul: 1.9703, fill: 0.3060, variants: 3, weight: 3,
  build(b, r, v) {
    /* A tidal stream is a dwarf galaxy that came too close and got pulled out
       into a thread — so it is a CURVE, and a curve is the one thing nine
       lumps in a row cannot be. `spiralArm` walks a logarithmic spiral and
       turns each element to lie along the tangent, which is the entire shape.
       Two arcs, one long and one short, because a stream has a leading and a
       trailing arm either side of what is left of the progenitor.

       Its elements are stars here rather than the dust lumps the helper was
       written for, so they are small and bright: `w: 0.045` against the 0.1
       default. This is `spiralArm`'s first use anywhere — it was written for
       the universe's galaxies and has sat unexercised since. */
    const HX = 542.8, HY = 696.2, K = 0.52;
    const hot = [G.blueWhite, G.rose, G.glare][v];
    core(b, HX, HY, HX, G.dust, { y: HY, k: K });
    b.decor((d) => {
      spiralArm(d, HX * 0.24, HX * 1.16, 0.4, 2.5, [G.gold, G.white, hot, G.amber],
        { y: HY, w: 0.045, h: 0.9 }, 20);
      spiralArm(d, HX * 0.2, HX * 0.82, 0.4 + Math.PI, 1.9, [G.amber, hot, G.gold],
        { y: HY * 1.06, w: 0.04, h: 0.9 }, 14);
      d.ellip(HX * 0.12, HX * 0.09, HX * 0.12, G.white, { y: HY, ghost: true }, 8, 6);
    });
  } });

/* 0.1 rather than a nebula's 0.05: this is not a cloud, it is a piece of the
   galaxy — dust, gas and a few million stars — and it is the closest thing this
   catalogue has to the world stage's continents, which is to say it is where a
   quarter of the mass of the whole level lives. */
P({ id: 'g_spiralarm', name: 'Spiral-Arm Fragment', cat: 'structure', sizeMul: 1.8235, fill: 0.6063, variants: 3, weight: 3,
  build(b, r, v) {
    /* The thing this is a fragment OF is a spiral, so the fragment is a piece
       of spiral: one heavy dust arc with a second, fainter one inside it, and
       the arm's own star formation strung along the leading edge where the
       compression happens. That last detail is the whole reason an arm is
       bright — it is not more stars, it is younger ones, in a line. */
    const HX = 625.6, HY = 802.4, K = 0.56;
    const tint = [G.plum, G.blueDeep, G.violet][v];
    core(b, HX, HY, HX, G.dust, { y: HY, k: K });
    b.decor((d) => {
      spiralArm(d, HX * 0.3, HX * 1.1, 0.2, 1.75, [G.dust, G.dustLit, tint, G.indigo],
        { y: HY, w: 0.15, h: 0.44 }, 18);
      spiralArm(d, HX * 0.26, HX * 0.86, 0.2 + 2.6, 1.5, [G.dust, G.indigo, tint],
        { y: HY * 0.94, w: 0.11, h: 0.4 }, 14);
      // young clusters on the leading edge, and the HII they light
      for (let i = 0; i < 6; i++) {
        const t = i / 5, a = 0.34 + 1.6 * t, dd = HX * (0.34 + 0.72 * Math.pow(t, 0.78));
        d.sphere(HX * (0.055 - t * 0.018), i % 2 ? G.blueWhite : G.white,
          { x: Math.cos(a) * dd, y: HY * 1.02, z: Math.sin(a) * dd, ghost: true }, 6, 5);
        if (i % 2) {
          d.ellip(HX * 0.075, HX * 0.05, HX * 0.075, G.rose,
            { x: Math.cos(a) * dd * 0.94, y: HY * 1.02, z: Math.sin(a) * dd * 0.94, ghost: true }, 6, 4);
        }
      }
    });
  } });

P({ id: 'g_hypernova', name: 'Hypernova Shell', cat: 'death', sizeMul: 2.3917, fill: 0.8209, variants: 2, weight: 2,
  build(b, r, v) {
    /* ⚠ THE CAGE NOTE ON `puff` IS WHAT THIS PROP WAS BUILT AROUND, AND IT NO
       LONGER APPLIES. The old comment here reads: "at 1,560ly across the hole
       in a shell is big enough to hold a mid-game katamari and the gaps in it
       are not big enough to let it back out", and the fix was to fill the
       bottom half of the inside with a solid sphere so a ball bounced off
       rather than fell in. That is a workaround for a collision problem, and
       `ghost` deletes the problem: the shell is a picture, `core` is the
       collision, and nothing can be trapped by a drawing.

       What it can be instead is the shape a hypernova actually makes. Not the
       supernova remnant's even bubble — this one is jet-driven, so it is
       BIPOLAR: a shell pinched at the waist and stretched along the poles,
       with the equatorial ring that everybody has seen a photograph of round
       the middle, and the jets that did it still coming out of both ends.
       That is three legible differences from `g_remnant` at a glance, which
       is the whole job at 1,400ly. */
    /* ⚠ AND THE CORE HAS TO BE SMALL ENOUGH TO SEE PAST. First attempt used
       `k: 0.72`, which is what the mass wants at `fill` 0.21 — and rendered a
       solid dark-red egg with a ring round it. The cavity, the two lobes and
       the whole point were behind an opaque ball. This is the same mistake the
       clouds already cost once ("the core is an opaque egg two thirds the
       width of the prop that hides the very wisps it stands in for"), made
       again by someone who had just read that sentence.
       `fill` is the lever, not `k`: at `k: 0.46` the box is a quarter of the
       volume, so `fill` goes to 0.86 and carries the same mass out of a core
       small enough to sit inside the cavity instead of filling it. `fill` has
       to stay under 1, and 0.86 is the practical floor for `k` on this prop. */
    const HX = 711, HY = 975.7, tint = [G.rose, G.magenta][v];
    const LOBE = HX * 0.62, OFF = HX * 0.55;
    core(b, HX, HY * 0.8, HX, G.rust, { y: HY, k: 0.46 });
    b.sphere(HX * 0.08, G.xray, { y: HY }, 8, 6);
    b.decor((d) => {
      /* Two lobes opening towards each other, not one stretched sphere. `rx:
         PI` turns the upper one over so its mouth faces the waist. */
      shell(d, LOBE, G.emberDk, { y: HY + OFF, th: 0.05, open: 0.44, rx: Math.PI }, 20);
      shell(d, LOBE, G.emberDk, { y: HY - OFF, th: 0.05, open: 0.44 }, 20);
      shell(d, LOBE * 0.7, tint, { y: HY + OFF * 0.92, th: 0.05, open: 0.5, rx: Math.PI }, 16);
      shell(d, LOBE * 0.7, tint, { y: HY - OFF * 0.92, th: 0.05, open: 0.5 }, 16);
      /* The waist. A ring here is only possible because a ring is no longer a
         fence — this is the exact shape rule 3 of the old header forbade. */
      ring(d, HX * 1.0, G.glare, { y: HY, rx: 0.16, tube: 0.03 }, 30);
      gradedDisc(d, HX * 0.88, HX * 1.14, [tint, G.ember, G.emberDk],
        { y: HY, rx: 0.16, warp: 0.06 }, 3, 28);
      jet(d, HY + HX * 0.95, HY * 0.7, G.xray,
        { up: 1, r: 0.022, knots: 3, hot: G.white, lobe: 0.07 });
      jet(d, HY - HX * 0.95, HY * 0.7, G.xray,
        { up: -1, r: 0.022, knots: 3, hot: G.white, lobe: 0.07 });
      // ejecta whipping off the shock front, along the waist
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU + v, e = (r() - 0.5) * 1.2;
        d.ellip(HX * 0.26, HX * 0.03, HX * 0.03, G.glare, {
          x: Math.cos(a) * HX * 0.95, y: HY + e * HY * 0.42, z: Math.sin(a) * HX * 0.95, ry: -a,
        }, 5, 4);
      }
    });
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
P({ id: 'g_smbh', name: 'Supermassive Black Hole', cat: 'exotic', sizeMul: 1.5896, fill: 0.6427, variants: 2, weight: 1,
  build(b, r, v) {
    /* The same object as `g_blackhole` four thousand times over, and it has
       to READ as more than a bigger copy. Three things separate them, all of
       them things you would actually see:

       the disc is proportionally far wider — a stellar-mass hole's disc is a
       collar, a supermassive one's is a plate reaching well past the hole;
       it is graded over five steps rather than four, so the temperature
       gradient from white-hot to ember is legible across that width; and the
       jets end in LOBES, which is the signature of the thing — the plumes
       where a jet finally rams into the intergalactic medium, and the reason
       these are visible from other galaxies.

       ⚠ IT IS AFFORDABLE TO BE LAVISH HERE AND NOWHERE ELSE. The stage
       places three of these. At 3 instances a 3,000-triangle prop costs 9k
       against a 642k budget, where `g_bok` at 171 instances cannot afford
       200 extra triangles. Spend the detail where the instance count is
       small; that is the whole shape of this stage's budget. */
    /* ⚠ `k` IS SET BY THE MASS, NOT BY THE LOOK. At the 0.62 that suits
       `g_blackhole` this prop's measured box is 939 x 954 x 981, giving a
       boxVol of 8.79e8 against the 8.85e8 of `volume` it has to carry — so
       `reghost` printed `fill: 1.006 ⚠ CLAMPED AT 1`, a hair short of
       impossible. Note the box is smaller than 2*HX*k: a 9-segment ellipsoid
       does not reach its own nominal radius, which is 5% of the width and all
       of the shortfall. 0.72 leaves fill at 0.64 and room to move. */
    const HX = 801, HY = 1099.2, K = 0.72, R = HX * K, TILT = 0.26;
    core(b, HX, HY * 0.72, HX, G.event, { y: HY, k: K });
    b.decor((d) => {
      ring(d, R * 1.04, C.chrome, { y: HY, rx: TILT, tube: 0.02 }, 30);
      ring(d, R * 1.1, G.glare, { y: HY, rx: TILT, tube: 0.01 }, 30);
      gradedDisc(d, R * 1.2, HX * 1.42,
        [G.glare, G.white, G.gold, G.amber, [G.ember, G.rose][v]],
        { y: HY, rx: TILT, warp: 0.13, rise: 30 }, 5, 32);
      jet(d, HY + R * 0.55, HY * 1.15, G.xray,
        { up: 1, r: 0.014, knots: 4, hot: G.white, lobe: 0.085 });
      jet(d, HY - R * 0.55, HY * 1.15, G.xray,
        { up: -1, r: 0.014, knots: 4, hot: G.white, lobe: 0.085 });
    });
  } });
