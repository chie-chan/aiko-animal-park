"""ポップアップ画像（480×480 APNG）: 既存スタンプのキャラが飛び出し、背後でフェルトの背景が動く。"""
from __future__ import annotations

import math

import numpy as np
from PIL import Image
from scipy import ndimage

from . import felt
from .anim import (PopupTimeline, clamp, ease_in_out, ease_out_back, ease_out_bounce,
                   ease_out_cubic)

SIZE = 480
CX, CY = 240, 240          # 背景バッジの中心
R = 226                    # バッジ半径
CHAR_BOX = (410, 370)      # キャラの最大サイズ（実際はバッジ内に収まるよう自動縮小）


def prep_character(img: Image.Image, room: np.ndarray, margin: float = 18):
    """キャラを切り抜き、バッジの不透明部分に収まる最大サイズにする。

    room: バッジの不透明部分の「縁からの距離」マップ（480×480）。
    キャラの全画素が縁から margin px 以上内側に入る最大の倍率を探す。
    キャラがバッジからはみ出さなければ、登場後のコマはバッジを書き直さずに済み、1MB以内に収まりやすい。
    戻り値 (プリマルチ画像, 足元のy, 横のずれ)
    """
    img = img.convert("RGBA")
    bbox = img.getchannel("A").point(lambda a: 255 if a > 8 else 0).getbbox()
    img = img.crop(bbox)
    alpha = np.asarray(img.getchannel("A"))
    h, w = alpha.shape
    ys, xs = np.nonzero(alpha[::2, ::2] > 8)
    ys, xs = ys * 2.0 - h / 2, xs * 2.0 - w / 2
    ok = room >= margin

    def fits(k, ox, oy):
        px = np.round(CX + ox + xs * k).astype(int)
        py = np.round(CY + oy + ys * k).astype(int)
        if px.min() < 0 or py.min() < 0 or px.max() >= SIZE or py.max() >= SIZE:
            return False
        return bool(ok[py, px].all())

    kmax = min(CHAR_BOX[0] / w, CHAR_BOX[1] / h)
    best = (0.2, 0.0, 0.0)
    for oy in (0, -8, 8, -16, 16, 24):
        for ox in (0, -8, 8):
            lo, hi = best[0], kmax
            if not fits(lo, ox, oy):
                continue
            for _ in range(12):
                mid = (lo + hi) / 2
                lo, hi = (mid, hi) if fits(mid, ox, oy) else (lo, mid)
            if lo > best[0] + 1e-3:
                best = (lo, ox, oy)
    k, ox, oy = best
    img = img.resize((max(2, round(w * k)), max(2, round(h * k))), Image.LANCZOS)
    return felt.premultiply(img), CY + oy + img.height / 2, ox


# ---- キャラの動き ------------------------------------------------------------
# 戻り値: dx, dy（px）, sx, sy（足元基準の伸縮）, rot（度）, alpha

def m_pop(t, q, tau):
    s = 0.25 + 0.75 * ease_out_back(q, 1.2)
    sq = 0.10 * math.sin(math.pi * q)
    # 小さく2回はねて、あとは止まる（止まっている間は差分ゼロ＝容量が減る）
    h = abs(math.sin(math.pi * tau / 0.33)) if 0 < tau < 0.66 else 0
    return dict(dy=-14 * h, sx=s * (1 + sq), sy=s * (1 - sq))


def m_bounce(t, q, tau):
    if tau <= 0:
        y = -300 * (1 - ease_out_bounce(q))
        return dict(dy=y, sx=1 + 0.06 * (q > 0.8), sy=1 - 0.06 * (q > 0.8))
    h = math.sin(math.pi * ((tau / 0.5) % 1.0))
    land = max(0.0, 1 - h * 4)
    return dict(dy=-24 * h, sx=1 + 0.08 * land - 0.03 * h, sy=1 - 0.08 * land + 0.04 * h, shadow=1 - 0.5 * h)


def m_wobble(t, q, tau):
    d = m_pop(t, q, 0)
    d["rot"] = 6 * math.sin(2 * math.pi * tau / 0.85) if tau > 0 else -10 * (1 - q)
    d["anchor_center"] = True
    return d


