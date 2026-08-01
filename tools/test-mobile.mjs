/* ============================================================
   The phone build, on a simulated phone.

   Everything about mobile fails silently. A tilt listener that
   is never granted, a permission asked outside a gesture, a
   button that latches on because the thumb slid off it, a field
   of view that quietly collapses to a letterbox — none of these
   throw, and none of them show up in any other harness here,
   because every other harness runs at 700x460 with a mouse.

   So this one runs at 390x844 with `hasTouch`, fabricates
   DeviceOrientationEvents, and asserts the things a person would
   otherwise have to notice on a real handset:

     1. tilting forward actually moves the katamari forward, and
        the sign is not inverted (the failure that drives the
        game into your lap);
     2. the neutral angle is CALIBRATED, so holding the phone at
        a natural reading angle is not full throttle;
     3. the pan buttons swing the camera and release cleanly;
     4. declining the permission still leaves a playable game;
     5. portrait does not collapse the field of view;
     6. the menus fit inside the viewport.
   ============================================================ */

import { createServer } from 'vite';
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const server = await createServer({ root: ROOT, server: { port: 5231 }, logLevel: 'error' });
await server.listen();

const browser = await chromium.launch({
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'],
});

/* A representative modern handset in portrait. Chromium cannot emulate the
   motion sensor, so the page gets a stub installed before any of its own script
   runs — see `initScript` below. `hasTouch` is what makes `(pointer: coarse)`
   match, which is the whole basis of the game's device detection. */
const PHONE = { width: 390, height: 844 };

const frames2 = (page, n) => page.evaluate((k) => new Promise((res) => {
  let i = 0; const t = () => (++i > k ? res() : requestAnimationFrame(t)); requestAnimationFrame(t);
}), n);

let fail = 0;
const check = (name, ok, extra = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '   ' + extra : ''}`);
  if (!ok) fail++;
};

/**
 * Move the sensor and let the input filter catch up, then read.
 *
 * `Touch.read()` is pure — `update(dt)` advances the low-pass filter, once per
 * frame from the game loop. So setting an angle and reading it in the same task
 * returns the PREVIOUS frame's angle, which is correct behaviour and made six
 * assertions here read a flat 0.000 the moment the filter landed.
 *
 * Forcing a full second of filter time converges it completely (tau is 70ms)
 * and keeps these assertions about the ANGLE MAPPING rather than about how many
 * frames swiftshader managed. The end-to-end "the katamari actually travels"
 * check below still goes through real frames, which is where the filter's real
 * timing gets exercised.
 */
const tilt = (page, { beta, gamma } = {}) => page.evaluate((v) => {
  if (v.beta !== undefined) window.__setBeta(v.beta);
  if (v.gamma !== undefined) window.__setGamma(v.gamma);
  window.__llmaci.touch.update(1);
  return window.__llmaci.touch.read();
}, { beta, gamma });

/**
 * Replace DeviceOrientationEvent with something we can drive.
 *
 * `grant` false makes requestPermission() resolve 'denied', which is the branch
 * an iOS user takes by tapping "Don't Allow" — and the branch that must still
 * leave a playable game.
 */
const initScript = (grant) => `
  window.__tilt = { beta: ${grant ? 50 : 0}, listeners: [], asked: 0, gesture: null };
  class FakeDOE extends Event {
    constructor(type, init) { super(type); this.alpha = 0; this.beta = init.beta; this.gamma = 0; this.absolute = false; }
    static requestPermission() {
      window.__tilt.asked++;
      /* Record whether the browser considered this a user gesture. iOS only
         grants from inside one, so a harness that never checks would pass on a
         page that silently fails on a real phone. */
      window.__tilt.gesture = navigator.userActivation ? navigator.userActivation.isActive : null;
      /* A real handset starts emitting within a frame of the listener
         attaching — AFTER the promise resolves. Reproducing that ordering is
         the whole point: doing it synchronously would hide the bug where the
         control overlay is laid out before any reading exists. */
      if (${grant}) setTimeout(() => window.__setBeta(window.__tilt.beta), 30);
      return Promise.resolve(${grant ? "'granted'" : "'denied'"});
    }
  }
  window.DeviceOrientationEvent = FakeDOE;
  const realAdd = window.addEventListener.bind(window);
  window.addEventListener = function (t, fn, o) {
    if (t === 'deviceorientation') window.__tilt.listeners.push(fn);
    return realAdd(t, fn, o);
  };
  window.__gamma = 0;
  window.__setBeta = (b) => {
    window.__tilt.beta = b;
    for (const fn of window.__tilt.listeners) fn({ beta: b, gamma: window.__gamma, alpha: 0 });
  };
  window.__setGamma = (g) => {
    window.__gamma = g;
    for (const fn of window.__tilt.listeners) fn({ beta: window.__tilt.beta, gamma: g, alpha: 0 });
  };
