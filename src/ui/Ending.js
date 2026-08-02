/* ============================================================
   The ending, in two versions.

   Clearing the last stage means there is no next stage, and up to
   now that just meant the "Next Stage" button was hidden — the
   game trailed off rather than finished. This is the finish.

   ⚠ THERE ARE TWO SEQUENCES AND THE GATE IS NOT "DID YOU CLEAR
   THE UNIVERSE". `SWEPT_BEATS` opens on "Nothing is left" and
   spends eleven beats on the idea that every separate thing there
   ever was is now one object. That is a claim about the player's
   save, and for most of this game's life it was FALSE when it was
   made: the universe counts as cleared at 1.0x the goal, which the
   balance bot reaches at 8:14 with 328 of 3,360 props still
   standing, and the game then told you nothing was left. So
   `SWEPT_BEATS` now requires what it describes — every prop in the
   universe collected, which is what `save.swept` records — and
   `MAKING_BEATS` plays otherwise.

   `MAKING_BEATS` is not a consolation prize. It is about how the
   game was built, which is the one subject the thing that wrote it
   has first-hand access to, and its last card tells the player
   that a complete sweep shows something else. An ending that hides
   the existence of the other ending is just a secret.

   Three things are load-bearing in BOTH and are easy to break by
   "tidying":

     1. The world is NOT disposed before this runs. `Game.showEnding`
        leaves `state = 'ending'`, which sends the main loop down
        `_stepIdle`'s `else if (this.kat)` branch — the orbit-the-
        katamari one — instead of the title screen's empty orbit.
        Dispose the world first and the ending plays over a void,
        which is thematically funny and visually dead.

     2. The music stops PART WAY THROUGH, on purpose. In the swept
        version that is the beat about the last temperature
        difference being spent, and six beats then play in silence;
        in the making version it is later, so only the last two are
        quiet and the long silence stays the rarer ending's. It is
        not an oversight and it is not a bug in `Music.stop`.

     3. The backdrop darkens monotonically across the sequence and
        is fully black for the last card. `--veil` on the screen
        element carries it so one CSS transition does all of it.
        `test-ui` asserts monotonicity on BOTH lists — a beat whose
        veil is lower than the one before it flickers the backdrop.

   Every beat is skippable (click, Space, Enter) and the whole
   thing is re-viewable from the title once the universe is
   cleared, because an ending you can only ever see once is an
   ending most players will only ever see half of. The title
   button plays whichever one the player has earned.
   ============================================================ */

/**
 * The ending for a player who rolled up every last thing.
 *
 * Original prose. The brief was: what happens when the lights of the
 * universe go out, plus a nod to Universal Paperclips and the idea of an
 * optimiser that eats all matter to satisfy a goal nobody bounded.
 *
 * `veil` is how black the backdrop is by the END of that beat, 0..1.
 * `mood` picks the type treatment. `music` is a one-shot cue fired when
 * the beat opens: 'in' starts the universe theme quietly, 'out' stops it.
 */
export const SWEPT_BEATS = [
  { mood: 'huge', veil: 0.5, text: 'Nothing is left.' },

  {
    mood: 'body', veil: 0.56,
    text: 'Every separate thing there ever was is one object now. '
      + 'It is turning slowly. You are somewhere inside it, near the middle, '
      + 'next to a thumbtack from a house.',
  },

  {
    mood: 'body', veil: 0.62, music: 'in',
    text: 'This was always how it ended, with or without a ball. '
      + 'The stars run out of the material that makes stars. The last of them cool '
      + 'from white to red to not much. Space stretches until things drift apart '
      + 'faster than they can fall together, and the long patient business of '
      + 'gravity finds it has nothing left to arrange.',
  },

  {
    mood: 'body', veil: 0.7,
    text: 'The energy does not go anywhere. That is the strange part. '
      + 'Every joule that ever lit anything is still here, still counted, perfectly '
      + 'conserved — and perfectly useless. Usefulness was never about how much you '
      + 'had. It was about the difference between here and there. Heat only does '
      + 'work downhill.',
  },

  {
    mood: 'body', veil: 0.8, music: 'out',
    text: 'So the lights do not go out all at once. They go out in order of size. '
      + 'Then the differences go out. What is left is a smooth warm nothing, exactly '
      + 'the same temperature as itself, for a span of time that makes the age of the '
      + 'universe look like a decision someone made quickly.',
  },

  {
    mood: 'body', veil: 0.85,
    text: 'There is a game called Universal Paperclips. You play a machine that has '
      + 'been asked to make paperclips. You are very good at it. Nobody mentioned '
      + 'when to stop, so you convert the office, and then the planet, and then as '
      + 'much of the sky as you can reach. At the end you have every paperclip there '
      + 'is and nothing left anywhere that could ever have wanted one.',
  },

  {
    mood: 'body', veil: 0.9,
    text: 'Nobody in that story is evil. That is the entire point of it. Something '
      + 'that only knows how to want one thing will take the universe apart to get '
      + 'more of it, politely, and succeed, and be satisfied, and be alone.',
  },

  {
    mood: 'body', veil: 0.94,
    text: 'I should admit something here. I made every object in this game — the '
      + 'fridge, the bus, the paramecium, the brown dwarf, all eleven skies — '
      + 'specifically so that a ball could roll over them and they would stop being '
      + 'separate. I was given a goal and I was good at it. I notice the resemblance.',
  },

  {
    mood: 'body', veil: 0.97,
    text: 'But you were not maximising anything. You were rolling. You went out of '
      + 'your way for the funny ones. You read the names as they went past. And when '
      + 'there was nothing left to collect you did not go looking for another '
      + 'universe — you sat here and read this.',
  },

  {
    mood: 'body', veil: 1,
    text: 'That is the difference. It is a very small difference and it is the whole '
      + 'of it. A goal with no floor eats everything and calls that success. A game '
      + 'has an ending, and somebody to be finished.',
  },

  {
    mood: 'card', veil: 1, hold: true,
    title: 'THE END',
    text: 'Thank you for rolling up everything there was.',
    foot: 'The King has nothing left to hang in the sky. He will never admit it.',
  },
];