def m_heartbeat(t, q, tau):
    d = m_pop(t, q, 0)
    if tau > 0:
        x = (tau / 0.8) % 1.0
        beat = math.exp(-((x - 0.1) / 0.06) ** 2) + 0.7 * math.exp(-((x - 0.32) / 0.06) ** 2)
        d["sx"] *= 1 + 0.07 * beat
        d["sy"] *= 1 + 0.07 * beat
    return d


def m_spin(t, q, tau):
    s = 0.2 + 0.8 * ease_out_back(q, 1.8)
    rot = -360 * (1 - ease_out_cubic(q))
    h = abs(math.sin(2 * math.pi * tau / 0.9)) if tau > 0 else 0
    return dict(rot=rot, sx=s, sy=s, dy=-8 * h, anchor_center=True)


def m_slam(t, q, tau):
    if tau <= 0:
        if q < 0.5:
            k = q / 0.5
            s = 1.9 - 0.9 * ease_in_out(k)
            return dict(sx=s, sy=s, alpha=0.35 + 0.65 * k, anchor_center=True)
        k = (q - 0.5) / 0.5
        sq = 0.07 * math.sin(math.pi * k)
        return dict(sx=1 + sq, sy=1 - sq)
    e = math.exp(-tau / 0.25)
    return dict(dx=6 * e * math.sin(tau * 60), sx=1 + 0.03 * math.sin(2 * math.pi * tau / 1.1),
                sy=1 - 0.03 * math.sin(2 * math.pi * tau / 1.1))


def m_shake(t, q, tau):
    d = m_pop(t, q, 0)
    if tau > 0:
        x = (tau / 0.75) % 1.0
        env = math.exp(-x / 0.18)
        d["dx"] = 11 * env * math.sin(tau * 70)
        d["rot"] = 3 * env * math.sin(tau * 55)
        d["dy"] = -14 * env
    return d


def m_float(t, q, tau):
    d = m_pop(t, q, 0)
    d["dy"] = -12 * math.sin(2 * math.pi * tau / 1.6) if tau > 0 else 0
    d["rot"] = 4 * math.sin(2 * math.pi * tau / 1.6 + 1.0) if tau > 0 else 0
    return d


def m_droop(t, q, tau):
    k = ease_out_cubic(q)
    d = dict(dy=-60 * (1 - k), alpha=0.3 + 0.7 * k, sx=0.9 + 0.1 * k, sy=0.9 + 0.1 * k)
    if tau > 0:
        s = math.sin(2 * math.pi * tau / 1.2)
        d.update(rot=3 * s, sy=1 - 0.035 * (1 + s) / 2, sx=1 + 0.02 * (1 + s) / 2)
    return d


def m_peek(t, q, tau):
    d = dict(dy=260 * (1 - ease_out_back(q, 1.6)))
    if tau > 0:
        d["rot"] = 6 * math.sin(2 * math.pi * tau / 1.0)
    return d


# 動きの大きさに応じて、バッジの縁から空ける余白（px）
MOTION_MARGIN = {"bounce": 26, "wobble": 22, "heartbeat": 16, "shake": 24, "float": 14, "spin": 12,
                 "slam": 18, "peek": 20, "droop": 10, "pop": 12}

MOTIONS = {
    "pop": m_pop, "bounce": m_bounce, "wobble": m_wobble, "heartbeat": m_heartbeat,
    "spin": m_spin, "slam": m_slam, "shake": m_shake, "float": m_float, "droop": m_droop,
    "peek": m_peek,
}


# ---- 背景シーン -------------------------------------------------------------
# 容量（1個1MB以下）を守るための約束:
#   * キャラは大きなバッジ（半径 R）の内側に収める
#   * 登場後に動かすものはバッジの内側だけ（不透明な上での変化は差分が小さく済む）
#   * バッジの外の飾りは登場演出で出して、その後は止める



def badge_scale(t):
    # 3コマで「ポン」と出て、あとは完全に静止（以降のコマはバッジを書き直さずに済む）
    if t < 0.05:
        return 0.6
    if t < 0.11:
        return 1.06
    return 1.0


def inner_rise(cv, parts, t, shape, cols, period=1.6, up=True, fade_in=0.0, safe=R):
    """バッジ内を上昇（下降）する粒。parts: (dx, phase, size, sway)"""
    for i, (dx, ph, sz, sw) in enumerate(parts):
        rr = safe - sz * 0.8 - 12
        if abs(dx) >= rr:
            continue
        hh = math.sqrt(rr * rr - dx * dx)
        u = (t / period + ph) % 1.0
        y = CY + hh - 2 * hh * u if up else CY - hh + 2 * hh * u
        a = min(1, u * 6) * min(1, (1 - u) * 6) * clamp((t - fade_in) / 0.2)
        x = CX + dx + 8 * math.sin(sw + u * 6)
        felt.place(cv, felt.felt(shape, int(sz), cols[i % len(cols)], seed=i), x, y,
                   rot=14 * math.sin(sw + u * 5), alpha=a)


