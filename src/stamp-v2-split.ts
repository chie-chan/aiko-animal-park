// ======================================================================
// stamp-v2-split.ts
// グリッド（1×1〜5×5）シートをセルに分割するロジック。透過PNG前提。
// ======================================================================

export interface SourceImage {
  id: string;
  name: string;
  src: string;
}

export type GridSize = 1 | 2 | 3 | 4 | 5;

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (event) => resolve(String(event.target?.result || ""));
    reader.readAsDataURL(file);
  });
}

export function canvasToDataUrl(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL("image/png");
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("PNG export failed."));
    }, "image/png");
  });
}

export function linePosition(cut: number, outerPadding: number) {
  const start = outerPadding;
  const range = 100 - outerPadding * 2;
  return start + (range * cut) / 100;
}

/**
 * グリッドサイズに応じた初期分割位置（%）を返す。
 * 5×5 → [20, 40, 60, 80]、1×1 → []
 */
export function defaultCuts(gridSize: GridSize): number[] {
  const count = gridSize - 1;
  return Array.from({ length: count }, (_, i) => ((i + 1) * 100) / gridSize);
}

/**
 * cuts 配列を昇順かつ最小間隔を保って正規化。
 * gridSize に応じて期待される cut 本数（gridSize - 1）に揃える。
 */
export function safeCuts(cuts: number[], gridSize: GridSize = 4): number[] {
  const expected = gridSize - 1;
  if (expected <= 0) return [];
  const arr = [...cuts].sort((a, b) => a - b);
  while (arr.length < expected) arr.push(((arr.length + 1) * 100) / gridSize);
  arr.length = expected;
  const MIN_GAP = 4;
  const HARD_MIN = 4;
  const HARD_MAX = 96;
  arr[0] = clamp(arr[0], HARD_MIN, HARD_MAX - MIN_GAP * (expected - 1));
  for (let i = 1; i < expected; i += 1) {
    arr[i] = clamp(arr[i], arr[i - 1] + MIN_GAP, HARD_MAX - MIN_GAP * (expected - 1 - i));
  }
  return arr;
}

export interface CellOffset {
  dx: number; // % of target width  (-50 〜 +50)
  dy: number; // % of target height (-50 〜 +50)
}

/**
 * セル画像を指定サイズに収めて透過PNGとして書き出す（中央寄せ、余白は透過）。
 * offset を渡すと、中央位置から指定% だけずらして描画する。
 */
export async function renderCellToSize(
  src: string,
  targetW: number,
  targetH: number,
  offset?: CellOffset,
  marginPx = 0,
): Promise<Blob> {
  const img = await loadImage(src);
  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context unavailable");
  ctx.clearRect(0, 0, targetW, targetH);

  const maxMargin = Math.max(0, Math.floor(Math.min(targetW, targetH) / 2) - 1);
  const safeMargin = clamp(marginPx, 0, maxMargin);
  const innerW = Math.max(1, targetW - safeMargin * 2);
  const innerH = Math.max(1, targetH - safeMargin * 2);
  const srcRatio = img.width / img.height;
  const dstRatio = innerW / innerH;
  let drawW: number;
  let drawH: number;
  if (srcRatio > dstRatio) {
    drawW = innerW;
    drawH = innerW / srcRatio;
  } else {
    drawH = innerH;
    drawW = innerH * srcRatio;
  }
  const offsetX = ((offset?.dx ?? 0) / 100) * innerW;
  const offsetY = ((offset?.dy ?? 0) / 100) * innerH;
  const x = safeMargin + (innerW - drawW) / 2 + offsetX;
  const y = safeMargin + (innerH - drawH) / 2 + offsetY;
  ctx.drawImage(img, x, y, drawW, drawH);

  return canvasToBlob(canvas);
}

export interface TransparentOptions {
  /** 背景候補とみなす最小の明るさ（max(R,G,B)）。0-255。既定 250（ほぼ純白だけ抜く） */
  brightness?: number;
  /** 背景候補とみなす最大の彩度（max-min）。これ以下なら無彩色＝背景候補。既定 8 */
  satTol?: number;
  /** クリック指定などで消したい背景色。未指定なら白背景判定を使う。 */
  targetColor?: RgbColor;
  /** targetColor からどれくらい近い色まで消すか。既定 24。 */
  tolerance?: number;
  /** trueなら縁からつながる背景だけ消す。falseなら同系色を全域から消す。既定 true。 */
  contiguous?: boolean;
}

