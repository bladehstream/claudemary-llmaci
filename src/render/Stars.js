/* ============================================================
   A starfield for the night skies.

   The dark stages — quantum, atom, solar, galaxy, universe — had a
   two-colour gradient for a sky, which at night is a flat black
   lid. A few thousand points on the dome, varied in size, colour
   and brightness, with a slow twinkle, is what makes "dark" read as
   "deep" rather than "unlit".

   It is a child of Scene's sky dome, so it rides with the camera and
   scales with the draw distance exactly as the dome does; it never
   gets closer and never parallaxes, which is right for things this
   far away. Drawn transparent and depth-TESTED (with log depth, see
   render/Fx.js for why a ShaderMaterial needs the chunks), so it
   shows only where nothing else has been drawn.

   Placement is a fixed hash, not Math.random: the same sky every
   time, and nothing here can touch a stage's RNG.
   ============================================================ */

import * as THREE from 'three';

const N = 3200;

const VERT = /* glsl */`
  attribute float aSize;
  attribute float aPhase;
  attribute vec3 aColor;
  uniform float uTime;
  uniform float uPR;
  varying vec3 vColor;
  varying float vTw;
  #include <common>
  #include <logdepthbuf_pars_vertex>
  void main() {
    vColor = aColor;
    // most stars hold steady; the bright ones scintillate a little
    vTw = 0.82 + 0.18 * sin(uTime * (0.7 + fract(aPhase * 7.31) * 2.3) + aPhase * 6.2831);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aSize * uPR;
    #include <logdepthbuf_vertex>
  }`;

const FRAG = /* glsl */`
  uniform float uFade;
  varying vec3 vColor;
  varying float vTw;
  #include <common>
  #include <logdepthbuf_pars_fragment>
  void main() {
    #include <logdepthbuf_fragment>
    float r = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, r);
    a = pow(a, 1.5) * vTw * uFade;
    if (a < 0.01) discard;
    gl_FragColor = vec4(vColor * a, a);
  }`;

function hash(i, k) {
  let h = (Math.imul(i, 374761393) + Math.imul(k, 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const TINTS = [
  [1.0, 1.0, 1.0], [0.78, 0.86, 1.0], [0.68, 0.78, 1.0],
  [1.0, 0.94, 0.8], [1.0, 0.85, 0.66], [1.0, 0.74, 0.62],
];

export function makeStars() {
  const pos = new Float32Array(N * 3);
  const col = new Float32Array(N * 3);
  const size = new Float32Array(N);
  const phase = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    // uniform on the sphere, biased upward: below the horizon is mostly floor
    const u = hash(i, 1) * 1.15 - 0.15;
    const th = hash(i, 2) * Math.PI * 2;
    const s = Math.sqrt(Math.max(0, 1 - u * u));
    pos[i * 3] = Math.cos(th) * s * 0.98;
    pos[i * 3 + 1] = u * 0.98;
    pos[i * 3 + 2] = Math.sin(th) * s * 0.98;
    // a steep magnitude curve: a handful of bright stars, a sea of faint ones
    const m = Math.pow(hash(i, 3), 7);
    size[i] = 1.6 + m * 5.0;
    const b = 0.5 + 0.8 * Math.pow(hash(i, 4), 2.0) + m * 0.8;
    const t = TINTS[(hash(i, 5) * TINTS.length) | 0];
    col[i * 3] = t[0] * b; col[i * 3 + 1] = t[1] * b; col[i * 3 + 2] = t[2] * b;
    phase[i] = hash(i, 6);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  g.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG,
    uniforms: { uTime: { value: 0 }, uPR: { value: 1 }, uFade: { value: 1 } },
    transparent: true, depthWrite: false, depthTest: true,
    blending: THREE.AdditiveBlending, fog: false,
  });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  pts.renderOrder = -0.5;
  pts.visible = false;
  return pts;
}
