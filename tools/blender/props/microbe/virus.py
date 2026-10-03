"""Microbe-stage props: the culture's proteins, viruses and organelle-sized things.

Frame reminder (see kit.py): Blender Z is up, X is the prop's width, and the
game's FRONT (+Z) is Blender -Y. v1 (src/world/props/microbe.js) is authored in
the game frame, so every coordinate here is written as v1 writes it, game
(x, y, z), and `G()` turns it into Blender (x, -z, y) at the last moment. Each
model keeps v1's layout and numbers, so the sizes and the facing are v1's; what
changes is the making.

The look: soft premium toys. Glossy chunky balls and blobs (a painted
highlight, since vertex colour is all there is), clean tubes, one size and one
colour for every repeated element inside a prop. v1's microbe file has no
self-lit colours and no ghost parts, so nothing here glows and everything is
solid.

The colours are v1's local agar-plate palette (M in microbe.js), which is not
in palette.js; it is copied below.
"""
import math
import bmesh
from mathutils import Vector, Matrix
import kit
from kit import (box, cyl, sphere, torus, lathe, extrude, tube, arc_points,
                 subdivide, deform, recolor, lin, mixc, paint, glow, C, SETS)
from kit import _from_bmesh, _smooth, _bevel

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
GOLD = 2.399963229728653

# v1's agar-plate palette (M in src/world/props/microbe.js); not in palette.js.
M = type('M', (), dict(
    agar=0xf1e4b2, agarWarm=0xe4d18e, matrix=0xe9dcae, chalk=0xf7f2e2,
    jelly=0xa9d77f, jellyDeep=0x73ae56, jellyPale=0xd5edad, moss=0x578a42,
    membrane=0xf2a4b4, membraneD=0xcd7183, flesh=0xf8cdc3, coral=0xee8a72,
    nucleus=0x8d6bc6, nucleusD=0x63469b, lilac=0xc2aae5,
    amber=0xf5dc92, amberPale=0xfbf0cb, honey=0xe6bb5c,
    protein=0x85b3dc, proteinD=0x5a85b7, aqua=0x76cec1, aquaDeep=0x3d9a90,
    rust=0xc7704a, ink=0x4a4257,
))


# ---------------------------------------------------------------- helpers

def L(col):
    return lin(col) if isinstance(col, int) else col


def dk(col, t=0.2):
    return mixc(L(col), (0, 0, 0), t)


def lt(col, t=0.4):
    return mixc(L(col), (1, 1, 1), t)


def G(p):
    """game (x, y, z) -> Blender (x, -z, y)."""
    return Vector((p[0], -p[2], p[1]))


# game -> Blender as a matrix, for parts placed with v1's rx/ry/rz
P4 = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))


def grot(rx=0.0, ry=0.0, rz=0.0):
    """A game-frame Euler (radians, applied z then x then y), as a Blender-frame matrix."""
    m = Matrix.Rotation(ry, 4, 'Y') @ Matrix.Rotation(rx, 4, 'X') @ Matrix.Rotation(rz, 4, 'Z')
    return P4 @ m @ P4.inverted()


def _smoothstep(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


KEY = Vector((-0.38, -0.42, 0.82)).normalized()   # top, front-left: where the gloss sits


def gloss(o, col, c, sc=(1, 1, 1), hi=0.45, lo=0.16):
    """Paint a blob as a glossy toy: a soft white highlight towards the key
    light, the body colour, and a little weight underneath. `c` and `sc` are
    the Blender-frame centre and radii the normal is estimated from."""
    base = L(col)

    def fn(p):
        n = Vector(((p.x - c.x) / sc[0], (p.y - c.y) / sc[1], (p.z - c.z) / sc[2]))
        if n.length > 1e-9:
            n.normalize()
        s = n.dot(KEY)
        out = mixc(base, (1, 1, 1), hi * _smoothstep(0.72, 0.98, s))
        return mixc(out, (0, 0, 0), lo * max(0.0, -n.z))
    paint(o, (0, 0, 0), fn)
    return o


def ball(P, p, r, col, seg=(16, 8), sc=(1, 1, 1), hi=0.45, lo=0.16, rot=None):
    """A ball at game p, `sc` its game-frame stretch (an ellipsoid), glossed.
    `rot` an optional game-frame (rx, ry, rz) for a stretched one."""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg[0], v_segments=seg[1], radius=r)
    o = _from_bmesh(bm, 'ball')
    s = (sc[0], sc[2], sc[1])
    o.data.transform(Matrix.Diagonal((*s, 1.0)))
    if rot:
        o.data.transform(grot(*rot))
    c = G(p)
    o.data.transform(Matrix.Translation(c))
    o.data.update()
    if rot:
        paint(o, col)
        recolor(o, lambda fc, n: mixc(mixc(L(col), (1, 1, 1), hi * _smoothstep(0.72, 0.98, n.dot(KEY))),
                                      (0, 0, 0), lo * max(0.0, -n.z)))
    else:
        gloss(o, col, c, tuple(x * r for x in s), hi=hi, lo=lo)
    _smooth(o, 80)
    P.append(o)
    return o


