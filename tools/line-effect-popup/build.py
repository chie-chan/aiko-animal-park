"""既存スタンプ画像から LINE「ポップアップスタンプ」「エフェクトスタンプ」の申請データを作る。

    python build.py --src <スタンプPNGのフォルダ> --out <出力フォルダ> [--config config.json] [--zip]

--src のPNG（01.png, 02.png ... 背景透過の既存スタンプ）1枚ごとに:
  ポップアップ: 01.png（370×320 静止画）+ 01_popup.png（480×480 APNG、キャラが飛び出して背景が動く）
  エフェクト  : 01.png（370×320 静止画）+ 01_effect.png（480×480 APNG、トーク背景に流れる演出）
を作り、main / tab 画像、プレビューHTML、仕様チェック結果（report.txt）も書き出す。
"""
from __future__ import annotations

import argparse
import html
import json
import sys
import zipfile
from pathlib import Path

from PIL import Image

from lep import apng, effect, popup
from lep.anim import MAX_FRAMES, MAX_TOTAL_MS

MAX_BYTES = 1_000_000  # ポップアップ画像・エフェクト画像は1個 1MB 以下

# ファイル名にこの言葉が入っていたら、その演出を既定にする
KEYWORDS = [
    (("ありがと", "感謝", "thank"), "hearts", "heart_rise"),
    (("すき", "好き", "love", "ラブ"), "flowers", "heart_rise"),
    (("おはよ", "morning"), "sunburst", "sparkle"),
    (("おめでと", "やった", "祝", "congrat"), "confetti", "fireworks"),
    (("りょうかい", "了解", "ok", "オッケー", "おけ"), "slam", "paws"),
    (("おやすみ", "ねる", "night"), "night", "night"),
    (("えっ", "!?", "びっくり", "なんと"), "shock", "shock"),
    (("かなし", "ごめん", "泣", "sad"), "rain", "rain"),
    (("ごはん", "おやつ", "たべ"), "sparkle", "bones"),
    (("たのし", "るん", "♪"), "sparkle", "music"),
]


def guess(stem: str, i: int) -> tuple[str, str]:
    low = stem.lower()
    for words, sc, fx in KEYWORDS:
        if any(w in low for w in words):
            return sc, fx
    return popup.DEFAULT_ORDER[i % len(popup.DEFAULT_ORDER)], effect.DEFAULT_ORDER[i % len(effect.DEFAULT_ORDER)]


