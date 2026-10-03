"""House-stage props, modelled: the small things — desk-top miniatures, sweets,
fruit and tableware, 1cm to 20cm.

Frame reminder (see kit.py): Blender Z is up, X is the prop's width, and the
game's FRONT (+Z) is Blender -Y. Sizes are real metres, matched to
out/specs.json — the procedural box each archetype already occupies.
"""
import math
import bmesh
from mathutils import Vector, Matrix
from kit import (box, cyl, sphere, torus, lathe, extrude, tube, arc_points,
                 subdivide, deform, recolor, lin, mixc, C, SETS)
from kit import _from_bmesh, _bevel, _place, paint, _smooth

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

def gridbox(size, at=(0, 0, 0), color=0xcccccc, cuts=2, bevel=None, seg=2, rot=(0, 0, 0), smooth=30):
    """A `box` whose faces are cut into a grid, so `recolor` and `deform` have
    something to work on (pips, layers, pillowing)."""
    sx, sy, sz = size
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=cuts, use_grid_fill=True)
    for v in bm.verts:
        v.co = Vector((v.co.x * sx, v.co.y * sy, v.co.z * sz + sz / 2))
    o = _from_bmesh(bm, 'gridbox')
    _bevel(o, min(sx, sy, sz) * 0.12 if bevel is None else bevel, seg)
    _place(o, at, rot)
    paint(o, color)
    return _smooth(o, smooth)


def dome(r, h, at=(0, 0, 0), color=0xcccccc, seg=16, rings=5, sy=1.0, rot=(0, 0, 0), base=True):
    """Half an ellipsoid standing on its flat: radius r (x), r*sy (y), height h."""
    prof = [(r * math.cos(math.pi / 2 * i / rings), h * math.sin(math.pi / 2 * i / rings)) for i in range(rings + 1)]
    prof[-1] = (0.0, h)
    o = lathe(prof, color=color, seg=seg, close_bottom=base, smooth=80)
    if sy != 1.0:
        deform(o, lambda p: Vector((p.x, p.y * sy, p.z)))
    return _place(o, at, rot)


def sweep(path, section, color=0xcccccc, smooth=60, up=(0, 0, 1)):
    """A closed tube along `path` [(x, y, z), ...] whose cross-section at
    parameter t (0..1) is `section(t)` -> [(u, w), ...] in (side, up)
    coordinates. Ends are capped. For bananas, spoon handles, anything bent
    whose section is not a circle."""
    bm = bmesh.new()
    rings = []
    n = len(path)
    U = Vector(up)
    for i, p in enumerate(path):
        a = Vector(path[max(0, i - 1)])
        b = Vector(path[min(n - 1, i + 1)])
        T = (b - a).normalized()
        S = T.cross(U).normalized()
        W = S.cross(T).normalized()
        rings.append([bm.verts.new(Vector(p) + S * u + W * w) for (u, w) in section(i / (n - 1))])
    k = len(rings[0])
    for i in range(n - 1):
        r0, r1 = rings[i], rings[i + 1]
        for j in range(k):
            bm.faces.new((r0[j], r0[(j + 1) % k], r1[(j + 1) % k], r1[j]))
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-7)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = _from_bmesh(bm, 'sweep')
    paint(o, color)
    return _smooth(o, smooth)


def top_z(prof, r):
    """Height of a lathe profile's upper surface at radius r (walks in from the axis)."""
    top = list(reversed(prof))
    for (ra, za), (rb, zb) in zip(top, top[1:]):
        if ra <= r <= rb:
            return za + (zb - za) * (r - ra) / (rb - ra)
    return top[0][1]


def orient(obj, n, at):
    """Turn a part built about +Z so its +Z points along `n`, then move it to `at`."""
    q = Vector((0, 0, 1)).rotation_difference(Vector(n).normalized())
    obj.data.transform(q.to_matrix().to_4x4())
    obj.data.transform(Matrix.Translation(Vector(at)))
    obj.data.update()
    return obj


def ellipsoid_point(cx, cy, cz, rx, ry, rz, x, y):
    """The point on top of an axis-aligned ellipsoid above (x, y), and its normal."""
    u, w = (x - cx) / rx, (y - cy) / ry
    t = math.sqrt(max(0.0, 1 - u * u - w * w))
    p = (x, y, cz + rz * t)
    n = (u / rx, w / ry, t / rz)
    return p, n


def sink(p, n, d=0.0001):
    """`p` pushed `d` into the surface along -n, so a stuck-on part has no gap at its rim."""
    return tuple(Vector(p) - Vector(n).normalized() * d)


def shade(col, t):
    """Darken (t > 0) or lighten (t < 0) a palette colour."""
    c = lin(col) if isinstance(col, int) else col
    return mixc(c, (0, 0, 0), t) if t >= 0 else mixc(c, (1, 1, 1), -t)


def hash01(p, k=1.0):
    """A stable pseudo-random 0..1 from a position — for speckle and grain."""
    s = math.sin(p.x * 12.9898e3 * k + p.y * 78.233e3 + p.z * 37.719e3) * 43758.5453
    return s - math.floor(s)


# ---------------------------------------------------------------- paper & stationery

def perforated(w, d, pitch, nr):
    """A stamp outline: a rectangle with round bites along every edge."""
    pts = []
    corners = [(-w / 2, -d / 2), (w / 2, -d / 2), (w / 2, d / 2), (-w / 2, d / 2)]
    for i in range(4):
        (x0, y0), (x1, y1) = corners[i], corners[(i + 1) % 4]
        L = math.hypot(x1 - x0, y1 - y0)
        ux, uy = (x1 - x0) / L, (y1 - y0) / L
        nx, ny = -uy, ux   # inward for a CCW walk
        pts.append((x0, y0))
        n = int(L / pitch)
        for k in range(1, n):
            c = k * L / n
            for a in (180, 90, 0):
                t = c + nr * math.cos(math.radians(a))
                dep = nr * math.sin(math.radians(a))
                pts.append((x0 + ux * t + nx * dep, y0 + uy * t + ny * dep))
    return pts


