"""Scenery props, modelled: trees, rocks, clouds, landforms, and the town and
city's small buildings and landmarks.

Frame reminder (see kit.py): Blender Z is up, X is the prop's width, and the
game's FRONT (+Z) is Blender -Y. Sizes are real metres, matched to
out/specs.json — the procedural box each archetype already occupies.

The organic props (trees, rocks, clouds, the islet and the mountain) are
modelled loosely and then `fit()` to their catalogue box: v1 randomised their
outlines, so every variant's box is a little different, and the game stretches
each model to its box anyway. The built things are modelled to dimension.
"""
import math
import random
import bmesh
from mathutils import Vector, Matrix, Euler
import kit
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

def dk(col, t=0.2):
    """A darker shade of a palette colour, as linear rgb."""
    return mixc(lin(col) if isinstance(col, int) else col, (0, 0, 0), t)


def lt(col, t=0.4):
    """A lighter tint of a palette colour, as linear rgb."""
    return mixc(lin(col) if isinstance(col, int) else col, (1, 1, 1), t)


def L(col):
    return lin(col) if isinstance(col, int) else col


def target(pid, v):
    """The catalogue box in the BLENDER frame: (width X, depth Y, height Z)."""
    s = kit.SPECS[pid]['boxes'][v]['size']
    return (s[0], s[2], s[1])


def bounds(parts):
    lo = [1e9] * 3
    hi = [-1e9] * 3
    for o in parts:
        for vt in o.data.vertices:
            for i in range(3):
                lo[i] = min(lo[i], vt.co[i])
                hi[i] = max(hi[i], vt.co[i])
    return lo, hi


def fit(parts, pid, v):
    """Scale the whole prop, per axis, about its footprint centre and its
    floor, so its bounding box is exactly the catalogue box."""
    lo, hi = bounds(parts)
    want = target(pid, v)
    cx, cy = (lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2
    k = [want[i] / max(1e-9, hi[i] - lo[i]) for i in range(3)]
    for o in parts:
        for vt in o.data.vertices:
            p = vt.co
            vt.co = Vector(((p.x - cx) * k[0], (p.y - cy) * k[1], (p.z - lo[2]) * k[2]))
        o.data.update()
    return parts


def regrade(obj, fn):
    """Repaint every vertex: fn(pos Vector) -> linear rgb."""
    return paint(obj, (0, 0, 0), fn)


def revolve(prof, seg=24, color=0xcccccc, warp=None, smooth=50, cap_bottom=True, cap_top=True, phase=0.0):
    """A lathe whose rings may wobble: prof is [(r, z), ...] bottom to top, and
    warp(angle, r, z, ring_index) -> (r, z) moves each ring vertex, so a cone
    becomes a lobed mountain, a snowline drips, a square roof lifts its corners.
    A ring of radius 0 is a single pole vertex."""
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
    """A low sphere (lathed, so the ring count is free): canopy lumps, cloud
    puffs, coconuts. `flat` clamps everything below that world height onto it."""
    rings = rings or max(3, seg // 2)
    prof = [(r * math.sin(math.pi * i / rings), -r * math.cos(math.pi * i / rings)) for i in range(rings + 1)]
    o = revolve(prof, seg=seg, color=color, smooth=80)
    m = Euler(tuple(math.radians(a) for a in rot), 'XYZ').to_matrix()
    deform(o, lambda p: m @ Vector((p.x * scale[0], p.y * scale[1], p.z * scale[2])) + Vector(at))
    if flat is not None:
        deform(o, lambda p: Vector((p.x, p.y, max(p.z, flat))))
    return o


def rock(r, at, color, sub=2, scale=(1, 1, 1), seed=0, cuts=7, depth=0.18, rot=(0, 0, 0)):
    """A chunky boulder: an icosphere sliced by a few random planes, so it has
    broad flat facets like a cut toy stone rather than a lumpy potato."""
    rnd = random.Random(seed)
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=1.0)
    planes = []
    for _ in range(cuts):
        n = Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-0.6, 1))).normalized()
        planes.append((n, 1.0 - depth * rnd.uniform(0.6, 1.3)))
    for vt in bm.verts:
        p = vt.co.copy()
        for n, d in planes:
            h = p.dot(n)
            if h > d:
                p -= n * (h - d)
        vt.co = p
    o = _from_bmesh(bm, 'rock')
    m = Euler(tuple(math.radians(a) for a in rot), 'XYZ').to_matrix()
    deform(o, lambda p: m @ Vector((p.x * r * scale[0], p.y * r * scale[1], p.z * r * scale[2])) + Vector(at))
    paint(o, color)
    return _smooth(o, 32)


def sweep(points, radii, n=8, color=0xcccccc, cap0=True, cap1=True, smooth=60):
    """A tube through `points` with a radius per point (parallel-transported
    rings, so it never twists): trunks, branches, legs, braces."""
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
        for j in range(n):
            a = 2 * math.pi * j / n
            ring.append(bm.verts.new(p + (u * math.cos(a) + w * math.sin(a)) * radii[i]))
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


def rrect(w, d, r, n=4, cx=0.0, cy=0.0):
    """A rounded-rectangle outline (counter-clockwise)."""
    r = min(r, w / 2 - 1e-5, d / 2 - 1e-5)
    pts = []
    for qx, qy, a0 in ((1, 1, 0), (-1, 1, 90), (-1, -1, 180), (1, -1, 270)):
        ox, oy = cx + qx * (w / 2 - r), cy + qy * (d / 2 - r)
        for i in range(n + 1):
            a = math.radians(a0 + 90 * i / n)
            pts.append((ox + r * math.cos(a), oy + r * math.sin(a)))
    return pts


def circle(r, n=16, cx=0.0, cy=0.0, sx=1.0, sy=1.0, a0=0.0):
    return [(cx + r * sx * math.cos(a0 + 2 * math.pi * i / n), cy + r * sy * math.sin(a0 + 2 * math.pi * i / n))
            for i in range(n)]


# ---------------------------------------------------------------- trees

def canopy(rnd, R, cz, col, n=3, seg_main=14, seg=12, squash=0.88, spread=1.0):
    """A toy tree crown: one big lump and `n` smaller ones around and above it,
    light on top and a touch darker underneath."""
    base = L(col)
    top = tuple(min(1.0, c * 1.45) for c in base)
    under = dk(base, 0.32)
    parts = [blob(R, (0, 0, cz), base, seg=seg_main, scale=(1, 1, squash))]
    a0 = rnd.uniform(0, 2 * math.pi)
    for i in range(n):
        a = a0 + 2 * math.pi * i / n + rnd.uniform(-0.3, 0.3)
        rr = R * rnd.uniform(0.62, 0.74)
        d = R * rnd.uniform(0.6, 0.75) * spread
        z = cz + R * rnd.uniform(-0.28, 0.2)
        parts.append(blob(rr, (math.cos(a) * d, math.sin(a) * d, z), base, seg=seg, scale=(1, 1, squash)))
    parts.append(blob(R * 0.6, (rnd.uniform(-0.15, 0.15) * R, rnd.uniform(-0.15, 0.15) * R, cz + R * 0.52), base,
                      seg=seg, scale=(1, 1, 0.9)))
    # keep the crown centred over the trunk, however the lumps fell
    blo, bhi = bounds(parts)
    ox, oy = (blo[0] + bhi[0]) / 2, (blo[1] + bhi[1]) / 2
    for o in parts:
        deform(o, lambda p: Vector((p.x - ox, p.y - oy, p.z)))
    lo = cz - R * 1.0
    hi = cz + R * 1.15

    def grade(p):
        t = max(0.0, min(1.0, (p.z - lo) / (hi - lo)))
        if t < 0.45:
            return mixc(under, base, t / 0.45)
        return mixc(base, top, (t - 0.45) / 0.55)
    for o in parts:
        regrade(o, grade)
    return parts