def twinkles(cv, pts, t, period=0.7, color="yellow", shape="sparkle", start=0.0):
    for i, (x, y, s, ph) in enumerate(pts):
        k = math.sin(2 * math.pi * ((t - start) / period + ph))
        if k <= 0 or t < start:
            continue
        sp = felt.felt(shape, s, color, seed=50 + i)
        felt.place(cv, sp, x, y, scale=0.35 + 0.65 * k, rot=20 * k)


def pop_in(cv, sprite, x, y, t, t0=0.0, rot=0.0, late=False):
    """外側の飾り: バッジと同じ最初の3コマでポンと出て、その後は止まる。

    バッジの外で動くものがあると、そのコマは全面を書き直すことになり容量が跳ね上がるため。
    late=True のものは1コマ遅れて出る（少しだけ時間差をつける）。t0 は互換用で未使用。
    """
    if t < 0.05 or (late and t < 0.11):
        return
    felt.place(cv, sprite, x, y, scale=0.75 if t < 0.11 else 1.0, rot=rot)


class Scene:
    motion = "pop"
    colors: dict = {}
    badge_shape = "patch"
    badge_kw: dict = {}

    def __init__(self, seed=0, colors=None):
        self.rng = np.random.default_rng(seed)
        self.seed = seed
        self.c = dict(self.colors)
        self.c.update(colors or {})
        self.safe = R

    def badge_sprite(self, color=None):
        return felt.felt(self.badge_shape, 2 * R + 20, color or self.c["badge"], seed=self.seed, **self.badge_kw)

    def badge(self, cv, t, rot=0.0, color=None):
        felt.place(cv, self.badge_sprite(color), CX, CY, scale=badge_scale(t), rot=rot)

    def room(self) -> np.ndarray:
        """静止後のバッジの不透明部分について、各画素の縁からの距離。"""
        cv = felt.new_canvas(SIZE, SIZE)
        self.badge(cv, 1.0)
        return ndimage.distance_transform_edt(cv[..., 3] >= 0.999)

    def rim(self, ang: float, out: float = 4.0) -> tuple[float, float]:
        """中心から角度 ang 方向に見たバッジの縁の位置（外側の飾りを並べる用）。"""
        if not hasattr(self, "_room"):
            self._room = self.room()
        r = 60.0
        while r < 300:
            x, y = CX + r * math.cos(ang), CY + r * math.sin(ang)
            if not (0 <= x < SIZE and 0 <= y < SIZE) or self._room[int(y), int(x)] <= 0:
                break
            r += 1.0
        return CX + (r + out) * math.cos(ang), CY + (r + out) * math.sin(ang)

    def safe_radius(self) -> float:
        """バッジ中心から、不透明（alpha=255）でなくなるまでの距離。"""
        cv = felt.new_canvas(SIZE, SIZE)
        self.badge(cv, 1.0)
        opaque = cv[..., 3] >= 0.999
        return float(ndimage.distance_transform_edt(opaque)[CY, CX])

    def back(self, cv, t, q, tau):
        self.badge(cv, t)

    def front(self, cv, t, q, tau):
        pass


class Hearts(Scene):
    motion = "heartbeat"
    colors = {"badge": "pink", "a": "rose", "b": "red", "c": "white"}

    def __init__(self, *a, **k):
        super().__init__(*a, **k)
        r = self.rng
        self.parts = [(float(r.uniform(-200, 200)), float(r.uniform(0, 1)), int(r.integers(26, 44)),
                       float(r.uniform(0, 6.28))) for _ in range(9)]

    def back(self, cv, t, q, tau):
        self.badge(cv, t)
        inner_rise(cv, self.parts, t, "heart", [self.c["a"], self.c["c"], self.c["b"]], fade_in=0.15, safe=self.safe)

    def front(self, cv, t, q, tau):
        for i, (x, y, t0, sz) in enumerate(((58, 92, 0.1, 78), (424, 118, 0.22, 64), (438, 392, 0.3, 58),
                                            (44, 380, 0.18, 52))):
            pop_in(cv, felt.felt("heart", sz, self.c["a"] if i % 2 else self.c["b"], seed=90 + i),
                   x, y, t, rot=(-1) ** i * 14, late=i % 2 == 1)


