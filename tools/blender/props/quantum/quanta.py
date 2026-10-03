"""Quantum-stage props, the first half of the ladder: the vacuum fizz, the
leptons, the quarks and the first field excitations (q_fluct ... q_string).

Frame reminder (see kit.py): Blender Z is up, X is the prop's width, and the
game's FRONT (+Z) is Blender -Y. v1 (src/world/props/quantum.js) is authored
in the game frame and every build is a multiple of one `S`, so these are too:
each part is made about its own origin IN THE GAME FRAME, moved with v1's own
opts (x, y, z, rx, ry, rz — three's 'YXZ' Euler), and only then turned into
Blender's frame by `place()`. Tubes take game-frame points through `gp()`.

The look: a premium toy of the diagrams. Glossy chunky balls (a painted
highlight up-front and a darker underside), clean round sticks of one
thickness per prop, crisp thin hoops, and v1's glow table carried over
colour for colour (`GLOWK`), so the same parts self-light and bloom.
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
PI = math.pi

# v1's stage palette (Q in quantum.js) — not in the shared palette.
Q = type('Q', (), dict(
    cyan=0x5ceeff, cyanHi=0xcafbff, magenta=0xff4fd6, magHi=0xffa6ec,
    violet=0x9a5cff, violetD=0x53309c, acid=0xd8ff45, amber=0xffb43c,
    hot=0xfff4d6, rose=0xff6d90, teal=0x3ff0c4, lime=0x8dff86, ice=0xc4e6ff,
    foam=0x7b62e0, deep=0x2a1550, cR=0xff4d5e, cG=0x62ff8a, cB=0x5aa8ff,
))

# v1's glowColor() table: every part painted exactly this colour self-lights.
GLOWK = {
    Q.hot: 0.9, Q.cyanHi: 0.7, Q.magHi: 0.6, Q.ice: 0.4,
    Q.cyan: 0.45, Q.magenta: 0.4, Q.acid: 0.45, Q.teal: 0.35, Q.lime: 0.35,
    Q.cR: 0.35, Q.cG: 0.35, Q.cB: 0.35,
}


# ---------------------------------------------------------------- helpers

def L(col):
    return lin(col) if isinstance(col, int) else col


def lt(col, t=0.35):
    return mixc(L(col), (1.0, 1.0, 1.0), t)


def dk(col, t=0.25):
    return mixc(L(col), (0.0, 0.0, 0.0), t)


# game (x, y, z) -> Blender (x, -z, y): a proper rotation, so normals survive
BASIS = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))
# kit's Z-axis primitives (cyl, lathe) -> three's Y-axis ones: (x, y, z) -> (x, z, -y)
Z2Y = Matrix.Rotation(-PI / 2, 4, 'X')


def gp(p):
    """A v1 (game-frame) point in the Blender frame."""
    return Vector((p[0], -p[2], p[1]))


def place(o, at=(0, 0, 0), rx=0.0, ry=0.0, rz=0.0):
    """o's mesh is in the game frame about its origin; apply v1's opts
    (three's Euler 'YXZ' = Ry . Rx . Rz) and convert to Blender."""
    R = Matrix.Rotation(ry, 4, 'Y') @ Matrix.Rotation(rx, 4, 'X') @ Matrix.Rotation(rz, 4, 'Z')
    o.data.transform(BASIS @ Matrix.Translation(Vector(at)) @ R)
    o.data.update()
    return o


def lit(o, col):
    """Glow exactly as v1 would for a part painted `col`."""
    if isinstance(col, int) and col in GLOWK:
        glow(o, GLOWK[col])
    return o


def glow_faces(o, fn):
    """Per-face glow: fn(face centre) -> k (0 for none)."""
    me = o.data
    attr = me.attributes.get('glow') or me.attributes.new('glow', 'FLOAT', 'CORNER')
    for poly in me.polygons:
        k = fn(poly.center)
        for li in poly.loop_indices:
            attr.data[li].value = k
    return o


KEY = Vector((-0.35, -0.5, 0.79)).normalized()   # up, toward the front, a touch left


def gloss(o, col, c, hi=0.5, lo=0.32):
    """Paint a ball glossy: a soft highlight toward KEY (tinted, so a dark
    ball reads as glossy plastic rather than chrome) and a darker belly."""
    base = L(col)
    dark = dk(base, lo)
    m = max(max(base), 1e-6)
    hl = mixc(tuple(ch / m for ch in base), (1.0, 1.0, 1.0), 0.35)   # the hue at full value, toward white
    cv = Vector(c)

    def fn(p):
        n = p - cv
        n = n / max(n.length, 1e-12)
        s = max(0.0, n.dot(KEY)) ** 5 * hi
        d = max(0.0, -n.z) ** 1.4
        return mixc(mixc(base, dark, d), hl, s)
    return paint(o, base, fn)


def ball(r, col, at=(0, 0, 0), seg=20, scale=(1, 1, 1), rx=0.0, ry=0.0, rz=0.0, shine=True, hi=0.5, lo=0.32):
    """A sphere / ellipsoid in the game frame (scale is game x, y, z)."""
    o = sphere(r, color=col, seg=seg, scale=scale)
    place(o, at, rx, ry, rz)
    if shine:
        gloss(o, col, gp(at), hi, lo)
    return lit(o, col)


def hoop(R, t, col, at=(0, 0, 0), rx=0.0, ry=0.0, rz=0.0, seg=32, rseg=8):
    """three's torus: in the XY plane until rotated (rx = PI/2 lays it flat)."""
    o = torus(R, t, color=col, seg=seg, rseg=rseg)
    place(o, at, rx, ry, rz)
    return lit(o, col)


def lrod(prof, col, at=(0, 0, 0), rx=0.0, ry=0.0, rz=0.0, seg=12, smooth=40):
    """A turned part along three's +Y from a [(radius, y), ...] profile
    (bottom to top) — cones and pins without kit.cyl's bevel bill."""
    o = lathe(prof, color=col, seg=seg, smooth=smooth, close_bottom=prof[0][0] > 1e-6)
    o.data.transform(Z2Y)
    place(o, at, rx, ry, rz)
    return lit(o, col)


def cone(r, h, col, at=(0, 0, 0), rx=0.0, ry=0.0, rz=0.0, seg=12, tip=0.1):
    """three's cone (base at -h/2, point at +h/2), with a rounded rim and a
    blunted point."""
    return lrod([(0.0, -h / 2), (r * 0.86, -h / 2), (r, -h / 2 + h * 0.07), (r * tip, h / 2 - h * 0.05),
                 (0.0, h / 2)], col, at, rx, ry, rz, seg=seg)


def prism(poly, depth, col, at=(0, 0, 0), rx=0.0, ry=0.0, rz=0.0, bevel=0.0):
    """An outline in three's XY plane, extruded `depth` along Z and centred
    on it; one bevel segment rounds its rims cheaply."""
    bm = bmesh.new()
    face = bm.faces.new([bm.verts.new((x, y, -depth / 2)) for (x, y) in poly])
    res = bmesh.ops.extrude_face_region(bm, geom=[face])
    for e in res['geom']:
        if isinstance(e, bmesh.types.BMVert):
            e.co.z += depth
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = _from_bmesh(bm, 'prism')
    _bevel(o, bevel, 1)
    place(o, at, rx, ry, rz)
    paint(o, col)
    _smooth(o, 30)
    return lit(o, col)


def rrect(w, h, r, n=2):
    """A rounded-rectangle outline (counter-clockwise)."""
    r = min(r, w / 2 - 1e-6, h / 2 - 1e-6)
    pts = []
    for qx, qy, a0 in ((1, 1, 0), (-1, 1, 90), (-1, -1, 180), (1, -1, 270)):
        ox, oy = qx * (w / 2 - r), qy * (h / 2 - r)
        for i in range(n + 1):
            a = math.radians(a0 + 90 * i / n)
            pts.append((ox + r * math.cos(a), oy + r * math.sin(a)))
    return pts


def plus(w, t):
    """A plus-sign outline, arms w long and t thick."""
    a, b = w / 2, t / 2
    return [(b, b), (b, a), (-b, a), (-b, b), (-a, b), (-a, -b), (-b, -b), (-b, -a), (b, -a), (b, -b), (a, -b), (a, b)]


def sweep(points, radii, col, n=8, closed=False, ref=None, caps=True, smooth=60):
    """A round tube through game-frame `points`, radius per point (or one).
    Open tubes are parallel-transported; closed ones take their ring frame
    from `ref` (a game-frame direction never along the curve)."""
    pts = [gp(p) for p in points]
    m = len(pts)
    rr = radii if isinstance(radii, (list, tuple)) else [radii] * m
    bm = bmesh.new()
    tans = []
    for i in range(m):
        if closed:
            a, b = pts[(i - 1) % m], pts[(i + 1) % m]
        else:
            a, b = pts[max(0, i - 1)], pts[min(m - 1, i + 1)]
        tans.append((b - a).normalized())
    rings = []
    if ref is not None:
        rv = gp(ref)
    else:
        t0 = tans[0]
        rv = Vector((0, 0, 1)) if abs(t0.z) < 0.9 else Vector((1, 0, 0))
        u = t0.cross(rv).normalized()
    for i, p in enumerate(pts):
        t = tans[i]
        if ref is not None:
            u = (rv - t * rv.dot(t)).normalized()
        elif i:
            u = (u - t * u.dot(t)).normalized()
        w = t.cross(u).normalized()
        ring = []
        for j in range(n):
            a = TAU * j / n
            ring.append(bm.verts.new(p + (u * math.cos(a) + w * math.sin(a)) * rr[i]))
        rings.append(ring)
    pairs = list(zip(rings, rings[1:])) + ([(rings[-1], rings[0])] if closed else [])
    for a, b in pairs:
        for j in range(n):
            bm.faces.new((a[j], a[(j + 1) % n], b[(j + 1) % n], b[j]))
    if not closed and caps:
        bm.faces.new(list(reversed(rings[0])))
        bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = _from_bmesh(bm, 'sweep')
    paint(o, col)
    _smooth(o, smooth)
    return lit(o, col)


def stick(p, q, r, col, n=10):
    """A straight bond p -> q (game frame), ends hidden in what it joins."""
    return sweep([p, q], r, col, n=n)


# ---------------------------------------------------------------- the vacuum

@model('q_fluct', ao=0.45)
def q_fluct(v):
    S = 0.01642
    # a bubble of borrowed energy: a dark glossy interior inside a bright rim,
    # three sparks of borrowed light fizzing round it
    parts = [ball(0.3 * S, Q.deep, seg=16, hi=0.5, lo=0.15)]
    parts.append(hoop(0.44 * S, 0.035 * S, Q.violet if v % 2 else Q.foam,
                      rx=PI / 2 + v * 0.5, rz=v * 0.4, seg=26, rseg=5))
    for i in range(3):
        a = i * TAU / 3 + v
        parts.append(ball(0.09 * S, Q.cyanHi, at=(math.cos(a) * 0.3 * S, (i - 1) * 0.4 * S, math.sin(a) * 0.3 * S),
                          seg=10, hi=0.3))
    return parts


@model('q_vpair', ao=0.45)
def q_vpair(v):
    S = 0.02228
    # particle and antiparticle on loan, already flying apart along a dashed
    # track, inside the hoop of the loan
    p, q = (-0.3 * S, -0.26 * S, -0.1 * S), (0.3 * S, 0.26 * S, 0.1 * S)
    parts = []
    for i in range(1, 4):
        t = i / 4
        parts.append(ball(0.055 * S, Q.violet, at=tuple(p[k] + (q[k] - p[k]) * t for k in range(3)), seg=8, hi=0.3))
    parts.append(ball(0.2 * S, Q.cyan, at=p, seg=14))
    parts.append(ball(0.2 * S, Q.magenta, at=q, seg=14))
    parts.append(hoop(0.32 * S, 0.022 * S, Q.foam, rx=PI / 2 + v * 0.6, rz=0.5, seg=26, rseg=4))
    return parts


@model('q_photon', ao=0.35)
def q_photon(v):
    S = 0.03130
    # a wavelength and a half of light: one smooth wave, banded white-hot and
    # pale cyan as v1's eight segments were, a bright packet at its middle and
    # an acid spark capping each end (v1 hung those on the axis, off the wave)
    Lw, A = 1.25 * S, 0.27 * S
    N = 28
    pts = []
    for i in range(N + 1):
        t = i / N
        ph = t * TAU * 1.5 + v * 0.7
        pts.append(((t - 0.5) * Lw, math.sin(ph) * A, math.cos(ph) * A * 0.5))
    rad = [0.05 * S * (0.8 + 0.2 * math.sin(PI * i / N)) for i in range(N + 1)]
    w = sweep(pts, rad, Q.hot, n=8)

    def seg_of(c):
        return min(8, max(1, int(((c.x / Lw) + 0.5) * 8) + 1))
    recolor(w, lambda c, nrm: Q.cyanHi if seg_of(c) % 2 else None)
    glow_faces(w, lambda c: GLOWK[Q.cyanHi] if seg_of(c) % 2 else GLOWK[Q.hot])
    parts = [w]
    parts.append(ball(0.1 * S, Q.hot, at=pts[N // 2], seg=12, hi=0.25))
    for e in (pts[0], pts[-1]):
        parts.append(ball(0.068 * S, Q.acid, at=e, seg=10, hi=0.35))
    return parts


# Barely there, and going: a pale dart with a white-hot nose and a fading,
# wavering wake, three flavours by colour. v1 turned only the dart's BODY per
# flavour (ry = v * 0.8) and left nose and wake pointing the old way; here the
# whole dart turns as one, and the yaw / wake sway / wake length per variant are
# solved so it still fills v1's box.
NEUTRINO = [(0.0, 0.14, 0.52), (-0.44, 0.08, 0.56), (-0.72, 0.24, 0.65)]   # yaw, sway, wake


@model('q_neutrino', ao=0.4)
def q_neutrino(v):
    S = 0.03533
    col = [Q.ice, Q.teal, Q.lime][v % 3]
    yaw, sway, wl = NEUTRINO[v % 3]
    # gloss() normalises by distance, so the ellipsoid shines like a ball
    parts = [ball(1.0, col, scale=(0.16 * S, 0.16 * S, 0.4 * S), rx=0.3, seg=18, hi=0.4)]
    nose = (0, -math.sin(0.3) * 0.36 * S, math.cos(0.3) * 0.36 * S)
    parts.append(ball(0.075 * S, Q.hot, at=nose, seg=12, hi=0.2))
    pts, rad = [], []
    # a comet's tail: as wide as the dart where it leaves it, thinning to a thread
    tail = (0, math.sin(0.3) * 0.26 * S, -math.cos(0.3) * 0.26 * S)
    N = 14
    for i in range(N + 1):
        t = i / N
        pts.append((math.sin(t * 3 + v) * sway * S * t ** 0.7, tail[1] + t * 0.2 * S, tail[2] - t * (wl + 0.04) * S))
        rad.append(S * (0.012 + 0.1 * (1 - t) ** 1.3))
    wake = sweep(pts, rad, col, n=8)
    # fading: the wake darkens toward the vacuum as it goes (Blender y = -game z)
    paint(wake, L(col), lambda p: mixc(L(col), dk(col, 0.55), min(1.0, max(0.0, (p.y - 0.28 * S) / (wl * S)))))
    parts.append(lit(wake, col))
    turn = BASIS @ Matrix.Rotation(yaw, 4, 'Y') @ BASIS.inverted()
    for o in parts:
        o.data.transform(turn)
        o.data.update()
    return parts


# ---------------------------------------------------------------- leptons and spin

@model('q_spin', ao=0.45)
def q_spin(v):
    S = 0.03873
    # angular momentum with nothing spinning: an axis, an arrowhead (up or
    # down, which is the whole joke), and a circulation hoop whose three beads
    # are now little arrowheads running the right-hand way round it
    up = 1 if v % 2 == 0 else -1
    parts = [lrod([(0.0, -0.43 * S), (0.035 * S, -0.41 * S), (0.035 * S, 0.41 * S), (0.0, 0.43 * S)],
                  Q.cyanHi, seg=10)]
    parts.append(cone(0.115 * S, 0.22 * S, Q.acid, at=(0, up * 0.4 * S, 0), rz=0 if up > 0 else PI, seg=16))
    parts.append(ball(0.17 * S, Q.violet, seg=14))
    parts.append(hoop(0.36 * S, 0.03 * S, Q.magenta, rx=PI / 2, seg=28, rseg=5))
    for i in range(3):
        a = i * TAU / 3 + v
        at = (math.cos(a) * 0.36 * S, 0.0, math.sin(a) * 0.36 * S)
        # velocity of (up * Y) x r is up * (sin a, 0, -cos a): +Y -> +Z, then head it
        hd = math.atan2(math.sin(a) * up, -math.cos(a) * up)
        tip = cone(0.068 * S, 0.18 * S, Q.magHi, seg=8, tip=0.12)
        tip.data.transform(BASIS @ Matrix.Translation(Vector(at)) @ Matrix.Rotation(hd, 4, 'Y')
                           @ Matrix.Rotation(PI / 2, 4, 'X') @ BASIS.inverted())
        tip.data.update()
        parts.append(tip)
    return parts


def lepton(S, core, halo, phase, sign, mark):
    """v1's `ball` + `charge`: a glossy particle with two orbit hoops riding
    just proud of it, three halo blips and a raised charge sign on top, facing
    front like v1's crossed bars."""
    parts = [ball(0.5 * S, core, seg=16, hi=0.45)]
    for k in range(2):
        parts.append(hoop(0.525 * S, 0.024 * S, halo if k else Q.cyanHi,
                          rx=PI / 2 + k * 1.05 + phase * 0.4, rz=k * 0.8 + phase * 0.3, seg=28, rseg=4))
    for i in range(3):
        a = i * TAU / 3 + phase
        parts.append(ball(0.055 * S, halo, at=(math.cos(a) * 0.47 * S, math.sin(a * 1.7) * 0.34 * S, math.sin(a) * 0.47 * S),
                          seg=8, hi=0.25))
    shape = plus(0.3 * S, 0.075 * S) if sign > 0 else rrect(0.32 * S, 0.085 * S, 0.035 * S, n=1)
    parts.append(prism(shape, 0.08 * S, mark, at=(0, 0.5 * S, 0), bevel=0.018 * S))
    return parts


@model('q_electron', ao=0.45)
def q_electron(v):
    return lepton(0.03736, Q.cyan, Q.cyanHi, v * 0.6, -1, Q.ice)


@model('q_positron', ao=0.45)
def q_positron(v):
    return lepton(0.04239, Q.magenta, Q.magHi, v * 0.7 + 0.4, 1, Q.hot)


# ---------------------------------------------------------------- quarks

def quark(S, flavour, mark, phase):
    """A flavour-coloured ball wearing its three colour charges as glowing
    studs, a white-hot confinement hoop, and a flavour tally on top (one bump
    for up / down, two for strange, three for charm)."""
    parts = [ball(0.5 * S, flavour, seg=16, hi=0.45)]
    cc = [Q.cR, Q.cG, Q.cB]
    for i in range(3):
        a = i * TAU / 3 + phase
        d = Vector((math.cos(a) * 0.45, math.cos(a * 2) * 0.3, math.sin(a) * 0.45)).normalized()
        c = d * (0.485 * S)
        stud = ball(1.0, cc[i], scale=(0.12 * S, 0.12 * S, 0.055 * S), seg=10, shine=False)
        # lie the stud on the surface: its short (z) axis along d
        yaw = math.atan2(d.x, d.z)
        pitch = math.asin(max(-1.0, min(1.0, -d.y)))
        stud.data.transform(BASIS @ Matrix.Translation(c) @ Matrix.Rotation(yaw, 4, 'Y')
                            @ Matrix.Rotation(pitch, 4, 'X') @ BASIS.inverted())
        stud.data.update()
        gloss(stud, cc[i], gp(c * 0.9), 0.35, 0.2)
        parts.append(lit(stud, cc[i]))
    parts.append(hoop(0.525 * S, 0.022 * S, Q.hot, rx=PI / 2 + phase * 0.3, rz=0.4, seg=28, rseg=5))
    for i in range(mark):
        # a paler tint so it reads on the ball, but self-lit as v1's flavour-coloured bump was
        bump = ball(0.05 * S, lt(flavour, 0.35), at=((i - (mark - 1) / 2) * 0.13 * S, 0.495 * S, 0), seg=8, hi=0.3)
        parts.append(lit(bump, flavour))
    return parts


@model('q_quark_up', ao=0.45)
def q_quark_up(v):
    return quark(0.05109, Q.acid, 1, v * 0.8)


@model('q_quark_down', ao=0.45)
def q_quark_down(v):
    return quark(0.06022, Q.cyan, 1, v * 0.8 + 1.1)


@model('q_quark_strange', ao=0.45)
def q_quark_strange(v):
    return quark(0.07052, Q.violet, 2, v * 0.8 + 2.2)


@model('q_quark_charm', ao=0.45)
def q_quark_charm(v):
    return quark(0.08227, Q.rose, 3, v * 0.8 + 3.3)


# ---------------------------------------------------------------- field excitations

@model('q_gluon', ao=0.5)
def q_gluon(v):
    S = 0.13002
    # a twisted flux tube: two colour strands wound round each other about the
    # vertical (v1 stands it up so it is never a fence), white-hot end caps the
    # strands dive into, and acid hoops clamping it
    R = 0.24 * S
    cc = [[Q.cR, Q.cG], [Q.cG, Q.cB], [Q.cB, Q.cR], [Q.cR, Q.cB]][v]
    parts = []
    N = 28
    for k in range(2):
        ph0 = k * PI + v * 0.4
        pts = []
        for i in range(N + 1):
            t = i / N
            a = ph0 + t * 1.6 * TAU
            rr = R * (1 - 0.6 * max(0.0, abs(t - 0.5) * 2 - 0.84) / 0.16)
            pts.append((math.cos(a) * rr, -0.44 * S + 0.88 * S * t, math.sin(a) * rr))
        parts.append(sweep(pts, 0.055 * S, cc[k], n=8))
    for s in (-1, 1):
        parts.append(ball(0.11 * S, Q.hot, at=(0, s * 0.46 * S, 0), seg=12, hi=0.25))
        parts.append(hoop(0.3 * S, 0.022 * S, Q.acid, at=(0, s * 0.34 * S, 0), rx=PI / 2, seg=22, rseg=5))
    return parts


@model('q_fringe', ao=0.45)
def q_fringe(v):
    S = 0.11625
    # bright and dark bands as concentric UPRIGHT hoops (v1 stands it up so it
    # never lies flat as a fence), a white-hot centre and four bright motes
    parts = []
    for k in range(4):
        R = (0.14 + k * 0.11) * S
        parts.append(hoop(R, 0.03 * S, Q.violetD if k % 2 else Q.cyan,
                          at=(0, 0, (0.1 if k % 2 else -0.1) * S), ry=v * 0.3, seg=20 + 4 * k, rseg=4))
    parts.append(ball(0.09 * S, Q.hot, seg=12, hi=0.25))
    for s in (-1, 1):
        parts.append(ball(0.06 * S, Q.cyanHi, at=(s * 0.47 * S, 0.06 * S, 0), seg=8, hi=0.3))
        parts.append(ball(0.06 * S, Q.magHi, at=(0, s * 0.47 * S, 0.08 * S), seg=8, hi=0.3))
    return parts


@model('q_lobe', ao=0.45)
def q_lobe(v):
    S = 0.15070
    # one p-orbital: two teardrop lobes of opposite phase meeting at a pinched
    # node, a violet nodal hoop, and white-hot beads at the far tips
    parts = []
    for s in (-1, 1):
        col = Q.cyan if s > 0 else Q.magenta
        prof = []
        M = 10
        for i in range(M + 1):
            u = i / M                               # 0 at the node, 1 at the tip
            r = 0.27 * S * (math.sin(PI * u) ** 0.85) * (0.62 + 0.55 * u) / 1.02
            prof.append((max(r, 0.0), s * (0.03 * S + u * 0.9 * S)))
        if s < 0:
            prof.reverse()
        lobe = lathe(prof, color=col, seg=16, close_bottom=False)    # Blender Z is game Y already
        gloss(lobe, col, gp((0, s * 0.55 * S, 0)), 0.45)
        parts.append(lit(lobe, col))
        parts.append(ball(0.075 * S, Q.hot, at=(0, s * 0.9 * S, 0), seg=10, hi=0.2))
    parts.append(hoop(0.28 * S, 0.03 * S, Q.violet, rx=PI / 2, seg=26, rseg=5))
    if v:
        parts.append(hoop(0.19 * S, 0.02 * S, Q.foam, at=(0, v * 0.16 * S, 0), rx=PI / 2, seg=20, rseg=4))
    return parts


@model('q_foam', ao=0.6)
def q_foam(v):
    S = 0.16816
    # spacetime where it stops being smooth: a huddle of glossy bubbles, no two
    # the same size, with a few bright struts between them
    pts = []
    for i in range(9):
        y = 1 - (2 * i + 1) / 9
        rad = math.sqrt(max(0.0, 1 - y * y))
        a = i * GOLD + v
        pts.append((math.cos(a) * rad * 0.3 * S, y * 0.3 * S, math.sin(a) * rad * 0.3 * S))
    parts = []
    for i, p in enumerate(pts):
        rr = (0.14 + ((i * 7 + v) % 5) * 0.026) * S
        col = Q.foam if i % 3 == 0 else (Q.violetD if i % 3 == 1 else Q.violet)
        parts.append(ball(rr, col, at=p, seg=14 if rr > 0.21 * S else 12, hi=0.5 if col == Q.violetD else 0.6, lo=0.25))
    # v1's struts ran centre to centre, buried in the bubbles; here each one
    # bows out over the huddle, so the bright filaments lie in the crevices
    for i in range(0, len(pts), 2):
        p0, p1 = Vector(pts[i]), Vector(pts[(i + 3) % len(pts)])
        mid = (p0 + p1) / 2
        mid = mid.normalized() * 0.47 * S if mid.length > 1e-6 else mid
        arc = []
        for k in range(8):
            t = k / 7
            arc.append(tuple(p0 * (1 - t) ** 2 + mid * 2 * t * (1 - t) + p1 * t * t))
        parts.append(sweep(arc, 0.03 * S, Q.cyanHi, n=6))
    return parts


@model('q_string', ao=0.4)
def q_string(v):
    S = 0.25770
    # a closed loop with a standing wave on it, hung mostly upright: v0 is the
    # second mode, the rest overtones. Banded acid / amber as v1's fourteen
    # segments, white-hot beads riding it.
    n, mode = 14, 2 + v

    def at(a):
        R = 0.42 * S * (1 + 0.2 * math.sin(mode * a + v))
        return (math.cos(a) * R, math.sin(a) * R * 0.94, math.sin(a * 2) * 0.12 * S)
    N = 54
    loop = sweep([at(TAU * i / N) for i in range(N)], 0.036 * S, Q.amber, n=8, closed=True, ref=(0, 0, 1))

    def band(c):
        a = math.atan2(c.z, c.x) % TAU            # Blender z = game y
        return int(a / (TAU / n)) % 2
    recolor(loop, lambda c, nrm: Q.acid if band(c) else None)
    glow_faces(loop, lambda c: GLOWK[Q.acid] if band(c) else 0.0)
    parts = [loop]
    for i in range(0, n, 3):
        parts.append(ball(0.06 * S, Q.hot, at=at(TAU * i / n), seg=8, hi=0.2))
    return parts