@model('tree_round', ao=0.5)
def tree_round(v):
    rnd = random.Random(11 + v * 7)
    col = [C.leaf, C.leafDark, C.leafLime][v]
    H = 4.6 + v * 1.1
    bark = L(C.trunk)
    # a trunk with a flared foot, and two branches forking into the crown
    trunk = revolve([(0.42, 0.0), (0.3, 0.12), (0.23, 0.45), (0.2, H * 0.45), (0.15, H * 0.6), (0.0, H * 0.66)],
                    seg=10, color=bark, smooth=60)
    parts = [trunk]
    for s in (-1, 1):
        parts.append(sweep([(0, 0, H * 0.36), (s * 0.35, 0.06 * s, H * 0.48), (s * 0.65, 0.12 * s, H * 0.62)],
                           [0.13, 0.1, 0.075], n=6, color=bark, cap0=False))
    parts += canopy(rnd, H * 0.28, H * 0.71, col)
    return fit(parts, 'tree_round', v)


def tier(rb, zb, h, col, seg=24, lobes=6, phase=0.0, droop=0.08):
    """One skirt of a toy pine: a cone with a scalloped, drooping hem."""
    base = L(col)

    def warp(a, r, z, i):
        w = math.cos(lobes * (a + phase))
        if i in (1, 2):
            r *= 1 + 0.07 * w
        if i == 2:
            z -= droop * h * (w + 1) / 2
        return r, z
    o = revolve([(0.0, zb + 0.22 * h), (rb * 0.8, zb + 0.02 * h), (rb, zb + 0.06 * h), (rb * 0.5, zb + 0.52 * h), (0.0, zb + h)],
                seg=seg, color=base, warp=warp, smooth=70)
    top, under = tuple(min(1.0, c * 1.4) for c in base), dk(base, 0.3)
    regrade(o, lambda p: mixc(under, top, max(0.0, min(1.0, (p.z - zb) / h))))
    return o


@model('tree_pine', ao=0.5)
def tree_pine(v):
    # v1's pine is squat (as tall as it is wide): three skirts on a short stump
    col = C.leafDark
    parts = [revolve([(0.32, 0.0), (0.22, 0.1), (0.18, 0.35), (0.16, 1.4), (0.0, 1.5)], seg=10, color=C.trunkDark, smooth=60)]
    zb, rb, h = 0.42, 1.9, 1.55
    for i in range(3):
        parts.append(tier(rb, zb, h, col, phase=i * 0.5))
        zb += h * 0.52
        rb *= 0.72
        h *= 0.86
    return fit(parts, 'tree_pine', v)


def frond(base, az, length, width, col, droop=0.9, rise=0.35, n=9):
    """A palm frond: a long leaf rising then arching down, folded along its
    rib, with a zigzag edge so it reads as leaflets."""
    bx, by, bz = base
    ca, sa = math.cos(az), math.sin(az)
    bm = bmesh.new()
    rings = []
    for i in range(n + 1):
        t = i / n
        d = length * t
        z = bz + rise * math.sin(t * math.pi * 0.6) * length - droop * length * t * t
        cx, cy = bx + ca * d, by + sa * d
        w = width * math.sin(math.pi * min(1.0, t * 1.05 + 0.08)) * (1.0 if i % 2 else 0.7)
        if i == n:
            w = 0.0
        px, py = -sa, ca
        fold = w * 0.35
        th = max(0.01, width * 0.06)
        ring = [(cx + px * w, cy + py * w, z), (cx, cy, z + fold), (cx - px * w, cy - py * w, z), (cx, cy, z + fold - th)]
        rings.append([bm.verts.new(q) for q in ring])
    for a, b in zip(rings, rings[1:]):
        for j in range(4):
            bm.faces.new((a[j], a[(j + 1) % 4], b[(j + 1) % 4], b[j]))
    bm.faces.new(list(reversed(rings[0])))
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = _from_bmesh(bm, 'frond')
    paint(o, col)
    return _smooth(o, 50)


@model('tree_palm', ao=0.5)
def tree_palm(v):
    H = 7 + v * 2
    rnd = random.Random(5 + v)
    n = 9
    pts, radii = [], []
    for i in range(n + 1):
        t = i / n
        pts.append((math.sin(t * 1.2) * 0.5, 0.0, t * (H - 0.5)))
        radii.append(0.24 - 0.1 * t if i else 0.32)
    trunk = sweep(pts, radii, n=10, color=C.tan, smooth=60)
    # ring scars: alternate bands of tan and a darker tan up the trunk
    band = dk(C.tan, 0.22)
    recolor(trunk, lambda c, nm: band if int(c.z / (H / 14)) % 2 else None)
    parts = [trunk]
    top = Vector(pts[-1])
    parts.append(blob(0.3, (top.x, top.y, top.z + 0.05), dk(C.leaf, 0.2), seg=8, scale=(1, 1, 0.8)))
    leaf = L(C.leaf)
    for i in range(8):
        az = 2 * math.pi * i / 8 + rnd.uniform(-0.15, 0.15)
        col = leaf if i % 2 else mixc(leaf, lin(C.leafLime), 0.35)
        up = i % 3 == 0
        parts.append(frond((top.x, top.y, top.z + 0.1), az, (1.6 if up else 2.0) + rnd.uniform(-0.1, 0.15), 0.5, col,
                           droop=(0.55 if up else 0.95) + rnd.uniform(-0.1, 0.1), rise=0.5 if up else 0.35, n=7))
    for i in range(3):
        a = 2 * math.pi * i / 3 + 0.5
        parts.append(blob(0.15, (top.x + math.cos(a) * 0.2, top.y + math.sin(a) * 0.2, top.z - 0.18), C.woodDark,
                          seg=8, rings=4))
    return fit(parts, 'tree_palm', v)


@model('tree_big', ao=0.5)
def tree_big(v):
    # a great oak: a stout flared trunk, three thick limbs, and a broad dome
    rnd = random.Random(3 + v * 13)
    H = 15 + v * 5
    bark = L(C.trunk)
    trunk = revolve([(1.55, 0.0), (1.2, 0.5), (0.98, 1.5), (0.85, H * 0.3), (0.7, H * 0.42), (0.0, H * 0.52)],
                    seg=12, color=bark, smooth=70,
                    warp=lambda a, r, z, i: (r * (1 + {0: 0.3, 1: 0.12}.get(i, 0.0) * (0.5 + 0.5 * math.cos(4 * a))), z))
    parts = [trunk]
    for k in range(3):
        a = 2 * math.pi * k / 3 + 0.5
        ca, sa = math.cos(a), math.sin(a)
        parts.append(sweep([(ca * 0.3, sa * 0.3, H * 0.33), (ca * H * 0.12, sa * H * 0.12, H * 0.45),
                            (ca * H * 0.22, sa * H * 0.22, H * 0.58)],
                           [0.55, 0.4, 0.26], n=6, color=bark, cap0=False))
    parts += canopy(rnd, H * 0.29, H * 0.73, C.leafDark, n=5, seg_main=14, seg=10, squash=0.8, spread=1.25)
    return fit(parts, 'tree_big', v)


# ---------------------------------------------------------------- rocks, sky, land

@model('rock_big', ao=0.6)
def rock_big(v):
    rnd = random.Random(40 + v * 9)
    grey, dark = L(C.grey), L(C.darkgrey)
    main = rock(1.0, (0, 0, 0.42), grey, sub=3, scale=(1.0, 0.88, 0.7), seed=v * 5 + 1, cuts=11, depth=0.24,
                rot=(0, 0, rnd.uniform(0, 360)))
    # sunlit tops a shade paler, the undersides a shade darker
    recolor(main, lambda c, n: lt(grey, 0.12) if n.z > 0.65 else (dk(grey, 0.12) if n.z < -0.1 else None))
    parts = [main]
    # a darker companion stone at the front, and a pale pebble beside it
    a = -math.pi / 2 + rnd.uniform(-0.7, 0.7)
    side = rock(0.5, (math.cos(a) * 0.82, math.sin(a) * 0.66, 0.2), dark, sub=2,
                scale=(1.0, 0.9, 0.78), seed=v * 5 + 2, cuts=7, depth=0.24)
    recolor(side, lambda c, n: lt(dark, 0.12) if n.z > 0.65 else None)
    parts.append(side)
    a2 = a + rnd.choice((-1, 1)) * rnd.uniform(0.9, 1.3)
    parts.append(rock(0.28, (math.cos(a2) * 0.98, math.sin(a2) * 0.8, 0.1), C.lightgrey, sub=2,
                      scale=(1.0, 0.9, 0.72), seed=v * 5 + 3, cuts=5, depth=0.22))
    for o in parts:
        deform(o, lambda p: Vector((p.x, p.y, max(p.z, 0.0))))
    return fit(parts, 'rock_big', v)


