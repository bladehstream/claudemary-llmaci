/* ============================================================
   Props for The Universe — the last catalogue in the game.

   15Mpc to 2,350Mpc, and every one of them is a SILHOUETTE. At a
   megaparsec to the world unit the camera sits tens of thousands
   of megaparsecs back, so a galaxy is a lens and four knots, a
   cluster is twenty blobs, and any detail below that is vertices
   thrown into the dark. The stage carries ~3,300 of these at once.

   THE LADDER. `pickup` is the cube root of the bounding box, so
   every archetype's span is chosen to land on a rung about 13%
   above the one below it, unbroken from 15Mpc to 2,350Mpc — well
   inside the 1.55x that `tools/balance.mjs` calls a hole. Those
   spans live in ONE table (`SP`) precisely so a rung can be moved
   by editing one number: each builder scales linearly off its
   entry, so `pickup` is exactly proportional to it and a rung at
   twice the number is a rung at twice the size.

   MASS LIVES AT THE TOP AND THERE IS NOTHING TO BE DONE ABOUT IT.
   Growth counts `boxVol * fill` and boxVol is pickup cubed, so
   `u_complex`, `u_attractor`, `u_supercluster` and `u_core` carry
   two thirds of the universe between them and everything from a
   dwarf spheroidal to a galaxy group is texture. Re-size anything
   above `u_cluster` and re-run
   `node tools/balance.mjs 0.9 --runs=9 --only=universe`, then read
   the `size ceiling` and `too big to ever collect` lines: a prop
   needs a ball of `pickup / 0.88` and the biggest ball that can
   ever exist is set by the same stage's total mass. The two
   numbers are authored independently and they can cross.

   SOLID OR OPEN, NEVER A MAZE. The obstacle test uses one
   axis-aligned box per primitive the builder stacked, so a swarm of
   twenty blobs is twenty separate walls with pockets between them —
   and a katamari that rolls into one of those pockets and then grows
   is stuck there for the rest of the run. Measured: two of three bot
   runs ended wedged inside a protocluster or in the gap between a
   cluster and a group, at a third of the goal, with six minutes
   left. So every group, cluster, supercluster and complex gets one
   `envelope` ellipsoid sized to hold everything else it draws: the
   collision simplifier keeps the biggest box and drops what is
   inside it, so the whole thing is ONE convex obstacle you bounce
   off and later swallow.

   The genuinely open ones are the SHEETS and CHAINS — a shock front,
   a wall of galaxies, a filament strand. Those are arcs and lines
   with no interior to be trapped in. The void is the third kind: a
   closed rim of touching clumps around a piece of nothing, so it
   reads hollow from outside and above and there is no way in.

   `unit: U` on every one of them. Without it the collection log
   prints a supercluster as a bare number in the same column as a
   dwarf galaxy.
   ============================================================ */

import { defineProp } from './index.js';
import { C } from '../../render/palette.js';

const U = 'cosmic';
const TAU = Math.PI * 2;

/** Tag, category default and unit are all load-bearing; none is optional. */
const P = (def) => defineProp({ cat: 'universe', tags: ['universe'], unit: U, ...def });

/* ------------------------------------------------------------------
   THE DARKEST PALETTE IN THE GAME.

   Not in render/palette.js on purpose: that set is a toy box of bright
   plastics and brick, shared with eight other stages, and none of them wants
   a colour this close to black. Four families and nothing else —

     the dark    : near-black with the faintest blue or violet in it
     old and red : the gold and dim red of ellipticals, stars long finished
     young and hot: cold blue-white, the spirals and the protoclusters
     invisible   : the greys that stand in for gas, plasma and dark matter

   Exported so the stage's terrain can paint its voids and its filaments out of
   the same tin as the props standing on them. Nothing else should reach for it.
   ------------------------------------------------------------------ */
export const U_ = {
  /* the dark */
  space:     0x04030a,
  spaceLit:  0x0a0816,
  ink:       0x07060e,
  slate:     0x14131d,
  slateLit:  0x1e1d2a,

  /* the voids — a little violet, and nothing else */
  hollow:    0x100b1e,
  hollowRim: 0x1b1233,
  violet:    0x2e1d55,
  violetDim: 0x190f30,

  /* old, red, finished */
  gold:      0xa8813a,
  goldDim:   0x6b5127,
  goldPale:  0xd8bb79,
  amber:     0xc99a45,
  red:       0x7d3527,
  redDim:    0x4b2018,
  ember:     0xb4552e,

  /* young, hot */
  blue:      0x7fa8cf,
  bluePale:  0xcfe2f5,
  blueDim:   0x36536f,
  cyan:      0x4a8b9c,
  ice:       0xeaf2ff,

  /* what you cannot see */
  halo:      0x1a2233,
  haloLit:   0x28344b,
  shock:     0xc4703c,
  glow:      0xf3f7ff,
  jet:       0x9fd4e8,
  radio:     0x5b4a86,
};

/* ------------------------------------------------------------------
   SPANS — the growth ladder, as thirty numbers.

   Each is the half-width its builder works from. `pickup` comes out at
   roughly 1.1x to 1.8x the entry depending on how tall the thing is, and is
   exactly linear in it, so a rung is moved by multiplying one line by the
   ratio you want. The measured ladder these produce steps up by 12-14% a rung
   from 15Mpc to 1,750Mpc and then 1.34x to the complex at the top; the stage's
   scatter scale ranges fill in between the rungs.
   ------------------------------------------------------------------ */
const SP = {
  dsph: 8.46,           //   15Mpc
  dwarf: 12.6,          //   21
  irregular: 18.3,      //   29
  spiral: 27.5,         //   40
  barred: 36.1,         //   52
  lenticular: 46.3,     //   65
  elliptical: 50.3,     //   80
  quasar: 48.5,         //   98
  giantell: 78.6,       //  120
  pair: 128.3,          //  145
  lyman: 108.6,         //  172
  merger: 238.8,        //  205
  agn: 105.2,           //  240
  compact: 197.5,       //  285
  lobes: 259.7,         //  330
  lens: 340.3,          //  385
  group: 321.9,         //  445
  ripple: 371.5,        //  515
  halo: 401.3,          //  590
  shock: 479.9,         //  670
  cluster: 524.1,       //  760
  void: 648.7,          //  860
  protocluster: 674.1,  //  965
  core: 721.6,          // 1090
  filament: 1094.4,     // 1230
  wall: 1040.3,         // 1380
  supercluster: 1088.1, // 1550
  attractor: 1159.4,    // 1750
  complex: 1609.4,      // 2350
};

