/* ============================================================
   Multiplayer session: ghosts in, pickups both ways.

   ⚠ THE ARCHITECTURE IS THE SECURITY MODEL. There is no
   player-versus-player in this game, so no remote value is ever
   an input to local physics. Read the two `apply` methods below:
   a remote STATE moves a mesh, and a remote PICKUP calls
   `PropField.remove`. Neither touches `kat.step`, `world.resolve`,
   the katamari's radius, its velocity, or anything the simulation
   reads. A peer sending garbage produces a strange-looking ghost
   and nothing else.

   That is worth stating plainly because it is easy to erode. The
   moment somebody adds "you can bump other players", remote data
   becomes a physics input and every guarantee here needs
   rebuilding. Do not do it casually.

   Prop consumption converges with no agreement protocol at all:
   `alive` is a grow-only set — `remove()` clears a bit and
   nothing ever sets one — so the merge is bitwise OR, it is
   idempotent (`remove` early-returns on an already-dead prop),
   and message order does not matter. This is why pickups can be
   fire-and-forget over an unordered, unreliable channel and
   simply re-sent: there is no state to reconcile, only bits to
   turn off. Both peers converge on the union of what either ate.

   The cost of that is honest and should be understood: two
   players who reach the same prop within one network round trip
   BOTH get it. Nobody is denied anything, the worlds still
   converge, and in a co-operative game that is a better failure
   than a stutter or a rollback.
   ============================================================ */

import * as THREE from 'three';
import { Peer } from './Peer.js';
import {
  MSG, encodeHello, encodeState, encodePickup, decode as _decode,
  stageHash, MAX_PICKUP_BATCH,
} from './Protocol.js';

/** State sends per second. 20 is smooth once interpolated and costs ~200 B/s. */
const SEND_HZ = 20;
/** Hide a ghost that has said nothing for this long. */
const STALE_MS = 4000;
/** How hard the ghost chases its last reported position, per second. */
const LERP_RATE = 9;
/**
 * How often to re-announce which world we are in, while unsynced.
 *
 * ⚠ THE HANDSHAKE RUNS ON ITS OWN CLOCK, NOT ON `tick`. Two reasons, and both
 * bit. The data channel is `ordered: false, maxRetransmits: 0` — a single
 * fire-and-forget HELLO can simply be lost, and a lost handshake is a session
 * that never starts with nothing on screen to say why. And `tick` is called
 * only from `_stepPlaying`, so a player sitting on the intro screen or the
 * results panel would not be beating at all, which is exactly when the OTHER
 * player is most likely to be loading the stage that would resync them.
 * Eight bytes a second is not a bandwidth question.
 */
const HELLO_MS = 1000;

/* Distinguishable at a glance against every stage backdrop, including the
   near-black quantum realm and the tan house floor. */
const COLOURS = [0xff5aa2, 0x4ad6ff, 0xffd23f, 0x8de84a, 0xff8a3d, 0xb07cff];

export class Session {
  /** @param {import('../core/Game.js').Game} game */
  constructor(game) {
    this.game = game;
    this.peers = [];
    this.ghosts = new Map();          // peer -> {mesh, target, radius, seen}
    this.outPickups = [];
    this.enabled = false;
    this._acc = 0;
    this._colour = COLOURS[(Math.random() * COLOURS.length) | 0];
    this.status = 'idle';
    this.onStatus = () => {};
    /**
     * ⚠ THE GATE ON EVERY EXCHANGE OF WORLD STATE.
     *
     * False until a peer has told us it is in the same world as us, and false
     * again the moment we change worlds. Prop indices are only meaningful
     * relative to one stage's prop table, so trading them across a mismatch
     * would delete the wrong scenery on both sides — silently, and in a way
     * that looks like a physics bug rather than a networking one.
     *
     * Suspending rather than disconnecting is what makes "Roll Again" and
     * "Next Stage" work at all: whoever moves first waits, the other arrives,
     * both re-announce, and play resumes. The earlier design closed the
     * connection on a hash mismatch, which turned every stage change into a
     * fresh invite.
     */
    this.synced = false;
    this._hs = null;
  }

  /* ------------------------------------------------------------
     Bounds — local, trusted, and the yardstick every remote
     number is measured against.
     ------------------------------------------------------------ */

  get bounds() {
    const w = this.game.world;
    if (!w || !w.bounds) return null;
    const b = w.bounds;
    /* The stage supplies no vertical extent, so derive one. It only has to be
       generous enough to hold any legitimate ball and tight enough that a
       16-bit quantisation stays precise; the goal size is the natural scale. */
    const span = (this.game.stage?.goal ?? 100) * 4;
    return { minX: b.minX, maxX: b.maxX, minZ: b.minZ, maxZ: b.maxZ, minY: -span, maxY: span };
  }

