"""House-stage props, modelled: gadgets, desk things, clothes, and the AI shelf.

Frame reminder (see kit.py): Blender Z is up, X is the prop's width, and the
game's FRONT (+Z) is Blender -Y. Sizes are real metres, matched to
out/specs.json — the procedural box each archetype already occupies.
"""
import math
import bmesh
from kit import (box, cyl, sphere, torus, lathe, extrude, tube, arc_points,
                 subdivide, deform, recolor, lin, mixc, paint, C, SETS)
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


# ---------------------------------------------------------------- helpers

def rrect(w, d, r, n=4, cx=0.0, cy=0.0):
    """A rounded-rectangle outline (counter-clockwise), for `extrude`."""
    r = min(r, w / 2 - 1e-5, d / 2 - 1e-5)
    pts = []
    for qx, qy, a0 in ((1, 1, 0), (-1, 1, 90), (-1, -1, 180), (1, -1, 270)):
        ox, oy = cx + qx * (w / 2 - r), cy + qy * (d / 2 - r)
        for i in range(n + 1):
            a = math.radians(a0 + 90 * i / n)
            pts.append((ox + r * math.cos(a), oy + r * math.sin(a)))
    return pts


def prism(poly, h, at=(0, 0, 0), color=0xcccccc, bevel=0.0, seg=1, rot=(0, 0, 0), smooth=30):
    """`extrude` with a choice of bevel segments: one segment rounds a rim at
    half the cost, and none at all is right for a colour block a millimetre thick."""
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


def slab(w, d, h, r, at=(0, 0, 0), color=0xcccccc, bevel=None, n=4, seg=1, rot=(0, 0, 0)):
    """A rounded-corner slab: plan corners of radius r, edges bevelled."""
    return prism(rrect(w, d, r, n), h, at=at, color=color,
                 bevel=(min(h * 0.3, r * 0.8) if bevel is None else bevel), seg=seg, rot=rot)


def chip(w, d, r, at=(0, 0, 0), color=0xcccccc, h=0.0005, n=2, rot=(0, 0, 0)):
    """A flat colour block — a label, a tile, a key legend. No bevel: at a
    millimetre thick one is invisible and costs ten times the triangles."""
    return prism(rrect(w, d, r, n) if r > 0 else [(-w / 2, -d / 2), (w / 2, -d / 2), (w / 2, d / 2), (-w / 2, d / 2)],
                 h, at=at, color=color, rot=rot)


def disc(r, h, at=(0, 0, 0), color=0xcccccc, seg=24, rot=(0, 0, 0)):
    """A flat round face that bakes evenly: a ring of interior vertices and a
    centre one, so AO is not smeared in from the rim (an n-gon cap has only
    rim vertices, and a dial inside a bezel would come out grey)."""
    return lathe([(0.0, 0.0), (r, 0.0), (r, h), (r * 0.62, h), (0.0, h)], at=at, color=color, seg=seg, rot=rot, smooth=30)


def dot(r, at=(0, 0, 0), color=0xcccccc, h=0.0005, seg=8, rot=(0, 0, 0)):
    """A flat round colour block: a hole, a screw head, an LED."""
    return cyl(r, h, at=at, color=color, seg=seg, bevel=0, rot=rot)


def sellipse(w, d, n=16, e=2.0, cx=0.0, cy=0.0):
    """A superellipse outline: e=2 an ellipse, e=4 a soft squircle."""
    pts = []
    for j in range(n):
        a = 2 * math.pi * j / n
        ca, sa = math.cos(a), math.sin(a)
        pts.append((cx + w / 2 * math.copysign(abs(ca) ** (2 / e), ca),
                    cy + d / 2 * math.copysign(abs(sa) ** (2 / e), sa)))
    return pts


def loft(stations, axis='x', n=16, color=0xcccccc, exp=2.0, smooth=60):
    """Skin superellipse cross-sections along an axis — handles, soles, bodies.

    Each station is (t, w, h, up[, side[, e]]): position along the axis, the
    section's width (across) and height (Z), its centre height, a sideways
    offset, and its squareness. A zero width or height makes a pole, which is
    how ends get rounded closed."""
    bm = bmesh.new()
    rings = []
    for st in stations:
        t, w, h, up = st[:4]
        side = st[4] if len(st) > 4 else 0.0
        e = st[5] if len(st) > 5 else exp
        if w <= 1e-7 or h <= 1e-7:
            p = (t, side, up) if axis == 'x' else (side, t, up)
            rings.append([bm.verts.new(p)])
            continue
        ring = []
        for j in range(n):
            a = 2 * math.pi * j / n
            ca, sa = math.cos(a), math.sin(a)
            u = side + w / 2 * math.copysign(abs(ca) ** (2 / e), ca)
            v = up + h / 2 * math.copysign(abs(sa) ** (2 / e), sa)
            ring.append(bm.verts.new((t, u, v) if axis == 'x' else (u, t, v)))
        rings.append(ring)
    for a, b in zip(rings, rings[1:]):
        if len(a) == 1 and len(b) == 1:
            continue
        if len(a) == 1:
            for j in range(n):
                bm.faces.new((a[0], b[j], b[(j + 1) % n]))
        elif len(b) == 1:
            for j in range(n):
                bm.faces.new((a[j], a[(j + 1) % n], b[0]))
        else:
            for j in range(n):
                bm.faces.new((a[j], a[(j + 1) % n], b[(j + 1) % n], b[j]))
    if len(rings[0]) > 1:
        bm.faces.new(list(reversed(rings[0])))
    if len(rings[-1]) > 1:
        bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = _from_bmesh(bm, 'loft')
    paint(o, color)
    return _smooth(o, smooth)


def dk(col, t=0.2):
    """A darker shade of a palette colour, as linear rgb."""
    return mixc(lin(col), (0, 0, 0), t)


def lt(col, t=0.4):
    """A lighter tint of a palette colour, as linear rgb."""
    return mixc(lin(col), (1, 1, 1), t)


# ---------------------------------------------------------------- bathroom

@model('toothbrush')
def toothbrush(v):
    col = [C.cyan, C.hotpink, C.lime][v]
    # one skinned handle from a rounded butt, through the grip and the neck,
    # out to the head; the head sits a touch lower than the grip
    handle = loft([
        (-0.0838, 0.0, 0.0, 0.0038),
        (-0.0832, 0.0090, 0.0050, 0.0038),
        (-0.0812, 0.0138, 0.0072, 0.0038),
        (-0.0760, 0.0158, 0.0078, 0.0039),
        (-0.0560, 0.0162, 0.0080, 0.0040),
        (-0.0320, 0.0146, 0.0074, 0.0037),
        (-0.0080, 0.0112, 0.0064, 0.0033),
        (0.0160, 0.0078, 0.0054, 0.0029),
        (0.0340, 0.0072, 0.0050, 0.0027),
        (0.0430, 0.0104, 0.0050, 0.0026),
        (0.0500, 0.0128, 0.0052, 0.0026),
        (0.0760, 0.0130, 0.0052, 0.0026),
        (0.0812, 0.0110, 0.0050, 0.0026),
        (0.0834, 0.0060, 0.0036, 0.0026),
        (0.0838, 0.0, 0.0, 0.0026),
    ], axis='x', n=12, color=col, exp=2.6)
    # a soft rubber thumb pad on the grip
    pad = sphere(1.0, at=(-0.052, 0, 0.0074), color=C.white, seg=12, scale=(0.017, 0.0058, 0.0016))
    ridge = sphere(1.0, at=(-0.016, 0, 0.0062), color=C.white, seg=8, scale=(0.008, 0.0035, 0.0012))
    parts = [handle, pad, ridge]
    # bristle tufts: four rows, white and a pale tint of the handle colour
    pale = lt(col, 0.55)
    for i in range(4):
        x = 0.0512 + i * 0.0075
        parts.append(box((0.0066, 0.0108, 0.0092), at=(x + 0.0033, 0, 0.0050),
                         color=(C.white if i % 2 == 0 else pale), bevel=0.0016, seg=1))
    return parts


@model('soap', ao=0.55)
def soap(v):
    # a pillowy bar: soft squircle in plan, domed top
    W, D, H = 0.088, 0.058, 0.0286
    bar = loft([(-W / 2, 0, 0, H * 0.46),
                (-W / 2 + 0.0015, D * 0.55, H * 0.55, H * 0.47),
                (-W / 2 + 0.0055, D * 0.86, H * 0.84, H * 0.47),
                (-W / 2 + 0.013, D * 0.98, H * 0.96, H * 0.48),
                (-W / 4, D, H, H * 0.5),
                (W / 4, D, H, H * 0.5),
                (W / 2 - 0.013, D * 0.98, H * 0.96, H * 0.48),
                (W / 2 - 0.0055, D * 0.86, H * 0.84, H * 0.47),
                (W / 2 - 0.0015, D * 0.55, H * 0.55, H * 0.47),
                (W / 2, 0, 0, H * 0.46)], axis='x', n=20, color=C.lemon, exp=3.2)
    # flat underside so it sits
    deform(bar, lambda p: p.__class__((p.x, p.y, max(p.z, 0.0008) if p.z < H * 0.15 else p.z)))
    # a pressed oval in the top, and three bubbles
    inset = sphere(1.0, at=(0, 0, H - 0.0012), color=lt(C.lemon, 0.35), seg=16, scale=(0.026, 0.016, 0.0016))
    parts = [bar, inset]
    for (x, y, r) in ((0.03, -0.018, 0.0042), (0.037, -0.009, 0.0028), (-0.032, 0.017, 0.0034)):
        parts.append(sphere(r, at=(x, y, H * 0.9 + r * 0.25), color=C.white, seg=8, scale=(1, 1, 0.7)))
    return parts


# ---------------------------------------------------------------- clothing

