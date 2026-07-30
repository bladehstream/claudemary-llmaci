/* ============================================================
   The Quantum Realm — the catalogue for the first stage, the one
   below the atom.

   ONE WORLD UNIT = ONE FEMTOMETRE, with attometres under it, so
   `unit: 'femto'` on every entry is what makes the collection log
   print 0.05 as 50am and 1.6 as 1fm600am instead of two bare
   numbers. NOTHING in the simulation knows that: the geometry
   lives in exactly the same numeric band the house's metres do —
   see the note above TIERS in util/math.js for why authoring in
   true metres breaks the physics rather than the readout.

   THE SIZES ARE ORDERED, NOT TO SCALE, and down here that is not
   a compromise, it is the only option. A photon has no size, a
   quark has no measured size at all, and a lead nucleus is only
   four proton-widths across — there is no honest scale on which
   those form a ladder. So the ORDER is honest (a neutrino is
   smaller than an electron is smaller than a proton is smaller
   than a nucleus) and the SPACING is play: each archetype is
   about 1.17x the one below it, comfortably inside the 1.55x jump
   the balance tool calls a gap.

   Every build is written as multiples of a single `S`, which IS
   the archetype's pickup size, because `pickup` is cbrt(w*h*d) and
   scaling a whole build scales it linearly. One dial per prop
   makes retuning a rung a one-line edit rather than a geometry
   rewrite; the odd five-decimal values are back-solved, because
   the build decides the shape and the measurement decides the dial.

   THREE RULES RUN THROUGH ALL OF THIS, all three costly to learn
   late:

     1. `radius` is half the longest HORIZONTAL span while `pickup`
        is the cube root of the box, so anything laid out flat and
        wide fences the map off while reading as small. Every field
        excitation that would naturally sprawl — the flux tube, the
        string, the interference fringe, the wavefunction lobe — is
        stood UP or wound round the vertical instead. It costs
        nothing and it keeps `radius` near half of `pickup`, which
        is what a sphere gets.
     2. A LONE PARTICLE IS A BALL. `fill` is honest, and a sphere
        only reaches 0.52 of its own bounding box, so the ball
        props keep every hoop, blip and charge marker inside 0.52 S
        of the centre. Let a halo stand out at 0.6 S and the box
        grows 15% in each axis, which costs a third of the fill and
        therefore a third of the growth the thing is worth.
     3. Segment counts are mean on purpose (5-9, never above 12 on
        a hoop). There are well over a thousand of these on screen
        and most of them are three pixels across.
   ============================================================ */

import { defineProp } from './index.js';
import { C } from '../../render/palette.js';

const P = defineProp;
const U = 'femto';
const TAU = Math.PI * 2;
/** Golden angle — spreads n points evenly over a sphere without a table. */
const GOLD = 2.399963229728653;

/* ------------------------------------------------------------
   Local palette.

   A dark, luminous stage: everything is lit by itself against a
   near-black vacuum, so nothing here is allowed anywhere near the
   bottom of the value range. The three colour charges get literal
   red / green / blue, which is the one place in this game where
   the physics hands over a palette for free.

   Deliberately NOT added to palette.js: nothing outside this stage
   wants "colour charge blue", and the shared set is shared.
   ------------------------------------------------------------ */
const Q = {
  cyan:    0x5ceeff,   // electric cyan — leptons, charge
  cyanHi:  0xcafbff,
  magenta: 0xff4fd6,
  magHi:   0xffa6ec,
  violet:  0x9a5cff,
  violetD: 0x53309c,   // the dim half of a superposition
  acid:    0xd8ff45,   // acid yellow
  amber:   0xffb43c,
  hot:     0xfff4d6,   // white-hot cores
  rose:    0xff6d90,
  teal:    0x3ff0c4,
  lime:    0x8dff86,
  ice:     0xc4e6ff,
  foam:    0x7b62e0,
  deep:    0x2a1550,   // the inside of a bubble

  // colour charge
  cR: 0xff4d5e,
  cG: 0x62ff8a,
  cB: 0x5aa8ff,
};

/* ------------------------------------------------------------
   Drawing helpers
   ------------------------------------------------------------ */

/**
 * A tube running from p to q, both [x,y,z].
 *
 * `applyOpts` builds its quaternion from an Euler in 'YXZ' order, so with rz
 * left at zero the cylinder's +Y axis lands on
 *   ( sin(rx)sin(ry), cos(rx), sin(rx)cos(ry) )
 * which inverts to rx = acos(dy/len), ry = atan2(dx, dz).
 */
function tube(b, p, q, r, col, seg = 5) {
  const dx = q[0] - p[0], dy = q[1] - p[1], dz = q[2] - p[2];
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-9) return;
  b.cyl(r, r, len, col, {
    x: (p[0] + q[0]) / 2, y: (p[1] + q[1]) / 2, z: (p[2] + q[2]) / 2,
    rx: Math.acos(Math.max(-1, Math.min(1, dy / len))),
    ry: Math.atan2(dx, dz),
  }, seg);
}

/** n beads strung along the line p -> q — a dashed / virtual connection. */
function dash(b, p, q, n, r, col, seg = 5) {
  for (let i = 1; i <= n; i++) {
    const t = i / (n + 1);
    b.sphere(r, col, {
      x: p[0] + (q[0] - p[0]) * t,
      y: p[1] + (q[1] - p[1]) * t,
      z: p[2] + (q[2] - p[2]) * t,
    }, seg, 4);
  }
}

/** A thin hoop. Lean on purpose: 3 x 12 is 72 triangles and still reads round. */
function ring(b, R, t, col, opts, tubSeg = 12) {
  return b.torus(R, t, col, opts, 3, tubSeg);
}

