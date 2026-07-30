/* ============================================================
   GeomBuilder — every object in this game is assembled from
   primitives and merged into a single vertex-coloured
   BufferGeometry so each archetype costs one draw call.

   Convention for props: origin sits at the BASE CENTRE
   (min.y == 0, centred in X/Z). +Y is "up / outward", which
   makes both ground placement and sticking-to-the-katamari
   trivial: put the origin just under the ball's surface and
   point +Y along the surface normal.
   ============================================================ */

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();

// Cache primitive geometries by shape signature — they get cloned + transformed.
const protoCache = new Map();
function proto(key, make) {
  let g = protoCache.get(key);
  if (!g) { g = make(); g.deleteAttribute('uv'); g.clearGroups(); protoCache.set(key, g); }
  return g;
}

function applyOpts(geo, o) {
  const sx = o.sx ?? o.s ?? 1;
  const sy = o.sy ?? o.s ?? 1;
  const sz = o.sz ?? o.s ?? 1;
  _e.set(o.rx || 0, o.ry || 0, o.rz || 0, 'YXZ');
  _q.setFromEuler(_e);
  _v.set(o.x || 0, o.y || 0, o.z || 0);
  _s.set(sx, sy, sz);
  _m.compose(_v, _q, _s);
  geo.applyMatrix4(_m);
  return geo;
}

