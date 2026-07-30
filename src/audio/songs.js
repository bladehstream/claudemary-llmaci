/* ============================================================
   Original compositions. Nothing here is transcribed from
   anything — these are written for this game, in the idiom the
   original's soundtrack lives in: bossa/samba grooves, jazzy
   sevenths and ninths, brass punctuation, wordless scat.

   Steps are 16th notes. A bar is 16 steps.
   Notes are MIDI numbers.
   ============================================================ */

export const CHORDS = {
  maj7:  [0, 4, 7, 11],
  maj9:  [0, 4, 7, 11, 14],
  maj69: [0, 4, 7, 9, 14],
  m7:    [0, 3, 7, 10],
  m9:    [0, 3, 7, 10, 14],
  m6:    [0, 3, 7, 9],
  m11:   [0, 3, 7, 10, 17],
  dom7:  [0, 4, 7, 10],
  dom9:  [0, 4, 7, 10, 14],
  dom13: [0, 4, 7, 10, 21],
  alt:   [0, 4, 8, 10, 13],
  sus:   [0, 5, 7, 10],
  m7b5:  [0, 3, 6, 10],
  dim7:  [0, 3, 6, 9],
};

/* ------------------------------------------------------------
   Drum grids — 32 steps (two bars). Values are velocities.
   ------------------------------------------------------------ */

function grid(pairs) {
  const a = new Float32Array(32);
  for (const [i, v] of pairs) a[i] = v;
  return a;
}

function every(n, v, accentEvery = 0, accentV = 0) {
  const a = new Float32Array(32);
  for (let i = 0; i < 32; i += n) {
    a[i] = accentEvery && i % accentEvery === 0 ? accentV : v;
  }
  return a;
}

