/* ============================================================
   The katamari itself: rolling, growing, and everything that
   has ever stuck to it.

   Attachment model
   ----------------
   A collected object keeps its ABSOLUTE size forever and is
   pinned to a fixed direction in the ball's local frame. Every
   frame its radial distance is recomputed from the current
   radius, so it rides the surface as the ball inflates and
   becomes proportionally smaller — the same visual logic the
   original uses. Once an object is trivially small compared to
   the ball it is retired to keep the draw count sane.
   ============================================================ */

import * as THREE from 'three';
import { clamp, lerp, damp, sphereVolume, sphereRadius, TAU } from '../util/math.js';

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q1 = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);

/**
 * How fast a magnet-snatched piece slides in, per second of exponential decay.
 *
 * 18 puts a piece taken from the far edge of a 0.6 magnet about 96% of the way
 * home in a sixth of a second. Slow enough to read as motion rather than as a
 * teleport with extra steps; fast enough that a stream of them does not turn
 * the ball into a fuzzy halo of things queuing to land.
 */
const FLY_RATE = 18;

export const TUNING = {
  /**
   * An object sticks when its `pickup` size is at most this multiple of the
   * ball's diameter.
   *
   * This is the cheapest lever on HOW LONG A STAGE LASTS, and the only one
   * that does not move the size ceiling. Lowering it means you must be that
   * bit bigger before a thing is edible, so the ladder has more rungs and the
   * same stage mass takes longer to eat — but you still end up eating all of
   * it, so the final size is unchanged. (`packing` also slows growth, but the
   * ceiling is `stageMass * packing`, so it drags the finish down with it.)
   *
   * IT IS ALSO WHAT PAYS FOR A FLAT SPEED CURVE, which is why it is 0.88 and
   * not the 0.78 it sat at for a long time. Growth comes from mass swept per
   * second, and swept area per second is `speed * diameter`. Flattening
   * `speedP` towards 0 takes the `speed` term out of that product, so a large
   * katamari covers far less ground than it used to and has to get more out of
   * the ground it does cover. Measured at `speedP` 0.25: at 0.78 the house
   * clears 2 runs in 15 and the town none at all; at 0.88, 12 and 11. Same
   * stages, same layouts, same clock — the only difference is how much of what
   * you roll over you are allowed to keep.
   *
   * 0.88 used to be too generous, and the note here said so: the city went 5m
   * to its 300m ceiling in 90 seconds of bot play. That was measured when top
   * speed still climbed steeply with size, so the two effects compounded. With
   * the speed curve flat they no longer do — the city now takes 2:50 to reach
   * its goal, against 3:21 at the old 0.78/0.75 pairing, and the house and town
   * both take LONGER than they used to (3:17 vs 2:06, 6:46 vs 4:37).
   *
   * Do not go much below 0.78 whatever `speedP` is — measured at 0.60 the city
   * stalls out at 26m and never reaches its goal at all, because the rungs get
   * further apart than the growth from one rung can bridge.
   */
  pickupRatio: 0.88,
  /** Fraction of a collected object's volume that actually swells the ball. */
  packing: 0.48,

  /**
   * MAGNET: how much further than its own surface the ball may reach, at the
   * slider's maximum, as a fraction of the radius.
   *
   * ⚠ REACH IS NOT APPETITE, AND THAT DISTINCTION IS THE WHOLE FEATURE. This
   * scales the DISTANCE at which an already-collectable thing sticks. It does
   * not touch `pickupRatio`, so it can never make something edible that was
   * not edible before, and it deliberately does not extend the obstacle test
   * either — a magnet that also made you bounce off walls you had not touched
   * would be a bug wearing a feature's clothes. Every "is anything left"
   * query in World.js keys off `pickupRatio` alone and so needs no change at
   * all, which is a good sign the line is drawn in the right place.
   *
   * The reason it exists is not difficulty, it is INPUT RESOLUTION. Tilt is an
   * analogue control with a real dead zone, read on a screen where a
   * collectable thing can be a handful of pixels across; asking it for the
   * precision a mouse gives is asking for something the hardware cannot
   * deliver. Requested in exactly those terms — "to rebalance mobile tilt play
   * and limited resolution".
   *
   * 0.6 is the ceiling, not the default. Swept area goes as the SQUARE of
   * reach, so 1.6 radii covers 2.56x the ground per second — easily enough to
   * move the balance of every stage, which is why what the slider does to
   * clear rates is measured in `tools/test-magnet.mjs` rather than assumed.
   */
  magnetMax: 0.6,

  /**
   * Top speed = stageSpeed * (diameter / stageStartSize)^speedP.
   *
   * NORMALISED PER STAGE. A single global curve has to span 5cm to 390m, so
   * whatever exponent suits the house leaves the city crawling — the original
   * `2.2 * D^0.42` took four minutes to cross the city at stage start. Anchor
   * each stage to its own scale and the exponent only has to be right ONCE.
   * `stageSpeed` comes from `stageSpeedFor()`, which also applies `spread`.
   *
   * THE PLAYER READS SPEED OFF THE WORLD, NOT OFF THE BALL. That is the whole
   * reason this number is low. There are two competing cues:
   *
   *   1. BALL-RELATIVE motion. The camera scales with the katamari, so the
   *      ball covers a constant fraction of the screen. Screen-widths per
   *      second is `v / (k*D)`, which sags as `D^(p-1)`.
   *
   *   2. WORLD-FEATURE FLOW. Buildings, kerbs and road markings do NOT scale
   *      with you, so the rate at which scenery whips past is `v / spacing`,
   *      which grows as `D^p`.
   *
   * Cue 2 wins in practice, repeatedly and unambiguously. At p = 1 and again
   * at 0.75 the report was the same: "as I get bigger my katamari gets
   * increasingly faster and difficult to control — it should move at a static
   * top speed relative to the environment". Cue 1 was only ever reported as a
   * problem at p <= 0.42, and then in the form "impossible to clear the later
   * stages", i.e. as a completion failure rather than a feel one.
   *
   * WHY NOT 0, WHICH IS WHAT A STATIC SPEED LITERALLY MEANS. Because at p = 0
   * growth becomes `D ~ sqrt(t)`: swept area per second is `speed * D`, and
   * with `speed` constant that integrates to `D^2 ~ t`. Stage duration then
   * scales with the SQUARE of the growth ratio. The house grows 32x inside a
   * 26m room, so reaching 1m60 in six minutes at a fixed speed needs about 3x
   * the current one — and 1.0 m/s for a 5cm marble is 20 of its own widths per
   * second, crossing the visible floor in 0.15s. One constant cannot serve
   * both ends of a 32x size range. This is arithmetic, not tuning: measured at
   * p = 0 with the speeds re-anchored upward, the house does clear (20 of 21
   * runs at 1.0 m/s) but only by making the opening a blur.
   *
   * 0.5 IS THE BALANCE POINT, AND BOTH NEIGHBOURS WERE PLAYED AND REJECTED.
   * Over a stage with growth ratio G, cue 1 is wrong by G^(1-p) and cue 2 by
   * G^p, so they are equally wrong at exactly 0.5. That is not just tidy: it
   * is also where STOPPING DISTANCE IN BALL-WIDTHS is exactly flat, because it
   * goes as `D^(p-1) / brakeMul` and 48^-0.5 * 6.9 = 1.0 across the house's
   * span. The katamari is equally precise at every size while still taking 7x
   * longer in seconds to do anything. Heavy in TIME, precise in SPACE.
   *
   * 0.56 is 0.5 plus two requested rounds of "10% less slowdown", and the
   * conversion is worth writing down because the request is in RATIO terms
   * while this number is an EXPONENT. Ball-relative sag over a stage is
   * `G^(1-p)`, so a factor f off the sag is
   *     p' = p - ln(f)/ln(G)
   * For f = 0.9 that is +0.030 for the house (G = 32), +0.032 for the town (28)
   * and +0.029 for the city (40) — agreeing to within a thousandth, so ONE
   * exponent serves all three. Applied twice: 0.5 -> 0.53 -> 0.56, sag
   * 5.66x -> 5.10x -> 4.60x, which is 0.9 * 0.9 = 0.81 of where it started.
   *
   * NEVER apply the percentage straight to `speedP`. 10% off 0.5 would be 0.55,
   * which is a 16% cut to the sag, and the error compounds every round.
   *
   * Shipped 0.75 -> "increasingly faster and difficult to control".
   * Shipped 0.25 -> "the slow down is WAY too aggressive, there is no chance
   * of completing even the first area". Both reports are about the house, and
   * the number that matters is how long it takes to cross that 26m room at
   * goal size: 5.7s at p = 0.75, 11.0s at 0.56, 13.5s at 0.5, 32s at 0.25.
   *
   * THE BOT DID NOT CATCH THE SECOND ONE, and it is worth knowing why. It
   * cleared the house 12 times in 15 at p = 0.25 — the same as at 0.5 — because
   * it knows where every prop is. A player does not: the end of a round is a
   * SEARCH, and search time scales with how fast you can cross the room. So
   * `balance` can only ever tell you a stage is impossible, never that it is
   * miserable. Weight the report over the instrument here.
   *
   * Measured clear rates at `pickupRatio` 0.88, 15 runs, bot skill 0.9 —
   * house / town / city:
   *   p = 0.00   2/15   0/15   15/15   fully static; house and town never end
   *   p = 0.15   3/15   7/15   15/15   still broken
   *   p = 0.25  12/15  11/15   15/15   PLAYED — far too slow to finish
   *   p = 0.35  12/15  12/15   15/15
   *   p = 0.50  12/15  14/15   15/15   PLAYED — "getting close"
   *   p = 0.53  14/15   9/15   15/15   PLAYED (town clock also cut to 6:00)
   *   p = 0.56  13/15  11/15   15/15   SHIPPED (town clock back to 7:00)
   *   p = 0.60  14/15  13/15   15/15
   *   p = 0.75  10/15  15/15   15/15   PLAYED — reported as too fast
   * The cliff below 0.25 is a `sqrt(t)` wall: at a constant speed, swept area
   * per second is `speed * D`, so `D^2 ~ t` and a stage costs time as the
   * SQUARE of its growth ratio.
   *
   * Across a whole stage, 0.56 gives a world-flow rise of 7.0x (against 13-16x
   * at 0.75) and a ball-relative sag of 4.6x (against 13.7x at 0.25).
   *
   * Retuning: `options.speedCurve` exposes this live in the Options screen, so
   * FIND THE NUMBER BY PLAYING rather than by another round of rebuilds. Below
   * 0.25 stages silently stop being completable — always re-run
   * `balance --runs=15` and read the CLEAR RATE. `pickupRatio` is the lever
   * that pays for a lower exponent; see its note.
   */
  speedP: 0.56,
  /** Crossing the stage at its starting size should take about this long. */
  crossSeconds: 42,

  /* ----------------------------------------------------------------
     Three independent rates, each in units of "top speeds per second",
     so a rate of 4 means four seconds' worth of top speed gained (or
     shed) every second — i.e. a quarter-second to go from a standstill
     to full tilt. Each lerps from Small to Huge by how far through its
     OWN stage the katamari is, not by absolute size, because 5m is
     "big" globally while being the smallest thing in the city.

     These replaced a single exponential ground friction, which was
     doing three jobs and was wrong at two of them:

       - It set the stopping rate. Legitimate, and now `brakeMul`.
       - It shaped the approach to top speed. Legitimate, now `accelMul`.
       - It ALSO set top speed, because velocity settles where
         acceleration and drag balance, at `topSpeed * accelMul /
         friction`. So the game had two independent mechanisms capping
         speed and the lower one won silently. An accelMul that dipped
         under friction held the ball at 43% of its stated top speed
         while every readout said otherwise.

     And because friction was a constant per-second decay, time-to-stop
     was 0.54s at EVERY size: a 300m katamari doing 1440 m/s halted as
     fast as a marble. Heaviness was half-implemented — slow to start,
     instant to stop. Coasting is most of what mass feels like, so
     brakeMul drops hardest of the three.

     Splitting them means top speed is exactly top speed, time to reach
     it is exactly 1/accelMul, and time to stop is exactly 1/brakeMul.
     No constant can silently override another.
     ---------------------------------------------------------------- */

  /**
   * SYMMETRIC BY DESIGN — all three are the same pair of numbers.
   *
   * Same mass, same force, whichever way you are pushing: speeding up, slowing
   * down and turning are one physical quantity seen from three angles, and
   * there is no reason for a katamari to be worse at one than another.
   *
   * They were NOT symmetric for a while. Brake sat at 62-67% of accel on the
   * theory that "coasting is most of what mass feels like", and the result was
   * a ball that could get into trouble faster than it could get out. The user
   * reported it as the game feeling like it got FASTER as the ball grew, which
   * it does not — perceived top speed is flat by construction and measured
   * flat. What actually collapsed was CONTROL AUTHORITY: stopping distance ran
   * from 0.5 to 3.8 of the ball's own widths across a stage, so late on you
   * could not be slow when you wanted to be, and being unable to shed speed
   * reads exactly like having too much of it.
   *
   * Weight still arrives, and arrives honestly, because the whole trio drops
   * ~7x from small to huge. A big katamari is bad at everything equally.
   */
  accelMulSmall: 9.0,
  accelMulHuge: 1.30,
  /** Shedding speed when you let go. */
  brakeMulSmall: 9.0,
  brakeMulHuge: 1.30,
  /** Scrubbing off sideways drift when you change direction. */
  turnMulSmall: 9.0,
  turnMulHuge: 1.30,

  dashMul: 1.55,
  dashDrain: 0.85,
  dashRecover: 0.4,

  /* ------------------------------------------------------------
     SUPER DASH — phone only. See `Katamari.superDash`.

     Requested as "charges up over time to increase the DURATION of
     the dash up to 500%". So it does not touch `dashMul`: the ball is
     no faster, it simply stays fast for longer. That is the whole
     distinction, and it is what keeps this from being a speed cheat —
     top speed governs the size ceiling and the climb budget, and
     nothing here goes near either.

     ⚠ WHY PHONE ONLY, HONESTLY. The same reason `magnet` defaults
     higher on touch: a thumb on a 44px button and a tilt sensor with a
     dead zone cannot chain short dashes the way a finger on Shift can,
     so the phone gets the length it cannot earn by dexterity. It is
     not a bonus for playing on a phone, it is the phone's version of a
     control the desktop already has.
     ------------------------------------------------------------ */
  /** Extra duration multiplier at full charge. 4 => a 5x-long dash. */
  superDashMax: 4,
  /** Charge per second while NOT dashing: full in 40s of ordinary rolling. */
  superChargeRate: 1 / 40,
  /** Charge spent per second while dashing. Tuned so ONE full-length super
      dash spends exactly one full bar — see the latch in `step`. */
  superSpend: 1 / 5.4,

  /**
   * Gravity, in KATAMARI RADII per second squared — not metres.
   *
   * A flat metric gravity is wrong for the same reason a flat top speed was
   * wrong: the camera scales with the ball, so what the player sees is not
   * metres but ball-widths. At a flat 18 m/s^2 a 5cm katamari dropped its own
   * radius in 0.05s and a 300m one took 4.1s — the same fall, five times
   * slower to watch. Measured in the city, a large ball spent **30% of its
   * time airborne**, and airborne means nothing underneath is in reach, so it
   * read as "I have to float down before I can pick anything up". Which is
   * exactly what the user reported.
   *
   * As a multiple of radius it is scale-invariant: a fall of one radius takes
   * sqrt(2 / gravityRadii) seconds at every size. 720 reproduces the original
   * 18 m/s^2 at the house's 2.5cm starting radius, which nobody complained
   * about, so the small end is unchanged and only the big end is fixed.
   */
  gravityRadii: 720,

  /**
   * How high a prop's top may sit above the katamari's underside and still be
   * something you ride OVER rather than bounce off, as a fraction of radius —
   * at FULL SPEED. The gate scales with the square of how fast you are
   * actually going, so at half speed you get a quarter of it:
   *
   *     climbable rise = climbFrac * R * (v / topSpeed)^2
   *
   * Being too big to stick to should not make a thing a wall. You can mount
   * something slightly out of your league, and what stops you is momentum:
   * the climb is paid for out of your speed, and if you did not bring enough
   * you stall partway and roll back down.
   *
   * This is deliberately expressed in ball-relative units rather than as
   * `v^2 >= 2*g*h` against real gravity. Once gravity scales with the ball,
   * that form makes climbing ability depend on `(topSpeed/R)^2`, which varies
   * ~7x between the house and the city — the city would have been able to
   * mount 2% of its own radius, i.e. not a kerb. Falling is physics and should
   * be scale-invariant; how far you can lean on the size ladder is a game
   * rule and should be authorable directly.
   */
  climbFrac: 1.0,

  /**
   * Impact speed as a fraction of top speed, above which objects shake loose.
   * Must sit close to the dash cap (dashMul) so only a genuine full-tilt
   * slam costs you anything. At 1.02 every dash-into-a-building knocked, and
   * once the stages got faster that meant more collisions per second than
   * pickups — the katamari visibly shrank over minutes in a dense city.
   */
  knockThreshold: 1.42,
  /** Seconds of immunity after a knock, so one bad corner isn't fatal. */
  knockCooldown: 4.0,
  maxAttached: 260,
  /** Attached objects smaller than this fraction of the diameter are retired. */
  retireFrac: 0.014,
};

