/* ============================================================
   Household objects — the 5cm to 2m range.
   All dimensions are real metres.
   ============================================================ */

import { defineProp } from './index.js';
import { C, SETS } from '../../render/palette.js';

const P = defineProp;

/* ---------------------------------------------------------- *
   Desk-top miniatures (1cm – 5cm)
 * ---------------------------------------------------------- */

P({ id: 'thumbtack', name: 'Thumbtack', cat: 'stationery', tags: ['house'], fill: 0.3, variants: 4, weight: 3,
  build(b, r, v) {
    const col = SETS.candy[v % SETS.candy.length];
    b.cylOn(0.005, 0.0055, col, { y: 0.0035 }, 10);
    b.dome(0.005, col, { y: 0.009 }, 10);
    b.cone(0.0009, 0.0075, C.steel, { y: 0.0037, rx: Math.PI }, 6);
  } });

P({ id: 'paperclip', name: 'Paper Clip', cat: 'stationery', tags: ['house'], fill: 0.12, weight: 3,
  build(b) {
    const t = 0.0006;
    b.box(0.031, t * 2, 0.004, C.steel, { y: t });
    b.box(0.031, t * 2, 0.004, C.steel, { y: t, z: 0.0045 });
    b.box(t * 2, t * 2, 0.0045, C.steel, { x: 0.0155, y: t, z: 0.0022 });
    b.box(0.022, t * 2, 0.004, C.steel, { x: -0.004, y: t * 3, z: 0.0022 });
  } });

P({ id: 'stamp', name: 'Postage Stamp', cat: 'paper', tags: ['house'], fill: 0.9, variants: 3, weight: 2,
  build(b, r, v) {
    b.box(0.024, 0.0004, 0.02, C.paper, { y: 0.0002 });
    b.box(0.017, 0.0006, 0.013, [C.hotpink, C.teal, C.tangerine][v], { y: 0.0005 });
  } });

P({ id: 'coin', name: 'Coin', cat: 'treasure', tags: ['house', 'town'], fill: 0.78, variants: 3, weight: 3,
  build(b, r, v) {
    const col = [C.gold, C.steel, C.copper][v];
    b.cylOn(0.0115, 0.0018, col, {}, 14);
    b.cylOn(0.0085, 0.0022, col, {}, 14);
  } });

P({ id: 'die', name: 'Die', cat: 'toy', tags: ['house'], fill: 0.95, weight: 2,
  build(b) {
    b.boxOn(0.016, 0.016, 0.016, C.white, {});
    const pip = (x, y, z) => b.sphere(0.0016, C.black, { x, y, z }, 6, 4);
    pip(0, 0.008, 0);                                  // 1 top
    pip(-0.008, 0.011, -0.004); pip(-0.008, 0.005, 0.004); // 2 left
    for (const s of [-1, 1]) pip(s * 0.004, 0.012, 0.008);
    pip(0, 0.008, 0.008);
  } });

P({ id: 'candy', name: 'Wrapped Candy', cat: 'food', tags: ['house'], fill: 0.4, variants: 5, weight: 4,
  build(b, r, v) {
    const col = SETS.candy[v % SETS.candy.length];
    b.ellip(0.008, 0.006, 0.008, col, { y: 0.006 }, 10, 7);
    for (const s of [-1, 1]) b.cone(0.005, 0.008, col, { x: s * 0.0115, y: 0.006, rz: s * Math.PI / 2 }, 6);
  } });

P({ id: 'caramel', name: 'Caramel', cat: 'food', tags: ['house'], fill: 0.85, weight: 3,
  build(b) {
    b.boxOn(0.019, 0.011, 0.019, C.woodPale, {});
    b.box(0.02, 0.004, 0.02, C.woodDark, { y: 0.0055 });
  } });

P({ id: 'sugarcube', name: 'Sugar Cube', cat: 'food', tags: ['house'], fill: 0.95, weight: 2,
  build(b) { b.boxOn(0.015, 0.013, 0.015, C.white, {}); } });

P({ id: 'marble', name: 'Marble', cat: 'toy', tags: ['house'], fill: 0.52, variants: 4, weight: 3,
  build(b, r, v) {
    b.sphere(0.008, C.glass, { y: 0.008 }, 12, 9);
    b.ellip(0.0028, 0.006, 0.0028, SETS.candy[v], { y: 0.008, rz: 0.6 }, 8, 6);
  } });

P({ id: 'battery', name: 'AA Battery', cat: 'gadget', tags: ['house'], fill: 0.78, weight: 2,
  build(b) {
    b.cylOn(0.007, 0.048, C.tangerine, {}, 12);
    b.cylOn(0.0071, 0.008, C.charcoal, { y: 0.001 }, 12);
    b.cylOn(0.0035, 0.0025, C.steel, { y: 0.048 }, 10);
  } });

P({ id: 'bottlecap', name: 'Bottle Cap', cat: 'junk', tags: ['house', 'town'], fill: 0.45, variants: 3, weight: 3,
  build(b, r, v) {
    const col = [C.red, C.green, C.blue][v];
    b.cylOn(0.0145, 0.006, col, {}, 16);
    b.cylOn(0.0155, 0.0025, col, { y: 0.0005 }, 16);
  } });

P({ id: 'peanut', name: 'Peanut', cat: 'food', tags: ['house'], fill: 0.5, weight: 2,
  build(b) {
    b.ellip(0.008, 0.008, 0.011, C.tan, { y: 0.009, z: -0.007 }, 10, 7);
    b.ellip(0.0085, 0.0085, 0.012, C.tan, { y: 0.009, z: 0.007 }, 10, 7);
  } });

P({ id: 'ladybug', name: 'Ladybug', cat: 'critter', tags: ['house', 'town'], fill: 0.5, weight: 2,
  build(b) {
    b.dome(0.006, C.red, { y: 0.002 }, 12);
    b.sphere(0.0035, C.black, { y: 0.0035, z: 0.005 }, 8, 6);
    b.box(0.0004, 0.006, 0.012, C.black, { y: 0.005 });
    for (const s of [-1, 1]) {
      b.sphere(0.0011, C.black, { x: s * 0.0028, y: 0.006, z: -0.001 }, 5, 4);
      b.sphere(0.0011, C.black, { x: s * 0.0035, y: 0.0055, z: 0.0022 }, 5, 4);
    }
  } });

P({ id: 'key', name: 'House Key', cat: 'treasure', tags: ['house'], fill: 0.2, weight: 2,
  build(b) {
    b.torus(0.008, 0.0018, C.gold, { y: 0.0018, rx: Math.PI / 2 }, 6, 12);
    b.box(0.0022, 0.0032, 0.036, C.gold, { y: 0.0016, z: 0.024 });
    b.box(0.0022, 0.0032, 0.004, C.gold, { x: 0.003, y: 0.0016, z: 0.036 });
    b.box(0.0022, 0.0032, 0.004, C.gold, { x: 0.003, y: 0.0016, z: 0.028 });
  } });

