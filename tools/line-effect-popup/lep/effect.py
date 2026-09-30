"""エフェクト画像（480×480 APNG）: トークルームの背景いっぱいに流れるフェルトの演出。

スタンプ本体（静止画）はそのまま。背景側で「ハートがふわふわ」「紙吹雪」などが
つなぎ目なくループする（既定 14コマ×100ms=1.4秒 を2ループ）。
"""
from __future__ import annotations

import math

import numpy as np

from . import felt
from .anim import LoopTimeline, ease_out_back, ease_out_cubic, tri

SIZE = 480


class Flow:
    """列ごとに同じ形が等間隔で流れる → 1ループで1間隔ぶん進めば、つなぎ目なく戻る。"""

    def __init__(self, rng, n_cols, shapes, colors, size_range, gap_range, direction=(0, 1),
                 sway=10.0, spin=0.0, flip=False, tilt=0.0, alpha=1.0, xs=None, cycles=1):
        self.cols = []
        dx, dy = direction
        norm = math.hypot(dx, dy)
        self.u = (dx / norm, dy / norm)
        self.v = (-self.u[1], self.u[0])
        if xs is None:
            xs = (np.arange(n_cols) + rng.uniform(0.2, 0.8, n_cols)) / n_cols
            rng.shuffle(xs)
        for i in range(n_cols):
            size = int(rng.uniform(*size_range))
            gap = float(rng.uniform(*gap_range))
            self.cols.append(dict(
                x=float(xs[i]), size=size, gap=gap, phase=float(rng.uniform(0, 1)),
                shape=shapes[i % len(shapes)], color=colors[(i * 7) % len(colors)],
                sway_ph=float(rng.uniform(0, 6.28)), spin_dir=1 if rng.uniform() < 0.5 else -1,
                rot0=float(rng.uniform(-30, 30)), seed=int(rng.integers(0, 99)),
            ))
        self.sway, self.spin, self.flip, self.tilt, self.alpha = sway, spin, flip, tilt, alpha
        self.cycles = cycles

    def draw(self, cv, p):
        ux, uy = self.u
        vx, vy = self.v
        span = SIZE * 1.8
        perp = SIZE * (abs(ux) + abs(uy)) * 1.08  # 画面を横切る幅（斜めほど広く）
        for c in self.cols:
            g = c["gap"]
            sp = felt.felt(c["shape"], c["size"], c["color"], seed=c["seed"])
            # 流れと直交する方向の基準位置（画面の対角をカバー）
            base = (c["x"] - 0.5) * perp
            n = int(span / g) + 3
            for j in range(-1, n):
                s = (j + c["phase"] + p * self.cycles) * g - span / 2 - g
                x = SIZE / 2 + ux * s + vx * base
                y = SIZE / 2 + uy * s + vy * base
                w = 2 * math.pi * s / g
                x += vx * self.sway * math.sin(w + c["sway_ph"])
                y += vy * self.sway * math.sin(w + c["sway_ph"])
                m = c["size"]
                if x < -m or x > SIZE + m or y < -m or y > SIZE + m:
                    continue
                rot = c["rot0"] + self.tilt * math.sin(w + c["sway_ph"]) + self.spin * c["spin_dir"] * (s / g) * 360
                sy = abs(math.cos(w * 0.5 + c["sway_ph"])) * 0.8 + 0.2 if self.flip else 1.0
                felt.place(cv, sp, x, y, rot=rot, sy=sy, alpha=self.alpha)


def twinkle_field(cv, p, pts, shape="sparkle", colors=("yellow", "white"), cycles=2):
    for i, (x, y, s, ph) in enumerate(pts):
        k = math.sin(2 * math.pi * (p * cycles + ph))
        if k <= 0:
            continue
        felt.place(cv, felt.felt(shape, s, colors[i % len(colors)], seed=30 + i % 5), x, y,
                   scale=0.3 + 0.7 * k, rot=25 * k)


