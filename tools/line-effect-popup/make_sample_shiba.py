"""動作確認用の「仮のフェルト柴」スタンプ（370×320 透過PNG）を作る。

本番では、過去に作ったフェルト柴スタンプの画像を src フォルダに入れて使うこと。
これはパイプライン確認・プレビュー用のダミー。

    python make_sample_shiba.py --out sample_src
"""
from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

from lep import felt
from lep.shapes import find_font

W, H = 370, 320
S = 2  # felt_from_mask は 2倍マスクを受け取る
W2, H2 = W * S, H * S

SAMPLES = [
    ("ありがとう", "happy", -6),
    ("おはよう", "normal", 4),
    ("おめでとう", "happy", 0),
    ("りょうかい", "wink", -4),
    ("おやすみ", "sleepy", 8),
    ("えっ!?", "surprised", 0),
    ("かなしい", "sad", -8),
    ("だいすき", "love", 5),
]


def _layer():
    im = Image.new("L", (W2, H2), 0)
    return im, ImageDraw.Draw(im)


def _m(im):
    return np.asarray(im, dtype=np.float32) / 255.0


def _part(canvas, im, color, seed, stitch=True):
    sp = felt.felt_from_mask(_m(im), color, stitch=stitch, seed=seed)
    felt.place(canvas, sp, W / 2, H / 2)


def draw_head(expr: str, seed: int) -> np.ndarray:
    cv = felt.new_canvas(W, H)
    cx, cy = W2 / 2, 250
    # 耳
    im, d = _layer()
    for sgn in (-1, 1):
        ex = cx + sgn * 128
        d.polygon([(ex - 70, cy - 60), (ex + sgn * 20, cy - 205), (ex + 70, cy - 70)], fill=255)
    im = Image.fromarray(ndimage.gaussian_filter(np.asarray(im), 6).clip(0, 255).astype(np.uint8)).point(lambda v: 255 if v > 110 else 0)
    _part(cv, im, "shiba", seed + 1)
    im, d = _layer()
    for sgn in (-1, 1):
        ex = cx + sgn * 128
        d.polygon([(ex - 34, cy - 78), (ex + sgn * 14, cy - 165), (ex + 36, cy - 84)], fill=255)
    _part(cv, im, "cream", seed + 2, stitch=False)
    # 頭
    im, d = _layer()
    d.ellipse([cx - 205, cy - 160, cx + 205, cy + 150], fill=255)
    _part(cv, im, "shiba", seed + 3)
    # マズル・ほっぺ（クリーム）
    im, d = _layer()
    d.ellipse([cx - 175, cy - 5, cx - 10, cy + 140], fill=255)
    d.ellipse([cx + 10, cy - 5, cx + 175, cy + 140], fill=255)
    d.ellipse([cx - 105, cy + 20, cx + 105, cy + 148], fill=255)
    _part(cv, im, "cream", seed + 4)
    # 麻呂眉
    im, d = _layer()
    for sgn in (-1, 1):
        d.ellipse([cx + sgn * 78 - 24, cy - 78, cx + sgn * 78 + 24, cy - 50], fill=255)
    _part(cv, im, "cream", seed + 5, stitch=False)
    # ほっぺの赤み
    im, d = _layer()
    for sgn in (-1, 1):
        d.ellipse([cx + sgn * 120 - 34, cy + 38, cx + sgn * 120 + 34, cy + 72], fill=255)
    blush = felt.felt_from_mask(_m(im), "pink", stitch=False, seed=seed + 6, shadow=False)
    felt.place(cv, blush, W / 2, H / 2, alpha=0.85)
    if expr == "love":
        for sgn in (-1, 1):
            hp = felt.felt("heart", 40, "rose", seed=seed + 7 + sgn)
            felt.place(cv, hp, (cx + sgn * 78) / S, (cy - 5) / S)
    # 目・鼻・口（ビーズと刺しゅう糸）
    ink = Image.new("RGBA", (W2, H2), (0, 0, 0, 0))
    d = ImageDraw.Draw(ink)
    brown = (62, 38, 26, 255)
    for sgn in (-1, 1):
        ex, ey = cx + sgn * 78, cy - 8
        if expr == "love":
            continue
        if expr in ("normal",) or (expr == "wink" and sgn < 0):
            d.ellipse([ex - 20, ey - 22, ex + 20, ey + 22], fill=(30, 22, 20, 255))
            d.ellipse([ex - 9, ey - 14, ex + 3, ey - 2], fill=(255, 255, 255, 240))
        elif expr == "surprised":
            d.ellipse([ex - 25, ey - 28, ex + 25, ey + 28], fill=(30, 22, 20, 255))
            d.ellipse([ex - 12, ey - 18, ex + 4, ey - 2], fill=(255, 255, 255, 240))
        elif expr in ("happy", "wink"):
            d.arc([ex - 26, ey - 16, ex + 26, ey + 30], 200, 340, fill=brown, width=9)
        elif expr == "sleepy":
            d.arc([ex - 26, ey - 30, ex + 26, ey + 10], 20, 160, fill=brown, width=9)
        elif expr == "sad":
            d.arc([ex - 26, ey - 30, ex + 26, ey + 10], 20, 160, fill=brown, width=9)
            d.line([(ex - 26, ey - 42 - sgn * 8), (ex + 22, ey - 42 + sgn * 8)], fill=brown, width=7)
    # 鼻
    d.rounded_rectangle([cx - 24, cy + 36, cx + 24, cy + 66], radius=14, fill=(46, 30, 24, 255))
    d.ellipse([cx - 12, cy + 40, cx - 2, cy + 48], fill=(255, 255, 255, 170))
    # 口
    if expr in ("surprised",):
        d.ellipse([cx - 18, cy + 80, cx + 18, cy + 120], fill=(120, 50, 50, 255))
    else:
        d.arc([cx - 40, cy + 52, cx, cy + 96], 20, 160, fill=brown, width=7)
        d.arc([cx, cy + 52, cx + 40, cy + 96], 20, 160, fill=brown, width=7)
    if expr == "sad":
        tear = felt.felt("drop", 34, "sky", seed=seed + 9)
        felt.place(cv, tear, (cx - 112) / S, (cy + 36) / S)
    felt.place(cv, felt.premultiply(ink.resize((W, H), Image.LANCZOS)), W / 2, H / 2)
    return cv


