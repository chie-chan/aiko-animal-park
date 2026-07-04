import { useEffect, useMemo, useRef, useState } from "react";
import {
  type CellCropOverride,
  type GridSize,
  type SheetProfiles,
  type SourceImage,
  addWhiteOutline,
  buildSheetProfiles,
  centerImageContent,
  clamp,
  defaultCuts,
  eraseImageAtPoints,
  type EraseStroke,
  findValleyCut,
  linePosition,
  makeImageTransparent,
  pickImageColor,
  readFileAsDataUrl,
  type RgbColor,
  safeCuts,
  splitSheetImage,
} from "./stamp-v2-split";
import { trackStampEvent } from "./stamp-v2-analytics";

// ======================================================================
// Step2Splitter ―  シートをセルに分割（ライブプレビュー＋クリック拡大）
// gridCols/gridRows=1〜5 に対応。
// 取り込み時は元画像のまま分割し、背景透過は Step3 の背景透過フェーズで実行する。
// ======================================================================

interface Props {
  phase?: "import" | "grid" | "background";
  sheetSrc: string | null;
  setSheetSrc: (v: string | null) => void;
  verticalCuts: number[];
  setVerticalCuts: (v: number[]) => void;
  horizontalCuts: number[];
  setHorizontalCuts: (v: number[]) => void;
  splitCells: SourceImage[];
  setSplitCells: (v: SourceImage[]) => void;
  cellCropOverrides: Record<number, CellCropOverride>;
  setCellCropOverrides: (v: Record<number, CellCropOverride>) => void;
  gridCols?: GridSize;
  gridRows?: GridSize;
  onChangeGridCols?: (g: GridSize) => void;
  onChangeGridRows?: (g: GridSize) => void;
  onImportModeChange?: (mode: "sheet" | "batch" | null) => void;
  onImportComplete?: (mode: "sheet" | "batch") => void;
  /** おまかせ処理/シート合算の完了時（親はそのまま確認画面=画像配置へ進める）
   *  fresh=新規セット / append=既存セットへの追加（既存コマの調整は保持する） */
  onAutoPilotComplete?: (mode: "fresh" | "append") => void;
}

type DragAxis = "vertical" | "horizontal";
type BgTool = "auto" | "color" | "eraser";
const BG_SIDEBAR_TOOLS = [
  ["auto", "自動"],
  ["color", "色クリック"],
] as const;
const BG_MODAL_TOOLS = [
  ["auto", "自動"],
  ["color", "色クリック"],
  ["eraser", "消しゴム"],
] as const;
type BgUndoSnapshot =
  | { kind: "sheet"; src: string; bgTransparent: boolean }
  | { kind: "batch-cell"; index: number; src: string }
  | { kind: "batch-all"; cells: SourceImage[] };

const OUTER_PADDING = 0;
const MAX_BATCH_IMAGES = 40;
const BG_UNDO_LIMIT = 6;

// 分割プレビューの背景切替（透過の見やすさ用）
const CHECKER_BG =
  "repeating-conic-gradient(#f4ebf3 0deg 90deg, #fff 90deg 180deg) 0 0 / 10px 10px";
const LIVE_BGS: { key: string; label: string; css: string; swatch: string }[] = [
  { key: "checker", label: "市松", css: CHECKER_BG, swatch: "repeating-conic-gradient(#e8dbe5 0deg 90deg, #fff 90deg 180deg) 0 0 / 6px 6px" },
  { key: "white", label: "白", css: "#ffffff", swatch: "#ffffff" },
  { key: "black", label: "黒", css: "#2b2b2b", swatch: "#2b2b2b" },
  { key: "pink", label: "桃", css: "#ffd9e7", swatch: "#ffd9e7" },
  { key: "blue", label: "青", css: "#cfe6ff", swatch: "#cfe6ff" },
];

interface CellRegion {
  x: number; // 0-100%
  y: number;
  w: number;
  h: number;
}