/* ------------------------------------------------------------------
   Shared shapes. A galaxy group, a cluster, a protocluster and a
   supercluster complex are the same drawing four times over at four sizes,
   and writing that four times over is how the four end up inconsistent.
   ------------------------------------------------------------------ */

/**
 * The faint outer envelope of a compact object — and the thing that FIXES its
 * bounding box, since everything else is drawn inside it. One ellipsoid, so
 * the collision volume of a galaxy is one blob, which is what a galaxy is.
 * Only compact things get this; see the note at the top of the file.
 */
function envelope(b, R, H, col, squash = 1) {
  b.ellip(R, H * 0.5, R * squash, col, { y: H * 0.5 }, 9, 6);
}

/**
 * `n` little galaxies filling a lens of radius R and height H, crowded toward
 * the middle by `bias`. The workhorse behind every group and cluster.
 */
function swarm(b, R, H, n, cols, rnd, sMin, sMax, bias = 1.7) {
  for (let i = 0; i < n; i++) {
    const a = rnd() * TAU;
    const d = R * Math.pow(rnd(), bias);
    const rr = R * (sMin + rnd() * (sMax - sMin));
    b.ellip(rr, rr * (0.45 + rnd() * 0.42), rr * (0.8 + rnd() * 0.4),
      cols[Math.floor(rnd() * cols.length)],
      { x: Math.cos(a) * d, y: H * (0.22 + rnd() * 0.56), z: Math.sin(a) * d, ry: rnd() * TAU }, 7, 5);
  }
}

/** A knot of galaxies at one place — a node of the web. */
function node(b, x, z, R, H, n, cols, rnd, y0 = 0) {
  for (let i = 0; i < n; i++) {
    const a = rnd() * TAU, d = R * Math.sqrt(rnd());
    const rr = R * (0.2 + rnd() * 0.26);
    b.ellip(rr, rr * (0.5 + rnd() * 0.4), rr, cols[Math.floor(rnd() * cols.length)],
      { x: x + Math.cos(a) * d, y: y0 + H * (0.3 + rnd() * 0.5), z: z + Math.sin(a) * d, ry: rnd() * TAU }, 7, 5);
  }
}

/** A run of small blobs from one point to another — a strand of the web. */
function strand(b, x0, z0, x1, z1, y, w, n, col, rnd, sag = 0) {
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const a = Math.atan2(z1 - z0, x1 - x0);
    b.ellip(w * 1.5, w * (0.7 + rnd() * 0.5), w * 0.8, col, {
      x: x0 + (x1 - x0) * t, z: z0 + (z1 - z0) * t,
      y: y + Math.sin(t * Math.PI) * sag, ry: -a,
    }, 7, 4);
  }
}

/** A spiral arm as a run of shrinking, stretched knots. */
function arm(b, R, H, a0, sweep, n, cols, y) {
  for (let i = 0; i < n; i++) {
    const t = (i + 1) / n;
    const a = a0 + t * sweep;
    const d = R * (0.22 + t * 0.66);
    b.ellip(R * (0.16 - t * 0.07), H * 0.1, R * 0.07, cols[i % cols.length],
      { x: Math.cos(a) * d, y, z: Math.sin(a) * d, ry: -a }, 7, 4);
  }
}

/* ==================================================================
   GALAXIES — one at a time, smallest first
   ================================================================== */

P({ id: 'u_dsph', name: 'Dwarf Spheroidal', cat: 'galaxy', fill: 0.12, variants: 3, weight: 17,
  build(b, r, v) {
    const S = SP.dsph, H = S * 1.5;
    envelope(b, S, H, U_.goldDim, 0.86 + v * 0.06);
    for (let i = 0; i < 6; i++) {
      const a = r() * TAU, d = S * 0.6 * Math.sqrt(r());
      b.sphere(S * (0.09 + r() * 0.07), i % 3 ? U_.redDim : U_.gold,
        { x: Math.cos(a) * d, y: H * (0.28 + r() * 0.44), z: Math.sin(a) * d }, 6, 4);
    }
  } });

P({ id: 'u_dwarf', name: 'Dwarf Galaxy', cat: 'galaxy', fill: 0.18, variants: 4, weight: 16,
  build(b, r, v) {
    const S = SP.dwarf, H = S * 1.34;
    envelope(b, S, H, U_.spaceLit, 0.9);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU + r() * 0.9, d = S * (0.18 + r() * 0.5);
      b.ellip(S * (0.15 + r() * 0.13), H * (0.13 + r() * 0.12), S * 0.14,
        i % 3 === 0 ? U_.blue : (i % 3 === 1 ? U_.goldDim : U_.redDim),
        { x: Math.cos(a) * d, y: H * (0.3 + r() * 0.4), z: Math.sin(a) * d, ry: r() * TAU }, 7, 5);
    }
    if (v % 2) b.sphere(S * 0.12, U_.bluePale, { y: H * 0.54 }, 6, 4);
  } });

P({ id: 'u_irregular', name: 'Irregular Galaxy', cat: 'galaxy', fill: 0.2, variants: 4, weight: 15,
  build(b, r, v) {
    const S = SP.irregular, H = S * 1.24;
    envelope(b, S, H, U_.spaceLit, 0.82);
    // no symmetry at all: a torn sheet of star formation
    for (let i = 0; i < 9; i++) {
      const t = i / 8;
      const x = -S * 0.72 + t * S * 1.44 + (r() - 0.5) * S * 0.2;
      const z = Math.sin(t * 4.1 + v) * S * 0.4;
      b.ellip(S * (0.13 + r() * 0.13), H * (0.12 + r() * 0.16), S * (0.1 + r() * 0.1),
        i % 4 === 3 ? U_.bluePale : (i % 2 ? U_.blue : U_.blueDim),
        { x, y: H * (0.3 + r() * 0.38), z, ry: r() * TAU }, 7, 5);
    }
    for (let i = 0; i < 2; i++) {
      b.sphere(S * 0.1, U_.ice, { x: (r() - 0.5) * S, y: H * 0.55, z: (r() - 0.5) * S * 0.7 }, 6, 4);
    }
  } });

P({ id: 'u_spiral', name: 'Spiral Galaxy', cat: 'galaxy', fill: 0.34, variants: 4, weight: 14,
  build(b, r, v) {
    const S = SP.spiral, H = S * 0.8;
    envelope(b, S, H, U_.spaceLit);
    b.cyl(S * 0.88, S * 0.88, H * 0.1, U_.blueDim, { y: H * 0.5 }, 11);
    b.ellip(S * 0.24, H * 0.3, S * 0.24, U_.amber, { y: H * 0.5 }, 9, 6);
    const arms = 2 + (v % 2);
    for (let k = 0; k < arms; k++) {
      arm(b, S, H, (k / arms) * TAU + v * 0.5, 2.2, 4, [U_.blue, U_.bluePale], H * 0.5);
    }
  } });

