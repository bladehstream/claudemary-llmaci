/* ============================================================
   Renderer, lights, sky dome, the shared material, and the
   post-processing stack.

   Everything in the game — terrain, props, the katamari — still
   shares ONE material with vertexColors, so a change of look is a
   change here and nowhere else. What changed in v2 is what that
   material is lit BY:

   - MeshStandardMaterial instead of Lambert, so surfaces pick up a
     per-stage image-based environment (`_buildEnv`) instead of one
     flat hemisphere colour for the whole game.
   - Neutral tone mapping, so a lit white wall stops clipping and the
     toy palette keeps its saturation (ACES and AgX both desaturate
     brights, which is wrong for a game that is mostly bright paint).
   - Screen-space ambient occlusion (N8AO), which is where most of the
     "it looks like a 2010 web demo" went: nothing sat ON anything,
     because nothing darkened where two things met.
   - Bloom on night stages, a small grade and vignette, SMAA.

   v1 was only ever looked at through swiftshader at about a frame a
   second. `tools/look.mjs` photographs this on a real GPU.
   ============================================================ */

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { N8AOPass } from 'n8ao';
import { clamp, damp } from '../util/math.js';
import { makeStars } from './Stars.js';
import { makeNebula, setNebula } from './Nebula.js';


/* Saturation, contrast, vignette and the tone curve, in linear light.

   ⚠ THE TONE CURVE IS OURS, NOT THREE'S, AND THE REASON IS MEASURED. Khronos
   PBR Neutral was the first choice — it keeps a toy palette's saturation where
   ACES and AgX bleach it — but it also subtracts a black-level offset of up to
   0.04, which is right for photoreal PBR and ruinous here: `tools/probe-light`
   put the galaxy floor at 37,35,37 untonemapped and 11,6,12 through Neutral, a
   six-fold crush of exactly the dark stages a player already reported as
   "black on black". This is Neutral's highlight SHOULDER with no toe, so
   everything below ~0.76 renders exactly as v1 did and only highlights roll. */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    saturation: { value: 1.0 },
    contrast: { value: 1.03 },
    vignette: { value: 0.22 },
    aspect: { value: 1.6 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float saturation, contrast, vignette, aspect;
    varying vec2 vUv;
    vec3 shoulder(vec3 color) {
      const float start = 0.76;
      const float desat = 0.15;
      float peak = max(color.r, max(color.g, color.b));
      if (peak < start) return color;
      float d = 1.0 - start;
      float newPeak = 1.0 - d * d / (peak + d - start);
      color *= newPeak / peak;
      float g = 1.0 - 1.0 / (desat * (peak - newPeak) + 1.0);
      return mix(color, vec3(newPeak), g);
    }
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      c.rgb = mix(vec3(l), c.rgb, saturation);
      // contrast about a mid-grey in linear terms (0.18), so it does not shift exposure
      c.rgb = max(vec3(0.0), (c.rgb - 0.18) * contrast + 0.18);
      vec2 d = (vUv - 0.5) * vec2(aspect, 1.0);
      float v = smoothstep(0.95, 0.25, length(d) * 0.9);
      c.rgb *= mix(1.0 - vignette, 1.0, v);
      c.rgb = shoulder(c.rgb);
      gl_FragColor = c;
    }`,
};

/** Relative luminance of a hex colour, sRGB-encoded in, 0..1 out. */
function lum(hex) {
  const c = new THREE.Color(hex);   // three stores it linear
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
}

export class Scene {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,                // used by the 'low' path only; post uses SMAA
      powerPreference: 'high-performance',
      logarithmicDepthBuffer: true,   // the katamari spans 5cm .. 300m; N8AO handles it
      stencil: false,
    });
    this.renderer.setClearColor(0x8fd4f0);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    /* No three tone mapping at all — see GradeShader. The 'low' path renders
       straight to the canvas and so clips exactly as v1 did. */
    this.renderer.toneMapping = THREE.NoToneMapping;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(58, 1, 0.01, 6000);

    this.material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      side: THREE.FrontSide,
      flatShading: false,
      roughness: 0.74,
      metalness: 0.0,
      envMapIntensity: 0.55,
    });
    this._installDetail(this.material);

    /* ---- lighting ----
       ⚠ v1's light COLOURS are kept on purpose. Every stage's palette — and the
       whole contrast fix for the space stages — was tuned under a cool blue
       hemisphere and a warm sun. Retinting the hemisphere from each stage's sky
       was tried first and turned the galaxy floor brown: its navy had been coming
       from the hemisphere all along, not from the floor's own colour. Lambert and
       Standard share the same diffuse term, so the intensities carry over too;
       the hemisphere only gives up the share the environment map now supplies. */
    this.hemi = new THREE.HemisphereLight(0xdff0ff, 0x6f8a55, 0.85);
    this.scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight(0xfff4dd, 1.05);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.02;
    this.sun.shadow.radius = 3;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    this.fill = new THREE.DirectionalLight(0xbcd9ff, 0.32);
    this.fill.position.set(-0.6, 0.5, -0.7);
    this.scene.add(this.fill);

    /* ---- sky dome ---- */
    const skyGeo = new THREE.SphereGeometry(1, 32, 20);
    const cnt = skyGeo.attributes.position.count;
    skyGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(cnt * 3), 3));
    this.skyGeo = skyGeo;
    this.sky = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({
      vertexColors: true, side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false,
    }));
    this.sky.renderOrder = -1;
    this.sky.frustumCulled = false;
    this.scene.add(this.sky);
    // a starfield on the dome, shown on the night stages only (render/Stars.js)
    this.stars = makeStars();
    this.sky.add(this.stars);
    // and a nebula band across it, on the stages whose sky asks for one (render/Nebula.js)
    this.nebula = makeNebula();
    this.sky.add(this.nebula);

    this.scene.fog = new THREE.Fog(0xdff0e4, 40, 200);

    this._pmrem = new THREE.PMREMGenerator(this.renderer);
    this._env = null;
    this._night = false;

    this.shadowRadius = 12;
    this.quality = 'med';
    this.shadowsOn = true;
    this._fov = 58;
    this.post = null;
    this.resize();
  }

  /* ------------------------------------------------------------
     Post-processing
     ------------------------------------------------------------ */

  /**
   * Build (or tear down) the composer for the current quality tier.
   *
   *   low  — no composer at all. Phones default here; it is v1's forward render
   *          with the new material and tone mapping, which costs nothing extra.
   *   med  — AO at half resolution, grade, SMAA.
   *   high — AO at full resolution with the Medium preset, bloom, grade, SMAA.
   */
  _buildPost() {
    if (this.post) {
      this.post.composer.dispose?.();
      this.post.ao.dispose?.();
      this.post = null;
    }
    if (this.quality === 'low') return;

    const w = Math.max(1, this.canvas.clientWidth || window.innerWidth);
    const h = Math.max(1, this.canvas.clientHeight || window.innerHeight);
    const composer = new EffectComposer(this.renderer);

    const ao = new N8AOPass(this.scene, this.camera, w, h);
    ao.configuration.gammaCorrection = false;     // OutputPass does it
    ao.configuration.halfRes = this.quality !== 'high';
    ao.setQualityMode(this.quality === 'high' ? 'Medium' : 'Low');
    ao.configuration.aoRadius = 0.12;
    ao.configuration.distanceFalloff = 1.0;
    ao.configuration.intensity = 2.0;
    ao.configuration.color = new THREE.Color(0x1a1830);
    composer.addPass(ao);

    let bloom = null;
    /* Bloom on 'med' too, at a third of the resolution: since parts can glow
       (render/geom.js) bloom is what makes the luminous stages luminous, and
       'med' is what every desktop gets by default. Phones default to 'low',
       which has no post at all. */
    if (this.quality !== 'low') {
      const div = this.quality === 'high' ? 2 : 3;
      bloom = new UnrealBloomPass(new THREE.Vector2(w / div, h / div), 0.2, 0.55, 0.95);
      composer.addPass(bloom);
    }

    const grade = new ShaderPass(GradeShader);
    composer.addPass(grade);
    composer.addPass(new OutputPass());
    const pr = this.renderer.getPixelRatio();
    composer.addPass(new SMAAPass(w * pr, h * pr));

    this.post = { composer, ao, bloom, grade };
    this._applyNight();
    this.resize();
  }

  /** Night stages get more bloom and a darker AO tint; day stages almost none. */
  _applyNight() {
    if (!this.post) return;
    if (this.post.bloom) {
      this.post.bloom.strength = this._night ? 0.55 : 0.14;
      this.post.bloom.threshold = this._night ? 0.72 : 0.98;
    }
    this.post.ao.configuration.color = new THREE.Color(this._night ? 0x000000 : 0x1a1830);
    this.post.grade.uniforms.vignette.value = this._night ? 0.3 : 0.2;
  }

  /* ------------------------------------------------------------
     Environment
     ------------------------------------------------------------ */

  /**
   * An image-based environment built from the stage's own sky, so every
   * surface is lit by the colours actually around it: blue from above in the
   * city, violet in the atom, almost nothing in deep space. A bright patch in
   * the sun's direction gives glossy-ish surfaces a highlight to catch.
   */
  _buildEnv(top, bottom) {
    const s = new THREE.Scene();
    const g = new THREE.SphereGeometry(1, 32, 16);
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    const cTop = new THREE.Color(top), cBot = new THREE.Color(bottom);
    const ground = cBot.clone().multiplyScalar(0.45);
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const y = g.attributes.position.getY(i);
      if (y >= 0) c.copy(cBot).lerp(cTop, Math.pow(y, 0.6));
      else c.copy(cBot).lerp(ground, Math.min(1, -y * 3));
      col.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    s.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));

    const dir = this._sunDir || new THREE.Vector3(0.5, 1, 0.35).normalize();
    const spot = new THREE.Mesh(
      new THREE.CircleGeometry(0.22, 24),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.96, 0.88).multiplyScalar(this._night ? 1.5 : 5) }),
    );
    spot.position.copy(dir).multiplyScalar(0.9);
    spot.lookAt(0, 0, 0);
    s.add(spot);

    const rt = this._pmrem.fromScene(s, 0.02);
    if (this._env) this._env.dispose();
    this._env = rt;
    this.scene.environment = rt.texture;
    g.dispose();
  }

  /** Paint the sky dome's vertical gradient. */
  _paintDome(cTop, cBot) {
    const pos = this.skyGeo.attributes.position;
    const col = this.skyGeo.attributes.color;
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const t = clamp((pos.getY(i) + 0.25) / 1.05, 0, 1);
      c.copy(cBot).lerp(cTop, Math.pow(t, 0.75));
      col.setXYZ(i, c.r, c.g, c.b);
    }
    col.needsUpdate = true;
  }

  setSky({ top, bottom, fog, fogNear, fogFar, nebula }) {
    this._fogBase = { near: fogNear, far: fogFar };
    this._night = lum(top) < 0.02 && lum(bottom) < 0.06;
    this._paintDome(new THREE.Color(top), new THREE.Color(bottom));
    // a new sky ends any dusk the last stage had going (see setDusk)
    this._dusk = null;
    this.detail.glow.value = 1;
    this.sun.color.set(0xfff4dd);
    this.hemi.color.set(0xdff0ff);
    this.scene.fog.color.set(fog);
    this.scene.fog.near = fogNear;
    this.scene.fog.far = fogFar;
    this.renderer.setClearColor(fog);

    /* A night sky's environment map is black, so it supplies none of the ambient
       the hemisphere gave up — night stages keep v1's full hemisphere. */
    this.hemi.intensity = this._night ? 1.15 : 0.85;
    this.material.envMapIntensity = this._night ? 0.6 : 0.45;
    this.stars.visible = this._night;
    setNebula(this.nebula, nebula);
    this._skyCols = { top, bottom };
    this._buildEnv(top, bottom);
    this._applyNight();
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

  /**
   * Slide a day sky toward dusk: t = 0 is the stage's own sky and sun, t = 1 is
   * `dusk` ({ top, bottom, fog, sun, sunColor, glowDay }). Self-lit parts (the
   * city's lit windows, its stadium floodlights) come up with it, from
   * `glowDay` of their strength in full daylight to all of it at dusk.
   *
   * Cheap enough per frame — a 693-vertex dome repaint and a few colour
   * lerps, skipped unless t moved by a 48th — except the environment map,
   * which is a PMREM bake and so is redone only every tenth of the way.
   */
  setDusk(t, dusk, day) {
    const q = Math.round(clamp(t, 0, 1) * 48) / 48;
    if (this._dusk && this._dusk.q === q) return;
    const envStep = Math.round(q * 10);
    const rebake = !this._dusk || this._dusk.env !== envStep;
    this._dusk = { q, env: envStep };
    const mix = (a, b) => new THREE.Color(a).lerp(new THREE.Color(b), q);
    const top = mix(day.sky.top, dusk.top), bottom = mix(day.sky.bottom, dusk.bottom);
    this._paintDome(top, bottom);
    this.scene.fog.color.copy(mix(day.sky.fog, dusk.fog));
    this.renderer.setClearColor(this.scene.fog.color);
    this.sun.intensity = THREE.MathUtils.lerp(day.sun.intensity, dusk.sun, q);
    this.sun.color.copy(mix(0xfff4dd, dusk.sunColor));
    this.hemi.intensity = THREE.MathUtils.lerp(0.85, 0.42, q);
    this.hemi.color.copy(mix(0xdff0ff, 0x8a8ac8));
    this.material.envMapIntensity = THREE.MathUtils.lerp(0.45, 0.25, q);
    this.detail.glow.value = THREE.MathUtils.lerp(dusk.glowDay ?? 0.15, 1, q);
    if (this.post?.bloom) {
      // the day setting (see _applyNight) easing toward a soft night bloom
      this.post.bloom.strength = THREE.MathUtils.lerp(0.14, 0.4, q);
      this.post.bloom.threshold = THREE.MathUtils.lerp(0.98, 0.8, q);
    }
    if (rebake) this._buildEnv(top.getHex(), bottom.getHex());
  }

  setSun(dir, intensity) {
    this._sunDir = new THREE.Vector3(dir.x, dir.y, dir.z).normalize();
    this.sun.intensity = intensity;
    /* `Game.loadStage` calls setSky BEFORE setSun, so the environment's sun
       patch would otherwise point where the PREVIOUS stage's sun was. */
    if (this._skyCols) this._buildEnv(this._skyCols.top, this._skyCols.bottom);
  }

  setQuality(q) {
    this.quality = q;
    const dpr = window.devicePixelRatio || 1;
    const cap = q === 'low' ? 1 : q === 'med' ? 1.5 : 2;
    this.renderer.setPixelRatio(Math.min(dpr, cap));
    this.sun.shadow.mapSize.set(q === 'low' ? 1024 : q === 'med' ? 2048 : 4096,
      q === 'low' ? 1024 : q === 'med' ? 2048 : 4096);
    if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    this._buildPost();
    this.resize();
  }

  setShadows(on) {
    this.shadowsOn = on;
    this.renderer.shadowMap.enabled = on;
    this.sun.castShadow = on;
    this.scene.traverse((o) => { if (o.isMesh || o.isInstancedMesh) o.castShadow = on && o.userData.wantsShadow !== false; });
  }

  /**
   * Keep the shadow frustum tight around the katamari as it grows — and the
   * AO radius with it. AO is a world-space effect and this game spans forty
   * orders of magnitude, so a fixed radius is right at exactly one ball size
   * and either an edge detector or a grey smear everywhere else.
   */
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
    if (this.post) this.post.ao.configuration.aoRadius = Math.max(1e-6, radius * 1.4);
    this.detail.level.value = Math.log(Math.max(1e-9, radius)) / Math.log(4);
  }

  /* ------------------------------------------------------------
     Surface detail
     ------------------------------------------------------------ */

  /**
   * Every surface in v1 was one flat vertex colour, which is most of why the
   * game read as a 2010 web demo: a floor is a single swatch of tan from your
   * feet to the far wall. This modulates albedo by a few percent with 3D value
   * noise in WORLD space, so nothing needs UVs and every existing prop gets it.
   *
   * ⚠ THE SCALE PROBLEM, AND WHY IT IS SOLVED THIS WAY. The ball grows by two
   * orders of magnitude inside one stage. Noise at a fixed world scale is either
   * invisible at the start or a shimmering sub-pixel mess by the end; noise
   * scaled to the CURRENT ball size swims across every surface as you grow. So
   * the octaves sit at fixed powers of four in world space — they never move —
   * and only their WEIGHTS follow the ball (`level`, log4 of the radius), with
   * a cross-fade between neighbours. Plus an fwidth fade, so an octave finer
   * than a pixel contributes nothing rather than aliasing.
   */
  _installDetail(mat) {
    this.detail = { level: { value: 0 }, amp: { value: 0.055 }, glow: { value: 1 } };
    const u = this.detail;
    /* GLOW (see render/geom.js): geometry that has an `emis` attribute adds
       it to the emissive term. Geometry without one — every Blender model,
       most props — reads the default below, which is zero. Set explicitly
       rather than trusting the GL default, because a disabled attribute keeps
       whatever generic value its location last had. */
    mat.defaultAttributeValues = { ...(mat.defaultAttributeValues || {}), emis: [0, 0, 0] };
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uDetailLevel = u.level;
      sh.uniforms.uDetailAmp = u.amp;
      sh.uniforms.uGlow = u.glow;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>
          attribute vec3 emis;
          varying vec3 vEmis;
          varying vec3 vDetailPos;`)
        .replace('#include <project_vertex>', `#include <project_vertex>
          vEmis = emis;
          vec4 dWorld = vec4( transformed, 1.0 );
          #ifdef USE_INSTANCING
            dWorld = instanceMatrix * dWorld;
          #endif
          vDetailPos = ( modelMatrix * dWorld ).xyz;`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
          varying vec3 vEmis;
          uniform float uGlow;
          varying vec3 vDetailPos;
          uniform float uDetailLevel;
          uniform float uDetailAmp;
          float dHash( vec3 p ) { p = fract( p * 0.3183099 + 0.1 ); p *= 17.0; return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) ); }
          float dNoise( vec3 x ) {
            vec3 i = floor( x ); vec3 f = fract( x ); f = f * f * ( 3.0 - 2.0 * f );
            return mix( mix( mix( dHash( i ), dHash( i + vec3(1,0,0) ), f.x ),
                             mix( dHash( i + vec3(0,1,0) ), dHash( i + vec3(1,1,0) ), f.x ), f.y ),
                        mix( mix( dHash( i + vec3(0,0,1) ), dHash( i + vec3(1,0,1) ), f.x ),
                             mix( dHash( i + vec3(0,1,1) ), dHash( i + vec3(1,1,1) ), f.x ), f.y ), f.z );
          }
          // one octave at world period 4^k, faded out once it is finer than ~2px
          float dOct( vec3 p, vec3 fw, float k ) {
            float period = pow( 4.0, k );
            vec3 q = p / period;
            float px = length( fw ) / period;
            return ( dNoise( q ) - 0.5 ) * ( 1.0 - smoothstep( 0.25, 0.6, px ) );
          }`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          {
            float L = floor( uDetailLevel );
            float t = uDetailLevel - L;
            // three octaves around the ball's own scale: coarse blotches a few
            // ball-widths across, the ball's size, and grain a quarter of it
            // fwidth ONCE, outside any branch: derivatives inside the octave
            // calls compile to "gradient in a loop" on D3D and are undefined
            vec3 fw = fwidth( vDetailPos );
            float n = 0.0;
            n += mix( dOct( vDetailPos, fw, L + 1.0 ), dOct( vDetailPos, fw, L + 2.0 ), t ) * 0.8;
            n += mix( dOct( vDetailPos, fw, L ),       dOct( vDetailPos, fw, L + 1.0 ), t ) * 0.6;
            n += mix( dOct( vDetailPos, fw, L - 1.0 ), dOct( vDetailPos, fw, L ),       t ) * 0.35;
            diffuseColor.rgb *= 1.0 + n * uDetailAmp * 2.0;
          }`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          totalEmissiveRadiance += vEmis * uGlow;`);
    };
    mat.customProgramCacheKey = () => 'detail-v2';
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
    if (this.post) {
      this.post.composer.setPixelRatio(this.renderer.getPixelRatio());
      this.post.composer.setSize(w, h);
      /* 'med' bloom runs a size down: it is a blur, and a blur does not need
         the pixels. The composer has just set it to full size, so shrink it
         back after. */
      if (this.post.bloom && this.quality === 'med') {
        const pr = this.renderer.getPixelRatio();
        this.post.bloom.setSize(Math.round((w * pr) / 1.5), Math.round((h * pr) / 1.5));
      }
      this.post.grade.uniforms.aspect.value = w / Math.max(1, h);
    }
  }

  render() {
    if (this.stars.visible) {
      const u = this.stars.material.uniforms;
      u.uTime.value = performance.now() / 1000;
      u.uPR.value = this.renderer.getPixelRatio();
    }
    if (this.post) this.post.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }
}