/**
 * @param {number} diameter   current katamari diameter, metres
 * @param {number} startSize  the stage's starting diameter
 * @param {number} stageSpeed m/s at the stage's starting size
 */
/**
 * The m/s a stage runs at its own starting size, AFTER `stage.spread`.
 *
 * `stage.speed` is authored against the layout's ORIGINAL coordinates, so
 * stretching a stage without scaling this leaves the katamari crawling across
 * a world that got bigger without it. That is not a small effect and it does
 * not read as "slow": at spread 4 the city took seven times longer to cross at
 * its starting size than intended, so the early game felt empty (everything
 * far away in SECONDS, whatever the object count) and growing felt like a
 * speed-up, because only then did you catch up with the world. The user
 * reported all three symptoms — too sparse, and "we went back to rolling
 * faster as we get bigger" — from this one missing multiply.
 *
 * The `bounds`-derived fallback needs no scaling: bounds are already given in
 * final, spread coordinates.
 */
export function stageSpeedFor(stage) {
  if (stage.speed != null) return stage.speed * (stage.spread ?? 1);
  const width = stage.bounds.maxX - stage.bounds.minX;
  return width / TUNING.crossSeconds;
}

export function topSpeedFor(diameter, startSize = 0.05, stageSpeed = 0.7) {
  const growth = Math.max(1, diameter / Math.max(1e-6, startSize));
  return stageSpeed * Math.pow(growth, TUNING.speedP);
}

