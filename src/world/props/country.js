/* ============================================================
   Props for The World.  15km -> 2,600km.

   Everything in here is a MAP ICON, not a model. At one world
   unit to the kilometre a city is thirty boxes on a grey pad and
   a forest is eighteen green blobs, because the camera sits a
   few thousand kilometres up and silhouette plus colour is all
   that survives the trip. Detail spent below that is vertices
   thrown away — the stage carries ~4,600 of these at once.

   Sizing rule for the ladder: `pickup` is the cube root of the
   bounding box, so every archetype's box is chosen to land on a
   rung no more than about 35% above the one below it, unbroken
   from 16km to 1,780km — comfortably inside the 1.55x that
   `tools/balance.mjs` calls a hole. The stage then scatters them
   with a scale range, which fills in between the rungs and takes
   the top of the ladder out to 2,585km.

   MASS LIVES AT THE TOP AND THERE IS NOTHING TO BE DONE ABOUT IT.
   Growth counts `boxVol * fill`, and boxVol is pickup cubed, so
   the six biggest archetypes here carry 90% of the world between
   them and everything from a village to a volcano is texture.
   Re-sizing anything above `w_peninsula` moves the final ball
   size; re-sizing anything below it does not. Measure with
   `node tools/balance.mjs 0.9 --runs=5 --only=country`.

   `unit: 'geo'` on every one of them: without it the collection
   log prints a continent as a bare number in the same column as
   a drawing pin.
   ============================================================ */

import { defineProp } from './index.js';
import { C } from '../../render/palette.js';

/**
 * Every prop in this file is tagged, categorised and unitted identically, and
 * all three are load-bearing: no tag and the stage's scatter pool is empty, no
 * unit and the collection log lies about the size.
 */
const P = (def) => defineProp({ cat: 'country', tags: ['country'], unit: 'geo', ...def });

/* ------------------------------------------------------------------
   A globe's palette.

   The shared set in render/palette.js is a toy-box: bright plastics, wood,
   brick. A world seen from orbit needs colours it simply does not have —
   the blue-black of deep ocean, the teal fringe where the shelf comes up,
   the dead grey-green of tundra, and the amber a city throws at night.
   Not in palette.js on purpose; that set is shared with five other stages and
   none of them wants an abyssal blue. Exported only so the stage's terrain can
   paint its ocean and its coastlines out of the same tin as the props standing
   on them — nothing else should reach for it.
   ------------------------------------------------------------------ */
export const G = {
  ocean:     0x1d5c9c,
  oceanDeep: 0x123f73,
  shelf:     0x3ba5c6,
  lagoon:    0x74d6dc,
  surf:      0xdcf4f7,
  river:     0x54b6dd,

  plain:     0x77a84c,
  plainDry:  0xa3b45b,
  forest:    0x3c7a37,
  forestDk:  0x2b5c2a,
  jungle:    0x2f8446,
  steppe:    0xb7ad63,
  sand:      0xe3ca8b,
  sandDeep:  0xcaa863,

  rock:      0x8d8478,
  rockDk:    0x635c54,
  scree:     0xa9a294,
  tundra:    0x9fa495,
  ice:       0xe9f5fb,
  iceBlue:   0xc2e6f4,
  snow:      0xfcfdff,

  cloud:     0xf7fbff,
  cloudGrey: 0xd0dae4,

  glow:      0xffc65a,
  glowPale:  0xffe9a8,
  urban:     0x7d7b83,
  urbanDk:   0x55535c,

  lava:      0xff7b34,
  ash:       0x484450,
  metal:     0xc6ced5,
  metalDk:   0x7a838b,
  solar:     0x2b3a80,
};

/* ------------------------------------------------------------------
   Shared builders. A country, a subcontinent and a continent are the same
   drawing three times over at different sizes, and writing that three times
   over is how the three of them end up subtly inconsistent.
   ------------------------------------------------------------------ */

/**
 * A blobby landmass: overlapping discs with cliff sides, a deck one shade
 * lighter set very slightly proud, and a pale shelf skirt at the waterline so
 * the coast reads as a coast rather than as a cut-out.
 *
 * Returns the lobes as [x, z, r, top] so callers can put cities, ranges and
 * lakes on solid ground instead of hanging them over the sea.
 */
function landmass(b, R, H, rnd, cliff, deck, lobes = 5) {
  const parts = [[0, 0, R, H]];
  for (let i = 0; i < lobes; i++) {
    const a = (i / lobes) * Math.PI * 2 + (rnd() - 0.5) * 0.9;
    const d = R * (0.5 + rnd() * 0.35);
    parts.push([Math.cos(a) * d, Math.sin(a) * d, R * (0.28 + rnd() * 0.26), H * (0.72 + rnd() * 0.24)]);
  }
  // Three passes rather than three primitives per lobe, so the skirt of one
  // lobe never draws over the deck of its neighbour.
  for (const [x, z, r, h] of parts) b.cylOn(r * 1.13, h * 0.1, G.shelf, { x, z }, 9);
  for (const [x, z, r, h] of parts) b.cylOn(r, h, cliff, { x, z }, 10);
  const out = [];
  for (const [x, z, r, h] of parts) {
    b.cyl(r * 0.97, r * 0.97, h * 0.18, deck, { x, y: h * 1.02, z }, 10);
    out.push([x, z, r * 0.97, h * 1.11]);
  }
  return out;
}

/**
 * A city seen from orbit at night: a dark pad and a grid of blocks, a third
 * of them lit. `cols` squared blocks, so keep it small — this is the single
 * most repeated shape in the stage.
 */
function litGrid(b, S, H, base, cols, glowP, wall, rnd, x0 = 0, z0 = 0) {
  b.boxOn(S * 1.06, H * 0.06, S * 1.06, G.urbanDk, { x: x0, y: base, z: z0 });
  const step = S / cols;
  const y = base + H * 0.06;
  for (let i = 0; i < cols; i++) for (let k = 0; k < cols; k++) {
    if (rnd() < 0.17) continue;                       // parks, water, nothing
    const x = x0 - S / 2 + (i + 0.5) * step;
    const z = z0 - S / 2 + (k + 0.5) * step;
    const h = H * (0.3 + rnd() * rnd() * 1.4);
    b.boxOn(step * 0.62, h, step * 0.62, rnd() < glowP ? G.glow : wall, { x, y, z });
  }
}

/** A line of peaks with snow on the tall ones. */
function ridge(b, len, h, rnd, ang, n, rock = G.rock, cap = G.snow, y = 0) {
  const ca = Math.cos(ang), sa = Math.sin(ang);
  for (let i = 0; i < n; i++) {
    const t = (i / (n - 1) - 0.5) * len;
    const off = (rnd() - 0.5) * len * 0.16;
    const hh = h * (0.55 + rnd() * 0.55);
    const rr = hh * (0.62 + rnd() * 0.3);
    const x = ca * t - sa * off, z = sa * t + ca * off;
    b.cone(rr, hh, rock, { x, y: y + hh / 2, z }, 8);
    if (hh > h * 0.78) b.cone(rr * 0.4, hh * 0.34, cap, { x, y: y + hh * 0.85, z }, 7);
  }
}

/** A meandering line of segments — rivers, walls and roads all wander alike. */
function snake(b, len, wide, y, col, rnd, amp, n) {
  const ph = rnd() * 6.28;
  const seg = len / n;
  for (let i = 0; i < n; i++) {
    const t = (i / (n - 1) - 0.5) * len;
    const z = Math.sin(t / len * 5.2 + ph) * amp;
    const z2 = Math.sin((t + seg) / len * 5.2 + ph) * amp;
    const ry = -Math.atan2(z2 - z, seg);
    b.boxOn(seg * 1.25, wide * 0.5, wide, col, { x: t, y, z, ry });
  }
}

/* ==================================================================
   ON LAND — the works of small creatures, then the land itself
   ================================================================== */

