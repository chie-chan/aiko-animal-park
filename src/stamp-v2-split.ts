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
  scale?: number; // 1 = original fit size
}

/** シートの「列ごと/行ごとの中身の量」。カット線を余白（谷）に吸着させるために使う */
export interface SheetProfiles {
  col: number[];
  row: number[];
  w: number;
  h: number;
}

/**
 * profile（中身の量の列）から、targetCut% の近傍にある「余白の谷」の中心を探す。
 * 谷がはっきりしない画像（写真など余白の無いシート）では null を返してスナップしない。
 * cut% は [startPx, endPx] を 0-100 とする座標系。
 */
export function findValleyCut(
  profile: number[],
  startPx: number,
  endPx: number,
  targetCut: number,
  halfWindowCutPct: number,
): number | null {
  const s = Math.max(0, Math.round(startPx));
  const e = Math.min(profile.length - 1, Math.round(endPx));
  const len = e - s;
  if (len < 8) return null;
  let domainSum = 0;
  for (let i = s; i <= e; i += 1) domainSum += profile[i];
  const domainAvg = domainSum / (len + 1);
  if (domainAvg <= 0) return null;
  const targetPx = s + (len * targetCut) / 100;
  const half = Math.max(2, (len * halfWindowCutPct) / 100);
  const lo = Math.max(s, Math.round(targetPx - half));
  const hi = Math.min(e, Math.round(targetPx + half));
  if (hi - lo < 3) return null;
  let minV = Infinity;
  for (let i = lo; i <= hi; i += 1) minV = Math.min(minV, profile[i]);
  // 谷がはっきりしない（コマ間の余白が無い）画像ではスナップしない
  if (minV > domainAvg * 0.3) return null;
  // 谷底とほぼ同じ高さの「平ら」な区間の中心を谷の中心とみなす。
  // 谷が探索窓より広い場合は窓の外側へも辿って本当の中心を取る（辿りは窓幅ぶんまで）
  const eps = Math.max(0.5, domainAvg * 0.06);
  const maxExtend = Math.round(half * 2);
  let lo2 = lo;
  let hi2 = hi;
  while (lo2 - 1 >= s && lo - lo2 < maxExtend && profile[lo2 - 1] <= minV + eps) lo2 -= 1;
  while (hi2 + 1 <= e && hi2 - hi < maxExtend && profile[hi2 + 1] <= minV + eps) hi2 += 1;
  let sum = 0;
  let cnt = 0;
  for (let i = lo2; i <= hi2; i += 1) {
    if (profile[i] <= minV + eps) {
      sum += i;
      cnt += 1;
    }
  }
  if (!cnt) return null;
  return clamp(((sum / cnt - s) / len) * 100, 4, 96);
}

/**
 * シート画像から列/行の中身プロファイルを作る（520px以下に縮小して解析）。
 * 白背景・透過背景の両対応（四隅から背景色を推定し、背景でないピクセルを中身と数える）。
 */
export async function buildSheetProfiles(src: string): Promise<SheetProfiles | null> {
  try {
    const image = await loadImage(src);
    const sourceW = image.naturalWidth || image.width;
    const sourceH = image.naturalHeight || image.height;
    if (!sourceW || !sourceH) return null;
    const scale = Math.min(1, 520 / Math.max(sourceW, sourceH));
    const w = Math.max(1, Math.round(sourceW * scale));
    const h = Math.max(1, Math.round(sourceH * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(image, 0, 0, w, h);
    let imageData: ImageData;
    try {
      imageData = ctx.getImageData(0, 0, w, h);
    } catch {
      return null;
    }
    const data = imageData.data;
    const total = w * h;

    let transparentPixels = 0;
    for (let i = 0; i < total; i += 1) {
      if (data[i * 4 + 3] <= 12) transparentPixels += 1;
    }
    const hasTransparentBackground = transparentPixels > total * 0.02;

    // 四隅から背景色を推定
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

    const col = new Array<number>(w).fill(0);
    const row = new Array<number>(h).fill(0);
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const o = (y * w + x) * 4;
        const a = data[o + 3];
        if (a <= 12) continue;
        const dr = data[o] - bg.r;
        const dg = data[o + 1] - bg.g;
        const db = data[o + 2] - bg.b;
        const isContent = hasTransparentBackground || Math.sqrt(dr * dr + dg * dg + db * db) > 28;
        if (!isContent) continue;
        col[x] += 1;
        row[y] += 1;
      }
    }
    return { col, row, w, h };
  } catch {
    return null;
  }
}

