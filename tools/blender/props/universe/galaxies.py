"""Universe-stage props, the galaxies: dwarf spheroidal and dwarf, irregular,
spiral, barred, lenticular, elliptical and giant elliptical, the quasar and
the active nucleus with its jets, the interacting and merging pairs, the
Lyman-alpha blob, the compact group and the radio lobe pair.

Frame reminder (see kit.py): Blender Z is up, X is the prop's width, and the
game's FRONT (+Z) is Blender -Y. v1 (src/world/props/universe.js, with the
shared helpers in spacekit.js) is authored in the game frame and every build
is a multiple of one span `SP[...]`, so these are too: each part is made about
its own origin IN THE GAME FRAME, moved with v1's own opts (x, y, z, rx, ry,
rz — three's 'YXZ' Euler) by `place()`, which also turns it into Blender's
frame, and the finished prop is `fit()` to its catalogue box (the stretch
that takes is printed as `MODEL-RAW` and stays a few percent: the layout is
v1's).

The look: a premium toy of the deep sky. Discs are crisp closed annuli in two
or three tones; spiral arms and tidal tails are ONE smooth flattened ribbon
each, graded from the hot inner end to a cooler tip, never a string of beads;
bulges and cores are clean high-segment globes, lit pale at the middle; star
clusters and knots are small low-poly beads. v1's ghost decoration (discs,
arms, jets, lobes, shells) is modelled too: it is most of what a galaxy looks
like, and the spec box includes it.

Glow: universe.js registers no glow colours. Of the spacekit helpers it calls,
`swarm()` (0.5), `ring()` (0.5) and `jet()` (beam 0.6, knots 0.78, lobe 0.6)
self-light, so exactly those parts glow here: u_dsph's stars, u_lenticular's
dust-lane ring and u_quasar's jets. `U_.glow` is a colour name, not a glow.
"""
import math
import random
import bmesh
from mathutils import Vector, Matrix
import kit
from kit import (box, cyl, sphere, torus, lathe, extrude, tube, arc_points,
                 subdivide, deform, recolor, lin, mixc, paint, glow, C, SETS)
from kit import _from_bmesh, _smooth

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
PI = math.pi

# v1's stage tin (U_ in universe.js) — deliberately not in the shared palette.
U = type('U', (), dict(
    space=0x04030a, ink=0x07060e,
    spaceLit=0x312952, slate=0x494766, slateLit=0x68648b,
    hollow=0x3d2c66, hollowRim=0x6347a0, violet=0x7e50e2, violetDim=0x57369c,
    gold=0xa8813a, goldDim=0xb68a42, goldPale=0xd8bb79, amber=0xc99a45,
    red=0xd45a42, redDim=0x803629, ember=0xb4552e,
    blue=0x7fa8cf, bluePale=0xcfe2f5, blueDim=0x5c8dbd, cyan=0x7eecff, ice=0xeaf2ff,
    halo=0x4b6390, haloLit=0x6e96ce, shock=0xc4703c, glow=0xf3f7ff, jet=0x9fd4e8, radio=0x9b7ee4,
))

# v1's spans (SP in universe.js): every dimension of a build is a multiple
SP = dict(dsph=8.46, dwarf=12.6, irregular=18.3, spiral=27.5, barred=36.1, lenticular=46.3,
          elliptical=50.3, quasar=48.5, giantell=78.6, pair=128.3, lyman=108.6, merger=238.8,
          agn=105.2, compact=197.5, lobes=259.7)


# ---------------------------------------------------------------- colour

def L(col):
    return lin(col) if isinstance(col, int) else col


def lt(col, t=0.35):
    return mixc(L(col), (1.0, 1.0, 1.0), t)


def dk(col, t=0.25):
    return mixc(L(col), (0.0, 0.0, 0.0), t)


def mix(a, b, t):
    return mixc(L(a), L(b), max(0.0, min(1.0, t)))


def smooth01(e0, e1, x):
    t = max(0.0, min(1.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


def rng(pid, v):
    return random.Random(f'galaxies:{pid}:{v}')


# ---------------------------------------------------------------- frames

# game (x, y, z) -> Blender (x, -z, y): a proper rotation, so normals survive
BASIS = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))


def rot3(rx=0.0, ry=0.0, rz=0.0):
    """three's Euler 'YXZ' = Ry . Rx . Rz, as a 4x4."""
    return Matrix.Rotation(ry, 4, 'Y') @ Matrix.Rotation(rx, 4, 'X') @ Matrix.Rotation(rz, 4, 'Z')


def place(o, at=(0, 0, 0), rx=0.0, ry=0.0, rz=0.0):
    """o's mesh is in the game frame about its origin; apply v1's opts and
    convert to Blender."""
    o.data.transform(BASIS @ Matrix.Translation(Vector(at)) @ rot3(rx, ry, rz))
    o.data.update()
    return o


def outward(o, c=(0, 0, 0)):
    """Flip a closed shell so its faces look away from c (mesh coordinates)."""
    me = o.data
    cv = Vector(c)
    s = sum((p.center - cv).dot(p.normal) * p.area for p in me.polygons)
    if s < 0:
        me.flip_normals()
    me.update()
    return o


def rings_mesh(rings, closed=True, cap0=False, cap1=False, name='rings'):
    """Faces between consecutive rings of points (a ring of one is a pole)."""
    bm = bmesh.new()
    vr = [[bm.verts.new(p) for p in r] for r in rings]
    for a, b in zip(vr, vr[1:]):
        if len(a) == 1 and len(b) == 1:
            continue
        if len(a) == 1:
            n = len(b)
            for j in range(n if closed else n - 1):
                bm.faces.new((a[0], b[(j + 1) % n], b[j]))
        elif len(b) == 1:
            n = len(a)
            for j in range(n if closed else n - 1):
                bm.faces.new((a[j], a[(j + 1) % n], b[0]))
        else:
            n = len(a)
            for j in range(n if closed else n - 1):
                j2 = (j + 1) % n
                bm.faces.new((a[j], a[j2], b[j2], b[j]))
    if cap0 and len(vr[0]) > 2:
        bm.faces.new(list(reversed(vr[0])))
    if cap1 and len(vr[-1]) > 2:
        bm.faces.new(vr[-1])
    return _from_bmesh(bm, name)


def vpaint(o, fn):
    """Per-vertex colour from fn(mesh-space position Vector)."""
    return paint(o, (0, 0, 0), lambda p: L(fn(p)))


# ---------------------------------------------------------------- shapes

def ell(a, b, c, col, at=(0, 0, 0), seg=12, hseg=8, rx=0.0, ry=0.0, rz=0.0, vfn=None, warp=None,
        smooth=80):
    """v1's `b.ellip(a, b, c)` (half-extents, poles on game Y) in the game
    frame. seg x hseg costs 2 * seg * (hseg - 1) triangles, so a 6 x 4 bead
    is 36 and a 24 x 12 globe 528. vfn(unit Vector) paints per vertex;
    warp(unit Vector) -> radius factor makes it lumpy."""
    rings = [[Vector((0, b, 0))]]
    units = []
    for i in range(1, hseg):
        th = PI * i / hseg
        ring = []
        for j in range(seg):
            ph = TAU * j / seg
            u = Vector((math.sin(th) * math.cos(ph), math.cos(th), math.sin(th) * math.sin(ph)))
            k = warp(u) if warp else 1.0
            ring.append(Vector((u.x * a * k, u.y * b * k, u.z * c * k)))
        rings.append(ring)
    rings.append([Vector((0, -b, 0))])
    o = rings_mesh(rings, name='ell')
    outward(o)
    if vfn:
        vpaint(o, lambda p: vfn(Vector((p.x / a, p.y / b, p.z / c)).normalized()))
    else:
        paint(o, L(col))
    place(o, at, rx, ry, rz)
    return _smooth(o, smooth)


def bead(r, col, at=(0, 0, 0), seg=6, hseg=4, scale=(1, 1, 1), rx=0.0, ry=0.0, rz=0.0):
    """A small low-poly ball: a star, a knot, a globular cluster."""
    return ell(r * scale[0], r * scale[1], r * scale[2], col, at, seg, hseg, rx, ry, rz)


