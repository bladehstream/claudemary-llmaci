"""House-stage furniture, people and pets, modelled.

Frame reminder (see kit.py): Blender Z is up, X is the prop's width, and the
game's FRONT (+Z) is Blender -Y. Sizes are real metres, matched to
out/specs.json — the procedural box each archetype already occupies.
"""
import math
import random
from mathutils import Vector, Euler
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


def shade(col, t):
    """col darkened by t (0..1) — a linear tuple, ready for any primitive."""
    return mixc(lin(col), (0, 0, 0), t)


def tint(col, t):
    """col lightened towards white by t."""
    return mixc(lin(col), (1, 1, 1), t)


def rrect(w, d, r, n=4):
    """A rounded-rectangle outline, counter-clockwise, centred on the origin."""
    pts = []
    for cx, cy, a0 in ((w / 2 - r, d / 2 - r, 0), (-w / 2 + r, d / 2 - r, 90),
                       (-w / 2 + r, -d / 2 + r, 180), (w / 2 - r, -d / 2 + r, 270)):
        for i in range(n + 1):
            a = math.radians(a0 + 90 * i / n)
            pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


def slab(w, d, h, r, at=(0, 0, 0), color=0xcccccc, bevel=None, n=4):
    """A box with rounded corners in plan — table tops, cushions, plinths."""
    return extrude(rrect(w, d, r, n), h, at=at, color=color,
                   bevel=(min(h, r) * 0.3 if bevel is None else bevel))


def gable(w, h, d, at=(0, 0, 0), color=0xcccccc, bevel=0.01):
    """A triangular prism, ridge along Y (front to back), apex up. `at` is the
    centre of its floor. kit has no wedge; this is extrude on its side."""
    o = extrude([(-w / 2, 0), (w / 2, 0), (0, h)], d, color=color, bevel=bevel, rot=(90, 0, 0))
    # extrude grew +Z, which rot=(90,0,0) turns to -Y: re-centre on Y
    deform(o, lambda p: p.__class__((p.x + at[0], p.y + d / 2 + at[1], p.z + at[2])))
    return o


def capsule(p0, p1, r, color=0xcccccc, seg=10, r1=None, rings=3):
    """A rounded limb from p0 to p1 (radius r at p0, r1 at p1): legs, arms,
    tails, bicycle tubes with soft ends. A lathe turned to lie along p0->p1."""
    r1 = r if r1 is None else r1
    a, b = Vector(p0), Vector(p1)
    L = (b - a).length
    prof = [(0.0, -r)]
    for i in range(1, rings + 1):
        t = math.radians(-90 + 90 * i / rings)
        prof.append((r * math.cos(t), r * math.sin(t)))
    for i in range(0, rings + 1):
        t = math.radians(90 * i / rings)
        prof.append((r1 * math.cos(t), L + r1 * math.sin(t)))
    prof[-1] = (0.0, L + r1)
    o = lathe(prof, color=color, seg=seg, close_bottom=False, smooth=70)
    q = (b - a).normalized().to_track_quat('Z', 'Y')
    deform(o, lambda p: q @ p + a)
    return o