class Sunburst(Scene):
    motion = "bounce"
    colors = {"badge": "cream", "rays": "yellow", "rim": "orange", "spark": "white"}
    badge_shape = "circle"
    badge_kw = {"stitch": False}

    def back(self, cv, t, q, tau):
        s = badge_scale(t)
        self.badge(cv, t)
        # 光線は2コマごとに回す（容量節約とコマ撮り感）
        step = int(max(0.0, tau) / 0.44) if tau > 0 else 0
        felt.place(cv, felt.felt_wedges(2 * R - 16, 18, self.c["rays"], seed=self.seed), CX, CY,
                   scale=s, rot=-60 * s if tau <= 0 else -60 - 10 * step)
        felt.place(cv, felt.felt("ring", 2 * R + 6, self.c["rim"], seed=self.seed + 1, thickness=0.045),
                   CX, CY, scale=s)

    def front(self, cv, t, q, tau):
        for i, (x, y, t0, sz) in enumerate(((56, 70, 0.12, 60), (428, 64, 0.2, 50), (440, 404, 0.28, 54),
                                            (40, 410, 0.34, 44))):
            pop_in(cv, felt.felt("sparkle", sz, "yellow" if i % 2 else self.c["spark"], seed=60 + i),
                   x, y, t, late=i % 2 == 1)


class Confetti(Scene):
    motion = "spin"
    colors = {"badge": "yellow", "inner": "cream"}
    badge_shape = "burst"
    badge_kw = {"spikes": 18, "inner": 0.86}
    confetti_cols = ["pink", "sky", "mint", "yellow", "lavender", "coral"]

    def __init__(self, *a, **k):
        super().__init__(*a, **k)
        r = self.rng
        self.burst = []
        for i in range(22):
            ang = 2 * math.pi * i / 22 + float(r.uniform(-0.1, 0.1))
            self.burst.append(dict(ang=ang, dist=float(r.uniform(150, 250)), spin=float(r.uniform(-500, 500)),
                                   shape="confetti" if i % 3 else "star", size=int(r.integers(26, 40)),
                                   col=self.confetti_cols[i % 6]))
        self.fall = [(float(r.uniform(-170, 170)), float(r.uniform(0, 1)), int(r.integers(20, 30)),
                      float(r.uniform(0, 6.28))) for _ in range(12)]

    def badge(self, cv, t, rot=0.0, color=None):
        s = badge_scale(t)
        felt.place(cv, self.badge_sprite(), CX, CY, scale=s, rot=-20)
        felt.place(cv, felt.felt("circle", 2 * R - 8, self.c["inner"], seed=self.seed + 1), CX, CY, scale=s)

    def back(self, cv, t, q, tau):
        self.badge(cv, t)
        inner_rise(cv, self.fall, t, "confetti", self.confetti_cols, period=1.4, up=False, fade_in=0.2, safe=self.safe)

    def front(self, cv, t, q, tau):
        # バッジのまわりに紙吹雪がポポポンと増えていく（出たあとは止まる）
        for i, p in enumerate(self.burst):
            x, y = self.rim(p["ang"], 2 + (p["dist"] - 150) * 0.12)
            pop_in(cv, felt.felt(p["shape"], p["size"], p["col"], seed=i), x, y, t,
                   rot=p["spin"] * 0.2, late=i % 2 == 1)


class Slam(Scene):
    motion = "slam"
    colors = {"badge": "mint", "ring": "white", "star": "yellow"}
    impact = 0.12

    def back(self, cv, t, q, tau):
        if t >= self.impact:
            felt.place(cv, self.badge_sprite(), CX, CY, scale=1.08 if t < self.impact + 0.05 else 1.0)
        twinkles(cv, [(150, 118, 34, 0.0), (336, 124, 30, 0.35), (126, 300, 28, 0.6), (360, 300, 30, 0.8)],
                 t, 0.66, self.c["ring"], start=0.4)

    def front(self, cv, t, q, tau):
        # 着地の衝撃で、縁に星がバババッと並ぶ
        for i in range(10):
            ang = 2 * math.pi * i / 10 + 0.3
            pop_in(cv, felt.felt("star", 50 if i % 2 else 40, self.c["star"] if i % 2 else "white", seed=70 + i),
                   *self.rim(ang, 2), t - 0.06,
                   rot=i * 17, late=i % 2 == 1)


