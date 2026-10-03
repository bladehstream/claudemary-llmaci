/* ============================================================
   Game feel: the small physical responses that make a pickup
   feel like a catch rather than a number going up.

   - SPARKS: a burst where the thing was, sized and counted by how
     big it was next to you. Additive, so night stages glow.
   - DUST: soft puffs kicked up behind a fast ball and at a bump.
   - PUNCH: the ball swells for a beat when it swallows something,
     bottom kept planted. Visual only — the group's scale is never
     read by physics, which works off `kat.radius`.
   - RING: a ground-hugging shockwave when you pass a size milestone.

   Everything is scaled to the ball's radius, because the same burst
   has to read on a 5cm marble and a 30,000-unit galaxy.

   ⚠ CUSTOM SHADERS MUST CARRY THE LOG-DEPTH CHUNKS. The renderer
   uses a logarithmic depth buffer; a ShaderMaterial without
   logdepthbuf_* writes ordinary depth and is sorted wrongly against
   everything else — particles vanish behind the floor or draw through
   walls depending on distance.
   ============================================================ */

import * as THREE from 'three';

const MAX = 2048;

const VERT = /* glsl */`
  attribute float aSize;
  attribute float aLife;
  attribute vec3 aColor;
  uniform float uScale;
  varying float vLife;
  varying vec3 vColor;
  #include <common>
  #include <logdepthbuf_pars_vertex>
  void main() {
    vLife = aLife;
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aLife > 0.0 ? aSize * uScale / max(1e-6, -mv.z) : 0.0;
    #include <logdepthbuf_vertex>
  }`;

const FRAG_SPARK = /* glsl */`
  varying float vLife;
  varying vec3 vColor;
  #include <common>
  #include <logdepthbuf_pars_fragment>
  void main() {
    #include <logdepthbuf_fragment>
    vec2 p = gl_PointCoord - 0.5;
    float r = length(p);
    // a soft disc with a four-point glint across it
    float core = smoothstep(0.5, 0.0, r);
    float star = max(smoothstep(0.08, 0.0, abs(p.x)) , smoothstep(0.08, 0.0, abs(p.y))) * smoothstep(0.5, 0.1, r);
    float a = (core * core + star * 0.8) * clamp(vLife * 2.5, 0.0, 1.0);
    if (a < 0.01) discard;
    gl_FragColor = vec4(vColor * a, a);
  }`;

const FRAG_DUST = /* glsl */`
  varying float vLife;
  varying vec3 vColor;
  #include <common>
  #include <logdepthbuf_pars_fragment>
  void main() {
    #include <logdepthbuf_fragment>
    float r = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.15, r) * clamp(vLife, 0.0, 1.0) * 0.55;
    if (a < 0.01) discard;
    gl_FragColor = vec4(vColor, a);
  }`;

class Pool {
  constructor(frag, blending) {
    this.pos = new Float32Array(MAX * 3);
    this.vel = new Float32Array(MAX * 3);
    this.col = new Float32Array(MAX * 3);
    this.size = new Float32Array(MAX);
    this.grow = new Float32Array(MAX);
    this.life = new Float32Array(MAX);
    this.decay = new Float32Array(MAX);
    this.grav = new Float32Array(MAX);
    this.drag = new Float32Array(MAX);
    this.next = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aLife', new THREE.BufferAttribute(this.life, 1).setUsage(THREE.DynamicDrawUsage));
    this.uniforms = { uScale: { value: 500 } };
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: frag, uniforms: this.uniforms,
      transparent: true, depthWrite: false, blending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    this.geo = g;
    this.live = 0;
  }

  spawn(x, y, z, vx, vy, vz, size, color, life, opts = {}) {
    const i = this.next;
    this.next = (this.next + 1) % MAX;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.col[i * 3] = color.r; this.col[i * 3 + 1] = color.g; this.col[i * 3 + 2] = color.b;
    this.size[i] = size;
    this.grow[i] = opts.grow || 0;
    this.life[i] = 1;
    this.decay[i] = 1 / life;
    this.grav[i] = opts.grav ?? 0;
    this.drag[i] = opts.drag ?? 1.5;
  }

  update(dt) {
    let live = 0;
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) continue;
      live++;
      const k = i * 3;
      const d = Math.exp(-this.drag[i] * dt);
      this.vel[k] *= d; this.vel[k + 1] = this.vel[k + 1] * d - this.grav[i] * dt; this.vel[k + 2] *= d;
      this.pos[k] += this.vel[k] * dt; this.pos[k + 1] += this.vel[k + 1] * dt; this.pos[k + 2] += this.vel[k + 2] * dt;
      this.size[i] += this.grow[i] * dt;
      this.life[i] -= this.decay[i] * dt;
      if (this.life[i] < 0) this.life[i] = 0;
    }
    this.live = live;
    if (live || this._wasLive) {
      for (const a of ['position', 'aColor', 'aSize', 'aLife']) this.geo.attributes[a].needsUpdate = true;
    }
    this._wasLive = live > 0;
  }

  clear() { this.life.fill(0); this._wasLive = true; }
}

const SPARK_COLS = [0xfff3a0, 0xff8fd0, 0x8ff0ff, 0xffffff, 0xffc861].map((h) => new THREE.Color(h));
const _c = new THREE.Color();