P({ id: 'w_village', name: 'Village', cat: 'settlement', fill: 0.14, variants: 4, weight: 12,
  build(b, r, v) {
    const R = 12;
    b.cylOn(R, 1.2, G.plainDry, {}, 9);
    b.cylOn(R * 0.98, 0.5, [G.plain, G.plainDry, G.steppe, G.jungle][v], { y: 1.2 }, 9);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + r() * 0.8;
      const d = R * (0.2 + r() * 0.5);
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      b.boxOn(2.4, 2.0, 2.4, C.cream, { x, y: 1.7, z, ry: a });
      b.wedge(2.8, 1.3, 2.8, C.roofRed, { x, y: 3.7, z, ry: a });
    }
    b.boxOn(2.0, 4.0, 2.0, C.offwhite, { y: 1.7 });
    b.cone(1.4, 2.2, C.roofTile, { y: 6.8 }, 7);
    for (let i = 0; i < 3; i++) {
      const a = r() * Math.PI * 2, d = R * (0.55 + r() * 0.3);
      b.sphere(1.7, G.forest, { x: Math.cos(a) * d, y: 2.6, z: Math.sin(a) * d }, 7, 5);
    }
  } });

P({ id: 'w_windfarm', name: 'Wind Farm', cat: 'works', fill: 0.05, variants: 2, weight: 8,
  build(b, r, v) {
    const R = 15;
    b.cylOn(R, 1.0, v ? G.steppe : G.plain, {}, 9);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + 0.4;
      const d = R * (0.25 + (i % 3) * 0.26);
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      b.cylOn(0.34, 6.4, C.white, { x, y: 1.0, z }, 6);
      const spin = r() * 6.28;
      for (let k = 0; k < 3; k++) {
        const ba = spin + (k / 3) * Math.PI * 2;
        b.box(0.9, 4.6, 0.18, C.white,
          { x: x + Math.cos(ba + Math.PI / 2) * 2.3, y: 7.4 + Math.sin(ba + Math.PI / 2) * 2.3, z: z + 0.5, rz: ba });
      }
    }
  } });

P({ id: 'w_town', name: 'Market Town', cat: 'settlement', fill: 0.2, variants: 4, weight: 11,
  build(b, r, v) {
    const R = 22;
    b.cylOn(R, 1.4, G.plainDry, {}, 10);
    b.cylOn(R * 0.98, 0.6, [G.plain, G.steppe, G.plainDry, G.forest][v], { y: 1.4 }, 10);
    litGrid(b, R * 1.15, 6.4, 2.0, 4, 0.3, C.cream, r);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + r();
      const d = R * (0.68 + r() * 0.22);
      b.boxOn(3.2, 2.6, 3.2, C.tan, { x: Math.cos(a) * d, y: 2.0, z: Math.sin(a) * d, ry: a });
    }
    b.boxOn(2.6, 8.2, 2.6, C.offwhite, { x: -R * 0.2, y: 2.0, z: R * 0.16 });
    b.cone(1.9, 2.6, C.roofTile, { x: -R * 0.2, y: 11.5, z: R * 0.16 }, 7);
    for (let i = 0; i < 4; i++) {
      const a = r() * Math.PI * 2, d = R * (0.6 + r() * 0.3);
      b.sphere(2.4, G.forest, { x: Math.cos(a) * d, y: 3.0, z: Math.sin(a) * d }, 7, 5);
    }
  } });

P({ id: 'w_city', name: 'City', cat: 'settlement', fill: 0.28, variants: 4, weight: 9,
  build(b, r, v) {
    const R = 39;
    b.cylOn(R, 2.0, [G.plain, G.steppe, G.plainDry, G.forest][v], {}, 11);
    b.cylOn(R * 0.99, 0.7, G.plainDry, { y: 2.0 }, 11);
    litGrid(b, R * 1.34, 15, 2.7, 6, 0.36, G.urban, r);
    // ring road, and a river through the middle
    b.torus(R * 0.86, R * 0.028, G.urbanDk, { y: 3.4, rx: Math.PI / 2 }, 4, 18);
    snake(b, R * 2, R * 0.1, 3.0, G.river, r, R * 0.16, 7);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.5, d = R * 0.8;
      b.boxOn(3.6, 18 + r() * 8, 3.6, r() < 0.5 ? G.glow : G.urban,
        { x: Math.cos(a) * d * 0.5, y: 2.7, z: Math.sin(a) * d * 0.5 });
    }
    for (let i = 0; i < 5; i++) {
      const a = r() * Math.PI * 2, d = R * (0.72 + r() * 0.26);
      b.sphere(3.0, G.forest, { x: Math.cos(a) * d, y: 3.4, z: Math.sin(a) * d }, 7, 5);
    }
  } });

P({ id: 'w_airport', name: 'International Airport', cat: 'works', fill: 0.1, variants: 2, weight: 7,
  build(b, r, v) {
    const L = 138, W = 100;
    b.boxOn(L, 1.6, W, G.plainDry, {});
    b.boxOn(L * 0.94, 0.9, 13, G.urbanDk, { y: 1.6, z: -W * 0.22 });
    b.boxOn(L * 0.82, 0.9, 11, G.urbanDk, { y: 2.6, z: W * 0.2, ry: v ? 0.06 : -0.05 });
    for (let i = 0; i < 14; i++) {
      b.box(4.4, 0.4, 0.9, C.offwhite, { x: -L * 0.44 + i * (L * 0.066), y: 2.6, z: -W * 0.22 });
    }
    // terminal, piers and a tower
    b.boxOn(34, 8, 15, C.lightgrey, { y: 1.6, z: W * 0.02 });
    b.boxOn(35, 1.4, 16, G.metal, { y: 9.6, z: W * 0.02 });
    for (const s of [-1, 1]) b.boxOn(6, 5, 22, C.offwhite, { x: s * 20, y: 1.6, z: W * 0.02 });
    b.cylOn(1.8, 14, C.white, { x: -26, y: 1.6, z: W * 0.1 }, 8);
    b.taperOn(4.2, 2.6, 3.6, G.metal, { x: -26, y: 15.6, z: W * 0.1 }, 8);
    // parked aircraft: a cross is enough at this range
    for (let i = 0; i < 7; i++) {
      const x = -L * 0.34 + i * (L * 0.11), z = W * 0.02 + (i % 2 ? 15 : -15);
      b.box(3.2, 1.0, 11, C.white, { x, y: 3.4, z });
      b.box(15, 0.7, 3.0, C.white, { x, y: 3.4, z });
      b.box(2.4, 3.0, 0.7, C.blue, { x, y: 4.6, z: z - 4.4 });
    }
    for (let i = 0; i < 4; i++) {
      const a = r() * Math.PI * 2;
      b.sphere(4.0, G.forest, { x: Math.cos(a) * L * 0.4, y: 2.4, z: Math.sin(a) * W * 0.44 }, 7, 5);
    }
  } });

P({ id: 'w_dam', name: 'Great Dam', cat: 'works', fill: 0.24, variants: 2, weight: 7,
  build(b, r, v) {
    const W = 112, D = 88;
    // gorge walls
    for (const s of [-1, 1]) {
      b.boxOn(W * 0.28, 26, D, G.rockDk, { x: s * W * 0.36, y: 0 });
      b.cone(20, 24, G.rock, { x: s * W * 0.4, y: 26, z: -D * 0.2 }, 8);
    }
    // the reservoir behind it, and the tailrace in front
    b.boxOn(W * 0.72, 20, D * 0.52, G.river, { z: -D * 0.24 });
    b.boxOn(W * 0.5, 2.0, D * 0.3, G.river, { z: D * 0.34 });
    // the wall: an arc of leaning slabs
    const N = 11;
    for (let i = 0; i < N; i++) {
      const t = (i / (N - 1) - 0.5);
      const x = t * W * 0.74;
      const z = Math.cos(t * 2.2) * 7 - 6;
      b.boxOn(W * 0.075, 28, 9, C.concrete, { x, y: 0, z, ry: -t * 0.5, rx: 0.06 });
    }
    b.boxOn(W * 0.78, 2.4, 12, C.concreteD, { y: 28, z: -5.4 });
    for (let i = 0; i < 6; i++) b.boxOn(1.0, 3.4, 1.0, G.glowPale, { x: -W * 0.32 + i * (W * 0.128), y: 30.4, z: -1.4 });
    // spillway plume and power house
    if (v) for (let i = 0; i < 3; i++) b.boxOn(6, 22, 5, G.surf, { x: -14 + i * 14, y: 2, z: 1.5, rx: -0.14 });
    b.boxOn(20, 7, 12, G.metalDk, { y: 0, z: D * 0.3 });
    b.boxOn(21, 1.2, 13, G.metal, { y: 7, z: D * 0.3 });
  } });

