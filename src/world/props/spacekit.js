/* ============================================================
   SHAPES FOR THINGS IN SPACE.

   Reported by a player, and correct: *"the items at the world
   level and above degrade into random misshapen blobs and bear
   no relation to the thing they're describing. So as an example,
   a galaxy should not look like a blob. It should look like a
   galaxy. […] we want someone rolling over a black hole for it
   to look like a black hole and feel some sense of connection."*

   Rendered and counted before touching anything: twelve of the
   galaxy stage's twenty-eight archetypes were a cloud of randomly
   placed spheres, four more were a stack of flat lenses that
   reads as a shuttlecock, and every star was a sphere with dark
   patches stuck on it.

   ⚠ AND THAT WAS NOT LAZINESS. Read the three notes it came from,
   because each one is a real bug that a naive "just draw it
   properly" rewrite walks straight back into:

     - A HOLLOW SHELL IS A TRAP. A katamari rolled inside a
       hypernova shell at 300ly across and sat there pinned for
       the last five minutes of the round; `balance` counted 698
       stalls.
     - A HORSESHOE IS A BAY. An arc that wraps past 180 degrees
       lets a small ball in and will not let a grown one out. The
       resolver pushed it off one chunk into the next in a
       three-cycle that netted zero. One run in five died that way.
     - A FLAT ANNULUS FENCES OFF THE MAP. Collision radius is
       `max(w, d) / 2` off the bounding box while pickup size is
       the cube root of it, so a wide thin ring reads as a
       mouthful and behaves as a wall.

   All three are collision problems, and all three are answered by
   the same one-word change: `{ ghost: true }` (see `push()` in
   render/geom.js). A ghost primitive is drawn and is invisible to
   the obstacle test, the radial profile, `dims`, `radius`,
   `pickup` and `volume`. A ghost shell traps nothing, a ghost
   horseshoe has no bay, a ghost annulus fences nothing.

   ⚠ SO THE RULE FOR EVERY PROP IN THESE THREE STAGES IS:

       THE SOLID PART IS A COMPACT CORE.
       EVERYTHING THAT GIVES IT ITS IDENTITY IS GHOST.

   A black hole is a small black sphere you bump into, wearing a
   thin bright ring, a flat disc and two jets that you do not.

   ⚠ AND THE COROLLARY, WHICH COSTS A STAGE IF IT IS MISSED:
   shrinking the solid part shrinks `pickup` and `volume` too, so
   every prop that gains ghost geometry must have its `sizeMul`
   and `fill` re-derived to put both numbers back where they were.
   `node tools/reghost.mjs` does that arithmetic and prints the
   values; `node tools/catalogue-digest.mjs` proves they landed.

   ------------------------------------------------------------
   THE VOCABULARY

   Everything here is ghost unless its name says otherwise, and
   everything takes its segment counts from a shared budget so the
   whole catalogue can be made cheaper in one place if a phone
   asks for it. The triangle ceiling for this work is 2x the old
   cost, agreed with the player, and `npm run tricost` is the
   check.
   ============================================================ */

const TAU = Math.PI * 2;

/**
 * Detail level. 1 is the shipping value; `quality.js` drops it on phones.
 * Read at BUILD time, so changing it needs a catalogue rebuild — which is
 * what the Options toggle does.
 */
export const LOD = { seg: 1 };

const S = (n) => Math.max(3, Math.round(n * LOD.seg));

/* ------------------------------------------------------------------
   FLAT THINGS — the shapes that were previously impossible
   ------------------------------------------------------------------ */

/**
 * A thin annular SLAB in the XZ plane: inner radius `r0`, outer `r1`.
 *
 * ⚠ THIS USED TO BE A ZERO-THICKNESS PLANE AND THE BLACK HOLE WAS INVISIBLE
 * FROM TWO ANGLES OUT OF THREE. Rendered the contact sheet and looked at it:
 * `g_blackhole` — the one prop the player asked for by name — was a plain
 * black ball with a stick through it in two of `propsheet`'s three views, and
 * showed its disc only in the one that happened to look down on it.
 *
 * Two causes, and a single-surface lathe has both. The scene runs ONE
 * `MeshLambertMaterial` with `side: THREE.FrontSide` (Scene.js:31) — the flat
 * poster look depends on it — so a one-sided ribbon simply is not there when
 * you are under it. And a plane of zero thickness is zero pixels edge-on,
 * which is exactly where a camera a few thousand light years up sits relative
 * to a disc tilted 0.34 rad.
 *
 * So the profile is now a CLOSED loop — bottom, outer rim, top, inner rim —
 * which is what a thin disc physically is. It is visible from either side
 * because it has both, and it reads as a bright line rather than vanishing
 * when the camera drops into its plane.
 *
 * COST, measured rather than guessed: four quads per segment instead of one,
 * which is **+283k triangles across the galaxy stage** (2,291k -> 2,574k).
 * Only four archetypes use it, and the bill is almost all instance count
 * rather than the black hole itself — g_binary +360 x 227, g_protostar
 * +360 x 202, g_planetary +576 x 153, and g_blackhole, the reason for the
 * change, only +624 x 66 = 40k. Against the 2x ceiling of 3,216k that leaves
 * 642k, and the nine props still to rebuild are 293k today, so they can grow
 * 3.19x collectively. Affordable. If it ever stops being affordable, `LOD.seg`
 * scales every segment count from one place.
 *
 * `t` is the half-thickness, defaulting to 1.2% of the outer radius.
 */