/** n dots spread evenly over a sphere of radius R — glow shells, clouds. */
function shellDots(b, R, n, dr, col, phase, seg = 5, hseg = 4) {
  for (let i = 0; i < n; i++) {
    const y = 1 - (2 * i + 1) / n;
    const rad = Math.sqrt(Math.max(0, 1 - y * y));
    const a = i * GOLD + phase;
    b.sphere(dr, col, { x: Math.cos(a) * rad * R, y: y * R, z: Math.sin(a) * rad * R }, seg, hseg);
  }
}

/**
 * A helix of tube segments about the +Y axis.
 *
 * Everything here that would naturally be a long horizontal filament — a flux
 * tube, a decay track, an entanglement thread — is wound round Y instead. A
 * filament laid out flat has a collision radius of half its LENGTH and a pickup
 * size of the cube root of a very thin box: the exact recipe for a prop that
 * fences off the map while reading as a crumb.
 */
function helix(b, R, y0, y1, turns, n, r, col, phase, seg = 5) {
  let prev = null;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const a = phase + t * turns * TAU;
    const p = [Math.cos(a) * R, y0 + (y1 - y0) * t, Math.sin(a) * R];
    if (prev) tube(b, prev, p, r, col, seg);
    prev = p;
  }
  return prev;
}

/**
 * A + or - marker floating just clear of a particle's surface.
 *
 * Both bars share one colour on purpose. Two crossed boxes have a face in
 * common, and two DIFFERENT-coloured faces in one plane z-fight across their
 * whole overlap — see tools/test-coplanar. Same colour, invisible either way.
 */
function charge(b, S, sign, col) {
  b.box(0.3 * S, 0.055 * S, 0.055 * S, col, { y: 0.5 * S });
  if (sign > 0) b.box(0.055 * S, 0.3 * S, 0.055 * S, col, { y: 0.5 * S });
}

/**
 * A lone particle: a ball with grazing hoops and a few surface blips.
 *
 * Nothing reaches past 0.52 S. See rule 2 at the top — this is the shape that
 * lets `fill` be a real 0.46 rather than a hopeful one, and it is also what a
 * particle looks like in every diagram anybody has ever drawn.
 */
function ball(b, S, coreCol, haloCol, hoops, phase) {
  b.sphere(0.5 * S, coreCol, {}, 9, 6);
  for (let k = 0; k < hoops; k++) {
    ring(b, 0.5 * S, 0.02 * S, k ? haloCol : Q.cyanHi,
      { rx: Math.PI / 2 + k * 1.05 + phase * 0.4, rz: k * 0.8 + phase * 0.3 }, 12);
  }
  for (let i = 0; i < 3; i++) {
    const a = i * TAU / 3 + phase;
    b.sphere(0.05 * S, haloCol,
      { x: Math.cos(a) * 0.47 * S, y: Math.sin(a * 1.7) * 0.34 * S, z: Math.sin(a) * 0.47 * S }, 6, 4);
  }
}

/** Three colour-charged quarks riding the surface of a nucleon, plus their flux. */
function triplet(b, S, cols, phase) {
  const pts = [];
  for (let i = 0; i < 3; i++) {
    const a = i * TAU / 3 + phase;
    pts.push([Math.cos(a) * 0.46 * S, Math.sin(a * 2) * 0.3 * S, Math.sin(a) * 0.46 * S]);
  }
  for (let i = 0; i < 3; i++) {
    tube(b, [pts[i][0] * 0.55, pts[i][1] * 0.55, pts[i][2] * 0.55],
      [pts[(i + 1) % 3][0] * 0.55, pts[(i + 1) % 3][1] * 0.55, pts[(i + 1) % 3][2] * 0.55],
      0.028 * S, Q.hot, 5);
  }
  for (let i = 0; i < 3; i++) {
    b.sphere(0.055 * S, cols[i], { x: pts[i][0], y: pts[i][1], z: pts[i][2] }, 6, 4);
  }
}

/* ============================================================
   The vacuum  (15am - 27am)

   The bottom four rungs are smaller than the katamari is on its
   first frame, and that is the point: the opening of this stage is
   a fizz of things you cannot help but collect.
   ============================================================ */

P({ id: 'q_fluct', name: 'Quantum Fluctuation', cat: 'vacuum', tags: ['quantum'], unit: U,
  fill: 0.14, variants: 4, weight: 12,
  build(b, r, v) {
    const S = 0.01642;
    // A bubble of borrowed energy: a dim interior with a bright rim.
    b.sphere(0.3 * S, Q.deep, {}, 7, 5);
    ring(b, 0.44 * S, 0.035 * S, v % 2 ? Q.violet : Q.foam,
      { rx: Math.PI / 2 + v * 0.5, rz: v * 0.4 }, 10);
    for (let i = 0; i < 3; i++) {
      const a = i * TAU / 3 + v;
      b.sphere(0.09 * S, Q.cyanHi,
        { x: Math.cos(a) * 0.3 * S, y: (i - 1) * 0.4 * S, z: Math.sin(a) * 0.3 * S }, 5, 4);
    }
  } });

P({ id: 'q_vpair', name: 'Virtual Pair', cat: 'vacuum', tags: ['quantum'], unit: U,
  fill: 0.12, variants: 4, weight: 12,
  build(b, r, v) {
    const S = 0.02228;
    // Particle and antiparticle, on loan, already flying apart.
    const p = [-0.3 * S, -0.26 * S, -0.1 * S], q = [0.3 * S, 0.26 * S, 0.1 * S];
    dash(b, p, q, 3, 0.05 * S, Q.violet);
    b.sphere(0.2 * S, Q.cyan, { x: p[0], y: p[1], z: p[2] }, 7, 5);
    b.sphere(0.2 * S, Q.magenta, { x: q[0], y: q[1], z: q[2] }, 7, 5);
    ring(b, 0.32 * S, 0.02 * S, Q.foam, { rx: Math.PI / 2 + v * 0.6, rz: 0.5 }, 10);
  } });

