import { useEffect, useMemo, useRef, useState } from "react";
import {
  type GridSize,
  type SourceImage,
  clamp,
  defaultCuts,
  eraseImageAtPoints,
  type EraseStroke,
  linePosition,
  makeImageTransparent,
  pickImageColor,
  readFileAsDataUrl,
  type RgbColor,
  safeCuts,
  splitSheetImage,
} from "./stamp-v2-split";

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
  gridCols?: GridSize;
  gridRows?: GridSize;
  onChangeGridCols?: (g: GridSize) => void;
  onChangeGridRows?: (g: GridSize) => void;
  onImportModeChange?: (mode: "sheet" | "batch" | null) => void;
  onImportComplete?: (mode: "sheet" | "batch") => void;
}

type DragAxis = "vertical" | "horizontal";
type BgTool = "auto" | "color" | "eraser";

const OUTER_PADDING = 0;
const MAX_BATCH_IMAGES = 40;

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
    gridCols = 4,
    gridRows = 4,
    onChangeGridCols,
    onChangeGridRows,
    onImportModeChange,
    onImportComplete,
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
  const liveGridRef = useRef<HTMLDivElement>(null);
  const adjustPreviewRef = useRef<HTMLDivElement>(null);
  const dragBoundsRef = useRef<HTMLElement | null>(null);
  const eraseSourceRef = useRef<string | null>(null);
  const eraseQueueRef = useRef<EraseStroke[]>([]);
  const eraseBusyRef = useRef(false);
  const [drag, setDrag] = useState<{ axis: DragAxis; index: number } | null>(null);
  const [erasing, setErasing] = useState(false);
  const [zoomCell, setZoomCell] = useState<number | null>(null);
  const [bgEditZoomOpen, setBgEditZoomOpen] = useState(false);
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
  const [eraseRadius, setEraseRadius] = useState<number>(22);
  const [pickedColor, setPickedColor] = useState<RgbColor | null>(null);
  // 分割プレビューの背景（透過確認用・市松/白/黒/桃/青）
  const [liveBg, setLiveBg] = useState<string>("checker");
  const liveBgCss = (LIVE_BGS.find((b) => b.key === liveBg) ?? LIVE_BGS[0]).css;

  useEffect(() => {
    eraseSourceRef.current = sheetSrc;
  }, [sheetSrc]);

  // 取り込み時は元画像のまま sheetSrc にセットする。背景透過はStep3で行う。
  async function applyUploadedSrc(url: string) {
    setRawSrc(url);
    setBgTransparent(false);
    setSheetSrc(url);
    setMessage("");
  }

  // 透過トグルの切替（元画像から作り直す）
  async function toggleBgTransparent(next: boolean) {
    setBgTransparent(next);
    if (!rawSrc) return;
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

  async function runAutoTransparency(source = rawSrc ?? sheetSrc) {
    if (!source) return;
    setBgTransparent(true);
    setProcessing(true);
    setMessage("背景を透過しています…");
    try {
      const out = await makeImageTransparent(source);
      setSheetSrc(out);
      setMessage("");
    } catch (err) {
      console.error(err);
      setMessage("透過に失敗しました。別の方法で試してください。");
    } finally {
      setProcessing(false);
    }
  }

  async function runColorTransparency(color = pickedColor, source = rawSrc ?? sheetSrc) {
    if (!source || !color) return;
    setBgTransparent(true);
    setProcessing(true);
    setMessage("選んだ色の背景を透過しています…");
    try {
      const out = await makeImageTransparent(source, {
        targetColor: color,
        tolerance: bgTolerance,
      });
      setSheetSrc(out);
      setMessage("");
    } catch (err) {
      console.error(err);
      setMessage("色指定の透過に失敗しました。許容値を変えてもう一度試してください。");
    } finally {
      setProcessing(false);
    }
  }

  function pointFromPreview(event: React.PointerEvent) {
    if (!adjustPreviewRef.current) return null;
    const rect = adjustPreviewRef.current.getBoundingClientRect();
    return {
      x: clamp((event.clientX - rect.left) / rect.width, 0, 1),
      y: clamp((event.clientY - rect.top) / rect.height, 0, 1),
    };
  }

  async function pickAndRemoveColor(event: React.PointerEvent) {
    const point = pointFromPreview(event);
    const source = rawSrc ?? sheetSrc;
    if (!point || !source || processing) return;
    const color = await pickImageColor(source, point.x, point.y);
    if (!color) {
      setMessage("色を読み取れませんでした。別の場所をクリックしてください。");
      return;
    }
    setPickedColor(color);
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
      setSheetSrc(out);
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
    if (!point || !sheetSrc) return;
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
        list.push({
          x: baseX + leftTrim,
          y: baseY + topTrim,
          w: baseW - leftTrim - rightTrim,
          h: baseH - topTrim - bottomTrim,
        });
      }
    }
    return list;
  }, [verticalCuts, horizontalCuts, trimGutter, gridCols, gridRows]);

  // ── PNG実体を再生成（アップロード時・ドラッグ確定時） ──
  async function regenerateCells(src: string) {
    try {
      const cells = await splitSheetImage(
        src,
        OUTER_PADDING,
        trimGutter,
        verticalCuts,
        horizontalCuts,
        gridCols,
        gridRows,
      );
      setSplitCells(cells);
      setMessage("");
    } catch (err) {
      console.error(err);
      setMessage("分割に失敗しました。画像を確認してください。");
    }
  }

  // シート画像アップロード時／グリッドサイズ変更時に即座に分割。
  // 40枚一括取り込みでは sheetSrc を使わないため、sheetSrc=null でも splitCells は消さない。
  useEffect(() => {
    if (sheetSrc) {
      regenerateCells(sheetSrc);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheetSrc, gridCols, gridRows]);

  // ── ファイル取り込み ────────────────────────────────
  async function handleFile(files: FileList | null) {
    if (!files || !files[0]) return;
    const url = await readFileAsDataUrl(files[0]);
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
    setSheetSrc(null);
    setRawSrc(null);
    setPickedColor(null);
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

  async function runBatchTransparency() {
    if (!splitCells.length || processing) return;
    setProcessing(true);
    setBatchProgress(`0 / ${splitCells.length} 枚を透過中…`);
    setMessage("");
    try {
      const next: SourceImage[] = [];
      for (let i = 0; i < splitCells.length; i += 1) {
        setBatchProgress(`${i + 1} / ${splitCells.length} 枚を透過中…`);
        const cell = splitCells[i];
        const bgColor =
          (await pickImageColor(cell.src, 0, 0)) ??
          (await pickImageColor(cell.src, 1, 0)) ??
          (await pickImageColor(cell.src, 0, 1)) ??
          (await pickImageColor(cell.src, 1, 1));
        const src = bgColor
          ? await makeImageTransparent(cell.src, { targetColor: bgColor, tolerance: Math.max(bgTolerance, 32) })
          : await makeImageTransparent(cell.src);
        next.push({ ...cell, src });
      }
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
      // ドラッグ確定時にPNG再生成
      regenerateCells(sheetSrc);
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
      if (latest) regenerateCells(latest);
    }
    stopDrag();
  }
  function resetCuts() {
    setVerticalCuts(defaultCuts(gridCols));
    setHorizontalCuts(defaultCuts(gridRows));
    if (sheetSrc) regenerateCells(sheetSrc);
  }

  // ── キーボード（ESC・矢印） ───────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (bgEditZoomOpen && e.key === "Escape") {
        setBgEditZoomOpen(false);
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

  // ── 描画 ──────────────────────────────────────────────
  if (phase === "background" && !sheetSrc && splitCells.length > 0) {
    return (
      <div className="v2-export-room v2-batch-background-room">
        <section className="v2-export-left">
          <div className="v2-export-head">
            <span className="v2-export-title">背景透過プレビュー</span>
            <span className="v2-export-sub">40枚一括取り込み</span>
          </div>
          <div className="v2-batch-preview-grid v2-batch-background-grid">
            {splitCells.slice(0, 40).map((cell, index) => (
              <div key={cell.id} className="v2-batch-preview-cell">
                <img src={cell.src} alt="" />
                <span>{index + 1}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="v2-export-right v2-stage-toolbar">
          <h4 className="v2-adjust-title">背景透過</h4>
          <p className="v2-adjust-sub">
            完成画像をまとめて取り込んだ場合は、各画像の端にある背景色を拾って40枚まで一括で透過できます。
          </p>
          <button
            type="button"
            className="v2-bg-tool-action"
            disabled={processing || splitCells.length === 0}
            onClick={() => void runBatchTransparency()}
          >
            {processing ? "透過中…" : "背景を一括透過"}
          </button>
          {batchProgress && <p className="v2-toolbar-note">{batchProgress}</p>}
          {message && <p className="v2-toolbar-note">{message}</p>}
        </section>
      </div>
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
                <small>{gridLabel} に分割</small>
              </div>
              <button
                type="button"
                className="v2-drop-zone"
                onClick={() => fileInputRef.current?.click()}
                onDrop={(e) => { e.preventDefault(); handleFile(e.dataTransfer.files); }}
                onDragOver={(e) => e.preventDefault()}
              >
                <span style={{ fontSize: 32 }}>📥</span>
                <strong>シート画像をアップロード</strong>
                <span>選んだ {gridLabel} でコマ分割します（PNG推奨）</span>
              </button>
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
                <strong>{batchProgress || `${splitCells.length}枚を取り込み済み`}</strong>
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

  return (
    <>
      <div className="v2-split-room">
        {/* LEFT: セルライブプレビュー（主役） */}
        <section className="v2-split-left">
          <div className="v2-live-head">
            <span className="v2-live-title">シート分割プレビュー（クリックで拡大）</span>
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
            {cellRegions.map((r, i) => (
              <button
                key={i}
                type="button"
                className="v2-live-cell"
                style={{ background: liveBgCss }}
                onClick={() => setZoomCell(i)}
                aria-label={`${i + 1}番目のセルを拡大`}
              >
                <span className="v2-live-cell-num">{i + 1}</span>
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
              </button>
            ))}
            {vLines.map((pct, i) => (
              <button
                key={`live-v-${i}`}
                type="button"
                className="v2-live-line vertical"
                style={{ left: `${pct}%` }}
                aria-label={`縦の分割線 ${i + 1}本目を調整`}
                onPointerDown={(e) => startDrag(e, "vertical", i, liveGridRef.current)}
              />
            ))}
            {hLines.map((pct, i) => (
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
              ? "白背景は自動で透過できます。必要なときだけ色クリックや消しゴムを使います。"
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
              className={`v2-bg-edit-preview${bgTool === "color" ? " is-picking" : bgTool === "eraser" ? " is-erasing" : ""}`}
              role="button"
              tabIndex={0}
              onClick={() => setBgEditZoomOpen(true)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setBgEditZoomOpen(true);
                }
              }}
              aria-label="背景透過プレビューを拡大して編集"
            >
              <img src={sheetSrc} alt="" draggable={false} />
              <span className="v2-bg-edit-open">拡大して編集</span>
            </div>
            <div className="v2-bg-tool-tabs" role="group" aria-label="背景削除モード">
              {([
                ["auto", "自動"],
                ["color", "色クリック"],
                ["eraser", "消しゴム"],
              ] as const).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className={bgTool === key ? "is-active" : ""}
                  onClick={() => {
                    setBgTool(key);
                    if (key !== "auto") setAdvancedOpen(true);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            {bgTool === "auto" && (
              <div className="v2-bg-tool-body">
                {renderTransparentToggle()}
                <button
                  type="button"
                  className="v2-bg-tool-action"
                  disabled={processing || !sheetSrc}
                  onClick={() => void runAutoTransparency()}
                >
                  自動透過を実行
                </button>
                <p>白や薄い背景が外側につながっている画像向きです。</p>
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
                <p>プレビューを拡大して、消したい背景色をクリックします。似た色の範囲は許容値で調整できます。</p>
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
                <p>プレビューを拡大して画像上をなぞると、その部分だけ手動で透明になります。</p>
              </div>
            )}
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

      {bgEditZoomOpen && sheetSrc && (
        <div
          className="v2-bg-zoom-overlay"
          onClick={(event) => {
            if (event.target === event.currentTarget) setBgEditZoomOpen(false);
          }}
        >
          <div className="v2-bg-zoom-modal" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              className="v2-bg-zoom-close"
              onClick={() => setBgEditZoomOpen(false)}
              aria-label="背景透過の拡大編集を閉じる"
            >
              ×
            </button>

            <div
              ref={adjustPreviewRef}
              className={`v2-bg-zoom-canvas${bgTool === "color" ? " is-picking" : bgTool === "eraser" ? " is-erasing" : ""}`}
              onPointerDown={handlePreviewPointerDown}
              onPointerMove={handlePreviewPointerMove}
              onPointerUp={handlePreviewPointerUp}
              onPointerCancel={handlePreviewPointerUp}
            >
              <img src={sheetSrc} alt="" draggable={false} />
              <span className="v2-bg-zoom-hint">
                {bgTool === "color"
                  ? "消したい背景色をクリック"
                  : bgTool === "eraser"
                    ? "消したい部分をドラッグ"
                    : "自動透過は右のボタンから実行"}
              </span>
            </div>

            <aside className="v2-bg-zoom-tools">
              <div className="v2-bg-tool-head">
                <span>背景透過</span>
                {pickedColor && (
                  <span
                    className="v2-picked-color"
                    title={`RGB(${pickedColor.r}, ${pickedColor.g}, ${pickedColor.b})`}
                    style={{ background: `rgb(${pickedColor.r}, ${pickedColor.g}, ${pickedColor.b})` }}
                  />
                )}
              </div>
              <div className="v2-bg-tool-tabs" role="group" aria-label="背景削除モード">
                {([
                  ["auto", "自動"],
                  ["color", "色クリック"],
                  ["eraser", "消しゴム"],
                ] as const).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    className={bgTool === key ? "is-active" : ""}
                    onClick={() => setBgTool(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {bgTool === "auto" && (
                <div className="v2-bg-tool-body">
                  {renderTransparentToggle()}
                  <button
                    type="button"
                    className="v2-bg-tool-action"
                    disabled={processing || !sheetSrc}
                    onClick={() => void runAutoTransparency()}
                  >
                    自動透過を実行
                  </button>
                  <p>白や薄い背景が外側につながっている画像向きです。</p>
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

              {message && <p className="v2-toolbar-note">{message}</p>}
              <p className="v2-bg-zoom-foot">ESCまたは外側クリックで閉じます。</p>
            </aside>
          </div>
        </div>
      )}

      {/* セル拡大モーダル */}
      {zoomCell !== null && (
        <div
          className="v2-cell-zoom-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setZoomCell(null);
          }}
        >
          <div className="v2-cell-zoom-inner" style={{ background: liveBgCss }} onClick={(e) => e.stopPropagation()}>
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
        </div>
      )}
    </>
  );
}
