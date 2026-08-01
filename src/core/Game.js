/* ============================================================
   Game state machine, main loop, persistence.
   ============================================================ */

import * as THREE from 'three';
import { Scene } from '../render/Scene.js';
import { CameraRig } from '../render/CameraRig.js';
import { Input } from './Input.js';
import { HUD } from '../ui/HUD.js';
import { Screens } from '../ui/Screens.js';
import { Coop } from '../ui/Coop.js';
import { Ending } from '../ui/Ending.js';
import { TouchControls, isCoarsePointer, PAN_RATE } from './Touch.js';
import { AudioEngine } from '../audio/AudioEngine.js';
import { Music } from '../audio/Music.js';
import { Sfx } from '../audio/Sfx.js';
import { Katamari, TUNING, stageSpeedFor } from '../world/Katamari.js';
import { World } from '../world/World.js';
import { buildCatalog, ARCHETYPES } from '../world/props/index.js';
import { quantumStage } from '../world/stages/quantum.js';
import { atomStage } from '../world/stages/atom.js';
import { microbeStage } from '../world/stages/microbe.js';
import { houseStage } from '../world/stages/house.js';
import { townStage } from '../world/stages/town.js';
import { cityStage } from '../world/stages/city.js';
import { countryStage } from '../world/stages/country.js';
import { worldStage } from '../world/stages/world.js';
import { solarStage } from '../world/stages/solar.js';
import { galaxyStage } from '../world/stages/galaxy.js';
import { universeStage } from '../world/stages/universe.js';
import { clamp, formatSize, formatSizeShort, makeRng } from '../util/math.js';
import { CHEERS, BIG_CATCH, KNOCKS, pick } from '../ui/quips.js';

/** Show the end-of-round finder once this many collectables or fewer remain. */
const FINDER_AT = 12;

/**
 * Seconds Enter must be held to abandon a round.
 *
 * Enter already meant "finish early", and there was no mid-round exit at all
 * other than Esc into the pause menu — which a player who has just pressed
 * Escape to get their mouse cursor back does not necessarily read as a menu.
 * So Enter now carries both: a tap finishes (unchanged, and still only once the
 * goal is met), a hold quits. Long enough that nobody leaves a round they were
 * enjoying by fumbling the finish key; short enough that it is not a chore.
 */
const QUIT_HOLD = 0.85;

import '../world/props/quantum.js';
import '../world/props/atom.js';
import '../world/props/microbe.js';
import '../world/props/house.js';
import '../world/props/town.js';
import '../world/props/city.js';
import '../world/props/country.js';
import '../world/props/world.js';
import '../world/props/solar.js';
import '../world/props/galaxy.js';
import '../world/props/universe.js';
import '../world/props/nature.js';
import '../world/props/ai.js';

const SAVE_KEY = 'claudemary-llmaci-save-v1';
/* Smallest to largest. The whole game is one continuous zoom: sub-nucleon foam
   to the observable universe, about 40 orders of magnitude, with the house
   sitting near the middle of it. Order matters — `loadStage` walks this array
   for "next stage", the stage-select cards unlock in sequence, and clearing the
   LAST one ends the game (see `finish`). */
const STAGES = [
  quantumStage, atomStage, microbeStage,           // smaller than a speck of dust
  houseStage, townStage, cityStage, countryStage,  // the human band
  worldStage, solarStage, galaxyStage, universeStage,
];

/**
 * Sizes that trigger the "you got bigger" banner, derived PER STAGE.
 *
 * This used to be a hard-coded metric list from 1cm to 500m, which worked
 * exactly as long as every stage lived in that band. It does not any more: the
 * atom stage runs 0.1 -> 3.2 and the country stage 50 -> 1600, so one fixed
 * list would fire twelve times in the first three seconds of one and never at
 * all in the other. A geometric ladder is also the honest shape — what feels
 * like "getting bigger" is a constant RATIO, not a constant number of metres.
 */
