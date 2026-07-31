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
  await page.waitForFunction(() => window.__llmaci?.state === 'title', { timeout: 120000 });
  return { ctx, page, errors };
}

/** Load a stage and stop on the intro screen, where the tilt prompt lives. */
async function toIntro(page, stage = 'quantum') {
  await page.evaluate((s) => {
    const g = window.__llmaci;
    if (g.state !== 'title') g.toTitle();
    g.onAction('pick-stage', { dataset: { stage: s } });
  }, stage);
  await page.waitForFunction(() => window.__llmaci.state === 'intro', { timeout: 180000 });
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
  await page.waitForFunction(() => window.__llmaci.touch.tilt !== 'idle', { timeout: 10000 });
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
  await page.waitForFunction(() => window.__llmaci.touch.tiltLive, { timeout: 5000 });
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
  await page.waitForFunction(() => window.__llmaci.touch.tilt === 'granted', { timeout: 10000 });

  // Hold it at a natural reading angle, then start. Calibration happens in
  // begin(), so this angle must come out as ZERO thrust.
  await page.evaluate(() => window.__setBeta(52));
  await page.evaluate(() => window.__llmaci.begin());
  await page.waitForFunction(() => window.__llmaci.state === 'playing', { timeout: 10000 });

  const held = await page.evaluate(() => {
    const t = window.__llmaci.touch;
    return { neutral: t.neutral, thrust: t.read().moveZ };
  });
  check('a natural holding angle is neutral', Math.abs(held.thrust) < 1e-6 && Math.abs(held.neutral - 52) < 0.001,
    `neutral ${held.neutral}, moveZ ${held.thrust}`);

  // Inside the deadzone: still nothing.
  const dead = await page.evaluate(() => { window.__setBeta(49); return window.__llmaci.touch.read().moveZ; });
  check('a 3-degree wobble is inside the deadzone', dead === 0, `moveZ ${dead}`);

  /* Tip the TOP AWAY from you: beta falls. That must read as forward, which is
     NEGATIVE moveZ — the same sign W produces. Getting this backwards is the
     bug where the ball drives into your lap. */
  const fwd = await page.evaluate(() => { window.__setBeta(30); return window.__llmaci.touch.read().moveZ; });
  check('tilting away rolls FORWARD', fwd < -0.9, `moveZ ${fwd.toFixed(3)} (want about -1)`);
  const back = await page.evaluate(() => { window.__setBeta(74); return window.__llmaci.touch.read().moveZ; });
  check('tilting back reverses', back > 0.9, `moveZ ${back.toFixed(3)} (want about +1)`);
  const partial = await page.evaluate(() => { window.__setBeta(41); return window.__llmaci.touch.read().moveZ; });
  check('partial tilt is proportional', partial < -0.2 && partial > -0.8, `moveZ ${partial.toFixed(3)}`);

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
  await page.waitForFunction(() => window.__llmaci.touch.tiltLive, { timeout: 10000 });
  await page.evaluate(() => window.__llmaci.begin());
  await page.waitForFunction(() => window.__llmaci.state === 'playing', { timeout: 10000 });
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
    const hidden = document.getElementById('mc-panpair').classList.contains('hidden');
    const flat = g.touch.read().turn;
    window.__setGamma(4);                     // inside the deadzone
    const dead = g.touch.read().turn;
    window.__setGamma(30);                    // full roll right
    const right = g.touch.read().turn;
    window.__setGamma(-30);
    const left = g.touch.read().turn;
    window.__setGamma(-16);                   // partway
    const part = g.touch.read().turn;
    const y0 = g.rig.yaw;
    await new Promise((res) => { let n = 0; const t = () => (++n > 12 ? res() : requestAnimationFrame(t)); requestAnimationFrame(t); });
    return { hidden, flat, dead, right, left, part, yawMoved: g.rig.yaw - y0 };
  });
  check('tilt steering hides the pan arrows', steer.hidden);
  check('level phone does not turn', steer.flat === 0 && steer.dead === 0,
    `level ${steer.flat}, 4deg ${steer.dead}`);
  check('rolling right turns right', steer.right > 0.9, `turn ${steer.right.toFixed(2)}`);
  check('rolling left turns left', steer.left < -0.9, `turn ${steer.left.toFixed(2)}`);
  check('partial roll is proportional', steer.part < -0.2 && steer.part > -0.8, `turn ${steer.part.toFixed(2)}`);
  check('and it actually swings the camera', Math.abs(steer.yawMoved) > 0.05,
    `yaw moved ${steer.yawMoved.toFixed(3)}`);

  const back = await page.evaluate(() => {
    const g = window.__llmaci;
    g.setOption('turn', 'buttons');
    return {
      shown: !document.getElementById('mc-panpair').classList.contains('hidden'),
      turn: (window.__setGamma(30), g.touch.read().turn),
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
  await page.waitForFunction(() => window.__llmaci.state === 'playing', { timeout: 10000 });
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
  await page.waitForFunction(() => window.__llmaci.state === 'title', { timeout: 30000 });
  await touchAt('touchEnd', 0, 0);
  check('holding it through quits to the title', true);

  // And it must not latch: a touch that slides off leaves nothing held.
  await toIntro(page);
  await page.evaluate(() => window.__llmaci.begin());
  await page.waitForFunction(() => window.__llmaci.state === 'playing', { timeout: 10000 });
  const q2 = await page.locator('#mc-quit').boundingBox();
  await touchAt('touchStart', q2.x + q2.width / 2, q2.y + q2.height / 2);
  await touchAt('touchMove', q2.x - 180, q2.y + 300);
  await touchAt('touchEnd', 0, 0);
  await frames(3);
  check('sliding off the quit button releases it',
    await page.evaluate(() => window.__llmaci.touch.quitHeld === false && window.__llmaci.quitHold === 0));
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
  await page.waitForFunction(() => window.__llmaci.touch.tilt === 'denied', { timeout: 10000 });
  const ui = await page.evaluate(() => ({
    tilt: window.__llmaci.touch.tilt,
    recentre: !document.getElementById('mc-recentre').classList.contains('hidden'),
    drive: !document.getElementById('mc-drive').classList.contains('hidden'),
    note: document.getElementById('intro-tilt-note').textContent.trim().slice(0, 40),
  }));
  check('denial swaps in the drive buttons', ui.drive && !ui.recentre, `tilt=${ui.tilt}`);
  check('and it says so', /No tilt/i.test(ui.note), `"${ui.note}…"`);

  await page.evaluate(() => window.__llmaci.begin());
  await page.waitForFunction(() => window.__llmaci.state === 'playing', { timeout: 10000 });
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
  await page.waitForFunction(() => window.__llmaci.state === 'playing', { timeout: 10000 });
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
  await page.waitForFunction(() => window.__llmaci.state === 'playing', { timeout: 10000 });
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