def scatter(rng, n, size_range, margin=30):
    pts = []
    tries = 0
    while len(pts) < n and tries < 5000:
        tries += 1
        x, y = rng.uniform(margin, SIZE - margin, 2)
        s = int(rng.uniform(*size_range))
        if all(math.hypot(x - a, y - b) > (s + t) * 0.8 for a, b, t, _ in pts):
            pts.append((float(x), float(y), s, float(rng.uniform(0, 1))))
    return pts


# ---- プリセット --------------------------------------------------------------

class Preset:
    def __init__(self, seed=0):
        self.rng = np.random.default_rng(seed)
        self.setup()

    def setup(self):
        pass

    def draw(self, cv, p):
        raise NotImplementedError


class HeartRise(Preset):
    """ハートがふわふわ昇る（ありがとう・だいすき）"""

    def setup(self):
        self.flow = Flow(self.rng, 8, ["heart"], ["pink", "rose", "red", "coral", "white"], (56, 90),
                         (230, 320), direction=(0, -1), sway=18, tilt=14)
        self.tw = scatter(self.rng, 6, (34, 50))

    def draw(self, cv, p):
        self.flow.draw(cv, p)
        twinkle_field(cv, p, self.tw, colors=("white", "pink"))


class Sakura(Preset):
    """桜の花びらがひらひら舞う"""

    def setup(self):
        self.petals = Flow(self.rng, 11, ["petal"], ["pink", "rose", "white"], (40, 62), (210, 290),
                           direction=(0.45, 1), sway=22, spin=0.5, flip=True)
        self.flowers = Flow(self.rng, 4, ["sakura"], ["pink", "white"], (70, 92), (360, 460),
                            direction=(0.45, 1), sway=12, spin=0.25)

    def draw(self, cv, p):
        self.flowers.draw(cv, p)
        self.petals.draw(cv, p)


class ConfettiFall(Preset):
    """カラフルな紙吹雪（おめでとう）"""

    def setup(self):
        cols = ["pink", "sky", "mint", "yellow", "lavender", "coral"]
        self.conf = Flow(self.rng, 13, ["confetti", "confetti", "circle", "star"], cols, (36, 56),
                         (190, 260), direction=(0.15, 1), sway=20, spin=1, flip=True)

    def draw(self, cv, p):
        self.conf.draw(cv, p)


class SparkleField(Preset):
    """キラキラがまたたく（おはよう・すごい）"""

    def setup(self):
        self.tw = scatter(self.rng, 13, (40, 80), margin=30)
        self.stars = Flow(self.rng, 5, ["star"], ["yellow", "cream"], (34, 48), (280, 360),
                          direction=(0.3, 1), sway=6, spin=0.5)

    def draw(self, cv, p):
        self.stars.draw(cv, p)
        twinkle_field(cv, p, self.tw, colors=("yellow", "white", "cream"))


class Bubbles(Preset):
    """シャボン玉がぽわぽわ"""

    def setup(self):
        self.flow = Flow(self.rng, 7, ["ring"], ["sky", "lavender", "mint", "white"], (56, 96), (250, 330),
                         direction=(0, -1), sway=14, alpha=0.9)
        self.tw = scatter(self.rng, 5, (28, 40))

    def draw(self, cv, p):
        self.flow.draw(cv, p)
        twinkle_field(cv, p, self.tw, colors=("white",))


class Paws(Preset):
    """肉球の足あとがトコトコ横切る（りょうかい・いってきます）"""

    def setup(self):
        self.trails = []
        for k, (y0, ang, col) in enumerate(((150, -0.25, "brown"), (330, -0.2, "shiba"))):
            self.trails.append((y0, ang, col, k * 0.5))

    def draw(self, cv, p):
        step = 84
        n = int(SIZE * 1.4 / step) + 2
        for y0, ang, col, ph in self.trails:
            ux, uy = math.cos(ang), math.sin(ang)
            vx, vy = -uy, ux
            head = ((p + ph) % 1.0) * n  # 何歩目まで進んだか
            sp = felt.felt("paw", 64, col, seed=11)
            for j in range(n):
                age = (head - j) % n
                if age > n * 0.55:
                    continue
                a = min(1.0, (n * 0.55 - age) / (n * 0.2))
                pop = ease_out_back(min(1.0, age / 1.0 + 0.001), 2.2)
                s = -SIZE * 0.2 + j * step
                side = 1 if j % 2 else -1
                x = s * ux + vx * side * 24
                y = y0 + s * uy + vy * side * 24
                felt.place(cv, sp, x, y, rot=-math.degrees(ang) - 90, scale=pop, alpha=a)


