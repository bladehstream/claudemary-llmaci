import * as THREE from 'three';
import { buildCatalog, ARCHETYPES } from '../src/world/props/index.js';
import '../src/world/props/quantum.js';
import '../src/world/props/atom.js';
import '../src/world/props/microbe.js';
import '../src/world/props/house.js'; import '../src/world/props/town.js';
import '../src/world/props/city.js';
import '../src/world/props/country.js';
import '../src/world/props/world.js';
import '../src/world/props/solar.js';
import '../src/world/props/galaxy.js';
import '../src/world/props/universe.js'; import '../src/world/props/nature.js';
import '../src/world/props/ai.js';
import { World } from '../src/world/World.js';
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
buildCatalog();
const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
for (const stage of [quantumStage, atomStage, microbeStage, houseStage, townStage, cityStage, countryStage, worldStage, solarStage, galaxyStage, universeStage]) {
  const w = new World(mat).build(stage);
  const f = w.field, cost = new Map();
  for (let i = 0; i < f.n; i++) {
    const a = f.arch[i];
    const tris = a.geos[f.variant[i]].attributes.position.count / 3;
    const e = cost.get(a.id) || { n: 0, t: 0 };
    e.n++; e.t += tris; cost.set(a.id, e);
  }
  const rows = [...cost.entries()].sort((a, b) => b[1].t - a[1].t).slice(0, 10);
  const total = [...cost.values()].reduce((s, e) => s + e.t, 0);
  console.log(`\n=== ${stage.name} — ${Math.round(total/1000)}k tris across ${f.n} props ===`);
  for (const [id, e] of rows) {
    console.log(`  ${id.padEnd(18)} ${String(e.n).padStart(5)} x ${String(Math.round(e.t/e.n)).padStart(5)} = ${String(Math.round(e.t/1000)).padStart(5)}k  (${(e.t/total*100).toFixed(0)}%)`);
  }
}