export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

export interface EraseStroke {
  /** 画像内の正規化X座標（0〜1） */
  x: number;
  /** 画像内の正規化Y座標（0〜1） */
  y: number;
  /** ブラシ半径px */
  radius: number;
}

/**
 * 白背景を透過する（縁フラッドフィル方式）。
 *
 * 「白を全部消す」のではなく、「画像の縁から地続きで繋がった白だけ」を透明にする。
 * これにより、目のハイライト・白いマグ・黒地の白文字など “内側の白” を残したまま
 * 背景だけを抜ける。ベタ塗り背景＋はっきりした輪郭の絵（AIスタンプ等）と相性が良い。
 *
 * @returns 透過後のPNG dataURL（処理できない場合は元の src をそのまま返す）
 */
export async function makeImageTransparent(
  src: string,
  opts: TransparentOptions = {},
): Promise<string> {
  const brightMin = opts.brightness ?? 250;
  const satTol = opts.satTol ?? 8;
  const targetColor = opts.targetColor;
  const tolerance = opts.tolerance ?? 24;
  const contiguous = opts.contiguous ?? true;
  const img = await loadImage(src);
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  if (!w || !h) return src;

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return src;
  ctx.drawImage(img, 0, 0);

  let imageData: ImageData;
  try {
    imageData = ctx.getImageData(0, 0, w, h);
  } catch {
    // CORS等で読めない場合は元画像を返す
    return src;
  }
  const data = imageData.data;
  const n = w * h;

  const isTargetColor = (r: number, g: number, b: number) => {
    if (!targetColor) return false;
    const dr = r - targetColor.r;
    const dg = g - targetColor.g;
    const db = b - targetColor.b;
    return Math.sqrt(dr * dr + dg * dg + db * db) <= tolerance;
  };

  // 背景候補（明るく無彩色 / 指定色 / 既に透明）
  const cand = new Uint8Array(n);
  for (let i = 0; i < n; i += 1) {
    const o = i * 4;
    if (data[o + 3] === 0) {
      cand[i] = 1;
      continue;
    }
    const r = data[o];
    const g = data[o + 1];
    const b = data[o + 2];
    const mx = r > g ? (r > b ? r : b) : g > b ? g : b;
    const mn = r < g ? (r < b ? r : b) : g < b ? g : b;
    if (targetColor) {
      if (isTargetColor(r, g, b)) cand[i] = 1;
    } else if (mx >= brightMin && mx - mn <= satTol) {
      cand[i] = 1;
    }
  }

  if (!contiguous) {
    for (let i = 0; i < n; i += 1) {
      if (cand[i]) data[i * 4 + 3] = 0;
    }
    ctx.putImageData(imageData, 0, 0);
    return canvas.toDataURL("image/png");
  }

  // 縁から繋がった背景候補だけをフラッドフィル（4近傍）
  const visited = new Uint8Array(n);
  const stack = new Int32Array(n);
  let sp = 0;
  const push = (idx: number) => {
    if (idx >= 0 && idx < n && cand[idx] && !visited[idx]) {
      visited[idx] = 1;
      stack[sp] = idx;
      sp += 1;
    }
  };
  for (let x = 0; x < w; x += 1) {
    push(x);
    push((h - 1) * w + x);
  }
  for (let y = 0; y < h; y += 1) {
    push(y * w);
    push(y * w + (w - 1));
  }
  while (sp > 0) {
    sp -= 1;
    const idx = stack[sp];
    const x = idx % w;
    const y = (idx / w) | 0;
    if (x > 0) push(idx - 1);
    if (x < w - 1) push(idx + 1);
    if (y > 0) push(idx - w);
    if (y < h - 1) push(idx + w);
  }

  for (let i = 0; i < n; i += 1) {
    if (visited[i]) data[i * 4 + 3] = 0;
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/png");
}

export async function pickImageColor(
  src: string,
  xRatio: number,
  yRatio: number,
): Promise<RgbColor | null> {
  const img = await loadImage(src);
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  if (!w || !h) return null;

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0);
  try {
    const x = clamp(Math.round(xRatio * (w - 1)), 0, w - 1);
    const y = clamp(Math.round(yRatio * (h - 1)), 0, h - 1);
    const [r, g, b, a] = ctx.getImageData(x, y, 1, 1).data;
    if (a === 0) return null;
    return { r, g, b };
  } catch {
    return null;
  }
}

