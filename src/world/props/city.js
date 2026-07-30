/* ============================================================
   The big stuff — 8m to 400m. Once the katamari eats buildings.
   ============================================================ */

import { defineProp } from './index.js';
import { C, SETS } from '../../render/palette.js';

const P = defineProp;

/** Rows of lit windows on a slab face, starting at height y0. */
function windows(b, w, h, d, rows, cols, col = C.glassDark, lit = C.lemon, rnd = null, y0 = 0) {
  const mw = (w / cols) * 0.55, mh = (h / rows) * 0.5;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const x = -w / 2 + (c + 0.5) * (w / cols);
    const y = y0 + (r + 0.5) * (h / rows);
    const on = rnd ? rnd() < 0.3 : false;
    b.box(mw, mh, 0.3, on ? lit : col, { x, y, z: d / 2 });
    b.box(mw, mh, 0.3, on ? lit : col, { x, y, z: -d / 2 });
    b.box(0.3, mh, mw, on ? lit : col, { x: w / 2, y, z: x * (d / w) });
    b.box(0.3, mh, mw, on ? lit : col, { x: -w / 2, y, z: x * (d / w) });
  }
}

P({ id: 'billboard', name: 'Billboard', cat: 'structure', tags: ['city'], fill: 0.1, variants: 3, weight: 3,
  build(b, r, v) {
    for (const s of [-1, 1]) b.cylOn(0.3, 7.5, C.steelDark, { x: s * 2.6 }, 8);
    b.box(11, 5.2, 0.4, C.charcoal, { y: 10 });
    b.box(10.4, 4.6, 0.6, [C.hotpink, C.yellow, C.cyan][v], { y: 10 });
    b.box(7.5, 1.4, 0.8, C.white, { y: 10.8 });
    b.box(4.5, 0.9, 0.8, C.charcoal, { y: 9.2 });
    for (const s of [-1, 1]) b.box(0.5, 0.5, 1.2, C.lemon, { x: s * 3, y: 7.2, z: 0.7, rx: -0.5 });
  } });

P({ id: 'watertower', name: 'Water Tower', cat: 'structure', tags: ['city'], fill: 0.2, weight: 3,
  build(b) {
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      b.cyl(0.22, 0.3, 11, C.steelDark, { x: Math.cos(a) * 2.4, y: 5.5, z: Math.sin(a) * 2.4, rz: -Math.cos(a) * 0.16, rx: Math.sin(a) * 0.16 }, 6);
    }
    for (const y of [3.5, 7.5]) for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4, a2 = a + Math.PI / 2;
      const r1 = 2.4 * (1 - (y / 11) * 0.16);
      b.box(Math.hypot(Math.cos(a) - Math.cos(a2), Math.sin(a) - Math.sin(a2)) * r1, 0.16, 0.16, C.steelDark,
        { x: (Math.cos(a) + Math.cos(a2)) / 2 * r1, y, z: (Math.sin(a) + Math.sin(a2)) / 2 * r1, ry: -(a + Math.PI / 2 + Math.PI / 4) });
    }
    b.cylOn(3.4, 5.4, C.steel, { y: 11 }, 16);
    b.cone(3.5, 2.2, C.redDark, { y: 17.4 }, 16);
    b.cyl(3.6, 3.6, 0.4, C.steelDark, { y: 11.2 }, 16);
    b.box(5.5, 1.6, 0.3, C.red, { y: 13.6, z: 3.42 });
  } });

P({ id: 'trainCar', name: 'Train Carriage', cat: 'vehicle', tags: ['city'], fill: 0.55, variants: 2, weight: 3,
  build(b, r, v) {
    const L = 20, W = 3.0, H = 3.6;
    b.box(W, H, L, [C.offwhite, C.lightgrey][v], { y: 1.2 + H / 2 });
    b.box(W + 0.06, 0.6, L, v ? C.green : C.orange, { y: 2.6 });
    b.box(W - 0.1, 0.16, L - 0.2, C.chrome, { y: 1.2 + H });
    for (const s of [-1, 1]) for (let i = 0; i < 8; i++) {
      b.box(0.08, 1.0, 1.6, C.glassDark, { x: s * W / 2, y: 3.2, z: -L / 2 + 1.6 + i * 2.4 });
    }
    for (const s of [-1, 1]) for (let i = 0; i < 2; i++) {
      b.box(0.1, 1.9, 1.1, C.charcoal, { x: s * W / 2, y: 2.6, z: (i - 0.5) * L * 0.55 });
    }
    b.box(W - 0.2, 1.0, L, C.charcoal, { y: 0.9 });
    for (const z of [-L / 2 + 3, L / 2 - 3]) for (const s of [-1, 1]) for (const t of [-1, 1]) {
      b.cyl(0.45, 0.45, 0.2, C.charcoal, { x: s * (W / 2 - 0.35), y: 0.45, z: z + t * 1.1, rz: Math.PI / 2 }, 10);
    }
  } });

