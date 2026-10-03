"""Town and city vehicles, playground kit and farm animals, modelled.

Frame reminder (see kit.py): Blender Z is up, X is the prop's width, and the
game's FRONT (+Z) is Blender -Y. Sizes are real metres, matched to
out/specs.json — the procedural box each archetype already occupies.

Every multi-variant prop here is colour-only: `v` never moves a vertex, so
build.mjs's dedup shares one set of positions between the paints.
"""
import math
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
    return mixc(lin(col) if isinstance(col, int) else col, (0, 0, 0), t)


def tint(col, t):
    """col lightened towards white by t."""
    return mixc(lin(col) if isinstance(col, int) else col, (1, 1, 1), t)


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


def prism(poly, h, at=(0, 0, 0), color=0xcccccc, bevel=0.0, seg=1, rot=(0, 0, 0), smooth=30):
    """`extrude` with a choice of bevel segments (one is half the cost)."""
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


def chip(w, d, r, at=(0, 0, 0), color=0xcccccc, h=0.01, n=2, rot=(0, 0, 0)):
    """A flat colour block — a light lens, a panel, a stripe. No bevel."""
    return prism(rrect(w, d, r, n) if r > 0 else [(-w / 2, -d / 2), (w / 2, -d / 2), (w / 2, d / 2), (-w / 2, d / 2)],
                 h, at=at, color=color, rot=rot)


def sellipse(w, d, n=16, e=2.0, cx=0.0, cy=0.0):
    """A superellipse outline: e=2 an ellipse, e=4 a soft squircle."""
    pts = []
    for j in range(n):
        a = 2 * math.pi * j / n
        ca, sa = math.cos(a), math.sin(a)
        pts.append((cx + w / 2 * math.copysign(abs(ca) ** (2 / e), ca),
                    cy + d / 2 * math.copysign(abs(sa) ** (2 / e), sa)))
    return pts


def loft(stations, axis='y', n=16, color=0xcccccc, exp=2.0, smooth=60, section=None):
    """Skin superellipse cross-sections along an axis — car bodies, hulls,
    fuselages. Each station is (t, w, h, up[, side[, e]]): position along the
    axis, the section's width (across) and height (Z), its centre height, a
    sideways offset, and its squareness. A zero width or height is a pole.
    `section` replaces the superellipse with a closed outline in unit
    coordinates (-1..1 across and up), so colour bands can sit on exact rows."""
    if section is not None:
        n = len(section)
    bm = bmesh.new()
    rings = []
    for st in stations:
        t, w, h, up = st[:4]
        side = st[4] if len(st) > 4 else 0.0
        e = st[5] if len(st) > 5 else exp
        if w <= 1e-7 or h <= 1e-7:
            p = (t, side, up) if axis == 'x' else (side, t, up)
            rings.append([bm.verts.new(p)])
            continue
        ring = []
        for j in range(n):
            if section is not None:
                u, v = side + w / 2 * section[j][0], up + h / 2 * section[j][1]
                ring.append(bm.verts.new((t, u, v) if axis == 'x' else (u, t, v)))
                continue
            a = 2 * math.pi * j / n
            ca, sa = math.cos(a), math.sin(a)
            u = side + w / 2 * math.copysign(abs(ca) ** (2 / e), ca)
            v = up + h / 2 * math.copysign(abs(sa) ** (2 / e), sa)
            ring.append(bm.verts.new((t, u, v) if axis == 'x' else (u, t, v)))
        rings.append(ring)
    for a, b in zip(rings, rings[1:]):
        if len(a) == 1 and len(b) == 1:
            continue
        if len(a) == 1:
            for j in range(n):
                bm.faces.new((a[0], b[j], b[(j + 1) % n]))
        elif len(b) == 1:
            for j in range(n):
                bm.faces.new((a[j], a[(j + 1) % n], b[0]))
        else:
            for j in range(n):
                bm.faces.new((a[j], a[(j + 1) % n], b[(j + 1) % n], b[j]))
    if len(rings[0]) > 1:
        bm.faces.new(list(reversed(rings[0])))
    if len(rings[-1]) > 1:
        bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = _from_bmesh(bm, 'loft')
    paint(o, color)
    return _smooth(o, smooth)


def gridbox(xs, ys, zs, color=0xcccccc, bevel=None, seg=2, smooth=30, plain=''):
    """A box whose faces are cut on the given breakpoints (sorted lists of x, y
    and z, outermost first and last). The cuts are coplanar, so the angle-limited
    bevel leaves them alone and they cost almost nothing — but `recolor` can
    then paint windows, doors and stripes onto exact rectangles. Axes named in
    `plain` keep their two end faces as single n-gons (no cuts needed there)."""
    bm = bmesh.new()
    cache = {}

    def V(x, y, z):
        k = (round(x, 6), round(y, 6), round(z, 6))
        if k not in cache:
            cache[k] = bm.verts.new(k)
        return cache[k]

    def grid(us, vs, f, flat):
        if flat:
            ring = ([f(u, vs[0]) for u in us] + [f(us[-1], v) for v in vs[1:]] +
                    [f(u, vs[-1]) for u in reversed(us[:-1])] + [f(us[0], v) for v in reversed(vs[1:-1])])
            bm.faces.new(ring)
            return
        for i in range(len(us) - 1):
            for j in range(len(vs) - 1):
                bm.faces.new((f(us[i], vs[j]), f(us[i + 1], vs[j]), f(us[i + 1], vs[j + 1]), f(us[i], vs[j + 1])))
    for x in (xs[0], xs[-1]):
        grid(ys, zs, lambda a, b, x=x: V(x, a, b), 'x' in plain)
    for y in (ys[0], ys[-1]):
        grid(xs, zs, lambda a, b, y=y: V(a, y, b), 'y' in plain)
    for z in (zs[0], zs[-1]):
        grid(xs, ys, lambda a, b, z=z: V(a, b, z), 'z' in plain)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = _from_bmesh(bm, 'gridbox')
    if bevel is None:
        bevel = min(xs[-1] - xs[0], ys[-1] - ys[0], zs[-1] - zs[0]) * 0.1
    _bevel(o, bevel, seg)
    paint(o, color)
    return _smooth(o, smooth)


def capsule(p0, p1, r, color=0xcccccc, seg=10, r1=None, rings=3):
    """A rounded limb from p0 to p1 (radius r at p0, r1 at p1): legs, rails,
    poles with soft ends. A lathe turned to lie along p0->p1."""
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


def ball(r, at, color, seg=12, scale=(1, 1, 1), rot=(0, 0, 0), rings=None):
    """A sphere for round bits: eyes, lamps, knobs — seg/2 rings, cheaper than kit.sphere."""
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


def wheel(x, y, z, R, w, side, tyre=C.charcoal, hub=C.steel, cap=None, seg=12, hubr=0.55, axis='x', both=False):
    """A toy wheel centred on (x, y, z), axle along X (or Y): a turned tyre
    with a rounded outer shoulder, a raised hub on the outward face (side = +1
    or -1 along the axle) and an optional centre cap colour. The inner face,
    hidden under a body, is left square unless `both` (a scooter's wheels)."""
    b = min(R, w) * 0.3
    prof = [(0.0, -w / 2), (R - b, -w / 2), (R, -w / 2 + b)] if both else [(0.0, -w / 2), (R, -w / 2)]
    prof += [(R, w / 2 - b), (R - b, w / 2), (0.0, w / 2)]
    t = lathe(prof, color=tyre, seg=seg, rot=(0, 90 * side, 0), smooth=50)
    hr, hd = R * hubr, w * 0.14
    hprof = [(hr, 0.0), (hr, hd), (hr * 0.38, hd * 1.15), (0.0, hd * 1.7)] if cap is not None else \
        [(hr, 0.0), (hr, hd), (0.0, hd * 1.5)]
    hp = lathe(hprof, color=hub, seg=max(8, seg - 4), smooth=40, close_bottom=False)
    if cap is not None:
        recolor(hp, lambda c, n: cap if math.hypot(c.x, c.y) < hr * 0.3 else None)
    m = Euler((0, math.radians(90 * side), 0), 'XYZ').to_matrix()
    ox = side * (w / 2 - hd * 0.9)
    deform(hp, lambda p: m @ p + Vector((ox, 0, 0)))
    turn = Euler((0, 0, math.radians(90 if axis == 'y' else 0)), 'XYZ').to_matrix()
    for o in (t, hp):
        deform(o, lambda p: turn @ p + Vector((x, y, z)))
    return [t, hp]


def disc(r, h, at=(0, 0, 0), color=0xcccccc, seg=12, rot=(0, 0, 0), inner=None, ri=0.6):
    """A flat round badge growing up +Z from `at`: only the top face is
    built (it always sits on something). `inner` paints a centre spot."""
    prof = [(r, 0.0), (r, h), (r * ri, h), (0.0, h)] if inner is not None else [(r, 0.0), (r, h), (0.0, h)]
    o = lathe(prof, at=at, color=color, seg=seg, rot=rot, close_bottom=False, smooth=30)
    if inner is not None:
        recolor(o, lambda c, n: inner if (c - Vector(at)).length < r * ri * 0.8 else None)
    return o


