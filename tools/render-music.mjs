/* ============================================================
   Render the score to a .wav so a person can listen to it.

   Every other audio harness here measures. This one produces
   something you can put in your ears, which is the only way to
   settle an argument about whether music is any good. The
   repetition harness next door will tell you a loop is 15.0s
   long; it cannot tell you whether hearing it 24 times is
   pleasant or maddening.

   HOW IT WORKS, AND WHY IT IS SHAPED LIKE THIS

   AudioEngine and Music are written against a live AudioContext:
   the engine builds its graph in `init()` from
   `window.AudioContext`, and Music's scheduler is a setInterval
   reading `ctx.currentTime`. Neither survives being lifted into
   Node, and neither works against an OfflineAudioContext as
   written. So:

     * a real headless Chromium runs the real, unmodified source
       (served by the real Vite dev server, so what is rendered is
       what ships);
     * `window.AudioContext` is swapped for a stub whose
       constructor hands back an OfflineAudioContext. A
       constructor that returns an object wins over `this`, so
       `new Ctx({latencyHint})` inside `init()` quietly gets the
       offline context and the rest of the engine never notices;
     * the scheduler is driven BY HAND. setInterval does not
       advance an OfflineAudioContext -- the clock only moves
       during startRendering() -- so the steps are pushed in by
       this file rather than by a timer.

   WHY THE SCHEDULING IS CHUNKED RATHER THAN ALL UP FRONT
   The obvious version schedules every step before calling
   startRendering(). It works, and it is quadratic: every node
   for the whole render is alive from frame 0, and Chromium walks
   that list once per 128-sample quantum. Measured on two cores:
   15s took 5.7s, 30s took 20.8s, 60s took 120.5s. The 180s
   default would have taken twenty minutes.

   So instead the render is suspended once a second
   (OfflineAudioContext.suspend resolves when the clock reaches a
   time, exactly like the live look-ahead scheduler waking up)
   and only the next two seconds of music is scheduled at each
   stop. Nodes then live and die as the render passes them.
   Same 60s render: 15.7s, a 7.7x speedup, and the output is
   identical -- peak and RMS agree to four decimals at 15s, 30s
   and 60s and across window sizes from 0.5s to 4s. `--upfront`
   restores the naive version if you ever want to check that
   claim again.

   Math.random is replaced by a seeded PRNG for the duration.
   The reverb impulse, the noise buffer and the per-step timing
   jitter all pull from it, so without a seed two renders of the
   same song differ in ways that make an A/B between two
   arrangement proposals worthless.

   HOW DETERMINISTIC, MEASURED, NOT ASSUMED: two renders of
   `house 30 --seed=7` agree on 99.984% of samples exactly and
   differ by at most ONE 16-bit LSB (-90 dBFS peak, -128 dBFS
   RMS) on the rest. That residue is inside Chromium's own audio
   thread -- it survives muting both reverb sends, so it is not
   the convolver -- and it is 70dB below anything a comparison
   could care about. The seed is doing the real work: two
   different seeds differ by -1.4 dBFS peak. So: compare renders
   freely, just do not diff them with md5.

   USAGE
     node tools/render-music.mjs house
     node tools/render-music.mjs house 30
     node tools/render-music.mjs house 180 --intensity=ramp
     node tools/render-music.mjs city 60 --intensity=0.95 --label=loud
     node tools/render-music.mjs all 45 --intensity=ramp
     node tools/render-music.mjs country 60 --hurry=last

   FLAGS
     --intensity=N   0..1, or `ramp` for 0.2 -> 1.0 across the render
     --label=x       filename suffix; defaults to i70 / ramp
     --hurry[=last]  the last-30s arrangement, for the whole render or its tail
     --seed=N        PRNG seed (default 7)
     --sr=N          sample rate (default 44100)
     --upfront       schedule the whole render before rendering it (slow; see above)

   Files land in tools/audio/<songid>-<label>.wav.
   ============================================================ */

import { createServer } from 'vite';
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const OUT_DIR = path.join(ROOT, 'tools', 'audio');
const PORT = 5251;

/* Long enough for the 1.9s reverb plus the longest note release to decay to
   nothing. Steps are only scheduled up to `seconds`; this is the bit after. */
const TAIL = 2.5;

/* The live scheduler starts at `e.now + 0.08` and this render must too, because
   `_scheduleStep` dithers every step by +/-3ms of Math.random(). Starting at
   t=0 therefore hands a NEGATIVE absolute time to the first voice roughly half
   the time, and every AudioParam method throws on that. It is seed-dependent,
   so it looks like a flaky tool rather than an off-by-one: seed 7 rendered
   fine and seed 8 crashed in AudioEngine.kick. Same 0.08 as Music.play. */
