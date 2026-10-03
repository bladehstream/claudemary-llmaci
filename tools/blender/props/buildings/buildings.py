"""City-stage buildings and big structures, modelled — 10 m to 250 m.

Frame reminder (see kit.py): Blender Z is up, X is the prop's width, and the
game's FRONT (+Z) is Blender -Y. Sizes are real metres, matched to
out/specs.json — the procedural box each archetype already occupies.

These are rolled up by a ball the size of a house, so they are seen whole:
detail goes where the silhouette and the big colour blocks are. Windows are
recoloured faces of a gridded box (`gridbox`), never separate boxes; faces
with no windows are one n-gon over the same boundary, so they cost nothing.
"""
import math
import bmesh
from mathutils import Vector, Matrix, Euler
import kit
from kit import (box, cyl, sphere, torus, lathe, extrude, tube, arc_points,
                 subdivide, deform, recolor, lin, mixc, C, SETS)
from kit import _from_bmesh, _bevel, _place, paint, _smooth

# Lit windows (and the stadium's floodlight banks) are C.lemon faces; they
# self-light through kit.finish's glow_cols. The city turns them up as its
# sky goes to dusk (Scene.setDusk); in daylight they sit at a fraction.
LIT = {C.lemon: 0.9}

MODELS = {}
FINISH = {}


def model(pid, **finish):
    def wrap(fn):
        MODELS[pid] = fn
        if finish:
            FINISH[pid] = finish
        return fn
    return wrap


# ---------------------------------------------------------------- helpers

def L(c):
    return c if isinstance(c, tuple) else lin(c)


def dk(col, t=0.2):
    """A darker shade of a palette colour, as linear rgb."""
    return mixc(L(col), (0, 0, 0), t)


def lt(col, t=0.4):
    """A lighter tint of a palette colour, as linear rgb."""
    return mixc(L(col), (1, 1, 1), t)


def hash01(*a):
    s = 0.0
    for i, x in enumerate(a):
        s += x * (12.9898, 78.233, 37.719, 4.581, 91.17)[i % 5]
    s = math.sin(s) * 43758.5453
    return s - math.floor(s)


def want(pid, v):
    """The spec box for (prop, variant), game frame: [width, height, depth]."""
    return kit.SPECS[pid]['boxes'][v]['size']


def gridbox(size, at=(0, 0, 0), color=0xcccccc, xs=(), ys=(), zs=(), plain='zZ',
            cell=None, bevel=0.0, seg=2, rot=(0, 0, 0), smooth=30):
    """A box whose side faces are cut at explicit positions, so `cell` can
    paint windows, louvres and bands onto it as flat colour blocks.

    xs / ys / zs are the cut positions (box frame: x and y centred, z from the
    floor up). Faces named in `plain` (x/X, y/Y, z/Z for the min/max side of
    each axis) are a single n-gon over the same boundary vertices — no windows,
    almost no triangles, and the mesh stays manifold for the bevel.
    `cell(centre, normal)` -> colour or None runs before the box is placed."""
    W, D, H = size
    eps = 1e-3
    X = [-W / 2] + sorted(c for c in set(xs) if -W / 2 + eps < c < W / 2 - eps) + [W / 2]
    Y = [-D / 2] + sorted(c for c in set(ys) if -D / 2 + eps < c < D / 2 - eps) + [D / 2]
    Z = [0.0] + sorted(c for c in set(zs) if eps < c < H - eps) + [H]
    nx, ny, nz = len(X) - 1, len(Y) - 1, len(Z) - 1
    bm = bmesh.new()
    V = {}

    def vt(i, j, k):
        key = (i, j, k)
        if key not in V:
            V[key] = bm.verts.new((X[i], Y[j], Z[k]))
        return V[key]

    faces = (
        ('y', nx, nz, lambda a, b: (a, 0, b)),
        ('Y', nx, nz, lambda a, b: (a, ny, b)),
        ('x', ny, nz, lambda a, b: (0, a, b)),
        ('X', ny, nz, lambda a, b: (nx, a, b)),
        ('z', nx, ny, lambda a, b: (a, b, 0)),
        ('Z', nx, ny, lambda a, b: (a, b, nz)),
    )
    for tag, na, nb, m in faces:
        if tag in plain:
            loop = ([(a, 0) for a in range(na)] + [(na, b) for b in range(nb)] +
                    [(a, nb) for a in range(na, 0, -1)] + [(0, b) for b in range(nb, 0, -1)])
            bm.faces.new([vt(*m(a, b)) for a, b in loop])
        else:
            for a in range(na):
                for b in range(nb):
                    bm.faces.new((vt(*m(a, b)), vt(*m(a + 1, b)), vt(*m(a + 1, b + 1)), vt(*m(a, b + 1))))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = _from_bmesh(bm, 'gridbox')
    _bevel(o, bevel, seg)
    paint(o, color)
    if cell:
        recolor(o, cell)
    _place(o, at, rot)
    return _smooth(o, smooth)


def bays(lo, hi, n, frac):
    """n window intervals spread evenly over [lo, hi], each frac of its bay."""
    bay = (hi - lo) / n
    w = bay * frac
    return [(lo + (i + 0.5) * bay - w / 2, lo + (i + 0.5) * bay + w / 2) for i in range(n)]


def cuts(*interval_lists):
    out = []
    for ivs in interval_lists:
        for a, b in ivs:
            out += [a, b]
    return sorted(set(round(c, 4) for c in out))


def inside(x, ivs):
    for a, b in ivs:
        if a < x < b:
            return True
    return False


def windows(cols_x, cols_y, rows, glass, lit=None, lit_p=0.2, seed=0.0, extra=None):
    """A `cell` painter: a face cell is a window when its centre falls inside a
    column interval (x for the -Y/+Y faces, y for the side faces) and a row
    interval. Some windows are lit."""
    def fn(c, n):
        if extra:
            r = extra(c, n)
            if r is not None:
                return r
        if abs(n.z) > 0.5:
            return None
        u, ivs = (c.x, cols_x) if abs(n.y) > 0.5 else (c.y, cols_y)
        if inside(u, ivs) and inside(c.z, rows):
            if lit is not None and hash01(round(u, 1), round(c.z, 1), n.x * 3 + n.y, seed) < lit_p:
                return lit
            return glass
        return None
    return fn


def cbox(size, at=(0, 0, 0), color=0xcccccc, bevel=None, rot=(0, 0, 0)):
    """A chamfered box (one bevel segment): a quarter of kit.box's triangles,
    for the rooftop clutter and slabs where a round edge would not show."""
    return box(size, at=at, color=color, bevel=(min(size) * 0.12 if bevel is None else bevel), seg=1, rot=rot)


def disc(r, h, at=(0, 0, 0), color=0xcccccc, seg=12, rot=(0, 0, 0)):
    """A thin flat cylinder, no bevel — fan grilles, lamp lenses, hatches."""
    return cyl(r, h, at=at, color=color, seg=seg, bevel=0, rot=rot)


def strut(p0, p1, r, color=0xcccccc, n=4, caps=False, smooth=30):
    """A thin n-sided bar from p0 to p1 — lattice members, cables, rods. Four
    sides, no caps and no bevel: eight triangles a member."""
    a, b = Vector(p0), Vector(p1)
    d = b - a
    Lh = d.length
    bm = bmesh.new()
    ring0, ring1 = [], []
    for j in range(n):
        t = 2 * math.pi * (j + 0.5) / n
        ring0.append(bm.verts.new((r * math.cos(t), r * math.sin(t), 0)))
        ring1.append(bm.verts.new((r * math.cos(t), r * math.sin(t), Lh)))
    for j in range(n):
        bm.faces.new((ring0[j], ring0[(j + 1) % n], ring1[(j + 1) % n], ring1[j]))
    if caps:
        bm.faces.new(list(reversed(ring0)))
        bm.faces.new(ring1)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = _from_bmesh(bm, 'strut')
    q = d.normalized().to_track_quat('Z', 'Y')
    deform(o, lambda p: q @ p + a)
    paint(o, color)
    return _smooth(o, smooth)


def pane(center, w, h, color, normal='-y', off=0.12):
    """A single flat quad standing just proud of a wall: a lit window pane on
    a ribbon-glazed tower, where a full window grid would cost thousands."""
    cx, cy, cz = center
    bm = bmesh.new()
    if normal in ('-y', '+y'):
        s = -1 if normal == '-y' else 1
        y = cy + s * off
        pts = [(cx - w / 2, y, cz - h / 2), (cx + w / 2, y, cz - h / 2), (cx + w / 2, y, cz + h / 2), (cx - w / 2, y, cz + h / 2)]
        if s > 0:
            pts.reverse()
    else:
        s = -1 if normal == '-x' else 1
        x = cx + s * off
        pts = [(x, cy - w / 2, cz - h / 2), (x, cy + w / 2, cz - h / 2), (x, cy + w / 2, cz + h / 2), (x, cy - w / 2, cz + h / 2)]
        if s < 0:
            pts.reverse()
    bm.faces.new([bm.verts.new(p) for p in pts])
    o = _from_bmesh(bm, 'pane')
    paint(o, color)
    return o


