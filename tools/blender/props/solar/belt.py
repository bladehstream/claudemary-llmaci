"""Solar-stage props, the small bodies: dust, meteoroids, asteroids, comets,
the Kuiper belt, shepherd and small moons, the solar wind, centaurs, and the
cratered, icy and volcanic moons.

Frame reminder (see kit.py): Blender Z is up, X is the prop's width, and the
game's FRONT (+Z) is Blender -Y. v1 (src/world/props/solar.js) is authored in
the game frame, so a v1 point (x, y, z) lands here at (x, -z, y) — `gv()`.
Every dimension below is a multiple of v1's base size for that archetype
(SZ in solar.js), and every model is finally `fit()` to its catalogue box.

The look: premium toy rocks and moons. One smooth lumpy body per object
(an analytic shape, so decals can sit exactly on it), craters as crisp
shallow decals — a dark floor and a pale raised rim — frost and lava as flat
painted patches, rubble as chunky cut stones, and tails and streams as clean
tapered tubes. Nothing in this batch glows in v1, so nothing glows here.
"""
import math
import os
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


# The solar stage's own tin (S in src/world/props/solar.js), which the shared
# palette does not carry.
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

# v1's base sizes (SZ in solar.js)
SZ = dict(dust=0.00888, meteoroid=0.01162, zodiacal=0.01586, asteroid=0.01612, rubble=0.02735,
          comet=0.02215, kbo=0.03860, shepherd=0.04929, moonlet=0.06047, wind=0.10487,
          centaur=0.08201, moonCrater=0.08873, beltCluster=0.11635, moonIce=0.10518,
          moonVolcano=0.12423)

TAU = math.pi * 2


# ---------------------------------------------------------------- helpers

def L(col):
    return lin(col) if isinstance(col, int) else col


def dk(col, t=0.2):
    return mixc(L(col), (0, 0, 0), t)


def lt(col, t=0.4):
    return mixc(L(col), (1, 1, 1), t)


def gv(x, y, z):
    """A v1 (game-frame) point in the Blender frame."""
    return Vector((x, -z, y))


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
    """Scale the whole prop, per axis, about its footprint centre and its
    floor, so its bounding box is exactly the catalogue box. The raw layout
    follows v1's, so the stretch this applies is a few percent at most (the
    build prints RAW ratios so that stays checked)."""
    lo, hi = bounds(parts)
    want = target(pid, v)
    cx, cy = (lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2
    k = [want[i] / max(1e-9, hi[i] - lo[i]) for i in range(3)]
    if uniform:
        # a round moon stays round: one scale, balanced between the axes
        # (v1's boxes carry quirks of its primitives, e.g. crater discs
        # standing proud of the limb)
        u = math.sqrt(min(k) * max(k))
        k = [u, u, u]
    if os.environ.get('BELT_RAW'):
        print(f'MODEL-RAW {pid}__{v} stretch x{k[0]:.3f} y{k[1]:.3f} z{k[2]:.3f}')
    for o in parts:
        for vt in o.data.vertices:
            p = vt.co
            vt.co = Vector(((p.x - cx) * k[0], (p.y - cy) * k[1], (p.z - lo[2]) * k[2]))
        o.data.update()
    return parts


def paint_faces(obj, cols):
    """One colour per polygon, in creation order."""
    me = obj.data
    attr = me.color_attributes.get('base') or me.color_attributes.new('base', 'FLOAT_COLOR', 'CORNER')
    for poly, c in zip(me.polygons, cols):
        c = L(c)
        for li in poly.loop_indices:
            attr.data[li].color = (*c, 1.0)
    return obj


def perp(c):
    a = Vector((0, 0, 1)) if abs(c.z) < 0.9 else Vector((1, 0, 0))
    e1 = c.cross(a).normalized()
    return e1, c.cross(e1).normalized()


def sdir(a, e):
    """v1's surf(a, e): azimuth a, polar angle e from game +Y, as a Blender-frame unit vector."""
    se = math.sin(e)
    return gv(se * math.cos(a), math.cos(e), se * math.sin(a)).normalized()


def rand_dir(rnd, zmin=-1.0, zmax=1.0):
    z = rnd.uniform(zmin, zmax)
    a = rnd.uniform(0, TAU)
    s = math.sqrt(max(0.0, 1 - z * z))
    return Vector((s * math.cos(a), s * math.sin(a), z))


def spread_dirs(n, rnd, zmin=-0.85, zmax=0.95, mind=0.55):
    """n directions kept apart by at least `mind` (chord), so decals do not pile up."""
    out = []
    tries = 0
    while len(out) < n and tries < 4000:
        tries += 1
        d = rand_dir(rnd, zmin, zmax)
        if all((d - o).length > mind for o in out):
            out.append(d)
    return out


class Body:
    """A smooth lumpy body, defined analytically so decals can sit on it:

        point(d, h) = centre + scale * d * (rad(d) + h)

    `d` is a unit direction, `h` a lift in body radii. Lobes are soft bumps
    (a * max(0, d.n)^k) like v1's `lump()` welding blobs onto a core."""

    def __init__(self, centre, scale, lobes=(), dents=(), flats=(), soft=0.08):
        self.c = Vector(centre)
        self.s = Vector(scale)
        self.lobes = [(Vector(n).normalized(), a, k) for (n, a, k) in lobes]
        self.dents = [(Vector(n).normalized(), a, k) for (n, a, k) in dents]
        # soft planar facets: (normal, distance) � the body is clamped to
        # d.n * r <= distance with a rounded (soft-min) edge
        self.flats = [(Vector(n).normalized(), dd) for (n, dd) in flats]
        self.soft = soft

    def rad(self, d):
        r = 1.0
        for n, a, k in self.lobes:
            t = d.dot(n)
            if t > 0:
                r += a * t ** k
        for n, a, k in self.dents:
            t = d.dot(n)
            if t > 0:
                r -= a * t ** k
        for n, dd in self.flats:
            t = d.dot(n)
            if t > 0.05:
                cap = dd / t
                k = self.soft
                m = min(r, cap)
                r = m - k * math.log(math.exp((m - r) / k) + math.exp((m - cap) / k))
        return r

    def point(self, d, h=0.0):
        r = self.rad(d) + h
        return Vector((self.c.x + self.s.x * d.x * r, self.c.y + self.s.y * d.y * r,
                       self.c.z + self.s.z * d.z * r))

    def mesh(self, n, color, tone=None):
        """A cube-sphere of n x n cells a face (12 n^2 triangles), even all
        over with no poles. tone(d) -> linear rgb paints it per vertex."""
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=2.0)
        bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=n - 1, use_grid_fill=True)
        q = math.pi / 4
        for vt in bm.verts:
            p = vt.co
            d = Vector((math.tan(p.x * q), math.tan(p.y * q), math.tan(p.z * q))).normalized()
            vt.co = self.point(d)
        o = _from_bmesh(bm, 'body')
        if tone is None:
            paint(o, color)
        else:
            inv = self

            def fn(p):
                rel = p - inv.c
                return tone(Vector((rel.x / inv.s.x, rel.y / inv.s.y, rel.z / inv.s.z)).normalized())
            paint(o, color, fn)
        return _smooth(o, 80)


