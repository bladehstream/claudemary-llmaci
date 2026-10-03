"""Country-stage props, modelled: the land itself — forests, volcanoes, canyons,
lakes, deltas, ranges, sand seas, ice caps, peninsulas, the four landmasses
(country, republic, subcontinent, continent) and the islands, atolls and
icebergs out at sea.

Frame reminder (see kit.py): Blender Z is up, X is the prop's width, and the
game's FRONT (+Z) is Blender -Y. v1 (src/world/props/country.js) places
everything in game (x, y-up, z); `gz(x, z)` turns a game ground position into
Blender (x, y).

Read as a toy globe would show them: chunky landforms, terraced where steps
read better than a blob, settlements as tight clusters of little blocks, and
two or three big colour masses doing the work. Spec sizes are world units
treated as metres. Every model is built to v1's proportions and then `fit()`
to its catalogue box, so the nudge is small and the size is exact.
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
DEBUG_FIT = False  # prints the pre-fit stretch per axis while modelling


def model(pid, **finish):
    def wrap(fn):
        MODELS[pid] = fn
        if finish:
            FINISH[pid] = finish
        return fn
    return wrap


# ---------------------------------------------------------------- the globe's palette
# country.js's `G` (not in palette.json on purpose: no other stage wants an
# abyssal blue). Copied, never imported.

class G:
    ocean = 0x1d5c9c
    oceanDeep = 0x123f73
    shelf = 0x3ba5c6
    lagoon = 0x74d6dc
    surf = 0xdcf4f7
    river = 0x54b6dd

    plain = 0x77a84c
    plainDry = 0xa3b45b
    forest = 0x3c7a37
    forestDk = 0x2b5c2a
    jungle = 0x2f8446
    steppe = 0xb7ad63
    sand = 0xe3ca8b
    sandDeep = 0xcaa863

    rock = 0x8d8478
    rockDk = 0x635c54
    scree = 0xa9a294
    tundra = 0x9fa495
    ice = 0xe9f5fb
    iceBlue = 0xc2e6f4
    snow = 0xfcfdff

    cloud = 0xf7fbff
    cloudGrey = 0xd0dae4

    glow = 0xffc65a
    glowPale = 0xffe9a8
    urban = 0x7d7b83
    urbanDk = 0x55535c

    lava = 0xff7b34
    ash = 0x484450
    metal = 0xc6ced5
    metalDk = 0x7a838b
    solar = 0x2b3a80


# ---------------------------------------------------------------- helpers
# revolve / blob / rock / prism / circle / fit are scenery.py's, copied.

def gz(x, z):
    """A v1 (game) ground position -> Blender (x, y)."""
    return (x, -z)


def L(col):
    return lin(col) if isinstance(col, int) else col


def dk(col, t=0.2):
    return mixc(L(col), (0, 0, 0), t)


def lt(col, t=0.4):
    return mixc(L(col), (1, 1, 1), t)


def clamp01(t):
    return max(0.0, min(1.0, t))


def regrade(obj, fn):
    """Repaint every vertex: fn(pos Vector) -> linear rgb."""
    return paint(obj, (0, 0, 0), fn)


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
    if DEBUG_FIT:
        print(f'MODEL~fit {pid}__{v} stretch x{k[0]:.2f} y{k[1]:.2f} z{k[2]:.2f}')
        tally = {}
        for o in parts:
            t = sum(len(pl.vertices) - 2 for pl in o.data.polygons)
            n, c = tally.get(o.name.split('.')[0], (0, 0))
            tally[o.name.split('.')[0]] = (n + 1, c + t)
        print('MODEL~tris ' + ' '.join(f'{k}:{n}x={c}' for k, (n, c) in tally.items()))
        for o in parts:
            l2, h2 = bounds([o])
            if h2[1] > hi[1] - 1 or l2[1] < lo[1] + 1:
                print(f'MODEL~edge {o.name} y {l2[1]:.1f}..{h2[1]:.1f}')
    for o in parts:
        for vt in o.data.vertices:
            p = vt.co
            vt.co = Vector(((p.x - cx) * k[0], (p.y - cy) * k[1], (p.z - lo[2]) * k[2]))
        o.data.update()
    return parts


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
    """A low sphere (lathed, so the ring count is free). `flat` clamps
    everything below that world height onto it."""
    rings = rings or max(3, seg // 2)
    prof = [(r * math.sin(math.pi * i / rings), -r * math.cos(math.pi * i / rings)) for i in range(rings + 1)]
    o = revolve(prof, seg=seg, color=color, smooth=80)
    m = Euler(tuple(math.radians(a) for a in rot), 'XYZ').to_matrix()
    deform(o, lambda p: m @ Vector((p.x * scale[0], p.y * scale[1], p.z * scale[2])) + Vector(at))
    if flat is not None:
        deform(o, lambda p: Vector((p.x, p.y, max(p.z, flat))))
    return o


def rock(r, at, color, sub=2, scale=(1, 1, 1), seed=0, cuts=7, depth=0.18, rot=(0, 0, 0)):
    """A chunky faceted stone: an icosphere sliced by a few random planes."""
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


def prism(poly, h, at=(0, 0, 0), color=0xcccccc, bevel=0.0, seg=1, rot=(0, 0, 0), smooth=30):
    """An outline extruded up Z with a choice of bevel segments."""
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


def circle(r, n=16, cx=0.0, cy=0.0, sx=1.0, sy=1.0, a0=0.0):
    return [(cx + r * sx * math.cos(a0 + 2 * math.pi * i / n), cy + r * sy * math.sin(a0 + 2 * math.pi * i / n))
            for i in range(n)]


def lobes(rnd, amp=0.08, k=(3, 5)):
    """A wobble for a coastline: a -> radius factor, seeded."""
    ph = [rnd.uniform(0, 6.28) for _ in k]
    am = [amp, amp * 0.55, amp * 0.35][:len(k)]

    def f(a):
        return 1 + sum(m * math.cos(n * a + p) for m, n, p in zip(am, k, ph))
    return f


def footprint(R, lob, pid, v, k=1.13, n=96):
    """(sx, sy) that make a lobed outline of radius k*R*lob(a) span the
    catalogue box's footprint exactly, so fit() has nothing left to stretch."""
    xs = [k * R * lob(2 * math.pi * i / n) * math.cos(2 * math.pi * i / n) for i in range(n)]
    ys = [k * R * lob(2 * math.pi * i / n) * math.sin(2 * math.pi * i / n) for i in range(n)]
    want = target(pid, v)
    return want[0] / (max(xs) - min(xs)), want[1] / (max(ys) - min(ys))


def blot(r, rnd, n=14, cx=0.0, cy=0.0, amp=0.16, sx=1.0, sy=1.0):
    """A wobbly closed outline (counter-clockwise): lakes, biome patches."""
    f = lobes(rnd, amp)
    return [(cx + r * sx * f(a) * math.cos(a), cy + r * sy * f(a) * math.sin(a))
            for a in (2 * math.pi * i / n for i in range(n))]


def patch(poly, z, h, color, bevel=None):
    """A flat colour block lying on the deck: a biome, a clearing, a pond."""
    return prism(poly, h, at=(0, 0, z), color=color, bevel=(h * 0.45 if bevel is None else bevel), seg=1, smooth=40)


