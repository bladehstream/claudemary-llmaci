/* ============================================================
   Original compositions. Nothing here is transcribed from
   anything — these are written for this game, in the idiom the
   original's soundtrack lives in: bossa/samba grooves, jazzy
   sevenths and ninths, brass punctuation, wordless scat.

   Steps are 16th notes. A bar is 16 steps.
   Notes are MIDI numbers.

   ⚠ THE LADDER IS THE COMPOSITION. Eleven stages run from a
   quantum foam to the observable universe, and the brief for this
   rewrite was "as much audio difference between levels as
   possible, early ones fun, later ones contemplative". So these
   are laid out along an arc rather than written as twelve
   independent tunes:

     quantum  126bpm  fizz     tiny, ticking, curious
     atom     138     spring   bouncy, the most childlike thing here
     microbe  158     culture  wriggly, chromatic, comic. the fastest.
     house    128     bossa    the home theme — UNCHANGED, see below
     town     134     samba    festive, brass out front
     city     152     drive    the loudest. the peak.
     country  118     anthem   broad, warm, the turn begins
     world     94     tide     hymn. long notes, choir, air
     solar     76     orbit    floating, tresillo, almost no kit
     galaxy    64     drift    distant, bell-like, mostly silence
     universe  52     vast     immense. five notes in eight bars.
     menu     104     lounge   inviting — UNCHANGED

   ⚠ HOUSE AND MENU ARE DELIBERATELY UNCHANGED. Those two were
   rendered and approved by the player on the day this rewrite
   started; everything else is new. When you have one confirmed
   good data point you do not throw it away to make the set tidy,
   and if a later stage sounds wrong these are what it gets
   compared against.

   ⚠ MOST OF THE DIFFERENCE IS NOT IN THE NOTES. Tempo, which
   voice plays which role (`voices`), how much room it plays in
   (`space`), how long it holds (`sustain`) and how the form
   treats it (`form`) do more work than the melodies do. The same
   eight bars on a plucked guitar in a small room and on a
   wordless choir in a canyon are not the same music, and that is
   most of the range below.
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
  /* Added for the cosmic end of the ladder. A stack of fourths has no third in
     it, so it is neither major nor minor and it does not want to resolve —
     which is exactly what the last three stages need and which no seventh
     chord can give them. `sus2` and `add9` are the same trick with fewer
     notes, for the stages that still want a tonal centre. */
  quartal: [0, 5, 10, 15],
  quintal: [0, 7, 14, 21],
  sus2:    [0, 2, 7, 14],
  add9:    [0, 4, 7, 14],
  madd9:   [0, 3, 7, 14],
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
  /* THE FIRST STAGE, and the smallest thing in the game. A clock, not a
     groove: the kick is barely a kick, the hat runs in 16ths at a whisper, and
     the rim ticks off-centre so it never quite settles. Nothing here is
     allowed to sound like a drum kit in a room — it is a mechanism. */
  fizz: {
    kick:   grid([[0, 0.5], [11, 0.3], [16, 0.5], [22, 0.28], [27, 0.3]]),
    rim:    grid([[3, 0.4], [7, 0.28], [10, 0.42], [14, 0.24], [19, 0.4], [23, 0.3], [26, 0.42], [30, 0.26]]),
    hat:    every(1, 0.045, 4, 0.085),
    shaker: every(4, 0.05, 16, 0.09),
    snare:  grid([]),
    tom:    grid([[15, 0.16], [31, 0.18]]),
  },
  /* Bouncing. Kick on the one and the and-of-two, rim on the upbeats, a
     handclap-ish snare on the backbeat — as close to a playground as this
     synth gets, which is what the atom stage is for. */
  spring: {
    kick:   grid([[0, 0.95], [6, 0.5], [10, 0.7], [16, 0.95], [22, 0.5], [26, 0.7], [30, 0.4]]),
    rim:    grid([[2, 0.45], [6, 0.35], [14, 0.5], [18, 0.45], [22, 0.35], [30, 0.5]]),
    snare:  grid([[8, 0.36], [24, 0.36]]),
    hat:    every(2, 0.1, 8, 0.19),
    shaker: every(2, 0.06, 4, 0.12),
    tom:    grid([[13, 0.22], [29, 0.26]]),
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
  /* Broad and warm. Four on the floor was too pompous for the country stage
     once it stopped being the finale, so the kick keeps one and three and the
     snare answers on three only — a marching band that has slowed down to look
     at something. */
  anthem: {
    kick:   grid([[0, 1.0], [8, 0.72], [16, 1.0], [24, 0.72], [30, 0.4]]),
    rim:    grid([[4, 0.5], [12, 0.5], [20, 0.5], [28, 0.5]]),
    snare:  grid([[8, 0.4], [24, 0.4], [31, 0.22]]),
    hat:    every(4, 0.1, 8, 0.17),
    shaker: every(2, 0.055),
    tom:    grid([[14, 0.26], [30, 0.28]]),
  },
  /* Half-time bossa with a surdo answering instead of a backbeat snare. One
     heavy kick a bar, the snare only on three, and a low tom where the fill
     would go. A planet turning once. */
  tide: {
    kick:   grid([[0, 1.0], [10, 0.6], [16, 1.0], [22, 0.45], [26, 0.6]]),
    rim:    grid([[3, 0.55], [6, 0.45], [11, 0.5], [19, 0.55], [24, 0.4], [30, 0.48]]),
    snare:  grid([[8, 0.3], [24, 0.34]]),
    hat:    every(4, 0.09, 8, 0.15),
    shaker: every(2, 0.055, 8, 0.11),
    tom:    grid([[14, 0.3], [28, 0.26], [31, 0.3]]),
  },
  /* A lope: 3+3+2 eighths, so the bar never divides evenly into four. Every
     other kit here is duple and lands on beat three; the solar system floats
     rather than marches, and a waltz cannot be spelled on a 16-step grid, so
     the tresillo is the closest honest thing. Thinned for this rewrite — at
     76bpm the old version was still a groove and the stage wanted a pulse. */
  orbit: {
    kick:   grid([[0, 0.72], [6, 0.34], [16, 0.72], [22, 0.34]]),
    rim:    grid([[3, 0.34], [11, 0.3], [19, 0.34], [27, 0.3]]),
    hat:    every(8, 0.055),
    shaker: every(3, 0.04, 12, 0.075),
    snare:  grid([]),
    tom:    grid([[12, 0.2], [28, 0.22]]),
  },
  /* Almost not a kit. One soft kick a bar, a shaker in threes so its accent
     walks all the way round before it comes back, and a tom once every two
     bars like something very large turning over. ⚠ There is deliberately NO
     SNARE: a backbeat is a promise that something is about to happen, and out
     here nothing is. */
  drift: {
    kick:   grid([[0, 0.55], [16, 0.5]]),
    rim:    grid([[9, 0.26], [22, 0.24]]),
    hat:    grid([]),
    shaker: every(3, 0.035, 9, 0.062),
    snare:  grid([]),
    tom:    grid([[26, 0.2]]),
  },
  /* The finale, and the quietest thing in the game. A kick every OTHER bar, so
     at 52bpm the pulse is nine seconds long; six shaker strokes in 32 steps;
     one tom. If it looks like too little, play it — everything above it is
     holding notes for six seconds at a time and a busier floor would be
     fighting them. */
  vast: {
    kick:   grid([[0, 0.5]]),
    rim:    grid([[20, 0.2]]),
    hat:    grid([]),
    shaker: grid([[4, 0.04], [10, 0.032], [14, 0.04], [20, 0.032], [26, 0.04], [30, 0.03]]),
    snare:  grid([]),
    tom:    grid([[16, 0.22]]),
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
   ------------------------------------------------------------

   Fields beyond the notes, all optional and all defaulting to what
   every song did before they existed:

     voices   which engine voice plays which role —
              { melody, comp, bass, double }. `double` is the octave
              doubling on the melody and may be null.
     space    reverb-send multiplier for the whole song. 1 is the
              dry-ish value the voices were tuned at; 4 is a canyon.
     gain     per-role level trim, { melody, comp, bass }.
     sustain  per-role note-length multiplier, { melody, comp, bass }.
              This is how a groove becomes a pad without a new voice.
     form     per-song weights for form.js — { fill, break, micro,
              lift, compOut, treat }.
   ------------------------------------------------------------ */

/** "Uncertainty Principle" — the quantum realm. E lydian, ticking, tiny. */
const quantumSong = {
  id: 'quantum',
  name: 'Uncertainty Principle',
  bpm: 126,
  kit: 'fizz',
  bars: 8,
  bassOct: -24,
  /* Lydian: the raised fourth is the one interval that sounds like a question
     rather than a statement, and this stage is a question. The harmony barely
     moves — each chord holds for two bars — because at this scale nothing has
     had time to happen yet. */
  prog: [
    [64, 'maj9'], [64, 'maj9'], [66, 'm9'], [66, 'm9'],
    [71, 'sus'], [71, 'sus'], [64, 'add9'], [63, 'alt'],
  ],
  /* Plucked, not struck. Short repeated notes with gaps — a Geiger counter
     that happens to be in tune. The leap up in bars five and six is the only
     lyrical thing in it and it is over in four sixteenths. */
  melody: [
    [0, 88, 1], [2, 88, 1], [4, 83, 2], [7, 88, 1], [10, 90, 2], [14, 88, 1],
    [16, 85, 1], [18, 85, 1], [20, 81, 2], [24, 83, 3], [28, 85, 1], [30, 86, 1],
    [32, 90, 2], [36, 88, 1], [38, 85, 3], [44, 83, 1], [46, 81, 2],
    [48, 78, 2], [52, 81, 1], [54, 83, 2], [58, 85, 4],
    [64, 90, 3], [68, 93, 5], [76, 90, 2],
    [80, 88, 2], [84, 85, 1], [86, 83, 5], [94, 81, 2],
    [96, 88, 1], [98, 88, 1], [100, 90, 2], [104, 92, 3], [110, 88, 2], [114, 85, 2],
    [116, 83, 1], [118, 85, 1], [120, 88, 4], [126, 83, 2],
  ],
  brass: [],
  scat: [],
  voices: { melody: 'pluck', comp: 'vibe', bass: 'bass', double: null },
  space: 1.5,
  gain: { melody: 1.25, comp: 0.85 },
  sustain: { comp: 1.6 },
  /* Busy and skittish: a fill at nearly every phrase end, micro-variation
     everywhere, and the tune rarely allowed to lay out. It is the first stage
     the player hears and it has to be inviting. */
  form: { fill: 1.2, micro: 1.4, break: 0.4, compOut: 0.6,
    treat: { plain: 30, ornament: 26, octave: 16, sparse: 8, layout: 4 } },
};

/** "Valence" — the atom. A major, bouncing, the most childlike thing here. */
const atomSong = {
  id: 'atom',
  name: 'Valence',
  bpm: 138,
  kit: 'spring',
  bars: 8,
  bassOct: -24,
  prog: [
    [69, 'maj9'], [66, 'm7'], [62, 'maj9'], [64, 'dom9'],
    [69, 'maj9'], [71, 'm7'], [64, 'm7'], [64, 'dom13'],
  ],
  /* Arpeggios that bounce off the top note and fall back, because "something
     going round something" is the only image this stage has and a scale would
     have been a ladder. Everything lands on a chord tone; nothing here is
     clever, and it should not be. */
  melody: [
    [0, 73, 2], [2, 76, 2], [4, 81, 4], [8, 78, 2], [10, 76, 2], [12, 73, 4],
    [16, 74, 2], [18, 78, 2], [20, 81, 4], [24, 78, 4], [28, 74, 4],
    [32, 74, 2], [34, 78, 2], [36, 83, 4], [40, 81, 2], [42, 78, 2], [44, 74, 4],
    [48, 76, 2], [50, 80, 2], [52, 83, 6], [58, 80, 3], [61, 76, 3],
    [64, 73, 2], [66, 76, 2], [68, 81, 4], [72, 85, 6], [78, 81, 2],
    [80, 83, 2], [82, 81, 2], [84, 78, 4], [88, 76, 4], [92, 74, 4],
    [96, 71, 2], [98, 74, 2], [100, 78, 4], [104, 76, 2], [106, 74, 2], [108, 71, 4],
    [112, 76, 2], [114, 78, 2], [116, 80, 4], [120, 81, 8],
  ],
  brass: [
    [12, [69, 73, 76], 2], [14, [69, 73, 76], 2],
    [44, [62, 66, 69], 3],
    [76, [69, 73, 78], 4],
    [108, [64, 68, 71], 2], [110, [64, 68, 71], 2],
    [124, [69, 73, 76], 4],
  ],
  scat: [
    [4, 81, 3, 0], [8, 78, 3, 2],
    [36, 83, 3, 0], [40, 81, 3, 3],
    [68, 81, 3, 0], [72, 85, 4, 1],
    [100, 78, 3, 0], [104, 76, 3, 4],
  ],
  voices: { melody: 'vibe', comp: 'pluck', bass: 'bass', double: 'vibe' },
  space: 1.1,
  form: { fill: 1.15, micro: 1.2, break: 0.5,
    treat: { plain: 30, ornament: 18, octave: 22, sparse: 10, layout: 6 } },
};

/** "Flagella" — the microbe stage. C dorian, chromatic, comic. */
const microbeSong = {
  id: 'microbe',
  name: 'Flagella',
  bpm: 158,
  kit: 'culture',
  bars: 8,
  bassOct: -24,
  prog: [
    [60, 'm9'], [65, 'dom9'], [60, 'm9'], [58, 'maj9'],
    [63, 'maj9'], [65, 'm7'], [60, 'm11'], [67, 'sus'],
  ],
  /* ⚠ THE TUNE IS ON THE SCAT VOICE, and that is the whole idea of this
     stage's music. A wordless voice burbling semitone-neighbour figures is
     funny in a way no mallet instrument can be, and funny is what a stage full
     of paramecia needs. The fourth element is the vowel and it moves, so the
     syllables change instead of one held vowel droning through. */
  melody: [
    [0, 72, 2, 0], [2, 71, 1, 2], [3, 72, 2, 0], [6, 75, 3, 3], [10, 74, 2, 1], [12, 72, 4, 0],
    [16, 70, 2, 2], [18, 69, 1, 0], [19, 70, 2, 2], [22, 74, 4, 3], [28, 72, 4, 0],
    [32, 75, 2, 0], [34, 74, 1, 1], [35, 75, 2, 0], [38, 77, 4, 3], [44, 74, 4, 2],
    [48, 70, 3, 0], [51, 72, 3, 2], [54, 75, 4, 0], [60, 74, 4, 4],
    [64, 67, 2, 1], [66, 70, 2, 0], [68, 72, 4, 3], [74, 70, 2, 2], [78, 67, 2, 0],
    [80, 72, 2, 0], [82, 74, 1, 1], [83, 75, 2, 0], [86, 77, 5, 3], [94, 75, 2, 2],
    [96, 72, 2, 0], [98, 70, 2, 2], [100, 67, 4, 0], [106, 70, 3, 1], [110, 72, 2, 3],
    [112, 74, 2, 0], [114, 72, 2, 2], [116, 70, 4, 0], [122, 67, 6, 4],
  ],
  brass: [],
  /* No second vocal line: the comping answers instead, so the two parts are
     not both voices arguing in the same register. */
  scat: [],
  voices: { melody: 'scat', comp: 'pluck', bass: 'bass', double: null },
  space: 1.3,
  gain: { melody: 1.35, comp: 0.95 },
  form: { fill: 1.1, micro: 1.5, break: 0.6, compOut: 1.2,
    treat: { plain: 26, ornament: 30, octave: 8, sparse: 12, layout: 8 } },
};

/**
 * "Everything Sticks" — the house theme. F major, easy bossa.
 *
 * ⚠ UNCHANGED, ON PURPOSE. This and the menu were rendered and approved by the
 * player before the rest of the ladder was rewritten. Keeping a confirmed-good
 * reference in the set is worth more than making all twelve new.
 */
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
  space: 1,
};

/** "Pavement Samba" — the town. B-flat major, brass out front, the party. */
const townSong = {
  id: 'town',
  name: 'Pavement Samba',
  bpm: 134,
  kit: 'samba',
  bars: 8,
  bassOct: -24,
  prog: [
    [58, 'maj9'], [55, 'm7'], [60, 'm9'], [65, 'dom9'],
    [62, 'm7'], [55, 'dom13'], [60, 'm7'], [65, 'dom9'],
  ],
  /* ⚠ THE TUNE IS ON THE BRASS SECTION. A samba's melody instrument is a horn
     line, and putting it on the mallets — which is what every stage used to do
     — is what made a carnival sound like a hotel lobby. Short, punched and
     syncopated: nothing here lasts longer than a beat and a half. */
  melody: [
    [0, 70, 3], [3, 72, 2], [6, 74, 3], [10, 72, 2], [12, 70, 3],
    [16, 67, 3], [19, 70, 2], [22, 74, 4], [28, 72, 3],
    [32, 75, 2], [34, 74, 2], [36, 72, 3], [40, 70, 2], [43, 67, 4],
    [48, 70, 3], [51, 74, 2], [54, 77, 5], [60, 74, 3],
    [64, 74, 3], [67, 72, 2], [70, 70, 3], [74, 69, 2], [77, 67, 3],
    [80, 65, 3], [83, 69, 2], [86, 72, 4], [91, 70, 4],
    [96, 72, 2], [98, 75, 2], [100, 77, 4], [105, 75, 2], [108, 72, 3],
    [112, 70, 3], [115, 72, 2], [118, 74, 3], [122, 70, 5],
  ],
  brass: [],
  /* The scat is the crowd behind the horns rather than a second tune, so it
     sits a tenth below and only on long notes. */
  scat: [
    [6, 62, 4, 0], [12, 58, 3, 4],
    [38, 60, 4, 0], [44, 63, 3, 2],
    [70, 62, 4, 0], [76, 65, 3, 4],
    [102, 65, 4, 0], [108, 60, 3, 2],
    [122, 58, 6, 0],
  ],
  voices: { melody: 'brass', comp: 'pluck', bass: 'bass', double: null },
  space: 1.15,
  gain: { melody: 1.1, comp: 1.1 },
  sustain: { melody: 0.85 },
  /* ⚠ The busiest kit in the game shares the most tokens between its bars, so
     the samba measured 0 novel bars in a six-minute round while every other
     stage managed some. A party is allowed to be relentless, but not for ten
     minutes: the break and the lay-out weights are up, the fills stay. */
  form: { fill: 1.3, micro: 1.3, break: 0.9, compOut: 1.0,
    treat: { plain: 30, ornament: 12, octave: 18, sparse: 16, layout: 12 } },
};

/** "The Whole Sky" — the city. D minor, the fastest and biggest thing here. */
const citySong = {
  id: 'city',
  name: 'The Whole Sky',
  bpm: 152,
  kit: 'drive',
  bars: 8,
  bassOct: -24,
  prog: [
    [62, 'm9'], [62, 'm11'], [58, 'maj9'], [58, 'maj7'],
    [55, 'm7'], [57, 'alt'], [62, 'm9'], [57, 'dom13'],
  ],
  /* The peak of the ladder's energy and the last stage allowed to be loud.
     Long climbing lines rather than the town's short punches — a city seen
     from a bicycle, not a parade. The brass doubles the tune an octave up
     instead of answering it, which is the loudest this game gets. */
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
    [8, 69, 4, 0], [12, 67, 4, 3],
    [40, 65, 4, 0], [44, 69, 4, 1],
    [72, 62, 4, 0], [76, 67, 4, 3],
    [104, 65, 4, 0], [108, 62, 4, 2],
  ],
  voices: { melody: 'vibe', comp: 'pluck', bass: 'bass', double: 'brass' },
  space: 1.2,
  gain: { melody: 1.1 },
  form: { fill: 1.25, micro: 1.1, break: 0.5, compOut: 0.7,
    treat: { plain: 32, ornament: 14, octave: 24, sparse: 8, layout: 5 } },
};

