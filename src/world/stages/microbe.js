/* ============================================================
   Stage 2 — The Culture.  50nm  ->  1µm6,  five and a half
   minutes.

   A petri dish somebody forgot about. You start as a virus
   particle on the open agar, work up through the organelles and
   the bacteria, and finish big enough to swallow an amoeba.

   The plate has three raised growths on it — a phage plaque in
   the south-west, a two-tier colony mound in the east and a
   satellite colony in the north — each with a ramp, each holding
   the bigger organisms. A film of mucus sits in the south-east;
   only things that actually live in water get placed in it. The
   north-west corner is taken up by the wall of a host cell so
   much larger than the plate's residents that it reads as
   scenery, which is exactly what it is.
   ============================================================ */

/* GROUND LAYERS — TWO CONSTRAINTS, NOT ONE.

   1. No two big flat horizontal faces may share a Y, or they z-fight across
      their whole overlap. That is the rule the city stage documents, and it is
      the only one this block originally respected.

   2. A decal must also sit FAR BELOW THE STARTING BALL'S RADIUS, or it saws the
      katamari in half. This one was missed, and it is the more visible failure
      of the two. The film was at 0.030 with a ball that starts at 0.05 diameter
      — a radius of 0.025 — so at stage start the mucus plane passed straight
      through the middle of the ball and, because the camera orbits at ball
      height, filled the entire screen edge-on with the katamari hidden behind
      it. Reported as "features clipping / not layered correctly", and it was.

   The house has always had this right and is the reference: its plank lines sit
   at +0.003 and its tatami mats at +0.002 on the same 0.05 starting ball, i.e.
   under 1/8 of the starting radius. Anything at or below that reads as paint on
   the floor. Anything approaching the radius reads as a wall.

   So: gaps of ~0.0015, which is 6% of the starting radius and still hundreds of
   depth-buffer steps at a camera distance of 6.2 radii. Big DECK heights below
   are a different thing entirely — those are meant to be steps you climb. */
const Y_AGAR     = 0;        // the plate
const Y_RING     = 0.0015;   // growth rings (tori, not flat, but keep them clear)
const Y_FILM     = 0.0030;   // mucus film
const Y_FILM_IN  = 0.0045;   // its wetter middle
const Y_STREAK   = 0.0060;   // inoculation streaks
/* A deck's height decides when it opens: the katamari may WALK AT a step of
   height h from a diameter of about 1.74h, but paying for the rise out of
   forward speed takes 2h, and in between it just shoulders the cliff. Keep the
   steps low enough that the in-between is short, and give every deck a ramp
   across most of its face so the cliff is rarely what you meet. */
const Y_PLAQUE   = 0.20;    // phage plaque deck        (opens ~400nm)
const Y_PLAQUE_S = 0.2030;  // its skin, 3mm-equivalent above the deck
const Y_HOST     = 0.26;    // giant host cell's cytoplasm (scenery)
const Y_SAT      = 0.30;    // satellite colony deck    (opens ~600nm)
const Y_SAT_S    = 0.3030;  // its skin
const Y_SHELF    = 0.42;    // colony mound, lower tier (opens ~840nm)
const Y_SHELF_S  = 0.4230;  // its skin
const Y_CROWN    = 0.70;    // colony mound, upper tier (opens ~1µm400)
const Y_CROWN_S  = 0.7030;  // its skin

/**
 * Paint offset for anything drawn ON a surface rather than standing on it: the
 * colony halos below. Relative, because the same helper paints the crown's halo
 * onto the shelf, 0.42 up. Well under the ~0.0113 that would start to saw into
 * the starting ball, and still hundreds of depth-buffer steps at this camera.
 */
const Y_HALO = 0.0075;

/** Plate colours. Warm, washed out, nothing saturated. */
const A = {
  agar:      0xf1e4b2,
  agarWarm:  0xe6d596,
  agarDark:  0xd6c07c,
  rim:       0xe9e2cf,
  rimDark:   0xcfc6ae,
  film:      0xbfe3d6,
  filmDeep:  0x9ed2c6,
  streak:    0xdfe9b0,
  plaque:    0xf7f0d2,
  plaqueTop: 0xfbf6e2,
  colony:    0xb9dc8c,
  colonyTop: 0xcfe9a8,
  colonyD:   0x8fbd68,
  crown:     0xe7b7c2,
  crownTop:  0xf3cdd5,
  satellite: 0xf0cf8e,
  satTop:    0xf8e2b0,
  membrane:  0xf2a4b4,
  membraneD: 0xcd7183,
  cyto:      0xf8ddd8,
  nucleus:   0x8d6bc6,
  nucleusD:  0x63469b,
  organelle: 0xee8a72,
};

