/* ============================================================
   Signalling for Claudemary LLMaci — Stage 2.

   A Cloudflare Worker plus one Durable Object. Its entire job is
   to let two browsers that both know a six-character code hand
   each other an SDP blob, and then to get out of the way.

   ⚠ THIS IS THE ONE ABUSABLE THING IN THE WHOLE PROJECT, and it
   is abusable in an obvious way: a server that relays opaque
   payloads between anyone who names the same string is a free
   pub/sub service. Somebody will find it. Every bound below
   exists to make it useless for anything but this game:

     - TWO PEERS PER ROOM. The third is told the room is full and
       disconnected. A broadcast bus needs a crowd; this cannot
       have one.
     - MESSAGES ARE PARSED, NOT FORWARDED. Only {k:'desc'} with an
       allow-listed type and a bounded SDP string gets through,
       and it is REBUILT on the way out rather than passed along,
       so no field the sender invented survives the trip.
     - IT MUST LOOK LIKE SDP. A payload that does not begin `v=0`
       is not signalling and is refused.
     - SIX MESSAGES PER SOCKET, EVER. An offer and an answer is
       two. Six is generous. After that the socket is closed, so
       a channel cannot be held open and used.
     - NINETY SECONDS PER ROOM. Signalling takes about two.
     - The client closes the socket as soon as the data channel
       is up (`Room.done()`), so in the normal case this thing is
       alive for a couple of seconds per game.

   Deliberately NOT here: any record of who connected to whom, any
   logging of SDP (it contains IP addresses), any store of room
   history. The DO holds two sockets and a counter in memory and
   forgets everything when it hibernates.

   TURN CREDENTIALS. If TURN_KEY_ID and TURN_API_TOKEN are set as
   Worker secrets, a room mints a short-TTL credential set and
   hands it to both peers. This is the reason a signalling server
   earns its place beyond convenience: TURN credentials CANNOT be
   shipped in the bundle. The game is view-source, so a hardcoded
   credential is a free relay for anybody who reads the page.
   Without the secrets it degrades to STUN-only, which is fine for
   most pairs and hopeless for two phones on mobile data.

   Deploy:  cd worker && npx wrangler deploy
   Secrets: npx wrangler secret put TURN_API_TOKEN
   ============================================================ */

const MAX_SDP = 20000;
const MAX_MSGS_PER_SOCKET = 6;
const ROOM_TTL_MS = 90_000;
const CODE_RE = /^[A-Z0-9]{4,12}$/;

/** Only the game's own origins may open a socket. Not security — hygiene. */
function corsOrigin(request, env) {
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const origin = request.headers.get('Origin') || '';
  if (!allowed.length) return '*';
  return allowed.includes(origin) ? origin : null;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return new Response('ok', { headers: { 'content-type': 'text/plain' } });
    }

    const m = url.pathname.match(/^\/room\/([^/]+)$/);
    if (!m) return new Response('not found', { status: 404 });

    const code = decodeURIComponent(m[1]).toUpperCase();
    if (!CODE_RE.test(code)) return new Response('bad room', { status: 400 });

    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('expected websocket', { status: 426 });
    }
    if (corsOrigin(request, env) === null) {
      return new Response('forbidden', { status: 403 });
    }

    /* One DO per code. `idFromName` is a hash, so the code never becomes an
       enumerable object id, and two people using the same code land together. */
    const id = env.ROOMS.idFromName(code);
    return env.ROOMS.get(id).fetch(request);
  },
};