def stick(P, p, q, r, col, seg=8, r2=None, caps=False):
    """A plain cylinder from game p to game q (uncapped by default: its ends
    are buried in whatever it joins)."""
    a, b = G(p), G(q)
    d = b - a
    ln = d.length
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=caps, cap_tris=False, segments=seg, radius1=r,
                          radius2=(r if r2 is None else r2), depth=ln)
    o = _from_bmesh(bm, 'stick')
    o.data.transform(d.to_track_quat('Z', 'Y').to_matrix().to_4x4())
    o.data.transform(Matrix.Translation((a + b) / 2))
    o.data.update()
    paint(o, col)
    _smooth(o, 60)
    P.append(o)
    return o


def capsule(P, p, q, r, col, seg=12, rings=7, hi=0.35, lo=0.14):
    """A rounded rod from game p to game q (the centres of its end caps): a UV
    sphere with an odd ring count, its two halves pulled apart."""
    a, b = G(p), G(q)
    d = b - a
    ln = d.length
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=r)
    for vt in bm.verts:
        vt.co.z += ln / 2 if vt.co.z > 0 else -ln / 2
    o = _from_bmesh(bm, 'capsule')
    o.data.transform(d.to_track_quat('Z', 'Y').to_matrix().to_4x4())
    o.data.transform(Matrix.Translation((a + b) / 2))
    o.data.update()
    paint(o, col)
    recolor(o, lambda fc, n: mixc(mixc(L(col), (1, 1, 1), hi * _smoothstep(0.72, 0.98, n.dot(KEY))),
                                  (0, 0, 0), lo * max(0.0, -n.z)))
    _smooth(o, 80)
    P.append(o)
    return o


def sweep(P, pts, r, col, n=10, radius=None, colfn=None, caps=True, smooth=70):
    """A round tube along game points, n-sided. `radius(t)` scales the radius
    along it (t 0..1), `colfn(i, t)` colours the band after ring i (None keeps
    `col`). Ends get domed caps when `caps`."""
    bm = bmesh.new()
    bp = [G(p) for p in pts]
    N = len(bp)
    rings_ = []
    for i, p in enumerate(bp):
        t = i / (N - 1)
        tg = (bp[min(i + 1, N - 1)] - bp[max(i - 1, 0)]).normalized()
        q = tg.to_track_quat('Z', 'Y').to_matrix()
        rr = r * (radius(t) if radius else 1.0)
        rings_.append([bm.verts.new(p + q @ Vector((math.cos(j / n * TAU) * rr, math.sin(j / n * TAU) * rr, 0)))
                       for j in range(n)])
    band = []
    for i in range(N - 1):
        a, b = rings_[i], rings_[i + 1]
        for j in range(n):
            bm.faces.new((a[j], a[(j + 1) % n], b[(j + 1) % n], b[j]))
            band.append(i)
    if caps:
        # a dome on each end: one extra ring pulled in, then a fan to a pole
        for end, sgn in ((0, -1), (N - 1, 1)):
            i2 = max(0, min(N - 1, end - sgn))
            tg = (bp[end] - bp[i2]).normalized()
            q = tg.to_track_quat('Z', 'Y').to_matrix()
            rr = r * (radius(end / (N - 1)) if radius else 1.0)
            mid = [bm.verts.new(bp[end] + tg * rr * 0.6 + q @ Vector((math.cos(j / n * TAU) * rr * 0.78,
                                                                       math.sin(j / n * TAU) * rr * 0.78, 0)))
                   for j in range(n)]
            pole = bm.verts.new(bp[end] + tg * rr * 0.95)
            ring = rings_[end]
            for j in range(n):
                bm.faces.new((ring[j], ring[(j + 1) % n], mid[(j + 1) % n], mid[j]))
                band.append(min(end, N - 2))
            for j in range(n):
                bm.faces.new((mid[j], mid[(j + 1) % n], pole))
                band.append(min(end, N - 2))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = _from_bmesh(bm, 'sweep')
    paint(o, col)
    if colfn:
        attr = o.data.color_attributes['base']
        for poly in o.data.polygons:
            i = band[poly.index]
            cc = colfn(i, i / max(1, N - 2))
            if cc is None:
                continue
            cc = L(cc)
            for li in poly.loop_indices:
                attr.data[li].color = (*cc, 1.0)
    _smooth(o, smooth)
    P.append(o)
    return o


def ico(P, c, R, col, rot=(0, 0, 0), sc=(1, 1, 1), bevel=0.08, face=None):
    """A bevelled icosahedron (circumradius R) at game c: flat faces, soft
    edges. `face(centre, normal)` may recolour faces (Blender frame, relative
    to the centre)."""
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=0, radius=R)
    o = _from_bmesh(bm, 'ico')
    o.data.transform(Matrix.Diagonal((sc[0], sc[2], sc[1], 1.0)))
    o.data.transform(grot(*rot))
    o.data.update()
    _bevel(o, R * bevel, 2, angle=30)
    paint(o, col)
    if face:
        recolor(o, face)
    o.data.transform(Matrix.Translation(G(c)))
    o.data.update()
    _smooth(o, 30)
    P.append(o)
    return o