P({ id: 'matchbox', name: 'Matchbox', cat: 'junk', tags: ['house'], fill: 0.85, weight: 2,
  build(b) {
    b.boxOn(0.052, 0.015, 0.035, C.tangerine, {});
    b.box(0.053, 0.007, 0.036, C.redDark, { y: 0.0075 });
  } });

P({ id: 'eraser', name: 'Eraser', cat: 'stationery', tags: ['house'], fill: 0.9, variants: 2, weight: 3,
  build(b, r, v) {
    b.boxOn(0.042, 0.011, 0.021, v ? C.white : C.pink, {});
    b.box(0.026, 0.012, 0.022, v ? C.blue : C.hotpink, { y: 0.0055 });
  } });

P({ id: 'sushi', name: 'Nigiri Sushi', cat: 'food', tags: ['house'], fill: 0.65, variants: 3, weight: 2,
  build(b, r, v) {
    b.ellip(0.014, 0.011, 0.022, C.white, { y: 0.011 }, 10, 7);
    b.ellip(0.014, 0.005, 0.024, [C.orange, C.red, C.lemon][v], { y: 0.021 }, 10, 6);
  } });

P({ id: 'strawberry', name: 'Strawberry', cat: 'food', tags: ['house'], fill: 0.5, weight: 2,
  build(b) {
    b.cone(0.016, 0.036, C.red, { y: 0.018, rx: Math.PI }, 10);
    b.sphere(0.016, C.red, { y: 0.02 }, 10, 7);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      b.box(0.012, 0.0018, 0.006, C.green, { x: Math.cos(a) * 0.008, y: 0.036, z: Math.sin(a) * 0.008, ry: a });
    }
  } });

/* ---------------------------------------------------------- *
   Stationery & small goods (5cm – 20cm)
 * ---------------------------------------------------------- */

P({ id: 'pencil', name: 'Pencil', cat: 'stationery', tags: ['house'], fill: 0.55, variants: 3, weight: 3,
  build(b, r, v) {
    const col = [C.yellow, C.green, C.blue][v];
    b.cyl(0.004, 0.004, 0.155, col, { y: 0.004, rz: Math.PI / 2 }, 6);
    b.cyl(0.0005, 0.004, 0.014, C.woodPale, { x: 0.084, y: 0.004, rz: Math.PI / 2 }, 6);
    b.cyl(0.0042, 0.0042, 0.012, C.pink, { x: -0.083, y: 0.004, rz: Math.PI / 2 }, 6);
    b.cyl(0.0043, 0.0043, 0.008, C.steel, { x: -0.075, y: 0.004, rz: Math.PI / 2 }, 6);
  } });

P({ id: 'pen', name: 'Ballpoint Pen', cat: 'stationery', tags: ['house'], fill: 0.5, weight: 2,
  build(b) {
    b.cyl(0.0045, 0.0045, 0.13, C.navy, { y: 0.0045, rz: Math.PI / 2 }, 8);
    b.cyl(0.0008, 0.0045, 0.016, C.steel, { x: 0.071, y: 0.0045, rz: Math.PI / 2 }, 6);
    b.box(0.03, 0.0035, 0.0035, C.steel, { x: -0.04, y: 0.0085 });
  } });

P({ id: 'chopsticks', name: 'Chopsticks', cat: 'kitchen', tags: ['house'], fill: 0.25, weight: 2,
  build(b) {
    for (const s of [-1, 1]) {
      b.cyl(0.0018, 0.0033, 0.225, C.woodDark, { x: 0, y: 0.0033, z: s * 0.006, rz: Math.PI / 2 }, 6);
    }
  } });

P({ id: 'spoon', name: 'Spoon', cat: 'kitchen', tags: ['house'], fill: 0.28, weight: 2,
  build(b) {
    b.box(0.11, 0.0035, 0.011, C.chrome, { x: -0.045, y: 0.004 });
    b.ellip(0.026, 0.005, 0.018, C.chrome, { x: 0.018, y: 0.006 }, 12, 7);
    b.ellip(0.021, 0.005, 0.014, C.steelDark, { x: 0.018, y: 0.008 }, 12, 7);
  } });

P({ id: 'toothbrush', name: 'Toothbrush', cat: 'bathroom', tags: ['house'], fill: 0.3, variants: 3, weight: 2,
  build(b, r, v) {
    const col = [C.cyan, C.hotpink, C.lime][v];
    b.box(0.13, 0.006, 0.012, col, { x: -0.03, y: 0.006 });
    b.box(0.038, 0.007, 0.016, col, { x: 0.054, y: 0.006 });
    b.box(0.034, 0.008, 0.013, C.white, { x: 0.054, y: 0.0125 });
  } });

P({ id: 'lighter', name: 'Lighter', cat: 'junk', tags: ['house'], fill: 0.7, variants: 3, weight: 2,
  build(b, r, v) {
    b.boxOn(0.024, 0.062, 0.012, [C.red, C.blue, C.yellow][v], {});
    b.box(0.016, 0.012, 0.011, C.steel, { y: 0.066 });
    b.cyl(0.006, 0.006, 0.011, C.steelDark, { y: 0.07, rz: Math.PI / 2 }, 8);
  } });

P({ id: 'card_deck', name: 'Deck of Cards', cat: 'toy', tags: ['house'], fill: 0.92, weight: 2,
  build(b) {
    b.boxOn(0.063, 0.02, 0.089, C.red, {});
    b.box(0.05, 0.021, 0.072, C.white, { y: 0.01 });
    b.box(0.02, 0.022, 0.02, C.red, { y: 0.0105 });
  } });

P({ id: 'egg', name: 'Egg', cat: 'food', tags: ['house'], fill: 0.55, weight: 2,
  build(b) { b.ellip(0.022, 0.029, 0.022, C.cream, { y: 0.029 }, 12, 9); } });

P({ id: 'mandarin', name: 'Mandarin', cat: 'food', tags: ['house'], fill: 0.6, weight: 3,
  build(b) {
    b.ellip(0.031, 0.026, 0.031, C.orange, { y: 0.026 }, 12, 9);
    b.cylOn(0.003, 0.006, C.greenDark, { y: 0.05 }, 6);
    b.box(0.02, 0.001, 0.009, C.green, { x: 0.008, y: 0.055, ry: 0.4 });
  } });

P({ id: 'apple', name: 'Apple', cat: 'food', tags: ['house'], fill: 0.6, variants: 2, weight: 3,
  build(b, r, v) {
    const col = v ? C.red : C.lime;
    b.ellip(0.039, 0.036, 0.039, col, { y: 0.037 }, 12, 9);
    b.cylOn(0.0026, 0.017, C.woodDark, { y: 0.068 }, 6);
    b.ellip(0.014, 0.002, 0.008, C.green, { x: 0.012, y: 0.081, rz: -0.35 }, 8, 5);
  } });

P({ id: 'cookie', name: 'Cookie', cat: 'food', tags: ['house'], fill: 0.75, weight: 2,
  build(b, r) {
    b.cylOn(0.032, 0.009, C.tan, {}, 14);
    for (let i = 0; i < 7; i++) {
      const a = r() * Math.PI * 2, d = r() * 0.024;
      b.sphere(0.0035, C.woodDark, { x: Math.cos(a) * d, y: 0.009, z: Math.sin(a) * d }, 6, 4);
    }
  } });

