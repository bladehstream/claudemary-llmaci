/* ============================================================
   Getting two browsers to describe themselves to each other.

   Two implementations behind one shape:

     Manual — Stage 1. No server anywhere. Each side produces a
       blob, the humans carry it between them by whatever means
       they already talk, and that is the entire mechanism.
     Room — Stage 2. A six-character code, with a tiny Cloudflare
       Durable Object standing in the middle for the two seconds
       it takes to swap descriptions.

   ⚠ A SHORT TYPEABLE CODE IS IMPOSSIBLE WITHOUT A SERVER, and it
   is worth being clear about why rather than treating Stage 2 as
   an optimisation. WebRTC requires each side to hand the other a
   full session description — an SDP blob. Even after aggressive
   compression the state of the art is 55-100 bytes, which is
   still ~80 base64 characters. It cannot be squeezed to six.
   Jackbox-style room codes work precisely BECAUSE something in
   the middle is remembering which code maps to which blob. That
   memory is the server. Stage 2 buys convenience with a
   dependency; Stage 1 keeps the dependency at zero and pays in
   copy-paste. Both are legitimate and the game ships both.

   NON-TRICKLE ICE, deliberately, in both. Trickle would mean a
   stream of candidate messages after the initial blob, which is
   fine over a websocket and impossible over copy-paste. Waiting
   for gathering to finish costs a second or two of setup and
   makes the offer a single self-contained thing, which is what
   lets the same code path serve both signalling methods.
   ============================================================ */

/* ------------------------------------------------------------
   Compaction

   Deflate it, then base64url the result; the browser's own
   CompressionStream does the work and costs nothing in bundle
   size.

   ⚠ MEASURED, because the first version of this comment guessed
   and guessed wrong — it claimed 1.2KB of SDP became ~350
   characters, and it does not. Chromium, from this project's own
   harness:

     one loopback candidate   560 raw   832 plain b64   574 packed
     six realistic candidates 1167 raw  1658 plain b64  747 packed

   So compression is a WASH on a tiny description and roughly a
   55% saving on a real one. It is not a wash against the thing it
   actually replaces, which is base64 alone: base64 is not
   optional here, because a multi-line SDP pasted through a chat
   app comes back with its line endings rewritten and its leading
   spaces eaten, and then `setRemoteDescription` refuses it.

   Getting below ~500 characters means not sending the SDP at all
   — rebuilding it at the far end from the handful of fields that
   vary (ufrag, pwd, fingerprint, candidates, setup role), which
   is how the 55-100 byte schemes work. That is a real option and
   deliberately not taken: it means owning a template of what
   every browser emits, and the failure mode of getting it wrong
   is a game that will not connect Firefox to Safari, on somebody
   else's machine, with nothing in the console. A 750-character
   paste is worse UX than a 100-character one and much better UX
   than one that silently does not work.
   ------------------------------------------------------------ */

const B64 = {
  to(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  },
  from(str) {
    const t = String(str).trim().replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(t + '==='.slice((t.length + 3) % 4));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  },
};

/**
 * Push bytes through a compression stream and read the other end.
 *
 * ⚠ THE WRITE SIDE'S PROMISES MUST BE OBSERVED. `writer.write()` and
 * `writer.close()` both return promises, and when the stream errors — which is
 * exactly what happens when somebody pastes something that is not a code — both
 * reject. Firing them and ignoring the result produces an UNHANDLED PROMISE
 * REJECTION, which in this project's own test harness showed up as a page error
 * ("Compressed input was truncated") with no failing assertion attached to it,
 * and in a browser shows up in the console of a player who did nothing worse
 * than paste the wrong thing.
 *
 * The `.catch` is deliberately empty and deliberately on the WRITE side only:
 * the read side's rejection is the one that carries the real reason, and it is
 * the one the caller's try/catch is positioned to see.
 */
