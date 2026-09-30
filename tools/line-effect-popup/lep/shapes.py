"""フェルトパーツの形（マスク）を作る。

すべて `mask(name, size, **kw)` で (size, size) の float32 配列 [0,1] を返す。
ポリゴンは SS 倍で描いてから縮小してアンチエイリアスする。
"""
from __future__ import annotations

import math

import numpy as np
from PIL import Image, ImageDraw, ImageFont

SS = 4  # マスク描画時のスーパーサンプリング倍率

FONT_CANDIDATES = [
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Black.ttc",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
    "/usr/share/fonts/truetype/fonts-japanese-gothic.ttf",
    "/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf",
    "C:/Windows/Fonts/meiryob.ttc",
    "C:/Windows/Fonts/YuGothB.ttc",
    "/System/Library/Fonts/ヒラギノ丸ゴ ProN W4.ttc",
]


def find_font(size: int) -> ImageFont.FreeTypeFont:
    for path in FONT_CANDIDATES:
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    return ImageFont.load_default()


def _canvas(size: int):
    im = Image.new("L", (size * SS, size * SS), 0)
    return im, ImageDraw.Draw(im)


def _finish(im: Image.Image, size: int) -> np.ndarray:
    return np.asarray(im.resize((size, size), Image.LANCZOS), dtype=np.float32) / 255.0


def _poly(draw, pts, size, fill=255):
    s = size * SS
    draw.polygon([(x * s, y * s) for x, y in pts], fill=fill)


def _ellipse(draw, cx, cy, rx, ry, size, fill=255):
    s = size * SS
    draw.ellipse([(cx - rx) * s, (cy - ry) * s, (cx + rx) * s, (cy + ry) * s], fill=fill)


# ---- 形の定義（座標は 0..1 の正規化） ------------------------------------

def heart(draw, size):
    pts = []
    for i in range(240):
        t = 2 * math.pi * i / 240
        x = 16 * math.sin(t) ** 3
        y = 13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)
        pts.append((0.5 + x / 36.0, 0.47 - y / 36.0))
    _poly(draw, pts, size)


def star(draw, size, points=5, inner=0.48, round_=0.0):
    pts = []
    n = points * 2
    for i in range(n):
        a = -math.pi / 2 + math.pi * i / points
        r = 0.47 if i % 2 == 0 else 0.47 * inner
        pts.append((0.5 + r * math.cos(a), 0.52 + r * math.sin(a)))
    _poly(draw, pts, size)


def sparkle(draw, size):
    # 4点のキラ（内側に反った辺）: アステロイド曲線を少し太らせたもの
    p = 3.0
    pts = []
    for i in range(400):
        a = 2 * math.pi * i / 400
        c, s = math.cos(a), math.sin(a)
        pts.append((0.5 + 0.48 * math.copysign(abs(c) ** p, c),
                    0.5 + 0.48 * math.copysign(abs(s) ** p, s)))
    _poly(draw, pts, size)
    _ellipse(draw, 0.5, 0.5, 0.09, 0.09, size)


def circle(draw, size):
    _ellipse(draw, 0.5, 0.5, 0.48, 0.48, size)


def petal(draw, size):
    # 桜の花びら（先端に切れ込み）
    pts = []
    for i in range(200):
        t = i / 199
        y = 0.94 - 0.88 * t
        w = 0.3 * math.sin(math.pi * min(1.0, t * 1.05)) ** 0.7
        pts.append((0.5 + w, y))
    for i in range(200):
        t = 1 - i / 199
        y = 0.94 - 0.88 * t
        w = 0.3 * math.sin(math.pi * min(1.0, t * 1.05)) ** 0.7
        pts.append((0.5 - w, y))
    _poly(draw, pts, size)
    # 切れ込み
    _poly(draw, [(0.42, 0.0), (0.5, 0.17), (0.58, 0.0)], size, fill=0)