P({ id: 'lightbulb', name: 'Light Bulb', cat: 'gadget', tags: ['house'], fill: 0.4, weight: 2,
  build(b) {
    b.cylOn(0.0125, 0.024, C.steelDark, {}, 12);
    b.cyl(0.026, 0.014, 0.02, C.lemon, { y: 0.033 }, 12);
    b.ellip(0.028, 0.03, 0.028, C.lemon, { y: 0.056 }, 12, 9);
  } });

P({ id: 'mouse_pc', name: 'Computer Mouse', cat: 'gadget', tags: ['house'], fill: 0.55, weight: 2,
  build(b) {
    b.ellip(0.031, 0.02, 0.055, C.lightgrey, { y: 0.016 }, 12, 8);
    b.box(0.05, 0.012, 0.09, C.lightgrey, { y: 0.006 });
    b.box(0.012, 0.014, 0.035, C.grey, { y: 0.019, z: 0.026 });
    b.box(0.006, 0.008, 0.012, C.charcoal, { y: 0.026, z: 0.03 });
  } });

P({ id: 'remote', name: 'TV Remote', cat: 'gadget', tags: ['house'], fill: 0.72, weight: 3,
  build(b, r) {
    b.boxOn(0.048, 0.022, 0.185, C.charcoal, {});
    for (let i = 0; i < 8; i++) {
      const row = Math.floor(i / 2), col = i % 2;
      b.box(0.014, 0.004, 0.011, i < 2 ? C.red : C.lightgrey,
        { x: (col - 0.5) * 0.022, y: 0.023, z: 0.06 - row * 0.028 });
    }
  } });

P({ id: 'phone', name: 'Mobile Phone', cat: 'gadget', tags: ['house', 'town'], fill: 0.9, variants: 3, weight: 3,
  build(b, r, v) {
    b.boxOn(0.072, 0.009, 0.148, C.charcoal, {});
    b.box(0.064, 0.0105, 0.128, [C.blue, C.teal, C.hotpink][v], { y: 0.005 });
  } });

P({ id: 'calculator', name: 'Calculator', cat: 'gadget', tags: ['house'], fill: 0.8, weight: 2,
  build(b) {
    b.boxOn(0.07, 0.012, 0.125, C.darkgrey, {});
    b.box(0.056, 0.013, 0.026, C.lime, { y: 0.006, z: 0.04 });
    for (let i = 0; i < 12; i++) {
      const cx = i % 3, cz = Math.floor(i / 3);
      b.box(0.014, 0.005, 0.011, C.lightgrey, { x: (cx - 1) * 0.019, y: 0.014, z: 0.008 - cz * 0.017 });
    }
  } });

P({ id: 'glasses', name: 'Spectacles', cat: 'clothing', tags: ['house'], fill: 0.18, weight: 2,
  build(b) {
    for (const s of [-1, 1]) b.torus(0.023, 0.0028, C.charcoal, { x: s * 0.026, y: 0.006, rx: Math.PI / 2 }, 6, 14);
    b.box(0.012, 0.003, 0.003, C.charcoal, { y: 0.006 });
    for (const s of [-1, 1]) b.box(0.004, 0.003, 0.056, C.charcoal, { x: s * 0.047, y: 0.006, z: -0.03 });
  } });

P({ id: 'soap', name: 'Bar of Soap', cat: 'bathroom', tags: ['house'], fill: 0.85, weight: 2,
  build(b) { b.slab(0.088, 0.03, 0.058, C.lemon, { y: 0.015 }); } });

P({ id: 'rubberduck', name: 'Rubber Duck', cat: 'toy', tags: ['house'], fill: 0.45, weight: 2,
  build(b) {
    b.ellip(0.032, 0.026, 0.04, C.yellow, { y: 0.026 }, 12, 8);
    b.sphere(0.019, C.yellow, { y: 0.056, z: 0.014 }, 12, 8);
    b.cone(0.009, 0.016, C.orange, { y: 0.054, z: 0.03, rx: Math.PI / 2 }, 8);
    for (const s of [-1, 1]) b.sphere(0.0028, C.black, { x: s * 0.008, y: 0.062, z: 0.026 }, 6, 4);
    b.ellip(0.01, 0.016, 0.014, C.yellow, { y: 0.038, z: -0.034, rx: -0.5 }, 8, 6);
  } });

P({ id: 'teacup', name: 'Teacup', cat: 'kitchen', tags: ['house'], fill: 0.4, variants: 3, weight: 3,
  build(b, r, v) {
    const col = [C.white, C.cyan, C.cream][v];
    b.lathe([[0.001, 0], [0.022, 0], [0.024, 0.004], [0.03, 0.055], [0.032, 0.062], [0.03, 0.062], [0.028, 0.008], [0.001, 0.006]], col, {}, 14);
    b.torus(0.014, 0.003, col, { x: 0.038, y: 0.035, ry: Math.PI / 2 }, 6, 12);
  } });

P({ id: 'sakecup', name: 'Sake Cup', cat: 'kitchen', tags: ['house'], fill: 0.4, weight: 2,
  build(b) {
    b.lathe([[0.001, 0], [0.012, 0], [0.014, 0.003], [0.022, 0.032], [0.023, 0.034], [0.021, 0.034], [0.02, 0.005], [0.001, 0.004]], C.white, {}, 12);
    b.cylOn(0.018, 0.002, C.blue, { y: 0.03 }, 12);
  } });

