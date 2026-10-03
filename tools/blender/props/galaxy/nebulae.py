"""Galaxy-stage props, the big end: the black holes, the star clusters, the
nebulae and the galaxy-scale structures (dust lane, stellar stream, arm
fragment, hypernova shell).

Frame reminder (see kit.py): Blender Z is up, X is the prop's width, and the
game's FRONT (+Z) is Blender -Y. v1 (src/world/props/galaxy.js and
spacekit.js) is authored in the game frame in display units (one unit is a
light year), so these are too: every part is made about its own origin IN THE
GAME FRAME, moved with v1's own opts (x, y, z, rx, ry, rz — three's 'YXZ'
Euler) by `place()`, which also turns it into Blender's frame. Each prop keeps
v1's layout and v1's numbers (HX, HY, k, tilt), and `fit()` then nudges the
whole thing per axis onto the catalogue box (a few percent; the box already
includes v1's ghost decoration, so the decoration is modelled too).

The look: a premium toy planetarium. Discs are one thin slab whose top is
split into crisp temperature bands, warped a little more at the rim; rings are
clean tori; jets are one tapered beam with bright beads for knots; star
crowds are many small faceted beads round a soft graded core; clouds are a
few big soft lumpy bodies (noise-displaced spheres) in two or three tones,
lit side up and dark side down, laid along v1's heading.

Glow: galaxy.js registers no glow colours, so only what spacekit's helpers
self-light glows here, at their strengths: `ring()` 0.5, `jet()` beam 0.6
and knots 0.78 (lobes 0.6), `swarm()` stars 0.5, `pillars()` lit tips 0.6.
Discs, wisps, shells, arms, cores and plain decoration spheres do not.
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

# v1's stage tin (G in galaxy.js) — not in the shared palette.
G = type('G', (), dict(
    event=0x08070d, voidDeep=0x0b0916, void=0x141026, dust=0x241a3d, dustWarm=0x3a2340,
    dustLit=0x4d3564, ash=0x2e2838,
    white=0xfdfcff, blueWhite=0xd9e6ff, blue=0x7fb0ff, blueDeep=0x3a5ad8, cyan=0x6fe4ee,
    teal=0x1f8f9c, gold=0xffdd94, amber=0xffab52, ember=0xff6b3a, emberDk=0xb43a24, rust=0x8a3520,
    magenta=0xe45ad0, rose=0xff8fb4, violet=0x8a4ade, indigo=0x3f2d8c, plum=0x5c2c6d, jade=0x63e0a6,
    halo=0xa8d4ff, glare=0xfff4cf, xray=0xbfe4ff,
    disc=0x0d0b18, discDust=0x1a1330, armFloor=0x241a3c, nurseryFloor=0x3b2246,
    coreFloor=0x3a1a24, wallDust=0x171227,
))


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
    """Flip a closed or open surface so its faces look away from c."""
    me = o.data
    cv = Vector(c)
    s = sum((p.center - cv).dot(p.normal) * p.area for p in me.polygons)
    if s < 0:
        me.flip_normals()
    me.update()
    return o


# ---------------------------------------------------------------- fitting

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


def fit(parts, pid, v, uniform=False, rigid=()):
    """Scale the whole prop, per axis, about its footprint centre and floor so
    its bounding box is the catalogue box. The layout is v1's, so the stretch
    is a few percent (the build log line MODEL-RAW is printed so it stays
    checked). Parts in `rigid` (stars, beads) are only MOVED with the
    stretch, never squashed, so a round star stays round."""
    lo, hi = bounds(parts)
    want = target(pid, v)
    cx, cy = (lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2
    k = [want[i] / max(1e-9, hi[i] - lo[i]) for i in range(3)]
    if uniform:
        u = math.sqrt(min(k) * max(k))
        k = [u, u, u]
    print(f'MODEL-RAW {pid}__{v} stretch x{k[0]:.3f} y(game z){k[1]:.3f} z(game y){k[2]:.3f}')
    rig = set(id(o) for o in rigid)
    for o in parts:
        if id(o) in rig or o.get('rigid'):
            n = max(1, len(o.data.vertices))
            c = sum((vt.co for vt in o.data.vertices), Vector()) / n
            d = Vector(((c.x - cx) * k[0], (c.y - cy) * k[1], (c.z - lo[2]) * k[2])) - c
            for vt in o.data.vertices:
                vt.co = vt.co + d
        else:
            for vt in o.data.vertices:
                p = vt.co
                vt.co = Vector(((p.x - cx) * k[0], (p.y - cy) * k[1], (p.z - lo[2]) * k[2]))
        o.data.update()
    return parts


# ---------------------------------------------------------------- mesh makers

def rings_mesh(rings, closed=True, cap0=False, cap1=False, name='rings'):
    """Faces between consecutive rings of points (each ring a list of
    Vectors; a ring of one point is a pole). Returns the object, unpainted."""
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


def egg(rx, ry, rz, col, at=(0, 0, 0), seg=24, rings=None, vfn=None, warp=None,
        rot=(0.0, 0.0, 0.0)):
    """An ellipsoid in the game frame, poles on game Y.
    vfn(unit Vector) -> colour paints per vertex (gradients, mottling);
    warp(unit Vector) -> radius factor makes it lumpy."""
    n = rings or max(6, seg // 2)
    rr = [[Vector((0, ry * (warp(Vector((0, 1, 0))) if warp else 1), 0))]]
    for i in range(1, n):
        ph = PI * i / n
        ring = []
        for j in range(seg):
            a = TAU * j / seg
            u = Vector((math.sin(ph) * math.cos(a), math.cos(ph), math.sin(ph) * math.sin(a)))
            k = warp(u) if warp else 1.0
            ring.append(Vector((u.x * rx * k, u.y * ry * k, u.z * rz * k)))
        rr.append(ring)
    rr.append([Vector((0, -ry * (warp(Vector((0, -1, 0))) if warp else 1), 0))])
    o = rings_mesh(rr, name='egg')
    outward(o)
    if vfn:
        paint(o, col, lambda p: L(vfn(Vector((p.x / rx, p.y / ry, p.z / rz)).normalized())))
    else:
        paint(o, col)
    place(o, at, *rot)
    return _smooth(o, 80)


def bead(r, col, at=(0, 0, 0), sub=1, scale=(1, 1, 1)):
    """A small faceted star: an icosphere (sub 0 = 20 tris, 1 = 80)."""
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=r)
    for vt in bm.verts:
        vt.co = Vector((vt.co.x * scale[0], vt.co.y * scale[1], vt.co.z * scale[2]))
    o = _from_bmesh(bm, 'bead')
    o['rigid'] = True          # fit() moves it, never squashes it
    paint(o, col)
    place(o, at)
    return _smooth(o, 80 if sub else 30)


def stiff(o):
    """Flag a part rigid for fit(): round stars stay round."""
    o['rigid'] = True
    return o


def hoop(R, t, col, at=(0, 0, 0), rx=0.0, ry=0.0, rz=0.0, seg=32, rseg=8):
    """three's torus: in the XY plane until rotated (rx = PI/2 lays it flat)."""
    o = torus(R, t, color=col, seg=seg, rseg=rseg)
    place(o, at, rx, ry, rz)
    return o


def ring(R, tube_k, col, at, tilt=0.0, ry=0.0, seg=40, rseg=8, k=0.5):
    """spacekit's `ring()`: a thin self-lit torus; tilt 0 is FLAT (it adds the
    PI/2 that turns three's upright torus into the plane of a disc)."""
    o = hoop(R, R * tube_k, col, at, rx=tilt + PI / 2, ry=ry, seg=seg, rseg=rseg)
    glow(o, k)
    return o