P({ id: 'u_barred', name: 'Barred Spiral', cat: 'galaxy', fill: 0.36, variants: 3, weight: 13,
  build(b, r, v) {
    const S = SP.barred, H = S * 0.78;
    envelope(b, S, H, U_.spaceLit);
    b.cyl(S * 0.86, S * 0.86, H * 0.1, U_.blueDim, { y: H * 0.5 }, 11);
    // the bar, and the two arms that hang off its ends
    const ba = v * 0.7;
    b.ellip(S * 0.46, H * 0.24, S * 0.15, U_.amber, { y: H * 0.5, ry: ba }, 9, 6);
    b.ellip(S * 0.19, H * 0.3, S * 0.19, U_.goldPale, { y: H * 0.5 }, 9, 6);
    for (const s of [0, Math.PI]) {
      arm(b, S, H, ba + s, 2.0, 4, [U_.blue, U_.bluePale], H * 0.5);
    }
    for (let i = 0; i < 3; i++) {
      const a = r() * TAU, d = S * (0.5 + r() * 0.4);
      b.sphere(S * 0.06, U_.ice, { x: Math.cos(a) * d, y: H * 0.52, z: Math.sin(a) * d }, 6, 4);
    }
  } });

P({ id: 'u_lenticular', name: 'Lenticular Galaxy', cat: 'galaxy', fill: 0.4, variants: 3, weight: 12,
  build(b, r, v) {
    const S = SP.lenticular, H = S * 0.76;
    envelope(b, S, H, U_.goldDim, 0.95);
    // a spiral that ran out of gas: big bulge, smooth disc, no arms
    b.cyl(S * 0.9, S * 0.9, H * 0.13, U_.amber, { y: H * 0.5 }, 11);
    b.ellip(S * 0.42, H * 0.42, S * 0.42, U_.goldPale, { y: H * 0.5 }, 9, 6);
    b.cyl(S * 0.62, S * 0.62, H * 0.06, U_.redDim, { y: H * (0.5 + 0.09 + v * 0.02) }, 10);
    for (let i = 0; i < 5; i++) {
      const a = r() * TAU, d = S * (0.3 + r() * 0.55);
      b.sphere(S * 0.05, U_.goldPale, { x: Math.cos(a) * d, y: H * (0.42 + r() * 0.18), z: Math.sin(a) * d }, 6, 4);
    }
  } });

P({ id: 'u_elliptical', name: 'Elliptical Galaxy', cat: 'galaxy', fill: 0.44, variants: 3, weight: 12,
  build(b, r, v) {
    const S = SP.elliptical, H = S * 1.1;
    envelope(b, S, H, U_.goldDim, 0.84 + v * 0.06);
    b.ellip(S * 0.66, H * 0.36, S * 0.58, U_.gold, { y: H * 0.5, ry: v * 0.5 }, 9, 6);
    b.ellip(S * 0.3, H * 0.19, S * 0.28, U_.goldPale, { y: H * 0.5 }, 9, 6);
    // globular clusters, the only structure it has left
    for (let i = 0; i < 7; i++) {
      const a = r() * TAU, d = S * (0.4 + r() * 0.52);
      b.sphere(S * 0.045, i % 3 ? U_.goldPale : U_.red,
        { x: Math.cos(a) * d, y: H * (0.24 + r() * 0.52), z: Math.sin(a) * d }, 6, 4);
    }
  } });

P({ id: 'u_quasar', name: 'Quasar', cat: 'active', fill: 0.2, variants: 3, weight: 11,
  build(b, r, v) {
    const S = SP.quasar, H = S * 2.3;
    // faint host, brilliant middle, a stub of beam either way
    b.ellip(S, H * 0.34, S * 0.9, U_.spaceLit, { y: H * 0.5 }, 9, 6);
    b.cyl(S * 0.5, S * 0.5, H * 0.06, U_.ember, { y: H * 0.5 }, 11);
    b.cyl(S * 0.24, S * 0.24, H * 0.1, U_.goldPale, { y: H * 0.5 }, 9);
    b.sphere(S * 0.14, U_.glow, { y: H * 0.5 }, 8, 6);
    for (const s of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const t = (i + 1) / 3;
        b.cyl(S * 0.1 * (1.1 - t * 0.6), S * 0.1 * (1.3 - t * 0.6), H * 0.16, U_.jet,
          { y: H * (0.5 + s * (0.1 + t * 0.13)) }, 7);
      }
      b.sphere(S * (0.1 + v * 0.02), U_.bluePale, { y: H * (0.5 + s * 0.46) }, 7, 5);
    }
  } });

P({ id: 'u_giantell', name: 'Giant Elliptical', cat: 'galaxy', fill: 0.46, variants: 3, weight: 11,
  build(b, r, v) {
    const S = SP.giantell, H = S * 1.06;
    envelope(b, S, H, U_.goldDim, 0.88);
    b.ellip(S * 0.72, H * 0.4, S * 0.64, U_.gold, { y: H * 0.5, ry: v * 0.6 }, 9, 6);
    b.ellip(S * 0.4, H * 0.24, S * 0.36, U_.amber, { y: H * 0.5 }, 9, 6);
    b.ellip(S * 0.14, H * 0.1, S * 0.13, U_.goldPale, { y: H * 0.5 }, 7, 5);
    // shells, from the smaller galaxies it has eaten
    for (let i = 0; i < 3; i++) {
      const d = S * (0.5 + i * 0.16);
      b.ellip(d, H * 0.05, d * 0.9, U_.red, { y: H * (0.36 + i * 0.14), ry: i * 0.9 }, 9, 4);
    }
    for (let i = 0; i < 8; i++) {
      const a = r() * TAU, d = S * (0.4 + r() * 0.55);
      b.sphere(S * 0.04, U_.goldPale, { x: Math.cos(a) * d, y: H * (0.24 + r() * 0.5), z: Math.sin(a) * d }, 6, 4);
    }
  } });

/* ==================================================================
   PAIRS, MERGERS AND THE THINGS BLACK HOLES DO
   ================================================================== */

/* KEPT SHORT AND TALL ON PURPOSE.
 *
 * The obvious drawing of an interacting pair is two flat discs a long way apart
 * with two long tidal tails, and that lands the collision radius at 0.98 of the
 * pickup — a thing that reads as a mouthful and fences off twice its own width
 * while you are still too small for it. Halved the separation, pulled the tails
 * in and gave both galaxies a real halo, which is what takes the ratio to 0.83.
 * `tools/balance.mjs` does not measure this; the bot wedging between two of
 * them for four hundred seconds is how it shows up. */
