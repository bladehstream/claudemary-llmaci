"""Country-stage props, modelled: settlements, works, ships, orbiting hardware
and weather — the built and floating things of the world map.

Frame reminder (see kit.py): Blender Z is up, X is the prop's width, and the
game's FRONT (+Z) is Blender -Y. Sizes are world units treated as metres,
matched to out/specs.json — the procedural box each archetype already occupies.

These are MAP ICONS seen from far above, read like a toy globe: a chunky land
disc, two or three big colour masses, settlements as tight clusters of little
chamfered blocks. Detail below a few pixels is not spent. The blocks are
hand-built bmesh (`block`, 18 triangles with a chamfered or hipped top), never
kit.box, so a megacity's skyline fits the triangle budget.
"""
import math
import bmesh
from mathutils import Vector, Matrix, Euler
import kit
from kit import (box, cyl, sphere, torus, lathe, extrude, tube, arc_points,
                 subdivide, deform, recolor, lin, mixc, C, SETS)
from kit import _from_bmesh, _bevel, _place, paint, _smooth

MODELS = {}
FINISH = {}


def model(pid, **finish):
    def wrap(fn):
        MODELS[pid] = fn
        if finish:
            FINISH[pid] = finish
        return fn
    return wrap


# ---------------------------------------------------------------- palette
# The globe's own tin (src/world/props/country.js `G`): not in palette.json,
# because no other stage wants an abyssal blue.
G = dict(
    ocean=0x1d5c9c, oceanDeep=0x123f73, shelf=0x3ba5c6, lagoon=0x74d6dc, surf=0xdcf4f7, river=0x54b6dd,
    plain=0x77a84c, plainDry=0xa3b45b, forest=0x3c7a37, forestDk=0x2b5c2a, jungle=0x2f8446, steppe=0xb7ad63,
    sand=0xe3ca8b, sandDeep=0xcaa863, rock=0x8d8478, rockDk=0x635c54, scree=0xa9a294, tundra=0x9fa495,
    ice=0xe9f5fb, iceBlue=0xc2e6f4, snow=0xfcfdff, cloud=0xf7fbff, cloudGrey=0xd0dae4,
    glow=0xffc65a, glowPale=0xffe9a8, urban=0x7d7b83, urbanDk=0x55535c,
    lava=0xff7b34, ash=0x484450, metal=0xc6ced5, metalDk=0x7a838b, solar=0x2b3a80,
)


# ---------------------------------------------------------------- helpers

def L(c):
    return lin(c) if isinstance(c, int) else c


def dk(col, t=0.2):
    """A darker shade of a palette colour, as linear rgb."""
    return mixc(L(col), (0, 0, 0), t)


def lt(col, t=0.4):
    """A lighter tint of a palette colour, as linear rgb."""
    return mixc(L(col), (1, 1, 1), t)


def want(pid, v):
    """The spec box for (prop, variant), game frame: [width, height, depth]."""
    return kit.SPECS[pid]['boxes'][v]['size']


def hash01(*a):
    s = 0.0
    for i, x in enumerate(a):
        s += (x + 0.31) * (12.9898, 78.233, 37.719, 4.581, 91.17)[i % 5]
    s = math.sin(s) * 43758.5453
    return s - math.floor(s)


def bounds(parts):
    lo = [1e9] * 3
    hi = [-1e9] * 3
    for o in parts:
        for vt in o.data.vertices:
            for i in range(3):
                lo[i] = min(lo[i], vt.co[i])
                hi[i] = max(hi[i], vt.co[i])
    return lo, hi


