"""APNG 書き出し（依存: Pillow / numpy / imagequant）。

- 全フレームを縦につないで一括減色 → 全フレーム共通パレット（APNGはPLTEが1つ）
- 2フレーム目以降は前フレームとの差分矩形だけを書く（dispose=NONE, blend=SOURCE）
- 容量上限を超えたら色数を減らして再挑戦
"""
from __future__ import annotations

import struct
import zlib
from pathlib import Path

import numpy as np
from PIL import Image

try:
    import imagequant
except ImportError:  # 減色なし（容量が大きくなる）でも一応動く
    imagequant = None


def _chunk(tag: bytes, data: bytes) -> bytes:
    return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)


def _idat_bytes(idx: np.ndarray) -> bytes:
    h, w = idx.shape
    raw = np.concatenate([np.zeros((h, 1), np.uint8), idx.astype(np.uint8)], axis=1).tobytes()
    return zlib.compress(raw, 9)


def _quantize(frames: list[Image.Image], colors: int, dither: float):
    w, h = frames[0].size
    tall = Image.new("RGBA", (w, h * len(frames)))
    for i, f in enumerate(frames):
        tall.paste(f, (0, h * i))
    if imagequant is not None:
        q = imagequant.quantize_pil_image(tall, dithering_level=dither, max_colors=colors,
                                          min_quality=0, max_quality=100)
    else:
        q = tall.quantize(colors=colors, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
    pal = q.getpalette("RGBA") if "RGBA" in q.palette.mode or imagequant else None
    if pal is None:
        rgbp = q.getpalette()
        trns = q.info.get("transparency", b"")
        pal = []
        for i in range(len(rgbp) // 3):
            a = trns[i] if isinstance(trns, (bytes, bytearray)) and i < len(trns) else 255
            pal += rgbp[i * 3:i * 3 + 3] + [a]
    idx = np.asarray(q, dtype=np.uint8)
    n = int(idx.max()) + 1
    pal = np.array(pal[:n * 4], np.uint8).reshape(-1, 4)
    # 透明なパレットは色を0にそろえる（圧縮が効き、ふちの色にじみも防ぐ）
    pal[pal[:, 3] == 0, :3] = 0
    return [idx[h * i:h * (i + 1)] for i in range(len(frames))], pal


def _stabilize(frames: list[Image.Image], tol: int = 4) -> list[Image.Image]:
    """前フレームとほぼ同じ画素は前フレームの値に固定（減色のチラつき防止＋差分を小さく）。"""
    out = [np.asarray(frames[0].convert("RGBA")).copy()]
    for f in frames[1:]:
        cur = np.asarray(f.convert("RGBA")).copy()
        prev = out[-1]
        same = (np.abs(cur.astype(np.int16) - prev.astype(np.int16)).max(axis=-1) <= tol)
        cur[same] = prev[same]
        out.append(cur)
    return [Image.fromarray(a, "RGBA") for a in out]


def _premul(pal: np.ndarray) -> np.ndarray:
    p = pal.astype(np.float32) / 255.0
    p[:, :3] *= p[:, 3:4]
    return p


def _plan_over(canvas, target_idx, pal, ppal, transparent_index, tol=3 / 255, max_err=20 / 255):
    """blend=OVER で canvas → target に近づけるフレームを作る。

    canvas: 現在の表示バッファ（プリマルチ float, H×W×4）
    戻り値 (x0, y0, x1, y1, 書き込むインデックス, 合成後のcanvas) / 作れなければ None
    """
    target = ppal[target_idx]
    changed = np.abs(target - canvas).max(axis=-1) > tol
    if not changed.any():
        return None
    ys, xs = np.nonzero(changed)
    x0, y0, x1, y1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
    src = np.full((y1 - y0, x1 - x0), transparent_index, np.uint8)
    ch = changed[y0:y1, x0:x1]
    cv = canvas[y0:y1, x0:x1]
    tg = target_idx[y0:y1, x0:x1]
    ca = cv[..., 3]
    ta = pal[tg, 3]
    direct = ch & ((ca <= 1e-4) | (ta == 255))
    src[direct] = tg[direct]
    hard = ch & ~direct
    if hard.any():
        # 半透明の上に半透明を重ねる画素: パレットから一番近い結果になる色を探す
        B = cv[hard]                      # K×4 (premul)
        F = ppal[tg[hard]]                # K×4
        S = ppal[None, :, :]              # 1×N×4
        best = np.empty(len(B), np.int64)
        errs = np.empty(len(B), np.float32)
        for k in range(0, len(B), 2048):
            res = S + B[k:k + 2048, None, :] * (1 - S[..., 3:4])
            err = np.abs(res - F[k:k + 2048, None, :]).max(axis=-1)
            best[k:k + 2048] = err.argmin(axis=1)
            errs[k:k + 2048] = err[np.arange(len(err)), best[k:k + 2048]]
        # ふちの数画素だけ少しずれるのは目に見えないので許容（大きくずれる/多い場合は SOURCE に戻す）
        n_off = int((errs > max_err).sum())
        if errs.max() > 0.45 or n_off > max(12, 0.01 * len(errs)):
            return None
        src[hard] = best
    s = ppal[src]
    out = canvas.copy()
    out[y0:y1, x0:x1] = s + cv * (1 - s[..., 3:4])
    return x0, y0, x1, y1, src, out


def encode(frames: list[Image.Image], delays_ms: list[int], loops: int,
           colors: int = 256, dither: float = 0.0) -> bytes:
    """実際のデコード結果（canvas）を追跡しながら、各フレームで SOURCE / OVER の小さい方を選ぶ。"""
    w, h = frames[0].size
    frames = _stabilize(frames)
    idxs, pal = _quantize(frames, colors, dither)
    ppal = _premul(pal)
    zeros = np.nonzero(pal[:, 3] == 0)[0]
    transparent_index = int(zeros[0]) if len(zeros) else None
    out = [b"\x89PNG\r\n\x1a\n",
           _chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 3, 0, 0, 0)),
           _chunk(b"acTL", struct.pack(">II", len(frames), loops)),
           _chunk(b"PLTE", pal[:, :3].tobytes()),
           _chunk(b"tRNS", pal[:, 3].tobytes())]
    seq = 0
    canvas = None
    for i, (idx, d) in enumerate(zip(idxs, delays_ms)):
        if canvas is None:
            plan = (0, 0, w, h, 0, _idat_bytes(idx))
            canvas = ppal[idx]
        else:
            target = ppal[idx]
            changed = np.abs(target - canvas).max(axis=-1) > 3 / 255
            if not changed.any():
                plan = (0, 0, 1, 1, 0, _idat_bytes(idx[:1, :1]))
                canvas[:1, :1] = target[:1, :1]
            else:
                ys, xs = np.nonzero(changed)
                x0, y0, x1, y1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
                plan = (x0, y0, x1, y1, 0, _idat_bytes(idx[y0:y1, x0:x1]))
                new_canvas = canvas.copy()
                new_canvas[y0:y1, x0:x1] = target[y0:y1, x0:x1]
                if transparent_index is not None:
                    ov = _plan_over(canvas, idx, pal, ppal, transparent_index)
                    if ov is not None:
                        data = _idat_bytes(ov[4])
                        if len(data) < len(plan[5]):
                            plan = (ov[0], ov[1], ov[2], ov[3], 1, data)
                            new_canvas = ov[5]
                canvas = new_canvas
        x0, y0, x1, y1, blend, data = plan
        out.append(_chunk(b"fcTL", struct.pack(">IIIIIHHBB", seq, x1 - x0, y1 - y0, x0, y0,
                                               int(d), 1000, 0, blend)))
        seq += 1
        if i == 0:
            out.append(_chunk(b"IDAT", data))
        else:
            out.append(_chunk(b"fdAT", struct.pack(">I", seq) + data))
            seq += 1
    out.append(_chunk(b"IEND", b""))
    return b"".join(out)


