/* ============================================================
   A nebula band across the night skies.

   The starfield (render/Stars.js) made the dark stages read as deep
   rather than unlit, but a sky of evenly spread points is still a
   wallpaper: nothing in it says which way is which. A galaxy seen from
   inside it is a BAND — a soft glowing river across the sky with dark
   dust running down its middle — and that is what this draws: one great
   circle of fbm-noise cloud in two colours, a ragged dust lane along its
   centre line, and a few brighter knots.

   Each stage that wants one says so in its sky: `sky.nebula = { a, b,
   tilt, yaw, width, strength }` (colours as hex). No `nebula`, no
   band. Like the stars it is a child of Scene's sky dome, so it rides
   with the camera at the dome's scale, never parallaxes, and draws
   additively and depth-tested so it shows only where nothing else is.

   All of it is a pure function of the direction on the dome — no
   textures, no Math.random, nothing that can touch a stage's RNG.
   ============================================================ */

import * as THREE from 'three';

const VERT = /* glsl */`
  varying vec3 vDir;
  #include <common>
  #include <logdepthbuf_pars_vertex>
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    #include <logdepthbuf_vertex>
  }`;

const FRAG = /* glsl */`
  uniform vec3 uA, uB;
  uniform vec3 uAxis;      // the band's pole: the band is the great circle round it
  uniform float uWidth, uStrength;
  varying vec3 vDir;
  #include <common>
  #include <logdepthbuf_pars_fragment>

  float h3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
  float vnoise(vec3 p) {
    vec3 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  float fbm(vec3 p) {
    float s = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = p * 2.03 + 11.7; a *= 0.5; }
    return s;
  }

  void main() {
    #include <logdepthbuf_fragment>
    vec3 d = normalize(vDir);
    // signed distance from the band's centre line, wobbled so it meanders
    float off = dot(d, uAxis) + (fbm(d * 2.2) - 0.5) * uWidth * 0.9;
    float band = exp(-pow(off / uWidth, 2.0));
    float cloud = fbm(d * 5.0 + 3.1);
    float fine = fbm(d * 14.0 - 7.3);
    float body = band * smoothstep(0.28, 0.75, cloud * 0.75 + fine * 0.35);
    // the dust lane: a ragged dark ribbon down the middle of the band
    float lane = exp(-pow((off + (fine - 0.5) * uWidth * 0.25) / (uWidth * 0.22), 2.0));
    float dust = lane * smoothstep(0.35, 0.65, fbm(d * 8.0 + 21.0));
    // a few bright knots, only inside the cloud
    float knots = smoothstep(0.78, 0.92, fbm(d * 9.0 + 41.0)) * band;
    vec3 col = mix(uA, uB, smoothstep(0.3, 0.7, fbm(d * 3.0 + 9.0)));
    vec3 c = col * body * (1.0 - 0.85 * dust) + mix(col, vec3(1.0), 0.5) * knots * 0.6;
    // fade toward the horizon, which is mostly floor and fog anyway
    c *= smoothstep(-0.12, 0.25, d.y);
    c *= uStrength;
    if (max(c.r, max(c.g, c.b)) < 0.002) discard;
    gl_FragColor = vec4(c, 1.0);
  }`;

export function makeNebula() {
  const g = new THREE.SphereGeometry(0.96, 96, 48);
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG,
    uniforms: {
      uA: { value: new THREE.Color() }, uB: { value: new THREE.Color() },
      uAxis: { value: new THREE.Vector3(0, 1, 0) }, uWidth: { value: 0.2 }, uStrength: { value: 1 },
    },
    side: THREE.BackSide, transparent: true, depthWrite: false, depthTest: true,
    blending: THREE.AdditiveBlending, fog: false, toneMapped: false,
  });
  const m = new THREE.Mesh(g, mat);
  m.frustumCulled = false;
  m.renderOrder = -0.75;      // over the dome, under the stars
  m.visible = false;
  return m;
}

/** Point the band at a stage's `sky.nebula`, or hide it when there is none. */
export function setNebula(mesh, n) {
  mesh.visible = !!n;
  if (!n) return;
  const u = mesh.material.uniforms;
  u.uA.value.set(n.a);
  u.uB.value.set(n.b);
  // the band's pole: tilted off vertical by `tilt`, swung round by `yaw`
  const tilt = n.tilt ?? 1.1, yaw = n.yaw ?? 0.6;
  u.uAxis.value.set(Math.sin(tilt) * Math.cos(yaw), Math.cos(tilt), Math.sin(tilt) * Math.sin(yaw)).normalize();
  u.uWidth.value = n.width ?? 0.2;
  u.uStrength.value = n.strength ?? 0.6;
}
