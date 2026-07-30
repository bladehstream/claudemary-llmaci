/* ============================================================
   The Culture — everything that lives on an agar plate.

   ONE WORLD UNIT IS ONE MICROMETRE here. The numbers below are
   authored exactly the way house.js authors metres: a coccus is
   0.45 units across because a coccus is 450nm across, and the
   physics never learns the difference. See the note above TIERS
   in util/math.js for why this is not done in true metres.

   The ladder runs 15nm (an antibody) to 1µm5 as authored, and
   the stage scales the last few up to 2µm6 (a sheet of biofilm).
   The rungs are packed tightest between 50nm and 1µm, which is
   where the round is actually played.

   Nothing here is elongated for the sake of it. An object's
   collision radius is HALF ITS LONGEST HORIZONTAL SPAN while its
   pickup size is the cube root of its box, so a straight 400nm
   hair is a 400nm-wide wall you cannot eat until you are 200nm
   across. A plate full of those is a maze: the first draft of
   this catalogue covered 83% of the floor in obstacles against
   the house's 14%, and a katamari could not cross it. Filaments
   here are coiled, rods are stubby, and a chain of cocci is four
   cells rather than six.
   ============================================================ */

import { defineProp } from './index.js';
import { C } from '../../render/palette.js';

const P = defineProp;
const TAU = Math.PI * 2;

/** Every prop on this stage reads in micrometres. */
const U = 'micron';

/**
 * Warm agar-plate palette: jelly greens, membrane pinks, nucleus violets and
 * the pale washed-out yellows that anything translucent turns under a lamp.
 * Local on purpose — the shared set in palette.js is a toy-box palette and
 * nothing in a petri dish is that saturated.
 */
const M = {
  /* agar, matrix, shell */
  agar:      0xf1e4b2,
  agarWarm:  0xe4d18e,
  matrix:    0xe9dcae,
  chalk:     0xf7f2e2,
  /* jelly greens — cytoplasm, colonies, plant bits */
  jelly:     0xa9d77f,
  jellyDeep: 0x73ae56,
  jellyPale: 0xd5edad,
  moss:      0x578a42,
  /* membrane pinks */
  membrane:  0xf2a4b4,
  membraneD: 0xcd7183,
  flesh:     0xf8cdc3,
  coral:     0xee8a72,
  /* nucleus violets */
  nucleus:   0x8d6bc6,
  nucleusD:  0x63469b,
  lilac:     0xc2aae5,
  /* translucent pale yellows */
  amber:     0xf5dc92,
  amberPale: 0xfbf0cb,
  honey:     0xe6bb5c,
  /* protein blues and teals */
  protein:   0x85b3dc,
  proteinD:  0x5a85b7,
  aqua:      0x76cec1,
  aquaDeep:  0x3d9a90,
  /* accents */
  rust:      0xc7704a,
  ink:       0x4a4257,
};

/* ---------------------------------------------------------- *
   Loose protein machinery  (15nm – 35nm)
 * ---------------------------------------------------------- */

P({ id: 'antibody', name: 'Antibody', cat: 'protein', tags: ['microbe'], unit: U,
  fill: 0.1, variants: 3, weight: 5,
  build(b, r, v) {
    const col = [M.protein, M.aqua, M.lilac][v];
    const t = 0.0023;
    b.cylOn(t, 0.0102, col, {}, 6);
    b.sphere(t * 1.7, col, { y: 0.0108 }, 6, 4);
    for (const s of [-1, 1]) {
      b.cyl(t, t, 0.0126, col, { x: s * 0.0043, y: 0.0158, rz: -s * 0.72 }, 6);
      b.sphere(t * 1.5, M.amber, { x: s * 0.008, y: 0.0206 }, 6, 4);
    }
  } });

