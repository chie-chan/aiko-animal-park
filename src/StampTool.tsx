import JSZip from "jszip";
import React, { useEffect, useMemo, useRef, useState } from "react";
import "./stamp-tool.css";

interface Props {
  isMobile: boolean;
}

type Step = 1 | 2 | 3 | 4 | 5;
type ImportMode = "sheet" | "individual";
type Axis = "vertical" | "horizontal";
type TextLayout = "straight" | "arc";
type CropShape = "none" | "circle" | "square" | "rounded";

interface SourceImage {
  id: string;
  name: string;
  src: string;
  originalSrc?: string;
}

interface StickerRenderOptions {
  label: string;
  color: string;
  fontSize: number;
  textLayout: TextLayout;
  arcStrength: number;
  textOffsetX: number;
  textOffsetY: number;
  textScale: number;
  imageAdjustment?: ImageAdjustment;
  cropShape: CropShape;
}

interface ImageAdjustment {
  offsetX: number;
  offsetY: number;
  scale: number;
}

interface DragState {
  type: "text" | "image" | "reorder" | "sheet-cut";
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  scaleX: number;
  scaleY: number;
  imageId?: string;
  index?: number;
  axis?: Axis;
  moved?: boolean;
}

const COUNTS = [8, 16, 24, 32, 40];
const STAMP_WIDTH = 370;
const STAMP_HEIGHT = 320;
const MAIN_SIZE = 240;
const TAB_WIDTH = 96;
const TAB_HEIGHT = 74;
const STAMP_SAFE_MARGIN = 10;
const STAMP_ASPECT = STAMP_WIDTH / STAMP_HEIGHT;
const TUTORIAL_STORAGE_KEY = "uchinokoStampTutorialSeen";
const DEFAULT_IMAGE_ADJUSTMENT: ImageAdjustment = { offsetX: 0, offsetY: 0, scale: 1 };
const CROP_SHAPE_LABELS: Record<CropShape, string> = {
  none: "なし",
  circle: "丸",
  square: "四角",
  rounded: "角丸",
};

function resolveStampCountForImageTotal(total: number) {
  if (total <= 0) return 8;
  return COUNTS.find((item) => total <= item) || COUNTS[COUNTS.length - 1];
}

const CHECKLIST = [
  { id: "count", label: "枚数は8/16/24/32/40枚のいずれか" },
  { id: "main", label: "メイン画像240×240pxとタブ画像96×74pxも用意する" },
  { id: "rights", label: "著作権・肖像権を侵害していない" },
  { id: "readable", label: "文字が小さすぎず、スマホ上で読める" },
];

// ── Pictogram icon components ──────────────────────────────────────────────
function Ico({ children, size = 16 }: { children: React.ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
      {children}
    </svg>
  );
}
const IcoUpload   = ({ size = 16 }: { size?: number }) => <Ico size={size}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></Ico>;
const IcoUndo     = ({ size = 16 }: { size?: number }) => <Ico size={size}><path d="M3 7v6h6"/><path d="M21 17a9 9 0 00-9-9 9 9 0 00-6 2.3L3 13"/></Ico>;
const IcoSwap     = ({ size = 16 }: { size?: number }) => <Ico size={size}><path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/></Ico>;
const IcoText     = ({ size = 16 }: { size?: number }) => <Ico size={size}><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></Ico>;
const IcoDownload = ({ size = 16 }: { size?: number }) => <Ico size={size}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></Ico>;
const IcoReorder  = ({ size = 16 }: { size?: number }) => <Ico size={size}><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><path d="m9 3-6 6 6 6"/><path d="m15 21 6-6-6-6"/></Ico>;
const IcoCheck    = ({ size = 16 }: { size?: number }) => <Ico size={size}><polyline points="20 6 9 17 4 12"/></Ico>;
const IcoX        = ({ size = 16 }: { size?: number }) => <Ico size={size}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></Ico>;
const IcoLeft     = ({ size = 16 }: { size?: number }) => <Ico size={size}><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></Ico>;
const IcoRight    = ({ size = 16 }: { size?: number }) => <Ico size={size}><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></Ico>;
const IcoImage    = ({ size = 16 }: { size?: number }) => <Ico size={size}><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><polyline points="21 15 16 10 5 21"/></Ico>;
const IcoHelp     = ({ size = 16 }: { size?: number }) => <Ico size={size}><circle cx="12" cy="12" r="10"/><path d="M9.5 9a2.7 2.7 0 0 1 5.2.9c0 1.8-2.2 2.2-2.7 3.5"/><line x1="12" y1="17" x2="12.01" y2="17"/></Ico>;

const TUTORIAL_STEPS = [
  {
    title: "画像を入れるだけでOK",
    body: "4×4シートも、1枚ずつの画像も使えます。まずは画像を入れると、スタンプ用の一覧ができます。",
    icon: <IcoUpload size={24} />,
  },
  {
    title: "必要なところだけ調整",
    body: "文字入れ、位置調整、順番入れ替えは後から直せます。迷ったらそのまま次へ進んで大丈夫です。",
    icon: <IcoText size={24} />,
  },
  {
    title: "まとめてZIPで保存",
    body: "最後にLINEスタンプ用のPNG画像、メイン画像、タブ画像をまとめて保存できます。",
    icon: <IcoDownload size={24} />,
  },
];

const SIMPLE_FLOW_STAGES: Array<{ label: string; detail: string; steps: Step[]; target: Step }> = [
  { label: "画像を入れる", detail: "4x4シート・画像追加", steps: [1, 2], target: 1 },
  { label: "必要なら整える", detail: "切り抜き・文字", steps: [3, 4], target: 3 },
  { label: "保存する", detail: "順番確認・ZIP", steps: [5], target: 5 },
];

const CROP_ICONS: Record<CropShape, React.ReactNode> = {
  none:    <Ico size={12}><rect x="3" y="3" width="18" height="18" rx="2"/><polyline points="21 15 16 10 5 21"/><circle cx="9" cy="9" r="2"/></Ico>,
  circle:  <Ico size={12}><circle cx="12" cy="12" r="9"/></Ico>,
  square:  <Ico size={12}><rect x="3" y="3" width="18" height="18" rx="0"/></Ico>,
  rounded: <Ico size={12}><rect x="3" y="3" width="18" height="18" rx="5"/></Ico>,
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (event) => resolve(String(event.target?.result || ""));
    reader.readAsDataURL(file);
  });
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("PNG export failed."));
    }, "image/png");
  });
}

function canvasToDataUrl(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL("image/png");
}

async function dataUrlToBlob(src: string): Promise<Blob> {
  const response = await fetch(src);
  return response.blob();
}

function linePosition(cut: number, outerPadding: number) {
  const start = outerPadding;
  const range = 100 - outerPadding * 2;
  return start + (range * cut) / 100;
}

function safeCuts(cuts: number[]) {
  const next = [...cuts].sort((a, b) => a - b);
  next[0] = clamp(next[0], 4, 88);
  next[1] = clamp(next[1], next[0] + 4, 92);
  next[2] = clamp(next[2], next[1] + 4, 96);
  return next;
}

async function splitSheetImage(
  src: string,
  outerPadding: number,
  trimGutter: number,
  verticalCuts: number[],
  horizontalCuts: number[],
): Promise<SourceImage[]> {
  const image = await loadImage(src);
  const left = outerPadding;
  const right = 100 - outerPadding;
  const top = outerPadding;
  const bottom = 100 - outerPadding;
  const xBoundaries = [left, ...safeCuts(verticalCuts).map((cut) => linePosition(cut, outerPadding)), right];
  const yBoundaries = [top, ...safeCuts(horizontalCuts).map((cut) => linePosition(cut, outerPadding)), bottom];
  const trimX = image.width * (trimGutter / 100) * 0.5;
  const trimY = image.height * (trimGutter / 100) * 0.5;

  const cells: SourceImage[] = [];
  for (let row = 0; row < 4; row += 1) {
    for (let col = 0; col < 4; col += 1) {
      const rawX = (image.width * xBoundaries[col]) / 100;
      const rawY = (image.height * yBoundaries[row]) / 100;
      const rawW = (image.width * (xBoundaries[col + 1] - xBoundaries[col])) / 100;
      const rawH = (image.height * (yBoundaries[row + 1] - yBoundaries[row])) / 100;
      const sx = rawX + (col === 0 ? 0 : trimX);
      const sy = rawY + (row === 0 ? 0 : trimY);
      const sw = rawW - (col === 0 ? trimX : trimX * 2) + (col === 3 ? trimX : 0);
      const sh = rawH - (row === 0 ? trimY : trimY * 2) + (row === 3 ? trimY : 0);

      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(sw));
      canvas.height = Math.max(1, Math.round(sh));
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;
      ctx.drawImage(image, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      cells.push({
        id: `sheet-${row}-${col}-${Date.now()}`,
        name: `sheet_${String(cells.length + 1).padStart(2, "0")}.png`,
        src: canvasToDataUrl(canvas),
      });
    }
  }
  return cells;
}