P({ id: 'u_pair', name: 'Interacting Pair', cat: 'group', fill: 0.24, variants: 4, weight: 10,
  build(b, r, v) {
    const S = SP.pair;
    const R1 = S * 0.6, R2 = S * 0.42;
    // one face-on with a fat halo, one edge-on, a bridge of stars between them
    b.ellip(R1, R1 * 0.57, R1 * 0.96, U_.spaceLit, { x: -S * 0.36, y: R1 * 0.57 }, 9, 6);
    b.cyl(R1 * 0.78, R1 * 0.78, R1 * 0.12, U_.blueDim, { x: -S * 0.36, y: R1 * 0.5 }, 11);
    b.ellip(R1 * 0.24, R1 * 0.3, R1 * 0.24, U_.amber, { x: -S * 0.36, y: R1 * 0.52 }, 7, 5);
    b.ellip(R2, R2 * 0.72, R2 * 0.86, U_.goldDim, { x: S * 0.52, y: R1 * 0.55, ry: 0.7 + v * 0.3 }, 9, 6);
    b.ellip(R2 * 0.3, R2 * 0.34, R2 * 0.24, U_.goldPale, { x: S * 0.52, y: R1 * 0.55 }, 7, 5);
    strand(b, -S * 0.36 + R1 * 0.7, 0, S * 0.52 - R2 * 0.7, 0, R1 * 0.5, S * 0.05, 4, U_.blue, r, R1 * 0.14);
    // tidal tails, thrown up and out rather than flat and far
    for (const s of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const t = (i + 1) / 3;
        b.ellip(S * 0.08, R1 * 0.16, S * 0.05, U_.blueDim, {
          x: s * (S * 0.4 + t * S * 0.29), y: R1 * (0.5 + t * 0.42),
          z: s * Math.sin(t * 2.1) * S * 0.26, ry: t * 1.2 * s,
        }, 7, 4);
      }
    }
  } });

P({ id: 'u_lyman', name: 'Lyman-alpha Blob', cat: 'gas', fill: 0.08, variants: 3, weight: 10,
  build(b, r, v) {
    const S = SP.lyman, H = S * 1.34;
    // a diffuse glow with a couple of proto-galaxies buried in it: overlapping
    // faint lobes, no envelope, so a small katamari can push into the cloud
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + r() * 0.6;
      const d = S * (0.36 + r() * 0.26);
      const rr = S * (0.3 + r() * 0.14);
      b.ellip(rr, H * (0.26 + r() * 0.16), rr * 0.9, i % 3 === 2 ? U_.cyan : U_.violet,
        { x: Math.cos(a) * d, y: H * (0.34 + r() * 0.28), z: Math.sin(a) * d }, 7, 5);
    }
    b.ellip(S * 0.34, H * 0.3, S * 0.34, U_.hollowRim, { y: H * 0.46 }, 9, 6);
    for (let i = 0; i < 2 + v; i++) {
      const a = r() * TAU, d = S * 0.4 * r();
      b.ellip(S * 0.1, H * 0.08, S * 0.09, U_.bluePale,
        { x: Math.cos(a) * d, y: H * (0.36 + r() * 0.2), z: Math.sin(a) * d }, 7, 5);
    }
  } });

P({ id: 'u_merger', name: 'Merging Pair', cat: 'group', fill: 0.26, variants: 4, weight: 10,
  build(b, r, v) {
    const S = SP.merger;
    const R = S * 0.5;
    // two discs already inside one another, and two tails a long way out
    for (const s of [-1, 1]) {
      b.ellip(R, R * 0.34, R * 0.86, U_.spaceLit, { x: s * S * 0.22, z: s * S * 0.1, y: R * 0.4, ry: s * 0.5 }, 9, 6);
      b.cyl(R * 0.7, R * 0.7, R * 0.12, s > 0 ? U_.blueDim : U_.redDim, { x: s * S * 0.22, z: s * S * 0.1, y: R * 0.4 }, 11);
      b.ellip(R * 0.2, R * 0.2, R * 0.2, U_.goldPale, { x: s * S * 0.22, z: s * S * 0.1, y: R * 0.42 }, 7, 5);
    }
    // the starburst where they touch
    b.ellip(R * 0.3, R * 0.26, R * 0.3, U_.glow, { y: R * 0.48 }, 8, 6);
    for (let i = 0; i < 4; i++) {
      const a = r() * TAU, d = R * 0.6 * r();
      b.sphere(R * 0.09, U_.ice, { x: Math.cos(a) * d, y: R * (0.4 + r() * 0.3), z: Math.sin(a) * d }, 6, 4);
    }
    for (const s of [-1, 1]) {
      for (let i = 0; i < 5; i++) {
        const t = (i + 1) / 5;
        const a = s * (0.6 + t * 1.5) + v * 0.4;
        b.ellip(S * 0.08, R * (0.16 - t * 0.06), S * 0.045, i % 2 ? U_.blueDim : U_.redDim, {
          x: s * S * 0.3 + Math.cos(a) * S * t * 0.62,
          y: R * 0.4 + t * R * 0.36,
          z: s * S * 0.14 + Math.sin(a) * S * t * 0.4, ry: -a,
        }, 7, 4);
      }
    }
  } });

P({ id: 'u_agn', name: 'Active Nucleus', cat: 'active', surface: 'air', flyHeight: 96,
  fill: 0.08, variants: 3, weight: 9,
  build(b, r, v) {
    const S = SP.agn, H = S * 3.4;
    const mid = H * 0.5;
    // host galaxy edge-on, and two jets straight out of the middle of it
    b.ellip(S, S * 0.3, S * 0.86, U_.spaceLit, { y: mid }, 9, 6);
    b.cyl(S * 0.8, S * 0.8, S * 0.12, U_.redDim, { y: mid }, 11);
    b.ellip(S * 0.22, S * 0.2, S * 0.22, U_.ember, { y: mid }, 7, 5);
    b.sphere(S * 0.1, U_.glow, { y: mid }, 7, 5);
    for (const s of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        const t = (i + 0.5) / 4;
        b.cyl(S * (0.05 + t * 0.1), S * (0.04 + t * 0.08), H * 0.115, U_.jet,
          { y: mid + s * (S * 0.25 + t * H * 0.4) }, 7);
      }
      // the working surface, where the jet runs into everything else
      b.ellip(S * 0.34, S * 0.24, S * 0.34, U_.radio, { y: mid + s * H * 0.46 }, 7, 5);
      if (v) b.sphere(S * 0.12, U_.bluePale, { y: mid + s * H * 0.49 }, 6, 4);
    }
  } });

