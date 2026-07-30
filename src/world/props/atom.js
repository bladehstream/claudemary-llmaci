/* ============================================================
   The Atom — the catalogue for the first stage.

   ONE WORLD UNIT = ONE NANOMETRE. Everything here is authored in
   the same comfortable numeric band the house's metres live in
   (see the note above TIERS in util/math.js): a hydrogen atom is
   0.075 units across, not 1e-10. `unit: 'atomic'` on every entry
   is what makes the collection log print that as 7Å5pm instead of
   a bare number.

   THE SIZES ARE ORDERED, NOT TO SCALE. A real protein domain is
   forty thousand times a proton, and a stage cannot be a ladder if
   one rung is forty thousand times the last. So the ordering is
   honest — a proton is smaller than an atom is smaller than a
   molecule — and the spacing is play: each archetype is about
   1.15x the one below it, comfortably inside the 1.55x jump the
   balance tool calls a gap.

   Every build is written as multiples of a single `S`, which IS
   the archetype's pickup size. `pickup` is cbrt(w*h*d), so scaling
   the whole build scales it linearly; keeping one dial per prop is
   what makes retuning the ladder a one-line edit instead of a
   geometry rewrite.

   Segment counts are deliberately mean (5-8 on spheres, 5 on
   bonds). There are well over a thousand of these on screen and
   at this size they are three pixels each.
   ============================================================ */

import { defineProp } from './index.js';
import { C } from '../../render/palette.js';

const P = defineProp;
const TAU = Math.PI * 2;
/** Golden angle — spreads n points evenly over a sphere without a table. */
const GOLD = 2.399963229728653;

/* ------------------------------------------------------------
   Local palette. Dark, luminous stage: everything here has to
   glow against a near-black probability field, so the CPK
   convention is kept for recognisability (O red, N blue, S
   yellow) but lifted well off the floor of the value range —
   carbon in particular, which is conventionally black and would
   be invisible.

   Deliberately NOT added to palette.js: nothing outside this
   stage wants "electron cyan", and the shared set is shared.
   ------------------------------------------------------------ */
const A = {
  electron:  0x7cf3ff,   // electric cyan
  spark:     0xc6f9ff,
  proton:    0xff5c8f,   // hot magenta
  neutron:   0xc2ccff,   // pale blue-white
  quark:     0xffe15c,   // hot yellow
  glowV:     0x9c63ff,   // violet
  glowM:     0xff4bc6,   // magenta

  // elements
  H:   0xf0f6ff,
  Cc:  0x666f96,
  CcD: 0x454d76,
  N:   0x6f92ff,
  O:   0xff6152,
  Ph:  0xffa03c,
  S:   0xffe14d,
  Na:  0xb083ff,
  Cl:  0x74ea86,
  Fe:  0xff8b3d,
  Mg:  0x5fe2ab,

  bond:    0x9aa2d8,
  bondLo:  0x666ea6,
  hbond:   0x59e8d0,
  ribbon:  0x54c8ff,
  sheet:   0xffb35c,
  coil:    0x8f7ad6,
};

/* ------------------------------------------------------------
   Drawing helpers
   ------------------------------------------------------------ */

/**
 * A cylinder running from p to q, both [x,y,z].
 *
 * `applyOpts` builds its quaternion from an Euler in 'YXZ' order, so with
 * rz left at zero the cylinder's +Y axis lands on
 *   ( sin(rx)sin(ry), cos(rx), sin(rx)cos(ry) )
 * which inverts to rx = acos(dy/len), ry = atan2(dx, dz).
 */
function bond(b, p, q, r, col, seg = 5) {
  const dx = q[0] - p[0], dy = q[1] - p[1], dz = q[2] - p[2];
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-9) return;
  b.cyl(r, r, len, col, {
    x: (p[0] + q[0]) / 2, y: (p[1] + q[1]) / 2, z: (p[2] + q[2]) / 2,
    rx: Math.acos(Math.max(-1, Math.min(1, dy / len))),
    ry: Math.atan2(dx, dz),
  }, seg);
}

/** Two parallel bonds — a double bond. */
function bond2(b, p, q, r, col, gap, seg = 5) {
  const dx = q[0] - p[0], dz = q[2] - p[2];
  let ux = dz, uz = -dx;
  const ul = Math.hypot(ux, uz);
  if (ul < 1e-9) { ux = 1; uz = 0; } else { ux /= ul; uz /= ul; }
  for (const s of [-1, 1]) {
    bond(b, [p[0] + ux * gap * s, p[1], p[2] + uz * gap * s],
      [q[0] + ux * gap * s, q[1], q[2] + uz * gap * s], r, col, seg);
  }
}

/** A dashed hydrogen bond — three beads on the line from p to q. */
function hbond(b, p, q, r, col) {
  for (let i = 1; i <= 3; i++) {
    const t = i / 4;
    b.sphere(r, col, { x: p[0] + (q[0] - p[0]) * t, y: p[1] + (q[1] - p[1]) * t, z: p[2] + (q[2] - p[2]) * t }, 5, 4);
  }
}

/** n points spread evenly over a sphere of radius R, as small spheres. */
function shellDots(b, R, n, dr, col, phase, seg = 5, hseg = 4) {
  for (let i = 0; i < n; i++) {
    const y = 1 - (2 * i + 1) / n;
    const rad = Math.sqrt(Math.max(0, 1 - y * y));
    const a = i * GOLD + phase;
    b.sphere(dr, col, { x: Math.cos(a) * rad * R, y: y * R, z: Math.sin(a) * rad * R }, seg, hseg);
  }
}

/** A nucleus: a huddle of protons and neutrons that fits inside radius R. */
function nucleusBall(b, R, n, phase) {
  const cap = Math.max(1, Math.min(n, 7));
  if (cap === 1) { b.sphere(R, A.proton, {}, 7, 5); return; }
  const r = R * (cap <= 4 ? 0.6 : 0.48);
  shellDotsMixed(b, R - r, cap, r, phase);
}

function shellDotsMixed(b, R, n, dr, phase) {
  for (let i = 0; i < n; i++) {
    const y = n === 1 ? 0 : 1 - (2 * i + 1) / n;
    const rad = Math.sqrt(Math.max(0, 1 - y * y));
    const a = i * GOLD + phase;
    b.sphere(dr, i % 2 ? A.proton : A.neutron,
      { x: Math.cos(a) * rad * R, y: y * R, z: Math.sin(a) * rad * R }, 6, 4);
  }
}

/**
 * A whole atom: nucleus plus one or more electron shells, each a thin
 * orbit ring with its electrons beaded onto it. The outermost shell is
 * sized so the finished thing spans exactly 1.0 * S.
 *
 * @param {Array<[number, number]>} shells [radiusFrac, electronCount]
 */
