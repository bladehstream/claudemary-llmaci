"""Galaxy-stage props: the stars and what they leave behind — a rogue planet,
the brown, red and white dwarfs, a main-sequence star, a binary pair, the red
giant and the blue supergiant, a protostar in its cocoon, a Bok globule, a
planetary nebula, a supernova remnant, a neutron star and a pulsar.

Frame reminder (see kit.py): Blender Z is up, X is the prop's width, and the
game's FRONT (+Z) is Blender -Y. v1 (src/world/props/galaxy.js and
spacekit.js) is authored in the game frame in display units (one unit, one
light year), so these are too: each part is made about its own origin IN THE
GAME FRAME with v1's own numbers, moved with v1's opts (x, y, z, rx, ry, rz —
three's 'YXZ' Euler), and only then turned into Blender's frame by `place()`.
The loader seats a model on its catalogue box by bounding box, so a ghost jet
or beam that v1 lets sink below the floor is modelled to its full length and
the whole prop is lifted to rest on z = 0.

The look: premium toy stars. Each star is one clean globe — granulation as
soft colour cells of the globe itself, belts as recoloured rows with crisp
edges, starspots as shallow raised patches with a dark umbra — wearing v1's
decoration as single crisp shapes: prominences as ONE tapered loop of plasma
standing off the limb (only the part outside the star is built), field rings
as thin hoops, discs as thin banded slabs, jets as one narrow beam with beads
of knots, shells as one thick lathed bubble.

Glow, exactly as v1: galaxy.js registers no glow colours, and nothing it
draws directly (`b.sphere`, `d.cone`, `d.torus`, `d.cyl`, `d.ellip`, `d.lathe`)
is self-lit. Only spacekit's helpers are:
    prominence() 0.7   g_reddwarf x2, g_star x2, g_redgiant x4
    ring()       0.5   g_star, g_supergiant x2, g_planetary (the rose inner
                       ring), g_neutron x2, g_pulsar (the field ring)
    jet()        beam 0.6, knots 0.78 (0.6 x 1.3), lobe 0.6
                       g_protostar (the upward jet has the lobe), g_neutron
Nothing else glows: not the star bodies, not the white dwarf's diffraction
cross, not the pulsar's beams (v1 draws those as plain `d.cyl`).

Parts v1 draws but buries inside its own opaque core (the hot dot in the
protostar, planetary nebula, remnant, neutron star and pulsar; the white
dwarf's halo and the planetary's rose ring) are noted where they occur. The
white dwarf's halo and the planetary's dot and rose ring are brought out to
where they can be seen; the protostar's, neutron star's and pulsar's hot
dots show as small hot caps (unlit, as v1's dots are) where the jets or
beams leave the body; the remnant's is left out as invisible.

The planetary nebula's solid 0.6 R ball of gas is drawn as a fat torus and
two bubble lobes instead (v1's own comment says that is what it means), so
some of the space v1 collides with is open air here — physics is v1's.
"""
import math
import random
import bpy
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

# v1's stage tin (G in galaxy.js) — not in the shared palette.
G = type('G', (), dict(
    event=0x08070d, voidDeep=0x0b0916, void=0x141026, dust=0x241a3d, dustWarm=0x3a2340,
    dustLit=0x4d3564, ash=0x2e2838,
    white=0xfdfcff, blueWhite=0xd9e6ff, blue=0x7fb0ff, blueDeep=0x3a5ad8, cyan=0x6fe4ee,
    teal=0x1f8f9c, gold=0xffdd94, amber=0xffab52, ember=0xff6b3a, emberDk=0xb43a24, rust=0x8a3520,
    magenta=0xe45ad0, rose=0xff8fb4, violet=0x8a4ade, indigo=0x3f2d8c, plum=0x5c2c6d, jade=0x63e0a6,
    halo=0xa8d4ff, glare=0xfff4cf, xray=0xbfe4ff,
))

GLOW_PROM = 0.7
GLOW_RING = 0.5
GLOW_JET = 0.6


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
    """v1's spot direction: azimuth a, polar angle e (game frame)."""
    se = math.sin(e)
    return Vector((se * math.cos(a), math.cos(e), se * math.sin(a)))


def aim(d):
    """A 4x4 turning game +Y onto the unit vector d."""
    q = Vector((0, 1, 0)).rotation_difference(Vector(d).normalized())
    return q.to_matrix().to_4x4()


def outward(o, c=(0, 0, 0)):
    """Flip a closed or open shell so its faces look away from c."""
    me = o.data
    cv = Vector(c)
    s = sum((p.center - cv).dot(p.normal) * p.area for p in me.polygons)
    if s < 0:
        me.flip_normals()
    me.update()
    return o


def lift(parts):
    """Rest the prop on the floor (Blender z = 0)."""
    lo = min(v.co.z for o in parts for v in o.data.vertices)
    for o in parts:
        o.data.transform(Matrix.Translation((0, 0, -lo)))
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


def globe(R, col, seg=28, n=14, bands=(), fn=None, warp=None, band=None, wave=None, vfn=None, smooth=80):
    """A sphere at the origin of the game frame, poles on Y, its latitude rings
    at an even spacing PLUS every height in `bands` (y / R), so a recoloured
    band has a crisp edge exactly where asked.
      fn(unit Vector) -> colour or None   paints face by face;
      band(h) -> colour or None           paints each row of faces by its
                                          (unwaved) mid-height h = y / R;
      vfn(unit Vector) -> colour          paints per vertex (soft mottling);
      wave(azimuth, h) -> dh              moves a ring up or down;
      warp(unit Vector) -> radius factor."""
    hs = {round(math.cos(PI * i / n), 6) for i in range(1, n)}
    for h in bands:
        hs.add(round(h, 6))
    hs = sorted(hs, reverse=True)
    full = [1.0] + hs + [-1.0]
    rings = [[Vector((0, R * (warp(Vector((0, 1, 0))) if warp else 1), 0))]]
    for i, h in enumerate(hs):
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
    rings.append([Vector((0, -R * (warp(Vector((0, -1, 0))) if warp else 1), 0))])
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
    return _smooth(o, smooth)


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


def cells(rnd, n, tones, soft=0.0):
    """Granulation: n Voronoi cells on the unit sphere, each a tone from
    `tones`; returns vfn(unit Vector) -> colour. `soft` blends each cell's
    edge toward the next one's tone, so cells read as cells, not tiles."""
    cs = [surf(rnd.uniform(0, TAU), math.acos(rnd.uniform(-1, 1))) for _ in range(n)]
    tc = [L(rnd.choice(tones)) for _ in cs]

    def f(u):
        best, second = -2.0, -2.0
        bi = si = 0
        for i, c in enumerate(cs):
            d = u.dot(c)
            if d > best:
                second, si = best, bi
                best, bi = d, i
            elif d > second:
                second, si = d, i
        if soft <= 0:
            return tc[bi]
        e = smooth01(0.0, soft, best - second)
        return mixc(tc[si], tc[bi], 0.5 + 0.5 * e)
    return f


def patch(R, d, prof, col, seg=14, wob=None, fn=None, c=(0, 0, 0)):
    """A shallow patch hugging a sphere of radius R centred at c: a spot, a
    storm, a cap. `prof` is [(angle, lift), ...] from the outer edge in to the
    middle — angle off the patch's axis (radians), lift as a multiple of R.
    The axis is the game-frame direction d. wob(azimuth) -> angle factor
    shapes the outline. fn(angle, azimuth) -> colour paints per face."""
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