def at_(o, dx=0.0, dy=0.0, dz=0.0):
    """Move a finished part."""
    return deform(o, lambda p: p.__class__((p.x + dx, p.y + dy, p.z + dz)))


# ---------------------------------------------------------------- cars

@model('car', ao=0.6)
def car(v):
    col = SETS['car'][v % len(SETS['car'])]
    trim = C.steel if v != 2 else C.steelDark       # bumpers that read on any paint
    sill = shade(col, 0.45) if v != 3 else lin(C.darkgrey)
    parts = []
    # the body: one chunky lofted tub, front at -Y, hood a touch lower than the tail
    body = loft([(-2.165, 0.0, 0.0, 0.6),
                 (-2.15, 1.30, 0.38, 0.58),
                 (-2.10, 1.66, 0.52, 0.59),
                 (-1.95, 1.76, 0.58, 0.6),
                 (1.85, 1.78, 0.64, 0.61),
                 (2.07, 1.70, 0.58, 0.62),
                 (2.15, 1.34, 0.42, 0.62),
                 (2.165, 0.0, 0.0, 0.62)], n=16, color=col, exp=3.4)
    # a darker rocker panel all round the bottom
    recolor(body, lambda c, n: sill if n.z < -0.25 else None)
    parts.append(body)
    # glasshouse: tinted all round, roof and B-pillar in the paint
    cab = loft([(-0.92, 1.50, 0.06, 0.90),
                (-0.66, 1.56, 0.28, 0.99),
                (-0.30, 1.52, 0.47, 1.085),
                (0.28, 1.50, 0.54, 1.11),
                (0.42, 1.50, 0.54, 1.11),
                (1.00, 1.49, 0.52, 1.10),
                (1.30, 1.46, 0.36, 1.03),
                (1.48, 1.42, 0.08, 0.92)], n=12, color=C.glassDark, exp=3.0)

    def paint_cab(c, n):
        if n.z > 0.82 or c.z < 0.9:
            return col
        if 0.28 < c.y < 0.42 and abs(n.x) > 0.5:
            return col
        return None
    recolor(cab, paint_cab)
    parts.append(cab)
    for sx in (-1, 1):
        for y in (-1.33, 1.35):
            parts += wheel(sx * 0.8, y, 0.34, 0.34, 0.26, sx, hub=trim, cap=C.charcoal, seg=12)
    # bumpers wrap the ends
    for yb in (-2.12, 2.13):
        parts.append(box((1.72, 0.18, 0.17), at=(0, yb, 0.3), color=trim, bevel=0.06, seg=1))
    # headlights, grille, tail lights, mirrors, door handles
    for sx in (-1, 1):
        parts.append(ball(0.13, at=(sx * 0.58, -2.13, 0.68), color=C.lemon, seg=8, rings=3, scale=(1.2, 0.35, 0.8)))
        parts.append(chip(0.3, 0.16, 0.05, at=(sx * 0.6, 2.13, 0.7), color=C.red, h=0.05, n=1, rot=(-90, 0, 0)))
        parts.append(ball(0.09, at=(sx * 0.875, -0.6, 1.0), color=col, seg=8, rings=3, scale=(0.9, 1.0, 0.75)))
        parts.append(chip(0.05, 0.16, 0.0, at=(sx * 0.885, 0.05, 0.8), color=trim, h=0.03, rot=(0, 90 * sx, 0)))
    parts.append(chip(0.62, 0.2, 0.06, at=(0, -2.15, 0.6), color=C.charcoal, h=0.04, n=1, rot=(90, 0, 0)))
    return parts


def side_rot(sx):
    """rot= for a chip or disc lying flat on a side face (+X when sx > 0)."""
    return (0, 90 * sx, 0)


@model('van', ao=0.6)
def van(v):
    col = [C.white, C.tangerine, C.blue][v]
    stripe = [C.red, C.white, C.white][v]
    trim = C.steelDark if v == 0 else C.steel
    parts = []
    # a one-box delivery van: stubby nose, raked screen, tall cargo box
    body = loft([(-2.70, 0.0, 0.0, 0.78),
                 (-2.69, 1.56, 0.62, 0.78),
                 (-2.62, 1.90, 0.78, 0.79),
                 (-2.25, 1.96, 0.86, 0.81),
                 (-1.90, 1.96, 1.10, 0.93),
                 (-1.30, 1.96, 1.90, 1.33),
                 (-1.15, 1.96, 1.92, 1.34),
                 (-0.55, 1.96, 1.92, 1.34),
                 (2.58, 1.96, 1.92, 1.34),
                 (2.69, 1.88, 1.80, 1.34),
                 (2.70, 0.0, 0.0, 1.34)], n=12, color=col, exp=4.0)

    def paint_body(c, n):
        if c.y < -1.25 and c.z > 1.22 and n.z > 0.25 and n.y < -0.2:
            return C.glassDark                      # windscreen
        if -1.95 < c.y < -0.55 and 1.25 < c.z < 2.0 and abs(n.x) > 0.7:
            return C.glassDark                      # cab side windows
        if n.z < -0.3:
            return shade(col, 0.4)
        return None
    recolor(body, paint_body)
    parts.append(body)
    for sx in (-1, 1):
        for y in (-1.62, 1.62):
            parts += wheel(sx * 0.86, y, 0.38, 0.38, 0.28, sx, hub=C.steel)
        rot = side_rot(sx)
        # a painted stripe and a round livery badge down the cargo side
        parts.append(chip(0.22, 3.05, 0.0, at=(sx * 0.968, 1.0, 1.08), color=stripe, h=0.03, rot=rot))
        parts.append(disc(0.42, 0.03, at=(sx * 0.968, 1.0, 1.72), color=C.red if v else C.blue, seg=14, rot=rot,
                          inner=C.white))
        # sliding-door seam and handle
        parts.append(chip(1.3, 0.035, 0.0, at=(sx * 0.968, -0.48, 1.22), color=shade(col, 0.45), h=0.02, rot=rot))
        parts.append(chip(0.05, 0.2, 0.0, at=(sx * 0.968, -0.32, 1.2), color=trim, h=0.035, rot=rot))
        # lamps
        parts.append(ball(0.13, at=(sx * 0.62, -2.64, 0.98), color=C.lemon, seg=8, rings=3, scale=(1.1, 0.35, 0.9)))
        parts.append(chip(0.14, 0.42, 0.04, at=(sx * 0.8, 2.69, 1.05), color=C.red, h=0.04, n=1, rot=(-90, 0, 0)))
        parts.append(chip(0.62, 0.42, 0.06, at=(sx * 0.42, 2.69, 1.82), color=C.glassDark, h=0.03, n=1, rot=(-90, 0, 0)))
        # mirrors on stalks
        parts.append(capsule((sx * 0.94, -1.82, 1.38), (sx * 1.04, -1.86, 1.44), 0.025, color=C.charcoal, seg=6, rings=1))
        parts.append(ball(0.075, at=(sx * 1.03, -1.86, 1.52), color=C.charcoal, seg=8, rings=3, scale=(0.6, 0.9, 1.4)))
    # rear-door split, grille, bumpers
    parts.append(chip(0.035, 1.5, 0.0, at=(0, 2.69, 1.35), color=shade(col, 0.45), h=0.02, rot=(-90, 0, 0)))
    parts.append(chip(0.72, 0.22, 0.06, at=(0, -2.68, 0.84), color=C.charcoal, h=0.04, n=1, rot=(90, 0, 0)))
    for yb in (-2.66, 2.66):
        parts.append(box((1.9, 0.2, 0.22), at=(0, yb, 0.34), color=trim, bevel=0.07, seg=1))
    return parts