P({ id: 'airplane', name: 'Airliner', cat: 'vehicle', tags: ['city'], fill: 0.16, weight: 2,
  surface: 'air', flyHeight: 90,
  build(b) {
    const L = 34;
    b.cyl(1.7, 1.7, L * 0.72, C.white, { y: 4, rx: Math.PI / 2 }, 14);
    b.cone(1.7, 5, C.white, { y: 4, z: L * 0.42, rx: Math.PI / 2 }, 14);
    b.cone(1.7, 7, C.white, { y: 4.5, z: -L * 0.45, rx: -Math.PI / 2 }, 14);
    b.box(30, 0.5, 4.4, C.lightgrey, { y: 3.6, z: -1 });
    b.box(11, 0.4, 2.6, C.lightgrey, { y: 5.4, z: -L * 0.42 });
    b.box(0.5, 6.5, 4.2, C.blue, { y: 7.6, z: -L * 0.44 });
    for (const s of [-1, 1]) {
      b.cyl(1.1, 1.1, 4, C.steel, { x: s * 7, y: 2.6, z: 0.5, rx: Math.PI / 2 }, 12);
      b.cyl(0.9, 0.9, 0.6, C.charcoal, { x: s * 7, y: 2.6, z: 2.6, rx: Math.PI / 2 }, 12);
    }
    for (let i = 0; i < 16; i++) b.box(0.5, 0.5, 0.4, C.glassDark, { x: 1.68, y: 4.6, z: -8 + i * 1.2 });
    for (let i = 0; i < 16; i++) b.box(0.5, 0.5, 0.4, C.glassDark, { x: -1.68, y: 4.6, z: -8 + i * 1.2 });
    for (const s of [-1, 1]) b.cyl(0.4, 0.4, 0.9, C.charcoal, { x: s * 2.4, y: 0.4, z: -2, rz: Math.PI / 2 }, 8);
    b.cyl(0.35, 0.35, 0.7, C.charcoal, { y: 0.35, z: 11, rz: Math.PI / 2 }, 8);
  } });

P({ id: 'office_small', name: 'Office Block', cat: 'building', tags: ['city'], fill: 0.8, variants: 4, weight: 6,
  build(b, r, v) {
    const W = 13 + v * 2, D = 11 + v, H = 17 + v * 5;
    b.boxOn(W, H, D, SETS.building[v % SETS.building.length], {});
    windows(b, W, H, D, Math.round(H / 3.4), Math.round(W / 3.2), C.glassDark, C.lemon, r);
    b.box(W + 0.8, 0.8, D + 0.8, C.concreteD, { y: H });
    b.boxOn(4, 2.4, 4, C.concreteD, { y: H, x: W / 4 });
    b.box(W * 0.6, 3, 0.6, C.glass, { y: 1.6, z: D / 2 });
  } });

P({ id: 'apartment', name: 'Apartment Block', cat: 'building', tags: ['city'], fill: 0.82, variants: 4, weight: 5,
  build(b, r, v) {
    const W = 22, D = 14, H = 26 + v * 6;
    b.boxOn(W, H, D, [C.cream, C.tan, C.offwhite, C.brick][v], {});
    const floors = Math.round(H / 3.2);
    for (let f = 0; f < floors; f++) {
      const y = 1.4 + f * 3.2;
      b.box(W + 0.4, 0.3, D + 1.4, C.concrete, { y: y + 1.5 });
      for (let i = 0; i < 6; i++) {
        b.box(2.4, 1.5, 0.2, C.glassDark, { x: -W / 2 + 2.2 + i * 3.6, y: y + 0.7, z: D / 2 });
        b.box(2.4, 1.5, 0.2, C.glassDark, { x: -W / 2 + 2.2 + i * 3.6, y: y + 0.7, z: -D / 2 });
      }
      b.box(W, 0.9, 0.16, C.steelDark, { y: y + 0.45, z: D / 2 + 0.7 });
    }
    /* SITS ON the roof rather than straddling it. Centred at `H` its underside
       lands at H - 0.45, which for several variants is exactly where the topmost
       floor band's underside lands — two down-facing faces of different greys in
       one plane, across 91% of the footprint. That is the biggest single
       z-fight in the catalogue and it was one number. */
    b.boxOn(W + 1, 0.9, D + 1, C.concreteD, { y: H });
    b.box(2.4, 3, 0.4, C.charcoal, { x: -W / 2 + 3, y: 1.5, z: D / 2 });
  } });

