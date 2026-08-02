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
import {
  gradedDisc, spiralArm, ring, sheet, shell, jet, swarm as kitSwarm, wisps, core,
} from './spacekit.js';

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
  /* ⚠ THE DARK END IS FOR THE FLOOR, NOT FOR OBJECTS.
   *
   * Reported: *"the last 2 stages should be dark because space is dark, but
   * the items within them should be bright enough to see rather than black on
   * black."* Measured with `npm run contrast`: six kinds of large structure had
   * a brightest part below 0.01 relative luminance — under #1a1a1a — against a
   * floor of 0.0007. Those are not dark objects, they are unlit ones, and no
   * amount of shadow or shading brings them back.
   *
   * `space` and `ink` stay near-black because they ARE the void: the base
   * platform and the sky are painted from them and the player explicitly wants
   * that dark. Everything an object is made of has been raised to somewhere it
   * can catch a light. The stage still reads as deep space — the floor is
   * unchanged at 0.0007 — but the things standing on it now have a silhouette.
   */

  /* the dark — floor and sky only */
  space:     0x04030a,
  ink:       0x07060e,

  /* the dark, as OBJECTS are made of it */
  spaceLit:  0x312952,
  slate:     0x494766,
  slateLit:  0x68648b,

  /* the voids — a little violet, and nothing else */
  hollow:    0x3d2c66,
  hollowRim: 0x6347a0,
  violet:    0x7e50e2,
  violetDim: 0x57369c,

  /* old, red, finished */
  gold:      0xa8813a,
  goldDim:   0xb68a42,
  goldPale:  0xd8bb79,
  amber:     0xc99a45,
  red:       0xd45a42,
  redDim:    0x803629,
  ember:     0xb4552e,

  /* young, hot */
  blue:      0x7fa8cf,
  bluePale:  0xcfe2f5,
  blueDim:   0x5c8dbd,
  cyan:      0x7eecff,
  ice:       0xeaf2ff,

  /* what you cannot see */
  halo:      0x4b6390,
  haloLit:   0x6e96ce,
  shock:     0xc4703c,
  glow:      0xf3f7ff,
  jet:       0x9fd4e8,
  radio:     0x9b7ee4,
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
  /* ⚠ 1470, NOT 1609. At 1609 this measured a pickup of 2343Mpc, which needs a
     ball of 2343/0.88 = 2663Mpc — against a reachable ceiling of 2507. All
     three of them stood there at the end of every run, and because there are
     THREE the old "could you eat this if you ate everything else" check passed
     them: each one's test assumed the other two were gone. Reported by a
     player as "it is impossible to fully roll up the universe; there are 3
     large round items which are too big to roll up even after rolling
     everything else". `balance` now runs a growth fixed point instead and
     names them. 1470 gives ~2140Mpc, needing 2432 — comfortably under. */
  complex: 1470,        // 2140
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
/**
 * Members STRADDLING the surface of an envelope of half-width R, rather than
 * distributed through its volume.
 *
 * ⚠ THE WHOLE UNIVERSE STAGE USED `swarm` FOR ITS CLUSTERS AND EVERY MEMBER
 * WAS INVISIBLE. `swarm`'s radial bias pulls points towards the centre, which
 * is correct for how galaxies are actually distributed and exactly wrong for
 * whether you can see any of them: they end up inside an opaque envelope. This
 * places them in a shell from 0.9 R to 1.25 R, so the silhouette becomes a
 * crowd of galaxies with the halo behind them.
 */
function ringSwarm(b, R, H, n, cols, rnd, sMin, sMax) {
  for (let i = 0; i < n; i++) {
    const a = rnd() * TAU;
    const d = R * (0.9 + rnd() * 0.35);
    const rr = R * (sMin + rnd() * (sMax - sMin));
    b.ellip(rr, rr * (0.45 + rnd() * 0.42), rr * (0.8 + rnd() * 0.4),
      cols[Math.floor(rnd() * cols.length)],
      { x: Math.cos(a) * d, y: H * (0.24 + rnd() * 0.6), z: Math.sin(a) * d, ry: rnd() * TAU }, 6, 4);
  }
}

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

