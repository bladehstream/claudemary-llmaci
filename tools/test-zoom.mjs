/* ============================================================
   Camera distance: does pulling back actually show you more?

   The obvious way to build this setting is a one-line multiplier
   on the chase distance, and that version DOES NOT WORK — it is
   worse than not having it. Fog distance in this game is a
   function of ball size alone, so moving the camera back without
   moving the fog puts the extra distance behind the fog wall: the
   player gets a bigger helping of grey and a smaller katamari,
   and correctly concludes the setting is broken.

   So the assertions here are about the things that have to move
   TOGETHER, not about the slider:

     - the camera really is further away;
     - the fog is further away by the same factor;
     - the far plane still clears the fog, so nothing is clipped
       before it has finished fading;
     - more of the world is actually drawn — measured in draw
       calls and triangles, because "I can see more" is not a
       claim source code can make on its own;
     - and the size-based detail cutoff does NOT move, so zooming
       cannot pop scenery in and out.

   `test-mobile` owns the slider wiring. This owns the optics.

   Run: node tools/test-zoom.mjs
   ============================================================ */

import { createServer } from 'vite';
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const PORT = 5284;
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

const page = await browser.newPage({ viewport: { width: 900, height: 620 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.message)));
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__llmaci?.state === 'title', { timeout: 120000 });

/* ⚠ THE STAGE HAS TO BE BIGGER THAN ITS OWN FOG, and the first version of this
   file was not. It used the house for speed, and every optics assertion passed
   while the two triangle-count assertions failed — because the house is a 26m
   room with a 60m fog wall, so the ENTIRE stage is already drawn at zoom 1 and
   there is physically nothing further away to reveal. That is not the feature
   failing, it is the measurement having nothing to measure. The town is four
   times the fog distance and is the smallest stage where "can you see more"
   is a question with an answer. */
await page.evaluate(() => {
  const g = window.__llmaci;
  g.setOption('quality', 'low');
  g.setOption('shadows', false);
  g.onAction('pick-stage', { dataset: { stage: 'town' } });
});
await page.waitForFunction(() => window.__llmaci.state === 'intro', { timeout: 180000 });
await page.evaluate(() => window.__llmaci.begin());
await page.waitForFunction(() => window.__llmaci.state === 'playing', { timeout: 20000 });

/**
 * Settle at a zoom and read the optics.
 *
 * ⚠ THE FOG IS DAMPED, so it does not arrive at its new value on the frame the
 * slider moves — it eases there over roughly 190 frames. Sampling immediately
 * would read the OLD fog against the NEW camera and report that the two do not
 * track each other, which is exactly the bug this file exists to catch and
 * would therefore look completely convincing.
 *
 * ⚠ BUT DO NOT WAIT FOR 190 RENDERED FRAMES. `damp` is called with a FIXED
 * 1/60 regardless of the real frame time, so convergence costs a fixed number
 * of CALLS, not a fixed amount of time — and under swiftshader a town frame is
 * expensive enough that three samples ran past ten minutes. Driving the same
 * pure function directly converges it in microseconds; the handful of real
 * frames afterwards is only there to refresh `renderer.info`, which three.js
 * resets at the start of every `render()`.
 */