@model('keitruck', ao=0.6)
def keitruck(v):
    col = [C.white, C.sky, C.lime][v]
    trim = C.steelDark
    parts = []
    # cab-over cab: a gridded box so the glass is painted on exact panes
    cab = gridbox([-0.74, -0.6, 0.6, 0.74], [-1.73, -1.62, -0.70, -0.58], [0.42, 0.62, 1.12, 1.50, 1.645],
                  color=col, bevel=0.09)

    def rake(p):
        if p.y < -1.2 and p.z > 1.0:
            p.y += (p.z - 1.0) * 0.2
        return p
    deform(cab, rake)

    def paint_cab(c, n):
        if 1.12 < c.z < 1.5:
            if abs(n.y) > 0.5 and abs(c.x) < 0.6:
                return C.glassDark
            if abs(n.x) > 0.5 and -1.6 < c.y < -0.7:
                return C.glassDark
        if n.y < -0.5 and c.z < 0.62:
            return trim
        return None
    recolor(cab, paint_cab)
    parts.append(cab)
    # chassis and the flat bed with drop-side gates
    parts.append(box((1.2, 3.1, 0.24), at=(0, 0.1, 0.3), color=C.charcoal, bevel=0))
    parts.append(box((1.42, 2.2, 0.12), at=(0, 0.6, 0.52), color=C.steelDark, bevel=0))
    for sx in (-1, 1):
        parts.append(box((0.07, 2.24, 0.34), at=(sx * 0.705, 0.6, 0.6), color=col, bevel=0.025, seg=1))
        parts.append(chip(0.035, 2.1, 0.0, at=(sx * 0.742, 0.6, 0.76), color=shade(col, 0.3), h=0.012, rot=side_rot(sx)))
    parts.append(box((1.48, 0.07, 0.34), at=(0, 1.695, 0.6), color=col, bevel=0.025, seg=1))
    parts.append(box((1.48, 0.07, 0.34), at=(0, -0.48, 0.6), color=col, bevel=0.025, seg=1))
    # a pipe guard rack behind the cab
    rack = [(-0.62, -0.5, 0.92), (-0.62, -0.5, 1.5), (0.62, -0.5, 1.5), (0.62, -0.5, 0.92)]
    parts.append(tube(rack, 0.03, color=C.steel, seg=6))
    for x in (-0.2, 0.2):
        parts.append(tube([(x, -0.5, 0.92), (x, -0.5, 1.5)], 0.022, color=C.steel, seg=6))
    for sx in (-1, 1):
        for y in (-1.12, 1.05):
            parts += wheel(sx * 0.64, y, 0.29, 0.29, 0.2, sx, hub=C.white if v else C.steel)
        parts.append(ball(0.09, at=(sx * 0.5, -1.74, 0.82), color=C.lemon, seg=8, rings=3, scale=(1.0, 0.4, 1.0)))
        parts.append(chip(0.16, 0.12, 0.03, at=(sx * 0.58, 1.73, 0.66), color=C.red, h=0.03, n=1, rot=(-90, 0, 0)))
        parts.append(capsule((sx * 0.74, -1.5, 1.15), (sx * 0.8, -1.58, 1.2), 0.02, color=C.charcoal, seg=6, rings=1))
        parts.append(ball(0.05, at=(sx * 0.79, -1.6, 1.25), color=C.charcoal, seg=8, rings=3, scale=(0.6, 0.9, 1.4)))
    parts.append(box((1.5, 0.12, 0.17), at=(0, -1.74, 0.36), color=trim, bevel=0.05, seg=1))
    return parts


@model('bus', ao=0.55)
def bus(v):
    col = C.green if v else C.blue
    parts = []
    wf, wr = -3.4, 3.6
    # the body is gridded only where a colour edge must be exact (wheel arches,
    # bands, windscreen); the side windows are separate panes, far cheaper than
    # a dozen more cuts running round the whole box
    ys = [-5.25, wf - 0.62, wf + 0.62, wr - 0.62, wr + 0.62, 5.25]
    xs = [-1.25, -1.1, -0.8, 0.8, 1.1, 1.25]
    zs = [0.08, 0.55, 1.12, 1.35, 2.3, 2.42, 2.75, 2.95]
    body = gridbox(xs, ys, zs, color=col, bevel=0.16, plain='z')

    def paint_bus(c, n):
        side = abs(n.x) > 0.7
        front, rear = n.y < -0.7, n.y > 0.7
        if side and (abs(c.y - wf) < 0.62 or abs(c.y - wr) < 0.62) and c.z < 1.12:
            return C.black                                       # wheel arches
        if c.z < 0.55 and n.z < 0.5:
            return C.charcoal                                    # skirt
        if 2.42 < c.z < 2.75 and n.z < 0.5:
            return C.white                                       # cream band
        if front and abs(c.x) < 1.1 and 1.12 < c.z < 2.3:
            return C.glassDark                                   # windscreen
        if front and abs(c.x) < 0.8 and 2.42 < c.z < 2.75:
            return C.charcoal                                    # destination board
        if rear and abs(c.x) < 1.1 and 1.35 < c.z < 2.3:
            return C.glassDark
        if n.z > 0.7:
            return C.offwhite
        return None
    recolor(body, paint_bus)
    parts.append(body)
    wins = [(-4.95, -4.13), (-3.95, -2.55), (-2.37, -0.97), (-0.79, 0.61), (0.79, 2.19), (2.37, 3.77), (3.95, 4.95)]
    for sx in (-1, 1):
        for i, (a, b) in enumerate(wins):
            if i == 0 and sx > 0:
                # the door: full height, darker glass
                parts.append(box((0.04, b - a, 1.8), at=(sx * 1.25, (a + b) / 2, 0.52),
                                 color=mixc(lin(C.glassDark), lin(C.charcoal), 0.35), bevel=0))
            else:
                parts.append(box((0.04, b - a, 0.88), at=(sx * 1.25, (a + b) / 2, 1.38), color=C.glassDark, bevel=0))
    # destination sign glow and a roof pod
    parts.append(chip(1.3, 0.2, 0.04, at=(0, -5.25, 2.58), color=C.lemon, h=0.03, n=1, rot=(90, 0, 0)))
    parts.append(box((1.7, 2.6, 0.16), at=(0, 1.2, 2.94), color=C.lightgrey, bevel=0.06, seg=1))
    for sx in (-1, 1):
        for y in (wf, wr):
            parts += wheel(sx * 1.1, y, 0.5, 0.5, 0.34, sx, hub=C.steel, cap=C.charcoal, seg=14)
        parts.append(ball(0.17, at=(sx * 0.88, -5.25, 0.82), color=C.lemon, seg=10, rings=4, scale=(1.0, 0.35, 0.8)))
        parts.append(chip(0.22, 0.42, 0.05, at=(sx * 0.95, 5.25, 0.9), color=C.red, h=0.04, n=1, rot=(-90, 0, 0)))
        # bug-eye mirrors on arms
        parts.append(capsule((sx * 1.2, -5.1, 2.55), (sx * 1.33, -5.4, 2.35), 0.035, color=C.charcoal, seg=6, rings=1))
        parts.append(ball(0.1, at=(sx * 1.3, -5.42, 2.2), color=C.charcoal, seg=8, rings=3, scale=(0.7, 0.6, 1.5)))
    for yb in (-5.24, 5.24):
        parts.append(box((2.4, 0.18, 0.3), at=(0, yb, 0.2), color=C.darkgrey, bevel=0.07, seg=1))
    return parts


# ---------------------------------------------------------------- two wheels and robots

# The scooter lies along X like v1: front wheel and headlamp at +X, and its
# depth (Y) is the handlebar span.
@model('mopeds', ao=0.6)
def mopeds(v):
    col = [C.red, C.white, C.teal][v]
    dark = C.charcoal
    parts = []
    R, w = 0.22, 0.13
    for x in (-0.47, 0.5):
        parts += wheel(x, 0, R, R, w, 1, axis='y', both=True, seg=14, hubr=0.5)[:1]
        parts.append(cyl(R * 0.5, w * 1.2, at=(x, w * 0.6, R), color=C.steel, seg=10, bevel=0.01, rot=(90, 0, 0)))
    # the round rear cowl over the engine, seat on top
    parts.append(loft([(-0.735, 0.0, 0.0, 0.54),
                       (-0.72, 0.22, 0.20, 0.54),
                       (-0.64, 0.36, 0.34, 0.535),
                       (-0.46, 0.42, 0.42, 0.53),
                       (-0.24, 0.40, 0.40, 0.51),
                       (-0.08, 0.30, 0.28, 0.47),
                       (0.0, 0.0, 0.0, 0.45)], axis='x', n=12, color=col, exp=2.4))
    parts.append(loft([(-0.64, 0.0, 0.0, 0.775),
                       (-0.62, 0.22, 0.07, 0.775),
                       (-0.5, 0.29, 0.1, 0.78),
                       (-0.2, 0.28, 0.1, 0.785),
                       (-0.06, 0.2, 0.08, 0.775),
                       (-0.04, 0.0, 0.0, 0.77)], axis='x', n=12, color=dark, exp=2.6))
    # step-through floorboard with a rubber mat
    fb = box((0.56, 0.3, 0.08), at=(0.12, 0, 0.25), color=col, bevel=0.025, seg=1)
    recolor(fb, lambda c, n: dark if n.z > 0.8 else None)
    parts.append(fb)
    # leg shield: a rounded panel leaning back, cupped round the rider's legs
    sh = slab(0.66, 0.42, 0.07, 0.16, color=col, rot=(0, 90, 0), seg=1)
    deform(sh, lambda p: p.__class__((0.42 + p.x - 0.9 * p.y * p.y - p.z * 0.22, p.y, p.z + 0.62)))
    parts.append(sh)
    # front mudguard over the wheel
    parts.append(ball(0.17, at=(0.5, 0, 0.36), color=col, seg=12, rings=5, scale=(1.35, 0.55, 0.7)))
    # steering column, headset with a big round lamp, handlebar
    parts.append(capsule((0.45, 0, 0.62), (0.5, 0, 0.98), 0.045, color=col, seg=8, rings=1))
    parts.append(ball(0.11, at=(0.5, 0, 1.0), color=col, seg=12, rings=5, scale=(1.15, 1.25, 0.75)))
    parts.append(ball(0.07, at=(0.6, 0, 1.0), color=C.lemon, seg=10, rings=4, scale=(0.45, 1.0, 1.0)))
    parts.append(capsule((0.49, -0.3, 1.04), (0.49, 0.3, 1.04), 0.018, color=C.steel, seg=6, rings=1))
    for s in (-1, 1):
        parts.append(capsule((0.49, s * 0.27, 1.04), (0.49, s * 0.345, 1.04), 0.03, color=dark, seg=8, rings=2))
        parts.append(capsule((0.48, s * 0.2, 1.05), (0.46, s * 0.26, 1.1), 0.01, color=C.steel, seg=6, rings=1))
        parts.append(ball(0.032, at=(0.46, s * 0.27, 1.115), color=C.steel, seg=8, rings=3, scale=(0.5, 1.2, 0.9)))
    # tail lamp and a little rear rack
    parts.append(ball(0.05, at=(-0.73, 0, 0.66), color=C.red, seg=8, rings=3, scale=(0.5, 1.4, 0.8)))
    parts.append(tube([(-0.06, -0.12, 0.8), (-0.06, -0.12, 0.84), (-0.28, -0.12, 0.84)], 0.012, color=C.steel, seg=6))
    return parts