P({ id: 'u_dsph', name: 'Dwarf Spheroidal', cat: 'galaxy', sizeMul: 0.98481, fill: 0.1146, variants: 3, weight: 17,
  build(b, r, v) {
    /* A dwarf spheroidal is the FAINTEST thing in the catalogue — a smudge of
       old stars you can barely resolve — and it was the most solid-looking, a
       gold egg with six pebbles sealed inside it. The stars are the object, so
       they go outside the body where you can see them, and the body shrinks to
       the unresolved glow at the middle.

       ⚠ 665 INSTANCES. The single most-placed archetype in the game, 20% of
       this stage's props. `swarm` at 5x3 segments and fourteen points is the
       whole budget it gets. */
    const S = SP.dsph, H = S * 1.5;
    const sq = 0.86 + v * 0.06;
    core(b, S, H * 0.5, S * sq, U_.goldDim, { y: H * 0.5, k: 1, seg: 8, hseg: 6 });
    b.decor((d) => {
      kitSwarm(d, S * 1.28, H * 0.62, S * 1.28 * sq, 14,
        [U_.goldDim, U_.redDim, U_.gold], r,
        { y: H * 0.5, lo: 0.07, hi: 0.13, bias: 1.5, seg: 5, hseg: 3 });
    });
  } });

P({ id: 'u_dwarf', name: 'Dwarf Galaxy', cat: 'galaxy', sizeMul: 0.98481, fill: 0.1719, variants: 4, weight: 16,
  build(b, r, v) {
    /* Lumpy and still forming, which is the difference from the spheroidal
       above — the clumps are blue because they are young. They were all inside
       the envelope; they are outside the core now, which is where a clump has
       to be to be a clump. */
    const S = SP.dwarf, H = S * 1.34;
    core(b, S, H * 0.5, S * 0.9, U_.spaceLit, { y: H * 0.5, k: 1, seg: 8, hseg: 6 });
    b.decor((d) => {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU + r() * 0.9, dd = S * (1.05 + r() * 0.45);
        d.ellip(S * (0.15 + r() * 0.12), H * (0.13 + r() * 0.11), S * 0.14,
          i % 3 === 0 ? U_.blue : (i % 3 === 1 ? U_.goldDim : U_.redDim),
          { x: Math.cos(a) * dd, y: H * (0.3 + r() * 0.4), z: Math.sin(a) * dd, ry: r() * TAU }, 6, 4);
      }
      if (v % 2) d.sphere(S * 0.13, U_.bluePale, { y: H * 0.78 }, 6, 4);
    });
  } });

P({ id: 'u_irregular', name: 'Irregular Galaxy', cat: 'galaxy', sizeMul: 0.99193, fill: 0.1952, variants: 4, weight: 15,
  build(b, r, v) {
    /* "No symmetry at all: a torn sheet of star formation" — the comment was
       right and the envelope made it a symmetrical egg anyway. The sheet now
       runs right across and past the core, which is the only way an asymmetry
       can be seen: it has to break the silhouette, not sit inside it. */
    const S = SP.irregular, H = S * 1.24;
    core(b, S, H * 0.5, S * 0.82, U_.spaceLit, { y: H * 0.5, k: 1, seg: 8, hseg: 6 });
    b.decor((d) => {
      for (let i = 0; i < 10; i++) {
        const t = i / 9;
        const x = -S * 1.35 + t * S * 2.7 + (r() - 0.5) * S * 0.22;
        const z = Math.sin(t * 4.1 + v) * S * 0.52;
        d.ellip(S * (0.13 + r() * 0.13), H * (0.12 + r() * 0.15), S * (0.1 + r() * 0.1),
          i % 4 === 3 ? U_.bluePale : (i % 2 ? U_.blue : U_.blueDim),
          { x, y: H * (0.3 + r() * 0.38), z, ry: r() * TAU }, 6, 4);
      }
      for (let i = 0; i < 2; i++) {
        d.sphere(S * 0.11, U_.ice, { x: (r() - 0.5) * S * 1.6, y: H * 0.6, z: (r() - 0.5) * S }, 6, 4);
      }
    });
  } });

/* ⚠ THIS IS THE PROP THE PLAYER NAMED. *"a galaxy should not look like a blob.
   It should look like a galaxy."* It looked like a blob for one reason and it
   was not the art: `envelope()` drew a single opaque ellipsoid the full size of
   the prop, and the disc, the bulge and all four arms were built INSIDE it.
   Everything that made it a galaxy was there, in the file, sealed in a shell.

   The envelope existed to set the bounding box, because collision measures
   what you draw. `ghost` sets the box with a solid core instead, so the
   envelope is gone from every galaxy in this file and the disc is the
   silhouette.

   ⚠ HOW THIN THE SOLID PART CAN BE IS SET BY `fill`, NOT BY TASTE. At `fill`
   0.34 there is only a 2.94x reduction in boxVol available before it passes 1,
   which is 1.43x per axis — so the solid body stays a broad lens rather than
   becoming a compact bulge. That is fine: the lens reads as the inner disc, and
   the ghost disc and arms reach well past it, which is where the shape lives. */
