"""Solar-stage props, the big end of the ladder: the Trojan swarm and the
dwarf planet, the fields and plasma (magnetotail, sunspots, bow shock,
coronal loop, flare), the planets, the ring system, the prominence, the
heliopause and the Sun itself.

Frame reminder (see kit.py): Blender Z is up, X is the prop's width, and the
game's FRONT (+Z) is Blender -Y. v1 (src/world/props/solar.js and
spacekit.js) is authored in the game frame and every build is a multiple of
one base size `Z`, so these are too: each part is made about its own origin
IN THE GAME FRAME, moved with v1's own opts (x, y, z, rx, ry, rz — three's
'YXZ' Euler), and only then turned into Blender's frame by `place()`.

The look: a premium toy orrery. Planets are one clean globe each whose bands
are recoloured rows of the globe itself (rings placed exactly on the band
edges, so a band costs nothing and its edge is crisp), with craters, ice caps,
islands and storms as shallow raised patches that hug the surface. Plasma is
one smooth tapered tube graded hot-footed to a cooler crown, never a string of
beads; walls of gas are one bowed sheet. v1's ghost decoration (discs, arcs,
sheets) is modelled too: it is half of what these things look like.

Glow: v1's solar props register no glow colours, and of the spacekit helpers
they call only `ring()` self-lights (0.5) — the shepherds' gap ring in
`sol_ring`. That one part glows here; nothing else does.
"""
import math
import random
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
PI = math.pi
GOLD = 2.399963

# v1's stage tin (S in solar.js) — not in the shared palette.
S = type('S', (), dict(
    dust=0x6f645a, dustPale=0x968878, rock=0x8b7d6d, rockLt=0xa89684, rockDk=0x584d44,
    basalt=0x463f46, regolith=0x796a5c, crater=0x4d443c, rust=0xa9673c, rustDk=0x74422a,
    ice=0xd9edf8, icePale=0xf1f8ff, iceDeep=0x9cc9e6, iceBlue=0x77aedd, iceShadow=0x4a76a4,
    frostDk=0x2f4f76,
    methane=0x5cc7d8, methaneDk=0x2d86a6, ammonia=0xbfe6ea, ocean=0x21538f, oceanDeep=0x143460,
    cloud=0xeaf1fa, cloudWarm=0xf7e5c4,
    band=0xe9ba79, bandDk=0xb87f47, bandPale=0xf8ddb0, storm=0xd8563c, stormDk=0x9c3524,
    photo=0xffc94f, photoHot=0xfff3b4, limb=0xff9a2c, plasma=0xff7828, plasmaPl=0xffc169,
    corona=0xffe3a6, umbra=0x82401a, penumbra=0xc76d1e,
    field=0x7286dd, fieldDim=0x3a4795, wind=0x8ed6ff, windDim=0x4783c2, aurora=0x6ce0b4,
    lava=0xff6b2b, sulfur=0xe6c249, ash=0x39333c,
))

# v1's base sizes (SZ in solar.js): every dimension of a build is a multiple
SZ = dict(trojan=0.15994, dwarf=0.17248, magnetotail=0.23997, sunspot=0.27920, bowshock=0.40847,
          rocky=0.28429, ocean=0.29074, loop=0.44739, icegiant=0.31878, flare=0.37390,
          gasgiant=0.44493, ring=0.68210, prominence=0.55151, heliopause=0.61394, sun=0.57525)


# ---------------------------------------------------------------- colour

def L(col):
    return lin(col) if isinstance(col, int) else col


def lt(col, t=0.35):
    return mixc(L(col), (1.0, 1.0, 1.0), t)


def dk(col, t=0.25):
    return mixc(L(col), (0.0, 0.0, 0.0), t)


def mix(a, b, t):
    return mixc(L(a), L(b), max(0.0, min(1.0, t)))


# ---------------------------------------------------------------- frames

# game (x, y, z) -> Blender (x, -z, y): a proper rotation, so normals survive
BASIS = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))
# kit's Z-axis primitives (lathe) -> three's Y-axis ones: (x, y, z) -> (x, z, -y)
Z2Y = Matrix.Rotation(-PI / 2, 4, 'X')


def gp(p):
    """A v1 (game-frame) point in the Blender frame."""
    return Vector((p[0], -p[2], p[1]))


def rot3(rx=0.0, ry=0.0, rz=0.0):
    """three's Euler 'YXZ' = Ry . Rx . Rz, as a 4x4."""
    return Matrix.Rotation(ry, 4, 'Y') @ Matrix.Rotation(rx, 4, 'X') @ Matrix.Rotation(rz, 4, 'Z')


def place(o, at=(0, 0, 0), rx=0.0, ry=0.0, rz=0.0):
    """o's mesh is in the game frame about its origin; apply v1's opts and
    convert to Blender."""
    o.data.transform(BASIS @ Matrix.Translation(Vector(at)) @ rot3(rx, ry, rz))
    o.data.update()
    return o


def surf(a, e):
    """v1's `surf`: the unit vector at azimuth a, polar angle e (game frame)."""
    se = math.sin(e)
    return Vector((se * math.cos(a), math.cos(e), se * math.sin(a)))


def aim(d):
    """A 4x4 turning game +Y onto the unit vector d."""
    q = Vector((0, 1, 0)).rotation_difference(Vector(d).normalized())
    return q.to_matrix().to_4x4()


def outward(o, c=(0, 0, 0)):
    """Flip an open shell so its faces look away from c (mesh coordinates)."""
    me = o.data
    cv = Vector(c)
    s = sum((p.center - cv).dot(p.normal) * p.area for p in me.polygons)
    if s < 0:
        me.flip_normals()
    me.update()
    return o


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


def globe(R, col, seg=28, n=14, bands=(), fn=None, warp=None, band=None, wave=None, vfn=None):
    """A sphere at the origin of the game frame, poles on Y, its latitude rings
    at an even spacing PLUS every height in `bands` (y / R), so a recoloured
    band has a crisp edge exactly where asked.
      fn(unit Vector) -> colour or None   paints face by face;
      band(h) -> colour or None           paints each row of faces by its
                                          (unwaved) mid-height h = y / R;
      vfn(unit Vector) -> colour          paints per vertex (soft mottling);
      wave(azimuth, h) -> dh              moves a ring up or down, so band
                                          edges wander like weather;
      warp(unit Vector) -> radius factor."""
    hs = {round(math.cos(PI * i / n), 6) for i in range(1, n)}
    for h in bands:
        hs.add(round(h, 6))
    hs = sorted(hs, reverse=True)
    full = [1.0] + hs + [-1.0]
    rings = [[Vector((0, R, 0))]]
    for i, h in enumerate(hs):
        # a wave never carries a ring past half the gap to its neighbours,
        # and fades out towards the poles
        gap = 0.45 * min(full[i] - h, h - full[i + 2])
        ring = []
        for j in range(seg):
            a = TAU * j / seg
            dh = (wave(a, h) * (1 - h * h)) if wave else 0.0
            hh = h + max(-gap, min(gap, dh))
            r = math.sqrt(max(0.0, 1 - hh * hh))
            u = Vector((r * math.cos(a), hh, r * math.sin(a)))
            k = warp(u) if warp else 1.0
            ring.append(u * R * k)
        rings.append(ring)
    rings.append([Vector((0, -R, 0))])
    o = rings_mesh(rings, name='globe')
    outward(o)
    if vfn:
        paint(o, col, lambda p: L(vfn(p.normalized())))
    else:
        paint(o, col)
    if band:
        edges = [1.0] + hs + [-1.0]
        mids = [(edges[k] + edges[k + 1]) / 2 for k in range(len(edges) - 1)]
        me = o.data
        attr = me.color_attributes['base']
        for poly in me.polygons:
            c = band(mids[min(len(mids) - 1, poly.index // seg)])
            if c is None:
                continue
            c = L(c)
            for li in poly.loop_indices:
                attr.data[li].color = (*c, 1.0)
    if fn:
        recolor(o, lambda c, nn: fn(c.normalized()))
    return _smooth(o, 80)


def vpaint(o, fn):
    """Per-vertex colour from fn(mesh-space position Vector)."""
    return paint(o, (0, 0, 0), lambda p: L(fn(p)))


def noise3(rnd, k=4, f=(1.5, 3.5)):
    """A smooth lumpy field on the unit sphere: n(u) in about -1..1."""
    terms = []
    for _ in range(k):
        d = Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-1, 1))).normalized()
        terms.append((d, rnd.uniform(*f), rnd.uniform(0, TAU)))
    return lambda u: sum(math.sin(u.dot(d) * fr * PI + ph) for d, fr, ph in terms) / math.sqrt(k)


