/* ============================================================
   Stage 1 — The House.  5cm  ->  1m,  seven minutes.

   A single connected floor plan: living room, tatami room,
   kitchen, and a garden through the veranda. The tatami is a
   15cm step, so it opens up once the ball is about 30cm; the
   garden is a step down with a ramp back up so you can never
   strand yourself.
   ============================================================ */

import { C } from '../../render/palette.js';

const FLOOR_Y = 0;
const TATAMI_Y = 0.15;
const GARDEN_Y = -0.34;

export const houseStage = {
  id: 'house',
  name: 'The House',
  subtitle: 'Somebody left the place in a state.',
  brief: 'Start on the living room floor among the small change and stationery. ' +
    'The tatami room is a step up — you will need to be about 30cm across. ' +
    'The garden is through the veranda once you can handle the drop.',
  seed: 20040318,
  startSize: 0.05,
  goal: 1.6,
  time: 345,
  // m/s at startSize; the curve grows from here. a marble in a room: 42s to cross, hectic and close-up
  speed: 0.34,
  /**
   * Clutter dial. Multiplies every `scatter` count and every hand-written
   * placement loop in this stage's build. 1 = as authored.
   *
   * Exists because "a bit more/less stuff please" is the single most common
   * note on a stage, and it used to mean editing twenty separate numbers.
   * Safe to move freely: small props carry ~0% of a stage's mass (measured —
   * everything a 5m katamari could swallow on arrival carried 0.0% of the
   * city), so this changes texture and pacing and never the size ceiling.
   */
  density: 1,
  spread: 1,
  cell: 0.9,
  chunk: 0,
  spawn: { x: 1.5, z: -4.0 },
  bounds: { minX: -13, maxX: 13, minZ: -11, maxZ: 12 },
  sky: { top: 0x8fd4f0, bottom: 0xe8f6d8, fog: 0xdff0e4, fogNear: 22, fogFar: 60 },
  sun: { x: 0.5, y: 1, z: 0.35, intensity: 1.05 },
  camera: { pitch: 0.34, distance: 6.2 },

  build(w, r) {
    const t = w.terrain;

    /* ---------------- floor plan ---------------- */
    // living room + kitchen share the boarded floor
    w.plat(-12, -10, 12, 11, FLOOR_Y);
    t.quad(24, 21, C.floorWood, { x: 0, y: FLOOR_Y, z: 0.5 });
    // plank lines
    for (let i = 0; i < 22; i++) {
      t.box(24, 0.004, 0.03, C.woodDark, { x: 0, y: FLOOR_Y + 0.003, z: -10 + i * 0.96 });
    }

    // tatami room (west), raised
    w.plat(-12, -10, -3.2, 1.6, TATAMI_Y);
    t.box(8.8, TATAMI_Y, 11.6, C.tatami, { x: -7.6, y: TATAMI_Y / 2, z: -4.2 });
    for (let i = 0; i < 4; i++) for (let k = 0; k < 3; k++) {
      const mx = -11.6 + i * 2.2, mz = -9.6 + k * 3.8;
      t.quad(2.05, 3.65, C.tatami, { x: mx + 1.05, y: TATAMI_Y + 0.002, z: mz + 1.85 });
      t.box(2.1, 0.012, 0.09, C.tatamiEdge, { x: mx + 1.05, y: TATAMI_Y + 0.004, z: mz });
      t.box(2.1, 0.012, 0.09, C.tatamiEdge, { x: mx + 1.05, y: TATAMI_Y + 0.004, z: mz + 3.7 });
    }
    // step edge trim
    t.box(0.1, TATAMI_Y + 0.01, 11.6, C.woodDark, { x: -3.2, y: TATAMI_Y / 2, z: -4.2 });
    t.box(8.8, TATAMI_Y + 0.01, 0.1, C.woodDark, { x: -7.6, y: TATAMI_Y / 2, z: 1.6 });

    // garden (north-east), a step down, grass
    w.plat(1.6, 4.6, 12, 11, GARDEN_Y);
    t.quad(10.4, 6.4, C.grass, { x: 6.8, y: GARDEN_Y, z: 7.8 });
    t.box(10.4, 0.34, 0.12, C.concreteD, { x: 6.8, y: GARDEN_Y + 0.17, z: 4.6 });
    t.box(0.12, 0.34, 6.4, C.concreteD, { x: 1.6, y: GARDEN_Y + 0.17, z: 7.8 });
    // ramp back up onto the veranda
    w.ramp(3.0, 4.6, 4.6, 6.4, GARDEN_Y, FLOOR_Y, 'z');
    t.box(1.6, 0.06, 1.8, C.wood, { x: 3.8, y: (GARDEN_Y + FLOOR_Y) / 2 + 0.12, z: 5.5, rx: -0.19 });
    // garden path
    for (let i = 0; i < 7; i++) {
      t.quad(0.6, 0.5, C.concrete, { x: 4.4 + i * 1.05, y: GARDEN_Y + 0.005, z: 7.2 + Math.sin(i) * 0.9 });
    }
    // pond
    t.quad(2.6, 1.9, C.water, { x: 9.6, y: GARDEN_Y + 0.004, z: 9.4 });

    /* ---------------- walls ---------------- */
    const WH = 2.6;
    w.bound(-13, 11, 13, 12, WH, C.offwhite);
    w.bound(-13, -11, 13, -10, WH, C.offwhite);
    w.bound(-13, -11, -12, 12, WH, C.offwhite);
    w.bound(12, -11, 13, 4.6, WH, C.offwhite);
    // partial wall between kitchen and garden opening
    w.wall(1.6, 4.4, 2.2, 11, 0.9, C.offwhite);

    // sliding shoji screens along the tatami room's north side
    for (let i = 0; i < 4; i++) {
      t.box(2.15, 1.9, 0.06, C.paper, { x: -11.4 + i * 2.2, y: TATAMI_Y + 0.95, z: 1.62 });
      t.box(2.2, 0.08, 0.09, C.woodDark, { x: -11.4 + i * 2.2, y: TATAMI_Y + 1.9, z: 1.62 });
      for (let k = 1; k < 4; k++) t.box(2.15, 0.045, 0.08, C.woodDark, { x: -11.4 + i * 2.2, y: TATAMI_Y + k * 0.47, z: 1.63 });
    }
    

    /* ---------------- big furniture ---------------- */
    w.placeId('sofa', -0.4, -8.4, 0, 1);
    w.placeId('tv', -0.6, 1.2, Math.PI, 1);
    w.placeId('lowtable', -0.2, -5.2, 0.04, 1);
    w.placeId('bookshelf', 10.4, -6.0, -Math.PI / 2, 1);
    w.placeId('bookshelf', 10.4, -2.4, -Math.PI / 2, 1);
    w.placeId('desk', 7.6, -9.0, 0, 1);
    w.placeId('chair', 7.4, -7.4, Math.PI, 1);
    w.placeId('fridge', -11.0, 9.4, 0.1, 1);
    w.placeId('washingmachine', -8.6, 9.6, 0, 1);
    w.placeId('microwave', -6.2, 9.7, 0, 1);
    w.placeId('upright_piano', -6.0, -9.2, 0.02, 1);
    w.placeId('grandclock', -3.9, 0.9, -1.55, 1);
    w.placeId('floorlamp', 2.2, -9.2, 0, 1);
    w.placeId('aquarium', 4.4, 1.0, 0.1, 1);
    w.placeId('toilet', 11.2, 2.6, -1.5, 1);
    w.placeId('futon', -9.6, -3.0, 0.2, 1);
    w.placeId('futon', -6.4, -6.4, 1.2, 1);
    w.placeId('doghouse', 10.0, 6.2, -0.6, 1);
    w.placeId('bicycle', 8.4, 9.6, 0.4, 1);
    w.placeId('sofa', 9.0, -0.2, -1.5, 1);
    w.placeId('chair', -1.8, -2.6, 0.8, 1);
    w.placeId('chair', 1.6, -2.4, -0.7, 1);
    w.placeId('stool', 2.6, -6.8, 0, 1);
    w.placeId('stool', -2.4, 3.2, 0, 1);
    w.placeId('wastebin', 6.2, -6.6, 0, 1);
    w.placeId('wastebin', -11.2, 4.4, 0, 1);
    w.placeId('cat', 3.2, -3.0, 2.1, 1);
    w.placeId('cat', -8.0, -1.4, 0.6, 1);
    w.placeId('dog_small', 6.6, 5.0, 1.4, 1);
    w.placeId('adult', -1.2, 6.6, 2.6, 1);
    w.placeId('adult', 5.2, -1.6, -1.1, 1);
    w.placeId('child', 2.0, 3.6, 0.4, 1);
    w.placeId('child', -5.0, 5.4, -2.0, 1);

    const avoid = [
      { x: -0.4, z: -8.4, r: 1.6 }, { x: -0.6, z: 1.2, r: 1.1 }, { x: -0.2, z: -5.2, r: 1.0 },
      { x: 10.4, z: -6.0, r: 1.0 }, { x: 10.4, z: -2.4, r: 1.0 }, { x: 7.6, z: -9.0, r: 1.2 },
      { x: -11.0, z: 9.4, r: 1.0 }, { x: -8.6, z: 9.6, r: 0.9 }, { x: -6.0, z: -9.2, r: 1.4 },
      { x: 4.4, z: 1.0, r: 0.9 }, { x: 9.0, z: -0.2, r: 1.5 }, { x: 1.5, z: -4.0, r: 0.5 },
    ];

    /* ---------------- scatter: living room + kitchen floor ---------------- */
    // The tiny stuff clusters where you start.
    w.scatter({ tag: 'house', lo: 0.005, hi: 0.026, count: 230, x0: -2.5, z0: -9.8, x1: 6.5, z1: 0.5, avoid });
    w.scatter({ tag: 'house', lo: 0.02, hi: 0.06, count: 200, x0: -3, z0: -9.8, x1: 11.5, z1: 3, avoid });
    w.scatter({ tag: 'house', lo: 0.04, hi: 0.12, count: 165, x0: -3, z0: -9.8, x1: 11.5, z1: 10.5, avoid });
    w.scatter({ tag: 'house', lo: 0.09, hi: 0.24, count: 112, x0: -3, z0: -9.8, x1: 11.5, z1: 10.5, avoid });
    w.scatter({ tag: 'house', lo: 0.18, hi: 0.45, count: 66, x0: -3, z0: -9.8, x1: 11.5, z1: 10.5, avoid });
    w.scatter({ tag: 'house', lo: 0.4, hi: 0.95, count: 30, x0: -2.5, z0: -9.5, x1: 11.5, z1: 10.5, avoid });

    /* ---------------- scatter: tatami room ---------------- */
    w.scatter({ tag: 'house', lo: 0.005, hi: 0.05, count: 130, x0: -11.7, z0: -9.7, x1: -3.5, z1: 1.3, avoid });
    w.scatter({ tag: 'house', lo: 0.04, hi: 0.16, count: 92, x0: -11.7, z0: -9.7, x1: -3.5, z1: 1.3, avoid });
    w.scatter({ tag: 'house', lo: 0.14, hi: 0.4, count: 44, x0: -11.7, z0: -9.7, x1: -3.5, z1: 1.3, avoid });
    w.scatter({ tag: 'house', lo: 0.35, hi: 0.9, count: 16, x0: -11.5, z0: -9.5, x1: -3.6, z1: 1.2, avoid });

    /* ---------------- scatter: kitchen shelf zone ---------------- */
    w.scatter({ tag: 'house', lo: 0.05, hi: 0.28, count: 96, x0: -11.6, z0: 3.4, x1: -1, z1: 10.4, avoid });

    /* ---------------- garden ---------------- */
    const gx0 = 2.0, gz0 = 5.0, gx1 = 11.6, gz1 = 10.6;
    w.scatter({ tag: 'house', lo: 0.05, hi: 0.3, count: 105, x0: gx0, z0: gz0, x1: gx1, z1: gz1 });
    w.scatter({ tag: 'house', lo: 0.24, hi: 0.9, count: 24, x0: gx0, z0: gz0, x1: gx1, z1: gz1 });
    for (let i = 0; i < 46; i++) {
      w.placeId('grasstuft', gx0 + r() * (gx1 - gx0), gz0 + r() * (gz1 - gz0), null, 0.8 + r() * 0.9);
    }
    for (let i = 0; i < 26; i++) {
      w.placeId('flower', gx0 + r() * (gx1 - gx0), gz0 + r() * (gz1 - gz0), null, 0.8 + r() * 0.7);
    }
    w.placeId('sapling', 3.4, 9.6);
    w.placeId('sapling', 11.0, 5.8);
    w.placeId('bush', 5.4, 10.2, null, 0.9);
    w.placeId('bush', 8.0, 5.4, null, 0.8);
    w.placeId('potplant', 2.6, 4.2);
    w.placeId('potplant', 6.0, 4.2);
    for (let i = 0; i < 8; i++) w.placeId('rock_small', gx0 + r() * (gx1 - gx0), gz0 + r() * (gz1 - gz0), null, 0.9 + r() * 0.8);

    /* ---------------- a scattering of books and paper trails ---------------- */
    for (let i = 0; i < 14; i++) {
      w.placeId('book', -2 + r() * 12, -9 + r() * 6, r() * 6.28, 1);
    }
    for (let i = 0; i < 10; i++) {
      w.placeId('magazine', -2 + r() * 13, -9 + r() * 18, r() * 6.28, 1);
    }
  },
};
