/* ============================================================
   The three things a player can reach that no other harness sees.

   `test-controls` drives movement. `test-stages` drives loading.
   Neither touches the menu-level machinery, and all three of the
   features under test here are exactly the kind that break
   silently and stay broken:

     1. HOLD ENTER TO QUIT. Enter now carries two meanings — tap to
        finish early, hold to abandon the round — which means the
        tap path can be broken by the hold path and vice versa, and
        the failure mode of a broken tap is "the finish key stopped
        working", reported weeks later. Four cases: hold quits, a
        tap before the goal does nothing, a tap after the goal
        finishes, and a press carried over from the intro screen
        does NOT quit (the latch).

     2. RESET PROGRESS. Destructive, two-click, and has to clear
        the ladder and the collection while KEEPING settings. A
        version that also wiped the volume would look fine in
        review and be infuriating exactly once.

     3. THE ENDING. Reachable from two places, and its whole
        premise is that the world is still loaded behind it — so
        this asserts the beat count advances, that the world
        survives, and that it lands back on the title.

        ⚠ AND THERE ARE TWO OF THEM NOW. The swept version opens
        on "Nothing is left", which is a claim about the player's
        save, so the thing worth asserting is not that an ending
        plays — it is that the RIGHT one plays. Both directions
        are checked: clearing the universe at 1.1x the goal must
        NOT earn it, and emptying the stage must.
   ============================================================ */

import { createServer } from 'vite';
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SWEPT_BEATS, MAKING_BEATS, VARIANTS } from '../src/ui/Ending.js';

const ROOT = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const server = await createServer({ root: ROOT, server: { port: 5213 }, logLevel: 'error' });
await server.listen();

const browser = await chromium.launch({
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 900, height: 620 } });

const errors = [];
page.on('pageerror', (e) => errors.push(String(e.message)));
page.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|ERR_INTERNET/.test(m.text())) errors.push(m.text()); });

await page.goto('http://localhost:5213/', { waitUntil: 'load' });
await page.waitForFunction(() => window.__llmaci?.state === 'title', null, { timeout: 120000 });

