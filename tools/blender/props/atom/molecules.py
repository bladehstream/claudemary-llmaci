"""Atom-stage props, the big molecules: a benzene ring up to a protein domain.

Frame reminder (see kit.py): Blender Z is up, X is the prop's width, and the
game's FRONT (+Z) is Blender -Y. v1 (src/world/props/atom.js) is authored in
the game frame, so every coordinate here is written as v1 writes it, game
(x, y, z), and `G()` turns it into Blender (x, -z, y) at the last moment. Each
model keeps v1's one-dial `S` and its layout, so the sizes and the facing are
v1's; what changes is the making.

The look: a premium ball-and-stick kit. Glossy chunky balls (a painted
highlight, since vertex colour is all there is), clean uncapped sticks buried
in the balls, crisp thin glowing rings. Inside one prop every atom of an
element is one size and every bond one thickness. v1 glows by COLOUR (the
glowColor list at the top of atom.js); `GLOWK` reproduces it, so any part
painted electron, spark, quark, violet, magenta or proton glows at v1's k.
"""
import math
import bpy
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
GOLD = 2.399963229728653

# The atom stage's own palette (A in src/world/props/atom.js); not in palette.js.
A = type('A', (), dict(
    electron=0x7cf3ff, spark=0xc6f9ff, proton=0xff5c8f, neutron=0xc2ccff, quark=0xffe15c,
    glowV=0x9c63ff, glowM=0xff4bc6,
    H=0xf0f6ff, Cc=0x666f96, CcD=0x454d76, N=0x6f92ff, O=0xff6152, Ph=0xffa03c, S=0xffe14d,
    Na=0xb083ff, Cl=0x74ea86, Fe=0xff8b3d, Mg=0x5fe2ab,
    bond=0x9aa2d8, bondLo=0x666ea6, hbond=0x59e8d0, ribbon=0x54c8ff, sheet=0xffb35c, coil=0x8f7ad6,
))

# v1's glowColor registrations: these colours are self-lit wherever they appear.
GLOWK = {A.electron: 0.6, A.spark: 0.8, A.quark: 0.45, A.glowV: 0.5, A.glowM: 0.5, A.proton: 0.25}

# ball tessellations (u segments, rings): 120, 80, 48, 42 and 36 triangles,
# and an icosahedron (20) for the 60 atoms of a buckyball
BIG, MED, SML, TNY, BEAD, ICO = (12, 6), (10, 5), (8, 4), (7, 4), (6, 4), 'ico'


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
    """v1's Euler (three.js order 'YXZ', game frame), as a Blender-frame matrix."""
    m = Matrix.Rotation(ry, 4, 'Y') @ Matrix.Rotation(rx, 4, 'X') @ Matrix.Rotation(rz, 4, 'Z')
    return P4 @ m @ P4.inverted()


def _lit(o, col):
    if isinstance(col, int) and col in GLOWK:
        glow(o, GLOWK[col])
    return o


def _smoothstep(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


KEY = Vector((-0.38, -0.42, 0.82)).normalized()   # top, front-left: where the gloss sits


def gloss(o, col, c, sc=(1, 1, 1), hi=0.5, lo=0.16):
    """Paint a ball as a glossy toy bead: a soft white highlight towards the key
    light, the body colour, and a little weight underneath."""
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


def ball(parts, p, r, col, tess=MED, sc=(1, 1, 1), hi=0.45):
    """An atom: a low-poly UV sphere (kit.sphere forces 6+ rings), at game p,
    `sc` its game-frame stretch (an ellipsoid), `hi` the gloss strength."""
    bm = bmesh.new()
    if tess == ICO:
        bmesh.ops.create_icosphere(bm, subdivisions=0, radius=r)
    else:
        bmesh.ops.create_uvsphere(bm, u_segments=tess[0], v_segments=tess[1], radius=r)
    o = _from_bmesh(bm, 'ball')
    c = G(p)
    s = (sc[0], sc[2], sc[1])
    o.data.transform(Matrix.Diagonal((*s, 1.0)))
    o.data.transform(Matrix.Translation(c))
    o.data.update()
    gloss(o, col, c, tuple(x * r for x in s), hi=hi)
    _smooth(o, 80)
    parts.append(_lit(o, col))
    return o


def stick(parts, p, q, r, col, seg=8):
    """A bond: an uncapped cylinder from game p to game q (its ends are buried
    in the atoms, so caps and bevels would be paid for and never seen)."""
    a, b = G(p), G(q)
    d = b - a
    ln = d.length
    if ln < 1e-9:
        return None
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=False, cap_tris=False, segments=seg, radius1=r, radius2=r, depth=ln)
    o = _from_bmesh(bm, 'stick')
    o.data.transform(d.to_track_quat('Z', 'Y').to_matrix().to_4x4())
    o.data.transform(Matrix.Translation((a + b) / 2))
    o.data.update()
    paint(o, col)
    _smooth(o, 60)
    parts.append(_lit(o, col))
    return o


def stick2(parts, p, q, r, col, gap, seg=8):
    """A double bond: two parallel sticks, side by side in the game XZ plane."""
    dx, dz = q[0] - p[0], q[2] - p[2]
    ux, uz = dz, -dx
    ul = math.hypot(ux, uz)
    if ul < 1e-9:
        ux, uz = 1.0, 0.0
    else:
        ux, uz = ux / ul, uz / ul
    for s in (-1, 1):
        stick(parts, (p[0] + ux * gap * s, p[1], p[2] + uz * gap * s),
              (q[0] + ux * gap * s, q[1], q[2] + uz * gap * s), r, col, seg)


def beads(parts, p, q, r, col, n=3, tess=SML):
    """A dashed hydrogen bond: n beads on the line from p to q."""
    for i in range(1, n + 1):
        t = i / (n + 1)
        ball(parts, [p[k] + (q[k] - p[k]) * t for k in range(3)], r, col, tess, hi=0.35)


def ring(parts, c, R, r, col, seg=32, rseg=6, rx=0.0, ry=0.0, rz=0.0):
    """A thin torus. Flat in the game XZ plane (v1's rx = PI/2) when rx = ry = 0;
    rx/ry/rz are a further rotation in v1's convention, radians."""
    o = torus(R, r, color=col, seg=seg, rseg=rseg)
    o.data.transform(grot(rx, ry, rz))
    o.data.transform(Matrix.Translation(G(c)))
    o.data.update()
    parts.append(_lit(o, col))
    return o