let _uid = 0;

export class Katamari {
  /**
   * @param {THREE.Material} material shared vertex-coloured material
   */
  constructor(material, startRadius) {
    this.material = material;
    this.group = new THREE.Group();        // world transform; position = ball centre
    this.spinner = new THREE.Group();      // carries the roll rotation
    this.group.add(this.spinner);

    const coreGeo = new THREE.IcosahedronGeometry(1, 3);
    // give the core a soft two-tone look via vertex colours
    const cnt = coreGeo.attributes.position.count;
    const colors = new Float32Array(cnt * 3);
    const cA = new THREE.Color(0x63b345), cB = new THREE.Color(0x4c9138);
    const pos = coreGeo.attributes.position;
    for (let i = 0; i < cnt; i++) {
      const t = (pos.getY(i) + 1) * 0.5;
      const c = cA.clone().lerp(cB, 1 - t);
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    }
    coreGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.core = new THREE.Mesh(coreGeo, material);
    this.core.castShadow = true;
    this.core.receiveShadow = true;
    this.spinner.add(this.core);

    this.attached = [];            // {mesh, dir, size, embed, id}
    /* Entries currently animating inwards from where they were snatched. A
       separate list rather than a flag on every entry: `layoutAttached` runs
       over all 260 attached pieces every frame and this is a handful at a
       time, so paying for the animation once per flying piece rather than once
       per attached piece is free. See `magnet`. */
    this.flying = [];
    /**
     * Extra reach as a fraction of the radius, 0 = off. Set per round from the
     * player's option; see TUNING.magnetMax. Deliberately an instance field
     * rather than a module constant, because `tools/balance.mjs` drives this
     * class directly and must be able to sweep it.
     */
    this.magnet = 0;
    this.uniqueIds = new Set();
    this.collectedCount = 0;
    this.biggest = null;

    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.groundY = 0;              // height of the surface under the ball
    this.airborne = false;
    this.vy = 0;
    /** Top of any prop we are currently riding over; see World.moveKatamari. */
    this.rampTop = -Infinity;

    this.dash = 1;                 // 1 = full, drains while dashing
    this.dashing = false;
    /**
     * Super-dash charge, 0..1. Fills while not dashing, spent while dashing,
     * and divides the dash meter's drain rate so a full bar makes the dash
     * last five times as long.
     *
     * ⚠ AND `superDash` DEFAULTS FALSE, WHICH IS LOAD-BEARING FOR THE
     * HARNESS. `tools/balance.mjs` drives this class directly and dashes on
     * half its ticks; if this were on by default the bot would inherit a
     * phone-only feature and every clear rate in the game would move for a
     * reason nobody could see. `Game` turns it on for a coarse pointer and
     * nothing else does.
     */
    this.superCharge = 0;
    this.superDash = false;
    /** Latched at the start of each dash; see `step`. 1 = no super dash. */
    this._dashBoost = 1;
    this.wobble = 0;               // grows with lumpiness, used for the bob
    this.lumpy = 0;
    this.rollDistance = 0;
    this.lastGrowth = 0;
    this.justGrewTimer = 0;
    this.knockTimer = 0;
    this.topSpeed = 1;
    this.speedFrac = 0;
    // Overwritten by setStageProfile(); these are house-ish defaults.
    this.stageStart = 0.05;
    this.stageSpeed = 0.7;
    this.stageSpan = 48;

    this.setRadius(startRadius);
    this.volume = sphereVolume(this.radius);
  }