const START = 0.08;

/* ------------------------------------------------------------
   CLI
   ------------------------------------------------------------ */

const argv = process.argv.slice(2);
const flags = new Map();
const positional = [];
for (const a of argv) {
  if (a.startsWith('--')) { const [k, v = 'true'] = a.slice(2).split('='); flags.set(k, v); }
  else positional.push(a);
}

const SONG_ARG = positional[0] || 'house';
const SECONDS = Number(positional[1] ?? 180);
const INTENSITY_ARG = flags.get('intensity') ?? '0.7';
const RAMP = INTENSITY_ARG === 'ramp';
const INTENSITY = RAMP ? null : Number(INTENSITY_ARG);
const SEED = Number(flags.get('seed') ?? 7);
const SAMPLE_RATE = Number(flags.get('sr') ?? 44100);
const HURRY = flags.has('hurry') ? (flags.get('hurry') === 'last' ? 'last' : 'on') : 'off';
const UPFRONT = flags.has('upfront');
const LABEL = flags.get('label') ?? (RAMP ? 'ramp' : `i${Math.round(INTENSITY * 100)}`);

if (!RAMP && !(INTENSITY >= 0 && INTENSITY <= 1)) {
  console.error(`--intensity must be 0..1 or "ramp", got "${INTENSITY_ARG}"`);
  process.exit(2);
}
if (!(SECONDS > 0 && SECONDS <= 900)) {
  console.error(`seconds must be 0..900, got "${SECONDS}"`);
  process.exit(2);
}
/* The label becomes a filename and a Chromium download name, so keep it to
   characters that mean the same thing on every filesystem. */
if (!/^[\w.-]+$/.test(LABEL)) {
  console.error(`--label must be letters, digits, dot, dash or underscore, got "${LABEL}"`);
  process.exit(2);
}

/* ------------------------------------------------------------
   Finding a browser.

   CHROMIUM_PATH is the contract the rest of tools/ uses. The
   fallback exists because Playwright pins a browser revision per
   release and a machine that has 1194 installed against a
   Playwright expecting 1234 will refuse to launch at all -- which
   is a build-environment problem, not a reason for this tool to
   be unusable.
   ------------------------------------------------------------ */
function findChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const pools = [process.env.PLAYWRIGHT_BROWSERS_PATH, '/opt/pw-browsers',
    path.join(process.env.HOME || '/root', '.cache', 'ms-playwright')].filter(Boolean);
  for (const pool of pools) {
    if (!fs.existsSync(pool)) continue;
    /* Numeric sort on the revision, not lexicographic: "chromium-999" sorts
       above "chromium-1194" as a string, which would pick the older build. */
    const dirs = fs.readdirSync(pool)
      .filter((d) => /^chromium-\d+$/.test(d))
      .sort((x, y) => Number(y.slice(9)) - Number(x.slice(9)));
    for (const d of dirs) {
      const exe = path.join(pool, d, 'chrome-linux', 'chrome');
      if (fs.existsSync(exe)) return exe;
    }
  }
  return null;   // let Playwright try its own default
}

/* ------------------------------------------------------------
   The page-side renderer.

   Everything from here to `startRendering()` runs inside
   Chromium. It is passed as a function to page.evaluate, so it
   cannot close over anything above -- all inputs arrive in `o`.
   ------------------------------------------------------------ */