P({ id: 'u_spiral', name: 'Spiral Galaxy', cat: 'galaxy', sizeMul: 1.3486, fill: 0.8338, variants: 4, weight: 14,
  build(b, r, v) {
    const S = SP.spiral, H = S * 0.8, yc = H * 0.5;
    /* ⚠ THE SOLID LENS HAS TO BE FLAT AND THE ARMS HAVE TO START OUTSIDE IT.
       First pass made it 0.72 S wide and 0.42 H tall — a dome — and put the
       arms from 0.34 S outwards, so their inner two thirds were buried inside
       it and only white specks came out of the rim. Same volume, spread wide
       and thin instead: 0.9 S across and 0.27 H deep is a four-to-one lens
       that reads as the inner disc, and everything ghost begins beyond its
       edge where it can actually be seen. */
    b.ellip(S * 0.66, H * 0.5, S * 0.66, U_.amber, { y: yc }, 10, 7);
    b.decor((d) => {
      /* Low contrast between the rings on purpose: four strongly different
         tones concentric is a dartboard. The SPIRAL is what says spiral. */
      gradedDisc(d, S * 0.88, S * 1.5, [U_.blueDim, U_.spaceLit],
        { y: yc, warp: 0.012, t: H * 0.025 }, 2, 22);
      const arms = 2 + (v % 2);
      for (let k = 0; k < arms; k++) {
        /* ⚠ THE ARMS RUN ACROSS THE FACE OF THE DISC, NOT ROUND ITS RIM.
           Starting them outside the solid lens kept them visible but gave two
           short curves at the same radius, which is a broken ring, not a
           spiral. They start near the centre now and sit just proud of the
           lens — `yc + H*0.29` against a lens top of `H*0.27` — so the whole
           sweep is on show from above, which is the angle this is played
           from. A spiral is only a spiral if you can see it turn. */
        spiralArm(d, S * 0.26, S * 1.48, (k / arms) * TAU + v * 0.5, 3.3,
          [U_.blue, U_.bluePale, U_.ice, U_.blue],
          { y: yc + H * 0.29, w: 0.075, h: 0.26, seg: 5, hseg: 3 }, 13);
      }
      d.ellip(S * 0.2, H * 0.62, S * 0.2, U_.goldPale, { y: yc }, 8, 6);
    });
  } });

P({ id: 'u_barred', name: 'Barred Spiral', cat: 'galaxy', sizeMul: 1.3715, fill: 0.9286, variants: 3, weight: 13,
  build(b, r, v) {
    /* The bar is the whole point of the name, and it was inside the envelope
       too. Arms spring from the BAR ENDS rather than from the centre, which is
       the difference you can actually see between this and `u_spiral`. */
    const S = SP.barred, H = S * 0.78, yc = H * 0.5;
    const ba = v * 0.7;
    b.ellip(S * 0.64, H * 0.5, S * 0.64, U_.amber, { y: yc }, 10, 7);
    b.decor((d) => {
      gradedDisc(d, S * 0.86, S * 1.46, [U_.blueDim, U_.spaceLit],
        { y: yc, warp: 0.012, t: H * 0.025 }, 2, 22);
      // the bar, proud of the lens so it is the thing you see first
      d.ellip(S * 0.72, H * 0.36, S * 0.2, U_.amber, { y: yc + H * 0.16, ry: ba }, 9, 6);
      d.ellip(S * 0.2, H * 0.42, S * 0.2, U_.goldPale, { y: yc }, 9, 6);
      // and the arms, hung off its two ends
      for (const sgn of [0, Math.PI]) {
        spiralArm(d, S * 0.66, S * 1.44, ba + sgn, 2.9,
          [U_.blue, U_.bluePale, U_.ice],
          { y: yc + H * 0.29, w: 0.075, h: 0.26, seg: 5, hseg: 3 }, 12);
      }
      for (let i = 0; i < 3; i++) {
        const a = r() * TAU, dd = S * (0.95 + r() * 0.5);
        d.sphere(S * 0.055, U_.ice, { x: Math.cos(a) * dd, y: yc + H * 0.03, z: Math.sin(a) * dd }, 6, 4);
      }
    });
  } });