function atomBody(b, S, nucFrac, nucN, shells, phase) {
  nucleusBall(b, nucFrac * S, nucN, phase);
  for (let k = 0; k < shells.length; k++) {
    const R = shells[k][0] * S, n = shells[k][1];
    const last = k === shells.length - 1;
    const tilt = 0.4 + k * 1.1 + phase;
    b.torus(R, S * 0.014, last ? A.electron : A.spark,
      { rx: Math.PI / 2 + Math.sin(tilt) * 0.55, rz: Math.cos(tilt) * 0.5 }, 3, 12);
    // A second ring across the first on the outermost shell. Without it an
    // atom with one or two valence electrons is a flat disc lying on the
    // floor rather than a shell you can see round.
    if (last) b.torus(R, S * 0.012, A.spark, { ry: Math.sin(tilt) * 0.6, rz: Math.cos(tilt) * 0.35 }, 3, 12);
    shellDots(b, R, n, S * 0.05, A.electron, tilt);
  }
}

/** A flat n-gon ring of atoms with bonds around the rim, lying in XZ. */
function ringMol(b, cx, cy, cz, R, n, ar, br, atomCols, bondCol, twist = 0) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + twist;
    pts.push([cx + Math.cos(a) * R, cy, cz + Math.sin(a) * R]);
  }
  for (let i = 0; i < n; i++) bond(b, pts[i], pts[(i + 1) % n], br, bondCol);
  for (let i = 0; i < n; i++) b.sphere(ar, atomCols[i % atomCols.length], { x: pts[i][0], y: pts[i][1], z: pts[i][2] }, 6, 4);
  return pts;
}

/* ============================================================
   Sub-atomic  (30pm - 65pm)
   ============================================================ */

P({ id: 'atom_electron', name: 'Electron', cat: 'particle', tags: ['atom'], unit: 'atomic',
  fill: 0.4, variants: 3, weight: 10,
  build(b, r, v) {
    const S = 0.03581;
    b.sphere(0.26 * S, A.electron, {}, 7, 5);
    b.torus(0.42 * S, 0.024 * S, A.spark, { rx: Math.PI / 2 + v * 0.4, rz: v * 0.3 }, 3, 10);
    for (let i = 0; i < 3; i++) {
      const a = i * TAU / 3 + v;
      b.sphere(0.08 * S, A.spark,
        { x: Math.cos(a) * 0.42 * S, y: (i - 1) * 0.28 * S, z: Math.sin(a) * 0.42 * S }, 5, 4);
    }
  } });

P({ id: 'atom_proton', name: 'Proton', cat: 'particle', tags: ['atom'], unit: 'atomic',
  fill: 0.5, variants: 2, weight: 9,
  build(b, r, v) {
    const S = 0.03600;
    b.sphere(0.5 * S, A.proton, {}, 8, 6);
    for (let i = 0; i < 3; i++) {
      const a = i * TAU / 3 + v * 0.7;
      b.sphere(0.13 * S, i === 2 ? A.electron : A.quark,
        { x: Math.cos(a) * 0.24 * S, y: Math.sin(a * 2) * 0.12 * S, z: Math.sin(a) * 0.24 * S }, 5, 4);
    }
  } });

P({ id: 'atom_neutron', name: 'Neutron', cat: 'particle', tags: ['atom'], unit: 'atomic',
  fill: 0.5, variants: 2, weight: 8,
  build(b, r, v) {
    const S = 0.04200;
    b.sphere(0.5 * S, A.neutron, {}, 8, 6);
    for (let i = 0; i < 3; i++) {
      const a = i * TAU / 3 + v * 1.1;
      b.sphere(0.13 * S, i === 0 ? A.quark : A.glowV,
        { x: Math.cos(a) * 0.24 * S, y: Math.cos(a * 2) * 0.12 * S, z: Math.sin(a) * 0.24 * S }, 5, 4);
    }
  } });

P({ id: 'atom_alpha', name: 'Alpha Particle', cat: 'particle', tags: ['atom'], unit: 'atomic',
  fill: 0.44, variants: 2, weight: 7,
  build(b, r, v) {
    const S = 0.05681;
    const k = 0.22 * S, rr = 0.28 * S;
    const verts = [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]];
    for (let i = 0; i < 4; i++) {
      const p = verts[(i + v) % 4];
      b.sphere(rr, i < 2 ? A.proton : A.neutron,
        { x: p[0] * k, y: p[1] * k, z: p[2] * k }, 7, 5);
    }
    b.torus(0.44 * S, 0.015 * S, A.spark, { rx: Math.PI / 2, rz: 0.4 }, 3, 10);
  } });

P({ id: 'atom_hplus', name: 'Hydrogen Ion', cat: 'particle', tags: ['atom'], unit: 'atomic',
  fill: 0.3, variants: 2, weight: 7,
  build(b, r, v) {
    const S = 0.06894;
    b.sphere(0.2 * S, A.proton, {}, 7, 5);
    for (let k = 0; k < 2; k++) {
      b.torus(0.4 * S, 0.018 * S, k ? A.glowM : A.spark,
        { rx: Math.PI / 2 + k * 1.0 + v * 0.3, rz: k * 0.7 }, 3, 12);
    }
    // the missing electron, drawn as a bare charge
    b.box(0.34 * S, 0.05 * S, 0.05 * S, A.quark, { y: 0.42 * S });
    b.box(0.05 * S, 0.34 * S, 0.05 * S, A.quark, { y: 0.42 * S });
    for (let i = 0; i < 4; i++) {
      const a = i * TAU / 4 + 0.4;
      b.sphere(0.05 * S, A.glowM, { x: Math.cos(a) * 0.45 * S, y: -0.1 * S, z: Math.sin(a) * 0.45 * S }, 5, 4);
    }
  } });

/* ============================================================
   Atoms  (75pm - 1Å45pm)
   ============================================================ */

P({ id: 'atom_hydrogen', name: 'Hydrogen Atom', cat: 'atom', tags: ['atom'], unit: 'atomic',
  fill: 0.42, variants: 4, weight: 10,
  build(b, r, v) {
    const S = 0.08138;
    atomBody(b, S, 0.13, 1, [[0.45, 1]], v * 0.8);
  } });

P({ id: 'atom_helium', name: 'Helium Atom', cat: 'atom', tags: ['atom'], unit: 'atomic',
  fill: 0.42, variants: 3, weight: 8,
  build(b, r, v) {
    const S = 0.09918;
    atomBody(b, S, 0.18, 4, [[0.45, 2]], v * 0.9 + 0.3);
  } });

P({ id: 'atom_lithium', name: 'Lithium Atom', cat: 'atom', tags: ['atom'], unit: 'atomic',
  fill: 0.42, variants: 3, weight: 7,
  build(b, r, v) {
    const S = 0.11249;
    atomBody(b, S, 0.2, 7, [[0.26, 2], [0.45, 1]], v * 0.7 + 0.9);
  } });

P({ id: 'atom_carbon', name: 'Carbon Atom', cat: 'atom', tags: ['atom'], unit: 'atomic',
  fill: 0.44, variants: 3, weight: 8,
  build(b, r, v) {
    const S = 0.13303;
    atomBody(b, S, 0.22, 12, [[0.25, 2], [0.45, 4]], v * 0.8 + 1.6);
  } });