P({ id: 'w_spaceport', name: 'Space Centre', cat: 'works', fill: 0.09, weight: 6, variants: 2,
  build(b, r, v) {
    const S = 88;
    b.cylOn(S * 0.5, 1.6, G.steppe, {}, 10);
    b.cylOn(S * 0.2, 0.9, C.concrete, { y: 1.6 }, 10);
    // vehicle assembly building
    b.boxOn(24, 26, 22, C.offwhite, { x: -S * 0.3, y: 1.6, z: S * 0.18 });
    b.box(24.4, 8, 22.4, G.solar, { x: -S * 0.3, y: 21, z: S * 0.18 });
    b.boxOn(25, 1.6, 23, C.lightgrey, { x: -S * 0.3, y: 27.6, z: S * 0.18 });
    // the rocket on its pad
    const rx = S * 0.12, rz = -S * 0.06;
    b.cylOn(3.2, 44, C.white, { x: rx, y: 2.5, z: rz }, 10);
    for (let i = 0; i < 3; i++) b.cyl(3.3, 3.3, 1.4, C.redDark, { x: rx, y: 12 + i * 14, z: rz }, 10);
    b.cone(3.2, 10, C.white, { x: rx, y: 51.5, z: rz }, 10);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      b.box(2.6, 8, 0.7, C.lightgrey, { x: rx + Math.cos(a) * 3.4, y: 6.5, z: rz + Math.sin(a) * 3.4, ry: -a });
    }
    b.boxOn(3.4, 52, 3.4, G.metalDk, { x: rx - 7.5, y: 2.5, z: rz });
    b.boxOn(9, 2.0, 3.2, G.metalDk, { x: rx - 3.6, y: 44, z: rz });
    if (v) b.dome(9, G.metal, { x: S * 0.32, y: 1.6, z: -S * 0.26 }, 10);
    // tracking dishes and the crawlerway
    for (let i = 0; i < 3; i++) {
      const x = S * 0.3, z = -S * 0.04 + i * 11;
      b.cylOn(0.7, 4, G.metalDk, { x, y: 1.6, z }, 6);
      b.taperOn(6.0, 1.4, 3.4, C.white, { x, y: 5.6, z, rz: 0.4 }, 9);
    }
    b.boxOn(52, 0.8, 11, C.concreteD, { x: -S * 0.08, y: 1.7, z: S * 0.06, ry: 0.24 });
  } });

P({ id: 'w_pyramids', name: 'Pyramid Complex', cat: 'works', fill: 0.15, variants: 2, weight: 6,
  build(b, r, v) {
    const S = 128;
    b.cylOn(S * 0.5, 2.2, G.sand, {}, 11);
    b.cylOn(S * 0.46, 0.8, G.sandDeep, { y: 2.2 }, 11);
    const set = [[-16, -10, 46, 38], [18, 4, 34, 28], [40, 22, 22, 18]];
    for (const [x, z, w, h] of set) {
      b.pyramid(w, h, G.sandDeep, { x, y: 3.0 + h / 2, z, ry: 0.18 });
      b.pyramid(w * 0.42, h * 0.4, G.sand, { x, y: 3.0 + h * 0.8, z, ry: 0.18 });
    }
    // causeway, temple, and a hard-edged shadow of a river
    b.boxOn(54, 1.2, 8, G.sandDeep, { x: -4, y: 3.0, z: 34, ry: -0.3 });
    b.boxOn(16, 6, 12, C.tan, { x: -34, y: 3.0, z: 44 });
    for (let i = 0; i < 6; i++) b.cylOn(1.2, 8, C.cream, { x: -40 + i * 2.6, y: 9.0, z: 44 }, 6);
    b.boxOn(S * 0.9, 1.6, 13, G.river, { x: 0, y: 2.4, z: -S * 0.34, ry: 0.1 });
    for (let i = 0; i < (v ? 7 : 4); i++) {
      const a = r() * Math.PI * 2, d = S * (0.24 + r() * 0.2);
      b.sphere(2.6, G.jungle, { x: Math.cos(a) * d, y: 4.0, z: -S * 0.32 + Math.sin(a) * 8 }, 6, 4);
    }
  } });

P({ id: 'w_megacity', name: 'Megacity', cat: 'settlement', fill: 0.3, variants: 3, weight: 7,
  build(b, r, v) {
    const R = 100;
    b.cylOn(R, 3.4, G.plainDry, {}, 12);
    b.cylOn(R * 0.99, 1.0, [G.plain, G.steppe, G.forest][v], { y: 3.4 }, 12);
    // a bay bitten out of one side, so it does not read as a pure disc
    b.cylOn(R * 0.42, 3.0, G.shelf, { x: R * 0.72, z: R * 0.3 }, 10);
    litGrid(b, R * 1.15, 34, 4.4, 8, 0.4, G.urban, r);
    litGrid(b, R * 0.5, 20, 4.4, 4, 0.5, G.urban, r, -R * 0.62, R * 0.5);
    litGrid(b, R * 0.44, 16, 4.4, 4, 0.28, G.urban, r, R * 0.5, -R * 0.6);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3, d = R * 0.3;
      b.boxOn(6.4, 40 + r() * 26, 6.4, i % 2 ? G.glow : G.urbanDk,
        { x: Math.cos(a) * d, y: 4.4, z: Math.sin(a) * d });
    }
    b.torus(R * 0.9, R * 0.02, G.urbanDk, { y: 5.2, rx: Math.PI / 2 }, 4, 22);
    snake(b, R * 2.1, R * 0.075, 4.6, G.river, r, R * 0.2, 8);
    for (let i = 0; i < 5; i++) {
      const a = r() * Math.PI * 2, d = R * (0.62 + r() * 0.3);
      b.sphere(6, G.forest, { x: Math.cos(a) * d, y: 5.4, z: Math.sin(a) * d }, 7, 5);
    }
  } });

P({ id: 'w_forest', name: 'Great Forest', cat: 'nature', fill: 0.19, variants: 3, weight: 8,
  build(b, r, v) {
    const R = 128, cols = [G.forest, G.forestDk, G.jungle];
    b.cylOn(R, 4.0, G.forestDk, {}, 12);
    b.cylOn(R * 0.98, 1.2, cols[v], { y: 4.0 }, 12);
    for (let i = 0; i < 18; i++) {
      const a = r() * Math.PI * 2, d = R * Math.sqrt(r()) * 0.92;
      const rr = R * (0.11 + r() * 0.13);
      b.sphere(rr, i % 3 ? cols[v] : G.forestDk,
        { x: Math.cos(a) * d, y: 5.2 + rr * 0.6, z: Math.sin(a) * d }, 7, 5);
    }
    // a clearing, a lake and a road out
    b.cylOn(R * 0.17, 1.0, G.plain, { x: R * 0.3, y: 5.2, z: -R * 0.28 }, 9);
    b.cylOn(R * 0.13, 1.4, G.river, { x: -R * 0.36, y: 5.0, z: R * 0.2 }, 9);
    snake(b, R * 1.9, R * 0.045, 5.4, G.sandDeep, r, R * 0.22, 8);
  } });

