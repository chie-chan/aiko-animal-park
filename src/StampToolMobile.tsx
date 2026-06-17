import { useEffect, useMemo, useRef, useState } from "react";
import "./stamp-mobile.css";
import {
  type CellOffset,
  type SourceImage,
  defaultCuts,
  readFileAsDataUrl,
  splitSheetImage,
} from "./stamp-v2-split";
import { FRAME_DESIGNS, type FrameDesign, type PetKind, type PetKindOrNone } from "./stamp-v2-frames";
import Step3MobileSave from "./Step3MobileSave";

// ======================================================================
// StampToolMobile  ―  スマホ専用、3×3固定の縦1カラムフロー
//
// Step 1: 透過済み 3×3 PNG をアップロード → 自動分割（9コマ）
// Step 2: 並び替え（タップでスワップ）＋選択中セルの位置微調整
// Step 3: 1枚ずつカメラロール保存（Web Share API + fallback）
//
// プロンプト生成は「✨ プロンプトを作る」シートから簡易デザインルーム。
// ======================================================================

const GRID = 3;
const CELL_COUNT = GRID * GRID;
type StepId = 1 | 2 | 3;

// モバイル版に出すおすすめフレーム（厳選3種、サムネは商品サムネに差し替え済み）
const MOBILE_FEATURED_IDS = [
  "sticker-solid",  // シンプル
  "cookie-cutter",  // クッキー枠
  "fruit-frame",    // 果物
];

// ペット種類とアイコン
const PET_KIND_OPTIONS: { kind: PetKind; emoji: string; label: string }[] = [
  { kind: "犬", emoji: "🐶", label: "犬" },
  { kind: "猫", emoji: "🐱", label: "猫" },
  { kind: "うさぎ", emoji: "🐰", label: "うさぎ" },
  { kind: "ハムスター", emoji: "🐹", label: "ハムスター" },
  { kind: "その他", emoji: "✨", label: "その他" },
];