def ac_unit(at, s=2.0, color=None):
    """A rooftop air-conditioning box with a dark fan grille on top."""
    col = C.steel if color is None else color
    x, y, z = at
    return [cbox((s, s * 0.8, s * 0.55), at=(x, y, z), color=col, bevel=s * 0.08),
            disc(s * 0.3, 0.06, at=(x, y, z + s * 0.55), color=C.charcoal, seg=10)]


def water_tank(at, r=1.4, h=2.4, color=None):
    """A squat rooftop tank on a low plinth, with a domed lid."""
    col = C.woodPale if color is None else color
    x, y, z = at
    return [cbox((r * 2.1, r * 2.1, 0.5), at=(x, y, z), color=C.steelDark, bevel=0.12),
            lathe([(r, 0), (r, h), (r * 0.9, h + 0.25), (r * 0.45, h + 0.55), (0.0, h + 0.62)],
                  at=(x, y, z + 0.5), color=col, seg=12, smooth=50)]


def rrect(w, d, r, n=2, cx=0.0, cy=0.0):
    """A rounded-rectangle outline (counter-clockwise), for `prism`."""
    r = min(r, w / 2 - 1e-5, d / 2 - 1e-5)
    pts = []
    for qx, qy, a0 in ((1, 1, 0), (-1, 1, 90), (-1, -1, 180), (1, -1, 270)):
        ox, oy = cx + qx * (w / 2 - r), cy + qy * (d / 2 - r)
        for i in range(n + 1):
            a = math.radians(a0 + 90 * i / n)
            pts.append((ox + r * math.cos(a), oy + r * math.sin(a)))
    return pts


def prism(poly, h, at=(0, 0, 0), color=0xcccccc, bevel=0.0, seg=1, rot=(0, 0, 0), smooth=30):
    """`extrude` with a choice of bevel: none at all for a column whose ends
    are buried in a cornice and the ground."""
    bm = bmesh.new()
    face = bm.faces.new([bm.verts.new((x, y, 0)) for (x, y) in poly])
    res = bmesh.ops.extrude_face_region(bm, geom=[face])
    for e in res['geom']:
        if isinstance(e, bmesh.types.BMVert):
            e.co.z += h
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = _from_bmesh(bm, 'prism')
    _bevel(o, bevel, seg)
    _place(o, at, rot)
    paint(o, color)
    return _smooth(o, smooth)


def column(w, d, h, at, color, r=None, n=2):
    """A rounded-corner column, smooth-shaded, no end bevels: corner piers and
    pilasters whose top and bottom are hidden. ~44 triangles."""
    return prism(rrect(w, d, w * 0.38 if r is None else r, n), h, at=at, color=color, smooth=50)


def piers(W, D, z0, h, w, color, proud=0.25):
    """Four corner columns around a W x D core: they carry the soft rounded
    vertical edges, so the gridded core under them needs no bevel at all."""
    return [column(w, w, h, (sx * (W / 2 - w / 2 + proud), sy * (D / 2 - w / 2 + proud), z0), color)
            for sx in (-1, 1) for sy in (-1, 1)]


# ---------------------------------------------------------------- buildings

@model('office_small', ao=0.55, ao_dist=4.0, glow_cols=LIT)
def office_small(v):
    W, D, H = 13 + v * 2, 11 + v, 17 + v * 5
    wall = SETS['building'][v % len(SETS['building'])]
    trim = C.concreteD if v != 0 else C.darkgrey
    pw = 0.9                                   # corner pier width
    cw, cd = W - 0.5, D - 0.5                  # the gridded core, inside the piers
    G = 4.2                                    # ground floor height
    nf = max(3, int((H - G - 0.9) / 3.4))
    pitch = (H - G - 0.9) / nf
    rows = [(G + i * pitch + 0.75, G + i * pitch + 0.75 + pitch * 0.56) for i in range(nf)]
    ground = [(0.0, G - 0.9)]
    cf = max(3, round(W / 4.2))
    cs = max(2, round(D / 4.6))
    cx = bays(-cw / 2 + pw, cw / 2 - pw, cf, 0.62)
    cy = bays(-cd / 2 + pw, cd / 2 - pw, cs, 0.58)
    glass, litc = C.glassDark, C.lemon
    lobby = (cx[0][0], cx[-1][1])

    def extra(c, n):
        # the ground floor: a dark plinth band, the lobby glazed across the front
        if abs(n.z) < 0.5 and c.z < G - 0.9:
            if n.y < -0.5 and lobby[0] < c.x < lobby[1]:
                return C.glass
            if inside(c.x if abs(n.y) > 0.5 else c.y, cx if abs(n.y) > 0.5 else cy):
                return glass
            return dk(wall, 0.18)
        if abs(n.z) < 0.5 and G - 0.9 < c.z < G:
            return dk(wall, 0.18)
        return None

    core = gridbox((cw, cd, H), color=wall,
                   xs=cuts(cx, [lobby]), ys=cuts(cy), zs=cuts(rows, ground, [(G - 0.9, G)]),
                   cell=windows(cx, cy, rows, glass, litc, 0.22, seed=v, extra=extra))
    parts = [core]
    parts += piers(cw, cd, 0, H, pw, dk(wall, 0.08), proud=0.2)
    # parapet cornice and a flat roof
    parts.append(box((W + 0.8, D + 0.8, 0.8), at=(0, 0, H), color=trim, bevel=0.25, seg=2))
    parts.append(cbox((W - 0.6, D - 0.6, 0.12), at=(0, 0, H + 0.7), color=mixc(L(C.concrete), L(trim), 0.5), bevel=0.04))
    # the entrance canopy, cantilevered over the lobby
    lw = lobby[1] - lobby[0] + 1.6
    parts.append(box((lw, 1.9, 0.42), at=(0, -cd / 2 - 0.55, G - 0.55), color=trim, bevel=0.14, seg=2))
    # rooftop: a stair/lift housing, an AC unit or two, a tank on the taller ones
    z = H + 0.82
    parts.append(cbox((4.0, 4.0, 2.4), at=(W / 4, D / 8, z), color=trim, bevel=0.3))
    parts.append(cbox((1.2, 0.1, 1.9), at=(W / 4 - 0.8, D / 8 - 2.02, z), color=C.charcoal, bevel=0.03))
    parts += ac_unit((-W / 4, -D / 6, z), 2.2)
    if v >= 1:
        parts += ac_unit((-W / 4 + 2.8, -D / 6, z), 2.2)
    if v >= 2:
        parts += water_tank((-W / 4 + 0.6, D / 4, z), r=1.3, h=2.0)
    return parts


def comb(length, prof, at=(0, 0, 0), color=0xcccccc, cell=None, bevel=0.0, rot=(0, 0, 0), smooth=30):
    """A closed outline [(u, z), ...] in the YZ plane, extruded along X by
    `length` and centred on X: stacked balconies, cornices, sawtooth roofs —
    a whole storey stack for the price of its outline."""
    bm = bmesh.new()
    a = [bm.verts.new((-length / 2, u, z)) for (u, z) in prof]
    b = [bm.verts.new((length / 2, u, z)) for (u, z) in prof]
    n = len(prof)
    for j in range(n):
        bm.faces.new((a[j], a[(j + 1) % n], b[(j + 1) % n], b[j]))
    bm.faces.new(list(reversed(a)))
    bm.faces.new(b)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = _from_bmesh(bm, 'comb')
    _bevel(o, bevel, 1)
    paint(o, color)
    if cell:
        recolor(o, cell)
    _place(o, at, rot)
    return _smooth(o, smooth)


def balconies(levels, out, rail, length, wall_y, side, slab_col, rail_col, slab=0.3, ins=0.06):
    """Every floor's balcony on one facade as one comb: a slab out from the
    wall at each level (its top at the level) with a solid railing upstand
    along the edge. side=-1 for the front (-Y), +1 for the back."""
    pts = [(-0.4, levels[0] - slab)]
    for k, z in enumerate(levels):
        pts += [(out, z - slab), (out, z + rail), (out - 0.16, z + rail), (out - 0.16, z), (-ins, z)]
        if k + 1 < len(levels):
            pts.append((-ins, levels[k + 1] - slab))
    pts.append((-0.4, levels[-1]))

    def cell(c, n):
        u, z = c.y, c.z
        for lv in levels:
            if lv - slab - 0.01 <= z <= lv + rail + 0.01 and abs(n.x) < 0.5:
                return rail_col if (z > lv + 0.01 or (n.z > 0.5 and u > out - 0.17)) else None
        return None
    o = comb(length, pts, color=slab_col, cell=cell)
    # the profile was drawn outward along +Y; flip it for the front
    deform(o, lambda p: Vector((p.x, wall_y + side * p.y, p.z)))
    if side < 0:
        o.data.flip_normals()
    return o


