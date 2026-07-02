import {
  type DragEvent,
  type PointerEvent as ReactPointerEvent,
  type TouchEvent as ReactTouchEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import "./stamp-mobile.css";
import {
  type CellCropOverride,
  type CellOffset,
  type CropBounds,
  type EraseStroke,
  type GridSize,
  type SourceImage,
  centerDominantImageContent,
  centerImageContent,
  clamp,
  defaultCuts,
  eraseImageAtPoints,
  loadImage,
  makeImageTransparent,
  readFileAsDataUrl,
  safeCuts,
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

type MobileBgPreview = "checker" | "white" | "black" | "pink" | "blue";

const BG_OPTIONS: { value: MobileBgPreview; label: string; cls: string }[] = [
  { value: "checker", label: "透明チェック柄", cls: "checker" },
  { value: "white", label: "白", cls: "white" },
  { value: "black", label: "黒", cls: "black" },
  { value: "pink", label: "ピンク", cls: "pink" },
  { value: "blue", label: "水色", cls: "blue" },
];

type EraserPoint = {
  x: number;
  y: number;
  imageW: number;
  imageH: number;
};

type GesturePoint = {
  id: number;
  x: number;
  y: number;
};

type CropGesture = {
  selectedIndex: number;
  start: CellCropOverride;
  startX: number;
  startY: number;
  startDistance: number;
  width: number;
  height: number;
  draft: CellCropOverride;
  changed: boolean;
};

type CutDrag = {
  axis: "vertical" | "horizontal";
  index: number;
  pointerId: number;
};

type CutLineEstimate = {
  vertical: number[];
  horizontal: number[];
  bounds: CropBounds | null;
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

function bgClass(bg: MobileBgPreview): string {
  return bg === "checker" ? "" : ` bg-${bg}`;
}

async function estimateContentCutLines(src: string, size: GridSize): Promise<CutLineEstimate> {
  const fallback = defaultCuts(size);
  const fallbackEstimate = { vertical: fallback, horizontal: fallback, bounds: null };
  try {
    const image = await loadImage(src);
    const sourceW = image.naturalWidth || image.width;
    const sourceH = image.naturalHeight || image.height;
    if (!sourceW || !sourceH) return fallbackEstimate;

    const scale = Math.min(1, 520 / Math.max(sourceW, sourceH));
    const w = Math.max(1, Math.round(sourceW * scale));
    const h = Math.max(1, Math.round(sourceH * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return fallbackEstimate;
    ctx.drawImage(image, 0, 0, w, h);

    const imageData = ctx.getImageData(0, 0, w, h);
    const data = imageData.data;
    const total = w * h;
    let transparentPixels = 0;
    for (let i = 0; i < total; i += 1) {
      if (data[i * 4 + 3] <= 12) transparentPixels += 1;
    }
    const hasTransparentBackground = transparentPixels > total * 0.02;

    const cornerSize = Math.max(2, Math.round(Math.min(w, h) * 0.025));
    let bgR = 0;
    let bgG = 0;
    let bgB = 0;
    let bgCount = 0;
    const addBgSample = (x0: number, y0: number) => {
      for (let y = y0; y < Math.min(h, y0 + cornerSize); y += 1) {
        for (let x = x0; x < Math.min(w, x0 + cornerSize); x += 1) {
          const o = (y * w + x) * 4;
          if (data[o + 3] <= 12) continue;
          bgR += data[o];
          bgG += data[o + 1];
          bgB += data[o + 2];
          bgCount += 1;
        }
      }
    };
    addBgSample(0, 0);
    addBgSample(Math.max(0, w - cornerSize), 0);
    addBgSample(0, Math.max(0, h - cornerSize));
    addBgSample(Math.max(0, w - cornerSize), Math.max(0, h - cornerSize));
    const bg = bgCount
      ? { r: bgR / bgCount, g: bgG / bgCount, b: bgB / bgCount }
      : { r: 255, g: 255, b: 255 };

    let minX = w;
    let maxX = -1;
    let minY = h;
    let maxY = -1;
    let contentPixels = 0;
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const o = (y * w + x) * 4;
        const a = data[o + 3];
        if (a <= 12) continue;
        const dr = data[o] - bg.r;
        const dg = data[o + 1] - bg.g;
        const db = data[o + 2] - bg.b;
        const colorDistance = Math.sqrt(dr * dr + dg * dg + db * db);
        const isContent = hasTransparentBackground || colorDistance > 28;
        if (!isContent) continue;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
        contentPixels += 1;
      }
    }

    if (contentPixels < total * 0.005 || maxX <= minX || maxY <= minY) {
      return fallbackEstimate;
    }

    const rawLeft = (minX / w) * 100;
    const rawRight = ((maxX + 1) / w) * 100;
    const rawTop = (minY / h) * 100;
    const rawBottom = ((maxY + 1) / h) * 100;
    const padX = Math.max(1.2, (rawRight - rawLeft) * 0.025);
    const padY = Math.max(1.2, (rawBottom - rawTop) * 0.025);
    const left = clamp(rawLeft - padX, 0, 96);
    const right = clamp(rawRight + padX, left + 4, 100);
    const top = clamp(rawTop - padY, 0, 96);
    const bottom = clamp(rawBottom + padY, top + 4, 100);
    const contentW = right - left;
    const contentH = bottom - top;
    if (contentW > 96 && contentH > 96) return fallbackEstimate;

    return {
      vertical: fallback,
      horizontal: fallback,
      bounds: { left, right, top, bottom },
    };
  } catch (err) {
    console.warn("Failed to estimate mobile stamp cut lines", err);
    return fallbackEstimate;
  }
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

  const [gridSize, setGridSize] = useState<GridSize>(4);
  const [rawSheetSrc, setRawSheetSrc] = useState<string | null>(null);
  const [sheetSrc, setSheetSrc] = useState<string | null>(null);
  const [transparentEnabled, setTransparentEnabled] = useState(false);
  const [transparencyBusy, setTransparencyBusy] = useState(false);
  const [splitCells, setSplitCells] = useState<SourceImage[]>([]);
  const [splitMsg, setSplitMsg] = useState("");
  const [processingSplit, setProcessingSplit] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [cellCropOverrides, setCellCropOverrides] = useState<Record<number, CellCropOverride>>({});
  const [splitBgPreview, setSplitBgPreview] = useState<MobileBgPreview>("checker");
  const [verticalCuts, setVerticalCuts] = useState<number[]>(() => defaultCuts(4));
  const [horizontalCuts, setHorizontalCuts] = useState<number[]>(() => defaultCuts(4));
  const [cutBounds, setCutBounds] = useState<CropBounds | null>(null);
  const [cutDrag, setCutDrag] = useState<CutDrag | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const splitCutPreviewRef = useRef<HTMLDivElement>(null);
  const editPreviewRef = useRef<HTMLDivElement>(null);
  const eraseBusyRef = useRef(false);
  const eraseQueueRef = useRef<EraseStroke[]>([]);
  const eraseSourceRef = useRef<string | null>(null);
  const eraseTargetIndexRef = useRef<number | null>(null);
  const lastErasePointRef = useRef<EraserPoint | null>(null);
  const eraserPointerIdRef = useRef<number | null>(null);
  const cropGestureRef = useRef<CropGesture | null>(null);
  const cropPointersRef = useRef<Map<number, GesturePoint>>(new Map());
  // ピンチ/パンのプレビュー更新を1フレーム1回に間引く（毎pointermoveのsetStateを避けてなめらかに）
  const cropRafRef = useRef<number | null>(null);
  const cropLatestPointsRef = useRef<GesturePoint[]>([]);
  const cellCropOverridesRef = useRef<Record<number, CellCropOverride>>({});
  const manualCellSrcOverridesRef = useRef<Record<number, string>>({});
  const eraseStrokeOverridesRef = useRef<Record<number, EraseStroke[]>>({});
  const verticalCutsRef = useRef<number[]>(defaultCuts(4));
  const horizontalCutsRef = useRef<number[]>(defaultCuts(4));
  const cutBoundsRef = useRef<CropBounds | null>(null);
  const splitJobRef = useRef(0);

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [cellOffsets, setCellOffsets] = useState<Record<string, CellOffset>>({});
  const [eraserEnabled, setEraserEnabled] = useState(false);
  const [eraseBusy, setEraseBusy] = useState(false);
  const [erasing, setErasing] = useState(false);
  const [eraserRadius, setEraserRadius] = useState(10);
  const [centerBusy, setCenterBusy] = useState(false);
  const [cropGesturing, setCropGesturing] = useState(false);
  const [gesturePreviewTransform, setGesturePreviewTransform] = useState<string | undefined>();

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
  const verticalLinePositions = useMemo(
    () => safeCuts(verticalCuts, gridSize),
    [verticalCuts, gridSize],
  );
  const horizontalLinePositions = useMemo(
    () => safeCuts(horizontalCuts, gridSize),
    [horizontalCuts, gridSize],
  );
  const cutGridStyle = useMemo(() => {
    const xs = [0, ...verticalLinePositions, 100];
    const ys = [0, ...horizontalLinePositions, 100];
    const columns = Array.from({ length: gridSize }, (_, index) => xs[index + 1] - xs[index]);
    const rows = Array.from({ length: gridSize }, (_, index) => ys[index + 1] - ys[index]);
    return {
      gridTemplateColumns: columns.map((size) => `${size}fr`).join(" "),
      gridTemplateRows: rows.map((size) => `${size}fr`).join(" "),
    };
  }, [verticalLinePositions, horizontalLinePositions, gridSize]);
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

  function setCropOverrideState(next: Record<number, CellCropOverride>) {
    cellCropOverridesRef.current = next;
    setCellCropOverrides(next);
  }

  function cancelPendingSplitWork() {
    splitJobRef.current += 1;
    setProcessingSplit(false);
    setTransparencyBusy(false);
  }

  function setManualCellSrcOverride(index: number, src: string) {
    manualCellSrcOverridesRef.current = {
      ...manualCellSrcOverridesRef.current,
      [index]: src,
    };
  }

  function clearManualCellSrcOverride(index: number) {
    const next = { ...manualCellSrcOverridesRef.current };
    delete next[index];
    manualCellSrcOverridesRef.current = next;
  }

  function clearManualCellSrcOverrides() {
    manualCellSrcOverridesRef.current = {};
  }

  function appendEraseStrokeOverride(index: number, strokes: EraseStroke[]) {
    if (!strokes.length) return;
    eraseStrokeOverridesRef.current = {
      ...eraseStrokeOverridesRef.current,
      [index]: [...(eraseStrokeOverridesRef.current[index] ?? []), ...strokes],
    };
  }

  function clearEraseStrokeOverride(index: number) {
    const next = { ...eraseStrokeOverridesRef.current };
    delete next[index];
    eraseStrokeOverridesRef.current = next;
  }

  function clearEraseStrokeOverrides() {
    eraseStrokeOverridesRef.current = {};
  }

  function setVerticalCutsState(next: number[], size: GridSize = gridSize) {
    const safe = safeCuts(next, size);
    verticalCutsRef.current = safe;
    setVerticalCuts(safe);
  }

  function setHorizontalCutsState(next: number[], size: GridSize = gridSize) {
    const safe = safeCuts(next, size);
    horizontalCutsRef.current = safe;
    setHorizontalCuts(safe);
  }

  function resetCutLines(size: GridSize = gridSize) {
    const next = defaultCuts(size);
    verticalCutsRef.current = next;
    horizontalCutsRef.current = next;
    cutBoundsRef.current = null;
    setVerticalCuts(next);
    setHorizontalCuts(next);
    setCutBounds(null);
    setCutDrag(null);
  }

  async function applyEstimatedCutLines(src: string, size: GridSize = gridSize) {
    const estimate = await estimateContentCutLines(src, size);
    verticalCutsRef.current = estimate.vertical;
    horizontalCutsRef.current = estimate.horizontal;
    cutBoundsRef.current = estimate.bounds;
    setVerticalCuts(estimate.vertical);
    setHorizontalCuts(estimate.horizontal);
    setCutBounds(estimate.bounds);
    setCutDrag(null);
  }

  async function handleFile(files: FileList | null) {
    if (!files || !files[0]) return;
    try {
      const url = await readFileAsDataUrl(files[0]);
      setSheetSrc(null);
      setSplitMsg("");
      setSelectedIndex(0);
      setCellOffsets({});
      setCropOverrideState({});
      clearManualCellSrcOverrides();
      clearEraseStrokeOverrides();
      await applyEstimatedCutLines(url, gridSize);
      setRawSheetSrc(url);
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

  async function buildSplitCells(overrides: Record<number, CellCropOverride>, jobId = splitJobRef.current) {
    if (!sheetSrc) return [];
    const isCurrentJob = () => splitJobRef.current === jobId;
    const cells = await splitSheetImage(
      sheetSrc,
      0,
      0,
      verticalCutsRef.current,
      horizontalCutsRef.current,
      gridSize,
      gridSize,
      overrides,
      {
        preserveCropSize: true,
        cropBounds: cutBoundsRef.current,
      },
    );
    let nextCells = cells.map((cell, index) => ({
      ...cell,
      id: `mobile-cell-${index}`,
      name: `stamp_${String(index + 1).padStart(2, "0")}.png`,
    }));
    if (transparentEnabled) {
      if (isCurrentJob()) {
        setTransparencyBusy(true);
        setSplitMsg("分割画像を透過しています...");
      }
      nextCells = await Promise.all(
        nextCells.map(async (cell) => ({
          ...cell,
          src: await makeImageTransparent(cell.src),
        })),
      );
    }
    if (isCurrentJob()) setSplitMsg("分割画像を中央にそろえています...");
    nextCells = await Promise.all(
      nextCells.map(async (cell) => ({
        ...cell,
        src: await centerImageContent(cell.src),
      })),
    );
    const eraseOverrides = eraseStrokeOverridesRef.current;
    nextCells = await Promise.all(
      nextCells.map(async (cell, index) => {
        const strokes = eraseOverrides[index];
        return strokes?.length ? { ...cell, src: await eraseImageAtPoints(cell.src, strokes) } : cell;
      }),
    );
    const manualOverrides = manualCellSrcOverridesRef.current;
    nextCells = nextCells.map((cell, index) =>
      manualOverrides[index] ? { ...cell, src: manualOverrides[index] } : cell,
    );
    return nextCells;
  }

  async function regenerateSplitCells(
    overrides: Record<number, CellCropOverride>,
    options: { resetSelection?: boolean; message?: string } = {},
  ) {
    if (!sheetSrc) return;
    const jobId = ++splitJobRef.current;
    const keepIndex = Math.min(selectedIndex, Math.max(0, expectedCellCount - 1));
    setProcessingSplit(true);
    setSplitMsg(options.message ?? "");
    try {
      const nextCells = await buildSplitCells(overrides, jobId);
      if (splitJobRef.current !== jobId) return;
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
      if (splitJobRef.current !== jobId) return;
      setSplitCells([]);
      setSplitMsg("分割に失敗しました。画像を確認してください。");
    } finally {
      if (splitJobRef.current === jobId) {
        setProcessingSplit(false);
        setTransparencyBusy(false);
      }
    }
  }

  useEffect(() => {
    if (!sheetSrc) {
      setSplitCells([]);
      setProcessingSplit(false);
      return;
    }

    let cancelled = false;
    const jobId = ++splitJobRef.current;
    setProcessingSplit(true);
    setSplitMsg("");

    (async () => {
      try {
        const nextCells = await buildSplitCells(cellCropOverridesRef.current, jobId);
        if (cancelled || splitJobRef.current !== jobId) return;
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
        if (!cancelled && splitJobRef.current === jobId) {
          setSplitCells([]);
          setSplitMsg("分割に失敗しました。画像を確認してください。");
        }
      } finally {
        if (!cancelled && splitJobRef.current === jobId) {
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
    return { shiftX: 0, shiftY: 0, padX: 0, padY: 0, zoom: 0, ...(cellCropOverridesRef.current[index] ?? {}) };
  }

  function hasCropOverride(index: number) {
    return Boolean(cellCropOverrides[index]);
  }

  function applyCropOverride(index: number, override: CellCropOverride) {
    const normalized = normalizeCropOverride(override);
    const next = { ...cellCropOverridesRef.current };
    if (normalized) next[index] = normalized;
    else delete next[index];
    clearManualCellSrcOverride(index);
    setCropOverrideState(next);
    void regenerateSplitCells(next, { message: "切り出し範囲を調整しています..." });
  }

  function updateSelectedCropOverride(patch: Partial<CellCropOverride>) {
    if (eraseBusyRef.current || eraseBusy || processingSplit) return;
    const current = cropOverrideFor(selectedIndex);
    applyCropOverride(selectedIndex, { ...current, ...patch });
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

  function updateCutLine(axis: CutDrag["axis"], index: number, value: number) {
    const cuts = axis === "vertical" ? [...verticalCutsRef.current] : [...horizontalCutsRef.current];
    cuts[index] = clamp(value, 4, 96);
    if (axis === "vertical") setVerticalCutsState(cuts);
    else setHorizontalCutsState(cuts);
  }

  function startCutLineDrag(event: ReactPointerEvent<HTMLButtonElement>, axis: CutDrag["axis"], index: number) {
    event.preventDefault();
    event.stopPropagation();
    if (processingSplit || !splitCutPreviewRef.current) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setCutDrag({ axis, index, pointerId: event.pointerId });
  }

  function moveCutLineDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (!cutDrag || cutDrag.pointerId !== event.pointerId || !splitCutPreviewRef.current) return;
    event.preventDefault();
    const rect = splitCutPreviewRef.current.getBoundingClientRect();
    const value =
      cutDrag.axis === "vertical"
        ? ((event.clientX - rect.left) / Math.max(1, rect.width)) * 100
        : ((event.clientY - rect.top) / Math.max(1, rect.height)) * 100;
    updateCutLine(cutDrag.axis, cutDrag.index, value);
  }

  function finishCutLineDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (!cutDrag || cutDrag.pointerId !== event.pointerId) return;
    event.preventDefault();
    setCutDrag(null);
    clearManualCellSrcOverrides();
    eraseSourceRef.current = null;
    eraseTargetIndexRef.current = null;
    void regenerateSplitCells(cellCropOverridesRef.current, { message: "" });
  }

  function resetOffset() {
    if (!selectedCell) return;
    setCellOffsets({ ...cellOffsets, [selectedCell.id]: { dx: 0, dy: 0, scale: 1 } });
    const next = { ...cellCropOverridesRef.current };
    delete next[selectedIndex];
    clearEraseStrokeOverride(selectedIndex);
    clearManualCellSrcOverride(selectedIndex);
    setCropOverrideState(next);
    void regenerateSplitCells(next, { message: "個別補正をリセットしています..." });
  }

  async function centerSelectedContent() {
    if (!selectedCell || centerBusy || eraseBusy) return;
    const targetIndex = selectedIndex;
    const targetId = selectedCell.id;
    const source = selectedCell.src;
    clearCropGesture();
    cancelPendingSplitWork();
    setCenterBusy(true);
    setSplitMsg("");
    try {
      const nextSrc = await centerDominantImageContent(source);
      setManualCellSrcOverride(targetIndex, nextSrc);
      setSplitCells((cells) =>
        cells.map((cell, index) => (index === targetIndex ? { ...cell, src: nextSrc } : cell)),
      );
      setCellOffsets((current) => ({
        ...current,
        [targetId]: { dx: 0, dy: 0, scale: 1 },
      }));
      if (eraseTargetIndexRef.current === targetIndex) {
        eraseSourceRef.current = nextSrc;
      }
    } catch (err) {
      console.error(err);
      setSplitMsg("中央寄せに失敗しました。");
    } finally {
      setCenterBusy(false);
    }
  }

  function transformFor(id: string) {
    const o = offsetFor(id);
    const scale = o.scale ?? 1;
    if (!o.dx && !o.dy && scale === 1) return undefined;
    return `translate(${o.dx}%, ${o.dy}%) scale(${scale})`;
  }

  function previewTransformFor(id: string) {
    const transforms = [transformFor(id), gesturePreviewTransform].filter(Boolean);
    return transforms.length ? transforms.join(" ") : undefined;
  }

  function gestureDistance(a: GesturePoint, b: GesturePoint) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function gestureMidpoint(a: GesturePoint, b: GesturePoint): GesturePoint {
    return {
      id: -1,
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2,
    };
  }

  function emptyCropOverride(): CellCropOverride {
    return { shiftX: 0, shiftY: 0, padX: 0, padY: 0, zoom: 0 };
  }

  function clearCropGesture() {
    cropGestureRef.current = null;
    cropPointersRef.current.clear();
    if (cropRafRef.current != null) {
      cancelAnimationFrame(cropRafRef.current);
      cropRafRef.current = null;
    }
    cropLatestPointsRef.current = [];
    setCropGesturing(false);
    setGesturePreviewTransform(undefined);
  }

  function makeCropGestureStart(rect: DOMRect, points: GesturePoint[], start: CellCropOverride): CropGesture {
    const origin = points.length >= 2 ? gestureMidpoint(points[0], points[1]) : points[0];
    return {
      selectedIndex,
      start,
      startX: origin.x,
      startY: origin.y,
      startDistance: points.length >= 2 ? gestureDistance(points[0], points[1]) : 0,
      width: Math.max(1, rect.width),
      height: Math.max(1, rect.height),
      draft: start,
      changed: false,
    };
  }

  function updateCropGesturePreview(points: GesturePoint[]) {
    const gesture = cropGestureRef.current;
    if (!gesture || points.length === 0) return;

    const origin = points.length >= 2 ? gestureMidpoint(points[0], points[1]) : points[0];
    const dxPx = origin.x - gesture.startX;
    const dyPx = origin.y - gesture.startY;
    const distance = points.length >= 2 ? gestureDistance(points[0], points[1]) : gesture.startDistance;
    const pinchScale =
      points.length >= 2 && gesture.startDistance > 0
        ? Math.max(0.65, Math.min(1.55, distance / gesture.startDistance))
        : 1;
    const changed = Math.hypot(dxPx, dyPx) > 2 || Math.abs(pinchScale - 1) > 0.01;

    const draft = normalizeCropOverride({
      ...gesture.start,
      shiftX: (gesture.start.shiftX ?? 0) - (dxPx / gesture.width) * 8,
      shiftY: (gesture.start.shiftY ?? 0) - (dyPx / gesture.height) * 8,
      zoom: (gesture.start.zoom ?? 0) + (pinchScale - 1) * 8,
    });
    gesture.draft = draft ?? emptyCropOverride();
    gesture.changed = changed;
    setGesturePreviewTransform(
      `translate(${dxPx.toFixed(1)}px, ${dyPx.toFixed(1)}px) scale(${pinchScale.toFixed(3)})`,
    );
  }

  function startCropGesture(event: ReactPointerEvent<HTMLDivElement>) {
    if (eraserEnabled || !selectedCell || processingSplit) return;
    event.preventDefault();
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    cropPointersRef.current.set(event.pointerId, {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    });
    const points = Array.from(cropPointersRef.current.values());
    const rect = event.currentTarget.getBoundingClientRect();
    const start = cropGestureRef.current?.draft ?? cropOverrideFor(selectedIndex);
    cropGestureRef.current = makeCropGestureStart(rect, points, start);
    setCropGesturing(true);
  }

  function moveCropGesture(event: ReactPointerEvent<HTMLDivElement>) {
    if (eraserEnabled || !cropGestureRef.current || !cropPointersRef.current.has(event.pointerId)) return;
    event.preventDefault();
    cropPointersRef.current.set(event.pointerId, {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    });
    // 毎イベントでsetStateせず、次フレームで最新値を1回だけ反映（なめらか化）
    cropLatestPointsRef.current = Array.from(cropPointersRef.current.values());
    if (cropRafRef.current == null) {
      cropRafRef.current = requestAnimationFrame(() => {
        cropRafRef.current = null;
        if (cropGestureRef.current) updateCropGesturePreview(cropLatestPointsRef.current);
      });
    }
  }

  function finishCropGesture(event: ReactPointerEvent<HTMLDivElement>) {
    if (!cropGestureRef.current || !cropPointersRef.current.has(event.pointerId)) return;
    event.preventDefault();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (cropRafRef.current != null) {
      cancelAnimationFrame(cropRafRef.current);
      cropRafRef.current = null;
    }
    const latestPoints = Array.from(cropPointersRef.current.values());
    if (latestPoints.length > 0) updateCropGesturePreview(latestPoints);
    const gesture = cropGestureRef.current;
    cropPointersRef.current.delete(event.pointerId);
    clearCropGesture();
    if (gesture.changed && gesture.selectedIndex === selectedIndex) {
      applyCropOverride(gesture.selectedIndex, gesture.draft);
    }
  }

  function handleEditPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (eraserEnabled) startErase(event);
    else startCropGesture(event);
  }

  function handleEditPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (eraserEnabled) moveErase(event);
    else moveCropGesture(event);
  }

  function handleEditPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (eraserEnabled) stopErase(event);
    else finishCropGesture(event);
  }

  function toggleEraser() {
    clearCropGesture();
    setEraserEnabled((v) => !v);
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

    eraseBusyRef.current = true;
    setEraseBusy(true);
    setSplitMsg("");
    try {
      while (eraseQueueRef.current.length) {
        const source = eraseSourceRef.current;
        const strokes = eraseQueueRef.current.splice(0);
        const targetIndex = eraseTargetIndexRef.current;
        if (!source || !strokes.length || targetIndex === null) break;

        const nextSrc = await eraseImageAtPoints(source, strokes);
        eraseSourceRef.current = nextSrc;
        appendEraseStrokeOverride(targetIndex, strokes);
        setManualCellSrcOverride(targetIndex, nextSrc);
        setSplitCells((cells) =>
          cells.map((cell, index) => (index === targetIndex ? { ...cell, src: nextSrc } : cell)),
        );
      }
    } catch (err) {
      console.error(err);
      eraseQueueRef.current = [];
      setSplitMsg("消しゴム処理に失敗しました。");
    } finally {
      eraseBusyRef.current = false;
      if (eraseQueueRef.current.length) {
        void flushEraseQueue();
      } else {
        setEraseBusy(false);
      }
    }
  }

  function startErase(event: ReactPointerEvent<HTMLDivElement>) {
    if (!eraserEnabled || !selectedCell) return;
    event.preventDefault();
    cancelPendingSplitWork();
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

  function preventPreviewTouch(event: ReactTouchEvent<HTMLDivElement>) {
    event.preventDefault();
  }

  async function changeGridSize(size: GridSize) {
    setSelectedIndex(0);
    setCropOverrideState({});
    clearManualCellSrcOverrides();
    clearEraseStrokeOverrides();
    setCellOffsets({});
    const source = rawSheetSrc ?? sheetSrc;
    if (source) await applyEstimatedCutLines(source, size);
    else resetCutLines(size);
    setGridSize(size);
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

  return (
    <div className="vm-shell">
      <header className="vm-topbar">
        <div className="vm-topbar-row">
          <div className="vm-topbar-title">
            <span className="vm-topbar-kicker">UCHINOKO STAMP MOBILE</span>
            <span className="vm-topbar-name">うちのこスタンプ工房</span>
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

          {splitMsg.includes("失敗") && <p className="vm-inline-msg is-error">{splitMsg}</p>}
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
                </div>
                <div className="vm-split-tools">
                  <div className="vm-bg-picker" role="group" aria-label="背景色プレビュー">
                    {BG_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        className={`vm-bg-swatch ${opt.cls}${splitBgPreview === opt.value ? " is-active" : ""}`}
                        onClick={() => setSplitBgPreview(opt.value)}
                        aria-label={opt.label}
                        title={opt.label}
                      />
                    ))}
                  </div>
                  <span className="vm-split-count">{splitCells.length}個</span>
                </div>
              </div>

              {sheetSrc && (
                <div
                  ref={splitCutPreviewRef}
                  className={`vm-cut-preview${cutDrag ? " is-dragging" : ""}`}
                  onPointerMove={moveCutLineDrag}
                  onPointerUp={finishCutLineDrag}
                  onPointerCancel={finishCutLineDrag}
                >
                  <div className="vm-cut-grid" style={cutGridStyle}>
                    {splitCells.map((cell, index) => (
                      <span key={`cut-cell-${cell.id}`} className="vm-cut-cell">
                        <span>{index + 1}</span>
                        <img src={cell.src} alt="" draggable={false} />
                      </span>
                    ))}
                  </div>
                  {verticalLinePositions.map((pct, index) => (
                    <button
                      key={`cut-v-${index}`}
                      type="button"
                      className="vm-cut-line vertical"
                      style={{ left: `${pct}%` }}
                      aria-label={`縦のカット線${index + 1}`}
                      onPointerDown={(event) => startCutLineDrag(event, "vertical", index)}
                    />
                  ))}
                  {horizontalLinePositions.map((pct, index) => (
                    <button
                      key={`cut-h-${index}`}
                      type="button"
                      className="vm-cut-line horizontal"
                      style={{ top: `${pct}%` }}
                      aria-label={`横のカット線${index + 1}`}
                      onPointerDown={(event) => startCutLineDrag(event, "horizontal", index)}
                    />
                  ))}
                </div>
              )}

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
                      className={`vm-reorder-cell${bgClass(splitBgPreview)}${isSelected ? " is-selected" : ""}${hasCropOverride(index) ? " is-crop-adjusted" : ""}`}
                      onClick={() => {
                        clearCropGesture();
                        setSelectedIndex(index);
                      }}
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
                </div>
                <div className="vm-edit-body">
                  <div
                    ref={editPreviewRef}
                    className={`vm-edit-preview${bgClass(splitBgPreview)}${eraserEnabled ? " is-eraser" : " is-crop-touch"}${erasing ? " is-drawing" : ""}${cropGesturing ? " is-crop-gesture" : ""}`}
                    onPointerDown={handleEditPointerDown}
                    onPointerMove={handleEditPointerMove}
                    onPointerUp={handleEditPointerUp}
                    onPointerCancel={handleEditPointerUp}
                    onTouchStart={preventPreviewTouch}
                    onTouchMove={preventPreviewTouch}
                  >
                    <img
                      src={selectedCell.src}
                      alt={selectedCell.name}
                      style={{ transform: previewTransformFor(selectedCell.id) }}
                      draggable={false}
                    />
                    {eraserEnabled && <span className="vm-eraser-hint">なぞって消す</span>}
                  </div>
                  <div className="vm-edit-actions">
                    <div className="vm-tool-section">
                      <div className="vm-tool-title">
                        <span>消す</span>
                      </div>
                      <div className="vm-eraser-row">
                        <button
                          type="button"
                          className={eraserEnabled ? "is-on" : ""}
                          onClick={toggleEraser}
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
                      {eraserEnabled && (
                        <p className={`vm-eraser-status${eraseBusy ? " is-visible" : ""}`}>
                          {eraseBusy ? "消しています..." : "\u00a0"}
                        </p>
                      )}
                    </div>

                    <div className="vm-tool-section">
                      <div className="vm-tool-title">
                        <span>整える</span>
                      </div>
                      <div className="vm-center-row">
                        <button
                          type="button"
                          onClick={centerSelectedContent}
                          disabled={centerBusy || eraseBusy || processingSplit}
                        >
                          {centerBusy ? "整え中..." : "中央にそろえる"}
                        </button>
                        <button type="button" className="vm-reset-button" onClick={resetOffset}>
                          リセット
                        </button>
                      </div>
                    </div>

                    <div className="vm-tool-section">
                      <div className="vm-tool-title">
                        <span>移動</span>
                      </div>
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
                    </div>

                    <div className="vm-tool-section">
                      <div className="vm-tool-title">
                        <span>大きさ</span>
                      </div>
                      <div className="vm-zoom-row">
                        <button type="button" onClick={() => expandCrop(0.5)}>小さく</button>
                        <span>{Math.max(cropOverrideFor(selectedIndex).padX ?? 0, cropOverrideFor(selectedIndex).padY ?? 0).toFixed(1)}%</span>
                        <button type="button" onClick={() => expandCrop(-0.5)}>大きく</button>
                      </div>
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
