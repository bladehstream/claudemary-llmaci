"""Microbe-stage props, the culture's cells: organelles up to an amoeba.

Frame reminder (see kit.py): Blender Z is up, X is the prop's width, and the
game's FRONT (+Z) is Blender -Y. v1 (src/world/props/microbe.js) is authored in
the game frame, so every coordinate here is written as v1 writes it, game
(x, y, z), and `G()` turns it into Blender (x, -z, y) at the last moment. Each
model keeps v1's layout and its per-variant angles, so the sizes and the facing
are v1's; what changes is the making.

The look: soft, glossy toy cells. Smooth single-surface bodies (a bent bean, a
comma, a helix are one sweep, not a row of beads), a soft painted highlight
since vertex colour is all there is, and the identifying insides shown the
textbook way: cut-away lids with cristae and grana, nucleoids and nuclei as
darker raised blocks. Nothing in microbe.js glows and nothing is ghost, so
nothing here does either.
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

# The culture's own palette (M in src/world/props/microbe.js); not in palette.js.
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


def hash01(*a):
    x = math.sin(sum(v * k for v, k in zip(a, (12.9898, 78.233, 37.719, 4.581)))) * 43758.5453
    return x - math.floor(x)


def _smoothstep(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


KEY = Vector((-0.38, -0.42, 0.82)).normalized()   # top, front-left: where the gloss sits


def gloss_fn(col, c, sc=(1, 1, 1), hi=0.32, lo=0.14):
    """Colour function for a glossy toy cell: a soft white highlight towards the
    key light, the body colour, and a little weight underneath. `c` and `sc`
    are the Blender-frame centre and radii the normal is estimated from."""
    base = L(col)

    def fn(p):
        n = Vector(((p.x - c.x) / sc[0], (p.y - c.y) / sc[1], (p.z - c.z) / sc[2]))
        if n.length > 1e-9:
            n.normalize()
        s = n.dot(KEY)
        out = mixc(base, (1, 1, 1), hi * _smoothstep(0.7, 0.98, s))
        return mixc(out, (0, 0, 0), lo * max(0.0, -n.z))
    return fn


def gloss_n(o, hi=0.32, lo=0.14, keep=None):
    """Re-shade a painted part with the gloss, from its own vertex normals: works
    for any shape (a bent bean, a capsule, a lathe). `keep(face_centre, normal)`
    True leaves a face's colour flat (lids, bands that should stay matte)."""
    me = o.data
    attr = me.color_attributes['base']
    for poly in me.polygons:
        if keep is not None and keep(poly.center, poly.normal):
            continue
        for li in poly.loop_indices:
            nn = me.vertices[me.loops[li].vertex_index].normal
            c = attr.data[li].color
            cc = mixc((c[0], c[1], c[2]), (1, 1, 1), hi * _smoothstep(0.7, 0.98, nn.dot(KEY)))
            cc = mixc(cc, (0, 0, 0), lo * max(0.0, -nn.z))
            attr.data[li].color = (*cc, 1.0)
    return o


def ball(P, p, r, col, tess=(16, 8), sc=(1, 1, 1), hi=0.32, lo=0.14):
    """A cell or a bead: a UV sphere at game p, `sc` its game-frame stretch."""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=tess[0], v_segments=tess[1], radius=r)
    o = _from_bmesh(bm, 'ball')
    c = G(p)
    s = (sc[0], sc[2], sc[1])
    o.data.transform(Matrix.Diagonal((*s, 1.0)))
    o.data.transform(Matrix.Translation(c))
    o.data.update()
    paint(o, (0, 0, 0), gloss_fn(col, c, tuple(x * r for x in s), hi, lo))
    _smooth(o, 80)
    P.append(o)
    return o