export const KITS = {
  bossa: {
    kick:   grid([[0, 1.0], [6, 0.5], [8, 0.78], [14, 0.45], [16, 1.0], [22, 0.5], [24, 0.78], [30, 0.45]]),
    rim:    grid([[0, 0.85], [3, 0.7], [6, 0.8], [10, 0.65], [18, 0.8], [22, 0.72]]),
    hat:    every(4, 0.1),
    shaker: every(2, 0.075, 8, 0.13),
    snare:  grid([]),
    tom:    grid([]),
  },
  samba: {
    kick:   grid([[0, 1.0], [4, 0.4], [6, 0.7], [8, 0.55], [12, 0.85], [14, 0.4],
                  [16, 1.0], [20, 0.4], [22, 0.7], [24, 0.55], [28, 0.85], [30, 0.4]]),
    rim:    grid([[2, 0.5], [5, 0.65], [7, 0.4], [10, 0.62], [13, 0.45], [15, 0.55],
                  [18, 0.5], [21, 0.65], [23, 0.4], [26, 0.62], [29, 0.45], [31, 0.55]]),
    hat:    every(2, 0.09, 8, 0.16),
    shaker: every(1, 0.05, 4, 0.11),
    snare:  grid([[12, 0.28], [28, 0.32]]),
    tom:    grid([[30, 0.24]]),
  },
  drive: {
    kick:   grid([[0, 1.0], [7, 0.62], [10, 0.8], [16, 1.0], [23, 0.62], [26, 0.8], [29, 0.5]]),
    rim:    grid([[4, 0.5], [12, 0.5], [20, 0.5], [28, 0.5]]),
    snare:  grid([[8, 0.42], [24, 0.42], [30, 0.2]]),
    hat:    every(2, 0.11, 4, 0.18),
    shaker: every(2, 0.05),
    tom:    grid([[14, 0.26], [15, 0.3]]),
  },
  /* Sparse, wide, mallet-ish. For a stage where the whole world is a few
     nanometres across and nothing has any business being loud. */
  quantum: {
    kick:   grid([[0, 0.7], [12, 0.4], [16, 0.7], [26, 0.42]]),
    rim:    grid([[7, 0.5], [15, 0.35], [23, 0.5], [31, 0.3]]),
    hat:    every(8, 0.09),
    shaker: every(3, 0.045, 12, 0.1),
    snare:  grid([]),
    tom:    grid([[14, 0.2], [30, 0.24]]),
  },
  /* Wet and wriggly — a bossa with the accents pushed off the beat, because
     everything on that stage is swimming. */
  culture: {
    kick:   grid([[0, 0.95], [7, 0.45], [10, 0.6], [16, 0.95], [22, 0.5], [26, 0.55]]),
    rim:    grid([[3, 0.6], [6, 0.5], [11, 0.62], [14, 0.4], [19, 0.6], [27, 0.55], [30, 0.45]]),
    hat:    every(2, 0.085, 8, 0.15),
    shaker: every(1, 0.045, 6, 0.1),
    snare:  grid([[13, 0.24]]),
    tom:    grid([[23, 0.22], [31, 0.26]]),
  },
  /* The finale. Everything on the floor, four to the bar underneath it.
     Written for the country stage when that was the last one; the universe
     stage inherited it when the cosmic stages were added, because this is
     already the "we are ending now" groove and a second one would only be a
     weaker copy of it. */
  anthem: {
    kick:   grid([[0, 1.0], [8, 0.9], [16, 1.0], [24, 0.9], [30, 0.55]]),
    rim:    grid([[4, 0.55], [12, 0.55], [20, 0.55], [28, 0.55]]),
    snare:  grid([[8, 0.5], [24, 0.5], [26, 0.24], [31, 0.3]]),
    hat:    every(2, 0.12, 4, 0.2),
    shaker: every(2, 0.06),
    tom:    grid([[14, 0.3], [15, 0.34], [30, 0.32]]),
  },
  /* Half-time bossa with a surdo answering instead of a backbeat snare. The
     world stage wanted something warm and hymn-like that still moved, and
     nothing above did: `bossa` is the house theme's groove, `anthem` is
     four-to-the-floor (pompous, which is the one thing that stage must not be)
     and `drive` is a rock beat. So: one heavy kick a bar, the snare only on
     three, and a low tom where the fill would go. A planet turning once. */
  tide: {
    kick:   grid([[0, 1.0], [10, 0.6], [16, 1.0], [22, 0.45], [26, 0.6]]),
    rim:    grid([[3, 0.55], [6, 0.45], [11, 0.5], [19, 0.55], [24, 0.4], [30, 0.48]]),
    snare:  grid([[8, 0.3], [24, 0.34]]),
    hat:    every(4, 0.09, 8, 0.15),
    shaker: every(2, 0.055, 8, 0.11),
    tom:    grid([[14, 0.3], [28, 0.26], [31, 0.3]]),
  },
  /* A lope: 3+3+2 eighths, so the bar never divides evenly into four. Every
     other kit here is duple and lands on beat three; the solar system is
     supposed to float rather than march, and a waltz cannot be spelled on a
     16-step grid, so the tresillo is the closest honest thing. */
  orbit: {
    kick:   grid([[0, 0.85], [6, 0.5], [12, 0.6], [16, 0.85], [22, 0.5], [28, 0.55]]),
    rim:    grid([[3, 0.5], [9, 0.45], [14, 0.4], [19, 0.5], [25, 0.45], [31, 0.38]]),
    hat:    every(6, 0.08, 12, 0.14),
    shaker: every(2, 0.05, 6, 0.1),
    snare:  grid([]),
    tom:    grid([[15, 0.24], [30, 0.28]]),
  },
  /* Three against four. The shaker runs in threes and the accent lands every
     nine steps, so it walks all the way round the bar before it comes back —
     which is the only way I found to make a fixed 16-step grid feel like it is
     rotating. Everything else here keeps honest time underneath it. */
  spiral: {
    kick:   grid([[0, 1.0], [6, 0.55], [8, 0.5], [12, 0.7], [16, 1.0], [22, 0.55], [26, 0.7], [29, 0.45]]),
    rim:    grid([[4, 0.5], [10, 0.45], [14, 0.55], [20, 0.5], [24, 0.45], [30, 0.55]]),
    snare:  grid([[8, 0.34], [24, 0.34], [31, 0.22]]),
    hat:    every(2, 0.1, 8, 0.17),
    shaker: every(3, 0.06, 9, 0.12),
    tom:    grid([[13, 0.26], [15, 0.3], [27, 0.24]]),
  },
  lounge: {
    kick:   grid([[0, 0.75], [10, 0.45], [16, 0.75], [26, 0.45]]),
    rim:    grid([[6, 0.45], [22, 0.45]]),
    hat:    every(4, 0.07),
    shaker: every(4, 0.06),
    snare:  grid([]),
    tom:    grid([]),
  },
};

/* ------------------------------------------------------------
   The songs
   ------------------------------------------------------------ */

/** "Everything Sticks" — the house theme. F major, easy bossa. */
const houseSong = {
  id: 'house',
  name: 'Everything Sticks',
  bpm: 128,
  kit: 'bossa',
  bars: 8,
  bassOct: -24,
  prog: [
    [65, 'maj9'], [62, 'm9'], [67, 'm7'], [60, 'dom13'],
    [57, 'm7'], [62, 'dom9'], [67, 'm7'], [60, 'dom9'],
  ],
  melody: [
    [0, 72, 6], [6, 69, 2], [8, 74, 4], [12, 72, 4],
    [16, 74, 6], [22, 77, 2], [24, 76, 6],
    [32, 70, 4], [36, 74, 4], [40, 77, 5], [46, 74, 2],
    [48, 76, 7], [56, 72, 7],
    [64, 69, 4], [68, 72, 4], [72, 76, 5], [78, 74, 2],
    [80, 78, 5], [86, 74, 2], [88, 69, 7],
    [96, 70, 4], [100, 74, 4], [104, 79, 7],
    [112, 77, 4], [116, 76, 4], [120, 74, 3], [124, 72, 4],
  ],
  // Brass answers the melody in the gaps.
  brass: [
    [28, [65, 69, 72], 2], [30, [65, 69, 72], 2],
    [60, [62, 65, 69], 3],
    [92, [61, 64, 69], 2], [94, [62, 66, 69], 2],
    [126, [60, 64, 70], 2],
  ],
  scat: [
    [16, 74, 4, 0], [20, 72, 4, 3],
    [48, 76, 4, 0], [52, 74, 3, 1],
    [80, 78, 4, 0], [84, 76, 3, 3],
    [112, 77, 3, 0], [115, 76, 3, 2], [118, 74, 3, 3], [121, 72, 6, 0],
  ],
};

