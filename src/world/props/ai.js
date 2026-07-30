/* ============================================================
   Easter eggs — the machine-learning shelf.

   These are scattered through all three stages by the normal
   size-band scatter, so you meet them at whatever scale they
   belong to: a token you can roll up in the first ten seconds,
   a data centre you eat somewhere north of forty metres.
   ============================================================ */

import { defineProp } from './index.js';
import { C, SETS } from '../../render/palette.js';

const P = defineProp;

/* ---------------------------------------------------------- *
   Desk scale
 * ---------------------------------------------------------- */

P({ id: 'token', name: 'Token', cat: 'ai', tags: ['house'], fill: 0.6, variants: 4, weight: 4,
  build(b, r, v) {
    const col = [C.orange, C.teal, C.violet, C.lime][v];
    b.boxOn(0.011, 0.011, 0.011, col, {});
    b.box(0.0125, 0.005, 0.0125, C.white, { y: 0.0055 });
  } });

P({ id: 'paperclip_opt', name: 'Suspiciously Optimal Paperclip', cat: 'ai', tags: ['house'], fill: 0.14, weight: 1,
  build(b) {
    const t = 0.0007;
    b.box(0.034, t * 2, 0.0045, C.gold, { y: t });
    b.box(0.034, t * 2, 0.0045, C.gold, { y: t, z: 0.005 });
    b.box(t * 2, t * 2, 0.005, C.gold, { x: 0.017, y: t, z: 0.0025 });
    b.box(0.024, t * 2, 0.0045, C.gold, { x: -0.005, y: t * 3, z: 0.0025 });
    b.sphere(0.0022, C.lemon, { x: -0.017, y: t * 3, z: 0.0025 }, 6, 5);
  } });

P({ id: 'usb_stick', name: 'USB Stick', cat: 'ai', tags: ['house'], fill: 0.7, variants: 3, weight: 3,
  build(b, r, v) {
    b.boxOn(0.019, 0.009, 0.042, [C.charcoal, C.red, C.teal][v], {});
    b.boxOn(0.012, 0.005, 0.016, C.steel, { y: 0.002, z: 0.028 });
    b.box(0.008, 0.006, 0.0015, C.charcoal, { y: 0.0045, z: 0.03 });
  } });

P({ id: 'mech_keyboard', name: 'Mechanical Keyboard', cat: 'ai', tags: ['house'], fill: 0.55, weight: 3,
  build(b, r) {
    b.boxOn(0.36, 0.026, 0.135, C.charcoal, {});
    for (let row = 0; row < 5; row++) {
      for (let k = 0; k < 14; k++) {
        const w = row === 4 && k === 6 ? 0.09 : 0.019;
        if (row === 4 && k > 6 && k < 12) continue;
        b.box(w, 0.008, 0.019, r() < 0.08 ? C.orange : C.lightgrey,
          { x: -0.165 + k * 0.0245 + (row === 4 && k === 6 ? 0.03 : 0), y: 0.03, z: -0.05 + row * 0.023 });
      }
    }
    b.box(0.03, 0.006, 0.008, C.lime, { x: 0.15, y: 0.031, z: -0.058 });
  } });

P({ id: 'gpu_card', name: 'Graphics Card', cat: 'ai', tags: ['house', 'town'], fill: 0.5, weight: 3,
  build(b) {
    b.box(0.28, 0.11, 0.042, C.charcoal, { y: 0.06 });
    b.box(0.29, 0.005, 0.05, C.steelDark, { y: 0.118 });
    for (const x of [-0.07, 0.07]) {
      b.cyl(0.036, 0.036, 0.016, C.darkgrey, { x, y: 0.06, z: 0.026, rx: Math.PI / 2 }, 12);
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        b.box(0.03, 0.004, 0.012, C.grey, { x: x + Math.cos(a) * 0.017, y: 0.06 + Math.sin(a) * 0.017, z: 0.03, rz: a });
      }
    }
    b.box(0.012, 0.09, 0.05, C.steel, { x: -0.146, y: 0.06 });
    b.box(0.09, 0.012, 0.05, C.gold, { x: 0.02, y: 0.006 });
    b.box(0.06, 0.014, 0.008, C.lime, { x: 0.06, y: 0.122 });
  } });

