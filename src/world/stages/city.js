/* ============================================================
   Stage 3 — The City.  5m  ->  120m,  twelve minutes.

   Downtown towers, a midtown grid, suburbs, a harbour and a
   ring of hills. By the end the katamari is bigger than the
   department store it started next to.

   Density note: an earlier draft of this stage was 1400m across
   with 3000 props and it played like an empty car park — roughly
   one collectable every four seconds. It is now 1040m across with
   ~9000 props, which brings the gap between pickups under two
   seconds at every size on the way to the goal.
   ============================================================ */

import { C } from '../../render/palette.js';

export const cityStage = {
  id: 'city',
  name: 'The City',
  subtitle: 'Nothing here is safe.',
  brief: 'Start in the suburbs on a bus-sized katamari. Work through the midtown grid ' +
    'into downtown, then out to the harbour and the hills. The clock is the only thing ' +
    'that can stop you.',
  seed: 19990921,
  startSize: 5,
  goal: 200,
  time: 480,
  // m/s at startSize; the curve grows from here.
  // 43s to cross at 5m, which matches the house — and 5.5x the pace of the
  // old global curve, which needed four minutes and is what made this stage
  // feel unfinishable. Checked at 12/15/18/24/33 with `balance --runs=9`:
  // clearability is flat across all of them (the sweeper bot lands in one of
  // two attractors, ~110m or ~265m, and which one is chaotic in the seed, not
  // ordered by speed). Since the sim could not separate them, this is chosen
  // on feel instead: 24 is where seconds-to-cross matches the other stages
  // AND screen-relative pace stops being 3x slower than the town's.
  speed: 13.2,
  cell: 36,
  chunk: 520,
  /**
   * The city's two shape dials. Only the city needed either — the house and
   * town were right as authored and stretching them made them worse.
   *
   *   `spread`  stretches the finished layout in X/Z (see World.build). The
   *             layout below is written at 1040m across and played at 4160m.
   *             Objects move apart; none is resized, added or removed.
   *   `density` multiplies every scatter count and every hand-written
   *             placement loop. 1 = as authored.
   *
   * Neither moves the size ceiling: spreading changes no counts, and small
   * props carry ~0% of a stage's mass (measured — the 4,120 objects a 5m
   * katamari could swallow on arrival carried 0.0% of the city).
   *
   * IMPORTANT: `stage.speed` is authored against the ORIGINAL coordinates and
   * is scaled by `spread` in `stageSpeedFor`. Without that the katamari crawls
   * across a world that got bigger without it — which reads as "too sparse"
   * (everything far away in SECONDS regardless of object count) and as
   * "we roll faster as we get bigger", because only growth catches you up.
   *
   * Everything in `build` is in the ORIGINAL coordinate space. `spawn` and
   * `bounds` are the exceptions — read from outside the build, so given in
   * final, already-spread coordinates.
   *
   * DENSITY IS NOT A "MORE OF THE SAME" DIAL — see the note on World.scatter.
   * Changing it re-rolls the whole stage, because every scatter pass draws from
   * one shared RNG stream and a different count shifts everything downstream.
   * Tried at 2.0 here: 5,152 props instead of 4,190 but 30.3M m3 of mass
   * instead of 32.7M — MORE things and LESS stuff, which is only possible if it
   * is a different city. Pacing moved with it (goal at 1:41 rather than 2:50,
   * then six flat minutes at the ceiling). Left at 1.6, the value this city was
   * tuned and played at.
   */
  density: 1.6,
  spread: 4,
  spawn: { x: -1408, z: 1232 },
  spawnClear: 34,
  bounds: { minX: -2080, maxX: 2080, minZ: -2080, maxZ: 2080 },
  sky: { top: 0x3f9fd8, bottom: 0xbfe6f2, fog: 0xc9e8f2, fogNear: 880, fogFar: 2900 },
  sun: { x: 0.4, y: 1, z: 0.5, intensity: 1.0 },
  camera: { pitch: 0.35, distance: 6.6 },

  build(w, r) {
    const t = w.terrain;
    const B = 520;
    /** `stage.density` applied to the hand-written loops; `scatter` does its own. */
    const n = (k) => Math.max(1, Math.round(k * (cityStage.density ?? 1)));

    /* ---------------- ground ----------------

       GROUND LAYERS, in order, with real gaps between them. Every one of these
       is a big flat horizontal quad covering a lot of map, and two of those at
       the same height z-fight across their whole overlap — which is what made
       the house roofs stripe, and what made these road markings flicker: the
       grass and the dashes were BOTH at y = 0.02, exactly coplanar.

       The separations look enormous written down and are invisible in play,
       because this map is two kilometres across. Err large. */
    const Y_ASPHALT = 0;
    const Y_GRASS = 0.10;
    const Y_WATER = 0.14;
    const Y_STREET = 0.22;
    const Y_MARKINGS = 0.34;

    w.plat(-B, -B, B, B, 0);
    t.quad(B * 2, B * 2, C.asphalt, { y: Y_ASPHALT });
    t.quad(B * 2, 190, C.grass, { y: Y_GRASS, z: -B + 95 });
    t.quad(B * 2, 160, C.grass, { y: Y_GRASS, z: B - 80 });
    t.quad(160, B * 2, C.grass, { x: -B + 80, y: Y_GRASS });
    // harbour
    t.quad(180, B * 2, C.water, { x: B - 90, y: Y_WATER });
    w.water(B - 180, -B, B, B);
    t.box(10, 5, B * 2, C.concreteD, { x: B - 182, y: 2.5 });
    w.plat(B - 187, -B, B - 177, B, 5);

    /* ---------------- street grid ---------------- */
    const GRID = 88;
    for (let i = -5; i <= 5; i++) {
      const c = i * GRID;
      if (Math.abs(c) > 450) continue;
      t.quad(22, 900, C.asphaltLt, { x: c, y: Y_STREET, z: 0 });
      t.quad(900, 22, C.asphaltLt, { y: Y_STREET, z: c });
      for (let s = -448; s < 448; s += 14) {
        t.quad(0.8, 7, C.offwhite, { x: c, y: Y_MARKINGS, z: s + 3.5 });
        t.quad(7, 0.8, C.offwhite, { x: s + 3.5, y: Y_MARKINGS, z: c });
      }
    }

    const avoid = [];
    const claim = (x, z, rad) => avoid.push({ x, z, r: rad });

    /* ---------------- downtown ---------------- */
    for (let gx = -2; gx <= 1; gx++) {
      for (let gz = -2; gz <= 1; gz++) {
        const cx = gx * GRID + GRID / 2, cz = gz * GRID + GRID / 2;
        for (const [ox, oz] of [[-21, -21], [21, -21], [-21, 21], [21, 21]]) {
          const x = cx + ox, z = cz + oz;
          const core = Math.hypot(x, z) < 165;
          const roll = r();
          const id = core
            ? (roll < 0.42 ? 'skyscraper' : roll < 0.86 ? 'tower' : 'department_store')
            : (roll < 0.3 ? 'tower' : roll < 0.72 ? 'office_small' : 'apartment');
          w.placeId(id, x, z, Math.round(r() * 3) * (Math.PI / 2));
          claim(x, z, 22);
        }
      }
    }

    /* ---------------- midtown ring ---------------- */
    for (let gx = -5; gx <= 4; gx++) {
      for (let gz = -5; gz <= 4; gz++) {
        const cx = gx * GRID + GRID / 2, cz = gz * GRID + GRID / 2;
        if (Math.abs(cx) > 420 || Math.abs(cz) > 420) continue;
        const d = Math.hypot(cx, cz);
        if (d < 175 || d > 400) continue;
        for (const [ox, oz] of [[-20, -20], [20, -20], [-20, 20], [20, 20]]) {
          const x = cx + ox, z = cz + oz;
          const roll = r();
          const id = roll < 0.32 ? 'apartment' : roll < 0.62 ? 'office_small'
            : roll < 0.84 ? 'shop_front' : 'house_small';
          w.placeId(id, x, z, Math.round(r() * 3) * (Math.PI / 2));
          claim(x, z, 17);
        }
      }
    }

    /* ---------------- suburbs (spawn side) ---------------- */
    for (let i = 0; i < 190; i++) {
      const x = -450 + r() * 250;
      const z = 190 + r() * 250;
      if (Math.abs(x % GRID) < 16 || Math.abs(z % GRID) < 16) continue;
      if (Math.hypot(x, z) > 430) continue;   // stay clear of the hill ring
      w.placeId(r() < 0.74 ? 'house_small' : 'shop_front', x, z, Math.round(r() * 3) * (Math.PI / 2));
      claim(x, z, 10);
      for (let k = 0; k < n(2); k++) {
        w.placeId(r() < 0.5 ? 'tree_round' : 'tree_pine',
          x + (r() - 0.5) * 24, z + (r() - 0.5) * 24, null, 0.9 + r() * 0.5);
      }
    }

    /* ---------------- landmarks ---------------- */
    w.placeId('stadium', -340, -330);         claim(-340, -330, 66);
    w.placeId('ferriswheel', 300, 240, 0.3);  claim(300, 240, 32);
    w.placeId('pagoda', -235, 120, 0.4);      claim(-235, 120, 18);
    w.placeId('lighthouse', 400, -400, null, 1, null, true);   claim(400, -400, 15);   // on the breakwater, deliberately
    w.placeId('windmill', -430, -140, 0.5);   claim(-430, -140, 17);
    w.placeId('windmill', -448, -70, -0.3);   claim(-448, -70, 17);
    w.placeId('factory', 240, -340, 0);       claim(240, -340, 34);
    w.placeId('factory', 305, -410, Math.PI / 2); claim(305, -410, 34);
    for (let i = 0; i < 8; i++) w.placeId('silo', 175 + i * 20, -380 + (i % 2) * 24);
    w.placeId('bridge_span', 195, 430, Math.PI / 2, 1, null, true); claim(195, 430, 46);
    w.placeId('bridge_span', 195, 500, Math.PI / 2, 1, null, true);
    w.placeId('watertower', -145, -410);
    w.placeId('watertower', 95, 410);
    w.placeId('watertower', 330, 60);
    for (let i = 0; i < 9; i++) w.placeId('crane', 330 + r() * 26, -250 + i * 62, r() * 6.28);
    for (let i = 0; i < 6; i++) w.placeId('cargoship', 455 + r() * 30, -350 + i * 145, Math.PI / 2 + (r() - 0.5) * 0.2);
    w.placeId('airplane', -95, -470, 0.2);
    w.placeId('airplane', 30, -500, -0.1);
    for (let i = 0; i < 14; i++) w.placeId('trainCar', -486, -240 + i * 40, 0);
    for (let i = 0; i < 26; i++) w.placeId('billboard', -420 + r() * 840, -420 + r() * 840, r() * 6.28);
    for (let i = 0; i < 16; i++) w.placeId('hotairballoon', -420 + r() * 840, -420 + r() * 840, r() * 6.28);

    /* ---------------- the hills ----------------
       Scaled across a wide range on purpose: at full size there is a
       hole in the size ladder between the stadium (83m) and a mountain
       (152m), and a katamari that lands in that hole simply stops
       growing. The scaled copies pave right over it. */
    // Scattered INSIDE the city as isolated landmarks, not as a boundary
    // ring. A ring left a dead corridor between the hills and the map edge
    // with nothing in it: a big katamari that wandered out there got wedged
    // against a 160m-radius hill with nothing to eat and no way to make
    // progress. Islands in the city have city all around them.
    const hills = [];
    const NHILL = 26;
    for (let i = 0; i < NHILL; i++) {
      const a = (i / NHILL) * Math.PI * 2 + r() * 0.5;
      const d = 240 + r() * 210;
      // Ceiling on the scale, not just a spread. At 1.75 the biggest hills had
      // a pickup size of 287m while a katamari that has eaten the ENTIRE city
      // only reaches 272m — so two of them were mathematically uncollectable
      // and stood there at the end of every run, which is exactly what the
      // player saw. Anything placed in a stage has to stay inside what a
      // fully-fed ball can swallow; `npm run balance` prints the final size.
      // The RANGE matters as much as the cap: these hills are the only rungs
      // between the stadium (83m) and the top of the ladder, so they have to
      // sample that band densely. Restricting islets to water thinned it out
      // and `balance` immediately reported a gap at 86m -> 140m, which is a
      // katamari that simply stops growing.
      const sc = 0.45 + r() * 0.8;
      const hx = Math.cos(a) * d, hz = Math.sin(a) * d;
      if (hills.some((h) => Math.hypot(h.x - hx, h.z - hz) < 150 * Math.max(h.sc, sc))) continue;
      hills.push({ x: hx, z: hz, sc });
      w.placeId('mountain', hx, hz, null, sc);
      claim(hx, hz, 80 * sc);
    }

    for (let i = 0; i < 12; i++) {
      const ix = 350 + r() * 165, iz = -500 + r() * 1000, isc = 0.55 + r() * 1.05;
      w.placeId('island_rock', ix, iz, null, isc);
      claim(ix, iz, 46 * isc);
    }
    for (let i = 0; i < n(60); i++) {
      const tx = -490 + r() * 980, tz = -490 + r() * 980, tsc = 0.8 + r() * 0.7;
      w.placeId('tree_big', tx, tz, null, tsc);
      claim(tx, tz, 16 * tsc);
    }

    /* ---------------- parkland ---------------- */
    const parks = [[-130, 300], [265, -145], [-300, -50], [95, 160], [-60, -300], [330, 330]];
    for (const [px, pz] of parks) {
      t.quad(130, 130, C.grass, { x: px, y: 0.03, z: pz });
      for (let i = 0; i < n(26); i++) {
        const a = r() * Math.PI * 2, d = r() * 62;
        w.placeId(r() < 0.5 ? 'tree_round' : r() < 0.8 ? 'tree_pine' : 'tree_palm',
          px + Math.cos(a) * d, pz + Math.sin(a) * d, null, 0.9 + r() * 0.6);
      }
      w.placeId('fountain', px, pz, 0, 2.4);
      for (let i = 0; i < n(8); i++) w.placeId('bench', px - 55 + r() * 110, pz - 55 + r() * 110, r() * 6.28);
      for (let i = 0; i < n(9); i++) w.placeId('rock_big', px - 55 + r() * 110, pz - 55 + r() * 110, null, 1.4 + r() * 1.6);
      for (let i = 0; i < n(6); i++) w.placeId('statue', px - 55 + r() * 110, pz - 55 + r() * 110, r() * 6.28);
      for (let i = 0; i < n(8); i++) w.placeId('hedge', px - 55 + r() * 110, pz - 55 + r() * 110, r() * 6.28);
    }

    /* ---------------- traffic ---------------- */
    for (let i = -5; i <= 5; i++) {
      const c = i * GRID;
      if (Math.abs(c) > 450) continue;
      for (let s = -448; s < 448; s += (21 + r() * 22) / (cityStage.density ?? 1)) {
        if (r() < 0.55) {
          const roll = r();
          const id = roll < 0.5 ? 'car' : roll < 0.68 ? 'keitruck' : roll < 0.85 ? 'van' : 'bus';
          w.placeId(id, c + (r() < 0.5 ? -5 : 5), s, r() < 0.5 ? 0 : Math.PI);
        }
        if (r() < 0.5) {
          const roll = r();
          const id = roll < 0.5 ? 'car' : roll < 0.7 ? 'keitruck' : roll < 0.88 ? 'van' : 'bus';
          w.placeId(id, s, c + (r() < 0.5 ? -5 : 5), Math.PI / 2);
        }
        if (r() < 0.34) w.placeId('streetlamp', c + (r() < 0.5 ? -11 : 11), s, 0);
        if (r() < 0.26) w.placeId('tree_round', s, c + (r() < 0.5 ? -11 : 11), 0, 0.8 + r() * 0.4);
      }
    }

    /* ---------------- street level dressing ----------------

       Counts cut hard, and it costs the stage NOTHING. Measured mass by size
       band: everything a 5m katamari can swallow on arrival — 4,120 objects —
       carried 0.0% of the city's mass, and everything under 8m carried 0.11%
       between them. 84% of it lives in the top three bands (64m, 128m, 256m).

       So small props are pure texture. The player kept reporting the city as
       too dense, and the map-wide "seconds between pickups" average kept
       saying it was fine, because the average smeared packed streets across
       empty asphalt: 19% of edible props sat closer together than the ball
       itself. Thin the texture, keep the mass, and the size ceiling does not
       move at all. */
    w.scatter({ tag: 'city', lo: 0.25, hi: 1.4, count: 300, x0: -450, z0: -450, x1: 450, z1: 450 });
    w.scatter({ tag: 'city', lo: 1.2, hi: 3.6, count: 300, x0: -450, z0: -450, x1: 450, z1: 450, avoid });
    w.scatter({ tag: 'city', lo: 3.0, hi: 8, count: 250, x0: -470, z0: -470, x1: 470, z1: 470, avoid });
    w.scatter({ tag: 'city', lo: 7, hi: 26, count: 180, x0: -470, z0: -470, x1: 470, z1: 470, avoid });
    w.scatter({ tag: 'city', lo: 20, hi: 60, count: 80, x0: -480, z0: -480, x1: 480, z1: 480, avoid });

    /* ---------------- starter bowl around the spawn ---------------- */
    w.scatter({ tag: 'city', lo: 0.25, hi: 2.2, count: 150, x0: -400, z0: 230, x1: -260, z1: 370 });
    w.scatter({ tag: 'city', lo: 1.6, hi: 6, count: 95, x0: -400, z0: 230, x1: -260, z1: 370 });
    w.scatter({ tag: 'city', lo: 5, hi: 14, count: 55, x0: -410, z0: 220, x1: -250, z1: 380 });
    for (let i = 0; i < n(40); i++) w.placeId('car', -400 + r() * 140, 230 + r() * 140, r() * 6.28);
    for (let i = 0; i < n(26); i++) w.placeId('tree_round', -405 + r() * 150, 225 + r() * 150, null, 0.8 + r() * 0.5);
    for (let i = 0; i < n(16); i++) w.placeId('streetlamp', -405 + r() * 150, 225 + r() * 150, r() * 6.28);

    /* ---------------- clouds ---------------- */
    for (let i = 0; i < 34; i++) {
      const a = r() * Math.PI * 2, d = r() * 470;
      w.placeId('cloud_puff', Math.cos(a) * d, Math.sin(a) * d, null, 1 + r() * 0.8, 110 + r() * 80);
    }
  },
};