P({ id: 'enzyme', name: 'Enzyme', cat: 'protein', tags: ['microbe'], unit: U,
  fill: 0.44, variants: 4, weight: 5,
  build(b, r, v) {
    const col = [M.amber, M.aqua, M.jellyPale, M.flesh][v];
    b.sphere(0.0088, col, { y: 0.0098 }, 8, 6);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU + v * 0.4;
      b.sphere(0.0052, col, { x: Math.cos(a) * 0.0072, y: 0.0086 + (i % 2) * 0.004, z: Math.sin(a) * 0.0072 }, 6, 4);
    }
    // the cleft where the substrate goes
    b.sphere(0.0034, M.rust, { y: 0.0168 }, 5, 4);
  } });

P({ id: 'prion', name: 'Prion Tangle', cat: 'protein', tags: ['microbe'], unit: U,
  fill: 0.15, variants: 3, weight: 4,
  build(b, r, v) {
    const col = v === 1 ? M.lilac : M.membraneD;
    for (let i = 0; i < 5; i++) {
      b.box(0.0255, 0.0032, 0.0032, i % 2 ? col : M.nucleus, {
        x: (r() - 0.5) * 0.005, y: 0.0035 + i * 0.0038, z: (r() - 0.5) * 0.005,
        ry: r() * TAU, rz: (r() - 0.5) * 0.35,
      });
    }
  } });

P({ id: 'ribosome', name: 'Ribosome', cat: 'protein', tags: ['microbe'], unit: U,
  fill: 0.48, variants: 2, weight: 5,
  build(b, r, v) {
    const big = v ? M.honey : M.amber;
    b.ellip(0.0164, 0.0126, 0.0154, big, { y: 0.0126 }, 8, 6);
    b.ellip(0.0072, 0.0052, 0.0068, M.rust, { x: 0.0092, y: 0.0182, z: -0.004 }, 6, 4);
    b.ellip(0.0124, 0.0088, 0.0118, M.amberPale, { y: 0.0292 }, 8, 6);
    b.sphere(0.0035, M.aquaDeep, { x: -0.0068, y: 0.0316 }, 5, 4);
  } });

/* ---------------------------------------------------------- *
   Virions  (40nm – 115nm)
 * ---------------------------------------------------------- */

P({ id: 'capsid', name: 'Icosahedral Capsid', cat: 'virus', tags: ['microbe'], unit: U,
  fill: 0.5, variants: 3, weight: 5,
  build(b, r, v) {
    const R = 0.0214;
    const col = [M.protein, M.aqua, M.lilac][v];
    // 6x4 segments is a faceted lump, which is exactly what a capsid is
    b.sphere(R, col, { y: R }, 6, 4);
    b.cyl(R * 0.62, R * 0.62, R * 0.34, M.proteinD, { y: R }, 6);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU + 0.5;
      b.sphere(R * 0.2, M.amberPale, { x: Math.cos(a) * R * 0.62, y: R * 1.6, z: Math.sin(a) * R * 0.62 }, 5, 4);
    }
  } });

P({ id: 'virion_spiky', name: 'Enveloped Virion', cat: 'virus', tags: ['microbe'], unit: U,
  fill: 0.3, variants: 3, weight: 6,
  build(b, r, v) {
    const R = 0.021;
    const col = [M.membrane, M.coral, M.honey][v];
    b.sphere(R, col, { y: 0.027 }, 8, 6);
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * TAU * 3.1;
      const e = Math.acos(1 - 2 * ((i + 0.5) / 11));
      const sx = Math.sin(e) * Math.cos(a), sy = Math.cos(e), sz = Math.sin(e) * Math.sin(a);
      b.cone(0.0034, 0.0072, M.rust, {
        x: sx * R * 1.15, y: 0.027 + sy * R * 1.15, z: sz * R * 1.15,
        rz: -Math.atan2(sx, sy), rx: Math.atan2(sz, sy),
      }, 5);
    }
  } });

P({ id: 'virus_rod', name: 'Rod Virus', cat: 'virus', tags: ['microbe'], unit: U,
  fill: 0.58, variants: 2, weight: 5,
  build(b, r, v) {
    const L = 0.155, R = 0.0215;
    b.cyl(R, R, L, v ? M.jellyDeep : M.moss, { y: R, rz: Math.PI / 2 }, 8);
    // the helical coat, read as ribs
    for (let i = 0; i < 5; i++) {
      b.cyl(R * 1.05, R * 1.05, 0.008, M.jelly, { x: -L / 2 + 0.02 + i * 0.029, y: R, rz: Math.PI / 2 }, 8);
    }
    b.cyl(R * 0.28, R * 0.28, L * 1.02, M.amberPale, { y: R, rz: Math.PI / 2 }, 5);
  } });