P({ id: 'smart_speaker', name: 'Smart Speaker', cat: 'ai', tags: ['house'], fill: 0.6, variants: 2, weight: 3,
  build(b, r, v) {
    b.taperOn(0.052, 0.058, 0.14, v ? C.lightgrey : C.charcoal, {}, 14);
    b.cylOn(0.05, 0.012, C.darkgrey, { y: 0.14 }, 14);
    b.torus(0.044, 0.005, C.cyan, { y: 0.153, rx: Math.PI / 2 }, 5, 16);
  } });

P({ id: 'plush_assistant', name: 'Plush Assistant', cat: 'ai', tags: ['house'], fill: 0.45, variants: 3, weight: 3,
  build(b, r, v) {
    const col = [C.orange, C.tangerine, C.cream][v];
    b.ellip(0.062, 0.07, 0.055, col, { y: 0.072 }, 12, 9);
    b.sphere(0.055, col, { y: 0.155 }, 12, 9);
    for (const s of [-1, 1]) {
      b.ellip(0.022, 0.038, 0.02, col, { x: s * 0.068, y: 0.08, rz: s * 0.3 }, 8, 6);
      b.sphere(0.011, C.charcoal, { x: s * 0.02, y: 0.166, z: 0.046 }, 8, 6);
      b.ellip(0.018, 0.02, 0.012, col, { x: s * 0.04, y: 0.196 }, 8, 6);
    }
    b.ellip(0.016, 0.009, 0.01, C.charcoal, { y: 0.142, z: 0.05 }, 8, 6);
  } });

P({ id: 'robot_vacuum', name: 'Robot Vacuum', cat: 'ai', tags: ['house'], fill: 0.65, weight: 3,
  build(b) {
    b.cylOn(0.17, 0.075, C.charcoal, {}, 20);
    b.cylOn(0.165, 0.012, C.darkgrey, { y: 0.075 }, 20);
    b.cyl(0.05, 0.05, 0.03, C.steelDark, { y: 0.086 }, 14);
    b.box(0.05, 0.008, 0.014, C.cyan, { y: 0.09, z: 0.09 });
    b.cyl(0.03, 0.03, 0.008, C.lime, { x: 0.08, y: 0.088 }, 10);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      b.box(0.07, 0.004, 0.008, C.lightgrey, { x: -0.13 + Math.cos(a) * 0.03, y: 0.006, z: Math.sin(a) * 0.03, ry: a });
    }
  } });

/* ---------------------------------------------------------- *
   Street scale
 * ---------------------------------------------------------- */

P({ id: 'delivery_bot', name: 'Delivery Robot', cat: 'ai', tags: ['town', 'city'], fill: 0.55, variants: 3, weight: 3,
  build(b, r, v) {
    const col = [C.white, C.lime, C.tangerine][v];
    b.slab(0.52, 0.44, 0.72, col, { y: 0.32 });
    b.box(0.4, 0.05, 0.5, C.charcoal, { y: 0.56 });
    b.box(0.3, 0.14, 0.03, C.charcoal, { y: 0.44, z: 0.36 });
    b.sphere(0.03, C.cyan, { x: -0.08, y: 0.44, z: 0.372 }, 8, 6);
    b.sphere(0.03, C.cyan, { x: 0.08, y: 0.44, z: 0.372 }, 8, 6);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      b.cyl(0.1, 0.1, 0.06, C.charcoal, { x: sx * 0.26, y: 0.1, z: sz * 0.22, rz: Math.PI / 2 }, 12);
    }
    b.cylOn(0.02, 0.16, C.steelDark, { y: 0.58, z: -0.16 }, 6);
    b.sphere(0.035, C.red, { y: 0.75, z: -0.16 }, 8, 6);
  } });

