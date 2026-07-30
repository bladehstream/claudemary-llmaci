/* ============================================================
   Stage 7 — The World.  400km -> 12,800km, nine minutes.

   A 210,000km sea with eight landmasses standing out of it, and
   on them the things a planet is actually made of: mountains and
   forests, waterfalls and canyons, glaciers and volcanoes, then
   ranges and rainforests and ice sheets, then continents and
   oceans — and at the top of the ladder the planet itself. You
   start on the Home Coast at the size of a small country, eat
   the cities and the mountains, walk up onto the higher ground
   as you outgrow the shore ramps, and finish taking whole oceans
   off the sea floor. Earth is 12,742km wide and the GOAL is
   12,800km: the point of this stage is to become the world.

   ONE WORLD UNIT IS 250 KILOMETRES. That is a display convention
   only (`unit: 'planet'`) — every number below is a plain number
   in the band the physics was tuned in, exactly as the house is
   authored in metres. See the note above TIERS in util/math.js
   for why authoring in true metres breaks.

   THREE THINGS THIS LAYOUT IS BUILT AROUND, each of which cost
   somebody a day somewhere in this game's history:

   1. GROUND DECALS ARE TINY. Two separate constraints and both
      bite. No two big flat faces may share a Y, or they z-fight
      across their whole overlap; and a decal must sit far below
      the STARTING radius, which here is 200km, or it saws the
      katamari in half. Every layer height below is named, and
      the tallest of them is 0.216 — a quarter of that radius.
      `npm run decals` is the guard.

   2. RAMPS ARE RUNS OF SHORT STEPS, never one long tilted plate.
      A plate is two triangles per face, so its footprint covers
      the whole ramp while its corner-average height sits halfway
      up the slope: the eye and `test-decals` both read that as a
      floor at chest height. See `slope()` below.

   3. RAMPS SPAN THE FULL WIDTH OF THE EDGE THEY CLIMB. A narrow
      ramp has sides, and a side is a wall — which turns the
      approach to a deck into a funnel you can miss.

   Water note: `w.water(...)` is NOT a second walkable height.
   The katamari rolls across the sea exactly as it rolls across a
   landmass; the rectangles only decide what may be PLACED where,
   so a coral reef never ends up in a desert. The sea is one big
   quad plus a coverage mask, and the land is `w.plat` platforms
   raised above it with ramps at the shorelines.

   Second water note: `World.scatter` IS surface-aware, but only
   for a pool that actually contains something amphibious — a
   pool of pure land props keeps the old draw order so the older
   stages stay byte-identical. So the wet and the airborne passes
   below use pools filtered down to exactly those, which makes
   `mixed` true and lets the retry loop ask the only question
   that matters: does THIS thing belong HERE.
   ============================================================ */

import { G } from '../props/world.js';

/** Anything that stands in the sea. Must not come out of a LAND pool. */
const WET = ['wd_reef', 'wd_fjord', 'wd_island', 'wd_storm', 'wd_peninsula',
  'wd_archipelago', 'wd_inland_sea', 'wd_ocean'];
/** The weather. Hovers, so it ignores the water test and needs its own pass. */
const AIR = ['wd_thunderhead', 'wd_cloudfront'];
const OFFSHORE = [...WET, ...AIR];
/** The prize. Hand-placed as a landmark, never scattered. */
const BODIES = ['wd_planet'];
/** Everything that belongs on dry ground, for the sea and sky passes to exclude. */
const LAND = ['wd_city', 'wd_waterfall', 'wd_mountain', 'wd_volcano', 'wd_craterlake',
  'wd_canyon', 'wd_glacier', 'wd_forest', 'wd_lake', 'wd_delta', 'wd_saltflat',
  'wd_escarpment', 'wd_range', 'wd_greatlake', 'wd_rainforest', 'wd_dunesea',
  'wd_icefield', 'wd_riversystem', 'wd_cordillera', 'wd_icesheet', 'wd_desertbelt',
  'wd_continent', ...BODIES];

/**
 * Per-region "you do not get these here", so an ice cap has no rainforest on it
 * and a desert has no glacier. Every list has to leave each scatter window
 * below with something in it — `scatter` on an empty pool is a silent no-op, so
 * over-banning does not fail, it just quietly empties a region.
 */
const BAN = {
  temperate: [...OFFSHORE, ...BODIES, 'wd_icesheet', 'wd_icefield', 'wd_dunesea',
    'wd_desertbelt', 'wd_saltflat'],
  desert:    [...OFFSHORE, ...BODIES, 'wd_icesheet', 'wd_icefield', 'wd_glacier',
    'wd_rainforest', 'wd_forest', 'wd_greatlake', 'wd_delta'],
  alpine:    [...OFFSHORE, ...BODIES, 'wd_dunesea', 'wd_desertbelt', 'wd_rainforest',
    'wd_delta', 'wd_saltflat'],
  polar:     [...OFFSHORE, ...BODIES, 'wd_dunesea', 'wd_desertbelt', 'wd_rainforest',
    'wd_saltflat', 'wd_forest', 'wd_delta', 'wd_city', 'wd_continent'],
  jungle:    [...OFFSHORE, ...BODIES, 'wd_icesheet', 'wd_icefield', 'wd_glacier',
    'wd_dunesea', 'wd_desertbelt', 'wd_saltflat'],
  volcanic:  [...OFFSHORE, ...BODIES, 'wd_icesheet', 'wd_icefield', 'wd_rainforest',
    'wd_dunesea', 'wd_desertbelt', 'wd_forest', 'wd_greatlake'],
  isle:      [...OFFSHORE, ...BODIES, 'wd_icesheet', 'wd_icefield', 'wd_desertbelt',
    'wd_dunesea', 'wd_continent', 'wd_cordillera', 'wd_riversystem', 'wd_escarpment',
    'wd_greatlake', 'wd_saltflat'],
};