@model('glasses', ao=0.5)
def glasses(v):
    frame = C.charcoal
    r = 0.0024
    parts = []
    for s in (-1, 1):
        cx = s * 0.0265
        # lens rims: a soft rectangle, wider at the brow (+Y, where the arms go)
        pts = []
        for j in range(16):
            a = 2 * math.pi * j / 16
            ca, sa = math.cos(a), math.sin(a)
            hw = 0.0212 + 0.0016 * sa
            pts.append((cx + hw * math.copysign(abs(ca) ** 0.62, ca),
                        0.0005 + 0.0168 * math.copysign(abs(sa) ** 0.7, sa), r))
        parts.append(tube(pts, r, color=frame, seg=8, closed=True))
        parts.append(prism([(p[0], p[1]) for p in pts], 0.0012, at=(0, 0, r - 0.0006), color=lt(C.glass, 0.35)))
        # a glint on each lens
        parts.append(chip(0.0075, 0.0022, 0.001, at=(cx - s * 0.0075, -0.0065, r + 0.0005), color=C.white,
                          h=0.0003, n=1, rot=(0, 0, -30 * s)))
        # hinge block and the arm, which kinks in a touch at the ear
        hx = s * 0.0490
        parts.append(box((0.0046, 0.0062, 0.0042), at=(hx, 0.0118, r - 0.0021), color=frame, bevel=0.0012, seg=1))
        parts.append(tube([(hx, 0.014, r), (hx + s * 0.0005, 0.050, r),
                           (hx - s * 0.002, 0.0645, r), (hx - s * 0.0052, 0.0668, r)],
                          0.0019, color=frame, seg=8))
        # nose pads
        parts.append(sphere(0.0022, at=(s * 0.0072, -0.003, r), color=lt(C.glass, 0.6), seg=6, scale=(1, 1.4, 0.7)))
    # the bridge arcs up between the lenses
    parts.append(tube(arc_points(0.0058, 25, 155, 6, center=(0, 0.0055, r), plane='XY'), 0.0019, color=frame, seg=8))
    return parts


@model('wristwatch')
def wristwatch(v):
    strap_col = C.woodDark
    steel = C.steel
    # the strap: one band under the case, curling up a little at each end
    def curl(y):
        a = max(0.0, abs(y) - 0.022)
        return 0.0017 + 1.6 * a * a
    st = []
    for y in (-0.0618, -0.0612, -0.060, -0.048, -0.036, -0.024, 0.0, 0.024, 0.036, 0.048, 0.060, 0.0612, 0.0618):
        w = 0.0172 - 0.0028 * max(0.0, (abs(y) - 0.02) / 0.04)
        if abs(y) > 0.0615:
            st.append((y, 0.0, 0.0, curl(y)))
        elif abs(y) > 0.061:
            st.append((y, w * 0.6, 0.0022, curl(y)))
        else:
            st.append((y, w, 0.0034, curl(y)))
    strap = loft(st, axis='y', n=12, color=strap_col, exp=4.0)
    parts = [strap]
    # holes on one side, the buckle on the other
    for i in range(3):
        y = -0.034 - i * 0.0075
        parts.append(dot(0.0012, at=(0, y, curl(y) + 0.0013), color=C.black, h=0.0006, seg=6))
    yb = 0.047
    parts.append(tube([(-0.0088, yb - 0.004, 0), (0.0088, yb - 0.004, 0), (0.0088, yb + 0.004, 0), (-0.0088, yb + 0.004, 0)],
                      0.0011, color=steel, seg=4, closed=True))
    deform(parts[-1], lambda p: p.__class__((p.x, p.y, p.z + curl(p.y) + 0.0019)))
    parts.append(box((0.0011, 0.0072, 0.0012), at=(0, yb + 0.0005, curl(yb) + 0.0016), color=steel, bevel=0))
    # the case: a turned body, a bezel, a white dial, two hands and a crown
    case = lathe([(0.0, 0.0018), (0.0150, 0.0018), (0.0166, 0.0032), (0.0172, 0.0080), (0.0170, 0.0122),
                  (0.0164, 0.0150), (0.0156, 0.0164), (0.0138, 0.0165), (0.0136, 0.0140), (0.0, 0.0140)],
                 color=steel, seg=24)
    dial = disc(0.0137, 0.0010, at=(0, 0, 0.0137), color=C.white, seg=24)
    parts += [case, dial]
    # lugs where the strap meets the case
    for s in (-1, 1):
        parts.append(box((0.0168, 0.006, 0.0050), at=(0, s * 0.0158, 0.0030), color=steel, bevel=0.0014, seg=1))
    for k in range(12):
        a = 2 * math.pi * k / 12
        big = k % 3 == 0
        parts.append(box((0.0012, 0.0030 if big else 0.0016, 0.0005),
                         at=(0.0112 * math.sin(a), 0.0112 * math.cos(a), 0.0146),
                         color=C.charcoal if big else C.grey, bevel=0, rot=(0, 0, -math.degrees(a))))
    # 10:10, the hour the watch shops set
    for ang, ln, wd in ((60, 0.0072, 0.0017), (-60, 0.0102, 0.0012)):
        a = math.radians(ang)
        off = ln * 0.42
        parts.append(box((wd, ln, 0.0006), at=(-math.sin(a) * off, math.cos(a) * off, 0.0148),
                         color=C.charcoal, bevel=0, rot=(0, 0, ang)))
    parts.append(dot(0.0016, at=(0, 0, 0.0149), color=C.red, h=0.0008, seg=8))
    parts.append(cyl(0.0024, 0.0036, at=(0.0168, 0, 0.0085), color=steel, seg=10, bevel=0.0005, rot=(0, 90, 0)))
    return parts


# ---------------------------------------------------------------- gadgets

@model('phone')
def phone(v):
    scr = [C.blue, C.teal, C.hotpink][v]
    W, D, H = 0.0716, 0.1476, 0.0094
    body = slab(W, D, H, 0.0105, color=C.charcoal, bevel=0.0026, n=4, seg=2)
    # a lighter metal band round the edge
    recolor(body, lambda c, n: lin(C.darkgrey) if abs(n.z) < 0.55 else None)
    glass = chip(W - 0.0062, D - 0.0062, 0.0078, at=(0, 0, H - 0.0001), color=C.black, h=0.0006, n=3)
    screen = chip(W - 0.0092, D - 0.0122, 0.0062, at=(0, -0.0006, H + 0.0002), color=scr, h=0.0006, n=3)
    # the wallpaper glows lighter toward the top of the screen (+Y)
    paint(screen, scr, lambda p: mixc(lin(scr), (1, 1, 1), 0.08 + 0.32 * max(0.0, min(1.0, (p.y + 0.06) / 0.13))))
    parts = [body, glass, screen]
    # a few app tiles, a dock, a camera pill and a home bar
    tile = lt(scr, 0.7)
    for i in range(3):
        for j in range(3):
            parts.append(chip(0.0118, 0.0118, 0.0035, at=(-0.0185 + i * 0.0185, 0.042 - j * 0.0205, H + 0.0007),
                              color=(tile if (i + j) % 3 else C.white), n=1))
    parts.append(chip(W - 0.0182, 0.017, 0.0055, at=(0, -0.047, H + 0.0007), color=lt(scr, 0.4), h=0.0004, n=2))
    for i in range(3):
        parts.append(chip(0.0105, 0.0105, 0.0032, at=(-0.0165 + i * 0.0165, -0.047, H + 0.0010), color=C.white, n=1))
    parts.append(chip(0.0125, 0.0042, 0.0021, at=(0, 0.0655, H + 0.0007), color=C.black, h=0.0004, n=2))
    parts.append(chip(0.022, 0.0016, 0.0008, at=(0, -0.0625, H + 0.0007), color=C.white, h=0.0004, n=1))
    # side buttons
    parts.append(box((0.0016, 0.016, 0.0028), at=(W / 2 - 0.0002, 0.03, H * 0.38), color=C.grey, bevel=0.0006, seg=1))
    parts.append(box((0.0016, 0.010, 0.0028), at=(-W / 2 + 0.0002, 0.04, H * 0.38), color=C.grey, bevel=0.0006, seg=1))
    return parts


@model('card_deck')
def card_deck(v):
    W, D = 0.0585, 0.0838
    parts = []
    # the stack, in four loose groups so the edges read as cards, not a block
    jit = ((0.0006, -0.0004, 0.8), (-0.0005, 0.0006, -1.2), (0.0004, 0.0003, 1.5), (-0.0003, -0.0005, -0.6))
    for i, (dx, dy, rz) in enumerate(jit):
        parts.append(box((W, D, 0.0046), at=(dx, dy, i * 0.0046), color=(C.white if i % 2 else C.paper),
                         bevel=0.0012, seg=1, rot=(0, 0, rz)))
    # the top card, a little askew, red back with a white frame and a diamond
    z = 4 * 0.0046
    top = [box((W, D, 0.0016), at=(0, 0, z), color=C.red, bevel=0.0006, seg=1),
           chip(W - 0.0074, D - 0.0074, 0.004, at=(0, 0, z + 0.0015), color=C.white, h=0.0004),
           chip(W - 0.0108, D - 0.0108, 0.0026, at=(0, 0, z + 0.0018), color=C.red, h=0.0004),
           chip(0.020, 0.020, 0, at=(0, 0, z + 0.0021), color=C.white, h=0.0006, rot=(0, 0, 45)),
           chip(0.011, 0.011, 0, at=(0, 0, z + 0.0025), color=C.red, h=0.0006, rot=(0, 0, 45))]
    for s in (-1, 1):
        for t in (-1, 1):
            top.append(dot(0.0024, at=(s * 0.0175, t * 0.0285, z + 0.0021), color=C.white, h=0.0006, seg=8))
    for o in top:
        deform(o, lambda p: p.__class__((p.x * math.cos(0.07) - p.y * math.sin(0.07),
                                         p.x * math.sin(0.07) + p.y * math.cos(0.07), p.z)))
    return parts + top