def sakura(draw, size):
    for k in range(5):
        a = -math.pi / 2 + 2 * math.pi * k / 5
        cx, cy = 0.5 + 0.22 * math.cos(a), 0.5 + 0.22 * math.sin(a)
        _ellipse(draw, cx, cy, 0.19, 0.19, size)
    _ellipse(draw, 0.5, 0.5, 0.2, 0.2, size)
    for k in range(5):  # 花びら先端の切れ込み
        a = -math.pi / 2 + 2 * math.pi * k / 5
        tx, ty = 0.5 + 0.43 * math.cos(a), 0.5 + 0.43 * math.sin(a)
        n = (math.cos(a), math.sin(a))
        p = (-n[1], n[0])
        _poly(draw, [(tx + 0.06 * p[0] + 0.05 * n[0], ty + 0.06 * p[1] + 0.05 * n[1]),
                     (tx - 0.03 * n[0], ty - 0.03 * n[1]),
                     (tx - 0.06 * p[0] + 0.05 * n[0], ty - 0.06 * p[1] + 0.05 * n[1])], size, fill=0)


def flower(draw, size, petals=6):
    for k in range(petals):
        a = 2 * math.pi * k / petals
        _ellipse(draw, 0.5 + 0.26 * math.cos(a), 0.5 + 0.26 * math.sin(a), 0.2, 0.2, size)
    _ellipse(draw, 0.5, 0.5, 0.24, 0.24, size)


def paw(draw, size):
    _ellipse(draw, 0.5, 0.68, 0.25, 0.2, size)
    for cx, cy in ((0.19, 0.38), (0.39, 0.2), (0.61, 0.2), (0.81, 0.38)):
        _ellipse(draw, cx, cy, 0.1, 0.12, size)


def bone(draw, size):
    s = size * SS
    draw.rounded_rectangle([0.2 * s, 0.4 * s, 0.8 * s, 0.6 * s], radius=0.06 * s, fill=255)
    for cx, cy in ((0.17, 0.37), (0.17, 0.63), (0.83, 0.37), (0.83, 0.63)):
        _ellipse(draw, cx, cy, 0.13, 0.13, size)


def drop(draw, size):
    pts = []
    for i in range(200):
        t = 2 * math.pi * i / 200
        x = 0.3 * math.sin(t) * (1 - math.cos(t)) ** 0.9 / 1.5
        y = -0.45 * math.cos(t)
        pts.append((0.5 + x * 1.35, 0.5 + y))
    _poly(draw, pts, size)
    _ellipse(draw, 0.5, 0.66, 0.27, 0.27, size)


def moon(draw, size):
    _ellipse(draw, 0.5, 0.5, 0.45, 0.45, size)
    _ellipse(draw, 0.68, 0.38, 0.36, 0.36, size, fill=0)


def cloud(draw, size):
    for cx, cy, r in ((0.3, 0.6, 0.18), (0.5, 0.45, 0.24), (0.7, 0.58, 0.19), (0.5, 0.64, 0.2)):
        _ellipse(draw, cx, cy, r, r, size)
    s = size * SS
    draw.rounded_rectangle([0.14 * s, 0.56 * s, 0.86 * s, 0.78 * s], radius=0.11 * s, fill=255)


def confetti(draw, size):
    s = size * SS
    draw.rounded_rectangle([0.3 * s, 0.1 * s, 0.7 * s, 0.9 * s], radius=0.08 * s, fill=255)


def burst(draw, size, spikes=14, inner=0.72):
    pts = []
    n = spikes * 2
    for i in range(n):
        a = -math.pi / 2 + math.pi * i / spikes
        jitter = 1.0 if i % 2 == 0 else inner
        r = 0.49 * jitter * (1.0 - 0.05 * ((i * 7) % 3))
        pts.append((0.5 + r * math.cos(a), 0.5 + r * math.sin(a)))
    _poly(draw, pts, size)


def ring(draw, size, thickness=0.08):
    _ellipse(draw, 0.5, 0.5, 0.48, 0.48, size)
    _ellipse(draw, 0.5, 0.5, 0.48 - thickness, 0.48 - thickness, size, fill=0)


def scallop(draw, size, bumps=22):
    # フチがもこもこした丸（バッジ）
    _ellipse(draw, 0.5, 0.5, 0.46, 0.46, size)
    for k in range(bumps):
        a = 2 * math.pi * k / bumps
        _ellipse(draw, 0.5 + 0.455 * math.cos(a), 0.5 + 0.455 * math.sin(a), 0.037, 0.037, size)


def leaf(draw, size):
    pts = []
    for i in range(200):
        t = 2 * math.pi * i / 200
        pts.append((0.5 + 0.22 * math.sin(t) * (1 + 0.1 * math.cos(t)), 0.5 - 0.46 * math.cos(t)))
    _poly(draw, pts, size)