export interface CellCropOverride {
  shiftX?: number;
  shiftY?: number;
  padX?: number;
  padY?: number;
  zoom?: number;
}

export interface CropBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/**
 * 透過画像の中身のまわりに白フチを付ける。
 * 白シルエットを全方位（32方向×リング状）に少しずつずらして重ね描きする方式＝距離変換の近似。
 * 単純な膨張処理で出る多角形のカクつきが出ず、角が丸く滑らかに仕上がる。
 * @param widthPx フチの太さ(px)。0以下ならそのまま返す
 */
export async function addWhiteOutline(src: string, widthPx: number): Promise<string> {
  if (widthPx <= 0) return src;
  const img = await loadImage(src);
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  if (!w || !h) return src;

  // 白シルエット（元画像のアルファ形状を白1色に）
  const sil = document.createElement("canvas");
  sil.width = w;
  sil.height = h;
  const sctx = sil.getContext("2d");
  if (!sctx) return src;
  sctx.drawImage(img, 0, 0);
  sctx.globalCompositeOperation = "source-in";
  sctx.fillStyle = "#ffffff";
  sctx.fillRect(0, 0, w, h);

  // フチがはみ出さないよう余白を足した出力キャンバス
  const pad = Math.ceil(widthPx) + 1;
  const out = document.createElement("canvas");
  out.width = w + pad * 2;
  out.height = h + pad * 2;
  const ctx = out.getContext("2d");
  if (!ctx) return src;

  // 全方位×リング状にシルエットを重ね描き＝円形の均一オフセット
  const angleSteps = 32;
  const ringStep = Math.max(0.6, widthPx / 4);
  for (let r = widthPx; r > 0; r -= ringStep) {
    for (let a = 0; a < angleSteps; a += 1) {
      const th = (a / angleSteps) * Math.PI * 2;
      ctx.drawImage(sil, pad + Math.cos(th) * r, pad + Math.sin(th) * r);
    }
  }
  ctx.drawImage(sil, pad, pad);
  // 重ね描きで生じた半透明を白として固める（外周のアンチエイリアスは残す）
  try {
    const data = ctx.getImageData(0, 0, out.width, out.height);
    const d = data.data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] > 0) {
        d[i] = 255;
        d[i + 1] = 255;
        d[i + 2] = 255;
        if (d[i + 3] > 96) d[i + 3] = 255;
      }
    }
    ctx.putImageData(data, 0, 0);
  } catch {
    // getImageData不可でも重ね描きでほぼ不透明になっているのでそのまま
  }
  // 最後に元画像を上へ
  ctx.drawImage(img, pad, pad);
  return out.toDataURL("image/png");
}

/**
 * 出力キャンバスに軽いアンシャープマスクをかける（アップスケール時の眠さ対策）。
 * KMベイツ実績の「LANCZOS拡大＋UnsharpMask」のブラウザ版。透過(alpha)は触らない。
 */
function unsharpCanvas(canvas: HTMLCanvasElement, radiusPx = 1, amount = 0.6) {
  const w = canvas.width;
  const h = canvas.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const blurCanvas = document.createElement("canvas");
  blurCanvas.width = w;
  blurCanvas.height = h;
  const bctx = blurCanvas.getContext("2d");
  if (!bctx) return;
  bctx.filter = `blur(${radiusPx}px)`;
  bctx.drawImage(canvas, 0, 0);
  try {
    const srcData = ctx.getImageData(0, 0, w, h);
    const blurData = bctx.getImageData(0, 0, w, h);
    const s = srcData.data;
    const b = blurData.data;
    for (let i = 0; i < s.length; i += 4) {
      if (s[i + 3] === 0) continue; // 透明部はそのまま
      s[i] = clamp(s[i] + (s[i] - b[i]) * amount, 0, 255);
      s[i + 1] = clamp(s[i + 1] + (s[i + 1] - b[i + 1]) * amount, 0, 255);
      s[i + 2] = clamp(s[i + 2] + (s[i + 2] - b[i + 2]) * amount, 0, 255);
    }
    ctx.putImageData(srcData, 0, 0);
  } catch {
    // getImageData不可(CORS等)なら未シャープのまま
  }
}