export function annulus(b, r0, r1, col, o = {}, seg = 24) {
  const y = o.y ?? 0;
  const t = o.t ?? r1 * 0.012;
  b.lathe([[r0, -t], [r1, -t], [r1, t], [r0, t], [r0, -t]],
    col, { ...o, y, ghost: true }, S(seg));
  return b;
}

/**
 * A graded disc: `n` nested annuli from `r0` to `r1`, colour walked along
 * `cols`. This is what a galaxy, an accretion disc and a ring system are.
 *
 * `warp` tilts each ring a little more than the last, which is what stops a
 * stack of concentric rings reading as a dartboard.
 */
export function gradedDisc(b, r0, r1, cols, o = {}, n = 4, seg = 24) {
  const y = o.y ?? 0;
  const warp = o.warp ?? 0;
  for (let i = 0; i < n; i++) {
    const a = r0 + ((r1 - r0) * i) / n;
    const c = r0 + ((r1 - r0) * (i + 1)) / n;
    annulus(b, a, c, cols[Math.min(cols.length - 1, i)], {
      ...o, y: y + (o.rise ?? 0) * (i / n), rx: (o.rx ?? 0) + warp * (i / n),
    }, seg);
  }
  return b;
}

/**
 * A logarithmic spiral arm: `n` elements from the centre outwards, each one
 * smaller and each one turned to lie along the curve.
 *
 * ⚠ `n` WANTS TO BE AT LEAST TWELVE. The old version placed four, and four
 * lumps on a curve reads as four lumps. The elements are cheap — a 6x4
 * ellipsoid is 48 triangles — so the arm is affordable at the density that
 * actually reads as an arm.
 */
export function spiralArm(b, r0, r1, a0, sweep, col, o = {}, n = 14) {
  const y = o.y ?? 0;
  const w = o.w ?? 0.1;                  // element width as a fraction of r1
  const h = o.h ?? 0.5;                  // element height as a fraction of width
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const a = a0 + sweep * t;
    const d = r0 + (r1 - r0) * Math.pow(t, 0.78);
    const s = r1 * w * (1 - t * 0.55);
    b.ellip(s * 2.1, s * h, s * 0.72, Array.isArray(col) ? col[i % col.length] : col, {
      x: Math.cos(a) * d, y, z: Math.sin(a) * d, ry: -a + Math.PI / 2, ghost: true,
    }, S(6), S(4));
  }
  return b;
}

/**
 * A hollow expanding shell — a supernova remnant, a wind bubble, a wall of gas.
 *
 * A lathe of a thin arc, so it is a real surface with a real cavity, which is
 * the thing that reads as "this blew up". Ghost, and that is the whole reason
 * it can exist: solid, this is the shape that pinned a katamari for five
 * minutes.
 *
 * `open` leaves the top `open` fraction of the sphere off, so you can see into
 * it — a closed shell from outside is just a sphere again.
 */
export function shell(b, R, col, o = {}, seg = 20) {
  const y = o.y ?? R;
  const th = R * (o.th ?? 0.06);
  const open = o.open ?? 0.25;
  const n = S(9);
  const prof = [];
  const a0 = Math.PI * 0.5 * open;               // start below the pole
  for (let i = 0; i <= n; i++) {
    const a = a0 + (Math.PI - a0 * 2) * (i / n);
    prof.push([Math.sin(a) * (R - th), -Math.cos(a) * (R - th)]);
  }
  for (let i = n; i >= 0; i--) {
    const a = a0 + (Math.PI - a0 * 2) * (i / n);
    prof.push([Math.sin(a) * R, -Math.cos(a) * R]);
  }
  b.lathe(prof, col, { ...o, y, ghost: true }, S(seg));
  return b;
}