/** "Pavement Samba" — the town theme. B-flat major, busier. */
const townSong = {
  id: 'town',
  name: 'Pavement Samba',
  bpm: 140,
  kit: 'samba',
  bars: 8,
  bassOct: -24,
  prog: [
    [58, 'maj9'], [55, 'm7'], [60, 'm9'], [65, 'dom9'],
    [62, 'm7'], [55, 'dom13'], [60, 'm7'], [65, 'dom9'],
  ],
  melody: [
    [0, 65, 3], [3, 67, 3], [6, 70, 6], [12, 69, 4],
    [16, 67, 3], [19, 65, 3], [22, 62, 6], [28, 65, 4],
    [32, 63, 3], [35, 67, 3], [38, 70, 5], [44, 72, 4],
    [48, 74, 6], [54, 72, 2], [56, 70, 8],
    [64, 65, 3], [67, 69, 3], [70, 72, 6], [76, 74, 4],
    [80, 77, 4], [84, 74, 4], [88, 70, 8],
    [96, 63, 3], [99, 67, 3], [102, 70, 6], [108, 72, 4],
    [112, 72, 3], [115, 70, 3], [118, 69, 4], [122, 65, 6],
  ],
  brass: [
    [12, [58, 62, 65], 2], [14, [58, 62, 65], 2],
    [44, [60, 63, 67], 3],
    [76, [62, 65, 69], 2], [78, [62, 66, 70], 2],
    [108, [60, 63, 67], 2], [110, [59, 63, 68], 2],
    [124, [58, 62, 65], 4],
  ],
  scat: [
    [6, 70, 3, 0], [9, 69, 3, 2],
    [38, 70, 3, 0], [41, 72, 3, 3],
    [70, 72, 3, 0], [73, 74, 3, 1],
    [102, 70, 3, 0], [105, 72, 3, 3],
    [118, 69, 4, 0], [122, 65, 6, 4],
  ],
};

/** "The Whole Sky" — the city theme. D minor, big and forward-leaning. */
const citySong = {
  id: 'city',
  name: 'The Whole Sky',
  bpm: 148,
  kit: 'drive',
  bars: 8,
  bassOct: -24,
  prog: [
    [62, 'm9'], [62, 'm11'], [58, 'maj9'], [58, 'maj7'],
    [55, 'm7'], [57, 'alt'], [62, 'm9'], [57, 'dom13'],
  ],
  melody: [
    [0, 74, 4], [4, 77, 4], [8, 81, 6], [14, 79, 2],
    [16, 77, 4], [20, 74, 4], [24, 72, 8],
    [32, 70, 4], [36, 74, 4], [40, 77, 6], [46, 79, 2],
    [48, 81, 6], [54, 77, 2], [56, 74, 8],
    [64, 67, 4], [68, 70, 4], [72, 74, 6], [78, 72, 2],
    [80, 73, 4], [84, 76, 4], [88, 79, 8],
    [96, 81, 4], [100, 79, 4], [104, 77, 4], [108, 74, 4],
    [112, 73, 4], [116, 72, 4], [120, 69, 8],
  ],
  brass: [
    [0, [62, 65, 69], 3], [8, [62, 65, 69], 2],
    [28, [58, 62, 65], 4],
    [60, [58, 62, 65], 4],
    [88, [55, 58, 62], 3], [92, [57, 61, 67], 3],
    [112, [57, 61, 67], 3], [116, [57, 61, 67], 3], [120, [62, 65, 69], 8],
  ],
  scat: [
    [8, 81, 4, 0], [12, 79, 4, 3],
    [40, 77, 3, 0], [43, 79, 3, 1],
    [72, 74, 3, 0], [75, 72, 3, 2],
    [96, 81, 4, 0], [100, 79, 4, 3], [104, 77, 4, 1], [108, 74, 4, 4],
  ],
};


/** "Ground State" — the atom theme. E minor, wide open, almost nothing in it.
 *  The first stage of the game and the smallest thing in it, so the arrangement
 *  starts nearly empty and the melody is mostly space. Modal rather than
 *  functional: the bass barely moves and the colour comes from the extensions. */