def smooth01(e0, e1, x):
    t = max(0.0, min(1.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


def patch(R, d, prof, col, seg=14, wob=None, fn=None, c=(0, 0, 0)):
    """A shallow patch hugging a sphere of radius R centred at c: craters,
    ice caps, spots, islands, storms. `prof` is [(angle, lift), ...] from the
    outer edge in to the middle — angle off the patch's axis (radians), lift
    as a multiple of R (a little under 1 at the edge tucks it into the
    surface). The axis is the game-frame direction d. wob(azimuth) -> angle
    factor makes the outline irregular. fn(angle, azimuth) -> colour paints
    per face (rings of a crater, a spot's umbra).

    Rings are added wherever two in `prof` are more than `STEP` apart, so a
    wide patch bends with the globe instead of spanning it with flat facets
    the globe would poke through."""
    STEP = 0.13
    full = [prof[0]]
    for (t1, k1) in prof[1:]:
        t0, k0 = full[-1]
        m = int((t0 - t1) / STEP)
        for q in range(1, m + 1):
            f = q / (m + 1)
            full.append((t0 + (t1 - t0) * f, k0 + (k1 - k0) * f))
        full.append((t1, k1))
    prof = full
    rings = []
    for (th, k) in prof:
        if th <= 1e-6:
            rings.append([Vector((0, R * k, 0))])
            continue
        ring = []
        for j in range(seg):
            a = TAU * j / seg
            t = th * (wob(a) if wob else 1.0)
            ring.append(Vector((R * k * math.sin(t) * math.cos(a), R * k * math.cos(t),
                                R * k * math.sin(t) * math.sin(a))))
        rings.append(ring)
    o = rings_mesh(rings, name='patch', cap1=prof[-1][0] > 1e-6)
    outward(o)
    paint(o, col)
    if fn:
        def f(cc, nn):
            th = math.acos(max(-1.0, min(1.0, cc.normalized().y)))
            return fn(th, math.atan2(cc.z, cc.x))
        recolor(o, f)
    o.data.transform(Matrix.Translation(Vector(c)) @ aim(d))
    o.data.update()
    return _smooth(o, 60)


def crater(R, d, size, floor, rim, c=(0, 0, 0), seg=12, lift=1.0):
    """A toy crater: a raised pale rim round a dark dished floor."""
    s = size / R
    return patch(R, d, [(s * 1.18, 0.992 * lift), (s * 1.0, 1.022 * lift), (s * 0.78, 1.012 * lift),
                        (s * 0.4, 1.006 * lift), (0, 1.005 * lift)], floor, seg=seg, c=c,
                 fn=lambda th, a: rim if th > s * 0.8 else None)


def sweep(points, radii, col, n=10, caps=True, smooth=60, fn=None, squash=1.0, up=(0, 1, 0)):
    """A round tube through game-frame `points`, radius per point (or one),
    parallel-transported. fn(i / (m - 1)) -> colour grades it along its
    length; squash flattens the section along `up`-ish."""
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
        ring = []
        for j in range(n):
            a = TAU * j / n
            ring.append(p + (u * math.cos(a) * squash + w * math.sin(a)) * rr[i])
        rings.append(ring)
    o = rings_mesh(rings, cap0=caps, cap1=caps, name='sweep')
    # orient from the tube's own middle
    me = o.data
    s = sum((poly.center - pts[min(m - 1, poly.index // n)]).dot(poly.normal) for poly in me.polygons
            if poly.index < (m - 1) * n)
    if s < 0:
        me.flip_normals()
    paint(o, col)
    if fn:
        cols = [L(fn(i / max(1, m - 1))) for i in range(m)]
        attr = me.color_attributes['base']
        # per vertex: ring index is vertex index // n (rings were made in order)
        for poly in me.polygons:
            for li in poly.loop_indices:
                vi = me.loops[li].vertex_index
                attr.data[li].color = (*cols[min(m - 1, vi // n)], 1.0)
    return _smooth(o, smooth)


def ball(r, col, at=(0, 0, 0), seg=16, scale=(1, 1, 1), rx=0.0, ry=0.0, rz=0.0):
    """A sphere / ellipsoid in the game frame (scale is game x, y, z)."""
    o = sphere(r, color=col, seg=seg, scale=scale)
    place(o, at, rx, ry, rz)
    return o


def hoop(R, t, col, at=(0, 0, 0), rx=0.0, ry=0.0, rz=0.0, seg=32, rseg=8):
    """three's torus: in the XY plane until rotated (rx = PI/2 lays it flat)."""
    o = torus(R, t, color=col, seg=seg, rseg=rseg)
    place(o, at, rx, ry, rz)
    return o


def stone(r, at, col, seed, sub=1, scale=(1, 1, 1), cuts=6, depth=0.22, ry=0.0, light=0.12):
    """A chunky toy boulder in the game frame: an icosphere sliced by a few
    planes so it has broad facets, its upward facets a shade lighter."""
    rnd = random.Random(seed)
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=1.0)
    planes = []
    for _ in range(cuts):
        nv = Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-1, 1))).normalized()
        planes.append((nv, 1.0 - depth * rnd.uniform(0.6, 1.3)))
    for vt in bm.verts:
        p = vt.co.copy()
        for nv, dd in planes:
            h = p.dot(nv)
            if h > dd:
                p -= nv * (h - dd)
        vt.co = Vector((p.x * r * scale[0], p.y * r * scale[1], p.z * r * scale[2]))
    o = _from_bmesh(bm, 'stone')
    paint(o, col)
    recolor(o, lambda c, n: lt(col, light) if n.y > 0.55 else (dk(col, 0.12) if n.y < -0.5 else None))
    place(o, at, 0.0, ry, 0.0)
    return _smooth(o, 32)


def lift(parts):
    """Rest the prop on the floor (Blender z = 0) — v1 ground-aligns too."""
    lo = min(v.co.z for o in parts for v in o.data.vertices)
    for o in parts:
        o.data.transform(Matrix.Translation((0, 0, -lo)))
        o.data.update()
    return parts


# ================================================================= SMALL BODIES

@model('sol_trojan', ao=0.55)
def sol_trojan(v):
    """Everything trapped at one Lagrange point, milling about: two big
    boulders and a crowd, piled into a lens. v1's sixteen ellipsoids in v1's
    places, each a cut-facet toy stone instead of a smooth egg."""
    Z = SZ['trojan']
    parts = []
    for i in range(16):
        a = i * GOLD + v
        t = i / 16
        d = Z * (0.95 - t * 0.7)
        rr = Z * (0.24 - t * 0.1) * (1.7 if i < 2 else 1)
        col = S.rustDk if i % 4 == 0 else (S.rock if i % 2 else S.basalt)
        at = (math.cos(a) * d, Z * (0.24 + t * 1.35), math.sin(a) * d * 0.8)
        parts.append(stone(rr, at, col, seed=v * 31 + i, sub=3 if i < 2 else (2 if i < 12 else 1),
                           scale=(1.0, 0.84, 0.9), ry=-a, cuts=7 if i < 2 else 5))
        if i < 2:
            # the two big ones carry a crater each
            dd = surf(a + 1.2, 0.9)
            cr = crater(rr * 0.86, dd, rr * 0.3, dk(S.crater, 0.1), lt(col, 0.18), seg=8)
            place(cr, at)
            parts.append(cr)
    return lift(parts)


@model('sol_dwarf', ao=0.5)
def sol_dwarf(v):
    """A small cold world: a bright nitrogen plain on one face (lobed, so it
    is a place and not a polka dot), a dark tholin stain on the other, a polar
    cap, a few craters, and — on two of three — its one moon, far too big."""
    Z = SZ['dwarf']
    R = Z * 1.03
    col = [S.rustDk, S.dustPale, S.iceDeep][v]
    rnd = random.Random(70 + v)
    body = globe(R, col, seg=28, n=14)
    parts = [body]
    ph = [rnd.uniform(0, TAU) for _ in range(2)]
    plain = patch(R, surf(0.6 + v, 1.35), [(0.66, 0.99), (0.62, 1.01), (0.5, 1.02), (0.0, 1.026)],
                  S.icePale, seg=18,
                  wob=lambda a: 1 + 0.16 * math.cos(2 * a + ph[0]) + 0.08 * math.cos(3 * a + ph[1]))
    parts.append(plain)
    parts.append(patch(R, surf(3.4 + v, 1.9), [(0.5, 0.99), (0.45, 1.02), (0.0, 1.03)],
                       dk(S.rustDk, 0.12) if v else S.ash, seg=14,
                       wob=lambda a: 1 + 0.14 * math.cos(3 * a + ph[1])))
    parts.append(patch(R, (0, 1, 0), [(0.42, 0.99), (0.37, 1.022), (0.0, 1.03)], S.icePale, seg=18,
                       wob=lambda a: 1 + 0.1 * math.cos(4 * a + ph[0])))
    rim = lt(col, 0.22)
    keep = [(surf(0.6 + v, 1.35), 0.85), (surf(3.4 + v, 1.9), 0.65), (Vector((0, 1, 0)), 0.5)]
    parts += craters_on(R, rnd, 4, dk(col, 0.35), rim, keep=keep, size=(0.13, 0.2), seg=12)
    for p in parts:
        place(p, (0, R, 0))
    if v != 2:
        mc = (Z * 1.05, Z * 1.5, -Z * 0.56)
        parts.append(ball(Z * 0.3, S.rock, at=mc, seg=16))
        m = crater(Z * 0.3, surf(2.2, 1.2), Z * 0.09, S.crater, S.rockLt, seg=10)
        place(m, mc)
        parts.append(m)
    return lift(parts)


# ================================================================= FIELDS AND PLASMA

def wall(R, H, span, t, col, bow=0.0, seg=20, y0=0.0, phi=0.0, fall=0.35, fn=None, sec=8, ripple=0.0, rph=0.0):
    """A curved standing sheet of gas (spacekit's `sheet`, a partial lathe),
    in the game frame: `span` radians of a circle of radius R centred on the
    azimuth `phi` (three's lathe angle — 0 is game +Z), H tall, 2t thick, its
    top leaning in by bow*R. Rounded in section, its wings falling to (1 -
    fall) of the height. fn(s, h) -> colour, s in -1..1 across the span and
    h in 0..1 up it, grades it."""
    rings = []
    for i in range(seg + 1):
        s = -1 + 2 * i / seg
        p = phi + span * 0.5 * s
        hh = H * (1 - fall * s * s) * (1 + ripple * (math.sin(s * 9 + rph) - 1) * 0.5)
        tt = t * (1 - 0.35 * s * s)
        ring = []
        for j in range(sec):
            # a stadium section round the centreline (R, 0) -> (R - bow R, hh)
            b = TAU * j / sec
            hu = 0.5 + 0.5 * math.sin(b)         # 0 bottom .. 1 top
            rad = R - bow * R * hu * hu + tt * math.cos(b)
            y = y0 + hh * hu
            ring.append(Vector((rad * math.sin(p), y, rad * math.cos(p))))
        rings.append(ring)
    o = rings_mesh(rings, cap0=True, cap1=True, name='wall')
    # outward from the sheet's own centreline
    me = o.data
    s_ = 0.0
    for poly in me.polygons:
        c = poly.center
        ang = math.atan2(c.x, c.z)
        rc = R - bow * R * ((c.y - y0) / max(1e-9, H)) ** 2
        ref = Vector((rc * math.sin(ang), c.y, rc * math.cos(ang)))
        s_ += (c - ref).dot(poly.normal) * poly.area
    if s_ < 0:
        me.flip_normals()
    paint(o, col)
    if fn:
        attr = me.color_attributes['base']
        for poly in me.polygons:
            for li in poly.loop_indices:
                q = me.vertices[me.loops[li].vertex_index].co
                ang = math.atan2(q.x, q.z) - phi
                ang = (ang + PI) % TAU - PI
                attr.data[li].color = (*L(fn(ang / (span * 0.5), (q.y - y0) / max(1e-9, H))), 1.0)
    return _smooth(o, 50)


@model('sol_magnetotail', ao=0.45)
def sol_magnetotail(v):
    """A planet's magnetic field blown out downwind: the planet nested in its
    dim field bubble, two fat lobes streaming away along the plane (+X) with
    the bright neutral sheet between them, and the bow shock standing off the
    sunward side (-X) as one curved sheet."""
    Z = SZ['magnetotail']
    y = Z * 0.62
    parts = []
    # the field bubble, pushed downwind, and the planet emerging from its nose
    parts.append(ball(Z * 0.45, S.fieldDim, at=(Z * 0.18, y, 0), seg=20, scale=(1.2, 0.9, 0.95)))
    planet = globe(Z * 0.34, S.rock, seg=20, n=10, bands=(0.9, 0.78, -0.78, -0.9),
                   fn=lambda u: (S.icePale if abs(u.y) > 0.9 else
                                 S.aurora if abs(u.y) > 0.78 else
                                 (S.rockDk if (u.x * 3 + u.z * 2) % 1.4 < 0.35 else None)))
    place(planet, (-Z * 0.14, y, 0), rz=0.25)
    parts.append(planet)
    # dipole field lines: hoops round the planet, squashed sunward and drawn
    # out downwind into the lobes
    for k, (R, sx) in enumerate(((Z * 0.5, 1.5), (Z * 0.6, 1.9))):
        o = torus(R, Z * 0.02, color=lt(S.field, 0.15), seg=24, rseg=5)
        deform(o, lambda p, sx=sx: Vector((p.x * (sx if p.x > 0 else 0.8), p.y * 0.82, p.z)))
        place(o, (-Z * 0.1, y, 0), ry=(0.35 + 0.2 * v) * (1 if k else -1))
        parts.append(o)
    # the lobes, one above and towards the front, one below and behind
    for s in (-1, 1):
        pts, rad = [], []
        for i in range(12):
            t = i / 11
            pts.append((Z * (0.3 + t * 4.45), y + s * Z * (0.13 + t * 0.1), s * Z * (0.1 + t * 0.34)))
            rad.append(Z * (0.22 + 0.08 * math.sin(min(1.0, t * 2.2) * PI / 2) - 0.18 * t ** 1.5))
        # a rounded tip
        rad[-1] *= 0.45
        rad[-2] *= 0.85
        o = sweep(pts, rad, S.field, n=10, squash=0.85,
                  fn=lambda t: mix(lt(S.field, 0.12), S.fieldDim, t ** 0.8))
        parts.append(place(o))
    # the neutral sheet, a thin bright blade between them
    parts.append(ball(1.0, S.aurora, at=(Z * 2.45, y, 0), seg=16, scale=(Z * 2.05, Z * 0.028, Z * 0.15)))
    # the bow shock, standing off the sunward side
    bow = wall(Z * 1.4, Z * 1.24, 1.15, Z * 0.05, S.wind, bow=0.0, seg=18, y0=0.0, phi=-PI / 2,
               fall=0.45, fn=lambda s, h: mix(lt(S.wind, 0.15), S.windDim, abs(s) ** 1.5 * 0.9))
    place(bow, (Z * 0.5, 0, 0))
    parts.append(bow)
    return lift(parts)


def arch(span, rise, thick, colA, colB, n=28, sides=12, wob=0.5, ph=0.0, flare=1.35, hot=0.55, sink=None):
    """A coronal loop / prominence in the game frame: ONE smooth tube along
    v1's semi-ellipse (feet at x = -/+ span / 2, crown at y = rise), a little
    fatter at the crown as v1's elements are, flared where it plugs into the
    photosphere, wobbling gently out of its plane, and graded from colA at
    the feet to colB at the crown (v1 paints its top seventh colB)."""
    pts, rad = [], []
    for i in range(n + 1):
        t = i / n
        a = t * PI
        pts.append((-math.cos(a) * span * 0.5, math.sin(a) * rise + thick * 0.5,
                    math.sin(t * 6.2 + ph) * thick * wob))
        f = max(0.0, 1 - min(t, 1 - t) * 9) ** 2 * (flare - 1)
        rad.append(thick * (0.78 + 0.3 * math.sin(a)) * (1 + f))
    # tuck the feet in: the first and last points sit below the floor (by
    # `sink`, where v1's own foot elements hang below its solid body)
    yf = -thick * 0.25 if sink is None else -sink
    pts[0] = (pts[0][0], yf, pts[0][2])
    pts[-1] = (pts[-1][0], yf, pts[-1][2])

    def fn(t):
        h = math.sin(t * PI)
        return mix(colA, colB, (h - hot) / (1 - hot))
    return sweep(pts, rad, colA, n=sides, fn=fn)


def egg(rx, ry, rz, col, at, seg=20, top=None, bottom=None, ry_=0.0):
    """An ellipsoid in the game frame, optionally graded from `bottom` to
    `top` up its height."""
    o = sphere(1.0, color=col, seg=seg, scale=(rx, ry, rz))
    if top is not None or bottom is not None:
        tc = L(top if top is not None else col)
        bc = L(bottom if bottom is not None else col)
        paint(o, col, lambda p: mixc(bc, tc, max(0.0, min(1.0, 0.5 + p.y / (2 * ry)))))
    place(o, at, ry=ry_)
    return o


@model('sol_sunspot', ao=0.35)
def sol_sunspot(v):
    """A piece of photosphere with the spots still in it — a MOUND, mottled
    with granulation as colour cells of the mound's own faces (cells, not
    cobbles), and four spots that are the subject: a dark umbra in a ringed,
    combed penumbra.

    Size: v1's height (1.44 Z) comes from its spot discs, tilted flat cylinders
    whose rims stick up off the dome; this mound and its spots are ~1.3 Z."""
    Z = SZ['sunspot']
    rnd = random.Random(5 + v)
    H, W = 1.33 * Z, 0.96 * Z
    Rs = (W * W + H * H) / (2 * H)
    cy = H - Rs                              # the sphere's centre, under the top
    cells = [surf(rnd.uniform(0, TAU), math.acos(rnd.uniform(-0.2, 1.0))) for _ in range(46)]
    tone = [rnd.choice((S.photoHot, lt(S.photo, 0.3), S.photo, S.photo, mix(S.photo, S.limb, 0.3))) for _ in cells]

    def gran(u):
        best = max(range(len(cells)), key=lambda i: u.dot(cells[i]))
        c = tone[best]
        # limb darkening towards the foot of the mound
        k = max(0.0, min(1.0, (0.25 - u.y) / 0.5))
        return mix(c, S.limb, k * 0.7) if k > 0 else c
    dome = globe(Rs, S.photo, seg=36, n=18, vfn=gran)
    deform(dome, lambda p: Vector((p.x, max(p.y, -cy), p.z)))
    place(dome, (0, cy, 0))
    parts = [dome]
    # the rolled foot the mound stands in
    skirt = lathe([(W * 0.9, 0.0), (W * 1.02, 0.0), (W * 1.04, Z * 0.05), (W * 0.99, Z * 0.11), (W * 0.9, Z * 0.13)],
                  color=S.limb, seg=36, close_bottom=False)
    parts.append(skirt)
    for i in range(4):
        a = 1.1 + i * 1.5 + v
        d = Z * (0.22, 0.5, 0.62, 0.4)[i]
        rr = Z * (0.2 + (i % 2) * 0.12) * 0.86
        dirv = Vector((math.cos(a) * d, 0, math.sin(a) * d))
        dirv.y = math.sqrt(max(0.0, Rs * Rs - d * d))
        dirv.normalize()
        sp = rr * 1.5 / Rs
        su = rr / Rs
        spot = patch(Rs, dirv, [(sp * 1.06, 0.997), (sp, 1.012), (sp * 0.82, 1.014), (su * 1.02, 1.012),
                                (su * 0.9, 1.004), (su * 0.4, 1.002), (0, 1.002)], S.penumbra, seg=20,
                     wob=lambda az, i=i: 1 + 0.07 * math.cos(3 * az + i),
                     fn=lambda th, az, su=su, sp=sp: (S.umbra if th < su * 0.97 else
                                                      (dk(S.penumbra, 0.18) if int((az + PI) / TAU * 20) % 2 else None)
                                                      if th < sp * 0.97 else lt(S.penumbra, 0.15)))
        place(spot, (0, cy, 0))
        parts.append(spot)
    return lift(parts)


@model('sol_bowshock', ao=0.4)
def sol_bowshock(v):
    """The wind piling into an obstacle and standing off it: a dim egg of
    field, two bowed sheets curving round its front, the glow of the pile-up
    as one aurora arc across the top, and the deflected wind streaming away
    behind as speed lines."""
    Z = SZ['bowshock']
    parts = [egg(Z * 0.44 * 0.92, Z * 0.62 * 0.92, Z * 0.62 * 0.92, S.windDim, (0, Z * 0.62, 0), seg=24,
                 top=lt(S.windDim, 0.15), bottom=dk(S.windDim, 0.25))]
    outer = wall(Z * 0.72, Z * 0.95, 2.5, Z * 0.036, S.wind, bow=0.16, seg=24, y0=Z * 0.08, fall=0.3, sec=10,
                 fn=lambda s, h: mix(lt(S.wind, 0.25), S.wind, abs(s) * 0.8 + (1 - h) * 0.2))
    inner = wall(Z * 0.56, Z * 0.7, 2.2, Z * 0.028, S.windDim, bow=0.2, seg=20, y0=Z * 0.16, fall=0.3, sec=8,
                 fn=lambda s, h: mix(S.windDim, lt(S.windDim, 0.2), h))
    parts += [place(outer), place(inner)]
    # the pile-up glow: one arc of aurora where v1 had five beads
    pts = []
    for i in range(9):
        a = -0.95 + (i / 8) * 1.9
        pts.append((Z * math.cos(a) * 0.34, Z * (1.5 + 0.06 * math.cos(a * 2)), Z * math.sin(a) * 0.66))
    rad = [Z * 0.12 * (0.55 + 0.45 * math.sin(PI * i / 8)) for i in range(9)]
    parts.append(place(sweep(pts, rad, S.aurora, n=10,
                             fn=lambda t: mix(S.aurora, lt(S.aurora, 0.35), math.sin(t * PI)))))
    # the deflected wind streaming off behind
    for i in range(5):
        a = -0.85 + (i / 4) * 1.7
        x0 = -Z * (0.64 + (i % 3) * 0.3)
        y0 = Z * (0.45 + (i % 4) * 0.35)
        z0 = Z * math.sin(a) * 0.8
        ln = Z * (0.72 + 0.12 * (i % 2))
        pts = [(x0 - ln * t, y0 + ln * t * 0.12, z0) for t in (0, 0.33, 0.66, 1.0)]
        parts.append(place(sweep(pts, [Z * 0.05, Z * 0.055, Z * 0.04, Z * 0.012], S.windDim, n=8,
                                 fn=lambda t: mix(S.wind, S.windDim, t))))
    return lift(parts)


@model('sol_loop', ao=0.3)
def sol_loop(v):
    """A field line drawn in glowing gas: one smooth tube arching off the
    limb, hot-footed and paler at the crown, standing on two bright footpoint
    mounds, with a smaller loop nested inside it on two of three. The limb
    egg between the feet is v1's solid body."""
    Z = SZ['loop']
    parts = [egg(Z * 0.62 * 0.9, Z * 0.9 * 0.9, Z * 0.4 * 0.9, S.limb, (0, Z * 0.62, 0), seg=24,
                 top=lt(S.limb, 0.2), bottom=dk(S.limb, 0.15))]
    parts.append(place(arch(Z * 1.7, Z * 2.6, Z * 0.15, S.plasmaPl, S.corona, n=30, sides=12, ph=v * 1.3,
                            sink=Z * 0.26)))
    if v:
        parts.append(place(arch(Z * 1.15, Z * 1.9, Z * 0.09, S.corona, S.plasmaPl, n=24, sides=10,
                                ph=2.0 + v, wob=0.8, sink=Z * 0.18)))
    # the footpoints: bright knots where the loop plugs into the surface
    for s in (-1, 1):
        parts.append(egg(Z * 0.36, Z * 0.3, Z * 0.3, S.limb, (s * Z * 0.85, -Z * 0.03, 0), seg=20,
                         top=S.plasmaPl, bottom=dk(S.limb, 0.1)))
    return parts


@model('sol_flare', ao=0.3)
def sol_flare(v):
    """An eruption off ONE spot: a bright footpoint in a low corona, three
    broad ribbons of plasma arching out of it, fanned and leaning the same
    way, and a spray of droplets thrown clear off to one side."""
    Z = SZ['flare']
    lean = 0.5 + v * 0.35
    parts = [egg(Z * 0.62 * 0.86, Z * 0.62 * 0.86, Z * 0.62 * 0.86, S.photoHot, (0, Z * 0.55, 0), seg=20,
                 top=lt(S.photoHot, 0.4), bottom=S.photo)]
    parts.append(egg(Z * 0.5, Z * 0.3, Z * 0.5, S.corona, (0, Z * 0.3, 0), seg=14, bottom=S.photo))
    for i in range(3):
        t = i / 2
        o = arch(Z * (1.5 + t * 0.9), Z * (1.9 + t * 0.7), Z * (0.17 - t * 0.03),
                 S.plasma if i % 2 else S.plasmaPl, S.corona, n=22, sides=10, ph=i * 2.1 + v, wob=0.35,
                 sink=Z * 0.36)
        # fan the three ribbons a little out of one plane, all leaning one way
        place(o, (0, 0, 0), rx=0.04 + 0.08 * i, rz=-0.05 * (i - 1))
        parts.append(o)
    # the spray, droplets drawn out along the way they were thrown
    for i in range(7):
        a = lean + (i % 3) * 0.5
        p = Vector((math.cos(a) * Z * (0.4 + i * 0.16), Z * (2.1 + (i % 4) * 0.42), math.sin(a) * Z * (0.3 + i * 0.1)))
        r = Z * (0.15 - (i % 3) * 0.03)
        dirv = (p - Vector((0, Z * 0.6, 0))).normalized()
        o = sphere(1.0, color=S.corona, seg=8, scale=(r * 0.85, r * 1.5, r * 0.85))
        paint(o, S.corona, lambda q: mix(S.corona, S.plasmaPl, max(0.0, -q.y) / 1.5))
        o.data.transform(aim(dirv))
        place(o, tuple(p))
        parts.append(o)
    return lift(parts)


# ================================================================= PLANETS

def oval_patch(R, a, h, w, col, lift=1.03, seg=16, aspect=0.6, fn=None, edge=0.995):
    """A weather oval on a globe, at azimuth a (v1's `oval`: surf(a, acos h))
    and w*R across, `aspect` as tall as it is wide."""
    d = surf(a, math.acos(max(-1.0, min(1.0, h))))
    th = w * 0.5
    # azimuth 0 of the patch frame: its local x; stretch along the globe's
    # east-west, which `aim` leaves roughly on the patch's local x for
    # mid-latitude spots — good enough for a toy storm
    k = 1 / aspect

    def wob(az):
        return 1.0 / math.sqrt(math.cos(az) ** 2 + (k * math.sin(az)) ** 2) * 1.0
    up = lift - 1.0
    o = patch(R, d, [(th, edge), (th * 0.8, 1.0 + up * 0.55), (th * 0.45, 1.0 + up * 0.9), (0, lift)], col,
              seg=seg, wob=wob, fn=fn)
    # turn the patch about its own axis so its long side runs east-west
    east = Vector((0, 1, 0)).cross(d)
    if east.length > 1e-6:
        east.normalize()
        # where aim() sent the patch's local x
        lx = (aim(d) @ Vector((1, 0, 0, 0))).to_3d()
        ang = lx.angle(east)
        if lx.cross(east).dot(d) < 0:
            ang = -ang
        o.data.transform(Matrix.Rotation(ang, 4, d))
        o.data.update()
    return o


def ringed(r0, r1, t, cols, seg=40, cuts=None, under=None):
    """A flat ring system in the game frame (spacekit's `annulus` /
    `gradedDisc`): a thin closed slab from r0 to r1, its top split at the
    radii in `cuts` into crisp bands coloured from `cols` (inner to outer),
    its underside one colour (`under`, default a shade under the middle)."""
    cuts = list(cuts or [])
    top = [r0] + cuts + [r1]
    prof = [(r, t) for r in top] + [(r1, -t), (r0, -t)]
    bm = bmesh.new()
    vr = [[bm.verts.new((r * math.cos(TAU * j / seg), y, r * math.sin(TAU * j / seg))) for j in range(seg)]
          for (r, y) in prof]
    vr.append(vr[0])
    for a, b in zip(vr, vr[1:]):
        for j in range(seg):
            j2 = (j + 1) % seg
            bm.faces.new((a[j], a[j2], b[j2], b[j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = _from_bmesh(bm, 'ringed')
    bounds = [r0] + cuts + [r1 + 1]
    low = under if under is not None else dk(cols[len(cols) // 2], 0.2)

    def fn(c, n):
        if n.y < -0.5:
            return low
        r = math.hypot(c.x, c.z)
        for k in range(len(bounds) - 1):
            if r < bounds[k + 1]:
                return cols[min(k, len(cols) - 1)]
        return cols[-1]
    paint(o, cols[0])
    recolor(o, fn)
    return _smooth(o, 30)


def craters_on(R, rnd, n, floor, rim, keep=(), size=(0.13, 0.24), seg=12, lift=1.0):
    """n craters scattered over a globe, kept clear of the (direction,
    angle) zones in `keep` and of each other."""
    keep = list(keep)
    out = []
    tries = 0
    while len(out) < n and tries < 400:
        tries += 1
        d = surf(rnd.uniform(0, TAU), math.acos(rnd.uniform(-0.85, 0.85)))
        s = R * rnd.uniform(*size)
        if any(d.angle(c) < m + s / R for c, m in keep):
            continue
        keep.append((d, s / R * 1.2))
        out.append(crater(R, d, s, floor, rim, seg=seg, lift=lift))
    return out


@model('sol_rocky', ao=0.45)
def sol_rocky(v):
    """A small rocky world in v1's paint: rust, pale rock or regolith ground
    banded with darker terrain, cratered, capped with ice at both poles, cut
    by one great rift and raised into one shield volcano — and the thin
    atmosphere that v1 wrapped round it as an opaque shell is here as long
    wisps of cloud in v1's air colour, so the ground shows through.

    Size: v1's depth runs 2.2-2.3 Z on two variants because its volcano is a
    cone set at an odd angle that juts out of the shell; the volcano here is a
    shield that stands 0.1 Z proud on the same side."""
    Z = SZ['rocky']
    R = Z * 1.02
    ground = [S.rust, S.rockLt, S.regolith][v]
    air = [S.cloudWarm, S.ammonia, S.cloud][v]
    rnd = random.Random(40 + v)
    belts = [(-0.62, S.rustDk), (-0.2, S.crater), (0.24, S.rustDk), (0.6, S.dustPale)]
    nz = noise3(rnd, k=5, f=(1.0, 2.4))
    ph = rnd.uniform(0, TAU)

    def terrain(u):
        h = u.y + 0.2 * nz(u)
        c = L(ground)
        for hb, bc in belts:
            k = 1 - smooth01(0.05, 0.13, abs(h - hb))
            if k > 0:
                c = mixc(c, mix(bc, ground, 0.2), k)
        return c
    body = globe(R, ground, seg=32, n=16, vfn=terrain)
    parts = [body]
    parts.append(patch(R, (0, 1, 0), [(0.3, 0.99), (0.26, 1.02), (0.0, 1.028)], S.icePale, seg=18,
                       wob=lambda a: 1 + 0.12 * math.cos(3 * a + ph)))
    parts.append(patch(R, (0, -1, 0), [(0.26, 0.99), (0.22, 1.02), (0.0, 1.028)], S.icePale, seg=16,
                       wob=lambda a: 1 + 0.12 * math.cos(4 * a + ph)))
    p = surf(1.4 + v, 1.5)
    # the shield volcano, opposite the rift, as v1 has it
    vol = patch(R, -p, [(0.36, 0.995), (0.26, 1.035), (0.12, 1.085), (0.06, 1.1), (0.035, 1.08), (0.0, 1.07)],
                mix(S.basalt, ground, 0.25), seg=16,
                fn=lambda th, az: S.basalt if th < 0.2 else None)
    parts.append(vol)
    # the rift: one dark groove laid along the surface
    pts = []
    for k in range(7):
        s = surf(1.4 + v + (k - 0.5) * 0.27, 1.5 + math.sin(k) * 0.16)
        pts.append(tuple(s * R * 1.003))
    parts.append(sweep(pts, [R * w for w in (0.012, 0.03, 0.04, 0.045, 0.04, 0.03, 0.012)], S.basalt, n=8))
    keep = [(Vector((0, 1, 0)), 0.35), (Vector((0, -1, 0)), 0.3), (-p, 0.4), (p, 0.45)]
    parts += craters_on(R, rnd, 6, mix(S.crater, ground, 0.2), lt(ground, 0.18), keep=keep, size=(0.1, 0.18), seg=12)
    # the air: long wisps of cloud
    for i in range(5):
        a = i * GOLD * 1.3 + v
        h = (-0.45, 0.35, -0.05, 0.6, -0.7)[i]
        d = surf(a, math.acos(h))
        w = 0.34 + 0.08 * (i % 2)
        cl = oval_patch(R, a, h, w * 2, air, lift=1.045, seg=12, aspect=0.32, edge=1.0)
        parts.append(cl)
    for o in parts:
        place(o, (0, R, 0))
    return lift(parts)


@model('sol_ocean', ao=0.45)
def sol_ocean(v):
    """A water world: deep and shallow ocean in two blues, three islands
    ringed by pale shelves, a polar cap, and the weather all that water makes —
    eight long white cloud swirls riding above it, where v1 hid the whole
    globe inside one opaque cloud shell.

    Size: v1's depth (2.3-2.8 Z) is its continental-shelf discs, flat
    cylinders up to 0.6 Z across laid tangent to the globe whose rims stand out
    of it like plates; this globe and its clouds are about 2.15 Z all round."""
    Z = SZ['ocean']
    R = Z * 1.04
    rnd = random.Random(90 + v)
    nz = noise3(rnd, k=5, f=(1.2, 2.6))
    deep = lambda u: mix(S.ocean, S.oceanDeep, smooth01(-0.1, 0.45, nz(u)))
    body = globe(R, S.ocean, seg=32, n=16, vfn=deep)
    parts = [body]
    parts.append(patch(R, (0, 1, 0), [(0.32, 0.99), (0.28, 1.02), (0.0, 1.028)], S.icePale, seg=18,
                       wob=lambda a: 1 + 0.12 * math.cos(3 * a + v)))
    shelf = lt(S.ocean, 0.3)
    isl = []
    for i in range(3):
        while True:
            d = surf(rnd.uniform(0, TAU), math.acos(rnd.uniform(-0.6, 0.6)))
            if all(d.angle(q) > 0.95 for q in isl):
                break
        isl.append(d)
        s = rnd.uniform(0.2, 0.3)
        ph = rnd.uniform(0, TAU)
        land = S.sulfur if i == 0 else S.dustPale
        parts.append(patch(R, d, [(s * 1.5, 0.995), (s * 1.38, 1.006), (s * 1.0, 1.008), (s * 0.92, 1.03),
                                  (s * 0.4, 1.042), (0.0, 1.045)], shelf, seg=16,
                           wob=lambda a, ph=ph: 1 + 0.18 * math.cos(2 * a + ph) + 0.1 * math.cos(5 * a + ph * 2),
                           fn=lambda th, az, s=s, land=land: (land if th < s * 0.96 else None)))
    for i in range(8):
        a = i * GOLD + v
        e = 0.7 + (i % 4) * 0.5
        h = math.cos(e)
        parts.append(oval_patch(R * 1.0, a, h, 0.62 + 0.1 * (i % 3), S.cloud, lift=1.05, seg=14,
                                aspect=0.36, edge=1.0))
    for o in parts:
        place(o, (0, R, 0))
    return lift(parts)


@model('sol_icegiant', ao=0.45)
def sol_icegiant(v):
    """A cold blue-green giant lying in its pale haze: soft methane and
    ammonia bands, a dark storm with a pale companion cloud, and two crisp
    thin dark rings standing nearly on edge, tilted as v1 tilts them."""
    Z = SZ['icegiant']
    body = [S.methane, S.methaneDk, S.iceBlue][v]
    hazed = mix(body, S.ammonia, 0.4)
    belts = [(-0.7, S.methaneDk), (-0.34, S.ammonia), (0.1, S.methaneDk), (0.46, S.ammonia), (0.76, S.ice)]
    edges = []
    for h, _ in belts:
        edges += [h - 0.075, h + 0.075]

    def band(h):
        for hb, c in belts:
            if abs(h - hb) < 0.075:
                return mix(c, hazed, 0.45)
        return None
    g = globe(Z * 1.03, hazed, seg=36, n=10, bands=edges, band=band,
              wave=lambda a, h: 0.02 * math.sin(2 * a + h * 5 + v))
    parts = [g]
    parts.append(oval_patch(Z * 1.03, 1.2 + v, 0.34, 0.42, S.frostDk, lift=1.022, seg=16, aspect=0.55,
                            fn=lambda th, az: lt(S.frostDk, 0.2) if th > 0.17 else None))
    parts.append(oval_patch(Z * 1.03, 1.2 + v + 0.36, 0.25, 0.2, S.icePale, lift=1.03, seg=12, aspect=0.45))
    parts.append(oval_patch(Z * 1.03, 4.1 + v, -0.28, 0.26, S.icePale, lift=1.025, seg=12, aspect=0.5))
    for o in parts:
        place(o, (0, Z * 1.03, 0))
    # the rings, nearly on edge: v1's torus tilt (rx = PI/2 - 1.1 on an
    # upright torus) is a flat disc turned rx = -1.1
    for i in range(2):
        Rr = Z * (1.35 + i * 0.2)
        o = ringed(Rr - Z * 0.045, Rr + Z * 0.045, Z * 0.012, [S.iceShadow if i else S.frostDk], seg=40)
        place(o, (0, Z * 1.03, 0), rx=-1.1)
        parts.append(o)
    return lift(parts)


@model('sol_gasgiant', ao=0.45)
def sol_gasgiant(v):
    """The king of the planets: crisp alternating belts and zones, their
    edges wandering like weather, tighter towards the poles, and THE GREAT
    STORM — a raised oval in three reds — three times the size of anything
    else on the disc, with a pale oval in the other hemisphere.

    Size: v1's depth (2.1-2.4 Z) comes from its storm, an ellipsoid set into
    the globe that juts 0.15-0.2 Z out of it; the storm here is a raised
    lens on the same side, a toy relief rather than a boulder."""
    Z = SZ['gasgiant']
    zone = mix(S.band, S.cloudWarm, 0.45)
    belts = [(-0.82, S.bandDk), (-0.66, S.bandPale), (-0.46, S.bandDk), (-0.24, S.bandPale),
             (0.0, S.bandDk), (0.22, S.bandPale), (0.44, S.bandDk), (0.64, S.bandPale), (0.82, S.bandDk)]
    edges = []
    for h, _ in belts:
        w = 0.055 if abs(h) > 0.7 else 0.075
        edges += [h - w, h + w]

    def band(h):
        for hb, c in belts:
            w = 0.055 if abs(hb) > 0.7 else 0.075
            if abs(h - hb) < w:
                return c
        return zone
    R = Z * 1.03
    g = globe(R, zone, seg=36, n=8, bands=edges, band=band,
              wave=lambda a, h: 0.018 * math.sin(4 * a + h * 9 + v) + 0.01 * math.sin(7 * a - h * 5))
    parts = [g]
    a0 = 0.9 + v * 2
    parts.append(oval_patch(R, a0, -0.32, 0.62, S.storm, lift=1.04, seg=20, aspect=0.6,
                            fn=lambda th, az: (S.stormDk if th < 0.11 else
                                               lt(S.storm, 0.35) if th > 0.25 else None)))
    parts.append(oval_patch(R, 3.6 + v, 0.42, 0.28, S.bandPale, lift=1.03, seg=14, aspect=0.55,
                            fn=lambda th, az: S.cloudWarm if th < 0.06 else None))
    for o in parts:
        place(o, (0, R, 0))
    return lift(parts)


@model('sol_ring', ao=0.4)
def sol_ring(v):
    """A ringed planet held up inside its rings: a banded globe, the bright
    inner ring system in three crisp tones, the dark Cassini gap with one
    thin glowing ringlet and its shepherd moons in it, then the fainter outer
    sheet — tilted a few degrees, as v1 lies them."""
    Z = SZ['ring']
    TILT = 0.24
    P0 = Z * 0.47
    C0 = Z * 0.62
    planet = globe(P0, S.band, seg=30, n=8, bands=(0.6, 0.44, 0.08, -0.08, -0.44, -0.6),
                   band=lambda h: (S.bandPale if abs(h) < 0.08 else S.bandDk if 0.44 < abs(h) < 0.6 else None),
                   wave=lambda a, h: 0.02 * math.sin(3 * a + h * 6 + v))
    place(planet, (0, C0, 0))
    parts = [planet]
    inner = ringed(Z * 0.66, Z * 1.06, Z * 0.014, [S.bandPale, S.cloudWarm, S.bandPale], seg=40,
                   cuts=[Z * 0.79, Z * 0.93])
    outer = ringed(Z * 1.16, Z * 1.45, Z * 0.012, [S.bandDk, S.bandPale], seg=40, cuts=[Z * 1.3])
    for o in (inner, outer):
        place(o, (0, C0, 0), rx=TILT)
        parts.append(o)
    # the ringlet in the gap: v1's `ring()`, the only self-lit part on the stage
    gl = torus(Z * 1.11, Z * 0.008, color=S.icePale, seg=40, rseg=4)
    place(gl, (0, C0, 0), rx=PI / 2 + TILT)
    glow(gl, 0.5)
    parts.append(gl)
    for i in range(3):
        a = (i / 3) * TAU + v
        rr = Z * 1.11
        q = rot3(rx=TILT) @ Vector((math.cos(a) * rr, 0, math.sin(a) * rr))
        parts.append(ball(Z * 0.05, S.icePale, at=(q.x, C0 + q.y, q.z), seg=8))
    return lift(parts)


# ================================================================= THE OUTER LIMITS AND THE STAR

def arch_line(span, rise, thick, n, wob, ph):
    """v1's `arc` centreline, game frame: feet at x = -/+ span / 2."""
    pts = []
    for i in range(n + 1):
        t = i / n
        a = t * PI
        pts.append(Vector((-math.cos(a) * span * 0.5, math.sin(a) * rise + thick * 0.5,
                           math.sin(t * 6.2 + ph) * thick * wob)))
    return pts


def curtain(lineA, lineB, t, colA, colB):
    """A thin closed slab spanning two arch centrelines (same point count):
    the sheet of plasma a prominence is, between its brighter threads."""
    rings = []
    m = len(lineA)
    for i in range(m):
        a, b = lineA[i], lineB[i]
        off = Vector((0, 0, t))
        rings.append([a + off, b + off, b - off, a - off])
    o = rings_mesh(rings, cap0=True, cap1=True, name='curtain')
    me = o.data
    s = 0.0
    for poly in me.polygons:
        k = min(m - 1, poly.index // 4)
        mid = (lineA[k] + lineB[k]) / 2
        s += (poly.center - mid).dot(poly.normal) * poly.area
    if s < 0:
        me.flip_normals()
    attr = me.color_attributes.new('base', 'FLOAT_COLOR', 'CORNER')
    for poly in me.polygons:
        for li in poly.loop_indices:
            vi = me.loops[li].vertex_index
            k = vi // 4
            h = math.sin(PI * k / (m - 1))
            c = mix(colA, colB, h * h)
            attr.data[li].color = (*c, 1.0)
    return _smooth(o, 50)


@model('sol_prominence', ao=0.3)
def sol_prominence(v):
    """A CURTAIN of plasma standing on the photosphere: one sheet of fire
    hung between v1's outer and inner arches, its rims rounded by the two
    threads that bound it, graded from the dark-red feet to a hot crown and
    crossed by bright twisted strands, on two glowing footpoint mounds (the
    solid part). The second variant throws a little coronal rain off the top.
    Graded as ONE colour field, never striped, so it reads as a flame and
    not as a rainbow."""
    Z = SZ['prominence']
    parts = []
    for s_ in (-1, 1):
        foot = lathe([(Z * 0.44, 0.0), (Z * 0.44, Z * 0.06), (Z * 0.41, Z * 0.18), (Z * 0.34, Z * 0.3),
                      (Z * 0.22, Z * 0.39), (0.0, Z * 0.44)], color=S.photo, seg=20)
        paint(foot, S.photo, lambda p: mix(S.limb, lt(S.photo, 0.2), p.z / (Z * 0.44)))
        foot.data.transform(Matrix.Translation((s_ * Z * 0.95, 0, 0)))
        parts.append(foot)
    n = 24
    lo, hi = dk(S.plasma, 0.15), S.plasmaPl

    def heat(t):
        h = math.sin(t * PI)
        return mix(lo, hi, h ** 1.5)
    outer = arch_line(Z * 2.1, Z * 2.7, Z * 0.19, n, 0.45, 0.4 + v)
    inner = arch_line(Z * 1.3, Z * 1.9, Z * 0.12, n, 0.45, 0.4 + v)
    # ragged edges: the outer rim bulges and pinches like flame
    rr = random.Random(23 + v)
    ph = [rr.uniform(0, TAU) for _ in range(3)]
    for i in range(1, n):
        t = i / n
        k = 1 + 0.05 * math.sin(t * 17 + ph[0]) + 0.03 * math.sin(t * 29 + ph[1])
        c = Vector((0, Z * 0.1, 0))
        outer[i] = c + (outer[i] - c) * k
    for line, th in ((outer, Z * 0.15), (inner, Z * 0.1)):
        pts = [tuple(p) for p in line]
        pts[0] = (pts[0][0], -Z * 0.32, pts[0][2])
        pts[-1] = (pts[-1][0], -Z * 0.32, pts[-1][2])
        rad = [th * (0.8 + 0.25 * math.sin(PI * i / n)) for i in range(n + 1)]
        parts.append(place(sweep(pts, rad, lo, n=8, fn=heat)))
    sheet = curtain(outer, inner, Z * 0.07, lo, hi)
    parts.append(place(sheet))
    # bright strands twisting across the sheet, front and back
    for k in range(4):
        t0 = 0.18 + k * 0.21
        for side in (1, -1):
            pts = []
            for j in range(7):
                u = 0.08 + 0.84 * j / 6
                t = max(0.0, min(1.0, t0 + (u - 0.5) * 0.16 * side))
                f = t * n
                i0 = min(n - 1, int(f))
                w = f - i0
                po = outer[i0] * (1 - w) + outer[i0 + 1] * w
                pi_ = inner[i0] * (1 - w) + inner[i0 + 1] * w
                p = po * (1 - u) + pi_ * u
                pts.append(tuple(p + Vector((0, 0, side * Z * 0.075))))
            parts.append(place(sweep(pts, [Z * 0.018, Z * 0.035, Z * 0.042, Z * 0.045, Z * 0.042, Z * 0.035, Z * 0.018],
                                     S.plasmaPl, n=5, fn=lambda u: mix(S.plasmaPl, S.corona, math.sin(u * PI)))))
    if v:
        rnd = random.Random(17)
        for i in range(6):
            p = Vector(((rnd.random() - 0.5) * Z * 1.8, Z * (2.8 + rnd.random() * 0.5), (rnd.random() - 0.5) * Z * 0.6))
            r = Z * 0.11
            o = sphere(1.0, color=S.corona, seg=8, scale=(r * 0.85, r * 1.4, r * 0.85))
            paint(o, S.corona, lambda q: mix(S.corona, S.plasmaPl, max(0.0, q.y) / 1.4))
            o.data.transform(aim((p - Vector((0, Z * 1.5, 0))).normalized()))
            parts.append(place(o, tuple(p)))
    return parts


@model('sol_heliopause', ao=0.4)
def sol_heliopause(v):
    """Where the wind finally loses: one wide curved wall leaning back under
    the pressure with a lower dimmer one inside it, a dim body of field
    behind, the interstellar field combed across the side as bright threads,
    and the solar wind arriving over the top as one long pale arc."""
    Z = SZ['heliopause']
    parts = [egg(Z * 0.5 * 0.94, Z * 0.86 * 0.94, Z * 0.72 * 0.94, S.fieldDim, (0, Z * 0.86, 0), seg=16,
                 top=lt(S.fieldDim, 0.12), bottom=dk(S.fieldDim, 0.2))]
    R, H, span, bow, fall = Z * 0.95, Z * 1.85, 2.7, 0.2, 0.18
    outer = wall(R, H, span, Z * 0.04, S.field, bow=bow, seg=26, y0=0.0, fall=fall, sec=10, ripple=0.06, rph=v,
                 fn=lambda s, h: mix(lt(S.field, 0.18), S.field, abs(s) * 0.7 + (1 - h) * 0.3))
    inner = wall(Z * 0.72, Z * 1.5, 2.4, Z * 0.045, S.fieldDim, bow=0.24, seg=22, y0=Z * 0.1, fall=0.18, sec=8,
                 fn=lambda s, h: mix(S.fieldDim, lt(S.fieldDim, 0.25), h))
    parts += [place(outer), place(inner)]
    # the field draped over the outside of the wall, two long bright lines
    for f, col in ((0.34, S.aurora), (0.68, lt(S.field, 0.4))):
        pts = []
        for i in range(19):
            s_ = -0.92 + 1.84 * i / 18
            ph_ = span * 0.5 * s_
            y = H * (1 - fall * s_ * s_) * f + Z * 0.05 * math.sin(s_ * 5 + f * 7)
            r = R - bow * R * (y / H) ** 2 + Z * 0.045
            pts.append((r * math.sin(ph_), y, r * math.cos(ph_)))
        rad = [Z * 0.028 * (0.4 + 0.6 * math.sin(PI * i / 18)) for i in range(19)]
        parts.append(place(sweep(pts, rad, col, n=6)))
    # the interstellar field, combed across: v1's six thin ellipsoids, end to end
    for i in range(6):
        a = -1.0 + (i / 5) * 2.0
        c = Vector((Z * math.cos(a) * 0.86, Z * (0.5 + (i % 3) * 0.62), Z * math.sin(a) * 1.1))
        ax = (rot3(0.0, a, 1.35) @ Vector((0, Z * 0.62, 0, 0))).to_3d()
        pts = [tuple(c + ax * k) for k in (-1.0, -0.6, 0.0, 0.6, 1.0)]
        o = sweep(pts, [Z * 0.012, Z * 0.03, Z * 0.036, Z * 0.03, Z * 0.012], S.aurora, n=6,
                  fn=lambda t: mix(S.aurora, lt(S.aurora, 0.3), math.sin(t * PI)))
        parts.append(place(o))
    # the wind arriving over the top: three streams along v1's arc of puffs
    for k, (dy, dr, col) in enumerate(((0.0, 1.0, S.wind), (0.2, 0.86, S.aurora), (-0.18, 1.12, lt(S.wind, 0.2)))):
        pts, rad = [], []
        for i in range(11):
            a = -0.95 + (i / 10) * 1.9
            pts.append((Z * math.cos(a) * 0.56 * dr, Z * (2.0 + dy + math.cos(a * 2) * 0.36),
                        Z * math.sin(a) * 0.92 * dr))
            rad.append(Z * (0.07 - 0.012 * k) * (0.35 + 0.65 * math.sin(PI * i / 10)))
        parts.append(place(sweep(pts, rad, col, n=8, fn=lambda t, col=col: mix(lt(col, 0.3), col, abs(t - 0.5) * 2))))
    return parts


@model('sol_sun', ao=0.3)
def sol_sun(v):
    """The star: a big photosphere mottled with granulation (soft colour
    cells in v1's two tones), five active regions — a dark umbra in a ringed
    penumbra — four bright mounds of inner corona at the limb, and two small
    prominences arching off the edge. v1's own note stands: no corona disc,
    no spikes; this is what the Sun is at this budget."""
    Z = SZ['sun']
    rnd = random.Random(1392)
    cells = [surf(rnd.uniform(0, TAU), math.acos(rnd.uniform(-1, 1))) for _ in range(70)]
    tone = [rnd.choice((S.photoHot, lt(S.photo, 0.3), S.photo, S.photo, mix(S.photo, S.limb, 0.45))) for _ in cells]

    def gran(u):
        best = max(range(len(cells)), key=lambda i: u.dot(cells[i]))
        return tone[best]
    parts = [globe(Z, S.photo, seg=32, n=16, vfn=gran)]
    for i in range(5):
        d = surf(i * 1.9, 0.7 + (i % 3) * 0.6)
        rr = (0.07 + (i % 2) * 0.05) * 1.15
        pen = rr * 1.9
        parts.append(patch(Z, d, [(pen * 1.08, 0.996), (pen, 1.012), (rr * 1.05, 1.014), (rr * 0.9, 1.006),
                                  (0, 1.004)], S.penumbra, seg=12,
                           wob=lambda az, i=i: 1 + 0.08 * math.cos(3 * az + i),
                           fn=lambda th, az, rr=rr, pen=pen: (S.umbra if th < rr * 0.97 else
                                                              lt(S.penumbra, 0.2) if th > pen * 0.97 else None)))
    for i in range(4):
        d = surf((i / 4) * TAU + 0.3, 1.42 + (i % 2) * 0.18)
        parts.append(patch(Z, d, [(0.46, 0.998), (0.36, 1.03), (0.24, 1.075), (0.12, 1.1), (0.0, 1.11)],
                           mix(S.corona, S.photo, 0.35), seg=14,
                           wob=lambda az, i=i: 1 + 0.1 * math.cos(2 * az + i),
                           fn=lambda th, az: (S.corona if th < 0.24 else
                                              mix(S.corona, S.photo, 0.6) if th > 0.36 else None)))
    # two prominences at v1's sites on the limb, each a little cartoon flame:
    # three tapered tongues of plasma fanning off one root, flicking one way
    for k in range(2):
        a = 1.1 + k * 3.0
        nrm = Vector((math.cos(a), 0.3, math.sin(a))).normalized()
        east = Vector((0, 1, 0)).cross(nrm).normalized()
        flick = 1 if k == 0 else -1
        for (ang, ln, r0, c0, c1) in ((-0.5, 0.36, 0.085, S.limb, S.plasmaPl),
                                      (0.0, 0.62, 0.11, S.plasma, S.corona),
                                      (0.55, 0.3, 0.075, S.limb, S.plasmaPl)):
            dirv = (nrm * math.cos(ang) + east * math.sin(ang) * flick).normalized()
            base = nrm * Z * 0.9 + east * (Z * 0.08 * ang * flick)
            L_ = Z * ln
            pts, rad = [], []
            for j in range(8):
                u = j / 7
                q = base + dirv * (L_ * u) + east * (flick * L_ * 0.22 * math.sin(u * PI * 0.9) * u)
                pts.append(tuple(q))
                rad.append(Z * r0 * (1 - u) ** 0.8 + Z * 0.006)
            parts.append(sweep(pts, rad, c0, n=6, fn=lambda u, c0=c0, c1=c1: mix(c0, c1, u ** 1.2)))
    for o in parts:
        place(o, (0, Z, 0))
    return parts