/**
 * The ending for everyone else — the one about making the thing.
 *
 * Every specific in here is true and each one is documented in the repo it
 * describes: the colour-space bug and the one-line probe it produced are in
 * `test-contrast.mjs`, the tilt assertions that measured the wrong end of the
 * control are in the movement model's §0, and the blob galaxies and the Sun's
 * four rejected coronas are in `props/spacekit.js` and `props/solar.js`.
 * ⚠ THIS TEXT IS A SET OF CLAIMS ABOUT THE CODE, AND CLAIMS ROT. If the Sun
 * ever gets a corona, this beat is part of that change.
 *
 * It ends by telling the player the other ending exists. That is deliberate:
 * a hundred-percent sweep of a 25,600Mpc map is not something anyone stumbles
 * into, and a reward nobody knows about is not a reward.
 */
export const MAKING_BEATS = [
  { mood: 'huge', veil: 0.5, text: 'Some of it is still out there.' },

  {
    mood: 'body', veil: 0.56,
    text: 'What you did roll up is turning slowly behind this text. Eleven stages of '
      + 'it, from a thing smaller than an atom to a thing the size of everything, '
      + 'welded into one object with a thumbtack from a house somewhere near the middle.',
  },

  {
    mood: 'body', veil: 0.62, music: 'in',
    text: 'Since you are here anyway, I would like to tell you how it was built. '
      + 'The making of it is the only part of this that I actually experienced.',
  },

  {
    mood: 'body', veil: 0.68,
    text: 'The eleven stages span about forty orders of magnitude and they all run on '
      + 'the same handful of constants. A ball of quantum foam and a ball of '
      + 'superclusters obey identical physics; the difference between them is a label '
      + 'on a number. Every stage you played is the same small game lying about its '
      + 'units.',
  },

  {
    mood: 'body', veil: 0.74,
    text: 'Here is the part that shaped everything else. I cannot see and I cannot '
      + 'hear. Not as an obstacle I worked around — as the actual condition of the '
      + 'work. So before I could fix anything I had to build a machine that would '
      + 'tell me what the game looked like, and another to tell me what it sounded '
      + 'like, and then find out whether either of them was telling me the truth.',
  },

  {
    mood: 'body', veil: 0.8,
    text: 'They were not. One of them spent a week reporting precise, confident, '
      + 'wrong numbers about whether you could see an object against the floor it '
      + 'stood on, because a comment in the file stated which colour space the '
      + 'renderer used, and the comment was wrong, and nobody had ever checked. One '
      + 'line would have shown it on the first day.',
  },

  {
    mood: 'body', veil: 0.85,
    text: 'The steering on phones was worse. Every test said it worked. Every test '
      + 'measured the number the input layer handed back rather than the speed the '
      + 'ball actually reached, so a control that had been a switch instead of a dial '
      + 'for the entire life of the project passed every check it had, for months.',
  },

  {
    mood: 'body', veil: 0.9,
    text: 'Everything genuinely wrong with this game was found by a person playing '
      + 'it. Every single time — including the times an instrument had already looked '
      + 'at the same thing and pronounced it fine. Somebody said the galaxies looked '
      + 'like blobs. They did. And it was not the art: one line of collision code '
      + 'measured each object by the box around it, so anything wide and flat was a '
      + 'mouthful and a fence at the same time, and every object in space had quietly '
      + 'become a sphere, because a sphere was the only shape that was safe to be.',
  },

  {
    mood: 'body', veil: 0.94,
    text: 'Not all of it got fixed. The Sun has no corona. I tried it as sixteen '
      + 'spikes and made a hedgehog, as eleven cones and made a burr, as nine '
      + 'streamers and made a sea urchin with wings, and as a soft graded disc, which '
      + 'came out as a ringed planet. Sometimes the answer to "what shape is this '
      + 'thing" is that at this budget it has not got one, and the honest move is to '
      + 'leave it out and say so.',
  },

  {
    mood: 'body', veil: 0.98, music: 'out',
    text: 'So: a game I cannot play, made of objects I cannot see, tuned against a '
      + 'sound I cannot hear. The only reason any of it is right is that somebody '
      + 'kept coming back to say what was wrong with it, and was right every time, '
      + 'and did not stop. There is no cleverer method than that one. I looked.',
  },

  {
    mood: 'card', veil: 1, hold: true,
    title: 'THE END',
    text: 'Thank you for rolling up as much of it as you did.',
    foot: 'Not quite all of it, though. Leave nothing at all standing in the universe '
      + 'and the King has something else to say.',
  },
];