def fit(img: Image.Image, w: int, h: int, pad: int = 0) -> Image.Image:
    """透過を保ったまま w×h 以内に収めて中央に置く。"""
    img = img.convert("RGBA")
    bbox = img.getchannel("A").point(lambda a: 255 if a > 8 else 0).getbbox()
    if bbox:
        img = img.crop(bbox)
    k = min((w - 2 * pad) / img.width, (h - 2 * pad) / img.height, 1.0 if pad == 0 else 99)
    img = img.resize((max(2, round(img.width * k)), max(2, round(img.height * k))), Image.LANCZOS)
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    out.alpha_composite(img, ((w - img.width) // 2, (h - img.height) // 2))
    return out


def sticker_image(src: Image.Image) -> Image.Image:
    """スタンプ画像（静止画）: 既存スタンプを 370×320（最大）・偶数サイズ・余白10pxに整える。"""
    src = src.convert("RGBA")
    if src.size == (370, 320):
        return src
    return fit(src, 370, 320, pad=10)


def load_config(path: Path | None, files: list[Path]) -> list[dict]:
    items = []
    conf = {}
    if path and path.exists():
        for it in json.loads(path.read_text(encoding="utf-8")).get("stickers", []):
            conf[it["file"]] = it
    for i, f in enumerate(files):
        sc, fx = guess(f.stem, i)
        c = conf.get(f.name, {})
        pc = c.get("popup", {})
        ec = c.get("effect", {})
        items.append(dict(
            file=f, name=f"{i + 1:02d}",
            scene=pc.get("scene", sc), motion=pc.get("motion"), colors=pc.get("colors"),
            preset=ec.get("preset", fx),
        ))
    return items


def check(path: Path, kind: str) -> list[str]:
    """LINE の仕様チェック（サイズ・コマ数・再生時間・ループ・容量）。"""
    info = apng.read_info(path)
    w, h = info["width"], info["height"]
    total = info["duration_ms"] * (info["loops"] or 1)
    errs = []
    if max(w, h) != 480 or w > 480 or h > 480:
        errs.append(f"サイズ {w}x{h}（どちらかが480、最大480x480）")
    if w == 480 and h < 320 or h == 480 and w < 200:
        errs.append(f"サイズ {w}x{h}（横480なら縦320以上／縦480なら横200以上）")
    if not 5 <= info["frames"] <= MAX_FRAMES:
        errs.append(f"コマ数 {info['frames']}（5〜20）")
    if not 1 <= (info["loops"] or 0) <= 3:
        errs.append(f"ループ数 {info['loops']}（1〜3）")
    if total > MAX_TOTAL_MS:
        errs.append(f"再生時間 {total / 1000:.2f}秒（3秒以内）")
    if info["bytes"] > MAX_BYTES:
        errs.append(f"容量 {info['bytes'] / 1000:.0f}KB（1MB以下）")
    return errs, info


def write_preview(out: Path, items: list[dict], kinds: list[str]):
    cards = []
    for it in items:
        n = it["name"]
        cells = [f'<div class="st"><img src="{kinds[0]}/{n}.png" alt=""></div>']
        if "popup" in kinds:
            cells.append(f'<button class="play" data-kind="popup" data-src="popup/{n}_popup.png">ポップアップ</button>')
        if "effect" in kinds:
            cells.append(f'<button class="play" data-kind="effect" data-src="effect/{n}_effect.png">エフェクト</button>')
        cards.append(f'<div class="card"><div class="no">{n} ・ {html.escape(it["scene"])} ／ '
                     f'{html.escape(it["preset"])}</div>{"".join(cells)}</div>')
    page = """<!doctype html><html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>スタンププレビュー</title>
<style>
:root{--bg:#8cabd9;--card:#fff;--ink:#3b2a20}
body{margin:0;font-family:system-ui,sans-serif;background:#f6efe8;color:var(--ink)}
header{padding:16px}
h1{font-size:18px;margin:0 0 4px}
p{margin:0;font-size:13px;opacity:.8}
.wrap{display:grid;grid-template-columns:minmax(0,1fr) minmax(280px,420px);gap:16px;padding:0 16px 24px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;align-content:start}
.card{background:var(--card);border-radius:14px;padding:8px;box-shadow:0 1px 3px #0002}
.no{font-size:11px;opacity:.7;margin-bottom:4px}
.st img{width:100%;display:block}
.play{margin-top:6px;width:100%;border:0;border-radius:999px;padding:6px;background:#f3d8c5;color:var(--ink);font-weight:600;cursor:pointer}
.phone{position:sticky;top:12px;height:min(760px,90vh);border-radius:28px;background:var(--bg);overflow:hidden;box-shadow:0 4px 20px #0003}
.fx{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;pointer-events:none}
.talk{position:absolute;inset:0;padding:18px 14px;display:flex;flex-direction:column;gap:10px;overflow:auto}
.bubble{max-width:70%;padding:8px 12px;border-radius:16px;background:#fff;font-size:14px;align-self:flex-start}
.bubble.me{align-self:flex-end;background:#8de055}
.sent{align-self:flex-end;width:150px}
.pop{position:absolute;left:50%;top:50%;width:92%;transform:translate(-50%,-50%);pointer-events:none}
@media (max-width:720px){.wrap{grid-template-columns:1fr}.phone{position:relative;height:620px}}
</style></head><body>
<header><h1>フェルト柴 ポップアップ／エフェクト プレビュー</h1>
<p>ボタンを押すと、右のトーク画面で再生します（LINEと同じく指定回数だけ再生）。</p></header>
<div class="wrap"><div class="grid">__CARDS__</div>
<div class="phone" id="phone"><img class="fx" id="fx" alt="">
<div class="talk" id="talk"><div class="bubble">今日どうだった？</div><div class="bubble me">たのしかった！</div></div>
<img class="pop" id="pop" alt=""></div></div>
<script>
const fx=document.getElementById('fx'),pop=document.getElementById('pop'),talk=document.getElementById('talk');
document.querySelectorAll('.play').forEach(b=>b.addEventListener('click',()=>{
  const src=b.dataset.src+'?t='+Date.now();
  const st=b.closest('.card').querySelector('.st img').src;
  const m=document.createElement('img');m.src=st;m.className='sent';talk.appendChild(m);talk.scrollTop=1e6;
  fx.removeAttribute('src');pop.removeAttribute('src');
  if(b.dataset.kind==='popup'){pop.src=src;setTimeout(()=>pop.removeAttribute('src'),3200)}
  else{fx.src=src;setTimeout(()=>fx.removeAttribute('src'),3200)}
}));
</script></body></html>"""
    (out / "preview.html").write_text(page.replace("__CARDS__", "\n".join(cards)), encoding="utf-8")


def make_zip(folder: Path, dest: Path):
    with zipfile.ZipFile(dest, "w", zipfile.ZIP_DEFLATED) as z:
        for f in sorted(folder.glob("*.png")):
            z.write(f, f.name)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--src", required=True, help="既存スタンプPNGのフォルダ（背景透過）")
    ap.add_argument("--out", required=True)
    ap.add_argument("--config", help="スタンプごとの演出指定（JSON）。--init-config で雛形を作れる")
    ap.add_argument("--kind", choices=["both", "popup", "effect"], default="both")
    ap.add_argument("--main", type=int, default=1, help="メイン画像に使うスタンプ番号")
    ap.add_argument("--tab", type=int, default=1, help="タブ画像に使うスタンプ番号")
    ap.add_argument("--only", help="この番号だけ作る（例: 1,3,5）。試作用")
    ap.add_argument("--hold", type=int, default=2, help="ポップアップのキャラを何コマごとに動かすか（1=毎コマ, 2=コマ撮り風）")
    ap.add_argument("--zip", action="store_true", help="申請用ZIPも作る")
    ap.add_argument("--init-config", action="store_true", help="config の雛形を書き出して終了")
    args = ap.parse_args()

    src = Path(args.src)
    files = sorted(p for p in src.glob("*.png") if not p.name.startswith("_"))
    if not files:
        sys.exit(f"{src} にPNGがありません")
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    if args.init_config:
        conf = {"stickers": []}
        for i, f in enumerate(files):
            sc, fx = guess(f.stem, i)
            conf["stickers"].append({"file": f.name, "popup": {"scene": sc}, "effect": {"preset": fx}})
        path = Path(args.config or out / "config.json")
        path.write_text(json.dumps(conf, ensure_ascii=False, indent=2), encoding="utf-8")
        print("wrote", path)
        print("popup scene:", ", ".join(popup.SCENES), "\nmotion:", ", ".join(popup.MOTIONS))
        print("effect preset:", ", ".join(effect.PRESETS))
        return

    items = load_config(Path(args.config) if args.config else None, files)
    if len(items) not in (8, 16, 24):
        print(f"※ 枚数が {len(items)} 枚です。申請は 8 / 16 / 24 枚のいずれか。")
    only = {int(x) for x in args.only.split(",")} if args.only else None
    kinds = ["popup", "effect"] if args.kind == "both" else [args.kind]
    report = []
    ok_all = True

    for kind in kinds:
        d = out / kind
        d.mkdir(exist_ok=True)
        main_src = Image.open(files[min(args.main, len(files)) - 1])
        tab_src = Image.open(files[min(args.tab, len(files)) - 1])
        fit(main_src, 240, 240, pad=6).save(d / "main.png", optimize=True)
        fit(tab_src, 96, 74, pad=2).save(d / "tab.png", optimize=True)
        jobs = [(it, it["name"]) for it in items]
        jobs.append((items[min(args.main, len(items)) - 1], "main"))
        for it, name in jobs:
            idx = int(it["name"])
            if only and idx not in only and name != "main":
                continue
            img = Image.open(it["file"])
            if name != "main":
                sticker_image(img).save(d / f"{name}.png", optimize=True)
            if kind == "popup":
                frames, delays, loops = popup.render(img, it["scene"], it["motion"], seed=idx * 17,
                                                     colors=it["colors"], hold=args.hold)
            else:
                frames, delays, loops = effect.render(it["preset"], seed=idx * 17)
            path = d / f"{name}_{kind}.png"
            nbytes, colors = apng.save(path, frames, delays, loops, MAX_BYTES)
            errs, info = check(path, kind)
            ok_all &= not errs
            line = (f"[{'OK' if not errs else 'NG'}] {kind}/{path.name}: {info['width']}x{info['height']} "
                    f"{info['frames']}コマ x{info['loops']}ループ {info['duration_ms'] * info['loops'] / 1000:.2f}秒 "
                    f"{nbytes / 1000:.0f}KB {colors}色"
                    f" ({it['scene'] if kind == 'popup' else it['preset']})" + ("  ← " + " / ".join(errs) if errs else ""))
            print(line, flush=True)
            report.append(line)
        if args.zip:
            make_zip(d, out / f"{kind}.zip")

    write_preview(out, items, kinds)
    (out / "report.txt").write_text("\n".join(report) + "\n", encoding="utf-8")
    print("\npreview:", out / "preview.html")
    print("すべてOK" if ok_all else "NGあり（report.txt を確認）")


if __name__ == "__main__":
    main()