async function pump(stream, bytes) {
  const w = stream.writable.getWriter();
  const written = (async () => { await w.write(bytes); await w.close(); })().catch(() => { /* the read side reports it */ });
  const buf = await new Response(stream.readable).arrayBuffer();
  await written;
  return new Uint8Array(buf);
}

async function squeeze(str) {
  const bytes = new TextEncoder().encode(str);
  if (typeof CompressionStream !== 'function') return B64.to(bytes);
  return B64.to(await pump(new CompressionStream('deflate-raw'), bytes));
}

async function unsqueeze(code) {
  const bytes = B64.from(code);
  if (typeof DecompressionStream !== 'function') return new TextDecoder().decode(bytes);
  // Empty in, empty out — deflate has no representation for zero bytes, and
  // handing it none is how `unpack('')` used to raise a stream error.
  if (!bytes.length) throw new Error('empty');
  return new TextDecoder().decode(await pump(new DecompressionStream('deflate-raw'), bytes));
}

/**
 * Pack a description into a paste-able code, and back.
 *
 * ⚠ THE UNPACKED RESULT IS UNTRUSTED. It goes to
 * `setRemoteDescription`, which is a browser API that parses SDP for a living
 * and is hardened for exactly this — but it must never reach anything else. In
 * particular it is never interpolated into markup, never used as an object key,
 * and the `type` is checked against a two-item allow-list rather than passed
 * through, so a crafted blob cannot smuggle a third value into the state
 * machine.
 *
 * THE OFFER CARRIES THE STAGE, and it has to — the two players must end up in
 * the same world or their prop indices name different scenery, and `stageHash`
 * can only DETECT that, never fix it. The joiner has no other channel to learn
 * which cosmos the host picked. It is a string from a stranger, so it is
 * allow-listed against the game's own stage ids on the way out of `unpack` and
 * returns null rather than the supplied value if it is not one of them.
 */
export const Code = {
  async pack(desc, stageId) {
    const o = { t: desc.type === 'offer' ? 'o' : 'a', s: desc.sdp };
    if (stageId) o.g = String(stageId);
    return squeeze(JSON.stringify(o));
  },
  /** @param {string[]} allowedStages the game's own stage ids — the allow-list. */
  async unpack(code, allowedStages = []) {
    let o;
    try { o = JSON.parse(await unsqueeze(code)); } catch { return null; }
    if (!o || typeof o !== 'object') return null;
    const type = o.t === 'o' ? 'offer' : o.t === 'a' ? 'answer' : null;
    if (!type) return null;
    if (typeof o.s !== 'string' || o.s.length > 20000) return null;
    /* An SDP begins with the version line. Same test the signalling worker
       applies, for the same reason: this must be a session description and not
       something wearing one's clothes. */
    if (!o.s.startsWith('v=0')) return null;
    const stage = typeof o.g === 'string' && allowedStages.includes(o.g) ? o.g : null;
    return { type, sdp: o.s, stage };
  },
};

/* ------------------------------------------------------------
   Stage 2 — the room
   ------------------------------------------------------------ */

/** Unambiguous when read aloud: no O/0, no I/1, no S/5. */
const ALPHABET = 'ABCDEFGHJKLMNPQRTUVWXY2346789';

export function randomRoomCode(n = 6) {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  let s = '';
  for (let i = 0; i < n; i++) s += ALPHABET[a[i] % ALPHABET.length];
  return s;
}

/**
 * A room on the signalling worker.
 *
 * The socket exists only for as long as it takes to swap two descriptions —
 * `done()` closes it the moment the data channel is up. That is a deliberate
 * safety property as much as a cost one: a rendezvous that hangs around is a
 * free message bus for anyone who guesses a room code, and the shortest-lived
 * version of that is the safest. See `worker/index.js`.
 */
export class Room {
  /** @param {string[]} allowedStages allow-list for the stage id the peer names. */
  constructor(url, code, { onPeerDescription, onStatus, onIce, allowedStages } = {}) {
    this.url = url;
    this.code = code;
    this.onPeerDescription = onPeerDescription || (() => {});
    this.onStatus = onStatus || (() => {});
    this.onIce = onIce || (() => {});
    this.allowedStages = allowedStages || [];
    this.ws = null;
    this.closed = false;
  }