@model('stamp', ao=0.35)
def stamp(v):
    col = [C.hotpink, C.teal, C.tangerine][v]
    W, D = 0.024, 0.02
    paper = extrude(perforated(W, D, 0.003, 0.00075), 0.0004, color=C.paper, bevel=0)
    pic = box((0.0165, 0.0125, 0.0002), at=(0, 0, 0.0004), color=col, bevel=0)
    # the picture: a hill under a sun, in the stamp's own colours
    hill = extrude([(-0.0078, -0.006), (0.0078, -0.006), (0.0078, -0.0025), (0.003, 0.0012), (-0.0005, -0.0018),
                    (-0.0035, 0.0002), (-0.0078, -0.004)], 0.00015, at=(0, 0, 0.0006), color=shade(col, 0.35), bevel=0)
    sun = cyl(0.0022, 0.00015, at=(-0.0038, 0.0032, 0.0006), color=C.cream, seg=10, bevel=0)
    return [paper, pic, hill, sun]


@model('paperclip', ao=0.4)
def paperclip(v):
    # a round wire lies 1.7mm tall; v1's 2.5mm came from a box stacked on the
    # others, so the inner leg here is sprung up a touch, as on a used clip
    r = 0.00085
    a = 0.00425 - r                 # outer rows
    b = a - 2 * r - 0.0004          # inner rows
    L = 0.0158 - r
    xa = -L + a
    rb = (a + b) / 2
    xb = L - rb
    xc = xa
    z = r
    pts = [(0.006, -a, z)]
    pts += arc_points(a, 270, 90, 9, center=(xa, 0, z), plane='XY')
    pts += arc_points(rb, 90, -90, 9, center=(xb, (a - b) / 2, z), plane='XY')
    pts += arc_points(b, 270, 90, 7, center=(xc, 0, z), plane='XY')
    pts.append((0.0035, b, z + 0.0008))
    clean = [pts[0]]
    for p in pts[1:]:
        if (Vector(p) - Vector(clean[-1])).length > 1e-6:
            clean.append(p)
    return [tube(clean, r, color=C.steel, seg=8)]


@model('coin', ao=0.5)
def coin(v):
    col = [C.gold, C.steel, C.copper][v]
    rim = [(0.0104, 0.0), (0.0112, 0.0006), (0.0112, 0.0016), (0.0104, 0.0022),
           (0.0094, 0.0022), (0.0090, 0.0016)]
    if v == 1:
        # the holed coin
        prof = [(0.0029, 0.0)] + rim + [(0.0048, 0.0016), (0.0044, 0.0020), (0.0029, 0.0020), (0.0029, 0.0)]
        o = lathe(prof, color=col, seg=24, close_bottom=False)
    else:
        prof = [(0.0, 0.0)] + rim + [(0.0055, 0.0016), (0.0052, 0.0020), (0.0, 0.0020)]
        o = lathe(prof, color=col, seg=24)
    field = shade(col, 0.22)
    recolor(o, lambda c, n: field if n.z > 0.9 and 0.0045 < math.hypot(c.x, c.y) < 0.0091 and c.z < 0.0018 else None)
    return [o]


# ---------------------------------------------------------------- critters

@model('ladybug', ao=0.5)
def ladybug(v):
    cy, rx, ry, rz, z0 = 0.0011, 0.006, 0.0063, 0.0066, 0.0012
    shell = dome(rx, rz, at=(0, cy, z0), color=C.red, seg=22, rings=6, sy=ry / rx)
    blk = lin(C.black)
    # the wing-case split: one column of faces down the back (22 segments puts a face on the axis)
    recolor(shell, lambda c, n: blk if n.z < -0.5 or (c.y > -0.003 and abs(c.x) < 0.2 * math.hypot(c.x, c.y - cy)) else None)
    head = dome(0.0027, 0.004, at=(0, -0.0046, 0.0009), color=C.black, seg=12, rings=3, sy=0.9)
    parts = [shell, head]
    for s in (-1, 1):
        # seven-spot: three a side and the shared one at the collar
        for x, y in ((0.0026, 0.0036), (0.0036, 0.0004), (0.0021, -0.0024)):
            p, n = ellipsoid_point(0, cy, z0, rx, ry, rz, s * x, y)
            parts.append(orient(dome(0.00105, 0.00025, color=C.black, seg=8, rings=1, base=False), n, sink(p, n)))
        # white eye patches
        p, n = ellipsoid_point(0, -0.0046, 0.0009, 0.0027, 0.0027 * 0.9, 0.004, s * 0.0013, -0.0066)
        parts.append(orient(dome(0.0008, 0.0002, color=0xffffff, seg=8, rings=1, base=False), n, sink(p, n, 0.00005)))
        for y in (-0.003, 0.0005, 0.004):
            parts.append(box((0.0026, 0.0007, 0.0008), at=(s * 0.0048, y, 0.0), color=C.black, bevel=0,
                             rot=(0, 0, s * (y * 2500))))
    p, n = ellipsoid_point(0, cy, z0, rx, ry, rz, 0, -0.0034)
    parts.append(orient(dome(0.0011, 0.00025, color=C.black, seg=8, rings=1, base=False), n, sink(p, n)))
    return parts


@model('thumbtack', ao=0.55)
def thumbtack(v):
    col = SETS['candy'][v % len(SETS['candy'])]
    pin = cyl(0.00008, 0.0036, r2=0.00055, color=C.steel, seg=8, bevel=0)
    washer = cyl(0.0034, 0.0004, at=(0, 0, 0.0034), color=C.chrome, seg=16, bevel=0)
    grip = lathe([(0.0, 0.0037), (0.0044, 0.0037), (0.0046, 0.0043), (0.0027, 0.0058),
                  (0.0024, 0.0085), (0.0038, 0.0101), (0.0049, 0.0114), (0.0047, 0.0131),
                  (0.003, 0.014), (0.0, 0.0141)], color=col, seg=16)
    # a lighter crown, as if catching the light
    recolor(grip, lambda c, n: shade(col, -0.25) if c.z > 0.0136 else None)
    return [pin, washer, grip]


# ---------------------------------------------------------------- sweets

@model('sugarcube', ao=0.5)
def sugarcube(v):
    o = gridbox((0.0148, 0.0148, 0.0128), color=C.white, cuts=3, bevel=0.0011, seg=2)
    # crystalline sparkle: a few cells a touch blue-grey, a few brighter
    deform(o, lambda p: Vector((p.x, p.y, p.z + 0.00025 * (hash01(p) - 0.5) * (p.z > 0.012))))
    grain = shade(C.white, 0.05)
    recolor(o, lambda c, n: grain if hash01(c, 1.7) > 0.62 else None)
    return [o]