@model('delivery_bot', ao=0.6)
def delivery_bot(v):
    col = [C.white, C.lime, C.tangerine][v]
    dark = C.charcoal
    parts = []
    # six fat little wheels under a dark skid
    for sx in (-1, 1):
        for y in (-0.25, 0.0, 0.25):
            parts += wheel(sx * 0.252, y, 0.1, 0.1, 0.075, sx, hub=C.steelDark, seg=10, hubr=0.5)
    parts.append(box((0.42, 0.66, 0.1), at=(0, 0, 0.06), color=dark, bevel=0.03, seg=1))
    # the cargo tub: rounded corners, a rubber bumper skirt, a domed lid
    tub = slab(0.5, 0.72, 0.36, 0.13, at=(0, 0, 0.13), color=col, seg=2, bevel=0.04, n=3)
    recolor(tub, lambda c, n: dark if c.z < 0.18 else None)
    parts.append(tub)
    parts.append(slab(0.47, 0.69, 0.02, 0.12, at=(0, 0, 0.49), color=dark, bevel=0.0, n=2))
    lid = loft([(-0.345, 0.0, 0.0, 0.52),
                (-0.34, 0.42, 0.06, 0.53),
                (-0.3, 0.48, 0.1, 0.55),
                (0.0, 0.48, 0.15, 0.575),
                (0.3, 0.48, 0.1, 0.55),
                (0.34, 0.42, 0.06, 0.53),
                (0.345, 0.0, 0.0, 0.52)], n=16, color=tint(col, 0.15) if v else lin(C.offwhite), exp=3.0)
    parts.append(lid)
    # a friendly face: dark visor and two cyan eyes
    parts.append(slab(0.36, 0.15, 0.025, 0.06, at=(0, -0.36, 0.38), color=dark, rot=(90, 0, 0), bevel=0.008, n=2))
    for s in (-1, 1):
        parts.append(ball(0.032, at=(s * 0.08, -0.387, 0.385), color=C.cyan, seg=10, rings=4, scale=(1, 0.4, 1.25)))
        parts.append(ball(0.04, at=(s * 0.2, 0.362, 0.32), color=C.red, seg=8, rings=3, scale=(1, 0.4, 0.6)))
    # whip antenna with a pennant and a red tip
    parts.append(capsule((0.14, 0.24, 0.6), (0.14, 0.24, 0.75), 0.008, color=C.steelDark, seg=6, rings=1))
    parts.append(ball(0.03, at=(0.14, 0.24, 0.757), color=C.red, seg=10, rings=4))
    flag = prism([(0, 0), (0.0, 0.07), (0.1, 0.035)], 0.006, color=C.orange, rot=(90, 0, 0))
    at_(flag, 0.145, 0.243, 0.64)
    parts.append(flag)
    return parts


# ---------------------------------------------------------------- farm and street food

@model('foodcart', ao=0.65)
def foodcart(v):
    wood, pale, roof = C.woodDark, C.woodPale, C.redDark
    parts = []
    # the cabinet: planked sides on a gridded box
    zs = [0.14, 0.33, 0.52, 0.71, 0.9, 1.04]
    cab = gridbox([-0.9, 0.9], [-0.42, 0.48], zs, color=wood, bevel=0.035, seg=1)
    recolor(cab, lambda c, n: shade(wood, 0.18) if abs(n.z) < 0.5 and int((c.z - 0.14) / 0.19) % 2 else None)
    parts.append(cab)
    # counter top runs forward over the cabinet for the diners
    parts.append(box((1.96, 1.18, 0.07), at=(0, -0.08, 1.04), color=pale, bevel=0.025, seg=1))
    for sx in (-1, 1):
        parts += wheel(sx * 0.96, 0.12, 0.36, 0.36, 0.09, sx, tyre=C.woodDark, hub=C.wood, seg=16, hubr=0.42)
        for a in (0, 60, 120):
            sp = box((0.02, 0.6, 0.05), at=(0, 0, -0.025), color=C.wood, bevel=0)
            deform(sp, lambda p, a=a: p.__class__((sx * 0.975, 0.12 + p.y * math.cos(math.radians(a)) - p.z * math.sin(math.radians(a)),
                                                   0.36 + p.y * math.sin(math.radians(a)) + p.z * math.cos(math.radians(a)))))
            parts.append(sp)
        # front feet so it stands level
        parts.append(box((0.08, 0.08, 0.15), at=(sx * 0.8, -0.36, 0.0), color=wood, bevel=0.02, seg=1))
        # roof posts
        for y in (-0.38, 0.44):
            parts.append(box((0.07, 0.07, 0.78), at=(sx * 0.86, y, 1.1), color=wood, bevel=0.015, seg=1))
    # a pitched roof with a ridge cap and red noren curtains at the front
    rf = prism([(-0.63, 0.0), (0.63, 0.0), (0.63, 0.06), (0.0, 0.22), (-0.63, 0.06)], 2.1, color=roof,
               bevel=0.02, seg=1)
    # outline (depth, height) extruded along the width: a cyclic swap of axes
    deform(rf, lambda p: p.__class__((p.z - 1.05, p.x, 1.85 + p.y)))
    parts.append(rf)
    parts.append(capsule((-1.05, 0, 2.07), (1.05, 0, 2.07), 0.035, color=shade(roof, 0.3), seg=8, rings=1))
    for i in range(4):
        x = -0.72 + i * 0.48
        parts.append(box((0.44, 0.02, 0.36), at=(x, -0.6, 1.5), color=C.red, bevel=0))
    parts.append(disc(0.09, 0.012, at=(-0.24, -0.611, 1.66), color=C.white, seg=12, rot=(90, 0, 0)))
    parts.append(disc(0.09, 0.012, at=(0.24, -0.611, 1.66), color=C.white, seg=12, rot=(90, 0, 0)))
    # a paper lantern hanging from the front corner
    parts.append(capsule((0.97, -0.55, 1.86), (0.97, -0.55, 1.72), 0.008, color=C.charcoal, seg=6, rings=1))
    lan = ball(0.12, at=(0.97, -0.55, 1.55), color=C.red, seg=10, rings=6, scale=(1, 1, 1.3))
    recolor(lan, lambda c, n: shade(C.red, 0.2) if int((c.z - 1.4) / 0.04) % 2 else None)
    parts.append(lan)
    for z, flip in ((1.39, 180), (1.71, 0)):
        parts.append(disc(0.065, 0.03, at=(0.97, -0.55, z), color=C.charcoal, seg=8, rot=(flip, 0, 0)))
    # the stockpot, a stack of bowls and a menu board
    parts.append(lathe([(0.17, 0.0), (0.18, 0.03), (0.18, 0.28), (0.19, 0.3), (0.0, 0.3)],
                       at=(-0.5, 0.05, 1.11), color=C.steel, seg=12, close_bottom=False))
    parts.append(lathe([(0.17, 0.0), (0.12, 0.05), (0.03, 0.06), (0.03, 0.09), (0.0, 0.1)],
                       at=(-0.5, 0.05, 1.41), color=C.steelDark, seg=12, close_bottom=False))
    for i, (x, y) in enumerate(((0.2, -0.3), (0.42, -0.3), (0.31, -0.05))):
        b = lathe([(0.0, 0.0), (0.05, 0.0), (0.09, 0.05), (0.095, 0.075), (0.0, 0.07)],
                  at=(x, y, 1.11), color=C.white, seg=10)
        recolor(b, lambda c, n: C.tan if n.z > 0.9 and c.z > 1.15 else (C.red if c.z > 1.165 else None))
        parts.append(b)
    parts.append(box((0.32, 0.04, 0.4), at=(0.65, 0.3, 1.11), color=C.white, bevel=0.012, seg=1))
    parts.append(box((0.33, 0.045, 0.08), at=(0.65, 0.3, 1.43), color=C.red, bevel=0.01, seg=1))
    return parts


