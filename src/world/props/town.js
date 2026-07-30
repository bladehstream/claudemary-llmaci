/* ============================================================
   Street furniture, vehicles and townsfolk — 0.3m to 20m.
   ============================================================ */

import { defineProp } from './index.js';
import { C, SETS } from '../../render/palette.js';

const P = defineProp;

/* ---------------------------------------------------------- *
   Small street clutter
 * ---------------------------------------------------------- */

P({ id: 'trafficcone', name: 'Traffic Cone', cat: 'street', tags: ['town', 'city'], fill: 0.22, weight: 4,
  build(b) {
    b.box(0.34, 0.035, 0.34, C.orange, { y: 0.017 });
    b.cyl(0.035, 0.13, 0.62, C.orange, { y: 0.35 }, 12);
    b.cyl(0.086, 0.096, 0.1, C.white, { y: 0.36 }, 12);
  } });

P({ id: 'firehydrant', name: 'Fire Hydrant', cat: 'street', tags: ['town', 'city'], fill: 0.4, weight: 3,
  build(b) {
    b.cylOn(0.16, 0.06, C.redDark, {}, 12);
    b.cylOn(0.115, 0.5, C.red, { y: 0.05 }, 12);
    b.dome(0.115, C.red, { y: 0.55 }, 12);
    b.cylOn(0.05, 0.06, C.redDark, { y: 0.63 }, 10);
    for (const s of [-1, 1]) b.cyl(0.055, 0.055, 0.1, C.redDark, { x: s * 0.13, y: 0.38, rz: Math.PI / 2 }, 10);
    b.cyl(0.05, 0.05, 0.1, C.redDark, { z: 0.13, y: 0.42, rx: Math.PI / 2 }, 10);
  } });

P({ id: 'mailbox', name: 'Post Box', cat: 'street', tags: ['town', 'city'], fill: 0.5, weight: 3,
  build(b) {
    b.cylOn(0.13, 0.24, C.steelDark, {}, 10);
    b.cylOn(0.26, 1.05, C.red, { y: 0.22 }, 14);
    b.dome(0.26, C.red, { y: 1.27 }, 14);
    b.box(0.3, 0.09, 0.03, C.charcoal, { y: 1.05, z: 0.25 });
    b.box(0.34, 0.2, 0.02, C.white, { y: 0.75, z: 0.26 });
  } });

P({ id: 'bench', name: 'Park Bench', cat: 'street', tags: ['town', 'city'], fill: 0.18, weight: 3,
  build(b) {
    for (const s of [-1, 1]) {
      b.box(0.06, 0.42, 0.5, C.steelDark, { x: s * 0.7, y: 0.21 });
      b.box(0.06, 0.5, 0.08, C.steelDark, { x: s * 0.7, y: 0.6, z: -0.2 });
    }
    for (let i = 0; i < 3; i++) b.box(1.6, 0.045, 0.12, C.wood, { y: 0.44, z: -0.16 + i * 0.16 });
    for (let i = 0; i < 3; i++) b.box(1.6, 0.11, 0.04, C.wood, { y: 0.58 + i * 0.14, z: -0.22 });
  } });

P({ id: 'trashcan_street', name: 'Street Bin', cat: 'street', tags: ['town', 'city'], fill: 0.4, variants: 2, weight: 3,
  build(b, r, v) {
    const col = v ? C.greenDark : C.steelDark;
    b.cylOn(0.26, 0.78, col, {}, 12);
    b.cyl(0.28, 0.28, 0.05, C.charcoal, { y: 0.8 }, 12);
    b.cyl(0.2, 0.2, 0.04, C.black, { y: 0.83 }, 12);
    b.torus(0.26, 0.018, C.charcoal, { y: 0.5, rx: Math.PI / 2 }, 5, 14);
  } });

P({ id: 'signpost', name: 'Street Sign', cat: 'street', tags: ['town', 'city'], fill: 0.1, variants: 3, weight: 3,
  build(b, r, v) {
    b.cylOn(0.045, 2.1, C.steelDark, {}, 8);
    if (v === 0) { b.cyl(0.34, 0.34, 0.03, C.red, { y: 1.85, rx: Math.PI / 2 }, 8); b.cyl(0.26, 0.26, 0.04, C.white, { y: 1.85, rx: Math.PI / 2 }, 8); }
    else if (v === 1) { b.box(0.62, 0.44, 0.03, C.blue, { y: 1.85 }); b.box(0.54, 0.36, 0.04, C.white, { y: 1.85 }); }
    else { b.cone(0.36, 0.62, C.yellow, { y: 1.9, rx: Math.PI / 2, rz: 0 }, 3); b.cone(0.28, 0.48, C.white, { y: 1.88, z: 0.01, rx: Math.PI / 2 }, 3); }
  } });