def spot(R, th, ph, size, col, umbra=None, long=1.0, lift_=1.012, seg=12, c=(0, 0, 0)):
    """v1's `spot`: a marking on a sphere at (azimuth th, polar ph), about
    R * size across its half-width, `long` times as long east-west. A shallow
    raised patch, optionally with a darker umbra in the middle."""
    s = size
    d = surf(th, ph)
    k = 1.0 / max(1e-3, long)

    def wob(az):
        return 1.0 / math.sqrt((k * math.cos(az)) ** 2 + math.sin(az) ** 2)
    fn = None
    if umbra is not None:
        fn = lambda t, az: umbra if t < s * 0.45 * (1.0 / k if abs(math.cos(az)) > 0.7 else 1.0) else None
    o = patch(R, d, [(s, 0.996), (s * 0.8, lift_), (s * 0.4, lift_ + 0.002), (0, lift_ + 0.003)], col,
              seg=seg, wob=wob, fn=fn, c=c)
    # turn the patch about its own axis so its long side runs east-west
    east = Vector((0, 1, 0)).cross(d)
    if east.length > 1e-6 and long != 1.0:
        east.normalize()
        lx = (aim(d) @ Vector((1, 0, 0, 0))).to_3d()
        ang = lx.angle(east)
        if lx.cross(east).dot(d) < 0:
            ang = -ang
        cv = Vector(c)
        o.data.transform(Matrix.Translation(cv) @ Matrix.Rotation(ang, 4, d) @ Matrix.Translation(-cv))
        o.data.update()
    return o


