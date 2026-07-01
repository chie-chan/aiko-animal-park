import { useEffect, useState } from "react";
import {
  type CellOffset,
  type SourceImage,
  renderCellToSize,
} from "./stamp-v2-split";

// ======================================================================
// Step3MobileSave ―  モバイル向けカメラロール保存UI
//
// 戦略:
//   1) Web Share API（navigator.share with files）→ iOS共有シートで一括保存
//   2) 個別ダウンロード（<a download>）→ Android はカメラロール直行
//   3) 長押し保存（画像を大きく表示）→ Web Share 非対応端末の最終フォールバック
//
// 分割済みセルを320×320 PNGへ整えて保存する。
// 3×3なら9枚、4×4なら16枚など、渡された枚数をそのまま出力する。
// ======================================================================

const STAMP_W = 320;
const STAMP_H = 320;

interface Props {
  splitCells: SourceImage[];
  cellOffsets: Record<string, CellOffset>;
}

interface PreparedFile {
  cell: SourceImage;
  blob: Blob;
  url: string;
  fileName: string;
}

function offsetFor(cellOffsets: Record<string, CellOffset>, id: string): CellOffset {
  const offset = cellOffsets[id];
  return {
    dx: offset?.dx ?? 0,
    dy: offset?.dy ?? 0,
    scale: offset?.scale ?? 1,
  };
}