@model('cassette')
def cassette(v):
    shell = C.paper if v == 0 else C.charcoal
    stripe = C.orange if v == 0 else C.teal
    W, D, H = 0.1, 0.063, 0.019
    body = slab(W, D, H, 0.0045, color=shell, bevel=0.0024, n=3, seg=2)
    parts = [body]
    # the label, with a coloured band, and the window onto the tape
    parts.append(chip(0.088, 0.039, 0.003, at=(0, 0.0085, H - 0.0002), color=C.white, h=0.0006))
    parts.append(chip(0.088, 0.0075, 0.0012, at=(0, -0.0068, H + 0.0001), color=stripe, h=0.0006, n=1))
    parts.append(chip(0.054, 0.0175, 0.0075, at=(0, 0.0088, H + 0.0001), color=C.glassDark, h=0.0006, n=3))
    # tape wound on the reels, seen through the window
    parts.append(dot(0.0084, at=(-0.0205, 0.0088, H + 0.0004), color=C.brown, h=0.0004, seg=14))
    parts.append(dot(0.0060, at=(0.0205, 0.0088, H + 0.0004), color=C.brown, h=0.0004, seg=12))
    for s in (-1, 1):
        parts.append(cyl(0.0052, 0.0016, at=(s * 0.0205, 0.0088, H + 0.0004), color=C.white, seg=12, bevel=0.0005))
        parts.append(dot(0.0024, at=(s * 0.0205, 0.0088, H + 0.0016), color=C.charcoal, h=0.0006, seg=8))
    # the trapezoid head guard along the front edge (-Y), with its holes
    trap = [(-0.031, -0.0315), (0.031, -0.0315), (0.024, -0.0175), (-0.024, -0.0175)]
    parts.append(prism(trap, 0.0014, at=(0, 0.0004, H - 0.0004), color=dk(shell, 0.12), bevel=0.0005))
    for x in (-0.017, -0.006, 0.006, 0.017):
        parts.append(dot(0.0019, at=(x, -0.0245, H + 0.0008), color=C.black, h=0.0006, seg=8))
    for x, y in ((-0.045, 0.027), (0.045, 0.027), (-0.045, -0.026), (0.045, -0.026)):
        parts.append(dot(0.0016, at=(x, y, H - 0.0001), color=C.steel, h=0.0005, seg=6))
    return parts


def wheel(r, w, at, color=C.charcoal, seg=16, axis='y'):
    """A tyre centred on `at`, its axle along Y (or X): a turned profile with
    rounded shoulders, cheaper than a bevelled cylinder."""
    b = min(r, w) * 0.28
    prof = [(0.0, -w / 2), (r - b, -w / 2), (r, -w / 2 + b), (r, w / 2 - b), (r - b, w / 2), (0.0, w / 2)]
    return lathe(prof, at=at, color=color, seg=seg, rot=((90, 0, 0) if axis == 'y' else (0, 90, 0)), smooth=50)


@model('calculator')
def calculator(v):
    W, D, H = 0.07, 0.125, 0.0135
    body = slab(W, D, H, 0.008, color=C.darkgrey, bevel=0.003, n=3, seg=2)
    # rises a little toward the display end (-Y), like a desk calculator
    deform(body, lambda p: p.__class__((p.x, p.y, p.z * (1.0 + 0.22 * max(0.0, -p.y / 0.0625)) if p.z > 0.001 else p.z)))
    top = lambda y: H * (1.0 + 0.22 * max(0.0, -y / 0.0625))
    parts = [body]
    # display: a dark bezel, the lime LCD, and a solar strip above it
    parts.append(chip(0.058, 0.032, 0.004, at=(0, -0.0405, top(-0.0405) - 0.0003), color=C.charcoal, h=0.0008))
    parts.append(chip(0.050, 0.019, 0.0015, at=(0, -0.0375, top(-0.0405) + 0.0003), color=lt(C.lime, 0.15), h=0.0005, n=1))
    for i in range(4):
        parts.append(chip(0.0085, 0.0055, 0, at=(-0.016 + i * 0.0105, -0.0515, top(-0.0405) + 0.0003),
                          color=C.brown, h=0.0004))
    # 4 x 5 keys: light numbers, orange operators down the right, a red clear
    for row in range(5):
        for col in range(4):
            y = -0.0115 + row * 0.0148
            x = -0.0225 + col * 0.015
            c = C.lightgrey
            if col == 3:
                c = C.orange
            if row == 0 and col == 0:
                c = C.red
            if row == 4 and col == 3:
                c = C.lime
            parts.append(chip(0.0115, 0.0098, 0.0022, at=(x, y, top(y) - 0.0004), color=c, h=0.0036, n=1))
    return parts


@model('scissors', ao=0.55)
def scissors(v):
    px = 0.004   # the pivot
    parts = []
    blade = [(-0.014, -0.0042), (0.0, -0.0046), (0.025, -0.0042), (0.055, -0.0024), (0.0745, 0.0006),
             (0.064, 0.0026), (0.03, 0.0044), (0.0, 0.0048), (-0.014, 0.0042)]
    for k, s in enumerate((-1, 1)):
        z = 0.0042 + k * 0.0026
        b = prism(blade, 0.0024, at=(0, 0, 0), color=C.chrome, bevel=0.0007, seg=1)
        # a darker bevelled cutting edge on the inner side
        recolor(b, lambda c, n: dk(C.chrome, 0.18) if n.z < 0.6 and c.y < 0 else None)
        a = math.radians(-s * 7.5)
        deform(b, lambda p, a=a, s=s, z=z: p.__class__((px + p.x * math.cos(a) - (p.y * -s) * math.sin(a),
                                                        p.x * math.sin(a) + (p.y * -s) * math.cos(a), p.z + z)))
        parts.append(b)
        # the handle on the opposite side: shank, then a finger loop
        cy = s * 0.0198
        zl = 0.0064 + k * 0.0018
        big = s > 0
        rx, ry = (0.0265, 0.0128) if big else (0.020, 0.0118)
        cx = -0.0812 + 0.0057 + rx
        loop = []
        for j in range(16):
            t = 2 * math.pi * j / 16
            loop.append((cx + rx * math.cos(t), cy + ry * math.sin(t), zl))
        parts.append(tube(loop, 0.0062, color=C.hotpink, seg=8, closed=True))
        parts.append(tube([(px + 0.002, s * 0.0008, zl), (-0.014, s * 0.006, zl), (cx + rx * 0.72, cy - s * ry * 0.55, zl)],
                          0.0050, color=C.hotpink, seg=8, taper=lambda t: 0.75 + 0.25 * t))
    parts.append(cyl(0.0042, 0.0072, at=(px, 0, 0.0035), color=C.steelDark, seg=12, bevel=0.0012))
    parts.append(dot(0.0018, at=(px, 0, 0.0107), color=C.steel, h=0.0004, seg=8))
    return parts


@model('toycar')
def toycar(v):
    col = SETS['plastic'][v % len(SETS['plastic'])]
    body = loft([(-0.0440, 0.0, 0.0, 0.0165),
                 (-0.0436, 0.030, 0.014, 0.0165),
                 (-0.0415, 0.0385, 0.0205, 0.0165),
                 (-0.0330, 0.0400, 0.0220, 0.0165),
                 (0.0300, 0.0400, 0.0210, 0.0160),
                 (0.0395, 0.0385, 0.0175, 0.0155),
                 (0.0434, 0.0300, 0.0120, 0.0155),
                 (0.0440, 0.0, 0.0, 0.0155)], axis='x', n=12, color=col, exp=3.2)
    cabin = loft([(-0.0300, 0.0, 0.0, 0.0330),
                  (-0.0294, 0.028, 0.016, 0.0330),
                  (-0.0265, 0.0335, 0.0225, 0.0352),
                  (-0.0190, 0.0345, 0.0250, 0.0366),
                  (0.0000, 0.0345, 0.0250, 0.0366),
                  (0.0090, 0.0335, 0.0200, 0.0340),
                  (0.0165, 0.0310, 0.0110, 0.0292),
                  (0.0185, 0.0, 0.0, 0.0280)], axis='x', n=12, color=C.glass, exp=3.0)
    # a glasshouse all round, capped by a roof in the body colour
    roof = loft([(-0.0262, 0.0, 0.0, 0.0470),
                 (-0.0256, 0.030, 0.0042, 0.0470),
                 (-0.0225, 0.0366, 0.0050, 0.0470),
                 (0.0025, 0.0366, 0.0050, 0.0470),
                 (0.0062, 0.0320, 0.0044, 0.0466),
                 (0.0072, 0.0, 0.0, 0.0464)], axis='x', n=12, color=col, exp=3.4)
    parts = [body, cabin, roof]
    # tyres with white hubs
    for sx in (-1, 1):
        for sy in (-1, 1):
            parts.append(wheel(0.0108, 0.0078, (sx * 0.0255, sy * 0.0193, 0.0108), seg=10))
            parts.append(dot(0.0050, at=(sx * 0.0255, sy * 0.0232, 0.0108), color=C.white, h=0.0006, seg=6,
                             rot=(-90 * sy, 0, 0)))
    # headlights and a grille at the front (+X), tail lights behind
    for sy in (-1, 1):
        parts.append(dot(0.0036, at=(0.0432, sy * 0.012, 0.0185), color=C.lemon, h=0.0012, seg=8, rot=(0, 90, 0)))
        parts.append(chip(0.0055, 0.0075, 0.001, at=(-0.0442, sy * 0.012, 0.0175), color=C.red, h=0.0012, n=1,
                          rot=(0, -90, 0)))
    parts.append(chip(0.0075, 0.012, 0.0015, at=(0.0436, 0, 0.0128), color=C.charcoal, h=0.0012, n=1, rot=(0, 90, 0)))
    # bumpers
    for sx in (-1, 1):
        parts.append(box((0.006, 0.036, 0.0055), at=(sx * 0.0418, 0, 0.0062), color=C.lightgrey, bevel=0.0018, seg=1))
    return parts


