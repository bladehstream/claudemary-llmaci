"""Universe-stage props, the large-scale structure: lensing arcs, galaxy
groups and clusters, CMB ripples, dark-matter haloes, shock fronts, voids,
protoclusters, cluster cores, filaments, walls, superclusters, the Great
Attractor and the supercluster complex.

Frame reminder (see kit.py): Blender Z is up, X is the prop's width, and the
game's FRONT (+Z) is Blender -Y. v1 (src/world/props/universe.js) is authored
in the game frame, so everything here is written in v1's own coordinates and
converted once, by `G()`: a v1 point (x, y, z) lands at (x, -z, y), and v1's
`ry` is the same angle turned about Blender Z. Every dimension is a multiple
of v1's span for that archetype (SP in universe.js) and every model is finally
`fit()` to its catalogue box; the build prints the RAW ratio first, so the
fit stays a polish of a layout that already matches.

The look: premium toy cosmic web. A group or cluster is one smooth halo
studded with little galaxies, each a flattened bead with a bright core (a
painted gradient, no extra triangles); arcs, fronts, strands and rims are
single swept surfaces that taper at their ends instead of rows of pips. The
only self-lit parts in v1 here are `u_ripple`'s three rings (spacekit `ring`,
glow 0.5); `U_.glow` is just a colour name, never registered as glowing.
"""
import math
import random
import bmesh
from mathutils import Vector, Matrix
import kit
from kit import (box, cyl, sphere, torus, lathe, tube, deform, recolor, lin, mixc, paint,
                 glow, C, SETS)
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


# The universe stage's own tin (U_ in src/world/props/universe.js), which the
# shared palette does not carry.
U = type('U', (), dict(
    space=0x04030a, ink=0x07060e,
    spaceLit=0x312952, slate=0x494766, slateLit=0x68648b,
    hollow=0x3d2c66, hollowRim=0x6347a0, violet=0x7e50e2, violetDim=0x57369c,
    gold=0xa8813a, goldDim=0xb68a42, goldPale=0xd8bb79, amber=0xc99a45,
    red=0xd45a42, redDim=0x803629, ember=0xb4552e,
    blue=0x7fa8cf, bluePale=0xcfe2f5, blueDim=0x5c8dbd, cyan=0x7eecff, ice=0xeaf2ff,
    halo=0x4b6390, haloLit=0x6e96ce, shock=0xc4703c, glow=0xf3f7ff, jet=0x9fd4e8,
    radio=0x9b7ee4,
))

# v1's spans (SP in universe.js): the half-width each builder works from
SP = dict(lens=340.3, group=321.9, ripple=371.5, halo=401.3, shock=479.9, cluster=524.1,
          void=648.7, protocluster=674.1, core=721.6, filament=1094.4, wall=1040.3,
          supercluster=1088.1, attractor=1159.4, complex=1470.0)

TAU = math.pi * 2


# ---------------------------------------------------------------- helpers

def L(col):
    return lin(col) if isinstance(col, int) else col


def dk(col, t=0.2):
    return mixc(L(col), (0, 0, 0), t)


def lt(col, t=0.4):
    return mixc(L(col), (1, 1, 1), t)


def G(x, y, z):
    """A v1 (game-frame) point in the Blender frame."""
    return Vector((x, -z, y))


def rng(pid, v):
    return random.Random(f'{pid}:{v}')


def grot(rot):
    """v1's Euler (rx, ry, rz), order YXZ as three.js composes it, as a 3x3."""
    rx, ry, rz = rot
    return (Matrix.Rotation(ry, 3, 'Y') @ Matrix.Rotation(rx, 3, 'X') @ Matrix.Rotation(rz, 3, 'Z'))


def paint_v(obj, cols):
    """One colour per vertex (linear rgb tuples, by vertex index)."""
    me = obj.data
    attr = me.color_attributes.get('base') or me.color_attributes.new('base', 'FLOAT_COLOR', 'CORNER')
    for poly in me.polygons:
        for li in poly.loop_indices:
            attr.data[li].color = (*cols[me.loops[li].vertex_index], 1.0)
    return obj


def ell(r, at, col, seg=8, rings=5, rot=(0, 0, 0), cf=None):
    """An ellipsoid in the GAME frame: radii r = (rx, ry up, rz), centre `at`,
    v1's rotation `rot` (radians). `cf(lx, ly, lz)` -> colour, in unit-sphere
    local coordinates (ly up), paints a gradient for free."""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=1.0)
    M = grot(rot)
    base = L(col)
    cols = []
    for vt in bm.verts:
        lx, ly, lz = vt.co.x, vt.co.z, -vt.co.y          # unit sphere, pole up (game Y)
        p = M @ Vector((lx * r[0], ly * r[1], lz * r[2]))
        vt.co = G(p.x + at[0], p.y + at[1], p.z + at[2])
        cols.append(L(cf(lx, ly, lz)) if cf else base)
    o = _from_bmesh(bm, 'ell')
    paint_v(o, cols)
    return _smooth(o, 80)


def core_cf(col, hi=None, k=0.55, spot=0.62):
    """A galaxy bead: a bright core seen from above and below, base colour at the rim."""
    a = L(col)
    b = L(hi) if hi is not None else lt(col, k)

    def f(lx, ly, lz):
        d = math.sqrt(lx * lx + lz * lz)
        t = max(0.0, 1.0 - d / spot)
        return mixc(a, b, t ** 1.3)
    return f


def sc(col, k):
    """Brighten or darken a colour by scaling its linear value (a dark colour
    mixed with white goes grey; scaled, it stays itself)."""
    return tuple(min(1.0, c * k) for c in L(col))


def env_cf(col, lo=0.55, hi=1.35):
    """A halo: darker underneath, a touch lighter on top."""
    a = sc(col, lo)
    b = sc(col, hi)
    m = L(col)

    def f(lx, ly, lz):
        t = (ly + 1) / 2
        return mixc(a, m, t / 0.6) if t < 0.6 else mixc(m, b, (t - 0.6) / 0.4)
    return f


def top_cf(col, k=0.3, low=0.2):
    """A clump: lit crown, shaded belly (scaled, so dark colours stay themselves)."""
    a = sc(col, max(0.2, 1 - 1.5 * low))
    b = sc(col, 1 + 1.5 * k)

    def f(lx, ly, lz):
        return mixc(a, b, (ly + 1) / 2)
    return f


