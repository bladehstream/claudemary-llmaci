/* ============================================================
   Stage 6 — The World.  50km -> 1,600km, nine minutes.

   A 25,600km ocean with six continents and a scatter of islands
   cut out of it. You start on a home island in the western
   archipelago at the size of a small country's longest road,
   swallowing atolls and coasters, and finish taking continents
   off the sea floor.

   ONE WORLD UNIT IS ONE KILOMETRE. That is a display convention
   only (`unit: 'geo'`); everything below is authored as plain
   numbers in the same band the physics was tuned in, exactly as
   the house is authored in metres. See the note above TIERS in
   util/math.js for why authoring in true metres breaks.

   Water note: `w.water(...)` is NOT a second walkable height.
   The katamari rolls across the sea exactly as it rolls across
   a continent — the rectangles only decide what may be PLACED
   where, so a container ship never ends up in a desert. The sea
   is therefore one big quad plus a coverage mask, and the
   continents are `w.plat` platforms raised above it with ramps
   at the beaches.

   Second water note: `World.scatter` rejects every wet position
   OUTRIGHT, whatever the prop's surface is. So scatter is for
   land props only and everything that floats or flies is placed
   by the `sea()` / `sky()` loops below. A water archetype left
   in a scatter pool does not float — it silently eats a slot.
   ============================================================ */

import { G } from '../props/country.js';

/** Anything that must not come out of a LAND scatter pool. */
const WET = ['w_atoll', 'w_island', 'w_oilrig', 'w_ship', 'w_iceberg', 'w_isles', 'w_hurricane'];
const AIR = ['w_satellite', 'w_station', 'w_cloudbank', 'w_jetstream'];
const OFFSHORE = [...WET, ...AIR];

/** Per-region "you do not get these here", so a desert has no fjords in it. */
const BAN = {
  temperate: [...OFFSHORE, 'w_icecap', 'w_dunes'],
  desert:    [...OFFSHORE, 'w_icecap', 'w_forest', 'w_lake', 'w_delta'],
  alpine:    [...OFFSHORE, 'w_dunes', 'w_delta'],
  plains:    [...OFFSHORE, 'w_icecap', 'w_volcano'],
  tundra:    [...OFFSHORE, 'w_dunes', 'w_delta', 'w_pyramids'],
  isle:      [...OFFSHORE, 'w_icecap', 'w_dunes', 'w_canyon', 'w_range'],
};