async function settle(zoom) {
  return page.evaluate(async (z) => {
    const g = window.__llmaci;
    g.setOption('zoom', z);
    const frame = () => new Promise((r) => requestAnimationFrame(r));
    // Converge the damped fog without rendering anything.
    for (let i = 0; i < 400; i++) {
      g.scene.updateFog(g.kat.diameter, g.stage.startSize, g.rig.zoom);
    }
    // Then a few real frames, so the camera planes and the draw stats are this
    // zoom's rather than the previous one's.
    for (let i = 0; i < 4; i++) await frame();
    const cam = g.scene.camera;
    const kat = g.kat;
    const dx = cam.position.x - kat.group.position.x;
    const dy = cam.position.y - kat.group.position.y;
    const dz = cam.position.z - kat.group.position.z;
    const info = g.scene.renderer.info.render;
    /* HOW MANY THINGS THE PLAYER CAN ACTUALLY SEE.
       ⚠ NOT the triangle count, which was the first two versions of this
       measurement and was wrong twice. Triangles submitted is dominated by
       everything inside the FOG radius, and the fog already reaches past the
       edge of most stages — so both a small stage and a big one reported that
       zooming out revealed essentially nothing (+0.6%), which is true of the
       renderer's workload and says nothing whatsoever about the player's view.
       What a player means by "I can see more" is more OBJECTS in frame, so
       count those: live props whose position is inside the camera frustum.
       Exact, cheap, and immune to whether the geometry was already loaded. */
    const m = g._frustumMat || (g._frustumMat = cam.projectionMatrix.clone());
    m.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    const f = g.world.field;
    // Plane extraction from the view-projection matrix (Gribb & Hartmann).
    const e = m.elements;
    const planes = [];
    const P = (a, b, c, d) => {
      const len = Math.hypot(a, b, c) || 1;
      planes.push([a / len, b / len, c / len, d / len]);
    };
    P(e[3] + e[0], e[7] + e[4], e[11] + e[8], e[15] + e[12]);     // left
    P(e[3] - e[0], e[7] - e[4], e[11] - e[8], e[15] - e[12]);     // right
    P(e[3] + e[1], e[7] + e[5], e[11] + e[9], e[15] + e[13]);     // bottom
    P(e[3] - e[1], e[7] - e[5], e[11] - e[9], e[15] - e[13]);     // top
    P(e[3] + e[2], e[7] + e[6], e[11] + e[10], e[15] + e[14]);    // near
    P(e[3] - e[2], e[7] - e[6], e[11] - e[10], e[15] - e[14]);    // far
    /* ⚠ AND IT HAS TO BE THE NEAR FIELD, which is the third correction to this
       one measurement. Counting everything in the frustum reported +3%, and
       that is also true and also useless: the camera sits a few METRES behind
       the ball while the view is hundreds of metres deep, so the frustum's
       shape is set almost entirely by the cone angle — which zoom does not
       change — and not by where the apex is. What zoom really changes is the
       cross-section close to the ball: at the ball's own depth the cone is
       ~1.7x wider when the camera is 1.8x further back. That near band is what
       a player is steering through and what they zoom out to see more of. */
    const kx = kat.group.position.x, kz = kat.group.position.z;
    const near = kat.radius * 60;
    let visible = 0, all = 0;
    for (let i = 0; i < f.n; i++) {
      if (!f.alive[i]) continue;
      const x = f.x[i], y = f.y[i] + f.hgt[i] * 0.5, z = f.z[i];
      let inside = true;
      for (let p = 0; p < 6; p++) {
        const pl = planes[p];
        if (pl[0] * x + pl[1] * y + pl[2] * z + pl[3] < -f.rad[i]) { inside = false; break; }
      }
      if (!inside) continue;
      all++;
      if (Math.hypot(x - kx, z - kz) <= near) visible++;
    }
    /* The claim the Options note makes to the player, in the note's own terms:
       "the katamari is N% of its usual size on screen". Project the ball's
       radius to screen space and check the arithmetic is honest. */
    const fovY = (cam.fov * Math.PI) / 180;
    const camDist = Math.hypot(dx, dy, dz);
    const onScreen = (kat.radius / camDist) / Math.tan(fovY / 2);
    /* HOW MUCH PLAY AREA IS ON SCREEN, at the depth the player is steering at.
       This is the one number that scales cleanly with the setting, and it is
       the honest answer to "can I see more of the play area": the view is a
       cone from the camera, so its width at the BALL's depth is proportional
       to how far back the camera is, exactly. Further out than that the cone
       angle dominates and the apex position stops mattering — which is why the
       prop counts above move by 14% and not by 200%, and why quoting only the
       prop count would undersell a setting that genuinely does what it says. */
    const fovX = 2 * Math.atan(Math.tan(fovY / 2) * cam.aspect);
    const widthAtBall = 2 * camDist * Math.tan(fovX / 2);
    return {
      visible,
      allVisible: all,
      onScreen,
      widthAtBall,
      dist: Math.hypot(dx, dy, dz) / kat.radius,   // in radii, so size cancels
      fogNear: g.scene.scene.fog.near,
      fogFar: g.scene.scene.fog.far,
      far: cam.far,
      near: cam.near,
      calls: info.calls,
      tris: info.triangles,
      cutoff: g.world.field._cutoff,
      radius: kat.radius,
    };
  }, zoom);
}

console.log('\n=== the camera really moves ===');
const one = await settle(1);
const wide = await settle(1.8);
const tight = await settle(0.7);

check('zooming out moves the camera back by the factor asked for',
  Math.abs(wide.dist / one.dist - 1.8) < 0.06,
  `${one.dist.toFixed(2)} -> ${wide.dist.toFixed(2)} radii (x${(wide.dist / one.dist).toFixed(2)})`);
check('and zooming in moves it closer by the factor asked for',
  Math.abs(tight.dist / one.dist - 0.7) < 0.06,
  `${one.dist.toFixed(2)} -> ${tight.dist.toFixed(2)} radii (x${(tight.dist / one.dist).toFixed(2)})`);

console.log('\n=== and the fog moves with it ===');
check('the fog wall moves back by the same factor',
  Math.abs(wide.fogFar / one.fogFar - 1.8) < 0.08,
  `${one.fogFar.toFixed(0)} -> ${wide.fogFar.toFixed(0)} (x${(wide.fogFar / one.fogFar).toFixed(2)})`);
check('and the near edge with it, so the gradient keeps its shape',
  Math.abs((wide.fogNear / wide.fogFar) - (one.fogNear / one.fogFar)) < 0.02,
  `near/far ${(one.fogNear / one.fogFar).toFixed(3)} -> ${(wide.fogNear / wide.fogFar).toFixed(3)}`);
/* THE ASSERTION THE WHOLE FEATURE TURNS ON. If the fog does not clear the
   camera, the extra distance the player just paid for is behind a grey wall. */