@model('cloud_puff', ao=0.35)
def cloud_puff(v):
    rnd = random.Random(70 + v * 3)
    s = 10.0
    white = L(C.cloud)
    under = mixc(white, lin(C.skyHigh), 0.35)
    under = mixc(under, (0.5, 0.52, 0.6), 0.2)
    parts = []
    n = 6
    for i in range(n):
        a = 2 * math.pi * i / n + rnd.uniform(-0.2, 0.2)
        r = s * rnd.uniform(0.3, 0.4)
        parts.append(blob(r, (math.cos(a) * s * 0.6, math.sin(a) * s * 0.36, r * 0.35), white, seg=14,
                          scale=(1.15, 1.0, 0.9), flat=0.0))
    for k, (x, y, r) in enumerate(((-0.2, 0.05, 0.48), (0.25, -0.05, 0.42), (0.05, 0.12, 0.36))):
        parts.append(blob(s * r, (s * x, s * y, s * r * 0.7 + s * 0.1), white, seg=16, scale=(1.1, 1.0, 0.92),
                          flat=0.0))
    for o in parts:
        regrade(o, lambda p: mixc(under, white, max(0.0, min(1.0, p.z / (s * 0.45)))))
    return fit(parts, 'cloud_puff', v)


def surface_z(prof, rr):
    """Height of a revolve profile (radius falling as z rises) at radius rr."""
    for (r0, z0), (r1, z1) in zip(prof, prof[1:]):
        if r1 <= rr <= r0 and r0 > r1:
            return z0 + (z1 - z0) * (r0 - rr) / (r0 - r1)
    return prof[-1][1]


def little_tree(x, y, z, h, leaf, rnd, seg=10):
    trunk = revolve([(h * 0.07, 0.0), (h * 0.05, h * 0.5), (0.0, h * 0.62)], seg=6, color=C.trunk, smooth=60)
    deform(trunk, lambda p: p + Vector((x, y, z - h * 0.05)))
    R = h * 0.36
    c1 = blob(R, (x, y, z + h * 0.62), leaf, seg=seg, scale=(1, 1, 0.9))
    a = rnd.uniform(0, 2 * math.pi)
    c2 = blob(R * 0.66, (x + math.cos(a) * R * 0.6, y + math.sin(a) * R * 0.6, z + h * 0.78), leaf, seg=8)
    top, under = tuple(min(1.0, c * 1.4) for c in L(leaf)), dk(leaf, 0.3)
    for o in (c1, c2):
        regrade(o, lambda p: mixc(under, top, max(0.0, min(1.0, (p.z - z - h * 0.35) / (h * 0.65)))))
    return [trunk, c1, c2]


@model('island_rock', ao=0.6)
def island_rock(v):
    rnd = random.Random(90 + v)
    R = 26 + v * 14
    p1, p2 = rnd.uniform(0, 6.28), rnd.uniform(0, 6.28)

    def lobes(a):
        return 1 + 0.07 * math.cos(3 * a + p1) + 0.04 * math.cos(5 * a + p2)

    prof = [(R, 0.0), (R * 0.97, R * 0.07), (R * 0.88, R * 0.17), (R * 0.76, R * 0.3), (R * 0.66, R * 0.41),
            (R * 0.5, R * 0.48), (0.0, R * 0.52)]
    rk = revolve(prof, seg=24, color=C.grey, warp=lambda a, r, z, i: (r * lobes(a), z), smooth=40, cap_bottom=False)
    # strata: a wet dark foot at the waterline and a paler band under the turf
    recolor(rk, lambda c, n: (C.darkgrey if c.z < R * 0.07 else (lt(C.grey, 0.18) if R * 0.17 < c.z < R * 0.3 else None)))
    parts = [rk]
    cap = [(R * 0.6, R * 0.44), (R * 0.71, R * 0.4), (R * 0.72, R * 0.43), (R * 0.5, R * 0.51), (0.0, R * 0.55)]
    turf = revolve(cap, seg=24, color=C.leafDark, warp=lambda a, r, z, i: (r * lobes(a), z), smooth=45,
                   cap_bottom=False)
    regrade(turf, lambda p: mixc(dk(C.leafDark, 0.15), lt(C.leafDark, 0.12), max(0.0, min(1.0, (p.z - R * 0.4) / (R * 0.15)))))
    parts.append(turf)
    beach = revolve([(R * 0.9, R * 0.05), (R * 1.06, 0.0), (R * 1.1, -0.2), (R * 0.9, -0.2)], seg=24, color=C.sand,
                    warp=lambda a, r, z, i: (r * lobes(a), z), smooth=40, cap_bottom=False, cap_top=False)
    parts.append(beach)
    for k in range(3):
        a = rnd.uniform(0, 2 * math.pi)
        d = R * lobes(a) * 1.0
        parts.append(rock(R * 0.07, (math.cos(a) * d, math.sin(a) * d, R * 0.02), C.darkgrey, sub=1, seed=v * 7 + k,
                          cuts=4, scale=(1, 0.9, 0.8)))
    ht = 13 + v * 2
    a0 = rnd.uniform(0, 6.28)
    for k in range(5):
        a = a0 + k * 2 * math.pi / 5 + rnd.uniform(-0.3, 0.3)
        d = R * (0.1 + 0.3 * ((k * 0.37) % 1.0))
        z = surface_z([(r, zz) for r, zz in cap[2:]], d / lobes(a))
        parts += little_tree(math.cos(a) * d, math.sin(a) * d, z, ht * rnd.uniform(0.85, 1.05), C.leaf, rnd)
    return fit(parts, 'island_rock', v)


def mini_pine(x, y, z, h, col):
    o = revolve([(h * 0.34, 0.0), (h * 0.12, h * 0.48), (h * 0.26, h * 0.42), (0.0, h)], seg=8, color=col, smooth=40)
    deform(o, lambda p: p + Vector((x, y, z)))
    regrade(o, lambda p: mixc(dk(col, 0.25), lt(col, 0.15), max(0.0, min(1.0, (p.z - z) / h))))
    return o


def peak(R, H, at, seg, warp_r, rnd, snow=0.72, rock_from=0.24, dark_from=0.58):
    """A toy mountain: green foot, grey rock, darker crags and a dripping cap
    of snow; the band edges are rings of the mesh, rippled per angle."""
    q1, q2 = rnd.uniform(0, 6.28), rnd.uniform(0, 6.28)

    def wave(a, k):
        return 0.035 * H * math.sin(5 * a + q1 + k) + 0.02 * H * math.sin(9 * a + q2)

    prof = [(R, 0.0), (R * 0.8, H * 0.12), (R * 0.68, H * rock_from), (R * 0.42, H * dark_from * 0.82),
            (R * 0.3, H * dark_from), (R * 0.2, H * snow), (R * 0.08, H * 0.93), (0.0, H)]
    bands = {2: 0, 4: 1, 5: 2}

    def warp(a, r, z, i):
        if i in bands:
            z += wave(a, bands[i])
        return r * warp_r(a), z
    o = revolve(prof, seg=seg, color=C.grey, warp=warp, smooth=38, cap_bottom=False)
    green, grey, dark, white = L(C.greenDark), L(C.grey), L(C.darkgrey), L(C.white)

    def col(c, n):
        a = math.atan2(c.y, c.x)
        z = c.z
        if z < H * rock_from + wave(a, 0):
            return mixc(green, lin(C.leafDark), 0.3) if n.z > 0.75 else green
        if z < H * dark_from + wave(a, 1):
            return lt(grey, 0.15) if n.z > 0.6 else grey
        if z < H * snow + wave(a, 2):
            return dark
        return white
    recolor(o, col)
    deform(o, lambda p: p + Vector(at))
    return o


