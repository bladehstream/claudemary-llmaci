/* ============================================================
   Plants, rocks, weather. Shared across every stage.
   ============================================================ */

import { defineProp } from './index.js';
import { C } from '../../render/palette.js';

const P = defineProp;

P({ id: 'grasstuft', name: 'Tuft of Grass', cat: 'nature', tags: ['house', 'town'], fill: 0.15, variants: 3, weight: 6,
  build(b, r) {
    for (let i = 0; i < 9; i++) {
      const a = r() * Math.PI * 2, d = r() * 0.05, h = 0.07 + r() * 0.1;
      b.ellip(0.008, h, 0.014, r() < 0.5 ? C.grass : C.grassDark,
        { x: Math.cos(a) * d, y: h * 0.5, z: Math.sin(a) * d, rz: (r() - 0.5) * 0.8, rx: (r() - 0.5) * 0.8 }, 4, 4);
    }
  } });

P({ id: 'flower', name: 'Flower', cat: 'nature', tags: ['house', 'town'], fill: 0.14, variants: 5, weight: 5,
  build(b, r, v) {
    const cols = [C.hotpink, C.yellow, C.white, C.violet, C.orange];
    const col = cols[v];
    const h = 0.2 + r() * 0.14;
    b.cylOn(0.008, h, C.greenDark, {}, 5);
    b.ellip(0.05, 0.01, 0.024, C.green, { x: 0.035, y: h * 0.45, rz: 0.4 }, 6, 4);
    for (let p = 0; p < 6; p++) {
      const a = (p / 6) * Math.PI * 2;
      b.ellip(0.036, 0.01, 0.02, col, { x: Math.cos(a) * 0.033, y: h, z: Math.sin(a) * 0.033, ry: a }, 6, 4);
    }
    b.sphere(0.018, C.yellow, { y: h + 0.005 }, 8, 6);
  } });

P({ id: 'mushroom', name: 'Mushroom', cat: 'nature', tags: ['house', 'town'], fill: 0.35, variants: 3, weight: 3,
  build(b, r, v) {
    const capCol = [C.red, C.tan, C.brown][v];
    b.taperOn(0.018, 0.026, 0.055, C.cream, {}, 10);
    b.dome(0.045, capCol, { y: 0.05 }, 12);
    if (v === 0) for (let i = 0; i < 5; i++) {
      const a = r() * Math.PI * 2, d = r() * 0.03;
      b.ellip(0.008, 0.004, 0.008, C.white, { x: Math.cos(a) * d, y: 0.05 + Math.sqrt(Math.max(0, 0.002 - d * d * 0.5)) + 0.038, z: Math.sin(a) * d }, 6, 4);
    }
  } });

P({ id: 'rock_small', name: 'Pebble', cat: 'nature', tags: ['house', 'town', 'city'], fill: 0.6, variants: 4, weight: 4,
  build(b, r) {
    const s = 0.05 + r() * 0.05;
    b.ellip(s, s * (0.6 + r() * 0.3), s * (0.8 + r() * 0.4), C.grey, { y: s * 0.5 }, 8, 6);
    b.ellip(s * 0.5, s * 0.4, s * 0.5, C.lightgrey, { x: s * 0.3, y: s * 0.7, z: -s * 0.2 }, 7, 5);
  } });

P({ id: 'rock_big', name: 'Boulder', cat: 'nature', tags: ['town', 'city'], fill: 0.62, variants: 4, weight: 3,
  build(b, r) {
    const s = 0.7 + r() * 0.6;
    b.ellip(s, s * 0.72, s * 0.9, C.grey, { y: s * 0.6 }, 10, 7);
    for (let i = 0; i < 3; i++) {
      const a = r() * Math.PI * 2;
      b.ellip(s * 0.5, s * 0.4, s * 0.5, i % 2 ? C.lightgrey : C.darkgrey,
        { x: Math.cos(a) * s * 0.5, y: s * (0.4 + r() * 0.5), z: Math.sin(a) * s * 0.5 }, 8, 6);
    }
  } });

P({ id: 'bush', name: 'Bush', cat: 'nature', tags: ['house', 'town', 'city'], fill: 0.4, variants: 3, weight: 5,
  build(b, r, v) {
    const col = [C.leaf, C.leafDark, C.leafLime][v];
    b.canopy(0.42, col, { y: 0.4 }, r, 6);
  } });

P({ id: 'sapling', name: 'Sapling', cat: 'nature', tags: ['house', 'town'], fill: 0.2, weight: 4,
  build(b, r) {
    b.cyl(0.035, 0.05, 1.1, C.trunk, { y: 0.55 }, 7);
    b.canopy(0.42, C.leafLime, { y: 1.25 }, r, 4);
  } });