class Bones(Preset):
    """ほねっこと肉球がころころ降る（ごはん・おやつ）"""

    def setup(self):
        self.flow = Flow(self.rng, 10, ["bone", "paw", "bone", "heart"], ["cream", "brown", "white", "pink"],
                         (54, 80), (240, 320), direction=(0.1, 1), sway=10, spin=0.5)

    def draw(self, cv, p):
        self.flow.draw(cv, p)


class Night(Preset):
    """お星さまと流れ星、Zzz（おやすみ）"""

    def setup(self):
        self.tw = scatter(self.rng, 13, (30, 54), margin=24)
        self.z = [(360, 360, 0.0), (120, 250, 0.5)]

    def draw(self, cv, p):
        felt.place(cv, felt.felt("moon", 130, "yellow", seed=2), 380, 96, rot=6 * math.sin(2 * math.pi * p))
        twinkle_field(cv, p, self.tw, shape="star", colors=("yellow", "cream", "white"))
        # 流れ星（1ループに1本）
        u = (p * 2) % 1.0
        if u < 0.45:
            k = u / 0.45
            x, y = 40 + 300 * k, 60 + 140 * k
            for tail in range(4):
                felt.place(cv, felt.felt("circle", 16 - 3 * tail, "cream", seed=5, stitch=False),
                           x - tail * 20, y - tail * 9.3, alpha=(1 - k) * (1 - tail * 0.22))
            felt.place(cv, felt.felt("star", 50, "yellow", seed=6), x, y, rot=200 * k, alpha=1 - k * 0.6)
        for i, (x0, y0, ph) in enumerate(self.z):
            for j in range(3):
                u = (p * 2 + ph + j / 3) % 1.0
                felt.place(cv, felt.felt("glyph", 60 - j * 8, "lavender", seed=40 + j, text="Z"),
                           x0 + 40 * u, y0 - 90 * u, rot=15 - 20 * u,
                           alpha=min(1, u * 5) * min(1, (1 - u) * 4))


class ShockLines(Preset):
    """ガーン！集中線と「！」（えっ!?・びっくり）"""

    def draw(self, cv, p):
        f = int(p * 14)
        for i in range(22):
            ang = 2 * math.pi * i / 22 + 0.1 * ((i * 5 + f) % 3)
            ln = 1.0 + 0.5 * ((i * 7 + f * 3) % 4) / 3
            r = 250
            felt.place(cv, felt.felt("confetti", 90, "white" if i % 2 else "navy", seed=60 + i % 3, stitch=False),
                       SIZE / 2 + r * math.cos(ang), SIZE / 2 + r * math.sin(ang), sy=ln * 1.3, sx=0.45,
                       rot=-math.degrees(ang) + 90, alpha=0.85)
        for i, (x, y, ph) in enumerate(((70, 80, 0.0), (412, 96, 0.33), (400, 400, 0.66))):
            k = tri(p * 2 + ph)
            felt.place(cv, felt.felt("exclaim", 96, "red" if i != 1 else "orange", seed=80 + i), x, y,
                       scale=0.75 + 0.3 * k, rot=-12 + 20 * (i % 2) + 6 * math.sin(2 * math.pi * (p * 4 + ph)))


class Rain(Preset):
    """しとしと雨（かなしい・ごめんね）"""

    def setup(self):
        self.drops = Flow(self.rng, 13, ["drop"], ["sky", "blue", "white"], (28, 42), (150, 210),
                          direction=(-0.12, 1), sway=0, cycles=2)
        self.clouds = [(80, 56, 190), (300, 40, 210), (480, 70, 170)]

    def draw(self, cv, p):
        self.drops.draw(cv, p)
        for i, (x, y, s) in enumerate(self.clouds):
            felt.place(cv, felt.felt("cloud", s, "gray", seed=12 + i), x + 10 * math.sin(2 * math.pi * p + i), y)


