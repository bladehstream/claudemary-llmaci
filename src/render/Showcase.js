/* ============================================================
   The title screen's hero: a real katamari, rolled up for the
   occasion, turning slowly in front of a sunburst sky.

   v1's title was a CSS gradient and five buttons — the one screen
   every player sees, and the only one with no katamari on it. This
   builds one the honest way: a second Katamari instance, fed house
   props smallest-first through the same `attach` the game uses, so
   it grows, sheds the tiny things and wears its pickups exactly the
   way a ball you rolled yourself would. Modelled props when the
   house pack is loaded; procedural ones if it is not.

   The sunburst is a full-screen shader quad drawn first, replacing
   the CSS one: the canvas sits UNDER the HTML, so a CSS background
   on the title screen hid everything 3D behind it.
   ============================================================ */

import * as THREE from 'three';
import { Katamari } from '../world/Katamari.js';
import { makeRng } from '../util/math.js';

const SKY = {
  uniforms: { uTime: { value: 0 }, uAspect: { value: 1.6 } },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform float uTime, uAspect;
    varying vec2 vUv;
    vec3 lin(vec3 c) { return pow(c, vec3(2.2)); }
    void main() {
      // the v1 title's palette, kept: sky blue to meadow, a sun low and centred
      vec3 top = lin(vec3(0.31, 0.70, 0.91));
      vec3 mid = lin(vec3(0.53, 0.84, 0.96));
      vec3 low = lin(vec3(0.71, 0.93, 0.77));
      float y = vUv.y;
      vec3 c = mix(low, mid, smoothstep(0.0, 0.55, y));
      c = mix(c, top, smoothstep(0.55, 1.0, y));
      vec2 p = (vUv - vec2(0.5, 0.36)) * vec2(uAspect, 1.0);
      float a = atan(p.y, p.x) + uTime * 0.05;
      float rays = step(0.5, fract(a / 6.2831853 * 30.0));
      float fall = smoothstep(1.6, 0.0, length(p));
      c += rays * 0.07 * fall;
      c += lin(vec3(1.0, 0.91, 0.54)) * smoothstep(0.75, 0.0, length(p)) * 0.55;
      gl_FragColor = vec4(c, 1.0);
    }`,
};

export class Showcase {
  constructor(material, archetypes, seed = 7) {
    this.root = new THREE.Group();
    this.kat = new Katamari(material, 0.03);
    this.kat.reset(0.03, { x: 0, y: -0.03, z: 0 });
    this.kat.pos.set(0, 0, 0);
    this.kat.group.position.set(0, 0, 0);
    this.root.add(this.kat.group);

    const rnd = makeRng(seed);
    const pool = archetypes
      .filter((p) => p.tags.includes('house') && !p.scenery && p.pickup < 0.5)
      .sort((a, b) => a.pickup - b.pickup);
    // roll it up: always something between a sixth and a half of the ball's size
    const target = 0.42;
    const dir = new THREE.Vector3();
    let guard = 0;
    while (this.kat.radius < target && guard++ < 4000) {
      const d = this.kat.diameter;
      const fits = pool.filter((p) => p.pickup > d * 0.12 && p.pickup < d * 0.5);
      const choices = fits.length ? fits : pool.filter((p) => p.pickup < d * 0.5);
      if (!choices.length) break;
      const arch = choices[Math.floor(rnd() * choices.length)];
      dir.set(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize().multiplyScalar(this.kat.radius);
      this.kat.attach(arch, dir, Math.floor(rnd() * arch.geos.length), rnd() * 6.28, rnd);
    }
    this.kat.layoutAttached();
    this.kat.group.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });

    this.sky = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
      ...SKY, depthTest: false, depthWrite: false,
    }));
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    this.root.add(this.sky);
    this.t = 0;
  }

  get radius() { return this.kat.radius; }

  /** Turn the ball, drift the rays, and hold the camera on the composition. */
  update(dt, camera) {
    this.t += dt;
    const sp = this.kat.spinner;
    sp.rotation.x += dt * 0.22;
    sp.rotation.z = Math.sin(this.t * 0.31) * 0.25;
    this.kat.group.rotation.y = Math.sin(this.t * 0.17) * 0.35;
    this.sky.material.uniforms.uTime.value = this.t;
    this.sky.material.uniforms.uAspect.value = camera.aspect;

    const R = this.kat.radius;
    if (camera.aspect >= 1.2 && this._viewH(camera) >= 520) {
      /* WIDE: the hero shot. The ball whole, in the middle of the screen,
         between the logo above and the buttons below (see the matching
         media query in styles.css). The look point sits a little above the
         ball's centre so the ball lands just under the middle of the frame,
         where the gap between logo and buttons is. */
      // shorter windows have a shorter gap between logo and buttons: back off
      const back = Math.min(1.6, Math.max(1, 760 / this._viewH()));
      camera.position.set(0, R * 0.9 * back, R * 6.4 * back);
      camera.lookAt(0, R * 0.05, 0);
    } else {
      /* NARROW: "planet rising" — the ball sits low and fills the bottom of
         the frame, the stacked buttons float over the sky above it. */
      const portrait = camera.aspect < 1;
      const dist = R * (portrait ? 3.4 : 2.5);
      camera.position.set(0, R * 1.0, dist);
      camera.lookAt(0, R * (portrait ? 2.35 : 2.1), 0);
    }
    camera.near = R * 0.05; camera.far = R * 40;
    camera.updateProjectionMatrix();
  }

  /** CSS pixel height of the view, to match the stylesheet's min-height. */
  _viewH() { return typeof window !== 'undefined' ? window.innerHeight : 900; }

  set visible(v) { this.root.visible = v; }
  get visible() { return this.root.visible; }
}