@model('tractor', ao=0.6)
def tractor(v):
    body, rim, dark = C.green, C.yellow, C.charcoal
    parts = []
    # big rear drivers with chevron lugs, small steering wheels in front
    yr, Rt, Rr = 0.95, 0.74, 0.81          # rear axle, tyre radius, axle height (tyre + lugs)
    for sx in (-1, 1):
        parts += wheel(sx * 0.85, yr, Rr, Rt, 0.44, sx, hub=rim, cap=shade(rim, 0.25), seg=16, hubr=0.62)
        for i in range(14):
            a = 2 * math.pi * (i + 0.5 * (sx > 0)) / 14
            ca, sa = math.cos(a), math.sin(a)
            lug = box((0.4, 0.09, 0.07), at=(0, 0, 0), color=dark, bevel=0)
            # a slanted tread bar laid on the tyre at angle a (a proper rotation)
            deform(lug, lambda p, ca=ca, sa=sa: p.__class__((
                sx * 0.85 + p.x,
                yr + ca * (Rt + p.z) + sa * (p.y + abs(p.x) * 0.5),
                Rr + sa * (Rt + p.z) - ca * (p.y + abs(p.x) * 0.5))))
            parts.append(lug)
        parts += wheel(sx * 0.72, -1.25, 0.42, 0.42, 0.28, sx, hub=rim, cap=shade(rim, 0.25), seg=14, hubr=0.6)
    # long hood over the engine, grille and lamps at the nose
    hood = loft([(-1.72, 0.0, 0.0, 1.06),
                 (-1.70, 0.72, 0.66, 1.06),
                 (-1.62, 0.86, 0.8, 1.07),
                 (-0.1, 0.9, 0.9, 1.1),
                 (0.0, 0.9, 0.9, 1.1),
                 (0.02, 0.0, 0.0, 1.1)], n=16, color=body, exp=3.6)
    recolor(hood, lambda c, n: dark if n.y < -0.85 and c.z < 1.3 else None)
    parts.append(hood)
    parts.append(box((0.5, 2.6, 0.36), at=(0, -0.55, 0.5), color=dark, bevel=0.06, seg=1))
    parts.append(capsule((-0.72, -1.25, 0.42), (0.72, -1.25, 0.42), 0.07, color=dark, seg=8, rings=1))
    for sx in (-1, 1):
        parts.append(ball(0.09, at=(sx * 0.3, -1.71, 1.25), color=C.lemon, seg=10, rings=4, scale=(1, 0.45, 1)))
        # rear fenders: a curved plate over each driver
        arc = [(math.cos(math.radians(a)) * 0.95, math.sin(math.radians(a)) * 0.95) for a in range(30, 151, 20)]
        arc += [(math.cos(math.radians(a)) * 0.87, math.sin(math.radians(a)) * 0.87) for a in range(150, 29, -20)]
        fe = prism(arc, 0.5, color=body, bevel=0.02, seg=1)
        deform(fe, lambda p: p.__class__((p.z + sx * 0.85 - 0.25, yr + p.x, Rr + p.y)))
        parts.append(fe)
    # cab deck, seat, wheel and exhaust
    parts.append(box((1.3, 1.1, 0.12), at=(0, 0.75, 1.32), color=dark, bevel=0.04, seg=1))
    parts.append(box((0.9, 0.7, 0.55), at=(0, 0.45, 0.85), color=body, bevel=0.08, seg=1))
    seat = loft([(0.62, 0.0, 0.0, 1.62), (0.64, 0.42, 0.1, 1.62), (0.95, 0.46, 0.12, 1.62), (1.05, 0.46, 0.4, 1.8),
                 (1.1, 0.4, 0.42, 1.82), (1.12, 0.0, 0.0, 1.82)], n=12, color=dark, exp=2.6)
    parts.append(seat)
    parts.append(box((0.16, 0.16, 0.2), at=(0, 0.8, 1.44), color=C.steelDark, bevel=0.03, seg=1))
    parts.append(capsule((0, 0.05, 1.12), (0, 0.25, 1.8), 0.04, color=C.steelDark, seg=8, rings=1))
    parts.append(torus(0.17, 0.025, at=(0, 0.26, 1.82), color=dark, seg=12, rseg=4, rot=(-55, 0, 0)))
    parts.append(capsule((0.3, -1.2, 1.4), (0.3, -1.2, 2.3), 0.06, color=C.steelDark, seg=8, rings=1))
    parts.append(lathe([(0.075, 0.0), (0.075, 0.12), (0.0, 0.12)], at=(0.3, -1.2, 2.28), color=dark, seg=10,
                       close_bottom=False))
    # a two-post frame and a sunshade canopy, with a beacon on top
    for sx in (-1, 1):
        parts.append(capsule((sx * 0.6, 1.3, 1.35), (sx * 0.6, 1.3, 3.36), 0.055, color=dark, seg=8, rings=1))
        parts.append(capsule((sx * 0.6, 1.3, 3.36), (sx * 0.6, 0.15, 3.36), 0.045, color=dark, seg=8, rings=1))
    parts.append(box((1.4, 1.5, 0.1), at=(0, 0.7, 3.36), color=body, bevel=0.04, seg=1))
    parts.append(ball(0.09, at=(0, 0.9, 3.48), color=C.orange, seg=10, rings=4, scale=(1, 1, 1.0)))
    return parts


# ---------------------------------------------------------------- city giants

def station_lerp(stations, t, k):
    """Linearly interpolate field k of a loft's station list at position t."""
    for a, b in zip(stations, stations[1:]):
        if a[0] <= t <= b[0]:
            f = (t - a[0]) / max(1e-9, b[0] - a[0])
            return a[k] + (b[k] - a[k]) * f
    return stations[0][k] if t < stations[0][0] else stations[-1][k]


ROOF_ARC = [(1, -1), (1, -0.2), (0.86, 0.36), (0.56, 0.76), (0.2, 0.97), (-0.2, 0.97), (-0.56, 0.76),
            (-0.86, 0.36), (-1, -0.2), (-1, -1)]


@model('trainCar', ao=0.55, ao_dist=2.5)
def trainCar(v):
    col = [C.offwhite, C.lightgrey][v]
    band = C.orange if v == 0 else C.green
    door = mixc(lin(col), lin(C.charcoal), 0.55)
    parts = []
    hx, hy = 1.55, 9.9
    body = gridbox([-hx, hx], [-hy, hy], [1.15, 1.45, 2.3, 2.75, 3.75, 4.3], color=col, bevel=0.14, seg=2)
    recolor(body, lambda c, n: shade(col, 0.3) if c.z < 1.45 and n.z < 0.5 else (
        band if 2.3 < c.z < 2.75 and n.z < 0.5 else None))
    parts.append(body)
    # an arched roof, chamfered at the ends, with two cooling pods sunk into it
    parts.append(loft([(-hy, 2.7, 1.0, 4.27), (-hy + 0.3, 3.1, 1.3, 4.3), (hy - 0.3, 3.1, 1.3, 4.3), (hy, 2.7, 1.0, 4.27)],
                      section=ROOF_ARC, color=C.steel, smooth=50))
    for y in (-5.2, 5.2):
        parts.append(box((1.6, 2.6, 0.3), at=(0, y, 4.64), color=C.lightgrey, bevel=0.08, seg=1))
    # windows, doors with their own little panes
    wins = [-8.6, -6.7, -2.9, -1.0, 1.0, 2.9, 6.7, 8.6]
    for sx in (-1, 1):
        for y in wins:
            parts.append(box((0.06, 1.5, 0.95), at=(sx * hx, y, 2.78), color=C.glassDark, bevel=0))
        for y in (-4.8, 4.8):
            parts.append(box((0.05, 1.3, 2.55), at=(sx * hx, y, 1.3), color=door, bevel=0))
            parts.append(box((0.08, 0.8, 0.8), at=(sx * hx, y, 2.85), color=C.glassDark, bevel=0))
    for sy in (-1, 1):
        parts.append(box((1.3, 0.34, 2.6), at=(0, sy * (hy + 0.12), 1.35), color=C.charcoal, bevel=0.1, seg=1))
        for sx in (-1, 1):
            parts.append(box((0.8, 0.06, 0.75), at=(sx * 1.0, sy * hy, 2.85), color=C.glassDark, bevel=0))
            parts.append(ball(0.12, at=(sx * 1.1, sy * hy, 1.75), color=C.lemon if sy < 0 else C.red, seg=8, rings=3,
                              scale=(1, 0.5, 1)))
    # underframe, equipment boxes, two bogies
    # a solid underframe, inboard of the wheels and down to 0.4 m like v1's, so
    # a small katamari cannot roll through the gap between the bogies
    parts.append(box((2.6, 18.4, 0.3), at=(0, 0, 0.9), color=C.charcoal, bevel=0))
    parts.append(box((1.9, 18.0, 0.6), at=(0, 0, 0.4), color=C.charcoal, bevel=0))
    for y in (-2.2, 2.2):
        parts.append(box((2.2, 2.4, 0.5), at=(0, y, 0.5), color=C.darkgrey, bevel=0.08, seg=1))
    for yb in (-6.9, 6.9):
        parts.append(box((2.1, 3.4, 0.5), at=(0, yb, 0.3), color=C.charcoal, bevel=0.1, seg=1))
        for sx in (-1, 1):
            for dy in (-1.1, 1.1):
                parts += wheel(sx * 1.1, yb + dy, 0.45, 0.45, 0.16, sx, tyre=C.steelDark, hub=C.steel, seg=12)
    return parts