@model('apartment', ao=0.6, ao_dist=4.0, glow_cols=LIT)
def apartment(v):
    W, D = 22.0, 14.0
    H = 26 + v * 6 - 0.8
    wall = [C.cream, C.tan, C.offwhite, C.brick][v]
    n = round((H + 0.8) / 3.2)
    pitch = (H - 0.6) / n
    levels = [k * pitch for k in range(1, n)]
    glass = C.glassDark
    cols = [(-W / 2 + 2.2 + i * 3.6 - 1.2, -W / 2 + 2.2 + i * 3.6 + 1.2) for i in range(6)]
    door = cols[0]
    strip = [(-1.1, 1.1)]
    zg = (0.7, pitch - 0.5)            # the ground-floor windows
    zu = (pitch - 0.1, H - 0.9)        # one glazed column per bay above, behind the balconies
    base = dk(wall, 0.2)

    def cell(c, nm):
        if abs(nm.z) > 0.5:
            return None
        if abs(nm.y) > 0.5:
            if not inside(c.x, cols):
                return base if c.z < pitch - 0.3 else None
            if nm.y < 0 and door[0] < c.x < door[1] and c.z < zg[1]:
                return C.charcoal
            if zg[0] < c.z < zg[1] or zu[0] < c.z < zu[1]:
                return glass
            return base if c.z < pitch - 0.3 else None
        return base if c.z < pitch - 0.3 else None

    body = gridbox((W, D, H), color=wall, xs=cuts(cols),
                   zs=sorted({0.7, pitch - 0.5, pitch - 0.3, pitch - 0.1, H - 0.9}), cell=cell)
    parts = [body]
    rail = [C.steelDark, C.steelDark, C.steelDark, C.offwhite][v]
    for side in (-1, 1):
        parts.append(balconies(levels, 1.0, 1.05, W + 0.4, side * D / 2, side, lt(C.concrete, 0.25), rail))
    # a few flats with the lights on, behind the balconies
    for side in (-1, 1):
        for i, (a, b) in enumerate(cols):
            for k, lv in enumerate(levels):
                if hash01(i, k, side, v + 3) < 0.17:
                    z0, z1 = lv + 1.1, lv + pitch - 0.35
                    parts.append(pane(((a + b) / 2, side * D / 2, (z0 + z1) / 2), b - a - 0.3, z1 - z0, C.lemon,
                                      normal='-y' if side < 0 else '+y', off=0.08))
    # the gable ends: two little stairwell windows a floor
    for sx in (-1, 1):
        for y in (-2.4, 2.4):
            for k in range(n - 1):
                zc = levels[k] + pitch * 0.5
                parts.append(pane((sx * W / 2, y, zc), 1.0, 1.3, glass, normal='-x' if sx < 0 else '+x', off=0.06))
    # door canopy
    parts.append(cbox((3.4, 1.4, 0.3), at=((door[0] + door[1]) / 2, -D / 2 - 0.6, zg[1] + 0.1), color=C.concreteD, bevel=0.08))
    # parapet roof and the rooftop
    parts.append(box((W + 1.0, D + 1.0, 0.9), at=(0, 0, H), color=C.concreteD, bevel=0.28, seg=2))
    z = H + 0.9
    parts.append(cbox((3.6, 4.2, 2.0), at=(-W / 2 + 4.0, 1.5, z), color=dk(wall, 0.1), bevel=0.25))
    parts += water_tank((W / 2 - 4.0, 2.0, z), r=1.2, h=1.0)
    parts += ac_unit((2.0, -3.0, z), 1.6)
    parts += ac_unit((4.4, -3.0, z), 1.6)
    if v % 2:
        parts.append(strut((-3, 3, z), (-3, 3, z + 2.2), 0.07, C.steelDark))
        parts.append(strut((-4.2, 3, z + 1.9), (-1.8, 3, z + 1.9), 0.06, C.steelDark))
    return parts


@model('department_store', ao=0.6, ao_dist=5.0)
def department_store(v):
    W, D, H = 36.0, 30.0, 30.0
    wall = C.offwhite if v else C.concrete
    pw = 1.4
    cw, cd = W - 0.6, D - 0.6
    G = 5.4                                         # the shop floor
    bands = [(G + 1.0 + f * 4.0, G + 3.3 + f * 4.0) for f in range(6)]
    ledges = [(b, b + 0.5) for (a, b) in bands]
    shop = [(-cw / 2 + pw, -4.5), (4.5, cw / 2 - pw)]          # display windows either side
    door = (-3.6, 3.6)

    def cell(c, n):
        if abs(n.z) > 0.5:
            return None
        if inside(c.z, bands):
            return C.glassDark
        if inside(c.z, ledges):
            return C.white
        if c.z < G - 0.6:
            return C.glass if c.z > 0.6 else dk(wall, 0.25)
        if c.z < G:
            return C.white
        return None

    zs = cuts(bands, ledges, [(0.6, G - 0.6), (G - 0.6, G)])
    core = gridbox((cw, cd, H), color=wall, zs=zs, cell=cell)
    parts = [core]

    # the shopfront, a panel proud of the core: display windows and the doors
    sw = cw - 2 * pw

    def shopcell(c, n):
        if n.y > -0.5:
            return None
        if inside(c.x, [door]):
            return C.charcoal if c.z > 4.0 else C.glass
        if inside(c.x, shop) and 0.6 < c.z < G - 0.6:
            return C.glass
        return dk(wall, 0.25) if c.z < G - 0.6 else C.white
    parts.append(gridbox((sw, 0.6, G), at=(0, -cd / 2, 0), color=dk(wall, 0.25), xs=cuts(shop, [door]),
                         zs=[0.6, 4.0, G - 0.6], plain='zZxXY', cell=shopcell))
    parts += piers(cw, cd, 0, H, pw, dk(wall, 0.06), proud=0.3)
    parts.append(box((W + 1.2, D + 1.2, 1.0), at=(0, 0, H), color=C.concreteD, bevel=0.3, seg=2))
    # striped awnings over the display windows, a red canopy over the doors
    for a, b in shop:
        w = b - a
        n = int(round(w / 1.6))
        xs = [-w / 2 + w * i / n for i in range(1, n)]
        aw = gridbox((w, 2.4, 0.25), xs=xs, plain='zxXyY', color=C.white,
                     cell=lambda c, nm: C.red if (int((c.x + w / 2) / (w / n)) % 2 == 0) else None)
        deform(aw, lambda p, a=a, b=b: Vector(((a + b) / 2 + p.x, -cd / 2 - 1.5 + p.y, G - 1.2 + p.z - (p.y + 1.2) * -0.32)))
        parts.append(aw)
    parts.append(box((9.0, 3.0, 0.5), at=(0, -cd / 2 - 1.5, G - 0.9), color=C.redDark, bevel=0.15, seg=2))
    # the rooftop sign: a red frame, a white panel and a gold badge, on two legs
    z = H + 1.0
    for s in (-1, 1):
        parts.append(cbox((0.6, 0.6, 1.2), at=(s * 6.0, 0, z), color=C.steelDark, bevel=0.1))
    parts.append(box((18.0, 1.4, 4.0), at=(0, 0, z + 1.0), color=C.red, bevel=0.35, seg=2))
    parts.append(cbox((15.8, 1.6, 2.6), at=(0, 0, z + 1.7), color=C.white, bevel=0.1))
    parts.append(disc(0.9, 0.3, at=(-5.6, -0.95, z + 3.0), color=C.gold, seg=14, rot=(90, 0, 0)))
    parts += ac_unit((-W / 4 - 2, D / 4, z), 2.6)
    parts += ac_unit((W / 4 + 2, D / 4, z), 2.6)
    return parts


def lit_panes(cw, cd, z0, rows, colsx, colsy, color, p, seed, off=0.1):
    """Sprinkle lit-window panes over a glazed core: `rows` are (z0, z1)
    intervals, colsx / colsy the window columns on the X-facing and Y-facing
    walls (box frame). One quad each."""
    out = []
    for face, cols, half in (('-y', colsx, cd / 2), ('+y', colsx, cd / 2), ('-x', colsy, cw / 2), ('+x', colsy, cw / 2)):
        for i, (a, b) in enumerate(cols):
            for k, (r0, r1) in enumerate(rows):
                if hash01(i, k, len(face) + ord(face[1]) + (face[0] == '-') * 7, seed) < p:
                    u = (a + b) / 2
                    sgn = -1 if face[0] == '-' else 1
                    c = (u, sgn * half, z0 + (r0 + r1) / 2) if face[1] == 'y' else (sgn * half, u, z0 + (r0 + r1) / 2)
                    out.append(pane(c, (b - a) * 0.9, (r1 - r0) * 0.9, color, normal=face, off=off))
    return out


