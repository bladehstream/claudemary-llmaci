/* ============================================================
   One RTCPeerConnection, one data channel, and the timers the
   browser does not give you.

   ⚠ ICE DOES NOT RELIABLY TELL YOU IT FAILED. This is the single
   most important thing in this file. From libwebrtc's
   `P2PTransportChannel::ComputeIceTransportState`:

       if (had_connection_ && !has_connection) return kFailed;
       ...
       if (!had_connection_ && !has_connection) return kNew;

   If a candidate pair was NEVER formed — the other side closed
   the tab, signalling was never completed, no remote candidate
   ever arrived — the state does not become `failed`. It sits in
   `new`/`checking` indefinitely. RFC 8863 then makes the patience
   mandatory: an agent "MUST NOT update a checklist state from
   Running to Failed, even if there are no pairs left to check."
   So a UI that waits for `connectionState === 'failed'` spins
   forever, and that is specified behaviour rather than a bug.
   Hence WATCHDOG below.

   The escalation schedule is deliberate:
     ~8s   say something reassuring, change nothing. Mobile is
           genuinely slow and restarting here makes it worse.
     ~15s  say something more specific, and still change nothing.
     ~30s  give up and say so plainly.

   ⚠ NOTHING IS RETRIED OR RACED AT 15s, AND THAT IS ON PURPOSE.
   An earlier draft of this comment promised a second connection
   with iceTransportPolicy 'relay'. It was never implemented, and
   it should not be, for two reasons. First, it cannot work on the
   copy-paste path at all: a second offer means a second blob to
   carry between two humans, and by then the first attempt has
   already failed in front of them. Second, it buys nothing that
   is not already happening — a relay candidate is in the very
   first checklist whenever TURN is configured (see below), so ICE
   is ALREADY trying the relay by the time this fires. The only
   thing a relay-only race would add is skipping the wait for the
   direct paths to be declared hopeless, which is a latency
   optimisation dressed up as a fallback. Saying so out loud beats
   a status name that implies work nobody does.

   `disconnected` is NOT failure. It is what a phone does when it
   moves between wifi and cellular, and it usually recovers on its
   own within a few seconds. Tearing down on it turns a hiccup
   into a lost game.

   TURN IS CONFIGURED FROM THE FIRST CONNECTION, ALWAYS, and costs
   nothing when unused: relay candidates carry the lowest ICE type
   preference (RELAY_UDP = 2, against SRFLX = 100 and HOST = 126),
   so ICE only ever falls back to a relay when the direct paths
   genuinely fail, and a relay is billed by the byte. Withholding
   it to "save money" just converts a working game into a broken
   one for the minority who need it.

   Two STUN servers, from different operators, for redundancy —
   NOT for coverage. libwebrtc's `OnStunBindingRequestSucceeded`
   guards with `!HasStunCandidateWithAddress(...)`, so on an
   endpoint-independent NAT every additional STUN server returns
   the same address and contributes literally nothing, while on an
   endpoint-dependent one it contributes candidates that cannot
   receive peer traffic anyway. More than two or three is cargo
   cult and slows the checklist down.
   ============================================================ */

import { decode, encodeBye, MAX_MSG } from './Protocol.js';

/**
 * Reassure at 8s, be more specific at 15s, give up at 30s.
 *
 * ⚠ THESE COUNT FROM WHEN THE CONNECTION ATTEMPT STARTS, NOT FROM WHEN THIS
 * OBJECT IS BUILT, and getting that wrong is not a subtle bug. On the
 * copy-paste path the two are separated by a HUMAN — the offering side has to
 * wait while its player sends a code to a friend and the friend sends one back,
 * which is minutes if it is anything. An earlier version armed in the
 * constructor and duly declared every manual invite failed after thirty
 * seconds; the project's own harness reproduced it on the first end-to-end run.
 * The attempt genuinely begins when both descriptions are in place, which for
 * the offering side is `acceptAnswer`.
 */
const T_SLOW = 8000;
const T_RELAY = 15000;
const T_GIVEUP = 30000;

/**
 * The answering side's backstop, and it is a different thing entirely.
 *
 * After `acceptOffer` this peer has everything it needs and is waiting for the
 * OTHER player to paste its reply in. There is no network event that
 * distinguishes "they have not pasted it yet" from "they pasted it and it did
 * not work" — ICE checks fire into the void either way, and RFC 8863 forbids
 * the checklist from declaring itself failed while checks could still arrive.
 * So a thirty-second failure here would be a guess, and usually a wrong one.
 * Five minutes, and the message says what actually happened rather than
 * pretending to know that the network is at fault.
 */
const T_PATIENT = 300000;