const atomSong = {
  id: 'atom',
  name: 'Ground State',
  bpm: 112,
  kit: 'quantum',
  bars: 8,
  bassOct: -24,
  prog: [
    [64, 'm9'], [64, 'm11'], [69, 'm7'], [62, 'sus'],
    [60, 'maj9'], [59, 'm7'], [67, 'sus'], [64, 'm9'],
  ],
  melody: [
    [0, 76, 8], [10, 79, 6],
    [16, 83, 8], [26, 79, 4], [30, 76, 2],
    [32, 81, 6], [40, 76, 4], [44, 74, 4],
    [48, 74, 10], [60, 71, 4],
    [64, 72, 6], [72, 76, 4], [76, 79, 4],
    [80, 81, 8], [90, 78, 6],
    [96, 79, 4], [100, 76, 4], [104, 74, 8],
    [112, 71, 6], [120, 76, 8],
  ],
  brass: [
    [30, [64, 71, 74], 2],
    [62, [60, 64, 71], 4],
    [94, [59, 62, 69], 2],
    [124, [64, 71, 78], 4],
  ],
  scat: [
    [16, 83, 5, 0], [22, 79, 4, 4],
    [48, 74, 6, 0], [56, 76, 4, 2],
    [80, 81, 5, 0], [86, 78, 4, 3],
    [120, 76, 8, 4],
  ],
};

/** "Petri Dish" — the culture theme. C minor, squelchy, permanently off-beat.
 *  Bacteria divide on a clock, so the groove is strict; everything on top of it
 *  is late. Chromatic slides in the melody for the wriggling. */
const microbeSong = {
  id: 'microbe',
  name: 'Petri Dish',
  bpm: 132,
  kit: 'culture',
  bars: 8,
  bassOct: -24,
  prog: [
    [60, 'm9'], [65, 'm7'], [58, 'dom9'], [63, 'maj7'],
    [60, 'm7'], [67, 'm7b5'], [55, 'dom13'], [60, 'm6'],
  ],
  melody: [
    [0, 72, 3], [3, 75, 3], [6, 74, 2], [9, 75, 5],
    [16, 77, 3], [19, 75, 3], [22, 72, 6], [29, 70, 3],
    [32, 70, 3], [35, 72, 3], [38, 75, 5], [44, 77, 4],
    [48, 79, 4], [53, 77, 3], [56, 75, 8],
    [64, 72, 3], [67, 74, 3], [70, 75, 4], [75, 77, 5],
    [80, 78, 3], [83, 77, 3], [86, 74, 6],
    [96, 67, 3], [99, 70, 3], [102, 74, 6], [109, 72, 3],
    [112, 75, 3], [115, 74, 3], [118, 72, 4], [123, 68, 5],
  ],
  brass: [
    [12, [60, 63, 67], 2], [14, [60, 63, 67], 2],
    [44, [58, 62, 65], 3],
    [76, [60, 63, 70], 2], [78, [61, 64, 70], 2],
    [108, [55, 59, 65], 3],
    [124, [60, 63, 67], 4],
  ],
  scat: [
    [6, 74, 3, 2], [9, 75, 4, 0],
    [38, 75, 3, 0], [41, 77, 3, 3],
    [70, 75, 3, 1], [73, 77, 3, 0],
    [102, 74, 4, 0], [106, 72, 3, 4],
    [118, 72, 4, 0], [122, 68, 6, 2],
  ],
};

/** "The Whole Round World" — the finale. G major, four-to-the-floor, unashamed.
 *  Every other theme in the game is a bossa or a samba that leaves room; this
 *  one does not leave room. The melody climbs an octave and a half across the
 *  eight bars and the brass answers every phrase. */
const countrySong = {
  id: 'country',
  name: 'The Whole Round World',
  bpm: 152,
  kit: 'anthem',
  bars: 8,
  bassOct: -24,
  prog: [
    [55, 'maj9'], [62, 'm9'], [60, 'maj69'], [59, 'm7'],
    [57, 'm9'], [53, 'maj7'], [55, 'dom13'], [50, 'dom9'],
  ],
  melody: [
    [0, 74, 4], [4, 76, 4], [8, 79, 6], [14, 78, 2],
    [16, 76, 4], [20, 79, 4], [24, 81, 8],
    [32, 79, 4], [36, 76, 4], [40, 74, 6], [46, 76, 2],
    [48, 78, 6], [54, 76, 2], [56, 71, 8],
    [64, 76, 4], [68, 79, 4], [72, 83, 6], [78, 81, 2],
    [80, 79, 4], [84, 76, 4], [88, 74, 8],
    [96, 77, 4], [100, 81, 4], [104, 86, 8],
    [112, 84, 4], [116, 81, 4], [120, 79, 8],
  ],
  brass: [
    [0, [55, 59, 62], 4], [8, [55, 62, 67], 3],
    [28, [59, 62, 66], 4],
    [56, [53, 57, 60], 6],
    [88, [57, 60, 64], 4], [92, [53, 57, 62], 4],
    [104, [55, 59, 62], 4],
    [112, [50, 54, 57], 4], [116, [50, 54, 60], 4], [120, [55, 59, 67], 8],
  ],
  scat: [
    [8, 79, 4, 0], [12, 78, 4, 3],
    [40, 74, 4, 0], [44, 76, 4, 1],
    [72, 83, 4, 0], [76, 81, 4, 2],
    [104, 86, 4, 0], [108, 84, 4, 3], [112, 84, 4, 1], [116, 81, 4, 4],
  ],
};