  get diameter() { return this.radius * 2; }

  /**
   * Anchor the speed and weight curves to this stage.
   * @param {number} startSize stage starting diameter
   * @param {number} speed     m/s at that starting size
   * @param {number} span      end diameter / start diameter, for the weight ramp
   */
  setStageProfile(startSize, speed, span) {
    this.stageStart = Math.max(1e-4, startSize);
    this.stageSpeed = Math.max(0.05, speed);
    this.stageSpan = Math.max(2, span);
  }

  setRadius(r) {
    this.radius = r;
    this.core.scale.setScalar(r);
  }

  reset(startRadius, spawn) {
    for (const a of this.attached) this.spinner.remove(a.mesh);
    this.attached.length = 0;
    this.flying.length = 0;
    this.uniqueIds.clear();
    this.collectedCount = 0;
    this.biggest = null;
    this.setRadius(startRadius);
    this.volume = sphereVolume(startRadius);
    this.vel.set(0, 0, 0);
    this.vy = 0;
    this.rampTop = -Infinity;
    this.spinner.quaternion.identity();
    this.dash = 1;
    /* Not carried between rounds: a charge earned in the house should not be
       spent in the galaxy, and starting empty makes the first one an event.
       ⚠ `dashing` AND THE LATCHED BOOST HAVE TO GO WITH IT. The boost is
       latched on the rising edge of `dashing`, so a round that ENDED mid-dash
       leaves that flag true, the next round's first press is not an edge, and
       the player inherits whatever multiplier the last round happened to
       finish on. Found by a harness that measured two dashes back to back and
       got 1.00x for the second — the same shape as the quit chip's stale fill,
       which is the second time an edge-triggered thing has survived a reset
       here. */
    this.dashing = false;
    this._dashBoost = 1;
    this.superCharge = 0;
    this.lumpy = 0;
    this.wobble = 0;
    this.rollDistance = 0;
    this.knockTimer = 0;
    this.pos.copy(spawn);
    this.pos.y = spawn.y + startRadius;
    this.groundY = spawn.y;
    this.group.position.copy(this.pos);
  }

