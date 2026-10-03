/* Model sheet: every mesh in a GLB, beside the procedural prop it replaces,
   lit by the game's own Scene (same material, same post stack), on a real GPU.

     /tools/sheet.html?glb=/tools/blender/out/house-test.glb&stage=house&cols=6

   Each cell: v1 on the left, the model on the right, both at true relative
   size within the cell. `window.__sheetReady` goes true once it has rendered. */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Scene } from '../src/render/Scene.js';
import { buildCatalog, getProp } from '../src/world/props/index.js';
import '../src/world/props/house.js';
import '../src/world/props/town.js';
import '../src/world/props/city.js';
import '../src/world/props/nature.js';
// every other stage's props too, so a model of any archetype has its v1 beside it
import '../src/world/props/ai.js';
import '../src/world/props/quantum.js';
import '../src/world/props/atom.js';
import '../src/world/props/microbe.js';
import '../src/world/props/country.js';
import '../src/world/props/world.js';
import '../src/world/props/solar.js';
import '../src/world/props/galaxy.js';
import '../src/world/props/universe.js';
import { fromGltfMesh } from '../src/world/models.js';
import { houseStage } from '../src/world/stages/house.js';
import { quantumStage } from '../src/world/stages/quantum.js';
import { atomStage } from '../src/world/stages/atom.js';
import { microbeStage } from '../src/world/stages/microbe.js';
import { countryStage } from '../src/world/stages/country.js';
import { worldStage } from '../src/world/stages/world.js';
import { solarStage } from '../src/world/stages/solar.js';
import { galaxyStage } from '../src/world/stages/galaxy.js';
import { universeStage } from '../src/world/stages/universe.js';

const q = new URLSearchParams(location.search);
const canvas = document.getElementById('c');
const sc = new Scene(canvas);
sc.setQuality(q.get('quality') || 'high');
/* ?stage=<id> lights the sheet like that stage (sky, sun), so self-lit parts
   on a dark stage can be judged against the darkness they will sit in. */
const STAGES = { house: houseStage, quantum: quantumStage, atom: atomStage, microbe: microbeStage,
  country: countryStage, world: worldStage, solar: solarStage, galaxy: galaxyStage, universe: universeStage };
const lit = STAGES[q.get('stage')] || houseStage;
sc.setSky(lit.sky);
sc.setSun(lit.sun, lit.sun.intensity);
sc.scene.fog = null;
buildCatalog();

const gltf = await new GLTFLoader().loadAsync(q.get('glb'));
const meshes = [];
gltf.scene.traverse((o) => { if (o.isMesh) meshes.push(o); });
meshes.sort((a, b) => a.name.localeCompare(b.name));
const only = q.get('only');
const items = meshes.filter((m) => !only || only.split(',').some((id) => m.name.startsWith(id + '__')));

const cols = Number(q.get('cols') || 6);
const rows = Math.ceil(items.length / cols);
const CELL = 1;
const floor = new THREE.Mesh(new THREE.PlaneGeometry(cols * CELL + 2, rows * CELL + 2), sc.material);
const fg = floor.geometry;
fg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(fg.attributes.position.count * 3).fill(lit === houseStage ? 0.55 : 0.12), 3));
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
sc.scene.add(floor);

const labels = document.getElementById('labels');
const tri = (g) => (g.index ? g.index.count : g.attributes.position.count) / 3;
const placed = [];
items.forEach((m, i) => {
  const [id, vs] = m.name.split('__');
  const v = Number(vs);
  const p = getProp(id);
  const model = fromGltfMesh(m);
  const old = p ? p.geos[v] : null;
  model.computeBoundingBox();
  const size = model.boundingBox.getSize(new THREE.Vector3());
  const s = (CELL * 0.42) / Math.max(size.x, size.y, size.z);
  const cx = (i % cols) * CELL - (cols - 1) * CELL / 2;
  const cz = Math.floor(i / cols) * CELL - (rows - 1) * CELL / 2;
  const add = (geo, dx) => {
    const mesh = new THREE.Mesh(geo, sc.material);
    geo.computeBoundingBox();
    const b = geo.boundingBox;
    mesh.scale.setScalar(s);
    mesh.position.set(cx + dx - ((b.min.x + b.max.x) / 2) * s, -b.min.y * s, cz - ((b.min.z + b.max.z) / 2) * s);
    mesh.rotation.y = Number(q.get('ry') || 0.5);
    mesh.castShadow = true; mesh.receiveShadow = true;
    sc.scene.add(mesh);
  };
  if (old) add(old, -CELL * 0.24);
  add(model, old ? CELL * 0.24 : 0);
  placed.push({ name: m.name, pos: new THREE.Vector3(cx, 0, cz + CELL * 0.36),
    tris: `${old ? tri(old) : '-'} → ${tri(model)}` });
});

const span = Math.max(cols, rows * 1.6) * CELL;
sc.camera.position.set(0, span * 0.42, span * 0.5);
sc.camera.lookAt(0, 0, rows * 0.04);
sc.followSun(new THREE.Vector3(0, 0, 0), span / 9);
sc.post && (sc.post.ao.configuration.aoRadius = 0.06);
sc.resize();

function label() {
  labels.innerHTML = '';
  for (const p of placed) {
    const v = p.pos.clone().project(sc.camera);
    const d = document.createElement('div');
    d.textContent = `${p.name}  ${p.tris}`;
    d.style.left = `${(v.x * 0.5 + 0.5) * innerWidth}px`;
    d.style.top = `${(-v.y * 0.5 + 0.5) * innerHeight}px`;
    labels.appendChild(d);
  }
}
let n = 0;
(function loop() {
  sc.render();
  if (++n === 3) { label(); window.__sheetReady = true; }
  requestAnimationFrame(loop);
})();