P({ id: 'q_photon', name: 'Photon', cat: 'field', tags: ['quantum'], unit: U,
  fill: 0.1, variants: 4, weight: 12,
  build(b, r, v) {
    const S = 0.03130;
    /* A stretched glowing wisp — a wavelength and a half of light, drawn as a
       wave rather than a line so it has thickness in every axis. Short on
       purpose: a wisp four times its own pickup size long would be a fence at
       any bigger rung. This one is 22am, so it is a mote. */
    const L = 1.25 * S, A = 0.3 * S;
    const n = 9;
    let prev = null;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const ph = t * TAU * 1.5 + v * 0.7;
      const p = [(t - 0.5) * L, Math.sin(ph) * A, Math.cos(ph) * A * 0.5];
      if (prev) tube(b, prev, p, 0.055 * S, i % 2 ? Q.cyanHi : Q.hot, 5);
      prev = p;
    }
    b.sphere(0.1 * S, Q.hot, {}, 6, 5);
    for (const s of [-1, 1]) b.sphere(0.07 * S, Q.acid, { x: s * L * 0.5 }, 5, 4);
  } });

P({ id: 'q_neutrino', name: 'Neutrino', cat: 'lepton', tags: ['quantum'], unit: U,
  fill: 0.12, variants: 3, weight: 11,
  build(b, r, v) {
    const S = 0.03533;
    /* Barely there, and going. A pale dart with a fading wake — three flavours,
       which is what the variants are for. */
    const col = [Q.ice, Q.teal, Q.lime][v % 3];
    b.ellip(0.16 * S, 0.16 * S, 0.4 * S, col, { rx: 0.3, ry: v * 0.8 }, 8, 5);
    let prev = [0, 0, -0.32 * S];
    for (let i = 0; i < 4; i++) {
      const t = (i + 1) / 4;
      const p = [Math.sin(t * 3 + v) * 0.14 * S, (t - 0.2) * 0.36 * S, -0.32 * S - t * 0.5 * S];
      tube(b, prev, p, 0.03 * S * (1 - t * 0.6), col, 5);
      prev = p;
    }
    b.sphere(0.07 * S, Q.hot, { z: 0.3 * S }, 5, 4);
  } });

/* ============================================================
   Leptons and spin  (32am - 46am)
   ============================================================ */

P({ id: 'q_spin', name: 'Spin', cat: 'property', tags: ['quantum'], unit: U,
  fill: 0.14, variants: 3, weight: 11,
  build(b, r, v) {
    const S = 0.03873;
    /* Angular momentum with nothing spinning: an axis, a circulation, an
       arrowhead. Up or down, which is the whole joke. */
    const up = v % 2 === 0 ? 1 : -1;
    b.cyl(0.035 * S, 0.035 * S, 0.86 * S, Q.cyanHi, {}, 6);
    b.cone(0.11 * S, 0.22 * S, Q.acid, { y: up * 0.4 * S, rz: up > 0 ? 0 : Math.PI }, 7);
    b.sphere(0.17 * S, Q.violet, {}, 8, 6);
    ring(b, 0.36 * S, 0.028 * S, Q.magenta, { rx: Math.PI / 2 }, 12);
    for (let i = 0; i < 3; i++) {
      const a = i * TAU / 3 + v;
      b.sphere(0.055 * S, Q.magHi,
        { x: Math.cos(a) * 0.36 * S, y: 0.06 * S * up, z: Math.sin(a) * 0.36 * S }, 5, 4);
    }
  } });

P({ id: 'q_electron', name: 'Electron', cat: 'lepton', tags: ['quantum'], unit: U,
  fill: 0.46, variants: 4, weight: 11,
  build(b, r, v) {
    const S = 0.03736;
    ball(b, S, Q.cyan, Q.cyanHi, 2, v * 0.6);
    charge(b, S, -1, Q.ice);
  } });

P({ id: 'q_positron', name: 'Positron', cat: 'lepton', tags: ['quantum'], unit: U,
  fill: 0.46, variants: 4, weight: 10,
  build(b, r, v) {
    const S = 0.04239;
    ball(b, S, Q.magenta, Q.magHi, 2, v * 0.7 + 0.4);
    charge(b, S, 1, Q.hot);
  } });

/* ============================================================
   Quarks  (53am - 85am)

   Four flavours, four flavour colours, and every one of them
   carrying a red / green / blue charge — this is the one stage
   where "colour" is free content.
   ============================================================ */

/** A quark: flavour-coloured ball, three charge spots, a confinement hoop. */
function quark(b, S, flavour, mark, phase) {
  b.sphere(0.5 * S, flavour, {}, 9, 6);
  const cc = [Q.cR, Q.cG, Q.cB];
  for (let i = 0; i < 3; i++) {
    const a = i * TAU / 3 + phase;
    b.sphere(0.075 * S, cc[i],
      { x: Math.cos(a) * 0.45 * S, y: Math.cos(a * 2) * 0.3 * S, z: Math.sin(a) * 0.45 * S }, 6, 4);
  }
  ring(b, 0.5 * S, 0.018 * S, Q.hot, { rx: Math.PI / 2 + phase * 0.3, rz: 0.4 }, 12);
  // flavour tally: one blip for up/down, two for strange, three for charm
  for (let i = 0; i < mark; i++) {
    b.sphere(0.045 * S, flavour, { x: (i - (mark - 1) / 2) * 0.13 * S, y: 0.5 * S }, 5, 4);
  }
}

P({ id: 'q_quark_up', name: 'Up Quark', cat: 'quark', tags: ['quantum'], unit: U,
  fill: 0.46, variants: 3, weight: 10,
  build(b, r, v) { quark(b, 0.05109, Q.acid, 1, v * 0.8); } });