function milestonesFor(stage) {
  const out = [];
  const top = stage.goal * 1.6;
  // ~1.35x per rung gives about 12 banners across a stage, which matches the
  // cadence the hand-written metric list happened to have in the house.
  for (let d = stage.startSize * 1.35; d < top; d *= 1.35) out.push(d);
  return out;
}

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.scene = new Scene(canvas);
    this.rig = new CameraRig(this.scene.camera);
    this.input = new Input(canvas);
    this.hud = new HUD();
    this.audio = new AudioEngine();
    this.music = new Music(this.audio);
    this.sfx = new Sfx(this.audio);
    this.screens = new Screens(this);
    this.ending = new Ending(this);
    this.touch = new TouchControls();
    /* The sensor going live is asynchronous and arrives AFTER the permission
       resolves, so the control overlay has to be laid out from this rather than
       from the grant. See the note on `onLive`. */
    this.touch.onLive = () => {
      this.screens.refreshTiltUi(this.touch);
      if (this.state === 'intro') this.screens.showTiltPrompt(this.touch);
    };

    /* ⚠ NULL UNTIL THE PLAYER ASKS FOR IT, AND THAT IS THE OPT-IN.
       No RTCPeerConnection is constructed, no socket opened and no address
       resolved until somebody presses a button — so a person who merely loads
       the page has exactly the exposure they had before multiplayer existed,
       which is none. The CSP cannot enforce this: `connect-src` does not cover
       WebRTC and no shipping browser implements the spec's `webrtc` directive.
       It is enforced here, by this being null, and nowhere else. */
    this.net = null;
    /* The panel that can set it. Constructing this opens nothing — see the
       header of src/ui/Coop.js; every path in it starts at a button press. */
    this.coop = new Coop(this);

    this.state = 'loading';
    this.stage = null;
    this.world = null;
    this.kat = null;
    this.timeLeft = 0;
    this.goalMet = false;
    this.milestoneIdx = 0;
    this.lastTickSecond = -1;
    this.accum = 0;
    this.lastFrame = 0;
    this.rng = makeRng(0x5eed);
    this.quitHold = 0;
    /* Enter is held down at the moment the round starts more often than you
       would guess — it is how you dismiss the intro screen. Without this latch
       that same uninterrupted press would tick the quit timer straight through
       and dump the player back to the title before they had moved. Set on
       begin/resume, cleared the first time Enter is seen released. */
    this._quitLatch = false;

    this.options = {
      music: 0.65, sfx: 0.8, sensitivity: 1, invertY: false, quality: 'med', shadows: true,
      /* Player-facing name for TUNING.speedP, 0..1 -> exponent 0..1. Exposed
         because it is the one number that cannot be settled from the outside:
         it trades "the world accelerates at you" against "you crawl once you
         are huge", both of which are real, and the balance bot cannot see the
         second one at all (it knows where every prop is, so a slow endgame
         search costs it nothing). */
      speedCurve: TUNING.speedP,
      /* Whether the player has actually moved the slider. A saved default is
         indistinguishable from a chosen value once it is in localStorage, so
         without this flag the FIRST shipped default a player ever saw would be
         pinned in their browser forever and every later retune would silently
         miss them — which is exactly the audience a retune is aimed at. Only
         `setOption` sets it. */
      speedCurveSet: false,
      /* 'auto' | 'touch' | 'keys'. Auto follows the pointer type, which is the
         right answer on a phone and on a desktop; the override exists for the
         awkward middle — a touchscreen laptop, where a coarse pointer is
         available but a keyboard is what the player actually wants. */
      controls: 'auto',
      /* 'tilt' | 'buttons' — how touch play turns. Tilt frees the left thumb
         entirely; buttons are steadier if you are lying down. Falls back to
         buttons on its own with no sensor, so this is a preference, not a
         dependency. */
      turn: 'tilt',
      /* Multiplier on both tilt bands, 0.6..1.6. How far a wrist wants to
         travel for full deflection is posture-dependent — sitting up, lying
         down, one-handed — so there is no value that is right for everyone and
         no measurement here can find one. Shipped as a slider rather than as a
         constant plus a round trip every time it feels wrong. */
      tiltRange: 1,
      /* MAGNET, 0..1, scaled by TUNING.magnetMax into extra reach.
         Defaulted in `_load` rather than here, because the right value differs
         by input device and the honest default on a phone is not the honest
         default on a desktop — see the note there. */
      magnet: 0,
      magnetSet: false,
      /* CAMERA ZOOM, multiplying each stage's own chase distance. 1 = as the
         stage was designed. Not clamped tighter than the slider because the
         rig already refuses to leave the stage bounds or sink through the
         floor, so the failure mode at the extremes is "the view stops getting
         wider", not a broken camera. */
      zoom: 1,
      /* Fart mode. Deliberately NOT given an Options row — it is unlocked by
         tapping the play area ten times and the discovery is most of the joke.
         It lives in `options` rather than in `save` so that Reset Progress
         keeps it: it is a preference, not something you earned, and somebody
         replaying the ladder has not asked to be made serious again. */
      fart: false,
    };
    this.save = { best: {}, cleared: [], found: [] };

    this._load();
    this.screens.syncOptions(this.options);
    this._applyControlMode();
    /* Restore the easter egg across reloads. `_load` fills `this.options` but
       `Sfx` holds the live flag, and nothing else copies it across — without
       this line the mode silently switches itself off every refresh and reads
       as a bug rather than as a joke. */
    this.sfx.fartMode = !!this.options.fart;

    window.addEventListener('resize', () => this.scene.resize());
    this.input.onKey = (code) => this._onKey(code);
    this.input.onKeyUp = (code) => this._onKeyUp(code);
    canvas.addEventListener('click', () => {
      /* Pointer lock is a mouse concept and asking for it on a phone throws a
         permission error into the console on every tap. */
      if (this.state === 'playing' && !this.touch.enabled) {
        this._ensureAudio();
        this.input.requestLock();
      }
    });
    /* THE TEN-TAP EASTER EGG. `pointerdown`, not `click`, so it counts a mouse
       and a thumb identically — and on the canvas specifically, so it only
       fires in the play area. The mobile control buttons are separate elements
       with their own handlers, so hammering DASH does not accidentally unlock
       anything. */
    canvas.addEventListener('pointerdown', () => this._secretTap());
  }

  /**
   * Ten taps in the play area toggles fart mode. Yes, really.
   *
   * ⚠ A ROLLING WINDOW, NOT A CONSECUTIVE-GAP TEST. The first version reset the
   * count whenever two taps were more than 900ms apart, which worked with a
   * mouse and failed on every phone — reported as "clicking the mouse 10 times
   * works, but tapping the screen doesn't".
   *
   * Two things conspired. Safari has ignored `user-scalable=no` for years, so
   * double-tap-to-zoom was still live on the canvas and every rapid tap sat in
   * a hold-off while the browser waited to see whether another was coming;
   * measured, taps dispatched 60ms apart arrived 1.5-2.9 SECONDS apart. And a
   * consecutive-gap rule is brittle by design: one slow tap anywhere in the ten
   * throws away all the progress before it, which on a phone is most attempts.
   * `touch-action: none` on `#scene` fixes the delay; this fixes the fragility.
   *
   * Keeping the last N timestamps and asking "were there ten inside six
   * seconds" tolerates an uneven rhythm completely while still being something
   * nobody does by accident. Six rather than four because the cost of being
   * generous here is essentially zero: on a phone, tapping the play area does
   * nothing else whatsoever — pointer lock is desktop-only — so there is no
   * ordinary interaction to collide with, and a player who has been told "tap
   * it a bunch of times" should not have to be told how FAST.
   *
   * Toggling rather than latching matters just as much: it persists in the
   * save, so without a way back the only cure for a joke that stopped being
   * funny would be Reset Progress, which also throws away every stage you
   * cleared.
   */
  _secretTap() {
    if (this.state !== 'playing') return;
    const now = performance.now();
    const WINDOW = 6000;
    const NEEDED = 10;
    const taps = (this._taps = this._taps || []);
    taps.push(now);
    // Drop anything that has aged out, and never let the list grow unbounded.
    while (taps.length && now - taps[0] > WINDOW) taps.shift();
    if (taps.length < NEEDED) return;
    taps.length = 0;

    const on = !this.sfx.fartMode;
    this.sfx.fartMode = on;
    this.options.fart = on;
    this._persist();
    this._ensureAudio();
    this.hud.banner(on ? "OK I guess we're 10!" : 'grown up again');
    /* Play one immediately at a middling size. Without it the unlock is a
       banner and a promise, and the next pickup might be a hundred metres
       away — the payoff has to land while the banner is still on screen. */
    if (on) this.sfx.fart(0.45);
  }

  /* ------------------------------------------------------------
     Boot
     ------------------------------------------------------------ */

  async boot() {
    this.screens.show('loading');
    this.screens.setLoading(pickLoading());
    await frame();
    const t0 = performance.now();
    buildCatalog();
    this.screens.setLoading(`${ARCHETYPES.length} kinds of thing ready…`);
    await frame();

    this.scene.setQuality(this.options.quality);
    this.scene.setShadows(this.options.shadows);
    this.buildTime = performance.now() - t0;

    this.kat = new Katamari(this.scene.material, 0.05);
    this.scene.scene.add(this.kat.group);
    this.kat.group.visible = false;

    this.screens.buildStageCards(STAGES, this.save);
    this.toTitle();
    this.lastFrame = performance.now();
    requestAnimationFrame((t) => this._loop(t));
  }

  _ensureAudio() {
    if (!this.audio.ready) {
      this.audio.init();
      this.audio.setMusicVolume(this.options.music);
      this.audio.setSfxVolume(this.options.sfx);
      this.sfx.startRoll();
      if (this.state === 'playing') this.music.play(this.stage.id);
      else this.music.play('menu');
    }
    this.audio.resume();
  }

  /* ------------------------------------------------------------
     Persistence
     ------------------------------------------------------------ */

  _load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      /* FIRST RUN ON A PHONE gets cheaper defaults, and only the first run.
         A mid-range phone rendering the city at 1.3M triangles with a 2048
         shadow map and a devicePixelRatio of 3 is asking for about nine times
         the fill rate of the desktop default, which reads as "the game is
         broken" rather than "the settings are wrong". Gated on there being no
         save at all, so a returning player's own choices are never overwritten
         — the same trap `speedCurveSet` exists to avoid. */
      if (!raw && isCoarsePointer()) {
        this.options.quality = 'low';
        this.options.shadows = false;
      }
      if (raw) {
        const d = JSON.parse(raw);
        this.save = { best: d.best || {}, cleared: d.cleared || [], found: d.found || [] };
        const shipped = TUNING.speedP;
        if (d.options) Object.assign(this.options, d.options);
        /* A saved speed curve the player never chose is just an old build's
           default, and honouring it would mean anyone who has played before
           never sees a retune. Only a slider they actually moved wins. */
        if (!this.options.speedCurveSet) this.options.speedCurve = shipped;
        // `speedCurve` lives in a module-level constant, so it has to be pushed
        // back out rather than just sitting in `this.options`.
        if (typeof this.options.speedCurve === 'number') TUNING.speedP = this.options.speedCurve;
      }
      /* THE MAGNET DEFAULT IS DEVICE-DEPENDENT, and that is the point of it.
         A mouse gives pixel-accurate steering; tilt is an analogue control with
         a dead zone, read on a screen where a collectable thing can be a few
         pixels across. One default cannot be right for both, and picking the
         desktop one for everybody is how a feature ends up doing nothing for
         the people who asked for it.

         ⚠ AFTER the merge, not before. Running it first would apply the
         device default and then have the saved value overwrite it, which is
         both pointless and exactly backwards. Re-applied on EVERY load until
         the player moves the slider — the same trap `speedCurveSet` exists to
         avoid, and for the same reason: a shipped default frozen into
         somebody's localStorage is a retune that silently misses its whole
         audience. */
      if (!this.options.magnetSet) this.options.magnet = isCoarsePointer() ? 0.5 : 0.25;
    } catch { /* corrupt or unavailable storage — start fresh */ }
  }

  _persist() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ ...this.save, options: this.options }));
    } catch { /* private browsing — scores just won't stick */ }
  }

  /**
   * Throw away everything the save remembers about PROGRESS, keeping settings.
   *
   * Progress persisting between loads is the point of a save, but it also means
   * a player who wants to see the ladder open up again has no way to ask for
   * that — the only route was clearing site data by hand. Volume, camera and
   * quality are not progress and are deliberately kept: nobody asking to replay
   * the game is also asking to have the music turned back up to a level they
   * already rejected.
   */
  resetProgress() {
    this.save = { best: {}, cleared: [], found: [] };
    this._persist();
    this.screens.buildStageCards(STAGES, this.save);
    this.screens.setEndingAvailable(false);
  }

  /* ------------------------------------------------------------
     Options
     ------------------------------------------------------------ */

  /** Stage ids in ladder order — the harness enumerates stages through this. */
  stageIds() { return STAGES.map((s) => s.id); }

  /**
   * Stages the player may host, in ladder order.
   *
   * `all` exists for the JOINING side. Being invited to a stage is not the same
   * as choosing it: refusing to load a friend's game because you have not
   * personally unlocked the city would be a lock protecting nothing — you are
   * not banking progress, you are playing along with someone who has. The
   * unlock ladder still governs what you can start on your own.
   */
  unlockedStages(all = false) {
    if (all) return STAGES.slice();
    return STAGES.filter((s, i) => i === 0 || this.save.cleared.includes(STAGES[i - 1].id)
      || this.save.cleared.includes(s.id));
  }

  /**
   * Both halves are connected and agree on the world. Hand back to the normal
   * intro screen rather than starting immediately: iOS will not unlock audio
   * outside a user gesture, and the tap that dismisses this intro is that
   * gesture. It also means neither player is dropped into a round they were not
   * looking at because the other one finished pasting first.
   */
  coopLinked() {
    if (!this.stage) return;
    this.screens.showIntro(this.stage);
    this.screens.showTiltPrompt(this.touch);
    this.screens.setCoopIntro(true);
    this.state = 'intro';
  }

  /**
   * Decide whether this session is played with thumbs or with a keyboard, and
   * reshape the UI to match.
   *
   * Detection is by POINTER TYPE, never by user agent — a UA string tells you
   * what a browser wants you to think it is, and gets it wrong for tablets,
   * desktop-mode phones and every device released after the string was written.
   * `(pointer: coarse)` plus a touch point tells you what the player's hand is
   * actually doing, which is the only thing that matters here.
   */
  _applyControlMode() {
    const want = this.options.controls === 'auto' ? isCoarsePointer() : this.options.controls === 'touch';
    this.touch.enabled = want;
    this.touch.turnMode = this.options.turn || 'tilt';
    this.touch.rangeMul = this.options.tiltRange || 1;
    document.body.classList.toggle('touch', want);
    this.screens.setTouchMode(want, this.touch);
    if (!want) this.touch.releaseAll();
  }

  setOption(key, value) {
    this.options[key] = value;
    if (key === 'music') this.audio.setMusicVolume(value);
    if (key === 'sfx') this.audio.setSfxVolume(value);
    if (key === 'sensitivity') this.input.sensitivity = value;
    if (key === 'invertY') this.input.invertY = value;
    if (key === 'quality') this.scene.setQuality(value);
    if (key === 'shadows') this.scene.setShadows(value);
    /* Safe to write straight through: Options is reachable only from the title,
       never from the pause screen, so this can never move top speed under a
       katamari that is already rolling. If Options ever gets added to the pause
       menu, defer this to `loadStage` — every control rate is a multiple of top
       speed, so changing it mid-roll would make the ball lurch. */
    if (key === 'speedCurve') { TUNING.speedP = value; this.options.speedCurveSet = true; }
    /* Live, unlike speedCurve — the magnet is read fresh from `kat.magnet` on
       every collision pass, so writing it straight through is safe even
       mid-round, and it is the one setting where being able to feel the change
       while you move the slider is worth something. */
    if (key === 'magnet') {
      this.options.magnetSet = true;
      if (this.kat) this.kat.magnet = value * TUNING.magnetMax;
    }
    // Also live: the rig reads it every frame, and a zoom you cannot see
    // yourself changing is a zoom nobody can set correctly.
    if (key === 'zoom') this.rig.zoom = value;
    if (key === 'controls' || key === 'turn' || key === 'tiltRange') this._applyControlMode();
    this._persist();
  }

  /* ------------------------------------------------------------
     Navigation
     ------------------------------------------------------------ */

  toTitle() {
    this.state = 'title';
    /* Leaving for the title ENDS a co-op session, and ends it properly: the
       peer is closed, the ghost meshes are disposed and `net` goes back to
       null. Anything less would leave a data channel open behind a menu, which
       is the state this whole design exists to make impossible. */
    this.coop.close();
    /* Silence the continuous rolling voice. It is started once and runs for the
       life of the page, so anything that leaves a round has to close the gate or
       the hiss follows you to the menu — which it did. */
    this.sfx.setRolling(false);
    this.touch.releaseAll();
    this.quitHold = 0;
    this.hud.setQuitHold(0);
    this.hud.hide();
    this.input.enabled = false;
    this.input.releaseLock();
    if (this.world) { this.world.dispose(); this.scene.scene.remove(this.world.root); this.world = null; }
    if (this.kat) this.kat.group.visible = false;
    this.scene.setSky({ top: 0x6fc6ee, bottom: 0xdff0e4, fog: 0xdff0e4, fogNear: 60, fogFar: 400 });
    this.scene.setSun({ x: 0.5, y: 1, z: 0.4 }, 1.0);
    this.screens.buildStageCards(STAGES, this.save);
    this.screens.setEndingAvailable(this.save.cleared.includes(STAGES[STAGES.length - 1].id));
    this.screens.show('title');
    if (this.audio.ready) this.music.play('menu');
  }

  /* ------------------------------------------------------------
     The ending
     ------------------------------------------------------------ */

  /**
   * Play the closing sequence.
   *
   * NOTE the deliberate absence of a `world.dispose()` here. The sequence is
   * meant to run over the universe stage with the katamari the player just
   * finished still turning behind the text, and `_stepIdle` picks that up from
   * `this.world` being non-null. `onEndingDone` is what finally tears it down.
   */
  showEnding() {
    if (this.ending.active) return;
    this.state = 'ending';
    this.input.enabled = false;
    this.input.releaseLock();
    this.sfx.setRolling(false);
    this.hud.hide();
    this.screens.hideAll();
    this.music.stop();
    this.ending.start();
  }

  onEndingDone() {
    this.toTitle();
  }

  onAction(action, el) {
    switch (action) {
      case 'play':
        this._ensureAudio();
        this.screens.buildStageCards(STAGES, this.save);
        this.screens.show('select');
        this.state = 'select';
        break;
      /* ---- play with a friend ----
         Every one of these is a button press, and that is the point: no
         connection object exists in this process until one of them runs. */
      case 'coop': this._ensureAudio(); this.state = 'coop'; this.coop.open(); break;
      case 'coop-host': this.coop.chooseHost(); break;
      case 'coop-join': this.coop.chooseJoin(); break;
      case 'coop-make': this.coop.makeInvite(); break;
      case 'coop-go': this.coop.go(); break;
      case 'coop-copy': this.coop.copy(); break;
      case 'coop-share': this.coop.share(); break;
      case 'coop-room-join': this.coop.joinRoom(); break;
      case 'coop-cancel': this.coop.cancel(); break;
      case 'how': this.screens.show('how'); this.state = 'how'; break;
      case 'options': this.screens.syncOptions(this.options); this.screens.show('options'); this.state = 'options'; break;
      case 'collection': this.screens.showCollection(this.save); this.state = 'collection'; break;
      case 'back-title': this.toTitle(); break;
      case 'pick-stage': {
        const s = STAGES.find((x) => x.id === el.dataset.stage);
        if (s) this.loadStage(s);
        break;
      }
      case 'begin': if (this.state === 'intro') this.begin(); break;
      case 'resume': this.resume(); break;
      case 'finish-now':
        if (this.state === 'paused' && (this.goalMet || this.exhausted)) {
          this.screens.hideAll();
          this.finish(this.exhausted ? 'cleared' : 'early');
        }
        break;
      case 'restart': this.loadStage(this.stage); break;
      case 'quit': this.toTitle(); break;
      case 'retry': this.loadStage(this.stage); break;
      case 'ending': this.showEnding(); break;
      case 'pause-touch': this.pause(); break;
      case 'finish-touch':
        // The finish chip IS the button on a phone; there is no Enter to tap.
        if (this.state === 'playing' && (this.goalMet || this.exhausted)) {
          this.sfx.ui('confirm');
          this.finish(this.exhausted ? 'cleared' : 'early');
        }
        break;
      case 'enable-tilt':
        /* MUST stay on the synchronous path from the tap. iOS only hands over
           the sensor from inside a user gesture, and a request that starts in a
           timer resolves 'denied' without ever showing the dialog. */
        this.touch.requestTilt().then(() => {
          this.screens.refreshTiltUi(this.touch);
          this.screens.showTiltPrompt(this.touch);
        });
        break;
      case 'reset-progress':
        // Two clicks, handled in Screens — there is no undo for this.
        if (this.screens.confirmReset()) this.resetProgress();
        break;
      case 'next': {
        const i = STAGES.indexOf(this.stage);
        if (i >= 0 && i < STAGES.length - 1) this.loadStage(STAGES[i + 1]);
        break;
      }
      default: break;
    }
  }

  _onKey(code) {
    if (this.state === 'ending') {
      // Anything advances it, so nobody is ever trapped reading.
      if (code === 'Space' || code === 'Enter' || code === 'NumpadEnter' || code === 'Escape') this.ending.next();
      return;
    }
    if (this.state === 'playing') {
      if (code === 'Escape' || code === 'KeyP') { this.pause(); return; }
      if (code === 'KeyR') { this.loadStage(this.stage); return; }
      if (code === 'KeyM') { this.audio.setMuted(!this.audio.muted); return; }
      if (code === 'Space') { this.rig.flip(); this.sfx.ui('move'); return; }
      /* Enter is NOT acted on here any more, in either of its meanings. The hold
         is measured in `_stepPlaying` off the key's down-state, and the tap can
         only be recognised once the key comes back up without having reached the
         hold threshold — see `_onKeyUp`. */
    } else if (this.state === 'paused') {
      if (code === 'Escape' || code === 'KeyP') this.resume();
    } else if (this.state === 'coop') {
      /* Escape backs out of an attempt without leaving the game. It cannot
           reach here from inside the invite box — Input.js ignores keys aimed
           at text fields — so it is unambiguous. */
      if (code === 'Escape') { this.sfx.ui('back'); this.coop.cancel(); }
    } else if (this.state === 'intro') {
      if (code === 'Space' || code === 'Enter') this.begin();
    } else if (this.state === 'results') {
      /* Once the last stage is cleared the ending is what Enter means, because
         at that point it is the primary button on the panel and "roll again"
         has been demoted. */
      if (code === 'Enter') {
        if (this._endingOffered) this.showEnding();
        else this.loadStage(this.stage);
      }
    }
  }

  _onKeyUp(code) {
    if (code !== 'Enter' && code !== 'NumpadEnter') return;
    if (this.state !== 'playing') return;
    /* CLEAR THE LATCH HERE, not only in the frame loop.
     *
     * The loop clears it on any frame where Enter is up, which sounds equivalent
     * and is not: releasing and re-pressing inside a single frame means no frame
     * ever observes the key up, so the latch stays set and hold-to-quit stops
     * working silently for the rest of the round. That window is ~16ms at 60fps
     * — a fast double-tap — and much wider on a slow machine, which is how
     * `test-ui` found it. keyup cannot be missed; the frame check stays as the
     * backstop for window blur, which clears the key set without firing one. */
    this._quitLatch = false;
    const held = this.quitHold;
    this.quitHold = 0;
    this.hud.setQuitHold(0);
    // A tap is the old behaviour, unchanged: finish early, and only once there
    // is something worth banking. Before the goal this is just quitting, which
    // is what the hold is for.
    if (held < QUIT_HOLD && (this.goalMet || this.exhausted)) {
      this.sfx.ui('confirm');
      this.finish(this.exhausted ? 'cleared' : 'early');
    }
  }

  /* ------------------------------------------------------------
     Stage lifecycle
     ------------------------------------------------------------ */

  /**
   * @param {object} stage
   * @param {{then?: () => void}} [opts] `then` replaces the jump to the intro
   *   screen, which is what the co-op panel uses to build the world first and
   *   keep the player on its own screen while the connection is negotiated.
   *   `Session.hash` is derived from the loaded stage and its prop count, so a
   *   handshake sent before the build would announce the wrong world.
   */
  loadStage(stage, opts = {}) {
    this.stage = stage;
    /* ⚠ RESEED. `this.rng` is built ONCE in the constructor and handed to
       `world.resolve(kat, H, this.rng)` on EVERY TICK, and `Katamari.knockOff`
       draws from it to choose which attached pieces are shaken loose — which
       sets volLost, then volume, then radius. That is physics, not decoration.
       Without this line the stream position at the start of a round depends on
       everything you did earlier in the session, so the same stage played twice
       is two different games and no run is reproducible. Measured: shifting the
       stream by a single draw moved a final diameter from 287.8427 to 287.0252.
       Derived from the stage seed so a given stage always starts identically,
       and offset so it is not the same stream the world builder just used. */
    this.rng = makeRng(((stage.seed ?? 12345) ^ 0x5eed) >>> 0);
    this.screens.show('loading');
    this.screens.setLoading(`${pickLoading()}  ·  ${stage.name}`);
    this.hud.hide();
    this.state = 'loading';

    // Give the browser a frame to paint the loading screen before the
    // (synchronous, and not cheap) world build blocks the thread.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (this.world) { this.world.dispose(); this.scene.scene.remove(this.world.root); }
      this.world = new World(this.scene.material).build(stage);
      this.scene.scene.add(this.world.root);
      this.scene.setSky(stage.sky);
      this.scene.setSun(stage.sun, stage.sun.intensity);
      this.scene.setShadows(this.options.shadows);

      const spawnY = this.world.groundAt(stage.spawn.x, stage.spawn.z);
      // Speed and weight are anchored to this stage's own scale, so a 5m
      // katamari opening the city feels like a 5cm one opening the house.
      const width = stage.bounds.maxX - stage.bounds.minX;
      const span = Math.max(4, (stage.goal * 1.5) / stage.startSize);
      this.kat.setStageProfile(stage.startSize, stageSpeedFor(stage), span);
      this.kat.magnet = (this.options.magnet || 0) * TUNING.magnetMax;
      this.kat.reset(stage.startSize / 2, new THREE.Vector3(stage.spawn.x, isFinite(spawnY) ? spawnY : 0, stage.spawn.z));
      this.kat.group.visible = true;
      this.rig.configure(stage.camera, Math.PI);
      // `configure` resets the rig to the stage's own numbers, so the player's
      // zoom has to be re-applied after it or it silently reverts every round.
      this.rig.zoom = this.options.zoom || 1;
      this.rig._initialised = false;
      this.rig.update(0.016, this.kat, this.world);

      this.timeLeft = stage.time;
      this.goalMet = false;
      this.exhausted = false;
      this.exhaustedIn = 0;
      this._finderPts = null;
      this._lastQuip = -1e9;
      this.nextExhaustCheck = 0;
      this.milestones = milestonesFor(stage);
      this.milestoneIdx = 0;
      this.lastTickSecond = -1;
      this.foundThisRun = new Set();

      this.hud.reset(stage);

      /* ⚠ THE WORLD UNDER A LIVE CO-OP SESSION HAS JUST CHANGED, so tell it.
         Prop indices only mean anything relative to one stage's prop table —
         "Roll Again" or "Next Stage" while connected would otherwise have both
         players deleting each other's scenery by index in two different worlds,
         which looks like a physics bug and is not one. `resync` suspends the
         exchange until the peer announces the same world, so whoever moves
         first simply waits for the other to catch up. It must run HERE, after
         the build, because the hash it announces is derived from the prop count
         that only exists once `new World(...)` has returned. */
      if (this.net) this.net.resync();

      if (opts.then) {
        // The co-op panel owns the screen; it puts itself back up.
        this.state = 'coop';
        opts.then();
      } else {
        this.screens.setCoopIntro(!!this.net);
        this.screens.showIntro(stage);
        this.screens.showTiltPrompt(this.touch);
        this.state = 'intro';
      }
      if (this.audio.ready) { this.music.play(stage.id); this.music.setIntensity(0.4); this.music.setHurry(false); }
    }));
  }

  begin() {
    this._ensureAudio();
    this.state = 'playing';
    this.sfx.setRolling(true);
    this.input.enabled = true;
    this.input.requestLock();
    this.screens.hideAll();
    this.hud.show();
    this.accum = 0;
    this.quitHold = 0;
    this._quitLatch = this.input.down('Enter', 'NumpadEnter');
    /* Zero the tilt to however the phone is being held RIGHT NOW. Nobody holds
       a phone flat, and beta is 0 lying on a table — so an uncalibrated neutral
       reads a comfortable 50-degree reading angle as permanent full throttle. */
    this.touch.releaseAll();
    this.touch.calibrate();
    this.lastFrame = performance.now();
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.input.enabled = false;
    this.input.releaseLock();
    this.screens.setFinishAvailable(this.goalMet || this.exhausted);
    this.screens.show('pause');
    this.sfx.setRolling(false);
    this.touch.releaseAll();
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.sfx.setRolling(true);
    this.input.enabled = true;
    this.input.requestLock();
    this.screens.hideAll();
    this.quitHold = 0;
    this._quitLatch = this.input.down('Enter', 'NumpadEnter');
    this.lastFrame = performance.now();
  }

  /** @param {'time'|'cleared'|'early'} reason why the round ended */
  finish(reason = 'time') {
    if (this.state === 'results') return;
    this.state = 'results';
    this.input.enabled = false;
    this.input.releaseLock();
    this.quitHold = 0;
    this.hud.setQuitHold(0);
    this.hud.hide();
    this.sfx.setRolling(false);
    this.touch.releaseAll();
    this.sfx.timeUp();
    this.music.stop();

    const d = this.kat.diameter;
    const prev = this.save.best[this.stage.id] || 0;
    const isBest = d > prev;
    if (isBest) this.save.best[this.stage.id] = d;
    for (const id of this.foundThisRun) if (!this.save.found.includes(id)) this.save.found.push(id);

    const idx = STAGES.indexOf(this.stage);
    const res = this.screens.showResults(this.stage, this.kat, this.save,
      idx === STAGES.length - 1, reason, this.world ? this.world.collectedFraction() : 0);
    if (res.cleared && !this.save.cleared.includes(this.stage.id)) this.save.cleared.push(this.stage.id);
    /* Clearing the last stage is the end of the game, so the panel offers the
       ending as its primary button and Enter means that instead of "again".
       Remembered here because `_onKey` cannot re-derive it — `showResults` owns
       the ratio test that decides whether this counts as cleared. */
    this._endingOffered = idx === STAGES.length - 1 && res.cleared;
    this._persist();

    setTimeout(() => {
      this.music.fanfare();
      setTimeout(() => this.sfx.voice(res.line, res.band === 'royal' ? 4 : 0), 1400);
    }, 320);
  }

  /* ------------------------------------------------------------
     Main loop
     ------------------------------------------------------------ */

  _loop(now) {
    requestAnimationFrame((t) => this._loop(t));
    const raw = (now - this.lastFrame) / 1000;
    this.lastFrame = now;
    const dt = clamp(raw, 0, 0.1);

    if (this.state === 'playing') this._stepPlaying(dt);
    else this._stepIdle(dt);

    this.hud.tickFeed(now);
    this.scene.render();
  }

  /** Slow orbit behind the menus so the scene is never dead. */
  _stepIdle(dt) {
    const cam = this.scene.camera;
    if (this.state === 'title' || !this.world) {
      this._menuAngle = (this._menuAngle || 0) + dt * 0.12;
      const r = 9;
      cam.position.set(Math.cos(this._menuAngle) * r, 4.4, Math.sin(this._menuAngle) * r);
      cam.lookAt(0, 1.2, 0);
      cam.near = 0.1; cam.far = 900; cam.updateProjectionMatrix();
      this.scene.followSky(cam.position, 900);
      this.scene.followSun(new THREE.Vector3(0, 0, 0), 1.5);
    } else if (this.kat) {
      if (this.stage) this.rig.fogFar = this.scene.updateFog(this.kat.diameter, this.stage.startSize, this.rig.zoom);
      const far = this.rig.update(dt, this.kat, this.world);
      this.scene.followSky(cam.position, far);
      this.scene.followSun(this.kat.group.position, this.kat.radius);
      this.scene.setFov(58, dt);
    }
  }

  _stepPlaying(dt) {
    const kat = this.kat;
    const world = this.world;

    /* ---- hold Enter to walk away ----
       Measured off the key's down-state rather than a keydown event because a
       held key only fires keydown once (auto-repeat is discarded in Input), so
       there is nothing to count except frames. Returns immediately on the way
       out: `toTitle` has already disposed the world this function is holding a
       reference to. */
    /* The touch quit button feeds the SAME timer as Enter, so there is one
       hold duration, one fill bar and one exit path in the whole game rather
       than a second half-implemented one for phones. */
    const enterDown = this.input.down('Enter', 'NumpadEnter');
    if (!enterDown) this._quitLatch = false;
    const holding = (enterDown && !this._quitLatch) || this.touch.quitHeld;
    if (holding) this.quitHold += dt; else this.quitHold = 0;
    this.hud.setQuitHold(this.quitHold / QUIT_HOLD);
    if (this.quitHold >= QUIT_HOLD) {
      this.sfx.ui('back');
      this.toTitle();
      return;
    }

    /* ---- camera input ---- */
    const look = this.input.takeLook();
    this.rig.input(look.dx, look.dy, this.options.sensitivity, this.options.invertY);
    const nudge = this.input.readCameraNudge();
    if (nudge) this.rig.yaw -= nudge * dt * 2.1;

    /* ---- fixed-step physics ----
       Touch and keyboard produce the SAME shape, so `Katamari.step` never
       learns which one it is being driven by and the physics needs no mobile
       branch at all. On a phone the tilt supplies forward/back only and the pan
       buttons swing the camera; because movement is camera-relative, that
       composes into steering without a second axis. Both are summed rather than
       switched, so a keyboard attached to a tablet still works. */
    const mv = this.input.readMove();
    this.touch.update(dt);          // advance the sensor filter, once per frame
    const tc = this.touch.read();
    if (tc.turn) this.rig.yaw -= tc.turn * dt * PAN_RATE;
    const inp = {
      moveX: clamp(mv.moveX + tc.moveX, -1, 1),
      moveZ: clamp(mv.moveZ + tc.moveZ, -1, 1),
      dash: this.input.dash || tc.dash,
    };
    /* Tilt is meaningless about one axis once the phone is on its side, so the
       round holds rather than driving off in a direction nobody asked for. */
    this.hud.setRotateHint(this.touch.needsRotate);
    if (this.touch.needsRotate) { inp.moveX = 0; inp.moveZ = 0; inp.dash = false; }
    this.accum += dt;
    const H = 1 / 120;
    let steps = 0;
    while (this.accum >= H && steps < 8) {
      kat.step(H, inp, this.rig.yaw, world);
      const events = world.resolve(kat, H, this.rng);
      if (events.length) this._handleEvents(events);
      this.accum -= H;
      steps++;
    }
    /* DO NOT THROW THE REMAINDER AWAY — CAP IT.
       This used to be `this.accum = 0`, which silently discarded simulation
       time whenever a frame needed more than 8 sub-steps. `dt` is clamped to
       0.1s and H is 1/120, so 8 steps covers 0.0667s: below about 15fps every
       frame hit the cap and the world quietly ran in slow motion, with the
       clock (which is wall-time) running on regardless. The player's round got
       shorter in game terms the worse their machine was, which is exactly
       backwards. Keeping one frame's worth lets a brief hitch catch up on the
       following frames; capping stops a long stall from banking seconds of
       simulation and then replaying it as a lurch. */
    if (steps === 8) this.accum = Math.min(this.accum, H * 8);
    // Once per frame, before the layout that reads it — it is animation, not
    // simulation, and must not run once per physics sub-step.
    kat.updateFlight(dt);
    kat.layoutAttached();
    world.update(dt, kat.diameter);

    /* ⚠ AFTER THE PHYSICS, AND THAT ORDERING IS THE POINT. Nothing the network
       delivers may influence the simulation this frame, and running it here
       rather than above makes that structural rather than a thing to remember.
       There is no PVP, so a remote value's only destinations are a ghost mesh's
       transform and `PropField.remove` — neither of which the simulation reads.
       See src/net/Session.js. Null and free when playing alone. */
    if (this.net) this.net.tick(dt, kat);

    /* ---- clock ---- */
    this.timeLeft -= dt;
    const sec = Math.ceil(this.timeLeft);
    if (sec !== this.lastTickSecond) {
      this.lastTickSecond = sec;
      if (sec <= 10 && sec > 0) { this.sfx.tick(sec <= 3); this.hud.countdown(sec); }
      if (sec === 30) this.music.setHurry(true);
    }
    if (this.timeLeft <= 0) { this.timeLeft = 0; this.finish('time'); return; }

    /* ---- nothing left to roll up? ---- */
    // Scanning the whole prop array is cheap (a typed-array compare per prop)
    // but pointless every frame, so sample it twice a second.
    this.nextExhaustCheck -= dt;
    if (!this.exhausted && this.nextExhaustCheck <= 0) {
      this.nextExhaustCheck = 0.5;
      if (!world.canStillGrow(kat.diameter)) {
        this.exhausted = true;
        this.exhaustedIn = 3.2;
        this.hud.banner('ALL ROLLED UP!');
        this.hud.flash(0.35);
        this.sfx.goal();
        this.hud.setExhausted(true);
      } else {
        /* Point at the stragglers once there are few enough to point at.
           Clearing a stage means collecting the LAST thing, and hunting a
           handful across a 4km city by eye is a search with no information
           rather than a test of anything. The threshold is deliberately low
           so this can never help you play — only help you finish. */
        this._finderPts = world.countCollectable(kat.diameter, FINDER_AT) <= FINDER_AT
          ? world.remainingCollectable(kat.diameter, FINDER_AT)
          : null;
      }
    }
    if (this._finderPts && !this.exhausted) this.hud.setFinder(this._finderPts, this.scene.camera);
    else this.hud.clearFinder();
    if (this.exhausted) {
      this.exhaustedIn -= dt;
      if (this.exhaustedIn <= 0) { this.finish('cleared'); return; }
    }

    /* ---- HUD ---- */
    const d = kat.diameter;
    this.hud.setSize(d, kat.justGrewTimer > 0.28);
    this.hud.setTimer(this.timeLeft);
    if (!this.goalMet && d >= this.stage.goal) {
      this.goalMet = true;
      this.sfx.goal();
      this.hud.setCanFinish(true);
      this.hud.banner('GOAL!');
      this.hud.flash(0.4);
    }
    this.hud.setGoalProgress(d, this.stage.goal, this.goalMet);
    this.hud.setStats(kat.collectedCount, kat.uniqueIds.size);
    this.hud.setSpeed(kat.speedFrac);

    /* ---- milestones ---- */
    while (this.milestoneIdx < this.milestones.length && d >= this.milestones[this.milestoneIdx]) {
      const m = this.milestones[this.milestoneIdx];
      this.hud.banner(Math.random() < 0.16 ? pick(CHEERS) : formatSizeShort(m, this.stage.unit));
      this.sfx.sizeUp(this.milestoneIdx);
      this.music.sizeUpSting(this.milestoneIdx);
      this.milestoneIdx++;
    }

    /* ---- adaptive score ---- */
    const prog = clamp(Math.log(Math.max(1e-6, d / this.stage.startSize)) /
      Math.log(this.stage.goal / this.stage.startSize), 0, 1.3);
    this.music.setIntensity(0.32 + prog * 0.72);

    /* ---- audio + camera ---- */
    this.sfx.updateRoll(kat.speedFrac, d, !kat.airborne, kat.lumpy);
    this.rig.fogFar = this.scene.updateFog(d, this.stage.startSize, this.rig.zoom);
    const far = this.rig.update(dt, kat, world);
    this.scene.followSky(this.scene.camera.position, far);
    this.scene.followSun(kat.group.position, kat.radius);
    this.scene.setFov(58 + clamp(kat.speedFrac - 0.5, 0, 1) * 9, dt);
  }

  _handleEvents(events) {
    for (const ev of events) {
      if (ev.type === 'pickup') {
        const rel = clamp(ev.size / Math.max(1e-6, this.kat.diameter), 0, 1);
        this.sfx.pickup(rel, ev.size);
        this.hud.pushPickup(ev.arch.name, rel);
        this.foundThisRun.add(ev.arch.id);
        // Tell the other player this one is gone. No-op when playing alone.
        if (this.net) this.net.notePickup(ev.idx);
        if (rel > 0.55) { this.rig.bump(rel * 0.5); this.hud.flash(0.18 * rel); }
        // Swallowing something near your own size is the one moment that
        // actually earns a "good catch". Throttled so it stays an event.
        const now = performance.now();
        if (rel > 0.62 && now - (this._lastQuip || -1e9) > 9000 && Math.random() < 0.55) {
          this._lastQuip = now;
          this.hud.banner(pick(BIG_CATCH));
        }
      } else if (ev.type === 'bump') {
        this.sfx.bump(ev.impact, this.kat.diameter);
        this.rig.bump(clamp(ev.impact, 0, 1) * 0.35);
      } else if (ev.type === 'knock') {
        this.sfx.knock(ev.count);
        this.hud.banner(pick(KNOCKS));
        this.rig.bump(0.8);
      }
    }
  }
}

const LOADING_LINES = [
  'Assembling the cosmos…',
  'Rolling up the cosmos…',
  'Warming the vertex ovens…',
  'Negotiating with the physics…',
  'Sampling from the prop distribution…',
  'Tokenising the furniture…',
  'Aligning the katamari with human values…',
  'Checking the context window for spare objects…',
  'Estimating how much fits on a ball…',
  'Composing something in the right key…',
  'Nothing here was downloaded. Everything here was computed…',
];
let _loadIdx = Math.floor(Math.random() * LOADING_LINES.length);
function pickLoading() {
  _loadIdx = (_loadIdx + 1) % LOADING_LINES.length;
  return LOADING_LINES[_loadIdx];
}

function frame() {
  return new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
}
