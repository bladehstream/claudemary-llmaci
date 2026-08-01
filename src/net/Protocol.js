/* ============================================================
   The wire format, and the only place hostile data is handled.

   ⚠ THE ONE RULE: NOTHING THAT ARRIVES OVER THE NETWORK MAY EVER
   REACH A STRING, A KEY, OR AN ALLOCATION SIZE.

   Every message is a fixed-arity binary record of clamped
   numbers. There are no strings on the wire, so nothing can be
   interpolated into markup. There are no object keys from the
   wire, so `__proto__` and `constructor` are not expressible —
   this is why the format is a DataView and not JSON.parse, which
   would put the attacker in charge of the key set. And no length
   is ever read from a message and used to size an array; the one
   variable-length message caps its count against a constant
   BEFORE allocating.

   The second rule, which the rest of the game enforces rather
   than this file: remote data is RENDER-ONLY. There is no PVP, so
   no remote value ever reaches `kat.step` or `world.resolve`. A
   peer sending nonsense produces a strange-looking ghost, not a
   corrupted simulation. That is a property of the architecture,
   not of this validator being clever — and it is the reason this
   file can afford to be simple.

   Numbers are quantised, which is not only about bandwidth: an
   int16 CANNOT be NaN or Infinity, so a whole class of poison
   values is unrepresentable rather than rejected. `Number.isFinite`
   still guards the dequantised results, because the stage bounds
   they are scaled against are read from local state and a future
   bug there should not become a rendering hang. (three.js does
   not frustum-cull NaN geometry — it returns true — so a single
   NaN ghost would redraw forever.)
   ============================================================ */

/** Bump when the format changes. A peer on a different version is refused. */
export const PROTOCOL_VERSION = 1;

export const MSG = {
  HELLO: 1,
  STATE: 2,
  PICKUP: 3,
  BYE: 4,
};

/** Longest legal message. Anything bigger is dropped without being parsed. */
export const MAX_MSG = 128;
/** Most prop indices one PICKUP may carry. Bounds the loop AND the allocation. */
export const MAX_PICKUP_BATCH = 24;

const HELLO_LEN = 8;
const STATE_LEN = 10;
const BYE_LEN = 1;

/* ------------------------------------------------------------
   Quantisation
   ------------------------------------------------------------ */

/** Map v in [lo,hi] onto a uint16. Out-of-range clamps rather than wraps. */
function q16(v, lo, hi) {
  const t = (v - lo) / (hi - lo || 1);
  return Math.max(0, Math.min(65535, Math.round(t * 65535)));
}
function dq16(u, lo, hi) {
  return lo + (u / 65535) * (hi - lo);
}

/**
 * Radius is quantised in LOG space.
 *
 * The stages span about forty orders of magnitude — 0.01 in the quantum realm
 * to 30,000 in the universe — so a linear 16-bit radius would put every atom in
 * the same bucket. Log space gives constant RELATIVE precision instead, which
 * is what the eye actually judges a ball's size by.
 */
const R_MIN = 1e-4, R_MAX = 1e6;
const LR_MIN = Math.log(R_MIN), LR_SPAN = Math.log(R_MAX) - LR_MIN;
function qRadius(r) {
  const lr = Math.log(Math.max(R_MIN, Math.min(R_MAX, r)));
  return Math.max(0, Math.min(65535, Math.round(((lr - LR_MIN) / LR_SPAN) * 65535)));
}
function dqRadius(u) {
  return Math.exp(LR_MIN + (u / 65535) * LR_SPAN);
}

/* ------------------------------------------------------------
   Encode
   ------------------------------------------------------------ */

export function encodeHello(stageHash, colour) {
  const b = new DataView(new ArrayBuffer(HELLO_LEN));
  b.setUint8(0, MSG.HELLO);
  b.setUint8(1, PROTOCOL_VERSION);
  b.setUint32(2, stageHash >>> 0);
  b.setUint8(6, colour & 0xff);
  b.setUint8(7, 0);                       // reserved, must be 0
  return b.buffer;
}

/**
 * @param {object} bounds the stage's own {minX,maxX,minZ,maxZ}; y is derived.
 */
export function encodeState(pos, radius, bounds) {
  const b = new DataView(new ArrayBuffer(STATE_LEN));
  b.setUint8(0, MSG.STATE);
  b.setUint8(1, 0);                       // reserved
  b.setUint16(2, q16(pos.x, bounds.minX, bounds.maxX));
  b.setUint16(4, q16(pos.y, bounds.minY, bounds.maxY));
  b.setUint16(6, q16(pos.z, bounds.minZ, bounds.maxZ));
  b.setUint16(8, qRadius(radius));
  return b.buffer;
}