/** "Long Way Round" — the country. G major, broad. The turn begins here. */
const countrySong = {
  id: 'country',
  name: 'Long Way Round',
  bpm: 118,
  kit: 'anthem',
  bars: 8,
  bassOct: -24,
  prog: [
    [67, 'maj9'], [67, 'maj9'], [64, 'm9'], [62, 'm7'],
    [60, 'maj9'], [62, 'dom9'], [69, 'm7'], [62, 'sus'],
  ],
  /* ⚠ THIS IS THE HINGE OF THE LADDER. Six stages of getting faster and busier
     stop here: the tempo drops 34bpm from the city, the melody's note lengths
     roughly double, and the comping moves to the brass section as a PAD rather
     than a rhythm part. It still has a backbeat, so it is not yet the ambient
     end — it is the last thing in the game that sounds like a band. */
  melody: [
    [0, 74, 8], [8, 76, 4], [12, 79, 4],
    [16, 81, 10], [28, 79, 4],
    [32, 76, 8], [40, 74, 6], [46, 72, 2],
    [48, 71, 12], [62, 74, 2],
    [64, 76, 8], [72, 79, 4], [76, 81, 4],
    [80, 83, 10], [92, 81, 4],
    [96, 79, 6], [102, 76, 4], [106, 74, 6],
    [112, 71, 8], [120, 74, 8],
  ],
  brass: [],
  scat: [
    [16, 69, 8, 0], [26, 67, 6, 4],
    [48, 67, 10, 0], [60, 64, 4, 2],
    [80, 71, 8, 0], [90, 69, 6, 4],
    [112, 67, 12, 0],
  ],
  voices: { melody: 'vibe', comp: 'brass', bass: 'bass', double: 'vibe' },
  space: 1.7,
  gain: { melody: 1.05, comp: 0.62 },
  sustain: { melody: 1.3, comp: 2.6 },
  form: { fill: 0.7, micro: 0.7, break: 1.1, compOut: 1.2, lift: 1.2,
    treat: { plain: 30, ornament: 10, octave: 14, sparse: 26, layout: 12 } },
};