class Fireworks(Preset):
    """フェルトの花火がポン（おめでとう・やったー）"""

    def setup(self):
        self.bursts = [(130, 140, 0.0, "pink"), (350, 120, 0.33, "yellow"), (250, 330, 0.66, "sky"),
                       (400, 360, 0.15, "mint"), (90, 380, 0.5, "lavender")]

    def draw(self, cv, p):
        for bx, by, ph, col in self.bursts:
            u = (p + ph) % 1.0
            if u > 0.7:
                continue
            k = u / 0.7
            r = 24 + 110 * ease_out_cubic(k)
            a = 1 - max(0, (k - 0.55) / 0.45)
            for i in range(10):
                ang = 2 * math.pi * i / 10
                shape = "star" if i % 2 else "circle"
                felt.place(cv, felt.felt(shape, 40 if i % 2 else 26, col if i % 2 else "white", seed=i),
                           bx + r * math.cos(ang), by + r * math.sin(ang) + 18 * k * k, alpha=a,
                           rot=90 * k, scale=1 - 0.3 * k)
            if k < 0.3:
                felt.place(cv, felt.felt("sparkle", 50, "white", seed=3), bx, by, scale=0.5 + k * 2, alpha=1 - k / 0.3)


class Snow(Preset):
    """ふわふわ雪（さむい・メリークリスマス）"""

    def setup(self):
        self.flow = Flow(self.rng, 12, ["circle", "sakura", "circle"], ["white", "white", "sky"], (24, 50),
                         (170, 240), direction=(0.08, 1), sway=14, spin=0.3)

    def draw(self, cv, p):
        self.flow.draw(cv, p)


class Music(Preset):
    """音符とハートがはずむ（たのしい・ルンルン）"""

    def setup(self):
        self.notes = Flow(self.rng, 8, ["glyph"], ["lavender", "sky", "pink", "mint"], (60, 86), (250, 330),
                          direction=(0.2, -1), sway=18, tilt=18)
        for c in self.notes.cols:
            c["sprite"] = felt.felt("glyph", c["size"], c["color"], seed=c["seed"],
                                    text="♪" if c["seed"] % 2 else "♫")

    def draw(self, cv, p):
        # glyph は text 引数が要るので Flow.draw を使わず自前で
        ux, uy = self.notes.u
        span = SIZE * 1.8
        vx, vy = self.notes.v
        perp = SIZE * (abs(ux) + abs(uy)) * 1.08
        for c in self.notes.cols:
            g = c["gap"]
            base = (c["x"] - 0.5) * perp
            for j in range(-1, int(span / g) + 3):
                s = (j + c["phase"] + p) * g - span / 2 - g
                w = 2 * math.pi * s / g
                x = SIZE / 2 + ux * s + vx * (base + 18 * math.sin(w + c["sway_ph"]))
                y = SIZE / 2 + uy * s + vy * (base + 18 * math.sin(w + c["sway_ph"]))
                if -60 < x < SIZE + 60 and -60 < y < SIZE + 60:
                    felt.place(cv, c["sprite"], x, y, rot=18 * math.sin(w + c["sway_ph"]))


PRESETS = {
    "heart_rise": HeartRise, "sakura": Sakura, "confetti": ConfettiFall, "sparkle": SparkleField,
    "bubbles": Bubbles, "paws": Paws, "bones": Bones, "night": Night, "shock": ShockLines,
    "rain": Rain, "fireworks": Fireworks, "snow": Snow, "music": Music,
}
DEFAULT_ORDER = ["heart_rise", "sparkle", "confetti", "paws", "night", "shock", "rain", "sakura",
                 "fireworks", "bubbles", "bones", "snow", "music"]


def render(preset: str, seed: int = 0, timeline: LoopTimeline | None = None):
    tl = timeline or LoopTimeline()
    pr = PRESETS[preset](seed=seed)
    frames = []
    for i, p in tl:
        cv = felt.new_canvas(SIZE, SIZE)
        pr.draw(cv, p)
        frames.append(felt.to_image(cv))
    return frames, tl.delays, tl.loops
