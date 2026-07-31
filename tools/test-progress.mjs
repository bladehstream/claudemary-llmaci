/* ============================================================
   Is there always enough mass BELOW you to grow past where you
   are?

   `balance`'s "ladder gaps" asks whether a prop of roughly your
   size exists. That is necessary and it is not sufficient: what
   actually stops a katamari is arriving at a size where
   everything you can still eat, added together, is not enough to
   grow you past the next thing you cannot.

   Measured after a player finished the third stage at 66% and
   more time turned out not to help. Doubling the clock moved the
   quantum realm's roll-up not at all — 61% at 5:00 and 61% at
   10:00 — which means the bot was not running out of road, it
   was running out of things it was big enough to eat.

   For each size on the ladder:
     needed    = the ball's own volume at that size / packing
     available = total volume of every prop edible below it
   and the ratio of the two is the headroom at that moment. Where
   it dips toward 1 the stage pinches; below 1 it is a wall.
   ============================================================ */
import * as THREE from 'three';
import { buildCatalog } from '../src/world/props/index.js';
for (const f of ['quantum','atom','microbe','house','town','city','country','world','solar','galaxy','universe','nature','ai'])
  await import(`../src/world/props/${f}.js`);
import { World } from '../src/world/World.js';
import { TUNING } from '../src/world/Katamari.js';
import { formatSizeShort } from '../src/util/math.js';
buildCatalog();
const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
const ONLY = process.argv.find((a) => a.startsWith('--only='))?.split('=')[1]?.split(',');

const NAMES = ['quantum','atom','microbe','house','town','city','country','world','solar','galaxy','universe'];
let fail = 0;
console.log('stage                    x2 size      midway       goal   goal+20%      ceiling');
for (const n of NAMES) {
  if (ONLY && !ONLY.includes(n)) continue;
  const st = Object.values(await import(`../src/world/stages/${n}.js`))[0];
  const w = new World(mat).build(st);
  const f = w.field;
  const items = [];
  let total = 0;
  for (let i = 0; i < f.n; i++) { items.push([f.pickup[i], f.arch[i].volume]); total += f.arch[i].volume; }
  items.sort((a, b) => a[0] - b[0]);
  const ceiling = Math.cbrt((6 * total * TUNING.packing) / Math.PI);

  /* Report the curve; do NOT return a verdict.
   *
   * The first version looked for the minimum headroom anywhere on the ladder
   * and "found" a pinch in all eleven stages — every one of them at the size
   * ceiling. That is arithmetic, not a defect: as the ball approaches the
   * largest size the stage's total mass can support, what is left to eat
   * necessarily converges on the ball's own volume. A check whose failure
   * condition is "the ceiling exists" tells you nothing.
   *
   * What IS worth reading is the headroom at the sizes a player passes through
   * on the way to the goal. Below about 1.5x there is very little slack for a
   * player who misses things, which a bot never does. */
  const at = (D) => {
    const lim = D * TUNING.pickupRatio;
    let acc2 = 0;
    for (const [pk, v] of items) { if (pk > lim) break; acc2 += v; }
    return acc2 / ((Math.PI / 6) * D * D * D / TUNING.packing);
  };
  const mid = Math.sqrt(st.startSize * st.goal);
  console.log(
    st.name.padEnd(20),
    (at(st.startSize * 2).toFixed(2) + 'x').padStart(9),
    (at(mid).toFixed(2) + 'x').padStart(9),
    (at(st.goal).toFixed(2) + 'x').padStart(9),
    (at(st.goal * 1.2).toFixed(2) + 'x').padStart(11),
    formatSizeShort(ceiling, st.unit).padStart(12));
}
console.log(`
Headroom = everything still edible, divided by the volume the ball itself needs
to BE that size. It is a diagnostic, not a gate: near the ceiling it converges on
1.0 in every stage by construction, which is arithmetic rather than a defect.

⚠ AND NOTE WHAT NONE OF THIS MEASURES. A player reported 99% roll-up on the atom
stage. The value-chasing bot manages 64% there and a nearest-first completionist
48%, because both give up on small props long before a person does. Bot roll-up
is not a clear rate and must not be read as one — a rebalance was very nearly
shipped on the strength of it.`);
process.exit(0);