export class Room {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sockets = new Set();
    this.counts = new WeakMap();
    this.opened = Date.now();
    this.ice = null;
  }

  async fetch(request) {
    if (this.sockets.size >= 2) {
      /* Third arrival. Told plainly rather than left hanging — and NOT told
         anything about who is already here. */
      const pair = new WebSocketPair();
      pair[1].accept();
      pair[1].send(JSON.stringify({ k: 'full' }));
      pair[1].close(1013, 'room full');
      return new Response(null, { status: 101, webSocket: pair[0] });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();
    this.sockets.add(server);
    this.counts.set(server, 0);

    /* A room that is never completed must not live forever. Signalling is a
       two-second job; ninety seconds is a very long grace period. */
    if (!this._reaper) {
      this._reaper = setTimeout(() => this._closeAll(1000, 'expired'), ROOM_TTL_MS);
    }

    const ice = await this._iceServers();
    if (ice) { try { server.send(JSON.stringify({ k: 'ice', servers: ice })); } catch { /* */ } }

    server.addEventListener('message', (evt) => this._onMessage(server, evt));
    server.addEventListener('close', () => { this.sockets.delete(server); });
    server.addEventListener('error', () => { this.sockets.delete(server); });

    return new Response(null, { status: 101, webSocket: client });
  }

  _onMessage(from, evt) {
    const n = (this.counts.get(from) || 0) + 1;
    this.counts.set(from, n);
    if (n > MAX_MSGS_PER_SOCKET) {
      /* Past this point it is not signalling any more, whatever it claims to
         be. Close rather than ignore: ignoring leaves a usable channel. */
      try { from.close(1008, 'too many messages'); } catch { /* */ }
      this.sockets.delete(from);
      return;
    }

    if (typeof evt.data !== 'string' || evt.data.length > MAX_SDP + 200) return;

    let msg;
    try { msg = JSON.parse(evt.data); } catch { return; }
    if (!msg || typeof msg !== 'object' || msg.k !== 'desc') return;

    const type = msg.t === 'offer' ? 'offer' : msg.t === 'answer' ? 'answer' : null;
    if (!type) return;
    const sdp = msg.d;
    if (typeof sdp !== 'string' || sdp.length === 0 || sdp.length > MAX_SDP) return;
    /* It has to actually be an SDP. Every session description begins with the
       version line; anything else is somebody using this as a message bus. */
    if (!sdp.startsWith('v=0')) return;

    /* The stage id, which the joiner needs before it can build the same world.
       Deliberately the tightest pattern that admits every id the game has —
       lowercase letters only, sixteen characters — because this is the one
       attacker-chosen STRING that crosses the relay, and a wide pattern here is
       a small covert channel. Sixteen lowercase letters is about 75 bits, so it
       is not a zero-capacity one; what makes it useless is the six-message cap
       and the two-peer limit, not the alphabet. The client allow-lists it
       against its own stage list on arrival regardless. */
    const g = typeof msg.g === 'string' && /^[a-z]{2,16}$/.test(msg.g) ? msg.g : '';

    /* REBUILT, NOT FORWARDED. The outbound object is constructed here from
       validated values only, so nothing the sender put in the message — extra
       keys, a payload smuggled in an unused field — can survive the hop. */
    const out = JSON.stringify(g
      ? { k: 'peer', t: type, d: sdp, g }
      : { k: 'peer', t: type, d: sdp });
    for (const s of this.sockets) {
      if (s === from) continue;
      try { s.send(out); } catch { /* */ }
    }
  }

  /**
   * Mint short-lived TURN credentials, once per room.
   *
   * Cached for the life of the room so two peers joining together cost one
   * upstream call. Returns null when the secrets are absent, which is a
   * supported configuration — the game falls back to STUN-only.
   */
  async _iceServers() {
    if (this.ice !== null) return this.ice;
    const keyId = this.env.TURN_KEY_ID;
    const token = this.env.TURN_API_TOKEN;
    if (!keyId || !token) { this.ice = false; return null; }
    try {
      const r = await fetch(
        `https://rtc.live.cloudflare.com/v1/turn/keys/${keyId}/credentials/generate-ice-servers`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          // Two hours: long enough for a session, short enough that a leaked
          // credential is worth little. Cloudflare's maximum is 48 hours.
          body: JSON.stringify({ ttl: 7200 }),
        },
      );
      if (!r.ok) { this.ice = false; return null; }
      const j = await r.json();
      const servers = j && j.iceServers;
      this.ice = servers ? [].concat(servers) : false;
      return this.ice || null;
    } catch {
      this.ice = false;
      return null;
    }
  }

  _closeAll(code, reason) {
    for (const s of this.sockets) { try { s.close(code, reason); } catch { /* */ } }
    this.sockets.clear();
  }
}