`;

async function openPhone(grant) {
  const ctx = await browser.newContext({ viewport: PHONE, hasTouch: true, isMobile: false, deviceScaleFactor: 2 });
  await ctx.addInitScript(initScript(grant));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message)));
  page.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|ERR_INTERNET/.test(m.text())) errors.push(m.text()); });
  await page.goto('http://localhost:5231/', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__llmaci?.state === 'title', null, { timeout: 120000 });
  return { ctx, page, errors };
}

/** Load a stage and stop on the intro screen, where the tilt prompt lives. */
async function toIntro(page, stage = 'quantum') {
  await page.evaluate((s) => {
    const g = window.__llmaci;
    if (g.state !== 'title') g.toTitle();
    g.onAction('pick-stage', { dataset: { stage: s } });
  }, stage);
  await page.waitForFunction(() => window.__llmaci.state === 'intro', null, { timeout: 180000 });
}

/* ============================================================
   1. Detection and layout
   ============================================================ */
console.log('\n=== the game knows it is on a phone ===');
{
  const { ctx, page, errors } = await openPhone(true);
  const d = await page.evaluate(() => ({
    coarse: matchMedia('(pointer: coarse)').matches,
    touchClass: document.body.classList.contains('touch'),
    enabled: window.__llmaci.touch.enabled,
    controlsShown: !document.getElementById('mobile-controls').classList.contains('hidden'),
    quality: window.__llmaci.options.quality,
    shadows: window.__llmaci.options.shadows,
    dpr: window.__llmaci.scene.renderer.getPixelRatio(),
  }));
  check('coarse pointer detected', d.coarse && d.enabled, `coarse=${d.coarse} enabled=${d.enabled}`);
  check('body carries the touch class', d.touchClass);
  check('the control overlay is up', d.controlsShown);
  check('first run picks cheap defaults', d.quality === 'low' && d.shadows === false,
    `quality=${d.quality} shadows=${d.shadows}`);
  check('devicePixelRatio is clamped', d.dpr <= 1.01, `renderer dpr ${d.dpr} on a device dpr of 2`);

  // Menus have to fit. A panel wider than the viewport is a horizontal scrollbar
  // on a phone, and the buttons at the bottom of a too-tall panel are unreachable.
  const fits = await page.evaluate(() => {
    const out = {};
    for (const [name, action] of [['title', null], ['select', 'play'], ['how', 'how'], ['options', 'options']]) {
      if (action) window.__llmaci.onAction(action);
      const panel = document.querySelector('.screen:not(.hidden) .panel, .screen:not(.hidden) .title-inner');
      const r = panel ? panel.getBoundingClientRect() : { width: 0, height: 0 };
      out[name] = { w: Math.round(r.width), h: Math.round(r.height), over: r.width > window.innerWidth + 1 };
    }
    out.vw = window.innerWidth; out.vh = window.innerHeight;
    out.scrollX = document.documentElement.scrollWidth > window.innerWidth;
    return out;
  });
  for (const k of ['title', 'select', 'how', 'options']) {
    check(`${k} panel fits the width`, !fits[k].over, `${fits[k].w}px in a ${fits.vw}px viewport`);
  }
  check('no horizontal overflow anywhere', !fits.scrollX);

  /* ---- and you can actually HIT the button at the bottom ----

     The check above measures WIDTH, and its own comment claims that "the
     buttons at the bottom of a too-tall panel are unreachable" — and then never
     looks at a button. A player reported exactly that about Back on an iPhone.

     Two things a phone browser does that a desktop one does not:

     - iOS Safari's `100vh` is the LARGE viewport, the height with the URL bar
       retracted. While the bar and the bottom toolbar are on screen the visible
       area is ~110px shorter, so a panel sized to `100vh` runs underneath the
       toolbar and its last element is behind Safari's own UI.
     - The home indicator owns the bottom ~34pt whatever the toolbar is doing.

     Chromium cannot draw Safari's chrome, so this cannot reproduce the toolbar
     directly. What it CAN pin is the proxy: after scrolling to the bottom of
     the panel, how much clear space is there under the button, and is the
     button a real touch target. 44px is Apple's minimum on both counts. */
  const reach = await page.evaluate(() => {
    const out = {};
    for (const [name, action] of [['how', 'how'], ['options', 'options']]) {
      window.__llmaci.onAction(action);
      const panel = document.querySelector('.screen:not(.hidden) .panel');
      panel.scrollTop = panel.scrollHeight;      // as far down as a thumb can get
      const btn = [...document.querySelectorAll('.screen:not(.hidden) .panel-actions .btn')].pop();
      const r = btn.getBoundingClientRect();
      const p = panel.getBoundingClientRect();
      out[name] = {
        w: Math.round(r.width), h: Math.round(r.height),
        underButton: Math.round(window.innerHeight - r.bottom),
        insidePanel: Math.round(p.bottom - r.bottom),
        scrolls: panel.scrollHeight > panel.clientHeight + 1,
        inView: r.bottom <= window.innerHeight + 0.5 && r.top >= -0.5,
      };
    }
    out.vh = window.innerHeight;
    return out;
  });
  for (const k of ['how', 'options']) {
    const b = reach[k];
    check(`${k}: Back is a real touch target`, b.h >= 44 && b.w >= 44, `${b.w}x${b.h}px (Apple minimum 44)`);
    check(`${k}: Back is on screen once scrolled`, b.inView, `bottom edge, viewport ${reach.vh}px`);
    check(`${k}: Back clears the bottom edge`, b.underButton >= 44,
      `${b.underButton}px of clear space under it — iOS puts its toolbar and home indicator here`);
  }

  check('no page errors', errors.length === 0, errors.slice(0, 2).join(' | ').slice(0, 160));
  await ctx.close();
}

/* ============================================================
   2. The permission handshake
   ============================================================ */
console.log('\n=== the iOS permission handshake ===');
{
  const { ctx, page } = await openPhone(true);
  await toIntro(page);
  const before = await page.evaluate(() => ({
    asked: window.__tilt.asked,
    btn: !document.getElementById('intro-tilt').classList.contains('hidden'),
    tilt: window.__llmaci.touch.tilt,
  }));
  check('permission is NOT requested on load', before.asked === 0, `asked ${before.asked} times`);
  check('the intro offers the tilt button', before.btn && before.tilt === 'idle');

  // Tap it for real, so the gesture is genuine rather than a synthetic call.
  await page.tap('#intro-tilt');
  await page.waitForFunction(() => window.__llmaci.touch.tilt !== 'idle', null, { timeout: 10000 });
  const after = await page.evaluate(() => ({
    asked: window.__tilt.asked,
    gesture: window.__tilt.gesture,
    tilt: window.__llmaci.touch.tilt,
    listeners: window.__tilt.listeners.length,
    recentre: !document.getElementById('mc-recentre').classList.contains('hidden'),
    drive: !document.getElementById('mc-drive').classList.contains('hidden'),
  }));
  check('tapping asks exactly once', after.asked === 1, `asked ${after.asked}`);
  check('the ask happens inside a user gesture', after.gesture !== false, `userActivation.isActive = ${after.gesture}`);
  check('granting attaches the listener', after.tilt === 'granted' && after.listeners > 0);

  /* THE ASYNC GAP. requestPermission() resolves the instant the player taps
     Allow, but the first reading has not arrived — so the overlay is laid out
     against `tiltLive === false` and shows the no-sensor fallback. Unless
     something re-checks when the reading lands, a player ends up with working
     tilt AND the drive buttons, permanently. */
  await page.waitForFunction(() => window.__llmaci.touch.tiltLive, null, { timeout: 5000 });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const live = await page.evaluate(() => ({
    recentre: !document.getElementById('mc-recentre').classList.contains('hidden'),
    drive: !document.getElementById('mc-drive').classList.contains('hidden'),
  }));
  check('the overlay updates when the sensor goes live', live.recentre && !live.drive,
    `recentre=${live.recentre} drive=${live.drive}`);
  await ctx.close();
}

/* ============================================================
   3. Tilt actually drives, in the right direction
   ============================================================ */
console.log('\n=== tilt drives the katamari ===');
{
  const { ctx, page } = await openPhone(true);
  await toIntro(page);
  await page.tap('#intro-tilt');
  await page.waitForFunction(() => window.__llmaci.touch.tilt === 'granted', null, { timeout: 10000 });

  // Hold it at a natural reading angle, then start. Calibration happens in
  // begin(), so this angle must come out as ZERO thrust.
  await page.evaluate(() => window.__setBeta(52));
  await page.evaluate(() => window.__llmaci.begin());
  await page.waitForFunction(() => window.__llmaci.state === 'playing', null, { timeout: 10000 });

  const held = await page.evaluate(() => {
    const t = window.__llmaci.touch;
    return { neutral: t.neutral, thrust: t.read().moveZ };
  });
  check('a natural holding angle is neutral', Math.abs(held.thrust) < 1e-6 && Math.abs(held.neutral - 52) < 0.001,
    `neutral ${held.neutral}, moveZ ${held.thrust}`);

  // Inside the deadzone: still nothing.
  const dead = (await tilt(page, { beta: 49 })).moveZ;
  check('a 3-degree wobble is inside the deadzone', dead === 0, `moveZ ${dead}`);

  /* Tip the TOP AWAY from you: beta falls. That must read as forward, which is
     NEGATIVE moveZ — the same sign W produces. Getting this backwards is the
     bug where the ball drives into your lap.

     52 - 22 = 30 degrees of offset, which is exactly RANGE, so this is the
     first angle that commands everything. It used to be 22 degrees; the band
     was widened after the controls read as on/off. */
  const fwd = (await tilt(page, { beta: 22 })).moveZ;
  check('tilting away rolls FORWARD', fwd < -0.99, `moveZ ${fwd.toFixed(3)} (want -1)`);
  const back = (await tilt(page, { beta: 82 })).moveZ;
  check('tilting back reverses', back > 0.99, `moveZ ${back.toFixed(3)} (want +1)`);

  /* THE POINT OF THE WHOLE EXERCISE: a middling angle must give a middling
     number. 18 degrees of offset is a bit over half the band, and the expo
     turns that into about 0.4 — deliberately less than half, so the gentle end
     of the travel buys the gentle end of the speed. */
  const partial = (await tilt(page, { beta: 34 })).moveZ;
  check('partial tilt is proportional', partial < -0.25 && partial > -0.6, `moveZ ${partial.toFixed(3)}`);

  /* And the curve is monotonic with no flat spots — five angles, five distinct
     and increasing outputs. This is the assertion the player's report would
     have failed: before the fix every one of these read exactly -1.000. */
  const ramp = [];
  for (const b of [46, 40, 34, 28, 22]) ramp.push(-(await tilt(page, { beta: b })).moveZ);
  const rising = ramp.every((v, i) => i === 0 || v > ramp[i - 1] + 0.04);
  check('the whole band is distinguishable', rising, ramp.map((v) => v.toFixed(2)).join(' -> '));

  // And the physics really moves. This is the end-to-end check: the other
  // assertions could all pass with the value never reaching Katamari.step.
  const moved = await page.evaluate(async () => {
    const g = window.__llmaci;
    window.__setBeta(30);
    const p0 = { x: g.kat.pos.x, z: g.kat.pos.z };
    await new Promise((res) => { let n = 0; const t = () => (++n > 30 ? res() : requestAnimationFrame(t)); requestAnimationFrame(t); });
    return Math.hypot(g.kat.pos.x - p0.x, g.kat.pos.z - p0.z);
  });
  check('the katamari actually travels', moved > 0.01, `moved ${moved.toFixed(4)} units`);

  /* AND A GENTLE TILT IS GENUINELY SLOWER.
     This is the assertion that would have caught the original complaint, and
     none of the ones above would have: `Katamari.step` normalised the input and
     accelerated to a fixed cap, so every angle past the deadzone produced
     identical motion while `read()` returned a perfectly good proportional
     number. Everything upstream of the physics can be right and the control
     still be a switch, so measure the SPEED, not the input. */
  const speeds = await page.evaluate(async () => {
    const g = window.__llmaci;
    const p = { x: g.kat.pos.x, y: g.kat.pos.y, z: g.kat.pos.z };
    /* PEAK speed over the run, not the speed at the end of it. The first
       version read the final velocity and reported the full tilt as SLOWER
       than the gentle one — because a full tilt crosses the room faster and
       had run into the furniture by frame 20, so it was measuring a collision.
       Acceleration does not scale with the throttle, only the cap does, so the
       peak is reached early and survives whatever the ball hits afterwards. */
    const run = async (beta) => {
      g.kat.pos.set(p.x, p.y, p.z);
      g.kat.vel.x = 0; g.kat.vel.z = 0;
      window.__setBeta(beta);
      let peak = 0;
      await new Promise((res) => {
        let n = 0;
        const t = () => {
          peak = Math.max(peak, Math.hypot(g.kat.vel.x, g.kat.vel.z) / g.kat.topSpeed);
          return ++n > 20 ? res() : requestAnimationFrame(t);
        };
        requestAnimationFrame(t);
      });
      return peak;
    };
    return { gentle: await run(38), full: await run(22) };
  });
  check('a gentle tilt commands a lower speed', speeds.gentle < speeds.full * 0.6,
    `${(speeds.gentle * 100).toFixed(0)}% of top vs ${(speeds.full * 100).toFixed(0)}% at full tilt`);

  // Recentring mid-round adopts the new angle as zero.
  const recal = await page.evaluate(() => {
    const g = window.__llmaci;
    window.__setBeta(20);
    g.touch.calibrate();
    return { neutral: g.touch.neutral, moveZ: g.touch.read().moveZ };
  });
  check('recentre re-zeros to the current angle', Math.abs(recal.moveZ) < 1e-6 && Math.abs(recal.neutral - 20) < 0.001,
    `neutral ${recal.neutral}, moveZ ${recal.moveZ}`);
  await ctx.close();
}

/* ============================================================
   4. Buttons: pan, dash, and releasing cleanly
   ============================================================ */
console.log('\n=== the thumb buttons ===');
{
  const { ctx, page } = await openPhone(true);
  await toIntro(page);
  /* Grant tilt here too. The steering assertions below need a live sensor, and
     without it `turnByTilt` is false and `read().turn` quietly falls back to the
     buttons — which reads as "tilt steering is broken" when it was never on. */
  await page.tap('#intro-tilt');
  await page.waitForFunction(() => window.__llmaci.touch.tiltLive, null, { timeout: 10000 });
  await page.evaluate(() => window.__llmaci.begin());
  await page.waitForFunction(() => window.__llmaci.state === 'playing', null, { timeout: 10000 });
  /* Arrows first, so put turning on buttons. With the default (tilt) the arrows
     are hidden on purpose, and `boundingBox()` on a hidden element is null. */
  await page.evaluate(() => window.__llmaci.setOption('turn', 'buttons'));

  /* REAL TOUCH, held. `page.mouse` does not reach pointer handlers in a
     hasTouch context and `page.tap` cannot express a hold, so this goes through
     CDP — which is what a finger actually generates, including the pointer
     capture the buttons depend on. */
  const cdp = await page.context().newCDPSession(page);
  const touchAt = async (type, x, y) => cdp.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1, radiusX: 12, radiusY: 12, force: 1 }],
  });
  const frames = (n) => page.evaluate((k) => new Promise((res) => {
    let i = 0; const t = () => (++i > k ? res() : requestAnimationFrame(t)); requestAnimationFrame(t);
  }), n);

  const yaw0 = await page.evaluate(() => window.__llmaci.rig.yaw);
  const box = await page.locator('[data-mc="pan-left"]').boundingBox();
  await touchAt('touchStart', box.x + box.width / 2, box.y + box.height / 2);
  await frames(20);
  const mid = await page.evaluate(() => ({ yaw: window.__llmaci.rig.yaw, pan: window.__llmaci.touch.pan }));
  await touchAt('touchEnd', 0, 0);
  await frames(3);
  const after = await page.evaluate(() => ({ yaw: window.__llmaci.rig.yaw, pan: window.__llmaci.touch.pan }));
  /* Measure the drift BETWEEN two post-release samples, not against the
     mid-hold one. Under swiftshader a frame is ~0.1s of clamped game time, so
     each frame still holding the button is 0.21rad of yaw — comparing to
     mid-hold measures the harness's frame rate, not whether the pan stopped. */
  await frames(8);
  const rest = await page.evaluate(() => window.__llmaci.rig.yaw);

  check('holding pan-left swings the camera', Math.abs(mid.yaw - yaw0) > 0.05 && mid.pan === -1,
    `yaw moved ${(mid.yaw - yaw0).toFixed(3)}, pan ${mid.pan}`);
  check('releasing stops the pan', after.pan === 0, `pan ${after.pan}`);
  check('the yaw stops dead when released', Math.abs(rest - after.yaw) < 1e-9,
    `drifted ${(rest - after.yaw).toExponential(2)} rad over 8 idle frames`);

  /* THE LATCH BUG: drag off the button before releasing. Without pointer
     capture the element never sees pointerup and the camera spins forever. */
  const box2 = await page.locator('[data-mc="pan-right"]').boundingBox();
  await touchAt('touchStart', box2.x + box2.width / 2, box2.y + box2.height / 2);
  await touchAt('touchMove', box2.x + 200, box2.y - 260);
  await touchAt('touchEnd', 0, 0);
  await frames(2);
  const slid = await page.evaluate(() => window.__llmaci.touch.pan);
  check('sliding a thumb off a button releases it', slid === 0, `pan ${slid}`);

  /* ---- tilt steering, and the toggle ---- */
  const steer = await page.evaluate(async () => {
    const g = window.__llmaci;
    g.setOption('turn', 'tilt');
    window.__setGamma(0);
    g.touch.calibrate();
    // Same filter problem as the drive axis: read() is pure, so each angle
    // needs the filter driven forward before it means anything.
    const at = (deg) => { window.__setGamma(deg); g.touch.update(1); return g.touch.read().turn; };
    const hidden = document.getElementById('mc-panpair').classList.contains('hidden');
    const flat = at(0);
    const dead = at(4);                       // inside the 6-degree deadzone
    const right = at(36);                     // TURN_RANGE — full roll right
    const left = at(-36);
    const part = at(-22);                     // partway
    const y0 = g.rig.yaw;
    await new Promise((res) => { let n = 0; const t = () => (++n > 12 ? res() : requestAnimationFrame(t)); requestAnimationFrame(t); });
    return { hidden, flat, dead, right, left, part, yawMoved: g.rig.yaw - y0 };
  });
  check('tilt steering hides the pan arrows', steer.hidden);
  check('level phone does not turn', steer.flat === 0 && steer.dead === 0,
    `level ${steer.flat}, 4deg ${steer.dead}`);
  check('rolling right turns right', steer.right > 0.99, `turn ${steer.right.toFixed(2)}`);
  check('rolling left turns left', steer.left < -0.99, `turn ${steer.left.toFixed(2)}`);
  check('partial roll is proportional', steer.part < -0.25 && steer.part > -0.7, `turn ${steer.part.toFixed(2)}`);
  check('and it actually swings the camera', Math.abs(steer.yawMoved) > 0.05,
    `yaw moved ${steer.yawMoved.toFixed(3)}`);

  const back = await page.evaluate(() => {
    const g = window.__llmaci;
    g.setOption('turn', 'buttons');
    return {
      shown: !document.getElementById('mc-panpair').classList.contains('hidden'),
      turn: (window.__setGamma(36), g.touch.update(1), g.touch.read().turn),
    };
  });
  check('switching to buttons brings the arrows back', back.shown);
  check('and tilt stops steering', back.turn === 0, `turn ${back.turn}`);
  await page.evaluate(() => window.__llmaci.setOption('turn', 'tilt'));

  const dash = await page.evaluate(() => {
    const el = document.querySelector('[data-mc="dash"]');
    el.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 7, bubbles: true }));
    const on = window.__llmaci.touch.read().dash;
    el.dispatchEvent(new PointerEvent('pointerup', { pointerId: 7, bubbles: true }));
    return { on, off: window.__llmaci.touch.read().dash };
  });
  check('dash is a held state', dash.on === true && dash.off === false);

  // Leaving play must not leave a button stuck down.
  const afterPause = await page.evaluate(() => {
    const el = document.querySelector('[data-mc="pan-left"]');
    el.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 9, bubbles: true }));
    window.__llmaci.pause();
    return { pan: window.__llmaci.touch.pan, state: window.__llmaci.state };
  });
  check('pausing releases every held button', afterPause.pan === 0 && afterPause.state === 'paused');

  /* ---- a way out, which the touch build did not have ---- */
  await page.evaluate(() => window.__llmaci.resume());
  await page.waitForFunction(() => window.__llmaci.state === 'playing', null, { timeout: 10000 });
  const quitBox = await page.locator('#mc-quit').boundingBox();
  check('the quit button is on screen and thumb-sized', !!quitBox && quitBox.width >= 40,
    quitBox ? `${Math.round(quitBox.width)}x${Math.round(quitBox.height)} at y=${Math.round(quitBox.y)}` : 'missing');
  await touchAt('touchStart', quitBox.x + quitBox.width / 2, quitBox.y + quitBox.height / 2);
  await frames(2);
  const arming = await page.evaluate(() => ({
    held: window.__llmaci.touch.quitHeld,
    fill: document.getElementById('mc-quit-fill').style.transform,
    state: window.__llmaci.state,
  }));
  check('holding it starts the timer and fills', arming.held && /scaleY\(0\.[0-9]*[1-9]/.test(arming.fill),
    `${arming.fill || '(none)'}`);
  check('a brief touch does not quit', arming.state === 'playing');
  await page.waitForFunction(() => window.__llmaci.state === 'title', null, { timeout: 30000 });
  await touchAt('touchEnd', 0, 0);
  check('holding it through quits to the title', true);

  // And it must not latch: a touch that slides off leaves nothing held.
  await toIntro(page);
  await page.evaluate(() => window.__llmaci.begin());
  await page.waitForFunction(() => window.__llmaci.state === 'playing', null, { timeout: 10000 });
  const q2 = await page.locator('#mc-quit').boundingBox();
  await touchAt('touchStart', q2.x + q2.width / 2, q2.y + q2.height / 2);
  await touchAt('touchMove', q2.x - 180, q2.y + 300);
  await touchAt('touchEnd', 0, 0);
  await frames(3);
  check('sliding off the quit button releases it',
    await page.evaluate(() => window.__llmaci.touch.quitHeld === false && window.__llmaci.quitHold === 0));

  /* ---- the ten-tap easter egg, which worked on a mouse and not on a phone ----

     Reported as "clicking the mouse 10 times works, but tapping the screen
     doesn't". Two causes, and only the second is visible in this harness.

     Safari has ignored `user-scalable=no` for years, so double-tap-to-zoom was
     still live on the canvas and every rapid tap sat in a hold-off while the
     browser waited for a possible second one. `touch-action: none` on `#scene`
     is what actually turns that off — asserted here because it is one CSS line
     that a later tidy-up would happily delete, and nothing else would fail.

     The other cause was the counter: it reset whenever two taps were more than
     900ms apart, so ONE slow tap anywhere in the ten discarded all the progress
     before it. That is fragile on a thumb and fine on a mouse, which is exactly
     the reported asymmetry. Now a rolling window.

     `_secretTap` is driven directly rather than through real touches, on
     purpose: under swiftshader this page runs near 1fps, and dispatched taps
     120ms apart actually ARRIVE 1.5-2.9s apart. That measures the harness, not
     the game — it is how the bug was found, and it would now mask the fix. */
  check('the play area takes no browser gestures',
    (await page.evaluate(() => getComputedStyle(document.querySelector('canvas')).touchAction)) === 'none',
    'touch-action on #scene');

  const tapAt = (gaps) => page.evaluate(async (ms) => {
    const g = window.__llmaci;
    g.sfx.fartMode = false; g._taps = [];
    for (const d of ms) { g._secretTap(); await new Promise((r) => setTimeout(r, d)); }
    return g.sfx.fartMode;
  }, gaps);

  check('ten taps at a thumb cadence unlocks it',
    await tapAt(Array(10).fill(120)));
  /* One deliberately slow tap, longer than the old 900ms rule allowed. This is
     the case that was broken, so it is the case worth pinning. */
  check('and an uneven rhythm still unlocks it',
    await tapAt([100, 90, 110, 1400, 95, 105, 80, 130, 100, 90]), 'one 1.4s gap mid-run');
  check('ten more taps turns it back off',
    (await tapAt(Array(20).fill(110))) === false, 'toggles, never latches');
  check('ten taps spread over a minute does NOT unlock it',
    await page.evaluate(() => {
      const g = window.__llmaci;
      g.sfx.fartMode = false;
      const t0 = performance.now();
      g._taps = Array.from({ length: 10 }, (_, i) => t0 - (60000 - i * 6000));
      g._secretTap();
      return g.sfx.fartMode === false;
    }));

  /* ---- and the reason an iPhone was silent ----
     iOS puts Web Audio in the AMBIENT session category, which the physical
     ring/silent switch mutes — so a correct page produces no sound at all, with
     nothing in the console. An HTMLMediaElement uses PLAYBACK instead and
     promotes the session. Cannot be verified from here (no switch to flip, and
     Chromium has no such category), so assert the SHAPE of the fix: the thing
     exists, loops, is inline, and is NOT muted — a muted element does not
     change the category, which would make the whole workaround a no-op that
     still looks present. */
  const ios = await page.evaluate(() => {
    const el = window.__llmaci.audio._silentEl;
    return el && {
      loop: el.loop, muted: el.muted, vol: el.volume,
      inline: el.hasAttribute('playsinline'), wav: /^data:audio\/wav/.test(el.src),
    };
  });
  check('the iOS audio-session unlock exists', !!ios);
  check('and is looping, inline, and NOT muted',
    !!ios && ios.loop && !ios.muted && ios.vol > 0 && ios.inline,
    ios ? `loop ${ios.loop}, muted ${ios.muted}, vol ${ios.vol}, playsinline ${ios.inline}` : '');
  check('and its silence is generated, not an asset', !!ios && ios.wav);

  /* ---- Options -> Tilt range ----
     The whole argument for shipping the band width as a slider is that nobody
     can pick the number from here, which is worth nothing if the control turns
     out to be inert or to forget itself. Check every link in the chain: the row
     exists, moving it reaches `touch.rangeMul`, the note says something in
     degrees rather than in arbitrary units, and it is written to the save. */
  const slider = await page.evaluate(() => {
    const el = document.getElementById('opt-tiltrange');
    if (!el) return { missing: true };
    const g = window.__llmaci;
    const move = (v) => { el.value = String(v); el.dispatchEvent(new Event('input', { bubbles: true })); return g.touch.rangeMul; };
    const narrow = move(60);
    const note = document.getElementById('opt-tiltrange-note').textContent;
    const wide = move(160);
    return { missing: false, narrow, wide, saved: g.options.tiltRange, note };
  });
  check('the tilt range slider exists', !slider.missing);
  check('and moves the band', Math.abs(slider.narrow - 0.6) < 1e-9 && Math.abs(slider.wide - 1.6) < 1e-9,
    `60 -> ${slider.narrow}, 160 -> ${slider.wide}`);
  check('and says what it does in degrees', /\d+°/.test(slider.note || ''),
    `"${(slider.note || '').slice(0, 48)}…"`);
  check('and is persisted', Math.abs(slider.saved - 1.6) < 1e-9, `options.tiltRange ${slider.saved}`);

  /* ---- The whole Options panel, generically ----
     ⚠ EVERY control, not a named list. The phone media query drops each row's
     control onto its own line and centres it, and the bug it exists to fix was
     never "the checkbox is wrong" — it was that only `input[type=range]` had
     ever been PLACED, so anything added later auto-flowed to the left edge and
     sat visibly out of line with a panel whose every other element is centred.
     That is a bug about the next control somebody adds, so the assertion has to
     be about all of them. Measured at the time: 51px off centre for the
     selects, 151px for the checkboxes, 89px for the Reset Progress pill. */
  await page.evaluate(() => { window.__llmaci.onAction('back-title'); window.__llmaci.onAction('options'); });
  await page.waitForSelector('#options-screen:not(.hidden)');
  const opts = await page.evaluate(() => {
    const panel = document.querySelector('#options-screen .panel');
    const pr = panel.getBoundingClientRect();
    const mid = (pr.left + pr.right) / 2;
    const bad = [];
    let n = 0;
    for (const el of panel.querySelectorAll('.opt-row > input, .opt-row > select, .opt-row > .btn')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      n++;
      const id = el.id || el.dataset.action || el.type || el.tagName.toLowerCase();
      // Ranges are width:100% and centred by construction; everything else has
      // to be centred by the rule, which is the thing actually under test.
      const full = r.width > pr.width * 0.8;
      const off = Math.abs((r.left + r.right) / 2 - mid);
      if (!full && off > 12) bad.push(`${id} is ${Math.round(off)}px off centre`);
      if (r.left < pr.left - 1 || r.right > pr.right + 1) bad.push(`${id} escapes the panel`);
      if (r.height < 20) bad.push(`${id} is only ${Math.round(r.height)}px tall`);
    }
    return { bad, n, notes: panel.querySelectorAll('.opt-note').length };
  });
  check('every Options control is measured', opts.n >= 10, `${opts.n} controls, ${opts.notes} notes`);
  check('and every one of them is centred and inside the panel', opts.bad.length === 0,
    opts.bad.join('; '));

  /* The two settings added for phone play specifically. Both are sliders whose
     entire justification is that the value cannot be chosen from a desk, so
     both have to actually reach the thing they claim to move — the tilt band
     was inert for the life of the project for exactly this reason. */
  const added = await page.evaluate(() => {
    const g = window.__llmaci;
    const move = (id, v) => {
      const el = document.getElementById(id);
      if (!el) return false;
      el.value = String(v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    };
    const ok = move('opt-magnet', 100) && move('opt-zoom', 180);
    const out = {
      ok,
      magnet: g.kat.magnet,
      magnetNote: document.getElementById('opt-magnet-note').textContent,
      zoom: g.rig.zoom,
      zoomNote: document.getElementById('opt-zoom-note').textContent,
      savedZoom: g.options.zoom,
    };
    move('opt-magnet', 0);
    out.magnetOff = g.kat.magnet;
    return out;
  });
  check('both new sliders exist', added.ok);
  check('the magnet slider reaches the katamari',
    Math.abs(added.magnet - 0.6) < 1e-9 && added.magnetOff === 0,
    `100 -> ${added.magnet}, 0 -> ${added.magnetOff}`);
  check('and its note says what it does NOT do',
    /does NOT change what is small enough/i.test(added.magnetNote || ''));
  check('the zoom slider reaches the camera rig',
    Math.abs(added.zoom - 1.8) < 1e-9 && Math.abs(added.savedZoom - 1.8) < 1e-9,
    `180 -> ${added.zoom}`);
  check('and its note admits the cost, not only the benefit',
    /harder to aim|less warning/i.test(added.zoomNote || ''));

  await ctx.close();
}