P({ id: 'u_compact', name: 'Compact Group', cat: 'group', fill: 0.2, variants: 4, weight: 9,
  build(b, r, v) {
    const S = SP.compact, H = S * 0.82;
    // five galaxies almost touching, one of them being torn apart
    envelope(b, S, H, U_.space, 0.96);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU + v * 0.4;
      const d = S * (i === 0 ? 0.1 : 0.56);
      const rr = S * (i === 0 ? 0.32 : 0.22 + r() * 0.08);
      b.ellip(rr, rr * (0.4 + r() * 0.35), rr * 0.92, i % 2 ? U_.goldDim : U_.spaceLit,
        { x: Math.cos(a) * d, y: H * 0.4, z: Math.sin(a) * d, ry: r() * TAU }, 9, 6);
      b.cyl(rr * 0.6, rr * 0.6, H * 0.08, i % 2 ? U_.amber : U_.blueDim,
        { x: Math.cos(a) * d, y: H * 0.42, z: Math.sin(a) * d }, 10);
      b.sphere(rr * 0.18, U_.goldPale, { x: Math.cos(a) * d, y: H * 0.44, z: Math.sin(a) * d }, 6, 4);
    }
    // the common envelope of stripped stars, painted low so it is not a lid
    for (let i = 0; i < 6; i++) {
      const a = r() * TAU, d = S * (0.26 + r() * 0.46);
      b.ellip(S * 0.16, H * 0.06, S * 0.1, U_.slateLit,
        { x: Math.cos(a) * d, y: H * (0.14 + r() * 0.12), z: Math.sin(a) * d, ry: -a }, 7, 4);
    }
  } });

P({ id: 'u_lobes', name: 'Radio Lobe Pair', cat: 'active', surface: 'air', flyHeight: 128,
  fill: 0.06, variants: 3, weight: 8,
  build(b, r, v) {
    const S = SP.lobes;
    // TILTED on purpose: an axis lying flat would be a long horizontal thing at
    // its own mid-height, which reads as a girder driven through the katamari.
    const tilt = 0.5 + v * 0.1;
    const ca = Math.cos(tilt), sa = Math.sin(tilt);
    const top = S * sa + S * 0.5;
    b.ellip(S * 0.26, S * 0.09, S * 0.22, U_.goldDim, { y: top }, 9, 6);
    b.sphere(S * 0.08, U_.ember, { y: top }, 7, 5);
    for (const s of [-1, 1]) {
      // the jet, a line of small blobs climbing away from the galaxy
      for (let i = 0; i < 4; i++) {
        const t = (i + 1) / 5;
        b.ellip(S * 0.06, S * 0.05, S * 0.05, U_.jet,
          { x: s * ca * S * t * 0.8, y: top + s * sa * S * t * 0.8, z: 0 }, 7, 4);
      }
      // the lobe, three overlapping bags of plasma
      const lx = s * ca * S * 0.74, ly = top + s * sa * S * 0.74;
      for (let k = 0; k < 3; k++) {
        const o = (k - 1) * S * 0.16;
        b.ellip(S * (0.3 - Math.abs(k - 1) * 0.06), S * (0.26 - Math.abs(k - 1) * 0.05), S * 0.24,
          k === 1 ? U_.radio : U_.violet,
          { x: lx + s * ca * o, y: ly + s * sa * o, z: (k - 1) * S * 0.1 }, 7, 5);
      }
      b.ellip(S * 0.1, S * 0.09, S * 0.09, U_.bluePale, { x: lx * 1.16, y: ly + s * sa * S * 0.12 }, 7, 4);
    }
  } });

P({ id: 'u_lens', name: 'Lensing Arc', cat: 'gas', surface: 'air', flyHeight: 164,
  fill: 0.05, variants: 3, weight: 8,
  build(b, r, v) {
    const S = SP.lens, H = S * 0.9;
    // the cluster doing the bending, small and gold in the middle
    b.ellip(S * 0.26, H * 0.24, S * 0.26, U_.gold, { y: H * 0.5 }, 9, 6);
    b.sphere(S * 0.1, U_.goldPale, { y: H * 0.5 }, 7, 5);
    for (let i = 0; i < 5; i++) {
      const a = r() * TAU, d = S * 0.3 * r();
      b.ellip(S * 0.07, H * 0.06, S * 0.07, U_.amber,
        { x: Math.cos(a) * d, y: H * (0.38 + r() * 0.24), z: Math.sin(a) * d }, 6, 4);
    }
    /* THE ARCS. Broken into three separate sweeps at three azimuths, each of
       small tilted pieces, so the footprint stays as deep as it is wide and the
       collision boxes stay small. One long thin ring instead would have a
       collision radius of the whole span while reading as something you could
       swallow — the classic wide-flat fence. */
    for (let k = 0; k < 3; k++) {
      const rad = S * (0.66 + k * 0.15);
      const a0 = (k / 3) * TAU + v * 0.5;
      const sweep = 1.3 + k * 0.2;
      const n = 5;
      for (let i = 0; i < n; i++) {
        const a = a0 + (i / (n - 1) - 0.5) * sweep;
        b.ellip(S * 0.045, H * (0.1 + k * 0.02), S * 0.02, k === 1 ? U_.ice : U_.bluePale, {
          x: Math.cos(a) * rad, y: H * (0.42 + k * 0.08), z: Math.sin(a) * rad,
          ry: -a, rx: 0.45,
        }, 7, 4);
      }
    }
  } });

/* ==================================================================
   GROUPS, CLUSTERS AND THE WEB
   ================================================================== */

P({ id: 'u_group', name: 'Galaxy Group', cat: 'group', fill: 0.19, variants: 4, weight: 8,
  build(b, r, v) {
    const S = SP.group, H = S * 0.72;
    // a dominant spiral and a dozen hangers-on, all inside one faint envelope
    envelope(b, S, H, U_.space, 0.96);
    b.ellip(S * 0.3, H * 0.14, S * 0.3, U_.spaceLit, { y: H * 0.42 }, 9, 6);
    b.cyl(S * 0.26, S * 0.26, H * 0.07, U_.blueDim, { y: H * 0.44 }, 11);
    b.ellip(S * 0.09, H * 0.09, S * 0.09, U_.amber, { y: H * 0.45 }, 7, 5);
    swarm(b, S * 0.78, H, 13 + v, [U_.goldDim, U_.blueDim, U_.spaceLit, U_.redDim], r, 0.07, 0.14, 1.25);
    for (let i = 0; i < 4; i++) {
      const a = r() * TAU, d = S * (0.3 + r() * 0.42);
      b.sphere(S * 0.035, U_.goldPale, { x: Math.cos(a) * d, y: H * (0.3 + r() * 0.4), z: Math.sin(a) * d }, 6, 4);
    }
  } });