@model('skyscraper', ao=0.6, ao_dist=9.0, glow_cols=LIT)
def skyscraper(v):
    H = 140 + v * 40
    w, d, z0 = 30.0, 28.0, 0.0
    th = H / 4
    parts = []
    for i in range(4):
        body = C.steelDark if i % 2 == 0 else C.glassDark
        pw = max(1.0, w * 0.055)
        cw, cd = w - 0.6, d - 0.6
        hh = th - 1.2
        n = max(6, round(hh / 5.0))
        pitch = (hh - 1.0) / n
        rows = [(1.0 + k * pitch + pitch * 0.32, 1.0 + (k + 1) * pitch) for k in range(n)]
        if i == 0:
            rows = rows[1:]                 # the lobby floor below
            lobby = [(0.6, 1.0 + pitch * 0.8)]
        else:
            lobby = []

        def cell(c, nm, rows=rows, lobby=lobby, cw=cw):
            if abs(nm.z) > 0.5:
                return None
            if inside(c.z, rows):
                return C.glass
            if lobby and inside(c.z, lobby):
                return C.glass if abs(c.x if abs(nm.y) > 0.5 else c.y) < (cw / 2 - 3.5) else None
            return None
        core = gridbox((cw, cd, hh), at=(0, 0, z0), color=body, zs=cuts(rows, lobby),
                       xs=([-cw / 2 + 3.5, cw / 2 - 3.5] if lobby else []), cell=cell)
        parts.append(core)
        parts += piers(cw, cd, z0, hh, pw, C.steel, proud=0.25)
        parts.append(box((w + 1.4, d + 1.4, 1.2), at=(0, 0, z0 + hh), color=C.concreteD, bevel=0.35, seg=2))
        # a few late workers
        cols = bays(-cw / 2 + pw, cw / 2 - pw, 5, 0.7)
        colsy = bays(-cd / 2 + pw, cd / 2 - pw, 5, 0.7)
        parts += lit_panes(cw, cd, z0, rows, cols, colsy, C.lemon, 0.05, seed=v * 7 + i, off=0.12)
        if i == 0:
            parts.append(box((10.0, 3.0, 0.5), at=(0, -cd / 2 - 1.3, 1.0 + pitch * 0.8), color=C.concreteD, bevel=0.15, seg=2))
        z0 += th
        w *= 0.82
        d *= 0.82
    # the crown: a stepped pyramid spire, the mast and its beacon
    r = w * 0.5
    crown = lathe([(r * 1.414, 0.0), (r * 1.414, 1.2), (r * 1.1, 1.2), (r * 0.95, H * 0.035), (r * 0.2, H * 0.1), (0.0, H * 0.1)],
                  at=(0, 0, z0), color=C.steelDark, seg=4, rot=(0, 0, 45), smooth=20)
    recolor(crown, lambda c, nm: C.steel if c.z < z0 + 1.2 else (C.glass if H * 0.035 + z0 < c.z < H * 0.06 + z0 else None))
    parts.append(crown)
    parts.append(cyl(0.7, H * 0.13 - 1.0, at=(0, 0, z0 + H * 0.06), color=C.steelDark, seg=10, r2=0.35, bevel=0))
    parts.append(sphere(1.5, at=(0, 0, z0 + H * 0.13), color=C.red, seg=12))
    return parts


@model('tower', ao=0.6, ao_dist=7.0, glow_cols=LIT)
def tower(v):
    W, D, H = 18.0 + v * 3, 18.0 + v * 2, 62.0 + v * 22
    col = [C.steelDark, C.concrete, C.glassDark, C.lightgrey][v]
    trim = [C.lightgrey, C.concreteD, C.steel, C.steelDark][v]
    glass = C.glass if v != 2 else lt(C.glass, 0.25)
    parts = []
    z0 = 0.0
    for blk, (bw, bd, bh) in enumerate(((W, D, H * 0.7), (W * 0.82, D * 0.82, H * 0.3))):
        pw = 1.2
        cw, cd = bw - 0.5, bd - 0.5
        hh = bh - 1.2
        G = 6.0 if blk == 0 else 0.0
        nx, ny = max(3, round(cw / 4.4)), max(3, round(cd / 4.4))
        cx = bays(-cw / 2 + pw, cw / 2 - pw, nx, 0.55)
        cy = bays(-cd / 2 + pw, cd / 2 - pw, ny, 0.55)
        top = hh - 1.6
        # a plant floor band part-way up the tall block
        band = [(hh * 0.5, hh * 0.5 + 2.2)] if blk == 0 else []
        runs = [(G + 0.8, band[0][0]), (band[0][1], top)] if band else [(G + 0.8, top)]
        lobby = [(0.0, G - 0.6)] if G else []

        def cell(c, nm, cx=cx, cy=cy, runs=runs, band=band, lobby=lobby):
            if abs(nm.z) > 0.5:
                return None
            u, cs = (c.x, cx) if abs(nm.y) > 0.5 else (c.y, cy)
            if band and inside(c.z, band):
                return C.charcoal
            if lobby and inside(c.z, lobby):
                return C.glass if (cs[0][0] < u < cs[-1][1]) else dk(col, 0.2)
            if inside(u, cs) and inside(c.z, runs):
                return glass
            return None
        core = gridbox((cw, cd, hh), at=(0, 0, z0), color=col, xs=cuts(cx), ys=cuts(cy),
                       zs=cuts(runs, band, lobby, [(G - 0.6, G)] if G else []), cell=cell)
        parts.append(core)
        parts += piers(cw, cd, z0, hh, pw, trim, proud=0.2)
        parts.append(box((bw + 1.0, bd + 1.0, 1.2), at=(0, 0, z0 + hh), color=C.concreteD, bevel=0.35, seg=2))
        # lit floors: a pane a storey tall on some of the glazed strips
        fl = 3.6
        rows = []
        for a, b in runs:
            k = int((b - a) / fl)
            rows += [(a + j * fl + 0.3, a + (j + 1) * fl - 0.3) for j in range(k)]
        parts += lit_panes(cw, cd, z0, rows, cx, cy, C.lemon, 0.06, seed=v * 5 + blk, off=0.1)
        if blk == 0:
            parts.append(box((cx[-1][1] - cx[0][0] + 2, 2.6, 0.5), at=(0, -cd / 2 - 1.1, G - 0.6), color=trim, bevel=0.15, seg=2))
        z0 += bh
    # rooftop plant and the mast
    parts.append(cbox((W * 0.4, D * 0.35, 2.6), at=(-W * 0.12, D * 0.1, z0), color=C.concreteD, bevel=0.3))
    parts += ac_unit((W * 0.22, -D * 0.2, z0), 2.4)
    parts.append(cyl(0.6, H * 0.16, at=(W * 0.08, 0, z0), color=C.steelDark, seg=10, r2=0.3, bevel=0))
    parts.append(sphere(1.1, at=(W * 0.08, 0, z0 + H * 0.16), color=C.red, seg=12))
    return parts


def loftz(stations, n=8, color=0xcccccc, e=2.0, smooth=60):
    """Skin superellipse sections stacked up Z: (z, w, h[, cx, cy]) — w along
    X, h along Y. Ends capped. Blades, nacelles."""
    bm = bmesh.new()
    rings = []
    for st in stations:
        z, w, h = st[:3]
        cx = st[3] if len(st) > 3 else 0.0
        cy = st[4] if len(st) > 4 else 0.0
        ring = []
        for j in range(n):
            a = 2 * math.pi * j / n
            ca, sa = math.cos(a), math.sin(a)
            ring.append(bm.verts.new((cx + w / 2 * math.copysign(abs(ca) ** (2 / e), ca),
                                      cy + h / 2 * math.copysign(abs(sa) ** (2 / e), sa), z)))
        rings.append(ring)
    for a, b in zip(rings, rings[1:]):
        for j in range(n):
            bm.faces.new((a[j], a[(j + 1) % n], b[(j + 1) % n], b[j]))
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = _from_bmesh(bm, 'loft')
    paint(o, color)
    return _smooth(o, smooth)


def xform(o, m, t=(0, 0, 0)):
    """Apply a 3x3 matrix then a translation to every vertex."""
    T = Vector(t)
    deform(o, lambda p: m @ p + T)
    return o


def banded(profile, bands, color, band_color, seg=24, smooth=50, **kw):
    """A lathe with painted rings: the profile gets extra points at every band
    edge (interpolated along the silhouette), and the rings between them are
    recoloured."""
    zs = sorted({z for b in bands for z in b})
    out = [profile[0]]
    for (r0, z0), (r1, z1) in zip(profile, profile[1:]):
        ins = []
        for z in zs:
            if min(z0, z1) + 1e-4 < z < max(z0, z1) - 1e-4:
                t = (z - z0) / (z1 - z0)
                ins.append((t, (r0 + (r1 - r0) * t, z)))
        out += [p for t, p in sorted(ins)]
        out.append((r1, z1))
    o = lathe(out, color=color, seg=seg, smooth=smooth, **kw)
    recolor(o, lambda c, n: band_color if inside(c.z, bands) else None)
    return o


# ---------------------------------------------------------------- industry