P({ id: 'tree_round', name: 'Round Tree', cat: 'nature', tags: ['town', 'city'], fill: 0.2, variants: 3, weight: 6,
  build(b, r, v) {
    const H = 4.6 + v * 1.1;
    b.cyl(0.16, 0.3, H * 0.5, C.trunk, { y: H * 0.25 }, 8);
    for (const s of [-1, 1]) b.cyl(0.07, 0.11, H * 0.24, C.trunk, { x: s * 0.28, y: H * 0.5, rz: s * -0.5 }, 6);
    b.canopy(H * 0.34, [C.leaf, C.leafDark, C.leafLime][v], { y: H * 0.72 }, r, 6);
  } });

P({ id: 'tree_pine', name: 'Pine Tree', cat: 'nature', tags: ['town', 'city'], fill: 0.22, variants: 3, weight: 4,
  build(b, r, v) {
    const H = 6.5 + v * 1.6;
    b.cyl(0.16, 0.28, H * 0.35, C.trunkDark, { y: H * 0.175 }, 8);
    for (let i = 0; i < 4; i++) {
      const t = i / 4;
      b.cone(H * (0.3 - t * 0.06), H * 0.28, C.leafDark, { y: H * (0.3 + t * 0.19) }, 10);
    }
  } });

P({ id: 'tree_palm', name: 'Palm Tree', cat: 'nature', tags: ['town', 'city'], fill: 0.12, variants: 2, weight: 3,
  build(b, r, v) {
    const H = 7 + v * 2;
    for (let i = 0; i < 8; i++) {
      const t = i / 8;
      b.cyl(0.16 - t * 0.06, 0.2 - t * 0.06, H / 8, C.tan, { x: Math.sin(t * 1.2) * 0.5, y: H * (t + 0.5) / 8 * 1.0 + t * H * 0.0, rz: -0.1 }, 7);
    }
    const topX = Math.sin(1.05) * 0.5;
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      b.ellip(0.28, 0.06, 1.5, C.leaf, {
        x: topX + Math.cos(a) * 1.1, y: H - 0.25 - 0.2, z: Math.sin(a) * 1.1,
        ry: -a, rx: 0.34,
      }, 6, 4);
    }
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      b.sphere(0.13, C.woodDark, { x: topX + Math.cos(a) * 0.2, y: H - 0.3, z: Math.sin(a) * 0.2 }, 7, 5);
    }
  } });

P({ id: 'tree_big', name: 'Great Oak', cat: 'nature', tags: ['city'], fill: 0.2, variants: 2, weight: 3,
  build(b, r, v) {
    const H = 15 + v * 5;
    b.cyl(0.6, 1.1, H * 0.42, C.trunk, { y: H * 0.21 }, 10);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      b.cyl(0.22, 0.36, H * 0.3, C.trunk, { x: Math.cos(a) * H * 0.09, y: H * 0.5, z: Math.sin(a) * H * 0.09, rz: -Math.cos(a) * 0.5, rx: Math.sin(a) * 0.5 }, 8);
    }
    b.canopy(H * 0.33, C.leafDark, { y: H * 0.74 }, r, 8);
  } });

P({ id: 'hedge', name: 'Hedge', cat: 'nature', tags: ['town', 'city'], fill: 0.7, weight: 3,
  build(b, r) {
    b.box(3.0, 1.3, 0.8, C.leafDark, { y: 0.65 });
    for (let i = 0; i < 10; i++) {
      b.sphere(0.24 + r() * 0.12, C.leaf, { x: (r() - 0.5) * 2.9, y: 1.2 + r() * 0.16, z: (r() - 0.5) * 0.7 }, 8, 6);
    }
  } });

P({ id: 'cloud_puff', name: 'Cloud', cat: 'sky', tags: ['city'], fill: 0.35, variants: 3, weight: 4,
  build(b, r, v) {
    const s = 9 + v * 5;
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      b.ellip(s * (0.3 + r() * 0.22), s * (0.22 + r() * 0.14), s * (0.28 + r() * 0.2), C.cloud,
        { x: Math.cos(a) * s * 0.42, y: s * 0.3 + (r() - 0.5) * s * 0.14, z: Math.sin(a) * s * 0.3 }, 10, 7);
    }
    b.ellip(s * 0.44, s * 0.34, s * 0.4, C.cloud, { y: s * 0.36 }, 12, 8);
  } });