def ring_pts(c, R, n, twist=0.0, plane='xz'):
    out = []
    for i in range(n):
        a = i / n * TAU + twist
        if plane == 'xz':
            out.append((c[0] + math.cos(a) * R, c[1], c[2] + math.sin(a) * R))
        else:
            out.append((c[0] + math.cos(a) * R, c[1] + math.sin(a) * R, c[2]))
    return out


def ring_mol(parts, c, R, n, ar, br, cols, bcol, twist=0.0, tess=MED, bseg=8, plane='xz'):
    """v1's ringMol: a flat n-ring of atoms (game XZ), bonded round the rim."""
    pts = ring_pts(c, R, n, twist, plane)
    for i in range(n):
        stick(parts, pts[i], pts[(i + 1) % n], br, bcol, bseg)
    for i in range(n):
        ball(parts, pts[i], ar, cols[i % len(cols)], tess)
    return pts


def fused(c, R, twist, edge):
    """A five-ring fused onto edge `edge` (vertex edge..edge+1) of the flat
    six-ring at c (radius R = side, game XZ, v1's twist). Returns the hexagon
    and the three new vertices in order from vertex edge+1 round to vertex edge."""
    hx = ring_pts(c, R, 6, twist)
    a, b = Vector(hx[edge]), Vector(hx[(edge + 1) % 6])
    mid = (a + b) / 2
    out = (mid - Vector(c)).normalized()
    # a regular pentagon on the shared edge: its centre is an apothem (0.688 s) out
    pc = mid + out * (0.688 * R)
    v0 = b - pc
    for sgn in (1, -1):
        pts = []
        for k in (1, 2, 3, 4):
            ang = sgn * math.radians(72 * k)
            ca, sa = math.cos(ang), math.sin(ang)
            pts.append(pc + Vector((v0.x * ca - v0.z * sa, 0, v0.x * sa + v0.z * ca)))
        if (pts[3] - a).length < R * 0.05:
            return hx, [tuple(p) for p in pts[:3]]
    raise ValueError('fused ring did not close')