P({ id: 'w_wall', name: 'The Long Wall', cat: 'works', fill: 0.07, variants: 3, weight: 6,
  build(b, r, v) {
    const L = 520;
    // hills for it to snake over
    for (let i = 0; i < 9; i++) {
      const t = (i / 8 - 0.5) * L * 0.96;
      const z = Math.sin(t / L * 5.2) * L * 0.3;
      b.cone(L * (0.07 + r() * 0.05), 16 + r() * 14, i % 2 ? G.steppe : G.rock,
        { x: t + (r() - 0.5) * 20, y: 9, z: z + (r() - 0.5) * 40 }, 8);
    }
    b.cylOn(L * 0.5, 3.0, G.steppe, {}, 12);
    const ph = v * 1.1;
    const N = 26, seg = L / N;
    for (let i = 0; i < N; i++) {
      const t = (i / (N - 1) - 0.5) * L;
      const z = Math.sin(t / L * 5.2 + ph) * L * 0.3;
      const z2 = Math.sin((t + seg) / L * 5.2 + ph) * L * 0.3;
      const ry = -Math.atan2(z2 - z, seg);
      const y = 3.0 + Math.max(0, Math.sin(t / L * 4.1) * 9);
      b.boxOn(seg * 1.3, 9, 7, C.concreteD, { x: t, y, z, ry });
      b.boxOn(seg * 1.3, 1.6, 8.4, C.concrete, { x: t, y: y + 9, z, ry });
      if (i % 5 === 2) {
        b.boxOn(12, 15, 12, C.concrete, { x: t, y, z, ry });
        b.boxOn(14, 1.8, 14, C.lightgrey, { x: t, y: y + 15, z, ry });
      }
    }
  } });

P({ id: 'w_volcano', name: 'Volcano', cat: 'nature', fill: 0.24, variants: 3, weight: 7,
  build(b, r, v) {
    const R = 148, H = 96;
    b.cylOn(R, 6, G.rockDk, {}, 12);
    b.cone(R * 0.92, H, G.ash, { y: 6 + H / 2 }, 10);
    b.cone(R * 0.5, H * 0.42, G.rockDk, { y: 6 + H * 0.72 }, 9);
    b.cyl(R * 0.16, R * 0.22, 8, G.lava, { y: 6 + H * 0.97 }, 9);
    // lava tongues down one flank
    for (let i = 0; i < 3; i++) {
      const a = 0.6 + i * 0.5;
      b.box(R * 0.07, 4, R * 0.72, G.lava,
        { x: Math.cos(a) * R * 0.36, y: 6 + H * 0.42, z: Math.sin(a) * R * 0.36, ry: -a, rx: -0.55 });
    }
    // the plume, leaning downwind
    for (let i = 0; i < 7; i++) {
      const t = i / 6;
      b.ellip(R * (0.13 + t * 0.24), R * (0.1 + t * 0.16), R * (0.13 + t * 0.24),
        i > 3 ? G.cloudGrey : G.ash,
        { x: t * R * 0.7 * (v - 1), y: 6 + H + t * H * 0.52, z: t * R * 0.3 }, 8, 5);
    }
    for (let i = 0; i < 5; i++) {
      const a = r() * Math.PI * 2, d = R * (0.72 + r() * 0.26);
      b.sphere(R * 0.09, G.forest, { x: Math.cos(a) * d, y: 8, z: Math.sin(a) * d }, 6, 4);
    }
  } });

P({ id: 'w_canyon', name: 'Great Canyon', cat: 'nature', fill: 0.28, variants: 3, weight: 7,
  build(b, r, v) {
    const W = 440, D = 400, H = 64;
    b.boxOn(W, H * 0.34, D, G.sandDeep, {});
    // terraced plateau either side of a gorge that wanders down the middle
    const N = 9;
    for (let i = 0; i < N; i++) {
      const t = (i / (N - 1) - 0.5) * W;
      const c = Math.sin(t / W * 4.6 + v) * D * 0.16;
      for (const s of [-1, 1]) {
        const z0 = c + s * (D * 0.13 + 14);
        b.boxOn(W / N * 1.12, H * 0.5, D * 0.3, G.rock, { x: t, y: H * 0.34, z: z0 + s * D * 0.16 });
        b.boxOn(W / N * 1.12, H * 0.34, D * 0.16, G.sand, { x: t, y: H * 0.34, z: z0 + s * D * 0.03 });
        b.boxOn(W / N * 1.12, H * 0.2, D * 0.08, G.sandDeep, { x: t, y: H * 0.34, z: z0 - s * D * 0.03 });
      }
      b.boxOn(W / N * 1.2, 1.4, D * 0.09, G.river, { x: t, y: H * 0.34, z: c });
    }
    // buttes standing in the gorge
    for (let i = 0; i < 4; i++) {
      const t = (r() - 0.5) * W * 0.8;
      const c = Math.sin(t / W * 4.6 + v) * D * 0.16;
      b.cylOn(D * (0.03 + r() * 0.03), H * (0.5 + r() * 0.4), G.rock, { x: t, y: H * 0.34, z: c + (r() - 0.5) * 30 }, 7);
    }
    for (let i = 0; i < 5; i++) {
      b.sphere(D * 0.035, G.steppe, { x: (r() - 0.5) * W * 0.9, y: H * 0.9, z: (r() - 0.5) * D * 0.9 }, 6, 4);
    }
  } });

P({ id: 'w_lake', name: 'Great Lake', cat: 'nature', fill: 0.26, variants: 3, weight: 7,
  build(b, r, v) {
    const R = 250, H = 80;
    // the land it is set into, then the water, then a deeper middle
    const lobes = landmass(b, R, H * 0.62, r, G.rockDk, [G.plain, G.forest, G.steppe][v], 4);
    const top = lobes[0][3];
    b.cylOn(R * 0.66, 3.0, G.shelf, { y: top - 3.4 }, 12);
    b.cylOn(R * 0.6, 2.6, G.river, { y: top - 1.4 }, 12);
    b.cylOn(R * 0.34, 1.8, G.ocean, { x: -R * 0.1, y: top + 0.2, z: R * 0.08 }, 11);
    for (let i = 0; i < 4; i++) {
      const a = r() * Math.PI * 2, d = R * 0.44 * r();
      b.cylOn(R * (0.03 + r() * 0.04), 5, G.forest, { x: Math.cos(a) * d, y: top - 0.6, z: Math.sin(a) * d }, 7);
    }
    // outflow river and a town on the shore
    b.boxOn(R * 0.9, 2.2, R * 0.07, G.river, { x: R * 0.62, y: top - 0.6, z: -R * 0.3, ry: 0.5 });
    litGrid(b, R * 0.2, 9, top, 3, 0.4, C.cream, r, -R * 0.66, -R * 0.2);
  } });

P({ id: 'w_delta', name: 'Great Delta', cat: 'nature', fill: 0.21, variants: 3, weight: 7,
  build(b, r, v) {
    const R = 330, H = 92;
    b.cylOn(R * 0.94, H * 0.5, G.rockDk, { z: -R * 0.2 }, 12);
    b.cylOn(R * 0.92, H * 0.14, G.jungle, { y: H * 0.5, z: -R * 0.2 }, 12);
    // the fan: silt lobes spreading into a shelf
    for (let i = 0; i < 7; i++) {
      const a = -Math.PI * 0.5 + (i / 6 - 0.5) * 1.9;
      const d = R * (0.5 + r() * 0.4);
      b.cylOn(R * (0.16 + r() * 0.1), H * 0.42, G.sandDeep,
        { x: Math.cos(a) * d, z: -R * 0.2 + Math.sin(a) * d }, 9);
    }
    b.cylOn(R * 0.86, H * 0.08, G.shelf, { y: 0, z: -R * 0.58 }, 12);
    // distributaries
    const y = H * 0.62;
    for (let i = 0; i < 9; i++) {
      const a = -Math.PI * 0.5 + (i / 8 - 0.5) * 2.0;
      const len = R * (0.6 + r() * 0.4);
      b.boxOn(len, 2.4, R * 0.035, G.river,
        { x: Math.cos(a) * len * 0.5, y: y - 2.6, z: -R * 0.2 + Math.sin(a) * len * 0.5, ry: -a - Math.PI / 2 });
    }
    b.boxOn(R * 0.1, 3.0, R * 0.8, G.river, { y: y - 2.6, z: R * 0.16 });
    for (let i = 0; i < 10; i++) {
      const a = r() * Math.PI * 2, d = R * 0.6 * Math.sqrt(r());
      b.sphere(R * (0.05 + r() * 0.05), G.jungle, { x: Math.cos(a) * d, y, z: -R * 0.2 + Math.sin(a) * d }, 6, 4);
    }
    litGrid(b, R * 0.24, 12, y, 4, 0.42, C.cream, r, R * 0.34 * (v - 1), -R * 0.02);
  } });