function detectShareSupport(): boolean {
  if (typeof navigator === "undefined") return false;
  if (typeof navigator.share !== "function") return false;
  if (typeof navigator.canShare !== "function") return false;
  // テスト用ダミーファイルで files share 可否を確認
  try {
    const probe = new File([new Blob([""], { type: "image/png" })], "probe.png", { type: "image/png" });
    return navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

export default function Step3MobileSave(props: Props) {
  const {
    splitCells,
    cellOffsets,
  } = props;

  const [busy, setBusy] = useState(false);
  const [prepared, setPrepared] = useState<PreparedFile[]>([]);
  const [message, setMessage] = useState("");
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [canShareFiles] = useState<boolean>(() => detectShareSupport());

  // PNG 書き出しを事前に済ませる（共有/ダウンロード時に即座に渡せるよう）
  useEffect(() => {
    let cancelled = false;
    async function prepare() {
      if (!splitCells.length) return;
      setBusy(true);
      setMessage("");
      try {
        const list: PreparedFile[] = [];
        for (let i = 0; i < splitCells.length; i += 1) {
          const cell = splitCells[i];
          const blob = await renderCellToSize(
            cell.src,
            STAMP_W,
            STAMP_H,
            offsetFor(cellOffsets, cell.id),
          );
          if (cancelled) return;
          const url = URL.createObjectURL(blob);
          list.push({
            cell,
            blob,
            url,
            fileName: `stamp-${String(i + 1).padStart(2, "0")}.png`,
          });
        }
        if (cancelled) return;

        setPrepared((prev) => {
          prev.forEach((p) => URL.revokeObjectURL(p.url));
          return list;
        });
      } catch (err) {
        console.error(err);
        setMessage("画像の準備中にエラーが起きました。もう一度試してください。");
      } finally {
        if (!cancelled) setBusy(false);
      }
    }
    prepare();
    return () => {
      cancelled = true;
    };
  }, [splitCells, cellOffsets]);

  useEffect(() => {
    return () => {
      prepared.forEach((p) => URL.revokeObjectURL(p.url));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const allFiles = prepared;

  async function shareAll() {
    if (!canShareFiles || !allFiles.length) return;
    try {
      const files = allFiles.map((p) => new File([p.blob], p.fileName, { type: "image/png" }));
      await navigator.share({
        files,
        title: "うちのこスタンプ",
        text: `分割済み画像${prepared.length}枚です。`,
      });
      setMessage("共有シートから「画像を保存」を選ぶとカメラロールに入ります。");
    } catch (err: any) {
      // ユーザーキャンセルは無視
      if (err && err.name === "AbortError") return;
      console.error(err);
      setMessage("共有に失敗しました。1枚ずつ保存ボタンをお試しください。");
    }
  }

  function downloadOne(p: PreparedFile) {
    const a = document.createElement("a");
    a.href = p.url;
    a.download = p.fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  async function shareOne(p: PreparedFile) {
    if (canShareFiles) {
      try {
        const file = new File([p.blob], p.fileName, { type: "image/png" });
        await navigator.share({ files: [file], title: p.fileName });
        return;
      } catch (err: any) {
        if (err && err.name === "AbortError") return;
        // フォールバックへ
      }
    }
    downloadOne(p);
  }

  if (!splitCells.length) {
    return (
      <div className="vm-placeholder">
        <h3>まだ画像がありません</h3>
        <p>画像を取り込むと保存できます。</p>
      </div>
    );
  }

  return (
    <div className="vm-save">
      {/* ── 一括保存（メインCTA） ───────────────── */}
      <section className="vm-save-hero">
        <h3 className="vm-save-hero-title">
          カメラロールに保存
        </h3>
        <p className="vm-save-hero-sub">
          {canShareFiles
            ? `${splitCells.length}枚を共有シートからまとめて保存できます`
            : "お使いのブラウザは一括保存に未対応。下から1枚ずつ保存できます"}
        </p>
        <button
          type="button"
          className="vm-save-hero-btn"
          onClick={shareAll}
          disabled={busy || !canShareFiles || !allFiles.length}
        >
          {busy
            ? "画像を準備中..."
            : canShareFiles
              ? `${allFiles.length}枚をまとめて保存`
              : "一括保存は未対応の端末"}
        </button>
        <p className="vm-save-hero-flow">
          共有シートで <strong>画像を保存</strong> を選ぶと写真に入ります。
        </p>
      </section>

      {/* ── 1枚ずつ保存（フォールバック / 個別） ────── */}
      <section className="vm-save-list-section">
        <h4 className="vm-save-list-title">1枚ずつ保存・確認</h4>
        <p className="vm-save-list-help">
          タップで拡大プレビュー、保存ボタンで個別保存。
        </p>
        <div className="vm-save-list">
          {prepared.map((p, i) => (
            <div key={p.cell.id} className="vm-save-card">
              <button
                type="button"
                className="vm-save-card-thumb"
                onClick={() => setPreviewIndex(i)}
                aria-label={`${i + 1}番を拡大`}
              >
                <img src={p.url} alt={p.fileName} />
                <span className="vm-save-card-num">{i + 1}</span>
              </button>
              <button
                type="button"
                className="vm-save-card-btn"
                onClick={() => shareOne(p)}
              >
                {p.fileName}
              </button>
            </div>
          ))}
        </div>
      </section>

      {message && (
        <p className="vm-save-msg">{message}</p>
      )}

      {/* ── プレビュー（長押し保存の保険） ─────────── */}
      {previewIndex !== null && prepared[previewIndex] && (
        <div
          className="vm-preview-overlay"
          onClick={() => setPreviewIndex(null)}
        >
          <div className="vm-preview-inner" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="vm-preview-close"
              onClick={() => setPreviewIndex(null)}
              aria-label="閉じる"
            >
              ×
            </button>
            <img
              src={prepared[previewIndex].url}
              alt={prepared[previewIndex].fileName}
              className="vm-preview-img"
            />
            <p className="vm-preview-hint">
              長押しから保存できる端末もあります。
            </p>
            <button
              type="button"
              className="vm-preview-btn"
              onClick={() => shareOne(prepared[previewIndex])}
            >
              この1枚を保存
            </button>
            <div className="vm-preview-nav">
              <button
                type="button"
                disabled={previewIndex === 0}
                onClick={() => setPreviewIndex((c) => (c === null ? null : Math.max(0, c - 1)))}
              >
                ← 前
              </button>
              <span>{previewIndex + 1} / {prepared.length}</span>
              <button
                type="button"
                disabled={previewIndex >= prepared.length - 1}
                onClick={() => setPreviewIndex((c) => (c === null ? null : Math.min(prepared.length - 1, c + 1)))}
              >
                次 →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