/** "One Turn" — the world. E-flat, a hymn at walking pace. */
const worldSong = {
  id: 'world',
  name: 'One Turn',
  bpm: 94,
  kit: 'tide',
  bars: 8,
  bassOct: -24,
  prog: [
    [63, 'maj9'], [63, 'maj9'], [58, 'sus'], [58, 'dom9'],
    [56, 'maj9'], [60, 'm9'], [63, 'add9'], [65, 'sus'],
  ],
  /* ⚠ THE TUNE IS A CHOIR FROM HERE DOWN. Four stages remain and three of them
     put a wordless voice on the melody, because past the world stage the game
     stops being about objects and a mallet instrument keeps insisting that it
     is. Eleven notes in eight bars, and the vowel changes on the long ones so
     it breathes instead of droning. */
  melody: [
    [0, 70, 14, 0],
    [16, 72, 10, 3], [28, 70, 4, 1],
    [32, 67, 16, 0],
    [48, 70, 8, 4], [58, 72, 6, 0],
    [64, 75, 14, 0],
    [80, 74, 10, 2], [92, 72, 4, 4],
    [96, 70, 12, 0], [110, 67, 6, 3],
    [116, 65, 12, 0],
  ],
  brass: [],
  scat: [],
  voices: { melody: 'scat', comp: 'vibe', bass: 'bass', double: null },
  space: 2.2,
  gain: { melody: 1.3, comp: 0.8 },
  sustain: { melody: 1.5, comp: 2.2, bass: 1.4 },
  form: { fill: 0.4, micro: 0.5, break: 1.4, compOut: 1.4, lift: 1.3,
    treat: { plain: 30, ornament: 6, octave: 10, sparse: 30, layout: 18 } },
};