P({ id: 'streetlamp', name: 'Street Lamp', cat: 'street', tags: ['town', 'city'], fill: 0.08, weight: 3,
  build(b) {
    b.cylOn(0.16, 0.14, C.concreteD, {}, 10);
    b.cyl(0.055, 0.08, 4.3, C.steelDark, { y: 2.2 }, 10);
    b.cyl(0.05, 0.05, 0.9, C.steelDark, { x: 0.42, y: 4.3, rz: -1.15 }, 8);
    b.box(0.62, 0.14, 0.28, C.steelDark, { x: 0.82, y: 4.4 });
    b.box(0.5, 0.06, 0.22, C.lemon, { x: 0.82, y: 4.32 });
  } });

P({ id: 'trafficlight', name: 'Traffic Light', cat: 'street', tags: ['town', 'city'], fill: 0.12, weight: 2,
  build(b) {
    b.cylOn(0.2, 0.16, C.concreteD, {}, 10);
    b.cyl(0.07, 0.09, 3.6, C.charcoal, { y: 1.8 }, 8);
    b.box(0.42, 1.1, 0.32, C.charcoal, { y: 4.0 });
    for (let i = 0; i < 3; i++) {
      b.cyl(0.13, 0.13, 0.06, [C.red, C.yellow, C.green][i], { y: 4.36 - i * 0.34, z: 0.17, rx: Math.PI / 2 }, 12);
      b.cyl(0.17, 0.14, 0.1, C.charcoal, { y: 4.4 - i * 0.34, z: 0.2, rx: Math.PI / 2 }, 10);
    }
  } });

P({ id: 'bollard', name: 'Bollard', cat: 'street', tags: ['town', 'city'], fill: 0.5, weight: 4,
  build(b) {
    b.cylOn(0.09, 0.78, C.steelDark, {}, 10);
    b.dome(0.09, C.steelDark, { y: 0.78 }, 10);
    b.cyl(0.095, 0.095, 0.07, C.yellow, { y: 0.66 }, 10);
  } });

P({ id: 'gardengnome', name: 'Garden Gnome', cat: 'street', tags: ['town'], fill: 0.35, weight: 2,
  build(b) {
    b.cylOn(0.13, 0.03, C.grassDark, {}, 10);
    b.taperOn(0.1, 0.13, 0.22, C.blue, { y: 0.02 }, 10);
    b.sphere(0.1, C.skin, { y: 0.3 }, 12, 8);
    b.cone(0.11, 0.24, C.red, { y: 0.42 }, 10);
    b.ellip(0.075, 0.1, 0.06, C.white, { y: 0.25, z: 0.05 }, 10, 7);
    for (const s of [-1, 1]) b.sphere(0.014, C.black, { x: s * 0.035, y: 0.32, z: 0.085 }, 6, 4);
  } });

P({ id: 'flowerbed', name: 'Flower Bed', cat: 'nature', tags: ['town', 'city'], fill: 0.3, variants: 3, weight: 4,
  build(b, r, v) {
    b.boxOn(0.9, 0.28, 0.5, C.brick, {});
    b.box(0.82, 0.06, 0.42, C.brown, { y: 0.28 });
    const cols = [C.hotpink, C.yellow, C.white, C.violet, C.orange];
    for (let i = 0; i < 9; i++) {
      const x = (r() - 0.5) * 0.76, z = (r() - 0.5) * 0.36, h = 0.1 + r() * 0.12;
      b.cylOn(0.008, h, C.greenDark, { x, y: 0.29, z }, 4);
      const col = cols[(v + i) % cols.length];
      for (let p = 0; p < 4; p++) {
        const a = (p / 4) * Math.PI * 2;
        b.ellip(0.026, 0.008, 0.015, col, { x: x + Math.cos(a) * 0.022, y: 0.29 + h, z: z + Math.sin(a) * 0.022, ry: a }, 4, 3);
      }
      b.sphere(0.013, C.yellow, { x, y: 0.3 + h, z }, 5, 4);
    }
  } });

P({ id: 'planterbox', name: 'Planter', cat: 'nature', tags: ['town', 'city'], fill: 0.5, weight: 3,
  build(b, r) {
    b.taperOn(0.42, 0.34, 0.44, C.concrete, {}, 10);
    b.cyl(0.44, 0.44, 0.05, C.concreteD, { y: 0.44 }, 10);
    b.cylOn(0.38, 0.04, C.brown, { y: 0.42 }, 10);
    b.canopy(0.3, C.leaf, { y: 0.72 }, r, 4);
  } });

P({ id: 'vendingmachine', name: 'Vending Machine', cat: 'street', tags: ['town', 'city'], fill: 0.85, variants: 3, weight: 3,
  build(b, r, v) {
    const col = [C.red, C.blue, C.tangerine][v];
    b.boxOn(1.06, 1.86, 0.74, col, {});
    b.box(0.66, 1.16, 0.03, C.charcoal, { x: -0.16, y: 1.2, z: 0.375 });
    for (let row = 0; row < 4; row++) for (let cc = 0; cc < 4; cc++) {
      b.cyl(0.055, 0.055, 0.1, SETS.candy[(row + cc + v) % SETS.candy.length],
        { x: -0.42 + cc * 0.18, y: 0.74 + row * 0.27, z: 0.38, rx: Math.PI / 2 }, 8);
    }
    b.box(0.26, 1.5, 0.04, C.white, { x: 0.36, y: 1.06, z: 0.375 });
    b.box(0.5, 0.16, 0.05, C.charcoal, { x: -0.16, y: 0.44, z: 0.375 });
    b.box(1.06, 0.26, 0.06, C.charcoal, { y: 1.96, z: 0.02 });
  } });