def _rrect_points(cx, cy, hw, hh, r, n):
    """角丸長方形の周上に等間隔な n 点（正規化座標）。"""
    per = 4 * (2 * (hw - r)) + 2 * math.pi * r if hw == hh else 2 * (2 * (hw - r) + 2 * (hh - r)) + 2 * math.pi * r
    pts = []
    for i in range(n):
        d = per * i / n
        # 上辺 → 右上角 → 右辺 → 右下角 → 下辺 → 左下角 → 左辺 → 左上角
        for kind, length, fn in (
            ("l", 2 * (hw - r), lambda u: (cx - hw + r + u, cy - hh)),
            ("a", math.pi * r / 2, lambda u: (cx + hw - r + r * math.sin(u / r), cy - hh + r - r * math.cos(u / r))),
            ("l", 2 * (hh - r), lambda u: (cx + hw, cy - hh + r + u)),
            ("a", math.pi * r / 2, lambda u: (cx + hw - r + r * math.cos(u / r), cy + hh - r + r * math.sin(u / r))),
            ("l", 2 * (hw - r), lambda u: (cx + hw - r - u, cy + hh)),
            ("a", math.pi * r / 2, lambda u: (cx - hw + r - r * math.sin(u / r), cy + hh - r + r * math.cos(u / r))),
            ("l", 2 * (hh - r), lambda u: (cx - hw, cy + hh - r - u)),
            ("a", math.pi * r / 2, lambda u: (cx - hw + r - r * math.cos(u / r), cy - hh + r - r * math.sin(u / r))),
        ):
            if d <= length:
                pts.append(fn(d))
                break
            d -= length
    return pts


def cushion(draw, size):
    # 角丸の四角いフェルトパッチ
    s = size * SS
    draw.rounded_rectangle([0.03 * s, 0.03 * s, 0.97 * s, 0.97 * s], radius=0.2 * s, fill=255)


def patch(draw, size, bumps=40):
    # フチがもこもこした角丸四角（ワッペン風）
    s = size * SS
    draw.rounded_rectangle([0.05 * s, 0.05 * s, 0.95 * s, 0.95 * s], radius=0.19 * s, fill=255)
    for x, y in _rrect_points(0.5, 0.5, 0.45, 0.45, 0.19, bumps):
        _ellipse(draw, x, y, 0.034, 0.034, size)


def exclaim(draw, size):
    s = size * SS
    draw.rounded_rectangle([0.36 * s, 0.04 * s, 0.64 * s, 0.66 * s], radius=0.14 * s, fill=255)
    _ellipse(draw, 0.5, 0.84, 0.13, 0.13, size)


def glyph(draw, size, text="Z"):
    s = size * SS
    font = find_font(int(s * 0.9))
    bbox = draw.textbbox((0, 0), text, font=font, stroke_width=int(s * 0.04))
    w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
    draw.text(((s - w) / 2 - bbox[0], (s - h) / 2 - bbox[1]), text, font=font, fill=255,
              stroke_width=int(s * 0.04), stroke_fill=255)


SHAPES = {
    "heart": heart, "star": star, "sparkle": sparkle, "circle": circle, "petal": petal,
    "sakura": sakura, "flower": flower, "paw": paw, "bone": bone, "drop": drop, "moon": moon,
    "cloud": cloud, "confetti": confetti, "burst": burst, "ring": ring, "scallop": scallop,
    "leaf": leaf, "glyph": glyph, "exclaim": exclaim,
    "cushion": cushion, "patch": patch,
}


def mask(name: str, size: int, **kw) -> np.ndarray:
    im, draw = _canvas(size)
    SHAPES[name](draw, size, **kw)
    return _finish(im, size)


def wedges(size: int, n: int, phase: int = 0) -> np.ndarray:
    """放射状の扇形（交互の片側だけ）。サンバースト背景用。"""
    im, draw = _canvas(size)
    s = size * SS
    for k in range(n):
        if (k + phase) % 2:
            continue
        a0 = 360.0 * k / n - 90
        draw.pieslice([0, 0, s - 1, s - 1], a0, a0 + 360.0 / n, fill=255)
    return _finish(im, size)
