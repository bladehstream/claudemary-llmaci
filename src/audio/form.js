/* ============================================================
   Form: what happens ABOVE the bar.

   `songs.js` holds one loop per stage — 4, 8 or 16 bars of melody
   over a chord progression, plus a 2-bar drum grid. `Music.js`
   used to play that loop and nothing else, so the score's period
   was exactly the loop: measured by `npm run repetition`, the
   whole thing repeated every 9.2s (menu) to 43.6s (solar), the
   drums every 2 bars and the bass every 1, and the mean share of
   a round that was NEW material was **6.2%**. The player's words
   were "it kinda sucks and is very repetitive". The timbre half
   of that report was fixed by rebuilding the voices; this is the
   other half.

   ⚠ THE FIX IS NOT MORE NOTES. Doubling every melody would have
   doubled the period and cost twelve hand-written tunes. What
   actually makes music stop sounding like a loop is that the
   SAME material is treated differently each time round: a fill
   where the phrase turns over, a bass that walks somewhere else,
   a chorus that lays out so the next one lands. So this file is a
   set of treatments, and `Music` asks it once per bar what to do
   with the material it already has.

   ⚠ AND IT IS DETERMINISTIC, WHICH IS THE WHOLE REASON IT IS
   TESTABLE. Every choice comes from `hash01(songSeed, barIndex,
   channel)` — a pure function of where you are in the piece — so
   the score is a fixed composition that happens to be minutes
   long instead of seconds, rather than a random one. Two renders
   of the same song are identical, `npm run repetition` measures a
   real period rather than noise, and a player who hears something
   they like at 3:20 hears it again at 3:20.

   ⚠ WEIGHTED, NOT UNIFORM. Every table below is written so the
   plain, as-composed treatment is the commonest outcome. Variety
   that fires every bar is its own kind of monotony, and a melody
   that is ornamented every time round is just a different melody
   played on a loop.

   THE ONE INVARIANT: step 0 of a bar is never taken away. The
   downbeat kick and the bass root are what make the rest legible
   as variation rather than as a mistake.
   ============================================================ */

/**
 * A pure hash in [0,1) from three small integers.
 *
 * Not for cryptography and not for statistics — it needs to be cheap (this
 * runs a handful of times per bar inside an audio scheduler), stable across
 * engines, and well-spread over the small consecutive integers that are the
 * only thing ever fed to it. `Math.imul` keeps the multiply 32-bit, which is
 * what makes "stable across engines" true rather than hopeful.
 */
export function hash01(a, b, c = 0) {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 1442695041)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Stable small integer for a song id, so two songs never share a bar's dice. */
export function songSeed(id) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return (h >>> 0) % 100000;
}

/** Pick from a weighted table. `table` is [[weight, value], ...]. */
function pick(r, table) {
  let total = 0;
  for (const [w] of table) total += w;
  let x = r * total;
  for (const [w, v] of table) { x -= w; if (x < 0) return v; }
  return table[table.length - 1][1];
}

/* ------------------------------------------------------------
   Drum fills
   ------------------------------------------------------------

   Each entry is `{ from, hits }`. `from` is the 16th of the bar the fill takes
   over at — everything the kit would normally play from there to the bar line
   is suppressed, so a fill reads as a fill and not as two drummers. `hits` are
   `[step, voice, velocity]`.

   ⚠ VELOCITIES ARE LOW ON PURPOSE. These sit under a melody at an intensity
   the player did not ask to change, and a fill that jumps 6dB over the groove
   is a different instruction — "something is happening" — which is a lie four
   times a phrase. They are punctuation, not an event.
*/
const FILLS = [
  { from: 14, hits: [[14, 'tom', 0.26], [15, 'snare', 0.3]] },
  { from: 12, hits: [[12, 'snare', 0.24], [14, 'tom', 0.28], [15, 'tom', 0.22]] },
  { from: 12, hits: [[12, 'rim', 0.4], [13, 'rim', 0.3], [14, 'rim', 0.36], [15, 'snare', 0.32]] },
  { from: 14, hits: [[14, 'snare', 0.22], [15, 'snare', 0.34]] },
  { from: 10, hits: [[10, 'tom', 0.22], [12, 'tom', 0.26], [14, 'snare', 0.3], [15, 'tom', 0.24]] },
  { from: 13, hits: [[13, 'snare', 0.2], [14, 'snare', 0.26], [15, 'kick', 0.62]] },
  /* The turnaround: a bar of near-silence where the fill would be. Space is a
     fill too, and it is the one that never gets tiring. */
  { from: 12, hits: [[15, 'rim', 0.34]] },
  { from: 8, hits: [[8, 'tom', 0.2], [10, 'tom', 0.24], [12, 'tom', 0.28], [14, 'snare', 0.3], [15, 'snare', 0.24]] },
];

