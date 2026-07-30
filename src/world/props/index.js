/* ============================================================
   Prop registry.

   A "prop" is an archetype (Thumbtack, Bicycle, Office Tower).
   Each declares real-world dimensions implicitly through the
   geometry it builds, and the game derives everything else:

     boxVol  = w * h * d of the bounding box
     volume  = boxVol * fill          -> how much the katamari grows
     pickup  = cbrt(boxVol) * sizeMul -> the size the game compares
                                         against the katamari diameter

   Using the geometric mean of the three dimensions for `pickup`
   reproduces a real behaviour of the original: long slender things
   (pencils, planks, ladders) can be collected well before their
   longest dimension would suggest, and they stick out awkwardly.
   ============================================================ */

import * as THREE from 'three';
import { makeRng, cbrt } from '../../util/math.js';
import { GeomBuilder } from '../../render/geom.js';

/** @type {Array<object>} */
export const ARCHETYPES = [];
const BY_ID = new Map();

export function defineProp(def) {
  if (BY_ID.has(def.id)) throw new Error(`Duplicate prop id: ${def.id}`);
  const p = {
    variants: 1,
    fill: 0.42,
    sizeMul: 1,
    cat: 'misc',
    tags: [],
    weight: 1,
    // `solid` props are obstacles you bump into until you outgrow them;
    // `scenery` props can never be collected at all (walls, ground detail).
    scenery: false,
    /**
     * Where this thing belongs: 'land' (default), 'water' or 'air'. `World.place`
     * refuses to put a boat in a field or an office block in a harbour, and lifts
     * air props to `flyHeight` above the ground. Before this the map was one
     * undifferentiated sheet and anything could end up anywhere.
     */
    surface: 'land',
    flyHeight: 0,   // metres above the ground, for surface: 'air'
    spin: 0,        // idle animation amount (windmills, fans)
    /**
     * Display units for this prop's size, matching the stage it belongs to.
     * 'metric' | 'atomic' (nm) | 'micron' (um) | 'geo' (km) — see util/math.
     * Only the collection log needs it, but it needs it badly: that list runs
     * from a proton to a continent and everything in it is a bare number.
     */
    unit: 'metric',
    ...def,
  };
  ARCHETYPES.push(p);
  BY_ID.set(p.id, p);
  return p;
}

export function getProp(id) { return BY_ID.get(id); }

/**
 * Collision profiles are sampled into this many horizontal slices.
 * A single bounding radius per prop is badly wrong for anything with an
 * overhang — a street lamp's arm reaches 1.1m sideways at 4.3m up, and a
 * small katamari would otherwise slam into thin air and wedge itself.
 * With a profile it just rolls underneath, which is also what the
 * original does.
 */
export const NSLICE = 8;

/**
 * Most collision parts a prop may keep.
 *
 * A radial profile — one reach per height slice — cannot express a HOLE. A
 * table's legs sit at the corners, so at leg height the profile reads as a
 * solid disc the width of the whole table, and a katamari small enough to
 * roll underneath is stopped by an invisible wall 60cm out from the middle.
 * User reported exactly that on 2026-07-29.
 *
 * So props also carry a short list of axis-aligned boxes, one per primitive
 * the builder stacked, and the obstacle test uses those instead. A table is
 * a top and four legs; the space between the legs is genuinely empty.
 *
 * The cap exists because a tower block is 200 window boxes and the
 * narrowphase runs per prop per frame. 14 is comfortably more than the most
 * complicated thing that actually has a usable gap in it (a swing set).
 */
export const MAXPARTS = 14;

const _boxVol = (b) => Math.max(0, b.max.x - b.min.x) * Math.max(0, b.max.y - b.min.y) * Math.max(0, b.max.z - b.min.z);

/** Volume of the box that would enclose both. */
function unionVol(a, b) {
  return Math.max(0, Math.max(a.max.x, b.max.x) - Math.min(a.min.x, b.min.x))
    * Math.max(0, Math.max(a.max.y, b.max.y) - Math.min(a.min.y, b.min.y))
    * Math.max(0, Math.max(a.max.z, b.max.z) - Math.min(a.min.z, b.min.z));
}

function absorb(a, b) {
  a.min.x = Math.min(a.min.x, b.min.x); a.min.y = Math.min(a.min.y, b.min.y); a.min.z = Math.min(a.min.z, b.min.z);
  a.max.x = Math.max(a.max.x, b.max.x); a.max.y = Math.max(a.max.y, b.max.y); a.max.z = Math.max(a.max.z, b.max.z);
}

/** True if `inner` lies within `outer` grown by `eps` on every axis. */
function contains(outer, inner, eps) {
  return inner.min.x >= outer.min.x - eps && inner.max.x <= outer.max.x + eps
    && inner.min.y >= outer.min.y - eps && inner.max.y <= outer.max.y + eps
    && inner.min.z >= outer.min.z - eps && inner.max.z <= outer.max.z + eps;
}

/**
 * Reduce a prop's primitive boxes to at most MAXPARTS collision volumes,
 * flattened to [minX,minY,minZ,maxX,maxY,maxZ, ...].
 *
 * Two rules, in this order:
 *  1. Biggest first, and drop anything already inside a box we kept —
 *     windows set into a wall, handles on a door, trim on a roof.
 *  2. Whatever is left over gets absorbed into whichever kept box grows
 *     least. Never dropped: a collision volume that MISSES real geometry
 *     lets the katamari roll through a wall, which is far worse than a
 *     little phantom volume. Over-approximate, never under.
 */