function drawRoundedText(ctx: CanvasRenderingContext2D, label: string, x: number, y: number, size: number, color: string) {
  if (!label.trim()) return;
  ctx.save();
  ctx.font = `900 ${size}px "Zen Maru Gothic", "Noto Sans JP", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "rgba(40,25,30,0.72)";
  ctx.lineWidth = Math.max(5, size * 0.18);
  ctx.strokeText(label, x, y);
  ctx.fillStyle = color;
  ctx.fillText(label, x, y);
  ctx.restore();
}

function drawArchedText(ctx: CanvasRenderingContext2D, label: string, x: number, y: number, size: number, color: string, arcStrength: number) {
  const chars = Array.from(label.trim());
  if (!chars.length) return;

  ctx.save();
  ctx.font = `900 ${size}px "Zen Maru Gothic", "Noto Sans JP", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "rgba(40,25,30,0.72)";
  ctx.lineWidth = Math.max(5, size * 0.18);
  ctx.fillStyle = color;

  const widths = chars.map((char) => Math.max(6, ctx.measureText(char).width));
  const totalWidth = widths.reduce((sum, width) => sum + width, 0);
  const radius = clamp(270 - arcStrength * 1.75, 118, 270);
  const totalAngle = clamp(totalWidth / radius, 0.2, Math.PI * 0.92);
  const centerY = y + radius - arcStrength * 0.32;
  let angle = -totalAngle / 2;

  chars.forEach((char, index) => {
    const charAngle = (widths[index] / totalWidth) * totalAngle;
    const theta = angle + charAngle / 2;
    const px = x + Math.sin(theta) * radius;
    const py = centerY - Math.cos(theta) * radius;

    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(theta);
    ctx.strokeText(char, 0, 0);
    ctx.fillText(char, 0, 0);
    ctx.restore();
    angle += charAngle;
  });

  ctx.restore();
}

function drawStickerText(ctx: CanvasRenderingContext2D, options: StickerRenderOptions) {
  const size = options.fontSize * options.textScale;
  const x = STAMP_WIDTH / 2 + options.textOffsetX;
  const y = options.textLayout === "arc" ? STAMP_HEIGHT - 34 + options.textOffsetY : STAMP_HEIGHT - 14 + options.textOffsetY;

  if (options.textLayout === "arc") {
    drawArchedText(ctx, options.label, x, y, size, options.color, options.arcStrength);
    return;
  }

  drawRoundedText(ctx, options.label, x, y, size, options.color);
}

function makeRoundedRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawCroppedImage(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  cropShape: CropShape,
  fitWidth: number,
  fitHeight: number,
  reservedTextHeight: number,
  adjustment: ImageAdjustment,
) {
  if (cropShape === "none") {
    const scale = Math.min(fitWidth / image.width, fitHeight / image.height) * adjustment.scale;
    const drawWidth = image.width * scale;
    const drawHeight = image.height * scale;
    const dx = (STAMP_WIDTH - drawWidth) / 2 + adjustment.offsetX;
    const dy = Math.max(8, (STAMP_HEIGHT - reservedTextHeight - drawHeight) / 2) + adjustment.offsetY;
    ctx.drawImage(image, dx, dy, drawWidth, drawHeight);
    return;
  }

  const frameWidth = Math.min(fitWidth, fitHeight * STAMP_ASPECT);
  const frameHeight = Math.min(fitHeight, frameWidth / STAMP_ASPECT);
  const frameX = (STAMP_WIDTH - frameWidth) / 2;
  const frameY = STAMP_SAFE_MARGIN + (fitHeight - frameHeight) / 2;
  const scale = Math.max(frameWidth / image.width, frameHeight / image.height) * adjustment.scale;
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  const dx = frameX + (frameWidth - drawWidth) / 2 + adjustment.offsetX;
  const dy = frameY + (frameHeight - drawHeight) / 2 + adjustment.offsetY;

  ctx.save();
  if (cropShape === "circle") {
    ctx.beginPath();
    ctx.ellipse(frameX + frameWidth / 2, frameY + frameHeight / 2, frameWidth / 2, frameHeight / 2, 0, 0, Math.PI * 2);
    ctx.clip();
  } else if (cropShape === "rounded") {
    makeRoundedRectPath(ctx, frameX, frameY, frameWidth, frameHeight, Math.max(18, Math.min(frameWidth, frameHeight) * 0.18));
    ctx.clip();
  } else {
    ctx.beginPath();
    ctx.rect(frameX, frameY, frameWidth, frameHeight);
    ctx.clip();
  }
  ctx.drawImage(image, dx, dy, drawWidth, drawHeight);
  ctx.restore();
}

async function renderStickerPng(source: SourceImage, options: StickerRenderOptions): Promise<Blob> {
  const image = await loadImage(source.src);
  const canvas = document.createElement("canvas");
  canvas.width = STAMP_WIDTH;
  canvas.height = STAMP_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available.");

  ctx.clearRect(0, 0, STAMP_WIDTH, STAMP_HEIGHT);
  const reservedTextHeight = 0;
  const fitWidth = STAMP_WIDTH - STAMP_SAFE_MARGIN * 2;
  const fitHeight = STAMP_HEIGHT - STAMP_SAFE_MARGIN * 2 - reservedTextHeight;
  const imageAdjustment = options.imageAdjustment || DEFAULT_IMAGE_ADJUSTMENT;

  drawCroppedImage(ctx, image, options.cropShape, fitWidth, fitHeight, reservedTextHeight, imageAdjustment);
  drawStickerText(ctx, options);
  return canvasToBlob(canvas);
}

async function renderStickerImagePng(source: SourceImage, cropShape: CropShape, adjustment: ImageAdjustment): Promise<Blob> {
  const image = await loadImage(source.src);
  const canvas = document.createElement("canvas");
  canvas.width = STAMP_WIDTH;
  canvas.height = STAMP_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available.");

  ctx.clearRect(0, 0, STAMP_WIDTH, STAMP_HEIGHT);
  const reservedTextHeight = 0;
  const fitWidth = STAMP_WIDTH - STAMP_SAFE_MARGIN * 2;
  const fitHeight = STAMP_HEIGHT - STAMP_SAFE_MARGIN * 2 - reservedTextHeight;
  drawCroppedImage(ctx, image, cropShape, fitWidth, fitHeight, reservedTextHeight, adjustment);
  return canvasToBlob(canvas);
}

async function renderFitPng(source: SourceImage, width: number, height: number): Promise<Blob> {
  const image = await loadImage(source.src);
  return renderImageFitPng(image, width, height);
}