P({ id: 'u_ripple', name: 'CMB Ripple', cat: 'web', fill: 0.035, variants: 3, weight: 7,
  build(b, r, v) {
    const S = SP.ripple, H = S * 0.62;
    /* The oldest light there is, as a set of concentric ridges swelling toward
       the middle. Rings of separate arc blobs rather than tori: a torus's
       bounding box is the whole ring, so one flat torus would fence off a
       thousand megaparsecs of ground while reading as edible. */
    for (let k = 0; k < 3; k++) {
      const rad = S * (0.94 - k * 0.3);
      const n = 12 - k * 2;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + k * 0.3 + v * 0.2;
        b.ellip(S * 0.15, H * (0.16 + k * 0.06), S * 0.06,
          k % 2 ? U_.violet : U_.haloLit,
          { x: Math.cos(a) * rad, y: H * (0.16 + k * 0.2), z: Math.sin(a) * rad, ry: -a }, 7, 4);
      }
    }
    b.ellip(S * 0.24, H * 0.2, S * 0.24, U_.violetDim, { y: H * 0.66 }, 9, 6);
    b.sphere(S * 0.08, U_.hollowRim, { y: H * 0.8 }, 7, 5);
  } });

P({ id: 'u_halo', name: 'Dark Matter Halo', cat: 'web', fill: 0.05, variants: 3, weight: 7,
  build(b, r, v) {
    const S = SP.halo, H = S;
    /* A shell of nothing much, with one galaxy sitting in the middle of it.
       Fourteen separate clumps and no envelope, so the inside of a halo is
       genuinely inside — you roll through the dark matter, which is the only
       honest way to draw it. */
    const n = 14;
    for (let i = 0; i < n; i++) {
      const el = Math.acos(1 - 2 * ((i + 0.5) / n));          // even over the sphere
      const az = i * 2.399963;                                 // golden angle
      const x = Math.sin(el) * Math.cos(az) * S * 0.78;
      const z = Math.sin(el) * Math.sin(az) * S * 0.78;
      const y = H * 0.5 + Math.cos(el) * H * 0.38;
      b.ellip(S * 0.22, H * 0.12, S * 0.2, i % 4 === 0 ? U_.haloLit : U_.halo, { x, y, z, ry: az }, 7, 5);
    }
    b.ellip(S * 0.2, H * 0.07, S * 0.2, U_.goldDim, { y: H * 0.5 }, 9, 6);
    b.ellip(S * 0.07, H * 0.05, S * 0.07, U_.goldPale, { y: H * 0.5 }, 7, 5);
    if (v) b.ellip(S * 0.12, H * 0.06, S * 0.11, U_.blueDim, { x: S * 0.3, y: H * 0.56, z: -S * 0.24 }, 7, 5);
  } });

P({ id: 'u_shock', name: 'Shock Front', cat: 'gas', fill: 0.06, variants: 3, weight: 7,
  build(b, r, v) {
    const S = SP.shock, H = S * 0.86;
    /* Two cluster-sized gas clouds ran into each other and this is the bow wave.
       An arc of tall thick segments — vertical extent on purpose, because a
       curved sheet lying flat is exactly the thing that reads as a floor at
       chest height. */
    const sweep = 2.0 + v * 0.2;
    for (let k = 0; k < 2; k++) {
      const rad = S * (0.94 - k * 0.26);
      const n = 7 - k;
      for (let i = 0; i < n; i++) {
        const a = -sweep / 2 + (i / (n - 1)) * sweep;
        b.ellip(S * 0.22, H * (0.44 - k * 0.12), S * 0.09, k ? U_.ember : U_.shock, {
          x: Math.cos(a) * rad, y: H * (0.44 - k * 0.06), z: Math.sin(a) * rad, ry: -a, rz: 0.14,
        }, 7, 5);
      }
    }
    // the gas being ploughed, trailing behind the front
    for (let i = 0; i < 6; i++) {
      const a = -sweep / 2 + r() * sweep;
      const d = S * (0.2 + r() * 0.4);
      b.ellip(S * 0.2, H * 0.16, S * 0.14, U_.redDim,
        { x: Math.cos(a) * d, y: H * (0.2 + r() * 0.2), z: Math.sin(a) * d, ry: -a }, 7, 5);
    }
    b.ellip(S * 0.18, H * 0.2, S * 0.16, U_.gold, { x: -S * 0.36, y: H * 0.28 }, 9, 6);
  } });

P({ id: 'u_cluster', name: 'Galaxy Cluster', cat: 'cluster', fill: 0.34, variants: 4, weight: 7,
  build(b, r, v) {
    const S = SP.cluster, H = S * 0.84;
    // a hundred galaxies in a bag of hot gas; twenty-two of them get drawn
    envelope(b, S, H, U_.space, 0.95);
    b.ellip(S * 0.5, H * 0.4, S * 0.48, U_.slate, { y: H * 0.46 }, 9, 6);
    b.ellip(S * 0.28, H * 0.24, S * 0.27, U_.slateLit, { y: H * 0.46 }, 9, 6);
    b.ellip(S * 0.2, H * 0.12, S * 0.19, U_.gold, { y: H * 0.46 }, 9, 6);
    b.ellip(S * 0.07, H * 0.06, S * 0.07, U_.goldPale, { y: H * 0.47 }, 7, 5);
    swarm(b, S * 0.8, H, 19 + v, [U_.goldDim, U_.redDim, U_.blueDim, U_.spaceLit, U_.amber], r, 0.06, 0.12, 1.4);
  } });