P({ id: 'phonebooth', name: 'Phone Booth', cat: 'street', tags: ['town', 'city'], fill: 0.45, weight: 2,
  build(b) {
    b.boxOn(1.0, 0.16, 1.0, C.steelDark, {});
    for (const [x, z] of [[-0.47, 0], [0.47, 0], [0, -0.47]]) {
      b.box(x === 0 ? 1.0 : 0.06, 2.1, x === 0 ? 0.06 : 1.0, C.green, { x, y: 1.2, z });
    }
    b.box(0.9, 1.7, 0.04, C.glass, { y: 1.2, z: -0.45 });
    for (const s of [-1, 1]) b.box(0.04, 1.7, 0.86, C.glass, { x: s * 0.45, y: 1.2 });
    b.box(1.1, 0.2, 1.1, C.green, { y: 2.32 });
    b.box(0.7, 0.12, 0.03, C.white, { y: 2.3, z: -0.53 });
    b.box(0.28, 0.4, 0.14, C.charcoal, { x: 0.2, y: 1.35, z: -0.36 });
  } });

P({ id: 'busstop', name: 'Bus Shelter', cat: 'street', tags: ['town', 'city'], fill: 0.16, weight: 2,
  build(b) {
    for (const s of [-1, 1]) b.cylOn(0.06, 2.5, C.steelDark, { x: s * 1.6, z: -0.6 }, 8);
    for (const s of [-1, 1]) b.cylOn(0.06, 2.5, C.steelDark, { x: s * 1.6, z: 0.6 }, 8);
    b.box(3.6, 0.12, 1.5, C.steelDark, { y: 2.55 });
    b.box(3.4, 1.7, 0.05, C.glass, { y: 1.5, z: -0.62 });
    b.box(3.2, 0.06, 0.4, C.wood, { y: 0.5, z: -0.36 });
    for (const s of [-1, 1]) b.box(0.06, 0.5, 0.4, C.steelDark, { x: s * 1.4, y: 0.25, z: -0.36 });
    b.box(0.9, 0.6, 0.06, C.blue, { x: 1.2, y: 2.0, z: 0.6 });
  } });

P({ id: 'kiosk', name: 'Newspaper Kiosk', cat: 'shop', tags: ['town', 'city'], fill: 0.5, weight: 2,
  build(b, r) {
    b.boxOn(2.4, 2.2, 1.8, C.cream, {});
    b.box(2.7, 0.14, 2.1, C.redDark, { y: 2.26 });
    b.box(2.5, 0.5, 0.9, C.red, { y: 2.05, z: 1.1, rx: 0.4 });
    b.box(2.0, 0.9, 0.06, C.charcoal, { y: 1.3, z: 0.91 });
    for (let i = 0; i < 6; i++) {
      b.box(0.25, 0.34, 0.03, [C.white, C.lemon, C.cyan][i % 3], { x: -0.8 + i * 0.32, y: 1.3, z: 0.94, rz: (r() - 0.5) * 0.2 });
    }
    b.box(2.2, 0.08, 0.4, C.wood, { y: 0.84, z: 1.0 });
  } });

P({ id: 'mopeds', name: 'Scooter', cat: 'vehicle', tags: ['town', 'city'], fill: 0.2, variants: 3, weight: 3,
  build(b, r, v) {
    const col = [C.red, C.white, C.teal][v];
    for (const [x, R] of [[-0.62, 0.22], [0.62, 0.22]]) {
      b.torus(R, 0.06, C.charcoal, { x, y: R, ry: Math.PI / 2 }, 6, 14);
      b.cyl(0.1, 0.1, 0.06, C.steel, { x, y: R, rz: Math.PI / 2 }, 10);
    }
    b.slab(1.0, 0.34, 0.36, col, { y: 0.5 });
    b.box(0.6, 0.08, 0.34, C.charcoal, { x: -0.1, y: 0.42 });
    b.slab(0.44, 0.14, 0.32, C.charcoal, { x: -0.36, y: 0.78 });
    b.box(0.3, 0.62, 0.34, col, { x: 0.56, y: 0.75, rz: -0.25 });
    b.box(0.1, 0.05, 0.72, C.charcoal, { x: 0.62, y: 1.06 });
    b.cyl(0.11, 0.11, 0.08, C.lemon, { x: 0.72, y: 0.86, rx: Math.PI / 2, rz: Math.PI / 2 }, 10);
  } });