@model('caramel', ao=0.55)
def caramel(v):
    o = gridbox((0.0195, 0.0195, 0.0104), color=C.woodPale, cuts=2, bevel=0.0022, seg=2)
    # soft and a little slumped: the top pillows up, the waist bulges out
    deform(o, lambda p: Vector((p.x * (1 + 0.04 * math.sin(math.pi * min(1, p.z / 0.0104))),
                                p.y * (1 + 0.04 * math.sin(math.pi * min(1, p.z / 0.0104))),
                                p.z + (0.0006 * (1 - (p.x / 0.0098) ** 2) * (1 - (p.y / 0.0098) ** 2) if p.z > 0.009 else 0))))
    dark = lin(C.woodDark)
    recolor(o, lambda c, n: dark if abs(n.z) < 0.6 and 0.0035 < c.z < 0.0069 else None)
    return [o]


# ---------------------------------------------------------------- toys & treasure

@model('key', ao=0.55)
def key(v):
    g = C.gold
    T = 0.0034
    Y0 = 0.0161                     # the bow's centre; the blade runs toward -Y (the front)
    ri, ro = 0.0034, 0.0098
    bow = lathe([(ri, 0.0004), (ri + 0.0005, 0.0), (ro - 0.0007, 0.0), (ro, 0.0007), (ro, T - 0.0007),
                 (ro - 0.0007, T), (ri + 0.0005, T), (ri, T - 0.0004), (ri, 0.0004)],
                at=(0, Y0, 0), color=g, seg=20, close_bottom=False)
    recolor(bow, lambda c, n: shade(g, 0.2) if math.hypot(c.x, c.y - Y0) < ri + 0.0002 else None)
    tip = -0.0257
    blade = extrude([(-0.0026, Y0 - 0.008), (-0.0026, tip + 0.0022), (-0.0010, tip), (0.0016, tip),
                     (0.0030, tip + 0.0016), (0.0044, tip + 0.0030), (0.0044, tip + 0.0046), (0.0028, tip + 0.0062),
                     (0.0044, tip + 0.0084), (0.0028, tip + 0.0106), (0.0046, tip + 0.0126), (0.0046, tip + 0.0148),
                     (0.0026, tip + 0.0172), (0.0026, Y0 - 0.008)],
                    0.0022, at=(0, 0, 0.0006), color=g, bevel=0.0004)
    collar = box((0.0084, 0.0026, 0.0029), at=(0, Y0 - 0.0096, 0.0002), color=g, bevel=0.0007)
    groove = box((0.0009, 0.0215, 0.00012), at=(-0.0011, -0.0122, 0.0028), color=shade(g, 0.3), bevel=0)
    return [bow, blade, collar, groove]


@model('marble', ao=0.3)
def marble(v):
    R = 0.0079
    col = SETS['candy'][v % len(SETS['candy'])]
    o = sphere(R, at=(0, 0, 0.008), color=C.glass, seg=22)
    # two wavy ribbons round tilted equators — the swirl that sits inside a
    # real marble, brought to the surface so it can be seen
    A, B = Vector((0.35, 0.25, 0.9)).normalized(), Vector((-0.6, 0.7, 0.3)).normalized()
    vane, vane2 = lin(col), shade(col, -0.55)

    def swirl(c, n):
        if abs(n.dot(A) + 0.25 * math.sin(2 * math.atan2(n.y, n.x))) < 0.17:
            return vane
        if abs(n.dot(B) + 0.2 * math.sin(2 * math.atan2(n.z, n.x))) < 0.12:
            return vane2
        return None
    recolor(o, swirl)
    # and a hard little glint
    L = Vector((-0.45, -0.55, 0.7)).normalized()
    glint = orient(dome(0.0013, 0.0002, color=0xffffff, seg=8, rings=1, base=False), L,
                   sink(Vector((0, 0, 0.008)) + L * R, L, 0.00005))
    return [o, glint]


def pips(face, n_pips, s, cz, r, color):
    """Pip discs for one face of a die of half-size s centred at height cz."""
    o = 0.0043
    lay = {1: [(0, 0)], 2: [(-o, -o), (o, o)], 3: [(-o, -o), (0, 0), (o, o)],
           4: [(-o, -o), (-o, o), (o, -o), (o, o)], 5: [(-o, -o), (-o, o), (o, -o), (o, o), (0, 0)],
           6: [(-o, -o), (-o, 0), (-o, o), (o, -o), (o, 0), (o, o)]}[n_pips]
    n = Vector(face)
    t1 = Vector((0, 1, 0)) if abs(n.x) > 0.5 else Vector((1, 0, 0))
    t2 = Vector((0, 0, 1)) if abs(n.z) < 0.5 else Vector((0, 1, 0))
    out = []
    for u, w in lay:
        at = Vector((0, 0, cz)) + n * (s - 0.00005) + t1 * u + t2 * w
        out.append(orient(dome(r, 0.00028, color=color, seg=10, rings=1, base=False), n, at))
    return out


@model('die', ao=0.45)
def die(v):
    s = 0.0083
    parts = [box((2 * s, 2 * s, 2 * s), color=C.white, bevel=0.0026, seg=3)]
    # opposite faces sum to seven; the one is a big red pip
    parts += pips((0, 0, 1), 1, s, s, 0.0027, C.red)
    for face, k in (((0, 0, -1), 6), ((0, -1, 0), 2), ((0, 1, 0), 5), ((1, 0, 0), 3), ((-1, 0, 0), 4)):
        parts += pips(face, k, s, s, 0.0016, C.black)
    return parts


@model('bottlecap', ao=0.6)
def bottlecap(v):
    col = [C.red, C.green, C.blue][v]
    # a crown cap, crown up: hollow inside, the skirt crimped into 21 flutes
    prof = [(0.0, 0.0052), (0.0124, 0.0050), (0.0134, 0.0004), (0.0145, 0.0), (0.0155, 0.0008), (0.0150, 0.0026),
            (0.0142, 0.0047), (0.0136, 0.0057), (0.0124, 0.0061), (0.0075, 0.0062), (0.0, 0.0062)]
    o = lathe(prof, color=col, seg=42, smooth=45)

    def crimp(p):
        rr = math.hypot(p.x, p.y)
        if rr < 0.0128 or p.z > 0.0058:
            return p
        k = 1 + 0.055 * math.cos(21 * math.atan2(p.y, p.x)) * min(1.0, (0.0058 - p.z) / 0.004)
        return Vector((p.x * k, p.y * k, p.z))
    deform(o, crimp)
    # a pale disc on the crown, and the cork-coloured liner inside
    disc, liner = shade(col, -0.55), lin(C.cream)
    recolor(o, lambda c, n: disc if n.z > 0.9 and c.z > 0.0061 and math.hypot(c.x, c.y) < 0.0075
            else liner if n.z < -0.5 and c.z > 0.004 else None)
    return [o]