P({ id: 'q_quark_down', name: 'Down Quark', cat: 'quark', tags: ['quantum'], unit: U,
  fill: 0.46, variants: 3, weight: 10,
  build(b, r, v) { quark(b, 0.06022, Q.cyan, 1, v * 0.8 + 1.1); } });

P({ id: 'q_quark_strange', name: 'Strange Quark', cat: 'quark', tags: ['quantum'], unit: U,
  fill: 0.46, variants: 3, weight: 9,
  build(b, r, v) { quark(b, 0.07052, Q.violet, 2, v * 0.8 + 2.2); } });

P({ id: 'q_quark_charm', name: 'Charm Quark', cat: 'quark', tags: ['quantum'], unit: U,
  fill: 0.46, variants: 3, weight: 8,
  build(b, r, v) { quark(b, 0.08227, Q.rose, 3, v * 0.8 + 3.3); } });

/* ============================================================
   Field excitations  (99am - 219am)
   ============================================================ */

P({ id: 'q_gluon', name: 'Gluon', cat: 'field', tags: ['quantum'], unit: U,
  fill: 0.13, variants: 4, weight: 9,
  build(b, r, v) {
    const S = 0.13002;
    /* A twisted flux tube: two colour strands wound about each other. Wound
       round the VERTICAL axis, so the thing that is physically a long string is
       geometrically a stubby column — see `helix`. */
    const R = 0.24 * S;
    const cc = [[Q.cR, Q.cG], [Q.cG, Q.cB], [Q.cB, Q.cR], [Q.cR, Q.cB]][v];
    for (let k = 0; k < 2; k++) {
      helix(b, R, -0.44 * S, 0.44 * S, 1.6, 9, 0.055 * S, cc[k], k * Math.PI + v * 0.4, 5);
    }
    for (const s of [-1, 1]) {
      b.sphere(0.11 * S, Q.hot, { y: s * 0.46 * S }, 6, 5);
      ring(b, 0.3 * S, 0.02 * S, Q.acid, { y: s * 0.34 * S, rx: Math.PI / 2 }, 10);
    }
  } });

P({ id: 'q_fringe', name: 'Interference Fringe', cat: 'field', tags: ['quantum'], unit: U,
  fill: 0.1, variants: 4, weight: 9,
  build(b, r, v) {
    const S = 0.11625;
    /* Bright and dark bands, drawn as concentric UPRIGHT hoops rather than
       painted rings. Upright is what saves it: laid flat, this would be a wide
       thin disc — a collision radius of half its width and a pickup size of
       nearly nothing, which is a fence. Standing, it is as tall as it is wide. */
    for (let k = 0; k < 4; k++) {
      const R = (0.14 + k * 0.11) * S;
      ring(b, R, 0.028 * S, k % 2 ? Q.violetD : Q.cyan,
        { z: (k % 2 ? 0.1 : -0.1) * S, ry: v * 0.3 }, 12);
    }
    b.sphere(0.09 * S, Q.hot, {}, 6, 5);
    for (const s of [-1, 1]) {
      b.sphere(0.06 * S, Q.cyanHi, { x: s * 0.47 * S, y: 0.06 * S }, 5, 4);
      b.sphere(0.06 * S, Q.magHi, { y: s * 0.47 * S, z: 0.08 * S }, 5, 4);
    }
  } });

P({ id: 'q_lobe', name: 'Wavefunction Lobe', cat: 'field', tags: ['quantum'], unit: U,
  fill: 0.15, variants: 3, weight: 9,
  build(b, r, v) {
    const S = 0.15070;
    /* One p-orbital: two lobes of opposite phase with a node between them. Tall
       and slim, which makes it the safest shape in the file — a collision radius
       of a third of its pickup size. */
    for (const s of [-1, 1]) {
      b.ellip(0.26 * S, 0.46 * S, 0.26 * S, s > 0 ? Q.cyan : Q.magenta, { y: s * 0.48 * S }, 9, 6);
      b.sphere(0.09 * S, Q.hot, { y: s * 0.86 * S }, 6, 5);
    }
    ring(b, 0.28 * S, 0.03 * S, Q.violet, { rx: Math.PI / 2 }, 12);
    if (v) ring(b, 0.19 * S, 0.02 * S, Q.foam, { rx: Math.PI / 2, y: v * 0.16 * S }, 10);
  } });

P({ id: 'q_foam', name: 'Planck Foam', cat: 'vacuum', tags: ['quantum'], unit: U,
  fill: 0.34, variants: 4, weight: 8,
  build(b, r, v) {
    const S = 0.16816;
    /* A nugget of spacetime at the scale where it stops being smooth: a huddle
       of bubbles, no two the same size, with some of the struts between them
       drawn in. */
    const pts = [];
    for (let i = 0; i < 9; i++) {
      const y = 1 - (2 * i + 1) / 9;
      const rad = Math.sqrt(Math.max(0, 1 - y * y));
      const a = i * GOLD + v;
      pts.push([Math.cos(a) * rad * 0.3 * S, y * 0.3 * S, Math.sin(a) * rad * 0.3 * S]);
    }
    for (let i = 0; i < pts.length; i++) {
      const rr = (0.14 + ((i * 7 + v) % 5) * 0.026) * S;
      b.sphere(rr, i % 3 === 0 ? Q.foam : (i % 3 === 1 ? Q.violetD : Q.violet),
        { x: pts[i][0], y: pts[i][1], z: pts[i][2] }, 7, 5);
    }
    for (let i = 0; i < pts.length; i += 2) {
      tube(b, pts[i], pts[(i + 3) % pts.length], 0.022 * S, Q.cyanHi, 5);
    }
  } });