/**
 * A collimated jet: a long narrow beam that stays narrow, with knots along it
 * and a lobe where it stops.
 *
 * ⚠ NOT A CONE. The old jets were cones with a base a third of their length,
 * which renders as an ice-cream cone and reads as one. A real jet's whole
 * visual signature is that it is absurdly thin for how long it is — so the
 * beam is `len / 40` across, and the shape comes from the knots and the
 * terminal lobe instead of from a flare.
 */
export function jet(b, y0, len, col, o = {}) {
  const up = o.up ?? 1;
  const r = len * (o.r ?? 0.025);
  const knots = o.knots ?? 3;
  const hot = o.hot ?? col;
  b.cyl(r * 0.6, r, len, col, { y: y0 + up * len * 0.5, ghost: true }, S(7));
  for (let i = 1; i <= knots; i++) {
    const t = i / (knots + 1);
    b.sphere(r * (1.9 - t * 0.6), hot, { y: y0 + up * len * t, ghost: true }, S(6), S(4));
  }
  if (o.lobe) {
    b.ellip(len * o.lobe, len * o.lobe * 0.66, len * o.lobe, hot,
      { y: y0 + up * len * 1.02, ghost: true }, S(7), S(5));
  }
  return b;
}

/**
 * A corona: short tapered spikes all over a sphere of radius R.
 *
 * This is what makes a star read as a star rather than a billiard ball, and it
 * is the one place where "many small things" is the right answer. Fourteen
 * spikes at 4 segments is 112 triangles.
 */
export function corona(b, R, col, o = {}, n = 14) {
  const y = o.y ?? R;
  const len = R * (o.len ?? 0.45);
  const w = R * (o.w ?? 0.045);
  for (let i = 0; i < n; i++) {
    // Fibonacci sphere, so the spikes are even rather than clumped.
    const t = (i + 0.5) / n;
    const ph = Math.acos(1 - 2 * t);
    const th = Math.PI * (1 + Math.sqrt(5)) * i;
    const dx = Math.sin(ph) * Math.cos(th), dy = Math.cos(ph), dz = Math.sin(ph) * Math.sin(th);
    b.cone(w, len, col, {
      x: dx * (R + len * 0.4), y: y + dy * (R + len * 0.4), z: dz * (R + len * 0.4),
      rx: Math.atan2(Math.hypot(dx, dz), dy) * (dz >= 0 ? 1 : 1),
      rz: -Math.atan2(dx, dy),
      ghost: true,
    }, S(4));
  }
  return b;
}

/**
 * A prominence: an arc of material standing off the limb. Two or three of
 * these turn a sphere into something with weather.
 */
export function prominence(b, R, col, a, size = 0.3, o = {}) {
  const y = o.y ?? R;
  const rr = R * size;
  b.torus(rr, rr * (o.tube ?? 0.055), col, {
    x: Math.cos(a) * R * 0.94, y: y + (o.lift ?? 0.35) * R, z: Math.sin(a) * R * 0.94,
    ry: -a, rx: o.tilt ?? 1.1, ghost: true,
  }, S(4), S(9));
  return b;
}

/**
 * Many small points filling an ellipsoid, crowded toward the middle by `bias`.
 * A star cluster, a swarm of galaxies, a field of debris.
 *
 * ⚠ SMALL AND MANY, NOT BIG AND FEW. The old `puff()` used blobs 18-32% of the
 * container's radius, which is why a globular cluster read as a bag of
 * marbles: at that size you count them. At 4-7% you read the shape they make.
 */
export function swarm(b, RX, RY, RZ, n, cols, rnd, o = {}) {
  const yc = o.y ?? RY;
  const m = Math.min(RX, RY, RZ);
  const lo = (o.lo ?? 0.04) * m, hi = (o.hi ?? 0.08) * m;
  const bias = o.bias ?? 1.8;
  const flat = o.flat ?? 1;
  const solid = o.solid ?? false;
  for (let i = 0; i < n; i++) {
    const rr = lo + rnd() * (hi - lo);
    const u = rnd() * 2 - 1, ph = rnd() * TAU, s = Math.sqrt(1 - u * u);
    const t = Math.pow(rnd(), bias);
    b.sphere(rr, cols[(rnd() * cols.length) | 0], {
      x: Math.cos(ph) * s * t * (RX - rr),
      y: yc + u * t * (RY - rr) * flat,
      z: Math.sin(ph) * s * t * (RZ - rr),
      ghost: !solid,
    }, S(4), S(3));
  }
  return b;
}