P({ id: 'u_void', name: 'Cosmic Void', cat: 'web', fill: 0.03, variants: 3, weight: 7,
  build(b, r, v) {
    const S = SP.void, H = S * 0.6;
    /* THE HOLLOW ONE, and the only prop in the game that is mostly a hole on
       purpose: nothing whatever in the middle, a rim of thin dim galaxies and a
       few violet wisps crossing the emptiness.
       The rim CLOSES, though. At a thinner rim the twelve clumps left 90Mpc
       gaps between them, which is wide enough for a small katamari to roll into
       a cavity 1,300Mpc across and far too narrow to roll back out of once it
       had grown — the trap this whole file is arranged to avoid. 0.21 is the
       ratio at which twelve clumps touch. */
    const n = 12, br = S * 0.21, rr = S - br;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      const w = 0.82 + ((i + v) % 3) * 0.12;
      b.ellip(br * w, H * (0.4 + ((i + v) % 2) * 0.1), br * w * 0.85,
        i % 4 === 0 ? U_.goldDim : (i % 4 === 2 ? U_.blueDim : U_.violet),
        { x: Math.cos(a) * rr, y: H * 0.42, z: Math.sin(a) * rr, ry: -a }, 7, 5);
      if (i % 3 === 0) {
        b.ellip(br * 0.4, H * 0.14, br * 0.34, U_.hollowRim,
          { x: Math.cos(a + 0.26) * rr * 0.82, y: H * 0.3, z: Math.sin(a + 0.26) * rr * 0.82 }, 7, 4);
      }
    }
    // one lonely wisp crossing the emptiness, and one galaxy left in the middle
    for (let i = 0; i < 4; i++) {
      const t = (i + 0.5) / 4;
      b.ellip(S * 0.1, H * 0.08, S * 0.05, U_.violetDim,
        { x: -S * 0.7 + t * S * 1.4, y: H * 0.34, z: Math.sin(t * 3.1 + v) * S * 0.3, ry: v * 0.4 }, 7, 4);
    }
    b.ellip(S * 0.08, H * 0.1, S * 0.07, U_.redDim, { x: S * 0.1, y: H * 0.3, z: -S * 0.14 }, 7, 5);
  } });

P({ id: 'u_protocluster', name: 'Protocluster', cat: 'cluster', fill: 0.18, variants: 3, weight: 6,
  build(b, r, v) {
    const S = SP.protocluster, H = S * 0.8;
    // a cluster still assembling: blue-white clumps and three strands feeding in
    envelope(b, S, H, U_.space, 0.96);
    node(b, 0, 0, S * 0.4, H, 9, [U_.bluePale, U_.blue, U_.cyan, U_.ice], r);
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * TAU + v * 0.6;
      const ex = Math.cos(a) * S * 0.78, ez = Math.sin(a) * S * 0.78;
      strand(b, Math.cos(a) * S * 0.28, Math.sin(a) * S * 0.28, ex, ez, H * 0.34, S * 0.055, 4, U_.blueDim, r, H * 0.1);
      node(b, ex * 0.9, ez * 0.9, S * 0.15, H * 0.7, 3, [U_.blue, U_.blueDim, U_.goldDim], r);
    }
    b.ellip(S * 0.16, H * 0.14, S * 0.16, U_.ice, { y: H * 0.44 }, 9, 6);
  } });

P({ id: 'u_core', name: 'Cluster Core', cat: 'cluster', fill: 0.42, variants: 3, weight: 6,
  build(b, r, v) {
    const S = SP.core, H = S * 0.96;
    // a cD galaxy the size of a small group, sitting in the bottom of the well
    envelope(b, S, H, U_.slate, 0.94);
    b.ellip(S * 0.54, H * 0.42, S * 0.5, U_.goldDim, { y: H * 0.5, ry: v * 0.5 }, 9, 6);
    b.ellip(S * 0.3, H * 0.26, S * 0.28, U_.gold, { y: H * 0.5 }, 9, 6);
    b.ellip(S * 0.13, H * 0.12, S * 0.12, U_.goldPale, { y: H * 0.5 }, 7, 5);
    b.sphere(S * 0.05, U_.glow, { y: H * 0.5 }, 7, 5);
    // the cannibalised galaxies still falling in
    swarm(b, S * 0.86, H, 14, [U_.redDim, U_.amber, U_.goldDim, U_.blueDim], r, 0.05, 0.11, 1.6);
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * TAU + 0.4;
      b.ellip(S * 0.06, H * 0.1, S * 0.02, U_.ice,
        { x: Math.cos(a) * S * 0.44, y: H * 0.56, z: Math.sin(a) * S * 0.44, ry: -a, rx: 0.4 }, 7, 4);
    }
  } });

P({ id: 'u_filament', name: 'Filament Strand', cat: 'web', fill: 0.05, variants: 4, weight: 6,
  build(b, r, v) {
    const S = SP.filament, H = S * 0.95;
    /* A strand of the cosmic web: a CHAIN of clumps, not a plank. Nothing here
       spans more than a fifth of the length, so the collision boxes stay small
       and a katamari threads between the knots.
       Short and tall rather than long and thin, for the same reason `u_pair` is
       — at 1.7x its own pickup in width this thing was a fence. */
    const n = 6;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const x = -S * 0.6 + t * S * 1.2;
      const z = Math.sin(t * 3.3 + v) * S * 0.26;
      const rr = S * (0.12 + Math.sin(t * Math.PI) * 0.1);
      node(b, x, z, rr * 1.4, H * (0.7 + Math.sin(t * Math.PI) * 0.3), i % 2 ? 3 : 2,
        [U_.goldDim, U_.blueDim, U_.redDim, U_.spaceLit], r);
      b.ellip(rr, H * (0.3 + Math.sin(t * Math.PI) * 0.2), rr * 0.85, U_.slate,
        { x, y: H * 0.42, z, ry: r() * TAU }, 7, 5);
    }
    // the warm-hot gas bridging the knots, hung on the same line but standing UP
    for (let i = 0; i < 5; i++) {
      const t = (i + 0.5) / 5;
      b.ellip(S * 0.11, H * 0.38, S * 0.05, U_.haloLit, {
        x: -S * 0.54 + t * S * 1.08, y: H * 0.42,
        z: Math.sin(t * 3.3 + v) * S * 0.26, ry: -Math.cos(t * 3.3 + v) * 0.5,
      }, 7, 5);
    }
  } });

P({ id: 'u_wall', name: 'Wall of Galaxies', cat: 'web', fill: 0.05, variants: 3, weight: 5,
  build(b, r, v) {
    const S = SP.wall, H = S * 1.05;
    /* A SHEET STANDING UP. Real vertical extent is the whole point: a wall of
       galaxies drawn lying down is a wide flat plate whose average height sits
       halfway up it, and that reads as a floor through the middle of the ball.
       Twenty-odd clumps on a gently buckled plane instead. */
    for (let i = 0; i < 7; i++) {
      for (let k = 0; k < 4; k++) {
        if ((i * 4 + k + v) % 7 === 3) continue;
        const t = i / 6, u = k / 3;
        const x = -S * 0.88 + t * S * 1.76;
        const z = Math.sin(t * 2.6 + v) * S * 0.34 + (r() - 0.5) * S * 0.16;
        const rr = S * (0.09 + r() * 0.06);
        b.ellip(rr, rr * (0.7 + r() * 0.5), rr * 0.8,
          (i + k) % 3 === 0 ? U_.goldDim : ((i + k) % 3 === 1 ? U_.blueDim : U_.redDim),
          { x, y: H * (0.1 + u * 0.82), z, ry: r() * TAU }, 7, 5);
      }
    }
    // the gas between them, a dim curtain hung on the same plane
    for (let i = 0; i < 5; i++) {
      const t = (i + 0.5) / 5;
      b.ellip(S * 0.19, H * 0.42, S * 0.05, U_.slate, {
        x: -S * 0.8 + t * S * 1.6, y: H * 0.44,
        z: Math.sin(t * 2.6 + v) * S * 0.34, ry: -Math.cos(t * 2.6 + v) * 0.4,
      }, 7, 5);
    }
  } });

