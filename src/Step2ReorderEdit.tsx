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
  gridSize?: GridSize;
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

function clampOffsetValue(v: number) {
  return Math.max(-OFFSET_MAX, Math.min(OFFSET_MAX, v));
}

export default function Step2ReorderEdit(props: Props) {
  const {
    splitCells, setSplitCells,
    selectedIndex, setSelectedIndex,
    cellOffsets, setCellOffsets,
    mainImageId, tabImageId,
    bgPreview, setBgPreview,
    gridSize = 4,
  } = props;
  const gridStyle = { gridTemplateColumns: `repeat(${gridSize}, 1fr)` };

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
    return cellOffsets[id] ?? { dx: 0, dy: 0 };
  }
  function setOffsetFor(id: string, offset: CellOffset) {
    setCellOffsets({
      ...cellOffsets,
      [id]: { dx: clampOffsetValue(offset.dx), dy: clampOffsetValue(offset.dy) },
    });
  }
  function transformFor(id: string) {
    const o = offsetFor(id);
    if (!o.dx && !o.dy) return undefined;
    return `translate(${o.dx}%, ${o.dy}%)`;
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
    setOffsetFor(selectedCell.id, {
      dx: start.dx + dPctX,
      dy: start.dy + dPctY,
    });
  }
  function endOffsetDrag() {
    dragOffsetStart.current = null;
    setIsOffsetDragging(false);
  }

  function nudge(dx: number, dy: number) {
    if (!selectedCell) return;
    const o = offsetFor(selectedCell.id);
    setOffsetFor(selectedCell.id, { dx: o.dx + dx, dy: o.dy + dy });
  }
  function resetOffset() {
    if (!selectedCell) return;
    setOffsetFor(selectedCell.id, { dx: 0, dy: 0 });
  }

  if (!splitCells.length) {
    return (
      <div className="v2-placeholder">
        <div className="v2-placeholder-card">
          <h3>📥 まだ画像がありません</h3>
          <p>Step 1 で{gridSize}×{gridSize}画像を取り込んでから戻ってきてください。</p>
        </div>
      </div>
    );
  }

  const selectedOffset = selectedCell ? offsetFor(selectedCell.id) : { dx: 0, dy: 0 };

  return (
    <div className="v2-export-room">
      {/* LEFT: 並び順 + 選択 */}
      <section className="v2-export-left">
        <div className="v2-export-head">
          <span className="v2-export-title">並び順 / セル選択</span>
          <span className="v2-export-sub">ドラッグで並び替え／クリックで選択</span>
        </div>

        <div className="v2-reorder-grid" style={gridStyle}>
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
                  (isSelected ? " is-drop-target" : "")
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
            <span>位置を微調整 <strong style={{ color: "#c25b1f" }}>{safeSelectedIndex + 1}番</strong></span>
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

          <div className="v2-edit-readout">
            x: <strong>{selectedOffset.dx.toFixed(1)}%</strong>　　y: <strong>{selectedOffset.dy.toFixed(1)}%</strong>
          </div>
        </div>
      </section>
    </div>
  );
}
