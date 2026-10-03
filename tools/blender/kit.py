"""
kit.py — the modelling vocabulary every prop script is written in.

Run by Blender headless (`tools/blender/build.mjs` drives it). Blender is Z-up;
glTF export converts to the game's Y-up. Everything here is in METRES and in
the Blender frame:

    X  = the prop's width      (game X)
    Y  = the prop's depth      (game -Z after export; sign does not matter,
                                the loader fits each axis to the catalogue box)
    Z  = the prop's height     (game Y)

Every primitive is created FINISHED: bevel applied, colour painted into the
`base` colour attribute, smooth-by-angle set. A prop is a list of those, passed
to `finish()`, which joins them, bakes ambient occlusion into a second colour
attribute on the GPU, and multiplies the two into `Col` — the one attribute
the game reads (COLOR_0).

Why bake AO into vertices: the screen-space AO in the game darkens where one
object meets another at the ball's scale. It cannot see the inside of a mug,
the gap under a chair seat or the groove between two book pages once they are
a few pixels across. Baked per vertex it costs nothing at runtime and survives
the prop being stuck on the ball at any angle.

Colours are given as sRGB hex, exactly like the old GeomBuilder props, and
stored LINEAR — glTF COLOR_0 is linear by spec and three reads it as such.
"""

import bpy
import bmesh
import math
from mathutils import Vector, Matrix, Euler

# ------------------------------------------------------------------ colour

def lin(h):
    """sRGB hex int -> linear (r, g, b)."""
    def ch(v):
        v = v / 255.0
        return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4
    return (ch((h >> 16) & 255), ch((h >> 8) & 255), ch(h & 255))


def mixc(a, b, t):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


# ------------------------------------------------------------------ scene

def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.samples = 64
    sc.cycles.use_denoising = False
    prefs = bpy.context.preferences.addons['cycles'].preferences
    for dev_type in ('OPTIX', 'CUDA'):
        try:
            prefs.compute_device_type = dev_type
            prefs.get_devices()
            gpus = [d for d in prefs.devices if d.type == dev_type]
            if gpus:
                for d in prefs.devices:
                    d.use = d.type == dev_type
                sc.cycles.device = 'GPU'
                break
        except Exception:
            continue
    # a neutral world so the AO bake has a sky to see
    w = bpy.data.worlds.new('w')
    sc.world = w
    w.use_nodes = True


def _link(obj):
    bpy.context.scene.collection.objects.link(obj)
    return obj


def _from_bmesh(bm, name='part'):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    return _link(bpy.data.objects.new(name, me))


def _place(obj, at=(0, 0, 0), rot=(0, 0, 0), scale=None):
    if scale is not None:
        obj.data.transform(Matrix.Diagonal((*scale, 1.0)))
    if any(rot):
        obj.data.transform(Euler(tuple(math.radians(r) for r in rot), 'XYZ').to_matrix().to_4x4())
    obj.data.transform(Matrix.Translation(Vector(at)))
    obj.data.update()
    return obj


def _bevel(obj, width, seg=2, angle=40):
    if width <= 0:
        return obj
    m = obj.modifiers.new('bevel', 'BEVEL')
    m.width = width
    m.segments = seg
    m.limit_method = 'ANGLE'
    m.angle_limit = math.radians(angle)
    m.profile = 0.5
    m.harden_normals = False
    _apply(obj)
    return obj


def _apply(obj):
    bpy.context.view_layer.objects.active = obj
    for o in bpy.context.selected_objects:
        o.select_set(False)
    obj.select_set(True)
    for m in list(obj.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)


def _smooth(obj, angle=35):
    bpy.context.view_layer.objects.active = obj
    for o in bpy.context.selected_objects:
        o.select_set(False)
    obj.select_set(True)
    try:
        bpy.ops.object.shade_smooth_by_angle(angle=math.radians(angle))
    except Exception:
        bpy.ops.object.shade_smooth()
    return obj


def paint(obj, color, fn=None):
    """Uniform colour, or fn(world_pos Vector) -> linear rgb for gradients."""
    me = obj.data
    attr = me.color_attributes.get('base') or me.color_attributes.new('base', 'FLOAT_COLOR', 'CORNER')
    c = color if isinstance(color, tuple) else lin(color)
    for poly in me.polygons:
        for li in poly.loop_indices:
            if fn is None:
                attr.data[li].color = (*c, 1.0)
            else:
                v = me.vertices[me.loops[li].vertex_index].co
                attr.data[li].color = (*fn(v), 1.0)
    return obj


def recolor(obj, fn):
    """fn(face_center Vector, normal Vector) -> linear rgb or None to keep."""
    me = obj.data
    attr = me.color_attributes['base']
    for poly in me.polygons:
        c = fn(poly.center, poly.normal)
        if c is None:
            continue
        c = c if isinstance(c, tuple) else lin(c)
        for li in poly.loop_indices:
            attr.data[li].color = (*c, 1.0)
    return obj


