/* ============================================================
   Ground dressing shared by the stages.

   v1 built every surface as one flat quad per colour: a road was a
   grey rectangle, a lawn a green one. At a distance that reads as a
   map, not a place. These helpers lay the small repeated detail that
   makes a surface read as a material — slabs with joints, mowing
   stripes, zebra crossings, patched asphalt — and they do it with
   the terrain builder's own quads and boxes, so it all merges into
   the one static terrain mesh and costs draw calls nothing.

   ⚠ NEVER THE STAGE RNG. Placement is a pure function of the stage
   seed (tools/placement-hash.mjs checks it), and every `r()` call
   added here would shift every prop placed after it. All variation
   below comes from `hash2`, a pure function of integer coordinates.

   ⚠ HEIGHTS. Large coplanar quads z-fight across their whole overlap
   at distance even with the log depth buffer, so every layer here
   sits a few millimetres above the one below it, and callers pass the
   surface height they are dressing.
   ============================================================ */

/** Pure hash of two integers to [0,1). */
export function hash2(a, b) {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Scale a hex colour's channels by k (k < 1 darkens). */
export function shade(hex, k) {
  const r = Math.min(255, Math.round(((hex >> 16) & 255) * k));
  const g = Math.min(255, Math.round(((hex >> 8) & 255) * k));
  const b = Math.min(255, Math.round((hex & 255) * k));
  return (r << 16) | (g << 8) | b;
}

/**
 * Square slabs with mortar joints over a rectangle. The joint colour is one
 * quad underneath; each slab is a quad on top, shrunk by the joint width, with
 * a small per-slab tone so the grid is not a printed pattern.
 */
export function paving(t, x0, z0, x1, z1, y, o = {}) {
  const tile = o.tile ?? 1.2, joint = o.joint ?? 0.035;
  const col = o.col, jcol = o.jointCol ?? shade(col, 0.78);
  const vary = o.vary ?? 0.07, seed = o.seed ?? 0;
  const checker = o.checker ?? null;
  const lift = o.lift ?? 0.003;        // slab tops above the joint quad
  t.quad(x1 - x0, z1 - z0, jcol, { x: (x0 + x1) / 2, y, z: (z0 + z1) / 2 });
  const nx = Math.max(1, Math.round((x1 - x0) / tile));
  const nz = Math.max(1, Math.round((z1 - z0) / tile));
  const tx = (x1 - x0) / nx, tz = (z1 - z0) / nz;
  for (let i = 0; i < nx; i++) {
    for (let k = 0; k < nz; k++) {
      const h = hash2(i + seed * 131, k - seed * 71);
      const base = checker && (i + k) % 2 ? checker : col;
      const tone = 1 - vary + h * vary * 2;
      t.quad(tx - joint, tz - joint, shade(base, tone),
        { x: x0 + (i + 0.5) * tx, y: y + lift, z: z0 + (k + 0.5) * tz });
    }
  }
}

/**
 * A lawn with mowing stripes: alternating bands of two greens along one axis,
 * the way a mower leaves a front garden.
 */
export function lawn(t, x0, z0, x1, z1, y, o = {}) {
  const band = o.band ?? 1.8, col = o.col ?? 0x7dc242;
  const along = o.axis ?? 'x';
  const span = along === 'x' ? z1 - z0 : x1 - x0;
  const n = Math.max(1, Math.round(span / band));
  const b = span / n;
  for (let i = 0; i < n; i++) {
    const c = shade(col, i % 2 ? 0.9 : 1.0);
    if (along === 'x') t.quad(x1 - x0, b, c, { x: (x0 + x1) / 2, y, z: z0 + (i + 0.5) * b });
    else t.quad(b, z1 - z0, c, { x: x0 + (i + 0.5) * b, y, z: (z0 + z1) / 2 });
  }
}

/**
 * A patchwork of fields over a rectangle, the way farmland reads from the
 * air. The fields sit on one regular grid, so every boundary runs on a shared
 * line; the boundaries themselves (hedgerows, field margins, crevasses) are
 * the `jointCol` quad underneath, showing through the gap round each field.
 * Each field takes one of `cols` by hash, and a `rows` fraction of them are
 * ploughed: split into `bands` stripes of alternating tone along an axis that
 * is also chosen by hash.
 */
export function fields(t, x0, z0, x1, z1, y, o = {}) {
  const tile = o.tile ?? 100, joint = o.joint ?? tile * 0.06;
  const cols = o.cols, jcol = o.jointCol ?? shade(cols[0], 0.7);
  const vary = o.vary ?? 0.04, seed = o.seed ?? 0, lift = o.lift ?? 0.003;
  const rows = o.rows ?? 0.3, bands = o.bands ?? 4;
  t.quad(x1 - x0, z1 - z0, jcol, { x: (x0 + x1) / 2, y, z: (z0 + z1) / 2 });
  const nx = Math.max(1, Math.round((x1 - x0) / tile));
  const nz = Math.max(1, Math.round((z1 - z0) / tile));
  const tx = (x1 - x0) / nx, tz = (z1 - z0) / nz;
  const fw = tx - joint, fd = tz - joint;
  for (let i = 0; i < nx; i++) {
    for (let k = 0; k < nz; k++) {
      const a = i + seed * 131, b = k - seed * 71;
      const col = shade(cols[Math.floor(hash2(a, b) * cols.length)], 1 - vary + hash2(b, a) * vary * 2);
      const cx = x0 + (i + 0.5) * tx, cz = z0 + (k + 0.5) * tz;
      if (hash2(a + 7, b + 3) >= rows) {
        t.quad(fw, fd, col, { x: cx, y: y + lift, z: cz });
        continue;
      }
      const alongX = hash2(a + 5, b + 9) < 0.5;
      const span = alongX ? fd : fw, s = span / bands;
      for (let n = 0; n < bands; n++) {
        const c = shade(col, n % 2 ? 0.9 : 1.04), u = -span / 2 + (n + 0.5) * s;
        if (alongX) t.quad(fw, s, c, { x: cx, y: y + lift, z: cz + u });
        else t.quad(s, fd, c, { x: cx + u, y: y + lift, z: cz });
      }
    }
  }
}

/**
 * Zebra crossing across a road. (cx, cz) is the crossing's centre, `width` the
 * road width it spans, `axis` the direction TRAFFIC runs ('x' or 'z'); the
 * stripes run with the traffic and are laid side by side across the road.
 */
export function zebra(t, cx, cz, width, axis, y, o = {}) {
  const stripe = o.stripe ?? 0.5, gap = o.gap ?? 0.5, len = o.len ?? 3, col = o.col ?? 0xf1ead9;
  const n = Math.floor((width - 0.6) / (stripe + gap));
  const start = -((n - 1) * (stripe + gap)) / 2;
  for (let i = 0; i < n; i++) {
    const u = start + i * (stripe + gap);
    if (axis === 'z') t.quad(stripe, len, col, { x: cx + u, y, z: cz });
    else t.quad(len, stripe, col, { x: cx, y, z: cz + u });
  }
}
