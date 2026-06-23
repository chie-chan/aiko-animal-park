import { useEffect, useRef, useState } from "react";
import type { CellOffset, GridSize, SourceImage } from "./stamp-v2-split";
import type { BgPreview } from "./StampToolV2";

// ======================================================================
// Step2ReorderEdit ―  並び替え＋選択中セルの位置微調整
// 並び順入れ替え（HTML5 DnD）と、選択中セルのオフセット編集を同時に行う
// ======================================================================

interface Props {
  splitCells: SourceImage[];
  setSplitCells: (v: SourceImage[]) => void;
  selectedIndex: number;
  setSelectedIndex: (v: number) => void;
  cellOffsets: Record<string, CellOffset>;
  setCellOffsets: (v: Record<string, CellOffset>) => void;
  mainImageId: string;
  tabImageId: string;
  bgPreview: BgPreview;
  setBgPreview: (v: BgPreview) => void;
  gridCols?: GridSize;
  gridRows?: GridSize;
}

const BG_OPTIONS: { value: BgPreview; label: string; cls: string }[] = [
  { value: "checker", label: "透過チェック柄", cls: "checker" },
  { value: "white", label: "白", cls: "white" },
  { value: "black", label: "黒", cls: "black" },
  { value: "pink", label: "ピンク", cls: "pink" },
  { value: "blue", label: "ブルー", cls: "blue" },
];

function bgClass(bg: BgPreview): string {
  return bg === "checker" ? "" : ` bg-${bg}`;
}

const ARROW_STEP = 1.5; // % per arrow click
const OFFSET_MAX = 50;
const SCALE_MIN = 0.65;
const SCALE_MAX = 1.8;
const SCALE_STEP = 0.05;

function clampOffsetValue(v: number) {
  return Math.max(-OFFSET_MAX, Math.min(OFFSET_MAX, v));
}

function clampScale(v: number) {
  return Math.max(SCALE_MIN, Math.min(SCALE_MAX, v));
}