P({ id: 'atom_oxygen', name: 'Oxygen Atom', cat: 'atom', tags: ['atom'], unit: 'atomic',
  fill: 0.44, variants: 3, weight: 8,
  build(b, r, v) {
    const S = 0.15607;
    atomBody(b, S, 0.24, 16, [[0.24, 2], [0.45, 6]], v * 0.6 + 2.4);
  } });

/* ============================================================
   Small molecules  (1Å70pm - 4Å50pm)
   ============================================================ */

P({ id: 'mol_hydroxide', name: 'Hydroxide Ion', cat: 'molecule', tags: ['atom'], unit: 'atomic',
  fill: 0.3, variants: 2, weight: 8,
  build(b, r, v) {
    const S = 0.23934;
    const o = [-0.1 * S, 0, 0], h = [0.28 * S, 0.14 * S, 0];
    bond(b, o, h, 0.05 * S, A.bond);
    b.sphere(0.24 * S, A.O, { x: o[0], y: o[1], z: o[2] }, 8, 6);
    b.sphere(0.13 * S, A.H, { x: h[0], y: h[1], z: h[2] }, 6, 5);
    // the spare charge
    b.box(0.2 * S, 0.045 * S, 0.045 * S, A.electron, { x: -0.06 * S, y: 0.34 * S, z: 0.02 * S });
    if (v) b.torus(0.34 * S, 0.014 * S, A.spark, { x: o[0], rx: Math.PI / 2, rz: 0.5 }, 3, 10);
  } });

P({ id: 'mol_water', name: 'Water', cat: 'molecule', tags: ['atom'], unit: 'atomic',
  fill: 0.32, variants: 3, weight: 12,
  build(b, r, v) {
    const S = 0.31743;
    const half = 0.912;   // 104.5 degrees, in radians / 2
    const L = 0.34 * S;
    const o = [0, 0, 0];
    for (const s of [-1, 1]) {
      const h = [Math.sin(half) * L * s, Math.cos(half) * L, 0];
      bond(b, o, h, 0.05 * S, A.bond);
      b.sphere(0.14 * S, A.H, { x: h[0], y: h[1], z: h[2] }, 6, 5);
    }
    b.sphere(0.24 * S, A.O, {}, 8, 6);
    if (v === 2) b.sphere(0.06 * S, A.electron, { y: -0.24 * S, z: 0.14 * S }, 5, 4);
  } });

P({ id: 'mol_ammonia', name: 'Ammonia', cat: 'molecule', tags: ['atom'], unit: 'atomic',
  fill: 0.32, variants: 2, weight: 9,
  build(b, r, v) {
    const S = 0.32826;
    const n = [0, 0.06 * S, 0], L = 0.33 * S;
    for (let i = 0; i < 3; i++) {
      const a = i * TAU / 3 + v * 0.5;
      const h = [Math.cos(a) * L * 0.94, n[1] - L * 0.42, Math.sin(a) * L * 0.94];
      bond(b, n, h, 0.048 * S, A.bond);
      b.sphere(0.13 * S, A.H, { x: h[0], y: h[1], z: h[2] }, 6, 5);
    }
    b.sphere(0.22 * S, A.N, { y: n[1] }, 8, 6);
    // lone pair
    for (const s of [-1, 1]) b.sphere(0.055 * S, A.electron, { x: s * 0.07 * S, y: 0.32 * S }, 5, 4);
  } });

P({ id: 'mol_methane', name: 'Methane', cat: 'molecule', tags: ['atom'], unit: 'atomic',
  fill: 0.34, variants: 2, weight: 9,
  build(b, r, v) {
    const S = 0.43479;
    const L = 0.33 * S;
    const verts = [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]];
    for (let i = 0; i < 4; i++) {
      const p = verts[(i + v) % 4];
      const h = [p[0] * L * 0.577, p[1] * L * 0.577, p[2] * L * 0.577];
      bond(b, [0, 0, 0], h, 0.045 * S, A.bond);
      b.sphere(0.13 * S, A.H, { x: h[0], y: h[1], z: h[2] }, 6, 5);
    }
    b.sphere(0.21 * S, A.Cc, {}, 8, 6);
  } });

P({ id: 'mol_co2', name: 'Carbon Dioxide', cat: 'molecule', tags: ['atom'], unit: 'atomic',
  fill: 0.2, variants: 2, weight: 8,
  build(b, r, v) {
    const S = 0.44316;
    const L = 0.5 * S;
    for (const s of [-1, 1]) {
      bond2(b, [0, 0, 0], [s * L, 0, 0], 0.045 * S, A.bondLo, 0.085 * S);
      b.sphere(0.24 * S, A.O, { x: s * L }, 8, 6);
    }
    b.sphere(0.21 * S, A.Cc, {}, 8, 6);
    if (v) for (const s of [-1, 1]) b.sphere(0.05 * S, A.electron, { x: s * L * 0.5, y: 0.24 * S }, 5, 4);
  } });

P({ id: 'mol_ethanol', name: 'Ethanol', cat: 'molecule', tags: ['atom'], unit: 'atomic',
  fill: 0.22, variants: 2, weight: 8,
  build(b, r, v) {
    const S = 0.46411;
    const c1 = [-0.5 * S, -0.06 * S, 0], c2 = [-0.1 * S, 0.1 * S, 0], ox = [0.34 * S, -0.06 * S, 0];
    bond(b, c1, c2, 0.045 * S, A.bond);
    bond(b, c2, ox, 0.045 * S, A.bond);
    const oh = [0.56 * S, 0.1 * S, 0.04 * S];
    bond(b, ox, oh, 0.038 * S, A.bond);
    b.sphere(0.17 * S, A.Cc, { x: c1[0], y: c1[1] }, 7, 5);
    b.sphere(0.17 * S, A.Cc, { x: c2[0], y: c2[1] }, 7, 5);
    b.sphere(0.18 * S, A.O, { x: ox[0], y: ox[1] }, 7, 5);
    b.sphere(0.1 * S, A.H, { x: oh[0], y: oh[1], z: oh[2] }, 5, 4);
    // methyl and methylene hydrogens
    const hs = [[c1, 0.2, 0.9], [c1, -0.2, -0.9], [c2, 0.2, 0.95], [c2, -0.2, -0.95]];
    for (let i = 0; i < hs.length; i++) {
      const [c, dy, dz] = hs[i];
      const h = [c[0] + (i % 2 ? 0.1 : -0.1) * S, c[1] + dy * S * 0.9, c[2] + dz * S * 0.22];
      bond(b, c, h, 0.032 * S, A.bondLo);
      b.sphere(0.09 * S, A.H, { x: h[0], y: h[1], z: h[2] }, 5, 4);
    }
    if (v) b.torus(0.24 * S, 0.012 * S, A.spark, { x: ox[0], y: ox[1], rx: Math.PI / 2 }, 3, 10);
  } });

