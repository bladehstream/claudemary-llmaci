/* Photograph the menu-level UI that `smoke` never opens: the hold-to-quit chip
   mid-gesture, the armed Reset Progress button, the results panel with the
   ending offered, and three beats of the ending itself.

   Assertions live in test-ui.mjs. This exists because "does it look right" is
   not a thing a boolean can answer, and three of the four bug reports on this
   project so far have been about how something looked. */
import { createServer } from 'vite';
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'tools', 'shots'); fs.mkdirSync(OUT, { recursive: true });
const server = await createServer({ root: ROOT, server: { port: 5217 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 1100, height: 660 } });
await page.goto('http://localhost:5217/', { waitUntil: 'load' });
await page.waitForFunction(() => window.__llmaci?.state === 'title', null, { timeout: 120000 });

const shot = async (name) => {
  await page.screenshot({ path: path.join(OUT, `ui-${name}.png`) });
  console.log(`  ${name}`);
};

/* ---- the quit chip, at rest and mid-hold, with the finish chip above it ---- */
await page.evaluate(() => window.__llmaci.onAction('pick-stage', { dataset: { stage: 'house' } }));
await page.waitForFunction(() => window.__llmaci.state === 'intro', null, { timeout: 180000 });
await page.evaluate(() => window.__llmaci.begin());
await page.waitForTimeout(600);
await shot('01-quit-chip-idle');

// Both chips at once — the stack has to keep them apart.
await page.evaluate(() => { window.__llmaci.goalMet = true; window.__llmaci.hud.setCanFinish(true); });
await page.waitForTimeout(300);
await shot('02-both-chips');

await page.keyboard.down('Enter');
await page.evaluate(() => new Promise((res) => {
  const g = window.__llmaci;
  const tick = () => (g.quitHold > 0.45 || g.state !== 'playing' ? res(null) : requestAnimationFrame(tick));
  requestAnimationFrame(tick);
}));
await shot('03-quit-chip-half');
await page.keyboard.up('Enter');

/* THE SAME CHIP ON A NEAR-BLACK STAGE. It has to read on both extremes and the
   first version only worked on one of them — see the note in styles.css. */
await page.evaluate(() => {
  const g = window.__llmaci;
  g.toTitle();
  g.save.cleared = g.stageIds();
  g.onAction('pick-stage', { dataset: { stage: 'galaxy' } });
});
await page.waitForFunction(() => window.__llmaci.state === 'intro', null, { timeout: 180000 });
await page.evaluate(() => window.__llmaci.begin());
await page.waitForTimeout(900);
await shot('03b-quit-chip-dark-stage');

/* ---- all three stack items at once, in a narrow window ----
   The reported overlap ("ONE THING LEFT" printing through "tap to finish the
   round") only showed up in a portrait-ish window, which is exactly why the
   counter's old hand-picked `bottom: 84px` was never noticed. Reproduce the
   shape of the window it was reported in. */
await page.setViewportSize({ width: 590, height: 1000 });
await page.evaluate(() => {
  const g = window.__llmaci;
  g.toTitle();
  g.onAction('pick-stage', { dataset: { stage: 'house' } });
});
await page.waitForFunction(() => window.__llmaci.state === 'intro', null, { timeout: 180000 });
await page.evaluate(() => {
  const g = window.__llmaci, k = g.kat, f = g.world.field;
  g.begin();
  g.goalMet = true;
  g.hud.setCanFinish(true);
  /* Eat the stage down to three stragglers so the finder fires for real. The
     three have to be SPARED from the eating passes rather than resurrected
     afterwards: an earlier version ate all 1,442 and then tried to keep one,
     found nothing alive to keep, and photographed the "nothing left to roll up"
     state instead — which is a different HUD and not the one under test. */
  const spare = new Set();
  for (let i = 0; i < f.n && spare.size < 3; i++) if (f.pickup[i] < 0.05) spare.add(i);
  for (let pass = 0; pass < 60; pass++) {
    const lim = k.diameter * 0.88; let got = 0;
    for (let i = 0; i < f.n; i++) {
      if (!f.alive[i] || spare.has(i) || f.pickup[i] > lim) continue;
      k.attach(f.arch[i], { x: f.x[i], y: f.y[i], z: f.z[i] }, f.variant[i], 0, Math.random);
      f.remove(i); got++;
    }
    if (!got) break;
  }
  for (let i = 0; i < f.n; i++) if (f.alive[i] && !spare.has(i)) f.remove(i);
  g.nextExhaustCheck = 0;
});
await page.waitForTimeout(2500);
await shot('10-finder-count-narrow');
await page.setViewportSize({ width: 1100, height: 660 });

