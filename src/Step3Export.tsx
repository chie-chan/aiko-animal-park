import JSZip from "jszip";
import { useEffect, useState } from "react";
import { type CellOffset, type GridSize, type SourceImage, renderCellToSize } from "./stamp-v2-split";
import type { BgPreview } from "./StampToolV2";
import { trackStampEvent } from "./stamp-v2-analytics";

interface Props {
  splitCells: SourceImage[];
  mainImageId: string;
  setMainImageId: (v: string) => void;
  tabImageId: string;
  setTabImageId: (v: string) => void;
  cellOffsets: Record<string, CellOffset>;
  bgPreview: BgPreview;
  setBgPreview: (v: BgPreview) => void;
  gridCols?: GridSize;
  gridRows?: GridSize;
}

const BG_OPTIONS: { value: BgPreview; label: string; cls: string }[] = [
  { value: "checker", label: "透明チェック柄", cls: "checker" },
  { value: "white", label: "白", cls: "white" },
  { value: "black", label: "黒", cls: "black" },
  { value: "pink", label: "ピンク", cls: "pink" },
  { value: "blue", label: "ブルー", cls: "blue" },
];

function bgClass(bg: BgPreview): string {
  return bg === "checker" ? "" : ` bg-${bg}`;
}

const MAIN_W = 240;
const MAIN_H = 240;
const TAB_W = 96;
const TAB_H = 74;
const LINE_STICKER_COUNTS = [8, 16, 24, 32, 40] as const;

type MetaTab = "main" | "tab";
type ExportPresetId = "sticker-max" | "emoji";
type LineStickerCount = (typeof LINE_STICKER_COUNTS)[number];

interface ExportPreset {
  id: ExportPresetId;
  label: string;
  sub: string;
  width: number;
  height: number;
  fileDigits: number;
  bodyLabel: string;
  includeMain: boolean;
  includeTab: boolean;
  downloadPrefix: string;
  defaultMargin: number;
}

const EXPORT_PRESETS: ExportPreset[] = [
  {
    id: "sticker-max",
    label: "スタンプ",
    sub: "370×320",
    width: 370,
    height: 320,
    fileDigits: 2,
    bodyLabel: "スタンプ本体",
    includeMain: true,
    includeTab: true,
    downloadPrefix: "uchinoko-stamps-max",
    defaultMargin: 10,
  },
  {
    id: "emoji",
    label: "絵文字",
    sub: "180×180",
    width: 180,
    height: 180,
    fileDigits: 3,
    bodyLabel: "絵文字本体",
    includeMain: false,
    includeTab: true,
    downloadPrefix: "uchinoko-emoji",
    defaultMargin: 15,
  },
];

function recommendedStickerCount(imageCount: number): LineStickerCount {
  const available = LINE_STICKER_COUNTS.filter((count) => count <= imageCount);
  return available[available.length - 1] ?? LINE_STICKER_COUNTS[0];
}