P({ id: 'toycar', name: 'Toy Car', cat: 'toy', tags: ['house'], fill: 0.55, variants: 4, weight: 3,
  build(b, r, v) {
    const col = SETS.plastic[v % SETS.plastic.length];
    b.slab(0.088, 0.024, 0.038, col, { y: 0.02 });
    b.slab(0.045, 0.02, 0.033, col, { y: 0.04, x: -0.006 });
    b.box(0.04, 0.014, 0.034, C.glass, { y: 0.042, x: -0.006 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      b.cyl(0.011, 0.011, 0.008, C.charcoal, { x: sx * 0.028, y: 0.011, z: sz * 0.019, rx: Math.PI / 2 }, 10);
    }
  } });

P({ id: 'cassette', name: 'Cassette Tape', cat: 'gadget', tags: ['house'], fill: 0.85, variants: 2, weight: 2,
  build(b, r, v) {
    b.boxOn(0.102, 0.013, 0.064, v ? C.charcoal : C.paper, {});
    b.box(0.07, 0.015, 0.03, C.white, { y: 0.007, z: 0.012 });
    for (const s of [-1, 1]) b.cyl(0.011, 0.011, 0.016, C.darkgrey, { x: s * 0.021, y: 0.0065, z: -0.008, rx: Math.PI / 2 }, 10);
  } });

P({ id: 'wristwatch', name: 'Wristwatch', cat: 'clothing', tags: ['house'], fill: 0.3, weight: 2,
  build(b) {
    b.cylOn(0.019, 0.009, C.steel, { y: 0.004 }, 14);
    b.cylOn(0.016, 0.0035, C.white, { y: 0.012 }, 14);
    b.box(0.0018, 0.001, 0.011, C.black, { y: 0.0157, z: 0.004 });
    b.box(0.009, 0.001, 0.0018, C.black, { x: 0.004, y: 0.0157 });
    for (const s of [-1, 1]) b.box(0.017, 0.004, 0.052, C.woodDark, { y: 0.002, z: s * 0.036 });
  } });

P({ id: 'wallet', name: 'Wallet', cat: 'treasure', tags: ['house', 'town'], fill: 0.8, variants: 2, weight: 2,
  build(b, r, v) {
    b.boxOn(0.112, 0.024, 0.092, v ? C.woodDark : C.charcoal, {});
    b.box(0.09, 0.026, 0.005, C.lime, { y: 0.014, z: 0.02 });
    b.box(0.114, 0.006, 0.03, C.brown, { y: 0.012 });
  } });

P({ id: 'scissors', name: 'Scissors', cat: 'stationery', tags: ['house'], fill: 0.22, weight: 2,
  build(b) {
    for (const s of [-1, 1]) {
      b.box(0.088, 0.0022, 0.009, C.chrome, { x: 0.045, y: 0.004, z: s * 0.004, ry: s * 0.06 });
      b.torus(0.017, 0.004, C.hotpink, { x: -0.055, y: 0.004, z: s * 0.016, rx: Math.PI / 2, ry: s * 0.35 }, 6, 12);
      b.box(0.04, 0.0035, 0.008, C.hotpink, { x: -0.024, y: 0.004, z: s * 0.011, ry: s * 0.2 });
    }
    b.cyl(0.005, 0.005, 0.014, C.steelDark, { y: 0.004 }, 8);
  } });

P({ id: 'stapler', name: 'Stapler', cat: 'stationery', tags: ['house'], fill: 0.5, variants: 2, weight: 2,
  build(b, r, v) {
    const col = v ? C.red : C.charcoal;
    b.boxOn(0.036, 0.018, 0.15, C.darkgrey, {});
    b.box(0.034, 0.028, 0.14, col, { y: 0.032, z: 0.005, rx: -0.05 });
    b.box(0.03, 0.014, 0.04, col, { y: 0.05, z: -0.045 });
  } });

/* ---------------------------------------------------------- *
   Housewares (15cm – 60cm)
 * ---------------------------------------------------------- */

P({ id: 'book', name: 'Paperback Book', cat: 'paper', tags: ['house'], fill: 0.88, variants: 5, weight: 5,
  build(b, r, v) {
    const col = SETS.book[v % SETS.book.length];
    b.boxOn(0.148, 0.026, 0.21, col, {});
    b.box(0.14, 0.028, 0.2, C.paper, { x: 0.006, y: 0.013 });
    b.box(0.152, 0.03, 0.03, col, { x: -0.072, y: 0.013 });
  } });

P({ id: 'hardback', name: 'Hardback Volume', cat: 'paper', tags: ['house'], fill: 0.88, variants: 4, weight: 3,
  build(b, r, v) {
    const col = SETS.book[(v + 2) % SETS.book.length];
    b.boxOn(0.17, 0.044, 0.245, col, {});
    b.box(0.16, 0.046, 0.232, C.paper, { x: 0.006, y: 0.022 });
    b.box(0.06, 0.048, 0.008, C.gold, { x: -0.03, y: 0.023, z: 0.09 });
  } });

P({ id: 'magazine', name: 'Magazine', cat: 'paper', tags: ['house'], fill: 0.9, variants: 3, weight: 3,
  build(b, r, v) {
    b.boxOn(0.21, 0.008, 0.285, C.paper, {});
    b.box(0.212, 0.0095, 0.287, [C.hotpink, C.cyan, C.tangerine][v], { y: 0.0045 });
    b.box(0.13, 0.011, 0.16, C.white, { y: 0.0045, z: -0.03 });
  } });

P({ id: 'mug', name: 'Coffee Mug', cat: 'kitchen', tags: ['house'], fill: 0.42, variants: 4, weight: 4,
  build(b, r, v) {
    const col = [C.white, C.red, C.blue, C.lime][v];
    b.lathe([[0.001, 0], [0.04, 0], [0.042, 0.005], [0.043, 0.093], [0.045, 0.097], [0.041, 0.097], [0.039, 0.01], [0.001, 0.008]], col, {}, 14);
    b.torus(0.023, 0.0055, col, { x: 0.055, y: 0.055, ry: Math.PI / 2 }, 6, 12);
  } });

P({ id: 'plate', name: 'Dinner Plate', cat: 'kitchen', tags: ['house'], fill: 0.35, weight: 3,
  build(b) {
    b.lathe([[0.001, 0.004], [0.05, 0.002], [0.09, 0.006], [0.115, 0.02], [0.12, 0.024], [0.117, 0.022], [0.088, 0.009], [0.05, 0.005], [0.001, 0.007]], C.white, {}, 18);
  } });

P({ id: 'bowl', name: 'Rice Bowl', cat: 'kitchen', tags: ['house'], fill: 0.4, variants: 2, weight: 3,
  build(b, r, v) {
    const col = v ? C.navy : C.white;
    b.lathe([[0.001, 0], [0.024, 0], [0.026, 0.008], [0.062, 0.072], [0.064, 0.076], [0.06, 0.076], [0.024, 0.014], [0.001, 0.012]], col, {}, 16);
  } });

P({ id: 'kettle', name: 'Kettle', cat: 'kitchen', tags: ['house'], fill: 0.45, weight: 2,
  build(b) {
    b.lathe([[0.001, 0], [0.075, 0.01], [0.088, 0.06], [0.078, 0.135], [0.05, 0.16], [0.05, 0.168], [0.001, 0.168]], C.steel, {}, 16);
    b.cyl(0.052, 0.052, 0.014, C.charcoal, { y: 0.175 }, 14);
    b.cyl(0.008, 0.02, 0.09, C.steel, { x: 0.085, y: 0.115, rz: -0.75 }, 10);
    b.torus(0.06, 0.008, C.charcoal, { y: 0.205, rz: Math.PI / 2, rx: 0.1 }, 6, 14);
  } });

P({ id: 'teapot', name: 'Teapot', cat: 'kitchen', tags: ['house'], fill: 0.42, weight: 2,
  build(b) {
    b.ellip(0.075, 0.058, 0.075, C.teal, { y: 0.062 }, 14, 9);
    b.cylOn(0.045, 0.012, C.teal, {}, 12);
    b.cyl(0.03, 0.03, 0.016, C.teal, { y: 0.122 }, 12);
    b.sphere(0.012, C.teal, { y: 0.134 }, 8, 6);
    b.cyl(0.007, 0.016, 0.085, C.teal, { x: 0.082, y: 0.085, rz: -0.9 }, 8);
    b.torus(0.032, 0.008, C.teal, { x: -0.08, y: 0.075, ry: Math.PI / 2 }, 6, 12);
  } });

P({ id: 'tissuebox', name: 'Tissue Box', cat: 'houseware', tags: ['house'], fill: 0.85, variants: 3, weight: 3,
  build(b, r, v) {
    b.boxOn(0.235, 0.09, 0.12, [C.cyan, C.pink, C.lemon][v], {});
    b.box(0.09, 0.014, 0.05, C.white, { y: 0.09 });
    b.box(0.05, 0.03, 0.045, C.white, { y: 0.1, rz: 0.2 });
  } });

P({ id: 'photoframe', name: 'Photo Frame', cat: 'houseware', tags: ['house'], fill: 0.35, weight: 2,
  build(b) {
    b.box(0.16, 0.2, 0.014, C.woodDark, { y: 0.1 });
    b.box(0.13, 0.17, 0.018, C.sky, { y: 0.1 });
    b.box(0.05, 0.06, 0.02, C.skin, { y: 0.115 });
    b.box(0.06, 0.02, 0.09, C.woodDark, { y: 0.008, z: -0.04, rx: 0.4 });
  } });

P({ id: 'alarmclock', name: 'Alarm Clock', cat: 'houseware', tags: ['house'], fill: 0.45, weight: 3,
  build(b) {
    b.cyl(0.055, 0.055, 0.045, C.red, { y: 0.062, rx: Math.PI / 2 }, 16);
    b.cyl(0.046, 0.046, 0.048, C.white, { y: 0.062, rx: Math.PI / 2 }, 16);
    b.box(0.004, 0.03, 0.002, C.black, { y: 0.075, z: 0.024 });
    b.box(0.024, 0.004, 0.002, C.black, { x: 0.01, y: 0.062, z: 0.024 });
    for (const s of [-1, 1]) b.dome(0.02, C.red, { x: s * 0.045, y: 0.098, rz: s * 0.5 }, 10);
    b.box(0.03, 0.012, 0.03, C.gold, { y: 0.113 });
    for (const s of [-1, 1]) b.cylOn(0.008, 0.02, C.red, { x: s * 0.03, z: -0.012 }, 6);
  } });

P({ id: 'shoe', name: 'Sneaker', cat: 'clothing', tags: ['house'], fill: 0.45, variants: 3, weight: 4,
  build(b, r, v) {
    const col = [C.red, C.blue, C.white][v];
    b.box(0.095, 0.03, 0.275, C.white, { y: 0.015 });
    b.slab(0.092, 0.062, 0.2, col, { y: 0.058, z: 0.032 });
    b.slab(0.09, 0.085, 0.11, col, { y: 0.07, z: -0.08 });
    b.box(0.05, 0.012, 0.1, C.white, { y: 0.105, z: -0.005, rx: 0.15 });
  } });

P({ id: 'slipper', name: 'Slipper', cat: 'clothing', tags: ['house'], fill: 0.35, variants: 2, weight: 3,
  build(b, r, v) {
    b.box(0.088, 0.022, 0.255, v ? C.pink : C.blue, { y: 0.011 });
    b.dome(0.045, v ? C.pink : C.blue, { y: 0.02, z: 0.06 }, 12);
    b.box(0.088, 0.05, 0.08, v ? C.pink : C.blue, { y: 0.032, z: 0.075 });
  } });

P({ id: 'banana', name: 'Banana', cat: 'food', tags: ['house'], fill: 0.3, weight: 3,
  build(b) {
    for (let i = 0; i < 7; i++) {
      const t = i / 6, a = (t - 0.5) * 1.5;
      b.ellip(0.019, 0.018, 0.022, C.yellow,
        { x: Math.sin(a) * 0.085, y: 0.022 + Math.cos(a) * 0.012 - 0.012, z: 0, rz: -a * 0.6 }, 8, 6);
    }
    b.cyl(0.006, 0.009, 0.022, C.woodDark, { x: -0.093, y: 0.03, rz: 0.9 }, 6);
  } });

P({ id: 'wine', name: 'Wine Bottle', cat: 'kitchen', tags: ['house', 'town'], fill: 0.45, variants: 2, weight: 2,
  build(b, r, v) {
    const col = v ? C.greenDark : C.woodDark;
    b.lathe([[0.001, 0], [0.042, 0], [0.043, 0.008], [0.043, 0.16], [0.036, 0.2], [0.016, 0.235], [0.015, 0.29], [0.018, 0.3], [0.001, 0.302]], col, {}, 14);
    b.cylOn(0.019, 0.03, C.gold, { y: 0.278 }, 12);
    b.cyl(0.0435, 0.0435, 0.09, C.paper, { y: 0.085 }, 14);
  } });

P({ id: 'thermos', name: 'Thermos Flask', cat: 'kitchen', tags: ['house', 'town'], fill: 0.65, variants: 3, weight: 2,
  build(b, r, v) {
    b.cylOn(0.043, 0.245, [C.steel, C.red, C.navy][v], {}, 14);
    b.cylOn(0.038, 0.05, C.charcoal, { y: 0.245 }, 14);
    b.cylOn(0.041, 0.008, C.charcoal, { y: 0.292 }, 14);
  } });

P({ id: 'football', name: 'Soccer Ball', cat: 'toy', tags: ['house', 'town'], fill: 0.52, weight: 3,
  build(b, r) {
    b.sphere(0.11, C.white, { y: 0.11 }, 11, 8);
    for (let i = 0; i < 6; i++) {
      const a = r() * Math.PI * 2, e = Math.acos(1 - 2 * r());
      b.cyl(0.032, 0.032, 0.006, C.charcoal, {
        x: Math.sin(e) * Math.cos(a) * 0.107, y: 0.11 + Math.cos(e) * 0.107, z: Math.sin(e) * Math.sin(a) * 0.107,
        rx: e, ry: a, rz: 0,
      }, 5);
    }
  } });

P({ id: 'watermelon', name: 'Watermelon', cat: 'food', tags: ['house', 'town'], fill: 0.62, weight: 2,
  build(b) {
    b.ellip(0.13, 0.115, 0.13, C.green, { y: 0.115 }, 10, 7);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      b.ellip(0.018, 0.116, 0.13, C.greenDark, { x: Math.cos(a) * 0.001, y: 0.115, ry: a }, 4, 5);
    }
  } });

