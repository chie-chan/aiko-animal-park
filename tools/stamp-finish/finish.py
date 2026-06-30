#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
LINEスタンプ 仕上げパイプライン（データ整形のみ・AIなし）
=========================================================
白背景のラスター画像（顧客 or AI生成）を、LINE Creators Market 申請用データに整形する。

処理: 透過 → サイズ統一+中央寄せ → 白フチ(距離変換) → ダスト除去 → シャープ
出力: スタンプ01..NN.png(370x320) / main.png(240x240) / tab.png(96x74) / zip

使い方:
    python finish.py --input <生成画像フォルダ> --output <出力フォルダ> [オプション]

例:
    python finish.py --input ./_raw --output ./_out --main-index 1 --tab-index 3 --zip

依存: pillow numpy scipy  (requirements.txt 参照)
※AI・APIキー・GPU・ログインは一切不要。どのPCでも動く決定論的プログラム。

参考: メモ stamp-finish-pipeline.md にアルゴリズムの背景あり。
"""
import argparse
import os
import shutil
import zipfile

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

# LINE規格
STAMP_W, STAMP_H = 370, 320
MAIN_W = MAIN_H = 240
TAB_W, TAB_H = 96, 74

# 仕上げ既定パラメータ
S = 4  # スーパーサンプリング倍率（高解像で生成→縮小で縁を滑らかに）


def make_transparent(im, bright_min=250, sat_tol=10):
    """縁フラッドフィル透過: 画像の縁から繋がった白だけ α=0。内側の白(ハイライト等)は残す。"""
    a = np.asarray(im.convert("RGB")).astype(int)
    mx = a.max(2); mn = a.min(2)
    white = (mx >= bright_min) & ((mx - mn) <= sat_tol)
    lbl, _ = ndimage.label(white)
    border = set(lbl[0, :]) | set(lbl[-1, :]) | set(lbl[:, 0]) | set(lbl[:, -1])
    border.discard(0)
    bg = np.isin(lbl, list(border))
    al = np.where(bg, 0, 255).astype(np.uint8)
    return Image.fromarray(np.dstack([a.astype(np.uint8), al]), "RGBA")


def alpha_bbox(im, thr=40):
    a = np.asarray(im); ys, xs = np.where(a[:, :, 3] > thr)
    return xs.min(), ys.min(), xs.max() + 1, ys.max() + 1


def add_white_fchi(canvas, fchi_px, aa, presmooth=3.0):
    """白フチ: 距離変換(EDT)で全方位均一オフセット。binary_dilationのうねりを避ける。
    高解像(canvasは4x想定)で生成し、後段の縮小でアンチエイリアスされ滑らかになる。"""
    a = np.asarray(canvas)
    alpha = ndimage.gaussian_filter(a[:, :, 3].astype(np.float32) / 255.0, sigma=presmooth)
    inside = alpha > 0.5
    dist = ndimage.distance_transform_edt(~inside)
    backing = np.clip((fchi_px - dist) / aa + 0.5, 0, 1)
    w = np.zeros_like(a); w[..., 0:3] = 255; w[..., 3] = (backing * 255).astype(np.uint8)
    out = Image.fromarray(w, "RGBA"); out.alpha_composite(canvas)
    return out


def remove_dust(stamp_370, max_alpha=100):
    """ダスト除去: 連結成分ごとに『最大alpha<閾値』の薄い塊だけ透明化。濃い正規パーツは残す。"""
    a = np.asarray(stamp_370).copy()
    lbl, k = ndimage.label(a[:, :, 3] > 8, structure=np.ones((3, 3)))
    if k == 0:
        return stamp_370
    maxa = ndimage.maximum(a[:, :, 3], lbl, range(1, k + 1))
    faint = [i + 1 for i, m in enumerate(maxa) if m < max_alpha]
    if faint:
        a[np.isin(lbl, faint), 3] = 0
        return Image.fromarray(a, "RGBA")
    return stamp_370


def finish_one(src_img, fchi_px, fill, dust, sharpen):
    """1枚を 370x320 のLINEスタンプに仕上げる。"""
    tr = make_transparent(src_img)
    bb = alpha_bbox(tr); content = tr.crop(bb)
    cw, ch = STAMP_W * S, STAMP_H * S
    m = 12 * S
    maxw, maxh = cw - 2 * m, ch - 2 * m
    s = min(maxw / content.width, maxh / content.height) * fill
    content = content.resize((max(1, round(content.width * s)), max(1, round(content.height * s))), Image.LANCZOS)
    canvas = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
    canvas.alpha_composite(content, ((cw - content.width) // 2, (ch - content.height) // 2))
    final = add_white_fchi(canvas, fchi_px=fchi_px * S, aa=1.6 * S)
    small = final.resize((STAMP_W, STAMP_H), Image.LANCZOS)
    if sharpen > 0:
        rgb = small.convert("RGB").filter(ImageFilter.UnsharpMask(radius=1.6, percent=sharpen, threshold=2))
        r, g, b = rgb.split()
        small = Image.merge("RGBA", (r, g, b, small.split()[3]))
    if dust:
        small = remove_dust(small)
    return small


def make_main(stamp_370):
    a = np.asarray(stamp_370); xs = np.where(a[:, :, 3] > 0)[1]; ys = np.where(a[:, :, 3] > 0)[0]
    c = stamp_370.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
    m = 8; box = MAIN_W - 2 * m
    sc = min(box / c.width, box / c.height)
    c = c.resize((max(1, round(c.width * sc)), max(1, round(c.height * sc))), Image.LANCZOS)
    out = Image.new("RGBA", (MAIN_W, MAIN_H), (0, 0, 0, 0))
    out.alpha_composite(c, ((MAIN_W - c.width) // 2, (MAIN_H - c.height) // 2))
    return out


def make_tab(stamp_370, crop_top_ratio=0.24):
    """タブ: 上部キャプション帯を除いてキャラ部分をクロップ→96x74。"""
    a = np.asarray(stamp_370); xs = np.where(a[:, :, 3] > 0)[1]; ys = np.where(a[:, :, 3] > 0)[0]
    x0, y0, x1, y1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
    cat_top = y0 + int((y1 - y0) * crop_top_ratio)
    c = stamp_370.crop((x0, cat_top, x1, y1))
    m = 3; bw, bh = TAB_W - 2 * m, TAB_H - 2 * m
    sc = min(bw / c.width, bh / c.height)
    c = c.resize((max(1, round(c.width * sc)), max(1, round(c.height * sc))), Image.LANCZOS)
    out = Image.new("RGBA", (TAB_W, TAB_H), (0, 0, 0, 0))
    out.alpha_composite(c, ((TAB_W - c.width) // 2, (TAB_H - c.height) // 2))
    return out


def main():
    ap = argparse.ArgumentParser(description="LINEスタンプ仕上げ（AIなし・決定論的）")
    ap.add_argument("--input", required=True, help="白背景のラスター画像フォルダ（*.png をソートして処理）")
    ap.add_argument("--output", required=True, help="出力フォルダ")
    ap.add_argument("--fchi-px", type=float, default=2.0, help="白フチの太さ(px) 既定2")
    ap.add_argument("--fill", type=float, default=0.94, help="枠への充填率 既定0.94")
    ap.add_argument("--sharpen", type=int, default=60, help="UnsharpMask percent 既定60 (0で無効)")
    ap.add_argument("--no-dust", action="store_true", help="ダスト除去を無効化")
    ap.add_argument("--main-index", type=int, default=1, help="メイン画像に使うスタンプ番号(1始まり)")
    ap.add_argument("--tab-index", type=int, default=1, help="タブ画像に使うスタンプ番号(1始まり)")
    ap.add_argument("--zip", action="store_true", help="申請用zip(01..NN.png+main+tab)も出力")
    args = ap.parse_args()

    os.makedirs(args.output, exist_ok=True)
    files = sorted(f for f in os.listdir(args.input) if f.lower().endswith((".png", ".jpg", ".jpeg", ".webp")))
    if not files:
        raise SystemExit("入力フォルダに画像がありません: " + args.input)

    stamps = []
    for i, f in enumerate(files, 1):
        im = Image.open(os.path.join(args.input, f)).convert("RGBA")
        s = finish_one(im, args.fchi_px, args.fill, not args.no_dust, args.sharpen)
        path = os.path.join(args.output, f"スタンプ{i:02d}.png")
        s.save(path)
        stamps.append(s)
        print(f"スタンプ{i:02d} <- {f}")

    main_img = make_main(stamps[args.main_index - 1])
    tab_img = make_tab(stamps[args.tab_index - 1])
    main_img.save(os.path.join(args.output, "main.png"))
    tab_img.save(os.path.join(args.output, "tab.png"))
    print("main.png / tab.png 生成")

    if args.zip:
        up = os.path.join(args.output, "_line_upload")
        os.makedirs(up, exist_ok=True)
        for i in range(1, len(stamps) + 1):
            shutil.copy(os.path.join(args.output, f"スタンプ{i:02d}.png"), os.path.join(up, f"{i:02d}.png"))
        main_img.save(os.path.join(up, "main.png"))
        tab_img.save(os.path.join(up, "tab.png"))
        zip_path = os.path.join(args.output, "line_納品一式.zip")
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as z:
            for name in sorted(os.listdir(up)):
                z.write(os.path.join(up, name), name)
        print(f"zip: {zip_path}  ({len(stamps)} + main + tab)")

    print(f"DONE: {len(stamps)} 枚")


if __name__ == "__main__":
    main()