P({ id: 'filament_virus', name: 'Ambisense Filament', cat: 'virus', tags: ['microbe'], unit: U,
  fill: 0.1, variants: 3, weight: 5,
  build(b, r, v) {
    const R = 0.012;
    const col = [M.aquaDeep, M.nucleus, M.rust][v];
    /* Wound into the ring these things are famous for rather than laid out
       straight. A 400nm-long hair would also be a 400nm-wide OBSTACLE — the
       game takes an object's collision radius from its longest horizontal
       span, and a plate carpeted with straight filaments is a maze. */
    for (let i = 0; i < 15; i++) {
      const t = i / 14;
      const a = t * 4.7 + v * 0.5;
      const rad = 0.075 - t * 0.016;
      b.sphere(R * (1 - t * 0.2), i % 2 ? col : M.aqua,
        { x: Math.cos(a) * rad, y: R, z: Math.sin(a) * rad }, 6, 4);
    }
  } });

P({ id: 'bacteriophage', name: 'Bacteriophage', cat: 'virus', tags: ['microbe'], unit: U,
  fill: 0.2, variants: 2, weight: 7,
  build(b, r, v) {
    const head = 0.0365;
    const col = v ? M.protein : M.aqua;
    // head — faceted, sitting on top of the tail
    b.sphere(head, col, { y: 0.1515 }, 6, 4);
    b.cyl(head * 0.5, head * 0.5, head * 0.26, M.proteinD, { y: 0.1515 }, 6);
    // collar
    b.cyl(0.0125, 0.0095, 0.008, M.proteinD, { y: 0.1105 }, 8);
    // striated contractile sheath
    for (let i = 0; i < 6; i++) {
      b.cyl(0.0102, 0.0102, 0.0082, i % 2 ? col : M.proteinD, { y: 0.0625 + i * 0.0092 }, 8);
    }
    // core tube down the middle
    b.cylOn(0.0038, 0.108, M.amberPale, { y: 0.045 }, 5);
    // baseplate
    b.cylOn(0.0182, 0.0075, M.membraneD, { y: 0.0455 }, 6);
    // legs and their feet
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      const cx = Math.cos(a), cz = Math.sin(a);
      b.cyl(0.0026, 0.0026, 0.052, M.proteinD, {
        x: cx * 0.0245, y: 0.0245, z: cz * 0.0245, rz: cx * 0.86, rx: -cz * 0.86,
      }, 5);
      b.sphere(0.0038, M.rust, { x: cx * 0.0435, y: 0.0032, z: cz * 0.0435 }, 5, 4);
    }
  } });

/* ---------------------------------------------------------- *
   Organelles and loose cell parts  (130nm – 425nm)
 * ---------------------------------------------------------- */

P({ id: 'vesicle', name: 'Vesicle', cat: 'organelle', tags: ['microbe'], unit: U,
  fill: 0.48, variants: 3, weight: 6,
  build(b, r, v) {
    const R = 0.0655;
    const col = [M.amberPale, M.jellyPale, M.chalk][v];
    b.sphere(R, col, { y: R }, 8, 6);
    b.torus(R * 0.94, R * 0.075, M.amber, { y: R * 0.86, rx: Math.PI / 2 }, 4, 14);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU + 0.9;
      b.sphere(R * 0.17, M.honey, { x: Math.cos(a) * R * 0.6, y: R * 1.6, z: Math.sin(a) * R * 0.6 }, 5, 4);
    }
  } });