P({ id: 'w_range', name: 'Mountain Range', cat: 'nature', fill: 0.28, variants: 3, weight: 7,
  build(b, r, v) {
    const L = 760, H = 190;
    b.boxOn(L, H * 0.1, L * 0.5, G.rockDk, { ry: 0.1 });
    b.boxOn(L * 0.98, H * 0.05, L * 0.46, G.scree, { y: H * 0.1, ry: 0.1 });
    ridge(b, L * 0.92, H * 0.86, r, 0.1 + v * 0.05, 11, G.rock, G.snow, H * 0.14);
    ridge(b, L * 0.7, H * 0.5, r, 0.42, 7, G.rockDk, G.ice, H * 0.14);
    // glaciers and a valley
    for (let i = 0; i < 4; i++) {
      const t = (r() - 0.5) * L * 0.7;
      b.boxOn(L * 0.05, 5, L * 0.16, G.iceBlue, { x: t, y: H * 0.3, z: L * 0.1, rx: 0.24 });
    }
    b.boxOn(L * 0.96, 2.6, L * 0.05, G.river, { y: H * 0.15, z: -L * 0.17, ry: 0.07 });
    for (let i = 0; i < 7; i++) {
      b.sphere(L * 0.024, G.forest, { x: (r() - 0.5) * L * 0.9, y: H * 0.18, z: -L * 0.19 + (r() - 0.5) * L * 0.12 }, 6, 4);
    }
  } });

P({ id: 'w_dunes', name: 'Sand Sea', cat: 'nature', fill: 0.28, variants: 3, weight: 7,
  build(b, r, v) {
    const R = 440, H = 140;
    b.cylOn(R, H * 0.2, G.sandDeep, {}, 12);
    b.cylOn(R * 0.99, H * 0.06, G.sand, { y: H * 0.2 }, 12);
    // dune ridges, all combed the same way by the same wind
    const ang = 0.3 + v * 0.4;
    for (let i = 0; i < 13; i++) {
      const off = (i / 12 - 0.5) * R * 1.5;
      const len = R * (1.1 + r() * 0.5) * Math.sqrt(Math.max(0.06, 1 - (off / (R * 0.9)) ** 2));
      const x = -Math.sin(ang) * off, z = Math.cos(ang) * off;
      b.ellip(len * 0.5, H * (0.24 + r() * 0.3), R * (0.05 + r() * 0.03), G.sand,
        { x, y: H * 0.26, z, ry: ang }, 9, 5);
    }
    // rock outcrops and an oasis
    for (let i = 0; i < 3; i++) {
      const a = r() * Math.PI * 2, d = R * (0.3 + r() * 0.5);
      b.cylOn(R * 0.05, H * (0.3 + r() * 0.3), G.rockDk, { x: Math.cos(a) * d, y: H * 0.2, z: Math.sin(a) * d }, 7);
    }
    b.cylOn(R * 0.07, 3, G.river, { x: R * 0.3, y: H * 0.24, z: -R * 0.34 }, 9);
    for (let i = 0; i < 5; i++) {
      const a = r() * Math.PI * 2;
      b.sphere(R * 0.026, G.jungle, { x: R * 0.3 + Math.cos(a) * R * 0.09, y: H * 0.3, z: -R * 0.34 + Math.sin(a) * R * 0.09 }, 6, 4);
    }
  } });

P({ id: 'w_icecap', name: 'Ice Cap', cat: 'nature', fill: 0.4, variants: 3, weight: 6,
  build(b, r, v) {
    const R = 430, H = 176;
    const lobes = landmass(b, R, H * 0.72, r, G.iceBlue, G.snow, 4);
    const top = lobes[0][3];
    // pressure ridges and a dome in the middle
    b.dome(R * 0.34, G.snow, { y: top - 2 }, 12);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + r();
      const d = R * (0.3 + r() * 0.5);
      b.boxOn(R * (0.3 + r() * 0.3), H * 0.12, R * 0.05, G.ice,
        { x: Math.cos(a) * d, y: top - 4, z: Math.sin(a) * d, ry: a + 1.2 });
    }
    // crevasse field and melt ponds
    for (let i = 0; i < 6; i++) {
      const a = r() * Math.PI * 2, d = R * 0.6 * r();
      b.boxOn(R * (0.16 + r() * 0.2), 2.4, R * 0.014, G.iceBlue,
        { x: Math.cos(a) * d, y: top, z: Math.sin(a) * d, ry: r() * 3.14 });
      b.cylOn(R * (0.03 + r() * 0.03), 2.0, G.shelf, { x: Math.cos(a) * d * 1.2, y: top, z: Math.sin(a) * d * 1.1 }, 7);
    }
    if (v) for (let i = 0; i < 4; i++) {
      const a = r() * Math.PI * 2;
      b.cone(R * 0.06, H * 0.3, G.rockDk, { x: Math.cos(a) * R * 0.8, y: top * 0.7, z: Math.sin(a) * R * 0.8 }, 7);
    }
  } });

P({ id: 'w_peninsula', name: 'Long Peninsula', cat: 'land', fill: 0.33, variants: 4, weight: 6,
  build(b, r, v) {
    const H = 190, L = 1500;
    // a wide root that tapers into a finger of land
    const N = 8;
    const pts = [];
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1);
      const x = -L * 0.5 + t * L;
      const z = Math.sin(t * 3.1 + v) * L * 0.11;
      const rr = L * (0.19 - t * 0.115) * (0.85 + r() * 0.3);
      const h = H * (0.62 + (1 - t) * 0.3) * (0.86 + r() * 0.2);
      pts.push([x, z, rr, h]);
    }
    for (const [x, z, rr, h] of pts) b.cylOn(rr * 1.12, h * 0.09, G.shelf, { x, z }, 9);
    for (const [x, z, rr, h] of pts) b.cylOn(rr, h, G.rockDk, { x, z }, 10);
    const top = [];
    for (const [x, z, rr, h] of pts) {
      b.cyl(rr * 0.97, rr * 0.97, h * 0.18, v % 2 ? G.plain : G.forest, { x, y: h * 1.02, z }, 10);
      top.push([x, z, rr * 0.9, h * 1.11]);
    }
    // a spine of mountains and a city on the sheltered side
    ridge(b, L * 0.72, H * 0.5, r, 0.06, 9, G.rock, G.snow, H * 0.9);
    litGrid(b, L * 0.09, H * 0.16, top[1][3], 4, 0.42, C.cream, r, top[1][0], top[1][1]);
    litGrid(b, L * 0.06, H * 0.1, top[5][3], 3, 0.42, C.cream, r, top[5][0], top[5][1]);
    for (let i = 0; i < 8; i++) {
      const p = top[1 + Math.floor(r() * (N - 2))];
      const a = r() * Math.PI * 2, d = p[2] * 0.7 * r();
      b.sphere(L * 0.022, G.forest, { x: p[0] + Math.cos(a) * d, y: p[3], z: p[1] + Math.sin(a) * d }, 6, 4);
    }
  } });

