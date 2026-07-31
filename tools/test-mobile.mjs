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
  window.__setBeta = (b) => {
    window.__tilt.beta = b;
    for (const fn of window.__tilt.listeners) fn({ beta: b, gamma: 0, alpha: 0 });
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
  await page.evaluate(() => window.__llmaci.begin());
  await page.waitForFunction(() => window.__llmaci.state === 'playing', { timeout: 10000 });

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
  await ctx.close();
}

await browser.close();
await server.close();
console.log(fail ? `\n${fail} FAILED` : '\nthe phone build behaves');
process.exit(fail ? 1 : 0);
