/* ============================================================
   Every collectable object in the stage lives here.

   Rendering: one InstancedMesh per (archetype, variant) so a
   thousand objects cost a few dozen draw calls. Collecting an
   object swap-removes its instance slot and decrements the
   draw count, which keeps the GPU work shrinking as you roll.

   Broadphase: a uniform grid over XZ. Items are inserted into
   every cell their footprint touches, so a single skyscraper
   occupies many cells and is found from any of them.
   ============================================================ */

import * as THREE from 'three';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();

export class PropField {
  /**
   * @param {THREE.Material} material shared vertex-coloured material
   * @param {number} cellSize broadphase grid size in metres
   * @param {number} chunkSize instanced meshes are split into spatial chunks
   *   this big so the GPU can frustum-cull them; without it a single
   *   InstancedMesh spans the whole stage and nothing is ever culled.
   */
  constructor(material, cellSize, chunkSize = 0) {
    this.material = material;
    this.cell = cellSize;
    this.chunk = chunkSize;
    this.root = new THREE.Group();
    this.groupList = [];
    this._cutoff = 0;

    this.placements = [];   // staging area before finalize()
    this.groups = new Map();

    // Struct-of-arrays for the live items.
    this.arch = [];         // archetype object
    this.variant = [];
    this.x = []; this.y = []; this.z = [];
    this.rotY = [];
    this.scale = [];
    this.rad = [];          // horizontal collision radius (world units)
    this.hgt = [];
    this.pickup = [];       // effective pickup size (scaled)
    this.alive = [];
    this.gkey = [];
    this.slot = [];

    this.grid = new Map();
    this.stamp = null;
    this.stampTick = 1;
    this.liveCount = 0;
  }

  add(arch, variant, x, y, z, rotY, scale = 1) {
    this.placements.push({ arch, variant: variant % arch.geos.length, x, y, z, rotY, scale });
  }

  finalize() {
    // ---- group by archetype + variant + spatial chunk ----
    const byKey = new Map();
    const cs = this.chunk;
    for (const p of this.placements) {
      const cx = cs ? Math.floor(p.x / cs) : 0;
      const cz = cs ? Math.floor(p.z / cs) : 0;
      const key = `${p.arch.id}#${p.variant}#${cx},${cz}`;
      let g = byKey.get(key);
      if (!g) { g = { key, arch: p.arch, variant: p.variant, items: [] }; byKey.set(key, g); }
      g.items.push(p);
    }

    let idx = 0;
    for (const g of byKey.values()) {
      const im = new THREE.InstancedMesh(g.arch.geos[g.variant], this.material, g.items.length);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      // Only things with real bulk bother casting shadows; a thumbtack's
      // shadow is a sub-pixel smudge that costs a full extra draw.
      im.castShadow = !g.arch.noShadow && g.arch.pickup > 0.09;
      im.receiveShadow = true;
      im.frustumCulled = true;
      im.count = g.items.length;
      const group = { key: g.key, im, arch: g.arch, slotToItem: new Int32Array(g.items.length), count: g.items.length };
      this.groups.set(g.key, group);
      this.groupList.push(group);
      this.root.add(im);

      let slot = 0;
      for (const p of g.items) {
        this.arch[idx] = p.arch;
        this.variant[idx] = p.variant;
        this.x[idx] = p.x; this.y[idx] = p.y; this.z[idx] = p.z;
        this.rotY[idx] = p.rotY;
        this.scale[idx] = p.scale;
        this.rad[idx] = p.arch.radius * p.scale;
        this.hgt[idx] = p.arch.height * p.scale;
        this.pickup[idx] = p.arch.pickup * p.scale;
        this.alive[idx] = 1;
        this.gkey[idx] = g.key;
        this.slot[idx] = slot;
        group.slotToItem[slot] = idx;
        this._writeMatrix(im, slot, p.x, p.y, p.z, p.rotY, p.scale);
        slot++; idx++;
      }
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
    }

    this.n = idx;
    this.liveCount = idx;
    this.stamp = new Int32Array(idx);
    this.placements.length = 0;

    // ---- broadphase ----
    this._buildGrid();
    return this;
  }