def ribbon(pts, w, z, h, color, taper=None, smooth=40):
    """A flat strip along a polyline [(x, y) or (x, y, z), ...]: rivers, roads,
    channels. A point's own z (if given) is added to `z`. `taper(t)` scales
    the width along it."""
    bm = bmesh.new()
    n = len(pts)
    rows = []
    for i, p in enumerate(pts):
        x, y = p[0], p[1]
        zz = z + (p[2] if len(p) > 2 else 0.0)
        a = Vector(pts[max(0, i - 1)][:2])
        b = Vector(pts[min(n - 1, i + 1)][:2])
        t = (b - a).normalized()
        nx, ny = -t.y, t.x
        ww = w * 0.5 * (taper(i / (n - 1)) if taper else 1.0)
        rows.append([bm.verts.new((x + nx * ww, y + ny * ww, zz)), bm.verts.new((x - nx * ww, y - ny * ww, zz)),
                     bm.verts.new((x - nx * ww, y - ny * ww, zz + h)), bm.verts.new((x + nx * ww, y + ny * ww, zz + h))])
    for a, b in zip(rows, rows[1:]):
        for j in range(4):
            bm.faces.new((a[j], a[(j + 1) % 4], b[(j + 1) % 4], b[j]))
    bm.faces.new(list(reversed(rows[0])))
    bm.faces.new(rows[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = _from_bmesh(bm, 'ribbon')
    paint(o, color)
    return _smooth(o, smooth)


def interp(prof, z):
    """Radius of a (r, z) profile (z rising) at height z."""
    for (r0, z0), (r1, z1) in zip(prof, prof[1:]):
        if z0 <= z <= z1 and z1 > z0:
            return r0 + (r1 - r0) * (z - z0) / (z1 - z0)
    return prof[-1][0] if z > prof[-1][1] else prof[0][0]


def drape(prof, lob, a0, z_from, z_to, w0, w1, color, n=8, lift=0.6, thick=1.2, wig=0.0, ph=0.0):
    """A strip laid down the flank of a revolved shape (a lava tongue, a
    glacier): `prof` is the shape's (r, z) profile and `lob(a)` its radial
    wobble; the strip runs from z_from down to z_to at angle a0 (radians)."""
    bm = bmesh.new()
    rows = []
    for i in range(n + 1):
        t = i / n
        z = z_from + (z_to - z_from) * t
        a = a0 + wig * math.sin(t * 5 + ph)
        r = interp(prof, z) * lob(a)
        w = (w0 + (w1 - w0) * t) / max(r, 1e-6)
        row = []
        for da, dl in ((-w / 2, lift), (w / 2, lift), (w / 2, lift + thick), (-w / 2, lift + thick)):
            rr = r + dl
            row.append(bm.verts.new((rr * math.cos(a + da), rr * math.sin(a + da), z + dl * 0.5)))
        rows.append(row)
    for a, b in zip(rows, rows[1:]):
        for j in range(4):
            bm.faces.new((a[j], a[(j + 1) % 4], b[(j + 1) % 4], b[j]))
    bm.faces.new(list(reversed(rows[0])))
    bm.faces.new(rows[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = _from_bmesh(bm, 'drape')
    paint(o, color)
    return _smooth(o, 50)


def town(rnd, cx, cy, z, S, H, cols, glowP, wall, pad=G.urbanDk, bev=False, skip=0.17, tall=1.4, pad_bev=True):
    """A settlement seen from far above: a dark pad and a tight grid of little
    blocks, some of them lit amber, roofs a shade paler than their walls."""
    parts = [box((S * 1.06, S * 1.06, H * 0.07), at=(cx, cy, z - H * 0.02), color=pad,
                 bevel=(S * 0.03 if pad_bev else 0), seg=1)]
    step = S / cols
    for i in range(cols):
        for k in range(cols):
            if rnd.random() < skip:
                continue
            x = cx - S / 2 + (i + 0.5) * step
            y = cy - S / 2 + (k + 0.5) * step
            h = H * (0.3 + rnd.random() * rnd.random() * tall)
            col = G.glow if rnd.random() < glowP else wall
            w = step * 0.64
            b = box((w, w, h), at=(x, y, z + H * 0.04), color=col, bevel=(w * 0.1 if bev else 0), seg=1)
            roof = lt(col, 0.25)
            recolor(b, lambda c, nn: roof if nn.z > 0.6 else None)
            parts.append(b)
    return parts


def peak(R, H, at, lob, rnd, seg=12, snow=0.7, rockc=G.rock, cap=G.snow, foot=None, dark=None):
    """`cap=None` leaves the summit bare rock."""
    """A toy mountain: a lobed cone, optional green foot, rock, and a dripping
    cap of snow whose edge is a mesh ring rippled per angle."""
    q1, q2 = rnd.uniform(0, 6.28), rnd.uniform(0, 6.28)

    def wave(a):
        return 0.04 * H * math.sin(4 * a + q1) + 0.025 * H * math.sin(7 * a + q2)
    prof = [(R, 0.0), (R * 0.78, H * 0.18), (R * 0.52, H * 0.46), (R * 0.33, H * snow), (R * 0.12, H * 0.92),
            (0.0, H)]

    def warp(a, r, z, i):
        if i == 3:
            z += wave(a)
        return r * lob(a), z
    o = revolve(prof, seg=seg, color=rockc, warp=warp, smooth=45, cap_bottom=False)
    rc = L(rockc)
    capc = lt(rockc, 0.18) if cap is None else L(cap)
    darkc = L(dark) if dark is not None else dk(rockc, 0.15)

    def col(c, n):
        a = math.atan2(c.y, c.x)
        z = c.z
        if z > H * snow + wave(a) - 0.02 * H:
            return capc
        if foot is not None and z < H * 0.16:
            return L(foot)
        return darkc if n.z < 0.45 else rc
    recolor(o, col)
    deform(o, lambda p: p + Vector(at))
    return o


def slab(R, H, lob, deck, cliff, seg=32, shelf=G.shelf, beach=G.sand, rim=None, sx=1.0, sy=1.0, dome=0.02):
    """A landmass: a pale shelf skirt at the waterline, a sand beach band at the
    foot of the cliff, the cliff, and a deck with a softly rounded rim. Every
    band is a ring of the mesh, so the colours are clean lines.
    Returns the mesh and the deck height."""
    prof = [(1.13, 0.0), (1.13, 0.035), (1.06, 0.075), (1.0, 0.085), (0.995, 0.17), (0.985, 0.82),
            (0.965, 0.95), (0.93, 1.0), (0.7, 1.0 + dome * 0.5), (0.4, 1.0 + dome * 0.85), (0.0, 1.0 + dome)]
    if shelf is None:
        prof = [(1.0, 0.0)] + prof[4:]
    if dome <= 0:
        prof = [p for p in prof if p[0] > 0.5 or p[0] == 0.0]

    def warp(a, r, z, i):
        f = lob(a)
        return r * f, z
    o = revolve([(r * R, z * H) for r, z in prof], seg=seg, color=deck, warp=warp, smooth=38, cap_bottom=True)
    deform(o, lambda p: Vector((p.x * sx, p.y * sy, p.z)))
    rimc = L(rim) if rim is not None else lt(deck, 0.12)

    def col(c, n):
        z = c.z / H
        if shelf is not None and z < 0.08:
            return L(shelf)
        if beach is not None and z < 0.17:
            return L(beach)
        if z < 0.9:
            return L(cliff) if n.z < 0.5 else lt(cliff, 0.1)
        if z < 0.985:
            return rimc
        return None
    recolor(o, col)
    return o, H


def puff(r, at, color, rnd=None, seg=9, squash=0.85, top=1.35, under=0.2, flat=None):
    """A canopy lump, lighter on top and darker underneath: a dome sitting on
    `at`'s z minus a little, so no triangles are spent below the ground."""
    h = r * squash * 1.6
    z0 = at[2] - r * squash * 0.6 if flat is None else flat
    o = revolve([(r * 0.84, 0.0), (r, h * 0.38), (r * 0.7, h * 0.84), (0.0, h)],
                seg=seg, color=color, smooth=80)
    deform(o, lambda p: p + Vector((at[0], at[1], z0)))
    base = L(color)
    hi = tuple(min(1.0, c * top) for c in base)
    lo = dk(base, under)
    regrade(o, lambda p: mixc(lo, hi, clamp01((p.z - z0) / h) ** 0.8))
    return o


def pine(x, y, z, h, col, seg=8):
    """A two-tier toy conifer, one mesh."""
    o = revolve([(h * 0.36, 0.0), (h * 0.14, h * 0.45), (h * 0.27, h * 0.4), (0.0, h)], seg=seg, color=col, smooth=40)
    deform(o, lambda p: p + Vector((x, y, z)))
    regrade(o, lambda p: mixc(dk(col, 0.3), lt(col, 0.12), clamp01((p.z - z) / h)))
    return o


def scatter(rnd, n, rmin, rmax, inside, gap=0.62, tries=900):
    """Up to n non-crowding discs (x, y, r) wherever inside(x, y, r) allows."""
    placed = []
    for _ in range(tries):
        if len(placed) >= n:
            break
        rr = rnd.uniform(rmin, rmax)
        x, y = inside(rnd, rr)
        if x is None or any(math.hypot(x - px, y - py) < (rr + pr) * gap for px, py, pr in placed):
            continue
        placed.append((x, y, rr))
    return placed


# ---------------------------------------------------------------- forest

@model('w_forest', ao=0.55)
def w_forest(v):
    """A disc of woodland: a hummocky canopy of big toy tree-lumps, a clearing,
    a lake, and a sandy road winding through. v: forest / dark pines / jungle."""
    rnd = random.Random(1100 + v)
    R = 128.0
    col = [G.forest, G.forestDk, G.jungle][v]
    lob = lobes(rnd, 0.05)
    base, top = slab(R, 6.0, lob, col, G.forestDk, seg=30, shelf=None, beach=None, rim=dk(col, 0.1), dome=0.0,
                     sx=1.04, sy=0.94)
    parts = [base]
    clear_at = gz(R * 0.3, -R * 0.28)
    lake_at = gz(-R * 0.36, R * 0.2)
    parts.append(patch(blot(R * 0.19, rnd, 14, *clear_at), top - 0.4, 1.4, G.plain))
    lake = patch(blot(R * 0.15, rnd, 14, *lake_at), top - 0.3, 1.6, G.river)
    parts.append(lake)
    parts.append(patch(blot(R * 0.19, rnd, 14, *lake_at, amp=0.1), top - 0.5, 1.2, G.sand, bevel=0.5))
    # a sandy road wandering across, through the clearing
    ph = rnd.uniform(0, 6.28)
    road = [(t, -math.sin(t / (R * 1.9) * 5.2 + ph) * R * 0.22) for t in
            (R * 1.85 * (i / 13 - 0.5) for i in range(14))]
    road = [(x, y) for (x, y) in road if math.hypot(x, y) < R * 0.88 * lob(math.atan2(y, x))]
    parts.append(ribbon(road, R * 0.05, top - 0.3, 1.2, G.sandDeep))

    def inside(rnd, r):
        a = rnd.uniform(0, 6.28)
        d = R * math.sqrt(rnd.random()) * 1.0
        x, y = math.cos(a) * d, math.sin(a) * d
        for (cx, cy), cr in ((clear_at, R * 0.2), (lake_at, R * 0.19)):
            if math.hypot(x - cx, y - cy) < cr + r * 0.3:
                return None, None
        if math.hypot(x / 1.04, y / 0.94) + r * 0.05 > R * lob(math.atan2(y / 0.94, x / 1.04)):
            return None, None
        return x, y
    if v == 1:
        # a dark conifer wood: many pines, packed
        for i, (x, y, rr) in enumerate(scatter(rnd, 34, R * 0.07, R * 0.13, inside, gap=0.85)):
            parts.append(pine(x, y, top - 0.5, rr * 3.5, G.forestDk if i % 3 else G.forest, seg=8))
    else:
        for i, (x, y, rr) in enumerate(scatter(rnd, 22, R * 0.1, R * 0.25, inside, gap=0.68)):
            c = col if i % 3 else G.forestDk
            parts.append(puff(rr, (x, y, top), c, seg=10 if rr > R * 0.15 else 9, squash=1.0 if v == 0 else 0.8,
                              flat=top - 0.3))
            if rr > R * 0.19:
                a = rnd.uniform(0, 6.28)
                parts.append(puff(rr * 0.55, (x + math.cos(a) * rr * 0.35, y + math.sin(a) * rr * 0.35, top),
                                  c, seg=8, squash=1.0, flat=top + rr * 0.9))
    return fit(parts, 'w_forest', v)


# ---------------------------------------------------------------- volcano

@model('w_volcano', ao=0.55)
def w_volcano(v):
    """A stratovolcano on a scorched apron: concave ash flanks, a darker rocky
    summit, a lava-filled crater with tongues running down one side, and the
    plume leaning downwind, (v-1) across as in v1."""
    rnd = random.Random(1200 + v)
    R, H = 148.0, 96.0
    lob = lobes(rnd, 0.04)
    apron = mixc(L(G.rockDk), L(G.plain), 0.3)
    base, top = slab(R, 6.0, lob, apron, G.rockDk, seg=28, shelf=None, beach=None, dome=0.0)
    parts = [base]
    z0 = top - 0.5
    prof = [(0.92 * R, z0), (0.78 * R, z0 + 0.08 * H), (0.6 * R, z0 + 0.22 * H), (0.43 * R, z0 + 0.44 * H),
            (0.3 * R, z0 + 0.68 * H), (0.215 * R, z0 + 0.91 * H), (0.19 * R, z0 + H), (0.155 * R, z0 + 0.985 * H),
            (0.13 * R, z0 + 0.9 * H), (0.0, z0 + 0.9 * H)]
    clob = lobes(rnd, 0.05, k=(3, 7))
    cone = revolve(prof, seg=30, color=G.ash, warp=lambda a, r, z, i: (r * (clob(a) if i < 6 else 1.0), z),
                   smooth=50, cap_bottom=False)
    q = rnd.uniform(0, 6.28)
    ash, rockc, lava = L(G.ash), L(G.rockDk), L(G.lava)

    def col(c, n):
        a = math.atan2(c.y, c.x)
        if math.hypot(c.x, c.y) < 0.15 * R and c.z < z0 + 0.95 * H:
            return lava
        if c.z > z0 + H * (0.55 + 0.05 * math.sin(5 * a + q)):
            return rockc if n.z < 0.8 else lt(rockc, 0.1)
        return lt(ash, 0.08) if n.z > 0.55 else ash
    recolor(cone, col)
    parts.append(cone)
    # lava tongues down one flank (v1: game angles 0.6, 1.1, 1.6 -> Blender -a)
    sprof = [(r, z) for (r, z) in prof[:7]]
    for i in range(3):
        a = -(0.6 + i * 0.5)
        parts.append(drape(sprof, clob, a, z0 + 0.97 * H, z0 + (0.08 + 0.14 * i) * H, R * 0.07, R * 0.13,
                           G.lava, n=7, lift=-0.3, thick=2.6, wig=0.05, ph=i * 2.0))
    # the plume, leaning downwind
    lean = Vector((R * 0.7 * (v - 1), -R * 0.3, 0)).normalized() if v != 1 else Vector((1, 0, 0))
    side = Vector((-lean.y, lean.x, 0))
    for i in range(8):
        t = i / 7
        rx, rz = R * (0.11 + t * 0.2), R * (0.09 + t * 0.13)
        wob = (1 if i % 2 else -1) * rx * 0.32 * (0.3 + t)
        at = (t * R * 0.7 * (v - 1) + side.x * wob, -t * R * 0.3 + side.y * wob,
              z0 + H * 0.97 + t * H * 0.5 + rz * 0.35 + (rz * 0.2 if i % 2 else 0))
        c = G.ash if i <= 3 else G.cloudGrey
        b = blob(rx, at, c, seg=10, scale=(1, 1, rz / rx))
        lo, hi = (dk(c, 0.15), lt(c, 0.25)) if i > 3 else (dk(c, 0.1), lt(c, 0.18))
        regrade(b, lambda p, at=at, rz=rz, lo=lo, hi=hi: mixc(lo, hi, clamp01((p.z - at[2] + rz) / (2 * rz))))
        parts.append(b)
    # a ring of woods on the apron
    for k in range(8):
        a = k / 8 * 6.28 + rnd.uniform(-0.25, 0.25)
        d = R * rnd.uniform(0.86, 0.96) * lob(a)
        rr = R * rnd.uniform(0.06, 0.09)
        parts.append(puff(rr, (math.cos(a) * d, math.sin(a) * d, top), G.forest, seg=9, squash=0.9, flat=top - 0.3))
    return fit(parts, 'w_volcano', v)


# ---------------------------------------------------------------- canyon

@model('w_canyon', ao=0.6)
def w_canyon(v):
    """A stepped gorge meandering across a desert block: three strata of
    terrace either side (sandDeep, sand, rock), a river on the floor, mesas
    standing in it and scrub on the rims. v moves the meander, as in v1."""
    rnd = random.Random(1300 + v)
    # v1's terraces overhang its 440 x 400 block (its box is 502 x 508), so
    # the block here is drawn at the box's size instead
    W, D, H = 496.0, 500.0, 64.0
    zb = 14.0
    parts = [box((W, D, zb), at=(0, 0, 0), color=G.sandDeep, bevel=zb * 0.25, seg=2)]
    recolor(parts[0], lambda c, n: lt(G.sandDeep, 0.1) if n.z > 0.6 else None)

    def yc(x):
        return -math.sin(x / W * 4.6 + v) * D * 0.13
    N = 22
    xs = [-W / 2 + W * i / N for i in range(N + 1)]
    mesa = mixc(L(G.steppe), L(G.sandDeep), 0.45)
    # side canyons: notches cut back into the plateau, deeper in the upper strata
    tribs = [(s_, rnd.uniform(-W * 0.4, W * 0.4), rnd.uniform(24, 34)) for s_ in (-1, 1) for _ in range(2)]

    def notch(x, s, k):
        return sum(k * 60 * math.exp(-((x - xt) / w) ** 2) for s_, xt, w in tribs if s_ == s)
    # (setback from the gorge's centre line, top, colour): stepping up and out
    tiers = [(40.0, zb + 14.0, G.sandDeep), (62.0, zb + 26.0, G.sand), (88.0, zb + 38.0, G.rock),
             (110.0, zb + 48.0, mesa)]
    for s in (-1, 1):
        for ti, (off, ztop, col) in enumerate(tiers):
            edge = [(x, yc(x) + s * (off + 6 * math.sin(x * 0.05 + off) + notch(x, s, ti / 3))) for x in xs]
            edge = [(x, max(-D * 0.47, min(D * 0.47, y))) for x, y in edge]
            if s > 0:
                poly = edge + [(W / 2, D / 2), (-W / 2, D / 2)]
            else:
                poly = [(-W / 2, -D / 2), (W / 2, -D / 2)] + edge[::-1]
            t = prism(poly, ztop - zb + 0.5, at=(0, 0, zb - 0.5), color=col, bevel=(2.0 if ti == 3 else 0.0),
                      seg=1, smooth=35)
            top_c = lt(col, 0.12)
            side_c = dk(col, 0.08)
            recolor(t, lambda c, n, top_c=top_c, side_c=side_c: top_c if n.z > 0.6 else side_c)
            parts.append(t)
    # the river on the floor
    parts.append(ribbon([(x, yc(x)) for x in xs], D * 0.075, zb - 0.4, 1.6, G.river))
    # mesas in the gorge
    for k in range(4):
        x = -W * 0.36 + k * W * 0.24 + rnd.uniform(-15, 15)
        side = 1 if k % 2 else -1
        y = yc(x) + side * 24
        r = D * rnd.uniform(0.032, 0.045)
        h = (63.0 if k == 1 else rnd.uniform(40.0, 54.0))
        mlob = lobes(rnd, 0.1)
        m = revolve([(r * 1.25, 0.0), (r * 1.12, h * 0.3), (r, h * 0.36), (r * 0.94, h * 0.96), (r * 0.86, h), (0.0, h)],
                    seg=10, color=G.rock, warp=lambda a, rr, z, i, mlob=mlob: (rr * mlob(a), z), smooth=35)
        recolor(m, lambda c, n, h=h: L(G.sandDeep) if c.z < h * 0.33 else (lt(G.rock, 0.14) if n.z > 0.6 else (
            L(G.sand) if 0.55 * h < c.z < 0.7 * h else L(G.rock))))
        deform(m, lambda p, x=x, y=y: p + Vector((x, y, zb - 0.5)))
        parts.append(m)
    # scrub on the rims
    for k in range(16):
        s = 1 if k % 2 else -1
        x = rnd.uniform(-W * 0.45, W * 0.45)
        y = yc(x) + s * rnd.uniform(135, 230)
        if abs(y) > D * 0.46 or notch(x, s, 1.0) > 20:
            continue
        parts.append(puff(D * rnd.uniform(0.016, 0.028), (x, y, zb + 48), G.steppe, seg=7, squash=0.8, flat=zb + 47.6))
    return fit(parts, 'w_canyon', v)


# ---------------------------------------------------------------- lake

@model('w_lake', ao=0.55)
def w_lake(v):
    """A great lake set into a lobed landmass: a sand shore, shallows, a deep
    blue middle, wooded islands, an outflow river to the coast and a lakeside
    town. Deck is v1's biome per variant."""
    rnd = random.Random(1400 + v)
    R, H = 250.0, 50.0
    deck = [G.plain, G.forest, G.steppe][v]
    lob = lobes(rnd, 0.09)
    fsx, fsy = footprint(R, lob, 'w_lake', v)
    base, top = slab(R, H, lob, deck, G.rockDk, seg=40, dome=0.0, sx=fsx, sy=fsy)
    parts = [base]
    lake_lob = lobes(rnd, 0.14, k=(3, 4))
    cx, cy = R * 0.04, -R * 0.02

    def outline(r, n=22, sx=1.0, sy=0.92):
        return [(cx + r * sx * lake_lob(a) * math.cos(a), cy + r * sy * lake_lob(a) * math.sin(a))
                for a in (2 * math.pi * i / n for i in range(n))]
    parts.append(patch(outline(R * 0.7), top - 0.6, 1.3, G.sand, bevel=0.5))
    parts.append(patch(outline(R * 0.64), top - 0.4, 1.6, G.shelf, bevel=0.6))
    parts.append(patch(blot(R * 0.38, rnd, 18, cx - R * 0.1, cy - R * 0.08, amp=0.12), top - 0.2, 1.7, G.river,
                       bevel=0.5))
    parts.append(patch(blot(R * 0.22, rnd, 14, cx - R * 0.12, cy - R * 0.1, amp=0.12), top - 0.1, 1.75, G.ocean,
                       bevel=0.4))
    # wooded islands
    for k, (ix, iy, ir) in enumerate(((0.3, 0.22, 0.07), (0.22, -0.3, 0.05), (-0.36, 0.26, 0.055))):
        x, y = cx + ix * R, cy + iy * R
        parts.append(patch(blot(R * ir, rnd, 10, x, y, amp=0.2), top - 0.2, 3.2, G.sand, bevel=1.0))
        parts.append(puff(R * ir * 0.75, (x, y, top + 3.0), G.forest, seg=9, squash=0.8, flat=top + 2.8))
    # outflow river to the coast (v1: toward game +x, -z)
    a_out = math.atan2(R * 0.3, R * 0.62)
    p0 = (cx + R * 0.62 * lake_lob(a_out) * math.cos(a_out), cy + R * 0.55 * lake_lob(a_out) * math.sin(a_out))
    edge = R * 0.97 * lob(a_out)
    pts = []
    for i in range(9):
        t = i / 8
        d = math.hypot(*p0) + (edge - math.hypot(*p0)) * t
        aa = a_out + 0.12 * math.sin(t * 6.0)
        pts.append((math.cos(aa) * d, math.sin(aa) * d))
    parts.append(ribbon(pts, R * 0.05, top - 0.5, 1.5, G.river, taper=lambda t: 0.8 + 0.4 * t))
    # the town on the shore (v1: game x -0.66R, z -0.2R)
    tx, ty = gz(-R * 0.68, -R * 0.2)
    parts += town(rnd, tx, ty, top, R * 0.2, 13.0, 3, 0.4, C.cream)
    # woods round the shore
    for k in range(9):
        a = rnd.uniform(0, 6.28)
        d = R * rnd.uniform(0.76, 0.88) * lob(a)
        x, y = math.cos(a) * d, math.sin(a) * d
        if math.hypot(x - tx, y - ty) < R * 0.2 or abs(math.atan2(y, x) - a_out) < 0.2:
            continue
        parts.append(puff(R * rnd.uniform(0.04, 0.06), (x, y, top), G.forest if k % 3 else G.forestDk, seg=9,
                          squash=0.9, flat=top - 0.3))
    return fit(parts, 'w_lake', v)


# ---------------------------------------------------------------- delta

def fan(Rf, a_span, h0, h1, rnd, n=16, m=5, scallop=0.1, color=G.sandDeep, power=1.3):
    """A river's fan: a sector of land from an apex at the origin opening
    toward +Y, falling from h0 at the apex to h1 at its scalloped rim, with a
    skirt down to z=0. Returns (mesh, zf(r))."""
    def zf(r):
        t = clamp01(r / Rf)
        return h1 + (h0 - h1) * (1 - t) ** power
    sc = lobes(rnd, scallop, k=(7, 11))
    bm = bmesh.new()
    apex = bm.verts.new((0, 0, zf(0)))
    rings = []
    for j in range(1, m + 1):
        rr = Rf * j / m
        ring = []
        for i in range(n + 1):
            a = math.pi / 2 - a_span + 2 * a_span * i / n
            k = sc(a * 1.1) if j == m else 1.0 + (sc(a * 1.1) - 1.0) * (j / m) ** 2
            ring.append(bm.verts.new((rr * k * math.cos(a), rr * k * math.sin(a), zf(rr))))
        rings.append(ring)
    for i in range(n):
        bm.faces.new((apex, rings[0][i], rings[0][i + 1]))
    for a, b in zip(rings, rings[1:]):
        for i in range(n):
            bm.faces.new((a[i], b[i], b[i + 1], a[i + 1]))
    # skirts: rim and both sides
    outer = rings[-1]
    low = [bm.verts.new((p.co.x, p.co.y, 0.0)) for p in outer]
    for i in range(n):
        bm.faces.new((outer[i], low[i], low[i + 1], outer[i + 1]))
    for side in (0, n):
        line = [apex] + [r[side] for r in rings]
        base = [bm.verts.new((p.co.x, p.co.y, 0.0)) for p in line]
        for i in range(len(line) - 1):
            bm.faces.new((line[i], line[i + 1], base[i + 1], base[i]))
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = _from_bmesh(bm, 'fan')
    paint(o, color)
    return _smooth(o, 70), zf


@model('w_delta', ao=0.55)
def w_delta(v):
    """A great river reaching the sea: a jungle upland at the front, the river
    across it, and a sandy fan spreading toward the back (v1's game -Z) in a
    spray of distributaries, on a pale shelf. The town moves with v as in v1."""
    rnd = random.Random(1500 + v)
    R = 330.0
    Hu = 56.0
    ucy = -R * 0.5
    lob = lobes(rnd, 0.05)
    up, top = slab(R * 0.92, Hu, lob, G.jungle, G.rockDk, seg=30, shelf=None, beach=G.sandDeep, dome=0.0,
                   sx=1.0, sy=0.55)
    deform(up, lambda p: p + Vector((0, ucy, 0)))
    parts = [up]
    # the fan, its apex just inside the upland's back edge
    ay = ucy + R * 0.92 * 0.55 * 0.8
    Rf = R * 1.12
    f, zf = fan(Rf, math.radians(60), 17.0, 5.0, rnd, n=16, m=5, scallop=0.07, power=1.2)
    deform(f, lambda p: p + Vector((0, ay, 0)))
    sand, deep, green = L(G.sand), L(G.sandDeep), mixc(L(G.jungle), L(G.sandDeep), 0.3)

    def fan_col(p):
        if p.z < 1.0:
            return lt(G.sand, 0.1)
        d = math.hypot(p.x, p.y - ay) / Rf
        if d < 0.72:
            return mixc(green, deep, clamp01((d - 0.25) / 0.45))
        return mixc(deep, sand, clamp01((d - 0.72) / 0.2) * 0.7)
    regrade(f, fan_col)
    parts.append(f)
    # the shelf it builds out into
    parts.append(patch(blot(Rf * 0.98, rnd, 24, 0, ay + Rf * 0.12, amp=0.05, sx=0.84, sy=0.85), 0.0, 3.0, G.shelf,
                       bevel=1.0))
    # the trunk river, across the upland from the front
    fy = ucy - R * 0.92 * 0.55 * lob(-math.pi / 2) * 0.95
    ey = ucy + R * 0.92 * 0.55 * lob(math.pi / 2) * 0.97
    trunk = [(math.sin(t * 5.0) * R * 0.05 * (1 - t), fy + (ey - fy) * t) for t in (i / 8 for i in range(9))]
    parts.append(ribbon(trunk, R * 0.07, top - 0.6, 1.6, G.river, taper=lambda t: 0.85 + 0.3 * t))
    # where it drops off the upland onto its own fan: a waterfall down the cliff
    fall = box((R * 0.08, R * 0.05, top - zf(ey - ay) + 1.0), at=(0, ey + R * 0.01, zf(ey - ay) - 0.5),
               color=G.river, bevel=R * 0.01, seg=1)
    recolor(fall, lambda c, n: L(G.surf) if c.z < zf(ey - ay) + 6 or n.z > 0.5 else None)
    parts.append(fall)
    # distributaries over the fan
    for k in range(8):
        a = math.pi / 2 + math.radians(-49 + k * 14) + rnd.uniform(-0.05, 0.05)
        reach = Rf * rnd.uniform(0.9, 0.98)
        pts = []
        for i in range(7):
            t = 0.02 + 0.98 * i / 6
            aa = a * (0.4 + 0.6 * t) + (math.pi / 2) * (0.6 - 0.6 * t) + 0.06 * math.sin(t * 7 + k)
            r = reach * t
            pts.append((math.cos(aa) * r, ay + math.sin(aa) * r, zf(r)))
        parts.append(ribbon(pts, R * 0.036, 0.6, 1.4, G.river, taper=lambda t: 1.15 - 0.45 * t))
    # jungle on the upland and islets on the fan
    tx = R * 0.34 * (v - 1) + (R * 0.22 if v == 1 else 0)
    ty = ucy + R * 0.02
    placed = 0
    for k in range(60):
        if placed >= 11:
            break
        a = rnd.uniform(0, 6.28)
        d = R * 0.85 * math.sqrt(rnd.uniform(0.05, 1)) * lob(a)
        x, y = math.cos(a) * d, ucy + math.sin(a) * d * 0.55
        if abs(x) < R * 0.1 or math.hypot(x - tx, y - ty) < R * 0.22:
            continue
        placed += 1
        rr = R * rnd.uniform(0.05, 0.08)
        parts.append(puff(rr, (x, y, top), G.jungle if k % 3 else G.forest, seg=9, squash=0.8, flat=top - 0.3))
    for k in range(8):
        a = math.pi / 2 + math.radians(-44 + k * 12.5)
        r = Rf * rnd.uniform(0.3, 0.6)
        x, y = math.cos(a) * r, ay + math.sin(a) * r
        rr = R * rnd.uniform(0.025, 0.04)
        parts.append(puff(rr, (x, y, zf(r)), G.jungle, seg=8, squash=0.8, flat=zf(r) - 0.8))
    parts += town(rnd, tx, ty, top, R * 0.24, 18.0, 4, 0.42, C.cream)
    return fit(parts, 'w_delta', v)


# ---------------------------------------------------------------- range

@model('w_range', ao=0.5)
def w_range(v):
    """A long mountain range on a scree plinth: a main chain of snow-capped
    toy peaks, a lower second ridge crossing it, glacier tongues, and a green
    valley with a river and woods along the front side. v turns the chain."""
    rnd = random.Random(1600 + v)
    Ln, H = 860.0, 190.0
    ang = -(0.1 + v * 0.05)
    lob = lobes(rnd, 0.06)
    base, top = slab(Ln * 0.5, H * 0.12, lob, G.scree, G.rockDk, seg=28, shelf=None, beach=None, dome=0.0,
                     sx=1.0, sy=0.52)
    deform(base, lambda p: Vector((p.x * math.cos(-0.1) - p.y * math.sin(-0.1),
                                   p.x * math.sin(-0.1) + p.y * math.cos(-0.1), p.z)))
    parts = [base]
    # the valley: a green strip with a river and woods, on the game's -Z side (Blender +Y)
    vy = Ln * 0.15
    parts.append(patch(blot(Ln * 0.42, rnd, 16, 0, vy, amp=0.06, sx=1.0, sy=0.16), top - 0.4, 1.4,
                       mixc(L(G.scree), L(G.forest), 0.55), bevel=0.6))
    rv = [(x, vy + 8 * math.sin(x * 0.012 + v)) for x in (Ln * (i / 10 - 0.5) * 0.86 for i in range(11))]
    parts.append(ribbon(rv, Ln * 0.028, top + 0.6, 1.4, G.river))
    for k in range(7):
        x = Ln * (rnd.random() - 0.5) * 0.8
        y = vy + (1 if k % 2 else -1) * Ln * rnd.uniform(0.03, 0.06)
        parts.append(pine(x, y, top, Ln * rnd.uniform(0.035, 0.05), G.forest, seg=6))
    ca, sa = math.cos(ang), math.sin(ang)
    big = []
    # the main chain
    for i in range(11):
        t = (i / 10 - 0.5) * Ln * 0.88
        off = (rnd.random() - 0.5) * Ln * 0.08 - Ln * 0.04
        hh = H * 0.86 * (0.6 + rnd.random() * 0.5) * (1.0 - 0.35 * (abs(t) / (Ln * 0.44)) ** 2)
        if i == 5:
            hh = H * 0.86 * 1.12
        rr = hh * (0.66 + rnd.random() * 0.22)
        x, y = ca * t - sa * off, sa * t + ca * off
        plob = lobes(rnd, 0.1)
        parts.append(peak(rr, hh, (x, y, top - 1.0), plob, rnd, seg=10, snow=0.62, rockc=G.rock, cap=G.snow,
                          dark=G.rockDk))
        if hh > H * 0.8:
            big.append((x, y, rr, hh, plob))
    # a lower ridge crossing it
    a2 = -0.42
    for i in range(5):
        t = (i / 4 - 0.5) * Ln * 0.6
        off = (rnd.random() - 0.5) * Ln * 0.06
        hh = H * 0.5 * (0.6 + rnd.random() * 0.5)
        rr = hh * 0.8
        x, y = math.cos(a2) * t - math.sin(a2) * off, math.sin(a2) * t + math.cos(a2) * off - Ln * 0.04
        parts.append(peak(rr, hh, (x, y, top - 1.0), lobes(rnd, 0.1), rnd, seg=8, snow=0.72, rockc=G.rockDk,
                          cap=G.ice))
    # glacier tongues down the tall peaks' valley side
    for (x, y, rr, hh, plob) in big[:3]:
        prof = [(rr, 0.0), (rr * 0.78, hh * 0.18), (rr * 0.52, hh * 0.46), (rr * 0.33, hh * 0.62)]
        g = drape(prof, plob, math.pi / 2 + rnd.uniform(-0.3, 0.3), hh * 0.6, hh * 0.08, rr * 0.16, rr * 0.3,
                  G.iceBlue, n=6, lift=0.2, thick=2.0)
        deform(g, lambda p, x=x, y=y: p + Vector((x, y, top - 1.0)))
        parts.append(g)
    return fit(parts, 'w_range', v)


# ---------------------------------------------------------------- dunes

def dune(path, hts, wid, color, lee=None):
    """One dune ridge swept along `path` [(x, y), ...]: a gentle windward slope
    (left of travel), a sharp crest, a steep lee face (right), heights `hts`
    per station. The lee face is painted a shade darker."""
    bm = bmesh.new()
    n = len(path)
    rows = []
    for i, (x, y) in enumerate(path):
        a = Vector(path[max(0, i - 1)])
        b = Vector(path[min(n - 1, i + 1)])
        t = (b - a).normalized()
        nx, ny = -t.y, t.x
        h, w = hts[i], wid[i]
        prof = [(w, 0.0), (w * 0.45, h * 0.62), (w * 0.05, h * 0.98), (-w * 0.12, h * 0.9), (-w * 0.5, 0.0)]
        rows.append([bm.verts.new((x + nx * o, y + ny * o, z)) for o, z in prof])
    for a, b in zip(rows, rows[1:]):
        for j in range(4):
            bm.faces.new((a[j], b[j], b[j + 1], a[j + 1]))
    bm.faces.new(rows[0])
    bm.faces.new(list(reversed(rows[-1])))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = _from_bmesh(bm, 'dune')
    paint(o, color)
    o = _smooth(o, 50)
    return o


@model('w_dunes', ao=0.35)
def w_dunes(v):
    """A sand sea: a disc of desert combed into long sharp-crested dunes, all
    by the same wind (v turns it, as in v1), a few dark rock outcrops and a
    palm-ringed oasis."""
    rnd = random.Random(1700 + v)
    R, H = 440.0, 140.0
    lob = lobes(rnd, 0.04)
    base, top = slab(R * 0.985, H * 0.2, lob, G.sand, G.sandDeep, seg=40, shelf=None, beach=None, dome=0.0,
                     rim=lt(G.sand, 0.1))
    parts = [base]
    ang = -(0.3 + v * 0.4)
    ca, sa = math.cos(ang), math.sin(ang)
    oasis = gz(R * 0.3, -R * 0.34)
    sandc, leec = lt(G.sand, 0.08), mixc(L(G.sand), L(G.sandDeep), 0.6)
    hcap = target('w_dunes', v)[2] - top
    for i in range(7):
        off = (i / 6 - 0.5) * R * 1.5 + rnd.uniform(-12, 12)
        span = R * 0.94 * math.sqrt(max(0.05, 1 - (off / (R * 0.92)) ** 2))
        if span < R * 0.2:
            continue
        hmax = hcap * (1.16 if i == 3 else rnd.uniform(0.6, 0.9)) * (0.55 + 0.45 * span / R)
        wmax = R * rnd.uniform(0.09, 0.12)
        path, hts, wid = [], [], []
        ph = rnd.uniform(0, 6.28)
        for k in range(9):
            t = k / 8
            s_ = (t - 0.5) * 2 * span * 0.95
            o2 = off + math.sin(t * 3.0 + ph) * R * 0.05
            x, y = ca * s_ - sa * o2, sa * s_ + ca * o2
            path.append((x, y))
            env = math.sin(math.pi * (0.06 + 0.88 * t)) ** 0.7
            hts.append(hmax * env * (0.85 + 0.15 * math.sin(t * 9 + ph)))
            wid.append(wmax * (0.5 + 0.5 * env))
        d = dune(path, hts, wid, G.sand)
        deform(d, lambda p: p + Vector((0, 0, top - 0.6)))
        mid = top + hmax * 0.2

        def col(c, n, mid=mid):
            side = n.x * (-sa) + n.y * ca     # + is the windward side (left of travel)
            if n.z < 0.97 and side < -0.05:
                return leec
            return lt(G.sand, 0.15) if n.z > 0.8 else sandc
        recolor(d, col)
        # keep dunes out of the oasis
        if min(math.hypot(px - oasis[0], py - oasis[1]) for px, py in path) < R * 0.12:
            deform(d, lambda p: Vector((p.x, p.y, top + (p.z - top) * (0.0 if math.hypot(p.x - oasis[0], p.y - oasis[1]) < R * 0.14 else 1.0))))
        parts.append(d)
    # rock outcrops
    for k in range(3):
        a = rnd.uniform(0, 6.28)
        d = R * rnd.uniform(0.35, 0.75)
        x, y = math.cos(a) * d, math.sin(a) * d
        if math.hypot(x - oasis[0], y - oasis[1]) < R * 0.2:
            x, y = -x, -y
        r = R * rnd.uniform(0.06, 0.085)
        h = H * rnd.uniform(0.28, 0.4)
        m = revolve([(r * 1.3, 0.0), (r * 1.1, h * 0.25), (r, h * 0.3), (r * 0.9, h * 0.95), (r * 0.8, h), (0.0, h)],
                    seg=10, color=G.rockDk, warp=lambda a_, rr, z, i, l=lobes(rnd, 0.14): (rr * l(a_), z), smooth=35)
        recolor(m, lambda c, n: lt(G.rockDk, 0.15) if n.z > 0.6 else None)
        deform(m, lambda p, x=x, y=y: p + Vector((x, y, top - 1.0)))
        parts.append(m)
    # the oasis: a pool, a green ring, palms
    parts.append(patch(blot(R * 0.15, rnd, 14, *oasis, amp=0.12), top - 0.6, 1.6, mixc(L(G.sand), L(G.jungle), 0.6),
                       bevel=0.6))
    parts.append(patch(blot(R * 0.09, rnd, 12, *oasis, amp=0.12), top - 0.3, 1.8, G.river, bevel=0.6))
    for k in range(6):
        a = k / 6 * 6.28 + rnd.uniform(-0.3, 0.3)
        x, y = oasis[0] + math.cos(a) * R * 0.12, oasis[1] + math.sin(a) * R * 0.12
        hh = R * rnd.uniform(0.06, 0.075)
        parts.append(cyl(hh * 0.07, hh, at=(x, y, top), color=C.woodDark, seg=6, bevel=0, r2=hh * 0.05))
        parts.append(puff(hh * 0.45, (x, y, top + hh * 0.8), G.jungle, seg=7, squash=0.6, flat=top + hh * 0.85))
    return fit(parts, 'w_dunes', v)


# ---------------------------------------------------------------- ice cap

def ridge_line(pts, hts, wid, color, smooth=40):
    """A rounded ridge swept along pts [(x, y, z0)]: pressure ridges, dykes."""
    bm = bmesh.new()
    n = len(pts)
    rows = []
    for i, (x, y, z0) in enumerate(pts):
        a = Vector(pts[max(0, i - 1)][:2])
        b = Vector(pts[min(n - 1, i + 1)][:2])
        t = (b - a).normalized()
        nx, ny = -t.y, t.x
        h, w = hts[i], wid[i]
        prof = [(w, -0.5), (w * 0.6, h * 0.7), (0.0, h), (-w * 0.6, h * 0.7), (-w, -0.5)]
        rows.append([bm.verts.new((x + nx * o, y + ny * o, z0 + z)) for o, z in prof])
    for a, b in zip(rows, rows[1:]):
        for j in range(4):
            bm.faces.new((a[j], b[j], b[j + 1], a[j + 1]))
    bm.faces.new(rows[0])
    bm.faces.new(list(reversed(rows[-1])))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = _from_bmesh(bm, 'ridge')
    paint(o, color)
    return _smooth(o, smooth)


@model('w_icecap', ao=0.5)
def w_icecap(v):
    """An ice cap: a lobed landmass of blue ice cliffs and a snow deck rising
    to a great dome, pressure ridges curving round it, crevasse lines and
    melt ponds; v>0 has dark rock nunataks breaking through near the edge."""
    rnd = random.Random(1800 + v)
    R, H = 430.0, 127.0
    lob = lobes(rnd, 0.09)
    fsx, fsy = footprint(R, lob, 'w_icecap', v)
    base, top = slab(R, H, lob, G.snow, mixc(L(G.iceBlue), L(G.shelf), 0.22), seg=40, shelf=G.shelf,
                     beach=G.ice, dome=0.0, rim=G.ice, sx=fsx, sy=fsy)
    parts = [base]
    # the dome
    dl = lobes(rnd, 0.06)
    DR, DH = R * 0.62, R * 0.36
    dome = revolve([(DR, 0.0), (DR * 0.8, DH * 0.32), (DR * 0.55, DH * 0.7), (DR * 0.3, DH * 0.92), (0.0, DH)],
                   seg=28, color=G.snow, warp=lambda a, r, z, i: (r * dl(a), z), smooth=60, cap_bottom=False)
    regrade(dome, lambda p: mixc(L(G.ice), L(G.snow), clamp01(p.z / (DH * 0.5))))
    deform(dome, lambda p: p + Vector((R * 0.04, -R * 0.02, top - 2.0)))
    parts.append(dome)
    # pressure ridges, curving round the dome
    for k in range(6):
        a0 = k / 6 * 6.28 + rnd.uniform(-0.3, 0.3)
        rad = R * rnd.uniform(0.66, 0.8)
        span = rnd.uniform(0.5, 0.8)
        pts, hts, wid = [], [], []
        for i in range(6):
            t = i / 5
            a = a0 + span * (t - 0.5)
            rr = rad * lob(a) * 0.98
            pts.append((math.cos(a) * rr, math.sin(a) * rr, top))
            env = math.sin(math.pi * (0.1 + 0.8 * t))
            hts.append(H * 0.1 * env + 1.0)
            wid.append(R * 0.035 * (0.5 + 0.5 * env))
        parts.append(ridge_line(pts, hts, wid, mixc(L(G.ice), L(G.iceBlue), 0.55)))
    # crevasse lines and melt ponds
    for k in range(5):
        a = rnd.uniform(0, 6.28)
        d = R * rnd.uniform(0.66, 0.82)
        cx, cy = math.cos(a) * d * lob(a), math.sin(a) * d * lob(a)
        t_ = rnd.uniform(0, 3.14)
        ln = R * rnd.uniform(0.08, 0.14)
        parts.append(ribbon([(cx - math.cos(t_) * ln, cy - math.sin(t_) * ln), (cx, cy),
                             (cx + math.cos(t_) * ln, cy + math.sin(t_) * ln)], R * 0.012, top - 0.3, 0.9,
                            G.iceBlue))
        a2 = a + 0.5
        px, py = math.cos(a2) * d * 0.95 * lob(a2), math.sin(a2) * d * 0.95 * lob(a2)
        parts.append(patch(blot(R * rnd.uniform(0.03, 0.05), rnd, 9, px, py, amp=0.18), top - 0.3, 1.0, G.shelf,
                           bevel=0.4))
    if v:
        for k in range(4):
            a = rnd.uniform(0, 6.28)
            d = R * 0.84 * lob(a)
            parts.append(peak(R * rnd.uniform(0.07, 0.09), H * rnd.uniform(0.4, 0.55),
                              (math.cos(a) * d, math.sin(a) * d, top - 2.0), lobes(rnd, 0.15), rnd, seg=9,
                              snow=0.78, rockc=G.rockDk, cap=G.snow))
    return fit(parts, 'w_icecap', v)


# ---------------------------------------------------------------- landmass family

LAND_PROF = [(1.13, 0.0), (1.13, 0.035), (1.05, 0.075), (1.0, 0.085), (0.995, 0.17), (0.98, 0.84),
             (0.955, 0.96), (0.91, 1.0), (0.55, 1.012), (0.22, 1.02)]


def land_band(zf, n_z, deck, cliff, shelf=G.shelf, beach=G.sand, rim=None):
    """The landmass colour bands, by a face's height as a fraction of the deck."""
    if zf < 0.08:
        return L(shelf)
    if zf < 0.17:
        return L(beach)
    if zf < 0.9:
        return L(cliff) if n_z < 0.5 else lt(cliff, 0.1)
    if zf < 0.99:
        return L(rim) if rim is not None else lt(deck, 0.12)
    return L(deck)


def loft(spine, radii, hts, prof, colfn, n_cap=6):
    """A landmass along a spine: every ring of `prof` [(k, z_frac)] is the
    spine's outline pushed out to k * radius, at z_frac * the station's height,
    with round caps at both ends. colfn(z_frac, normal_z) paints each band."""
    n = len(spine)
    tans, nls = [], []
    for i in range(n):
        a = Vector(spine[max(0, i - 1)])
        b = Vector(spine[min(n - 1, i + 1)])
        t = (b - a).normalized()
        tans.append(t)
        nls.append(Vector((-t.y, t.x)))

    def outline(k):
        pts = []
        for i in range(n):
            pts.append((Vector(spine[i]) + nls[i] * radii[i] * k, i))
        for j in range(1, n_cap):
            th = math.pi * j / n_cap
            d = nls[-1] * math.cos(th) + tans[-1] * math.sin(th)
            pts.append((Vector(spine[-1]) + d * radii[-1] * k, n - 1))
        for i in reversed(range(n)):
            pts.append((Vector(spine[i]) - nls[i] * radii[i] * k, i))
        for j in range(1, n_cap):
            th = math.pi * j / n_cap
            d = -nls[0] * math.cos(th) - tans[0] * math.sin(th)
            pts.append((Vector(spine[0]) + d * radii[0] * k, 0))
        return pts
    bm = bmesh.new()
    rings = []
    for k, zf in prof:
        rings.append([bm.verts.new((p.x, p.y, zf * hts[i])) for p, i in outline(k)])
    m = len(rings[0])
    bands = []
    for b_i, (a, b) in enumerate(zip(rings, rings[1:])):
        for j in range(m):
            bm.faces.new((a[j], a[(j + 1) % m], b[(j + 1) % m], b[j]))
            bands.append(b_i)
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])
    bands += [0, len(prof) - 2]
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = _from_bmesh(bm, 'loft')
    me = o.data
    attr = me.color_attributes.new('base', 'FLOAT_COLOR', 'CORNER')
    for poly in me.polygons:
        bi = bands[poly.index]
        zf = (prof[bi][1] + prof[min(bi + 1, len(prof) - 1)][1]) / 2
        if poly.index == len(bands) - 1:
            zf = prof[-1][1]
        c = colfn(zf, poly.normal.z)
        for li in poly.loop_indices:
            attr.data[li].color = (*c, 1.0)
    return _smooth(o, 38)


def chain(pts, h, w, z0, rnd, snow=0.62, rockc=G.rock, cap=G.snow, n_peaks=None):
    """A mountain chain as ONE swept mesh: a ridge along pts [(x, y)] whose
    crest saws up into peaks and down into saddles, tapering at both ends,
    with snow on the tall faces. A few dozen triangles for a whole range."""
    m = len(pts)
    hts, wid = [], []
    for i in range(m):
        t = i / (m - 1)
        env = math.sin(math.pi * (0.04 + 0.92 * t)) ** 0.6
        peakish = 1.0 if i % 2 else 0.58
        hts.append(h * env * peakish * rnd.uniform(0.85, 1.1))
        wid.append(w * (0.45 + 0.55 * env))
    bm = bmesh.new()
    rows = []
    for i, (x, y) in enumerate(pts):
        a = Vector(pts[max(0, i - 1)])
        b = Vector(pts[min(m - 1, i + 1)])
        t = (b - a).normalized()
        nx, ny = -t.y, t.x
        hh, ww = hts[i], wid[i]
        prof = [(ww, -1.0), (ww * 0.6, hh * 0.36), (ww * 0.26, hh * 0.7), (ww * 0.04, hh),
                (-ww * 0.26, hh * 0.7), (-ww * 0.6, hh * 0.36), (-ww, -1.0)]
        rows.append([bm.verts.new((x + nx * o, y + ny * o, z0 + z)) for o, z in prof])
    # snow on the upper two bands wherever the crest is high, rock below
    snowy = []
    for i, (a, b) in enumerate(zip(rows, rows[1:])):
        high = max(hts[i], hts[i + 1]) > h * snow
        for j in range(6):
            bm.faces.new((a[j], b[j], b[j + 1], a[j + 1]))
            snowy.append(high and j in (2, 3))
    bm.faces.new(rows[0])
    bm.faces.new(list(reversed(rows[-1])))
    snowy += [False, False]
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = _from_bmesh(bm, 'chain')
    paint(o, rockc)
    capc, rc, dkc = L(cap), L(rockc), dk(rockc, 0.18)
    me = o.data
    attr = me.color_attributes['base']
    for poly in me.polygons:
        c = capc if snowy[poly.index] else (dkc if poly.normal.z < 0.55 else rc)
        for li in poly.loop_indices:
            attr.data[li].color = (*c, 1.0)
    return _smooth(o, 30)


# ---------------------------------------------------------------- peninsula

@model('w_peninsula', ao=0.55)
def w_peninsula(v):
    """A long finger of land: a wide root at -X tapering to a tip, wandering
    with v as in v1, on a shelf with a beach; a spine of snowy peaks, a city
    near the root and a town toward the tip, woods on the rest."""
    rnd = random.Random(1900 + v)
    Ln, H = 1500.0, 190.0
    N = 20
    deck = G.plain if v % 2 else G.forest
    spine, radii, hts = [], [], []
    for i in range(N):
        t = i / (N - 1)
        spine.append((-Ln * 0.5 + t * Ln, -math.sin(t * 3.1 + v) * Ln * 0.11))
        radii.append(Ln * (0.185 - t * 0.11) * (1 + 0.11 * math.sin(t * 13 + v * 2) + 0.08 * math.sin(t * 31 + v)))
        hts.append(H * (0.62 + (1 - t) * 0.3) * 1.05)
    prof = SLAB_LITE[:-1] + [(0.3, 1.02)]
    land = loft(spine, radii, hts, prof, lambda zf, nz: land_band(zf, nz, deck, G.rockDk))
    parts = [land]

    def at(t, side=0.0):
        i = t * (N - 1)
        i0 = min(N - 2, int(i))
        f = i - i0
        x = spine[i0][0] + (spine[i0 + 1][0] - spine[i0][0]) * f
        y = spine[i0][1] + (spine[i0 + 1][1] - spine[i0][1]) * f
        r = radii[i0] + (radii[i0 + 1] - radii[i0]) * f
        h = hts[i0] + (hts[i0 + 1] - hts[i0]) * f
        tx, ty = spine[i0 + 1][0] - spine[i0][0], spine[i0 + 1][1] - spine[i0][1]
        d = math.hypot(tx, ty)
        return x - ty / d * r * side, y + tx / d * r * side, h * SLAB_LITE[-1][1], r
    # the spine of peaks
    for k in range(9):
        t = 0.1 + 0.78 * k / 8
        x, y, z, r = at(t, rnd.uniform(-0.12, 0.12))
        hh = (target('w_peninsula', v)[2] - z) * (1.0 if k == 2 else rnd.uniform(0.55, 0.85))
        parts.append(peak(hh * rnd.uniform(0.8, 1.0), hh, (x, y, z - 3.0), lobes(rnd, 0.1), rnd, seg=10,
                          snow=0.66, rockc=G.rock, cap=G.snow, dark=G.rockDk))
    # a city near the root and a town toward the tip, on the sheltered side
    x, y, z, r = at(1 / 7, 0.55)
    parts += town(rnd, x, y, z, Ln * 0.085, H * 0.16, 4, 0.42, C.cream)
    x, y, z, r = at(5 / 7, 0.5)
    parts += town(rnd, x, y, z, Ln * 0.055, H * 0.11, 3, 0.42, C.cream)
    # woods
    for k in range(9):
        t = rnd.uniform(0.05, 0.95)
        x, y, z, r = at(t, rnd.choice((-1, 1)) * rnd.uniform(0.45, 0.75))
        parts.append(puff(Ln * rnd.uniform(0.018, 0.026), (x, y, z), G.forest if k % 3 else G.forestDk, seg=8,
                          squash=0.85, flat=z - 0.5))
    return fit(parts, 'w_peninsula', v)


# ---------------------------------------------------------------- the big four

def nation(pid, v, seed, R, H, lobes_n, cities, blobs, trees, ranges, ice, desert, biome, seg=36, city_cols=3):
    """A country, a subcontinent or a continent: the same toy drawing at four
    sizes, as in v1. A lobed slab with a shelf and a beach, biome colour
    masses on the deck, a desert and an ice field where v1 has them, an inland
    sea, mountain chains, rivers, cities and a few woods."""
    rnd = random.Random(seed)
    lob = lobes(rnd, 0.11, k=(lobes_n, lobes_n + 2, 2))
    prof = [(1.13, 0.0), (1.13, 0.035), (1.0, 0.085), (0.995, 0.17), (0.975, 0.88), (0.93, 0.985), (0.88, 1.0),
            (0.0, 1.0)]

    fsx, fsy = footprint(R, lob, pid, v)
    lob0 = lob

    def lob(a):
        # the outline after the footprint scale, as a radius factor at angle a
        c, s_ = math.cos(a), math.sin(a)
        b = math.atan2(s_ / fsy, c / fsx)
        return lob0(b) * math.hypot(math.cos(b) * fsx, math.sin(b) * fsy)

    def warp(a, r, z, i):
        return r * lob0(a), z
    land = revolve([(r * R, z * H) for r, z in prof], seg=seg, color=biome[0], warp=warp, smooth=38)
    deform(land, lambda p: Vector((p.x * fsx, p.y * fsy, p.z)))
    recolor(land, lambda c, n: land_band(c.z / H, n.z, biome[0], G.rockDk))
    top = H
    parts = [land]
    lift = H * 0.006

    def inside(x, y, k=0.86):
        a = math.atan2(y, x)
        rmax = R * k * lob(a)
        d = math.hypot(x, y)
        if d <= rmax:
            return x, y
        return x * rmax / d, y * rmax / d

    def blob_on(r, cx, cy, layer, color, n=12, amp=0.18):
        poly = [inside(x, y) for x, y in blot(r, rnd, n, cx, cy, amp=amp)]
        return prism(poly, lift * 2.2, at=(0, 0, top - lift * 1.5 + layer * lift), color=color, bevel=0.0,
                     smooth=30)
    layer = 1
    for i in range(blobs):
        a = rnd.uniform(0, 6.28)
        d = R * 0.6 * math.sqrt(rnd.random())
        parts.append(blob_on(R * rnd.uniform(0.16, 0.3), math.cos(a) * d, math.sin(a) * d, layer,
                             biome[1 + (i % (len(biome) - 1))]))
        layer += 1
    if desert:
        parts.append(blob_on(R * 0.38, *gz(R * 0.22, -R * 0.2), layer, G.sand, n=14, amp=0.14))
        layer += 1
    if ice:
        parts.append(blob_on(R * 0.42, *gz(-R * 0.3, -R * 0.44), layer, G.snow, n=14, amp=0.14))
        parts.append(blob_on(R * 0.2, *gz(-R * 0.36, -R * 0.5), layer + 1.5, G.ice, n=10))
        layer += 3
    # the inland sea
    sx, sy = gz(-R * 0.3, R * 0.3)
    parts.append(blob_on(R * 0.21, sx, sy, layer, G.shelf, n=14, amp=0.12))
    parts.append(blob_on(R * 0.15, sx, sy, layer + 1.5, G.river, n=12, amp=0.12))
    layer += 3
    # rivers, wandering to the coast
    for i in range(2):
        a = rnd.uniform(0, 6.28)
        pts = []
        for k in range(8):
            t = k / 7
            d = R * (0.12 + 0.82 * t)
            aa = a + 0.25 * math.sin(t * 5 + i * 2)
            pts.append(inside(math.cos(aa) * d, math.sin(aa) * d, 0.9))
        parts.append(ribbon(pts, R * 0.03, top - lift, lift * 2 + layer * lift, G.river,
                            taper=lambda t: 0.6 + 0.6 * t))
    zt = top + (layer + 2) * lift
    # mountain chains, reaching the catalogue height
    want_h = target(pid, v)[2]
    for i in range(ranges):
        a = rnd.uniform(0, 6.28)
        d = R * rnd.uniform(0.2, 0.5)
        cx, cy = math.cos(a) * d, math.sin(a) * d
        ang = rnd.uniform(0, 3.14)
        ln = R * rnd.uniform(0.7, 1.0)
        pts = [inside(cx + math.cos(ang) * ln * (k / 8 - 0.5) + math.sin(k) * R * 0.03,
                      cy + math.sin(ang) * ln * (k / 8 - 0.5), 0.8) for k in range(9)]
        hh = (want_h - top) * (1.0 if i == 0 else rnd.uniform(0.6, 0.85))
        parts.append(chain(pts, hh, R * 0.13, top - lift, rnd))
    # cities on the flat
    for i in range(cities):
        for _ in range(20):
            a = rnd.uniform(0, 6.28)
            d = R * rnd.uniform(0.15, 0.62) * lob(a)
            x, y = math.cos(a) * d, math.sin(a) * d
            if math.hypot(x - sx, y - sy) > R * 0.26:
                break
        parts += town(rnd, x, y, zt, R * 0.13, H * 0.16, city_cols, 0.42, G.urban, skip=0.3, pad_bev=False)
    for i in range(trees):
        a = rnd.uniform(0, 6.28)
        d = R * 0.8 * math.sqrt(rnd.random()) * lob(a)
        x, y = math.cos(a) * d, math.sin(a) * d
        parts.append(puff(R * rnd.uniform(0.035, 0.055), (x, y, zt), G.forest if i % 2 else G.forestDk, seg=7,
                          squash=0.85, flat=zt - lift))
    return fit(parts, pid, v)


@model('w_country_small', ao=0.55)
def w_country_small(v):
    return nation('w_country_small', v, 2000 + v, 480.0, 280.0, 5, 2, 3, 9, 1, False, v == 1,
                  [[G.plain, G.forest, G.steppe, G.jungle][v], G.forest, G.plainDry], seg=40, city_cols=4)


@model('w_country_large', ao=0.55)
def w_country_large(v):
    return nation('w_country_large', v, 2100 + v, 630.0, 360.0, 6, 4, 5, 9, 2, v == 2, v != 1,
                  [[G.plain, G.steppe, G.forest][v], G.forest, G.plainDry, G.jungle], seg=40)


@model('w_subcontinent', ao=0.55)
def w_subcontinent(v):
    return nation('w_subcontinent', v, 2200 + v, 800.0, 455.0, 6, 6, 7, 8, 3, v == 0, True,
                  [[G.plain, G.jungle, G.steppe][v], G.forest, G.plainDry, G.steppe], seg=36)


@model('w_continent', ao=0.55)
def w_continent(v):
    return nation('w_continent', v, 2300 + v, 740.0, 429.0, 7, 8, 9, 2, 4, True, True,
                  [[G.plain, G.forest, G.steppe][v], G.forest, G.plainDry, G.jungle, G.steppe], seg=30)


# ---------------------------------------------------------------- at sea

def sweep(points, radii, n=8, color=0xcccccc, cap0=True, cap1=True, smooth=60):
    """A tube through `points` with a radius per point (scenery.py's)."""
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
        rings.append([bm.verts.new(p + (u * math.cos(2 * math.pi * j / n) + w * math.sin(2 * math.pi * j / n)) * radii[i])
                      for j in range(n)])
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


def frond(base, az, length, width, col, droop=0.9, rise=0.35, n=5):
    """A palm frond (scenery.py's): rising, arching down, folded on its rib."""
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


def palm(x, y, z, h, rnd, lean=(0.0, 0.0), fronds=5, crown=G.jungle):
    """A toy palm: a leaning, tapering trunk and a star of arching fronds."""
    pts, radii = [], []
    for i in range(5):
        t = i / 4
        pts.append((x + lean[0] * h * t * t, y + lean[1] * h * t * t, z + t * h))
        radii.append(h * (0.055 - 0.02 * t))
    parts = [sweep(pts, radii, n=6, color=C.woodDark, smooth=60)]
    top = pts[-1]
    leaf = L(crown)
    for i in range(fronds):
        az = 2 * math.pi * i / fronds + rnd.uniform(-0.2, 0.2)
        col = leaf if i % 2 else lt(crown, 0.18)
        parts.append(frond(top, az, h * rnd.uniform(0.52, 0.62), h * 0.17, col, droop=0.9, rise=0.4, n=4))
    return parts


SLAB_LITE = [(1.13, 0.0), (1.13, 0.035), (1.0, 0.085), (0.995, 0.2), (0.97, 0.86), (0.9, 1.0), (0.0, 1.02)]


def islet(R, H, lob, at, deck, seg=16, cliff=G.rockDk, beach=G.sand, rim=G.sand):
    """A small island: the landmass slab with fewer rings, for chains of them."""
    o = revolve([(r * R, z * H) for r, z in SLAB_LITE], seg=seg, color=deck, warp=lambda a, r, z, i: (r * lob(a), z),
                smooth=38)
    recolor(o, lambda c, n: land_band(c.z / H, n.z, deck, cliff, beach=beach, rim=rim))
    deform(o, lambda p: p + Vector(at))
    return o


@model('w_atoll', ao=0.45)
def w_atoll(v):
    """A coral atoll: a pale shelf, a white surf crest, a ring of sand cays
    round a turquoise lagoon (gapped at v==2, as in v1) and 3+v palms."""
    rnd = random.Random(2400 + v)
    R = 19.0
    lob = lobes(rnd, 0.04)
    prof = [(1.1, 0.0), (1.1, 0.3), (1.04, 0.75), (0.99, 1.0), (0.9, 1.08), (0.8, 1.0), (0.74, 0.8), (0.5, 0.75),
            (0.0, 0.75)]
    base = revolve([(r * R, z) for r, z in prof], seg=36, color=G.lagoon, warp=lambda a, r, z, i: (r * lob(a), z),
                   smooth=50)

    def col(c, n):
        rr = math.hypot(c.x, c.y) / (R * lob(math.atan2(c.y, c.x)))
        if rr > 1.02:
            return L(G.shelf)
        if rr > 0.86:
            return L(G.surf)
        return lt(G.lagoon, 0.12) if rr > 0.62 else L(G.lagoon)
    recolor(base, col)
    parts = [base]
    N = 10
    cays = []
    for i in range(N):
        if v == 2 and i % 4 == 3:
            continue
        a = (i / N) * 2 * math.pi + rnd.uniform(-0.08, 0.08)
        span = (2 * math.pi / N) * rnd.uniform(0.55, 0.7)
        pts, hts, wid = [], [], []
        for k in range(5):
            t = k / 4
            aa = a + span * (t - 0.5)
            rr = R * 0.9 * lob(aa)
            pts.append((math.cos(aa) * rr, math.sin(aa) * rr, 0.85))
            env = math.sin(math.pi * (0.12 + 0.76 * t))
            hts.append(1.9 * env + 0.3)
            wid.append(R * 0.15 * (0.55 + 0.45 * env))
        cay = ridge_line(pts, hts, wid, G.sand, smooth=60)
        recolor(cay, lambda c, n: lt(G.sand, 0.15) if n.z > 0.85 else None)
        parts.append(cay)
        cays.append(a)
    for i in range(3 + v):
        a = cays[(i * 3 + 1) % len(cays)] + rnd.uniform(-0.1, 0.1)
        rr = R * 0.9 * lob(a)
        x, y = math.cos(a) * rr, math.sin(a) * rr
        parts += palm(x, y, 1.6, rnd.uniform(5.8, 6.6), rnd, lean=(math.cos(a) * 0.18, math.sin(a) * 0.18), fronds=6)
    return fit(parts, 'w_atoll', v)


@model('w_island', ao=0.5)
def w_island(v):
    """A small island: a lobed slab with a sandy shoulder on a pale shelf, a
    rocky peak (snow-capped at v==3, as in v1), woods or palms, and a
    red-roofed cottage at v<2."""
    rnd = random.Random(2500 + v)
    R, H = 24.0, 12.5
    deck = [G.jungle, G.forest, G.plain, G.sand][v]
    lob = lobes(rnd, 0.12, k=(3, 5))
    fsx, fsy = footprint(R, lob, 'w_island', v)
    base, top = slab(R, H, lob, deck, G.rockDk, seg=32, rim=G.sand, dome=0.0, sx=fsx, sy=fsy)
    parts = [base]
    pk = gz(-R * 0.08, R * 0.05)
    hh = target('w_island', v)[2] - top + 0.5
    parts.append(peak(R * 0.42, hh, (pk[0], pk[1], top - 0.5), lobes(rnd, 0.12), rnd, seg=14,
                      snow=0.7, rockc=G.rock, cap=(G.snow if v == 3 else None), foot=deck, dark=G.rockDk))
    # the cottage, on the flat
    hx, hy = gz(R * 0.42, -R * 0.2)
    if v < 2:
        parts.append(box((4.4, 4.4, 2.0), at=(hx, hy, top - 0.1), color=C.cream, bevel=0.25, seg=1))
        roof = prism([(-2.6, 0.0), (2.6, 0.0), (0.0, 1.7)], 5.0, at=(hx, hy + 2.5, top + 1.9), color=C.roofRed,
                     bevel=0.15, seg=1, rot=(90, 0, 0))
        parts.append(roof)
    # trees: palms on the jungle and sand isles, round woods on the others
    spots = []
    for k in range(40):
        if len(spots) >= 5:
            break
        a = rnd.uniform(0, 6.28)
        d = R * rnd.uniform(0.4, 0.78) * lob(a)
        x, y = math.cos(a) * d * fsx, math.sin(a) * d * fsy
        if math.hypot(x - pk[0], y - pk[1]) < R * 0.42 or math.hypot(x - hx, y - hy) < 5.5:
            continue
        if any(math.hypot(x - sx_, y - sy_) < 5 for sx_, sy_ in spots):
            continue
        spots.append((x, y))
    for i, (x, y) in enumerate(spots):
        if v in (0, 3):
            parts += palm(x, y, top - 0.2, rnd.uniform(5.5, 7.0), rnd, lean=(x / R * 0.2, y / R * 0.2), fronds=5)
        else:
            parts.append(puff(rnd.uniform(2.2, 2.9), (x, y, top), G.jungle if i % 2 else G.forest, seg=9, squash=0.95,
                              flat=top - 0.2))
    return fit(parts, 'w_island', v)


@model('w_iceberg', ao=0.45)
def w_iceberg(v):
    """An iceberg: a chunky faceted floe with blue-white cliffs, a snow top
    and a leaning spire (taller with v, as in v1), in a ring of pale water."""
    rnd = random.Random(2600 + v)
    R, H = 66.0, 52.0
    parts = [patch(blot(R * 1.14, rnd, 16, amp=0.06), 0.0, 1.6, G.iceBlue, bevel=0.5)]
    # (create_icosphere's subdivisions=1 is the bare icosahedron: 3 is 320 faces, 2 is 80)
    # a tabular berg: the faceted body sliced flat on top, so it reads as a
    # cliff-sided slab of ice with a broken spire standing on it
    body = rock(1.0, (0, 0, 0), G.snow, sub=3, scale=(R * 0.98, R * 0.9, H * 0.9), seed=2600 + v, cuts=10,
                depth=0.22)
    deform(body, lambda p: Vector((p.x, p.y, min(H * 0.5, max(0.0, p.z + H * 0.1)))))
    body = _smooth(body, 30)
    parts.append(body)
    # broken pillars of ice standing on the slab, the tallest reaching the
    # catalogue height (v1's peak grows with v; its random blocks set the rest)
    want = target('w_iceberg', v)[2]
    zb = H * 0.5 - 2.0
    for k in range(4):
        a = k / 4 * 6.28 + rnd.uniform(-0.4, 0.4)
        d = R * (0.1 if k == 0 else rnd.uniform(0.42, 0.52))
        cx, cy = math.cos(a) * d, math.sin(a) * d
        rr = R * (0.4 if k == 0 else rnd.uniform(0.24, 0.3))
        hh = (want - zb) * (1.0 if k == 0 else rnd.uniform(0.35, 0.6))
        n = rnd.choice((5, 6, 7))
        poly = [(cx + rr * rnd.uniform(0.75, 1.1) * math.cos(2 * math.pi * i / n + a),
                 cy + rr * rnd.uniform(0.75, 1.1) * math.sin(2 * math.pi * i / n + a)) for i in range(n)]
        pil = prism(poly, hh, at=(0, 0, zb), color=G.snow, bevel=rr * 0.12, seg=1, smooth=30)
        # a broken, sloping top and a slight lean
        tx, ty = rnd.uniform(-1, 1), rnd.uniform(-1, 1)
        deform(pil, lambda p, cx=cx, cy=cy, rr=rr, hh=hh, tx=tx, ty=ty: Vector((
            p.x + (p.z - zb) / hh * rr * 0.12 * tx, p.y + (p.z - zb) / hh * rr * 0.12 * ty,
            p.z if p.z < zb + hh * 0.6 else p.z - ((p.x - cx) * tx + (p.y - cy) * ty) / rr * hh * 0.12 - hh * 0.12)))
        parts.append(pil)
    snow, ice = L(G.snow), L(G.ice)
    blue, deep = mixc(L(G.iceBlue), L(G.shelf), 0.25), mixc(L(G.iceBlue), L(G.shelf), 0.55)
    for o in parts[1:]:
        recolor(o, lambda c, n: deep if c.z < 5.0 else (blue if n.z < 0.4 else (L(G.iceBlue) if n.z < 0.8 else snow)))
    return fit(parts, 'w_iceberg', v)


@model('w_isles', ao=0.5)
def w_isles(v):
    """An island chain on a long turquoise reef: six small islands wandering
    along X (phase v, as in v1), rocky peaks on every other one, jungle."""
    rnd = random.Random(2700 + v)
    Ln, N = 600.0, 6
    reef = prism(blot(Ln * 0.53, rnd, 24, amp=0.04, sx=1.0, sy=0.33), 2.4, at=(0, 0, 0), color=G.lagoon, bevel=0.9,
                 seg=1, rot=(0, 0, -math.degrees(0.04)))
    recolor(reef, lambda c, n: lt(G.lagoon, 0.12) if n.z > 0.6 else None)
    parts = [reef]
    for i in range(N):
        t = (i / (N - 1) - 0.5) * Ln
        y = -math.sin(t / Ln * 3.4 + v) * Ln * 0.16
        R = Ln * rnd.uniform(0.055, 0.1)
        H = R * rnd.uniform(0.38, 0.52)
        deck = G.jungle if rnd.random() < 0.5 else G.forest
        lob = lobes(rnd, 0.12, k=(3, 5))
        parts.append(islet(R, H, lob, (t, y, 1.8), deck, seg=16))
        top = 1.8 + H * 1.0
        if i % 2 == 0:
            hh = (target('w_isles', v)[2] - top + 1.0) * (1.0 if i == 2 else 0.8)
            parts.append(peak(R * 0.68, hh, (t + R * 0.1, y, top - 1.0), lobes(rnd, 0.12), rnd, seg=10,
                              snow=0.72, rockc=G.rock, cap=None, foot=deck, dark=G.rockDk))
        for k in range(2 if i % 2 == 0 else 3):
            a = rnd.uniform(0, 6.28) if i % 2 else rnd.uniform(2.0, 4.3)
            d = R * rnd.uniform(0.4, 0.62) * lob(a)
            parts.append(puff(R * 0.2, (t + math.cos(a) * d, y + math.sin(a) * d, top), G.jungle if k % 2 else G.forest,
                              seg=8, squash=0.9, flat=top - 0.3))
    return fit(parts, 'w_isles', v)
