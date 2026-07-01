import { useEffect, useMemo, useRef, useState } from "react";
import "./stamp-mobile.css";
import {
  type CellOffset,
  type GridSize,
  type SourceImage,
  defaultCuts,
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

const PET_KIND_OPTIONS: { kind: PetKind; emoji: string; label: string }[] = [
  { kind: "犬", emoji: "🐶", label: "犬" },
  { kind: "猫", emoji: "🐱", label: "猫" },
  { kind: "うさぎ", emoji: "🐰", label: "うさぎ" },
  { kind: "ハムスター", emoji: "🐹", label: "ハムスター" },
  { kind: "その他", emoji: "✨", label: "その他" },
];

function clampOffset(v: number) {
  return Math.max(-50, Math.min(50, v));
}

function clampScale(v: number) {
  return Math.max(0.65, Math.min(1.8, v));
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [cellOffsets, setCellOffsets] = useState<Record<string, CellOffset>>({});

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

    let cancelled = false;

    (async () => {
      if (!transparentEnabled) {
        setTransparencyBusy(false);
        setSheetSrc(rawSheetSrc);
        return;
      }

      setTransparencyBusy(true);
      setSplitMsg("背景を透過しています...");
      try {
        const transparentSrc = await makeImageTransparent(rawSheetSrc);
        if (cancelled) return;
        setSheetSrc(transparentSrc);
        setSplitMsg("透過を適用しました。");
      } catch (err) {
        console.error(err);
        if (cancelled) return;
        setSheetSrc(rawSheetSrc);
        setSplitMsg("透過に失敗したため、元画像で分割します。");
      } finally {
        if (!cancelled) setTransparencyBusy(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [rawSheetSrc, transparentEnabled]);

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
        const cuts = defaultCuts(gridSize);
        const cells = await splitSheetImage(sheetSrc, 0, 0, cuts, cuts, gridSize, gridSize);
        if (cancelled) return;
        setSplitCells(cells);
        setSelectedIndex(0);
        setCellOffsets({});
        setSplitMsg(`${cells.length}個に分割しました。`);
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setSplitCells([]);
          setSplitMsg("分割に失敗しました。画像を確認してください。");
        }
      } finally {
        if (!cancelled) setProcessingSplit(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sheetSrc, gridSize]);

  function offsetFor(id: string): CellOffset {
    const offset = cellOffsets[id];
    return {
      dx: offset?.dx ?? 0,
      dy: offset?.dy ?? 0,
      scale: offset?.scale ?? 1,
    };
  }

  function setSelectedOffset(patch: Partial<CellOffset>) {
    if (!selectedCell) return;
    const current = offsetFor(selectedCell.id);
    setCellOffsets({
      ...cellOffsets,
      [selectedCell.id]: {
        dx: clampOffset(patch.dx ?? current.dx),
        dy: clampOffset(patch.dy ?? current.dy),
        scale: clampScale(patch.scale ?? current.scale ?? 1),
      },
    });
  }

  function nudge(dx: number, dy: number) {
    if (!selectedCell) return;
    const current = offsetFor(selectedCell.id);
    setSelectedOffset({ dx: current.dx + dx, dy: current.dy + dy });
  }

  function nudgeScale(delta: number) {
    if (!selectedCell) return;
    const current = offsetFor(selectedCell.id);
    setSelectedOffset({ scale: (current.scale ?? 1) + delta });
  }

  function resetOffset() {
    if (!selectedCell) return;
    setCellOffsets({ ...cellOffsets, [selectedCell.id]: { dx: 0, dy: 0, scale: 1 } });
  }

  function transformFor(id: string) {
    const o = offsetFor(id);
    const scale = o.scale ?? 1;
    if (!o.dx && !o.dy && scale === 1) return undefined;
    return `translate(${o.dx}%, ${o.dy}%) scale(${scale})`;
  }

  function changeGridSize(size: GridSize) {
    setGridSize(size);
    setSelectedIndex(0);
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
            className="vm-drop-zone"
            onClick={() => fileInputRef.current?.click()}
          >
            <strong>{sheetSrc ? "画像を差し替える" : "画像を選ぶ"}</strong>
            <span className="hint">PNG/JPG/WebP</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => handleFile(e.target.files)}
          />

          <label className={`vm-transparent-toggle${transparentEnabled ? " is-on" : ""}`}>
            <input
              type="checkbox"
              checked={transparentEnabled}
              disabled={transparencyBusy}
              onChange={(e) => setTransparentEnabled(e.target.checked)}
            />
            <span>自動透過</span>
            <small>白背景をPC版と同じ方式で透明にします</small>
          </label>

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
                      className={`vm-reorder-cell${isSelected ? " is-selected" : ""}`}
                      onClick={() => setSelectedIndex(index)}
                      aria-label={`${index + 1}番を選択`}
                    >
                      <span className="vm-reorder-cell-num">{index + 1}</span>
                      <img src={cell.src} alt={cell.name} style={{ transform: transformFor(cell.id) }} />
                    </button>
                  );
                })}
              </div>
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
                  <div className="vm-edit-preview">
                    <img src={selectedCell.src} alt={selectedCell.name} style={{ transform: transformFor(selectedCell.id) }} />
                  </div>
                  <div className="vm-edit-actions">
                    <div className="vm-edit-pad" aria-label="位置調整">
                      <span className="vm-edit-empty" />
                      <button type="button" aria-label="上へ" onClick={() => nudge(0, -2)}>↑</button>
                      <span className="vm-edit-empty" />
                      <button type="button" aria-label="左へ" onClick={() => nudge(-2, 0)}>←</button>
                      <button type="button" className="center" aria-label="中央に戻す" onClick={resetOffset}>0</button>
                      <button type="button" aria-label="右へ" onClick={() => nudge(2, 0)}>→</button>
                      <span className="vm-edit-empty" />
                      <button type="button" aria-label="下へ" onClick={() => nudge(0, 2)}>↓</button>
                      <span className="vm-edit-empty" />
                    </div>
                    <div className="vm-zoom-row">
                      <button type="button" onClick={() => nudgeScale(-0.05)}>小さく</button>
                      <span>{Math.round((offsetFor(selectedCell.id).scale ?? 1) * 100)}%</span>
                      <button type="button" onClick={() => nudgeScale(0.05)}>大きく</button>
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
