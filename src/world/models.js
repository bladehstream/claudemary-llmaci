/* ============================================================
   Modelled props — the Blender packs in public/models/.

   ⚠ A MODEL IS DRAWN AND NOTHING ELSE. Every number the game
   takes off a prop — pickup, volume, radius, the height profile,
   the collision parts — is computed by `buildCatalog` from the
   PROCEDURAL build, before any model is swapped in. So a model
   can carry ten times the detail of the primitive stack it
   replaces and the growth ladder, the collision and the balance
   cannot move at all. `npm run reghost` and the catalogue digest
   stay byte-identical by construction; that is the point.

   This is the `ghost` flag (see space-props) taken to its end:
   the drawn shape and the measured shape are separate things,
   and only the measured one has ever affected play.

   Placement: a model is NOT stretched to the procedural box —
   v1 primitives have quirks (the paperback's spine stuck out
   7cm), and squashing a well-made model into a quirky box would
   undo the work. It is set on the box's floor, centred on its
   footprint, and a size disagreement of more than 25% on any
   axis is reported, because that is almost always a model built
   on the wrong axis rather than a judgement call.
   ============================================================ */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ARCHETYPES } from './props/index.js';

/** Stage packs that exist. One GLB per stage, every model in it named `id__variant`. */
export const PACKS = ['house'];

/**
 * A plain BufferGeometry from a glTF mesh: position, normal, and colour reduced
 * to three components so it shares a shader variant with every procedural prop
 * (a 4-component COLOR_0 compiles a different program, USE_COLOR_ALPHA).
 */
export function fromGltfMesh(mesh) {
  const src = mesh.geometry;
  const n = src.attributes.position.count;
  /* ⚠ FLOAT COPIES, NOT CLONES. The packs are quantised (KHR_mesh_quantization):
     positions arrive as normalised int16 with the dequantising scale folded
     into the node's transform. `applyMatrix4` on an int16 attribute writes the
     transformed values straight back into int16 and clips them, so every
     attribute is read through getX/Y/Z (which denormalise) into Float32 first. */
  const f32 = (attr, k) => {
    const out = new Float32Array(n * k);
    for (let i = 0; i < n; i++) {
      out[i * k] = attr.getX(i);
      if (k > 1) out[i * k + 1] = attr.getY(i);
      if (k > 2) out[i * k + 2] = attr.getZ(i);
    }
    return out;
  };
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(f32(src.attributes.position, 3), 3));
  if (src.attributes.normal) g.setAttribute('normal', new THREE.BufferAttribute(f32(src.attributes.normal, 3), 3));
  // colour reduced to three components so it shares a shader variant with every
  // procedural prop (a 4-component COLOR_0 compiles a separate USE_COLOR_ALPHA program)
  const c = src.attributes.color;
  g.setAttribute('color', new THREE.BufferAttribute(c ? f32(c, 3) : new Float32Array(n * 3).fill(0.8), 3));
  if (src.index) g.setIndex(src.index.clone());
  // the glTF node carries the dequantising transform; bake it in
  mesh.updateMatrixWorld(true);
  g.applyMatrix4(mesh.matrixWorld);
  if (src.attributes.normal) {
    // normals went through the same matrix; renormalise after any scale
    const nn = g.attributes.normal;
    const v = new THREE.Vector3();
    for (let i = 0; i < n; i++) { v.fromBufferAttribute(nn, i).normalize(); nn.setXYZ(i, v.x, v.y, v.z); }
  } else g.computeVertexNormals();
  return g;
}

/** Seat `geo` on `target`'s floor, centred on its footprint. Returns the per-axis size ratio. */
function seat(geo, target) {
  geo.computeBoundingBox();
  const b = geo.boundingBox;
  const t = target.boundingBox || (target.computeBoundingBox(), target.boundingBox);
  geo.translate(
    (t.min.x + t.max.x) / 2 - (b.min.x + b.max.x) / 2,
    t.min.y - b.min.y,
    (t.min.z + t.max.z) / 2 - (b.min.z + b.max.z) / 2,
  );
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  const bs = b.getSize(new THREE.Vector3());
  const ts = t.getSize(new THREE.Vector3());
  return [bs.x / ts.x, bs.y / ts.y, bs.z / ts.z];
}

let loaded = null;

/**
 * Load every pack and swap models in for the procedural geometry they replace.
 * Call AFTER `buildCatalog()`. Safe to call twice; a missing or broken pack is
 * logged and skipped, so the game always has the procedural set to fall back on.
 */
export async function applyModels(base = import.meta.env?.BASE_URL || './') {
  if (loaded) return loaded;
  const byName = new Map();
  const loader = new GLTFLoader();
  for (const pack of PACKS) {
    try {
      const gltf = await loader.loadAsync(`${base}models/${pack}.glb`);
      gltf.scene.updateMatrixWorld(true);
      gltf.scene.traverse((o) => { if (o.isMesh) byName.set(o.name, o); });
    } catch (e) {
      console.warn(`[models] pack ${pack} not loaded:`, e?.message || e);
    }
  }
  const report = { swapped: 0, warned: [] };
  for (const p of ARCHETYPES) {
    for (let v = 0; v < p.geos.length; v++) {
      const m = byName.get(`${p.id}__${v}`) || byName.get(`${p.id}__0`);
      if (!m) continue;
      const geo = fromGltfMesh(m);
      const ratio = seat(geo, p.geos[v]);
      if (ratio.some((r) => r < 0.75 || r > 1.25)) {
        report.warned.push(`${p.id}__${v} ${ratio.map((r) => r.toFixed(2)).join('/')}`);
      }
      /* Carry the procedural geometry's userData across: `hasGhost`/`ghostTri`
         are catalogue-time only, but anything else hung off it at build time is
         someone's contract. */
      geo.userData = { ...p.geos[v].userData, model: true, procedural: p.geos[v] };
      p.geos[v] = geo;
      report.swapped++;
    }
  }
  if (report.warned.length) console.warn(`[models] size mismatch >25%: ${report.warned.join(', ')}`);
  loaded = report;
  return report;
}