P({ id: 'q_string', name: 'Vibrating String', cat: 'field', tags: ['quantum'], unit: U,
  fill: 0.1, variants: 4, weight: 8,
  build(b, r, v) {
    const S = 0.25770;
    /* A closed loop with a standing wave on it, hung in a mostly UPRIGHT plane.
       The wobble is the harmonic: variant 0 is the second mode, the rest are
       overtones. */
    const n = 14, mode = 2 + v;
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      const R = 0.42 * S * (1 + 0.2 * Math.sin(mode * a + v));
      pts.push([Math.cos(a) * R, Math.sin(a) * R * 0.94, Math.sin(a * 2) * 0.12 * S]);
    }
    for (let i = 0; i < n; i++) {
      tube(b, pts[i], pts[(i + 1) % n], 0.035 * S, i % 2 ? Q.acid : Q.amber, 5);
    }
    for (let i = 0; i < n; i += 3) {
      b.sphere(0.06 * S, Q.hot, { x: pts[i][0], y: pts[i][1], z: pts[i][2] }, 5, 4);
    }
  } });

P({ id: 'q_muon', name: 'Muon', cat: 'lepton', tags: ['quantum'], unit: U,
  fill: 0.42, variants: 3, weight: 8,
  build(b, r, v) {
    const S = 0.20787;
    // A heavy electron, and a short-lived one: the corkscrew is its decay track.
    ball(b, S, Q.violet, Q.magHi, 2, v * 0.5);
    charge(b, S, -1, Q.ice);
    helix(b, 0.14 * S, -0.5 * S, -0.16 * S, 1.1, 7, 0.026 * S, Q.teal, v, 5);
  } });

P({ id: 'q_pion', name: 'Pion', cat: 'meson', tags: ['quantum'], unit: U,
  fill: 0.2, variants: 3, weight: 8,
  build(b, r, v) {
    const S = 0.24285;
    /* The lightest meson: a quark and an antiquark on a short leash inside a
       confinement shell drawn as two crossed hoops. A peanut, not a ball — which
       is what the honest 0.2 fill is about. */
    const p = [-0.19 * S, -0.15 * S, 0.05 * S], q = [0.19 * S, 0.15 * S, -0.05 * S];
    tube(b, p, q, 0.05 * S, Q.hot, 6);
    b.sphere(0.3 * S, Q.acid, { x: p[0], y: p[1], z: p[2] }, 8, 6);
    b.sphere(0.3 * S, Q.violet, { x: q[0], y: q[1], z: q[2] }, 8, 6);
    for (let k = 0; k < 2; k++) {
      ring(b, 0.5 * S, 0.024 * S, k ? Q.cyan : Q.cyanHi,
        { rx: Math.PI / 2 + k * 1.1 + v * 0.3, rz: k * 0.7 }, 12);
    }
    if (v === 2) charge(b, S, -1, Q.ice);
  } });

/* ============================================================
   Bosons  (297am - 555am)
   ============================================================ */

P({ id: 'q_wboson', name: 'W Boson', cat: 'boson', tags: ['quantum'], unit: U,
  fill: 0.42, variants: 3, weight: 7,
  build(b, r, v) {
    const S = 0.27070;
    /* The heavy charged one. The two arms are the decay it is about to become,
       angled UP and inward rather than laid out sideways. */
    b.sphere(0.48 * S, Q.amber, {}, 9, 6);
    ring(b, 0.5 * S, 0.04 * S, Q.hot, { rx: Math.PI / 2 + v * 0.2 }, 12);
    for (const s of [-1, 1]) {
      const tip = [s * 0.28 * S, 0.44 * S, s * 0.1 * S];
      tube(b, [s * 0.14 * S, 0.2 * S, 0], tip, 0.035 * S, Q.acid, 5);
      b.sphere(0.075 * S, s > 0 ? Q.cyan : Q.magenta, { x: tip[0], y: tip[1], z: tip[2] }, 6, 5);
    }
    charge(b, S, v % 2 ? 1 : -1, Q.hot);
    shellDots(b, 0.5 * S, 5, 0.04 * S, Q.magHi, v);
  } });

P({ id: 'q_zboson', name: 'Z Boson', cat: 'boson', tags: ['quantum'], unit: U,
  fill: 0.42, variants: 3, weight: 7,
  build(b, r, v) {
    const S = 0.32475;
    // Heavier and neutral: two bands, four stubs, no charge marker.
    b.sphere(0.48 * S, Q.rose, {}, 9, 6);
    for (let k = 0; k < 2; k++) {
      ring(b, 0.5 * S, 0.035 * S, k ? Q.magenta : Q.hot,
        { rx: Math.PI / 2 + k * 1.2 + v * 0.2, rz: k * 0.6 }, 12);
    }
    for (let i = 0; i < 4; i++) {
      const a = i * TAU / 4 + v * 0.5;
      const up = i % 2 ? 0.42 : -0.42;
      const tip = [Math.cos(a) * 0.24 * S, up * S, Math.sin(a) * 0.24 * S];
      tube(b, [Math.cos(a) * 0.1 * S, up * 0.4 * S, Math.sin(a) * 0.1 * S], tip, 0.03 * S, Q.violet, 5);
      b.sphere(0.07 * S, Q.cyanHi, { x: tip[0], y: tip[1], z: tip[2] }, 6, 4);
    }
  } });