let fail = 0;
const check = (name, ok, extra = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '   ' + extra : ''}`);
  if (!ok) fail++;
};

/** Load the smallest stage and start rolling. It builds fastest. */
async function startRound(stageId = 'quantum') {
  await page.evaluate((s) => {
    const g = window.__llmaci;
    if (g.state !== 'title') g.toTitle();
    g.onAction('pick-stage', { dataset: { stage: s } });
  }, stageId);
  await page.waitForFunction(() => window.__llmaci.state === 'intro', null, { timeout: 180000 });
  await page.evaluate(() => window.__llmaci.begin());
  await page.waitForFunction(() => window.__llmaci.state === 'playing', null, { timeout: 10000 });
}

/* THE HOLD IS MEASURED IN GAME TIME, NOT WALL TIME, and this harness learned
   that the hard way — the first version waited 1250ms of wall clock for a 0.85s
   hold and found only 0.10s had accumulated.
   `Game._loop` clamps each frame's delta to 0.1s so a stall cannot teleport the
   physics, which means on a machine rendering at 3fps under swiftshader the
   game's clock runs at a fraction of real time. That is correct behaviour and it
   makes any wall-clock assertion about a hold flaky by construction. So: hold the
   key and wait for the STATE to change, with a budget generous enough for a slow
   renderer. `waitForHold` is the only place that budget lives. */
const SLOW = 30000;
const waitForHold = (fn) => page.waitForFunction(fn, { timeout: SLOW });
/** Let the game's own clock advance by this many seconds, however long that takes. */
const gameSeconds = (s) => page.evaluate((secs) => new Promise((res) => {
  const g = window.__llmaci;
  const t0 = g.quitHold;
  const tick = () => (g.quitHold - t0 >= secs || g.state !== 'playing' ? res(null) : requestAnimationFrame(tick));
  requestAnimationFrame(tick);
}), s);

console.log('\n=== hold Enter to quit ===');

await startRound();
await page.keyboard.down('Enter');
await gameSeconds(0.1);
const midHold = await page.evaluate(() => ({
  state: window.__llmaci.state,
  frac: window.__llmaci.quitHold,
  arming: document.getElementById('quit-prompt').classList.contains('arming'),
  fill: document.getElementById('quit-fill').style.transform,
}));
check('the chip fills while Enter is held', midHold.arming && /scaleX\(0\.[0-9]*[1-9]/.test(midHold.fill),
  `${midHold.fill || '(none)'} arming=${midHold.arming}`);
check('still playing part way through the hold', midHold.state === 'playing',
  `state ${midHold.state}, held ${midHold.frac.toFixed(2)}s`);

await waitForHold(() => window.__llmaci.state === 'title');
await page.keyboard.up('Enter');
check('a completed hold quits to the title', true);
check('the fill is cleared on the way out',
  await page.evaluate(() => window.__llmaci.quitHold === 0));

/* Releasing early must abandon the gesture completely, not bank progress toward
   the next press. Held to just under half the threshold, twice. */
await startRound();
await page.keyboard.down('Enter');
await gameSeconds(0.4);
await page.keyboard.up('Enter');
await page.waitForTimeout(150);
const tapEarly = await page.evaluate(() => ({ state: window.__llmaci.state, held: window.__llmaci.quitHold }));
check('a short press before the goal does nothing at all',
  tapEarly.state === 'playing' && tapEarly.held === 0, `state ${tapEarly.state}`);

await page.keyboard.down('Enter'); await gameSeconds(0.4); await page.keyboard.up('Enter');
await page.waitForTimeout(120);
await page.keyboard.down('Enter'); await gameSeconds(0.4); await page.keyboard.up('Enter');
await page.waitForTimeout(150);
check('two short presses do not accumulate into a quit',
  await page.evaluate(() => window.__llmaci.state === 'playing'));

/* The tap path, with the goal met. Forced rather than played: growing to the
   goal legitimately would take minutes. */
await page.evaluate(() => { window.__llmaci.goalMet = true; });
await page.keyboard.down('Enter');
await page.waitForTimeout(200);
await page.keyboard.up('Enter');
await page.waitForTimeout(200);
check('a tap after the goal finishes the round',
  await page.evaluate(() => window.__llmaci.state === 'results'),
  `state ${await page.evaluate(() => window.__llmaci.state)}`);

/* THE LATCH. Enter is how you dismiss the intro screen, so the press that starts
   a round is very often already down when the round begins. Without the latch
   that same uninterrupted press ticks straight through to a quit. */
await page.evaluate(() => {
  const g = window.__llmaci;
  g.toTitle();
  g.onAction('pick-stage', { dataset: { stage: 'quantum' } });
});
await page.waitForFunction(() => window.__llmaci.state === 'intro', null, { timeout: 180000 });
await page.keyboard.down('Enter');                  // dismisses the intro
await page.waitForFunction(() => window.__llmaci.state === 'playing', null, { timeout: 10000 });
/* ...and keeps being held. `gameSeconds` cannot be used here: it measures off
   `quitHold`, which is exactly the thing that must stay pinned at zero. Twenty
   frames is plenty — the threshold is 0.85s and a single clamped frame is 0.1s. */
await page.evaluate(() => new Promise((res) => {
  let n = 0;
  const tick = () => (++n >= 20 ? res(null) : requestAnimationFrame(tick));
  requestAnimationFrame(tick);
}));
const latched = await page.evaluate(() => ({ state: window.__llmaci.state, held: window.__llmaci.quitHold }));
await page.keyboard.up('Enter');
check('the press that started the round cannot quit it',
  latched.state === 'playing' && latched.held === 0, `state ${latched.state}, held ${latched.held.toFixed(2)}s`);

// And a FRESH press after that one is released still works normally.
await page.waitForTimeout(120);
await page.keyboard.down('Enter');
await waitForHold(() => window.__llmaci.state === 'title');
await page.keyboard.up('Enter');
check('a fresh press afterwards does quit', true);

console.log('\n=== reset progress ===');

await page.evaluate(() => {
  const g = window.__llmaci;
  g.save.cleared = ['quantum', 'atom'];
  g.save.best = { quantum: 1.6 };
  g.save.found = ['q_gluon'];
  g.setOption('music', 0.31);
  g.onAction('options');
});
const armed = await page.evaluate(() => {
  window.__llmaci.onAction('reset-progress');
  const b = document.getElementById('btn-reset-progress');
  return { cleared: window.__llmaci.save.cleared.length, danger: b.classList.contains('danger'), label: b.textContent };
});
check('one click only arms it', armed.cleared === 2 && armed.danger,
  `${armed.cleared} still cleared, label "${armed.label}"`);

const done = await page.evaluate(() => {
  window.__llmaci.onAction('reset-progress');
  const g = window.__llmaci;
  return {
    cleared: g.save.cleared.length, best: Object.keys(g.save.best).length,
    found: g.save.found.length, music: g.options.music,
    danger: document.getElementById('btn-reset-progress').classList.contains('danger'),
    stored: JSON.parse(localStorage.getItem('claudemary-llmaci-save-v1') || '{}'),
  };
});
check('the second click clears the ladder', done.cleared === 0, `${done.cleared} cleared`);
check('it clears best sizes and the collection', done.best === 0 && done.found === 0,
  `${done.best} bests, ${done.found} found`);
check('it KEEPS settings', Math.abs(done.music - 0.31) < 1e-6, `music ${done.music}`);
check('it disarms itself again', !done.danger);
check('and it is written through to storage',
  (done.stored.cleared || []).length === 0 && Math.abs((done.stored.options || {}).music - 0.31) < 1e-6,
  JSON.stringify(done.stored.cleared || []));

const locked = await page.evaluate(() => {
  window.__llmaci.onAction('back-title');
  window.__llmaci.onAction('play');
  return [...document.querySelectorAll('#stage-cards .stage-card')].map((c) => c.classList.contains('locked'));
});
check('the stage cards relock', locked[0] === false && locked.slice(1).every(Boolean),
  `${locked.filter(Boolean).length} of ${locked.length} locked`);
check('the title stops offering the ending',
  await page.evaluate(() => {
    window.__llmaci.onAction('back-title');
    return document.getElementById('btn-ending').classList.contains('hidden');
  }));

console.log('\n=== the ending ===');

/* The beat lists are plain data and `Ending.js` touches the DOM only inside the
   class constructor, so these need no browser. Assert them on both lists — the
   monotonic-veil rule was written down once and then a second list appeared. */
for (const [name, beats] of Object.entries(VARIANTS)) {
  check(`${name}: the backdrop darkens monotonically end to end`,
    beats.every((b, i) => i === 0 || b.veil >= beats[i - 1].veil),
    beats.map((b) => b.veil).join(' -> '));
  check(`${name}: it is fully black by the last beat`, beats[beats.length - 1].veil === 1);
  check(`${name}: the last beat holds, and only the last`,
    beats[beats.length - 1].hold === true && beats.slice(0, -1).every((b) => !b.hold));
  check(`${name}: every beat has text`, beats.every((b) => (b.text || '').trim().length > 3));
  check(`${name}: the music goes out and stays out`,
    beats.filter((b) => b.music === 'out').length === 1
    && beats.findIndex((b) => b.music === 'in') < beats.findIndex((b) => b.music === 'out'));
}
check('the two endings are actually different', SWEPT_BEATS[0].text !== MAKING_BEATS[0].text);
/* The whole point of the making version's last card is that it tells you the
   other one exists. Lose that line and the swept ending becomes unfindable. */
check('the making version points at the swept one',
  /universe/i.test(MAKING_BEATS[MAKING_BEATS.length - 1].foot || ''));

/* Reached the way a player reaches it: the last stage, cleared. Rather than
   actually rolling the universe up, put the katamari past the goal and finish. */
await page.evaluate(async () => {
  const g = window.__llmaci;
  g.toTitle();
  g.save.cleared = g.stageIds().slice(0, -1);
  g.onAction('pick-stage', { dataset: { stage: 'universe' } });
});
await page.waitForFunction(() => window.__llmaci.state === 'intro', null, { timeout: 180000 });
await page.evaluate(() => {
  const g = window.__llmaci;
  g.begin();
  /* `diameter` is a GETTER over `radius` — assigning it is silently a no-op, and
     doing so made this harness report the ending as never offered while the game
     was fine. Set the radius. */
  g.kat.radius = (g.stage.goal * 1.1) / 2;
  g.finish('early');
});
await page.waitForTimeout(150);
const results = await page.evaluate(() => ({
  state: window.__llmaci.state,
  offered: window.__llmaci._endingOffered,
  endBtn: !document.getElementById('btn-ending-results').classList.contains('hidden'),
  retryBig: document.getElementById('btn-retry').classList.contains('btn-big'),
  next: !document.getElementById('btn-next').classList.contains('hidden'),
  swept: window.__llmaci.save.swept.slice(),
  variant: window.__llmaci.endingVariant(),
  live: window.__llmaci.world.field.liveCount,
}));
check('clearing the last stage offers the ending', results.offered && results.endBtn);
check('"Roll Again" is demoted', !results.retryBig);
check('there is no "Next Stage" to offer', !results.next);
/* THE POINT OF THE WHOLE SPLIT. This run met the goal with the stage barely
   touched, so it must not have earned an ending that says nothing is left. */
check('a goal-met run with props still standing is NOT a sweep',
  results.swept.length === 0 && results.live > 0, `${results.live} left, swept ${results.swept.length}`);
check('so the making version is what it earned', results.variant === 'making', results.variant);

const opened = await page.evaluate(() => {
  window.__llmaci.onAction('ending');
  const g = window.__llmaci;
  return {
    state: g.state, idx: g.ending.idx, active: g.ending.active,
    world: !!g.world, kat: g.kat.group.visible,
    visible: !document.getElementById('ending-screen').classList.contains('hidden'),
    text: (document.querySelector('#ending-body .end-text')?.textContent || '').slice(0, 40),
    hudHidden: document.getElementById('hud').classList.contains('hidden'),
    variant: g.ending.variant,
    onScreen: document.querySelector('#ending-body .end-text')?.textContent || '',
  };
});
check('and the making version is the one that plays',
  opened.variant === 'making' && opened.onScreen === MAKING_BEATS[0].text,
  `${opened.variant}: "${opened.text}…"`);
check('it opens on the first beat', opened.active && opened.idx === 0 && opened.visible, `idx ${opened.idx}`);
check('the state is its own', opened.state === 'ending', `state ${opened.state}`);
check('the world is still loaded behind it', opened.world && opened.kat,
  `world=${opened.world} katamari=${opened.kat}`);
check('the HUD is out of the way', opened.hudHidden);
check('the first beat has text', opened.text.length > 3, `"${opened.text}…"`);

// Space advances. The veil has to be monotonic or the fade to black flickers.
const veils = await page.evaluate(async () => {
  const g = window.__llmaci;
  const el = document.getElementById('ending-screen');
  const out = [];
  for (let i = 0; i < 4; i++) {
    out.push(+el.style.getPropertyValue('--veil'));
    g.ending.next();
  }
  return { out, idx: g.ending.idx };
});
check('each beat advances', veils.idx === 4, `idx ${veils.idx}`);
check('the backdrop darkens monotonically',
  veils.out.every((v, i) => i === 0 || v >= veils.out[i - 1]), veils.out.join(' -> '));

// Clicking through the last card lands on the title, with the world torn down.
const finished = await page.evaluate(async () => {
  const g = window.__llmaci;
  let guard = 0;
  while (g.ending.active && guard++ < 200) g.ending.next();
  return {
    state: g.state, active: g.ending.active, guard,
    hidden: document.getElementById('ending-screen').classList.contains('hidden'),
    titleShown: !document.getElementById('title-screen').classList.contains('hidden'),
    world: !!g.world,
  };
});
check('the sequence terminates', !finished.active && finished.guard < 200, `${finished.guard} advances`);
check('it hides itself and returns to the title',
  finished.hidden && finished.titleShown && finished.state === 'title', `state ${finished.state}`);
check('and the world is torn down on the way out', !finished.world);

const replay = await page.evaluate(() => {
  const g = window.__llmaci;
  g.save.cleared = g.stageIds();
  g.toTitle();
  return !document.getElementById('btn-ending').classList.contains('hidden');
});
check('the title offers it again once the universe is cleared', replay);

const rewatch = await page.evaluate(() => {
  window.__llmaci.onAction('ending');
  const g = window.__llmaci;
  const ok = g.ending.active && g.state === 'ending';
  const variant = g.ending.variant;
  while (g.ending.active) g.ending.next();
  return { ok, variant };
});
check('and it replays from the title with no world loaded', rewatch.ok);
check('the title replay also gives what was earned', rewatch.variant === 'making', rewatch.variant);

/* The other direction, played rather than asserted into the save: roll the
   universe until nothing is standing. `field.remove` is how `shot-ui` empties a
   stage; `collectedFraction` reads `liveCount`, so this exercises the real path
   from an empty field to the swept ending rather than writing `save.swept`. */
await page.evaluate(() => {
  const g = window.__llmaci;
  g.onAction('pick-stage', { dataset: { stage: 'universe' } });
});
await page.waitForFunction(() => window.__llmaci.state === 'intro', null, { timeout: 180000 });
const swept = await page.evaluate(() => {
  const g = window.__llmaci;
  g.begin();
  g.kat.radius = (g.stage.goal * 1.1) / 2;
  const f = g.world.field;
  for (let i = 0; i < f.n; i++) if (f.alive[i]) f.remove(i);
  g.finish('cleared');
  return {
    live: f.liveCount,
    frac: g.world.collectedFraction(),
    swept: g.save.swept.slice(),
    variant: g.endingVariant(),
    stored: JSON.parse(localStorage.getItem('claudemary-llmaci-save-v1') || '{}').swept || [],
  };
});
check('emptying the stage counts as a sweep',
  swept.live === 0 && swept.frac >= 1 && swept.swept.includes('universe'),
  `live ${swept.live}, frac ${swept.frac}, swept ${JSON.stringify(swept.swept)}`);
check('and the sweep survives a save', swept.stored.includes('universe'), JSON.stringify(swept.stored));
check('now the swept version is what it earned', swept.variant === 'swept', swept.variant);

const sweptPlay = await page.evaluate(() => {
  const g = window.__llmaci;
  g.onAction('ending');
  const out = {
    variant: g.ending.variant,
    onScreen: document.querySelector('#ending-body .end-text')?.textContent || '',
  };
  let guard = 0;
  while (g.ending.active && guard++ < 200) g.ending.next();
  out.terminated = !g.ending.active;
  return out;
});
check('and it is the one that plays',
  sweptPlay.variant === 'swept' && sweptPlay.onScreen === SWEPT_BEATS[0].text,
  `${sweptPlay.variant}: "${sweptPlay.onScreen.slice(0, 40)}…"`);
check('the swept sequence terminates too', sweptPlay.terminated);

check('no page errors anywhere', errors.length === 0, errors.slice(0, 3).join(' | ').slice(0, 200));

await browser.close();
await server.close();
console.log(fail ? `\n${fail} FAILED` : '\nquit, reset and the ending all behave');
process.exit(fail ? 1 : 0);