def sweep(points, radii, col, n=10, caps=True, smooth=60, fn=None, squash=1.0, up=(0, 1, 0), closed=False):
    """A round tube through game-frame `points`, radius per point (or one),
    parallel-transported. fn(i / (m - 1)) -> colour grades it along its
    length."""
    pts = [Vector(p) for p in points]
    m = len(pts)
    rr = radii if isinstance(radii, (list, tuple)) else [radii] * m
    tans = []
    for i in range(m):
        if closed:
            a, b = pts[(i - 1) % m], pts[(i + 1) % m]
        else:
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
    if closed:
        rings.append(rings[0])
    bm = bmesh.new()
    vr = [[bm.verts.new(p) for p in r] for r in (rings[:-1] if closed else rings)]
    if closed:
        vr.append(vr[0])
    for a, b in zip(vr, vr[1:]):
        for j in range(n):
            j2 = (j + 1) % n
            bm.faces.new((a[j], a[j2], b[j2], b[j]))
    if caps and not closed:
        bm.faces.new(list(reversed(vr[0])))
        bm.faces.new(vr[-1])
    o = _from_bmesh(bm, 'sweep')
    me = o.data
    s = 0.0
    for poly in me.polygons:
        k = min(m - 1, poly.index // n)
        s += (poly.center - pts[k]).dot(poly.normal)
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


def catmull(ctrl, per=4):
    """A smooth curve through game-frame control points (Catmull-Rom)."""
    P = [Vector(p) for p in ctrl]
    P = [P[0] * 2 - P[1]] + P + [P[-1] * 2 - P[-2]]
    out = []
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
        for k in range(per):
            t = k / per
            t2, t3 = t * t, t * t * t
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2
                              + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    out.append(P[-2])
    return out


def ball(r, col, at=(0, 0, 0), seg=16, scale=(1, 1, 1), rx=0.0, ry=0.0, rz=0.0):
    """A sphere / ellipsoid in the game frame (scale is game x, y, z), its
    poles on game Y."""
    # kit's sphere has its poles on local Z, which Z2Y turns onto game Y
    o = sphere(r, color=col, seg=seg, scale=(scale[0], scale[2], scale[1]))
    o.data.transform(Z2Y)
    place(o, at, rx, ry, rz)
    return o


def hoop(R, t, col, at=(0, 0, 0), rx=0.0, ry=0.0, rz=0.0, seg=32, rseg=8):
    """three's torus: in the XY plane until rotated (rx = PI/2 lays it flat)."""
    o = torus(R, t, color=col, seg=seg, rseg=rseg)
    place(o, at, rx, ry, rz)
    return o


def ring(R, col, at=(0, 0, 0), rx=0.0, rz=0.0, tube_=0.045, seg=48, rseg=6, k=GLOW_RING):
    """spacekit's `ring`: a thin bright hoop, rx = 0 is flat; self-lit 0.5."""
    o = hoop(R, R * tube_, col, at=at, rx=rx + PI / 2, rz=rz, seg=seg, rseg=rseg)
    return glow(o, k)


def ylathe(profile, col, seg=24, at=(0, 0, 0), rx=0.0, ry=0.0, rz=0.0, smooth=50,
           close_top=True, close_bottom=True):
    """kit.lathe about game Y: profile [(radius, y), ...] bottom to top."""
    o = lathe(profile, color=col, seg=seg, smooth=smooth, close_top=close_top, close_bottom=close_bottom)
    o.data.transform(Z2Y)
    place(o, at, rx, ry, rz)
    return o


def ringed(r0, r1, t, cols, seg=40, cuts=None, under=None, warp=0.0):
    """A flat banded slab in the game frame (spacekit's `annulus` /
    `gradedDisc`): r0 to r1, 2t thick, its top split at the radii in `cuts`
    into crisp bands coloured from `cols` (inner to outer), its underside
    the same bands a shade darker unless `under` is given. `warp` is
    gradedDisc's: the slab tips about X a little more the further out it
    is, `warp` radians more at r1 than at r0."""
    cuts = list(cuts or [])
    top = [r0] + cuts + [r1]
    prof = [(r, t) for r in top] + [(r, -t) for r in reversed(top)]
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
    bounds = [r0] + cuts + [r1 + 1e9]

    def fn(c, n):
        r = math.hypot(c.x, c.z)
        col = cols[-1]
        for k in range(len(bounds) - 1):
            if r < bounds[k + 1]:
                col = cols[min(k, len(cols) - 1)]
                break
        if n.y < -0.5:
            return under if under is not None else dk(col, 0.18)
        if abs(n.y) <= 0.5:
            return dk(col, 0.08)
        return col
    paint(o, cols[0])
    recolor(o, fn)
    if warp:
        def tip(p):
            th = warp * (math.hypot(p.x, p.z) - r0) / max(1e-9, r1 - r0)
            return Vector((p.x, p.y * math.cos(th) - p.z * math.sin(th), p.y * math.sin(th) + p.z * math.cos(th)))
        deform(o, tip)
    return _smooth(o, 30)


def wall(R, H, span, t, col, bow=0.0, seg=20, y0=0.0, phi=0.0, fall=0.35, fn=None, sec=8):
    """spacekit's `sheet`: a curved standing sheet of gas (a partial lathe) in
    the game frame — `span` radians of a circle of radius R centred on the
    azimuth `phi` (three's lathe angle; 0 is game +Z), H tall, 2t thick, its
    top leaning in by bow*R. Rounded in section, its wings falling to
    (1 - fall) of the height. fn(s, h) -> colour, s in -1..1 across the span
    and h in 0..1 up it."""
    rings = []
    for i in range(seg + 1):
        s = -1 + 2 * i / seg
        p = phi + span * 0.5 * s
        hh = H * (1 - fall * s * s)
        tt = t * (1 - 0.35 * s * s)
        ring_ = []
        for j in range(sec):
            b = TAU * j / sec
            hu = 0.5 + 0.5 * math.sin(b)
            rad = R - bow * R * hu * hu + tt * math.cos(b)
            y = y0 + hh * hu
            ring_.append(Vector((rad * math.sin(p), y, rad * math.cos(p))))
        rings.append(ring_)
    o = rings_mesh(rings, cap0=True, cap1=True, name='wall')
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


# ---------------------------------------------------------------- star kit

def prom(R, col, a, size, lift_=0.35, tilt=1.1, tk=0.1, sides=8, n=40, crown=None, k=GLOW_PROM):
    """spacekit's `prominence`, relative to the star's centre: v1's torus of
    radius R*size centred off the limb at azimuth a, raised lift_*R, tilted
    and turned as v1 does it — but drawn as ONE loop of plasma: only the arc
    that stands outside the photosphere, its feet flared and sunk into the
    surface, hot at the feet and paler at the crown. Self-lit 0.7."""
    rr = R * size
    M = rot3(rx=tilt, ry=-a)
    cen = Vector((math.cos(a) * R * 0.94, lift_ * R, math.sin(a) * R * 0.94))
    circ = [cen + (M @ Vector((rr * math.cos(TAU * i / n), rr * math.sin(TAU * i / n), 0.0))) for i in range(n)]
    crown = lt(col, 0.45) if crown is None else crown
    out = [p.length > R * 0.985 for p in circ]
    if all(out):
        o = hoop(rr, rr * tk, col, at=tuple(cen), rx=tilt, ry=-a, seg=n, rseg=sides)
        return glow(o, k)
    if not any(out):
        return None
    i0 = next(i for i in range(n) if out[i] and not out[i - 1])
    run = []
    i = i0
    while out[i % n]:
        run.append(circ[i % n])
        i += 1
    # a foot each end, just inside the limb so the loop plugs into the star
    pre, post = circ[(i0 - 1) % n], circ[i % n]
    pts = [pre.normalized() * R * 0.9] + run + [post.normalized() * R * 0.9]
    m = len(pts)
    rad = []
    for j in range(m):
        t = j / (m - 1)
        f = max(0.0, 1 - min(t, 1 - t) * 6) ** 2
        rad.append(rr * tk * (0.85 + 0.15 * math.sin(t * PI) + 0.7 * f))
    o = sweep(pts, rad, col, n=sides, fn=lambda t: mix(col, crown, math.sin(t * PI) ** 1.5))
    return glow(o, k)


def jet(y0, ln, col, up=1, r=0.025, knots=3, hot=None, lobe=0.0, k=GLOW_JET, seg=10):
    """spacekit's `jet`: a beam len/40 across, narrowing from r at its root
    to 0.6r at its tip as v1's cylinder does, beads of knots along it and an
    optional terminal lobe. Beam and lobe self-lit 0.6, knots 0.78."""
    rad = ln * r
    hot = col if hot is None else hot
    parts = []
    yA, yB = y0, y0 + up * ln
    lo, hi = min(yA, yB), max(yA, yB)
    # v1's cylinder is rBot = r at its LOW end and rTop = 0.6r at its high end
    prof = [(0.0, lo), (rad * 0.85, lo), (rad, lo + rad * 0.5), (rad * 0.6, hi - rad * 0.5),
            (rad * 0.5, hi), (0.0, hi)]
    beam = ylathe(prof, col, seg=seg, smooth=60)
    # paler at the root, where it leaves the source (mesh is in Blender's
    # frame by now, so game height is z)
    paint(beam, col, lambda p: mix(lt(col, 0.4), col, smooth01(0.0, 0.5, abs(p.z - yA) / ln)))
    parts.append(glow(beam, k))
    for i in range(1, knots + 1):
        t = i / (knots + 1)
        kr = rad * (1.9 - t * 0.6)
        kn = ball(kr, hot, at=(0, y0 + up * ln * t, 0), seg=12, scale=(1, 1.35, 1))
        parts.append(glow(kn, k * 1.3))
    if lobe:
        yl = y0 + up * ln * 1.02
        lb = ball(ln * lobe, hot, at=(0, yl, 0), seg=16, scale=(1, 0.66, 1))
        # paler on the leading face, where it ploughs into the cloud
        paint(lb, hot, lambda p: mix(hot, lt(hot, 0.35), 0.5 + 0.5 * up * (p.z - yl) / (ln * lobe * 0.66)))
        parts.append(glow(lb, k))
    return parts


def gem(r, col, seed=0, sub=1, cuts=0, depth=0.0, scale=(1, 1, 1), tones=None, bevel=0.0):
    """A faceted crystal ball in the game frame: an icosphere, optionally
    sliced flat by a few planes, flat-shaded, each facet a slightly different
    tone so it sparkles rather than shades."""
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
    o = _from_bmesh(bm, 'gem')
    if bevel > 0:
        _bevel(o, bevel, 1, angle=12)
    paint(o, col)
    if tones:
        tl = [L(t) for t in tones]
        recolor(o, lambda c, n: tl[int(abs(n.x * 7.3 + n.y * 11.1 + n.z * 5.7) * 3) % len(tl)])
    _smooth(o, 5)
    return o


# ================================================================= A PLANET

@model('g_rogue', ao=0.45)
def g_rogue(v):
    """A planet with no star: a chunk of frozen rock, faceted on purpose as
    v1's is — a lumpy globe shaded flat, each facet its own shade of v1's
    colour — with a frosted cap of pale facets tipped a little off the pole,
    two dark basins, and the faint rim ring that keeps its silhouette alive
    against the void."""
    R = 8.0
    col = [G.dust, G.rust, G.plum][v]
    rnd = random.Random(21 + v)
    nz = noise3(rnd, k=4, f=(1.3, 2.6))
    frost = mix(G.ash, G.halo, 0.38)
    basin = [G.plum, G.emberDk, G.indigo][v]
    cap_d, b1, b2 = surf(0.0, 0.28), surf(2.1, 1.5), surf(4.3, 2.0)
    tones = [L(col)] * 4

    def facet(u):
        k = int(abs(u.x * 13.7 + u.y * 7.3 + u.z * 11.1) * 5) % len(tones)
        a = u.angle(cap_d)
        if a < 0.36:
            return lt(frost, 0.08) if (k % 2) else frost
        if a < 0.46:
            return mix(frost, col, 0.5)
        if u.angle(b1) < 0.34:
            return dk(basin, 0.05 * (k % 2))
        if u.angle(b2) < 0.27:
            return mix(G.void, col, 0.2)
        return tones[k]
    body = globe(R, col, seg=18, n=9, warp=lambda u: 1.0 + 0.06 * nz(u), fn=facet, smooth=22)
    place(body, (0, R, 0))
    rim = [G.dustLit, G.ash, G.indigo][v]
    rg = ringed(R * 0.96, R * 1.07, R * 0.022, [lt(rim, 0.15)], seg=32)
    place(rg, (0, R, 0), rx=0.35)
    return lift([body, rg])


# ================================================================= THE MAIN SEQUENCE

@model('g_browndwarf', ao=0.4)
def g_browndwarf(v):
    """Barely a star: a banded globe in v1's rust, five belts with crisp,
    weather-wandering edges in v1's rotating three colours, and the great
    storm — a long raised oval in ember with a hot amber eye — plus a small
    amber storm in the other hemisphere."""
    R = 10.5
    bands = [G.emberDk, G.plum, G.dustWarm]
    belts = []
    edges = []
    for i in range(5):
        lat = (i - 2) * 0.34
        w = 0.052 + (i % 2) * 0.03
        h = math.sin(lat)
        belts.append((h, w, bands[(i + v) % 3]))
        edges += [h - w, h + w]

    def band(h):
        for hb, w, c in belts:
            if abs(h - hb) < w:
                return c
        return None
    g = globe(R, G.rust, seg=26, n=8, bands=edges, band=band,
              wave=lambda a, h: 0.02 * math.sin(3 * a + h * 7 + v) + 0.01 * math.sin(5 * a - h * 4))
    parts = [g]
    parts.append(spot(R, 0.8, 1.25, 0.3, G.ember, umbra=G.amber, long=1.7, lift_=1.03, seg=16))
    parts.append(spot(R, 3.6, 1.9, 0.18, G.amber, umbra=lt(G.amber, 0.3), long=1.4, lift_=1.025, seg=12))
    for o in parts:
        place(o, (0, R, 0))
    return lift(parts)


@model('g_reddwarf', ao=0.35)
def g_reddwarf(v):
    """Small, cool and covered in weather: an ember globe mottled with soft
    granulation cells, a group of four starspots (dark umbra in a penumbra
    of v1's per-variant colour) and two flare loops standing off the limb,
    gold and amber, self-lit as v1's are."""
    R = 13.5
    rnd = random.Random(300 + v)
    tones = [G.ember, G.ember, lt(G.ember, 0.12), mix(G.ember, G.amber, 0.35), dk(G.ember, 0.08)]
    g = globe(R, G.ember, seg=24, n=12, vfn=cells(rnd, 46, tones, soft=0.05))
    parts = [g]
    pen = [G.emberDk, G.rust, G.plum][v]
    for i in range(4):
        th, ph, s = rnd.uniform(0, TAU), 0.7 + rnd.uniform(0, 1.7), 0.13 + rnd.uniform(0, 0.1)
        parts.append(spot(R, th, ph, s, pen, umbra=dk(pen, 0.45), seg=10))
    for o in parts:
        place(o, (0, R, 0))
    for (col, a, size, lf, tilt) in ((G.gold, 0.5, 0.34, 0.3, 1.1), (G.amber, 3.4, 0.24, -0.1, 0.8)):
        p = prom(R, col, a, size, lift_=lf, tilt=tilt, tk=0.2, n=32, crown=lt(G.gold, 0.4))
        if p:
            place(p, (0, R, 0))
            parts.append(p)
    return lift(parts)


# White dwarf. v1's halo torus (0.6 R) sits wholly inside its own 0.78 R
# core, so it never shows; it carries the per-variant colour, so here it is
# brought out to just clear the crystal, inside the reach of the cross.
@model('g_whitedwarf', ao=0.3)
def g_whitedwarf(v):
    """A crystallised dead star: a faceted blue-white gem (v1's 'faceted
    solid', because white dwarfs really do freeze into a lattice), a
    diffraction cross of six needle-thin spikes that taper to nothing — the
    silhouette — and a fine halo ring in the variant's colour."""
    R = 17.0
    parts = []
    core = gem(R * 0.78, G.blueWhite, seed=5 + v, sub=2,
               tones=[G.blueWhite, lt(G.blueWhite, 0.35), mix(G.blueWhite, G.halo, 0.2), lt(G.blueWhite, 0.6)])
    place(core, (0, R, 0))
    parts.append(core)
    ln = R * 0.98
    for (sx, sy, sz) in ((1, 0, 0), (0, 1, 0), (0, 0, 1)):
        for s in (1, -1):
            col = G.blueWhite if sy else G.white
            prof = [(0.0, R * 0.6), (R * 0.12, R * 0.6), (R * 0.075, R * 0.76), (R * 0.035, R * 0.87),
                    (R * 0.01, ln - R * 0.02), (0.0, ln)]
            sp = lathe(prof, color=col, seg=6, smooth=70)
            paint(sp, col, lambda p, col=col: mix(col, G.white, smooth01(R * 0.6, ln, p.z)))
            d = Vector((sx * s, sy * s, sz * s))
            sp.data.transform(aim(d) @ Z2Y)
            place(sp, (0, R, 0))
            parts.append(sp)
    hc = [G.halo, G.cyan, G.blueWhite][v]
    parts.append(hoop(R * 0.88, R * 0.03, hc, at=(0, R, 0), rx=1.2, seg=32, rseg=4))
    return lift(parts)


@model('g_star', ao=0.35)
def g_star(v):
    """A star like the Sun, in v1's four spectral skins: a granulated
    photosphere, a scatter of cool spots, two prominences — an ember loop
    and a small one in the cool colour — and a thin self-lit field ring
    tilted round it."""
    R = 21.5
    skin = [G.gold, G.white, G.blueWhite, G.amber][v]
    cool = [G.amber, G.blueWhite, G.cyan, G.ember][v]
    rnd = random.Random(400 + v)
    tones = [skin, skin, lt(skin, 0.25), mix(skin, cool, 0.3), dk(skin, 0.06)]
    g = globe(R, skin, seg=28, n=14, vfn=cells(rnd, 56, tones, soft=0.05))
    parts = [g]
    for i in range(5):
        th, ph, s = rnd.uniform(0, TAU), 0.35 + rnd.uniform(0, PI - 0.7), 0.1 + rnd.uniform(0, 0.07)
        parts.append(spot(R, th, ph, s, mix(cool, skin, 0.35), umbra=cool, seg=10, lift_=1.008))
    for o in parts:
        place(o, (0, R, 0))
    for (col, a, size, lf, tilt) in ((G.ember, 1.0, 0.3, 0.4, 1.1), (cool, 4.0, 0.22, -0.2, 0.7)):
        p = prom(R, col, a, size, lift_=lf, tilt=tilt, tk=0.2, n=32, crown=lt(G.gold, 0.35) if col == G.ember else None)
        if p:
            place(p, (0, R, 0))
            parts.append(p)
    parts.append(ring(R * 1.13, cool, at=(0, R, 0), rx=0.15, tube_=0.024, seg=48, rseg=5))
    return lift(parts)


# Binary. v1's accretion disc (r 0.5-1.15 of the big star's radius, round
# the small one) reaches back into the big star; it does here too, which is
# where the box's width comes from.
@model('g_binary', ao=0.35)
def g_binary(v):
    """Two stars in one prop: the big one granulated in v1's colour, the
    small companion wearing a banded accretion disc in gold, amber and ember,
    and between them ONE curving stream of gas peeling off the big star and
    spiralling into the disc — a ribbon, not v1's string of beads."""
    HX, HY = 35.1, 23.68
    big, small = [G.gold, G.white, G.amber][v], [G.ember, G.blueWhite, G.rust][v]
    rnd = random.Random(500 + v)
    cb = Vector((-HX + HY, HY, 0))
    rs = HY * 0.443
    cs = Vector((HX - rs, HY, 0))
    parts = []
    gb = globe(HY, big, seg=28, n=14,
               vfn=cells(rnd, 50, [big, big, lt(big, 0.22), mix(big, G.amber, 0.25), dk(big, 0.06)], soft=0.05))
    place(gb, tuple(cb))
    parts.append(gb)
    # the side facing the companion is pulled out into a gentle bulge of
    # brighter gas where the stream leaves it
    gs = globe(rs, small, seg=22, n=11, vfn=lambda u: mix(small, lt(small, 0.35), max(0.0, u.y) ** 2))
    place(gs, tuple(cs))
    parts.append(gs)
    TILT = 0.32
    disc = ringed(HY * 0.5, HY * 1.15, HY * 0.018, [lt(G.gold, 0.2), G.amber, G.ember], seg=48,
                  cuts=[HY * 0.5 + HY * 0.65 / 3, HY * 0.5 + HY * 1.3 / 3])
    place(disc, tuple(cs), rx=TILT)
    parts.append(disc)
    # the stream: v1's curve (rising and swinging toward the viewer between
    # the stars), started on the big star's limb and carried on round the
    # companion into the disc plane
    x0, x1 = -HX + HY * 1.9, HX - HY * 0.9
    ctrl = [cb + Vector((0.93, 0.18, 0.3)).normalized() * HY * 0.96]
    for t in (0.3, 0.6, 0.9):
        ctrl.append(Vector((x0 + (x1 - x0) * t, HY + math.sin(t * PI) * HY * 0.26, math.sin(t * PI) * HY * 0.34)))
    M = rot3(rx=TILT)
    for a in (2.0, 2.6, 3.3):
        rr = HY * (0.82 - (a - 2.0) * 0.12)
        ctrl.append(cs + (M @ Vector((math.cos(a) * rr, 0.0, -math.sin(a) * rr))) + Vector((0, HY * 0.03, 0)))
    pts = catmull(ctrl, per=4)
    m = len(pts)
    rad = [HY * (0.11 - 0.07 * (i / (m - 1))) for i in range(m)]
    parts.append(place(sweep(pts, rad, G.gold, n=8, fn=lambda t: mix(lt(G.gold, 0.3), G.amber, t))))
    return lift(parts)


def domes(big, s_pow=0.55):
    """warp(u) and dome(u) -> (index, strength) for a globe swelling into
    broad caps [(dir, height, angular half-width)]: each a steep-sided dome,
    so where two meet, or one meets the round body, there is a crease."""
    def dome(u):
        di, ds = -1, 0.0
        for j, (d, a, w) in enumerate(big):
            x = u.angle(d) / w
            if x < 1.0:
                s_ = a * (1 - x * x) ** s_pow
                if s_ > ds:
                    di, ds = j, s_
        return di, ds

    def warp(u):
        return 1.0 + dome(u)[1]
    return warp, dome


@model('g_redgiant', ao=0.4)
def g_redgiant(v):
    """The one star that should not be round: an ember giant whose limb
    boils up into convection cells a third the width of the star — v1's six
    lumps, in v1's places and v1's alternating ember and dark ember, as
    creased domes of the one surface rather than balls stuck on it — over a
    softly granulated body with four dark spots, wearing four long self-lit
    loops in amber, gold and rust.

    Size: the domes are pressed a little flatter at the top and bottom than a
    free swell would be, so the height stays v1's (its lumps are ellipsoids
    wider than they are tall)."""
    R = 33.5
    big = []
    for i in range(6):
        a = (i / 6) * TAU + v * 0.7
        e = 0.7 + ((i * 5) % 7) * 0.24
        k = 0.34 + (i % 3) * 0.09
        big.append((surf(a, e), k * 1.0 - 0.13, 0.55 + k * 0.65))
    warp, dome = domes(big, s_pow=0.42)
    rnd = random.Random(600 + v)
    gran = cells(rnd, 44, [G.ember, G.ember, mix(G.ember, G.amber, 0.3), mix(G.ember, G.emberDk, 0.18)], soft=0.06)
    lane = mix(G.emberDk, G.rust, 0.5)
    dcol = [mix(G.ember, G.amber, 0.18), mix(G.emberDk, G.ember, 0.15)]
    sd = [surf((i / 4) * TAU + v + 0.4, 0.6 + (i % 3) * 0.8) for i in range(4)]

    def vf(u):
        c = gran(u)
        di, ds = dome(u)
        if di >= 0:
            h = ds / big[di][1]
            c = mix(lane, mix(dcol[di % 2], gran(u), 0.15), smooth01(0.02, 0.3, h))
        for d in sd:
            x = u.angle(d) / 0.24
            if x < 1:
                c = mix(c, dk(G.emberDk, 0.35), smooth01(1.0, 0.5, x))
        return c
    g = globe(R, G.ember, seg=36, n=18, warp=warp, vfn=vf)

    def press(p):
        y = p.y
        lim = R * 0.84
        if abs(y) > lim:
            y = math.copysign(lim + (abs(y) - lim) * 0.45, y)
        return Vector((p.x, y, p.z))
    deform(g, press)
    place(g, (0, R, 0))
    parts = [g]
    for i in range(4):
        col = [G.amber, G.gold, G.rust][i % 3]
        p = prom(R, col, (i / 4) * TAU + v, 0.24 + (i % 2) * 0.12, lift_=0.2 + (i % 3) * 0.22,
                 tilt=0.7 + i * 0.2, tk=0.16, n=28, crown=lt(G.gold, 0.3))
        if p:
            place(p, (0, R, 0))
            parts.append(p)
    return lift(parts)


@model('g_supergiant', ao=0.35)
def g_supergiant(v):
    """A runaway blue supergiant: a big blue-white globe with blue spots,
    two thin self-lit wind rings at different tilts, and the bow shock it
    piles up ahead of it — one curved, leaning sheet of pale gas on the side
    it is ploughing towards (v1's phi0 = 2.1 v)."""
    R = 41.0
    rnd = random.Random(700 + v)
    g = globe(R, G.blueWhite, seg=32, n=16,
              vfn=cells(rnd, 60, [G.blueWhite, G.blueWhite, G.white, mix(G.blueWhite, G.halo, 0.4)], soft=0.05))
    parts = [g]
    for i in range(5):
        parts.append(spot(R, (i / 5) * TAU, 0.5 + (i % 3) * 0.7, 0.16, mix(G.blue, G.blueWhite, 0.35),
                          umbra=G.blue, seg=12, lift_=1.008))
    for o in parts:
        place(o, (0, R, 0))
    parts.append(ring(R * 1.22, G.cyan, at=(0, R * 1.02, 0), rx=0.22, tube_=0.022, seg=48, rseg=4))
    parts.append(ring(R * 1.34, G.halo, at=(0, R, 0), rx=0.07, rz=0.4, tube_=0.018, seg=48, rseg=4))
    Rs = R * 1.62
    parts.append(place(wall(Rs, R * 0.92, 1.65, Rs * 0.022, G.halo, bow=0.26, seg=22, y0=R * 0.42, phi=v * 2.1,
                      fall=0.3, fn=lambda s_, h: mix(mix(G.blue, G.halo, 0.6), lt(G.halo, 0.45), max(0.0, h) ** 1.3))))
    return lift(parts)


# ================================================================= BIRTH

def cloudball(rx, ry, rz, col, rnd, seg=28, n=14, amp=0.08, vfn=None, f=(1.2, 2.6)):
    """A soft lumpy cloud: an ellipsoid globe swelling in broad noise lumps,
    game frame, about its own centre. vfn(unit dir, noise) -> colour."""
    nz = noise3(rnd, k=5, f=f)
    g = globe(1.0, col, seg=seg, n=n, warp=lambda u: 1.0 + amp * nz(u),
              vfn=(lambda u: vfn(u, nz(u))) if vfn else None)
    deform(g, lambda p: Vector((p.x * rx, p.y * ry, p.z * rz)))
    return g, nz


@model('g_protostar', ao=0.4)
def g_protostar(v):
    """A star still inside its egg: a dark, lumpy dust cocoon trailing a few
    wisps the way it is drifting, a banded infall disc round its waist, and
    two narrow self-lit outflows drilling out of the poles — cyan beams with
    jade knots, the long upward one ending in a lobe. The hot star itself
    (v1's dot, buried in its own core) shows only where the jets break out,
    as a bright pore of the variant's colour at each pole."""
    HX, HY, cy = 46.5, 58.0, 40.0
    hot = [G.glare, G.amber, G.gold][v]
    rnd = random.Random(800 + v)
    k = 0.72
    rx, ry = HX * k, HY * 0.72 * k
    tones = [L(G.dust), L(G.dustWarm), L(G.ash), mix(G.dustWarm, G.dustLit, 0.4)]

    def vf(u, nzv):
        t = 0.5 + 0.5 * nzv
        c = mix(G.dust, G.dustWarm, t)
        c = mix(c, G.dustLit, smooth01(0.4, 0.9, t) * 0.6)
        # warmed by the star where the cocoon is thin, at the poles
        return mix(c, mix(G.dustWarm, hot, 0.3), smooth01(0.8, 0.98, abs(u.y)))
    cocoon, _ = cloudball(rx, ry, rx, G.dust, rnd, seg=24, n=12, amp=0.08, vfn=vf)
    place(cocoon, (0, cy, 0))
    parts = [cocoon]
    # the drift: two soft puffs of dust swelling out of the cocoon's flanks
    # along v1's heading (head = v), sunk into it so they read as cloud
    head = float(v)
    for i, s_ in enumerate((1, -1)):
        cx, cz = math.cos(head) * s_ * rx * 0.62, math.sin(head) * s_ * rx * 0.62
        parts.append(ball(rx * 0.62, tones[1 + i], at=(cx, cy + (0.18 - 0.4 * i) * ry, cz), seg=12,
                          scale=(1.0, 0.55, 0.78), ry=-head))
    # the infall disc: v1's three graded annuli as one banded slab, tipping
    # a little more towards its rim (v1's warp)
    cols = [mix(G.dustWarm, G.amber, 0.3), mix(G.dustLit, G.rose, 0.12), mix(G.ash, G.dustLit, 0.5)]
    r0, r1 = 16.0, HX * 0.92
    d = ringed(r0, r1, r1 * 0.018, cols, seg=36, cuts=[r0 + (r1 - r0) / 3 * 2.15, r0 + (r1 - r0) / 3 * 2.6],
               warp=0.1)
    place(d, (0, cy, 0), rx=0.28)
    parts.append(d)
    # where the jets break out, the hot star shows through
    for s_ in (1, -1):
        parts.append(ball(4.6, hot, at=(0, cy + s_ * ry * 0.97, 0), seg=10, scale=(1, 0.55, 1)))
    parts += jet(cy + 12, HY * 0.95, G.cyan, up=1, r=0.03, knots=2, hot=G.jade, lobe=0.1)
    parts += jet(cy - 12, cy * 0.85, G.cyan, up=-1, r=0.03, knots=2, hot=G.jade)
    return lift(parts)


def metablob(elems, res, target):
    """One soft single-surface body from overlapping ellipsoids (Blender
    metaballs): elems are (game centre, game radii, stiffness). Returns the
    mesh object in Blender's frame, decimated to about `target` triangles."""
    mb = bpy.data.metaballs.new('starsblob')
    mb.resolution = res
    mb.render_resolution = res
    mb.threshold = 0.6
    ob = bpy.data.objects.new('starsblob', mb)
    bpy.context.scene.collection.objects.link(ob)
    for c, r, st in elems:
        el = mb.elements.new(type='ELLIPSOID')
        el.co = Vector((c[0], -c[2], c[1]))
        # a lone element's surface sits at ~0.574 x radius x size, and Blender
        # clamps `size`, so the scale goes in `radius` and the shape in `size`
        rm = max(r)
        el.radius = rm / 0.574
        el.stiffness = st
        el.size_x, el.size_y, el.size_z = r[0] / rm, r[2] / rm, r[1] / rm
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    bpy.data.objects.remove(ob)
    bpy.data.metaballs.remove(mb)
    o = bpy.data.objects.new('blob', me)
    bpy.context.scene.collection.objects.link(o)
    tris = sum(len(p.vertices) - 2 for p in me.polygons)
    if tris > target:
        m = o.modifiers.new('dec', 'DECIMATE')
        m.ratio = target / tris
        kit._apply(o)
    return o


def fit_to(o, size):
    """Scale o (Blender frame) per axis so its box is `size` (game w, h, d),
    standing on the floor, centred. Returns the map for game points."""
    xs = [vt.co for vt in o.data.vertices]
    lo = [min(c[i] for c in xs) for i in range(3)]
    hi = [max(c[i] for c in xs) for i in range(3)]
    tgt = (size[0], size[2], size[1])
    k = [tgt[i] / max(1e-9, hi[i] - lo[i]) for i in range(3)]
    cx, cy = (lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2
    for vt in o.data.vertices:
        vt.co = Vector(((vt.co.x - cx) * k[0], (vt.co.y - cy) * k[1], (vt.co.z - lo[2]) * k[2]))
    o.data.update()

    def mp(p):
        return Vector(((p[0] - cx) * k[0], (-p[2] - cy) * k[1], (p[1] - lo[2]) * k[2]))
    return mp


@model('g_bok', ao=0.5)
def g_bok(v):
    """A small dark cloud being boiled away from one side: one soft lumpy
    body in v1's void, dust and ash, rounded and dense on the windward face
    (v1's heading) and drawn out into ragged lobes downwind, its windward
    face rim-lit in the variant's colour where the light is eating it, with
    v1's three bright knots of eroding gas standing on that face.

    Size: v1's wisps are random; the cloud here is fitted to each variant's
    catalogue box after it is made, so the heading and the spread are v1's."""
    R = 60.0
    head = 0.5 + v * 1.3
    lit = [G.rose, G.amber, G.magenta][v]
    rnd = random.Random(900 + v)
    hx, hz = math.cos(head), math.sin(head)
    px, pz = math.cos(head + PI / 2), math.sin(head + PI / 2)
    # a dense round head on the windward side, lobes thinning downwind
    els = [((hx * R * 0.15, R, hz * R * 0.15), (R * 0.5, R * 0.48, R * 0.5), 4.0)]
    # billows: lumps round the body, bigger windward, smaller and looser
    # trailing downwind
    for i in range(13):
        t = (i + 0.5) / 13
        along = 0.42 - t * 1.3                      # windward (+) to downwind (-)
        off = math.sin(i * GOLD * 2.3) * (0.35 + 0.25 * t)
        up = math.cos(i * GOLD * 1.7) * 0.32
        rr = R * (0.34 - t * 0.14) * (0.85 + rnd.random() * 0.3)
        c = (hx * along * R + px * off * R, R + up * R, hz * along * R + pz * off * R)
        els.append((c, (rr, rr * 0.85, rr), 4.0))
    # the knots, standing proud on the windward face
    knots = []
    for i in range(3):
        a = head + (i - 1) * 0.55
        c = (math.cos(a) * R * 0.66, R + (i - 1) * R * 0.28, math.sin(a) * R * 0.66)
        knots.append(c)
        els.append((c, (R * 0.15, R * 0.15, R * 0.15), 5.0))
    o = metablob(els, res=R * 0.05, target=1240)
    spec = kit.SPECS['g_bok']['boxes'][v]['size']
    mp = fit_to(o, spec)
    _smooth(o, 180)
    kn = [mp(c) for c in knots]
    cen = mp((0, R, 0))
    wind = Vector((hx, -hz, 0.0))
    nz = noise3(rnd, k=4, f=(1.5, 3.0))
    me = o.data
    attr = me.color_attributes.new('base', 'FLOAT_COLOR', 'CORNER')
    for poly in me.polygons:
        for li in poly.loop_indices:
            vt = me.vertices[me.loops[li].vertex_index]
            p, n = vt.co, vt.normal
            q = (p - cen)
            ql = q.length or 1.0
            m = nz(q / ql)
            c = mix(G.void, G.dust, 0.5 + 0.5 * m)
            c = mix(c, G.ash, smooth01(0.3, 0.9, m) * 0.7)
            # rim light on the windward face
            w = n.dot(wind)
            c = mix(c, mix(G.dustLit, lit, 0.4), smooth01(0.35, 0.9, w) * 0.75)
            c = mix(c, lit, smooth01(0.8, 1.0, w) * 0.5)
            for kc in kn:
                d = (p - kc).length / (R * 0.24)
                if d < 1:
                    c = mix(c, lt(lit, 0.15), smooth01(1.0, 0.5, d) * (0.4 + 0.6 * smooth01(-0.2, 0.6, w)))
            attr.data[li].color = (*c, 1.0)
    return [o]


# ================================================================= DEATH

def thick_shell(R, th, open_, col, seg=32, n=10, rim_wob=None, wob_ph=0.0, vcol=None):
    """spacekit's `shell` as a solid toy part: the band of a sphere between
    polar angles a0 and PI - a0 (a0 = PI/2 * open_, so it is open at BOTH
    poles, as v1's is), th*R thick. rim_wob ragged the rims: the opening
    angle widens by up to that fraction round the azimuth (never narrows, so
    the height stays v1's). vcol(t, outer, azimuth) -> colour paints it, t
    running 0..1 from the top rim to the bottom one. Game frame, centred on
    the origin. Returns (object, a0)."""
    a0 = PI * 0.5 * open_
    rin = R * (1 - th)
    rings = []
    for side in (0, 1):                       # outer, then inner (reversed)
        idx = range(n + 1) if side == 0 else range(n, -1, -1)
        rad = R if side == 0 else rin
        for i in idx:
            ring_ = []
            for j in range(seg):
                ph = TAU * j / seg
                w1 = w2 = 1.0
                if rim_wob:
                    w1 = 1 + rim_wob * (0.5 + 0.3 * math.sin(3 * ph + wob_ph) + 0.2 * math.sin(7 * ph + 2 * wob_ph))
                    w2 = 1 + rim_wob * (0.5 + 0.3 * math.sin(4 * ph - wob_ph) + 0.2 * math.sin(6 * ph + 3 * wob_ph))
                a_top = a0 * w1
                a_bot = a0 * w2
                e = a_top + (PI - a_top - a_bot) * i / n
                ring_.append(Vector((math.sin(e) * math.cos(ph) * rad, math.cos(e) * rad,
                                     math.sin(e) * math.sin(ph) * rad)))
            rings.append(ring_)
    bm = bmesh.new()
    vr = [[bm.verts.new(p) for p in r] for r in rings]
    vr.append(vr[0])
    for a, b in zip(vr, vr[1:]):
        for j in range(seg):
            j2 = (j + 1) % seg
            bm.faces.new((a[j], a[j2], b[j2], b[j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = _from_bmesh(bm, 'shell')
    paint(o, col)
    if vcol:
        me = o.data
        attr = me.color_attributes['base']
        for poly in me.polygons:
            for li in poly.loop_indices:
                vi = me.loops[li].vertex_index
                k, j = vi // seg, vi % seg
                outer = k <= n
                i = k if outer else n - (k - n - 1)
                attr.data[li].color = (*L(vcol(i / n, outer, TAU * j / seg)), 1.0)
    return _smooth(o, 50), a0


@model('g_planetary', ao=0.4)
def g_planetary(v):
    """What everybody pictures: a RING with a white dot in the middle. The
    dead core, a bright self-lit rose ring round it, a fat torus of ejected
    shell in the variant's colour, the banded disc of v1's four colours
    spreading out from it, and two pear-shaped polar lobes standing out of
    its plane — the bipolar shape most of them really have.

    v1 hides its white dot and its rose ring inside a solid ball of gas
    0.6 R across; here that bulk is the torus and the lobes, so both show.
    The lobes stand square to the disc (tipped with it by 0.42) rather than
    plumb as v1's do."""
    R = 71.5
    hot = [G.teal, G.magenta, G.violet][v]
    TILT = 0.42
    c = (0, R, 0)
    parts = []
    parts.append(ball(R * 0.13, G.white, at=c, seg=14))
    parts.append(ring(R * 0.3, G.rose, at=c, rx=TILT, tube_=0.09, seg=30, rseg=5))
    tor = torus(R * 0.47, R * 0.19, color=hot, seg=28, rseg=10)
    # the torus: paler on its inner face, deeper outside
    paint(tor, hot, lambda p: mix(lt(hot, 0.4), hot, smooth01(R * 0.32, R * 0.6, math.hypot(p.x, p.y))))
    place(tor, c, rx=TILT + PI / 2)
    parts.append(tor)
    cols = [G.cyan, hot, G.magenta, G.violet]
    r0, r1 = R * 0.42, R * 0.96
    st = (r1 - r0) / 4
    d = ringed(r0, r1, r1 * 0.014, cols, seg=36, cuts=[r0 + st, r0 + 2 * st, r0 + 3 * st], warp=0.12)
    place(d, c, rx=TILT)
    parts.append(d)
    # the lobes: open-ended hourglass bubbles, thin-walled, so from above you
    # look down through the top one to the white dot
    rim_c = [G.cyan, G.rose, G.magenta][v]
    T = R * 0.03
    out = [(R * 0.05, R * 0.14), (R * 0.17, R * 0.3), (R * 0.245, R * 0.5), (R * 0.255, R * 0.68),
           (R * 0.21, R * 0.85), (R * 0.13, R * 0.94)]
    for s_ in (1, -1):
        prof = out + [(r_ - T, y_ - T * 0.4) for (r_, y_) in reversed(out)] + [out[0]]
        lb = lathe(prof, color=hot, seg=14, smooth=60, close_bottom=False)
        # deep at the neck, brightening to the lip of the bubble
        paint(lb, hot, lambda p: mix(hot, mix(hot, rim_c, 0.6), smooth01(R * 0.35, R * 0.95, p.z)))
        lb.data.transform(Z2Y)
        place(lb, c, rx=TILT if s_ > 0 else TILT + PI)
        parts.append(lb)
    return lift(parts)


@model('g_remnant', ao=0.45)
def g_remnant(v):
    """A star that blew up: one thick, ragged-rimmed bubble of shocked gas,
    open top and bottom so you can see the cavity (v1's shell), a second
    shell inside it in the variant's tint, rose filaments whipping across
    the outside of the shock front, and the dense hot middle (v1's core)
    sitting in the cavity."""
    R = 85.0
    tint = [G.rose, G.violet, G.jade][v]
    rnd = random.Random(1000 + v)
    c = (0, R, 0)
    parts = []
    lip = mix(G.rose, G.ember, 0.55)

    def oc(t, out, ph):
        # limb-brightened: the shocked gas is brightest at the torn rims
        r_ = min(t, 1 - t)
        base = mix(G.emberDk, G.ember, 0.25 + 0.2 * math.sin(3 * ph + 5 * t + v))
        if not out:
            base = dk(G.emberDk, 0.3)
        return mix(lip, base, smooth01(0.0, 0.09, r_))
    outer, a0 = thick_shell(R, 0.07, 0.34, G.emberDk, seg=30, n=8, rim_wob=0.3, wob_ph=v * 1.7, vcol=oc)
    place(outer, c)
    parts.append(outer)
    inner, _ = thick_shell(R * 0.82, 0.06, 0.42, tint, seg=24, n=4, rim_wob=0.2, wob_ph=v * 1.7 + 1.0,
                           vcol=lambda t, out, ph: mix(lt(tint, 0.3), tint if out else dk(tint, 0.3),
                                                       smooth01(0.0, 0.3, min(t, 1 - t))))
    place(inner, c)
    parts.append(inner)
    core, _ = cloudball(R * 0.66, R * 0.66, R * 0.66, G.emberDk, rnd, seg=20, n=10, amp=0.05,
                        vfn=lambda u, m: mix(G.emberDk, mix(G.ember, G.amber, 0.3),
                                             smooth01(0.5, 1.0, abs(u.y)) * 0.8))
    place(core, c)
    parts.append(core)
    # filaments: thin tubes lying on the outside of the shock front
    for i in range(7):
        a = (i / 7) * TAU + v
        e = PI / 2 + (rnd.random() - 0.5) * 1.1
        span = 0.5 + rnd.random() * 0.3
        pts, rad = [], []
        for j in range(7):
            t = j / 6
            aa = a + (t - 0.5) * span
            ee = e + math.sin(t * PI * 1.5 + i) * 0.12
            pts.append(tuple(surf(aa, ee) * R * 1.01))
            rad.append(R * 0.028 * (0.35 + math.sin(t * PI)))
        f = sweep(pts, rad, G.rose, n=5, fn=lambda t: mix(G.rose, lt(G.rose, 0.35), math.sin(t * PI)))
        place(f, c)
        parts.append(f)
    return lift(parts)


@model('g_neutron', ao=0.35)
def g_neutron(v):
    """A city-sized dot with a magnetosphere the size of a solar system: the
    field as a dark egg (v1's core) laced with pale dipole field lines, a
    hard x-ray-hot spot at each magnetic pole, a wide thin self-lit field
    ring and a tight inner one, and two long, needle-thin self-lit jets with
    white knots. The ratio is the drama, so the jets stay thin."""
    HX, HY = 83.0, 145.0
    k = 0.6
    rx, ry = HX * k, HY * k
    c = (0, HY, 0)
    parts = []
    field = mix(G.void, G.indigo, 0.35)
    line = mix(G.halo, G.indigo, 0.35)
    egg = globe(1.0, field, seg=32, n=12,
                fn=lambda u: line if (math.atan2(u.z, u.x) % (TAU / 8)) < TAU / 32 and abs(u.y) < 0.97 else None,
                vfn=lambda u: mix(field, mix(G.indigo, G.blueDeep, 0.4), abs(u.y) ** 3))
    deform(egg, lambda p: Vector((p.x * rx, p.y * ry, p.z * rx)))
    place(egg, c)
    parts.append(egg)
    for s_ in (1, -1):
        parts.append(ball(9.0, G.xray, at=(0, HY + s_ * ry * 0.985, 0), seg=10, scale=(1, 0.6, 1)))
    parts.append(ring(HX * 0.92, [G.cyan, G.teal, G.halo][v], at=c, rx=0.18, tube_=0.03, seg=48, rseg=4))
    parts.append(ring(HX * 0.62, G.halo, at=c, rx=0.1, rz=0.3, tube_=0.022, seg=40, rseg=4))
    parts += jet(HY + 12, HY * 0.92, G.blueWhite, up=1, r=0.022, knots=3, hot=G.white)
    parts += jet(HY - 12, HY * 0.92, G.blueWhite, up=-1, r=0.022, knots=3, hot=G.white)
    return lift(parts)


@model('g_pulsar', ao=0.35)
def g_pulsar(v):
    """A lighthouse: an indigo ball of magnetosphere (v1's core) with a band
    of the variant's tint round its spin equator, and two beams of emission
    opening out from the magnetic poles, tipped 0.34 off the spin axis —
    cones, as v1 says, the one honest place for a cone, white where they
    leave the star and cyan out to a domed lens at the end — plus the
    self-lit field ring in the variant's tint."""
    HX, HY, K = 102.2, 155.2, 0.62
    tint = [G.teal, G.plum, G.blueDeep][v]
    c = (0, HY, 0)
    parts = []
    rx, ry = HX * K, HY * 0.62 * K
    body = globe(1.0, G.indigo, seg=20, n=10, bands=(0.12, -0.12),
                 band=lambda h: mix(G.indigo, tint, 0.55) if abs(h) < 0.12 else None,
                 vfn=lambda u: mix(G.indigo, mix(G.indigo, G.blueDeep, 0.5), abs(u.y) ** 2))
    deform(body, lambda p: Vector((p.x * rx, p.y * ry, p.z * rx)))
    place(body, c)
    parts.append(body)
    ph, Lb = 0.34, HY * 1.5
    # the hot polar caps the beams pour out of
    for s_ in (1, -1):
        d = Vector((math.sin(ph) * s_, math.cos(ph) * s_, 0.0))
        k_ = 1.0 / math.sqrt((d.x / rx) ** 2 + (d.y / ry) ** 2)
        cap = sphere(1.0, color=G.xray, seg=10, scale=(9.0, 9.0, 4.5))
        paint(cap, G.xray, lambda q: mix(G.white, G.xray, smooth01(0.0, 1.0, math.hypot(q.x, q.y) / 9.0)))
        cap.data.transform(aim(d) @ Z2Y)
        place(cap, tuple(Vector(c) + d * k_ * 0.97))
        parts.append(cap)
    rTop = HX * 0.13
    for s_ in (1, -1):
        prof = [(0.0, 0.0), (0.8, 0.0), (rTop * 0.3, Lb * 0.3), (rTop * 0.97, Lb * 0.985), (rTop * 0.9, Lb),
                (rTop * 0.5, Lb + rTop * 0.12), (0.0, Lb + rTop * 0.16)]
        bm_ = lathe(prof, color=G.cyan, seg=12, smooth=50)
        paint(bm_, G.cyan, lambda p: mix(G.white, G.cyan, smooth01(rx * 0.7, Lb * 0.55, p.z))
              if p.z < Lb else lt(G.cyan, 0.45))
        bm_.data.transform(Z2Y)
        place(bm_, c, rz=-ph if s_ > 0 else PI - ph)
        parts.append(bm_)
    parts.append(ring(HX * 0.86, tint, at=c, rx=0.14, tube_=0.022, seg=44, rseg=4))
    return lift(parts)