export default function Step2ReorderEdit(props: Props) {
  const {
    splitCells, setSplitCells,
    selectedIndex, setSelectedIndex,
    cellOffsets, setCellOffsets,
    mainImageId, tabImageId,
    bgPreview, setBgPreview,
    gridCols = 4,
    gridRows = 4,
  } = props;
  const isBatchLayout = splitCells.some((cell) => cell.id.startsWith("batch-")) || splitCells.length !== gridCols * gridRows;
  const gridStyle = {
    gridTemplateColumns: isBatchLayout ? "repeat(auto-fill, minmax(118px, 1fr))" : `repeat(${gridCols}, 1fr)`,
  };

  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const editPreviewRef = useRef<HTMLDivElement>(null);
  const dragOffsetStart = useRef<{ x: number; y: number; dx: number; dy: number } | null>(null);
  const [isOffsetDragging, setIsOffsetDragging] = useState(false);

  const safeSelectedIndex = Math.min(Math.max(0, selectedIndex), Math.max(0, splitCells.length - 1));
  const selectedCell = splitCells[safeSelectedIndex] ?? splitCells[0];

  useEffect(() => {
    if (selectedIndex >= splitCells.length) {
      setSelectedIndex(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [splitCells.length]);

  function offsetFor(id: string): CellOffset {
    return { dx: 0, dy: 0, scale: 1, ...(cellOffsets[id] ?? {}) };
  }
  function setOffsetFor(id: string, offset: CellOffset) {
    setCellOffsets({
      ...cellOffsets,
      [id]: {
        dx: clampOffsetValue(offset.dx),
        dy: clampOffsetValue(offset.dy),
        scale: clampScale(offset.scale ?? 1),
      },
    });
  }
  function transformFor(id: string) {
    const o = offsetFor(id);
    const scale = o.scale ?? 1;
    if (!o.dx && !o.dy && scale === 1) return undefined;
    return `translate(${o.dx}%, ${o.dy}%) scale(${scale})`;
  }

  function handleDragStart(_e: React.DragEvent, index: number) {
    setDraggingIndex(index);
  }
  function handleDragOver(e: React.DragEvent, index: number) {
    e.preventDefault();
    if (overIndex !== index) setOverIndex(index);
  }
  function handleDrop(e: React.DragEvent, index: number) {
    e.preventDefault();
    if (draggingIndex === null || draggingIndex === index) {
      setDraggingIndex(null);
      setOverIndex(null);
      return;
    }
    const next = [...splitCells];
    const [moved] = next.splice(draggingIndex, 1);
    next.splice(index, 0, moved);
    setSplitCells(next);
    setSelectedIndex(index);
    setDraggingIndex(null);
    setOverIndex(null);
  }
  function handleDragEnd() {
    setDraggingIndex(null);
    setOverIndex(null);
  }

  function startOffsetDrag(e: React.PointerEvent) {
    if (!selectedCell || !editPreviewRef.current) return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const o = offsetFor(selectedCell.id);
    dragOffsetStart.current = { x: e.clientX, y: e.clientY, dx: o.dx, dy: o.dy };
    setIsOffsetDragging(true);
  }
  function onOffsetDragMove(e: React.PointerEvent) {
    if (!dragOffsetStart.current || !selectedCell || !editPreviewRef.current) return;
    const rect = editPreviewRef.current.getBoundingClientRect();
    const start = dragOffsetStart.current;
    const dPctX = ((e.clientX - start.x) / rect.width) * 100;
    const dPctY = ((e.clientY - start.y) / rect.height) * 100;
    const o = offsetFor(selectedCell.id);
    setOffsetFor(selectedCell.id, {
      dx: start.dx + dPctX,
      dy: start.dy + dPctY,
      scale: o.scale,
    });
  }
  function endOffsetDrag() {
    dragOffsetStart.current = null;
    setIsOffsetDragging(false);
  }

  function nudge(dx: number, dy: number) {
    if (!selectedCell) return;
    const o = offsetFor(selectedCell.id);
    setOffsetFor(selectedCell.id, { dx: o.dx + dx, dy: o.dy + dy, scale: o.scale });
  }
  function resetOffset() {
    if (!selectedCell) return;
    setOffsetFor(selectedCell.id, { dx: 0, dy: 0, scale: 1 });
  }
  function setScale(scale: number) {
    if (!selectedCell) return;
    const o = offsetFor(selectedCell.id);
    setOffsetFor(selectedCell.id, { ...o, scale });
  }
  function zoomBy(delta: number) {
    if (!selectedCell) return;
    const o = offsetFor(selectedCell.id);
    setOffsetFor(selectedCell.id, { ...o, scale: (o.scale ?? 1) + delta });
  }

  if (!splitCells.length) {
    return (
      <div className="v2-placeholder">
        <div className="v2-placeholder-card">
          <h3>📥 まだ画像がありません</h3>
          <p>「素材を取り込む」で{gridCols}×{gridRows}画像、または完成済み画像を読み込んでから戻ってきてください。</p>
        </div>
      </div>
    );
  }

  const selectedOffset = selectedCell ? offsetFor(selectedCell.id) : { dx: 0, dy: 0, scale: 1 };

  return (
    <div className="v2-export-room">
      {/* LEFT: 並び順 + 選択 */}
      <section className="v2-export-left">
        <div className="v2-export-head">
          <span className="v2-export-title">画像を整える</span>
          <div className="v2-export-head-tools">
            <span className="v2-export-sub">ドラッグで並び替え／クリックで位置調整対象を選択</span>
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
            const isMain = cell.id === mainImageId;
            const isTab = cell.id === tabImageId;
            const isSelected = index === safeSelectedIndex;
            return (
              <div
                key={cell.id}
                className={
                  "v2-reorder-cell" +
                  bgClass(bgPreview) +
                  (draggingIndex === index ? " is-dragging" : "") +
                  (overIndex === index && draggingIndex !== null && draggingIndex !== index ? " is-drop-target" : "") +
                  (isSelected ? " is-drop-target" : "") +
                  (isBatchLayout ? " is-batch-cell" : "")
                }
                draggable
                onClick={() => setSelectedIndex(index)}
                onDragStart={(e) => handleDragStart(e, index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDrop={(e) => handleDrop(e, index)}
                onDragEnd={handleDragEnd}
              >
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

      {/* RIGHT: 位置微調整 */}
      <section className="v2-export-right">
        <div className="v2-edit-card" style={{ marginBottom: 0 }}>
          <div className="v2-edit-card-title">
            <span>選択画像の位置 <strong style={{ color: "#c25b1f" }}>{safeSelectedIndex + 1}番</strong></span>
          </div>

          <div
            ref={editPreviewRef}
            className={`v2-edit-preview${bgClass(bgPreview)}${isOffsetDragging ? " is-dragging" : ""}`}
            onPointerDown={startOffsetDrag}
            onPointerMove={onOffsetDragMove}
            onPointerUp={endOffsetDrag}
            onPointerCancel={endOffsetDrag}
          >
            <img
              src={selectedCell.src}
              alt=""
              style={{ transform: transformFor(selectedCell.id) }}
              draggable={false}
            />
          </div>

          <div className="v2-edit-controls">
            <button type="button" className="v2-edit-arrow-empty" tabIndex={-1} />
            <button type="button" className="v2-edit-arrow" aria-label="上へ" onClick={() => nudge(0, -ARROW_STEP)}>↑</button>
            <button type="button" className="v2-edit-arrow-empty" tabIndex={-1} />
            <button type="button" className="v2-edit-arrow" aria-label="左へ" onClick={() => nudge(-ARROW_STEP, 0)}>←</button>
            <button type="button" className="v2-edit-arrow center" aria-label="リセット" onClick={resetOffset}>0</button>
            <button type="button" className="v2-edit-arrow" aria-label="右へ" onClick={() => nudge(ARROW_STEP, 0)}>→</button>
            <button type="button" className="v2-edit-arrow-empty" tabIndex={-1} />
            <button type="button" className="v2-edit-arrow" aria-label="下へ" onClick={() => nudge(0, ARROW_STEP)}>↓</button>
            <button type="button" className="v2-edit-arrow-empty" tabIndex={-1} />
          </div>

          <label className="v2-edit-scale">
            <span>拡大 <strong>{Math.round((selectedOffset.scale ?? 1) * 100)}%</strong></span>
            <input
              type="range"
              min={SCALE_MIN}
              max={SCALE_MAX}
              step={0.01}
              value={selectedOffset.scale ?? 1}
              onChange={(e) => setScale(Number(e.target.value))}
            />
          </label>
          <div className="v2-edit-zoom-row">
            <button type="button" onClick={() => zoomBy(-SCALE_STEP)}>-</button>
            <button type="button" onClick={() => zoomBy(SCALE_STEP)}>+</button>
          </div>

          <div className="v2-edit-readout">
            x: <strong>{selectedOffset.dx.toFixed(1)}%</strong>　　y: <strong>{selectedOffset.dy.toFixed(1)}%</strong>　　拡大: <strong>{Math.round((selectedOffset.scale ?? 1) * 100)}%</strong>
          </div>
        </div>
      </section>
    </div>
  );
}