P({ id: 'pilus', name: 'Shed Pilus', cat: 'appendage', tags: ['microbe'], unit: U,
  fill: 0.05, variants: 3, weight: 5,
  build(b, r, v) {
    const R = 0.0165;
    const col = [M.flesh, M.membrane, M.chalk][v];
    // shed and curled up on the agar, not laid out straight
    for (let i = 0; i < 20; i++) {
      const t = i / 19;
      const a = t * 5.6 + v * 0.6;
      const rad = 0.163 - t * 0.075;
      b.sphere(R * (1 - t * 0.3), col, { x: Math.cos(a) * rad, y: R, z: Math.sin(a) * rad }, 5, 4);
    }
    // the basal knob it was pulled out of the wall with
    b.ellip(R * 2.0, R * 1.5, R * 2.0, M.membraneD,
      { x: Math.cos(v * 0.6) * 0.163, y: R * 1.5, z: Math.sin(v * 0.6) * 0.163 }, 7, 5);
  } });

P({ id: 'lipid_droplet', name: 'Lipid Droplet', cat: 'organelle', tags: ['microbe'], unit: U,
  fill: 0.48, variants: 3, weight: 6,
  build(b, r, v) {
    const R = 0.0812;
    const col = [M.amberPale, M.amber, M.chalk][v];
    b.sphere(R, col, { y: R }, 8, 6);
    b.sphere(R * 0.42, M.honey, { x: R * 0.34, y: R * 1.28, z: R * 0.2 }, 6, 4);
    b.sphere(R * 0.24, M.amberPale, { x: -R * 0.42, y: R * 1.2, z: -R * 0.3 }, 5, 4);
  } });

P({ id: 'lysosome', name: 'Lysosome', cat: 'organelle', tags: ['microbe'], unit: U,
  fill: 0.48, variants: 3, weight: 5,
  build(b, r, v) {
    const R = 0.0875;
    const col = [M.coral, M.membrane, M.rust][v];
    b.sphere(R, col, { y: R }, 8, 6);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + v;
      const e = 0.5 + (i % 3) * 0.55;
      b.sphere(R * 0.19, M.membraneD, {
        x: Math.sin(e) * Math.cos(a) * R * 0.9, y: R + Math.cos(e) * R * 0.9, z: Math.sin(e) * Math.sin(a) * R * 0.9,
      }, 5, 4);
    }
  } });

P({ id: 'flagellum', name: 'Flagellum', cat: 'appendage', tags: ['microbe'], unit: U,
  fill: 0.08, variants: 2, weight: 5,
  build(b, r, v) {
    const L = 0.27, amp = 0.075, tube = 0.017;
    const col = v ? M.chalk : M.flesh;
    for (let i = 0; i < 13; i++) {
      const t = i / 12;
      const a = t * 1.6 * TAU;
      b.sphere(tube, i % 4 === 0 ? M.membraneD : col, {
        x: -L / 2 + t * L, y: amp + tube + Math.sin(a) * amp, z: Math.cos(a) * amp,
      }, 5, 4);
    }
    b.ellip(tube * 2.2, tube * 1.7, tube * 2.2, M.membraneD, { x: -L / 2, y: amp + tube, z: amp }, 6, 5);
  } });

P({ id: 'plasmid', name: 'Plasmid Loop', cat: 'genetic', tags: ['microbe'], unit: U,
  fill: 0.12, variants: 3, weight: 5,
  build(b, r, v) {
    const R = 0.128, tube = 0.036;
    const col = [M.nucleus, M.nucleusD, M.lilac][v];
    b.torus(R, tube, col, { y: tube, rx: Math.PI / 2 }, 5, 20);
    // the supercoil: a smaller loop crossing back over the first
    b.torus(R * 0.5, tube * 0.85, M.lilac, { x: R * 0.28, y: tube * 2.0, z: -R * 0.14, rx: Math.PI / 2, ry: 0.6 }, 4, 14);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU + v * 0.4;
      b.sphere(tube * 1.3, M.amber, { x: Math.cos(a) * R, y: tube, z: Math.sin(a) * R }, 5, 4);
    }
  } });

