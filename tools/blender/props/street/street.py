"""Town and city street props, modelled.

Frame reminder (see kit.py): Blender Z is up, X is the prop's width, and the
game's FRONT (+Z) is Blender -Y. Sizes are real metres, matched to
out/specs.json — the procedural box each archetype already occupies.
"""
import math
import random
import bmesh
from mathutils import Vector, Euler
from kit import (box, cyl, sphere, torus, lathe, extrude, tube, arc_points,
                 subdivide, deform, recolor, lin, mixc, paint, C, SETS)
from kit import _from_bmesh, _smooth, _bevel, _place

MODELS = {}
FINISH = {}


def model(pid, **finish):
    def wrap(fn):
        MODELS[pid] = fn
        if finish:
            FINISH[pid] = finish
        return fn
    return wrap


# ---------------------------------------------------------------- helpers

def shade(col, t):
    """col darkened by t (0..1) — a linear tuple, ready for any primitive."""
    return mixc(lin(col), (0, 0, 0), t)


def tint(col, t):
    """col lightened towards white by t."""
    return mixc(lin(col), (1, 1, 1), t)


def rrect(w, d, r, n=4, cx=0.0, cy=0.0):
    """A rounded-rectangle outline (counter-clockwise), for `extrude`/`prism`."""
    r = min(r, w / 2 - 1e-5, d / 2 - 1e-5)
    pts = []
    for qx, qy, a0 in ((1, 1, 0), (-1, 1, 90), (-1, -1, 180), (1, -1, 270)):
        ox, oy = cx + qx * (w / 2 - r), cy + qy * (d / 2 - r)
        for i in range(n + 1):
            a = math.radians(a0 + 90 * i / n)
            pts.append((ox + r * math.cos(a), oy + r * math.sin(a)))
    return pts


def ngon(r, n, a0=0.0):
    """A regular polygon outline, counter-clockwise."""
    return [(r * math.cos(math.radians(a0) + 2 * math.pi * i / n), r * math.sin(math.radians(a0) + 2 * math.pi * i / n))
            for i in range(n)]


def prism(poly, h, at=(0, 0, 0), color=0xcccccc, bevel=0.0, seg=1, rot=(0, 0, 0), smooth=30):
    """`extrude` with a choice of bevel segments: one segment rounds a rim at
    half the cost, and none at all is right for a thin colour block."""
    bm = bmesh.new()
    face = bm.faces.new([bm.verts.new((x, y, 0)) for (x, y) in poly])
    res = bmesh.ops.extrude_face_region(bm, geom=[face])
    for e in res['geom']:
        if isinstance(e, bmesh.types.BMVert):
            e.co.z += h
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = _from_bmesh(bm, 'prism')
    _bevel(o, bevel, seg)
    _place(o, at, rot)
    paint(o, color)
    return _smooth(o, smooth)


def slab(w, d, h, r, at=(0, 0, 0), color=0xcccccc, bevel=None, n=4, seg=1, rot=(0, 0, 0)):
    """A rounded-corner slab: plan corners of radius r, edges bevelled."""
    return prism(rrect(w, d, r, n), h, at=at, color=color,
                 bevel=(min(h * 0.3, r * 0.8) if bevel is None else bevel), seg=seg, rot=rot)


def plate(w, h, t, at, color, r=None, n=3, bevel=None):
    """A flat panel standing upright facing -Y (a sign, a label, a screen):
    w wide, h tall, t thick. `at` is the centre of its BACK face."""
    r = min(w, h) * 0.12 if r is None else r
    o = prism(rrect(w, h, r, n), t, color=color, bevel=(min(t * 0.35, r * 0.6) if bevel is None else bevel), seg=1,
              rot=(90, 0, 0))
    deform(o, lambda p: p.__class__((p.x + at[0], p.y + at[1], p.z + at[2])))
    return o


def chip(w, h, at, color, t=0.004, r=None):
    """A thin unbevelled colour block facing -Y, centre of its back at `at`."""
    return plate(w, h, t, at, color, r=r, n=2, bevel=0)


def disc(r, h, at=(0, 0, 0), color=0xcccccc, seg=24, rot=(0, 0, 0)):
    """A flat round face that bakes evenly (has an inner ring of vertices)."""
    return lathe([(0.0, 0.0), (r, 0.0), (r, h), (r * 0.62, h), (0.0, h)], at=at, color=color, seg=seg, rot=rot, smooth=30)


def capsule(p0, p1, r, color=0xcccccc, seg=10, r1=None, rings=3):
    """A rounded limb from p0 to p1 (radius r at p0, r1 at p1)."""
    r1 = r if r1 is None else r1
    a, b = Vector(p0), Vector(p1)
    L = (b - a).length
    prof = [(0.0, -r)]
    for i in range(1, rings + 1):
        t = math.radians(-90 + 90 * i / rings)
        prof.append((r * math.cos(t), r * math.sin(t)))
    for i in range(0, rings + 1):
        t = math.radians(90 * i / rings)
        prof.append((r1 * math.cos(t), L + r1 * math.sin(t)))
    prof[-1] = (0.0, L + r1)
    o = lathe(prof, color=color, seg=seg, close_bottom=False, smooth=70)
    q = (b - a).normalized().to_track_quat('Z', 'Y')
    deform(o, lambda p: q @ p + a)
    return o


def rod(p0, p1, r, color=0xcccccc, seg=10, bevel=None, r1=None):
    """A straight cylinder from p0 to p1 — poles, rails, axles, arms."""
    a, b = Vector(p0), Vector(p1)
    L = (b - a).length
    o = cyl(r, L, color=color, seg=seg, bevel=(min(r, L) * 0.15 if bevel is None else bevel), r2=r1)
    q = (b - a).normalized().to_track_quat('Z', 'Y')
    deform(o, lambda p: q @ p + a)
    return o