@model('mountain', ao=0.5)
def mountain(v):
    rnd = random.Random(120 + v * 5)
    H = 72 + v * 26
    R = H * 0.8
    p1, p2 = rnd.uniform(0, 6.28), rnd.uniform(0, 6.28)

    def lob(a):
        return 1 + 0.07 * math.cos(3 * a + p1) + 0.04 * math.cos(5 * a + p2)
    parts = [peak(R, H, (0, 0, 0), 20, lob, rnd, snow=0.66)]
    a = rnd.uniform(0, 6.28)
    parts.append(peak(R * 0.42, H * 0.46, (math.cos(a) * R * 0.62, math.sin(a) * R * 0.62, 0), 14,
                      lambda b: 1 + 0.08 * math.cos(3 * b + p2), rnd, snow=0.78, dark_from=0.62))
    for k in range(7):
        b = rnd.uniform(0, 6.28)
        d = R * lob(b) * rnd.uniform(0.86, 0.98)
        parts.append(mini_pine(math.cos(b) * d, math.sin(b) * d, H * 0.01, H * rnd.uniform(0.14, 0.2), C.leafDark))
    return fit(parts, 'mountain', v)


# ---------------------------------------------------------------- town buildings

def xsweep(prof, xs, colors, smooth=30):
    """A closed (y, z) outline swept along X through the stations `xs`, each
    span painted its own colour: striped awnings, banded beams."""
    bm = bmesh.new()
    rings = [[bm.verts.new((x, y, z)) for (y, z) in prof] for x in xs]
    n = len(prof)
    spans = []
    for k, (a, b) in enumerate(zip(rings, rings[1:])):
        for j in range(n):
            f = bm.faces.new((a[j], a[(j + 1) % n], b[(j + 1) % n], b[j]))
            spans.append((f, k))
    f0 = bm.faces.new(list(reversed(rings[0])))
    f1 = bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    # polygons keep the order they were made in
    order = [k for f, k in spans] + [0, len(xs) - 2]
    o = _from_bmesh(bm, 'xsweep')
    me = o.data
    attr = me.color_attributes.new('base', 'FLOAT_COLOR', 'CORNER')
    for poly in me.polygons:
        c = L(colors[order[poly.index] % len(colors)])
        for li in poly.loop_indices:
            attr.data[li].color = (*c, 1.0)
    return _smooth(o, smooth)


def chip(w, h, x, y, z, color, t=0.04):
    """A flat colour block on a wall facing -Y: `y` is the wall's face, `z`
    the block's bottom. 12 triangles."""
    return box((w, t, h), at=(x, y - t / 2, z), color=color, bevel=0)


def side_chip(w, h, x, y, z, color, t=0.04):
    """The same on a wall facing +X (s=1) or -X: `x` is the wall's face."""
    s = 1 if x > 0 else -1
    return box((t, w, h), at=(x + s * t / 2, y, z), color=color, bevel=0)


def window(x, y, z, w, h, frame, glass, face='front', sill=True):
    """A white-framed window with a cross of glazing bars and a sill."""
    f = 0.12
    mk = chip if face == 'front' else side_chip
    if face == 'front':
        out = [mk(w + 2 * f, h + 2 * f, x, y, z - f, frame, t=0.06), mk(w, h, x, y - 0.06, z, glass, t=0.03),
               mk(0.08, h, x, y - 0.09, z, frame, t=0.02), mk(w, 0.08, x, y - 0.09, z + h / 2 - 0.04, frame, t=0.02)]
        if sill:
            out.append(box((w + 0.5, 0.22, 0.12), at=(x, y - 0.11, z - f - 0.1), color=frame, bevel=0))
        return out
    s = 1 if x > 0 else -1
    out = [mk(w + 2 * f, h + 2 * f, x, y, z - f, frame, t=0.06), mk(w, h, x + s * 0.06, y, z, glass, t=0.03),
           mk(0.08, h, x + s * 0.09, y, z, frame, t=0.02), mk(w, 0.08, x + s * 0.09, y, z + h / 2 - 0.04, frame, t=0.02)]
    if sill:
        out.append(box((0.22, w + 0.5, 0.12), at=(x + s * 0.11, y, z - f - 0.1), color=frame, bevel=0))
    return out


def gable_roof(w, d, z0, rise, thick, color, ridge_col, axis='y'):
    """A pitched roof with real thickness, ridge along Y (gables front and
    back) — an inverted V extruded through the depth."""
    hw = w / 2
    sec = [(-hw, z0 - thick), (-hw, z0), (0, z0 + rise), (hw, z0), (hw, z0 - thick), (0, z0 + rise - thick * 1.3)]
    rf = prism(list(reversed(sec)), d, color=color, bevel=min(0.08, thick * 0.3), seg=1, rot=(90, 0, 0))
    deform(rf, lambda p: Vector((p.x, p.y + d / 2, p.z)))
    cap = box((0.34, d + 0.06, 0.26), at=(0, 0, z0 + rise - 0.2), color=ridge_col, bevel=0.08, seg=1)
    return [rf, cap]


def gable_fill(w, d, z0, rise, color):
    """The triangular wall under a front-to-back ridge."""
    o = prism([(-w / 2, z0), (w / 2, z0), (0, z0 + rise)], d, color=color, rot=(90, 0, 0))
    deform(o, lambda p: Vector((p.x, p.y + d / 2, p.z)))
    return o


def walls(W, D, zs, color, r=0.14, n=2, cap=True):
    """Four walls as one shell with soft corners and a ring of vertices at
    every height in `zs`, so the baked AO has somewhere to land (a plain box
    has only its corners, and a buried corner darkens the whole wall)."""
    outline = rrect(W, D, r, n)
    bm = bmesh.new()
    rings = [[bm.verts.new((x, y, z)) for (x, y) in outline] for z in zs]
    m = len(outline)
    for a, b in zip(rings, rings[1:]):
        for j in range(m):
            bm.faces.new((a[j], a[(j + 1) % m], b[(j + 1) % m], b[j]))
    if cap:
        bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = _from_bmesh(bm, 'walls')
    paint(o, color)
    return _smooth(o, 35)


@model('house_small', ao=0.6)
def house_small(v):
    wall = [C.cream, C.offwhite, C.tan, C.lightgrey][v]
    roof = [C.roofTile, C.roofRed, C.charcoal, C.greenDark][v]
    W, D, H = 7.5, 6.5, 3.2
    fy = -D / 2
    trim = L(C.white)
    glass = L(C.glass)
    sh = walls(W, D, [0.0, 0.4, 1.2, 2.4, H], wall)
    # a darker plinth course along the foot
    recolor(sh, lambda c, n: C.concreteD if c.z < 0.4 else None)
    parts = [sh, box((W + 0.2, D + 0.2, 0.22), at=(0, 0, H - 0.12), color=C.woodDark, bevel=0),
             gable_fill(W - 0.1, D - 0.1, H, 1.8, wall)]
    parts += gable_roof(W + 0.5, D + 0.5, H - 0.02, 2.15, 0.26, roof, dk(roof, 0.25))
    # front: a door under a little hood, a step, two windows, a round attic light
    parts.append(chip(1.25, 2.25, 0.0, fy, 0.38, trim, t=0.05))
    parts.append(chip(0.95, 2.05, 0.0, fy - 0.05, 0.4, C.woodDark, t=0.04))
    parts.append(chip(0.55, 0.5, 0.0, fy - 0.09, 1.65, dk(C.woodDark, 0.25), t=0.02))
    parts.append(chip(0.14, 0.14, 0.3, fy - 0.09, 1.3, C.gold, t=0.06))
    parts.append(box((1.6, 0.42, 0.12), at=(0, fy - 0.21, 2.62), color=roof, bevel=0))
    parts.append(box((1.5, 0.4, 0.2), at=(0, fy - 0.2, 0.0), color=C.concrete, bevel=0))
    for s in (-1, 1):
        parts += window(s * 2.3, fy, 1.25, 1.3, 1.1, trim, glass)
        parts += window(s * W / 2, 0.3, 1.25, 1.3, 1.1, trim, glass, face='side')
    attic = prism(circle(0.36, 10), 0.06, color=trim, rot=(90, 0, 0))
    deform(attic, lambda p: Vector((p.x, p.y + fy, p.z + H + 0.75)))
    pane = prism(circle(0.25, 10), 0.04, color=glass, rot=(90, 0, 0))
    deform(pane, lambda p: Vector((p.x, p.y + fy - 0.05, p.z + H + 0.75)))
    parts += [attic, pane]
    # the chimney, at the back on the left
    cx, cy = -W / 2 + 1.5, D / 4
    parts.append(box((0.75, 0.75, 1.65), at=(cx, cy, H + 0.6), color=C.brick, bevel=0.06, seg=1))
    parts.append(box((0.92, 0.92, 0.2), at=(cx, cy, H + 2.23), color=dk(C.brick, 0.3), bevel=0))
    # back windows
    for s in (-1, 1):
        o = window(s * 2.1, fy, 1.25, 1.3, 1.1, trim, glass, sill=False)
        for q in o:
            deform(q, lambda p: Vector((p.x, -p.y, p.z)))
            q.data.flip_normals()
        parts += o
    return parts