P({ id: 'department_store', name: 'Department Store', cat: 'building', tags: ['city'], fill: 0.85, variants: 2, weight: 3,
  build(b, r, v) {
    const W = 36, D = 30, H = 30;
    b.boxOn(W, H, D, v ? C.offwhite : C.concrete, {});
    for (let f = 0; f < 7; f++) {
      b.box(W + 0.3, 2.2, D + 0.3, C.glassDark, { y: 3.4 + f * 3.9 });
      b.box(W + 0.5, 0.5, D + 0.5, C.white, { y: 4.9 + f * 3.9 });
    }
    b.box(W + 1.2, 1.2, D + 1.2, C.concreteD, { y: H });
    b.box(W * 0.5, 4, 1.2, C.red, { y: H + 2.6, z: 0 });
    b.box(W * 0.44, 2.6, 1.6, C.white, { y: H + 2.6 });
    b.box(12, 5, 1.0, C.charcoal, { y: 2.5, z: D / 2 });
    b.box(11, 4, 1.4, C.glass, { y: 2.4, z: D / 2 });
    b.box(14, 1.2, 2.4, C.redDark, { y: 5.6, z: D / 2 + 1, rx: -0.15 });
  } });

P({ id: 'tower', name: 'Office Tower', cat: 'building', tags: ['city'], fill: 0.82, variants: 4, weight: 5,
  build(b, r, v) {
    const W = 18 + v * 3, D = 18 + v * 2, H = 62 + v * 22;
    b.boxOn(W, H * 0.7, D, [C.steelDark, C.concrete, C.glassDark, C.lightgrey][v], {});
    b.boxOn(W * 0.82, H * 0.32, D * 0.82, [C.steelDark, C.concrete, C.glassDark, C.lightgrey][v], { y: H * 0.7 });
    windows(b, W, H * 0.7, D, Math.round(H * 0.7 / 3.6), Math.round(W / 3.4), C.glass, C.lemon, r, 0);
    windows(b, W * 0.82, H * 0.32, D * 0.82, Math.round(H * 0.32 / 3.6), Math.round(W * 0.82 / 3.4), C.glass, C.lemon, r, H * 0.7);
    b.box(W + 1, 1.2, D + 1, C.concreteD, { y: H * 0.7 });
    b.box(W * 0.82 + 1, 1.2, D * 0.82 + 1, C.concreteD, { y: H });
    b.cylOn(0.6, H * 0.16, C.steelDark, { y: H }, 8);
    b.sphere(1.1, C.red, { y: H + H * 0.16 }, 8, 6);
  } });

P({ id: 'skyscraper', name: 'Skyscraper', cat: 'building', tags: ['city'], fill: 0.8, variants: 3, weight: 3,
  build(b, r, v) {
    const H = 140 + v * 40;
    const tiers = 4;
    let w = 30, d = 28, y = 0;
    for (let i = 0; i < tiers; i++) {
      const th = H / tiers;
      b.boxOn(w, th, d, i % 2 ? C.glassDark : C.steelDark, { y });
      windows(b, w, th, d, Math.round(th / 4), Math.round(w / 4), C.glass, C.lemon, r, y);
      b.box(w + 1.4, 1.4, d + 1.4, C.concreteD, { y: y + th });
      y += th; w *= 0.82; d *= 0.82;
    }
    b.cone(w * 0.5, H * 0.1, C.steelDark, { y: y + H * 0.05 }, 10);
    b.cylOn(0.9, H * 0.13, C.steelDark, { y }, 8);
    b.sphere(1.6, C.red, { y: y + H * 0.13 }, 8, 6);
  } });