P({ id: 'shoppingcart', name: 'Shopping Cart', cat: 'shop', tags: ['town', 'city'], fill: 0.14, weight: 3,
  build(b) {
    const W = 0.58, D = 0.92, H = 0.6;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      b.cyl(0.06, 0.06, 0.04, C.charcoal, { x: sx * (W / 2 - 0.06), y: 0.06, z: sz * (D / 2 - 0.08), rz: Math.PI / 2 }, 8);
    }
    for (let i = 0; i < 7; i++) b.box(W, 0.014, 0.014, C.steel, { y: 0.36, z: -D / 2 + i * (D / 6) });
    for (let i = 0; i < 6; i++) {
      b.box(0.014, H * 0.7, 0.014, C.steel, { x: -W / 2 + i * (W / 5), y: 0.55, z: -D / 2 + 0.02 });
      b.box(0.014, H * 0.7, 0.014, C.steel, { x: -W / 2 + i * (W / 5), y: 0.55, z: D / 2 - 0.02 });
    }
    for (let i = 0; i < 6; i++) {
      b.box(0.014, H * 0.7, 0.014, C.steel, { x: -W / 2 + 0.02, y: 0.55, z: -D / 2 + i * (D / 5) });
      b.box(0.014, H * 0.7, 0.014, C.steel, { x: W / 2 - 0.02, y: 0.55, z: -D / 2 + i * (D / 5) });
    }
    b.box(W, 0.03, 0.03, C.red, { y: 0.92, z: -D / 2 - 0.06 });
    for (const s of [-1, 1]) b.box(0.02, 0.3, 0.02, C.steel, { x: s * (W / 2 - 0.02), y: 0.78, z: -D / 2 - 0.04 });
  } });

P({ id: 'foodcart', name: 'Ramen Cart', cat: 'shop', tags: ['town'], fill: 0.3, weight: 2,
  build(b) {
    b.boxOn(1.9, 0.9, 1.0, C.woodDark, { y: 0.24 });
    for (const s of [-1, 1]) b.cyl(0.24, 0.24, 0.1, C.charcoal, { x: s * 0.7, y: 0.24, z: 0.4, rz: Math.PI / 2 }, 12);
    for (const s of [-1, 1]) b.cylOn(0.05, 2.0, C.woodDark, { x: s * 0.85, z: -0.4 }, 8);
    b.box(2.1, 0.1, 1.2, C.redDark, { y: 2.05 });
    b.box(2.0, 0.5, 0.06, C.red, { y: 1.75, z: 0.55 });
    b.cylOn(0.13, 0.34, C.steel, { x: -0.4, y: 1.14 }, 12);
    b.cylOn(0.15, 0.05, C.charcoal, { x: -0.4, y: 1.46 }, 12);
    for (let i = 0; i < 3; i++) b.cylOn(0.06, 0.06, C.white, { x: 0.2 + i * 0.16, y: 1.14 }, 10);
    b.box(0.4, 0.7, 0.04, C.white, { x: 0.75, y: 1.6, z: 0.5 });
  } });

/* ---------------------------------------------------------- *
   Vehicles
 * ---------------------------------------------------------- */

function wheels(b, halfW, wz, R, W = 0.22) {
  for (const sx of [-1, 1]) for (const z of wz) {
    b.cyl(R, R, W, C.charcoal, { x: sx * halfW, y: R, z, rz: Math.PI / 2 }, 8);
    b.cyl(R * 0.55, R * 0.55, W + 0.02, C.steel, { x: sx * halfW, y: R, z, rz: Math.PI / 2 }, 6);
  }
}

P({ id: 'car', name: 'Family Car', cat: 'vehicle', tags: ['town', 'city'], fill: 0.42, variants: 6, weight: 6,
  build(b, r, v) {
    const col = SETS.car[v % SETS.car.length];
    const L = 4.2, W = 1.72;
    wheels(b, W / 2 - 0.03, [-L / 2 + 1.0, L / 2 - 1.0], 0.31, 0.2);
    b.slab(W, 0.62, L, col, { y: 0.62 });
    b.slab(W - 0.14, 0.56, L * 0.5, col, { y: 1.12, z: -0.15 });
    b.box(W - 0.2, 0.42, L * 0.46, C.glassDark, { y: 1.14, z: -0.15 });
    for (const s of [-1, 1]) b.box(0.04, 0.34, L * 0.42, C.glass, { x: s * (W / 2 - 0.08), y: 1.12, z: -0.15 });
    for (const s of [-1, 1]) {
      b.box(0.3, 0.16, 0.1, C.lemon, { x: s * (W / 2 - 0.28), y: 0.72, z: L / 2 - 0.03 });
      b.box(0.3, 0.14, 0.1, C.red, { x: s * (W / 2 - 0.28), y: 0.76, z: -L / 2 + 0.03 });
      b.box(0.1, 0.12, 0.18, col, { x: s * (W / 2 + 0.03), y: 1.14, z: L * 0.22 });
    }
    b.box(W * 0.9, 0.1, 0.1, C.steelDark, { y: 0.5, z: L / 2 });
    b.box(W * 0.9, 0.1, 0.1, C.steelDark, { y: 0.5, z: -L / 2 });
  } });

