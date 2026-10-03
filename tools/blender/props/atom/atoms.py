"""Atom-stage props, modelled: the particles, the first atoms and the small
molecules.

Frame reminder (see kit.py): Blender Z is up, X is the prop's width, and the
game's FRONT (+Z) is Blender -Y. v1 (src/world/props/atom.js) is authored in
the game frame with three.js primitives, so every part here is built in that
same frame -- positions, `rx/ry/rz` Euler angles in three's 'YXZ' order, the
torus lying in XY -- and then turned into Blender by one +90 degree rotation
about X: a v1 point (x, y, z) lands at (x, -z, y).

The look: a premium toy of v1's own visual language. Glossy chunky balls
(a soft top-lit gradient painted in), clean round sticks of one thickness per
molecule, crisp thin orbit rings with the electrons riding ON them, and the
same self-lit colours v1 registers with glowColor().
"""
import math
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


# The atom stage's own palette (A in src/world/props/atom.js); the shared
# palette does not carry it.
A = type('A', (), dict(
    electron=0x7cf3ff, spark=0xc6f9ff, proton=0xff5c8f, neutron=0xc2ccff, quark=0xffe15c,
    glowV=0x9c63ff, glowM=0xff4bc6,
    H=0xf0f6ff, Cc=0x666f96, CcD=0x454d76, N=0x6f92ff, O=0xff6152,
    bond=0x9aa2d8, bondLo=0x666ea6,
))

# v1's glowColor() table: exactly these colours are self-lit, at these strengths.
GLOW = {A.electron: 0.6, A.spark: 0.8, A.quark: 0.45, A.glowV: 0.5, A.glowM: 0.5, A.proton: 0.25}

TAU = math.pi * 2
GOLD = 2.399963229728653

# game frame -> Blender frame
P = Matrix.Rotation(math.radians(90), 4, 'X')
# soft key-light direction for the painted gloss (Blender frame: up, a little front-left)
KEY = Vector((-0.3, -0.35, 0.89)).normalized()


# ---------------------------------------------------------------- helpers

def L(col):
    return lin(col) if isinstance(col, int) else col


def dk(col, t=0.2):
    return mixc(L(col), (0, 0, 0), t)


def lt(col, t=0.4):
    return mixc(L(col), (1, 1, 1), t)


def lit(o, col):
    """Glow the part if v1's table says its colour glows."""
    if isinstance(col, int) and col in GLOW:
        glow(o, GLOW[col])
    return o


def euler(rx=0.0, ry=0.0, rz=0.0):
    """three.js Euler(rx, ry, rz, 'YXZ') as a matrix."""
    return (Matrix.Rotation(ry, 4, 'Y') @ Matrix.Rotation(rx, 4, 'X') @ Matrix.Rotation(rz, 4, 'Z'))


def gplace(o, at=(0, 0, 0), rx=0.0, ry=0.0, rz=0.0):
    """Take a part built in v1's local frame through v1's opts and into Blender."""
    o.data.transform(P @ Matrix.Translation(Vector(at)) @ euler(rx, ry, rz))
    o.data.update()
    return o


def gv(p):
    """A v1 (game-frame) point in the Blender frame."""
    return Vector((p[0], -p[2], p[1]))


def uvball(r, u, v):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=u, v_segments=v, radius=r)
    return _from_bmesh(bm, 'ball')


def gloss(o, col, centre, r, hi=0.2, lo=0.25, spot=0.0):
    """Paint a glossy toy-ball shading: lighter towards the key light, deeper
    underneath, and (optionally) a soft sheen where the light faces."""
    base = L(col)
    c = Vector(centre)

    def fn(p):
        n = (Vector(p) - c) / r
        t = n.dot(KEY)
        if t >= 0:
            out = mixc(base, (1, 1, 1), hi * t * t * t)
            if spot:
                s = max(0.0, min(1.0, (t - 0.88) / 0.11))
                out = mixc(out, (1, 1, 1), spot * s * s * (3 - 2 * s))
        else:
            out = mixc(base, (0, 0, 0), lo * (-t))
        return out
    return paint(o, base, fn)