def lump_body(Z, rnd, lobes=4, amp=(0.16, 0.26), centre=None, scale=(1.0, 0.92, 0.84),
              flats=0, flat=(0.8, 0.92), soft=0.06):
    """v1's `lump()`: a squashed core (Z, 0.84Z, 0.92Z) with soft lobes."""
    lb = []
    for i in range(lobes):
        a = (i / lobes) * TAU + rnd.uniform(0, 0.7)
        e = rnd.uniform(-0.45, 0.6)
        n = Vector((math.cos(a) * math.cos(e), math.sin(a) * math.cos(e), math.sin(e)))
        lb.append((n, rnd.uniform(*amp), rnd.choice((2, 3, 4))))
    dn = [(rand_dir(rnd, -0.6, 0.8), rnd.uniform(0.05, 0.1), 3) for _ in range(2)]
    fl = [(rand_dir(rnd, -0.8, 0.8), rnd.uniform(*flat)) for _ in range(flats)]
    c = centre if centre is not None else (0, 0, Z * scale[2])
    return Body(c, (Z * scale[0], Z * scale[1], Z * scale[2]), lb, dn, fl, soft)


def decal(body, c, rho, prof, cols, seg=14, wob=None):
    """A patch lying on the body around direction c, `rho` radians across to
    t = 1. prof = [(t, h), ...] from the centre (t = 0) outwards, h a lift in
    body radii; cols = one colour per band (len(prof) - 1). The last ring
    should dip under the surface (h < 0) so the patch has no visible edge.
    wob(angle) -> factor makes the outline irregular."""
    c = Vector(c).normalized()
    e1, e2 = perp(c)
    bm = bmesh.new()
    rings = []
    for k, (t, h) in enumerate(prof):
        if t <= 1e-9:
            rings.append([bm.verts.new(body.point(c, h))])
            continue
        ring = []
        for j in range(seg):
            a = TAU * j / seg
            ang = t * rho * (wob(a) if wob else 1.0)
            d = (c * math.cos(ang) + (e1 * math.cos(a) + e2 * math.sin(a)) * math.sin(ang)).normalized()
            ring.append(bm.verts.new(body.point(d, h)))
        rings.append(ring)
    fcols = []
    for k in range(len(rings) - 1):
        a, b = rings[k], rings[k + 1]
        if len(a) == 1:
            for j in range(seg):
                bm.faces.new((a[0], b[j], b[(j + 1) % seg]))
                fcols.append(cols[k])
        else:
            for j in range(seg):
                bm.faces.new((a[j], b[j], b[(j + 1) % seg], a[(j + 1) % seg]))
                fcols.append(cols[k])
    o = _from_bmesh(bm, 'decal')
    o.data.update()
    # outward normals: the first face should point away from the body centre
    poly = o.data.polygons[0]
    if poly.normal.dot(poly.center - body.c) < 0:
        o.data.flip_normals()
    paint_faces(o, fcols)
    return _smooth(o, 70)


CRATER = [(0.0, 0.004), (0.55, 0.004), (0.85, 0.034), (1.0, 0.028), (1.25, -0.02)]


def crater(body, c, rho, floor, rim, seg=14, depth=1.0):
    """A crater decal: a dark floor, a raised pale rim, sunk at its edge."""
    prof = [(t, h * depth if h > 0.005 else h) for (t, h) in CRATER]
    wall = mixc(L(floor), L(rim), 0.45)
    return decal(body, c, rho, prof, [floor, wall, rim, rim], seg)


def patch(body, c, rho, col, seg=14, wob=None, lift=0.008):
    """A flat painted patch (frost, lava, a dark plain)."""
    prof = [(0.0, lift), (0.86, lift), (1.0, lift * 0.4), (1.12, -0.02)]
    return decal(body, c, rho, prof, [col, col, col], seg, wob)