/* ============================================================
   5. Declining the permission still leaves a game
   ============================================================ */
console.log('\n=== "Don\'t Allow" is still playable ===');
{
  const { ctx, page } = await openPhone(false);
  await toIntro(page);
  await page.tap('#intro-tilt');
  await page.waitForFunction(() => window.__llmaci.touch.tilt === 'denied', null, { timeout: 10000 });
  const ui = await page.evaluate(() => ({
    tilt: window.__llmaci.touch.tilt,
    recentre: !document.getElementById('mc-recentre').classList.contains('hidden'),
    drive: !document.getElementById('mc-drive').classList.contains('hidden'),
    note: document.getElementById('intro-tilt-note').textContent.trim().slice(0, 40),
  }));
  check('denial swaps in the drive buttons', ui.drive && !ui.recentre, `tilt=${ui.tilt}`);
  check('and it says so', /No tilt/i.test(ui.note), `"${ui.note}…"`);

  await page.evaluate(() => window.__llmaci.begin());
  await page.waitForFunction(() => window.__llmaci.state === 'playing', null, { timeout: 10000 });
  const drove = await page.evaluate(async () => {
    const g = window.__llmaci;
    const el = document.querySelector('[data-mc="drive-fwd"]');
    el.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 3, bubbles: true }));
    const p0 = { x: g.kat.pos.x, z: g.kat.pos.z };
    await new Promise((res) => { let n = 0; const t = () => (++n > 30 ? res() : requestAnimationFrame(t)); requestAnimationFrame(t); });
    const d = Math.hypot(g.kat.pos.x - p0.x, g.kat.pos.z - p0.z);
    el.dispatchEvent(new PointerEvent('pointerup', { pointerId: 3, bubbles: true }));
    return { d, moveZ: g.touch.read().moveZ };
  });
  check('the forward button drives without a sensor', drove.d > 0.01, `moved ${drove.d.toFixed(4)} units`);
  await ctx.close();
}

