/* ============================================================
   Stage 2 — The Town.  50cm  ->  14m,  seven minutes.

   A block grid with pavements, a park, a shopping street and a
   playing field. You start on the pavement among the litter and
   finish eating the houses.
   ============================================================ */

import { C } from '../../render/palette.js';

const ROAD_Y = 0;
const KERB_Y = 0.16;

export const townStage = {
  id: 'town',
  name: 'The Town',
  subtitle: 'A quiet neighbourhood, briefly.',
  brief: 'Roads, pavements, a park and a shopping street. Start with the litter and ' +
    'the traffic cones, work up through the parked cars, and finish on the rooftops.',
  seed: 770213,
  startSize: 0.5,
  goal: 14,
  /**
   * 9:00 -> 6:00 -> 7:00, over two rounds of play.
   *
   * Worth keeping the middle step visible, because it shows how sharp this
   * stage's cliff is. Nothing about growth changes with the clock, so time
   * lost is simply ball lost — and the town sits close enough to its own edge
   * that one minute moves it across:
   *
   *              median final    clears    goal as % of median
   *     9:00        23m00         14/15           61%
   *     6:00        16m94          9/15           83%
   *     7:00        22m37         11/15           63%
   *
   * The jump from 6:00 back to 7:00 is much bigger than the minute suggests
   * because the last stretch of the ladder is where the volume is: one more
   * minute at 14m is worth several at 3m. If this ever needs tightening again,
   * take it off the GOAL rather than the clock — 12m buys the same margin
   * without the stage feeling rushed. Do not reach for `pickupRatio` or
   * `density`: the first changes every stage, the second re-rolls this one.
   */
  time: 420,
  // m/s at startSize; the curve grows from here. 42s to cross at 50cm, the
  // same as the house and the city. Raising this from 3.2 also made the stage
  // robust to strategy: the targeter bot went from a 4m67 median to 21m97,
  // i.e. at 3.2 you had to route the town well and now you merely have to
  // keep moving. That is the right difficulty for the second stage.
  speed: 2.53,
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
  cell: 4,
  chunk: 56,
  spawn: { x: -48, z: -44 },
  spawnClear: 4,
  bounds: { minX: -96, maxX: 96, minZ: -96, maxZ: 96 },
  sky: { top: 0x5cb6e8, bottom: 0xcfeef2, fog: 0xd7eef0, fogNear: 90, fogFar: 300 },
  sun: { x: 0.45, y: 1, z: 0.6, intensity: 1.0 },
  camera: { pitch: 0.36, distance: 6.4 },

  build(w, r) {
    const t = w.terrain;
    const B = 96;

    /* ---------------- ground ---------------- */
    w.plat(-B, -B, B, B, ROAD_Y);
    t.quad(B * 2, B * 2, C.asphalt, { y: 0 });

    // block layout: 4x4 blocks of 38m separated by 10m roads
    const blocks = [];
    const step = 48;
    for (let i = -2; i <= 1; i++) {
      for (let k = -2; k <= 1; k++) {
        const cx = i * step + step / 2, cz = k * step + step / 2;
        blocks.push({ cx, cz, hw: 19, hd: 19 });
      }
    }

    // road markings
    for (let i = -2; i <= 2; i++) {
      const c = i * step;
      for (let s = -B; s < B; s += 6) {
        // 3.5cm clear of the asphalt, not 1cm. Two big coplanar horizontal
        // quads z-fight across their whole overlap; see the city's layer block.
        t.quad(0.4, 3, C.offwhite, { x: c, y: 0.035, z: s + 1.5 });
        t.quad(3, 0.4, C.offwhite, { x: s + 1.5, y: 0.035, z: c });
      }
    }

    // pavements + block surfaces
    for (const b of blocks) {
      w.plat(b.cx - b.hw, b.cz - b.hd, b.cx + b.hw, b.cz + b.hd, KERB_Y);
      t.box(b.hw * 2, KERB_Y, b.hd * 2, C.concrete, { x: b.cx, y: KERB_Y / 2, z: b.cz });
      t.quad(b.hw * 2 - 1.4, b.hd * 2 - 1.4, C.concreteD, { x: b.cx, y: KERB_Y + 0.02, z: b.cz });
      // gentle kerb ramps at the middle of each edge so you can always get up
      w.ramp(b.cx - 3, b.cz - b.hd - 2.6, b.cx + 3, b.cz - b.hd, ROAD_Y, KERB_Y, 'z');
      w.ramp(b.cx - 3, b.cz + b.hd, b.cx + 3, b.cz + b.hd + 2.6, KERB_Y, ROAD_Y, 'z');
      w.ramp(b.cx - b.hw - 2.6, b.cz - 3, b.cx - b.hw, b.cz + 3, ROAD_Y, KERB_Y, 'x');
      w.ramp(b.cx + b.hw, b.cz - 3, b.cx + b.hw + 2.6, b.cz + 3, KERB_Y, ROAD_Y, 'x');
    }

    /* ---------------- outer boundary ---------------- */
    w.bound(-B - 4, -B - 4, B + 4, -B, 6, C.concreteD);
    w.bound(-B - 4, B, B + 4, B + 4, 6, C.concreteD);
    w.bound(-B - 4, -B, -B, B, 6, C.concreteD);
    w.bound(B, -B, B + 4, B, 6, C.concreteD);

    /* ---------------- block contents ---------------- */
    const avoid = [];
    const claim = (x, z, rad) => avoid.push({ x, z, r: rad });

    // 0,1: residential
    const houseSpots = [
      [-60, -60], [-36, -60], [-60, -36], [-36, -36],
      [12, -60], [36, -60], [12, -36], [36, -36],
      [-60, 12], [-36, 12], [-60, 36], [-36, 36],
      [60, -60], [60, -36], [60, 12], [60, 36],
      [12, 60], [36, 60], [-60, 60], [-36, 60], [60, 60], [12, 12],
    ];
    for (const [hx, hz] of houseSpots) {
      const rot = Math.round(r() * 3) * (Math.PI / 2);
      w.placeId('house_small', hx, hz, rot);
      claim(hx, hz, 7);
      // garden bits
      for (let i = 0; i < 5; i++) {
        const a = r() * Math.PI * 2, d = 6 + r() * 5;
        w.placeId(r() < 0.5 ? 'bush' : 'tree_round', hx + Math.cos(a) * d, hz + Math.sin(a) * d, null, 0.7 + r() * 0.4);
      }
      w.placeId('fence_panel', hx - 6 + r() * 12, hz + 9.5, 0);
      w.placeId('mailbox', hx + 7.5, hz + 8.6);
      if (r() < 0.5) w.placeId('doghouse', hx - 7 + r() * 3, hz - 8);
      if (r() < 0.6) w.placeId('bicycle', hx + 5 + r() * 2, hz + 6, r() * 3);
    }

    // shopping street along z = 12..30, x from -20..20
    for (let i = 0; i < 6; i++) {
      const sx = -18 + i * 7.5;
      w.placeId('shop_front', sx, 24, Math.PI);
      claim(sx, 24, 6);
    }
    w.placeId('kiosk', -22, 14);
    w.placeId('foodcart', 8, 14, 0.4);
    w.placeId('foodcart', -8, 15, -0.3);
    for (let i = 0; i < 8; i++) w.placeId('vendingmachine', -20 + i * 5.6, 15.5, Math.PI);

    // park in the block at (-60..-22, 12..50) — use the (-36,36) area
    const px = -38, pz = 40;
    w.placeId('fountain', px, pz);
    claim(px, pz, 5);
    w.placeId('playslide', px + 12, pz - 6, 0.6);
    w.placeId('swingset', px - 12, pz - 5, -0.3);
    w.placeId('shrine', px + 4, pz + 12, 0.2);
    w.placeId('torii', px + 4, pz + 5, 0);
    w.placeId('statue', px - 10, pz + 10);
    for (let i = 0; i < 26; i++) {
      const a = r() * Math.PI * 2, d = 6 + r() * 13;
      w.placeId(r() < 0.55 ? 'tree_round' : 'tree_pine', px + Math.cos(a) * d, pz + Math.sin(a) * d, null, 0.8 + r() * 0.5);
    }
    for (let i = 0; i < 10; i++) w.placeId('bench', px - 16 + r() * 32, pz - 16 + r() * 32, r() * 6.28);
    for (let i = 0; i < 6; i++) w.placeId('hedge', px - 16 + r() * 32, pz - 16 + r() * 32, r() * 6.28);
    t.quad(38, 38, C.grass, { x: px, y: KERB_Y + 0.05, z: pz });

    // a field with livestock
    const fx = 60, fz = -12;
    t.quad(30, 26, C.grassDark, { x: fx, y: 0.06, z: fz });
    for (let i = 0; i < 6; i++) w.placeId('cow', fx - 12 + r() * 24, fz - 10 + r() * 20, r() * 6.28);
    for (let i = 0; i < 9; i++) w.placeId('sheep', fx - 12 + r() * 24, fz - 10 + r() * 20, r() * 6.28);
    w.placeId('tractor', fx - 10, fz + 10, 0.8);
    for (let i = 0; i < 12; i++) w.placeId('fence_panel', fx - 15 + i * 2.6, fz - 13, 0);

    /* ---------------- street furniture on every pavement ---------------- */
    for (const b of blocks) {
      const edges = [
        { x0: b.cx - b.hw + 1, x1: b.cx + b.hw - 1, z0: b.cz - b.hd + 0.6, z1: b.cz - b.hd + 2.4 },
        { x0: b.cx - b.hw + 1, x1: b.cx + b.hw - 1, z0: b.cz + b.hd - 2.4, z1: b.cz + b.hd - 0.6 },
        { x0: b.cx - b.hw + 0.6, x1: b.cx - b.hw + 2.4, z0: b.cz - b.hd + 1, z1: b.cz + b.hd - 1 },
        { x0: b.cx + b.hw - 2.4, x1: b.cx + b.hw - 0.6, z0: b.cz - b.hd + 1, z1: b.cz + b.hd - 1 },
      ];
      for (const e of edges) {
        w.scatter({ tag: 'town', lo: 0.28, hi: 1.1, count: 15, ...e, y: KERB_Y, avoid });
        w.scatter({ tag: 'town', lo: 0.02, hi: 0.3, count: 26, ...e, y: KERB_Y });
      }
      // corner lamps and lights
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        w.placeId('streetlamp', b.cx + sx * (b.hw - 1.6), b.cz + sz * (b.hd - 1.6), 0, 1, KERB_Y);
      }
      w.placeId('trafficlight', b.cx + b.hw - 2, b.cz + b.hd - 2, 0, 1, KERB_Y);
      w.placeId('telephonepole', b.cx - b.hw + 1.4, b.cz + 6, 0, 1, KERB_Y);
      w.placeId('trashcan_street', b.cx - 4, b.cz - b.hd + 1.6, 0, 1, KERB_Y);
      w.placeId('busstop', b.cx + 6, b.cz - b.hd + 2.2, 0, 1, KERB_Y);
      w.placeId('phonebooth', b.cx - b.hw + 2, b.cz - 8, 0, 1, KERB_Y);
    }

    /* ---------------- traffic ---------------- */
    for (let i = -2; i <= 2; i++) {
      const c = i * step;
      for (let s = -B + 12; s < B - 12; s += 13 + r() * 9) {
        if (r() < 0.62) {
          const kind = r();
          const id = kind < 0.58 ? 'car' : kind < 0.78 ? 'keitruck' : kind < 0.92 ? 'van' : 'bus';
          w.placeId(id, c + (r() < 0.5 ? -2.6 : 2.6), s, r() < 0.5 ? 0 : Math.PI);
        }
        if (r() < 0.5) {
          const id = r() < 0.6 ? 'car' : 'keitruck';
          w.placeId(id, s, c + (r() < 0.5 ? -2.6 : 2.6), Math.PI / 2);
        }
      }
    }
    for (let i = 0; i < 26; i++) {
      w.placeId('mopeds', -B + 8 + r() * (B * 2 - 16), -B + 8 + r() * (B * 2 - 16), r() * 6.28);
    }

    /* ---------------- pedestrians and small litter on the roads ---------------- */
    for (let i = 0; i < 54; i++) {
      const id = r() < 0.68 ? 'adult' : 'child';
      const b = blocks[Math.floor(r() * blocks.length)];
      const edge = Math.floor(r() * 4);
      const ex = edge < 2 ? b.cx - b.hw + 1.5 + r() * (b.hw * 2 - 3) : b.cx + (edge === 2 ? -b.hw + 1.6 : b.hw - 1.6);
      const ez = edge < 2 ? b.cz + (edge === 0 ? -b.hd + 1.6 : b.hd - 1.6) : b.cz - b.hd + 1.5 + r() * (b.hd * 2 - 3);
      w.placeId(id, ex, ez, r() * 6.28, 1, KERB_Y);
    }
    for (let i = 0; i < 30; i++) w.placeId('cat', -B + 10 + r() * (B * 2 - 20), -B + 10 + r() * (B * 2 - 20));
    for (let i = 0; i < 22; i++) w.placeId('dog_small', -B + 10 + r() * (B * 2 - 20), -B + 10 + r() * (B * 2 - 20));

    w.scatter({ tag: 'town', lo: 0.01, hi: 0.35, count: 520, x0: -B + 6, z0: -B + 6, x1: B - 6, z1: B - 6 });
    w.scatter({ tag: 'town', lo: 0.3, hi: 1.2, count: 260, x0: -B + 6, z0: -B + 6, x1: B - 6, z1: B - 6, avoid });
    w.scatter({ tag: 'town', lo: 1.0, hi: 3.2, count: 150, x0: -B + 10, z0: -B + 10, x1: B - 10, z1: B - 10, avoid });
    w.scatter({ tag: 'town', lo: 3.0, hi: 7.5, count: 70, x0: -B + 14, z0: -B + 14, x1: B - 14, z1: B - 14, avoid });

    // a dense little pile of starter junk right where you spawn
    w.scatter({ tag: 'town', lo: 0.012, hi: 0.2, count: 190, x0: -56, z0: -54, x1: -36, z1: -34 });
    w.scatter({ tag: 'town', lo: 0.15, hi: 0.6, count: 70, x0: -56, z0: -54, x1: -36, z1: -34, avoid });
  },
};