def cut_stone(seed, sub=3, cuts=6, depth=(0.72, 0.86), wobble=0.07, special=None, bev=0.07, bseg=2,
              scale=(1, 1, 1), at=(0, 0, 0), rot=(0, 0, 0), color=0x888888, cap=None, under=None, bang=30):
    """A stone sawn flat by a few planes (real cuts, filled, then bevelled),
    the house style's chunky cut stone. `special` = (normal, distance) adds
    one more cut painted `cap`. Built at radius 1, then scaled/rotated/moved."""
    rnd = random.Random(seed)
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=1.0)
    ph = rnd.uniform(0, 6)
    for vt in bm.verts:
        p = vt.co
        vt.co = p * (1 + wobble * math.sin(3 * p.x + ph) * math.cos(2 * p.y - ph) + wobble * 0.6 * math.sin(4 * p.z + ph))
    planes = []
    for i in range(cuts):
        a = i / cuts * TAU + rnd.uniform(0, TAU / cuts)
        n = Vector((math.cos(a), math.sin(a), rnd.uniform(-0.9, 0.9))).normalized()
        planes.append((n, rnd.uniform(*depth)))
    if special is not None:
        planes.append((Vector(special[0]).normalized(), special[1]))
    for n, d in planes:
        geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
        res = bmesh.ops.bisect_plane(bm, geom=geom, dist=1e-7, plane_co=n * d, plane_no=n, clear_outer=True)
        cut = [e for e in res['geom_cut'] if isinstance(e, bmesh.types.BMEdge)]
        if cut:
            bmesh.ops.holes_fill(bm, edges=cut, sides=0)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = _from_bmesh(bm, 'stone')
    if bev > 0:
        _bevel(o, bev, bseg, angle=bang)
    paint(o, color)
    if special is not None and cap is not None:
        sn, sd = Vector(special[0]).normalized(), special[1]
        recolor(o, lambda c, nn: cap if nn.dot(sn) > 0.96 and c.dot(sn) > sd - 0.01 else None)
    if under is not None:
        recolor(o, lambda c, nn: under if nn.z < -0.6 else None)
    m = Euler(tuple(math.radians(a) for a in rot), 'XYZ').to_matrix()
    deform(o, lambda p: m @ Vector((p.x * scale[0], p.y * scale[1], p.z * scale[2])) + Vector(at))
    return _smooth(o, 45)


def frames(pts):
    """Tangent / side / up frames along a polyline (up kept near +Z)."""
    out = []
    n = len(pts)
    for i in range(n):
        a = pts[max(0, i - 1)]
        b = pts[min(n - 1, i + 1)]
        T = (Vector(b) - Vector(a)).normalized()
        U = Vector((0, 0, 1))
        U = (U - T * U.dot(T))
        if U.length < 1e-6:
            U = Vector((0, 1, 0)) - T * T.y
        U.normalize()
        Sd = T.cross(U).normalized()
        out.append((T, Sd, U))
    return out


