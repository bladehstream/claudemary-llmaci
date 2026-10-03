"""Quantum-stage props, the upper half of the ladder: muon, mesons, the heavy
bosons, a Feynman vertex ... up to a whole nucleus.

Frame reminder (see kit.py): Blender Z is up, X is the prop's width, and the
game's FRONT (+Z) is Blender -Y. v1 (src/world/props/quantum.js) is authored
in the game frame, and so is everything in this file: every part is built with
game coordinates (Y up, +Z front, three.js rotations) and the finished list is
turned into the Blender frame in one go by `done()`. That keeps each model a
line-for-line reading of its v1 build.

The look: premium glowing toys. Glossy chunky balls (a painted highlight up
and to the front-left, a darker belly), thin crisp hoops that stand just clear
of the ball they circle, clean sticks of one thickness per prop, and exactly
v1's self-lit palette (`GLOW` below mirrors v1's `glowColor` table).
"""
import math
import bmesh
from mathutils import Vector, Matrix
import kit
from kit import _from_bmesh, _smooth
from kit import (box, cyl, sphere, torus, tube, deform, recolor, lin, mixc, paint, glow, C, SETS)

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

# The stage's own palette (Q in quantum.js), which palette.js does not carry.
Q = type('Q', (), dict(
    cyan=0x5ceeff, cyanHi=0xcafbff, magenta=0xff4fd6, magHi=0xffa6ec, violet=0x9a5cff,
    violetD=0x53309c, acid=0xd8ff45, amber=0xffb43c, hot=0xfff4d6, rose=0xff6d90, teal=0x3ff0c4,
    lime=0x8dff86, ice=0xc4e6ff, foam=0x7b62e0, deep=0x2a1550,
    cR=0xff4d5e, cG=0x62ff8a, cB=0x5aa8ff,
))

# v1's glowColor table: every part painted one of these is self-lit by k.
GLOW = {
    Q.hot: 0.9, Q.cyanHi: 0.7, Q.magHi: 0.6, Q.ice: 0.4,
    Q.cyan: 0.45, Q.magenta: 0.4, Q.acid: 0.45, Q.teal: 0.35, Q.lime: 0.35,
    Q.cR: 0.35, Q.cG: 0.35, Q.cB: 0.35,
}


# ---------------------------------------------------------------- helpers

def L(col):
    return lin(col) if isinstance(col, int) else col


def dk(col, t=0.2):
    return mixc(L(col), (0, 0, 0), t)


def lt(col, t=0.4):
    return mixc(L(col), (1, 1, 1), t)


def lit(obj, col):
    """Glow exactly as v1 would for a part painted `col`."""
    k = GLOW.get(col) if isinstance(col, int) else None
    if k:
        glow(obj, k)
    return obj


def euler3(rx=0.0, ry=0.0, rz=0.0):
    """three.js Euler(rx, ry, rz, 'YXZ') as a matrix: Ry * Rx * Rz."""
    return (Matrix.Rotation(ry, 4, 'Y') @ Matrix.Rotation(rx, 4, 'X') @ Matrix.Rotation(rz, 4, 'Z'))


def xf(obj, at=(0, 0, 0), rx=0.0, ry=0.0, rz=0.0):
    """Turn a part built at the origin with three's YXZ Euler, then move it."""
    obj.data.transform(euler3(rx, ry, rz))
    obj.data.transform(Matrix.Translation(Vector(at)))
    obj.data.update()
    return obj


# the key light the gloss is painted for: up, to the right (where the game's
# sun sits on the sheet), towards the front
KEY = Vector((0.5, 0.8, 0.45)).normalized()


def gloss(base, n, hi=0.45, belly=0.18):
    """A toy-plastic shade for a surface normal n (game frame)."""
    c = L(base)
    s = max(0.0, n.dot(KEY))
    c = mixc(c, (1, 1, 1), hi * s ** 14 + 0.04 * s * s)
    if n.y < 0:
        c = mixc(c, (0, 0, 0), belly * (-n.y) ** 1.5)
    return c