/** Inbound budget. Generous for the game, tight enough to bound abuse. */
const RATE_MSGS = 120;          // per second, sustained
const RATE_BURST = 240;
/** Consecutive undecodable messages before we stop believing this is the game. */
const MAX_JUNK = 20;

const DEFAULT_ICE = [
  { urls: 'stun:stun.cloudflare.com:3478' },
  { urls: 'stun:stun.l.google.com:19302' },
];

export class Peer {
  /**
   * @param {object} opts
   *   initiator  — true for the side that creates the offer
   *   iceServers — replaces the STUN defaults; this is where TURN arrives
   *   onOpen/onMessage/onClose/onStatus — callbacks
   */
  constructor(opts = {}) {
    this.initiator = !!opts.initiator;
    this.onOpen = opts.onOpen || (() => {});
    this.onMessage = opts.onMessage || (() => {});
    this.onClose = opts.onClose || (() => {});
    this.onStatus = opts.onStatus || (() => {});
    this.onLocalDescription = opts.onLocalDescription || (() => {});
    this.ctx = opts.ctx || {};

    this.state = 'new';
    this.closed = false;
    this._armed = false;
    this._junk = 0;
    this._tokens = RATE_BURST;
    this._lastRefill = performance.now();
    this._t0 = performance.now();
    this._timers = [];

    const iceServers = opts.iceServers && opts.iceServers.length
      ? opts.iceServers : DEFAULT_ICE;
    this._iceServers = iceServers;

    this.pc = new RTCPeerConnection({
      iceServers,
      /* Nothing else in RTCConfiguration measurably changes whether a
         connection succeeds. iceCandidatePoolSize affects setup latency only;
         bundlePolicy is moot for a single data channel; rtcpMuxPolicy has one
         legal value. The only lever that matters is iceServers. */
      iceTransportPolicy: opts.relayOnly ? 'relay' : 'all',
    });

    /* ⚠ REFUSE INBOUND MEDIA. The game has no voice or video, and a peer can
       offer tracks whether or not we asked. Without this an offer can make the
       browser open a microphone-shaped hole in the session; there is nothing to
       gain by being polite about it. */
    this.pc.ontrack = (e) => {
      try { e.streams.forEach((s) => s.getTracks().forEach((t) => t.stop())); } catch { /* */ }
      this._fail('refused-media');
    };

    /* ⚠ GATHERING DOES NOT ALWAYS COMPLETE, so non-trickle needs a deadline.
       The null candidate that signals "gathering finished" can simply never
       arrive — a STUN server that does not answer, an interface that stalls,
       or a sandboxed browser with no reachable network. Measured in this
       project's own test container: `iceGatheringState` sat at `gathering`
       indefinitely with one candidate in hand.
       Without this timer that is a permanent hang on "generating your code",
       with no error and nothing in the console. Whatever has been gathered by
       the deadline is a perfectly usable description; ICE keeps working with
       fewer candidates, it just has fewer paths to try. */
    this._gathered = false;
    const emit = () => {
      if (this._gathered || this.closed) return;
      /* ⚠ NEVER EMIT A NULL DESCRIPTION. The deadline starts ticking when this
         object is CONSTRUCTED, but `localDescription` is only populated by
         `createOffer`/`acceptOffer` — which the owner calls afterwards, and
         which is asynchronous. Normally that gap is a couple of milliseconds;
         it is not bounded, and firing inside it would hand the UI `null` to
         serialise, which is a blank invite code and no error anywhere. */
      const d = this.pc.localDescription;
      if (!d) { this._timers.push(setTimeout(emit, 250)); return; }
      this._gathered = true;
      this.onLocalDescription(d);
    };
    this.pc.onicecandidate = (e) => { if (!e.candidate) emit(); };
    this._timers.push(setTimeout(emit, 4000));
    this.pc.onconnectionstatechange = () => this._onConn();
    this.pc.oniceconnectionstatechange = () => this._onConn();

    if (this.initiator) {
      this._wire(this.pc.createDataChannel('g', {
        ordered: false,          // state is a snapshot; a late one is worthless
        maxRetransmits: 0,
      }));
    } else {
      this.pc.ondatachannel = (e) => this._wire(e.channel);
    }
    /* NOT ARMED HERE. See the note on T_SLOW — the clock starts when the
       descriptions are exchanged, which may be minutes away. */
  }

  /* ------------------------------------------------------------
     Lifecycle
     ------------------------------------------------------------ */