P({ id: 'toaster', name: 'Toaster', cat: 'kitchen', tags: ['house'], fill: 0.7, weight: 2,
  build(b) {
    b.slab(0.29, 0.175, 0.16, C.chrome, { y: 0.088 });
    for (const s of [-1, 1]) b.box(0.09, 0.012, 0.02, C.charcoal, { x: s * 0.06, y: 0.174 });
    b.box(0.02, 0.05, 0.03, C.charcoal, { x: 0.155, y: 0.12 });
    b.box(0.03, 0.02, 0.02, C.red, { x: 0.155, y: 0.06 });
  } });

P({ id: 'ricecooker', name: 'Rice Cooker', cat: 'kitchen', tags: ['house'], fill: 0.62, weight: 2,
  build(b) {
    b.lathe([[0.001, 0], [0.14, 0.01], [0.15, 0.06], [0.148, 0.2], [0.13, 0.225], [0.001, 0.228]], C.white, {}, 16);
    b.cylOn(0.132, 0.03, C.lightgrey, { y: 0.222 }, 16);
    b.box(0.1, 0.05, 0.01, C.charcoal, { y: 0.15, z: 0.147 });
    b.box(0.03, 0.016, 0.014, C.lime, { x: -0.02, y: 0.155, z: 0.152 });
    b.torus(0.06, 0.008, C.lightgrey, { y: 0.27, rz: Math.PI / 2 }, 6, 12);
  } });