export default function StampToolMobile() {
  const [step, setStep] = useState<StepId>(1);

  // デザインルーム
  const [showDesignRoom, setShowDesignRoom] = useState(false);
  const [drStep, setDrStep] = useState<1 | 2 | 3 | 4>(1);

  // シートを開くたびに最初のステップへ戻す
  useEffect(() => {
    if (showDesignRoom) setDrStep(1);
  }, [showDesignRoom]);
  const [showNotice, setShowNotice] = useState(false);
  const [selectedFrameId, setSelectedFrameId] = useState<string>(MOBILE_FEATURED_IDS[0]);
  const [petKind, setPetKind] = useState<PetKindOrNone>(null);
  const [petKindOther, setPetKindOther] = useState("");
  const [features, setFeatures] = useState("");
  const [copied, setCopied] = useState(false);

  // Step 1
  const [sheetSrc, setSheetSrc] = useState<string | null>(null);
  const [splitCells, setSplitCells] = useState<SourceImage[]>([]);
  const [splitMsg, setSplitMsg] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Step 2
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [cellOffsets, setCellOffsets] = useState<Record<string, CellOffset>>({});
  const [swapFromIndex, setSwapFromIndex] = useState<number | null>(null);
  // 9マスのうち「使わない1マス」のID。LINEスタンプは8枚で1セットなので必ず1マス除外する。
  const [excludedCellId, setExcludedCellId] = useState<string>("");
  // ※メイン画像は LINEスタンプメーカー（公式アプリ）内で8枚から選ぶため、ここでは扱わない。

  const mobileFrames = useMemo<FrameDesign[]>(
    () => FRAME_DESIGNS.filter((f) => MOBILE_FEATURED_IDS.includes(f.id)),
    [],
  );
  const selectedFrame = mobileFrames.find((f) => f.id === selectedFrameId) ?? mobileFrames[0];
  const generatedPrompt = useMemo(
    () => selectedFrame.buildPrompt({ petKind, petKindOther, features }, GRID),
    [selectedFrame, petKind, petKindOther, features],
  );
  const canCopy =
    petKind !== null && (petKind !== "その他" || petKindOther.trim().length > 0);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(generatedPrompt);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      // fallback
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
      setSheetSrc(url);
      setSplitMsg("");
    } catch (err) {
      console.error(err);
      setSplitMsg("画像の読み込みに失敗しました。");
    }
  }

  // 画像が来たら自動で3×3分割
  useEffect(() => {
    if (!sheetSrc) {
      setSplitCells([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const cuts = defaultCuts(GRID);
        const cells = await splitSheetImage(sheetSrc, 0, 0, cuts, cuts, GRID, GRID);
        if (cancelled) return;
        setSplitCells(cells);
        setSplitMsg("");
        setSelectedIndex(0);
        setCellOffsets({});
        // デフォルトで末尾（9番）のセルを「使わない」にしておく → 上位8枚で確定
        setExcludedCellId(cells.length === CELL_COUNT ? cells[cells.length - 1].id : "");
      } catch (err) {
        console.error(err);
        if (!cancelled) setSplitMsg("分割に失敗しました。画像を確認してください。");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sheetSrc]);

  function offsetFor(id: string): CellOffset {
    return cellOffsets[id] ?? { dx: 0, dy: 0 };
  }
  function nudge(dx: number, dy: number) {
    const cell = splitCells[selectedIndex];
    if (!cell) return;
    const cur = offsetFor(cell.id);
    setCellOffsets({
      ...cellOffsets,
      [cell.id]: {
        dx: Math.max(-50, Math.min(50, cur.dx + dx)),
        dy: Math.max(-50, Math.min(50, cur.dy + dy)),
      },
    });
  }
  function resetOffset() {
    const cell = splitCells[selectedIndex];
    if (!cell) return;
    setCellOffsets({ ...cellOffsets, [cell.id]: { dx: 0, dy: 0 } });
  }
  function transformFor(id: string) {
    const o = offsetFor(id);
    if (!o.dx && !o.dy) return undefined;
    return `translate(${o.dx}%, ${o.dy}%)`;
  }

  // タップ2回でスワップ
  function handleCellTap(index: number) {
    if (swapFromIndex === null) {
      setSelectedIndex(index);
      setSwapFromIndex(index);
      return;
    }
    if (swapFromIndex === index) {
      setSwapFromIndex(null);
      return;
    }
    const next = [...splitCells];
    [next[swapFromIndex], next[index]] = [next[index], next[swapFromIndex]];
    setSplitCells(next);
    setSelectedIndex(index);
    setSwapFromIndex(null);
  }

  // 「使わない」マークを別のセルに付け替える
  function toggleExcluded(cellId: string) {
    setExcludedCellId((cur) => (cur === cellId ? "" : cellId));
  }

  // 保存対象＝除外されてない8枚
  const includedCells = useMemo(
    () => splitCells.filter((c) => c.id !== excludedCellId),
    [splitCells, excludedCellId],
  );

  const canGoNext =
    step === 3 ? false :
    step === 1 ? splitCells.length === CELL_COUNT :
    step === 2 ? includedCells.length === 8 :
    false;

  return (
    <div className="vm-shell">
      {/* ── ヘッダー ─────────────────── */}
      <header className="vm-topbar">
        <div className="vm-topbar-row">
          <div className="vm-topbar-title">
            <span className="vm-topbar-kicker">UCHINOKO STAMP MOBILE</span>
            <span className="vm-topbar-name">うちのこスタンプ工房（スマホ版）</span>
          </div>
          <div className="vm-topbar-actions">
            <a
              className="vm-topbar-btn"
              href="/stamp-v2"
              title="PC版（4×4対応・タブ画像も指定可）を開く"
            >
              💻 PC版
            </a>
            <button
              type="button"
              className="vm-topbar-btn"
              onClick={() => setShowNotice(true)}
              aria-label="注意事項"
            >
              ℹ️
            </button>
            <button
              type="button"
              className="vm-topbar-btn is-primary"
              onClick={() => setShowDesignRoom(true)}
            >
              ✨ プロンプト
            </button>
          </div>
        </div>
        <nav className="vm-stepnav" aria-label="ステップ">
          <button
            type="button"
            className={`vm-stepnav-item${step === 1 ? " is-active" : step > 1 ? " is-done" : ""}`}
            onClick={() => setStep(1)}
          >
            <span className="vm-stepnum">1</span>
            画像
          </button>
          <button
            type="button"
            className={`vm-stepnav-item${step === 2 ? " is-active" : step > 2 ? " is-done" : ""}`}
            onClick={() => setStep(2)}
            disabled={splitCells.length === 0}
          >
            <span className="vm-stepnum">2</span>
            調整
          </button>
          <button
            type="button"
            className={`vm-stepnav-item${step === 3 ? " is-active" : ""}`}
            onClick={() => setStep(3)}
            disabled={splitCells.length === 0}
          >
            <span className="vm-stepnum">3</span>
            保存
          </button>
        </nav>
      </header>

      {/* ── メイン ─────────────────── */}
      <main className="vm-main">
        {step === 1 && (
          <section className="vm-card">
            <h3 className="vm-card-title">3×3画像をアップロード</h3>
            <p className="vm-card-sub">
              先にChatGPTで <strong>3×3=9コマ</strong>のスタンプ画像を作って、ここにアップ。<br />
              透過は <strong>LINEスタンプメーカー（公式アプリ）</strong> の切り抜き機能で綺麗にできるので、そのままの画像でもOK。
              プロンプトは上の「✨ プロンプト」ボタンから作れます。
            </p>

            {!sheetSrc ? (
              <>
                <button
                  type="button"
                  className="vm-drop-zone"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <span style={{ fontSize: 32 }}>📥</span>
                  <strong>3×3画像を選ぶ</strong>
                  <span className="hint">PNGをそのままでOK</span>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => handleFile(e.target.files)}
                />
              </>
            ) : (
              <>
                <div className="vm-grid-preview">
                  {splitCells.map((c, i) => (
                    <div key={c.id} className="vm-grid-cell">
                      <span className="vm-grid-cell-num">{i + 1}</span>
                      <img
                        src={c.src}
                        alt=""
                        style={{ position: "static", width: "100%", height: "100%", objectFit: "contain" }}
                      />
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <button
                    type="button"
                    className="vm-topbar-btn"
                    style={{ flex: 1 }}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    ⇄ 別の画像にする
                  </button>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => handleFile(e.target.files)}
                />
              </>
            )}

            {splitMsg && (
              <p style={{ fontSize: 12, color: "#c66", marginTop: 8, textAlign: "center" }}>
                {splitMsg}
              </p>
            )}
          </section>
        )}

        {step === 2 && splitCells.length === 0 && (
          <div className="vm-placeholder">
            <h3>📥 まだ画像がありません</h3>
            <p>Step 1 で3×3画像を取り込んでください。</p>
          </div>
        )}

        {step === 2 && splitCells.length > 0 && (
          <>
            <section className="vm-card">
              <h3 className="vm-card-title">使う8枚を選ぶ＋並び替え</h3>
              <p className="vm-card-sub">
                LINEスタンプは8枚で1セット。9マスのうち <strong>気に入らない1枚を「使わない」</strong> に。
                入れ替えはセルをタップ→別のセルをタップ。
              </p>
              <div className="vm-selection-counter">
                <span className="vm-selection-count">{includedCells.length} / 8</span>
                <span className="vm-selection-status">
                  {includedCells.length === 8 ? "✓ 準備OK！" : "💡 「使わない」を1枚選んでください"}
                </span>
              </div>
              <div className="vm-reorder-grid">
                {splitCells.map((cell, index) => {
                  const isSelected = index === selectedIndex;
                  const isSwapSrc = swapFromIndex === index;
                  const isExcluded = cell.id === excludedCellId;
                  return (
                    <div
                      key={cell.id}
                      className={`vm-reorder-cell${isSelected || isSwapSrc ? " is-selected" : ""}${isExcluded ? " is-excluded" : ""}`}
                      onClick={() => handleCellTap(index)}
                    >
                      <span className="vm-reorder-cell-num">{index + 1}</span>
                      <button
                        type="button"
                        className={`vm-cell-exclude-btn${isExcluded ? " is-excluded" : ""}`}
                        onClick={(e) => { e.stopPropagation(); toggleExcluded(cell.id); }}
                        title={isExcluded ? "使う" : "使わない"}
                        aria-label={isExcluded ? "このコマを使う" : "このコマを使わない"}
                      >
                        {isExcluded ? "↩" : "✕"}
                      </button>
                      <img src={cell.src} alt={cell.name} style={{ transform: transformFor(cell.id) }} />
                      {isExcluded && <span className="vm-cell-excluded-badge">使わない</span>}
                    </div>
                  );
                })}
              </div>
              {swapFromIndex !== null && (
                <p style={{ fontSize: 11.5, color: "var(--vm-pink)", margin: "8px 0 0", fontWeight: 800, textAlign: "center" }}>
                  入れ替えたいセルをタップ。もう一度同じセルでキャンセル。
                </p>
              )}
            </section>

            <section className="vm-card">
              <h3 className="vm-card-title">位置を微調整（{selectedIndex + 1}番）</h3>
              <p className="vm-card-sub">
                被写体がセル内で少しずれているとき、矢印で動かせます。普通はそのままでOK。
              </p>
              <div className="vm-edit-pad">
                <span className="vm-edit-empty" />
                <button type="button" aria-label="上へ" onClick={() => nudge(0, -2)}>↑</button>
                <span className="vm-edit-empty" />
                <button type="button" aria-label="左へ" onClick={() => nudge(-2, 0)}>←</button>
                <button type="button" className="center" aria-label="リセット" onClick={resetOffset}>0</button>
                <button type="button" aria-label="右へ" onClick={() => nudge(2, 0)}>→</button>
                <span className="vm-edit-empty" />
                <button type="button" aria-label="下へ" onClick={() => nudge(0, 2)}>↓</button>
                <span className="vm-edit-empty" />
              </div>
            </section>
          </>
        )}

        {step === 3 && (
          <Step3MobileSave
            splitCells={includedCells}
            cellOffsets={cellOffsets}
          />
        )}
      </main>

      {/* ── 下部ナビ ─────────────────── */}
      <div className="vm-bottombar">
        <button
          type="button"
          disabled={step === 1}
          onClick={() => setStep((s) => Math.max(1, s - 1) as StepId)}
        >
          ← 戻る
        </button>
        {step < 3 ? (
          <button
            type="button"
            className="is-primary"
            disabled={!canGoNext}
            onClick={() => setStep((s) => Math.min(3, s + 1) as StepId)}
          >
            次へ →
          </button>
        ) : (
          <a
            className="is-primary"
            href="https://apps.apple.com/jp/app/line-creators-studio/id1063713656"
            target="_blank"
            rel="noopener noreferrer"
            title="LINEスタンプメーカー（公式アプリ）を開く"
          >
            📱 LINEスタンプメーカー ↗
          </a>
        )}
      </div>

      {/* ── デザインルーム（1ページ1ステップのウィザード） ───── */}
      {showDesignRoom && (
        <div className="vm-sheet-overlay" onClick={(e) => {
          if (e.target === e.currentTarget) setShowDesignRoom(false);
        }}>
          <div className="vm-sheet vm-sheet-wizard">
            <div className="vm-sheet-bar">
              <span className="vm-sheet-title">
                <small>DESIGN ROOM ・ {drStep} / 4</small>
                ✨ プロンプトを作る
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

            {/* 進捗ドット */}
            <div className="vm-dr-progress" aria-hidden="true">
              {[1, 2, 3, 4].map((n) => (
                <span key={n} className={`vm-dr-dot${drStep === n ? " is-active" : ""}${drStep > n ? " is-done" : ""}`} />
              ))}
            </div>

            <div className="vm-dr-body">
              {/* ── ① テンプレートを選ぼう ─────────── */}
              {drStep === 1 && (
                <section className="vm-dr-page">
                  <div className="vm-dr-step-head">
                    <span className="vm-dr-step-num">1</span>
                    <span className="vm-dr-step-title">テンプレートを選ぼう</span>
                  </div>
                  <p className="vm-dr-step-q">どんな雰囲気にする？タップで選べるよ</p>
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

              {/* ── ② あなたのペットを教えてね ───────── */}
              {drStep === 2 && (
                <section className="vm-dr-page">
                  <div className="vm-dr-step-head">
                    <span className="vm-dr-step-num">2</span>
                    <span className="vm-dr-step-title">あなたのペットを教えてね 🐾</span>
                  </div>
                  <p className="vm-dr-step-q">犬？ 猫？ うさぎ？ ハムスター？</p>
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
                      placeholder="例：インコ / フェレット / モルモット"
                      style={{ marginTop: 10 }}
                    />
                  )}
                </section>
              )}

              {/* ── ③ こだわりポイント ──────────────── */}
              {drStep === 3 && (
                <section className="vm-dr-page">
                  <div className="vm-dr-step-head">
                    <span className="vm-dr-step-num">3</span>
                    <span className="vm-dr-step-title">こだわりポイント、ある？</span>
                  </div>
                  <p className="vm-dr-step-q">毛色・耳・目の色など、教えてくれたらもっと似せられるよ（なくてもOK・スキップしてもOK）</p>
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

              {/* ── ④ プロンプトをコピー！ ──────────── */}
              {drStep === 4 && (
                <section className="vm-dr-page">
                  <div className="vm-dr-step-head">
                    <span className="vm-dr-step-num">4</span>
                    <span className="vm-dr-step-title">あなた専用プロンプトをコピー！</span>
                  </div>
                  <p className="vm-dr-step-q">準備OK！ボタンを押すとプロンプトがコピーされるよ</p>
                  <button
                    type="button"
                    className={`vm-copy-btn${copied ? " is-copied" : ""}`}
                    onClick={handleCopy}
                    disabled={!canCopy}
                  >
                    {copied ? "✓ コピーしました！" : "📋 プロンプトをコピー"}
                  </button>
                  <p className="vm-dr-flow">
                    コピーしたら ChatGPT にペット写真と一緒に貼って → 3×3画像ができたら、この画面に戻ってアップロード → カメラロール保存 → <strong>LINEスタンプメーカー（公式アプリ）</strong>の切り抜き機能で綺麗に透過できます ✨
                  </p>
                </section>
              )}
            </div>

            {/* ── ウィザードナビ ─────────────── */}
            <div className="vm-dr-nav">
              <button
                type="button"
                className="vm-dr-nav-back"
                onClick={() => setDrStep((s) => Math.max(1, s - 1) as 1 | 2 | 3 | 4)}
                disabled={drStep === 1}
              >
                ← 戻る
              </button>
              {drStep < 4 ? (
                <button
                  type="button"
                  className="vm-dr-nav-next"
                  onClick={() => setDrStep((s) => Math.min(4, s + 1) as 1 | 2 | 3 | 4)}
                  disabled={drStep === 2 && !canCopy}
                >
                  {drStep === 3 ? "プロンプトを作る →" : "次へ →"}
                </button>
              ) : (
                <button
                  type="button"
                  className="vm-dr-nav-next"
                  onClick={() => setShowDesignRoom(false)}
                >
                  閉じる ✓
                </button>
              )}
            </div>
            {drStep === 2 && !canCopy && (
              <p className="vm-dr-nav-hint">↑ ペットの種類を選ぶと次へ進めます</p>
            )}
          </div>
        </div>
      )}

      {/* ── 注意モーダル ─────────────────── */}
      {showNotice && (
        <div className="vm-sheet-overlay" onClick={(e) => {
          if (e.target === e.currentTarget) setShowNotice(false);
        }}>
          <div className="vm-sheet">
            <div className="vm-sheet-bar">
              <span className="vm-sheet-title">ℹ️ ご利用にあたって</span>
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
                AIで作った3×3画像を <strong>9マスに分割し、お気に入りの8枚をカメラロールに保存</strong> するためのツールです。画像生成・透過・LINE審査は範囲外。
              </p>
              <h4>📝 LINE審査について</h4>
              <p>
                出力は LINEスタンプメーカー（公式iOSアプリ）へ渡せる形式ですが、<strong>審査の通過を保証するものではありません。</strong>
              </p>
              <h4>⚠️ 著作権・肖像権</h4>
              <ul>
                <li>ご自身が撮影した、または使用許諾のある写真のみ使用してください</li>
                <li>既存のキャラクター・有名人・他人のペットを真似た画像はNG</li>
              </ul>
              <h4>🤖 生成AIの利用</h4>
              <ul>
                <li>ChatGPT推奨。他AIでも使えますが雰囲気が変わる場合あり</li>
                <li>各AIサービスの規約・商用利用ポリシーをご確認ください</li>
              </ul>
              <h4>🎨 透過処理</h4>
              <p>
                <strong>LINEスタンプメーカー（公式アプリ）</strong> の切り抜き機能で綺麗に透過できるので、特別な準備は不要です。
                PCで提出したい方は、Canva・Photoshop・remove.bg などで事前に透過してもOK。本ツール自体は透過処理は行いません。
              </p>
            </div>
            <button
              type="button"
              className="vm-copy-btn"
              onClick={() => setShowNotice(false)}
              style={{ marginTop: 14 }}
            >
              理解しました
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