@model('remote')
def remote(v):
    st = []
    for y, w, h in ((-0.0925, 0.0, 0.0), (-0.0918, 0.034, 0.012), (-0.0890, 0.044, 0.019), (-0.0820, 0.0478, 0.0215),
                    (-0.0400, 0.0470, 0.0220), (0.0050, 0.0430, 0.0200), (0.0500, 0.0450, 0.0200),
                    (0.0840, 0.0450, 0.0200), (0.0900, 0.0380, 0.0160), (0.0922, 0.026, 0.009), (0.0925, 0.0, 0.0)):
        st.append((y, w, h, 0.011))
    body = loft(st, axis='y', n=12, color=C.charcoal, exp=3.4)
    # a soft-grey belly
    recolor(body, lambda c, n: lin(C.darkgrey) if c.z < 0.0055 else None)
    top = 0.0218
    parts = [body]
    # power, a round D-pad, a number grid, two rockers, four colour keys
    parts.append(chip(0.011, 0.008, 0.0035, at=(0.012, -0.079, top - 0.0012), color=C.red, h=0.0028, n=2))
    parts.append(cyl(0.0125, 0.0018, at=(0, -0.055, top - 0.0008), color=C.lightgrey, seg=16, bevel=0.0006))
    parts.append(cyl(0.0058, 0.0026, at=(0, -0.055, top - 0.0008), color=C.white, seg=10, bevel=0.0007))
    for k, cc in enumerate((C.red, C.lime, C.yellow, C.blue)):
        parts.append(chip(0.0072, 0.0045, 0.0015, at=(-0.0135 + k * 0.009, -0.0355, top - 0.0012), color=cc, h=0.0024, n=1))
    for s in (-1, 1):
        parts.append(chip(0.0085, 0.022, 0.0035, at=(s * 0.014, -0.012, top - 0.0016), color=C.grey, h=0.0034, n=2))
    for row in range(3):
        for col in range(3):
            parts.append(chip(0.0095, 0.0068, 0.0018, at=(-0.0125 + col * 0.0125, 0.012 + row * 0.0118, top - 0.0016),
                              color=C.lightgrey, h=0.0030, n=1))
    # the IR window at the nose
    parts.append(chip(0.020, 0.0035, 0.0015, at=(0, -0.0912, 0.009), color=C.redDark, h=0.0012, n=1, rot=(90, 0, 0)))
    return parts


@model('lightbulb')
def lightbulb(v):
    prof = [(0.0, 0.0), (0.0042, 0.0), (0.0064, 0.0020), (0.0070, 0.0042), (0.0112, 0.0048)]
    # three chunky screw threads
    for i in range(3):
        z = 0.0060 + i * 0.0062
        prof += [(0.0128, z + 0.0016), (0.0128, z + 0.0030), (0.0114, z + 0.0050)]
    prof += [(0.0128, 0.0262), (0.0118, 0.0276), (0.0140, 0.0310),
             (0.0200, 0.0420), (0.0258, 0.0530), (0.0277, 0.0630),
             (0.0262, 0.0730), (0.0205, 0.0810), (0.0110, 0.0853), (0.0, 0.0861)]
    bulb = lathe(prof, color=C.lemon, seg=20)
    lem, glow = lin(C.lemon), lin(0xfff6d8)
    paint(bulb, C.lemon, lambda p: mixc(lem, glow, max(0.0, min(1.0, (p.z - 0.03) / 0.05)) * 0.65))
    recolor(bulb, lambda c, n: lin(C.charcoal) if c.z < 0.0045 else (lin(C.steel) if c.z < 0.0279 else None))
    # a soft highlight on the glass
    glint = sphere(1.0, at=(-0.0128, -0.0208, 0.064), color=C.white, seg=8, scale=(0.0042, 0.0016, 0.0085), rot=(0, 0, -32))
    return [bulb, glint]


@model('mouse_pc')
def mouse_pc(v):
    prof = ((-0.0550, 0.000, 0.000), (-0.0544, 0.034, 0.014), (-0.0500, 0.046, 0.019), (-0.0420, 0.053, 0.025),
            (-0.0280, 0.057, 0.031), (-0.0080, 0.060, 0.037), (0.0120, 0.0618, 0.0400), (0.0300, 0.0608, 0.0380),
            (0.0440, 0.0545, 0.0310), (0.0520, 0.0420, 0.0220), (0.0548, 0.026, 0.012), (0.0550, 0.000, 0.000))
    st = []
    for y, w, t in prof:
        st.append((y, w, t * 1.3 if t else 0.0, t * 0.35 if t else 0.006))
    body = loft(st, axis='y', n=20, color=C.lightgrey, exp=2.4)
    deform(body, lambda p: p.__class__((p.x, p.y, max(p.z, 0.0))))
    # a grey skirt round the base
    recolor(body, lambda c, n: lin(C.grey) if c.z < 0.0075 else None)
    parts = [body]
    # the button split and the scroll wheel, at the front (-Y)
    parts.append(box((0.0012, 0.040, 0.004), at=(0, -0.034, 0.0), color=C.charcoal, bevel=0, rot=(0, 0, 0)))
    deform(parts[-1], lambda p: p.__class__((p.x, p.y, p.z + 0.0168 + 0.42 * (p.y + 0.054) - 3.4 * (p.y + 0.054) ** 2)))
    parts.append(chip(0.011, 0.020, 0.004, at=(0, -0.026, 0.026), color=C.darkgrey, h=0.0024, n=2, rot=(-14, 0, 0)))
    parts.append(wheel(0.0058, 0.0052, (0, -0.026, 0.0318), color=C.charcoal, seg=14, axis='x'))
    return parts


@model('wallet')
def wallet(v):
    col = C.charcoal if v == 0 else C.woodDark
    W, D, H = 0.104, 0.088, 0.021
    # a soft leather pillow, shifted left so the banknotes can peek out on the right
    ox = -0.0045
    body = slab(W, D, H, 0.010, at=(ox, 0, 0), color=col, bevel=0.0065, n=4, seg=2)
    deform(body, lambda p: p.__class__((p.x, p.y, p.z + 0.0018 * (1 - ((p.x - ox) / 0.052) ** 2) * (1 - (p.y / 0.044) ** 2)
                                        if p.z > H * 0.5 else p.z)))
    parts = [body]
    # the stitched panel, as a slightly lighter inset
    parts.append(chip(W - 0.014, D - 0.014, 0.006, at=(ox, 0, H + 0.0006), color=mixc(lin(col), (1, 1, 1), 0.12), h=0.0005))
    parts.append(chip(W - 0.018, D - 0.018, 0.0045, at=(ox, 0, H + 0.0009), color=col, h=0.0005))
    # banknotes peeking out of the open edge
    for k, (dy, ang) in enumerate(((0.004, 3.0), (-0.006, -2.5))):
        x = ox + W / 2 - 0.022 + k * 0.002
        parts.append(chip(0.054, 0.072, 0.0015, at=(x, dy, 0.0080 + k * 0.0016), color=C.lime, h=0.0012, n=1, rot=(0, 0, ang)))
        parts.append(chip(0.006, 0.018, 0.002, at=(x + 0.021, dy, 0.0093 + k * 0.0016), color=lt(C.lime, 0.5),
                          h=0.0004, n=1, rot=(0, 0, ang)))
    # the snap strap over the front edge
    strap = loft([(-0.0485, 0.024, 0.0026, 0.0082), (-0.0455, 0.026, 0.0028, 0.0145), (-0.041, 0.026, 0.0028, 0.0225),
                  (-0.035, 0.026, 0.0028, 0.0248), (-0.013, 0.026, 0.0028, 0.0250), (-0.007, 0.022, 0.0028, 0.0250),
                  (-0.004, 0.0, 0.0, 0.0250)], axis='y', n=12, color=C.brown, exp=4.0)
    deform(strap, lambda p: p.__class__((p.x + 0.012, p.y, p.z)))
    parts.append(strap)
    parts.append(cyl(0.0052, 0.0016, at=(0.012, -0.018, 0.0258), color=C.steel, seg=14, bevel=0.0005))
    return parts


@model('stapler')
def stapler(v):
    col = C.red if v else C.charcoal
    base_col = C.darkgrey
    parts = [slab(0.034, 0.150, 0.0085, 0.012, color=base_col, bevel=0.0028, n=4, seg=2)]
    # the steel anvil under the nose
    parts.append(chip(0.014, 0.020, 0.003, at=(0, -0.061, 0.0083), color=C.steel, h=0.0007, n=1))
    # rear hinge block
    parts.append(box((0.028, 0.026, 0.032), at=(0, 0.056, 0.006), color=base_col, bevel=0.005, seg=2))
    # the magazine channel, leaving a clear gap above the base at the front
    parts.append(box((0.026, 0.118, 0.010), at=(0, -0.008, 0.0195), color=C.steel, bevel=0.002, seg=1))
    arm = loft([(-0.0745, 0.0, 0.0, 0.0350),
                (-0.0738, 0.024, 0.012, 0.0350),
                (-0.0710, 0.0320, 0.0190, 0.0358),
                (-0.0640, 0.0350, 0.0215, 0.0368),
                (-0.0300, 0.0350, 0.0215, 0.0392),
                (0.0100, 0.0350, 0.0220, 0.0428),
                (0.0400, 0.0350, 0.0220, 0.0458),
                (0.0590, 0.0340, 0.0200, 0.0450),
                (0.0690, 0.0300, 0.0150, 0.0430),
                (0.0718, 0.0, 0.0, 0.0420)], axis='y', n=16, color=col, exp=3.2)
    parts.append(arm)
    # a rubber nose cap and a chrome press plate on top
    recolor(arm, lambda c, n: dk(col, 0.35) if c.y < -0.069 else None)
    parts.append(chip(0.020, 0.034, 0.008, at=(0, -0.048, 0.0472), color=C.chrome, h=0.0009, n=3, rot=(-4.0, 0, 0)))
    return parts