def draw_body(seed: int) -> np.ndarray:
    cv = felt.new_canvas(W, H)
    cx = W2 / 2
    im, d = _layer()  # しっぽ
    d.ellipse([cx + 90, 320, cx + 250, 480], fill=255)
    d.ellipse([cx + 110, 360, cx + 215, 470], fill=0)
    d.ellipse([cx + 176, 310, cx + 246, 380], fill=255)
    _part(cv, im, "shiba", seed + 10)
    im, d = _layer()
    d.ellipse([cx - 160, 330, cx + 160, 610], fill=255)
    _part(cv, im, "shiba", seed + 11)
    im, d = _layer()
    d.ellipse([cx - 90, 370, cx + 90, 600], fill=255)
    _part(cv, im, "cream", seed + 12, stitch=False)
    im, d = _layer()  # 前足
    for sgn in (-1, 1):
        d.ellipse([cx + sgn * 62 - 44, 540, cx + sgn * 62 + 44, 612], fill=255)
    _part(cv, im, "cream", seed + 13)
    return cv


def white_edge(im: Image.Image, px: float = 5.0) -> Image.Image:
    a = np.asarray(im, dtype=np.float32)[..., 3] / 255.0
    dist = ndimage.distance_transform_edt(a < 0.5)
    edge = np.clip(px - dist + 0.5, 0, 1)
    base = np.zeros((*a.shape, 4), np.float32)
    base[..., :3] = 1.0
    base[..., 3] = edge
    cv = base.copy()
    cv[..., :3] *= cv[..., 3:4]
    top = np.asarray(felt.premultiply(im), dtype=np.float32) / 255.0
    felt.over(cv, top, 0, 0)
    return felt.to_image(cv)


def make(text: str, expr: str, tilt: float, seed: int) -> Image.Image:
    cv = felt.new_canvas(W, H)
    body = draw_body(seed)
    felt.over(cv, body, 0, 0)
    head = felt.premultiply(felt.to_image(draw_head(expr, seed)))
    felt.place(cv, head, W / 2, 205, rot=tilt, anchor=(0.5, 205 / H))
    # 文字（こげ茶＋白フチ）
    font = find_font(46)
    tl = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(tl)
    bb = d.textbbox((0, 0), text, font=font, stroke_width=2)
    tx = (W - (bb[2] - bb[0])) / 2 - bb[0]
    ty = H - 16 - bb[3]
    d.text((tx, ty), text, font=font, fill=(110, 62, 36, 255), stroke_width=9, stroke_fill=(255, 255, 255, 255))
    d.text((tx, ty), text, font=font, fill=(110, 62, 36, 255), stroke_width=2, stroke_fill=(110, 62, 36, 255))
    felt.place(cv, felt.premultiply(tl), W / 2, H / 2)
    im = felt.to_image(cv)
    # 余白10pxに収める
    bbox = im.getbbox()
    im = im.crop(bbox)
    k = min((W - 26) / im.width, (H - 26) / im.height, 1.0)
    im = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
    out = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    out.alpha_composite(im, ((W - im.width) // 2, (H - im.height) // 2))
    return white_edge(out, 4.0)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="sample_src")
    args = ap.parse_args()
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    for i, (text, expr, tilt) in enumerate(SAMPLES, 1):
        make(text, expr, tilt, seed=i * 31).save(out / f"{i:02d}.png", optimize=True)
        print("wrote", out / f"{i:02d}.png")


if __name__ == "__main__":
    main()
