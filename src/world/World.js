/* ============================================================
   The stage: terrain, walkable platforms, obstacles, and the
   collision/collection resolution for the katamari.

   Height model
   ------------
   The floor is a set of axis-aligned rectangles ("platforms"),
   optionally sloped along one axis. The katamari stands on the
   highest platform it can currently reach; a platform whose top
   is more than about one radius above it acts as a wall instead.
   That single rule gives the original's "once you're big enough
   you can climb onto the table" progression for free.
   ============================================================ */

import * as THREE from 'three';
import { GeomBuilder } from '../render/geom.js';
import { PropField } from './PropField.js';
import { TUNING } from './Katamari.js';
import { clamp, makeRng } from '../util/math.js';
import { ARCHETYPES, NSLICE } from './props/index.js';

const RESTITUTION = 0.22;

export class World {
  constructor(material) {
    this.material = material;
    this.root = new THREE.Group();
    this.platforms = [];
    this.waters = [];
    this.terrainMesh = null;
    this.field = null;
    this.bounds = { minX: -50, maxX: 50, minZ: -50, maxZ: 50 };
    this.events = [];
    this.jiggles = [];
    this.time = 0;
  }

  /* ------------------------------------------------------------
     Construction API used by stage definitions
     ------------------------------------------------------------ */