export default function Step3Export(props: Props) {
  const {
    splitCells,
    mainImageId, setMainImageId,
    tabImageId, setTabImageId,
    cellOffsets,
    bgPreview,
    setBgPreview,
    gridCols = 4,
    gridRows = 4,
  } = props;
  const isBatchLayout = splitCells.some((cell) => cell.id.startsWith("batch-")) || splitCells.length !== gridCols * gridRows;
  const gridStyle = {
    gridTemplateColumns: isBatchLayout ? "repeat(auto-fill, minmax(118px, 1fr))" : `repeat(${gridCols}, 1fr)`,
    pointerEvents: "none" as const,
  };

  const [activeTab, setActiveTab] = useState<MetaTab>("main");
  const [presetId, setPresetId] = useState<ExportPresetId>("sticker-max");
  const [exportCount, setExportCount] = useState<LineStickerCount>(() =>
    recommendedStickerCount(splitCells.length),
  );
  const [bodyMargin, setBodyMargin] = useState(10);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const preset = EXPORT_PRESETS.find((p) => p.id === presetId) ?? EXPORT_PRESETS[0];

  useEffect(() => {
    if (!preset.includeMain && activeTab === "main") setActiveTab("tab");
  }, [activeTab, preset.includeMain]);

  useEffect(() => {
    setBodyMargin(preset.defaultMargin);
  }, [preset.defaultMargin, preset.id]);

  useEffect(() => {
    setExportCount(recommendedStickerCount(splitCells.length));
  }, [splitCells.length]);

  const exportCells = splitCells.slice(0, exportCount);
  const missingCount = Math.max(0, exportCount - splitCells.length);
  const excludedCount = Math.max(0, splitCells.length - exportCount);
  const canDownload = splitCells.length >= exportCount;
  const mainCell = exportCells.find((c) => c.id === mainImageId) ?? exportCells[0] ?? splitCells[0];
  const tabCell = exportCells.find((c) => c.id === tabImageId) ?? exportCells[0] ?? splitCells[0];

  function offsetFor(id: string): CellOffset {
    return { dx: 0, dy: 0, scale: 1, ...(cellOffsets[id] ?? {}) };
  }

  function transformFor(id: string) {
    const o = offsetFor(id);
    const scale = o.scale ?? 1;
    if (!o.dx && !o.dy && scale === 1) return undefined;
    return `translate(${o.dx}%, ${o.dy}%) scale(${scale})`;
  }

  async function downloadZip() {
    if (!splitCells.length || busy) return;
    trackStampEvent("export_zip", {
      preset: preset.id,
      cellCount: splitCells.length,
      exportCount,
      width: preset.width,
      height: preset.height,
    });
    setBusy(true);
    setMessage("");

    try {
      const zip = new JSZip();
      for (let i = 0; i < exportCells.length; i += 1) {
        const cell = exportCells[i];
        const blob = await renderCellToSize(cell.src, preset.width, preset.height, offsetFor(cell.id), bodyMargin);
        zip.file(`${String(i + 1).padStart(preset.fileDigits, "0")}.png`, blob);
      }

      if (preset.includeMain && mainCell) {
        const mainBlob = await renderCellToSize(mainCell.src, MAIN_W, MAIN_H, offsetFor(mainCell.id));
        zip.file("main.png", mainBlob);
      }
      if (preset.includeTab && tabCell) {
        const tabBlob = await renderCellToSize(tabCell.src, TAB_W, TAB_H, offsetFor(tabCell.id));
        zip.file("tab.png", tabBlob);
      }

      const zipBlob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${preset.downloadPrefix}-${exportCount}枚-${preset.width}x${preset.height}-${Date.now()}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setMessage("ダウンロードしました");
    } catch (err) {
      console.error(err);
      setMessage("ZIP作成に失敗しました。もう一度試してください。");
    } finally {
      setBusy(false);
    }
  }

  if (!splitCells.length) {
    return (
      <div className="v2-placeholder">
        <div className="v2-placeholder-card">
          <h3>まだ画像がありません</h3>
          <p>「素材を取り込む」で{gridCols}×{gridRows}画像を分割、または完成済み画像を一括取り込みしてから戻ってきてください。</p>
        </div>
      </div>
    );
  }

  const isMainTab = activeTab === "main";
  const targetId = isMainTab ? mainCell?.id : tabCell?.id;
  const targetCell = isMainTab ? mainCell : tabCell;
  const setTargetId = isMainTab ? setMainImageId : setTabImageId;
  const metaCount = (preset.includeMain ? 1 : 0) + (preset.includeTab ? 1 : 0);

  return (
    <div className="v2-export-room">
      <section className="v2-export-left">
        <div className="v2-export-head">
          <span className="v2-export-title">LINE提出用の最終確認</span>
          <div className="v2-export-head-tools">
            <span className="v2-export-sub">
              {preset.bodyLabel} {preset.width}×{preset.height}
              {preset.includeMain && " / M = メイン画像"}
              {preset.includeTab && " / T = タブ画像"}
            </span>
            <div className="v2-bg-picker" role="group" aria-label="背景色プレビュー">
              <span className="v2-bg-picker-label">背景</span>
              {BG_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`v2-bg-swatch ${opt.cls}${bgPreview === opt.value ? " is-active" : ""}`}
                  onClick={() => setBgPreview(opt.value)}
                  aria-label={opt.label}
                  title={opt.label}
                />
              ))}
            </div>
          </div>
        </div>

        <div className={`v2-reorder-grid${isBatchLayout ? " is-batch-layout" : ""}`} style={gridStyle}>
          {splitCells.map((cell, index) => {
            const isMain = preset.includeMain && cell.id === mainImageId;
            const isTab = preset.includeTab && cell.id === tabImageId;
            const isExcluded = index >= exportCount;
            return (
              <div
                key={cell.id}
                className={`v2-reorder-cell${bgClass(bgPreview)}${isBatchLayout ? " is-batch-cell" : ""}${isExcluded ? " is-export-excluded" : ""}`}
                style={{ cursor: "default" }}
              >
                <span className="v2-reorder-cell-num">{index + 1}</span>
                {isExcluded && <span className="v2-reorder-cell-excluded">除外</span>}
                {(isMain || isTab) && (
                  <span className={`v2-reorder-cell-flag ${isMain ? "main" : "tab"}`}>
                    {isMain ? "M" : "T"}
                  </span>
                )}
                <img src={cell.src} alt={cell.name} style={{ transform: transformFor(cell.id) }} />
              </div>
            );
          })}
        </div>
      </section>

      <section className="v2-export-right">
        <div className="v2-export-preset-card">
          <span className="v2-export-preset-label">用途を選ぶ</span>
          <div className="v2-export-preset-grid">
            {EXPORT_PRESETS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={presetId === item.id ? "is-active" : ""}
                onClick={() => setPresetId(item.id)}
              >
                <span>{item.label}</span>
                <small>{item.sub}</small>
              </button>
            ))}
          </div>
          <label className="v2-export-margin-row">
            <span>
              自動余白 <strong>{bodyMargin}px</strong>
            </span>
            <input
              type="range"
              min={0}
              max={30}
              step={1}
              value={bodyMargin}
              onChange={(e) => setBodyMargin(Number(e.target.value))}
            />
          </label>
        </div>

        <div className="v2-export-count-card">
          <span className="v2-export-preset-label">LINEセット枚数</span>
          <div className="v2-export-count-grid" role="group" aria-label="LINEセット枚数">
            {LINE_STICKER_COUNTS.map((count) => (
              <button
                key={count}
                type="button"
                className={exportCount === count ? "is-active" : ""}
                disabled={splitCells.length < count}
                onClick={() => setExportCount(count)}
              >
                {count}
              </button>
            ))}
          </div>
          <p className={`v2-export-count-note${missingCount > 0 ? " is-warning" : ""}`}>
            {missingCount > 0
              ? `現在${splitCells.length}枚です。${exportCount}枚セットにはあと${missingCount}枚必要です。`
              : excludedCount > 0
                ? `現在${splitCells.length}枚です。先頭${exportCount}枚を書き出し、${excludedCount}枚は除外します。`
                : `現在${splitCells.length}枚です。${exportCount}枚セットで書き出します。`}
          </p>
        </div>

        <div className="v2-meta-tab-row" role="tablist">
          {preset.includeMain && (
            <button
              type="button"
              role="tab"
              className={`v2-meta-tab${isMainTab ? " is-active" : ""}`}
              onClick={() => setActiveTab("main")}
            >
              メイン画像
              <span className="v2-meta-tab-spec">240×240</span>
            </button>
          )}
          {preset.includeTab && (
            <button
              type="button"
              role="tab"
              className={`v2-meta-tab${!isMainTab ? " is-active" : ""}`}
              onClick={() => setActiveTab("tab")}
            >
              タブ画像
              <span className="v2-meta-tab-spec">96×74</span>
            </button>
          )}
        </div>

        <div className={`v2-meta-preview ${isMainTab ? "main" : "tab"}${bgClass(bgPreview)}`}>
          {targetCell && (
            <img src={targetCell.src} alt="" style={{ transform: transformFor(targetCell.id) }} />
          )}
        </div>

        <div className="v2-meta-strip">
          {exportCells.map((cell, i) => (
            <button
              key={cell.id}
              type="button"
              className={`v2-meta-thumb${bgClass(bgPreview)}${targetId === cell.id ? " is-selected" : ""}`}
              onClick={() => setTargetId(cell.id)}
              aria-label={`${i + 1}番を${isMainTab ? "メイン" : "タブ"}画像にする`}
            >
              <img src={cell.src} alt="" style={{ transform: transformFor(cell.id) }} />
              <span className="v2-meta-thumb-num">{i + 1}</span>
            </button>
          ))}
        </div>

        <button
          type="button"
          className="v2-btn-zip"
          onClick={downloadZip}
          disabled={busy || !canDownload || exportCells.length === 0}
          style={{ marginTop: 16 }}
        >
          {busy
            ? "ZIP作成中..."
            : missingCount > 0
              ? `あと${missingCount}枚必要`
              : `ZIPでダウンロード（${exportCount}枚${metaCount ? `＋${metaCount}枚` : ""}）`}
        </button>

        {message && (
          <p style={{ fontSize: 12, color: message.startsWith("ダウンロード") ? "var(--v2-pink)" : "#c66", margin: "10px 0 0", textAlign: "center", fontWeight: 800 }}>
            {message}
          </p>
        )}

        <ul className="v2-export-spec-list">
          <li>{preset.bodyLabel}：{preset.width}×{preset.height} 透過PNG ×{exportCount}（自動余白 {bodyMargin}px）</li>
          {presetId === "emoji" && <li>ファイル名：001.png〜（通常絵文字向け）</li>}
          {preset.includeMain && <li>main.png：240×240 透過PNG</li>}
          {preset.includeTab && <li>tab.png：96×74 透過PNG</li>}
          <li>LINE Creators Market へ出す前に、審査ガイドラインと表示を最終確認してください。</li>
        </ul>
      </section>
    </div>
  );
}
