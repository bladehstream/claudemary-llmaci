"""House-stage props, modelled.

Frame reminder (see kit.py): Blender Z is up, X is the prop's width, and the
game's FRONT (+Z) is Blender -Y. Sizes are real metres, matched to
out/specs.json — the procedural box each archetype already occupies.
"""
import math
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


# ---------------------------------------------------------------- kitchen

@model('mug')
def mug(v):
    col = [C.white, C.red, C.blue, C.lime][v]
    R = 0.0435
    body = lathe([(0.036, 0.0), (0.040, 0.0005), (0.0418, 0.004), (0.0425, 0.02), (R, 0.092),
                  (R + 0.0008, 0.0955), (R - 0.0012, 0.097), (R - 0.004, 0.0955),
                  (R - 0.0042, 0.012), (R - 0.008, 0.0085), (0.0, 0.0085)],
                 color=col, seg=40, close_bottom=True)
    # a contrasting band and the coffee itself
    recolor(body, lambda c, n: (0xf6f1e6 if v else C.red) if 0.062 < c.z < 0.07 and math.hypot(c.x, c.y) > R - 0.002 else None)
    coffee = cyl(R - 0.0045, 0.002, at=(0, 0, 0.078), color=0x5a3720, seg=40, bevel=0.0005)
    handle = tube(arc_points(0.022, -75, 75, 16, center=(R + 0.002, 0, 0.052)), 0.0058, color=col, seg=12)
    return [body, coffee, handle]


@model('teapot')
def teapot(v):
    col = C.teal
    body = lathe([(0.0, 0.0), (0.042, 0.0), (0.046, 0.004), (0.062, 0.02), (0.073, 0.05), (0.072, 0.075),
                  (0.062, 0.098), (0.045, 0.112), (0.032, 0.116), (0.0, 0.116)], color=col, seg=40)
    foot = cyl(0.044, 0.006, at=(0, 0, 0.0), color=mixc(lin(col), (0, 0, 0), 0.25), seg=40)
    lid = lathe([(0.0, 0.112), (0.034, 0.112), (0.034, 0.118), (0.028, 0.126), (0.012, 0.132), (0.0, 0.133)],
                color=col, seg=32)
    knob = sphere(0.011, at=(0, 0, 0.139), color=C.cream if hasattr(C, 'cream') else 0xf3e2c0, seg=16, scale=(1, 1, 0.85))
    spout = tube([(0.06, 0, 0.045), (0.078, 0, 0.06), (0.09, 0, 0.083), (0.1, 0, 0.104), (0.105, 0, 0.112)],
                 0.0085, color=col, seg=12, taper=lambda t: 1.0 - 0.45 * t)
    handle = tube(arc_points(0.034, 95, 265, 18, center=(-0.072, 0, 0.068)), 0.0062, color=col, seg=12)
    # a painted band round the belly
    recolor(body, lambda c, n: 0xf7f1e3 if 0.052 < c.z < 0.062 else None)
    return [body, foot, lid, knob, spout, handle]


# ---------------------------------------------------------------- stationery

@model('pencil')
def pencil(v):
    col = [C.yellow, C.green, C.blue][v]
    r = 0.0042
    parts = []
    body = cyl(r, 0.150, at=(-0.0745, 0, r), color=col, seg=6, bevel=0.0006, rot=(0, 90, 0), smooth=10)
    # the hexagonal body: rotate so a flat sits on the floor
    deform(body, lambda p: p)
    parts.append(body)
    wood = cyl(r * 0.95, 0.016, at=(0.0755, 0, r), color=C.woodPale, seg=6, bevel=0, r2=0.0009, rot=(0, 90, 0), smooth=10)
    lead = cyl(0.0009, 0.004, at=(0.0915, 0, r), color=C.charcoal, seg=6, bevel=0, r2=0.0001, rot=(0, 90, 0))
    ferrule = cyl(r * 1.06, 0.009, at=(-0.0835, 0, r), color=C.steel, seg=16, bevel=0.0004, rot=(0, 90, 0))
    eraser = cyl(r * 1.0, 0.007, at=(-0.0905, 0, r), color=C.pink, seg=16, bevel=0.0012, rot=(0, 90, 0))
    for o in (wood, lead, ferrule, eraser):
        parts.append(o)
    # ferrule rings
    for x in (-0.0815, -0.0775):
        parts.append(torus(r * 1.07, 0.0005, at=(x, 0, r), color=C.steelDark, seg=16, rseg=6, rot=(0, 90, 0)))
    return parts


# ---------------------------------------------------------------- paper