export class Fx {
  /** @param {THREE.Scene} scene */
  constructor(scene) {
    this.sparks = new Pool(FRAG_SPARK, THREE.AdditiveBlending);
    this.dust = new Pool(FRAG_DUST, THREE.NormalBlending);
    scene.add(this.sparks.points, this.dust.points);
    this.punch = 0;
    this.punchV = 0;
    this._dustAcc = 0;

    // milestone shockwave: a flat ring that expands and fades
    const ringGeo = new THREE.RingGeometry(0.82, 1, 64, 1);
    ringGeo.rotateX(-Math.PI / 2);
    this.ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
      color: 0xfff1a8, transparent: true, opacity: 0, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    }));
    this.ring.visible = false;
    this.ring.renderOrder = 4;
    scene.add(this.ring);
    this.ringT = 1;
  }

  /** Pixel-per-world-unit-at-distance-1 for gl_PointSize. */
  setViewport(heightPx, fovDeg) {
    const s = heightPx / (2 * Math.tan((fovDeg * Math.PI) / 360));
    this.sparks.uniforms.uScale.value = s;
    this.dust.uniforms.uScale.value = s;
  }

  /** Something was swallowed. `rel` is its size over the ball's diameter, 0..1. */
  pickup(pos, rel, R) {
    const n = Math.round(4 + rel * 22);
    const speed = R * (1.2 + rel * 2.4);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const up = 0.35 + Math.random() * 0.9;
      const s = speed * (0.5 + Math.random() * 0.7);
      const c = SPARK_COLS[(Math.random() * SPARK_COLS.length) | 0];
      this.sparks.spawn(pos.x, pos.y, pos.z, Math.cos(a) * s, up * s, Math.sin(a) * s,
        R * (0.16 + rel * 0.22) * (0.6 + Math.random() * 0.8), c, 0.45 + Math.random() * 0.4,
        { grav: R * 4.5, drag: 2.2 });
    }
    this.punchV += 0.3 + rel * 1.1;
  }

  /** Hit something too big to take. */
  bump(pos, impact, R) {
    const n = Math.round(3 + impact * 8);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = R * (0.6 + Math.random()) * impact;
      _c.setRGB(0.93, 0.9, 0.84);
      this.dust.spawn(pos.x, pos.y, pos.z, Math.cos(a) * s, R * 0.4 * Math.random(), Math.sin(a) * s,
        R * 0.35, _c, 0.6 + Math.random() * 0.4, { grow: R * 1.2, drag: 3 });
    }
  }

  /** Passed a size milestone: a ring across the floor and a fountain of sparks. */
  sizeUp(ground, R) {
    this.ring.position.set(ground.x, ground.y + R * 0.02, ground.z);
    this.ringR = R;
    this.ringT = 0;
    this.ring.visible = true;
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      const s = R * (2.2 + Math.random() * 1.2);
      const c = SPARK_COLS[i % SPARK_COLS.length];
      this.sparks.spawn(ground.x + Math.cos(a) * R, ground.y + R * 0.2, ground.z + Math.sin(a) * R,
        Math.cos(a) * s * 0.5, s * (0.8 + Math.random() * 0.6), Math.sin(a) * s * 0.5,
        R * 0.3, c, 0.8 + Math.random() * 0.5, { grav: R * 3.5, drag: 1.4 });
    }
    this.punchV += 1.4;
  }

  /**
   * Per frame. Dust trails a fast ball; the punch spring settles; particles
   * move. Call AFTER the katamari has written its own transform this frame.
   */
  update(dt, kat) {
    this.sparks.update(dt);
    this.dust.update(dt);

    if (kat && kat.group.visible) {
      const R = kat.radius;
      // an underdamped spring for the swell: a quick overshoot and settle
      this.punchV += (-this.punch * 180 - this.punchV * 14) * Math.min(dt, 1 / 30);
      this.punch += this.punchV * Math.min(dt, 1 / 30);
      this.punch = Math.max(-0.06, Math.min(0.16, this.punch));
      const s = 1 + this.punch;
      kat.group.scale.setScalar(s);
      kat.group.position.y += this.punch * R;      // keep the bottom on the floor

      // dust behind a fast, grounded ball
      if (!kat.airborne && kat.speedFrac > 0.62) {
        this._dustAcc += dt * (kat.speedFrac - 0.55) * 14;
        while (this._dustAcc > 1) {
          this._dustAcc -= 1;
          const p = kat.group.position;
          _c.setRGB(0.95, 0.93, 0.88);
          this.dust.spawn(p.x - kat.vel.x * 0.05 + (Math.random() - 0.5) * R, p.y - R * 0.85,
            p.z - kat.vel.z * 0.05 + (Math.random() - 0.5) * R,
            -kat.vel.x * 0.12, R * 0.25, -kat.vel.z * 0.12, R * 0.55, _c, 0.7, { grow: R * 1.8, drag: 2.5 });
        }
      }
    }

    if (this.ring.visible) {
      this.ringT += dt / 0.9;
      const t = Math.min(1, this.ringT);
      const e = 1 - Math.pow(1 - t, 3);
      this.ring.scale.setScalar(this.ringR * (1.2 + e * 7));
      this.ring.material.opacity = (1 - t) * 0.85;
      if (t >= 1) this.ring.visible = false;
    }
  }

  clear(kat) {
    this.sparks.clear(); this.dust.clear();
    this.punch = 0; this.punchV = 0;
    this.ring.visible = false;
    if (kat) kat.group.scale.setScalar(1);
  }
}
