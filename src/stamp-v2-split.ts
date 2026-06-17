// ======================================================================
// stamp-v2-split.ts
// グリッド（4×4 / 3×3）シートをセルに分割するロジック。透過PNG前提。
// ======================================================================

export interface SourceImage {
  id: string;
  name: string;
  src: string;
}

export type GridSize = 3 | 4;

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
 * 4×4 → [25, 50, 75]、3×3 → [33.33, 66.66]
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
): Promise<Blob> {
  const img = await loadImage(src);
  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context unavailable");
  ctx.clearRect(0, 0, targetW, targetH);

  const srcRatio = img.width / img.height;
  const dstRatio = targetW / targetH;
  let drawW: number;
  let drawH: number;
  if (srcRatio > dstRatio) {
    drawW = targetW;
    drawH = targetW / srcRatio;
  } else {
    drawH = targetH;
    drawW = targetH * srcRatio;
  }
  const offsetX = ((offset?.dx ?? 0) / 100) * targetW;
  const offsetY = ((offset?.dy ?? 0) / 100) * targetH;
  const x = (targetW - drawW) / 2 + offsetX;
  const y = (targetH - drawH) / 2 + offsetY;
  ctx.drawImage(img, x, y, drawW, drawH);

  return canvasToBlob(canvas);
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