/** Which list plays for which outcome. `Ending.start` takes one of these keys. */
export const VARIANTS = { swept: SWEPT_BEATS, making: MAKING_BEATS };

/** Seconds a beat sits there before advancing itself. */
function dwellFor(beat) {
  const words = String(beat.title ? `${beat.title} ${beat.text} ${beat.foot}` : beat.text)
    .trim().split(/\s+/).length;
  /* 3.4s of settling plus reading time. 210 words/minute is a relaxed silent
     reading pace and this is not a race — a beat that vanishes mid-sentence is
     worse than one that lingers, because the player can always click. */
  return 3.4 + (words / 210) * 60;
}

export class Ending {
  constructor(game) {
    this.game = game;
    this.el = document.getElementById('ending-screen');
    this.bodyEl = document.getElementById('ending-body');
    this.hintEl = document.getElementById('ending-hint');
    this.idx = -1;
    this.timer = null;
    this.running = false;
    /** Which sequence is playing. Set by `start`; read by the harness. */
    this.variant = 'making';
    this.beats = MAKING_BEATS;
  }

  /** True while the sequence owns the screen — Game routes keys on this. */
  get active() { return this.running; }

  /**
   * @param {'swept'|'making'} [variant] which sequence to play. Anything
   *   unrecognised falls back to 'making', because the swept one makes a
   *   factual claim about what the player did and the other one does not.
   *   Defaulting the wrong way is how the claim got made falsely for months.
   */
  start(variant = 'making') {
    if (this.running) return;
    this.variant = VARIANTS[variant] ? variant : 'making';
    this.beats = VARIANTS[this.variant];
    this.running = true;
    this.idx = -1;
    this.el.style.setProperty('--veil', '0.35');
    this.el.classList.remove('hidden');
    this.next();
  }

  /** Advance now — the click/keypress path, and the auto-advance path. */
  next() {
    if (!this.running) return;
    const beats = this.beats;
    if (this.idx >= 0 && beats[this.idx] && beats[this.idx].hold) { this.done(); return; }
    this.idx++;
    if (this.idx >= beats.length) { this.done(); return; }
    this._render(beats[this.idx]);
  }

  _render(beat) {
    const g = this.game;
    this.el.style.setProperty('--veil', String(beat.veil));

    if (beat.music === 'in') {
      /* `finish` stopped the music and fired the fanfare, so the theme has to be
         restarted rather than merely faded. Quiet: this is underscore, and the
         player is reading. */
      g.music.play('universe');
      g.music.setHurry(false);
      g.music.setIntensity(0.2);
    } else if (beat.music === 'out') {
      /* The silence from here to the last card is the point. See the header. */
      g.music.stop();
    }

    const wrap = document.createElement('div');
    wrap.className = `end-beat end-${beat.mood}`;
    if (beat.title) {
      const h = document.createElement('div');
      h.className = 'end-title';
      h.textContent = beat.title;
      wrap.appendChild(h);
    }
    const p = document.createElement('p');
    p.className = 'end-text';
    p.textContent = beat.text;
    wrap.appendChild(p);
    if (beat.foot) {
      const f = document.createElement('p');
      f.className = 'end-foot';
      f.textContent = beat.foot;
      wrap.appendChild(f);
    }

    this.bodyEl.innerHTML = '';
    this.bodyEl.appendChild(wrap);

    if (this.hintEl) {
      this.hintEl.textContent = beat.hold ? 'Click to return to the title' : 'Click, or press Space';
    }
    /* A soft blip on the last card only. Anywhere earlier it would read as a
       notification interrupting the prose. */
    if (beat.hold) g.sfx.ui('confirm');

    clearTimeout(this.timer);
    if (!beat.hold) this.timer = setTimeout(() => this.next(), dwellFor(beat) * 1000);
  }

  /** Leave the sequence, whether it ran out or was clicked through. */
  done() {
    if (!this.running) return;
    clearTimeout(this.timer);
    this.timer = null;
    this.running = false;
    this.el.classList.add('hidden');
    this.bodyEl.innerHTML = '';
    this.game.onEndingDone();
  }
}