@model('airplane', ao=0.5, ao_dist=4.0)
def airplane(v):
    parts = []
    st = [(-17.75, 0.0, 0.0, 3.75),
          (-17.4, 1.3, 1.1, 3.78),
          (-16.6, 2.5, 2.3, 3.88),
          (-15.0, 3.3, 3.25, 3.97),
          (-13.0, 3.5, 3.5, 4.0),
          (10.0, 3.5, 3.5, 4.0),
          (14.0, 2.7, 2.8, 4.45),
          (16.6, 1.4, 1.5, 5.0),
          (17.6, 0.5, 0.6, 5.2),
          (17.8, 0.0, 0.0, 5.2)]
    fus = loft(st, n=16, color=C.white, exp=2.0, smooth=50)

    def paint_fus(c, n):
        if -16.8 < c.y < -14.6 and n.z > 0.35 and n.y < -0.1 and abs(c.x) < 1.25:
            return C.glassDark                      # cockpit glazing
        if n.z < -0.55:
            return C.lightgrey                      # belly
        if abs(n.x) > 0.85 and c.z < station_lerp(st, c.y, 3) and c.y < 14:
            return C.blue                           # cheat line under the windows
        return None
    recolor(fus, paint_fus)
    parts.append(fus)
    for sx in (-1, 1):
        for i in range(14):
            parts.append(box((0.14, 0.42, 0.52), at=(sx * 1.63, -11.0 + i * 1.6, 4.28), color=C.glassDark, bevel=0))
        parts.append(box((0.14, 0.8, 1.5), at=(sx * 1.6, -12.6, 3.7), color=C.lightgrey, bevel=0))
    # swept low wings with a little dihedral, thinning to the tips
    wing = prism([(-15, 3.4), (-1.6, -4.2), (1.6, -4.2), (15, 3.4), (15, 5.3), (1.6, 2.6), (-1.6, 2.6), (-15, 5.3)],
                 0.55, color=C.lightgrey, bevel=0.15, seg=1)
    deform(wing, lambda p: p.__class__((p.x, p.y, 2.75 + p.z * (1 - 0.55 * abs(p.x) / 15) + abs(p.x) * 0.06)))
    parts.append(wing)
    tail = prism([(-5.9, 15.9), (-0.8, 13.0), (0.8, 13.0), (5.9, 15.9), (5.9, 17.0), (0.8, 16.2), (-0.8, 16.2), (-5.9, 17.0)],
                 0.32, color=C.lightgrey, bevel=0.1, seg=1)
    deform(tail, lambda p: p.__class__((p.x, p.y, 5.0 + p.z + abs(p.x) * 0.05)))
    parts.append(tail)
    fin = prism([(12.0, 5.0), (17.2, 5.0), (17.9, 11.04), (15.5, 11.04)], 0.5, color=C.blue, bevel=0.15, seg=1)
    deform(fin, lambda p: p.__class__((p.z - 0.25, p.x, p.y)))
    recolor(fin, lambda c, n: C.white if 9.0 < c.z < 9.8 else None)
    parts.append(fin)
    for sx in (-1, 1):
        # blue winglets
        wl = prism([(3.4, 0.0), (5.3, 0.0), (5.6, 1.6), (4.9, 1.6)], 0.22, color=C.blue, bevel=0.06, seg=1)
        deform(wl, lambda p: p.__class__((sx * (14.9 - p.z * 0.2) + p.z * 0, p.x, 3.65 + p.y)))
        parts.append(wl)
        # engines under the wings: turned nacelles with a dark intake and spinner
        nac = lathe([(0.95, 0.0), (1.2, 0.35), (1.25, 1.4), (1.1, 3.4), (0.75, 4.3), (0.0, 4.5)],
                    color=C.steel, seg=14, rot=(-90, 0, 0), close_bottom=False)
        at_(nac, sx * 7.0, -2.7, 2.15)
        recolor(nac, lambda c, n: C.steelDark if c.y > 0.9 else None)
        parts.append(nac)
        parts.append(disc(1.0, 0.06, at=(sx * 7.0, -2.62, 2.15), color=C.charcoal, seg=14, rot=(90, 0, 0),
                          inner=C.steel, ri=0.35))
        parts.append(box((0.35, 2.6, 0.9), at=(sx * 7.0, -0.6, 2.85), color=C.lightgrey, bevel=0.1, seg=1))
        # main gear
        parts.append(capsule((sx * 2.6, 1.2, 2.9), (sx * 2.6, 1.2, 0.5), 0.14, color=C.steelDark, seg=8, rings=1))
        parts += wheel(sx * 2.6, 1.2, 0.48, 0.48, 0.4, sx, hub=C.steel, seg=12)
    parts.append(capsule((0, -13.5, 2.5), (0, -13.5, 0.4), 0.12, color=C.steelDark, seg=8, rings=1))
    parts += wheel(0, -13.5, 0.38, 0.38, 0.3, 1, hub=C.steel, seg=12)
    return parts


@model('hotairballoon', ao=0.5, ao_dist=3.0)
def hotairballoon(v):
    stripe = SETS['candy'][v]
    accent = [C.red, C.blue, C.violet][v]
    parts = []
    # a touch slimmer than v1's box (which its lobes pushed out) so the
    # envelope keeps a proper balloon shape rather than a squashed ball
    prof = [(1.5, 5.6), (2.4, 6.3), (4.3, 7.6), (6.3, 9.2), (7.8, 11.0), (8.65, 12.9), (8.78, 14.5), (8.35, 16.2),
            (7.1, 17.85), (4.9, 19.15), (2.4, 19.78), (0.0, 19.92)]
    env = lathe(prof, color=C.white, seg=32, smooth=60)
    G = 16
    gw = 2 * math.pi / G

    def scallop(p):
        r = math.hypot(p.x, p.y)
        if r < 1e-6 or p.z < 5.7:
            return p
        f = (math.atan2(p.y, p.x) % gw) / gw
        k = 0.962 + 0.038 * math.sin(math.pi * f)
        return p.__class__((p.x * k, p.y * k, p.z))
    deform(env, scallop)

    def gores(c, n):
        if c.z < 5.65:
            return C.charcoal                       # the dark throat
        if c.z > 19.6 or 6.4 < c.z < 7.5:
            return accent                           # crown and a band near the mouth
        return stripe if int((math.atan2(c.y, c.x) % (2 * math.pi)) / gw) % 2 else None
    recolor(env, gores)
    parts.append(env)
    # skirt (scoop) under the mouth
    parts.append(lathe([(1.15, 3.9), (1.32, 4.7), (1.6, 5.7)], color=accent, seg=16, close_bottom=False))
    # the wicker basket: woven bands on a gridded box, a padded leather rim
    zs = [0.0, 0.45, 0.9, 1.35, 1.8, 2.2]
    bk = gridbox([-1.4, 1.4], [-1.4, 1.4], zs, color=C.wood, bevel=0.18, seg=2)
    recolor(bk, lambda c, n: C.tan if abs(n.z) < 0.5 and int(c.z / 0.45) % 2 else (C.woodDark if n.z > 0.5 else None))
    parts.append(bk)
    rim = [(-1.4, -1.4, 2.2), (1.4, -1.4, 2.2), (1.4, 1.4, 2.2), (-1.4, 1.4, 2.2)]
    parts.append(tube(rim, 0.12, color=C.brown, seg=8, closed=True))
    # ropes up to the skirt, a burner frame with its flame
    for sx in (-1, 1):
        for sy in (-1, 1):
            parts.append(tube([(sx * 1.3, sy * 1.3, 2.25), (sx * 0.81, sy * 0.81, 3.95)], 0.05, color=C.woodDark, seg=4))
            parts.append(tube([(sx * 1.3, sy * 1.3, 2.25), (sx * 0.4, sy * 0.4, 3.3)], 0.04, color=C.steelDark, seg=4))
    parts.append(cyl(0.42, 0.5, at=(0, 0, 3.15), color=C.steel, seg=12, bevel=0.05))
    parts.append(ball(0.32, at=(0, 0, 3.95), color=C.orange, seg=10, rings=5, scale=(1, 1, 1.5)))
    parts.append(ball(0.18, at=(0, 0, 3.85), color=C.yellow, seg=8, rings=4, scale=(1, 1, 1.4)))
    return parts


