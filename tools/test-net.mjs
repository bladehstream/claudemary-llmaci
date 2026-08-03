/* ============================================================
   Two peers, one world — and every claim the design makes.

   Runs two real RTCPeerConnections inside one headless Chromium
   and connects them over loopback. That is a genuine WebRTC
   handshake, not a mock: real SDP, real ICE, real DTLS, a real
   SCTP data channel. What it CANNOT test is NAT traversal, since
   both ends are the same host — so the connection-failure paths
   are exercised by driving the state machine directly instead.

   The assertions worth having are not "it connects". They are
   the safety properties, because those are the ones that rot
   silently:

     - a hostile peer cannot reach the simulation;
     - a malformed message is dropped, not coerced;
     - a length field cannot size an allocation;
     - the wire cannot carry a string;
     - nothing opens until the player opts in.

   Run: node tools/test-net.mjs
   ============================================================ */

import { createServer } from 'vite';
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const PORT = 5281;
const server = await createServer({ root: ROOT, server: { port: PORT }, logLevel: 'error' });
await server.listen();

const browser = await chromium.launch({
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  args: [
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--disable-dev-shm-usage',
    // Loopback candidates, so two peers in one page can actually pair up.
    '--allow-loopback-in-peer-connection',
    /* ⚠ WITHOUT THIS THE TEST CANNOT CONNECT, and it is not a game bug.
       Chromium replaces host candidates with an mDNS `.local` hostname for
       privacy (RFC 8828). In a container with no mDNS responder neither peer
       can resolve the other's name, so the only candidate on offer is useless.
       Turning the obfuscation off is a TEST-ENVIRONMENT concession — real
       browsers keep it, and it costs nothing there because a real network has
       a resolver. */
    '--disable-features=WebRtcHideLocalIpsWithMdns',
  ],
});

let fail = 0;
const check = (name, ok, extra = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '   ' + extra : ''}`);
  if (!ok) fail++;
};

const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.message)));
await page.route('**/__net.html', (r) =>
  r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><meta charset=utf-8><title>n</title>' }));
await page.goto(`http://localhost:${PORT}/__net.html`, { waitUntil: 'load' });

/* ============================================================
   1. The protocol, in isolation
   ============================================================ */
console.log('\n=== the wire format ===');

const proto = await page.evaluate(async () => {
  const P = await import('/src/net/Protocol.js');
  const bounds = { minX: -50, maxX: 50, minY: -100, maxY: 100, minZ: -50, maxZ: 50 };
  const ctx = { bounds, propCount: 1000 };
  const out = {};

  // round trip
  const st = P.encodeState({ x: 12.5, y: 3, z: -40 }, 2.75, bounds);
  const rt = P.decode(st, ctx);
  out.roundTrip = rt && Math.abs(rt.x - 12.5) < 0.01 && Math.abs(rt.z + 40) < 0.01
    && Math.abs(rt.radius - 2.75) / 2.75 < 0.01;

  // a string on the wire is not decodable at all
  out.rejectsString = P.decode('v=0 hello', ctx) === null;
  // wrong length for the type
  out.rejectsShort = P.decode(new ArrayBuffer(4), ctx) === null;
  out.rejectsLong = P.decode(new ArrayBuffer(4096), ctx) === null;
  // unknown type
  const bad = new DataView(new ArrayBuffer(10)); bad.setUint8(0, 99);
  out.rejectsUnknownType = P.decode(bad.buffer, ctx) === null;

  /* THE ALLOCATION-SIZING ATTACK. Claim 200 indices in a 4-byte message. If the
     count were trusted, this allocates and reads far past the buffer. */
  const lie = new DataView(new ArrayBuffer(4));
  lie.setUint8(0, P.MSG.PICKUP); lie.setUint8(1, 200);
  out.rejectsLyingCount = P.decode(lie.buffer, ctx) === null;

  // a count over the protocol cap, with matching bytes, is still refused
  const big = new DataView(new ArrayBuffer(2 + 200 * 2));
  big.setUint8(0, P.MSG.PICKUP); big.setUint8(1, 200);
  out.capsBatch = P.decode(big.buffer, ctx) === null;

  // out-of-range prop indices are dropped, in-range kept
  const mix = P.encodePickup([5, 99999, 7]);
  const dm = P.decode(mix, ctx);
  out.dropsOutOfRange = dm && dm.idx.length === 2 && dm.idx.includes(5) && dm.idx.includes(7);

  /* POISON VALUES ARE UNREPRESENTABLE, not merely rejected. Quantising to
     uint16 means there is no bit pattern for NaN or Infinity to arrive as. */
  const poison = P.encodeState({ x: NaN, y: Infinity, z: -Infinity }, NaN, bounds);
  const dp = P.decode(poison, ctx);
  out.poisonFinite = !!dp && Number.isFinite(dp.x) && Number.isFinite(dp.y)
    && Number.isFinite(dp.z) && Number.isFinite(dp.radius);

  // positions are clamped into the stage, never outside it
  const far = P.decode(P.encodeState({ x: 1e12, y: -1e12, z: 1e12 }, 5, bounds), ctx);
  out.clampsToBounds = far && far.x <= bounds.maxX + 1e-6 && far.z <= bounds.maxZ + 1e-6
    && far.y >= bounds.minY - 1e-6;

  // version mismatch is reported, not silently accepted
  const h = new DataView(P.encodeHello(1234, 3)); h.setUint8(1, 99);
  const dh = P.decode(h.buffer, ctx);
  out.versionGuard = dh && dh.bad === 'version';

  // the stage hash actually distinguishes worlds
  out.hashDiffers = P.stageHash('house', 1442) !== P.stageHash('house', 1443)
    && P.stageHash('house', 1442) !== P.stageHash('town', 1442);

  return out;
});

