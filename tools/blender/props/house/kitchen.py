"""House-stage props, modelled: kitchen, appliances, living room and the garden.

Frame reminder (see kit.py): Blender Z is up, X is the prop's width, and the
game's FRONT (+Z) is Blender -Y. Sizes are real metres, matched to
out/specs.json — the procedural box each archetype already occupies.
"""
import math
import random
import bmesh
from mathutils import Vector
import kit
from kit import (box, cyl, sphere, torus, lathe, extrude, tube, arc_points,
                 subdivide, deform, recolor, lin, mixc, C, SETS)

MODELS = {}
FINISH = {}


def model(pid, **finish):
    def wrap(fn):
        MODELS[pid] = fn
        if finish:
            FINISH[pid] = finish
        return fn
    return wrap


def dark(col, t=0.25):
    return mixc(lin(col), (0, 0, 0), t)


def light(col, t=0.35):
    return mixc(lin(col), (1, 1, 1), t)


def place(obj, at=(0, 0, 0), rot=(0, 0, 0)):
    """Rotate (degrees XYZ) then move an already-built part."""
    return kit._place(obj, at, rot)


def want(pid, v):
    """The catalogue box for a variant, in the Blender frame: (x, y, z)."""
    w, h, d = kit.SPECS[pid]['boxes'][v]['size']
    return w, d, h


def bounds(parts):
    lo = [1e9] * 3
    hi = [-1e9] * 3
    for o in parts:
        for vt in o.data.vertices:
            for i in range(3):
                lo[i] = min(lo[i], vt.co[i])
                hi[i] = max(hi[i], vt.co[i])
    return lo, hi


