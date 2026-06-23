import JSZip from "jszip";
import { useEffect, useState } from "react";
import { type CellOffset, type GridSize, type SourceImage, renderCellToSize } from "./stamp-v2-split";
import type { BgPreview } from "./StampToolV2";

interface Props {
  splitCells: SourceImage[];
  mainImageId: string;
  setMainImageId: (v: string) => void;
  tabImageId: string;
  setTabImageId: (v: string) => void;
  cellOffsets: Record<string, CellOffset>;
  bgPreview: BgPreview;
  gridSize?: GridSize;
}

function bgClass(bg: BgPreview): string {
  return bg === "checker" ? "" : ` bg-${bg}`;
}

const MAIN_W = 240;
const MAIN_H = 240;
const TAB_W = 96;
const TAB_H = 74;

type MetaTab = "main" | "tab";
type ExportPresetId = "sticker-max" | "emoji";

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

export default function Step3Export(props: Props) {
  const {
    splitCells,
    mainImageId, setMainImageId,
    tabImageId, setTabImageId,
    cellOffsets,
    bgPreview,
    gridSize = 4,
  } = props;
  const gridStyle = { gridTemplateColumns: `repeat(${gridSize}, 1fr)`, pointerEvents: "none" as const };

  const [activeTab, setActiveTab] = useState<MetaTab>("main");
  const [presetId, setPresetId] = useState<ExportPresetId>("sticker-max");
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

  const mainCell = splitCells.find((c) => c.id === mainImageId) ?? splitCells[0];
  const tabCell = splitCells.find((c) => c.id === tabImageId) ?? splitCells[0];

  function offsetFor(id: string): CellOffset {
    return cellOffsets[id] ?? { dx: 0, dy: 0 };
  }

  function transformFor(id: string) {
    const o = offsetFor(id);
    if (!o.dx && !o.dy) return undefined;
    return `translate(${o.dx}%, ${o.dy}%)`;
  }

  async function downloadZip() {
    if (!splitCells.length || busy) return;
    setBusy(true);
    setMessage("");

    try {
      const zip = new JSZip();
      for (let i = 0; i < splitCells.length; i += 1) {
        const cell = splitCells[i];
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
      a.download = `${preset.downloadPrefix}-${preset.width}x${preset.height}-${Date.now()}.zip`;
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
          <p>「素材を取り込む」で{gridSize}×{gridSize}画像を分割、または完成済み画像を一括取り込みしてから戻ってきてください。</p>
        </div>
      </div>
    );
  }

  const isMainTab = activeTab === "main";
  const targetId = isMainTab ? mainImageId : tabImageId;
  const targetCell = isMainTab ? mainCell : tabCell;
  const setTargetId = isMainTab ? setMainImageId : setTabImageId;
  const metaCount = (preset.includeMain ? 1 : 0) + (preset.includeTab ? 1 : 0);

  return (
    <div className="v2-export-room">
      <section className="v2-export-left">
        <div className="v2-export-head">
          <span className="v2-export-title">LINE提出用の最終確認</span>
          <span className="v2-export-sub">
            {preset.bodyLabel} {preset.width}×{preset.height}
            {preset.includeMain && " / M = メイン画像"}
            {preset.includeTab && " / T = タブ画像"}
          </span>
        </div>

        <div className="v2-reorder-grid" style={gridStyle}>
          {splitCells.map((cell, index) => {
            const isMain = preset.includeMain && cell.id === mainImageId;
            const isTab = preset.includeTab && cell.id === tabImageId;
            return (
              <div key={cell.id} className={`v2-reorder-cell${bgClass(bgPreview)}`} style={{ cursor: "default" }}>
                <span className="v2-reorder-cell-num">{index + 1}</span>
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

        <div className={`v2-meta-preview ${isMainTab ? "main" : "tab"}`}>
          {targetCell && (
            <img src={targetCell.src} alt="" style={{ transform: transformFor(targetCell.id) }} />
          )}
        </div>

        <div className="v2-meta-strip">
          {splitCells.map((cell, i) => (
            <button
              key={cell.id}
              type="button"
              className={`v2-meta-thumb${targetId === cell.id ? " is-selected" : ""}`}
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
          disabled={busy || splitCells.length === 0}
          style={{ marginTop: 16 }}
        >
          {busy ? "ZIP作成中..." : `ZIPでダウンロード（${splitCells.length}枚${metaCount ? `＋${metaCount}枚` : ""}）`}
        </button>

        {message && (
          <p style={{ fontSize: 12, color: message.startsWith("ダウンロード") ? "var(--v2-pink)" : "#c66", margin: "10px 0 0", textAlign: "center", fontWeight: 800 }}>
            {message}
          </p>
        )}

        <ul className="v2-export-spec-list">
          <li>{preset.bodyLabel}：{preset.width}×{preset.height} 透過PNG ×{splitCells.length}（自動余白 {bodyMargin}px）</li>
          {presetId === "emoji" && <li>ファイル名：001.png〜（通常絵文字向け）</li>}
          {preset.includeMain && <li>main.png：240×240 透過PNG</li>}
          {preset.includeTab && <li>tab.png：96×74 透過PNG</li>}
          <li>LINE Creators Market へ出す前に、審査ガイドラインと表示を最終確認してください。</li>
        </ul>
      </section>
    </div>
  );
}