  /**
   * How far from the ball's CENTRE a collectable thing still sticks.
   *
   * Equal to the radius with the magnet off, which is what makes this safe to
   * substitute for `radius` at every collection site in `World.resolve`
   * without changing default behaviour by a single float.
   */
  get reach() { return this.radius * (1 + this.magnet); }

  /** Can this archetype be picked up right now? */
  canPickUp(arch) {
    return arch.pickup <= this.diameter * TUNING.pickupRatio;
  }

  /**
   * Weld a collected prop onto the ball.
   * @param {object} arch  archetype
   * @param {THREE.Vector3} worldPos where the object currently stands
   * @param {number} variant which geometry variant
   * @param {number} rotY the object's world Y rotation
   */
  /**
   * @param {number} [fly] how far outside the ball's surface this was taken
   *   from. Non-zero only with the magnet on, and purely cosmetic: the piece
   *   is attached and counted immediately, then DRAWN sliding inwards from
   *   where it was. Without it a magnet reads as scenery blinking out of
   *   existence a body-width away, which looks like a rendering fault rather
   *   than like a feature — the growth is the same either way, so the only
   *   thing this buys is the player being able to see what happened, which is
   *   the entire reason the setting is discoverable at all.
   */
  attach(arch, worldPos, variant, rotY, rnd, fly = 0) {
    // Outward direction from the ball centre towards the object, in ball space.
    _v1.copy(worldPos).sub(this.pos);
    if (_v1.lengthSq() < 1e-9) _v1.set(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5);
    _v1.normalize();
    // Objects stick where they were touched, but with a bit of scatter.
    // Contact points all lie in the plane you happen to be rolling along, so
    // without this the ball grows a neat equatorial belt of junk and stays
    // bald everywhere else.
    _v2.set(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).multiplyScalar(0.55);
    _v1.add(_v2).normalize();
    // Convert the world direction into the spinner's rotating frame.
    const dir = _v1.clone().applyQuaternion(_q1.copy(this.spinner.quaternion).invert());

    const geo = arch.geos[variant % arch.geos.length];
    const mesh = new THREE.Mesh(geo, this.material);
    mesh.castShadow = true;

    // Random twist around the surface normal so repeats don't line up.
    const twist = rnd() * TAU;
    const tilt = (rnd() - 0.5) * 0.55;
    const entry = {
      id: `${arch.id}:${variant}:${_uid++}`,
      archId: arch.id,
      mesh,
      dir,
      size: arch.pickup,
      // Exactly what this object contributed, so losing it refunds the
      // same amount. Deriving it again from geometry made the ball shrink.
      volAdded: arch.volume * TUNING.packing,
      embed: Math.min(arch.embed, arch.pickup * 0.5),
      twist,
      tilt,
      /* Radial offset still to be travelled, in world units. `layoutAttached`
         adds it to the resting distance and `step` decays it to zero. */
      fly: fly > 0 ? fly : 0,
      quat: new THREE.Quaternion(),
    };
    if (entry.fly > 0) this.flying.push(entry);
    // Orient +Y along the outward normal, then twist/tilt for variety.
    entry.quat.setFromUnitVectors(_up, dir);
    _q1.setFromAxisAngle(dir, twist);
    entry.quat.premultiply(_q1);
    _q1.setFromAxisAngle(_v2.set(dir.z, 0, -dir.x).normalize().lengthSq() > 0.1
      ? _v2 : _v2.set(1, 0, 0), tilt);
    entry.quat.premultiply(_q1);
    mesh.quaternion.copy(entry.quat);
    mesh.rotateY(rotY * 0.25);

    this.spinner.add(mesh);
    this.attached.push(entry);

    // Growth: volumetric, with a packing loss.
    const before = this.radius;
    this.volume += arch.volume * TUNING.packing;
    this.setRadius(sphereRadius(this.volume));
    this.lastGrowth = this.radius - before;
    this.justGrewTimer = 0.35;

    this.collectedCount++;
    this.uniqueIds.add(arch.id);
    if (!this.biggest || arch.pickup > this.biggest.pickup) this.biggest = arch;

    // Lumpiness drives the wobble; a big item relative to the ball rattles more.
    this.lumpy = clamp(this.lumpy + (arch.pickup / this.diameter) * 0.55, 0, 1.4);

    this.pruneAttached();
    this.layoutAttached();
    return entry;
  }