@model('cargoship', ao=0.5, ao_dist=6.0)
def cargoship(v):
    parts = []
    right = [(0.55, -1), (0.85, -0.96), (0.97, -0.86), (1, -0.7), (1, 0.154), (1, 0.277), (1, 0.88), (0.96, 1.0), (0.5, 1.0)]
    sec = [(0.0, -1.0)] + right + [(0.0, 1.0)] + [(-u, w) for (u, w) in reversed(right)]
    st = [(-58.65, 0.6, 14.2, 7.1),
          (-56.5, 5.5, 14.1, 7.05),
          (-52.0, 11.5, 13.7, 6.85),
          (-45.0, 16.0, 13.2, 6.6),
          (-38.0, 17.0, 13.0, 6.5),
          (50.0, 17.0, 13.0, 6.5),
          (55.5, 16.6, 12.6, 6.7),
          (58.65, 15.0, 11.4, 7.6)]
    hull = loft(st, section=sec, color=C.charcoal, smooth=40)

    def paint_hull(c, n):
        if n.z > 0.9 and c.z > 11:
            return C.steelDark                      # deck
        up, h = station_lerp(st, c.y, 3), station_lerp(st, c.y, 2)
        f = (c.z - up) / (h / 2)
        if f < 0.15:
            return C.redDark
        if f < 0.28:
            return C.white
        return None
    recolor(hull, paint_hull)
    parts.append(hull)
    for sx in (-1, 1):
        parts.append(disc(0.9, 0.12, at=(sx * 3.4, -54.2, 10.6), color=C.black, seg=10, rot=(0, 90 * sx, 0)))
    # container bays: gridded stacks painted cell by cell
    candy = SETS['candy']
    tiers = [2, 3, 3, 3, 3, 3, 3, 2]
    for i in range(8):
        y0 = -46 + i * 9.2
        top = 13.0 + 2.9 * tiers[i]
        stack = gridbox([-7.6, -3.8, 0.0, 3.8, 7.6], [y0, y0 + 8.6], [13.0 + 2.9 * k for k in range(tiers[i] + 1)],
                        color=C.red, bevel=0.22, seg=1)

        def paint_cell(c, n, i=i, top=top):
            col_i = min(3, max(0, int((c.x + 7.6) / 3.8)))
            tier = min(2, max(0, int((c.z - 13.0) / 2.9)))
            if n.z > 0.5:
                tier = 3
            return candy[(i * 3 + col_i * 5 + tier * 2) % len(candy)]
        recolor(stack, paint_cell)
        parts.append(stack)
    # superstructure at the stern: decks of portholes and a glazed bridge
    zs = [13.0, 15.4, 16.6, 18.4, 19.6, 21.4, 22.6, 24.6, 26.2, 27.4]
    sup = gridbox([-7.5, 7.5], [31.0, 43.0], zs, color=C.white, bevel=0.4, seg=1)
    bands = [(15.4, 16.6), (18.4, 19.6), (21.4, 22.6), (24.6, 26.2)]
    recolor(sup, lambda c, n: C.glassDark if n.z < 0.5 and any(a < c.z < b for a, b in bands) else (
        C.lightgrey if n.z > 0.5 else None))
    parts.append(sup)
    parts.append(box((17.17, 2.6, 0.7), at=(0, 32.0, 24.0), color=C.white, bevel=0.2, seg=1))
    for sx in (-1, 1):
        lb = capsule((sx * 8.0, 35.6, 17.6), (sx * 8.0, 40.4, 17.6), 0.95, color=C.orange, seg=10, rings=2)
        recolor(lb, lambda c, n: C.white if n.z > 0.45 else None)
        parts.append(lb)
        parts.append(box((0.5, 0.5, 2.2), at=(sx * 7.6, 36.0, 17.4), color=C.steelDark, bevel=0.1, seg=1))
        parts.append(box((0.5, 0.5, 2.2), at=(sx * 7.6, 40.0, 17.4), color=C.steelDark, bevel=0.1, seg=1))
    # funnel with a red band, raked aft; the mast carries the height
    fn = lathe([(2.7, 0.0), (2.5, 3.6), (2.5, 4.4), (2.5, 5.8), (2.45, 6.6), (2.3, 7.0), (0.0, 7.0)],
               color=C.charcoal, seg=16, close_bottom=False)
    recolor(fn, lambda c, n: C.red if 3.6 < c.z < 5.8 and n.z < 0.5 else None)
    deform(fn, lambda p: p.__class__((p.x * 0.8, 47.8 + p.y * 1.25 + p.z * 0.18, 27.4 + p.z)))
    parts.append(fn)
    parts.append(capsule((0, 40.0, 27.0), (0, 40.0, 36.45), 0.25, color=C.steel, seg=8, rings=1))
    parts.append(capsule((-2.4, 40.0, 33.6), (2.4, 40.0, 33.6), 0.15, color=C.steel, seg=6, rings=1))
    parts.append(capsule((0, -53.5, 13.8), (0, -53.5, 20.5), 0.22, color=C.steel, seg=8, rings=1))
    parts.append(ball(0.35, at=(0, -53.5, 20.6), color=C.yellow, seg=8, rings=3))
    return parts


# ---------------------------------------------------------------- playground

U_CHANNEL = [(-1, -1), (1, -1), (1, 1), (0.74, 1), (0.74, -0.3), (-0.74, -0.3), (-0.74, 1), (-1, 1)]


@model('playslide', ao=0.6)
def playslide(v):
    frame, deck, side, chute = C.steelDark, C.blue, C.yellow, C.red
    parts = []
    # tower: four posts with ball finials, a deck, yellow side guards
    for sx in (-1, 1):
        for y in (0.85, 1.75):
            parts.append(capsule((sx * 0.5, y, 0.0), (sx * 0.5, y, 2.95), 0.055, color=frame, seg=6, rings=1))
            parts.append(ball(0.075, at=(sx * 0.5, y, 2.98), color=side, seg=8, rings=3))
        guard = slab(0.8, 0.7, 0.05, 0.16, color=side, rot=(0, 90, 0), seg=1, n=2)
        deform(guard, lambda p: p.__class__((sx * 0.5 + p.x - 0.025, 1.3 + p.y, 2.62 + p.z)))
        parts.append(guard)
        parts.append(disc(0.16, 0.012, at=(sx * 0.53, 1.3, 2.62), color=shade(side, 0.25), seg=10, rot=(0, 90 * sx, 0)))
    parts.append(box((1.1, 1.0, 0.12), at=(0, 1.3, 2.1), color=deck, bevel=0.035, seg=1))
    # the chute: a U-channel lofted down the slope into a flat run-out
    st = [(-2.52, 0.9, 0.26, 0.36), (-2.2, 0.9, 0.26, 0.36), (-1.9, 0.9, 0.27, 0.42), (-1.55, 0.9, 0.28, 0.6),
          (0.55, 0.9, 0.3, 2.1), (0.85, 0.9, 0.3, 2.22)]
    ch = loft(st, section=U_CHANNEL, color=chute, smooth=40)
    recolor(ch, lambda c, n: side if n.z > 0.6 and abs(c.x) > 0.36 else None)
    parts.append(ch)
    for sx in (-1, 1):
        parts.append(capsule((sx * 0.38, -1.75, 0.0), (sx * 0.38, -1.75, 0.38), 0.045, color=frame, seg=6, rings=1))
        parts.append(capsule((sx * 0.38, -0.5, 0.0), (sx * 0.38, -0.5, 1.1), 0.045, color=frame, seg=6, rings=1))
    # a leaning ladder at the back, its rails carrying on up as handrails
    for sx in (-1, 1):
        parts.append(capsule((sx * 0.42, 2.3, 0.0), (sx * 0.42, 1.8, 2.15), 0.045, color=frame, seg=6, rings=1))
        parts.append(capsule((sx * 0.42, 1.8, 2.15), (sx * 0.42, 1.78, 2.75), 0.035, color=side, seg=6, rings=1))
    for i in range(6):
        f = (i + 0.6) / 6.6
        y, z = 2.3 - 0.5 * f, 2.15 * f
        parts.append(capsule((-0.4, y, z), (0.4, y, z), 0.032, color=C.steel, seg=6, rings=1))
    return parts


