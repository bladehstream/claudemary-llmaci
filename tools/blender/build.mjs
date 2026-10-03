/* Build a stage's model pack with headless Blender.

     node tools/blender/build.mjs house            -> public/models/house.glb
     node tools/blender/build.mjs house mug chair  -> only those props (a test pack)

   Runs tools/blender/props/<stage>.py inside Blender with kit.py on the path.
   The script defines MODELS = { 'propId': fn(variant) -> [parts] } and this
   driver's Python side builds, bakes and exports every one of them. */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const BLENDER = process.env.BLENDER
  || ['C:/Program Files/Blender Foundation/Blender 5.2/blender.exe'].find((p) => fs.existsSync(p));
if (!BLENDER) { console.error('Blender not found; set BLENDER='); process.exit(2); }

const [stage, ...only] = process.argv.slice(2);
if (!stage) { console.error('usage: build.mjs <stage> [propId ...]'); process.exit(2); }
/* A stage's models live in props/<stage>/*.py (several files, merged), or in a
   single props/<stage>.py. Files starting with _ are skipped. */
const dir = path.join(HERE, 'props', stage);
const script = fs.existsSync(dir) ? dir : path.join(HERE, 'props', `${stage}.py`);
if (!fs.existsSync(script)) { console.error(`no ${script}`); process.exit(2); }
const tag = process.env.PACK_TAG || 'test';

if (!fs.existsSync(path.join(HERE, 'out', 'specs.json'))) {
  spawnSync(process.execPath, [path.join(HERE, 'specs.mjs')], { stdio: 'inherit' });
}
const outDir = path.join(ROOT, 'public', 'models');
fs.mkdirSync(outDir, { recursive: true });
const out = only.length ? path.join(HERE, 'out', `${stage}-${tag}.glb`) : path.join(outDir, `${stage}.glb`);

const t0 = Date.now();
const r = spawnSync(BLENDER, ['-b', '--factory-startup', '--python', path.join(HERE, 'run.py'), '--',
  script, out, only.join(',')], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const lines = (r.stdout || '').split(/\r?\n/).filter((l) => /^(MODEL|BAKE-FAILED|ERROR|Traceback|  File|\w+Error)/.test(l));
console.log(lines.join('\n'));
if (r.status !== 0 || !fs.existsSync(out)) {
  console.error((r.stderr || '').slice(-3000));
  console.error(`FAILED (exit ${r.status})`);
  process.exit(1);
}
/* Shrink: share identical buffers (colour-only variants have identical
   positions and normals), then quantise — positions to 14 bits, normals to 10,
   colours to 8. About 2.5x, and no decoder: three reads KHR_mesh_quantization
   natively, so no WebAssembly and no CSP change. */
const raw = fs.statSync(out).size;
const { NodeIO } = await import('@gltf-transform/core');
const { ALL_EXTENSIONS } = await import('@gltf-transform/extensions');
const { quantize, dedup, prune } = await import('@gltf-transform/functions');
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(out);
await doc.transform(dedup(), prune(), quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeColor: 8 }));
await io.write(out, doc);
console.log(`${path.relative(ROOT, out)}  ${(raw / 1024).toFixed(0)} KB -> ${(fs.statSync(out).size / 1024).toFixed(0)} KB  in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