/* ---- the big four: same drawing, four sizes ---- */

/**
 * A country. Coastline, one or two biomes on the deck, a range down one side,
 * an inland water, and cities glowing on the flat parts.
 *
 * The four sizes below differ only in R/H and how much gets drawn on top —
 * which is the honest relationship between a country and a continent.
 */
function nation(b, r, o) {
  const { R, H, cities, blobs, biome, ranges, ice, desert } = o;
  const lobes = landmass(b, R, H, r, G.rockDk, biome[0], o.lobes ?? 5);
  const top = lobes[0][3];
  // second biome painted over part of the deck
  for (let i = 0; i < blobs; i++) {
    const a = r() * Math.PI * 2, d = R * 0.62 * Math.sqrt(r());
    const rr = R * (0.16 + r() * 0.2);
    b.cylOn(rr, H * 0.05, biome[1 + (i % (biome.length - 1))],
      { x: Math.cos(a) * d, y: top - H * 0.02, z: Math.sin(a) * d }, 9);
  }
  if (desert) b.cylOn(R * 0.4, H * 0.07, G.sand, { x: R * 0.22, y: top - H * 0.02, z: -R * 0.2 }, 10);
  if (ice) {
    b.cylOn(R * 0.44, H * 0.09, G.snow, { x: -R * 0.3, y: top - H * 0.02, z: -R * 0.44 }, 10);
    b.cylOn(R * 0.2, H * 0.05, G.ice, { x: -R * 0.36, y: top + H * 0.06, z: -R * 0.5 }, 9);
  }
  // inland sea
  /* The lake sits in a basin, and both discs need their own plane. Every biome
     patch above starts at `top - H*0.02`, so a shelf or a river surface sharing
     that height z-fights with whichever patch it overlaps — a horizontal pair of
     different colours, which is the shimmering class `npm run coplanar` guards.
     0.037 and 0.058 are not round numbers on purpose: they must not coincide
     with 0.02, 0.04 or each other. */
  b.cylOn(R * 0.2, H * 0.06, G.shelf, { x: -R * 0.3, y: top - H * 0.037, z: R * 0.3 }, 10);
  b.cylOn(R * 0.16, H * 0.05, G.river, { x: -R * 0.3, y: top - H * 0.058, z: R * 0.3 }, 10);
  // ranges
  for (let i = 0; i < ranges; i++) {
    const a = r() * Math.PI * 2, d = R * (0.2 + r() * 0.4);
    ridge(b, R * (0.7 + r() * 0.5), H * (0.34 + r() * 0.2), r, a, 8, G.rock, G.snow, top - H * 0.03);
  }
  /* Rivers are CUT INTO the deck, not laid on it. `boxOn` puts the bottom face
     at the given y, so `y: top` sat the river's underside in exactly the plane of
     the land's top surface — a blue face and a green face fighting along the
     whole length of the river, on five different landmass props. Sinking it most
     of its own depth leaves a sliver of water proud of the ground, which is what
     a river looks like anyway. */
  for (let i = 0; i < 2; i++) {
    const a = r() * Math.PI * 2;
    b.boxOn(R * 1.2, H * 0.03, R * 0.035, G.river,
      { x: Math.cos(a) * R * 0.2, y: top - H * 0.026, z: Math.sin(a) * R * 0.2, ry: a });
  }
  // cities, on the lobes so none of them is out at sea
  for (let i = 0; i < cities; i++) {
    const p = lobes[i % lobes.length];
    const a = r() * Math.PI * 2, d = p[2] * 0.55 * r();
    litGrid(b, R * 0.15, H * 0.24, p[3], 4, 0.42, G.urban, r,
      p[0] + Math.cos(a) * d, p[1] + Math.sin(a) * d);
  }
  // forest cover
  for (let i = 0; i < o.trees; i++) {
    const p = lobes[Math.floor(r() * lobes.length)];
    const a = r() * Math.PI * 2, d = p[2] * 0.8 * Math.sqrt(r());
    b.sphere(R * (0.03 + r() * 0.03), r() < 0.5 ? G.forest : G.forestDk,
      { x: p[0] + Math.cos(a) * d, y: p[3], z: p[1] + Math.sin(a) * d }, 6, 4);
  }
}

P({ id: 'w_country_small', name: 'Island Nation', cat: 'land', fill: 0.4, variants: 4, weight: 6,
  build(b, r, v) {
    nation(b, r, {
      R: 480, H: 280, lobes: 5, cities: 2, blobs: 3, trees: 9, ranges: 1,
      ice: false, desert: v === 1,
      biome: [[G.plain, G.forest, G.steppe, G.jungle][v], G.forest, G.plainDry],
    });
  } });

P({ id: 'w_country_large', name: 'Great Republic', cat: 'land', fill: 0.44, variants: 3, weight: 5,
  build(b, r, v) {
    nation(b, r, {
      R: 630, H: 360, lobes: 6, cities: 4, blobs: 5, trees: 13, ranges: 2,
      ice: v === 2, desert: v !== 1,
      biome: [[G.plain, G.steppe, G.forest][v], G.forest, G.plainDry, G.jungle],
    });
  } });

P({ id: 'w_subcontinent', name: 'Subcontinent', cat: 'land', fill: 0.48, variants: 3, weight: 4,
  build(b, r, v) {
    nation(b, r, {
      R: 800, H: 455, lobes: 6, cities: 6, blobs: 7, trees: 17, ranges: 3,
      ice: v === 0, desert: true,
      biome: [[G.plain, G.jungle, G.steppe][v], G.forest, G.plainDry, G.steppe],
    });
  } });

/* THE BIGGEST THING IN THE STAGE, AND IT HAS TO BE EDIBLE.
 *
 * A prop is collectable when `pickup <= diameter * pickupRatio`, and the largest
 * diameter that can ever exist is set by the stage's total mass. Both numbers
 * come out of the same stage, so it is entirely possible — and was true here —
 * to author something that NOTHING can ever swallow. At R: 1010 this had a
 * pickup of 2585km and needed a ball of 2937km, while eating every other object
 * in the world only gets you to 2518km. The stage was unclearable, and it looked
 * like a bug in the physics rather than an arithmetic error in a landmark.
 *
 * The city had exactly this once, with two mountains at 287m against a 272m
 * ceiling, and the lesson did not stick because nothing checked it. `balance`
 * now reports "too big to ever collect", so this cannot ship silently again.
 *
 * Two levers, and they pull in opposite directions, which is why the first
 * attempt at a fix still failed: shrinking R lowers the pickup but ALSO lowers
 * the stage's mass, and this one landmark is 14% of it, so the ceiling comes
 * down with it. R: 810 alone left it six kilometres short. Raising `fill` adds
 * mass without touching the pickup, so it lifts the ceiling on its own.
 *
 * R: 740 with fill 0.58 lands the pickup at 1922km, needing 2184km against a
 * 2438km reachable ceiling — 10% of headroom, which is the margin a PLAYER needs
 * rather than the margin a perfect bot needs. Do not tune either number up
 * without re-running `balance` and reading that line. */
P({ id: 'w_continent', name: 'Continent', cat: 'land', fill: 0.58, variants: 3, weight: 3,
  build(b, r, v) {
    nation(b, r, {
      R: 740, H: 429, lobes: 7, cities: 8, blobs: 9, trees: 22, ranges: 4,
      ice: true, desert: true,
      biome: [[G.plain, G.forest, G.steppe][v], G.forest, G.plainDry, G.jungle, G.steppe],
    });
  } });

/* ==================================================================
   ON WATER
   ================================================================== */

