/* ============================================================
   The ending.

   Clearing the last stage means there is no next stage, and up to
   now that just meant the "Next Stage" button was hidden — the
   game trailed off rather than finished. This is the finish.

   It is a timed reveal of prose over the still-loaded universe
   stage, so the enormous ball the player just made is still
   turning behind the text. Three things are load-bearing and are
   easy to break by "tidying":

     1. The world is NOT disposed before this runs. `Game.showEnding`
        leaves `state = 'ending'`, which sends the main loop down
        `_stepIdle`'s `else if (this.kat)` branch — the orbit-the-
        katamari one — instead of the title screen's empty orbit.
        Dispose the world first and the ending plays over a void,
        which is thematically funny and visually dead.

     2. The music stops PART WAY THROUGH, on purpose, at the beat
        about the last temperature difference being spent. Six
        beats then play in silence. That silence is the effect; it
        is not an oversight and it is not a bug in `Music.stop`.

     3. The backdrop darkens monotonically across the sequence and
        is fully black for the last card. `--veil` on the screen
        element carries it so one CSS transition does all of it.

   Every beat is skippable (click, Space, Enter) and the whole
   thing is re-viewable from the title once the universe is
   cleared, because an ending you can only ever see once is an
   ending most players will only ever see half of.
   ============================================================ */

/**
 * The text.
 *
 * Original prose. The brief was: what happens when the lights of the
 * universe go out, plus a nod to Universal Paperclips and the idea of an
 * optimiser that eats all matter to satisfy a goal nobody bounded.
 *
 * `veil` is how black the backdrop is by the END of that beat, 0..1.
 * `mood` picks the type treatment. `music` is a one-shot cue fired when
 * the beat opens: 'in' starts the universe theme quietly, 'out' stops it.
 */
export const BEATS = [
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
  }

  /** True while the sequence owns the screen — Game routes keys on this. */
  get active() { return this.running; }

  start() {
    if (this.running) return;
    this.running = true;
    this.idx = -1;
    this.el.style.setProperty('--veil', '0.35');
    this.el.classList.remove('hidden');
    this.next();
  }

  /** Advance now — the click/keypress path, and the auto-advance path. */
  next() {
    if (!this.running) return;
    if (this.idx >= 0 && BEATS[this.idx] && BEATS[this.idx].hold) { this.done(); return; }
    this.idx++;
    if (this.idx >= BEATS.length) { this.done(); return; }
    this._render(BEATS[this.idx]);
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