/** "Slow Ellipse" — the solar system. A minor, floating, a tresillo pulse. */
const solarSong = {
  id: 'solar',
  name: 'Slow Ellipse',
  bpm: 76,
  kit: 'orbit',
  bars: 8,
  bassOct: -24,
  prog: [
    [57, 'madd9'], [57, 'madd9'], [65, 'maj9'], [65, 'maj9'],
    [62, 'm11'], [62, 'm11'], [60, 'sus2'], [55, 'sus'],
  ],
  /* One harmony for two bars at a time: nothing in a solar system is in a
     hurry and the chords should not be either. Wide intervals — sixths and
     octaves rather than steps — so each note reads as a separate body rather
     than as a phrase going somewhere. The choir is the pad here, four voices
     wide, three and a half seconds a chord. */
  melody: [
    [0, 81, 12], [14, 76, 2],
    [16, 84, 10], [28, 81, 4],
    [32, 88, 14],
    [48, 84, 8], [58, 81, 6],
    [64, 79, 12], [78, 76, 2],
    [80, 74, 10], [92, 79, 4],
    [96, 84, 14],
    [112, 81, 10], [124, 76, 4],
  ],
  brass: [],
  scat: [
    [0, 69, 12, 0],
    [32, 72, 14, 4],
    [64, 67, 12, 0],
    [96, 72, 14, 2],
  ],
  voices: { melody: 'vibe', comp: 'scat', bass: 'bass', double: null },
  space: 2.8,
  gain: { melody: 1.15, comp: 0.5 },
  sustain: { melody: 2.0, comp: 3.2, bass: 2.0 },
  form: { fill: 0.28, micro: 0.35, break: 1.6, compOut: 1.5, lift: 1.2,
    treat: { plain: 28, ornament: 4, octave: 12, sparse: 32, layout: 24 } },
};