P({ id: 'u_supercluster', name: 'Supercluster', cat: 'super', fill: 0.26, variants: 3, weight: 5,
  build(b, r, v) {
    const S = SP.supercluster, H = S * 0.78;
    // four clusters and the filaments that tie them together
    envelope(b, S, H, U_.space, 0.97);
    const pts = [];
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * TAU + v * 0.5;
      const d = S * (k === 0 ? 0.15 : 0.56);
      pts.push([Math.cos(a) * d, Math.sin(a) * d, k === 0 ? 0.32 : 0.19 + r() * 0.05]);
    }
    for (const [x, z, w] of pts) {
      b.ellip(S * w * 0.8, H * w * 0.7, S * w * 0.76, U_.slate, { x, y: H * 0.42, z }, 9, 6);
      node(b, x, z, S * w, H, 5, [U_.goldDim, U_.amber, U_.redDim, U_.blueDim], r);
      b.ellip(S * w * 0.24, H * w * 0.3, S * w * 0.22, U_.gold, { x, y: H * 0.44, z }, 7, 5);
    }
    for (let k = 1; k < 4; k++) {
      strand(b, pts[0][0], pts[0][1], pts[k][0] * 0.86, pts[k][1] * 0.86, H * 0.34, S * 0.055, 4, U_.haloLit, r, H * 0.08);
    }
    b.sphere(S * 0.05, U_.glow, { x: pts[0][0], y: H * 0.46, z: pts[0][1] }, 7, 5);
  } });

P({ id: 'u_attractor', name: 'Great Attractor', cat: 'super', fill: 0.42, variants: 3, weight: 4,
  build(b, r, v) {
    const S = SP.attractor, H = S * 0.92;
    // whatever it is, everything for a hundred megaparsecs is falling into it
    envelope(b, S, H, U_.slate, 0.96);
    b.ellip(S * 0.52, H * 0.46, S * 0.5, U_.slateLit, { y: H * 0.5 }, 9, 6);
    b.ellip(S * 0.3, H * 0.3, S * 0.28, U_.goldDim, { y: H * 0.5 }, 9, 6);
    b.ellip(S * 0.14, H * 0.15, S * 0.13, U_.amber, { y: H * 0.5 }, 7, 5);
    b.sphere(S * 0.06, U_.glow, { y: H * 0.5 }, 7, 5);
    // the streams, coming in from every side
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * TAU + v * 0.4;
      strand(b, Math.cos(a) * S * 0.9, Math.sin(a) * S * 0.9,
        Math.cos(a) * S * 0.24, Math.sin(a) * S * 0.24, H * 0.42, S * 0.05, 4,
        k % 2 ? U_.haloLit : U_.redDim, r, H * 0.1);
      node(b, Math.cos(a) * S * 0.82, Math.sin(a) * S * 0.82, S * 0.16, H * 0.8, 2,
        [U_.goldDim, U_.blueDim, U_.redDim], r);
    }
  } });

/* THE BIGGEST THING IN THE UNIVERSE, AND IT HAS TO BE EDIBLE.
 *
 * A prop is collectable when `pickup <= diameter * 0.88`, and the largest
 * diameter that can ever exist is `cbrt(6 * stageMass * 0.48 / pi)`. Both come
 * out of the same stage, so it is entirely possible to author something nothing
 * can ever swallow — the city shipped with two mountains like that and the
 * world stage with a continent, and both times the report was "this scenario
 * cannot be completed", which looks like a physics bug rather than arithmetic.
 *
 * Two levers and they pull opposite ways: shrinking `SP.complex` lowers the
 * pickup but ALSO lowers the stage's mass, and the three of these are a third
 * of it, so the ceiling comes down with it. Raising `fill` adds mass without
 * touching the pickup, so it lifts the ceiling on its own.
 *
 * Do not move either number without re-running `balance --only=universe` and
 * reading `too big to ever collect`. It must say none. */
P({ id: 'u_complex', name: 'Supercluster Complex', cat: 'super', fill: 0.44, variants: 3, weight: 3,
  build(b, r, v) {
    const S = SP.complex, H = S * 0.84;
    // the whole web in one object: three superclusters, their filaments, and a
    // void in between that you can see into
    envelope(b, S, H, U_.space, 0.97);
    const pts = [[0, 0, 0.4], [0.6, -0.42, 0.26], [-0.5, 0.56, 0.28], [0.52, 0.58, 0.2], [-0.62, -0.5, 0.19]];
    for (const [fx, fz, w] of pts) {
      const x = fx * S, z = fz * S;
      b.ellip(S * w * 0.84, H * w * 0.66, S * w * 0.8, U_.slate, { x, y: H * 0.44, z }, 9, 6);
      b.ellip(S * w * 0.44, H * w * 0.42, S * w * 0.42, U_.slateLit, { x, y: H * 0.44, z }, 9, 6);
      node(b, x, z, S * w * 0.9, H, 5, [U_.goldDim, U_.amber, U_.redDim, U_.blueDim, U_.spaceLit], r);
      b.ellip(S * w * 0.2, H * w * 0.26, S * w * 0.18, U_.gold, { x, y: H * 0.46, z }, 7, 5);
    }
    for (let k = 1; k < pts.length; k++) {
      strand(b, pts[0][0] * S * 0.5, pts[0][1] * S * 0.5, pts[k][0] * S * 0.82, pts[k][1] * S * 0.82,
        H * 0.36, S * 0.045, 5, k % 2 ? U_.haloLit : U_.halo, r, H * 0.07);
    }
    // the void: a rim of dim galaxies round a piece of nothing
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + v * 0.4;
      b.ellip(S * 0.06, H * 0.07, S * 0.05, i % 3 ? U_.violet : U_.violetDim, {
        x: Math.cos(a) * S * 0.3 - S * 0.06, y: H * 0.3, z: Math.sin(a) * S * 0.3 + S * 0.06, ry: -a,
      }, 7, 4);
    }
    b.sphere(S * 0.045, U_.glow, { y: H * 0.48 }, 7, 5);
    b.sphere(S * 0.03, C.black, { y: H * 0.86 }, 6, 4);
  } });