def sweep(pts, rfn, color, seg=10, sx=1.0, sy=1.0, colfn=None, ups=None, caps=2):
    """A closed tapered tube along pts: radius rfn(t) (t = 0..1 along), the
    section an ellipse sx (side) by sy (up). Rounded ends of `caps` rings.
    colfn(t) -> colour per ring band. ups: optional per-point up vectors."""
    P = [Vector(p) for p in pts]
    n = len(P)
    fr = frames(P)
    if ups is not None:
        fr2 = []
        for (T, Sd, U), up in zip(fr, ups):
            U = Vector(up) - T * Vector(up).dot(T)
            U.normalize()
            fr2.append((T, T.cross(U).normalized(), U))
        fr = fr2
    # rings: (centre, radius, frame, t)
    rings = []
    T0, S0, U0 = fr[0]
    r0 = rfn(0.0)
    for k in range(caps, 0, -1):
        a = (math.pi / 2) * k / (caps + 0.0)
        rings.append((P[0] - T0 * r0 * math.sin(a) * 0.9, r0 * math.cos(a), fr[0], 0.0))
    for i in range(n):
        t = i / (n - 1)
        rings.append((P[i], rfn(t), fr[i], t))
    T1, S1, U1 = fr[-1]
    r1 = rfn(1.0)
    for k in range(1, caps + 1):
        a = (math.pi / 2) * k / (caps + 0.0)
        rings.append((P[-1] + T1 * r1 * math.sin(a) * 0.9, r1 * math.cos(a), fr[-1], 1.0))
    bm = bmesh.new()
    vr = []
    for (p, r, (T, Sd, U), t) in rings:
        if r < 1e-7:
            vr.append([bm.verts.new(p)])
            continue
        ring = []
        for j in range(seg):
            a = TAU * j / seg
            ring.append(bm.verts.new(p + Sd * (math.cos(a) * r * sx) + U * (math.sin(a) * r * sy)))
        vr.append(ring)
    fcols = []
    for k in range(len(vr) - 1):
        a, b = vr[k], vr[k + 1]
        t = (rings[k][3] + rings[k + 1][3]) / 2
        c = colfn(t) if colfn else color
        if len(a) == 1 and len(b) == 1:
            continue
        if len(a) == 1:
            for j in range(seg):
                bm.faces.new((a[0], b[(j + 1) % seg], b[j]))
                fcols.append(c)
        elif len(b) == 1:
            for j in range(seg):
                bm.faces.new((a[j], a[(j + 1) % seg], b[0]))
                fcols.append(c)
        else:
            for j in range(seg):
                bm.faces.new((a[j], a[(j + 1) % seg], b[(j + 1) % seg], b[j]))
                fcols.append(c)
    if len(vr[0]) > 1:
        bm.faces.new(list(reversed(vr[0])))
        fcols.append(colfn(0.0) if colfn else color)
    if len(vr[-1]) > 1:
        bm.faces.new(vr[-1])
        fcols.append(colfn(1.0) if colfn else color)
    o = _from_bmesh(bm, 'sweep')
    o.data.update()
    # make the normals point out of the tube
    mid = len(o.data.polygons) // 2
    poly = o.data.polygons[mid]
    k = min(len(rings) - 1, max(0, mid // seg))
    if poly.normal.dot(poly.center - rings[k][0]) < 0:
        o.data.flip_normals()
    paint_faces(o, fcols)
    return _smooth(o, 70)


def ball(r, at, color, seg=16, scale=(1, 1, 1), rot=(0, 0, 0), rings=None):
    """A sphere; `rings` overrides kit.sphere's minimum of six rings, for
    small beads and billows that need fewer."""
    if rings is None:
        return sphere(r, at=tuple(at), color=L(color), seg=seg, scale=scale, rot=rot)
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=r)
    o = _from_bmesh(bm, 'ball')
    _place(o, tuple(at), rot, scale)
    paint(o, L(color))
    return _smooth(o, 80)


def rng(pid, v):
    return random.Random(f'{pid}:{v}')


# ================================================================= DUST AND DEBRIS

# A dust grain: a fluffy aggregate, one rounded grain with smaller grains
# stuck to it, the pale nodule (v1's second ellipsoid) up and to the right.
@model('sol_dust', ao=0.65)
def sol_dust(v):
    Z = SZ['dust']
    rnd = rng('sol_dust', v)
    col = [S.dust, S.dustPale, S.rockDk][v]
    body = lump_body(Z, rnd, lobes=3, amp=(0.18, 0.3), scale=(1.0, 0.78, 0.8), flats=2)
    parts = [body.mesh(6, col, tone=lambda d: mixc(L(col), lt(col, 0.2), max(0.0, d.z) * 0.6))]
    pale = lt(S.dustPale, 0.25) if v != 1 else lt(S.dustPale, 0.45)
    parts.append(ball(Z * 0.45, gv(Z * 0.35, Z * 0.98, -Z * 0.2), pale, seg=12, scale=(1.0, 0.95, 0.8)))
    # little grains welded on round the waist
    for a, e, s in ((2.2, 0.2, 0.26), (3.9, -0.15, 0.22), (5.3, 0.35, 0.2)):
        d = Vector((math.cos(a) * math.cos(e), math.sin(a) * math.cos(e), math.sin(e)))
        parts.append(ball(Z * s, body.point(d, -0.05), dk(col, 0.3) if v != 2 else lt(col, 0.3), seg=8))
    return fit(parts, 'sol_dust', v)


# A meteoroid: a chunk of stone sawn flat on top, the cut face bare polished
# metal (v1's steel disc), which is what most of them are.
@model('sol_meteoroid', ao=0.6)
def sol_meteoroid(v):
    Z = SZ['meteoroid']
    col = [S.rock, S.basalt, S.rockDk][v]
    mn = gv(0.3, 0.9, 0.2)
    o = cut_stone(f'met{v}', sub=3, cuts=5, depth=(0.74, 0.86), special=(mn, 0.66), bev=0.07,
                  scale=(Z, Z * 0.92, Z * 0.84), at=(0, 0, Z * 0.84), color=col,
                  cap=mixc(lin(C.steelDark), lin(C.steel), 0.45), under=dk(col, 0.18))
    return fit([o], 'sol_meteoroid', v)


@model('sol_asteroid', ao=0.6)
def sol_asteroid(v):
    Z = SZ['asteroid']
    rnd = rng('sol_asteroid', v)
    col = [S.rock, S.rockDk, S.basalt, S.rust][v]
    body = lump_body(Z, rnd, lobes=4, amp=(0.2, 0.34), flats=3, flat=(0.78, 0.9))
    parts = [body.mesh(8, col, tone=lambda d: mixc(L(col), dk(col, 0.2), max(0.0, -d.z) * 0.7))]
    floor = mixc(L(col), L(S.crater), 0.7)
    rim = mixc(L(col), L(S.rockLt), 0.55)
    for i, d in enumerate(spread_dirs(5, rnd, -0.3, 0.95, 0.65)):
        parts.append(crater(body, d, [0.46, 0.34, 0.27, 0.22, 0.2][i], floor, rim, seg=12))
    return fit(parts, 'sol_asteroid', v)


# A zodiacal dust clump: eleven grains loosely held together, v1's layout
# grain for grain, each a small lumpy pebble in one of the two dust tones.
@model('sol_zodiacal', ao=0.5)
def sol_zodiacal(v):
    Z = SZ['zodiacal']
    rnd = rng('sol_zodiacal', v)
    parts = []
    for i in range(11):
        a = (i / 11) * TAU + v
        d = Z * (0.2 + ((i * 5) % 7) * 0.11)
        r = Z * (0.12 + (i % 3) * 0.05)
        at = gv(math.cos(a) * d, Z * (0.3 + ((i * 3) % 5) * 0.28), math.sin(a) * d * 0.88)
        col = lt(S.dustPale, 0.3) if i % 2 else dk(S.dust, 0.1)
        b = lump_body(r, rnd, lobes=3, amp=(0.15, 0.3), centre=at, scale=(1.0, 0.9, 0.85))
        parts.append(b.mesh(3, col, tone=lambda dd, c=col: mixc(L(c), lt(c, 0.25), max(0.0, dd.z) * 0.8)))
    return fit(parts, 'sol_zodiacal', v)


def boulder_heap(pid, v, Z, n, cols, place, sub=1, cuts=4, bev=0.12, bang=50):
    """v1's heaps: n stones on a golden-angle spiral, each a chunky cut stone."""
    parts = []
    for i in range(n):
        (rx, ry, rz), at, ry_rad = place(i)
        col = cols[i % len(cols)]
        parts.append(cut_stone(f'{pid}{v}:{i}', sub=sub, cuts=cuts, depth=(0.5, 0.75), wobble=0.1, bev=bev, bseg=1, bang=bang,
                               scale=(rx, rz, ry), at=at, rot=(0, 0, math.degrees(-ry_rad)),
                               color=col, under=dk(col, 0.15)))
    return parts


# A rubble pile: a loose heap of cut stones in three tones, piled into a mound.
@model('sol_rubble', ao=0.7)
def sol_rubble(v):
    Z = SZ['rubble']

    def place(i):
        a = i * 2.399963 + v
        t = i / 12
        d = Z * 0.72 * (1 - t * 0.75)
        rad = (Z * (0.3 - t * 0.12) * 1.05, Z * (0.26 - t * 0.1) * 1.05, Z * (0.28 - t * 0.11) * 1.05)
        return rad, gv(math.cos(a) * d, Z * (0.24 + t * 0.9), math.sin(a) * d * 0.9), a
    parts = boulder_heap("rub", v, Z, 12, [S.rockLt, S.rock, S.rockDk], place, cuts=3)
    return fit(parts, 'sol_rubble', v)


# A comet: a dark lumpy nucleus with bright ice showing through, an ION tail
# straight, thin and blue blown dead away from the star (-X), and a broader
# warmer DUST tail curving off toward the front, as v1 lays them.
@model('sol_comet', ao=0.45)
def sol_comet(v):
    Z = SZ['comet']
    rnd = rng('sol_comet', v)
    body = lump_body(Z, rnd, lobes=3, amp=(0.18, 0.3), flats=1)
    parts = [body.mesh(6, S.crater, tone=lambda d: mixc(L(S.crater), L(S.basalt), max(0.0, -d.x) * 0.8))]
    # the ice: a bright sunward cap and a couple of frost patches
    parts.append(patch(body, Vector((0.8, -0.2, 0.5)), 0.9, S.icePale, seg=14,
                       wob=lambda a: 1 + 0.1 * math.sin(2 * a + v) + 0.05 * math.sin(3 * a)))
    for d, r in ((Vector((-0.2, -0.9, 0.3)), 0.35), (Vector((0.1, 0.85, 0.45)), 0.3)):
        parts.append(patch(body, d, r, S.ice, seg=12, wob=lambda a: 1 + 0.12 * math.sin(2 * a + 1)))
    # ion tail
    n = 8
    pts = [Vector((-Z * (0.3 + 5.95 * t), 0.0, Z * (1.0 + 0.24 * t))) for t in (i / (n - 1) for i in range(n))]
    ion = sweep(pts, lambda t: Z * (0.25 - 0.13 * t), S.wind, seg=8,
                colfn=lambda t: mixc(L(S.wind), lt(S.wind, 0.45), t))
    parts.append(ion)
    # dust tail: broader, flatter, curving to the front (Blender -Y)
    pts = []
    n = 10
    for i in range(n):
        t = i / (n - 1)
        x = -Z * (0.3 + 3.6 * t)
        y = -Z * (0.1 + 1.25 * t ** 1.5)
        pts.append(Vector((x, y, Z * (0.88 + 0.08 * t))))
    dust = sweep(pts, lambda t: Z * (0.32 + 0.2 * t), S.ammonia, seg=10, sx=1.3, sy=0.6,
                 colfn=lambda t: mixc(L(S.ammonia), L(S.ice), t))
    parts.append(dust)
    return fit(parts, 'sol_comet', v)


# ================================================================= SMALL BODIES AND MOONS

# A Kuiper belt object: tholin-red, with frost lying in the low ground.
@model('sol_kbo', ao=0.6)
def sol_kbo(v):
    Z = SZ['kbo']
    rnd = rng('sol_kbo', v)
    col = [S.rust, S.rustDk, S.crater][v]
    body = lump_body(Z, rnd, lobes=4, amp=(0.18, 0.3), flats=2)
    under = mixc(L(col), L(S.basalt), 0.45)
    parts = [body.mesh(8, col, tone=lambda d: mixc(L(col), under, max(0.0, -d.z) * 0.6))]
    for i, d in enumerate(spread_dirs(5, rnd, -0.2, 0.95, 0.65)):
        parts.append(patch(body, d, rnd.uniform(0.22, 0.36), S.icePale if i % 2 == 0 else S.ice, seg=14,
                           wob=lambda a, ph=rnd.uniform(0, 6): 1 + 0.14 * math.sin(2 * a + ph) + 0.07 * math.sin(3 * a)))
    floor = mixc(L(col), L(S.basalt), 0.6)
    for d in spread_dirs(2, rnd, -0.5, 0.6, 0.9):
        parts.append(crater(body, d, 0.22, floor, lt(col, 0.15), seg=10))
    return fit(parts, 'sol_kbo', v)


# A shepherd moon: an icy potato keeping a ringlet in line, with the ringlet's
# grains trailing it in a lifted arc (v1's eight grains).
@model('sol_shepherd', ao=0.55)
def sol_shepherd(v):
    Z = SZ['shepherd']
    rnd = rng('sol_shepherd', v)
    body = Body((0, 0, Z * 0.7), (Z, Z * 0.78, Z * 0.7),
                lobes=[(gv(0.8, 0.35, 0.25), 0.28, 3), (gv(-0.6, 0.1, -0.5), 0.12, 2)],
                flats=[(gv(-0.3, -0.8, 0.4), 0.82), (gv(0.2, 0.5, -0.9), 0.85)])
    parts = [body.mesh(7, S.icePale, tone=lambda d: mixc(L(S.icePale), L(S.ice), max(0.0, -d.z) * 0.9 + 0.1))]
    floor = mixc(L(S.iceShadow), L(S.ice), 0.25)
    for i, d in enumerate(spread_dirs(3, rnd, -0.1, 0.9, 0.8)):
        parts.append(crater(body, d, [0.34, 0.26, 0.2][i], floor, S.icePale, seg=12))
    # the ringlet: a thin flat ribbon of ice arcing up and away, grains on it
    n = 10
    pts = []
    for i in range(n):
        t = i / (n - 1)
        pts.append(gv(Z * (-0.75 - 0.75 * t), Z * (0.45 + 1.1 * t), Z * math.sin(t * 3 + v) * 0.4))
    parts.append(sweep(pts, lambda t: Z * (0.075 - 0.03 * t), S.ice, seg=6, sx=1.8, sy=0.55,
                       colfn=lambda t: mixc(L(S.ice), L(S.dustPale), 0.25 + 0.4 * t)))
    for i in range(8):
        t = i / 7
        at = gv(Z * (-0.9 - 0.6 * t), Z * (0.5 + 1.05 * t), Z * math.sin(t * 3 + v) * 0.4)
        parts.append(ball(Z * (0.12 - 0.03 * t), at, S.ice if i % 2 else S.dustPale, seg=8, rings=4))
    return fit(parts, 'sol_shepherd', v)


def moon_lump(pid, v, Z, col, rnd, ncr, floor, rim, n=9):
    body = lump_body(Z, rnd, lobes=4, amp=(0.14, 0.24), flats=2, flat=(0.84, 0.94))
    parts = [body.mesh(n, col, tone=lambda d: mixc(L(col), dk(col, 0.18), max(0.0, -d.z) * 0.7))]
    sizes = [0.42, 0.34, 0.28, 0.24, 0.2, 0.17, 0.15, 0.14]
    for i, d in enumerate(spread_dirs(ncr, rnd, -0.4, 0.95, 0.6)):
        parts.append(crater(body, d, sizes[i % len(sizes)], floor, rim, seg=14 if i < 2 else 11))
    return body, parts


# A small moon: v1's lump, well cratered.
@model('sol_moonlet', ao=0.6)
def sol_moonlet(v):
    Z = SZ['moonlet']
    rnd = rng('sol_moonlet', v)
    col = [S.regolith, S.rock, S.icePale][v]
    floor = mixc(L(col), L(S.crater), 0.6) if v < 2 else mixc(L(S.iceShadow), L(col), 0.35)
    rim = mixc(L(col), L(S.rockLt), 0.5) if v < 2 else L(S.icePale)
    body, parts = moon_lump('sol_moonlet', v, Z, col, rnd, 6, floor, rim)
    return fit(parts, 'sol_moonlet', v)


# The solar wind: a stream of charged gas curling as the star turns under it
# (the Parker spiral), with the frozen-in field wound round it as a helix,
# leaving a bright corona knot (-X) through a dim core (v1's solid body).
@model('sol_wind', ao=0.35, ao_dist=0.03)
def sol_wind(v):
    Z = SZ['wind']
    parts = [ball(Z * 0.43, (0, 0, Z * 0.5), S.windDim, seg=20)]
    n = 18

    def spine(t):
        a = -0.5 + t * 1.15
        return gv(Z * (-1.2 + t * 5.25), Z * (0.5 + math.sin(t * 3 + v) * 0.22), Z * (math.sin(a) * 1.3 - 0.4))
    # from the corona knot (-1.5Z) out past v1's last blob
    pts = [spine(-0.05 + 1.07 * i / (n - 1)) for i in range(n)]

    def rr(t):
        return Z * (0.2 - 0.095 * t)
    parts.append(sweep(pts, rr, S.wind, seg=10, sx=0.85,
                       colfn=lambda t: mixc(L(S.wind), lt(S.wind, 0.35), t)))
    # two thinner streamlines wound loosely round it, fanning apart as the
    # wind expands outward � flow, not a rod
    fr = frames(pts)
    for j, col in ((0, lt(S.wind, 0.4)), (1, S.windDim)):
        line = []
        m = 26
        for i in range(m):
            t = i / (m - 1)
            k = min(n - 2, int(t * (n - 1)))
            f = t * (n - 1) - k
            c = pts[k].lerp(pts[k + 1], f)
            T, Sd, U = fr[k]
            ang = j * math.pi + t * TAU * 1.3 + v
            rad = rr(t) * (1.15 + 1.4 * t)
            line.append(c + Sd * math.cos(ang) * rad + U * math.sin(ang) * rad * 0.55)
        parts.append(sweep(line[1:], lambda t: Z * (0.055 - 0.025 * t), col, seg=6, caps=1))
    parts.append(ball(Z * 0.24, pts[0] + Vector((-Z * 0.05, 0, 0)), S.corona, seg=14))
    return fit(parts, 'sol_wind', v)


# A centaur: half asteroid, half comet — a cratered lump with little ammonia
# puffs breaking off it on short jets.
@model('sol_centaur', ao=0.6)
def sol_centaur(v):
    Z = SZ['centaur']
    rnd = rng('sol_centaur', v)
    col = S.rust if v else S.regolith
    floor = mixc(L(col), L(S.crater), 0.6)
    rim = mixc(L(col), L(S.dustPale), 0.5)
    body = lump_body(Z, rnd, lobes=4, amp=(0.1, 0.18), flats=2, flat=(0.84, 0.94))
    parts = [body.mesh(8, col, tone=lambda d: mixc(L(col), dk(col, 0.18), max(0.0, -d.z) * 0.7))]
    for i, d in enumerate(spread_dirs(3, rnd, -0.5, 0.3, 0.8)):
        parts.append(crater(body, d, [0.42, 0.32, 0.25][i], floor, rim, seg=12))
    # six vents round the shoulders, each breathing out a tuft of ammonia
    # ice that rises and thins: v1's six puffs, sat on the body
    up = Vector((0, 0, 1))
    for i in range(6):
        a = (i / 6) * TAU + v
        e = math.radians(48 + (i % 3) * 11)
        d = Vector((math.cos(-a) * math.cos(e), math.sin(-a) * math.cos(e), math.sin(e)))
        tang = up.cross(d).normalized()
        base = body.point(d, 0.12) + up * Z * (0.06 + 0.12 * (i % 3))
        parts.append(ball(Z * 0.18, base, S.ammonia, seg=10, rings=5, scale=(1, 1, 0.9)))
        parts.append(ball(Z * 0.13, base + tang * Z * 0.12 + up * Z * 0.12, mixc(L(S.ammonia), L(S.icePale), 0.6),
                          seg=10, rings=5))
    return fit(parts, 'sol_centaur', v)


def round_body(Z, rnd, amp=0.04):
    """A moon: round, with only the faintest unevenness."""
    lb = [(rand_dir(rnd), rnd.uniform(0.5, 1.0) * amp, 2) for _ in range(3)]
    return Body((0, 0, Z), (Z, Z, Z), lb)


# A cratered moon: a round grey ball pitted all over, and one great basin
# with a central peak, because they all have one.
@model('sol_moon_crater', ao=0.6)
def sol_moon_crater(v):
    Z = SZ['moonCrater']
    rnd = rng('sol_moon_crater', v)
    col = [S.regolith, S.rockLt, S.dustPale][v]
    body = round_body(Z, rnd)
    parts = [body.mesh(9, col, tone=lambda d: mixc(L(col), dk(col, 0.1), max(0.0, -d.z) * 0.6))]
    bd = sdir(1.1 + v, 1.0)
    floor = mixc(L(col), L(S.crater), 0.62)
    rim = mixc(L(col), L(S.rockLt), 0.55) if v != 1 else lt(col, 0.2)
    # the great basin: dark lava-filled floor, a broad pale rim, a central peak
    mare = mixc(L(S.basalt), L(col), 0.08)
    parts.append(decal(body, bd, 0.55, [(0, 0.004), (0.8, 0.004), (0.92, 0.014), (1.0, 0.012), (1.15, -0.02)],
                       [mare, mixc(mare, L(rim), 0.5), rim, rim], seg=20,
                       wob=lambda a: 1 + 0.1 * math.sin(3 * a + v) + 0.05 * math.sin(5 * a + 2 * v)))
    e1, e2 = perp(bd)
    m = Matrix((e1, e2, bd)).transposed()
    peak = lathe([(0.0, 0.0), (0.12, 0.0), (0.09, 0.03), (0.045, 0.07), (0.0, 0.085)], color=mixc(L(col), mare, 0.3), seg=14)
    base = body.point(bd, 0.0)
    deform(peak, lambda p: m @ (p * Z) + base)
    parts.append(peak)
    dirs = [d for d in spread_dirs(16, rnd, -0.9, 0.95, 0.45) if d.dot(bd) < 0.55][:9]
    sizes = [0.3, 0.26, 0.22, 0.2, 0.18, 0.16, 0.14, 0.12, 0.11]
    for i, d in enumerate(dirs):
        parts.append(crater(body, d, sizes[i], floor, rim, seg=12 if i < 4 else 10))
    return fit(parts, 'sol_moon_crater', v, uniform=True)


# An asteroid-belt cluster: the fragments of one break-up drifting together,
# heaped upward (v1's spiral), chunky cut stones in three tones.
@model('sol_beltcluster', ao=0.6)
def sol_beltcluster(v):
    Z = SZ['beltCluster']

    def place(i):
        a = i * 2.399963 + v * 0.8
        t = i / 14
        d = Z * (0.85 - t * 0.6)
        rad = (Z * (0.26 - t * 0.1), Z * (0.22 - t * 0.08), Z * (0.24 - t * 0.09))
        return rad, gv(math.cos(a) * d, Z * (0.22 + t * 1.5), math.sin(a) * d * 0.86), a
    parts = boulder_heap('bc', v, Z, 14, [S.rock, S.rockDk, S.rockLt], place, cuts=3, bev=0.1)
    return fit(parts, 'sol_beltcluster', v)


# An ice moon: smooth pale ice, no craters but a network of dark fractures
# (lineae) where the shell has pulled apart, a dark polar cap, and on two of
# the three a geyser standing off the pole.
@model('sol_moon_ice', ao=0.5)
def sol_moon_ice(v):
    Z = SZ['moonIce']
    rnd = rng('sol_moon_ice', v)
    col = [S.icePale, S.ice, S.iceDeep][v]
    body = round_body(Z, rnd, 0.02)
    deep = mixc(L(col), L(S.iceDeep), 0.5)
    parts = [body.mesh(8, col, tone=lambda d: mixc(L(col), deep, max(0.0, -d.z) * 0.7))]
    for i in range(7):
        c0 = rand_dir(rnd, -0.75, 0.75)
        e1, e2 = perp(c0)
        b = rnd.uniform(0, TAU)
        ax = e1 * math.cos(b) + e2 * math.sin(b)
        pts, ups = [], []
        span = rnd.uniform(0.9, 1.5)
        ph = rnd.uniform(0, 6)
        for k in range(8):
            t = k / 7
            ang = (t - 0.5) * span
            d = (c0 * math.cos(ang) + ax * math.sin(ang))
            side = d.cross(ax).normalized()
            d = (d + side * 0.08 * math.sin(t * 7 + ph)).normalized()
            pts.append(body.point(d, 0.004))
            ups.append(d)
        parts.append(sweep(pts, lambda t: Z * 0.04 * (0.55 + 0.45 * math.sin(math.pi * t)),
                           S.frostDk if i % 2 else S.iceShadow, seg=4, sx=1.0, sy=0.45, ups=ups, caps=1))
    up = Vector((0, 0, 1))
    parts.append(patch(body, up, 0.36, S.frostDk, seg=16, wob=lambda a: 1 + 0.12 * math.sin(4 * a + v)))
    if v != 1:
        # the geyser: a slim jet that swells and rounds off, like a flame
        top = body.point(up, -0.02)
        jet = lathe([(0.03, 0.0), (0.045, 0.1), (0.075, 0.22), (0.1, 0.33), (0.105, 0.4), (0.08, 0.46),
                     (0.035, 0.49), (0.0, 0.5)], color=S.ammonia, seg=12, smooth=70)
        paint(jet, S.ammonia, lambda p: mixc(L(S.ammonia), L(S.icePale), min(1.0, max(0.0, (p.z - 0.15) / 0.3))))
        deform(jet, lambda p: p * Z + top)
        parts.append(jet)
    return fit(parts, 'sol_moon_ice', v, uniform=True)


# A volcanic moon: sulphur-yellow, spotted with black calderas ringed in lava,
# and one volcano with its plume caught in the act — a column that opens into
# an umbrella, as they do.
@model('sol_moon_volcano', ao=0.55)
def sol_moon_volcano(v):
    Z = SZ['moonVolcano']
    rnd = rng('sol_moon_volcano', v)
    body = round_body(Z, rnd, 0.03)
    sul = S.sulfur
    low = mixc(L(sul), L(S.rust), 0.35)
    parts = [body.mesh(8, sul, tone=lambda d: mixc(L(sul), low, max(0.0, -d.z) * 0.8))]
    pd = sdir(0.8 + v * 2, 0.75)
    dirs = [d for d in spread_dirs(14, rnd, -0.9, 0.95, 0.5) if d.dot(pd) < 0.8][:8]
    for i, d in enumerate(dirs):
        rho = 0.14 + rnd.uniform(0, 0.2)
        wob = (lambda a, ph=rnd.uniform(0, 6): 1 + 0.18 * math.sin(3 * a + ph) + 0.08 * math.sin(5 * a + ph))
        if i % 3:
            # black caldera with a thin ring of lava round it
            parts.append(decal(body, d, rho, [(0, 0.006), (0.72, 0.006), (1.0, 0.007), (1.12, -0.02)],
                               [S.ash, S.lava, S.lava], seg=10, wob=wob))
        else:
            parts.append(patch(body, d, rho * 0.8, S.lava if i % 2 == 0 else S.rust, seg=10, wob=wob))
    # the volcano
    e1, e2 = perp(pd)
    m = Matrix((e1, e2, pd)).transposed()
    base = body.point(pd, -0.03)
    cone = lathe([(0.0, 0.0), (0.27, 0.0), (0.2, 0.06), (0.11, 0.15), (0.08, 0.175), (0.05, 0.16), (0.0, 0.155)],
                 color=S.ash, seg=12)
    recolor(cone, lambda c, n: S.lava if c.z > 0.16 and math.hypot(c.x, c.y) < 0.07 else None)
    deform(cone, lambda p: m @ (p * Z) + base)
    parts.append(cone)
    # the plume: a hot column out of the vent and a cauliflower of ash on
    # top � v1's five balls, lava at the foot and ash above
    hot, ash = L(S.lava), mixc(L(S.ash), L(S.sulfur), 0.1)
    parts.append(sweep([body.point(pd, 0.12), body.point(pd, 0.36)], lambda t: Z * (0.06 + 0.02 * t),
                       S.lava, seg=10, caps=1))
    parts.append(ball(Z * 0.12, body.point(pd, 0.36), mixc(hot, ash, 0.45), seg=10, rings=5))
    head = body.point(pd, 0.6)
    parts.append(ball(Z * 0.25, head, ash, seg=12, rings=7))
    for k in range(4):
        b = k / 4 * TAU + 0.5
        off = (e1 * math.cos(b) + e2 * math.sin(b)) * Z * 0.22 - pd * Z * 0.04 + pd * Z * 0.08 * (k % 2)
        parts.append(ball(Z * (0.16 - 0.02 * (k % 2)), head + off, mixc(ash, L(S.sulfur), 0.15 + 0.15 * (k % 2)),
                          seg=10, rings=5))
    return fit(parts, 'sol_moon_volcano', v, uniform=True)