P({ id: 'boombox', name: 'Boombox', cat: 'gadget', tags: ['house', 'town'], fill: 0.68, weight: 2,
  build(b) {
    b.boxOn(0.42, 0.24, 0.15, C.charcoal, {});
    for (const s of [-1, 1]) {
      b.cyl(0.07, 0.07, 0.02, C.darkgrey, { x: s * 0.13, y: 0.12, z: 0.076, rx: Math.PI / 2 }, 14);
      b.cyl(0.045, 0.045, 0.024, C.black, { x: s * 0.13, y: 0.12, z: 0.078, rx: Math.PI / 2 }, 12);
    }
    b.box(0.11, 0.075, 0.02, C.steelDark, { y: 0.135, z: 0.076 });
    b.box(0.1, 0.02, 0.024, C.lime, { y: 0.06, z: 0.076 });
    b.torus(0.13, 0.009, C.darkgrey, { y: 0.245, rz: Math.PI / 2, rx: 0.15 }, 6, 14);
  } });

P({ id: 'potplant', name: 'Potted Plant', cat: 'nature', tags: ['house', 'town'], fill: 0.4, variants: 3, weight: 4,
  build(b, r, v) {
    b.cyl(0.095, 0.07, 0.12, C.woodRed, { y: 0.06 }, 14);
    b.cyl(0.1, 0.1, 0.022, C.woodRed, { y: 0.118 }, 14);
    b.cylOn(0.085, 0.012, C.brown, { y: 0.115 }, 12);
    const n = 5 + v;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + r();
      const hgt = 0.16 + r() * 0.14;
      b.cyl(0.004, 0.006, hgt, C.greenDark, { x: Math.cos(a) * 0.02, y: 0.13 + hgt / 2, z: Math.sin(a) * 0.02, rz: Math.cos(a) * 0.3, rx: -Math.sin(a) * 0.3 }, 5);
      b.ellip(0.05, 0.014, 0.075, C.leaf, { x: Math.cos(a) * 0.06, y: 0.13 + hgt, z: Math.sin(a) * 0.06, ry: a, rz: Math.cos(a) * 0.4 }, 8, 5);
    }
  } });

P({ id: 'wastebin', name: 'Waste Basket', cat: 'houseware', tags: ['house', 'town'], fill: 0.32, variants: 2, weight: 3,
  build(b, r, v) {
    const col = v ? C.blue : C.lightgrey;
    b.lathe([[0.001, 0], [0.11, 0], [0.112, 0.006], [0.14, 0.29], [0.145, 0.3], [0.14, 0.3], [0.135, 0.01], [0.001, 0.008]], col, {}, 14);
  } });

P({ id: 'backpack', name: 'Backpack', cat: 'clothing', tags: ['house', 'town'], fill: 0.55, variants: 3, weight: 3,
  build(b, r, v) {
    const col = [C.navy, C.redDark, C.greenDark][v];
    b.slab(0.3, 0.42, 0.19, col, { y: 0.22 });
    b.slab(0.24, 0.16, 0.09, col, { y: 0.16, z: 0.13 });
    b.box(0.2, 0.02, 0.03, C.charcoal, { y: 0.24, z: 0.15 });
    for (const s of [-1, 1]) b.box(0.05, 0.34, 0.05, col, { x: s * 0.09, y: 0.24, z: -0.11, rx: 0.12 });
    b.torus(0.045, 0.012, col, { y: 0.44, rz: Math.PI / 2, rx: 0.4 }, 6, 12);
  } });

P({ id: 'cat', name: 'House Cat', cat: 'critter', tags: ['house', 'town'], fill: 0.32, variants: 3, weight: 3,
  build(b, r, v) {
    const body = [C.tangerine, C.charcoal, C.white][v];
    const belly = v === 2 ? C.lightgrey : C.cream;
    b.critter(0.46, body, belly);
  } });

P({ id: 'dog_small', name: 'Small Dog', cat: 'critter', tags: ['house', 'town'], fill: 0.34, variants: 2, weight: 3,
  build(b, r, v) {
    b.critter(0.58, v ? C.woodPale : C.brown, C.cream);
  } });

P({ id: 'microwave', name: 'Microwave Oven', cat: 'kitchen', tags: ['house'], fill: 0.75, weight: 2,
  build(b) {
    b.boxOn(0.5, 0.3, 0.4, C.white, {});
    b.box(0.31, 0.22, 0.012, C.charcoal, { x: -0.08, y: 0.16, z: 0.203 });
    b.box(0.27, 0.18, 0.016, C.glassDark, { x: -0.08, y: 0.16, z: 0.205 });
    b.box(0.1, 0.26, 0.014, C.lightgrey, { x: 0.19, y: 0.16, z: 0.203 });
    b.box(0.07, 0.03, 0.02, C.charcoal, { x: 0.19, y: 0.24, z: 0.206 });
    b.box(0.02, 0.16, 0.03, C.steelDark, { x: 0.115, y: 0.16, z: 0.212 });
  } });

P({ id: 'chair', name: 'Wooden Chair', cat: 'furniture', tags: ['house'], fill: 0.14, variants: 2, weight: 4,
  build(b, r, v) {
    const col = v ? C.wood : C.woodDark;
    b.legs(0.42, 0.42, 0.44, 0.017, col, { y: 0 });
    b.box(0.44, 0.03, 0.44, col, { y: 0.455 });
    for (const s of [-1, 1]) b.box(0.028, 0.5, 0.028, col, { x: s * 0.19, y: 0.7, z: -0.2 });
    b.box(0.4, 0.09, 0.024, col, { y: 0.9, z: -0.2 });
    b.box(0.4, 0.07, 0.024, col, { y: 0.75, z: -0.2 });
  } });

P({ id: 'stool', name: 'Stool', cat: 'furniture', tags: ['house'], fill: 0.16, weight: 3,
  build(b) {
    b.legs(0.32, 0.32, 0.4, 0.015, C.woodDark, { y: 0 });
    b.cylOn(0.19, 0.035, C.carpet, { y: 0.4 }, 14);
    b.torus(0.15, 0.008, C.woodDark, { y: 0.18, rx: Math.PI / 2 }, 5, 12);
  } });

P({ id: 'tv', name: 'Television', cat: 'gadget', tags: ['house'], fill: 0.6, weight: 3,
  build(b) {
    b.box(1.02, 0.6, 0.06, C.charcoal, { y: 0.44 });
    b.box(0.96, 0.545, 0.03, C.navy, { y: 0.445, z: 0.028 });
    b.box(0.28, 0.03, 0.16, C.charcoal, { y: 0.13 });
    b.box(0.09, 0.16, 0.09, C.darkgrey, { y: 0.22 });
    b.box(0.34, 0.02, 0.2, C.darkgrey, { y: 0.01 });
  } });