@model('shop_front', ao=0.6)
def shop_front(v):
    wall = [C.offwhite, C.cream, C.concrete][v]
    awn = [C.red, C.green, C.blue][v]
    W, D, H = 9.0, 7.5, 4.4
    fy = -D / 2
    glass = L(C.glass)
    dark = L(C.charcoal)
    sh = walls(W, D, [0.0, 0.35, 1.5, 3.0, H], wall, cap=False)
    recolor(sh, lambda c, n: C.concreteD if c.z < 0.35 else None)
    parts = [sh, box((W + 0.26, D + 0.26, 0.32), at=(0, 0, H - 0.04), color=C.concreteD, bevel=0.08, seg=1),
             box((W - 0.5, D - 0.5, 0.02), at=(0, 0, H + 0.28), color=dk(C.concreteD, 0.18), bevel=0)]
    # the shop window: a dark frame, glass, mullions, a door on the left
    parts.append(chip(W - 0.5, 2.6, 0.0, fy, 0.35, dark, t=0.05))
    parts.append(chip(W - 0.8, 2.3, 0.35, fy - 0.05, 0.5, glass, t=0.03))
    for x in (-1.4, 1.2, 3.2):
        parts.append(chip(0.12, 2.3, x, fy - 0.08, 0.5, dark, t=0.02))
    parts.append(chip(1.1, 2.3, -W / 2 + 1.35, fy - 0.08, 0.38, dk(C.charcoal, 0.2), t=0.03))
    parts.append(chip(0.8, 1.2, -W / 2 + 1.35, fy - 0.11, 1.2, glass, t=0.02))
    parts.append(box((1.0, 0.18, 0.06), at=(-W / 2 + 1.75, fy - 0.2, 1.2), color=C.steel, bevel=0))
    # a display inside the window: crates of colour
    for i, c in enumerate((C.orange, C.lime, C.yellow, C.hotpink)):
        parts.append(box((1.2, 0.5, 0.55), at=(-0.6 + i * 1.35, fy + 0.4, 0.4), color=c, bevel=0))
    # the striped awning: a sloped canopy and a valance, swept across
    n = 10
    xs = [-W / 2 - 0.05 + (W + 0.1) * i / n for i in range(n + 1)]
    prof = [(fy, 3.45), (fy - 1.3, 2.9), (fy - 1.3, 2.45), (fy - 1.18, 2.45), (fy - 1.18, 2.8), (fy, 3.3)]
    parts.append(xsweep(prof, xs, [awn, C.white]))
    # sign board above it: plain colour blocks, no lettering
    parts.append(chip(W - 1.2, 0.75, 0.0, fy, 3.55, C.yellow, t=0.12))
    parts.append(chip(W - 1.6, 0.42, 0.0, fy - 0.12, 3.72, lt(C.yellow, 0.5), t=0.02))
    parts.append(prism(circle(0.3, 10), 0.03, color=awn, rot=(90, 0, 0)))
    deform(parts[-1], lambda p: Vector((p.x - 3.2, p.y + fy - 0.14, p.z + 3.92)))
    # side window, and a roof-top cooling unit with a fan
    parts += window(W / 2, 0.8, 1.6, 1.6, 1.2, L(C.white), glass, face='side')
    ux, uy = W / 2 - 1.4, D / 4
    parts.append(box((1.5, 1.1, 0.72), at=(ux, uy, H + 0.28), color=C.steelDark, bevel=0.08, seg=1))
    parts.append(cyl(0.38, 0.04, at=(ux, uy, H + 1.0), color=C.charcoal, seg=12, bevel=0))
    parts.append(box((0.5, 0.5, 0.6), at=(-W / 2 + 1.0, D / 2 - 0.9, H + 0.28), color=C.steel, bevel=0.06, seg=1))
    return parts


def flat(pts, y, color):
    """A single flat polygon in the XZ plane at depth y, facing -Y (front):
    picture shapes on a board, where a back face would never be seen."""
    bm = bmesh.new()
    f = bm.faces.new([bm.verts.new((x, y, z)) for (x, z) in pts])
    f.normal_update()
    if f.normal.y > 0:
        f.normal_flip()
    o = _from_bmesh(bm, 'flat')
    paint(o, color)
    return _smooth(o, 10)


def picture(v, z0, w, h, y):
    """Billboard art: an invented picture in flat colour blocks."""
    out = []

    def disc(r, x, z, col, n=16, sy=1.0, dy=0.0):
        return flat(circle(r, n, cx=x, cy=z, sy=sy), y - 0.02 - dy, col)

    def poly(pts, col, dy=0.0):
        return flat(pts, y - 0.02 - dy, col)
    cz = z0 + h / 2
    if v == 0:
        # an ice-cream cone with two scoops and a cherry, and sparkles
        out.append(poly([(-0.95, cz + 0.2), (0.95, cz + 0.2), (0.0, z0 + 0.25)], C.tan))
        for k in (-1, 1):
            out.append(poly([(k * 0.45 - 0.06, cz + 0.2), (k * 0.45 + 0.06, cz + 0.2), (0.06, z0 + 0.5), (-0.06, z0 + 0.5)],
                            dk(C.tan, 0.2), dy=0.03))
        out.append(disc(0.85, 0.0, cz + 0.55, C.white, dy=0.02))
        out.append(disc(0.72, 0.15, cz + 1.4, C.lemon, dy=0.04))
        out.append(disc(0.22, 0.25, cz + 2.08, C.red, n=10, dy=0.06))
        for x, z, r in ((-3.4, cz + 1.2, 0.28), (3.3, cz - 0.9, 0.34), (-2.6, cz - 1.3, 0.2), (2.7, cz + 1.4, 0.22)):
            out.append(disc(r, x, z, C.white, n=8))
    elif v == 1:
        # a sunny landscape: sun, two hills and a cloud
        out.append(disc(0.95, 2.9, cz + 0.9, C.orange))
        out.append(disc(3.2, -2.2, z0 - 1.8, C.leaf, n=24))
        out.append(disc(3.6, 2.4, z0 - 2.4, C.green, n=24, dy=0.02))
        for x, z, r in ((-1.4, cz + 1.2, 0.55), (-0.8, cz + 1.35, 0.7), (-0.2, cz + 1.15, 0.5)):
            out.append(disc(r, x, z, C.white, n=12, dy=0.03))
    else:
        # a fish blowing bubbles
        out.append(disc(1.25, -0.4, cz, C.orange, n=20, sy=0.7))
        out.append(poly([(0.65, cz), (1.75, cz + 0.8), (1.75, cz - 0.8)], C.orange))
        out.append(poly([(-0.4, cz + 0.85), (0.25, cz + 1.3), (0.45, cz + 0.6)], dk(C.orange, 0.15), dy=0.01))
        out.append(disc(0.24, -1.05, cz + 0.2, C.white, n=10, dy=0.03))
        out.append(disc(0.12, -1.1, cz + 0.2, C.charcoal, n=8, dy=0.05))
        for x, z, r in ((-2.3, cz + 0.6, 0.22), (-2.8, cz + 1.3, 0.3), (-2.4, cz + 1.95, 0.18)):
            out.append(disc(r, x, z, C.white, n=10))
        out.append(poly([(-w / 2, z0), (w / 2, z0), (w / 2, z0 + 0.5), (1.5, z0 + 0.75), (-1.0, z0 + 0.45),
                         (-w / 2, z0 + 0.7)], C.blue))
    # clip anything that strays off the board
    for o in out:
        deform(o, lambda p: Vector((max(-w / 2, min(w / 2, p.x)), p.y, max(z0, min(z0 + h, p.z)))))
    return out