async function renderInPage(o) {
  /* mulberry32, the same generator src/util/math.js uses. Copied rather than
     imported because this function is serialised into the page and cannot
     close over a module. */
  let a = o.seed >>> 0;
  Math.random = () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const [{ AudioEngine }, { Music }, { SONGS }] = await Promise.all([
    import('/src/audio/AudioEngine.js'),
    import('/src/audio/Music.js'),
    import('/src/audio/songs.js'),
  ]);
  if (!SONGS[o.songId]) throw new Error(`unknown song "${o.songId}"`);

  const total = o.start + o.seconds + o.tail;
  const length = Math.ceil(total * o.sampleRate);
  const oac = new OfflineAudioContext({ numberOfChannels: 2, length, sampleRate: o.sampleRate });

  /* The swap described in the header. `init()` does `new Ctx({latencyHint})`;
     a constructor returning an object overrides the freshly-made `this`, so
     the engine ends up holding the offline context. */
  window.AudioContext = function () { return oac; };
  window.webkitAudioContext = window.AudioContext;

  const engine = new AudioEngine();
  engine.init();
  /* The music fader defaults to 0.65 and the master to 0.9, which is what a
     player hears. Left alone the render is 5dB quieter than the file anyone
     would compare it against, so leave them exactly as shipped and let the
     peak/RMS report below say what came out. */

  /* Count what was asked for, independently of what came out. A render that is
     silent because nothing was scheduled and one that is silent because the
     graph is broken need different fixes, and only this tells them apart. */
  const counts = {};
  for (const v of ['kick', 'rim', 'snare', 'shaker', 'hat', 'tom', 'bass', 'pluck', 'vibe', 'scat', 'brass']) {
    const orig = engine[v].bind(engine);
    engine[v] = (...args) => { counts[v] = (counts[v] || 0) + 1; return orig(...args); };
  }

  const music = new Music(engine);
  const song = SONGS[o.songId];
  music.song = song;
  music.playing = true;
  music.step = 0;
  music.bar = 0;
  music.hurrying = o.hurry === 'on';
  music.intensity = o.ramp ? 0.2 : o.intensity;

  /* Music._tick's loop body, with the audio clock and the setInterval taken
     out. The step advance and the wrap must stay identical to _tick's or this
     is rendering a song nobody plays. */
  const loopSteps = song.bars * 16;
  const end = o.start + o.seconds;
  let t = o.start;
  let steps = 0;
  const scheduleUpTo = (limit) => {
    while (t < limit && t < end) {
      const played = t - o.start;
      /* Game.js drives this from progress toward the goal as 0.32 + prog*0.72,
         exponentially smoothed. 0.2 -> 1.0 linear is the same sweep with the
         ends squared off, and it crosses every layer threshold on the way. */
      if (o.ramp) music.intensity = 0.2 + 0.8 * (played / o.seconds);
      /* The real game flips this at 30s remaining. Rendering it lets you hear
         the transition rather than trusting that it is not jarring. */
      if (o.hurry === 'last') music.hurrying = played > o.seconds - 30;
      music._scheduleStep(music.step, t);
      t += music.stepDuration;
      music.step = (music.step + 1) % loopSteps;
      steps++;
    }
  };

  const suspendErrors = [];
  let buf;
  if (o.upfront) {
    scheduleUpTo(Infinity);
    buf = await oac.startRendering();
  } else {
    /* 1.0s stops with 2.0s of music scheduled ahead of the clock. Measured at
       60s: 0.5s->21.6s, 1s->15.7s, 2s->25.1s, 4s->27.0s. Too small and the
       suspend/resume round trips dominate; too large and the live node count
       climbs back toward the quadratic case. The 2x look-ahead matters
       independently -- a note must exist before the render reaches its start
       time, and the longest note here is a few seconds. */
    const W = 1.0;
    scheduleUpTo(o.start + 2 * W);
    /* Integer-indexed so a thousand `+= W` additions cannot drift onto a
       duplicate quantum boundary, which suspend() rejects. */
    for (let k = 1; k * W < total - 0.1; k++) {
      const at = k * W;
      oac.suspend(at).then(() => {
        /* If scheduling throws, resume anyway: a suspended OfflineAudioContext
           that is never resumed never resolves startRendering(), and the whole
           tool would sit there until the download timeout with no explanation. */
        try { scheduleUpTo(at + 2 * W); } finally { oac.resume(); }
      }).catch((err) => suspendErrors.push(`${at}s: ${err.message}`));
    }
    buf = await oac.startRendering();
  }
  if (suspendErrors.length) throw new Error(`suspend points failed: ${suspendErrors.join('; ')}`);

  /* ---- 16-bit PCM WAV, canonical 44-byte header ---- */
  const chans = [];
  for (let c = 0; c < buf.numberOfChannels; c++) chans.push(buf.getChannelData(c));
  const n = buf.length;
  const ch = chans.length;
  const blockAlign = ch * 2;
  const dataBytes = n * blockAlign;
  const bytes = new ArrayBuffer(44 + dataBytes);
  const dv = new DataView(bytes);
  const ascii = (off, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(off + i, s.charCodeAt(i)); };
  ascii(0, 'RIFF');
  dv.setUint32(4, 36 + dataBytes, true);      // everything after this field
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  dv.setUint32(16, 16, true);                 // fmt chunk length for plain PCM
  dv.setUint16(20, 1, true);                  // 1 = uncompressed PCM
  dv.setUint16(22, ch, true);
  dv.setUint32(24, buf.sampleRate, true);
  dv.setUint32(28, buf.sampleRate * blockAlign, true);
  dv.setUint16(32, blockAlign, true);
  dv.setUint16(34, 16, true);
  ascii(36, 'data');
  dv.setUint32(40, dataBytes, true);

  let off = 44;
  let peak = 0;
  let sumSq = 0;
  let clipped = 0;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < ch; c++) {
      let s = chans[c][i];
      const m = s < 0 ? -s : s;
      if (m > peak) peak = m;
      if (m >= 1) clipped++;
      sumSq += s * s;
      if (s > 1) s = 1; else if (s < -1) s = -1;
      /* int16 is asymmetric: -32768..32767. Scaling negatives by 32768 and
         positives by 32767 makes both rails exactly full scale without the
         +1.0 sample wrapping round to -32768. */
      dv.setInt16(off, Math.round(s < 0 ? s * 0x8000 : s * 0x7FFF), true);
      off += 2;
    }
  }

  /* Blob + anchor click rather than returning the bytes: Playwright serialises
     an evaluate() result through JSON, which turns a 30MB Uint8Array into a
     multi-hundred-MB object literal. The download path streams it. */
  const blob = new Blob([bytes], { type: 'audio/wav' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = o.filename;
  document.body.appendChild(link);
  link.click();

  return {
    steps,
    counts,
    frames: n,
    channels: ch,
    sampleRate: buf.sampleRate,
    duration: n / buf.sampleRate,
    bytes: 44 + dataBytes,
    peak,
    rms: Math.sqrt(sumSq / (n * ch)),
    clipped,
    songName: song.name,
    bpm: song.bpm,
    bars: song.bars,
  };
}

/* ------------------------------------------------------------
   Node-side verification.

   Deliberately an INDEPENDENT decode of the file that was
   actually written, not a re-report of the numbers the page
   returned. A bug in the header, the interleave or the download
   would leave the page's peak/RMS looking perfect while the file
   on disk was garbage.
   ------------------------------------------------------------ */
function decodeWav(buf) {
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('not a RIFF/WAVE file');
  }
  let pos = 12;
  let fmt = null;
  let data = null;
  while (pos + 8 <= buf.length) {
    const id = buf.toString('ascii', pos, pos + 4);
    const size = buf.readUInt32LE(pos + 4);
    const body = pos + 8;
    if (id === 'fmt ') {
      fmt = {
        format: buf.readUInt16LE(body),
        channels: buf.readUInt16LE(body + 2),
        sampleRate: buf.readUInt32LE(body + 4),
        bits: buf.readUInt16LE(body + 14),
      };
    } else if (id === 'data') {
      data = buf.subarray(body, body + size);
    }
    pos = body + size + (size % 2);   // chunks are word-aligned
  }
  if (!fmt || !data) throw new Error('missing fmt or data chunk');
  if (fmt.format !== 1 || fmt.bits !== 16) throw new Error(`expected 16-bit PCM, got format ${fmt.format} / ${fmt.bits} bits`);

  const samples = data.length / 2;
  let peak = 0;
  let sumSq = 0;
  let dc = 0;
  let nonZero = 0;
  for (let i = 0; i < samples; i++) {
    const v = data.readInt16LE(i * 2) / 32768;
    const m = v < 0 ? -v : v;
    if (m > peak) peak = m;
    if (m > 0) nonZero++;
    sumSq += v * v;
    dc += v;
  }
  return {
    ...fmt,
    frames: samples / fmt.channels,
    duration: samples / fmt.channels / fmt.sampleRate,
    peak,
    rms: Math.sqrt(sumSq / samples),
    dc: dc / samples,
    nonZeroPct: (100 * nonZero) / samples,
  };
}