# ---------------------------------------------------------------- sweets, nuts

@model('candy', ao=0.5)
def candy(v):
    col = SETS['candy'][v % len(SETS['candy'])]
    zc = 0.006
    body = sphere(0.0086, at=(0, 0, zc), color=col, seg=16, scale=(1, 0.86, 0.69))
    # the wrapper's shine
    p, n = ellipsoid_point(0, 0, zc, 0.0086, 0.0086 * 0.86, 0.0086 * 0.69, -0.0028, -0.0032)
    parts = [body, orient(dome(0.0017, 0.0002, color=shade(col, -0.6), seg=8, rings=1, base=False), n, sink(p, n, 0.00006))]
    wrap, neck = shade(col, -0.3), shade(col, 0.2)
    for s in (-1, 1):
        # the twisted wrapper end: a pinched neck flaring to a crinkled fan
        tail = lathe([(0.0016, 0.0), (0.0012, 0.0016), (0.0026, 0.0034), (0.0056, 0.0062), (0.0062, 0.0069),
                      (0.0052, 0.0064), (0.0024, 0.0040), (0.0009, 0.0018), (0.0009, 0.0)],
                     color=wrap, seg=14, rot=(0, s * 90, 0), close_bottom=False)

        def crinkle(p):
            rr = math.hypot(p.y, p.z)
            k = 1 + 0.14 * math.cos(7 * math.atan2(p.z, p.y)) * min(1, rr / 0.006)
            return Vector((p.x, p.y * k, p.z * k * 0.74))
        deform(tail, crinkle)
        recolor(tail, lambda c, n: neck if abs(c.x) < 0.002 else None)
        parts.append(_place(tail, (s * 0.0089, 0, zc)))
    return parts


@model('peanut', ao=0.55)
def peanut(v):
    # in its shell, lying along the depth axis, with a lazy bend
    prof = [(0.0, 0.0), (0.0042, 0.0007), (0.0068, 0.0028), (0.0081, 0.0065), (0.0079, 0.0105), (0.0066, 0.0148),
            (0.0060, 0.0172), (0.0066, 0.0198), (0.0080, 0.0240), (0.0083, 0.0282), (0.0071, 0.0322),
            (0.0044, 0.0345), (0.0, 0.0353)]
    o = lathe(prof, color=C.tan, seg=14, rot=(90, 0, 0), smooth=80)
    deform(o, lambda p: Vector((p.x, p.y + 0.01765, p.z + 0.0083 + 0.0009 * math.sin(math.pi * (p.y + 0.0353) / 0.0353) - 0.0009)))
    # the netted shell: a faint lattice of darker cells, and a darker waist
    net, waist = shade(C.tan, 0.12), shade(C.tan, 0.25)

    def shell(c, n):
        if abs(c.y) < 0.0018:
            return waist
        cell = int(math.floor((math.atan2(c.z - 0.0083, c.x) + math.pi) / (2 * math.pi) * 7)) + int(math.floor(c.y / 0.003))
        return net if cell % 2 else None
    recolor(o, shell)
    return [o]


# ---------------------------------------------------------------- stationery & gadgets

@model('battery', ao=0.55)
def battery(v):
    R, H = 0.00715, 0.0482
    body = lathe([(0.0, 0.0), (0.0062, 0.0), (0.0069, 0.0004), (R, 0.0012), (R, 0.0090), (R, 0.0098),
                  (R, H - 0.0012), (0.0069, H - 0.0004), (0.0060, H), (0.0, H)], color=C.tangerine, seg=20)
    steel, band = lin(C.steel), lin(C.charcoal)
    recolor(body, lambda c, n: steel if (c.z < 0.0008 or c.z > H - 0.0006) else band if c.z < 0.0094 else None)
    nub = cyl(0.0026, 0.0024, at=(0, 0, H - 0.0002), color=C.steel, seg=14, bevel=0.0005)
    # a darker seam where the label wraps
    seam = box((0.0012, 0.0016, H - 0.012), at=(R - 0.0003, 0, 0.0098), color=shade(C.tangerine, 0.18), bevel=0.0003)
    return [body, nub, seam]


@model('eraser', ao=0.55)
def eraser(v):
    col, sleeve = (C.white, C.blue) if v else (C.pink, C.hotpink)
    W, D, H = 0.041, 0.0212, 0.0106
    o = gridbox((W, D, H), color=col, cuts=3, bevel=0.0022, seg=2)
    # one end worn round from use
    deform(o, lambda p: Vector((p.x - max(0.0, p.x - 0.012) * 0.06 * (p.z / H),
                                p.y * (1 - max(0.0, p.x - 0.014) * 3.0 * (p.z / H) * 0.6),
                                p.z - max(0.0, p.x - 0.012) * 0.28 * (p.z / H) ** 2)))
    parts = [o]
    parts.append(box((0.025, D + 0.0008, H + 0.0008), at=(-0.0045, 0, -0.0004), color=sleeve, bevel=0.0009))
    parts.append(box((0.0055, D + 0.0012, H + 0.0012), at=(-0.0045, 0, -0.0006), color=C.white if not v else C.yellow,
                     bevel=0.0009))
    return parts


@model('pen', ao=0.55)
def pen(v):
    r = 0.0045
    navy, steel = C.navy, C.steel
    # one turned body, end plug to ball point, laid along +X
    body = lathe([(0.0, 0.0), (0.0030, 0.0), (0.0040, 0.0006), (0.0042, 0.0072), (r, 0.0078), (r, 0.1095),
                  (r + 0.0002, 0.1100), (r + 0.0002, 0.1218), (r, 0.1224), (0.0019, 0.1360), (0.0017, 0.1365),
                  (0.0006, 0.1428), (0.0, 0.1438)], color=navy, seg=14)
    grip, st, ball = lin(C.charcoal), lin(steel), lin(C.charcoal)
    recolor(body, lambda c, n: st if c.z < 0.0075 or 0.1362 < c.z < 0.1425 else grip if 0.1097 < c.z < 0.1221
            else ball if c.z >= 0.1425 else None)
    parts = [_place(body, (-0.0719, 0, r), (0, 90, 0))]
    # the clip: a strip along the top ending in a bead
    clip = box((0.034, 0.0028, 0.0011), at=(-0.047, 0, 2 * r + 0.0002), color=steel, bevel=0.0004)
    deform(clip, lambda p: Vector((p.x, p.y, p.z - max(0.0, -p.x - 0.061) * 0.25)))
    parts += [clip, sphere(0.0011, at=(-0.0315, 0, 2 * r + 0.0003), color=steel, seg=10, scale=(1.4, 1.2, 0.9)),
              box((0.004, 0.0028, 0.0012), at=(-0.0625, 0, 2 * r - 0.0009), color=steel, bevel=0.0004)]
    return parts