  /** The remote description is in. From here, waiting is the network's fault. */
  _arm() {
    if (this._armed || this.closed) return;
    this._armed = true;
    this._t0 = performance.now();
    const at = (ms, fn) => this._timers.push(setTimeout(fn, ms));
    at(T_SLOW, () => {
      if (this.state !== 'open') this._status('slow');
    });
    at(T_RELAY, () => {
      if (this.state === 'open' || this.closed) return;
      /* A status change, and only a status change. See the header: by now ICE
         has been trying every path it has — including the relay — for fifteen
         seconds, and there is no useful intervention left that does not involve
         a second blob the humans would have to carry. */
      this._status('slow-relay');
    });
    at(T_GIVEUP, () => {
      if (this.state !== 'open') this._fail('timeout');
    });
  }

  /** We have answered and are waiting on a person, not on a network. */
  _armPatient() {
    if (this._armed || this.closed) return;
    this._armed = true;
    this._t0 = performance.now();
    this._timers.push(setTimeout(() => {
      if (this.state !== 'open') this._fail('unanswered');
    }, T_PATIENT));
  }

  _wire(ch) {
    this.ch = ch;
    ch.binaryType = 'arraybuffer';
    ch.onopen = () => {
      if (this.closed) return;
      this.state = 'open';
      this._clearTimers();
      this._status('open');
      this.onOpen();
    };
    ch.onclose = () => this._fail('closed');
    ch.onerror = () => { /* onclose follows; nothing useful to add */ };
    ch.onmessage = (e) => this._inbound(e.data);
  }

  _onConn() {
    if (this.closed) return;
    const s = this.pc.connectionState;
    /* `disconnected` is a phone changing networks, not a failure. It recovers
       on its own far more often than not, and the 30s watchdog is already the
       backstop, so do nothing here. */
    if (s === 'failed') this._fail('ice-failed');
  }

  _status(s) {
    this.status = s;
    this.onStatus(s);
  }

  _fail(why) {
    if (this.closed) return;
    this.reason = why;
    this.close();
    this.onClose(why);
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.state = 'closed';
    this._clearTimers();
    try { if (this.ch && this.ch.readyState === 'open') this.ch.send(encodeBye()); } catch { /* */ }
    try { this.ch && this.ch.close(); } catch { /* */ }
    try { this.pc.close(); } catch { /* */ }
  }

  _clearTimers() {
    for (const t of this._timers) clearTimeout(t);
    this._timers.length = 0;
  }

  /* ------------------------------------------------------------
     Inbound — everything here assumes the sender is hostile
     ------------------------------------------------------------ */

  _inbound(data) {
    if (this.closed) return;

    /* Reject by SIZE before parsing, and reject anything that is not an
       ArrayBuffer at all — a peer can send strings and Blobs down the same
       channel, and neither has any business here. */
    if (typeof data === 'string' || !(data instanceof ArrayBuffer)) return this._junked();
    if (data.byteLength > MAX_MSG) return this._junked();

    // Token bucket. Drop, never queue: queuing is the memory-exhaustion bug.
    const now = performance.now();
    this._tokens = Math.min(RATE_BURST,
      this._tokens + ((now - this._lastRefill) / 1000) * RATE_MSGS);
    this._lastRefill = now;
    if (this._tokens < 1) return;
    this._tokens -= 1;

    const msg = decode(data, this.ctx);
    if (!msg) return this._junked();
    this._junk = 0;
    this.onMessage(msg);
  }

  _junked() {
    /* A peer that cannot produce a legal message is not this game. Counting
       consecutive failures rather than total ones means one corrupt packet on a
       lossy link is forgiven, while a probe is not. */
    if (++this._junk >= MAX_JUNK) this._fail('protocol');
  }

  /* ------------------------------------------------------------
     Outbound
     ------------------------------------------------------------ */

  send(buf) {
    if (this.state !== 'open' || !this.ch || this.ch.readyState !== 'open') return false;
    /* Never queue behind a stalled channel. State is a snapshot — a frame we
       could not send is worthless by the time the buffer drains, and letting it
       accumulate is how a slow peer becomes our memory leak. */
    if (this.ch.bufferedAmount > 64 * 1024) return false;
    try { this.ch.send(buf); return true; } catch { return false; }
  }

  /* ------------------------------------------------------------
     Signalling plumbing
     ------------------------------------------------------------ */

  async createOffer() {
    const d = await this.pc.createOffer();
    await this.pc.setLocalDescription(d);
    return d;
  }

  async acceptOffer(desc) {
    await this.pc.setRemoteDescription(desc);
    const d = await this.pc.createAnswer();
    await this.pc.setLocalDescription(d);
    // Everything is in place on this side; the wait from here is on a person.
    this._armPatient();
    return d;
  }

  async acceptAnswer(desc) {
    await this.pc.setRemoteDescription(desc);
    // NOW the network is the only thing left to blame, so start the clock.
    this._arm();
  }

  /** Milliseconds since this peer started trying. For honest UI copy. */
  get age() { return performance.now() - this._t0; }
}