P({ id: 'q_kaon', name: 'Kaon', cat: 'meson', tags: ['quantum'], unit: U,
  fill: 0.2, variants: 3, weight: 7,
  build(b, r, v) {
    const S = 0.38960;
    /* A strange meson, and the one that oscillates into its own antiparticle —
       hence the second, ghostlier copy of the pair inside the same shell. */
    const p = [-0.2 * S, -0.16 * S, 0.05 * S], q = [0.2 * S, 0.16 * S, -0.05 * S];
    tube(b, p, q, 0.05 * S, Q.hot, 6);
    b.sphere(0.28 * S, Q.violet, { x: p[0], y: p[1], z: p[2] }, 8, 6);
    b.sphere(0.25 * S, Q.acid, { x: q[0], y: q[1], z: q[2] }, 8, 6);
    // the mixed state, offset and dimmed
    b.sphere(0.16 * S, Q.violetD, { x: -q[0] * 0.7, y: -q[1] * 0.7 + 0.1 * S, z: 0.18 * S }, 7, 5);
    b.sphere(0.14 * S, Q.violetD, { x: -p[0] * 0.7, y: -p[1] * 0.7 + 0.1 * S, z: -0.18 * S }, 7, 5);
    for (let k = 0; k < 3; k++) {
      ring(b, 0.5 * S, 0.022 * S, k === 1 ? Q.teal : Q.cyanHi,
        { rx: Math.PI / 2 + k * 0.9 + v * 0.3, rz: k * 0.6 }, 12);
    }
  } });

P({ id: 'q_vertex', name: 'Feynman Vertex', cat: 'diagram', tags: ['quantum'], unit: U,
  fill: 0.11, variants: 4, weight: 7,
  build(b, r, v) {
    const S = 0.65899;
    /* Three arms and a junction: two fermion lines coming in with arrowheads,
       one wavy boson line leaving upward. Drawn with real vertical extent — a
       three-armed junction lying flat is a caltrop. */
    const node = [0, -0.12 * S, 0];
    b.sphere(0.1 * S, Q.hot, { x: node[0], y: node[1], z: node[2] }, 7, 5);
    const arms = [[-0.4, -0.36, 0.14], [0.4, -0.36, -0.14]];
    for (let i = 0; i < 2; i++) {
      const a = arms[i];
      const tip = [a[0] * S, a[1] * S, a[2] * S];
      tube(b, node, tip, 0.04 * S, i ? Q.cyan : Q.magenta, 6);
      // an arrowhead pointing along the line, which is what makes it a fermion
      const dx = tip[0] - node[0], dy = tip[1] - node[1], dz = tip[2] - node[2];
      const len = Math.hypot(dx, dy, dz);
      b.cone(0.09 * S, 0.2 * S, i ? Q.cyanHi : Q.magHi, {
        x: node[0] + dx * 0.62, y: node[1] + dy * 0.62, z: node[2] + dz * 0.62,
        rx: Math.acos(dy / len) + Math.PI, ry: Math.atan2(dx, dz),
      }, 7);
    }
    // the boson line: a squiggle climbing away from the junction
    let prev = node;
    for (let i = 1; i <= 6; i++) {
      const t = i / 6;
      const p = [Math.sin(t * TAU * 1.2 + v) * 0.16 * S, node[1] + t * 0.78 * S,
        Math.cos(t * 3 + v) * 0.12 * S];
      tube(b, prev, p, 0.035 * S, i % 2 ? Q.acid : Q.amber, 5);
      prev = p;
    }
    b.sphere(0.085 * S, Q.acid, { x: prev[0], y: prev[1], z: prev[2] }, 6, 5);
  } });

P({ id: 'q_higgs', name: 'Higgs Boson', cat: 'boson', tags: ['quantum'], unit: U,
  fill: 0.26, variants: 3, weight: 6,
  build(b, r, v) {
    const S = 0.52003;
    /* The one that gives everything else its mass, sitting in the brim of its
       own potential. The brim is a pair of hoops rather than a plate: a Mexican
       hat drawn to scale is a wide flat disc, and wide flat discs fence. */
    b.sphere(0.44 * S, Q.hot, {}, 9, 6);
    shellDots(b, 0.48 * S, 8, 0.045 * S, Q.acid, v * 0.7);
    ring(b, 0.5 * S, 0.04 * S, Q.amber, { rx: Math.PI / 2, y: -0.24 * S }, 12);
    ring(b, 0.34 * S, 0.03 * S, Q.rose, { rx: Math.PI / 2, y: -0.4 * S }, 12);
    // the vacuum expectation value, standing straight up out of the middle
    b.cyl(0.04 * S, 0.04 * S, 0.24 * S, Q.cyanHi, { y: 0.4 * S }, 6);
    b.sphere(0.08 * S, Q.cyan, { y: 0.5 * S }, 6, 5);
  } });

/* ============================================================
   Compounds and correlations  (650am - 1fm40am)
   ============================================================ */

P({ id: 'q_mesonpair', name: 'Meson Pair', cat: 'meson', tags: ['quantum'], unit: U,
  fill: 0.22, variants: 3, weight: 6,
  build(b, r, v) {
    const S = 0.64220;
    /* Two mesons flying apart, with the flux tube between them stretched to the
       point where it snaps and makes two more. */
    const cols = [[Q.acid, Q.violet], [Q.teal, Q.rose], [Q.cyan, Q.amber]][v];
    for (let s = 0; s < 2; s++) {
      const sx = s ? 1 : -1;
      const cx = sx * 0.22 * S, cy = sx * 0.2 * S, cz = -sx * 0.1 * S;
      b.sphere(0.26 * S, cols[s], { x: cx, y: cy, z: cz }, 8, 6);
      b.sphere(0.1 * S, Q.hot, { x: cx - sx * 0.2 * S, y: cy + 0.16 * S, z: cz }, 6, 5);
      ring(b, 0.28 * S, 0.022 * S, Q.cyanHi,
        { x: cx, y: cy, z: cz, rx: Math.PI / 2, rz: sx * 0.5 }, 12);
    }
    helix(b, 0.09 * S, -0.18 * S, 0.18 * S, 1.4, 9, 0.03 * S, Q.hot, v, 5);
    for (let k = 0; k < 2; k++) {
      ring(b, 0.5 * S, 0.02 * S, Q.foam, { rx: Math.PI / 2 + k * 1.2, rz: k * 0.7 }, 12);
    }
  } });