P({ id: 'w_atoll', name: 'Coral Atoll', cat: 'sea', surface: 'water', fill: 0.1, variants: 3, weight: 10,
  build(b, r, v) {
    const R = 19;
    b.cylOn(R * 1.08, 0.8, G.shelf, {}, 12);
    b.cylOn(R * 0.82, 1.5, G.lagoon, { y: 0.8 }, 12);
    // the ring: sand cays with gaps in it
    const N = 10;
    for (let i = 0; i < N; i++) {
      if (v === 2 && i % 4 === 3) continue;
      const a = (i / N) * Math.PI * 2 + r() * 0.2;
      const x = Math.cos(a) * R * 0.9, z = Math.sin(a) * R * 0.9;
      b.ellip(R * (0.16 + r() * 0.1), 1.6, R * 0.1, G.sand, { x, y: 1.8, z, ry: -a }, 8, 4);
    }
    for (let i = 0; i < 3 + v; i++) {
      const a = r() * Math.PI * 2;
      const x = Math.cos(a) * R * 0.9, z = Math.sin(a) * R * 0.9;
      b.cylOn(0.28, 3.2, C.woodDark, { x, y: 2.4, z }, 5);
      b.sphere(1.9, G.jungle, { x, y: 6.4, z }, 6, 4);
    }
  } });

P({ id: 'w_island', name: 'Small Island', cat: 'sea', surface: 'water', fill: 0.28, variants: 4, weight: 11,
  build(b, r, v) {
    const lobes = landmass(b, 24, 12.5, r, G.rockDk, [G.jungle, G.forest, G.plain, G.sand][v], 3);
    const top = lobes[0][3];
    b.cone(9, 8, G.rock, { y: top + 3.4 }, 8);
    if (v === 3) b.cone(3.4, 2.6, G.snow, { y: top + 8.2 }, 7);
    for (let i = 0; i < 5; i++) {
      const p = lobes[Math.floor(r() * lobes.length)];
      const a = r() * Math.PI * 2, d = p[2] * 0.7 * r();
      b.sphere(2.6, r() < 0.5 ? G.jungle : G.forest, { x: p[0] + Math.cos(a) * d, y: p[3] + 1, z: p[1] + Math.sin(a) * d }, 6, 4);
    }
    if (v < 2) {
      const p = lobes[1];
      b.boxOn(4.4, 2.0, 4.4, C.cream, { x: p[0], y: p[3], z: p[1] });
      b.wedge(5, 1.6, 5, C.roofRed, { x: p[0], y: p[3] + 2.0, z: p[1] });
    }
  } });

P({ id: 'w_oilrig', name: 'Oil Platform', cat: 'sea', surface: 'water', fill: 0.07, variants: 2, weight: 8,
  build(b, r, v) {
    const S = 21;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      b.cylOn(1.5, 26, G.metalDk, { x: sx * S * 0.62, y: 0, z: sz * S * 0.62, rz: -sx * 0.05, rx: sz * 0.05 }, 6);
    }
    for (const y of [9, 18]) {
      b.box(S * 1.3, 0.8, 0.8, G.metalDk, { y, z: S * 0.62 });
      b.box(S * 1.3, 0.8, 0.8, G.metalDk, { y, z: -S * 0.62 });
      b.box(0.8, 0.8, S * 1.3, G.metalDk, { x: S * 0.62, y });
      b.box(0.8, 0.8, S * 1.3, G.metalDk, { x: -S * 0.62, y });
    }
    b.boxOn(S * 1.6, 4.0, S * 1.5, G.metal, { y: 26 });
    b.boxOn(S * 0.7, 8, S * 0.6, C.offwhite, { x: -S * 0.36, y: 30, z: S * 0.3 });
    b.cylOn(S * 0.3, 1.0, C.lightgrey, { x: S * 0.44, y: 30, z: -S * 0.3 }, 10);
    // derrick and flare boom
    b.taperOn(2.2, 5.0, 20, G.metalDk, { x: S * 0.1, y: 30 }, 6);
    b.boxOn(2.0, 3.0, 2.0, C.red, { x: S * 0.1, y: 50 });
    b.box(1.2, 1.2, S * 1.1, G.metalDk, { x: -S * 0.5, y: 33, z: -S * 0.85, rx: -0.4 });
    if (v) b.cone(2.2, 6, G.lava, { x: -S * 0.5, y: 40, z: -S * 1.35 }, 7);
  } });

P({ id: 'w_ship', name: 'Container Ship', cat: 'sea', surface: 'water', fill: 0.28, variants: 3, weight: 8,
  build(b, r, v) {
    const L = 290, W = 44;
    b.box(W, 20, L * 0.86, [C.redDark, C.navy, C.greenDark][v], { y: 10 });
    b.box(W - 3, 6, L * 0.88, C.charcoal, { y: 23 });
    for (let i = 0; i < 5; i++) {
      const t = i / 4;
      b.box(W * (1 - t * 0.88), 20, L * 0.035, [C.redDark, C.navy, C.greenDark][v], { y: 10, z: L * 0.43 + i * L * 0.033 });
    }
    // container stacks
    const cols = [C.red, C.blue, C.yellow, C.green, C.orange, C.teal, C.lightgrey];
    for (let row = 0; row < 3; row++) for (let i = 0; i < 9; i++) for (const s of [-1, 1]) {
      b.box(W * 0.4, 6.4, L * 0.062, cols[(row * 3 + i + v) % cols.length],
        { x: s * W * 0.24, y: 25 + row * 6.6, z: -L * 0.3 + i * L * 0.066 });
    }
    b.boxOn(W * 0.7, 26, L * 0.055, C.white, { y: 20, z: -L * 0.37 });
    b.boxOn(W * 0.76, 2.0, L * 0.06, C.lightgrey, { y: 46, z: -L * 0.37 });
    b.cylOn(4.4, 18, C.charcoal, { y: 46, z: -L * 0.4 }, 10);
    b.cyl(4.8, 4.8, 2.6, C.red, { y: 65, z: -L * 0.4 }, 10);
    // wake
    b.box(W * 1.5, 1.0, L * 0.2, G.surf, { y: 0.6, z: -L * 0.53 });
  } });

P({ id: 'w_iceberg', name: 'Iceberg', cat: 'sea', surface: 'water', fill: 0.38, variants: 4, weight: 8,
  build(b, r, v) {
    const R = 66, H = 52;
    b.cylOn(R * 1.16, H * 0.06, G.iceBlue, {}, 11);
    b.cylOn(R, H * 0.34, G.ice, { y: H * 0.04 }, 10);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + r();
      const d = R * (0.24 + r() * 0.4);
      const rr = R * (0.24 + r() * 0.22);
      b.cylOn(rr, H * (0.4 + r() * 0.5), G.snow, { x: Math.cos(a) * d, y: H * 0.28, z: Math.sin(a) * d, rz: (r() - 0.5) * 0.14 }, 8);
    }
    b.cone(R * 0.44, H * (0.5 + v * 0.1), G.snow, { y: H * 0.62 }, 9);
    for (let i = 0; i < 4; i++) {
      const a = r() * Math.PI * 2, d = R * (0.4 + r() * 0.5);
      b.boxOn(R * 0.1, H * 0.1, R * 0.3, G.iceBlue, { x: Math.cos(a) * d, y: H * 0.3, z: Math.sin(a) * d, ry: a });
    }
  } });

P({ id: 'w_isles', name: 'Island Chain', cat: 'sea', surface: 'water', fill: 0.13, variants: 3, weight: 8,
  build(b, r, v) {
    const L = 600, N = 6;
    for (let i = 0; i < N; i++) {
      const t = (i / (N - 1) - 0.5) * L;
      const z = Math.sin(t / L * 3.4 + v) * L * 0.16;
      const R = L * (0.055 + r() * 0.055);
      const H = R * (0.5 + r() * 0.4);
      b.cylOn(R * 1.2, H * 0.12, G.shelf, { x: t, z }, 9);
      b.cylOn(R, H, G.rockDk, { x: t, z }, 10);
      b.cyl(R * 0.97, R * 0.97, H * 0.2, r() < 0.5 ? G.jungle : G.forest, { x: t, y: H * 1.02, z }, 10);
      if (i % 2 === 0) b.cone(R * 0.5, H * 0.7, G.rock, { x: t, y: H * 1.4, z }, 8);
      for (let k = 0; k < 3; k++) {
        const a = r() * Math.PI * 2, d = R * 0.7 * r();
        b.sphere(R * 0.16, G.jungle, { x: t + Math.cos(a) * d, y: H * 1.12, z: z + Math.sin(a) * d }, 6, 4);
      }
    }
    // the reef the chain sits on
    b.box(L * 1.06, 2.4, L * 0.28, G.lagoon, { y: 1.2, ry: 0.04 });
  } });