P({ id: 'cilia_tuft', name: 'Cilia Tuft', cat: 'appendage', tags: ['microbe'], unit: U,
  fill: 0.1, variants: 3, weight: 5, surface: 'water',
  build(b, r, v) {
    b.ellip(0.096, 0.03, 0.096, M.membrane, { y: 0.028 }, 8, 5);
    const n = 7;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + v * 0.5;
      const cx = Math.cos(a), cz = Math.sin(a);
      const h = 0.2 + ((i * 7) % 5) * 0.016;
      b.cyl(0.0078, 0.0092, h, M.flesh, {
        x: cx * 0.052, y: 0.03 + h * 0.5, z: cz * 0.052, rz: cx * 0.32, rx: -cz * 0.32,
      }, 5);
      b.sphere(0.0086, M.chalk, {
        x: cx * (0.052 + h * 0.31), y: 0.03 + h * 0.95, z: cz * (0.052 + h * 0.31),
      }, 5, 4);
    }
  } });

P({ id: 'mitochondrion', name: 'Mitochondrion', cat: 'organelle', tags: ['microbe'], unit: U,
  fill: 0.42, variants: 2, weight: 6,
  build(b, r, v) {
    const col = v ? M.coral : M.rust;
    // a bean: three ellipsoids on a shallow arc
    for (let i = 0; i < 3; i++) {
      const t = i - 1;
      b.ellip(0.118, 0.125, 0.122, col, { x: t * 0.086, y: 0.128 + Math.abs(t) * 0.006, z: -Math.abs(t) * 0.026 }, 9, 6);
    }
    b.ellip(0.132, 0.128, 0.125, col, { y: 0.128 }, 9, 6);
    // cristae — inner folds, breaking the top surface
    for (let i = 0; i < 4; i++) {
      b.box(0.02, 0.05, 0.15, M.membraneD, { x: -0.105 + i * 0.07, y: 0.235, z: -0.012, rz: 0.12 });
    }
  } });

P({ id: 'chloroplast', name: 'Chloroplast', cat: 'organelle', tags: ['microbe'], unit: U,
  fill: 0.42, variants: 2, weight: 5,
  build(b, r, v) {
    const col = v ? M.jellyDeep : M.moss;
    b.ellip(0.25, 0.185, 0.215, col, { y: 0.185 }, 10, 6);
    b.ellip(0.20, 0.17, 0.17, M.jelly, { y: 0.20 }, 10, 6);
    // grana: stacks of thylakoid discs breaking the upper surface
    for (let i = 0; i < 4; i++) {
      const px = (i % 2 ? 1 : -1) * 0.088, pz = (i < 2 ? 1 : -1) * 0.072;
      for (let k = 0; k < 3; k++) {
        b.cyl(0.046, 0.046, 0.018, k % 2 ? M.moss : M.jellyDeep, { x: px, y: 0.29 + k * 0.022, z: pz }, 8);
      }
    }
    b.sphere(0.038, M.amber, { x: -0.02, y: 0.32, z: 0.0 }, 6, 5);
  } });

/* ---------------------------------------------------------- *
   Bacteria and spores  (370nm – 945nm)
 * ---------------------------------------------------------- */

P({ id: 'spore', name: 'Endospore', cat: 'bacteria', tags: ['microbe'], unit: U,
  fill: 0.48, variants: 3, weight: 6,
  build(b, r, v) {
    const col = [C.offwhite, M.agarWarm, M.amberPale][v];
    b.ellip(0.176, 0.222, 0.176, col, { y: 0.224 }, 9, 7);
    // the thick ridged coat
    for (let i = 0; i < 5; i++) {
      b.torus(0.146 - Math.abs(i - 2) * 0.03, 0.014, M.agarWarm, { y: 0.104 + i * 0.06, rx: Math.PI / 2 }, 3, 14);
    }
    b.ellip(0.086, 0.1, 0.086, M.honey, { y: 0.36 }, 7, 5);
  } });

P({ id: 'coccus', name: 'Coccus', cat: 'bacteria', tags: ['microbe'], unit: U,
  fill: 0.5, variants: 4, weight: 8,
  build(b, r, v) {
    const R = 0.225;
    const col = [M.jelly, M.membrane, M.amber, M.aqua][v];
    b.sphere(R, col, { y: R }, 8, 6);
    b.ellip(R * 0.52, R * 0.38, R * 0.52, [M.jellyDeep, M.membraneD, M.honey, M.aquaDeep][v],
      { x: R * 0.22, y: R * 1.62, z: -R * 0.18 }, 7, 5);
    b.torus(R * 0.97, R * 0.055, [M.jellyDeep, M.membraneD, M.honey, M.aquaDeep][v], { y: R * 0.98, rx: Math.PI / 2 }, 3, 14);
  } });