P({ id: 'q_entangled', name: 'Entangled Pair', cat: 'correlation', tags: ['quantum'], unit: U,
  fill: 0.16, variants: 4, weight: 6,
  build(b, r, v) {
    const S = 0.78009;
    /* Two particles and one state. The thread runs DIAGONALLY between them, not
       level: a bright bar strung horizontally at its own mid-height is the
       girder-through-the-ball defect, and it does not stop being one just
       because the prop is small. */
    const p = [-0.3 * S, -0.34 * S, -0.12 * S], q = [0.3 * S, 0.34 * S, 0.12 * S];
    const n = 9;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const a = t * TAU * 1.6 + v;
      b.sphere(0.035 * S, i % 2 ? Q.cyanHi : Q.magHi, {
        x: p[0] + (q[0] - p[0]) * t + Math.cos(a) * 0.06 * S,
        y: p[1] + (q[1] - p[1]) * t,
        z: p[2] + (q[2] - p[2]) * t + Math.sin(a) * 0.06 * S,
      }, 5, 4);
    }
    const cols = [[Q.cyan, Q.magenta], [Q.teal, Q.rose]][v % 2];
    for (let s = 0; s < 2; s++) {
      const c = s ? q : p;
      b.sphere(0.2 * S, cols[s], { x: c[0], y: c[1], z: c[2] }, 8, 6);
      ring(b, 0.26 * S, 0.022 * S, s ? Q.magHi : Q.cyanHi,
        { x: c[0], y: c[1], z: c[2], rx: Math.PI / 2 + s * 0.9, rz: s * 0.5 }, 12);
    }
  } });

P({ id: 'q_cloud', name: 'Probability Cloud', cat: 'field', tags: ['quantum'], unit: U,
  fill: 0.12, variants: 4, weight: 6,
  build(b, r, v) {
    const S = 1.09919;
    /* Where a particle is, honestly answered. Denser in the middle because the
       radial distribution is, and the dots shrink as they go out so the edge
       fades rather than stopping. */
    const n = 26;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const rad = Math.pow(t, 0.62) * 0.48 * S;
      const y = 1 - (2 * i + 1) / n;
      const ry = Math.sqrt(Math.max(0, 1 - y * y));
      const a = i * GOLD + v;
      b.sphere((0.09 - t * 0.05) * S, i % 3 === 0 ? Q.cyan : (i % 3 === 1 ? Q.violet : Q.foam), {
        x: Math.cos(a) * ry * rad, y: y * rad * 1.05, z: Math.sin(a) * ry * rad,
      }, 6, 4);
    }
    b.sphere(0.1 * S, Q.hot, {}, 7, 5);
    ring(b, 0.34 * S, 0.02 * S, Q.cyanHi, { rx: Math.PI / 2 + v * 0.4, rz: 0.4 }, 12);
  } });

P({ id: 'q_superpos', name: 'Superposition', cat: 'correlation', tags: ['quantum'], unit: U,
  fill: 0.22, variants: 3, weight: 5,
  build(b, r, v) {
    const S = 1.09089;
    /* The same object twice, offset, one of them dimmed almost into the
       background — which is the only way to draw "both, until you look" with an
       opaque vertex-coloured material and no transparency budget. */
    const spinTop = (dx, dz, dy, body, trim, rim) => {
      b.cone(0.2 * S, 0.44 * S, body, { x: dx, y: dy + 0.06 * S, z: dz, rz: Math.PI }, 8);
      b.sphere(0.17 * S, trim, { x: dx, y: dy + 0.32 * S, z: dz }, 8, 6);
      ring(b, 0.26 * S, 0.026 * S, rim, { x: dx, y: dy + 0.3 * S, z: dz, rx: Math.PI / 2 }, 12);
      b.cyl(0.03 * S, 0.03 * S, 0.28 * S, rim, { x: dx, y: dy + 0.5 * S, z: dz }, 6);
    };
    spinTop(-0.16 * S, -0.12 * S, -0.2 * S, Q.violetD, Q.foam, Q.violetD);
    spinTop(0.16 * S, 0.12 * S, -0.06 * S, Q.violet, Q.cyan, Q.cyanHi);
    // the interference between the two branches
    for (let i = 0; i < 5; i++) {
      const t = i / 4;
      b.sphere(0.045 * S, Q.magHi, {
        x: (-0.16 + t * 0.32) * S,
        y: (0.56 + Math.sin(t * Math.PI) * 0.14) * S,
        z: (-0.12 + t * 0.24) * S,
      }, 5, 4);
    }
    if (v) ring(b, 0.42 * S, 0.02 * S, Q.foam, { rx: Math.PI / 2, y: -0.34 * S }, 12);
  } });

/* ============================================================
   Matter  (1fm217am - 2fm281am)

   The top of the ladder, and the point of the stage: you finish
   able to swallow a proton.
   ============================================================ */

P({ id: 'q_proton', name: 'Proton', cat: 'nucleon', tags: ['quantum'], unit: U,
  fill: 0.44, variants: 3, weight: 5,
  build(b, r, v) {
    const S = 1.12220;
    b.sphere(0.5 * S, Q.rose, {}, 9, 6);
    triplet(b, S, [Q.cR, Q.cG, Q.cB], v * 0.9);
    for (let k = 0; k < 2; k++) {
      ring(b, 0.5 * S, 0.024 * S, k ? Q.magHi : Q.hot,
        { rx: Math.PI / 2 + k * 1.15 + v * 0.3, rz: k * 0.7 }, 12);
    }
    charge(b, S, 1, Q.hot);
  } });