  /** Retire attached objects that have become visually irrelevant. */
  pruneAttached() {
    const minSize = this.diameter * TUNING.retireFrac;
    if (this.attached.length > TUNING.maxAttached * 0.6) {
      for (let i = this.attached.length - 1; i >= 0; i--) {
        const a = this.attached[i];
        if (a.size < minSize) {
          this.spinner.remove(a.mesh);
          this.attached.splice(i, 1);
        }
      }
    }
    // Hard cap: drop the smallest remaining.
    if (this.attached.length > TUNING.maxAttached) {
      const sorted = this.attached.slice().sort((x, y) => x.size - y.size);
      const kill = sorted.slice(0, this.attached.length - TUNING.maxAttached);
      const dead = new Set(kill);
      for (const a of kill) this.spinner.remove(a.mesh);
      this.attached = this.attached.filter((a) => !dead.has(a));
    }
  }

  /** Re-seat every attached object on the current surface. */
  layoutAttached() {
    const R = this.radius;
    for (const a of this.attached) {
      const sink = Math.min(a.embed, R * 0.42);
      // `a.fly` is 0 for everything that was not magnet-snatched, so this is
      // the same arithmetic it has always been in the overwhelming case.
      a.mesh.position.copy(a.dir).multiplyScalar(R - sink + a.fly);
    }
  }

  /**
   * Advance the magnet's in-flight pieces. Called once per frame, not per
   * physics sub-step: it is animation, it must not be run eight times at 1/120
   * and land somewhere different on a slow machine than on a fast one.
   *
   * Frame-rate independent decay, so the slide looks identical at 30fps and
   * 144. The floor is relative to the ball, because "close enough to stop
   * animating" is a different absolute distance for a marble and for a moon.
   */
  updateFlight(dt) {
    if (!this.flying.length) return;
    const k = Math.exp(-FLY_RATE * dt);
    const floor = this.radius * 0.01;
    for (let i = this.flying.length - 1; i >= 0; i--) {
      const a = this.flying[i];
      a.fly *= k;
      /* Dropped by `pruneAttached` or `knockOff` while still in the air. Its
         mesh is gone, so it must leave this list too or it is a slow leak of
         entries nothing will ever finish. */
      if (a.fly < floor || !a.mesh.parent) {
        a.fly = 0;
        this.flying.splice(i, 1);
      }
    }
  }