check('a state message round-trips', proto.roundTrip);
check('a string on the wire is refused', proto.rejectsString);
check('a wrong-length message is refused', proto.rejectsShort && proto.rejectsLong);
check('an unknown message type is refused', proto.rejectsUnknownType);
check('a lying length field cannot size an allocation', proto.rejectsLyingCount,
  'claims 200 indices in 4 bytes');
check('the batch cap is enforced even when the bytes match', proto.capsBatch);
check('out-of-range prop indices are dropped', proto.dropsOutOfRange);
check('NaN and Infinity are unrepresentable, not just rejected', proto.poisonFinite);
check('positions are clamped inside the stage', proto.clampsToBounds);
check('a protocol version mismatch is caught', proto.versionGuard);
check('the stage hash separates worlds and builds', proto.hashDiffers);

/* ============================================================
   2. Two real peers
   ============================================================ */
console.log('\n=== two peers, one data channel ===');

const live = await page.evaluate(async () => {
  const { Peer } = await import('/src/net/Peer.js');
  const P = await import('/src/net/Protocol.js');
  const bounds = { minX: -50, maxX: 50, minY: -100, maxY: 100, minZ: -50, maxZ: 50 };
  const ctx = { bounds, propCount: 1000 };

  const got = { a: [], b: [] };
  const done = (side) => new Promise((res) => { got[`${side}Open`] = res; });

  const a = new Peer({ initiator: true, ctx, onMessage: (m) => got.a.push(m) });
  const b = new Peer({ initiator: false, ctx, onMessage: (m) => got.b.push(m) });
  const opened = Promise.all([
    new Promise((r) => { a.onOpen = r; }),
    new Promise((r) => { b.onOpen = r; }),
  ]);

  // Non-trickle: wait for each side's gathering to complete, then swap.
  /* Deadline, for the same reason Peer has one: gathering can simply never
     complete, and a test that waits forever reports as a garbage-collected
     promise rather than as a failure. */
  const settle = (pc) => new Promise((res) => {
    if (pc.iceGatheringState === 'complete') return res();
    const t = setTimeout(res, 4000);
    pc.addEventListener('icegatheringstatechange', () => {
      if (pc.iceGatheringState === 'complete') { clearTimeout(t); res(); }
    });
  });

  await a.createOffer();
  await settle(a.pc);
  await b.acceptOffer(a.pc.localDescription);
  await settle(b.pc);
  await a.acceptAnswer(b.pc.localDescription);

  await Promise.race([opened, new Promise((r) => setTimeout(() => r('timeout'), 15000))]);
  if (a.state !== 'open' || b.state !== 'open') return { connected: false };

  a.send(P.encodeState({ x: 10, y: 1, z: -10 }, 3.5, bounds));
  a.send(P.encodePickup([1, 2, 3]));
  await new Promise((r) => setTimeout(r, 400));

  /* Now be hostile, from a genuine peer over a genuine channel. */
  const before = b.closed;
  a.ch.send('a string, which the game never sends');
  a.ch.send(new ArrayBuffer(5000));                 // over MAX_MSG
  const junk = new DataView(new ArrayBuffer(10)); junk.setUint8(0, 250);
  for (let i = 0; i < 5; i++) a.ch.send(junk.buffer);
  await new Promise((r) => setTimeout(r, 400));

  const state = got.b.find((m) => m.type === P.MSG.STATE);
  const pick = got.b.find((m) => m.type === P.MSG.PICKUP);

  const res = {
    connected: true,
    gotState: !!state && Math.abs(state.x - 10) < 0.05,
    gotPickup: !!pick && pick.idx.length === 3,
    hostileDelivered: got.b.filter((m) => m.type === 250).length,
    survivedSomeJunk: !before && !b.closed,
    junkCounted: b._junk,
  };

  // And enough junk closes it.
  for (let i = 0; i < 40; i++) a.ch.send(junk.buffer);
  await new Promise((r) => setTimeout(r, 500));
  res.closedOnFlood = b.closed;

  a.close(); b.close();
  return res;
});

check('two peers connect over a real data channel', live.connected);
if (live.connected) {
  check('state crosses the wire intact', live.gotState);
  check('a pickup batch crosses intact', live.gotPickup);
  check('hostile messages never reach the application', live.hostileDelivered === 0,
    `${live.hostileDelivered} delivered`);
  check('a little junk is tolerated', live.survivedSomeJunk, `junk counter ${live.junkCounted}`);
  check('sustained junk closes the connection', live.closedOnFlood);
}

/* ============================================================
   3. The architectural guarantee
   ============================================================ */
/* ------------------------------------------------------------
   The invite has to survive the wait
   ------------------------------------------------------------

   ⚠ REPORTED BY A PLAYER, INTERMITTENTLY: make an invite on one device, send
   it, paste the reply back, and get "Failed to execute 'setRemoteDescription'
   ... signalingState is 'closed'". WebRTC describing the paste rather than the
   death, which had happened minutes earlier and silently.

   Three things had to be true at once for that message to reach a human, and
   each is asserted here:
     1. a connection-state failure BEFORE any remote description killed the
        peer — although with nobody to connect to it cannot mean anything;
     2. `Session.add` overwrote the owner's `onClose`, so the panel was never
        told and the dead invite stayed on screen;
     3. `acceptAnswer` did not check `closed`, so the eventual paste reported
        WebRTC's internal state instead of the recorded reason.
   ------------------------------------------------------------ */
console.log('\n=== an invite survives the wait for a reply ===');