/**
 * Wispy material: flattened, elongated shards laid along a heading, at varied
 * angles. Dust, gas, a tidal stream, an arm fragment.
 *
 * A cloud IS amorphous, so this stays blobby on purpose — but it is blobby in
 * a DIRECTION, which is the difference between a nebula and a bag of balls.
 *
 * ⚠ PASS `solid: true` FOR AN ACTUAL CLOUD. Ghosting exists for shapes that are
 * FLAT or HOLLOW — a disc fences the map, a shell is a cage. A cloud is neither:
 * it is a lumpy solid, it was always safe as one, and its wisps ARE its body.
 * Ghosting them forces a `core()` in to carry the mass, and at the size that
 * takes, the core is an opaque egg two thirds the width of the prop that hides
 * the very wisps it was standing in for. Looked at it; that is what it does.
 */
export function wisps(b, RX, RY, RZ, n, cols, rnd, o = {}) {
  const yc = o.y ?? RY;
  const head = o.head ?? 0;
  const spread = o.spread ?? 0.5;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const along = (t * 2 - 1);
    const off = (rnd() - 0.5) * spread;
    const a = head + (rnd() - 0.5) * 0.6;
    const L = RX * (0.3 + rnd() * 0.3);
    b.ellip(L, RY * (0.22 + rnd() * 0.3), RZ * (0.1 + rnd() * 0.1),
      cols[(rnd() * cols.length) | 0], {
        x: Math.cos(head) * along * (RX - L) + Math.cos(head + Math.PI / 2) * off * RX,
        y: yc + (rnd() - 0.5) * RY * 0.7,
        z: Math.sin(head) * along * (RZ - L) + Math.sin(head + Math.PI / 2) * off * RZ,
        ry: -a, rz: (rnd() - 0.5) * 0.4, ghost: !(o.solid ?? false),
      }, S(6), S(4));
  }
  return b;
}

/**
 * Pillars of gas with lit tips — the shape everybody recognises from a star
 * nursery. Tall, tapered, leaning slightly outward, brightest at the top.
 */
export function pillars(b, R, H, n, dark, lit, rnd, o = {}) {
  const yc = o.y ?? 0;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + rnd() * 0.5;
    const d = R * (0.18 + rnd() * 0.5);
    const h = H * (0.55 + rnd() * 0.45);
    const w = R * (0.1 + rnd() * 0.07);
    b.cyl(w * 0.35, w, h, dark, {
      x: Math.cos(a) * d, y: yc + h * 0.5, z: Math.sin(a) * d,
      rz: -Math.cos(a) * 0.16, rx: Math.sin(a) * 0.16, ghost: true,
    }, S(6));
    b.sphere(w * 0.5, lit, {
      x: Math.cos(a) * d * 1.04, y: yc + h * 1.0, z: Math.sin(a) * d * 1.04, ghost: true,
    }, S(5), S(4));
  }
  return b;
}

/** A thin bright ring — a photon ring, a shock front, a lensed arc. */
export function ring(b, R, col, o = {}, seg = 22) {
  const tube = R * (o.tube ?? 0.045);
  b.torus(R, tube, col, { ...o, y: o.y ?? 0, ghost: true }, S(5), S(seg));
  return b;
}

export { TAU };

/**
 * The solid body of a decorated prop.
 *
 * ⚠ EVERY PROP WHOSE WHOLE SHAPE IS GHOST NEEDS ONE OF THESE, and finding that
 * out is what `tools/reghost.mjs` is for. Move a cluster's stars, a nebula's
 * shell or a black hole's disc into decoration and the game is left measuring
 * whatever solid scrap remains — for the supernova remnant that was a 8-unit
 * core standing for an 85-unit object, so `pickup` fell 90% and `volume` fell
 * 99.9%. The whole galaxy stage would have become a bag of free sweets.
 *
 * The fix is not `sizeMul` arithmetic, it is an honest body: a compact
 * ellipsoid standing for the bulk of the thing, inset inside the decoration
 * that overhangs it. At `k = 0.75` of the authored half-extents the box is
 * 0.42 of the original, so `pickup` needs `sizeMul` 1.33 and `volume` needs
 * `fill` 2.4x — both of which `reghost` prints exactly.
 *
 * Colour it as the object's dense middle. It is not hidden: for a cluster it
 * IS the unresolved glow in the core, for a nebula the thick gas. Give it
 * `dim` to sit it further inside where the decoration is opaque enough to
 * cover it.
 */
export function core(b, RX, RY, RZ, col, o = {}) {
  const k = o.k ?? 0.75;
  b.ellip(RX * k, RY * k, RZ * k, col, { y: o.y ?? RY, ...o }, S(o.seg ?? 9), S(o.hseg ?? 7));
  return b;
}