/* ------------------------------------------------------------
   Bass patterns — one bar each
   ------------------------------------------------------------

   `[step, interval, durSteps, amp]`. The interval is semitones above the bar's
   chord root in the bass octave, except -1 which means "chromatic approach to
   the NEXT bar's root" and is only ever legal on the last two 16ths.

   Pattern 0 is what the game shipped with, and it is weighted heaviest: this
   is variation on a groove, not a bass solo. `minIntensity` keeps the busier
   ones out of a quiet arrangement, which is how the original fixed steps
   behaved (step 10 needed 0.5, step 14 needed 0.72) and is worth keeping —
   a menu at 0.35 should still be a menu.
*/
const BASS = [
  { w: 26, min: 0, notes: [[0, 0, 5.5, 0.44], [6, 7, 3.5, 0.34]] },
  { w: 14, min: 0, notes: [[0, 0, 3.5, 0.44], [6, 7, 2.5, 0.32], [10, 0, 2.5, 0.24]] },
  { w: 10, min: 0.45, notes: [[0, 0, 3.5, 0.44], [6, 7, 2.0, 0.32], [10, 12, 2.0, 0.22], [14, -1, 1.6, 0.22]] },
  { w: 9, min: 0.4, notes: [[0, 0, 2.5, 0.44], [4, 0, 1.5, 0.2], [6, 7, 3.5, 0.32]] },
  { w: 8, min: 0, notes: [[0, 0, 7.5, 0.46], [8, 7, 3.5, 0.3]] },
  { w: 7, min: 0.5, notes: [[0, 0, 2.5, 0.44], [6, 12, 2.5, 0.3], [10, 7, 2.5, 0.24], [14, -1, 1.6, 0.22]] },
  { w: 6, min: 0.35, notes: [[0, 0, 5.5, 0.44], [8, 3, 2.0, 0.26], [11, 7, 2.5, 0.28]] },
  /* One long root and nothing else. After three busy bars this is the one the
     ear notices. */
  { w: 6, min: 0, notes: [[0, 0, 13.0, 0.42]] },
];

/* Comping placements. The kit-specific set the game shipped with stays first
   and heaviest, so each stage keeps the feel it was written to have. */
const COMP = {
  samba: [[24, [3, 6, 11, 14]], [8, [3, 11]], [7, [6, 11, 14]], [6, [3, 6, 9, 11, 14]], [5, [2, 6, 10, 14]]],
  drive: [[24, [4, 10]], [8, [4, 10, 14]], [7, [2, 10]], [6, [4, 8, 12]], [5, [0, 4, 10]]],
  _: [[24, [3, 6, 10, 14]], [8, [3, 10]], [7, [6, 14]], [6, [3, 6, 10, 13, 14]], [5, [2, 7, 10, 14]]],
};

/**
 * What to do with this bar.
 *
 * @param {object} song   the SONGS entry
 * @param {number} seed   `songSeed(song.id)`
 * @param {number} absBar bars since the music started — NOT wrapped at
 *   `song.bars`, which is the entire point: wrapping it is what made the
 *   score's period equal to the loop's.
 * @param {number} inten  arrangement intensity, 0..1
 * @param {boolean} hurry the last-30s arrangement
 */