P({ id: 'server_rack', name: 'Server Rack', cat: 'ai', tags: ['town', 'city'], fill: 0.7, weight: 3,
  build(b, r) {
    b.boxOn(0.62, 2.0, 1.0, C.charcoal, {});
    for (let i = 0; i < 14; i++) {
      const y = 0.1 + i * 0.135;
      b.box(0.58, 0.11, 0.03, C.darkgrey, { y, z: 0.5 });
      for (let k = 0; k < 6; k++) {
        b.box(0.02, 0.02, 0.01, r() < 0.6 ? C.lime : C.red, { x: -0.2 + k * 0.055, y, z: 0.52 });
      }
    }
    b.box(0.64, 0.06, 1.02, C.steelDark, { y: 2.0 });
    for (let i = 0; i < 3; i++) b.cyl(0.09, 0.09, 0.04, C.steel, { x: -0.18 + i * 0.18, y: 2.04, rx: Math.PI / 2, rz: Math.PI / 2 }, 10);
  } });

P({ id: 'ev_charger', name: 'Charging Post', cat: 'ai', tags: ['town', 'city'], fill: 0.45, weight: 3,
  build(b) {
    b.boxOn(0.4, 0.12, 0.3, C.concreteD, {});
    b.slab(0.3, 1.5, 0.22, C.white, { y: 0.86 });
    b.box(0.2, 0.26, 0.02, C.charcoal, { y: 1.3, z: 0.12 });
    b.box(0.16, 0.2, 0.03, C.cyan, { y: 1.3, z: 0.13 });
    b.box(0.09, 0.22, 0.1, C.charcoal, { x: 0.13, y: 0.85, z: 0.14 });
    b.box(0.05, 0.4, 0.05, C.charcoal, { x: -0.15, y: 0.7, z: 0.1, rz: 0.3 });
    b.box(0.14, 0.1, 0.02, C.lime, { y: 1.62 });
  } });

/* ---------------------------------------------------------- *
   Skyline scale
 * ---------------------------------------------------------- */

P({ id: 'satellite_dish', name: 'Satellite Dish', cat: 'ai', tags: ['city'], fill: 0.15, weight: 3,
  build(b) {
    b.cylOn(2.2, 0.6, C.concreteD, {}, 14);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      b.cyl(0.22, 0.28, 6, C.steelDark, { x: Math.cos(a) * 1.1, y: 3.6, z: Math.sin(a) * 1.1, rz: -Math.cos(a) * 0.24, rx: Math.sin(a) * 0.24 }, 6);
    }
    b.cylOn(0.7, 2, C.steelDark, { y: 6.4 }, 10);
    b.lathe([[0.001, 0], [2.2, 0.7], [4.4, 2.9], [4.6, 3.2], [4.4, 3.1], [2.2, 0.95], [0.001, 0.25]], C.white,
      { y: 8.2, rx: -0.55 }, 20);
    b.cylOn(0.16, 3.4, C.steel, { y: 8.6, z: 1.8, rx: -0.55 }, 6);
    b.sphere(0.5, C.charcoal, { y: 10.4, z: 3.4 }, 10, 7);
  } });

P({ id: 'wind_turbine', name: 'Wind Turbine', cat: 'ai', tags: ['city'], fill: 0.06, weight: 3,
  build(b) {
    const H = 54;
    b.cyl(0.9, 2.2, H, C.white, { y: H / 2 }, 14);
    b.box(3.4, 2.8, 6, C.offwhite, { y: H + 1.2, z: -0.8 });
    b.cyl(1.1, 1.4, 1.6, C.offwhite, { y: H + 1.2, z: 2.6, rx: Math.PI / 2 }, 12);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.4;
      b.ellip(1.3, 22, 0.5, C.white, {
        x: Math.cos(a + Math.PI / 2) * 20, y: H + 1.2 + Math.sin(a + Math.PI / 2) * 20, z: 3.2, rz: a,
      }, 6, 6);
    }
    b.cyl(1.4, 1.4, 0.6, C.lightgrey, { y: H + 1.2, z: 3.4, rx: Math.PI / 2 }, 12);
  } });