# ---------------------------------------------------------------- paper

@model('magazine', ao=0.55)
def magazine(v):
    col = [C.hotpink, C.cyan, C.tangerine][v]
    W, D = 0.2123, 0.2873
    parts = []
    # the page block, then front and back covers wrapped round a square spine (-X)
    parts.append(box((W - 0.004, D - 0.004, 0.0082), at=(0.001, 0, 0.0012), color=C.paper, bevel=0.0012, seg=1))
    parts.append(box((W, D, 0.0013), at=(0, 0, 0), color=col, bevel=0.0005, seg=1))
    parts.append(box((W, D, 0.0013), at=(0, 0, 0.0093), color=col, bevel=0.0005, seg=1))
    parts.append(box((0.003, D, 0.0106), at=(-W / 2 + 0.0015, 0, 0), color=col, bevel=0.0012, seg=1))
    # page edges: a few faint lines on the fore-edge
    for z in (0.0035, 0.0058, 0.0080):
        parts.append(box((0.0006, D - 0.008, 0.0006), at=(W / 2 - 0.0012, 0, z), color=mixc(lin(C.paper), (0.5, 0.45, 0.4), 0.3), bevel=0))
    top = 0.0106
    # the cover: masthead band at the head (+Y), a picture, headline bars
    parts.append(chip(W - 0.024, 0.040, 0.004, at=(0, D / 2 - 0.033, top), color=C.white, h=0.0005))
    parts.append(chip(W - 0.040, 0.022, 0.003, at=(0, D / 2 - 0.033, top + 0.0003), color=dk(col, 0.35), h=0.0005))
    parts.append(chip(0.150, 0.150, 0.006, at=(0.018, -0.004, top), color=lt(col, 0.65), h=0.0005))
    parts.append(dot(0.032, at=(0.032, 0.010, top + 0.0003), color=C.yellow, h=0.0005, seg=20))
    parts.append(prism(sellipse(0.15, 0.09, 20, e=2.0, cx=0.018, cy=-0.079), 0.0005, at=(0, 0, top + 0.0004), color=C.white))
    for k, w in enumerate((0.080, 0.056, 0.068)):
        parts.append(chip(w, 0.010, 0.002, at=(-W / 2 + 0.014 + w / 2, -0.060 - k * 0.018, top + 0.0009), color=C.white, h=0.0005, n=1))
    parts.append(chip(0.046, 0.022, 0.003, at=(-W / 2 + 0.035, 0.035, top + 0.0009), color=C.yellow, h=0.0005, n=1, rot=(0, 0, 8)))
    return parts


@model('hardback', ao=0.6)
def hardback(v):
    col = SETS['book'][(v + 2) % len(SETS['book'])]
    W, T, D = 0.1712, 0.0484, 0.2451
    board = 0.0032
    parts = [
        box((W - 0.004, D, board), at=(0.002, 0, 0), color=col, bevel=0.0010, seg=1),
        box((W - 0.004, D, board), at=(0.002, 0, T - board), color=col, bevel=0.0010, seg=1),
    ]
    # a rounded spine on the left (-X)
    sx = -W / 2 + 0.0085
    spine = loft([(-D / 2, 0.0, 0.0, T / 2, sx), (-D / 2 + 0.0004, 0.014, T * 0.9, T / 2, sx),
                  (-D / 2 + 0.0018, 0.017, T, T / 2, sx), (D / 2 - 0.0018, 0.017, T, T / 2, sx),
                  (D / 2 - 0.0004, 0.014, T * 0.9, T / 2, sx), (D / 2, 0.0, 0.0, T / 2, sx)],
                 axis='y', n=16, color=col, exp=2.2)
    parts.append(spine)
    # the page block, with lines on the fore-edge
    parts.append(box((W - 0.014, D - 0.010, T - 2 * board), at=(0.002, 0, board), color=C.paper, bevel=0.0015, seg=1))
    for z in (0.012, 0.019, 0.026, 0.033, 0.039):
        parts.append(box((0.0006, D - 0.016, 0.0007), at=(W / 2 - 0.0092, 0, z), color=mixc(lin(C.paper), (0.5, 0.45, 0.4), 0.3), bevel=0))
    # gold bands on the spine
    for y in (-D / 2 + 0.022, D / 2 - 0.022, -D / 2 + 0.034, D / 2 - 0.034):
        parts.append(loft([(y - 0.0025, 0.0174, T + 0.0006, T / 2, sx - 0.0002), (y + 0.0025, 0.0174, T + 0.0006, T / 2, sx - 0.0002)],
                          axis='y', n=16, color=C.gold, exp=2.2))
    # a gold-framed panel and a little emblem on the front board
    parts.append(chip(0.104, 0.150, 0.006, at=(0.008, 0.012, T), color=C.gold, h=0.0005))
    parts.append(chip(0.096, 0.142, 0.004, at=(0.008, 0.012, T + 0.0003), color=col, h=0.0005))
    parts.append(chip(0.028, 0.028, 0, at=(0.008, 0.012, T + 0.0006), color=C.gold, h=0.0005, rot=(0, 0, 45)))
    parts.append(chip(0.060, 0.008, 0.002, at=(0.008, 0.062, T + 0.0006), color=C.gold, h=0.0005, n=1))
    # a ribbon bookmark trailing out of the tail (-Y)
    parts.append(tube([(0.03, -D / 2 + 0.01, T * 0.55), (0.032, -D / 2 - 0.004, T * 0.45), (0.036, -D / 2 - 0.004, 0.003),
                       (0.040, -D / 2 - 0.008, 0.0012)], 0.0016, color=C.red, seg=4))
    return parts


# ---------------------------------------------------------------- housewares

@model('alarmclock', ao=0.55)
def alarmclock(v):
    red, cz, R = C.red, 0.058, 0.047
    parts = []
    # the drum, facing the front (-Y)
    drum = lathe([(0.0, -0.020), (R - 0.006, -0.020), (R - 0.0015, -0.0185), (R, -0.014), (R, 0.014),
                  (R - 0.0015, 0.0185), (R - 0.006, 0.020), (0.0, 0.020)], at=(0, 0.0015, cz), color=red, seg=24, rot=(90, 0, 0))
    parts.append(drum)
    parts.append(torus(R - 0.004, 0.0034, at=(0, -0.019, cz), color=C.chrome, seg=24, rseg=6, rot=(90, 0, 0)))
    parts.append(disc(R - 0.006, 0.002, at=(0, -0.0185, cz), color=C.white, seg=24, rot=(90, 0, 0)))
    yf = -0.0206
    for k in range(12):
        a = 2 * math.pi * k / 12
        big = k % 3 == 0
        if big:
            parts.append(dot(0.0028, at=(0.033 * math.sin(a), yf + 0.0003, cz + 0.033 * math.cos(a)),
                             color=C.charcoal, h=0.0008, seg=8, rot=(90, 0, 0)))
        else:
            parts.append(box((0.0026, 0.0008, 0.0026), at=(0.033 * math.sin(a), yf - 0.0005, cz + 0.033 * math.cos(a) - 0.0013),
                             color=C.grey, bevel=0, rot=(0, 0, 0)))
    # hands at ten past ten, and a red second hand
    for ang, ln, wd, c in ((-60, 0.020, 0.0042, C.charcoal), (60, 0.029, 0.003, C.charcoal), (160, 0.030, 0.0012, C.red)):
        a = math.radians(ang)
        off = ln * 0.4
        parts.append(box((wd, 0.0008, ln), at=(math.sin(a) * off, yf - 0.0002 - 0.0004 * (c == C.red), cz + math.cos(a) * off - ln / 2),
                         color=c, bevel=0, rot=(0, 0, 0)))
        deform(parts[-1], lambda p, a=a, o=(math.sin(a) * off, cz + math.cos(a) * off):
               p.__class__((o[0] + (p.x - o[0]) * math.cos(a) + (p.z - o[1]) * math.sin(a), p.y,
                            o[1] - (p.x - o[0]) * math.sin(a) + (p.z - o[1]) * math.cos(a))))
    parts.append(dot(0.003, at=(0, yf - 0.001, cz), color=C.gold, h=0.0012, seg=10, rot=(90, 0, 0)))
    # twin bells on the shoulders, and the hammer between them
    for s in (-1, 1):
        t = math.radians(47)
        bx, bz = s * (R + 0.002) * math.sin(t), cz + (R + 0.002) * math.cos(t)
        bell = lathe([(0.0, 0.0), (0.0250, 0.0), (0.0253, 0.003), (0.0228, 0.012), (0.015, 0.019), (0.0065, 0.0222), (0.0, 0.0226)],
                     color=red, seg=16)
        deform(bell, lambda p, s=s, t=t, bx=bx, bz=bz: p.__class__((bx + p.x * math.cos(t) + s * p.z * math.sin(t), p.y,
                                                                     bz - s * p.x * math.sin(t) + p.z * math.cos(t))))
        parts.append(bell)
        parts.append(sphere(0.0042, at=(bx + s * 0.0235 * math.sin(t), 0, bz + 0.0235 * math.cos(t)), color=C.gold, seg=8))
        # legs
        parts.append(cyl(0.0042, 0.016, at=(s * 0.030, 0.0, 0.004), color=C.gold, seg=8, bevel=0, r2=0.0035, rot=(0, -s * 18, 0)))
        parts.append(sphere(0.0065, at=(s * 0.0335, 0.0, 0.0065), color=C.gold, seg=10))
    parts.append(cyl(0.0028, 0.018, at=(0, 0.0, cz + R - 0.002), color=C.gold, seg=10, bevel=0.0008))
    parts.append(sphere(0.0058, at=(0, 0, cz + R + 0.0172), color=C.gold, seg=12, scale=(1.4, 1, 0.9)))
    return parts