P({ id: 'pagoda', name: 'Pagoda', cat: 'building', tags: ['city'], fill: 0.3, weight: 2,
  build(b) {
    let w = 9, y = 0.6;
    b.boxOn(12, 0.6, 12, C.concrete, {});
    for (let i = 0; i < 5; i++) {
      const h = 3.6 - i * 0.24;
      b.boxOn(w, h, w, C.woodRed, { y });
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2;
        b.box(w * 0.8, 1.6, 0.24, C.charcoal, { x: Math.cos(a) * w / 2, y: y + h * 0.6, z: Math.sin(a) * w / 2, ry: -a });
      }
      y += h;
      b.box(w * 1.55, 0.34, w * 1.55, C.roofTile, { y: y + 0.2 });
      b.box(w * 1.3, 0.6, w * 1.3, C.roofTile, { y: y + 0.5 });
      b.wedge(w * 1.1, 0.5, w * 1.1, C.roofTile, { y: y + 0.75 });
      y += 1.0; w *= 0.86;
    }
    b.cylOn(0.28, 4.5, C.gold, { y }, 8);
    for (let i = 0; i < 4; i++) b.torus(0.7 - i * 0.12, 0.1, C.gold, { y: y + 1.2 + i * 0.7, rx: Math.PI / 2 }, 5, 12);
    b.sphere(0.45, C.gold, { y: y + 4.7 }, 8, 6);
  } });

P({ id: 'lighthouse', name: 'Lighthouse', cat: 'building', tags: ['city'], fill: 0.4, weight: 2,
  build(b) {
    b.lathe([[0.001, 0], [5, 0], [5, 1.4], [4.2, 1.6], [3.4, 12], [2.9, 24], [3.5, 25], [0.001, 25]], C.white, {}, 18);
    for (let i = 0; i < 4; i++) b.cyl(3.36 - i * 0.14, 3.28 - i * 0.14, 2.6, C.red, { y: 4 + i * 5.4 }, 18);
    b.cylOn(3.7, 0.5, C.charcoal, { y: 24.8 }, 18);
    b.cyl(2.7, 2.7, 3.4, C.glass, { y: 27 }, 14);
    b.cylOn(1.4, 1.6, C.yellow, { y: 26.4 }, 12);
    b.cone(3.4, 2.4, C.redDark, { y: 29.9 }, 14);
    b.cylOn(0.2, 1.6, C.charcoal, { y: 31.1 }, 6);
    b.torus(3.5, 0.14, C.charcoal, { y: 25.4, rx: Math.PI / 2 }, 5, 16);
  } });

P({ id: 'crane', name: 'Tower Crane', cat: 'structure', tags: ['city'], fill: 0.06, weight: 3,
  build(b) {
    const H = 42;
    b.boxOn(7, 1.2, 7, C.concreteD, {});
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.cyl(0.2, 0.2, H, C.yellow, { x: sx * 1.1, y: H / 2 + 1.2, z: sz * 1.1 }, 6);
    for (let i = 0; i < 14; i++) {
      const y = 3 + i * 3;
      b.box(2.3, 0.14, 0.14, C.yellow, { y, z: 1.1 }); b.box(2.3, 0.14, 0.14, C.yellow, { y, z: -1.1 });
      b.box(0.14, 0.14, 2.3, C.yellow, { x: 1.1, y }); b.box(0.14, 0.14, 2.3, C.yellow, { x: -1.1, y });
      b.box(3.2, 0.12, 0.12, C.yellow, { y: y + 1.5, z: 1.1, rz: 0.75 });
    }
    b.boxOn(3.6, 2.4, 3.6, C.yellow, { y: H + 1.2 });
    b.box(38, 1.4, 1.4, C.yellow, { x: 9, y: H + 4.6 });
    for (let i = 0; i < 12; i++) b.box(0.14, 1.5, 0.14, C.yellow, { x: -9 + i * 3.1, y: H + 4.6, rz: 0.6 });
    b.box(4, 2.2, 2.6, C.blue, { x: -1.5, y: H + 3.0 });
    b.cyl(0.1, 0.1, 12, C.charcoal, { x: 18, y: H - 1.4 }, 5);
    b.box(1.4, 1.4, 1.4, C.charcoal, { x: 18, y: H - 7.8 });
    b.box(0.2, 6, 0.2, C.charcoal, { x: -8, y: H + 8, rz: -0.5 });
  } });

