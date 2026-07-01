import {
  type DragEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import "./stamp-mobile.css";
import {
  type CellCropOverride,
  type CellOffset,
  type EraseStroke,
  type GridSize,
  type SourceImage,
  centerImageContent,
  defaultCuts,
  eraseImageAtPoints,
  makeImageTransparent,
  readFileAsDataUrl,
  splitSheetImage,
} from "./stamp-v2-split";
import { FRAME_DESIGNS, type FrameDesign, type PetKind, type PetKindOrNone } from "./stamp-v2-frames";
import Step3MobileSave from "./Step3MobileSave";

const GRID_OPTIONS: { size: GridSize; label: string; count: number }[] = [
  { size: 3, label: "3×3", count: 9 },
  { size: 4, label: "4×4", count: 16 },
];

const MOBILE_FEATURED_IDS = [
  "simple",
  "sticker-solid",
  "cookie-cutter",
  "fruit-frame",
];

type EraserPoint = {
  x: number;
  y: number;
  imageW: number;
  imageH: number;
};

const PET_KIND_OPTIONS: { kind: PetKind; emoji: string; label: string }[] = [
  { kind: "犬", emoji: "🐶", label: "犬" },
  { kind: "猫", emoji: "🐱", label: "猫" },
  { kind: "うさぎ", emoji: "🐰", label: "うさぎ" },
  { kind: "ハムスター", emoji: "🐹", label: "ハムスター" },
  { kind: "その他", emoji: "✨", label: "その他" },
];

function normalizeCropOverride(next: CellCropOverride): CellCropOverride | null {
  const normalized: CellCropOverride = {
    shiftX: Math.max(-8, Math.min(8, next.shiftX ?? 0)),
    shiftY: Math.max(-8, Math.min(8, next.shiftY ?? 0)),
    padX: Math.max(0, Math.min(8, next.padX ?? 0)),
    padY: Math.max(0, Math.min(8, next.padY ?? 0)),
    zoom: Math.max(-8, Math.min(8, next.zoom ?? 0)),
  };
  const active =
    Math.abs(normalized.shiftX ?? 0) > 0.05 ||
    Math.abs(normalized.shiftY ?? 0) > 0.05 ||
    Math.abs(normalized.padX ?? 0) > 0.05 ||
    Math.abs(normalized.padY ?? 0) > 0.05 ||
    Math.abs(normalized.zoom ?? 0) > 0.05;
  return active ? normalized : null;
}

export default function StampToolMobile() {
  const [showDesignRoom, setShowDesignRoom] = useState(false);
  const [drStep, setDrStep] = useState<1 | 2 | 3 | 4>(1);
  const [showNotice, setShowNotice] = useState(false);

  const [selectedFrameId, setSelectedFrameId] = useState<string>(MOBILE_FEATURED_IDS[0]);
  const [petKind, setPetKind] = useState<PetKindOrNone>(null);
  const [petKindOther, setPetKindOther] = useState("");
  const [features, setFeatures] = useState("");
  const [copied, setCopied] = useState(false);

  const [gridSize, setGridSize] = useState<GridSize>(3);
  const [rawSheetSrc, setRawSheetSrc] = useState<string | null>(null);
  const [sheetSrc, setSheetSrc] = useState<string | null>(null);
  const [transparentEnabled, setTransparentEnabled] = useState(false);
  const [transparencyBusy, setTransparencyBusy] = useState(false);
  const [splitCells, setSplitCells] = useState<SourceImage[]>([]);
  const [splitMsg, setSplitMsg] = useState("");
  const [processingSplit, setProcessingSplit] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [cellCropOverrides, setCellCropOverrides] = useState<Record<number, CellCropOverride>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editPreviewRef = useRef<HTMLDivElement>(null);
  const eraseBusyRef = useRef(false);
  const eraseQueueRef = useRef<EraseStroke[]>([]);
  const eraseSourceRef = useRef<string | null>(null);
  const eraseTargetIndexRef = useRef<number | null>(null);
  const lastErasePointRef = useRef<EraserPoint | null>(null);
  const eraserPointerIdRef = useRef<number | null>(null);

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [cellOffsets, setCellOffsets] = useState<Record<string, CellOffset>>({});
  const [eraserEnabled, setEraserEnabled] = useState(false);
  const [eraseBusy, setEraseBusy] = useState(false);
  const [erasing, setErasing] = useState(false);
  const [eraserRadius, setEraserRadius] = useState(10);

  useEffect(() => {
    if (showDesignRoom) setDrStep(1);
  }, [showDesignRoom]);

  const expectedCellCount = gridSize * gridSize;
  const gridLabel = `${gridSize}×${gridSize}`;
  const selectedCell = splitCells[selectedIndex] ?? null;

  const mobileFrames = useMemo<FrameDesign[]>(
    () => FRAME_DESIGNS.filter((f) => MOBILE_FEATURED_IDS.includes(f.id)),
    [],
  );
  const selectedFrame = mobileFrames.find((f) => f.id === selectedFrameId) ?? mobileFrames[0];
  const generatedPrompt = useMemo(
    () => selectedFrame.buildPrompt({ petKind, petKindOther, features }, gridSize),
    [selectedFrame, petKind, petKindOther, features, gridSize],
  );
  const canCopy =
    petKind !== null && (petKind !== "その他" || petKindOther.trim().length > 0);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(generatedPrompt);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = generatedPrompt;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    }
  }

  async function handleFile(files: FileList | null) {
    if (!files || !files[0]) return;
    try {
      const url = await readFileAsDataUrl(files[0]);
      setRawSheetSrc(url);
      setSheetSrc(null);
      setSplitMsg("");
      setSelectedIndex(0);
      setCellOffsets({});
      setCellCropOverrides({});
    } catch (err) {
      console.error(err);
      setSplitMsg("画像の読み込みに失敗しました。");
    }
  }

  useEffect(() => {
    if (!rawSheetSrc) {
      setSheetSrc(null);
      setTransparencyBusy(false);
      return;
    }

    setSheetSrc(rawSheetSrc);
    setTransparencyBusy(false);
  }, [rawSheetSrc]);

  async function buildSplitCells(overrides: Record<number, CellCropOverride>) {
    if (!sheetSrc) return [];
    const cuts = defaultCuts(gridSize);
    const cells = await splitSheetImage(sheetSrc, 0, 0, cuts, cuts, gridSize, gridSize, overrides);
    let nextCells = cells.map((cell, index) => ({
      ...cell,
      id: `mobile-cell-${index}`,
      name: `stamp_${String(index + 1).padStart(2, "0")}.png`,
    }));
    if (transparentEnabled) {
      setTransparencyBusy(true);
      setSplitMsg("分割画像を透過しています...");
      nextCells = await Promise.all(
        nextCells.map(async (cell) => ({
          ...cell,
          src: await makeImageTransparent(cell.src),
        })),
      );
    }
    setSplitMsg("分割画像を中央にそろえています...");
    nextCells = await Promise.all(
      nextCells.map(async (cell) => ({
        ...cell,
        src: await centerImageContent(cell.src),
      })),
    );
    return nextCells;
  }

  async function regenerateSplitCells(
    overrides: Record<number, CellCropOverride>,
    options: { resetSelection?: boolean; message?: string } = {},
  ) {
    if (!sheetSrc) return;
    const keepIndex = Math.min(selectedIndex, Math.max(0, expectedCellCount - 1));
    setProcessingSplit(true);
    setSplitMsg(options.message ?? "");
    try {
      const nextCells = await buildSplitCells(overrides);
      setSplitCells(nextCells);
      setSelectedIndex(options.resetSelection ? 0 : Math.min(keepIndex, Math.max(0, nextCells.length - 1)));
      if (options.resetSelection) setCellOffsets({});
      eraseSourceRef.current = null;
      eraseTargetIndexRef.current = null;
      setSplitMsg(
        transparentEnabled
          ? `${nextCells.length}個に分割して透過しました。`
          : `${nextCells.length}個に分割しました。`,
      );
    } catch (err) {
      console.error(err);
      setSplitCells([]);
      setSplitMsg("分割に失敗しました。画像を確認してください。");
    } finally {
      setProcessingSplit(false);
      setTransparencyBusy(false);
    }
  }

  useEffect(() => {
    if (!sheetSrc) {
      setSplitCells([]);
      setProcessingSplit(false);
      return;
    }

    let cancelled = false;
    setProcessingSplit(true);
    setSplitMsg("");

    (async () => {
      try {
        const nextCells = await buildSplitCells(cellCropOverrides);
        if (cancelled) return;
        setSplitCells(nextCells);
        setSelectedIndex(0);
        setCellOffsets({});
        eraseSourceRef.current = null;
        eraseTargetIndexRef.current = null;
        setSplitMsg(
          transparentEnabled
            ? `${nextCells.length}個に分割して透過しました。`
            : `${nextCells.length}個に分割しました。`,
        );
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setSplitCells([]);
          setSplitMsg("分割に失敗しました。画像を確認してください。");
        }
      } finally {
        if (!cancelled) {
          setProcessingSplit(false);
          setTransparencyBusy(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // cellCropOverrides は個別補正時に手動再分割するため、ここでは依存させない。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheetSrc, gridSize, transparentEnabled]);

  function offsetFor(id: string): CellOffset {
    const offset = cellOffsets[id];
    return {
      dx: offset?.dx ?? 0,
      dy: offset?.dy ?? 0,
      scale: offset?.scale ?? 1,
    };
  }

  function cropOverrideFor(index: number): CellCropOverride {
    return { shiftX: 0, shiftY: 0, padX: 0, padY: 0, zoom: 0, ...(cellCropOverrides[index] ?? {}) };
  }

  function hasCropOverride(index: number) {
    return Boolean(cellCropOverrides[index]);
  }

  function updateSelectedCropOverride(patch: Partial<CellCropOverride>) {
    const current = cropOverrideFor(selectedIndex);
    const normalized = normalizeCropOverride({ ...current, ...patch });
    const next = { ...cellCropOverrides };
    if (normalized) next[selectedIndex] = normalized;
    else delete next[selectedIndex];
    setCellCropOverrides(next);
    void regenerateSplitCells(next, { message: "切り出し範囲を調整しています..." });
  }

  function nudgeCrop(dx: number, dy: number) {
    const current = cropOverrideFor(selectedIndex);
    updateSelectedCropOverride({
      shiftX: (current.shiftX ?? 0) + dx,
      shiftY: (current.shiftY ?? 0) + dy,
    });
  }

  function expandCrop(delta: number) {
    const current = cropOverrideFor(selectedIndex);
    updateSelectedCropOverride({
      padX: (current.padX ?? 0) + delta,
      padY: (current.padY ?? 0) + delta,
    });
  }

  function resetOffset() {
    if (!selectedCell) return;
    setCellOffsets({ ...cellOffsets, [selectedCell.id]: { dx: 0, dy: 0, scale: 1 } });
    const next = { ...cellCropOverrides };
    delete next[selectedIndex];
    setCellCropOverrides(next);
    void regenerateSplitCells(next, { message: "個別補正をリセットしています..." });
  }

  function transformFor(id: string) {
    const o = offsetFor(id);
    const scale = o.scale ?? 1;
    if (!o.dx && !o.dy && scale === 1) return undefined;
    return `translate(${o.dx}%, ${o.dy}%) scale(${scale})`;
  }

  function pointFromEditPreview(event: ReactPointerEvent<HTMLDivElement>): EraserPoint | null {
    const preview = editPreviewRef.current;
    const img = preview?.querySelector("img");
    if (!preview || !img) return null;

    const rect = img.getBoundingClientRect();
    const imageW = img.naturalWidth || 1;
    const imageH = img.naturalHeight || 1;
    const previewRatio = rect.width / rect.height;
    const imageRatio = imageW / imageH;
    let drawW = rect.width;
    let drawH = rect.height;
    let offsetX = 0;
    let offsetY = 0;

    if (imageRatio > previewRatio) {
      drawH = rect.width / imageRatio;
      offsetY = (rect.height - drawH) / 2;
    } else {
      drawW = rect.height * imageRatio;
      offsetX = (rect.width - drawW) / 2;
    }

    const x = (event.clientX - rect.left - offsetX) / drawW;
    const y = (event.clientY - rect.top - offsetY) / drawH;
    if (x < 0 || x > 1 || y < 0 || y > 1) return null;
    return { x, y, imageW, imageH };
  }

  function makeEraseStrokes(point: EraserPoint) {
    const previous = lastErasePointRef.current;
    lastErasePointRef.current = point;
    if (!previous) return [{ x: point.x, y: point.y, radius: eraserRadius }];

    const dx = (point.x - previous.x) * point.imageW;
    const dy = (point.y - previous.y) * point.imageH;
    const distance = Math.hypot(dx, dy);
    const spacing = Math.max(1, eraserRadius * 0.25);
    const steps = Math.max(1, Math.ceil(distance / spacing));
    const strokes: EraseStroke[] = [];

    for (let i = 1; i <= steps; i += 1) {
      const t = i / steps;
      strokes.push({
        x: previous.x + (point.x - previous.x) * t,
        y: previous.y + (point.y - previous.y) * t,
        radius: eraserRadius,
      });
    }
    return strokes;
  }

  function queueErase(event: ReactPointerEvent<HTMLDivElement>) {
    const point = pointFromEditPreview(event);
    if (!point) {
      lastErasePointRef.current = null;
      return;
    }
    eraseQueueRef.current.push(...makeEraseStrokes(point));
    void flushEraseQueue();
  }

  async function flushEraseQueue() {
    if (eraseBusyRef.current) return;
    const source = eraseSourceRef.current;
    const strokes = eraseQueueRef.current.splice(0);
    const targetIndex = eraseTargetIndexRef.current;
    if (!source || !strokes.length || targetIndex === null) return;

    eraseBusyRef.current = true;
    setEraseBusy(true);
    setSplitMsg("");
    try {
      const nextSrc = await eraseImageAtPoints(source, strokes);
      eraseSourceRef.current = nextSrc;
      setSplitCells((cells) =>
        cells.map((cell, index) => (index === targetIndex ? { ...cell, src: nextSrc } : cell)),
      );
    } catch (err) {
      console.error(err);
      setSplitMsg("消しゴム処理に失敗しました。");
    } finally {
      eraseBusyRef.current = false;
      setEraseBusy(false);
      if (eraseQueueRef.current.length) void flushEraseQueue();
    }
  }

  function startErase(event: ReactPointerEvent<HTMLDivElement>) {
    if (!eraserEnabled || !selectedCell) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    eraserPointerIdRef.current = event.pointerId;
    eraseSourceRef.current =
      eraseTargetIndexRef.current === selectedIndex && eraseSourceRef.current
        ? eraseSourceRef.current
        : selectedCell.src;
    eraseTargetIndexRef.current = selectedIndex;
    lastErasePointRef.current = null;
    setErasing(true);
    queueErase(event);
  }

  function moveErase(event: ReactPointerEvent<HTMLDivElement>) {
    if (!eraserEnabled || eraserPointerIdRef.current !== event.pointerId) return;
    event.preventDefault();
    queueErase(event);
  }

  function stopErase(event: ReactPointerEvent<HTMLDivElement>) {
    if (eraserPointerIdRef.current !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    eraserPointerIdRef.current = null;
    lastErasePointRef.current = null;
    setErasing(false);
  }

  function changeGridSize(size: GridSize) {
    setGridSize(size);
    setSelectedIndex(0);
    setCellCropOverrides({});
    setCellOffsets({});
  }

  function handleDrop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    setDragActive(false);
    void handleFile(event.dataTransfer.files);
  }

  function handleDragOver(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setDragActive(true);
  }

  function handleDragLeave() {
    setDragActive(false);
  }

  const busyMessage = transparencyBusy
    ? "透過中..."
    : processingSplit
      ? "分割中..."
      : splitMsg;

  return (
    <div className="vm-shell">
      <header className="vm-topbar">
        <div className="vm-topbar-row">
          <div className="vm-topbar-title">
            <span className="vm-topbar-kicker">UCHINOKO STAMP MOBILE</span>
            <span className="vm-topbar-name">うちのこスタンプ工房（スマホ版）</span>
          </div>
          <div className="vm-topbar-actions">
            <a className="vm-topbar-btn" href="/stamp-room" title="PC版を開く">
              PC版
            </a>
            <button
              type="button"
              className="vm-topbar-btn"
              onClick={() => setShowNotice(true)}
              aria-label="注意事項"
            >
              i
            </button>
            <button
              type="button"
              className="vm-topbar-btn is-primary"
              onClick={() => setShowDesignRoom(true)}
            >
              プロンプト
            </button>
          </div>
        </div>
      </header>

      <main className="vm-main">
        <section className="vm-card vm-upload-panel">
          <div className="vm-card-head">
            <div>
              <h3 className="vm-card-title">画像を入れる</h3>
              <p className="vm-card-sub">{gridLabel}の画像を選ぶと、下に分割画像が出ます。</p>
            </div>
            <div className="vm-size-toggle" role="group" aria-label="分割数">
              {GRID_OPTIONS.map((option) => (
                <button
                  key={option.size}
                  type="button"
                  className={gridSize === option.size ? "is-on" : ""}
                  onClick={() => changeGridSize(option.size)}
                >
                  <strong>{option.label}</strong>
                  <span>{option.count}個</span>
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            className={`vm-drop-zone${dragActive ? " is-dragging" : ""}`}
            onClick={() => fileInputRef.current?.click()}
            onDragEnter={handleDragOver}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <strong>{sheetSrc ? "画像を差し替える" : "画像を選ぶ"}</strong>
            <span className="hint">タップまたはドラッグ&ドロップ / PNG・JPG・WebP</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => handleFile(e.target.files)}
          />

          {sheetSrc && (
            <div className="vm-source-preview">
              <img src={sheetSrc} alt="取り込んだ画像" />
            </div>
          )}

          {(transparencyBusy || processingSplit || splitMsg) && (
            <p className={`vm-inline-msg${splitMsg.includes("失敗") ? " is-error" : ""}`}>
              {busyMessage}
            </p>
          )}
        </section>

        {splitCells.length === 0 && !processingSplit && (
          <div className="vm-placeholder">
            <h3>まだ画像がありません</h3>
            <p>上のボタンから画像を選んでください。</p>
          </div>
        )}

        {splitCells.length > 0 && (
          <>
            <section className="vm-card">
              <div className="vm-split-head">
                <div>
                  <h3 className="vm-card-title">分割画像</h3>
                  <p className="vm-card-sub">
                    {splitCells.length}個にカット済み。修正したいコマをタップしてください。
                  </p>
                </div>
                <span className="vm-split-count">{splitCells.length}個</span>
              </div>

              <div
                className="vm-reorder-grid"
                style={{ gridTemplateColumns: `repeat(${gridSize}, 1fr)` }}
              >
                {splitCells.map((cell, index) => {
                  const isSelected = index === selectedIndex;
                  return (
                    <button
                      key={cell.id}
                      type="button"
                      className={`vm-reorder-cell${isSelected ? " is-selected" : ""}${hasCropOverride(index) ? " is-crop-adjusted" : ""}`}
                      onClick={() => setSelectedIndex(index)}
                      aria-label={`${index + 1}番を選択`}
                    >
                      <span className="vm-reorder-cell-num">{index + 1}</span>
                      <img src={cell.src} alt={cell.name} style={{ transform: transformFor(cell.id) }} />
                      {hasCropOverride(index) && <span className="vm-crop-badge">補正</span>}
                    </button>
                  );
                })}
              </div>

              <label className={`vm-transparent-toggle vm-transparent-after-split${transparentEnabled ? " is-on" : ""}`}>
                <input
                  type="checkbox"
                  checked={transparentEnabled}
                  disabled={transparencyBusy}
                  onChange={(e) => setTransparentEnabled(e.target.checked)}
                />
                <span>自動透過</span>
                <small>分割後の各コマに、PC版と同じ白背景透過をかけます</small>
              </label>
            </section>

            {selectedCell && (
              <section className="vm-card vm-edit-panel">
                <div className="vm-edit-head">
                  <h3 className="vm-card-title">{selectedIndex + 1}番を部分修正</h3>
                  <button type="button" className="vm-topbar-btn" onClick={resetOffset}>
                    リセット
                  </button>
                </div>
                <div className="vm-edit-body">
                  <div
                    ref={editPreviewRef}
                    className={`vm-edit-preview${eraserEnabled ? " is-eraser" : ""}${erasing ? " is-drawing" : ""}`}
                    onPointerDown={startErase}
                    onPointerMove={moveErase}
                    onPointerUp={stopErase}
                    onPointerCancel={stopErase}
                  >
                    <img
                      src={selectedCell.src}
                      alt={selectedCell.name}
                      style={{ transform: transformFor(selectedCell.id) }}
                    />
                    {eraserEnabled && <span className="vm-eraser-hint">なぞって消す</span>}
                  </div>
                  <div className="vm-edit-actions">
                    <div className="vm-eraser-row">
                      <button
                        type="button"
                        className={eraserEnabled ? "is-on" : ""}
                        onClick={() => setEraserEnabled((v) => !v)}
                      >
                        消しゴム
                      </button>
                      <button
                        type="button"
                        onClick={() => setEraserRadius((r) => Math.max(4, r - 2))}
                        disabled={eraseBusy}
                      >
                        細
                      </button>
                      <span>{eraserRadius}px</span>
                      <button
                        type="button"
                        onClick={() => setEraserRadius((r) => Math.min(32, r + 2))}
                        disabled={eraseBusy}
                      >
                        太
                      </button>
                    </div>
                    {eraseBusy && <p className="vm-eraser-status">消しています...</p>}
                    <div className="vm-edit-pad" aria-label="位置調整">
                      <span className="vm-edit-empty" />
                      <button type="button" aria-label="切り出し範囲を上へ" onClick={() => nudgeCrop(0, -1)}>↑</button>
                      <span className="vm-edit-empty" />
                      <button type="button" aria-label="切り出し範囲を左へ" onClick={() => nudgeCrop(-1, 0)}>←</button>
                      <button type="button" className="center" aria-label="中央に戻す" onClick={resetOffset}>0</button>
                      <button type="button" aria-label="切り出し範囲を右へ" onClick={() => nudgeCrop(1, 0)}>→</button>
                      <span className="vm-edit-empty" />
                      <button type="button" aria-label="切り出し範囲を下へ" onClick={() => nudgeCrop(0, 1)}>↓</button>
                      <span className="vm-edit-empty" />
                    </div>
                    <div className="vm-zoom-row">
                      <button type="button" onClick={() => expandCrop(-0.5)}>狭く</button>
                      <span>範囲 +{Math.max(cropOverrideFor(selectedIndex).padX ?? 0, cropOverrideFor(selectedIndex).padY ?? 0).toFixed(1)}%</span>
                      <button type="button" onClick={() => expandCrop(0.5)}>広げる</button>
                    </div>
                  </div>
                </div>
              </section>
            )}

            {splitCells.length === expectedCellCount && (
              <Step3MobileSave splitCells={splitCells} cellOffsets={cellOffsets} />
            )}
          </>
        )}
      </main>

      {showDesignRoom && (
        <div className="vm-sheet-overlay" onClick={(e) => {
          if (e.target === e.currentTarget) setShowDesignRoom(false);
        }}>
          <div className="vm-sheet vm-sheet-wizard">
            <div className="vm-sheet-bar">
              <span className="vm-sheet-title">
                <small>DESIGN ROOM ・ {drStep} / 4</small>
                プロンプトを作る
              </span>
              <button
                type="button"
                className="vm-sheet-close"
                onClick={() => setShowDesignRoom(false)}
                aria-label="閉じる"
              >
                ×
              </button>
            </div>

            <div className="vm-dr-progress" aria-hidden="true">
              {[1, 2, 3, 4].map((n) => (
                <span key={n} className={`vm-dr-dot${drStep === n ? " is-active" : ""}${drStep > n ? " is-done" : ""}`} />
              ))}
            </div>

            <div className="vm-dr-body">
              {drStep === 1 && (
                <section className="vm-dr-page">
                  <div className="vm-dr-step-head">
                    <span className="vm-dr-step-num">1</span>
                    <span className="vm-dr-step-title">テンプレートを選ぶ</span>
                  </div>
                  <div className="vm-frame-list-3">
                    {mobileFrames.map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        className={`vm-frame-card${selectedFrameId === f.id ? " is-selected" : ""}`}
                        onClick={() => setSelectedFrameId(f.id)}
                      >
                        <div className="vm-frame-thumb">
                          {f.thumbSrc ? (
                            <img
                              src={f.thumbSrc}
                              alt={f.name}
                              onError={(e) => {
                                const img = e.currentTarget;
                                const parent = img.parentElement;
                                if (parent) {
                                  img.style.display = "none";
                                  parent.textContent = f.emoji;
                                }
                              }}
                            />
                          ) : (
                            f.emoji
                          )}
                        </div>
                        <span className="vm-frame-name">{f.name}</span>
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {drStep === 2 && (
                <section className="vm-dr-page">
                  <div className="vm-dr-step-head">
                    <span className="vm-dr-step-num">2</span>
                    <span className="vm-dr-step-title">動物の種類を選ぶ</span>
                  </div>
                  <div className="vm-pet-grid">
                    {PET_KIND_OPTIONS.map(({ kind, emoji, label }) => (
                      <button
                        key={kind}
                        type="button"
                        className={`vm-pet-card${petKind === kind ? " is-checked" : ""}`}
                        onClick={() => setPetKind(kind)}
                      >
                        <span className="vm-pet-emoji">{emoji}</span>
                        <span className="vm-pet-label">{label}</span>
                      </button>
                    ))}
                  </div>
                  {petKind === "その他" && (
                    <input
                      className="vm-form-input"
                      type="text"
                      value={petKindOther}
                      onChange={(e) => setPetKindOther(e.target.value)}
                      placeholder="例：インコ / フェレット"
                      style={{ marginTop: 10 }}
                    />
                  )}
                </section>
              )}

              {drStep === 3 && (
                <section className="vm-dr-page">
                  <div className="vm-dr-step-head">
                    <span className="vm-dr-step-num">3</span>
                    <span className="vm-dr-step-title">特徴を入れる</span>
                  </div>
                  <textarea
                    id="vm-features"
                    className="vm-form-textarea"
                    value={features}
                    onChange={(e) => setFeatures(e.target.value)}
                    placeholder="例：白黒のミックス、大きな耳、ふわふわの毛"
                    rows={4}
                  />
                </section>
              )}

              {drStep === 4 && (
                <section className="vm-dr-page">
                  <div className="vm-dr-step-head">
                    <span className="vm-dr-step-num">4</span>
                    <span className="vm-dr-step-title">{gridLabel}用プロンプト</span>
                  </div>
                  <button
                    type="button"
                    className={`vm-copy-btn${copied ? " is-copied" : ""}`}
                    onClick={handleCopy}
                    disabled={!canCopy}
                  >
                    {copied ? "コピーしました" : "プロンプトをコピー"}
                  </button>
                  <p className="vm-dr-flow">
                    ChatGPTで{gridLabel}画像を作り、この画面に戻ってアップロードします。
                  </p>
                </section>
              )}
            </div>

            <div className="vm-dr-nav">
              <button
                type="button"
                className="vm-dr-nav-back"
                onClick={() => setDrStep((s) => Math.max(1, s - 1) as 1 | 2 | 3 | 4)}
                disabled={drStep === 1}
              >
                戻る
              </button>
              {drStep < 4 ? (
                <button
                  type="button"
                  className="vm-dr-nav-next"
                  onClick={() => setDrStep((s) => Math.min(4, s + 1) as 1 | 2 | 3 | 4)}
                  disabled={drStep === 2 && !canCopy}
                >
                  次へ
                </button>
              ) : (
                <button
                  type="button"
                  className="vm-dr-nav-next"
                  onClick={() => setShowDesignRoom(false)}
                >
                  閉じる
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {showNotice && (
        <div className="vm-sheet-overlay" onClick={(e) => {
          if (e.target === e.currentTarget) setShowNotice(false);
        }}>
          <div className="vm-sheet">
            <div className="vm-sheet-bar">
              <span className="vm-sheet-title">ご利用にあたって</span>
              <button
                type="button"
                className="vm-sheet-close"
                onClick={() => setShowNotice(false)}
                aria-label="閉じる"
              >
                ×
              </button>
            </div>
            <div className="vm-notice-body">
              <h4>このツールの位置づけ</h4>
              <p>
                AIで作ったグリッド画像を分割し、必要なコマだけ位置や大きさを整えて保存するためのスマホ版です。
              </p>
              <h4>LINE審査について</h4>
              <p>
                出力画像は素材準備用です。LINE Creators MarketやLINEスタンプメーカーでの最終確認は別途行ってください。
              </p>
              <h4>権利関係</h4>
              <ul>
                <li>ご自身が撮影した、または使用許諾のある写真のみ使用してください</li>
                <li>既存のキャラクター・有名人・他人のペットを真似た画像は避けてください</li>
              </ul>
            </div>
            <button
              type="button"
              className="vm-copy-btn"
              onClick={() => setShowNotice(false)}
              style={{ marginTop: 14 }}
            >
              閉じる
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