/* ------------------------------------------------------------
   The five cosmic stages.

   These are 16 bars where everything above is 8. The outer stages run five to
   ten minutes and at these tempos an 8-bar loop comes back round every twenty
   seconds, which is fine for the house — you are busy — and starts to nag when
   the whole visible universe is drifting past. 16 bars buys a four-phrase form:
   statement, answer, somewhere else entirely, and a way home.

   They are also slower, wider and more harmonically ambitious than the house
   theme, but they are still bossas with sevenths on top. Scale is not an excuse
   for solemnity: the King is still the King.
   ------------------------------------------------------------ */

/** "Probably Here" — the quantum theme. A major, weightless, mostly air.
 *  Smaller than the atom stage, so it has to be emptier than "Ground State"
 *  without being a drone: the pulse is there, the melody just refuses to land
 *  on a downbeat. The harmony hovers on sus chords and slides a whole world
 *  away at bar 9 (bIII, bVII — the floor going out from under it) before a
 *  plain vi-ii-V-I walks it home. Nothing is solid until the last four bars. */
const quantumSong = {
  id: 'quantum',
  name: 'Probably Here',
  bpm: 100,
  kit: 'quantum',
  bars: 16,
  bassOct: -24,
  prog: [
    [57, 'maj9'], [59, 'sus'], [57, 'maj9'], [54, 'm11'],
    [62, 'maj9'], [61, 'm7'], [59, 'm9'], [64, 'sus'],
    [60, 'maj9'], [55, 'maj9'], [62, 'maj9'], [57, 'maj9'],
    [54, 'm9'], [59, 'm11'], [64, 'dom13'], [57, 'maj9'],
  ],
  melody: [
    [0, 76, 8], [10, 80, 5],
    [16, 81, 7], [26, 78, 4],
    [32, 76, 6], [40, 73, 3], [44, 71, 4],
    [48, 73, 10], [60, 78, 4],
    [64, 78, 6], [72, 81, 4], [76, 83, 4],
    [80, 85, 6], [88, 83, 4], [92, 80, 4],
    [96, 78, 6], [104, 74, 6],
    [112, 76, 5], [118, 74, 4], [122, 71, 6],
    [128, 79, 8], [138, 76, 5],
    [144, 78, 6], [152, 81, 6],
    [160, 81, 6], [168, 85, 6],
    [176, 88, 8], [186, 85, 5],
    [192, 81, 6], [200, 78, 4], [204, 76, 4],
    [208, 78, 6], [216, 74, 6],
    [224, 76, 4], [229, 80, 3], [233, 83, 5],
    [240, 81, 8], [250, 76, 6],
  ],
  // Eight stabs in sixteen bars. Any more and the foam has edges.
  brass: [
    [30, [59, 64, 66], 2],
    [62, [54, 61, 66], 3],
    [94, [61, 68, 71], 2],
    [126, [64, 69, 71], 3],
    [158, [55, 62, 66], 2],
    [190, [57, 64, 68], 4],
    [238, [64, 68, 74], 4],
    [252, [57, 64, 69], 4],
  ],
  scat: [
    [16, 81, 5, 4],
    [48, 73, 6, 0],
    [80, 85, 5, 0], [86, 83, 4, 3],
    [128, 79, 6, 4],
    [176, 85, 6, 0],
    [208, 78, 5, 2],
    [240, 81, 8, 4],
  ],
};

/** "Turn Once A Day" — the world theme. E-flat major, half-time and warm.
 *  Continents, then the whole planet, so the groove had to feel like one big
 *  slow rotation rather than a march: heavy kick on one, surdo where the fill
 *  goes. The harmony is deliberately plagal — IV lands in bar 2 before any
 *  dominant does, which is what makes it read as awe instead of triumph — and
 *  the bIII7 at bar 12 is the backdoor into the big arrival at 13. */
