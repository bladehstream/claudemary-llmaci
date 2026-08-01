/* ============================================================
   "Play with a friend" — the panel, and the only place in the
   game that constructs a network connection.

   ⚠ THIS FILE IS THE OPT-IN. `Game.net` is null until something
   in here assigns it, and nothing in here runs without a button
   press. That matters more than it sounds: the Content Security
   Policy in public/_headers cannot help — `connect-src` does not
   cover WebRTC, and no shipping browser implements the spec's
   `webrtc` directive — so "a person who merely loads the page
   makes no connections and reveals no address" is enforced by
   this file's call graph and by nothing else. Every entry point
   below is reachable only from a `data-action` on a button.

   THE HONEST BIT, which the panel says out loud rather than
   burying: peer-to-peer means the two players' devices exchange
   IP addresses. That is not a flaw to be apologised for, it is
   what "no server" costs, and a player deciding whether to send
   an invite to a stranger deserves to know it before they do,
   not afterwards.

   Two signalling paths, one state machine:

     manual — pack a description into a base64 blob, the humans
       carry it between them, paste it back. Works with no server
       in the world. This is what ships.
     room — a six-character code through a Cloudflare Worker,
       enabled only when VITE_SIGNAL_URL is set at build time.
       Nothing here is reachable without it, so the shipped game
       has no signalling dependency at all.

   See src/net/Signal.js for why a short code is impossible
   without something in the middle.
   ============================================================ */

import { Session } from '../net/Session.js';
import { Peer } from '../net/Peer.js';
import { Code, Room, randomRoomCode } from '../net/Signal.js';

/* Baked at build time. Absent in the shipped build, which is why the room-code
   row is hidden and `Room` is never constructed. */
const SIGNAL_URL = (typeof import.meta !== 'undefined' && import.meta.env
  && import.meta.env.VITE_SIGNAL_URL) || '';

/** Room codes are drawn from an unambiguous alphabet; accept it case-insensitively. */
const CODE_RE = /^[A-Z0-9]{4,12}$/;

/**
 * Peer and Session statuses, in words a player can act on.
 *
 * Deliberately not a spinner with no text. `Peer`'s watchdog exists precisely
 * because ICE will sit in `checking` forever rather than report failure (see
 * the header of src/net/Peer.js), so the one thing this UI must never do is
 * imply that waiting longer will help when it will not.
 */
const SAY = {
  slow: 'Still working on it. Phones and unusual networks can take a few seconds.',
  'slow-relay': 'Still trying. Some networks never let two devices talk to each other '
    + 'directly — if this does not connect, that is usually why, and it is nothing you did.',
  open: 'Connected.',
  connected: 'Connected.',
  'stage-mismatch': 'Waiting for your friend to load this same stage.',
  'version-mismatch': 'Your friend is running a different version of the game. '
    + 'One of you needs to reload the page.',
  failed: 'Could not connect. Some networks — a lot of mobile ones — will not let two '
    + 'devices reach each other at all. Nothing you did wrong, and trying again rarely helps.',
  /* Deliberately NOT phrased as a failure. Nothing has gone wrong on the wire;
     the other player simply has not pasted the reply in yet, and after five
     minutes of that the useful thing to say is which of you is holding it up. */
  unanswered: 'Nothing came back. Your friend may not have pasted your reply in yet — '
    + 'if they still have it, they can, and you can start again from here if not.',
  ended: 'Your friend disconnected.',
  'room-full': 'Two people are already in that room.',
  'signal-closed': 'Lost the connection to the room.',
};

const $ = (id) => document.getElementById(id);

export class Coop {
  constructor(game) {
    this.game = game;
    this.role = null;         // 'host' | 'join'
    this.phase = 'busy';
    this.stage = null;
    this.peer = null;
    this.room = null;
    this.ice = null;          // TURN servers, if a room supplied any
    this.locked = false;
    this.linked = false;
    this._bound = false;
  }

  /** Room codes only exist if a signalling worker was configured at build time. */
  get roomsAvailable() { return !!SIGNAL_URL; }