P({ id: 'bicycle', name: 'Bicycle', cat: 'vehicle', tags: ['house', 'town'], fill: 0.12, variants: 3, weight: 4,
  build(b, r, v) {
    const col = [C.red, C.teal, C.navy][v];
    const R = 0.33;
    for (const s of [-1, 1]) {
      b.torus(R, 0.022, C.charcoal, { x: s * 0.52, y: R, ry: Math.PI / 2 }, 6, 18);
      b.torus(R * 0.62, 0.008, C.steel, { x: s * 0.52, y: R, ry: Math.PI / 2 }, 4, 14);
      b.cyl(0.03, 0.03, 0.05, C.steel, { x: s * 0.52, y: R, rz: Math.PI / 2 }, 8);
    }
    b.cyl(0.018, 0.018, 0.62, col, { x: 0.14, y: 0.5, rz: 1.35 }, 8);
    b.cyl(0.018, 0.018, 0.5, col, { x: -0.2, y: 0.5, rz: -1.15 }, 8);
    b.cyl(0.018, 0.018, 0.42, col, { x: -0.34, y: 0.44, rz: 0.42 }, 8);
    b.cyl(0.018, 0.018, 0.36, col, { x: -0.02, y: 0.42, rz: -0.6 }, 8);
    b.cyl(0.016, 0.016, 0.46, C.steel, { x: 0.44, y: 0.55, rz: 0.32 }, 8);
    b.box(0.03, 0.03, 0.44, C.charcoal, { x: 0.36, y: 0.98 });
    b.slab(0.24, 0.06, 0.11, C.charcoal, { x: -0.24, y: 0.94 });
    b.cyl(0.09, 0.09, 0.02, C.steelDark, { x: -0.02, y: 0.28, rz: Math.PI / 2 }, 10);
    for (const s of [-1, 1]) b.box(0.075, 0.02, 0.03, C.charcoal, { x: -0.02 + s * 0.06, y: 0.28 - s * 0.05, z: s * 0.09 });
  } });

P({ id: 'desk', name: 'Writing Desk', cat: 'furniture', tags: ['house'], fill: 0.2, weight: 2,
  build(b) {
    b.box(1.32, 0.04, 0.68, C.wood, { y: 0.74 });
    b.box(1.28, 0.06, 0.64, C.woodDark, { y: 0.7 });
    for (const sx of [-1, 1]) b.box(0.06, 0.72, 0.6, C.woodDark, { x: sx * 0.62, y: 0.36 });
    b.box(0.5, 0.34, 0.6, C.wood, { x: 0.38, y: 0.5 });
    for (let i = 0; i < 2; i++) {
      b.box(0.46, 0.13, 0.02, C.woodPale, { x: 0.38, y: 0.4 + i * 0.17, z: 0.31 });
      b.box(0.14, 0.025, 0.03, C.gold, { x: 0.38, y: 0.4 + i * 0.17, z: 0.325 });
    }
  } });

P({ id: 'bookshelf', name: 'Bookshelf', cat: 'furniture', tags: ['house'], fill: 0.28, weight: 2,
  build(b, r) {
    const W = 0.86, H = 1.76, D = 0.3;
    b.box(W, 0.04, D, C.woodDark, { y: 0.02 });
    for (const s of [-1, 1]) b.box(0.035, H, D, C.woodDark, { x: s * (W / 2 - 0.018), y: H / 2 });
    b.box(W, H, 0.02, C.woodPale, { y: H / 2, z: -D / 2 });
    for (let i = 1; i <= 4; i++) {
      const y = (H / 5) * i;
      b.box(W - 0.06, 0.028, D - 0.02, C.woodDark, { y });
      let x = -W / 2 + 0.06;
      while (x < W / 2 - 0.09) {
        const t = 0.022 + r() * 0.03;
        const bh = 0.2 + r() * 0.09;
        b.box(t, bh, D - 0.08, SETS.book[Math.floor(r() * SETS.book.length)], { x: x + t / 2, y: y + 0.014 + bh / 2, z: 0.01, rz: r() < 0.12 ? 0.16 : 0 });
        x += t + 0.004;
      }
    }
    b.box(W, 0.05, D, C.woodDark, { y: H });
  } });

P({ id: 'fridge', name: 'Refrigerator', cat: 'kitchen', tags: ['house'], fill: 0.8, weight: 2,
  build(b) {
    b.boxOn(0.66, 1.7, 0.68, C.white, {});
    b.box(0.67, 0.02, 0.69, C.lightgrey, { y: 1.14 });
    for (const [y, h] of [[0.55, 1.06], [1.42, 0.5]]) {
      b.box(0.03, h - 0.06, 0.69, C.chrome, { x: 0.33, y, z: 0.0 });
      b.box(0.035, h * 0.55, 0.045, C.steelDark, { x: 0.345, y, z: 0.26 });
    }
    b.box(0.14, 0.2, 0.02, C.charcoal, { x: -0.12, y: 1.5, z: 0.345 });
  } });