@model('factory', ao=0.65, ao_dist=5.0)
def factory(v):
    W, D, H = 34.0, 22.0, 12.0
    ox = 4.2                                    # centre the whole yard, tank to chimney
    parts = []
    wins = [(-W / 2 + 2.6 + i * 4.2 - 1.2, -W / 2 + 2.6 + i * 4.2 + 1.2) for i in range(8)]
    wins = [w for w in wins if w[0] > -W / 2 + 9]          # the loading bay takes the left end
    dock = (-W / 2 + 2.0, -W / 2 + 8.0)
    sidew = bays(-D / 2 + 1.5, D / 2 - 1.5, 4, 0.5)
    row = (4.5, 7.5)

    def cell(c, n):
        if abs(n.z) > 0.5:
            return None
        if n.y < -0.5 and inside(c.x, [dock]) and c.z < 5.5:
            return C.charcoal
        if c.z < 1.0:
            return dk(C.concreteD, 0.25)
        if inside(c.z, [row]) and inside(c.x if abs(n.y) > 0.5 else c.y, wins if abs(n.y) > 0.5 else sidew):
            return C.glassDark
        if 10.6 < c.z < 11.2:
            return C.redDark
        return None
    zs = [1.0, 4.5, 5.5, 7.5, 10.6, 11.2]
    body = gridbox((W, D, H), at=(ox, 0, 0), color=C.concreteD, xs=cuts(wins, [dock]), ys=cuts(sidew), zs=zs,
                   plain='zZY', cell=cell, bevel=0.3, seg=1)
    parts.append(body)
    # the sawtooth roof: five north lights, glazing on their steep faces
    n, h = 5, 3.0
    b = W / n
    prof = [(-W / 2, 0.0), (W / 2, 0.0), (W / 2, h)]
    for k in range(1, n):
        prof += [(W / 2 - k * b, 0.35), (W / 2 - k * b, h)]
    prof.append((-W / 2, 0.35))
    saw = comb(D, prof, color=C.steelDark,
               cell=lambda c, nm: (C.glass if (nm.z > 0.3 and c.z > 0.4) else None))
    saw.data.transform(Matrix.Rotation(math.radians(90), 4, 'Z'))
    saw.data.transform(Matrix.Translation((ox, 0, H)))
    parts.append(saw)
    # the chimney: brick, white bands, a soot-black cap
    cx, cy = W / 2 - 4 + ox, D / 2 - 4.8
    ch = banded([(2.25, 0.0), (2.0, 1.0), (1.75, 28.6), (2.05, 28.8), (2.05, 30.4), (1.5, 30.4), (1.4, 29.6), (0.0, 29.6)],
                [(8.0, 8.8), (16.0, 16.8), (24.0, 24.8)], C.brick, C.white, seg=16)
    recolor(ch, lambda c, nm: C.charcoal if c.z > 28.65 else None)
    deform(ch, lambda p: p + Vector((cx, cy, 0)))
    parts.append(ch)
    # the steel tank beside it, a ladder and a pipe into the works
    tx, ty = -W / 2 - 5 + ox, 2.0
    tank = banded([(3.4, 0.0), (3.4, 9.0), (3.0, 10.6), (1.8, 11.8), (0.0, 12.2)], [(3.0, 3.4), (6.4, 6.8)],
                  C.steel, C.steelDark, seg=20, smooth=40)
    deform(tank, lambda p: p + Vector((tx, ty, 0)))
    parts.append(tank)
    parts.append(cbox((7.6, 7.6, 0.6), at=(tx, ty, 0), color=C.concrete, bevel=0.15))
    parts.append(tube([(tx + 2.6, ty - 2.4, 7.0), (tx + 4.4, ty - 2.4, 7.0), (-W / 2 + ox, ty - 2.4, 7.0)], 0.45, color=C.yellow, seg=8))
    for s in (-1, 1):
        parts.append(strut((tx - 3.55, ty + s * 0.45, 0.6), (tx - 3.55, ty + s * 0.45, 10.0), 0.08, C.steelDark))
    for k in range(6):
        parts.append(strut((tx - 3.55, ty - 0.45, 1.6 + k * 1.5), (tx - 3.55, ty + 0.45, 1.6 + k * 1.5), 0.06, C.steelDark))
    # the roller shutter in the loading bay, and a canopy over it
    dw = dock[1] - dock[0] - 0.8
    parts.append(gridbox((dw, 0.3, 5.0), at=((dock[0] + dock[1]) / 2 + ox, -D / 2, 0), color=C.steelDark, plain='zZxXY',
                         zs=[0.5 * k for k in range(1, 10)],
                         cell=lambda c, nm: dk(C.steelDark, 0.3) if nm.y < -0.5 and int(c.z / 0.5) % 2 else None))
    parts.append(cbox((dock[1] - dock[0] + 1.2, 1.8, 0.4), at=((dock[0] + dock[1]) / 2 + ox, -D / 2 - 0.8, 5.9), color=C.yellow, bevel=0.1))
    return parts


@model('datacenter', ao=0.6, ao_dist=4.0)
def datacenter(v):
    W, D, H = 46.0, 30.0, 11.0
    ox = -0.55
    parts = []
    pans = [(-W / 2 + 3.5 + i * 4.75 - 1.7, -W / 2 + 3.5 + i * 4.75 + 1.7) for i in range(8)]
    slats = [(4.2 + k * 1.4, 4.2 + k * 1.4 + 0.7) for k in range(3)]
    teal = (-12.5, -3.5)
    door = (W / 2 - 5.2, W / 2 - 2.8)

    def cell(c, n):
        if abs(n.z) > 0.5:
            return None
        if c.z < 0.8:
            return C.steelDark
        if n.y < -0.5:
            if inside(c.x, [door]) and c.z < 3.4:
                return C.charcoal
            if inside(c.x, pans) and 3.4 < c.z < 8.8:
                return C.darkgrey if inside(c.z, slats) else C.steelDark
            if inside(c.x, [teal]) and 8.8 < c.z < 10.0:
                return C.teal
        return None
    zs = cuts(slats, [(3.4, 8.8), (8.8, 10.0)])
    parts.append(box((W, D, H), at=(ox, 0, 0), color=C.lightgrey, bevel=0.35, seg=2))
    # the front: louvre panels, the door and a teal stripe, on one flat panel
    parts.append(gridbox((W - 1.4, 0.3, H - 0.6), at=(ox, -D / 2, 0), color=C.lightgrey, xs=cuts(pans, [teal, door]), zs=zs,
                         plain='zZxXY', cell=cell))
    parts.append(cbox((W + 0.6, D + 0.6, 1.0), at=(ox, 0, H), color=C.steelDark, bevel=0.25))
    parts.append(cbox((W - 1.0, D - 1.0, 0.1), at=(ox, 0, H + 0.9), color=C.grey, bevel=0.03))
    # roof chillers: four long banks, a row of fans along each
    for k in range(4):
        y = -D / 2 + 5 + k * 6.6
        parts.append(cbox((W - 8, 4.4, 2.0), at=(ox, y, H + 0.95), color=C.steel, bevel=0.25))
        for i in range(5):
            x = ox - (W - 8) / 2 + (i + 0.5) * (W - 8) / 5
            parts.append(lathe([(1.7, 0.0), (1.7, 0.25), (0.0, 0.25)], at=(x, y, H + 2.95), color=C.darkgrey, seg=8,
                               close_bottom=False, smooth=20))
    # the switchgear yard
    yx = ox - W / 2 - 6
    parts.append(cbox((5.0, D - 2, 0.4), at=(yx, 0, 0), color=C.concrete, bevel=0.1))
    for i in range(5):
        y = -D / 2 + 4 + i * 5.6
        parts.append(cbox((3.0, 3.0, 3.4), at=(yx, y, 0.4), color=C.concreteD, bevel=0.2))
        parts.append(cyl(0.25, 4.8, at=(yx, y, 3.8), color=C.steelDark, seg=8, bevel=0))
        parts.append(cyl(0.55, 0.9, at=(yx, y, 5.6), color=C.white, seg=10, bevel=0, r2=0.35))
    parts.append(cbox((0.3, D - 4, 0.3), at=(yx, 0, 8.4), color=C.steelDark, bevel=0.05))
    # the two white tanks
    for s in (-1, 1):
        t = banded([(2.6, 0.0), (2.6, 14.6), (2.2, 15.6), (1.0, 16.2), (0.0, 16.4)], [(2.0, 2.6), (12.0, 12.6)],
                   C.white, C.teal, seg=12, smooth=40)
        deform(t, lambda p, s=s: p + Vector((ox + W / 2 + 6, s * D / 4, 0)))
        parts.append(t)
    return parts


# ---------------------------------------------------------------- landmarks