@model('photoframe')
def photoframe(v):
    wood = C.woodDark
    W, H, T = 0.160, 0.214, 0.017
    lean = math.radians(7)
    parts = []
    frame = slab(W, H, T, 0.010, color=wood, bevel=0.0045, n=3, seg=2, rot=(90, 0, 0))
    # an inner moulding, the cream mat, and the picture: hills under a sun
    parts.append(frame)
    yf = -T
    parts.append(chip(W - 0.022, H - 0.022, 0.004, at=(0, yf + 0.0002, 0), color=mixc(lin(wood), (1, 1, 1), 0.18), h=0.0010, rot=(90, 0, 0)))
    parts.append(chip(W - 0.030, H - 0.030, 0.002, at=(0, yf - 0.0006, 0), color=C.cream, h=0.0006, n=1, rot=(90, 0, 0)))
    pw, ph = W - 0.056, H - 0.064
    pic = chip(pw, ph, 0.002, at=(0, yf - 0.0010, 0.004), color=C.sky, h=0.0006, n=1, rot=(90, 0, 0))
    paint(pic, C.sky, lambda p: mixc(lin(C.sky), (1, 1, 1), max(0.0, min(1.0, 0.5 - p.z / ph))))
    parts.append(pic)
    parts.append(dot(0.016, at=(0.022, yf - 0.0014, 0.043), color=C.yellow, h=0.0006, seg=16, rot=(90, 0, 0)))
    # hills: two overlapping half-ovals, clipped to the picture's bottom edge
    for cx, w, hh, c in ((-0.020, 0.090, 0.050, C.grass), (0.026, 0.080, 0.036, C.leafLime)):
        pts = [(cx + w / 2 * math.cos(math.pi * i / 12), max(-ph / 2 + 0.004, -ph / 2 + 0.004 + hh * math.sin(math.pi * i / 12)))
               for i in range(13)]
        pts = [(max(-pw / 2, min(pw / 2, x)), y) for x, y in pts]
        parts.append(prism(pts, 0.0006, at=(0, yf - 0.0016 - 0.0003 * (c == C.leafLime), 0.0), color=c, rot=(90, 0, 0)))
    # the whole front leans back a touch; the strut props it from behind
    for o in parts:
        deform(o, lambda p: p.__class__((p.x, p.y * math.cos(lean) + (p.z + H / 2) * math.sin(lean),
                                         -p.y * math.sin(lean) + (p.z + H / 2) * math.cos(lean))))
    strut = box((0.034, 0.008, 0.150), at=(0, 0.0, 0.0), color=dk(wood, 0.15), bevel=0.0025, seg=1)
    deform(strut, lambda p: p.__class__((p.x, 0.074 - 0.0035 + p.y + (0.0 - 0.074) * p.z / 0.150 + 0.001,
                                         p.z * 0.80)))
    parts.append(strut)
    return parts


@model('tissuebox', ao=0.7)
def tissuebox(v):
    col = [C.cyan, C.pink, C.lemon][v]
    W, D, H = 0.235, 0.120, 0.090
    body = slab(W, D, H, 0.014, color=col, bevel=0.007, n=4, seg=2)
    parts = [body]
    # a white band round the base and polka dots on the front and top
    parts.append(slab(W + 0.0012, D + 0.0012, 0.014, 0.0146, at=(0, 0, 0.006), color=C.white, bevel=0.002, n=4, seg=1))
    pale = lt(col, 0.55)
    for x in (-0.085, -0.045, 0.045, 0.085):
        for z in (0.040, 0.066):
            xx = x + (0.02 if z > 0.05 else 0.0)
            parts.append(dot(0.0068, at=(xx, -D / 2 + 0.0002, z), color=pale, h=0.0008, seg=10, rot=(90, 0, 0)))
    # the oval slot and its film, and the tissue billowing out of it
    parts.append(prism(sellipse(0.120, 0.042, 20, e=2.6), 0.0008, at=(0, 0, H - 0.0002), color=dk(col, 0.25)))
    parts.append(prism(sellipse(0.106, 0.030, 20, e=2.6), 0.0008, at=(0, 0, H + 0.0002), color=0xdde9ef))
    tissue = loft([(-0.050, 0.0, 0.0, H + 0.006),
                   (-0.046, 0.010, 0.010, H + 0.008),
                   (-0.034, 0.016, 0.030, H + 0.016),
                   (-0.016, 0.014, 0.024, H + 0.013),
                   (0.004, 0.018, 0.034, H + 0.017),
                   (0.024, 0.014, 0.026, H + 0.014),
                   (0.040, 0.012, 0.016, H + 0.009),
                   (0.050, 0.0, 0.0, H + 0.004)], axis='x', n=12, color=C.white, exp=2.0)
    # flatten it into a sheet and give it a soft S across the slot
    deform(tissue, lambda p: p.__class__((p.x, p.y * 0.55 + 0.006 * math.sin(p.x * 70), max(p.z, H + 0.001))))
    parts.append(tissue)
    return parts


# ---------------------------------------------------------------- clothing

def foot(L, wmax, heel, toe_y=-1):
    """Half-widths along a footprint, toe at -Y: widest across the ball."""
    out = []
    for t, w in ((0.0, 0.0), (0.012, 0.55), (0.04, 0.82), (0.10, 0.97), (0.24, 1.0), (0.42, 0.90),
                 (0.62, heel), (0.82, heel * 0.98), (0.93, heel * 0.86), (0.985, heel * 0.55), (1.0, 0.0)):
        out.append((toe_y * (L / 2 - t * L), w * wmax))
    return out


@model('slipper')
def slipper(v):
    col = C.pink if v else C.blue
    L = 0.252
    # sole: a footprint-shaped slab; footbed a lighter tint on top of it
    sole = loft([(y, w, 0.0 if w == 0 else 0.013, 0.0065) for y, w in foot(L, 0.088, 0.78)], axis='y', n=12, color=dk(col, 0.25), exp=5.0)
    bed = loft([(y, w * 0.9, 0.0 if w == 0 else 0.004, 0.0122) for y, w in foot(L - 0.012, 0.088, 0.78)], axis='y', n=12,
               color=lt(col, 0.55), exp=5.0)
    # the puffy toe cover over the front half; its open back reads as the dark inside
    st = []
    for y, w, top in ((-0.1262, 0.0, 0.022), (-0.1235, 0.050, 0.026), (-0.114, 0.074, 0.036), (-0.095, 0.088, 0.046),
                      (-0.060, 0.088, 0.054), (-0.025, 0.088, 0.054), (0.004, 0.086, 0.050)):
        st.append((y, w, 0.0 if w == 0 else 2 * (top - 0.012), 0.012))
    upper = loft(st, axis='y', n=16, color=col, exp=2.3)
    deform(upper, lambda p: p.__class__((p.x, p.y, max(p.z, 0.011))))
    recolor(upper, lambda c, n: dk(col, 0.55) if n.y > 0.8 and c.y > 0.0 else None)
    # a rolled cuff round the opening, and a pompom
    cuff = tube([(0.0405 * math.cos(math.pi * i / 10), 0.004, 0.012 + 0.038 * math.sin(math.pi * i / 10)) for i in range(11)],
                0.0056, color=lt(col, 0.4), seg=8)
    pom = sphere(0.0118, at=(0, -0.066, 0.0535), color=C.white, seg=12)
    return [sole, bed, upper, cuff, pom]


@model('shoe')
def shoe(v):
    col = [C.red, C.blue, C.white][v]
    accent = C.white if v < 2 else C.blue
    L = 0.2751
    sole = loft([(y, w, 0.0 if w == 0 else 0.026, 0.013) for y, w in foot(L, 0.0951, 0.80)], axis='y', n=12, color=C.white, exp=4.0)
    # a contrasting tread line round the sole
    recolor(sole, lambda c, n: lin(C.lightgrey) if c.z < 0.0045 else (lin(accent if v == 2 else C.lightgrey) if 0.011 < c.z < 0.016 else None))
    # the upper: low at the toe, rising to the ankle collar at the heel (+Y)
    st = []
    for y, w, top in ((-0.1325, 0.0, 0.032), (-0.130, 0.040, 0.036), (-0.122, 0.064, 0.044), (-0.100, 0.082, 0.054),
                      (-0.060, 0.090, 0.064), (-0.020, 0.090, 0.078), (0.020, 0.086, 0.096), (0.055, 0.080, 0.112),
                      (0.085, 0.076, 0.118), (0.110, 0.074, 0.116), (0.124, 0.066, 0.106), (0.131, 0.040, 0.088),
                      (0.1335, 0.0, 0.080)):
        st.append((y, w, 0.0 if w == 0 else top - 0.018, (top + 0.018) / 2))
    upper = loft(st, axis='y', n=14, color=col, exp=2.8)
    deform(upper, lambda p: p.__class__((p.x, p.y, max(p.z, 0.020))))
    parts = [sole, upper]
    # toe cap
    parts.append(sphere(1.0, at=(0, -0.112, 0.024), color=(C.white if v < 2 else C.lightgrey), seg=12, scale=(0.040, 0.024, 0.020)))
    # the dark ankle opening and a padded collar
    parts.append(sphere(1.0, at=(0, 0.080, 0.1155), color=C.charcoal, seg=12, scale=(0.030, 0.040, 0.0035)))
    parts.append(tube([(0.034 * math.cos(math.radians(a)), 0.080 + 0.043 * math.sin(math.radians(a)), 0.117)
                       for a in range(-200, 21, 30)], 0.0046, color=dk(col, 0.15) if v < 2 else C.lightgrey, seg=8))
    # laces: four white bars climbing the tongue
    for k in range(4):
        y = -0.055 + k * 0.022
        z = 0.064 + (y + 0.06) * 0.42 + 0.004
        parts.append(box((0.040, 0.0055, 0.004), at=(0, y, z - 0.002), color=C.white, bevel=0, rot=(-24, 0, 0)))
    # a round patch on each side, and a heel tab
    for s in (-1, 1):
        parts.append(dot(0.012, at=(s * 0.0442, 0.050, 0.060), color=accent, h=0.0012, seg=10, rot=(0, s * 90, 0)))
    parts.append(box((0.016, 0.006, 0.034), at=(0, 0.1335, 0.084), color=accent, bevel=0.0025, seg=1, rot=(-8, 0, 0)))
    return parts


