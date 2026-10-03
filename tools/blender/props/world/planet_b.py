"""World-stage props, modelled: the bigger half of the ladder, from a mountain
range to the planet itself.

Frame reminder (see kit.py): Blender Z is up, X is the prop's width, and the
game's FRONT (+Z) is Blender -Y. v1 lays everything out in its own (x, z)
plane; here that is Blender (x, -y), so v1's `z` is negated on the way in.

These are geography seen from very far above, so they are modelled as a toy
relief globe would show them: chunky landforms with soft bevelled edges, a
few big flat colour masses, settlements and forests as clusters of little
lumps. Sizes are world units (treated as metres) and every model is `fit()` to
its catalogue box at the end, except the planet, which is scaled uniformly so
it stays round.

The world stage brings its own landscape palette (G in src/world/props/
world.js), which palette.json does not carry, so it is copied below.
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


TAU = math.pi * 2

# the world stage's landscape palette, copied from src/world/props/world.js
G = dict(
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
)
G = type('G', (), G)


# ---------------------------------------------------------------- colour

def L(col):
    return lin(col) if isinstance(col, int) else col


def dk(col, t=0.2):
    return mixc(L(col), (0, 0, 0), t)


def lt(col, t=0.4):
    return mixc(L(col), (1, 1, 1), t)


def clamp01(x):
    return 0.0 if x < 0 else (1.0 if x > 1 else x)


# ---------------------------------------------------------------- fitting

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


def fit(parts, pid, v, uniform=False):
    """Scale the prop about its footprint centre and its floor so its box is
    the catalogue box (per axis; or one scale, the geometric mean, so a round
    thing stays round)."""
    lo, hi = bounds(parts)
    want = target(pid, v)
    cx, cy = (lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2
    k = [want[i] / max(1e-9, hi[i] - lo[i]) for i in range(3)]
    if uniform:
        g = (k[0] * k[1] * k[2]) ** (1 / 3)
        k = [g, g, g]
    for o in parts:
        for vt in o.data.vertices:
            p = vt.co
            vt.co = Vector(((p.x - cx) * k[0], (p.y - cy) * k[1], (p.z - lo[2]) * k[2]))
        o.data.update()
    return parts


# ---------------------------------------------------------------- noise

class Noise:
    """Smooth 2D value noise as a sum of a few randomly turned sine waves:
    cheap, seeded, and band-limited so it never makes a spike."""

    def __init__(self, seed, scale=1.0, octaves=4):
        rnd = random.Random(seed)
        self.w = []
        for o in range(octaves):
            for _ in range(2):
                a = rnd.uniform(0, TAU)
                f = (1.7 ** o) / scale
                self.w.append((math.cos(a) * f, math.sin(a) * f, rnd.uniform(0, TAU), 0.55 ** o))
        self.n = sum(w[3] for w in self.w)

    def __call__(self, x, y):
        return sum(m * math.sin(kx * x + ky * y + p) for kx, ky, p, m in self.w) / self.n


# ---------------------------------------------------------------- outlines

def radial(R, harm=(), n=32, cx=0.0, cy=0.0, sx=1.0, sy=1.0):
    """A closed outline r(a) = R (1 + sum A cos(k a + p)), counter-clockwise."""
    pts = []
    for i in range(n):
        a = TAU * i / n
        r = R * (1 + sum(A * math.cos(k * a + p) for k, A, p in harm))
        pts.append((cx + r * sx * math.cos(a), cy + r * sy * math.sin(a)))
    return pts


def rfun(R, harm=()):
    return lambda a: R * (1 + sum(A * math.cos(k * a + p) for k, A, p in harm))


def arc_path(rad, a0, a1, n, cx=0.0, cy=0.0, wob=None):
    """Points along a circular arc in the XY plane (radians), optionally
    wobbled radially by wob(t)."""
    pts = []
    for i in range(n):
        t = i / (n - 1)
        a = a0 + (a1 - a0) * t
        r = rad * (1 + (wob(t) if wob else 0.0))
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


def frames(path):
    """Unit tangent and left normal at every point of a 2D polyline."""
    out = []
    for i in range(len(path)):
        a = path[max(0, i - 1)]
        b = path[min(len(path) - 1, i + 1)]
        dx, dy = b[0] - a[0], b[1] - a[1]
        d = math.hypot(dx, dy) or 1.0
        out.append(((dx / d, dy / d), (-dy / d, dx / d)))
    return out


def band(path, wfn, cap=5):
    """A closed outline round a 2D polyline, half-width wfn(t), with round
    ends: a peninsula, a shelf, an island arc."""
    fr = frames(path)
    n = len(path)
    left, right = [], []
    for i, (p, (tg, nm)) in enumerate(zip(path, fr)):
        w = wfn(i / (n - 1))
        left.append((p[0] + nm[0] * w, p[1] + nm[1] * w))
        right.append((p[0] - nm[0] * w, p[1] - nm[1] * w))
    out = list(right)
    # round cap at the far end
    (tg, nm), p, w = fr[-1], path[-1], wfn(1.0)
    for k in range(1, cap):
        a = -math.pi / 2 + math.pi * k / cap
        out.append((p[0] + (tg[0] * math.cos(a) + nm[0] * math.sin(a)) * w,
                    p[1] + (tg[1] * math.cos(a) + nm[1] * math.sin(a)) * w))
    out += list(reversed(left))
    (tg, nm), p, w = fr[0], path[0], wfn(0.0)
    for k in range(1, cap):
        a = math.pi / 2 + math.pi * k / cap
        out.append((p[0] + (tg[0] * math.cos(a) + nm[0] * math.sin(a)) * w,
                    p[1] + (tg[1] * math.cos(a) + nm[1] * math.sin(a)) * w))
    return out


def area2(poly):
    return sum(poly[i][0] * poly[(i + 1) % len(poly)][1] - poly[(i + 1) % len(poly)][0] * poly[i][1]
               for i in range(len(poly)))


def ccw(poly):
    return poly if area2(poly) > 0 else list(reversed(poly))


def offset(poly, d):
    """Move a CCW outline outward by d (inward if negative), mitred and
    clamped so tight corners do not shoot off."""
    n = len(poly)
    out = []
    for i in range(n):
        p0, p1, p2 = poly[i - 1], poly[i], poly[(i + 1) % n]
        e0 = (p1[0] - p0[0], p1[1] - p0[1])
        e1 = (p2[0] - p1[0], p2[1] - p1[1])
        l0 = math.hypot(*e0) or 1.0
        l1 = math.hypot(*e1) or 1.0
        n0 = (e0[1] / l0, -e0[0] / l0)
        n1 = (e1[1] / l1, -e1[0] / l1)
        bx, by = n0[0] + n1[0], n0[1] + n1[1]
        bl = math.hypot(bx, by) or 1.0
        bx, by = bx / bl, by / bl
        c = max(0.5, bx * n1[0] + by * n1[1])
        out.append((p1[0] + bx * d / c, p1[1] + by * d / c))
    return out


def inside(poly, x, y):
    c = False
    n = len(poly)
    for i in range(n):
        x0, y0 = poly[i]
        x1, y1 = poly[(i + 1) % n]
        if (y0 > y) != (y1 > y) and x < x0 + (y - y0) * (x1 - x0) / (y1 - y0):
            c = not c
    return c


# ---------------------------------------------------------------- solids

def upright(bm):
    """An open surface (no bottom) has no inside for recalc to find: make
    sure it faces up."""
    tot = 0.0
    for f in bm.faces:
        f.normal_update()
        tot += f.normal.z * f.calc_area()
    if tot < 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces)


def slab(poly, h, z0=0.0, color=0xcccccc, bevel=None, bottom=True, smooth=40, top_fn=None, rings=None):
    """A flat outline extruded to a slab with a soft bevel round its TOP edge
    only (what sits on the ground or in the sea needs none). `top_fn(x, y)`
    lifts the top surface for a gently domed deck; `rings` adds concentric
    rings on the deck so the dome and the baked AO have vertices to land on."""
    poly = ccw(poly)
    if bevel is None:
        bevel = h * 0.3
    bm = bmesh.new()
    tz = (lambda x, y: z0 + h + (top_fn(x, y) if top_fn else 0.0))
    loops = []
    # wall bottom, wall top (below bevel), bevel middle, deck edge
    for d, kind in ((0.0, 'b'), (0.0, 'w'), (-bevel * 0.32, 'm'), (-bevel, 't')):
        ring = offset(poly, d) if d else poly
        lp = []
        for (x, y) in ring:
            if kind == 'b':
                z = z0
            elif kind == 'w':
                z = tz(x, y) - bevel * 0.9
            elif kind == 'm':
                z = tz(x, y) - bevel * 0.2
            else:
                z = tz(x, y)
            lp.append(bm.verts.new((x, y, z)))
        loops.append(lp)
    n = len(poly)
    # concentric inner rings: shrink toward the centroid
    if rings:
        cx = sum(p[0] for p in poly) / n
        cy = sum(p[1] for p in poly) / n
        base = offset(poly, -bevel)
        for k in range(rings):
            f = 1 - (k + 1) / (rings + 1)
            lp = []
            for (x, y) in base:
                px, py = cx + (x - cx) * f, cy + (y - cy) * f
                lp.append(bm.verts.new((px, py, tz(px, py))))
            loops.append(lp)
    for a, b in zip(loops, loops[1:]):
        for j in range(n):
            bm.faces.new((a[j], a[(j + 1) % n], b[(j + 1) % n], b[j]))
    bm.faces.new(loops[-1])
    if bottom:
        bm.faces.new(list(reversed(loops[0])))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if not bottom:
        upright(bm)
    o = _from_bmesh(bm, 'slab')
    paint(o, color)
    return _smooth(o, smooth)


def revolve(prof, seg=24, color=0xcccccc, warp=None, smooth=50, cap_bottom=True, cap_top=True, phase=0.0):
    """A lathe whose rings may wobble: prof is [(r, z), ...] bottom to top, and
    warp(angle, r, z, ring_index) -> (r, z) moves each ring vertex. A ring of
    radius 0 is a single pole vertex. (From props/scenery.)"""
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


def blob(r, at, color, seg=8, rings=None, scale=(1, 1, 1), rot=(0, 0, 0), flat=None):
    """A low sphere (lathed, so the ring count is free): canopy lumps, cloud
    puffs. `flat` clamps everything below that height onto it."""
    rings = rings or max(3, seg // 2)
    prof = [(r * math.sin(math.pi * i / rings), -r * math.cos(math.pi * i / rings)) for i in range(rings + 1)]
    o = revolve(prof, seg=seg, color=color, smooth=80)
    m = Euler(tuple(math.radians(a) for a in rot), 'XYZ').to_matrix()
    deform(o, lambda p: m @ Vector((p.x * scale[0], p.y * scale[1], p.z * scale[2])) + Vector(at))
    if flat is not None:
        deform(o, lambda p: Vector((p.x, p.y, max(p.z, flat))))
    return o


def peak(R, H, at, cols, seed=0, seg=10, snow=0.66, lobe=0.1, lean=(0.0, 0.0), foot=0.16, bottom=False):
    """A toy mountain: a chunky lobed cone in bands — a foot, rock, and a cap
    whose lower edge drips — lit a shade paler on its sunny faces. `cols` =
    (foot, rock, cap); None skips that band."""
    rnd = random.Random(seed)
    q1, q2, q3 = rnd.uniform(0, TAU), rnd.uniform(0, TAU), rnd.uniform(0, TAU)

    def lob(a):
        return 1 + lobe * math.cos(3 * a + q1) + lobe * 0.6 * math.cos(5 * a + q2)

    def wave(a):
        return H * (0.06 * math.sin(4 * a + q3) + 0.035 * math.sin(7 * a + q1))

    prof = [(R, 0.0), (R * 0.84, H * foot), (R * 0.6, H * 0.4), (R * 0.37, H * snow), (R * 0.15, H * 0.88), (0.0, H)]

    def warp(a, r, z, i):
        if i == 3:
            z += wave(a)
        if i == 1:
            z += wave(a + 1.0) * 0.5
        return r * lob(a), z
    o = revolve(prof, seg=seg, color=cols[1], warp=warp, smooth=42, cap_bottom=bottom)
    fc, rk, cap = cols
    rkL = L(rk)

    def col(c, n):
        a = math.atan2(c.y, c.x)
        if fc is not None and c.z < H * foot + wave(a + 1.0) * 0.5 - H * 0.02:
            return L(fc)
        if cap is not None and c.z > H * snow + wave(a) - H * 0.03:
            return L(cap)
        return lt(rkL, 0.14) if (n.x * 0.55 - n.y * 0.45) > 0.25 else rkL
    recolor(o, col)
    deform(o, lambda p: Vector((p.x + at[0] + lean[0] * p.z, p.y + at[1] + lean[1] * p.z, p.z + at[2])))
    return o


def ridge(path, wfn, hfn, cols=7, color=0x888888, smooth=45, noise=None, nz=0.0, bottom=True):
    """A mountain chain as one surface: stations along `path` (2D), columns
    across it out to half-width wfn(t), height hfn(t, s) with s in -1..1 (zero
    on the crest). The rim sits on z=0 and a bottom face closes it. `noise`
    (x, y) adds a little relief scaled by nz."""
    fr = frames(path)
    n = len(path)
    bm = bmesh.new()
    grid = []
    for i, (p, (tg, nm)) in enumerate(zip(path, fr)):
        t = i / (n - 1)
        w = wfn(t)
        row = []
        for j in range(cols):
            s = -1 + 2 * j / (cols - 1)
            x, y = p[0] + nm[0] * s * w, p[1] + nm[1] * s * w
            z = hfn(t, s)
            if noise is not None and 0 < j < cols - 1 and 0 < i < n - 1:
                z = max(0.0, z + nz * noise(x, y) * (1 - abs(s)))
            if j == 0 or j == cols - 1 or i == 0 or i == n - 1:
                z = 0.0
            row.append(bm.verts.new((x, y, z)))
        grid.append(row)
    for i in range(n - 1):
        for j in range(cols - 1):
            a, b, c, d = grid[i][j], grid[i][j + 1], grid[i + 1][j + 1], grid[i + 1][j]
            # split each quad along its shorter diagonal-in-height so crests stay crisp
            if abs(a.co.z - c.co.z) > abs(b.co.z - d.co.z):
                bm.faces.new((a, b, d))
                bm.faces.new((b, c, d))
            else:
                bm.faces.new((a, b, c))
                bm.faces.new((a, c, d))
    rim = [grid[i][0] for i in range(n)] + [grid[n - 1][j] for j in range(1, cols)] + \
          [grid[i][cols - 1] for i in range(n - 2, -1, -1)] + [grid[0][j] for j in range(cols - 2, 0, -1)]
    if bottom:
        try:
            bm.faces.new(list(reversed(rim)))
        except ValueError:
            pass
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if not bottom:
        upright(bm)
    o = _from_bmesh(bm, 'ridge')
    paint(o, color)
    return _smooth(o, smooth)


def field(Rfn, hfn, rings=10, seg=32, z0=0.0, color=0xcccccc, bevel=None, cx=0.0, cy=0.0, smooth=45,
          tpow=1.0):
    """A disc of terrain: the outline r(a) = Rfn(a) round (cx, cy), a top
    surface at height hfn(x, y), a soft rounded lip and a straight skirt down
    to z0, closed underneath. The landforms' workhorse."""
    bm = bmesh.new()
    loops = []
    centre = bm.verts.new((cx, cy, hfn(cx, cy)))
    for k in range(1, rings + 1):
        t = (k / rings) ** tpow
        lp = []
        for j in range(seg):
            a = TAU * j / seg
            r = Rfn(a) * t
            x, y = cx + r * math.cos(a), cy + r * math.sin(a)
            lp.append(bm.verts.new((x, y, hfn(x, y))))
        loops.append(lp)
    # the lip: a little out and down, then the skirt
    if bevel is None:
        bevel = 0.04 * max(Rfn(a) for a in [TAU * j / seg for j in range(seg)])
    for d_out, d_dn in ((bevel * 0.45, bevel * 0.25), (bevel * 0.7, bevel * 0.85), (bevel * 0.7, None)):
        lp = []
        for j in range(seg):
            a = TAU * j / seg
            r = Rfn(a) + d_out
            x, y = cx + r * math.cos(a), cy + r * math.sin(a)
            r0 = Rfn(a)
            ex, ey = cx + r0 * math.cos(a), cy + r0 * math.sin(a)
            z = z0 if d_dn is None else max(z0, hfn(ex, ey) - d_dn)
            lp.append(bm.verts.new((x, y, z)))
        loops.append(lp)
    for j in range(seg):
        bm.faces.new((centre, loops[0][j], loops[0][(j + 1) % seg]))
    for a, b in zip(loops, loops[1:]):
        for j in range(seg):
            bm.faces.new((a[j], a[(j + 1) % seg], b[(j + 1) % seg], b[j]))
    bm.faces.new(list(reversed(loops[-1])))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = _from_bmesh(bm, 'field')
    paint(o, color)
    return _smooth(o, smooth)