def sweep(pts, hw, hh, col, seg=8, cf=None, ups=None, closed=False, caps=2, sq=2.0):
    """One swept surface along a game-frame polyline: section a superellipse
    (sq=2 an ellipse, 4 a rounded slab) of half-width hw(t) sideways and
    half-height hh(t) along `up`; t = 0..1 along the path. `ups` overrides the
    up vector per point (a leaning sheet). Open paths get rounded ends.
    cf(t, cx, cy) -> colour per vertex, cx/cy the section coordinates (-1..1)."""
    P = [Vector(p) for p in pts]
    n = len(P)
    frames = []
    for i in range(n):
        if closed:
            a, b = P[(i - 1) % n], P[(i + 1) % n]
        else:
            a, b = P[max(0, i - 1)], P[min(n - 1, i + 1)]
        T = (b - a).normalized()
        Up = Vector(ups[i]) if ups is not None else Vector((0, 1, 0))
        Up = Up - T * Up.dot(T)
        if Up.length < 1e-6:
            Up = Vector((1, 0, 0)) - T * T.x
        Up.normalize()
        frames.append((T, T.cross(Up).normalized(), Up))
    sect = []
    for j in range(seg):
        a = TAU * j / seg
        c, s = math.cos(a), math.sin(a)
        sect.append((math.copysign(abs(c) ** (2 / sq), c), math.copysign(abs(s) ** (2 / sq), s)))
    bm = bmesh.new()
    cols = []
    rings = []

    def ring(p, fr, w, h, t, k=1.0):
        T, Sd, Up = fr
        rr = []
        for (cx, cy) in sect:
            rr.append(bm.verts.new(G(*(p + Sd * (cx * w * k) + Up * (cy * h * k)))))
            cols.append(L(cf(t, cx, cy)) if cf else L(col))
        return rr

    def pole(p, t):
        cols.append(L(cf(t, 0, 0)) if cf else L(col))
        return [bm.verts.new(G(*p))]

    ts = [i / (n if closed else n - 1) for i in range(n)]
    if not closed:
        w0, h0 = hw(0.0), hh(0.0)
        e = 0.9 * min(w0, h0)
        rings.append(pole(P[0] - frames[0][0] * e, 0.0))
        for k in range(caps - 1, 0, -1):
            a = (math.pi / 2) * k / caps
            rings.append(ring(P[0] - frames[0][0] * e * math.sin(a), frames[0], w0, h0, 0.0, math.cos(a)))
    for i in range(n):
        rings.append(ring(P[i], frames[i], hw(ts[i]), hh(ts[i]), ts[i]))
    if not closed:
        w1, h1 = hw(1.0), hh(1.0)
        e = 0.9 * min(w1, h1)
        for k in range(1, caps):
            a = (math.pi / 2) * k / caps
            rings.append(ring(P[-1] + frames[-1][0] * e * math.sin(a), frames[-1], w1, h1, 1.0, math.cos(a)))
        rings.append(pole(P[-1] + frames[-1][0] * e, 1.0))
    pairs = list(zip(rings[:-1], rings[1:]))
    if closed:
        pairs.append((rings[-1], rings[0]))
    for a, b in pairs:
        if len(a) == 1:
            for j in range(seg):
                bm.faces.new((a[0], b[j], b[(j + 1) % seg]))
        elif len(b) == 1:
            for j in range(seg):
                bm.faces.new((a[j], b[0], a[(j + 1) % seg]))
        else:
            for j in range(seg):
                bm.faces.new((a[j], b[j], b[(j + 1) % seg], a[(j + 1) % seg]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = _from_bmesh(bm, 'sweep')
    paint_v(o, cols)
    return _smooth(o, 70)


def arc(R, phi_c, span, y, n, x0=0.0, z0=0.0, inset=0.0):
    """Points round an arc of v1's lathe (x = R sin phi, z = R cos phi)."""
    out = []
    for i in range(n):
        p = phi_c - span / 2 + span * i / (n - 1)
        out.append((x0 + (R - inset) * math.sin(p), y, z0 + (R - inset) * math.cos(p)))
    return out


def lens_disc(r, t, at, col, seg=24, cf=None, rot=(0, 0, 0)):
    """A galaxy disc: a lens, thick in the middle, a soft rim. `cf(d)` -> colour by
    radius fraction d (0 centre .. 1 rim)."""
    prof = [(0.0, -t * 0.7), (r * 0.45, -t * 0.62), (r * 0.85, -t * 0.4), (r, 0.0),
            (r * 0.85, t * 0.4), (r * 0.45, t * 0.62), (0.0, t * 0.7)]
    o = lathe(prof, at=tuple(G(*at)), color=col, seg=seg, close_bottom=False,
              rot=tuple(math.degrees(a) for a in rot))
    if cf is not None:
        c = G(*at)
        paint(o, col, lambda p: L(cf(min(1.0, math.hypot(p.x - c.x, p.y - c.y) / r))))
    return o


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


def spread(fixed, movers, pid, v, axes=(0, 1), it=4):
    """Push the scattered members (whole meshes, never resized) out or in
    along X and depth until the prop's footprint is the catalogue's: v1's box
    is set by where ITS random members fell, and stretching the body to match
    that would be the wrong fix. Returns all the parts."""
    want = target(pid, v)
    cen = []
    for o in movers:
        lo, hi = bounds([o])
        cen.append([(lo[i] + hi[i]) / 2 for i in range(3)])
    lo, hi = bounds(fixed + movers)
    print(f'MODEL-SPREAD {pid}__{v} before x{want[0] / (hi[0] - lo[0]):.3f} y{want[2] / (hi[2] - lo[2]):.3f} '
          f'z{want[1] / (hi[1] - lo[1]):.3f}')
    for _ in range(it):
        lo, hi = bounds(fixed + movers)
        flo, fhi = bounds(fixed) if fixed else ([0] * 3, [0] * 3)
        for ax in axes:
            c = (flo[ax] + fhi[ax]) / 2
            k = want[ax] / max(1e-9, hi[ax] - lo[ax])
            k = max(0.8, min(1.25, k))
            for o, ce in zip(movers, cen):
                d = (ce[ax] - c) * (k - 1)
                for vt in o.data.vertices:
                    vt.co[ax] += d
                ce[ax] += d
    for o in movers:
        o.data.update()
    return fixed + movers


def fit(parts, pid, v, keep=()):
    """Scale the prop per axis about its footprint centre and floor so its box
    is the catalogue box. Prints the RAW ratio (catalogue / as modelled, game
    frame x, y, z) first: that is the number the +-10% rule is about. Axes in
    `keep` ('x', 'y', 'z', game frame) are left at the scale they were modelled."""
    lo, hi = bounds(parts)
    want = target(pid, v)
    cx, cy = (lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2
    k = [want[i] / max(1e-9, hi[i] - lo[i]) for i in range(3)]
    print(f'MODEL-RAW {pid}__{v} x{k[0]:.3f} y{k[2]:.3f} z{k[1]:.3f}')
    if 'x' in keep:
        k[0] = 1.0
    if 'z' in keep:
        k[1] = 1.0
    if 'y' in keep:
        k[2] = 1.0
    for o in parts:
        for vt in o.data.vertices:
            p = vt.co
            vt.co = Vector(((p.x - cx) * k[0], (p.y - cy) * k[1], (p.z - lo[2]) * k[2]))
        o.data.update()
    return parts


# ---------------------------------------------------------------- shared shapes

def envelope(R, H, col, squash=1.0, seg=22, rings=11, top=1.0):
    """v1's `envelope`: the faint halo every group and cluster sits in. `top`
    lowers its crown (a fraction of H) to make room for what rides on it."""
    return ell((R, H * 0.5 * top, R * squash), (0, H * 0.5 * top, 0), col, seg, rings, cf=env_cf(col))


def env_radius(R, H, y, squash=1.0, a=0.0, top=1.0):
    """The envelope's horizontal radius at height y, in direction a."""
    q = (y - H * 0.5 * top) / (H * 0.5 * top)
    k = math.sqrt(max(0.0, 1 - q * q))
    return R * k * math.hypot(math.cos(a), math.sin(a) * squash) if squash != 1.0 else R * k


def galaxy(rr, at, col, rnd, seg=8, rings=5, flat=None):
    """One member galaxy: a flattened bead with a bright core, turned at random."""
    f = flat if flat is not None else (0.45 + rnd.random() * 0.42)
    return ell((rr, rr * f, rr * (0.8 + rnd.random() * 0.4)), at, col, seg, rings,
               rot=(0, rnd.random() * TAU, 0), cf=core_cf(col))


def spiral_galaxy(r, t, at, disc, arm, bulge, phase=0.0, arm_end=None, seg=24):
    """A toy spiral: a lens-shaped disc graded bright to dim, two raised arms
    winding out from the middle, and a bulge with a pale heart."""
    x0, y0, z0 = at
    parts = [lens_disc(r, t, at, disc, seg, cf=lambda d: mixc(sc(disc, 1.5), sc(disc, 0.7), d))]
    for k in range(2):
        a0 = k * math.pi + phase
        pts = []
        for i in range(12):
            u = i / 11
            a = a0 + u * 3.4
            d = r * (0.23 + 0.7 * u)
            pts.append((x0 + math.cos(a) * d, y0 + t * (0.6 - 0.4 * u), z0 + math.sin(a) * d))
        parts.append(sweep(pts, lambda u: r * 0.1 * (1 - 0.55 * u), lambda u: t * 0.28 * (1 - 0.4 * u),
                           arm, seg=6, cf=lambda u, cx, cy: mixc(L(arm), L(arm_end if arm_end else arm), u)))
    parts.append(ell((r * 0.33, t * 1.4, r * 0.33), (x0, y0 + t * 0.4, z0), bulge, 14, 7,
                     cf=core_cf(bulge, U.goldPale, spot=0.9)))
    return parts


def ring_swarm(R, H, n, cols, rnd, smin, smax, squash=1.0, seg=8, rings=5, top=1.0):
    """v1's `ringSwarm`: members straddling the halo's surface, so the
    silhouette is a crowd of galaxies with the halo behind them. Placed on
    the envelope itself (a little proud of it) rather than floating."""
    out = []
    for i in range(n):
        a = rnd.random() * TAU
        y = H * top * (0.24 + rnd.random() * 0.6)
        rr = R * (smin + rnd.random() * (smax - smin))
        d = env_radius(R, H, y, squash, a, top) * (0.98 + rnd.random() * 0.16) + rr * 0.3
        col = cols[int(rnd.random() * len(cols))]
        out.append(galaxy(rr, (math.cos(a) * d, y, math.sin(a) * d), col, rnd, seg, rings))
    return out


def node(x, z, R, H, n, cols, rnd, y0=0.0, seg=8, rings=5, smin=0.2, sspan=0.26, dmin=0.0):
    """v1's `node`: a knot of galaxies at one place. `dmin` keeps them out
    on the surface of whatever they gather on, where they can be seen."""
    out = []
    for i in range(n):
        a = rnd.random() * TAU
        d = max(dmin, R * math.sqrt(rnd.random()))
        rr = R * (smin + rnd.random() * sspan)
        col = cols[int(rnd.random() * len(cols))]
        out.append(galaxy(rr, (x + math.cos(a) * d, y0 + H * (0.3 + rnd.random() * 0.5), z + math.sin(a) * d),
                          col, rnd, seg, rings, flat=0.5 + rnd.random() * 0.4))
    return out


def strand(x0, z0, x1, z1, y, w, col, sag=0.0, n=9, seg=6, hi=None, taper=(1.0, 1.0), wob=0.0):
    """v1's `strand` as one tube: a gently arched, tapered thread of the web."""
    pts = [(x0 + (x1 - x0) * t, y + math.sin(t * math.pi) * sag, z0 + (z1 - z0) * t)
           for t in (i / (n - 1) for i in range(n))]

    def r(t):
        k = taper[0] + (taper[1] - taper[0]) * t
        return w * k * (1.0 + wob * math.sin(t * math.pi * 3.0))
    a = L(col)
    b = lt(col, 0.3) if hi is None else L(hi)
    return sweep(pts, r, lambda t: r(t) * 0.8, col, seg=seg,
                 cf=lambda t, cx, cy: mixc(dk(col, 0.15), b, (cy + 1) / 2))


# ================================================================= LENSING ARC

# The cluster doing the bending, gold with a pale core, and three smooth
# arcs of stretched blue light round it — each one a single crescent that
# tapers at both ends, where v1 had a partial lathe of constant height.
@model('u_lens', ao=0.45)
def u_lens(v):
    S = SP['lens']
    H = S * 0.9
    rnd = rng('u_lens', v)
    parts = [ell((S * 0.26, H * 0.24, S * 0.26), (0, H * 0.5, 0), U.gold, 20, 10,
                 cf=lambda lx, ly, lz: mixc(dk(U.gold, 0.25), L(U.goldPale),
                                            max(0.0, 1 - math.hypot(lx, lz) / 0.75) ** 1.2 * 0.9
                                            + max(0.0, ly) * 0.1))]
    for i in range(5):
        # v1 scatters these through the cluster, mostly buried; here they
        # ride its crown, where they read as galaxies and not as feet
        a = (i / 5) * TAU + rnd.random() * 0.8
        d = S * (0.12 + 0.1 * rnd.random())
        y = H * 0.5 + H * 0.24 * math.sqrt(max(0.0, 1 - (d / (S * 0.26)) ** 2)) * 0.92
        parts.append(galaxy(S * 0.065, (math.cos(a) * d, y, math.sin(a) * d), U.amber, rnd, flat=0.6))
    for k in range(3):
        R = S * (0.78 + k * 0.22)
        h = H * (0.1 + k * 0.02)
        span = 1.3 + k * 0.25
        y = H * (0.42 + k * 0.06) + h * 0.5
        col = U.ice if k == 1 else U.bluePale
        pts = arc(R, (k / 3) * TAU + v * 0.5, span, y, 22)

        def taper(t):
            return 0.12 + 0.88 * math.sin(math.pi * t) ** 0.75
        parts.append(sweep(
            pts, lambda t, R=R: R * 0.03 * taper(t), lambda t, h=h: h * 0.5 * taper(t), col, seg=8,
            cf=lambda t, cx, cy, col=col: mixc(L(U.blueDim), lt(col, 0.35),
                                               0.35 + 0.65 * math.sin(math.pi * t) ** 1.5 * (0.7 + 0.3 * cy))))
    return fit(parts, 'u_lens', v)


# ================================================================= GROUPS, CLUSTERS AND THE WEB

# A halo with the dominant spiral sitting proud on top of it — a blue disc
# with two pale arms and an amber bulge — and the hangers-on round the rim.
@model('u_group', ao=0.5)
def u_group(v):
    S = SP['group']
    H = S * 0.72
    rnd = rng('u_group', v)
    top = 0.86
    parts = [envelope(S, H, U.spaceLit, 0.96, 20, 10, top=top)]
    yd = H * 0.925
    parts += spiral_galaxy(S * 0.31, H * 0.05, (0, yd, 0), U.blueDim, U.bluePale, U.amber, v * 0.7, U.blue)
    movers = ring_swarm(S, H, 12 + v, [U.goldDim, U.blueDim, U.spaceLit, U.redDim], rnd, 0.07, 0.13, 0.96, top=top)
    for i in range(4):
        a = rnd.random() * TAU
        y = H * top * (0.35 + rnd.random() * 0.5)
        dd = env_radius(S, H, y, top=top) * (1.0 + rnd.random() * 0.08) + S * 0.03
        movers.append(ell((S * 0.04,) * 3, (math.cos(a) * dd, y, math.sin(a) * dd), U.goldPale, 6, 4))
    return fit(spread(parts, movers, 'u_group', v), 'u_group', v)


# The oldest light: three concentric ridges swelling toward the middle, each
# one continuous (v1 broke them into blobs) and crested with v1's thin
# self-lit ring, glow 0.5 as spacekit's `ring` gives it.
@model('u_ripple', ao=0.45)
def u_ripple(v):
    S = SP['ripple']
    H = S * 0.62
    parts = []
    for k in range(3):
        rad = S * (0.94 - k * 0.3)
        yc = H * (0.16 + k * 0.2)
        hh0 = H * (0.16 + k * 0.06)
        hw0 = S * 0.07
        col = U.violet if k % 2 else U.haloLit
        n = [34, 26, 18][k]
        lobes = 12 - k * 2
        ph = k * 0.3 + v * 0.2
        pts, bulge = [], []
        for i in range(n):
            a = (i / n) * TAU
            pts.append((math.cos(a) * rad, yc, math.sin(a) * rad))
        wav = lambda t, lobes=lobes, ph=ph: 0.8 + 0.2 * math.cos(t * TAU * lobes - ph * lobes)
        parts.append(sweep(pts, lambda t, hw0=hw0, wav=wav: hw0 * (0.5 + 0.5 * wav(t)), lambda t, hh0=hh0, wav=wav: hh0 * wav(t) ** 2,
                           col, seg=7, closed=True,
                           cf=lambda t, cx, cy, col=col: mixc(dk(col, 0.3), lt(col, 0.18), (cy + 1) / 2)))
        tube_r = rad * (0.055 - k * 0.008)
        rg = torus(rad, tube_r, at=tuple(G(0, yc + hh0 * 0.62, 0)), color=col,
                   seg=[36, 28, 20][k], rseg=5)
        parts.append(glow(rg, 0.5))
    parts.append(ell((S * 0.24, H * 0.2, S * 0.24), (0, H * 0.66, 0), U.violetDim, 18, 9,
                     cf=top_cf(U.violetDim, 0.2, 0.25)))
    parts.append(ell((S * 0.08,) * 3, (0, H * 0.8, 0), U.hollowRim, 12, 6, cf=top_cf(U.hollowRim, 0.3, 0.1)))
    return fit(parts, 'u_ripple', v)


# A shell of soft dark-matter pillows round one small galaxy. No envelope,
# as in v1: the inside of a halo is genuinely inside.
@model('u_halo', ao=0.5)
def u_halo(v):
    S = SP['halo']
    H = S
    parts = []
    n = 14
    for i in range(n):
        el = math.acos(1 - 2 * ((i + 0.5) / n))
        az = i * 2.399963
        x = math.sin(el) * math.cos(az) * S * 0.81
        z = math.sin(el) * math.sin(az) * S * 0.81
        y = H * 0.5 + math.cos(el) * H * 0.4
        col = U.haloLit if i % 4 == 0 else U.halo
        parts.append(ell((S * 0.19, H * 0.105, S * 0.175), (x, y, z), col, 12, 5, rot=(0, az, 0),
                         cf=lambda lx, ly, lz, col=col: mixc(sc(col, 0.6), sc(col, 1.3), (ly + 1) / 2)))
    # the one galaxy the halo is holding, a gold spiral, tipped to be seen
    parts += spiral_galaxy(S * 0.24, H * 0.05, (0, H * 0.5, 0), U.goldDim, U.goldPale, U.goldPale, 0.4 + v, U.amber)
    if v:
        parts.append(galaxy(S * 0.12, (S * 0.3, H * 0.56, -S * 0.24), U.blueDim, rng('u_halo', v), 10, 5,
                            flat=0.5))
    return fit(parts, 'u_halo', v)


def leaning_sheet(R, h, span, y0, bow, t, col, cf, n=26, seg=10, phi_c=0.0, x0=0.0, end=0.55):
    """v1's `sheet()` as one tapered sail: an arc of radius R, `h` tall from
    y0, its top leaning `bow` x R inwards, `t` x R half-thick. Toward the ends
    it drops to `end` of the full height, its foot staying on y0, so it reads
    as one front and not a fence."""
    lean = bow * R
    hh_full = math.hypot(h, lean) * 0.5

    def k(tt):
        return end + (1 - end) * math.sin(math.pi * tt) ** 0.35
    pts, ups = [], []
    for i in range(n):
        tt = i / (n - 1)
        p = phi_c - span / 2 + span * tt
        rx, rz = math.sin(p), math.cos(p)
        rm = R - lean * 0.5 * k(tt)
        pts.append((x0 + rx * rm, y0 + h * 0.5 * k(tt), rz * rm))
        ups.append((-rx * lean, h, -rz * lean))
    return sweep(pts, lambda tt: R * t * (0.5 + 0.5 * k(tt)), lambda tt: hh_full * k(tt), col, seg=seg,
                 ups=ups, cf=cf, sq=3.0)


# ONE front, not a palisade: two leaning sails of hot gas wrapped round the
# front of a dim red body, the outer one brightest along its crest.
@model('u_shock', ao=0.5)
def u_shock(v):
    S = SP['shock']
    H = S * 0.86
    rnd = rng('u_shock', v)
    sweep_a = 2.0 + v * 0.2
    movers = []
    parts = [ell((S * 0.6, H * 0.42, S * 0.6), (0, H * 0.44, 0), U.redDim, 22, 11,
                 cf=lambda lx, ly, lz: mixc(sc(U.redDim, 0.6), sc(U.redDim, 1.25), (ly + 1) / 2))]
    parts.append(leaning_sheet(S * 1.05, H * 0.86, sweep_a, H * 0.06, 0.2, 0.04, U.shock,
                               lambda t, cx, cy: mixc(sc(U.shock, 0.5), sc(U.shock, 1.45), ((cy + 1) / 2) ** 1.3),
                               n=28, seg=10))
    parts.append(leaning_sheet(S * 0.78, H * 0.6, sweep_a * 0.86, H * 0.14, 0.24, 0.045, U.ember,
                               lambda t, cx, cy: mixc(sc(U.ember, 0.5), sc(U.ember, 1.25), (cy + 1) / 2),
                               n=22, seg=10))
    for i in range(6):
        a = -sweep_a / 2 + rnd.random() * sweep_a
        dd = S * (0.7 + rnd.random() * 0.5)
        y = H * (0.2 + rnd.random() * 0.3)
        # where v1 puts them (x = cos, z = sin: off the sails' flank)
        movers.append(ell((S * 0.2, H * 0.16, S * 0.14), (math.cos(a) * dd, y, math.sin(a) * dd), U.redDim, 8, 5,
                          rot=(0, -a, 0), cf=top_cf(U.redDim, 0.15, 0.3)))
    parts.append(ell((S * 0.2, H * 0.22, S * 0.18), (-S * 0.5, H * 0.3, 0), U.gold, 14, 7,
                     cf=core_cf(U.gold, U.goldPale, spot=0.8)))
    return fit(spread(parts, movers, 'u_shock', v), 'u_shock', v)


# A hundred galaxies in a bag of hot gas: the halo, the brightest cluster
# galaxy proud on top in three nested tones, and the crowd round the rim.
@model('u_cluster', ao=0.5)
def u_cluster(v):
    S = SP['cluster']
    H = S * 0.84
    rnd = rng('u_cluster', v)
    parts = [envelope(S, H, U.spaceLit, 0.95, 20, 10)]
    parts.append(ell((S * 0.3, H * 0.2, S * 0.29), (0, H * 0.84, 0), U.slateLit, 16, 8,
                     cf=top_cf(U.slateLit, 0.1, 0.3)))
    parts.append(ell((S * 0.16, H * 0.12, S * 0.15), (0, H * 0.97, 0), U.gold, 12, 6,
                     cf=core_cf(U.gold, U.goldPale, spot=0.9)))
    parts.append(ell((S * 0.06, H * 0.05, S * 0.06), (0, H * 1.08, 0), U.goldPale, 8, 5,
                     cf=core_cf(U.goldPale, k=0.5, spot=0.9)))
    movers = ring_swarm(S, H, 18 + v, [U.goldDim, U.redDim, U.blueDim, U.spaceLit, U.amber], rnd, 0.055, 0.11, 0.95)
    return fit(spread(parts, movers, 'u_cluster', v), 'u_cluster', v)


# THE HOLLOW ONE: a closed rim of dim galaxies round nothing, joined at the
# foot by one low violet rim, one wisp drifting across, one galaxy left inside.
@model('u_void', ao=0.5)
def u_void(v):
    S = SP['void']
    H = S * 0.6
    parts = []
    n, br = 12, S * 0.21
    rr = S - br
    for i in range(n):
        a = (i / n) * TAU
        w = 0.82 + ((i + v) % 3) * 0.12
        col = U.goldDim if i % 4 == 0 else (U.blueDim if i % 4 == 2 else U.violet)
        parts.append(ell((br * w, H * (0.4 + ((i + v) % 2) * 0.1), br * w * 0.85),
                         (math.cos(a) * rr, H * 0.42, math.sin(a) * rr), col, 10, 6, rot=(0, -a, 0),
                         cf=lambda lx, ly, lz, col=col: mixc(sc(col, 0.55), sc(col, 1.2), ((ly + 1) / 2) ** 0.8)))
        if i % 3 == 0:
            a2 = a + 0.26
            parts.append(ell((br * 0.4, H * 0.14, br * 0.34),
                             (math.cos(a2) * rr * 0.82, H * 0.3, math.sin(a2) * rr * 0.82),
                             U.hollowRim, 8, 5, cf=top_cf(U.hollowRim, 0.15, 0.3)))
    # the low rim that closes the ring at its foot
    pts = [(math.cos(i / 36 * TAU) * rr * 0.97, H * 0.1, math.sin(i / 36 * TAU) * rr * 0.97) for i in range(36)]
    parts.append(sweep(pts, lambda t: br * 0.55, lambda t: H * 0.1, U.violetDim, seg=6, closed=True,
                       cf=lambda t, cx, cy: mixc(sc(U.violetDim, 0.6), L(U.violetDim), (cy + 1) / 2)))
    # one lonely wisp crossing the emptiness
    wp = []
    for i in range(12):
        t = i / 11
        wp.append((-S * 0.66 + t * S * 1.32, H * 0.34, math.sin(t * 3.1 + v) * S * 0.3 * (0.4 + 0.6 * t)))
    parts.append(sweep(wp, lambda t: S * 0.05 * (0.35 + 0.65 * math.sin(math.pi * t)),
                       lambda t: H * 0.06 * (0.35 + 0.65 * math.sin(math.pi * t)), U.violetDim, seg=6,
                       cf=lambda t, cx, cy: mixc(L(U.violetDim), L(U.violet), (cy + 1) / 2)))
    parts.append(galaxy(S * 0.08, (S * 0.1, H * 0.3, -S * 0.14), U.redDim, rng('u_void', v), 10, 5, flat=0.9))
    return fit(parts, 'u_void', v)


# A young cluster still assembling: a knot of hot blue galaxies high on the
# halo, three arched strands running out to three smaller knots.
@model('u_protocluster', ao=0.5)
def u_protocluster(v):
    S = SP['protocluster']
    H = S * 0.8
    rnd = rng('u_protocluster', v)
    parts = [envelope(S, H, U.spaceLit, 0.96, 20, 10)]
    parts += node(0, 0, S * 0.42, H * 1.6, 9, [U.bluePale, U.blue, U.cyan, U.ice], rnd, H * 0.32, 10, 5)
    for k in range(3):
        a = (k / 3) * TAU + v * 0.6
        ex, ez = math.cos(a) * S * 1.05, math.sin(a) * S * 1.05
        parts.append(strand(math.cos(a) * S * 0.3, math.sin(a) * S * 0.3, ex * 0.95, ez * 0.95, H * 0.86,
                            S * 0.055, U.blueDim, sag=H * 0.12, n=10, taper=(1.0, 0.75), hi=U.blue))
        parts += node(ex * 0.94, ez * 0.94, S * 0.17, H * 1.1, 3, [U.blue, U.blueDim, U.goldDim], rnd, H * 0.3, 8, 4)
    parts.append(ell((S * 0.17, H * 0.15, S * 0.17), (0, H * 0.95, 0), U.ice, 12, 6,
                     cf=lambda lx, ly, lz: mixc(L(U.blue), L(U.ice), (ly + 1) / 2)))
    return fit(parts, 'u_protocluster', v)


# The cD galaxy is the subject: a great gold lens riding on the halo in
# three nested tones with a white heart, the crowd round the rim, and four
# icy cold fronts as clean little crescents sloshing round the core.
@model('u_core', ao=0.5)
def u_core(v):
    S = SP['core']
    H = S * 0.96
    rnd = rng('u_core', v)
    parts = [envelope(S, H, U.slate, 0.94, 20, 10)]
    parts.append(ell((S * 0.5, H * 0.26, S * 0.46), (0, H * 0.8, 0), U.goldDim, 18, 9, rot=(0, v * 0.5, 0),
                     cf=lambda lx, ly, lz: mixc(sc(U.goldDim, 0.6), L(U.goldDim), min(1.0, (ly + 1) / 1.4))))
    parts.append(ell((S * 0.28, H * 0.18, S * 0.26), (0, H * 0.92, 0), U.gold, 14, 7,
                     cf=top_cf(U.gold, 0.1, 0.25)))
    parts.append(ell((S * 0.12, H * 0.1, S * 0.11), (0, H * 1.02, 0), U.goldPale, 10, 5,
                     cf=core_cf(U.goldPale, k=0.3, spot=0.9)))
    parts.append(ell((S * 0.05,) * 3, (0, H * 1.09, 0), U.glow, 8, 5))
    movers = ring_swarm(S, H, 14, [U.redDim, U.amber, U.goldDim, U.blueDim], rnd, 0.05, 0.1, 0.94)
    for k in range(4):
        a = (k / 4) * TAU + 0.4
        rad = S * 1.0
        pts = []
        for i in range(8):
            t = i / 7
            b = a - 0.3 + 0.6 * t
            pts.append((math.cos(b) * rad, H * 0.62 + math.sin(t * math.pi) * H * 0.04, math.sin(b) * rad))
        parts.append(sweep(pts, lambda t: S * 0.03 * (0.3 + 0.7 * math.sin(math.pi * t)),
                           lambda t: H * 0.11 * (0.3 + 0.7 * math.sin(math.pi * t) ** 0.7), U.ice, seg=6, sq=2.5,
                           ups=[(math.cos(a) * 0.4, 1, math.sin(a) * 0.4)] * 8,
                           cf=lambda t, cx, cy: mixc(L(U.bluePale), L(U.ice), (cy + 1) / 2)))
    return fit(spread(parts, movers, 'u_core', v), 'u_core', v)


def surf_y(R, H, r, top=1.0):
    """Height of an envelope's crown (radius R, H tall) at horizontal distance r."""
    q = min(1.0, r / R)
    return H * 0.5 * top * (1 + math.sqrt(max(0.0, 1 - q * q)))


# A strand of the cosmic web: ONE tube of gas along a gentle S that swells
# into six dark knots (v1's knots and its eleven overlapping gas lozenges,
# welded into the single surface v1's comment says they were meant to read
# as), with the galaxies gathered on the knots.
@model('u_filament', ao=0.5)
def u_filament(v):
    S = SP['filament']
    H = S * 0.95
    rnd = rng('u_filament', v)
    parts, movers = [], []

    def path_z(t):
        return math.sin(t * 3.3 + v) * S * 0.26
    n = 6
    knots = []
    for i in range(n):
        t = i / (n - 1)
        s = math.sin(t * math.pi)
        rr = S * (0.12 + s * 0.1)
        knots.append((t, rr, H * (0.3 + s * 0.2)))
        movers += node(-S * 0.6 + t * S * 1.2, path_z(t), rr * 1.4, H * (0.7 + s * 0.3), 2 if i % 2 == 0 else 3,
                       [U.goldDim, U.blueDim, U.redDim, U.spaceLit], rnd, 0.0, 8, 5, dmin=rr * 0.95)
    m = 44
    t0, t1 = -0.16, 1.16
    pts = [(-S * 0.6 + (t0 + (t1 - t0) * i / (m - 1)) * S * 1.2, H * 0.43,
            path_z(t0 + (t1 - t0) * i / (m - 1))) for i in range(m)]

    def bump(u):
        """0 between knots, 1 on one; and that knot's (width, height)."""
        t = t0 + (t1 - t0) * u
        best, w, h = 0.0, 0.0, 0.0
        for (tk, rr, hk) in knots:
            g = math.exp(-((t - tk) / 0.1) ** 2)
            if g > best:
                best, w, h = g, rr, hk
        return best, w, h

    def ends(u):
        return 0.3 + 0.7 * min(1.0, math.sin(math.pi * u) * 2.2) ** 0.6

    def hw(u):
        g, w, h = bump(u)
        return (S * 0.13 + (w * 0.92 - S * 0.13) * g) * ends(u)

    def hh(u):
        g, w, h = bump(u)
        return (H * 0.22 + (h * 1.0 - H * 0.22) * g) * ends(u)

    def cf(u, cx, cy):
        g = bump(u)[0]
        c = mixc(L(U.slateLit), L(U.slate), g)
        return mixc(sc(c, 0.55), sc(c, 1.3), (cy + 1) / 2)
    parts.append(sweep(pts, hw, hh, U.slateLit, seg=12, cf=cf))
    return fit(spread(parts, movers, 'u_filament', v, axes=(1,)), 'u_filament', v)


def face_cf(col, k=0.5, spot=0.6):
    """A galaxy seen face-on on a vertical wall: bright core in its own plane."""
    a, b = L(col), lt(col, k)

    def f(lx, ly, lz):
        t = max(0.0, 1.0 - math.hypot(lx, ly) / spot)
        return mixc(a, b, t ** 1.3)
    return f


# A wall of galaxies: one tall, thin, buckled curtain, the galaxies pinned
# flat on both faces of it like discs on a screen.
# v1 QUIRK: v1's curtain is a lathe arc whose midpoint it moved to the
# centre on X, which leaves it running along DEPTH, square across the galaxy
# plane (its own comment says it meant to run through it) -- so the catalogue
# box is 1,885 deep where v1's galaxies alone are ~1,150. Here the curtain
# runs through the galaxies, and both follow one S-buckle deep enough to win
# back most of that depth; the rest is left short rather than stretching the
# whole wall (see the RAW line, depth).
@model('u_wall', ao=0.5)
def u_wall(v):
    S = SP['wall']
    H = S * 1.05
    rnd = rng('u_wall', v)
    ph = v * 0.9 - 2.2
    lo = min(math.sin(4.4 * i / 200 + ph) for i in range(201))
    hi = max(math.sin(4.4 * i / 200 + ph) for i in range(201))
    want = target('u_wall', v)[1]
    A = max(S * 0.45, min(S * 0.78, (want * 0.93 - S * 0.25) / (hi - lo)))
    zc = -(hi + lo) * 0.5 * A

    def path_z(t):
        return math.sin(t * 4.4 + ph) * A + zc

    def tangent(t):
        dz = math.cos(t * 4.4 + ph) * A * 4.4
        ln = math.hypot(S * 1.76, dz)
        return S * 1.76 / ln, dz / ln
    T = S * 0.04
    parts = []
    for i in range(7):
        for k in range(4):
            if (i * 4 + k + v) % 7 == 3:
                continue
            t, u = i / 6, k / 3
            t = min(1.0, max(0.0, t + (rnd.random() - 0.5) * 0.06))
            x = -S * 0.88 + t * S * 1.76
            tx, tz = tangent(t)
            side = 1 if (i + k) % 2 else -1
            rr = S * (0.09 + rnd.random() * 0.06)
            th = rr * 0.3
            off = (T * 0.6 + th * 0.55) * side
            col = U.goldDim if (i + k) % 3 == 0 else (U.blueDim if (i + k) % 3 == 1 else U.redDim)
            parts.append(ell((rr, rr * (0.6 + rnd.random() * 0.4), th),
                             (x - tz * off, H * (0.1 + u * 0.82), path_z(t) + tx * off), col, 8, 5,
                             rot=(0, math.atan2(-tz, tx), (rnd.random() - 0.5) * 0.8), cf=face_cf(col)))
    pts = []
    m = 30
    for i in range(m):
        t = -0.04 + 1.08 * i / (m - 1)
        pts.append((-S * 0.88 + t * S * 1.76, H * 0.5, path_z(t)))

    def taper(t):
        return 0.6 + 0.4 * math.sin(math.pi * t) ** 0.3
    parts.append(sweep(pts, lambda t: T * taper(t), lambda t: H * 0.47 * taper(t), U.slate, seg=10, sq=3.0,
                       cf=lambda t, cx, cy: mixc(sc(U.slate, 0.55), sc(U.slateLit, 1.15), ((cy + 1) / 2) ** 1.2)))
    return fit(parts, 'u_wall', v, keep=('z',))


# Four clusters on one halo, tied by three arched strands to the biggest.
@model('u_supercluster', ao=0.5)
def u_supercluster(v):
    S = SP['supercluster']
    H = S * 0.78
    rnd = rng('u_supercluster', v)
    parts = [envelope(S, H, U.spaceLit, 0.97, 20, 10)]
    movers = []
    pts = []
    for k in range(4):
        a = (k / 4) * TAU + v * 0.5
        dd = S * (0.2 if k == 0 else 0.82)
        pts.append((math.cos(a) * dd, math.sin(a) * dd, 0.3 if k == 0 else 0.19 + rnd.random() * 0.05))
    for (x, z, w) in pts:
        parts.append(ell((S * w * 0.8, H * w * 0.7, S * w * 0.76), (x, H * 0.84, z), U.slate, 12, 6,
                         cf=top_cf(U.slate, 0.25, 0.3)))
        movers += node(x, z, S * w, H * 1.3, 5, [U.goldDim, U.amber, U.redDim, U.blueDim], rnd, H * 0.34, 8, 4)
        parts.append(ell((S * w * 0.24, H * w * 0.3, S * w * 0.22), (x, H * 0.84 + H * w * 0.55, z), U.gold, 8, 5,
                         cf=core_cf(U.gold, U.goldPale, spot=0.9)))
    for k in range(1, 4):
        x0, z0 = pts[0][0], pts[0][1]
        x1, z1 = pts[k][0] * 0.9, pts[k][1] * 0.9
        q = []
        for i in range(8):
            t = i / 7
            x, z = x0 + (x1 - x0) * t, z0 + (z1 - z0) * t
            q.append((x, max(H * 0.84, surf_y(S, H, math.hypot(x, z)) + H * 0.02) + math.sin(t * math.pi) * H * 0.08, z))
        parts.append(sweep(q, lambda t: S * 0.05 * (1 - 0.3 * t), lambda t: S * 0.04 * (1 - 0.3 * t), U.haloLit,
                           seg=6, cf=lambda t, cx, cy: mixc(sc(U.haloLit, 0.7), sc(U.haloLit, 1.3), (cy + 1) / 2)))
    parts.append(ell((S * 0.05,) * 3, (pts[0][0], H * 0.84 + H * 0.3 * 0.55 + H * 0.1, pts[0][1]), U.glow, 8, 5))
    return fit(spread(parts, movers, 'u_supercluster', v, axes=(0, 1, 2)), 'u_supercluster', v)


# Everything for a hundred megaparsecs falling into one place: a stacked
# core in three tones with a white heart, and six tapering streams curling
# in over the rim from six little knots of galaxies.
@model('u_attractor', ao=0.5)
def u_attractor(v):
    S = SP['attractor']
    H = S * 0.92
    rnd = rng('u_attractor', v)
    parts = [envelope(S, H, U.slate, 0.96, 20, 10)]
    parts.append(ell((S * 0.36, H * 0.24, S * 0.34), (0, H * 0.86, 0), U.slateLit, 16, 8,
                     cf=top_cf(U.slateLit, 0.15, 0.3)))
    parts.append(ell((S * 0.22, H * 0.16, S * 0.2), (0, H * 0.96, 0), U.goldDim, 14, 7,
                     cf=top_cf(U.goldDim, 0.1, 0.25)))
    parts.append(ell((S * 0.11, H * 0.1, S * 0.1), (0, H * 1.06, 0), U.amber, 10, 5,
                     cf=core_cf(U.amber, U.goldPale, spot=0.9)))
    parts.append(ell((S * 0.06,) * 3, (0, H * 1.13, 0), U.glow, 8, 5))
    movers = []
    for k in range(6):
        a = (k / 6) * TAU + v * 0.4
        col = U.haloLit if k % 2 else U.redDim
        q = []
        for i in range(9):
            t = i / 8
            r = S * (1.2 - 0.92 * t)
            b = a + 0.45 * t * t
            y0 = H * 0.84 + (surf_y(S, H, S * 0.28) + H * 0.03 - H * 0.84) * t
            q.append((math.cos(b) * r, max(y0 + math.sin(t * math.pi) * H * 0.12, surf_y(S, H, r) + H * 0.03), math.sin(b) * r))
        parts.append(sweep(q, lambda t: S * 0.055 * (1 - 0.55 * t), lambda t: S * 0.045 * (1 - 0.55 * t), col, seg=6,
                           cf=lambda t, cx, cy, col=col: mixc(sc(col, 0.7), sc(col, 1.35), (cy + 1) / 2)))
        movers += node(math.cos(a) * S * 1.1, math.sin(a) * S * 1.1, S * 0.17, H * 1.2, 2,
                       [U.goldDim, U.blueDim, U.redDim], rnd, H * 0.3, 8, 4)
    return fit(spread(parts, movers, 'u_attractor', v), 'u_attractor', v)


# The whole web in one object: five superclusters on one great halo, the
# filaments that tie them to the middle, and a void you can see into.
@model('u_complex', ao=0.5)
def u_complex(v):
    S = SP['complex']
    H = S * 0.84
    rnd = rng('u_complex', v)
    parts = [envelope(S, H, U.spaceLit, 0.97, 18, 9)]
    movers = []
    pts = [(0, 0, 0.4), (0.78, -0.55, 0.26), (-0.66, 0.72, 0.28), (0.68, 0.74, 0.2), (-0.8, -0.64, 0.19)]
    for (fx, fz, w) in pts:
        x, z = fx * S, fz * S
        # v1's slate dome, slate-lit inner dome and gold crown, as one
        # graded dome: slate at the foot, slate-lit, then a gold cap
        def cf(lx, ly, lz):
            d = math.hypot(lx, lz)
            c = mixc(sc(U.slate, 0.7), L(U.slateLit), min(1.0, (ly + 1) / 1.5))
            return mixc(c, L(U.gold), max(0.0, 1 - d / 0.42) ** 0.7) if ly > 0 else c
        parts.append(ell((S * w * 0.84, H * w * 0.6, S * w * 0.8), (x, H * 0.84, z), U.slate, 12, 6, cf=cf))
        movers += node(x, z, S * w * 0.9, H * 1.2, 4, [U.goldDim, U.amber, U.redDim, U.blueDim, U.spaceLit], rnd,
                      H * 0.34, 7, 4, smin=0.22, sspan=0.28)
    for k in range(1, len(pts)):
        x1, z1 = pts[k][0] * S * 0.86, pts[k][1] * S * 0.86
        q = []
        for i in range(8):
            t = i / 7
            x, z = x1 * t, z1 * t
            q.append((x, max(H * 0.84, surf_y(S, H, math.hypot(x, z)) + H * 0.01) + math.sin(t * math.pi) * H * 0.07, z))
        col = U.haloLit if k % 2 else U.halo
        parts.append(sweep(q, lambda t: S * 0.045 * (1 - 0.3 * t), lambda t: S * 0.036 * (1 - 0.3 * t), col, seg=5,
                           cf=lambda t, cx, cy, col=col: mixc(sc(col, 0.7), sc(col, 1.4), (cy + 1) / 2)))
    # the void: a ring of dim galaxies round a piece of nothing, as one rim
    q = []
    m = 16
    for i in range(m):
        a = (i / m) * TAU + v * 0.4
        x, z = math.cos(a) * S * 0.42 - S * 0.06, math.sin(a) * S * 0.42 + S * 0.06
        q.append((x, surf_y(S, H, math.hypot(x, z)) + H * 0.01, z))
    parts.append(sweep(q, lambda t: S * 0.05 * (0.8 + 0.2 * math.cos(t * TAU * 8)),
                       lambda t: H * 0.05 * (0.8 + 0.2 * math.cos(t * TAU * 8)), U.violet, seg=6, closed=True,
                       cf=lambda t, cx, cy: mixc(sc(U.violetDim, 0.8), L(U.violet), 0.5 + 0.5 * math.cos(t * TAU * 8))))
    parts.append(ell((S * 0.045,) * 3, (0, H * 0.84 + H * 0.4 * 0.6 + H * 0.02, 0), U.glow, 8, 4))
    return fit(spread(parts, movers, 'u_complex', v, axes=(0, 1, 2)), 'u_complex', v)