P({ id: 'w_hurricane', name: 'Hurricane', cat: 'sky', surface: 'water', fill: 0.07, variants: 3, weight: 7,
  build(b, r, v) {
    const R = 400, H = 62;
    const arms = 3 + v;
    for (let a = 0; a < arms; a++) {
      const ph = (a / arms) * Math.PI * 2;
      for (let i = 0; i < 13; i++) {
        const t = i / 12;
        const rad = R * (0.16 + t * 0.84);
        const ang = ph + t * 3.0;
        const rr = R * (0.06 + t * 0.1);
        b.ellip(rr, H * (0.34 - t * 0.16), rr * 1.5,
          t > 0.6 ? G.cloud : C.white,
          { x: Math.cos(ang) * rad, y: H * (0.62 - t * 0.2), z: Math.sin(ang) * rad, ry: -ang }, 8, 4);
      }
    }
    // the eye wall
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      b.ellip(R * 0.075, H * 0.5, R * 0.075, C.white, { x: Math.cos(a) * R * 0.15, y: H * 0.6, z: Math.sin(a) * R * 0.15 }, 8, 5);
    }
    b.cylOn(R * 0.07, 2.0, G.oceanDeep, { y: 0 }, 9);
  } });

/* ==================================================================
   IN THE AIR
   ================================================================== */

P({ id: 'w_satellite', name: 'Satellite', cat: 'sky', surface: 'air', flyHeight: 72,
  fill: 0.06, variants: 3, weight: 8,
  build(b, r, v) {
    const S = 8;
    b.boxOn(S, S * 1.1, S * 0.9, G.metal, { y: S * 0.5 });
    b.box(S * 1.04, S * 0.3, S * 0.94, C.gold, { y: S * 0.9 });
    for (const s of [-1, 1]) {
      b.box(S * 0.5, S * 0.1, S * 0.28, G.metalDk, { x: s * S * 0.8, y: S * 1.05 });
      b.box(S * 2.6, S * 0.08, S * 1.5, G.solar, { x: s * S * 2.4, y: S * 1.05 });
      for (let i = 0; i < 3; i++) b.box(S * 2.6, S * 0.1, S * 0.06, C.charcoal, { x: s * S * 2.4, y: S * 1.1, z: -S * 0.5 + i * S * 0.5 });
    }
    b.taperOn(S * 0.9, S * 0.16, S * 0.7, C.white, { y: S * 1.6, rx: 0.5 }, 9);
    b.cylOn(S * 0.06, S * 1.5, G.metalDk, { y: S * 1.6, rz: 0.4 }, 5);
    b.sphere(S * 0.12, C.red, { x: S * 0.6, y: S * 2.9 }, 5, 4);
    if (v === 2) b.box(S * 0.12, S * 0.12, S * 2.2, G.metalDk, { y: S * 0.5, z: -S * 1.4 });
  } });

P({ id: 'w_cloudbank', name: 'Cloud Bank', cat: 'sky', surface: 'air', flyHeight: 210,
  fill: 0.11, variants: 4, weight: 9,
  build(b, r, v) {
    const R = 180;
    for (let i = 0; i < 13; i++) {
      const a = r() * Math.PI * 2, d = R * Math.sqrt(r()) * 0.9;
      const rr = R * (0.16 + r() * 0.2);
      b.ellip(rr, rr * (0.4 + r() * 0.3), rr * (0.8 + r() * 0.4),
        i % 4 === 3 ? G.cloudGrey : G.cloud,
        { x: Math.cos(a) * d, y: rr * 0.5 + r() * R * 0.06, z: Math.sin(a) * d }, 9, 5);
    }
    if (v > 1) for (let i = 0; i < 5; i++) {
      const a = r() * Math.PI * 2, d = R * 0.7 * r();
      b.ellip(R * 0.1, R * 0.05, R * 0.24, G.cloudGrey, { x: Math.cos(a) * d, y: R * 0.03, z: Math.sin(a) * d, ry: r() }, 7, 4);
    }
  } });

P({ id: 'w_station', name: 'Space Station', cat: 'sky', surface: 'air', flyHeight: 330,
  fill: 0.05, variants: 2, weight: 6,
  build(b, r, v) {
    const S = 34;
    // truss
    b.box(S * 8, S * 0.22, S * 0.22, G.metalDk, { y: S * 1.2 });
    for (let i = 0; i < 15; i++) b.box(S * 0.1, S * 0.5, S * 0.1, G.metalDk, { x: -S * 3.8 + i * S * 0.54, y: S * 1.2, rz: i % 2 ? 0.5 : -0.5 });
    // pressurised modules
    for (let i = 0; i < 4; i++) {
      b.cyl(S * 0.34, S * 0.34, S * 1.5, C.white, { x: -S * 1.2 + i * S * 0.9, y: S * 0.6, rx: Math.PI / 2 }, 9);
    }
    b.cyl(S * 0.3, S * 0.3, S * 2.2, C.white, { y: S * 0.6, rz: Math.PI / 2 }, 9);
    b.sphere(S * 0.36, G.metal, { y: S * 0.2 }, 9, 6);
    // solar wings and radiators
    for (const s of [-1, 1]) for (const k of [-1, 1]) {
      b.box(S * 1.9, S * 0.06, S * 1.2, G.solar, { x: s * S * 2.6, y: S * 1.2, z: k * S * 0.9 });
      for (let i = 0; i < 3; i++) b.box(S * 1.9, S * 0.08, S * 0.05, C.charcoal, { x: s * S * 2.6, y: S * 1.24, z: k * S * 0.9 - S * 0.4 + i * S * 0.4 });
    }
    for (const s of [-1, 1]) b.box(S * 0.9, S * 0.06, S * 1.6, C.lightgrey, { x: s * S * 1.4, y: S * 1.7 });
    if (v) b.cyl(S * 0.26, S * 0.26, S * 0.9, G.metal, { x: S * 2.0, y: S * 0.6, rx: Math.PI / 2 }, 8);
  } });

P({ id: 'w_jetstream', name: 'Jet Stream', cat: 'sky', surface: 'air', flyHeight: 470,
  fill: 0.05, variants: 3, weight: 6,
  build(b, r, v) {
    const L = 900;
    for (let i = 0; i < 16; i++) {
      const t = i / 15;
      const x = -L * 0.5 + t * L;
      const z = Math.sin(t * 4.2 + v) * L * 0.12;
      const y = 40 + Math.sin(t * 2.6 + v) * 22;
      const w = L * (0.06 + Math.sin(t * Math.PI) * 0.05);
      b.ellip(w, 12 + t * 6, L * 0.026, i % 5 === 4 ? G.cloudGrey : G.cloud,
        { x, y, z, ry: -Math.cos(t * 4.2 + v) * 0.4 }, 8, 4);
    }
    // torn wisps trailing behind the ribbon
    for (let i = 0; i < 7; i++) {
      const t = r();
      b.ellip(L * 0.035, 6, L * 0.01, G.cloud,
        { x: -L * 0.5 + t * L, y: 20 + r() * 40, z: Math.sin(t * 4.2 + v) * L * 0.12 + (r() - 0.5) * L * 0.1, ry: r() * 0.6 }, 7, 4);
    }
  } });