@model('billboard', ao=0.6)
def billboard(v):
    bg = [C.hotpink, C.yellow, C.cyan][v]
    steel = L(C.steelDark)
    parts = []
    for s in (-1, 1):
        parts.append(revolve([(0.34, 0.3), (0.26, 0.45), (0.26, 7.55), (0.0, 7.6)], seg=10, color=steel,
                             smooth=40))
        deform(parts[-1], lambda p, s=s: p + Vector((s * 2.6, 0.15, 0)))
        parts.append(box((1.0, 1.0, 0.3), at=(s * 2.6, 0.15, 0), color=C.concrete, bevel=0.06, seg=1))
    # cross-bracing between the posts
    for z0, z1 in ((1.2, 6.8), (6.8, 1.2)):
        parts.append(sweep([(-2.5, 0.15, z0), (2.5, 0.15, z1)], [0.07, 0.07], n=6, color=steel))
    parts.append(sweep([(-2.5, 0.15, 6.9), (2.5, 0.15, 6.9)], [0.09, 0.09], n=6, color=steel))
    # the board: a dark frame, the picture panel, struts behind
    z0, Hb, Wb = 7.4, 5.2, 11.0
    parts.append(box((Wb, 0.4, Hb), at=(0, 0.0, z0), color=C.charcoal, bevel=0.12, seg=1))
    parts.append(chip(Wb - 0.6, Hb - 0.6, 0, -0.2, z0 + 0.3, bg, t=0.06))
    parts += picture(v, z0 + 0.3, Wb - 0.6, Hb - 0.6, -0.26)
    for z in (z0 + 1.2, z0 + 4.0):
        parts.append(box((Wb - 0.8, 0.3, 0.3), at=(0, 0.35, z), color=steel, bevel=0))
    # a catwalk along the foot of the board, and two lamps craning over it
    parts.append(box((Wb - 0.4, 0.9, 0.14), at=(0, -0.6, z0 - 0.15), color=steel, bevel=0.04, seg=1))
    parts.append(sweep([(-Wb / 2 + 0.3, -1.0, z0 + 0.5), (Wb / 2 - 0.3, -1.0, z0 + 0.5)], [0.05, 0.05], n=6,
                       color=C.steel))
    for x in (-3.0, 3.0):
        parts.append(sweep([(x, -0.2, z0 - 0.05), (x, -0.9, z0 + 0.3), (x, -1.1, z0 + 0.75)], [0.06, 0.06, 0.06], n=6,
                           color=steel))
        parts.append(box((0.7, 0.35, 0.3), at=(x, -1.12, z0 + 0.7), color=C.lemon, bevel=0.05, seg=1,
                         rot=(-35, 0, 0)))
    return parts


# ---------------------------------------------------------------- city landmarks

def rod(p0, p1, r, color, n=4):
    """A thin strut between two points: braces, rails, rungs."""
    return sweep([p0, p1], [r, r], n=n, color=color, cap0=False, cap1=False, smooth=50)


@model('watertower', ao=0.65)
def watertower(v):
    steel, dark = L(C.steel), L(C.steelDark)
    parts = []
    legs = []
    for k in range(4):
        a = math.pi / 4 + k * math.pi / 2
        ca, sa = math.cos(a), math.sin(a)
        b, t = (ca * 2.9, sa * 2.9, 0.0), (ca * 2.15, sa * 2.15, 11.2)
        legs.append((b, t))
        parts.append(sweep([b, t], [0.26, 0.2], n=6, color=dark, cap0=False))
        parts.append(box((0.8, 0.8, 0.35), at=(b[0], b[1], 0), color=C.concrete, bevel=0))

    def at(k, z):
        (b, t) = legs[k % 4]
        f = z / 11.2
        return (b[0] + (t[0] - b[0]) * f, b[1] + (t[1] - b[1]) * f, z)
    for k in range(4):
        for z in (3.8, 7.6):
            parts.append(rod(at(k, z), at(k + 1, z), 0.09, dark))
        parts.append(rod(at(k, 3.8), at(k + 1, 7.6), 0.06, dark))
        parts.append(rod(at(k + 1, 3.8), at(k, 7.6), 0.06, dark))
    # the tank: a dished floor, plain walls with one seam, a painted band at the front
    tank = revolve([(0.0, 10.5), (2.4, 10.75), (3.3, 11.25), (3.4, 11.6), (3.4, 12.9), (3.4, 14.7), (3.4, 16.3),
                    (3.2, 16.45)], seg=18, color=steel, smooth=50, cap_top=True)
    red = L(C.red)
    recolor(tank, lambda c, n: red if 12.9 < c.z < 14.7 and n.y < -0.4 else
            (dk(steel, 0.12) if 11.6 < c.z < 12.9 else None))
    parts.append(tank)
    roof = revolve([(3.62, 16.15), (3.62, 16.45), (2.2, 17.25), (0.5, 18.05), (0.0, 18.12)], seg=18,
                   color=C.redDark, smooth=40)
    parts.append(roof)
    parts.append(blob(0.24, (0, 0, 18.3), C.redDark, seg=6, rings=3))
    # a catwalk round the tank's waist, and a ladder up one leg to it
    parts.append(revolve([(3.3, 11.2), (3.64, 11.2), (3.64, 11.4), (3.3, 11.4)], seg=18, color=dark, smooth=30,
                         cap_bottom=False, cap_top=False))
    (b, t) = legs[3]
    for s in (-1, 1):
        off = Vector((-t[1], t[0], 0)).normalized() * 0.32 * s
        parts.append(rod(Vector(at(3, 0.4)) + off + Vector((0.2, -0.2, 0)), Vector(at(3, 11.2)) + off + Vector((0.2, -0.2, 0)),
                         0.05, steel))
    for i in range(6):
        z = 1.2 + i * 1.7
        c = Vector(at(3, z)) + Vector((0.2, -0.2, 0))
        off = Vector((-t[1], t[0], 0)).normalized() * 0.32
        parts.append(rod(c - off, c + off, 0.04, steel))
    return parts


@model('silo', ao=0.6)
def silo(v):
    R, H = 4.2, 18 + v * 5
    steel, dark = L(C.steel), L(C.steelDark)
    pale = lt(steel, 0.12)
    prof = [(R, 0.5)]
    hoops = []
    for i in range(6):
        z = 1.6 + i * (H - 2.0) / 5.5
        prof += [(R, z - 0.1), (R + 0.14, z + 0.2), (R, z + 0.5)]
        hoops.append(z)
    prof.append((R, H))
    body = revolve(prof, seg=24, color=steel, smooth=40, cap_bottom=False, cap_top=False)
    # corrugation as alternating panels, raised hoops in the darker steel

    def col(c, n):
        z = c.z
        if any(h - 0.1 < z < h + 0.5 for h in hoops):
            return dark
        a = math.atan2(c.y, c.x)
        return pale if int(math.floor(a / (2 * math.pi / 24) + 100)) % 2 else None
    recolor(body, col)
    parts = [body,
             revolve([(R + 0.45, 0.0), (R + 0.45, 0.42), (R + 0.3, 0.55), (R - 0.2, 0.55)], seg=28, color=C.concrete,
                     smooth=30, cap_bottom=False, cap_top=False)]
    parts.append(revolve([(R - 0.1, H - 0.05), (R + 0.3, H - 0.05), (R + 0.3, H + 0.25), (R * 0.2, H + 4.3),
                          (0.75, H + 4.45), (0.0, H + 4.45)], seg=28, color=dark, smooth=40))
    parts.append(revolve([(0.5, H + 4.3), (0.5, H + 5.6), (0.85, H + 5.65), (0.85, H + 5.95), (0.0, H + 6.1)], seg=12,
                         color=C.charcoal, smooth=40))
    # a red hatch at the front, and a grain spout slanting down to a hopper
    parts.append(chip(1.5, 1.9, 0.0, -R - 0.02, 0.75, dark, t=0.14))
    parts.append(chip(1.1, 1.5, 0.0, -R - 0.16, 0.95, C.redDark, t=0.04))
    a = math.radians(225)
    top = (math.cos(a) * (R - 0.2), math.sin(a) * (R - 0.2), H + 0.6)
    foot = (math.cos(a) * (R + 0.9), math.sin(a) * (R + 0.9), 2.6)
    parts.append(sweep([top, (top[0] * 1.08, top[1] * 1.08, H - 0.4), foot], [0.32, 0.3, 0.3], n=8, color=C.steel,
                       cap0=False))
    parts.append(box((1.2, 1.2, 1.2), at=(foot[0], foot[1], 1.4), color=C.redDark, bevel=0.1, seg=1, rot=(0, 0, 45)))
    parts.append(cyl(0.45, 1.4, at=(foot[0], foot[1], 0.0), color=dark, seg=10, bevel=0, r2=0.25))
    # the caged ladder on the +X side
    lx = R + 0.3
    for s in (-1, 1):
        parts.append(rod((lx, s * 0.32, 0.55), (lx, s * 0.32, H + 0.9), 0.06, dark))
    n = int((H - 1.0) / 1.2)
    for i in range(n):
        z = 1.2 + i * 1.2
        parts.append(rod((lx, -0.32, z), (lx, 0.32, z), 0.04, dark))
    for i in range(int((H - 4.0) / 3.4) + 1):
        z = 4.0 + i * 3.4
        arc = [(lx + 0.6 * math.cos(math.radians(d)), 0.6 * math.sin(math.radians(d)), z) for d in range(-90, 91, 30)]
        parts.append(sweep(arc, [0.04] * len(arc), n=4, color=dark, cap0=False, cap1=False))
    return parts