def ball(r, at, color, seg=12, scale=(1, 1, 1), rot=(0, 0, 0), rings=None):
    """A sphere with seg/2 rings — half the triangles of kit's for small bits."""
    rings = rings or max(3, seg // 2)
    prof = [(r * math.sin(math.pi * i / rings), -r * math.cos(math.pi * i / rings)) for i in range(rings + 1)]
    o = lathe(prof, color=color, seg=seg, close_bottom=False, smooth=80)
    m = Euler(tuple(math.radians(a) for a in rot), 'XYZ').to_matrix()
    deform(o, lambda p: m @ Vector((p.x * scale[0], p.y * scale[1], p.z * scale[2])) + Vector(at))
    return o


def _eye(x, y, z, r, col=0x241f28):
    """A glossy dot eye with a highlight, facing -Y."""
    return [ball(r, at=(x, y, z), color=col, seg=8, scale=(1, 0.55, 1.25)),
            ball(r * 0.35, at=(x + r * 0.3, y - r * 0.45, z + r * 0.45), color=0xffffff, seg=6)]


def move(o, d):
    deform(o, lambda p: p.__class__((p.x + d[0], p.y + d[1], p.z + d[2])))
    return o


def zband(obj, bands, rmin=0.0):
    """Recolour lathe faces whose centre z lies in one of [(z0, z1, col), ...]."""
    def f(c, n):
        if math.hypot(c.x, c.y) < rmin:
            return None
        for z0, z1, col in bands:
            if z0 < c.z < z1:
                return col
        return None
    return recolor(obj, f)


# ---------------------------------------------------------------- small street clutter

@model('trafficcone', ao=0.6)
def trafficcone(v):
    o = C.orange
    base_h = 0.036
    zb, zt = base_h, 0.655
    rb, rt = 0.132, 0.03

    def r(z):
        return rb + (rt - rb) * (z - zb) / (zt - zb)
    # rings at the band edges so the reflective collars come out crisp
    zs = [zb, 0.12, 0.25, 0.33, 0.40, 0.46, 0.52, 0.6]
    prof = [(rb + 0.012, zb - 0.006), (rb + 0.004, zb + 0.004)] + [(r(z), z) for z in zs[1:]]
    prof += [(rt + 0.004, 0.632), (rt * 0.85, 0.650), (rt * 0.45, 0.6605), (0.0, 0.661)]
    body = lathe(prof, color=o, seg=24, close_bottom=False)
    zband(body, [(0.25, 0.33, C.white), (0.40, 0.46, C.white)])
    # the square foot, with a darker moulded collar where the cone sits
    foot = slab(0.34, 0.34, base_h, 0.05, color=shade(o, 0.12), n=3, bevel=0.01)
    collar = lathe([(rb + 0.03, base_h - 0.004), (rb + 0.026, base_h + 0.006), (rb + 0.008, base_h + 0.016),
                    (rb - 0.004, base_h + 0.018)], color=shade(o, 0.12), seg=24, close_bottom=False)
    return [body, foot, collar]


@model('bollard', ao=0.65)
def bollard(v):
    s = C.steelDark
    # a flared, slightly tapered cast post: a dark foot, two raised rings
    # framing the yellow reflector band, a necked crown and a little knob
    prof = [(0.0, 0.0), (0.091, 0.0), (0.091, 0.035), (0.082, 0.06), (0.078, 0.08), (0.072, 0.56),
            (0.084, 0.568), (0.084, 0.59), (0.074, 0.6), (0.074, 0.7), (0.084, 0.71), (0.084, 0.732),
            (0.07, 0.742), (0.066, 0.752), (0.08, 0.77)]
    for i in range(1, 5):
        a = math.radians(90 * i / 5)
        prof.append((0.08 * math.cos(a), 0.77 + 0.07 * math.sin(a)))
    prof += [(0.016, 0.842), (0.018, 0.852), (0.012, 0.866), (0.0, 0.871)]
    post = lathe(prof, color=s, seg=20)
    zband(post, [(0.598, 0.702, C.yellow), (-1, 0.07, shade(s, 0.3)), (0.562, 0.598, shade(s, 0.3)),
                 (0.702, 0.745, shade(s, 0.3)), (0.76, 1.0, tint(s, 0.15))])
    return [post]


@model('firehydrant', ao=0.7)
def firehydrant(v):
    red, dark = C.red, C.redDark
    parts = []
    # flanged foot, barrel, waist flange and bonnet dome in one turned piece
    prof = [(0.0, 0.0), (0.16, 0.0), (0.162, 0.03), (0.15, 0.056), (0.118, 0.066), (0.112, 0.1), (0.108, 0.3),
            (0.11, 0.42), (0.112, 0.46), (0.118, 0.485), (0.137, 0.492), (0.138, 0.52), (0.118, 0.53)]
    for i in range(1, 5):
        a = math.radians(90 * i / 5)
        prof.append((0.118 * math.cos(a), 0.53 + 0.095 * math.sin(a)))
    prof.append((0.0, 0.625))
    body = lathe(prof, color=red, seg=20)
    zband(body, [(-1, 0.064, dark), (0.487, 0.528, dark), (0.42, 0.46, C.white)])
    nut = prism(ngon(0.036, 5, 90), 0.066, at=(0, 0, 0.615), color=dark, bevel=0.008, seg=1)
    parts += [body, nut]
    # four bolts round the foot flange
    for i in range(4):
        a = 2 * math.pi * (i + 0.5) / 4
        parts.append(ball(0.014, at=(0.142 * math.cos(a), 0.142 * math.sin(a), 0.058), color=shade(dark, 0.2), seg=6,
                          scale=(1, 1, 0.6), rings=3))

    def outlet(axis, r, cap_r, x0, x1, z):
        # a turned spout and cap along +axis, from x0 to x1
        prof = [(r, x0), (r, x1 - 0.022), (cap_r, x1 - 0.02), (cap_r, x1 - 0.004), (cap_r * 0.8, x1), (0.0, x1)]
        o = lathe(prof, color=red, seg=12, close_bottom=False)
        zband(o, [(x1 - 0.021, 1.0, dark)])
        nut = prism(ngon(cap_r * 0.42, 5, 90), 0.014, at=(0, 0, x1 - 0.004), color=dark, bevel=0.004)
        rot = {'x': Euler((0, math.radians(90), 0)), '-x': Euler((0, math.radians(-90), 0)),
               '-y': Euler((math.radians(90), 0, 0))}[axis].to_matrix()
        for p in (o, nut):
            deform(p, lambda q: rot @ q + Vector((0, 0, z)))
        return [o, nut]
    parts += outlet('x', 0.046, 0.052, 0.09, 0.168, 0.38)
    parts += outlet('-x', 0.046, 0.052, 0.09, 0.168, 0.38)
    parts += outlet('-y', 0.056, 0.064, 0.08, 0.17, 0.31)
    return parts


@model('mailbox', ao=0.7)
def mailbox(v):
    red, base = C.red, C.charcoal
    R = 0.25
    prof = [(0.0, 0.0), (0.235, 0.0), (0.24, 0.02), (0.24, 0.17), (0.25, 0.2), (R, 0.21),
            (R, 1.23), (0.262, 1.24), (0.264, 1.275), (0.252, 1.29)]
    for i in range(1, 6):
        a = math.radians(90 * i / 6)
        prof.append((0.252 * math.cos(a), 1.29 + 0.24 * math.sin(a)))
    prof.append((0.0, 1.532))
    body = lathe(prof, color=red, seg=20)
    zband(body, [(-1, 0.2, base), (1.232, 1.288, shade(red, 0.18))])
    parts = [body]
    # the posting slot under a little hood, the collection plate below it
    parts.append(slab(0.25, 0.06, 0.07, 0.02, at=(0, -0.24, 1.045), color=red, bevel=0.012, n=2))
    parts.append(box((0.22, 0.03, 0.028), at=(0, -0.262, 1.01), color=C.black, bevel=0.006, seg=1))
    parts.append(chip(0.2, 0.14, at=(0, -0.246, 0.8), color=C.white, t=0.008, r=0.02))
    parts.append(chip(0.14, 0.03, at=(0, -0.253, 0.81), color=C.charcoal, t=0.004, r=0.006))
    # a round crest on the door and the door's keyhole
    parts.append(disc(0.045, 0.01, at=(0, -0.244, 0.6), color=C.gold, seg=14, rot=(90, 0, 0)))
    parts.append(ball(0.012, at=(0.0, -0.25, 0.48), color=C.black, seg=6, scale=(1, 0.5, 1.4), rings=3))
    return parts


@model('trashcan_street', ao=0.75)
def trashcan_street(v):
    col = C.greenDark if v else C.steelDark
    rim = C.charcoal
    F = 9
    # a fluted body (nine vertical slats, every other one a shade darker),
    # with a dark foot ring and a rail band turned into the same profile
    prof = [(0.0, 0.0), (0.245, 0.0), (0.258, 0.02), (0.258, 0.06), (0.25, 0.075), (0.256, 0.09),
            (0.26, 0.48), (0.276, 0.488), (0.276, 0.522), (0.262, 0.53), (0.268, 0.775)]
    body = lathe(prof, color=col, seg=36)

    def flute(p):
        rr = math.hypot(p.x, p.y)
        if p.z < 0.08 or rr < 1e-6 or 0.475 < p.z < 0.535:
            return p
        k = 1 + 0.04 * math.cos(F * math.atan2(p.y, p.x))
        return p.__class__((p.x * k, p.y * k, p.z))
    deform(body, flute)
    recolor(body, lambda c, n: rim if c.z < 0.08 or 0.482 < c.z < 0.528 else
            (shade(col, 0.18) if math.cos(F * math.atan2(c.y, c.x)) < -0.3 else None))
    # the domed lid with its posting hole
    lid = lathe([(0.0, 0.77), (0.282, 0.77), (0.286, 0.795), (0.272, 0.818), (0.2, 0.84), (0.13, 0.851),
                 (0.118, 0.834), (0.0, 0.83)], color=rim, seg=24)
    recolor(lid, lambda c, n: C.black if math.hypot(c.x, c.y) < 0.124 else None)
    return [body, lid]


@model('oildrum', ao=0.7)
def oildrum(v):
    col = [C.blue, C.red, C.yellow][v]
    hoop = C.steelDark
    R = 0.296
    prof = [(0.0, 0.0), (0.3, 0.0), (0.308, 0.016), (R, 0.04),
            (R, 0.195), (0.313, 0.22), (R, 0.245),
            (R, 0.34), (R, 0.54),
            (R, 0.635), (0.313, 0.66), (R, 0.685),
            (R, 0.876), (0.31, 0.896), (0.302, 0.916), (0.0, 0.908)]
    drum = lathe(prof, color=col, seg=22)
    zband(drum, [(0.19, 0.25, hoop), (0.63, 0.69, hoop), (-1, 0.038, hoop), (0.88, 1.0, hoop)], rmin=0.285)
    # a pale label panel on the front, between the hoops
    recolor(drum, lambda c, n: C.cream if 0.34 < c.z < 0.54 and c.y < 0 and abs(math.atan2(-c.y, c.x) - math.pi / 2) < 0.5
            and math.hypot(c.x, c.y) > 0.28 else None)
    parts = [drum]
    # the two bungs on the lid
    parts.append(cyl(0.05, 0.014, at=(0.15, 0.06, 0.906), color=hoop, seg=12, bevel=0))
    parts.append(cyl(0.028, 0.012, at=(-0.16, 0.08, 0.906), color=hoop, seg=10, bevel=0))
    parts.append(ball(0.02, at=(0.15, 0.06, 0.92), color=C.charcoal, seg=8, scale=(1, 1, 0.4), rings=3))
    return parts


# ---------------------------------------------------------------- more helpers

def outline(pts, w):
    """A polyline [(u, v), ...] thickened to a closed outline w wide (mitred)."""
    n = len(pts)
    left, right = [], []
    for i in range(n):
        p = Vector(pts[i])
        d0 = (Vector(pts[i]) - Vector(pts[i - 1])).normalized() if i > 0 else None
        d1 = (Vector(pts[i + 1]) - Vector(pts[i])).normalized() if i < n - 1 else None
        if d0 is None:
            d = d1
        elif d1 is None:
            d = d0
        else:
            d = (d0 + d1).normalized()
        nrm = Vector((-d.y, d.x))
        k = 1.0
        if d0 is not None and d1 is not None:
            k = 1.0 / max(0.35, Vector((-d0.y, d0.x)).dot(nrm))
        left.append(p + nrm * (w / 2 * k))
        right.append(p - nrm * (w / 2 * k))
    return [(q.x, q.y) for q in left] + [(q.x, q.y) for q in reversed(right)]


def side_bar(pts, w, t, x0, color, bevel=None):
    """A flat cast bar following a (y, z) polyline, t thick along X at x0 —
    bench ends, lamp brackets, frames."""
    o = prism(outline(pts, w), t, color=color, bevel=(min(w, t) * 0.25 if bevel is None else bevel), seg=1)
    deform(o, lambda p: p.__class__((p.z - t / 2 + x0, p.x, p.y)))
    return o


def gridbox(size, cells, at=(0, 0, 0), color=0xcccccc, bevel=0.0, seg=1, smooth=30):
    """A box whose faces are divided into a grid — so windows, bricks and
    panels can be painted on with `recolor`, and so a big flat pane has
    vertices in its middle for the AO bake (with corners only, the shadow of
    whatever frames it is smeared right across). `cells` is, per axis, either
    a count of equal cells or a list of cut positions in the box's own frame
    (x and y about the centre, z up from the base)."""
    sx, sy, sz = size
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for vv in bm.verts:
        vv.co = Vector((vv.co.x * sx, vv.co.y * sy, vv.co.z * sz + sz / 2))
    for axis, n, L, off in ((0, cells[0], sx, 0.0), (1, cells[1], sy, 0.0), (2, cells[2], sz, sz / 2)):
        cuts = n if isinstance(n, (list, tuple)) else [-L / 2 + L * i / n + off for i in range(1, n)]
        for c in cuts:
            co = [0, 0, 0]
            co[axis] = c
            no = [0, 0, 0]
            no[axis] = 1
            geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
            bmesh.ops.bisect_plane(bm, geom=geom, plane_co=co, plane_no=no)
    o = _from_bmesh(bm, 'gridbox')
    _bevel(o, bevel, seg)
    _place(o, at)
    paint(o, color)
    return _smooth(o, smooth)


def blob(r, at, color, seg=10, scale=(1, 1, 1), wobble=0.12, seed=0):
    """A lumpy ball — foliage, shrubs, hedges."""
    o = ball(r, at=(0, 0, 0), color=color, seg=seg, scale=scale)
    rr = random.Random(seed)
    ph = [rr.uniform(0, 6.28) for _ in range(3)]

    def f(p):
        k = 1 + wobble * (math.sin(p.x / r * 3.1 + ph[0]) * math.sin(p.y / r * 2.7 + ph[1]) * math.cos(p.z / r * 2.9 + ph[2]))
        return p.__class__((p.x * k + at[0], p.y * k + at[1], p.z * k + at[2]))
    deform(o, f)
    return o


def grad(obj, lo, hi, z0, z1):
    """Repaint obj with a vertical gradient from lo (at z0) to hi (at z1)."""
    a, b = (lo if isinstance(lo, tuple) else lin(lo)), (hi if isinstance(hi, tuple) else lin(hi))
    return paint(obj, 0, lambda p: mixc(a, b, min(1.0, max(0.0, (p.z - z0) / (z1 - z0)))))


# ---------------------------------------------------------------- park and garden

@model('bench', ao=0.7)
def bench(v):
    wood, iron = C.wood, C.steelDark
    parts = []
    # cast-iron ends: a front leg that becomes the armrest, a back leg that
    # sweeps up into the backrest, and the seat rail between them
    for x in (-0.7, 0.7):
        parts.append(side_bar([(-0.215, 0.0), (-0.2, 0.3), (-0.205, 0.6), (-0.15, 0.645), (0.05, 0.65), (0.14, 0.62)],
                              0.05, 0.05, x, iron))
        parts.append(side_bar([(0.205, 0.0), (0.16, 0.25), (0.15, 0.43), (0.2, 0.7), (0.235, 0.9)], 0.055, 0.05, x, iron))
        parts.append(side_bar([(-0.215, 0.415), (0.17, 0.415)], 0.05, 0.05, x, iron))
        # little feet
        for y in (-0.215, 0.205):
            parts.append(box((0.075, 0.08, 0.025), at=(x, y, 0.0), color=shade(iron, 0.3), bevel=0))
    # seat slats, then three back slats leaning with the backrest
    for i, y in enumerate((-0.19, -0.075, 0.04, 0.155)):
        parts.append(box((1.6, 0.1, 0.04), at=(0, y, 0.44), color=mixc(lin(wood), lin(C.woodDark), 0.12 * (i % 2)),
                         bevel=0.012, seg=1))
    for i, z in enumerate((0.56, 0.69, 0.82)):
        sl = box((1.6, 0.03, 0.105), at=(0, 0, z), color=mixc(lin(wood), lin(C.woodDark), 0.12 * (i % 2)),
                 bevel=0.01, seg=1, rot=(-12, 0, 0))
        move(sl, (0, 0.19 + (z - 0.56) * 0.17, 0))
        parts.append(sl)
    return parts


@model('planterbox', ao=0.7)
def planterbox(v):
    con, dark = C.concrete, C.concreteD
    rnd = random.Random(7)
    parts = []
    # a turned concrete tub with a heavy lip, soil, and a round clipped shrub
    pot = lathe([(0.0, 0.0), (0.3, 0.0), (0.33, 0.02), (0.36, 0.3), (0.37, 0.38), (0.41, 0.385), (0.415, 0.44),
                 (0.4, 0.455), (0.36, 0.455), (0.355, 0.42), (0.0, 0.42)], color=con, seg=24)
    # vertical grooves round the tub as darker panels, a dark foot and lip
    recolor(pot, lambda c, n: shade(con, 0.1) if 0.03 < c.z < 0.37 and int((math.atan2(c.y, c.x) + math.pi) / (2 * math.pi) * 12) % 2 else None)
    zband(pot, [(-1, 0.025, dark), (0.38, 0.46, dark)])
    recolor(pot, lambda c, n: C.brown if c.z > 0.41 and math.hypot(c.x, c.y) < 0.352 else None)
    parts.append(pot)
    bush = blob(0.32, at=(0, 0, 0.7), color=C.leaf, seg=14, scale=(1.0, 1.0, 0.95), wobble=0.1, seed=3)
    grad(bush, shade(C.leafDark, 0.1), C.leaf, 0.42, 0.95)
    parts.append(bush)
    for i in range(5):
        a = 2 * math.pi * i / 5 + rnd.uniform(-0.3, 0.3)
        rr = rnd.uniform(0.14, 0.18)
        b = blob(rr, at=(math.cos(a) * 0.25, math.sin(a) * 0.25, 0.56 + rnd.uniform(0.0, 0.18)), color=C.leaf, seg=10,
                 wobble=0.12, seed=i + 10)
        grad(b, shade(C.leafDark, 0.05), tint(C.leaf, 0.08), 0.42, 0.9)
        parts.append(b)
    # a few little white blossoms dotted on top
    for i in range(6):
        a = 2 * math.pi * i / 6 + 0.4
        rr = 0.2 if i % 2 else 0.12
        z = 0.7 + math.sqrt(max(0.0, 0.32 ** 2 - rr ** 2)) * 0.92
        parts.append(ball(0.03, at=(math.cos(a) * rr, math.sin(a) * rr, z), color=C.white, seg=6, rings=3,
                          scale=(1, 1, 0.6)))
    return parts


def flower(x, y, z0, h, col, rnd, R=0.045):
    """A cartoon daisy: a stem, a five-petal disc tipped to the sky, a centre."""
    parts = []
    lean = (rnd.uniform(-0.025, 0.025), rnd.uniform(-0.025, 0.025))
    top = Vector((x + lean[0], y + lean[1], z0 + h))
    parts.append(rod((x, y, z0), top, 0.006, color=C.greenDark, seg=4, bevel=0))
    pet = []
    for i in range(10):
        a = 2 * math.pi * i / 10
        rr = R if i % 2 == 0 else R * 0.5
        pet.append((rr * math.cos(a), rr * math.sin(a)))
    head = [prism(pet, 0.01, at=(0, 0, -0.005), color=col, bevel=0),
            ball(R * 0.36, at=(0, 0, 0.006), color=C.yellow if col != C.yellow else C.orange, seg=6, rings=3,
                 scale=(1, 1, 0.6))]
    tilt = Euler((lean[1] * -8, lean[0] * 8, rnd.uniform(0, 6.28))).to_matrix()
    for o in head:
        deform(o, lambda p: tilt @ p + top)
    return parts + head


@model('flowerbed', ao=0.7)
def flowerbed(v):
    brick = C.brick
    rnd = random.Random(11)
    parts = []
    # a raised brick bed: half-brick grid so alternate courses can stagger
    W, D, H = 0.9, 0.5, 0.27
    bed = gridbox((W, D, H), (12, 6, 4), color=brick, bevel=0.0)

    def bricks(c, n):
        if n.z > 0.5 or n.z < -0.5:
            return None
        row = int(c.z / (H / 4))
        u = c.x if abs(n.y) > 0.5 else c.y
        col = int(math.floor((u + 2) / 0.075 + (row % 2))) // 2
        return shade(brick, 0.14) if (col + row) % 2 else None
    recolor(bed, bricks)
    parts.append(bed)
    # pale coping round the top and the soil inside it
    for s in (-1, 1):
        parts.append(box((W + 0.02, 0.07, 0.035), at=(0, s * (D / 2 - 0.025), H), color=C.concrete, bevel=0.01, seg=1))
        parts.append(box((0.07, D - 0.08, 0.035), at=(s * (W / 2 - 0.025), 0, H), color=C.concrete, bevel=0.01, seg=1))
    parts.append(box((W - 0.1, D - 0.1, 0.03), at=(0, 0, H + 0.005), color=C.brown, bevel=0.01, seg=1))
    cols = [C.hotpink, C.yellow, C.white, C.violet, C.orange]
    spots = [(-0.34, -0.13), (-0.22, 0.11), (-0.12, -0.1), (-0.02, 0.12), (0.1, -0.12), (0.2, 0.1), (0.34, -0.12),
             (-0.34, 0.12), (0.06, 0.0), (0.33, 0.12), (-0.2, -0.01), (0.22, -0.02)]
    for i, (x, y) in enumerate(spots):
        h = 0.1 + rnd.random() * 0.12
        parts += flower(x + rnd.uniform(-0.02, 0.02), y + rnd.uniform(-0.02, 0.02), H + 0.03, h,
                        cols[(v + i) % len(cols)], rnd)
    # a couple of leafy tufts between the flowers
    for i, (x, y) in enumerate(((-0.28, 0.0), (-0.06, 0.06), (0.15, 0.04), (0.29, -0.02), (-0.05, -0.13), (0.27, 0.15))):
        parts.append(blob(0.075, at=(x, y, H + 0.04), color=C.leaf, seg=8, scale=(1.2, 1.0, 0.75), seed=i))
    return parts


@model('fence_panel', ao=0.6)
def fence_panel(v):
    pale, wood = C.woodPale, C.wood
    parts = []
    # nine pointed pickets on two rails, the rails behind (+Y)
    pk = [(-0.05, 0.0), (0.05, 0.0), (0.05, 1.03), (0.0, 1.106), (-0.05, 1.03)]
    for i in range(9):
        x = -0.9 + i * 0.225
        o = prism(pk, 0.026, color=mixc(lin(pale), lin(wood), 0.1 * (i % 3 == 1)), bevel=0.008, seg=1, rot=(90, 0, 0))
        move(o, (x, -0.002, 0))
        parts.append(o)
        # a nail head on each rail
        for z in (0.355, 0.905):
            parts.append(ball(0.008, at=(x, -0.029, z), color=C.steelDark, seg=6, rings=3, scale=(1, 0.4, 1)))
    for z in (0.31, 0.86):
        parts.append(box((2.06, 0.028, 0.09), at=(0, 0.013, z), color=wood, bevel=0.008, seg=1))
    return parts


@model('hedge', ao=0.75)
def hedge(v):
    rnd = random.Random(5)
    L, H, D = 3.0, 1.3, 0.85
    parts = []
    # a clipped box hedge: a gridded, rounded slab pushed about by a little
    # noise so its faces bulge like leaves, then soft mounds along the top
    body = gridbox((L, D, H), (8, 2, 3), color=C.leafDark, bevel=0.16, seg=2, smooth=60)

    def lump(p):
        k = 0.05 * (math.sin(p.x * 4.1 + 1.0) * math.cos(p.z * 5.3 + p.y * 3.0) + 0.6 * math.sin(p.y * 7.0 + p.x * 2.3))
        return p.__class__((p.x * (1 + k * 0.2), p.y * (1 + k), p.z + (k * 0.5 if p.z > 0.1 else 0)))
    deform(body, lump)
    lo, hi, lit = shade(C.leafDark, 0.18), lin(C.leafDark), lin(C.leaf)

    def mottle(p):
        t = min(1.0, max(0.0, p.z / (H + 0.1)))
        n = 0.5 + 0.5 * math.sin(p.x * 6.0 + p.z * 4.0) * math.cos(p.y * 5.0 - p.x * 2.0)
        return mixc(mixc(lo, hi, t), lit, 0.35 * n * t)
    paint(body, 0, mottle)
    parts.append(body)
    n = 9
    for i in range(n):
        x = -L / 2 + 0.22 + (L - 0.44) * i / (n - 1) + rnd.uniform(-0.06, 0.06)
        r = rnd.uniform(0.3, 0.38)
        b = blob(r, at=(x, rnd.uniform(-0.12, 0.12), H - 0.05 + rnd.uniform(0.0, 0.08)), color=C.leaf, seg=12,
                 scale=(1.15, 1.25, 0.85), wobble=0.12, seed=i)
        grad(b, C.leafDark, C.leaf, H - 0.25, H + 0.3)
        parts.append(b)
    return parts


@model('gardengnome', ao=0.6)
def gardengnome(v):
    blue, red, skin = C.blue, C.red, C.skin
    parts = []
    # a grassy base, boots, a bell-shaped tunic with a belt
    parts.append(lathe([(0.0, 0.0), (0.122, 0.0), (0.124, 0.018), (0.118, 0.03), (0.0, 0.03)], color=C.grassDark, seg=18))
    for s in (-1, 1):
        parts.append(ball(0.04, at=(s * 0.045, -0.035, 0.048), color=C.brown, seg=10, scale=(0.9, 1.4, 0.65)))
    tunic = lathe([(0.0, 0.03), (0.098, 0.03), (0.1, 0.05), (0.09, 0.12), (0.078, 0.2), (0.07, 0.25), (0.05, 0.27),
                   (0.0, 0.275)], color=blue, seg=16)
    zband(tunic, [(0.12, 0.15, C.brown)])
    deform(tunic, lambda p: p.__class__((p.x, p.y * 0.92, p.z)))
    parts.append(tunic)
    parts.append(box((0.04, 0.02, 0.032), at=(0, -0.085, 0.12), color=C.gold, bevel=0.006, seg=1))
    # arms resting on the tummy, round hands
    for s in (-1, 1):
        parts.append(capsule((s * 0.07, 0.0, 0.24), (s * 0.05, -0.06, 0.16), 0.025, color=blue, seg=8, rings=2))
        parts.append(ball(0.025, at=(s * 0.03, -0.075, 0.155), color=skin, seg=8))
    # head: round face, a big nose, rosy cheeks and dot eyes
    hz = 0.31
    parts.append(ball(0.07, at=(0, 0, hz), color=skin, seg=12, scale=(1.0, 0.95, 0.95)))
    parts.append(ball(0.022, at=(0, -0.07, hz - 0.005), color=mixc(lin(skin), lin(C.pink), 0.5), seg=8))
    for s in (-1, 1):
        parts += _eye(s * 0.028, -0.062, hz + 0.018, 0.009)
        parts.append(ball(0.012, at=(s * 0.042, -0.055, hz - 0.012), color=C.pink, seg=6, rings=3,
                          scale=(1.1, 0.4, 0.8)))
    # a long white beard spilling down the front
    beard = ball(0.07, at=(0, -0.045, hz - 0.06), color=C.white, seg=12, scale=(0.95, 0.6, 1.25))
    deform(beard, lambda p: p.__class__((p.x * (1 - max(0.0, (hz - 0.06 - p.z)) * 3.0), p.y, p.z)))
    parts.append(beard)
    for s in (-1, 1):
        parts.append(ball(0.025, at=(s * 0.022, -0.072, hz - 0.03), color=C.white, seg=8, scale=(1.3, 0.8, 0.7)))
    # the tall red hat, its tip flopping forward
    hat = lathe([(0.0, 0.0), (0.078, 0.0), (0.08, 0.012), (0.066, 0.06), (0.046, 0.12), (0.026, 0.17), (0.012, 0.2),
                 (0.0, 0.215)], color=red, seg=16)
    deform(hat, lambda p: p.__class__((p.x, p.y - 0.25 * (p.z / 0.215) ** 2 * 0.1, p.z + hz + 0.03)))
    parts.append(hat)
    return parts


# ---------------------------------------------------------------- signs, lamps and poles

def upright(poly, t, y_back, color, bevel=0.0, seg=1, z=0.0):
    """A flat shape drawn in (x, z) standing upright, its back face at y_back
    and t thick towards -Y (the front)."""
    o = prism(poly, t, color=color, bevel=bevel, seg=seg, rot=(90, 0, 0))
    move(o, (0, y_back, z))
    return o


def pole_foot(r, h, color, seg=12):
    """A turned plinth: a wide foot ring, a cove and a collar."""
    return lathe([(0.0, 0.0), (r, 0.0), (r, h * 0.35), (r * 0.75, h * 0.62), (r * 0.6, h), (0.0, h)], color=color, seg=seg)


def post(prof, color, seg=12, cap=0.6):
    """A turned pole from [(radius, z), ...] bottom to top, with a rounded
    top of height cap x the last radius. Collars are just extra profile points."""
    r, z = prof[-1]
    pts = [(0.0, prof[0][1])] + list(prof) + [(r * 0.75, z + r * cap * 0.7), (0.0, z + r * cap)]
    return lathe(pts, color=color, seg=seg)


# The warning triangle (v2): v1 builds it as a three-sided cone lying along Z,
# which is where the catalogue's 0.62 m depth comes from. A sign is flat, so
# this one is 0.09 m deep like the other two variants.
@model('signpost', ao=0.6)
def signpost(v):
    steel = C.steelDark
    parts = []
    top = 2.192 if v == 0 else 2.101
    pr = 0.03
    parts.append(pole_foot(0.036, 0.05, shade(steel, 0.2), seg=12))
    parts.append(post([(pr, 0.04), (pr, top - 0.02)], steel, seg=12, cap=0.7))
    yb = -pr                    # sign plates hang on the front of the pole
    if v == 0:
        # a red octagon with a white rim and a white bar across it
        R = 0.341 / math.cos(math.radians(22.5))
        zc = top - 0.341
        parts.append(upright(ngon(R, 8, 22.5), 0.012, yb, C.steel, bevel=0.004, z=zc))
        parts.append(upright(ngon(R - 0.004, 8, 22.5), 0.008, yb - 0.012, C.white, z=zc))
        parts.append(upright(ngon(R - 0.04, 8, 22.5), 0.004, yb - 0.02, C.red, z=zc))
        parts.append(upright(rrect(0.42, 0.11, 0.03, 2), 0.003, yb - 0.024, C.white, z=zc))
    elif v == 1:
        # a blue direction sign: white rim and a chunky white arrow
        zc = 1.85
        parts.append(upright(rrect(0.62, 0.44, 0.05, 3), 0.012, yb, C.steel, bevel=0.004, z=zc))
        parts.append(upright(rrect(0.61, 0.43, 0.045, 3), 0.008, yb - 0.012, C.white, z=zc))
        parts.append(upright(rrect(0.55, 0.37, 0.03, 3), 0.004, yb - 0.02, C.blue, z=zc))
        arrow = [(-0.2, -0.05), (0.06, -0.05), (0.06, -0.12), (0.21, 0.0), (0.06, 0.12), (0.06, 0.05), (-0.2, 0.05)]
        parts.append(upright(arrow, 0.003, yb - 0.024, C.white, z=zc))
    else:
        # a give-way triangle, point down: a broad yellow border, a white heart
        zt = top - 0.03
        h = 0.54
        tri = [(-0.3125, zt), (0.0, zt - h), (0.3125, zt)]
        parts.append(upright(tri, 0.012, yb, C.steel, bevel=0.006))
        parts.append(upright([(x * 0.97, zt + (z - zt) * 0.97 - 0.006) for x, z in tri], 0.008, yb - 0.012, C.yellow))
        parts.append(upright([(-0.15, zt - 0.1), (0.0, zt - 0.36), (0.15, zt - 0.1)], 0.004, yb - 0.02, C.white))
    # two clamp bands where the plate meets the pole
    zc = 1.85 if v != 0 else top - 0.341
    for dz in (-0.14, 0.14):
        parts.append(cyl(pr + 0.005, 0.03, at=(0, 0, zc + dz - 0.015), color=shade(steel, 0.25), seg=10, bevel=0))
    return parts


@model('streetlamp', ao=0.6)
def streetlamp(v):
    iron = C.steelDark
    parts = []
    # a cast base, a tapering pole with two collars, a swan-neck arm
    parts.append(lathe([(0.0, 0.0), (0.16, 0.0), (0.16, 0.05), (0.13, 0.08), (0.105, 0.22), (0.1, 0.42), (0.112, 0.45),
                        (0.112, 0.5), (0.0, 0.52)], color=shade(iron, 0.25), seg=12))
    parts.append(post([(0.078, 0.5), (0.074, 1.57), (0.09, 1.59), (0.09, 1.64), (0.072, 1.66), (0.062, 3.28), (0.076, 3.3),
                       (0.076, 3.35), (0.06, 3.37), (0.054, 4.2)], iron, seg=12))
    # the arm: up out of the pole, over in a curve and out to the lantern
    arm = [(0.0, 0, 4.1), (0.0, 0, 4.3)] + [(0.18 - 0.18 * math.cos(math.radians(a)), 0, 4.3 + 0.18 * math.sin(math.radians(a)))
                                             for a in (22, 45, 68, 90)] + [(0.5, 0, 4.47), (0.86, 0, 4.42)]
    parts.append(tube(arm, 0.04, color=iron, seg=6))
    parts.append(ball(0.06, at=(0, 0, 4.22), color=iron, seg=10))
    # a decorative scroll under the arm
    parts.append(tube(arc_points(0.11, 200, 470, 7, center=(0.25, 0, 4.25), plane='XZ'), 0.016, color=iron, seg=4))
    # a cobra-head lantern with a lemon lens underneath
    head = ball(0.32, at=(0.86, 0, 4.42), color=iron, seg=12, scale=(1.0, 0.45, 0.24))
    deform(head, lambda p: p.__class__((p.x, p.y, max(p.z, 4.38))))
    parts.append(head)
    lens = ball(0.27, at=(0.88, 0, 4.385), color=C.lemon, seg=12, scale=(1.0, 0.42, 0.12), rings=4)
    deform(lens, lambda p: p.__class__((p.x, p.y, min(p.z, 4.385))))
    parts.append(lens)
    parts.append(ball(0.04, at=(0.86, 0, 4.5), color=shade(iron, 0.25), seg=8, scale=(1, 1, 0.7), rings=3))
    return parts


def hood(r, L, t, at, color, arc=200, seg=6):
    """A light's visor: a part-cylinder shell L long, poking out towards -Y."""
    a0 = 90 - arc / 2
    outer = [(r * math.cos(math.radians(a0 + arc * i / seg)), r * math.sin(math.radians(a0 + arc * i / seg))) for i in range(seg + 1)]
    inner = [(x * (r - t) / r, z * (r - t) / r) for x, z in reversed(outer)]
    o = prism(outer + inner, L, color=color, bevel=0, rot=(90, 0, 0))
    move(o, at)
    return o


@model('trafficlight', ao=0.7)
def trafficlight(v):
    dark = C.charcoal
    parts = []
    parts.append(pole_foot(0.2, 0.16, C.concreteD, seg=14))
    pole = post([(0.085, 0.14), (0.083, 0.44), (0.083, 0.5), (0.083, 0.56), (0.083, 0.62), (0.07, 3.5)], dark, seg=12)
    # two yellow hazard bands low on the pole
    zband(pole, [(0.44, 0.5, C.yellow), (0.56, 0.62, C.yellow)])
    parts.append(pole)
    # the signal head: a rounded housing on a white-edged backboard
    zc = 4.0
    parts.append(slab(0.36, 0.24, 1.08, 0.07, at=(0, 0.05, zc - 0.54), color=dark, n=2, bevel=0.02))
    parts.append(upright(rrect(0.427, 1.16, 0.06, 2), 0.025, 0.2, C.white, bevel=0.008, z=zc))
    parts.append(upright(rrect(0.37, 1.1, 0.05, 2), 0.004, 0.176, C.black, z=zc))
    # lamps: red, amber, green, each under a visor
    for i, col in enumerate((C.red, C.yellow, C.green)):
        z = zc + 0.34 - i * 0.34
        parts.append(ball(0.105, at=(0, -0.07, z), color=col, seg=12, scale=(1, 1, 0.32), rot=(90, 0, 0), rings=4))
        parts.append(hood(0.13, 0.19, 0.018, (0, -0.07, z), dark))
    # the bracket holding the head to the pole
    parts.append(box((0.12, 0.2, 0.1), at=(0, 0.06, 3.38), color=dark, bevel=0.02, seg=1))
    return parts


@model('telephonepole', ao=0.6)
def telephonepole(v):
    wood = C.woodDark
    parts = []
    pole = lathe([(0.0, 0.0), (0.19, 0.0), (0.18, 2.6), (0.16, 5.4), (0.145, 7.6), (0.14, 8.42), (0.11, 8.48),
                  (0.0, 8.504)], color=wood, seg=12)
    # grain: every third facet a shade darker
    recolor(pole, lambda c, n: mixc(lin(wood), lin(C.trunkDark), 0.35)
            if int((math.atan2(c.y, c.x) + math.pi) / (2 * math.pi) * 12) % 3 == 0 and c.z < 8.4 else None)
    parts.append(pole)
    # two crossarms with braces and glass insulators
    for i, z in enumerate((7.4, 6.5)):
        w = 2.43 if i == 0 else 1.9
        parts.append(box((w, 0.11, 0.12), at=(0, 0, z - 0.06), color=mixc(lin(wood), (0, 0, 0), 0.1), bevel=0.02, seg=1))
        for s in (-1, 1):
            parts.append(rod((s * 0.12, 0.08, z - 0.55), (s * 0.6, 0.08, z - 0.06), 0.02, color=C.steelDark, seg=6, bevel=0))
        xs = (-1.1, -0.65, 0.65, 1.1) if i == 0 else (-0.85, 0.85)
        for x in xs:
            parts.append(lathe([(0.0, 0.0), (0.05, 0.0), (0.04, 0.035), (0.05, 0.06), (0.03, 0.1), (0.0, 0.115)],
                               at=(x, 0, z), color=C.glassDark, seg=8))
    # a transformer can hung on the front, with a darker lid and two bushings
    tz = 5.85
    parts.append(box((0.08, 0.12, 0.55), at=(0, -0.19, tz + 0.02), color=C.steelDark, bevel=0.02, seg=1))
    can = lathe([(0.0, 0.0), (0.13, 0.0), (0.135, 0.03), (0.135, 0.56), (0.142, 0.58), (0.128, 0.62), (0.0, 0.635)],
                at=(0, -0.29, tz), color=C.grey, seg=12)
    zband(can, [(tz + 0.56, tz + 0.7, shade(C.grey, 0.25)), (tz - 1, tz + 0.03, shade(C.grey, 0.25))])
    parts.append(can)
    for x in (-0.06, 0.06):
        parts.append(lathe([(0.0, 0.0), (0.025, 0.0), (0.016, 0.04), (0.024, 0.06), (0.0, 0.1)],
                           at=(x, -0.29, tz + 0.6), color=C.glassDark, seg=6))
    # climbing steps up the side
    for k in range(8):
        z = 2.6 + k * 0.42
        s = -1 if k % 2 else 1
        parts.append(rod((0, 0, z), (s * 0.3, 0, z + 0.02), 0.014, color=C.steel, seg=6, bevel=0))
    return parts


@model('busstop', ao=0.65)
def busstop(v):
    steel, glass = C.steelDark, tint(C.glass, 0.15)
    parts = []
    W, D = 3.6, 1.5
    # four posts, a gently arched roof with a blue fascia
    for x in (-1.6, 1.6):
        for y in (-0.6, 0.6):
            parts.append(cyl(0.055, 2.5, at=(x, y, 0), color=steel, seg=10, bevel=0))
            parts.append(cyl(0.08, 0.03, at=(x, y, 0), color=shade(steel, 0.3), seg=10, bevel=0))
    roof = gridbox((W, D, 0.08), (1, 6, 1), color=steel, bevel=0.02, seg=1)
    deform(roof, lambda p: p.__class__((p.x, p.y, p.z + 2.5 + 0.08 * (1 - (p.y / (D / 2)) ** 2))))
    parts.append(roof)
    parts.append(box((W - 0.1, 0.06, 0.16), at=(0, -0.72, 2.42), color=C.blue, bevel=0.02, seg=1))
    # glazed back wall, three panes in a frame, with a white safety strip
    parts.append(gridbox((3.2, 0.03, 1.8), ([-1.07, 0.0, 1.07], 1, [0.45, 1.35]), at=(0, 0.6, 0.35), color=glass))
    for z in (0.3, 2.15):
        parts.append(box((3.25, 0.06, 0.06), at=(0, 0.6, z), color=steel, bevel=0))
    for x in (-0.535, 0.535):
        parts.append(box((0.05, 0.06, 1.9), at=(x, 0.6, 0.3), color=steel, bevel=0))
    parts.append(box((3.2, 0.04, 0.08), at=(0, 0.6, 1.3), color=C.white, bevel=0))
    # one glazed end, one advert panel end
    parts.append(gridbox((0.03, 1.1, 1.8), (1, [0.0], [0.9]), at=(-1.6, 0.0, 0.35), color=glass))
    parts.append(box((0.12, 1.05, 1.75), at=(1.6, 0.05, 0.3), color=steel, bevel=0.02, seg=1))
    parts.append(box((0.13, 0.9, 1.5), at=(1.6, 0.05, 0.42), color=C.lemon, bevel=0))
    parts.append(box((0.135, 0.5, 0.5), at=(1.6, 0.15, 1.15), color=C.hotpink, bevel=0))
    parts.append(box((0.135, 0.3, 0.3), at=(1.6, -0.22, 0.6), color=C.teal, bevel=0))
    # the bench along the back
    parts.append(slab(2.6, 0.38, 0.06, 0.06, at=(0, 0.33, 0.48), color=C.wood, n=2))
    for x in (-1.1, 0.0, 1.1):
        parts.append(box((0.06, 0.3, 0.48), at=(x, 0.36, 0.0), color=steel, bevel=0))
    # a timetable board hanging under the front of the roof
    parts.append(box((0.6, 0.04, 0.5), at=(1.2, -0.62, 1.75), color=C.white, bevel=0.012, seg=1))
    parts.append(box((0.5, 0.045, 0.36), at=(1.2, -0.625, 1.82), color=C.blue, bevel=0))
    return parts


@model('phonebooth', ao=0.6)
def phonebooth(v):
    green = C.green
    gd = shade(green, 0.2)
    glass = tint(C.glass, 0.2)
    parts = []
    parts.append(slab(1.04, 1.04, 0.16, 0.05, color=C.steelDark, n=2, bevel=0.03))
    # three glazed walls with a grid of glazing bars; the front is the open door
    H0, H1 = 0.16, 2.2

    def place(o, side):
        if side == 'back':
            return move(o, (0, 0.47, 0))
        s = -1 if side == 'left' else 1
        return deform(o, lambda p: p.__class__((s * 0.47 + p.y, p.x, p.z)))
    for side in ('back', 'left', 'right'):
        parts.append(place(gridbox((0.94, 0.03, H1 - H0), ([-0.313, 0.313], 1, [(k + 0.5) * (H1 - H0) / 6 for k in (0, 2, 4)]),
                                    at=(0, 0, H0), color=glass), side))
        for k in (1, 2):
            parts.append(place(box((0.03, 0.06, H1 - H0), at=(-0.47 + 0.94 * k / 3, 0, H0), color=green, bevel=0), side))
        for k in range(1, 6):
            z = H0 + (H1 - H0) * k / 6
            parts.append(place(box((0.94, 0.06, 0.03), at=(0, 0, z - 0.015), color=green, bevel=0), side))
    # corner posts, a kick panel at the foot of each wall
    for x in (-0.5, 0.5):
        for y in (-0.5, 0.5):
            parts.append(box((0.1, 0.1, H1 - H0 + 0.05), at=(x, y, H0), color=green, bevel=0))
    for side in ('back', 'left', 'right'):
        parts.append(place(box((0.94, 0.07, 0.2), at=(0, 0, H0), color=green, bevel=0), side))
    # the roof: a green cornice, a white sign band, a shallow pyramid cap
    parts.append(box((1.1, 1.1, 0.13), at=(0, 0, H1), color=green, bevel=0.03, seg=1))
    parts.append(box((1.04, 1.04, 0.1), at=(0, 0, H1 + 0.02), color=C.white, bevel=0))
    parts.append(lathe([(0.0, 0.0), (0.76, 0.0), (0.76, 0.03), (0.56, 0.08), (0.0, 0.095)], at=(0, 0, H1 + 0.13),
                       color=gd, seg=4, rot=(0, 0, 45)))
    # the phone on the back wall: a charcoal box, a handset, a coin plate
    parts.append(box((0.3, 0.12, 0.42), at=(0.12, 0.38, 1.2), color=C.charcoal, bevel=0.025, seg=1))
    parts.append(capsule((0.0, 0.31, 1.52), (0.0, 0.31, 1.32), 0.03, color=C.black, seg=8, rings=2))
    parts.append(box((0.14, 0.02, 0.1), at=(0.17, 0.315, 1.38), color=C.steel, bevel=0))
    return parts


# ---------------------------------------------------------------- machines and kiosks

@model('vendingmachine', ao=0.7)
def vendingmachine(v):
    col = [C.red, C.blue, C.tangerine][v]
    dark = C.charcoal
    parts = []
    W, D, H = 1.06, 0.74, 1.86
    yc = 0.03
    yf = yc - D / 2
    # the cabinet on a dark plinth, with a dark header box on top
    parts.append(slab(W, D, H, 0.06, at=(0, yc, 0.0), color=col, n=3, bevel=0.03))
    parts.append(slab(W - 0.06, D - 0.06, 0.05, 0.04, at=(0, yc, 0.0), color=dark, n=2, bevel=0.01))
    parts.append(slab(W, D, 0.235, 0.06, at=(0, yc, H - 0.005), color=dark, n=3, bevel=0.03))
    # the lit header panel across the top
    parts.append(chip(0.92, 0.15, at=(0, yf + 0.001, H + 0.115), color=C.lemon, t=0.012, r=0.03))
    # the display: a pale lit backdrop, a deep dark frame, shelves of cans
    wx, wz, ww, wh = -0.16, 1.2, 0.66, 1.16
    parts.append(gridbox((ww, 0.01, wh), ([-0.22, 0.0, 0.22], 1, [wh * 0.25, wh * 0.5, wh * 0.75]),
                         at=(wx, yf - 0.004, wz - wh / 2), color=tint(C.glass, 0.4)))
    for z in (wz - wh / 2 - 0.05, wz + wh / 2):
        parts.append(box((ww + 0.1, 0.08, 0.05), at=(wx, yf - 0.04, z), color=dark, bevel=0.012, seg=1))
    for x in (wx - ww / 2 - 0.025, wx + ww / 2 + 0.025):
        parts.append(box((0.05, 0.08, wh), at=(x, yf - 0.04, wz - wh / 2), color=dark, bevel=0.012, seg=1))
    for row in range(4):
        z = wz - wh / 2 + 0.06 + row * 0.27
        parts.append(box((ww, 0.09, 0.02), at=(wx, yf - 0.045, z - 0.02), color=C.white, bevel=0))
        for cc in range(4):
            can = SETS['candy'][(row + cc + v) % len(SETS['candy'])]
            x = wx - 0.24 + cc * 0.16
            c = lathe([(0.05, 0.0), (0.05, 0.15), (0.04, 0.165), (0.0, 0.165)], at=(x, yf - 0.05, z), color=can, seg=8,
                      close_bottom=False)
            zband(c, [(z + 0.151, z + 1, C.steel)])
            parts.append(c)
    # the control column: a white panel, selection buttons, coin slot, note slot
    px = 0.36
    parts.append(chip(0.26, 1.5, at=(px, yf + 0.002, 1.08), color=C.white, t=0.03, r=0.03))
    for k in range(5):
        for dx, o in ((-0.05, 0), (0.05, 3)):
            parts.append(upright(ngon(0.022, 8), 0.008, yf - 0.03, SETS['candy'][(k + v + o) % 7], z=1.6 - k * 0.07))
            move(parts[-1], (px + dx, 0, 0))
    parts.append(chip(0.12, 0.08, at=(px, yf - 0.026, 1.18), color=C.charcoal, t=0.01, r=0.01))
    parts.append(chip(0.04, 0.05, at=(px, yf - 0.034, 1.18), color=C.steel, t=0.006, r=0.006))
    parts.append(chip(0.14, 0.1, at=(px, yf - 0.026, 1.0), color=C.black, t=0.01, r=0.01))
    # the pick-up flap at the bottom
    parts.append(chip(0.6, 0.22, at=(-0.13, yf + 0.002, 0.38), color=dark, t=0.04, r=0.03))
    parts.append(chip(0.52, 0.12, at=(-0.13, yf - 0.035, 0.39), color=shade(dark, 0.4), t=0.006, r=0.02))
    return parts


@model('kiosk', ao=0.75)
def kiosk(v):
    cream, red = C.cream, C.red
    rnd = random.Random(4)
    parts = []
    W, D, H = 2.4, 1.8, 2.2
    yf = -D / 2
    # the booth, its dark roof slab, a skirting band
    body = gridbox((W, D, H), ([-0.9, 0.9], [-0.7, 0.7], [0.18, 0.75, 1.75]), color=cream, bevel=0.03, seg=1)
    recolor(body, lambda c, n: shade(C.redDark, 0.1) if c.z < 0.18 else None)
    parts.append(body)
    parts.append(slab(2.7, 2.1, 0.14, 0.12, at=(0, 0, 2.19), color=C.redDark, n=3, bevel=0.03))
    # the service window, its wooden counter and a stack of papers
    parts.append(chip(2.0, 0.9, at=(0, yf + 0.002, 1.3), color=C.charcoal, t=0.03, r=0.03))
    parts.append(slab(2.2, 0.42, 0.06, 0.04, at=(0, yf - 0.16, 0.8), color=C.wood, n=2, bevel=0.015))
    for i, x in enumerate((-0.75, -0.45, 0.6)):
        parts.append(box((0.24, 0.3, 0.05 + 0.03 * i), at=(x, yf - 0.16, 0.86), color=C.paper, bevel=0))
    # magazines pinned up in the window, slightly askew
    cols = [C.white, C.lemon, C.cyan, C.pink, C.lime, C.tangerine]
    for i in range(6):
        x = -0.8 + i * 0.32
        m = chip(0.24, 0.32, at=(0, 0, 0), color=cols[i % len(cols)], t=0.01, r=0)
        a = math.radians(rnd.uniform(-6, 6))
        deform(m, lambda p, a=a, x=x: p.__class__((x + p.x * math.cos(a) - p.z * math.sin(a), yf - 0.03 + p.y,
                                                    1.34 + p.x * math.sin(a) + p.z * math.cos(a))))
        parts.append(m)
        parts.append(chip(0.16, 0.06, at=(x, yf - 0.042, 1.45), color=SETS['plastic'][i % 8], t=0.004, r=0))
    # side racks of magazines on both ends
    for s in (-1, 1):
        for k in range(3):
            z = 0.35 + k * 0.42
            m = box((0.04, 0.9, 0.3), at=(s * (W / 2 + 0.02), 0.05, z), color=cols[(k + (s > 0) * 3) % 6], bevel=0)
            parts.append(m)
            parts.append(box((0.07, 0.95, 0.03), at=(s * (W / 2 + 0.03), 0.05, z - 0.02), color=C.steelDark, bevel=0))
    # a red-and-white striped awning sloping out over the counter, scalloped edge
    aw = gridbox((2.5, 0.75, 0.05), ([-1.0 + 0.25 * i for i in range(9)], [0.0], 1), color=red, bevel=0)
    recolor(aw, lambda c, n: C.white if int(math.floor((c.x + 1.25) / 0.25)) % 2 else None)
    deform(aw, lambda p: p.__class__((p.x, p.y * math.cos(0.5), p.z + p.y * math.sin(0.5))))
    move(aw, (0, yf - 0.33, 2.08))
    parts.append(aw)
    for i in range(10):
        x = -1.125 + i * 0.25
        half = [(0.125 * math.cos(math.radians(a)), 0.125 * math.sin(math.radians(a))) for a in range(180, 361, 30)]
        parts.append(upright(half, 0.02, yf - 0.65, C.white if i % 2 else red, z=1.9))
        move(parts[-1], (x, 0, 0))
    return parts


@model('ev_charger', ao=0.65)
def ev_charger(v):
    parts = []
    parts.append(slab(0.4, 0.3, 0.12, 0.05, color=C.concreteD, n=2, bevel=0.025))
    # a rounded white pillar, slightly narrower at the top
    body = slab(0.3, 0.22, 1.49, 0.09, at=(0, 0, 0.12), color=C.white, n=3, bevel=0.03)
    deform(body, lambda p: p.__class__((p.x * (1 - 0.08 * max(0.0, p.z - 0.12) / 1.49), p.y, p.z)))
    parts.append(body)
    yf = -0.11
    # a dark face, a cyan screen, a lime status ring at the top
    parts.append(chip(0.22, 0.62, at=(0, yf + 0.002, 0.95), color=C.charcoal, t=0.012, r=0.04))
    parts.append(chip(0.16, 0.2, at=(0, yf - 0.009, 1.2), color=C.cyan, t=0.004, r=0.02))
    parts.append(chip(0.1, 0.02, at=(0, yf - 0.009, 1.06), color=C.lime, t=0.004, r=0.008))
    parts.append(slab(0.28, 0.2, 0.05, 0.08, at=(0, 0, 1.6), color=C.lime, n=3, bevel=0.015))
    parts.append(slab(0.24, 0.17, 0.02, 0.07, at=(0, 0, 1.65), color=C.white, n=3, bevel=0.008))
    # the plug in its holster on the right, the cable looping down and back
    parts.append(box((0.08, 0.1, 0.2), at=(0.17, -0.02, 0.76), color=C.charcoal, bevel=0.02, seg=1))
    parts.append(capsule((0.18, -0.05, 0.98), (0.18, -0.06, 0.86), 0.035, color=C.charcoal, seg=8, rings=2))
    cable = [(0.18, -0.06, 0.82), (0.2, -0.12, 0.6), (0.12, -0.16, 0.36), (-0.05, -0.15, 0.28), (-0.18, -0.12, 0.38),
             (-0.2, -0.08, 0.6), (-0.16, -0.04, 0.72), (-0.12, 0.0, 0.7)]
    parts.append(tube(cable, 0.018, color=C.black, seg=6))
    return parts


@model('dumpster', ao=0.75)
def dumpster(v):
    g, dark = C.greenDark, C.charcoal
    parts = []
    # a hopper: wider at the top, the front face sloping in towards the base
    body = gridbox((2.1, 1.3, 1.2), ([-0.85, -0.5, -0.15, 0.15, 0.5, 0.85], 1, [0.6]), color=g, bevel=0.05, seg=1)
    deform(body, lambda p: p.__class__((p.x * (0.95 + 0.05 * p.z / 1.2), p.y - (0.12 * (1 - p.z / 1.2) if p.y < 0 else 0.0), p.z)))
    move(body, (0, 0, 0.2))
    # darker vertical ribs, as colour on the front and back
    recolor(body, lambda c, n: shade(g, 0.18) if abs(n.z) < 0.5 and int(math.floor((c.x + 1.05) / 0.35)) % 2 else None)
    parts.append(body)
    # a heavy lip round the top, and the lifting sleeves on the ends
    parts.append(slab(2.2, 1.4, 0.1, 0.06, at=(0, 0, 1.36), color=dark, n=2, bevel=0.03))
    for s in (-1, 1):
        parts.append(box((0.1, 0.5, 0.16), at=(s * 1.06, 0, 0.98), color=dark, bevel=0.03, seg=1))
    # two black lids, the back one propped up a little on its hinge (+Y)
    for i, x in enumerate((-0.53, 0.53)):
        lid = slab(1.04, 1.36, 0.06, 0.05, color=C.black, n=2, bevel=0.02)
        a = math.radians(5 if i == 1 else 0)

        def hinge(p, a=a, x=x):
            ry = p.y - 0.68
            return p.__class__((p.x + x, 0.68 + ry * math.cos(a) + p.z * math.sin(a), 1.46 - ry * math.sin(a) + p.z * math.cos(a)))
        deform(lid, hinge)
        parts.append(lid)
        if i == 0:
            parts.append(box((0.3, 0.06, 0.03), at=(x, -0.66, 1.5), color=C.black, bevel=0.01, seg=1))
    # four casters: a fork, a fat wheel
    for x in (-0.85, 0.85):
        for y in (-0.42, 0.48):
            parts.append(box((0.12, 0.12, 0.06), at=(x, y, 0.16), color=dark, bevel=0.015, seg=1))
            parts.append(cyl(0.12, 0.07, at=(x - 0.035, y, 0.12), color=C.black, seg=12, bevel=0, rot=(0, 90, 0)))
    return parts


@model('crate_stack', ao=0.8)
def crate_stack(v):
    parts = []
    turns = (6, -9, 5)
    for i in range(3):
        s = 0.9 - i * 0.06
        col = C.woodDark if i % 2 else C.wood
        z0 = i * 0.715
        # plank courses as colour, a darker frame on every edge and a
        # diagonal brace on each face
        e = 0.07
        cr = gridbox((s, s, 0.7), ([-s / 2 + e, s / 2 - e], [-s / 2 + e, s / 2 - e], [e, 0.7 / 3, 0.7 * 2 / 3, 0.7 - e]),
                     color=col, bevel=0.012, seg=1)
        frame = shade(col, 0.28)

        def paint_crate(c, n, s=s, col=col, frame=frame):
            u = c.x if abs(n.y) > 0.5 else c.y
            if abs(n.z) > 0.5:
                return frame if (abs(c.x) > s / 2 - e or abs(c.y) > s / 2 - e) else shade(col, 0.1)
            if abs(u) > s / 2 - e or c.z < e or c.z > 0.7 - e:
                return frame
            return shade(col, 0.07) if int(c.z / (0.7 / 3)) % 2 else None
        recolor(cr, paint_crate)
        a = math.radians(turns[i])
        braces = []
        for k in range(4):
            br = box((math.hypot(s - 2 * e, 0.7 - 2 * e), 0.02, 0.06), at=(0, 0, -0.03), color=frame, bevel=0,
                     rot=(0, -math.degrees(math.atan2(0.7 - 2 * e, s - 2 * e)), 0))
            move(br, (0, -s / 2 - 0.008, 0.35))
            rz = Euler((0, 0, math.radians(90 * k))).to_matrix()
            deform(br, lambda p, rz=rz: rz @ p)
            braces.append(br)
        for o in [cr] + braces:
            rot = Euler((0, 0, a)).to_matrix()
            deform(o, lambda p, rot=rot, z0=z0: rot @ p + Vector((0, 0, z0)))
            parts.append(o)
    return parts


@model('shoppingcart', ao=0.6)
def shoppingcart(v):
    wire, red = C.steel, C.red
    parts = []

    def w(p0, p1, r=0.007):
        parts.append(rod(p0, p1, r, color=wire, seg=4, bevel=0))
    # the basket: a top rim, a smaller floor set towards the back
    zt, zb = 0.9, 0.38
    yf, yb = -0.46, 0.42
    tx = 0.29
    bx, byf = 0.24, -0.36

    top = [(-tx, yf, zt - 0.03), (tx, yf, zt - 0.03), (tx, yb, zt), (-tx, yb, zt)]
    bot = [(-bx, byf, zb), (bx, byf, zb), (bx, yb, zb), (-bx, yb, zb)]
    parts.append(tube(top + [top[0]], 0.012, color=wire, seg=6))
    parts.append(tube(bot + [bot[0]], 0.01, color=wire, seg=6))
    # side wires (along Y), uprights on every face, floor wires
    for s in (-1, 1):
        for k in range(9):
            t = k / 8
            ya, yb_ = yf + (yb - yf) * t, byf + (yb - byf) * t
            za = zt - 0.03 + 0.03 * t
            w((s * tx, ya, za), (s * bx, yb_, zb))
        for f in (0.33, 0.66):
            w((s * (tx + (bx - tx) * f), yf + (byf - yf) * f, zt - 0.03 + (zb - zt + 0.03) * f),
              (s * (tx + (bx - tx) * f), yb, zt + (zb - zt) * f))
    for k in range(1, 6):
        t = k / 6
        w((-tx + 2 * tx * t, yf, zt - 0.03), (-bx + 2 * bx * t, byf, zb))
        w((-tx + 2 * tx * t, yb, zt), (-bx + 2 * bx * t, yb, zb))
        w((-bx + 2 * bx * t, byf, zb), (-bx + 2 * bx * t, yb, zb))
    for f in (0.33, 0.66):
        w((-(tx + (bx - tx) * f), yf + (byf - yf) * f, zt - 0.03 + (zb - zt + 0.03) * f),
          ((tx + (bx - tx) * f), yf + (byf - yf) * f, zt - 0.03 + (zb - zt + 0.03) * f))
    # the push handle: two posts and a red plastic grip behind the basket
    for s in (-1, 1):
        parts.append(tube([(s * tx, yb, zt - 0.2), (s * tx, yb + 0.05, zt - 0.05), (s * tx, yb + 0.08, zt)], 0.013,
                          color=wire, seg=6))
    parts.append(capsule((-tx - 0.01, yb + 0.08, zt + 0.015), (tx + 0.01, yb + 0.08, zt + 0.015), 0.022, color=red, seg=10,
                         rings=2))
    # chassis: legs down to a low frame, a bottom rack, four casters
    for s in (-1, 1):
        parts.append(tube([(s * bx, byf + 0.04, zb), (s * 0.2, -0.36, 0.12)], 0.013, color=wire, seg=6))
        parts.append(tube([(s * bx, yb, zb), (s * bx, 0.38, 0.12)], 0.013, color=wire, seg=6))
        parts.append(tube([(s * 0.2, -0.38, 0.12), (s * bx, 0.38, 0.12)], 0.013, color=wire, seg=6))
    for k in range(4):
        t = (k + 0.5) / 4
        w((-0.21 - 0.03 * t, -0.36 + 0.74 * t, 0.12), (0.21 + 0.03 * t, -0.36 + 0.74 * t, 0.12), 0.006)
    for x, y in ((-0.2, -0.38), (0.2, -0.38), (-bx, 0.38), (bx, 0.38)):
        parts.append(box((0.03, 0.05, 0.05), at=(x, y, 0.07), color=C.steelDark, bevel=0.008, seg=1))
        parts.append(cyl(0.05, 0.035, at=(x - 0.0175, y, 0.05), color=C.charcoal, seg=10, bevel=0.008, rot=(0, 90, 0)))
    return parts


# ---------------------------------------------------------------- city pieces

@model('server_rack', ao=0.7)
def server_rack(v):
    rnd = random.Random(9)
    dark = C.charcoal
    parts = []
    W, D = 0.62, 1.0
    yf = -D / 2
    # a cabinet on four levelling feet, a vented roof with three fan grilles
    for x in (-0.25, 0.25):
        for y in (-0.42, 0.42):
            parts.append(cyl(0.03, 0.04, at=(x, y, 0.0), color=C.black, seg=8, bevel=0))
    parts.append(box((W, D, 2.0), at=(0, 0, 0.04), color=dark, bevel=0.02, seg=1))
    parts.append(box((W + 0.02, D + 0.02, 0.05), at=(0, 0, 2.03), color=C.steelDark, bevel=0.015, seg=1))
    for k in range(3):
        y = -0.3 + k * 0.3
        parts.append(cyl(0.11, 0.055, at=(0, y, 2.08), color=C.steelDark, seg=12, bevel=0.008))
        parts.append(cyl(0.085, 0.006, at=(0, y, 2.13), color=C.black, seg=12, bevel=0))
        parts.append(box((0.17, 0.02, 0.008), at=(0, y, 2.13), color=C.steel, bevel=0, rot=(0, 0, 45)))
    # the door frame round the front, two side handles
    for x in (-W / 2 + 0.025, W / 2 - 0.025):
        parts.append(box((0.05, 0.03, 1.96), at=(x, yf - 0.012, 0.06), color=C.steelDark, bevel=0))
    for z in (0.06, 1.99):
        parts.append(box((W, 0.03, 0.04), at=(0, yf - 0.012, z), color=C.steelDark, bevel=0))
    parts.append(box((0.02, 0.03, 0.2), at=(W / 2 - 0.06, yf - 0.03, 1.0), color=C.steel, bevel=0))
    # fourteen units: faceplates in two greys, drive bays, blinking lights
    for i in range(14):
        z = 0.12 + i * 0.134
        shade_ = C.darkgrey if i % 3 else mixc(lin(C.darkgrey), (0, 0, 0), 0.25)
        parts.append(box((W - 0.12, 0.02, 0.118), at=(0, yf - 0.01, z), color=shade_, bevel=0))
        if i % 4 == 1:
            parts.append(box((0.3, 0.008, 0.07), at=(0.06, yf - 0.024, z + 0.024), color=C.charcoal, bevel=0))
        for k in range(4):
            col = C.lime if rnd.random() < 0.6 else (C.red if rnd.random() < 0.5 else C.cyan)
            parts.append(box((0.022, 0.006, 0.022), at=(-0.21 + k * 0.035, yf - 0.023, z + 0.048), color=col, bevel=0))
    # a cable bundle dropping in at the back
    parts.append(tube([(-0.18, 0.42, 2.11), (-0.18, 0.42, 2.06)], 0.03, color=C.blue, seg=6))
    return parts


@model('fountain', ao=0.6)
def fountain(v):
    con, dark = C.concrete, C.concreteD
    water = C.water
    parts = []
    # the round basin: a coping rim, an inside wall, a water surface
    basin = lathe([(0.0, 0.0), (2.16, 0.0), (2.2, 0.04), (2.2, 0.4), (2.22, 0.42), (2.22, 0.5), (2.18, 0.53),
                   (1.98, 0.53), (1.95, 0.5), (1.95, 0.2), (0.0, 0.2)], color=con, seg=32)
    zband(basin, [(-1, 0.05, dark), (0.4, 0.6, tint(con, 0.25))])
    parts.append(basin)
    pool = lathe([(0.0, 0.36), (1.0, 0.36), (1.5, 0.36), (1.96, 0.36), (1.96, 0.3)], color=water, seg=32, close_bottom=False)
    # ripple rings on the water
    recolor(pool, lambda c, n: tint(water, 0.3) if 0.98 < math.hypot(c.x, c.y) < 1.5 else None)
    parts.append(pool)
    # a fluted pedestal, an upper bowl brimming with water, a column and a cap
    ped = lathe([(0.55, 0.36), (0.52, 0.42), (0.36, 0.5), (0.3, 0.8), (0.32, 1.0), (0.42, 1.05), (0.0, 1.06)],
                color=dark, seg=16)
    parts.append(ped)
    bowl = lathe([(0.0, 1.0), (0.35, 1.02), (0.7, 1.1), (0.92, 1.2), (0.95, 1.26), (0.9, 1.28), (0.0, 1.24)],
                 color=con, seg=32)
    recolor(bowl, lambda c, n: water if n.z > 0.8 and c.z > 1.2 and math.hypot(c.x, c.y) < 0.88 else None)
    parts.append(bowl)
    parts.append(lathe([(0.17, 1.24), (0.14, 1.5), (0.12, 1.85), (0.2, 1.9), (0.2, 1.96), (0.0, 1.97)], color=dark, seg=12))
    # a jet from the cap, splitting into arcs that fall into the bowl,
    # and little spills from the bowl's lip into the basin
    jet = tint(water, 0.3)
    parts.append(lathe([(0.05, 1.96), (0.045, 2.2), (0.07, 2.32), (0.09, 2.38), (0.05, 2.41), (0.0, 2.408)], color=jet, seg=8,
                       close_bottom=False))
    for i in range(6):
        a = 2 * math.pi * i / 6
        ca, sa = math.cos(a), math.sin(a)
        arc = [(ca * r, sa * r, z) for r, z in ((0.06, 2.33), (0.3, 2.3), (0.5, 2.0), (0.62, 1.6), (0.68, 1.27))]
        parts.append(tube(arc, 0.065, color=jet, seg=4, taper=lambda t: 1.0 - 0.35 * t))
        b2 = a + math.pi / 6
        cb, sb = math.cos(b2), math.sin(b2)
        spill = [(cb * r, sb * r, z) for r, z in ((0.92, 1.27), (1.02, 1.15), (1.08, 0.8), (1.1, 0.38))]
        parts.append(tube(spill, 0.05, color=tint(water, 0.18), seg=4, taper=lambda t: 1.0 + 0.5 * t))
    return parts


def bronze_figure(H):
    """A heroic toy figure in bronze: an adult in a long coat, the right arm
    raised holding a torch. Front at -Y. H is the height of the head top."""
    br = C.teal
    lo = shade(br, 0.28)
    hi = tint(br, 0.12)
    k = H / 1.593
    parts = []
    hr, hip, sh_z, leg_r, lx = 0.132, 0.82, 1.27, 0.07, 0.08
    # legs, boots, a flared coat over the torso
    for s in (-1, 1):
        parts.append(capsule((s * lx, 0, hip), (s * lx, 0.0, 0.1), leg_r, color=br, seg=8, rings=2))
        parts.append(ball(0.08, at=(s * lx, -0.06, 0.05), color=lo, seg=10, scale=(0.95, 1.6, 0.62)))
    coat = lathe([(0.0, 0.45), (0.24, 0.45), (0.22, 0.6), (0.18, 0.85), (0.155, 1.05), (0.165, 1.2), (0.14, 1.29),
                  (0.07, 1.32), (0.0, 1.33)], color=br, seg=16)
    deform(coat, lambda p: p.__class__((p.x, p.y * 0.78, p.z)))
    zband(coat, [(0.9, 0.95, lo)])
    parts.append(coat)
    parts.append(cyl(0.05, 0.1, at=(0, 0, 1.27), color=br, seg=10, bevel=0))
    # left arm down holding a book, right arm raised with a torch
    parts.append(capsule((-0.17, 0, 1.24), (-0.21, -0.02, 0.95), 0.05, color=br, seg=8, rings=2))
    parts.append(capsule((-0.21, -0.02, 0.95), (-0.17, -0.1, 0.78), 0.045, color=br, seg=8, rings=2))
    parts.append(box((0.06, 0.18, 0.22), at=(-0.15, -0.14, 0.66), color=lo, bevel=0.02, seg=1, rot=(12, 0, 0)))
    parts.append(capsule((0.17, 0, 1.24), (0.27, -0.05, 1.44), 0.05, color=br, seg=8, rings=2))
    parts.append(capsule((0.27, -0.05, 1.44), (0.28, -0.08, 1.64), 0.045, color=br, seg=8, rings=2))
    parts.append(ball(0.05, at=(0.28, -0.08, 1.66), color=br, seg=8))
    parts.append(lathe([(0.0, 1.6), (0.025, 1.6), (0.04, 1.76), (0.07, 1.8), (0.0, 1.81)], at=(0.28, -0.08, 0.0),
                       color=lo, seg=8))
    parts.append(lathe([(0.0, 1.8), (0.065, 1.81), (0.07, 1.86), (0.04, 1.92), (0.0, 1.95)], at=(0.28, -0.08, 0.0),
                       color=C.gold, seg=8))
    # the head: a calm face, a laurel band, shoulder pads of the coat
    hz = 1.45
    parts.append(ball(hr, at=(0, 0, hz), color=br, seg=14, scale=(1.0, 0.92, 1.0)))
    parts.append(torus(hr * 0.98, 0.022, at=(0, 0.0, hz + 0.05), color=hi, seg=12, rseg=4, rot=(-10, 0, 0)))
    for s in (-1, 1):
        parts.append(ball(0.016, at=(s * 0.046, -0.115, hz + 0.01), color=lo, seg=6, rings=3, scale=(1, 0.5, 1.2)))
        parts.append(ball(0.075, at=(s * 0.16, 0.0, 1.27), color=br, seg=10, scale=(1.0, 0.9, 0.6)))
    parts.append(ball(0.02, at=(0, -0.122, hz - 0.03), color=br, seg=6, rings=3))
    # a chunky toy build: broader than life, so it reads from the street
    for o in parts:
        deform(o, lambda p: p.__class__((p.x * k * 1.3, p.y * k * 1.3, p.z * k)))
    return parts


@model('statue', ao=0.65)
def statue(v):
    con, dark = C.concrete, C.concreteD
    parts = []
    # two broad steps, a tall pedestal with base and cornice mouldings, a plaque
    parts.append(slab(1.5, 1.5, 0.16, 0.05, color=dark, n=2, bevel=0.03))
    parts.append(slab(1.32, 1.32, 0.14, 0.05, at=(0, 0, 0.16), color=mixc(lin(con), lin(dark), 0.5), n=2, bevel=0.03))
    parts.append(slab(1.2, 1.2, 0.12, 0.04, at=(0, 0, 0.3), color=dark, n=2, bevel=0.03))
    ped = gridbox((1.08, 1.08, 1.2), ([-0.42, 0.42], [-0.42, 0.42], [0.15, 0.6, 1.05]), at=(0, 0, 0.42), color=con,
                  bevel=0.02, seg=1)
    # sunken side panels as a darker shade
    recolor(ped, lambda c, n: shade(con, 0.08) if abs(n.z) < 0.5 and 0.57 < c.z < 1.47 and
            abs(c.x if abs(n.y) > 0.5 else c.y) < 0.42 else None)
    parts.append(ped)
    parts.append(slab(1.24, 1.24, 0.1, 0.04, at=(0, 0, 1.62), color=dark, n=2, bevel=0.03))
    parts.append(slab(1.1, 1.1, 0.08, 0.04, at=(0, 0, 1.72), color=con, n=2, bevel=0.025))
    parts.append(chip(0.6, 0.3, at=(0, -0.54, 1.02), color=C.gold, t=0.025, r=0.03))
    parts.append(chip(0.44, 0.04, at=(0, -0.565, 1.08), color=shade(C.gold, 0.35), t=0.004, r=0.01))
    parts.append(chip(0.36, 0.04, at=(0, -0.565, 0.98), color=shade(C.gold, 0.35), t=0.004, r=0.01))
    # the bronze: on its own small round base
    parts.append(cyl(0.38, 0.06, at=(0, 0, 1.8), color=shade(C.teal, 0.25), seg=16, bevel=0))
    fig = bronze_figure(1.593 * 1.25)
    for o in fig:
        move(o, (0, 0, 1.86))
    return parts + fig