P({ id: 'tetrad', name: 'Tetrad', cat: 'bacteria', tags: ['microbe'], unit: U,
  fill: 0.45, variants: 3, weight: 6,
  build(b, r, v) {
    /* Four daughter cells still stuck together after two divisions at right
       angles — a real arrangement (Micrococcus does it), and squarer than a
       pair, which keeps the collision radius near the honest half-width. */
    const R = 0.208;
    const col = [M.membrane, M.jelly, M.lilac][v];
    const dark = [M.membraneD, M.jellyDeep, M.nucleus][v];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      b.sphere(R, col, { x: sx * R * 0.72, y: R, z: sz * R * 0.72 }, 8, 6);
      b.ellip(R * 0.4, R * 0.28, R * 0.4, dark, { x: sx * R * 0.86, y: R * 1.72, z: sz * R * 0.86 }, 6, 5);
    }
    b.cyl(R * 0.62, R * 0.62, R * 1.5, dark, { y: R, rz: Math.PI / 2 }, 8);
    b.cyl(R * 0.62, R * 0.62, R * 1.5, dark, { y: R, rz: Math.PI / 2, ry: Math.PI / 2 }, 8);
  } });

P({ id: 'vibrio', name: 'Vibrio', cat: 'bacteria', tags: ['microbe'], unit: U,
  fill: 0.22, variants: 2, weight: 5, surface: 'water',
  build(b, r, v) {
    const Rc = 0.56, rad = 0.13;
    const col = v ? M.aqua : M.jelly;
    const dark = v ? M.aquaDeep : M.jellyDeep;
    const z0 = Rc * Math.cos(0.85);
    // the comma
    for (let i = 0; i < 9; i++) {
      const a = -0.85 + (i / 8) * 1.7;
      const taper = 1 - Math.abs(i - 4) * 0.055;
      b.sphere(rad * taper, i % 2 ? col : dark, { x: Math.sin(a) * Rc, y: rad, z: Math.cos(a) * Rc - z0 }, 7, 5);
    }
    // single polar flagellum, kinked back on itself
    for (let i = 0; i < 9; i++) {
      const t = i / 8;
      b.sphere(0.019, M.chalk, {
        x: Math.sin(0.85) * Rc + 0.02 + t * 0.24, y: rad + Math.sin(t * 7) * 0.03, z: Math.cos(t * 7) * 0.07,
      }, 5, 4);
    }
  } });

P({ id: 'bacillus', name: 'Bacillus', cat: 'bacteria', tags: ['microbe'], unit: U,
  fill: 0.6, variants: 3, weight: 8,
  build(b, r, v) {
    const R = 0.26, L = 1.35;
    const col = [M.jelly, M.amber, M.membrane][v];
    const dark = [M.jellyDeep, M.honey, M.membraneD][v];
    b.capsule(R, L - R * 2, col, { y: R, rz: Math.PI / 2 }, 8);
    // nucleoid, showing through
    b.ellip(0.24, R * 0.5, R * 0.5, dark, { y: R * 1.42, z: 0 }, 8, 5);
    for (const s of [-1, 1]) {
      b.torus(R * 0.98, R * 0.06, dark, { x: s * 0.25, y: R, rx: Math.PI / 2, rz: Math.PI / 2 }, 3, 12);
    }
  } });

P({ id: 'coccus_chain', name: 'Chain of Cocci', cat: 'bacteria', tags: ['microbe'], unit: U,
  fill: 0.42, variants: 3, weight: 6,
  build(b, r, v) {
    const R = 0.28, n = 4;
    const col = [M.membrane, M.jelly, M.amber][v];
    const dark = [M.membraneD, M.jellyDeep, M.honey][v];
    for (let i = 0; i < n; i++) {
      const x = (i - (n - 1) / 2) * R * 1.45;
      const z = Math.sin(i * 0.9 + v) * 0.05;
      b.sphere(R, col, { x, y: R, z }, 8, 6);
      if (i) b.cyl(R * 0.6, R * 0.6, R * 0.72, dark, { x: x - R * 0.725, y: R, z, rz: Math.PI / 2 }, 7);
    }
  } });