/* ============================================================
   6. Portrait does not collapse the view
   ============================================================ */
console.log('\n=== the portrait camera ===');
{
  const { ctx, page } = await openPhone(true);
  await toIntro(page);
  await page.evaluate(() => window.__llmaci.begin());
  await page.waitForFunction(() => window.__llmaci.state === 'playing', null, { timeout: 10000 });
  await page.evaluate(() => new Promise((res) => { let n = 0; const t = () => (++n > 6 ? res() : requestAnimationFrame(t)); requestAnimationFrame(t); }));

  const cam = await page.evaluate(() => {
    const c = window.__llmaci.scene.camera;
    const hfov = 2 * Math.atan(Math.tan((c.fov * Math.PI / 360)) * c.aspect) * 180 / Math.PI;
    // What the horizontal view WOULD have been with no compensation at all.
    const naive = 2 * Math.atan(Math.tan((58 * Math.PI / 360)) * c.aspect) * 180 / Math.PI;
    return { aspect: c.aspect, vfov: c.fov, hfov, naive };
  });
  check('the viewport really is portrait', cam.aspect < 0.6, `aspect ${cam.aspect.toFixed(3)}`);
  check('vertical FOV is widened, not left at 58', cam.vfov > 70, `vfov ${cam.vfov.toFixed(1)}`);
  check('vertical FOV is clamped short of fish-eye', cam.vfov <= 82.01, `vfov ${cam.vfov.toFixed(1)}`);
  check('horizontal view is recovered', cam.hfov > cam.naive * 1.4,
    `hfov ${cam.hfov.toFixed(1)} vs ${cam.naive.toFixed(1)} uncompensated`);

  const shot = await page.evaluate(() => {
    const g = window.__llmaci;
    return { dist: g.rig.camera.position.distanceTo(g.kat.group.position) / g.kat.radius };
  });
  /* The quantum stage asks for distance 6.2; portrait adds 25%, and the rig
     also lifts with pitch, so anything at or below the flat 6.2 means the
     portrait boost silently did not apply. */
  check('the rig pulls back in portrait', shot.dist > 6.5, `${shot.dist.toFixed(2)} radii, stage asks 6.2`);
  await page.screenshot({ path: path.join(ROOT, 'tools', 'shots', 'mobile-play.png') });

  /* And a busy stage, because an empty one cannot show whether the composition
     works — the quantum realm is mostly black floor and looks fine at any FOV. */
  await page.evaluate(() => { const g = window.__llmaci; g.toTitle(); g.save.cleared = g.stageIds(); });
  await toIntro(page, 'house');
  await page.evaluate(() => window.__llmaci.begin());
  await page.waitForFunction(() => window.__llmaci.state === 'playing', null, { timeout: 10000 });
  await page.evaluate(() => { const g = window.__llmaci; g.goalMet = true; g.hud.setCanFinish(true); });
  await frames2(page, 8);
  await page.screenshot({ path: path.join(ROOT, 'tools', 'shots', 'mobile-house.png') });

  /* ------------------------------------------------------------
     ...and nothing on screen is printing through anything else.

     This stylesheet has now had THREE collisions between overlays that each
     own an independent `bottom:` — the two Enter chips, then the stragglers
     counter landing on the finish chip, and now the raised pan arrows against
     that same chip. Every one was found by a human noticing it in a
     screenshot, which is a bad detector in both directions: it missed all
     three for a while, and then I re-read a STALE png and announced that a fix
     had not landed when it had. Screenshots are for judging whether something
     looks nice. Whether two boxes overlap is arithmetic, so do the arithmetic.

     Worst case on purpose: goal met (finish chip up), stragglers counter
     showing, every mobile button on screen. If they fit here they fit always.
     ------------------------------------------------------------ */
  const overlapCheck = async (label) => {
    const res = await page.evaluate(() => {
      /* Show the stragglers counter HERE, in the same task as the measurement.
         A first version set it up, waited three frames and then measured — and
         the game loop calls `hud.clearFinder()` on any frame with nothing left
         to point at, so it was hidden again long before anything read its box.
         The test would have reported a clean bill of health for a worst case
         it never actually assembled. Measuring in the same synchronous task as
         the mutation is the only version the loop cannot undo, and the
         `missing` list below is there so a selector that silently stops
         matching shows up as a failure instead of as one less thing to test. */
      const fc = document.getElementById('finder-count');
      fc.classList.remove('hidden');
      fc.textContent = '3 THINGS LEFT';
      /* `animation: fpIn ... both` means that at t=0 the element is holding the
         first keyframe — opacity 0 and a scale — so measuring it in this same
         task gets an invisible element with a shrunken box. Kill the animation
         and we read the settled geometry, which is the only geometry worth
         asserting about anyway. */
      fc.style.animation = 'none';
      /* PAINTED LEAVES, not layout containers.
         A first version listed `.hud-topright` and `.mc-right`, and both are
         invisible wrappers whose boxes are much bigger than their ink:
         `.hud-topright` reserves a 52px right padding so the timer clears the
         pause button, but padding does not shrink the element's rect, so the
         wrapper "collided" with a button it was explicitly making room for.
         Assert on the things that actually draw pixels. */
      const SEL = [
        '#finder-count', '#finish-prompt', '#quit-prompt',
        '.mini-stats', '#pickup-feed',
        '.mc-left .mc-btn', '.mc-right .mc-btn', '#mc-pause', '#mc-quit',
        '.size-panel', '.goal-panel', '#timer', '#stage-name',
      ];
      const boxes = [];
      for (const sel of SEL) {
        for (const el of document.querySelectorAll(sel)) {
          const cs = getComputedStyle(el);
          if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) continue;
          const r = el.getBoundingClientRect();
          if (r.width < 1 || r.height < 1) continue;
          boxes.push({ sel, el, x: r.x, y: r.y, w: r.width, h: r.height });
        }
      }
      /* The overlays that MUST be on screen for this to be the worst case.
         Not every selector — the drive arrows and the pan arrows are mutually
         exclusive by design, and `#pickup-feed` is empty unless something was
         just collected. */
      const REQUIRED = ['#finder-count', '#finish-prompt', '#mc-quit', '.mc-right .mc-btn'];
      const seen = new Set(boxes.map((b) => b.sel));
      const missing = REQUIRED.filter((s) => !seen.has(s));
      const hits = [];
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i], b = boxes[j];
          // Nesting is not collision — a child inside its own parent is fine.
          if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
          const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
          const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
          /* 2px of slack: borders and subpixel rounding are not a collision
             anyone can see, and asserting exact separation makes this fail on
             a font metric change. */
          if (ox > 2 && oy > 2) {
            hits.push(`${a.sel} x ${b.sel} (${Math.round(ox)}x${Math.round(oy)}px)`);
          }
        }
      }
      return { hits, missing, n: boxes.length };
    });
    check(`the worst case is actually on screen (${label})`, res.missing.length === 0,
      res.missing.length ? `not showing: ${res.missing.join(', ')}` : `${res.n} overlays measured`);
    check(`no overlay prints through another (${label})`, res.hits.length === 0, res.hits.join('; '));
  };

  /* THREE layouts, not one twice.
     The right-hand column and the left-hand pair each swap independently — the
     column is RECENTRE with a live sensor and a forward/back pair without one,
     and the pan arrows appear whenever tilt steering is not actually available.
     A first pass ran the check twice without ever granting the sensor, so both
     runs measured the same 13 boxes and the label "tilt steering" was a lie;
     the counts printed below are what makes that visible. */
  await overlapCheck('no sensor: drive + pan arrows');
  await page.screenshot({ path: path.join(ROOT, 'tools', 'shots', 'mobile-crowded.png') });

  await page.evaluate(async () => {
    const g = window.__llmaci;
    await g.touch.requestTilt();
    window.__setBeta(50);
  });
  await frames2(page, 3);
  const swapped = await page.evaluate(() => ({
    live: window.__llmaci.touch.tiltLive,
    drive: !document.getElementById('mc-drive').classList.contains('hidden'),
  }));
  check('granting the sensor mid-round swaps the column', swapped.live && !swapped.drive,
    `tiltLive ${swapped.live}, drive arrows ${swapped.drive}`);

  await overlapCheck('tilt steering: no pan arrows');
  await page.evaluate(() => window.__llmaci.setOption('turn', 'buttons'));
  await frames2(page, 3);
  await overlapCheck('button steering: pan arrows back');

  /* The arrows are only "moved up out of the way" if they actually cleared the
     chip they were colliding with. Assert the gap, not just the absence of an
     intersection, so a future change that parks them 1px apart is still a
     failure. */
  const gap = await page.evaluate(() => {
    const a = document.querySelector('.mc-left').getBoundingClientRect();
    const c = document.getElementById('finish-prompt').getBoundingClientRect();
    return a.top - c.bottom;
  });
  check('the pan arrows clear the finish chip', gap > 6, `${Math.round(gap)}px gap`);

  await ctx.close();
}

await browser.close();
await server.close();
console.log(fail ? `\n${fail} FAILED` : '\nthe phone build behaves');
process.exit(fail ? 1 : 0);