def place(o, at=(0, 0, 0), rx=0.0, ry=0.0, rz=0.0):
    """Rotate a part built about the origin (Blender frame) by a game-frame
    Euler and move it to game `at`."""
    o.data.transform(grot(rx, ry, rz))
    o.data.transform(Matrix.Translation(G(at)))
    o.data.update()
    return o


def fit_uniform(P, pid, v):
    """One uniform scale about the origin that brings the prop's box closest to
    the catalogue box (geometric mean of the three axis ratios): used where v1
    was randomised, so its box is a sample and not a layout."""
    lo, hi = [1e9] * 3, [-1e9] * 3
    for o in P:
        for vt in o.data.vertices:
            for i in range(3):
                lo[i] = min(lo[i], vt.co[i])
                hi[i] = max(hi[i], vt.co[i])
    w = kit.SPECS[pid]['boxes'][v]['size']
    tgt = (w[0], w[2], w[1])
    k = 1.0
    for i in range(3):
        k *= tgt[i] / max(1e-9, hi[i] - lo[i])
    k = k ** (1 / 3)
    for o in P:
        o.data.transform(Matrix.Scale(k, 4))
        o.data.update()
    return P


def hash01(*a):
    x = math.sin(sum(v * k for v, k in zip(a, (12.9898, 78.233, 37.719, 4.581)))) * 43758.5453
    return x - math.floor(x)


def fib_dirs(n, phase=0.0):
    """n roughly even unit directions on a sphere (game frame)."""
    out = []
    for i in range(n):
        e = math.acos(1 - 2 * ((i + 0.5) / n))
        a = i * GOLD + phase
        out.append((math.sin(e) * math.cos(a), math.cos(e), math.sin(e) * math.sin(a)))
    return out


# ---------------------------------------------------------------- loose protein machinery

@model('antibody', ao=0.45)
def antibody(v):
    """The Y: a stem of two paired heavy chains, a hinge, and two arms each a
    heavy chain with its paler light chain laid along the outside, tipped with
    the amber binding sites. Stands on its stem, in the game XY plane, like v1."""
    col = [M.protein, M.aqua, M.lilac][v]
    light = lt(col, 0.45)
    P = []
    rh = 0.0021
    # Fc: the two heavy chains side by side
    for s in (-1, 1):
        capsule(P, (s * 0.0016, rh, 0), (s * 0.0016, 0.0104, 0), rh, col, seg=10, rings=5)
    ball(P, (0, 0.0119, 0), 0.0026, dk(col, 0.25), (10, 5), hi=0.3)
    sa, ca = math.sin(0.72), math.cos(0.72)
    for s in (-1, 1):
        d = (s * sa, ca)
        out = (s * ca, -sa)          # the outer side of this arm
        a0 = (s * 0.0010, 0.0125)
        a1 = (a0[0] + d[0] * 0.0084, a0[1] + d[1] * 0.0084)
        capsule(P, (a0[0], a0[1], 0), (a1[0], a1[1], 0), rh, col, seg=10, rings=5)
        # light chain along the outside of the distal part
        b0 = (a0[0] + d[0] * 0.0030 + out[0] * 0.0026, a0[1] + d[1] * 0.0030 + out[1] * 0.0026)
        b1 = (a0[0] + d[0] * 0.0080 + out[0] * 0.0026, a0[1] + d[1] * 0.0080 + out[1] * 0.0026)
        capsule(P, (b0[0], b0[1], 0), (b1[0], b1[1], 0), 0.0017, light, seg=10, rings=5)
        # the binding site
        tip = (a0[0] + d[0] * 0.0104 + out[0] * 0.0006, a0[1] + d[1] * 0.0104 + out[1] * 0.0006, 0)
        ball(P, tip, 0.0032, M.amber, (12, 6))
    return P


@model('enzyme', ao=0.5)
def enzyme(v):
    """A globular protein: a big body with three fused lobes, and the active-
    site cleft on top as a real pocket with the rust substrate sitting in it."""
    col = [M.amber, M.aqua, M.jellyPale, M.flesh][v]
    P = []
    R = 0.0088
    c = (0, 0.0098, 0)
    body = ball(P, c, R, col, (20, 10))
    # press the cleft into the crown
    cb = G(c)
    axis = Vector((0, 0, 1))

    def dent(p):
        n = (p - cb)
        if n.length < 1e-9:
            return p
        k = _smoothstep(0.55, 0.92, n.normalized().dot(axis))
        return p - axis * (R * 0.32 * k)
    deform(body, dent)
    pocket = dk(col, 0.22)
    recolor(body, lambda fc, n: pocket if (fc - cb).normalized().dot(axis) > 0.78 else None)
    lob = mixc(L(col), (0, 0, 0), 0.06)
    for i in range(3):
        a = (i / 3) * TAU + v * 0.4
        ball(P, (math.cos(a) * 0.0072, 0.0086 + (i % 2) * 0.004, math.sin(a) * 0.0072), 0.0052, lob, (12, 6))
    # the substrate, docked in the pocket
    ball(P, (0, 0.0158, 0), 0.0034, M.rust, (10, 5))
    return P