def fit(parts, pid, v, axes=(0, 1, 2)):
    """Scale the whole prop, per axis, about its footprint centre and its
    floor, so its bounding box is exactly the catalogue box (for the loose,
    organic things: clouds and storms)."""
    lo, hi = bounds(parts)
    w = want(pid, v)
    tgt = (w[0], w[2], w[1])
    cx, cy = (lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2
    k = [tgt[i] / max(1e-9, hi[i] - lo[i]) if i in axes else 1.0 for i in range(3)]
    for o in parts:
        for vt in o.data.vertices:
            p = vt.co
            vt.co = Vector(((p.x - cx) * k[0], (p.y - cy) * k[1], (p.z - lo[2]) * k[2]))
        o.data.update()
    return parts


def xform(o, m, t=(0, 0, 0)):
    """Rotate (3x3 matrix) then move a finished part."""
    tv = Vector(t)
    deform(o, lambda p: m @ p + tv)
    return o


def rot_z(deg):
    return Matrix.Rotation(math.radians(deg), 3, 'Z')


def block(w, d, h, at=(0, 0, 0), color=0xcccccc, top=None, inset=None, rise=None, rz=0.0,
          bands=None, zs=(), smooth=50, floor=False):
    """A building block: four walls and a chamfered top, no floor. `inset`
    and `rise` shape the top ring — a small equal pair is a soft chamfer, a big
    inset with a tall rise is a hipped roof. `top` paints everything facing up.
    `zs` cuts the walls into rings and `bands(z)` -> colour or None paints a
    wall ring by its centre height (window strips on a tower). 18 triangles
    plus 8 per cut."""
    c = min(w, d, h) * 0.12 if inset is None else inset
    r = c if rise is None else rise
    hw, hd = w / 2, d / 2
    Q = ((-1, -1), (1, -1), (1, 1), (-1, 1))
    bm = bmesh.new()
    levels = [0.0] + sorted(z for z in zs if 0 < z < h - r - 1e-4) + [h - r]
    rings = [[bm.verts.new((sx * hw, sy * hd, z)) for sx, sy in Q] for z in levels]
    tr = [bm.verts.new((sx * (hw - c), sy * (hd - c), h)) for sx, sy in Q]
    for a, b in zip(rings, rings[1:] + [tr]):
        for i in range(4):
            j = (i + 1) % 4
            bm.faces.new((a[i], a[j], b[j], b[i]))
    bm.faces.new(tr)
    if floor:       # for blocks whose underside shows: floating panels, decks
        bm.faces.new(list(reversed(rings[0])))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = _from_bmesh(bm, 'block')
    paint(o, color)
    if top is not None:
        recolor(o, lambda p, n: top if n.z > 0.3 else None)
    if bands is not None:
        recolor(o, lambda p, n: bands(p.z) if abs(n.z) < 0.3 else None)
    xform(o, rot_z(rz), at)
    return _smooth(o, smooth)


def gable_roof(w, d, h, at=(0, 0, 0), color=0xcccccc, rz=0.0, bevel=None):
    """A triangular roof prism, ridge along Y, `at` the centre of its eaves."""
    bm = bmesh.new()
    ends = []
    for y in (-d / 2, d / 2):
        ends.append([bm.verts.new((-w / 2, y, 0)), bm.verts.new((w / 2, y, 0)), bm.verts.new((0, y, h))])
    a, b = ends
    bm.faces.new(a)
    bm.faces.new(list(reversed(b)))
    for i in range(3):
        j = (i + 1) % 3
        bm.faces.new((a[i], b[i], b[j], a[j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = _from_bmesh(bm, 'roof')
    _bevel(o, min(w, h) * 0.08 if bevel is None else bevel, 1)
    paint(o, color)
    xform(o, rot_z(rz), at)
    return _smooth(o, 30)


def cottage(x, y, z, w, d, wall_h, roof_h, wall, roof, rz=0.0):
    """A little house: a chamfered block and a gable roof with eaves."""
    m = rot_z(rz)
    body = block(w, d, wall_h, color=wall, inset=min(w, d) * 0.05, rise=min(w, d) * 0.05)
    rf = gable_roof(w * 1.18, d * 1.12, roof_h, at=(0, 0, wall_h * 0.92), color=roof)
    for o in (body, rf):
        xform(o, m, (x, y, z))
    return [body, rf]


def revolve(prof, seg=24, color=0xcccccc, warp=None, smooth=50, cap_bottom=True, cap_top=True, phase=0.0):
    """A lathe whose rings may wobble: prof is [(r, z), ...] bottom to top, and
    warp(angle, r, z, ring_index) -> (r, z) moves each ring vertex. A ring of
    radius 0 is a single pole vertex."""
    bm = bmesh.new()
    rings = []
    for i, (r, z) in enumerate(prof):
        if r <= 1e-7:
            rings.append([bm.verts.new((0, 0, z if warp is None else warp(0.0, 0.0, z, i)[1]))])
            continue
        ring = []
        for j in range(seg):
            a = 2 * math.pi * j / seg + phase
            rr, zz = (r, z) if warp is None else warp(a, r, z, i)
            ring.append(bm.verts.new((rr * math.cos(a), rr * math.sin(a), zz)))
        rings.append(ring)
    for a, b in zip(rings, rings[1:]):
        if len(a) == 1 and len(b) == 1:
            continue
        if len(a) == 1:
            for j in range(seg):
                bm.faces.new((a[0], b[j], b[(j + 1) % seg]))
        elif len(b) == 1:
            for j in range(seg):
                bm.faces.new((a[j], a[(j + 1) % seg], b[0]))
        else:
            for j in range(seg):
                bm.faces.new((a[j], a[(j + 1) % seg], b[(j + 1) % seg], b[j]))
    if cap_bottom and len(rings[0]) > 1:
        bm.faces.new(list(reversed(rings[0])))
    if cap_top and len(rings[-1]) > 1:
        bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = _from_bmesh(bm, 'revolve')
    paint(o, color)
    return _smooth(o, smooth)


def blob(r, at, color, seg=10, rings=None, scale=(1, 1, 1), rot=(0, 0, 0), flat=None):
    """A low sphere (lathed, so the ring count is free): tree crowns, puffs.
    `flat` clamps everything below that world height onto it."""
    rings = rings or max(3, seg // 2)
    prof = [(r * math.sin(math.pi * i / rings), -r * math.cos(math.pi * i / rings)) for i in range(rings + 1)]
    o = revolve(prof, seg=seg, color=color, smooth=80, cap_bottom=False, cap_top=False)
    m = Euler(tuple(math.radians(a) for a in rot), 'XYZ').to_matrix()
    deform(o, lambda p: m @ Vector((p.x * scale[0], p.y * scale[1], p.z * scale[2])) + Vector(at))
    if flat is not None:
        deform(o, lambda p: Vector((p.x, p.y, max(p.z, flat))))
    return o


def sweep(points, radii, n=8, color=0xcccccc, cap0=True, cap1=True, smooth=60):
    """A tube through `points` with a radius per point (parallel-transported
    rings, so it never twists)."""
    pts = [Vector(p) for p in points]
    bm = bmesh.new()
    tangents = []
    for i in range(len(pts)):
        a = pts[max(0, i - 1)]
        b = pts[min(len(pts) - 1, i + 1)]
        tangents.append((b - a).normalized())
    t0 = tangents[0]
    ref = Vector((0, 0, 1)) if abs(t0.z) < 0.9 else Vector((1, 0, 0))
    u = t0.cross(ref).normalized()
    rings = []
    for i, p in enumerate(pts):
        t = tangents[i]
        if i:
            u = (u - t * u.dot(t)).normalized()
        w = t.cross(u).normalized()
        ring = []
        rr = radii[i] if isinstance(radii[i], tuple) else (radii[i], radii[i])
        for j in range(n):
            a = 2 * math.pi * j / n
            ring.append(bm.verts.new(p + u * math.cos(a) * rr[0] + w * math.sin(a) * rr[1]))
        rings.append(ring)
    for a, b in zip(rings, rings[1:]):
        for j in range(n):
            bm.faces.new((a[j], a[(j + 1) % n], b[(j + 1) % n], b[j]))
    if cap0:
        bm.faces.new(list(reversed(rings[0])))
    if cap1:
        bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = _from_bmesh(bm, 'sweep')
    paint(o, color)
    return _smooth(o, smooth)


def prism(poly, h, at=(0, 0, 0), color=0xcccccc, bevel=0.0, seg=1, rot=(0, 0, 0), smooth=30):
    """`extrude` with a choice of bevel segments (one rounds a rim at half the
    cost; none is right for a flat colour block)."""
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


def rrect(w, d, r, n=3, cx=0.0, cy=0.0):
    """A rounded-rectangle outline (counter-clockwise)."""
    r = min(r, w / 2 - 1e-5, d / 2 - 1e-5)
    pts = []
    for qx, qy, a0 in ((1, 1, 0), (-1, 1, 90), (-1, -1, 180), (1, -1, 270)):
        ox, oy = cx + qx * (w / 2 - r), cy + qy * (d / 2 - r)
        for i in range(n + 1):
            a = math.radians(a0 + 90 * i / n)
            pts.append((ox + r * math.cos(a), oy + r * math.sin(a)))
    return pts


def ellipse(rx, ry, n=32, cx=0.0, cy=0.0, a0=0.0):
    return [(cx + rx * math.cos(a0 + 2 * math.pi * i / n), cy + ry * math.sin(a0 + 2 * math.pi * i / n))
            for i in range(n)]


def ribbon(pts, w, h, color=0xcccccc, closed=False, ch=None, smooth=40, caps=True):
    """A flat band along a polyline of (x, y, z_base) points, w wide and h
    tall with a chamfered top: rivers, roads, walls, runways. No floor.
    10 triangles a segment."""
    c = min(w * 0.25, h * 0.45) if ch is None else ch
    P = [Vector(p) for p in pts]
    n = len(P)
    bm = bmesh.new()
    if c <= 0:      # a plain slab section: 6 triangles a segment
        sec = ((-w / 2, 0.0), (-w / 2, h), (w / 2, h), (w / 2, 0.0))
    else:
        sec = ((-w / 2, 0.0), (-w / 2, h - c), (-w / 2 + c, h), (w / 2 - c, h), (w / 2, h - c), (w / 2, 0.0))
    rings = []
    for i in range(n):
        if closed:
            a, b = P[(i - 1) % n], P[(i + 1) % n]
        else:
            a, b = P[max(0, i - 1)], P[min(n - 1, i + 1)]
        t = Vector((b.x - a.x, b.y - a.y, 0)).normalized()
        nn = Vector((-t.y, t.x, 0))
        rings.append([bm.verts.new(P[i] + nn * s + Vector((0, 0, z))) for s, z in sec])
    segs = n if closed else n - 1
    for i in range(segs):
        a, b = rings[i], rings[(i + 1) % n]
        for j in range(len(sec) - 1):
            bm.faces.new((a[j], a[j + 1], b[j + 1], b[j]))
    if caps and not closed:
        bm.faces.new(rings[0])
        bm.faces.new(list(reversed(rings[-1])))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = _from_bmesh(bm, 'ribbon')
    paint(o, color)
    return _smooth(o, smooth)


def pad(W, D, h, rim, deck, seg=20, lip=None, phase=0.0):
    """The land disc a settlement stands on: an ellipse W x D, h thick, soft
    rounded rim, sides `rim`, top `deck`."""
    e = h * 0.28 if lip is None else lip
    prof = [(1.0 - e / max(W, D) * 2.2, 0.0), (1.0, e * 0.9 / max(W, D) * 2), (1.0, h - e), (1.0 - e / max(W, D) * 1.6, h), (0.0, h)]
    o = revolve([(r, z) for r, z in prof], seg=seg, color=rim, smooth=50, phase=phase)
    deform(o, lambda p: Vector((p.x * W / 2, p.y * D / 2, p.z)))
    recolor(o, lambda p, n: deck if n.z > 0.55 and p.z > h * 0.6 else None)
    return o


def tree(x, y, z, r, col, seg=8):
    """A round map tree: one crown, light on top, dark underneath."""
    o = blob(r, (x, y, z + r * 0.75), col, seg=seg, rings=4, scale=(1, 1, 0.92))
    top, under = lt(col, 0.06), dk(col, 0.3)
    paint(o, col, lambda p: mixc(under, top, max(0.0, min(1.0, (p.z - z) / (r * 1.6)))))
    return o


def _spire(r, h, at, color, seg=8):
    """A cone with a needle tip: church spires, masts."""
    o = revolve([(r, 0.0), (r * 0.12, h * 0.9), (0.0, h)], seg=seg, color=color, smooth=30, cap_bottom=False)
    deform(o, lambda p: p + Vector(at))
    return o


def grid_cells(S, n, cx=0.0, cy=0.0):
    step = S / n
    for i in range(n):
        for k in range(n):
            yield i, k, cx - S / 2 + (i + 0.5) * step, cy - S / 2 + (k + 0.5) * step, step


def tower(x, y, z, w, h, wall, glass, cap, crown=0.18, rz=0.0, spike=0.0):
    """A skyscraper: a banded shaft (window strips), a set-back crown with a
    chamfered top and an optional mast."""
    hs = h * (1 - crown)
    n = max(2, min(3, int(hs / (w * 2.2))))
    zs = [hs * (i + 1) / (n + 1) for i in range(n)]
    zs2 = []
    for zz in zs:
        zs2 += [zz - hs * 0.035, zz + hs * 0.035]
    shaft = block(w, w, hs, color=wall, inset=w * 0.04, rise=w * 0.04, zs=zs2,
                  bands=lambda zc: glass if any(abs(zc - zz) < hs * 0.03 for zz in zs) else None)
    top = block(w * 0.72, w * 0.72, h - hs, at=(0, 0, hs - 0.01), color=wall, top=cap,
                inset=w * 0.14, rise=w * 0.14)
    parts = [shaft, top]
    if spike > 0:
        parts.append(_spire(w * 0.09, spike, (0, 0, h - 0.01), cap, seg=6))
    for o in parts:
        xform(o, rot_z(rz), (x, y, z))
    return parts


# ---------------------------------------------------------------- settlements

@model('w_village', ao=0.6)
def w_village(v):
    W, Ht, D = want('w_village', v)
    deck = [G['plain'], G['plainDry'], G['steppe'], G['jungle']][v]
    top = 1.7
    parts = [pad(W, D, top, G['plainDry'], deck, seg=18)]
    # the church in the middle: nave behind, square tower, tall spire
    parts += cottage(0.0, 1.9, top, 2.2, 3.6, 2.2, 1.5, C.offwhite, C.roofTile)
    parts.append(block(2.0, 2.0, 4.0, at=(0, -0.6, top), color=C.offwhite, top=C.roofTile,
                       inset=0.22, rise=0.22))
    parts.append(_spire(1.25, Ht - top - 4.0 + 0.02, (0, -0.6, top + 3.98), C.roofTile, seg=8))
    # six cottages round the green, roofs to the lanes
    for i in range(6):
        a = math.radians(i * 60 + 18 + (hash01(v, i) - 0.5) * 24)
        d = (W / 2) * (0.42 + 0.2 * hash01(v, i, 2))
        x, y = math.cos(a) * d, math.sin(a) * d
        roof = C.roofRed if (i + v) % 3 else mixc(L(C.roofRed), L(C.brown), 0.45)
        parts += cottage(x, y, top, 2.5, 2.9, 2.0, 1.35, C.cream, roof, rz=math.degrees(a) + 90)
    # trees between the houses, and a duck pond
    for i in range(5):
        a = math.radians(i * 72 + 50 + v * 23)
        d = (W / 2) * (0.74 + 0.08 * hash01(v, i, 5))
        parts.append(tree(math.cos(a) * d, math.sin(a) * d, top, 1.55 + 0.35 * hash01(v, i, 7), G['forest']))
    pa = math.radians(200 + v * 40)
    parts.append(prism(ellipse(2.2, 1.5, 14), 0.12, at=(math.cos(pa) * 5.0, math.sin(pa) * 5.0, top - 0.05),
                       color=G['river'], bevel=0.05))
    return parts


@model('w_town', ao=0.6)
def w_town(v):
    W, Ht, D = want('w_town', v)
    R = 22.0
    deck = [G['plain'], G['steppe'], G['plainDry'], G['forest']][v]
    top = 2.0
    parts = [pad(W, D, top, G['plainDry'], deck, seg=20)]
    # the market square, paved
    parts.append(prism(rrect(8.0, 8.0, 1.2, 2), 0.2, at=(0.6, -0.4, top - 0.05), color=C.tan, bevel=0.08))
    # the old town: hip-roofed blocks round the square, some windows lit
    tx, ty = -R * 0.2, -R * 0.16
    for i, k, x, y, step in grid_cells(R * 1.2, 4):
        if i in (1, 2) and k in (1, 2):
            continue
        if hash01(v, i, k) < 0.12:
            continue
        if math.hypot(x - tx, y - ty) < 4.0:
            continue
        w = step * (0.58 + 0.12 * hash01(v, i, k, 1))
        dd = step * (0.58 + 0.12 * hash01(v, i, k, 2))
        h = 2.6 + 4.8 * hash01(v, i, k, 3) ** 1.5
        lit = hash01(v, i, k, 4) < 0.3
        roof = C.roofRed if hash01(v, i, k, 5) < 0.6 else C.roofTile
        parts.append(block(w, dd, h + 1.4, at=(x, y, top), color=G['glow'] if lit else C.cream, top=roof,
                           inset=min(w, dd) * 0.36, rise=1.5))
    # five farmsteads out on the edge
    for i in range(5):
        a = math.radians(i * 72 + 30 + v * 17 + (hash01(v, i, 9) - 0.5) * 20)
        d = R * (0.72 + 0.1 * hash01(v, i, 8))
        parts += cottage(math.cos(a) * d, math.sin(a) * d, top, 3.2, 3.6, 2.4, 1.6, C.tan, C.roofRed,
                         rz=math.degrees(a) + 90)
    # the clock tower
    parts.append(block(2.7, 2.7, 8.2, at=(tx, ty, top), color=C.offwhite, top=C.roofTile, inset=0.28, rise=0.28,
                       zs=(6.0, 7.0), bands=lambda z: C.gold if 6.0 < z < 7.0 else None))
    parts.append(_spire(1.85, Ht - top - 8.2 + 0.02, (tx, ty, top + 8.18), C.roofTile, seg=8))
    # orchards
    for i in range(5):
        a = math.radians(i * 72 + 66 + v * 17)
        d = R * (0.8 + 0.08 * hash01(v, i, 11))
        parts.append(tree(math.cos(a) * d, math.sin(a) * d, top, 2.1 + 0.4 * hash01(v, i, 12), G['forest']))
    return parts


def river_path(x0, x1, amp, waves, z, n=14, phase=0.0, yoff=0.0):
    return [(x0 + (x1 - x0) * i / (n - 1),
             yoff + amp * math.sin(phase + waves * 2 * math.pi * i / (n - 1)), z) for i in range(n)]


def near_path(x, y, path, r):
    for (ax, ay, _), (bx, by, _) in zip(path, path[1:]):
        dx, dy = bx - ax, by - ay
        t = max(0.0, min(1.0, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)))
        if math.hypot(x - ax - t * dx, y - ay - t * dy) < r:
            return True
    return False


@model('w_city', ao=0.6)
def w_city(v):
    W, Ht, D = want('w_city', v)
    R = 39.0
    top = 2.7
    # an oval of land, the river running out at both ends
    parts = [pad(W, D, top, [G['plain'], G['steppe'], G['plainDry'], G['forest']][v], G['plainDry'], seg=28)]
    S = R * 1.34
    parts.append(prism(rrect(S, S, 6.0, 2), 0.5, at=(0, 0, top - 0.1), color=G['urbanDk'], bevel=0.15))
    base = top + 0.4
    riv = river_path(-W / 2 + 0.6, W / 2 - 0.6, R * 0.14, 1.0, top - 0.05, n=16, phase=0.6 + v)
    parts.append(ribbon(riv, R * 0.12, 0.62, color=G['river']))
    # the ring road
    ring = [(x, y, top - 0.08) for x, y in ellipse(W * 0.43, D * 0.43, 32)]
    parts.append(ribbon(ring, 1.6, 0.36, color=G['urbanDk'], closed=True, ch=0))
    # the downtown towers
    th = Ht - base
    tw = []
    for i in range(4):
        a = (i / 4) * 2 * math.pi + 0.5
        x, y = math.cos(a) * R * 0.32, math.sin(a) * R * 0.32
        if near_path(x, y, riv, 5.5):
            y += 6.5 if y >= riv[8][1] else -6.5
        tw.append((x, y))
        hh = th if i == v % 4 else th * (0.7 + 0.18 * hash01(v, i, 21))
        lit = i % 2 == 0
        parts += tower(x, y, base, 4.4, hh - (2.6 if i == v % 4 else 0), G['glow'] if lit else G['urban'],
                       dk(G['glow'], 0.35) if lit else G['glowPale'], C.lightgrey,
                       spike=2.6 if i == v % 4 else 0.0, rz=8 * i)
    # the blocks
    for i, k, x, y, step in grid_cells(S, 6):
        if hash01(v, i, k) < 0.15 or near_path(x, y, riv, step * 0.62):
            continue
        if any(math.hypot(x - a, y - b) < step * 0.7 for a, b in tw):
            continue
        w = step * (0.58 + 0.12 * hash01(v, i, k, 1))
        h = 4.0 + 12.0 * hash01(v, i, k, 3) ** 1.6
        lit = hash01(v, i, k, 4) < 0.34
        parts.append(block(w, w, h, at=(x, y, base), color=G['glow'] if lit else G['urban'],
                           top=dk(G['urban'], 0.25) if not lit else lt(G['glow'], 0.25), inset=w * 0.12,
                           rise=w * 0.12))
    # parks out by the ring road
    for i in range(6):
        a = math.radians(i * 60 + 25 + v * 13)
        x, y = math.cos(a) * W * 0.47 * 0.84, math.sin(a) * D * 0.47 * 0.84
        if near_path(x, y, riv, 5.0):
            continue
        parts.append(tree(x, y, top, 2.8 + 0.5 * hash01(v, i, 31), G['forest']))
    return parts


def bite(poly, c, rb, n=10):
    """A bay bitten from a closed outline: the run of points inside circle
    (c, rb) is replaced by the circle's arc through the land's interior."""
    inside = [math.hypot(x - c[0], y - c[1]) < rb for x, y in poly]
    if not any(inside) or all(inside):
        return list(poly)
    m = len(poly)
    s0 = next(i for i in range(m) if inside[i] and not inside[i - 1])
    run = []
    i = s0
    while inside[i % m]:
        run.append(i % m)
        i += 1
    a_in, a_out = poly[(s0 - 1) % m], poly[i % m]
    t0 = math.atan2(a_in[1] - c[1], a_in[0] - c[0])
    t1 = math.atan2(a_out[1] - c[1], a_out[0] - c[0])
    # the outline runs counter-clockwise, so the bay's arc runs clockwise
    while t1 > t0:
        t1 -= 2 * math.pi
    arc = [(c[0] + rb * math.cos(t0 + (t1 - t0) * k / n), c[1] + rb * math.sin(t0 + (t1 - t0) * k / n))
           for k in range(1, n)]
    out = []
    for j in range(m):
        if j == s0:
            out += arc
        if not inside[j]:
            out.append(poly[j])
    return out


def clip_out(poly, c, rb):
    """Push every outline point inside circle (c, rb) out onto it."""
    out = []
    for x, y in poly:
        dx, dy = x - c[0], y - c[1]
        d = math.hypot(dx, dy)
        if d < rb:
            out.append((c[0] + dx / max(d, 1e-6) * rb, c[1] + dy / max(d, 1e-6) * rb))
        else:
            out.append((x, y))
    return out


def clip_in(poly, rx, ry):
    """Pull every outline point outside the ellipse (rx, ry) radially onto it."""
    out = []
    for x, y in poly:
        k = math.hypot(x / rx, y / ry)
        out.append((x / k, y / k) if k > 1 else (x, y))
    return out


@model('w_megacity', ao=0.6)
def w_megacity(v):
    W, Ht, D = want('w_megacity', v)
    R = 100.0
    top = 4.4
    rx, ry = W / 2, D / 2
    bay_c, bay_r = (rx * 0.9, -ry * 0.38), R * 0.42
    deck = [G['plain'], G['steppe'], G['forest']][v]
    # the land: an oval with a bay bitten out of its east coast
    land = bite(ellipse(rx, ry, 40), bay_c, bay_r)
    o = prism(land, top, color=G['plainDry'], bevel=0.9, seg=1, smooth=40)
    recolor(o, lambda p, n: deck if n.z > 0.55 and p.z > top * 0.6 else None)
    parts = [o]
    bay = clip_in(ellipse(bay_r * 1.02, bay_r * 1.02, 22, bay_c[0], bay_c[1]), rx * 0.995, ry * 0.995)
    parts.append(prism(bay, 1.4, color=G['shelf'], bevel=0.3))

    def on_land(x, y, m=0.0):
        return (x / (rx - m)) ** 2 + (y / (ry - m)) ** 2 < 1 and math.hypot(x - bay_c[0], y - bay_c[1]) > bay_r + m

    base = top + 0.4
    # three districts on dark pads: downtown and two satellite towns
    dists = [(0.0, 0.0, R * 1.15, 7), (-rx * 0.5, ry * 0.46, R * 0.46, 3), (-rx * 0.36, -ry * 0.5, R * 0.42, 3)]
    for cx, cy, S, n in dists:
        pl = clip_out(rrect(S, S, S * 0.12, 2, cx, cy), bay_c, bay_r + 3)
        parts.append(prism(pl, 0.55, at=(0, 0, top - 0.15), color=G['urbanDk']))
    # the river, from the west coast into the bay
    riv = river_path(-rx + 1.0, bay_c[0] - bay_r * 0.7, R * 0.12, 1.2, top - 0.05, n=16, phase=1.0 + v,
                     yoff=-ry * 0.1)
    parts.append(ribbon(riv, R * 0.075, 0.6, color=G['river']))
    # the ring road, crossing the bay on a causeway
    ring = [(x, y, top - 0.1) for x, y in ellipse(rx * 0.86, ry * 0.86, 32)]
    parts.append(ribbon(ring, 2.6, 0.5, color=G['urbanDk'], closed=True, ch=0))
    # the supertall core
    th = Ht - base
    tw = []
    for i in range(6):
        a = (i / 6) * 2 * math.pi + 0.3
        x, y = math.cos(a) * R * 0.3, math.sin(a) * R * 0.3
        if near_path(x, y, riv, 8.0):
            y += 10.0 if y >= -ry * 0.1 else -10.0
        tw.append((x, y))
        tall = i == v % 6
        hh = th if tall else th * (0.6 + 0.25 * hash01(v, i, 41))
        lit = i % 2 == 1
        parts += tower(x, y, base, 7.2, hh - (6.0 if tall else 0.0), G['glow'] if lit else G['urbanDk'],
                       dk(G['glow'], 0.35) if lit else G['glowPale'], C.lightgrey, spike=6.0 if tall else 0.0, rz=11 * i)
    # the blocks
    for di, (cx, cy, S, n) in enumerate(dists):
        hk = (36.0, 16.0, 13.0)[di]
        for i, k, x, y, step in grid_cells(S, n, cx, cy):
            if hash01(v, di, i, k) < 0.14 or near_path(x, y, riv, step * 0.6) or not on_land(x, y, step * 0.6):
                continue
            if any(math.hypot(x - a, y - b) < step * 0.75 for a, b in tw):
                continue
            w = step * (0.6 + 0.12 * hash01(v, di, i, k, 1))
            h = 5.0 + hk * hash01(v, di, i, k, 3) ** 1.3
            lit = hash01(v, di, i, k, 4) < 0.4
            parts.append(block(w, w, h, at=(x, y, base), color=G['glow'] if lit else G['urban'],
                               top=dk(G['urban'], 0.25) if not lit else lt(G['glow'], 0.25),
                               inset=w * 0.12, rise=w * 0.12))
    # parks
    for i in range(5):
        a = math.radians(i * 72 + 40 + v * 21)
        x, y = math.cos(a) * rx * 0.74, math.sin(a) * ry * 0.74
        if not on_land(x, y, 8) or near_path(x, y, riv, 8.0):
            continue
        parts.append(tree(x, y, top, 6.0 + 1.0 * hash01(v, i, 51), G['forest']))
    return parts


# ---------------------------------------------------------------- works

def quad(x, y, z, w, d, color, rz=0.0):
    """A flat upward-facing quad: runway paint, field rows. Two triangles."""
    bm = bmesh.new()
    vs = [bm.verts.new((sx * w / 2, sy * d / 2, 0)) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    bm.faces.new(vs)
    o = _from_bmesh(bm, 'quad')
    paint(o, color)
    return xform(o, rot_z(rz), (x, y, z))


def blade_sweep(p0, p1, wide, thin, color, n=4):
    """A flat tapered blade from p0 (root) to p1 (tip), its flat facing Y."""
    a, b = Vector(p0), Vector(p1)
    pts = [a.lerp(b, t) for t in (0.0, 0.22, 1.0)]
    rr = [(thin, wide * 0.6), (thin, wide), (thin * 0.5, wide * 0.32)]
    return sweep(pts, rr, n=n, color=color, smooth=40)


@model('w_windfarm', ao=0.5)
def w_windfarm(v):
    W, Ht, D = want('w_windfarm', v)
    R = W / 2
    top = 1.0
    deck = G['steppe'] if v else G['plain']
    parts = [pad(W, D, top, dk(deck, 0.12), deck, seg=18)]
    # a patchwork of fields under the turbines
    fields = [mixc(L(deck), L(C.lemon), 0.3), dk(deck, 0.16), mixc(L(deck), L(G['forest']), 0.45), mixc(L(deck), L(C.tan), 0.35)]
    for i in range(4):
        a = math.radians(i * 90 + 30 + v * 25)
        d = R * 0.5
        parts.append(prism(rrect(8.5, 6.0, 1.2, 2), 0.14, at=(math.cos(a) * d, math.sin(a) * d, top - 0.06),
                           rot=(0, 0, math.degrees(a) + 12), color=fields[(i + v) % 4]))
    hub_z = top + 6.4
    blade = Ht - hub_z - 0.04
    for i in range(7):
        a = (i / 7) * 2 * math.pi + 0.4
        d = R * (0.2 + (i % 3) * 0.2)
        x, y = math.cos(a) * d, math.sin(a) * d
        tw = revolve([(0.42, 0.0), (0.36, 0.2), (0.2, 6.4), (0.0, 6.42)], seg=8, color=C.white, smooth=50,
                     cap_bottom=False)
        recolor(tw, lambda p, n: C.lightgrey if p.z < 0.25 else None)
        deform(tw, lambda p, x=x, y=y: p + Vector((x, y, top)))
        parts.append(tw)
        parts.append(block(0.8, 1.7, 0.75, at=(x, y + 0.25, hub_z - 0.38), color=C.offwhite, inset=0.12, rise=0.12,
                           floor=True))
        parts.append(blob(0.34, (x, y - 0.66, hub_z), C.white, seg=6, rings=3, scale=(1, 1.3, 1)))
        spin = 90.0 if i == v else 360 * hash01(v, i, 61)
        for k in range(3):
            ba = math.radians(spin + k * 120)
            tip = (x + math.cos(ba) * blade, y - 0.72, hub_z + math.sin(ba) * blade)
            root = (x + math.cos(ba) * 0.25, y - 0.72, hub_z + math.sin(ba) * 0.25)
            bl = blade_sweep(root, tip, 0.72, 0.14, C.white)
            recolor(bl, lambda p, n, x=x: C.red if math.hypot(p.x - x, p.z - hub_z) > blade * 0.86 else None)
            parts.append(bl)
    return parts


def toy_plane(x, y, z, s, body, tail, rz=0.0):
    """A parked airliner, nose to -Y: rounded fuselage, swept wings, a coloured fin."""
    fus = sweep([(0, -5.6 * s, 0.9 * s), (0, -4.6 * s, 0.95 * s), (0, -2.0 * s, 1.0 * s), (0, 3.4 * s, 1.0 * s),
                 (0, 5.4 * s, 1.35 * s)],
                [0.25 * s, 0.85 * s, 1.0 * s, 0.9 * s, 0.3 * s], n=8, color=body, smooth=60)
    wing = prism([(-7.4 * s, 1.6 * s), (-0.8 * s, -1.6 * s), (0.8 * s, -1.6 * s), (7.4 * s, 1.6 * s),
                  (7.4 * s, 2.5 * s), (0.8 * s, 1.0 * s), (-0.8 * s, 1.0 * s), (-7.4 * s, 2.5 * s)],
                 0.32 * s, at=(0, 0, 0.55 * s), color=body)
    tp = prism([(-2.8 * s, 4.6 * s), (-0.4 * s, 3.6 * s), (0.4 * s, 3.6 * s), (2.8 * s, 4.6 * s),
                (2.8 * s, 5.3 * s), (-2.8 * s, 5.3 * s)], 0.22 * s, at=(0, 0, 1.2 * s), color=body)
    fin = prism([(3.2 * s, 0.0), (5.6 * s, 0.0), (5.9 * s, 2.6 * s), (5.0 * s, 2.6 * s)], 0.3 * s,
                rot=(90, 0, 90), at=(0.15 * s, 0, 1.5 * s), color=tail)
    parts = [fus, wing, tp, fin]
    for o in parts:
        xform(o, rot_z(rz), (x, y, z))
    return parts


@model('w_airport', ao=0.55)
def w_airport(v):
    W, Ht, D = want('w_airport', v)
    top = 1.6
    parts = [prism(rrect(W, D, 9.0, 3), top, color=dk(G['plainDry'], 0.12), bevel=0.5, seg=1)]
    recolor(parts[0], lambda p, n: G['plainDry'] if n.z > 0.5 else None)
    asph = G['urbanDk']
    # the main runway (north) and the crosswind one (south), paint on both
    for (k0, y0, ln, wd, rz) in ((0, 22.0, W * 0.94, 13.0, 0.0), (1, -20.0, W * 0.82, 11.0, 3.4 if v else -2.9)):
        rw = prism(rrect(ln, wd, 2.0, 1), 0.5, at=(0, 0, top - 0.05), color=asph, bevel=0.12)
        xform(rw, rot_z(rz), (0, y0, 0))
        parts.append(rw)
        zz = top + 0.47
        n = 12 if k0 == 0 else 10
        m = rot_z(rz)
        for i in range(n):
            xx = -ln * 0.4 + i * ln * 0.8 / (n - 1)
            p = m @ Vector((xx, 0, 0))
            parts.append(quad(p.x, y0 + p.y, zz, ln * 0.035, wd * 0.07, C.offwhite, rz=rz))
        for s in (-1, 1):
            for k in range(4):
                p = m @ Vector((s * ln * 0.46, (k - 1.5) * wd * 0.2, 0))
                parts.append(quad(p.x, y0 + p.y, zz, ln * 0.03, wd * 0.1, C.offwhite, rz=rz))
    # taxiways and the apron
    for x in (-40.0, 38.0):
        parts.append(prism(rrect(5.0, 40.0, 1.0, 1), 0.36, at=(x, 1.0, top - 0.05), color=asph))
    parts.append(prism(rrect(84.0, 24.0, 3.0, 2), 0.3, at=(-6.0, -2.0, top - 0.05), color=C.concrete, bevel=0.1))
    # the terminal: glazed hall, a long metal roof, two piers
    ty = -2.0
    parts.append(block(34.0, 15.0, 8.0, at=(0, ty, top), color=C.lightgrey, inset=0.5, rise=0.5, zs=(2.0, 6.0),
                       bands=lambda z: C.glassDark if 2.0 < z < 6.0 else None))
    parts.append(block(36.0, 17.0, 1.6, at=(0, ty, top + 7.8), color=G['metal'], inset=1.2, rise=1.0))
    for s in (-1, 1):
        parts.append(block(6.0, 22.0, 5.0, at=(s * 20.0, ty, top), color=C.offwhite, top=G['metal'],
                           inset=0.6, rise=0.6, zs=(1.8, 3.6), bands=lambda z: C.glassDark if 1.8 < z < 3.6 else None))
    # the control tower, an antenna to the top of the box
    tx, ty2 = -27.0, -11.0
    shaft = revolve([(2.2, 0.0), (1.8, 0.5), (1.5, 14.0), (2.6, 14.6), (4.2, 16.4), (4.2, 18.6), (3.8, 19.0),
                     (3.0, 19.6), (0.0, 19.8)], seg=12, color=C.white, smooth=40)
    recolor(shaft, lambda p, n: C.glassDark if 16.3 < p.z < 18.7 else (G['metal'] if p.z > 18.7 else None))
    deform(shaft, lambda p: p + Vector((tx, ty2, top)))
    parts.append(shaft)
    parts.append(_spire(0.35, Ht - top - 19.75, (tx, ty2, top + 19.75), C.red, seg=6))
    # airliners at the gates and on the taxiway
    for i in range(7):
        x = -W * 0.34 + i * (W * 0.11)
        y = ty - (15.0 if i % 2 else -14.0)
        parts += toy_plane(x, y, top + 0.3, 1.0, C.white, C.blue if (i + v) % 3 else C.red, rz=0.0)
    for i in range(4):
        a = math.radians(i * 90 + 45 + 20 * hash01(v, i, 71))
        parts.append(tree(math.cos(a) * W * 0.44, math.sin(a) * D * 0.42, top, 3.4, G['forest']))
    return parts


@model('w_dam', ao=0.6)
def w_dam(v):
    W, Ht, D = want('w_dam', v)
    parts = []
    # the gorge: a terraced rock mass on each side, a peak on each
    for s in (-1, 1):
        inner = [(25.0, -44.0), (22.0, -20.0), (25.5, 0.0), (23.0, 22.0), (26.0, 44.0)]
        outer = [(W / 2 - 3.0, 44.0), (W / 2, 18.0), (W / 2 - 2.0, -12.0), (W / 2 - 6.0, -44.0)]
        poly = list(reversed(inner + outer))
        if s < 0:
            poly = [(-x, y) for x, y in reversed(poly)]
        rock = prism(poly, 24.0, color=G['rockDk'], bevel=1.6, seg=1, smooth=35)
        recolor(rock, lambda p, n: G['steppe'] if n.z > 0.6 else None)
        parts.append(rock)
        poly2 = [(x * 0.9 + s * 5.0, y * 0.7 + 8.0) for x, y in poly]
        tier = prism(poly2, 6.0, at=(0, 0, 23.5), color=G['rock'], bevel=0.8, seg=1, smooth=35)
        recolor(tier, lambda p, n: G['plainDry'] if n.z > 0.6 else None)
        parts.append(tier)
        hp = Ht - 29.0
        pk = revolve([(15.0, 0.0), (11.0, hp * 0.3), (5.5, hp * 0.7), (1.4, hp * 0.96), (0.0, hp)], seg=9,
                     color=G['rock'], smooth=40, cap_bottom=False,
                     warp=lambda a, r, z, i: (r * (1 + 0.12 * math.sin(3 * a + 1.3)), z))
        recolor(pk, lambda p, n: G["snow"] if p.z > hp * 0.72 else None)
        deform(pk, lambda p, s=s: p + Vector((s * 46.0, 16.0, 29.0)))
        parts.append(pk)
    # the reservoir behind (upstream, +Y), the tailrace in front
    res = prism(rrect(W * 0.66, D * 0.54, 3.0, 2), 22.0, at=(0, D * 0.23, 0), color=dk(G['river'], 0.25))
    recolor(res, lambda p, n: G['river'] if n.z > 0.5 else None)
    parts.append(res)
    parts.append(prism(rrect(W * 0.44, D * 0.32, 4.0, 2), 2.0, at=(0, -D * 0.33, 0), color=G['river'], bevel=0.4))
    # the wall: one arched concrete band, bulging downstream, crest road on top
    N = 12
    arc = []
    for i in range(N):
        t = i / (N - 1) - 0.5
        arc.append((t * W * 0.74, 6.0 - math.cos(t * 2.2) * 7.0, 0.0))
    wall = ribbon(arc, 11.0, 30.4, color=C.concrete, ch=2.4, smooth=30)
    recolor(wall, lambda p, n: C.concreteD if n.z > 0.5 or (abs(n.z) < 0.5 and int((p.x + 200) / (W * 0.74 / 11)) % 2) else None)
    parts.append(wall)
    for i in range(4):
        t = i / 3 - 0.5
        x = t * W * 0.6
        y = 6.0 - math.cos(t * 0.86 * 2.2) * 7.0
        parts.append(block(1.2, 1.2, 3.4, at=(x, y, 30.3), color=G['glowPale'], inset=0.3, rise=0.3))
    if v:
        for i in range(3):
            x = -14.0 + i * 14.0
            yf = 6.0 - math.cos(x / (W * 0.74) * 2.2) * 7.0 - 5.6
            pl = sweep([(x, yf + 0.2, 27.0), (x, yf - 2.5, 18.0), (x, yf - 6.0, 6.0), (x, yf - 10.0, 2.2)],
                       [(1.0, 2.8), (1.3, 3.1), (1.6, 3.6), (0.9, 4.4)], n=6, color=G['surf'], smooth=60)
            parts.append(pl)
    ph = block(20.0, 12.0, 7.0, at=(0, -D * 0.3, 0), color=G['metalDk'], inset=0.5, rise=0.5, zs=(3.2, 4.8),
               bands=lambda z: G['glowPale'] if 3.2 < z < 4.8 else None)
    parts.append(ph)
    parts.append(block(21.0, 13.0, 1.4, at=(0, -D * 0.3, 7.0), color=G['metal'], inset=0.5, rise=0.5))
    return parts


def strut(p0, p1, r, color=0xcccccc, n=4, caps=False, smooth=30):
    """A thin n-sided bar from p0 to p1 — lattice members, legs, booms. Four
    sides, no caps and no bevel: eight triangles a member."""
    a, b = Vector(p0), Vector(p1)
    d = b - a
    Lh = d.length
    bm = bmesh.new()
    ring0, ring1 = [], []
    for j in range(n):
        t = 2 * math.pi * (j + 0.5) / n
        ring0.append(bm.verts.new((r * math.cos(t), r * math.sin(t), 0)))
        ring1.append(bm.verts.new((r * math.cos(t), r * math.sin(t), Lh)))
    for j in range(n):
        bm.faces.new((ring0[j], ring0[(j + 1) % n], ring1[(j + 1) % n], ring1[j]))
    if caps:
        bm.faces.new(list(reversed(ring0)))
        bm.faces.new(ring1)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = _from_bmesh(bm, 'strut')
    q = d.normalized().to_track_quat('Z', 'Y')
    deform(o, lambda p: q @ p + a)
    paint(o, color)
    return _smooth(o, smooth)


def lattice(x, y, z0, z1, half, step, r, color, braces='xy'):
    """A square lattice mast: four corner posts and a girder ring every `step`."""
    parts = [strut((x + sx * half, y + sy * half, z0), (x + sx * half, y + sy * half, z1), r, color)
             for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    n = max(1, int((z1 - z0) / step))
    for k in range(1, n + 1):
        z = z0 + (z1 - z0) * k / n
        c = [(x - half, y - half), (x + half, y - half), (x + half, y + half), (x - half, y + half)]
        for i in range(4):
            a, b = c[i], c[(i + 1) % 4]
            parts.append(strut((a[0], a[1], z), (b[0], b[1], z), r * 0.75, color))
        if 'd' in braces and k < n:
            zb = z0 + (z1 - z0) * (k + 1) / n
            parts.append(strut((x - half, y - half, z), (x + half, y - half, zb), r * 0.6, color))
            parts.append(strut((x + half, y - half, z), (x + half, y + half, zb), r * 0.6, color))
    return parts


def dish(at, R, color, tilt=25.0, turn=0.0, seg=10):
    """A tracking dish: a shallow bowl with thickness, tilted back."""
    o = revolve([(0.0, 0.0), (R * 0.5, R * 0.1), (R, R * 0.42), (R * 0.9, R * 0.46), (R * 0.45, R * 0.2),
                 (0.0, R * 0.14)], seg=seg, color=color, smooth=50, cap_bottom=False, cap_top=False)
    recolor(o, lambda p, n: dk(color, 0.12) if n.z < 0 else None)
    m = rot_z(turn) @ Matrix.Rotation(math.radians(tilt), 3, 'Y')
    return xform(o, m, at)


@model('w_spaceport', ao=0.55)
def w_spaceport(v):
    W, Ht, D = want('w_spaceport', v)
    top = 1.6
    parts = [pad(W, D, top, dk(G['steppe'], 0.14), G['steppe'], seg=20)]
    rx, ry = 10.6, 5.3            # the rocket (game z -5.3 -> Blender +5.3)
    # the launch apron, a flame trench, the crawlerway out to the assembly building
    parts.append(prism(ellipse(16.5, 16.5, 20, rx - 2.0, ry - 1.0), 0.9, at=(0, 0, top - 0.05), color=C.concrete,
                       bevel=0.25))
    parts.append(quad(rx + 6.5, ry, top + 0.86, 6.0, 3.2, C.charcoal))
    vx, vy = -26.4, -15.8
    ang = math.degrees(math.atan2(ry - vy, rx - vx))
    cw = prism(rrect(40.0, 9.0, 1.5, 1), 0.7, color=C.concreteD)
    xform(cw, rot_z(ang), ((vx + rx) / 2 - 3.0, (vy + ry) / 2 - 2.0, top - 0.05))
    parts.append(cw)
    # the vehicle assembly building: a tall white box with a blue band and a huge door
    parts.append(block(24.0, 22.0, 26.0, at=(vx, vy, top), color=C.offwhite, inset=0.5, rise=0.5, zs=(15.4, 23.4),
                       bands=lambda z: G['solar'] if 15.4 < z < 23.4 else None))
    parts.append(block(25.0, 23.0, 1.6, at=(vx, vy, top + 25.8), color=C.lightgrey, inset=0.6, rise=0.6))
    parts.append(block(0.8, 7.0, 19.0, at=(vx + 12.2, vy + 1.0, top), color=G['metalDk'], inset=0.2, rise=0.2))
    # the rocket: white, three red bands, a red-tipped nose, four fins
    z0 = top + 0.9
    hn = Ht - z0
    prof = [(2.4, -0.6), (3.3, 0.0), (3.3, 0.6), (3.2, 1.0)]
    for zc in (9.5, 23.5, 37.5):
        prof += [(3.2, zc - 0.7), (3.3, zc - 0.6), (3.3, zc + 0.6), (3.2, zc + 0.7)]
    prof += [(3.2, 44.0), (2.9, 47.2), (2.2, 50.0), (1.2, 52.4), (0.45, hn - 0.4), (0.0, hn)]
    body = revolve(prof, seg=10, color=C.white, smooth=40)
    recolor(body, lambda p, n: C.redDark if (any(abs(p.z - zc) < 0.72 for zc in (9.5, 23.5, 37.5)) or p.z > 51.2)
            else (C.charcoal if p.z < 0.2 else None))
    deform(body, lambda p: p + Vector((rx, ry, z0)))
    parts.append(body)
    for k in range(4):
        a = 45 + 90 * k
        f = prism([(3.0, 0.0), (6.6, 0.0), (6.6, 2.2), (3.0, 9.5)], 0.7, rot=(90, 0, 0), color=C.redDark, bevel=0.15)
        deform(f, lambda p: p + Vector((0, 0.35, 0)))
        xform(f, rot_z(a), (rx, ry, z0))
        parts.append(f)
    # the service tower: an open lattice with a swing arm and a beacon
    gx = rx - 7.5
    parts += lattice(gx, ry, top, top + 50.0, 1.7, 8.33, 0.32, G['metalDk'], braces='xyd')
    parts.append(block(4.6, 4.6, 1.6, at=(gx, ry, top + 50.0), color=G['metalDk'], inset=0.3, rise=0.3, floor=True))
    parts.append(block(5.4, 2.2, 1.6, at=(gx + 3.3, ry, top + 42.0), color=C.lightgrey, inset=0.25, rise=0.25,
                       floor=True))
    parts.append(blob(0.6, (gx, ry, top + 52.0), C.red, seg=6, rings=3))
    # tracking dishes along the east side
    for i in range(3):
        x, y = 26.4, 3.5 - i * 11.0
        parts.append(revolve([(0.9, 0.0), (0.6, 0.4), (0.5, 4.2), (0.0, 4.3)], seg=6, color=G['metalDk'],
                             smooth=40, cap_bottom=False))
        deform(parts[-1], lambda p, x=x, y=y: p + Vector((x, y, top)))
        parts.append(dish((x, y, top + 4.0), 4.6, C.white, tilt=24.0, turn=180.0 + i * 15.0, seg=8))
    if v:
        dm = revolve([(9.0, 0.0), (8.7, 2.4), (7.8, 4.6), (6.0, 6.8), (3.4, 8.4), (0.0, 9.0)], seg=14,
                     color=G['metal'], smooth=50, cap_bottom=False)
        recolor(dm, lambda p, n: G['metalDk'] if p.z < 0.6 else None)
        deform(dm, lambda p: p + Vector((W * 0.33, D * 0.26, top)))
        parts.append(dm)
    return parts


@model('w_pyramids', ao=0.55)
def w_pyramids(v):
    W, Ht, D = want('w_pyramids', v)
    top = 3.0
    parts = [pad(W, D, top, G['sandDeep'], G['sand'], seg=22)]
    # the river valley along the north edge: a green bank, the water on it
    nile = [(x, 44.0 - x * x / 250.0, top - 0.05) for x in [-47 + 94 * i / 11 for i in range(12)]]
    parts.append(ribbon(nile, 24.0, 0.3, color=mixc(L(G['plain']), L(G['sand']), 0.25), ch=0.12))
    parts.append(ribbon(nile, 11.0, 0.62, color=G['river'], ch=0.2))
    # three pyramids on a shared bearing, pale capstones, faint courses
    rot = math.degrees(0.18)
    s0 = (Ht - top) / 38.0
    for k, (x, y, w, h) in enumerate(((-16.0, 10.0, 46.0, 38.0 * s0), (18.0, -4.0, 34.0, 28.0), (40.0, -22.0, 22.0, 18.0))):
        R = w / math.sqrt(2)
        fr = (0.0, 0.2, 0.4, 0.6, 1.0)
        py = revolve([(R * (1 - f), h * f) for f in fr[:-1]] + [(0.0, h)], seg=4, color=G['sandDeep'], smooth=20,
                     phase=math.radians(45 + rot), cap_bottom=False)
        recolor(py, lambda p, n, h=h: G['sand'] if p.z > h * 0.6 else (dk(G['sandDeep'], 0.07) if 0.2 * h < p.z < 0.4 * h else None))
        deform(py, lambda p, x=x, y=y: p + Vector((x, y, top)))
        parts.append(py)
    # three little queens' pyramids beside the great one
    for i in range(3):
        x, y = -44.0 + i * 9.0, -12.0 - i * 1.5
        R = 3.6 / math.sqrt(2) * 2
        q = revolve([(R, 0.0), (0.0, 5.0)], seg=4, color=G['sandDeep'], smooth=20, phase=math.radians(45 + rot),
                    cap_bottom=False)
        deform(q, lambda p, x=x, y=y: p + Vector((x, y, top)))
        parts.append(q)
    # the valley temple and its causeway
    tx, ty = -34.0, -42.0
    parts.append(ribbon([(tx + 4.0, ty + 7.0, top - 0.05), (-22.0, -12.0, top - 0.05)], 6.0, 0.9,
                        color=G['sandDeep'], ch=0.3))
    parts.append(block(18.0, 13.0, 3.0, at=(tx, ty, top), color=C.tan, inset=0.4, rise=0.4))
    for row in (-1, 1):
        for i in range(5):
            c = revolve([(0.9, 0.0), (0.8, 5.2), (0.0, 5.21)], seg=6, color=C.cream, smooth=40, cap_bottom=False)
            deform(c, lambda p, i=i, row=row: p + Vector((tx - 6.4 + i * 3.2, ty + row * 4.2, top + 2.9)))
            parts.append(c)
    parts.append(block(18.4, 12.0, 1.2, at=(tx, ty, top + 8.0), color=C.cream, inset=0.3, rise=0.3))
    parts.append(gable_roof(18.4, 12.0, 2.0, at=(tx, ty, top + 9.1), color=C.tan, rz=90.0, bevel=0.2))
    # palms along the river
    for i in range(7 if v else 4):
        t = (i + 0.5) / (7 if v else 4)
        x = -40.0 + 80.0 * t + (hash01(v, i, 81) - 0.5) * 6.0
        side = -1 if i % 2 else 1
        y = 44.0 - x * x / 250.0 + side * 8.5
        tr = revolve([(0.45, 0.0), (0.3, 4.6), (0.0, 4.7)], seg=5, color=C.trunk, smooth=50, cap_bottom=False)
        deform(tr, lambda p, x=x, y=y: p + Vector((x, y, top)))
        parts.append(tr)
        cr = blob(2.4, (x, y, top + 4.8), G['jungle'], seg=7, rings=3, scale=(1, 1, 0.42))
        parts.append(cr)
    return parts


def dome_h(u):
    """A hill's height fraction at radius fraction u (0 centre, 1 foot)."""
    if u >= 1:
        return 0.0
    return (1 - u * u) ** 0.85


@model('w_wall', ao=0.55, ao_dist=22.0)
def w_wall(v):
    Lw = 520.0
    top = 3.0
    parts = [pad(Lw * 1.12, Lw, top, dk(G['steppe'], 0.15), G['steppe'], seg=30)]
    ph = v * 1.1
    amp = Lw * 0.24

    def path(t):
        return (t, -math.sin(t / Lw * 5.2 + ph) * amp)

    # hills strung along the line of the wall, alternately to either side
    hills = []
    for i in range(9):
        t = (i / 8 - 0.5) * Lw * 0.92 + (hash01(v, i, 91) - 0.5) * 20
        px, py = path(t)
        Rh = Lw * (0.07 + 0.04 * hash01(v, i, 92))
        Hh = 13.0 + 11.0 * hash01(v, i, 93) if i != 4 else 24.0
        off = (Rh * 0.35) * (1 if i % 2 else -1)
        hills.append((px + off * 0.3, py + off, Rh, Hh))
    for k, (hx, hy, Rh, Hh) in enumerate(hills):
        fr = (0.0, 0.3, 0.55, 0.78, 1.0)
        hl = revolve([(Rh * (1 - f), Hh * dome_h(1 - f)) for f in fr], seg=11, color=G['steppe'], smooth=45,
                     cap_bottom=False,
                     warp=lambda a, r, z, i, k=k: (r * (1 + 0.1 * math.sin(3 * a + k)), z))
        body = G['plain'] if k % 2 else G['forest']
        crown = G['rock'] if k % 2 else G['scree']
        paint(hl, body)
        recolor(hl, lambda p, n, Hh=Hh, crown=crown: crown if p.z > Hh * 0.8 else None)
        deform(hl, lambda p, hx=hx, hy=hy: p + Vector((hx, hy, top - 0.4)))
        parts.append(hl)

    def ground(x, y):
        g = 0.0
        for hx, hy, Rh, Hh in hills:
            g = max(g, Hh * dome_h(math.hypot(x - hx, y - hy) / Rh))
        return top + g

    # the wall rides the ground: walkway on top, watchtowers every so often
    N = 56
    pts = []
    for i in range(N):
        t = (i / (N - 1) - 0.5) * Lw * 0.94
        x, y = path(t)
        pts.append((x, y, ground(x, y) - 1.2))
    wall = ribbon(pts, 13.0, 12.0, color=C.concrete, ch=1.8, smooth=35)
    recolor(wall, lambda p, n: C.lightgrey if n.z > 0.5 else None)
    parts.append(wall)
    for i in range(3, N - 2, 9):
        x, y, z = pts[i]
        a = math.degrees(math.atan2(pts[i + 1][1] - pts[i - 1][1], pts[i + 1][0] - pts[i - 1][0]))
        parts.append(block(19.0, 19.0, 18.0, at=(x, y, z), color=C.concrete, inset=0.8, rise=0.8, rz=a))
        parts.append(block(22.0, 22.0, 3.0, at=(x, y, z + 17.4), color=C.offwhite, top=C.roofRed, inset=1.6, rise=1.6, rz=a))
    # woods in the valleys
    for i in range(4):
        a = math.radians(i * 90 + 20 + v * 30)
        x, y = math.cos(a) * Lw * 0.38, math.sin(a) * Lw * 0.3
        for k in range(3):
            b = math.radians(k * 120 + i * 40)
            parts.append(tree(x + math.cos(b) * 13, y + math.sin(b) * 13, top, 10.0 + 3.0 * hash01(v, i, k, 95),
                              G['forest']))
    return fit(parts, 'w_wall', v)


# ---------------------------------------------------------------- at sea

@model('w_oilrig', ao=0.55)
def w_oilrig(v):
    S = 21.0
    leg = S * 0.62
    deck_z = 26.0
    parts = []
    # four splayed legs standing in the sea, a white splash ring at each foot
    for sx in (-1, 1):
        for sy in (-1, 1):
            lg = revolve([(1.9, 0.0), (1.6, 3.0), (1.35, deck_z)], seg=10, color=G['metalDk'], smooth=40,
                         cap_top=False)
            recolor(lg, lambda p, n: C.yellow if p.z < 3.0 else None)
            deform(lg, lambda p, sx=sx, sy=sy: Vector((p.x + sx * (leg + (deck_z - p.z) * 0.05), p.y + sy * (leg + (deck_z - p.z) * 0.05), p.z)))
            parts.append(lg)
    # braces: two girder rings and crossed diagonals on each face
    for z in (9.0, 18.0):
        c = [(-1, -1), (1, -1), (1, 1), (-1, 1)]
        for i in range(4):
            a, b = c[i], c[(i + 1) % 4]
            o = leg + (deck_z - z) * 0.05
            parts.append(strut((a[0] * o, a[1] * o, z), (b[0] * o, b[1] * o, z), 0.55, G['metalDk']))
    for i in range(4):
        c = [(-1, -1), (1, -1), (1, 1), (-1, 1)]
        a, b = c[i], c[(i + 1) % 4]
        o1, o2 = leg + (deck_z - 9.0) * 0.05, leg + (deck_z - 18.0) * 0.05
        parts.append(strut((a[0] * o1, a[1] * o1, 9.0), (b[0] * o2, b[1] * o2, 18.0), 0.4, G['metalDk']))
        parts.append(strut((b[0] * o1, b[1] * o1, 9.0), (a[0] * o2, a[1] * o2, 18.0), 0.4, G['metalDk']))
    # the deck: a steel box with a yellow safety band
    parts.append(block(S * 1.6, S * 1.5, 4.0, at=(0, 0, deck_z), color=G['metal'], top=dk(G['metal'], 0.12),
                       inset=0.5, rise=0.5, zs=(1.0, 2.2), bands=lambda z: C.yellow if 1.0 < z < 2.2 else None, floor=True))
    dz = deck_z + 4.0
    # living quarters with a lit window strip, and the helipad on the far corner
    parts.append(block(S * 0.7, S * 0.6, 8.0, at=(-S * 0.36, -S * 0.3, dz), color=C.offwhite, top=C.lightgrey,
                       inset=0.4, rise=0.4, zs=(4.4, 5.8, 1.6, 3.0),
                       bands=lambda z: G['glowPale'] if (4.4 < z < 5.8 or 1.6 < z < 3.0) else None))
    hp = revolve([(S * 0.3, 0.0), (S * 0.3, 0.7), (S * 0.29, 1.0), (S * 0.2, 1.0), (S * 0.15, 1.0), (0.0, 1.0)],
                 seg=14, color=C.lightgrey, smooth=40)
    recolor(hp, lambda p, n: C.green if n.z > 0.5 and math.hypot(p.x, p.y) < S * 0.2 else
            (C.yellow if n.z > 0.5 and math.hypot(p.x, p.y) < S * 0.29 else None))
    deform(hp, lambda p: p + Vector((S * 0.44, S * 0.3, dz)))
    parts.append(hp)
    # the derrick: a tapering lattice tower and its red crown
    dx = S * 0.1
    der = revolve([(5.0, 0.0), (2.2, 19.0), (0.0, 19.01)], seg=4, color=G['metalDk'], smooth=20, cap_bottom=False,
                  phase=math.radians(45))
    deform(der, lambda p: p + Vector((dx, 0, dz)))
    parts.append(der)
    for k in range(3):
        z = 4.0 + k * 5.0
        r = 5.0 - (5.0 - 2.2) * z / 19.0
        parts.append(block(r * 1.5, r * 1.5, 0.8, at=(dx, 0, dz + z), color=C.red if k == 1 else G['metal'],
                           inset=0.2, rise=0.2))
    parts.append(block(2.4, 2.4, 53.33 - dz - 19.0, at=(dx, 0, dz + 19.0), color=C.red, inset=0.3, rise=0.3))
    # a yellow crane, and the flare boom out over the sea (+Y)
    parts.append(revolve([(1.0, 0.0), (0.8, 4.0), (0.0, 4.01)], seg=6, color=C.yellow, smooth=30))
    deform(parts[-1], lambda p: p + Vector((S * 0.6, -S * 0.6, dz)))
    parts.append(strut((S * 0.6, -S * 0.6, dz + 3.6), (S * 0.05, -S * 0.66, dz + 11.0), 0.45, C.yellow, caps=True))
    y0, y1 = S * 0.62, S * 1.36
    parts.append(strut((-S * 0.5, y0, dz + 1.0), (-S * 0.5, y1, dz + 8.0), 0.7, G['metalDk'], caps=True))
    if v:
        fl = revolve([(2.3, 0.0), (1.8, 2.4), (0.8, 5.0), (0.0, 6.2)], seg=8, color=G['lava'], smooth=60)
        recolor(fl, lambda p, n: C.yellow if p.z < 1.8 else None)
        deform(fl, lambda p: p + Vector((-S * 0.5, y1 + 0.6, dz + 7.6)))
        parts.append(fl)
    return fit(parts, 'w_oilrig', v)


@model('w_ship', ao=0.55)
def w_ship(v):
    Ls, Ws = 290.0, 44.0
    hull_c = [C.redDark, C.navy, C.greenDark][v]
    parts = []
    # hull: a pointed bow at -Y (game front), a squared stern; dark below the waterline
    def plan(w, bow, stern, n=6):
        pts = [(w / 2, stern), (w / 2, bow * 0.62)]
        for i in range(1, n):
            t = i / n
            pts.append((w / 2 * math.cos(t * math.pi / 2) ** 0.8, bow * 0.62 + (bow - bow * 0.62) * math.sin(t * math.pi / 2)))
        pts.append((0.0, bow))
        for x, y in reversed(pts[1:-1]):
            pts.append((-x, y))
        pts.append((-w / 2, stern))
        return list(reversed(pts))
    lo = prism(plan(Ws * 0.96, -Ls * 0.46, Ls * 0.42), 7.0, color=C.charcoal, bevel=1.2, seg=1, smooth=35)
    recolor(lo, lambda p, n: C.red if p.z < 3.5 and abs(n.z) < 0.5 else None)
    up = prism(plan(Ws, -Ls * 0.5, Ls * 0.43), 13.6, at=(0, 0, 6.4), color=hull_c, bevel=1.4, seg=1, smooth=35)
    recolor(up, lambda p, n: C.charcoal if n.z > 0.5 else (C.white if p.z > 17.8 and abs(n.z) < 0.5 else None))
    parts += [lo, up]
    # container stacks: nine bays, two stacks a bay, tiers in mixed colours
    cols = [C.red, C.blue, C.yellow, C.green, C.orange, C.teal, C.lightgrey]
    tier = 6.6
    for i in range(9):
        y = Ls * 0.3 - i * Ls * 0.066
        for k, s in enumerate((-1, 1)):
            n = 3 if hash01(v, i, k, 101) > 0.2 else 2
            ccs = [cols[(r * 3 + i + v + k * 2) % len(cols)] for r in range(n)]
            zs = [tier * (r + 1) for r in range(n - 1)]
            zs2 = []
            for z in zs:
                zs2 += [z - 0.35, z + 0.35]
            parts.append(block(Ws * 0.42, Ls * 0.06, tier * n, at=(s * Ws * 0.235, y, 20.0), color=ccs[-1],
                               inset=0.35, rise=0.35, zs=zs2,
                               bands=lambda z, ccs=ccs: dk(ccs[min(len(ccs) - 1, int(z // tier))], 0.4)
                               if any(abs(z - zz) < 0.36 for zz in zs) else ccs[min(len(ccs) - 1, int(z // tier))],
                               top=dk(ccs[-1], 0.08)))
    # the bridge aft, its wings, a funnel with a red band, two orange lifeboats
    by = Ls * 0.37
    parts.append(block(Ws * 0.7, Ls * 0.055, 26.0, at=(0, by, 20.0), color=C.white, inset=0.6, rise=0.6,
                       zs=(5.0, 6.6, 12.0, 13.6, 20.6, 23.4),
                       bands=lambda z: C.glassDark if (20.6 < z < 23.4) else (dk(C.white, 0.2) if (5.0 < z < 6.6 or 12.0 < z < 13.6) else None)))
    parts.append(block(Ws * 1.0, Ls * 0.045, 2.6, at=(0, by - 1.0, 43.6), color=C.white, top=C.lightgrey,
                       inset=0.5, rise=0.5, floor=True))
    parts.append(block(Ws * 0.76, Ls * 0.06, 2.0, at=(0, by, 46.0), color=C.lightgrey, inset=0.5, rise=0.5))
    fy = Ls * 0.4 + 2.0
    fun = revolve([(5.0, 0.0), (4.6, 15.5), (4.8, 15.6), (4.8, 18.4), (4.4, 18.6), (3.6, 18.6), (3.6, 17.0),
                   (0.0, 17.0)], seg=12, color=C.charcoal, smooth=40, cap_bottom=False)
    recolor(fun, lambda p, n: C.red if 12.0 < p.z < 15.6 else None)
    deform(fun, lambda p: Vector((p.x, p.y * 1.3, p.z)) + Vector((0, fy, 47.0)))
    parts.append(fun)
    for s in (-1, 1):
        parts.append(blob(2.2, (s * (Ws * 0.35 + 1.8), by - 4.0, 34.0), C.orange, seg=8, rings=4, scale=(0.8, 1.8, 0.7)))
    # the wake: a pale fan spreading astern
    wk = prism([(-4.0, 0.0), (4.0, 0.0), (Ws * 0.75, Ls * 0.2), (Ws * 0.4, Ls * 0.22), (0.0, Ls * 0.12),
                (-Ws * 0.4, Ls * 0.22), (-Ws * 0.75, Ls * 0.2)], 0.7, at=(0, Ls * 0.42, 0.0), color=G['surf'],
               bevel=0.2)
    parts.append(wk)
    # a bow wave curling either side of the stem
    parts.append(prism([(0.0, 0.0), (Ws * 0.5, Ls * 0.05), (Ws * 0.42, Ls * 0.07), (0.0, Ls * 0.025),
                        (-Ws * 0.42, Ls * 0.07), (-Ws * 0.5, Ls * 0.05)], 1.0, at=(0, -Ls * 0.49, 0.0),
                       color=G['surf'], bevel=0.2))
    return fit(parts, 'w_ship', v)


# ---------------------------------------------------------------- in the air

def panel_wing(x0, x1, y, z, depth, n, col, frame, t=0.5):
    """A solar wing from x0 to x1: n panels with dark seams and a frame spar."""
    parts = []
    span = (x1 - x0) / n
    for i in range(n):
        cx = x0 + (i + 0.5) * span
        parts.append(block(abs(span) * 0.92, depth, t, at=(cx, y, z - t / 2), color=col,
                           top=lt(col, 0.08), inset=t * 0.3, rise=t * 0.3, floor=True))
    parts.append(strut((x0, y, z), (x1, y, z), t * 0.6, frame))
    return parts


@model('w_satellite', ao=0.5)
def w_satellite(v):
    S = 8.0
    parts = []
    body = block(S, S * 0.9, S * 1.1, at=(0, 0, S * 0.5), color=G['metal'], top=lt(G['metal'], 0.2),
                 inset=S * 0.1, rise=S * 0.1, zs=(S * 0.35, S * 0.65),
                 bands=lambda z: C.gold if S * 0.35 < z < S * 0.65 else None, floor=True)
    parts.append(body)
    # two solar wings on booms
    for s in (-1, 1):
        parts.append(strut((s * S * 0.5, 0, S * 1.05), (s * S * 1.1, 0, S * 1.05), S * 0.06, G['metalDk'], caps=True))
        parts.append(blob(S * 0.12, (s * S * 1.1, 0, S * 1.05), G['metalDk'], seg=6, rings=3))
        parts += panel_wing(s * S * 1.1, s * S * 3.7, 0, S * 1.05, S * 1.5, 3, G['solar'], C.charcoal, t=S * 0.08)
    # the big dish on top, tipped toward the ground station, and a whip antenna
    parts.append(revolve([(S * 0.18, 0.0), (S * 0.14, S * 0.25), (0.0, S * 0.26)], seg=8, color=G['metalDk']))
    deform(parts[-1], lambda p: p + Vector((0, 0, S * 1.6)))
    d = dish((0, 0, 0), S * 1.1, C.white, tilt=0.0, seg=14)
    parts.append(xform(d, Matrix.Rotation(-0.5, 3, 'X'), (0, 0, S * 1.85)))
    parts.append(blob(S * 0.12, (0, -S * 0.22, S * 2.3), C.gold, seg=6, rings=3))
    parts.append(strut((S * 0.2, 0.0, S * 1.6), (S * 0.6, 0.0, S * 2.8), S * 0.05, G['metalDk']))
    parts.append(blob(S * 0.14, (S * 0.6, 0.0, S * 2.9), C.red, seg=8, rings=4))
    if v == 2:
        parts.append(strut((0, S * 0.45, S * 0.5), (0, S * 2.5, S * 0.5), S * 0.07, G['metalDk'], caps=True))
        parts.append(blob(S * 0.2, (0, S * 2.55, S * 0.5), C.gold, seg=8, rings=4))
    else:
        parts.append(blob(S * 0.3, (0, S * 0.46, S * 0.35), C.gold, seg=8, rings=4, scale=(1, 0.5, 1)))
    return fit(parts, 'w_satellite', v)


def capsule_x(x0, x1, y, z, r, color, band, seg=12, axis='x'):
    """A pressurised module: a cylinder with domed ends and two metal rings."""
    Lm = x1 - x0
    prof = [(0.0, 0.0), (r * 0.6, r * 0.12), (r * 0.92, r * 0.4), (r, r * 0.8),
            (r, Lm * 0.3), (r * 1.04, Lm * 0.3 + r * 0.05), (r * 1.04, Lm * 0.3 + r * 0.35), (r, Lm * 0.3 + r * 0.4),
            (r, Lm - r * 0.8), (r * 0.92, Lm - r * 0.4), (r * 0.6, Lm - r * 0.12), (0.0, Lm)]
    o = revolve(prof, seg=seg, color=color, smooth=50)
    recolor(o, lambda p, n: band if Lm * 0.3 - 0.01 < p.z < Lm * 0.3 + r * 0.41 else None)
    if axis == 'x':
        xform(o, Matrix.Rotation(math.radians(90), 3, 'Y'), (x0, y, z))
    else:
        xform(o, Matrix.Rotation(math.radians(-90), 3, 'X'), (y, x0, z))
    return o


@model('w_station', ao=0.5)
def w_station(v):
    S = 34.0
    parts = []
    zt = S * 1.2
    # the long truss: a square girder with dark bays, a few cross braces
    tr = block(S * 8, S * 0.22, S * 0.22, at=(0, 0, zt - S * 0.11), color=G['metalDk'], inset=S * 0.03,
               rise=S * 0.03, floor=True)
    parts.append(tr)
    for i in range(9):
        x = -S * 3.6 + i * S * 0.9
        parts.append(strut((x, -S * 0.13, zt - S * 0.13), (x + S * 0.45, -S * 0.13, zt + S * 0.13), S * 0.03, G['metal']))
    # the pressurised core: four modules fore-and-aft, one long one across, a node
    for i in range(4):
        x = -S * 1.2 + i * S * 0.9
        parts.append(capsule_x(-S * 0.75, S * 0.75, x, S * 0.6, S * 0.34, C.white, G['metal'], seg=12, axis='y'))
    parts.append(capsule_x(-S * 1.1, S * 1.1, 0, S * 0.6, S * 0.3, C.white, C.gold, seg=12))
    parts.append(blob(S * 0.36, (0, 0, S * 0.24), G['metal'], seg=12, rings=6))
    parts.append(strut((0, 0, S * 0.6), (0, 0, zt), S * 0.08, G['metalDk']))
    if v:
        parts.append(capsule_x(-S * 0.45, S * 0.45, S * 2.0, S * 0.6, S * 0.26, G['metal'], C.gold, seg=12, axis='y'))
        parts.append(strut((S * 2.0, 0, S * 0.6), (S * 2.0, 0, zt), S * 0.06, G['metalDk']))
    # four solar wings, gold-edged blue panels
    for s in (-1, 1):
        for k in (-1, 1):
            y = k * S * 0.9
            parts.append(strut((s * S * 1.65, 0, zt), (s * S * 1.65, y, zt), S * 0.04, G['metalDk']))
            parts += panel_wing(s * S * 1.65, s * S * 3.55, y, zt, S * 1.2, 4, G['solar'], C.gold, t=S * 0.06)
    # radiators: pale fins standing above the truss
    for s in (-1, 1):
        parts.append(strut((s * S * 1.4, 0, zt), (s * S * 1.4, 0, S * 1.65), S * 0.04, G['metalDk']))
        parts.append(block(S * 0.9, S * 1.6, S * 0.06, at=(s * S * 1.4, 0, S * 1.67), color=C.white,
                           top=C.lightgrey, inset=S * 0.02, rise=S * 0.02, floor=True))
    return fit(parts, 'w_station', v)


# ---------------------------------------------------------------- weather

def cloud_grade(o, z0, z1, top=None, under=None):
    """White on top, a cool grey underneath."""
    t = L(G['cloud']) if top is None else L(top)
    u = L(G['cloudGrey']) if under is None else L(under)
    paint(o, t, lambda p: mixc(u, t, max(0.0, min(1.0, (p.z - z0) / max(1e-6, z1 - z0)))))
    return o


@model('w_hurricane', ao=0.3, ao_dist=40.0)
def w_hurricane(v):
    R, H = 400.0, 62.0
    arms = 3 + v
    parts = []
    for a in range(arms):
        ph = (a / arms) * 2 * math.pi
        pts, rr = [], []
        n = 14
        for i in range(n):
            t = i / (n - 1)
            rad = R * (0.14 + t * 0.86)
            ang = ph + t * 3.0
            # game (x, z) -> Blender (x, -z)
            pts.append((math.cos(ang) * rad, -math.sin(ang) * rad, H * (0.5 - t * 0.24)))
            puff = 1.0 + 0.22 * math.sin(i * 2.6 + a)
            w = R * (0.12 + t * 0.06) * puff * (1 - 0.7 * t ** 3)
            h = H * (0.3 - t * 0.17) * puff
            rr.append((w, h))
        arm = sweep(pts, rr, n=8, color=G['cloud'], smooth=70)
        cloud_grade(arm, 4.0, H * 0.6)
        parts.append(arm)
    # the central overcast and its eye wall: a puffed ring round a clear eye
    ew = revolve([(R * 0.07, H * 0.18), (R * 0.09, H * 0.66), (R * 0.15, H * 0.95), (R * 0.25, H * 1.0),
                  (R * 0.36, H * 0.82), (R * 0.4, H * 0.5), (R * 0.35, H * 0.2), (R * 0.2, H * 0.08),
                  (R * 0.07, H * 0.18)],
                 seg=22, color=C.white, smooth=70, cap_bottom=False, cap_top=False,
                 warp=lambda an, r, z, i: (r * (1 + (0.07 * math.sin(5 * an) if i > 1 else 0)), z))
    cloud_grade(ew, H * 0.1, H * 0.85, top=C.white)
    ew_inner = ew
    parts.append(ew_inner)
    eye = revolve([(R * 0.11, 0.0), (R * 0.11, 2.0), (0.0, 2.0)], seg=16, color=G['oceanDeep'], smooth=40)
    parts.append(eye)
    return fit(parts, 'w_hurricane', v)


@model('w_cloudbank', ao=0.3, ao_dist=30.0)
def w_cloudbank(v):
    R = 180.0
    parts = []
    for i in range(13):
        a = hash01(v, i, 121) * 2 * math.pi
        d = R * math.sqrt(hash01(v, i, 122)) * 0.7
        rr = R * (0.2 + 0.18 * hash01(v, i, 123))
        x, y = math.cos(a) * d, math.sin(a) * d
        # big puffs in the middle, flatter ones at the edge
        hs = (0.55 + 0.35 * hash01(v, i, 124)) * (1.15 - 0.5 * d / R)
        b = blob(rr, (x, y, rr * hs * 0.35), G['cloud'], seg=12, rings=6,
                 scale=(1.0, 0.85 + 0.3 * hash01(v, i, 125), hs), flat=0.0)
        cloud_grade(b, 0.0, R * 0.25, top=G['cloud'] if i % 4 != 3 else lt(G['cloudGrey'], 0.4))
        parts.append(b)
    if v > 1:
        for i in range(5):
            a = hash01(v, i, 126) * 2 * math.pi
            d = R * 0.7 * hash01(v, i, 127)
            parts.append(blob(R * 0.12, (math.cos(a) * d, math.sin(a) * d, R * 0.02), G['cloudGrey'], seg=8,
                              rings=4, scale=(0.9, 2.2, 0.4), rot=(0, 0, math.degrees(hash01(v, i, 128) * 2)),
                              flat=0.0))
    return fit(parts, 'w_cloudbank', v)


@model('w_jetstream', ao=0.3, ao_dist=30.0)
def w_jetstream(v):
    Lj = 900.0
    parts = []
    pts, rr = [], []
    n = 22
    for i in range(n):
        t = i / (n - 1)
        x = -Lj * 0.5 + t * Lj
        y = -math.sin(t * 4.2 + v) * Lj * 0.12
        z = 40 + math.sin(t * 2.6 + v) * 22
        puff = 1.0 + 0.18 * math.sin(i * 1.9 + v)
        w = Lj * (0.03 + math.sin(t * math.pi) * 0.035) * puff
        pts.append((x, y, z))
        rr.append((w, (8.0 + t * 4.0) * puff))
    rib = sweep(pts, rr, n=8, color=G['cloud'], smooth=70)
    # grey bands every so often along its length
    recolor(rib, lambda p, n: lt(G['cloudGrey'], 0.2) if int((p.x + Lj) / (Lj / 7.0)) % 3 == 2 else None)
    parts.append(rib)
    # torn wisps trailing alongside
    for i in range(7):
        t = hash01(v, i, 131)
        x = -Lj * 0.45 + t * Lj * 0.9
        side = 1 if i % 2 else -1
        y = -math.sin(t * 4.2 + v) * Lj * 0.12 + side * Lj * (0.05 + 0.04 * hash01(v, i, 132))
        z = 20 + 40 * hash01(v, i, 133)
        wl = Lj * 0.045
        ws = sweep([(x - wl, y, z), (x - wl * 0.3, y + side * 4, z + 1), (x + wl * 0.4, y + side * 6, z), (x + wl, y + side * 4, z - 1)],
                   [(4.0, 3.0), (10.0, 5.0), (8.0, 4.0), (2.5, 1.5)], n=6, color=G['cloud'], smooth=70)
        parts.append(ws)
    return fit(parts, 'w_jetstream', v)