P({ id: 'keitruck', name: 'Little Truck', cat: 'vehicle', tags: ['town', 'city'], fill: 0.38, variants: 3, weight: 4,
  build(b, r, v) {
    const col = [C.white, C.sky, C.lime][v];
    const L = 3.4, W = 1.48;
    wheels(b, W / 2 - 0.02, [-L / 2 + 0.75, L / 2 - 0.7], 0.29, 0.19);
    b.box(W, 0.5, L, col, { y: 0.56 });
    b.box(W, 0.86, 1.2, col, { y: 1.2, z: L / 2 - 0.65 });
    b.box(W - 0.14, 0.5, 0.06, C.glassDark, { y: 1.3, z: L / 2 - 0.06 });
    for (const s of [-1, 1]) b.box(0.05, 0.44, 1.0, C.glass, { x: s * (W / 2 - 0.02), y: 1.28, z: L / 2 - 0.65 });
    b.box(W, 0.5, L * 0.5, col, { y: 1.0, z: -L * 0.24 });
    b.box(W - 0.18, 0.42, L * 0.46, C.charcoal, { y: 1.02, z: -L * 0.24 });
    for (const s of [-1, 1]) b.box(0.26, 0.14, 0.08, C.lemon, { x: s * (W / 2 - 0.24), y: 0.72, z: L / 2 + 0.01 });
  } });

P({ id: 'van', name: 'Delivery Van', cat: 'vehicle', tags: ['town', 'city'], fill: 0.5, variants: 3, weight: 3,
  build(b, r, v) {
    const col = [C.white, C.tangerine, C.blue][v];
    const L = 5.4, W = 2.0;
    wheels(b, W / 2 - 0.04, [-L / 2 + 1.2, L / 2 - 1.1], 0.36, 0.24);
    b.box(W, 1.9, L * 0.72, col, { y: 1.35, z: -L * 0.13 });
    b.box(W, 1.1, L * 0.3, col, { y: 0.95, z: L * 0.35 });
    b.box(W - 0.12, 0.6, 0.06, C.glassDark, { y: 1.25, z: L / 2 - 0.02 });
    b.box(W * 0.8, 1.2, 0.05, C.white, { x: 0.0, y: 1.5, z: -L * 0.13 - 0.02 });
    b.box(1.5, 0.7, 0.06, C.red, { y: 1.6, z: -L * 0.13 - 0.02 });
    for (const s of [-1, 1]) b.box(0.28, 0.16, 0.08, C.lemon, { x: s * (W / 2 - 0.26), y: 0.68, z: L / 2 });
  } });

P({ id: 'bus', name: 'City Bus', cat: 'vehicle', tags: ['town', 'city'], fill: 0.55, variants: 2, weight: 2,
  build(b, r, v) {
    const col = v ? C.green : C.blue;
    const L = 10.5, W = 2.5, H = 3.0;
    wheels(b, W / 2 - 0.06, [-L / 2 + 1.9, L / 2 - 1.6], 0.5, 0.3);
    // Side skirt. Without it the body sits 50cm up on four wheels, and since
    // collision now follows the geometry part by part, a katamari at the
    // town's 50cm starting size fits underneath and rolls straight through a
    // bus. Real buses have skirts for the same reason they look wrong here
    // without one. `npm run underpass` is what catches this class of thing.
    b.box(W - 0.06, 0.46, L - 0.8, C.charcoal, { y: 0.29 });
    b.box(W, H - 0.6, L, col, { y: 0.5 + (H - 0.6) / 2 });
    b.box(W + 0.02, 0.42, L, C.white, { y: 2.55 });
    b.box(W - 0.08, 0.1, L - 0.1, C.offwhite, { y: 3.0 });
    b.box(W - 0.16, 0.9, 0.06, C.glassDark, { y: 1.9, z: L / 2 });
    for (const s of [-1, 1]) for (let i = 0; i < 5; i++) {
      b.box(0.06, 0.8, 1.5, C.glass, { x: s * (W / 2 - 0.01), y: 1.95, z: -L / 2 + 1.2 + i * 1.9 });
    }
    b.box(1.3, 0.4, 0.05, C.charcoal, { y: 2.66, z: L / 2 + 0.01 });
    b.box(1.1, 0.24, 0.06, C.lemon, { y: 2.66, z: L / 2 + 0.03 });
  } });