def save(path: Path, frames: list[Image.Image], delays_ms: list[int], loops: int,
         max_bytes: int = 1_000_000) -> tuple[int, int]:
    """容量上限に収まるまで色数を落として保存。戻り値 (バイト数, 使った色数)。"""
    data = b""
    # ディザなしの方が差分が小さく容量が大幅に減る（フェルトの繊維があるので段差も目立たない）
    for colors, dither in ((256, 0.0), (224, 0.0), (192, 0.0), (160, 0.0), (128, 0.0), (96, 0.0), (64, 0.0)):
        data = encode(frames, delays_ms, loops, colors, dither)
        if len(data) <= max_bytes:
            break
    Path(path).write_bytes(data)
    return len(data), colors


def read_info(path: Path) -> dict:
    """検証用: APNGのサイズ・フレーム数・ループ数・総再生時間を読む。"""
    b = Path(path).read_bytes()
    pos = 8
    info = {"bytes": len(b), "frames": 1, "loops": None, "duration_ms": 0, "delays": []}
    while pos < len(b):
        ln, tag = struct.unpack(">I4s", b[pos:pos + 8])
        data = b[pos + 8:pos + 8 + ln]
        if tag == b"IHDR":
            info["width"], info["height"] = struct.unpack(">II", data[:8])
        elif tag == b"acTL":
            info["frames"], info["loops"] = struct.unpack(">II", data)
        elif tag == b"fcTL":
            num, den = struct.unpack(">HH", data[20:24])
            ms = num * 1000 / (den or 100)
            info["delays"].append(ms)
            info["duration_ms"] += ms
        pos += 12 + ln
    return info