  _writeMatrix(im, slot, x, y, z, rotY, scale) {
    _p.set(x, y, z);
    _e.set(0, rotY, 0);
    _q.setFromEuler(_e);
    _s.setScalar(scale);
    _m.compose(_p, _q, _s);
    im.setMatrixAt(slot, _m);
  }

  _buildGrid() {
    this.grid.clear();
    const c = this.cell;
    for (let i = 0; i < this.n; i++) {
      const r = this.rad[i];
      const i0 = Math.floor((this.x[i] - r) / c), i1 = Math.floor((this.x[i] + r) / c);
      const j0 = Math.floor((this.z[i] - r) / c), j1 = Math.floor((this.z[i] + r) / c);
      for (let gi = i0; gi <= i1; gi++) for (let gj = j0; gj <= j1; gj++) {
        const k = gi * 73856093 ^ gj * 19349663;
        let arr = this.grid.get(k);
        if (!arr) { arr = []; this.grid.set(k, arr); }
        arr.push(i);
      }
    }
  }

  /**
   * Visit every live item whose footprint may overlap the circle (cx, cz, r).
   * @param {(i:number)=>void} cb
   */
  query(cx, cz, r, cb) {
    const c = this.cell;
    const i0 = Math.floor((cx - r) / c), i1 = Math.floor((cx + r) / c);
    const j0 = Math.floor((cz - r) / c), j1 = Math.floor((cz + r) / c);
    const tick = this.stampTick++;
    for (let gi = i0; gi <= i1; gi++) {
      for (let gj = j0; gj <= j1; gj++) {
        const arr = this.grid.get(gi * 73856093 ^ gj * 19349663);
        if (!arr) continue;
        for (let a = 0; a < arr.length; a++) {
          const i = arr[a];
          if (this.stamp[i] === tick || !this.alive[i]) continue;
          this.stamp[i] = tick;
          cb(i);
        }
      }
    }
  }

  /** Remove an item from rendering. Its grid entries are skipped via `alive`. */
  remove(i) {
    if (!this.alive[i]) return;
    this.alive[i] = 0;
    this.liveCount--;
    const g = this.groups.get(this.gkey[i]);
    if (!g) return;
    const slot = this.slot[i];
    const last = g.count - 1;
    if (slot !== last) {
      const moved = g.slotToItem[last];
      g.im.getMatrixAt(last, _m);
      g.im.setMatrixAt(slot, _m);
      g.slotToItem[slot] = moved;
      this.slot[moved] = slot;
    }
    g.count = last;
    g.im.count = last;
    g.im.instanceMatrix.needsUpdate = true;
  }

  /**
   * Hide archetypes that have become sub-pixel next to the katamari.
   * They stay collidable and collectable — this only skips drawing them.
   */
  setDetailCutoff(katamariDiameter) {
    const cutoff = katamariDiameter / 130;
    if (Math.abs(cutoff - this._cutoff) < cutoff * 0.05) return;
    this._cutoff = cutoff;
    for (const g of this.groupList) {
      const vis = g.arch.pickup >= cutoff;
      if (g.im.visible !== vis) g.im.visible = vis;
    }
  }

  /** Nudge an item (used for the wobble when you bump something too big). */
  jiggle(i, amount, time) {
    const g = this.groups.get(this.gkey[i]);
    if (!g) return;
    const tilt = Math.sin(time * 22) * amount;
    _p.set(this.x[i], this.y[i], this.z[i]);
    _e.set(tilt * 0.5, this.rotY[i], tilt);
    _q.setFromEuler(_e);
    _s.setScalar(this.scale[i]);
    _m.compose(_p, _q, _s);
    g.im.setMatrixAt(this.slot[i], _m);
    g.im.instanceMatrix.needsUpdate = true;
  }

  /** Restore an item's resting transform after a jiggle. */
  settle(i) {
    const g = this.groups.get(this.gkey[i]);
    if (!g) return;
    this._writeMatrix(g.im, this.slot[i], this.x[i], this.y[i], this.z[i], this.rotY[i], this.scale[i]);
    g.im.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    for (const g of this.groups.values()) {
      this.root.remove(g.im);
      g.im.dispose();
    }
    this.groups.clear();
    this.groupList.length = 0;
    this.grid.clear();
  }
}