  /**
   * Shake some objects loose after a hard impact. Returns how many fell off.
   * Volume is refunded from what each piece actually contributed, and a
   * cooldown stops a single awkward corner from stripping the whole ball.
   */
  knockOff(strength, rnd) {
    if (this.knockTimer > 0) return 0;
    if (this.attached.length < 6) return 0;
    const n = Math.min(this.attached.length - 4, 1 + Math.round(strength * 3));
    if (n <= 0) return 0;
    let lost = 0;
    let volLost = 0;
    for (let i = 0; i < n; i++) {
      // Prefer the outermost, most recently stuck-on pieces.
      const idx = this.attached.length - 1 - Math.floor(rnd() * Math.min(8, this.attached.length));
      const a = this.attached[idx];
      if (!a) continue;
      this.spinner.remove(a.mesh);
      this.attached.splice(idx, 1);
      volLost += a.volAdded;
      lost++;
    }
    if (lost) {
      // Never give back more than a small slice of the whole ball at once.
      volLost = Math.min(volLost, this.volume * 0.015);
      this.volume = Math.max(sphereVolume(0.004), this.volume - volLost);
      this.setRadius(sphereRadius(this.volume));
      this.layoutAttached();
      this.lumpy = Math.max(0, this.lumpy - 0.3);
      this.knockTimer = TUNING.knockCooldown;
    }
    return lost;
  }

  /**
   * Integrate one physics step.
   *
   * @param {object} inp  {moveX, moveZ, dash} in camera space. The MAGNITUDE of
   *   (moveX, moveZ) is a throttle, not just a direction — see `throttle` below.
   *   A keyboard always delivers exactly 1 (`Input.readMove` normalises), so
   *   this is invisible on a desktop and is the whole game on a phone.
   * @param {number} camYaw
   */
  step(dt, inp, camYaw, world) {
    const R = this.radius;
    const D = R * 2;

    // ---- desired direction in world space (camera relative) ----
    // Build the basis explicitly from where the rig actually is rather than
    // applying a rotation matrix to the raw input. The rig sits at
    //   target + (sin(yaw), cos(yaw)) * distance
    // and looks back at the katamari, so "into the screen" is the negation of
    // that, and right is `up x forward` for a Y-up right-handed world.
    //
    // A plain rotation matrix here had the X term's sign flipped, which is the
    // same as rotating by -yaw. That reads as correct at yaw 0 and 180 and
    // exactly backwards at 90 and 270 — and since the camera starts at 180,
    // W felt right until you turned. tools/test-controls.mjs pins this down.
    const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);   // forward
    const rx = -fz, rz = fx;                                 // right
    const wx = inp.moveX * rx - inp.moveZ * fx;
    const wz = inp.moveX * rz - inp.moveZ * fz;
    const mag = Math.hypot(wx, wz);

    // ---- dash meter ----
    const wasDashing = this.dashing;
    this.dashing = inp.dash && mag > 0.1 && this.dash > 0.08;
    /* ⚠ THE BOOST IS LATCHED ON THE RISING EDGE, NOT SAMPLED EVERY FRAME.
       Sampling it live was the obvious build and it measured 3.35x against a
       brief of 500%: the charge is being spent while the dash runs, so the
       multiplier decays from 5 towards 1 underneath the very dash it is
       supposed to be lengthening, and the achieved figure is the AVERAGE of
       that decay rather than its peak. Latching also plays better — the dash
       you started is the dash you get, with no mid-dash sag to explain. */
    if (this.dashing && !wasDashing) {
      this._dashBoost = this.superDash ? 1 + TUNING.superDashMax * this.superCharge : 1;
    }
    const boost = this.dashing ? this._dashBoost : 1;
    if (this.dashing) {
      this.dash = clamp(this.dash - (TUNING.dashDrain / boost) * dt, 0, 1);
      if (this.superDash) {
        this.superCharge = clamp(this.superCharge - TUNING.superSpend * dt, 0, 1);
      }
    } else {
      this.dash = clamp(this.dash + TUNING.dashRecover * dt, 0, 1);
      if (this.superDash) {
        this.superCharge = clamp(this.superCharge + TUNING.superChargeRate * dt, 0, 1);
      }
    }

    /* ---- THE INPUT MAGNITUDE IS A THROTTLE ----

       It did not used to be. `mag` was computed, used to normalise the
       direction and to gate the dash, and then thrown away: `speedCap` was
       `base` regardless, so ANY live input accelerated to full speed. On a
       keyboard that is correct and invisible — W is a switch and `readMove`
       normalises, so `mag` is exactly 1 whenever it is not 0.

       On a phone it meant the tilt sensor was a switch. `Touch.read()` computes
       a careful proportional value from the angle and this function discarded
       it one call later, which is exactly what the player reported as "it feels
       very on/off". `tools/test-tiltcurve.mjs` shows it: a 0.11 input produced
       100.0% of top speed, same as a 1.00 input.

       Scaling the CAP rather than the acceleration is deliberate. Scaling
       acceleration would make a gentle tilt mean "get there slowly" and it
       would still end up at full speed; scaling the cap means a gentle tilt is
       a genuine slow-speed command, reached just as briskly. Ease off and
       `along > speedCap` sheds the excess at the braking rate, so it behaves
       like a throttle in both directions. */
    /* Snapped at the top, not just clamped. `Math.hypot(cos h, sin h)` — which
       is exactly what the balance bot feeds, and what a keyboard diagonal
       produces — lands one ULP below 1 for about a quarter of all headings. A
       plain `Math.min(1, mag)` therefore multiplies the desktop speed cap by
       0.9999999999999998 rather than by 1, which is far too small to feel and
       just large enough that a 3000-step deterministic simulation is no longer
       bit-identical to the one the clear rates were measured on. Snapping makes
       "this change does not touch the keyboard game" exactly true instead of
       true to sixteen decimal places, and 99.9% of a tilt is full tilt anyway. */
    const throttle = mag > 0.999 ? 1 : mag;

