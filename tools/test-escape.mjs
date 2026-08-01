/* ============================================================
   Can you always get out of a screen?

   Reported by an iPhone player: *"I can't close the 'collection'
   menu."*

   That is a class of bug, not one bug. Every full-screen panel in
   this game has exactly one way out, it is the LAST element in
   the panel, and anything above it that grows — a list, a wall of
   notes, a textarea — pushes it down. The project has already
   shipped this twice: the Back button under Safari's toolbar
   (a `vh` unit that resolves against a taller viewport than its
   own container), and the Options controls hugging the left edge.
   Both were found by a person, not by a test.

   So this sweeps EVERY screen at EVERY plausible phone size and
   asserts three things about its exit control:

     1. it is inside the viewport;
     2. a finger landing on it actually hits it — `elementFromPoint`
        at its centre, which catches "covered by something else"
        as well as "off the bottom";
     3. it is big enough to hit.

   ⚠ AND ONE THING CHROMIUM CANNOT REPRODUCE. iOS Safari's `100vh`
   is the LARGE viewport — the height with the URL bar retracted —
   so while the bars are showing, anything sized in `vh` is TALLER
   than the area it is being laid out in. Chromium has no
   retractable bar, so `vh` and the visible height are always the
   same here and that specific failure is invisible to this
   harness. The short viewports below stand in for it: a panel
   that survives 320x480 will survive an iPhone with its chrome
   showing. There is also an explicit grep, because the honest
   defence is not to use `vh` for anything that has to fit.

   Run: node tools/test-escape.mjs
   ============================================================ */

import { createServer } from 'vite';
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const ROOT = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const PORT = 5288;
const server = await createServer({ root: ROOT, server: { port: PORT }, logLevel: 'error' });
await server.listen();

const browser = await chromium.launch({
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--disable-dev-shm-usage'],
});