@model('backpack', ao=0.8)
def backpack(v):
    col = [C.navy, C.redDark, C.greenDark][v]
    zip_col, pull = C.charcoal, [C.yellow, C.lemon, C.orange][v]
    W, H = 0.290, 0.440
    # the main bag: a soft squircle in front view, rounded front and back
    zc = H / 2
    body = loft([(-0.090, 0.0, 0.0, zc), (-0.088, W * 0.80, H * 0.86, zc), (-0.080, W * 0.96, H * 0.97, zc),
                 (-0.060, W, H, zc), (0.060, W, H, zc), (0.080, W * 0.96, H * 0.97, zc),
                 (0.088, W * 0.80, H * 0.86, zc), (0.090, 0.0, 0.0, zc)], axis='y', n=20, color=col, exp=3.2)
    # a narrower, rounder top
    deform(body, lambda p: p.__class__((p.x * (1 - 0.14 * max(0.0, (p.z - 0.25) / 0.19) ** 2), p.y, p.z)))
    recolor(body, lambda c, n: lin(C.charcoal) if c.z < 0.03 else None)
    parts = [body]
    # the zip arching over the top of the front face
    parts.append(tube([(0.128 * math.cos(math.radians(a)) * (1 - 0.1 * math.sin(math.radians(a)) ** 4), -0.0905,
                        0.27 + 0.15 * math.sin(math.radians(a))) for a in range(0, 181, 20)], 0.0042, color=zip_col, seg=4))
    parts.append(box((0.012, 0.006, 0.030), at=(0.075, -0.094, 0.36), color=pull, bevel=0.003, seg=1, rot=(0, 0, 0)))
    # the front pocket, with its own zip and pull
    pocket = loft([(-0.155, 0.0, 0.0, 0.11), (-0.152, 0.17, 0.15, 0.11), (-0.143, 0.21, 0.18, 0.11),
                   (-0.125, 0.22, 0.19, 0.11), (-0.085, 0.22, 0.19, 0.11)], axis='y', n=16, color=col, exp=3.4)
    parts.append(pocket)
    parts.append(tube([(x, -0.150, 0.178) for x in (-0.085, -0.03, 0.03, 0.085)], 0.0038, color=zip_col, seg=4))
    deform(parts[-1], lambda p: p.__class__((p.x, p.y + 0.012 * (p.x / 0.085) ** 2, p.z)))
    parts.append(box((0.012, 0.006, 0.028), at=(-0.06, -0.156, 0.148), color=pull, bevel=0.003, seg=1))
    # a lighter panel on the pocket
    parts.append(sphere(1.0, at=(0, -0.1555, 0.10), color=lt(col, 0.25), seg=12, scale=(0.065, 0.004, 0.035)))
    # shoulder straps down the back (+Y), a grab handle on top
    for s in (-1, 1):
        x = s * 0.070
        strap = tube([(x, 0.088, 0.40), (x, 0.118, 0.37), (x * 1.1, 0.138, 0.28), (x * 1.25, 0.134, 0.16),
                      (x * 1.35, 0.114, 0.06), (x * 1.3, 0.090, 0.03)], 0.016, color=dk(col, 0.3), seg=8)
        parts.append(strap)
        parts.append(box((0.034, 0.008, 0.022), at=(x * 1.3, 0.143, 0.12), color=zip_col, bevel=0.003, seg=1))
    parts.append(tube(arc_points(0.032, 0, 180, 10, center=(0, 0.04, 0.428), plane='XZ'), 0.0075, color=dk(col, 0.3), seg=8))
    return parts


# ---------------------------------------------------------------- the AI shelf (ai.js)