const db = (v) => (v <= 0 ? '-inf' : (20 * Math.log10(v)).toFixed(1)) + ' dBFS';

/* ------------------------------------------------------------
   Run
   ------------------------------------------------------------ */

fs.mkdirSync(OUT_DIR, { recursive: true });

const server = await createServer({ root: ROOT, server: { port: PORT }, logLevel: 'error' });
await server.listen();

const exe = findChromium();
const browser = await chromium.launch({
  ...(exe ? { executablePath: exe } : {}),
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'],
});
/**
 * A blank page on the dev server's origin, so that `import('/src/audio/...')`
 * is served and transformed by Vite exactly as it is for the game -- without
 * booting the game, its WebGL renderer or its own AudioContext. Only this one
 * URL is intercepted; the module requests underneath it go to Vite.
 *
 * One page PER SONG. A finished render leaves behind an OfflineAudioContext,
 * its rendered buffer and a ~30MB Blob whose object URL the download still
 * holds; twelve of those in one page is most of a gigabyte for no reason.
 */
async function newRenderPage() {
  const p = await browser.newPage();
  p.on('pageerror', (e) => console.error('  page error:', e.message));
  await p.route('**/__render.html', (route) => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: '<!doctype html><meta charset="utf-8"><title>render</title><body></body>',
  }));
  await p.goto(`http://localhost:${PORT}/__render.html`, { waitUntil: 'load' });
  return p;
}