P({ id: 'mol_benzene', name: 'Benzene Ring', cat: 'molecule', tags: ['atom'], unit: 'atomic',
  fill: 0.24, variants: 2, weight: 8,
  build(b, r, v) {
    const S = 0.63083;
    const R = 0.32 * S;
    ringMol(b, 0, 0, 0, R, 6, 0.13 * S, 0.045 * S, [A.Cc], A.bond, v * 0.3);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + v * 0.3;
      const c = [Math.cos(a) * R, 0, Math.sin(a) * R];
      const h = [Math.cos(a) * R * 1.62, 0, Math.sin(a) * R * 1.62];
      bond(b, c, h, 0.032 * S, A.bondLo);
      b.sphere(0.085 * S, A.H, { x: h[0], z: h[2] }, 5, 4);
    }
    // the delocalised ring
    b.torus(R * 0.58, 0.026 * S, A.glowV, { rx: Math.PI / 2 }, 3, 12);
  } });

/* ============================================================
   Crystal and sugars  (5Å20pm - 7Å0pm)
   ============================================================ */

P({ id: 'mol_saltcell', name: 'Salt Unit Cell', cat: 'crystal', tags: ['atom'], unit: 'atomic',
  fill: 0.4, variants: 2, weight: 7,
  build(b, r, v) {
    const S = 0.53205;
    const k = 0.3 * S;
    const pts = [];
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) pts.push([sx * k, sy * k, sz * k]);
    // lattice struts along the cube edges
    for (let i = 0; i < 8; i++) {
      for (let j = i + 1; j < 8; j++) {
        const d = Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1], pts[i][2] - pts[j][2]);
        if (d < k * 2.1) bond(b, pts[i], pts[j], 0.026 * S, A.bondLo, 4);
      }
    }
    for (let i = 0; i < 8; i++) {
      const p = pts[i];
      const na = ((p[0] > 0 ? 1 : 0) + (p[1] > 0 ? 1 : 0) + (p[2] > 0 ? 1 : 0) + v) % 2 === 0;
      b.sphere(na ? 0.18 * S : 0.2 * S, na ? A.Na : A.Cl, { x: p[0], y: p[1], z: p[2] }, 7, 5);
    }
  } });

P({ id: 'mol_glucose', name: 'Glucose', cat: 'molecule', tags: ['atom'], unit: 'atomic',
  fill: 0.26, variants: 3, weight: 8,
  build(b, r, v) {
    const S = 0.53643;
    const R = 0.3 * S;
    const cols = [A.O, A.Cc, A.Cc, A.Cc, A.Cc, A.Cc];
    const pts = ringMol(b, 0, 0, 0, R, 6, 0.12 * S, 0.042 * S, cols, A.bond, 0.2);
    // hydroxyls sticking off the ring, alternating up and down
    for (let i = 1; i < 6; i++) {
      const p = pts[i];
      const dir = i % 2 ? 1 : -1;
      const o = [p[0] * 1.4, dir * 0.28 * S, p[2] * 1.4];
      bond(b, p, o, 0.034 * S, A.bondLo);
      b.sphere(0.11 * S, A.O, { x: o[0], y: o[1], z: o[2] }, 6, 4);
      const h = [o[0] * 1.16, o[1] + dir * 0.12 * S, o[2] * 1.16];
      b.sphere(0.07 * S, A.H, { x: h[0], y: h[1], z: h[2] }, 5, 4);
    }
    // the CH2OH arm
    const arm = [pts[0][0] * 1.5, 0.42 * S, pts[0][2] * 1.5];
    bond(b, pts[1], arm, 0.036 * S, A.bond);
    b.sphere(0.11 * S, A.Cc, { x: arm[0], y: arm[1], z: arm[2] }, 6, 4);
    b.sphere(0.09 * S, A.O, { x: arm[0] + 0.1 * S, y: arm[1] + 0.16 * S, z: arm[2] }, 5, 4);
    if (v === 2) b.torus(R * 0.5, 0.02 * S, A.spark, { rx: Math.PI / 2 }, 3, 10);
  } });

P({ id: 'mol_aminoacid', name: 'Amino Acid', cat: 'molecule', tags: ['atom'], unit: 'atomic',
  fill: 0.22, variants: 4, weight: 8,
  build(b, r, v) {
    const S = 0.75059;
    /* Laid out in three dimensions rather than flat on a page. A molecule
       drawn as a flat diagram has to be very wide to reach a given pickup
       size, and `radius` is taken off that width: a wide prop SHADOWS the
       small ones near it, which then cannot be reached at all. */
    const n = [-0.34 * S, -0.02 * S, -0.1 * S], ca = [-0.06 * S, 0.1 * S, 0.06 * S], cc = [0.22 * S, -0.04 * S, -0.04 * S];
    bond(b, n, ca, 0.045 * S, A.bond);
    bond(b, ca, cc, 0.045 * S, A.bond);
    b.sphere(0.16 * S, A.N, { x: n[0], y: n[1], z: n[2] }, 7, 5);
    b.sphere(0.15 * S, A.Cc, { x: ca[0], y: ca[1], z: ca[2] }, 7, 5);
    b.sphere(0.15 * S, A.Cc, { x: cc[0], y: cc[1], z: cc[2] }, 7, 5);
    // amine hydrogens
    for (const s of [-1, 1]) {
      const h = [n[0] - 0.12 * S, n[1] + 0.16 * S * s, n[2] + 0.16 * S * s];
      bond(b, n, h, 0.03 * S, A.bondLo);
      b.sphere(0.08 * S, A.H, { x: h[0], y: h[1], z: h[2] }, 5, 4);
    }
    // carboxyl
    const od = [0.36 * S, 0.16 * S, 0.16 * S], oh = [0.36 * S, -0.2 * S, -0.2 * S];
    bond2(b, cc, od, 0.032 * S, A.bondLo, 0.05 * S);
    bond(b, cc, oh, 0.04 * S, A.bond);
    b.sphere(0.14 * S, A.O, { x: od[0], y: od[1], z: od[2] }, 6, 5);
    b.sphere(0.14 * S, A.O, { x: oh[0], y: oh[1], z: oh[2] }, 6, 5);
    b.sphere(0.07 * S, A.H, { x: oh[0] + 0.12 * S, y: oh[1] - 0.08 * S, z: oh[2] }, 5, 4);
    // side chain — the whole point of there being twenty of these
    const sc = [ca[0] - 0.02 * S, ca[1] + 0.28 * S, ca[2] + 0.06 * S];
    bond(b, ca, sc, 0.04 * S, A.bond);
    if (v === 0) {                                   // alanine: a methyl
      b.sphere(0.14 * S, A.Cc, { x: sc[0], y: sc[1], z: sc[2] }, 6, 5);
    } else if (v === 1) {                            // cysteine: a thiol
      b.sphere(0.12 * S, A.Cc, { x: sc[0], y: sc[1], z: sc[2] }, 6, 4);
      const s2 = [sc[0] + 0.08 * S, sc[1] + 0.26 * S, sc[2]];
      bond(b, sc, s2, 0.036 * S, A.bond);
      b.sphere(0.15 * S, A.S, { x: s2[0], y: s2[1], z: s2[2] }, 6, 5);
    } else if (v === 2) {                            // serine: a hydroxyl
      b.sphere(0.12 * S, A.Cc, { x: sc[0], y: sc[1], z: sc[2] }, 6, 4);
      const o2 = [sc[0] - 0.06 * S, sc[1] + 0.24 * S, sc[2]];
      bond(b, sc, o2, 0.034 * S, A.bond);
      b.sphere(0.13 * S, A.O, { x: o2[0], y: o2[1], z: o2[2] }, 6, 5);
    } else {                                         // phenylalanine: a ring
      b.sphere(0.11 * S, A.Cc, { x: sc[0], y: sc[1], z: sc[2] }, 6, 4);
      const rr = 0.17 * S;
      const cy = sc[1] + 0.28 * S;
      for (let i = 0; i < 6; i++) {
        const a1 = (i / 6) * TAU, a2 = ((i + 1) / 6) * TAU;
        const p1 = [sc[0] + Math.cos(a1) * rr, cy + Math.sin(a1) * rr, sc[2]];
        const p2 = [sc[0] + Math.cos(a2) * rr, cy + Math.sin(a2) * rr, sc[2]];
        bond(b, p1, p2, 0.03 * S, A.bondLo, 4);
        b.sphere(0.075 * S, A.Cc, { x: p1[0], y: p1[1], z: p1[2] }, 5, 4);
      }
    }
  } });