def keycap(w, d, h, at=(0, 0, 0), color=0xcccccc, taper=0.78, r=0.0025):
    """A keycap: a chamfered block narrowing to its top face. 28 triangles."""
    bm = bmesh.new()
    lo = [bm.verts.new((x, y, 0.0)) for x, y in rrect(w, d, r, 1)]
    hi = [bm.verts.new((x * taper + 0.0, y * taper - d * (1 - taper) * 0.12, h)) for x, y in rrect(w, d, r, 1)]
    n = len(lo)
    bm.faces.new(list(reversed(lo)))
    bm.faces.new(hi)
    for j in range(n):
        bm.faces.new((lo[j], lo[(j + 1) % n], hi[(j + 1) % n], hi[j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = _from_bmesh(bm, 'keycap')
    _place(o, at)
    paint(o, color)
    return _smooth(o, 30)


@model('paperclip_opt', ao=0.4)
def paperclip_opt(v):
    r = 0.0007
    z = r
    def arc(cx, cy, rad, a0, a1, n=6):
        return [(cx + rad * math.cos(math.radians(a0 + (a1 - a0) * i / n)),
                 cy + rad * math.sin(math.radians(a0 + (a1 - a0) * i / n)), z) for i in range(n + 1)]
    # the classic three nested loops, drawn as one wire
    path = [(-0.0055, 0.0006, z)]
    path += arc(0.0115, -0.0008, 0.0014, 90, -90, 4)
    path += arc(-0.0135, 0.00085, 0.00305, 270, 90, 6)
    path += arc(0.0145, 0.0, 0.0039, 90, -90, 6)
    path += [(-0.0040, -0.0039, z)]
    wire = tube(path, r, color=C.gold, seg=4)
    # ...and the one thing a paperclip should not have: a little gem, at the end it starts from
    gem = sphere(0.0021, at=(-0.0062, 0.0006, 0.0023), color=C.lemon, seg=8)
    glint = sphere(0.0006, at=(-0.0068, -0.0001, 0.0038), color=C.white, seg=6)
    return [wire, gem, glint]


@model('token')
def token(v):
    col = [C.orange, C.teal, C.violet, C.lime][v]
    s = 0.0112
    parts = [box((s, s, s), at=(0, 0, 0), color=col, bevel=0.0022, seg=2)]
    # a white belt round the middle, and a lighter pip on top
    parts.append(box((0.0125, 0.0125, 0.0036), at=(0, 0, 0.0038), color=C.white, bevel=0.0010, seg=1))
    parts.append(sphere(0.0022, at=(0, 0, s - 0.0006), color=lt(col, 0.55), seg=8, scale=(1, 1, 0.35)))
    return parts


@model('usb_stick')
def usb_stick(v):
    col = [C.charcoal, C.red, C.teal][v]
    # the body, plug end at the front (-Y)
    body = slab(0.019, 0.042, 0.009, 0.0045, at=(0, 0.0075, 0), color=col, bevel=0.0022, n=3, seg=2)
    parts = [body]
    # a grippy lighter panel, an activity LED and the lanyard hole
    parts.append(chip(0.012, 0.018, 0.003, at=(0, 0.010, 0.0089), color=lt(col, 0.3), h=0.0005, n=2))
    parts.append(dot(0.0013, at=(0, -0.0085, 0.0089), color=C.lime, h=0.0006, seg=8))
    parts.append(dot(0.0022, at=(0, 0.0245, 0.0089), color=C.black, h=0.0005, seg=8))
    # the steel plug, with its two little windows
    parts.append(box((0.0122, 0.0145, 0.0046), at=(0, -0.0205, 0.0022), color=C.steel, bevel=0.0006, seg=1))
    for x in (-0.0028, 0.0028):
        parts.append(chip(0.0022, 0.0022, 0, at=(x, -0.0225, 0.0067), color=C.charcoal, h=0.0003))
    return parts


@model('mech_keyboard')
def mech_keyboard(v):
    W, D = 0.360, 0.135
    # the case rises toward the back (+Y), a typing wedge
    case = slab(W, D, 0.019, 0.008, color=C.charcoal, bevel=0.004, n=3, seg=2)
    deform(case, lambda p: p.__class__((p.x, p.y, p.z + 0.009 * (p.y / D + 0.5) * (p.z / 0.019))))
    top = lambda y: 0.019 + 0.009 * (y / D + 0.5)
    parts = [case]
    u = 0.0236
    rows = [
        [1] * 14,
        [1.5] + [1] * 11 + [1.5],
        [1.75] + [1] * 10 + [2.25],
        [2.25] + [1] * 10 + [1.75],
        [1.25, 1.25, 1.25, 6.5, 1.25, 1.25, 1.25],
    ]
    # deterministic accent keys, like the keyset the owner obviously chose
    accents = {(0, 0), (2, 11), (0, 13), (4, 3)}
    for ri, row in enumerate(rows):
        y = 0.046 - ri * 0.0228
        x = -u * 7
        for ki, k in enumerate(row):
            w = k * u
            c = C.lightgrey if k == 1 else C.grey
            if (ri, ki) in accents:
                c = C.orange if (ri, ki) != (4, 3) else C.offwhite
            parts.append(keycap(w - 0.0042, 0.0192, 0.0098, at=(x + w / 2, y, top(y) - 0.0012), color=c))
            x += w
    # status LEDs at the back right
    for k, c in enumerate((C.lime, C.lime, C.cyan)):
        parts.append(dot(0.0016, at=(0.150 + k * 0.0075, 0.0605, top(0.06) - 0.0001), color=c, h=0.0005, seg=6))
    return parts


@model('smart_speaker')
def smart_speaker(v):
    col = C.lightgrey if v else C.charcoal
    knit = tuple(c * (0.93 if v else 1.18) for c in lin(col))   # scaled, so it stays faint on charcoal too
    prof = [(0.0, 0.0), (0.050, 0.0), (0.0545, 0.003), (0.0560, 0.008)]
    for i in range(1, 12):
        z = 0.008 + i * 0.0115
        prof.append((0.0560 - 0.0055 * i / 11, z))
    prof += [(0.0495, 0.1375), (0.0480, 0.1405)]
    body = lathe(prof, color=col, seg=24)
    # a knitted fabric: faint alternating bands
    recolor(body, lambda c, n: knit if 0.008 < c.z < 0.135 and int((c.z - 0.008) / 0.0115) % 2 else None)
    recolor(body, lambda c, n: lin(C.black) if c.z < 0.006 else None)
    parts = [body]
    # the top: a dark cap, a glowing ring, four buttons
    parts.append(lathe([(0.0, 0.1395), (0.0488, 0.1395), (0.0492, 0.148), (0.0476, 0.1520), (0.030, 0.1525), (0.0, 0.1525)],
                       color=C.darkgrey, seg=24))
    parts.append(torus(0.0405, 0.0040, at=(0, 0, 0.1522), color=C.cyan, seg=24, rseg=6))
    for k in range(4):
        a = math.radians(45 + 90 * k)
        parts.append(dot(0.0042, at=(0.018 * math.cos(a), 0.018 * math.sin(a), 0.1523), color=C.charcoal if v else C.grey,
                         h=0.0012, seg=10))
    return parts


@model('gpu_card')
def gpu_card(v):
    L, H, T = 0.276, 0.112, 0.040
    x0 = 0.010
    parts = []
    # the shroud, standing on its edge connector, fans facing the front (-Y)
    shroud = slab(L, H, T, 0.010, at=(x0, 0.020, 0.0705), color=C.charcoal, bevel=0.004, n=3, seg=2, rot=(90, 0, 0))
    parts.append(shroud)
    # a backplate and heatsink fins showing along the top edge
    parts.append(slab(L - 0.004, H - 0.006, 0.004, 0.008, at=(x0, 0.0245, 0.0705), color=C.steelDark, bevel=0.0012, n=2, seg=1,
                      rot=(90, 0, 0)))
    for k in range(18):
        parts.append(box((0.0018, 0.036, 0.004), at=(x0 - 0.12 + k * 0.0141, 0.001, 0.1265), color=C.grey, bevel=0))
    # an accent stripe and the LED bar on top
    parts.append(prism([(-0.135, 0.040), (0.010, 0.040), (0.022, 0.052), (-0.135, 0.052)], 0.0012,
                       at=(x0, -0.0198, 0.0705), color=C.lime, rot=(90, 0, 0)))
    parts.append(chip(0.090, 0.008, 0.002, at=(x0 + 0.06, -0.008, 0.1269), color=C.lime, h=0.0012, n=1))
    # twin fans
    for fx in (x0 - 0.068, x0 + 0.068):
        parts.append(torus(0.0395, 0.0042, at=(fx, -0.0205, 0.0705), color=C.darkgrey, seg=20, rseg=5, rot=(90, 0, 0)))
        parts.append(disc(0.036, 0.001, at=(fx, -0.0195, 0.0705), color=C.black, seg=20, rot=(90, 0, 0)))
        for k in range(7):
            a = 360 * k / 7
            blade = box((0.010, 0.0016, 0.026), at=(0, 0, 0), color=C.grey, bevel=0, rot=(0, 18, 0))
            deform(blade, lambda p, a=math.radians(a), fx=fx: p.__class__((
                fx + (p.x) * math.cos(a) - (p.z + 0.006) * math.sin(a), -0.0225 + p.y,
                0.0705 + (p.x) * math.sin(a) + (p.z + 0.006) * math.cos(a))))
            parts.append(blade)
        parts.append(cyl(0.0105, 0.004, at=(fx, -0.0205, 0.0705), color=C.charcoal, seg=16, bevel=0.0012, rot=(90, 0, 0)))
        parts.append(dot(0.005, at=(fx, -0.0245, 0.0705), color=C.lime, h=0.0006, seg=12, rot=(90, 0, 0)))
    # the bracket at the left end, and the gold edge connector
    parts.append(box((0.003, 0.058, 0.124), at=(x0 - L / 2 - 0.0035, 0.0, 0.0074), color=C.steel, bevel=0.0008, seg=1))
    for z in (0.035, 0.060, 0.085):
        parts.append(chip(0.020, 0.0045, 0.002, at=(x0 - L / 2 - 0.005, 0.0, z), color=C.steelDark, h=0.0006, n=1,
                          rot=(0, -90, 0)))
    parts.append(box((0.090, 0.0024, 0.0145), at=(x0 + 0.020, 0.0, 0.0), color=C.greenDark, bevel=0))
    parts.append(box((0.084, 0.0028, 0.0085), at=(x0 + 0.020, 0.0, 0.0008), color=C.gold, bevel=0))
    return parts


@model('plush_assistant', ao=0.6)
def plush_assistant(v):
    col = [C.orange, C.tangerine, C.cream][v]
    belly = lt(col, 0.55) if v < 2 else lt(C.tangerine, 0.55)
    parts = []
    # a pear-shaped body and a big round head, faces the front (-Y)
    body = sphere(1.0, at=(0, 0, 0.068), color=col, seg=18, scale=(0.064, 0.052, 0.068))
    deform(body, lambda p: p.__class__((p.x, p.y, max(p.z, 0.004))))
    head = sphere(0.059, at=(0, -0.002, 0.150), color=col, seg=20, scale=(1.04, 0.97, 0.95))
    parts += [body, head]
    parts.append(sphere(1.0, at=(0, -0.044, 0.062), color=belly, seg=14, scale=(0.040, 0.010, 0.042)))
    # stubby arms reaching out, little feet poking forward
    for s in (-1, 1):
        parts.append(sphere(1.0, at=(s * 0.064, -0.008, 0.082), color=col, seg=12, scale=(0.025, 0.020, 0.036),
                            rot=(0, -s * 50, 0)))
        parts.append(sphere(1.0, at=(s * 0.030, -0.040, 0.013), color=dk(col, 0.06), seg=12, scale=(0.022, 0.022, 0.013)))
        # round ears, with a lighter inside
        parts.append(sphere(1.0, at=(s * 0.040, 0.0, 0.198), color=col, seg=12, scale=(0.019, 0.013, 0.017), rot=(0, s * 25, 0)))
        parts.append(sphere(1.0, at=(s * 0.040, -0.009, 0.198), color=belly, seg=8, scale=(0.011, 0.005, 0.010), rot=(0, s * 25, 0)))
        # eyes with a glint, and rosy cheeks
        parts.append(sphere(1.0, at=(s * 0.021, -0.0545, 0.160), color=C.charcoal, seg=10, scale=(0.0078, 0.0045, 0.0105)))
        parts.append(sphere(0.0024, at=(s * 0.021 - 0.0022, -0.0588, 0.1645), color=C.white, seg=6))
        parts.append(sphere(1.0, at=(s * 0.036, -0.0475, 0.140), color=C.pink, seg=10, scale=(0.0095, 0.004, 0.0062)))
    # a small smile
    parts.append(tube([(0.009 * math.cos(math.radians(a)), -0.0575 + 0.0035 * abs(math.sin(math.radians(a))) * 0.0,
                        0.141 - 0.0055 * math.sin(math.radians(a))) for a in range(20, 161, 35)], 0.0016, color=C.charcoal, seg=4))
    return parts


@model('robot_vacuum')
def robot_vacuum(v):
    R, H = 0.170, 0.074
    body = lathe([(0.0, 0.0), (R - 0.016, 0.0), (R - 0.004, 0.006), (R, 0.018), (R, 0.058), (R - 0.004, 0.068),
                  (R - 0.014, H), (0.0, H)], color=C.charcoal, seg=32)
    parts = [body]
    # a grey top plate with a seam line, the lidar turret, and its lens band
    parts.append(disc(R - 0.016, 0.002, at=(0, 0, H - 0.0006), color=C.darkgrey, seg=32))
    parts.append(torus(0.110, 0.0016, at=(0, 0.0, H + 0.0012), color=C.charcoal, seg=28, rseg=3))
    parts.append(cyl(0.050, 0.025, at=(0, 0.035, H), color=C.steelDark, seg=20, bevel=0.006))
    parts.append(cyl(0.0505, 0.006, at=(0, 0.035, H + 0.008), color=C.black, seg=20, bevel=0))
    # a soft black bumper round the front half, with two friendly cyan eyes in it
    bumper = lathe([(R + 0.002, 0.012), (R + 0.006, 0.018), (R + 0.006, 0.052), (R + 0.002, 0.058)], color=C.black, seg=32,
                   close_bottom=False)
    deform(bumper, lambda p: p if p.y < -0.02 else p.__class__((p.x * 0.97, p.y * 0.97, p.z)))
    recolor(bumper, lambda c, n: None if c.y < -0.03 else lin(C.charcoal))
    parts.append(bumper)
    for s in (-1, 1):
        a = math.radians(-90 + s * 14)
        parts.append(sphere(1.0, at=((R + 0.006) * math.cos(a), (R + 0.006) * math.sin(a), 0.036), color=C.cyan, seg=10,
                            scale=(0.009, 0.004, 0.012), rot=(0, 0, s * 14)))
    # the power button and a status light on top
    parts.append(cyl(0.017, 0.004, at=(0, -0.095, H + 0.001), color=C.lime, seg=14, bevel=0.0015))
    parts.append(chip(0.040, 0.007, 0.0035, at=(0, -0.130, H + 0.001), color=C.cyan, h=0.001, n=2))
    # the spinning side brush, poking out at the front left
    bx, by = -0.118, -0.092
    parts.append(cyl(0.014, 0.008, at=(bx, by, 0.0), color=C.darkgrey, seg=10, bevel=0.002))
    for k in range(4):
        a = math.radians(30 + 90 * k)
        parts.append(tube([(bx, by, 0.0045), (bx + 0.055 * math.cos(a), by + 0.055 * math.sin(a), 0.002),
                           (bx + 0.070 * math.cos(a + 0.25), by + 0.070 * math.sin(a + 0.25), 0.0024)], 0.0024,
                          color=C.lightgrey, seg=4))
    return parts


