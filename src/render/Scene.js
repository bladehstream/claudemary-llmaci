/* ============================================================
   Renderer, lights, sky dome and the shared material.

   Everything in the game — terrain, props, the katamari — uses
   ONE MeshLambertMaterial with vertexColors. That keeps the
   flat, poster-paint look consistent and keeps state changes
   near zero.
   ============================================================ */

import * as THREE from 'three';
import { clamp, damp } from '../util/math.js';

export class Scene {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
      logarithmicDepthBuffer: true,   // the katamari spans 5cm .. 300m
      stencil: false,
    });
    this.renderer.setClearColor(0x8fd4f0);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(58, 1, 0.01, 6000);

    this.material = new THREE.MeshLambertMaterial({
      vertexColors: true,
      side: THREE.FrontSide,
      flatShading: false,
    });

    /* ---- lighting ---- */
    this.hemi = new THREE.HemisphereLight(0xdff0ff, 0x6f8a55, 1.15);
    this.scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight(0xfff4dd, 1.05);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0012;
    this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    this.fill = new THREE.DirectionalLight(0xbcd9ff, 0.32);
    this.fill.position.set(-0.6, 0.5, -0.7);
    this.scene.add(this.fill);

    /* ---- sky dome ---- */
    const skyGeo = new THREE.SphereGeometry(1, 26, 18);
    const cnt = skyGeo.attributes.position.count;
    skyGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(cnt * 3), 3));
    this.skyGeo = skyGeo;
    this.sky = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({
      vertexColors: true, side: THREE.BackSide, depthWrite: false, fog: false,
    }));
    this.sky.renderOrder = -1;
    this.sky.frustumCulled = false;
    this.scene.add(this.sky);

    this.scene.fog = new THREE.Fog(0xdff0e4, 40, 200);

    this.shadowRadius = 12;
    this.quality = 'med';
    this.shadowsOn = true;
    this._fov = 58;
    this.resize();
  }

  setSky({ top, bottom, fog, fogNear, fogFar }) {
    this._fogBase = { near: fogNear, far: fogFar };
    const cTop = new THREE.Color(top), cBot = new THREE.Color(bottom);
    const pos = this.skyGeo.attributes.position;
    const col = this.skyGeo.attributes.color;
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const t = clamp((pos.getY(i) + 0.25) / 1.05, 0, 1);
      c.copy(cBot).lerp(cTop, Math.pow(t, 0.75));
      col.setXYZ(i, c.r, c.g, c.b);
    }
    col.needsUpdate = true;
    this.scene.fog.color.set(fog);
    this.scene.fog.near = fogNear;
    this.scene.fog.far = fogFar;
    this.renderer.setClearColor(fog);
  }

  /**
   * Draw distance follows the katamari. A 5cm ball has no business seeing
   * the far wall of the house, and a 300m one needs to see the horizon —
   * scaling the fog with size fixes the look and lets the frustum throw
   * away most of the stage while you are still small.
   * Returns the far distance so the camera can match it.
   *
   * ⚠ `zoom` IS NOT OPTIONAL POLISH — it is what makes the zoom setting do
   * anything at all. Fog distance is otherwise a function of ball size alone,
   * so pulling the camera back with an unchanged fog wall buys the player a
   * bigger helping of fog and a SMALLER view of the world, which is worse than
   * not zooming. Applied to `near` as well as `far`: scaling only the far edge
   * stretches the gradient out over a longer run and the fog stops reading as
   * distance and starts reading as a dirty lens.
   */
  updateFog(diameter, startSize, zoom = 1) {
    if (!this._fogBase) return this.scene.fog.far;
    const f = clamp(Math.sqrt(Math.max(1e-6, diameter / startSize)), 0.6, 2.4) * (zoom || 1);
    const near = this._fogBase.near * f;
    const far = this._fogBase.far * f;
    this.scene.fog.near = damp(this.scene.fog.near, near, 3, 1 / 60);
    this.scene.fog.far = damp(this.scene.fog.far, far, 3, 1 / 60);
    return this.scene.fog.far;
  }

  setSun(dir, intensity) {
    this._sunDir = new THREE.Vector3(dir.x, dir.y, dir.z).normalize();
    this.sun.intensity = intensity;
  }

  setQuality(q) {
    this.quality = q;
    const dpr = window.devicePixelRatio || 1;
    const cap = q === 'low' ? 1 : q === 'med' ? 1.5 : 2;
    this.renderer.setPixelRatio(Math.min(dpr, cap));
    this.sun.shadow.mapSize.set(q === 'low' ? 1024 : q === 'med' ? 2048 : 4096,
      q === 'low' ? 1024 : q === 'med' ? 2048 : 4096);
    if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    this.resize();
  }

  setShadows(on) {
    this.shadowsOn = on;
    this.renderer.shadowMap.enabled = on;
    this.sun.castShadow = on;
    this.scene.traverse((o) => { if (o.isMesh || o.isInstancedMesh) o.castShadow = on && o.userData.wantsShadow !== false; });
  }

  /** Keep the shadow frustum tight around the katamari as it grows. */
  followSun(target, radius) {
    const d = Math.max(6, radius * 26);
    const dir = this._sunDir || new THREE.Vector3(0.5, 1, 0.35).normalize();
    this.sun.position.copy(dir).multiplyScalar(d).add(target);
    this.sun.target.position.copy(target);
    this.sun.target.updateMatrixWorld();
    const s = Math.max(4, radius * 9);
    const cam = this.sun.shadow.camera;
    if (cam.right !== s) {
      cam.left = -s; cam.right = s; cam.top = s; cam.bottom = -s;
      cam.near = 0.5; cam.far = d * 2.4;
      cam.updateProjectionMatrix();
    }
  }

  /** Sky dome rides with the camera so it never clips. */
  followSky(camPos, far) {
    this.sky.position.copy(camPos);
    this.sky.scale.setScalar(far * 0.85);
  }

  /**
   * Vertical FOV that still leaves a usable horizontal view on a tall screen.
   *
   * `camera.fov` in three.js is the VERTICAL angle, so a fixed value means the
   * horizontal view collapses as the viewport narrows. The game is authored at
   * 58 degrees on 16:9, which is an 89-degree horizontal sweep; the same 58 on
   * a 0.46-aspect phone gives **29**. That is not a slightly worse view, it is
   * a different game — you cannot see anything beside you.
   *
   * Preserving the horizontal angle outright is worse: it wants a 130-degree
   * vertical FOV at that aspect, which is a fish-eye with a katamari somewhere
   * in the middle of it. So this compensates by half (`K`, a geometric blend
   * between none and full) and clamps the result. What that leaves on the table
   * is bought back by `CameraRig` pulling the camera further out in portrait,
   * which widens the view without bending any straight lines.
   *
   * At or above the reference aspect this returns `base` exactly, so desktop
   * and landscape are untouched.
   */
  _aspectFov(base) {
    const REF = 16 / 9;
    const K = 0.5;
    const MAX = 82;
    const a = this.camera.aspect;
    if (!isFinite(a) || a <= 0 || a >= REF) return base;
    const halfV = (base * Math.PI) / 360;
    const scaled = Math.tan(halfV) * Math.pow(REF / a, K);
    return Math.min(MAX, (Math.atan(scaled) * 360) / Math.PI);
  }

  setFov(target, dt) {
    this._fov = damp(this._fov, target, 6, dt);
    const v = this._aspectFov(this._fov);
    if (Math.abs(this.camera.fov - v) > 0.01) {
      this.camera.fov = v;
      this.camera.updateProjectionMatrix();
    }
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    /* Re-derive the FOV here as well as in `setFov`. Rotating a phone, or the
       address bar sliding away, changes the aspect without the game loop asking
       for a new FOV — and without this the compensation would not catch up
       until the next time the player changed speed. */
    this.camera.fov = this._aspectFov(this._fov);
    this.camera.updateProjectionMatrix();
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