P({ id: 'u_lenticular', name: 'Lenticular Galaxy', cat: 'galaxy', sizeMul: 1.2948, fill: 0.8683, variants: 3, weight: 12,
  build(b, r, v) {
    /* A spiral that ran out of gas: big bulge, smooth disc, NO arms. The
       absence is the identity, so the disc has to be visibly a disc for the
       absence to register — which it could not be inside an envelope. */
    const S = SP.lenticular, H = S * 0.76, yc = H * 0.5;
    b.ellip(S * 0.68, H * 0.5, S * 0.68, U_.goldDim, { y: yc }, 10, 7);
    b.decor((d) => {
      gradedDisc(d, S * 0.88, S * 1.36, [U_.goldDim, U_.amber],
        { y: yc, warp: 0.008, t: H * 0.03 }, 2, 22);
      d.ellip(S * 0.42, H * 0.56, S * 0.42, U_.goldPale, { y: yc }, 9, 6);
      // the one dust lane it still has
      ring(d, S * 1.12, U_.redDim, { y: yc + H * 0.015, rx: 0.03, tube: 0.016 }, 18);
      for (let i = 0; i < 5; i++) {
        const a = r() * TAU, dd = S * (0.4 + r() * 0.7);
        d.sphere(S * 0.05, U_.goldPale, { x: Math.cos(a) * dd, y: yc + (r() - 0.5) * H * 0.2, z: Math.sin(a) * dd }, 6, 4);
      }
    });
  } });