  get ctx() {
    return { bounds: this.bounds, propCount: this.game.world?.field?.n ?? 0 };
  }

  get hash() {
    return stageHash(this.game.stage?.id ?? '', this.game.world?.field?.n ?? 0);
  }

  /* ------------------------------------------------------------
     Peers
     ------------------------------------------------------------ */

  add(peer) {
    this.enabled = true;
    this.peers.push(peer);
    peer.ctx = this.ctx;
    peer.onOpen = () => {
      this._setStatus('connected');
      this._handshake();
    };
    peer.onMessage = (m) => this._apply(peer, m);
    peer.onClose = (why) => this._drop(peer, why);
    peer.onStatus = (s) => this._setStatus(s);
    return peer;
  }

  _setStatus(s) {
    this.status = s;
    this.onStatus(s);
  }

  /* ------------------------------------------------------------
     The handshake — "which world are you in?"
     ------------------------------------------------------------ */

  /** Announce our world, and keep announcing it until somebody agrees. */
  _handshake() {
    clearInterval(this._hs);
    const beat = () => {
      if (this.synced || !this.peers.length) { clearInterval(this._hs); this._hs = null; return; }
      const buf = encodeHello(this.hash, this._colour);
      for (const p of this.peers) p.send(buf);
    };
    this._hs = setInterval(beat, HELLO_MS);
    beat();
  }

  /**
   * Called when our own world changes underneath a live connection.
   *
   * Everything derived from the old world is stale at this instant: the peer's
   * `ctx` (which bounds-checks incoming prop indices against a prop count that
   * no longer exists), any queued outbound pickups, and the ghost's position.
   */
  resync() {
    if (!this.peers.length) return;
    this.synced = false;
    this.outPickups.length = 0;
    for (const p of this.peers) p.ctx = this.ctx;
    for (const [, g] of this.ghosts) { g.seen = 0; g.started = false; g.mesh.visible = false; }
    // Their last-known hash may already match our NEW world — if they changed
    // stage first and we have just caught up, this syncs without another packet.
    for (const p of this.peers) this._evaluate(p);
    this._handshake();
  }

  /** Do we and this peer believe we are in the same world? */
  _evaluate(peer) {
    if (peer.remoteHash === undefined) return;
    if (peer.remoteHash !== this.hash) {
      if (this.synced) this.synced = false;
      this._setStatus('stage-mismatch');
      return;
    }
    this.synced = true;
    clearInterval(this._hs); this._hs = null;
    this._ghost(peer, peer.remoteColour);
    this._setStatus('connected');
  }

  _drop(peer, why) {
    const i = this.peers.indexOf(peer);
    if (i >= 0) this.peers.splice(i, 1);
    const g = this.ghosts.get(peer);
    if (g) {
      g.mesh.parent && g.mesh.parent.remove(g.mesh);
      g.mesh.geometry.dispose();
      g.mesh.material.dispose();
      this.ghosts.delete(peer);
    }
    if (!this.peers.length) {
      this.synced = false;
      clearInterval(this._hs); this._hs = null;
      /* Three different things, and they read very differently to a player:
         the network refused us, nobody ever pasted our reply, or somebody who
         was here has gone. Collapsing them into "failed" is how a UI ends up
         blaming a network for a friend who wandered off. */
      this._setStatus(why === 'timeout' ? 'failed'
        : why === 'unanswered' ? 'unanswered' : 'ended');
    }
  }

  close() {
    clearInterval(this._hs); this._hs = null;
    this.synced = false;
    for (const p of this.peers.slice()) p.close();
    this.peers.length = 0;
    for (const [, g] of this.ghosts) {
      g.mesh.parent && g.mesh.parent.remove(g.mesh);
      g.mesh.geometry.dispose();
      g.mesh.material.dispose();
    }
    this.ghosts.clear();
    this.enabled = false;
    this._setStatus('idle');
  }

  /* ------------------------------------------------------------
     Inbound
     ------------------------------------------------------------ */