def sweep(P, pts, r, col, n=8, radii=None, ends=3, hi=0.0, band=None, lo=0.0):
    """A smooth round tube along game points, `radii` per point (or r), its two
    ends closed as rounded domes of `ends` rings (0 = flat caps). `band(u)`,
    u 0..1 along the points, may return a colour for that stretch (stripes);
    `hi`/`lo` paint the gloss highlight and underside weight round the tube."""
    bp = [G(p) for p in pts]
    rr = list(radii) if radii else [r] * len(bp)
    tang = []
    for i in range(len(bp)):
        t = bp[min(i + 1, len(bp) - 1)] - bp[max(i - 1, 0)]
        tang.append(t.normalized())
    # a frame carried along the curve (parallel transport), so the rings never twist
    up = Vector((0, 0, 1)) if abs(tang[0].z) < 0.9 else Vector((1, 0, 0))
    nrm = tang[0].cross(up).normalized()
    frames = []
    for i, t in enumerate(tang):
        if i:
            nrm = (nrm - t * nrm.dot(t)).normalized()
        frames.append((nrm.copy(), t.cross(nrm).normalized()))
    centres, rads, fr = list(bp), list(rr), list(frames)
    if ends:
        for side in (0, 1):
            k = 0 if side == 0 else -1
            d = -tang[0] if side == 0 else tang[-1]
            add_c, add_r = [], []
            for j in range(1, ends + 1):
                a = (math.pi / 2) * j / (ends + 0.35)
                add_c.append(bp[k] + d * rr[k] * math.sin(a))
                add_r.append(rr[k] * math.cos(a))
            if side == 0:
                centres = list(reversed(add_c)) + centres
                rads = list(reversed(add_r)) + rads
                fr = [frames[0]] * ends + fr
            else:
                centres = centres + add_c
                rads = rads + add_r
                fr = fr + [frames[-1]] * ends
    bm = bmesh.new()
    rings_ = []
    vinfo = []          # per vertex: (unit normal, u along the path)
    npts = len(bp)
    for ri, (c, rad, (u, w)) in enumerate(zip(centres, rads, fr)):
        k = ri - (ends if ends else 0)
        uu = min(1.0, max(0.0, k / max(1, npts - 1)))
        ring_v = []
        for j in range(n):
            d = u * math.cos(j / n * TAU) + w * math.sin(j / n * TAU)
            ring_v.append(bm.verts.new(c + d * rad))
            nn = d.copy()
            if ends and (k < 0 or k > npts - 1):
                e = (-tang[0]) if k < 0 else tang[-1]
                a = math.acos(max(-1.0, min(1.0, rad / max(1e-9, rr[0 if k < 0 else -1]))))
                nn = (d * math.cos(a) + e * math.sin(a)).normalized()
            vinfo.append((nn, uu))
        rings_.append(ring_v)
    for i in range(len(rings_) - 1):
        a, b = rings_[i], rings_[i + 1]
        for j in range(n):
            bm.faces.new((a[j], a[(j + 1) % n], b[(j + 1) % n], b[j]))
    bm.faces.new(list(reversed(rings_[0])))
    bm.faces.new(rings_[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = _from_bmesh(bm, 'sweep')
    base = L(col)
    me = o.data
    attr = me.color_attributes.get('base') or me.color_attributes.new('base', 'FLOAT_COLOR', 'CORNER')
    for poly in me.polygons:
        fc = base
        if band is not None:
            fu = sum(vinfo[vi][1] for vi in poly.vertices) / len(poly.vertices)
            b = band(fu)
            if b is not None:
                fc = L(b)
        for li in poly.loop_indices:
            vi = me.loops[li].vertex_index
            nn = vinfo[vi][0]
            cc = fc
            if hi or lo:
                s_ = nn.dot(KEY)
                cc = mixc(cc, (1, 1, 1), hi * _smoothstep(0.7, 0.98, s_))
                cc = mixc(cc, (0, 0, 0), lo * max(0.0, -nn.z))
            attr.data[li].color = (*cc, 1.0)
    _smooth(o, 70)
    P.append(o)
    return o


def ring(P, c, R, r, col, seg=32, rseg=8, sc=(1, 1)):
    """A thin torus lying flat (game XZ plane) at game c, `sc` its x/z stretch."""
    o = torus(R, r, color=col, seg=seg, rseg=rseg)
    o.data.transform(Matrix.Diagonal((sc[0], sc[1], 1.0, 1.0)))
    o.data.transform(Matrix.Translation(G(c)))
    o.data.update()
    P.append(o)
    return o


def cut_top(o, zcut):
    """Slice a closed body flat at Blender height zcut: every vertex above it
    drops onto the plane, which leaves a flat lid. Returns o; the lid is the
    faces whose normal points straight up."""
    for vt in o.data.vertices:
        if vt.co.z > zcut:
            vt.co.z = zcut
    o.data.update()
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bmesh.ops.dissolve_degenerate(bm, edges=bm.edges, dist=1e-6)
    lid = [f for f in bm.faces if f.calc_center_median().z > zcut - 1e-6
           and all(abs(v.co.z - zcut) < 1e-6 for v in f.verts)]
    if lid:
        bmesh.ops.dissolve_faces(bm, faces=lid)
    bm.to_mesh(o.data)
    bm.free()
    o.data.update()
    return o


def stack(P, c, r, n, h, cols, seg=12):
    """A pile of n coins as one turned part: grooved between coins, each coin
    painted in turn from `cols`. Bottom at game c."""
    g = h * 0.28
    prof = [(0.0, 0.0), (r - g, 0.0)]
    for i in range(n):
        z0 = i * h
        prof += [(r, z0 + g), (r, z0 + h - g), (r - g, z0 + h)]
    prof.append((0.0, n * h))
    o = lathe(prof, at=tuple(G(c)), color=cols[0], seg=seg, smooth=50)
    base = G(c).z
    recolor(o, lambda cc, nn: L(cols[min(n - 1, int((cc.z - base) / h)) % len(cols)]))
    P.append(o)
    return o


def recolor_lid(o, zcut, col):
    recolor(o, lambda c, nn: L(col) if nn.z > 0.99 and c.z > zcut - 1e-5 else None)


# ---------------------------------------------------------------- organelles

@model('cilia_tuft')
def cilia_tuft(v):
    # a soft membrane cushion with seven cilia, each one leaning a little
    # further round than the last: a beating, metachronal wave frozen mid-stroke
    P = []
    cush = lathe([(0.0, 0.0), (0.084, 0.0), (0.096, 0.008), (0.1, 0.022), (0.092, 0.038), (0.068, 0.052),
                  (0.034, 0.058), (0.0, 0.059)], color=M.membrane, seg=24, smooth=60)
    paint(cush, (0, 0, 0), gloss_fn(M.membrane, Vector((0, 0, 0.02)), (0.1, 0.1, 0.05), 0.25, 0.1))
    P.append(cush)
    n = 7
    for i in range(n):
        a = (i / n) * TAU + v * 0.5
        cx, cz = math.cos(a), math.sin(a)
        tx, tz = -cz, cx                     # tangent, for the beat
        h = 0.2 + ((i * 7) % 5) * 0.016
        base = (cx * 0.052, 0.046, cz * 0.052)
        tip = (cx * (0.052 + h * 0.31), 0.03 + h * 0.95, cz * (0.052 + h * 0.31))
        sway = 0.028 * math.sin(i * 1.7 + v)
        pts = []
        for k in range(7):
            t = k / 6
            bx = base[0] + (tip[0] - base[0]) * t
            by = base[1] + (tip[1] - base[1]) * t
            bz = base[2] + (tip[2] - base[2]) * t
            s = math.sin(math.pi * t) * sway
            pts.append((bx + tx * s, by, bz + tz * s))
        sweep(P, pts, 0.009, M.flesh, n=6, radii=[0.0098 - 0.0024 * k / 6 for k in range(7)], ends=0)
        ball(P, tip, 0.0112, M.chalk, (8, 4), hi=0.25)
    # the basal bodies: darker dots where each cilium roots in the membrane
    recolor(cush, lambda c, nn: L(M.membraneD) if any(
        (c.x - math.cos((i / n) * TAU + v * 0.5) * 0.052) ** 2 + (-c.y - math.sin((i / n) * TAU + v * 0.5) * 0.052) ** 2
        < 0.016 ** 2 for i in range(n)) else None)
    return P


@model('mitochondrion')
def mitochondrion(v):
    # a bean, cut open the way every textbook draws it: the outer membrane a
    # bowl, the lid the paler matrix, the cristae standing up through it as
    # folded ridges (v1's four boxes breaking the top surface)
    col = M.coral if v else M.rust
    P = []
    body = sphere(1.0, color=col, seg=24)
    rx, ry, rz = 0.2, 0.124, 0.13
    deform(body, lambda p: Vector((p.x * rx, p.y * rz + 0.62 * (p.x * rx) ** 2, p.z * ry + ry)))
    zc = ry * 1.6
    cut_top(body, zc)
    paint(body, (0, 0, 0), gloss_fn(col, Vector((0, 0, ry)), (rx, rz, ry), 0.28, 0.12))
    recolor_lid(body, zc, mixc(L(col), L(M.flesh), 0.6))
    _smooth(body, 40)
    P.append(body)
    # a crisp lip round the cut, the outer membrane's edge
    k = math.sqrt(1 - 0.6 ** 2)
    lip = ring(P, (0, zc, 0), 1.0, 0.0085, dk(col, 0.12), seg=28, rseg=4, sc=(rx * k, rz * k))
    deform(lip, lambda p: Vector((p.x, p.y + 0.62 * p.x ** 2, p.z)))
    # cristae: wavy folded walls across the matrix
    for i in range(4):
        x0 = -0.096 + i * 0.064
        half = rz * k * math.sqrt(max(0.0, 1 - (x0 / (rx * k)) ** 2)) - 0.012
        pts = []
        for j in range(7):
            t = j / 6
            z = -half + 2 * half * t
            pts.append((x0 + 0.012 * math.sin(t * TAU * 1.5 + i), zc, z - 0.62 * x0 ** 2))
        w = sweep(P, pts, 0.014, M.membraneD, n=6, ends=2)
        # stand the fold up: taller than it is thick
        deform(w, lambda p: Vector((p.x, p.y, zc + (p.z - zc) * 4.5 if p.z > zc else zc - (zc - p.z) * 0.5)))
    return P


@model('chloroplast')
def chloroplast(v):
    # the envelope cut open on its stroma, grana stacks standing in it like
    # piles of coins, joined by thin lamellae, and a grain of starch
    col = M.jellyDeep if v else M.moss
    P = []
    rx, ry, rz = 0.25, 0.185, 0.205
    body = sphere(1.0, color=col, seg=24)
    deform(body, lambda p: Vector((p.x * rx, p.y * rz, p.z * ry + ry)))
    zc = ry * 1.55
    cut_top(body, zc)
    paint(body, (0, 0, 0), gloss_fn(col, Vector((0, 0, ry)), (rx, rz, ry), 0.25, 0.12))
    recolor_lid(body, zc, M.jelly)
    _smooth(body, 40)
    P.append(body)
    k = math.sqrt(1 - 0.55 ** 2)
    ring(P, (0, zc, 0), 1.0, 0.009, dk(col, 0.1), seg=28, rseg=4, sc=(rx * k, rz * k))
    grana = []
    for i in range(4):
        px, pz = (1 if i % 2 else -1) * 0.088, (1 if i < 2 else -1) * 0.072
        grana.append((px, pz))
        dark = M.moss if v else dk(M.moss, 0.15)
        stack(P, (px, zc - 0.004, pz), 0.046, 3, 0.022, (M.jellyDeep if not v else lt(M.jellyDeep, 0.12), dark))
    # stroma lamellae, flat ribbons from stack to stack
    for a, b in ((0, 1), (2, 3), (0, 2), (1, 3)):
        (x0, z0), (x1, z1) = grana[a], grana[b]
        d = math.hypot(x1 - x0, z1 - z0)
        lam = box((d, 0.016, 0.007), color=lt(col, 0.25), bevel=0)
        ang = math.degrees(math.atan2(-(z1 - z0), x1 - x0))
        lam.data.transform(Matrix.Rotation(math.radians(ang), 4, 'Z'))
        lam.data.transform(Matrix.Translation(G(((x0 + x1) / 2, zc + 0.002, (z0 + z1) / 2))))
        lam.data.update()
        P.append(lam)
    ball(P, (-0.02, zc + 0.012, 0.0), 0.04, M.amber, (12, 6), sc=(1.15, 0.85, 1.0), hi=0.4)
    return P


# ---------------------------------------------------------------- bacteria and spores

@model('spore')
def spore(v):
    # an upright egg in a thick coat: the coat's ridges are part of the one
    # turned surface, painted darker, and the core shows through at the crown
    col = [C.offwhite, M.agarWarm, M.amberPale][v]
    ridge = dk(M.agarWarm, 0.14) if v == 1 else L(M.agarWarm)
    yc, hy, Rm = 0.222, 0.222, 0.163

    def egg(y):
        t = max(-1.0, min(1.0, (y - yc) / hy))
        return Rm * math.sqrt(max(0.0, 1 - t * t)) * (1 - 0.07 * t)

    ys = [yc - hy * math.cos(math.pi * i / 12) for i in range(13)]
    rid = [0.104 + i * 0.06 for i in range(5)]
    ys = [y for y in ys if all(abs(y - r) > 0.02 for r in rid)]
    pts = [(egg(y), y) for y in ys]
    for r_ in rid:
        e = egg(r_)
        pts += [(egg(r_ - 0.017), r_ - 0.017), (e + 0.013, r_ - 0.0075), (e + 0.013, r_ + 0.0075),
                (egg(r_ + 0.017), r_ + 0.017)]
    pts.sort(key=lambda q: q[1])
    pts[0] = (0.0, pts[0][1])
    pts[-1] = (0.0, pts[-1][1])
    body = lathe(pts, color=col, seg=24, smooth=60)
    recolor(body, lambda c, nn: ridge if any(abs(c.z - r_) < 0.0095 for r_ in rid) else None)
    gloss_n(body, 0.3, 0.12)
    P = [body]
    ball(P, (0, 0.392, 0), 0.074, M.honey, (16, 8), sc=(1, 0.9, 1), hi=0.35)
    return P


@model('coccus')
def coccus(v):
    # a glossy ball with its division ring standing proud round the middle and
    # the nucleoid showing through the top as a darker cap
    R = 0.225
    col = [M.jelly, M.membrane, M.amber, M.aqua][v]
    dark = [M.jellyDeep, M.membraneD, M.honey, M.aquaDeep][v]
    yb = R * 0.98
    pts = []
    for i in range(13):
        a = -math.pi / 2 + math.pi * i / 12
        y = R + R * math.sin(a)
        if abs(y - yb) > 0.02:
            pts.append((R * math.cos(a), y))
    w = math.sqrt(R * R - 0.018 ** 2)
    pts += [(w, yb - 0.018), (R + 0.007, yb - 0.009), (R + 0.007, yb + 0.009), (w, yb + 0.018)]
    pts.sort(key=lambda q: q[1])
    pts[0] = (0.0, 0.0)
    pts[-1] = (0.0, 2 * R)
    body = lathe(pts, color=col, seg=24, smooth=60)
    recolor(body, lambda c, nn: dark if abs(c.z - yb) < 0.0105 else None)
    gloss_n(body, 0.32, 0.12)
    P = [body]
    ball(P, (R * 0.22, R * 1.58, -R * 0.18), R * 0.52, dark, (12, 6), sc=(1, 0.62, 1), hi=0.25)
    return P


@model('tetrad')
def tetrad(v):
    # four daughter cells still stuck together after two divisions at right
    # angles, the dark septa showing in the crevices between them
    R = 0.208
    col = [M.membrane, M.jelly, M.lilac][v]
    dark = [M.membraneD, M.jellyDeep, M.nucleus][v]
    P = []
    for sx in (-1, 1):
        for sz in (-1, 1):
            cx, cz = sx * R * 0.72, sz * R * 0.72
            ball(P, (cx, R, cz), R, col, (18, 9), hi=0.32)
            # the nucleoid showing through the top-outer shoulder of each cell
            d = Vector((sx * 0.42, 1.0, sz * 0.42)).normalized()
            cap = ball(P, (cx + d.x * R * 0.9, R + d.y * R * 0.9, cz + d.z * R * 0.9), R * 0.36, dark, (10, 5),
                       sc=(1, 0.5, 1), hi=0.2)
            tilt = math.atan2(math.hypot(d.x, d.z), d.y)
            c0 = G((cx + d.x * R * 0.9, R + d.y * R * 0.9, cz + d.z * R * 0.9))
            ax = Vector((d.z, 0, -d.x)).normalized()   # game frame axis: y x d
            cap.data.transform(Matrix.Translation(-c0))
            cap.data.transform(Matrix.Rotation(tilt, 4, G(ax)))
            cap.data.transform(Matrix.Translation(c0))
            cap.data.update()
    for ax in ((1, 0, 0), (0, 0, 1)):
        a = (-R * 0.75 * ax[0], R, -R * 0.75 * ax[2])
        b = (R * 0.75 * ax[0], R, R * 0.75 * ax[2])
        sweep(P, [a, b], R * 0.62, dark, n=12, ends=2, lo=0.1)
    return P


@model('vibrio')
def vibrio(v):
    # the comma: one smooth curved rod, tapering a little to both ends, a dark
    # nucleoid ridge along its back, and a single polar flagellum
    Rc, rad = 0.56, 0.13
    col = M.aqua if v else M.jelly
    dark = M.aquaDeep if v else M.jellyDeep
    z0 = Rc * math.cos(0.85)
    P = []
    pts, rr = [], []
    for i in range(15):
        a = -0.85 + (i / 14) * 1.7
        pts.append((math.sin(a) * Rc, rad, math.cos(a) * Rc - z0))
        rr.append(rad * (1 - abs(i - 7) / 7 * 0.22))
    sweep(P, pts, rad, col, n=16, radii=rr, ends=4, hi=0.32, lo=0.12)
    # the nucleoid, a long darker lozenge riding the top of the curve
    np_, nr = [], []
    for i in range(9):
        a = -0.5 + (i / 8) * 1.0
        np_.append((math.sin(a) * Rc, rad * 1.86, math.cos(a) * Rc - z0))
        nr.append(0.052 * math.sin(math.pi * (0.12 + 0.76 * i / 8)))
    nuc = sweep(P, np_, 0.052, dark, n=8, radii=nr, ends=2, hi=0.25)
    deform(nuc, lambda p: Vector((p.x, p.y, rad * 1.86 + (p.z - rad * 1.86) * 0.5)))
    # polar flagellum, kinked back on itself (v1's wave), rooted in a little hook
    fl = [(math.sin(0.85) * Rc - 0.03, rad, -0.02)]
    for i in range(17):
        t = i / 16
        fl.append((math.sin(0.85) * Rc + 0.02 + t * 0.24, rad + math.sin(t * 7) * 0.03, math.cos(t * 7) * 0.07))
    sweep(P, fl, 0.024, M.chalk, n=6, radii=[0.028] + [0.024 - 0.006 * i / 16 for i in range(17)], ends=2, hi=0.2)
    return P


@model('bacillus')
def bacillus(v):
    # a stubby rod: one turned capsule with the two division rings standing
    # proud, and the nucleoid showing through the top as a darker lozenge
    R, Ln = 0.26, 1.35
    col = [M.jelly, M.amber, M.membrane][v]
    dark = [M.jellyDeep, M.honey, M.membraneD][v]
    h = Ln / 2 - R
    rings_x = (-0.25, 0.25)
    xs = []
    for i in range(6):
        a = math.pi / 2 * i / 5
        xs.append((-h - R * math.cos(a), R * math.sin(a)))
    for x in (-0.42, 0.0, 0.42):
        xs.append((x, R))
    for rx_ in rings_x:
        xs += [(rx_ - 0.02, R), (rx_ - 0.011, R + 0.012), (rx_ + 0.011, R + 0.012), (rx_ + 0.02, R)]
    for i in range(6):
        a = math.pi / 2 * i / 5
        xs.append((h + R * math.cos(a), R * math.sin(a)))
    xs.sort(key=lambda q: q[0])
    prof = [(r_, x) for (x, r_) in xs]
    prof[0] = (0.0, prof[0][1])
    prof[-1] = (0.0, prof[-1][1])
    body = lathe(prof, color=col, seg=24, smooth=60, rot=(0, 90, 0), at=(0, 0, R))
    recolor(body, lambda c, nn: dark if any(abs(c.x - rx_) < 0.013 for rx_ in rings_x) else None)
    gloss_n(body, 0.3, 0.12)
    P = [body]
    ball(P, (0.0, R * 2 - 0.048, 0.0), 0.3, dark, (16, 6), sc=(1, 0.2, 0.36), hi=0.2)
    return P


@model('coccus_chain')
def coccus_chain(v):
    # four cocci in a line, still joined by the dark collars of their septa
    R, n = 0.28, 4
    col = [M.membrane, M.jelly, M.amber][v]
    dark = [M.membraneD, M.jellyDeep, M.honey][v]
    P = []
    prev = None
    for i in range(n):
        x = (i - (n - 1) / 2) * R * 1.45
        z = math.sin(i * 0.9 + v) * 0.05
        ball(P, (x, R, z), R, col, (18, 8), hi=0.32)
        if prev is not None:
            sweep(P, [(prev[0] + R * 0.62, R, prev[1]), (x - R * 0.62, R, z)], R * 0.6, dark, n=12, ends=0, lo=0.1)
        prev = (x, z)
    return P


@model('spirillum')
def spirillum(v):
    # a rigid corkscrew: one smooth helical tube, thinning to rounded ends,
    # banded darker at v1's every-third bead
    Ln, amp, tb = 1.32, 0.29, 0.10
    col = M.aqua if v else M.jellyDeep
    P = []
    pts, rr = [], []
    N = 44
    for i in range(N + 1):
        t = i / N
        a = t * 1.9 * TAU
        pts.append((-Ln / 2 + t * Ln, amp + tb + math.sin(a) * amp, math.cos(a) * amp))
        rr.append(tb * (1 - abs(t - 0.5) * 0.3))

    def band(u):
        k = (u * 15) % 3
        return M.aquaDeep if (k > 2.55 or k < 0.45) else None
    sweep(P, pts, tb, col, n=14, radii=rr, ends=3, hi=0.32, lo=0.12, band=band)
    return P


# ---------------------------------------------------------------- big cells

def orient(o, c, d):
    """Turn a part built along Blender +Z about the origin so that +Z points
    along game direction d, then move it to game point c."""
    q = G(d).normalized().to_track_quat('Z', 'Y')
    o.data.transform(q.to_matrix().to_4x4())
    o.data.transform(Matrix.Translation(G(c)))
    o.data.update()
    return o


def stud(P, c, R, d, r, col, flat=0.5, tess=(10, 5), hi=0.25, out=0.92):
    """A flattened bead sitting on a ball (game centre c, radius R) in game
    direction d: a nucleus showing through, a nucleoid, a scar."""
    d = Vector(d).normalized()
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=tess[0], v_segments=tess[1], radius=r)
    o = _from_bmesh(bm, 'stud')
    o.data.transform(Matrix.Diagonal((1.0, 1.0, flat, 1.0)))
    orient(o, tuple(Vector(c) + d * R * out), d)
    paint(o, (0, 0, 0), gloss_fn(col, G(Vector(c) + d * R * out), (r, r, r), hi, 0.1))
    _smooth(o, 80)
    P.append(o)
    return o


def turned(P, prof, c, d, col, seg=12, smooth=60):
    """A lathe (profile [(radius, h), ...] along its own axis) stood on game
    point c, pointing along game direction d."""
    o = lathe(prof, color=col, seg=seg, smooth=smooth)
    orient(o, c, d)
    P.append(o)
    return o


@model('yeast')
def yeast(v):
    # a budding yeast: a glossy mother cell, the daughter swelling off her
    # side behind a honey neck ring, the nucleus showing through on top and
    # the ring scars of earlier buds round her waist
    R = 0.53
    col = [M.amberPale, M.chalk, M.agarWarm][v]
    P = []
    mo = (0.0, R, 0.0)
    bu = (R * 1.15, R * 0.78, 0.0)
    ball(P, mo, R, col, (24, 12), hi=0.3)
    ball(P, bu, R * 0.55, col, (18, 9), hi=0.3)
    # the neck: a honey ring round the circle where the two cells meet
    dv = Vector(bu) - Vector(mo)
    dd = dv.length
    dv.normalize()
    a = (dd * dd + R * R - (R * 0.55) ** 2) / (2 * dd)
    rn = math.sqrt(R * R - a * a)
    neck = torus(rn, 0.03, color=M.honey, seg=20, rseg=5)
    orient(neck, tuple(Vector(mo) + dv * a), dv)
    P.append(neck)
    # the nucleus, violet, breaking the top of the mother
    stud(P, mo, R, (-0.32, 0.85, 0.25), 0.2, M.nucleus, flat=0.5, tess=(12, 6), hi=0.3, out=0.94)
    # bud scars, skipping any that would fall under the bud itself
    for i in range(4):
        aa = (i / 4) * TAU + v
        if math.cos(aa) > 0.75:
            continue
        d = Vector((math.cos(aa), 0.22, math.sin(aa))).normalized()
        sc = torus(R * 0.15, R * 0.042, color=M.honey, seg=12, rseg=4)
        orient(sc, tuple(Vector(mo) + d * R * 0.985), d)
        P.append(sc)
    return P


@model('pollen')
def pollen(v):
    # an echinate grain: a glossy ball studded with blunt spines, and three
    # pale germ pores round its waist
    R, spike = 0.472, 0.118
    col = [M.honey, M.amber, M.rust][v]
    c = (0.0, R + spike, 0.0)
    P = []
    ball(P, c, R, col, (20, 10), hi=0.3)
    sp = [(0.068, -0.03), (0.047, 0.06), (0.02, 0.135), (0.0, 0.152)]
    for i in range(17):
        e = math.acos(1 - 2 * ((i + 0.5) / 17))
        a = i * GOLD
        d = (math.sin(e) * math.cos(a), math.cos(e), math.sin(e) * math.sin(a))
        turned(P, sp, tuple(Vector(c) + Vector(d) * R * 0.98), d, M.rust if v != 2 else dk(M.rust, 0.25), seg=6)
    pore = [(0.0, -0.012), (0.05, -0.008), (0.078, 0.01), (0.098, 0.0), (0.104, -0.03)]
    for i in range(3):
        a = (i / 3) * TAU + v
        d = (math.cos(a), 0.0, math.sin(a))
        o = turned(P, pore, tuple(Vector(c) + Vector(d) * R * 0.995), d, M.amberPale, seg=8)
    return P


@model('diatom')
def diatom(v):
    # a centric diatom: a glass pillbox of two valves, the girdle band where
    # they overlap, fluted sides, and a domed lid patterned with rings of pores
    R, H = 0.75, 1.26
    col = [M.chalk, M.agar, M.jellyPale][v]
    P = []
    yl = H * 0.84                      # where the lid starts
    lid_h = H * 0.17

    def lid_y(r):                      # height of the domed lid at radius r
        t = min(1.0, r / (R * 0.99))
        return yl + lid_h * (1 - t ** 2.2)

    prof = [(0.0, 0.0), (R - 0.06, 0.0), (R - 0.012, 0.02), (R, 0.07), (R, H * 0.3), (R, H * 0.55),
            (R - 0.006, H * 0.6), (R * 1.03, H * 0.615), (R * 1.03, H * 0.75), (R * 0.995, H * 0.765),
            (R * 0.995, H * 0.82), (R * 0.985, yl)]
    for k in range(1, 7):
        r = R * 0.985 * (1 - k / 7)
        prof.append((r, lid_y(r)))
    prof.append((0.0, yl + lid_h))
    seg = 36
    body = lathe(prof, color=col, seg=seg, smooth=50)
    # flute the lower valve: every 3rd column of vertices pushed out into a rib
    for vt in body.data.vertices:
        ang = math.atan2(vt.co.y, vt.co.x)
        j = round(ang / TAU * seg) % seg
        if j % 3 == 0 and 0.06 < vt.co.z < H * 0.56:
            k = 1.035
            vt.co.x *= k
            vt.co.y *= k
    body.data.update()

    def colour(cc, nn):
        if H * 0.6 < cc.z < H * 0.77:
            return M.aquaDeep
        if cc.z < H * 0.56 and cc.z > 0.07:
            ang = math.atan2(cc.y, cc.x) / TAU * seg
            if abs(ang - round(ang / 3) * 3) < 1.0:
                return M.aquaDeep
        if cc.z > yl and math.hypot(cc.x, cc.y) < R * 0.12:
            return M.aquaDeep
        return None
    recolor(body, colour)
    gloss_n(body, 0.25, 0.1, keep=lambda cc, nn: H * 0.6 < cc.z < H * 0.77)
    P.append(body)
    # the pores: three rings of shallow raised dots on the lid
    dot = [(0.0, -0.01), (0.055, -0.01), (0.05, 0.012), (0.0, 0.018)]
    for rg in range(3):
        rr = R * (0.28 + rg * 0.26)
        n = 6 + rg * 4
        for i in range(n):
            a = (i / n) * TAU + rg * 0.4 + v * 0.3
            x, z = math.cos(a) * rr, math.sin(a) * rr
            # the lid's slope there, so each dot sits flush on the dome
            dr = 0.01
            slope = (lid_y(rr + dr) - lid_y(rr - dr)) / (2 * dr)
            nrm = Vector((-slope * math.cos(a), 1.0, -slope * math.sin(a))).normalized()
            turned(P, dot, (x, lid_y(rr), z), tuple(nrm), M.aqua, seg=6)
    return P


# ---------------------------------------------------------------- blobs

def blob(elems, target=1200, res=0.035):
    """One soft single-surface body from overlapping ellipsoids (Blender
    metaballs): elems are (game centre, game radii, stiffness). Converted to a
    mesh and decimated to about `target` triangles. Radii are roughly the
    surface an element would have alone; blending fattens the joins, so
    callers fit the result to the catalogue box afterwards."""
    mb = bpy.data.metaballs.new('cellsblob')
    mb.resolution = res
    mb.render_resolution = res
    mb.threshold = 0.6
    ob = bpy.data.objects.new('cellsblob', mb)
    bpy.context.scene.collection.objects.link(ob)
    for c, r, st in elems:
        el = mb.elements.new(type='ELLIPSOID')
        el.co = G(c)
        el.radius = 1.0
        el.stiffness = st
        el.size_x, el.size_y, el.size_z = r[0] / 0.564, r[2] / 0.564, r[1] / 0.564
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


def fit_box(objs, size):
    """Scale objs per axis about their footprint centre so their joint box is
    `size` (game w, h, d), standing on the floor and centred. Returns a
    function mapping an old game point to where it went."""
    lo, hi = [1e9] * 3, [-1e9] * 3
    for o in objs:
        for vt in o.data.vertices:
            for i in range(3):
                lo[i] = min(lo[i], vt.co[i])
                hi[i] = max(hi[i], vt.co[i])
    tgt = (size[0], size[2], size[1])
    k = [tgt[i] / max(1e-9, hi[i] - lo[i]) for i in range(3)]
    cx, cy = (lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2
    for o in objs:
        for vt in o.data.vertices:
            vt.co = Vector(((vt.co.x - cx) * k[0], (vt.co.y - cy) * k[1], (vt.co.z - lo[2]) * k[2]))
        o.data.update()

    def mapg(p):
        b = G(p)
        q = Vector(((b.x - cx) * k[0], (b.y - cy) * k[1], (b.z - lo[2]) * k[2]))
        return (q.x, q.z, -q.y)
    return mapg


def top_at(o, gx, gz):
    """Game height of the top surface of o above game (x, z)."""
    from mathutils.bvhtree import BVHTree
    me = o.data
    bvh = BVHTree.FromPolygons([v.co for v in me.vertices], [p.vertices for p in me.polygons])
    hit = bvh.ray_cast(Vector((gx, -gz, 50.0)), Vector((0, 0, -1)))
    return hit[0].z if hit[0] is not None else 0.0


def blob_paint(o, fn):
    """Paint a blob per corner with fn(Blender co, vertex normal) -> colour."""
    me = o.data
    attr = me.color_attributes.get('base') or me.color_attributes.new('base', 'FLOAT_COLOR', 'CORNER')
    for poly in me.polygons:
        for li in poly.loop_indices:
            vt = me.vertices[me.loops[li].vertex_index]
            attr.data[li].color = (*L(fn(vt.co, vt.normal)), 1.0)
    return o


@model('biofilm', ao=0.65)
def biofilm(v):
    # a torn-off lump of slime matrix with its residents still in it: rods,
    # cocci and amber granules half sunk in the surface, and pale strands of
    # matrix pulled up off the top where it tore
    P = []
    els = [((0.0, 0.4, 0.0), (0.9, 0.42, 0.78), 2.0),
           ((0.12, 0.56, -0.08), (0.68, 0.34, 0.56), 2.0)]
    for i in range(7):
        a = i * GOLD + v * 1.3
        d = 0.55 + 0.15 * hash01(i, v)
        els.append(((math.cos(a) * d, 0.32, math.sin(a) * d * 0.85), (0.26, 0.24, 0.26), 2.0))
    # metaball joins fatten the lumps; pre-shrink so the box fit below is a nudge
    sk = (0.91, 0.85, 0.87)
    els = [((c[0] * sk[0], c[1] * sk[1], c[2] * sk[2]), (r[0] * sk[0], r[1] * sk[1], r[2] * sk[2]), st)
           for c, r, st in els]
    mat = blob(els, target=1300, res=0.085)
    spec = kit.SPECS['biofilm']['boxes'][v]['size']
    mp = fit_box([mat], (spec[0], spec[1] * 0.9, spec[2]))
    _smooth(mat, 180)
    lo_c, hi_c = L(M.matrix), L(M.agarWarm)
    blob_paint(mat, lambda co, n: mixc(lo_c, hi_c, 0.85 * _smoothstep(0.35, 0.8, n.z)))
    gloss_n(mat, 0.22, 0.12)
    P.append(mat)
    # residents (v1's layout and kinds)
    for i in range(9):
        a = i * GOLD + v
        d = 0.2 + ((i * 5) % 7) * 0.09
        px, _, pz = mp((math.cos(a) * d, 0.4, math.sin(a) * d * 0.86))
        y = top_at(mat, px, pz)
        if i % 3 == 0:
            r, hl = 0.088, 0.13
            ax = Vector((math.cos(a), 0.0, -math.sin(a)))
            c = Vector((px, y + r * 0.2, pz))
            sweep(P, [tuple(c - ax * hl), tuple(c + ax * hl)], r, M.jelly, n=8, ends=2, hi=0.3, lo=0.1)
        elif i % 3 == 1:
            ball(P, (px, y + 0.115 * 0.25, pz), 0.115, M.membrane, (10, 5), hi=0.32)
        else:
            ball(P, (px, y + 0.09 * 0.2, pz), 0.09, M.amber, (8, 4), hi=0.32)
    # strands of matrix drawn up where it tore
    for i in range(5):
        a = i * 1.2566 + v * 0.5
        bx, _, bz = mp((math.cos(a) * 0.5, 0.4, math.sin(a) * 0.44))
        y0 = top_at(mat, bx, bz) - 0.03
        pts = []
        for k in range(3):
            t = k / 2
            pts.append((bx + math.cos(a) * 0.09 * t, y0 + 0.15 * t, bz + math.sin(a) * 0.09 * t))
        sweep(P, pts, 0.04, M.jellyPale, n=6, radii=[0.05, 0.04, 0.03], ends=2, hi=0.25)
    return P


@model('amoeba', ao=0.6)
def amoeba(v):
    # one soft body flowing out into five pseudopods (v1's angles and
    # reaches), the nucleus showing through the top, a contractile vacuole and
    # food vacuoles half-surfaced in the cytoplasm
    col = [M.jellyPale, M.chalk, M.amberPale][v]
    deep = [M.jelly, M.agar, M.amber][v]
    P = []
    els = [((0.0, 0.42, 0.0), (0.55, 0.42, 0.5), 2.0),
           ((-0.06, 0.6, 0.05), (0.24, 0.2, 0.24), 2.0)]
    n = 5
    for i in range(n):
        a = (i / n) * TAU + v * 0.6
        reach = 0.44 + ((i * 3) % 4) * 0.07
        for k in range(1, 5):
            t = k / 4
            els.append(((math.cos(a) * reach * t * 1.5, 0.38 - t * 0.14, math.sin(a) * reach * t * 1.5),
                        (0.22 - t * 0.1, 0.24 - t * 0.13, 0.22 - t * 0.1), 2.0))
    body = blob(els, target=1700, res=0.04)
    spec = kit.SPECS['amoeba']['boxes'][v]['size']
    mp = fit_box([body], spec)
    _smooth(body, 180)
    nuc = G(mp((-0.06, 0.6, 0.05)))
    cdeep, cpale = L(deep), L(col)

    def paint_fn(co, nn):
        hd = math.hypot(co.x, co.y)
        c = mixc(cpale, cdeep, 0.35 * _smoothstep(0.75, 0.15, hd))
        dn = math.hypot(co.x - nuc.x, co.y - nuc.y)
        if nn.z > 0.3 and dn < 0.2:
            c = L(M.nucleusD) if dn < 0.065 else L(M.nucleus)
        return c
    blob_paint(body, paint_fn)
    gloss_n(body, 0.26, 0.12)
    P.append(body)
    # the contractile vacuole and the food vacuoles, half surfaced
    for (gx, gz, r, cc) in [(0.24, -0.2, 0.1, M.aqua)] + [
            (math.cos(i * 1.9 + v) * 0.3, math.sin(i * 1.9 + v) * 0.28, 0.062, M.amber) for i in range(4)]:
        gx, _, gz = mp((gx, 0.4, gz))
        y = top_at(body, gx, gz)
        ball(P, (gx, y - r * 0.35, gz), r, cc, (12, 6), hi=0.4)
    return P
