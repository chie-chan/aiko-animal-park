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
// gridSize=1〜5 に対応。
// 白背景のPNGをアップロードすると白い背景を自動で透過（縁フラッドフィル）→分割する。透過済みPNGならトグルOFFでそのまま使える。
// ======================================================================

interface Props {
  sheetSrc: string | null;
  setSheetSrc: (v: string | null) => void;
  verticalCuts: number[];
  setVerticalCuts: (v: number[]) => void;
  horizontalCuts: number[];
  setHorizontalCuts: (v: number[]) => void;
  splitCells: SourceImage[];
  setSplitCells: (v: SourceImage[]) => void;
  gridSize?: GridSize;
  onChangeGridSize?: (g: GridSize) => void;
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
    sheetSrc, setSheetSrc,
    verticalCuts, setVerticalCuts,
    horizontalCuts, setHorizontalCuts,
    splitCells, setSplitCells,
    gridSize = 4,
    onChangeGridSize,
  } = props;

  // グリッドサイズトグル（共通レンダー）
  function renderGridSizeToggle(extraClass = "") {
    if (!onChangeGridSize) return null;
    const sizes: GridSize[] = [1, 2, 3, 4, 5];
    return (
      <div className={`v2-gridsize-toggle ${extraClass}`} role="group" aria-label="グリッドサイズ切替">
        {sizes.map((size) => (
          <button
            key={size}
            type="button"
            className={`v2-gridsize-btn${gridSize === size ? " is-active" : ""}`}
            onClick={() => onChangeGridSize(size)}
            title={`${size}×${size}=${size * size}コマ`}
          >
            {size}×{size}
            <span className="v2-gridsize-sub">{size * size}コマ</span>
          </button>
        ))}
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
        ✨ 白い背景を自動で透過する
        {processing && <span style={{ color: "var(--v2-pink)" }}>（処理中…）</span>}
      </label>
    );
  }

  const cellCount = gridSize * gridSize;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const batchFileInputRef = useRef<HTMLInputElement>(null);
  const adjustPreviewRef = useRef<HTMLDivElement>(null);
  const eraseSourceRef = useRef<string | null>(null);
  const eraseQueueRef = useRef<EraseStroke[]>([]);
  const eraseBusyRef = useRef(false);
  const [drag, setDrag] = useState<{ axis: DragAxis; index: number } | null>(null);
  const [erasing, setErasing] = useState(false);
  const [zoomCell, setZoomCell] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [batchProgress, setBatchProgress] = useState("");
  const [trimGutter, setTrimGutter] = useState<number>(0);
  // 白背景を自動透過するか（既定ON）。rawSrc=透過前の元画像を保持し、トグルで再生成する。
  const [bgTransparent, setBgTransparent] = useState<boolean>(true);
  const [rawSrc, setRawSrc] = useState<string | null>(null);
  const [processing, setProcessing] = useState<boolean>(false);
  const [bgTool, setBgTool] = useState<BgTool>("auto");
  const [bgTolerance, setBgTolerance] = useState<number>(24);
  const [eraseRadius, setEraseRadius] = useState<number>(22);
  const [pickedColor, setPickedColor] = useState<RgbColor | null>(null);
  // 分割プレビューの背景（透過確認用・市松/白/黒/桃/青）
  const [liveBg, setLiveBg] = useState<string>("checker");
  const liveBgCss = (LIVE_BGS.find((b) => b.key === liveBg) ?? LIVE_BGS[0]).css;

  useEffect(() => {
    eraseSourceRef.current = sheetSrc;
  }, [sheetSrc]);

  // 取り込んだ画像に（必要なら）透過をかけて sheetSrc にセット
  async function applyUploadedSrc(url: string) {
    setRawSrc(url);
    if (!bgTransparent) {
      setSheetSrc(url);
      setMessage("");
      return;
    }
    setProcessing(true);
    setMessage("背景を透過しています…");
    try {
      const out = await makeImageTransparent(url);
      setSheetSrc(out);
      setMessage("");
    } catch (err) {
      console.error(err);
      setSheetSrc(url);
      setMessage("透過に失敗したため、元の画像で読み込みました。");
    } finally {
      setProcessing(false);
    }
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
    const vc = safeCuts(verticalCuts, gridSize);
    const hc = safeCuts(horizontalCuts, gridSize);
    const xs = [OUTER_PADDING, ...vc.map((c) => linePosition(c, OUTER_PADDING)), 100 - OUTER_PADDING];
    const ys = [OUTER_PADDING, ...hc.map((c) => linePosition(c, OUTER_PADDING)), 100 - OUTER_PADDING];
    const colSizes = Array.from({ length: gridSize }, (_, i) => xs[i + 1] - xs[i]);
    const rowSizes = Array.from({ length: gridSize }, (_, i) => ys[i + 1] - ys[i]);
    return {
      gridTemplateColumns: colSizes.map((s) => `${s}fr`).join(" "),
      gridTemplateRows: rowSizes.map((s) => `${s}fr`).join(" "),
    };
  }, [verticalCuts, horizontalCuts, gridSize]);

  // ── セルの座標（%）をライブ計算（trimGutter込み） ────
  const cellRegions: CellRegion[] = useMemo(() => {
    const vc = safeCuts(verticalCuts, gridSize);
    const hc = safeCuts(horizontalCuts, gridSize);
    const xs = [OUTER_PADDING, ...vc.map((c) => linePosition(c, OUTER_PADDING)), 100 - OUTER_PADDING];
    const ys = [OUTER_PADDING, ...hc.map((c) => linePosition(c, OUTER_PADDING)), 100 - OUTER_PADDING];
    const trimHalf = trimGutter / 2;
    const list: CellRegion[] = [];
    const last = gridSize - 1;
    for (let row = 0; row < gridSize; row++) {
      for (let col = 0; col < gridSize; col++) {
        const baseX = xs[col];
        const baseY = ys[row];
        const baseW = xs[col + 1] - xs[col];
        const baseH = ys[row + 1] - ys[row];
        const leftTrim = col === 0 ? 0 : trimHalf;
        const rightTrim = col === last ? 0 : trimHalf;
        const topTrim = row === 0 ? 0 : trimHalf;
        const bottomTrim = row === last ? 0 : trimHalf;
        list.push({
          x: baseX + leftTrim,
          y: baseY + topTrim,
          w: baseW - leftTrim - rightTrim,
          h: baseH - topTrim - bottomTrim,
        });
      }
    }
    return list;
  }, [verticalCuts, horizontalCuts, trimGutter, gridSize]);

  // ── PNG実体を再生成（アップロード時・ドラッグ確定時） ──
  async function regenerateCells(src: string) {
    try {
      const cells = await splitSheetImage(
        src,
        OUTER_PADDING,
        trimGutter,
        verticalCuts,
        horizontalCuts,
        gridSize,
        gridSize,
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
  }, [sheetSrc, gridSize]);

  // ── ファイル取り込み ────────────────────────────────
  async function handleFile(files: FileList | null) {
    if (!files || !files[0]) return;
    const url = await readFileAsDataUrl(files[0]);
    await applyUploadedSrc(url);
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
    try {
      const cells: SourceImage[] = [];
      for (let i = 0; i < limited.length; i += 1) {
        const file = limited[i];
        setBatchProgress(`${i + 1} / ${limited.length} 枚を処理中…`);
        const src = await readFileAsDataUrl(file);
        const out = bgTransparent ? await makeImageTransparent(src) : src;
        cells.push({
          id: `batch-${i}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name: file.name || `stamp_${String(i + 1).padStart(2, "0")}.png`,
          src: out,
        });
      }
      setSplitCells(cells);
      setBatchProgress("");
      setMessage(
        `${cells.length}枚を一括取り込みしました${skipped > 0 ? `（上限${MAX_BATCH_IMAGES}枚のため${skipped}枚は未取り込み）` : ""}。`,
      );
    } catch (err) {
      console.error(err);
      setMessage("一括取り込みに失敗しました。画像を確認してください。");
    } finally {
      setProcessing(false);
      setBatchProgress("");
    }
  }

  // ── サンプル画像読み込み（デモ用） ──────────────────
  async function loadSample() {
    try {
      const res = await fetch("/stamp-v2-demo/sample-sheet.png");
      if (!res.ok) {
        setMessage("サンプル画像が見つかりませんでした。");
        return;
      }
      const blob = await res.blob();
      const reader = new FileReader();
      reader.onload = () => {
        void applyUploadedSrc(String(reader.result || ""));
      };
      reader.readAsDataURL(blob);
    } catch (e) {
      console.error(e);
      setMessage("サンプル画像の読み込みに失敗しました。");
    }
  }

  // ── ドラッグ ──────────────────────────────────────────
  function updateCut(axis: DragAxis, index: number, value: number) {
    const cuts = axis === "vertical" ? [...verticalCuts] : [...horizontalCuts];
    cuts[index] = clamp(value, 4, 96);
    const safe = safeCuts(cuts, gridSize);
    if (axis === "vertical") setVerticalCuts(safe);
    else setHorizontalCuts(safe);
  }
  function startDrag(event: React.PointerEvent, axis: DragAxis, index: number) {
    event.preventDefault();
    event.stopPropagation();
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
    setDrag({ axis, index });
  }
  function handleDragMove(event: React.PointerEvent) {
    if (!drag || !adjustPreviewRef.current) return;
    const rect = adjustPreviewRef.current.getBoundingClientRect();
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
    const d = defaultCuts(gridSize);
    setVerticalCuts(d);
    setHorizontalCuts(d);
    if (sheetSrc) regenerateCells(sheetSrc);
  }

  // ── キーボード（ESC・矢印） ───────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (zoomCell === null) return;
      const lastIdx = cellCount - 1;
      if (e.key === "Escape") setZoomCell(null);
      else if (e.key === "ArrowRight") setZoomCell((c) => (c === null ? null : Math.min(lastIdx, c + 1)));
      else if (e.key === "ArrowLeft")  setZoomCell((c) => (c === null ? null : Math.max(0, c - 1)));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoomCell, cellCount]);

  const vLines = safeCuts(verticalCuts, gridSize).map((c) => linePosition(c, OUTER_PADDING));
  const hLines = safeCuts(horizontalCuts, gridSize).map((c) => linePosition(c, OUTER_PADDING));

  const gridLabel = `${gridSize}×${gridSize}`;

  // ── 描画 ──────────────────────────────────────────────
  if (!sheetSrc) {
    // 画像未アップロード：ドロップゾーンを大きく表示
    return (
      <div className="v2-split-room" style={{ gridTemplateColumns: "1fr" }}>
        <section className="v2-split-left">
          <div className="v2-canva-reminder v2-intake-head">
            <div>
              <strong>素材の入口を選ぶ</strong>
              <span>シート分割と完成済み画像の一括取り込みを分けました。</span>
            </div>
            <div className="v2-intake-chips" aria-label="対応作業">
              <span>1×1〜5×5</span>
              <span>40枚一括</span>
              <span>背景削除</span>
              <span>LINE用ZIP</span>
            </div>
          </div>

          {/* サンプル参考表示 */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "180px 1fr",
            gap: 18,
            alignItems: "center",
            background: "#fff",
            border: "1.5px solid var(--v2-line)",
            borderRadius: 12,
            padding: 14,
            marginBottom: 14,
          }}>
            <div style={{
              aspectRatio: "1 / 1",
              borderRadius: 8,
              overflow: "hidden",
              background: "repeating-conic-gradient(#e8dbe5 0deg 90deg, #fff 90deg 180deg) 0 0 / 14px 14px",
              border: "1.5px solid var(--v2-line-soft)",
            }}>
              <img
                src="/stamp-v2-demo/sample-sheet.png"
                alt={`${gridLabel}スタンプシートのサンプル`}
                style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
                onError={(e) => { (e.currentTarget.parentElement as HTMLElement).style.display = "none"; }}
              />
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 900, color: "var(--v2-ink)", marginBottom: 6 }}>
                シート画像を分割して使う場合
              </div>
              <p style={{ fontSize: 12, color: "var(--v2-muted)", lineHeight: 1.65, margin: "0 0 8px" }}>
                AIで作った1×1〜5×5のスタンプシート画像をアップロードしてください。
                白い背景でもOK。「✨ 白い背景を自動で透過する」がONなら、白い背景を自動で透明にします（チェック柄＝透過された場所）。
              </p>
              <button
                type="button"
                onClick={loadSample}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "7px 14px",
                  borderRadius: 999,
                  background: "linear-gradient(135deg, #f7a8c8, #b89bea)",
                  color: "#fff",
                  border: "none",
                  fontSize: 11.5,
                  fontWeight: 800,
                  cursor: "pointer",
                  boxShadow: "0 4px 10px rgba(141, 107, 223, 0.22)",
                }}
              >
                🎬 このサンプルで操作を試す
              </button>
            </div>
          </div>

          {/* グリッドサイズ選択 */}
          {onChangeGridSize && (
            <div className="v2-drop-gridsize-row">
              <span className="v2-drop-gridsize-label">シート分割サイズ：</span>
              {renderGridSizeToggle("v2-gridsize-toggle-inline")}
              <span className="v2-drop-gridsize-hint">
                1枚確認から25枚セットまで対応。スタンプは8/16/24/32/40枚、絵文字は8〜40枚の素材作りに使えます。
              </span>
            </div>
          )}

          <div
            style={{
              display: "flex",
              justifyContent: "center",
              margin: "2px 0 12px",
            }}
          >
            {renderTransparentToggle()}
          </div>

          <div className="v2-intake-options">
            <section className="v2-intake-option">
              <div className="v2-intake-option-label">
                <span>シートから作る</span>
                <small>{gridLabel} を分割</small>
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

          <div className="v2-live-grid" style={gridStyle}>
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
          </div>
        </section>

        {/* RIGHT: 分割線の微調整（サブ） */}
        <section className="v2-split-right">
          <h4 className="v2-adjust-title">分割と背景の調整</h4>
          <p className="v2-adjust-sub">境界線、背景削除、セル内の写り込みをここで整えます。普通はそのままで大丈夫。</p>

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
                onPointerDown={(e) => startDrag(e, "vertical", i)}
              />
            ))}
            {hLines.map((pct, i) => (
              <button
                key={`h-${i}`}
                type="button"
                className="v2-sheet-line horizontal"
                style={{ top: `${pct}%` }}
                aria-label={`横の分割線 ${i + 1}本目`}
                onPointerDown={(e) => startDrag(e, "horizontal", i)}
              />
            ))}
          </div>

          {/* グリッドサイズ切替 */}
          {onChangeGridSize && (
            <div className="v2-adjust-gridsize">
              <span className="v2-adjust-gridsize-label">グリッド</span>
              {renderGridSizeToggle("v2-gridsize-toggle-inline")}
            </div>
          )}

          {/* 背景削除ツール */}
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
                  自動削除を再実行
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
                <p>プレビュー上の消したい背景色をクリック。似た色の範囲は許容値で調整できます。</p>
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
                <p>プレビュー上をなぞると、その部分だけ手動で透明になります。</p>
              </div>
            )}
          </div>

          {/* セル内余白の微調整 */}
          <div style={{
            background: "#fffaf3",
            border: "1px dashed #f3c8aa",
            borderRadius: 8,
            padding: "10px 12px",
            marginTop: 4,
            fontSize: 11.5,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontWeight: 800, color: "#c25b1f" }}>
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
              style={{ width: "100%", accentColor: "#c25b1f" }}
            />
            <p style={{ margin: "4px 0 0", fontSize: 10.5, color: "var(--v2-muted)", lineHeight: 1.5 }}>
              隣のセルがちょっと写り込んでしまうときに上げる。普段は 0% でOK。
            </p>
          </div>

          <div className="v2-split-actions">
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
              ✓ {cellCount}枚に分割済み（画像を整えるへ進めます）
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
