/* Hand the Blender scripts what the game already knows.

     node tools/blender/specs.mjs

   Writes tools/blender/out/palette.json (the game's C and SETS, so a Blender
   prop is painted from the same swatches as everything else) and
   tools/blender/out/specs.json: per archetype and variant, the bounding box the
   PROCEDURAL geometry occupies. That box is the contract. The game fits every
   model to it and takes every gameplay number from the procedural build, so a
   model can be as detailed as it likes without moving the balance by a hair —
   but a model authored on the wrong axis gets squashed into the box, and
   `models.js` warns about it. Model to these numbers. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCatalog, ARCHETYPES } from '../../src/world/props/index.js';
import { C, SETS } from '../../src/render/palette.js';
for (const s of ['quantum', 'atom', 'microbe', 'house', 'town', 'city', 'country', 'world', 'solar', 'galaxy', 'universe', 'nature', 'ai']) {
  await import(`../../src/world/props/${s}.js`);
}

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'out');
fs.mkdirSync(OUT, { recursive: true });
buildCatalog();

const specs = {};
for (const p of ARCHETYPES) {
  specs[p.id] = {
    name: p.name, tags: p.tags, variants: p.variants, pickup: p.pickup, scenery: !!p.scenery,
    boxes: p.geos.map((g) => {
      g.computeBoundingBox();
      const b = g.boundingBox;
      return { min: [b.min.x, b.min.y, b.min.z], max: [b.max.x, b.max.y, b.max.z],
        size: [b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z],
        tris: (g.index ? g.index.count : g.attributes.position.count) / 3 };
    }),
  };
}
fs.writeFileSync(path.join(OUT, 'specs.json'), JSON.stringify(specs, null, 1));
fs.writeFileSync(path.join(OUT, 'palette.json'), JSON.stringify({ C, SETS }, null, 1));
console.log(`${Object.keys(specs).length} archetypes -> ${path.join(OUT, 'specs.json')}`);