# ------------------------------------------------------------------ primitives
# `at` is the BOTTOM CENTRE for boxes, cylinders and lathes; the CENTRE for
# spheres and tori. `rot` is degrees XYZ applied before the move.

def box(size, at=(0, 0, 0), color=0xcccccc, bevel=None, seg=2, rot=(0, 0, 0), smooth=30):
    sx, sy, sz = size
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * sx, v.co.y * sy, v.co.z * sz + sz / 2))
    o = _from_bmesh(bm, 'box')
    if bevel is None:
        bevel = min(sx, sy, sz) * 0.12
    _bevel(o, bevel, seg)
    _place(o, at, rot)
    paint(o, color)
    return _smooth(o, smooth)


def cyl(r, h, at=(0, 0, 0), color=0xcccccc, seg=24, bevel=None, r2=None, rot=(0, 0, 0), smooth=40, caps=True):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=caps, cap_tris=False, segments=seg,
                          radius1=r, radius2=(r if r2 is None else r2), depth=h)
    for v in bm.verts:
        v.co.z += h / 2
    o = _from_bmesh(bm, 'cyl')
    if bevel is None:
        bevel = min(r, h) * 0.12
    _bevel(o, bevel, 2)
    _place(o, at, rot)
    paint(o, color)
    return _smooth(o, smooth)


def sphere(r, at=(0, 0, 0), color=0xcccccc, seg=24, scale=(1, 1, 1), rot=(0, 0, 0)):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=max(6, seg // 2), radius=r)
    o = _from_bmesh(bm, 'sphere')
    _place(o, at, rot, scale)
    paint(o, color)
    return _smooth(o, 80)


def torus(R, r, at=(0, 0, 0), color=0xcccccc, seg=32, rseg=12, rot=(0, 0, 0), arc=360):
    bm = bmesh.new()
    n = max(3, int(seg * arc / 360))
    rings = []
    closed = arc >= 360
    steps = n if closed else n + 1
    for i in range(steps):
        a = math.radians(arc) * i / n
        ring = []
        for j in range(rseg):
            b = 2 * math.pi * j / rseg
            p = Vector(((R + r * math.cos(b)) * math.cos(a), (R + r * math.cos(b)) * math.sin(a), r * math.sin(b)))
            ring.append(bm.verts.new(p))
        rings.append(ring)
    for i in range(steps if closed else steps - 1):
        a, b2 = rings[i], rings[(i + 1) % steps]
        for j in range(rseg):
            bm.faces.new((a[j], a[(j + 1) % rseg], b2[(j + 1) % rseg], b2[j]))
    if not closed:
        bm.faces.new(list(reversed(rings[0])))
        bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = _from_bmesh(bm, 'torus')
    _place(o, at, rot)
    paint(o, color)
    return _smooth(o, 80)


def lathe(profile, at=(0, 0, 0), color=0xcccccc, seg=32, rot=(0, 0, 0), smooth=50, close_top=False, close_bottom=True):
    """Revolve [(radius, z), ...] (bottom to top) about Z. Use it for anything
    turned: mugs, bottles, bowls, vases, lamp bases, teapot bodies."""
    bm = bmesh.new()
    rings = []
    for (rad, z) in profile:
        ring = []
        for j in range(seg):
            a = 2 * math.pi * j / seg
            ring.append(bm.verts.new((rad * math.cos(a), rad * math.sin(a), z)))
        rings.append(ring)
    for i in range(len(rings) - 1):
        a, b = rings[i], rings[i + 1]
        for j in range(seg):
            bm.faces.new((a[j], a[(j + 1) % seg], b[(j + 1) % seg], b[j]))
    if close_bottom and profile[0][0] > 1e-6:
        bm.faces.new(list(reversed(rings[0])))
    if close_top and profile[-1][0] > 1e-6:
        bm.faces.new(rings[-1])
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-7)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = _from_bmesh(bm, 'lathe')
    _place(o, at, rot)
    paint(o, color)
    return _smooth(o, smooth)


def extrude(poly, depth, at=(0, 0, 0), color=0xcccccc, bevel=None, rot=(0, 0, 0), smooth=30):
    """A flat outline [(x, y), ...] (counter-clockwise) extruded up Z by depth."""
    bm = bmesh.new()
    bottom = [bm.verts.new((x, y, 0)) for (x, y) in poly]
    face = bm.faces.new(bottom)
    res = bmesh.ops.extrude_face_region(bm, geom=[face])
    top = [e for e in res['geom'] if isinstance(e, bmesh.types.BMVert)]
    for v in top:
        v.co.z += depth
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = _from_bmesh(bm, 'extrude')
    if bevel is None:
        bevel = depth * 0.2
    _bevel(o, bevel, 2)
    _place(o, at, rot)
    paint(o, color)
    return _smooth(o, smooth)


