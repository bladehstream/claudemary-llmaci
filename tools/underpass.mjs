/* ============================================================
   Which props can a katamari roll UNDERNEATH, and could it ever
   actually be small enough to?

   Giving props real collision parts means the space under a car
   or a bus is genuinely empty. That is correct physics, and it
   is only a problem if a player can reach it — a katamari that
   rolls through a car reads as a bug even when the geometry
   says it fits, because a car looks solid from the side.

   So: for every archetype, work out the tallest ball that fits
   under its lowest overhang, and compare that against the
   SMALLEST katamari that will ever meet it (the starting size
   of the earliest stage it is tagged for).

     headroom > minBall   ->  reachable underpass, decide on purpose
     headroom < minBall   ->  unreachable, ignore

   Anything reachable should either be a thing you obviously
   roll under (a table, a bench, a swing set) or get a sill
   added to the model.
   ============================================================ */

import { buildCatalog, ARCHETYPES } from '../src/world/props/index.js';
import '../src/world/props/quantum.js';
import '../src/world/props/atom.js';
import '../src/world/props/microbe.js';
import '../src/world/props/house.js';
import '../src/world/props/town.js';
import '../src/world/props/city.js';
import '../src/world/props/country.js';
import '../src/world/props/world.js';
import '../src/world/props/solar.js';
import '../src/world/props/galaxy.js';
import '../src/world/props/universe.js';
import '../src/world/props/nature.js';
import '../src/world/props/ai.js';
import { quantumStage } from '../src/world/stages/quantum.js';
import { atomStage } from '../src/world/stages/atom.js';
import { microbeStage } from '../src/world/stages/microbe.js';
import { houseStage } from '../src/world/stages/house.js';
import { townStage } from '../src/world/stages/town.js';
import { cityStage } from '../src/world/stages/city.js';
import { countryStage } from '../src/world/stages/country.js';
import { worldStage } from '../src/world/stages/world.js';
import { solarStage } from '../src/world/stages/solar.js';
import { galaxyStage } from '../src/world/stages/galaxy.js';
import { universeStage } from '../src/world/stages/universe.js';
import { formatSizeShort } from '../src/util/math.js';

buildCatalog();

const START = { house: houseStage.startSize, town: townStage.startSize, city: cityStage.startSize };

/**
 * Tallest ball that can pass under this prop somewhere in its footprint.
 *
 * Approximated by scanning a grid over the footprint: at each cell, the
 * headroom is the lowest part-bottom strictly above the ground among parts
 * covering that cell (and 0 if any part touches the ground there). The
 * answer is the best cell — one usable gap is all it takes.
 */
function headroom(arch, variant) {
  const parts = arch.parts[variant];
  if (!parts || !parts.length) return 0;
  const { w, d } = arch.dims;
  const N = 13;
  let best = 0;
  for (let ix = 0; ix < N; ix++) {
    for (let iz = 0; iz < N; iz++) {
      const x = -w / 2 + (w * (ix + 0.5)) / N;
      const z = -d / 2 + (d * (iz + 0.5)) / N;
      let ceil = Infinity, grounded = false;
      for (let o = 0; o < parts.length; o += 6) {
        if (x < parts[o] || x > parts[o + 3] || z < parts[o + 2] || z > parts[o + 5]) continue;
        if (parts[o + 1] <= 1e-4) { grounded = true; break; }
        if (parts[o + 1] < ceil) ceil = parts[o + 1];
      }
      if (grounded) continue;
      // A cell with nothing overhead at all is just open air beside the prop.
      if (ceil === Infinity) continue;
      if (ceil > best) best = ceil;
    }
  }
  return best;
}

const rows = [];
for (const a of ARCHETYPES) {
  if (a.scenery) continue;
  const stages = a.tags.filter((t) => START[t] !== undefined);
  if (!stages.length) continue;
  const minBall = Math.min(...stages.map((t) => START[t]));
  let gap = 0;
  for (let v = 0; v < a.geos.length; v++) gap = Math.max(gap, headroom(a, v));
  if (gap > minBall) rows.push({ id: a.id, gap, minBall, stages: stages.join('/'), pickup: a.pickup });
}

rows.sort((x, y) => y.gap / y.minBall - x.gap / x.minBall);
console.log(`${rows.length} props have an underpass a player can actually reach:\n`);
console.log('prop               headroom   smallest ball there   ratio   stages');
for (const r of rows) {
  console.log(`  ${r.id.padEnd(18)} ${formatSizeShort(r.gap).padStart(7)} ` +
    `${formatSizeShort(r.minBall).padStart(19)} ${(r.gap / r.minBall).toFixed(1).padStart(7)}x   ${r.stages}`);
}
console.log(`\n(${ARCHETYPES.length} archetypes checked; the rest are solid to the ground or never met while small enough.)`);