@model('lighter', ao=0.6)
def lighter(v):
    col = [C.red, C.blue, C.yellow][v]
    W, D, H = 0.024, 0.0117, 0.062
    body = box((W, D, H), color=col, bevel=0.0042, seg=2)
    # the fuel window: a lighter, translucent-looking panel low on both faces
    window = box((W - 0.007, D + 0.0004, 0.026), at=(0, 0, 0.007), color=shade(col, -0.35), bevel=0.0015)
    collar = box((W - 0.0004, D - 0.0004, 0.0035), at=(0, 0, H - 0.0012), color=C.charcoal, bevel=0.0012)
    lever = box((0.0105, 0.0095, 0.0048), at=(-0.0055, 0, H + 0.0016), color=C.charcoal, bevel=0.0014)
    hood = box((0.0125, 0.0109, 0.0134), at=(0.0052, 0, H + 0.0012), color=C.steel, bevel=0.0018)
    burner = cyl(0.0019, 0.0006, at=(0.0052, 0, H + 0.0142), color=C.charcoal, seg=8, bevel=0)
    wheel = cyl(0.0041, 0.0084, at=(-0.0058, 0.0042, H + 0.0094), color=C.steelDark, seg=14, bevel=0.0006, rot=(90, 0, 0))
    # knurled rim: every other face a shade darker
    knurl = shade(C.steelDark, 0.3)
    recolor(wheel, lambda c, n: knurl if abs(n.y) < 0.4 and int((math.atan2(c.z - H - 0.0094, c.x + 0.0058) + math.pi) / (2 * math.pi) * 14) % 2 else None)
    return [body, window, collar, lever, hood, burner, wheel]


@model('chopsticks', ao=0.5)
def chopsticks(v):
    parts = []
    L, r, r2 = 0.2245, 0.0029, 0.0012
    x0 = -L / 2
    band, tip = lin(C.red), lin(C.woodPale)
    for s in (-1, 1):
        # thick ends apart, tips nearly touching, as if just set down
        sticks = lathe([(0.0, 0.0), (r * 0.8, 0.0), (r, 0.0012), (r, 0.032), (r * 0.98, 0.033), (r * 0.62, 0.17),
                        (r2 + 0.0002, 0.2235), (r2, L - 0.0004), (0.0, L)], color=C.woodDark, seg=8, smooth=50)
        recolor(sticks, lambda c, n: band if 0.004 < c.z < 0.0325 and not (0.010 < c.z < 0.0125) else tip if c.z > 0.198 else None)
        parts.append(_place(sticks, (x0, s * 0.0062, r), (0, 90, -s * 0.75)))
    return parts


@model('matchbox', ao=0.7)
def matchbox(v):
    # the drawer is pushed out a little at +X to show the match heads
    Ls, D, H = 0.0452, 0.0361, 0.015
    xs = -0.0265 + Ls / 2
    sleeve = box((Ls, D, H), at=(xs, 0, 0), color=C.tangerine, bevel=0.0012)
    # strikers on the two long sides; a cream label with a red flame-drop on top
    strikers = [box((0.038, 0.0003, 0.0088), at=(xs, s * (D / 2 + 0.0001), 0.0031), color=C.brown, bevel=0) for s in (-1, 1)]
    label = box((0.032, 0.025, 0.0005), at=(xs, 0, H - 0.0001), color=C.cream, bevel=0)
    flame = [(0.0, 0.0072)] + [(0.0040 * math.cos(math.radians(a)), -0.0016 + 0.0040 * math.sin(math.radians(a)))
                               for a in range(120, 421, 30)]
    drop = extrude(flame, 0.0003, at=(xs - 0.0004, 0, H + 0.0003), color=C.redDark, bevel=0, rot=(0, 0, -90))
    tray_x1 = 0.0266
    tray = [box((0.0012, D - 0.002, H - 0.0022), at=(tray_x1 - 0.0006, 0, 0.0008), color=C.tangerine, bevel=0.0004)]
    for s in (-1, 1):
        tray.append(box((0.009, 0.0012, H - 0.0022), at=(tray_x1 - 0.0045, s * (D / 2 - 0.0016), 0.0008), color=C.tangerine,
                        bevel=0.0004))
    sticks = box((0.0085, D - 0.0045, 0.0094), at=(tray_x1 - 0.0054, 0, 0.0008), color=C.woodPale, bevel=0.0004)
    heads = []
    for i in range(6):
        y = -0.0135 + i * 0.0054
        heads.append(dome(0.0021, 0.0019, at=(tray_x1 - 0.0055, y, 0.0098 + 0.0005 * (i % 2)), color=C.red, seg=8, rings=2,
                          sy=0.85, base=False))
    return [sleeve, label, drop] + strikers + tray + [sticks] + heads


# ---------------------------------------------------------------- food