def tube(points, r, color=0xcccccc, seg=10, closed=False, taper=None):
    """A round tube along a polyline — handles, wires, frames, glasses."""
    cu = bpy.data.curves.new('tube', 'CURVE')
    cu.dimensions = '3D'
    cu.bevel_depth = r
    cu.bevel_resolution = max(1, seg // 4)
    cu.use_fill_caps = True
    sp = cu.splines.new('POLY')
    sp.points.add(len(points) - 1)
    for i, p in enumerate(points):
        sp.points[i].co = (*p, 1.0)
        if taper:
            sp.points[i].radius = taper(i / max(1, len(points) - 1))
    sp.use_cyclic_u = closed
    o = _link(bpy.data.objects.new('tube', cu))
    bpy.context.view_layer.objects.active = o
    for x in bpy.context.selected_objects:
        x.select_set(False)
    o.select_set(True)
    bpy.ops.object.convert(target='MESH')
    o = bpy.context.view_layer.objects.active
    paint(o, color)
    return _smooth(o, 60)


def arc_points(R, a0, a1, n=12, center=(0, 0, 0), plane='XZ'):
    """Points round a circular arc, degrees, for `tube` handles."""
    pts = []
    for i in range(n + 1):
        a = math.radians(a0 + (a1 - a0) * i / n)
        u, v = R * math.cos(a), R * math.sin(a)
        if plane == 'XZ':
            pts.append((center[0] + u, center[1], center[2] + v))
        elif plane == 'YZ':
            pts.append((center[0], center[1] + u, center[2] + v))
        else:
            pts.append((center[0] + u, center[1] + v, center[2]))
    return pts


def subdivide(obj, levels=1):
    m = obj.modifiers.new('sub', 'SUBSURF')
    m.levels = levels
    m.render_levels = levels
    _apply(obj)
    return _smooth(obj, 80)


def deform(obj, fn):
    """fn(Vector) -> Vector, applied to every vertex — squash, bend, bulge."""
    for v in obj.data.vertices:
        v.co = fn(v.co.copy())
    obj.data.update()
    return obj


def mirror_x(obj):
    """A copy of obj mirrored across X=0."""
    o = obj.copy()
    o.data = obj.data.copy()
    _link(o)
    o.data.transform(Matrix.Scale(-1, 4, Vector((1, 0, 0))))
    o.data.flip_normals()
    o.data.update()
    return o


# ------------------------------------------------------------------ finish

def finish(parts, name, ao=0.75, ao_dist=None):
    """Join parts into one mesh named `name`, bake AO into it, write `Col`.

    `ao` is how far the occlusion darkens (0 = none, 1 = full black in a fully
    enclosed corner). `ao_dist` defaults to a quarter of the prop's largest
    dimension, so a thumbtack and a fridge occlude in proportion.
    """
    for o in bpy.context.selected_objects:
        o.select_set(False)
    for p in parts:
        p.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    if len(parts) > 1:
        bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    obj.name = name
    obj.data.name = name
    me = obj.data

    # triangulate now so the bake samples the faces that will be exported
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.triangulate(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()

    dims = obj.dimensions
    if ao_dist is None:
        ao_dist = max(dims) * 0.25
    occl = me.color_attributes.new('ao', 'FLOAT_COLOR', 'CORNER')
    me.color_attributes.active_color = occl
    bpy.context.scene.world.light_settings.distance = ao_dist
    # bake against THIS prop only: everything already finished stays in the
    # scene for export, and would otherwise occlude its neighbours
    others = [o for o in bpy.context.scene.objects if o is not obj]
    for o in others:
        o.hide_render = True
    if ao > 0:
        mat = bpy.data.materials.new(name + '_bake')
        me.materials.clear()
        me.materials.append(mat)
        try:
            bpy.ops.object.bake(type='AO', target='VERTEX_COLORS')
        except Exception as e:
            print('BAKE-FAILED', name, e)
            for d in occl.data:
                d.color = (1, 1, 1, 1)
        me.materials.clear()
    else:
        for d in occl.data:
            d.color = (1, 1, 1, 1)

    base = me.color_attributes['base']
    col = me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
    for i in range(len(col.data)):
        b = base.data[i].color
        a = occl.data[i].color[0]
        k = 1.0 - ao * (1.0 - a)
        col.data[i].color = (b[0] * k, b[1] * k, b[2] * k, 1.0)
    me.color_attributes.remove(me.color_attributes['ao'])
    me.color_attributes.remove(me.color_attributes['base'])
    me.color_attributes.active_color = me.color_attributes['Col']
    me.color_attributes.active_color_name = 'Col'
    try:
        me.color_attributes.render_color_index = me.color_attributes.find('Col')
    except Exception:
        pass
    while len(me.uv_layers):
        me.uv_layers.remove(me.uv_layers[0])
    obj.select_set(False)
    obj.hide_render = True
    return obj


def export(path, names=None):
    for o in bpy.context.scene.objects:
        o.select_set(names is None or o.name in names)
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', use_selection=True, export_apply=True,
        export_materials='NONE', export_vertex_color='NAME', export_vertex_color_name='Col',
        export_all_vertex_colors=False, export_active_vertex_color_when_no_material=True,
        export_texcoords=False, export_normals=True, export_yup=True,
        export_meshopt_compression_enable=False,
    )