/* ============================================================
   Nucleotides, lipids, peptides  (8Å20pm - 1nm4Å50pm)
   ============================================================ */

P({ id: 'mol_nucleotide', name: 'Nucleotide', cat: 'molecule', tags: ['atom'], unit: 'atomic',
  fill: 0.22, variants: 4, weight: 8,
  build(b, r, v) {
    const S = 1.02164;
    const baseCol = [A.N, A.glowM, A.Mg, A.Ph][v];
    // phosphate, standing above the sugar rather than trailing off sideways
    const p0 = [-0.3 * S, 0.3 * S, 0];
    b.sphere(0.15 * S, A.Ph, { x: p0[0], y: p0[1] }, 7, 5);
    for (let i = 0; i < 4; i++) {
      const a = i * TAU / 4 + 0.5;
      const o = [p0[0] + Math.cos(a) * 0.2 * S, p0[1] + Math.sin(a) * 0.14 * S, Math.sin(a * 2) * 0.16 * S];
      bond(b, p0, o, 0.032 * S, A.bondLo, 4);
      b.sphere(0.1 * S, A.O, { x: o[0], y: o[1], z: o[2] }, 5, 4);
    }
    // ribose: a five-ring
    const rc = [-0.06 * S, -0.06 * S, 0], rr = 0.2 * S;
    const rpts = ringMol(b, rc[0], rc[1], rc[2], rr, 5, 0.1 * S, 0.036 * S, [A.O, A.Cc, A.Cc, A.Cc, A.Cc], A.bond, 0.9);
    bond(b, p0, rpts[2], 0.036 * S, A.bond);
    // base: a six-ring hanging off the far side
    const bc = [0.36 * S, 0.14 * S, 0.02 * S], br = 0.24 * S;
    bond(b, rpts[0], bc, 0.036 * S, A.bond);
    for (let i = 0; i < 6; i++) {
      const a1 = (i / 6) * TAU, a2 = ((i + 1) / 6) * TAU;
      const q1 = [bc[0] + Math.cos(a1) * br, bc[1], bc[2] + Math.sin(a1) * br];
      const q2 = [bc[0] + Math.cos(a2) * br, bc[1], bc[2] + Math.sin(a2) * br];
      bond(b, q1, q2, 0.034 * S, A.bond, 4);
      b.sphere(0.095 * S, i % 3 === 0 ? baseCol : A.Cc, { x: q1[0], y: q1[1], z: q1[2] }, 5, 4);
    }
    b.torus(br * 0.55, 0.022 * S, baseCol, { x: bc[0], y: bc[1], z: bc[2], rx: Math.PI / 2 }, 3, 10);
  } });

P({ id: 'mol_lipid', name: 'Lipid', cat: 'molecule', tags: ['atom'], unit: 'atomic',
  fill: 0.15, variants: 3, weight: 8,
  build(b, r, v) {
    const S = 0.97111;
    // polar head
    b.sphere(0.26 * S, A.Ph, { y: 0.98 * S }, 8, 6);
    b.sphere(0.15 * S, A.N, { x: 0.2 * S, y: 1.2 * S }, 6, 5);
    for (let i = 0; i < 3; i++) {
      const a = i * TAU / 3;
      b.sphere(0.1 * S, A.O, { x: Math.cos(a) * 0.3 * S, y: 0.86 * S, z: Math.sin(a) * 0.3 * S }, 5, 4);
    }
    // glycerol linker
    b.sphere(0.14 * S, A.Cc, { y: 0.68 * S }, 6, 5);
    bond(b, [0, 0.86 * S, 0], [0, 0.6 * S, 0], 0.05 * S, A.bond);
    // two hydrocarbon tails
    for (const s of [-1, 1]) {
      let prev = [s * 0.1 * S, 0.6 * S, 0];
      for (let i = 0; i < 8; i++) {
        const t = i / 7;
        const kink = v === 1 && s < 0 && i > 3 ? 0.22 : 0;
        const p = [s * (0.1 + t * 0.26) * S + Math.sin(i * 1.7) * 0.05 * S,
          (0.56 - i * 0.082) * S,
          Math.sin(i * 1.2 + s) * 0.06 * S + kink * S * i * 0.1];
        bond(b, prev, p, 0.042 * S, A.bondLo, 4);
        b.sphere(0.1 * S, A.Cc, { x: p[0], y: p[1], z: p[2] }, 5, 4);
        prev = p;
      }
    }
  } });