@model('sushi', ao=0.55)
def sushi(v):
    top = [C.orange, C.red, C.lemon][v]
    rz = 0.012
    zc = 0.8 * rz
    rice = sphere(1.0, at=(0, 0, 0), color=C.white, seg=14, scale=(0.0134, 0.0205, rz))
    # flat-bottomed, lumpy with grains
    deform(rice, lambda p: Vector((p.x * (1 + 0.05 * (hash01(p * 100) - 0.5)), p.y,
                                   zc + max(p.z, -rz * 0.8) * (1 + 0.06 * (hash01(p * 100, 2.3) - 0.5)))))
    grain = shade(C.white, 0.09)
    recolor(rice, lambda c, n: grain if hash01(c, 3.1) > 0.6 else None)
    th = 0.0062 if v == 2 else 0.0046
    z0 = zc + rz - 0.0012
    sag_y, sag_x = (0.0025, 0.0008) if v == 2 else (0.0055, 0.0022)

    def drape(p):
        return Vector((p.x, p.y, p.z - sag_y * (p.y / 0.0228) ** 2 - sag_x * (p.x / 0.0138) ** 2))
    slab = gridbox((0.0276, 0.0455, th), at=(0, 0, z0), color=top, cuts=2, bevel=0.0016 if v < 2 else 0.0012)
    deform(slab, drape)
    parts = [rice, slab]
    if v == 2:
        # tamago: layered omelette sides, and a strap of nori round the middle
        lay = shade(top, 0.12)
        recolor(slab, lambda c, n: lay if abs(n.z) < 0.5 and int((c.z - z0) / th * 3) % 2 else None)
        band = lathe([(1.0, -0.0042), (1.06, -0.0042), (1.06, 0.0042), (1.0, 0.0042), (1.0, -0.0042)],
                     color=0x23302a, seg=28, rot=(90, 0, 0), close_bottom=False)

        def hug(p):
            # onto a rounded rectangle that wraps the rice and the omelette
            a, k = math.atan2(p.z, p.x), math.hypot(p.x, p.z)
            cx, sz = math.cos(a), math.sin(a)
            return Vector((0.0141 * k * math.copysign(abs(cx) ** 0.6, cx), p.y,
                           0.0131 + 0.0129 * k * math.copysign(abs(sz) ** 0.6, sz)))
        deform(band, hug)
        parts.append(band)
    else:
        # bands of fat (salmon) or a paler grain (tuna) across the slice
        fat = lin(C.white) if v == 0 else shade(top, -0.25)
        for y in (-0.0145, -0.0055, 0.0035, 0.0125):
            pts = []
            for i in range(5):
                x = -0.0125 + 0.025 * i / 4
                yy = y + x * 0.4
                pts.append(tuple(drape(Vector((x, yy, z0 + th - 0.0002)))))
            parts.append(tube(pts, 0.0007, color=fat, seg=4))
    return parts


@model('strawberry', ao=0.55)
def strawberry(v):
    prof = [(0.0, 0.0), (0.0034, 0.0016), (0.0074, 0.0058), (0.0110, 0.0114), (0.0141, 0.0178), (0.0156, 0.0234),
            (0.0152, 0.0274), (0.0131, 0.0304), (0.0080, 0.0321), (0.0, 0.0316)]
    body = lathe(prof, color=C.red, seg=16, smooth=70)
    parts = [body]
    # seeds: little pale pyramids, staggered ring by ring
    for row, z in enumerate((0.0045, 0.0095, 0.0150, 0.0205, 0.0260)):
        for i in range(len(prof) - 1):
            (ra, za), (rb, zb) = prof[i], prof[i + 1]
            if za <= z <= zb:
                t = (z - za) / (zb - za)
                rad, dr, dz = ra + (rb - ra) * t, rb - ra, zb - za
                break
        k = max(4, int(rad / 0.0045 * 2.2))
        for j in range(k):
            a = 2 * math.pi * (j + 0.5 * (row % 2)) / k
            nrm = Vector((dz * math.cos(a), dz * math.sin(a), -dr)).normalized()
            at = Vector((rad * math.cos(a), rad * math.sin(a), z))
            parts.append(orient(dome(0.0011, 0.0005, color=C.yellow, seg=4, rings=1, base=False), nrm, sink(at, nrm, 0.0002)))
    # the green calyx: a turned cap pulled into six drooping sepals, and a stalk
    calyx = lathe([(0.0, 0.0335), (0.004, 0.0332), (0.0125, 0.0288), (0.0128, 0.0282),
                   (0.0072, 0.0308), (0.0, 0.0318)], color=C.green, seg=24, smooth=70)

    def sepals(p):
        a = math.atan2(p.y, p.x)
        f = 0.3 + 0.7 * (0.5 + 0.5 * math.cos(6 * a)) ** 1.5
        rr = math.hypot(p.x, p.y)
        drop = (1 - f) * 0.004 * min(1, rr / 0.008)
        return Vector((p.x * f, p.y * f, p.z + drop))
    deform(calyx, sepals)
    stalk = cyl(0.0013, 0.0052, r2=0.0009, at=(0, 0, 0.0316), color=C.greenDark, seg=8, bevel=0.0003, rot=(12, 0, 0))
    return parts + [calyx, stalk]


@model('egg', ao=0.45)
def egg(v):
    # broad end down; r = sin(t)(1 + 0.12 cos t), scaled to the box
    pts = []
    for i in range(15):
        t = math.pi * i / 14
        pts.append((math.sin(t) * (1 + 0.12 * math.cos(t)), (1 - math.cos(t)) / 2))
    m = max(p[0] for p in pts)
    prof = [(0.0217 * r / m, 0.058 * z) for r, z in pts]
    prof[0], prof[-1] = (0.0, 0.0), (0.0, 0.058)
    o = lathe(prof, color=C.cream, seg=24, smooth=80)
    # a few freckles
    fr = shade(C.cream, 0.12)
    recolor(o, lambda c, n: fr if hash01(c, 0.7) > 0.93 else None)
    return [o]


@model('cookie', ao=0.6)
def cookie(v):
    prof = [(0.0, 0.0), (0.0285, 0.0), (0.0308, 0.0022), (0.0312, 0.0052), (0.0293, 0.0082), (0.0245, 0.0099),
            (0.0160, 0.0106), (0.0, 0.0109)]
    o = lathe(prof, color=C.tan, seg=28, smooth=70)

    # hand-made: a wobbly rim, a lumpy top, a touch oval
    def lumpy(p):
        a = math.atan2(p.y, p.x)
        k = 1 + 0.03 * math.sin(5 * a + 1.0) + 0.018 * math.sin(11 * a + 0.4)
        dz = 0.0007 * (hash01(p * 50) - 0.5) if p.z > 0.006 else 0.0
        return Vector((p.x * k, p.y * k * 1.025, p.z + dz))
    deform(o, lumpy)
    edge, top = shade(C.tan, 0.2), shade(C.tan, -0.08)
    recolor(o, lambda c, n: edge if n.z < 0.6 and c.z > 0.0004 else top if n.z > 0.95 and hash01(c, 4.0) > 0.6 else None)
    parts = [o]
    chips = [(0.0, 0.0), (0.014, 0.006), (-0.012, 0.012), (0.004, -0.016), (-0.016, -0.008), (0.019, -0.012),
             (-0.004, 0.022), (0.022, 0.012), (-0.022, 0.004)]
    for i, (x, y) in enumerate(chips):
        z = top_z(prof, math.hypot(x, y))
        parts.append(dome(0.0034 - 0.0005 * (i % 3), 0.0027, at=(x, y * 1.025, z - 0.0009), color=C.woodDark, seg=8, rings=2,
                          sy=0.85 + 0.1 * (i % 2), rot=(0, 0, 37 * i)))
    return parts