def ball(r, at, col, seg=16, rings=None, spot=0.25, hi=0.2, lo=0.25):
    """(2 x seg x (rings - 1) triangles)"""
    """A glossy ball centred on a v1 point."""
    o = uvball(r, seg, rings or max(4, seg // 2))
    c = gv(at)
    o.data.transform(Matrix.Translation(c))
    o.data.update()
    gloss(o, col, c, r, hi=hi, lo=lo, spot=spot)
    _smooth(o, 80)
    return lit(o, col)


def ring(R, r, col, at=(0, 0, 0), rx=0.0, ry=0.0, rz=0.0, seg=32, rseg=6):
    """v1's torus: lying in its local XY plane, then turned by v1's opts."""
    o = torus(R, r, color=col, seg=seg, rseg=rseg)
    gplace(o, at, rx, ry, rz)
    return lit(o, col)


def ring_point(R, a, at=(0, 0, 0), rx=0.0, ry=0.0, rz=0.0):
    """The v1-frame point at angle a round such a ring."""
    m = Matrix.Translation(Vector(at)) @ euler(rx, ry, rz)
    p = m @ Vector((R * math.cos(a), R * math.sin(a), 0))
    return (p.x, p.y, p.z)


def stick(p, q, r, col, seg=12):
    """A round bond from v1 point p to q (ends buried in the balls, so no caps)."""
    a, b = gv(p), gv(q)
    d = b - a
    h = d.length
    o = cyl(r, h, color=col, seg=seg, bevel=0, caps=False, smooth=60)
    rot = d.normalized().to_track_quat('Z', 'Y').to_matrix().to_4x4()
    o.data.transform(Matrix.Translation(a) @ rot)
    o.data.update()
    return lit(o, col)


def stick2(p, q, r, col, gap, seg=10):
    """v1's double bond: two parallel sticks offset sideways in the XZ plane."""
    dx, dz = q[0] - p[0], q[2] - p[2]
    ux, uz = dz, -dx
    ul = math.hypot(ux, uz)
    ux, uz = (1.0, 0.0) if ul < 1e-9 else (ux / ul, uz / ul)
    out = []
    for s in (-1, 1):
        out.append(stick((p[0] + ux * gap * s, p[1], p[2] + uz * gap * s),
                         (q[0] + ux * gap * s, q[1], q[2] + uz * gap * s), r, col, seg))
    return out


def sphere_pts(R, n, phase):
    """v1's golden-angle spread of n points over a sphere of radius R."""
    pts = []
    for i in range(n):
        y = 0 if n == 1 else 1 - (2 * i + 1) / n
        rad = math.sqrt(max(0.0, 1 - y * y))
        a = i * GOLD + phase
        pts.append((math.cos(a) * rad * R, y * R, math.sin(a) * rad * R))
    return pts


def nucleus(R, n, phase, seg=12, seg1=14):
    """v1's nucleusBall: protons and neutrons huddled inside radius R."""
    cap = max(1, min(n, 7))
    if cap == 1:
        return [ball(R, (0, 0, 0), A.proton, seg=seg1, spot=0.3)]
    r = R * (0.6 if cap <= 4 else 0.48)
    return [ball(r, p, A.proton if i % 2 else A.neutron, seg=seg, rings=6, spot=0.25)
            for i, p in enumerate(sphere_pts(R - r, cap, phase))]


def ring_extent(R, r, o, n=72):
    lo, hi = [1e9] * 3, [-1e9] * 3
    for i in range(n):
        p = ring_point(R, TAU * i / n, **o)
        for k in range(3):
            lo[k] = min(lo[k], p[k] - r)
            hi[k] = max(hi[k], p[k] + r)
    return lo, hi


def atom_body(pid, v, S, nuc_frac, nuc_n, shells, phase, nseg=12, rseg_in=20, rseg_out=26):
    """v1's atomBody, as a toy: the nucleus, then per shell a crisp orbit ring
    (two crossed rings on the outermost, as v1), with the shell's electrons
    riding ON the rings instead of v1's scatter round a sphere. Where they ride
    is chosen so the whole atom still fills v1's box: v1's scattered electrons
    set its extent, and ours, at the ends of the rings, would otherwise poke out."""
    parts = nucleus(nuc_frac * S, nuc_n, phase, nseg)
    er = S * 0.06
    want = kit.SPECS[pid]['boxes'][v]['size']
    for k, (frac, n) in enumerate(shells):
        R = frac * S
        last = k == len(shells) - 1
        tilt = 0.4 + k * 1.1 + phase
        rings = [(dict(rx=math.pi / 2 + math.sin(tilt) * 0.55, rz=math.cos(tilt) * 0.5),
                  S * 0.014, A.electron if last else A.spark)]
        if last:
            rings.append((dict(ry=math.sin(tilt) * 0.6, rz=math.cos(tilt) * 0.35), S * 0.012, A.spark))
        for o, r, col in rings:
            parts.append(ring(R, r, col, seg=rseg_out if last else rseg_in, rseg=5, **o))
        # electrons alternate between the shell's rings, evenly spaced on each
        counts = [len(range(j, n, len(rings))) for j in range(len(rings))]

        def place(offs):
            pts = []
            for j, (o, _, _) in enumerate(rings):
                m = counts[j]
                for t in range(m):
                    pts.append(ring_point(R, offs[j] + t * TAU / m, **o))
            return pts

        offs = [tilt * 1.7 + j * 1.3 for j in range(len(rings))]
        if last:
            # pick the ride positions (24 steps per ring) that best keep v1's box
            lo, hi = [1e9] * 3, [-1e9] * 3
            for o, r, _ in rings:
                a, b = ring_extent(R, r, o)
                lo = [min(lo[i], a[i]) for i in range(3)]
                hi = [max(hi[i], b[i]) for i in range(3)]
            steps = [offs[0] + TAU * i / 24 for i in range(24)]
            combos = [[a] for a in steps] if len(rings) == 1 else                 [[a, b] for a in steps for b in [offs[1] + TAU * i / 24 for i in range(24)]]
            best, bo = 1e9, offs
            for c in combos:
                l2, h2 = list(lo), list(hi)
                for p in place(c):
                    for i in range(3):
                        l2[i] = min(l2[i], p[i] - er)
                        h2[i] = max(h2[i], p[i] + er)
                # v1 sizes are game (x, y, z), as are these points
                sc = max(abs(math.log((h2[i] - l2[i]) / want[i])) for i in range(3))
                if sc < best - 1e-6:
                    best, bo = sc, c
            offs = bo
        for p in place(offs):
            parts.append(ball(er, p, A.electron, seg=10, rings=4, spot=0.35))
    return parts


# ---------------------------------------------------------------- sub-atomic

@model('atom_electron', ao=0.4)
def electron(v):
    S = 0.03581
    parts = [ball(0.26 * S, (0, 0, 0), A.electron, seg=16, spot=0.4)]
    o = dict(rx=math.pi / 2 + v * 0.4, rz=v * 0.3)
    parts.append(ring(0.42 * S, 0.026 * S, A.spark, seg=32, rseg=5, **o))
    for i in range(3):
        a = i * TAU / 3 + v
        parts.append(ball(0.08 * S, (math.cos(a) * 0.42 * S, (i - 1) * 0.28 * S, math.sin(a) * 0.42 * S),
                          A.spark, seg=10, spot=0.3))
    return parts


def quark_ball(S, body, quarks, phase):
    """A nucleon as a toy: a glossy ball with its three quarks surfacing as
    bright bumps. v1 put them inside the ball, where they never showed; here
    they sit round the upper half so all three read from above."""
    parts = [ball(0.465 * S, (0, 0, 0), body, seg=20, spot=0.3)]
    el = math.radians(28)
    for i in range(3):
        a = i * TAU / 3 + phase
        d = Vector((math.cos(a) * math.cos(el), math.sin(el), math.sin(a) * math.cos(el))) * 0.38 * S
        parts.append(ball(0.16 * S, tuple(d), quarks[i], seg=12, spot=0.4))
    return parts


@model('atom_proton', ao=0.4)
def proton(v):
    S = 0.036
    return quark_ball(S, A.proton, [A.quark, A.quark, A.electron], v * 0.7)


@model('atom_neutron', ao=0.4)
def neutron(v):
    S = 0.042
    return quark_ball(S, A.neutron, [A.quark, A.glowV, A.glowV], v * 1.1)


@model('atom_alpha', ao=0.5)
def alpha(v):
    S = 0.05681
    k, rr = 0.22 * S, 0.28 * S
    verts = [(1, 1, 1), (1, -1, -1), (-1, 1, -1), (-1, -1, 1)]
    parts = []
    for i in range(4):
        p = verts[(i + v) % 4]
        parts.append(ball(rr, (p[0] * k, p[1] * k, p[2] * k), A.proton if i < 2 else A.neutron, seg=12, spot=0.3))
    parts.append(ring(0.44 * S, 0.017 * S, A.spark, rx=math.pi / 2, rz=0.4, seg=30, rseg=5))
    return parts


@model('atom_hplus', ao=0.4)
def hplus(v):
    S = 0.06894
    parts = [ball(0.2 * S, (0, 0, 0), A.proton, seg=12, rings=7, spot=0.35)]
    for k in range(2):
        parts.append(ring(0.4 * S, 0.018 * S, A.glowM if k else A.spark,
                          rx=math.pi / 2 + k * 1.0 + v * 0.3, rz=k * 0.7, seg=24, rseg=5))
    # the missing electron, drawn as a bare charge: a chunky rounded plus
    t = 0.075 * S
    for (w, h) in ((0.34 * S, t), (t, 0.34 * S)):
        # built straight in Blender: facing the game's front, centred at v1's y
        b = box((w, t, h), at=(0, 0, 0.42 * S - h / 2), color=A.quark, bevel=t * 0.4)
        parts.append(lit(b, A.quark))
    for i in range(4):
        a = i * TAU / 4 + 0.4
        parts.append(ball(0.055 * S, (math.cos(a) * 0.45 * S, -0.1 * S, math.sin(a) * 0.45 * S), A.glowM, seg=8, rings=4, spot=0.35))
    return parts


# ---------------------------------------------------------------- atoms

@model('atom_hydrogen', ao=0.4)
def hydrogen(v):
    S = 0.08138
    return atom_body('atom_hydrogen', v, S, 0.13, 1, [(0.45, 1)], v * 0.8)


@model('atom_helium', ao=0.45)
def helium(v):
    S = 0.09918
    return atom_body('atom_helium', v, S, 0.18, 4, [(0.45, 2)], v * 0.9 + 0.3, nseg=11, rseg_out=24)


@model('atom_lithium', ao=0.45)
def lithium(v):
    S = 0.11249
    return atom_body('atom_lithium', v, S, 0.2, 7, [(0.26, 2), (0.45, 1)], v * 0.7 + 0.9, nseg=11)


@model('atom_carbon', ao=0.45)
def carbon(v):
    S = 0.13303
    return atom_body('atom_carbon', v, S, 0.22, 12, [(0.25, 2), (0.45, 4)], v * 0.8 + 1.6)


@model('atom_oxygen', ao=0.45)
def oxygen(v):
    S = 0.15607
    return atom_body('atom_oxygen', v, S, 0.24, 16, [(0.24, 2), (0.45, 6)], v * 0.6 + 2.4)


# ---------------------------------------------------------------- molecules
# Ball-and-stick, v1's layout point for point. One stick thickness per
# molecule; every atom of an element the same size and colour within it.

@model('mol_hydroxide', ao=0.5)
def hydroxide(v):
    S = 0.23934
    o, h = (-0.1 * S, 0, 0), (0.28 * S, 0.14 * S, 0)
    parts = [stick(o, h, 0.05 * S, A.bond),
             ball(0.24 * S, o, A.O, seg=18, spot=0.25),
             ball(0.13 * S, h, A.H, seg=14, spot=0.2)]
    # the spare charge: a chunky rounded minus, facing the front
    t = 0.06 * S
    m = box((0.22 * S, t, t), at=gv((-0.06 * S, 0.34 * S - t / 2, 0.02 * S)), color=A.electron, bevel=t * 0.4)
    parts.append(lit(m, A.electron))
    if v:
        parts.append(ring(0.34 * S, 0.014 * S, A.spark, at=o, rx=math.pi / 2, rz=0.5, seg=26, rseg=4))
    return parts


@model('mol_water', ao=0.5)
def water(v):
    S = 0.31743
    half, Lb = 0.912, 0.34 * S
    parts = [ball(0.24 * S, (0, 0, 0), A.O, seg=18, rings=8, spot=0.25)]
    for s in (-1, 1):
        h = (math.sin(half) * Lb * s, math.cos(half) * Lb, 0)
        parts.append(stick((0, 0, 0), h, 0.05 * S, A.bond))
        parts.append(ball(0.14 * S, h, A.H, seg=16, spot=0.2))
    if v == 2:
        parts.append(ball(0.06 * S, (0, -0.24 * S, 0.14 * S), A.electron, seg=8, rings=4, spot=0.35))
    return parts


@model('mol_ammonia', ao=0.5)
def ammonia(v):
    S = 0.32826
    n, Lb = (0, 0.06 * S, 0), 0.33 * S
    parts = [ball(0.22 * S, n, A.N, seg=18, spot=0.25)]
    for i in range(3):
        a = i * TAU / 3 + v * 0.5
        h = (math.cos(a) * Lb * 0.94, n[1] - Lb * 0.42, math.sin(a) * Lb * 0.94)
        parts.append(stick(n, h, 0.048 * S, A.bond))
        parts.append(ball(0.13 * S, h, A.H, seg=15, rings=7, spot=0.2))
    # the lone pair
    for s in (-1, 1):
        parts.append(ball(0.055 * S, (s * 0.07 * S, 0.32 * S, 0), A.electron, seg=8, rings=5, spot=0.35))
    return parts


@model('mol_methane', ao=0.5)
def methane(v):
    S = 0.43479
    Lb = 0.33 * S
    verts = [(1, 1, 1), (1, -1, -1), (-1, 1, -1), (-1, -1, 1)]
    parts = [ball(0.21 * S, (0, 0, 0), A.Cc, seg=16, spot=0.25)]
    for i in range(4):
        p = verts[(i + v) % 4]
        h = tuple(c * Lb * 0.577 for c in p)
        parts.append(stick((0, 0, 0), h, 0.045 * S, A.bond))
        parts.append(ball(0.13 * S, h, A.H, seg=15, rings=7, spot=0.2))
    return parts


@model('mol_co2', ao=0.5)
def co2(v):
    S = 0.44316
    Lb = 0.5 * S
    parts = [ball(0.21 * S, (0, 0, 0), A.Cc, seg=18, spot=0.25)]
    for s in (-1, 1):
        parts += stick2((0, 0, 0), (s * Lb, 0, 0), 0.045 * S, A.bondLo, 0.085 * S, seg=10)
        parts.append(ball(0.24 * S, (s * Lb, 0, 0), A.O, seg=18, spot=0.25))
    if v:
        for s in (-1, 1):
            parts.append(ball(0.05 * S, (s * Lb * 0.5, 0.24 * S, 0), A.electron, seg=10, rings=5, spot=0.35))
    return parts


@model('mol_ethanol', ao=0.5)
def ethanol(v):
    S = 0.46411
    c1, c2, ox = (-0.5 * S, -0.06 * S, 0), (-0.1 * S, 0.1 * S, 0), (0.34 * S, -0.06 * S, 0)
    oh = (0.56 * S, 0.1 * S, 0.04 * S)
    br = 0.04 * S          # one stick thickness for the whole molecule
    parts = [stick(c1, c2, br, A.bond), stick(c2, ox, br, A.bond), stick(ox, oh, br, A.bond),
             ball(0.17 * S, c1, A.Cc, seg=16, spot=0.25),
             ball(0.17 * S, c2, A.Cc, seg=16, spot=0.25),
             ball(0.18 * S, ox, A.O, seg=16, spot=0.25),
             ball(0.1 * S, oh, A.H, seg=12, rings=5, spot=0.2)]
    # methyl and methylene hydrogens
    hs = [(c1, 0.2, 0.9), (c1, -0.2, -0.9), (c2, 0.2, 0.95), (c2, -0.2, -0.95)]
    for i, (c, dy, dz) in enumerate(hs):
        h = (c[0] + (0.1 if i % 2 else -0.1) * S, c[1] + dy * S * 0.9, c[2] + dz * S * 0.22)
        parts.append(stick(c, h, br, A.bond))
        parts.append(ball(0.1 * S, h, A.H, seg=12, rings=5, spot=0.2))
    if v:
        parts.append(ring(0.24 * S, 0.012 * S, A.spark, at=ox, rx=math.pi / 2, seg=28, rseg=4))
    return parts
