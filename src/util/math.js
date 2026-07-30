/* ============================================================
   Small math helpers used across the game.
   ============================================================ */

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

export function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
export function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function invLerp(a, b, v) { return b === a ? 0 : (v - a) / (b - a); }
export function smoothstep(t) { t = clamp01(t); return t * t * (3 - 2 * t); }
export function smootherstep(t) { t = clamp01(t); return t * t * t * (t * (t * 6 - 15) + 10); }

/** Frame-rate independent exponential approach. `rate` = how much of the gap is closed per second. */
export function damp(current, target, rate, dt) {
  return lerp(current, target, 1 - Math.exp(-rate * dt));
}

/** Shortest signed angular difference from a to b, in radians. */
export function angleDelta(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

export function dampAngle(current, target, rate, dt) {
  return current + angleDelta(current, target) * (1 - Math.exp(-rate * dt));
}

/* ------------------------------------------------------------
   Deterministic PRNG (mulberry32) so stage layouts are stable.
   ------------------------------------------------------------ */
export function makeRng(seed) {
  let a = seed >>> 0;
  const rng = function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rng.range = (lo, hi) => lo + rng() * (hi - lo);
  rng.int = (lo, hi) => Math.floor(lo + rng() * (hi - lo + 1));
  rng.pick = (arr) => arr[Math.floor(rng() * arr.length) % arr.length];
  rng.chance = (p) => rng() < p;
  rng.sign = () => (rng() < 0.5 ? -1 : 1);
  /** Weighted pick: items is [{w, ...}] */
  rng.weighted = (items, weightFn = (o) => o.w) => {
    let total = 0;
    for (const it of items) total += weightFn(it);
    let r = rng() * total;
    for (const it of items) { r -= weightFn(it); if (r <= 0) return it; }
    return items[items.length - 1];
  };
  return rng;
}

/** Cube root that tolerates 0. */
export function cbrt(v) { return Math.cbrt(Math.max(0, v)); }

/** Volume of a sphere from radius, and back. */
export function sphereVolume(r) { return (4 / 3) * Math.PI * r * r * r; }
export function sphereRadius(v) { return cbrt((3 * v) / (4 * Math.PI)); }

/* ------------------------------------------------------------
   Size readouts, and the six-decade problem behind them.

   The game now runs from a hydrogen atom to a continent. Those
   are 22 orders of magnitude apart, and NOTHING inside the
   simulation is allowed to know that: the physics, the collision
   epsilons, the prop geometry and every tuning constant all stay
   in the same comfortable numeric band they were measured in.
   `stage.unit` says only what one world unit MEANS when it is
   printed. The atoms stage is authored at 0.1 -> 3.2 exactly like
   the house is authored at 0.05 -> 1.6; it just reads in
   nanometres.

   Doing it the other way round — authoring in true metres — looks
   purer and breaks immediately. `buildCatalog` clamps every prop
   dimension with `Math.max(1e-4, ...)`, so an atom 1e-10m across
   would come out a million times too big; the climb gate compares
   a rise against a literal 1e-4; the velocity cutoff, the part
   epsilon and the broadphase cell all carry absolute numbers.
   Every one of those would need auditing, and a missed one fails
   silently as "the physics feels wrong on that stage".
   ------------------------------------------------------------ */

/**
 * Tiers per unit system: [suffix, size in WORLD UNITS], largest first.
 * The last entry is the resolution the readout rounds to.
 *
 * Exported so `tools/test-stages.mjs` can derive its unit-readout assertion from
 * this table instead of restating it. It had its own hard-coded copy covering
 * four of the ten ladders, and adding the cosmic stages crashed the harness on
 * an undefined lookup rather than failing a check — a test that has to be edited
 * every time a unit is added is a test that will be wrong.
 */
export const TIERS = {
  /** 1 world unit = 1 metre. The house, the town, the city. */
  metric: [['m', 1], ['cm', 0.01], ['mm', 0.001]],
  /** 1 world unit = 1 nanometre. Ångströms sit between nm and pm exactly
   *  as centimetres sit between metres and millimetres. */
  atomic: [['nm', 1], ['Å', 0.1], ['pm', 0.001]],
  /** 1 world unit = 1 micrometre. */
  micron: [['µm', 1], ['nm', 0.001]],
  /** 1 world unit = 1 kilometre. One tier: at this scale nobody wants the
   *  metres, and "Mm" reads as millimetres to most eyes. */
  geo: [['km', 1]],
  /** 1 world unit = 1 femtometre. Attometres below it, so a proton reads 1fm700am. */
  femto: [['fm', 1], ['am', 0.001]],
  /** 1 world unit = 1 megametre (1000km). Earth is 12Mm742km across. */
  mega: [['Mm', 1], ['km', 0.001]],
  /**
   * 1 world unit = 250km, printed in kilometres. For the world stage, whose whole
   * job is "start able to swallow a city, finish the size of the planet".
   *
   * The ratio is picked so the stage's GOAL is Earth: 51.2 units × 250 = 12,800km
   * against a real 12,742km, which is 0.45% out and reads as exactly right. The
   * numeric band (1.6 -> 51.2) and the map size are untouched by this — it is
   * only what the numbers MEAN when printed, same as every other tier here.
   *
   * Why not `mega`, which also prints km: at 1 unit = 1,000km the stage would
   * start at 1,600km and top out at four Earths, so a mountain would be a
   * thousandth of the starting ball and a waterfall would round to nothing. The
   * props at the bottom of the ladder have to be things a player recognises, and
   * at 250km/unit the smallest of them land at 25-40km — a city, a massif, a
   * gorge. One tier, no sub-kilometre part, because nothing at this scale wants
   * metres.
   */
  planet: [['km', 0.004]],
  /** 1 world unit = 1 gigametre (a million km). The Sun is 1Gm392Mm across. */
  giga: [['Gm', 1], ['Mm', 0.001]],
  /** 1 world unit = 1 light year. */
  light: [['ly', 1]],
  /** 1 world unit = 1 megaparsec. The observable universe is ~28,500Mpc across. */
  cosmic: [['Mpc', 1]],
};

/** Digit grouping, because "1600km" and "1,600km" do not read the same. */
function group(n) {
  return n >= 10000 ? n.toLocaleString('en-GB') : String(n);
}

function split(value, unit) {
  const tiers = TIERS[unit] || TIERS.metric;
  const small = tiers[tiers.length - 1][1];
  let total = Math.max(0, Math.round(value / small));
  const out = [];
  for (const [name, size] of tiers) {
    const step = Math.round(size / small);
    const n = Math.floor(total / step);
    total -= n * step;
    out.push([n, name]);
  }
  return out;
}

/**
 * Full readout: 12m34cm5mm, 3nm2Å40pm, 1µm600nm, 1,600km.
 * Drops leading zero tiers, always keeps the smallest one.
 */
export function formatSize(value, unit = 'metric') {
  const parts = split(value, unit);
  let s = '', started = false;
  for (let i = 0; i < parts.length; i++) {
    const [n, name] = parts[i];
    if (n > 0) started = true;
    if (started || i === parts.length - 1) s += `${group(n)}${name}`;
  }
  return s;
}

/** Compact size used on cards: "1m50cm" / "12cm" / "3nm2Å" / "1,600km" */
export function formatSizeShort(value, unit = 'metric') {
  const parts = split(value, unit);
  const first = parts.findIndex(([n]) => n > 0);
  if (first < 0) return `0${parts[parts.length - 1][1]}`;
  let s = `${group(parts[first][0])}${parts[first][1]}`;
  const next = parts[first + 1];
  if (next && next[0] > 0) s += `${group(next[0])}${next[1]}`;
  return s;
}

export function formatTime(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}