P({ id: 'tractor', name: 'Tractor', cat: 'vehicle', tags: ['town'], fill: 0.3, weight: 2,
  build(b) {
    b.torus(0.78, 0.24, C.charcoal, { x: -0.86, y: 0.78, z: -0.9, ry: Math.PI / 2 }, 6, 14);
    b.torus(0.78, 0.24, C.charcoal, { x: 0.86, y: 0.78, z: -0.9, ry: Math.PI / 2 }, 6, 14);
    for (const s of [-1, 1]) b.cyl(0.4, 0.4, 0.4, C.yellow, { x: s * 0.86, y: 0.78, z: -0.9, rz: Math.PI / 2 }, 12);
    for (const s of [-1, 1]) {
      b.cyl(0.42, 0.42, 0.3, C.charcoal, { x: s * 0.72, y: 0.42, z: 1.2, rz: Math.PI / 2 }, 12);
      b.cyl(0.22, 0.22, 0.32, C.yellow, { x: s * 0.72, y: 0.42, z: 1.2, rz: Math.PI / 2 }, 10);
    }
    b.box(1.0, 0.6, 2.6, C.green, { y: 0.9, z: 0.2 });
    b.box(0.9, 0.7, 1.0, C.green, { y: 1.4, z: -0.7 });
    b.slab(0.7, 0.2, 0.5, C.charcoal, { y: 1.8, z: -0.9 });
    b.cylOn(0.09, 0.9, C.steelDark, { y: 1.2, z: 0.9 }, 8);
    b.cyl(0.28, 0.28, 0.06, C.charcoal, { y: 2.0, z: -0.2, rx: 1.0 }, 12);
    for (const s of [-1, 1]) b.cylOn(0.05, 1.6, C.charcoal, { x: s * 0.5, y: 1.7, z: -1.2 }, 6);
    b.box(1.2, 0.08, 0.8, C.charcoal, { y: 3.3, z: -1.2 });
  } });

/* ---------------------------------------------------------- *
   Structures
 * ---------------------------------------------------------- */

P({ id: 'fence_panel', name: 'Fence', cat: 'structure', tags: ['town'], fill: 0.12, weight: 3,
  build(b) {
    for (let i = 0; i < 9; i++) b.boxOn(0.1, 1.1, 0.03, C.woodPale, { x: -0.9 + i * 0.225 });
    b.box(2.05, 0.09, 0.045, C.wood, { y: 0.9 });
    b.box(2.05, 0.09, 0.045, C.wood, { y: 0.35 });
  } });

P({ id: 'torii', name: 'Torii Gate', cat: 'structure', tags: ['town', 'city'], fill: 0.14, weight: 2,
  build(b) {
    for (const s of [-1, 1]) b.taperOn(0.16, 0.2, 3.4, C.red, { x: s * 1.5 }, 10);
    b.box(4.3, 0.2, 0.34, C.red, { y: 3.05 });
    b.box(4.9, 0.26, 0.44, C.redDark, { y: 3.5, rz: 0.0 });
    b.box(5.0, 0.14, 0.5, C.redDark, { y: 3.66 });
    b.box(0.3, 0.44, 0.28, C.red, { y: 3.26 });
  } });

P({ id: 'shrine', name: 'Little Shrine', cat: 'structure', tags: ['town'], fill: 0.35, weight: 2,
  build(b) {
    b.boxOn(2.0, 0.4, 1.6, C.concrete, {});
    b.boxOn(1.5, 1.5, 1.2, C.woodRed, { y: 0.4 });
    b.box(1.0, 1.1, 0.06, C.charcoal, { y: 1.15, z: 0.62 });
    b.wedge(2.4, 0.7, 2.0, C.roofTile, { y: 1.9 });
    b.box(2.5, 0.12, 2.1, C.charcoal, { y: 1.9 });
    b.cylOn(0.05, 0.5, C.gold, { y: 2.6 }, 8);
  } });

P({ id: 'house_small', name: 'Little House', cat: 'structure', tags: ['town', 'city'], fill: 0.5, variants: 4, weight: 4,
  build(b, r, v) {
    const wallCol = [C.cream, C.offwhite, C.tan, C.lightgrey][v];
    const roofCol = [C.roofTile, C.roofRed, C.charcoal, C.greenDark][v];
    const W = 7.5, D = 6.5, H = 3.2;
    b.boxOn(W, H, D, wallCol, {});
    b.box(W + 0.3, 0.2, D + 0.3, C.woodDark, { y: H });
    // The roof's flat underside sits INSIDE the eaves band, not flush on top
    // of it. Flush meant two large coplanar horizontal faces at exactly
    // y = H + 0.1, which z-fights across the whole roof footprint and reads
    // as blue/brown stripes from any distance.
    b.wedge(W + 0.5, 2.1, D + 0.5, roofCol, { y: H - 0.04 });
    b.box(0.9, 2.0, 0.12, C.woodDark, { y: 1.0, z: D / 2 });
    b.sphere(0.07, C.gold, { x: 0.3, y: 1.0, z: D / 2 + 0.08 }, 6, 5);
    for (const s of [-1, 1]) {
      b.box(1.3, 1.1, 0.1, C.glass, { x: s * 2.2, y: 2.0, z: D / 2 });
      b.box(1.4, 0.12, 0.16, C.white, { x: s * 2.2, y: 1.42, z: D / 2 });
      b.box(0.1, 1.1, 1.3, C.glass, { x: s * W / 2, y: 2.0, z: -0.6 });
    }
    b.boxOn(0.7, 1.4, 0.7, C.brick, { x: -W / 2 + 1.6, y: H + 1.0, z: -D / 4 });
  } });