async function renderBlobFitPng(blob: Blob, width: number, height: number): Promise<Blob> {
  const url = URL.createObjectURL(blob);
  try {
    const image = await loadImage(url);
    return renderImageFitPng(image, width, height);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function renderImageFitPng(image: HTMLImageElement, width: number, height: number): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available.");

  ctx.clearRect(0, 0, width, height);
  const scale = Math.min((width - 6) / image.width, (height - 6) / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  ctx.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
  return canvasToBlob(canvas);
}

function colorDistance(a: [number, number, number], r: number, g: number, b: number) {
  const dr = a[0] - r;
  const dg = a[1] - g;
  const db = a[2] - b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function averageBorderColor(data: Uint8ClampedArray, width: number, height: number): [number, number, number] {
  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;
  const step = Math.max(1, Math.floor(Math.min(width, height) / 80));

  const add = (x: number, y: number) => {
    const index = (y * width + x) * 4;
    if (data[index + 3] < 12) return;
    r += data[index];
    g += data[index + 1];
    b += data[index + 2];
    count += 1;
  };

  for (let x = 0; x < width; x += step) {
    add(x, 0);
    add(x, height - 1);
  }
  for (let y = 0; y < height; y += step) {
    add(0, y);
    add(width - 1, y);
  }

  if (!count) return [255, 255, 255];
  return [Math.round(r / count), Math.round(g / count), Math.round(b / count)];
}

async function makeSimpleTransparentPng(src: string): Promise<string> {
  const image = await loadImage(src);
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas is not available.");

  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { data, width, height } = imageData;
  const bg = averageBorderColor(data, width, height);
  const tolerance = 54;
  const softTolerance = 76;
  const visited = new Uint8Array(width * height);
  const queue: number[] = [];

  const enqueue = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const point = y * width + x;
    if (visited[point]) return;
    const index = point * 4;
    if (data[index + 3] < 12 || colorDistance(bg, data[index], data[index + 1], data[index + 2]) <= tolerance) {
      visited[point] = 1;
      queue.push(point);
    }
  };

  for (let x = 0; x < width; x += 1) {
    enqueue(x, 0);
    enqueue(x, height - 1);
  }
  for (let y = 0; y < height; y += 1) {
    enqueue(0, y);
    enqueue(width - 1, y);
  }

  while (queue.length) {
    const point = queue.pop() as number;
    const x = point % width;
    const y = Math.floor(point / width);
    enqueue(x + 1, y);
    enqueue(x - 1, y);
    enqueue(x, y + 1);
    enqueue(x, y - 1);
  }

  for (let point = 0; point < visited.length; point += 1) {
    if (!visited[point]) continue;
    const index = point * 4;
    const distance = colorDistance(bg, data[index], data[index + 1], data[index + 2]);
    if (distance <= tolerance) {
      data[index + 3] = 0;
    } else if (distance <= softTolerance) {
      const keep = clamp((distance - tolerance) / (softTolerance - tolerance), 0, 1);
      data[index + 3] = Math.round(data[index + 3] * keep);
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvasToDataUrl(canvas);
}

function RenderedStickerImageLayer({ source, cropShape, adjustment }: { source: SourceImage; cropShape: CropShape; adjustment: ImageAdjustment }) {
  const [previewSrc, setPreviewSrc] = useState(source.src);

  useEffect(() => {
    let cancelled = false;
    let objectUrl = "";

    setPreviewSrc(source.src);
    renderStickerImagePng(source, cropShape, adjustment)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setPreviewSrc(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setPreviewSrc(source.src);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [source, cropShape, adjustment.offsetX, adjustment.offsetY, adjustment.scale]);

  return <img className="rendered-sticker-image" src={previewSrc} alt="" aria-hidden="true" />;
}

export default function StampTool({ isMobile }: Props) {
  const [step, setStep] = useState<Step>(1);
  const [importMode, setImportMode] = useState<ImportMode>("sheet");
  const [images, setImages] = useState<SourceImage[]>([]);
  const [sheetSrc, setSheetSrc] = useState("");
  const [sheetOuterPadding, setSheetOuterPadding] = useState(0);
  const [sheetTrimGutter, setSheetTrimGutter] = useState(0);
  const [verticalCuts, setVerticalCuts] = useState([25, 50, 75]);
  const [horizontalCuts, setHorizontalCuts] = useState([25, 50, 75]);
  const [count, setCount] = useState(16);
  const [stampTexts, setStampTexts] = useState<Record<string, string>>({});
  const [textColor, setTextColor] = useState("#ffffff");
  const [fontSize, setFontSize] = useState(30);
  const [textLayout, setTextLayout] = useState<TextLayout>("straight");
  const [arcStrength, setArcStrength] = useState(52);
  const [textOffset, setTextOffset] = useState({ x: 0, y: 0 });
  const [textScale, setTextScale] = useState(1);
  const [imageAdjustments, setImageAdjustments] = useState<Record<string, ImageAdjustment>>({});
  const [cropShapes, setCropShapes] = useState<Record<string, CropShape>>({});
  const [selectedEditIndex, setSelectedEditIndex] = useState(0);
  const [draftOrderIds, setDraftOrderIds] = useState<string[] | null>(null);
  const [pendingReorderIndex, setPendingReorderIndex] = useState<number | null>(null);
  const [draggingOrderIndex, setDraggingOrderIndex] = useState<number | null>(null);
  const [previewBgColor, setPreviewBgColor] = useState("#7dd3fc");
  const [finalPreviewSrcs, setFinalPreviewSrcs] = useState<Record<string, string>>({});
  const [mainImageId, setMainImageId] = useState("");
  const [tabImageId, setTabImageId] = useState("");
  const [exportSelectMode, setExportSelectMode] = useState<"main" | "tab">("main");
  const [showMetaPicker, setShowMetaPicker] = useState(false);
  const [bulkEditIds, setBulkEditIds] = useState<string[]>([]);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [showTutorial, setShowTutorial] = useState(false);
  const [tutorialIndex, setTutorialIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const sheetInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<DragState | null>(null);

  const selectedImages = useMemo(() => images.slice(0, count), [images, count]);
  const orderedSelectedImages = useMemo(() => {
    if (!draftOrderIds) return selectedImages;
    const byId = new Map(selectedImages.map((image) => [image.id, image]));
    const ordered = draftOrderIds.map((id) => byId.get(id)).filter(Boolean) as SourceImage[];
    const missing = selectedImages.filter((image) => !draftOrderIds.includes(image.id));
    return [...ordered, ...missing];
  }, [draftOrderIds, selectedImages]);
  const allChecked = CHECKLIST.every((item) => checked[item.id]);
  const visibleVerticalLines = verticalCuts.map((cut) => linePosition(cut, sheetOuterPadding));
  const visibleHorizontalLines = horizontalCuts.map((cut) => linePosition(cut, sheetOuterPadding));
  const isReordering = Boolean(draftOrderIds);
  const textEditIndex = selectedImages.length ? clamp(selectedEditIndex, 0, selectedImages.length - 1) : 0;
  const textEditingImage = selectedImages[textEditIndex];
  const finishEditIndex = orderedSelectedImages.length ? clamp(selectedEditIndex, 0, orderedSelectedImages.length - 1) : 0;
  const finishEditingImage = orderedSelectedImages[finishEditIndex];
  const editIndex = step === 5 ? finishEditIndex : textEditIndex;
  const editingImage = step === 5 ? finishEditingImage : textEditingImage;
  const mainImage = selectedImages.find((image) => image.id === mainImageId) || selectedImages[0];
  const tabImage = selectedImages.find((image) => image.id === tabImageId) || selectedImages[0];
  const editingAdjustment = editingImage ? imageAdjustments[editingImage.id] || DEFAULT_IMAGE_ADJUSTMENT : DEFAULT_IMAGE_ADJUSTMENT;
  const editingCropShape = editingImage ? cropShapes[editingImage.id] || "none" : "none";
  const editingText = editingImage ? stampTexts[editingImage.id] || "" : "";
  const bulkSelectedImages = selectedImages.filter((image) => bulkEditIds.includes(image.id));
  const editingReservedTextHeight = 0;
  const editingFitWidth = STAMP_WIDTH - STAMP_SAFE_MARGIN * 2;
  const editingFitHeight = STAMP_HEIGHT - STAMP_SAFE_MARGIN * 2 - editingReservedTextHeight;
  const editingCropFrameWidth = Math.min(editingFitWidth, editingFitHeight * STAMP_ASPECT);
  const editingCropFrameHeight = Math.min(editingFitHeight, editingCropFrameWidth / STAMP_ASPECT);
  const editingCropFrameX = (STAMP_WIDTH - editingCropFrameWidth) / 2;
  const editingCropFrameY = STAMP_SAFE_MARGIN + (editingFitHeight - editingCropFrameHeight) / 2;
  const stickerImageAreaStyle = {
    left: `${(STAMP_SAFE_MARGIN / STAMP_WIDTH) * 100}%`,
    top: `${(STAMP_SAFE_MARGIN / STAMP_HEIGHT) * 100}%`,
    width: `${(editingFitWidth / STAMP_WIDTH) * 100}%`,
    height: `${(editingFitHeight / STAMP_HEIGHT) * 100}%`,
  };
  const stickerCropFrameStyle = {
    left: `${(editingCropFrameX / STAMP_WIDTH) * 100}%`,
    top: `${(editingCropFrameY / STAMP_HEIGHT) * 100}%`,
    width: `${(editingCropFrameWidth / STAMP_WIDTH) * 100}%`,
    height: `${(editingCropFrameHeight / STAMP_HEIGHT) * 100}%`,
  };

  useEffect(() => {
    if (window.localStorage.getItem(TUTORIAL_STORAGE_KEY) !== "true") {
      setShowTutorial(true);
    }
  }, []);

  useEffect(() => {
    const selector = step >= 3 ? ".tool-panel" : ".stamp-page";
    window.requestAnimationFrame(() => {
      const target = document.querySelector<HTMLElement>(selector);
      if (!target) return;
      const y = target.getBoundingClientRect().top + window.scrollY - 84;
      window.scrollTo({ top: Math.max(0, y), behavior: "smooth" });
    });
  }, [step]);

  const openTutorial = () => {
    setTutorialIndex(0);
    setShowTutorial(true);
  };

  const closeTutorial = () => {
    window.localStorage.setItem(TUTORIAL_STORAGE_KEY, "true");
    setShowTutorial(false);
  };

  const currentTutorial = TUTORIAL_STEPS[tutorialIndex];

  useEffect(() => {
    if (!selectedImages.length) {
      setMainImageId("");
      setTabImageId("");
      setBulkEditIds([]);
      return;
    }

    const selectedIds = new Set(selectedImages.map((image) => image.id));
    if (!selectedIds.has(mainImageId)) setMainImageId(selectedImages[0].id);
    if (!selectedIds.has(tabImageId)) setTabImageId(selectedImages[0].id);
    setBulkEditIds((current) => current.filter((id) => selectedIds.has(id)));
  }, [mainImageId, selectedImages, tabImageId]);

  useEffect(() => {
    if (step !== 5 || !orderedSelectedImages.length) {
      setFinalPreviewSrcs({});
      return;
    }

    let cancelled = false;
    const urls: string[] = [];

    const renderFinalPreviews = async () => {
      const entries = await Promise.all(
        orderedSelectedImages.map(async (image) => {
          const blob = await renderStickerPng(image, {
            label: stampTexts[image.id] || "",
            color: textColor,
            fontSize,
            textLayout,
            arcStrength,
            textOffsetX: textOffset.x,
            textOffsetY: textOffset.y,
            textScale,
            imageAdjustment: imageAdjustments[image.id],
            cropShape: cropShapes[image.id] || "none",
          });
          const url = URL.createObjectURL(blob);
          urls.push(url);
          return [image.id, url] as const;
        }),
      );

      if (!cancelled) setFinalPreviewSrcs(Object.fromEntries(entries));
    };

    renderFinalPreviews().catch(() => {
      if (!cancelled) setFinalPreviewSrcs({});
    });

    return () => {
      cancelled = true;
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [arcStrength, cropShapes, fontSize, imageAdjustments, orderedSelectedImages, stampTexts, step, textColor, textLayout, textOffset.x, textOffset.y, textScale]);

  const renderStampPreview = (image: SourceImage, displayIndex: number, showText: boolean, arcId: string) => {
    const adjustment = imageAdjustments[image.id] || DEFAULT_IMAGE_ADJUSTMENT;
    const cropShape = cropShapes[image.id] || "none";
    const label = showText ? stampTexts[image.id] || "" : "";

    return (
      <>
        <RenderedStickerImageLayer source={image} cropShape={cropShape} adjustment={adjustment} />
        <span>{displayIndex}</span>
        {label &&
          (textLayout === "arc" ? (
            <svg
              className="arc-text-preview draggable-text-layer"
              viewBox="0 0 370 132"
              aria-hidden="true"
              style={{ transform: `translate(${textOffset.x}px, ${textOffset.y}px) scale(${textScale})` }}
              onPointerDown={startTextDrag}
              onPointerMove={handleDragMove}
              onPointerUp={stopDrag}
              onPointerCancel={stopDrag}
            >
              <path id={arcId} d={`M 34 104 Q 185 ${88 - arcStrength * 0.56} 336 104`} fill="none" />
              <text style={{ fill: textColor, fontSize }}>
                <textPath href={`#${arcId}`} startOffset="50%" textAnchor="middle">
                  {label}
                </textPath>
              </text>
            </svg>
          ) : (
            <strong
              className="draggable-text-layer"
              style={{ color: textColor, fontSize, transform: `translate(${textOffset.x}px, ${textOffset.y}px) scale(${textScale})` }}
              onPointerDown={startTextDrag}
              onPointerMove={handleDragMove}
              onPointerUp={stopDrag}
              onPointerCancel={stopDrag}
            >
              {label}
            </strong>
          ))}
      </>
    );
  };

  const buildStickerOptions = (image: SourceImage): StickerRenderOptions => ({
    label: stampTexts[image.id] || "",
    color: textColor,
    fontSize,
    textLayout,
    arcStrength,
    textOffsetX: textOffset.x,
    textOffsetY: textOffset.y,
    textScale,
    imageAdjustment: imageAdjustments[image.id],
    cropShape: cropShapes[image.id] || "none",
  });

  const renderSelectedAssetPng = async (image: SourceImage, width: number, height: number): Promise<Blob> => {
    const stickerBlob = await renderStickerPng(image, buildStickerOptions(image));
    return renderBlobFitPng(stickerBlob, width, height);
  };

  const updateCut = (axis: Axis, index: number, value: number) => {
    const setter = axis === "vertical" ? setVerticalCuts : setHorizontalCuts;
    setter((current) => {
      const next = [...current];
      const min = index === 0 ? 4 : next[index - 1] + 4;
      const max = index === 2 ? 96 : next[index + 1] - 4;
      next[index] = clamp(value, min, max);
      return next;
    });
  };

  const resetCuts = () => {
    setSheetOuterPadding(0);
    setSheetTrimGutter(0);
    setVerticalCuts([25, 50, 75]);
    setHorizontalCuts([25, 50, 75]);
  };

  const updateImageAdjustment = (imageId: string, patch: Partial<ImageAdjustment>) => {
    setImageAdjustments((current) => {
      const base = current[imageId] || DEFAULT_IMAGE_ADJUSTMENT;
      const scale = clamp(patch.scale ?? base.scale, 0.55, 2.2);
      const maxOffsetX = clamp(58 + (scale - 0.55) * 82, 58, 190);
      const maxOffsetY = clamp(48 + (scale - 0.55) * 68, 48, 160);
      const next = {
        offsetX: clamp(patch.offsetX ?? base.offsetX, -maxOffsetX, maxOffsetX),
        offsetY: clamp(patch.offsetY ?? base.offsetY, -maxOffsetY, maxOffsetY),
        scale,
      };

      return {
        ...current,
        [imageId]: next,
      };
    });
  };

  const updateStampText = (imageId: string, value: string) => {
    setStampTexts((current) => ({ ...current, [imageId]: value }));
  };

  const applyTextToAll = () => {
    if (!editingText.trim()) return;
    setStampTexts((current) => {
      const next = { ...current };
      selectedImages.forEach((image) => {
        next[image.id] = editingText;
      });
      return next;
    });
    setMessage(`「${editingText}」を選択中の${selectedImages.length}枚に入れました。`);
  };

  const clearAllStampTexts = () => {
    setStampTexts((current) => {
      const next = { ...current };
      selectedImages.forEach((image) => {
        delete next[image.id];
      });
      return next;
    });
    setMessage("選択中の文字をクリアしました。");
  };

  const startTextDrag = (event: React.PointerEvent<HTMLElement>) => {
    event.stopPropagation();
    const rect = event.currentTarget.closest(".stamp-preview")?.getBoundingClientRect() || event.currentTarget.getBoundingClientRect();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      type: "text",
      startX: event.clientX,
      startY: event.clientY,
      originX: textOffset.x,
      originY: textOffset.y,
      scaleX: STAMP_WIDTH / rect.width,
      scaleY: STAMP_HEIGHT / rect.height,
      moved: false,
    };
  };

  const startImageDrag = (event: React.PointerEvent<HTMLElement>, image: SourceImage) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const adjustment = imageAdjustments[image.id] || DEFAULT_IMAGE_ADJUSTMENT;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      type: "image",
      imageId: image.id,
      startX: event.clientX,
      startY: event.clientY,
      originX: adjustment.offsetX,
      originY: adjustment.offsetY,
      scaleX: STAMP_WIDTH / rect.width,
      scaleY: STAMP_HEIGHT / rect.height,
      moved: false,
    };
  };

  const startSheetCutDrag = (event: React.PointerEvent<HTMLElement>, axis: Axis, index: number) => {
    event.preventDefault();
    event.stopPropagation();
    const rect = event.currentTarget.closest(".sheet-preview")?.getBoundingClientRect();
    if (!rect) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      type: "sheet-cut",
      axis,
      index,
      startX: event.clientX,
      startY: event.clientY,
      originX: axis === "vertical" ? verticalCuts[index] : 0,
      originY: axis === "horizontal" ? horizontalCuts[index] : 0,
      scaleX: 100 / rect.width,
      scaleY: 100 / rect.height,
      moved: false,
    };
  };

  const startReorderDrag = (event: React.PointerEvent<HTMLElement>, index: number) => {
    setSelectedEditIndex(index);
    if (!isReordering) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      type: "reorder",
      startX: event.clientX,
      startY: event.clientY,
      originX: 0,
      originY: 0,
      scaleX: 1,
      scaleY: 1,
      index,
      moved: false,
    };
  };

  const moveDraftImageTo = (fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= orderedSelectedImages.length || fromIndex === toIndex) return;
    setDraftOrderIds((current) => {
      const next = current ? [...current] : selectedImages.map((image) => image.id);
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
    setSelectedEditIndex(toIndex);
    setPendingReorderIndex(toIndex);
  };

  const handleReorderThumbClick = (index: number) => {
    if (!isReordering) {
      setSelectedEditIndex(index);
      return;
    }

    if (pendingReorderIndex === null || pendingReorderIndex === index) {
      setPendingReorderIndex(index);
      setSelectedEditIndex(index);
      setMessage(`${index + 1}番を選択しました。移動先の番号をタップしてください。`);
      return;
    }

    moveDraftImageTo(pendingReorderIndex, index);
    setMessage(`${pendingReorderIndex + 1}番を${index + 1}番の位置へ移動しました。最後に順番を確定してください。`);
  };

  const handleDesktopReorderStart = (event: React.DragEvent<HTMLElement>, index: number) => {
    if (!isReordering) {
      event.preventDefault();
      return;
    }

    setDraggingOrderIndex(index);
    setPendingReorderIndex(index);
    setSelectedEditIndex(index);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(index));
  };

  const handleDesktopReorderOver = (event: React.DragEvent<HTMLElement>, index: number) => {
    if (!isReordering) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    if (pendingReorderIndex !== index) setPendingReorderIndex(index);
  };

  const handleDesktopReorderDrop = (event: React.DragEvent<HTMLElement>, targetIndex: number) => {
    if (!isReordering) return;
    event.preventDefault();
    const fromIndex = draggingOrderIndex ?? Number(event.dataTransfer.getData("text/plain"));
    if (Number.isFinite(fromIndex)) {
      moveDraftImageTo(fromIndex, targetIndex);
      setMessage(`${fromIndex + 1}番を${targetIndex + 1}番の位置へ移動しました。最後に順番を確定してください。`);
    }
    setDraggingOrderIndex(null);
  };

  const handleDragMove = (event: React.PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    event.preventDefault();
    const moveDistance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
    if (!drag.moved && moveDistance < 6) return;
    drag.moved = true;

    if (drag.type === "reorder") {
      const targets = Array.from(document.querySelectorAll<HTMLElement>("[data-order-index]"));
      const nearest = targets.reduce<{ index: number; distance: number } | null>((best, element) => {
        const rect = element.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const distance = Math.hypot(event.clientX - centerX, event.clientY - centerY);
        const index = Number(element.dataset.orderIndex);
        if (!Number.isFinite(index)) return best;
        if (!best || distance < best.distance) return { index, distance };
        return best;
      }, null);
      const targetIndex = nearest?.index ?? -1;
      if (!Number.isFinite(targetIndex) || targetIndex === drag.index || targetIndex < 0 || targetIndex >= orderedSelectedImages.length) return;

      setDraftOrderIds((current) => {
        const next = current ? [...current] : selectedImages.map((image) => image.id);
        const fromIndex = drag.index ?? 0;
        const [moved] = next.splice(fromIndex, 1);
        next.splice(targetIndex, 0, moved);
        return next;
      });
      drag.index = targetIndex;
      setSelectedEditIndex(targetIndex);
      setPendingReorderIndex(targetIndex);
      return;
    }

    if (drag.type === "sheet-cut" && drag.axis && typeof drag.index === "number") {
      const nextValue = drag.axis === "vertical"
        ? drag.originX + (event.clientX - drag.startX) * drag.scaleX
        : drag.originY + (event.clientY - drag.startY) * drag.scaleY;
      updateCut(drag.axis, drag.index, nextValue);
      return;
    }

    const offsetX = drag.originX + (event.clientX - drag.startX) * drag.scaleX;
    const offsetY = drag.originY + (event.clientY - drag.startY) * drag.scaleY;

    if (drag.type === "text") {
      const currentTextSize = fontSize * textScale;
      const straightBaseY = STAMP_HEIGHT - 14;
      const arcBaseY = STAMP_HEIGHT - 34;
      const baseY = textLayout === "arc" ? arcBaseY : straightBaseY;
      const minY = 10 + currentTextSize * 0.8 - baseY;
      const maxY = STAMP_HEIGHT - 10 - baseY;
      setTextOffset({
        x: clamp(offsetX, -STAMP_WIDTH / 2 + 24, STAMP_WIDTH / 2 - 24),
        y: clamp(offsetY, minY, maxY),
      });
      return;
    }

    if (drag.imageId) {
      updateImageAdjustment(drag.imageId, { offsetX, offsetY });
    }
  };

  const stopDrag = () => {
    dragRef.current = null;
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files) return;
    const imageFiles = Array.from(files).filter((file) => file.type.startsWith("image/")).slice(0, 40 - images.length);
    const next = await Promise.all(
      imageFiles.map(async (file) => ({
        id: `${file.name}-${file.lastModified}-${Math.random().toString(36).slice(2)}`,
        name: file.name,
        src: await readFileAsDataUrl(file),
      })),
    );
    const nextTotal = Math.min(images.length + next.length, 40);
    setImages((current) => [...current, ...next].slice(0, 40));
    setCount(resolveStampCountForImageTotal(nextTotal));
    setDraftOrderIds(null);
    if (!images.length && next.length) setSelectedEditIndex(0);
    setMessage("");
    if (next.length) setStep(3);
  };

  const removeImageAt = (index: number) => {
    setImages((current) => {
      const next = current.filter((_, itemIndex) => itemIndex !== index);
      const nextCount = resolveStampCountForImageTotal(next.length);
      setCount(nextCount);
      setSelectedEditIndex((currentIndex) => clamp(currentIndex, 0, Math.max(0, Math.min(next.length, nextCount) - 1)));
      return next;
    });
    setDraftOrderIds(null);
  };

  const handleSheetFile = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    const dataUrl = await readFileAsDataUrl(file);
    setSheetSrc(dataUrl);
    setImages([]);
    resetCuts();
    setMessage("シートを読み込みました。分割線を調整して「16枚に分割」を押してください。");
  };

  const splitCurrentSheet = async () => {
    if (!sheetSrc || busy) return;
    setBusy(true);
    setMessage("");
    try {
      const cells = await splitSheetImage(sheetSrc, sheetOuterPadding, sheetTrimGutter, verticalCuts, horizontalCuts);
      setImages(cells);
      setCount(16);
      setSelectedEditIndex(0);
      setDraftOrderIds(null);
      setMessage("16枚に分割しました。ズレる場合は分割線や余白カットを調整して再分割してください。");
      setStep(3);
    } catch {
      setMessage("分割に失敗しました。別の画像でお試しください。");
    } finally {
      setBusy(false);
    }
  };

  const startReorder = () => {
    setDraftOrderIds(selectedImages.map((image) => image.id));
    setSelectedEditIndex(editIndex);
    setPendingReorderIndex(editIndex);
    setMessage("入れ替えモードです。移動したい番号をタップしてから、移動先をタップしてください。");
  };

  const confirmReorder = () => {
    if (!draftOrderIds) return;
    setImages((current) => {
      const selectedIdSet = new Set(selectedImages.map((image) => image.id));
      const byId = new Map(current.map((image) => [image.id, image]));
      const ordered = draftOrderIds.map((id) => byId.get(id)).filter(Boolean) as SourceImage[];
      const rest = current.filter((image) => !selectedIdSet.has(image.id));
      return [...ordered, ...rest];
    });
    setDraftOrderIds(null);
    setPendingReorderIndex(null);
    setDraggingOrderIndex(null);
    setMessage("順番を保存しました。ZIP出力にもこの順番が反映されます。");
  };

  const cancelReorder = () => {
    setDraftOrderIds(null);
    setPendingReorderIndex(null);
    setDraggingOrderIndex(null);
    setMessage("順番の変更を取り消しました。");
  };

  const replaceSelectedImage = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file || !file.type.startsWith("image/") || !editingImage) return;
    const replacement: SourceImage = {
      id: `${file.name}-${file.lastModified}-${Math.random().toString(36).slice(2)}`,
      name: file.name,
      src: await readFileAsDataUrl(file),
    };
    setImages((current) => current.map((image) => (image.id === editingImage.id ? replacement : image)));
    setDraftOrderIds((current) => current?.map((id) => (id === editingImage.id ? replacement.id : id)) || null);
    setBulkEditIds((current) => current.map((id) => (id === editingImage.id ? replacement.id : id)));
    setMessage(`${editIndex + 1}番の画像を差し替えました。`);
    if (replaceInputRef.current) replaceInputRef.current.value = "";
  };

  const toggleBulkEditImage = (imageId: string) => {
    setBulkEditIds((current) => (
      current.includes(imageId)
        ? current.filter((id) => id !== imageId)
        : [...current, imageId]
    ));
  };

  const selectAllBulkEditImages = () => {
    setBulkEditIds(selectedImages.map((image) => image.id));
    setMessage(`${selectedImages.length}枚を選択しました。切り抜きを一括適用できます。`);
  };

  const clearBulkEditImages = () => {
    setBulkEditIds([]);
    setMessage("一括選択を解除しました。");
  };

  const applySimpleTransparency = async (target: "single" | "all") => {
    if (busy) return;
    const targetIds = target === "all"
      ? selectedImages.map((image) => image.id)
      : (editingImage ? [editingImage.id] : []);
    if (!targetIds.length) return;

    setBusy(true);
    setMessage(target === "all" ? "全画像の背景を簡易透過しています..." : "選択中の画像を簡易透過しています...");
    try {
      const targetSet = new Set(targetIds);
      const processed = await Promise.all(
        images.map(async (image) => {
          if (!targetSet.has(image.id)) return image;
          return {
            ...image,
            originalSrc: image.originalSrc || image.src,
            src: await makeSimpleTransparentPng(image.originalSrc || image.src),
          };
        }),
      );
      setImages(processed);
      setMessage(
        target === "all"
          ? `${targetIds.length}枚に簡易透過を適用しました。色背景で透過チェックできます。`
          : "選択中の画像に簡易透過を適用しました。色背景で透過チェックできます。",
      );
    } catch {
      setMessage("簡易透過に失敗しました。画像を減らすか、別の画像でお試しください。");
    } finally {
      setBusy(false);
    }
  };

  const resetSimpleTransparency = (target: "single" | "all") => {
    const targetIds = target === "all"
      ? selectedImages.map((image) => image.id)
      : (editingImage ? [editingImage.id] : []);
    const targetSet = new Set(targetIds);
    setImages((current) => current.map((image) => {
      if (!targetSet.has(image.id) || !image.originalSrc) return image;
      const { originalSrc, ...rest } = image;
      return { ...rest, src: originalSrc };
    }));
    setMessage(target === "all" ? "全画像の透過を元に戻しました。" : "選択中の画像の透過を元に戻しました。");
  };

  const applyCropShape = (shape: CropShape, target: "single" | "bulk" | "auto" = "auto") => {
    if (!editingImage) return;
    const shouldApplyBulk = (target === "bulk" || target === "auto") && bulkEditIds.length > 0;
    const targetIds = shouldApplyBulk ? bulkEditIds : [editingImage.id];
    setCropShapes((current) => {
      const next = { ...current };
      targetIds.forEach((id) => { next[id] = shape; });
      return next;
    });
    setMessage(targetIds.length > 1 ? `${targetIds.length}枚に「${CROP_SHAPE_LABELS[shape]}」を適用しました。` : "");
  };

  const downloadZip = async () => {
    if (!selectedImages.length || busy) return;
    setBusy(true);
    setMessage("");

    try {
      const zip = new JSZip();
      const folder = zip.folder("uchinoko-stickers");
      if (!folder) throw new Error("ZIP folder could not be created.");
      const exportImages = orderedSelectedImages.slice(0, count);

      for (let index = 0; index < exportImages.length; index += 1) {
        const blob = await renderStickerPng(exportImages[index], buildStickerOptions(exportImages[index]));
        folder.file(`${String(index + 1).padStart(2, "0")}.png`, blob);
      }

      folder.file("main.png", await renderSelectedAssetPng(mainImage || selectedImages[0], MAIN_SIZE, MAIN_SIZE));
      folder.file("tab.png", await renderSelectedAssetPng(tabImage || selectedImages[0], TAB_WIDTH, TAB_HEIGHT));

      const readme = [
        "aiko animal うちのこスタンプ工房",
        "",
        `出力枚数: ${exportImages.length}`,
        `スタンプ画像サイズ: ${STAMP_WIDTH}x${STAMP_HEIGHT}px`,
        `メイン画像: ${MAIN_SIZE}x${MAIN_SIZE}px`,
        `タブ画像: ${TAB_WIDTH}x${TAB_HEIGHT}px`,
        "ファイル名: 01.png〜40.png / main.png / tab.png",
        "",
        "簡易仕上げツールのため、画像の余白・文字の視認性は必ずご自身でも確認してください。",
      ].join("\n");
      folder.file("README.txt", readme);

      const zipBlob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(zipBlob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `uchinoko-stickers-${exportImages.length}.zip`;
      link.click();
      URL.revokeObjectURL(url);
      setMessage("ZIPを作成しました。ダウンロードを確認してください。");
    } catch {
      setMessage("ZIP作成に失敗しました。画像を減らしてもう一度お試しください。");
    } finally {
      setBusy(false);
    }
  };

  const downloadCanvaSourceZip = async () => {
    if (!selectedImages.length || busy) return;
    setBusy(true);
    setMessage("");

    try {
      const zip = new JSZip();
      const folder = zip.folder("canva-transparency-source");
      if (!folder) throw new Error("ZIP folder could not be created.");
      const exportImages = selectedImages.slice(0, count);

      for (let index = 0; index < exportImages.length; index += 1) {
        const blob = await dataUrlToBlob(exportImages[index].src);
        folder.file(`${String(index + 1).padStart(2, "0")}.png`, blob);
      }

      folder.file("README.txt", [
        "Canva透過用の分割素材です。",
        "",
        `枚数: ${exportImages.length}`,
        "ファイル名: 01.png から順番に入っています。",
        "このZIPはLINE申請用の最終画像ではありません。",
        "Canvaで背景透過や調整をする前処理用として使ってください。",
      ].join("\n"));

      const zipBlob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(zipBlob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `canva-transparency-source-${exportImages.length}.zip`;
      link.click();
      URL.revokeObjectURL(url);
      setMessage(`Canva透過用の素材ZIP（${exportImages.length}枚）を作成しました。`);
    } catch {
      setMessage("Canva透過用ZIPの作成に失敗しました。画像を減らしてもう一度お試しください。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="stamp-page">
      <section className="stamp-heading">
        <p className="eyebrow">UCHINOKO STAMP STUDIO</p>
        <h1>うちのこスタンプ工房</h1>
        <p className="device-note">
          スマホでもお試しいただけますが、ZIPの保存確認・LINEスタンプ申請作業はPCがおすすめです。
        </p>
        <button className="tutorial-open-btn" type="button" onClick={openTutorial}>
          <IcoHelp size={14} /> 使い方
        </button>
      </section>

      {showTutorial && (
        <div className="tutorial-overlay" role="dialog" aria-modal="true" aria-labelledby="tutorial-title">
          <div className="tutorial-card">
            <button className="tutorial-close" type="button" aria-label="チュートリアルを閉じる" onClick={closeTutorial}>
              <IcoX size={16} />
            </button>
            <div className="tutorial-icon">{currentTutorial.icon}</div>
            <p className="tutorial-kicker">はじめての方へ</p>
            <h2 id="tutorial-title">{currentTutorial.title}</h2>
            <p>{currentTutorial.body}</p>
            <div className="tutorial-dots" aria-label={`${tutorialIndex + 1} / ${TUTORIAL_STEPS.length}`}>
              {TUTORIAL_STEPS.map((item, index) => (
                <button
                  key={item.title}
                  type="button"
                  className={tutorialIndex === index ? "active" : ""}
                  aria-label={`${index + 1}枚目を見る`}
                  onClick={() => setTutorialIndex(index)}
                />
              ))}
            </div>
            <div className="tutorial-actions">
              <button
                className="secondary-action"
                type="button"
                disabled={tutorialIndex === 0}
                onClick={() => setTutorialIndex((index) => Math.max(0, index - 1))}
              >
                戻る
              </button>
              {tutorialIndex < TUTORIAL_STEPS.length - 1 ? (
                <button className="primary-action" type="button" onClick={() => setTutorialIndex((index) => index + 1)}>
                  次へ
                </button>
              ) : (
                <button className="primary-action" type="button" onClick={closeTutorial}>
                  はじめる
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Simple flow indicator ── */}
      <div className="simple-flow" aria-label="かんたん3ステップ">
        <div className="simple-flow-head">
          <span>かんたん3ステップ</span>
          <small>画像を入れたら、必要なところだけ整えます</small>
        </div>
        <div className="simple-flow-track">
          {SIMPLE_FLOW_STAGES.map((stage, index) => {
            const isActive = stage.steps.includes(step);
            const isDone = stage.steps.every((stageStep) => stageStep < step);
            const isLocked = stage.target > 1 && images.length === 0;
            return (
              <button
                key={stage.label}
                type="button"
                className={`simple-stage${isActive ? " active" : ""}${isDone ? " done" : ""}`}
                onClick={() => {
                  if (!isLocked) setStep(stage.target);
                }}
                disabled={isLocked}
                aria-current={isActive ? "step" : undefined}
              >
                <span className="simple-stage-dot">{isDone ? <IcoCheck size={13} /> : index + 1}</span>
                <span className="simple-stage-text">
                  <strong>{stage.label}</strong>
                  <small>{stage.detail}</small>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── STEP 1: 素材 ── */}
      {step === 1 && (
        <section className="tool-panel">
          <div className="mode-switch" role="tablist" aria-label="素材の取り込み方法">
            <button type="button" className={importMode === "sheet" ? "active" : ""} onClick={() => setImportMode("sheet")}>
              4×4シートを分割
            </button>
            <button type="button" className={importMode === "individual" ? "active" : ""} onClick={() => setImportMode("individual")}>
              画像を個別追加
            </button>
          </div>

          {importMode === "sheet" ? (
            <>
              {!sheetSrc ? (
                <button
                  type="button"
                  className="drop-zone sheet"
                  onClick={() => sheetInputRef.current?.click()}
                  onDrop={(event) => { event.preventDefault(); handleSheetFile(event.dataTransfer.files); }}
                  onDragOver={(event) => event.preventDefault()}
                >
                  <IcoUpload size={28} />
                  <strong>16枚入りシートをアップロード</strong>
                  <span>4×4画像を分割線で調整して16枚に切り出します</span>
                </button>
              ) : (
                <div className="sheet-loaded-bar">
                  <span><IcoCheck size={14} /> シート読み込み済み</span>
                  <div className="sheet-loaded-actions">
                    <button className="secondary-action" type="button" onClick={() => sheetInputRef.current?.click()}>
                      <IcoSwap size={14} /> 差し替え
                    </button>
                    <button className="primary-action" type="button" onClick={splitCurrentSheet} disabled={busy}>
                      <IcoImage size={14} /> {busy ? "分割中..." : "16枚に分割"}
                    </button>
                  </div>
                </div>
              )}
              <input ref={sheetInputRef} type="file" accept="image/*" hidden onChange={(event) => handleSheetFile(event.target.files)} />

              {sheetSrc && (
                <div className="sheet-workspace">
                  <div className="sheet-preview">
                    <img src={sheetSrc} alt="分割前のシート" />
                    {visibleVerticalLines.map((line, index) => (
                      <button
                        className="sheet-line vertical"
                        style={{ left: `${line}%` }}
                        key={`v-${index}`}
                        type="button"
                        aria-label={`縦の分割線 ${index + 1}本目`}
                        onPointerDown={(event) => startSheetCutDrag(event, "vertical", index)}
                        onPointerMove={handleDragMove}
                        onPointerUp={stopDrag}
                        onPointerCancel={stopDrag}
                      />
                    ))}
                    {visibleHorizontalLines.map((line, index) => (
                      <button
                        className="sheet-line horizontal"
                        style={{ top: `${line}%` }}
                        key={`h-${index}`}
                        type="button"
                        aria-label={`横の分割線 ${index + 1}本目`}
                        onPointerDown={(event) => startSheetCutDrag(event, "horizontal", index)}
                        onPointerMove={handleDragMove}
                        onPointerUp={stopDrag}
                        onPointerCancel={stopDrag}
                      />
                    ))}
                    <p className="sheet-drag-hint">線をそのままドラッグできます</p>
                  </div>
                  <div className="sheet-controls">
                    <label>
                      外側余白：{sheetOuterPadding.toFixed(1)}%
                      <input type="range" min={0} max={12} step={0.5} value={sheetOuterPadding} onChange={(event) => setSheetOuterPadding(Number(event.target.value))} />
                    </label>
                    <label>
                      余白カット：{sheetTrimGutter.toFixed(1)}%
                      <input type="range" min={0} max={5} step={0.25} value={sheetTrimGutter} onChange={(event) => setSheetTrimGutter(Number(event.target.value))} />
                    </label>
                    <div className="cut-control-group">
                      <strong>縦の分割線</strong>
                      {verticalCuts.map((cut, index) => (
                        <label key={`vc-${index}`}>
                          {index + 1}本目：{cut.toFixed(1)}%
                          <input type="range" min={4} max={96} step={0.5} value={cut} onChange={(event) => updateCut("vertical", index, Number(event.target.value))} />
                        </label>
                      ))}
                    </div>
                    <div className="cut-control-group">
                      <strong>横の分割線</strong>
                      {horizontalCuts.map((cut, index) => (
                        <label key={`hc-${index}`}>
                          {index + 1}本目：{cut.toFixed(1)}%
                          <input type="range" min={4} max={96} step={0.5} value={cut} onChange={(event) => updateCut("horizontal", index, Number(event.target.value))} />
                        </label>
                      ))}
                    </div>
                    <div className="button-row">
                      <button className="secondary-action" type="button" onClick={resetCuts}>
                        <IcoUndo size={14} /> リセット
                      </button>
                      <button className="primary-action" type="button" onClick={splitCurrentSheet} disabled={busy}>
                        <IcoImage size={14} /> {busy ? "分割中..." : "16枚に分割"}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              <button
                type="button"
                className="drop-zone"
                onClick={() => inputRef.current?.click()}
                onDrop={(event) => { event.preventDefault(); handleFiles(event.dataTransfer.files); }}
                onDragOver={(event) => event.preventDefault()}
              >
                <IcoUpload size={28} />
                <strong>画像を選択またはドロップ</strong>
                <span>PNG/JPG対応 · 最大40枚</span>
              </button>
              <input ref={inputRef} type="file" accept="image/*" multiple hidden onChange={(event) => handleFiles(event.target.files)} />
            </>
          )}

          {images.length > 0 && (
            <>
              <div className="upload-summary">
                {images.length}枚追加済み · 出力予定 {Math.min(images.length, count)}枚
              </div>
              <div className="simple-count-picker" aria-label="保存する枚数">
                <span>保存する枚数</span>
                <div>
                  {COUNTS.map((item) => (
                    <button key={item} type="button" className={count === item ? "active" : ""} onClick={() => setCount(item)}>
                      {item}
                    </button>
                  ))}
                </div>
              </div>
              <div className="canva-source-box">
                <div>
                  <strong>Canvaで透過する場合</strong>
                  <span>分割した素材だけを先に保存できます。最終DLとは別です。</span>
                </div>
                <button className="secondary-action" type="button" disabled={!selectedImages.length || busy} onClick={downloadCanvaSourceZip}>
                  <IcoDownload size={14} /> 素材だけDL
                </button>
              </div>
              <div className="upload-grid">
                {images.map((image, index) => (
                  <div className="upload-thumb" key={image.id}>
                    <img src={image.src} alt="" />
                    <button type="button" onClick={() => removeImageAt(index)}>
                      <IcoX size={11} />
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}

          <button className="primary-action" type="button" disabled={images.length === 0} onClick={() => setStep(3)}>
            スタンプを確認する <IcoRight size={15} />
          </button>
          {message && <p className="result-message">{message}</p>}
        </section>
      )}

      {/* ── STEP 2: 枚数 ── */}
      {step === 2 && (
        <section className="tool-panel">
          <div className="count-grid">
            {COUNTS.map((item) => (
              <button key={item} type="button" className={count === item ? "active" : ""} onClick={() => setCount(item)}>
                {item}
              </button>
            ))}
          </div>
          <p className="note">
            画像{images.length}枚 · {images.length < count ? `あと${count - images.length}枚追加で${count}枚出力` : `${count}枚分を出力`}
          </p>
          <div className="button-row">
            <button type="button" className="secondary-action" onClick={() => setStep(1)}>
              <IcoLeft size={14} /> 戻る
            </button>
            <button type="button" className="primary-action" onClick={() => setStep(3)}>
              次へ <IcoRight size={15} />
            </button>
          </div>
        </section>
      )}

      {/* ── STEP 3: 画像編集 ── */}
      {step === 3 && (
        <section className="tool-panel step3-panel">
          <div className="stamp-editor-layout">

            {/* LEFT: preview column */}
            <div className="stamp-editor-preview-col">
              <div className="thumb-strip" aria-label="スタンプ一覧">
                {selectedImages.map((image, index) => (
                  <button
                    className={`thumb-item${textEditIndex === index ? " active" : ""}${bulkEditIds.includes(image.id) ? " bulk-selected" : ""}`}
                    key={image.id}
                    type="button"
                    onClick={() => setSelectedEditIndex(index)}
                    aria-label={`${index + 1}番`}
                  >
                    <img src={image.src} alt="" />
                    <span>{index + 1}</span>
                    <i
                      className="bulk-check"
                      role="checkbox"
                      aria-checked={bulkEditIds.includes(image.id)}
                      aria-label={`${index + 1}番を一括選択`}
                      tabIndex={0}
                      onClick={(event) => {
                        event.stopPropagation();
                        toggleBulkEditImage(image.id);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          event.stopPropagation();
                          toggleBulkEditImage(image.id);
                        }
                      }}
                    >
                      {bulkEditIds.includes(image.id) && <IcoCheck size={11} />}
                    </i>
                  </button>
                ))}
              </div>

              {editingImage && (
                <div className="preview-stage">
                  <div
                    className="stamp-preview final-preview"
                    style={{ backgroundColor: previewBgColor }}
                    onPointerDown={(event) => startImageDrag(event, editingImage)}
                    onPointerMove={handleDragMove}
                    onPointerUp={stopDrag}
                    onPointerCancel={stopDrag}
                    role="button"
                    tabIndex={0}
                    aria-label="ドラッグで位置調整"
                  >
                    {renderStampPreview(editingImage, textEditIndex + 1, false, `stamp-preview-arc-edit-image-${editingImage.id}`)}
                  </div>

                  <div className="preview-bg-row" aria-label="プレビュー背景色">
                    {["#ffffff", "#111827", "#7dd3fc", "#f9a8d4", "#fde68a"].map((color) => (
                      <button key={color} type="button" aria-label={`背景 ${color}`} className={`bg-swatch${previewBgColor === color ? " active" : ""}`} style={{ backgroundColor: color }} onClick={() => setPreviewBgColor(color)} />
                    ))}
                    <label className="bg-swatch-picker" aria-label="カスタム背景色" title="カスタム背景色">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m2 22 1-1h3l9-9"/><path d="M3 21v-3l9-9"/><path d="m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8Z"/></svg>
                      <input type="color" value={previewBgColor} onChange={(event) => setPreviewBgColor(event.target.value)} />
                    </label>
                  </div>
                  <p className="preview-hint">ドラッグで位置調整</p>
                </div>
              )}
            </div>

            {/* RIGHT: image controls */}
            <div className="stamp-editor-controls-col">
              {editingImage && (
                <div className="editor-section">
                  <span className="section-label">画像 · {textEditIndex + 1}枚目</span>

                  <label className="slim-label">
                    <span>拡大 {Math.round(editingAdjustment.scale * 100)}%</span>
                    <input type="range" min={0.55} max={2.2} step={0.05} value={editingAdjustment.scale} onChange={(event) => updateImageAdjustment(editingImage.id, { scale: Number(event.target.value) })} />
                  </label>

                  <div className="control-row">
                    <span className="control-row-label">
                      切り抜き
                      {bulkEditIds.length > 0 && <small>選択中の{bulkEditIds.length}枚に適用</small>}
                    </span>
                    <div className="shape-button-row">
                      {(Object.keys(CROP_SHAPE_LABELS) as CropShape[]).map((shape) => (
                        <button className={editingCropShape === shape ? "active" : ""} key={shape} type="button" onClick={() => applyCropShape(shape)}>
                          {CROP_ICONS[shape]}
                          <span>{CROP_SHAPE_LABELS[shape]}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="bulk-edit-panel">
                    <div className="bulk-edit-header">
                      <span>一括切り抜き</span>
                      <strong>{bulkEditIds.length}枚選択中</strong>
                    </div>
                    <div className="action-row compact">
                      <button className="ghost-btn" type="button" onClick={selectAllBulkEditImages}>
                        全部選択
                      </button>
                      <button className="ghost-btn" type="button" disabled={!bulkEditIds.length} onClick={clearBulkEditImages}>
                        解除
                      </button>
                    </div>
                    <div className="shape-button-row bulk-shape-row">
                      {(Object.keys(CROP_SHAPE_LABELS) as CropShape[]).map((shape) => (
                        <button key={`bulk-${shape}`} type="button" disabled={!bulkEditIds.length} onClick={() => applyCropShape(shape, "bulk")}>
                          {CROP_ICONS[shape]}
                          <span>{CROP_SHAPE_LABELS[shape]}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="transparency-box">
                    <strong>簡易透過</strong>
                    <p>外周につながっている白・単色背景をブラウザ内で透過します。AIではないので、白い毛や薄い背景は色背景で確認してください。</p>
                    <div className="action-row compact">
                      <button className="ghost-btn" type="button" disabled={busy} onClick={() => applySimpleTransparency("single")}>
                        1枚だけ透過
                      </button>
                      <button className="ghost-btn" type="button" disabled={busy || !selectedImages.some((image) => image.originalSrc)} onClick={() => resetSimpleTransparency("single")}>
                        1枚を戻す
                      </button>
                    </div>
                    <div className="action-row compact">
                      <button className="primary-action" type="button" disabled={busy} onClick={() => applySimpleTransparency("all")}>
                        全部透過
                      </button>
                      <button className="ghost-btn" type="button" disabled={busy || !selectedImages.some((image) => image.originalSrc)} onClick={() => resetSimpleTransparency("all")}>
                        全部戻す
                      </button>
                    </div>
                  </div>

                  <input ref={replaceInputRef} type="file" accept="image/*" hidden onChange={(event) => replaceSelectedImage(event.target.files)} />

                  <div className="action-row">
                    <button className="ghost-btn" type="button" onClick={() => replaceInputRef.current?.click()}>
                      <IcoSwap size={14} /> 差し替え
                    </button>
                    <button className="ghost-btn" type="button" onClick={() => updateImageAdjustment(editingImage.id, DEFAULT_IMAGE_ADJUSTMENT)}>
                      <IcoUndo size={14} /> 位置リセット
                    </button>
                  </div>

                </div>
              )}

              {message && <p className="result-message">{message}</p>}

              <div className="button-row">
                <button type="button" className="secondary-action" onClick={() => setStep(1)}>
                  <IcoLeft size={14} /> 戻る
                </button>
                <button type="button" className="primary-action" onClick={() => setStep(4)}>
                  文字を入れる（任意） <IcoRight size={15} />
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── STEP 4: 文字入れ ── */}
      {step === 4 && (
        <section className="tool-panel step3-panel">
          <div className="stamp-editor-layout">

            {/* LEFT: preview column */}
            <div className="stamp-editor-preview-col">
              <div className="thumb-strip" aria-label="スタンプ一覧">
                {selectedImages.map((image, index) => (
                  <button
                    className={`thumb-item${textEditIndex === index ? " active" : ""}`}
                    key={image.id}
                    type="button"
                    onClick={() => setSelectedEditIndex(index)}
                    aria-label={`${index + 1}番`}
                  >
                    <img src={image.src} alt="" />
                    <span>{index + 1}</span>
                    {stampTexts[image.id] && <i className="has-text-dot" aria-hidden="true" />}
                  </button>
                ))}
              </div>

              {editingImage && (
                <div className="preview-stage">
                  <div
                    className="stamp-preview final-preview"
                    style={{ backgroundColor: previewBgColor }}
                    onPointerDown={(event) => startImageDrag(event, editingImage)}
                    onPointerMove={handleDragMove}
                    onPointerUp={stopDrag}
                    onPointerCancel={stopDrag}
                    role="button"
                    tabIndex={0}
                  >
                    {renderStampPreview(editingImage, textEditIndex + 1, true, `stamp-preview-arc-edit-text-${editingImage.id}`)}
                  </div>

                  <div className="preview-bg-row" aria-label="プレビュー背景色">
                    {["#ffffff", "#111827", "#7dd3fc", "#f9a8d4", "#fde68a"].map((color) => (
                      <button key={color} type="button" aria-label={`背景 ${color}`} className={`bg-swatch${previewBgColor === color ? " active" : ""}`} style={{ backgroundColor: color }} onClick={() => setPreviewBgColor(color)} />
                    ))}
                    <label className="bg-swatch-picker" aria-label="カスタム背景色" title="カスタム背景色">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m2 22 1-1h3l9-9"/><path d="M3 21v-3l9-9"/><path d="m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8Z"/></svg>
                      <input type="color" value={previewBgColor} onChange={(event) => setPreviewBgColor(event.target.value)} />
                    </label>
                  </div>
                  <p className="preview-hint">文字ドラッグで位置調整</p>
                </div>
              )}
            </div>

            {/* RIGHT: text controls */}
            <div className="stamp-editor-controls-col">
              <div className="editor-section">
                <span className="section-label">文字 · {textEditIndex + 1}枚目</span>

                {editingImage && (
                  <input
                    className="text-input-stamp"
                    value={editingText}
                    onChange={(event) => updateStampText(editingImage.id, event.target.value)}
                    placeholder="例：ありがとう！（任意）"
                  />
                )}

                <div className="color-size-row">
                  <label className="color-label">
                    <span>色</span>
                    <input type="color" value={textColor} onChange={(event) => setTextColor(event.target.value)} />
                  </label>
                  <label className="slim-label" style={{ flex: 1 }}>
                    サイズ {fontSize}px
                    <input type="range" min={18} max={58} value={fontSize} onChange={(event) => setFontSize(Number(event.target.value))} />
                  </label>
                </div>

                <div className="mode-switch compact" role="tablist" aria-label="文字の形">
                  <button type="button" className={textLayout === "straight" ? "active" : ""} onClick={() => setTextLayout("straight")}>まっすぐ</button>
                  <button type="button" className={textLayout === "arc" ? "active" : ""} onClick={() => setTextLayout("arc")}>アーチ</button>
                </div>

                {textLayout === "arc" && (
                  <label className="slim-label">
                    アーチ強さ {arcStrength}
                    <input type="range" min={20} max={82} value={arcStrength} onChange={(event) => setArcStrength(Number(event.target.value))} />
                  </label>
                )}

                <label className="slim-label">
                  文字スケール {Math.round(textScale * 100)}%
                  <input type="range" min={0.7} max={1.8} step={0.05} value={textScale} onChange={(event) => setTextScale(Number(event.target.value))} />
                </label>

                <div className="action-row">
                  <button className="ghost-btn" type="button" onClick={() => setTextOffset({ x: 0, y: 0 })}>
                    <IcoUndo size={13} /> 位置リセット
                  </button>
                  <button className="ghost-btn" type="button" disabled={!editingText.trim()} onClick={applyTextToAll}>
                    <IcoCheck size={13} /> 全枚に入れる
                  </button>
                  <button className="ghost-btn" type="button" onClick={clearAllStampTexts}>
                    <IcoX size={13} /> 全クリア
                  </button>
                </div>
              </div>

              {message && <p className="result-message">{message}</p>}

              <div className="button-row">
                <button type="button" className="secondary-action" onClick={() => setStep(3)}>
                  <IcoLeft size={14} /> 戻る
                </button>
                <button type="button" className="primary-action" onClick={() => setStep(5)}>
                  順番確認へ <IcoRight size={15} />
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── STEP 5: 順番・保存 ── */}
      {step === 5 && (
        <section className="tool-panel save-step">

          {/* ── 1. 並び順グリッド ── */}
          <div className="save-card">
            <div className="save-card-header">
              <span className="save-card-title"><IcoReorder size={14} /> 並び順確認</span>
              {isReordering ? (
                <div style={{ display: "inline-flex", gap: 6 }}>
                  <button className="secondary-action save-hdr-btn" type="button" onClick={cancelReorder}>
                    <IcoX size={13} /> 取り消し
                  </button>
                  <button className="primary-action save-hdr-btn" type="button" onClick={confirmReorder}>
                    <IcoCheck size={13} /> 確定
                  </button>
                </div>
              ) : (
                <button className="secondary-action save-hdr-btn" type="button" disabled={!orderedSelectedImages.length} onClick={startReorder}>
                  <IcoReorder size={13} /> 入れ替え
                </button>
              )}
            </div>
            <div className="export-grid reorder-grid">
              {orderedSelectedImages.map((image, index) => (
                <button
                  className={`export-thumb selectable${editIndex === index ? " selected" : ""}${isReordering && pendingReorderIndex === index ? " moving-source" : ""}`}
                  key={image.id}
                  type="button"
                  data-order-index={index}
                  draggable={isReordering}
                  style={{ backgroundColor: previewBgColor }}
                  onPointerDown={(event) => startReorderDrag(event, index)}
                  onPointerMove={handleDragMove}
                  onPointerUp={stopDrag}
                  onPointerCancel={stopDrag}
                  onDragStart={(event) => handleDesktopReorderStart(event, index)}
                  onDragOver={(event) => handleDesktopReorderOver(event, index)}
                  onDrop={(event) => handleDesktopReorderDrop(event, index)}
                  onDragEnd={() => setDraggingOrderIndex(null)}
                  onClick={() => handleReorderThumbClick(index)}
                >
                  <img src={finalPreviewSrcs[image.id] || image.src} alt="" />
                  <span>{index + 1}</span>
                </button>
              ))}
            </div>
          </div>

          {/* ── 2. メイン / タブ画像選択 ── */}
          <div className="save-card">
            <div className="save-card-header">
              <span className="save-card-title"><IcoImage size={14} /> メイン・タブ画像</span>
              <button
                className="secondary-action save-hdr-btn"
                type="button"
                onClick={() => setShowMetaPicker(v => !v)}
              >
                {showMetaPicker ? "閉じる" : "変更する"}
              </button>
            </div>

            {!showMetaPicker ? (
              <p className="meta-default-note">
                1番の画像がメイン・タブ画像に使われます
              </p>
            ) : (
              <div className="export-meta-body">
                {/* モード切替 + 選択中プレビュー */}
                <div className="export-meta-top">
                  <div className="export-meta-mode">
                    <button className={`export-meta-tab${exportSelectMode === "main" ? " active" : ""}`} type="button" onClick={() => setExportSelectMode("main")}>
                      メイン<small>240×240</small>
                    </button>
                    <button className={`export-meta-tab${exportSelectMode === "tab" ? " active" : ""}`} type="button" onClick={() => setExportSelectMode("tab")}>
                      タブ<small>96×74</small>
                    </button>
                  </div>
                  <div className={`export-meta-preview-frame${exportSelectMode === "tab" ? " is-tab" : " is-main"}`}>
                    {exportSelectMode === "main"
                      ? mainImage && <img src={finalPreviewSrcs[mainImage.id] || mainImage.src} alt="" />
                      : tabImage  && <img src={finalPreviewSrcs[tabImage.id]  || tabImage.src}  alt="" />
                    }
                  </div>
                  <p className="export-meta-hint">
                    {exportSelectMode === "main"
                      ? `${(orderedSelectedImages.findIndex(i => i.id === mainImageId) + 1) || 1}枚目`
                      : `${(orderedSelectedImages.findIndex(i => i.id === tabImageId)  + 1) || 1}枚目`
                    }
                  </p>
                </div>
                {/* 横スクロール サムネ */}
                <div className="export-meta-strip">
                  {orderedSelectedImages.map((image, index) => (
                    <button
                      key={image.id}
                      type="button"
                      className={`export-meta-thumb${
                        (exportSelectMode === "main" && mainImageId === image.id) ||
                        (exportSelectMode === "tab"  && tabImageId  === image.id) ? " active" : ""
                      }`}
                      onClick={() => exportSelectMode === "main" ? setMainImageId(image.id) : setTabImageId(image.id)}
                    >
                      <img src={finalPreviewSrcs[image.id] || image.src} alt="" />
                      <span className="meta-num">{index + 1}</span>
                      {mainImageId === image.id && <span className="meta-badge meta-badge-m">M</span>}
                      {tabImageId  === image.id && <span className="meta-badge meta-badge-t">T</span>}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ── 3. DL ── */}
          <p className="download-note">
            ダウンロード後のZIPファイル確認や、LINE Creators MarketへのアップロードはPCでの操作がおすすめです。
            スマホの場合は「ファイル」アプリのダウンロードをご確認ください。
          </p>
          <button className="primary-action" style={{ width: "100%", gap: 8, fontSize: 15 }} type="button" disabled={!selectedImages.length || busy || isReordering} onClick={downloadZip}>
            <IcoDownload size={17} /> {isReordering ? "順番を確定してからDL" : busy ? "ZIP作成中..." : `ZIPでダウンロード（${selectedImages.length}枚）`}
          </button>

          {message && <p className="result-message">{message}</p>}

          <div className="button-row">
            <button type="button" className="secondary-action" onClick={() => setStep(4)}>
              <IcoLeft size={14} /> 戻る
            </button>
          </div>

          <div className="order-card">
            <strong>細かい仕上げまで任せたい方へ</strong>
            <p>画像の調整・文字入れ・申請前の仕上げはaiko animalにご相談ください。</p>
            <a href="https://aikoanimal.base.shop/" target="_blank" rel="noopener noreferrer">
              BASE SHOPで依頼する <IcoRight size={13} />
            </a>
          </div>
        </section>
      )}
    </main>
  );
}