class Night(Scene):
    motion = "float"
    colors = {"badge": "navy", "moon": "yellow", "star": "yellow", "z": "lavender"}

    def back(self, cv, t, q, tau):
        s = badge_scale(t)
        self.badge(cv, t)
        felt.place(cv, felt.felt("moon", 92, self.c["moon"], seed=self.seed + 1), 90, 92,
                   scale=s, rot=8 * math.sin(t * 2.6))
        twinkles(cv, [(318, 110, 30, 0.0), (372, 200, 22, 0.3), (96, 250, 24, 0.55), (262, 68, 18, 0.75),
                      (214, 82, 20, 0.15), (380, 300, 24, 0.45)], t, 0.9, self.c["star"], "star")
        for i in range(3):  # Zzz はバッジの内側で
            u = ((t - 0.3) / 1.2 - i / 3) % 1.0
            if t < 0.3 + i * 0.4:
                continue
            felt.place(cv, felt.felt("glyph", 54 - i * 8, self.c["z"], seed=80 + i, text="Z"),
                       330 + 30 * u, 200 - 110 * u, rot=15 - 25 * u,
                       scale=ease_out_back(clamp(u * 4)), alpha=min(1, (1 - u) * 4))


class Shock(Scene):
    motion = "shake"
    colors = {"badge": "orange", "a": "yellow", "line": "white", "mark": "red"}
    badge_shape = "burst"
    badge_kw = {"spikes": 12, "inner": 0.8}

    def badge(self, cv, t, rot=0.0, color=None):
        s = badge_scale(t)
        felt.place(cv, self.badge_sprite(), CX, CY, scale=s)
        felt.place(cv, felt.felt("circle", 2 * R - 8, self.c["a"], seed=self.seed + 1), CX, CY, scale=s)

    def back(self, cv, t, q, tau):
        self.badge(cv, t)
        flip = int(max(0.0, tau) / 0.22) % 2 if tau > 0 else 0
        for i in range(12):  # 集中線（バッジ内）
            ang = 2 * math.pi * i / 12 + 0.26
            felt.place(cv, felt.felt("confetti", 40, self.c["line"], seed=60 + i % 3, stitch=False),
                       CX + 158 * math.cos(ang), CY + 158 * math.sin(ang), sy=0.9 + 0.25 * ((i + flip) % 2),
                       sx=0.4, rot=-math.degrees(ang) + 90, alpha=0.9 if t >= 0.11 else 0.0)

    def front(self, cv, t, q, tau):
        pop_in(cv, felt.felt("exclaim", 96, self.c["mark"], seed=85), 424, 70, t, rot=-14, late=True)


class Rain(Scene):
    motion = "droop"
    colors = {"badge": "#CFE3F4", "cloud": "gray", "drop": "sky"}
    badge_shape = "cushion"

    def __init__(self, *a, **k):
        super().__init__(*a, **k)
        self.drops = [(float(self.rng.uniform(-150, 150)), float(self.rng.uniform(0, 1)), 26, 0.0)
                      for _ in range(12)]

    def back(self, cv, t, q, tau):
        self.badge(cv, t)
        inner_rise(cv, self.drops, t, "drop", [self.c["drop"]], period=0.66, up=False, fade_in=0.2, safe=self.safe)

    def front(self, cv, t, q, tau):
        for j, (x, y, sz) in enumerate(((92, 84, 128), (392, 70, 112))):
            pop_in(cv, felt.felt("cloud", sz, self.c["cloud"], seed=self.seed + 5 + j), x, y, t, late=j == 1)


class Flowers(Scene):
    motion = "wobble"
    colors = {"badge": "cream"}
    badge_shape = "scallop"
    flower_cols = ["pink", "yellow", "lavender", "sky", "coral"]

    def __init__(self, *a, **k):
        super().__init__(*a, **k)
        r = self.rng
        self.petals = [(float(r.uniform(-190, 190)), float(r.uniform(0, 1)), int(r.integers(22, 32)),
                        float(r.uniform(0, 6.28))) for _ in range(10)]

    def back(self, cv, t, q, tau):
        self.badge(cv, t)
        inner_rise(cv, self.petals, t, "petal", ["pink", "rose"], period=1.5, up=False, fade_in=0.2, safe=self.safe)

    def front(self, cv, t, q, tau):
        n = 12
        for i in range(n):  # 縁取りの花輪（登場でくるっと並び、その後は止まる）
            ang = 2 * math.pi * i / n
            pop_in(cv, felt.felt("sakura" if i % 2 else "flower", 64, self.flower_cols[i % 5], seed=20 + i),
                   *self.rim(ang, -4), t, rot=i * 23, late=i % 2 == 1)