@model('lighthouse', ao=0.6, ao_dist=3.0)
def lighthouse(v):
    parts = []
    bands = [(4 + i * 5.4 - 1.3, 4 + i * 5.4 + 1.3) for i in range(4)]
    tw = banded([(4.9, 0.0), (4.9, 1.2), (4.6, 1.5), (4.15, 1.6), (3.4, 12.0), (2.95, 23.6), (3.6, 24.6), (3.6, 25.0), (0.0, 25.0)],
                bands, C.white, C.red, seg=24)
    recolor(tw, lambda c, n: C.concrete if c.z < 1.55 else (C.charcoal if c.z > 23.7 else None))
    parts.append(tw)
    # a door and three little windows up the front
    parts.append(box((1.5, 0.8, 2.6), at=(0, -4.1, 1.5), color=C.redDark, bevel=0.2, seg=2))
    for z in (7.2, 12.6, 18.0):
        rr = 3.4 - (z - 12) * (0.45 / 11.6) if z > 12 else 4.15 - (z - 1.6) * (0.75 / 10.4)
        parts.append(box((0.9, 0.5, 1.3), at=(0, -rr + 0.12, z - 0.65), color=C.glassDark, bevel=0.12, seg=1))
    # the lantern: glass and its frame, the lamp, the domed red cap
    parts.append(lathe([(2.5, 25.0), (2.5, 28.6), (0.0, 28.6)], color=C.glass, seg=10, close_bottom=False, smooth=20))
    for k in range(10):
        a = 2 * math.pi * (k + 0.5) / 10
        parts.append(strut((2.52 * math.cos(a), 2.52 * math.sin(a), 25.0), (2.52 * math.cos(a), 2.52 * math.sin(a), 28.6), 0.1, C.charcoal))
    parts.append(cyl(1.3, 2.0, at=(0, 0, 25.6), color=C.yellow, seg=12, bevel=0.3))
    parts.append(lathe([(3.2, 28.5), (3.2, 28.9), (2.6, 29.6), (1.4, 30.6), (0.5, 31.1), (0.0, 31.2)], color=C.redDark, seg=20))
    parts.append(cyl(0.12, 1.2, at=(0, 0, 31.1), color=C.charcoal, seg=8, bevel=0))
    parts.append(sphere(0.35, at=(0, 0, 32.4), color=C.charcoal, seg=8))
    # the gallery railing
    parts.append(torus(3.45, 0.1, at=(0, 0, 26.0), color=C.charcoal, seg=32, rseg=4))
    for k in range(12):
        a = 2 * math.pi * k / 12
        parts.append(strut((3.45 * math.cos(a), 3.45 * math.sin(a), 25.0), (3.45 * math.cos(a), 3.45 * math.sin(a), 26.0), 0.06, C.charcoal))
    return parts


@model('satellite_dish', ao=0.6, ao_dist=2.5)
def satellite_dish(v):
    parts = []
    parts.append(box((4.6, 4.6, 0.6), at=(0, 0.6, 0), color=C.concreteD, bevel=0.15, seg=2))
    parts.append(cbox((2.0, 1.6, 2.2), at=(0, 4.3, 0.6), color=C.offwhite, bevel=0.15))     # equipment hut
    parts.append(cbox((0.8, 0.08, 1.4), at=(0.6, 3.47, 0.6), color=C.steelDark, bevel=0.02))
    # four splayed legs to a turntable, then the yoke
    for k in range(4):
        a = math.pi / 4 + k * math.pi / 2
        parts.append(strut((1.7 * math.cos(a), 0.6 + 1.7 * math.sin(a), 0.6), (0.5 * math.cos(a), 0.6 + 0.5 * math.sin(a), 6.0),
                           0.18, C.steelDark, n=6))
    parts.append(cyl(0.9, 1.6, at=(0, 0.6, 5.8), color=C.steelDark, seg=14, bevel=0.15))
    parts.append(cyl(1.2, 0.4, at=(0, 0.6, 7.3), color=C.steel, seg=14, bevel=0.1))
    pivot = Vector((0, 0.6, 9.3))
    parts.append(cbox((1.4, 1.2, 1.8), at=(0, 0.6, 7.6), color=C.steel, bevel=0.2))
    # the dish: a paraboloid shell, white, tilted up toward the front
    f, R, t = 3.2, 4.6, 0.22
    prof = [(0.0, 0.0)]
    for k in range(1, 7):
        r = R * k / 6
        prof.append((r, r * r / (4 * f)))
    prof += [(R, R * R / (4 * f) + 0.3)]
    for k in range(6, 0, -1):
        r = (R - 0.15) * k / 6
        prof.append((r, r * r / (4 * f) + t))
    prof.append((0.0, t))
    dish = lathe(prof, color=C.white, seg=24, close_bottom=False, smooth=60)
    recolor(dish, lambda c, n: C.lightgrey if math.hypot(c.x, c.y) > R - 0.3 else None)
    # +X rotation tips the dish axis toward -Y, the front
    m = Matrix.Rotation(math.radians(32), 3, 'X')
    xform(dish, m, pivot)
    parts.append(dish)
    hub = cyl(0.9, 0.5, color=C.steel, seg=12, bevel=0.1)
    xform(hub, m, pivot + m @ Vector((0, 0, -0.5)))
    parts.append(hub)
    # the feed on its tripod
    focus = pivot + m @ Vector((0, 0, f))
    for k in range(3):
        a = math.radians(90 + k * 120)
        rim = pivot + m @ Vector(((R - 0.3) * math.cos(a), (R - 0.3) * math.sin(a), (R - 0.3) ** 2 / (4 * f) + t))
        parts.append(strut(rim, focus, 0.07, C.steelDark))
    feed = cyl(0.35, 0.9, color=C.charcoal, seg=10, bevel=0.08, r2=0.5)
    xform(feed, m, focus + m @ Vector((0, 0, -0.6)))
    parts.append(feed)
    parts.append(sphere(0.32, at=tuple(focus + m @ Vector((0, 0, 0.35))), color=C.red, seg=10))
    return parts


@model('wind_turbine', ao=0.5, ao_dist=4.0)
def wind_turbine(v):
    H = 54.0
    hz = H + 1.2
    parts = []
    tw = lathe([(2.3, 0.0), (2.2, 0.4), (1.55, H * 0.5), (0.95, H), (0.0, H)], color=C.white, seg=16, smooth=60)
    recolor(tw, lambda c, n: C.lightgrey if c.z < 0.5 else None)
    parts.append(tw)
    parts.append(cyl(2.6, 0.6, color=C.concrete, seg=16, bevel=0.15))
    parts.append(cbox((0.9, 0.1, 2.0), at=(0, -2.1, 0.6), color=C.steelDark, bevel=0.03))
    # the nacelle, along Y, its nose to the front (-Y)
    nac = loftz([(-3.3, 2.6, 2.6), (-3.0, 3.2, 3.0), (1.6, 3.4, 3.0), (2.0, 2.9, 2.6)], n=12, color=C.offwhite, e=3.0)
    xform(nac, Matrix.Rotation(math.radians(-90), 3, 'X'), (0, 0.4, hz))
    parts.append(nac)
    sp = lathe([(1.45, 0.0), (1.4, 0.8), (1.05, 1.8), (0.5, 2.5), (0.0, 2.7)], color=C.white, seg=16, smooth=60)
    xform(sp, Matrix.Rotation(math.radians(90), 3, 'X'), (0, -2.7, hz))
    parts.append(sp)
    # three blades at v1's phase, tips painted red
    for i in range(3):
        a = 0.4 + i * 2 * math.pi / 3 + math.pi / 2
        st = [(1.0, 1.0, 0.7), (3.5, 2.4, 0.9), (8.0, 3.2, 0.7), (16.0, 2.6, 0.5), (28.0, 1.7, 0.36), (38.5, 1.0, 0.25), (41.6, 0.5, 0.15)]
        bl = loftz(st, n=8, color=C.white, e=2.2)
        recolor(bl, lambda c, n: C.red if c.z > 37.0 else None)
        m = Matrix.Rotation(math.pi / 2 - a, 3, 'Y') @ Matrix.Rotation(math.radians(12), 3, 'Z')
        xform(bl, m, (0, -3.6, hz))
        parts.append(bl)
    return parts


# ---------------------------------------------------------------- big structures