const worldSong = {
  id: 'world',
  name: 'Turn Once A Day',
  bpm: 108,
  kit: 'tide',
  bars: 16,
  bassOct: -24,
  prog: [
    [63, 'maj9'], [56, 'maj9'], [55, 'm7'], [60, 'm9'],
    [53, 'm9'], [58, 'dom13'], [63, 'maj69'], [60, 'm7'],
    [53, 'm11'], [58, 'sus'], [56, 'maj9'], [61, 'dom9'],
    [63, 'maj9'], [60, 'm9'], [53, 'm9'], [58, 'dom13'],
  ],
  melody: [
    [0, 75, 6], [8, 79, 4], [12, 77, 4],
    [16, 80, 8], [26, 75, 5],
    [32, 74, 4], [36, 77, 4], [40, 79, 6],
    [48, 82, 6], [56, 79, 7],
    [64, 80, 4], [68, 77, 4], [72, 75, 6],
    [80, 74, 4], [84, 77, 4], [88, 82, 7],
    [96, 84, 6], [104, 79, 8],
    [112, 82, 4], [116, 79, 4], [120, 75, 6],
    [128, 77, 8], [138, 80, 5],
    [144, 82, 6], [152, 80, 6],
    [160, 79, 4], [164, 75, 4], [168, 72, 7],
    [176, 75, 4], [180, 80, 4], [184, 83, 7],
    [192, 87, 8], [202, 82, 5],
    [208, 84, 6], [216, 79, 6],
    [224, 87, 4], [228, 84, 4], [232, 80, 6],
    [240, 77, 6], [248, 74, 4], [252, 75, 4],
  ],
  brass: [
    [12, [63, 67, 70], 3],
    [28, [56, 63, 68], 3],
    [44, [55, 62, 65], 3],
    [60, [60, 67, 70], 4],
    [92, [58, 65, 68], 4],
    [108, [63, 67, 72], 4],
    [140, [53, 60, 68], 3],
    [156, [58, 63, 68], 4],
    [172, [56, 63, 67], 3],
    [186, [61, 65, 71], 5],
    [192, [63, 70, 75], 6],
    [220, [60, 67, 72], 4],
    [236, [53, 60, 65], 4],
    [248, [58, 65, 70], 6],
  ],
  scat: [
    [16, 80, 5, 3], [24, 77, 5, 4],
    [48, 82, 5, 0], [54, 79, 4, 4],
    [96, 84, 5, 0], [102, 79, 5, 3],
    [128, 77, 6, 4],
    [176, 80, 4, 1], [184, 83, 5, 0],
    [192, 87, 6, 0],
    [240, 77, 5, 3], [248, 74, 5, 4],
  ],
};

/** "Pocketful of Planets" — the solar theme. D major, slow, loping, no drama.
 *  Planets are marbles at this scale and marbles roll, so the kit is a 3+3+2
 *  lope and the melody sits on those three accents. The whole thing hangs on
 *  the G# in bar 4 — the major seventh of A, held for a whole bar, which is the
 *  sound of not being in any hurry — and the last four bars are a plain
 *  circle-of-fifths descent, iii-vi-ii-V, so it does eventually get somewhere. */
const solarSong = {
  id: 'solar',
  name: 'Pocketful of Planets',
  bpm: 88,
  kit: 'orbit',
  bars: 16,
  bassOct: -24,
  prog: [
    [62, 'maj9'], [59, 'm9'], [55, 'maj9'], [57, 'maj9'],
    [54, 'm9'], [59, 'm11'], [64, 'maj9'], [57, 'sus'],
    [62, 'maj9'], [60, 'maj9'], [55, 'maj69'], [64, 'm9'],
    [54, 'm7'], [59, 'm9'], [64, 'm9'], [57, 'dom13'],
  ],
  melody: [
    [0, 78, 6], [6, 81, 6], [12, 85, 4],
    [16, 86, 10], [28, 83, 4],
    [32, 86, 6], [38, 83, 6], [44, 79, 4],
    [48, 80, 12],
    [64, 76, 6], [70, 78, 6], [76, 81, 4],
    [80, 83, 10], [92, 86, 4],
    [96, 88, 6], [102, 87, 6], [108, 83, 4],
    [112, 86, 6], [118, 81, 6], [124, 79, 4],
    [128, 78, 6], [134, 74, 6], [140, 76, 4],
    [144, 79, 6], [150, 76, 6], [156, 74, 4],
    [160, 74, 6], [166, 79, 6], [172, 83, 4],
    [176, 86, 10], [188, 83, 4],
    [192, 85, 6], [198, 81, 6], [204, 78, 4],
    [208, 83, 6], [214, 86, 6], [220, 85, 4],
    [224, 88, 6], [230, 86, 6], [236, 83, 4],
    [240, 85, 6], [246, 81, 6], [252, 78, 4],
  ],
  brass: [
    [12, [62, 66, 69], 4],
    [28, [59, 66, 69], 4],
    [44, [55, 62, 67], 4],
    [76, [54, 61, 66], 4],
    [108, [64, 68, 71], 6],
    [124, [57, 62, 64], 4],
    [156, [60, 64, 67], 4],
    [172, [55, 62, 64], 4],
    [188, [64, 71, 74], 4],
    [204, [54, 61, 64], 4],
    [236, [64, 71, 74], 4],
    [246, [57, 61, 67], 6],
  ],
  scat: [
    [16, 86, 8, 4],
    [64, 76, 6, 3],
    [96, 88, 6, 0], [102, 87, 5, 2],
    [128, 78, 6, 4],
    [176, 86, 8, 0],
    [208, 83, 6, 0], [214, 86, 6, 3],
    [240, 85, 6, 1], [246, 81, 8, 4],
  ],
};

