"""フェルト質感のパーツ描画と、プリマルチプライドαでの合成ヘルパー。

フェルトらしさ = ①ふちの毛羽立ち ②繊維テクスチャ ③中央がふっくらした陰影
④内側のステッチ（破線の縫い目） ⑤やわらかい落ち影。
スタンプ本体（フェルト柴）と並べたときに同じ「手芸の世界」に見えることを優先する。
"""
from __future__ import annotations

import math
from functools import lru_cache

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

from . import shapes

# あいこパーク系のやさしい配色（フェルト布っぽく彩度を少し落とす）
PALETTE = {
    "pink": "#F5A8BC", "rose": "#EE7F98", "coral": "#F4907E", "red": "#E4605E",
    "orange": "#F3A259", "shiba": "#D98A3D", "yellow": "#FFD467", "cream": "#FFF2D8",
    "white": "#FFFFFF", "mint": "#9AD8C0", "green": "#7CC08E", "sky": "#9CCDEE",
    "blue": "#6FA8DC", "navy": "#3E4F7C", "lavender": "#C6B3E6", "purple": "#9D86D0",
    "brown": "#9A6440", "gray": "#B8C2CC",
}


def rgb(c) -> np.ndarray:
    if isinstance(c, str):
        c = PALETTE.get(c, c).lstrip("#")
        return np.array([int(c[i:i + 2], 16) for i in (0, 2, 4)], dtype=np.float32) / 255.0
    return np.asarray(c, dtype=np.float32)


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3 - 2 * t)


@lru_cache(maxsize=1)
def _fiber_texture() -> np.ndarray:
    """短い繊維をランダムに重ねたテクスチャ（-1..1）。"""
    n = 512
    rng = np.random.default_rng(7)
    im = Image.new("L", (n, n), 128)
    d = ImageDraw.Draw(im)
    for _ in range(9000):
        x, y = rng.uniform(0, n, 2)
        a = rng.uniform(0, math.pi)
        ln = rng.uniform(3, 10)
        v = int(128 + rng.choice([-1, 1]) * rng.uniform(25, 70))
        d.line([(x, y), (x + ln * math.cos(a), y + ln * math.sin(a))], fill=v, width=1)
    arr = np.asarray(im, dtype=np.float32)
    arr = ndimage.gaussian_filter(arr, 0.7, mode="wrap")
    arr = (arr - arr.mean()) / (arr.std() * 2.5)
    arr = np.clip(arr, -1, 1)
    # まばらな繊維だけ残す（全面ノイズより容量がずっと小さく、フェルトらしさは残る）
    return np.where(np.abs(arr) > 0.6, np.sign(arr) * 0.9, 0.0).astype(np.float32)