P({ id: 'mol_basepair', name: 'DNA Base Pair', cat: 'molecule', tags: ['atom'], unit: 'atomic',
  fill: 0.2, variants: 2, weight: 8,
  build(b, r, v) {
    const S = 0.95998;
    const purCol = v ? A.Mg : A.glowM, pyrCol = v ? A.Ph : A.N;
    // purine: a fused six-five
    const pc = [-0.3 * S, -0.05 * S, 0];
    ringMol(b, pc[0], pc[1], 0, 0.2 * S, 6, 0.08 * S, 0.03 * S, [A.Cc, purCol], A.bond, 0.3);
    ringMol(b, pc[0] - 0.24 * S, pc[1], 0.1 * S, 0.14 * S, 5, 0.07 * S, 0.028 * S, [purCol, A.Cc], A.bond, 1.2);
    // pyrimidine: one six-ring
    const yc = [0.34 * S, 0.05 * S, 0.04 * S];
    ringMol(b, yc[0], yc[1], yc[2], 0.2 * S, 6, 0.08 * S, 0.03 * S, [A.Cc, pyrCol], A.bond, 0.8);
    // the hydrogen bonds that hold the two together
    for (let i = 0; i < (v ? 3 : 2); i++) {
      const dz = (i - 1) * 0.13 * S;
      hbond(b, [pc[0] + 0.22 * S, pc[1], dz], [yc[0] - 0.22 * S, yc[1], dz + 0.04 * S], 0.035 * S, A.hbond);
    }
    // The sugar-phosphate backbone, going UP and DOWN out of the pair rather
    // than further out sideways — this is a rung of a ladder, and the strands
    // it belongs to run vertically.
    for (const s of [-1, 1]) {
      const x = (s < 0 ? -0.62 : 0.58) * S, yy = s * -0.3 * S;
      ringMol(b, x, yy, 0.05 * S, 0.13 * S, 5, 0.06 * S, 0.026 * S, [A.O, A.Cc], A.bond, s);
      const px = x + s * 0.14 * S, py = yy + s * -0.22 * S;
      b.sphere(0.11 * S, A.Ph, { x: px, y: py, z: -0.06 * S }, 6, 5);
      for (let k = 0; k < 3; k++) {
        const a = k * TAU / 3 + s;
        b.sphere(0.07 * S, A.O,
          { x: px + Math.cos(a) * 0.15 * S, y: py + Math.sin(a) * 0.15 * S, z: -0.06 * S }, 5, 4);
      }
    }
  } });

P({ id: 'mol_atp', name: 'ATP', cat: 'molecule', tags: ['atom'], unit: 'atomic',
  fill: 0.18, variants: 2, weight: 7,
  build(b, r, v) {
    const S = 1.41044;
    // The triphosphate tail, climbing away from the sugar rather than lying
    // out flat — a rod-shaped prop's collision radius is half its LENGTH.
    let prev = null;
    for (let i = 0; i < 3; i++) {
      const p = [(-0.34 - i * 0.07) * S, (0.04 + i * 0.24) * S, (i % 2) * 0.07 * S];
      if (prev) bond(b, prev, p, 0.04 * S, A.bond);
      b.sphere(0.12 * S, A.Ph, { x: p[0], y: p[1], z: p[2] }, 7, 5);
      for (let k = 0; k < 3; k++) {
        const a = k * TAU / 3 + i;
        const o = [p[0] + Math.cos(a) * 0.16 * S, p[1] + Math.sin(a) * 0.1 * S, p[2] + Math.cos(a * 1.7) * 0.13 * S];
        bond(b, p, o, 0.026 * S, A.bondLo, 4);
        b.sphere(0.075 * S, i === 2 ? A.quark : A.O, { x: o[0], y: o[1], z: o[2] }, 5, 4);
      }
      prev = p;
    }
    // the high-energy bond, drawn as a spark
    if (v === 0) b.torus(0.15 * S, 0.02 * S, A.quark, { x: -0.44 * S, y: 0.4 * S, rx: Math.PI / 2, rz: 0.6 }, 3, 10);
    // ribose
    const rc = [0.02 * S, -0.06 * S, 0];
    const rp = ringMol(b, rc[0], rc[1], 0, 0.19 * S, 5, 0.085 * S, 0.032 * S, [A.O, A.Cc], A.bond, 0.6);
    bond(b, prev, rp[3], 0.034 * S, A.bond);
    // adenine, a fused pair of rings
    const ac = [0.44 * S, -0.02 * S, 0.02 * S];
    ringMol(b, ac[0], ac[1], ac[2], 0.2 * S, 6, 0.08 * S, 0.03 * S, [A.Cc, A.N], A.bond, 0.4);
    ringMol(b, ac[0] + 0.24 * S, ac[1] + 0.06 * S, ac[2] + 0.06 * S, 0.15 * S, 5, 0.07 * S, 0.028 * S, [A.N, A.Cc], A.bond, 1.5);
    bond(b, rp[0], [ac[0] - 0.18 * S, ac[1], ac[2]], 0.032 * S, A.bond);
  } });

P({ id: 'mol_peptide', name: 'Short Peptide', cat: 'organic', tags: ['atom'], unit: 'atomic',
  fill: 0.2, variants: 3, weight: 7,
  build(b, r, v) {
    const S = 1.47787;
    const sideCols = [A.S, A.O, A.N, A.Mg, A.glowM];
    // Four residues climbing away from the first, which is what a peptide
    // actually starts doing as soon as it is long enough to hydrogen-bond —
    // and it keeps the prop compact instead of laying it out as a rod.
    let prev = null;
    for (let i = 0; i < 4; i++) {
      const x = (-0.42 + i * 0.28) * S;
      const yb = (i * 0.22 - 0.22) * S;
      const zz = ((i % 2) - 0.5) * 0.18 * S;
      const n = [x, yb + 0.06 * S, zz];
      const ca = [x + 0.15 * S, yb - 0.04 * S, zz + 0.1 * S];
      const cc = [x + 0.3 * S, yb + 0.06 * S, zz];
      if (prev) bond(b, prev, n, 0.038 * S, A.bond);
      bond(b, n, ca, 0.04 * S, A.bond);
      bond(b, ca, cc, 0.04 * S, A.bond);
      b.sphere(0.1 * S, A.N, { x: n[0], y: n[1], z: n[2] }, 6, 5);
      b.sphere(0.1 * S, A.Cc, { x: ca[0], y: ca[1], z: ca[2] }, 6, 5);
      b.sphere(0.1 * S, A.Cc, { x: cc[0], y: cc[1], z: cc[2] }, 6, 5);
      // carbonyl oxygen
      const o = [cc[0] + 0.04 * S, cc[1] + 0.2 * S, cc[2] - 0.05 * S];
      bond2(b, cc, o, 0.026 * S, A.bondLo, 0.035 * S);
      b.sphere(0.085 * S, A.O, { x: o[0], y: o[1], z: o[2] }, 5, 4);
      // side chain, alternating above and below
      const dir = i % 2 ? -1 : 1;
      const sc = [ca[0], ca[1] - dir * 0.26 * S, ca[2] + dir * 0.1 * S];
      bond(b, ca, sc, 0.032 * S, A.bond);
      b.sphere(0.12 * S, sideCols[(i + v) % sideCols.length], { x: sc[0], y: sc[1], z: sc[2] }, 6, 5);
      prev = cc;
    }
  } });

/* ============================================================
   Carbon allotropes and cofactors  (1nm6Å50pm - 2nm8Å50pm)
   ============================================================ */

P({ id: 'mol_c60', name: 'Buckminsterfullerene', cat: 'crystal', tags: ['atom'], unit: 'atomic',
  fill: 0.42, variants: 2, weight: 6,
  build(b, r, v) {
    const S = 1.71609;
    const R = 0.44 * S;
    // three great circles read as a cage far more cheaply than 90 struts
    for (let k = 0; k < 3; k++) {
      b.torus(R, 0.018 * S, A.CcD, { rx: Math.PI / 2 + k * 1.05, rz: k * 0.7 }, 3, 14);
    }
    shellDots(b, R, 24, 0.062 * S, A.Cc, v * 0.5, 6, 4);
    // the hollow middle, hinted at
    b.sphere(R * 0.42, A.glowV, {}, 7, 5);
  } });