P({ id: 'factory', name: 'Factory', cat: 'building', tags: ['city'], fill: 0.6, weight: 3,
  build(b, r) {
    const W = 34, D = 22, H = 12;
    b.boxOn(W, H, D, C.concreteD, {});
    for (let i = 0; i < 5; i++) {
      b.wedge(W / 5 - 0.2, 3, D, C.steelDark, { x: -W / 2 + (i + 0.5) * (W / 5), y: H });
      b.box(W / 5 - 1.2, 2.2, D, C.glass, { x: -W / 2 + (i + 0.5) * (W / 5) + 1, y: H + 1.6, rz: -0.6 });
    }
    for (let i = 0; i < 8; i++) b.box(2.4, 3, 0.4, C.glassDark, { x: -W / 2 + 2.6 + i * 4.2, y: 6, z: D / 2 });
    b.box(6, 5, 0.5, C.charcoal, { x: -W / 2 + 5, y: 2.5, z: D / 2 });
    b.cylOn(2.0, 30, C.brick, { x: W / 2 - 4, z: -D / 2 + 4 }, 14);
    b.cylOn(2.3, 1.4, C.charcoal, { x: W / 2 - 4, y: 29, z: -D / 2 + 4 }, 14);
    for (let i = 0; i < 3; i++) b.cyl(2.05, 2.05, 0.8, C.white, { x: W / 2 - 4, y: 8 + i * 8, z: -D / 2 + 4 }, 14);
    b.cylOn(3.4, 9, C.steel, { x: -W / 2 - 5, z: -2 }, 14);
    b.dome(3.4, C.steel, { x: -W / 2 - 5, y: 9, z: -2 }, 14);
  } });

P({ id: 'silo', name: 'Grain Silo', cat: 'building', tags: ['city'], fill: 0.55, variants: 2, weight: 3,
  build(b, r, v) {
    const R = 4.2, H = 18 + v * 5;
    b.cylOn(R, H, C.steel, {}, 16);
    for (let i = 0; i < 8; i++) b.cyl(R + 0.06, R + 0.06, 0.3, C.steelDark, { y: 2 + i * (H / 8) }, 16);
    b.cone(R + 0.3, 4.5, C.steelDark, { y: H + 2.25 }, 16);
    b.cylOn(0.5, 1.6, C.charcoal, { y: H + 4.5 }, 8);
    for (let i = 0; i < 12; i++) b.box(0.5, 0.14, 0.14, C.steelDark, { x: R + 0.2, y: 1.5 + i * 1.4 });
  } });

P({ id: 'windmill', name: 'Windmill', cat: 'building', tags: ['city'], fill: 0.35, weight: 2,
  build(b) {
    b.lathe([[0.001, 0], [5.5, 0], [5.2, 2], [3.4, 14], [3.6, 15], [0.001, 15]], C.cream, {}, 16);
    b.cone(4.6, 4, C.roofRed, { y: 16.6 }, 16);
    b.box(1.6, 3, 0.4, C.woodDark, { y: 1.5, z: 5.2 });
    for (let i = 0; i < 3; i++) b.box(1.2, 1.4, 0.3, C.glassDark, { y: 6 + i * 3.5, z: 4.4 - i * 0.35 });
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      b.box(1.5, 11, 0.3, C.woodDark, { x: Math.cos(a + Math.PI / 2) * 5.5, y: 15 + Math.sin(a + Math.PI / 2) * 5.5, z: 5.6, rz: a });
    }
    b.cyl(0.6, 0.6, 1.6, C.charcoal, { y: 15, z: 5.6, rx: Math.PI / 2 }, 10);
  } });

P({ id: 'stadium', name: 'Stadium', cat: 'building', tags: ['city'], fill: 0.28, weight: 2,
  build(b, r) {
    const R = 58;
    b.lathe([[R * 0.72, 0], [R, 0], [R * 1.02, 16], [R * 0.96, 17], [R * 0.7, 8], [R * 0.72, 0]], C.concrete, {}, 26);
    b.cylOn(R * 0.72, 0.5, C.grass, {}, 26);
    b.cyl(R * 0.5, R * 0.5, 0.1, C.grassDark, { y: 0.6 }, 20);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      b.cylOn(1.2, 34, C.steelDark, { x: Math.cos(a) * R * 1.02, z: Math.sin(a) * R * 1.02 }, 8);
      b.box(9, 4, 2, C.white, { x: Math.cos(a) * R * 1.02, y: 35, z: Math.sin(a) * R * 1.02, ry: -a });
      for (let k = 0; k < 12; k++) b.box(1.6, 1.6, 0.4, C.lemon, { x: Math.cos(a) * (R * 1.02) - Math.sin(-a) * (-3 + (k % 4) * 2), y: 34 + Math.floor(k / 4) * 1.6, z: Math.sin(a) * (R * 1.02) + Math.cos(-a) * (-3 + (k % 4) * 2) });
    }
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      b.box(6, 2, 5, [C.blue, C.red, C.white][i % 3], { x: Math.cos(a) * R * 0.85, y: 9, z: Math.sin(a) * R * 0.85, ry: -a });
    }
  } });