def uvs(r, u, vr):
    """A UV sphere with exactly u segments and vr rings, poles up game Y:
    2u(vr-1) triangles, so a 6 x 4 bead is 36 and an 8 x 5 one 64."""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=u, v_segments=vr, radius=r)
    o = _from_bmesh(bm, 'sphere')
    o.data.transform(Matrix.Rotation(-math.pi / 2, 4, 'X'))
    o.data.update()
    return _smooth(o, 80)


def ball(r, at, col, seg=20, rings=None, hi=0.45, belly=0.18):
    """A glossy sphere centred at `at`. Glowing colours get no belly, so
    their light stays even all round, as v1's does."""
    o = uvs(r, seg, rings or max(4, seg // 2))
    if isinstance(col, int) and col in GLOW:
        belly = 0.0
    paint(o, col, lambda p: gloss(col, p.normalized() if p.length > 1e-9 else Vector((0, 1, 0)), hi, belly))
    xf(o, at)
    return lit(o, col)


def bead(r, at, col, u=8, vr=5):
    """A small glossy dot: blips, shell dots, cloud specks."""
    return ball(r, at, col, seg=u, rings=vr, hi=0.3)


def ring(R, t, col, at=(0, 0, 0), rx=0.0, ry=0.0, rz=0.0, seg=24, rseg=5):
    """A thin hoop: three's TorusGeometry (in the XY plane), turned like v1."""
    o = torus(R, t, color=col, seg=seg, rseg=rseg)
    xf(o, at, rx, ry, rz)
    return lit(o, col)


def stick(p, q, r, col, seg=10, bevel=0.0):
    """A clean rod from p to q (game frame). Both ends are usually buried in
    a ball, so by default the caps are not bevelled (36 triangles at 10)."""
    p, q = Vector(p), Vector(q)
    d = q - p
    ln = d.length
    o = cyl(r, ln, color=col, seg=seg, bevel=bevel)
    rot = Vector((0, 0, 1)).rotation_difference(d.normalized()).to_matrix().to_4x4()
    o.data.transform(rot)
    o.data.transform(Matrix.Translation(p))
    o.data.update()
    return lit(o, col)


def cone(r, h, col, at=(0, 0, 0), rx=0.0, ry=0.0, rz=0.0, seg=14):
    """three's ConeGeometry: centred, apex up +Y, then turned like v1."""
    o = cyl(r, h, at=(0, 0, -h / 2), color=col, seg=seg, r2=0.0, bevel=min(r, h) * 0.08)
    o.data.transform(Matrix.Rotation(-math.pi / 2, 4, 'X'))
    xf(o, at, rx, ry, rz)
    return lit(o, col)


def rod(r, h, col, at=(0, 0, 0), seg=12, bevel=None):
    """three's cyl: centred on `at`, axis up +Y. Keep seg >= 10: below that
    kit's bevel catches every side edge too."""
    o = cyl(r, h, at=(0, 0, -h / 2), color=col, seg=seg, bevel=r * 0.4 if bevel is None else bevel)
    o.data.transform(Matrix.Rotation(-math.pi / 2, 4, 'X'))
    xf(o, at)
    return lit(o, col)


def gbox(w, h, d, centre, col, bevel=None, seg=1):
    """A bevelled box of game size w x h x d centred at `centre`."""
    o = box((w, h, d), at=(0, 0, -d / 2), color=col, bevel=bevel, seg=seg)
    xf(o, centre)
    return lit(o, col)


def charge(S, sign, col, t=0.07):
    """v1's + / - marker floating on top of a particle, chunkier."""
    parts = [gbox(0.3 * S, t * S, t * S, (0, 0.5 * S, 0), col, bevel=t * S * 0.3)]
    if sign > 0:
        parts.append(gbox(t * S, 0.3 * S, t * S, (0, 0.5 * S, 0), col, bevel=t * S * 0.3))
    return parts


def helix_pts(R, y0, y1, turns, n, phase):
    pts = []
    for i in range(n):
        t = i / (n - 1)
        a = phase + t * turns * TAU
        pts.append((math.cos(a) * R, y0 + (y1 - y0) * t, math.sin(a) * R))
    return pts


def coil(pts, r, col, seg=8, taper=None):
    """A smooth tube through game-frame points."""
    return lit(tube(pts, r, color=col, seg=seg, taper=taper), col)


def done(parts):
    """Game frame -> Blender frame for the whole list: (x, y, z) -> (x, -z, y)."""
    m = Matrix.Rotation(math.pi / 2, 4, 'X')
    out = []
    for o in parts:
        if isinstance(o, (list, tuple)):
            out.extend(o)
        else:
            out.append(o)
    for o in out:
        o.data.transform(m)
        o.data.update()
    return out


def hoops(S, cols, rx0, kx, rz0, kz, phase_rx=0.0, phase_rz=0.0, R=0.5, t=0.022, n=None):
    """v1's crossed hoops round a lone particle."""
    out = []
    for k, col in enumerate(cols):
        out.append(ring(R * S, t * S, col, rx=rx0 + k * kx + phase_rx, rz=rz0 + k * kz + phase_rz))
    return out


# ---------------------------------------------------------------- leptons

@model('q_muon', ao=0.0)
def q_muon(v):
    # A heavy electron, and a short-lived one: the corkscrew under it is its
    # decay track. v1's ball(): a violet core, a cyanHi and a magHi hoop.
    S = 0.20787
    ph = v * 0.5
    parts = [ball(0.44 * S, (0, 0, 0), Q.violet, seg=20)]
    for k in range(2):
        parts.append(ring(0.5 * S, 0.022 * S, Q.magHi if k else Q.cyanHi,
                          rx=math.pi / 2 + k * 1.05 + ph * 0.4, rz=k * 0.8 + ph * 0.3))
    for i in range(3):
        a = i * TAU / 3 + ph
        parts.append(bead(0.055 * S, (math.cos(a) * 0.45 * S, math.sin(a * 1.7) * 0.32 * S, math.sin(a) * 0.45 * S),
                          Q.magHi))
    parts += charge(S, -1, Q.ice)
    pts = helix_pts(0.14 * S, -0.5 * S, -0.12 * S, 1.1, 12, v)
    parts.append(coil(pts, 0.03 * S, Q.teal, seg=6, taper=lambda t: 0.7 + 0.3 * t))
    parts.append(bead(0.04 * S, pts[0], Q.teal))
    return done(parts)


# ---------------------------------------------------------------- mesons

@model('q_pion', ao=0.5)
def q_pion(v):
    # The lightest meson: a quark and an antiquark on a short leash inside a
    # confinement shell drawn as two crossed hoops. A peanut, not a ball.
    S = 0.24285
    p = (-0.19 * S, -0.15 * S, 0.05 * S)
    q = (0.19 * S, 0.15 * S, -0.05 * S)
    parts = [stick(p, q, 0.05 * S, Q.hot, seg=10),
             ball(0.3 * S, p, Q.acid, seg=16),
             ball(0.3 * S, q, Q.violet, seg=16)]
    for k in range(2):
        parts.append(ring(0.5 * S, 0.024 * S, Q.cyan if k else Q.cyanHi,
                          rx=math.pi / 2 + k * 1.1 + v * 0.3, rz=k * 0.7, rseg=4))
    if v == 2:
        parts += charge(S, -1, Q.ice)
    return done(parts)


@model('q_kaon', ao=0.5)
def q_kaon(v):
    # A strange meson, and the one that oscillates into its own antiparticle:
    # hence the second, dim copy of the pair inside the same shell.
    S = 0.38960
    p = (-0.2 * S, -0.16 * S, 0.05 * S)
    q = (0.2 * S, 0.16 * S, -0.05 * S)
    parts = [stick(p, q, 0.05 * S, Q.hot, seg=10),
             ball(0.28 * S, p, Q.violet, seg=16),
             ball(0.25 * S, q, Q.acid, seg=16),
             ball(0.16 * S, (-q[0] * 0.7, -q[1] * 0.7 + 0.1 * S, 0.18 * S), Q.violetD, seg=12),
             ball(0.14 * S, (-p[0] * 0.7, -p[1] * 0.7 + 0.1 * S, -0.18 * S), Q.violetD, seg=12)]
    for k in range(3):
        parts.append(ring(0.5 * S, 0.022 * S, Q.teal if k == 1 else Q.cyanHi,
                          rx=math.pi / 2 + k * 0.9 + v * 0.3, rz=k * 0.6, rseg=4))
    return done(parts)


# ---------------------------------------------------------------- bosons

def shell_dots(R, n, dr, col, phase, u=8, vr=5):
    out = []
    for i in range(n):
        y = 1 - (2 * i + 1) / n
        rad = math.sqrt(max(0.0, 1 - y * y))
        a = i * GOLD + phase
        out.append(bead(dr, (math.cos(a) * rad * R, y * R, math.sin(a) * rad * R), col, u, vr))
    return out


@model('q_wboson', ao=0.5)
def q_wboson(v):
    # The heavy charged one. The two arms are the decay it is about to
    # become, angled up and inward; one fat hot band round the middle.
    S = 0.27070
    parts = [ball(0.45 * S, (0, 0, 0), Q.amber, seg=20),
             ring(0.5 * S, 0.04 * S, Q.hot, rx=math.pi / 2 + v * 0.2, rseg=6)]
    for s in (-1, 1):
        tip = (s * 0.28 * S, 0.44 * S, s * 0.1 * S)
        parts.append(stick((s * 0.14 * S, 0.2 * S, 0), tip, 0.035 * S, Q.acid, seg=10))
        parts.append(ball(0.075 * S, tip, Q.cyan if s > 0 else Q.magenta, seg=10, rings=6))
    parts += charge(S, 1 if v % 2 else -1, Q.hot)
    parts += shell_dots(0.48 * S, 5, 0.045 * S, Q.magHi, v)
    return done(parts)


@model('q_zboson', ao=0.5)
def q_zboson(v):
    # Heavier and neutral: two bands, four stubs, no charge marker.
    S = 0.32475
    parts = [ball(0.45 * S, (0, 0, 0), Q.rose, seg=20)]
    for k in range(2):
        parts.append(ring(0.5 * S, 0.035 * S, Q.magenta if k else Q.hot,
                          rx=math.pi / 2 + k * 1.2 + v * 0.2, rz=k * 0.6))
    for i in range(4):
        a = i * TAU / 4 + v * 0.5
        up = 0.42 if i % 2 else -0.42
        tip = (math.cos(a) * 0.24 * S, up * S, math.sin(a) * 0.24 * S)
        parts.append(stick((math.cos(a) * 0.1 * S, up * 0.4 * S, math.sin(a) * 0.1 * S), tip, 0.03 * S, Q.violet, seg=10))
        parts.append(ball(0.07 * S, tip, Q.cyanHi, seg=8, rings=6))
    return done(parts)


# ---------------------------------------------------------------- diagrams

def spline(pts, sub=4):
    """Catmull-Rom through pts: the same wiggle as v1's polyline, smooth.
    Returns the dense points and the index where each v1 segment starts."""
    P = [Vector(p) for p in pts]
    P = [P[0] * 2 - P[1]] + P + [P[-1] * 2 - P[-2]]
    out, starts = [], []
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
        starts.append(len(out))
        for j in range(sub):
            t = j / sub
            t2, t3 = t * t, t * t * t
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2
                              + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    out.append(P[-2])
    return [tuple(p) for p in out], starts


@model('q_vertex', ao=0.5)
def q_vertex(v):
    # Three arms and a junction: two fermion lines coming in with arrowheads,
    # one wavy boson line leaving upward. The fermion lines end in a small
    # bead of their own colour (v1 cut them off square); the boson line is
    # v1's six-segment squiggle drawn as one smooth acid/amber tube.
    S = 0.65899
    node = (0, -0.12 * S, 0)
    parts = [ball(0.1 * S, node, Q.hot, seg=12)]
    arms = [(-0.4, -0.36, 0.14), (0.4, -0.36, -0.14)]
    for i, a in enumerate(arms):
        tip = (a[0] * S, a[1] * S, a[2] * S)
        col, hi = (Q.cyan, Q.cyanHi) if i else (Q.magenta, Q.magHi)
        parts.append(stick(node, tip, 0.04 * S, col, seg=10))
        parts.append(bead(0.05 * S, tip, col, 8, 5))
        dx, dy, dz = tip[0] - node[0], tip[1] - node[1], tip[2] - node[2]
        ln = math.sqrt(dx * dx + dy * dy + dz * dz)
        parts.append(cone(0.09 * S, 0.2 * S, hi,
                          at=(node[0] + dx * 0.62, node[1] + dy * 0.62, node[2] + dz * 0.62),
                          rx=math.acos(dy / ln) + math.pi, ry=math.atan2(dx, dz), seg=12))
    pts = [node]
    for i in range(1, 7):
        t = i / 6
        pts.append((math.sin(t * TAU * 1.2 + v) * 0.16 * S, node[1] + t * 0.78 * S, math.cos(t * 3 + v) * 0.12 * S))
    dense, starts = spline(pts, 4)
    starts.append(len(dense) - 1)
    for k in range(6):
        seg_pts = dense[starts[k]:starts[k + 1] + 1]
        parts.append(coil(seg_pts, 0.035 * S, Q.acid if k % 2 == 0 else Q.amber, seg=6))
    parts.append(ball(0.085 * S, pts[-1], Q.acid, seg=10))
    return done(parts)


# ---------------------------------------------------------------- the Higgs

@model('q_higgs', ao=0.45)
def q_higgs(v):
    # The one that gives everything else its mass, sitting in the brim of its
    # own potential: a white-hot ball, a sprinkle of acid quanta, two stacked
    # hoops for the hat's brim, and the vacuum value standing up on top.
    S = 0.52003
    parts = [ball(0.44 * S, (0, 0, 0), Q.hot, seg=20, hi=0.2)]
    parts += shell_dots(0.48 * S, 8, 0.045 * S, Q.acid, v * 0.7)
    parts.append(ring(0.5 * S, 0.04 * S, Q.amber, at=(0, -0.24 * S, 0), rx=math.pi / 2, seg=24))
    parts.append(ring(0.34 * S, 0.03 * S, Q.rose, at=(0, -0.4 * S, 0), rx=math.pi / 2, seg=24))
    parts.append(rod(0.04 * S, 0.24 * S, Q.cyanHi, at=(0, 0.4 * S, 0), seg=12))
    parts.append(ball(0.08 * S, (0, 0.5 * S, 0), Q.cyan, seg=12))
    return done(parts)


# ---------------------------------------------------------------- compounds

@model('q_mesonpair', ao=0.5)
def q_mesonpair(v):
    # Two mesons flying apart, with the flux tube between them stretched to
    # the point where it snaps and makes two more.
    S = 0.64220
    cols = [[Q.acid, Q.violet], [Q.teal, Q.rose], [Q.cyan, Q.amber]][v]
    parts = []
    for s in range(2):
        sx = 1 if s else -1
        c = (sx * 0.22 * S, sx * 0.2 * S, -sx * 0.1 * S)
        parts.append(ball(0.26 * S, c, cols[s], seg=20))
        parts.append(ball(0.1 * S, (c[0] - sx * 0.2 * S, c[1] + 0.16 * S, c[2]), Q.hot, seg=10))
        parts.append(ring(0.28 * S, 0.022 * S, Q.cyanHi, at=c, rx=math.pi / 2, rz=sx * 0.5, rseg=5))
    pts = helix_pts(0.09 * S, -0.18 * S, 0.18 * S, 1.4, 22, v)
    parts.append(coil(pts, 0.03 * S, Q.hot, seg=6))
    for k in range(2):
        parts.append(ring(0.5 * S, 0.02 * S, Q.foam, rx=math.pi / 2 + k * 1.2, rz=k * 0.7, seg=24, rseg=4))
    return done(parts)


@model('q_entangled', ao=0.5)
def q_entangled(v):
    # Two particles and one state. The thread of beads runs diagonally
    # between them (never level through the middle), each bead the same size.
    S = 0.78009
    p = (-0.3 * S, -0.34 * S, -0.12 * S)
    q = (0.3 * S, 0.34 * S, 0.12 * S)
    parts = []
    n = 9
    for i in range(n + 1):
        t = i / n
        a = t * TAU * 1.6 + v
        parts.append(bead(0.035 * S, (p[0] + (q[0] - p[0]) * t + math.cos(a) * 0.06 * S,
                                      p[1] + (q[1] - p[1]) * t,
                                      p[2] + (q[2] - p[2]) * t + math.sin(a) * 0.06 * S),
                          Q.cyanHi if i % 2 else Q.magHi, 8, 5))
    cols = [[Q.cyan, Q.magenta], [Q.teal, Q.rose]][v % 2]
    for s in range(2):
        c = q if s else p
        parts.append(ball(0.2 * S, c, cols[s], seg=18))
        parts.append(ring(0.26 * S, 0.022 * S, Q.magHi if s else Q.cyanHi, at=c,
                          rx=math.pi / 2 + s * 0.9, rz=s * 0.5, seg=24, rseg=5))
    return done(parts)


@model('q_cloud', ao=0.4)
def q_cloud(v):
    # Where a particle is, honestly answered: denser in the middle, and the
    # dots shrink as they go out so the edge fades rather than stopping.
    # 26 dots is most of the 2,500 cap, so they are cheap beads.
    S = 1.09919
    parts = []
    n = 26
    for i in range(n):
        t = (i + 0.5) / n
        rad = t ** 0.62 * 0.48 * S
        y = 1 - (2 * i + 1) / n
        ry = math.sqrt(max(0.0, 1 - y * y))
        a = i * GOLD + v
        col = Q.cyan if i % 3 == 0 else (Q.violet if i % 3 == 1 else Q.foam)
        r = (0.09 - t * 0.05) * S
        u, vr = (10, 5) if r > 0.065 * S else (8, 4)
        parts.append(bead(r, (math.cos(a) * ry * rad, y * rad * 1.05, math.sin(a) * ry * rad), col, u, vr))
    parts.append(ball(0.1 * S, (0, 0, 0), Q.hot, seg=14))
    parts.append(ring(0.34 * S, 0.02 * S, Q.cyanHi, rx=math.pi / 2 + v * 0.4, rz=0.4, seg=28, rseg=4))
    return done(parts)


def lathe_y(profile, col, seg=20):
    """A glossy lathe about game Y: profile [(radius, y), ...] bottom to top."""
    o = kit.lathe(profile, color=col, seg=seg, close_top=True, close_bottom=True)
    o.data.transform(Matrix.Rotation(-math.pi / 2, 4, 'X'))
    o.data.update()
    paint(o, col, lambda p: gloss(col, Vector((p.x, 0.35 if p.y > 0 else -0.3, p.z)).normalized(), 0.3, 0.12))
    return o


def spin_top(dx, dz, dy, S, body, trim, rim):
    """v1's spinning top: an upturned cone, a ball crown, a rim hoop and a
    stem. The cone is lathed, with a rounded tip and a soft shoulder."""
    prof = [(0.0, -0.16), (0.03, -0.15), (0.07, -0.1), (0.13, 0.0), (0.18, 0.13), (0.2, 0.22),
            (0.19, 0.265), (0.15, 0.28), (0.0, 0.28)]
    o = lathe_y([(r * S, z * S) for r, z in prof], body, seg=14)
    xf(o, (dx, dy, dz))
    return [lit(o, body),
            ball(0.17 * S, (dx, dy + 0.32 * S, dz), trim, seg=14),
            ring(0.26 * S, 0.026 * S, rim, at=(dx, dy + 0.3 * S, dz), rx=math.pi / 2, seg=20, rseg=4),
            rod(0.03 * S, 0.28 * S, rim, at=(dx, dy + 0.5 * S, dz), seg=10, bevel=0.0),
            bead(0.03 * S, (dx, dy + 0.64 * S, dz), rim, 10, 5)]


@model('q_superpos', ao=0.5)
def q_superpos(v):
    # The same object twice, offset, one of them dimmed almost into the
    # background: "both, until you look". Two toy spinning tops, with a
    # bridge of beads between their stems for the interference.
    S = 1.09089
    parts = []
    parts += spin_top(-0.16 * S, -0.12 * S, -0.2 * S, S, Q.violetD, Q.foam, Q.violetD)
    parts += spin_top(0.16 * S, 0.12 * S, -0.06 * S, S, Q.violet, Q.cyan, Q.cyanHi)
    for i in range(5):
        t = i / 4
        parts.append(bead(0.045 * S, ((-0.16 + t * 0.32) * S, (0.56 + math.sin(t * math.pi) * 0.14) * S,
                                      (-0.12 + t * 0.24) * S), Q.magHi, 8, 5))
    if v:
        parts.append(ring(0.42 * S, 0.02 * S, Q.foam, at=(0, -0.34 * S, 0), rx=math.pi / 2, seg=24, rseg=4))
    return done(parts)


# ---------------------------------------------------------------- matter

def arc(a, b, R, r, col, n=6, c=(0, 0, 0)):
    """A glowing tube along the sphere of radius R (about c) from a to b."""
    c = Vector(c)
    A, B = (Vector(a) - c).normalized(), (Vector(b) - c).normalized()
    om = math.acos(max(-1.0, min(1.0, A.dot(B))))
    pts = []
    for i in range(n + 1):
        t = i / n
        if om < 1e-4:
            d = A
        else:
            d = (A * math.sin((1 - t) * om) + B * math.sin(t * om)) / math.sin(om)
        pts.append(tuple(c + d.normalized() * R))
    return coil(pts, r, col, seg=6)


def triplet(S, cols, phase, R=0.47):
    """Three colour-charged quarks riding the surface of a nucleon, and the
    flux between them. v1 strung the flux straight through the inside of the
    ball, where nobody could see it; here it runs over the surface as three
    glowing arcs, so the nucleon reads as three quarks bound together."""
    pts = []
    for i in range(3):
        a = i * TAU / 3 + phase
        d = Vector((math.cos(a) * 0.46, math.sin(a * 2) * 0.3, math.sin(a) * 0.46)).normalized()
        pts.append(d * R * S)
    parts = []
    for i in range(3):
        parts.append(arc(pts[i], pts[(i + 1) % 3], (R - 0.005) * S, 0.022 * S, Q.hot))
    for i in range(3):
        parts.append(bead(0.065 * S, tuple(pts[i]), cols[i], 10, 5))
    return parts


@model('q_proton', ao=0.45)
def q_proton(v):
    S = 1.12220
    parts = [ball(0.46 * S, (0, 0, 0), Q.rose, seg=18)]
    parts += triplet(S, [Q.cR, Q.cG, Q.cB], v * 0.9)
    for k in range(2):
        parts.append(ring(0.5 * S, 0.024 * S, Q.magHi if k else Q.hot,
                          rx=math.pi / 2 + k * 1.15 + v * 0.3, rz=k * 0.7, rseg=4))
    parts += charge(S, 1, Q.hot)
    return done(parts)


@model('q_neutron', ao=0.45)
def q_neutron(v):
    # No charge to mark, so: the beta decay it is quietly heading for, an
    # acid curl springing off the top.
    S = 1.37200
    parts = [ball(0.47 * S, (0, 0, 0), Q.ice, seg=18)]
    parts += triplet(S, [Q.cB, Q.cG, Q.cB], v * 1.1 + 0.5, R=0.48)
    parts.append(ring(0.505 * S, 0.024 * S, Q.cyanHi, rx=math.pi / 2 + v * 0.3, rseg=4))
    pts = helix_pts(0.12 * S, 0.36 * S, 0.5 * S, 0.9, 10, v)
    parts.append(coil(pts, 0.026 * S, Q.acid, seg=6, taper=lambda t: 1.0 - 0.25 * t))
    parts.append(bead(0.04 * S, pts[-1], Q.acid, 8, 5))
    return done(parts)


@model('q_nucleonpair', ao=0.5)
def q_nucleonpair(v):
    # A deuteron: one proton, one neutron, held together by the pion they
    # keep throwing at each other. Each nucleon wears its three quarks.
    S = 1.58300
    parts = []
    for s in range(2):
        sx = 1 if s else -1
        c = Vector((sx * 0.17 * S, sx * 0.14 * S, -sx * 0.06 * S))
        parts.append(ball(0.31 * S, tuple(c), Q.ice if s else Q.rose, seg=18))
        for i in range(3):
            a = i * TAU / 3 + v + s
            d = Vector((math.cos(a) * 0.3, math.sin(a * 2) * 0.2, math.sin(a) * 0.3)).normalized()
            parts.append(bead(0.06 * S, tuple(c + d * 0.31 * S), [Q.cR, Q.cG, Q.cB][(i + 1) % 3 if s else i], 8, 5))
    parts.append(ball(0.1 * S, (0, 0.02 * S, 0.2 * S), Q.acid, seg=12))
    for k in range(2):
        parts.append(ring(0.5 * S, 0.026 * S, Q.hot if k else Q.foam,
                          rx=math.pi / 2 + k * 1.1 + v * 0.2, rz=k * 0.6))
    return done(parts)


@model('q_alpha', ao=0.55)
def q_alpha(v):
    # Two protons, two neutrons, in the tetrahedron they actually sit in.
    # v1's hot bonds ran inside the overlapping balls and never showed, so
    # they are left out; each nucleon's charge bead sits on its outer face.
    S = 1.79567
    k, rr = 0.13 * S, 0.3 * S
    verts = [(1, 1, 1), (1, -1, -1), (-1, 1, -1), (-1, -1, 1)]
    parts = []
    for i in range(4):
        p = Vector(verts[(i + v) % 4])
        proton = i < 2
        parts.append(ball(rr, tuple(p * k), Q.rose if proton else Q.ice, seg=20))
        parts.append(bead(0.07 * S, tuple(p * k + p.normalized() * rr * 0.95), Q.cR if proton else Q.cB, 8, 5))
    for m in range(2):
        parts.append(ring(0.5 * S, 0.024 * S, Q.cyanHi if m else Q.magHi,
                          rx=math.pi / 2 + m * 1.2 + v * 0.2, rz=m * 0.7))
    parts += charge(S, 1, Q.hot)
    return done(parts)


@model('q_nucleus', ao=0.55)
def q_nucleus(v):
    # A whole nucleus, the biggest thing down here: eleven nucleons in a drop
    # with a closed shell drawn round them. The middle one is never seen, so
    # it is the cheap one; the cap is shared out over the visible ten.
    S = 2.19955
    n = 11
    parts = []
    for i in range(n):
        y = 1 - (2 * i + 1) / n
        rad = math.sqrt(max(0.0, 1 - y * y))
        a = i * GOLD + v * 0.8
        R = 0 if i == 0 else 0.28 * S
        at = (math.cos(a) * rad * R, y * R, math.sin(a) * rad * R)
        col = Q.rose if i % 2 else Q.ice
        parts.append(ball(0.19 * S, at, col, seg=8, rings=5) if i == 0 else ball(0.19 * S, at, col, seg=12, rings=6))
    parts += shell_dots(0.46 * S, 7, 0.045 * S, Q.cR, v, 6, 4)
    for m in range(3):
        parts.append(ring(0.5 * S, 0.022 * S, Q.magHi if m == 1 else Q.cyanHi,
                          rx=math.pi / 2 + m * 0.85 + v * 0.2, rz=m * 0.6, rseg=4))
    for i in range(3):
        a = i * TAU / 3 + v
        parts.append(bead(0.06 * S, (math.cos(a) * 0.46 * S, 0.28 * S, math.sin(a) * 0.46 * S), C.lightgrey, 8, 5))
    return done(parts)