def sweep(P, pts, r, col, n=6):
    """A cheap round tube along game points: n-sided, capped. kit.tube's curve
    bevel spends twice the triangles on the same silhouette."""
    bm = bmesh.new()
    bp = [G(p) for p in pts]
    rings_ = []
    for i, p in enumerate(bp):
        t = (bp[min(i + 1, len(bp) - 1)] - bp[max(i - 1, 0)]).normalized()
        q = t.to_track_quat('Z', 'Y').to_matrix()
        rings_.append([bm.verts.new(p + q @ Vector((math.cos(j / n * TAU) * r, math.sin(j / n * TAU) * r, 0)))
                       for j in range(n)])
    for i in range(len(rings_) - 1):
        a, b = rings_[i], rings_[i + 1]
        for j in range(n):
            bm.faces.new((a[j], a[(j + 1) % n], b[(j + 1) % n], b[j]))
    bm.faces.new(list(reversed(rings_[0])))
    bm.faces.new(rings_[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = _from_bmesh(bm, 'sweep')
    paint(o, col)
    _smooth(o, 60)
    P.append(_lit(o, col))
    return o


def fit_uniform(P, pid, v):
    """One uniform scale about the origin that brings the prop's box closest to
    the catalogue box (geometric mean of the three axis ratios): used where v1
    was randomised, so its box is a sample and not a layout. Never per-axis:
    that would turn the balls into eggs."""
    lo, hi = [1e9] * 3, [-1e9] * 3
    for o in P:
        mw = o.data
        for vt in mw.vertices:
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


# ---------------------------------------------------------------- small rings

@model('mol_benzene')
def benzene(v):
    S = 0.63083
    R = 0.32 * S
    tw = v * 0.3
    P = []
    pts = ring_mol(P, (0, 0, 0), R, 6, 0.13 * S, 0.045 * S, [A.Cc], A.bond, tw, BIG, 10)
    for i, c in enumerate(pts):
        a = i / 6 * TAU + tw
        h = (math.cos(a) * R * 1.62, 0, math.sin(a) * R * 1.62)
        stick(P, c, h, 0.034 * S, A.bondLo)
        ball(P, h, 0.085 * S, A.H, MED)
    # the delocalised ring, a crisp glowing hoop inside the carbons
    ring(P, (0, 0, 0), R * 0.58, 0.026 * S, A.glowV, seg=32, rseg=6)
    return P


@model('mol_saltcell')
def saltcell(v):
    S = 0.53205
    k = 0.3 * S
    P = []
    pts = [(sx * k, sy * k, sz * k) for sx in (-1, 1) for sy in (-1, 1) for sz in (-1, 1)]
    for i in range(8):
        for j in range(i + 1, 8):
            if sum(abs(pts[i][a] - pts[j][a]) for a in range(3)) < k * 2.1:
                stick(P, pts[i], pts[j], 0.03 * S, A.bondLo, 10)
    for p in pts:
        na = ((p[0] > 0) + (p[1] > 0) + (p[2] > 0) + v) % 2 == 0
        # sodium the smaller ion, chloride the larger: the size step reads as two kinds
        ball(P, p, 0.165 * S if na else 0.2 * S, A.Na if na else A.Cl, (14, 7))
    return P


@model('mol_glucose')
def glucose(v):
    S = 0.53643
    R = 0.3 * S
    rC, rO, rH, rb = 0.12 * S, 0.115 * S, 0.072 * S, 0.036 * S
    P = []
    pts = ring_pts((0, 0, 0), R, 6, 0.2)
    for i in range(6):
        stick(P, pts[i], pts[(i + 1) % 6], rb, A.bond)
    for i in range(6):
        ball(P, pts[i], rC if i else rO, A.O if i == 0 else A.Cc, BIG)
    # hydroxyls off the ring, alternating up and down
    for i in range(1, 6):
        p = pts[i]
        d = 1 if i % 2 else -1
        o = (p[0] * 1.4, d * 0.28 * S, p[2] * 1.4)
        h = (o[0] * 1.16, o[1] + d * 0.12 * S, o[2] * 1.16)
        stick(P, p, o, rb, A.bondLo)
        stick(P, o, h, rb * 0.8, A.bondLo, 6)
        ball(P, o, rO, A.O, MED)
        ball(P, h, rH, A.H, SML)
    # the CH2OH arm
    arm = (pts[0][0] * 1.5, 0.42 * S, pts[0][2] * 1.5)
    ao = (arm[0] + 0.1 * S, arm[1] + 0.16 * S, arm[2])
    stick(P, pts[1], arm, rb, A.bond)
    stick(P, arm, ao, rb * 0.8, A.bondLo, 6)
    ball(P, arm, rC, A.Cc, MED)
    ball(P, ao, rO * 0.9, A.O, MED)
    if v == 2:
        ring(P, (0, 0, 0), R * 0.5, 0.02 * S, A.spark, seg=32, rseg=6)
    return P


@model('mol_aminoacid')
def aminoacid(v):
    S = 0.75059
    rN, rC, rO, rH, rS = 0.16 * S, 0.14 * S, 0.14 * S, 0.08 * S, 0.15 * S
    rb = 0.04 * S
    P = []
    n, ca, cc = (-0.34 * S, -0.02 * S, -0.1 * S), (-0.06 * S, 0.1 * S, 0.06 * S), (0.22 * S, -0.04 * S, -0.04 * S)
    stick(P, n, ca, rb, A.bond)
    stick(P, ca, cc, rb, A.bond)
    ball(P, n, rN, A.N, BIG)
    ball(P, ca, rC, A.Cc, BIG)
    ball(P, cc, rC, A.Cc, BIG)
    for s in (-1, 1):                                   # amine hydrogens
        h = (n[0] - 0.12 * S, n[1] + 0.16 * S * s, n[2] + 0.16 * S * s)
        stick(P, n, h, rb * 0.75, A.bondLo)
        ball(P, h, rH, A.H, MED)
    od, oh = (0.36 * S, 0.16 * S, 0.16 * S), (0.36 * S, -0.2 * S, -0.2 * S)   # carboxyl
    stick2(P, cc, od, rb * 0.7, A.bondLo, 0.05 * S)
    stick(P, cc, oh, rb, A.bond)
    ball(P, od, rO, A.O, BIG)
    ball(P, oh, rO, A.O, BIG)
    hh = (oh[0] + 0.12 * S, oh[1] - 0.08 * S, oh[2])
    stick(P, oh, hh, rb * 0.75, A.bondLo)
    ball(P, hh, rH * 0.9, A.H, SML)
    # the side chain: the whole point of there being twenty of these
    sc = (ca[0] - 0.02 * S, ca[1] + 0.28 * S, ca[2] + 0.06 * S)
    stick(P, ca, sc, rb, A.bond)
    if v == 0:                                          # alanine: a methyl
        ball(P, sc, rC, A.Cc, BIG)
        for k in range(3):                              # with its hydrogens
            a = k * TAU / 3 + 0.4
            h = (sc[0] + math.cos(a) * 0.15 * S, sc[1] + 0.1 * S, sc[2] + math.sin(a) * 0.12 * S)
            stick(P, sc, h, rb * 0.75, A.bondLo, 6)
            ball(P, h, rH * 0.85, A.H, SML)
    elif v == 1:                                        # cysteine: a thiol
        ball(P, sc, rC, A.Cc, MED)
        s2 = (sc[0] + 0.08 * S, sc[1] + 0.26 * S, sc[2])
        stick(P, sc, s2, rb, A.bond)
        ball(P, s2, rS, A.S, BIG)
    elif v == 2:                                        # serine: a hydroxyl
        ball(P, sc, rC, A.Cc, MED)
        o2 = (sc[0] - 0.06 * S, sc[1] + 0.24 * S, sc[2])
        stick(P, sc, o2, rb, A.bond)
        ball(P, o2, rO * 0.93, A.O, BIG)
    else:                                               # phenylalanine: a ring
        ball(P, sc, rC * 0.8, A.Cc, MED)
        rr, cy = 0.17 * S, sc[1] + 0.27 * S
        pts = ring_pts((sc[0], cy, sc[2]), rr, 6, math.pi / 2, plane='xy')
        stick(P, sc, pts[3], rb, A.bond)
        for i in range(6):
            stick(P, pts[i], pts[(i + 1) % 6], rb * 0.8, A.bond, 6)
        for p in pts:
            ball(P, p, 0.08 * S, A.Cc, MED)
    return P


# ---------------------------------------------------------------- nucleotides, lipids

@model('mol_nucleotide')
def nucleotide(v):
    S = 1.02164
    base_col = [A.N, A.glowM, A.Mg, A.Ph][v]
    rA, rb = 0.1 * S, 0.034 * S
    P = []
    # phosphate, standing above the sugar
    p0 = (-0.3 * S, 0.3 * S, 0)
    for i in range(4):
        a = i * TAU / 4 + 0.5
        o = (p0[0] + math.cos(a) * 0.2 * S, p0[1] + math.sin(a) * 0.14 * S, math.sin(a * 2) * 0.16 * S)
        stick(P, p0, o, rb, A.bondLo)
        ball(P, o, rA, A.O, MED)
    ball(P, p0, 0.15 * S, A.Ph, BIG)
    # ribose, a five-ring
    rc = (-0.06 * S, -0.06 * S, 0)
    rp = ring_mol(P, rc, 0.2 * S, 5, rA, rb, [A.O, A.Cc, A.Cc, A.Cc, A.Cc], A.bond, 0.9, MED)
    stick(P, p0, rp[2], rb, A.bond)
    # the base, a six-ring hanging off the far side, with its glow hoop
    bc, br = (0.36 * S, 0.14 * S, 0.02 * S), 0.24 * S
    hx = ring_pts(bc, br, 6, 0.0)
    stick(P, rp[0], hx[3], rb, A.bond)
    for i in range(6):
        stick(P, hx[i], hx[(i + 1) % 6], rb, A.bond)
    for i, q in enumerate(hx):
        ball(P, q, rA, base_col if i % 3 == 0 else A.Cc, MED)
    ring(P, bc, br * 0.55, 0.022 * S, base_col, seg=32, rseg=6)
    return P


@model('mol_lipid')
def lipid(v):
    S = 0.97111
    rC, rb = 0.105 * S, 0.042 * S
    P = []
    # polar head: the phosphate, its oxygens and the choline nitrogen
    ball(P, (0, 0.98 * S, 0), 0.26 * S, A.Ph, (16, 8))
    stick(P, (0, 0.98 * S, 0), (0.2 * S, 1.2 * S, 0), rb, A.bond)
    ball(P, (0.2 * S, 1.2 * S, 0), 0.15 * S, A.N, BIG)
    for i in range(3):
        a = i * TAU / 3
        ball(P, (math.cos(a) * 0.3 * S, 0.86 * S, math.sin(a) * 0.3 * S), 0.1 * S, A.O, MED)
    # glycerol linker
    stick(P, (0, 0.86 * S, 0), (0, 0.66 * S, 0), rb * 1.15, A.bond)
    ball(P, (0, 0.66 * S, 0), rC * 1.25, A.Cc, BIG)
    # two hydrocarbon tails
    for s in (-1, 1):
        prev = (0, 0.66 * S, 0)
        for i in range(8):
            t = i / 7
            kink = 0.22 if (v == 1 and s < 0 and i > 3) else 0
            p = (s * (0.1 + t * 0.26) * S + math.sin(i * 1.7) * 0.05 * S,
                 (0.56 - i * 0.082) * S,
                 math.sin(i * 1.2 + s) * 0.06 * S + kink * S * i * 0.1)
            stick(P, prev, p, rb, A.bondLo, 8)
            ball(P, p, rC, A.Cc, MED)
            prev = p
    return P


@model('mol_basepair')
def basepair(v):
    S = 0.95998
    pur, pyr = (A.Mg, A.Ph) if v else (A.glowM, A.N)
    rA, rb = 0.08 * S, 0.03 * S
    P = []
    # purine: a six-ring with a five-ring fused on its outer (-x) edge
    pc = (-0.3 * S, -0.05 * S, 0)
    hx, pent = fused(pc, 0.2 * S, math.pi / 6, 2)
    for i in range(6):
        stick(P, hx[i], hx[(i + 1) % 6], rb, A.bond, 6)
    chain = [hx[3]] + pent + [hx[2]]
    for i in range(4):
        stick(P, chain[i], chain[i + 1], rb, A.bond, 6)
    for i, q in enumerate(hx):
        ball(P, q, rA, pur if i % 2 else A.Cc, SML)
    for i, q in enumerate(pent):
        ball(P, q, rA, pur if i != 1 else A.Cc, SML)
    # pyrimidine: one six-ring, a vertex pointing back at its partner
    yc = (0.34 * S, 0.05 * S, 0.04 * S)
    yx = ring_mol(P, yc, 0.2 * S, 6, rA, rb, [A.Cc, pyr], A.bond, math.pi / 6, SML, 6)
    # the hydrogen bonds that hold the two together, straight across the gap
    for i in range(3 if v else 2):
        dz = (i - (1 if v else 0.5)) * 0.13 * S
        beads(P, (pc[0] + 0.2 * S, pc[1], dz), (yc[0] - 0.2 * S, yc[1], yc[2] + dz), 0.035 * S, A.hbond, 3, BEAD)
    # the sugar-phosphate backbone, up on one side and down on the other: a
    # rung of a ladder whose strands run vertically
    for s in (-1, 1):
        x, yy = (-0.62 if s < 0 else 0.58) * S, s * -0.3 * S
        sp = ring_mol(P, (x, yy, 0.05 * S), 0.13 * S, 5, rA * 0.85, rb, [A.O, A.Cc], A.bond, s, BEAD, 6)
        anchor = hx[3] if s < 0 else yx[0]
        stick(P, anchor, min(sp, key=lambda q: math.dist(q, anchor)), rb, A.bond, 6)
        px, py = x + s * 0.14 * S, yy + s * -0.22 * S
        ph = (px, py, -0.06 * S)
        stick(P, ph, min(sp, key=lambda q: math.dist(q, ph)), rb, A.bond, 6)
        for k in range(3):
            a = k * TAU / 3 + s
            o = (px + math.cos(a) * 0.15 * S, py + math.sin(a) * 0.15 * S, -0.06 * S)
            stick(P, ph, o, rb * 0.8, A.bondLo, 5)
            ball(P, o, 0.07 * S, A.O, BEAD)
        ball(P, ph, 0.11 * S, A.Ph, MED)
    return P


@model('mol_atp')
def atp(v):
    S = 1.41044
    rb = 0.032 * S
    P = []
    # the triphosphate tail, climbing away from the sugar
    prev, first = None, None
    for i in range(3):
        p = ((-0.34 - i * 0.07) * S, (0.04 + i * 0.24) * S, (i % 2) * 0.07 * S)
        if prev:
            stick(P, prev, p, rb * 1.2, A.bond)
        for k in range(3):
            a = k * TAU / 3 + i
            o = (p[0] + math.cos(a) * 0.16 * S, p[1] + math.sin(a) * 0.1 * S, p[2] + math.cos(a * 1.7) * 0.13 * S)
            stick(P, p, o, rb * 0.8, A.bondLo, 6)
            # the terminal phosphate's oxygens spark: that is the energy being carried
            ball(P, o, 0.075 * S, A.quark if i == 2 else A.O, SML)
        ball(P, p, 0.12 * S, A.Ph, BIG)
        prev, first = p, first or p
    # the high-energy bond, drawn as a spark
    if v == 0:
        ring(P, (-0.44 * S, 0.4 * S, 0), 0.15 * S, 0.02 * S, A.quark, seg=28, rseg=5)
    # ribose
    rp = ring_mol(P, (0.02 * S, -0.06 * S, 0), 0.19 * S, 5, 0.08 * S, rb, [A.O, A.Cc], A.bond, 0.6, SML, 6)
    stick(P, first, min(rp, key=lambda q: math.dist(q, first)), rb, A.bond, 6)
    # adenine, a six-ring with a five-ring fused on its far edge
    ac = (0.44 * S, -0.02 * S, 0.02 * S)
    hx, pent = fused(ac, 0.18 * S, 0.4, 5)
    for i in range(6):
        stick(P, hx[i], hx[(i + 1) % 6], rb, A.bond, 6)
    chain = [hx[0]] + pent + [hx[5]]
    for i in range(4):
        stick(P, chain[i], chain[i + 1], rb, A.bond, 6)
    for i, q in enumerate(hx):
        ball(P, q, 0.08 * S, A.N if i % 2 else A.Cc, SML)
    for i, q in enumerate(pent):
        ball(P, q, 0.08 * S, A.N if i != 1 else A.Cc, SML)
    near = min(hx, key=lambda q: q[0])
    stick(P, min(rp, key=lambda q: math.dist(q, near)), near, rb, A.bond, 6)
    return P


@model('mol_peptide')
def peptide(v):
    S = 1.47787
    side_cols = [A.S, A.O, A.N, A.Mg, A.glowM]
    rA, rb = 0.1 * S, 0.038 * S
    P = []
    prev = None
    for i in range(4):
        x = (-0.42 + i * 0.28) * S
        yb = (i * 0.22 - 0.22) * S
        zz = ((i % 2) - 0.5) * 0.18 * S
        n = (x, yb + 0.06 * S, zz)
        ca = (x + 0.15 * S, yb - 0.04 * S, zz + 0.1 * S)
        cc = (x + 0.3 * S, yb + 0.06 * S, zz)
        if prev:
            stick(P, prev, n, rb, A.bond)
        stick(P, n, ca, rb, A.bond)
        stick(P, ca, cc, rb, A.bond)
        ball(P, n, rA, A.N, MED)
        ball(P, ca, rA, A.Cc, MED)
        ball(P, cc, rA, A.Cc, MED)
        o = (cc[0] + 0.04 * S, cc[1] + 0.2 * S, cc[2] - 0.05 * S)   # carbonyl oxygen
        stick2(P, cc, o, rb * 0.65, A.bondLo, 0.035 * S, 6)
        ball(P, o, 0.085 * S, A.O, MED)
        d = -1 if i % 2 else 1                                      # side chains, alternating
        sc = (ca[0], ca[1] - d * 0.26 * S, ca[2] + d * 0.1 * S)
        stick(P, ca, sc, rb, A.bond)
        ball(P, sc, 0.12 * S, side_cols[(i + v) % len(side_cols)], BIG)
        prev = cc
    return P


# ---------------------------------------------------------------- carbon and cofactors

def _trunc_ico(R):
    """The 60 vertices and 90 edges of a truncated icosahedron of circumradius R."""
    phi = (1 + 5 ** 0.5) / 2
    base = set()
    for t in [(0, 1, 3 * phi), (1, 2 + phi, 2 * phi), (phi, 2, 2 * phi + 1)]:
        for p in [(t[0], t[1], t[2]), (t[1], t[2], t[0]), (t[2], t[0], t[1])]:
            for sx in (-1, 1):
                for sy in (-1, 1):
                    for sz in (-1, 1):
                        base.add((round(p[0] * sx, 9), round(p[1] * sy, 9), round(p[2] * sz, 9)))
    pts = [Vector(p) for p in sorted(base)]
    k = R / pts[0].length
    pts = [p * k for p in pts]
    e = min((pts[i] - pts[j]).length for i in range(len(pts)) for j in range(i + 1, len(pts)))
    edges = [(i, j) for i in range(len(pts)) for j in range(i + 1, len(pts))
             if (pts[i] - pts[j]).length < e * 1.05]
    return pts, edges


def plate(P, poly, th, col, shrink=0.82):
    """A thin flat tile filling a ring of atoms (game points, any order round
    the ring), pulled in towards its centre so the bonds stay on show."""
    c = Vector((0, 0, 0))
    for p in poly:
        c += G(p)
    c /= len(poly)
    vs = [c + (G(p) - c) * shrink for p in poly]
    n = (vs[1] - vs[0]).cross(vs[2] - vs[0])
    for i in range(len(vs)):
        n2 = (vs[i] - c).cross(vs[(i + 1) % len(vs)] - c)
        if n2.length > n.length:
            n = n2
    n.normalize()
    u = (vs[0] - c).normalized()
    w = n.cross(u)
    vs.sort(key=lambda q: math.atan2((q - c).dot(w), (q - c).dot(u)))
    bm = bmesh.new()
    top = [bm.verts.new(q + n * th / 2) for q in vs]
    bot = [bm.verts.new(q - n * th / 2) for q in vs]
    bm.faces.new(top)
    bm.faces.new(list(reversed(bot)))
    k = len(vs)
    for i in range(k):
        bm.faces.new((bot[i], bot[(i + 1) % k], top[(i + 1) % k], top[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = _from_bmesh(bm, 'plate')
    paint(o, col)
    _smooth(o, 30)
    P.append(_lit(o, col))
    return o


@model('mol_c60')
def c60(v):
    S = 1.71609
    Rc = 0.43 * S
    P = []
    # the real cage, 60 atoms and 90 bonds: twelve pentagons in twenty hexagons,
    # which is what makes it a buckyball rather than any ball of dots
    pts, edges = _trunc_ico(Rc)
    m = Matrix.Rotation(0.35 + v * 0.5, 3, 'Y') @ Matrix.Rotation(0.3, 3, 'X')
    gp = [tuple(m @ p) for p in pts]
    for i, j in edges:
        stick(P, gp[i], gp[j], 0.021 * S, A.CcD, 5)
    for p in gp:
        ball(P, p, 0.056 * S, A.Cc, ICO, hi=0.3)
    # the twelve pentagons as dark tiles: the football's patches, and the
    # glowing core shows through the open hexagons between them
    phi = (1 + 5 ** 0.5) / 2
    for d in [(0, s1, s2 * phi) for s1 in (-1, 1) for s2 in (-1, 1)]:
        for q in (d, (d[1], d[2], d[0]), (d[2], d[0], d[1])):
            dirv = (m @ Vector(q)).normalized()
            five = sorted(gp, key=lambda p: -Vector(p).normalized().dot(dirv))[:5]
            plate(P, five, 0.02 * S, A.CcD, 0.9)
    # the hollow middle, a glowing core seen through the cage
    ball(P, (0, 0, 0), Rc * 0.42, A.glowV, BIG, hi=0.3)
    # v1's dots sat on the cage at random phases, so its box is a sample: fit it
    return fit_uniform(P, 'mol_c60', v)


@model('mol_graphene')
def graphene(v):
    S = 1.98466
    a = 0.26 * S
    P = []
    pts, holes = [], []

    def lift(x, z):
        return math.sin(x * 2.6 / S + v) * 0.13 * S + math.cos(z * 2.2 / S) * 0.1 * S
    for i in range(-3, 4):
        for j in range(-3, 4):
            x, z = (i + j * 0.5) * a, j * a * 0.866
            if math.hypot(x, z) > a * 2.9:
                continue
            if ((i - j) % 3 + 3) % 3 == 0:          # dropping every third site makes the honeycomb
                holes.append((x, z))
                continue
            pts.append((x, lift(x, z), z))
    for i in range(len(pts)):
        for j in range(i + 1, len(pts)):
            if math.hypot(pts[i][0] - pts[j][0], pts[i][2] - pts[j][2]) < a * 1.05:
                stick(P, pts[i], pts[j], 0.03 * S, A.bondLo, 6)
    for p in pts:
        ball(P, p, 0.066 * S, A.Cc, MED)
    # every complete hexagon filled with a dark tile, so the flake reads as a
    # sheet of graphite and not a loose net
    for (x, z) in holes:
        ring6 = [p for p in pts if abs(math.hypot(p[0] - x, p[2] - z) - a) < a * 0.05]
        if len(ring6) == 6:
            plate(P, ring6, 0.025 * S, A.CcD, 0.8)
    return P


def porphyrin(P, c, R, r5, aN, aC, aM, bcol, ccol, ncol, mcol, phase, br):
    """A porphyrin macrocycle, flat in game XZ round c: four five-rings with
    their nitrogens turned in to hold the metal, joined by four bridge
    carbons into one big ring. Returns (nitrogens, outer beta carbons)."""
    ns, outer, alphas = [], [], []
    for i in range(4):
        a = i * TAU / 4 + phase
        pc = (c[0] + math.cos(a) * R, c[1], c[2] + math.sin(a) * R)
        pts = ring_pts(pc, r5, 5, a + math.pi)      # vertex 0 points at the metal
        for k in range(5):
            stick(P, pts[k], pts[(k + 1) % 5], br, bcol, 5)
        ball(P, pts[0], aN, ncol, SML)
        for k in range(1, 5):
            ball(P, pts[k], aC, ccol, TNY)
        ns.append(pts[0])
        outer += [pts[2], pts[3]]
        alphas.append((pts[1], pts[4]))
    for i in range(4):
        # the bridge between this ring and the next, round the circle
        cand = [(p, q) for p in alphas[i] for q in alphas[(i + 1) % 4]]
        p, q = min(cand, key=lambda t: math.dist(t[0], t[1]))
        mx, mz = (p[0] + q[0]) / 2 - c[0], (p[2] + q[2]) / 2 - c[2]
        m = (c[0] + mx * 1.1, c[1], c[2] + mz * 1.1)
        stick(P, p, m, br, bcol, 5)
        stick(P, m, q, br, bcol, 5)
        ball(P, m, aM, mcol, BEAD)
    return ns, outer


@model('mol_haem')
def haem(v):
    S = 2.44337
    R = 0.31 * S
    rb = 0.024 * S
    P = []
    ns, outer = porphyrin(P, (0, 0, 0), R, 0.115 * S, 0.062 * S, 0.055 * S, 0.05 * S,
                          A.bond, A.Cc, A.N, A.CcD, 0.4, rb)
    for q in ns:                                    # the four N -> Fe bonds
        stick(P, (0, 0, 0), q, rb, A.bondLo, 5)
    ball(P, (0, 0, 0), 0.13 * S, A.Fe, BIG)
    ring(P, (0, 0, 0), 0.19 * S, 0.016 * S, A.quark, seg=24, rseg=4)
    # the axial ligand standing over the iron: a histidine ring. It is what makes
    # this a haem and not a dye, and what stops the prop being a disc.
    stick(P, (0, 0, 0), (0, 0.34 * S, 0), 0.03 * S, A.bond, 8)
    ball(P, (0, 0.34 * S, 0), 0.07 * S, A.N, MED)
    ring_mol(P, (0, 0.48 * S, 0), 0.13 * S, 5, 0.055 * S, rb, [A.N, A.Cc], A.bond, 0.5, TNY, 5)
    # the two propionate tails, hanging under the ring
    for s in (-1, 1):
        prev = min(outer, key=lambda q: (q[0] - s * R * 0.62) ** 2 + (q[2] - R * 0.6) ** 2)
        for i in range(2):
            p = (prev[0] + s * 0.03 * S, (-0.12 - i * 0.06) * S, prev[2] + 0.02 * S)
            stick(P, prev, p, rb, A.bondLo, 5)
            ball(P, p, 0.06 * S, A.O if i == 1 else A.Cc, TNY)
            prev = p
    if v:                                           # methyl groups on the rim
        for i in range(4):
            a = i * TAU / 4 + 1.2
            p = (math.cos(a) * R * 1.4, 0.02 * S, math.sin(a) * R * 1.4)
            q = min(outer, key=lambda t: (t[0] - p[0]) ** 2 + (t[2] - p[2]) ** 2)
            stick(P, q, p, rb, A.bondLo, 5)
            ball(P, p, 0.05 * S, A.Cc, TNY)
    return P


@model('mol_nanotube')
def nanotube(v):
    S = 2.74852
    # A short armchair (3,3) tube: the honeycomb rolled up, six atoms to a
    # layer. Stubby and fat like v1 (a long thin prop's collision radius is
    # half its length, and forty of them walled the stage off).
    R, Lx = 0.35 * S, 1.0 * S
    nl = 6
    P = []
    allp = []
    for l in range(nl):
        x = -Lx / 2 + Lx * l / (nl - 1)
        off = (l % 2) * (TAU / 6)
        for k in range(3):
            base = k * TAU / 3 + off + v * 0.3
            for d in (-1, 1):
                a = base + d * TAU / 18
                allp.append((x, math.cos(a) * R, math.sin(a) * R))
    # bonds: every pair of atoms one bond length apart
    bl = min(math.dist(allp[i], allp[j]) for i in range(len(allp)) for j in range(i + 1, len(allp)))
    for i in range(len(allp)):
        for j in range(i + 1, len(allp)):
            if math.dist(allp[i], allp[j]) < bl * 1.3:
                stick(P, allp[i], allp[j], 0.03 * S, A.bond, 5)
    for p in allp:
        ball(P, p, 0.068 * S, A.Cc, TNY)
    # the dark wall inside, so the tube reads as a tube and not a cloud
    wall = cyl(R * 0.8, Lx * 0.94, color=C.charcoal, seg=16, bevel=0.03 * S, rot=(0, 90, 0))
    wall.data.transform(Matrix.Translation((-Lx * 0.47, 0, 0)))
    P.append(wall)
    return P


@model('mol_chlorophyll')
def chlorophyll(v):
    S = 3.23847
    R = 0.3 * S
    cx = -0.2 * S
    rb = 0.02 * S
    P = []
    ns, outer = porphyrin(P, (cx, 0, 0), R, 0.1 * S, 0.052 * S, 0.046 * S, 0.042 * S,
                          A.Mg, A.Cl, A.N, A.Cl, 0.5, rb)
    for q in ns:
        stick(P, (cx, 0, 0), q, rb, A.bondLo, 5)
    ball(P, (cx, 0, 0), 0.1 * S, A.Mg, BIG)
    ring(P, (cx, 0, 0), 0.15 * S, 0.014 * S, A.spark, seg=24, rseg=4)
    # the phytol tail, curling up rather than running away sideways
    prev = min(outer, key=lambda q: (q[0] - (cx + R * 0.85)) ** 2 + (q[2] - R * 0.4) ** 2)
    for i in range(9):
        a = i * 0.78
        p = (cx + R * 0.85 + math.sin(a) * 0.26 * S, (0.06 + i * 0.078) * S, R * 0.4 + (math.cos(a) - 1) * 0.2 * S)
        stick(P, prev, p, 0.024 * S, A.bondLo, 5)
        ball(P, p, 0.055 * S, A.Cc, TNY)
        if v and i % 4 == 2:                        # methyl branches
            q = (p[0] + 0.1 * S, p[1], p[2])
            stick(P, p, q, 0.02 * S, A.bondLo, 5)
            ball(P, q, 0.05 * S, A.Cc, TNY)
        prev = p
    return P


# ---------------------------------------------------------------- folded structures

@model('mol_helix')
def helix(v):
    S = 3.26807
    R, Ln, turns, n = 0.27 * S, 1.62 * S, 4.2, 26

    def at(t, k=1.0):
        a = t * turns * TAU + v
        return (math.cos(a) * R * k, (t - 0.5) * Ln, math.sin(a) * R * k)
    P = []
    # the backbone as one smooth coiled ribbon-tube, the atoms threaded on it
    sweep(P, [at(i / 45) for i in range(46)], 0.036 * S, A.ribbon, 6)
    for i in range(n):
        t = i / (n - 1)
        ball(P, at(t), 0.062 * S, A.O if i % 3 == 0 else A.Cc, TNY)
        if i % 2 == 0:                              # side chains pointing outward
            stick(P, at(t), at(t, 1.42), 0.022 * S, A.bondLo, 5)
            ball(P, at(t, 1.42), 0.05 * S, A.N if i % 4 == 0 else A.S, BEAD)
    # the hydrogen bonds down the axis that make it a helix
    for i in range(5):
        ball(P, (0, (-0.4 + i * 0.2) * Ln, 0), 0.042 * S, A.hbond, BEAD, hi=0.35)
    return P


def coil(P, base, cy, r, ln, turns, col, tube_r, n=28, phase=0.0):
    """A short alpha helix as the cartoon draws it: v1's beads on a coil,
    joined into one smooth tube."""
    pts = []
    for i in range(n + 1):
        t = i / n
        a = t * turns * TAU + phase
        pts.append((base[0] + math.cos(a) * r, cy + (t - 0.5) * ln, base[1] + math.sin(a) * r))
    return sweep(P, pts, tube_r, col, 6)


def arrow(P, length, width, thick, pos, col, rx=0.0, ry=0.0, rz=0.0):
    """A beta strand as the cartoon draws it: a flat arrow, length along game X
    (pointing +X), width along game Z, thickness along game Y; then rotated
    in v1's convention."""
    hl, hw = length / 2, width / 2
    head = length * 0.3
    poly = [(-hl, -hw * 0.6), (hl - head, -hw * 0.6), (hl - head, -hw * 1.2), (hl, 0),
            (hl - head, hw * 1.2), (hl - head, hw * 0.6), (-hl, hw * 0.6)]
    bm = bmesh.new()
    face = bm.faces.new([bm.verts.new((x, y, 0)) for (x, y) in poly])
    res = bmesh.ops.extrude_face_region(bm, geom=[face])
    for e in res['geom']:
        if isinstance(e, bmesh.types.BMVert):
            e.co.z += thick
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = _from_bmesh(bm, 'arrow')
    kit._bevel(o, thick * 0.3, 1)            # one bevel segment: crisp, and cheap
    o.data.transform(Matrix.Translation((0, 0, -thick / 2)))
    o.data.transform(grot(rx, ry, rz))
    o.data.transform(Matrix.Translation(G(pos)))
    o.data.update()
    paint(o, col)
    _smooth(o, 35)
    P.append(_lit(o, col))
    return o


def globule(P, lobes, res, tris, base_col, hi=0.12):
    """The folded body as one soft putty blob: v1's overlapping ellipsoids
    melted together (a metaball), decimated to `tris`, painted by whichever
    lobe owns each vertex, and the violet lobes glowing as in v1.
    lobes: [(game centre, game semi-axes, colour)]."""
    mb = bpy.data.metaballs.new('globule')
    mb.resolution = res
    mb.render_resolution = res
    mb.threshold = 0.6
    for (c, ax, col) in lobes:
        e = mb.elements.new()
        e.type = 'ELLIPSOID'
        e.co = G(c)
        e.radius = 1.0
        e.size_x, e.size_y, e.size_z = ax[0], ax[2], ax[1]
        e.stiffness = 2.0
    ob = bpy.data.objects.new('globule', mb)
    bpy.context.scene.collection.objects.link(ob)
    for x in bpy.context.selected_objects:
        x.select_set(False)
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.convert(target='MESH')
    o = bpy.context.view_layer.objects.active
    n0 = len(o.data.polygons)
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.triangulate(bm, faces=bm.faces)
    bm.to_mesh(o.data)
    bm.free()
    n0 = len(o.data.polygons)
    if n0 > tris:
        m = o.modifiers.new('dec', 'DECIMATE')
        m.ratio = tris / n0
        kit._apply(o)
    me = o.data
    # who owns each vertex: the lobe whose scaled distance is least
    owners = []
    for vt in me.vertices:
        # the lobes own the surface they push out; the core (lobes[0]) only what is left
        best, bc = 1.15, base_col
        for (c, ax, col) in lobes[1:]:
            g = G(c)
            d = Vector(((vt.co.x - g.x) / ax[0], (vt.co.y - g.y) / ax[2], (vt.co.z - g.z) / ax[1])).length
            if d < best:
                best, bc = d, col
        owners.append(bc)
    attr = me.color_attributes.new('base', 'FLOAT_COLOR', 'CORNER')
    gl = me.attributes.new('glow', 'FLOAT', 'CORNER')
    for poly in me.polygons:
        for li in poly.loop_indices:
            vi = me.loops[li].vertex_index
            col = owners[vi]
            n = me.vertices[vi].normal
            sh = n.dot(KEY)
            c = mixc(L(col), (1, 1, 1), hi * _smoothstep(0.7, 0.98, sh) + 0.2 * hi * max(0.0, sh))
            c = mixc(c, (0, 0, 0), 0.14 * max(0.0, -n.z))
            attr.data[li].color = (*c, 1.0)
            gl.data[li].value = GLOWK.get(col, 0.0)
    _smooth(o, 80)
    P.append(o)
    return o


@model('mol_protein')
def protein(v):
    S = 4.33667
    R = 0.5 * S
    P = []
    # a folded globule: a core with seven lobes round it (v1's sizes were
    # random; these are fixed per variant)
    lobes = [((0, 0, 0), (R * 0.72, R * 0.7, R * 0.68), A.coil)]
    for i in range(7):
        a, y = i * GOLD, 1 - (2 * i + 1) / 7
        rad = math.sqrt(max(0.0, 1 - y * y))
        k = [0.3 + hash01(i, 1) * 0.14, 0.26 + hash01(i, 2) * 0.12, 0.3 + hash01(i, 3) * 0.14]
        lobes.append(((math.cos(a) * rad * R * 0.6, y * R * 0.7, math.sin(a) * rad * R * 0.6),
                      tuple(R * x * 1.25 for x in k), A.coil if i % 2 else A.glowV))
    lobes[0] = (lobes[0][0], tuple(x * 1.25 for x in lobes[0][1]), A.coil)
    globule(P, lobes, R * 0.15, 1300, A.coil)
    # two short helices on the surface
    for k in range(2):
        # kept off the front, where the sheet lies
        base = [(-0.3, 3.6), (0.3, 4.2), (-0.1, 3.3)][v][k]
        coil(P, (math.cos(base) * R * 0.6, math.sin(base) * R * 0.6), 0, R * 0.17,
             R * 0.8, 2.2, A.ribbon, 0.05 * S, 26, base)
    # and a small antiparallel beta sheet laid across the front
    for i in range(4):
        arrow(P, R * 0.62, R * 0.17, R * 0.06,
              (-R * 0.12, R * (0.38 - i * 0.2), R * (0.74 - abs(i - 1.5) * 0.04)), A.sheet,
              rx=-0.35 + i * 0.22, ry=(math.pi if i % 2 else 0.0) + 0.15)
    return fit_uniform(P, 'mol_protein', v)


@model('mol_domain')
def domain(v):
    S = 5.04990
    R = 0.5 * S
    P = []
    lobes = [((0, 0, 0), (R * 0.66 * 1.25, R * 0.6 * 1.25, R * 0.72 * 1.25), A.coil)]
    for i in range(9):
        a, y = i * GOLD + v, 1 - (2 * i + 1) / 9
        rad = math.sqrt(max(0.0, 1 - y * y))
        k = [0.28 + hash01(i, 4) * 0.16, 0.24 + hash01(i, 5) * 0.14, 0.28 + hash01(i, 6) * 0.16]
        lobes.append(((math.cos(a) * rad * R * 0.66, y * R * 0.62, math.sin(a) * rad * R * 0.66),
                      tuple(R * x * 1.25 for x in k), A.glowV if i % 3 == 0 else A.coil))
    globule(P, lobes, R * 0.15, 1150, A.coil)
    # three helices, clearly readable at this size
    for k in range(3):
        base = k * 2.1 + v * 0.6
        coil(P, (math.cos(base) * R * 0.64, math.sin(base) * R * 0.64), (k - 1) * R * 0.12, R * 0.15,
             R * 0.9, 2.6, A.ribbon, 0.045 * S, 24, base)
    # a small antiparallel beta sheet, three strands side by side on the back
    for s in range(3):
        arrow(P, R * 0.8, R * 0.15, R * 0.055,
              (-R * 0.04, R * (-0.12 - s * 0.2), -R * (0.76 - abs(s - 1) * 0.04)), A.sheet,
              rx=0.25 - s * 0.25, ry=(math.pi if s % 2 else 0.0) + 0.16)
    # an active-site cleft, marked with a bound ion
    ball(P, (R * 0.42, R * 0.52, R * 0.44), 0.07 * S, A.Fe, BIG)
    ball(P, (R * 0.56, R * 0.48, R * 0.32), 0.05 * S, A.quark, MED)
    for i in range(3):                              # and a few ordered waters, in a plain neutral
        ball(P, (R * (0.3 + i * 0.13), R * (0.62 - i * 0.07), R * (0.56 - i * 0.11)), 0.035 * S, C.lightgrey, BEAD)
    return fit_uniform(P, 'mol_domain', v)


# Ball-and-stick props are open frames: a full-strength bake turns the thin
# sticks to soot where they meet the balls. The globules keep more of it.
for _pid in MODELS:
    FINISH.setdefault(_pid, {'ao': 0.6 if _pid in ('mol_protein', 'mol_domain') else 0.45})