    const base = topSpeedFor(D, this.stageStart, this.stageSpeed);
    const speedCap = base * (this.dashing ? TUNING.dashMul : 1) * throttle;
    // Heaviness by progress through THIS stage, so every stage starts nimble
    // and ends ponderous instead of the later ones opening already sluggish.
    const heavy = clamp(Math.log(D / this.stageStart) / Math.log(this.stageSpan), 0, 1);
    const lump = 1 / (1 + this.lumpy * 0.25);
    const accel = base * lerp(TUNING.accelMulSmall, TUNING.accelMulHuge, heavy)
      * (this.dashing ? 1.35 : 1) * lump;
    const brake = base * lerp(TUNING.brakeMulSmall, TUNING.brakeMulHuge, heavy) * lump;
    const turn = base * lerp(TUNING.turnMulSmall, TUNING.turnMulHuge, heavy) * lump;

    /* ---- steer the velocity ----
       Split into the component ALONG where you are pushing and the part
       perpendicular to it, and give each its own rate. That is what makes
       top speed exactly `speedCap` — it is a target the along-component
       walks toward, not an emergent balance between thrust and drag that
       some other constant can undercut. */
    if (mag > 0.001) {
      const dx = wx / mag, dz = wz / mag;
      const along = this.vel.x * dx + this.vel.z * dz;
      const perpX = this.vel.x - along * dx, perpZ = this.vel.z - along * dz;

      // Below the cap, accelerate; above it (you just let go of dash, or a
      // bounce flung you), shed the excess at the braking rate.
      const nextAlong = along < speedCap
        ? Math.min(speedCap, along + accel * dt)
        : Math.max(speedCap, along - brake * dt);

      // Sideways drift bleeds off at the turn rate. A big katamari holds its
      // old heading for a while, which is what refusing to corner feels like.
      const perp = Math.hypot(perpX, perpZ);
      const keep = perp > 1e-9 ? Math.max(0, perp - turn * dt) / perp : 0;

      this.vel.x = nextAlong * dx + perpX * keep;
      this.vel.z = nextAlong * dz + perpZ * keep;
    } else {
      // Hands off: coast to a stop at the braking rate. Linear, not
      // exponential, so "time to stop" is a real number (1 / brakeMul
      // seconds) rather than an asymptote that never quite arrives.
      const sp = Math.hypot(this.vel.x, this.vel.z);
      const keep = sp > 1e-9 ? Math.max(0, sp - brake * dt) / sp : 0;
      this.vel.x *= keep;
      this.vel.z *= keep;
    }

    if (Math.hypot(this.vel.x, this.vel.z) < base * 0.004) { this.vel.x = 0; this.vel.z = 0; }
    this.topSpeed = base;
    this.knockTimer = Math.max(0, (this.knockTimer || 0) - dt);

    // ---- integrate & resolve against the world ----
    world.moveKatamari(this, dt);

    // ---- rolling rotation ----
    const speed = Math.hypot(this.vel.x, this.vel.z);
    if (speed > 1e-5) {
      // Rolling without slipping: the contact point must be stationary, so
      //   omega x (-R * up) = -v   =>   omega = (v.z, 0, -v.x) / R
      // This had the sign the other way round, which spins the ball backwards
      // relative to travel — the top of the ball moving toward you while you
      // roll away. Sanity check without deriving anything: the TOP of the ball
      // must move the way you are going, twice as fast as the ball itself.
      // `npm run roll` pins it.
      const axis = _v1.set(this.vel.z, 0, -this.vel.x).normalize();
      const ang = (speed * dt) / Math.max(1e-4, R);
      _q1.setFromAxisAngle(axis, ang);
      this.spinner.quaternion.premultiply(_q1);
      this.rollDistance += speed * dt;
    }

    /* ---- lumpy bob ----
       Decay is proportional, not a flat trickle. `lumpy` is meant to be a
       transient "you just swallowed something big and awkward" wobble, and it
       divides accel, brake and turn — but at a flat 0.06/s it decayed roughly
       ten times slower than things arrive during real play, so it pinned at
       its 1.4 cap and became a permanent 26% tax on every control rate rather
       than a reaction to anything. Steady state now sits near 0.35 while you
       are eating steadily (a ~8% tax) and still spikes properly for one
       genuinely chunky mouthful. */
    this.lumpy = Math.max(0, this.lumpy - dt * (0.35 + this.lumpy * 0.55));
    this.wobble += speed / Math.max(1e-4, R) * dt;
    const bob = Math.sin(this.wobble * 2) * this.lumpy * R * 0.045;

    this.group.position.set(this.pos.x, this.pos.y + bob, this.pos.z);
    this.justGrewTimer = Math.max(0, this.justGrewTimer - dt);

    this.speed = speed;
    this.speedFrac = clamp(speed / Math.max(1e-4, base), 0, 2);
  }
}