export function encodePickup(indices) {
  const n = Math.min(indices.length, MAX_PICKUP_BATCH);
  const b = new DataView(new ArrayBuffer(2 + n * 2));
  b.setUint8(0, MSG.PICKUP);
  b.setUint8(1, n);
  for (let i = 0; i < n; i++) b.setUint16(2 + i * 2, indices[i] & 0xffff);
  return b.buffer;
}

export function encodeBye() {
  const b = new DataView(new ArrayBuffer(BYE_LEN));
  b.setUint8(0, MSG.BYE);
  return b.buffer;
}

/* ------------------------------------------------------------
   Decode — the hostile boundary
   ------------------------------------------------------------ */

/**
 * Parse one inbound message.
 *
 * Returns a plain object with a known shape, or `null`. **Null means drop the
 * message**, and the caller counts nulls: a peer producing them is either
 * broken or probing, and either way the connection should not survive many.
 *
 * Every branch checks the EXACT byte length first. A message that is one byte
 * short is not truncated data to be salvaged, it is a message from something
 * that is not this game.
 *
 * @param {ArrayBuffer} buf
 * @param {object} ctx {bounds, propCount} — local, trusted, never from the wire.
 */
export function decode(buf, ctx) {
  if (!(buf instanceof ArrayBuffer)) return null;
  if (buf.byteLength < 1 || buf.byteLength > MAX_MSG) return null;
  const b = new DataView(buf);
  const type = b.getUint8(0);

  switch (type) {
    case MSG.HELLO: {
      if (buf.byteLength !== HELLO_LEN) return null;
      const version = b.getUint8(1);
      if (version !== PROTOCOL_VERSION) return { type: MSG.HELLO, bad: 'version', version };
      return {
        type: MSG.HELLO,
        version,
        stageHash: b.getUint32(2) >>> 0,
        colour: b.getUint8(6) & 0xff,
      };
    }

    case MSG.STATE: {
      if (buf.byteLength !== STATE_LEN) return null;
      const bo = ctx.bounds;
      if (!bo) return null;
      const x = dq16(b.getUint16(2), bo.minX, bo.maxX);
      const y = dq16(b.getUint16(4), bo.minY, bo.maxY);
      const z = dq16(b.getUint16(6), bo.minZ, bo.maxZ);
      const radius = dqRadius(b.getUint16(8));
      /* Belt and braces. A uint16 cannot be NaN, so this can only fire if the
         LOCAL bounds are broken — but a NaN reaching a three.js transform is a
         permanent per-frame redraw (Frustum.intersectsObject returns true for
         NaN), and that is a bad way to find out about it. */
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)
        || !Number.isFinite(radius) || radius <= 0) return null;
      return { type: MSG.STATE, x, y, z, radius };
    }

    case MSG.PICKUP: {
      if (buf.byteLength < 2) return null;
      const n = b.getUint8(1);
      /* THE COUNT IS CHECKED AGAINST A CONSTANT AND AGAINST THE ACTUAL LENGTH
         BEFORE ANYTHING IS ALLOCATED. A wire-supplied length must never size an
         allocation, and must never be trusted to match the bytes that follow. */
      if (n === 0 || n > MAX_PICKUP_BATCH) return null;
      if (buf.byteLength !== 2 + n * 2) return null;
      const max = ctx.propCount | 0;
      const idx = [];
      for (let i = 0; i < n; i++) {
        const v = b.getUint16(2 + i * 2);
        // Out of range for THIS world: drop the index, keep the message. A
        // stale index from a peer on another stage is a mistake, not an attack.
        if (v < max) idx.push(v);
      }
      return idx.length ? { type: MSG.PICKUP, idx } : null;
    }

    case MSG.BYE:
      return buf.byteLength === BYE_LEN ? { type: MSG.BYE } : null;

    default:
      return null;
  }
}

/**
 * A stable 32-bit hash of the thing both peers must agree on.
 *
 * Not security — it is a mismatch detector. Two peers on different stages, or
 * on different builds with a different prop count, would otherwise trade prop
 * indices that mean different things on each side and quietly delete the wrong
 * scenery. Cheap to check once in HELLO, impossible to debug later.
 */
export function stageHash(stageId, propCount) {
  let h = 2166136261 >>> 0;                       // FNV-1a
  const s = `${stageId}:${propCount}:${PROTOCOL_VERSION}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}