@model('windmill', ao=0.65)
def windmill(v):
    cream = L(C.cream)
    wood = L(C.woodDark)

    def octa(a, r, z, i):
        # an octagon with softened corners
        k = math.cos(math.pi / 8) / math.cos(((a - math.pi / 8) % (math.pi / 4)) - math.pi / 8)
        return r * (0.75 * k + 0.25), z
    tower = revolve([(5.6, 0.0), (5.6, 1.2), (5.3, 1.35), (4.4, 7.5), (3.5, 14.0), (3.75, 14.15), (3.75, 14.6)], seg=16,
                    color=cream, warp=octa, smooth=40, cap_bottom=False, phase=math.pi / 8)
    recolor(tower, lambda c, n: C.concreteD if c.z < 1.3 else (wood if c.z > 14.05 else None))
    parts = [tower]
    parts.append(revolve([(3.9, 14.5), (3.9, 15.0), (3.4, 16.9), (2.2, 18.2), (0.9, 18.75), (0.3, 18.85),
                          (0.3, 19.2), (0.0, 19.3)], seg=12, color=C.roofRed, smooth=50))

    def rface(z):
        # the front flat of the tower at height z
        r = 5.3 + (4.4 - 5.3) * (z - 1.35) / (7.5 - 1.35) if z < 7.5 else 4.4 + (3.5 - 4.4) * (z - 7.5) / 6.5
        return -r * math.cos(math.pi / 8) * (0.75 + 0.25 / math.cos(math.pi / 8)) * 0.98
    tilt = math.degrees(math.atan2(0.9, 6.3))
    # the door and its step, and windows climbing the front
    parts.append(box((1.5, 0.3, 2.6), at=(0, rface(1.5) - 0.15, 0.0), color=wood, bevel=0))
    parts.append(box((2.4, 0.9, 0.3), at=(0, rface(0.5) - 0.4, 0.0), color=C.concrete, bevel=0))
    for i, z in enumerate((5.4, 8.8, 12.0)):
        y = rface(z + 0.7)
        for w, h, t, col, dy in ((1.6, 1.8, 0.1, C.white, 0.0), (1.1, 1.3, 0.06, C.glassDark, -0.08)):
            o = box((w, t, h), at=(0, 0, -h / 2), color=col, bevel=0, rot=(-tilt, 0, 0))
            deform(o, lambda p, y=y, z=z, dy=dy: p + Vector((0, y + dy, z + 0.7)))
            parts.append(o)
    # the hub and four lattice sails, a few degrees off upright
    hz, hy = 15.0, -5.75
    hub = cyl(0.75, 1.9, at=(0, hy + 1.3, hz), color=C.charcoal, seg=10, bevel=0, rot=(90, 0, 0))
    parts.append(hub)
    parts.append(blob(0.5, (0, hy - 0.65, hz), C.charcoal, seg=8, rings=3, scale=(1, 0.7, 1)))
    for k in range(4):
        ang = 12 + 90 * k
        sail = [box((0.45, 0.3, 10.8), at=(0, 0, 0.3), color=wood, bevel=0)]
        for wx in (0.35, 1.75):
            sail.append(box((0.16, 0.18, 8.4), at=(wx, 0.05, 2.5), color=wood, bevel=0))
        for j in range(5):
            sail.append(box((1.6, 0.16, 0.16), at=(1.05, 0.06, 2.5 + j * 8.24 / 4), color=wood, bevel=0))
        sail.append(box((1.3, 0.04, 8.2), at=(1.05, 0.2, 2.6), color=lt(C.cream, 0.3), bevel=0))
        m = Euler((0, math.radians(ang), 0), 'XYZ').to_matrix()
        for o in sail:
            deform(o, lambda p, m=m: m @ p + Vector((0, hy, hz)))
        parts += sail
    return parts


# ---------------------------------------------------------------- shrines

def lintel(L_, depth, height, z, color, sweep_up=0.3, sag=0.0, n=12, taper=0.0):
    """A beam along X whose ends sweep upward (torii lintels, shrine ridges)."""
    xs = [-L_ / 2 + L_ * i / n for i in range(n + 1)]
    prof = [(-depth / 2, 0.0), (depth / 2, 0.0), (depth / 2, height), (-depth / 2, height)]
    o = xsweep(prof, xs, [color], smooth=40)

    def bend(p):
        t = abs(p.x) / (L_ / 2)
        up = sweep_up * t ** 3 - sag * (1 - t * t)
        # the ends thicken a touch upward, like a carved beam
        return Vector((p.x, p.y, z + p.z * (1 + taper * t * t) + up))
    deform(o, bend)
    return o


@model('torii', ao=0.6)
def torii(v):
    red, dark = L(C.red), L(C.redDark)
    black = L(C.charcoal)
    parts = []
    for s in (-1, 1):
        # pillars lean in a hair, on black footings
        p = revolve([(0.2, 0.3), (0.17, 3.2), (0.0, 3.22)], seg=12, color=red, smooth=40, cap_bottom=False)
        deform(p, lambda q, s=s: Vector((q.x + s * (1.5 - 0.02 * q.z), q.y, q.z)))
        parts.append(p)
        parts.append(revolve([(0.25, 0.0), (0.25, 0.36), (0.19, 0.42), (0.0, 0.42)], seg=12, color=black, smooth=40,
                             cap_bottom=False))
        deform(parts[-1], lambda q, s=s: Vector((q.x + s * 1.5, q.y, q.z)))
    # the tie beam through the pillars, its ends just proud of them
    parts.append(box((4.1, 0.2, 0.22), at=(0, 0, 2.6), color=red, bevel=0.04, seg=1))
    # the central strut and its dark plaque with a gold rim
    parts.append(box((0.4, 0.24, 0.36), at=(0, 0, 2.8), color=C.gold, bevel=0.03, seg=1))
    parts.append(box((0.3, 0.27, 0.27), at=(0, 0, 2.845), color=black, bevel=0))
    # lower lintel in deep red, the swept top lintel capped in black
    parts.append(lintel(4.6, 0.34, 0.2, 3.14, dark, sweep_up=0.06))
    parts.append(lintel(5.0, 0.48, 0.16, 3.34, dark, sweep_up=0.16, taper=0.3))
    parts.append(lintel(5.0, 0.5, 0.08, 3.5, black, sweep_up=0.16, taper=0.3))
    return parts


def zigzag(x, y, z, h, color):
    """A folded paper streamer (shide) hanging from a rope, facing -Y."""
    w = h * 0.22
    pts = [(-w, 0), (w, 0), (w, -h * 0.3), (0.0, -h * 0.3), (0.0, -h * 0.6), (w * 0.9, -h * 0.6), (w * 0.9, -h),
           (-w * 0.5, -h), (-w * 0.5, -h * 0.75), (-w * 1.1, -h * 0.75), (-w * 1.1, -h * 0.45), (-w * 0.2, -h * 0.45),
           (-w * 0.2, -h * 0.15), (-w, -h * 0.15)]
    return flat([(px + x, pz + z) for (px, pz) in pts], y, color)