export default function Step2Splitter(props: Props) {
  const {
    phase = "grid",
    sheetSrc, setSheetSrc,
    verticalCuts, setVerticalCuts,
    horizontalCuts, setHorizontalCuts,
    splitCells, setSplitCells,
    cellCropOverrides, setCellCropOverrides,
    gridCols = 4,
    gridRows = 4,
    onChangeGridCols,
    onChangeGridRows,
    onImportModeChange,
    onImportComplete,
    onAutoPilotComplete,
  } = props;

  function renderGridDimensionSlider(
    kind: "cols" | "rows",
    value: GridSize,
    onChange?: (g: GridSize) => void,
  ) {
    if (!onChange) return null;
    const sizes: GridSize[] = [1, 2, 3, 4, 5];
    const label = kind === "cols" ? "横の分割（列数）" : "縦の分割（行数）";
    return (
      <div className="v2-grid-slider-card">
        <div className="v2-grid-slider-head">
          <div>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
          <em>{kind === "cols" ? "横" : "縦"}</em>
        </div>
        <input
          type="range"
          min={1}
          max={5}
          step={1}
          value={value}
          aria-label={label}
          onChange={(event) => onChange(Number(event.target.value) as GridSize)}
        />
        <div className="v2-grid-slider-ticks" aria-hidden="true">
          {sizes.map((size) => (
            <span key={size} className={value === size ? "is-active" : ""}>
              {size}
            </span>
          ))}
        </div>
      </div>
    );
  }

  function renderGridSizeSliders() {
    return (
      <div className="v2-grid-slider-stack">
        {renderGridDimensionSlider("cols", gridCols, onChangeGridCols)}
        {renderGridDimensionSlider("rows", gridRows, onChangeGridRows)}
        <div className="v2-grid-total-chip">
          {gridCols}×{gridRows}<span>{gridCols * gridRows}コマ</span>
        </div>
      </div>
    );
  }

  // 白背景の自動透過トグル（共通レンダー）
  function renderTransparentToggle(extraClass = "") {
    return (
      <label
        className={`v2-bg-transparent-toggle ${extraClass}`}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          fontSize: 12.5,
          fontWeight: 800,
          color: "var(--v2-ink)",
          cursor: processing ? "wait" : "pointer",
          opacity: processing ? 0.6 : 1,
        }}
        title="白い背景を自動で透明にします（縁から繋がった白だけを抜くので、目の白や白文字は残ります）"
      >
        <input
          type="checkbox"
          checked={bgTransparent}
          disabled={processing}
          onChange={(e) => void toggleBgTransparent(e.target.checked)}
          style={{ accentColor: "#b89bea", width: 16, height: 16 }}
        />
        ✨ 自動透過を適用する
        {processing && <span style={{ color: "var(--v2-pink)" }}>（処理中…）</span>}
      </label>
    );
  }

  const cellCount = gridCols * gridRows;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const batchFileInputRef = useRef<HTMLInputElement>(null);
  const appendFileInputRef = useRef<HTMLInputElement>(null);
  // ⚡おまかせ: シート取り込み時に 分割→透過→中央寄せ→確認画面 まで自動で進む
  const [autoPilot, setAutoPilot] = useState(true);
  const liveGridRef = useRef<HTMLDivElement>(null);
  const adjustPreviewRef = useRef<HTMLDivElement>(null);
  const dragBoundsRef = useRef<HTMLElement | null>(null);
  // シートの列/行プロファイル（カット線を余白の谷へ自動フィット/吸着させる用）
  const sheetProfilesRef = useRef<SheetProfiles | null>(null);
  // 白フチ: 現在の太さ(px)と「フチを付ける前」のセルのスナップショット（幅変更時はここから掛け直す）
  const [outlineWidth, setOutlineWidth] = useState(0);
  const outlineBaseRef = useRef<SourceImage[] | null>(null);
  const splitCellsRef = useRef<SourceImage[]>(splitCells);
  const batchEditIndexRef = useRef<number | null>(null);
  const eraseSourceRef = useRef<string | null>(null);
  const eraseQueueRef = useRef<EraseStroke[]>([]);
  const eraseBusyRef = useRef(false);
  const bgUndoStackRef = useRef<BgUndoSnapshot[]>([]);
  const bgEditStartSrcRef = useRef<string | null>(null);
  const bgStepResetCellsRef = useRef<SourceImage[] | null>(null);
  const bgStepResetSheetSrcRef = useRef<string | null>(null);
  const bgColorSourceRef = useRef<string | null>(null);
  const bgBatchColorBaseRef = useRef<SourceImage[] | null>(null);
  const [drag, setDrag] = useState<{ axis: DragAxis; index: number } | null>(null);
  const [erasing, setErasing] = useState(false);
  const [zoomCell, setZoomCell] = useState<number | null>(null);
  const [bgEditZoomOpen, setBgEditZoomOpen] = useState(false);
  const [batchEditIndex, setBatchEditIndex] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [batchProgress, setBatchProgress] = useState("");
  const [trimGutter, setTrimGutter] = useState<number>(0);
  // 背景透過は取り込み時には実行せず、Step3で明示的に適用する。
  const [bgTransparent, setBgTransparent] = useState<boolean>(false);
  const [rawSrc, setRawSrc] = useState<string | null>(null);
  const [processing, setProcessing] = useState<boolean>(false);
  const [bgTool, setBgTool] = useState<BgTool>("auto");
  const [advancedOpen, setAdvancedOpen] = useState<boolean>(false);
  const [bgTolerance, setBgTolerance] = useState<number>(24);
  const [eraseRadius, setEraseRadius] = useState<number>(10);
  const [pickedColor, setPickedColor] = useState<RgbColor | null>(null);
  const [bgUndoCount, setBgUndoCount] = useState(0);
  const [bgResetReady, setBgResetReady] = useState(false);
  // 分割プレビューの背景（透過確認用・市松/白/黒/桃/青）
  const [liveBg, setLiveBg] = useState<string>("checker");
  const liveBgCss = (LIVE_BGS.find((b) => b.key === liveBg) ?? LIVE_BGS[0]).css;

  function normalizeCropOverride(next: CellCropOverride): CellCropOverride | null {
    const normalized: CellCropOverride = {
      shiftX: clamp(next.shiftX ?? 0, -8, 8),
      shiftY: clamp(next.shiftY ?? 0, -8, 8),
      padX: clamp(next.padX ?? 0, 0, 8),
      padY: clamp(next.padY ?? 0, 0, 8),
      zoom: clamp(next.zoom ?? 0, -8, 8),
    };
    const active =
      Math.abs(normalized.shiftX ?? 0) > 0.05 ||
      Math.abs(normalized.shiftY ?? 0) > 0.05 ||
      Math.abs(normalized.padX ?? 0) > 0.05 ||
      Math.abs(normalized.padY ?? 0) > 0.05 ||
      Math.abs(normalized.zoom ?? 0) > 0.05;
    return active ? normalized : null;
  }

  function cropOverrideFor(index: number): CellCropOverride {
    return { shiftX: 0, shiftY: 0, padX: 0, padY: 0, zoom: 0, ...(cellCropOverrides[index] ?? {}) };
  }

  function hasCropOverride(index: number): boolean {
    return Boolean(cellCropOverrides[index]);
  }

  function applyCropOverrideToRegion(region: CellRegion, index: number): CellRegion {
    const override = cellCropOverrides[index];
    if (!override) return region;
    const shiftX = override.shiftX ?? 0;
    const shiftY = override.shiftY ?? 0;
    const padX = override.padX ?? 0;
    const padY = override.padY ?? 0;
    const zoom = override.zoom ?? 0;
    const x = clamp(region.x + shiftX - padX + zoom, 0, 99);
    const y = clamp(region.y + shiftY - padY + zoom, 0, 99);
    const right = clamp(region.x + region.w + shiftX + padX - zoom, x + 1, 100);
    const bottom = clamp(region.y + region.h + shiftY + padY - zoom, y + 1, 100);
    return { x, y, w: right - x, h: bottom - y };
  }

  useEffect(() => {
    splitCellsRef.current = splitCells;
  }, [splitCells]);

  useEffect(() => {
    if (phase !== "background") {
      bgStepResetCellsRef.current = null;
      bgStepResetSheetSrcRef.current = null;
      bgColorSourceRef.current = null;
      bgBatchColorBaseRef.current = null;
      setBgResetReady(false);
      return;
    }
    if (!bgStepResetSheetSrcRef.current && sheetSrc) {
      bgStepResetSheetSrcRef.current = sheetSrc;
    }
    if (splitCells.length > 0 && bgStepResetCellsRef.current?.length !== splitCells.length) {
      bgStepResetCellsRef.current = splitCells.map((cell) => ({ ...cell }));
      bgBatchColorBaseRef.current = null;
      setBgResetReady(true);
    }
  }, [phase, sheetSrc, splitCells]);

  useEffect(() => {
    batchEditIndexRef.current = batchEditIndex;
  }, [batchEditIndex]);

  useEffect(() => {
    const activeBatchCell = batchEditIndex === null ? null : splitCells[batchEditIndex] ?? null;
    eraseSourceRef.current = activeBatchCell?.src ?? sheetSrc;
  }, [sheetSrc, splitCells, batchEditIndex]);

  function replaceBatchCellSrc(index: number, src: string) {
    const next = splitCellsRef.current.map((cell, cellIndex) =>
      cellIndex === index ? { ...cell, src } : cell,
    );
    splitCellsRef.current = next;
    setSplitCells(next);
  }

  function getActiveEditSource() {
    const index = batchEditIndexRef.current;
    if (index !== null) return splitCellsRef.current[index]?.src ?? null;
    return sheetSrc;
  }

  function getAutoTransparencySource() {
    const index = batchEditIndexRef.current;
    if (index !== null) return splitCellsRef.current[index]?.src ?? null;
    return rawSrc ?? sheetSrc;
  }

  function setActiveEditSource(src: string) {
    const index = batchEditIndexRef.current;
    if (index !== null) {
      replaceBatchCellSrc(index, src);
    } else {
      setSheetSrc(src);
    }
    eraseSourceRef.current = src;
  }

  function syncBgUndoStack(next: BgUndoSnapshot[]) {
    const limited = next.slice(-BG_UNDO_LIMIT);
    bgUndoStackRef.current = limited;
    setBgUndoCount(limited.length);
  }

  function clearBgUndoStack() {
    syncBgUndoStack([]);
  }

  function createActiveUndoSnapshot(source: string): BgUndoSnapshot | null {
    const index = batchEditIndexRef.current;
    if (index !== null) return { kind: "batch-cell", index, src: source };
    return { kind: "sheet", src: source, bgTransparent };
  }

  function pushBgUndo(snapshot: BgUndoSnapshot | null) {
    if (!snapshot) return;
    syncBgUndoStack([...bgUndoStackRef.current, snapshot]);
  }

  function undoBackgroundEdit() {
    if (processing || eraseBusyRef.current) return;
    const stack = bgUndoStackRef.current;
    const snapshot = stack[stack.length - 1];
    if (!snapshot) return;
    syncBgUndoStack(stack.slice(0, -1));
    setBatchProgress("");
    bgColorSourceRef.current = null;
    bgBatchColorBaseRef.current = null;

    if (snapshot.kind === "sheet") {
      setBgTransparent(snapshot.bgTransparent);
      setSheetSrc(snapshot.src);
      eraseSourceRef.current = snapshot.src;
    } else if (snapshot.kind === "batch-cell") {
      replaceBatchCellSrc(snapshot.index, snapshot.src);
      if (batchEditIndexRef.current === snapshot.index) {
        eraseSourceRef.current = snapshot.src;
      }
    } else {
      splitCellsRef.current = snapshot.cells;
      setSplitCells(snapshot.cells);
      const index = batchEditIndexRef.current;
      eraseSourceRef.current = index !== null ? snapshot.cells[index]?.src ?? null : null;
      bgColorSourceRef.current = null;
      bgBatchColorBaseRef.current = null;
    }

    setMessage("1つ前に戻しました。");
  }

  function resetBackgroundEdit() {
    if (processing || eraseBusyRef.current) return;
    const startSrc = bgEditStartSrcRef.current;
    const currentSrc = getActiveEditSource();
    if (!startSrc || !currentSrc) return;
    if (startSrc !== currentSrc) pushBgUndo(createActiveUndoSnapshot(currentSrc));
    eraseQueueRef.current = [];
    setActiveEditSource(startSrc);
    bgColorSourceRef.current = startSrc;
    bgBatchColorBaseRef.current = null;
    setErasing(false);
    setMessage("この編集を開いた時点に戻しました。");
  }

  function resetAllBackgroundTransparency() {
    if (processing || eraseBusyRef.current) return;
    const baseline = bgStepResetCellsRef.current;
    if (!baseline?.length) return;
    pushBgUndo({ kind: "batch-all", cells: splitCellsRef.current.map((cell) => ({ ...cell })) });
    const next = baseline.map((cell) => ({ ...cell }));
    splitCellsRef.current = next;
    setSplitCells(next);
    const resetSheetSrc = bgStepResetSheetSrcRef.current ?? rawSrc;
    if (resetSheetSrc) {
      setSheetSrc(resetSheetSrc);
      if (batchEditIndexRef.current === null) {
        eraseSourceRef.current = resetSheetSrc;
      }
    }
    setBgTransparent(false);
    eraseQueueRef.current = [];
    const index = batchEditIndexRef.current;
    eraseSourceRef.current = index !== null ? next[index]?.src ?? null : resetSheetSrc ?? null;
    bgColorSourceRef.current = null;
    bgBatchColorBaseRef.current = null;
    setPickedColor(null);
    setBatchProgress("");
    setMessage("背景透過をリセットしました。");
  }

  function renderColorUndoButton() {
    return (
      <button
        type="button"
        className="v2-bg-tool-secondary"
        disabled={processing || bgUndoCount === 0}
        onClick={undoBackgroundEdit}
      >
        ↶ 1つ戻る
      </button>
    );
  }

  async function makeEdgeBackgroundTransparent(src: string) {
    const bgColor =
      (await pickImageColor(src, 0, 0)) ??
      (await pickImageColor(src, 1, 0)) ??
      (await pickImageColor(src, 0, 1)) ??
      (await pickImageColor(src, 1, 1));
    return bgColor
      ? makeImageTransparent(src, { targetColor: bgColor, tolerance: Math.max(bgTolerance, 32) })
      : makeImageTransparent(src);
  }

  // 取り込み時は元画像のまま sheetSrc にセットする。背景透過はStep3で行う。
  async function applyUploadedSrc(url: string) {
    clearBgUndoStack();
    bgStepResetCellsRef.current = null;
    bgStepResetSheetSrcRef.current = null;
    bgColorSourceRef.current = null;
    bgBatchColorBaseRef.current = null;
    setBgResetReady(false);
    setCellCropOverrides({});
    setRawSrc(url);
    setBgTransparent(false);
    setSheetSrc(url);
    setMessage("");
    resetOutlineState();
    // カット線をコマ間の余白（谷）へ自動フィット（谷が無いシートは等間隔のまま）
    void autoFitCutsForSheet(url);
  }

  // 透過トグルの切替（元画像から作り直す）
  async function toggleBgTransparent(next: boolean) {
    setBgTransparent(next);
    if (!rawSrc) return;
    bgColorSourceRef.current = null;
    bgBatchColorBaseRef.current = null;
    if (!next) {
      setSheetSrc(rawSrc);
      return;
    }
    setProcessing(true);
    setMessage("背景を透過しています…");
    try {
      const out = await makeImageTransparent(rawSrc);
      setSheetSrc(out);
      setMessage("");
    } catch (err) {
      console.error(err);
      setSheetSrc(rawSrc);
      setMessage("透過に失敗したため、元の画像で読み込みました。");
    } finally {
      setProcessing(false);
    }
  }

  async function runAutoTransparency(source = getAutoTransparencySource()) {
    if (!source) return;
    const editingBatch = batchEditIndexRef.current !== null;
    bgColorSourceRef.current = null;
    bgBatchColorBaseRef.current = null;
    trackStampEvent("background_auto", {
      target: editingBatch ? "batch-cell" : "sheet",
      tolerance: bgTolerance,
    });
    if (!editingBatch) setBgTransparent(true);
    setProcessing(true);
    setMessage("背景を透過しています…");
    try {
      const out = editingBatch
        ? await makeEdgeBackgroundTransparent(source)
        : await makeImageTransparent(source);
      setActiveEditSource(out);
      if (!editingBatch) {
        const committed = await commitSheetBackgroundToCells(out);
        if (!committed) setMessage("");
      } else {
        setMessage("");
      }
    } catch (err) {
      console.error(err);
      setMessage("透過に失敗しました。別の方法で試してください。");
    } finally {
      setProcessing(false);
    }
  }

  async function runColorTransparency(color = pickedColor, source = bgColorSourceRef.current ?? getActiveEditSource()) {
    const currentSource = getActiveEditSource();
    if (!source || !color || !currentSource) return;
    const editingBatch = batchEditIndexRef.current !== null;
    trackStampEvent("background_color", {
      target: editingBatch ? "batch-cell" : "sheet",
      tolerance: bgTolerance,
    });
    pushBgUndo(createActiveUndoSnapshot(currentSource));
    if (!editingBatch) setBgTransparent(true);
    setProcessing(true);
    setMessage("選んだ色の背景を透過しています…");
    try {
      const out = await makeImageTransparent(source, {
        targetColor: color,
        tolerance: bgTolerance,
      });
      setActiveEditSource(out);
      if (!editingBatch) {
        const committed = await commitSheetBackgroundToCells(out);
        if (!committed) setMessage("");
      } else {
        setMessage("");
      }
    } catch (err) {
      console.error(err);
      setMessage("色指定の透過に失敗しました。許容値を変えてもう一度試してください。");
    } finally {
      setProcessing(false);
    }
  }

  function pointFromPreview(event: React.PointerEvent) {
    if (!adjustPreviewRef.current) return null;
    const preview = adjustPreviewRef.current;
    const rect = preview.getBoundingClientRect();
    const img = preview.querySelector("img");
    if (img && img.naturalWidth > 0 && img.naturalHeight > 0 && rect.width > 0 && rect.height > 0) {
      const previewRatio = rect.width / rect.height;
      const imageRatio = img.naturalWidth / img.naturalHeight;
      let renderedW = rect.width;
      let renderedH = rect.height;
      let offsetX = 0;
      let offsetY = 0;
      if (imageRatio > previewRatio) {
        renderedH = rect.width / imageRatio;
        offsetY = (rect.height - renderedH) / 2;
      } else {
        renderedW = rect.height * imageRatio;
        offsetX = (rect.width - renderedW) / 2;
      }
      return {
        x: clamp((event.clientX - rect.left - offsetX) / renderedW, 0, 1),
        y: clamp((event.clientY - rect.top - offsetY) / renderedH, 0, 1),
      };
    }
    return {
      x: clamp((event.clientX - rect.left) / rect.width, 0, 1),
      y: clamp((event.clientY - rect.top) / rect.height, 0, 1),
    };
  }

  async function pickAndRemoveColor(event: React.PointerEvent) {
    const point = pointFromPreview(event);
    const source = getActiveEditSource();
    if (!point || !source || processing) return;
    const color = await pickImageColor(source, point.x, point.y);
    if (!color) {
      setMessage("色を読み取れませんでした。別の場所をクリックしてください。");
      return;
    }
    setPickedColor(color);
    bgColorSourceRef.current = source;
    await runColorTransparency(color, source);
  }

  async function flushEraseQueue() {
    if (eraseBusyRef.current) return;
    const source = eraseSourceRef.current;
    const strokes = eraseQueueRef.current.splice(0);
    if (!source || !strokes.length) return;
    eraseBusyRef.current = true;
    try {
      const out = await eraseImageAtPoints(source, strokes);
      eraseSourceRef.current = out;
      const index = batchEditIndexRef.current;
      if (index !== null) replaceBatchCellSrc(index, out);
      else setSheetSrc(out);
    } catch (err) {
      console.error(err);
      setMessage("消しゴム処理に失敗しました。");
    } finally {
      eraseBusyRef.current = false;
      if (eraseQueueRef.current.length) void flushEraseQueue();
    }
  }

  function queueErase(event: React.PointerEvent) {
    const point = pointFromPreview(event);
    if (!point || !getActiveEditSource()) return;
    eraseQueueRef.current.push({
      x: point.x,
      y: point.y,
      radius: eraseRadius,
    });
    void flushEraseQueue();
  }

  // ── 各列・行のサイズ（fr単位）を計算（プレビューグリッドの比率に使う） ──
  const gridStyle = useMemo(() => {
    const vc = safeCuts(verticalCuts, gridCols);
    const hc = safeCuts(horizontalCuts, gridRows);
    const xs = [OUTER_PADDING, ...vc.map((c) => linePosition(c, OUTER_PADDING)), 100 - OUTER_PADDING];
    const ys = [OUTER_PADDING, ...hc.map((c) => linePosition(c, OUTER_PADDING)), 100 - OUTER_PADDING];
    const colSizes = Array.from({ length: gridCols }, (_, i) => xs[i + 1] - xs[i]);
    const rowSizes = Array.from({ length: gridRows }, (_, i) => ys[i + 1] - ys[i]);
    return {
      gridTemplateColumns: colSizes.map((s) => `${s}fr`).join(" "),
      gridTemplateRows: rowSizes.map((s) => `${s}fr`).join(" "),
    };
  }, [verticalCuts, horizontalCuts, gridCols, gridRows]);

  // ── セルの座標（%）をライブ計算（trimGutter込み） ────
  const cellRegions: CellRegion[] = useMemo(() => {
    const vc = safeCuts(verticalCuts, gridCols);
    const hc = safeCuts(horizontalCuts, gridRows);
    const xs = [OUTER_PADDING, ...vc.map((c) => linePosition(c, OUTER_PADDING)), 100 - OUTER_PADDING];
    const ys = [OUTER_PADDING, ...hc.map((c) => linePosition(c, OUTER_PADDING)), 100 - OUTER_PADDING];
    const trimHalf = trimGutter / 2;
    const list: CellRegion[] = [];
    const lastCol = gridCols - 1;
    const lastRow = gridRows - 1;
    for (let row = 0; row < gridRows; row++) {
      for (let col = 0; col < gridCols; col++) {
        const baseX = xs[col];
        const baseY = ys[row];
        const baseW = xs[col + 1] - xs[col];
        const baseH = ys[row + 1] - ys[row];
        const leftTrim = col === 0 ? 0 : trimHalf;
        const rightTrim = col === lastCol ? 0 : trimHalf;
        const topTrim = row === 0 ? 0 : trimHalf;
        const bottomTrim = row === lastRow ? 0 : trimHalf;
        const region = {
          x: baseX + leftTrim,
          y: baseY + topTrim,
          w: baseW - leftTrim - rightTrim,
          h: baseH - topTrim - bottomTrim,
        };
        list.push(applyCropOverrideToRegion(region, list.length));
      }
    }
    return list;
  }, [verticalCuts, horizontalCuts, trimGutter, gridCols, gridRows, cellCropOverrides]);

  // ── PNG実体を再生成（アップロード時・ドラッグ確定時） ──
  async function regenerateCells(
    src: string,
    overrides: Record<number, CellCropOverride> = cellCropOverrides,
    // setVerticalCuts直後はまだprops値が古いので、スナップ/自動フィット確定値を直接渡せるようにする
    cutsOverride?: { vertical?: number[]; horizontal?: number[] },
  ) {
    try {
      const cells = await splitSheetImage(
        src,
        OUTER_PADDING,
        trimGutter,
        cutsOverride?.vertical ?? verticalCuts,
        cutsOverride?.horizontal ?? horizontalCuts,
        gridCols,
        gridRows,
        overrides,
      );
      splitCellsRef.current = cells;
      setSplitCells(cells);
      setMessage("");
      return true;
    } catch (err) {
      console.error(err);
      setMessage("分割に失敗しました。画像を確認してください。");
    }
  }

  // シート画像アップロード時／グリッドサイズ変更時に即座に分割。
  // 40枚一括取り込みでは sheetSrc を使わないため、sheetSrc=null でも splitCells は消さない。
  async function commitSheetBackgroundToCells(source = getActiveEditSource()) {
    if (!source || phase !== "background" || batchEditIndexRef.current !== null || splitCellsRef.current.length === 0) {
      return false;
    }
    setBatchProgress("背景透過プレビューへ反映中…");
    const ok = await regenerateCells(source);
    setBatchProgress("");
    if (ok) {
      bgBatchColorBaseRef.current = null;
      setMessage("背景透過プレビューへ反映しました。");
    }
    return ok;
  }

  function updateCellCropOverride(index: number, patch: Partial<CellCropOverride>) {
    const current = cropOverrideFor(index);
    const normalized = normalizeCropOverride({ ...current, ...patch });
    const next = { ...cellCropOverrides };
    if (normalized) next[index] = normalized;
    else delete next[index];
    setCellCropOverrides(next);
    if (sheetSrc) void regenerateCells(sheetSrc, next);
  }

  function resetCellCropOverride(index: number) {
    const next = { ...cellCropOverrides };
    delete next[index];
    setCellCropOverrides(next);
    if (sheetSrc) void regenerateCells(sheetSrc, next);
  }

  useEffect(() => {
    if (sheetSrc) {
      if (phase === "background" && splitCells.length > 0) return;
      regenerateCells(sheetSrc);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheetSrc, gridCols, gridRows, phase, splitCells.length]);

  // ── ファイル取り込み ────────────────────────────────
  async function handleFile(files: FileList | null) {
    if (!files || !files[0]) return;
    const url = await readFileAsDataUrl(files[0]);
    if (autoPilot && phase === "import") {
      // ⚡おまかせ: 分割→透過まで済ませて確認画面へ直行
      await runAutoPilotFromSheet(url);
      return;
    }
    onImportModeChange?.("sheet");
    await applyUploadedSrc(url);
    onImportComplete?.("sheet");
  }

  async function handleBatchFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const imageFiles = Array.from(files).filter((file) => file.type.startsWith("image/"));
    if (!imageFiles.length) {
      setMessage("画像ファイルが見つかりませんでした。");
      return;
    }
    const limited = imageFiles.slice(0, MAX_BATCH_IMAGES);
    const skipped = imageFiles.length - limited.length;
    setProcessing(true);
    setBatchProgress(`0 / ${limited.length} 枚を処理中…`);
    setMessage("");
    clearBgUndoStack();
    bgStepResetCellsRef.current = null;
    bgStepResetSheetSrcRef.current = null;
    bgColorSourceRef.current = null;
    bgBatchColorBaseRef.current = null;
    setBgResetReady(false);
    setSheetSrc(null);
    setCellCropOverrides({});
    setRawSrc(null);
    setPickedColor(null);
    resetOutlineState();
    onImportModeChange?.("batch");
    let imported = false;
    try {
      const cells: SourceImage[] = [];
      for (let i = 0; i < limited.length; i += 1) {
        const file = limited[i];
        setBatchProgress(`${i + 1} / ${limited.length} 枚を処理中…`);
        const src = await readFileAsDataUrl(file);
        cells.push({
          id: `batch-${i}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name: file.name || `stamp_${String(i + 1).padStart(2, "0")}.png`,
          src,
        });
      }
      setSplitCells(cells);
      setBatchProgress("");
      setMessage(
        `${cells.length}枚を一括取り込みしました${skipped > 0 ? `（上限${MAX_BATCH_IMAGES}枚のため${skipped}枚は未取り込み）` : ""}。`,
      );
      imported = true;
    } catch (err) {
      console.error(err);
      setMessage("一括取り込みに失敗しました。画像を確認してください。");
    } finally {
      setProcessing(false);
      setBatchProgress("");
    }
    if (imported) onImportComplete?.("batch");
  }

  // ── おまかせ処理＆シート合算 ─────────────────────────
  // シートを「自動フィット分割→白背景透過」まで一気に処理してセル配列を返す
  async function splitAndCleanSheet(url: string, startIndex: number): Promise<SourceImage[]> {
    const profiles = await buildSheetProfiles(url);
    sheetProfilesRef.current = profiles;
    const fitted = profiles
      ? fitCutsToValleys(profiles, gridCols, gridRows)
      : { vertical: defaultCuts(gridCols), horizontal: defaultCuts(gridRows) };
    setVerticalCuts(fitted.vertical);
    setHorizontalCuts(fitted.horizontal);
    const cells = await splitSheetImage(
      url,
      OUTER_PADDING,
      trimGutter,
      fitted.vertical,
      fitted.horizontal,
      gridCols,
      gridRows,
      {},
    );
    setBatchProgress("背景を透過しています…");
    const cleaned = await Promise.all(
      cells.map(async (cell, i) => {
        const transparent = await makeImageTransparent(cell.src);
        // このシート分だけ中央寄せまで済ませる（既存コマの調整に触れないため親では再センターしない）
        const centered = await centerImageContent(transparent);
        return {
          ...cell,
          id: `auto-${startIndex + i}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name: `stamp_${String(startIndex + i + 1).padStart(2, "0")}.png`,
          src: centered,
        };
      }),
    );
    return cleaned;
  }

  // ⚡おまかせ: シート1枚を分割→透過して、そのまま確認画面（画像配置）へ
  async function runAutoPilotFromSheet(url: string) {
    setProcessing(true);
    setBatchProgress("シートを自動分割しています…");
    setMessage("");
    try {
      const cells = await splitAndCleanSheet(url, 0);
      clearBgUndoStack();
      setSheetSrc(null);
      setRawSrc(null);
      setCellCropOverrides({});
      resetOutlineState();
      splitCellsRef.current = cells;
      setSplitCells(cells);
      onImportModeChange?.("batch");
      setMessage(`${cells.length}枚に分割して透過しました。`);
      trackStampEvent("import_autopilot", { cellCount: cells.length, cols: gridCols, rows: gridRows });
      onAutoPilotComplete?.("fresh");
    } catch (err) {
      console.error(err);
      setMessage("おまかせ処理に失敗しました。画像を確認してください。");
    } finally {
      setProcessing(false);
      setBatchProgress("");
    }
  }

  // ➕シート合算: 今あるセルの後ろに、新しいシートの分割結果を追記（最大40枚）
  async function handleAppendSheetFiles(files: FileList | null) {
    if (!files || !files[0] || processing) return;
    const url = await readFileAsDataUrl(files[0]);
    const base = splitCellsRef.current.length ? splitCellsRef.current : splitCells;
    setProcessing(true);
    setBatchProgress("追加シートを分割しています…");
    try {
      const added = await splitAndCleanSheet(url, base.length);
      const room = MAX_BATCH_IMAGES - base.length;
      const addedKept = added.slice(0, Math.max(0, room));
      // 白フチ適用中なら、追加分にも同じ太さで掛けて見た目を揃える
      let addedFinal = addedKept;
      if (outlineWidth > 0) {
        setBatchProgress("追加分に白フチを付けています…");
        addedFinal = await Promise.all(
          addedKept.map(async (cell) => ({ ...cell, src: await addWhiteOutline(cell.src, outlineWidth) })),
        );
      }
      // ベースライン（フチなし版）にも追加分を追記して、後から幅を変えても全コマ整合するように
      if (outlineBaseRef.current && outlineBaseRef.current.length === base.length) {
        outlineBaseRef.current = [...outlineBaseRef.current, ...addedKept];
      } else if (outlineWidth === 0) {
        outlineBaseRef.current = null;
      }
      const combined = [...base, ...addedFinal];
      splitCellsRef.current = combined;
      setSplitCells(combined);
      setSheetSrc(null);
      setRawSrc(null);
      onImportModeChange?.("batch");
      setMessage(
        `${base.length}枚 → ${combined.length}枚に追加しました${added.length > room ? `（上限${MAX_BATCH_IMAGES}枚のため${added.length - room}枚は未追加）` : ""}。`,
      );
      trackStampEvent("sheet_append", { total: combined.length });
      onAutoPilotComplete?.("append");
    } catch (err) {
      console.error(err);
      setMessage("シートの追加に失敗しました。画像を確認してください。");
    } finally {
      setProcessing(false);
      setBatchProgress("");
    }
  }

  // ── 白フチ ────────────────────────────────────────
  // 新しいセル一式が入ったらフチ状態はリセット（フチは最後の仕上げとして掛け直す）
  function resetOutlineState() {
    outlineBaseRef.current = null;
    setOutlineWidth(0);
  }

  async function applyOutlineWidth(next: number) {
    if (processing) return;
    const current = splitCellsRef.current.length ? splitCellsRef.current : splitCells;
    if (!current.length) return;
    // ベースライン（フチなし状態）を確保。セル数が変わっていたら取り直す
    if (!outlineBaseRef.current || outlineBaseRef.current.length !== current.length) {
      outlineBaseRef.current = current.map((cell) => ({ ...cell }));
    }
    const base = outlineBaseRef.current;
    setOutlineWidth(next);
    setProcessing(true);
    setBatchProgress(next > 0 ? "白フチを付けています…" : "白フチを外しています…");
    try {
      const cells =
        next > 0
          ? await Promise.all(base.map(async (cell) => ({ ...cell, src: await addWhiteOutline(cell.src, next) })))
          : base.map((cell) => ({ ...cell }));
      splitCellsRef.current = cells;
      setSplitCells(cells);
      trackStampEvent("white_outline", { width: next, cellCount: cells.length });
    } catch (err) {
      console.error(err);
      setMessage("白フチの適用に失敗しました。");
    } finally {
      setProcessing(false);
      setBatchProgress("");
    }
  }

  function renderOutlineControl() {
    return (
      <div className="v2-outline-card">
        <div className="v2-outline-head">
          <span>白フチ</span>
          <strong>{outlineWidth <= 0 ? "なし" : `${outlineWidth.toFixed(1)}px`}</strong>
        </div>
        <div className="v2-outline-buttons">
          <button
            type="button"
            disabled={processing || outlineWidth <= 0}
            onClick={() => void applyOutlineWidth(Math.max(0, +(outlineWidth - 0.5).toFixed(1)))}
          >
            −
          </button>
          <button
            type="button"
            disabled={processing || outlineWidth >= 8}
            onClick={() => void applyOutlineWidth(Math.min(8, +(outlineWidth + 0.5).toFixed(1)))}
          >
            ＋
          </button>
        </div>
        <p>透過した中身のまわりに白いフチを付けます。消しゴムなどの仕上げが済んでから最後にかけるのがおすすめ。</p>
      </div>
    );
  }

  async function runBatchTransparency() {
    if (!splitCells.length || processing) return;
    trackStampEvent("background_batch_auto", { cellCount: splitCells.length });
    bgColorSourceRef.current = null;
    bgBatchColorBaseRef.current = null;
    pushBgUndo({ kind: "batch-all", cells: splitCellsRef.current.map((cell) => ({ ...cell })) });
    setProcessing(true);
    setBatchProgress(`0 / ${splitCells.length} 枚を透過中…`);
    setMessage("");
    try {
      const next: SourceImage[] = [];
      for (let i = 0; i < splitCells.length; i += 1) {
        setBatchProgress(`${i + 1} / ${splitCells.length} 枚を透過中…`);
        const cell = splitCells[i];
        const src = await makeEdgeBackgroundTransparent(cell.src);
        next.push({ ...cell, src });
      }
      splitCellsRef.current = next;
      setSplitCells(next);
      setBatchProgress("");
      setMessage(`${next.length}枚の背景透過を更新しました。`);
    } catch (err) {
      console.error(err);
      setMessage("一括背景透過に失敗しました。画像を確認してください。");
    } finally {
      setProcessing(false);
      setBatchProgress("");
    }
  }

  async function runBatchColorTransparency(color = pickedColor) {
    if (!splitCells.length || !color || processing) return;
    const currentCells = splitCellsRef.current.map((cell) => ({ ...cell }));
    const baseCells =
      bgBatchColorBaseRef.current?.length === currentCells.length
        ? bgBatchColorBaseRef.current
        : currentCells;
    bgBatchColorBaseRef.current = baseCells.map((cell) => ({ ...cell }));
    trackStampEvent("background_batch_color", {
      cellCount: splitCells.length,
      tolerance: bgTolerance,
    });
    pushBgUndo({ kind: "batch-all", cells: currentCells });
    setProcessing(true);
    setBatchProgress(`0 / ${splitCells.length} 枚を色指定で透過中…`);
    setMessage("");
    try {
      const next: SourceImage[] = [];
      for (let i = 0; i < baseCells.length; i += 1) {
        setBatchProgress(`${i + 1} / ${splitCells.length} 枚を色指定で透過中…`);
        const cell = baseCells[i];
        const src = await makeImageTransparent(cell.src, {
          targetColor: color,
          tolerance: bgTolerance,
        });
        next.push({ ...cell, src });
      }
      splitCellsRef.current = next;
      setSplitCells(next);
      setBatchProgress("");
      setMessage(`${next.length}枚に選んだ色の透過を適用しました。`);
    } catch (err) {
      console.error(err);
      setMessage("色指定の一括透過に失敗しました。許容値を変えてもう一度試してください。");
    } finally {
      setProcessing(false);
      setBatchProgress("");
    }
  }

  // ── カット線の自動フィット（余白の谷に合わせる） ──────────
  function fitCutsToValleys(profiles: SheetProfiles, cols: GridSize, rows: GridSize) {
    const halfWindowFor = (n: GridSize) => (100 / n) * 0.35;
    return {
      vertical: defaultCuts(cols).map(
        (cut) => findValleyCut(profiles.col, 0, profiles.w - 1, cut, halfWindowFor(cols)) ?? cut,
      ),
      horizontal: defaultCuts(rows).map(
        (cut) => findValleyCut(profiles.row, 0, profiles.h - 1, cut, halfWindowFor(rows)) ?? cut,
      ),
    };
  }

  async function autoFitCutsForSheet(url: string, cols: GridSize = gridCols, rows: GridSize = gridRows) {
    const profiles = await buildSheetProfiles(url);
    sheetProfilesRef.current = profiles;
    if (!profiles) return;
    const fitted = fitCutsToValleys(profiles, cols, rows);
    setVerticalCuts(fitted.vertical);
    setHorizontalCuts(fitted.horizontal);
    void regenerateCells(url, cellCropOverrides, fitted);
  }

  // ステップ移動でこのコンポーネントは作り直されるため、スナップ用プロファイルをシートから再構築する
  // （自動フィットはしない＝手で調整した線を勝手に動かさない）
  useEffect(() => {
    let cancelled = false;
    if (!sheetSrc) {
      sheetProfilesRef.current = null;
      return;
    }
    if (sheetProfilesRef.current) return;
    void buildSheetProfiles(sheetSrc).then((profiles) => {
      if (!cancelled) sheetProfilesRef.current = profiles;
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheetSrc]);

  // グリッド数変更時も（親が等間隔にリセットした後で）谷に再フィット
  const prevGridRef = useRef<{ cols: GridSize; rows: GridSize }>({ cols: gridCols, rows: gridRows });
  useEffect(() => {
    const prev = prevGridRef.current;
    if (prev.cols === gridCols && prev.rows === gridRows) return;
    prevGridRef.current = { cols: gridCols, rows: gridRows };
    if (sheetSrc && sheetProfilesRef.current && phase !== "background") {
      const fitted = fitCutsToValleys(sheetProfilesRef.current, gridCols, gridRows);
      setVerticalCuts(fitted.vertical);
      setHorizontalCuts(fitted.horizontal);
      void regenerateCells(sheetSrc, cellCropOverrides, fitted);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gridCols, gridRows, sheetSrc, phase]);

  // ── ドラッグ ──────────────────────────────────────────
  function updateCut(axis: DragAxis, index: number, value: number) {
    const cuts = axis === "vertical" ? [...verticalCuts] : [...horizontalCuts];
    cuts[index] = clamp(value, 4, 96);
    const safe = safeCuts(cuts, axis === "vertical" ? gridCols : gridRows);
    if (axis === "vertical") setVerticalCuts(safe);
    else setHorizontalCuts(safe);
  }
  function startDrag(event: React.PointerEvent, axis: DragAxis, index: number, bounds?: HTMLElement | null) {
    event.preventDefault();
    event.stopPropagation();
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
    dragBoundsRef.current = bounds ?? adjustPreviewRef.current;
    setDrag({ axis, index });
  }
  function handleDragMove(event: React.PointerEvent) {
    if (!drag || !dragBoundsRef.current) return;
    const rect = dragBoundsRef.current.getBoundingClientRect();
    const pos = drag.axis === "vertical"
      ? ((event.clientX - rect.left) / rect.width) * 100
      : ((event.clientY - rect.top) / rect.height) * 100;
    const range = 100 - OUTER_PADDING * 2;
    if (range <= 0) return;
    const cutPct = clamp(((pos - OUTER_PADDING) / range) * 100, 4, 96);
    updateCut(drag.axis, drag.index, cutPct);
  }
  function stopDrag() {
    if (drag && sheetSrc) {
      // 指を離した位置の近く(±3.5%)に「コマ間の余白の谷」があれば磁石のように吸着
      let cutsOverride: { vertical?: number[]; horizontal?: number[] } | undefined;
      const profiles = sheetProfilesRef.current;
      if (profiles) {
        const isV = drag.axis === "vertical";
        const cuts = isV ? [...verticalCuts] : [...horizontalCuts];
        const current = cuts[drag.index];
        const snapped = findValleyCut(
          isV ? profiles.col : profiles.row,
          0,
          (isV ? profiles.w : profiles.h) - 1,
          current,
          3.5,
        );
        if (snapped != null && Math.abs(snapped - current) > 0.05) {
          cuts[drag.index] = snapped;
          const safe = safeCuts(cuts, isV ? gridCols : gridRows);
          if (isV) {
            setVerticalCuts(safe);
            cutsOverride = { vertical: safe };
          } else {
            setHorizontalCuts(safe);
            cutsOverride = { horizontal: safe };
          }
        }
      }
      // ドラッグ確定時にPNG再生成
      regenerateCells(sheetSrc, cellCropOverrides, cutsOverride);
    }
    dragBoundsRef.current = null;
    setDrag(null);
  }

  function handlePreviewPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (bgTool === "color") {
      event.preventDefault();
      void pickAndRemoveColor(event);
      return;
    }
    if (bgTool === "eraser") {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      const source = getActiveEditSource();
      if (!source) return;
      if (!erasing) {
        pushBgUndo(createActiveUndoSnapshot(source));
        trackStampEvent("background_eraser", {
          target: batchEditIndexRef.current !== null ? "batch-cell" : "sheet",
          radius: eraseRadius,
        });
      }
      setErasing(true);
      queueErase(event);
    }
  }

  function handlePreviewPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (drag) {
      handleDragMove(event);
      return;
    }
    if (bgTool === "eraser" && erasing) {
      event.preventDefault();
      queueErase(event);
    }
  }

  function handlePreviewPointerUp() {
    if (erasing) {
      setErasing(false);
      const latest = eraseSourceRef.current ?? sheetSrc;
      if (latest && batchEditIndexRef.current === null) regenerateCells(latest);
    }
    stopDrag();
  }
  function resetCuts() {
    setVerticalCuts(defaultCuts(gridCols));
    setHorizontalCuts(defaultCuts(gridRows));
    setCellCropOverrides({});
    if (sheetSrc) regenerateCells(sheetSrc, {});
  }

  // ── キーボード（ESC・矢印） ───────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (bgEditZoomOpen && e.key === "Escape") {
        closeBgEditor();
        return;
      }
      if (zoomCell === null) return;
      const lastIdx = cellCount - 1;
      if (e.key === "Escape") setZoomCell(null);
      else if (e.key === "ArrowRight") setZoomCell((c) => (c === null ? null : Math.min(lastIdx, c + 1)));
      else if (e.key === "ArrowLeft")  setZoomCell((c) => (c === null ? null : Math.max(0, c - 1)));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoomCell, cellCount, bgEditZoomOpen]);

  const vLines = safeCuts(verticalCuts, gridCols).map((c) => linePosition(c, OUTER_PADDING));
  const hLines = safeCuts(horizontalCuts, gridRows).map((c) => linePosition(c, OUTER_PADDING));

  const gridLabel = `${gridCols}×${gridRows}`;
  const batchEditCell = batchEditIndex === null ? null : splitCells[batchEditIndex] ?? null;
  const bgEditorSrc = batchEditCell?.src ?? sheetSrc;
  const sidebarBgTool: "auto" | "color" = bgTool === "auto" ? "auto" : "color";
  const useSplitCellPreview = phase === "background" && splitCells.length > 0;
  function renderLiveBgSwatches(extraClass = "") {
    return (
      <div className={`v2-live-bg-controls${extraClass ? ` ${extraClass}` : ""}`}>
        <span>背景:</span>
        {LIVE_BGS.map((b) => (
          <button
            key={b.key}
            type="button"
            title={`背景を${b.label}にする`}
            aria-label={`背景を${b.label}にする`}
            onClick={() => setLiveBg(b.key)}
            style={{ background: b.swatch }}
            className={liveBg === b.key ? "is-active" : ""}
          />
        ))}
      </div>
    );
  }
  function renderBgToolTabLabel(key: BgTool, label: string) {
    return (
      <span className={`v2-bg-tool-label is-${key}`}>
        <span className="v2-bg-tool-icon" aria-hidden="true" />
        <span>{label}</span>
      </span>
    );
  }

  function openBatchEditor(index: number, tool: BgTool = bgTool === "auto" ? "eraser" : bgTool) {
    const cell = splitCells[index];
    if (!cell) return;
    batchEditIndexRef.current = index;
    setBatchEditIndex(index);
    eraseSourceRef.current = cell.src;
    bgEditStartSrcRef.current = cell.src;
    setBgTool(tool);
    setBgEditZoomOpen(true);
  }

  function openSheetEditor(tool: BgTool = bgTool === "auto" ? "color" : bgTool) {
    if (!sheetSrc) return;
    batchEditIndexRef.current = null;
    setBatchEditIndex(null);
    eraseSourceRef.current = sheetSrc;
    bgEditStartSrcRef.current = sheetSrc;
    setBgTool(tool);
    setBgEditZoomOpen(true);
  }

  function closeBgEditor() {
    setBgEditZoomOpen(false);
    setErasing(false);
    bgEditStartSrcRef.current = null;
    if (bgTool === "eraser") setBgTool("auto");
    if (batchEditIndexRef.current !== null) {
      batchEditIndexRef.current = null;
      setBatchEditIndex(null);
      eraseSourceRef.current = sheetSrc;
    }
  }

  function renderBgEditorModal(src: string) {
    const editingBatch = batchEditIndex !== null;
    const canCommitSheetPreview = !editingBatch && useSplitCellPreview;
    return (
      <div
        className="v2-bg-zoom-overlay"
        onClick={(event) => {
          if (event.target === event.currentTarget) closeBgEditor();
        }}
      >
        <div className="v2-bg-zoom-modal" onClick={(event) => event.stopPropagation()}>
          <button
            type="button"
            className="v2-bg-zoom-close"
            onClick={closeBgEditor}
            aria-label="背景透過の拡大編集を閉じる"
          >
            ×
          </button>

          <div
            ref={adjustPreviewRef}
            className={`v2-bg-zoom-canvas${bgTool === "color" ? " is-picking" : bgTool === "eraser" ? " is-erasing" : ""}`}
            style={{ background: liveBgCss }}
            onPointerDown={handlePreviewPointerDown}
            onPointerMove={handlePreviewPointerMove}
            onPointerUp={handlePreviewPointerUp}
            onPointerCancel={handlePreviewPointerUp}
          >
            <img src={src} alt="" draggable={false} />
            <span className="v2-bg-zoom-hint">
              {bgTool === "color"
                ? "消したい背景色をクリック"
                : bgTool === "eraser"
                  ? "消したい部分をドラッグ"
                  : "自動透過は右のボタンから実行"}
            </span>
            {bgTool === "eraser" && (
              <div
                className="v2-bg-zoom-canvas-actions"
                onPointerDown={(event) => event.stopPropagation()}
                onPointerMove={(event) => event.stopPropagation()}
                onPointerUp={(event) => event.stopPropagation()}
              >
                <button
                  type="button"
                  disabled={processing || erasing || bgUndoCount === 0}
                  onClick={undoBackgroundEdit}
                >
                  ↶ 戻る
                </button>
                <button
                  type="button"
                  disabled={processing || erasing || !bgEditStartSrcRef.current}
                  onClick={resetBackgroundEdit}
                >
                  リセット
                </button>
              </div>
            )}
          </div>

          <aside className="v2-bg-zoom-tools">
            <div className="v2-bg-tool-head">
              <span>{editingBatch ? `${(batchEditIndex ?? 0) + 1}枚目を編集` : "背景透過"}</span>
              {pickedColor && (
                <span
                  className="v2-picked-color"
                  title={`RGB(${pickedColor.r}, ${pickedColor.g}, ${pickedColor.b})`}
                  style={{ background: `rgb(${pickedColor.r}, ${pickedColor.g}, ${pickedColor.b})` }}
                />
              )}
            </div>
            <div className="v2-bg-tool-tabs" role="group" aria-label="背景削除モード">
              {BG_MODAL_TOOLS.map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className={bgTool === key ? "is-active" : ""}
                  onClick={() => setBgTool(key)}
                >
                  {renderBgToolTabLabel(key, label)}
                </button>
              ))}
            </div>

            {renderLiveBgSwatches("in-modal")}

            {bgTool === "auto" && (
              <div className="v2-bg-tool-body">
                {!editingBatch && renderTransparentToggle()}
                <button
                  type="button"
                  className="v2-bg-tool-action"
                  disabled={processing || !src}
                  onClick={() => void runAutoTransparency()}
                >
                  自動透過を実行
                </button>
                <p>{editingBatch ? "この画像の端にある背景色を拾って透明にします。" : "白や薄い背景が外側につながっている画像向きです。"}</p>
              </div>
            )}

            {bgTool === "color" && (
              <div className="v2-bg-tool-body">
                <label className="v2-bg-slider">
                  <span>許容値 <strong>{bgTolerance}</strong></span>
                  <input
                    type="range"
                    min={4}
                    max={90}
                    step={1}
                    value={bgTolerance}
                    onChange={(e) => setBgTolerance(Number(e.target.value))}
                  />
                </label>
                <button
                  type="button"
                  className="v2-bg-tool-action"
                  disabled={processing || !pickedColor}
                  onClick={() => void runColorTransparency()}
                >
                  この色でもう一度削除
                </button>
                {renderColorUndoButton()}
                <p>大きい画像上で消したい背景色をクリックします。</p>
              </div>
            )}

            {bgTool === "eraser" && (
              <div className="v2-bg-tool-body">
                <label className="v2-bg-slider">
                  <span>ブラシ <strong>{eraseRadius}px</strong></span>
                  <input
                    type="range"
                    min={4}
                    max={80}
                    step={1}
                    value={eraseRadius}
                    onChange={(e) => setEraseRadius(Number(e.target.value))}
                  />
                </label>
                <p>大きい画像上をドラッグすると、その部分だけ透明になります。</p>
              </div>
            )}

            {canCommitSheetPreview && (
              <button
                type="button"
                className="v2-bg-tool-action"
                disabled={processing || erasing || !src}
                onClick={() => void commitSheetBackgroundToCells(src)}
              >
                これで保存してプレビューへ反映
              </button>
            )}

            {message && <p className="v2-toolbar-note">{message}</p>}
            <p className="v2-bg-zoom-foot">ESCまたは外側クリックで閉じます。</p>
          </aside>
        </div>
      </div>
    );
  }

  // ── 描画 ──────────────────────────────────────────────
  if (phase === "background" && !sheetSrc && splitCells.length > 0) {
    return (
      <>
        <div className="v2-export-room v2-batch-background-room">
          <section className="v2-export-left">
            <div className="v2-export-head">
              <span className="v2-export-title">背景透過プレビュー</span>
              <span className="v2-export-sub">画像をクリックして拡大編集</span>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto" }}>
                <span style={{ fontSize: 11, color: "var(--v2-muted)", fontWeight: 700 }}>背景:</span>
                {LIVE_BGS.map((b) => (
                  <button
                    key={b.key}
                    type="button"
                    title={`背景を${b.label}にする`}
                    aria-label={`背景を${b.label}にする`}
                    onClick={() => setLiveBg(b.key)}
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 6,
                      cursor: "pointer",
                      background: b.swatch,
                      border: liveBg === b.key ? "2px solid var(--v2-pink)" : "1.5px solid var(--v2-line)",
                      boxShadow: liveBg === b.key ? "0 0 0 2px rgba(247,168,200,0.3)" : "none",
                      padding: 0,
                    }}
                  />
                ))}
              </div>
            </div>
            <div className="v2-batch-preview-grid v2-batch-background-grid">
              {splitCells.slice(0, 40).map((cell, index) => (
                <button
                  key={cell.id}
                  type="button"
                  className="v2-batch-preview-cell v2-batch-edit-cell"
                  style={{ background: liveBgCss }}
                  onClick={() => openBatchEditor(index)}
                  aria-label={`${index + 1}枚目を拡大して背景を編集`}
                >
                  <img src={cell.src} alt="" />
                  <span>{index + 1}</span>
                  <b>消しゴム</b>
                </button>
              ))}
            </div>
          </section>

          <section className="v2-export-right v2-stage-toolbar">
            <div className="v2-bg-tool-head v2-batch-tool-head">
              <h4 className="v2-adjust-title">背景透過</h4>
              {pickedColor && (
                <span
                  className="v2-picked-color"
                  title={`RGB(${pickedColor.r}, ${pickedColor.g}, ${pickedColor.b})`}
                  style={{ background: `rgb(${pickedColor.r}, ${pickedColor.g}, ${pickedColor.b})` }}
                />
              )}
            </div>
            <p className="v2-adjust-sub">
              自動は各画像の端の背景色を拾って一括透過します。消しゴムは左の画像を開いて1枚ずつ調整できます。
            </p>
            <div className="v2-bg-tool-tabs" role="group" aria-label="背景削除モード">
              {BG_SIDEBAR_TOOLS.map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className={sidebarBgTool === key ? "is-active" : ""}
                  onClick={() => setBgTool(key)}
                >
                  {renderBgToolTabLabel(key, label)}
                </button>
              ))}
            </div>

            {sidebarBgTool === "auto" && (
              <div className="v2-bg-tool-body">
                <button
                  type="button"
                  className="v2-bg-tool-action"
                  disabled={processing || splitCells.length === 0}
                  onClick={() => void runBatchTransparency()}
                >
                  {processing ? "透過中…" : "端の背景色で一括透過"}
                </button>
                <p>黒・白など、背景が画像の端につながっている完成画像向きです。</p>
              </div>
            )}

            {sidebarBgTool === "color" && (
              <div className="v2-bg-tool-body">
                <label className="v2-bg-slider">
                  <span>許容値 <strong>{bgTolerance}</strong></span>
                  <input
                    type="range"
                    min={4}
                    max={90}
                    step={1}
                    value={bgTolerance}
                    onChange={(e) => setBgTolerance(Number(e.target.value))}
                  />
                </label>
                <button
                  type="button"
                  className="v2-bg-tool-action"
                  disabled={processing || !pickedColor}
                  onClick={() => void runBatchColorTransparency()}
                >
                  選んだ色を全画像に適用
                </button>
                {renderColorUndoButton()}
                <p>まず左の画像を開いて、消したい色をスポイトでクリックします。</p>
              </div>
            )}

            <button
              type="button"
              className="v2-bg-tool-secondary"
              disabled={processing || !bgResetReady}
              onClick={resetAllBackgroundTransparency}
            >
              背景透過リセット
            </button>

            {renderOutlineControl()}

            {batchProgress && <p className="v2-toolbar-note">{batchProgress}</p>}
            {message && <p className="v2-toolbar-note">{message}</p>}
          </section>
        </div>
        {bgEditZoomOpen && bgEditorSrc && renderBgEditorModal(bgEditorSrc)}
      </>
    );
  }

  if (phase === "import" || !sheetSrc) {
    // 画像未アップロード：ドロップゾーンを大きく表示
    return (
      <div className="v2-split-room" style={{ gridTemplateColumns: "1fr" }}>
        <section className="v2-split-left">
          <div className="v2-canva-reminder v2-intake-head">
            <div>
              <strong>素材の入口を選ぶ</strong>
              <span>シート分割と完成済み画像の一括取り込みを分けました。</span>
            </div>
          </div>

          <div className="v2-intake-options">
            <section className="v2-intake-option">
              <div className="v2-intake-option-label">
                <span>シートから作る</span>
              </div>
              <div className="v2-grid-size-row">
                <span>分割数</span>
                <div className="v2-quick-grid" role="group" aria-label="分割数">
                  {([3, 4, 5] as GridSize[]).map((n) => (
                    <button
                      key={n}
                      type="button"
                      className={gridCols === n && gridRows === n ? "is-active" : ""}
                      onClick={() => {
                        onChangeGridCols?.(n);
                        onChangeGridRows?.(n);
                      }}
                    >
                      {n}×{n}
                    </button>
                  ))}
                </div>
              </div>
              <button
                type="button"
                className="v2-drop-zone"
                onClick={() => fileInputRef.current?.click()}
                onDrop={(e) => { e.preventDefault(); handleFile(e.dataTransfer.files); }}
                onDragOver={(e) => e.preventDefault()}
                disabled={processing}
              >
                <span style={{ fontSize: 32 }}>📥</span>
                <strong>シート画像をアップロード</strong>
                <span>PNG画像がおすすめ</span>
              </button>
              <label className="v2-autopilot-toggle">
                <input
                  type="checkbox"
                  checked={autoPilot}
                  onChange={(e) => setAutoPilot(e.target.checked)}
                />
                <span>⚡おまかせ（分割→透過→中央寄せまで自動で確認画面へ）</span>
              </label>
            </section>

            <section className="v2-intake-option">
              <div className="v2-intake-option-label">
                <span>完成画像から作る</span>
                <small>最大40枚</small>
              </div>
              <button
                type="button"
                className="v2-drop-zone v2-batch-drop-zone"
                onClick={() => batchFileInputRef.current?.click()}
                onDrop={(e) => { e.preventDefault(); void handleBatchFiles(e.dataTransfer.files); }}
                onDragOver={(e) => e.preventDefault()}
                disabled={processing}
              >
                <span style={{ fontSize: 30 }}>🗂️</span>
                <strong>完成済み画像を一括取り込み</strong>
                <span>1枚ずつ作った画像をまとめて整えます</span>
              </button>
            </section>
          </div>

          {(batchProgress || (!sheetSrc && splitCells.length > 0)) && (
            <div className="v2-batch-result">
              <div className="v2-batch-result-head">
                <strong>{batchProgress || `${splitCells.length}枚を取り込み済み（最大${MAX_BATCH_IMAGES}枚）`}</strong>
                {splitCells.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setSplitCells([]);
                      setMessage("");
                      onImportModeChange?.(null);
                    }}
                  >
                    クリア
                  </button>
                )}
              </div>
              {splitCells.length > 0 && splitCells.length < MAX_BATCH_IMAGES && (
                <>
                  <button
                    type="button"
                    className="v2-append-btn-big"
                    disabled={processing}
                    onClick={() => appendFileInputRef.current?.click()}
                  >
                    ➕ 次のシートを追加（{gridLabel}で分割して合算 → 最大{MAX_BATCH_IMAGES}枚）
                  </button>
                  <p className="v2-append-hint">
                    違う分割数のシートを足す時は、左上の「分割数」を切り替えてから追加してください。
                  </p>
                </>
              )}
              {splitCells.length > 0 && (
                <div className="v2-batch-preview-grid">
                  {splitCells.slice(0, 40).map((cell, index) => (
                    <div key={cell.id} className="v2-batch-preview-cell">
                      <img src={cell.src} alt="" />
                      <span>{index + 1}</span>
                    </div>
                  ))}
                </div>
              )}
              <p>取り込み後は「画像を整える」へ進むと、順番・位置・メイン/タブ選択を確認できます。</p>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => handleFile(e.target.files)}
          />
          <input
            ref={batchFileInputRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => void handleBatchFiles(e.target.files)}
          />
          <input
            ref={appendFileInputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => void handleAppendSheetFiles(e.target.files)}
          />
          {message && (
            <p style={{ fontSize: 12, color: message.includes("失敗") ? "#c66" : "var(--v2-pink)", margin: "10px 0 0", textAlign: "center", fontWeight: 800 }}>
              {message}
            </p>
          )}
        </section>
      </div>
    );
  }

  const lastIdx = cellCount - 1;
  const showGridControls = phase !== "background";
  const showBackgroundControls = phase !== "grid";
  const zoomOverride = zoomCell === null ? null : cropOverrideFor(zoomCell);

  return (
    <>
      <div className="v2-split-room">
        {/* LEFT: セルライブプレビュー（主役） */}
        <section className="v2-split-left">
          <div className="v2-live-head">
            <span className="v2-live-title">
              {phase === "background" ? "背景透過プレビュー（クリックで個別消しゴム）" : "シート分割プレビュー（クリックで拡大）"}
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto" }}>
              <span style={{ fontSize: 11, color: "var(--v2-muted)", fontWeight: 700 }}>背景:</span>
              {LIVE_BGS.map((b) => (
                <button
                  key={b.key}
                  type="button"
                  title={`背景を${b.label}にする`}
                  aria-label={`背景を${b.label}にする`}
                  onClick={() => setLiveBg(b.key)}
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 6,
                    cursor: "pointer",
                    background: b.swatch,
                    border: liveBg === b.key ? "2px solid var(--v2-pink)" : "1.5px solid var(--v2-line)",
                    boxShadow: liveBg === b.key ? "0 0 0 2px rgba(247,168,200,0.3)" : "none",
                    padding: 0,
                  }}
                />
              ))}
            </div>
          </div>

          <div
            ref={liveGridRef}
            className="v2-live-grid"
            style={gridStyle}
            onPointerMove={handleDragMove}
            onPointerUp={stopDrag}
            onPointerCancel={stopDrag}
          >
            {cellRegions.map((r, i) => {
              const splitCell = splitCells[i];
              return (
              <button
                key={i}
                type="button"
                className={`v2-live-cell${hasCropOverride(i) ? " is-individual" : ""}${useSplitCellPreview ? " is-bg-editable" : ""}`}
                style={{ background: liveBgCss }}
                onClick={() => {
                  if (phase === "background") openBatchEditor(i);
                  else setZoomCell(i);
                }}
                aria-label={phase === "background" ? `${i + 1}番目の画像を消しゴムで編集` : `${i + 1}番目のセルを拡大`}
              >
                <span className="v2-live-cell-num">{i + 1}</span>
                {hasCropOverride(i) && <span className="v2-live-cell-badge">個別</span>}
                {useSplitCellPreview && splitCell ? (
                  <img
                    className="v2-live-cell-contained"
                    src={splitCell.src}
                    alt=""
                  />
                ) : (
                  <img
                    src={sheetSrc}
                    alt=""
                    style={{
                      width: `${10000 / r.w}%`,
                      height: `${10000 / r.h}%`,
                      left: `-${(r.x / r.w) * 100}%`,
                      top: `-${(r.y / r.h) * 100}%`,
                    }}
                  />
                )}
                {phase === "background" && <b className="v2-live-cell-action">消しゴム</b>}
              </button>
              );
            })}
            {showGridControls && vLines.map((pct, i) => (
              <button
                key={`live-v-${i}`}
                type="button"
                className="v2-live-line vertical"
                style={{ left: `${pct}%` }}
                aria-label={`縦の分割線 ${i + 1}本目を調整`}
                onPointerDown={(e) => startDrag(e, "vertical", i, liveGridRef.current)}
              />
            ))}
            {showGridControls && hLines.map((pct, i) => (
              <button
                key={`live-h-${i}`}
                type="button"
                className="v2-live-line horizontal"
                style={{ top: `${pct}%` }}
                aria-label={`横の分割線 ${i + 1}本目を調整`}
                onPointerDown={(e) => startDrag(e, "horizontal", i, liveGridRef.current)}
              />
            ))}
          </div>
        </section>

        {/* RIGHT: 分割と背景の操作（普段は省スペース） */}
        <section className="v2-split-right v2-stage-toolbar">
          <h4 className="v2-adjust-title">{phase === "background" ? "背景透過" : "グリッドを整える"}</h4>
          <p className="v2-adjust-sub">
            {phase === "background"
              ? "白背景は自動で透過できます。色クリックは右、消しゴムは左の画像を開いて1枚ずつ調整します。"
              : "縦横の数を選び、必要ならプレビュー上の線をドラッグして微調整します。"}
          </p>

          {/* グリッドサイズ切替 */}
          {showGridControls && (onChangeGridCols || onChangeGridRows) && (
            <div className="v2-adjust-gridbar">
              {renderGridSizeSliders()}
            </div>
          )}

          {showGridControls && (
          <details
            className="v2-adjust-advanced"
            open={advancedOpen}
            onToggle={(event) => setAdvancedOpen(event.currentTarget.open)}
          >
            <summary>分割線とセル余白を調整</summary>
            <div
              ref={adjustPreviewRef}
              className={`v2-adjust-preview${bgTool === "color" ? " is-picking" : bgTool === "eraser" ? " is-erasing" : ""}`}
              onPointerDown={handlePreviewPointerDown}
              onPointerMove={handlePreviewPointerMove}
              onPointerUp={handlePreviewPointerUp}
              onPointerCancel={handlePreviewPointerUp}
            >
              <img src={sheetSrc} alt="" draggable={false} />
              {vLines.map((pct, i) => (
                <button
                  key={`v-${i}`}
                  type="button"
                  className="v2-sheet-line vertical"
                  style={{ left: `${pct}%` }}
                  aria-label={`縦の分割線 ${i + 1}本目`}
                  onPointerDown={(e) => startDrag(e, "vertical", i, adjustPreviewRef.current)}
                />
              ))}
              {hLines.map((pct, i) => (
                <button
                  key={`h-${i}`}
                  type="button"
                  className="v2-sheet-line horizontal"
                  style={{ top: `${pct}%` }}
                  aria-label={`横の分割線 ${i + 1}本目`}
                  onPointerDown={(e) => startDrag(e, "horizontal", i, adjustPreviewRef.current)}
                />
              ))}
            </div>
            <p>分割線は画像上でドラッグできます。隣のセルが少し写るときだけセル余白を上げます。</p>
            <div className="v2-trim-gutter-card">
              <div className="v2-trim-gutter-head">
                <span>セル内をすこし内側へ</span>
                <span><strong>{trimGutter.toFixed(1)}%</strong></span>
              </div>
              <input
                type="range"
                min={0}
                max={8}
                step={0.25}
                value={trimGutter}
                onChange={(e) => setTrimGutter(Number(e.target.value))}
                onPointerUp={() => sheetSrc && regenerateCells(sheetSrc)}
                onMouseUp={() => sheetSrc && regenerateCells(sheetSrc)}
              />
              <p>隣のセルがちょっと写り込むときだけ上げます。普段は 0% でOK。</p>
            </div>
          </details>
          )}

          {/* 背景削除ツール */}
          {showBackgroundControls && (
          <div className="v2-bg-tool-card">
            <div className="v2-bg-tool-head">
              <span>背景削除</span>
              {pickedColor && (
                <span
                  className="v2-picked-color"
                  title={`RGB(${pickedColor.r}, ${pickedColor.g}, ${pickedColor.b})`}
                  style={{ background: `rgb(${pickedColor.r}, ${pickedColor.g}, ${pickedColor.b})` }}
                />
              )}
            </div>
            <div
              className={`v2-bg-edit-preview${sidebarBgTool === "color" ? " is-picking" : ""}`}
              style={{ background: liveBgCss }}
              role="button"
              tabIndex={0}
              onClick={() => openSheetEditor()}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  openSheetEditor();
                }
              }}
              aria-label="背景透過プレビューを拡大して編集"
            >
              <img src={sheetSrc} alt="" draggable={false} />
              <span className="v2-bg-edit-open">拡大して編集</span>
            </div>
            <div className="v2-bg-tool-tabs" role="group" aria-label="背景削除モード">
              {BG_SIDEBAR_TOOLS.map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className={sidebarBgTool === key ? "is-active" : ""}
                  onClick={() => {
                    setBgTool(key);
                  }}
                >
                  {renderBgToolTabLabel(key, label)}
                </button>
              ))}
            </div>

            {sidebarBgTool === "auto" && (
              <div className="v2-bg-tool-body">
                {!useSplitCellPreview && renderTransparentToggle()}
                <button
                  type="button"
                  className="v2-bg-tool-action"
                  disabled={processing || (!sheetSrc && splitCells.length === 0)}
                  onClick={() => {
                    if (useSplitCellPreview) void runBatchTransparency();
                    else void runAutoTransparency();
                  }}
                >
                  {useSplitCellPreview ? "全コマを自動透過" : "自動透過を実行"}
                </button>
                <p>
                  {useSplitCellPreview
                    ? "現在の並びと個別調整を保ったまま、各コマの端につながる背景色を透明にします。"
                    : "白や薄い背景が外側につながっている画像向きです。"}
                </p>
              </div>
            )}

            {sidebarBgTool === "color" && (
              <div className="v2-bg-tool-body">
                <label className="v2-bg-slider">
                  <span>許容値 <strong>{bgTolerance}</strong></span>
                  <input
                    type="range"
                    min={4}
                    max={90}
                    step={1}
                    value={bgTolerance}
                    onChange={(e) => setBgTolerance(Number(e.target.value))}
                  />
                </label>
                <button
                  type="button"
                  className="v2-bg-tool-action"
                  disabled={processing || !pickedColor}
                  onClick={() => {
                    if (useSplitCellPreview) void runBatchColorTransparency();
                    else void runColorTransparency();
                  }}
                >
                  {useSplitCellPreview ? "この色を全コマに適用" : "この色でもう一度削除"}
                </button>
                {renderColorUndoButton()}
                <p>
                  {useSplitCellPreview
                    ? "左のコマを開いて色を拾うと、その色を全コマにまとめて適用できます。"
                    : "プレビューを拡大して、消したい背景色をクリックします。似た色の範囲は許容値で調整できます。"}
                </p>
              </div>
            )}

            <button
              type="button"
              className="v2-bg-tool-secondary"
              disabled={processing || !bgResetReady}
              onClick={resetAllBackgroundTransparency}
            >
              背景透過リセット
            </button>

          </div>
          )}

          <div className="v2-split-actions">
            {showGridControls && (
            <button
              type="button"
              className="v2-btn-reset"
              onClick={() => {
                resetCuts();
                setTrimGutter(0);
              }}
            >
              ↺ リセット
            </button>
            )}
            <button
              type="button"
              className="v2-sheet-bar-swap"
              style={{ padding: "8px 14px", fontSize: 12 }}
              onClick={() => fileInputRef.current?.click()}
            >
              ⇄ 別の画像
            </button>
          </div>

          {splitCells.length > 0 && (
            <p style={{ fontSize: 11.5, color: "var(--v2-pink)", margin: "12px 0 0", fontWeight: 800, textAlign: "center" }}>
              ✓ {cellCount}枚に分割済み（次の工程へ進めます）
            </p>
          )}
          {message && (
            <p style={{ fontSize: 12, color: "#c66", margin: "8px 0 0", textAlign: "center" }}>
              {message}
            </p>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => handleFile(e.target.files)}
          />
        </section>
      </div>

      {bgEditZoomOpen && bgEditorSrc && renderBgEditorModal(bgEditorSrc)}

      {/* セル拡大モーダル */}
      {zoomCell !== null && (
        <div
          className="v2-cell-zoom-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setZoomCell(null);
          }}
        >
          <div className="v2-cell-zoom-layout" onClick={(e) => e.stopPropagation()}>
          <div className="v2-cell-zoom-inner" style={{ background: liveBgCss }}>
            <button
              type="button"
              className="v2-cell-zoom-close"
              onClick={() => setZoomCell(null)}
              aria-label="閉じる"
            >
              ×
            </button>
            {zoomCell > 0 && (
              <button
                type="button"
                className="v2-cell-zoom-nav prev"
                onClick={() => setZoomCell((c) => (c === null ? null : Math.max(0, c - 1)))}
                aria-label="前のセル"
              >
                ←
              </button>
            )}
            {zoomCell < lastIdx && (
              <button
                type="button"
                className="v2-cell-zoom-nav next"
                onClick={() => setZoomCell((c) => (c === null ? null : Math.min(lastIdx, c + 1)))}
                aria-label="次のセル"
              >
                →
              </button>
            )}
            <img
              src={sheetSrc}
              alt=""
              style={{
                width: `${10000 / cellRegions[zoomCell].w}%`,
                height: `${10000 / cellRegions[zoomCell].h}%`,
                left: `-${(cellRegions[zoomCell].x / cellRegions[zoomCell].w) * 100}%`,
                top: `-${(cellRegions[zoomCell].y / cellRegions[zoomCell].h) * 100}%`,
              }}
            />
            <span className="v2-cell-zoom-label">
              {zoomCell + 1} / {cellCount}　← → キーで切替、ESCで閉じる
            </span>
          </div>
          {zoomOverride && (
            <div className="v2-cell-individual-panel">
              <div className="v2-cell-individual-head">
                <span>{zoomCell + 1}番だけ個別対応</span>
                {hasCropOverride(zoomCell) && <em>適用中</em>}
              </div>
              <p>全体の線はそのまま、このコマだけ切り出し範囲を補正します。サイズはマイナスで小さく、プラスで大きくなります。</p>
              <label>
                <span>サイズ <strong>{(zoomOverride.zoom ?? 0).toFixed(1)}%</strong></span>
                <input
                  type="range"
                  min={-8}
                  max={8}
                  step={0.25}
                  value={zoomOverride.zoom ?? 0}
                  onChange={(event) => updateCellCropOverride(zoomCell, { zoom: Number(event.target.value) })}
                />
              </label>
              <label>
                <span>横に広げる <strong>{(zoomOverride.padX ?? 0).toFixed(1)}%</strong></span>
                <input
                  type="range"
                  min={0}
                  max={8}
                  step={0.25}
                  value={zoomOverride.padX ?? 0}
                  onChange={(event) => updateCellCropOverride(zoomCell, { padX: Number(event.target.value) })}
                />
              </label>
              <label>
                <span>縦に広げる <strong>{(zoomOverride.padY ?? 0).toFixed(1)}%</strong></span>
                <input
                  type="range"
                  min={0}
                  max={8}
                  step={0.25}
                  value={zoomOverride.padY ?? 0}
                  onChange={(event) => updateCellCropOverride(zoomCell, { padY: Number(event.target.value) })}
                />
              </label>
              <label>
                <span>左右にずらす <strong>{(zoomOverride.shiftX ?? 0).toFixed(1)}%</strong></span>
                <input
                  type="range"
                  min={-8}
                  max={8}
                  step={0.25}
                  value={zoomOverride.shiftX ?? 0}
                  onChange={(event) => updateCellCropOverride(zoomCell, { shiftX: Number(event.target.value) })}
                />
              </label>
              <label>
                <span>上下にずらす <strong>{(zoomOverride.shiftY ?? 0).toFixed(1)}%</strong></span>
                <input
                  type="range"
                  min={-8}
                  max={8}
                  step={0.25}
                  value={zoomOverride.shiftY ?? 0}
                  onChange={(event) => updateCellCropOverride(zoomCell, { shiftY: Number(event.target.value) })}
                />
              </label>
              <button
                type="button"
                className="v2-cell-individual-reset"
                onClick={() => resetCellCropOverride(zoomCell)}
                disabled={!hasCropOverride(zoomCell)}
              >
                このコマの個別対応を解除
              </button>
            </div>
          )}
          </div>
        </div>
      )}
    </>
  );
}