check('the camera is not looking at its own fog wall',
  wide.fogFar > wide.dist * wide.radius,
  `fog at ${wide.fogFar.toFixed(0)}, camera ${(wide.dist * wide.radius).toFixed(0)} out`);

console.log('\n=== nothing is clipped before it has finished fading ===');
for (const [name, s] of [['1.0', one], ['1.8', wide], ['0.7', tight]]) {
  check(`far plane clears the fog at zoom ${name}`, s.far >= s.fogFar,
    `far ${s.far.toFixed(0)} vs fog ${s.fogFar.toFixed(0)}`);
  check(`near plane is still in front of the camera at zoom ${name}`,
    s.near > 0 && s.near < s.far / 1000, `near ${s.near.toFixed(4)}`);
}

console.log('\n=== you can actually see more, and what it costs ===');
/* THE LAW, NOT A VALUE. Visible width at the ball's own depth is exactly
   proportional to camera distance; further out, the cone angle takes over and
   the setting stops mattering. Asserting the proportionality catches a broken
   rig, where any single threshold on a prop count would only ever be a guess
   about one stage at one moment. */
check('the width of the view at the ball scales with the setting',
  Math.abs((wide.widthAtBall / one.widthAtBall) / 1.8 - 1) < 0.05
  && Math.abs((tight.widthAtBall / one.widthAtBall) / 0.7 - 1) < 0.05,
  `${one.widthAtBall.toFixed(1)}m across at 1.0, ${wide.widthAtBall.toFixed(1)}m at 1.8, `
  + `${tight.widthAtBall.toFixed(1)}m at 0.7`);
/* And the consequence, which is smaller than the width ratio and should be:
   props are spread over depth, and depth is where zoom stops helping. */
check('so more of your surroundings are in frame',
  wide.visible > one.visible * 1.10 && tight.visible < one.visible * 0.97,
  `${tight.visible} / ${one.visible} / ${wide.visible} nearby props at 0.7 / 1.0 / 1.8; `
  + `the whole frustum barely moves by comparison, ${one.allVisible} -> ${wide.allVisible}`);
/* The Options note tells the player the katamari will be `100/zoom` percent of
   its usual size. That is a specific numeric promise made in the UI, so it is
   worth checking rather than trusting. */
check('the katamari shrinks on screen exactly as the note promises',
  Math.abs((one.onScreen / wide.onScreen) - 1.8) < 0.08,
  `${(100 * wide.onScreen / one.onScreen).toFixed(0)}% of its usual size at 1.8x, note says `
  + `${(100 / 1.8).toFixed(0)}%`);

/* THE COST, BOUNDED. Widening the frustum is nearly free in this engine — the
   triangle count is set by the FOG radius, which already reaches past the edge
   of most stages, so pulling back mostly reveals geometry that was being
   submitted anyway. That is worth asserting rather than just noting: if a
   future change ever makes the widest setting several times the cost of the
   default, it needs a warning next to it that it does not currently have. */
check('and the widest setting is not expensive', wide.tris < one.tris * 1.5,
  `${(one.tris / 1000).toFixed(0)}k -> ${(wide.tris / 1000).toFixed(0)}k triangles `
  + `(x${(wide.tris / one.tris).toFixed(2)}), ${one.calls} -> ${wide.calls} draw calls`);

console.log('\n=== zooming cannot pop scenery ===');
/* The detail cutoff hides props below a fraction of the BALL's size. It must
   stay keyed to that and not to the camera: a cutoff that moved with zoom
   would make small scenery appear and disappear as the player adjusted the
   slider, which is the single most alarming thing a camera control can do. */
check('the detail cutoff is unmoved by zoom',
  one.cutoff === wide.cutoff && one.cutoff === tight.cutoff,
  `${one.cutoff} at every zoom`);

console.log('\n=== and it survives a stage change ===');
await page.evaluate(() => {
  const g = window.__llmaci;
  g.setOption('zoom', 1.6);
  g.toTitle();
  g.onAction('pick-stage', { dataset: { stage: 'quantum' } });
});
await page.waitForFunction(() => window.__llmaci.state === 'intro', { timeout: 180000 });
const kept = await page.evaluate(() => ({
  rig: window.__llmaci.rig.zoom, saved: window.__llmaci.options.zoom,
}));
/* `rig.configure` resets the rig to the STAGE's numbers on every load, so the
   player's zoom has to be re-applied after it. Without that it silently
   reverts to 1 the moment you start a round and the setting looks like it
   does not stick. */
check('the player zoom survives loading another stage',
  Math.abs(kept.rig - 1.6) < 1e-9, `rig.zoom ${kept.rig}, saved ${kept.saved}`);

console.log(`\npage errors: ${errors.length ? errors.join(' | ') : 'none'}`);
if (errors.length) fail++;

await browser.close();
await server.close();
console.log(fail ? `\n${fail} FAILED` : '\nzooming out really does show you more');
process.exit(fail ? 1 : 0);