def fit(parts, size, measure=None, base=0.0):
    """Scale `parts` so the bounds of `measure` (default: parts) span `size`
    (x, y, z), centred on the Z axis and scaled about `base` in z. For the
    organic props, whose scatter makes their extent hard to predict."""
    lo, hi = bounds(measure or parts)
    cx, cy = (lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2
    sx = size[0] / (hi[0] - lo[0])
    sy = size[1] / (hi[1] - lo[1])
    sz = (size[2] - base) / (hi[2] - base)
    for o in parts:
        deform(o, lambda p: Vector(((p.x - cx) * sx, (p.y - cy) * sy, base + (p.z - base) * sz)))
    return parts


def leaf(ll, lw, col, rib=None, thick=0.014, curl=0.045, seg=12):
    """A broad leaf lying along +Y from the origin: pointed at the far end,
    cupped a little, arching down by `curl` metres, its midrib painted `rib`."""
    o = sphere(0.5, color=col, seg=seg, rot=(90, 0, 0))
    deform(o, lambda p: Vector((p.x * lw * (1 - 0.6 * max(0.0, p.y + 0.05) ** 1.4),
                                (p.y + 0.5) * ll,
                                p.z * thick - curl * (p.y + 0.5) ** 2 + 0.15 * lw * (p.x * 2) ** 2)))
    if rib is not None:
        recolor(o, lambda c, n: rib if (abs(c.x) < lw * 0.09 and n.z > 0.3 and c.y < ll * 0.75) else None)
    return o


# ---------------------------------------------------------------- tableware

@model('bowl')
def bowl(v):
    col = C.navy if v else C.white
    band = C.white if v else C.blue
    body = lathe([(0.0, 0.002), (0.024, 0.002), (0.026, 0.0), (0.0295, 0.0), (0.031, 0.009),
                  (0.045, 0.021), (0.057, 0.04), (0.0618, 0.058), (0.0636, 0.0665), (0.064, 0.0745),
                  (0.0622, 0.076), (0.0605, 0.072), (0.058, 0.056), (0.05, 0.037), (0.036, 0.022),
                  (0.0, 0.0145)], color=col, seg=24)
    # a painted band below the lip and a ring round the foot
    recolor(body, lambda c, n: band if (0.058 < c.z < 0.0665 and n.z < 0.6 and math.hypot(c.x, c.y) > 0.061) else None)
    recolor(body, lambda c, n: band if (c.z < 0.0095 and math.hypot(c.x, c.y) > 0.0285) else None)
    return [body]


@model('plate', ao=0.6)
def plate(v):
    col = C.white
    body = lathe([(0.0, 0.0025), (0.05, 0.0025), (0.053, 0.0), (0.058, 0.0), (0.0605, 0.0035),
                  (0.092, 0.0085), (0.111, 0.0165), (0.1175, 0.0205), (0.118, 0.022), (0.1162, 0.0222),
                  (0.1085, 0.0175), (0.09, 0.0095), (0.0755, 0.0072), (0.072, 0.0068), (0.0, 0.0068)],
                 color=col, seg=32)
    # a blue line round the rim and a fainter one round the well
    recolor(body, lambda c, n: C.blue if (n.z > 0.2 and 0.1075 < math.hypot(c.x, c.y) < 0.1125) else None)
    recolor(body, lambda c, n: mixc(lin(C.blue), lin(col), 0.45) if (n.z > 0.2 and 0.07 < math.hypot(c.x, c.y) < 0.075) else None)
    return [body]


@model('thermos')
def thermos(v):
    col = [C.steel, C.red, C.navy][v]
    cap = C.charcoal
    body = lathe([(0.0, 0.0), (0.036, 0.0), (0.0405, 0.002), (0.042, 0.007), (0.042, 0.02),
                  (0.042, 0.15), (0.042, 0.172), (0.042, 0.236), (0.0405, 0.242), (0.037, 0.246),
                  (0.0, 0.246)], color=col, seg=20)
    # a dark grip ring at the foot and a pale stripe round the middle
    recolor(body, lambda c, n: cap if c.z < 0.02 else None)
    recolor(body, lambda c, n: light(col, 0.6) if 0.15 < c.z < 0.172 and abs(n.z) < 0.5 else None)
    # the cup that screws on as the lid, with a ribbed grip band
    cup = lathe([(0.0375, 0.243), (0.041, 0.248), (0.041, 0.26), (0.0428, 0.262), (0.0428, 0.274),
                 (0.041, 0.276), (0.041, 0.293), (0.037, 0.2995), (0.0, 0.3)], color=cap, seg=20)
    recolor(cup, lambda c, n: mixc(lin(cap), lin(col), 0.4) if math.hypot(c.x, c.y) > 0.042 else None)
    return [body, cup]


@model('wine')
def wine(v):
    col = C.greenDark if v else C.woodDark
    glass = mixc(lin(col), (0, 0, 0), 0.15)
    bottle = lathe([(0.0, 0.007), (0.03, 0.003), (0.041, 0.0), (0.0435, 0.006), (0.0435, 0.166),
                    (0.041, 0.19), (0.031, 0.21), (0.0195, 0.231), (0.0158, 0.25), (0.0158, 0.264),
                    (0.0, 0.264)], color=glass, seg=20)
    foil = lathe([(0.0164, 0.25), (0.0178, 0.253), (0.0178, 0.296), (0.019, 0.3), (0.0165, 0.308),
                  (0.0, 0.308)], color=C.gold, seg=20)
    label = lathe([(0.0436, 0.07), (0.0446, 0.072), (0.0446, 0.09), (0.0446, 0.114), (0.0446, 0.15),
                   (0.0436, 0.152)], color=C.paper, seg=20, close_bottom=False)
    # a burgundy band across the label
    recolor(label, lambda c, n: C.redDark if 0.09 < c.z < 0.114 else None)
    return [bottle, foil, label]


# ---------------------------------------------------------------- appliances

def toast_slice(x0, y, z0, w=0.17, h=0.075, t=0.013):
    """A slice of bread standing in the XZ plane: a square loaf with a domed top."""
    pts = [(-w / 2, 0.0), (w / 2, 0.0), (w / 2, h * 0.68)]
    for i in range(1, 7):
        a = math.pi * i / 7
        pts.append((math.cos(a) * w / 2, h * 0.68 + math.sin(a) * h * 0.32))
    pts.append((-w / 2, h * 0.68))
    s = extrude(pts, t, at=(x0, y + t / 2, z0), color=C.tan, bevel=0.003, rot=(90, 0, 0))
    recolor(s, lambda c, n: 0xb07a3e if abs(n.y) < 0.7 else None)
    return s


@model('toaster')
def toaster(v):
    body_c, trim = C.chrome, C.charcoal
    W, D, H = 0.29, 0.16, 0.15
    parts = [box((W - 0.02, D - 0.02, 0.012), at=(0, 0, 0), color=trim, bevel=0.004, seg=1)]
    body = box((W, D, H), at=(0, 0, 0.007), color=body_c, bevel=0.034, seg=3)
    parts.append(body)
    # two slots running the length of the top, a slice of toast in each
    for y in (-0.028, 0.028):
        parts.append(box((0.2, 0.026, 0.004), at=(0, y, 0.007 + H - 0.0035), color=trim, bevel=0.0015, seg=1))
        parts.append(toast_slice(0, y, 0.105))
    # the lever and the browning dial on the right side
    parts.append(box((0.004, 0.018, 0.09), at=(W / 2 - 0.001, 0, 0.04), color=trim, bevel=0.0015, seg=1))
    parts.append(box((0.026, 0.034, 0.018), at=(W / 2 + 0.01, 0, 0.098), color=trim, bevel=0.006))
    parts.append(cyl(0.013, 0.012, at=(W / 2 - 0.002, -0.042, 0.06), color=C.red, seg=12, rot=(0, 90, 0), bevel=0.003))
    # a little ready light on the front
    parts.append(sphere(0.006, at=(0.1, -D / 2 + 0.001, 0.035), color=C.lime, seg=8, scale=(1, 0.5, 1)))
    return parts


@model('kettle')
def kettle(v):
    col, trim = C.steel, C.charcoal
    body = lathe([(0.0, 0.0), (0.07, 0.0), (0.078, 0.003), (0.0855, 0.016), (0.088, 0.04),
                  (0.085, 0.08), (0.075, 0.115), (0.06, 0.142), (0.048, 0.154), (0.046, 0.16), (0.0, 0.16)],
                 color=col, seg=24)
    recolor(body, lambda c, n: dark(col, 0.2) if c.z < 0.008 else None)
    lid = lathe([(0.0, 0.156), (0.049, 0.156), (0.05, 0.162), (0.046, 0.168), (0.03, 0.176), (0.0, 0.179)],
                color=trim, seg=24)
    knob = sphere(0.013, at=(0, 0, 0.184), color=C.red, seg=12, scale=(1, 1, 0.8))
    spout = tube([(0.06, 0, 0.04), (0.086, 0, 0.06), (0.1, 0, 0.088), (0.11, 0, 0.112), (0.116, 0, 0.128)],
                 0.015, color=col, seg=12, taper=lambda t: 1.0 - 0.45 * t)
    whistle = cyl(0.0095, 0.012, at=(0.117, 0, 0.126), color=trim, seg=12, rot=(0, 35, 0), bevel=0.003)
    # an arched handle over the top, in the plane of the spout
    R = 0.068
    pts = [(-0.064, 0, 0.13), (-R, 0, 0.17)] + arc_points(R, 180, 0, 10, center=(0, 0, 0.197))[1:-1] + [(R, 0, 0.17), (0.064, 0, 0.13)]
    handle = tube(pts, 0.0065, color=col, seg=10)
    grip = tube(arc_points(R, 140, 40, 6, center=(0, 0, 0.197)), 0.0105, color=trim, seg=10)
    return [body, lid, knob, spout, whistle, handle, grip]


@model('ricecooker')
def ricecooker(v):
    col, lidc, trim = C.white, C.lightgrey, C.charcoal
    body = lathe([(0.0, 0.0), (0.13, 0.0), (0.141, 0.004), (0.148, 0.018), (0.15, 0.05), (0.15, 0.16),
                  (0.1485, 0.19), (0.144, 0.207), (0.137, 0.217), (0.0, 0.217)], color=col, seg=24)
    # a dark foot, and a pale band round the shoulder just under the lid
    recolor(body, lambda c, n: trim if c.z < 0.012 else None)
    recolor(body, lambda c, n: lidc if 0.16 < c.z < 0.19 and abs(n.z) < 0.5 else None)
    lid = lathe([(0.136, 0.213), (0.142, 0.219), (0.142, 0.226), (0.128, 0.242), (0.095, 0.259),
                 (0.045, 0.269), (0.0, 0.271)], color=lidc, seg=24)
    vent = cyl(0.017, 0.01, at=(0, 0.075, 0.256), color=trim, seg=12, bevel=0.003)
    # a carry handle arched over the lid, on two lugs
    hc = mixc(lin(lidc), (0, 0, 0), 0.18)
    parts = [body, lid, vent]
    for s in (-1, 1):
        parts.append(box((0.022, 0.03, 0.02), at=(s * 0.068, 0, 0.252), color=hc, bevel=0.005, seg=1))
    parts.append(tube(arc_points(0.068, 180, 0, 9, center=(0, 0, 0.262)), 0.0092, color=hc, seg=8))
    # the control panel, bent round the belly, with its button and light
    panel = box((0.12, 0.022, 0.065), at=(0, -0.142, 0.095), color=trim, bevel=0.007, seg=1)
    deform(panel, lambda p: Vector((p.x, p.y + p.x * p.x / 0.3, p.z)))
    parts.append(panel)
    parts.append(cyl(0.015, 0.008, at=(0.024, -0.151, 0.128), color=C.lime, seg=12, rot=(90, 0, 0), bevel=0.003))
    parts.append(sphere(0.006, at=(-0.03, -0.152, 0.131), color=C.orange, seg=8))
    return parts


@model('microwave')
def microwave(v):
    col, trim = C.white, C.charcoal
    W, D, H = 0.5, 0.4, 0.294
    parts = [box((W, D, H), at=(0, 0, 0.006), color=col, bevel=0.02, seg=2)]
    parts.append(box((W - 0.06, D - 0.06, 0.01), at=(0, 0, 0), color=trim, bevel=0.003, seg=1))
    zc = 0.006 + H / 2
    fy = -D / 2
    # the door: a panel with a dark window and a glint across the glass
    parts.append(box((0.35, 0.012, 0.262), at=(-0.07, fy, zc - 0.131), color=mixc(lin(col), lin(C.lightgrey), 0.35), bevel=0.006, seg=1))
    parts.append(box((0.29, 0.01, 0.2), at=(-0.078, fy - 0.003, zc - 0.1), color=trim, bevel=0.006, seg=1))
    parts.append(box((0.264, 0.01, 0.174), at=(-0.078, fy - 0.006, zc - 0.087), color=C.glassDark, bevel=0.003, seg=1))
    for dx, w in ((-0.05, 0.03), (0.0, 0.012)):
        parts.append(box((w, 0.002, 0.13), at=(-0.078 + dx, fy - 0.0115, zc - 0.065), color=mixc(lin(C.glassDark), (1, 1, 1), 0.35), bevel=0, rot=(0, 30, 0)))
    # the handle down the door's right edge
    parts.append(box((0.022, 0.026, 0.17), at=(0.087, fy - 0.014, zc - 0.085), color=C.steelDark, bevel=0.008))
    # the control strip: display, dial, start button
    parts.append(box((0.12, 0.008, 0.262), at=(0.18, fy, zc - 0.131), color=C.lightgrey, bevel=0.004, seg=1))
    parts.append(box((0.09, 0.006, 0.036), at=(0.18, fy - 0.004, 0.226), color=trim, bevel=0.003, seg=1))
    parts.append(box((0.05, 0.003, 0.012), at=(0.17, fy - 0.0075, 0.238), color=C.lime, bevel=0))
    parts.append(cyl(0.032, 0.016, at=(0.18, fy - 0.003, 0.15), color=trim, seg=12, rot=(90, 0, 0), bevel=0.005))
    parts.append(box((0.005, 0.004, 0.022), at=(0.18, fy - 0.019, 0.155), color=C.lightgrey, bevel=0))
    parts.append(box((0.06, 0.008, 0.026), at=(0.18, fy - 0.004, 0.06), color=C.steelDark, bevel=0.005, seg=1))
    # vent slots on the right side
    for i in range(4):
        parts.append(box((0.003, 0.11, 0.008), at=(W / 2, 0.06, 0.2 - i * 0.022), color=C.lightgrey, bevel=0))
    return parts


# ---------------------------------------------------------------- living room

def _poly_mesh(tris, cols, name='mesh'):
    """A mesh from triangles [(a, b, c), ...] of Vectors, one colour per triangle."""
    bm = bmesh.new()
    idx = {}

    def vert(p):
        k = (round(p.x, 6), round(p.y, 6), round(p.z, 6))
        if k not in idx:
            idx[k] = bm.verts.new(p)
        return idx[k]
    for t in tris:
        bm.faces.new([vert(p) for p in t])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = kit._from_bmesh(bm, name)
    me = o.data
    attr = me.color_attributes.new('base', 'FLOAT_COLOR', 'CORNER')
    for poly, c in zip(me.polygons, cols):
        c = c if isinstance(c, tuple) else lin(c)
        for li in poly.loop_indices:
            attr.data[li].color = (*c, 1.0)
    return kit._smooth(o, 80)


def _ring(center, pts):
    """Order points round `center` (a direction) by angle."""
    n = center.normalized()
    u = n.orthogonal().normalized()
    w = n.cross(u)
    return sorted(pts, key=lambda p: math.atan2(p.dot(w), p.dot(u)))


@model('football')
def football(v):
    # A truncated icosahedron: a black pentagon over each icosahedron vertex, a
    # white hexagon over each face; fanned, split once and pushed onto a sphere
    # so the panel edges stay crisp. The catalogue box is 0.26 x 0.227 x 0.218
    # (v1's patches stuck out); a ball can only be round, so 0.235 across.
    R = 0.1175
    ph = (1 + 5 ** 0.5) / 2
    iv = [Vector(p).normalized() for p in ((-1, ph, 0), (1, ph, 0), (-1, -ph, 0), (1, -ph, 0), (0, -1, ph), (0, 1, ph),
                                           (0, -1, -ph), (0, 1, -ph), (ph, 0, -1), (ph, 0, 1), (-ph, 0, -1), (-ph, 0, 1))]
    nb = {i: [j for j in range(12) if j != i and iv[i].dot(iv[j]) > 0.4] for i in range(12)}
    panels = []
    for i in range(12):
        panels.append((_ring(iv[i], [iv[i] + (iv[j] - iv[i]) / 3 for j in nb[i]]), C.charcoal))
    for i in range(12):
        for j in nb[i]:
            for k in nb[i]:
                if i < j < k and k in nb[j]:
                    pts = []
                    for a, b in ((i, j), (j, k), (k, i)):
                        pts += [iv[a] + (iv[b] - iv[a]) / 3, iv[a] + (iv[b] - iv[a]) * 2 / 3]
                    panels.append((_ring((iv[i] + iv[j] + iv[k]) / 3, pts), C.white))
    tris, cols = [], []
    for ring, col in panels:
        c = sum(ring, Vector()) / len(ring)
        for a, b in zip(ring, ring[1:] + ring[:1]):
            ab, bc, ca = (a + b) / 2, (b + c) / 2, (c + a) / 2
            for t in ((c, ca, bc), (ca, a, ab), (ab, b, bc), (ca, ab, bc)):
                tris.append(tuple(p.normalized() * R + Vector((0, 0, R)) for p in t))
                cols.append(col)
    return [_poly_mesh(tris, cols, 'ball')]


@model('watermelon')
def watermelon(v):
    rx, hz = 0.127, 0.108
    prof = []
    for i in range(11):
        t = -math.pi / 2 + math.pi * i / 10
        prof.append((rx * math.cos(t) if 0 < i < 10 else 0.0, hz + hz * math.sin(t)))
    pale, deep = mixc(lin(C.green), lin(C.lime), 0.3), dark(C.greenDark, 0.1)
    rind = lathe(prof, color=pale, seg=36, smooth=80)

    def stripe(p):
        a = math.atan2(p.y, p.x) + 0.09 * math.sin(p.z / hz * 7.0)
        t = 0.5 + 0.5 * math.cos(9 * a)
        return mixc(pale, deep, min(1.0, max(0.0, (t - 0.35) * 3.0)))
    kit.paint(rind, pale, stripe)
    stem = tube([(0, 0, 2 * hz - 0.004), (0.002, 0, 2 * hz + 0.008), (0.008, 0, 2 * hz + 0.014)], 0.0055,
                color=C.trunk, seg=8, taper=lambda t: 1.0 - 0.35 * t)
    spot = cyl(0.016, 0.002, at=(0, 0, 2 * hz - 0.0015), color=mixc(lin(C.green), lin(C.lemon), 0.5), seg=12, bevel=0.0008)
    return [rind, spot, stem]


@model('boombox')
def boombox(v):
    body_c, grey = C.charcoal, C.darkgrey
    W, D, H = 0.42, 0.15, 0.24
    fy = -D / 2
    parts = [box((W, D, H), at=(0, 0, 0), color=body_c, bevel=0.02, seg=2)]
    # two speakers: a grey rim, a black cone, a steel dust cap
    for s in (-1, 1):
        spk = lathe([(0.068, 0.0), (0.068, 0.006), (0.063, 0.0095), (0.056, 0.007), (0.03, 0.001),
                     (0.02, 0.002), (0.014, 0.007), (0.0, 0.0085)], color=C.black, seg=16)
        recolor(spk, lambda c, n: grey if math.hypot(c.x, c.y) > 0.056 else (C.steelDark if math.hypot(c.x, c.y) < 0.021 else None))
        parts.append(place(spk, (s * 0.124, fy + 0.001, 0.112), (90, 0, 0)))
    # the cassette deck between them, two little reels behind its window
    parts.append(box((0.104, 0.008, 0.086), at=(0, fy - 0.002, 0.06), color=C.steelDark, bevel=0.005, seg=1))
    parts.append(box((0.074, 0.006, 0.036), at=(0, fy - 0.006, 0.088), color=C.glassDark, bevel=0.003, seg=1))
    for s in (-1, 1):
        parts.append(cyl(0.008, 0.004, at=(s * 0.018, fy - 0.008, 0.106), color=C.white, seg=8, rot=(90, 0, 0), bevel=0))
    parts.append(box((0.1, 0.006, 0.018), at=(0, fy - 0.002, 0.196), color=C.lime, bevel=0.003, seg=1))
    # piano keys along the top front edge, one red for record
    for i, kc in enumerate((C.steelDark, C.steelDark, C.red, C.steelDark)):
        parts.append(box((0.022, 0.03, 0.012), at=(-0.039 + i * 0.026, -0.03, H - 0.004), color=kc, bevel=0.003, seg=1))
    # a carry handle on two posts
    hp = [(-0.165, 0, H - 0.01), (-0.165, 0, 0.33)] + arc_points(0.035, 180, 90, 4, center=(-0.13, 0, 0.33))[1:] + \
         arc_points(0.035, 90, 0, 4, center=(0.13, 0, 0.33)) + [(0.165, 0, H - 0.01)]
    parts.append(tube(hp, 0.0125, color=grey, seg=8))
    return parts


@model('potplant')
def potplant(v):
    rnd = random.Random(7 + v)
    pot_c = C.woodRed
    pot = lathe([(0.0, 0.0), (0.064, 0.0), (0.07, 0.004), (0.084, 0.098), (0.094, 0.1), (0.1, 0.105),
                 (0.101, 0.132), (0.097, 0.138), (0.088, 0.138), (0.086, 0.126), (0.0, 0.126)],
                color=pot_c, seg=24)
    recolor(pot, lambda c, n: C.brown if (c.z > 0.12 and n.z > 0.9 and math.hypot(c.x, c.y) < 0.086) else None)
    recolor(pot, lambda c, n: mixc(lin(pot_c), (1, 1, 1), 0.12) if (c.z > 0.1 and math.hypot(c.x, c.y) > 0.093) else None)
    # big upright leaves on short stems, fanned round the pot like a peace lily
    plant = []
    n = 5 + v
    leaf_c = [C.leaf, C.green, C.leafDark][v]
    for i in range(n):
        a = 2 * math.pi * i / n + rnd.uniform(-0.25, 0.25)
        tilt = math.radians(rnd.uniform(8, 22))
        L = rnd.uniform(0.09, 0.17) if i % 2 else rnd.uniform(0.04, 0.09)
        b = Vector((math.cos(a) * 0.01, math.sin(a) * 0.01, 0.12))
        d = Vector((math.sin(tilt) * math.cos(a), math.sin(tilt) * math.sin(a), math.cos(tilt)))
        tip = b + d * L
        plant.append(tube([tuple(b), tuple(b + d * (L * 0.5)), tuple(tip)], 0.005, color=C.greenDark, seg=6))
        # a broad leaf, pointed at the far end, arching over, its midrib pale
        ll, lw = rnd.uniform(0.13, 0.155), rnd.uniform(0.085, 0.1)
        lf = leaf(ll, lw, leaf_c, rib=light(leaf_c, 0.3))
        place(lf, tuple(tip - d * 0.006), (rnd.uniform(52, 74), rnd.uniform(-15, 15), math.degrees(a) - 90))
        plant.append(lf)
    w = want('potplant', v)
    fit(plant, (w[0], w[1], w[2]), base=0.12)
    return [pot] + plant


@model('wastebin', ao=0.85)
def wastebin(v):
    col = C.blue if v else C.lightgrey
    rim = light(col, 0.45) if v else lin(C.white)
    body = lathe([(0.0, 0.0), (0.104, 0.0), (0.11, 0.004), (0.113, 0.016), (0.124, 0.14), (0.135, 0.268),
                  (0.141, 0.278), (0.1415, 0.295), (0.137, 0.3), (0.132, 0.296), (0.13, 0.28),
                  (0.118, 0.14), (0.106, 0.022), (0.0, 0.018)], color=col, seg=32)
    # pleated walls: every other column pushed out a little
    deform(body, lambda p: Vector((p.x, p.y, p.z)) * 1.0 if not (0.016 < p.z < 0.27) else
           Vector((p.x * (1 + 0.028 * math.cos(16 * math.atan2(p.y, p.x))),
                   p.y * (1 + 0.028 * math.cos(16 * math.atan2(p.y, p.x))), p.z)))
    recolor(body, lambda c, n: rim if c.z > 0.274 else (dark(col, 0.22) if (n.x * c.x + n.y * c.y) < 0 and c.z > 0.02 else None))
    # a crumpled ball of paper at the bottom
    rnd = random.Random(5)
    ph = [rnd.uniform(0, 6.28) for _ in range(3)]
    paper = sphere(0.04, at=(0.025, -0.02, 0.058), color=C.paper, seg=8)
    deform(paper, lambda p: p + (p - Vector((0.025, -0.02, 0.058))) * 0.22 * math.sin(90 * p.x + ph[0]) * math.cos(80 * p.y + ph[1]))
    return [body, paper]


@model('tv')
def tv(v):
    body_c, stand_c = C.charcoal, C.darkgrey
    W, T, Hp, z0 = 1.02, 0.065, 0.6, 0.142
    parts = [box((0.34, 0.2, 0.022), at=(0, 0, 0), color=stand_c, bevel=0.008),
             box((0.09, 0.05, 0.17), at=(0, 0.012, 0.016), color=stand_c, bevel=0.01, seg=1),
             box((W, T, Hp), at=(0, 0, z0), color=body_c, bevel=0.016, seg=2),
             # the hump of the back housing
             box((0.6, 0.04, 0.34), at=(0, T / 2 + 0.01, z0 + 0.12), color=body_c, bevel=0.012, seg=1)]
    # the screen, with two glints across it, and a power light in the bezel
    parts.append(box((0.95, 0.01, 0.53), at=(0, -T / 2, z0 + 0.035), color=C.navy, bevel=0.004, seg=1))
    glint = mixc(lin(C.navy), (1, 1, 1), 0.22)
    for x, w, L in ((-0.27, 0.06, 0.4), (-0.16, 0.022, 0.34)):
        parts.append(box((w, 0.002, L), at=(x, -T / 2 - 0.0056, z0 + 0.3 - L / 2), color=glint, bevel=0, rot=(0, 35, 0)))
    parts.append(sphere(0.008, at=(0.46, -T / 2 - 0.001, z0 + 0.018), color=C.lime, seg=8, scale=(1, 0.5, 1)))
    return parts


@model('aquarium', ao=0.5)
def aquarium(v):
    rnd = random.Random(3)
    W, D = 0.9, 0.36
    frame = C.charcoal
    zt, zw, zl = 0.06, 0.45, 0.506
    water = mixc(lin(C.glass), lin(C.cyan), 0.3)
    parts = [box((W, D, zt), at=(0, 0, 0), color=frame, bevel=0.01, seg=2),
             # the corner posts hide these blocks' edges, so they go unbevelled
             box((W - 0.02, D - 0.02, zw - zt), at=(0, 0, zt), color=water, bevel=0),
             box((W - 0.02, D - 0.02, zl - zw), at=(0, 0, zw), color=light(C.glass, 0.4), bevel=0),
             box((W - 0.016, D - 0.016, 0.05), at=(0, 0, zt), color=C.sand, bevel=0),
             box((W + 0.03, D + 0.03, 0.035), at=(0, 0, zl), color=frame, bevel=0.01, seg=2)]
    for sx in (-1, 1):
        for sy in (-1, 1):
            parts.append(box((0.022, 0.022, zl - zt), at=(sx * (W / 2 - 0.011), sy * (D / 2 - 0.011), zt), color=frame, bevel=0.004, seg=1))
    # Water and glass are opaque here, so the life in the tank sits half-sunk
    # in the front and back panes: read as seen through the glass.
    fish_c = [C.orange, C.yellow, C.hotpink, C.cyan, C.red]
    fi = 0
    for fs in (-1, 1):
        yf = fs * (D / 2 - 0.01)
        for x in ((-0.34, 0.36) if fs < 0 else (-0.3, 0.2)):
            h = rnd.uniform(0.22, 0.3)
            for dx, hh, gc in ((-0.018, h, C.green), (0.018, h * 0.7, C.leafLime)):
                parts.append(sphere(0.5, at=(x + dx, yf, zt + 0.04 + hh / 2), color=gc, seg=6,
                                    scale=(0.032, 0.016, hh), rot=(0, rnd.uniform(-12, 12), 0)))
        for (x, z, d) in (((-0.18, 0.3, 1), (0.16, 0.22, -1), (0.27, 0.37, -1)) if fs < 0 else ((-0.1, 0.26, -1), (0.08, 0.35, 1))):
            c = fish_c[fi % len(fish_c)]
            fi += 1
            parts.append(sphere(0.5, at=(x, yf, z), color=c, seg=8, scale=(0.08, 0.018, 0.048)))
            parts.append(sphere(0.5, at=(x - d * 0.048, yf, z), color=c, seg=4, scale=(0.03, 0.014, 0.055)))
            parts.append(box((0.012, 0.004, 0.012), at=(x + d * 0.024, yf + fs * 0.009, z + 0.001), color=C.black, bevel=0, rot=(0, 45, 0)))
        for i, r in enumerate((0.007, 0.011)):
            parts.append(sphere(r, at=(-0.07 * fs, yf, 0.38 + i * 0.035), color=C.white, seg=4))
        parts.append(sphere(0.022, at=(-0.12 * fs, yf, zt + 0.05), color=C.grey, seg=6, scale=(1.4, 0.8, 0.8)))
    return parts


@model('toilet')
def toilet(v):
    col, lidc = C.white, C.lightgrey
    by, k = -0.06, 1.25   # the bowl's centre, and how much longer than wide it is

    def oval(o):
        return deform(o, lambda p: Vector((p.x, by + p.y * k, p.z)))
    bowl = oval(lathe([(0.0, 0.0), (0.115, 0.0), (0.118, 0.008), (0.108, 0.04), (0.098, 0.14), (0.112, 0.24),
                       (0.15, 0.32), (0.18, 0.365), (0.192, 0.39), (0.0, 0.392)], color=col, seg=24))
    seat = oval(lathe([(0.0, 0.388), (0.196, 0.388), (0.2, 0.395), (0.2, 0.404), (0.195, 0.41), (0.0, 0.41)],
                      color=col, seg=24))
    lid = oval(lathe([(0.0, 0.408), (0.19, 0.408), (0.193, 0.416), (0.184, 0.428), (0.12, 0.437), (0.0, 0.44)],
                     color=lidc, seg=24))
    parts = [bowl, seat, lid]
    # the column under the cistern, the cistern and its lid
    parts.append(box((0.22, 0.17, 0.4), at=(0, 0.215, 0), color=col, bevel=0.02, seg=1))
    parts.append(box((0.4, 0.19, 0.37), at=(0, 0.245, 0.363), color=col, bevel=0.022, seg=2))
    parts.append(box((0.422, 0.21, 0.03), at=(0, 0.245, 0.732), color=col, bevel=0.01, seg=2))
    # lid hinges and the chrome flush lever
    for s in (-1, 1):
        parts.append(cyl(0.012, 0.03, at=(s * 0.085 - 0.015, 0.165, 0.42), color=C.chrome, seg=10, rot=(0, 90, 0), bevel=0.004))
    parts.append(cyl(0.016, 0.01, at=(0.13, 0.152, 0.665), color=C.chrome, seg=12, rot=(90, 0, 0), bevel=0.003))
    parts.append(box((0.07, 0.014, 0.018), at=(0.105, 0.14, 0.656), color=C.chrome, bevel=0.005, seg=1))
    return parts


@model('washingmachine')
def washingmachine(v):
    col, trim = C.white, C.lightgrey
    W, D, H = 0.6, 0.6, 0.86
    fy = -D / 2
    parts = [box((W, D, H), color=col, bevel=0.028, seg=2),
             box((W - 0.04, 0.012, 0.13), at=(0, fy, 0.71), color=trim, bevel=0.004, seg=1),
             box((0.17, 0.012, 0.075), at=(-0.17, fy - 0.004, 0.737), color=col, bevel=0.006, seg=1),
             box((W - 0.06, 0.01, 0.06), at=(0, fy, 0.02), color=trim, bevel=0.003, seg=1)]
    # the programme dial and two buttons
    parts.append(cyl(0.038, 0.018, at=(0.19, fy - 0.004, 0.775), color=C.charcoal, seg=12, rot=(90, 0, 0), bevel=0.006))
    parts.append(box((0.007, 0.004, 0.026), at=(0.19, fy - 0.022, 0.784), color=trim, bevel=0))
    for i, bc in enumerate((C.lime, C.cyan)):
        parts.append(box((0.03, 0.008, 0.016), at=(0.05 + i * 0.045, fy - 0.006, 0.768), color=bc, bevel=0.003, seg=1))
    # the door: a grey ring round a domed window, laundry tumbling in its lower half
    door = lathe([(0.0, 0.026), (0.08, 0.024), (0.135, 0.018), (0.155, 0.013), (0.162, 0.022), (0.178, 0.028),
                  (0.192, 0.022), (0.195, 0.008), (0.19, 0.0)], color=trim, seg=28)
    socks = [C.pink, C.lemon, C.cyan, C.hotpink]

    def window(c, n):
        r = math.hypot(c.x, c.y)
        if r > 0.157:
            return None
        a = math.degrees(math.atan2(c.y, c.x))
        if r < 0.14 and c.y < -0.03:
            return socks[int((a + 180) / 30) % len(socks)]
        if 0.05 < r < 0.12 and 110 < a < 150:
            return mixc(lin(C.glassDark), (1, 1, 1), 0.4)
        return C.glassDark
    recolor(door, window)
    parts.append(place(door, (0, fy, 0.43), (90, 0, 0)))
    return parts


@model('fridge')
def fridge(v):
    col = C.white
    W, D, H = 0.68, 0.64, 1.7
    fy = -D / 2
    door_c = mixc(lin(col), lin(C.lightgrey), 0.15)
    df = fy - 0.027    # the doors' front face
    parts = [box((W, D, H), color=col, bevel=0.03, seg=2),
             # freezer door on top, fridge door below, a seam between them
             box((W - 0.012, 0.03, 0.5), at=(0, fy - 0.012, 1.188), color=door_c, bevel=0.012, seg=2),
             box((W - 0.012, 0.03, 1.07), at=(0, fy - 0.012, 0.088), color=door_c, bevel=0.012, seg=2),
             box((W - 0.06, 0.01, 0.06), at=(0, fy - 0.002, 0.016), color=C.charcoal, bevel=0.003, seg=1)]
    for z0, z1 in ((1.22, 1.44), (0.8, 1.13)):
        parts.append(tube([(0.27, df + 0.01, z0), (0.27, df - 0.024, z0 + 0.03), (0.27, df - 0.024, z1 - 0.03),
                           (0.27, df + 0.01, z1)], 0.013, color=C.steelDark, seg=8))
    # a little display on the freezer door
    parts.append(box((0.12, 0.008, 0.15), at=(-0.15, df, 1.36), color=C.charcoal, bevel=0.006, seg=1))
    parts.append(box((0.05, 0.004, 0.014), at=(-0.15, df - 0.006, 1.45), color=C.lime, bevel=0))
    # magnets, and a note held up by one
    parts.append(box((0.15, 0.003, 0.18), at=(-0.08, df - 0.0015, 0.76), color=C.lemon, bevel=0, rot=(0, 5, 0)))
    for x, z, mc, s in ((-0.085, 0.93, C.red, (0.055, 0.022, 0.055)), (-0.21, 1.03, C.blue, (0.065, 0.022, 0.065)),
                        (0.1, 0.97, C.orange, (0.06, 0.022, 0.06)), (0.08, 0.62, C.lime, (0.05, 0.022, 0.05))):
        parts.append(sphere(0.5, at=(x, df - 0.003, z), color=mc, seg=10, scale=s))
    return parts


# ---------------------------------------------------------------- garden

@model('flower')
def flower(v):
    col = [C.hotpink, C.yellow, C.white, C.violet, C.orange][v]
    eye = C.orange if v == 1 else C.yellow
    w = want('flower', v)
    h = w[2] - 0.03
    parts = [tube([(0, 0, 0), (0.004, 0.002, h * 0.35), (0.0, -0.004, h * 0.7), (0.0, -0.01, h)], 0.0065,
                  color=C.greenDark, seg=6)]
    # two leaves on the stem, one each side
    for s, z, L in ((1, 0.3, 0.055), (-1, 0.5, 0.045)):
        lf = leaf(L, L * 0.45, C.green, rib=light(C.green, 0.3), thick=0.006, curl=0.012, seg=10)
        parts.append(place(lf, (0.002 * s, 0, h * z), (35, 0, -90 * s)))
    # the head: six fat petals round a domed eye, tipped a little to the front
    head = []
    for i in range(6):
        a = 360 * i / 6 + 15
        pt = sphere(0.5, color=col, seg=8, scale=(0.05, 0.06, 0.013))
        deform(pt, lambda p: Vector((p.x * (1 - 0.35 * max(0.0, -p.y / 0.029)), p.y + 0.035, p.z + 0.1 * p.y * p.y / 0.029)))
        recolor(pt, lambda c, n: mixc(lin(col), (1, 1, 1), 0.35) if c.y > 0.058 else None)
        head.append(place(pt, (0, 0, 0), (12, 0, a)))
    head.append(sphere(0.025, at=(0, 0, 0.004), color=eye, seg=10, scale=(1, 1, 0.65)))
    for o in head:
        place(o, (0, -0.01, h + 0.006), (20, 0, 0))
    parts += head
    return fit(parts, w)


@model('rock_small')
def rock_small(v):
    rnd = random.Random(11 + v)
    w = want('rock_small', v)
    ph = [rnd.uniform(0, 6.28) for _ in range(3)]

    def lumpy(o, k):
        deform(o, lambda p: p * (1 + k * (math.sin(18 * p.x + ph[0]) * 0.5 + math.sin(16 * p.y + ph[1]) * 0.35
                                          + math.sin(22 * p.z + ph[2]) * 0.3)))
        return o
    base = lin(C.grey)
    main = lumpy(sphere(0.5, color=base, seg=16, scale=(1, 0.62, 0.9), rot=(90, 0, 0)), 0.05)
    deform(main, lambda p: Vector((p.x, p.y, max(p.z, -0.2) + 0.2)))
    # lighter where the sky sees it, and moss on the crown of one of them
    moss = lin(C.leaf)

    def clamp(t):
        return max(0.0, min(1.0, t))

    def tone(p):
        c = mixc(base, (1, 1, 1), 0.08 * clamp((p.z - 0.15) / 0.3))
        return mixc(c, moss, clamp((p.z - 0.4) / 0.05)) if v == 1 else c
    kit.paint(main, base, tone)
    side = lumpy(sphere(0.25, at=(0.27, -0.2, 0.08), color=C.lightgrey, seg=10, scale=(1.1, 0.75, 1), rot=(90, 0, 0)), 0.08)
    deform(side, lambda p: Vector((p.x, p.y, max(p.z, 0.0))))
    return fit([main, side], w)


@model('grasstuft')
def grasstuft(v):
    rnd = random.Random(21 + v)
    parts = []
    n = 11
    for i in range(n):
        h = rnd.uniform(0.6, 1.0)
        r = rnd.uniform(0.07, 0.1)
        col = C.grass if i % 2 else C.grassDark
        bl = lathe([(r, 0.0), (r * 0.85, h * 0.35), (r * 0.55, h * 0.7), (0.004, h)], color=col, seg=5, smooth=60)
        recolor(bl, lambda c, nn, h=h, col=col: light(col, 0.3) if c.z > h * 0.7 else None)
        a = 2 * math.pi * i / n + rnd.uniform(-0.3, 0.3)
        lean = rnd.uniform(0.15, 0.5)
        deform(bl, lambda p, lean=lean: Vector((p.x * 0.35, p.y + lean * p.z * p.z, p.z)))
        d = rnd.uniform(0.0, 0.18)
        parts.append(place(bl, (math.cos(a) * d, math.sin(a) * d, 0), (0, 0, math.degrees(a) - 90)))
    return fit(parts, want('grasstuft', v))


def _blobs(rnd, R, z0, n, col, seg=12, top=0.0):
    """A cloud of leafy blobs: one big core, `n` round it and one on top, all
    flattened below `top`."""
    base = lin(col)
    out = [sphere(R, at=(0, 0, z0), color=base, seg=seg)]
    for i in range(n):
        a = 2 * math.pi * i / n + rnd.uniform(-0.3, 0.3)
        r = R * rnd.uniform(0.6, 0.75)
        d = R * rnd.uniform(0.5, 0.62)
        z = z0 + R * rnd.uniform(-0.2, 0.3)
        shade = mixc(base, (1, 1, 1), 0.05) if z > z0 else mixc(base, lin(C.leafDark), 0.3)
        out.append(sphere(r, at=(math.cos(a) * d, math.sin(a) * d, z), color=shade, seg=seg))
    out.append(sphere(R * 0.62, at=(0, 0, z0 + R * 0.55), color=mixc(base, (1, 1, 1), 0.08), seg=seg))
    for o in out:
        deform(o, lambda p: Vector((p.x, p.y, max(p.z, top))))
    return out


@model('bush')
def bush(v):
    rnd = random.Random(31 + v)
    col = [C.leaf, C.leafDark, C.leafLime][v]
    dots = [C.white, C.red, C.yellow][v]
    parts = _blobs(rnd, 0.42, 0.36, 6, col)
    # a sprinkle of blossom or berries, each sat on the outward face of a blob
    for i in range(10):
        o = parts[1 + i % 7]
        lo, hi = bounds([o])
        c = Vector(((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2))
        r = (hi[0] - lo[0]) / 2
        out = Vector((c.x, c.y, 0)).normalized() if c.length_squared > 1e-6 else Vector((1, 0, 0))
        a = rnd.uniform(-0.8, 0.8)
        dirn = (out * math.cos(a) + out.cross(Vector((0, 0, 1))) * math.sin(a)) * rnd.uniform(0.4, 0.8) + Vector((0, 0, rnd.uniform(0.3, 0.9)))
        parts.append(sphere(0.036, at=tuple(c + dirn.normalized() * r * 0.98), color=dots, seg=4))
    return fit(parts, want('bush', v))


@model('sapling')
def sapling(v):
    rnd = random.Random(41)
    parts = [lathe([(0.0, 0.0), (0.16, 0.0), (0.12, 0.03), (0.05, 0.05), (0.0, 0.055)], color=C.brown, seg=14)]
    parts.append(cyl(0.06, 1.15, at=(0, 0, 0.02), r2=0.032, color=C.trunk, seg=8, bevel=0.01))
    for s in (-1, 1):
        parts.append(tube([(0, 0, 0.8 + 0.1 * s), (s * 0.12, 0.02, 1.0 + 0.1 * s), (s * 0.2, 0.04, 1.12 + 0.08 * s)],
                          0.018, color=C.trunk, seg=6, taper=lambda t: 1 - 0.4 * t))
    # a stake to hold it straight, tied on with a band
    parts.append(box((0.035, 0.035, 0.9), at=(0.06, -0.05, 0.0), color=C.woodPale, bevel=0.006, seg=1))
    parts.append(torus(0.058, 0.01, at=(0.03, -0.025, 0.7), color=C.red, seg=8, rseg=5, rot=(0, 0, -40)))
    parts += _blobs(rnd, 0.42, 1.27, 5, C.leafLime, seg=12, top=0.95)
    return fit(parts, want('sapling', 0))