P({ id: 'ferriswheel', name: 'Ferris Wheel', cat: 'structure', tags: ['city'], fill: 0.08, weight: 2,
  build(b) {
    const R = 26;
    for (const s of [-1, 1]) {
      b.cyl(0.5, 0.9, 30, C.steelDark, { x: s * 7, y: 15, z: 4, rz: -s * 0.22, rx: -0.13 }, 8);
      b.cyl(0.5, 0.9, 30, C.steelDark, { x: s * 7, y: 15, z: -4, rz: -s * 0.22, rx: 0.13 }, 8);
    }
    b.cyl(1.2, 1.2, 5, C.charcoal, { y: 28, rz: Math.PI / 2 }, 12);
    for (const s of [-1, 1]) b.torus(R, 0.7, C.white, { y: 28, z: s * 2, ry: 0 }, 6, 26);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const x = Math.cos(a) * R, y = 28 + Math.sin(a) * R;
      b.box(0.4, R * 2 - 1, 0.4, C.steel, { y: 28, rz: a });
      b.box(2.6, 2.4, 3.2, SETS.candy[i % SETS.candy.length], { x, y: y - 1.9 });
      b.box(2.7, 0.3, 3.3, C.white, { x, y: y - 0.7 });
      b.box(0.24, 1.2, 0.24, C.charcoal, { x, y: y - 0.4 });
    }
    b.boxOn(14, 3, 10, C.concrete, {});
    b.box(15, 0.6, 11, C.redDark, { y: 3 });
  } });

P({ id: 'bridge_span', name: 'Bridge Span', cat: 'structure', tags: ['city'], fill: 0.12, weight: 2,
  build(b) {
    const L = 84;
    b.box(14, 1.4, L, C.concrete, { y: 9 });
    b.box(15, 0.6, L, C.asphalt, { y: 9.8 });
    for (const s of [-1, 1]) b.box(0.5, 1.4, L, C.steelDark, { x: s * 7, y: 10.5 });
    for (const z of [-L / 2 + 12, L / 2 - 12]) {
      for (const s of [-1, 1]) b.cyl(1.4, 2.0, 34, C.steelDark, { x: s * 6, y: 17, z }, 10);
      b.box(15, 1.6, 2.4, C.steelDark, { y: 26, z });
      b.box(15, 1.6, 2.4, C.steelDark, { y: 32, z });
    }
    for (const s of [-1, 1]) {
      for (let i = 0; i < 22; i++) {
        const t = i / 21;
        const z = -L / 2 + 12 + t * (L - 24);
        const sag = Math.sin(t * Math.PI) * 12;
        b.cylOn(0.16, 22 - sag, C.steel, { x: s * 6, y: 10.5, z }, 5);
      }
    }
    for (const s of [-1, 1]) b.cylOn(2.4, 9, C.concreteD, { x: s * 5, z: -L / 2 + 12 }, 12);
    for (const s of [-1, 1]) b.cylOn(2.4, 9, C.concreteD, { x: s * 5, z: L / 2 - 12 }, 12);
  } });