class Sparkle(Scene):
    motion = "pop"
    colors = {"badge": "sky", "spark": "white"}

    def back(self, cv, t, q, tau):
        self.badge(cv, t)
        twinkles(cv, [(128, 116, 40, 0.0), (360, 130, 32, 0.4), (366, 350, 36, 0.7), (112, 356, 30, 0.2)],
                 t, 0.7, self.c["spark"])

    def front(self, cv, t, q, tau):
        for i, (x, y, t0, sz) in enumerate(((48, 204, 0.14, 52), (438, 250, 0.22, 56), (240, 26, 0.3, 40))):
            pop_in(cv, felt.felt("sparkle", sz, "yellow", seed=70 + i), x, y, t, late=i % 2 == 1)


SCENES = {
    "hearts": Hearts, "sunburst": Sunburst, "confetti": Confetti, "slam": Slam, "night": Night,
    "shock": Shock, "rain": Rain, "flowers": Flowers, "sparkle": Sparkle,
}
DEFAULT_ORDER = ["hearts", "sunburst", "confetti", "slam", "night", "shock", "rain", "flowers", "sparkle"]


def _snap(m: dict) -> dict:
    """動きの値を丸める（静止中のフレームを完全に同一にして容量を節約）。"""
    out = dict(m)
    for k, step in (("dx", 1.0), ("dy", 1.0), ("sx", 0.01), ("sy", 0.01), ("rot", 0.5),
                    ("alpha", 0.02), ("shadow", 0.02)):
        if k in out:
            out[k] = round(out[k] / step) * step
    return out


def render(char_img: Image.Image, scene: str, motion: str | None = None, seed: int = 0,
           colors: dict | None = None, timeline: PopupTimeline | None = None, hold: int = 2):
    """hold: 登場後のキャラの動きを何コマごとに更新するか（2 = コマ撮り風。容量が約半分になる）"""
    tl = timeline or PopupTimeline()
    sc = SCENES[scene](seed=seed, colors=colors)
    mname = motion or sc.motion
    mfun = MOTIONS[mname]
    sc.safe = sc.safe_radius()
    ch, ground, xoff = prep_character(char_img, sc.room(), MOTION_MARGIN.get(mname, 18))
    shadow = felt.felt("circle", 200, "brown", stitch=False, seed=1)
    frames = []
    for i, t, q in tl:
        tau = t - tl.intro_s
        cv = felt.new_canvas(SIZE, SIZE)
        sc.back(cv, t, q, tau)
        if tau > 0 and hold > 1:
            k = i - tl.intro_frames
            ct = tl.intro_s + sum(tl.delays[tl.intro_frames:tl.intro_frames + k - k % hold]) / 1000
        else:
            ct = t
        m = _snap(mfun(ct, q, ct - tl.intro_s))
        sx, sy = m.get("sx", 1.0), m.get("sy", 1.0)
        sh = m.get("shadow", 1.0)
        felt.place(cv, shadow, CX + xoff + m.get("dx", 0), ground - 4, sx=1.5 * sx * sh, sy=0.16 * sh,
                   alpha=0.22 * m.get("alpha", 1.0) * min(1.0, sx))
        if m.get("anchor_center"):
            felt.place(cv, ch, CX + xoff + m.get("dx", 0), ground - ch.height / 2 + m.get("dy", 0),
                       sx=sx, sy=sy, rot=m.get("rot", 0), alpha=m.get("alpha", 1.0))
        else:
            felt.place(cv, ch, CX + xoff + m.get("dx", 0), ground + m.get("dy", 0), sx=sx, sy=sy,
                       rot=m.get("rot", 0), alpha=m.get("alpha", 1.0), anchor=(0.5, 1.0))
        sc.front(cv, t, q, tau)
        frames.append(felt.to_image(cv))
    return frames, tl.delays, tl.loops