/** "Arms" — the galaxy. D-flat, bell-like, mostly the spaces between notes. */
const galaxySong = {
  id: 'galaxy',
  name: 'Arms',
  bpm: 64,
  kit: 'drift',
  bars: 8,
  bassOct: -24,
  /* Quartal harmony: stacks of fourths, no thirds, so nothing is major or
     minor and nothing wants to resolve. A galaxy is not going anywhere
     either. */
  prog: [
    [61, 'quartal'], [61, 'quartal'], [66, 'quintal'], [66, 'quintal'],
    [59, 'quartal'], [64, 'sus2'], [61, 'quartal'], [56, 'quintal'],
  ],
  /* Bell strikes with holes between them. At 64bpm a gap of eight sixteenths
     is nearly two seconds of nothing, and that is the instrument: most of what
     the player hears here is a reverb tail rather than a note. */
  melody: [
    [0, 85, 10],
    [20, 90, 8],
    [32, 88, 12],
    [52, 83, 8],
    [64, 92, 10],
    [80, 90, 6], [88, 85, 6],
    [96, 87, 14],
    [116, 80, 10],
  ],
  brass: [],
  scat: [
    [0, 73, 16, 0],
    [32, 78, 16, 4],
    [64, 71, 16, 0],
    [96, 76, 16, 2],
  ],
  voices: { melody: 'vibe', comp: 'vibe', bass: 'bass', double: null },
  space: 3.4,
  gain: { melody: 1.2, comp: 0.42 },
  sustain: { melody: 2.4, comp: 3.6, bass: 2.6 },
  form: { fill: 0.18, micro: 0.25, break: 1.8, compOut: 1.7, lift: 1.0,
    treat: { plain: 26, ornament: 3, octave: 10, sparse: 33, layout: 28 } },
};