const { SONGS } = await import('../src/audio/songs.js');
const songIds = SONG_ARG === 'all' ? Object.keys(SONGS) : [SONG_ARG];
for (const id of songIds) {
  if (!SONGS[id]) {
    console.error(`unknown song "${id}". known: ${Object.keys(SONGS).join(', ')}, or "all"`);
    await browser.close(); await server.close();
    process.exit(2);
  }
}

let failures = 0;
for (const songId of songIds) {
  const filename = `${songId}-${LABEL}.wav`;
  const outPath = path.join(OUT_DIR, filename);
  const t0 = Date.now();

  /* Offline does not mean instant: this is CPU-bound and on two cores a chunked
     60s render took 15.7s, roughly 0.3x real time and creeping upward with
     length. 4x real time plus a minute of slack leaves room for the busiest
     song on a slower box without letting a genuine hang sit forever. --upfront
     is quadratic, so it gets ten times the rope. */
  const budgetMs = Math.round(SECONDS * (UPFRONT ? 40000 : 4000) + 60000);
  console.log(`rendering ${songId} ${SECONDS}s at ${SAMPLE_RATE}Hz`
    + ` (${UPFRONT ? 'upfront' : 'chunked'}; budget ${(budgetMs / 60000).toFixed(1)} min)...`);

  const page = await newRenderPage();
  const [download, info] = await Promise.all([
    page.waitForEvent('download', { timeout: budgetMs }),
    page.evaluate(renderInPage, {
      songId, filename,
      seconds: SECONDS, tail: TAIL, start: START,
      intensity: INTENSITY, ramp: RAMP,
      hurry: HURRY, seed: SEED, sampleRate: SAMPLE_RATE, upfront: UPFRONT,
    }),
  ]);
  await download.saveAs(outPath);
  await page.close();

  const stat = fs.statSync(outPath);
  const dec = decodeWav(fs.readFileSync(outPath));
  const notes = Object.values(info.counts).reduce((a, b) => a + b, 0);

  console.log('');
  console.log(`${songId}  "${info.songName}"  ${info.bpm}bpm  ${info.bars} bars`
    + `   intensity ${RAMP ? '0.2->1.0' : INTENSITY}${HURRY !== 'off' ? `  hurry=${HURRY}` : ''}  seed ${SEED}`);
  console.log(`  ${outPath}`);
  console.log(`  ${(stat.size / 1048576).toFixed(2)} MB   ${dec.duration.toFixed(2)}s`
    + `   ${dec.sampleRate}Hz  ${dec.channels}ch  ${dec.bits}-bit PCM`
    + `   rendered in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log(`  ${info.steps} sixteenths scheduled, ${notes} note events`
    + `   [${Object.entries(info.counts).map(([k, v]) => `${k} ${v}`).join(', ')}]`);
  console.log(`  peak ${dec.peak.toFixed(4)} (${db(dec.peak)})   rms ${dec.rms.toFixed(4)} (${db(dec.rms)})`
    + `   dc ${dec.dc.toFixed(5)}   non-silent samples ${dec.nonZeroPct.toFixed(1)}%`);
  if (info.clipped) console.log(`  WARNING: ${info.clipped} samples hit or passed full scale before quantisation`);

  /* The point of these three: a WAV of the right size full of zeroes looks
     like a success to every check that stops at `fs.statSync`. */
  const checks = [
    ['non-trivial size', stat.size > 100000, `${stat.size} bytes`],
    ['not silent (peak)', dec.peak > 0.01, `peak ${dec.peak.toFixed(4)}`],
    ['not silent (rms)', dec.rms > 0.001, `rms ${dec.rms.toFixed(4)}`],
    ['notes were scheduled', notes > 0, `${notes} events`],
    ['duration as asked', Math.abs(dec.duration - (START + SECONDS + TAIL)) < 0.05,
      `${dec.duration.toFixed(2)}s = ${START}s lead-in + ${SECONDS}s + ${TAIL}s tail`],
  ];
  for (const [name, ok, extra] of checks) {
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}   ${extra}`);
    if (!ok) failures++;
  }
}

await browser.close();
await server.close();
console.log('');
console.log(failures ? `${failures} check(s) FAILED` : 'all checks passed');
process.exit(failures ? 1 : 0);