@model('mandarin', ao=0.55)
def mandarin(v):
    pts = []
    for i in range(11):
        t = math.pi * i / 10
        pts.append((0.0305 * math.sin(t), 0.026 * (1 - math.cos(t))))
    # dimpled at both poles
    pts[0], pts[-1] = (0.0, 0.0012), (0.0, 0.0505)
    o = lathe(pts, color=C.orange, seg=22, smooth=80)
    # segments showing faintly through the peel
    seg_c = shade(C.orange, 0.06)
    recolor(o, lambda c, n: seg_c if int((math.atan2(c.y, c.x) + math.pi) / (2 * math.pi) * 22) % 2 and 0.006 < c.z < 0.046 else None)
    stem = cyl(0.0032, 0.004, r2=0.0024, at=(0, 0, 0.0498), color=C.greenDark, seg=10, bevel=0.0006)
    calyx = cyl(0.0058, 0.0009, at=(0, 0, 0.0497), color=C.green, seg=10, bevel=0.0003)
    leaf = sphere(0.0105, at=(0.0105, 0.002, 0.0532), color=C.green, seg=10, scale=(1.0, 0.45, 0.1), rot=(0, -12, 24))
    rib = box((0.017, 0.0007, 0.0004), at=(0.0105, 0.002, 0.0538), color=C.greenDark, bevel=0, rot=(0, -12, 24))
    return [o, stem, calyx, leaf, rib]


@model('apple', ao=0.6)
def apple(v):
    col = C.red if v else C.lime
    prof = [(0.0, 0.0045), (0.007, 0.0028), (0.016, 0.0015), (0.026, 0.0035), (0.0335, 0.0105), (0.0383, 0.0225),
            (0.0385, 0.0385), (0.0355, 0.0525), (0.029, 0.0625), (0.0195, 0.0685), (0.010, 0.0672), (0.0035, 0.0625),
            (0.0, 0.0605)]
    o = lathe(prof, color=col, seg=24, smooth=80)
    # five soft lobes toward the base
    deform(o, lambda p: Vector((p.x * (1 + 0.035 * math.cos(5 * math.atan2(p.y, p.x)) * max(0.0, 1 - p.z / 0.05)),
                                p.y * (1 + 0.035 * math.cos(5 * math.atan2(p.y, p.x)) * max(0.0, 1 - p.z / 0.05)), p.z)))
    # a blush (green apple) or a paler, speckled shoulder (red apple)
    # graded over many faces so it reads as a soft flush, not a patch
    other = lin(C.redDark) if v else lin(C.red)
    D = Vector((0.6, -0.6, 0.2)).normalized() if v else Vector((0.7, 0.7, 0.1)).normalized()
    amt = 0.4 if v else 0.3
    recolor(o, lambda c, n: mixc(lin(col), other, amt * max(0.0, min(1.0, (n.dot(D) - 0.15) / 0.7)))
            if n.dot(D) > 0.15 else None)
    stem = tube([(0.0, 0.0, 0.058), (0.0008, 0.0, 0.069), (0.0030, 0.0, 0.0785), (0.0058, 0.0, 0.0845)], 0.0021,
                color=C.woodDark, seg=8, taper=lambda t: 1.0 - 0.3 * t)
    leaf = sphere(0.0135, at=(-0.0105, 0.0, 0.0738), color=C.green, seg=12, scale=(1.0, 0.48, 0.1), rot=(0, 22, 12))
    rib = box((0.022, 0.0008, 0.0005), at=(-0.0105, 0.0, 0.0742), color=C.greenDark, bevel=0, rot=(0, 22, 12))
    return [o, stem, leaf, rib]


@model('banana', ao=0.6)
def banana(v):
    # lying on its side, curving in the floor plane, tips lifted clear
    N = 22
    path = []
    for i in range(N + 1):
        t = -1 + 2 * i / N
        path.append((0.0845 * t, 0.0235 * (1 - t * t), 0.0185 + 0.0105 * t ** 4))

    def section(t):
        s = abs(2 * t - 1)
        r = 0.0163 * max(0.08, (1 - s ** 3)) ** 0.55
        r = max(r, 0.0024)
        out = []
        for j in range(10):
            a = 2 * math.pi * j / 10
            k = 1 + 0.07 * math.cos(5 * a)          # five soft ridges
            out.append((r * k * math.cos(a), r * k * math.sin(a) * 1.12))
        return out
    body = sweep(path, section, color=C.yellow, smooth=70)
    green, tipc = mixc(lin(C.yellow), lin(C.lime), 0.55), lin(C.woodDark)
    recolor(body, lambda c, n: tipc if c.x > 0.082 else green if c.x < -0.072 else None)
    stem = cyl(0.0035, 0.011, r2=0.003, at=(-0.0825, 0.0, 0.0236), color=mixc(lin(C.lime), lin(C.woodDark), 0.5),
               seg=8, bevel=0.0008, rot=(0, -75, 0))
    return [body, stem]


@model('spoon', ao=0.55)
def spoon(v):
    R, K = 0.0176, 0.052 / 0.0352
    bowl = lathe([(0.0, 0.0), (0.008, 0.0005), (0.0135, 0.0019), (0.0168, 0.0042), (R, 0.0058), (0.0170, 0.0062),
                  (0.0158, 0.0050), (0.0125, 0.0029), (0.0070, 0.0016), (0.0, 0.0013)], color=C.chrome, seg=24,
                 smooth=60)
    deform(bowl, lambda p: Vector((0.0457 + p.x * K, p.y, p.z)))
    inner = mixc(lin(C.chrome), lin(C.steelDark), 0.85)
    recolor(bowl, lambda c, n: inner if n.z > 0.2 and c.z > 0.0009 and math.hypot((c.x - 0.0457) / K, c.y) < 0.0165 else None)
    # the handle: dips at the neck, then sweeps up to a paddle
    N = 14
    path = []
    for i in range(N + 1):
        t = i / N
        x = 0.022 - t * 0.0927
        path.append((x, 0.0, 0.0050 - 0.0016 * math.sin(math.pi * min(1, t / 0.35)) * (t < 0.35) + 0.0055 * max(0.0, t - 0.3) ** 1.4 / 0.7 ** 1.4))

    def section(t):
        w = 0.0034 + 0.0026 * t + 0.0034 * max(0.0, (t - 0.6) / 0.4) ** 0.8
        if t > 0.93:
            w *= math.sqrt(max(0.05, 1 - ((t - 0.93) / 0.07) ** 2))
        h = 0.0009
        return [(w * math.cos(2 * math.pi * j / 10), h * math.sin(2 * math.pi * j / 10)) for j in range(10)]
    handle = sweep(path, section, color=C.chrome, smooth=60)
    return [bowl, handle]