function paint(geo, color) {
  const col = new THREE.Color(color);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = col.r; arr[i * 3 + 1] = col.g; arr[i * 3 + 2] = col.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

export class GeomBuilder {
  constructor() { this.parts = []; }

  /** Push an already-made geometry (it will be consumed). */
  push(geo, color, opts = {}) {
    geo.deleteAttribute('uv');
    geo.clearGroups();
    applyOpts(geo, opts);
    paint(geo, color);
    this.parts.push(geo);
    return this;
  }

  _add(key, make, color, opts) {
    return this.push(proto(key, make).clone(), color, opts);
  }

  /* ---------------- primitives ---------------- */

  /** Axis-aligned box, positioned by its CENTRE. */
  box(w, h, d, color, opts = {}) {
    return this._add('box', () => new THREE.BoxGeometry(1, 1, 1), color,
      { ...opts, sx: w * (opts.s ?? 1), sy: h * (opts.s ?? 1), sz: d * (opts.s ?? 1), s: undefined });
  }

  /** Box whose BOTTOM sits at y (handy for stacking). */
  boxOn(w, h, d, color, opts = {}) {
    return this.box(w, h, d, color, { ...opts, y: (opts.y || 0) + h / 2 });
  }

  /** Rounded-ish slab: a box with bevelled top edge, cheap. */
  slab(w, h, d, color, opts = {}) {
    this.box(w, h * 0.72, d, color, { ...opts, y: (opts.y || 0) - h * 0.14 });
    this.push(new THREE.CylinderGeometry(1, 1, 1, 8), color, {
      ...opts, sx: w * 0.5, sz: d * 0.5, sy: h * 0.3,
      y: (opts.y || 0) + h * 0.3, s: undefined,
    });
    return this;
  }

  sphere(r, color, opts = {}, wSeg = 12, hSeg = 8) {
    return this._add(`sph${wSeg}_${hSeg}`, () => new THREE.SphereGeometry(1, wSeg, hSeg), color,
      { ...opts, s: r * (opts.s ?? 1) });
  }

  /** Ellipsoid — sphere with independent radii. */
  ellip(rx, ry, rz, color, opts = {}, wSeg = 12, hSeg = 8) {
    return this._add(`sph${wSeg}_${hSeg}`, () => new THREE.SphereGeometry(1, wSeg, hSeg), color,
      { ...opts, sx: rx, sy: ry, sz: rz, s: undefined });
  }

  /** Hemisphere (dome), flat side down, base at the given y. */
  dome(r, color, opts = {}, seg = 12) {
    return this._add(`dome${seg}`, () => new THREE.SphereGeometry(1, seg, 6, 0, Math.PI * 2, 0, Math.PI / 2),
      color, { ...opts, s: r * (opts.s ?? 1) });
  }

  /**
   * Cylinder positioned by CENTRE, axis along +Y.
   * Uniform radii reuse a cached unit cylinder; tapered ones are built directly
   * because non-uniform scaling cannot produce a taper.
   */
  cyl(rTop, rBot, h, color, opts = {}, seg = 12) {
    if (rTop === rBot) {
      return this._add(`cyl${seg}`, () => new THREE.CylinderGeometry(1, 1, 1, seg), color,
        { ...opts, sx: rTop, sz: rTop, sy: h, s: undefined });
    }
    return this.push(new THREE.CylinderGeometry(rTop, rBot, h, seg), color, opts);
  }

  /** Cylinder with its BOTTOM at y. */
  cylOn(r, h, color, opts = {}, seg = 12) {
    return this.cyl(r, r, h, color, { ...opts, y: (opts.y || 0) + h / 2 }, seg);
  }

  /** Truncated cone with its BOTTOM at y. */
  taperOn(rTop, rBot, h, color, opts = {}, seg = 12) {
    return this.cyl(rTop, rBot, h, color, { ...opts, y: (opts.y || 0) + h / 2 }, seg);
  }

  cone(r, h, color, opts = {}, seg = 12) {
    return this._add(`cone${seg}`, () => new THREE.ConeGeometry(1, 1, seg), color,
      { ...opts, sx: r, sz: r, sy: h, s: undefined });
  }

  /** Torus lying in the XY plane (rotate with rx: PI/2 to lay it flat). */
  torus(r, tube, color, opts = {}, radSeg = 8, tubSeg = 16) {
    return this.push(new THREE.TorusGeometry(r, tube, radSeg, tubSeg), color, opts);
  }

  /** Triangular prism (roofs, wedges). Length along Z, apex on +Y. */
  wedge(w, h, d, color, opts = {}) {
    const g = new THREE.BufferGeometry();
    const hw = w / 2, hd = d / 2;
    // 6 vertices: bottom quad + top ridge line
    const v = [
      -hw, 0, -hd, hw, 0, -hd, hw, 0, hd, -hw, 0, hd, // 0..3 bottom
      0, h, -hd, 0, h, hd,                              // 4,5 ridge
    ];
    const idx = [
      0, 2, 1, 0, 3, 2,       // bottom
      0, 1, 4,                // back tri
      3, 5, 2,                // front tri  (wound outward)
      1, 2, 5, 1, 5, 4,       // right slope
      0, 4, 5, 0, 5, 3,       // left slope
    ];
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return this.push(g, color, opts);
  }

  /** Regular pyramid with a square base. */
  pyramid(w, h, color, opts = {}) {
    return this.push(new THREE.ConeGeometry(w * 0.7071, h, 4), color, { ...opts, ry: (opts.ry || 0) + Math.PI / 4 });
  }

  /** Flat quad lying in the XZ plane — decals, papers, puddles. */
  quad(w, d, color, opts = {}) {
    const g = new THREE.PlaneGeometry(w, d);
    g.rotateX(-Math.PI / 2);
    return this.push(g, color, opts);
  }

  /** Capsule — limbs, bottles, fingers. */
  capsule(r, len, color, opts = {}, seg = 8) {
    return this.push(new THREE.CapsuleGeometry(r, len, 3, seg), color, opts);
  }

  /** Lathe from a 2D profile [[x,y], ...] — vases, lamps, bottles. */
  lathe(profile, color, opts = {}, seg = 14) {
    const pts = profile.map(([x, y]) => new THREE.Vector2(Math.max(1e-5, x), y));
    return this.push(new THREE.LatheGeometry(pts, seg), color, opts);
  }

  /** Thin plate standing upright in XY (signs, screens). */
  panel(w, h, t, color, opts = {}) {
    return this.box(w, h, t, color, opts);
  }

  /* ---------------- composite helpers ---------------- */

  /** Four legs under a rectangular top. */
  legs(w, d, h, r, color, opts = {}) {
    const ox = opts.x || 0, oy = opts.y || 0, oz = opts.z || 0;
    const px = w / 2 - r * 1.6, pz = d / 2 - r * 1.6;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      this.cylOn(r, h, color, { x: ox + sx * px, y: oy, z: oz + sz * pz }, 6);
    }
    return this;
  }

  /** A simple humanoid: head, torso, arms, legs. Height `h` total. */
  person(h, skin, shirtCol, pantsCol, hairCol, opts = {}) {
    const ox = opts.x || 0, oy = opts.y || 0, oz = opts.z || 0;
    const u = h / 7.2;                       // rough head-count unit
    const legH = u * 2.9, torsoH = u * 2.5, headR = u * 0.62;
    const rot = opts.ry || 0;
    const put = (o) => ({ ...o, x: ox + (o.x || 0), y: oy + (o.y || 0), z: oz + (o.z || 0), ry: rot });
    // legs
    for (const s of [-1, 1]) this.capsule(u * 0.32, legH * 0.72, pantsCol, put({ x: s * u * 0.42, y: legH * 0.55 }), 6);
    // shoes
    for (const s of [-1, 1]) this.box(u * 0.44, u * 0.26, u * 0.86, 0x3a3238, put({ x: s * u * 0.42, y: u * 0.13, z: u * 0.14 }));
    // torso
    this.box(u * 1.5, torsoH, u * 0.78, shirtCol, put({ y: legH + torsoH / 2 }));
    // arms
    for (const s of [-1, 1]) this.capsule(u * 0.26, torsoH * 0.68, shirtCol, put({ x: s * u * 0.95, y: legH + torsoH * 0.58, rz: s * 0.12 }), 6);
    // hands
    for (const s of [-1, 1]) this.sphere(u * 0.24, skin, put({ x: s * u * 1.02, y: legH + torsoH * 0.06 }), 5, 4);
    // neck + head
    this.cylOn(u * 0.24, u * 0.3, skin, put({ y: legH + torsoH - u * 0.05 }), 6);
    this.sphere(headR, skin, put({ y: legH + torsoH + headR * 0.92 }), 9, 6);
    // hair cap
    this.dome(headR * 1.06, hairCol, put({ y: legH + torsoH + headR * 0.94 }), 9);
    // eyes
    for (const s of [-1, 1]) this.sphere(headR * 0.13, 0x241f28, put({ x: s * headR * 0.34, y: legH + torsoH + headR * 0.92, z: headR * 0.9 }), 4, 3);
    return this;
  }

  /** Quadruped body used for cats/dogs/etc. Length `L` nose-to-tail. */
  critter(L, bodyCol, bellyCol, opts = {}) {
    const ox = opts.x || 0, oy = opts.y || 0, oz = opts.z || 0;
    const rot = opts.ry || 0;
    const put = (o) => ({ ...o, x: ox + (o.x || 0), y: oy + (o.y || 0), z: oz + (o.z || 0), ry: rot });
    const bodyR = L * 0.19, legH = L * 0.26, headR = L * 0.17;
    this.ellip(bodyR * 1.0, bodyR * 0.92, L * 0.34, bodyCol, put({ y: legH + bodyR * 0.85 }), 9, 6);
    this.ellip(bodyR * 0.72, bodyR * 0.5, L * 0.26, bellyCol, put({ y: legH + bodyR * 0.42 }), 7, 5);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      this.cylOn(L * 0.045, legH, bodyCol, put({ x: sx * bodyR * 0.62, z: sz * L * 0.21 }), 6);
    }
    this.sphere(headR, bodyCol, put({ y: legH + bodyR * 1.15, z: L * 0.36 }), 9, 6);
    this.sphere(headR * 0.42, bellyCol, put({ y: legH + bodyR * 0.98, z: L * 0.36 + headR * 0.82 }), 6, 4);
    this.sphere(headR * 0.16, 0x1e1a22, put({ y: legH + bodyR * 1.02, z: L * 0.36 + headR * 1.14 }), 4, 3);
    for (const s of [-1, 1]) {
      this.cone(headR * 0.38, headR * 0.6, bodyCol, put({ x: s * headR * 0.55, y: legH + bodyR * 1.15 + headR * 0.78, z: L * 0.33 }), 5);
      this.sphere(headR * 0.13, 0x241f28, put({ x: s * headR * 0.42, y: legH + bodyR * 1.25, z: L * 0.36 + headR * 0.74 }), 4, 3);
    }
    this.capsule(L * 0.035, L * 0.24, bodyCol, put({ y: legH + bodyR * 1.35, z: -L * 0.32, rx: 0.9 }), 6);
    return this;
  }

  /** Leafy tree canopy from overlapping blobs. */
  canopy(r, col, opts, rnd, blobs = 5) {
    const ox = opts.x || 0, oy = opts.y || 0, oz = opts.z || 0;
    // Kept deliberately low-poly: a busy stage can hold a thousand trees,
    // and at 12x9 segments the canopies alone were most of the frame.
    this.sphere(r, col, { x: ox, y: oy, z: oz }, 9, 6);
    for (let i = 0; i < blobs; i++) {
      const a = (i / blobs) * Math.PI * 2 + rnd() * 0.7;
      const rr = r * (0.5 + rnd() * 0.26);
      const dd = r * (0.62 + rnd() * 0.28);
      this.sphere(rr, col, {
        x: ox + Math.cos(a) * dd,
        y: oy + (rnd() - 0.35) * r * 0.66,
        z: oz + Math.sin(a) * dd,
      }, 7, 5);
    }
    return this;
  }

  /**
   * Stretch everything built so far horizontally, leaving heights alone.
   * Used by `stage.spread` to spill a city over more ground without changing
   * how tall anything is.
   */
  scaleXZ(s) {
    if (s === 1) return this;
    for (const p of this.parts) p.scale(s, 1, s);
    return this;
  }

  /* ---------------- finish ---------------- */

  /**
   * Merge everything into one geometry.
   * @param {object} o
   *   groundAlign  – translate so min.y == 0 (default true)
   *   centerXZ     – translate so the X/Z bounding box is centred (default true)
   *   keepParts    – also record each primitive's axis-aligned box, in the
   *                  same final local space as the merged geometry, on
   *                  `this.partBoxes`. This is what lets collision know a
   *                  table is a top and four legs rather than one lump; see
   *                  `collisionParts()` in world/props/index.js.
   */
  build({ groundAlign = true, centerXZ = true, keepParts = false, separate = false } = {}) {
    this.partBoxes = null;
    if (this.parts.length === 0) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0], 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute([1, 0, 1], 3));
      return g;
    }
    // Normalise: every part must be non-indexed OR all indexed. Simplest: de-index all.
    const parts = this.parts.map((p) => (p.index ? p.toNonIndexed() : p));
    for (const p of parts) {
      if (!p.attributes.normal) p.computeVertexNormals();
      p.deleteAttribute('uv');
      p.deleteAttribute('uv1');
      p.clearGroups();
    }
    /* SEPARATE COPLANAR FACES, once, for every prop in the game.
     *
     * Two faces of different colours in the same plane z-fight across their
     * whole overlap: the depth test cannot choose, so the winner flickers per
     * pixel per frame as the camera moves. It reads as shimmering, and it has
     * been reported three times — the house roofs, the city's road markings, and
     * the world stage's village roofs. Measured across the catalogue, 74 of 277
     * archetypes had at least one such pair, so this is an idiom problem, not
     * three bugs. The commonest form:
     *
     *   b.boxOn(w, 2.0, d, WALL, { y: 1.7 })   // top face lands at 3.7
     *   b.wedge(w, 1.3, d, ROOF, { y: 3.7 })   // base face lands at 3.7 too
     *
     * Fixing 74 props by hand would fix 74 props. Nudging every primitive
     * OUTWARD ALONG ITS OWN NORMALS, by an amount that grows with the order it
     * was added, fixes the class — and keeps fixing it for props nobody has
     * written yet. A lid pushes up, the underside above it pushes down, so the
     * pair ends up separated with the lid tucked inside the roof rather than
     * fighting it. Two boxes sharing a wall plane interpenetrate by a hair,
     * which is equally invisible and equally decided.
     *
     * The step is a few parts in a hundred thousand of the prop's own size and
     * the index is capped, so the largest displacement is well under a
     * millimetre on a house-sized object. Silhouettes, `dims`, `pickup` and the
     * collision boxes all move by that same negligible amount.
     *
     * Opt-in, and only the prop catalogue opts in. Terrain must NOT: a stage
     * pushes thousands of primitives, its span is the whole map, and its ground
     * layers are already placed at deliberate explicit heights with a test
     * (`npm run decals`) guarding them. Biasing those by draw order would move
     * road markings by metres. */
    this.rawSize = null;
    if (separate) {
      const bb = new THREE.Box3();
      const tmp = new THREE.Box3();
      for (const p of parts) { p.computeBoundingBox(); tmp.copy(p.boundingBox); bb.union(tmp); }
      /* The size BEFORE the nudge, for the game to measure itself against.
       *
       * The bias is a rendering fix and must not move a single gameplay number.
       * It does inflate every prop by a hair — outward along its own normals —
       * and `pickup` is the cube root of the bounding box, so measuring the
       * biased geometry made everything very slightly harder to swallow. Tiny,
       * but systematic in one direction, and it dropped the house from 8 clears
       * in 9 to 5: that stage has the least margin in the game and it felt it.
       * So `buildCatalog` measures this instead. */
      this.rawSize = {
        w: bb.max.x - bb.min.x, h: bb.max.y - bb.min.y, d: bb.max.z - bb.min.z,
      };
      const span = Math.max(bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z);
      /* Sizing the step. Two coplanar faces separate by `(k2 - k1)` steps when
         they face the SAME way (a lid under a slab) and by `(k1 + k2 + 2)` when
         they face opposite ways (a lid under an underside), so the worst case is
         adjacent same-facing primitives at ONE step — that single step is what
         has to be big enough. 2.5e-4 of the prop's own size is ~2000x above
         float32 noise and comfortably clear of depth-buffer resolution at the
         distances this camera works at, while being 0.6mm on a 2.4m house.
         The index cap keeps the total bounded at 0.4% of the prop for the
         hundred-primitive landmarks. */
      const step = Math.max(1e-7, span * 2.5e-4);
      for (let k = 0; k < parts.length; k++) {
        const push = Math.min(k + 1, 16) * step;
        const pos = parts[k].attributes.position;
        const nor = parts[k].attributes.normal;
        if (!nor) continue;
        for (let i = 0; i < pos.count; i++) {
          pos.setXYZ(i,
            pos.getX(i) + nor.getX(i) * push,
            pos.getY(i) + nor.getY(i) * push,
            pos.getZ(i) + nor.getZ(i) * push);
        }
        pos.needsUpdate = true;
      }
    }

    // Grab each primitive's box BEFORE merging — afterwards they are one
    // undifferentiated vertex soup and the gaps are unrecoverable.
    const boxes = keepParts
      ? parts.map((p) => { p.computeBoundingBox(); return p.boundingBox.clone(); })
      : null;

    const merged = parts.length === 1 ? parts[0] : mergeGeometries(parts, false);
    this.parts.length = 0;

    merged.computeBoundingBox();
    const bb = merged.boundingBox;
    const dx = centerXZ ? -(bb.min.x + bb.max.x) / 2 : 0;
    const dy = groundAlign ? -bb.min.y : 0;
    const dz = centerXZ ? -(bb.min.z + bb.max.z) / 2 : 0;
    if (dx || dy || dz) merged.translate(dx, dy, dz);
    if (boxes && (dx || dy || dz)) {
      const off = new THREE.Vector3(dx, dy, dz);
      for (const b of boxes) b.translate(off);
    }
    this.partBoxes = boxes;

    merged.computeBoundingBox();
    merged.computeBoundingSphere();
    return merged;
  }
}

export function builder() { return new GeomBuilder(); }