/**
 * セル画像を指定サイズに収めて透過PNGとして書き出す（中央寄せ、余白は透過）。
 * offset を渡すと、中央位置から指定% だけずらし、必要なら拡大して描画する。
 * 高画質化: 縮小は段階的リサンプル、拡大は高品質補間＋軽いアンシャープで線の甘さを防ぐ。
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
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

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
  const scale = clamp(offset?.scale ?? 1, 0.2, 3);
  const scaledW = drawW * scale;
  const scaledH = drawH * scale;
  const offsetX = ((offset?.dx ?? 0) / 100) * innerW;
  const offsetY = ((offset?.dy ?? 0) / 100) * innerH;
  const x = safeMargin + (innerW - scaledW) / 2 + offsetX;
  const y = safeMargin + (innerH - scaledH) / 2 + offsetY;

  const drawScale = scaledW / Math.max(1, img.width);
  let source: CanvasImageSource = img;
  let sourceW = img.width;
  let sourceH = img.height;
  // 大きく縮小する時は 1/2 ずつ段階的に縮めてジャギー/モアレを防ぐ
  while (sourceW * 0.5 > scaledW && sourceH * 0.5 > scaledH) {
    const stepCanvas = document.createElement("canvas");
    stepCanvas.width = Math.max(1, Math.round(sourceW * 0.5));
    stepCanvas.height = Math.max(1, Math.round(sourceH * 0.5));
    const stepCtx = stepCanvas.getContext("2d");
    if (!stepCtx) break;
    stepCtx.imageSmoothingEnabled = true;
    stepCtx.imageSmoothingQuality = "high";
    stepCtx.drawImage(source, 0, 0, stepCanvas.width, stepCanvas.height);
    source = stepCanvas;
    sourceW = stepCanvas.width;
    sourceH = stepCanvas.height;
  }
  ctx.drawImage(source, x, y, scaledW, scaledH);

  // 拡大した時だけ軽くシャープをかけて線の眠さを戻す（縮小時は元々シャープ）
  if (drawScale > 1.05) {
    unsharpCanvas(canvas, 1, Math.min(0.9, 0.5 + (drawScale - 1) * 0.4));
  }

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
  /** 透過後に半透明ダスト（最大アルファ<100の塊）を自動除去する。既定 true。 */
  removeDust?: boolean;
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
    if (opts.removeDust ?? true) removeFaintDust(data, w, h);
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
  if (opts.removeDust ?? true) removeFaintDust(data, w, h);
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/png");
}

/**
 * 透過後に残るダストを除去する（KMベイツ仕上げ術のブラウザ移植＋JPEGノイズ対策）。
 * アルファ>8 の連結成分ごとに調べて、次のどちらかに当てはまる塊だけ透明化する：
 *  1. 最大アルファ<100 ＝ 一度も濃くならない半透明ゴースト
 *  2. 小さくて白っぽい浮遊粒 ＝ JPEG圧縮ノイズで白判定を逃れた白背景の残りカス
 * 文字の白い中身や瞳のハイライトは本体（輪郭）と連結して大きな成分になるので消えない。
 * キラキラ・紙吹雪などの色付き装飾は彩度があるので残る。
 */