P({ id: 'mol_graphene', name: 'Graphene Flake', cat: 'crystal', tags: ['atom'], unit: 'atomic',
  fill: 0.16, variants: 3, weight: 6,
  build(b, r, v) {
    const S = 1.98466;
    // a rippled honeycomb patch: hex lattice points inside a radius
    const a = 0.26 * S;
    const pts = [];
    for (let i = -3; i <= 3; i++) {
      for (let j = -3; j <= 3; j++) {
        const x = (i + j * 0.5) * a, z = j * a * 0.866;
        if (Math.hypot(x, z) > a * 2.9) continue;
        // drop one of every three sites — that is what makes it a honeycomb
        if (((i - j) % 3 + 3) % 3 === 0) continue;
        pts.push([x, Math.sin(x * 2.6 / S + v) * 0.13 * S + Math.cos(z * 2.2 / S) * 0.1 * S, z]);
      }
    }
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        if (Math.hypot(pts[i][0] - pts[j][0], pts[i][2] - pts[j][2]) < a * 1.05) {
          bond(b, pts[i], pts[j], 0.028 * S, A.bondLo, 4);
        }
      }
    }
    for (const p of pts) b.sphere(0.062 * S, A.Cc, { x: p[0], y: p[1], z: p[2] }, 5, 4);
  } });

P({ id: 'mol_haem', name: 'Haem Group', cat: 'organic', tags: ['atom'], unit: 'atomic',
  fill: 0.2, variants: 2, weight: 6,
  build(b, r, v) {
    const S = 2.44337;
    const R = 0.34 * S;
    // porphyrin macrocycle
    b.torus(R, 0.035 * S, A.CcD, { rx: Math.PI / 2 }, 3, 16);
    for (let i = 0; i < 4; i++) {
      const a = i * TAU / 4 + 0.4;
      const cx = Math.cos(a) * R, cz = Math.sin(a) * R;
      ringMol(b, cx, 0, cz, 0.12 * S, 5, 0.05 * S, 0.022 * S, [A.N, A.Cc], A.bond, a);
      // the four nitrogens that hold the iron
      const nx = Math.cos(a) * R * 0.42, nz = Math.sin(a) * R * 0.42;
      b.sphere(0.07 * S, A.N, { x: nx, z: nz }, 6, 4);
      bond(b, [nx, 0, nz], [cx, 0, cz], 0.024 * S, A.bondLo, 4);
    }
    b.sphere(0.13 * S, A.Fe, {}, 8, 6);
    b.torus(0.19 * S, 0.016 * S, A.quark, { rx: Math.PI / 2 }, 3, 12);
    /* The axial ligand standing over the iron. It is what makes this a haem
       and not a dye — and it is also what stops the prop being a disc. A flat
       thing has to be very WIDE to reach a given pickup size (pickup is the
       cube root of w*h*d), and width is what the collision radius is taken
       from, so flat props turn into thickets you cannot get through. */
    bond(b, [0, 0, 0], [0, 0.34 * S, 0], 0.03 * S, A.bond);
    b.sphere(0.09 * S, A.N, { y: 0.34 * S }, 6, 5);
    ringMol(b, 0, 0.48 * S, 0, 0.13 * S, 5, 0.05 * S, 0.022 * S, [A.N, A.Cc], A.bond, 0.5);
    // the two propionate tails, tucked under the ring
    for (const s of [-1, 1]) {
      let prev = [s * R * 0.62, -0.04 * S, R * 0.6];
      for (let i = 0; i < 2; i++) {
        const p = [prev[0] + s * 0.07 * S, (-0.12 - i * 0.06) * S, prev[2] + 0.08 * S];
        bond(b, prev, p, 0.03 * S, A.bondLo, 4);
        b.sphere(0.06 * S, i === 1 ? A.O : A.Cc, { x: p[0], y: p[1], z: p[2] }, 5, 4);
        prev = p;
      }
    }
    if (v) for (let i = 0; i < 4; i++) {
      const a = i * TAU / 4 + 1.2;
      b.sphere(0.05 * S, A.Cc, { x: Math.cos(a) * R * 1.28, y: 0.02 * S, z: Math.sin(a) * R * 1.28 }, 5, 4);
    }
  } });

P({ id: 'mol_nanotube', name: 'Carbon Nanotube', cat: 'crystal', tags: ['atom'], unit: 'atomic',
  fill: 0.22, variants: 2, weight: 6,
  build(b, r, v) {
    const S = 2.74852;
    // A SHORT segment, deliberately. A long thin prop's collision radius is
    // half its LENGTH, so a 6nm tube is a 3nm obstacle disc; forty of them
    // across the outer band walled the stage off. Stubby and fat instead.
    const R = 0.36 * S, L = 1.0 * S;
    // the wall, drawn once and then dressed
    b.cyl(R * 0.92, R * 0.92, L, C.charcoal, { rz: Math.PI / 2 }, 8);
    const rings = 5;
    for (let i = 0; i < rings; i++) {
      const x = (-0.5 + i / (rings - 1)) * L;
      b.torus(R, 0.026 * S, A.Cc, { x, ry: Math.PI / 2, rx: 0 }, 3, 10);
      const off = (i % 2) * 0.5;
      for (let k = 0; k < 6; k++) {
        const a = (k + off) * TAU / 6 + v * 0.3;
        b.sphere(0.055 * S, A.Cc, { x, y: Math.cos(a) * R, z: Math.sin(a) * R }, 5, 4);
      }
    }
    for (let k = 0; k < 6; k++) {
      const a = k * TAU / 6;
      bond(b, [-L / 2, Math.cos(a) * R, Math.sin(a) * R], [L / 2, Math.cos(a) * R, Math.sin(a) * R], 0.02 * S, A.bondLo, 4);
    }
  } });

P({ id: 'mol_chlorophyll', name: 'Chlorophyll', cat: 'organic', tags: ['atom'], unit: 'atomic',
  fill: 0.2, variants: 2, weight: 6,
  build(b, r, v) {
    const S = 3.23847;
    const R = 0.3 * S;
    const cx = -0.2 * S;
    b.torus(R, 0.03 * S, A.Mg, { x: cx, rx: Math.PI / 2 }, 3, 16);
    for (let i = 0; i < 4; i++) {
      const a = i * TAU / 4 + 0.5;
      const px = cx + Math.cos(a) * R, pz = Math.sin(a) * R;
      ringMol(b, px, 0, pz, 0.1 * S, 5, 0.042 * S, 0.02 * S, [A.N, A.Cl], A.bond, a);
      b.sphere(0.055 * S, A.N, { x: cx + Math.cos(a) * R * 0.42, z: Math.sin(a) * R * 0.42 }, 5, 4);
    }
    b.sphere(0.1 * S, A.Mg, { x: cx }, 8, 6);
    b.torus(0.15 * S, 0.014 * S, A.spark, { x: cx, rx: Math.PI / 2 }, 3, 10);
    /* The phytol tail — most of the molecule by length, and it CURLS UP
       rather than running away sideways. Same reason as the haem's axial
       ligand: a molecule laid out flat has to be enormously wide to reach
       its pickup size, and its collision radius comes off that width. */
    let prev = [cx + R * 0.85, 0, R * 0.4];
    for (let i = 0; i < 9; i++) {
      const a = i * 0.78;
      const p = [cx + R * 0.85 + Math.sin(a) * 0.26 * S,
        (0.06 + i * 0.078) * S,
        R * 0.4 + (Math.cos(a) - 1) * 0.2 * S];
      bond(b, prev, p, 0.028 * S, A.bondLo, 4);
      b.sphere(0.055 * S, A.Cc, { x: p[0], y: p[1], z: p[2] }, 5, 4);
      if (v && i % 4 === 2) b.sphere(0.05 * S, A.Cc, { x: p[0] + 0.1 * S, y: p[1], z: p[2] }, 5, 4);
      prev = p;
    }
  } });