export function barPlan(song, seed, absBar, inten, hurry) {
  const bars = song.bars;
  const cyc = Math.floor(absBar / bars);        // which time round the tune we are
  const inSong = absBar % bars;                 // where in the tune
  const phraseEnd = absBar % 4 === 3;           // a four-bar phrase turning over
  const bigTurn = absBar % 8 === 7;             // and the eight-bar one

  /* THE BREAK. One cycle in eight, the drums drop to rim and shaker and the
     comping stops — an arrangement hole, not a quieter mix. It is the largest
     structural contrast available for free, and it is deliberately rare and
     deliberately NOT at cycle 0: the first pass through a tune has to be the
     tune, or the player never learns what is being varied. */
  const brk = cyc > 0 && hash01(seed, cyc, 9) < 0.13 && !hurry;

  /* ---- drums ---- */
  let fill = null;
  if (!brk && (phraseEnd || bigTurn) && inten > 0.18) {
    const r = hash01(seed, absBar, 1);
    /* A phrase end takes a fill about half the time; the eight-bar turn nearly
       always does. Every four bars without fail is a metronome with extra
       steps — the point of a fill is that the ear cannot predict it. */
    if (r < (bigTurn ? 0.86 : 0.46)) fill = FILLS[Math.floor(hash01(seed, absBar, 2) * FILLS.length)];
  }

  /* Drop one non-downbeat kick, or add one ghost rim. Small, per bar, and
     mutually exclusive so a bar is never both thinner and busier at once. */
  let dropKick = -1;
  let ghostRim = -1;
  if (!brk) {
    const r = hash01(seed, absBar, 3);
    if (r < 0.16) dropKick = 1 + Math.floor(hash01(seed, absBar, 4) * 15);
    else if (r < 0.42 && inten > 0.3) ghostRim = 1 + Math.floor(hash01(seed, absBar, 5) * 15);
  }
  /* The lift: hats and shaker vanish for the back half of the bar, which is
     what a real player does going into a turnaround. Only where a fill is not
     already doing the job. */
  const lift = !brk && !fill && phraseEnd && hash01(seed, absBar, 6) < 0.3;

  /* ---- bass ---- */
  const legal = BASS.filter((b) => inten >= b.min);
  const bass = pick(hash01(seed, absBar, 7), legal.map((b) => [b.w, b.notes]));

  /* ---- comping ---- */
  const table = COMP[song.kit] || COMP._;
  let comp = pick(hash01(seed, absBar, 8), table);
  /* Lay out for a bar. Not on the first bar of a phrase, where the chord change
     needs stating. */
  if (brk || (absBar % 4 !== 0 && hash01(seed, absBar, 10) < 0.16)) comp = null;
  /* Invert the voicing. Same chord, different top note — the cheapest real
     variety there is, and it stops four bars of comping being four copies. */
  const compLow = 58 + Math.floor(hash01(seed, absBar, 11) * 3) * 3;

  /* ---- the tune, per CYCLE not per bar ----
     A treatment that changed mid-phrase would not read as a treatment; it
     would read as a mistake. Cycle 0 is always plain, for the same reason the
     break never is: state the tune, then vary it. */
  let melody = 'plain';
  if (cyc > 0) {
    melody = pick(hash01(seed, cyc, 12), [
      [34, 'plain'], [16, 'ornament'], [14, 'octave'], [12, 'sparse'], [8, 'layout'],
    ]);
    /* Never two silent cycles running — that is not space, that is a bug. */
    if (melody === 'layout' && hash01(seed, cyc - 1, 12) > 0.92) melody = 'plain';
  }
  if (hurry) melody = melody === 'layout' ? 'plain' : melody;

  /* Scat and brass answer the tune, so they follow it: present most cycles,
     absent sometimes, up an octave occasionally. */
  const scat = cyc === 0 || hash01(seed, cyc, 13) < 0.72;
  const brass = cyc === 0 || hash01(seed, cyc, 14) < 0.8;
  const brassOct = cyc > 0 && hash01(seed, cyc, 15) < 0.18 ? 12 : 0;

  return { cyc, inSong, brk, fill, dropKick, ghostRim, lift, bass, comp, compLow,
    melody, scat, brass, brassOct };
}

/**
 * Rewrite one cycle's worth of melody events under a treatment.
 *
 * Returns `[step, note, dur, extraOct]` tuples in the same shape `songs.js`
 * uses, so `Music` does not have to branch per treatment at schedule time.
 * Pure, and cached by `Music` per cycle — this walks the whole melody and must
 * not run once per 16th note.
 */
export function treatMelody(melody, treatment) {
  if (!melody) return [];
  switch (treatment) {
    case 'layout':
      return [];
    case 'octave':
      return melody.map(([s, n, d]) => [s, n + 12, d]);
    case 'sparse':
      /* Only the notes that land on a strong beat, held longer. Half as many
         notes and twice the air; the tune is still recognisably itself. */
      return melody.filter(([s]) => s % 8 === 0).map(([s, n, d]) => [s, n, Math.min(d * 2, 8)]);
    case 'ornament': {
      /* An upper neighbour a 16th before anything long enough to carry one.
         Grace notes are short and quiet — see the `amp` scaling in Music. */
      const out = [];
      for (const [s, n, d] of melody) {
        if (d >= 4 && s > 0) out.push([s - 1, n + 2, 1, 'grace']);
        out.push([s, n, d]);
      }
      return out;
    }
    default:
      return melody;
  }
}