export async function eraseImageAtPoints(
  src: string,
  strokes: EraseStroke[],
): Promise<string> {
  if (!strokes.length) return src;
  const img = await loadImage(src);
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  if (!w || !h) return src;

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return src;
  ctx.drawImage(img, 0, 0);
  ctx.globalCompositeOperation = "destination-out";
  for (const stroke of strokes) {
    const x = clamp(stroke.x, 0, 1) * w;
    const y = clamp(stroke.y, 0, 1) * h;
    const radius = clamp(stroke.radius, 1, Math.max(w, h));
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = "source-over";
  return canvas.toDataURL("image/png");
}

/**
 * セル画像の中身（不透明な被写体）を検出し、画像の中央に寄せた dataURL を返す。
 * 透過済み画像が前提（アルファで中身の範囲を判定）。中身が画像いっぱい＝不透明な
 * 画像では何もしない（元の src をそのまま返す）。
 */
export async function centerImageContent(
  src: string,
  alphaThreshold = 8,
): Promise<string> {
  const img = await loadImage(src);
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  if (!w || !h) return src;

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return src;
  ctx.drawImage(img, 0, 0);

  let data: ImageData;
  try {
    data = ctx.getImageData(0, 0, w, h);
  } catch {
    return src;
  }
  const a = data.data;

  // 不透明ピクセルのバウンディングボックス
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y += 1) {
    const row = y * w;
    for (let x = 0; x < w; x += 1) {
      if (a[(row + x) * 4 + 3] > alphaThreshold) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return src; // 中身なし

  const cw = x1 - x0 + 1;
  const ch = y1 - y0 + 1;
  // 中央寄せに必要な平行移動量
  const dx = Math.round((w - cw) / 2 - x0);
  const dy = Math.round((h - ch) / 2 - y0);
  if (dx === 0 && dy === 0) return src; // すでに中央

  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const octx = out.getContext("2d");
  if (!octx) return src;
  octx.clearRect(0, 0, w, h);
  octx.drawImage(img, dx, dy);
  return out.toDataURL("image/png");
}

/**
 * シート画像を gridRows × gridCols に分割。
 * verticalCuts.length === gridCols - 1、horizontalCuts.length === gridRows - 1 を期待。
 */
export async function splitSheetImage(
  src: string,
  outerPadding: number,
  trimGutter: number,
  verticalCuts: number[],
  horizontalCuts: number[],
  gridCols: GridSize = 4,
  gridRows: GridSize = 4,
): Promise<SourceImage[]> {
  const image = await loadImage(src);
  const left = outerPadding;
  const right = 100 - outerPadding;
  const top = outerPadding;
  const bottom = 100 - outerPadding;
  const xBoundaries = [
    left,
    ...safeCuts(verticalCuts, gridCols).map((cut) => linePosition(cut, outerPadding)),
    right,
  ];
  const yBoundaries = [
    top,
    ...safeCuts(horizontalCuts, gridRows).map((cut) => linePosition(cut, outerPadding)),
    bottom,
  ];
  const trimX = image.width * (trimGutter / 100) * 0.5;
  const trimY = image.height * (trimGutter / 100) * 0.5;

  const cells: SourceImage[] = [];
  const lastCol = gridCols - 1;
  const lastRow = gridRows - 1;
  for (let row = 0; row < gridRows; row += 1) {
    for (let col = 0; col < gridCols; col += 1) {
      const rawX = (image.width * xBoundaries[col]) / 100;
      const rawY = (image.height * yBoundaries[row]) / 100;
      const rawW = (image.width * (xBoundaries[col + 1] - xBoundaries[col])) / 100;
      const rawH = (image.height * (yBoundaries[row + 1] - yBoundaries[row])) / 100;
      const sx = rawX + (col === 0 ? 0 : trimX);
      const sy = rawY + (row === 0 ? 0 : trimY);
      const sw = rawW - (col === 0 ? trimX : trimX * 2) + (col === lastCol ? trimX : 0);
      const sh = rawH - (row === 0 ? trimY : trimY * 2) + (row === lastRow ? trimY : 0);

      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(sw));
      canvas.height = Math.max(1, Math.round(sh));
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;
      ctx.drawImage(image, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      cells.push({
        id: `sheet-${row}-${col}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: `sheet_${String(cells.length + 1).padStart(2, "0")}.png`,
        src: canvasToDataUrl(canvas),
      });
    }
  }
  return cells;
}