P({ id: 'u_elliptical', name: 'Elliptical Galaxy', cat: 'galaxy', sizeMul: 0.99044, fill: 0.4275, variants: 3, weight: 12,
  build(b, r, v) {
    /* ⚠ AN ELLIPTICAL GALAXY REALLY IS A SMOOTH BLOB, and that is not the
       problem here. The problem is that it was a smooth blob with THREE more
       smooth blobs and seven globular clusters hidden inside it — the comment
       calls them "the only structure it has left" and not one was visible.

       So the body stays an ellipsoid, because that is honest, and the only
       thing that changes is that its halo is now outside it. That is the whole
       difference between an elliptical and a rock. */
    const S = SP.elliptical, H = S * 1.1;
    const sq = 0.84 + v * 0.06;
    core(b, S, H * 0.5, S * sq, U_.gold, { y: H * 0.5, k: 1, ry: v * 0.5, seg: 9, hseg: 6 });
    b.decor((d) => {
      for (let i = 0; i < 9; i++) {
        const a = r() * TAU, dd = S * (1.08 + r() * 0.45);
        d.sphere(S * 0.05, i % 3 ? U_.goldPale : U_.red,
          { x: Math.cos(a) * dd, y: H * (0.2 + r() * 0.6), z: Math.sin(a) * dd }, 5, 4);
      }
    });
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

P({ id: 'u_giantell', name: 'Giant Elliptical', cat: 'galaxy', sizeMul: 0.96698, fill: 0.4159, variants: 3, weight: 11,
  build(b, r, v) {
    /* ⚠ "SHELLS, FROM THE SMALLER GALAXIES IT HAS EATEN." That line has been
       in this file the whole time, describing the one feature that makes a
       giant elliptical different from an ordinary one — the faint concentric
       arcs of a swallowed galaxy still unwinding — and all three of them were
       drawn at 0.5 to 0.82 S inside an envelope of S. Nobody has ever seen
       them. They are outside the body now, at 1.05 to 1.5 S, which is where a
       shell actually is. */
    const S = SP.giantell, H = S * 1.06;
    core(b, S, H * 0.5, S * 0.88, U_.gold, { y: H * 0.5, k: 1, ry: v * 0.6, seg: 9, hseg: 6 });
    b.decor((d) => {
      for (let i = 0; i < 3; i++) {
        const dd = S * (1.05 + i * 0.22);
        d.ellip(dd, H * 0.045, dd * 0.9, U_.red, { y: H * (0.4 + i * 0.1), ry: i * 0.9 }, 9, 4);
      }
      for (let i = 0; i < 9; i++) {
        const a = r() * TAU, dd = S * (1.12 + r() * 0.5);
        d.sphere(S * 0.045, U_.goldPale,
          { x: Math.cos(a) * dd, y: H * (0.2 + r() * 0.6), z: Math.sin(a) * dd }, 5, 4);
      }
    });
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
    /* ⚠ THIS PROP RENDERED AS A SOLID BLACK EGG AND EVERY GALAXY IN IT WAS
       REAL, DRAWN, AND INVISIBLE. `envelope()` paints `U_.space` — the darkest
       colour in the set — across the full size of the prop, FIRST, and the
       five galaxies were then built at 0.56 S, comfortably inside it.

       ⚠ AND GHOST DOES NOT HELP WITH THIS. Ghost geometry is still drawn
       opaquely; it only means "not measured". So there is no version of this
       where the contents sit inside the envelope and can be seen. Either the
       envelope goes, or the contents come out.

       The envelope STAYS — it is what pins the box, and shrinking a solid body
       is what cost the disc galaxies two runs in fifteen. The galaxies move out
       to straddle its surface instead, which is both visible and right: a
       compact group is galaxies studding a common halo of stripped stars, not
       galaxies buried in one. Same trick as the red giant's lumpy limb, and
       like that one it changes nothing `balance` can feel. */
    const S = SP.compact, H = S * 0.82;
    envelope(b, S, H, U_.spaceLit, 0.96);
    b.decor((d) => {
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * TAU + v * 0.4;
        const dd = S * (i === 0 ? 0.34 : 0.96);
        const rr = S * (i === 0 ? 0.34 : 0.24 + r() * 0.08);
        const yy = H * (i === 0 ? 0.78 : 0.52);
        d.ellip(rr, rr * (0.4 + r() * 0.35), rr * 0.92, i % 2 ? U_.goldDim : U_.spaceLit,
          { x: Math.cos(a) * dd, y: yy, z: Math.sin(a) * dd, ry: r() * TAU }, 8, 5);
        d.cyl(rr * 0.62, rr * 0.62, H * 0.07, i % 2 ? U_.amber : U_.blueDim,
          { x: Math.cos(a) * dd, y: yy + H * 0.02, z: Math.sin(a) * dd }, 9);
        d.sphere(rr * 0.2, U_.goldPale, { x: Math.cos(a) * dd, y: yy + H * 0.04, z: Math.sin(a) * dd }, 6, 4);
      }
      // the tidal bridge between the two closest, which is what "compact" means
      for (let i = 0; i < 5; i++) {
        const t = i / 4, a = 0.2 + v * 0.4;
        d.ellip(S * 0.13, H * 0.05, S * 0.07, U_.slateLit, {
          x: Math.cos(a) * S * (0.5 + t * 0.9), y: H * (0.56 + Math.sin(t * 3) * 0.1),
          z: Math.sin(a) * S * (0.5 + t * 0.9), ry: -a,
        }, 6, 4);
      }
    });
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
  sizeMul: 2.2268, fill: 0.5521, variants: 3, weight: 8,
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
    /* ⚠ "ONE LONG THIN RING WOULD HAVE A COLLISION RADIUS OF THE WHOLE SPAN
       WHILE READING AS SOMETHING YOU COULD SWALLOW — THE CLASSIC WIDE-FLAT
       FENCE." Correct, and retired: ghost has no collision radius at all. The
       arcs were five separate tilted pips per sweep, which is a dotted line,
       and a lensing arc is the one thing in astronomy that is famously a
       smooth continuous streak. Three real arcs now, each a partial surface of
       revolution — the shape `sheet()` exists for. */
    b.decor((d) => {
      for (let k = 0; k < 3; k++) {
        sheet(d, S * (0.78 + k * 0.22), H * (0.1 + k * 0.02), 1.3 + k * 0.25,
          k === 1 ? U_.ice : U_.bluePale,
          { y: H * (0.42 + k * 0.06), t: 0.02, bow: 0.05, phi0: (k / 3) * TAU + v * 0.5 }, 18);
      }
    });
  } });

/* ==================================================================
   GROUPS, CLUSTERS AND THE WEB
   ================================================================== */

P({ id: 'u_group', name: 'Galaxy Group', cat: 'group', fill: 0.19, variants: 4, weight: 8,
  build(b, r, v) {
    /* Same fix as `u_compact`. The dominant spiral sits proud on TOP of the
       halo rather than in the middle of it, which is the only place a
       "dominant" anything can be seen, and the hangers-on ring the surface. */
    const S = SP.group, H = S * 0.72;
    envelope(b, S, H, U_.spaceLit, 0.96);
    b.decor((d) => {
      d.ellip(S * 0.34, H * 0.16, S * 0.34, U_.spaceLit, { y: H * 0.86 }, 9, 6);
      d.cyl(S * 0.29, S * 0.29, H * 0.07, U_.blueDim, { y: H * 0.88 }, 11);
      d.ellip(S * 0.1, H * 0.1, S * 0.1, U_.amber, { y: H * 0.9 }, 7, 5);
      ringSwarm(d, S, H, 12 + v, [U_.goldDim, U_.blueDim, U_.spaceLit, U_.redDim], r, 0.07, 0.13);
      for (let i = 0; i < 4; i++) {
        const a = r() * TAU, dd = S * (0.95 + r() * 0.3);
        d.sphere(S * 0.04, U_.goldPale, { x: Math.cos(a) * dd, y: H * (0.35 + r() * 0.5), z: Math.sin(a) * dd }, 6, 4);
      }
    });
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

P({ id: 'u_shock', name: 'Shock Front', cat: 'gas', sizeMul: 1.3991, fill: 0.1643, variants: 3, weight: 7,
  build(b, r, v) {
    /* ⚠ "AN ARC OF TALL THICK SEGMENTS" IS A PALISADE. The old comment
       explains the segments as deliberate — vertical extent on purpose,
       because a curved sheet lying flat reads as a floor at chest height —
       and it is the same wrong axis the solar stage's bow shock and
       heliopause were stuck on. Thirteen tall elements in a row flute
       whatever they are made of. A shock front is ONE surface; `sheet()`
       makes one, and ghost means it no longer has to lie flat OR be chopped
       up to be safe. */
    const S = SP.shock, H = S * 0.86;
    const sweep = 2.0 + v * 0.2;
    b.ellip(S * 0.6, H * 0.42, S * 0.6, U_.redDim, { y: H * 0.44 }, 9, 6);
    b.decor((d) => {
      sheet(d, S * 1.05, H * 0.86, sweep, U_.shock, { y: H * 0.06, t: 0.04, bow: 0.2 }, 22);
      sheet(d, S * 0.78, H * 0.6, sweep * 0.86, U_.ember, { y: H * 0.14, t: 0.045, bow: 0.24 }, 18);
      // the gas being ploughed, trailing behind the front
      for (let i = 0; i < 6; i++) {
        const a = -sweep / 2 + r() * sweep;
        const dd = S * (0.7 + r() * 0.5);
        d.ellip(S * 0.2, H * 0.16, S * 0.14, U_.redDim,
          { x: Math.cos(a) * dd, y: H * (0.2 + r() * 0.3), z: Math.sin(a) * dd, ry: -a }, 6, 4);
      }
      d.ellip(S * 0.2, H * 0.22, S * 0.18, U_.gold, { x: -S * 0.5, y: H * 0.3 }, 9, 6);
    });
  } });

P({ id: 'u_cluster', name: 'Galaxy Cluster', cat: 'cluster', fill: 0.34, variants: 4, weight: 7,
  build(b, r, v) {
    /* Four nested ellipsoids at the centre — slate, slate-lit, gold, gold-pale,
       a whole brightness gradient — every one of them inside the envelope and
       none ever seen. The gradient is gone; the galaxies are on the surface,
       where a hundred galaxies in a bag of hot gas actually read as a hundred
       galaxies rather than as the bag. */
    const S = SP.cluster, H = S * 0.84;
    envelope(b, S, H, U_.spaceLit, 0.95);
    b.decor((d) => {
      // the brightest cluster galaxy, sitting proud at the top of the well
      d.ellip(S * 0.3, H * 0.2, S * 0.29, U_.slateLit, { y: H * 0.88 }, 9, 6);
      d.ellip(S * 0.16, H * 0.12, S * 0.15, U_.gold, { y: H * 0.92 }, 8, 5);
      d.ellip(S * 0.06, H * 0.05, S * 0.06, U_.goldPale, { y: H * 0.95 }, 6, 4);
      ringSwarm(d, S, H, 18 + v, [U_.goldDim, U_.redDim, U_.blueDim, U_.spaceLit, U_.amber], r, 0.055, 0.11);
    });
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
    /* The web rides ON the halo rather than inside it — see `u_compact`. For
       the filament props that means lifting the whole structure to the top
       surface, which is also the angle this stage is played from. */
    const S = SP.protocluster, H = S * 0.8;
    envelope(b, S, H, U_.spaceLit, 0.96);
    b.decor((d) => {
      node(d, 0, 0, S * 0.42, H * 1.6, 9, [U_.bluePale, U_.blue, U_.cyan, U_.ice], r, H * 0.32);
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * TAU + v * 0.6;
        const ex = Math.cos(a) * S * 1.05, ez = Math.sin(a) * S * 1.05;
        strand(d, Math.cos(a) * S * 0.3, Math.sin(a) * S * 0.3, ex, ez, H * 0.86, S * 0.06, 5, U_.blueDim, r, H * 0.12);
        node(d, ex * 0.94, ez * 0.94, S * 0.17, H * 1.1, 3, [U_.blue, U_.blueDim, U_.goldDim], r, H * 0.3);
      }
      d.ellip(S * 0.17, H * 0.15, S * 0.17, U_.ice, { y: H * 0.95 }, 9, 6);
    });
  } });

P({ id: 'u_core', name: 'Cluster Core', cat: 'cluster', fill: 0.42, variants: 3, weight: 6,
  build(b, r, v) {
    /* The cD galaxy is the subject of this prop and it was at dead centre,
       inside the envelope, invisible. It rides on top now — which is also what
       "sitting in the bottom of the well" looks like from outside, since the
       well is the thing you cannot see. */
    const S = SP.core, H = S * 0.96;
    envelope(b, S, H, U_.slate, 0.94);
    b.decor((d) => {
      d.ellip(S * 0.5, H * 0.26, S * 0.46, U_.goldDim, { y: H * 0.84, ry: v * 0.5 }, 9, 6);
      d.ellip(S * 0.28, H * 0.18, S * 0.26, U_.gold, { y: H * 0.88 }, 9, 6);
      d.ellip(S * 0.12, H * 0.1, S * 0.11, U_.goldPale, { y: H * 0.92 }, 7, 5);
      d.sphere(S * 0.05, U_.glow, { y: H * 0.95 }, 7, 5);
      ringSwarm(d, S, H, 14, [U_.redDim, U_.amber, U_.goldDim, U_.blueDim], r, 0.05, 0.1);
      // the cold fronts, sloshing round the core
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * TAU + 0.4;
        d.ellip(S * 0.1, H * 0.12, S * 0.03, U_.ice,
          { x: Math.cos(a) * S * 1.02, y: H * 0.62, z: Math.sin(a) * S * 1.02, ry: -a, rx: 0.4 }, 7, 4);
      }
    });
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
    /* ⚠ THE GAS WAS FIVE SLABS STANDING ON END, "hung on the same line but
       standing UP" — vertical because a horizontal one would have been a
       fence. Five tall elements in a row flute, which is why this prop read
       as a palisade. Ghost has no fence, so the gas lies ALONG the chain the
       way a filament's gas actually does: elements turned to follow the
       curve, welding into a tube rather than standing across it. */
    b.decor((d) => {
      /* ⚠ AND IT HAS TO BE FAT ENOUGH TO WELD THEM. First pass made the gas
         thin and the prop still fluted, because the pickets are the SOLID
         bodies and those cannot move without touching the box. So the gas is
         wide and heavily overlapping instead — it swallows the gaps between
         the knots and the chain reads as one strand with lumps in it, which
         is what a filament is. Ghost, so none of it is measured. */
      for (let i = 0; i < 11; i++) {
        const t = (i + 0.5) / 11;
        const x = -S * 0.62 + t * S * 1.24;
        const z = Math.sin(t * 3.3 + v) * S * 0.26;
        const dz = Math.cos(t * 3.3 + v) * 3.3 * S * 0.26;
        d.ellip(S * 0.24, H * (0.2 + Math.sin(t * Math.PI) * 0.1), S * 0.18, U_.slateLit, {
          x, y: H * 0.44, z, ry: -Math.atan2(dz, S * 1.24),
        }, 6, 4);
      }
    });
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
    /* ⚠ AND THE CURTAIN WAS FIVE MORE SLABS. `sheet()` makes a single
       continuous surface, which is exactly what "a dim curtain hung on the
       same plane" means and what five separate panels can never be — under
       flat shading each keeps its own silhouette however far they overlap.
       A wide arc of a big circle is a gently buckled plane, which is the
       shape a wall of galaxies has. */
    b.decor((d) => {
      /* ⚠ `sheet()` REVOLVES ABOUT THE ORIGIN, so an arc of radius R sits a
         whole R away from the middle of the prop. First pass put a perfectly
         good wall 1.55 S off to one side of the galaxies it is supposed to be
         the wall OF, and the prop read as a crowd standing next to a screen.
         Translating by -R brings the arc's midpoint back to the centre, so the
         sheet now runs through the galaxy plane the way the comment always
         said it did. */
      /* ⚠ `sheet()` REVOLVES ABOUT THE ORIGIN, so an arc of radius R sits a
         whole R from the middle of the prop, and `LatheGeometry` puts the
         phi = PI/2 midpoint on +X — not +Z, which is where the first repair
         translated it to. Two passes lost to that. Offsetting by -R on the
         RIGHT axis brings the arc's midpoint to the centre, so the sheet runs
         through the galaxy plane the way the comment always claimed. */
      const R = S * 1.55;
      sheet(d, R, H * 0.8, 1.2, U_.slate,
        { y: H * 0.06, x: -R, t: 0.03, bow: 0.1, phi0: Math.PI / 2 }, 20);
    });
  } });

P({ id: 'u_supercluster', name: 'Supercluster', cat: 'super', fill: 0.26, variants: 3, weight: 5,
  build(b, r, v) {
    const S = SP.supercluster, H = S * 0.78;
    // four clusters and the filaments that tie them together
    envelope(b, S, H, U_.spaceLit, 0.97);
    b.decor((d) => {
      const pts = [];
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * TAU + v * 0.5;
        const dd = S * (k === 0 ? 0.2 : 0.82);
        pts.push([Math.cos(a) * dd, Math.sin(a) * dd, k === 0 ? 0.3 : 0.19 + r() * 0.05]);
      }
      for (const [x, z, w] of pts) {
        d.ellip(S * w * 0.8, H * w * 0.7, S * w * 0.76, U_.slate, { x, y: H * 0.84, z }, 8, 5);
        node(d, x, z, S * w, H * 1.3, 5, [U_.goldDim, U_.amber, U_.redDim, U_.blueDim], r, H * 0.34);
        d.ellip(S * w * 0.24, H * w * 0.3, S * w * 0.22, U_.gold, { x, y: H * 0.88, z }, 7, 5);
      }
      for (let k = 1; k < 4; k++) {
        strand(d, pts[0][0], pts[0][1], pts[k][0] * 0.9, pts[k][1] * 0.9, H * 0.84, S * 0.055, 5, U_.haloLit, r, H * 0.08);
      }
      d.sphere(S * 0.05, U_.glow, { x: pts[0][0], y: H * 0.9, z: pts[0][1] }, 7, 5);
    });
  } });

P({ id: 'u_attractor', name: 'Great Attractor', cat: 'super', sizeMul: 1.0063, fill: 0.4280, variants: 3, weight: 4,
  build(b, r, v) {
    const S = SP.attractor, H = S * 0.92;
    // whatever it is, everything for a hundred megaparsecs is falling into it
    envelope(b, S, H, U_.slate, 0.96);
    b.decor((d) => {
      d.ellip(S * 0.36, H * 0.24, S * 0.34, U_.slateLit, { y: H * 0.86 }, 9, 6);
      d.ellip(S * 0.22, H * 0.16, S * 0.2, U_.goldDim, { y: H * 0.9 }, 9, 6);
      d.ellip(S * 0.11, H * 0.1, S * 0.1, U_.amber, { y: H * 0.94 }, 7, 5);
      d.sphere(S * 0.06, U_.glow, { y: H * 0.97 }, 7, 5);
      // the streams, coming in from every side and OVER the rim
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * TAU + v * 0.4;
        strand(d, Math.cos(a) * S * 1.2, Math.sin(a) * S * 1.2,
          Math.cos(a) * S * 0.28, Math.sin(a) * S * 0.28, H * 0.84, S * 0.05, 5,
          k % 2 ? U_.haloLit : U_.redDim, r, H * 0.12);
        node(d, Math.cos(a) * S * 1.1, Math.sin(a) * S * 1.1, S * 0.17, H * 1.2, 2,
          [U_.goldDim, U_.blueDim, U_.redDim], r, H * 0.3);
      }
    });
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
    envelope(b, S, H, U_.spaceLit, 0.97);
    b.decor((d) => {
      const pts = [[0, 0, 0.4], [0.78, -0.55, 0.26], [-0.66, 0.72, 0.28], [0.68, 0.74, 0.2], [-0.8, -0.64, 0.19]];
      for (const [fx, fz, w] of pts) {
        const x = fx * S, z = fz * S;
        d.ellip(S * w * 0.84, H * w * 0.6, S * w * 0.8, U_.slate, { x, y: H * 0.84, z }, 8, 5);
        d.ellip(S * w * 0.44, H * w * 0.38, S * w * 0.42, U_.slateLit, { x, y: H * 0.86, z }, 8, 5);
        node(d, x, z, S * w * 0.9, H * 1.2, 5, [U_.goldDim, U_.amber, U_.redDim, U_.blueDim, U_.spaceLit], r, H * 0.34);
        d.ellip(S * w * 0.2, H * w * 0.24, S * w * 0.18, U_.gold, { x, y: H * 0.9, z }, 7, 5);
      }
      for (let k = 1; k < pts.length; k++) {
        strand(d, pts[0][0] * S * 0.5, pts[0][1] * S * 0.5, pts[k][0] * S * 0.86, pts[k][1] * S * 0.86,
          H * 0.84, S * 0.045, 5, k % 2 ? U_.haloLit : U_.halo, r, H * 0.07);
      }
      // the void: a rim of dim galaxies round a piece of nothing
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU + v * 0.4;
        d.ellip(S * 0.07, H * 0.08, S * 0.06, i % 3 ? U_.violet : U_.violetDim, {
          x: Math.cos(a) * S * 0.42 - S * 0.06, y: H * 0.88, z: Math.sin(a) * S * 0.42 + S * 0.06, ry: -a,
        }, 7, 4);
      }
      d.sphere(S * 0.045, U_.glow, { y: H * 0.92 }, 7, 5);
    });
  } });