def ball(r, at, color, seg=12, scale=(1, 1, 1), rot=(0, 0, 0), rings=None):
    """A sphere for small round bits: eyes, paws, knobs. kit's sphere never
    drops below six rings; a lathed one with seg/2 rings is half the triangles
    for an eye that is ten pixels across."""
    rings = rings or max(3, seg // 2)
    prof = [(r * math.sin(math.pi * i / rings), -r * math.cos(math.pi * i / rings)) for i in range(rings + 1)]
    o = lathe(prof, color=color, seg=seg, close_bottom=False, smooth=80)
    m = Euler(tuple(math.radians(a) for a in rot), 'XYZ').to_matrix()
    deform(o, lambda p: m @ Vector((p.x * scale[0], p.y * scale[1], p.z * scale[2])) + Vector(at))
    return o


# ---------------------------------------------------------------- furniture

@model('stool', ao=0.8)
def stool(v):
    wood = C.woodDark
    parts = []
    # four splayed legs on the diagonals
    for a in (45, 135, 225, 315):
        ca, sa = math.cos(math.radians(a)), math.sin(math.radians(a))
        top, foot = 0.13, 0.205
        parts.append(tube([(ca * top, sa * top, 0.385), (ca * foot, sa * foot, 0.0)], 0.019, color=wood, seg=8))
    # the footrest ring, threaded through the legs
    parts.append(torus(0.172, 0.011, at=(0, 0, 0.17), color=wood, seg=24, rseg=6))
    # wooden seat board and a plump cushion in one turned profile
    seat = lathe([(0.17, 0.37), (0.18, 0.377), (0.18, 0.393), (0.174, 0.399), (0.184, 0.405), (0.186, 0.414),
                  (0.18, 0.425), (0.16, 0.432), (0.1, 0.436), (0.0, 0.4365)], color=C.carpet, seg=24)
    # the board is wood; piping round the cushion's waist
    recolor(seat, lambda c, n: wood if c.z < 0.4 else (shade(C.carpet, 0.22) if 0.409 < c.z < 0.42 else None))
    parts.append(seat)
    return parts


@model('lowtable', ao=0.8)
def lowtable(v):
    W, D = 1.15, 0.78
    parts = [
        # a dark rim with a lighter inset panel, rounded in plan
        slab(W, D, 0.045, 0.06, at=(0, 0, 0.36), color=C.woodDark, bevel=0.012, n=3),
        slab(W - 0.11, D - 0.11, 0.004, 0.035, at=(0, 0, 0.402), color=C.wood, bevel=0.0015, n=3),
        # apron under the top
        box((1.03, 0.66, 0.06), at=(0, 0, 0.3), color=C.wood, bevel=0.01, seg=1),
    ]
    for sx in (-1, 1):
        for sy in (-1, 1):
            leg = box((0.07, 0.07, 0.36), at=(sx * 0.48, sy * 0.3, 0), color=C.woodDark, bevel=0.012, seg=1)
            # legs taper towards the floor
            deform(leg, lambda p, sx=sx, sy=sy: p.__class__((sx * 0.48 + (p.x - sx * 0.48) * (0.7 + 0.3 * p.z / 0.36),
                                                              sy * 0.3 + (p.y - sy * 0.3) * (0.7 + 0.3 * p.z / 0.36), p.z)))
            parts.append(leg)
    return parts


@model('desk', ao=0.85)
def desk(v):
    W, D, H = 1.32, 0.68, 0.762
    dark = C.woodDark
    parts = [box((W, D, 0.042), at=(0, 0, H - 0.042), color=C.wood, bevel=0.012)]
    # left end panel, back modesty panel
    parts.append(box((0.06, 0.6, H - 0.042), at=(-0.6, 0, 0), color=dark, bevel=0.012, seg=1))
    parts.append(box((0.68, 0.03, 0.4), at=(-0.25, 0.27, 0.3), color=dark, bevel=0.008, seg=1))
    # a shallow pencil drawer under the top, left of the kneehole
    parts.append(box((0.66, 0.6, 0.07), at=(-0.25, 0, H - 0.112), color=dark, bevel=0.01, seg=1))
    parts.append(box((0.6, 0.02, 0.05), at=(-0.25, -0.3, H - 0.102), color=C.woodPale, bevel=0.006, seg=1))
    parts.append(box((0.1, 0.014, 0.018), at=(-0.25, -0.312, H - 0.086), color=C.gold, bevel=0.005, seg=1))
    # the drawer pedestal on the right, three drawers with brass pulls
    px = 0.38
    ped = box((0.5, 0.6, H - 0.042), at=(px, 0, 0), color=dark, bevel=0.012, seg=1)
    parts.append(ped)
    for z, h in ((0.05, 0.25), (0.32, 0.17), (0.51, 0.17)):
        parts.append(box((0.44, 0.024, h), at=(px, -0.3, z), color=C.woodPale, bevel=0.008, seg=1))
        parts.append(box((0.13, 0.02, 0.026), at=(px, -0.318, z + h * 0.62), color=C.gold, bevel=0.007, seg=1))
    return parts


@model('bookshelf', ao=0.85)
def bookshelf(v):
    W, H, D = 0.874, 1.794, 0.319
    rnd = random.Random(11)
    dark = C.woodDark
    parts = [
        box((W, D, 0.06), at=(0, 0, 0), color=shade(dark, 0.2), bevel=0.012, seg=1),      # plinth
        box((W, D, 0.045), at=(0, 0, H - 0.045), color=dark, bevel=0.012, seg=1),         # crown
        box((W - 0.06, 0.02, H - 0.08), at=(0, D / 2 - 0.02, 0.05), color=C.woodPale, bevel=0),  # back
    ]
    for s in (-1, 1):
        parts.append(box((0.04, D, H - 0.04), at=(s * (W / 2 - 0.02), 0, 0.02), color=dark, bevel=0.01, seg=1))
    shelves = [0.06, 0.4, 0.74, 1.08, 1.42]
    for z in shelves[1:]:
        parts.append(box((W - 0.07, D - 0.03, 0.03), at=(0, -0.005, z), color=dark, bevel=0.008, seg=1))
    inner = W / 2 - 0.045

    def book(t, d, h, at, col, lean=0.0):
        b = box((t, d, h), color=col, bevel=0.005, seg=1)
        a = math.radians(lean)
        # tip about the foot's +X edge, then place
        deform(b, lambda p: p.__class__((at[0] + (p.x - t / 2) * math.cos(a) + p.z * math.sin(a) + t / 2,
                                          at[1] + p.y, at[2] - (p.x - t / 2) * math.sin(a) + p.z * math.cos(a))))
        return b

    # each shelf: a run of upright books, then a lean or a lying stack, alternating
    for k, z in enumerate(shelves[1:]):
        z0 = z + 0.03
        x = -inner + 0.005 if k % 2 == 0 else -inner + 0.22
        end = inner - 0.2 if k % 2 == 0 else inner - 0.005
        while True:
            t = 0.048 + rnd.random() * 0.028
            if x + t > end:
                break
            col = SETS['book'][rnd.randrange(len(SETS['book']))]
            bd = D - 0.08 - rnd.random() * 0.03
            bh = 0.21 + rnd.random() * 0.08
            parts.append(book(t, bd, bh, (x, -0.01, z0), col))
            x += t + 0.002
        if k % 2 == 0:
            # the run ends in a book leaning over against the side
            col = SETS['book'][(k * 3 + 1) % len(SETS['book'])]
            parts.append(book(0.05, D - 0.09, 0.24, (inner - 0.055, -0.01, z0), col, lean=-14))
        else:
            # a stack lying flat in the gap at the left
            zz = z0
            for j in range(3):
                col = SETS['book'][(k + j * 2) % len(SETS['book'])]
                th = 0.04 + 0.01 * (j % 2)
                parts.append(box((0.2 - j * 0.02, D - 0.1 + j * 0.01, th), at=(-inner + 0.11 + j * 0.006, -0.01, zz),
                                 color=col, bevel=0.005, seg=1))
                zz += th
    # the bottom compartment: two storage boxes with hand-holds
    for i, col in enumerate((C.tangerine, C.teal)):
        bx = -0.19 + i * 0.38
        parts.append(box((0.34, D - 0.07, 0.26), at=(bx, -0.015, 0.06), color=col, bevel=0.012, seg=1))
        parts.append(box((0.1, 0.012, 0.03), at=(bx, -0.15, 0.24), color=shade(col, 0.35), bevel=0))
    return parts


@model('futon', ao=0.7)
def futon(v):
    col = C.indigo if v else C.carpet
    L, R = 1.0, 0.24
    # one turned profile along the roll: the end face in rings (the rolled
    # layers), a soft rounded shoulder, and a waist cinched at each tie
    end = [(0.0, 0.0), (0.045, 0.0), (0.07, 0.0), (0.11, 0.001), (0.135, 0.001), (0.175, 0.002), (0.2, 0.003)]
    prof = end + [(0.226, 0.01), (R, 0.04), (R, 0.17), (0.229, 0.2), (0.229, 0.26), (R, 0.29), (R, 0.5)]
    prof = prof + [(r, L - z) for (r, z) in reversed(prof[:-1])]
    roll = lathe(prof, color=col, seg=18, rot=(0, 90, 0), at=(-L / 2, 0, R), smooth=60)
    layer = tint(col, 0.6)

    def paint_roll(c, n):
        x = abs(c.x)
        rr = math.hypot(c.y, c.z - R)
        if x > L / 2 - 0.004 and rr < 0.2:
            # wide pale filling between thin rings of cover: a rolled mattress
            return col if (0.045 < rr < 0.07 or 0.11 < rr < 0.135 or rr > 0.175) else layer
        if 0.22 < x < 0.33 and rr < R - 0.004:
            return C.cream
        return None
    recolor(roll, paint_roll)
    # it sags a touch onto the floor
    deform(roll, lambda p: p.__class__((p.x, p.y * (1.0 + 0.04 * max(0.0, 1 - p.z / R)),
                                        p.z - 0.01 * max(0.0, 1 - p.z / R))))
    return [roll]


@model('sofa', ao=0.85)
def sofa(v):
    col = [C.carpet, C.teal, C.indigo][v]
    body = shade(col, 0.1)
    cush = tint(col, 0.06)
    W, D = 1.926, 0.887
    parts = [
        # the base frame under the seat
        box((W - 0.04, D - 0.02, 0.28), at=(0, 0.0, 0.11), color=body, bevel=0.05, seg=2),
        # the back, leaning back a little
        box((W - 0.36, 0.26, 0.5), at=(0, D / 2 - 0.14, 0.35), color=body, bevel=0.08, seg=2),
    ]
    deform(parts[1], lambda p: p.__class__((p.x, p.y + (p.z - 0.35) * 0.12, p.z)))
    # rolled arms
    for s in (-1, 1):
        arm = box((0.2, D, 0.5), at=(s * (W / 2 - 0.1), 0, 0.11), color=body, bevel=0.085, seg=2)
        deform(arm, lambda p, s=s: p.__class__((p.x + s * 0.012 * max(0.0, (p.z - 0.45) / 0.16), p.y, p.z)))
        parts.append(arm)
    inner = W - 0.4
    cw = inner / 3
    for i in (-1, 0, 1):
        # three plump seat cushions, domed on top, and three back pillows
        c = box((cw - 0.012, D - 0.3, 0.14), at=(i * cw, -0.11, 0.37), color=cush, bevel=0.045, seg=2)
        deform(c, lambda p, i=i: p.__class__((p.x, p.y, p.z + 0.025 * max(0.0, (p.z - 0.44) / 0.07)
                                              * max(0.0, 1 - ((p.x - i * cw) / (cw / 2)) ** 2)
                                              * max(0.0, 1 - ((p.y + 0.11) / ((D - 0.3) / 2)) ** 2))))
        parts.append(c)
        b = box((cw - 0.03, 0.15, 0.36), at=(i * cw, 0.21, 0.47), color=cush, bevel=0.06, seg=2)
        deform(b, lambda p: p.__class__((p.x, p.y + (p.z - 0.47) * 0.22, p.z)))
        parts.append(b)
    # short turned legs
    for sx in (-1, 1):
        for sy in (-1, 1):
            parts.append(cyl(0.032, 0.115, at=(sx * (W / 2 - 0.12), sy * (D / 2 - 0.12), 0), color=C.woodDark,
                             r2=0.042, seg=8, bevel=0))
    return parts


@model('floorlamp', ao=0.6)
def floorlamp(v):
    parts = [
        # a domed weighted base
        lathe([(0.0, 0.0), (0.155, 0.0), (0.161, 0.008), (0.155, 0.022), (0.11, 0.04), (0.04, 0.052), (0.0, 0.054)],
              color=C.charcoal, seg=18),
        cyl(0.02, 1.33, at=(0, 0, 0.04), color=C.steelDark, seg=10, bevel=0),
        # a collar half way and the fitting under the shade
        cyl(0.03, 0.04, at=(0, 0, 0.7), color=C.charcoal, seg=10, bevel=0.008),
        cyl(0.034, 0.05, at=(0, 0, 1.33), color=C.charcoal, seg=10, bevel=0.01),
    ]
    # the shade: a flared drum, open underneath and lit warm inside
    rb, rt, z0, z1 = 0.241, 0.16, 1.352, 1.652
    sh = lathe([(rb - 0.006, z0 + 0.008), (rb, z0), (rb + 0.0005, z0 + 0.03), (rt + 0.0005, z1 - 0.026), (rt, z1),
                (rt - 0.007, z1 - 0.008), (rb - 0.009, z0 + 0.01)],
               color=C.cream, seg=24, close_bottom=False, smooth=40)
    glow = mixc(lin(C.cream), lin(C.lemon), 0.5)
    trim = shade(C.cream, 0.3)

    def paint_shade(c, n):
        r = math.hypot(c.x, c.y)
        if r < (rb + (rt - rb) * (c.z - z0) / (z1 - z0)) - 0.004:
            return glow
        if c.z < z0 + 0.024 or c.z > z1 - 0.022:
            return trim
        return None
    recolor(sh, paint_shade)
    parts.append(sh)
    # the bulb peeking below the rim, and a pull chain
    parts.append(ball(0.045, at=(0, 0, 1.42), color=0xfff6d8, seg=10, scale=(1, 1, 1.15)))
    parts.append(tube([(0.05, 0, 1.39), (0.05, 0, 1.28)], 0.003, color=C.gold, seg=4))
    parts.append(ball(0.008, at=(0.05, 0, 1.275), color=C.gold, seg=6))
    return parts


@model('grandclock', ao=0.8)
def grandclock(v):
    wood = C.woodDark
    dk = shade(wood, 0.22)
    lt = tint(wood, 0.12)
    parts = [
        box((0.5, 0.34, 0.14), at=(0, 0.0, 0), color=dk, bevel=0.02, seg=1),                  # plinth
        box((0.46, 0.3, 0.04), at=(0, 0.0, 0.14), color=wood, bevel=0.012, seg=1),            # step
        box((0.42, 0.27, 1.32), at=(0, 0.0, 0.18), color=wood, bevel=0.018, seg=1),           # trunk
        box((0.48, 0.32, 0.05), at=(0, 0.0, 1.47), color=lt, bevel=0.014, seg=1),             # waist moulding
        box((0.48, 0.32, 0.34), at=(0, 0.0, 1.52), color=wood, bevel=0.02, seg=1),            # hood
        box((0.527, 0.366, 0.04), at=(0, 0.0, 1.84), color=lt, bevel=0.014, seg=1),           # cornice
        gable(0.5, 0.135, 0.33, at=(0, 0, 1.88), color=wood, bevel=0.012),                    # pediment
    ]
    # finial on the peak
    parts.append(ball(0.026, at=(0, 0, 2.017 - 0.026), color=C.gold, seg=10))
    fy = -0.135   # trunk front face
    # the pendulum window: glass, a brass rod and a big bob
    parts.append(box((0.26, 0.012, 0.86), at=(0, fy, 0.42), color=dk, bevel=0.006, seg=1))
    parts.append(box((0.22, 0.012, 0.8), at=(0, fy - 0.004, 0.45), color=C.glassDark, bevel=0.004, seg=1))
    parts.append(box((0.014, 0.008, 0.52), at=(0, fy - 0.01, 0.66), color=C.gold, bevel=0.002, seg=1))
    parts.append(lathe([(0.0, 0.0), (0.054, 0.0), (0.06, 0.005), (0.06, 0.011), (0.054, 0.016), (0.0, 0.018)],
                       color=C.gold, seg=16, rot=(90, 0, 0), at=(0, fy - 0.004, 0.62)))
    # the dial: brass bezel, cream face, hands and four hour marks
    hy = -0.16
    cz = 1.69
    dial = lathe([(0.0, 0.0), (0.135, 0.0), (0.137, 0.008), (0.13, 0.016), (0.118, 0.018), (0.112, 0.012),
                  (0.0, 0.012)], color=C.cream, seg=24, rot=(90, 0, 0), at=(0, hy + 0.004, cz))
    recolor(dial, lambda c, n: C.gold if math.hypot(c.x, c.z - cz) > 0.11 else None)
    parts.append(dial)
    for k in range(4):
        a = math.radians(90 * k)
        parts.append(box((0.016, 0.006, 0.016), at=(0.088 * math.cos(a), hy - 0.009, cz + 0.088 * math.sin(a) - 0.008),
                         color=C.charcoal, bevel=0))
    for ang, ln, wd in ((-35, 0.08, 0.012), (60, 0.055, 0.016)):
        hand = box((wd, 0.005, ln), at=(0, 0, 0), color=C.charcoal, bevel=0)
        a = math.radians(ang)
        deform(hand, lambda p, a=a: p.__class__((p.x * math.cos(a) + p.z * math.sin(a), hy - 0.011 + p.y,
                                                 cz - p.x * math.sin(a) + p.z * math.cos(a))))
        parts.append(hand)
    parts.append(cyl(0.012, 0.008, at=(0, hy - 0.008, cz), color=C.gold, seg=10, bevel=0, rot=(90, 0, 0)))
    return parts


@model('upright_piano', ao=0.8)
def upright_piano(v):
    blk = C.black
    hi = tint(blk, 0.035)
    W = 1.48
    parts = [
        box((W, 0.6, 1.16), at=(0, 0.06, 0), color=blk, bevel=0.025, seg=2),                 # case
        box((1.502, 0.68, 0.06), at=(0, 0.04, 1.16), color=blk, bevel=0.02, seg=2),          # lid
        # raised panels on the lower and upper front
        box((1.1, 0.012, 0.42), at=(0, -0.24, 0.12), color=hi, bevel=0.01, seg=1),
        box((1.16, 0.012, 0.26), at=(0, -0.24, 0.86), color=hi, bevel=0.01, seg=1),
        # key bed and the fallboard folded back above the keys
        box((1.36, 0.2, 0.08), at=(0, -0.33, 0.62), color=blk, bevel=0.012, seg=1),
        box((1.36, 0.06, 0.1), at=(0, -0.21, 0.72), color=blk, bevel=0.015, seg=1),
    ]
    # cheeks either side of the keyboard
    for s in (-1, 1):
        parts.append(box((0.07, 0.24, 0.2), at=(s * 0.705, -0.31, 0.6), color=blk, bevel=0.025, seg=2))
        # toe blocks on the floor
        parts.append(box((0.08, 0.16, 0.09), at=(s * 0.62, -0.32, 0), color=blk, bevel=0.02, seg=1))
    # keys: one white bank and the black keys in their twos and threes
    kx0, kx1 = -0.665, 0.665
    parts.append(box((kx1 - kx0, 0.155, 0.03), at=(0, -0.335, 0.7), color=C.white, bevel=0.006, seg=1))
    nw = 28
    kw = (kx1 - kx0) / nw
    for i in range(nw - 1):
        if i % 7 in (2, 6):
            continue
        parts.append(box((kw * 0.55, 0.095, 0.03), at=(kx0 + (i + 1) * kw, -0.305, 0.725), color=blk, bevel=0))
    # brass pedals and a hinge strip
    for i in (-1, 0, 1):
        parts.append(box((0.04, 0.12, 0.022), at=(i * 0.07, -0.29, 0.06), color=C.gold, bevel=0.008, seg=1))
    parts.append(box((1.2, 0.008, 0.012), at=(0, -0.205, 0.81), color=C.gold, bevel=0))
    return parts


# ---------------------------------------------------------------- outdoors

# v1 built its wheels on the wrong axis (`ry` where the frame uses `rz`, house.js),
# so the bike's catalogue box is the wheels lying ACROSS it: 1.09 long and 0.706
# deep. A bicycle's depth is its handlebar: 0.6 here, inside the loader's 25%
# but short of the brief's 10%. Two wheels in 1.09 of length means small toy
# wheels under a tall city-bike frame: a cute shape, and the right one.
@model('bicycle', ao=0.6)
def bicycle(v):
    col = [C.red, C.teal, C.navy][v]
    R, tr = 0.228, 0.026
    zc = R + tr
    xw = 0.29
    parts = []
    for x in (-xw, xw):
        parts.append(torus(R, tr, at=(x, 0, zc), color=C.charcoal, seg=20, rseg=6, rot=(90, 0, 0)))
        parts.append(torus(R - 0.026, 0.009, at=(x, 0, zc), color=col, seg=20, rseg=4, rot=(90, 0, 0)))
        parts.append(cyl(0.028, 0.07, at=(x, 0.035, zc), color=C.steel, seg=10, bevel=0.004, rot=(90, 0, 0)))
        for k in range(3):
            a = math.radians(30 + 60 * k)
            dx, dz = math.cos(a) * (R - 0.03), math.sin(a) * (R - 0.03)
            parts.append(tube([(x - dx, 0, zc - dz), (x + dx, 0, zc + dz)], 0.005, color=C.steel, seg=4))
    BB = (0.0, 0, 0.235)
    S = (-0.135, 0, 0.66)
    H1, H2 = (0.165, 0, 0.71), (0.2, 0, 0.57)
    ft = 0.019
    for a, b in ((BB, S), (BB, H2), (S, H1)):
        parts.append(capsule(a, b, ft, color=col, seg=10, rings=1))
    for y in (-0.035, 0.035):
        parts.append(capsule((BB[0], y, BB[2]), (-xw, y, zc), 0.013, color=col, seg=8, rings=1))
        parts.append(capsule((S[0], y * 0.5, S[2]), (-xw, y, zc), 0.012, color=col, seg=8, rings=1))
        parts.append(capsule((H2[0], y * 0.6, H2[2]), (xw, y, zc), 0.014, color=col, seg=8, rings=1))
    parts.append(capsule(H2, H1, 0.026, color=col, seg=10, rings=1))
    # seat post and a plump saddle
    parts.append(capsule(S, (-0.165, 0, 0.84), 0.012, color=C.steel, seg=8, rings=1))
    sad = ball(0.06, at=(-0.175, 0, 0.865), color=C.charcoal, seg=10, scale=(1.55, 1.0, 0.45))
    deform(sad, lambda p: p.__class__((p.x, p.y * (1.0 - 0.55 * max(0.0, (p.x + 0.175) / 0.093)), p.z)))
    parts.append(sad)
    # stem and swept-back city handlebar, rubber grips, a brass bell
    parts.append(capsule(H1, (0.15, 0, 0.93), 0.015, color=C.steel, seg=8, rings=1))
    bar = [(0.04, -0.25, 0.975), (0.1, -0.2, 0.965), (0.145, -0.08, 0.94), (0.15, 0, 0.935),
           (0.145, 0.08, 0.94), (0.1, 0.2, 0.965), (0.04, 0.25, 0.975)]
    parts.append(tube(bar, 0.012, color=C.steel, seg=8))
    for s in (-1, 1):
        parts.append(capsule((0.075, s * 0.225, 0.97), (-0.005, s * 0.28, 0.98), 0.02, color=C.charcoal, seg=8, rings=2))
    parts.append(ball(0.022, at=(0.13, -0.13, 0.965), color=C.gold, seg=8, scale=(1, 1, 0.8)))
    # a wicker basket over the front wheel
    bk = box((0.2, 0.3, 0.15), at=(0.32, 0, 0.63), color=C.woodPale, bevel=0.015, seg=1)
    recolor(bk, lambda c, n: shade(C.woodPale, 0.45) if n.z > 0.9 and c.z > 0.77 else
            (shade(C.woodPale, 0.15) if abs(n.z) < 0.5 and 0.69 < c.z < 0.72 else None))
    parts.append(bk)
    parts.append(capsule((0.24, 0, 0.66), H2, 0.009, color=C.steel, seg=6, rings=1))
    # drivetrain: chainring, chain, cranks and pedals
    parts.append(cyl(0.07, 0.012, at=(BB[0], -0.045, BB[2]), color=C.steelDark, seg=12, bevel=0, rot=(90, 0, 0)))
    parts.append(tube([(0, -0.051, BB[2] + 0.068), (-xw, -0.051, zc + 0.03), (-xw, -0.051, zc - 0.03),
                       (0, -0.051, BB[2] - 0.068)], 0.006, color=C.charcoal, seg=4, closed=True))
    for s in (-1, 1):
        px, pz = s * 0.075, BB[2] - s * 0.075
        parts.append(capsule((0, s * -0.06, BB[2]), (px, s * -0.06, pz), 0.011, color=C.steel, seg=6, rings=1))
        parts.append(box((0.05, 0.08, 0.022), at=(px, s * -0.1, pz - 0.011), color=C.charcoal, bevel=0.006, seg=1))
    return parts


@model('doghouse', ao=0.6)
def doghouse(v):
    wall, roof, trim = C.woodRed, C.redDark, C.woodPale
    Wb, Db, Hw = 0.86, 0.96, 0.62
    # the walls as four stacked planks: the bevels read as board grooves, and
    # the extra vertices keep the eaves' baked shadow at the top of the wall
    parts = [box((Wb, Db, Hw / 4 + 0.002), at=(0, 0, i * Hw / 4), color=mixc(lin(wall), lin(C.woodDark), 0.08 * (i % 2)),
                 bevel=0.01, seg=1) for i in range(4)]
    parts.append(gable(Wb - 0.01, 0.34, Db - 0.01, at=(0, 0, Hw - 0.005), color=wall, bevel=0.01))
    # the roof: an inverted V with real thickness, overhanging all round
    hw, top, eave, t = 0.49, 0.995, 0.585, 0.055
    sec = [(-hw, eave - t), (-hw, eave), (0, top), (hw, eave), (hw, eave - t), (0, top - t * 1.25)]
    rf = extrude(list(reversed(sec)), 1.06, color=roof, bevel=0.012, rot=(90, 0, 0))
    deform(rf, lambda p: p.__class__((p.x, p.y + 0.53, p.z)))
    parts.append(rf)
    parts.append(cyl(0.028, 1.08, at=(0, 0.54, top - 0.01), color=shade(roof, 0.2), seg=8, bevel=0, rot=(90, 0, 0)))
    # shingle courses: shallow darker strips along each slope
    sl = math.atan2(top - eave, hw)
    for s in (-1, 1):
        for f in (0.33, 0.66):
            x0 = s * hw * (1 - f)
            z0 = eave + (top - eave) * f + 0.001
            sh = box((0.022, 1.06, 0.01), at=(0, 0, 0), color=shade(roof, 0.22), bevel=0)
            deform(sh, lambda p, s=s, x0=x0, z0=z0: p.__class__((x0 + p.x, p.y, z0 + p.z - s * p.x * math.tan(sl))))
            parts.append(sh)
    # corner posts in pale wood
    for sx in (-1, 1):
        for sy in (-1, 1):
            parts.append(box((0.06, 0.06, Hw), at=(sx * (Wb / 2 - 0.02), sy * (Db / 2 - 0.02), 0), color=trim,
                             bevel=0.012, seg=1))
    fy = -Db / 2

    def arch(w, h, n=6):
        r = w / 2
        pts = [(r, 0)]
        for i in range(n + 1):
            a = math.pi * i / n
            pts.append((r * math.cos(a), h - r + r * math.sin(a)))
        pts.append((-r, 0))
        return pts
    # an arched doorway with a pale frame
    fr = extrude(arch(0.42, 0.52), 0.016, color=trim, bevel=0.006, rot=(90, 0, 0))
    deform(fr, lambda p: p.__class__((p.x, p.y + fy + 0.004, p.z)))
    door = extrude(arch(0.32, 0.45), 0.02, color=C.charcoal, bevel=0.005, rot=(90, 0, 0))
    deform(door, lambda p: p.__class__((p.x, p.y + fy + 0.002, p.z)))
    parts += [fr, door]
    # a bone on the gable instead of a name board
    bz = 0.76
    parts.append(capsule((-0.075, fy - 0.006, bz), (0.075, fy - 0.006, bz), 0.02, color=C.cream, seg=8, rings=1))
    for sx in (-1, 1):
        for sz in (-1, 1):
            parts.append(ball(0.026, at=(sx * 0.085, fy - 0.008, bz + sz * 0.02), color=C.cream, seg=6))
    return parts


# ---------------------------------------------------------------- pets

def _eye(x, y, z, r, col=0x241f28):
    """A glossy dot eye with a highlight, facing -Y."""
    return [ball(r, at=(x, y, z), color=col, seg=8, scale=(1, 0.55, 1.25)),
            ball(r * 0.35, at=(x + r * 0.3, y - r * 0.45, z + r * 0.45), color=0xffffff, seg=6)]


@model('cat', ao=0.6)
def cat(v):
    body = [C.tangerine, C.charcoal, C.white][v]
    belly = C.lightgrey if v == 2 else C.cream
    stripe = shade(body, 0.28)
    parts = []
    tor = ball(0.075, at=(0, 0.025, 0.15), color=body, seg=14, scale=(0.95, 1.75, 0.9))

    def paint_body(c, n):
        if c.z < 0.115 or (c.y < -0.06 and c.z < 0.17 and n.y < -0.3):
            return belly
        if v == 0 and n.z > 0.2 and int((c.y + 0.2) / 0.035) % 2 == 0:
            return stripe
        return None
    recolor(tor, paint_body)
    parts.append(tor)
    for y in (-0.065, 0.1):
        for s in (-1, 1):
            parts.append(capsule((s * 0.042, y, 0.13), (s * 0.042, y, 0.03), 0.024, color=body, seg=8, rings=2))
            parts.append(ball(0.028, at=(s * 0.042, y - 0.01, 0.017), color=belly, seg=8, scale=(1, 1.25, 0.62)))
    hz, hy = 0.212, -0.15
    head = ball(0.08, at=(0, hy, hz), color=body, seg=14, scale=(1.1, 0.92, 0.88))
    if v == 0:
        recolor(head, lambda c, n: stripe if n.z > 0.55 and abs(c.x) < 0.035 and int((c.y + 0.2) / 0.02) % 2 == 0 else None)
    parts.append(head)
    for s in (-1, 1):
        ear = cyl(0.033, 0.062, at=(0, 0, 0), color=body, seg=6, r2=0.004, bevel=0)
        inner = cyl(0.02, 0.04, at=(0, -0.012, 0.004), color=C.pink, seg=6, r2=0.003, bevel=0)
        for e in (ear, inner):
            deform(e, lambda p, s=s: p.__class__((s * 0.052 + p.x + s * p.z * 0.25, hy + 0.005 + p.y + p.z * 0.1,
                                                  hz + 0.042 + p.z)))
            parts.append(e)
        # muzzle puffs, eyes and cheeks
        parts.append(ball(0.022, at=(s * 0.016, hy - 0.066, hz - 0.024), color=belly, seg=8, scale=(1, 0.7, 0.8)))
        eye_col = C.lime if v == 1 else 0x241f28
        parts += _eye(s * 0.034, hy - 0.064, hz + 0.012, 0.012, eye_col)
        if v == 1:
            parts.append(ball(0.006, at=(s * 0.034, hy - 0.071, hz + 0.012), color=0x241f28, seg=6, scale=(0.6, 0.5, 1.4)))
    parts.append(ball(0.009, at=(0, hy - 0.076, hz - 0.008), color=C.pink, seg=8, scale=(1.3, 0.8, 0.8)))
    # a question-mark tail
    tail = [(0, 0.15, 0.17), (0, 0.19, 0.19), (0, 0.212, 0.225), (0, 0.218, 0.26), (0, 0.21, 0.283), (0, 0.19, 0.292),
            (0, 0.172, 0.282)]
    tl = tube(tail, 0.017, color=body, seg=8, taper=lambda t: 1.0 - 0.25 * t)
    if v != 2:
        recolor(tl, lambda c, n: belly if c.y < 0.2 and c.z > 0.27 else None)   # a pale tail tip
    parts.append(tl)
    return parts


@model('dog_small', ao=0.6)
def dog_small(v):
    body = C.woodPale if v else C.brown
    belly = C.cream
    ear_col = shade(body, 0.3) if v else shade(body, 0.2)
    collar = C.red if v == 0 else C.blue
    parts = []
    tor = ball(0.09, at=(0, 0.04, 0.17), color=body, seg=14, scale=(0.98, 1.65, 0.88))
    recolor(tor, lambda c, n: belly if c.z < 0.12 or (c.y < -0.06 and n.y < -0.4 and c.z < 0.2) else None)
    parts.append(tor)
    for y in (-0.07, 0.14):
        for s in (-1, 1):
            parts.append(capsule((s * 0.052, y, 0.15), (s * 0.052, y, 0.035), 0.029, color=body, seg=8, rings=2))
            parts.append(ball(0.034, at=(s * 0.052, y - 0.012, 0.02), color=belly, seg=8, scale=(1, 1.3, 0.6)))
    hz, hy = 0.272, -0.15
    parts.append(ball(0.098, at=(0, hy, hz), color=body, seg=14, scale=(0.98, 0.95, 0.92)))
    # a long snout with a big black nose
    parts.append(ball(0.055, at=(0, hy - 0.092, hz - 0.035), color=belly, seg=10, scale=(0.9, 1.15, 0.75)))
    parts.append(ball(0.022, at=(0, hy - 0.152, hz - 0.018), color=0x241f28, seg=8, scale=(1.2, 0.8, 0.9)))
    for s in (-1, 1):
        parts += _eye(s * 0.04, hy - 0.083, hz + 0.028, 0.014)
        # floppy ears hanging at the sides of the head
        parts.append(ball(0.05, at=(s * 0.088, hy + 0.008, hz - 0.01), color=ear_col, seg=10, scale=(0.42, 0.75, 1.3),
                          rot=(0, s * 18, 0)))
    # collar with a brass tag
    parts.append(torus(0.068, 0.013, at=(0, hy + 0.075, hz - 0.075), color=collar, seg=16, rseg=5, rot=(62, 0, 0)))
    parts.append(ball(0.016, at=(0, hy + 0.012, hz - 0.12), color=C.gold, seg=8, scale=(1, 0.5, 1)))
    # a happy upright tail
    parts.append(tube([(0, 0.17, 0.2), (0, 0.215, 0.235), (0, 0.24, 0.28), (0, 0.24, 0.32), (0, 0.225, 0.345)],
                      0.02, color=body, seg=8, taper=lambda t: 1.0 - 0.35 * t))
    return parts


# ---------------------------------------------------------------- people

def figure(H, skin, shirt, pants, hair, style, adult=False, sleeves=False):
    """A cute toy person, front at -Y. H is the height to the top of the hair.

    Child and grown-up share the build; the grown-up is longer in the leg and
    torso, with a relatively smaller head."""
    parts = []
    shoe = 0x3a3238
    # head radius, hip/shoulder heights, leg radius and spacing, hand reach;
    # head depth, how far the shoes poke forward, and the torso's depth
    if adult:
        hr, hip, sh_z, leg_r, lx, hx = 0.132, 0.82, 1.27, 0.064, 0.076, 0.258
        hd, toe, shoe_l, tdep = 0.9, 1.0, 1.6, 0.8
    else:
        hr, hip, sh_z, leg_r, lx, hx = 0.124, 0.42, 0.735, 0.053, 0.058, 0.17
        hd, toe, shoe_l, tdep = 0.84, 0.5, 1.25, 0.68
    hz = H - hr - 0.012
    # legs and shoes
    for s in (-1, 1):
        parts.append(capsule((s * lx, 0, hip), (s * lx, 0, 0.085), leg_r, color=pants, seg=8, rings=2))
        parts.append(ball(leg_r * 1.15, at=(s * lx, -leg_r * toe, leg_r * 0.66), color=shoe, seg=8,
                          scale=(0.95, shoe_l, 0.62)))
    # an A-line torso, a touch flat front to back
    bw = 0.152 if adult else 0.118
    top = sh_z + 0.03
    tor = lathe([(0.0, hip - 0.04), (bw * 0.95, hip - 0.04), (bw, hip), (bw * 0.9, (hip + top) / 2), (bw * 0.95, top - 0.08),
                 (bw * 0.8, top - 0.02), (bw * 0.45, top), (0.0, top + 0.005)], color=shirt, seg=16)
    deform(tor, lambda p: p.__class__((p.x, p.y * tdep, p.z)))
    # trousers' waistband up to the hips
    recolor(tor, lambda c, n: pants if c.z < hip + 0.04 else None)
    parts.append(tor)
    parts.append(cyl(hr * 0.34, 0.08, at=(0, 0, top - 0.03), color=skin, seg=10, bevel=0.0))
    # arms: sleeve to the elbow, skin (or sleeve) to the wrist, round hands
    ax = bw * 0.95
    el = sh_z - (sh_z - hip) * 0.48
    wr = hip - 0.02
    for s in (-1, 1):
        sho = (s * ax, 0, sh_z - 0.02)
        elb = (s * (ax + 0.035), -0.005, el)
        wri = (s * (hx - 0.012), -0.012, wr)
        ar = 0.047 if adult else 0.04
        parts.append(capsule(sho, elb, ar, color=shirt, seg=8, rings=2))
        parts.append(capsule(elb, wri, ar * 0.88, color=shirt if sleeves else skin, seg=8, rings=2))
        parts.append(ball(ar * 1.1, at=(s * hx, -0.015, wr - 0.03), color=skin, seg=8))
    # the head: round, dot eyes, rosy cheeks and a little smile
    parts.append(ball(hr, at=(0, 0, hz), color=skin, seg=16, scale=(1.0, hd, 1.0)))
    fy = -hr * hd
    for s in (-1, 1):
        parts += _eye(s * hr * 0.36, fy * 0.93, hz + hr * 0.02, hr * 0.12)
        parts.append(ball(hr * 0.15, at=(s * hr * 0.6, fy * 0.8, hz - hr * 0.25), color=C.pink, seg=6,
                          scale=(1.1, 0.4, 0.8)))
        parts.append(ball(hr * 0.2, at=(s * hr * 0.98, 0.0, hz - hr * 0.05), color=skin, seg=6, scale=(0.6, 1, 1)))
    parts.append(torus(hr * 0.17, hr * 0.03, at=(0, fy * 0.97, hz - hr * 0.26), color=0x6a3a3a, seg=12, rseg=4,
                       rot=(-90, 0, 0), arc=180))
    # hair: a cap set back over the crown, then the variant's style
    cap = ball(hr * 1.07, at=(0, hr * 0.1, hz + hr * 0.1), color=hair, seg=16, scale=(1.0, hd, 0.98))
    deform(cap, lambda p: p.__class__((p.x, p.y, max(p.z, hz - hr * 0.35 + 0.5 * (p.y - hr * 0.1)))))
    parts.append(cap)
    # a soft fringe across the forehead
    parts.append(ball(hr * 0.75, at=(0, fy * 0.62, hz + hr * 0.55), color=hair, seg=10, scale=(1.2, 0.5, 0.45),
                      rot=(-25, 0, 0)))
    if style == 'pigtails':
        for s in (-1, 1):
            parts.append(ball(hr * 0.38, at=(s * hr * 1.05, hr * 0.25, hz + hr * 0.2), color=hair, seg=10,
                              scale=(0.85, 0.85, 1.3)))
            parts.append(ball(hr * 0.13, at=(s * hr * 0.93, hr * 0.2, hz + hr * 0.5), color=C.pink, seg=8))
    elif style == 'bun':
        parts.append(ball(hr * 0.42, at=(0, hr * 0.45, hz + hr * 0.85), color=hair, seg=12))
    elif style == 'bob':
        bob = ball(hr * 1.12, at=(0, hr * 0.1, hz), color=hair, seg=16, scale=(1.0, hd, 1.0))
        deform(bob, lambda p: p.__class__((p.x, max(p.y, -hr * 0.2), p.z)))
        parts.append(bob)
    elif style == 'long':
        parts.append(box((hr * 1.7, hr * 0.5, hr * 1.6), at=(0, hr * 0.62, hz - hr * 1.15), color=hair,
                         bevel=hr * 0.22, seg=2))
    elif style == 'tuft':
        parts.append(capsule((0, -hr * 0.1, hz + hr * 0.95), (hr * 0.15, -hr * 0.2, hz + hr * 1.15), hr * 0.12,
                             color=hair, seg=8, rings=1))
    return parts


@model('child', ao=0.55)
def child(v):
    styles = ['short', 'pigtails', 'tuft', 'bun']
    return figure(1.065, C.skin, SETS['shirt'][v % len(SETS['shirt'])],
                  SETS['plastic'][(v + 3) % len(SETS['plastic'])], SETS['hair'][v % len(SETS['hair'])], styles[v])


@model('adult', ao=0.55)
def adult(v):
    styles = ['short', 'bob', 'bun', 'long', 'tuft']
    return figure(1.593, [C.skin, C.skinTan, C.skinDeep][v % 3], SETS['shirt'][(v + 2) % len(SETS['shirt'])],
                  [C.navy, C.charcoal, C.brown][v % 3], SETS['hair'][(v + 1) % len(SETS['hair'])], styles[v],
                  adult=True, sleeves=v % 2 == 0)