const waiting = await page.evaluate(async () => {
  const { Peer } = await import('/src/net/Peer.js');
  const { Session } = await import('/src/net/Session.js');
  const out = {};

  /* A host that has made an offer and is waiting on a human. */
  const host = new Peer({ initiator: true });
  await host.createOffer();

  /* The event that used to kill it. `connectionState` is read-only, so drive
     the handler the way the browser would and let it read the real pc — which
     has no remote description, because no answer has been pasted. */
  host.pc.dispatchEvent(new Event('connectionstatechange'));
  host.pc.dispatchEvent(new Event('iceconnectionstatechange'));
  out.aliveAfterStateChurn = !host.closed;

  /* And the data channel closing before there was ever a connection. */
  if (host.ch && host.ch.onclose) host.ch.onclose();
  out.aliveAfterChannelClose = !host.closed;

  /* The owner's onClose must survive being put in a Session. */
  let ownerHeard = null;
  const p2 = new Peer({ initiator: true, onClose: (why) => { ownerHeard = why; } });
  const s = new Session({ stage: null, world: null, kat: null });
  s.add(p2);
  p2._fail('ice-failed');
  out.ownerHeard = ownerHeard;
  out.sessionDropped = s.peers.length === 0;

  /* And a dead peer must refuse work in words that name the real cause. */
  let msg = '';
  let reason = '';
  try {
    await p2.acceptAnswer({ type: 'answer', sdp: 'v=0\r\n' });
  } catch (e) { msg = String(e.message || e); reason = e.peerReason || ''; }
  out.refuses = msg;
  out.namesReason = reason;

  host.close();
  return out;
});
check('a state change before any answer does NOT kill the invite', waiting.aliveAfterStateChurn);
check('nor does the data channel closing before there is a connection',
  waiting.aliveAfterChannelClose);
check('Session.add keeps the owner\u2019s onClose', waiting.ownerHeard === 'ice-failed',
  `owner heard ${waiting.ownerHeard}`);
check('and still drops the peer itself', waiting.sessionDropped);
check('a dead peer refuses an answer in plain words',
  /already closed/.test(waiting.refuses) && !/signalingState/.test(waiting.refuses),
  waiting.refuses);
check('and names the real cause', waiting.namesReason === 'ice-failed', waiting.namesReason);

console.log('\n=== remote data cannot reach the simulation ===');