let fail = 0;
const check = (name, ok, extra = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '   ' + extra : ''}`);
  if (!ok) fail++;
};

/* Real phones, smallest last. The 320x480 is an iPhone SE 1st gen — still the
   floor a lot of sites test to, and a useful stand-in for any modern handset
   whose browser chrome is eating a third of the screen. */
const SIZES = [
  { w: 430, h: 932, name: 'iPhone Pro Max' },
  { w: 390, h: 844, name: 'iPhone 14' },
  { w: 390, h: 664, name: 'iPhone 14, bars showing' },
  { w: 375, h: 553, name: 'iPhone SE2, bars showing' },
  { w: 320, h: 480, name: 'iPhone SE1' },
];

/* Every screen, the action that opens it, and the control that gets you out
   again. Named as strings rather than functions — a function cannot be
   serialised into `page.evaluate`, and passing one silently arrives as
   `undefined` rather than throwing. */
const SCREENS = [
  { id: 'stage-select', open: 'play', out: 'back-title' },
  { id: 'how-screen', open: 'how', out: 'back-title' },
  { id: 'options-screen', open: 'options', out: 'back-title' },
  { id: 'collection-screen', open: 'collection', out: 'back-title' },
  { id: 'coop-screen', open: 'coop', out: 'back-title' },
];

console.log('\n=== every screen has a visible way out, at every phone size ===');

for (const size of SIZES) {
  const ctx = await browser.newContext({
    viewport: { width: size.w, height: size.h }, hasTouch: true, deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__llmaci?.state === 'title', null, { timeout: 120000 });

  /* ⚠ FILL THE COLLECTION LOG FIRST, or this whole harness proves nothing.
     An empty log renders 429 rows of "???" — which is the same COUNT and so
     the same height, but the point stands generally: a panel only overflows
     once there is something in it, and testing menus in their empty
     first-run state is how a bug like this survives a test suite. Marking
     every archetype found is the honest worst case and a state a
     completionist really reaches. */
  await page.evaluate(async () => {
    const m = await import('/src/world/props/index.js');
    window.__llmaci.save.found = m.ARCHETYPES.map((a) => a.id);
  });

  const bad = [];
  for (const s of SCREENS) {
    await page.evaluate((action) => {
      const g = window.__llmaci;
      if (g.state !== 'title') g.toTitle();
      g.onAction(action);
    }, s.open);
    await page.waitForSelector(`#${s.id}:not(.hidden)`);

    const r = await page.evaluate(({ id, out }) => {
      const el = document.getElementById(id);
      const panel = el.querySelector('.panel');
      const btn = el.querySelector(`[data-action="${out}"]`);
      if (!btn || !panel) return { missing: true };

      const vis = () => {
        const b = btn.getBoundingClientRect();
        return {
          top: Math.round(b.top), bottom: Math.round(b.bottom), h: Math.round(b.height),
          onScreen: b.top >= 0 && b.bottom <= window.innerHeight
            && b.left >= 0 && b.right <= window.innerWidth,
        };
      };

      const atRest = vis();
      /* Scroll the panel as far as it goes and look again. A panel that
         overflows is not broken — that is what `overflow-y: auto` is for. */
      panel.scrollTop = panel.scrollHeight;
      const scrolled = vis();
      const panelScrolls = panel.scrollHeight > panel.clientHeight + 1;

      /* ⚠ NESTED SCROLLERS ARE THE ACTUAL BUG. If the panel must be scrolled to
         reach its exit, but most of the panel is covered by a child that
         scrolls on its own, then a finger landing there scrolls the CHILD and
         the exit is unreachable however hard the player tries. That is exactly
         "I can't close the collection menu": the log is its own scroll box
         filling the panel, so the gesture never reaches the panel underneath. */
      let capture = 0, capturedBy = '';
      const pr = panel.getBoundingClientRect();
      const panelArea = Math.max(1, pr.width * pr.height);
      for (const kid of panel.querySelectorAll('*')) {
        const st = getComputedStyle(kid);
        if (!/auto|scroll/.test(st.overflowY)) continue;
        if (kid.scrollHeight <= kid.clientHeight + 1) continue;      // not actually scrolling
        const kr = kid.getBoundingClientRect();
        const frac = (kr.width * kr.height) / panelArea;
        if (frac > capture) { capture = frac; capturedBy = kid.id || kid.className; }
      }

      const hit = (() => {
        const b = btn.getBoundingClientRect();
        const h = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
        return { ok: !!h && (h === btn || btn.contains(h)), what: h ? (h.id || h.className || h.tagName) : 'nothing' };
      })();

      panel.scrollTop = 0;
      return {
        missing: false, atRest, scrolled, panelScrolls, capture, capturedBy, hit,
        vh: window.innerHeight,
      };
    }, { id: s.id, out: s.out });

    /* Nothing may hang off the side either. A grid column's default
       `min-width: auto` will not shrink below its content, so one long label
       silently pushes a whole column past the panel edge — measured on a 320px
       screen with the collection log's right-hand column clipped mid-word. */
    const wide = await page.evaluate((id) => {
      const panel = document.querySelector(`#${id} .panel`);
      const pr = panel.getBoundingClientRect();
      const over = [];
      for (const kid of panel.querySelectorAll('*')) {
        const kr = kid.getBoundingClientRect();
        if (kr.width === 0) continue;
        if (kr.right > pr.right + 2 || kr.left < pr.left - 2) {
          over.push(kid.id || (typeof kid.className === 'string' ? kid.className : kid.tagName));
        }
      }
      return { over: [...new Set(over)].slice(0, 3), scrollsX: panel.scrollWidth > panel.clientWidth + 1 };
    }, s.id);
    if (wide.over.length) bad.push(`${s.id}: ${wide.over.join(', ')} escapes the panel sideways`);

    if (r.missing) { bad.push(`${s.id}: no exit control`); continue; }
    if (!r.scrolled.onScreen) {
      bad.push(`${s.id}: exit still off-screen after scrolling the panel `
        + `(y ${r.scrolled.top}..${r.scrolled.bottom} of ${r.vh})`);
    } else if (!r.hit.ok) {
      bad.push(`${s.id}: exit covered by ${r.hit.what}`);
    } else if (r.scrolled.h < 34) {
      bad.push(`${s.id}: exit only ${r.scrolled.h}px tall`);
    } else if (r.panelScrolls && !r.atRest.onScreen && r.capture > 0.4) {
      /* The failure a player reports as "I can't close it". */
      bad.push(`${s.id}: exit needs the panel scrolled, but ${Math.round(r.capture * 100)}% `
        + `of the panel is a scroll box (${r.capturedBy}) that will eat the gesture`);
    }
  }

  check(`${size.name} (${size.w}x${size.h})`, bad.length === 0, bad.join('; '));
  await ctx.close();
}

/* ============================================================
   The `vh` audit — what the harness above structurally cannot see
   ============================================================ */
console.log('\n=== nothing that has to fit is measured in vh ===');
{
  const css = readFileSync(path.join(ROOT, 'src/ui/styles.css'), 'utf8');
  // Strip comments; this file explains the vh trap at length and would match.
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');
  /* ⚠ `\bvh\b` DOES NOT MATCH INSIDE `56vh`. The first version of this audit
     used it and passed on a stylesheet that contained `max-height: 56vh` — the
     exact declaration causing the reported bug. There is no word boundary
     between `6` and `v`; both are word characters. An audit that cannot see
     the thing it audits is worse than no audit, because it is reassuring. */
  const hits = [];
  for (const line of bare.split('\n')) {
    const re = /(max-height|min-height|height)\s*:\s*[^;{]*?\d+(?:\.\d+)?vh\b[^;{]*/g;
    for (const m of line.matchAll(re)) hits.push(m[0].trim());
  }
  check('no height is sized in vh', hits.length === 0,
    hits.length ? `${hits.join(' | ')}  <- iOS resolves vh against the LARGE viewport` : '');
}

console.log(`\n${fail ? `${fail} FAILED` : 'every screen can be left, at every size'}`);
await browser.close();
await server.close();
process.exit(fail ? 1 : 0);
