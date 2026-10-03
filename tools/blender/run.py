"""Blender-side entry point for build.mjs.

    blender -b --python run.py -- <props/stage.py> <out.glb> <only,ids>

Loads the stage script, which defines MODELS = {prop_id: fn(variant) -> [parts]}
and optionally VARIANTS = {prop_id: n}. Every (prop, variant) becomes one mesh
named `<id>__<v>` in the exported GLB.
"""
import sys
import os
import json
import runpy
import traceback

argv = sys.argv[sys.argv.index('--') + 1:]
script, out = argv[0], argv[1]
only = [s for s in (argv[2] if len(argv) > 2 else '').split(',') if s]
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import kit  # noqa: E402

here = os.path.dirname(os.path.abspath(__file__))
kit.SPECS = json.load(open(os.path.join(here, 'out', 'specs.json')))
pal = json.load(open(os.path.join(here, 'out', 'palette.json')))
kit.C = type('C', (), pal['C'])
kit.SETS = pal['SETS']

kit.reset()
scripts = ([os.path.join(script, f) for f in sorted(os.listdir(script)) if f.endswith('.py') and not f.startswith('_')]
           if os.path.isdir(script) else [script])
models, finish_opts = {}, {}
for sp in scripts:
    ns = runpy.run_path(sp, init_globals={'kit': kit})
    for k in ns.get('MODELS', {}):
        if k in models:
            print(f'ERROR {k} defined twice (second in {os.path.basename(sp)})')
    models.update(ns.get('MODELS', {}))
    finish_opts.update(ns.get('FINISH', {}))
names = []
for pid, fn in models.items():
    if only and pid not in only:
        continue
    spec = kit.SPECS.get(pid)
    if not spec:
        print(f'ERROR unknown prop id {pid}')
        continue
    for v in range(spec['variants']):
        name = f'{pid}__{v}'
        try:
            parts = fn(v)
            obj = kit.finish(parts, name, **finish_opts.get(pid, {}))
            d = obj.dimensions
            want = spec['boxes'][v]['size']   # game frame: x, y(up), z
            print(f'MODEL {name:22s} tris {len(obj.data.polygons):6d}  '
                  f'size {d.x:.4f} x {d.z:.4f} x {d.y:.4f}  want {want[0]:.4f} x {want[1]:.4f} x {want[2]:.4f}')
            names.append(name)
        except Exception:
            print(f'ERROR building {name}')
            traceback.print_exc(file=sys.stdout)

kit.export(out, set(names))
