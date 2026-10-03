"""World-stage props, the smaller half of the ladder: a city, a waterfall, a
reef, a mountain ... up to a cloud front.

Frame reminder (see kit.py): Blender Z is up, X is the prop's width, and the
game's FRONT (+Z) is Blender -Y. v1 (src/world/props/world.js) is authored in
the game frame, so a v1 point (x, y, z) lands here at (x, -z, y).

These are geography seen from far above, read as a toy globe or a relief map
would show them: chunky landforms, terraced where steps read better than a
blob, two or three big colour masses. Every prop is modelled loosely and then
`fit()` to its catalogue box (v1 randomised its outlines, and the game
stretches each model to its box anyway).
"""
import math
import random
import bmesh
from mathutils import Vector, Matrix, Euler
import kit
from kit import (box, cyl, sphere, torus, lathe, extrude, tube, arc_points,
                 subdivide, deform, recolor, lin, mixc, paint, glow, C, SETS)
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


# The world stage's own landscape tin (G in src/world/props/world.js), which
# the shared palette does not carry.
G = type('G', (), dict(
    ocean=0x1a5390, oceanDeep=0x103a6c, abyss=0x0a2748, shelf=0x2f93bd, lagoon=0x63cbd6,
    surf=0xd9f1f9, foam=0xf2fbff, river=0x4fb4dc, lake=0x2f7fb8, marsh=0x4d7a63, silt=0xa79263,
    land=0x6f9c4c, landDry=0xa6ae5d, forest=0x3f7c3a, forestDk=0x275527, jungle=0x2c7d3f,
    jungleDk=0x1d5b2c, steppe=0xb3a962, tundra=0x8a9270, sand=0xe1c684, sandDeep=0xc4a05a,
    salt=0xf3f0e4, saltDk=0xd9d3bd,
    rock=0x8b8175, rockDk=0x5d564f, scree=0xa7a094, granite=0x7a7f88, crust=0x463f3a,
    basalt=0x2d2a30, ash=0x6e6a6c, lava=0xff7a30, ember=0xffb055,
    ice=0xe7f5fc, iceBlue=0xb6dcf0, iceDeep=0x8ec6e6, snow=0xfcfdff,
    cloud=0xf6fbff, cloudGrey=0xccd8e5, storm=0x9aacbe, rain=0x7fa8c8,
    coral=0xf08a6a, coralPink=0xf0a8c0, kelp=0x4a7a4a, city=0xc9ccd2, cityDk=0x8d939c,
    glass=0x7fa6c4, lamp=0xffd98a,
))


# ---------------------------------------------------------------- helpers

def L(col):
    return lin(col) if isinstance(col, int) else col


def dk(col, t=0.2):
    return mixc(L(col), (0, 0, 0), t)


def lt(col, t=0.4):
    return mixc(L(col), (1, 1, 1), t)


def clamp01(t):
    return max(0.0, min(1.0, t))


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


def floor0(parts, z=0.0):
    for o in parts:
        deform(o, lambda p: Vector((p.x, p.y, max(p.z, z))))
    return parts



def gv(x, y, z):
    """A v1 (game-frame) point in the Blender frame."""
    return (x, -z, y)


def blk(w, h, d, x, y, z, color, ry=0.0, bev=None, rx=0.0):
    """A chunky block in v1 terms: width w, height h, depth d, bottom centre
    at game (x, y, z), turned ry radians about the vertical (game ry and
    Blender rz agree in sign). One bevel segment: 44 triangles."""
    if bev is None:
        bev = min(w, h, d) * 0.14
    return box((w, d, h), at=gv(x, y, z), color=color, bevel=bev, seg=1,
               rot=(math.degrees(rx), 0, math.degrees(ry)))


def revolve(prof, seg=24, color=0xcccccc, warp=None, smooth=50, cap_bottom=True, cap_top=True, phase=0.0,
            a0=None, a1=None):
    """A lathe whose rings may wobble: prof is [(r, z), ...] bottom to top, and
    warp(angle, r, z, ring_index) -> (r, z) moves each ring vertex. A ring of
    radius 0 is a single pole vertex. With a0/a1 (radians) it sweeps only that
    arc and closes both ends with the profile."""
    bm = bmesh.new()
    rings = []
    part = a0 is not None
    cols = seg + 1 if part else seg
    for i, (r, z) in enumerate(prof):
        if r <= 1e-7 and not part:
            rings.append([bm.verts.new((0, 0, z if warp is None else warp(0.0, 0.0, z, i)[1]))])
            continue
        ring = []
        for j in range(cols):
            a = (a0 + (a1 - a0) * j / seg) if part else 2 * math.pi * j / seg + phase
            rr, zz = (r, z) if warp is None else warp(a, r, z, i)
            ring.append(bm.verts.new((rr * math.cos(a), rr * math.sin(a), zz)))
        rings.append(ring)
    span = seg if part else seg
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
            for j in range(span):
                j2 = j + 1 if part else (j + 1) % seg
                bm.faces.new((a[j], a[j2], b[j2], b[j]))
    if part:
        # the profile closes on itself: cap the two ends
        bm.faces.new([r[0] for r in rings])
        bm.faces.new([r[-1] for r in reversed(rings)])
    else:
        if cap_bottom and len(rings[0]) > 1:
            bm.faces.new(list(reversed(rings[0])))
        if cap_top and len(rings[-1]) > 1:
            bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = _from_bmesh(bm, 'revolve')
    paint(o, color)
    return _smooth(o, smooth)