P({ id: 'sofa', name: 'Sofa', cat: 'furniture', tags: ['house'], fill: 0.45, variants: 3, weight: 2,
  build(b, r, v) {
    const col = [C.carpet, C.teal, C.indigo][v];
    const W = 1.92, D = 0.88;
    b.box(W, 0.34, D, col, { y: 0.3 });
    b.slab(W - 0.3, 0.5, D * 0.34, col, { y: 0.62, z: -D / 2 + 0.16 });
    for (const s of [-1, 1]) b.slab(0.24, 0.42, D, col, { x: s * (W / 2 - 0.12), y: 0.5 });
    for (let i = -1; i <= 1; i++) b.slab(W / 3 - 0.06, 0.14, D - 0.28, col, { x: i * (W / 3), y: 0.5, z: 0.06 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.cylOn(0.035, 0.13, C.woodDark, { x: sx * (W / 2 - 0.14), z: sz * (D / 2 - 0.14) }, 6);
  } });

P({ id: 'lowtable', name: 'Low Table', cat: 'furniture', tags: ['house'], fill: 0.2, weight: 2,
  build(b) {
    b.box(1.15, 0.045, 0.78, C.woodDark, { y: 0.38 });
    b.box(1.05, 0.05, 0.7, C.wood, { y: 0.345 });
    b.legs(1.0, 0.66, 0.34, 0.028, C.woodDark, {});
  } });

P({ id: 'washingmachine', name: 'Washing Machine', cat: 'houseware', tags: ['house'], fill: 0.8, weight: 2,
  build(b) {
    b.boxOn(0.6, 0.86, 0.6, C.white, {});
    b.cyl(0.19, 0.19, 0.03, C.lightgrey, { y: 0.46, z: 0.3, rx: Math.PI / 2 }, 16);
    b.cyl(0.155, 0.155, 0.04, C.glassDark, { y: 0.46, z: 0.305, rx: Math.PI / 2 }, 16);
    b.box(0.58, 0.14, 0.02, C.lightgrey, { y: 0.78, z: 0.3 });
    b.cyl(0.035, 0.035, 0.03, C.charcoal, { x: 0.2, y: 0.78, z: 0.312, rx: Math.PI / 2 }, 10);
  } });

P({ id: 'floorlamp', name: 'Floor Lamp', cat: 'houseware', tags: ['house'], fill: 0.15, weight: 2,
  build(b) {
    b.cylOn(0.16, 0.025, C.charcoal, {}, 14);
    b.cylOn(0.016, 1.35, C.steelDark, { y: 0.02 }, 8);
    b.cyl(0.16, 0.24, 0.3, C.cream, { y: 1.5 }, 16);
  } });

P({ id: 'aquarium', name: 'Aquarium', cat: 'houseware', tags: ['house'], fill: 0.5, weight: 1,
  build(b, r) {
    const W = 0.9, H = 0.46, D = 0.36;
    b.boxOn(W, 0.06, D, C.charcoal, {});
    b.box(W, H, D, C.glass, { y: 0.06 + H / 2 });
    b.box(W - 0.04, 0.06, D - 0.04, C.sand, { y: 0.09 });
    for (let i = 0; i < 5; i++) {
      const x = (r() - 0.5) * W * 0.8;
      b.ellip(0.02, 0.11, 0.012, C.greenDark, { x, y: 0.2, z: (r() - 0.5) * D * 0.6, rz: (r() - 0.5) * 0.4 }, 6, 5);
    }
    for (let i = 0; i < 3; i++) {
      b.ellip(0.035, 0.022, 0.016, SETS.candy[i], { x: (r() - 0.5) * W * 0.7, y: 0.2 + r() * 0.15, z: (r() - 0.5) * D * 0.5 }, 8, 6);
    }
    b.box(W + 0.03, 0.035, D + 0.03, C.charcoal, { y: 0.06 + H });
  } });

P({ id: 'toilet', name: 'Toilet', cat: 'bathroom', tags: ['house'], fill: 0.42, weight: 1,
  build(b) {
    b.lathe([[0.001, 0], [0.1, 0], [0.11, 0.06], [0.09, 0.24], [0.18, 0.36], [0.2, 0.4], [0.001, 0.4]], C.white, { z: 0.06 }, 14);
    b.ellip(0.2, 0.03, 0.25, C.white, { y: 0.41, z: 0.06 }, 14, 6);
    b.ellip(0.19, 0.025, 0.24, C.lightgrey, { y: 0.44, z: 0.06 }, 14, 6);
    b.boxOn(0.4, 0.72, 0.2, C.white, { z: -0.24 });
    b.box(0.42, 0.05, 0.22, C.white, { y: 0.735, z: -0.24 });
    b.box(0.07, 0.03, 0.03, C.chrome, { x: 0.15, y: 0.66, z: -0.14 });
  } });

P({ id: 'futon', name: 'Rolled Futon', cat: 'furniture', tags: ['house'], fill: 0.75, variants: 2, weight: 2,
  build(b, r, v) {
    b.cyl(0.24, 0.24, 1.0, v ? C.indigo : C.carpet, { y: 0.24, rz: Math.PI / 2 }, 14);
    b.cyl(0.245, 0.245, 0.06, C.cream, { x: -0.28, y: 0.24, rz: Math.PI / 2 }, 14);
    b.cyl(0.245, 0.245, 0.06, C.cream, { x: 0.28, y: 0.24, rz: Math.PI / 2 }, 14);
  } });

P({ id: 'child', name: 'Small Child', cat: 'person', tags: ['house', 'town'], fill: 0.3, variants: 4, weight: 3,
  build(b, r, v) {
    b.person(1.15, C.skin, SETS.shirt[v % SETS.shirt.length], SETS.plastic[(v + 3) % SETS.plastic.length], SETS.hair[v % SETS.hair.length]);
  } });

P({ id: 'adult', name: 'Grown-Up', cat: 'person', tags: ['house', 'town'], fill: 0.3, variants: 5, weight: 3,
  build(b, r, v) {
    b.person(1.72, [C.skin, C.skinTan, C.skinDeep][v % 3], SETS.shirt[(v + 2) % SETS.shirt.length], [C.navy, C.charcoal, C.brown][v % 3], SETS.hair[(v + 1) % SETS.hair.length]);
  } });

P({ id: 'upright_piano', name: 'Upright Piano', cat: 'furniture', tags: ['house'], fill: 0.62, weight: 1,
  build(b) {
    b.boxOn(1.48, 1.16, 0.62, C.black, {});
    b.box(1.5, 0.07, 0.68, C.black, { y: 1.18 });
    b.box(1.36, 0.06, 0.16, C.white, { y: 0.72, z: 0.34 });
    for (let i = 0; i < 22; i++) b.box(0.012, 0.07, 0.1, C.black, { x: -0.63 + i * 0.06 + (i % 3 === 2 ? 0.02 : 0), y: 0.755, z: 0.31 });
    b.box(1.4, 0.1, 0.06, C.black, { y: 0.8, z: 0.4 });
    for (const s of [-1, 1]) b.box(0.12, 0.2, 0.12, C.black, { x: s * 0.6, y: 0.1, z: 0.2 });
    b.box(0.2, 0.03, 0.14, C.gold, { y: 0.05, z: 0.24 });
  } });

P({ id: 'grandclock', name: 'Grandfather Clock', cat: 'furniture', tags: ['house'], fill: 0.45, weight: 1,
  build(b) {
    b.boxOn(0.44, 1.6, 0.28, C.woodDark, {});
    b.box(0.3, 0.9, 0.04, C.charcoal, { y: 0.7, z: 0.145 });
    b.cyl(0.14, 0.14, 0.04, C.gold, { y: 0.75, z: 0.16, rx: Math.PI / 2 }, 16);
    b.cyl(0.11, 0.11, 0.05, C.cream, { y: 0.75, z: 0.165, rx: Math.PI / 2 }, 16);
    b.cyl(0.06, 0.06, 0.02, C.gold, { y: 0.35, z: 0.16, rx: Math.PI / 2 }, 12);
    b.box(0.012, 0.5, 0.012, C.gold, { y: 0.52, z: 0.16 });
    b.boxOn(0.52, 0.24, 0.34, C.woodDark, { y: 1.6 });
    b.wedge(0.52, 0.18, 0.34, C.woodDark, { y: 1.84 });
  } });

P({ id: 'doghouse', name: 'Dog House', cat: 'furniture', tags: ['house', 'town'], fill: 0.4, weight: 2,
  build(b) {
    b.boxOn(0.86, 0.62, 0.98, C.woodRed, {});
    b.wedge(0.98, 0.4, 1.06, C.redDark, { y: 0.62 });
    b.box(0.34, 0.44, 0.06, C.charcoal, { y: 0.22, z: 0.49 });
    b.box(0.26, 0.08, 0.03, C.woodPale, { y: 0.55, z: 0.5 });
  } });