def disc(r0, r1, cols, at=(0, 0, 0), tilt=0.0, warp=0.0, rise=0.0, t=None, seg=40, sub=1,
         under=0.3, ry=0.0, groove=0.0, doppler=0.0, lip=None, lip_k=1.9):
    """spacekit's `gradedDisc` as ONE slab: a thin closed annulus from r0 to
    r1 in the game XZ plane, its top split into len(cols) crisp bands (inner
    to outer, `sub` rows each), the underside a shade darker. `warp` tilts
    the outer edge further than the inner (radians at the rim) and `rise`
    lifts it — v1's ring-by-ring warp made continuous. `groove` (fraction of
    a band) cuts a narrow dark line between bands, like a toy's ring seams;
    `doppler` beams the approaching side (game -x) brighter and dims the far
    one; `lip` (a colour) rolls the inner edge into a thicker rounded bead."""
    nb = len(cols)
    th = t if t is not None else r1 * 0.012
    w = (r1 - r0) / nb
    radii, kind = [r0], []
    for i in range(nb):
        b0 = r0 + w * i
        g = groove if i else 0.0
        if g:
            radii.append(b0 + w * g)
            kind.append((i, True))
        for q in range(1, sub + 1):
            radii.append(b0 + w * g + w * (1 - g) * q / sub)
            kind.append((i, False))
    nt = len(kind)
    top = [(r, th) for r in radii]
    bot = [(r1, -th), (r0 + (r1 - r0) * 0.5, -th), (r0, -th)]
    prof = top + bot
    bm = bmesh.new()
    vr = []
    for (r, y) in prof:
        f = (r - r0) / max(1e-9, r1 - r0)
        rot = Matrix.Rotation(warp * f, 3, 'X')
        row = []
        for j in range(seg):
            a = TAU * j / seg
            row.append(bm.verts.new(rot @ Vector((r * math.cos(a), y + rise * f, r * math.sin(a)))))
        vr.append(row)
    vr.append(vr[0])
    for a, b in zip(vr, vr[1:]):
        for j in range(seg):
            j2 = (j + 1) % seg
            bm.faces.new((a[j], a[j2], b[j2], b[j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = _from_bmesh(bm, 'disc')
    lc = [L(c) for c in cols]
    # faces were made row by row, `seg` per row, top rows first
    me = o.data
    attr = me.color_attributes.get('base') or me.color_attributes.new('base', 'FLOAT_COLOR', 'CORNER')
    for poly in me.polygons:
        row, j = divmod(poly.index, seg)
        if row < nt:
            band, gr = kind[row]
            col = lc[band]
            if gr:
                col = dk(mixc(lc[band], lc[band - 1], 0.5), 0.5)
        elif row == nt:
            col = dk(lc[-1], 0.1)
        elif row < nt + 3:
            col = dk(lc[min(nb - 1, (nt + 2 - row) * nb // 2)], under)
        else:
            col = lc[0]
        if doppler:
            cx = math.cos(TAU * (j + 0.5) / seg)
            col = mixc(col, (1.0, 1.0, 1.0), doppler * -cx) if cx < 0 else                 mixc(col, (0.0, 0.0, 0.0), doppler * 0.7 * cx)
        for li in poly.loop_indices:
            attr.data[li].color = (*col, 1.0)
    place(o, at, tilt, ry, 0.0)
    out = [_smooth(o, 30)]
    if lip is not None:
        out.append(hoop(r0 + th * 0.4, th * lip_k, lip, at, rx=tilt + PI / 2, ry=ry, seg=seg, rseg=6))
    return out

def sweep(points, radii, col, n=10, caps=True, smooth=60, fn=None, up=(0, 0, 1), squash=1.0):
    """A round tube through game-frame `points`, radius per point (or one).
    fn(i / (m - 1)) -> colour grades it along its length. Unplaced: the
    points are already where they go, so call place(o) after."""
    pts = [Vector(p) for p in points]
    m = len(pts)
    rr = radii if isinstance(radii, (list, tuple)) else [radii] * m
    tans = []
    for i in range(m):
        a, b = pts[max(0, i - 1)], pts[min(m - 1, i + 1)]
        tans.append((b - a).normalized())
    t0 = tans[0]
    rv = Vector(up)
    if abs(t0.dot(rv)) > 0.95:
        rv = Vector((1, 0, 0))
    u = (rv - t0 * rv.dot(t0)).normalized()
    rings = []
    for i, p in enumerate(pts):
        t = tans[i]
        if i:
            u = (u - t * u.dot(t)).normalized()
        w = t.cross(u).normalized()
        rings.append([p + (u * math.cos(TAU * j / n) * squash + w * math.sin(TAU * j / n)) * rr[i]
                      for j in range(n)])
    o = rings_mesh(rings, cap0=caps, cap1=caps, name='sweep')
    me = o.data
    s = sum((poly.center - pts[min(m - 1, poly.index // n)]).dot(poly.normal) for poly in me.polygons
            if poly.index < (m - 1) * n)
    if s < 0:
        me.flip_normals()
    paint(o, col)
    if fn:
        cols = [L(fn(i / max(1, m - 1))) for i in range(m)]
        attr = me.color_attributes['base']
        for poly in me.polygons:
            for li in poly.loop_indices:
                vi = me.loops[li].vertex_index
                attr.data[li].color = (*cols[min(m - 1, vi // n)], 1.0)
    return _smooth(o, smooth)


def jet(y0, length, col, up=1, r=0.025, knots=3, hot=None, lobe=0.0, at=(0, 0), sides=8, k=0.6, ksub=0):
    """spacekit's `jet`: a pencil beam `length * r` thick, narrowing to 0.6
    of that at the far end, `knots` bright beads along it, and an optional
    terminal lobe. Beam glows k, knots 1.3k, lobe k — v1's strengths."""
    hot = hot if hot is not None else col
    rad = length * r
    pts, radii = [], []
    m = 4
    for i in range(m + 1):
        t = i / m
        pts.append((at[0], y0 + up * length * t, at[1]))
        radii.append(rad * (1.0 - 0.4 * t) * (0.55 if i in (0, m) else 1.0))
    # a soft rounded nose at each end
    pts.insert(1, (at[0], y0 + up * rad * 0.35, at[1]))
    radii.insert(1, rad * 0.95)
    pts.insert(-1, (at[0], y0 + up * (length - rad * 0.35), at[1]))
    radii.insert(-1, rad * 0.62)
    beam = sweep(pts, radii, col, n=sides, fn=lambda t: mix(col, hot, 0.25 * t))
    place(beam)
    glow(beam, k)
    out = [beam]
    for i in range(1, knots + 1):
        t = i / (knots + 1)
        kn = bead(rad * (1.9 - t * 0.6), hot, (at[0], y0 + up * length * t, at[1]), sub=ksub)
        glow(kn, k * 1.3)
        out.append(kn)
    if lobe:
        lb = egg(length * lobe, length * lobe * 0.66, length * lobe, hot,
                 (at[0], y0 + up * length * 1.02, at[1]), seg=12,
                 vfn=lambda u: mix(hot, col, 0.35 * (1 - abs(u.y))))
        glow(lb, k)
        out.append(lb)
    return out


# ================================================================= EXOTIC

@model('g_blackhole', ao=0.3)
def g_blackhole(v):
    """The one the player asked for by name: a black sphere you bump into,
    a bright photon ring hugging it, a warped accretion disc graded white-hot
    to ember, and two pencil jets out of the poles."""
    HX, HY = 123.75, 169.8
    R, TILT = HX * 0.62, 0.34
    parts = []
    hole = egg(R, HY * 0.72 * 0.62, R, G.event, (0, HY, 0), seg=28,
               vfn=lambda u: mix(G.event, G.indigo, 0.22 * max(0.0, u.y) ** 3))
    parts.append(hole)
    parts.append(ring(R * 1.05, 0.04, C.chrome, (0, HY, 0), tilt=TILT, seg=40, rseg=6))
    accent = [G.ember, G.rose, G.cyan][v]
    parts += disc(R * 1.16, HX * 1.16, [G.glare, G.gold, G.amber, accent], (0, HY, 0),
                  tilt=TILT, warp=0.12, rise=6, t=HX * 0.014, seg=40, sub=1, groove=0.14, doppler=0.2)
    parts += jet(HY + R * 0.5, HY * 0.9, G.xray, up=1, r=0.02, knots=3, hot=G.white)
    parts += jet(HY - R * 0.5, HY * 0.9, G.xray, up=-1, r=0.02, knots=3, hot=G.white)
    return fit(parts, 'g_blackhole', v)


# ================================================================= CROWDS

def noise3(rnd, k=4, f=(1.5, 3.5)):
    """A smooth lumpy field on the unit sphere: n(u) in about -1..1."""
    terms = []
    for _ in range(k):
        d = Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-1, 1))).normalized()
        terms.append((d, rnd.uniform(*f), rnd.uniform(0, TAU)))
    return lambda u: sum(math.sin(u.dot(d) * fr * PI + ph) for d, fr, ph in terms) / math.sqrt(k)


def rand_dir(rnd):
    u = rnd.uniform(-1, 1)
    a = rnd.uniform(0, TAU)
    s = math.sqrt(1 - u * u)
    return Vector((s * math.cos(a), u, s * math.sin(a)))


def fib_dirs(n, rnd, jitter=0.25):
    """n roughly even directions (a jittered Fibonacci sphere)."""
    out = []
    for i in range(n):
        t = (i + 0.5) / n
        ph = math.acos(1 - 2 * t)
        th = PI * (1 + math.sqrt(5)) * i
        d = Vector((math.sin(ph) * math.cos(th), math.cos(ph), math.sin(ph) * math.sin(th)))
        d = (d + rand_dir(rnd) * jitter * rnd.random()).normalized()
        out.append(d)
    return out


@model('g_globular', ao=0.35)
def g_globular(v):
    """A ball of old stars with a blaze in the middle: a soft gold globe
    mottled with unresolved starlight, studded all over with small bright
    stars and a thinning halo of them round it (swarm stars glow 0.5)."""
    R = 160.0
    rnd = random.Random(4100 + v)
    accent = [G.blueWhite, G.rose, G.cyan][v]
    Rc = R * 0.74
    nz = noise3(rnd, 5, (2.0, 4.0))
    core_ = egg(Rc, Rc, Rc, G.gold, (0, R, 0), seg=30,
                vfn=lambda u: mix(mix(G.amber, G.gold, 0.55 + 0.45 * u.y), G.glare,
                                  0.55 * smooth01(0.1, 0.8, nz(u))))
    parts = [core_]
    cols = [G.gold, G.white, G.amber, accent, G.white, G.glare]
    # studs: stars sitting in the surface, crowding the globe
    for d in fib_dirs(54, rnd, 0.35):
        r = R * rnd.uniform(0.034, 0.06)
        p = d * (Rc + r * rnd.uniform(0.1, 0.6))
        b = bead(r, cols[rnd.randrange(len(cols))], (p.x, R + p.y, p.z), sub=0)
        glow(b, 0.5)
        parts.append(b)
    # the halo: fewer, smaller, further out
    for d in fib_dirs(24, rnd, 0.6):
        r = R * rnd.uniform(0.025, 0.04)
        p = d * rnd.uniform(Rc * 1.1, R * 0.84 - r)
        b = bead(r, cols[rnd.randrange(len(cols))], (p.x, R + p.y, p.z), sub=0)
        glow(b, 0.5)
        parts.append(b)
    return fit(parts, 'g_globular', v)


def lumpy(RX, RY, RZ, tones, rnd, at=(0, 0, 0), head=0.0, seg=24, lobes=7, amp=(0.12, 0.28),
          width=(0.18, 0.4), up=0.35, flat=0.25, accent=None, acc_k=0.0, tilt=0.0, roll=0.0):
    """A soft lumpy cloud body: an ellipsoid (long axis local X, laid along
    `head` like v1's wisps) swollen by a few broad bumps biased upward, so it
    reads as billows rather than a ball. Painted in two or three tones:
    tones = (dark underside, body, lit crowns), graded by height and by how
    far each billow stands out; `accent` mottles a third colour in."""
    bumps = []
    for _ in range(lobes):
        d = rand_dir(rnd)
        d.y = abs(d.y) * (1 - up) + up * 0.6 if rnd.random() < 0.75 else d.y
        bumps.append((d.normalized(), rnd.uniform(*amp), rnd.uniform(*width)))
    nz = noise3(rnd, 4, (1.5, 3.0))

    def bump(u):
        return sum(a * math.exp(-(1 - u.dot(d)) / w) for d, a, w in bumps)

    def warp(u):
        k = 1.0 + bump(u) + 0.04 * nz(u)
        if u.y < 0:
            k *= 1 - flat * (-u.y) ** 2   # a softly flattened underside
        return k

    dark, body, lit = (L(t) for t in tones)
    accl = L(accent) if accent is not None else None

    def vfn(u):
        h = 0.5 + 0.5 * u.y + 0.9 * bump(u)
        c = mix(dark, body, smooth01(0.05, 0.6, h))
        c = mix(c, lit, smooth01(0.6, 1.15, h))
        if accl is not None and acc_k:
            c = mix(c, accl, acc_k * smooth01(0.15, 0.75, nz(u)))
        return c
    return egg(RX, RY, RZ, body, at, seg=seg, warp=warp, vfn=vfn, rot=(tilt, -head, roll))


def shade_cloud(parts, tones, rnd, accent=None, acc_k=0.0, light=(-0.4, 0.3, 0.85), lift=0.0):
    """Repaint a group of cloud bodies as ONE cloud: per vertex, by height
    across the whole group and by how much the surface faces the light
    (Blender frame, z up) — dark underside, body tone, lit crowns — with an
    optional third colour mottled through by a smooth noise field."""
    dark, body, lit = (L(t) for t in tones)
    accl = L(accent) if accent is not None else None
    zs = [vt.co.z for o in parts for vt in o.data.vertices]
    z0, z1 = min(zs), max(zs)
    lv = Vector(light).normalized()
    nz = noise3(rnd, 4, (1.2, 2.6))
    span = max(1e-6, z1 - z0)
    for o in parts:
        me = o.data
        attr = me.color_attributes.get('base') or me.color_attributes.new('base', 'FLOAT_COLOR', 'CORNER')
        cache = {}
        for vt in me.vertices:
            h = (vt.co.z - z0) / span
            f = 0.5 + 0.5 * vt.normal.dot(lv)
            t = 0.45 * h + 0.75 * f - 0.2 + lift
            c = mixc(dark, body, smooth01(0.05, 0.55, t))
            c = mixc(c, lit, smooth01(0.62, 1.0, t))
            if accl is not None and acc_k:
                q = nz(Vector((vt.co.x, vt.co.y, vt.co.z)) / span * 1.6)
                c = mixc(c, accl, acc_k * smooth01(0.1, 0.7, q))
            cache[vt.index] = c
        for poly in me.polygons:
            for li in poly.loop_indices:
                attr.data[li].color = (*cache[me.loops[li].vertex_index], 1.0)
    return parts


def billows(RX, RY, RZ, rnd, at=(0, 0, 0), head=0.0, n=5, seg=22, bseg=14, size=(0.5, 0.66),
            spread=0.66, amp=(0.08, 0.2), side=2, body=(0.82, 0.4, 0.72), crown=0, rmax=None):
    """A cumulus-style cloud bank filling about the half-extents RX, RY, RZ
    round `at` (long axis along `head`): a broad flattened lumpy base and
    `n` round billows heaped along its crest, biggest in the middle, plus
    `side` lower ones bulging out of its flanks — the cotton-ball silhouette
    of a toy cloud. Unpainted (see shade_cloud)."""
    hc, hs = math.cos(head), math.sin(head)

    def P(x, y, z):
        return (at[0] + hc * x - hs * z, at[1] + y, at[2] + hs * x + hc * z)
    by = -RY * (1 - body[1])          # base centre: its underside at -RY
    out = [lumpy(RX * body[0], RY * body[1], RZ * body[2], (0, 0, 0), rnd, P(0, by, 0), head,
                 seg=seg, lobes=6, amp=amp, flat=0.35)]
    top = by + RY * body[1] * 0.55
    cap = rmax if rmax is not None else 1e18
    for i in range(n):
        t = (i + 0.5) / n * 2 - 1
        r = min(cap, RY * rnd.uniform(*size) * (1 - 0.38 * abs(t)))
        x = t * RX * spread + rnd.uniform(-0.06, 0.06) * RX
        r = min(r, (RX - abs(x)) / 1.12)      # the end billows stay inside the bank's length
        y = top + r * 0.55 * (1 - 0.3 * abs(t)) + rnd.uniform(-0.05, 0.05) * RY
        z = rnd.uniform(-0.3, 0.3) * RZ
        out.append(lumpy(r * rnd.uniform(1.0, 1.2), r * rnd.uniform(0.85, 1.0), r * rnd.uniform(0.85, 1.05),
                         (0, 0, 0), rnd, P(x, y, z), head + rnd.uniform(-0.6, 0.6), seg=bseg, lobes=4,
                         amp=(0.05, 0.14), flat=0.15))
    # a second tier heaped on the middle, for tall banks
    for i in range(crown):
        t = ((i + 0.5) / crown * 2 - 1) * 0.6
        r = min(cap, RY * rnd.uniform(*size) * 0.72)
        x = t * RX * spread + rnd.uniform(-0.05, 0.05) * RX
        y = top + RY * 0.62 + r * 0.25
        z = rnd.uniform(-0.15, 0.15) * RZ
        out.append(lumpy(r * rnd.uniform(1.0, 1.15), r * rnd.uniform(0.9, 1.0), r,
                         (0, 0, 0), rnd, P(x, y, z), head + rnd.uniform(-0.6, 0.6), seg=bseg, lobes=4,
                         amp=(0.05, 0.14), flat=0.15))
    for i in range(side):
        sgn = 1 if i % 2 == 0 else -1
        r = min(cap * 0.8, RY * rnd.uniform(0.38, 0.48))
        x = rnd.uniform(-0.4, 0.4) * RX
        out.append(lumpy(r * 1.15, r * 0.85, r, (0, 0, 0), rnd, P(x, by + r * 0.2, sgn * RZ * (body[2] - 0.12)),
                         head + rnd.uniform(-0.4, 0.4), seg=bseg, lobes=3, amp=(0.05, 0.12), flat=0.3))
    return out


@model('g_opencluster', ao=0.35)
def g_opencluster(v):
    """Loose and young: a couple of dozen bright blue-white stars you can see
    between, still sitting in the shredded gas they condensed from. The gas
    is a low soft drift along v1's heading; the stars are round beads (glow
    0.5, v1's swarm) spread to the catalogue box, a big white one at the
    heart."""
    HX, HY = 168.75, 231.6
    W, D, H = target('g_opencluster', v)
    rnd = random.Random(4200 + v)
    head = 0.7 + v
    hc, hs = math.cos(head), math.sin(head)
    tones = (G.dust, G.indigo, G.violet)
    parts = []
    # the gas: a low soft drift along the heading, kept inside the box
    gx = min(HX * 0.62, W * 0.42)
    gas = billows(gx, HY * 0.3, HX * 0.34, rnd, (0, HY * 0.82, 0), head, n=4, seg=20, bseg=12,
                  size=(0.5, 0.62), spread=0.66, side=1)
    shade_cloud(gas, tones, rnd, accent=G.plum, acc_k=0.45)
    parts += gas
    parts.append(stiff(egg(HX * 0.13, HX * 0.13, HX * 0.13, G.white, (0, HY, 0), seg=16,
                           vfn=lambda u: mix(G.blueWhite, G.white, 0.5 + 0.5 * u.y))))
    cols = [G.blueWhite, G.white, G.blue]
    # stars spread to the box (v1's swarm reaches it), never touching
    ax, ay, az = W * 0.5, H * 0.5, D * 0.5
    pts = [Vector((ax, 0, 0)) * 0.97, Vector((-ax, 0, 0)) * 0.97, Vector((0, ay, 0)) * 0.97,
           Vector((0, -ay, 0)) * 0.97, Vector((0, 0, az)) * 0.97, Vector((0, 0, -az)) * 0.97]
    for p in pts:
        p.rotate(Matrix.Rotation(rnd.uniform(-0.25, 0.25), 3, 'Y'))
    tries = 0
    while len(pts) < 22 and tries < 4000:
        tries += 1
        u = rand_dir(rnd)
        t = rnd.random() ** 0.8
        p = Vector((u.x * ax * t, u.y * ay * t, u.z * az * t))
        if p.length < HX * 0.25 or any((p - q).length < HX * 0.22 for q in pts):
            continue
        pts.append(p)
    for i, p in enumerate(pts):
        r = HX * (rnd.uniform(0.07, 0.095) if i % 3 == 0 else rnd.uniform(0.045, 0.065))
        p = p * (1 - r / max(1.0, p.length)) if p.length > r else p
        b = bead(r, cols[i % 3], (p.x, HY + p.y, p.z), sub=1)
        glow(b, 0.5)
        parts.append(b)
    return fit(parts, 'g_opencluster', v)


# ================================================================= CLOUDS

@model('g_darknebula', ao=0.45)
def g_darknebula(v):
    """A hole in the starfield: an inky cloud bank drifting along v1's
    heading, its crowns caught in a little dust-light so it separates from
    the dark, and a scatter of blue-white stars round its rim (no glow, as
    v1) that make it read as a hole rather than a hill."""
    HX, HY = 224.4, 329.0
    W, D, H = target('g_darknebula', v)
    rnd = random.Random(4300 + v)
    head = 0.5 + v * 1.1
    tint = [G.dust, G.ash, G.plum][v]
    # the box's long horizontal axis is v1's heading; lay the bank along it
    L_ = math.hypot(W * math.cos(head), D * math.sin(head)) * 0.5
    parts = billows(L_ * 0.95, H * 0.6, min(W, D) * 0.36, rnd, (0, H * 0.6, 0), head, n=4, seg=22, bseg=14,
                    crown=1, rmax=min(W, D) * 0.34)
    shade_cloud(parts, (G.voidDeep, G.void, G.dustLit), rnd, accent=tint, acc_k=0.7)
    for i in range(7):
        a = TAU * i / 7 + rnd.uniform(-0.3, 0.3)
        p = (math.cos(a) * W * 0.46, H * (0.5 + rnd.uniform(-0.3, 0.42)), math.sin(a) * D * 0.46)
        parts.append(bead(HX * 0.05, G.blueWhite, p, sub=1))
    return fit(parts, 'g_darknebula', v)


def axis_len(W, D, head):
    """Half-length of the box's footprint along v1's heading."""
    return math.hypot(W * math.cos(head), D * math.sin(head)) * 0.5


@model('g_emission', ao=0.4)
def g_emission(v):
    """Gas lit from inside by the stars just born in it: a glowing-pink cloud
    bank (deep tint below, magenta body, rose crowns), the young cluster
    breaking out of its crest, and a dark dust lane slung across its face."""
    HX, HY = 259.6, 380.6
    W, D, H = target('g_emission', v)
    rnd = random.Random(4400 + v)
    head = v * 1.4
    tint = [G.violet, G.ember, G.plum][v]
    Lh = axis_len(W, D, head)
    gas = billows(Lh * 0.95, H * 0.57, min(W, D) * 0.43, rnd, (0, H * 0.57, 0), head, n=5, seg=20, bseg=14,
                  crown=1, side=1, rmax=min(W, D) * 0.36)
    shade_cloud(gas, (dk(tint, 0.15), mix(G.magenta, tint, 0.35), mix(G.rose, tint, 0.12)), rnd,
                accent=G.magenta, acc_k=0.4)
    parts = gas
    # the dark lane slung across the front face, following the heading
    hc, hs = math.cos(head), math.sin(head)
    rz = min(W, D) * 0.4
    lane_pts, lane_r = [], []
    for i in range(9):
        t = i / 8 * 2 - 1
        off = rz * (0.62 * math.sqrt(max(0.0, 1 - t * t)) + 0.2)
        x = t * Lh * 0.8
        lane_pts.append((hc * x - hs * off, H * (0.36 + 0.07 * math.sin(t * 2.0 + v)), hs * x + hc * off))
        lane_r.append(H * (0.075 * (1 - 0.6 * t * t) + 0.015))
    lane = sweep(lane_pts, lane_r, G.dust, n=10,
                 fn=lambda t: mix(G.voidDeep, G.dustWarm, 0.6 * math.sin(t * PI)))
    place(lane)
    parts.append(lane)
    # the young stars, breaking out of the crest
    for i in range(6):
        a = TAU * i / 6 + rnd.uniform(-0.3, 0.3)
        d = Lh * rnd.uniform(0.1, 0.45)
        p = (math.cos(a) * d * 0.8, H * rnd.uniform(0.62, 0.84), math.sin(a) * d * 0.5)
        parts.append(bead(HX * rnd.uniform(0.05, 0.065), G.white, p, sub=1))
    return fit(parts, 'g_emission', v)


@model('g_reflection', ao=0.4)
def g_reflection(v):
    """Plain dust next to a bright star, throwing its light back: a blue
    cloud bank whose face toward the star is lit pale and whose far side
    falls away to deep blue, and the star itself standing OUTSIDE the cloud
    on one flank, white-hot on top and fading to its halo blue at the limb
    (none of it glows, as v1)."""
    HX, HY = 299.2, 438.6
    rnd = random.Random(4500 + v)
    head = 0.4 + v * 1.2
    tint = [G.cyan, G.indigo, G.blueDeep][v]
    a = 0.6 + v * 2.1
    sx, sz = math.cos(a) * HX * 1.45, math.sin(a) * HX * 1.45
    sy = HY * 1.3
    # the light comes from the star (game -> Blender: (x, -z, y))
    lv = (math.cos(a) * 0.8, -math.sin(a) * 0.8, 0.6)
    gas = billows(HX * 0.95, HY * 0.72, HX * 0.42, rnd, (0, HY, 0), head, n=5, seg=22, bseg=14, crown=1)
    shade_cloud(gas, (tint, G.blue, G.halo), rnd, accent=tint, acc_k=0.35, light=lv, lift=0.0)
    parts = gas
    # the star: a white-hot ball whose upper face blazes white and whose
    # limb falls off to the pale halo blue (v1's star inside its halo)
    Rs = HX * 0.27
    parts.append(stiff(egg(Rs, Rs, Rs, G.halo, (sx, sy, sz), seg=24,
                           vfn=lambda u: mix(G.halo, G.white, smooth01(0.1, 0.75, u.y)))))
    return fit(parts, 'g_reflection', v)


@model('g_molecular', ao=0.45)
def g_molecular(v):
    """The biggest cold thing in the stage: long, dark and filamentary.
    v1's reading kept — tall drifting curtains of dust laid along its
    heading — but each curtain is a soft, thick, lumpy body rather than a
    blade, dark below with its crown catching a little dust-light, and
    amber stars igniting in the folds between them (no glow, as v1)."""
    HX, HY = 347.6, 509.6
    W, D, H = target('g_molecular', v)
    rnd = random.Random(4600 + v)
    head = 1.1 + v * 0.9
    tint = [G.ash, G.plum, G.dustWarm][v]
    hc, hs = math.cos(head), math.sin(head)
    RX, RY, RZ = HX, H * 0.5, HX
    n = 8
    gas = []
    for i in range(n):
        along = (i + 0.5) / n * 2 - 1
        off = (rnd.random() - 0.5) * 0.85
        a = head + (rnd.random() - 0.5) * 0.6
        Lw = RX * (0.34 + rnd.random() * 0.26)
        ht = RY * (0.66 + rnd.random() * 0.3) * (1 - 0.22 * abs(along))
        x = hc * along * (RX - Lw) - hs * off * RX * 0.72
        z = hs * along * (RZ - Lw) + hc * off * RZ * 0.72
        y = ht + max(0.0, H - 2.1 * ht) * rnd.random() * 0.7
        gas.append(lumpy(Lw, ht, RZ * (0.2 + rnd.random() * 0.1), (0, 0, 0), rnd, (x, y, z), a,
                         seg=14, lobes=5, amp=(0.08, 0.18), width=(0.1, 0.25), up=0.4, flat=0.3,
                         roll=(rnd.random() - 0.5) * 0.4))
    shade_cloud(gas, (G.voidDeep, G.dust, G.dustLit), rnd, accent=tint, acc_k=0.65)
    parts = gas
    for i in range(5):
        t = (i + 0.5) / 5 * 2 - 1
        x, z = t * RX * 0.55, (0.42 if i % 2 else -0.42) * RZ
        parts.append(bead(HX * 0.085 * rnd.uniform(0.85, 1.1), G.amber,
                          (hc * x - hs * z, H * (0.3 + 0.45 * ((i * 0.37) % 1)), hs * x + hc * z), sub=1))
    return fit(parts, 'g_molecular', v)


# ================================================================= PILLARS

def pillar(base, h, w, a, lean, col, top, rnd, sides=10, n=7, taper=0.35):
    """One of spacekit's `pillars`: a tall, tapered, slightly bent column of
    gas leaning outward along azimuth `a` (game frame), lumpy along its
    length, graded from `col` at the foot to `top` at the crown. Returns
    (part, tip position)."""
    dx, dz = math.cos(a), math.sin(a)
    pts, rr = [], []
    ph = rnd.uniform(0, TAU)
    for i in range(n + 1):
        t = i / n
        off = lean * h * t ** 1.4
        wob = w * 0.25 * math.sin(t * 5.0 + ph) * t
        pts.append((base[0] + dx * off - dz * wob, base[1] + h * t, base[2] + dz * off + dx * wob))
        rr.append(w * (1 - (1 - taper) * t) * (1 + 0.1 * math.sin(t * 9 + ph)))
    # a rounded crown, not a sawn-off chimney
    d = (Vector(pts[-1]) - Vector(pts[-2])).normalized()
    pts.append(tuple(Vector(pts[-1]) + d * rr[-1] * 0.55))
    rr.append(rr[-1] * 0.62)
    pts.append(tuple(Vector(pts[-1]) + d * rr[-2] * 0.3))
    rr.append(rr[-2] * 0.22)
    o = sweep(pts, rr, col, n=sides, fn=lambda t: mix(col, top, smooth01(0.45, 1.0, t)))
    place(o)
    return o, Vector(pts[-1])


@model('g_nursery', ao=0.4)
def g_nursery(v):
    """The shape everybody knows from a photograph: a stand of tall dusty
    pillars, tapered and leaning away from the young cluster boiling them,
    each crowned with a lit, self-lit tip (v1's pillars, glow 0.6), rising
    out of a low lumpy cloud — the tallest, central one is v1's solid stack.
    The cluster doing the eating hangs above in white and gold."""
    HX, HY, FLOOR = 198.0, 271.7, 150.0
    W, D, H = target('g_nursery', v)
    rnd = random.Random(4700 + v)
    head = 0.6 + v
    tint = [G.plum, G.indigo, G.rose][v]
    # the cloud they rise from
    cloud = billows(W * 0.5, H * 0.19, D * 0.5, rnd, (0, H * 0.19, 0), rnd.uniform(-0.15, 0.15), n=4, seg=20,
                    bseg=12, size=(0.6, 0.8), side=2, spread=0.7, body=(0.92, 0.45, 0.85))
    shade_cloud(cloud, (G.dust, G.dustWarm, mix(G.dustLit, G.rose, 0.3)), rnd, accent=tint, acc_k=0.6)
    parts = cloud
    # the central stack (v1's solid taper), the tallest
    main, mtip = pillar((0, H * 0.12, 0), H * 0.8, 46, 0.6 + v, 0.06, G.dustWarm, mix(G.dustLit, G.rose, 0.3),
                        rnd, sides=10, n=7, taper=0.42)
    parts.append(main)
    # the stand round it, each with its lit tip
    R, Hp = min(W, D) * 0.48, H * 0.7
    for i in range(5):
        a = TAU * i / 5 + rnd.uniform(0, 0.5) + v
        d = R * rnd.uniform(0.4, 0.72)
        h = Hp * rnd.uniform(0.55, 1.0)
        w = R * rnd.uniform(0.11, 0.16)
        o, tip = pillar((math.cos(a) * d * W / (2 * R), H * 0.08, math.sin(a) * d * D / (2 * R)), h, w, a, 0.12,
                        G.dustLit, mix(G.dustLit, G.rose, 0.5), rnd, sides=8, n=6)
        parts.append(o)
        t = bead(w * 0.55, G.glare, tuple(tip), sub=1)
        glow(t, 0.6)
        parts.append(t)
    # the cluster above the stand (no glow, as v1) and a wisp of rose gas
    for i in range(6):
        a = TAU * i / 6 + v
        r = HY * (0.055 + (i % 3) * 0.016)
        parts.append(bead(r, G.white if i % 2 else G.gold,
                          (math.cos(a) * W * 0.3, H * (0.72 + (i % 3) * 0.08), math.sin(a) * D * 0.3), sub=1))
    # v1's wisp of rose gas, low on one flank of the stand
    puff = [lumpy(HX * 0.26, HX * 0.13, HX * 0.2, (0, 0, 0), rnd, (-W * 0.3, H * 0.3, D * 0.22), head,
                  seg=14, lobes=4, amp=(0.08, 0.16))]
    shade_cloud(puff, (G.magenta, G.rose, G.glare), rnd)
    parts += puff
    return fit(parts, 'g_nursery', v)


@model('g_hii', ao=0.4)
def g_hii(v):
    """An HII region: a glowing magenta cloud bank round a hot white heart
    and its blue-white cluster, with a stand of tall dark pillars rising
    through it, leaning away from the cluster, their tips lit rose and
    self-lit (v1's pillars, glow 0.6). As in v1, the pillars' feet sink
    well below the cloud's floor."""
    HX, HY = 457.6, 670.8
    W, D, H = target('g_hii', v)
    rnd = random.Random(4800 + v)
    tint = [G.ember, G.violet, G.amber][v]
    head = float(v)
    floor = H * 0.373          # v1's cloud floor: the pillars start 37% below it
    up = H - floor
    gas = billows(W * 0.47, up * 0.34, D * 0.52, rnd, (0, floor + up * 0.34, 0), head * 0.15, n=5, seg=20,
                  bseg=12, side=1, crown=0, spread=0.68, body=(0.9, 0.42, 0.8))
    shade_cloud(gas, (dk(tint, 0.2), mix(G.magenta, tint, 0.4), mix(G.rose, tint, 0.15)), rnd,
                accent=G.magenta, acc_k=0.4)
    parts = gas
    heart = (0, floor + up * 0.5, -D * 0.2)
    parts.append(stiff(egg(HX * 0.15, HX * 0.15, HX * 0.15, G.white, heart, seg=18,
                           vfn=lambda u: mix(G.blueWhite, G.white, 0.5 + 0.5 * u.y))))
    for i in range(5):
        a = TAU * i / 5 + 0.4
        parts.append(bead(HX * 0.06, G.blueWhite,
                          (math.cos(a) * HX * 0.3, heart[1] + up * 0.18 * math.sin(a), heart[2] - HX * 0.1), sub=1))
    # the stand: clustered behind the heart, leaning back away from it, the
    # tallest in the middle — they rise through the gas and stand above it
    base_a = PI * 0.5 + rnd.uniform(-0.3, 0.3)       # game +z: behind the heart (heart is at -z)
    for i in range(6):
        f = (i + 0.5) / 6 * 2 - 1
        a = base_a + f * 1.1 + rnd.uniform(-0.1, 0.1)
        d = rnd.uniform(0.25, 0.75)
        h = H * (0.97 - 0.22 * abs(f) - rnd.uniform(0, 0.08))
        w = min(W, D) * (0.15 - 0.04 * abs(f)) * rnd.uniform(0.9, 1.1)
        o, tip = pillar((math.cos(a) * d * W * 0.36, 0, math.sin(a) * d * D * 0.36), h, w, a, 0.14, G.dust,
                        mix(G.dustLit, G.rose, 0.45), rnd, sides=8, n=6, taper=0.28)
        parts.append(o)
        t = bead(w * 0.5, G.rose, tuple(tip), sub=1)
        glow(t, 0.6)
        parts.append(t)
    return fit(parts, 'g_hii', v)


# ================================================================= STRUCTURE

def arm_points(r0, r1, a0, sweep_, n, y=0.0):
    """v1's `spiralArm` curve: angle a0 -> a0 + sweep, distance r0 -> r1 on
    t^0.78 (game frame, about the origin). Returns [(point, t)]."""
    out = []
    for i in range(n):
        t = i / (n - 1)
        a = a0 + sweep_ * t
        d = r0 + (r1 - r0) * t ** 0.78
        out.append((Vector((math.cos(a) * d, y, math.sin(a) * d)), t))
    return out


@model('g_dustlane', ao=0.4)
def g_dustlane(v):
    """The definitive wide-and-flat object: a long, thin ribbon of dark dust
    lying across the plane — a few overlapping drawn-out lumpy strands, dark
    below and catching a little light along their crests — slung across a
    compact dark core (v1's solid), with the far-side starlight it blocks
    showing as amber and gold stars along it (no glow, as v1)."""
    HX, HY, K = 418.6, 536.9, 0.43
    W, D, H = target('g_dustlane', v)
    rnd = random.Random(4900 + v)
    tint = [G.ash, G.wallDust, G.dustWarm][v]
    head = 0.2
    hc, hs = math.cos(head), math.sin(head)
    # the core: a compact dark cloud, as tall as the box
    core_ = lumpy(HX * K * 0.85, H * 0.46, D * 0.42, (0, 0, 0), rnd, (0, H * 0.5, 0), 0.0, seg=22, lobes=6,
                  amp=(0.06, 0.14), flat=0.1)
    lane = [core_]
    # the lane: strands along the heading, overlapping, at the core's waist
    Lh = W * 0.5 / hc
    for i, (f, dy, dz, k) in enumerate(((0.0, 0.0, 0.0, 1.0), (-0.42, 0.04, 0.12, 0.62), (0.45, -0.03, -0.11, 0.6),
                                        (-0.75, -0.02, -0.04, 0.33), (0.78, 0.03, 0.05, 0.3))):
        x = f * Lh
        z = dz * D
        r = Lh * k * (0.98 if i == 0 else 0.62)
        lane.append(lumpy(r, H * 0.11 * (0.75 + 0.25 * k), D * 0.2 * (0.6 + 0.4 * k), (0, 0, 0), rnd,
                          (hc * x - hs * z, H * (0.5 + dy), hs * x + hc * z), head + rnd.uniform(-0.08, 0.08),
                          seg=22 if i == 0 else 16, lobes=7, amp=(0.08, 0.2), width=(0.06, 0.16), up=0.2,
                          flat=0.2, roll=rnd.uniform(-0.05, 0.05)))
    shade_cloud(lane, (G.voidDeep, G.void, mix(G.dustLit, tint, 0.5)), rnd, accent=tint, acc_k=0.55)
    parts = lane
    # the starlight behind it, strung along the lane
    for i in range(9):
        t = i / 8
        r = HX * (0.05 + (i % 3) * 0.02)
        x = (t - 0.5) * W * 0.9
        p = (x, H * (0.5 + 0.2 * math.sin(t * 5 + v)), math.cos(t * 3.5) * D * 0.3)
        parts.append(bead(r, G.amber if i % 3 else G.gold, p, sub=1))
    return fit(parts, 'g_dustlane', v)


@model('g_stream', ao=0.35)
def g_stream(v):
    """A dwarf galaxy pulled out into a thread: what is left of it is a soft
    dusty knot (v1's solid core) with a bright heart, and two curving arms
    of stars stream away round it — a leading arm and a trailing one — each a
    faint gold ribbon strung with bright star beads (no glow, as v1)."""
    HX, HY, K = 542.8, 696.2, 0.52
    rnd = random.Random(5000 + v)
    hot = [G.blueWhite, G.rose, G.glare][v]
    # what is left of the dwarf: a soft heaped knot of dust and old stars
    core_ = [lumpy(HX * K, HY * K, HX * K, (0, 0, 0), rnd, (0, HY, 0), 0.4, seg=28, lobes=9, amp=(0.07, 0.16),
                   width=(0.08, 0.2), up=0.2, flat=0.15)]
    shade_cloud(core_, (G.voidDeep, G.dust, mix(G.dustLit, G.violet, 0.25)), rnd, accent=G.plum, acc_k=0.5)
    parts = core_
    parts.append(stiff(egg(HX * 0.12, HX * 0.09, HX * 0.12, G.white, (0, HY, 0), seg=12)))
    for (r0, r1, a0, sw, cols, y, w, n) in (
            (HX * 0.24, HX * 1.16, 0.4, 2.5, [G.gold, G.white, hot, G.amber], HY, 0.045, 16),
            (HX * 0.2, HX * 0.82, 0.4 + PI, 1.9, [G.amber, hot, G.gold], HY * 1.06, 0.04, 11)):
        pts = arm_points(r0, r1, a0, sw, 15, y)
        rib = sweep([tuple(p) for p, t in pts], [r1 * w * (1 - t * 0.55) * 0.42 for p, t in pts], G.gold, n=8,
                    up=(0, 1, 0), squash=0.7, fn=lambda t: mix(G.gold, G.amber, t))
        place(rib)
        parts.append(rib)
        for i, (p, t) in enumerate(arm_points(r0, r1, a0, sw, n, y)):
            sz = r1 * w * (1 - t * 0.55)
            parts.append(stiff(egg(sz * 1.75, sz * 0.95, sz * 0.8, cols[i % len(cols)], tuple(p), seg=8, rings=3,
                                   rot=(0.0, -(a0 + sw * t) + PI / 2, 0.0))))
    return fit(parts, 'g_stream', v)


@model('g_spiralarm', ao=0.4)
def g_spiralarm(v):
    """A piece of a spiral: one heavy curved dust lane and a fainter one
    inside it, both clumpy and graded along their length in v1's colours,
    round the arm's dense middle (v1's solid core, a soft dusty cloud), with
    young blue-white clusters and their pink HII puffs strung along the
    leading edge (no glow, as v1)."""
    HX, HY, K = 625.6, 802.4, 0.56
    rnd = random.Random(5100 + v)
    tint = [G.plum, G.blueDeep, G.violet][v]
    tones = (G.voidDeep, mix(G.dust, tint, 0.35), mix(tint, G.dustLit, 0.3))
    # the dense middle (v1's solid core): a heaped cloud lying along the arm
    core_ = [lumpy(HX * K, HY * K, HX * K * 0.92, (0, 0, 0), rnd, (0, HY, 0), -(0.2 + 0.5) + PI / 2, seg=28,
                   lobes=9, amp=(0.07, 0.16), width=(0.08, 0.2), up=0.2, flat=0.15)]
    shade_cloud(core_, tones, rnd, accent=G.indigo, acc_k=0.5)
    parts = core_
    for (r0, r1, a0, sw, cols, y, w, hh, m) in (
            (HX * 0.3, HX * 1.1, 0.2, 1.75, [G.dust, G.dustLit, tint, G.indigo], HY * 0.9, 0.2, 0.5, 26),
            (HX * 0.26, HX * 0.86, 0.2 + 2.6, 1.5, [G.dust, G.indigo, tint], HY * 0.86, 0.13, 0.45, 18)):
        pts = arm_points(r0, r1, a0, sw, m, y)
        ph = rnd.uniform(0, TAU)
        # clumps along the lane: v1's string of dust knots, made one body
        radii = [r1 * w * (1 - t * 0.55) * (0.78 + 0.3 * abs(math.sin(t * PI * m / 3.2 + ph))) for p, t in pts]
        radii[0] *= 0.5
        radii[-1] *= 0.4
        arm = sweep([tuple(p) for p, t in pts], radii, cols[0], n=10, up=(0, 1, 0), squash=hh / 0.72)
        place(arm)
        # the crest catches the light of the young stars strung along it
        shade_cloud([arm], (G.voidDeep, mix(cols[1], cols[2], 0.5), mix(mix(cols[2], G.dustLit, 0.3), G.blueWhite, 0.3)),
                    rnd, accent=cols[-1], acc_k=0.5, lift=0.08)
        parts.append(arm)
    # young clusters on the leading edge, and the HII they light
    for i in range(6):
        t = i / 5
        a = 0.34 + 1.6 * t
        dd = HX * (0.34 + 0.72 * t ** 0.78)
        top = HY * 0.9 + HX * 1.1 * 0.2 * (1 - 0.55 * t) * 0.32
        p = (math.cos(a) * dd, top + HX * 0.03, math.sin(a) * dd)
        parts.append(bead(HX * (0.08 - t * 0.025), G.blueWhite if i % 2 else G.white, p, sub=1))
        if i % 2:
            puff = lumpy(HX * 0.1, HX * 0.065, HX * 0.1, (0, 0, 0), rnd,
                         (math.cos(a) * dd * 1.06, top, math.sin(a) * dd * 1.06), a,
                         seg=12, lobes=3, amp=(0.08, 0.15))
            shade_cloud([puff], (G.magenta, G.rose, G.glare), rnd)
            parts.append(puff)
    return fit(parts, 'g_spiralarm', v)


def barrel(R, th, open_, col_out, col_in, at, n=6, seg=20, flare=0.0, rim=None, rnd=None, flip=False, hot=None,
           open_top=None):
    """spacekit's `shell`: a band of a sphere of radius R with both polar
    caps open (`open_` as in v1: the cut starts PI/2 * open_ from each pole),
    `th` thick, closed in section so it is visible inside and out — the
    outer face graded and mottled in `col_out`, the inner face `col_in` (the
    lit cavity), the lips `rim`. `open_top` cuts the top mouth wider than
    the bottom one and `flare` belles it out, so two set mouth to mouth make
    an hourglass; `flip` turns it upside down."""
    a0 = PI * 0.5 * open_
    a1 = PI * 0.5 * (open_ if open_top is None else open_top)
    nz = noise3(rnd or random.Random(1), 4, (1.5, 3.0))

    def rad(a, rr):
        return math.sin(a) * rr * (1 + flare * max(0.0, -math.cos(a)) ** 2)
    prof = []
    for i in range(n + 1):
        a = a0 + (PI - a0 - a1) * i / n
        prof.append((rad(a, R), -math.cos(a) * R))
    for i in range(n, -1, -1):
        a = a0 + (PI - a0 - a1) * i / n
        prof.append((rad(a, R - th), -math.cos(a) * (R - th)))
    rings = []
    for (r, y) in prof:
        rings.append([Vector((r * math.cos(TAU * j / seg), y, r * math.sin(TAU * j / seg))) for j in range(seg)])
    rings.append(rings[0])
    o = rings_mesh(rings, name='barrel')
    me = o.data
    # faces were made row by row: rows 0..n-1 outer, n a lip, n+1..2n inner, 2n+1 the other lip
    co, ci = L(col_out), L(col_in)
    cr = L(rim) if rim is not None else mixc(co, ci, 0.5)
    attr = me.color_attributes.get('base') or me.color_attributes.new('base', 'FLOAT_COLOR', 'CORNER')
    hot = L(hot) if hot is not None else co
    for poly in me.polygons:
        row = poly.index // seg
        for li in poly.loop_indices:
            p = me.vertices[me.loops[li].vertex_index].co
            h = 0.5 + 0.5 * (p.y / R)            # 0 at the waist mouth, 1 at the far one
            if row < n:
                # dark at the waist, heating towards the far mouth, mottled
                c = mixc(dk(co, 0.3), hot, smooth01(0.35, 1.0, h) * 0.85)
                c = mixc(c, dk(co, 0.4), 0.45 * smooth01(0.25, 0.85, nz(p.normalized())))
            elif row == n or row == 2 * n + 1:
                c = cr
            else:
                c = mixc(ci, lt(ci, 0.35), h)
            attr.data[li].color = (*c, 1.0)
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    if flip:
        o.data.transform(Matrix.Scale(-1, 4, Vector((0, 1, 0))))
        o.data.flip_normals()
    place(o, at)
    return _smooth(o, 40)


@model('g_hypernova', ao=0.3)
def g_hypernova(v):
    """A jet-driven blast, so BIPOLAR: two open shell lobes pinched at the
    waist — rust-red outside, the hot tint inside where the light is — a
    bright self-lit equatorial ring (0.5) on a graded collar disc, the jets
    that did it still coming out of both poles (beam 0.6, knots and lobes as
    v1), ejecta whipping off the waist, and the small dark-red core (v1's
    solid) sitting in the cavity."""
    HX, HY = 711.0, 975.7
    tint = [G.rose, G.magenta][v]
    LOBE, OFF = HX * 0.62, HX * 0.55
    rnd = random.Random(5200 + v)
    parts = []
    parts.append(egg(HX * 0.46, HY * 0.8 * 0.46, HX * 0.46, G.rust, (0, HY, 0), seg=14,
                     vfn=lambda u: mix(dk(G.rust, 0.35), mix(G.rust, G.ember, 0.4), 0.5 + 0.5 * u.y)))
    for s_ in (1, -1):
        # tight at the waist, belled wide at the far mouth: an hourglass
        parts.append(barrel(LOBE, LOBE * 0.05, 0.3, G.emberDk, tint, (0, HY + s_ * OFF, 0), n=5, seg=18,
                            flare=0.3, rim=G.glare, rnd=rnd, flip=s_ < 0, hot=mix(G.ember, tint, 0.3),
                            open_top=0.56))
    parts.append(ring(HX * 1.0, 0.03, G.glare, (0, HY, 0), tilt=0.16, seg=30, rseg=5))
    parts += disc(HX * 0.88, HX * 1.14, [tint, G.ember, G.emberDk], (0, HY, 0), tilt=0.16, warp=0.06,
                  t=HX * 0.012, seg=28, sub=1)
    parts += jet(HY + HX * 0.95, HY * 0.7, G.xray, up=1, r=0.022, knots=3, hot=G.white, lobe=0.07, sides=8)
    parts += jet(HY - HX * 0.95, HY * 0.7, G.xray, up=-1, r=0.022, knots=3, hot=G.white, lobe=0.07, sides=8)
    # ejecta whipping off the shock front, along the waist
    for i in range(6):
        a = TAU * i / 6 + v
        e = (rnd.random() - 0.5) * 1.2
        parts.append(egg(HX * 0.18, HX * 0.045, HX * 0.045, G.glare,
                         (math.cos(a) * HX * 0.95, HY + e * HY * 0.42, math.sin(a) * HX * 0.95), seg=6, rings=3,
                         rot=(0.0, -a, 0.0)))
    return fit(parts, 'g_hypernova', v)


@model('g_smbh', ao=0.3)
def g_smbh(v):
    """The same object as g_blackhole four thousand times over, and it reads
    as more: the disc is a wide plate graded over five temperature bands,
    two self-lit photon rings hug the hole, and the jets end in lobes where
    they ram the intergalactic medium."""
    HX, HY, K = 801.0, 1099.2, 0.72
    R, TILT = HX * K, 0.26
    parts = [egg(R, HY * 0.72 * K, R, G.event, (0, HY, 0), seg=24,
                 vfn=lambda u: mix(G.event, G.indigo, 0.22 * max(0.0, u.y) ** 3))]
    parts.append(ring(R * 1.04, 0.026, C.chrome, (0, HY, 0), tilt=TILT, seg=32, rseg=5))
    parts.append(ring(R * 1.1, 0.014, G.glare, (0, HY, 0), tilt=TILT, seg=32, rseg=3))
    parts += disc(R * 1.2, HX * 1.42, [G.glare, G.white, G.gold, G.amber, [G.ember, G.rose][v]], (0, HY, 0),
                  tilt=TILT, warp=0.1, rise=30, t=HX * 0.014, seg=32, sub=1, groove=0.12, doppler=0.2)
    parts += jet(HY + R * 0.55, HY * 1.15, G.xray, up=1, r=0.014, knots=4, hot=G.white, lobe=0.085, sides=8)
    parts += jet(HY - R * 0.55, HY * 1.15, G.xray, up=-1, r=0.014, knots=4, hot=G.white, lobe=0.085, sides=8)
    return fit(parts, 'g_smbh', v)