export const worldStage = {
  id: 'world',
  name: 'The World',
  subtitle: 'Mountains first. Work up.',
  brief: 'You are four hundred kilometres across, standing on the Home Coast of a sea that ' +
    'runs two hundred thousand kilometres from edge to edge. Start on the cities and the ' +
    'mountains and the waterfalls, take the shorelines and the ramps up onto the higher ' +
    'ground as you outgrow them, and work outwards — the canyons of the Riven Plateau, ' +
    'the rainforest, the great desert, the mountain belt, the ice. The goal is 12,800km, ' +
    'which is the width of the planet you are standing on. After that there is one thing ' +
    'left to eat, and it is the planet.',
  /**
   * DISPLAY UNITS ONLY — see the note above TIERS in util/math.js. One world
   * unit means 250km here; the physics never learns that. The ratio is chosen so
   * `goal` is Earth.
   */
  unit: 'planet',
  seed: 19610412,
  startSize: 1.6,
  goal: 51.2,
  time: 540,
  speed: 10.5,
  density: 1,
  spread: 1,
  cell: 7,
  chunk: 110,
  spawn: { x: -270, z: 210 },
  spawnClear: 11,
  bounds: { minX: -420, maxX: 420, minZ: -420, maxZ: 420 },
  /* Fog at about 1.5 map-widths, so a landmass on the far side is a haze rather
     than a hard edge and the horizon reads as curvature. Seen from a few
     thousand kilometres up the sky is thin and dark overhead and still blue at
     the rim, so the gradient runs from deep navy at the zenith to atmosphere
     blue at the horizon. */
  sky: { top: 0x0a2c58, bottom: 0x5aa8d4, fog: 0x3d84b4, fogNear: 240, fogFar: 1160 },
  sun: { x: 0.5, y: 1, z: 0.4, intensity: 1.06 },
  camera: { pitch: 0.4, distance: 6.4 },

  build(w, r) {
    const t = w.terrain;
    const B = 420;

    /* ---------------- LAYER HEIGHTS ----------------

       Every one of these is a big flat horizontal quad covering a lot of map,
       and two of those at the same height z-fight across their whole overlap.
       So: named heights, real gaps, and the whole stack held under a third of
       the starting radius (0.8) so none of it can cut through the ball.

       The `%` staggers exist because neighbouring patches inside one layer
       overlap each other freely — two coplanar overlapping quads of different
       colours are the same defect at a smaller scale. Modulo rather than a
       running sum, so the stagger cannot creep up into the next layer however
       many patches a region ends up with.

       Y_ heights are absolute (they sit on the sea); D_ ones are offsets from
       a landmass's own deck. */
    const Y_SEA = 0;             // the sea: the base platform top AND its quad
    const Y_ABYSS = 0.05;        // darker deeps, drawn over the sea
    const Y_SHELF = 0.13;        // pale shelf skirt round every landmass
    const Y_SURF = 0.185;        // the surf line right at a shore
    const D_DECK = 0.04;         // the landmass's own surface
    const D_BIOME = 0.07;        // forest / desert / steppe painted on the deck
    const D_BIOME2 = 0.11;       // a second biome over the first
    const D_WATER = 0.15;        // inland seas and rivers
    const D_TRACK = 0.19;        // dust and lava tracks
    /* The crust block under a landmass: real vertical sides so the land has
       thickness. Inset from the platform so its LID is never over open sea
       (which would put a flat face a whole deck-height above the ground) and
       based below the sea quad so its underside is not coplanar with it. */
    const CRUST_BASE = -0.5;
    const CRUST_INSET = 1.4;
    const CRUST_GAP = 0.12;      // lid sits this far under the deck quad

    /* ---------------- the sea ---------------- */
    w.plat(-B, -B, B, B, Y_SEA);
    t.quad(B * 2, B * 2, G.ocean, { y: Y_SEA });
    for (let i = 0; i < 22; i++) {
      t.quad(90 + r() * 260, 70 + r() * 210, r() < 0.5 ? G.oceanDeep : G.abyss, {
        x: (r() - 0.5) * B * 1.9, y: Y_ABYSS + (i % 20) * 0.002,
        z: (r() - 0.5) * B * 1.9, ry: r() * 3.14,
      });
    }

    /* ---------------- the land ----------------

       A region is a named group of rectangles at one deck height, plus the
       shores that get you up onto it. Rectangles inside a region tile edge to
       edge and never overlap, so they can share a height; the +i*0.03 stagger
       is belt and braces against an arithmetic slip putting two decks in one
       plane.

       NO DECK COMES WITHIN 60 OF THE BOUNDARY, and that is not decoration.
       `canOccupy` clamps the ball's centre to the bounds, so a fully grown
       katamari cannot reach a point closer than its own radius — about 38 here
       — to the edge. If a deck reached the rim, the clamp would force that ball
       up onto the deck, and the vertical band in `resolve` would then put every
       low prop sitting on the sea just outside it out of reach. That exact
       shape of bug shipped once already; `npm run reach` is what catches it.

       A DECK, note, not anything raised at all. The shores below reach to
       within 34 of the rim and that is fine, because a shore's far end is at
       sea level by construction: the ball clamped against the boundary is
       standing on a third of a unit, not on a landmass. The distinction is
       load-bearing — half the shores in this stage would not exist if the rule
       were read as the stronger one. */
    const REGIONS = [];
    const MASK = [];             // land + shores: what gets cut out of the sea
    let shelfN = 0, surfN = 0;

    const land = (name, kind, deck, rects) => {
      const reg = { name, kind, deck, rects: [] };
      rects.forEach(([x0, z0, x1, z1], i) => {
        const top = deck + i * 0.03;
        const rc = { x0, z0, x1, z1, top };
        w.plat(x0, z0, x1, z1, top);
        MASK.push(rc);
        reg.rects.push(rc);
        const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
        // shelf skirt, low over the water where it cannot cut the ball
        t.quad(x1 - x0 + 22, z1 - z0 + 22, G.shelf,
          { x: cx, y: Y_SHELF + (shelfN++ % 20) * 0.002, z: cz });
        // the crust block: sides you can see, lid safely inside the platform
        t.box(x1 - x0 - CRUST_INSET * 2, top - CRUST_GAP - CRUST_BASE, z1 - z0 - CRUST_INSET * 2,
          G.crust, { x: cx, y: (top - CRUST_GAP + CRUST_BASE) / 2, z: cz });
        // and the deck itself, footprint EXACTLY the platform's
        t.quad(x1 - x0, z1 - z0, kind.floor, { x: cx, y: top + D_DECK, z: cz });
      });
      REGIONS.push(reg);
      return reg;
    };

    /**
     * Declare a shore AND draw it, as a run of short flat steps.
     *
     * One long tilted plate is the trap, and it fails twice over: sunk to the
     * collision plane at its centre it still floats half a thickness at one end
     * and buries itself at the other, and its SHAPE is wrong regardless — a box
     * face is two triangles, so a 30-unit plate has one triangle whose
     * footprint is the whole ramp and whose average height is halfway up it.
     * `test-decals` and the eye both read that as a floor at chest height.
     *
     * Short steps instead. Each is axis-aligned with its top face exactly on
     * the collision plane at its own centre, and each reaches from below the
     * sea floor up to that surface, so the wedge is solid and its underside
     * stays buried. The only error left is half a step, held to RISE / 2 =
     * 0.14, which is under a fifth of the starting radius.
     *
     * `hi` says which edge the land is at, so the same call describes a
     * west-facing and an east-facing shore.
     */
    const RISE = 0.28;
    const slope = (x0, z0, x1, z1, deck, axis, hi, colour) => {
      const top = hi === 'min' ? deck : Y_SEA;
      const topTo = hi === 'min' ? Y_SEA : deck;
      w.ramp(x0, z0, x1, z1, top, topTo, axis);
      MASK.push({ x0, z0, x1, z1, top: deck * 0.5 });
      const along = axis === 'x' ? x1 - x0 : z1 - z0;
      const wide = axis === 'x' ? z1 - z0 : x1 - x0;
      const rise = topTo - top;
      const m = Math.max(1, Math.ceil(Math.abs(rise) / RISE));
      const step = (along / m) * 1.02;
      for (let i = 0; i < m; i++) {
        const f = (i + 0.5) / m;
        const p = top + f * rise;                 // the collision height right here
        const thick = p - CRUST_BASE;             // ...down through the sea floor
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

    const TEMPERATE = { floor: G.land, ban: BAN.temperate };
    const DESERT = { floor: G.steppe, ban: BAN.desert };
    const ALPINE = { floor: G.scree, ban: BAN.alpine };
    const POLAR = { floor: G.ice, ban: BAN.polar };
    const JUNGLE = { floor: G.jungle, ban: BAN.jungle };
    const VOLCANIC = { floor: G.basalt, ban: BAN.volcanic };
    const ISLE = { floor: G.jungle, ban: BAN.isle };

    /* --- the Home Coast, where you start ---
       Deck 1.2 against a starting radius of 0.8: a wall for the first few
       seconds and a step you can mount by the first minute, which is what a
       shore should be. Ramps down BOTH free sides so the opening move is never
       a hunt for the way off. */
    const home = land('The Home Coast', TEMPERATE, 1.2, [[-352, 148, -196, 292]]);
    slope(-196, 148, -166, 292, 1.2, 'x', 'min', G.sand);
    slope(-352, 128, -196, 148, 1.2, 'z', 'max', G.sand);

    /* --- the Shallows: islets low enough to climb from the word go --- */
    const ISLETS = [
      [-336, 318, -292, 354, 0.55], [-268, 330, -230, 362, 0.7],
      [-390, 232, -356, 266, 0.6], [-46, 60, -14, 92, 0.8],
      [-388, 132, -358, 162, 0.5], [-244, 300, -212, 328, 0.75],
      [-160, 168, -128, 200, 0.65], [-396, -30, -364, 2, 0.85],
      [-140, 130, -108, 160, 0.7], [-180, 340, -148, 370, 0.6],
      [-60, 150, -28, 180, 0.8], [110, 20, 142, 52, 0.55],
    ];
    const shallows = { name: 'The Shallows', kind: ISLE, rects: [] };
    ISLETS.forEach(([x0, z0, x1, z1, d], i) => {
      shallows.rects.push(...land(`Islet ${i}`, ISLE, d, [[x0, z0, x1, z1]]).rects);
    });

    /* EVERY FREE EDGE OF EVERY LANDMASS GETS A SHORE, and that is the third
       layout rule doing real work rather than being tidy.

       A landmass with ramps on two of its four sides has two sides that are a
       wall from the water, and the strip of sea between such a side and the map
       rim is a trap for the bot rather than for the ball: the highest-value prop
       it can see is up on the deck, it steers at it, the deck will not be
       climbed, and it never occurs to it to go and find the far shore. It orbits
       until the clock runs out — moving the whole time, so the stall detector
       never fires. One balance run in nine died in the sixty-unit strip north of
       the Rimefield with six minutes left, and another in the strip east of the
       Sunder.

       So: a shore on every edge that has open water beyond it, spanning the full
       width of that edge. The outer ones reach to within 34 of the boundary,
       which the "nothing raised within 60 of the rim" rule above does NOT
       forbid — that rule is about DECKS, and a shore's far end is at sea level
       by construction, so a fully grown katamari clamped against the rim is
       standing on something a third of a unit high. `npm run reach` is what
       actually settles it. */

    /* --- the Riven Plateau: dry uplands cut to pieces by canyons --- */
    const riven = land('The Riven Plateau', DESERT, 2.4, [[-330, -70, -150, 96]]);
    slope(-330, 96, -150, 126, 2.4, 'z', 'min', G.sandDeep);
    slope(-150, -70, -118, 96, 2.4, 'x', 'min', G.sandDeep);
    slope(-360, -70, -330, 96, 2.4, 'x', 'max', G.sandDeep);
    slope(-330, -102, -150, -70, 2.4, 'z', 'max', G.sandDeep);

    /* --- the Verdance: the rainforest belt on the equator --- */
    const verdance = land('The Verdance', JUNGLE, 1.9, [[-116, 226, 126, 356]]);
    slope(-116, 196, 126, 226, 1.9, 'z', 'max', G.jungleDk);
    slope(-146, 226, -116, 356, 1.9, 'x', 'max', G.jungleDk);
    slope(126, 226, 144, 356, 1.9, 'x', 'min', G.jungleDk);
    slope(-116, 356, 126, 386, 1.9, 'z', 'min', G.jungleDk);

    /* --- the Sunder: the great desert --- */
    const sunder = land('The Sunder', DESERT, 3.0, [[176, 190, 356, 356]]);
    slope(176, 160, 356, 190, 3.0, 'z', 'max', G.sand);
    slope(144, 190, 176, 356, 3.0, 'x', 'max', G.sand);
    slope(356, 190, 386, 356, 3.0, 'x', 'min', G.sand);
    slope(176, 356, 356, 386, 3.0, 'z', 'min', G.sand);

    /* --- the Spine: the mountain belt, and the shield volcano on it --- */
    const spine = land('The Spine', ALPINE, 5.2, [[186, -56, 356, 132]]);
    slope(152, -56, 186, 132, 5.2, 'x', 'max', G.rock);
    slope(186, 132, 356, 156, 5.2, 'z', 'min', G.rock);
    slope(356, -56, 386, 132, 5.2, 'x', 'min', G.rock);
    slope(186, -88, 356, -56, 5.2, 'z', 'max', G.rock);

    /* --- the Rimefield: the polar ice cap along the northern edge --- */
    const rime = land('The Rimefield', POLAR, 4.0, [[-356, -356, 40, -230]]);
    slope(-356, -230, 40, -198, 4.0, 'z', 'min', G.iceBlue);
    slope(-356, -386, 40, -356, 4.0, 'z', 'max', G.iceBlue);
    slope(-386, -356, -356, -230, 4.0, 'x', 'max', G.iceBlue);
    slope(40, -356, 72, -230, 4.0, 'x', 'min', G.iceBlue);

    /* --- the Ashlands: young lava country lifted clear of the water --- */
    const ash = land('The Ashlands', VOLCANIC, 3.6, [[-90, -170, 60, -20]]);
    slope(-90, -20, 60, 12, 3.6, 'z', 'min', G.basalt);
    slope(60, -170, 92, -20, 3.6, 'x', 'min', G.basalt);
    slope(-122, -170, -90, -20, 3.6, 'x', 'max', G.basalt);
    slope(-90, -202, 60, -170, 3.6, 'z', 'max', G.basalt);

    /* --- the Craton: the oldest, highest ground, and the far corner of the
           map from the spawn. The planet itself is up here. --- */
    const craton = land('The Craton', ALPINE, 6.4, [[130, -356, 356, -180]]);
    slope(130, -180, 356, -146, 6.4, 'z', 'min', G.rockDk);
    slope(96, -356, 130, -180, 6.4, 'x', 'max', G.rockDk);
    slope(356, -356, 386, -180, 6.4, 'x', 'min', G.rockDk);
    slope(130, -386, 356, -356, 6.4, 'z', 'max', G.rockDk);

    /* ---------------- the sea mask ----------------

       Sea is "the whole map, minus the land", built one row at a time by
       subtracting the land rectangles from that row. Rows of 6 keep the
       coastline within 6 of the truth in Z and exact in X, which at 840 across
       is a beach. Doing it as a mask rather than by hand means adding an islet
       later cannot leave a puddle of water sitting on top of it. */
    for (let z = -B; z < B; z += 6) {
      const z1 = z + 6;
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
       it cannot disturb it */
    for (const m of MASK) {
      if (m.x1 - m.x0 < 40) continue;
      t.quad(m.x1 - m.x0 + 12, m.z1 - m.z0 + 12, G.surf,
        { x: (m.x0 + m.x1) / 2, y: Y_SURF + (surfN++ % 16) * 0.002, z: (m.z0 + m.z1) / 2 });
    }

    /* ---------------- boundary ----------------
       Impassable (`bound` passes solidH 1e6), so the visible height is only
       about giving the rim something to be. */
    w.bound(-B - 7, B, B + 7, B + 7, 44);
    w.bound(-B - 7, -B - 7, B + 7, -B, 44);
    w.bound(-B - 7, -B, -B, B, 44);
    w.bound(B, -B, B + 7, B, 44);

    /* ---------------- surface detail on the decks ---------------- */
    let biomeN = 0;
    const paint = (reg, col, n, scale, dy) => {
      for (let i = 0; i < n; i++) {
        const rc = reg.rects[Math.floor(r() * reg.rects.length)];
        const ww = (rc.x1 - rc.x0) * scale * (0.5 + r() * 0.8);
        const dd = (rc.z1 - rc.z0) * scale * (0.5 + r() * 0.8);
        t.quad(ww, dd, col, {
          x: rc.x0 + ww / 2 + r() * Math.max(0, rc.x1 - rc.x0 - ww),
          y: rc.top + dy + (biomeN++ % 14) * 0.002,
          z: rc.z0 + dd / 2 + r() * Math.max(0, rc.z1 - rc.z0 - dd),
          ry: (r() - 0.5) * 0.5,
        });
      }
    };
    paint(home, G.landDry, 7, 0.3, D_BIOME);
    paint(home, G.forest, 4, 0.18, D_BIOME2);
    paint(home, G.river, 3, 0.05, D_WATER);
    paint(riven, G.landDry, 8, 0.32, D_BIOME);
    paint(riven, G.sandDeep, 5, 0.2, D_BIOME2);
    paint(riven, G.silt, 3, 0.07, D_TRACK);
    paint(verdance, G.jungleDk, 9, 0.3, D_BIOME);
    paint(verdance, G.forest, 5, 0.16, D_BIOME2);
    paint(verdance, G.river, 4, 0.04, D_WATER);
    paint(sunder, G.sand, 9, 0.34, D_BIOME);
    paint(sunder, G.sandDeep, 6, 0.2, D_BIOME2);
    paint(sunder, G.saltDk, 3, 0.1, D_TRACK);
    paint(spine, G.rock, 8, 0.3, D_BIOME);
    paint(spine, G.rockDk, 5, 0.18, D_BIOME2);
    paint(spine, G.snow, 4, 0.12, D_WATER);
    paint(rime, G.snow, 9, 0.2, D_BIOME);
    paint(rime, G.iceBlue, 6, 0.12, D_BIOME2);
    paint(rime, G.shelf, 3, 0.05, D_WATER);
    paint(ash, G.rockDk, 7, 0.28, D_BIOME);
    paint(ash, G.crust, 5, 0.16, D_BIOME2);
    paint(ash, G.lava, 4, 0.04, D_TRACK);
    paint(craton, G.granite, 8, 0.3, D_BIOME);
    paint(craton, G.rockDk, 6, 0.18, D_BIOME2);
    paint(craton, G.snow, 4, 0.1, D_WATER);
    for (const reg of REGIONS) {
      if (reg.kind === ISLE) paint(reg, r() < 0.5 ? G.jungleDk : G.sand, 2, 0.3, D_BIOME);
    }

    /* ---------------- the impassable landmarks ----------------

       Three of them, and they are impassable for real: `w.wall` with a solid
       height of 1e6 makes `groundAt` return a number no ball can ever climb,
       which also makes `place` refuse to drop anything inside one.

       A disc has to be built out of axis-aligned strips because that is the
       only shape the platform model has. Eight strips is round enough at this
       range and cheap enough to do twice. */
    /* THE FOUR CORNERS GO IN THE KEEP-OUT LIST FIRST, AND THEY ARE NOT A
       LANDMARK — they are the one place on the map that gets HARDER to reach as
       you grow. `canOccupy` clamps the ball's centre to the bounds inset by one
       radius, which is exactly right against a wall and wrong at a corner:
       there both axes clamp at once, so the nearest legal centre to the corner
       itself is R*sqrt(2) away and a triangle of map falls outside the ball. The
       triangle GROWS with R, which makes reachability non-monotonic — a coral
       reef sown at (410, 411) was edible at 24km and untouchable by the time you
       were the planet, which is the shape of the bug a player already reported
       once as "when you reach a certain size it's impossible to pick up all the
       smaller items around the edge of the map".

       Sizing it: everything the sea and sky passes sow is already at least 8 in
       from the rim, and for that inset the unreachable triangle reaches only
       hypot(8, R - sqrt(R^2 - (R-8)^2)) from the corner — 17 at this stage's
       ceiling of 78 units. 26 covers it up to a ball of 104, a third again
       above the ceiling, so re-tuning the mass cannot quietly reopen it.
       `npm run reach` is the guard, and it drives the real `resolve` rather
       than this arithmetic. */
    const avoid = [];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) avoid.push({ x: sx * B, z: sz * B, r: 26 });

    const solidDisc = (cx, cz, R, n = 8) => {
      for (let i = 0; i < n; i++) {
        const f = (i + 0.5) / n - 0.5;
        const zc = cz + f * 2 * R;
        const hw = R * Math.sqrt(Math.max(0.02, 1 - (f * 2) ** 2));
        w.wall(cx - hw, zc - R / n, cx + hw, zc + R / n, 1, null, 0, 1e6);
      }
      avoid.push({ x: cx, z: cz, r: R + 14 });
    };

    /* IGNIS MONS, a shield volcano standing on the Spine. Stacked wide cones
       rather than one tall one, because a shield volcano IS a stack of thin
       flows and because each ring's own top face is small enough never to read
       as a floor. */
    {
      const cx = 292, cz = 38, R = 30, top = spine.deck;
      solidDisc(cx, cz, R);
      const N = 7;
      for (let i = 0; i < N; i++) {
        const f = i / (N - 1);
        const rr = R * (1.0 - f * 0.72);
        const h = 5.4;
        t.cyl(rr, rr * 1.1, h, i % 2 ? G.basalt : G.rockDk,
          { x: cx, y: top + 0.3 + i * h * 0.62 + h / 2, z: cz }, 10);
      }
      const summit = top + 0.3 + (N - 1) * 5.4 * 0.62 + 5.4;
      t.cyl(R * 0.3, R * 0.16, 3.0, G.basalt, { x: cx, y: summit + 1.5, z: cz }, 10);
      t.cyl(R * 0.2, R * 0.2, 1.1, G.lava, { x: cx, y: summit + 2.6, z: cz }, 10);
      // lava tongues running off the flanks, each with real vertical extent
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2 + r();
        const d = R * (0.5 + r() * 0.5);
        t.box(R * 0.1, 2.2 + r() * 3.0, R * (0.4 + r() * 0.4), i % 3 ? G.lava : G.ember,
          { x: cx + Math.cos(a) * d, y: top + 1.4 + r() * 3.0, z: cz + Math.sin(a) * d, ry: -a });
      }
      // an ash plume, high enough that nothing will ever be inside it
      for (let i = 0; i < 6; i++) {
        const rr = 6 + i * 3.4;
        t.cyl(rr, rr * 0.8, 5.0, i % 2 ? G.storm : G.cloudGrey,
          { x: cx + (i - 2) * 3.2, y: summit + 8 + i * 5.6, z: cz + (i % 3 - 1) * 2.6 }, 9);
      }
    }

    /* THE BARRIER, an ice shelf on the Rimefield. A slab, so it is walls all
       round and a lid you can never stand on — the lid is 20 up, which is
       above anything that will ever be beside it. */
    {
      const x0 = -286, z0 = -330, x1 = -118, z1 = -268, top = rime.deck;
      w.wall(x0, z0, x1, z1, 1, null, 0, 1e6);
      avoid.push({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, r: 95 });
      t.box(x1 - x0, 20, z1 - z0, G.ice,
        { x: (x0 + x1) / 2, y: top + 10 - 0.4, z: (z0 + z1) / 2 });
      t.quad(x1 - x0 - 3, z1 - z0 - 3, G.snow, { x: (x0 + x1) / 2, y: top + 19.7, z: (z0 + z1) / 2 });
      // pressure waves along the seaward face, and bergs calving off it
      for (let i = 0; i < 9; i++) {
        const x = x0 + 10 + (i / 8) * (x1 - x0 - 20);
        t.box(14, 6 + r() * 8, 9, G.iceBlue, { x, y: top + 3 + r() * 4, z: z1 - 3, ry: (r() - 0.5) * 0.3 });
      }
      /* Bergs calving off it, out in the open water past the shore ramp.
         TALL, and both halves of that matter. Out in the water because a berg
         standing on the ice cap's own deck is a lid three units above the
         deck, which is exactly the "floor at chest height" `npm run decals`
         reports — four of its findings were these. Tall because the same lid
         over open sea is the same defect measured from sea level, so the top
         has to clear the whole band the test samples at both ball sizes. */
      for (let i = 0; i < 9; i++) {
        const x = x0 - 30 + r() * (x1 - x0 + 60);
        const h = 11 + r() * 9;
        t.box(7 + r() * 7, h, 6 + r() * 6, i % 3 ? G.ice : G.iceBlue,
          { x, y: h / 2 - 0.4, z: -186 + r() * 42, ry: r() * 3.1 });
      }
    }

    /* THE GATE: a sea arch across the equatorial strait, worn through a
       headland that is otherwise gone. Its two footings are solid and small;
       the span itself is terrain with no collision at all, sitting high enough
       overhead to roll under. */
    {
      const cz = 122, span = 96, top = 46;
      for (const s of [-1, 1]) {
        w.wall(s * span - 9, cz - 9, s * span + 9, cz + 9, 1, null, 0, 1e6);
        avoid.push({ x: s * span, z: cz, r: 22 });
        t.cyl(7, 13, top * 0.62, G.granite, { x: s * span, y: top * 0.31, z: cz }, 9);
        t.cyl(8, 8, 2.4, G.land, { x: s * span, y: top * 0.62 + 1.2, z: cz }, 9);
      }
      const N = 11;
      for (let i = 0; i < N; i++) {
        const f = i / (N - 1);
        const x = (f - 0.5) * 2 * span;
        const y = top * (0.62 + 0.38 * Math.sin(f * Math.PI));
        t.box(2 * span / N * 1.1, 5.4, 15, i % 2 ? G.rock : G.rockDk,
          { x, y, z: cz, rz: -Math.cos(f * Math.PI) * 0.5 });
      }
      for (let i = 0; i < 8; i++) {
        t.box(9, 2.6, 9, G.scree,
          { x: (r() - 0.5) * 2 * span, y: top * (0.75 + r() * 0.45), z: cz + (r() - 0.5) * 26 });
      }
    }

    /* ---------------- the biggest things in the world ----------------

       The top of the ladder is hand-placed, not scattered, and it is placed
       FIRST with a running keep-out list. `scatter` does no overlap test, so a
       66-wide ocean dropped on top of a canyon buries it, and a buried prop is
       one the greedy bot will chase for the rest of the clock without ever
       tripping the stall detector.

       Every one of these sits in OPEN WATER — that is where a continent, an
       ocean and an inland sea belong on a world map, and it also keeps them
       off the decks where all the smaller landforms live. `force` is passed
       because a continent is a land archetype standing in the sea, which is
       exactly the case the land/water test exists to prevent by accident.

       Distance from the spawn is the difficulty curve: the Home Coast is at
       (-270, 210) and the Craton is the opposite corner, so the run walks
       inland seas, then continents, then oceans, then the planet. */
    const big = (id, x, z, rot, sc, keepOut) => {
      w.placeId(id, x, z, rot, sc, null, true);
      avoid.push({ x, z, r: keepOut });
    };

    /* The largest thing in the stage, and the last thing eaten. `pickup` 55.1
       asks for a ball of 62.6; eating everything else gets you to about 77. Do
       not raise this scale without re-reading `too big to ever collect`. */
    big('wd_planet', 300, -276, 0.4, 1.0, 62);

    big('wd_ocean', -240, -136, 0.5, 1.0, 48);
    big('wd_ocean', 60, 70, -0.3, 1.0, 48);
    big('wd_ocean', 386, 300, 0.2, 1.0, 48);
    big('wd_ocean', -386, -348, -0.5, 1.0, 48);

    big('wd_continent', -24, 24, 0.1, 1.0, 37);
    big('wd_continent', 104, -110, 0.6, 1.0, 37);
    big('wd_continent', -390, -76, -0.35, 1.0, 37);
    big('wd_continent', -300, 392, 0.5, 1.0, 37);
    big('wd_continent', 388, 226, -0.7, 1.0, 37);
    big('wd_continent', 46, -302, 0.25, 1.0, 37);

    big('wd_inland_sea', -158, 302, 0.2, 1.0, 31);
    big('wd_inland_sea', -104, 44, 0.9, 1.0, 31);
    big('wd_inland_sea', 4, 178, -0.4, 1.0, 31);
    big('wd_inland_sea', -330, -160, 0.3, 1.0, 31);
    big('wd_inland_sea', 130, 90, -0.6, 1.0, 31);
    big('wd_inland_sea', 392, 26, 0.45, 1.0, 31);

    /* ---------------- scattered land ----------------

       Counts are per 100,000 square units of deck, so a landmass gets a
       landmass's share and an islet gets an islet's, without a hand-written
       table that goes stale the moment a coastline moves.

       BIGGEST BAND FIRST, EACH PROP CLAIMING THE GROUND IT LANDS ON, AND THAT
       IS THE WHOLE DIFFICULTY OF THIS SECTION.

       `scatter` does no overlap test at all — not even against props from its
       own call — so sowing the small things first drops every cordillera and
       desert belt straight on top of whatever is already standing there. The
       prop underneath is then inside the big one's collision disc: the ball
       cannot get within reach of it while it still scores as the best thing in
       the neighbourhood, so the greedy bot steers at it and ORBITS. It is
       moving the whole time, so the stall detector never fires and the target
       never gets blacklisted. Three balance runs in nine ended exactly that
       way — dead at 700-830km with six minutes left on the clock and two
       thousand edible props still standing, one of them circling a mountain
       range buried under a desert belt for the last six minutes.

       So: one prop at a time down to the 1.10 band, keep-out list growing as we
       go. Below 1.10 nothing is big enough to hide anything, and rule of thumb
       says 8-10% of a stage buried is normal, so the small bands go back to
       being sown in bulk. Splitting a call does not disturb the RNG:
       `scatter`'s per-placement draws are self-contained, so N calls of one are
       the same stream as one call of N. */
    let claimed = w.field.placements.length;   // the landmarks above claimed their own
    /**
     * Everything sown since the last call joins the keep-out list. `mul` is a
     * multiple of the prop's own collision radius: at 2.0 two things of the
     * same size end up roughly tangent, which is as close as two cordilleras
     * may get, while a later smaller band only has to clear the flank.
     */
    const claim = (mul) => {
      const ps = w.field.placements;
      for (; claimed < ps.length; claimed++) {
        const p = ps[claimed];
        avoid.push({ x: p.x, z: p.z, r: p.arch.radius * p.scale * mul });
      }
    };

    const on = (reg, lo, hi, per, scale, mul = 0) => {
      for (const rc of reg.rects) {
        const n = Math.round(((rc.x1 - rc.x0) * (rc.z1 - rc.z0) / 1e5) * per);
        if (n < 1) continue;
        const o = {
          tag: 'world', lo, hi, scale, avoid, exclude: reg.kind.ban,
          x0: rc.x0 + 3, z0: rc.z0 + 3, x1: rc.x1 - 3, z1: rc.z1 - 3,
        };
        if (!mul) { w.scatter({ ...o, count: n }); continue; }
        for (let i = 0; i < n; i++) { w.scatter({ ...o, count: 1 }); claim(mul); }
      }
    };

    /* Signature landforms, on narrow size windows, so the weighted pool cannot
       decide the ice cap would rather have four more mountain ranges. Without
       these the great desert turns up twice in the whole world and stops being
       a thing the stage has. */
    const only = (reg, lo, hi, count, scale, mul = 0) => {
      const rc = reg.rects[0];
      const o = {
        tag: 'world', lo, hi, scale, avoid, exclude: reg.kind.ban,
        x0: rc.x0 + 12, z0: rc.z0 + 12, x1: rc.x1 - 12, z1: rc.z1 - 12,
      };
      if (!mul) { w.scatter({ ...o, count }); return; }
      for (let i = 0; i < count; i++) { w.scatter({ ...o, count: 1 }); claim(mul); }
    };

    const MAINLAND = [home, riven, verdance, sunder, spine, rime, ash, craton];

    // the biggest landforms in the world, and the only ones that can bury a region
    only(sunder, 18.5, 19.5, 4, [0.8, 1.15], 2.0);   // the desert belt
    only(rime, 14.8, 16.0, 6, [0.85, 1.15], 2.0);    // the ice sheet over the cap
    only(spine, 12.0, 13.0, 8, [0.85, 1.2], 2.0);    // the cordillera the ranges add to
    only(craton, 12.0, 13.0, 5, [0.85, 1.2], 2.0);   // and the one the Craton is built on
    for (const reg of MAINLAND) on(reg, 9.50, 16.00, 5, [0.85, 1.3], 2.0);

    only(rime, 6.20, 6.90, 16, [0.8, 1.35], 1.8);    // the icefields under the sheet
    only(sunder, 5.0, 5.6, 14, [0.8, 1.4], 1.8);     // the dune seas it is named for
    for (const reg of MAINLAND) on(reg, 4.80, 7.00, 20, [0.8, 1.4], 1.8);

    only(verdance, 3.30, 3.60, 16, [0.8, 1.4], 1.5); // the rainforest belt
    only(spine, 2.10, 2.40, 14, [0.85, 1.4], 1.5);   // the ranges
    only(riven, 1.40, 1.55, 14, [0.8, 1.4], 1.5);    // the scarps between the canyons
    for (const reg of MAINLAND) on(reg, 1.10, 3.60, 58, [0.8, 1.5], 1.5);

    // and below here nothing can hide anything, so no more claims
    for (const reg of MAINLAND) on(reg, 0.30, 0.70, 150, [0.75, 1.7]);
    for (const reg of MAINLAND) on(reg, 0.055, 0.29, 300, [0.7, 1.8]);

    only(riven, 0.20, 0.24, 22, [0.8, 1.6]);       // the canyons it is named for
    only(ash, 0.16, 0.19, 10, [0.8, 1.5]);         // the crater lakes on young ground
    only(ash, 0.13, 0.15, 14, [0.8, 1.6]);         // and the volcanoes that left them
    only(home, 0.30, 0.36, 10, [0.8, 1.5]);        // the forests of the home coast
    only(home, 0.07, 0.08, 8, [0.8, 1.6]);         // and its waterfalls

    for (const reg of [shallows]) {
      on(reg, 1.10, 3.60, 110, [0.8, 1.4]);
      on(reg, 0.30, 0.70, 450, [0.75, 1.6]);
      on(reg, 0.055, 0.29, 1100, [0.7, 1.7]);
    }

    /* ---------------- the sea and the sky ----------------

       Both go through `scatter`, which is surface-aware as long as the POOL is
       — a pool with something amphibious in it picks the archetype before it
       hunts for a position, so the retry loop can reject dry ground for a
       storm. A pool of pure land props keeps the legacy draw order, which is
       why these passes exclude every land prop by NAME rather than relying on
       the rectangle they are sown over.

       Biggest first here too, and for the same reason: an archipelago chain has
       a collision radius of 16 and a peninsula 5.7, so either of them dropped
       on a reef puts it permanently out of the ball's reach until the big one
       is gone. `mul` claims the ground, exactly as on the land. */
    const sea = (lo, hi, count, s0, s1, mul = 0,
      x0 = -B + 8, z0 = -B + 8, x1 = B - 8, z1 = B - 8) => {
      const o = {
        tag: 'world', lo, hi, scale: [s0, s1], avoid,
        exclude: [...LAND, ...AIR], x0, z0, x1, z1,
      };
      if (!mul) { w.scatter({ ...o, count }); return; }
      for (let i = 0; i < count; i++) { w.scatter({ ...o, count: 1 }); claim(mul); }
    };
    const sky = (lo, hi, count, s0, s1, mul = 0) => {
      const o = {
        tag: 'world', lo, hi, scale: [s0, s1], avoid,
        exclude: [...LAND, ...WET],
        x0: -B + 12, z0: -B + 12, x1: B - 12, z1: B - 12,
      };
      if (!mul) { w.scatter({ ...o, count }); return; }
      for (let i = 0; i < count; i++) { w.scatter({ ...o, count: 1 }); claim(mul); }
    };

    sea(22.5, 24.5, 6, 0.9, 1.1, 2.0);             // archipelago chains
    sea(7.60, 8.60, 30, 0.8, 1.3, 1.8);            // peninsulas
    sea(3.90, 4.60, 60, 0.8, 1.4, 1.6);            // storms
    sea(0.90, 1.05, 140, 0.8, 1.5);                // islands
    sea(0.70, 0.85, 130, 0.8, 1.6);                // fjord coasts
    sea(0.06, 0.30, 320, 0.7, 1.8);                // coral reefs

    sky(1.70, 2.00, 90, 0.8, 1.5, 1.5);            // cloud fronts
    sky(0.35, 0.50, 220, 0.7, 1.8);                // thunderheads

    /* ---------------- the home bowl ----------------

       Where the whole thing is decided. A 400km katamari can swallow anything
       up to 352km, which at this scale is a city, a mountain, a waterfall, a
       canyon, a glacier, a forest or a thunderhead — so the bowl round the
       spawn is packed with exactly those and nothing that could wall it in.
       Without this pass the opening minute is a very long walk across an empty
       coast.

       These pass `avoid` where they used to pass nothing, which matters here
       more than anywhere: the coast already carries a mountain range or two out
       of the bands above, and a starting katamari that spends its first minute
       orbiting a scarp buried under one of them has lost the run. */
    const HX = -352, HZ = 148, HX1 = -196, HZ1 = 292;
    w.scatter({
      tag: 'world', lo: 1.10, hi: 3.60, count: 34, scale: [0.8, 1.4], avoid, exclude: BAN.isle,
      x0: HX + 10, z0: HZ + 10, x1: HX1 - 10, z1: HZ1 - 10,
    });
    w.scatter({
      tag: 'world', lo: 0.30, hi: 0.70, count: 110, scale: [0.75, 1.6], avoid, exclude: BAN.isle,
      x0: HX + 6, z0: HZ + 6, x1: HX1 - 6, z1: HZ1 - 6,
    });
    w.scatter({
      tag: 'world', lo: 0.055, hi: 0.29, count: 260, scale: [0.7, 1.7], avoid, exclude: BAN.isle,
      x0: HX + 4, z0: HZ + 4, x1: HX1 - 4, z1: HZ1 - 4,
    });
    // and the sky directly over the coast, so there is something to grow into
    w.scatter({
      tag: 'world', lo: 0.35, hi: 2.00, count: 130, scale: [0.7, 1.6], avoid,
      exclude: [...LAND, ...WET],
      x0: HX - 40, z0: HZ - 40, x1: HX1 + 40, z1: HZ1 + 40,
    });
    sea(3.90, 4.60, 14, 0.8, 1.3, 1.6, HX - 90, HZ - 90, HX1 + 90, HZ1 + 90);
    sea(0.70, 1.05, 40, 0.8, 1.4, 0, HX - 90, HZ - 90, HX1 + 90, HZ1 + 90);
    sea(0.06, 0.30, 120, 0.7, 1.7, 0, HX - 90, HZ - 90, HX1 + 90, HZ1 + 90);
  },
};