def roof_section(hw, eave, ridge, thick, n=4, curve=1.6):
    """A concave pitched-roof cross-section (x, z) for `prism`: the slopes
    sag between ridge and eave, as temple roofs do."""
    top = []
    for i in range(n + 1):
        t = i / n
        top.append((-hw + hw * t, eave + (ridge - eave) * t ** curve))
    for i in range(1, n + 1):
        t = 1 - i / n
        top.append((hw - hw * t, eave + (ridge - eave) * t ** curve))
    under = [(x, z - thick) for (x, z) in reversed(top)]
    return top + under


@model('shrine', ao=0.65)
def shrine(v):
    wood = L(C.woodRed)
    roof = L(C.roofTile)
    black = L(C.charcoal)
    parts = [box((2.0, 1.6, 0.26), at=(0, 0, 0), color=C.concrete, bevel=0.05, seg=1),
             box((1.75, 1.4, 0.16), at=(0, 0, 0.24), color=lt(C.concrete, 0.15), bevel=0.04, seg=1)]
    body = walls(1.4, 1.1, [0.4, 0.8, 1.4, 1.95], wood, r=0.05, n=1)
    parts.append(body)
    fy = -0.55
    for sx in (-1, 1):
        for sy in (-1, 1):
            parts.append(box((0.14, 0.14, 1.6), at=(sx * 0.7, sy * 0.55, 0.4), color=dk(C.woodRed, 0.2), bevel=0))
    # a little veranda and the lattice doors
    parts.append(box((1.6, 0.3, 0.1), at=(0, fy - 0.15, 0.4), color=C.woodDark, bevel=0))
    parts.append(chip(1.0, 1.15, 0.0, fy, 0.55, black, t=0.04))
    for x in (-0.25, 0.0, 0.25):
        parts.append(chip(0.05, 1.15, x, fy - 0.04, 0.55, C.gold if x == 0 else wood, t=0.03))
    for z in (0.85, 1.25):
        parts.append(chip(1.0, 0.05, 0.0, fy - 0.04, z, wood, t=0.03))
    # the roof: concave slopes, ridge front-to-back like v1's, deep eaves
    sec = roof_section(1.25, 1.88, 2.62, 0.12)
    rf = prism(list(reversed(sec)), 2.1, color=roof, bevel=0, rot=(90, 0, 0))
    deform(rf, lambda p: Vector((p.x, p.y + 1.05, p.z)))
    parts.append(rf)
    parts.append(gable_fill(1.4, 1.1, 1.95, 0.55, wood))
    parts.append(box((0.16, 2.2, 0.14), at=(0, 0, 2.55), color=black, bevel=0.03, seg=1))
    # crossed finials (chigi) at both gable ends and three billets on the ridge
    for y in (-1.0, 1.0):
        for s in (-1, 1):
            o = box((0.07, 0.07, 0.75), at=(0, 0, 0), color=C.woodDark, bevel=0, rot=(0, s * 32, 0))
            deform(o, lambda p, y=y, s=s: Vector((p.x - s * 0.08, p.y + y, p.z + 2.42)))
            parts.append(o)
    for y in (-0.55, 0.0, 0.55):
        parts.append(sweep([(-0.21, y, 2.74), (0.21, y, 2.74)], [0.065, 0.065], n=8, color=C.gold))
    # a sacred rope under the eave with paper streamers, and an offering box
    ry = fy - 0.32
    rope = [(-0.75 + 1.5 * i / 6, ry, 1.82 - 0.1 * math.sin(math.pi * i / 6)) for i in range(7)]
    parts.append(sweep(rope, [0.045 + 0.02 * math.sin(math.pi * i / 6) for i in range(7)], n=6, color=C.tan))
    for x in (-0.38, 0.0, 0.38):
        parts.append(zigzag(x, ry - 0.06, 1.72 - 0.1 * math.sin(math.pi * (x + 0.75) / 1.5), 0.32, C.white))
    parts.append(box((0.6, 0.32, 0.36), at=(0, -0.92, 0.0), color=C.woodDark, bevel=0.03, seg=1))
    for x in (-0.18, 0.0, 0.18):
        parts.append(box((0.08, 0.34, 0.03), at=(x, -0.92, 0.36), color=black, bevel=0))
    return parts


def sq(a):
    """Radius factor that turns a circle into an axis-aligned square."""
    return 1.0 / max(abs(math.cos(a)), abs(math.sin(a)))


def pagoda_roof(w_in, eave, z0, rise, w_top, lift, color, top=False):
    """One square roof tier with corners that curl upward."""
    hw = w_in / 2
    prof = [(hw - 0.1, z0), (eave, z0 + 0.1), (eave, z0 + 0.42), (eave * 0.62 + w_top * 0.2, z0 + 0.42 + rise * 0.45),
            (w_top / 2 + 0.15, z0 + 0.42 + rise)]
    if top:
        prof.append((0.0, z0 + 0.5 + rise))

    def warp(a, r, z, i):
        k = sq(a)
        c = ((k - 1.0) / (math.sqrt(2) - 1.0)) ** 1.3
        lf = {1: 1.0, 2: 1.0, 3: 0.3}.get(i, 0.0)
        return r * k, z + lift * c * lf
    o = revolve(prof, seg=16, color=color, warp=warp, smooth=40, cap_bottom=True, cap_top=not top)
    return o


# v1's box is 16.25 wide only because its wall panels were turned the wrong
# way and poke 4 m out of the first tier; the eaves here reach ~15.4 m, which
# keeps every axis inside the 10 % band.
@model('pagoda', ao=0.65)
def pagoda(v):
    wood = L(C.woodRed)
    tile = L(C.roofTile)
    black = L(C.charcoal)
    parts = [box((12.6, 12.6, 0.4), at=(0, 0, 0), color=C.concrete, bevel=0.08, seg=1),
             box((11.4, 11.4, 0.3), at=(0, 0, 0.35), color=lt(C.concrete, 0.12), bevel=0.06, seg=1),
             box((3.2, 1.2, 0.35), at=(0, -6.6, 0.0), color=C.concrete, bevel=0.06, seg=1)]
    w, z = 9.4, 0.62
    for i in range(5):
        h = 2.9 - i * 0.2
        body = walls(w, w, [z, z + h * 0.35, z + h], wood, r=0.15, n=1, cap=False)
        parts.append(body)
        # a dark door panel centred on each face, with a gold bar over it
        for k in range(4):
            a = k * math.pi / 2
            ca, sa = math.cos(a), math.sin(a)
            pw, ph = w * 0.34, h * 0.55
            o = box((pw, 0.08, ph), at=(0, 0, 0), color=black, bevel=0)
            o2 = box((pw + 0.3, 0.1, 0.18), at=(0, 0, ph + 0.1), color=C.gold, bevel=0)
            for q in (o, o2):
                deform(q, lambda p, ca=ca, sa=sa: Vector((p.x * ca - (p.y - w / 2) * sa, p.x * sa + (p.y - w / 2) * ca,
                                                          p.z + z + h * 0.12)))
                parts.append(q)
        z += h
        w2 = w * 0.86
        top = i == 4
        rise = 1.25 if not top else 1.9
        parts.append(pagoda_roof(w, w * 0.84, z - 0.05, rise, w2 if not top else 0.6, 1.0 - i * 0.08, tile, top=top))
        z += 0.42 + rise
        w = w2
    # the finial: a gold mast of rings with a jewel on top
    prof = [(0.45, z - 0.2), (0.3, z + 0.3), (0.22, z + 0.6)]
    for k in range(5):
        zr = z + 1.0 + k * 0.55
        rr = 0.62 - k * 0.07
        prof += [(0.18, zr - 0.15), (rr, zr), (0.18, zr + 0.15)]
    zt = z + 1.0 + 5 * 0.55
    prof += [(0.15, zt + 0.3), (0.0, zt + 0.32)]
    parts.append(revolve(prof, seg=10, color=C.gold, smooth=50, cap_bottom=False))
    parts.append(blob(0.4, (0, 0, zt + 0.6), C.gold, seg=10, rings=5, scale=(1, 1, 1.15)))
    return parts