/** "Everything At Once" — the universe. B, immense, five notes in eight bars. */
const universeSong = {
  id: 'universe',
  name: 'Everything At Once',
  bpm: 52,
  kit: 'vast',
  bars: 8,
  bassOct: -24,
  /* Three harmonies in eight bars, all of them fourth- or fifth-stacks. At
     52bpm the first one lasts eighteen seconds. */
  prog: [
    [59, 'quintal'], [59, 'quintal'], [59, 'quintal'], [59, 'quintal'],
    [57, 'quartal'], [57, 'quartal'], [62, 'sus2'], [62, 'sus2'],
  ],
  /* ⚠ FIVE NOTES. Not an oversight and not a placeholder. At this tempo the
     first is held for seven and a half seconds and the eight bars run for
     seventy-four; anything busier would be a different stage's music playing
     over the end of the game.

     The choir is the tune and the vibraphone comping is a distant bell
     answering it, which is the only counterpoint out here. */
  melody: [
    [0, 71, 26, 0],
    [32, 74, 22, 4],
    [56, 71, 8, 2],
    [64, 76, 30, 0],
    [100, 69, 26, 4],
  ],
  brass: [],
  scat: [],
  voices: { melody: 'scat', comp: 'vibe', bass: 'bass', double: null },
  space: 4.2,
  gain: { melody: 1.4, comp: 0.4, bass: 0.9 },
  sustain: { melody: 1.6, comp: 4.0, bass: 3.2 },
  /* Almost nothing happens above the bar either. One fill in six phrases, no
     micro-variation worth the name, and the tune is thinned or silent more
     often than it is played straight — at seventy-four seconds a cycle, a
     cycle of silence is a real event rather than a gap. */
  form: { fill: 0.1, micro: 0.15, break: 2.0, compOut: 1.8, lift: 0.8,
    treat: { plain: 24, ornament: 2, octave: 8, sparse: 34, layout: 32 } },
};

/**
 * Title-screen vamp: slow, unhurried, plenty of space.
 *
 * ⚠ UNCHANGED — see the note on `houseSong`. This is the first music anybody
 * hears and it was approved as it stands.
 */
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
  space: 1.25,
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
