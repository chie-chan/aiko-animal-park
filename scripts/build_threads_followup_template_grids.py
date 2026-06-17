from __future__ import annotations

import json
from pathlib import Path
from PIL import Image


ROOT = Path(r"C:\Users\genge\Desktop\aiko-animal-park")
TEMPLATE = ROOT / "public" / "threads-present-followup" / "template" / "blank-4.png"
MAIN_MANIFEST = Path(
    r"C:\Users\genge\Desktop\threads-sunflower-watercolor-trials\before-after-97\before-after-97.manifest.json"
)
EXTRA_MANIFEST = Path(
    r"C:\Users\genge\Desktop\threads-sunflower-watercolor-trials\before-after-extra\before-after-extra.manifest.json"
)
MAIN_OUT = ROOT / "public" / "threads-present-followup" / "instagram-grid"
EXTRA_OUT = ROOT / "public" / "threads-present-followup" / "instagram-grid-extra"

# Measured from the user-provided finished sample in 3.png.
CARD_BOX = (16, 367, 1064, 1042)  # left, top, right, bottom
CARD_BG = (250, 246, 238)


def load_selected(manifest_path: Path) -> list[dict]:
    data = json.loads(manifest_path.read_text(encoding="utf-8"))
    selected = data.get("selected") or []
    if not isinstance(selected, list):
        raise ValueError(f"selected is not a list: {manifest_path}")
    return selected


def render_template_card(source_path: Path, output_path: Path) -> None:
    canvas = Image.open(TEMPLATE).convert("RGB")
    before_after = Image.open(source_path).convert("RGB")
    left, top, right, bottom = CARD_BOX
    width = right - left
    height = bottom - top

    before_after.thumbnail((width, height), Image.Resampling.LANCZOS)
    layer = Image.new("RGB", (width, height), CARD_BG)
    layer.paste(before_after, ((width - before_after.width) // 2, (height - before_after.height) // 2))
    canvas.paste(layer, (left, top))

    output_path.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(output_path, "JPEG", quality=90, optimize=True, progressive=True)


def main() -> None:
    if not TEMPLATE.exists():
        raise FileNotFoundError(TEMPLATE)

    skipped: list[str] = []

    main_count = 0
    for item in load_selected(MAIN_MANIFEST):
        source_path = Path(item["beforeAfterPath"])
        output_path = MAIN_OUT / f'{item["index"]:03d}_{item["account"]}.jpg'
        render_template_card(source_path, output_path)
        main_count += 1

    extra_count = 0
    for item in load_selected(EXTRA_MANIFEST):
        source_path = Path(item["beforeAfterPath"])
        if not source_path.exists():
            skipped.append(str(source_path))
            continue
        output_path = EXTRA_OUT / item["beforeAfterFile"]
        render_template_card(source_path, output_path)
        extra_count += 1

    print(json.dumps({
        "ok": True,
        "main": main_count,
        "extra": extra_count,
        "skipped": skipped,
        "mainOut": str(MAIN_OUT),
        "extraOut": str(EXTRA_OUT),
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