@model('sakecup', ao=0.6)
def sakecup(v):
    prof = [(0.0, 0.0), (0.0118, 0.0), (0.0124, 0.0006), (0.0122, 0.0032), (0.0135, 0.0042), (0.0185, 0.0125),
            (0.0222, 0.0275), (0.0232, 0.0335), (0.0226, 0.034), (0.0214, 0.0332), (0.0204, 0.027), (0.0168, 0.0128),
            (0.0115, 0.0068), (0.0098, 0.0060), (0.0068, 0.0057), (0.0040, 0.0056), (0.0, 0.0056)]
    o = lathe(prof, color=C.white, seg=24, smooth=50)
    # the snake's-eye: blue rings in the bottom of the cup, and a blue lip line
    blue = lin(C.blue)
    recolor(o, lambda c, n: blue if (n.z > 0.5 and c.z < 0.0065 and c.z > 0.003 and
                                     (math.hypot(c.x, c.y) < 0.0040 or 0.0068 < math.hypot(c.x, c.y) < 0.0098))
            or c.z > 0.0333 else None)
    return [o]


@model('teacup', ao=0.65)
def teacup(v):
    col = [C.white, C.cyan, C.cream][v]
    band = [C.blue, C.white, C.redDark][v]
    prof = [(0.0, 0.0012), (0.0170, 0.0), (0.0182, 0.0004), (0.0184, 0.0042), (0.0205, 0.0062),
            (0.0262, 0.0165), (0.0298, 0.0350), (0.0311, 0.0440), (0.0316, 0.0505), (0.0325, 0.0603), (0.0321, 0.062),
            (0.0307, 0.0612), (0.0302, 0.0560), (0.0275, 0.0330), (0.0185, 0.0100), (0.0, 0.0088)]
    cup = lathe(prof, color=col, seg=24, smooth=50)
    b, gold = lin(band), lin(C.gold)
    recolor(cup, lambda c, n: gold if c.z > 0.0608 else b if 0.044 < c.z < 0.0505 and n.z > -0.5 and math.hypot(c.x, c.y) > 0.0305 else None)
    tea = cyl(0.0284, 0.0012, at=(0, 0, 0.0445), color=mixc(lin(C.orange), lin(C.brown), 0.45), seg=24, bevel=0)
    handle = tube(arc_points(0.0092, -95, 95, 10, center=(0.0272, 0, 0.034), plane='XZ'), 0.0031, color=col, seg=8)
    return [cup, tea, handle]


# ---------------------------------------------------------------- nature

# v1's fly agaric (v0) measures 0.137 tall only because its spots were placed
# ~4cm above the cap; all three caps here share the 0.095 height of v1/v2.
@model('mushroom', ao=0.65)
def mushroom(v):
    capc = [C.red, C.tan, C.brown][v]
    stem = lathe([(0.0, 0.0), (0.0200, 0.0), (0.0232, 0.0040), (0.0222, 0.0130), (0.0186, 0.0300), (0.0166, 0.0460),
                  (0.0160, 0.0560), (0.0, 0.0560)], color=C.cream, seg=16, smooth=70)
    flat = 0.85 if v == 2 else 1.0
    top = 0.0951
    cap_prof = [(0.0, 0.051), (0.012, 0.0505), (0.030, 0.0515), (0.0425, 0.0535), (0.0451, 0.0565),
                (0.0446, 0.0605), (0.0405, 0.0715), (0.0325, 0.0820), (0.0205, 0.0905), (0.0, top)]
    cap_prof = [(r, 0.051 + (z - 0.051) * (flat if z > 0.06 else 1.0)) for r, z in cap_prof]
    cap = lathe(cap_prof, color=capc, seg=24, smooth=70)
    # gills: fine radial lines on the cream underside
    gill, gill2 = lin(C.cream), shade(C.cream, 0.18)
    recolor(cap, lambda c, n: (gill2 if int((math.atan2(c.y, c.x) + math.pi) / (2 * math.pi) * 24) % 2 else gill)
            if n.z < -0.3 else None)
    parts = [stem, cap]
    if v == 0:
        # the fly agaric's white flecks, and its skirt
        for x, y in ((0.0, 0.0), (0.019, 0.008), (-0.016, 0.014), (0.004, -0.021), (-0.022, -0.012), (0.03, -0.012),
                     (-0.006, 0.031), (0.024, 0.024)):
            rr = math.hypot(x, y)
            for i in range(len(cap_prof) - 1):
                (ra, za), (rb, zb) = cap_prof[-1 - i], cap_prof[-2 - i]
                if ra <= rr <= rb:
                    t = (rr - ra) / (rb - ra)
                    z, dr, dz = za + (zb - za) * t, rb - ra, zb - za
                    break
            a = math.atan2(y, x)
            nrm = Vector((-dz * math.cos(a), -dz * math.sin(a), dr)).normalized()
            nrm = nrm if nrm.z > 0 else -nrm
            parts.append(orient(dome(0.0052 - 0.0008 * (rr > 0.02), 0.0016, color=C.white, seg=8, rings=2, base=False,
                                     sy=0.85), nrm, sink((x, y, z), nrm, 0.0003)))
        parts.append(lathe([(0.0164, 0.0445), (0.0215, 0.0405), (0.0222, 0.0395), (0.0168, 0.0425), (0.0164, 0.0445)],
                           color=C.white, seg=16, close_bottom=False))
    elif v == 2:
        # a paler rim on the brown cap
        rim = shade(capc, -0.25)
        recolor(cap, lambda c, n: rim if n.z >= -0.3 and math.hypot(c.x, c.y) > 0.040 else None)
    return parts