P({ id: 'datacenter', name: 'Data Centre', cat: 'ai', tags: ['city'], fill: 0.65, weight: 3,
  build(b, r) {
    const W = 46, D = 30, H = 11;
    b.boxOn(W, H, D, C.lightgrey, {});
    b.box(W + 0.6, 1.0, D + 0.6, C.steelDark, { y: H });
    // roof chillers, endless rows of them
    for (let i = 0; i < 7; i++) for (let k = 0; k < 4; k++) {
      const x = -W / 2 + 4 + i * 6.2, z = -D / 2 + 5 + k * 6.6;
      b.boxOn(4.4, 2.2, 4.4, C.steel, { x, y: H + 0.5, z });
      b.cyl(1.7, 1.7, 0.4, C.darkgrey, { x, y: H + 2.9, z }, 12);
      for (let f = 0; f < 4; f++) {
        const a = (f / 4) * Math.PI * 2;
        b.box(2.6, 0.18, 0.6, C.charcoal, { x: x + Math.cos(a) * 0.7, y: H + 3.05, z: z + Math.sin(a) * 0.7, ry: a });
      }
    }
    // no windows to speak of, just louvres and one lonely door
    for (let i = 0; i < 12; i++) {
      b.box(2.6, 5, 0.3, C.steelDark, { x: -W / 2 + 3 + i * 3.6, y: 6, z: D / 2 });
      for (let s = 0; s < 6; s++) b.box(2.4, 0.28, 0.5, C.darkgrey, { x: -W / 2 + 3 + i * 3.6, y: 4.2 + s * 0.8, z: D / 2 + 0.1 });
    }
    b.box(2.4, 3.4, 0.5, C.charcoal, { x: W / 2 - 4, y: 1.7, z: D / 2 });
    b.box(9, 2.4, 0.4, C.teal, { x: -8, y: 9.2, z: D / 2 });
    // the switchgear yard
    for (let i = 0; i < 5; i++) {
      b.boxOn(3, 3.4, 3, C.concreteD, { x: -W / 2 - 6, y: 0, z: -D / 2 + 4 + i * 6 });
      b.cylOn(0.3, 5, C.steelDark, { x: -W / 2 - 6, y: 3.4, z: -D / 2 + 4 + i * 6 }, 6);
    }
    b.cylOn(2.6, 16, C.white, { x: W / 2 + 6, z: -D / 4 }, 14);
    b.cylOn(2.6, 16, C.white, { x: W / 2 + 6, z: D / 4 }, 14);
  } });

P({ id: 'rocket_pad', name: 'Rocket on the Pad', cat: 'ai', tags: ['city'], fill: 0.25, weight: 2,
  build(b) {
    b.cylOn(13, 2.4, C.concreteD, {}, 18);
    const H = 62;
    b.cylOn(3.6, H, C.white, { y: 2.4 }, 18);
    b.cyl(3.65, 3.65, 3, C.charcoal, { y: 22 }, 18);
    b.cyl(3.65, 3.65, 2, C.red, { y: 44 }, 18);
    b.taperOn(2.6, 3.6, 8, C.white, { y: H + 2.4 }, 18);
    b.cone(2.6, 9, C.white, { y: H + 14.9 }, 18);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      b.wedge(2.4, 7, 4.2, C.white, { x: Math.cos(a) * 3.4, y: 2.4, z: Math.sin(a) * 3.4, ry: -a });
      b.cone(1.4, 3.2, C.charcoal, { x: Math.cos(a) * 1.8, y: 3.4, z: Math.sin(a) * 1.8, rx: Math.PI }, 10);
    }
    // service tower
    for (const [ox, oz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      b.cylOn(0.5, H * 0.9, C.steelDark, { x: -13 + ox * 2.6, z: oz * 2.6 }, 6);
    }
    for (let i = 0; i < 9; i++) {
      b.box(5.6, 0.3, 5.6, C.steelDark, { x: -13, y: 5 + i * 6, z: 0 });
    }
    b.box(9, 0.5, 2.4, C.steelDark, { x: -8, y: 47 });
  } });