@model('book', ao=0.6)
def book(v):
    col = SETS['book'][v % len(SETS['book'])]
    W, T, D = 0.15, 0.03, 0.21
    cover = 0.0018
    parts = [
        box((W, D, cover), at=(0, 0, 0), color=col, bevel=0.0006),
        box((W, D, cover), at=(0, 0, T - cover), color=col, bevel=0.0006),
        box((0.006, D, T), at=(-W / 2 + 0.003, 0, 0), color=col, bevel=0.0025, seg=3),
    ]
    pages = box((W - 0.008, D - 0.006, T - 2 * cover), at=(0.002, 0, cover), color=C.paper, bevel=0.0008)
    # page edges: faint lines, so the block reads as paper and not a brick
    recolor(pages, lambda c, n: mixc(lin(C.paper), (0.55, 0.5, 0.42), 0.18) if abs(n.z) < 0.5 and int(c.z * 900) % 2 else None)
    parts.append(pages)
    # a title band on the spine
    parts.append(box((0.0062, 0.05, T * 0.6), at=(-W / 2 + 0.0028, 0.04, T * 0.2), color=C.gold, bevel=0.0004))
    return parts


# ---------------------------------------------------------------- toys

@model('rubberduck')
def rubberduck(v):
    y = C.yellow
    body = sphere(0.03, at=(0, 0.004, 0.026), color=y, seg=32, scale=(1.05, 1.42, 0.86))
    deform(body, lambda p: p if p.z > 0.012 else p.__class__((p.x, p.y, 0.012 - (0.012 - p.z) * 0.45)))
    tail = sphere(0.012, at=(0, 0.04, 0.046), color=y, seg=16, scale=(1.1, 1.0, 1.4), rot=(-35, 0, 0))
    head = sphere(0.0205, at=(0, -0.016, 0.06), color=y, seg=28)
    beak = sphere(0.0105, at=(0, -0.036, 0.056), color=C.orange, seg=20, scale=(1.15, 1.4, 0.55))
    parts = [body, tail, head, beak]
    for s in (-1, 1):
        parts.append(sphere(0.0034, at=(s * 0.0085, -0.031, 0.066), color=C.black, seg=10))
        parts.append(sphere(0.0011, at=(s * 0.0092, -0.0338, 0.0675), color=0xffffff, seg=6))
        wing = sphere(0.013, at=(s * 0.029, 0.008, 0.032), color=mixc(lin(y), lin(C.orange), 0.12), seg=16,
                      scale=(0.45, 1.25, 0.8), rot=(-12, 0, 0))
        parts.append(wing)
    return parts


# ---------------------------------------------------------------- furniture

@model('chair', ao=0.85)
def chair(v):
    col = C.wood if v else C.woodDark
    dark = mixc(lin(col), (0, 0, 0), 0.18)
    parts = []
    for sx in (-1, 1):
        for sy in (-1, 1):
            parts.append(box((0.034, 0.034, 0.445), at=(sx * 0.187, sy * 0.187, 0), color=col, bevel=0.004))
            # tapered feet
            parts.append(box((0.03, 0.03, 0.015), at=(sx * 0.187, sy * 0.187, 0), color=dark, bevel=0.003))
    # stretchers between the legs
    for sy in (-1, 1):
        parts.append(box((0.36, 0.018, 0.022), at=(0, sy * 0.187, 0.14), color=col, bevel=0.003))
    parts.append(box((0.018, 0.36, 0.022), at=(-0.187, 0, 0.17), color=col, bevel=0.003))
    parts.append(box((0.018, 0.36, 0.022), at=(0.187, 0, 0.17), color=col, bevel=0.003))
    seat = box((0.44, 0.44, 0.032), at=(0, 0, 0.44), color=col, bevel=0.01, seg=3)
    # a gently dished seat
    deform(seat, lambda p: p.__class__((p.x, p.y, p.z - 0.006 * max(0.0, 1 - (p.x ** 2 + p.y ** 2) / 0.04) if p.z > 0.46 else p.z)))
    parts.append(seat)
    for sx in (-1, 1):
        post = box((0.03, 0.03, 0.48), at=(sx * 0.19, 0.2, 0.47), color=col, bevel=0.005)
        # posts lean back a touch
        deform(post, lambda p: p.__class__((p.x, p.y + (p.z - 0.47) * 0.08, p.z)))
        parts.append(post)
    for z, h in ((0.86, 0.09), (0.72, 0.06)):
        slat = box((0.38, 0.022, h), at=(0, 0.2 + (z - 0.47) * 0.08, z), color=col, bevel=0.005)
        deform(slat, lambda p: p.__class__((p.x, p.y + 0.012 * (1 - (p.x / 0.19) ** 2), p.z)))
        parts.append(slat)
    return parts