def blob(r, at, color, seg=10, rings=None, scale=(1, 1, 1), rot=(0, 0, 0), flat=None):
    """A low-poly sphere (lathed, so the ring count is free): canopy lumps,
    cloud puffs, coral heads. `flat` clamps everything below that height."""
    rings = rings or max(3, seg // 2)
    prof = [(r * math.sin(math.pi * i / rings), -r * math.cos(math.pi * i / rings)) for i in range(rings + 1)]
    o = revolve(prof, seg=seg, color=color, smooth=80)
    m = Euler(tuple(math.radians(a) for a in rot), 'XYZ').to_matrix()
    deform(o, lambda p: m @ Vector((p.x * scale[0], p.y * scale[1], p.z * scale[2])) + Vector(at))
    if flat is not None:
        deform(o, lambda p: Vector((p.x, p.y, max(p.z, flat))))
    return o


def rock(r, at, color, sub=1, scale=(1, 1, 1), seed=0, cuts=6, depth=0.2, rot=(0, 0, 0)):
    """A chunky boulder: an icosphere sliced by a few random planes, so it has
    broad flat facets like a cut toy stone."""
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


def lobes(rnd, k=(3, 5), amp=(0.07, 0.04)):
    """An outline wobble a(angle) -> radius factor, so nothing is a circle."""
    ph = [rnd.uniform(0, 6.28) for _ in k]
    return lambda a: 1 + sum(am * math.cos(kk * a + p) for kk, am, p in zip(k, amp, ph))


def slab(R, h, color, seg=24, wob=None, rim=0.25, at=(0, 0, 0), top=None, rings=1):
    """A low land/water disc with a soft rolled edge (the house style's
    bevel, done in the profile), its outline wobbled by wob(angle). `top` is
    the top face's colour if it differs from the sides; `rings` adds inner
    rings so a wide flat top has vertices for the AO to land on."""
    c = min(h * rim * 2, R * 0.2)
    prof = [(R, 0.0), (R, h - c), (R - c * 0.3, h - c * 0.3), (R - c, h)]
    for k in range(rings, 0, -1):
        prof.append(((R - c) * k / (rings + 1), h))
    prof.append((0.0, h))
    w = (lambda a, r, z, i: (r * wob(a), z)) if wob else None
    o = revolve(prof, seg=seg, color=color, warp=w, smooth=50, cap_bottom=True)
    if top is not None:
        recolor(o, lambda cc, n: top if n.z > 0.7 else None)
    deform(o, lambda p: p + Vector(at))
    return o


# ================================================================= GROUND LEVEL

# The one made thing in the stage: a grey plinth of streets, a cluster of
# towers tallest in the middle (height falling as the square of the distance
# out), suburbs strung along the roads, and a river through it.
@model('wd_city', ao=0.6)
def wd_city(v):
    rnd = random.Random(300 + v * 17)
    wob = lobes(rnd, (3, 5), (0.05, 0.03))
    parts = []
    base = slab(1.2, 0.06, G.cityDk, seg=20, wob=wob, rim=0.4, rings=0)
    deck = slab(1.02, 0.05, G.city, seg=20, wob=wob, rim=0.4, at=(0, 0, 0.04), rings=1)
    parts += [base, deck]
    top = 0.09
    # the river, and two roads crossing under the towers out to the suburbs
    ra = 0.35 + v * 0.42
    parts.append(blk(2.36, 0.022, 0.17, 0, top - 0.012, 0, G.river, ry=ra, bev=0.006))
    for k in range(3):
        a = ra + 0.9 + k * math.pi / 3
        parts.append(blk(2.2, 0.012, 0.06, 0, top - 0.006, 0, dk(G.cityDk, 0.25), ry=a, bev=0.0))
    if v > 1:
        # the lit downtown: a warm plaza under the towers
        parts.append(slab(0.5, 0.016, G.lamp, seg=12, rings=0, at=(0, 0, top - 0.008)))
    # a park on the far side of the river
    pa = -ra + 1.9
    parts.append(slab(0.2, 0.02, G.land, seg=10, rings=0, at=(math.cos(pa) * 0.62, math.sin(pa) * 0.62, top - 0.01)))
    parts.append(blob(0.08, (math.cos(pa) * 0.62, math.sin(pa) * 0.62, top + 0.04), G.forest, seg=8, rings=3,
                      scale=(1, 1, 0.8)))

    def near_river(x, y):
        # distance from the river's line, in the Blender plane (game ry = Blender rz)
        return abs(-math.sin(ra) * x + math.cos(ra) * y) < 0.15

    placed = []
    tries = 0
    while len(placed) < 10 and tries < 400:
        tries += 1
        a, d = rnd.uniform(0, 2 * math.pi), 0.92 * math.sqrt(rnd.random())
        x, y = math.cos(a) * d, math.sin(a) * d
        if near_river(x, y) or math.hypot(x - math.cos(pa) * 0.62, y - math.sin(pa) * 0.62) < 0.26:
            continue
        w = 0.15 + rnd.random() * 0.07
        if any(math.hypot(x - px, y - py) < (w + pw) * 0.62 for px, py, pw in placed):
            continue
        placed.append((x, y, w))
    placed.sort(key=lambda t: math.hypot(t[0], t[1]))
    for i, (x, y, w) in enumerate(placed):
        f = 1 - math.hypot(x, y)
        h = 0.14 + f * f * 0.95 + rnd.random() * 0.14
        col = G.glass if i % 4 == 1 else (G.city if i % 3 else lt(G.cityDk, 0.25))
        d = w * (0.75 + rnd.random() * 0.4)
        t = box((w, d, h), at=(x, y, top - 0.005), color=col, bevel=min(w, d) * 0.14, seg=1,
                rot=(0, 0, rnd.uniform(-20, 20)))
        recolor(t, lambda c, n, col=col: lt(col, 0.35) if n.z > 0.7 else None)
        # a band of windows round the tall ones, a shade darker
        if h > 0.5:
            recolor(t, lambda c, n, col=col, h=h: dk(col, 0.22) if abs(n.z) < 0.3 and int((c.z - top) / h * 6) % 2 else None)
        parts.append(t)
        if i < 2 and h > 0.55:
            # a setback crown on the downtown towers
            parts.append(box((w * 0.6, d * 0.6, h * 0.22), at=(x, y, top + h - 0.01), color=lt(col, 0.2),
                             bevel=w * 0.06, seg=1, rot=(0, 0, rnd.uniform(-20, 20))))
    # suburbs strung out along the roads, which is what sets the footprint
    for i in range(6):
        a = (i / 6) * 2 * math.pi + v * 0.4
        x, y = math.cos(a) * 1.06, -math.sin(a) * 1.06
        parts.append(blk(0.42, 0.06, 0.24, x, 0.05, -y, G.cityDk if i % 2 else lt(G.cityDk, 0.15), ry=-a))
    return fit(parts, 'wd_city', v)


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


def side_prism(prof, w, color, bev=0.0, x=0.0):
    """A side profile [(blender_y, z), ...] extruded across X, centred on x:
    a waterfall's curving sheet, a cliff's stepped section."""
    o = prism(prof, w, color=color, bevel=bev, seg=1)
    deform(o, lambda p: Vector((p.z - w / 2 + x, p.x, p.y)))
    return o


# A waterfall, which is really a waterfall AND the gorge below it: two
# shoulders of plateau with the notch between them, the sheet going over, the
# plunge pool, and the gorge walking away downstream with a wobble in it.
# v1's plateau is at game +z (Blender -Y), the gorge runs off towards -z.
@model('wd_waterfall', ao=0.6)
def wd_waterfall(v):
    rnd = random.Random(410 + v * 13)
    H = 1.0
    parts = []
    band = lt(G.rockDk, 0.18)
    for s in (-1, 1):
        hh = H * (0.9 + rnd.random() * 0.1)
        # a two-step cliff: a broad lower tier and the plateau set back on it
        sh = blk(0.96, hh * 0.55, 1.12, s * 0.74, 0, 0.6, G.rockDk)
        recolor(sh, lambda c, n: band if n.z > 0.7 else None)
        parts.append(sh)
        up = blk(0.86, hh * 0.5, 1.0, s * 0.77, hh * 0.5, 0.64, G.rockDk)
        recolor(up, lambda c, n, hh=hh: band if hh * 0.68 < c.z < hh * 0.78 and n.z < 0.7 else None)
        parts.append(up)
        parts.append(blk(0.82, 0.1, 0.96, s * 0.77, hh - 0.04, 0.64, G.forest if s > 0 else G.land))
        # a clump of trees on each shoulder
        for k, (dx, dz, r) in enumerate(((0.08, 0.22, 0.15), (-0.1, 0.4, 0.12))):
            parts.append(blob(r, gv(s * (0.8 + dx), hh + 0.06 + r * 0.4, 0.6 + dz), G.forestDk if (s + k) % 2 else G.forest,
                              seg=8, rings=3, scale=(1, 1, 0.9)))
    # the notch: a lower lip of rock carrying the river to the edge
    lip = blk(0.64, H * 0.84, 1.0, 0, 0, 0.66, G.rockDk)
    recolor(lip, lambda c, n: band if H * 0.38 < c.z < H * 0.52 and n.z < 0.7 else None)
    parts.append(lip)
    parts.append(blk(0.46, 0.07, 1.0, 0, H * 0.82, 0.66, G.river, bev=0.02))
    # the sheet: a curving fall leaning out from the cliff face (game z 0.16,
    # Blender y -0.16) towards the pool (Blender +y), striped with spray
    t = 0.09
    n = 6
    outer, inner = [], []
    for i in range(n + 1):
        f = i / n                               # 0 at the lip, 1 at the pool
        y = -0.16 + 0.22 * f * f
        z = H * 0.86 * (1 - f) + 0.03
        outer.append((y + t, z))
        inner.append((y, z))
    # counter-clockwise in the (y, z) plane: down the outer face, up the inner
    poly = list(reversed(outer)) + inner
    poly = list(reversed(poly))
    sheet = side_prism(poly, 0.5, G.foam, bev=0.015)
    recolor(sheet, lambda c, n: L(G.surf) if int((c.x + 1) / 0.077) % 2 and abs(n.x) < 0.6 else None)
    parts.append(sheet)
    parts.append(tube([(-0.25, -0.12, H * 0.88), (0.25, -0.12, H * 0.88)], 0.05, color=G.snow, seg=8))
    # the plunge pool and the spray standing over it
    parts.append(slab(0.62, 0.06, G.lagoon, seg=16, at=gv(0, 0, -0.34), rings=0))
    parts.append(slab(0.4, 0.03, G.river, seg=12, at=gv(0, 0.05, -0.34), rings=0))
    for (x, z, r) in ((-0.2, -0.14, 0.17), (0.19, -0.18, 0.15), (0.0, -0.26, 0.14)):
        parts.append(blob(r, gv(x, 0.1 + r * 0.6, z), G.foam, seg=8, rings=4, scale=(1.2, 1, 0.85)))
    # the gorge, wobbling so it is not a slot
    for i in range(2):
        z = -(0.82 + i * 0.6)
        wob = math.sin(i * 1.5 + v) * 0.24
        for s in (-1, 1):
            hh = H * (0.5 + rnd.random() * 0.28)
            w = blk(0.52, hh, 0.64, s * 0.76 + wob, 0, z, G.rock)
            recolor(w, lambda c, n: lt(G.rock, 0.2) if n.z > 0.7 else None)
            parts.append(w)
        parts.append(blk(0.4, 0.05, 0.66, wob, 0, z, G.river, bev=0.015))
    return fit(parts, 'wd_waterfall', v)


# A reef: a broken ring of coral round a lagoon, surf breaking on its outer
# edge, the passes left open, coral heads inside and one sand cay.
@model('wd_reef', ao=0.55)
def wd_reef(v):
    rnd = random.Random(520 + v * 7)
    parts = []
    shelf, lag = L(G.shelf), L(G.lagoon)
    base = slab(1.12, 0.1, G.lagoon, seg=24, wob=lobes(rnd, (3, 4), (0.03, 0.03)), rings=2)
    regrade(base, lambda p: mixc(shelf, lag, clamp01((math.hypot(p.x, p.y) - 0.3) / 0.6)) if p.z > 0.09 else lag)
    parts.append(base)
    # the ring, broken at v1's two passes (game angles i/11 turns, i = 3-v, 8-v)
    tau = 2 * math.pi
    gaps = sorted([((3 - v) % 11) / 11 * tau, ((8 - v) % 11) / 11 * tau])
    half = 0.5 / 11 * tau * 0.95
    arcs = [(gaps[0] + half, gaps[1] - half), (gaps[1] + half, gaps[0] + tau - half)]
    ph = rnd.uniform(0, 6.28)
    rockc, foam, surf = L(G.rock), L(G.foam), lt(G.surf, 0.2)
    prof = [(1.18, 0.0), (1.12, 0.22), (1.02, 0.34), (0.88, 0.36), (0.76, 0.24), (0.68, 0.0)]

    def warp(a, r, z, i):
        k = 0.8 + 0.24 * math.sin(3 * a + ph) + 0.16 * math.sin(13 * a)
        return r * (1 + 0.03 * math.sin(5 * a + ph)), z * k + (0.06 if 0 < i < 5 else 0)

    def col(c, n):
        r = math.hypot(c.x, c.y)
        a = math.atan2(c.y, c.x)
        if r > 1.07:
            return foam if c.z < 0.1 else surf  # surf breaking all round the outside
        if math.sin(4 * a + ph) > 0.6:
            return rockc
        return None
    for (g0, g1) in arcs:
        # game angle a sits at Blender angle -a
        seg = max(8, int((g1 - g0) / tau * 52))
        ring = revolve(prof, seg=seg, color=G.coral, warp=warp, smooth=55, a0=-g1, a1=-g0)
        recolor(ring, col)
        parts.append(ring)
    # knobs of living coral along the crest
    for (g0, g1) in arcs:
        m = max(2, int((g1 - g0) / tau * 14))
        for k in range(m):
            a = -(g0 + (g1 - g0) * (k + 0.5) / m)
            r = 0.07 + rnd.random() * 0.04
            z = 0.3 * (0.8 + 0.24 * math.sin(3 * a + ph)) + 0.06
            parts.append(blob(r, (math.cos(a) * 0.92, math.sin(a) * 0.92, z), G.coralPink if k % 2 else lt(G.coral, 0.15),
                              seg=8, rings=4, scale=(1.2, 1.2, 0.8)))
    # coral heads inside the lagoon
    for i in range(6):
        a, d = rnd.uniform(0, tau), 0.55 * math.sqrt(rnd.random())
        r = 0.08 + rnd.random() * 0.06
        parts.append(blob(r, (math.cos(a) * d, math.sin(a) * d, 0.1), G.coralPink if i % 3 else G.coral, seg=8,
                          rings=4, scale=(1, 1, 0.7), flat=0.07))
    # a sand cay, the only dry land on the whole thing
    cx, cy = gv(0.3, 0, -0.24)[:2]
    parts.append(slab(0.2, 0.2, G.sand, seg=14, at=(cx, cy, 0.05), rim=0.4, rings=0))
    if v > 0:
        for i in range(3):
            a = i * 2.1 + v
            parts.append(blob(0.06, (cx + math.cos(a) * 0.08, cy + math.sin(a) * 0.08, 0.3), G.kelp, seg=8,
                              rings=4, scale=(1, 1, 0.8)))
    return fit(parts, 'wd_reef', v)


def ridged_peak(R, H, at, seg, rnd, n_ridge=5, ridge=0.2, snow=0.7, crag=0.42, foot=0.14, ice=None,
                rockc=None, cragc=None, footc=None, snowc=None):
    """A toy mountain: a lathed peak with arêtes (the radius swells along
    n_ridge directions, most at mid-height), a scree foot, rock flanks, dark
    crags between the ridges and a cap of snow whose lower edge drips down the
    ridges. `ice` (angle, half-width) paints a glacier into one cirque."""
    rockc = L(rockc if rockc is not None else G.rock)
    cragc = L(cragc if cragc is not None else G.rockDk)
    footc = L(footc if footc is not None else G.scree)
    snowc = L(snowc if snowc is not None else G.snow)
    ph = rnd.uniform(0, 6.28)
    lob = lobes(rnd, (2, 3), (0.06, 0.05))
    prof = [(R, 0.0), (R * 0.86, H * 0.1), (R * 0.68, H * 0.28), (R * 0.5, H * 0.48), (R * 0.34, H * 0.66),
            (R * 0.2, H * 0.82), (R * 0.08, H * 0.95), (0.0, H)]
    wts = [0.3, 0.6, 1.0, 1.0, 0.85, 0.6, 0.3, 0.0]

    def rf(a):
        return max(0.0, math.cos(n_ridge * (a + ph))) ** 2

    def warp(a, r, z, i):
        return r * lob(a) * (1 + ridge * wts[i] * rf(a)), z

    o = revolve(prof, seg=seg, color=rockc, warp=warp, smooth=42, cap_bottom=False)

    def col(c, n):
        a = math.atan2(c.y, c.x)
        z = c.z / H
        if z > snow - 0.1 * rf(a):
            return snowc
        if ice and abs(math.remainder(a - ice[0], 2 * math.pi)) < ice[1] and 0.22 < z:
            return L(G.iceBlue)
        if z < foot:
            return footc
        if z > crag and rf(a) < 0.3:
            return cragc
        return None
    recolor(o, col)
    deform(o, lambda p: p + Vector(at))
    return o


@model('wd_mountain', ao=0.55)
def wd_mountain(v):
    rnd = random.Random(600 + v * 11)
    H = 1.7
    parts = [slab(1.02, 0.09, G.scree, seg=20, wob=lobes(rnd, (3, 5), (0.05, 0.03)), rings=0),
             slab(0.84, 0.06, G.rockDk, seg=18, wob=lobes(rnd), rings=0, at=(0, 0, 0.06))]
    ga = rnd.uniform(0, 6.28)
    parts.append(ridged_peak(0.72, H - 0.08, (0, 0, 0.08), 20, rnd, ridge=0.34, snow=0.68, ice=(ga, 0.3)))
    # shoulders, each with its own summit so the massif is not one cone
    for i in range(3):
        a = ga + 1.2 + i * 1.6 + rnd.uniform(-0.2, 0.2)
        h = H * (0.45 + rnd.random() * 0.2)
        d = 0.52
        parts.append(ridged_peak(0.44, h, (math.cos(a) * d, math.sin(a) * d, 0.05), 14, rnd, n_ridge=2, ridge=0.12,
                                 snow=0.74, rockc=G.rockDk, cragc=dk(G.rockDk, 0.15)))
    # a tarn at the foot of the glacier
    parts.append(slab(0.14, 0.03, G.lake, seg=10, rings=0, at=(math.cos(ga) * 0.74, math.sin(ga) * 0.74, 0.08)))
    return fit(parts, 'wd_mountain', v)


def relief(path, section, height=None, lateral=None, color=None, base=0xcccccc, smooth=50, caps='floor'):
    """A cross-section swept along a path: the whole of a canyon, a glacier's
    valley or an escarpment as ONE surface whose bands are the strata.

    `path` is [(x, y, nx, ny), ...] in the Blender plane (a station and its
    unit lateral direction); `section` is [(u, z), ...] across the top surface,
    left to right, starting and ending at the floor if the ends are walls.
    `height(t, k, u, z)` and `lateral(t, k, u, z)` reshape each station
    (t runs 0..1 along the path, k indexes the section). `color(t, k, zc, end)`
    paints the band between section points k and k+1 (end=True for the two
    end walls). The underside stays open: it sits on the floor. caps='fan'
    closes each end on its own centre instead (a floating bank of cloud)."""
    S, K = len(path), len(section)
    bm = bmesh.new()
    grid = []
    for s, (x, y, nx, ny) in enumerate(path):
        t = s / (S - 1)
        row = []
        for k, (u, z) in enumerate(section):
            uu = lateral(t, k, u, z) if lateral else u
            zz = height(t, k, u, z) if height else z
            row.append(bm.verts.new((x + nx * uu, y + ny * uu, zz)))
        grid.append(row)
    cols = []
    for s in range(S - 1):
        t = (s + 0.5) / (S - 1)
        for k in range(K - 1):
            q = (grid[s][k], grid[s + 1][k], grid[s + 1][k + 1], grid[s][k + 1])
            bm.faces.new(q)
            cols.append(color(t, k, sum(v.co.z for v in q) / 4, False) if color else base)
    for s in (0, S - 1):
        row = grid[s]
        if caps == 'fan':
            ctr = bm.verts.new(sum((v.co for v in row), Vector()) / len(row))
            for k in range(K - 1):
                if row[k] is row[k + 1]:
                    continue
                tri = [row[k], row[k + 1], ctr]
                bm.faces.new(tri if s == 0 else list(reversed(tri)))
                cols.append(color(float(s > 0), k, ctr.co.z, True) if color else base)
            continue
        floor = [v if v.co.z < 1e-6 else bm.verts.new((v.co.x, v.co.y, 0.0)) for v in row]
        for k in range(K - 1):
            q = [row[k], row[k + 1], floor[k + 1], floor[k]]
            uq = []
            for v in q:
                if v not in uq:
                    uq.append(v)
            if len(uq) < 3:
                continue
            bm.faces.new(uq if s == 0 else list(reversed(uq)))
            cols.append(color(float(s > 0), k, sum(v.co.z for v in uq) / len(uq), True) if color else base)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = _from_bmesh(bm, 'relief')
    me = o.data
    attr = me.color_attributes.new('base', 'FLOAT_COLOR', 'CORNER')
    for poly in me.polygons:
        c = L(cols[poly.index] if cols[poly.index] is not None else base)
        for li in poly.loop_indices:
            attr.data[li].color = (*c, 1.0)
    return _smooth(o, smooth)


def straight_path(y0, y1, n, cx=lambda t: 0.0):
    """Stations along Blender Y, lateral direction +X, centre x = cx(t)."""
    return [(cx(i / (n - 1)), y0 + (y1 - y0) * i / (n - 1), 1.0, 0.0) for i in range(n)]


def arc_path(R, a0, a1, n):
    """Stations round an arc of radius R (Blender angles, radians), the
    lateral direction pointing outwards."""
    out = []
    for i in range(n):
        a = a0 + (a1 - a0) * i / (n - 1)
        out.append((0.0, 0.0, math.cos(a), math.sin(a)))
    return out


def ribbon(pts, w, h, color, smooth=40):
    """A flat strip of water laid over the ground through [(x, y, z), ...]
    (Blender frame): rivers that run down slopes and out across plains."""
    path = []
    for i, p in enumerate(pts):
        a = Vector(pts[max(0, i - 1)])
        b = Vector(pts[min(len(pts) - 1, i + 1)])
        d = (b - a)
        d.z = 0
        d.normalize()
        path.append((p[0], p[1], d.y, -d.x))
    zs = [p[2] for p in pts]
    sec = [(-w / 2, 0.0), (-w / 2 * 0.8, h), (w / 2 * 0.8, h), (w / 2, 0.0)]
    n = len(pts)
    o = relief(path, sec, height=lambda t, k, u, z: z + zs[min(n - 1, int(round(t * (n - 1))))], base=color,
               smooth=smooth)
    return o


# ---------------------------------------------------------------- volcano

@model('wd_volcano', ao=0.55)
def wd_volcano(v):
    rnd = random.Random(700 + v * 5)
    tau = 2 * math.pi
    parts = [slab(1.04, 0.07, G.basalt, seg=22, wob=lobes(rnd, (3, 5), (0.05, 0.03)), rings=0),
             slab(0.9, 0.05, G.ash, seg=22, wob=lobes(rnd), rings=0, at=(0, 0, 0.04))]
    # the cone: concave flanks, a real rim, and a crater dished into the top
    prof = [(0.84, 0.06), (0.78, 0.16), (0.64, 0.42), (0.5, 0.72), (0.4, 1.0), (0.33, 1.22), (0.29, 1.36),
            (0.26, 1.43), (0.2, 1.43), (0.15, 1.33), (0.0, 1.31)]
    flows = [-((i / 5) * tau + v * 0.6) for i in range(5)]   # v1's tongues, Blender angles

    def flow(a):
        best = 0.0
        for f in flows:
            d = abs(math.remainder(a - f, tau))
            best = max(best, max(0.0, 1 - d / 0.2))
        return best
    lob = lobes(rnd, (3, 4), (0.04, 0.03))

    def warp(a, r, z, i):
        k = 0.06 * flow(a) if 1 <= i <= 6 else 0.0
        return r * lob(a) * (1 + k), z
    cone = revolve(prof, seg=28, color=G.rockDk, warp=warp, smooth=45, cap_bottom=False)
    lava, ember, basalt, crust = L(G.lava), L(G.ember), L(G.basalt), L(G.crust)

    def col(c, n):
        a = math.atan2(c.y, c.x)
        r = math.hypot(c.x, c.y)
        if r < 0.21 and c.z > 1.25:
            return crust
        for i, f in enumerate(flows):
            d = abs(math.remainder(a - f, tau))
            # each tongue runs from the rim and stops at its own length
            stop = 0.25 + 0.12 * ((i * 3 + v) % 4)
            if d < 0.13 * (1.2 - c.z * 0.25) and stop < c.z < 1.4:
                return lava if i % 2 else ember
        if c.z > 1.05:
            return basalt
        return None
    recolor(cone, col)
    parts.append(cone)
    parts.append(slab(0.15, 0.03, G.lava, seg=12, rings=0, at=(0, 0, 1.31)))
    # the plume, which is most of the silhouette: a column out of the crater
    # billowing into puffs that drift downwind
    parts.append(revolve([(0.11, 1.32), (0.13, 1.5), (0.17, 1.66), (0.0, 1.7)], seg=12, color=G.ash, smooth=60))
    for i in range(4):
        rr = 0.2 + i * 0.12
        x, y, z = (i - 1) * 0.11, 1.62 + i * 0.25, (i % 3 - 1) * 0.1
        c = G.ash if i % 2 else G.cloudGrey
        parts.append(blob(rr, gv(x, y, z), c, seg=12, rings=5, scale=(1, 0.86, 0.62)))
        if i:
            parts.append(blob(rr * 0.6, gv(x + rr * 0.7, y + 0.04, z - rr * 0.3), G.cloudGrey if i % 2 else G.ash,
                              seg=8, rings=4, scale=(1, 1, 0.7)))
    if v > 0:
        # a parasitic cone on the flank
        sx, sy = gv(0.6, 0, -0.38)[:2]
        side = revolve([(0.22, 0.04), (0.17, 0.2), (0.09, 0.4), (0.05, 0.44), (0.0, 0.42)], seg=14, color=G.ash,
                       smooth=45, cap_bottom=False)
        if v == 2:
            recolor(side, lambda c, n: L(G.ember) if c.z > 0.36 else None)
        deform(side, lambda p: p + Vector((sx, sy, 0)))
        parts.append(side)
    return fit(parts, 'wd_volcano', v)


# ---------------------------------------------------------------- crater lake

@model('wd_craterlake', ao=0.6)
def wd_craterlake(v):
    rnd = random.Random(800 + v * 3)
    tau = 2 * math.pi
    oa = -((3 + v) / 12) * tau            # the outlet, at v1's angle (Blender)
    ph = rnd.uniform(0, 6.28)
    prof = [(1.3, 0.0), (1.22, 0.12), (1.08, 0.42), (0.98, 0.68), (0.92, 0.84), (0.86, 0.87), (0.8, 0.78),
            (0.76, 0.56), (0.73, 0.3)]

    def notch(a):
        return max(0.0, 1 - abs(math.remainder(a - oa, tau)) / 0.3)

    def warp(a, r, z, i):
        if z > 0.4:
            z = z * (1 + 0.08 * math.sin(5 * a + ph) + 0.05 * math.sin(9 * a))
            z = z - (z - 0.42) * notch(a) * 0.95
        return r * (1 + 0.04 * math.sin(3 * a + ph)), z
    rim = revolve(prof, seg=32, color=G.rockDk, warp=warp, smooth=45, cap_bottom=False, cap_top=False)
    rockc, forest, inner = L(G.rock), L(G.forest), dk(G.rockDk, 0.12)

    def col(c, n):
        a = math.atan2(c.y, c.x)
        r = math.hypot(c.x, c.y)
        if r < 0.84:
            return inner
        if c.z > 0.62:
            return rockc
        if r > 1.0 and math.sin(4 * a + ph * 2) > -0.1:
            return forest
        return None
    recolor(rim, col)
    parts = [rim]
    water = slab(0.84, 0.4, G.lake, seg=24, rings=2, rim=0.05)
    deep, lake = L(G.abyss), L(G.lake)
    regrade(water, lambda p: mixc(deep, lake, clamp01((math.hypot(p.x, p.y) - 0.15) / 0.5)) if p.z > 0.39 else lake)
    parts.append(water)
    # the cinder cone standing out of the middle of it
    cx, cy = gv(0.1, 0, -0.12)[:2]
    cone = revolve([(0.26, 0.3), (0.2, 0.5), (0.12, 0.7), (0.08, 0.73), (0.05, 0.69), (0.0, 0.68)], seg=16,
                   color=G.ash, smooth=45, cap_bottom=False)
    recolor(cone, lambda c, n: L(G.crust) if c.z > 0.66 else None)
    deform(cone, lambda p: p + Vector((cx, cy, 0)))
    parts.append(cone)
    # hot springs at the waterline
    for i in range(3):
        a = oa + 2.0 + i * 1.3 + rnd.uniform(-0.3, 0.3)
        parts.append(slab(0.08, 0.02, G.lagoon, seg=10, rings=0, at=(math.cos(a) * 0.68, math.sin(a) * 0.68, 0.39)))
    # the outflow cut through the rim, running down the flank and away
    pts = []
    for i in range(7):
        r = 0.78 + i * 0.16
        z = max(0.0, (0.42 if r < 0.95 else 0.42 - (r - 0.95) * 1.05)) + 0.0
        pts.append((math.cos(oa) * r, math.sin(oa) * r, max(z, 0.0)))
    parts.append(ribbon(pts, 0.17, 0.035, G.river))
    return fit(parts, 'wd_craterlake', v)


# ---------------------------------------------------------------- canyon

# A canyon as one swept section: mesa tops, a stepped wall of banded strata
# down to a ledge, the dark inner gorge and the river at the bottom, all
# meandering (v1's wobble) while the outer edges stay straight.
@model('wd_canyon', ao=0.6)
def wd_canyon(v):
    half = [(-1.4, 0.0), (-1.4, 0.94), (-1.36, 1.0), (-0.66, 1.0), (-0.6, 0.95), (-0.58, 0.84), (-0.56, 0.72),
            (-0.5, 0.68), (-0.4, 0.68), (-0.36, 0.62), (-0.34, 0.5), (-0.33, 0.4), (-0.28, 0.37), (-0.22, 0.36),
            (-0.2, 0.3), (-0.18, 0.1), (-0.15, 0.05)]
    sec = half + [(0.0, 0.05)] + [(-u, z) for (u, z) in reversed(half)]
    K = len(sec)
    mid = len(half)

    def wob(t):
        return math.sin(t * 6 * 1.05 + v * 1.3) * 0.42

    def lateral(t, k, u, z):
        w = 1.0 if abs(u) < 1.3 else 0.0
        return u + wob(t) * w

    def height(t, k, u, z):
        if z > 0.9:
            side = 1 if u > 0 else -1
            return z * (0.9 + 0.12 * math.sin(t * 9 + side * 1.7 + v))
        return z
    sand, deep, steppe, rockd = L(G.sand), L(G.sandDeep), L(G.steppe), L(G.rockDk)
    band = mixc(deep, L(G.rock), 0.35)

    def color(t, k, zc, end):
        kk = k if k < mid else K - 2 - k       # the same band on both walls
        if end:
            if zc > 0.7:
                return band if int(zc * 12) % 2 else deep
            return rockd if zc > 0.08 else L(G.silt)
        if kk <= 1:
            return deep
        if kk == 2:
            return steppe if int(t * 7) % 2 else sand     # the mesa tops
        if kk in (3, 4):
            return band
        if kk == 5:
            return deep
        if kk in (6, 7, 8):
            return sand                                 # the ledge
        if kk in (9, 10, 11):
            return rockd
        if kk in (12, 13):
            return mixc(sand, deep, 0.5)
        if kk in (14, 15):
            return rockd
        return L(G.river) if kk >= 16 else L(G.silt)
    path = straight_path(1.5, -1.5, 17)
    body = relief(path, sec, height=height, lateral=lateral, color=color, smooth=40)
    parts = [body]
    # a silt bar or two in the river, and a lone butte on each rim
    for i, t in enumerate((0.3, 0.72)):
        y = 1.5 - 3.0 * t
        parts.append(slab(0.07, 0.07, G.silt, seg=10, rings=0, at=(wob(t) + (0.06 if i else -0.06), y, 0.0)))
    for s, t in ((-1, 0.2), (1, 0.62)):
        y = 1.5 - 3.0 * t
        bt = revolve([(0.17, 0.9), (0.17, 1.08), (0.13, 1.12), (0.12, 1.24), (0.09, 1.27), (0.0, 1.27)], seg=12,
                     color=G.sandDeep, smooth=40, cap_bottom=False)
        recolor(bt, lambda c, n: L(G.steppe) if n.z > 0.7 else (band if c.z > 1.12 else None))
        deform(bt, lambda p, s=s, y=y: p + Vector((s * 1.02, y, 0)))
        parts.append(bt)
    return fit(parts, 'wd_canyon', v)


# ---------------------------------------------------------------- glacier

# A valley glacier bent into an S: rock walls with snow on the upper reaches,
# the ice thinning downhill with crevasses across it and a dark moraine
# stripe down it, and the snout calving into a meltwater lake at game +z.
@model('wd_glacier', ao=0.55)
def wd_glacier(v):
    rnd = random.Random(900 + v * 7)
    Lh = 1.2                      # half the length, game z
    half = [(-0.84, 0.0), (-0.84, 0.74), (-0.8, 0.82), (-0.5, 0.84), (-0.44, 0.8), (-0.38, 0.62), (-0.33, 0.5),
            (-0.28, 0.44)]
    ice = [(-0.2, 0.47), (-0.1, 0.49), (-0.06, 0.495), (0.0, 0.5), (0.1, 0.49), (0.2, 0.47)]
    sec = half + ice + [(-u, z) for (u, z) in reversed(half)]
    K = len(sec)
    nh = len(half)

    def bend(f):
        return math.sin(f * 3.4 + v) * 0.46

    # f = 0 at the head (game -z, Blender +y), 1 at the snout (game +z)
    def wall(f):
        return 0.92 - 0.34 * f

    def ice_h(f):
        return 0.62 - 0.38 * f

    jit = [rnd.uniform(0.92, 1.1) for _ in range(40)]

    def height(t, k, u, z):
        f = t
        if nh <= k < nh + len(ice):
            return z / 0.5 * ice_h(f)
        if k in (nh - 1, K - nh):
            return ice_h(f) - 0.04                    # where the ice meets the rock
        side = 0 if u < 0 else 1
        return z * wall(f) * jit[int(t * 18) + side * 20]
    snow, rockd, tundra = L(G.snow), L(G.rockDk), L(G.tundra)
    icec, blue, deepc = L(G.ice), L(G.iceBlue), L(G.iceDeep)

    def color(t, k, zc, end):
        if end:
            if t > 0.5 and nh - 1 <= k < K - nh:
                return blue                          # the calving face of the snout
            return rockd
        if nh - 1 <= k < K - nh:
            j = k - (nh - 1)
            if j in (0, len(ice)):
                return blue
            if j == 3:
                return rockd                         # the medial moraine
            if int(t * 18) % 3 == 1:
                return deepc                         # crevasses
            return icec
        kk = k if k < nh else K - 2 - k
        if kk in (1, 2, 3) and t < 0.62:
            return snow
        if kk == 2:
            return tundra
        return rockd
    path = straight_path(Lh, -Lh, 19, cx=bend)
    parts = [relief(path, sec, height=height, color=color, smooth=40)]
    # the lake the snout drops its bergs into
    eb = bend(1.0)
    parts.append(slab(0.5, 0.06, G.lake, seg=18, rings=1, at=(eb, -Lh - 0.36, 0.0)))
    for i in range(3):
        x = eb + rnd.uniform(-0.3, 0.3)
        y = -Lh - 0.3 + rnd.uniform(-0.16, 0.16) - i * 0.06
        parts.append(blk(0.11, 0.12, 0.1, x, 0.03, -y, G.ice, ry=rnd.uniform(0, 3)))
    return fit(parts, 'wd_glacier', v)


# ================================================================= A REGION'S WORTH

def crown(r, at, col, seg=8, rings=4, squash=0.85):
    """One toy tree crown, light on top and dark underneath."""
    o = blob(r, at, col, seg=seg, rings=rings, scale=(1, 1, squash))
    base = L(col)
    top, under = tuple(min(1.0, c * 1.4) for c in base), dk(base, 0.3)
    z0 = at[2] - r * squash
    regrade(o, lambda p: mixc(under, top, clamp01((p.z - z0) / (2 * r * squash))))
    return o


def fir(r, h, at, col, seg=8):
    """A pointed conifer: a cone with a drooping hem."""
    o = revolve([(r, 0.0), (r * 0.9, h * 0.08), (r * 0.35, h * 0.62), (0.0, h)], seg=seg, color=col, smooth=40,
                cap_bottom=True)
    base = L(col)
    regrade(o, lambda p: mixc(dk(base, 0.3), lt(base, 0.12), clamp01(p.z / h)))
    deform(o, lambda p: p + Vector(at))
    return o


def puff_cluster(rnd, at, R, n, col, under, seg=10, squash=0.7, spread=1.0):
    """A cumulus: one big puff and n smaller ones round and above it, flat-ish
    underneath, white on top and greyer below."""
    x0, y0, z0 = at
    parts = [blob(R, (x0, y0, z0), col, seg=seg, rings=seg // 2, scale=(1, 1, squash))]
    a0 = rnd.uniform(0, 6.28)
    for i in range(n):
        a = a0 + i * 2 * math.pi / n + rnd.uniform(-0.3, 0.3)
        r = R * rnd.uniform(0.55, 0.75)
        d = R * rnd.uniform(0.65, 0.85) * spread
        parts.append(blob(r, (x0 + math.cos(a) * d, y0 + math.sin(a) * d, z0 + R * rnd.uniform(-0.15, 0.25) * squash),
                          col, seg=max(8, seg - 2), rings=max(4, seg // 2 - 1), scale=(1, 1, squash)))
    lo, hi = z0 - R * squash, z0 + R * squash * 1.2
    top, und = L(col), L(under)
    for o in parts:
        regrade(o, lambda p: mixc(und, top, clamp01((p.z - lo) / (hi - lo))))
    return parts


# A forest: a floor patch carpeted with round crowns and dark firs, a clearing
# and a stream through it; on two of the three a cloud hangs over it.
@model('wd_forest', ao=0.55)
def wd_forest(v):
    rnd = random.Random(1000 + v * 9)
    tau = 2 * math.pi
    R = 1.1
    wob = lobes(rnd, (3, 5), (0.05, 0.03))
    parts = [slab(R, 0.11, G.forestDk, seg=24, wob=wob, rings=0, top=G.forest)]
    floor = 0.11
    # the stream, laid across the whole patch at v1's angle
    sa = 0.5 + v
    d = (math.cos(sa), math.sin(sa))
    pts = [(d[0] * t + math.sin(t * 3) * 0.06 * -d[1], d[1] * t + math.sin(t * 3) * 0.06 * d[0], floor - 0.02)
           for t in [(-1.0 + 2.0 * i / 8) * R * 0.98 for i in range(9)]]
    parts.append(ribbon(pts, 0.12, 0.03, G.river))
    cx, cy = gv(-0.38 * R, 0, 0.28 * R)[:2]
    parts.append(slab(0.22, 0.02, G.land, seg=12, rings=0, at=(cx, cy, floor - 0.005)))

    def clear(x, y, r):
        if math.hypot(x - cx, y - cy) < 0.24 + r * 0.6:
            return False
        if abs(-d[1] * x + d[0] * y) < 0.07 + r * 0.8:
            return False
        return math.hypot(x, y) < R * 0.9 * wob(math.atan2(y, x)) - r * 0.6
    placed = []
    tries = 0
    while len(placed) < 24 and tries < 900:
        tries += 1
        a, dd = rnd.uniform(0, tau), R * 0.92 * math.sqrt(rnd.random())
        x, y = math.cos(a) * dd, math.sin(a) * dd
        r = 0.13 + rnd.random() * 0.1
        if not clear(x, y, r):
            continue
        if any(math.hypot(x - px, y - py) < (r + pr) * 0.75 for px, py, pr in placed):
            continue
        placed.append((x, y, r))
    for i, (x, y, r) in enumerate(placed):
        if i % 4 == 3:
            parts.append(fir(r * 0.8, r * 3.0, (x, y, floor - 0.01), G.forestDk))
        else:
            col = G.forest if i % 3 else G.forestDk
            parts.append(crown(r, (x, y, floor + r * 0.85), col, seg=8, rings=4))
    if v > 0:
        parts += puff_cluster(rnd, (gv(0.2 * R, 0, -0.2 * R)[0], gv(0.2 * R, 0, -0.2 * R)[1], 0.72), 0.24, 3,
                              G.cloud, G.cloudGrey, seg=10, squash=0.55)
    return fit(parts, 'wd_forest', v)


# A thunderhead: rain shafts at the base, the tower in the middle, the anvil
# spreading at the top, which is also the order in which it is read. The
# bolts on two of the three are v1's lamp colour.
@model('wd_thunderhead', ao=0.35)
def wd_thunderhead(v):
    rnd = random.Random(1100 + v * 13)
    tau = 2 * math.pi
    parts = []
    # rain: a streaked curtain falling out of the cloud base, ragged at the
    # hem, leaning a little downwind, and a thinner shower beside it
    rain, storm_c = L(G.rain), L(G.storm)
    for (x, y, r, h, sg) in ((0.06, 0.0, 0.44, 1.0, 22), (rnd.uniform(-0.5, -0.35), rnd.uniform(-0.3, 0.3), 0.16, 1.0, 10)):
        ph = rnd.uniform(0, 6.28)
        sh = revolve([(r * 0.86, 0.0), (r * 0.94, h * 0.5), (r, h)], seg=sg, color=G.rain, smooth=50,
                     warp=lambda a, rr, z, i, ph=ph: (rr, 0.07 * (1 + math.sin(5 * a + ph)) if i == 0 else z),
                     cap_bottom=True, cap_top=False)
        recolor(sh, lambda c, n, x=x, y=y: storm_c if int((math.atan2(c.y - y, c.x - x) + 4) / tau * 22) % 2 else None)
        deform(sh, lambda p, x=x, y=y: p + Vector((x + (1 - p.z) * 0.08, y, 0)))
        parts.append(sh)
    # the tower: stacked puffs from a dark flat base up into bright white
    base_z = 0.95
    lo, hi = base_z, 2.3
    storm, cloud = L(G.storm), L(G.cloud)
    tower = []
    tower.append(blob(0.62, (0, 0, base_z + 0.2), G.storm, seg=14, rings=7, scale=(1, 1, 0.45), flat=base_z))
    for i in range(6):
        f = i / 5
        r = 0.5 - f * 0.12 + rnd.uniform(-0.04, 0.04)
        a = rnd.uniform(0, tau)
        off = 0.14 * (1 - f)
        tower.append(blob(r, (math.cos(a) * off, math.sin(a) * off, base_z + 0.3 + f * 0.95), G.cloud, seg=10, rings=5,
                          scale=(1, 1, 0.8)))
    for i in range(5):
        a = i * tau / 5 + rnd.uniform(-0.3, 0.3)
        z = base_z + 0.35 + rnd.uniform(0, 0.6)
        tower.append(blob(0.26, (math.cos(a) * 0.42, math.sin(a) * 0.42, z), G.cloud, seg=10, rings=5,
                          scale=(1, 1, 0.85)))
    for o in tower:
        regrade(o, lambda p: mixc(storm, cloud, clamp01((p.z - lo) / 0.75)))
    parts += tower
    # the anvil: a wide flat-topped shelf with a rolled edge, lobed outline
    lob = lobes(rnd, (3, 5), (0.08, 0.05))
    prof = [(0.4, 2.12), (0.8, 2.2), (0.98, 2.27), (1.02, 2.33), (0.98, 2.4), (0.8, 2.45), (0.4, 2.48), (0.0, 2.5)]
    anvil = revolve(prof, seg=24, color=G.cloud, warp=lambda a, r, z, i: (r * lob(a), z), smooth=60, cap_bottom=True)
    recolor(anvil, lambda c, n: L(G.cloudGrey) if n.z < -0.3 else (L(G.snow) if n.z > 0.8 else None))
    parts.append(anvil)
    # billows round the anvil's rim, so it is a cloud and not a plate
    a0 = rnd.uniform(0, tau)
    for i in range(8):
        a = a0 + i * tau / 8 + rnd.uniform(-0.2, 0.2)
        r = 0.86 * lob(a)
        rr = rnd.uniform(0.2, 0.26)
        b = blob(rr, (math.cos(a) * r, math.sin(a) * r, 2.33), G.cloud, seg=8, rings=4, scale=(1.2, 1.2, 0.6),
                 rot=(0, 0, math.degrees(a)))
        regrade(b, lambda p: mixc(L(G.cloudGrey), cloud, clamp01((p.z - 2.2) / 0.2)))
        parts.append(b)
    if v > 0:
        for i in range(2 + (v > 1)):
            a = rnd.uniform(0, tau)
            x, y = math.cos(a) * 0.3, math.sin(a) * 0.3
            pts = [(x, y, base_z)]
            z = base_z
            k = 1
            while z > 0.12:
                z -= 0.16
                k = -k
                pts.append((x + k * 0.07, y + k * 0.03, max(0.05, z)))
            parts.append(tube(pts, 0.026, color=G.lamp, seg=6))
    return fit(parts, 'wd_thunderhead', v)


def basin_rim(prof, gaps, ph, seg=32, hills=0.12, low=0.4, width=0.3):
    """A ring of shore lathed from `prof`, rolling in height round the ring,
    and dropping to `low` across each gap (Blender angles): a lake's outlets,
    a crater's breach."""
    tau = 2 * math.pi

    def notch(a):
        return max([0.0] + [max(0.0, 1 - abs(math.remainder(a - g, tau)) / width) for g in gaps])

    def warp(a, r, z, i):
        if z > low:
            z = z * (1 + hills * math.sin(3 * a + ph) + hills * 0.6 * math.sin(7 * a + ph * 2))
            z = z - (z - low) * min(1.0, notch(a) * 1.6)
        return r * (1 + 0.05 * math.sin(2 * a + ph) + 0.03 * math.sin(5 * a)), z
    return revolve(prof, seg=seg, color=G.land, warp=warp, smooth=45, cap_bottom=False, cap_top=False)


# A lake: a ring of shore carrying all the height, the water sunk inside it,
# two gaps where the river comes in and goes out, islets, and a marsh at the
# shallow end.
@model('wd_lake', ao=0.55)
def wd_lake(v):
    rnd = random.Random(1200 + v * 5)
    tau = 2 * math.pi
    ph = v * 1.4
    gaps = [-((5 - v) / 14) * tau, -((12 - v) / 14) * tau]      # v1's gapAt
    prof = [(1.3, 0.0), (1.24, 0.2), (1.12, 0.52), (1.0, 0.74), (0.9, 0.76), (0.82, 0.6), (0.78, 0.36)]
    rim = basin_rim(prof, gaps, ph, hills=0.14, low=0.42)
    forest, land, rockd, sand = L(G.forest), L(G.land), L(G.rockDk), L(G.sand)

    def col(c, n):
        r = math.hypot(c.x, c.y)
        if r < 0.86:
            return sand if c.z < 0.5 else rockd
        if c.z > 0.62:
            return forest
        return None
    recolor(rim, col)
    parts = [rim]
    water = slab(0.86, 0.42, G.lake, seg=24, rings=2, rim=0.05)
    deep, lake = L(G.oceanDeep), L(G.lake)
    regrade(water, lambda p: mixc(deep, lake, clamp01((math.hypot(p.x, p.y) - 0.1) / 0.6)) if p.z > 0.41 else lake)
    parts.append(water)
    # woods along the crest of the shore
    for i in range(9):
        a = rnd.uniform(0, tau)
        if min(abs(math.remainder(a - g, tau)) for g in gaps) < 0.45:
            continue
        r = 0.98 * (1 + 0.05 * math.sin(2 * a + ph) + 0.03 * math.sin(5 * a))
        z = 0.75 * (1 + 0.14 * math.sin(3 * a + ph) + 0.084 * math.sin(7 * a + ph * 2))
        parts.append(crown(0.11, (math.cos(a) * r, math.sin(a) * r, z + 0.05), G.forestDk if i % 2 else G.forest,
                           seg=8, rings=4))
    # rocky islets with a tree on each
    for i in range(3):
        a, d = rnd.uniform(0, tau), 0.5 * math.sqrt(rnd.random()) + 0.08
        x, y = math.cos(a) * d, math.sin(a) * d
        rr = 0.07 + rnd.random() * 0.05
        parts.append(rock(rr, (x, y, 0.42), G.rockDk, sub=1, seed=v * 10 + i, scale=(1.2, 1.0, 0.7)))
        parts.append(crown(rr * 0.7, (x, y, 0.42 + rr * 0.9), G.forest, seg=8, rings=4))
    # the river in and the river out, through the two gaps
    for g in gaps:
        pts = []
        for i in range(6):
            r = 0.8 + i * 0.17
            z = 0.42 if r < 1.0 else max(0.0, 0.42 - (r - 1.0) * 1.3)
            pts.append((math.cos(g) * r, math.sin(g) * r, z))
        parts.append(ribbon(pts, 0.16, 0.035, G.river))
    # the marsh at the shallow end
    mx, my = gv(-0.36 * 1.15, 0, 0.34 * 1.15)[:2]
    m = 0.82 / max(0.82, math.hypot(mx, my) + 0.15)
    parts.append(blob(0.24, (mx * m, my * m, 0.42), G.marsh, seg=12, rings=4, scale=(1.3, 0.9, 0.12), flat=0.4))
    return fit(parts, 'wd_lake', v)


# A river delta: the trunk river coming out of the hills (game +z), the fan of
# lobes it builds towards the sea (game -z), distributaries across it, reeds,
# and the bar the sea throws up in front of it.
@model('wd_delta', ao=0.55)
def wd_delta(v):
    rnd = random.Random(1300 + v * 3)
    R = 1.3
    parts = []
    silt, marsh = L(G.silt), L(G.marsh)
    apex = gv(0, 0, 0.3 * R)[:2]
    lob = []
    for i in range(5):
        a = -0.9 + (i / 4) * 1.8
        x, y = gv(math.sin(a) * R * 0.5, 0, -math.cos(a) * R * 0.42)[:2]
        r = R * (0.34 + rnd.random() * 0.1)
        h = 0.2 + rnd.random() * 0.05
        lob.append((x, y, r, h))
        parts.append(slab(r, h, G.silt if i % 2 else G.marsh, seg=14, wob=lobes(rnd, (2, 3), (0.06, 0.04)), rings=0,
                          rim=0.3, at=(x, y, 0), top=mixc(silt if i % 2 else marsh, L(G.land), 0.25)))
    plain = slab(R * 0.5, 0.28, G.marsh, seg=18, wob=lobes(rnd), rings=0, rim=0.3, at=gv(0, 0, 0.36 * R),
                 top=L(G.land))
    parts.append(plain)
    # the hills the trunk river comes out of
    for i in range(3):
        x, y = gv((i - 1) * R * 0.44, 0, R * 0.9)[:2]
        h = 0.62 + rnd.random() * 0.2
        land = L(G.land)
        hill = ridged_peak(0.36, h, (x, y, 0.0), 12, rnd, n_ridge=3, ridge=0.16, snow=1.5, foot=0.3, crag=0.62,
                           rockc=land, cragc=dk(land, 0.18), footc=dk(land, 0.08))
        regrade(hill, lambda p, h=h: mixc(dk(land, 0.22), lt(land, 0.12), clamp01(p.z / h)))
        parts.append(hill)
        a = rnd.uniform(0, 6.28)
        parts.append(crown(0.07, (x + math.cos(a) * 0.2, y + math.sin(a) * 0.2, h * 0.3 + 0.05), G.forest,
                           seg=8, rings=4))
    # the trunk, and the distributaries fanning out over the lobes
    trunk = [gv(0, 0.02, R * 1.15), gv(0.04, 0.24, R * 0.75), gv(0.0, 0.29, R * 0.42), (apex[0], apex[1], 0.29)]
    parts.append(ribbon(trunk, 0.2, 0.04, G.river))
    for i in range(6):
        a = -1.0 + (i / 5) * 2.0 + (rnd.random() - 0.5) * 0.16
        tip = gv(math.sin(a) * R * 0.9, 0, R * 0.26 - math.cos(a) * R * 0.98)[:2]
        pts = []
        dx, dy = tip[0] - apex[0], tip[1] - apex[1]
        ln = math.hypot(dx, dy)
        for k in range(7):
            t = k / 6
            w = math.sin(t * math.pi * 1.5 + i * 1.3) * 0.07 * math.sin(t * math.pi)
            x = apex[0] + dx * t - dy / ln * w
            y = apex[1] + dy * t + dx / ln * w
            pts.append((x, y, (0.29 if t < 0.3 else 0.25) - 0.01 * t))
        parts.append(ribbon(pts, 0.08 - 0.02 * abs(i - 2.5) / 2.5, 0.03, G.river))
    # reeds on the lobes
    for i in range(7):
        x, y, r, h = lob[i % 5]
        a = rnd.uniform(0, 6.28)
        d = r * rnd.uniform(0.2, 0.6)
        parts.append(crown(0.07, (x + math.cos(a) * d, y + math.sin(a) * d, h + 0.04), G.jungle, seg=8, rings=4,
                           squash=0.7))
    # the bar in front, and the surf on two of the three
    bx, by = gv(0, 0, -R * 0.62)[:2]
    parts.append(blob(R * 0.82, (bx, by, 0.02), G.lagoon, seg=16, rings=4, scale=(1, 0.16, 0.06), flat=0.0))
    if v > 0:
        sx, sy = gv(0, 0, -R * 0.76)[:2]
        parts.append(blob(R * 0.6, (sx, sy, 0.02), G.surf, seg=14, rings=4, scale=(1, 0.11, 0.06), flat=0.0))
    return fit(parts, 'wd_delta', v)


# A fjord coast: granite fingers running out from the highland (game +z) to
# the sea (game -z), each ending in a cliff at its own length, with the
# drowned valleys between them; forest and tundra along the crests, snow on
# the high ones, waterfalls off the walls and skerries out in front.
@model('wd_fjord', ao=0.6)
def wd_fjord(v):
    rnd = random.Random(1400 + v * 11)
    parts = []
    # the sea: pale over the shelf, deep down the middle of each fjord
    sea = prism(rrect(2.7, 2.5, 0.4, 3), 0.05, color=G.shelf, bevel=0.02, seg=1)
    parts.append(sea)
    # deep water down the fjords
    for i in range(4):
        x = (i + 0.5) / 4 * 1.96 - 0.98
        parts.append(blob(0.13, gv(x, 0.05, 0.0), G.oceanDeep, seg=10, rings=3, scale=(1, 9, 0.12), flat=0.04))
    granite, gdk = L(G.granite), dk(G.granite, 0.2)
    forest, tundra, snow = L(G.forestDk), L(G.tundra), L(G.snow)
    N = 5
    for i in range(N):
        cx = (i / (N - 1) - 0.5) * 1.96
        mid = 1 - abs(cx) / 1.2
        top = (0.55 + mid * 0.5) * rnd.uniform(0.9, 1.1)
        end = -rnd.uniform(0.55, 1.0)                 # game z of the sea cliff
        y0, y1 = gv(0, 0, 1.2)[1], gv(0, 0, end)[1]
        ph = rnd.uniform(0, 6.28)
        path = straight_path(y0, y1, 11, cx=lambda t, cx=cx, ph=ph: cx + math.sin(t * 4 + ph) * 0.05)
        sec = [(-1.0, 0.0), (-0.92, 0.55), (-0.72, 0.9), (-0.3, 1.0), (0.3, 1.0), (0.72, 0.9), (0.92, 0.55), (1.0, 0.0)]

        def lateral(t, k, u, z):
            return u * (0.26 - 0.1 * t)

        def height(t, k, u, z, top=top, ph=ph):
            h = top * (1 - 0.5 * t * t) * (1 + 0.1 * math.sin(t * 7 + ph))
            return z * h

        def color(t, k, zc, end, top=top):
            if end:
                return gdk if zc < 0.25 else granite
            if k in (2, 3, 4):
                if zc > 0.86:
                    return snow
                return forest if (t > 0.4 or k != 3) else tundra
            if k in (0, 6):
                return gdk
            return granite
        parts.append(relief(path, sec, height=height, lateral=lateral, color=color, smooth=45))
        # a waterfall off one wall of every other finger
        if i % 2 == 0:
            t = rnd.uniform(0.3, 0.6)
            y = y0 + (y1 - y0) * t
            s = 1 if i < 2 else -1
            h = top * (1 - 0.35 * t) * 0.8
            x = cx + s * (0.26 - 0.1 * t) * 0.85
            parts.append(box((0.035, 0.06, h), at=(x + s * 0.01, y, 0.04), color=G.foam, bevel=0.008, seg=1,
                             rot=(0, -s * 14, 0)))
    # skerries out in front
    for i in range(5):
        x, y = gv(rnd.uniform(-1.0, 1.0), 0, -rnd.uniform(0.95, 1.15))[:2]
        parts.append(rock(rnd.uniform(0.05, 0.09), (x, y, 0.03), G.granite, sub=1, seed=v * 20 + i,
                          scale=(1.2, 1, 0.7)))
    return fit(parts, 'wd_fjord', v)


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


# An island: a lobed landmass with cliffs, a beach, a pale shelf at the
# waterline, woods on the deck, a peak in the middle (snow-capped on the
# taller variants) and a reef off the sheltered side (game -z).
@model('wd_island', ao=0.55)
def wd_island(v):
    rnd = random.Random(1500 + v * 7)
    tau = 2 * math.pi
    lob = lobes(rnd, (2, 3, 5), (0.12, 0.09, 0.04))
    deck = L(G.forest if v % 2 else G.land)
    prof = [(1.34, 0.0), (1.3, 0.06), (1.18, 0.08), (1.1, 0.14), (1.02, 0.2), (0.98, 0.56), (0.94, 0.66),
            (0.86, 0.7), (0.5, 0.78), (0.0, 0.84)]
    isl = revolve(prof, seg=32, color=G.rockDk, warp=lambda a, r, z, i: (r * lob(a), z), smooth=40,
                  cap_bottom=False)
    shelf, sand, rockd = L(G.shelf), L(G.sand), L(G.rockDk)
    ba = -0.68                                    # v1's beach: game (0.48, 0.38) -> Blender angle

    def col(c, n):
        z = c.z
        if z < 0.075:
            return shelf
        if z < 0.2:
            a = math.atan2(c.y, c.x)
            return sand if abs(math.remainder(a - ba, tau)) < 0.9 else lt(G.shelf, 0.35)
        if z > 0.62:
            return deck if n.z > 0.5 else None
        return None
    recolor(isl, col)
    parts = [isl]
    # the peak
    parts.append(ridged_peak(0.46, 1.0, (0.04, -0.04, 0.72), 18, rnd, n_ridge=4, ridge=0.22,
                             snow=(0.8 if v > 1 else 1.5), foot=0.12, footc=deck, crag=0.5))
    # woods
    n = 0
    tries = 0
    while n < 11 and tries < 200:
        tries += 1
        a, d = rnd.uniform(0, tau), rnd.uniform(0.5, 0.86)
        r = d * lob(a)
        x, y = math.cos(a) * r, math.sin(a) * r
        z = 0.84 - (r / (1.0 * lob(a))) * 0.14
        rr = rnd.uniform(0.09, 0.14)
        parts.append(crown(rr, (x, y, z + rr * 0.6), G.jungle if n % 2 else G.forestDk, seg=8, rings=4))
        n += 1
    # the reef on the sheltered side
    for i in range(5):
        a = -0.8 + (i / 4) * 1.6
        x, y = gv(math.sin(a) * 1.5, 0, -math.cos(a) * 1.5)[:2]
        parts.append(blob(0.15, (x, y, 0.0), G.coral if i % 2 else G.lagoon, seg=10, rings=4,
                          scale=(1.1, 0.7, 0.4), rot=(0, 0, math.degrees(-a)), flat=0.0))
    return fit(parts, 'wd_island', v)


# A salt flat: a dead-white pan crazed into polygons, a ring of bare hills
# round it with one gap, pressure ridges, and a shallow pool or two.
@model('wd_saltflat', ao=0.55)
def wd_saltflat(v):
    rnd = random.Random(1600 + v * 5)
    tau = 2 * math.pi
    gaps = [-(4 / 12) * tau, -(10 / 12) * tau]          # v1 skips hills i % 6 == 4
    prof = [(1.42, 0.0), (1.36, 0.22), (1.26, 0.52), (1.16, 0.68), (1.06, 0.6), (0.96, 0.36), (0.9, 0.18)]
    ph = rnd.uniform(0, 6.28)

    def notch(a):
        return max([0.0] + [max(0.0, 1 - abs(math.remainder(a - g, tau)) / 0.32) for g in gaps])

    def warp(a, r, z, i):
        if 0 < i < 6:
            bump = 0.5 + 0.5 * math.cos(10 * a + ph)
            z = z * (0.55 + 0.6 * bump ** 1.5) * (1 + 0.15 * math.sin(3 * a))
            z = z * (1 - 0.7 * notch(a))
        return r * (1 + 0.04 * math.sin(2 * a + ph)), z
    rim = revolve(prof, seg=56, color=G.rockDk, warp=warp, smooth=45, cap_bottom=False, cap_top=False)
    rockd, sandd = L(G.rockDk), L(G.sandDeep)
    recolor(rim, lambda c, n: sandd if c.z < 0.3 else (None if c.z < 0.62 else lt(G.rockDk, 0.18)))
    parts = [rim]
    pan = slab(1.0, 0.2, G.saltDk, seg=28, rings=2, rim=0.15, top=G.salt)
    parts.append(pan)
    top = 0.2
    # the crust crazed into polygons: a hex net of low dark lines
    s = 0.4
    seen = set()
    for i in range(-4, 5):
        for j in range(-4, 5):
            cx = s * 1.5 * i
            cy = s * math.sqrt(3) * (j + (0.5 if i % 2 else 0))
            for k in range(3):
                a0 = math.radians(60 * k + v * 7)
                a1 = a0 + math.radians(60)
                p0 = (cx + s * math.cos(a0), cy + s * math.sin(a0))
                p1 = (cx + s * math.cos(a1), cy + s * math.sin(a1))
                key = tuple(sorted([(round(p0[0], 3), round(p0[1], 3)), (round(p1[0], 3), round(p1[1], 3))]))
                if key in seen:
                    continue
                seen.add(key)
                mx, my = (p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2
                if math.hypot(mx, my) > 0.84:
                    continue
                ln = math.hypot(p1[0] - p0[0], p1[1] - p0[1])
                ang = math.atan2(p1[1] - p0[1], p1[0] - p0[0])
                parts.append(box((ln * 0.96, 0.034, 0.014), at=(mx, my, top - 0.004), color=dk(G.saltDk, 0.12), bevel=0,
                                 rot=(0, 0, math.degrees(ang))))
    # pressure ridges thrown up across the crust
    px, py = gv(-0.22, 0, 0.2)[:2]
    px -= 0.06
    qx, qy = gv(0.3, 0, -0.3)[:2]
    n = 0
    while n < 4:
        a, d = rnd.uniform(0, tau), 0.66 * math.sqrt(rnd.random())
        x, y = math.cos(a) * d, math.sin(a) * d
        if math.hypot(x - px, y - py) < 0.55 or math.hypot(x - qx, y - qy) < 0.35:
            continue
        n += 1
        ln = rnd.uniform(0.22, 0.36)
        parts.append(side_prism([(-0.07, 0.0), (0.07, 0.0), (0.0, 0.045)], ln, G.salt, bev=0.01))
        o = parts[-1]
        r = rnd.uniform(0, 180)
        deform(o, lambda p, r=r, x=x, y=y: Vector((p.x * math.cos(math.radians(r)) - p.y * math.sin(math.radians(r)) + x,
                                                    p.x * math.sin(math.radians(r)) + p.y * math.cos(math.radians(r)) + y,
                                                    p.z + top - 0.01)))
    # the pool, and on two of the three a second one
    parts.append(blob(0.3, (px, py, top), G.lagoon, seg=14, rings=4, scale=(1.3, 0.95, 0.06),
                      flat=top - 0.005))
    if v > 0:
        parts.append(blob(0.16, (qx, qy, top), G.shelf, seg=12, rings=4, scale=(1.3, 0.9, 0.06), flat=top - 0.005))
    return fit(parts, 'wd_saltflat', v)


# An escarpment: a plateau, the stepped cliff that ends it, the scree at its
# foot, the river running along the scarp and the plain below — swept round
# v1's arc, plateau on the outside of the curve and plain in the hollow.
@model('wd_escarpment', ao=0.6)
def wd_escarpment(v):
    rnd = random.Random(1700 + v * 3)
    c = -v * 0.2                     # v1's arc centre (game angle v*0.2)
    sweep = 2.6
    path = arc_path(1.0, c - sweep / 2, c + sweep / 2, 23)
    sec = [(0.28, 0.0), (0.3, 0.12), (0.36, 0.15), (0.6, 0.16), (0.64, 0.15), (0.78, 0.15), (0.82, 0.17),
           (0.9, 0.3), (0.98, 0.5), (1.02, 0.55), (1.04, 0.62), (1.06, 0.76), (1.1, 0.8), (1.16, 0.81),
           (1.18, 0.86), (1.2, 1.0), (1.24, 1.06), (1.3, 1.08), (1.5, 1.09), (1.72, 1.08), (1.76, 1.02),
           (1.78, 0.0)]
    K = len(sec)
    jag = [rnd.uniform(-1, 1) for _ in range(30)]

    def lateral(t, k, u, z):
        if 8 <= k <= 16:
            j = jag[int(t * 22)]
            return u + 0.05 * math.sin(t * 40 + v) + 0.03 * j
        return u

    def height(t, k, u, z):
        if k >= 15 and z > 0.5:
            return z * (0.86 + 0.14 * math.sin(t * 9 + v) + 0.05 * jag[int(t * 22) + 4])
        if 10 <= k <= 14:
            return z * (0.95 + 0.08 * math.sin(t * 13 + v * 2))
        return z
    land, dry, river = L(G.land), L(G.landDry), L(G.river)
    steppe, scree, rockc, rockd = L(G.steppe), L(G.scree), L(G.rock), L(G.rockDk)

    def color(t, k, zc, end):
        if end:
            if zc < 0.18:
                return dk(G.landDry, 0.15)
            return rockd if zc > 0.82 or zc < 0.5 else rockc
        if k <= 3:
            return land if int(t * 6) % 2 else dry       # the plain, in fields
        if k in (4, 5):
            return river
        if k == 6:
            return land
        if k in (7, 8):
            return scree
        if k in (9, 10, 11):
            return rockc
        if k in (12, 13):
            return steppe if zc > 0.78 else rockc        # the ledge
        if k in (14, 15, 16) or k == K - 2:
            return rockd
        return steppe if int(t * 8) % 2 else dry          # the plateau
    parts = [relief(path, sec, height=height, lateral=lateral, color=color, smooth=45)]
    # woods on the plain and on the plateau
    for i in range(7):
        a = c + rnd.uniform(-1.1, 1.1)
        r = rnd.uniform(0.4, 0.56) if i < 4 else rnd.uniform(1.35, 1.6)
        z = 0.16 if i < 4 else 1.08
        parts.append(crown(rnd.uniform(0.06, 0.09), (math.cos(a) * r, math.sin(a) * r, z + 0.05),
                           G.forest if i % 2 else G.forestDk, seg=8, rings=4))
    return fit(parts, 'wd_escarpment', v)


# A cloud front, bowed: towering cumulus along the leading edge (game -z), a
# flat deck trailing behind it with rain curtains under it, which is what
# makes the direction of travel legible; scud running out ahead.
@model('wd_cloudfront', ao=0.3)
def wd_cloudfront(v):
    rnd = random.Random(1800 + v * 17)
    Lx = 3.0
    H = 1.4
    cloud, grey, storm = L(G.cloud), L(G.cloudGrey), L(G.storm)

    def line(t):                                  # t in -0.5..0.5 -> Blender (x, y)
        x = t * Lx
        z = math.sin(t * 4.2 + v) * Lx * 0.3
        return x, -z
    parts = []
    # the trailing deck: one long flattened bank swept along the bow
    st = []
    n = 15
    for i in range(n):
        t = i / (n - 1) - 0.5
        x, y = line(t)
        x2, y2 = line(t + 0.01)
        dx, dy = x2 - x, y2 - y
        ln = math.hypot(dx, dy)
        # lateral = towards the back of the front (game +z, Blender -y side of the line)
        st.append((x, y, dy / ln, -dx / ln))
    sec = [(-0.08, 0.5), (0.0, 0.42), (0.18, 0.38), (0.36, 0.42), (0.44, 0.5), (0.4, 0.62), (0.24, 0.68),
           (0.06, 0.66), (-0.08, 0.5)]

    def height(t, k, u, z):
        return z * (1 + 0.06 * math.sin(t * 17 + k))

    def lateral(t, k, u, z):
        e = min(1.0, min(t, 1 - t) * 8)            # pinch the deck shut at both ends
        return 0.18 + (u - 0.18) * (0.3 + 0.7 * e)

    def color(t, k, zc, end):
        return storm if zc < 0.46 else (grey if zc < 0.55 else cloud)
    deck = relief(st, sec, height=height, lateral=lateral, color=color, smooth=70, caps="fan")
    parts.append(deck)
    # towers along the leading edge: cauliflower clusters standing on the
    # deck, tallest in the middle of the bow
    for i in range(9):
        t = i / 8 - 0.5
        x, y = line(t)
        x2, y2 = line(t + 0.01)
        nx, ny = (y2 - y), -(x2 - x)
        ln = math.hypot(nx, ny)
        nx, ny = nx / ln, ny / ln
        hh = H * rnd.uniform(0.8, 1.05) * (1 - 0.25 * abs(t) * 2)
        r = 0.24 + 0.05 * rnd.random()
        bx, by = x - nx * 0.06, y - ny * 0.06
        stack = [blob(r * 1.15, (bx, by, 0.58), G.cloud, seg=9, rings=4, scale=(1.15, 1, 0.75))]
        z = 0.58
        rr = r
        k = 0
        while z + rr * 0.8 < hh and k < 2:
            z += rr * 1.05
            rr *= 0.84
            k += 1
            sx = rnd.uniform(-0.06, 0.06)
            stack.append(blob(rr, (bx + sx, by + rnd.uniform(-0.04, 0.04), z), G.cloud, seg=8, rings=4,
                              scale=(1, 1, 1.15)))
            if k == 1:
                # a shoulder puff on one side
                d = rr * 0.9 * (1 if i % 2 else -1)
                stack.append(blob(rr * 0.7, (bx + d, by, z - rr * 0.3), G.cloud, seg=8, rings=4, scale=(1, 1, 0.8)))
        for o in stack:
            regrade(o, lambda p: mixc(storm, cloud, clamp01((p.z - 0.42) / 0.4)))
        parts += stack
        # rain under the deck behind every other tower
        if i % 2:
            rx, ry = x + nx * 0.2, y + ny * 0.2
            ph = rnd.uniform(0, 6.28)
            rain = revolve([(0.1, 0.0), (0.11, 0.25), (0.12, 0.48)], seg=8, color=G.rain, smooth=50,
                           warp=lambda a, r_, z_, j, ph=ph: (r_, 0.06 * (1 + math.sin(4 * a + ph)) if j == 0 else z_),
                           cap_bottom=True, cap_top=False)
            recolor(rain, lambda c, n: L(G.storm) if int((math.atan2(c.y, c.x) + 4) * 2.6) % 2 else None)
            deform(rain, lambda p, rx=rx, ry=ry: Vector((p.x * 1.4 + rx, p.y + ry, p.z)))
            parts.append(rain)
    # scud running out ahead of it
    for i in range(5):
        t = rnd.uniform(-0.45, 0.45)
        x, y = line(t)
        x2, y2 = line(t + 0.01)
        nx, ny = (y2 - y), -(x2 - x)
        ln = math.hypot(nx, ny)
        parts.append(blob(0.12, (x - nx / ln * 0.6, y - ny / ln * 0.6, H * rnd.uniform(0.2, 0.42)), G.cloud, seg=7,
                          rings=3, scale=(1.5, 1, 0.55)))
    return fit(parts, 'wd_cloudfront', v)