def _arrow(L_, w, hw, hl, t, col):
    """A beta strand as ribbon diagrams draw it: a flat arrow along +X,
    centred on the origin, `t` thick (Blender frame, lying flat). One bevel
    segment: the edges are short and a second segment is never seen."""
    x0, x1 = -L_ / 2, L_ / 2
    xs = x1 - hl
    poly = [(x0, -w / 2), (xs, -w / 2), (xs, -hw / 2), (x1, 0), (xs, hw / 2), (xs, w / 2), (x0, w / 2)]
    bm = bmesh.new()
    bot = [bm.verts.new((x, y, -t / 2)) for (x, y) in poly]
    top = [bm.verts.new((x, y, t / 2)) for (x, y) in poly]
    bm.faces.new(list(reversed(bot)))
    bm.faces.new(top)
    n = len(poly)
    for i in range(n):
        bm.faces.new((bot[i], bot[(i + 1) % n], top[(i + 1) % n], top[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = _from_bmesh(bm, 'arrow')
    _bevel(o, t * 0.3, 1)
    paint(o, col)
    return _smooth(o, 35)


@model('prion', ao=0.6)
def prion(v):
    """v1 stacks five bars at random. Here they are what a prion fibril is: a
    twisted stack of beta strands, drawn as ribbon-diagram arrows, alternating
    direction like a real sheet. v1 randomised the layout, so its box is a
    sample; the stack is scaled uniformly to it."""
    col = M.lilac if v == 1 else M.membraneD
    P = []
    AL, AW, AH, AHL = 0.0255, 0.0060, 0.0110, 0.0072

    def ang(i, base):
        return base + i * 0.42 + (hash01(v, i) - 0.5) * 0.2 + (math.pi if i % 2 else 0.0)

    # turn the whole stack to the angle whose footprint has v1's proportions
    w = kit.SPECS['prion']['boxes'][v]['size']
    outline = [(-AL / 2, -AW / 2), (AL / 2 - AHL, -AH / 2), (AL / 2, 0), (AL / 2 - AHL, AH / 2), (-AL / 2, AW / 2)]
    best, base = 1e9, 0.0
    for k in range(72):
        b = k / 72 * TAU
        xs, zs = [], []
        for i in range(5):
            a = ang(i, b)
            for (x, y) in outline:
                xs.append(x * math.cos(a) + y * math.sin(a))
                zs.append(-x * math.sin(a) + y * math.cos(a))
        err = abs(math.log((max(xs) - min(xs)) / (max(zs) - min(zs)) / (w[0] / w[2])))
        if err < best:
            best, base = err, b
    for i in range(5):
        c = col if i % 2 else M.nucleus
        o = _arrow(AL, AW, AH, AHL, 0.0028, c)
        ry = ang(i, base)
        rz = (hash01(i, v, 7) - 0.5) * 0.18
        jx = (hash01(v, i, 1) - 0.5) * 0.003
        jz = (hash01(v, i, 2) - 0.5) * 0.003
        place(o, (jx, 0.0030 + i * 0.0040, jz), rx=0.0, ry=ry, rz=rz)
        P.append(o)
    return fit_uniform(P, 'prion', v)


@model('ribosome', ao=0.55)
def ribosome(v):
    """Two subunits: the big lumpy one below with its rust stalk, the paler
    small one on top split into head and body, an mRNA strand threaded through
    the gap between them and a tRNA peeking out at the front."""
    big = M.honey if v else M.amber
    P = []
    ball(P, (0, 0.0126, 0), 0.0164, big, (22, 11), sc=(1.0, 0.7683, 0.939))
    # the central protuberance and the stalk
    ball(P, (0.0092, 0.0182, -0.004), 0.0072, M.rust, (12, 6), sc=(1.0, 0.722, 0.944))
    # small subunit: head and body
    sm = M.amberPale
    ball(P, (0.0030, 0.0290, 0.0010), 0.0094, sm, (16, 8), sc=(1.0, 0.92, 1.24))
    ball(P, (-0.0068, 0.0298, -0.0005), 0.0072, sm, (14, 7), sc=(1.0, 0.95, 1.2))
    # mRNA through the interface
    pts = [(-0.0160 + i * 0.0320 / 10, 0.0232 + 0.0007 * math.sin(i * 1.5), 0.0060 + 0.0012 * math.sin(i * 1.1))
           for i in range(11)]
    sweep(P, pts, 0.0013, M.aquaDeep, n=6)
    # tRNA in the A/P site
    ball(P, (-0.0045, 0.0246, 0.0105), 0.0030, M.aquaDeep, (10, 5), sc=(1.0, 1.3, 1.0))
    return P


# ---------------------------------------------------------------- virions

PHI = (1 + 5 ** 0.5) / 2


def icosa(P, c, R, col, seam, rot=(0, 0, 0), sc=(1, 1, 1), bevel=0.055, split=True):
    """A bevelled icosahedron of circumradius R at game c, two of its edges
    level at top and bottom (rot turns it, game frame). The flat plates keep
    `col`; the bevelled seams between them are painted `seam`, so it reads as
    a shell of triangular plates. Returns the part and its vertex directions
    and positions (Blender frame) for the penton knobs."""
    bm = bmesh.new()
    raw = []
    for a in (-1, 1):
        for b in (-1, 1):
            raw += [(0, a, b * PHI), (a, b * PHI, 0), (b * PHI, 0, a)]
    k = R / math.sqrt(1 + PHI * PHI)
    for p in raw:
        bm.verts.new((p[0] * k, p[1] * k, p[2] * k))
    bmesh.ops.convex_hull(bm, input=bm.verts)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    verts0 = [vt.co.copy() for vt in bm.verts]
    # split each plate into four, flat, when knobs sit on the corners: a plate
    # with only corner vertices bakes as dark as its darkest corner
    if split:
        bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=1, use_grid_fill=True)
    o = _from_bmesh(bm, 'icosa')
    m = grot(*rot)
    o.data.transform(m)
    o.data.update()
    fn = [pl.normal.copy() for pl in o.data.polygons]
    verts = [m @ p for p in verts0]
    _bevel(o, R * bevel, 2, angle=30)
    paint(o, col)
    sc_b = Vector((sc[0], sc[2], sc[1]))
    recolor(o, lambda fc, n: None if max(n.dot(f) for f in fn) > 0.995 else seam)
    o.data.transform(Matrix.Diagonal((*sc_b, 1.0)))
    cb = G(c)
    o.data.transform(Matrix.Translation(cb))
    o.data.update()
    _smooth(o, 25)
    P.append(o)
    pos = [cb + Vector((p.x * sc_b.x, p.y * sc_b.y, p.z * sc_b.z)) for p in verts]
    dirs = [p.normalized() for p in verts]
    return o, dirs, pos


def knob(P, at, d, r, col, flat=0.55, seg=(10, 5), hi=0.35):
    """A rounded stud at Blender point `at`, squashed along direction d."""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg[0], v_segments=seg[1], radius=r)
    o = _from_bmesh(bm, 'knob')
    o.data.transform(Matrix.Diagonal((1, 1, flat, 1)))
    o.data.transform(Vector(d).to_track_quat('Z', 'Y').to_matrix().to_4x4())
    o.data.transform(Matrix.Translation(at))
    o.data.update()
    paint(o, col)
    recolor(o, lambda fc, n: mixc(mixc(L(col), (1, 1, 1), hi * _smoothstep(0.72, 0.98, n.dot(KEY))),
                                  (0, 0, 0), 0.14 * max(0.0, -n.z)))
    _smooth(o, 80)
    P.append(o)
    return o


@model('capsid', ao=0.3)
def capsid(v):
    """The icosahedral shell v1's 6x4 sphere stood in for: twenty flat protein
    plates with dark seams and a pale penton knob at each of the twelve
    corners. v1's box is shallower than it is wide only because a 6-segment
    sphere is; the shell is pressed 10% front-to-back to meet it."""
    col = [M.protein, M.aqua, M.lilac][v]
    P = []
    R = 0.0215
    c = (0, R, 0)
    _, dirs, pos = icosa(P, c, R, col, M.proteinD, sc=(1, 1, 0.9))
    for d, p in zip(dirs, pos):
        knob(P, p, d, R * 0.2, M.amberPale, flat=0.6, seg=(8, 4))
    return P


@model('virion_spiky', ao=0.5)
def virion_spiky(v):
    """An enveloped virus: a glossy membrane ball crowned all over with club-
    headed spike proteins, every spike the same."""
    col = [M.membrane, M.coral, M.honey][v]
    P = []
    R = 0.0199
    cy = 0.026
    ball(P, (0, cy, 0), R, col, (20, 10))
    spike = M.rust
    for i, (sx, sy, sz) in enumerate(fib_dirs(16, 0.3 + v * 0.7)):
        a = (sx * R * 0.9, cy + sy * R * 0.9, sz * R * 0.9)
        b = (sx * R * 1.22, cy + sy * R * 1.22, sz * R * 1.22)
        stick(P, a, b, 0.0014, spike, seg=5)
        h = (sx * R * 1.21, cy + sy * R * 1.21, sz * R * 1.21)
        knob(P, G(h), G((sx, sy, sz)) - G((0, 0, 0)), 0.0035, spike, flat=0.8, seg=(6, 4))
    return P


def twisted_rod(P, xs, rs, y, n, twist, colfn, smooth=60):
    """A round rod along game X at height y: rings at xs with radii rs, each
    ring turned `twist` radians per unit length so the quads run in helices.
    `colfn(j)` colours column j. Both ends are closed with a fan."""
    bm = bmesh.new()
    rings_ = []
    for x, r in zip(xs, rs):
        ph = twist * (x - xs[0])
        rings_.append([bm.verts.new(G((x, y + math.cos(j / n * TAU + ph) * r, math.sin(j / n * TAU + ph) * r)))
                       for j in range(n)])
    col_of = []
    for i in range(len(rings_) - 1):
        a, b = rings_[i], rings_[i + 1]
        for j in range(n):
            bm.faces.new((a[j], a[(j + 1) % n], b[(j + 1) % n], b[j]))
            col_of.append(j)
    for ring, x in ((rings_[0], xs[0]), (rings_[-1], xs[-1])):
        pole = bm.verts.new(G((x, y, 0)))
        for j in range(n):
            bm.faces.new((ring[j], ring[(j + 1) % n], pole))
            col_of.append(-1)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = _from_bmesh(bm, 'rod')
    paint(o, (0, 0, 0))
    attr = o.data.color_attributes['base']
    for poly in o.data.polygons:
        cc = L(colfn(col_of[poly.index]))
        for li in poly.loop_indices:
            attr.data[li].color = (*cc, 1.0)
    _smooth(o, smooth)
    P.append(o)
    return o


@model('virus_rod', ao=0.55)
def virus_rod(v):
    """A tobacco-mosaic-style rod: the protein coat wound as a helix (ridged
    stripes in two greens running round it), rounded ends, and the pale RNA
    core showing at each end."""
    L_, R = 0.155, 0.0226
    base = M.jellyDeep if v else M.moss
    P = []
    n = 18
    xs, rs = [], []
    # rounded shoulders, then the straight coat
    ends = [(0.0, 0.62), (0.0016, 0.86), (0.0050, 0.97), (0.0095, 1.0)]
    for (dx, k) in ends:
        xs.append(-L_ / 2 + dx)
        rs.append(R * k)
    m = 16
    for i in range(1, m):
        xs.append(-L_ / 2 + 0.0095 + (L_ - 0.019) * i / m)
        rs.append(R)
    for (dx, k) in reversed(ends):
        xs.append(L_ / 2 - dx)
        rs.append(R * k)
    twisted_rod(P, xs, rs, R, n, TAU * 2.6 / L_,
                lambda j: lt(base, 0.05) if j < 0 else (M.jelly if (j // 3) % 2 else base))
    # the RNA core at each end
    for s in (-1, 1):
        x0 = s * (L_ / 2 - 0.002)
        x1 = s * (L_ * 1.02 / 2)
        stick(P, (x0, R, 0), (x1, R, 0), R * 0.28, M.amberPale, seg=12, caps=True)
    return P


def beaded(nb, per, bulge=0.12):
    """radius(t) for a tube of nb beads, each `per` rings long: swells in the
    middle of every bead and pinches between them."""
    def f(t):
        u = t * nb
        return 1.0 - bulge + bulge * math.sin(math.pi * (u - math.floor(u))) ** 0.7
    return f


@model('filament_virus', ao=0.55)
def filament_virus(v):
    """The long filament, wound into its ring and lying on the agar: one smooth
    beaded tube that tapers to its tail, its fifteen segments alternating
    v1's two colours."""
    R = 0.012
    col = [M.aquaDeep, M.nucleus, M.rust][v]
    nb, per = 15, 4
    N = nb * per + 1
    pts = []
    for i in range(N):
        t = i / (N - 1)
        a = t * 4.7 + v * 0.5
        rad = 0.075 - t * 0.016
        pts.append((math.cos(a) * rad, R, math.sin(a) * rad))
    bead = beaded(nb, per, 0.22)
    P = []
    sweep(P, pts, R, col, n=10, radius=lambda t: bead(t) * (1 - t * 0.2),
          colfn=lambda i, t: M.aqua if (i // per) % 2 else col)
    return P


@model('bacteriophage', ao=0.6)
def bacteriophage(v):
    """The lunar lander: an icosahedral head of plates with dark seams on a
    collar, a ringed contractile sheath, the core tube, a hexagonal baseplate
    and six jointed legs with rust feet."""
    col = M.protein if v else M.aqua
    dark = M.proteinD
    P = []
    # head: vertex-up, a little elongated like a T4's
    Rh = 0.0335
    tilt = math.atan2(1, PHI)
    icosa(P, (0, 0.1515, 0), Rh, col, dark, rot=(tilt, 0, 0), sc=(1, 1.08, 1), split=False)
    # collar
    lat = lathe([(0.0095, 0.0), (0.0128, 0.002), (0.0128, 0.006), (0.0100, 0.0085), (0.0, 0.0085)],
                color=dark, seg=16, close_bottom=True)
    place(lat, (0, 0.1063, 0))
    P.append(lat)
    # striated contractile sheath: six rings, one lathe
    prof = []
    y0, step, rr = 0.0584, 0.0083, 0.0104
    for i in range(6):
        y = y0 + i * step
        prof += [(rr * 0.86, y), (rr, y + step * 0.18), (rr, y + step * 0.82), (rr * 0.86, y + step)]
    sh = lathe(prof, color=col, seg=12, close_bottom=True, close_top=True, smooth=60)
    recolor(sh, lambda fc, n: dark if int((fc.z - y0) / step) % 2 else None)
    place(sh, (0, 0, 0))
    P.append(sh)
    # core tube under the sheath
    stick(P, (0, 0.050, 0), (0, 0.060, 0), 0.0040, M.amberPale, seg=10)
    # hexagonal baseplate
    bp = cyl(0.0185, 0.0078, color=M.membraneD, seg=6, bevel=0.0018)
    place(bp, (0, 0.0418, 0), ry=math.pi / 6)
    P.append(bp)
    # legs: up and out to a knee, then down to the foot
    for i in range(6):
        a = (i / 6) * TAU
        cx, cz = math.cos(a), math.sin(a)
        hip = (cx * 0.0150, 0.0455, cz * 0.0150)
        knee = (cx * 0.0330, 0.0530, cz * 0.0330)
        foot = (cx * 0.0432, 0.0040, cz * 0.0432)
        sweep(P, [hip, knee], 0.0026, dark, n=6, caps=False)
        ball(P, knee, 0.0031, dark, (8, 4), hi=0.25)
        sweep(P, [knee, foot], 0.0024, dark, n=6, caps=False)
        ball(P, foot, 0.0040, M.rust, (8, 5))
    return P


# ---------------------------------------------------------------- organelles and loose cell parts

def on_sphere(c, R, d, k=1.0):
    """Blender point at k*R along game direction d from game centre c, and the
    Blender direction."""
    dv = Vector(d).normalized()
    p = (c[0] + dv.x * R * k, c[1] + dv.y * R * k, c[2] + dv.z * R * k)
    return G(p), (G(dv) - G((0, 0, 0)))


@model('vesicle', ao=0.5)
def vesicle(v):
    """A membrane bubble: one glossy ball, a raised amber band round it where
    v1 had its ring, and three honey transport proteins on its crown."""
    R = 0.0655
    col = [M.amberPale, M.jellyPale, M.chalk][v]
    c = (0, R, 0)
    P = []
    o = ball(P, c, R, col, (24, 12), hi=0.4)
    cb = G(c)
    y_band = -0.06 * R

    def belt(p):
        dz = (p.z - cb.z - y_band) / (R * 0.11)
        k = 1.0 + 0.07 * math.exp(-dz * dz)
        return Vector((cb.x + (p.x - cb.x) * k, cb.y + (p.y - cb.y) * k, p.z))
    deform(o, belt)
    belt_col = mixc(L(M.amber), L(M.honey), 0.5)
    recolor(o, lambda fc, n: belt_col if abs(fc.z - cb.z - y_band) < R * 0.09 else None)
    for i in range(3):
        a = (i / 3) * TAU + 0.9
        at, d = on_sphere(c, R, (math.cos(a) * 0.6, 0.6, math.sin(a) * 0.6), 0.97)
        knob(P, at, d, R * 0.17, M.honey, flat=0.7, seg=(10, 5))
    return P


@model('pilus', ao=0.55)
def pilus(v):
    """A shed pilus, curled up on the agar: one smooth tube of twenty pilin
    beads tapering to its tip, and the rivet-headed base it was pulled out of
    the wall with."""
    R = 0.0165
    col = [M.flesh, M.membrane, M.chalk][v]
    nb, per = 20, 3
    N = nb * per + 1
    pts = []
    for i in range(N):
        t = i / (N - 1)
        a = t * 5.6 + v * 0.6
        rad = 0.163 - t * 0.075
        pts.append((math.cos(a) * rad, R, math.sin(a) * rad))
    bead = beaded(nb, per, 0.16)
    P = []
    shade = mixc(L(col), (0, 0, 0), 0.07)
    sweep(P, pts, R, col, n=10, radius=lambda t: bead(t) * (1 - t * 0.3),
          colfn=lambda i, t: shade if (i // per) % 2 else None)
    # the basal knob: a rivet head with a collar
    a0 = v * 0.6
    bc = (math.cos(a0) * 0.163, R * 1.5, math.sin(a0) * 0.163)
    ball(P, bc, R * 2.0, M.membraneD, (16, 8), sc=(1, 0.75, 1), hi=0.35)
    ring = torus(R * 1.25, R * 0.32, color=dk(M.membraneD, 0.15), seg=16, rseg=6)
    place(ring, (bc[0], R * 2.55, bc[2]))
    P.append(ring)
    return P


@model('lipid_droplet', ao=0.45)
def lipid_droplet(v):
    """A drop of fat: a big glossy ball with two smaller droplets fusing into
    its shoulder (v1 buried its two inside the big one, where they never
    showed)."""
    R = 0.0812
    col = [M.amberPale, M.amber, M.chalk][v]
    c = (0, R, 0)
    P = []
    ball(P, c, R, col, (26, 13), hi=0.6)
    for d, k, r, cc in (((0.42, 0.66, 0.55), 0.78, 0.37, M.honey),
                        ((-0.66, 0.42, 0.58), 0.86, 0.24, M.amberPale if v != 0 else M.amber)):
        dv = Vector(d).normalized()
        p = (c[0] + dv.x * R * k, c[1] + dv.y * R * k, c[2] + dv.z * R * k)
        ball(P, p, R * r, cc, (14, 7), hi=0.6)
    return P


@model('lysosome', ao=0.5)
def lysosome(v):
    """The cell's stomach: a glossy membrane ball studded with six proton-pump
    knobs on short stalks, where v1 had six bumps."""
    R = 0.0835
    col = [M.coral, M.membrane, M.rust][v]
    c = (0, R, 0)
    P = []
    ball(P, c, R, col, (24, 12), hi=0.4)
    stud = M.membraneD if v != 2 else dk(M.membraneD, 0.12)
    for i in range(6):
        a = (i / 6) * TAU + v
        e = 0.5 + (i % 3) * 0.55
        d = (math.sin(e) * math.cos(a), math.cos(e), math.sin(e) * math.sin(a))
        p0 = (c[0] + d[0] * R * 0.95, c[1] + d[1] * R * 0.95, c[2] + d[2] * R * 0.95)
        p1 = (c[0] + d[0] * R * 1.07, c[1] + d[1] * R * 1.07, c[2] + d[2] * R * 1.07)
        stick(P, p0, p1, R * 0.06, stud, seg=5)
        at, dv = on_sphere(c, R, d, 1.10)
        knob(P, at, dv, R * 0.13, stud, flat=0.7, seg=(8, 4))
    return P


@model('flagellum', ao=0.55)
def flagellum(v):
    """A shed flagellum: one smooth helical filament (v1's beads, run together)
    with its banded marks, and the basal motor at its root as a stack of
    rotor rings."""
    L_, amp, tb = 0.27, 0.075, 0.017
    col = M.chalk if v else M.flesh
    band = M.membraneD
    N = 49
    pts = []
    for i in range(N):
        t = i / (N - 1)
        a = t * 1.6 * TAU
        pts.append((-L_ / 2 + t * L_, amp + tb + math.sin(a) * amp, math.cos(a) * amp))
    P = []

    def cf(i, t):
        u = (i + 0.5) / (N - 1) * 12
        return band if abs(u - round(u)) < 0.3 and round(u) % 4 == 0 else None
    sweep(P, pts, tb, col, n=10, colfn=cf, radius=lambda t: 1.0 - 0.15 * t)
    # the motor: rotor rings stacked along the filament's root
    p0 = Vector(pts[0])
    tg = (Vector(pts[0]) - Vector(pts[1])).normalized()
    prof = [(0.0, 0.0), (0.016, 0.0), (0.030, 0.002), (0.034, 0.006), (0.030, 0.010), (0.020, 0.011),
            (0.020, 0.014), (0.032, 0.016), (0.036, 0.020), (0.032, 0.024), (0.0, 0.025)]
    mot = lathe(prof, color=band, seg=16, close_bottom=False, smooth=45)
    recolor(mot, lambda fc, n: lt(band, 0.35) if 0.0115 < fc.z < 0.0145 else None)
    mot.data.transform((G(tg) - G((0, 0, 0))).to_track_quat('Z', 'Y').to_matrix().to_4x4())
    mot.data.transform(Matrix.Translation(G(p0 - tg * 0.006)))
    mot.data.update()
    P.append(mot)
    return P


def twisted_torus(P, c, R, r, n1, n2, turns, colfn, rot=(0, 0, 0)):
    """A torus lying flat (game XZ) at game c whose quads run in helices round
    the tube: column j of the tube is coloured colfn(j), so blocks of columns
    read as strands wound round the ring."""
    bm = bmesh.new()
    rings_ = []
    for i in range(n1):
        a = i / n1 * TAU
        ph = turns * a
        ring = []
        for j in range(n2):
            b = j / n2 * TAU + ph
            rr = R + r * math.cos(b)
            ring.append(bm.verts.new((rr * math.cos(a), rr * math.sin(a), r * math.sin(b))))
        rings_.append(ring)
    cols = []
    for i in range(n1):
        a, b = rings_[i], rings_[(i + 1) % n1]
        for j in range(n2):
            bm.faces.new((a[j], a[(j + 1) % n2], b[(j + 1) % n2], b[j]))
            cols.append(j)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = _from_bmesh(bm, 'ttorus')
    paint(o, (0, 0, 0))
    attr = o.data.color_attributes['base']
    for poly in o.data.polygons:
        cc = L(colfn(cols[poly.index]))
        for li in poly.loop_indices:
            attr.data[li].color = (*cc, 1.0)
    o.data.transform(grot(*rot))
    o.data.transform(Matrix.Translation(G(c)))
    o.data.update()
    _smooth(o, 80)
    P.append(o)
    return o


@model('plasmid', ao=0.55)
def plasmid(v):
    """A ring of DNA: a thick loop whose two strands wind round it, a smaller
    supercoiled loop crossing back over it, and five amber proteins clamped
    on the ring."""
    R, tb = 0.128, 0.036
    col = [M.nucleus, M.nucleusD, M.lilac][v]
    P = []
    strand2 = lt(col, 0.35)
    # whole turns, so the strands meet themselves; and under about half a
    # column of twist per segment, or the quads fold over
    twisted_torus(P, (0, tb, 0), R, tb, 40, 8, 3,
                  lambda j: col if (j // 2) % 2 == 0 else strand2)
    sup = M.lilac
    sup2 = lt(sup, 0.4) if v != 2 else dk(sup, 0.18)
    twisted_torus(P, (R * 0.28, 0.0611, -R * 0.14), R * 0.5, tb * 0.85, 22, 6, 2,
                  lambda j: sup if j % 2 == 0 else sup2, rot=(0.0, 0.6, 0.42))
    for i in range(5):
        a = (i / 5) * TAU + v * 0.4
        ball(P, (math.cos(a) * R, tb, math.sin(a) * R), tb * 1.3, M.amber, (10, 6), sc=(1, 0.85, 1))
    return P