P({ id: 'q_neutron', name: 'Neutron', cat: 'nucleon', tags: ['quantum'], unit: U,
  fill: 0.44, variants: 3, weight: 5,
  build(b, r, v) {
    const S = 1.37200;
    b.sphere(0.5 * S, Q.ice, {}, 9, 6);
    triplet(b, S, [Q.cB, Q.cG, Q.cB], v * 1.1 + 0.5);
    ring(b, 0.5 * S, 0.024 * S, Q.cyanHi, { rx: Math.PI / 2 + v * 0.3 }, 12);
    // no charge to mark, so: the beta decay it is quietly heading for
    helix(b, 0.12 * S, 0.3 * S, 0.5 * S, 0.9, 6, 0.024 * S, Q.acid, v, 5);
  } });

P({ id: 'q_nucleonpair', name: 'Nucleon Pair', cat: 'nucleus', tags: ['quantum'], unit: U,
  fill: 0.22, variants: 3, weight: 4,
  build(b, r, v) {
    const S = 1.58300;
    /* A deuteron: one proton, one neutron, held together by the pion they keep
       throwing at each other. */
    for (let s = 0; s < 2; s++) {
      const sx = s ? 1 : -1;
      const c = [sx * 0.17 * S, sx * 0.14 * S, -sx * 0.06 * S];
      b.sphere(0.32 * S, s ? Q.ice : Q.rose, { x: c[0], y: c[1], z: c[2] }, 9, 6);
      for (let i = 0; i < 3; i++) {
        const a = i * TAU / 3 + v + s;
        b.sphere(0.06 * S, [Q.cR, Q.cG, Q.cB][s ? (i + 1) % 3 : i], {
          x: c[0] + Math.cos(a) * 0.3 * S, y: c[1] + Math.sin(a * 2) * 0.2 * S,
          z: c[2] + Math.sin(a) * 0.3 * S,
        }, 6, 4);
      }
    }
    // the exchanged pion, caught mid-flight between them
    b.sphere(0.1 * S, Q.acid, { y: 0.02 * S, z: 0.2 * S }, 6, 5);
    for (let k = 0; k < 2; k++) {
      ring(b, 0.5 * S, 0.026 * S, k ? Q.hot : Q.foam,
        { rx: Math.PI / 2 + k * 1.1 + v * 0.2, rz: k * 0.6 }, 12);
    }
  } });

P({ id: 'q_alpha', name: 'Alpha Cluster', cat: 'nucleus', tags: ['quantum'], unit: U,
  fill: 0.27, variants: 3, weight: 4,
  build(b, r, v) {
    const S = 1.79567;
    /* Two protons, two neutrons, in the tetrahedron they actually sit in — the
       most tightly bound thing in this part of the universe. */
    const k = 0.13 * S, rr = 0.3 * S;
    const verts = [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]];
    for (let i = 0; i < 4; i++) {
      for (let j = i + 1; j < 4; j++) {
        tube(b, [verts[i][0] * k, verts[i][1] * k, verts[i][2] * k],
          [verts[j][0] * k, verts[j][1] * k, verts[j][2] * k], 0.03 * S, Q.hot, 5);
      }
    }
    for (let i = 0; i < 4; i++) {
      const p = verts[(i + v) % 4];
      const proton = i < 2;
      b.sphere(rr, proton ? Q.rose : Q.ice, { x: p[0] * k, y: p[1] * k, z: p[2] * k }, 9, 6);
      b.sphere(0.07 * S, proton ? Q.cR : Q.cB,
        { x: p[0] * k * 2.0, y: p[1] * k * 2.0, z: p[2] * k * 2.0 }, 6, 4);
    }
    for (let m = 0; m < 2; m++) {
      ring(b, 0.5 * S, 0.024 * S, m ? Q.cyanHi : Q.magHi,
        { rx: Math.PI / 2 + m * 1.2 + v * 0.2, rz: m * 0.7 }, 12);
    }
    charge(b, S, 1, Q.hot);
  } });

P({ id: 'q_nucleus', name: 'Nucleus', cat: 'nucleus', tags: ['quantum'], unit: U,
  fill: 0.22, variants: 3, weight: 3,
  build(b, r, v) {
    const S = 2.19955;
    /* A whole nucleus, and the biggest thing down here: eleven nucleons in a
       drop with a closed shell drawn round them. A drop rather than a lattice
       because a nucleus genuinely is one, and because eleven spheres is already
       most of this prop's triangle budget. */
    const n = 11;
    for (let i = 0; i < n; i++) {
      const y = 1 - (2 * i + 1) / n;
      const rad = Math.sqrt(Math.max(0, 1 - y * y));
      const a = i * GOLD + v * 0.8;
      const R = i === 0 ? 0 : 0.28 * S;
      b.sphere(0.19 * S, i % 2 ? Q.rose : Q.ice,
        { x: Math.cos(a) * rad * R, y: y * R, z: Math.sin(a) * rad * R }, 8, 6);
    }
    shellDots(b, 0.46 * S, 7, 0.045 * S, Q.cR, v);
    for (let m = 0; m < 3; m++) {
      ring(b, 0.5 * S, 0.022 * S, m === 1 ? Q.magHi : Q.cyanHi,
        { rx: Math.PI / 2 + m * 0.85 + v * 0.2, rz: m * 0.6 }, 12);
    }
    // a couple of loose neutrons out in the skin, in a plain neutral
    for (let i = 0; i < 3; i++) {
      const a = i * TAU / 3 + v;
      b.sphere(0.06 * S, C.lightgrey,
        { x: Math.cos(a) * 0.46 * S, y: 0.28 * S, z: Math.sin(a) * 0.46 * S }, 6, 4);
    }
  } });