def ribbon(path, wfn, zfn, color, t=None, smooth=40):
    """A flat band draped along a 2D path at height zfn(x, y) — a river, a
    wadi, a road of ice — with short walls down into whatever it lies on so
    it never floats or flickers."""
    fr = frames(path)
    n = len(path)
    bm = bmesh.new()
    rows = []
    for i, (p, (tg, nm)) in enumerate(zip(path, fr)):
        w = wfn(i / (n - 1))
        z = zfn(p[0], p[1])
        dz = t if t is not None else w * 0.6
        L_ = (p[0] + nm[0] * w, p[1] + nm[1] * w)
        R_ = (p[0] - nm[0] * w, p[1] - nm[1] * w)
        rows.append((bm.verts.new((*L_, z - dz)), bm.verts.new((*L_, z)),
                     bm.verts.new((*R_, z)), bm.verts.new((*R_, z - dz))))
    for a, b in zip(rows, rows[1:]):
        for k in range(3):
            bm.faces.new((a[k], a[k + 1], b[k + 1], b[k]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    # recalc can flip an open strip: make sure the top faces point up
    for f in bm.faces:
        f.normal_update()
    tops = [f for f in bm.faces if abs(f.normal.z) > 0.5]
    if tops and sum(f.normal.z for f in tops) < 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces)
    o = _from_bmesh(bm, 'ribbon')
    paint(o, color)
    return _smooth(o, smooth)


def puff(r, at, color, under=None, n=3, rnd=None, seg=10, squash=0.55):
    """A toy cloud: one lump and a couple of smaller ones, flat underneath and
    a shade darker there."""
    rnd = rnd or random.Random(1)
    x, y, z = at
    parts = [blob(r, (x, y, z), color, seg=seg, rings=4, scale=(1.25, 1.0, squash), flat=z - r * squash * 0.3)]
    for k in range(n - 1):
        a = rnd.uniform(0, TAU)
        rr = r * rnd.uniform(0.55, 0.72)
        parts.append(blob(rr, (x + math.cos(a) * r * 0.75, y + math.sin(a) * r * 0.6, z), color, seg=max(8, seg - 2),
                          rings=4, scale=(1.2, 1.0, squash * 1.1), flat=z - r * squash * 0.3))
    if under is not None:
        top = L(color)
        u = L(under)
        for o in parts:
            paint(o, top, lambda p: mixc(u, top, clamp01((p.z - (z - r * squash * 0.3)) / (r * squash * 0.9))))
    return parts


def union_r(circles, cx=0.0, cy=0.0, wob=None):
    """r(a) of the outline of a union of circles [(x, y, r), ...] seen from
    (cx, cy): the furthest hit of a ray at angle a. Star-shaped unions only
    (a peanut of two lakes, a lobed landmass). `wob(a)` scales it."""
    def f(a):
        dx, dy = math.cos(a), math.sin(a)
        best = 0.0
        for (x, y, r) in circles:
            ox, oy = x - cx, y - cy
            b = dx * ox + dy * oy
            disc = b * b - (ox * ox + oy * oy - r * r)
            if disc >= 0:
                best = max(best, b + math.sqrt(disc))
        return best * (1 + (wob(a) if wob else 0.0))
    return f


def rim(rin, rout, topfn, seg=40, a0=0.0, a1=TAU, cx=0.0, cy=0.0, z0=0.0, bevel=None, color=0xcccccc,
        mid=1, smooth=40):
    """A shore: the solid ring between rin(a) and rout(a) round (cx, cy), its
    top at topfn(x, y, f) — f runs 0 at the outer edge to 1 at the inner, so
    a shore can climb from the plain to a crest over the water — both top
    edges softly bevelled and the inner wall running down to z0 so water can
    sit inside it. A partial sweep (a1 - a0 under a full turn) leaves a gap
    for a strait and closes its ends. `mid` rings across the top."""
    full = (a1 - a0) >= TAU - 1e-6
    n = seg if full else seg + 1
    bm = bmesh.new()
    rings = []
    for i in range(n):
        a = a0 + (a1 - a0) * i / seg
        ca, sa = math.cos(a), math.sin(a)
        ri, ro = rin(a), rout(a)
        b = bevel if bevel is not None else (ro - ri) * 0.12

        def P(r, dz, top=True):
            x, y = cx + ca * r, cy + sa * r
            f = clamp01((ro - r) / max(1e-9, ro - ri))
            return (x, y, (topfn(x, y, f) + dz) if top else dz)
        sec = [P(ro, z0, False), P(ro, -b * 0.9), P(ro - b * 0.32, -b * 0.2), P(ro - b, 0.0)]
        for k in range(mid):
            f = (k + 1) / (mid + 1)
            sec.append(P(ro - b - (ro - ri - 2 * b) * f, 0.0))
        sec += [P(ri + b, 0.0), P(ri + b * 0.32, -b * 0.2), P(ri, -b * 0.9), P(ri, z0, False)]
        rings.append([bm.verts.new(q) for q in sec])
    m = len(rings[0])
    for i in range(n if full else n - 1):
        A, B = rings[i], rings[(i + 1) % n]
        for j in range(m):
            bm.faces.new((A[j], A[(j + 1) % m], B[(j + 1) % m], B[j]))
    if not full:
        bm.faces.new(rings[0])
        bm.faces.new(list(reversed(rings[-1])))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = _from_bmesh(bm, 'rim')
    paint(o, color)
    return _smooth(o, smooth)


def polar(rfn, n=32, cx=0.0, cy=0.0, k=1.0, d=0.0):
    """Sample r(a) into a CCW outline, scaled by k and grown by d."""
    return [(cx + (rfn(TAU * i / n) * k + d) * math.cos(TAU * i / n),
             cy + (rfn(TAU * i / n) * k + d) * math.sin(TAU * i / n)) for i in range(n)]


def lerp(a, b, t):
    return a + (b - a) * t


def smooth01(t):
    t = clamp01(t)
    return t * t * (3 - 2 * t)


# ================================================================ the ranges

@model('wd_range', ao=0.55)
def wd_range(v):
    """An arc of chunky snow-capped peaks on a green plinth: lower dark peaks
    with ice on the inside of the bend, tarns at their feet, scree foothills
    and forest on the outside, where the rain falls."""
    rnd = random.Random(500 + v)
    rad, H = 0.89, 1.11
    sweep = 3.0 + v * 0.2
    a0, a1 = -sweep / 2, sweep / 2
    parts = []
    # a two-step plinth: green lowland outside, a scree terrace inside
    wob = lambda t: 0.03 * math.sin(t * 7 + v)
    outer = slab(band(arc_path(rad * 1.2, a0, a1, 14, wob=wob), lambda t: rad * (0.34 + 0.05 * math.sin(t * 9 + v)),
                      cap=4), H * 0.08, color=G.land, bevel=H * 0.035)
    inner = slab(band(arc_path(rad * 0.82, a0 + 0.05, a1 - 0.05, 14, wob=wob), lambda t: rad * 0.3, cap=4),
                 H * 0.12, color=G.scree, bevel=H * 0.04, bottom=False)
    for o in (outer, inner):
        recolor(o, lambda c, n: L(G.rockDk) if c.z < H * 0.05 and n.z < 0.5 else None)
    parts += [outer, inner]

    def at_arc(f, t, z=0.0, jit=0.0):
        a = a0 + (a1 - a0) * t
        d = rad * f * (1 + rnd.uniform(-jit, jit))
        return (math.cos(a) * d, math.sin(a) * d, z)

    # the main chain, tallest in the middle
    n = 8
    for i in range(n):
        t = 0.06 + 0.88 * i / (n - 1) + rnd.uniform(-0.02, 0.02)
        hh = H * (0.62 + 0.38 * math.sin(math.pi * t) ** 0.6) * rnd.uniform(0.86, 1.0)
        parts.append(peak(hh * rnd.uniform(0.52, 0.6), hh, at_arc(1.0, t, H * 0.06, 0.04),
                          (G.rockDk, G.rock, G.snow), seed=v * 31 + i, seg=9, snow=0.6))
    # the inner chain: lower, darker, with ice on the tips
    for i in range(6):
        t = 0.12 + 0.76 * i / 5 + rnd.uniform(-0.03, 0.03)
        hh = H * rnd.uniform(0.38, 0.5)
        parts.append(peak(hh * 0.62, hh, at_arc(0.74, t, H * 0.06, 0.04), (None, G.rockDk, G.ice),
                          seed=v * 31 + 50 + i, seg=7, snow=0.68))
    # scree foothills on the outer flank
    for i in range(6):
        t = 0.08 + 0.84 * i / 5 + rnd.uniform(-0.03, 0.03)
        hh = H * rnd.uniform(0.24, 0.32)
        parts.append(peak(hh * 0.85, hh, at_arc(1.3, t, H * 0.06, 0.04), (G.forest, G.scree, None),
                          seed=v * 31 + 80 + i, seg=7, foot=0.3))
    # tarns at the foot of the inner chain
    for i in range(4):
        x, y, _ = at_arc(0.6, 0.16 + 0.68 * i / 3, jit=0.03)
        parts.append(slab(radial(rad * 0.08, ((2, 0.18, i * 1.3),), n=10, cx=x, cy=y), H * 0.025,
                          z0=H * 0.115, color=G.lake, bevel=H * 0.01, bottom=False))
    # forest along the outside
    for i in range(7):
        x, y, _ = at_arc(1.46, 0.06 + 0.88 * i / 6, jit=0.02)
        parts.append(blob(rad * rnd.uniform(0.09, 0.11), (x, y, H * 0.1), G.forestDk if i % 2 else G.forest,
                          seg=7, rings=3, scale=(1, 1, 0.9), flat=H * 0.09))
    return fit(parts, 'wd_range', v)


# ================================================================ water

def isle(x, y, r, z, h, rnd, rock=G.rockDk, top=G.forest, beach=None, seg=10):
    """A little island standing in water whose surface is at z: a rock with a
    flat green top and a lump of forest on it."""
    out = [slab(radial(r, ((2, 0.12, rnd.uniform(0, TAU)), (3, 0.06, rnd.uniform(0, TAU))), n=seg, cx=x, cy=y),
                h, z0=z - h * 0.5, color=rock, bevel=h * 0.3, bottom=False)]
    recolor(out[0], lambda c, n: L(top) if n.z > 0.6 else None)
    out.append(blob(r * 0.55, (x + r * 0.1, y, z + h * 0.5), top if top != G.forest else G.forestDk, seg=7, rings=3,
                    scale=(1, 1, 0.8), flat=z + h * 0.45))
    if beach is not None:
        out.append(slab(radial(r * 1.25, (), n=seg, cx=x, cy=y), h * 0.12, z0=z - h * 0.05, color=beach,
                        bevel=h * 0.05, bottom=False))
    return out


@model('wd_greatlake', ao=0.55)
def wd_greatlake(v):
    """Two great basins joined by a strait, ringed by green shore with granite
    crags and forest on its crests; islands, a peninsula reaching in, and the
    outflow river leaving through the one gap in the ring."""
    rnd = random.Random(600 + v)
    R, H = 1.46, 1.12
    nz = Noise(60 + v, scale=R * 0.5)
    ox, oy = R * 0.86, R * 0.62
    rw = union_r([(0, 0, R * 0.74), (ox, oy, R * 0.44)], cx=R * 0.32, cy=R * 0.22,
                 wob=lambda a: 0.06 * math.sin(3 * a + v * 2) + 0.04 * math.sin(5 * a + 1 + v))
    ro = lambda a: rw(a) + R * (0.34 + 0.08 * math.sin(4 * a + v))
    surf = H * 0.38
    top = lambda x, y, f: H * (0.1 + 0.5 * smooth01(f * 1.25) + 0.24 * nz(x, y) * f)
    gap = math.radians(160 - v * 25)
    shore = rim(rw, ro, top, seg=32, a0=gap + 0.16, a1=gap + TAU - 0.16, cx=R * 0.32, cy=R * 0.22,
                bevel=R * 0.05, color=G.land, mid=3)

    def shore_col(c, n):
        a = math.atan2(c.y - R * 0.22, c.x - R * 0.32)
        r = math.hypot(c.x - R * 0.32, c.y - R * 0.22)
        if r < rw(a) + R * 0.04:
            return L(G.granite)          # the cliff down to the water
        if c.z < H * 0.06:
            return dk(G.land, 0.25) if n.z < 0.3 else lt(G.land, 0.1)
        return L(G.forestDk) if c.z > H * 0.64 else (lt(G.land, 0.1) if c.z < H * 0.25 else L(G.land))
    recolor(shore, shore_col)
    parts = [shore]
    # granite crags and forest along the crest
    cxs, cys = R * 0.32, R * 0.22
    for i in range(14):
        a = gap + 0.4 + (TAU - 0.8) * (i + rnd.uniform(0.2, 0.8)) / 14
        r = rw(a) + R * 0.1
        x, y = cxs + math.cos(a) * r, cys + math.sin(a) * r
        z = top(x, y, 0.75)
        if i % 4 == 0:
            parts.append(peak(R * 0.07, H * 0.16, (x, y, z - H * 0.04), (None, G.granite, None), seed=v * 9 + i, seg=7,
                              lobe=0.15))
        else:
            parts.append(blob(R * 0.075, (x, y, z), G.forestDk if i % 2 else G.forest, seg=7, rings=3,
                              scale=(1, 1, 0.8), flat=z - H * 0.03))
    water = slab(polar(rw, n=36, cx=R * 0.32, cy=R * 0.22, d=R * 0.05), surf, color=G.lake, bevel=H * 0.02)
    parts.append(water)
    # deeper water in the middle of each basin
    for (x, y, r) in ((0, 0, R * 0.42), (ox, oy, R * 0.22)):
        parts.append(slab(radial(r, ((3, 0.08, v + x),), n=14, cx=x, cy=y), H * 0.012, z0=surf - H * 0.002,
                          color=G.oceanDeep, bevel=H * 0.006, bottom=False))
    # islands
    for i in range(4):
        a = v + i * TAU / 4 + rnd.uniform(-0.4, 0.4)
        d = R * rnd.uniform(0.2, 0.5)
        parts += isle(math.cos(a) * d, math.sin(a) * d, R * rnd.uniform(0.06, 0.085), surf, H * 0.14, rnd, seg=8)
    # the peninsula reaching in from the south shore
    pen = [(-R * 0.02, -R * 0.9), (-R * 0.16, -R * 0.58), (-R * 0.38, -R * 0.38), (-R * 0.58, -R * 0.26)]
    pn = slab(band(pen, lambda t: R * (0.14 - 0.06 * t), cap=4), H * 0.5, color=G.land, bevel=H * 0.1)
    recolor(pn, lambda c, n: L(G.granite) if n.z < 0.55 else None)
    parts.append(pn)
    parts.append(slab(band(pen[1:], lambda t: R * (0.16 - 0.06 * t), cap=3), H * 0.06, z0=surf - H * 0.03,
                      color=G.sand, bevel=H * 0.03, bottom=False))
    for k in range(3):
        x, y = pen[k + 1]
        parts.append(blob(R * 0.07, (x, y, H * 0.52), G.forestDk if k % 2 else G.forest, seg=7, rings=3,
                          scale=(1, 1, 0.8), flat=H * 0.5))
    # the outflow, through the gap and away down to the plain
    ca, sa = math.cos(gap), math.sin(gap)
    cx, cy = R * 0.32, R * 0.22
    r0 = rw(gap)
    pts = [(cx + ca * r0 * f - sa * R * 0.05 * math.sin(f * 7), cy + sa * r0 * f + ca * R * 0.05 * math.sin(f * 7))
           for f in (0.85, 1.0, 1.15, 1.3, 1.45, 1.6)]
    parts.append(ribbon(pts, lambda t: R * (0.07 - 0.02 * t),
                        lambda x, y: surf + H * 0.01 - H * 0.3 * clamp01((math.hypot(x - cx, y - cy) - r0) / (R * 0.5)),
                        G.river, t=H * 0.3))
    return fit(parts, 'wd_greatlake', v)


# ================================================================ forests and sands

def seg_dist(px, py, path):
    """Distance from (px, py) to a 2D polyline, and the parameter t (0..1)
    along it of the nearest point."""
    best, bt = 1e18, 0.0
    n = len(path)
    for i in range(n - 1):
        ax, ay = path[i]
        bx, by = path[i + 1]
        dx, dy = bx - ax, by - ay
        ll = dx * dx + dy * dy or 1e-12
        u = clamp01(((px - ax) * dx + (py - ay) * dy) / ll)
        qx, qy = ax + dx * u, ay + dy * u
        d = (px - qx) ** 2 + (py - qy) ** 2
        if d < best:
            best, bt = d, (i + u) / (n - 1)
    return math.sqrt(best), bt


def meander(x0, x1, amp, k, ph, n=24, y0=0.0):
    return [(x0 + (x1 - x0) * i / (n - 1),
             y0 + amp * math.sin((x0 + (x1 - x0) * i / (n - 1)) * k + ph)) for i in range(n)]


@model('wd_rainforest', ao=0.55)
def wd_rainforest(v):
    """A disc of jungle packed with round crowns, a great river meandering
    through it in a valley of its own with abandoned oxbow lakes beside it,
    and the clouds the forest makes floating over the top."""
    rnd = random.Random(700 + v)
    R, H = 2.19, 1.57
    nz = Noise(70 + v, scale=R * 0.25, octaves=3)
    ph = v * 1.1
    lob = rfun(R, ((3, 0.05, v), (5, 0.035, 2 * v + 1)))
    river = [p for p in meander(-R * 1.1, R * 1.1, R * 0.4, 2.6 / R, ph, n=30)
             if math.hypot(*p) < lob(math.atan2(p[1], p[0])) * 0.985]
    floor = H * 0.2

    def h(x, y):
        d, _ = seg_dist(x, y, river)
        canopy = H * (0.36 + 0.06 * nz(x, y))
        k = smooth01((d - R * 0.07) / (R * 0.14))
        return floor + (canopy - floor) * k
    ground = field(lob, h, rings=8, seg=36, color=G.jungle, bevel=R * 0.05)
    top, mid, low = lt(G.jungle, 0.1), L(G.jungle), L(G.jungleDk)

    def grade(p):
        if p.z < floor + H * 0.04:
            return dk(G.jungleDk, 0.1)
        t = clamp01((p.z - H * 0.28) / (H * 0.14))
        return mixc(low, mid, t)
    paint(ground, mid, grade)
    recolor(ground, lambda c, n: dk(G.jungleDk, 0.3) if n.z < 0.25 and c.z < floor else None)
    parts = [ground]
    parts.append(ribbon(river, lambda t: R * 0.055, lambda x, y: floor + H * 0.012, G.river, t=H * 0.05))
    # oxbow lakes the river left behind, on the outside of its bends
    for i, xb in enumerate((-0.6, 0.0, 0.6)):
        x = R * xb
        y = R * 0.4 * math.sin(x * 2.6 / R + ph)
        s = 1 if y > 0 else -1
        arc = [(x + R * 0.15 * math.cos(a), y + s * R * 0.16 + s * R * 0.1 * math.sin(a))
               for a in [math.pi * (0.05 + 0.9 * k / 7) for k in range(8)]]
        parts.append(ribbon(arc, lambda t: R * 0.03, lambda x_, y_: h(x_, y_) + H * 0.012, G.lake, t=H * 0.14))
    # the canopy: round crowns packed over everything but the valley
    placed = []
    tries = 0
    while len(placed) < 22 and tries < 600:
        tries += 1
        a = rnd.uniform(0, TAU)
        d = R * 0.92 * math.sqrt(rnd.uniform(0.0, 1))
        x, y = math.cos(a) * d, math.sin(a) * d
        r = R * rnd.uniform(0.13, 0.19)
        if d + r * 0.6 > lob(a):
            continue
        if seg_dist(x, y, river)[0] < R * 0.12 + r * 0.8:
            continue
        if any(math.hypot(x - px, y - py) < (r + pr) * 0.72 for px, py, pr in placed):
            continue
        placed.append((x, y, r))
    for k, (x, y, r) in enumerate(placed):
        c = [L(G.jungle), L(G.forest), lt(G.jungle, 0.08), L(G.jungle)][k % 4]
        z = h(x, y)
        b = blob(r, (x, y, z + r * 0.15), c, seg=8, rings=3, scale=(1, 1, 0.95), flat=z - r * 0.2)
        paint(b, c, lambda p, c=c, z=z, r=r: mixc(dk(c, 0.35), c, clamp01((p.z - z) / (r * 0.6))))
        parts.append(b)
    # the clouds it makes
    for i in range(3):
        a = v + i * TAU / 3 + rnd.uniform(-0.3, 0.3)
        d = R * rnd.uniform(0.35, 0.55)
        parts += puff(R * rnd.uniform(0.22, 0.27), (math.cos(a) * d, math.sin(a) * d, H * rnd.uniform(1.0, 1.15)),
                      G.cloud, under=G.cloudGrey, n=3, rnd=rnd, seg=10)
    return fit(parts, 'wd_rainforest', v)


# ================================================================ weather

def flat_tube(pts, wfn, hfn, n=8, color=0xffffff, smooth=70):
    """A tube along 3D points whose section is an ellipse wfn(t) wide and
    hfn(t) tall, kept upright (its up stays world Z): cloud bands, spiral
    arms, ice tongues. The ends close on a point, so a band tapers off."""
    pts = [Vector(p) for p in pts]
    m = len(pts)
    bm = bmesh.new()
    rings = []
    for i, p in enumerate(pts):
        t = i / (m - 1)
        tg = (pts[min(m - 1, i + 1)] - pts[max(0, i - 1)])
        tg.z = 0
        tg.normalize()
        side = Vector((tg.y, -tg.x, 0.0))
        w, h = wfn(t), hfn(t)
        rings.append([bm.verts.new(p + side * math.cos(TAU * j / n) * w + Vector((0, 0, math.sin(TAU * j / n) * h)))
                      for j in range(n)])
    for a, b in zip(rings, rings[1:]):
        for j in range(n):
            bm.faces.new((a[j], a[(j + 1) % n], b[(j + 1) % n], b[j]))
    for ring, p, sgn in ((rings[0], pts[0], -1), (rings[-1], pts[-1], 1)):
        tip = (pts[1] - pts[0]) if sgn < 0 else (pts[-1] - pts[-2])
        tip.normalize()
        c = bm.verts.new(p + tip * sgn * wfn(0.0 if sgn < 0 else 1.0) * 0.6)
        for j in range(n):
            bm.faces.new((ring[j], ring[(j + 1) % n], c))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = _from_bmesh(bm, 'ftube')
    paint(o, color)
    return _smooth(o, smooth)


def disc(r, h, at=(0, 0, 0), color=0xcccccc, seg=10, sx=1.0, sy=1.0, rot=0.0):
    """A thin unbevelled disc (an ellipse with sx/sy): surf, salt, a pond."""
    o = cyl(r, h, at=(0, 0, 0), color=color, seg=seg, bevel=0)
    ca, sa = math.cos(rot), math.sin(rot)
    deform(o, lambda p: Vector((at[0] + ca * p.x * sx - sa * p.y * sy, at[1] + sa * p.x * sx + ca * p.y * sy,
                                at[2] + p.z)))
    return o


@model('wd_storm', ao=0.4)
def wd_storm(v):
    """A cyclone seen from above: a tall ring of eyewall round a clear eye
    with the dark sea in it, lumpy spiral bands of cloud wheeling out from
    it, and grey curtains of rain hanging under the bands."""
    rnd = random.Random(800 + v)
    R, H = 3.33, 1.2
    arms = 3 + v
    white, grey = L(G.cloud), L(G.cloudGrey)
    parts = []
    # the eye: dark sea, ringed by surf
    parts.append(slab(radial(R * 0.17, (), n=16), H * 0.03, color=G.oceanDeep, bevel=H * 0.012))
    parts.append(disc(R * 0.24, H * 0.012, color=G.surf, seg=16))
    # the eyewall: a steep inner face, a rounded top, a long outer slope
    wall = revolve([(R * 0.32, 0.0), (R * 0.2, H * 0.08), (R * 0.17, H * 0.5), (R * 0.19, H * 0.74),
                    (R * 0.25, H * 0.84), (R * 0.33, H * 0.78), (R * 0.41, H * 0.52), (R * 0.43, H * 0.3),
                    (R * 0.38, H * 0.12), (R * 0.32, 0.0)],
                   seg=20, color=G.cloud, smooth=60, cap_bottom=False, cap_top=False,
                   warp=lambda a, r, z, i: (r * (1 + 0.06 * math.sin(5 * a + v)), z * (1 + 0.07 * math.sin(4 * a))))
    paint(wall, white, lambda p: mixc(grey, white, clamp01((p.z - H * 0.2) / (H * 0.45))))
    parts.append(wall)
    turns = 2.7
    for k in range(arms):
        ph = k * TAU / arms + v * 0.4
        pts = []
        for i in range(13):
            t = i / 12
            th = ph + t * turns
            r = R * (0.32 + 0.66 * t)
            pts.append((math.cos(th) * r, math.sin(th) * r, H * (0.46 - 0.22 * t)))
        lump = lambda t: 1 + 0.18 * math.sin(t * 26 + k)
        arm = flat_tube(pts, lambda t: R * (0.1 + 0.07 * t) * (1 - 0.7 * t ** 4) * lump(t),
                        lambda t: H * (0.26 - 0.15 * t) * lump(t + 0.1), n=8, color=G.cloud)
        paint(arm, white, lambda p: mixc(grey, white, clamp01((p.z - H * 0.14) / (H * 0.3)) *
                                         (1 - 0.5 * clamp01((math.hypot(p.x, p.y) / R - 0.6) * 2.5))))
        parts.append(arm)
        # a towering lump on each band, and rain hanging under it
        t = 0.3
        th, r = ph + t * turns, R * (0.32 + 0.66 * t)
        x, y = math.cos(th) * r, math.sin(th) * r
        parts.append(blob(R * 0.12, (x, y, H * 0.5), G.cloud, seg=8, rings=4, scale=(1.2, 1.0, 0.85)))
        for t in (0.55, 0.8):
            th, r = ph + t * turns + 0.1, R * (0.32 + 0.66 * t)
            x, y = math.cos(th) * r, math.sin(th) * r
            parts.append(cyl(R * 0.045, H * (0.36 - 0.22 * t), at=(x, y, 0.0), color=G.rain, seg=8, bevel=0,
                             r2=R * 0.07))
        parts.append(disc(R * 0.09, H * 0.01, at=(x, y, 0), color=G.surf, seg=10, sx=1.4, rot=th))
    return fit(parts, 'wd_storm', v)


def drape(o, hfn):
    """Lift every vertex of a part by the ground height under it."""
    return deform(o, lambda p: Vector((p.x, p.y, p.z + hfn(p.x, p.y))))


def dune_line(cx, cy, ang, length, width, height, hfn, keep_out=(), seed=0, min_len=None, **kw):
    """Dunes along one line, broken where it would bury something in
    `keep_out` [(x, y, r), ...]: an oasis, a star dune, an outcrop."""
    ca, sa = math.cos(ang), math.sin(ang)
    n = 40
    ok = []
    for i in range(n + 1):
        t = i / n - 0.5
        x, y = cx + ca * t * length, cy + sa * t * length
        ok.append(all(math.hypot(x - kx, y - ky) > kr + width * 0.35 for kx, ky, kr in keep_out))
    out, start = [], None
    for i, good in enumerate(ok + [False]):
        if good and start is None:
            start = i
        elif not good and start is not None:
            t0, t1 = start / n - 0.5, (i - 1) / n - 0.5
            ln = (t1 - t0) * length
            if ln > (min_len or width * 1.6):
                tm = (t0 + t1) / 2
                out.append(dune(cx + ca * tm * length, cy + sa * tm * length, ang, ln, width, height, hfn,
                                seed=seed + i, **kw))
            start = None
    return out


def dune(cx, cy, ang, length, width, height, hfn, curve=0.12, seed=0, stations=10, color=None, cols=5):
    """A transverse dune ridge: a long windward back, a short steep slip face
    on the lee, a crest that wanders, tapering out at both ends; draped over
    the ground beneath it. The wind blows along +normal of `ang`."""
    rnd = random.Random(seed)
    ph = rnd.uniform(0, TAU)
    ca, sa = math.cos(ang), math.sin(ang)
    path = []
    for i in range(stations):
        t = i / (stations - 1) - 0.5
        off = curve * length * (1 - 4 * t * t) + width * 0.25 * math.sin(t * 7 + ph)
        path.append((cx + ca * t * length - sa * off, cy + sa * t * length + ca * off))

    def prof(t, s):
        e = math.sin(math.pi * t) ** 0.7
        if s < 0:
            return height * e * (1 + s) ** 1.1
        return height * e * (1 - s) ** 0.8
    o = ridge(path, lambda t: width * (0.5 + 0.5 * math.sin(math.pi * t) ** 0.5), prof, cols=cols,
              color=color or G.sand, smooth=50, bottom=False)
    sand, lee, crest = lt(G.sand, 0.06), mixc(L(G.sand), L(G.sandDeep), 0.5), lt(G.sand, 0.25)
    nrm = Vector((-sa, ca, 0))
    recolor(o, lambda c, n: lee if Vector((n.x, n.y, 0)).dot(nrm) < -0.25 else (crest if n.z > 0.9 and c.z > height * 0.6 else sand))
    return drape(o, hfn)


@model('wd_dunesea', ao=0.5)
def wd_dunesea(v):
    """A disc of sand sea on a stratified plinth: fat dune ridges all combed
    the same way by one wind, star dunes where two winds meet, flat-topped
    rock outcrops, a dry wadi and one oasis of palms."""
    rnd = random.Random(900 + v)
    R, H = 3.84, 2.37
    nz = Noise(90 + v, scale=R * 0.5, octaves=2)
    lob = rfun(R, ((3, 0.04, v), (5, 0.03, 1 + v), (2, 0.03, 2 * v)))
    base = H * 0.4
    hf = lambda x, y: base + H * 0.03 * nz(x, y)
    ground = field(lob, hf, rings=3, seg=32, color=G.sand, bevel=R * 0.04)
    strata = [L(G.sandDeep), mixc(L(G.sandDeep), L(G.rock), 0.3), L(G.sandDeep), dk(G.sandDeep, 0.12)]
    recolor(ground, lambda c, n: strata[min(3, int(c.z / (base * 0.26)))] if n.z < 0.6 else None)
    parts = [ground]
    ang = 0.5 + v * 0.6
    ca, sa = math.cos(ang), math.sin(ang)
    ox, oy = R * 0.3, -R * 0.3
    stars, rocks = [], []
    for i in range(3):
        a = v + i * TAU / 3 + 0.5
        d = R * rnd.uniform(0.3, 0.5)
        stars.append((math.cos(a) * d, math.sin(a) * d, R * 0.14))
    for i in range(3):
        a = v * 2 + i * TAU / 3 + rnd.uniform(-0.3, 0.3)
        d = R * rnd.uniform(0.6, 0.75)
        rocks.append((math.cos(a) * d, math.sin(a) * d, R * rnd.uniform(0.08, 0.11)))
    keep = [(ox, oy, R * 0.15)] + [(x, y, r * 0.8) for x, y, r in stars]
    for i in range(6):
        off = (i / 5 - 0.5) * R * 1.45 + rnd.uniform(-0.04, 0.04) * R
        chord = 2 * math.sqrt(max(0.0, (R * 0.88) ** 2 - off * off))
        if chord < R * 0.5:
            continue
        parts += dune_line(-sa * off, ca * off, ang, chord * 0.92, R * 0.2, H * rnd.uniform(0.4, 0.5), hf,
                           keep_out=keep, seed=v * 20 + i * 3)
    # star dunes where two winds meet, and the flat-topped outcrops
    for i, (x, y, r) in enumerate(stars):
        parts.append(peak(r * 1.1, H * 0.5, (x, y, hf(x, y) - H * 0.03), (None, G.sand, None), seed=v * 7 + i, seg=8,
                          lobe=0.3))
        recolor(parts[-1], lambda c, n: mixc(L(G.sand), L(G.sandDeep), 0.4) if n.x + n.y < -0.5 else None)
    for i, (x, y, r) in enumerate(rocks):
        m = slab(radial(r, ((3, 0.15, x),), n=8, cx=x, cy=y), H * rnd.uniform(0.34, 0.4), z0=hf(x, y) - H * 0.05,
                 color=G.rockDk, bevel=r * 0.25, bottom=False)
        recolor(m, lambda c, n: L(G.rock) if n.z > 0.6 else None)
        parts.append(m)
    # the wadi, and the oasis
    w = [(-R * 0.9 * math.cos(ang + 1.4) * (1 - 2 * i / 9) + R * 0.06 * math.sin(i * 1.7),
          -R * 0.9 * math.sin(ang + 1.4) * (1 - 2 * i / 9) + R * 0.06 * math.cos(i * 1.3)) for i in range(10)]
    parts.append(ribbon(w, lambda t: R * 0.03, lambda x, y: hf(x, y) + H * 0.01, G.silt, t=H * 0.05))
    parts.append(slab(radial(R * 0.17, ((3, 0.1, v),), n=10, cx=ox, cy=oy), H * 0.035, z0=hf(ox, oy) - H * 0.02,
                      color=G.land, bevel=H * 0.012, bottom=False))
    parts.append(slab(radial(R * 0.11, ((3, 0.1, v),), n=10, cx=ox, cy=oy), H * 0.02, z0=hf(ox, oy) + H * 0.005,
                      color=G.lagoon, bevel=H * 0.008, bottom=False))
    for i in range(3):
        a = i * TAU / 3 + 0.3
        x, y = ox + math.cos(a) * R * 0.14, oy + math.sin(a) * R * 0.14
        parts.append(blob(R * 0.055, (x, y, hf(x, y) + H * 0.06), G.jungle, seg=7, rings=3, scale=(1, 1, 0.8)))
    return fit(parts, 'wd_dunesea', v)


# ================================================================ ice

def decal(poly, zfn, color, lift, depth, smooth=40):
    """A flat patch of colour laid on a curved surface: an outline whose
    vertices sit `lift` above zfn(x, y), with a short skirt down into the
    surface. Melt ponds, crevasses, salt pans on a dome."""
    poly = ccw(poly)
    bm = bmesh.new()
    top = [bm.verts.new((x, y, zfn(x, y) + lift)) for (x, y) in poly]
    bot = [bm.verts.new((x, y, zfn(x, y) - depth)) for (x, y) in poly]
    n = len(poly)
    bm.faces.new(top)
    for j in range(n):
        bm.faces.new((bot[j], bot[(j + 1) % n], top[(j + 1) % n], top[j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    upright(bm)
    o = _from_bmesh(bm, 'decal')
    paint(o, color)
    return _smooth(o, smooth)


def ice_dome(Rd, Hd, z0, lob, seg=32, rings=8, color=G.snow):
    """An ice cap: a lobed dome rising from z0, flat-ish on top. Returns the
    mesh and its height function."""
    def zf(x, y):
        a = math.atan2(y, x)
        u = math.hypot(x, y) / (Rd * lob(a))
        return z0 + Hd * max(0.0, 1 - u * u) ** 0.6 if u < 1 else z0
    prof = []
    for k in range(rings + 1):
        u = math.cos(math.pi / 2 * k / rings) if k < rings else 0.0
        prof.append((Rd * u, z0 + Hd * max(0.0, 1 - u * u) ** 0.6))
    prof[-1] = (0.0, z0 + Hd)
    o = revolve(prof, seg=seg, color=color, warp=lambda a, r, z, i: (r * lob(a), z), smooth=60, cap_bottom=False)
    return o, zf


@model('wd_icefield', ao=0.45)
def wd_icefield(v):
    """A great dome of snow on a skirt of blue ice: outlet glaciers spilling
    off it in every direction, dark nunataks poking through, melt ponds and
    crevasse fields where the ice bends over the shoulder."""
    rnd = random.Random(1000 + v)
    R, H = 4.11, 3.08
    lob = rfun(1.0, ((3, 0.06, v), (5, 0.04, 2 * v + 1)))
    base_h = H * 0.16
    parts = []
    skirt = field(lambda a: R * lob(a), lambda x, y: base_h, rings=2, seg=36, color=G.iceBlue, bevel=R * 0.04)
    recolor(skirt, lambda c, n: L(G.iceDeep) if n.z < 0.4 and c.z < base_h * 0.5 else None)
    parts.append(skirt)
    Rd = R * 0.84
    dome, zf = ice_dome(Rd, H * 0.84, base_h - H * 0.02, lob)
    paint(dome, L(G.snow), lambda p: mixc(L(G.iceBlue), L(G.snow), clamp01((p.z - base_h) / (H * 0.22))))
    parts.append(dome)
    # outlet glaciers spilling off the dome onto the skirt
    for i in range(7):
        a = i * TAU / 7 + v * 0.4 + rnd.uniform(-0.1, 0.1)
        ca, sa = math.cos(a), math.sin(a)
        pts = []
        for k in range(7):
            f = 0.55 + 0.5 * k / 6
            r = Rd * lob(a) * f
            x, y = ca * r, sa * r
            pts.append((x, y, max(zf(x, y), base_h) + H * 0.01))
        tongue = flat_tube(pts, lambda t: R * (0.07 + 0.05 * t), lambda t: H * 0.045, n=6, color=G.ice, smooth=50)
        recolor(tongue, lambda c, n: L(G.iceDeep) if n.z > 0.85 else None)
        parts.append(tongue)
    # nunataks
    for i in range(5):
        a = v + 0.5 + i * TAU / 5 + rnd.uniform(-0.3, 0.3)
        d = Rd * rnd.uniform(0.4, 0.7)
        x, y = math.cos(a) * d, math.sin(a) * d
        hh = H * rnd.uniform(0.22, 0.3)
        parts.append(peak(hh * 0.55, hh, (x, y, zf(x, y) - hh * 0.3), (None, G.rockDk, G.snow), seed=v * 5 + i, seg=7,
                          snow=0.78))
    # melt ponds near the top, crevasses round the shoulder
    for i in range(5):
        a = rnd.uniform(0, TAU)
        d = Rd * rnd.uniform(0.1, 0.45)
        x, y = math.cos(a) * d, math.sin(a) * d
        parts.append(decal(radial(R * 0.06, ((2, 0.25, a),), n=8, cx=x, cy=y), zf, G.iceDeep, H * 0.008, H * 0.03))
    for i in range(9):
        a = rnd.uniform(0, TAU)
        d = Rd * rnd.uniform(0.62, 0.78)
        ca, sa = math.cos(a), math.sin(a)
        w, l = R * 0.012, R * 0.14
        x, y = ca * d, sa * d
        poly = [(x - sa * l + ca * w, y + ca * l + sa * w), (x - sa * l - ca * w, y + ca * l - sa * w),
                (x + sa * l - ca * w, y - ca * l - sa * w), (x + sa * l + ca * w, y - ca * l + sa * w)]
        parts.append(decal(poly, zf, dk(G.iceDeep, 0.15), H * 0.006, H * 0.03))
    return fit(parts, 'wd_icefield', v)


# ================================================================ land

@model('wd_peninsula', ao=0.55)
def wd_peninsula(v):
    """A hooked finger of land in a pale shelf sea: cliffs of dark rock under
    a green deck, sand beaches round the foot, a spine of snowy peaks down
    its length shrinking toward the tip, lagoons in the crook of the hook,
    forest on the deck and a stack of an island off the end."""
    rnd = random.Random(1100 + v)
    rad, H = 3.70, 2.96
    sweep = 2.5 + v * 0.3
    a0, a1 = -sweep / 2, sweep / 2
    path = arc_path(rad, a0, a1, 12, wob=lambda t: 0.04 * math.sin(t * 6 + v))
    wl = lambda t: rad * (0.48 - 0.2 * t) * (1 + 0.08 * math.sin(t * 11 + v * 2))
    parts = []
    shelf = slab(band(path, lambda t: wl(t) * 1.3 + rad * 0.05, cap=5), H * 0.05, color=G.shelf, bevel=H * 0.02)
    beach = slab(band(path, lambda t: wl(t) * 1.1, cap=5), H * 0.14, color=G.sand, bevel=H * 0.05, bottom=False)
    low = slab(band(path, lambda t: wl(t), cap=5), H * 0.4, color=G.land, bevel=H * 0.1, bottom=False)
    recolor(low, lambda c, n: L(G.rockDk) if n.z < 0.6 else None)
    up_path = path[1:-1]
    high = slab(band(up_path, lambda t: wl(0.08 + 0.84 * t) * 0.6, cap=4), H * 0.68, color=G.forest, bevel=H * 0.12,
                bottom=False)
    recolor(high, lambda c, n: L(G.rock) if n.z < 0.6 else None)
    parts += [shelf, beach, low, high]
    # forest along the lower deck
    fr = frames(path)
    for i in range(8):
        k = 1 + i * (len(path) - 3) // 7
        t = k / (len(path) - 1)
        p, nm = path[k], fr[k][1]
        side = 1 if i % 2 else -1
        x, y = p[0] + nm[0] * side * wl(t) * 0.8, p[1] + nm[1] * side * wl(t) * 0.8
        parts.append(blob(wl(t) * 0.17, (x, y, H * 0.4), G.forestDk if i % 3 else G.jungle, seg=7, rings=3,
                          scale=(1, 1, 0.8), flat=H * 0.39))
    # the spine, shrinking toward the tip
    for i in range(7):
        t = 0.08 + 0.8 * i / 6
        k = t * (len(path) - 1)
        k0 = int(k)
        f = k - k0
        p = (lerp(path[k0][0], path[k0 + 1][0], f), lerp(path[k0][1], path[k0 + 1][1], f))
        hh = H * (1.3 - 0.6 * t) * rnd.uniform(0.85, 1.0)
        parts.append(peak(min(hh * 0.48, wl(t) * 0.85), hh, (p[0], p[1], H * 0.64), (None, G.rock, G.snow),
                          seed=v * 13 + i, seg=9, snow=0.6))
    # lagoons in the crook of the hook
    for i in range(4):
        a = a0 + (0.2 + 0.2 * i) * sweep
        x, y = math.cos(a) * rad * 0.5, math.sin(a) * rad * 0.5
        parts.append(slab(radial(rad * 0.1, ((2, 0.2, a),), n=10, cx=x, cy=y, sx=1.3), H * 0.02, z0=H * 0.045,
                          color=G.lagoon, bevel=H * 0.01, bottom=False))
    # the stack off the tip
    tx, ty = path[-1]
    d = math.hypot(tx, ty)
    ix, iy = tx / d * rad * 1.0 + (-ty / d) * rad * 0.42, ty / d * rad * 1.0 + (tx / d) * rad * 0.42
    parts.append(slab(radial(rad * 0.12, ((2, 0.2, 0.0),), n=10, cx=ix, cy=iy), H * 0.06, color=G.shelf,
                      bevel=H * 0.02))
    st = slab(radial(rad * 0.08, ((3, 0.12, 1.0),), n=9, cx=ix, cy=iy), H * 0.5, color=G.granite, bevel=H * 0.08,
              bottom=False)
    recolor(st, lambda c, n: L(G.land) if n.z > 0.6 else None)
    parts.append(st)
    return fit(parts, 'wd_peninsula', v)


@model('wd_riversystem', ao=0.55)
def wd_riversystem(v):
    """A whole catchment: a green bowl of lowland ringed by the hills of the
    divide (snow on the tall ones at the headwaters), a trunk river
    meandering across it to a silt delta, and tributaries reaching in from
    the divide to meet it."""
    rnd = random.Random(1200 + v)
    R, H = 6.04, 3.80
    nz = Noise(120 + v, scale=R * 0.35, octaves=3)
    lob = rfun(R * 0.98, ((3, 0.05, v * 0.3), (5, 0.04, v + 2), (7, 0.025, 1.0)))
    ph = v * 1.3
    trunk = [p for p in meander(-R * 1.0, R * 1.0, R * 0.36, 2.4 / R, ph, n=26)]
    trunk = [p for p in trunk if math.hypot(*p) < lob(math.atan2(p[1], p[0])) * 0.97]
    mouth = trunk[-1]
    tribs = []
    for i in range(7):
        a = 0.5 + (i / 6) * (TAU - 1.0) + rnd.uniform(-0.12, 0.12)
        r0 = lob(a) * 0.74
        sx, sy = math.cos(a) * r0, math.sin(a) * r0
        # join the trunk a little downstream of the nearest point, bending
        d, t = seg_dist(sx, sy, trunk)
        k = min(len(trunk) - 1, int(round(t * (len(trunk) - 1))) + 3)
        ex, ey = trunk[k]
        d = math.hypot(ex - sx, ey - sy)
        bend = rnd.uniform(-0.25, 0.25)
        pts = []
        for j in range(11):
            f = j / 10
            mx, my = lerp(sx, ex, f), lerp(sy, ey, f)
            off = math.sin(math.pi * f) * bend * d
            pts.append((mx - (ey - sy) / max(d, 1e-6) * off, my + (ex - sx) / max(d, 1e-6) * off))
        tribs.append(pts)
    floor = H * 0.24

    def h(x, y):
        r = math.hypot(x, y) / lob(math.atan2(y, x))
        bowl = floor + H * 0.16 * smooth01((r - 0.3) / 0.7) + H * 0.04 * nz(x, y)
        d = seg_dist(x, y, trunk)[0]
        return floor + (bowl - floor) * smooth01((d - R * 0.04) / (R * 0.1))
    ground = field(lob, h, rings=7, seg=36, color=G.land, bevel=R * 0.03)
    paint(ground, L(G.land), lambda p: mixc(L(G.marsh), mixc(L(G.land), L(G.landDry), clamp01((p.z - floor) / (H * 0.2) - 0.3)),
                                            clamp01((seg_dist(p.x, p.y, trunk)[0] - R * 0.08) / (R * 0.1))))
    recolor(ground, lambda c, n: L(G.rockDk) if n.z < 0.3 and c.z < floor * 0.9 else None)
    parts = [ground]
    # the divide
    for i in range(11):
        a = i * TAU / 11 + rnd.uniform(-0.08, 0.08)
        r = lob(a) * 0.92
        tall = 0.5 + 0.5 * math.cos(a - math.pi - v)        # headwaters opposite the mouth
        hh = H * (0.55 + 0.6 * tall) * rnd.uniform(0.85, 1.05)
        x, y = math.cos(a) * r, math.sin(a) * r
        parts.append(peak(hh * 0.5, hh, (x, y, h(x, y) - H * 0.06),
                          (G.forest, G.rockDk if i % 3 else G.rock, G.snow if hh > H * 0.9 else None),
                          seed=v * 17 + i, seg=8, snow=0.68, foot=0.22))
    # rivers: the trunk widening downstream, the tributaries thin
    parts.append(ribbon(trunk, lambda t: R * (0.045 + 0.04 * t), lambda x, y: floor + H * 0.012, G.river, t=H * 0.06))
    for tb in tribs:
        parts.append(ribbon(tb, lambda t: R * (0.022 + 0.014 * t), lambda x, y: h(x, y) + H * 0.03, G.river, t=H * 0.12))
    # the delta at the mouth, and a couple of lakes on the plain
    mx, my = mouth
    a = math.atan2(my, mx)
    parts.append(decal(radial(R * 0.16, ((1, 0.3, a),), n=12, cx=mx - math.cos(a) * R * 0.06,
                              cy=my - math.sin(a) * R * 0.06, sx=1.0, sy=1.0), h, G.silt, H * 0.008, H * 0.05))
    for i in range(3):
        k = 4 + i * 7
        if k >= len(trunk):
            break
        x, y = trunk[k]
        parts.append(decal(radial(R * 0.05, ((2, 0.3, k),), n=8, cx=x + R * 0.1, cy=y - R * 0.08), h, G.lake,
                           H * 0.01, H * 0.05))
    for i in range(8):
        a = rnd.uniform(0, TAU)
        d = R * rnd.uniform(0.3, 0.65)
        x, y = math.cos(a) * d, math.sin(a) * d
        if seg_dist(x, y, trunk)[0] < R * 0.12:
            continue
        parts.append(blob(R * 0.06, (x, y, h(x, y) + R * 0.01), G.forestDk if i % 2 else G.forest, seg=7, rings=3,
                          scale=(1, 1, 0.75), flat=h(x, y) - R * 0.01))
    return fit(parts, 'wd_riversystem', v)



def volcano(R, H, at, cols, seg=9, seed=0, full=0.0):
    """A toy volcano: a concave cone of dark rock, a crater rim, and a pool of
    lava (or a cap of snow) sunk in the top. cols = (rock, crater)."""
    rnd = random.Random(seed)
    q = rnd.uniform(0, TAU)
    prof = [(R, 0.0), (R * (0.62 + 0.12 * full), H * 0.35), (R * (0.36 + 0.1 * full), H * 0.72), (R * 0.24, H * 0.96),
            (R * 0.19, H), (R * 0.13, H * 0.95), (0.0, H * 0.93)]
    o = revolve(prof, seg=seg, color=cols[0], warp=lambda a, r, z, i: (r * (1 + 0.07 * math.cos(3 * a + q)), z),
                smooth=40, cap_bottom=False)
    rk = L(cols[0])
    recolor(o, lambda c, n: L(cols[1]) if math.hypot(c.x, c.y) < R * 0.16 and c.z > H * 0.88 else
            (lt(rk, 0.14) if (n.x * 0.55 - n.y * 0.45) > 0.25 else None))
    deform(o, lambda p: Vector((p.x + at[0], p.y + at[1], p.z + at[2])))
    return o


@model('wd_cordillera', ao=0.55)
def wd_cordillera(v):
    """Two arcs of peaks with a high steppe plateau between them: the outer
    arc snow-capped, the inner arc darker with volcanoes standing on it, salt
    pans and a high lake on the plateau, a canyon draining out through the
    outer wall, and green scree foothills outside it all."""
    rnd = random.Random(1300 + v)
    rad, H = 4.24, 5.53
    sweep = 3.0 + v * 0.2
    a0, a1 = -sweep / 2, sweep / 2
    wob = lambda t: 0.03 * math.sin(t * 7 + v)
    parts = []
    foot = slab(band(arc_path(rad * 1.38, a0, a1, 14, wob=wob), lambda t: rad * 0.26, cap=4), H * 0.08,
                color=G.land, bevel=H * 0.03)
    plat = slab(band(arc_path(rad * 1.0, a0 + 0.02, a1 - 0.02, 14, wob=wob), lambda t: rad * 0.4, cap=4), H * 0.26,
                color=G.steppe, bevel=H * 0.06)
    for o in (foot, plat):
        recolor(o, lambda c, n: L(G.rockDk) if n.z < 0.6 else None)
    parts += [foot, plat]

    def at_arc(f, t, z=0.0, jit=0.0):
        a = a0 + (a1 - a0) * t
        d = rad * f * (1 + rnd.uniform(-jit, jit))
        return (math.cos(a) * d, math.sin(a) * d, z)

    for i in range(7):
        t = 0.06 + 0.88 * i / 6 + rnd.uniform(-0.02, 0.02)
        hh = H * (0.72 + 0.28 * math.sin(math.pi * t)) * rnd.uniform(0.88, 1.0)
        parts.append(peak(hh * 0.52, hh, at_arc(1.24, t, H * 0.2, 0.03), (None, G.rock, G.snow), seed=v * 41 + i,
                          seg=8, snow=0.62))
    for i in range(5):
        t = 0.1 + 0.8 * i / 4 + rnd.uniform(-0.02, 0.02)
        hh = H * rnd.uniform(0.5, 0.62)
        parts.append(peak(hh * 0.5, hh, at_arc(0.74, t, H * 0.22, 0.03), (None, G.rockDk, G.ice), seed=v * 41 + 20 + i,
                          seg=7, snow=0.7))
    for i in range(3):
        t = 0.2 + 0.3 * i + rnd.uniform(-0.03, 0.03)
        hh = H * rnd.uniform(0.7, 0.8)
        parts.append(volcano(hh * 0.62, hh, at_arc(0.9, t, H * 0.24), (G.basalt, G.lava if i % 2 == 0 else G.snow),
                             seed=v * 41 + 40 + i))
    for i in range(5):
        t = 0.08 + 0.84 * i / 4 + rnd.uniform(-0.03, 0.03)
        hh = H * rnd.uniform(0.26, 0.34)
        parts.append(peak(hh * 0.7, hh, at_arc(1.52, t, H * 0.06, 0.03), (G.forest, G.scree, None), seed=v * 41 + 60 + i,
                          seg=7, foot=0.3))
    # salt pans and a high lake on the plateau
    top = lambda x, y: H * 0.26
    for i in range(4):
        x, y, _ = at_arc(1.0, 0.16 + 0.22 * i)
        parts.append(decal(radial(rad * 0.1, ((2, 0.25, i),), n=9, cx=x, cy=y, sx=1.2), top,
                           G.salt if i % 2 else G.lake, H * 0.008, H * 0.02))
    # the canyon draining it, out through the outer wall
    a = a0 + 0.12 * sweep
    pts = [(math.cos(a + 0.05 * math.sin(k * 2)) * rad * (0.9 + 0.12 * k), math.sin(a + 0.05 * math.sin(k * 2)) * rad
            * (0.9 + 0.12 * k)) for k in range(7)]
    parts.append(ribbon(pts, lambda t: rad * 0.04,
                        lambda x, y: H * 0.27 - H * 0.2 * clamp01((math.hypot(x, y) - rad * 1.3) / (rad * 0.3)),
                        G.river, t=H * 0.12))
    return fit(parts, 'wd_cordillera', v)



@model('wd_icesheet', ao=0.45)
def wd_icesheet(v):
    """A continental ice sheet: a vast snow dome on blue ice, dark granite
    coast showing along one side, a flat ice shelf pushing out over the sea
    on the other with its calving front and the bergs it has shed, outlet
    glaciers grooved down the flanks and nunataks poking through."""
    rnd = random.Random(1400 + v)
    R, H = 8.15, 6.52
    lob = rfun(1.0, ((3, 0.05, v * 0.7), (5, 0.035, 2 * v + 1)))
    base_h = H * 0.18
    parts = []
    skirt = field(lambda a: R * lob(a), lambda x, y: base_h, rings=2, seg=36, color=G.iceBlue, bevel=R * 0.035)
    recolor(skirt, lambda c, n: L(G.iceDeep) if n.z < 0.4 and c.z < base_h * 0.5 else None)
    parts.append(skirt)
    Rd = R * 0.9
    dome, zf = ice_dome(Rd, H * 0.84, base_h - H * 0.02, lob, seg=28, rings=7)
    paint(dome, L(G.snow), lambda p: mixc(L(G.iceBlue), L(G.snow), clamp01((p.z - base_h) / (H * 0.2))))
    parts.append(dome)
    # the rock coast
    for i in range(6):
        a = 1.4 + (i + 0.5) / 6 * 1.6 + rnd.uniform(-0.05, 0.05)
        r = R * lob(a) * 0.98
        x, y = math.cos(a) * r, math.sin(a) * r
        rr = R * rnd.uniform(0.13, 0.17)
        m = slab(radial(rr, ((3, 0.18, a * 3),), n=8, cx=x, cy=y, sx=1.1), H * rnd.uniform(0.22, 0.3),
                 color=G.granite, bevel=rr * 0.3, bottom=False)
        recolor(m, lambda c, n: L(G.snow) if n.z > 0.75 else None)
        parts.append(m)
    # the ice shelf and its calving front
    sa0, sa1 = -1.5, 0.4
    shelf_path = arc_path(R * 1.0, sa0, sa1, 12, wob=lambda t: 0.04 * math.sin(t * 9 + v))
    shelf = slab(band(shelf_path, lambda t: R * (0.2 + 0.08 * math.sin(math.pi * t)), cap=4), H * 0.13,
                 color=G.ice, bevel=H * 0.03)
    recolor(shelf, lambda c, n: L(G.iceBlue) if n.z < 0.5 else (L(G.ice) if c.z > H * 0.12 else None))
    parts.append(shelf)
    for i in range(5):
        a = sa0 + (i + rnd.uniform(0.2, 0.8)) / 5 * (sa1 - sa0)
        r = R * rnd.uniform(1.3, 1.42)
        x, y = math.cos(a) * r, math.sin(a) * r
        rr = R * rnd.uniform(0.035, 0.06)
        b = slab(radial(rr, ((2, 0.2, a * 5), (3, 0.1, i)), n=6, cx=x, cy=y), H * rnd.uniform(0.06, 0.12),
                 color=G.ice if i % 3 else G.iceBlue, bevel=rr * 0.25)
        parts.append(b)
    # outlet glaciers
    for i in range(9):
        a = i * TAU / 9 + v * 0.3
        if 1.3 < (a % TAU) < 3.1:
            continue
        ca, sa = math.cos(a), math.sin(a)
        pts = []
        for k in range(5):
            f = 0.55 + 0.47 * k / 4
            r = Rd * lob(a) * f
            x, y = ca * r, sa * r
            pts.append((x, y, max(zf(x, y), base_h) + H * 0.01))
        tongue = flat_tube(pts, lambda t: R * (0.05 + 0.04 * t), lambda t: H * 0.04, n=6, color=G.ice, smooth=50)
        recolor(tongue, lambda c, n: L(G.iceDeep) if n.z > 0.85 else None)
        parts.append(tongue)
    for i in range(5):
        a = v + 0.4 + i * TAU / 5 + rnd.uniform(-0.3, 0.3)
        d = Rd * rnd.uniform(0.45, 0.72)
        x, y = math.cos(a) * d, math.sin(a) * d
        hh = H * rnd.uniform(0.2, 0.28)
        parts.append(peak(hh * 0.55, hh, (x, y, zf(x, y) - hh * 0.3), (None, G.rockDk, G.snow), seed=v * 5 + i, seg=7,
                          snow=0.78))
    for i in range(5):
        a = rnd.uniform(0, TAU)
        d = Rd * rnd.uniform(0.1, 0.55)
        x, y = math.cos(a) * d, math.sin(a) * d
        parts.append(decal(radial(R * 0.05, ((2, 0.25, a),), n=8, cx=x, cy=y), zf, G.iceDeep, H * 0.008, H * 0.03))
    return fit(parts, 'wd_icesheet', v)



@model('wd_desertbelt', ao=0.5)
def wd_desertbelt(v):
    """A whole desert belt: a stratified sand plinth, a stepped mesa of bare
    rock in the middle with crags on top, three dune fields each combed by
    its own wind, a sand escarpment walling one side, salt pans in the low
    ground, wadis running off the massif and one green oasis."""
    rnd = random.Random(1500 + v)
    R, H = 11.98, 8.43
    nz = Noise(150 + v, scale=R * 0.5, octaves=2)
    lob = rfun(R, ((3, 0.04, v), (5, 0.03, 1 + v), (2, 0.03, 2 * v)))
    base = H * 0.3
    hf = lambda x, y: base + H * 0.02 * nz(x, y)
    ground = field(lob, hf, rings=3, seg=32, color=G.sand, bevel=R * 0.03)
    strata = [L(G.sandDeep), mixc(L(G.sandDeep), L(G.rock), 0.3), L(G.sandDeep), dk(G.sandDeep, 0.12)]
    recolor(ground, lambda c, n: strata[min(3, int(c.z / (base * 0.26)))] if n.z < 0.6 else None)
    parts = [ground]
    # the stepped massif
    tiers = [(0.36, 0.55, G.rock), (0.25, 0.76, G.rockDk), (0.15, 0.92, G.rock)]
    for k, (rr, top, col) in enumerate(tiers):
        m = slab(radial(R * rr, ((3, 0.1, v + k), (5, 0.06, k * 2)), n=16), H * top - base + H * 0.02, z0=base - H * 0.02,
                 color=col, bevel=H * 0.05, bottom=False)
        recolor(m, lambda c, n, k=k: (L(G.sandDeep) if k == 0 else lt(G.rock, 0.12)) if n.z > 0.6 else None)
        parts.append(m)
    for i in range(3):
        a = v + i * TAU / 3
        d = R * 0.06
        hh = H * rnd.uniform(0.36, 0.5)
        parts.append(peak(hh * 0.62, hh, (math.cos(a) * d, math.sin(a) * d, H * 0.9), (None, G.rockDk, G.rock),
                          seed=v * 3 + i, seg=8, snow=0.72))
    # the escarpment along one side
    esc = slab(band(arc_path(R * 0.82, 2.2, 3.6, 10, wob=lambda t: 0.03 * math.sin(t * 8 + v)), lambda t: R * 0.11,
                    cap=3), H * 0.6 - base, z0=base - H * 0.02, color=G.sandDeep, bevel=H * 0.05, bottom=False)
    recolor(esc, lambda c, n: L(G.sand) if n.z > 0.6 else None)
    parts.append(esc)
    # three dune fields, each with its own wind
    keep = [(0, 0, R * 0.4)]
    for k in range(3):
        ang = 0.4 + k * 1.1 + v * 0.3
        a = k * 2.1 + v + 0.6
        cx, cy = math.cos(a) * R * 0.6, math.sin(a) * R * 0.6
        if 2.0 < (a % TAU) < 3.8:
            cx, cy = cx * 0.75, cy * 0.75
        ca, sa = math.cos(ang), math.sin(ang)
        for i in range(3):
            off = (i - 1) * R * 0.15
            parts += dune_line(cx - sa * off, cy + ca * off, ang, R * 0.42, R * 0.07, H * 0.16, hf, keep_out=keep,
                               seed=v * 30 + k * 5 + i)
    # salt pans, wadis off the massif, the oasis
    for i in range(4):
        a = v * 1.3 + i * TAU / 4 + 0.8
        d = R * 0.62
        x, y = math.cos(a) * d, math.sin(a) * d
        parts.append(decal(radial(R * 0.09, ((2, 0.25, a),), n=9, cx=x, cy=y, sx=1.3), hf,
                           G.salt if i % 2 else G.saltDk, H * 0.006, H * 0.02))
    for i in range(5):
        a = i * TAU / 5 + 0.3 + v
        pts = [(math.cos(a + 0.12 * math.sin(k * 1.7)) * R * (0.38 + 0.1 * k),
                math.sin(a + 0.12 * math.sin(k * 1.7)) * R * (0.38 + 0.1 * k)) for k in range(5)]
        parts.append(ribbon(pts, lambda t: R * (0.012 + 0.008 * t), lambda x, y: hf(x, y) + H * 0.008, G.silt,
                            t=H * 0.03))
    ox, oy = -R * 0.5, R * 0.44
    parts.append(decal(radial(R * 0.12, ((3, 0.1, v),), n=10, cx=ox, cy=oy), hf, G.land, H * 0.008, H * 0.02))
    parts.append(decal(radial(R * 0.07, ((3, 0.1, v),), n=10, cx=ox, cy=oy), hf, G.lagoon, H * 0.016, H * 0.02))
    for i in range(3):
        a = i * TAU / 3 + 0.3
        x, y = ox + math.cos(a) * R * 0.1, oy + math.sin(a) * R * 0.1
        parts.append(blob(R * 0.035, (x, y, hf(x, y) + H * 0.03), G.jungle, seg=7, rings=3, scale=(1, 1, 0.8)))
    return fit(parts, 'wd_desertbelt', v)



@model('wd_archipelago', ao=0.55)
def wd_archipelago(v):
    """An island arc on its pale shelf: a curving chain of jungle islands with
    dark cliffs and sand round their feet, every other one a volcano (the
    odd one still glowing with lava), and coral atolls strung between."""
    rnd = random.Random(1600 + v)
    rad, H = 12.02, 5.68
    sweep = 3.2 + v * 0.2
    a0, a1 = -sweep / 2, sweep / 2
    parts = []
    path = arc_path(rad, a0, a1, 14, wob=lambda t: 0.03 * math.sin(t * 8 + v))
    shelf = slab(band(path, lambda t: rad * (0.3 + 0.05 * math.sin(t * 13 + v)), cap=5), H * 0.07, color=G.shelf,
                 bevel=H * 0.03)
    parts.append(shelf)
    N = 9
    for i in range(N):
        a = a0 + i / (N - 1) * sweep + rnd.uniform(-0.05, 0.05)
        d = rad * rnd.uniform(0.95, 1.05)
        x, y = math.cos(a) * d, math.sin(a) * d
        rr = rad * rnd.uniform(0.1, 0.18)
        hh = H * rnd.uniform(0.3, 0.5)
        parts.append(disc(rr * 1.22, H * 0.04, at=(x, y, H * 0.06), color=G.sand, seg=10, sx=1.1, rot=a))
        isl = slab(radial(rr, ((2, 0.12, a * 3), (3, 0.08, i)), n=9, cx=x, cy=y), hh, color=G.rockDk,
                   bevel=rr * 0.22, bottom=False)
        recolor(isl, lambda c, n: (L(G.jungle) if i % 3 else L(G.forest)) if n.z > 0.55 else None)
        parts.append(isl)
        if i % 2 == 0:
            vh = H * (1.9 if i == 4 else rnd.uniform(1.0, 1.5))
            vo = volcano(max(rr * 0.9, vh * 0.32), vh, (x, y, hh - H * 0.06),
                         (G.basalt, G.lava if i % 4 == 0 else G.ash), seg=10, seed=v * 9 + i, full=1.0)
            z_green = hh + vh * 0.3
            recolor(vo, lambda c, n, z=z_green: L(G.jungle) if c.z < z else None)
            parts.append(vo)
        else:
            for k in range(2):
                ka = rnd.uniform(0, TAU)
                parts.append(blob(rr * 0.42, (x + math.cos(ka) * rr * 0.35, y + math.sin(ka) * rr * 0.35, hh),
                                  G.jungleDk, seg=7, rings=3, scale=(1, 1, 0.8), flat=hh - H * 0.02))
    # atolls and reefs between the islands
    for i in range(4):
        a = a0 + (i + 0.5) / 4 * sweep + rnd.uniform(-0.08, 0.08)
        d = rad * (0.82 if i % 2 else 1.2)
        x, y = math.cos(a) * d, math.sin(a) * d
        r = rad * rnd.uniform(0.05, 0.07)
        parts.append(disc(r * 0.85, H * 0.03, at=(x, y, H * 0.05), color=G.lagoon, seg=10))
        ring = torus(r, r * 0.25, at=(x, y, H * 0.08), color=G.coral if i % 2 else G.sand, seg=12, rseg=4)
        deform(ring, lambda p: Vector((p.x, p.y, max(H * 0.06, p.z))))
        parts.append(ring)
    return fit(parts, 'wd_archipelago', v)



@model('wd_inland_sea', ao=0.55)
def wd_inland_sea(v):
    """A sea penned in by land: a dry shore climbing to a rocky crest round a
    deep blue basin, mountains behind the shore, islands and peninsulas
    reaching in, a delta where a river feeds it, and one strait cut through
    the ring out to the ocean."""
    rnd = random.Random(1700 + v)
    R, H = 13.7, 10.96
    nz = Noise(170 + v, scale=R * 0.4)
    rw = rfun(R * 0.8, ((3, 0.07, v * 1.7), (5, 0.05, 1 + v), (2, 0.04, 2 * v)))
    ro = lambda a: rw(a) + R * (0.32 + 0.05 * math.sin(4 * a + v))
    surf = H * 0.28
    top = lambda x, y, f: H * (0.1 + 0.36 * smooth01(f * 1.3) + 0.12 * nz(x, y) * f)
    gap = ((7 - v) / 20) * TAU
    shore = rim(rw, ro, top, seg=32, a0=gap + 0.12, a1=gap + TAU - 0.12, bevel=R * 0.04, color=G.landDry, mid=2)

    def shore_col(c, n):
        a = math.atan2(c.y, c.x)
        r = math.hypot(c.x, c.y)
        if r < rw(a) + R * 0.03:
            return L(G.rockDk)
        if c.z < H * 0.05:
            return dk(G.landDry, 0.2) if n.z < 0.3 else None
        return L(G.steppe) if c.z > H * 0.38 else (L(G.land) if c.z < H * 0.2 else None)
    recolor(shore, shore_col)
    parts = [shore]
    parts.append(slab(polar(rw, n=32, d=R * 0.04), surf, color=G.ocean, bevel=H * 0.02))
    parts.append(slab(radial(R * 0.45, ((3, 0.1, v),), n=14), H * 0.01, z0=surf - H * 0.002, color=G.oceanDeep,
                      bevel=H * 0.005, bottom=False))
    # the mountains behind the shore
    for i in range(9):
        a = gap + 0.5 + (TAU - 1.0) * (i + 0.5) / 9 + rnd.uniform(-0.08, 0.08)
        r = ro(a) - R * 0.06
        x, y = math.cos(a) * r, math.sin(a) * r
        hh = H * rnd.uniform(0.55, 0.9)
        parts.append(peak(hh * 0.5, hh, (x, y, top(x, y, 0.15) - H * 0.05),
                          (None, G.rock if i % 3 else G.rockDk, G.snow if hh > H * 0.75 else None),
                          seed=v * 11 + i, seg=8, snow=0.66))
    # islands, and peninsulas reaching in
    for i in range(3):
        a = v + i * TAU / 3 + 0.4
        d = R * rnd.uniform(0.2, 0.42)
        parts += isle(math.cos(a) * d, math.sin(a) * d, R * rnd.uniform(0.05, 0.07), surf, H * 0.16, rnd,
                      top=G.landDry if i % 2 else G.forest, seg=8)
    for i in range(2):
        a = 0.6 + i * 2.6 + v
        pts = [(math.cos(a + 0.1 * k) * rw(a) * f, math.sin(a + 0.1 * k) * rw(a) * f)
               for k, f in enumerate((1.05, 0.85, 0.68, 0.55))]
        pn = slab(band(pts, lambda t: R * (0.1 - 0.04 * t), cap=3), H * 0.34, color=G.land if i else G.landDry,
                  bevel=H * 0.06, bottom=False)
        recolor(pn, lambda c, n: L(G.rockDk) if n.z < 0.55 else None)
        parts.append(pn)
    # the strait out through the gap, and the delta of the river that feeds it
    ca, sa = math.cos(gap), math.sin(gap)
    st = [(ca * rw(gap) * f, sa * rw(gap) * f) for f in (0.85, 1.1, 1.35, 1.6)]
    parts.append(slab(band(st, lambda t: R * 0.1, cap=2), surf, color=G.ocean, bevel=H * 0.02))
    da = gap + math.pi + 0.4
    dx, dy = math.cos(da) * rw(da) * 0.88, math.sin(da) * rw(da) * 0.88
    parts.append(slab(radial(R * 0.12, ((1, 0.3, da),), n=10, cx=dx, cy=dy), H * 0.02, z0=surf - H * 0.005,
                      color=G.silt, bevel=H * 0.008, bottom=False))
    return fit(parts, 'wd_inland_sea', v)



@model('wd_continent', ao=0.5)
def wd_continent(v):
    """A whole continent as a toy relief map: a lobed slab with dark cliffs
    standing in a pale shelf sea, its deck painted in big biome patches —
    forest, jungle, steppe, a sand desert, a snowy cold end — two arcs of
    snowy ranges with rivers running off them, an inland sea and lakes."""
    rnd = random.Random(1800 + v)
    R, H = 19.19, 10.96
    biome = [G.land, G.steppe, G.forest][v]
    lobes = [(0, 0, R * 0.62)]
    for i in range(6):
        a = (i / 6) * TAU + rnd.uniform(-0.4, 0.4)
        d = R * rnd.uniform(0.45, 0.62)
        lobes.append((math.cos(a) * d, math.sin(a) * d, R * rnd.uniform(0.3, 0.44)))
    outline = union_r(lobes, wob=lambda a: 0.03 * math.sin(7 * a + v))
    deck = H * 0.45
    nz = Noise(180 + v, scale=R * 0.3, octaves=3)
    nb = Noise(280 + v, scale=R * 0.45, octaves=2)
    hf = lambda x, y: deck + H * 0.05 * nz(x, y)
    parts = []
    parts.append(field(lambda a: outline(a) + R * 0.08, lambda x, y: H * 0.08, rings=1, seg=36, color=G.shelf,
                       bevel=R * 0.02))
    land = field(outline, hf, rings=7, seg=36, color=biome, bevel=R * 0.035, z0=H * 0.04)
    dx, dy = R * 0.3, -R * 0.25                      # the desert's heart
    cx, cy = -R * 0.35, R * 0.5                      # the cold end

    def biome_at(c):
        if math.hypot(c.x - cx, c.y - cy) < R * 0.3 + R * 0.08 * nb(c.x, c.y):
            return L(G.snow)
        if math.hypot(c.x - dx, c.y - dy) < R * 0.28 + R * 0.08 * nb(c.x, c.y):
            return L(G.sand)
        k = nb(c.x * 1.3, c.y * 1.3)
        if k > 0.35:
            return L(G.jungle)
        if k < -0.4:
            return L(G.landDry)
        if -0.05 < k < 0.12:
            return L(G.forest) if v != 2 else L(G.land)
        return L(biome)
    recolor(land, lambda c, n: (L(G.rockDk) if c.z < deck * 0.6 else L(G.rock)) if n.z < 0.45 else biome_at(c))
    parts.append(land)
    # two ranges, arced, with snow on them
    ranges = [(R * 0.55, rnd.uniform(0, TAU), 1.9, 7), (R * 0.32, rnd.uniform(0, TAU), 1.6, 5)]
    for k, (rr, ph, sw, n) in enumerate(ranges):
        for i in range(n):
            a = ph + (i / (n - 1) - 0.5) * sw
            d = rr * rnd.uniform(0.95, 1.05)
            x, y = math.cos(a) * d, math.sin(a) * d
            if math.hypot(x, y) > outline(math.atan2(y, x)) * 0.85:
                continue
            hh = H * (0.95 - 0.2 * k) * rnd.uniform(0.75, 1.0) * (0.7 + 0.3 * math.sin(math.pi * i / (n - 1)))
            parts.append(peak(hh * 0.6, hh, (x, y, hf(x, y) - H * 0.03), (None, G.rock, G.snow), seed=v * 23 + k * 9 + i,
                              seg=8, snow=0.6))
        # a river off the outer side of the range, down to the coast
        a = ph + rnd.uniform(-0.4, 0.4)
        pts = []
        for j in range(6):
            f = rr / R + (outline(a) / R - rr / R) * j / 5 * 0.97
            pts.append((math.cos(a + 0.12 * math.sin(j * 1.8)) * R * f, math.sin(a + 0.12 * math.sin(j * 1.8)) * R * f))
        parts.append(ribbon(pts, lambda t: R * (0.012 + 0.014 * t), lambda x, y: hf(x, y) + H * 0.03, G.river,
                            t=H * 0.1))
    # the inland sea, and a few lakes
    sx, sy = -R * 0.3, -R * 0.3
    parts.append(decal(radial(R * 0.17, ((3, 0.12, v),), n=12, cx=sx, cy=sy), hf, G.shelf, H * 0.025, H * 0.1))
    parts.append(decal(radial(R * 0.12, ((3, 0.12, v),), n=12, cx=sx, cy=sy), hf, G.ocean, H * 0.04, H * 0.1))
    for i in range(3):
        a = rnd.uniform(0, TAU)
        d = R * rnd.uniform(0.15, 0.4)
        x, y = math.cos(a) * d, math.sin(a) * d
        parts.append(decal(radial(R * 0.04, ((2, 0.3, a),), n=8, cx=x, cy=y), hf, G.lake, H * 0.035, H * 0.1))
    # forest, in big clumps
    for i in range(7):
        a = rnd.uniform(0, TAU)
        d = R * rnd.uniform(0.2, 0.7)
        x, y = math.cos(a) * d, math.sin(a) * d
        if math.hypot(x - dx, y - dy) < R * 0.35 or math.hypot(x - cx, y - cy) < R * 0.35:
            continue
        if d > outline(a) * 0.85:
            continue
        parts.append(blob(R * 0.06, (x, y, hf(x, y)), G.forestDk if i % 2 else G.jungle, seg=7, rings=3,
                          scale=(1, 1, 0.7), flat=hf(x, y) - H * 0.03))
    return fit(parts, 'wd_continent', v)



@model('wd_ocean', ao=0.5)
def wd_ocean(v):
    """An ocean drawn as the rimmed basin it is: continental margins round
    the outside (green coast, pale shelf, dark rock walls) broken by three
    straits, the floor stepping down from shelf blue through deep to abyss,
    a mid-ocean ridge arcing across it, a trench with its island arc, a
    couple of seamounts with atolls, and weather standing over it all."""
    rnd = random.Random(1900 + v)
    R, H = 29.78, 17.07
    nz = Noise(190 + v, scale=R * 0.4)
    rw = rfun(R * 0.8, ((3, 0.05, v), (5, 0.04, 2 * v + 1)))
    ro = lambda a: rw(a) + R * (0.26 + 0.04 * math.sin(3 * a + v))
    top = lambda x, y, f: H * (0.62 + 0.18 * nz(x, y)) * (0.55 + 0.45 * smooth01(f * 1.6))
    parts = []
    gaps = [g + v * 0.5 for g in (0.4, 2.5, 4.4)]
    for k in range(3):
        g0, g1 = gaps[k] + 0.13, gaps[(k + 1) % 3] - 0.13 + (TAU if k == 2 else 0)
        seg = max(6, int((g1 - g0) / TAU * 36))
        m = rim(rw, ro, top, seg=seg, a0=g0, a1=g1, bevel=R * 0.035, color=G.land, mid=2)

        def mcol(c, n):
            a = math.atan2(c.y, c.x)
            r = math.hypot(c.x, c.y)
            if n.z < 0.5:
                return L(G.crust) if c.z < H * 0.25 else L(G.rockDk)
            return L(G.shelf) if r < rw(a) + R * 0.07 else (L(G.forest) if c.z > H * 0.62 else None)
        recolor(m, mcol)
        parts.append(m)
    # the floor: shallow at the edge, abyssal in the middle
    floor_z = lambda x, y: H * (0.3 - 0.1 * smooth01(1 - math.hypot(x, y) / (R * 0.8)))
    fl = field(lambda a: rw(a) + R * 0.05, floor_z, rings=5, seg=32, color=G.ocean, bevel=R * 0.02)
    bands = [(0.3, G.abyss), (0.5, G.oceanDeep), (0.72, G.ocean)]

    def fcol(c, n):
        r = math.hypot(c.x, c.y) / (R * 0.8)
        for lim, col in bands:
            if r < lim:
                return L(col)
        return L(G.shelf)
    recolor(fl, lambda c, n: fcol(c, n) if n.z > 0.5 else L(G.oceanDeep))
    parts.append(fl)
    # the mid-ocean ridge, with its rift
    ph = v * 1.1
    for i in range(7):
        a = ph + (i / 6 - 0.5) * 3.0
        d = R * 0.42 * rnd.uniform(0.95, 1.05)
        x, y = math.cos(a) * d, math.sin(a) * d
        hh = H * rnd.uniform(0.22, 0.32)
        parts.append(peak(hh * 0.9, hh, (x, y, floor_z(x, y) - H * 0.03), (None, G.basalt, G.rockDk), seed=v * 31 + i,
                          seg=7, snow=0.75, lobe=0.18))
    rift = arc_path(R * 0.42, ph - 1.5, ph + 1.5, 12)
    parts.append(ribbon(rift, lambda t: R * 0.012, lambda x, y: floor_z(x, y) + H * 0.01, G.abyss, t=H * 0.03))
    # a trench, and its island arc
    ta = ph + math.pi
    trench = arc_path(R * 0.66, ta - 0.6, ta + 0.6, 9)
    parts.append(ribbon(trench, lambda t: R * 0.025 * math.sin(math.pi * t) + R * 0.008,
                        lambda x, y: floor_z(x, y) + H * 0.006, G.abyss, t=H * 0.03))
    for i in range(4):
        a = ta + (i / 3 - 0.5) * 1.0
        d = R * 0.56
        x, y = math.cos(a) * d, math.sin(a) * d
        hh = H * rnd.uniform(0.32, 0.42)
        parts.append(peak(hh * 0.5, hh, (x, y, floor_z(x, y) - H * 0.03), (None, G.basalt, G.jungle), seed=v * 31 + 20 + i,
                          seg=7, snow=0.72))
    # seamounts, the drowned one ringed by an atoll
    for i in range(2):
        a = ph + 1.9 + i * 0.5
        d = R * rnd.uniform(0.2, 0.3)
        x, y = math.cos(a) * d, math.sin(a) * d
        hh = H * 0.2
        parts.append(peak(hh * 0.7, hh, (x, y, floor_z(x, y) - H * 0.02), (None, G.rockDk, G.lagoon), seed=v * 31 + 40 + i,
                          seg=7, snow=0.8))
    # weather over the whole thing
    for i in range(3):
        a = v + i * TAU / 3 + 0.7
        d = R * rnd.uniform(0.3, 0.5)
        parts += puff(R * rnd.uniform(0.1, 0.13), (math.cos(a) * d, math.sin(a) * d, H * rnd.uniform(0.75, 0.9)),
                      G.cloud, under=G.cloudGrey, n=2, rnd=rnd, seg=9)
    return fit(parts, 'wd_ocean', v)



# ================================================================ the planet

def sph_dir(lat, lon):
    return Vector((math.cos(lat) * math.cos(lon), math.cos(lat) * math.sin(lon), math.sin(lat)))


def basis(d):
    u = d.cross(Vector((0, 0, 1)))
    if u.length < 1e-4:
        u = Vector((1, 0, 0))
    u.normalize()
    return u, d.cross(u).normalized()


def plate(R, d, ang, lift, color, rings=3, seg=16, sink=0.02, centre=(0, 0, 0), smooth=40):
    """A raised plate on a globe of radius R: everything within the angular
    outline ang(a) (radians) of direction d, standing `lift` (fraction of R)
    proud of the surface, its rim rounded over and a skirt sunk `sink` into
    the globe. Continents, ice caps, deserts."""
    c = Vector(centre)
    u, w = basis(d)
    bm = bmesh.new()

    def P(th, a, rr):
        q = d * math.cos(th) + (u * math.cos(a) + w * math.sin(a)) * math.sin(th)
        return c + q * rr
    top = R * (1 + lift)
    cv = bm.verts.new(P(0, 0, top))
    loops = []
    for k in range(1, rings + 1):
        loops.append([bm.verts.new(P(ang(TAU * j / seg) * k / rings * 0.94, TAU * j / seg, top)) for j in range(seg)])
    loops.append([bm.verts.new(P(ang(TAU * j / seg) * 0.985, TAU * j / seg, R * (1 + lift * 0.55))) for j in range(seg)])
    loops.append([bm.verts.new(P(ang(TAU * j / seg), TAU * j / seg, R * (1 - sink))) for j in range(seg)])
    for j in range(seg):
        bm.faces.new((cv, loops[0][j], loops[0][(j + 1) % seg]))
    for A, B in zip(loops, loops[1:]):
        for j in range(seg):
            bm.faces.new((A[j], A[(j + 1) % seg], B[(j + 1) % seg], B[j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    # an open cap: make it face away from the globe's centre
    tot = 0.0
    for f in bm.faces:
        f.normal_update()
        tot += f.normal.dot(f.calc_center_median() - c)
    if tot < 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces)
    o = _from_bmesh(bm, 'plate')
    paint(o, color)
    return _smooth(o, smooth)


def onglobe(o, d, R, centre, lift):
    """Turn a part built round the origin (its up = +Z) to stand on the globe
    at direction d, `lift` x R from the centre."""
    q = Vector((0, 0, 1)).rotation_difference(d)
    m = q.to_matrix()
    c = Vector(centre)
    deform(o, lambda p: m @ p + c + d * (R * lift))
    return o


@model('wd_planet', ao=0.35)
def wd_planet(v):
    """The planet: a deep blue toy globe with raised continents painted by
    latitude — ice at the poles, jungle on the equator, deserts on the dry
    belts, green and steppe between — polar caps, deep-ocean patches, a
    scatter of flat white weather, one cyclone, and a string of city lights
    glowing on the night side."""
    rnd = random.Random(2000 + v)
    R = 24.82
    C0 = (0, 0, R)
    nd = Noise(200 + v, scale=R * 0.5, octaves=3)
    parts = []
    globe = sphere(R, at=C0, color=G.ocean, seg=28)
    recolor(globe, lambda c, n: L(G.oceanDeep) if nd(c.x + c.z * 0.7, c.y - c.z * 0.4) > 0.25 else
            (L(G.abyss) if nd(c.x * 1.7, c.y * 1.7 + c.z) < -0.55 else None))
    parts.append(globe)
    cen = Vector(C0)
    biomes = [G.land, G.steppe, G.forest]

    def land_col(c, n):
        p = (c - cen).normalized()
        lat = math.degrees(math.asin(max(-1.0, min(1.0, p.z))))
        k = nd(c.x * 1.4, c.y * 1.4 + c.z)
        if n.dot(p) < 0.6:
            return L(G.rockDk)
        if abs(lat) > 62:
            return L(G.snow)
        if abs(lat) > 50:
            return L(G.tundra)
        if 17 < abs(lat) < 34 and k > 0.0:
            return L(G.sandDeep) if k > 0.45 else (L(G.sand) if k > 0.12 else L(G.landDry))
        if abs(lat) < 13:
            return L(G.jungle)
        return L(biomes[(v + (1 if k > 0.2 else 0) + (2 if k < -0.3 else 0)) % 3])
    # continents: a big one, two middling, two small — a shelf round each
    conts = [(rnd.uniform(-0.3, 0.4), rnd.uniform(0, TAU), 0.62), (rnd.uniform(-0.8, -0.2), 0, 0.42),
             (rnd.uniform(0.2, 0.8), 0, 0.4), (rnd.uniform(-0.5, 0.5), 0, 0.26), (rnd.uniform(-0.9, 0.9), 0, 0.22)]
    lon0 = conts[0][1]
    for i, (lat, lon, size) in enumerate(conts):
        if i:
            lon = lon0 + i * TAU / 5 + rnd.uniform(-0.3, 0.3)
        d = sph_dir(lat, lon)
        ph = [rnd.uniform(0, TAU) for _ in range(3)]
        ang = (lambda size, ph: lambda a: size * (1 + 0.22 * math.cos(2 * a + ph[0]) + 0.14 * math.cos(3 * a + ph[1])
                                                  + 0.08 * math.cos(5 * a + ph[2])))(size, ph)
        parts.append(plate(R, d, lambda a, f=ang: f(a) * 1.12, 0.012, G.shelf, rings=1, seg=12, centre=C0))
        pl = plate(R, d, ang, 0.045, G.land, rings=3 if size > 0.3 else 2, seg=20 if size > 0.3 else 12, centre=C0)
        recolor(pl, land_col)
        parts.append(pl)
    # polar ice
    for sgn in (1, -1):
        parts.append(plate(R, Vector((0, 0, sgn)), lambda a: 0.36 * (1 + 0.1 * math.cos(3 * a + v) + 0.06 * math.cos(5 * a)),
                           0.03, G.snow, rings=2, seg=16, centre=C0))
    # weather: flat puffs lying on the air
    for i in range(7):
        lat = math.asin(rnd.uniform(-0.85, 0.85))
        d = sph_dir(lat, rnd.uniform(0, TAU))
        r = R * rnd.uniform(0.09, 0.14)
        o = blob(r, (0, 0, 0), G.cloud, seg=8, rings=3, scale=(1.5, 0.9, 0.3), rot=(0, 0, rnd.uniform(0, 180)))
        parts.append(onglobe(o, d, R, C0, 1.075))
    # one cyclone over open ocean: a white swirl round a grey eye
    d = sph_dir(math.radians(rnd.uniform(15, 25)) * (1 if v % 2 else -1), lon0 + math.pi)
    sw = torus(R * 0.09, R * 0.035, color=G.cloud, seg=14, rseg=5, arc=300)
    deform(sw, lambda p: Vector((p.x, p.y, p.z * 0.6)))
    parts.append(onglobe(sw, d, R, C0, 1.08))
    eye = blob(R * 0.035, (0, 0, 0), G.storm, seg=8, rings=3, scale=(1, 1, 0.4))
    parts.append(onglobe(eye, d, R, C0, 1.07))
    # city lights strung across the night side of the big continent
    for i in range(7):
        lat, lon, size = conts[0]
        dd = sph_dir(lat + (i / 6 - 0.5) * size * 1.2, lon0 + size * 0.35 * math.sin(i * 1.9))
        o = blob(R * 0.022, (0, 0, 0), G.lamp, seg=6, rings=2, scale=(1, 1, 0.5))
        glow(o, 0.8)
        parts.append(onglobe(o, dd, R, C0, 1.045))
    return fit(parts, 'wd_planet', v, uniform=True)
