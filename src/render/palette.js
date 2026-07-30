/* ============================================================
   A tight, deliberately toy-like palette. Every object in the
   game draws from this so the whole world reads as one set.
   Values are linear-ish sRGB hex consumed by THREE.Color.
   ============================================================ */

export const C = {
  // neutrals
  white:      0xfdfbf4,
  offwhite:   0xf1ead9,
  paper:      0xfaf3e0,
  lightgrey:  0xd6d2c8,
  grey:       0x9c9a94,
  darkgrey:   0x5f5d59,
  charcoal:   0x38363a,
  black:      0x211f26,

  // woods
  woodPale:   0xd9b380,
  wood:       0xb8834a,
  woodDark:   0x8a5a30,
  woodRed:    0x9c4a2f,
  bamboo:     0xc8c079,

  // metals
  steel:      0xbfc6cc,
  steelDark:  0x8a9299,
  gold:       0xf2c344,
  copper:     0xc9784a,
  chrome:     0xe3e8ec,

  // brights
  red:        0xe8544f,
  redDark:    0xb63a38,
  orange:     0xff8a3d,
  tangerine:  0xf2a13c,
  yellow:     0xffd93b,
  lemon:      0xf7ef8a,
  lime:       0xa8d84a,
  green:      0x5fae3c,
  greenDark:  0x3d7d2b,
  teal:       0x3fb8a2,
  cyan:       0x66d5e0,
  blue:       0x4a90d9,
  blueDark:   0x2c5f9e,
  navy:       0x28407a,
  indigo:     0x5560b0,
  purple:     0x8a5fc4,
  violet:     0x6b46c1,
  pink:       0xff8fb8,
  hotpink:    0xf05a92,
  magenta:    0xd44a9c,
  brown:      0x7a5240,
  tan:        0xd9ac74,
  cream:      0xf6e4bd,
  skin:       0xf0c8a0,
  skinDeep:   0xc98f63,
  skinTan:    0xdba97a,

  // world surfaces
  grass:      0x7dc242,
  grassDark:  0x5d9a30,
  tatami:     0xd7cf94,
  tatamiEdge: 0x3c5a33,
  floorWood:  0xc79b64,
  carpet:     0xc4726a,
  asphalt:    0x54545c,
  asphaltLt:  0x6a6a74,
  concrete:   0xb8b4aa,
  concreteD:  0x93908a,
  sand:       0xe6d5a8,
  water:      0x3f9fd4,
  waterDeep:  0x2a6fa8,
  brick:      0xb35c46,
  roofTile:   0x4a6b8a,
  roofRed:    0xa8483c,
  glass:      0x9fd8ea,
  glassDark:  0x6ba8c4,
  leaf:       0x4e9c3a,
  leafDark:   0x37732a,
  leafLime:   0x86c93f,
  trunk:      0x7a5a3a,
  trunkDark:  0x5c4028,
  cloud:      0xfdfdff,
  sky:        0x6fc6ee,
  skyHigh:    0x3f9fd8,
};

/** Slight per-instance colour jitter so a hundred identical props don't look stamped. */
export function jitterColor(hex, amount, rnd) {
  const r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255;
  const f = 1 + (rnd() - 0.5) * 2 * amount;
  const cl = (v) => Math.max(0, Math.min(255, Math.round(v * f)));
  return (cl(r) << 16) | (cl(g) << 8) | cl(b);
}

/** Named colour groups used for random variants of the same prop. */
export const SETS = {
  candy:    [C.red, C.yellow, C.lime, C.pink, C.cyan, C.orange, C.violet],
  plastic:  [C.red, C.blue, C.yellow, C.green, C.orange, C.pink, C.violet, C.teal],
  book:     [C.redDark, C.navy, C.greenDark, C.violet, C.brown, C.tangerine, C.teal],
  fabric:   [C.carpet, C.indigo, C.teal, C.tangerine, C.magenta, C.greenDark, C.brown],
  car:      [C.red, C.blue, C.white, C.charcoal, C.yellow, C.teal, C.orange, C.lightgrey],
  building: [C.concrete, C.offwhite, C.tan, C.lightgrey, C.brick, C.steelDark],
  fruit:    [C.red, C.orange, C.lemon, C.lime, C.magenta],
  shirt:    [C.blue, C.red, C.green, C.yellow, C.violet, C.white, C.teal, C.orange, C.pink],
  hair:     [C.black, C.brown, C.woodDark, C.charcoal, C.tangerine, C.gold],
};