@model('swingset', ao=0.6)
def swingset(v):
    frame, joint, seat = C.steelDark, C.yellow, C.red
    parts = []
    parts.append(capsule((-2.15, 0, 2.69), (2.15, 0, 2.69), 0.085, color=frame, seg=10, rings=2))
    for sx in (-1, 1):
        for sy in (-1, 1):
            parts.append(capsule((sx * 2.02, 0, 2.66), (sx * 2.3, sy * 1.17, 0.04), 0.07, color=frame, seg=8, rings=1))
            parts.append(ball(0.1, at=(sx * 2.3, sy * 1.17, 0.06), color=joint, seg=8, rings=2, scale=(1, 1, 0.6)))
        parts.append(capsule((sx * 2.2, -0.77, 0.9), (sx * 2.2, 0.77, 0.9), 0.05, color=frame, seg=6, rings=1))
        parts.append(box((0.24, 0.28, 0.26), at=(sx * 2.04, 0, 2.56), color=joint, bevel=0.06, seg=1))
    for x0 in (-0.85, 0.85):
        for dx in (-0.22, 0.22):
            parts.append(tube([(x0 + dx, 0, 2.59), (x0 + dx, 0, 0.62)], 0.016, color=C.steel, seg=4))
            parts.append(torus(0.1, 0.018, at=(x0 + dx, 0, 2.69), color=C.steel, seg=8, rseg=3, rot=(0, 90, 0)))
        s = slab(0.56, 0.24, 0.05, 0.08, color=seat, seg=1, n=2)
        deform(s, lambda p, x0=x0: p.__class__((x0 + p.x, p.y, 0.57 + p.z + 0.06 * (p.x / 0.28) ** 2)))
        parts.append(s)
    return parts


# ---------------------------------------------------------------- farm animals

def bumpy(o, amp, k=5):
    """Lumpy cloud surface — fleece — on a ball-ish part."""
    c = sum((vv.co for vv in o.data.vertices), Vector()) / len(o.data.vertices)

    def f(p):
        d = p - c
        r = d.length
        if r < 1e-6:
            return p
        u = d / r
        b = math.sin(k * u.x + 1.3) * math.sin(k * u.y + 0.4) * math.sin(k * u.z + 2.1)
        return c + d * (1 + amp * b)
    return deform(o, f)


@model('sheep', ao=0.6)
def sheep(v):
    wool, face = C.white, C.charcoal
    parts = []
    body = ball(0.3, at=(0, 0.03, 0.5), color=wool, seg=18, rings=10, scale=(1.16, 1.32, 0.86))
    bumpy(body, 0.07, 6)
    parts.append(body)
    for (x, y, z, r) in ((0, -0.18, 0.72, 0.13), (0.0, 0.1, 0.74, 0.12), (0.18, 0.28, 0.6, 0.12), (-0.18, 0.28, 0.6, 0.12),
                         (0.0, 0.4, 0.55, 0.1)):
        parts.append(ball(r, at=(x, y, z), color=wool, seg=10, rings=5))
    for sx in (-1, 1):
        for y in (-0.2, 0.24):
            parts.append(capsule((sx * 0.15, y, 0.36), (sx * 0.15, y, 0.04), 0.045, color=face, seg=8, rings=2))
    # the dark face, a fleece fringe, floppy ears and big friendly eyes
    hy, hz = -0.43, 0.6
    parts.append(ball(0.15, at=(0, hy, hz), color=face, seg=14, rings=7, scale=(0.82, 1.0, 0.95), rot=(-15, 0, 0)))
    parts.append(ball(0.1, at=(0, hy + 0.04, hz + 0.13), color=wool, seg=10, rings=5, scale=(1.2, 1.0, 0.7)))
    for sx in (-1, 1):
        parts.append(ball(0.07, at=(sx * 0.15, hy + 0.04, hz + 0.04), color=face, seg=8, rings=4, scale=(1.6, 0.6, 0.55),
                          rot=(0, sx * -25, 0)))
        parts.append(ball(0.032, at=(sx * 0.055, hy - 0.115, hz + 0.03), color=C.white, seg=8, rings=4, scale=(1, 0.6, 1.1)))
        parts.append(ball(0.018, at=(sx * 0.058, hy - 0.133, hz + 0.028), color=C.black, seg=6, rings=3, scale=(1, 0.6, 1.2)))
    parts.append(ball(0.05, at=(0, hy - 0.11, hz - 0.08), color=C.pink, seg=8, rings=3, scale=(1.3, 0.5, 0.6)))
    return parts


@model('cow', ao=0.6)
def cow(v):
    hide, spot, muzzle = C.white, C.charcoal, C.pink
    parts = []
    st = [(-0.78, 0.0, 0.0, 1.0), (-0.76, 0.5, 0.5, 1.0), (-0.66, 0.74, 0.68, 0.99), (-0.4, 0.82, 0.74, 0.98),
          (0.5, 0.82, 0.74, 0.98), (0.78, 0.74, 0.7, 0.99), (0.9, 0.5, 0.5, 1.0), (0.93, 0.0, 0.0, 1.0)]
    body = loft(st, n=16, color=hide, exp=2.5, smooth=60)
    parts.append(body)
    # painted-on patches: flattened ovals lying on the hide
    for (x, y, z, sx_, sy_, rot) in ((0.41, -0.15, 1.08, 0.08, 0.3, (0, 90, 8)), (-0.41, 0.35, 1.05, 0.08, 0.26, (0, -90, -10)),
                                      (0.12, 0.45, 1.36, 0.26, 0.22, (0, 0, 20)), (-0.18, -0.35, 1.355, 0.2, 0.18, (0, 0, -30)),
                                      (0.4, 0.62, 0.92, 0.07, 0.16, (0, 90, 0))):
        parts.append(ball(1.0, at=(x, y, z), color=spot, seg=12, rings=4, scale=(sx_, sy_, 0.035), rot=rot))
    for sx in (-1, 1):
        for y in (-0.5, 0.58):
            parts.append(capsule((sx * 0.25, y, 0.8), (sx * 0.25, y, 0.12), 0.09, color=hide, seg=8, rings=2))
            parts.append(lathe([(0.095, 0.0), (0.097, 0.1), (0.08, 0.13), (0.0, 0.13)], at=(sx * 0.25, y, 0.0),
                               color=spot, seg=10, close_bottom=False))
    parts.append(ball(0.13, at=(0, 0.45, 0.62), color=muzzle, seg=10, rings=5, scale=(1.1, 1.0, 0.7)))
    # tail with a dark tuft
    parts.append(tube([(0, 0.92, 1.25), (0, 0.98, 1.1), (0, 1.0, 0.85), (0, 0.99, 0.7)], 0.025, color=hide, seg=6))
    parts.append(ball(0.06, at=(0, 0.99, 0.66), color=spot, seg=8, rings=4, scale=(1, 1, 1.4)))
    # the head: round, a big pink muzzle, ears, little horns, a bell on a collar
    hy, hz = -0.95, 1.18
    head = ball(0.25, at=(0, hy, hz), color=hide, seg=14, rings=7, scale=(0.9, 0.95, 1.0))
    recolor(head, lambda c, n: spot if c.x > 0.02 and c.z > hz - 0.02 and n.y < 0.2 else None)
    parts.append(head)
    parts.append(ball(0.17, at=(0, hy - 0.17, hz - 0.12), color=muzzle, seg=14, rings=6, scale=(1.15, 0.85, 0.75)))
    for sx in (-1, 1):
        parts.append(ball(0.03, at=(sx * 0.07, hy - 0.31, hz - 0.1), color=spot, seg=6, rings=3, scale=(1, 0.5, 1.3)))
        parts += _eye(sx * 0.11, hy - 0.2, hz + 0.07, 0.035)
        parts.append(ball(0.1, at=(sx * 0.335, hy + 0.05, hz + 0.08), color=hide if sx < 0 else spot, seg=10, rings=4,
                          scale=(1.5, 0.55, 0.7), rot=(0, sx * 20, 0)))
        parts.append(capsule((sx * 0.13, hy + 0.04, hz + 0.2), (sx * 0.2, hy + 0.02, hz + 0.33), 0.035, color=C.cream,
                             seg=8, rings=2, r1=0.02))
    parts.append(torus(0.2, 0.03, at=(0, hy + 0.2, hz - 0.17), color=C.red, seg=12, rseg=4, rot=(65, 0, 0)))
    parts.append(lathe([(0.0, 0.0), (0.07, 0.0), (0.06, 0.04), (0.04, 0.09), (0.0, 0.1)], at=(0, hy + 0.06, hz - 0.43),
                       color=C.gold, seg=10))
    return parts