P({ id: 'shop_front', name: 'Corner Shop', cat: 'structure', tags: ['town', 'city'], fill: 0.55, variants: 3, weight: 3,
  build(b, r, v) {
    const W = 9, D = 7.5, H = 4.4;
    b.boxOn(W, H, D, [C.offwhite, C.cream, C.concrete][v], {});
    b.box(W - 0.6, 2.4, 0.2, C.glass, { y: 1.5, z: D / 2 });
    b.box(1.1, 2.4, 0.24, C.charcoal, { x: -W / 2 + 1.4, y: 1.4, z: D / 2 });
    b.box(W, 0.5, 1.6, [C.red, C.green, C.blue][v], { y: 3.2, z: D / 2 + 0.5, rx: -0.2 });
    for (let i = 0; i < 7; i++) b.box(W / 7 - 0.06, 0.52, 1.62, C.white, { x: -W / 2 + (i + 0.5) * (W / 7), y: 3.2, z: D / 2 + 0.5, rx: -0.2 });
    b.box(W * 0.7, 0.9, 0.14, C.yellow, { y: 4.0, z: D / 2 });
    b.box(W + 0.2, 0.3, D + 0.2, C.concreteD, { y: H });
    b.boxOn(1.4, 0.9, 1.0, C.steelDark, { x: W / 2 - 1.2, y: H, z: -D / 4 });
  } });

P({ id: 'playslide', name: 'Playground Slide', cat: 'structure', tags: ['town'], fill: 0.16, weight: 2,
  build(b) {
    for (const s of [-1, 1]) b.cylOn(0.05, 2.2, C.steelDark, { x: s * 0.5, z: -1.3 }, 8);
    b.box(1.1, 0.08, 1.0, C.blue, { y: 2.2, z: -1.3 });
    for (const s of [-1, 1]) b.box(0.06, 0.9, 1.0, C.yellow, { x: s * 0.52, y: 2.6, z: -1.3 });
    b.box(1.0, 0.1, 3.6, C.red, { y: 1.25, z: 0.55, rx: 0.62 });
    for (const s of [-1, 1]) b.box(0.08, 0.34, 3.6, C.yellow, { x: s * 0.5, y: 1.4, z: 0.55, rx: 0.62 });
    b.box(1.0, 0.08, 0.5, C.red, { y: 0.16, z: 2.3 });
    for (let i = 0; i < 6; i++) b.box(0.9, 0.06, 0.1, C.steel, { y: 0.3 + i * 0.34, z: -1.85 - i * 0.06 });
  } });

P({ id: 'swingset', name: 'Swing Set', cat: 'structure', tags: ['town'], fill: 0.08, weight: 2,
  build(b) {
    for (const sz of [-1, 1]) for (const sx of [-1, 1]) {
      b.cyl(0.07, 0.07, 2.9, C.steelDark, { x: sx * 1.9, y: 1.4, z: sz * 0.8, rz: sx * -0.28, rx: sz * -0.28 }, 8);
    }
    b.cyl(0.08, 0.08, 4.2, C.steelDark, { y: 2.72, rz: Math.PI / 2 }, 8);
    for (const s of [-1, 1]) {
      for (const t of [-1, 1]) b.box(0.03, 1.9, 0.03, C.steel, { x: s * 0.8 + t * 0.22, y: 1.75 });
      b.box(0.5, 0.06, 0.24, C.red, { x: s * 0.8, y: 0.8 });
    }
  } });

P({ id: 'fountain', name: 'Fountain', cat: 'structure', tags: ['town', 'city'], fill: 0.35, weight: 2,
  build(b) {
    b.lathe([[0.001, 0], [2.2, 0], [2.2, 0.5], [2.0, 0.55], [2.0, 0.16], [0.001, 0.14]], C.concrete, {}, 20);
    b.cylOn(1.98, 0.16, C.water, { y: 0.14 }, 20);
    b.taperOn(0.28, 0.5, 0.9, C.concreteD, { y: 0.2 }, 12);
    b.lathe([[0.001, 0], [0.9, 0.06], [0.85, 0.18], [0.001, 0.16]], C.concrete, { y: 1.05 }, 16);
    b.cylOn(0.14, 0.7, C.concreteD, { y: 1.2 }, 10);
    b.sphere(0.3, C.water, { y: 2.1 }, 12, 9);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      b.ellip(0.05, 0.4, 0.05, C.water, { x: Math.cos(a) * 0.45, y: 1.95, z: Math.sin(a) * 0.45, rz: Math.cos(a) * 0.5, rx: -Math.sin(a) * 0.5 }, 6, 5);
    }
  } });