P({ id: 'spirillum', name: 'Spirillum', cat: 'bacteria', tags: ['microbe'], unit: U,
  fill: 0.14, variants: 2, weight: 4, surface: 'water',
  build(b, r, v) {
    const L = 1.32, amp = 0.29, tube = 0.10;
    const col = v ? M.aqua : M.jellyDeep;
    for (let i = 0; i < 16; i++) {
      const t = i / 15;
      const a = t * 1.9 * TAU;
      b.sphere(tube * (1 - Math.abs(t - 0.5) * 0.3), i % 3 ? col : M.aquaDeep, {
        x: -L / 2 + t * L, y: amp + tube + Math.sin(a) * amp, z: Math.cos(a) * amp,
      }, 6, 5);
    }
  } });

/* ---------------------------------------------------------- *
   Big cells and the things they leave behind  (1µm – 1µm5)
 * ---------------------------------------------------------- */

P({ id: 'yeast', name: 'Budding Yeast', cat: 'cell', tags: ['microbe'], unit: U,
  fill: 0.45, variants: 3, weight: 5,
  build(b, r, v) {
    const R = 0.53;
    const col = [M.amberPale, M.chalk, M.agarWarm][v];
    b.sphere(R, col, { y: R }, 8, 6);
    b.sphere(R * 0.55, col, { x: R * 1.15, y: R * 0.78 }, 8, 6);
    b.sphere(R * 0.34, M.nucleus, { x: -R * 0.16, y: R * 1.5, z: R * 0.1 }, 7, 5);
    // bud scars
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + v;
      b.torus(R * 0.15, R * 0.045, M.honey, {
        x: Math.cos(a) * R * 0.72, y: R * 0.4, z: Math.sin(a) * R * 0.72, rx: Math.PI / 2, ry: a,
      }, 3, 10);
    }
    b.cyl(R * 0.3, R * 0.3, R * 0.2, M.honey, { x: R * 0.72, y: R * 0.86, rz: Math.PI / 2 }, 8);
  } });

P({ id: 'pollen', name: 'Pollen Grain', cat: 'cell', tags: ['microbe'], unit: U,
  fill: 0.3, variants: 3, weight: 5,
  build(b, r, v) {
    const R = 0.472, spike = 0.118;
    const col = [M.honey, M.amber, M.rust][v];
    b.sphere(R, col, { y: R + spike }, 9, 7);
    for (let i = 0; i < 17; i++) {
      const e = Math.acos(1 - 2 * ((i + 0.5) / 17));
      const a = i * 2.399963;
      const sx = Math.sin(e) * Math.cos(a), sy = Math.cos(e), sz = Math.sin(e) * Math.sin(a);
      b.cone(0.058, spike * 1.7, M.rust, {
        x: sx * R * 1.02, y: R + spike + sy * R * 1.02, z: sz * R * 1.02,
        rz: -Math.atan2(sx, sy), rx: Math.atan2(sz, sy),
      }, 5);
    }
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU + v;
      b.cyl(R * 0.16, R * 0.16, R * 0.1, M.amberPale, {
        x: Math.cos(a) * R * 0.96, y: R + spike, z: Math.sin(a) * R * 0.96, rz: Math.PI / 2, ry: -a,
      }, 7);
    }
  } });