def _texture(h: int, w: int, seed: int) -> np.ndarray:
    tex = _fiber_texture()
    rng = np.random.default_rng(seed)
    reps = (h // tex.shape[0] + 2, w // tex.shape[1] + 2)
    big = np.tile(tex, reps)
    oy, ox = rng.integers(0, tex.shape[0]), rng.integers(0, tex.shape[1])
    return big[oy:oy + h, ox:ox + w]


def felt_from_mask(m: np.ndarray, color, *, stitch=True, seed=0, thread=None,
                   shadow=True, fuzz=1.0, texture=1.0) -> Image.Image:
    """2倍解像度のマスク m からフェルトパーツを作り、1倍のプリマルチRGBA画像で返す。"""
    n = max(m.shape)
    pad = int(0.07 * n) + 6
    pad += pad % 2
    m = np.pad(m, pad)
    h, w = m.shape
    rng = np.random.default_rng(seed)
    base = rgb(color)

    # ① ふちの毛羽立ち
    noise = ndimage.gaussian_filter(rng.standard_normal((h, w)).astype(np.float32), 1.2)
    noise /= noise.std() + 1e-6
    soft = ndimage.gaussian_filter(m, 1.1)
    amp = 0.10 * fuzz * min(1.0, n / 80)
    edge = np.clip(4 * soft * (1 - soft) * 1.6, 0, 1)  # 毛羽立ちは縁だけ（内部に半透明の穴を作らない）
    a = smoothstep(0.30, 0.70, soft + amp * noise * edge)
    inside = a > 0.5
    dist = ndimage.distance_transform_edt(inside).astype(np.float32)

    # ③ ふっくら陰影 + 左上からの光
    r_puff = max(3.0, 0.11 * n)
    shade = 0.80 + 0.20 * smoothstep(0, r_puff, dist) ** 0.7
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    shade += 0.06 * (-(xx - w / 2) - (yy - h / 2)) / n
    # ② 繊維
    tex = _texture(h, w, seed)
    col = base[None, None, :] * shade[..., None] * (1 + 0.09 * texture * tex[..., None])

    # ④ ステッチ
    if stitch and n >= 70:
        # 縫い目はフチのでこぼこを均した輪郭に沿わせる（スカラップ形でも縫い目がまっすぐ）
        smooth = ndimage.gaussian_filter(inside.astype(np.float32), 0.03 * n) > 0.5
        dist = ndimage.distance_transform_edt(smooth & inside).astype(np.float32)
        d_in = float(np.clip(0.085 * n, 6, 26))
        lw = float(np.clip(0.02 * n, 2.0, 5.0))
        ridge = 1 - smoothstep(lw * 0.5 - 0.7, lw * 0.5 + 0.7, np.abs(dist - d_in))
        labels, count = ndimage.label(inside)
        phase = np.zeros((h, w), np.float32)
        period = float(np.clip(0.06 * n, 10, 30))
        for lab in range(1, count + 1):
            sel = labels == lab
            if math.sqrt(sel.sum() / math.pi) < 2.6 * d_in:
                continue  # 小さい部品（肉球の指など）には縫い目を入れない
            cy, cx = ndimage.center_of_mass(sel)
            ang = np.arctan2(yy - cy, xx - cx)
            rad = max(8.0, float(np.sqrt(sel.sum() / math.pi)) - d_in)
            phase[sel] = (ang[sel] * rad / period) % 1.0
        dash = smoothstep(0.08, 0.16, phase) * (1 - smoothstep(0.56, 0.64, phase))
        st = ridge * dash
        lum = float(base @ np.array([0.299, 0.587, 0.114], np.float32))
        if thread is not None:
            tc = rgb(thread)
        elif lum > 0.82:
            tc = base * 0.72
        else:
            tc = base + (1 - base) * 0.62
        st_shadow = ndimage.shift(st, (1.6, 1.0), order=1)
        col = col * (1 - 0.35 * st_shadow[..., None])
        col = col * (1 - st[..., None]) + tc[None, None, :] * st[..., None]

    col = np.clip(col, 0, 1)
    rgba = np.concatenate([col * a[..., None], a[..., None]], axis=-1)

    # ⑤ 落ち影
    if shadow:
        off = 0.035 * n + 2
        sa = ndimage.gaussian_filter(ndimage.shift(a, (off, off * 0.3), order=1), 0.03 * n + 2)
        sa = 0.26 * sa * (1 - a)
        sc = np.array([0.36, 0.22, 0.16], np.float32)
        rgba = rgba + np.concatenate([sc * sa[..., None], sa[..., None]], axis=-1)

    # 2倍 → 1倍（プリマルチなので単純平均でOK）
    rgba = rgba.reshape(h // 2, 2, w // 2, 2, 4).mean(axis=(1, 3))
    return Image.fromarray((np.clip(rgba, 0, 1) * 255 + 0.5).astype(np.uint8), "RGBA")


@lru_cache(maxsize=512)
def felt(name: str, size: int, color: str, stitch: bool = True, seed: int = 0,
         thread: str | None = None, **kw) -> Image.Image:
    """名前付きの形のフェルトパーツ（プリマルチRGBA, キャッシュ付き）。"""
    kwargs = dict(kw)
    m = shapes.mask(name, size * 2, **kwargs)
    return felt_from_mask(m, color, stitch=stitch, seed=seed, thread=thread)


@lru_cache(maxsize=64)
def felt_wedges(size: int, n: int, color: str, seed: int = 0) -> Image.Image:
    m = shapes.wedges(size * 2, n)
    return felt_from_mask(m, color, stitch=False, seed=seed, shadow=False, fuzz=0.6, texture=0.0)


# ---- 合成 ------------------------------------------------------------------

def new_canvas(w: int, h: int) -> np.ndarray:
    return np.zeros((h, w, 4), np.float32)


def premultiply(im: Image.Image) -> Image.Image:
    a = np.asarray(im.convert("RGBA"), dtype=np.float32) / 255.0
    a[..., :3] *= a[..., 3:4]
    return Image.fromarray((a * 255 + 0.5).astype(np.uint8), "RGBA")


def over(canvas: np.ndarray, arr: np.ndarray, x0: int, y0: int) -> None:
    H, W = canvas.shape[:2]
    h, w = arr.shape[:2]
    x1, y1 = max(0, x0), max(0, y0)
    x2, y2 = min(W, x0 + w), min(H, y0 + h)
    if x2 <= x1 or y2 <= y1:
        return
    src = arr[y1 - y0:y2 - y0, x1 - x0:x2 - x0]
    dst = canvas[y1:y2, x1:x2]
    dst *= 1 - src[..., 3:4]
    dst += src


def place(canvas: np.ndarray, sprite: Image.Image, cx: float, cy: float, *, scale=1.0,
          sx=1.0, sy=1.0, rot=0.0, alpha=1.0, anchor=(0.5, 0.5), tint=None) -> None:
    """プリマルチ画像 sprite を、anchor 点が (cx, cy) に来るよう配置。

    scale/sx/sy は anchor 基準の拡縮、rot は度（反時計回り）。サブピクセル位置も補間する。
    """
    if alpha <= 0.003 or scale * min(sx, sy) <= 0.01:
        return
    w0, h0 = sprite.size
    k = scale
    if k < 0.8:  # 大きく縮めるときは先にLANCZOSで縮小（エイリアス防止）
        nw, nh = max(2, round(w0 * k)), max(2, round(h0 * k))
        sprite = sprite.resize((nw, nh), Image.LANCZOS)
        k = 1.0
        w, h = nw, nh
    else:
        w, h = w0, h0
    fx, fy = k * sx, k * sy
    ax, ay = anchor[0] * w, anchor[1] * h
    th = math.radians(rot)
    c, s = math.cos(th), math.sin(th)

    # forward: p_out = C + R * S * (p_in - A)   （画面座標はy下向きなので回転は -th）
    def fwd(u, v):
        x, y = (u - ax) * fx, (v - ay) * fy
        return cx + c * x + s * y, cy - s * x + c * y

    xs, ys = zip(*(fwd(u, v) for u, v in ((0, 0), (w, 0), (0, h), (w, h))))
    bx0, by0 = math.floor(min(xs)) - 1, math.floor(min(ys)) - 1
    bx1, by1 = math.ceil(max(xs)) + 1, math.ceil(max(ys)) + 1
    ow, oh = bx1 - bx0, by1 - by0
    if ow <= 0 or oh <= 0 or ow > 4000 or oh > 4000:
        return
    # inverse: p_in = A + S^-1 * R^-1 * (p_out - C)
    a_ = c / fx
    b_ = -s / fx
    d_ = s / fy
    e_ = c / fy
    ox, oy = bx0 - cx, by0 - cy
    data = (a_, b_, ax + a_ * ox + b_ * oy, d_, e_, ay + d_ * ox + e_ * oy)
    out = sprite.transform((ow, oh), Image.AFFINE, data, resample=Image.BICUBIC)
    arr = np.asarray(out, dtype=np.float32) / 255.0
    arr[..., :3] = np.minimum(arr[..., :3], arr[..., 3:4])
    if tint is not None:
        arr[..., :3] = arr[..., :3] * (1 - tint[1]) + rgb(tint[0]) * arr[..., 3:4] * tint[1]
    if alpha < 1:
        arr *= alpha
    over(canvas, arr, bx0, by0)


def to_image(canvas: np.ndarray) -> Image.Image:
    a = canvas[..., 3:4]
    rgbv = np.where(a > 1e-4, canvas[..., :3] / np.maximum(a, 1e-4), 0)
    out = np.concatenate([np.clip(rgbv, 0, 1), np.clip(a, 0, 1)], axis=-1)
    return Image.fromarray((out * 255 + 0.5).astype(np.uint8), "RGBA")