/* ---- options, with the destructive button armed ---- */
await page.evaluate(() => { window.__llmaci.toTitle(); window.__llmaci.onAction('options'); });
await page.waitForTimeout(250);
await shot('04-options');
await page.evaluate(() => window.__llmaci.onAction('reset-progress'));
await page.waitForTimeout(250);
await shot('05-reset-armed');

/* ---- results with the ending offered, then the ending itself ---- */
await page.evaluate(() => {
  const g = window.__llmaci;
  g.screens.disarmReset();
  g.toTitle();
  g.save.cleared = g.stageIds().slice(0, -1);
  g.onAction('pick-stage', { dataset: { stage: 'universe' } });
});
await page.waitForFunction(() => window.__llmaci.state === 'intro', null, { timeout: 180000 });
await page.evaluate(() => {
  const g = window.__llmaci;
  g.begin();
  g.kat.radius = (g.stage.goal * 1.15) / 2;
  g.finish('early');
});
await page.waitForTimeout(500);
await shot('06-results-the-end');

/* KILL THE BEAT FADE FOR THE PHOTOGRAPHS. `endIn` is a 1500ms opacity ramp on a
   freshly-created element, and under swiftshader this page runs at about one
   frame per second — so every ending shot came out as an empty dark screen with
   only the static hint visible, which reads exactly like "the text is broken".
   It was not; the computed style was opacity 1 with the right text at the right
   size. Turn the animation off so these shots show the composed frame. */
await page.addStyleTag({ content: '.end-beat { animation: none !important; }' });
await page.evaluate(() => window.__llmaci.onAction('ending'));
await page.waitForTimeout(1800);
await shot('07-ending-open');
// The paperclip beat, and the last card.
await page.evaluate(() => { const g = window.__llmaci; for (let i = 0; i < 5; i++) g.ending.next(); });
await page.waitForTimeout(1800);
await shot('08-ending-paperclips');
await page.evaluate(() => { const g = window.__llmaci; while (g.ending.idx < 10) g.ending.next(); });
await page.waitForTimeout(1800);
await shot('09-ending-card');

/* ------------------------------------------------------------
   THE SAME MENUS ON A PHONE, SCROLLED TO THE BOTTOM.

   Everything above is shot at desktop width, where the menus have always been
   fine. Two separate defects have since been reported against the PHONE menus
   and neither was visible in any shot above: a Back button sitting under iOS
   Safari's toolbar, and every control that was not a slider hugging the left
   edge of an otherwise centred panel.

   Scrolled to the BOTTOM specifically. That is where both of them lived, and it
   is the part of a long panel that a default screenshot never shows.
   ------------------------------------------------------------ */
{
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, deviceScaleFactor: 2 });
  const p = await phone.newPage();
  await p.goto('http://localhost:5217/', { waitUntil: 'load' });
  await p.waitForFunction(() => window.__llmaci?.state === 'title', null, { timeout: 120000 });
  await p.addStyleTag({ content: '*{animation:none!important;transition:none!important}' });
  for (const [name, action] of [['how', 'how'], ['options', 'options']]) {
    await p.evaluate((a) => window.__llmaci.onAction(a), action);
    await p.waitForTimeout(200);
    await p.screenshot({ path: path.join(OUT, `phone-${name}-top.png`) });
    await p.evaluate(() => { const el = document.querySelector('.screen:not(.hidden) .panel'); el.scrollTop = el.scrollHeight; });
    await p.waitForTimeout(200);
    await p.screenshot({ path: path.join(OUT, `phone-${name}-bottom.png`) });
    console.log(`  phone-${name}-top / -bottom`);
    await p.evaluate(() => window.__llmaci.onAction('back-title'));
  }
  await phone.close();
}

await browser.close(); await server.close();
console.log(`\nwrote to ${OUT}`);