P({ id: 'cargoship', name: 'Cargo Ship', cat: 'vehicle', tags: ['city'], fill: 0.35, weight: 2,
  surface: 'water',
  build(b, r) {
    const L = 112, W = 17;
    b.box(W, 9, L * 0.86, C.redDark, { y: 4.5 });
    b.box(W - 1, 4, L * 0.88, C.charcoal, { y: 11 });
    for (let i = 0; i < 6; i++) {
      const t = i / 5;
      b.box(W * (1 - t * 0.9), 9, 6, C.redDark, { y: 4.5, z: L * 0.43 + i * 3.2 });
    }
    b.box(W - 2, 6, L * 0.5, C.steelDark, { y: 15, z: -6 });
    for (let row = 0; row < 3; row++) for (let i = 0; i < 8; i++) for (const s of [-1, 1]) {
      b.box(6.4, 2.8, 6.2, SETS.candy[(row + i) % SETS.candy.length],
        { x: s * 4.4, y: 14.4 + row * 2.9, z: -L * 0.24 + i * 6.4 });
    }
    b.boxOn(13, 14, 12, C.white, { y: 9, z: -L * 0.36 });
    for (let i = 0; i < 4; i++) b.box(12.6, 1.2, 12.2, C.glassDark, { y: 12 + i * 3.2, z: -L * 0.36 });
    b.box(14, 1, 13, C.lightgrey, { y: 23, z: -L * 0.36 });
    b.cylOn(2.2, 12, C.charcoal, { y: 23, z: -L * 0.42 }, 12);
    b.cyl(2.4, 2.4, 1.4, C.red, { y: 34, z: -L * 0.42 }, 12);
    b.cylOn(0.3, 12, C.steel, { y: 24, z: -L * 0.3 }, 6);
  } });

P({ id: 'hotairballoon', name: 'Hot Air Balloon', cat: 'sky', tags: ['city'], fill: 0.3, variants: 3, weight: 3,
  surface: 'air', flyHeight: 42,
  build(b, r, v) {
    const R = 9;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      b.ellip(R * 0.42, R, R * 0.42, i % 2 ? SETS.candy[v] : C.white, { x: Math.cos(a) * R * 0.62, y: R * 1.2, z: Math.sin(a) * R * 0.62 }, 8, 10);
    }
    b.ellip(R * 0.62, R * 0.95, R * 0.62, i2(v), { y: R * 1.2 }, 14, 10);
    b.cone(R * 0.5, R * 0.6, i2(v), { y: R * 0.34, rx: Math.PI }, 12);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.7;
      b.cylOn(0.09, 3.2, C.woodDark, { x: Math.cos(a) * 1.5, y: 0.9, z: Math.sin(a) * 1.5 }, 5);
    }
    b.boxOn(3.4, 2.6, 3.4, C.wood, {});
    b.box(3.6, 0.4, 3.6, C.woodDark, { y: 2.6 });
    function i2(k) { return [C.red, C.blue, C.violet][k]; }
  } });

P({ id: 'mountain', name: 'Mountain', cat: 'nature', tags: ['city'], fill: 0.34, variants: 3, weight: 2,
  build(b, r, v) {
    const H = 72 + v * 26, R = H * 0.8;
    // More rock, less lawn. A mostly-green cone reads as an enormous conifer
    // rather than a hill, especially at the smaller scales.
    b.cone(R, H, C.greenDark, { y: H / 2 }, 9);
    b.cone(R * 0.78, H * 0.78, C.grey, { y: H * 0.55 }, 9);
    b.cone(R * 0.5, H * 0.5, C.darkgrey, { y: H * 0.72 }, 8);
    b.cone(R * 0.34, H * 0.34, C.white, { y: H * 0.84 }, 9);
    for (let i = 0; i < 5; i++) {
      const a = r() * Math.PI * 2, d = R * (0.4 + r() * 0.4);
      b.cone(R * (0.2 + r() * 0.2), H * (0.24 + r() * 0.2), C.leafDark, { x: Math.cos(a) * d, y: H * 0.14, z: Math.sin(a) * d }, 7);
    }
  } });

P({ id: 'island_rock', name: 'Rocky Islet', cat: 'nature', tags: ['city'], fill: 0.4, variants: 2, weight: 2,
  surface: 'water',
  build(b, r, v) {
    const R = 26 + v * 14;
    b.lathe([[R, 0], [R * 0.95, R * 0.16], [R * 0.6, R * 0.4], [R * 0.24, R * 0.56], [0.001, R * 0.6]], C.grey, {}, 12);
    b.lathe([[R * 0.7, R * 0.3], [R * 0.4, R * 0.48], [0.001, R * 0.56]], C.leafDark, {}, 12);
    for (let i = 0; i < 4; i++) {
      const a = r() * Math.PI * 2, d = R * 0.4 * r();
      b.cyl(0.6, 1.0, 9, C.trunk, { x: Math.cos(a) * d, y: R * 0.5 + 4, z: Math.sin(a) * d }, 7);
      b.canopy(5, C.leaf, { x: Math.cos(a) * d, y: R * 0.5 + 11 }, r, 5);
    }
  } });