export const countryStage = {
  id: 'country',
  name: 'The Country',
  subtitle: 'Borders are a formality at this size.',
  brief: 'You are fifty kilometres across and standing on a home island. Eat the ' +
    'archipelago, then the shipping lanes, then the coasts — and when nothing on the ' +
    'water is big enough any more, start on the continents themselves.',
  /**
   * DISPLAY UNITS ONLY. One world unit means one nanometre / micrometre /
   * kilometre depending on the stage; the physics never learns this. See the
   * note above TIERS in util/math.js for why authoring in true metres breaks.
   */
  unit: 'geo',
  seed: 19690720,
  startSize: 50,
  goal: 1600,
  time: 540,
  speed: 320,
  density: 1,
  spread: 1,
  cell: 220,
  chunk: 3200,
  spawn: { x: -8200, z: 6400 },
  spawnClear: 340,
  bounds: { minX: -12800, maxX: 12800, minZ: -12800, maxZ: 12800 },
  /* Fog set to about 1.6 map-widths so a continent on the far side is a haze
     rather than a hard edge, and the horizon reads as curvature. */
  sky: { top: 0x1b4a86, bottom: 0xa9dcf2, fog: 0xc2e4f4, fogNear: 4200, fogFar: 21000 },
  sun: { x: 0.45, y: 1, z: 0.5, intensity: 1.05 },
  camera: { pitch: 0.42, distance: 6.2 },

  build(w, r) {
    const t = w.terrain;
    const B = 12800;

    /* ---------------- GROUND LAYERS ----------------

       Every one of these is a big flat horizontal quad covering a lot of map,
       and two of those at the same height z-fight across their whole overlap.
       The player has reported that twice. So: named heights, real gaps, and
       every stack of quads separated by more than any plausible float error.

       The separations look enormous written down — two whole kilometres
       between the sea surface and the surf line — and are invisible in play,
       because the map is twenty-five thousand kilometres across and the
       camera is thousands of kilometres up. Err large.

       The Y_ ones are absolute; the D_ ones are offsets from a landmass deck,
       which is itself unique per landmass (see `land()` below). */
    const Y_OCEAN = 0;       // the sea: the base platform top AND its quad
    const Y_ABYSS = 2.2;     // darker deeps, drawn over the sea
    const Y_SHELF = 5.0;     // pale shelf skirt round every landmass
    const Y_SURF = 8.0;      // the surf line right at a coast
    const D_SAND = -1.1;     // beach rim, hangs just below a deck
    const D_BIOME = 1.2;     // forest / desert / steppe painted on a deck
    const D_WATER = 2.6;     // inland seas and rivers
    const D_ROAD = 3.8;      // roads and rails

    /* ---------------- the sea ---------------- */
    w.plat(-B, -B, B, B, Y_OCEAN);
    t.quad(B * 2, B * 2, G.ocean, { y: Y_OCEAN });
    for (let i = 0; i < 18; i++) {
      // Each patch gets its own hair of height: they overlap each other freely.
      t.quad(2200 + r() * 5400, 1700 + r() * 4300, r() < 0.55 ? G.oceanDeep : 0x1a5490,
        { x: (r() - 0.5) * B * 1.9, y: Y_ABYSS + i * 0.07, z: (r() - 0.5) * B * 1.9, ry: r() * 3.14 });
    }

    /* ---------------- the land ----------------

       A region is a named group of rectangles at one deck height, plus the
       beaches that get you up onto it. Rectangles inside a region tile edge to
       edge and never overlap, so they can share a height; the +i*0.7 stagger
       is belt and braces against an arithmetic slip putting two decks in the
       same plane. */
    const REGIONS = [];
    const MASK = [];      // land + beaches: what gets cut out of the ocean
    let shelfN = 0;

    const land = (name, kind, deck, rects) => {
      const reg = { name, kind, deck, rects: [] };
      rects.forEach(([x0, z0, x1, z1], i) => {
        const top = deck + i * 0.7;
        const rc = { x0, z0, x1, z1, top };
        w.plat(x0, z0, x1, z1, top);
        MASK.push(rc);
        reg.rects.push(rc);
        // shelf skirt, beach rim, deck
        t.quad(x1 - x0 + 320, z1 - z0 + 320, G.shelf,
          { x: (x0 + x1) / 2, y: Y_SHELF + (shelfN++ % 24) * 0.09, z: (z0 + z1) / 2 });
        t.quad(x1 - x0 + 90, z1 - z0 + 90, G.sand, { x: (x0 + x1) / 2, y: top + D_SAND, z: (z0 + z1) / 2 });
        t.quad(x1 - x0, z1 - z0, kind.floor, { x: (x0 + x1) / 2, y: top, z: (z0 + z1) / 2 });
      });
      REGIONS.push(reg);
      return reg;
    };

    /**
     * A beach: a ramp out of the sea onto a deck, and the sloped face to see
     * it on. `hi` says which edge the land is at, so the same call describes a
     * west-facing and an east-facing shore.
     */
    const beach = (x0, z0, x1, z1, deck, axis, hi) => {
      const L = axis === 'x' ? x1 - x0 : z1 - z0;
      w.ramp(x0, z0, x1, z1, hi === 'min' ? deck : 0, hi === 'min' ? 0 : deck, axis);
      const tilt = Math.atan2(deck, L) * (hi === 'min' ? -1 : 1);
      const span = Math.hypot(L, deck);
      t.quad(axis === 'x' ? span : x1 - x0, axis === 'x' ? z1 - z0 : span, G.sand, {
        x: (x0 + x1) / 2, y: deck / 2, z: (z0 + z1) / 2,
        rz: axis === 'x' ? tilt : 0, rx: axis === 'x' ? 0 : -tilt,
      });
      MASK.push({ x0, z0, x1, z1, top: deck * 0.5 });
    };

    const TEMPERATE = { floor: G.plain, ban: BAN.temperate };
    const DESERT = { floor: G.steppe, ban: BAN.desert };
    const ALPINE = { floor: G.plainDry, ban: BAN.alpine };
    const PLAINS = { floor: G.plain, ban: BAN.plains };
    const TUNDRA = { floor: G.tundra, ban: BAN.tundra };
    const POLAR = { floor: G.ice, ban: BAN.tundra };
    const ISLE = { floor: G.jungle, ban: BAN.isle };

    /* --- the polar caps, top and bottom edges --- */
    const northCap = land('Northern Ice', POLAR, 24, [[-B, -B, B, -11600]]);
    const southCap = land('Southern Ice', POLAR, 20, [[-B, 11600, B, B]]);

    /* --- Verdance: wet, forested, the old world --- */
    const verdance = land('Verdance', TEMPERATE, 62, [
      [-9400, -8600, -3600, -4600],
      [-8200, -4600, -2600, -2600],
      [-6800, -2600, -4400, -1600],
    ]);
    beach(-10600, -7800, -9400, -5400, 62, 'x', 'max');
    beach(-6400, -1600, -5000, -600, 63.4, 'z', 'min');
    beach(-3600, -7600, -2400, -5600, 62, 'x', 'min');

    /* --- The Sunder: dune sea and dry mountains --- */
    const sunder = land('The Sunder', DESERT, 46, [
      [1800, -9000, 8400, -5000],
      [2800, -5000, 7400, -2800],
    ]);
    beach(4000, -2800, 6000, -1800, 46.7, 'z', 'min');
    beach(8400, -8200, 9600, -6000, 46, 'x', 'min');
    beach(600, -8000, 1800, -6200, 46, 'x', 'max');

    /* --- The Spine: the high country --- */
    const spine = land('The Spine', ALPINE, 86, [
      [3600, 800, 10800, 5800],
      [5400, 5800, 10200, 8000],
    ]);
    beach(2200, 1800, 3600, 4200, 86, 'x', 'max');
    beach(6600, 8000, 8600, 9200, 86.7, 'z', 'min');
    beach(10800, 2000, 12000, 4000, 86, 'x', 'min');

    /* --- Meridia: the great plain --- */
    const meridia = land('Meridia', PLAINS, 38, [
      [-4800, 1600, 1200, 6000],
      [-3600, 6000, -400, 8000],
    ]);
    beach(-6000, 2400, -4800, 4800, 38, 'x', 'max');
    beach(-3000, 8000, -1400, 9000, 38.7, 'z', 'min');
    beach(1200, 2600, 2400, 4400, 38, 'x', 'min');

    /* --- Northreach: tundra under the ice --- */
    const northreach = land('Northreach', TUNDRA, 30, [[-2800, -11200, 2400, -8400]]);
    beach(-1400, -8400, 600, -7400, 30, 'z', 'min');

    /* --- the western archipelago, where you start --- */
    const ARCH = [
      [-9800, 5200, -6800, 7600, 18],       // home island
      [-12200, 3000, -10400, 4400, 12],
      [-11400, 8200, -9800, 9600, 14],
      [-7000, 8600, -5400, 10000, 16],
      [-12400, 6000, -11000, 7000, 10],
      [-6600, 3200, -5200, 4400, 20],
      [-9200, 2000, -8000, 3000, 13],
      [-5000, 6600, -3800, 7800, 15],
      [-11000, 1000, -9600, 2000, 11],
      [-8600, 9200, -7400, 10400, 17],
      [-4400, 9000, -3200, 10000, 19],
      [-12600, 9800, -11400, 10800, 21],
    ];
    const archipelago = { name: 'The Archipelago', kind: ISLE, rects: [] };
    ARCH.forEach(([x0, z0, x1, z1, d], i) => {
      const reg = land(`Isle ${i}`, ISLE, d, [[x0, z0, x1, z1]]);
      archipelago.rects.push(...reg.rects);
    });

    /* --- lone islands scattered through the open ocean --- */
    const OUTER = [
      [9800, -3400, 11600, -2000, 34], [10600, 400, 12200, 1800, 28],
      [8600, 9400, 10000, 10800, 26], [-1600, 9600, 200, 10800, 22],
      [3000, -1400, 4400, -200, 36], [6800, -1000, 8200, 200, 32],
      [11200, 5400, 12600, 6800, 23], [-12400, -2600, -11000, -1200, 42],
      [-11800, -6000, -10400, -4600, 44], [-2000, -6600, -600, -5400, 40],
      [200, 8600, 1600, 9800, 27], [5600, 10400, 7000, 11400, 25],
    ];
    const outer = { name: 'Outer Isles', kind: ISLE, rects: [] };
    OUTER.forEach(([x0, z0, x1, z1, d], i) => {
      const reg = land(`Outer ${i}`, ISLE, d, [[x0, z0, x1, z1]]);
      outer.rects.push(...reg.rects);
    });

    /* ---------------- the ocean mask ----------------

       Ocean is "the whole map, minus the land", built one row at a time by
       subtracting the land rectangles from that row. Rows of 200 keep the
       coastline within 200km of the truth in Z and exact in X, which at this
       scale is a beach. Doing it as a mask rather than by hand means adding an
       island later cannot leave a puddle of water sitting on top of it. */
    for (let z = -B; z < B; z += 200) {
      const z1 = z + 200;
      const cuts = MASK.filter((m) => m.z0 < z1 && m.z1 > z)
        .map((m) => [m.x0, m.x1]).sort((a, c) => a[0] - c[0]);
      let x = -B;
      for (const [a, c] of cuts) {
        if (a > x) w.water(x, z, a, z1);
        if (c > x) x = c;
      }
      if (x < B) w.water(x, z, B, z1);
    }

    /* surf line: a bright rim just outside each coast, drawn after the mask so
       it does not disturb it */
    let surfN = 0;
    for (const m of MASK) {
      if (m.x1 - m.x0 < 1000) continue;
      t.quad(m.x1 - m.x0 + 620, m.z1 - m.z0 + 620, G.surf,
        { x: (m.x0 + m.x1) / 2, y: Y_SURF + (surfN++ % 20) * 0.08, z: (m.z0 + m.z1) / 2 });
    }

    /* ---------------- boundary ---------------- */
    w.bound(-B - 220, B, B + 220, B + 220, 1440);
    w.bound(-B - 220, -B - 220, B + 220, -B, 1440);
    w.bound(-B - 220, -B, -B, B, 1440);
    w.bound(B, -B, B + 220, B, 1440);

    /* ---------------- surface detail on the decks ---------------- */
    let biomeN = 0;
    const paint = (reg, col, n, scale, dy) => {
      for (let i = 0; i < n; i++) {
        const rc = reg.rects[Math.floor(r() * reg.rects.length)];
        const ww = (rc.x1 - rc.x0) * scale * (0.5 + r() * 0.8);
        const dd = (rc.z1 - rc.z0) * scale * (0.5 + r() * 0.8);
        t.quad(ww, dd, col, {
          x: rc.x0 + ww / 2 + r() * Math.max(0, rc.x1 - rc.x0 - ww),
          y: rc.top + dy + (biomeN++ % 18) * 0.14,
          z: rc.z0 + dd / 2 + r() * Math.max(0, rc.z1 - rc.z0 - dd),
          ry: (r() - 0.5) * 0.5,
        });
      }
    };
    paint(verdance, G.forest, 9, 0.3, D_BIOME);
    paint(verdance, G.forestDk, 5, 0.2, D_BIOME);
    paint(verdance, G.river, 3, 0.05, D_WATER);
    paint(sunder, G.sand, 8, 0.34, D_BIOME);
    paint(sunder, G.sandDeep, 5, 0.22, D_BIOME);
    paint(sunder, G.rockDk, 3, 0.12, D_BIOME);
    paint(spine, G.rock, 8, 0.28, D_BIOME);
    paint(spine, G.scree, 5, 0.18, D_BIOME);
    paint(spine, G.snow, 3, 0.12, D_WATER);
    paint(meridia, G.plainDry, 8, 0.3, D_BIOME);
    paint(meridia, G.forest, 4, 0.16, D_BIOME);
    paint(meridia, G.river, 3, 0.05, D_WATER);
    paint(northreach, G.tundra, 5, 0.3, D_BIOME);
    paint(northreach, G.forestDk, 4, 0.16, D_BIOME);
    paint(northCap, G.snow, 7, 0.16, D_BIOME);
    paint(northCap, G.iceBlue, 5, 0.1, D_WATER);
    paint(southCap, G.snow, 7, 0.16, D_BIOME);
    paint(southCap, G.iceBlue, 5, 0.1, D_WATER);
    for (const reg of REGIONS) {
      if (reg.kind === ISLE) paint(reg, r() < 0.5 ? G.forest : G.sand, 2, 0.3, D_BIOME);
    }
    // trunk roads across the two biggest continents
    for (const reg of [verdance, spine, meridia, sunder]) {
      const rc = reg.rects[0];
      t.quad(rc.x1 - rc.x0 - 200, 60, G.sandDeep, { x: (rc.x0 + rc.x1) / 2, y: rc.top + D_ROAD, z: (rc.z0 + rc.z1) / 2 });
      t.quad(60, rc.z1 - rc.z0 - 200, G.sandDeep, { x: (rc.x0 + rc.x1) / 2 + 400, y: rc.top + D_ROAD + 0.4, z: (rc.z0 + rc.z1) / 2 });
    }

    /* ---------------- the landmarks ----------------

       The top of the ladder is hand-placed rather than scattered. There are
       only twenty-six objects up here, they are between one and two and a half
       thousand kilometres across, and where they sit is the difference between
       an endgame and a traffic jam: one per continent, spread far enough apart
       that a katamari big enough to eat one is not standing inside the next. */
    const avoid = [];
    const big = (id, x, z, rot, sc, claim) => {
      w.placeId(id, x, z, rot, sc);
      avoid.push({ x, z, r: claim });
    };

    big('w_continent', -6400, -6300, 0.2, 1.0, 900);
    big('w_continent', 5100, -7000, -0.3, 1.05, 940);
    /* The Last Continent. Scaled up 45%, which raises what the game asks of
       you to swallow it — 2,585km — without adding a gram to the stage, since
       growth counts an archetype's own volume and ignores placement scale.
       Deliberately out of reach: a fully fed katamari tops out around 2,500km
       and can eat everything else in the world, so this one sits there at the
       end of every run being the thing you did not get. It is also the top
       rung of the ladder, 1.4x above the continents you CAN eat, well inside
       the 1.55x the gap checker allows. */
    big('w_continent', 7100, 3200, 0.5, 1.45, 1400);

    big('w_subcontinent', -1800, 3800, 0.3, 1.0, 700);
    big('w_subcontinent', -5400, -3600, -0.4, 0.95, 660);
    big('w_subcontinent', 5100, -3900, 0.8, 1.05, 700);

    big('w_country_large', 7900, 6900, 0.1, 1.0, 560);
    big('w_country_large', -8400, -7500, 0.6, 0.95, 540);
    big('w_country_large', 7600, -5900, -0.5, 1.05, 580);
    big('w_country_large', -4000, 2500, 0.9, 1.0, 560);

    big('w_country_small', -200, -9800, 0.2, 1.0, 420);
    big('w_country_small', 9500, 4600, -0.6, 1.1, 440);
    big('w_country_small', -4700, -7800, 0.4, 0.95, 400);
    big('w_country_small', -2000, 7000, 1.1, 1.0, 420);
    big('w_country_small', -11100, -5300, 0.3, 0.9, 380);
    big('w_country_small', 2900, -7600, -0.2, 1.05, 440);

    big('w_peninsula', -5600, -2100, 0.05, 1.0, 520);
    big('w_peninsula', 9400, 1700, Math.PI / 2, 1.0, 520);
    big('w_peninsula', -2600, 5200, -0.1, 1.05, 540);
    big('w_peninsula', 4600, -8400, 0.15, 0.95, 500);
    big('w_peninsula', -7200, -12000, 0, 1.0, 500);

    big('w_icecap', -9000, -12100, 0.2, 1.1, 420);
    big('w_icecap', 3200, -12100, -0.3, 1.0, 400);
    big('w_icecap', 10200, -12200, 0.5, 0.95, 380);
    big('w_icecap', -4200, 12100, 0.1, 1.05, 410);
    big('w_icecap', 7200, 12200, -0.4, 1.0, 400);

    /* ---------------- scattered land ----------------

       Counts are per million square units of deck, so a continent gets a
       continent's share and an islet gets an islet's, without a hand-written
       table that goes stale the moment a coastline moves. */
    const on = (reg, lo, hi, per, scale, rich = 1) => {
      for (const rc of reg.rects) {
        const n = Math.round(((rc.x1 - rc.x0) * (rc.z1 - rc.z0) / 1e6) * per * rich);
        if (n < 1) continue;
        w.scatter({
          tag: 'country', lo, hi, count: n, scale, avoid, exclude: reg.kind.ban,
          x0: rc.x0 + 70, z0: rc.z0 + 70, x1: rc.x1 - 70, z1: rc.z1 - 70,
        });
      }
    };

    const MAINLAND = [verdance, sunder, spine, meridia, northreach];
    for (const reg of MAINLAND) {
      on(reg, 15, 32, 6.8, [0.75, 1.9]);      // villages, wind farms, market towns
      on(reg, 26, 62, 3.0, [0.8, 1.7]);       // towns and cities
      on(reg, 60, 130, 1.25, [0.8, 1.5]);     // airports, dams, pyramids, launch sites
      on(reg, 130, 300, 0.5, [0.85, 1.4]);    // megacities, forests, walls, volcanoes
      on(reg, 260, 520, 0.2, [0.85, 1.3]);    // canyons, lakes, deltas, ranges, dune seas
    }

    /* Signature landforms, on narrow size windows so the weighted pool cannot
       decide a desert would rather have four more canyons. Without these the
       sand sea and the delta turn up three times each in the whole world and
       stop being things the stage has. */
    const only = (reg, lo, hi, count, scale) => {
      const rc = reg.rects[0];
      w.scatter({
        tag: 'country', lo, hi, count, scale, avoid, exclude: reg.kind.ban,
        x0: rc.x0 + 300, z0: rc.z0 + 300, x1: rc.x1 - 300, z1: rc.z1 - 300,
      });
    };
    only(sunder, 460, 520, 7, [0.8, 1.3]);        // the dune sea it is named for
    only(sunder, 250, 285, 5, [0.85, 1.3]);       // canyons
    only(spine, 430, 480, 6, [0.85, 1.25]);       // mountain ranges
    only(spine, 250, 285, 4, [0.85, 1.3]);
    only(verdance, 320, 380, 4, [0.85, 1.25]);    // river deltas
    only(verdance, 285, 310, 4, [0.85, 1.3]);     // great lakes
    only(meridia, 320, 380, 3, [0.85, 1.25]);
    only(meridia, 285, 310, 4, [0.85, 1.3]);
    only(meridia, 460, 520, 3, [0.8, 1.2]);
    only(northreach, 430, 480, 3, [0.8, 1.2]);
    for (const reg of [archipelago, outer]) {
      on(reg, 15, 32, 11.0, [0.7, 1.8]);
      on(reg, 26, 62, 4.2, [0.8, 1.6]);
      on(reg, 60, 130, 1.3, [0.8, 1.4]);
      on(reg, 130, 300, 0.5, [0.85, 1.3]);
    }
    // the poles get ice and rock and nothing else
    for (const reg of [northCap, southCap]) {
      w.scatter({
        tag: 'country', lo: 400, hi: 700, count: 9, scale: [0.7, 1.15], avoid,
        exclude: [...OFFSHORE, 'w_dunes', 'w_delta', 'w_lake'],
        x0: reg.rects[0].x0 + 700, z0: reg.rects[0].z0 + 200, x1: reg.rects[0].x1 - 700, z1: reg.rects[0].z1 - 200,
      });
      w.scatter({
        tag: 'country', lo: 130, hi: 300, count: 26, scale: [0.8, 1.5], avoid,
        exclude: [...OFFSHORE, 'w_forest', 'w_megacity', 'w_volcano'],
        x0: reg.rects[0].x0 + 400, z0: reg.rects[0].z0 + 120, x1: reg.rects[0].x1 - 400, z1: reg.rects[0].z1 - 120,
      });
    }

    /* ---------------- the sea and the sky ----------------

       Both by hand: `scatter` throws out every wet position before it even
       looks at the archetype, so a hurricane placed that way would never once
       land on the ocean. */
    const IDS = (a) => a[Math.floor(r() * a.length)];
    const sea = (ids, count, s0, s1, x0 = -B, z0 = -B, x1 = B, z1 = B) => {
      for (let i = 0, guard = 0; i < count && guard < count * 14; guard++) {
        const x = x0 + r() * (x1 - x0), z = z0 + r() * (z1 - z0);
        if (!w.isWater(x, z)) continue;
        w.placeId(IDS(ids), x, z, null, s0 + r() * (s1 - s0));
        i++;
      }
    };
    const sky = (ids, count, s0, s1) => {
      for (let i = 0; i < count; i++) {
        w.placeId(IDS(ids), (r() - 0.5) * B * 1.96, (r() - 0.5) * B * 1.96, null, s0 + r() * (s1 - s0));
      }
    };

    sea(['w_atoll'], 360, 0.7, 2.0);
    sea(['w_island'], 360, 0.7, 1.9);
    sea(['w_oilrig'], 110, 0.8, 1.6);
    sea(['w_ship'], 86, 0.8, 1.5);
    sea(['w_isles'], 22, 0.8, 1.35);
    sea(['w_hurricane'], 14, 0.8, 1.3);
    // bergs calve off the caps, so they stay in the cold water
    sea(['w_iceberg'], 36, 0.8, 1.6, -B, -B, B, -8600);
    sea(['w_iceberg'], 36, 0.8, 1.6, -B, 8600, B, B);

    sky(['w_satellite'], 90, 0.8, 2.0);
    sky(['w_cloudbank'], 74, 0.8, 1.7);
    sky(['w_station'], 24, 0.9, 1.5);
    sky(['w_jetstream'], 26, 0.85, 1.3);

    /* ---------------- the home island ----------------

       Where the whole thing is decided. A 50km katamari can swallow anything
       up to 44km, which at this scale is a village, a wind farm, an atoll, a
       market town, a satellite, an islet or an oil platform — so the bowl
       round the spawn is packed with exactly those and nothing that could
       wall it in. Without this pass the opening minute is a very long walk. */
    const HX = -9800, HZ = 5200, HX1 = -6800, HZ1 = 7600;
    w.scatter({ tag: 'country', lo: 15, hi: 32, count: 180, scale: [0.8, 1.7], exclude: BAN.isle, x0: HX + 90, z0: HZ + 90, x1: HX1 - 90, z1: HZ1 - 90 });
    w.scatter({ tag: 'country', lo: 26, hi: 62, count: 64, scale: [0.8, 1.5], exclude: BAN.isle, x0: HX + 120, z0: HZ + 120, x1: HX1 - 120, z1: HZ1 - 120 });
    w.scatter({ tag: 'country', lo: 60, hi: 130, count: 22, scale: [0.8, 1.3], exclude: BAN.isle, x0: HX + 200, z0: HZ + 200, x1: HX1 - 200, z1: HZ1 - 200 });
    sea(['w_atoll', 'w_island', 'w_oilrig'], 150, 0.7, 1.6, HX - 2400, HZ - 2400, HX1 + 2400, HZ1 + 2400);
    sea(['w_ship'], 16, 0.8, 1.3, HX - 2600, HZ - 2600, HX1 + 2600, HZ1 + 2600);
    for (let i = 0; i < 18; i++) {
      w.placeId('w_satellite', HX - 1400 + r() * 5600, HZ - 1400 + r() * 5200, null, 0.8 + r() * 1.1);
    }
  },
};