P({ id: 'statue', name: 'Bronze Statue', cat: 'structure', tags: ['town', 'city'], fill: 0.3, weight: 2,
  build(b) {
    b.boxOn(1.5, 0.3, 1.5, C.concreteD, {});
    b.boxOn(1.1, 1.6, 1.1, C.concrete, { y: 0.3 });
    b.box(1.3, 0.16, 1.3, C.concreteD, { y: 1.98 });
    b.person(2.4, C.teal, C.teal, C.teal, C.teal, { y: 2.06 });
    b.box(0.6, 0.3, 0.06, C.gold, { y: 1.2, z: 0.57 });
  } });

P({ id: 'dumpster', name: 'Dumpster', cat: 'street', tags: ['town', 'city'], fill: 0.6, weight: 3,
  build(b) {
    b.box(2.1, 1.2, 1.3, C.greenDark, { y: 0.78 });
    b.box(2.2, 0.14, 1.4, C.charcoal, { y: 1.42 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.cyl(0.16, 0.16, 0.1, C.charcoal, { x: sx * 0.85, y: 0.16, z: sz * 0.5, rz: Math.PI / 2 }, 8);
    b.box(2.15, 0.06, 0.5, C.charcoal, { y: 1.5, z: -0.3, rx: -0.15 });
  } });

P({ id: 'crate_stack', name: 'Crate Stack', cat: 'street', tags: ['town', 'city'], fill: 0.7, weight: 3,
  build(b, r) {
    for (let i = 0; i < 3; i++) {
      const s = 0.9 - i * 0.06;
      b.boxOn(s, 0.7, s, i % 2 ? C.woodDark : C.wood, { y: i * 0.72, ry: (r() - 0.5) * 0.4 });
      b.box(s + 0.02, 0.08, s + 0.02, C.woodDark, { y: i * 0.72 + 0.6 });
    }
  } });

P({ id: 'oildrum', name: 'Oil Drum', cat: 'street', tags: ['town', 'city'], fill: 0.6, variants: 3, weight: 3,
  build(b, r, v) {
    const col = [C.blue, C.red, C.yellow][v];
    b.cylOn(0.3, 0.88, col, {}, 14);
    for (const y of [0.22, 0.66]) b.cyl(0.315, 0.315, 0.06, C.steelDark, { y }, 14);
    b.cyl(0.31, 0.31, 0.05, C.steelDark, { y: 0.88 }, 14);
    b.cyl(0.06, 0.06, 0.03, C.charcoal, { x: 0.14, y: 0.9 }, 8);
  } });

P({ id: 'cow', name: 'Cow', cat: 'critter', tags: ['town'], fill: 0.35, weight: 2,
  build(b, r) {
    b.critter(2.3, C.white, C.cream);
    for (let i = 0; i < 6; i++) {
      const a = r() * Math.PI * 2, e = 0.4 + r() * 1.4;
      b.ellip(0.16, 0.1, 0.2, C.charcoal, {
        x: Math.sin(e) * Math.cos(a) * 0.4, y: 0.6 + Math.cos(e) * 0.28, z: Math.sin(e) * Math.sin(a) * 0.55,
      }, 8, 6);
    }
    for (const s of [-1, 1]) b.cone(0.05, 0.16, C.cream, { x: s * 0.16, y: 1.1, z: 0.78, rz: s * 0.5 }, 6);
  } });

P({ id: 'sheep', name: 'Sheep', cat: 'critter', tags: ['town'], fill: 0.4, weight: 2,
  build(b, r) {
    const L = 1.2;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.cylOn(0.05, 0.34, C.charcoal, { x: sx * 0.16, z: sz * 0.28 }, 6);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      b.sphere(0.2, C.white, { x: Math.cos(a) * 0.16, y: 0.56 + Math.sin(a * 2) * 0.05, z: Math.sin(a) * 0.3 }, 10, 7);
    }
    b.ellip(0.24, 0.22, 0.34, C.white, { y: 0.56 }, 12, 8);
    b.ellip(0.12, 0.15, 0.16, C.charcoal, { y: 0.62, z: 0.42 }, 10, 7);
    for (const s of [-1, 1]) b.ellip(0.05, 0.03, 0.09, C.charcoal, { x: s * 0.12, y: 0.68, z: 0.4 }, 6, 5);
    for (const s of [-1, 1]) b.sphere(0.022, C.black, { x: s * 0.06, y: 0.66, z: 0.55 }, 6, 4);
  } });

P({ id: 'telephonepole', name: 'Telephone Pole', cat: 'structure', tags: ['town', 'city'], fill: 0.1, weight: 3,
  build(b) {
    b.cyl(0.14, 0.19, 8.5, C.woodDark, { y: 4.25 }, 10);
    for (let i = 0; i < 2; i++) {
      const y = 7.4 - i * 0.9;
      b.box(2.4, 0.12, 0.12, C.woodDark, { y });
      for (let k = -2; k <= 2; k++) b.cylOn(0.04, 0.2, C.glassDark, { x: k * 0.5, y: y + 0.06 }, 6);
    }
    b.box(0.5, 0.6, 0.4, C.steelDark, { y: 6.2, z: 0.2 });
  } });