def disc(r0, r1, t, cols, at=(0, 0, 0), seg=40, cuts=None, under=None, rx=0.0, ry=0.0, rz=0.0,
         round_rim=True):
    """spacekit's `annulus` / `gradedDisc`: a thin closed slab from r0 to r1
    (half-thickness t), its top split at the radii in `cuts` into crisp bands
    coloured from `cols` (inner to outer), its underside a shade darker. The
    outer rim is rounded, so edge-on it reads as a soft bright line."""
    cuts = list(cuts or [])
    top = [r0] + cuts + [r1 - t * 0.6]
    prof = [(r, t) for r in top]
    if round_rim:
        prof += [(r1 - t * 0.12, t * 0.6), (r1, 0.0), (r1 - t * 0.12, -t * 0.6), (r1 - t * 0.6, -t)]
    else:
        prof += [(r1, t), (r1, -t)]
    prof += [(r0, -t)]
    rings = [[Vector((r * math.cos(TAU * j / seg), y, r * math.sin(TAU * j / seg))) for j in range(seg)]
             for (r, y) in prof]
    rings.append(rings[0])
    bm = bmesh.new()
    vr = [[bm.verts.new(p) for p in r] for r in rings[:-1]]
    vr.append(vr[0])
    for a, b in zip(vr, vr[1:]):
        for j in range(seg):
            j2 = (j + 1) % seg
            bm.faces.new((a[j], a[j2], b[j2], b[j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = _from_bmesh(bm, 'disc')
    bounds = [r0] + cuts + [r1 * 2]
    low = under if under is not None else dk(cols[len(cols) // 2], 0.25)

    def fn(c, n):
        if n.y < -0.5:
            return L(low)
        r = math.hypot(c.x, c.z)
        for k in range(len(bounds) - 1):
            if r < bounds[k + 1]:
                return L(cols[min(k, len(cols) - 1)])
        return L(cols[-1])
    paint(o, L(cols[0]))
    recolor(o, fn)
    place(o, at, rx, ry, rz)
    return _smooth(o, 40)


def plate(r0, r1, t, cols, cut=None, under=None, seg=40):
    """A cheaper thin ring than `disc`: a wedge in section — flat top (two
    tones split at `cut`), a sharp outer rim, a sloped underside — so it is
    closed and visible from both sides at four faces round. Game frame,
    UNPLACED (the caller moves it in the Blender frame)."""
    prof = [(r0, t)] + ([(cut, t)] if cut else []) + [(r1, 0.0), (r0, -t)]
    rings = [[Vector((r * math.cos(TAU * j / seg), y, r * math.sin(TAU * j / seg))) for j in range(seg)]
             for (r, y) in prof]
    bm = bmesh.new()
    vr = [[bm.verts.new(p) for p in r] for r in rings]
    vr.append(vr[0])
    for a, b in zip(vr, vr[1:]):
        for j in range(seg):
            j2 = (j + 1) % seg
            bm.faces.new((a[j], a[j2], b[j2], b[j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = _from_bmesh(bm, 'plate')
    low = under if under is not None else dk(cols[0], 0.3)

    def fn(c, n):
        if n.y < 0:
            return L(low)
        return L(cols[0] if (cut is None or math.hypot(c.x, c.z) < cut) else cols[-1])
    paint(o, L(cols[0]))
    recolor(o, fn)
    place(o)
    return _smooth(o, 40)


def ribbon(pts, rfn, cfn, n=8, sx=1.0, sy=1.0, up=(0, 1, 0), caps=2, smooth=70):
    """A smooth tube through game-frame `pts`: radius rfn(t), section sx
    (side) by sy (up-ish), rounded ends of `caps` rings, coloured per vertex
    by cfn(t) along its length (t = 0..1). A spiral arm, a tidal tail, a jet."""
    P = [Vector(p) for p in pts]
    m = len(P)
    tans = [(P[min(m - 1, i + 1)] - P[max(0, i - 1)]).normalized() for i in range(m)]
    UP = Vector(up)
    frames = []
    for T in tans:
        Uv = UP - T * UP.dot(T)
        if Uv.length < 1e-6:
            Uv = Vector((1, 0, 0)) - T * T.x
        Uv.normalize()
        frames.append((T, T.cross(Uv).normalized(), Uv))
    rings = []   # (centre, radius, frame, t)
    r0 = rfn(0.0)
    for k in range(caps, 0, -1):
        a = (PI / 2) * k / caps
        rings.append((P[0] - tans[0] * r0 * math.sin(a) * max(sx, sy) * 0.9, r0 * math.cos(a), frames[0], 0.0))
    for i in range(m):
        t = i / (m - 1)
        rings.append((P[i], rfn(t), frames[i], t))
    r1 = rfn(1.0)
    for k in range(1, caps + 1):
        a = (PI / 2) * k / caps
        rings.append((P[-1] + tans[-1] * r1 * math.sin(a) * max(sx, sy) * 0.9, r1 * math.cos(a), frames[-1], 1.0))
    pts_r = []
    ts = []
    for (p, r, (T, Sd, Uv), t) in rings:
        if r < 1e-7:
            pts_r.append([p.copy()])
        else:
            pts_r.append([p + Sd * (math.cos(TAU * j / n) * r * sx) + Uv * (math.sin(TAU * j / n) * r * sy)
                          for j in range(n)])
        ts.append(t)
    o = rings_mesh(pts_r, name='ribbon', cap0=len(pts_r[0]) > 1, cap1=len(pts_r[-1]) > 1)
    me = o.data
    # orient: the middle ring's faces must look away from the centreline
    k = len(pts_r) // 2
    s = 0.0
    for poly in me.polygons:
        if (k - 1) * n <= poly.index < k * n:
            s += (poly.center - rings[k][0]).dot(poly.normal)
    if s < 0:
        me.flip_normals()
    # per-vertex colour by ring (vertices were made ring by ring)
    sizes = [len(r) for r in pts_r]
    vt = []
    for ri, sz in enumerate(sizes):
        vt += [ts[ri]] * sz
    attr = me.color_attributes.get('base') or me.color_attributes.new('base', 'FLOAT_COLOR', 'CORNER')
    for poly in me.polygons:
        for li in poly.loop_indices:
            c = L(cfn(vt[me.loops[li].vertex_index]))
            attr.data[li].color = (*c, 1.0)
    place(o)
    return _smooth(o, smooth)


def spiral_pts(r0, r1, a0, sweep, y, n=16, pw=0.78, wob=0.0, ph=0.0):
    """spacekit's `spiralArm` centreline, game frame: d = r0 + (r1 - r0) t^pw
    at angle a0 + sweep t."""
    pts = []
    for i in range(n):
        t = i / (n - 1)
        a = a0 + sweep * t
        d = r0 + (r1 - r0) * math.pow(t, pw)
        pts.append((math.cos(a) * d, y + math.sin(t * 5 + ph) * wob, math.sin(a) * d))
    return pts


def arm(r0, r1, a0, sweep, y, width, cols, n=16, thick=0.32, taper=0.55, pw=0.78, seg=8):
    """A spiral arm as ONE flat ribbon: as wide as v1's elements (2.1 s), as
    thick as their height, tapering outwards and graded through `cols`."""
    pts = spiral_pts(r0, r1, a0, sweep, y, n, pw)

    def cf(t):
        f = t * (len(cols) - 1)
        i = min(len(cols) - 2, int(f))
        return mix(cols[i], cols[i + 1], f - i)
    return ribbon(pts, lambda t: width * (1 - t * taper), cf, n=seg, sx=1.0, sy=thick)


def hoop(R, t, col, at=(0, 0, 0), rx=0.0, ry=0.0, rz=0.0, seg=32, rseg=6):
    """spacekit's `ring()`: a thin torus, FLAT at rx = 0."""
    o = torus(R, t, color=L(col), seg=seg, rseg=rseg)
    # kit's torus lies in Blender XY = flat already once in the game frame it
    # is in XY = upright; turn it flat in the game frame first
    o.data.transform(Matrix.Rotation(PI / 2, 4, 'X'))
    place(o, at, rx, ry, rz)
    return o


# ---------------------------------------------------------------- fit

def target(pid, v):
    """The catalogue box in the BLENDER frame: (width X, depth Y, height Z)."""
    s = kit.SPECS[pid]['boxes'][v]['size']
    return (s[0], s[2], s[1])


def bounds(parts):
    lo = [1e18] * 3
    hi = [-1e18] * 3
    for o in parts:
        for vt in o.data.vertices:
            for i in range(3):
                lo[i] = min(lo[i], vt.co[i])
                hi[i] = max(hi[i], vt.co[i])
    return lo, hi


def fit(parts, pid, v, loose=()):
    """Scale the prop, per axis, about its footprint centre and its floor, so
    its bounding box is exactly the catalogue box. The layout is v1's, so the
    stretch printed here stays within a few percent.

    v1 scatters its knots and clusters with its own random stream, which this
    file cannot replay, so the footprint they make differs a little per
    variant. Parts in `loose` (free-floating knots, never a body) are first
    spread or gathered across the floor, each moved whole and unscaled, until
    the footprint matches; only what is left over is a stretch."""
    want = target(pid, v)
    for _ in range(8 if loose else 0):
        lo, hi = bounds(parts)
        cx, cy = (lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2
        k = [max(0.8, min(1.25, want[i] / max(1e-9, hi[i] - lo[i]))) for i in range(2)]
        for g in loose:
            g = g if isinstance(g, (list, tuple)) else [g]
            plo, phi = bounds(g)
            px, py = (plo[0] + phi[0]) / 2, (plo[1] + phi[1]) / 2
            dx, dy = (px - cx) * (k[0] - 1), (py - cy) * (k[1] - 1)
            for o in g:
                o.data.transform(Matrix.Translation((dx, dy, 0)))
                o.data.update()
    lo, hi = bounds(parts)
    cx, cy = (lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2
    k = [want[i] / max(1e-9, hi[i] - lo[i]) for i in range(3)]
    print(f'MODEL-RAW {pid}__{v} stretch x{k[0]:.3f} y{k[2]:.3f} z{k[1]:.3f}  (game frame)')
    for o in parts:
        for vt in o.data.vertices:
            p = vt.co
            vt.co = Vector(((p.x - cx) * k[0], (p.y - cy) * k[1], (p.z - lo[2]) * k[2]))
        o.data.update()
    return parts


# ================================================================= DWARFS

@model('u_dsph', ao=0.4)
def u_dsph(v):
    """The faintest thing in the catalogue: a soft golden ball of old stars,
    paler towards its unresolved middle, studded with self-lit stars (v1's
    `swarm`, glow 0.5) that straddle its surface where they can be seen."""
    S = SP['dsph']
    H = S * 1.5
    sq = 0.86 + v * 0.06
    rnd = rng('u_dsph', v)
    yc = H * 0.5
    body = ell(S * 0.97, H * 0.5 * 0.97, S * sq * 0.97, U.goldDim, at=(0, yc, 0), seg=20, hseg=10,
               vfn=lambda u: mix(U.goldPale, U.goldDim, smooth01(0.1, 1.0, math.hypot(u.x, u.z) * 0.8 + (0.5 - u.y * 0.5) * 0.45)))
    parts = [body]
    cols = [U.goldPale, U.red, U.gold, U.goldPale, U.redDim]
    n = 15
    for i in range(n):
        # Fibonacci directions so the stars are even, not clumped
        t = (i + 0.5) / n
        ph = math.acos(1 - 2 * t * 0.92 - 0.04)
        th = PI * (1 + math.sqrt(5)) * i + v
        u = Vector((math.sin(ph) * math.cos(th), math.cos(ph), math.sin(ph) * math.sin(th)))
        rr = S * rnd.uniform(0.07, 0.12)
        d = rnd.uniform(0.98, 1.06)
        p = (u.x * S * d, yc + u.y * H * 0.5 * d, u.z * S * sq * d)
        st = bead(rr, cols[i % len(cols)], at=p, seg=6, hseg=4)
        glow(st, 0.5)
        parts.append(st)
    return fit(parts, 'u_dsph', v)


@model('u_dwarf', ao=0.4)
def u_dwarf(v):
    """Lumpy and still forming: a dusky violet body ringed by knots of young
    blue and older gold and red stars, each a pair of soft lumps; the odd
    variants wear a bright young cluster on top (v1 buried it in the body)."""
    S = SP['dwarf']
    H = S * 1.34
    yc = H * 0.5
    rnd = rng('u_dwarf', v)
    lump = lambda u: 1.0 + 0.05 * math.sin(u.x * 5 + v) * math.sin(u.z * 4 + 1) + 0.04 * math.sin(u.y * 6)
    body = ell(S, H * 0.5, S * 0.9, U.spaceLit, at=(0, yc, 0), seg=18, hseg=9, warp=lump,
               vfn=lambda u: mix(U.slateLit, U.spaceLit, smooth01(-0.2, 0.9, 0.55 - u.y * 0.6 + math.hypot(u.x, u.z) * 0.5)))
    parts = [body]
    knots = []
    cols = [U.blue, U.goldDim, U.redDim]
    for i in range(8):
        a = (i / 8) * TAU + rnd.random() * 0.9
        dd = S * (1.05 + rnd.random() * 0.45)
        sx = S * (0.15 + rnd.random() * 0.12)
        sy = H * (0.13 + rnd.random() * 0.11)
        y = H * (0.3 + rnd.random() * 0.4)
        ry = rnd.random() * TAU
        col = cols[i % 3]
        c = Vector((math.cos(a) * dd, y, math.sin(a) * dd))
        # the knot: a big soft lump and a smaller, paler one riding on it
        k1 = ell(sx, sy, S * 0.14, col, at=c, seg=8, hseg=4, ry=ry)
        off = Vector((math.cos(a + 1.2), 0.0, math.sin(a + 1.2))) * sx * 0.55
        k2 = ell(sx * 0.55, sy * 0.7, S * 0.09, lt(col, 0.3), at=c + off + Vector((0, sy * 0.35, 0)),
                 seg=6, hseg=4, ry=ry + 0.8)
        # one knot = both lumps, moved together
        knots.append([k1, k2])
        parts += [k1, k2]
    # a few young knots on the body itself, so it is not a bare egg from above
    for i in range(3):
        a = v * 1.3 + i * 2.1
        u = Vector((math.cos(a) * 0.55, 0.0, math.sin(a) * 0.55))
        u.y = math.sqrt(max(0.0, 1 - u.x * u.x - u.z * u.z))
        parts.append(bead(S * 0.09, U.blue if i else U.bluePale, at=(u.x * S, yc + u.y * H * 0.5, u.z * S * 0.9)))
    if v % 2:
        parts.append(bead(S * 0.13, U.bluePale, at=(S * 0.12, H * 0.94, 0), seg=10, hseg=6))
    return fit(parts, 'u_dwarf', v, loose=knots)


@model('u_irregular', ao=0.4)
def u_irregular(v):
    """No symmetry at all: a torn sheet of young blue star formation running
    right across and out past a dusky body. Where the sheet crosses the body
    it is painted on as a crisp blue band with a pale spine; past the body it
    is one lumpy flattened ribbon each side; bright knots ride along it and
    two ice-white clusters sit on top."""
    S = SP['irregular']
    H = S * 1.24
    yc = H * 0.5
    D = S * 0.82
    rnd = rng('u_irregular', v)
    X0 = S * 1.34

    def zpath(x):
        t = (x + X0) / (2 * X0)
        return math.sin(t * 4.1 + v) * S * 0.52

    def ysurf(x, z):
        return yc + H * 0.5 * math.sqrt(max(0.0, 1 - (x / S) ** 2 - (z / D) ** 2))
    def skin(u):
        gx, gy, gz = u.x * S, yc + u.y * H * 0.5, u.z * D
        base = mix(U.slate, U.spaceLit, smooth01(-0.2, 0.9, 0.55 - u.y * 0.6 + math.hypot(u.x, u.z) * 0.4))
        if gy < H * 0.25:
            return base
        w = S * (0.2 + 0.05 * math.sin(gx * 0.5 + v))
        d = abs(gz - zpath(gx)) / w
        c = mix(U.blue, base, smooth01(0.75, 1.3, d))
        return mix(U.bluePale, c, smooth01(0.15, 0.5, d))
    body = ell(S, H * 0.5, D, U.spaceLit, at=(0, yc, 0), seg=22, hseg=12,
               warp=lambda u: 1.0 + 0.04 * math.sin(u.x * 4 + v * 2) * math.cos(u.z * 3), vfn=skin)
    parts = [body]
    # the sheet past the body, each side: a lumpy ribbon from inside the body out
    lumps = [rnd.uniform(0, TAU) for _ in range(4)]
    for side in (-1, 1):
        n = 10
        pts = []
        for i in range(n):
            t = i / (n - 1)
            x = side * (S * 0.55 + t * (X0 - S * 0.55))
            z = zpath(x)
            pts.append((x, H * (0.46 + 0.06 * math.sin(t * 5 + v + side)), z))
        rad = (lambda ph: lambda t: S * (0.21 + 0.05 * math.sin(t * 9 + ph) + 0.035 * math.sin(t * 17 + ph * 2)) * (1 - 0.3 * t))(lumps[side + 1])
        parts.append(ribbon(pts, rad, lambda t: mix(U.blue, U.blueDim, t * 1.2),
                            n=9, sx=1.0, sy=0.7))
        # a pale knot near each tip
        p = Vector(pts[-3])
        parts.append(bead(S * 0.1, U.bluePale, at=(p.x, p.y + rad(0.8) * 0.6, p.z)))
    # knots of star formation along the band on top of the body
    for i in range(5):
        x = S * (-0.7 + 0.35 * i + rnd.uniform(-0.08, 0.08))
        z = zpath(x) + rnd.uniform(-0.08, 0.08) * S
        parts.append(bead(S * rnd.uniform(0.07, 0.1), U.ice if i % 2 else U.bluePale,
                          at=(x, ysurf(x, z) - S * 0.02, z)))
    for i in range(2):
        x = S * (-0.45 + 0.9 * i + rnd.uniform(-0.1, 0.1))
        z = zpath(x) + S * (0.4 if i else -0.4)
        parts.append(bead(S * 0.11, U.ice, at=(x, ysurf(x, z), z), seg=8, hseg=5))
    return fit(parts, 'u_irregular', v)


# ================================================================= DISC GALAXIES

def dome_top(R, Hh, yc, d):
    """The height of an ellipsoid's top (half-width R, half-height Hh, centre
    yc) at distance d from its axis, or None outside it."""
    if d >= R:
        return None
    return yc + Hh * math.sqrt(1 - (d / R) ** 2)


def draped_arm(r0, r1, a0, sweep, floor, lens, width, thick, cols, n=18, taper=0.55, seg=6, lift=0.0,
               start_y=None):
    """A spiral arm ribbon that climbs over the lens (`lens` = (R, Hh, yc))
    near the middle and lies on the disc (`floor`, the height of its centre
    line out there) beyond it, so the whole sweep shows from above."""
    R, Hh, yc = lens
    pts = []
    for i in range(n):
        t = i / (n - 1)
        a = a0 + sweep * t
        d = r0 + (r1 - r0) * math.pow(t, 0.78)
        w = width * (1 - t * taper)
        top = dome_top(R * 1.02, Hh, yc, d)
        y = floor if top is None else max(floor, top + w * thick * 0.2 + lift)
        if start_y is not None:
            y = max(y, start_y + (floor - start_y) * smooth01(0.0, 0.35, t))
        pts.append((math.cos(a) * d, y, math.sin(a) * d))
    # ease the step where the arm leaves the lens
    for _ in range(2):
        ys = [p[1] for p in pts]
        pts = [(p[0], (ys[max(0, i - 1)] + 2 * ys[i] + ys[min(n - 1, i + 1)]) / 4 if i else ys[0], p[2])
               for i, p in enumerate(pts)]

    def cf(t):
        f = t * (len(cols) - 1)
        i = min(len(cols) - 2, int(f))
        return mix(cols[i], cols[i + 1], f - i)
    return ribbon(pts, lambda t: width * (1 - t * taper), cf, n=seg, sx=1.0, sy=thick)


def lens_skin(core, mid, rim):
    """Paint for a galaxy's lens: pale on top in the middle, through the body
    colour, a shade darker towards the rim and underneath."""
    def f(u):
        rr = math.hypot(u.x, u.z)
        c = mix(core, mid, smooth01(0.15, 0.75, rr + max(0.0, -u.y) * 0.6))
        return mix(c, rim, smooth01(0.7, 1.0, rr) * 0.6)
    return f


@model('u_spiral', ao=0.35)
def u_spiral(v):
    """THE prop the player named: a galaxy that looks like a galaxy. A broad
    amber lens with a pale bulge, a thin two-tone blue disc, and two or three
    arms as smooth ribbons that wind over the lens and out across the disc,
    graded blue to ice-white, with a few pale star clusters along them."""
    S = SP['spiral']
    H = S * 0.8
    yc = H * 0.5
    rnd = rng('u_spiral', v)
    t = H * 0.025
    parts = []
    parts.append(ell(S * 0.66, H * 0.5, S * 0.66, U.amber, at=(0, yc, 0), seg=26, hseg=12,
                     vfn=lens_skin(U.goldPale, U.amber, U.goldDim)))
    parts.append(disc(S * 0.6, S * 1.5, t, [U.blue, U.blueDim, U.spaceLit], at=(0, yc, 0), seg=40,
                      cuts=[S * 0.94, S * 1.19], under=U.spaceLit, rx=0.006))
    parts.append(ell(S * 0.2, H * 0.62, S * 0.2, U.goldPale, at=(0, yc, 0), seg=14, hseg=8,
                     vfn=lambda u: mix(U.glow, U.goldPale, smooth01(0.3, 0.9, math.hypot(u.x, u.z)))))
    arms = 2 + (v % 2)
    floor = yc + t + S * 0.075 * 0.26
    for k in range(arms):
        a0 = (k / arms) * TAU + v * 0.5
        parts.append(draped_arm(S * 0.22, S * 1.46, a0, 3.3, floor, (S * 0.66, H * 0.5, yc),
                                S * 1.48 * 0.075 * 0.95, 0.3, [U.bluePale, U.blue, U.bluePale, U.ice, U.blue],
                                n=18 if arms == 2 else 16, seg=6))
        # star clusters strung along the arm, on its outer half
        for j in range(2):
            tt = 0.5 + 0.25 * j + rnd.uniform(-0.05, 0.05)
            a = a0 + 3.3 * tt
            d = S * 0.22 + S * 1.24 * math.pow(tt, 0.78)
            parts.append(bead(S * 0.045, U.ice, at=(math.cos(a) * d, floor + S * 0.03, math.sin(a) * d)))
    return fit(parts, 'u_spiral', v)


@model('u_barred', ao=0.35)
def u_barred(v):
    """The bar is the whole point of the name: a fat amber bar standing proud
    of the lens, a pale bulge at its middle, and the two arms springing from
    the BAR ENDS (not the centre) and winding out over a two-tone disc."""
    S = SP['barred']
    H = S * 0.78
    yc = H * 0.5
    ba = v * 0.7
    rnd = rng('u_barred', v)
    t = H * 0.025
    parts = []
    base = lens_skin(dk(U.amber, 0.2), dk(U.gold, 0.35), U.redDim)
    bx, bz = math.cos(ba), math.sin(ba)

    def lens_paint(u):
        # the bar, painted across the top of the lens as well as standing on it
        along = abs(u.x * bx + u.z * bz)
        perp = abs(-u.x * bz + u.z * bx)
        w = 0.38 * math.sqrt(max(0.0, 1 - (along / 1.12) ** 2))
        k = smooth01(w * 0.75, w * 1.05, perp)
        c = base(u) if u.y < 0.15 else mix(mix(lt(U.goldPale, 0.3), U.amber, smooth01(0.45, 1.0, along)), base(u), k)
        return c
    parts.append(ell(S * 0.64, H * 0.5, S * 0.64, U.amber, at=(0, yc, 0), seg=28, hseg=12, vfn=lens_paint))
    parts.append(disc(S * 0.58, S * 1.46, t, [U.blue, U.blueDim, U.spaceLit], at=(0, yc, 0), seg=40,
                      cuts=[S * 0.9, S * 1.16], under=U.spaceLit, rx=0.006))
    # the bar along angle ba (three's ry turns +x to (cos, -sin), so ry = -ba)
    parts.append(ell(S * 0.72, H * 0.36, S * 0.22, U.amber, at=(0, yc + H * 0.16, 0), seg=20, hseg=10, ry=-ba,
                     vfn=lambda u: mix(lt(U.goldPale, 0.3), U.amber, smooth01(0.45, 1.0, abs(u.x) * 0.8 + max(0.0, -u.y)))))
    parts.append(ell(S * 0.2, H * 0.42, S * 0.2, U.goldPale, at=(0, yc, 0), seg=14, hseg=8,
                     vfn=lambda u: mix(U.glow, U.goldPale, smooth01(0.3, 0.9, math.hypot(u.x, u.z)))))
    floor = yc + t + S * 0.075 * 0.26
    for sgn in (0.0, PI):
        a0 = ba + sgn
        # from the bar's tip: start on its end, at the bar's own height
        parts.append(draped_arm(S * 0.64, S * 1.42, a0, 2.9, floor, (S * 0.6, H * 0.5, yc),
                                S * 1.44 * 0.075 * 0.95, 0.3, [U.goldPale, U.bluePale, U.blue, U.ice, U.blue],
                                n=18, seg=6, start_y=yc + H * 0.2))
    for i in range(3):
        a = rnd.random() * TAU
        dd = S * (0.95 + rnd.random() * 0.45)
        parts.append(bead(S * 0.055, U.ice, at=(math.cos(a) * dd, floor + S * 0.02, math.sin(a) * dd)))
    return fit(parts, 'u_barred', v)


@model('u_lenticular', ao=0.35)
def u_lenticular(v):
    """A spiral that ran out of gas: a big pale bulge on a smooth gold lens,
    a clean disc in two gold tones and NO arms — the absence is the identity
    — with the one dust lane it has left as a thin dark-red ring (self-lit at
    0.5, as v1's `ring()` is) and a few globular clusters round it."""
    S = SP['lenticular']
    H = S * 0.76
    yc = H * 0.5
    rnd = rng('u_lenticular', v)
    t = H * 0.03
    parts = []
    parts.append(ell(S * 0.68, H * 0.5, S * 0.68, U.goldDim, at=(0, yc, 0), seg=26, hseg=10,
                     vfn=lens_skin(U.goldPale, U.goldDim, U.gold)))
    parts.append(disc(S * 0.62, S * 1.36, t, [U.amber, U.goldDim, U.amber], at=(0, yc, 0), seg=44,
                      cuts=[S * 0.98, S * 1.2], under=U.gold, rx=0.004))
    parts.append(ell(S * 0.42, H * 0.56, S * 0.42, U.goldPale, at=(0, yc, 0), seg=22, hseg=12,
                     vfn=lambda u: mix(mix(U.glow, U.goldPale, 0.45), U.goldPale, smooth01(0.2, 0.85, math.hypot(u.x, u.z)))))
    lane = hoop(S * 1.12, S * 1.12 * 0.016, U.redDim, at=(0, yc + H * 0.015 + t * 0.5, 0), rx=0.03, seg=44, rseg=6)
    glow(lane, 0.5)
    parts.append(lane)
    for i in range(5):
        a = rnd.random() * TAU
        dd = S * (0.78 + rnd.random() * 0.5)
        parts.append(bead(S * 0.045, U.goldPale, at=(math.cos(a) * dd, yc + t + S * 0.03, math.sin(a) * dd)))
    return fit(parts, 'u_lenticular', v)


# ================================================================= ELLIPTICALS

def isophotes(cols, edges, soft=0.04):
    """Paint for an elliptical: concentric bands of brightness round the top
    pole (the isophotes a photograph of one shows), from the middle out,
    `edges` in unit-radius, each edge softened by `soft`."""
    def f(u):
        rr = math.hypot(u.x, u.z) if u.y > 0 else 2.0 - math.hypot(u.x, u.z)
        c = cols[0]
        for k, e in enumerate(edges):
            c = mix(c, cols[k + 1], smooth01(e - soft, e + soft, rr))
        return c
    return f


@model('u_elliptical', ao=0.35)
def u_elliptical(v):
    """An elliptical really is a smooth blob, so the body stays one clean gold
    egg, painted in soft concentric isophotes pale to deep; what makes it a
    galaxy and not a rock is its halo of globular clusters outside it."""
    S = SP['elliptical']
    H = S * 1.1
    sq = 0.84 + v * 0.06
    rnd = rng('u_elliptical', v)
    parts = [ell(S, H * 0.5, S * sq, U.gold, at=(0, H * 0.5, 0), seg=26, hseg=12, ry=v * 0.5,
                 vfn=isophotes([lt(U.goldPale, 0.25), U.goldPale, U.amber, U.gold, dk(U.gold, 0.25)],
                               [0.22, 0.48, 0.74, 1.3], 0.05))]
    loose = []
    for i in range(9):
        a = rnd.random() * TAU
        dd = S * (1.08 + rnd.random() * 0.45)
        b = bead(S * 0.05, U.goldPale if i % 3 else U.red,
                 at=(math.cos(a) * dd, H * (0.2 + rnd.random() * 0.6), math.sin(a) * dd), seg=7, hseg=5)
        parts.append(b)
        loose.append(b)
    return fit(parts, 'u_elliptical', v, loose=loose)


@model('u_giantell', ao=0.35)
def u_giantell(v):
    """A giant elliptical: the same isophote-painted gold egg, much bigger,
    with the feature that sets it apart standing OUT of the body — three thin
    red shells, the rings of the smaller galaxies it has eaten, at three
    heights and three turns — and a crowd of globular clusters."""
    S = SP['giantell']
    H = S * 1.06
    rnd = rng('u_giantell', v)
    parts = [ell(S, H * 0.5, S * 0.88, U.gold, at=(0, H * 0.5, 0), seg=26, hseg=12, ry=v * 0.6,
                 vfn=isophotes([lt(U.goldPale, 0.3), U.goldPale, U.amber, U.gold, dk(U.gold, 0.25)],
                               [0.18, 0.42, 0.7, 1.3], 0.05))]
    for i in range(3):
        dd = S * (1.05 + i * 0.22)
        sh = plate(dd - S * 0.26, dd, H * 0.045, [U.red], under=U.redDim, seg=36)
        # v1's shell: an ellipse dd x 0.9 dd turned i * 0.9 about the axis.
        # Each is a ring wide enough to overlap the next, so from above the
        # three step down like terraces (separated thin rings read as a
        # ringed planet), with a hair of tilt each so the steps catch light
        m = (Matrix.Translation((0, 0, H * (0.4 + i * 0.1))) @ Matrix.Rotation(i * 0.9, 4, 'Z')
             @ Matrix.Rotation((0.02 if i % 2 else -0.02) + v * 0.005, 4, 'X') @ Matrix.Diagonal((1, 0.9, 1, 1)))
        sh.data.transform(m)
        sh.data.update()
        parts.append(sh)
    loose = []
    for i in range(9):
        a = rnd.random() * TAU
        dd = S * (1.12 + rnd.random() * 0.5)
        b = bead(S * 0.045, U.goldPale if i % 4 else U.red,
                 at=(math.cos(a) * dd, H * (0.2 + rnd.random() * 0.6), math.sin(a) * dd))
        parts.append(b)
        loose.append(b)
    return fit(parts, 'u_giantell', v, loose=loose)


# ================================================================= JETS

def beam(y0, y1, r0, r1, col, seg=10, cfn=None):
    """A straight round beam along game Y from y0 to y1, radius r0 to r1,
    with rounded ends (a ribbon on a straight line)."""
    n = 6
    pts = [(0.0, y0 + (y1 - y0) * i / (n - 1), 0.0) for i in range(n)]
    return ribbon(pts, lambda t: r0 + (r1 - r0) * t, cfn or (lambda t: col), n=seg, up=(1, 0, 0), caps=2)


@model('u_quasar', ao=0.3)
def u_quasar(v):
    """The one object whose whole fame is a beam you can see from the other
    side of the universe. A dusky host galaxy with its blazing accretion disc
    showing as a hot band round the middle, stub beams top and bottom with
    pale hot-spots, and the real jets (v1's ghost `jet()`, self-lit: beam 0.6,
    knots 0.78, lobes 0.6) running on four times the prop's height to the
    lobes where they finally stop."""
    S = SP['quasar']
    H = S * 2.3
    yc = H * 0.5

    def host_paint(u):
        e = abs(u.y)
        c = mix(U.slate, U.spaceLit, smooth01(0.1, 0.9, e))
        c = mix(U.ember, c, smooth01(0.16, 0.26, e))
        c = mix(U.goldPale, c, smooth01(0.05, 0.12, e))
        return c
    parts = [ell(S, H * 0.34, S * 0.9, U.spaceLit, at=(0, yc, 0), seg=24, hseg=14, vfn=host_paint)]
    # the bright eye where the beam leaves the host, top and bottom
    for s in (-1, 1):
        parts.append(ell(S * 0.2, S * 0.08, S * 0.2, U.glow, at=(0, yc + s * H * 0.335, 0), seg=12, hseg=5,
                         vfn=lambda u: mix(U.glow, U.goldPale, smooth01(0.3, 1.0, math.hypot(u.x, u.z)))))
    # the stubs: v1's three stacked tapering cylinders, as one tapered beam
    for s in (-1, 1):
        y0 = yc + s * H * 0.1
        y1 = yc + s * H * (0.1 + 0.13 + 0.08)
        parts.append(beam(y0, y1, S * 0.13 * 1.0, S * 0.1 * 0.55, U.jet, seg=12,
                          cfn=lambda t: mix(U.ice, U.jet, smooth01(0.0, 0.5, t))))
        parts.append(bead(S * (0.1 + v * 0.02), U.bluePale, at=(0, yc + s * H * 0.46, 0), seg=10, hseg=6))
    # the ghost jets, self-lit
    L1 = H * 1.5
    r = L1 * 0.012
    for s in (-1, 1):
        y0 = yc + s * H * 0.5
        b = beam(y0, y0 + s * L1, r, r * 0.6, U.jet, seg=8)
        glow(b, 0.6)
        parts.append(b)
        for i in range(1, 5):
            t = i / 5
            k = bead(r * (1.9 - t * 0.6), U.bluePale, at=(0, y0 + s * L1 * t, 0))
            glow(k, 0.78)
            parts.append(k)
        lobe = ell(L1 * 0.075, L1 * 0.075 * 0.66, L1 * 0.075, U.bluePale, at=(0, y0 + s * L1 * 1.02, 0),
                   seg=14, hseg=8, warp=lambda u: 1.0 + 0.06 * math.sin(u.x * 5 + 1) * math.sin(u.z * 4),
                   vfn=lambda u: mix(U.ice, U.bluePale, smooth01(-0.2, 0.8, -u.y * s)))
        glow(lobe, 0.6)
        parts.append(lobe)
    return fit(parts, 'u_quasar', v)


# ================================================================= CLOUDS

def cloud(blobs, centre, seg=28, hseg=14, p=8.0, at=(0, 0, 0), shade=None, noise=None, pc=None):
    """ONE soft lumpy surface round a cluster of overlapping ellipsoids,
    instead of the bag of separate balls v1 stacks: a sphere about `centre`
    whose every ray is pushed out to where it leaves the blobs, the blobs
    blended by a soft maximum (p) so the creases between lobes are rounded
    and the colours (one per blob) melt into each other. Each blob is
    (centre, (a, b, c), colour, ry). Game frame. shade(colour, unit dir) can
    tint the result (a paler crown, a deeper underside)."""
    C0 = Vector(centre)
    prep = []
    for (P, (a, b, c), col, ry) in blobs:
        R = Matrix.Rotation(-ry, 3, 'Y')   # world -> blob (three's ry about +Y)
        prep.append((Vector(P), Vector((1 / a, 1 / b, 1 / c)), L(col), R))
    smallest = min(min(ax) for (_, ax, _, _) in blobs)

    def ray(u):
        ts = []
        for (P, inv, col, R) in prep:
            mu = R @ u
            mc = R @ (C0 - P)
            mu = Vector((mu.x * inv.x, mu.y * inv.y, mu.z * inv.z))
            mc = Vector((mc.x * inv.x, mc.y * inv.y, mc.z * inv.z))
            A = mu.dot(mu)
            B = 2 * mu.dot(mc)
            Cc = mc.dot(mc) - 1
            disc_ = B * B - 4 * A * Cc
            t = (-B + math.sqrt(disc_)) / (2 * A) if disc_ > 0 else 0.0
            ts.append((max(t, 0.0), col))
        tot = sum(t ** p for t, _ in ts)
        r = max(tot ** (1 / p), smallest * 0.5)
        q = pc or p
        totc = sum(t ** q for t, _ in ts)
        if tot > 0 and totc > 0:
            w = [(t ** q) / totc for t, _ in ts]
            col = tuple(sum(w[i] * ts[i][1][k] for i in range(len(ts))) for k in range(3))
        else:
            col = ts[0][1]
        return r, col
    rings = []
    cols = []
    for i in range(hseg + 1):
        th = PI * i / hseg
        ring = []
        n = 1 if i in (0, hseg) else seg
        for j in range(n):
            ph = TAU * j / seg
            u = Vector((math.sin(th) * math.cos(ph), math.cos(th), math.sin(th) * math.sin(ph)))
            r, col = ray(u)
            if noise:
                amp, ph0 = noise
                r *= 1.0 + amp * (math.sin(u.x * 5 + ph0) * math.sin(u.z * 4 + ph0 * 2) + 0.6 * math.sin(u.y * 7 + ph0))
            ring.append(C0 + u * r)
            cols.append(shade(col, u) if shade else col)
        rings.append(ring)
    o = rings_mesh(rings, name='cloud')
    outward(o, C0)
    me = o.data
    attr = me.color_attributes.get('base') or me.color_attributes.new('base', 'FLOAT_COLOR', 'CORNER')
    for poly in me.polygons:
        for li in poly.loop_indices:
            attr.data[li].color = (*L(cols[me.loops[li].vertex_index]), 1.0)
    place(o, at)
    return _smooth(o, 80)


@model('u_lyman', ao=0.35)
def u_lyman(v):
    """A Lyman-alpha blob: a vast diffuse glow of gas with proto-galaxies
    buried in it. One soft lumpy cloud in three tones (violet lobes, cyan
    lobes, the deeper violet of its dense middle), paler on its crown, with
    the young proto-galaxies breaking its surface as small pale knots."""
    S = SP['lyman']
    H = S * 1.34
    rnd = rng('u_lyman', v)
    blobs = []
    for i in range(8):
        a = (i / 8) * TAU + rnd.random() * 0.6
        d = S * (0.36 + rnd.random() * 0.26)
        rr = S * (0.3 + rnd.random() * 0.14)
        hh = H * (0.26 + rnd.random() * 0.16)
        y = H * (0.34 + rnd.random() * 0.28)
        blobs.append(((math.cos(a) * d, y, math.sin(a) * d), (rr, hh, rr * 0.9),
                      U.cyan if i % 3 == 2 else U.violet, 0.0))
    blobs.append(((0, H * 0.46, 0), (S * 0.34, H * 0.3, S * 0.34), U.hollowRim, 0.0))
    blobs = respread(blobs, 'u_lyman', v, (0, H * 0.46, 0))
    body = cloud(blobs, (0, H * 0.46, 0), seg=32, hseg=16, p=7.0,
                 shade=lambda c, u: mixc(mixc(c, L(U.hollowRim), smooth01(0.1, -0.8, u.y) * 0.5),
                                         (1, 1, 1), smooth01(0.4, 1.0, u.y) * 0.18))
    parts = [body]
    # proto-galaxies: pale knots set into the cloud's surface
    me = body.data
    verts = [vt.co.copy() for vt in me.vertices]
    c0 = Vector((0, 0, H * 0.46))
    for i in range(2 + v):
        a = rnd.random() * TAU
        el = 0.5 + rnd.random() * 0.5
        dirn = Vector((math.cos(a) * math.cos(el), math.sin(el), math.sin(a) * math.cos(el)))
        db = Vector((dirn.x, -dirn.z, dirn.y))
        best = max(verts, key=lambda q: (q - c0).normalized().dot(db))
        k = bead(S * 0.1, U.bluePale, seg=10, hseg=6, scale=(1, 0.8, 0.9))
        k.data.transform(Matrix.Translation(best - (best - c0).normalized() * S * 0.03))
        k.data.update()
        parts.append(k)
    return fit(parts, 'u_lyman', v)


def respread(blobs, pid, v, centre, it=10):
    """v1 lays its lobes out with a random stream this file cannot replay, so
    the box they fill differs per variant. Move the lobes' centres (not their
    sizes) away from or towards `centre`, per axis, until the extent of the
    group matches the catalogue box."""
    want = kit.SPECS[pid]['boxes'][v]['size']   # game x, y, z
    c = Vector(centre)
    out = [(Vector(P), ax, col, ry) for (P, ax, col, ry) in blobs]
    for _ in range(it):
        lo = [min(P[i] - ax[i] for (P, ax, _, _) in out) for i in range(3)]
        hi = [max(P[i] + ax[i] for (P, ax, _, _) in out) for i in range(3)]
        k = [max(0.85, min(1.2, want[i] / (hi[i] - lo[i]))) for i in range(3)]
        out = [(Vector((c.x + (P.x - c.x) * k[0], c.y + (P.y - c.y) * k[1], c.z + (P.z - c.z) * k[2])), ax, col, ry)
               for (P, ax, col, ry) in out]
    return [(tuple(P), ax, col, ry) for (P, ax, col, ry) in out]


# ================================================================= PAIRS AND MERGERS

def face_on_spiral(arms, wind, core, arm_col, gap_col, ph=0.0, rim=None):
    """Paint for the top of a dome seen face on: a pale core and `arms`
    logarithmic arms of `arm_col` on `gap_col`."""
    def f(u):
        rr = math.hypot(u.x, u.z)
        if u.y < 0.0:
            return rim or gap_col
        th = math.atan2(u.z, u.x)
        w = math.sin(arms * (th - wind * math.log(max(rr, 0.05))) + ph)
        c = mix(gap_col, arm_col, smooth01(0.2, 0.75, w) * smooth01(0.12, 0.3, rr))
        c = mix(core, c, smooth01(0.1, 0.28, rr))
        if rim is not None:
            c = mix(c, rim, smooth01(0.8, 1.0, rr))
        return c
    return f


@model('u_pair', ao=0.35)
def u_pair(v):
    """Two galaxies in the middle of an encounter: one face on (a dark halo
    with its blue spiral and amber core painted across the top) and one edge
    on, gold with a dark dust lane; a bridge of blue stars between them, the
    stubs of the tidal tails thrown up and out, and the long curving tails
    themselves (v1's ghost arms) as smooth ribbons graded dim to pale."""
    S = SP['pair']
    R1, R2 = S * 0.6, S * 0.42
    x1, x2 = -S * 0.36, S * 0.52
    parts = []
    parts.append(ell(R1, R1 * 0.57, R1 * 0.96, U.spaceLit, at=(x1, R1 * 0.57, 0), seg=28, hseg=14,
                     vfn=face_on_spiral(2, 1.6, U.amber, U.blue, U.spaceLit, ph=v * 0.8, rim=dk(U.spaceLit, 0.1))))
    ry2 = 0.7 + v * 0.3

    def edge_on(u):
        e = abs(u.y + 0.05)
        c = mix(U.goldPale, U.goldDim, smooth01(0.0, 0.55, math.hypot(u.x * 0.8, u.z)))
        return mix(U.redDim, c, smooth01(0.05, 0.13, e))
    parts.append(ell(R2, R2 * 0.72, R2 * 0.86, U.goldDim, at=(x2, R1 * 0.55, 0), seg=22, hseg=12, ry=ry2,
                     vfn=edge_on))
    # the bridge, sagging upward between them
    xa, xb = x1 + R1 * 0.7, x2 - R2 * 0.7
    pts = [(xa + (xb - xa) * i / 6, R1 * 0.5 + math.sin(PI * i / 6) * R1 * 0.14, 0.0) for i in range(7)]
    parts.append(ribbon(pts, lambda t: S * 0.05 * (1 - 0.3 * math.sin(PI * t)),
                        lambda t: mix(U.blue, U.bluePale, math.sin(PI * t)), n=8, sx=1.0, sy=0.75))
    # tidal tail stubs (solid in v1), as short rising ribbons
    for s in (-1, 1):
        pts = []
        for i in range(6):
            t = i / 5
            pts.append((s * (S * 0.36 + t * S * 0.33), R1 * (0.46 + t * 0.46), s * math.sin(t * 2.1) * S * 0.26))
        parts.append(ribbon(pts, lambda t: S * 0.065 * (1 - 0.35 * t), lambda t: mix(U.blue, U.blueDim, t),
                            n=8, sx=1.0, sy=0.55))
    # the long tails: v1's ghost spiral arms, centred on the pair
    for s in (-1, 1):
        a0 = 0.3 if s > 0 else PI + 0.3
        pts = spiral_pts(S * 0.6, S * 1.85, a0, s * 1.5, R1 * 0.62, n=16)
        w = S * 1.85 * 0.055
        parts.append(ribbon(pts, lambda t: w * 0.8 * (1 - t * 0.5),
                            lambda t: mix(mix(U.blueDim, U.blue, t * 2), U.bluePale, max(0.0, t * 2 - 1)),
                            n=8, sx=1.0, sy=0.38))
    return fit(parts, 'u_pair', v)


@model('u_merger', ao=0.35)
def u_merger(v):
    """The Antennae: two discs already inside one another, one blue and one
    red, each with its arms painted across it; a white-hot starburst where
    they touch, ice-white clusters round it, the tail stubs climbing away,
    and the two enormous curved tails (v1's ghost arms) as smooth ribbons."""
    S = SP['merger']
    R = S * 0.5
    rnd = rng('u_merger', v)
    parts = []
    for s in (-1, 1):
        armc = U.blueDim if s > 0 else U.redDim
        parts.append(ell(R, R * 0.34, R * 0.86, U.spaceLit, at=(s * S * 0.22, R * 0.4, s * S * 0.1), seg=24, hseg=12,
                         ry=s * 0.5, vfn=face_on_spiral(2, 1.4, U.goldPale, lt(armc, 0.15), U.spaceLit,
                                                         ph=s + v, rim=dk(U.spaceLit, 0.1))))
    parts.append(ell(R * 0.3, R * 0.26, R * 0.3, U.glow, at=(0, R * 0.48, 0), seg=16, hseg=9,
                     warp=lambda u: 1.0 + 0.07 * math.sin(u.x * 6) * math.sin(u.z * 5 + 1),
                     vfn=lambda u: mix(U.glow, U.bluePale, smooth01(0.2, 1.0, math.hypot(u.x, u.z) + max(0.0, -u.y)))))
    for i in range(4):
        a = rnd.random() * TAU
        d = R * (0.3 + 0.3 * rnd.random())
        parts.append(bead(R * 0.09, U.ice, at=(math.cos(a) * d, R * (0.5 + rnd.random() * 0.15), math.sin(a) * d)))
    for s in (-1, 1):
        pts = []
        for i in range(6):
            t = i / 5
            a = s * (0.6 + t * 1.5) + v * 0.4
            pts.append((s * S * 0.3 + math.cos(a) * S * t * 0.62, R * 0.4 + t * R * 0.36,
                        s * S * 0.14 + math.sin(a) * S * t * 0.4))
        c0, c1 = (U.blueDim, U.blue) if s > 0 else (U.redDim, U.red)
        parts.append(ribbon(pts, lambda t: S * 0.06 * (1 - 0.15 * t), lambda t: mix(c0, c1, t),
                            n=8, sx=1.0, sy=0.85))
    for s in (-1, 1):
        a0 = (0.5 if s > 0 else PI + 0.5) + v * 0.4
        pts = spiral_pts(S * 0.5, S * 2.1, a0, s * 1.9, R * 0.55, n=18)
        w = S * 2.1 * 0.05
        c0, c1 = (U.blueDim, U.redDim) if s > 0 else (U.redDim, U.blueDim)
        parts.append(ribbon(pts, lambda t: w * 0.85 * (1 - t * 0.5),
                            lambda t: mix(mix(c0, c1, t * 2), U.ice, max(0.0, t * 2 - 1)),
                            n=8, sx=1.0, sy=0.36))
    return fit(parts, 'u_merger', v)


# ================================================================= ACTIVE NUCLEI AND GROUPS

@model('u_agn', ao=0.3)
def u_agn(v):
    """An active nucleus: the host galaxy edge on, its red disc and hot core
    showing as bands round its middle, and two jets straight out of it (one
    smooth beam each way, flaring as it goes) that end in the working
    surfaces, lumpy two-tone clouds of radio plasma, with a pale hot-spot on
    the later variants."""
    S = SP['agn']
    H = S * 3.4
    mid = H * 0.5
    rnd = rng('u_agn', v)

    def host(u):
        e = abs(u.y)
        c = mix(U.slate, U.spaceLit, smooth01(0.1, 0.9, e))
        c = mix(U.redDim, c, smooth01(0.18, 0.3, e))
        c = mix(U.ember, c, smooth01(0.06, 0.14, e))
        return c
    parts = [ell(S, S * 0.3, S * 0.86, U.spaceLit, at=(0, mid, 0), seg=26, hseg=12, vfn=host)]
    for s in (-1, 1):
        y0 = mid + s * S * 0.2
        y1 = mid + s * (S * 0.25 + 0.875 * H * 0.4 + H * 0.05)
        parts.append(beam(y0, y1, S * 0.055, S * 0.14, U.jet, seg=12,
                          cfn=lambda t: mix(U.ice, U.jet, smooth01(0.0, 0.3, t))))
        ph = rnd.uniform(0, TAU)
        parts.append(ell(S * 0.34, S * 0.24, S * 0.34, U.radio, at=(0, mid + s * H * 0.46, 0), seg=16, hseg=9,
                         warp=lambda u, ph=ph: 1.0 + 0.1 * math.sin(u.x * 4 + ph) * math.sin(u.z * 3 + ph) + 0.05 * math.sin(u.y * 5),
                         vfn=lambda u, s=s: mix(U.radio, U.violetDim, smooth01(-0.3, 0.9, -u.y * s * 0.7 + math.hypot(u.x, u.z) * 0.5))))
        if v:
            parts.append(bead(S * 0.12, U.bluePale, at=(0, mid + s * H * 0.49, 0), seg=10, hseg=6))
    return fit(parts, 'u_agn', v)


def mini_galaxy(rr, hh, dz, host, discc, at, ry, seg=12):
    """A small disc galaxy for the groups: a host lens, a thin crisp disc
    and a pale bulge."""
    out = [ell(rr, hh, dz, host, at=at, seg=seg, hseg=6, ry=ry,
               vfn=lambda u: mix(lt(host, 0.2), host, smooth01(0.0, 0.8, math.hypot(u.x, u.z))))]
    pl = plate(rr * 0.5, rr * 1.4, hh * 0.18, [lt(discc, 0.2)], under=dk(discc, 0.35), seg=24)
    pl.data.transform(Matrix.Translation((at[0], -at[2], at[1] + hh * 0.15)) @ Matrix.Rotation(ry, 4, 'Z'))
    pl.data.update()
    out.append(pl)
    out.append(bead(rr * 0.24, U.goldPale, at=(at[0], at[1] + hh * 0.35, at[2]), seg=8, hseg=5))
    return out


@model('u_compact', ao=0.35)
def u_compact(v):
    """A compact group: galaxies studding a common halo of stripped stars,
    one sitting proud on top and four round the waist, each a small disc
    galaxy with its own crisp disc and bulge, and the tidal bridge between
    the two closest as a ribbon of pale stars."""
    S = SP['compact']
    H = S * 0.82
    rnd = rng('u_compact', v)
    parts = [ell(S, H * 0.5, S * 0.96, U.spaceLit, at=(0, H * 0.5, 0), seg=24, hseg=12,
                 vfn=lambda u: mix(mix(U.slate, U.spaceLit, 0.4), dk(U.spaceLit, 0.1),
                                   smooth01(-0.1, 0.9, 0.6 - u.y * 0.7 + math.hypot(u.x, u.z) * 0.3)))]
    loose = []
    want_h = kit.SPECS['u_compact']['boxes'][v]['size'][1]
    for i in range(5):
        a = (i / 5) * TAU + v * 0.4
        dd = S * (0.34 if i == 0 else 0.96)
        rr = S * (0.34 if i == 0 else 0.24 + rnd.random() * 0.08)
        yy = H * (0.78 if i == 0 else 0.52)
        hk = 0.4 + rnd.random() * 0.35
        if i == 0:
            # v1's random height for the galaxy on top sets the box's height;
            # take it back from the box rather than from a different random
            hk = max(0.3, min(0.8, (want_h - yy) / rr))
        ry = rnd.random() * TAU
        g = mini_galaxy(rr, rr * hk, rr * 0.92, U.goldDim if i % 2 else (U.slateLit if i == 0 else U.slate),
                        lt(U.amber, 0.1) if i % 2 else U.blue, (math.cos(a) * dd, yy, math.sin(a) * dd), ry)
        parts += g
        if i:
            loose.append(g)
    a = 0.2 + v * 0.4
    pts = [(math.cos(a) * S * (0.5 + t * 0.9), H * (0.56 + math.sin(t * 3) * 0.1), math.sin(a) * S * (0.5 + t * 0.9))
           for t in [i / 7 for i in range(8)]]
    parts.append(ribbon(pts, lambda t: S * (0.065 + 0.012 * math.sin(t * 19 + v)) * (1 - 0.35 * t),
                        lambda t: mix(U.slateLit, U.bluePale, 0.25 + math.sin(PI * t) * 0.45), n=8, sx=1.0, sy=0.5))
    return fit(parts, 'u_compact', v, loose=loose)


@model('u_lobes', ao=0.3)
def u_lobes(v):
    """A radio galaxy: a small gold elliptical with a hot core, tilted, with
    a smooth jet out of each side running to a great lobe of radio plasma
    (one soft lumpy cloud each, violet round a brighter middle) and a pale
    hot-spot where the jet hits."""
    S = SP['lobes']
    tilt = 0.5 + v * 0.1
    ca, sa = math.cos(tilt), math.sin(tilt)
    top = S * sa + S * 0.5
    parts = [ell(S * 0.26, S * 0.09, S * 0.22, U.goldDim, at=(0, top, 0), seg=20, hseg=10,
                 vfn=lambda u: mix(U.goldPale, U.goldDim, smooth01(0.2, 0.9, math.hypot(u.x, u.z))))]
    parts.append(bead(S * 0.08, U.ember, at=(0, top, 0), seg=10, hseg=6, scale=(1, 1.2, 1)))
    for s in (-1, 1):
        pts = [(s * ca * S * t, top + s * sa * S * t, 0.0) for t in [0.08 + 0.62 * i / 7 for i in range(8)]]
        parts.append(ribbon(pts, lambda t: S * 0.045 * (1 - 0.2 * t), lambda t: mix(U.ice, U.jet, smooth01(0.0, 0.4, t)),
                            n=10, sx=1.0, sy=1.0, up=(0, 0, 1)))
        lx, ly = s * ca * S * 0.74, top + s * sa * S * 0.74
        blobs = []
        for k in range(3):
            o = (k - 1) * S * 0.16
            blobs.append(((lx + s * ca * o, ly + s * sa * o, (k - 1) * S * 0.1),
                          (S * (0.3 - abs(k - 1) * 0.06), S * (0.26 - abs(k - 1) * 0.05), S * 0.24),
                          lt(U.radio, 0.15) if k == 1 else U.violet, 0.0))
        parts.append(cloud(blobs, (lx, ly, 0), seg=26, hseg=13, p=16.0, pc=40.0, noise=(0.05, v + s),
                           shade=lambda c, u: mixc(mixc(c, L(U.violetDim), smooth01(0.2, -0.9, u.y) * 0.5),
                                                   L(lt(U.radio, 0.3)), smooth01(0.45, 1.0, u.y) * 0.6)))
        parts.append(bead(S * 0.1, U.bluePale, at=(lx * 1.16, ly + s * sa * S * 0.12, 0), seg=10, hseg=6))
    return fit(parts, 'u_lobes', v)