  _apply(peer, m) {
    switch (m.type) {
      case MSG.HELLO: {
        /* A version mismatch is the one terminal condition. It is not a
           different world, it is a different game, and no amount of waiting
           makes two incompatible wire formats agree. */
        if (m.bad === 'version') { peer.close(); this._setStatus('version-mismatch'); return; }
        peer.remoteHash = m.stageHash;
        peer.remoteColour = m.colour;
        /* Answer, so the handshake completes even if OUR hellos are the ones
           being lost, and so a peer that has already given up beating still
           learns our hash when we announce a new stage. Rate-limited because
           two unsynced peers would otherwise answer each other flat out. */
        const now = performance.now();
        if (!this.synced && now - (peer._replied || 0) > 400) {
          peer._replied = now;
          peer.send(encodeHello(this.hash, this._colour));
        }
        this._evaluate(peer);
        return;
      }

      case MSG.STATE: {
        /* ⚠ NO GHOST BEFORE THE HANDSHAKE. The ghost is created by `_evaluate`,
           and only once the worlds agree — a fallback that conjured one here
           would draw a ball at a position dequantised against the wrong stage's
           bounds, wearing our own colour because the peer's never arrived. */
        if (!this.synced) return;
        const g = this.ghosts.get(peer);
        if (!g) return;
        // Target, not teleport — `tick` eases toward it. 20Hz would visibly step.
        g.target.set(m.x, m.y, m.z);
        g.radius = m.radius;
        g.seen = performance.now();
        return;
      }

      case MSG.PICKUP: {
        // Prop indices only mean anything relative to one stage's prop table.
        if (!this.synced) return;
        const f = this.game.world?.field;
        if (!f) return;
        /* Idempotent by construction — `remove` early-returns on an already
           dead prop — so a re-send, a duplicate, or an out-of-order arrival all
           do exactly the right thing. No sequence numbers, no acks. */
        for (const i of m.idx) f.remove(i);
        return;
      }

      case MSG.BYE:
        /* ⚠ `_drop` EXPLICITLY. `Peer.close()` is the polite path and it does
           NOT call `onClose` — only `_fail` does — so closing the peer here and
           stopping would leave it in `this.peers` forever, with its ghost still
           in the scene and the session still calling itself connected. The
           harness caught exactly that: the quitting side tore down cleanly and
           the other side never noticed. */
        peer.close();
        this._drop(peer, 'bye');
        return;

      default:
        return;
    }
  }

  _ghost(peer, colour) {
    let g = this.ghosts.get(peer);
    if (g) return g;
    /* A plain sphere, deliberately. A remote katamari's attached props would
       mean replicating up to 260 meshes per peer and the whole attach history;
       a coloured ball says everything the other player needs to know — where
       you are and how big you are — for one draw call. */
    const geo = new THREE.SphereGeometry(1, 20, 14);
    const mat = new THREE.MeshLambertMaterial({
      color: COLOURS.includes(colour) ? colour : COLOURS[0],
      transparent: true,
      opacity: 0.85,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.visible = false;
    this.game.scene.scene.add(mesh);
    g = { mesh, target: new THREE.Vector3(), radius: 1, seen: 0, started: false };
    this.ghosts.set(peer, g);
    return g;
  }

  /* ------------------------------------------------------------
     Per frame
     ------------------------------------------------------------ */

  /**
   * Called from `Game._stepPlaying` AFTER the physics loop.
   *
   * Deliberately after: nothing here may influence this frame's simulation, and
   * putting it before would make that a matter of discipline rather than of
   * ordering.
   */
  tick(dt, kat) {
    if (!this.enabled || !this.peers.length || !this.synced) return;

    /* ---- outbound ---- */
    this._acc += dt;
    const period = 1 / SEND_HZ;
    if (this._acc >= period) {
      this._acc = 0;
      const b = this.bounds;
      if (b && kat) {
        const buf = encodeState(kat.group.position, kat.radius, b);
        for (const p of this.peers) p.send(buf);
      }
    }
    if (this.outPickups.length) {
      /* Batched and capped. The cap is the protocol's, not a guess: a frame
         that somehow collected more than one batch's worth sends the rest next
         frame rather than producing an over-long message. */
      const batch = this.outPickups.splice(0, MAX_PICKUP_BATCH);
      const buf = encodePickup(batch);
      for (const p of this.peers) p.send(buf);
    }

    /* ---- ghosts ---- */
    const now = performance.now();
    for (const [, g] of this.ghosts) {
      const fresh = now - g.seen < STALE_MS;
      g.mesh.visible = fresh && g.seen > 0;
      if (!fresh) continue;
      if (!g.started) { g.mesh.position.copy(g.target); g.started = true; }
      else {
        // Frame-rate independent ease, so it looks the same at 30fps and 144.
        const k = 1 - Math.exp(-LERP_RATE * dt);
        g.mesh.position.lerp(g.target, k);
      }
      g.mesh.scale.setScalar(g.radius);
    }
  }

  /** Called from `Game._handleEvents` for every local pickup. */
  notePickup(idx) {
    if (!this.enabled || !this.peers.length || !this.synced) return;
    if (typeof idx !== 'number' || idx < 0) return;
    /* Bounded. If a peer is gone and the queue is not draining, this is the
       thing that would otherwise grow without limit for a whole round. */
    if (this.outPickups.length < 512) this.outPickups.push(idx);
  }
}