export function removeFaintDust(data: Uint8ClampedArray, w: number, h: number) {
  const n = w * h;
  const visited = new Uint8Array(n);
  const stack = new Int32Array(n);
  const members = new Int32Array(n);
  // 「小さい」の基準は画像サイズに比例（1254pxシートで約390px、セル単位でも最低64px）
  const smallMax = Math.max(64, Math.round(n * 0.00025));
  for (let start = 0; start < n; start += 1) {
    if (visited[start]) continue;
    const a0 = data[start * 4 + 3];
    if (a0 <= 8) {
      // ほぼ見えない孤立画素はその場で掃除
      if (a0 > 0) data[start * 4 + 3] = 0;
      visited[start] = 1;
      continue;
    }
    let sp = 0;
    let mc = 0;
    let maxA = 0;
    let sumR = 0;
    let sumG = 0;
    let sumB = 0;
    visited[start] = 1;
    stack[sp] = start;
    sp += 1;
    while (sp > 0) {
      sp -= 1;
      const idx = stack[sp];
      members[mc] = idx;
      mc += 1;
      const o = idx * 4;
      const a = data[o + 3];
      if (a > maxA) maxA = a;
      sumR += data[o];
      sumG += data[o + 1];
      sumB += data[o + 2];
      const x = idx % w;
      const y = (idx / w) | 0;
      for (let ny = y - 1; ny <= y + 1; ny += 1) {
        if (ny < 0 || ny >= h) continue;
        for (let nx = x - 1; nx <= x + 1; nx += 1) {
          if (nx < 0 || nx >= w || (nx === x && ny === y)) continue;
          const next = ny * w + nx;
          if (!visited[next] && data[next * 4 + 3] > 8) {
            visited[next] = 1;
            stack[sp] = next;
            sp += 1;
          }
        }
      }
    }
    let remove = maxA < 100; // ルール1: 半透明ゴースト
    if (!remove && mc <= smallMax) {
      // ルール2: 小さくて白っぽい浮遊粒（平均色で判定）
      const r = sumR / mc;
      const g = sumG / mc;
      const b = sumB / mc;
      const mx = r > g ? (r > b ? r : b) : g > b ? g : b;
      const mn = r < g ? (r < b ? r : b) : g < b ? g : b;
      if (mx >= 228 && mx - mn <= 26) remove = true;
    }
    if (remove) {
      for (let i = 0; i < mc; i += 1) data[members[i] * 4 + 3] = 0;
    }
  }
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
export async function centerDominantImageContent(
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

  const alpha = data.data;
  const total = w * h;
  const visited = new Uint8Array(total);
  const stack = new Int32Array(total);
  const components: Array<{ count: number; x0: number; y0: number; x1: number; y1: number }> = [];

  for (let start = 0; start < total; start += 1) {
    if (visited[start] || alpha[start * 4 + 3] <= alphaThreshold) continue;

    let sp = 0;
    visited[start] = 1;
    stack[sp] = start;
    sp += 1;

    let count = 0;
    let x0 = w;
    let y0 = h;
    let x1 = -1;
    let y1 = -1;

    while (sp > 0) {
      sp -= 1;
      const idx = stack[sp];
      const x = idx % w;
      const y = (idx / w) | 0;
      count += 1;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;

      for (let ny = y - 1; ny <= y + 1; ny += 1) {
        if (ny < 0 || ny >= h) continue;
        for (let nx = x - 1; nx <= x + 1; nx += 1) {
          if (nx < 0 || nx >= w || (nx === x && ny === y)) continue;
          const next = ny * w + nx;
          if (!visited[next] && alpha[next * 4 + 3] > alphaThreshold) {
            visited[next] = 1;
            stack[sp] = next;
            sp += 1;
          }
        }
      }
    }

    components.push({ count, x0, y0, x1, y1 });
  }

  if (!components.length) return src;
  const maxCount = components.reduce((max, component) => Math.max(max, component.count), 0);
  const minKeepCount = Math.max(8, Math.floor(maxCount * 0.015));
  const kept = components.filter((component) => component.count >= minKeepCount);
  if (!kept.length) return centerImageContent(src, alphaThreshold);

  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (const component of kept) {
    if (component.x0 < x0) x0 = component.x0;
    if (component.y0 < y0) y0 = component.y0;
    if (component.x1 > x1) x1 = component.x1;
    if (component.y1 > y1) y1 = component.y1;
  }
  if (x1 < 0) return src;

  const cw = x1 - x0 + 1;
  const ch = y1 - y0 + 1;
  const dx = Math.round((w - cw) / 2 - x0);
  const dy = Math.round((h - ch) / 2 - y0);
  if (dx === 0 && dy === 0) return src;

  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const octx = out.getContext("2d");
  if (!octx) return src;
  octx.clearRect(0, 0, w, h);
  octx.drawImage(img, dx, dy);
  return out.toDataURL("image/png");
}

export async function splitSheetImage(
  src: string,
  outerPadding: number,
  trimGutter: number,
  verticalCuts: number[],
  horizontalCuts: number[],
  gridCols: GridSize = 4,
  gridRows: GridSize = 4,
  cellOverrides: Record<number, CellCropOverride> = {},
  options: { preserveCropSize?: boolean; cropBounds?: CropBounds | null } = {},
): Promise<SourceImage[]> {
  const image = await loadImage(src);
  const preserveCropSize = options.preserveCropSize ?? false;
  const bounds = options.cropBounds;
  const left = bounds ? clamp(bounds.left, 0, 99) : outerPadding;
  const right = bounds ? clamp(bounds.right, left + 1, 100) : 100 - outerPadding;
  const top = bounds ? clamp(bounds.top, 0, 99) : outerPadding;
  const bottom = bounds ? clamp(bounds.bottom, top + 1, 100) : 100 - outerPadding;
  const xRange = right - left;
  const yRange = bottom - top;
  const xBoundaries = [
    left,
    ...safeCuts(verticalCuts, gridCols).map((cut) => left + (xRange * cut) / 100),
    right,
  ];
  const yBoundaries = [
    top,
    ...safeCuts(horizontalCuts, gridRows).map((cut) => top + (yRange * cut) / 100),
    bottom,
  ];
  const trimX = image.width * (trimGutter / 100) * 0.5;
  const trimY = image.height * (trimGutter / 100) * 0.5;

  // preserveCropSize時: 窓が画像外にはみ出しても位置を押し戻さない（はみ出し分は透明のまま）。
  // 押し戻すと端の行/列が同じ領域を切り出して複製されるため。

  const cells: SourceImage[] = [];
  const lastCol = gridCols - 1;
  const lastRow = gridRows - 1;
  for (let row = 0; row < gridRows; row += 1) {
    for (let col = 0; col < gridCols; col += 1) {
      const cellIndex = cells.length;
      const rawX = (image.width * xBoundaries[col]) / 100;
      const rawY = (image.height * yBoundaries[row]) / 100;
      const rawW = (image.width * (xBoundaries[col + 1] - xBoundaries[col])) / 100;
      const rawH = (image.height * (yBoundaries[row + 1] - yBoundaries[row])) / 100;
      const override = cellOverrides[cellIndex];
      const shiftXPx = image.width * ((override?.shiftX ?? 0) / 100);
      const shiftYPx = image.height * ((override?.shiftY ?? 0) / 100);
      const padXPx = image.width * ((override?.padX ?? 0) / 100);
      const padYPx = image.height * ((override?.padY ?? 0) / 100);
      const zoomXPx = image.width * ((override?.zoom ?? 0) / 100);
      const zoomYPx = image.height * ((override?.zoom ?? 0) / 100);
      const baseSx = rawX + (col === 0 ? 0 : trimX);
      const baseSy = rawY + (row === 0 ? 0 : trimY);
      const baseSw = rawW - (col === 0 ? trimX : trimX * 2) + (col === lastCol ? trimX : 0);
      const baseSh = rawH - (row === 0 ? trimY : trimY * 2) + (row === lastRow ? trimY : 0);
      const rawSx = baseSx + shiftXPx - padXPx + zoomXPx;
      const rawSy = baseSy + shiftYPx - padYPx + zoomYPx;
      const rawEx = baseSx + baseSw + shiftXPx + padXPx - zoomXPx;
      const rawEy = baseSy + baseSh + shiftYPx + padYPx - zoomYPx;
      const [sx, ex] = preserveCropSize
        ? [rawSx, Math.max(rawSx + 1, rawEx)]
        : [
            clamp(rawSx, 0, Math.max(0, image.width - 1)),
            clamp(rawEx, clamp(rawSx, 0, Math.max(0, image.width - 1)) + 1, image.width),
          ];
      const [sy, ey] = preserveCropSize
        ? [rawSy, Math.max(rawSy + 1, rawEy)]
        : [
            clamp(rawSy, 0, Math.max(0, image.height - 1)),
            clamp(rawEy, clamp(rawSy, 0, Math.max(0, image.height - 1)) + 1, image.height),
          ];
      const sw = ex - sx;
      const sh = ey - sy;

      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(sw));
      canvas.height = Math.max(1, Math.round(sh));
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;
      // 窓と画像の交差部分だけを、窓内の正しい位置に描く（はみ出し分は透明のまま）
      const isx = clamp(sx, 0, image.width);
      const iex = clamp(ex, 0, image.width);
      const isy = clamp(sy, 0, image.height);
      const iey = clamp(ey, 0, image.height);
      if (iex > isx && iey > isy) {
        const scaleX = canvas.width / sw;
        const scaleY = canvas.height / sh;
        ctx.drawImage(
          image,
          isx,
          isy,
          iex - isx,
          iey - isy,
          (isx - sx) * scaleX,
          (isy - sy) * scaleY,
          (iex - isx) * scaleX,
          (iey - isy) * scaleY,
        );
      }
      cells.push({
        id: `sheet-${row}-${col}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: `sheet_${String(cells.length + 1).padStart(2, "0")}.png`,
        src: canvasToDataUrl(canvas),
      });
    }
  }
  return cells;
}