@model('stadium', ao=0.6, ao_dist=7.0, glow_cols=LIT)
def stadium(v):
    R = 59.2
    sx = 64.0 / 59.2                          # an oval bowl: 128 x 118
    parts = []
    prof = [(0.69 * R, 0.0), (R, 0.0), (R, 5.0), (R, 14.0), (R + 0.4, 14.6), (R + 0.4, 16.0), (R - 1.0, 16.0),
            (0.85 * R, 9.6), (0.70 * R, 3.0), (0.69 * R, 3.0), (0.69 * R, 0.0)]
    bowl = lathe(prof, color=C.concrete, seg=32, close_bottom=False, smooth=30)
    seats = [C.blue, C.red, C.white]

    def bowlcell(c, n):
        r = math.hypot(c.x, c.y)
        k = int((math.atan2(c.y, c.x) + math.pi) / (2 * math.pi / 32))
        if n.z > 0.3 and 0.70 * R < r < R - 1.0:
            return seats[(k // 2 + (r > 0.85 * R)) % 3]
        if r > R - 0.5 and c.z < 5.0 and abs(n.z) < 0.5:
            return C.charcoal if k % 4 == 0 else C.concreteD
        if c.z > 14.0 and r > R - 0.1 and abs(n.z) < 0.6:
            return C.white
        return None
    recolor(bowl, bowlcell)
    deform(bowl, lambda p: Vector((p.x * sx, p.y, p.z)))
    parts.append(bowl)
    # the white canopy ring over the upper tier, on raking struts
    roof = lathe([(0.80 * R, 23.4), (R + 0.5, 21.4), (R + 0.5, 22.0), (0.80 * R, 24.0), (0.80 * R, 23.4)],
                 color=C.white, seg=32, close_bottom=False, smooth=30)
    deform(roof, lambda p: Vector((p.x * sx, p.y, p.z)))
    parts.append(roof)
    for k in range(12):
        a = 2 * math.pi * (k + 0.5) / 12
        ca, sa = math.cos(a), math.sin(a)
        parts.append(strut(((R - 0.6) * ca * sx, (R - 0.6) * sa, 15.8), ((R + 0.2) * ca * sx, (R + 0.2) * sa, 21.6), 0.35, C.steelDark))
    # the field: grass, a running track, a striped pitch with its lines
    parts.append(deform(cyl(0.70 * R, 0.4, color=C.grass, seg=32, bevel=0), lambda p: Vector((p.x * sx, p.y, p.z))))
    track = lathe([(0.56 * R, 0.4), (0.69 * R, 0.4), (0.69 * R, 0.55), (0.56 * R, 0.55), (0.56 * R, 0.4)],
                  color=C.woodRed, seg=32, close_bottom=False, smooth=20)
    deform(track, lambda p: Vector((p.x * sx, p.y, p.z)))
    parts.append(track)
    PW, PD = 0.92 * R * sx, 0.70 * R
    xs = [-PW / 2 + PW * i / 10 for i in range(1, 10)] + [-0.35, 0.35]

    def pcell(c, n):
        if n.z < 0.5:
            return None
        if abs(c.x) < 0.35 or abs(c.y) > PD / 2 - 0.6:
            return C.white
        return C.grassDark if int((c.x + PW / 2) / (PW / 10)) % 2 else None
    parts.append(gridbox((PW, PD, 0.3), at=(0, 0, 0.4), color=C.grass, xs=xs, ys=[-PD / 2 + 0.6, PD / 2 - 0.6],
                         plain='zxXyY', cell=pcell))
    parts.append(torus(7.0, 0.3, at=(0, 0, 0.72), color=C.white, seg=16, rseg=3))
    # six floodlight masts on the rim, their lamp banks turned to the pitch
    for i in range(6):
        a = math.radians(30 + 60 * i)
        ca, sa = math.cos(a), math.sin(a)
        x, y = (R - 0.6) * ca * sx, (R - 0.6) * sa
        parts.append(cyl(0.9, 20.0, at=(x, y, 15.0), color=C.steelDark, seg=10, r2=0.55, bevel=0))
        m = Matrix.Rotation(a - math.pi / 2, 3, 'Z') @ Matrix.Rotation(math.radians(15), 3, 'X')
        head = cbox((8.0, 1.4, 4.0), color=C.white, bevel=0.12)
        lamps = [pane((sx * 1.85, -0.7, z), 3.3, 1.35, C.lemon, normal='-y', off=0.03) for sx in (-1, 1) for z in (1.15, 2.85)]
        for o in [head] + lamps:
            xform(o, m, (x, y, 34.4))
            parts.append(o)
    return parts


def mast_lattice(x0, y0, half, z0, z1, step, r, color, faces='xXyY'):
    """A square lattice mast: four corner chords and a zigzag on each face."""
    out = []
    for sx in (-1, 1):
        for sy in (-1, 1):
            out.append(strut((x0 + sx * half, y0 + sy * half, z0), (x0 + sx * half, y0 + sy * half, z1), r * 1.6, color))
    n = max(1, int(round((z1 - z0) / step)))
    st = (z1 - z0) / n
    for k in range(n):
        za, zb = z0 + k * st, z0 + (k + 1) * st
        f = 1 if k % 2 == 0 else -1
        if 'y' in faces:
            out.append(strut((x0 - f * half, y0 - half, za), (x0 + f * half, y0 - half, zb), r, color))
        if 'Y' in faces:
            out.append(strut((x0 + f * half, y0 + half, za), (x0 - f * half, y0 + half, zb), r, color))
        if 'x' in faces:
            out.append(strut((x0 - half, y0 + f * half, za), (x0 - half, y0 - f * half, zb), r, color))
        if 'X' in faces:
            out.append(strut((x0 + half, y0 - f * half, za), (x0 + half, y0 + f * half, zb), r, color))
    return out


@model('crane', ao=0.5, ao_dist=3.0)
def crane(v):
    H = 42.0
    ox = -8.75                                 # jib to counter-jib, centred
    Y = C.yellow
    parts = [box((7.0, 7.0, 1.2), at=(ox, 0, 0), color=C.concreteD, bevel=0.25, seg=2)]
    for sx in (-1, 1):
        parts.append(cbox((1.6, 6.0, 1.0), at=(ox + sx * 2.4, 0, 1.2), color=C.concrete, bevel=0.15))
    parts += mast_lattice(ox, 0, 1.1, 1.2, H + 1.2, 3.0, 0.1, Y)
    zt = H + 1.2
    parts.append(cbox((3.6, 3.6, 2.4), at=(ox, 0, zt), color=Y, bevel=0.25))
    zj = zt + 2.4
    # the cab, its windows to the front and the jib side
    parts.append(cbox((2.6, 2.4, 2.4), at=(ox + 1.0, -2.6, zt + 0.2), color=C.blue, bevel=0.3))
    parts.append(pane((ox + 1.0, -3.8, zt + 1.6), 2.0, 1.2, C.glassDark, normal='-y', off=0.02))
    parts.append(pane((ox + 2.3, -2.6, zt + 1.6), 1.8, 1.2, C.glassDark, normal='+x', off=0.02))
    # the jib: a triangular truss out to the right
    x0, x1 = ox + 1.8, ox + 28.0
    bot = [(-0.9, zj), (0.9, zj)]
    ztop = zj + 2.0
    for y, z in bot:
        parts.append(strut((x0, y, z), (x1, y, z), 0.14, Y))
    parts.append(strut((x0, 0, ztop), (x1 - 1.0, 0, ztop - 0.6), 0.14, Y))
    n = 9
    for k in range(n):
        xa, xb = x0 + (x1 - x0) * k / n, x0 + (x1 - x0) * (k + 1) / n
        zt_b = ztop - 0.6 * (k + 1) / n
        for y, z in bot:
            parts.append(strut((xa, y, z), (xb, 0, zt_b), 0.08, Y))
        parts.append(strut((xa, -0.9, zj), (xb, 0.9, zj), 0.08, Y))
    parts.append(cbox((1.2, 2.0, 1.4), at=(x1 - 0.4, 0, zj - 0.1), color=Y, bevel=0.15))
    # the counter-jib with its concrete weights
    c0, c1 = ox - 1.8, ox - 10.5
    for y in (-0.9, 0.9):
        parts.append(strut((c0, y, zj), (c1, y, zj), 0.16, Y))
    parts.append(cbox((abs(c1 - c0), 1.8, 0.3), at=((c0 + c1) / 2, 0, zj - 0.15), color=C.steelDark, bevel=0.05))
    for k in range(3):
        parts.append(cbox((1.1, 2.4, 2.6), at=(c1 + 0.8 + k * 1.2, 0, zj - 2.2), color=C.concrete, bevel=0.12))
    # the apex and its tie bars
    ap = (ox, 0, H + 10.6)
    for sx in (-1, 1):
        for sy in (-1, 1):
            parts.append(strut((ox + sx * 1.3, sy * 1.3, zj), ap, 0.14, Y))
    for y in (-0.6, 0.6):
        parts.append(strut(ap, (ox + 16.0, y * 0.2, ztop - 0.35), 0.06, C.steelDark))
        parts.append(strut(ap, (c1 + 0.4, y * 1.5, zj), 0.06, C.steelDark))
    parts.append(sphere(0.3, at=ap, color=C.red, seg=8))
    # the trolley, the hoist ropes and the hook block
    tx = ox + 19.0
    parts.append(cbox((1.6, 2.0, 0.6), at=(tx, 0, zj - 0.7), color=C.charcoal, bevel=0.1))
    for y in (-0.3, 0.3):
        parts.append(strut((tx, y, zj - 0.7), (tx, y, H - 6.2), 0.05, C.charcoal))
    parts.append(cbox((1.4, 0.9, 1.6), at=(tx, 0, H - 7.8), color=C.yellow, bevel=0.15))
    parts.append(torus(0.5, 0.14, at=(tx, 0, H - 8.4), color=C.charcoal, seg=12, rseg=4, rot=(90, 0, 0), arc=270))
    return parts


@model('ferriswheel', ao=0.55, ao_dist=4.0)
def ferriswheel(v):
    R = 25.2
    base = 2.0
    hz = base + R + 3.1
    parts = []
    parts.append(cbox((14.0, 10.0, base - 0.5), at=(0, 0, 0), color=C.concrete, bevel=0.3))
    parts.append(box((15.0, 11.0, 0.5), at=(0, 0, base - 0.5), color=C.redDark, bevel=0.15, seg=2))
    for s in (-1, 1):
        parts.append(torus(R, 0.5, at=(0, s * 2.0, hz), color=C.white, seg=32, rseg=4, rot=(90, 0, 0)))
    for i in range(16):
        a = 2 * math.pi * i / 16
        ca, sa = math.cos(a), math.sin(a)
        for s in (-1, 1):
            parts.append(strut((1.6 * ca, s * 2.0, hz + 1.6 * sa), (R * ca, s * 2.0, hz + R * sa), 0.16, C.steel, n=3))
        parts.append(strut((R * ca, -2.0, hz + R * sa), (R * ca, 2.0, hz + R * sa), 0.14, C.steel, n=3))
    parts.append(cyl(1.0, 7.4, at=(0, 3.7, hz), color=C.charcoal, seg=12, bevel=0.15, rot=(90, 0, 0)))
    for s in (-1, 1):
        parts.append(cyl(2.0, 0.6, at=(0, s * 2.0 + 0.3, hz), color=C.red, seg=14, bevel=0.15, rot=(90, 0, 0)))
    # the A-frame legs either side
    for s in (-1, 1):
        for sx in (-1, 1):
            parts.append(strut((sx * 10.6, s * 6.2, base - 0.5), (sx * 0.6, s * 3.4, hz), 0.65, C.steelDark, n=6, smooth=50))
        parts.append(strut((-7.6, s * 5.3, base + 7.0), (7.6, s * 5.3, base + 7.0), 0.35, C.steelDark, n=6, smooth=50))
    # sixteen gondolas, hanging plumb
    prof = [(0.0, -3.7), (1.35, -3.5), (1.5, -2.45), (1.5, -1.75), (1.75, -1.6), (0.0, -0.8)]
    for i in range(16):
        a = 2 * math.pi * i / 16 + math.pi / 32
        px, pz = R * math.cos(a), hz + R * math.sin(a)
        col = SETS['candy'][i % len(SETS['candy'])]
        g = lathe(prof, color=col, seg=6, close_bottom=False, smooth=20)
        recolor(g, lambda c, n: C.white if c.z > -1.7 else (C.glass if -2.45 < c.z < -1.75 else None))
        deform(g, lambda p, px=px, pz=pz: p + Vector((px, 0, pz)))
        parts.append(g)
        parts.append(strut((px, 0, pz + 0.2), (px, 0, pz - 0.8), 0.1, C.charcoal, n=3))
    return parts


@model('bridge_span', ao=0.6, ao_dist=4.0)
def bridge_span(v):
    L = 84.0
    ty = L / 2 - 12                            # the towers
    parts = []
    parts.append(gridbox((14.0, L, 1.4), at=(0, 0, 8.4), color=C.concrete, plain='zZxXyY', bevel=0.3, seg=1))

    def road(c, n):
        if n.z < 0.5:
            return None
        ax = abs(c.x)
        if ax < 0.2:
            return C.yellow
        if 4.6 < ax < 4.8:
            return C.white
        if ax > 5.0:
            return C.concrete
        return None
    parts.append(gridbox((13.6, L, 0.3), at=(0, 0, 9.8), color=C.asphalt, xs=[-0.2, 0.2, -4.6, 4.6, -4.8, 4.8, -5.0, 5.0],
                         plain='zxXyY', cell=road))
    for s in (-1, 1):
        parts.append(cbox((0.5, L, 1.0), at=(s * 6.75, 0, 10.1), color=C.steelDark, bevel=0.12))
        parts.append(strut((s * 6.75, -L / 2, 11.4), (s * 6.75, L / 2, 11.4), 0.14, C.steel))
    # abutments under the deck ends
    for e in (-1, 1):
        parts.append(cbox((14.4, 2.4, 8.4), at=(0, e * (L / 2 - 1.2), 0), color=C.concreteD, bevel=0.3))
    # the towers: tapered legs on concrete footings, three portal beams
    for e in (-1, 1):
        y = e * ty
        for s in (-1, 1):
            parts.append(cbox((4.0, 5.0, 2.0), at=(s * 6.0, y, 0), color=C.concreteD, bevel=0.25))
            leg = box((2.4, 3.0, 34.5), color=C.steelDark, bevel=0.35, seg=2)
            deform(leg, lambda p, s=s, y=y: Vector((s * 6.0 + p.x * (1 - 0.35 * p.z / 34.5) - s * 0.6 * p.z / 34.5,
                                                    y + p.y * (1 - 0.3 * p.z / 34.5), p.z)))
            parts.append(leg)
        for z in (6.6, 25.0, 31.6):
            parts.append(box((11.4 - 1.2 * z / 34.5, 2.0, 1.8), at=(0, y, z), color=C.steelDark, bevel=0.3, seg=2))
    # the main cables and the hangers
    zt, zm = 33.6, 20.5
    for s in (-1, 1):
        x = s * 5.55
        pts = [(x, -L / 2 + 0.5, 10.6)]
        for k in range(17):
            yy = -ty + 2 * ty * k / 16
            pts.append((x, yy, zm + (zt - zm) * (yy / ty) ** 2))
        pts.append((x, L / 2 - 0.5, 10.6))
        for a, b in zip(pts, pts[1:]):
            parts.append(strut(a, b, 0.45, C.steelDark, n=4, smooth=60))
        for k in range(1, 20):
            yy = -ty + 2 * ty * k / 20
            zc = zm + (zt - zm) * (yy / ty) ** 2
            parts.append(strut((x, yy, 10.1), (x, yy, zc - 0.2), 0.1, C.steel))
    return parts


@model('rocket_pad', ao=0.55, ao_dist=4.0)
def rocket_pad(v):
    parts = []
    pad = lathe([(13.0, 0.0), (13.0, 1.8), (12.4, 2.4), (11.0, 2.4), (9.5, 2.4), (0.0, 2.4)], color=C.concreteD, seg=24)

    def hazard(c, n):
        if n.z > 0.5 and 9.5 < math.hypot(c.x, c.y) < 11.0:
            return C.yellow if int((math.atan2(c.y, c.x) + math.pi) / (2 * math.pi / 24)) % 2 else C.charcoal
        return None
    recolor(pad, hazard)
    parts.append(pad)
    parts.append(cyl(5.0, 0.12, at=(0, 0, 2.4), color=C.charcoal, seg=24, bevel=0))
    zb = 5.6
    prof = [(0.0, zb), (3.3, zb), (3.6, zb + 0.4), (3.6, zb + 57.2), (2.6, zb + 64.4), (2.6, zb + 66.4),
            (2.45, zb + 68.6), (2.05, zb + 71.0), (1.4, zb + 73.2), (0.6, zb + 74.8), (0.0, zb + 75.6)]
    rk = banded(prof, [(zb + 16.5, zb + 19.5), (zb + 39.0, zb + 41.0), (zb + 57.2, zb + 58.6), (zb + 74.0, zb + 76.0)],
                C.white, C.charcoal, seg=16)
    recolor(rk, lambda c, n: C.red if zb + 39.0 < c.z < zb + 41.0 else None)
    parts.append(rk)
    # a porthole on the capsule, facing the front
    parts.append(cyl(0.7, 0.3, at=(0, -2.45, zb + 66.0), color=C.glassDark, seg=12, bevel=0.08, rot=(90, 0, 0)))
    # four fins, four engine bells, four hold-down posts
    for k in range(4):
        a = math.pi / 4 + k * math.pi / 2
        fin = comb(0.5, [(3.3, zb + 0.6), (6.4, zb - 0.6), (6.4, zb + 3.2), (3.3, zb + 9.0)], color=C.red, bevel=0.1)
        fin.data.transform(Matrix.Rotation(a - math.pi / 2, 4, 'Z'))
        parts.append(fin)
        b = lathe([(1.3, 2.9), (0.75, 4.4), (0.6, zb + 0.1), (0.0, zb + 0.1)], color=C.charcoal, seg=12, smooth=50)
        deform(b, lambda p, a=a: p + Vector((1.75 * math.cos(a + math.pi / 4), 1.75 * math.sin(a + math.pi / 4), 0)))
        parts.append(b)
        parts.append(cbox((1.0, 1.0, zb - 2.4), at=(4.2 * math.cos(a + math.pi / 4), 4.2 * math.sin(a + math.pi / 4), 2.4),
                          color=C.steelDark, bevel=0.12))
    # the service tower beside it, its swing arm and the white room
    tx = -13.0
    parts += mast_lattice(tx, 0, 2.6, 0.0, 58.0, 6.0, 0.16, C.steelDark, faces='xyY')
    for i in range(5):
        parts.append(cbox((5.9, 5.9, 0.35), at=(tx, 0, 10.0 + i * 11.0), color=C.steel, bevel=0.08))
    parts.append(cbox((6.4, 1.6, 1.0), at=(tx + 5.6, 0, 50.0), color=C.steelDark, bevel=0.15))
    parts.append(cbox((2.0, 2.6, 2.8), at=(-4.6, 0, 49.6), color=C.white, bevel=0.2))
    parts.append(strut((tx, 0, 58.0), (tx, 0, 64.0), 0.2, C.steelDark))
    parts.append(sphere(0.45, at=(tx, 0, 64.2), color=C.red, seg=8))
    return parts