const arch = await page.evaluate(async () => {
  /* ⚠ STRIP COMMENTS FIRST. The first version of this grepped raw source and
     failed on Protocol.js — whose header contains the words "JSON.parse" inside
     a comment EXPLAINING WHY IT DOES NOT USE JSON.parse. A source-text
     assertion that cannot tell code from prose will fail on well-documented
     code and, worse, would pass on code whose only mention of a sink is in a
     comment saying it uses one. Naive, but sufficient here: no regex literal in
     these files contains a quote or a slash sequence that this mangles. */
  const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const src = strip(await (await fetch('/src/net/Session.js')).text());
  const peer = strip(await (await fetch('/src/net/Peer.js')).text());
  const proto = strip(await (await fetch('/src/net/Protocol.js')).text());
  const all = src + peer + proto;
  return {
    // The two calls that would make remote data an input to physics.
    touchesStep: /\bkat\.step\s*\(/.test(src),
    touchesResolve: /world\.resolve\s*\(/.test(src),
    // Code-execution sinks anywhere in the networking layer.
    sinks: (all.match(/\beval\s*\(|new\s+Function|innerHTML|outerHTML|insertAdjacentHTML|document\.write|importScripts/g) || []),
    // JSON.parse on peer data would put the attacker in charge of object keys.
    parsesPeerJson: /JSON\.parse/.test(proto),
  };
});
check('the session never calls kat.step', !arch.touchesStep);
check('the session never calls world.resolve', !arch.touchesResolve);
check('no code-execution sink anywhere in src/net', arch.sinks.length === 0,
  arch.sinks.join(', '));
check('the binary protocol does not JSON.parse peer data', !arch.parsesPeerJson,
  'so __proto__ is not expressible');

/* ============================================================
   4. Opt-in
   ============================================================ */
console.log('\n=== nothing opens until asked ===');

const optin = await page.evaluate(async () => {
  const g = await (await fetch('/src/core/Game.js')).text();
  return {
    startsNull: /this\.net\s*=\s*null/.test(g),
    guarded: (g.match(/if\s*\(this\.net\)/g) || []).length,
    autoConnects: /new\s+(Peer|Session|Room)\s*\(/.test(g),
  };
});
check('game.net starts null', optin.startsNull);
check('every network call site is guarded', optin.guarded >= 2, `${optin.guarded} guards`);
check('nothing constructs a connection at boot', !optin.autoConnects);

/* ============================================================
   5. The signalling blob
   ============================================================ */
console.log('\n=== the invite code ===');

const code = await page.evaluate(async () => {
  const { Code } = await import('/src/net/Signal.js');
  const STAGES = ['quantum', 'house', 'city'];
  /* A REAL description, not a four-line stub. The stub version of this test
     asserted that packing shrinks the input and failed at 98 characters — which
     was the test's fault, not the code's: deflate plus base64 cannot win on 46
     bytes, and the thing that actually matters is what it does to the ~1.5KB a
     browser really emits. Generated here rather than hardcoded so it stays
     honest about what this browser produces. */
  const probe = new RTCPeerConnection({ iceServers: [] });
  probe.createDataChannel('g');
  await probe.setLocalDescription(await probe.createOffer());
  /* GATHERED, not freshly created. The game packs a non-trickle description —
     the candidates are the whole point — and they are also most of the bytes
     and almost all of the redundancy. Measuring the ungathered offer said
     compression made things WORSE, which is true of that string and irrelevant
     to the one a player copies. */
  await new Promise((res) => {
    if (probe.iceGatheringState === 'complete') return res();
    const t = setTimeout(res, 4000);
    probe.addEventListener('icegatheringstatechange', () => {
      if (probe.iceGatheringState === 'complete') { clearTimeout(t); res(); }
    });
  });
  const sdp = probe.localDescription.sdp;
  probe.close();
  const out = {};

  const packed = await Code.pack({ type: 'offer', sdp }, 'house');
  const back = await Code.unpack(packed, STAGES);
  out.roundTrip = !!back && back.type === 'offer' && back.sdp === sdp && back.stage === 'house';
  // A blob is a paste, not a retype — but it must not be absurd either.
  out.length = packed.length;
  out.raw = sdp.length;
  /* THE FAIR COMPARISON IS AGAINST PLAIN BASE64, not against the raw string.
     The blob has to be base64 whatever else happens — a multi-line SDP pasted
     into a chat app comes back with its line endings rewritten and its leading
     spaces eaten — so the question deflate has to answer is "do you pay for
     your own complexity", and the alternative it is beating is base64 alone.
     Measured here: an offer with one loopback candidate is 560 raw, 832 as
     plain base64 and 574 packed; a realistic one with six candidates is 1167 /
     1658 / 747. Compression is a wash on the first and a 55% saving on the
     second, and never a loss against the thing it replaces. */
  const plain = (s) => {
    const b = new TextEncoder().encode(s);
    let x = ''; for (let i = 0; i < b.length; i++) x += String.fromCharCode(b[i]);
    return btoa(x).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '').length;
  };
  out.plain = plain(JSON.stringify({ t: 'o', s: sdp, g: 'house' }));
  out.beatsPlainB64 = packed.length < out.plain;
  // Short enough to be a paste, and made of nothing a chat app will rewrite.
  out.pasteSized = packed.length < 1200;
  out.urlSafe = /^[A-Za-z0-9_-]+$/.test(packed);

  /* THE STAGE IS AN ATTACKER-CHOSEN STRING, so it is allow-listed rather than
     looked up. A prototype key must come back as null, not as itself. */
  const evil = await Code.unpack(await Code.pack({ type: 'offer', sdp }, '__proto__'), STAGES);
  out.refusesProtoStage = !!evil && evil.stage === null;
  const unknown = await Code.unpack(await Code.pack({ type: 'offer', sdp }, 'atlantis'), STAGES);
  out.refusesUnknownStage = !!unknown && unknown.stage === null;

  // Not an SDP at all.
  out.refusesNonSdp = await Code.unpack(await Code.pack({ type: 'offer', sdp: 'hello' }), STAGES) === null;
  // Not a code at all.
  out.refusesGarbage = await Code.unpack('not a code', STAGES) === null
    && await Code.unpack('', STAGES) === null;
  // The type is an allow-list, so a third value cannot enter the state machine.
  out.refusesThirdType = await Code.unpack(
    await (async () => {
      const cs = new CompressionStream('deflate-raw');
      const w = cs.writable.getWriter();
      w.write(new TextEncoder().encode(JSON.stringify({ t: 'x', s: sdp }))); w.close();
      const buf = await new Response(cs.readable).arrayBuffer();
      let s = ''; const b = new Uint8Array(buf);
      for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
      return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    })(), STAGES) === null;
  return out;
});
check('an invite round-trips with its stage', code.roundTrip);
check('compression pays for itself against plain base64', code.beatsPlainB64,
  `${code.raw} of SDP: ${code.plain} plain, ${code.length} packed`);
check('the invite is a paste, not a novel', code.pasteSized, `${code.length} chars`);
check('and contains nothing a chat app will rewrite', code.urlSafe);
check('a prototype key as a stage id comes back null', code.refusesProtoStage);
check('an unknown stage id comes back null', code.refusesUnknownStage);
check('a payload that is not an SDP is refused', code.refusesNonSdp);
check('garbage is refused', code.refusesGarbage);
check('an unknown description type is refused', code.refusesThirdType);

/* ============================================================
   6. Suspension, not corruption, when a world changes
   ============================================================ */
console.log('\n=== changing stage under a live session ===');

const sync = await page.evaluate(async () => {
  const { Session } = await import('/src/net/Session.js');
  const P = await import('/src/net/Protocol.js');

  /* A stand-in Game with the two things Session actually reads. No three.js
     scene is needed until a ghost is created, and none is here. */
  const removed = [];
  const game = {
    stage: { id: 'house', goal: 100 },
    world: { bounds: { minX: -50, maxX: 50, minZ: -50, maxZ: 50 }, field: { n: 500, remove: (i) => removed.push(i) } },
    scene: { scene: { add() {} } },
  };
  const s = new Session(game);
  const sent = [];
  const peer = { send: (b) => sent.push(b), close() {}, ctx: null };
  s.add(peer);

  const out = {};
  out.startsUnsynced = s.synced === false;

  // A pickup before the handshake must not touch the world.
  s._apply(peer, { type: P.MSG.PICKUP, idx: [1, 2, 3] });
  out.ignoresPickupBeforeSync = removed.length === 0;

  // Their hello, matching our world.
  s._apply(peer, { type: P.MSG.HELLO, version: 1, stageHash: s.hash, colour: 0 });
  out.syncsOnMatchingHello = s.synced === true;
  s._apply(peer, { type: P.MSG.PICKUP, idx: [7] });
  out.appliesPickupAfterSync = removed.length === 1 && removed[0] === 7;

  // Now WE change world. Same session, same peer, different stage.
  game.stage = { id: 'city', goal: 900 };
  game.world.field.n = 900;
  s.resync();
  out.suspendsOnStageChange = s.synced === false;
  out.refreshedPeerCtx = peer.ctx && peer.ctx.propCount === 900;
  s._apply(peer, { type: P.MSG.PICKUP, idx: [8] });
  out.ignoresPickupWhileSuspended = removed.length === 1;

  // A hello that still names the OLD world keeps us suspended, not connected.
  s._apply(peer, { type: P.MSG.HELLO, version: 1, stageHash: P.stageHash('house', 500), colour: 0 });
  out.staleHelloDoesNotResync = s.synced === false;
  out.staysConnected = s.peers.length === 1;

  // They catch up. Play resumes with no new invite.
  s._apply(peer, { type: P.MSG.HELLO, version: 1, stageHash: s.hash, colour: 0 });
  out.resumesWhenTheyCatchUp = s.synced === true;
  s._apply(peer, { type: P.MSG.PICKUP, idx: [9] });
  out.appliesAfterResume = removed.length === 2;

  // A version mismatch is still terminal — no amount of waiting fixes it.
  let closed = false;
  const peer2 = { send() {}, close() { closed = true; }, ctx: null };
  const s2 = new Session(game);
  s2.add(peer2);
  s2._apply(peer2, { type: P.MSG.HELLO, bad: 'version', version: 99 });
  out.versionIsTerminal = closed && s2.status === 'version-mismatch';

  s.close(); s2.close();
  return out;
});
check('a session starts unsynced', sync.startsUnsynced);
check('a pickup before the handshake is ignored', sync.ignoresPickupBeforeSync);
check('a matching hello syncs it', sync.syncsOnMatchingHello);
check('a pickup after the handshake is applied', sync.appliesPickupAfterSync);
check('changing stage suspends the exchange', sync.suspendsOnStageChange);
check("the peer's decode context follows the new world", sync.refreshedPeerCtx);
check('a pickup arriving while suspended is ignored', sync.ignoresPickupWhileSuspended,
  'this is the one that would delete the wrong scenery');
check('a stale hello does not resync', sync.staleHelloDoesNotResync);
check('a stage change does not drop the connection', sync.staysConnected);
check('play resumes when they load the same stage', sync.resumesWhenTheyCatchUp);
check('and pickups flow again', sync.appliesAfterResume);
check('a protocol version mismatch still closes', sync.versionIsTerminal);

await page.close();

/* ============================================================
   7. The UI, in the real game, in two real browser tabs

   Everything above tests the machinery. This tests the thing a
   player actually touches — and it is the only place the opt-in
   claim can be checked as BEHAVIOUR rather than as source text.
   `RTCPeerConnection` and `WebSocket` are replaced before the
   app's first line runs, so the count is a fact about the loaded
   game rather than about what its code appears to say.
   ============================================================ */
/* ⚠ EVERY TIMEOUT HERE IS EXPLICIT AND IN THE THIRD ARGUMENT. Playwright's
   signature is waitForFunction(pageFunction, arg, options) — passing the
   options object second makes it the page function's ARGUMENT and silently
   leaves the 30s default in place. That was true of every timed wait in
   fifteen files here, and it only surfaced when four harnesses were queued
   back to back and a world build crossed 30s: a `{timeout: 90000}` wait
   died at exactly 30000ms. A wait that reports the wrong number in its own
   error message is worse than one with no timeout at all. */
console.log('\n=== the panel, in two tabs ===');

const spy = () => {
  window.__conns = { rtc: 0, ws: [] };
  const R = window.RTCPeerConnection;
  window.RTCPeerConnection = function (...a) { window.__conns.rtc++; return new R(...a); };
  window.RTCPeerConnection.prototype = R.prototype;
  const W = window.WebSocket;
  window.WebSocket = function (...a) { window.__conns.ws.push(String(a[0])); return new W(...a); };
  window.WebSocket.prototype = W.prototype;
};

const open = async () => {
  const p = await browser.newPage({ viewport: { width: 900, height: 700 } });
  p.on('pageerror', (e) => errors.push(String(e.message)));
  await p.addInitScript(spy);
  await p.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
  await p.waitForFunction(() => window.__llmaci?.state === 'title', null, { timeout: 120000 });
  /* ⚠ A TEST-ENVIRONMENT CONCESSION, in the same category as the mDNS flag
     above — and it is about the HARNESS, not about the game.
     Playwright refuses to click until an element's bounding box has been
     STABLE across two consecutive animation frames. This panel has a 240ms
     screen fade, a 90ms hover transform on every button, and a panel that can
     scroll when a textarea takes focus. On an idle machine all of that settles
     between two frames; with several pages of swiftshader competing for two
     cores it does not, and the failure is a bare 30-second timeout whose
     message says only that it waited — indistinguishable from a disabled
     button or a panel that had moved on.
     Three runs went into that ambiguity. The diagnostic below finally pinned
     the state (enabled, visible, 209x79, phase host-manual) and Playwright's
     own log named the cause: "element is not stable".
     Only motion is removed. Every static style still applies, so the phone
     layout measurements in section 8 measure exactly what a player sees. */
  await p.addStyleTag({
    content: '*, *::before, *::after { animation: none !important; transition: none !important; }',
  });
  return p;
};

/**
 * Press a button by dispatching the event the game actually listens for.
 *
 * ⚠ DELIBERATELY NOT `page.click`, and this is a scope decision rather than a
 * workaround. Playwright's click waits for the target's bounding box to be
 * STABLE across two consecutive animation frames before it will fire. With two
 * full game loops rendering under swiftshader on two cores, this panel's box
 * never satisfies that, and the result is a bare 30-second timeout whose
 * message says only that it waited — indistinguishable from a disabled button
 * or a panel that had moved on. Four runs went into that ambiguity; the
 * diagnostic below and Playwright's own log eventually named it as
 * "element is not stable", with the button enabled, visible and 209x79 the
 * whole time.
 *
 * What this section asserts is the co-op STATE MACHINE — that pressing host
 * produces an invite, that pasting it builds the right world, that the two
 * tabs converge. Whether a button is hit-testable is a LAYOUT question, and it
 * is already asserted properly in section 8, which measures every control's
 * real geometry at phone size. Dispatching the same bubbling click the game's
 * own delegated listener handles tests the thing this section is about without
 * making it hostage to frame timing on a loaded machine.
 */
const tap = (p, selector) => p.evaluate((sel) => {
  const el = document.querySelector(sel);
  if (!el) throw new Error(`no element for ${sel}`);
  if (el.disabled) throw new Error(`${sel} is disabled`);
  if (el.classList.contains('hidden')) throw new Error(`${sel} is hidden`);
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
}, selector);

const A = await open();
const B = await open();

const conns = (p) => p.evaluate(() => ({
  rtc: window.__conns.rtc,
  // Vite's dev server opens an HMR socket of its own; only /room/ is ours.
  rooms: window.__conns.ws.filter((u) => u.includes('/room/')).length,
}));

const booted = await conns(A);
check('booting the game opens no peer connection', booted.rtc === 0, `${booted.rtc} constructed`);
check('booting the game opens no signalling socket', booted.rooms === 0);

await tap(A, '[data-action="coop"]');
await A.waitForFunction(() => window.__llmaci.state === 'coop', null, { timeout: 60000 });
const onPanel = await conns(A);
check('opening the panel still opens nothing', onPanel.rtc === 0 && onPanel.rooms === 0);

const disclosure = await A.evaluate(() => {
  const el = document.querySelector('#coop-menu .coop-warn');
  const vis = el && !el.closest('.hidden') && el.getBoundingClientRect().height > 0;
  return { text: el ? el.textContent.replace(/\s+/g, ' ').trim() : '', vis: !!vis };
});
check('the panel says what peer-to-peer costs you, before any button',
  disclosure.vis && /IP address/i.test(disclosure.text) && /no server/i.test(disclosure.text));
check('room codes are hidden with no signalling worker configured',
  await A.evaluate(() => document.getElementById('coop-room-block').classList.contains('hidden')));

/* ---- host ---- */
await tap(A, '[data-action="coop-host"]');
await A.waitForSelector('#coop-stage:not(.hidden)');
const offered = await A.evaluate(() =>
  [...document.getElementById('coop-stage-sel').options].map((o) => o.value));
check('the stage list offers only unlocked stages', offered.length === 1 && offered[0] === 'quantum',
  offered.join(','));

await tap(A, '[data-action="coop-make"]');
await A.waitForFunction(() => {
  const t = document.getElementById('coop-out');
  return t && t.value.length > 40;
}, null, { timeout: 60000 });
const invite = await A.evaluate(() => document.getElementById('coop-out').value);
const afterMake = await conns(A);
check('an invite is produced', invite.length > 40, `${invite.length} chars`);
check('exactly one peer connection was constructed', afterMake.rtc === 1, `${afterMake.rtc}`);
check('and still no signalling socket', afterMake.rooms === 0);
check('the host world is built before the invite exists',
  await A.evaluate(() => !!window.__llmaci.world && window.__llmaci.stage.id === 'quantum'));

/* ---- join ---- */
await tap(B, '[data-action="coop"]');
await B.waitForFunction(() => window.__llmaci.state === 'coop', null, { timeout: 60000 });
await tap(B, '[data-action="coop-join"]');
await B.waitForSelector('#coop-in-block:not(.hidden)');
await B.evaluate((v) => { document.getElementById('coop-in').value = v; }, invite);
await tap(B, '[data-action="coop-go"]');
await B.waitForFunction(() => {
  const t = document.getElementById('coop-out');
  return t && !t.closest('.hidden') && t.value.length > 40;
}, null, { timeout: 90000 });
const reply = await B.evaluate(() => document.getElementById('coop-out').value);
check('the joiner loads the stage the invite named',
  await B.evaluate(() => window.__llmaci.stage && window.__llmaci.stage.id === 'quantum'));
check('the joiner produces a reply', reply.length > 40, `${reply.length} chars`);

/* ---- connect ---- */
await A.evaluate((v) => { document.getElementById('coop-in').value = v; }, reply);
/* ⚠ SAY WHY, DO NOT JUST TIME OUT. Playwright's `click` waits for visible +
   enabled + stable and then reports only that it waited — which under load is
   indistinguishable between "the panel moved on without us", "the button is
   disabled" and "something is still animating". That ambiguity has already
   cost two full runs of this harness. */
const goState = await A.evaluate(() => {
  const el = document.getElementById('coop-go');
  const r = el.getBoundingClientRect();
  const c = window.__llmaci.coop;
  return {
    disabled: el.disabled, hidden: el.classList.contains('hidden'),
    w: Math.round(r.width), h: Math.round(r.height),
    phase: c.phase, locked: c.locked, linked: c.linked,
    status: document.getElementById('coop-status').textContent.slice(0, 60),
    net: window.__llmaci.net && window.__llmaci.net.status,
  };
});
check('the host Connect button is live when the reply comes back',
  !goState.disabled && !goState.hidden && goState.w > 0, JSON.stringify(goState));
await tap(A, '[data-action="coop-go"]');

const linked = (p) => p.waitForFunction(
  () => window.__llmaci.net && window.__llmaci.net.synced === true, null, { timeout: 90000 })
  .then(() => true).catch(() => false);
const bothLinked = (await Promise.all([linked(A), linked(B)])).every(Boolean);
/* If this fails, the reason is on screen and in the peer — say so rather than
   leaving a bare FAIL that could be ICE, signalling, the handshake or the UI. */
const why = bothLinked ? '' : await Promise.all([A, B].map((p) => p.evaluate(() => {
  const g = window.__llmaci;
  const c = g.coop;
  return [
    document.getElementById('coop-status').textContent.slice(0, 70),
    `net=${g.net && g.net.status}/${g.net && g.net.synced}`,
    `peer=${c.peer && c.peer.state}:${c.peer && (c.peer.reason || '-')}`,
    `ice=${c.peer && c.peer.pc.iceConnectionState}`,
  ].join(' | ');
}))).then((r) => `\n      host: ${r[0]}\n      join: ${r[1]}`);
check('the two tabs connect and agree on the world', bothLinked, why);

if (bothLinked) {
  check('both land on the intro screen, not straight into the round', await A.evaluate(
    () => window.__llmaci.state === 'intro'
      && !document.getElementById('intro-coop').classList.contains('hidden')));

  /* ⚠ THE TWO PLAYERS MUST NOT START INSIDE EACH OTHER, and the offset is
     applied when the round is BUILT — which happens before the connection
     exists — so it cannot be derived from the session. If it ever is, this
     assertion fails on the first round of a game and passes on every one
     after, which is about the most confusing shape a bug can have. */
  const spawns = await Promise.all([A, B].map((p) => p.evaluate(() => {
    const g = window.__llmaci;
    return {
      x: g.kat.group.position.x,
      z: g.kat.group.position.z,
      start: g.stage.startSize,
      // ⚠ RELATIVE TO THE STAGE'S OWN SPAWN, not to the origin. The first
      // version of this compared the sign of the absolute x and failed on the
      // quantum stage, whose spawn is nowhere near zero — both players were
      // correctly on opposite sides of it and both had negative coordinates.
      offset: g.kat.group.position.x - g.stage.spawn.x,
    };
  })));
  const apart = Math.hypot(spawns[0].x - spawns[1].x, spawns[0].z - spawns[1].z);
  check('the two players spawn clear of each other',
    apart > spawns[0].start * 2,
    `${(apart / spawns[0].start).toFixed(1)} start-sizes apart`);
  /* And on OPPOSITE sides of the designed spawn rather than both displaced the
     same way, which would separate them from the stage instead of each other. */
  check('and on opposite sides of the stage spawn point',
    Math.sign(spawns[0].offset) !== Math.sign(spawns[1].offset)
    && spawns[0].offset !== 0,
    `offsets ${spawns[0].offset.toFixed(3)} and ${spawns[1].offset.toFixed(3)}`);

  await A.evaluate(() => window.__llmaci.begin());
  await B.evaluate(() => window.__llmaci.begin());
  await A.waitForFunction(() => window.__llmaci.state === 'playing', null, { timeout: 60000 });
  await B.waitForFunction(() => window.__llmaci.state === 'playing', null, { timeout: 60000 });

  // A ghost appears on B once A has sent a few state packets.
  const sawGhost = await B.waitForFunction(() => {
    const n = window.__llmaci.net;
    if (!n || !n.ghosts.size) return false;
    for (const [, g] of n.ghosts) if (g.mesh.visible) return true;
    return false;
  }, null, { timeout: 20000 }).then(() => true).catch(() => false);
  check("the other player's katamari shows up", sawGhost);

  /* THE MARKER, which is what makes it co-op rather than two people in the
     same building. Checked as rendered geometry, not as a flag: the class
     could be right and the element still be parked at 0,0 or hidden by a
     stylesheet. */
  const marker = await B.evaluate(() => {
    const el = document.getElementById('friend-marker');
    if (!el) return { missing: true };
    const r = el.getBoundingClientRect();
    const st = getComputedStyle(el);
    return {
      missing: false,
      hidden: el.classList.contains('hidden'),
      w: r.width, h: r.height,
      onScreen: r.left > -50 && r.right < window.innerWidth + 50
        && r.top > -50 && r.bottom < window.innerHeight + 50,
      colour: st.getPropertyValue('--friend').trim(),
      ghostColour: (() => {
        for (const [, g] of window.__llmaci.net.ghosts) return g.colour;
        return null;
      })(),
    };
  });
  check('a marker points at your friend', !marker.missing && !marker.hidden
    && marker.w > 8 && marker.onScreen,
    `${Math.round(marker.w)}x${Math.round(marker.h)}px, on screen ${marker.onScreen}`);
  check('and it wears their colour, not a generic one',
    marker.colour === `#${(marker.ghostColour >>> 0).toString(16).padStart(6, '0')}`,
    `${marker.colour} vs ghost ${marker.ghostColour}`);

  /* And it must LIE about nothing. A ghost whose packets have stopped is
     hidden, and pointing at where they were four seconds ago would send a
     player across a city to an empty patch of floor.

     ⚠ SYNCHRONOUSLY, WITHIN ONE EVALUATE. The first version staled the ghost
     and then awaited two frames before checking — but the other tab is still
     playing and still broadcasting at 20Hz, so a fresh STATE arrived in the
     gap and un-staled it. The test was measuring "does a live peer keep its
     ghost alive", which it does, rather than the thing under test. */
  const honest = await B.evaluate(() => {
    const g = window.__llmaci;
    for (const [, gh] of g.net.ghosts) { gh.seen = 0; gh.mesh.visible = false; }
    const stale = g.net.nearestGhost(g.kat.group.position);
    // And the same for a session that is connected but not in the same world.
    const was = g.net.synced;
    g.net.synced = false;
    for (const [, gh] of g.net.ghosts) gh.mesh.visible = true;
    const unsynced = g.net.nearestGhost(g.kat.group.position);
    g.net.synced = was;
    // The HUD side: clearing really removes it, rather than leaving it parked.
    g.hud.clearFriend();
    return {
      stale, unsynced,
      hidden: document.getElementById('friend-marker').classList.contains('hidden'),
    };
  });
  check('and it hides rather than pointing at a stale position', honest.stale === null);
  check('and points at nobody while the worlds disagree', honest.unsynced === null);
  check('and clearing it really hides the marker', honest.hidden);

  /* THE ONE THING THAT MUST CONVERGE. A eats a prop; the same prop must die on
     B, by index, with no acknowledgement of any kind. */
  const propGone = await A.evaluate(async () => {
    const g = window.__llmaci;
    // Pick something still alive and hand it to the net layer the way a real
    // pickup does. `notePickup` is what `_handleEvents` calls.
    const f = g.world.field;
    let idx = -1;
    for (let i = 0; i < f.n; i++) if (f.alive[i]) { idx = i; break; }
    if (idx < 0) return -1;
    f.remove(idx);
    g.net.notePickup(idx);
    return idx;
  });
  const converged = propGone >= 0 && await B.waitForFunction(
    (i) => !window.__llmaci.world.field.alive[i], propGone, { timeout: 15000 })
    .then(() => true).catch(() => false);
  check('a prop one player eats disappears for the other', converged, `prop ${propGone}`);

  /* AND THE THING THAT MUST NOT HAPPEN: no remote value may move the local
     ball. A's radius is entirely A's own business. */
  const isolated = await B.evaluate(() => {
    const g = window.__llmaci;
    const before = g.kat.radius;
    for (const [, gh] of g.net.ghosts) gh.radius = 1e6;
    return { before, after: g.kat.radius };
  });
  check('a remote ball cannot change the local one', isolated.before === isolated.after);

  /* Leaving for the title must actually let go. */
  await A.evaluate(() => window.__llmaci.toTitle());
  check('quitting to the title tears the session down',
    await A.evaluate(() => window.__llmaci.net === null));
  const bDropped = await B.waitForFunction(
    () => window.__llmaci.net && window.__llmaci.net.peers.length === 0, null, { timeout: 20000 })
    .then(() => true).catch(() => false);
  check('and the other side notices', bDropped);
}

const finalConns = await conns(A);
check('no connection was ever opened that a button did not ask for',
  finalConns.rtc === 1 && finalConns.rooms === 0, `rtc ${finalConns.rtc}, rooms ${finalConns.rooms}`);

await A.close();
await B.close();

/* ============================================================
   8. The panel on a phone

   ⚠ ARITHMETIC, NOT A SCREENSHOT. This project has fixed the
   same class of bug three times — the pan arrows on the finish
   chip, the Back button under Safari's toolbar, the Options
   controls hugging the left edge — and every one of them looked
   fine in a picture at desktop size. The panel is the only screen
   in the game with a TEXTAREA in it, which brings a failure mode
   none of the others have: iOS Safari zooms the whole page in
   when you focus a field whose font is under 16px, and it does
   not zoom back out.
   ============================================================ */
console.log('\n=== the panel on a phone ===');

const P2 = await browser.newPage({
  // A small modern phone in portrait, with the address bar showing.
  viewport: { width: 390, height: 664 },
  hasTouch: true,
  isMobile: true,
  deviceScaleFactor: 3,
});
P2.on('pageerror', (e) => errors.push(String(e.message)));
await P2.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
await P2.waitForFunction(() => window.__llmaci?.state === 'title', null, { timeout: 120000 });
// Same concession as `open()` above: motion only, static layout untouched.
await P2.addStyleTag({
  content: '*, *::before, *::after { animation: none !important; transition: none !important; }',
});
/* `tap`, not `click`, for the same reason as the two-tab section — and the
   hit-testing claim is not weakened by it. What proves this panel is usable
   with a thumb is the MEASUREMENT below: every control at least 34px tall,
   inside the panel box, no horizontal overflow. The click is only how we
   navigate to the thing being measured. */
await tap(P2, '[data-action="coop"]');
await P2.waitForFunction(() => window.__llmaci.state === 'coop', null, { timeout: 60000 });

const phone = await P2.evaluate(() => {
  const panel = document.querySelector('#coop-screen .panel');
  const vw = window.innerWidth, vh = window.innerHeight;
  const pr = panel.getBoundingClientRect();
  const bad = [];

  /* Every control that is on screen right now must be inside the panel's
     horizontal box and inside the viewport vertically, or reachable by
     scrolling the panel (which is the overflow container). */
  const measure = () => {
    for (const el of document.querySelectorAll('#coop-screen button, #coop-screen textarea, '
      + '#coop-screen select, #coop-screen input')) {
      if (!el.offsetParent && el.offsetHeight === 0) continue;      // genuinely hidden
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      const id = el.id || el.dataset.action || el.tagName.toLowerCase();
      if (r.left < pr.left - 1 || r.right > pr.right + 1) {
        bad.push(`${id} escapes the panel sideways (${Math.round(r.left)}..${Math.round(r.right)} vs ${Math.round(pr.left)}..${Math.round(pr.right)})`);
      }
      // A finger needs ~44 CSS px. Everything here is a primary control.
      if (r.height < 34) bad.push(`${id} is only ${Math.round(r.height)}px tall`);
    }
  };
  measure();

  // Walk to the exchange step, which is the busiest layout, and measure again.
  window.__llmaci.onAction('coop-join');
  measure();

  const box = document.getElementById('coop-in');
  const fs = parseFloat(getComputedStyle(box).fontSize);

  return {
    bad,
    fits: pr.top >= -1 && pr.bottom <= vh + 1 && pr.left >= -1 && pr.right <= vw + 1,
    panel: `${Math.round(pr.width)}x${Math.round(pr.height)} in ${vw}x${vh}`,
    // Does the panel scroll rather than clip? Content taller than the box is
    // fine; content taller than the box with no overflow is not.
    scrolls: getComputedStyle(panel).overflowY === 'auto',
    fontSize: fs,
    noHorizontalPageScroll: document.documentElement.scrollWidth <= vw,
  };
});

check('the co-op panel fits the viewport', phone.fits, phone.panel);
check('and scrolls rather than clipping when it is taller', phone.scrolls);
check('nothing in it overflows or is too small to tap', phone.bad.length === 0,
  phone.bad.join('; '));
check('the paste box is at least 16px, so iOS does not zoom the page in',
  phone.fontSize >= 16, `${phone.fontSize}px`);
check('the page itself never scrolls sideways', phone.noHorizontalPageScroll);
await P2.close();

console.log(`\npage errors: ${errors.length ? errors.join(' | ') : 'none'}`);
if (errors.length) fail++;

await browser.close();
await server.close();
console.log(fail ? `\n${fail} FAILED` : '\nthe network layer behaves');
process.exit(fail ? 1 : 0);