  /** Some browsers, and some locked-down enterprise builds, have no WebRTC at all. */
  get available() { return typeof RTCPeerConnection === 'function'; }

  /* ------------------------------------------------------------
     Entry
     ------------------------------------------------------------ */

  open() {
    this._bind();
    this.game.screens.show('coop');
    this._reset();
    this._step('menu');
    const roomBlock = $('coop-room-block');
    if (roomBlock) roomBlock.classList.toggle('hidden', !this.roomsAvailable);
    if (!this.available) {
      this._step('exchange');
      this._phase('busy');
      this._say('This browser has no peer-to-peer support, so it cannot play with a '
        + 'friend. Everything else in the game works normally.', true);
    }
  }

  _bind() {
    if (this._bound) return;
    this._bound = true;
    /* Enter submits, because a paste-then-hunt-for-the-button is a bad enough
       interaction on a phone without it. Bound on the field rather than
       globally: Input.js deliberately ignores keys aimed at text fields. */
    const enter = (el, action) => {
      if (!el) return;
      el.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' || e.shiftKey) return;
        e.preventDefault();
        this.game.onAction(action);
      });
    };
    enter($('coop-in'), 'coop-go');
    enter($('coop-room-code'), 'coop-room-join');
    const code = $('coop-room-code');
    if (code) code.addEventListener('input', () => { code.value = code.value.toUpperCase(); });
  }

  /* ------------------------------------------------------------
     Host
     ------------------------------------------------------------ */

  /** Step one: which cosmos. The invite carries it, so only the host chooses. */
  chooseHost() {
    if (!this._precheck()) return;
    const sel = $('coop-stage-sel');
    if (sel) {
      sel.textContent = '';
      for (const s of this.game.unlockedStages()) {
        const o = document.createElement('option');
        o.value = s.id;
        // textContent, not innerHTML — the same discipline as the collection log.
        o.textContent = s.name;
        sel.appendChild(o);
      }
    }
    this._step('stage');
  }

  makeInvite() {
    const sel = $('coop-stage-sel');
    const stage = this.game.unlockedStages().find((s) => s.id === (sel && sel.value));
    if (!stage) return;
    this.role = 'host';
    this.stage = stage;
    this._step('exchange');
    this._phase('busy');
    this._say('Building the world…');
    /* The world FIRST, then the connection. `Session.hash` is derived from the
       loaded stage and its prop count, so a handshake sent before the build
       would announce the previous world — or none at all. */
    this.game.loadStage(stage, { then: () => this._hostWorldReady() });
  }

  async _hostWorldReady() {
    this.game.screens.show('coop');
    try {
      if (this.roomsAvailable) {
        this._say('Opening a room…');
        await this._openRoom(randomRoomCode(), (d) => this._hostGotAnswer(d));
      }
      this._newSession();
      this.peer = new Peer({
        initiator: true,
        iceServers: this.ice,
        onLocalDescription: (d) => this._offerReady(d),
      });
      this.game.net.add(this.peer);
      this._say('Working out how to reach you…');
      await this.peer.createOffer();
    } catch (err) {
      this._die('Could not start a connection on this device. ' + String(err && err.message || err));
    }
  }

  async _offerReady(desc) {
    if (!desc || !desc.sdp) return this._die('This device would not produce an invite.');
    if (this.room) {
      this.room.send(desc, this.stage.id);
      this._big(this.room.code);
      this._phase('host-room');
      this._say('Waiting for your friend to type that code in.');
      return;
    }
    this._out(await Code.pack(desc, this.stage.id));
    this._phase('host-manual');
    this._say('Waiting for their reply.');
  }

  /** The host's half of the manual exchange: paste the answer that came back. */
  async _hostAcceptPasted(text) {
    const d = await Code.unpack(text, this.game.stageIds());
    if (!d) return this._say('That does not look like a reply code. Copy the whole thing '
      + 'your friend sent back, including the very end of it.', true);
    if (d.type !== 'offer') return this._acceptAnswer(d);
    return this._say('That is an invite, not a reply — it looks like you both pressed '
      + '"Create an Invite". One of you should press "I Have an Invite" instead.', true);
  }

  _hostGotAnswer(d) {
    if (!d || d.type !== 'answer') return;
    this._acceptAnswer(d);
  }

  async _acceptAnswer(d) {
    if (!this.peer) return;
    this._lock(true);
    this._say('Connecting…');
    try {
      await this.peer.acceptAnswer({ type: 'answer', sdp: d.sdp });
    } catch (err) {
      this._lock(false);
      this._say('That reply was not usable: ' + String(err && err.message || err), true);
    }
  }

  /* ------------------------------------------------------------
     Join
     ------------------------------------------------------------ */

  chooseJoin() {
    if (!this._precheck()) return;
    this.role = 'join';
    this._step('exchange');
    this._phase('join-paste');
    this._say('');
    const box = $('coop-in');
    if (box) { box.value = ''; box.focus(); }
  }

  async _joinPasted(text) {
    const d = await Code.unpack(text, this.game.stageIds());
    if (!d) return this._say('That does not look like an invite code. Copy the whole thing '
      + 'your friend sent, including the very end of it.', true);
    if (d.type !== 'offer') {
      return this._say('That is a reply code, not an invite. The person who pressed '
        + '"Create an Invite" is the one who pastes a reply.', true);
    }
    /* An allow-listed id, or nothing. `Code.unpack` has already checked it
       against the game's own stage list, so this lookup cannot miss for any
       reason except a build mismatch — and it is a lookup, never an index. */
    const stage = this.game.unlockedStages(true).find((s) => s.id === d.stage);
    if (!stage) {
      return this._say('That invite is for a stage this build does not have. You are '
        + 'probably on different versions of the game.', true);
    }
    this.stage = stage;
    this._lock(true);
    this._phase('busy');
    this._say(`Building ${stage.name}…`);
    this.game.loadStage(stage, { then: () => this._joinWorldReady(d) });
  }

  async _joinWorldReady(desc) {
    this.game.screens.show('coop');
    try {
      this._newSession();
      this.peer = new Peer({
        initiator: false,
        iceServers: this.ice,
        onLocalDescription: (d) => this._answerReady(d),
      });
      this.game.net.add(this.peer);
      this._say('Working out how to reach you…');
      await this.peer.acceptOffer({ type: 'offer', sdp: desc.sdp });
    } catch (err) {
      this._die('That invite could not be used: ' + String(err && err.message || err));
    }
  }

  async _answerReady(desc) {
    if (!desc || !desc.sdp) return this._die('This device would not produce a reply.');
    if (this.room) {
      this.room.send(desc);
      this._phase('busy');
      this._say('Connecting…');
      return;
    }
    this._out(await Code.pack(desc));
    this._phase('join-manual');
    this._say('Send that back to your friend. You will both start once they paste it in.');
  }

  /* ------------------------------------------------------------
     Rooms (Stage 2) — only if a signalling worker was configured
     ------------------------------------------------------------ */

  async joinRoom() {
    if (!this._precheck()) return;
    const field = $('coop-room-code');
    const code = String((field && field.value) || '').trim().toUpperCase();
    if (!CODE_RE.test(code)) {
      this._step('exchange');
      this._phase('busy');
      return this._say('That is not a room code. They are six characters, like ABC123.', true);
    }
    this.role = 'join';
    this._step('exchange');
    this._phase('busy');
    this._say('Looking for the room…');
    try {
      await this._openRoom(code, (d) => this._joinGotOffer(d));
      this._say('Waiting for your friend…');
    } catch (err) {
      this._die('Could not reach that room. Check the code, or ask them to send you a '
        + 'pasted invite instead — that path needs no server at all.');
    }
  }

  _joinGotOffer(d) {
    if (!d || d.type !== 'offer' || this.peer) return;
    if (!d.stage) return this._die('That invite did not say which stage to load.');
    const stage = this.game.unlockedStages(true).find((s) => s.id === d.stage);
    if (!stage) return this._die('That invite is for a stage this build does not have.');
    this.stage = stage;
    this._say(`Building ${stage.name}…`);
    this.game.loadStage(stage, { then: () => this._joinWorldReady(d) });
  }

  async _openRoom(code, onDesc) {
    const room = new Room(SIGNAL_URL, code, {
      allowedStages: this.game.stageIds(),
      onPeerDescription: onDesc,
      onStatus: (s) => { if (SAY[s] && !this.linked) this._say(SAY[s], s !== 'waiting'); },
      onIce: (servers) => { this.ice = servers; },
    });
    await room.connect();
    this.room = room;
    return room;
  }

  /* ------------------------------------------------------------
     Buttons
     ------------------------------------------------------------ */

  /** The one primary button; what it means depends on which half you are. */
  go() {
    if (this.locked) return;
    const text = String(($('coop-in') && $('coop-in').value) || '').trim();
    if (!text) return this._say('Paste the code in the box first.', true);
    if (this.role === 'host') this._hostAcceptPasted(text);
    else this._joinPasted(text);
  }

  async copy() {
    const box = $('coop-out');
    if (!box || !box.value) return;
    /* Select first, always. The Clipboard API needs a secure context and can be
       refused outright; a selected textarea is a working fallback on every
       browser and on a phone it puts the system Copy button right there. */
    try { box.focus(); box.setSelectionRange(0, box.value.length); } catch { /* */ }
    try {
      await navigator.clipboard.writeText(box.value);
      this._flash($('coop-copy'), 'Copied!');
    } catch {
      this._say('Selected it for you — copy it with your keyboard or the menu.', false);
    }
  }

  /** Hand the blob straight to the phone's own share sheet, where there is one. */
  async share() {
    const box = $('coop-out');
    if (!box || !box.value || !navigator.share) return;
    try {
      await navigator.share({
        title: 'Claudemary LLMaci',
        text: `Roll with me — paste this into "I Have an Invite":\n\n${box.value}`,
      });
    } catch { /* dismissed, which is not an error */ }
  }

  /** Back out of an attempt without leaving the game. */
  cancel() {
    this._reset();
    this._step('menu');
  }

  /** Everything down, for good. Called when the player leaves for the title. */
  close() {
    this._reset();
    this.linked = false;
    this._hudCoop(null);
  }

  _reset() {
    if (this.peer) { try { this.peer.close(); } catch { /* */ } this.peer = null; }
    if (this.room) { try { this.room.close(); } catch { /* */ } this.room = null; }
    if (this.game.net) { this.game.net.close(); this.game.net = null; }
    this.role = null;
    this.stage = null;
    this.ice = null;
    this.linked = false;
    this._lock(false);
    this._out('');
    const box = $('coop-in');
    if (box) box.value = '';
  }

  _precheck() {
    if (this.available) return true;
    this._step('exchange');
    this._phase('busy');
    this._say('This browser has no peer-to-peer support.', true);
    return false;
  }

  /* ------------------------------------------------------------
     Session plumbing
     ------------------------------------------------------------ */

  _newSession() {
    if (this.game.net) this.game.net.close();
    const s = new Session(this.game);
    s.onStatus = (st) => this._netStatus(st);
    this.game.net = s;
  }

  _netStatus(st) {
    const net = this.game.net;
    if (st === 'connected' && net && net.synced) return this._link();

    if (this.linked) {
      /* Already in the round, so the panel is gone and this belongs on the HUD.
         `ended` and `failed` also mean the ghost has been disposed already. */
      if (st === 'ended' || st === 'failed' || st === 'unanswered') {
        this._hudCoop('friend left', 'bad');
        this.linked = false;
      }
      else if (st === 'stage-mismatch') this._hudCoop('waiting for your friend', 'wait');
      else if (st === 'connected') this._hudCoop('rolling together', 'ok');
      return;
    }
    if (SAY[st]) this._say(SAY[st], st === 'failed' || st === 'version-mismatch');
    if (st === 'failed' || st === 'ended' || st === 'unanswered') this._lock(false);
  }

  /** Connected AND in the same world. Hand the player back to the normal intro. */
  _link() {
    if (this.linked) return;
    this.linked = true;
    // The rendezvous has done its job; a socket that lingers is a message bus.
    if (this.room) { this.room.done(); this.room = null; }
    this._hudCoop('rolling together', 'ok');
    this.game.coopLinked();
  }

  /* ------------------------------------------------------------
     DOM
     ------------------------------------------------------------ */

  _step(name) {
    for (const s of ['menu', 'stage', 'exchange']) {
      const el = $(`coop-${s}`);
      if (el) el.classList.toggle('hidden', s !== name);
    }
  }

  /**
   * Lay the exchange out for whichever half of the conversation we are.
   *
   *   busy         nothing but a status line
   *   host-manual  your invite, plus a box for their reply
   *   host-room    a six-character code, and patience
   *   join-paste   a box for their invite
   *   join-manual  your reply, to send back
   */
  _phase(phase) {
    this.phase = phase;
    const show = (id, on) => { const el = $(id); if (el) el.classList.toggle('hidden', !on); };
    const outOn = phase === 'host-manual' || phase === 'join-manual';
    const inOn = phase === 'host-manual' || phase === 'join-paste';
    show('coop-out-block', outOn);
    show('coop-in-block', inOn);
    show('coop-bigcode', phase === 'host-room');
    show('coop-go', inOn);
    show('coop-share', outOn && typeof navigator !== 'undefined' && !!navigator.share);

    const outLabel = $('coop-out-label');
    if (outLabel) {
      outLabel.textContent = phase === 'host-manual'
        ? 'Send this to your friend — any chat app, any email, it does not matter how.'
        : 'Send this back to your friend.';
    }
    const inLabel = $('coop-in-label');
    if (inLabel) {
      inLabel.textContent = phase === 'host-manual'
        ? 'When they reply with a code of their own, paste it here:'
        : 'Paste the invite your friend sent you:';
    }
    const go = $('coop-go');
    if (go) go.textContent = phase === 'host-manual' ? 'Connect' : 'Continue';
  }

  _out(code) {
    const box = $('coop-out');
    if (box) box.value = code || '';
  }

  _big(code) {
    const el = $('coop-bigcode');
    // textContent — a room code is a string this client generated, but the
    // element is shared with the join path and that one comes from a stranger.
    if (el) el.textContent = code || '';
  }

  _say(msg, bad = false) {
    const el = $('coop-status');
    if (!el) return;
    el.textContent = msg || '';
    el.classList.toggle('bad', !!bad && !!msg);
  }

  _die(msg) {
    if (this.peer) { try { this.peer.close(); } catch { /* */ } this.peer = null; }
    if (this.room) { try { this.room.close(); } catch { /* */ } this.room = null; }
    if (this.game.net) { this.game.net.close(); this.game.net = null; }
    this._lock(false);
    this._phase('busy');
    this._say(msg, true);
  }

  _lock(on) {
    this.locked = !!on;
    const go = $('coop-go');
    const box = $('coop-in');
    if (go) go.disabled = !!on;
    if (box) box.disabled = !!on;
  }

  _flash(btn, text) {
    if (!btn) return;
    const was = btn.dataset.label || btn.textContent;
    btn.dataset.label = was;
    btn.textContent = text;
    clearTimeout(this._flashT);
    this._flashT = setTimeout(() => { btn.textContent = btn.dataset.label || was; }, 1400);
  }

  /** The little pill in the HUD that says whether your friend is still there. */
  _hudCoop(text, tone) {
    const el = $('coop-hud');
    if (!el) return;
    el.classList.toggle('hidden', !text);
    el.textContent = text || '';
    el.classList.remove('ok', 'wait', 'bad');
    if (tone) el.classList.add(tone);
  }
}