  /**
   * Open the socket.
   *
   * ⚠ RESOLVES AFTER THE ICE MESSAGE, NOT AFTER THE SOCKET OPENS, and the
   * difference matters. TURN credentials arrive as the worker's first message,
   * and `iceServers` can only be set when the RTCPeerConnection is CONSTRUCTED
   * — resolving on `open` would mean the peer is built STUN-only and the relay
   * is never in its checklist, which is precisely the case a relay exists for.
   * `setConfiguration` can add servers later but does not retroactively gather
   * from them without an ICE restart, so waiting the few milliseconds here is
   * the cheap version. The cap exists because a worker with no TURN secrets
   * configured legitimately sends nothing at all.
   */
  connect() {
    return new Promise((resolve, reject) => {
      let ws;
      try {
        ws = new WebSocket(`${this.url.replace(/\/$/, '')}/room/${encodeURIComponent(this.code)}`);
      } catch (e) { reject(e); return; }
      this.ws = ws;
      ws.binaryType = 'arraybuffer';
      const bail = setTimeout(() => { this.close(); reject(new Error('signal-timeout')); }, 15000);
      let settle = null;
      const ready = () => {
        if (!settle) return;
        clearTimeout(settle); settle = null;
        this.onStatus('waiting');
        resolve(this);
      };

      ws.onopen = () => { clearTimeout(bail); settle = setTimeout(ready, 800); };
      ws.onerror = () => { clearTimeout(bail); reject(new Error('signal-error')); };
      ws.onclose = () => {
        clearTimeout(bail);
        /* A socket that closes before it ever resolved has to REJECT, not just
           report a status — otherwise the caller's await never settles and the
           UI sits on "opening a room…" forever with nothing to show for it.
           `ready` is a no-op after resolution, so this is safe either way. */
        if (settle) { clearTimeout(settle); settle = null; reject(new Error('signal-closed')); }
        if (!this.closed) this.onStatus('signal-closed');
      };
      ws.onmessage = (e) => {
        /* Everything from the signalling server is treated exactly as hostilely
           as anything from a peer — it relays whatever it is given, so "the
           server said so" is worth nothing. Same discipline: JSON only, a
           fixed key set, allow-listed enums, bounded lengths. */
        let m;
        try { m = JSON.parse(typeof e.data === 'string' ? e.data : ''); } catch { return; }
        if (!m || typeof m !== 'object') return;
        if (m.k === 'peer' && typeof m.d === 'string' && m.d.length < 30000) {
          const type = m.t === 'offer' ? 'offer' : m.t === 'answer' ? 'answer' : null;
          if (!type || !m.d.startsWith('v=0')) return;
          // Same allow-list as the copy-paste path. The worker relays this
          // string; it does not vouch for it, and nothing here pretends it does.
          const stage = typeof m.g === 'string' && this.allowedStages.includes(m.g) ? m.g : null;
          this.onPeerDescription({ type, sdp: m.d, stage });
        } else if (m.k === 'full') {
          this.onStatus('room-full');
        } else if (m.k === 'ice' && Array.isArray(m.servers)) {
          /* TURN credentials, minted server-side with a short TTL. They cannot
             live in the bundle: it is view-source, so a hardcoded credential is
             a free relay for anyone who reads it. See worker/index.js. */
          this.onIce(m.servers.filter((s) => s && typeof s.urls === 'string').slice(0, 8));
          ready();
        }
      };
    });
  }

  send(desc, stageId) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const m = { k: 'desc', t: desc.type, d: desc.sdp };
    if (stageId) m.g = String(stageId);
    this.ws.send(JSON.stringify(m));
  }

  /** Signalling is finished — let go of the server immediately. */
  done() { this.close(); }

  close() {
    this.closed = true;
    try { this.ws && this.ws.close(); } catch { /* */ }
    this.ws = null;
  }
}