P({ id: 'diatom', name: 'Diatom', cat: 'cell', tags: ['microbe'], unit: U,
  fill: 0.52, variants: 3, weight: 4, surface: 'water',
  build(b, r, v) {
    const R = 0.75, H = 1.26;
    const col = [M.chalk, M.agar, M.jellyPale][v];
    b.cylOn(R, H * 0.62, col, {}, 10);
    b.cyl(R * 1.02, R * 1.02, H * 0.14, M.aquaDeep, { y: H * 0.62 }, 10);
    b.cylOn(R * 0.99, H * 0.16, col, { y: H * 0.68 }, 10);
    b.lathe([[R * 0.99, 0], [R * 0.86, H * 0.09], [R * 0.5, H * 0.15], [0.001, H * 0.17]], col, { y: H * 0.84 }, 10);
    // the patterned frustule: rings of pores
    for (let ring = 0; ring < 3; ring++) {
      const rr = R * (0.28 + ring * 0.26), n = 6 + ring * 4;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + ring * 0.4 + v * 0.3;
        b.cyl(R * 0.055, R * 0.055, H * 0.05, M.aqua, {
          x: Math.cos(a) * rr, y: H * 0.86 - ring * H * 0.012, z: Math.sin(a) * rr,
        }, 5);
      }
    }
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      b.box(R * 0.1, H * 0.5, R * 0.05, M.aquaDeep, { x: Math.cos(a) * R * 0.99, y: H * 0.35, z: Math.sin(a) * R * 0.99, ry: -a });
    }
  } });

P({ id: 'biofilm', name: 'Biofilm Fragment', cat: 'colony', tags: ['microbe'], unit: U,
  fill: 0.36, variants: 2, weight: 4,
  build(b, r, v) {
    // a torn-off lump of matrix with its residents still in it
    b.ellip(0.90, 0.42, 0.78, M.matrix, { y: 0.4 }, 10, 6);
    b.ellip(0.68, 0.34, 0.56, M.agarWarm, { y: 0.56, x: 0.12, z: -0.08 }, 9, 5);
    for (let i = 0; i < 9; i++) {
      const a = i * 2.399963 + v;
      const d = 0.2 + ((i * 5) % 7) * 0.09;
      const px = Math.cos(a) * d, pz = Math.sin(a) * d * 0.86;
      if (i % 3 === 0) {
        b.capsule(0.088, 0.26, M.jelly, { x: px, y: 0.72, z: pz, rz: Math.PI / 2, ry: a }, 6);
      } else if (i % 3 === 1) {
        b.sphere(0.115, M.membrane, { x: px, y: 0.74, z: pz }, 7, 5);
      } else {
        b.sphere(0.09, M.amber, { x: px, y: 0.68, z: pz }, 6, 4);
      }
    }
    for (let i = 0; i < 5; i++) {
      const a = i * 1.2566 + v * 0.5;
      b.cyl(0.03, 0.05, 0.3, M.jellyPale, { x: Math.cos(a) * 0.5, y: 0.72, z: Math.sin(a) * 0.44, rz: Math.cos(a) * 0.5, rx: -Math.sin(a) * 0.5 }, 5);
    }
  } });

P({ id: 'amoeba', name: 'Amoeba', cat: 'cell', tags: ['microbe'], unit: U,
  fill: 0.2, variants: 3, weight: 3,
  build(b, r, v) {
    const col = [M.jellyPale, M.chalk, M.amberPale][v];
    b.ellip(0.55, 0.42, 0.50, col, { y: 0.42 }, 10, 6);
    // pseudopods, reaching
    const n = 5;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + v * 0.6;
      const reach = 0.44 + ((i * 3) % 4) * 0.07;
      for (let k = 1; k <= 4; k++) {
        const t = k / 4;
        b.ellip(0.22 - t * 0.1, 0.24 - t * 0.13, 0.22 - t * 0.1, col, {
          x: Math.cos(a) * reach * t * 1.5, y: 0.38 - t * 0.14, z: Math.sin(a) * reach * t * 1.5,
        }, 7, 5);
      }
    }
    b.sphere(0.235, M.nucleus, { x: -0.06, y: 0.5, z: 0.05 }, 8, 6);
    b.sphere(0.1, M.aqua, { x: 0.24, y: 0.46, z: -0.2 }, 6, 5);
    for (let i = 0; i < 4; i++) {
      const a = i * 1.9 + v;
      b.sphere(0.062, M.amber, { x: Math.cos(a) * 0.26, y: 0.5, z: Math.sin(a) * 0.24 }, 5, 4);
    }
  } });