/** "The Long Way Round" — the galaxy theme. G minor, fast, always turning.
 *  Named for the two hundred million years it takes the Sun to get back where
 *  it started. The scheduler only reads one chord per bar, so "faster harmonic
 *  rhythm" is bought two ways: the tempo, and a progression that never repeats
 *  a chord two bars running, with the melody spelling the next bar's colour
 *  before the bass gets there. Bars 5-10 swing out into the relative major —
 *  that is the spiral arm — and the ii-V-i at 14-16 hauls it back in. */
const galaxySong = {
  id: 'galaxy',
  name: 'The Long Way Round',
  bpm: 144,
  kit: 'spiral',
  bars: 16,
  bassOct: -24,
  prog: [
    [55, 'm9'], [60, 'm9'], [62, 'dom9'], [55, 'm9'],
    [63, 'maj9'], [65, 'dom13'], [58, 'maj9'], [60, 'm11'],
    [65, 'dom9'], [58, 'maj69'], [55, 'm11'], [62, 'dom13'],
    [55, 'm9'], [60, 'm9'], [62, 'alt'], [55, 'm6'],
  ],
  melody: [
    [0, 74, 4], [4, 77, 3], [7, 79, 5], [12, 82, 4],
    [16, 84, 6], [22, 82, 4], [26, 79, 6],
    [32, 78, 4], [36, 81, 4], [40, 84, 3], [43, 86, 5],
    [48, 86, 6], [54, 82, 4], [58, 79, 6],
    [64, 82, 4], [68, 86, 4], [72, 87, 4], [76, 86, 4],
    [80, 84, 4], [84, 81, 4], [88, 86, 6],
    [96, 82, 4], [100, 86, 4], [104, 84, 8],
    [112, 87, 4], [116, 82, 4], [120, 79, 8],
    [128, 81, 4], [132, 84, 4], [136, 87, 3], [139, 84, 5],
    [144, 86, 6], [150, 82, 4], [154, 84, 6],
    [160, 82, 4], [164, 79, 4], [168, 77, 4], [172, 74, 4],
    [176, 74, 4], [180, 78, 4], [184, 81, 3], [187, 84, 5],
    [192, 86, 6], [198, 82, 4], [202, 79, 6],
    [208, 82, 4], [212, 84, 4], [216, 87, 6],
    [224, 87, 4], [228, 84, 4], [232, 82, 3], [235, 78, 5],
    [240, 79, 6], [246, 82, 4], [250, 86, 6],
  ],
  brass: [
    [12, [55, 62, 70], 3],
    [26, [60, 67, 75], 3],
    [43, [62, 66, 72], 5],
    [58, [55, 62, 67], 4],
    [76, [63, 67, 70], 4],
    [88, [65, 69, 72], 4],
    [104, [58, 62, 69], 6],
    [120, [60, 67, 72], 6],
    [136, [65, 69, 75], 4],
    [150, [58, 62, 67], 6],
    [168, [55, 62, 72], 4],
    [184, [62, 66, 71], 4],
    [198, [55, 62, 70], 4],
    [216, [60, 67, 75], 6],
    [232, [62, 70, 75], 4],
    [246, [55, 64, 70], 6],
  ],
  scat: [
    [16, 84, 5, 0], [22, 82, 4, 3],
    [48, 86, 5, 0], [54, 82, 4, 4],
    [96, 82, 4, 3], [104, 84, 8, 0],
    [144, 86, 5, 0], [150, 82, 4, 2],
    [192, 86, 5, 0], [198, 82, 4, 3],
    [240, 79, 5, 4], [250, 86, 6, 0],
  ],
};

/** "Nothing Left Over" — the universe theme, and the end of the game.
 *  A-flat major, but it spends its first eight bars in the relative minor and
 *  only opens the door at bar 9: that is the whole shape, gathering then
 *  blossoming, and it re-does it every loop so the arrangement has somewhere to
 *  go however long you take. The melody lives an octave lower in the first half
 *  than the second on purpose. Bar 14 is the biggest bar in the soundtrack —
 *  Ab6/9, brass twice, the top E-flat held for most of it — and then bars 15-16
 *  turn it round on iv-V7alt so the ending never quite finishes.
 *
 *  Reuses the `anthem` kit that the country stage introduced. Same key family
 *  too: the world theme is in E-flat, which is this one's dominant, so the two
 *  ends of the cosmic run resolve into each other if you play them back to back.
 *  That was luck, noticed afterwards, and then kept. */