function collisionParts(boxes, scaleHint) {
  if (!boxes || !boxes.length) return new Float32Array(0);
  const eps = Math.max(1e-5, scaleHint * 0.02);
  const sorted = boxes.filter((b) => isFinite(_boxVol(b))).sort((a, b) => _boxVol(b) - _boxVol(a));
  const kept = [];
  const leftovers = [];
  for (const b of sorted) {
    if (kept.some((k) => contains(k, b, eps))) continue;
    if (kept.length < MAXPARTS) kept.push(b.clone());
    else leftovers.push(b);
  }
  for (const b of leftovers) {
    let bestI = 0, bestGrow = Infinity;
    for (let i = 0; i < kept.length; i++) {
      const grow = unionVol(kept[i], b) - _boxVol(kept[i]);
      if (grow < bestGrow) { bestGrow = grow; bestI = i; }
    }
    absorb(kept[bestI], b);
  }
  const out = new Float32Array(kept.length * 6);
  for (let i = 0; i < kept.length; i++) {
    const b = kept[i], o = i * 6;
    out[o] = b.min.x; out[o + 1] = b.min.y; out[o + 2] = b.min.z;
    out[o + 3] = b.max.x; out[o + 4] = b.max.y; out[o + 5] = b.max.z;
  }
  return out;
}

let built = false;

/** Build geometry + derived metrics for every registered archetype. */
export function buildCatalog() {
  if (built) return ARCHETYPES;
  built = true;

  const box = new THREE.Box3();
  const tmp = new THREE.Box3();

  for (const p of ARCHETYPES) {
    p.geos = [];
    p.parts = [];       // per variant: flat [minX,minY,minZ,maxX,maxY,maxZ,...]
    box.makeEmpty();

    const rawBoxes = [];
    for (let v = 0; v < p.variants; v++) {
      const rnd = makeRng(hashString(p.id) + v * 7919);
      const b = new GeomBuilder();
      p.build(b, rnd, v);
      /* `separate` breaks ties between coplanar faces of different primitives —
         the shimmering-roof class. Props only; terrain places its ground layers
         at deliberate heights and has its own guard (`npm run decals`). */
      const g = b.build({ groundAlign: true, centerXZ: true, keepParts: true, separate: true });
      p.geos.push(g);
      rawBoxes.push(b.partBoxes || []);
      /* Measure the geometry as authored, not as nudged. `separate` inflates
         every primitive by a hair to stop coplanar faces z-fighting; letting that
         leak into `dims` would leak it into `pickup` and therefore into the
         growth ladder. See the note on `rawSize` in geom.js. */
      if (b.rawSize) {
        tmp.set(new THREE.Vector3(0, 0, 0),
          new THREE.Vector3(b.rawSize.w, b.rawSize.h, b.rawSize.d));
      } else {
        tmp.copy(g.boundingBox);
      }
      box.union(tmp);
    }

    const w = Math.max(1e-4, box.max.x - box.min.x);
    const h = Math.max(1e-4, box.max.y - box.min.y);
    const d = Math.max(1e-4, box.max.z - box.min.z);

    // Horizontal reach per height slice, taken over every variant.
    // Sampled per TRIANGLE, not per vertex: a cylinder only has vertices at
    // its two end caps, so vertex sampling would leave the whole middle of a
    // lamp post reading as zero radius and the katamari would sail through it.
    const prof = new Float32Array(NSLICE);
    for (const g of p.geos) {
      const pos = g.attributes.position;
      for (let t = 0; t + 2 < pos.count; t += 3) {
        let yMin = Infinity, yMax = -Infinity, rMax = 0;
        for (let k = 0; k < 3; k++) {
          const y = pos.getY(t + k);
          if (y < yMin) yMin = y;
          if (y > yMax) yMax = y;
          const r = Math.hypot(pos.getX(t + k), pos.getZ(t + k));
          if (r > rMax) rMax = r;
        }
        let s0 = Math.floor((yMin / h) * NSLICE);
        let s1 = Math.floor((yMax / h) * NSLICE);
        if (s0 < 0) s0 = 0;
        if (s1 > NSLICE - 1) s1 = NSLICE - 1;
        for (let s = s0; s <= s1; s++) if (rMax > prof[s]) prof[s] = rMax;
      }
    }
    p.profile = prof;
    p.sliceH = h / NSLICE;

    // The profile stays: it is the cheap radial reject the broadphase and the
    // pickup test both run on. The parts are what the OBSTACLE test uses, so
    // that a table's gaps are gaps. Simplified per variant, since variants
    // genuinely differ in shape.
    for (const boxes of rawBoxes) p.parts.push(collisionParts(boxes, Math.max(w, h, d)));

    p.dims = { w, h, d };
    p.height = h;
    p.radius = Math.max(w, d) * 0.5;          // horizontal collision radius
    p.boxVol = w * h * d;
    p.volume = p.boxVol * p.fill;
    p.pickup = cbrt(p.boxVol) * p.sizeMul;    // metres
    // Where along +Y the object's mass roughly sits — used when embedding
    // it into the katamari so it looks planted rather than floating.
    p.embed = Math.min(h * 0.4, p.radius * 0.9);
  }

  ARCHETYPES.sort((a, b) => a.pickup - b.pickup);
  return ARCHETYPES;
}

export function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** All archetypes carrying a tag, cheapest lookup for stage spawning. */
export function propsWithTag(tag) {
  return ARCHETYPES.filter((p) => p.tags.includes(tag) && !p.scenery);
}

/** Archetypes whose pickup size falls inside [lo, hi]. */
export function propsInRange(tag, lo, hi) {
  return ARCHETYPES.filter((p) => p.tags.includes(tag) && !p.scenery && p.pickup >= lo && p.pickup <= hi);
}
