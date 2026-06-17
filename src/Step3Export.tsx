import JSZip from "jszip";
import { useState } from "react";
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

const STAMP_W = 320;
const STAMP_H = 320;
const MAIN_W = 240;
const MAIN_H = 240;
const TAB_W = 96;
const TAB_H = 74;

type MetaTab = "main" | "tab";

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
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

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
        const blob = await renderCellToSize(cell.src, STAMP_W, STAMP_H, offsetFor(cell.id));
        zip.file(`${String(i + 1).padStart(2, "0")}.png`, blob);
      }

      if (mainCell) {
        const mainBlob = await renderCellToSize(mainCell.src, MAIN_W, MAIN_H, offsetFor(mainCell.id));
        zip.file("main.png", mainBlob);
      }
      if (tabCell) {
        const tabBlob = await renderCellToSize(tabCell.src, TAB_W, TAB_H, offsetFor(tabCell.id));
        zip.file("tab.png", tabBlob);
      }

      const zipBlob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `uchinoko-stamps-${Date.now()}.zip`;
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
          <p>Step 1 で{gridSize}×{gridSize}画像を取り込み、{gridSize * gridSize}枚に分割してから戻ってきてください。</p>
        </div>
      </div>
    );
  }

  const isMainTab = activeTab === "main";
  const targetId = isMainTab ? mainImageId : tabImageId;
  const targetCell = isMainTab ? mainCell : tabCell;
  const setTargetId = isMainTab ? setMainImageId : setTabImageId;

  return (
    <div className="v2-export-room">
      <section className="v2-export-left">
        <div className="v2-export-head">
          <span className="v2-export-title">スタンプ一覧（最終確認）</span>
          <span className="v2-export-sub">M = メイン画像 / T = タブ画像</span>
        </div>

        <div className="v2-reorder-grid" style={gridStyle}>
          {splitCells.map((cell, index) => {
            const isMain = cell.id === mainImageId;
            const isTab = cell.id === tabImageId;
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
        <div className="v2-meta-tab-row" role="tablist">
          <button
            type="button"
            role="tab"
            className={`v2-meta-tab${isMainTab ? " is-active" : ""}`}
            onClick={() => setActiveTab("main")}
          >
            メイン画像
            <span className="v2-meta-tab-spec">240×240</span>
          </button>
          <button
            type="button"
            role="tab"
            className={`v2-meta-tab${!isMainTab ? " is-active" : ""}`}
            onClick={() => setActiveTab("tab")}
          >
            タブ画像
            <span className="v2-meta-tab-spec">96×74</span>
          </button>
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
          {busy ? "ZIP作成中..." : `ZIPでダウンロード（${splitCells.length}枚＋メイン＋タブ）`}
        </button>

        {message && (
          <p style={{ fontSize: 12, color: message.startsWith("ダウンロード") ? "var(--v2-pink)" : "#c66", margin: "10px 0 0", textAlign: "center", fontWeight: 800 }}>
            {message}
          </p>
        )}

        <ul className="v2-export-spec-list">
          <li>スタンプ本体：320×320 透過PNG ×{splitCells.length}</li>
          <li>main.png：240×240 透過PNG</li>
          <li>tab.png：96×74 透過PNG</li>
          <li>LINE Creators Market にそのまま提出可能</li>
        </ul>
      </section>
    </div>
  );
}