const universeSong = {
  id: 'universe',
  name: 'Nothing Left Over',
  bpm: 128,
  kit: 'anthem',
  bars: 16,
  bassOct: -24,
  prog: [
    [53, 'm9'], [61, 'maj9'], [58, 'm11'], [63, 'dom13'],
    [56, 'maj9'], [53, 'm11'], [61, 'maj9'], [63, 'sus'],
    [56, 'maj9'], [60, 'm9'], [61, 'maj9'], [58, 'm9'],
    [63, 'dom13'], [56, 'maj69'], [58, 'm9'], [60, 'alt'],
  ],
  melody: [
    [0, 77, 6], [8, 75, 4], [12, 72, 4],
    [16, 80, 6], [24, 77, 8],
    [32, 73, 4], [36, 77, 4], [40, 80, 6],
    [48, 82, 6], [56, 79, 7],
    [64, 80, 6], [72, 75, 4], [76, 72, 4],
    [80, 70, 6], [88, 75, 7],
    [96, 77, 4], [100, 80, 4], [104, 85, 8],
    [112, 82, 6], [120, 80, 7],
    [128, 87, 8], [138, 84, 5],
    [144, 82, 6], [152, 87, 6],
    [160, 85, 4], [164, 80, 4], [168, 84, 7],
    [176, 82, 4], [180, 85, 4], [184, 80, 7],
    [192, 79, 4], [196, 82, 4], [200, 85, 3], [203, 87, 5],
    [208, 87, 10], [220, 84, 4],
    [224, 85, 6], [232, 82, 6],
    [240, 82, 4], [244, 85, 4], [248, 80, 4], [252, 76, 4],
  ],
  brass: [
    [0, [53, 60, 65], 4], [12, [56, 60, 68], 4],
    [28, [61, 65, 68], 4],
    [44, [58, 61, 65], 4],
    [56, [63, 67, 70], 6],
    [72, [56, 63, 68], 4],
    [92, [53, 60, 63], 4],
    [108, [61, 65, 72], 6],
    [120, [63, 68, 70], 8],
    [128, [56, 63, 72], 8],
    [152, [60, 67, 75], 6],
    [168, [61, 65, 73], 6],
    [184, [58, 65, 68], 6],
    [200, [63, 67, 73], 4], [204, [63, 70, 75], 4],
    [208, [56, 63, 68], 8], [216, [56, 65, 72], 6],
    [232, [58, 65, 70], 4],
    [244, [60, 64, 70], 4], [248, [60, 68, 73], 6],
  ],
  scat: [
    [16, 80, 5, 3], [24, 77, 6, 4],
    [64, 80, 5, 0], [72, 75, 4, 2],
    [104, 85, 6, 0],
    [128, 87, 8, 0], [138, 84, 5, 3],
    [176, 82, 4, 1], [180, 85, 4, 0],
    [208, 87, 8, 0], [220, 84, 4, 4],
    [240, 82, 4, 2], [244, 85, 4, 0],
  ],
};

/** Title-screen vamp: slow, unhurried, plenty of space. */
const menuSong = {
  id: 'menu',
  name: 'Somewhere To Start',
  bpm: 104,
  kit: 'lounge',
  bars: 4,
  bassOct: -24,
  prog: [[60, 'maj9'], [57, 'm9'], [62, 'm9'], [55, 'dom13']],
  melody: [
    [0, 76, 6], [8, 74, 4], [12, 72, 4],
    [16, 72, 6], [24, 69, 6],
    [32, 74, 6], [40, 77, 4], [44, 76, 4],
    [48, 74, 8], [58, 71, 6],
  ],
  brass: [],
  scat: [[0, 76, 5, 0], [8, 74, 4, 3], [32, 74, 5, 0], [48, 74, 6, 4]],
};

/** Played once when the results panel opens. */
export const RESULTS_FANFARE = [
  [0, [65, 69, 72], 0.16], [0.16, [67, 71, 74], 0.16],
  [0.32, [69, 72, 77], 0.5], [0.86, [65, 72, 81], 0.9],
];

/* Keyed by stage id: `Game` calls `music.play(stage.id)` and nothing maps
   between the two, so a missing key is silent failure — `Music.play` returns
   early and whatever was already playing keeps going. That is exactly what the
   five cosmic stages did before they had songs of their own: you got the title
   vamp over the birth of the universe. Listed in stage order so a gap is
   obvious. */
export const SONGS = {
  quantum: quantumSong,
  atom: atomSong,
  microbe: microbeSong,
  house: houseSong,
  town: townSong,
  city: citySong,
  country: countrySong,
  world: worldSong,
  solar: solarSong,
  galaxy: galaxySong,
  universe: universeSong,
  menu: menuSong,
};
