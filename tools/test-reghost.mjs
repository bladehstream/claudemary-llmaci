/* ============================================================
   Calibrate the instrument that guards `pickup` and `volume`.

   `reghost.mjs` exists to answer one question — "did the art
   change move any number the game plays on?" — and for a while it
   answered it wrongly. Fed a baseline and compared against the
   *unchanged* catalogue, which must by definition report nothing,
   it reported 131 of 429 archetypes moved. The cause was in
   `catalogue-digest.mjs`: volume printed at four decimal places,
   which is ten significant figures for a supercluster and none at
   all for a virus. Every comparison against a `0.0000` volume
   divided by zero.

   Nobody noticed for the length of a stage rebuild, because the
   props being worked on were large enough for four decimals to be
   plenty. The tool was right where it was being looked at and
   wrong everywhere else.

   So this harness asserts the round trip in BOTH directions:

     1. an unchanged catalogue must report zero moves, at every
        scale in the ladder, virus to supercluster;
     2. a known injected move must be caught, and must set a
        non-zero exit code;
     3. a pre-v2 baseline must be refused rather than misread.

   (1) alone is not a test. A tool that always prints "0 moved"
   passes it. (2) is what makes (1) mean something.

     node tools/test-reghost.mjs
   ============================================================ */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIGEST = path.join(HERE, 'catalogue-digest.mjs');
const REGHOST = path.join(HERE, 'reghost.mjs');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'reghost-'));

let failed = 0;
const check = (name, ok, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `   ${detail}` : ''}`);
  if (!ok) failed++;
};

const run = (file, args) => spawnSync('node', [file, ...args], { encoding: 'utf8', maxBuffer: 64 << 20 });

/* ---------- produce a baseline ---------- */
const digest = run(DIGEST, []);
if (digest.status !== 0) {
  console.error('catalogue-digest.mjs failed to run:\n' + (digest.stderr || '').slice(0, 2000));
  process.exit(1);
}
const basePath = path.join(TMP, 'base.txt');
fs.writeFileSync(basePath, digest.stdout);

const NUM = String.raw`(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?`;
const ROW = new RegExp(`^(\\S+)\\s+pickup\\s+(${NUM})\\s+vol\\s+(${NUM})\\s+rad\\s+(${NUM})`);
const parsed = [];
for (const line of digest.stdout.split('\n')) {
  const m = line.match(ROW);
  if (m) parsed.push({ id: m[1], pickup: +m[2], volume: +m[3] });
}

console.log(`\nbaseline: ${parsed.length} archetypes\n`);
check('the digest is stamped v2', digest.stdout.startsWith('# catalogue-digest v2'));
check('every archetype parses back out', parsed.length > 400, `${parsed.length} rows`);

/* ---------- 1. the identity: nothing changed, so nothing moved ---------- */
const same = run(REGHOST, [basePath]);
check('unchanged catalogue reports zero moves',
  /\n0 archetype\(s\) moved/.test(same.stdout),
  (same.stdout.match(/\n(\d+) archetype\(s\) moved/) || [, '?'])[1] + ' reported');
check('unchanged catalogue exits 0', same.status === 0, `exit ${same.status}`);

/* ---------- 1b. and at BOTH ends of the ladder, not just the big props ---------- */
/* This is the assertion the old format failed. The smallest volumes in the
   catalogue are ~1e-7; four decimal places rounded them to zero. */
const bySize = [...parsed].sort((a, b) => a.volume - b.volume);
const tiny = bySize.slice(0, 12);
const huge = bySize.slice(-12);
check('the smallest props survive the round trip with real precision',
  tiny.every((p) => p.volume > 0),
  `min volume ${bySize[0].volume.toExponential(3)} (${bySize[0].id})`);
check('the format spans the whole ladder',
  huge[huge.length - 1].volume / bySize[0].volume > 1e12,
  `${bySize[0].volume.toExponential(1)} … ${huge[huge.length - 1].volume.toExponential(1)}`);
for (const scope of ['atom', 'microbe', 'house', 'solar', 'galaxy', 'universe']) {
  const r = run(REGHOST, [basePath, `--only=${scope}`]);
  check(`--only=${scope} reports zero moves`,
    /\n0 archetype\(s\) moved/.test(r.stdout) && r.status === 0,
    (r.stdout.match(/\n(\d+) archetype\(s\) moved/) || [, '?'])[1] + ' reported');
}

/* ---------- 2. a known move must be caught, at every scale ---------- */
/* Perturb one prop's pickup by 5% in the baseline and confirm reghost names
   exactly that prop. Done for a tiny prop and a huge one: a tolerance that
   is absolute rather than relative would pass one and fail the other. */
const injectTargets = [bySize[0], bySize[Math.floor(bySize.length / 2)], bySize[bySize.length - 1]];
for (const target of injectTargets) {
  const doctored = digest.stdout.split('\n').map((line) => {
    const m = line.match(ROW);
    if (!m || m[1] !== target.id) return line;
    return line.replace(/pickup\s+\S+/, `pickup ${(target.pickup * 1.05).toPrecision(10)}`);
  }).join('\n');
  const p = path.join(TMP, `inject-${target.id}.txt`);
  fs.writeFileSync(p, doctored);
  const r = run(REGHOST, [p]);
  const named = new RegExp(`\\n\\s+${target.id}\\s`).test(r.stdout);
  const count = +((r.stdout.match(/\n(\d+) archetype\(s\) moved/) || [, '0'])[1]);
  check(`a 5% move on ${target.id} is caught`, named && count === 1,
    `${count} reported, named=${named}`);
  check(`a caught move exits non-zero (${target.id})`, r.status === 1, `exit ${r.status}`);
}

/* ---------- 3. a stale baseline must be refused, not misread ---------- */
const legacy = ['wristwatch          pickup      0.0421 vol        0.0000 rad     0.0620',
  'g_star              pickup     41.5770 vol    39528.0415 rad    21.0190'].join('\n');
const legacyPath = path.join(TMP, 'legacy.txt');
fs.writeFileSync(legacyPath, legacy);
const stale = run(REGHOST, [legacyPath]);
check('a pre-v2 baseline is refused', stale.status === 1 && /not a v2 digest/.test(stale.stderr || ''),
  `exit ${stale.status}`);

/* ---------- report ---------- */
fs.rmSync(TMP, { recursive: true, force: true });
console.log(failed
  ? `\n${failed} check(s) FAILED — reghost cannot be trusted to guard the catalogue\n`
  : '\nreghost detects the moves it should and none of the ones it should not\n');
process.exit(failed ? 1 : 0);