/* ============================================================
   Folded structures — the top of the ladder  (3nm3Å - 4nm8Å0pm)
   ============================================================ */

P({ id: 'mol_helix', name: 'Alpha Helix', cat: 'organic', tags: ['atom'], unit: 'atomic',
  fill: 0.24, variants: 3, weight: 5,
  build(b, r, v) {
    const S = 3.26807;
    const R = 0.27 * S, L = 1.62 * S, turns = 4.2;
    const n = 26;
    let prev = null;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const a = t * turns * TAU + v;
      const p = [Math.cos(a) * R, (t - 0.5) * L, Math.sin(a) * R];
      if (prev) bond(b, prev, p, 0.036 * S, A.ribbon, 5);
      b.sphere(0.058 * S, i % 3 === 0 ? A.O : A.Cc, { x: p[0], y: p[1], z: p[2] }, 5, 4);
      // side chains pointing outward
      if (i % 2 === 0) {
        b.sphere(0.05 * S, i % 4 === 0 ? A.N : A.S,
          { x: Math.cos(a) * R * 1.42, y: p[1], z: Math.sin(a) * R * 1.42 }, 5, 4);
      }
      prev = p;
    }
    // the hydrogen bonds down the axis that make it a helix
    for (let i = 0; i < 5; i++) {
      const y = (-0.4 + i * 0.2) * L;
      b.sphere(0.04 * S, A.hbond, { y }, 5, 4);
    }
  } });

P({ id: 'mol_protein', name: 'Small Protein', cat: 'organic', tags: ['atom'], unit: 'atomic',
  fill: 0.4, variants: 3, weight: 5,
  build(b, r, v) {
    const S = 4.33667;
    const R = 0.5 * S;
    // a folded globule: overlapping lobes, then structure laid over the top
    b.ellip(R * 0.72, R * 0.62, R * 0.68, A.coil, {}, 9, 6);
    for (let i = 0; i < 7; i++) {
      const a = i * GOLD, y = 1 - (2 * i + 1) / 7;
      const rad = Math.sqrt(Math.max(0, 1 - y * y));
      b.ellip(R * (0.3 + r() * 0.14), R * (0.26 + r() * 0.12), R * (0.3 + r() * 0.14),
        i % 2 ? A.coil : A.glowV,
        { x: Math.cos(a) * rad * R * 0.62, y: y * R * 0.6, z: Math.sin(a) * rad * R * 0.62 }, 8, 6);
    }
    // two short helices on the surface
    for (let k = 0; k < 2; k++) {
      const base = k * 2.4 + v;
      for (let i = 0; i < 9; i++) {
        const t = i / 8, a = t * 2.2 * TAU + base;
        b.sphere(0.05 * S, A.ribbon, {
          x: Math.cos(base) * R * 0.62 + Math.cos(a) * R * 0.16,
          y: (t - 0.5) * R * 0.8,
          z: Math.sin(base) * R * 0.62 + Math.sin(a) * R * 0.16,
        }, 5, 4);
      }
    }
    // and a beta strand
    for (let i = 0; i < 4; i++) {
      b.box(R * 0.4, R * 0.07, R * 0.16, A.sheet,
        { x: -R * 0.5 + i * R * 0.05, y: R * 0.5 - i * R * 0.1, z: R * 0.45, ry: 0.3, rz: -0.25 });
    }
  } });

P({ id: 'mol_domain', name: 'Protein Domain', cat: 'organic', tags: ['atom'], unit: 'atomic',
  fill: 0.38, variants: 2, weight: 4,
  build(b, r, v) {
    const S = 5.04990;
    const R = 0.5 * S;
    b.ellip(R * 0.66, R * 0.6, R * 0.72, A.coil, {}, 10, 7);
    for (let i = 0; i < 9; i++) {
      const a = i * GOLD + v, y = 1 - (2 * i + 1) / 9;
      const rad = Math.sqrt(Math.max(0, 1 - y * y));
      b.ellip(R * (0.28 + r() * 0.16), R * (0.24 + r() * 0.14), R * (0.28 + r() * 0.16),
        i % 3 === 0 ? A.glowV : A.coil,
        { x: Math.cos(a) * rad * R * 0.66, y: y * R * 0.62, z: Math.sin(a) * rad * R * 0.66 }, 8, 6);
    }
    // three helices, clearly readable at this size
    for (let k = 0; k < 3; k++) {
      const base = k * 2.1 + v * 0.6;
      for (let i = 0; i < 11; i++) {
        const t = i / 10, a = t * 2.6 * TAU + base;
        b.sphere(0.045 * S, A.ribbon, {
          x: Math.cos(base) * R * 0.66 + Math.cos(a) * R * 0.15,
          y: (t - 0.5) * R * 0.9 + (k - 1) * R * 0.12,
          z: Math.sin(base) * R * 0.66 + Math.sin(a) * R * 0.15,
        }, 5, 4);
      }
    }
    // a small beta sheet, three strands side by side
    for (let s = 0; s < 3; s++) {
      for (let i = 0; i < 3; i++) {
        b.box(R * 0.36, R * 0.06, R * 0.13, A.sheet,
          { x: -R * 0.36 + i * R * 0.32, y: -R * 0.3 + s * R * 0.02, z: -R * 0.5 - s * R * 0.17, ry: 0.16 });
      }
    }
    // an active-site cleft, marked with a bound ion
    b.sphere(0.07 * S, A.Fe, { x: R * 0.3, y: R * 0.42, z: R * 0.34 }, 6, 5);
    b.sphere(0.05 * S, A.quark, { x: R * 0.42, y: R * 0.4, z: R * 0.24 }, 5, 4);
    // a couple of ordered waters in the cleft, in a plain neutral
    for (let i = 0; i < 3; i++) {
      b.sphere(0.035 * S, C.lightgrey,
        { x: R * (0.2 + i * 0.12), y: R * (0.5 - i * 0.06), z: R * (0.44 - i * 0.1) }, 5, 4);
    }
  } });
