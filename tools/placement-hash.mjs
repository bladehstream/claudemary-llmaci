/* Hash every prop placement in a stage — archetype, variant, position, rotation,
   scale — so a change that should be DRAWN-ONLY can be proved not to have moved
   anything. Run it here and in a `git worktree` of the commit before; the two
   lines must match.
     node tools/placement-hash.mjs house [town ...] */
import * as THREE from 'three';
import { buildCatalog } from '../src/world/props/index.js';
import { World } from '../src/world/World.js';
const names = ['quantum', 'atom', 'microbe', 'house', 'town', 'city', 'country', 'world', 'solar', 'galaxy', 'universe'];
for (const s of [...names, 'nature', 'ai']) await import(`../src/world/props/${s}.js`);
buildCatalog();
for (const id of process.argv.slice(2)) {
  const mod = await import(`../src/world/stages/${id}.js`);
  const stage = Object.values(mod).find((v) => v && v.id === id);
  const w = new World(new THREE.MeshBasicMaterial()).build(stage);
  const f = w.field;
  let h = 2166136261 >>> 0;
  const mix = (v) => { const s = String(v); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } };
  for (let i = 0; i < f.n; i++) { mix(f.arch[i].id); mix(f.variant[i]); mix(f.x[i].toFixed(6)); mix(f.y[i].toFixed(6)); mix(f.z[i].toFixed(6)); mix(f.rotY[i].toFixed(6)); mix(f.scale[i].toFixed(6)); }
  console.log(`${id.padEnd(9)} props ${f.n}  hash ${h.toString(16)}`);
}