export const microbeStage = {
  id: 'microbe',
  name: 'The Culture',
  subtitle: 'Something is growing in here.',
  brief: 'A forgotten petri dish. Start on the open agar as a single virus particle, ' +
    'among the loose proteins and the capsids. The plaque and the colonies are steps ' +
    'up — take the ramps once you are large enough — and the wet film in the corner ' +
    'is the only place the swimmers live. Everything on this plate eats everything else.',
  /**
   * DISPLAY UNITS ONLY. One world unit means one nanometre / micrometre /
   * kilometre depending on the stage; the physics never learns this. See the
   * note above TIERS in util/math.js for why authoring in true metres breaks.
   */
  unit: 'micron',
  seed: 18831211,
  startSize: 0.05,
  goal: 1.6,
  time: 330,
  speed: 0.42,
  /**
   * Clutter dial. Multiplies every `scatter` count and every hand-written
   * placement loop in this stage's build. 1 = as authored.
   *
   * DENSITY IS NOT A "MORE OF THE SAME" DIAL — see the note on World.scatter.
   * Moving it re-rolls the whole plate, so re-measure it as a new stage.
   */
  density: 1,
  spread: 1,
  cell: 1.1,
  chunk: 0,
  spawn: { x: -6, z: 5 },
  spawnClear: 0.5,
  bounds: { minX: -16, maxX: 16, minZ: -15, maxZ: 15 },
  sky: { top: 0xd8f0e2, bottom: 0xf7f4d8, fog: 0xe9f2dc, fogNear: 16, fogFar: 54 },
  sun: { x: 0.3, y: 1, z: 0.6, intensity: 1.08 },
  camera: { pitch: 0.35, distance: 6.0 },


  build(w, r) {
    const t = w.terrain;
    const BX = 16, BZ = 15;
    /**
     * `stage.density` applied to the hand-written loops; `scatter` does its own.
     * NOT clamped to a minimum of one: the sow table below is mostly zeroes —
     * a diatom belongs in the film and nowhere else — and a `Math.max(1, ...)`
     * here quietly put one of everything in every region. That is five stray
     * yeasts and pollen grains, five cubic micrometres of mass nobody asked
     * for, and a stage that finishes 10% too big.
     */
    const n = (k) => Math.round(k * (microbeStage.density ?? 1));

    /**
     * Declare a ramp AND draw it, as a run of short flat steps.
     *
     * One long tilted plate is the trap here, and it fails twice over. It was
     * centred on the collision plane, so its top face floated half a thickness
     * above the surface the ball rolls along and the ball sank into the slope it
     * was climbing. Sinking the plate fixes the height but not the SHAPE: a box
     * carries two triangles per face, so a seven-unit plate is one triangle
     * whose footprint covers the entire ramp while its corner-average height
     * sits halfway up the slope. `test-decals` — and the eye — reads that as a
     * floor at chest height across the whole lower half of every ramp, and
     * again, upside down, for the plate's buried underside. 421 of this stage's
     * 728 decal failures were the nine plates; the other 307 were the deck
     * fringes, see `edge` below.
     *
     * Short steps instead. Each is axis-aligned with its top face exactly on the
     * collision plane at its own centre, so there is no sink term left to get
     * wrong, and each reaches from below whatever it stands on up to that
     * surface, so the wedge is solid and its underside stays buried. The only
     * error left is half a step of height, held to `RISE / 2` — under a fifth of
     * the STARTING radius, which is the size the decal test samples, and far
     * finer than the eye at the size each ramp actually opens.
     */
    const RISE = 0.009;
    const slope = (x0, z0, x1, z1, top, topTo, axis, colour) => {
      w.ramp(x0, z0, x1, z1, top, topTo, axis);
      const along = axis === 'x' ? x1 - x0 : z1 - z0;
      const wide = axis === 'x' ? z1 - z0 : x1 - x0;
      const rise = topTo - top;
      const m = Math.max(1, Math.ceil(Math.abs(rise) / RISE));
      const step = (along / m) * 1.02;
      for (let i = 0; i < m; i++) {
        const f = (i + 0.5) / m;
        const p = top + f * rise;              // the collision height right here
        const thick = p + 0.06;                // ...down through the agar below
        const o = { y: p - thick / 2 };
        if (axis === 'x') {
          o.x = x0 + f * along; o.z = (z0 + z1) / 2;
          t.box(step, thick, wide, colour, o);
        } else {
          o.x = (x0 + x1) / 2; o.z = z0 + f * along;
          t.box(wide, thick, step, colour, o);
        }
      }
    };

    /**
     * A deck's ragged edge, painted in two flat layers instead of built from a
     * ring of little columns.
     *
     * The columns reached the deck's own top, which is fine ON the deck and
     * wrong beside it: off the deck each one is a two-tenths-tall bump with a
     * flat lid and no platform under it, so the katamari rolls straight through
     * something that plainly has a top. And on the deck the lid sat 0.02 up,
     * which is most of a starting radius. Four rings, 307 decal failures.
     *
     * So: a halo painted on whatever lies OUTSIDE the deck, and a scallop
     * painted on the deck INSIDE it, sized so it cannot spill over the lip.
     * Same broken outline, nothing standing above either surface. The three-way
     * `lift` is the other constraint — neighbouring blobs overlap, and two
     * coplanar overlapping discs z-fight across the overlap.
     */
    const edge = (cx, cz, hx, hz, count, deckY, baseY, blob, colour) => {
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2;
        const rad = blob * (1 + (i % 3) * 0.3);
        const lift = (i % 3) * 0.0007;
        const ca = Math.cos(a), sa = Math.sin(a);
        t.cyl(rad, rad, 0.0009, colour,
          { x: cx + ca * (hx + rad * 0.5), y: baseY + Y_HALO + lift, z: cz + sa * (hz + rad * 0.5) }, 7);
        t.cyl(rad, rad, 0.0009, colour,
          { x: cx + ca * (hx - blob * 1.6), y: deckY + 0.0012 + lift, z: cz + sa * (hz - blob * 1.6) }, 7);
      }
    };

    /* ---------------- the agar plate ----------------

       CLEARANCE RULE, learned the hard way. Every raised deck below is a WALL
       until the katamari is about twice its height, so a deck parked two units
       from the rim is a dead-end corridor for the first four minutes. The bot
       spent whole runs shuttling along one: 330 seconds, 72 objects, dead flat
       growth curve from 1:30 onward. Nothing here comes within 3 units of the
       rim or of another deck, and every gap is open at both ends. */
    w.plat(-BX, -BZ, BX, BZ, Y_AGAR);
    t.quad(BX * 2, BZ * 2, A.agar, { y: Y_AGAR });

    /* Concentric growth rings spreading out from where the plate was
       inoculated — PAINTED, in short tangential quads, not built.

       These were tori, on the reasoning that a tube can never be coplanar with
       the plate it lies on. True, and it dodges the z-fighting rule by breaking
       the other one: a tube thick enough to read from across the dish stands a
       tenth of a unit proud, which is two ball-DIAMETERS at the start, and
       nothing collides with it, so the opening shot of the stage is a katamari
       passing through a hoop taller than itself. `test-decals` cannot see it —
       a rounded ridge has no horizontal facet to flag — which is worth knowing
       about that harness. Flat bands read the same from any distance the player
       ever sees them from and are 6% of the starting radius tall. Three lift
       levels because consecutive segments overlap. */
    for (let i = 0; i < 8; i++) {
      const rad = 1.6 + i * 1.45, band = 0.14 + i * 0.02;
      const seg = Math.max(12, Math.round((2 * Math.PI * rad) / 0.9));
      for (let k = 0; k < seg; k++) {
        const a = (k / seg) * Math.PI * 2;
        t.quad((2 * Math.PI * rad / seg) * 1.2, band, i % 2 ? A.agarWarm : A.agarDark, {
          x: -4 + Math.cos(a) * rad,
          y: Y_RING + (k % 3) * 0.0004,
          z: 2 + Math.sin(a) * rad,
          ry: Math.atan2(-Math.cos(a), -Math.sin(a)),
        });
      }
    }

    // Streak-plate scratches, three passes of the loop, running right through
    // where you start — you are what somebody smeared on here.
    for (let pass = 0; pass < 3; pass++) {
      const sx = -9.5 + pass * 0.8, sz = 8.6 - pass * 1.6;
      for (let i = 0; i < 13; i++) {
        const a = i * 0.55 + pass;
        t.quad(1.3, 0.15, A.streak, {
          x: sx + i * 0.52 + Math.sin(a) * 0.3,
          y: Y_STREAK,
          z: sz - Math.abs(Math.sin(a * 1.7)) * 1.7,
          ry: Math.cos(a) * 0.8,
        });
      }
    }

    /* ---------------- the mucus film ----------------

       Water is not a walkable height, only a rule about what may be PLACED
       here: `surface: 'water'` props (the swimmers) and nothing else. Scatter
       refuses to drop anything into water at all, so the film is populated by
       the hand-written loops at the bottom of this build. */
    const FX0 = 2.2, FZ0 = -12.4, FX1 = 12.4, FZ1 = -3.4;
    w.water(FX0, FZ0, FX1, FZ1);
    t.quad(FX1 - FX0, FZ1 - FZ0, A.film, { x: (FX0 + FX1) / 2, y: Y_FILM, z: (FZ0 + FZ1) / 2 });
    t.quad((FX1 - FX0) * 0.62, (FZ1 - FZ0) * 0.6, A.filmDeep,
      { x: (FX0 + FX1) / 2 + 0.6, y: Y_FILM_IN, z: (FZ0 + FZ1) / 2 - 0.4 });
    // strands of the stuff creeping out of the puddle
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      t.quad(1.9, 0.42, A.film, {
        x: (FX0 + FX1) / 2 + Math.cos(a) * 5.5,
        y: Y_FILM,
        z: (FZ0 + FZ1) / 2 + Math.sin(a) * 4.8,
        ry: a,
      });
    }

    /* ---------------- phage plaque, south-west ----------------
       A cleared patch in the lawn where a phage got in, raised because the
       surviving lawn around it kept on growing. */
    const PX0 = -12.4, PZ0 = -12.0, PX1 = -4.0, PZ1 = -5.6;
    w.plat(PX0, PZ0, PX1, PZ1, Y_PLAQUE);
    t.box(PX1 - PX0, Y_PLAQUE, PZ1 - PZ0, A.plaque,
      { x: (PX0 + PX1) / 2, y: Y_PLAQUE / 2, z: (PZ0 + PZ1) / 2 });
    t.quad(PX1 - PX0 - 0.7, PZ1 - PZ0 - 0.7, A.plaqueTop,
      { x: (PX0 + PX1) / 2, y: Y_PLAQUE_S, z: (PZ0 + PZ1) / 2 });
    // the ragged lysed edge
    edge((PX0 + PX1) / 2, (PZ0 + PZ1) / 2, (PX1 - PX0) / 2, (PZ1 - PZ0) / 2, 22,
      Y_PLAQUE, Y_AGAR, 0.46, A.plaqueTop);
    slope(PX1, -11.4, -1.4, -6.2, Y_PLAQUE, Y_AGAR, 'x', A.plaque);
    slope(-11.8, PZ1, -6.0, -3.0, Y_PLAQUE, Y_AGAR, 'z', A.plaque);

    /* ---------------- satellite colony, west ---------------- */
    const SX0 = -12.4, SZ0 = -2.2, SX1 = -7.0, SZ1 = 3.2;
    w.plat(SX0, SZ0, SX1, SZ1, Y_SAT);
    t.box(SX1 - SX0, Y_SAT, SZ1 - SZ0, A.satellite,
      { x: (SX0 + SX1) / 2, y: Y_SAT / 2, z: (SZ0 + SZ1) / 2 });
    t.quad(SX1 - SX0 - 0.6, SZ1 - SZ0 - 0.6, A.satTop,
      { x: (SX0 + SX1) / 2, y: Y_SAT_S, z: (SZ0 + SZ1) / 2 });
    edge((SX0 + SX1) / 2, (SZ0 + SZ1) / 2, (SX1 - SX0) / 2, (SZ1 - SZ0) / 2, 16,
      Y_SAT, Y_AGAR, 0.42, A.satTop);
    /* TWO ways up, on different faces. A deck you can walk AT but not climb is
       a trap of its own: `canOccupy` lets the katamari right up to a 0.30 step
       from about 520nm across, but paying for the rise out of forward speed
       needs roughly twice that, so for the whole band between the two it
       shoulders the cliff and gets nowhere. Whichever side you arrive from,
       there should be a slope within a couple of units. */
    slope(SX1, -1.8, -4.2, 3.0, Y_SAT, Y_AGAR, 'x', A.satellite);
    slope(-11.6, SZ1, -7.6, 5.4, Y_SAT, Y_AGAR, 'z', A.satellite);

    /* ---------------- colony mound, east ----------------
       Two tiers: a broad shelf with a raised crown in the middle, which is
       what a well-fed colony actually looks like from the side. */
    const CX0 = 3.6, CZ0 = 1.6, CX1 = 12.8, CZ1 = 10.2;
    w.plat(CX0, CZ0, CX1, CZ1, Y_SHELF);
    t.box(CX1 - CX0, Y_SHELF, CZ1 - CZ0, A.colony,
      { x: (CX0 + CX1) / 2, y: Y_SHELF / 2, z: (CZ0 + CZ1) / 2 });
    t.quad(CX1 - CX0 - 0.8, CZ1 - CZ0 - 0.8, A.colonyTop,
      { x: (CX0 + CX1) / 2, y: Y_SHELF_S, z: (CZ0 + CZ1) / 2 });
    edge((CX0 + CX1) / 2, (CZ0 + CZ1) / 2, (CX1 - CX0) / 2, (CZ1 - CZ0) / 2, 24,
      Y_SHELF, Y_AGAR, 0.6, A.colonyD);
    const KX0 = 6.0, KZ0 = 4.0, KX1 = 11.0, KZ1 = 8.8;
    w.plat(KX0, KZ0, KX1, KZ1, Y_CROWN);
    t.box(KX1 - KX0, Y_CROWN - Y_SHELF, KZ1 - KZ0, A.crown,
      { x: (KX0 + KX1) / 2, y: (Y_CROWN + Y_SHELF) / 2, z: (KZ0 + KZ1) / 2 });
    t.quad(KX1 - KX0 - 0.6, KZ1 - KZ0 - 0.6, A.crownTop,
      { x: (KX0 + KX1) / 2, y: Y_CROWN_S, z: (KZ0 + KZ1) / 2 });
    edge((KX0 + KX1) / 2, (KZ0 + KZ1) / 2, (KX1 - KX0) / 2, (KZ1 - KZ0) / 2, 18,
      Y_CROWN, Y_SHELF, 0.4, A.crown);
    // ramps: agar -> shelf (west, south and east), shelf -> crown (west, south)
    slope(0.2, 2.4, CX0, 9.4, Y_AGAR, Y_SHELF, 'x', A.colony);
    slope(4.4, -1.8, 11.6, CZ0, Y_AGAR, Y_SHELF, 'z', A.colony);
    slope(CX1, 4.0, 15.4, 7.0, Y_SHELF, Y_AGAR, 'x', A.colony);
    slope(3.9, 4.6, KX0, 8.2, Y_SHELF, Y_CROWN, 'x', A.crown);
    slope(6.6, 2.0, 10.4, KZ0, Y_SHELF, Y_CROWN, 'z', A.crown);

    /* ---------------- the host cell, north-west ----------------

       A cell so much bigger than everything on this plate that its membrane is
       simply where the world stops. The collision is a stair-step of solid
       columns following the arc — cheap, and it cannot leak, because each
       column is filled from the arc all the way past the plate's edge. The
       membrane you can see is a separate band of rotated slabs on the same
       curve. It is CONVEX into the dish on purpose: a concave landmark would
       make exactly the kind of pocket the clearance rule above exists to
       avoid. */
    const HX = -22, HZ = 26, HR = 18;
    const arcZ = (x) => HZ - Math.sqrt(Math.max(0, HR * HR - (x - HX) * (x - HX)));
    const COLS = 34, CW = (BX - 7.75) / COLS;
    for (let i = 0; i < COLS; i++) {
      const x0 = -BX + i * CW;
      // Sampled at the column's MIDDLE: the arc steepens towards the north
      // edge, and taking either end there leaves either a visible gap in front
      // of the membrane or a step out through it.
      const za = arcZ(x0 + CW / 2);
      w.bound(x0, za, x0 + CW, BZ + 0.9, 1.6);
      t.quad(CW, BZ + 0.9 - za, A.cyto, { x: x0 + CW / 2, y: Y_HOST, z: (za + BZ + 0.9) / 2 });
    }
    /* Derived from the arc, not written down: these angles were once literals
       and stopped matching the moment the cell moved, which left the membrane
       drawn several units off the wall it is supposed to be — and left the real
       wall unfenced, so props wedged themselves into the crevice behind it. */
    const TH0 = Math.atan2(arcZ(-BX) - HZ, -BX - HX);
    const TH1 = Math.atan2(arcZ(-7.75) - HZ, -7.75 - HX);
    /* Set BACK onto the walled side of the arc, and the coping no wider than
       the wall under it. The dish is outside this circle and the cell is inside,
       so a band centred on the arc hangs half its thickness over ground the
       katamari can stand on — and the top of a wall is a horizontal face, so
       once the ball is bigger than the wall that lid is a floor through its
       middle. It only bites past the goal, where the ball is taller than the
       membrane, but it is the same defect as the ramp plates and costs nothing
       to not have.

       Set back far enough that the ROTATED box's axis-aligned footprint clears
       the arc too, not just its centre — a 0.66-by-0.6 slab turned to follow a
       curve has a bounding box up to 0.89 across, and that is what a triangle is
       tested by. What is left is a fifth of a unit of the cell's own floor
       showing in front of its wall, which reads as the rim it ought to have. */
    for (let i = 0; i <= 24; i++) {
      const th = TH0 + (i / 24) * (TH1 - TH0);
      const back = HR - 0.48;
      const px = HX + Math.cos(th) * back, pz = HZ + Math.sin(th) * back;
      const ry = Math.atan2(-Math.cos(th), -Math.sin(th));
      t.box(0.66, 1.5, 0.6, i % 2 ? A.membrane : A.membraneD, { x: px, y: 0.75, z: pz, ry });
      t.box(0.66, 0.34, 0.5, A.membrane, { x: px, y: 1.62, z: pz, ry });
    }
    // what is going on inside it, seen over the wall
    t.sphere(4.6, A.nucleus, { x: -19.0, y: Y_HOST + 3.2, z: 20.0 }, 12, 8);
    t.torus(4.7, 0.45, A.nucleusD, { x: -19.0, y: Y_HOST + 3.2, z: 20.0, rx: Math.PI / 2 }, 4, 20);
    t.ellip(2.8, 1.4, 1.4, A.organelle, { x: -10.4, y: Y_HOST + 1.6, z: 19.6, ry: 0.7 }, 10, 6);
    t.ellip(2.3, 1.2, 1.2, A.organelle, { x: -26.4, y: Y_HOST + 1.4, z: 16.0, ry: -0.4 }, 10, 6);
    t.sphere(2.0, A.cyto, { x: -15.0, y: Y_HOST + 1.5, z: 23.0 }, 10, 7);

    /* ---------------- the dish rim ---------------- */
    w.bound(-BX - 0.9, BZ, BX + 0.9, BZ + 0.9, 1.5, A.rim);
    w.bound(-BX - 0.9, -BZ - 0.9, BX + 0.9, -BZ, 1.5, A.rim);
    w.bound(-BX - 0.9, -BZ, -BX, BZ, 1.5, A.rim);
    w.bound(BX, -BZ, BX + 0.9, BZ, 1.5, A.rim);
    for (let i = 0; i < 30; i++) {
      const x = -BX + 0.4 + i * (BX * 2 - 0.8) / 29;
      t.box(0.9, 0.16, 0.9, A.rimDark, { x, y: 1.56, z: BZ + 0.45 });
      t.box(0.9, 0.16, 0.9, A.rimDark, { x, y: 1.56, z: -BZ - 0.45 });
    }
    for (let i = 0; i < 28; i++) {
      const z = -BZ + 0.4 + i * (BZ * 2 - 0.8) / 27;
      t.box(0.9, 0.16, 0.9, A.rimDark, { x: BX + 0.45, y: 1.56, z });
      t.box(0.9, 0.16, 0.9, A.rimDark, { x: -BX - 0.45, y: 1.56, z });
    }

    /* ---------------- who goes down first ----------------

       BIGGEST FIRST, AND REMEMBER WHERE. `scatter` has no idea what is already
       on the ground, so a prop can land wholly inside a bigger one's collision
       footprint — and a thing you can eat, buried inside a thing you cannot, is
       worse than useless. It is the best-scoring target in its neighbourhood and
       it is unreachable, so a player (and the bot) walks in circles around it
       for the rest of the round. Measured: one lysosome that happened to land
       48nm from a chloroplast cost EVERY seed the run — nine of nine flatlined
       at 250-300nm with three minutes still on the clock, orbiting that one
       spot. About 10% of collectable props end up buried this way if you let
       them, on this stage and on the house alike.

       So everything with a footprint worth walking round is placed here, in
       descending size order, and each one leaves a keep-out circle behind it.
       Anything smaller placed afterwards — including the `scatter` passes at
       the bottom — has to find somewhere else. Nothing can be buried by
       something bigger, by construction. The six archetypes too small to hide
       anything are still free-scattered, because they are the texture of the
       plate and it should not look surveyed. */

    /** Keep-out circles: everything placed so far, plus a small prop's reach. */
    const keepOut = [];

    /* WALLS GET A FENCE TOO. A prop parked flush against a wall is a prop
       nobody gets: reaching it means grinding along the wall, and the approach
       stops dead the moment the wall says no, so you bounce off and come back
       rather than close the last few nanometres. Two seeds lost whole runs to
       one lysosome sitting 20nm outside the satellite's north edge. Half a unit
       of clearance along every wall in the stage — the four deck perimeters and
       the host cell's membrane — laid down before anything else is placed. */
    const EDGE = 0.45;
    const fence = (x0, z0, x1, z1) => {
      const put = (x, z) => keepOut.push({ x, z, r: EDGE });
      for (let x = x0; x < x1 + 1e-6; x += 0.5) { put(x, z0); put(x, z1); }
      for (let z = z0; z < z1 + 1e-6; z += 0.5) { put(x0, z); put(x1, z); }
      put(x1, z0); put(x1, z1);
    };
    fence(PX0, PZ0, PX1, PZ1);
    fence(SX0, SZ0, SX1, SZ1);
    fence(CX0, CZ0, CX1, CZ1);
    fence(KX0, KZ0, KX1, KZ1);
    for (let i = 0; i <= 30; i++) {
      const th = TH0 + (i / 30) * (TH1 - TH0);
      keepOut.push({ x: HX + Math.cos(th) * HR, z: HZ + Math.sin(th) * HR, r: 0.85 });
    }
    const REGIONS = {
      all:    [-15.4, -14.4, 15.4, 14.4],
      plaque: [PX0 + 0.6, PZ0 + 0.6, PX1 - 0.6, PZ1 - 0.6],
      shelf:  [CX0 + 0.6, CZ0 + 0.6, CX1 - 0.6, CZ1 - 0.6],
      crown:  [KX0 + 0.5, KZ0 + 0.5, KX1 - 0.5, KZ1 - 0.5],
      sat:    [SX0 + 0.5, SZ0 + 0.5, SX1 - 0.5, SZ1 - 0.5],
      film:   [FX0 + 0.7, FZ0 + 0.7, FX1 - 0.7, FZ1 - 0.7],
    };
    /** Slack, comfortably more than the radius of anything free-scattered. */
    const PAD = 0.08;

    const claim = (x, z, rad, lane = PAD) => keepOut.push({ x, z, r: rad + lane });
    const clear = (x, z) => {
      for (const a of keepOut) if ((x - a.x) ** 2 + (z - a.z) ** 2 < a.r * a.r) return false;
      return true;
    };
    /** Place `count` of one archetype in a region, never inside anything already down. */
    const sow = (id, count, region, s0, s1) => {
      const [x0, z0, x1, z1] = REGIONS[region];
      for (let i = 0; i < n(count); i++) {
        const sc = s0 + r() * (s1 - s0);
        let x = 0, z = 0, ok = false;
        for (let k = 0; k < 12 && !ok; k++) {
          x = x0 + r() * (x1 - x0);
          z = z0 + r() * (z1 - z0);
          ok = clear(x, z);
        }
        if (!ok) continue;
        const arch = w.placeId(id, x, z, null, sc);
        claim(x, z, arch.radius * sc);
      }
    };

    /* ---------------- landmarks ----------------
       Oversized phages loitering around their own plaque, and the big cells
       that carry the top of the ladder. Their sizes are written out rather
       than rolled, because these ARE the last rungs and a random draw can
       leave a hole in them. Kept out of the three-unit lanes between a deck
       and the rim: a biofilm at this size is nearly two units across and CORKS
       one. Landmarks go in open agar or open water, never in a gap. */
    const marks = [
      /* 1.897 -> 1.55: at 1.897 this instance had a pickup of 2µm560, needing a
         ball of 2µm909, while eating every other object on the plate only gets
         you to 2µm532. It was mathematically uncollectable and the stage could
         not be cleared. `balance` now reports this class — see "too big to ever
         collect" — so check that line before scaling a landmark up. */
      ['biofilm', 0.8, -10.0, 1.55], ['amoeba', 3.2, -1.6, 1.580],
      ['biofilm', -1.8, 11.8, 1.520], ['amoeba', -1.0, -4.2, 1.430],
      ['biofilm', -1.2, 1.0, 1.327], ['amoeba', 7.2, 12.6, 1.197],
      ['biofilm', -4.6, 7.2, 1.112],
      ['bacteriophage', -8.6, -8.6, 5.2], ['bacteriophage', -10.8, -6.8, 4.6],
      ['bacteriophage', -6.2, -10.6, 4.9], ['bacteriophage', -2.2, -4.0, 4.2],
    ];
    /* Landmarks get a clearing, not just a keep-out. These are the widest
       obstacles on the plate — a 1.58x amoeba is three units across — and two
       of them left a 75nm gate between themselves and a plasmid that happened
       to land alongside. A gate that tight is not impassable (a katamari
       squeezed through it in ten seconds of grinding) but it is not a route
       anybody finds, and both bot seeds that met one lost the run to it. So
       nothing at all is placed within 0.9 of a landmark's footprint, and the
       big cells sit in clearings the way they would on a real plate. */
    for (const [id, x, z, s] of marks) {
      const arch = w.placeId(id, x, z, r() * 6.28, s);
      claim(x, z, arch.radius * s, 0.9);
    }
    claim(microbeStage.spawn.x, microbeStage.spawn.z, 0.9);

    /* ---------------- everything with a footprint, biggest first ----------------
       [ id, scaleLo, scaleHi, open plate, plaque, colony shelf, crown, satellite, film ]
       The colonies get the lion's share of the big organisms; the open agar
       gets the loose organelles. Rows MUST stay in descending pickup order —
       that ordering is the whole guarantee.

       Note the satellite's column: nothing bigger than a spore goes up there.
       It is the smallest deck and the katamari can WALK AT its 0.30 step long
       before it can climb one, so a fat prize on top of it is bait — three bot
       seeds in a row shouldered that little cliff for two minutes rather than
       walk twenty units to the ramp. The heavy organisms live on the colony
       mound, which has a full-width slope on three of its four sides. */
    const SOW = [
      ['diatom',         0.95, 1.45,   0,  0,  0,  0,  0,  2],
      ['yeast',          0.85, 1.35,   0,  0,  1,  1,  0,  0],
      ['pollen',         0.85, 1.35,   1,  0,  1,  0,  0,  0],
      ['spirillum',      0.85, 1.35,   0,  0,  0,  0,  0,  3],
      ['coccus_chain',   0.85, 1.35,   1,  1,  1,  1,  0,  0],
      ['bacillus',       0.85, 1.35,   3,  1,  1,  1,  0,  0],
      ['tetrad',         0.85, 1.40,   6,  3,  3,  2,  0,  0],
      ['vibrio',         0.85, 1.40,   0,  0,  0,  0,  0,  8],
      ['coccus',         0.82, 1.42,  12,  5,  5,  3,  0,  0],
      ['chloroplast',    0.82, 1.42,  11,  4,  4,  2,  0,  0],
      ['spore',          0.80, 1.45,  21,  7,  7,  5,  2,  0],
      ['mitochondrion',  0.80, 1.45,  22,  9,  9,  5,  5,  0],
      ['cilia_tuft',     0.80, 1.50,   0,  0,  0,  0,  0, 40],
      ['plasmid',        0.80, 1.45,  22,  7,  7,  0,  6,  0],
      ['flagellum',      0.80, 1.45,  24,  8,  8,  0,  6,  0],
      ['lysosome',       0.80, 1.50,  36, 13, 13,  0, 10,  0],
      ['pilus',          0.80, 1.50,  28, 10, 10,  0,  7,  0],
      ['lipid_droplet',  0.80, 1.50,  40, 14, 14,  0, 10,  0],
      ['vesicle',        0.80, 1.50,  44, 15, 16,  0, 10,  0],
      ['bacteriophage',  0.80, 1.50,  98, 30, 27,  0, 20,  0],
      ['filament_virus', 0.80, 1.50,  60, 19, 17,  0, 10,  0],
      ['virus_rod',      0.80, 1.50,  60, 19, 17,  0, 10,  0],
    ];
    for (const [id, s0, s1, nAll, nPlaque, nShelf, nCrown, nSat, nFilm] of SOW) {
      sow(id, nAll, 'all', s0, s1);
      sow(id, nPlaque, 'plaque', s0, s1);
      sow(id, nShelf, 'shelf', s0, s1);
      sow(id, nCrown, 'crown', s0, s1);
      sow(id, nSat, 'sat', s0, s1);
      sow(id, nFilm, 'film', s0, s1);
    }

    /* ---------------- the dust ----------------
       Antibodies through enveloped virions, and nothing bigger. The cut is
       drawn at 60nm rather than by eye: a scatter pass leaves no keep-out
       circles behind it, so two scattered props CAN still bury each other, and
       the rod viruses were doing exactly that — a 99nm-wide rod swallowing a
       28nm virion, which then became the best target in its neighbourhood and
       killed the run. Everything wide enough to hide something is sown above.
       What is left is six archetypes with 39nm of collision radius between
       them at full scale, which cannot hide anything worth having. */
    const DUST = { tag: 'microbe', lo: 0.010, hi: 0.060, avoid: keepOut, scale: [0.8, 1.5] };
    w.scatter({ ...DUST, count: 430, x0: -15.4, z0: -14.4, x1: 15.4, z1: 14.4 });
    w.scatter({ ...DUST, count: 130, x0: -9.5, z0: 1.4, x1: -2.0, z1: 9.4 });
    w.scatter({ ...DUST, count: 130, ...box(REGIONS.plaque) });
    w.scatter({ ...DUST, count: 115, ...box(REGIONS.shelf) });
    w.scatter({ ...DUST, count: 45, ...box(REGIONS.crown) });
    w.scatter({ ...DUST, count: 85, ...box(REGIONS.sat) });

    function box([x0, z0, x1, z1]) { return { x0, z0, x1, z1 }; }
  },
};