  /** Flat walkable rectangle. */
  plat(x0, z0, x1, z1, top = 0) {
    this.platforms.push({ x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1), top, topTo: top, axis: null });
    return this;
  }

  /** Sloped rectangle: `top` at the low edge, `topTo` at the far edge along `axis`. */
  ramp(x0, z0, x1, z1, top, topTo, axis = 'x') {
    this.platforms.push({ x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1), top, topTo, axis });
    return this;
  }

  /**
   * A wall. It blocks until the katamari is big enough to climb it, exactly
   * like any other ledge — a 90cm garden wall should stop a 20cm ball and
   * mean nothing to a 2m one. Pass `solidH` to make something genuinely
   * impassable (stage boundaries).
   */
  wall(x0, z0, x1, z1, vh = 3, color = null, base = 0, solidH = null) {
    this.plat(x0, z0, x1, z1, base + (solidH == null ? vh : solidH));
    if (color != null) {
      this.terrain.box(Math.abs(x1 - x0), vh, Math.abs(z1 - z0), color,
        { x: (x0 + x1) / 2, y: base + vh / 2, z: (z0 + z1) / 2 });
    }
    return this;
  }

  /** An impassable boundary with an optional visual face. */
  bound(x0, z0, x1, z1, vh = 6, color = null) {
    return this.wall(x0, z0, x1, z1, vh, color, 0, 1e6);
  }

  /**
   * Declare a rectangle as water.
   *
   * Placement then respects what a thing actually is: an archetype's `surface`
   * is `'land'` (the default), `'water'` or `'air'`, and `place()` refuses to
   * put a boat in a field or an office block in a harbour. Before this, the
   * scatter passes treated the map as one undifferentiated sheet and anything
   * could end up anywhere.
   *
   * Water is not a separate walkable height — the katamari rolls across it as
   * it always did. This is purely about what gets placed where.
   */
  water(x0, z0, x1, z1) {
    this.waters.push({
      x0: Math.min(x0, x1), x1: Math.max(x0, x1),
      z0: Math.min(z0, z1), z1: Math.max(z0, z1),
    });
    return this;
  }

  isWater(x, z) {
    for (const w of this.waters) {
      if (x >= w.x0 && x <= w.x1 && z >= w.z0 && z <= w.z1) return true;
    }
    return false;
  }

  build(stage) {
    this.stage = stage;
    this.bounds = stage.bounds;
    this.rng = makeRng(stage.seed ?? 12345);
    this.waters.length = 0;
    this.field = new PropField(this.material, stage.cell, stage.chunk || 0);
    this.terrain = new GeomBuilder();

    stage.build(this, this.rng);

    /* `stage.spread` stretches a finished layout over more ground WITHOUT
       touching the objects on it — same props, same sizes, same count, further
       apart. Density is what governs how fast you grow (you travel further
       between mouthfuls), so this is the lever for "make the stage take
       longer" that does not shrink the ball you end up with: total mass, and
       therefore the size ceiling, is exactly unchanged.

       Done here rather than by editing 120 lines of hand-placed coordinates,
       which would have been a large diff with a lot of ways to typo a city.
       Only X and Z move. Heights, prop scales and platform tops do not. */
    const S = stage.spread || 1;
    if (S !== 1) {
      for (const p of this.field.placements) { p.x *= S; p.z *= S; }
      for (const p of this.platforms) { p.x0 *= S; p.x1 *= S; p.z0 *= S; p.z1 *= S; }
      for (const w of this.waters) { w.x0 *= S; w.x1 *= S; w.z0 *= S; w.z1 *= S; }
      this.terrain.scaleXZ(S);
    }

    // Clear a bubble around the spawn of anything you could not immediately
    // eat. Without this a stage can drop you inside a parked bus or, worse,
    // between two houses, and the run is over before it starts.
    if (stage.spawn) {
      const clear = stage.spawnClear ?? Math.max(stage.startSize * 3.5, 1.2);
      const eatable = stage.startSize * 0.92;
      const sx = stage.spawn.x, sz = stage.spawn.z;
      this.field.placements = this.field.placements.filter((p) => {
        if (p.arch.pickup <= eatable) return true;
        const reach = clear + p.arch.radius * p.scale;
        return (p.x - sx) ** 2 + (p.z - sz) ** 2 > reach * reach;
      });
    }

    const geo = this.terrain.build({ groundAlign: false, centerXZ: false });
    this.terrainMesh = new THREE.Mesh(geo, this.material);
    this.terrainMesh.receiveShadow = true;
    this.terrainMesh.castShadow = false;
    this.root.add(this.terrainMesh);
    this.terrain = null;

    this.field.finalize();
    this.root.add(this.field.root);

    this.totalProps = this.field.n;
    return this;
  }

  dispose() {
    if (this.field) this.field.dispose();
    if (this.terrainMesh) { this.root.remove(this.terrainMesh); this.terrainMesh.geometry.dispose(); }
    this.root.clear();
    this.platforms.length = 0;
  }

  /* ------------------------------------------------------------
     Prop placement helpers
     ------------------------------------------------------------ */

  /** Archetypes for this stage whose pickup size sits in [lo, hi]. */
  pool(tag, lo, hi) {
    return ARCHETYPES.filter((p) => p.tags.includes(tag) && p.pickup >= lo && p.pickup <= hi);
  }

  /**
   * @param {boolean} force skip the land/water check (for hand-placed landmarks
   *        that knowingly straddle a shoreline, like a lighthouse or a bridge)
   */
  place(arch, x, z, rotY = null, scale = 1, y = null, force = false) {
    if (!arch) return;
    const r = this.rng;
    let groundY = y != null ? y : this.groundAt(x, z);
    if (groundY > 1e5) return;   // inside a wall volume — silently skip

    // Boats float, buildings do not, aeroplanes are neither.
    const surface = arch.surface || 'land';
    if (!force && surface !== 'air') {
      const wet = this.isWater(x, z);
      if ((surface === 'water') !== wet) return;
    }
    if (surface === 'air') groundY += (arch.flyHeight || 0) * scale;

    this.field.add(arch, Math.floor(r() * arch.geos.length), x, groundY, z,
      rotY == null ? r() * Math.PI * 2 : rotY, scale);
  }

  /**
   * Sprinkle props over a rectangle.
   * @param {object} o
   *   tag, lo, hi        – archetype filter
   *   x0,z0,x1,z1        – region
   *   count              – how many
   *   y                  – explicit surface height (else sampled)
   *   scale              – [min,max] random scale
   *   avoid              – [{x,z,r}] keep-out circles
   */
  scatter(o) {
    const r = this.rng;
    const pool = this.pool(o.tag, o.lo, o.hi).filter((p) => !o.exclude || !o.exclude.includes(p.id));
    if (!pool.length) return;
    const totalW = pool.reduce((s, p) => s + p.weight, 0);
    /* One dial per stage for "a bit more/less clutter" (see `stage.density`).
     *
     * KNOWN LIMITATION: turning it up does not fill a stage in, it RE-ROLLS the
     * stage. Every scatter pass draws from the one `this.rng` stream, so adding
     * n draws here shifts every subsequent draw in the whole build — different
     * positions, different variants, different scales, everywhere after this
     * call. Measured on the city at x1.25: 5,152 props instead of 4,190 but
     * 30.3M m3 of mass instead of 32.7M. More things, less stuff. That is only
     * possible if it is a different city.
     *
     * It shows up as nonsense in the balance numbers too — the house measured
     * 0 clears in 15 at x1.25 and 9 in 15 at x1.5, which is layout luck, not a
     * response to density.
     *
     * The fix is to give each scatter pass its own stream keyed off a stable
     * per-call index, so the first `o.count` placements are identical whatever
     * the dial says and density genuinely appends. That is worth doing, but it
     * re-rolls all three stages once on the way through, so it needs to be a
     * deliberate decision rather than a drive-by. Until then: treat a change to
     * `density` as authoring a new stage and re-measure it as one. */
    const count = Math.round(o.count * (this.stage?.density ?? 1));

    /* A scatter pool used to be land-only by construction: the wet test was a
     * flat `if (isWater) reject` applied BEFORE anything knew what was being
     * placed, so a `surface: 'water'` prop could never be scattered anywhere,
     * however wet the rectangle was. The comment there claimed "unless the pool
     * says otherwise", which was not what the code did — and the failure was
     * silent, because a water archetype still won its weighted roll and then
     * vanished, quietly under-delivering the pass. Both new stages hit it and
     * had to hand-place their boats and diatoms.
     *
     * Fixing it means picking the archetype BEFORE hunting for a position, so
     * the retry loop can ask the only question that matters: does THIS thing
     * belong HERE. But that reorders the draws from `this.rng`, and every
     * scatter in the game shares one stream — flipping the order unconditionally
     * re-rolled all three original stages and dropped the house from 12 runs in
     * 15 clearing to 1 in 9. (Same trap as `stage.density`; see the note above.)
     *
     * So: legacy order for a pool that is entirely land props, which is every
     * pool in the house, the town and the city, and therefore a byte-identical
     * layout for all three. The surface-aware path only runs where a pool
     * actually contains something amphibious. */
    const mixed = pool.some((p) => (p.surface || 'land') !== 'land');

    for (let i = 0; i < count; i++) {
      let arch = null, wants = 'land';
      if (mixed) {
        let pk = r() * totalW; arch = pool[pool.length - 1];
        for (const p of pool) { pk -= p.weight; if (pk <= 0) { arch = p; break; } }
        wants = arch.surface || 'land';   // 'air' hovers and cares about neither
      }

      let x, z, ok = false;
      for (let tries = 0; tries < 8 && !ok; tries++) {
        x = o.x0 + r() * (o.x1 - o.x0);
        z = o.z0 + r() * (o.z1 - o.z0);
        ok = true;
        if (o.avoid) for (const a of o.avoid) {
          if ((x - a.x) ** 2 + (z - a.z) ** 2 < a.r * a.r) { ok = false; break; }
        }
        if (ok && o.ring) {
          const d = Math.hypot(x - (o.ring.x || 0), z - (o.ring.z || 0));
          if (d < o.ring.min || d > o.ring.max) ok = false;
        }
        // Without this a quarter of downtown's street furniture ended up
        // bobbing in the city's harbour.
        if (ok && wants !== 'air' && this.isWater(x, z) !== (wants === 'water')) ok = false;
      }
      if (!ok) continue;
      if (!mixed) {
        let pk = r() * totalW; arch = pool[pool.length - 1];
        for (const p of pool) { pk -= p.weight; if (pk <= 0) { arch = p; break; } }
      }
      const sc = o.scale ? o.scale[0] + r() * (o.scale[1] - o.scale[0]) : 1;
      this.place(arch, x, z, null, sc, o.y);
    }
  }

  /** Place a named archetype by id (throws early if a stage typos an id). */
  placeId(id, x, z, rotY = null, scale = 1, y = null, force = false) {
    const arch = ARCHETYPES.find((p) => p.id === id);
    if (!arch) throw new Error(`Unknown prop id "${id}"`);
    this.place(arch, x, z, rotY, scale, y, force);
    return arch;
  }

  /* ------------------------------------------------------------
     Height queries
     ------------------------------------------------------------ */

  _topOf(p, x, z) {
    if (!p.axis) return p.top;
    const t = p.axis === 'x'
      ? (x - p.x0) / Math.max(1e-6, p.x1 - p.x0)
      : (z - p.z0) / Math.max(1e-6, p.z1 - p.z0);
    return p.top + (p.topTo - p.top) * clamp(t, 0, 1);
  }

  /** Highest platform top at this point regardless of reachability. */
  groundAt(x, z) {
    let best = -Infinity;
    for (const p of this.platforms) {
      if (x < p.x0 || x > p.x1 || z < p.z0 || z > p.z1) continue;
      const t = this._topOf(p, x, z);
      if (t > best) best = t;
    }
    return best === -Infinity ? 0 : best;
  }

  /** Highest reachable top given the ball's current underside and climb ability. */
  supportAt(x, z, bottomY, climb) {
    let best = -Infinity;
    for (const p of this.platforms) {
      if (x < p.x0 || x > p.x1 || z < p.z0 || z > p.z1) continue;
      const t = this._topOf(p, x, z);
      if (t <= bottomY + climb && t > best) best = t;
    }
    return best;
  }

  /** True if the ball can stand at this spot without a wall in the way. */
  canOccupy(x, z, bottomY, climb) {
    if (x < this.bounds.minX || x > this.bounds.maxX || z < this.bounds.minZ || z > this.bounds.maxZ) return false;
    let highest = -Infinity;
    for (const p of this.platforms) {
      if (x < p.x0 || x > p.x1 || z < p.z0 || z > p.z1) continue;
      const t = this._topOf(p, x, z);
      if (t > highest) highest = t;
    }
    if (highest === -Infinity) return false;          // off the edge of the world
    return highest <= bottomY + climb;
  }

  /* ------------------------------------------------------------
     Katamari integration
     ------------------------------------------------------------ */

  moveKatamari(kat, dt) {
    const R = kat.radius;
    const climb = R * 1.15;
    let bottom = kat.pos.y - R;

    // --- horizontal, axis separated so we slide along walls ---
    const dx = kat.vel.x * dt;
    if (dx !== 0) {
      const nx = kat.pos.x + dx;
      const probe = nx + Math.sign(dx) * R * 0.92;
      if (this.canOccupy(probe, kat.pos.z, bottom, climb) && this.canOccupy(nx, kat.pos.z, bottom, climb)) {
        kat.pos.x = nx;
      } else {
        // Stop, do not bounce. The stage boundary is an invisible wall with
        // nothing behind it, and reflecting off it fires you back the only way
        // you came — which in a corner means being volleyed between two of
        // them. Killing the component is calmer and cannot add energy.
        kat.vel.x = 0;
      }
    }
    const dz = kat.vel.z * dt;
    if (dz !== 0) {
      const nz = kat.pos.z + dz;
      const probe = nz + Math.sign(dz) * R * 0.92;
      if (this.canOccupy(kat.pos.x, probe, bottom, climb) && this.canOccupy(kat.pos.x, nz, bottom, climb)) {
        kat.pos.z = nz;
      } else {
        kat.vel.z = 0;
      }
    }

    // --- clamp to stage bounds ---
    kat.pos.x = clamp(kat.pos.x, this.bounds.minX + R, this.bounds.maxX - R);
    kat.pos.z = clamp(kat.pos.z, this.bounds.minZ + R, this.bounds.maxZ - R);

    // --- vertical ---
    let support = this.supportAt(kat.pos.x, kat.pos.z, bottom, climb);
    if (support === -Infinity) support = this.groundAt(kat.pos.x, kat.pos.z);
    // Props you are riding over count as ground while you are on them.
    // `resolve` set this last tick and it decays if you leave, so a ramp you
    // have rolled off does not keep holding you up.
    if (kat.rampTop > support) support = kat.rampTop;
    kat.rampTop = -Infinity;

    if (bottom > support + 1e-4) {
      // Gravity is per RADIUS, not per metre, so a fall of one ball-width
      // takes the same time to watch at 5cm as at 300m. With a flat metric
      // gravity a large katamari hung in the air for seconds after every
      // kerb — 30% of its time airborne in the city — and airborne means
      // nothing underneath is in reach.
      kat.vy -= TUNING.gravityRadii * R * dt;
      bottom += kat.vy * dt;
      if (bottom <= support) { bottom = support; kat.vy = 0; kat.airborne = false; }
      else kat.airborne = true;
    } else if (bottom < support) {
      /* Rising onto a step, or up the side of something too big to eat.

         The climb is PAID FOR out of horizontal speed, in ball-relative units:
         getting all the way up `climbFrac * R` costs everything you have, and
         a fraction of that height costs that fraction of your kinetic energy.
         Run out on the way and you stop rising, gravity takes over, and you
         slide back down the way you came.

         Deliberately NOT `v² - 2·g·h` against real gravity: once gravity
         scales with the ball, that makes climbing depend on (topSpeed/R)²,
         which varies ~7x across the stages, and the city would be unable to
         mount 2% of its own radius. */
      const want = Math.min(support, bottom + Math.max(R * 6, 2) * dt);
      const dh = want - bottom;
      const sp2 = kat.vel.x * kat.vel.x + kat.vel.z * kat.vel.z;
      const full = Math.max(1e-6, TUNING.climbFrac * R);
      const cap = kat.topSpeed || Math.sqrt(sp2) || 1;
      const cost = (dh / full) * cap * cap;
      if (sp2 > cost) {
        const k = Math.sqrt((sp2 - cost) / sp2);
        kat.vel.x *= k;
        kat.vel.z *= k;
        bottom = want;
      }
      // else: not enough left in the tank — hold height and let gravity win.
      kat.vy = 0;
      kat.airborne = false;
    } else {
      bottom = support;
      kat.vy = 0;
      kat.airborne = false;
    }
    kat.pos.y = bottom + R;
  }

  /**
   * Which part of prop `i` — if any — actually blocks the katamari, and how
   * far to push it out.
   *
   * A prop carries a short list of axis-aligned boxes, one per primitive its
   * builder stacked (see `collisionParts` in props/index.js). A part blocks
   * you horizontally if and only if it OVERLAPS YOU VERTICALLY: a table top
   * 34cm up is irrelevant to a 10cm katamari, and its legs are four small
   * rectangles with a lot of nothing between them.
   *
   * Everything is done in the prop's own un-rotated, un-scaled frame, which
   * is the frame the boxes were recorded in. The push is horizontal only —
   * the game resolves obstacles in 2D and floors are handled separately by
   * `settle`, so a vertical normal here would fight the floor solver.
   *
   * `stand` is a SEPARATE question from blocking and has to be, because the
   * two conditions are mutually exclusive by construction: a part you have
   * climbed on top of no longer overlaps you vertically, so the blocking test
   * stops seeing it. Answering only the blocking question meant a ball would
   * ride up an obstacle, lose its support the instant it cleared the top, and
   * drop straight back down — climbing that could never finish.
   *
   * @returns {{nx:number, nz:number, overlap:number, top:number}|null} block
   * @returns {number} stand — highest part top the ball is over and could rest on
   */
  _blockingPart(f, i, kat, R, ballBottom, ballTop) {
    const arch = f.arch[i];
    const sc = f.scale[i];
    const parts = arch.parts && arch.parts[f.variant[i]];

    const wx = kat.pos.x - f.x[i], wz = kat.pos.z - f.z[i];

    // No recorded parts (shouldn't happen, but a prop built by pushing raw
    // geometry could) — fall back to the old radial disc rather than letting
    // the katamari walk through it.
    if (!parts || parts.length === 0) {
      const d = Math.hypot(wx, wz) || 1e-6;
      const invH = NSLICE / Math.max(1e-6, f.hgt[i]);
      let s0 = Math.max(0, Math.floor((ballBottom - f.y[i]) * invH));
      let s1 = Math.min(NSLICE - 1, Math.floor((ballTop - f.y[i]) * invH));
      let pr = 0;
      for (let s = s0; s <= s1; s++) if (arch.profile[s] > pr) pr = arch.profile[s];
      pr *= sc;
      const overlap = R + pr - d;
      this._standTop = -Infinity;
      this._standCrest = -Infinity;
      return overlap > 0 ? { nx: wx / d, nz: wz / d, overlap, top: f.y[i] + f.hgt[i] } : null;
    }

    const a = f.rotY[i];
    const cos = Math.cos(a), sin = Math.sin(a);
    const lx = (wx * cos - wz * sin) / sc;
    const lz = (wx * sin + wz * cos) / sc;
    const lr = R / sc;
    const lyBot = (ballBottom - f.y[i]) / sc;
    const lyTop = (ballTop - f.y[i]) / sc;

    // How high above our underside a part may finish and still be somewhere we
    // could end up standing, in local units.
    const reach = lyBot + (R * TUNING.climbFrac) / sc;

    let bestPen = 0, bnx = 0, bnz = 0, bestTop = 0;
    let stand = -Infinity, crest = -Infinity;
    for (let o = 0; o < parts.length; o += 6) {
      const minX = parts[o], minZ = parts[o + 2], maxX = parts[o + 3], maxZ = parts[o + 5];
      const qx = lx < minX ? minX : (lx > maxX ? maxX : lx);
      const qz = lz < minZ ? minZ : (lz > maxZ ? maxZ : lz);
      const dx = lx - qx, dz = lz - qz;
      const dist = Math.hypot(dx, dz);

      /* --- how high does this part hold us up RIGHT HERE? ---

         Asked for EVERY part, including ones that no longer overlap us
         vertically, because that is exactly the state of a part you have just
         climbed on top of.

         The height is the TANGENCY solution, not the part's top. A sphere of
         radius r whose centre is a horizontal distance `dist` from the box
         rests where it just touches the top edge:

             bottom = partTop + sqrt(r^2 - dist^2) - r

         so it is lifted the full height only when it is actually OVER the
         part, and not at all (bottom = partTop - r, i.e. underground) when it
         is merely touching the side. Using the flat part top instead meant a
         ball was jacked up the moment it brushed anything: a 272m katamari in
         the city floated a mean of 118m off the ground, could not reach a
         single thing below it, and hung there. It also gives the ramp its
         actual shape, so rolling onto something is a smooth rise rather than
         an instant step. */
      if (dist <= lr && parts[o + 4] <= reach && parts[o + 4] <= lyBot + lr) {
        // That last condition — the part's top is at or below our CENTRE — is
        // what makes this a top-edge contact rather than a face contact. A ball
        // pressed against the side of something taller than its own centre is
        // not resting on anything; the tangency formula does not apply to it
        // and using it anyway is what left a 272m katamari hovering beside a
        // 225m mountain, 100m clear of the ground, unable to reach a thing.
        //
        // It is also the honest physical limit on climbing: a rolling ball
        // cannot mount a step taller than its radius no matter how fast it is
        // going, because past that the contact normal points down into the
        // step and pushing only wedges it harder. `climbFrac` can never buy
        // more than this, and should not try.
        const lift = parts[o + 4] + Math.sqrt(Math.max(0, lr * lr - dist * dist)) - lr;
        if (lift > stand) stand = lift;
        // The full height still has to be paid for, so the energy gate is
        // tested against the crest rather than against where we are now.
        if (parts[o + 4] > crest) crest = parts[o + 4];
      }

      // --- does it block us? ---
      if (parts[o + 4] <= lyBot || parts[o + 1] >= lyTop) continue;   // clears us vertically
      let pen, ndx, ndz;
      if (dist > 1e-9) {
        pen = lr - dist;
        if (pen <= 0) continue;
        ndx = dx / dist; ndz = dz / dist;
      } else {
        // Centre is inside the rectangle — leave by the nearest face.
        const l = lx - minX, rr = maxX - lx, b = lz - minZ, t = maxZ - lz;
        const m = Math.min(l, rr, b, t);
        if (m === l) { ndx = -1; ndz = 0; pen = lr + l; }
        else if (m === rr) { ndx = 1; ndz = 0; pen = lr + rr; }
        else if (m === b) { ndx = 0; ndz = -1; pen = lr + b; }
        else { ndx = 0; ndz = 1; pen = lr + t; }
      }
      if (pen > bestPen) { bestPen = pen; bnx = ndx; bnz = ndz; bestTop = parts[o + 4]; }
    }
    // Side channel rather than a return value, so the common "nothing here"
    // path stays allocation-free.
    this._standTop = stand > -Infinity ? f.y[i] + stand * sc : -Infinity;
    this._standCrest = crest > -Infinity ? f.y[i] + crest * sc : -Infinity;
    if (bestPen <= 0) return null;
    return {
      nx: bnx * cos + bnz * sin,
      nz: -bnx * sin + bnz * cos,
      overlap: bestPen * sc,
      // World-space top of the part actually in the way — the height you would
      // have to get over, which is not the same as the prop's overall height.
      // The lamp head is 4m up; the post you are stuck on ends at your ankles.
      top: f.y[i] + bestTop * sc,
    };
  }

  /**
   * Collect / bump against props. Returns an array of events:
   *   {type:'pickup', arch, pos}  |  {type:'bump', arch, impact}
   */
  resolve(kat, dt, rnd) {
    const out = this.events;
    out.length = 0;
    const R = kat.radius;
    const D = R * 2;
    const ballBottom = kat.pos.y - R;
    const ballTop = kat.pos.y + R;
    const f = this.field;
    const pickupLimit = D * TUNING.pickupRatio;
    let knock = 0;

    f.query(kat.pos.x, kat.pos.z, R, (i) => {
      const ix = f.x[i], iz = f.z[i];
      let ddx = kat.pos.x - ix, ddz = kat.pos.z - iz;
      let d = Math.hypot(ddx, ddz);
      if (d > R + f.rad[i]) return;

      const itemTop = f.y[i] + f.hgt[i];
      const itemBottom = f.y[i];
      if (itemTop < ballBottom - R * 0.1 || itemBottom > ballTop) return;

      /* Only the slices of the prop that the ball actually spans count.
       *
       * BOTH ends must be clamped, and for a long time only one was. `s1` was
       * capped at the top slice while `s0` was left free, so whenever the ball's
       * underside sat above the prop's top — which the vertical test above
       * DELIBERATELY allows, up to a tenth of a radius — `s0` ran off the end of
       * the profile, `s1 < s0`, and the prop was silently skipped.
       *
       * A tenth of a radius is nothing on a marble and 122km on a 2438km
       * katamari, so the bug was invisible in the small stages and fatal in the
       * world: a huge ball parked on a 34km-high island could not pick up an
       * atoll sitting at sea level beside it. At the map edge the boundary clamp
       * FORCES the ball inland onto exactly that raised ground, so the last few
       * coastal props became uncollectable and the stage could not be cleared —
       * "when you reach a certain size it's impossible to pick up all the
       * smaller items around the edge of the map". Twelve props in the world
       * stage, none anywhere else, which is why it read as a map problem.
       *
       * Clamping s0 too means the topmost slice's radius is used when the ball
       * is above the prop, which is the right answer: that is the part of the
       * prop the ball's underside is actually passing over. */
      const arch = f.arch[i];
      const sc = f.scale[i];
      const invH = NSLICE / Math.max(1e-6, f.hgt[i]);
      let s0 = Math.floor((ballBottom - itemBottom) * invH);
      let s1 = Math.floor((ballTop - itemBottom) * invH);
      if (s0 < 0) s0 = 0;
      if (s0 > NSLICE - 1) s0 = NSLICE - 1;
      if (s1 < 0) s1 = 0;
      if (s1 > NSLICE - 1) s1 = NSLICE - 1;
      if (s1 < s0) return;
      let pr = 0;
      for (let s = s0; s <= s1; s++) { const v = arch.profile[s]; if (v > pr) pr = v; }
      pr *= sc;
      const sum = R + pr;
      if (d > sum) return;

      if (d < 1e-6) { ddx = 1; ddz = 0; d = 1e-6; }
      const nx = ddx / d, nz = ddz / d;

      if (f.pickup[i] <= pickupLimit) {
        // Anything small enough sticks the moment it is touched — including
        // stamps and coins, which are almost flat.
        if (d < R + pr * 0.75) {
          const wp = new THREE.Vector3(ix, f.y[i] + Math.min(f.hgt[i] * 0.5, R), iz);
          f.remove(i);
          kat.attach(arch, wp, f.variant[i], f.rotY[i], rnd);
          /* `idx` is the prop's index in the one PropField. It is stable for the
             life of a world AND identical on every machine, because the world is
             built deterministically from `stage.seed` — which makes it the whole
             of what a peer needs in order to say "this one is gone": two bytes,
             no position, no name, and nothing to validate beyond a range check.
             Nothing in the single-player game reads it; it is here so the
             network layer never has to invent an identity scheme of its own. */
          out.push({ type: 'pickup', arch, pos: wp, size: f.pickup[i], idx: i });
        }
        return;
      }

      // --- too big: obstacle ---

      // Which of the prop's parts actually blocks us, if any. The radial
      // reach above was only ever a cheap reject — a table's legs sit at the
      // corners, so its profile is a solid disc the width of the table and
      // going anywhere near one would stop a katamari that fits underneath.
      const hit = this._blockingPart(f, i, kat, R, ballBottom, ballTop);

      /* Can we ride over it instead of bouncing off?

         Being too big to eat should not make something a wall. Anything whose
         top is within `climbFrac` of a radius above our underside is a ramp,
         not an obstacle — PROVIDED we are carrying the speed to pay for it:

             climbable rise = climbFrac * R * (v / topSpeed)^2

         Come in fast and you crest it; come in slow and you stall on the slope
         and roll back. That is momentum doing the decelerating, and out here
         it is the only thing that should be. `moveKatamari` charges the climb
         on the next tick, out of the same budget. */
      const stand = this._standTop;
      if (stand > ballBottom - R) {
        // Gate on the CREST, not on where we are now: the tangency curve means
        // the first frame of contact asks for almost no lift at all, so gating
        // on that would wave everything through and then strand the ball
        // partway up whatever it could not actually finish.
        const rise = Math.max(0, this._standCrest - ballBottom);
        const sp2 = kat.vel.x * kat.vel.x + kat.vel.z * kat.vel.z;
        const cap = kat.topSpeed || Math.sqrt(sp2) || 1;
        const reachable = TUNING.climbFrac * R * (sp2 / (cap * cap));
        if (rise <= 1e-4 || rise <= reachable) {
          if (stand > kat.rampTop) kat.rampTop = stand;
          return;
        }
      }
      if (!hit) return;

      /* NEVER PUSH THE BALL SOMEWHERE IT CANNOT STAND.
       *
       * This is a penetration fix, so normally it moves the ball a fraction of a
       * frame's travel. It does not when the ball has just GROWN: eating
       * something large jumps the radius, the ball is suddenly deep inside a
       * neighbour, and the correction becomes a real shove — measured at 7.3
       * units on a katamari of radius 19.5.
       *
       * If that shove lands the centre inside an impassable volume the run is
       * over. `moveKatamari` tests `canOccupy` per axis and rejects the whole
       * step, so a centre a couple of units inside a wall can never accumulate
       * the single-frame displacement it needs to get out again — it just zeroes
       * its velocity against every direction, for the rest of the stage. Two of
       * nine balance runs on the world stage ended exactly there, frozen inside
       * the same 18-wide sea-arch footing at half the size they should have
       * reached, still steering at a target 130 units away.
       *
       * Leaving the overlap in place is strictly the lesser evil: the ball keeps
       * a legal position, the next frame tries again from wherever it has moved
       * to, and the visible cost is a frame of a prop clipping the ball. */
      const { nx: hnx, nz: hnz, overlap } = hit;
      const pushX = kat.pos.x + hnx * overlap;
      const pushZ = kat.pos.z + hnz * overlap;
      if (this.canOccupy(pushX, pushZ, ballBottom, R * 1.15)) {
        kat.pos.x = pushX;
        kat.pos.z = pushZ;
      }
      const vn = kat.vel.x * hnx + kat.vel.z * hnz;
      const nx2 = hnx, nz2 = hnz;
      if (vn < 0) {
        kat.vel.x -= vn * nx2 * (1 + RESTITUTION);
        kat.vel.z -= vn * nz2 * (1 + RESTITUTION);
        const impact = -vn / Math.max(1e-4, kat.topSpeed || D);
        if (impact > 0.25) {
          out.push({ type: 'bump', arch: f.arch[i], impact, pos: { x: ix, y: f.y[i], z: iz } });
          this.jiggles.push({ i, until: this.time + 0.45, amount: Math.min(0.14, impact * 0.09) });
        }
        if (impact > TUNING.knockThreshold) knock = Math.max(knock, impact - TUNING.knockThreshold);
      }
    });

    if (knock > 0) {
      const lost = kat.knockOff(clamp(knock, 0, 1.4), rnd);
      if (lost) out.push({ type: 'knock', count: lost });
    }
    return out;
  }

  /**
   * Is there anything left in the stage that the katamari could still pick up?
   *
   * If the answer is no, it is no longer a matter of skill or time: growth
   * requires collecting, collecting requires something small enough, and
   * nothing gets smaller. The katamari can never grow again, so every
   * remaining second is dead time and the round is mathematically finished.
   *
   * The original never needs this rule because its stages cannot be stripped.
   * These ones can be.
   */
  canStillGrow(diameter) {
    const limit = diameter * TUNING.pickupRatio;
    const f = this.field;
    for (let i = 0; i < f.n; i++) {
      if (f.alive[i] && f.pickup[i] <= limit) return true;
    }
    return false;
  }

  /**
   * Positions of everything still collectable, up to `max`.
   *
   * For the end-of-round finder. A stage is only "cleared" when nothing
   * collectable is left, and hunting the last handful across a 4km city by eye
   * is not a skill test, it is a search problem with no information — the
   * player reported it as "impossible to see the final few pieces". Once the
   * count is small enough to be findable, the HUD points at them.
   */
  remainingCollectable(diameter, max = 16) {
    const limit = diameter * TUNING.pickupRatio;
    const f = this.field;
    const out = [];
    for (let i = 0; i < f.n && out.length < max; i++) {
      if (f.alive[i] && f.pickup[i] <= limit) out.push({ x: f.x[i], y: f.y[i] + f.hgt[i] * 0.5, z: f.z[i] });
    }
    return out;
  }

  /** How many collectable props are left, stopping once past `cap`. */
  countCollectable(diameter, cap = 40) {
    const limit = diameter * TUNING.pickupRatio;
    const f = this.field;
    let n = 0;
    for (let i = 0; i < f.n; i++) {
      if (f.alive[i] && f.pickup[i] <= limit && ++n > cap) return n;
    }
    return n;
  }

  /** 0..1 — how much of the stage has been rolled up. */
  collectedFraction() {
    const f = this.field;
    if (!f.n) return 0;
    return (f.n - f.liveCount) / f.n;
  }

  update(dt, katamariDiameter = 0) {
    this.time += dt;
    if (katamariDiameter) this.field.setDetailCutoff(katamariDiameter);
    for (let i = this.jiggles.length - 1; i >= 0; i--) {
      const j = this.jiggles[i];
      if (this.time > j.until) {
        this.field.settle(j.i);
        this.jiggles.splice(i, 1);
      } else {
        const k = (j.until - this.time) / 0.45;
        this.field.jiggle(j.i, j.amount * k, this.time);
      }
    }
  }
}
