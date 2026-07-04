import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import "./stamp-tool-v2.css";
import { FRAME_DESIGNS, getDefaultStampTextLines, type FrameDesign, type PetKind, type PetKindOrNone } from "./stamp-v2-frames";
import FloatingMascot from "./FloatingMascot";
import Step2Splitter from "./Step2Splitter";
import Step2ReorderEdit from "./Step2ReorderEdit";
import Step3Export from "./Step3Export";
import { centerImageContent, defaultCuts, type CellCropOverride, type CellOffset, type GridSize, type SourceImage } from "./stamp-v2-split";
import { trackStampEvent } from "./stamp-v2-analytics";

const MASCOT_TIPS: Record<number, string[]> = {
  1: [
    "まずは1×1〜5×5の画像をアップロード！背景透過は③でまとめてできるよ。",
    "1枚ずつ作った画像は、40枚までまとめて取り込めるよ。",
    "プレビュー上の線をドラッグすると、分割位置を微調整できるよ。",
    "セルをクリックすると、その1枚を大きく拡大できるよ。",
    "横と縦の分割数は別々に変えられるよ。",
    "隣のセルがちょっと写り込んでるときは、詳細欄の「内側へ」スライダーを使ってね。",
  ],
  2: [
    "セルをドラッグすると、順番を入れ替えられるよ。",
    "セルをクリックで選んで、右で位置を微調整できるよ。",
    "矢印ボタンでちょっとずつ、プレビューを直接ドラッグでざっくり調整できるよ。",
    "背景色を黒にすると、透過状態が一番見やすいよ！",
    "「0」ボタンで位置をリセットできるから、失敗してもこわくない！",
  ],
  3: [
    "最終チェック！メイン画像とタブ画像を選ぼう。",
    "右上のタブで「メイン / タブ」を切り替えられるよ。",
    "サムネ列から好きな1枚をクリックで選択！",
    "Mマーク=メイン、Tマーク=タブだよ。",
    "ダウンロードできたら、LINE Creatorsへ提出しよう！楽しみだね！",
  ],
};

// ======================================================================
// StampToolV2  ―  PC専用、仕上げワークフロー
//   1: 画像取り込み（シート分割 / 40枚一括）
//   2: グリッド調整（シート分割のみ）
//   3: 背景透過
//   4: 画像配置（自動中央寄せ / 手動移動）
//   5: LINE用書き出し（スタンプ / 絵文字 / ZIP）
//   ＋ デザインルーム（番号外、右上ボタンから呼び出し）
// ======================================================================

type StepId = 1 | 2 | 3 | 4 | 5;
type IntakeMode = "sheet" | "batch" | null;
type DesignRoomGuideStep = 0 | 1 | 2 | 3 | 4 | 5;
export type BgPreview = "checker" | "white" | "black" | "pink" | "blue";
type StampToolV2Mode = "full" | "trial";
interface StampToolV2Props {
  mode?: StampToolV2Mode;
}
type SpotlightPlacement = {
  left: number;
  top: number;
  arrowLeft: number;
};

const GRID_SIZES = [1, 2, 3, 4, 5] as GridSize[];
const TRIAL_DEADLINE_LABEL = "6/27 19:30まで";
const TRIAL_EXPIRES_AT_MS = Date.UTC(2026, 5, 27, 10, 30); // 2026-06-27 19:30 JST

const DEFAULT_STAMP_TEXT_DRAFTS: Record<GridSize, string> = GRID_SIZES.reduce(
  (drafts, size) => {
    drafts[size] = getDefaultStampTextLines(size).join("\n");
    return drafts;
  },
  {} as Record<GridSize, string>,
);

function getStampTextDraftLines(draft: string, gridSize: GridSize): string[] {
  const defaults = getDefaultStampTextLines(gridSize);
  const entered = draft.split(/\r?\n/);
  return defaults.map((fallback, index) => {
    const line = entered[index]?.trim();
    return line || fallback;
  });
}

export default function StampToolV2({ mode = "full" }: StampToolV2Props) {
  const isTrialMode = mode === "trial";
  const isTrialExpired = isTrialMode && Date.now() >= TRIAL_EXPIRES_AT_MS;
  const [step, setStep] = useState<StepId>(1);
  const [gridSize, setGridSize] = useState<GridSize>(4);
  const [splitGridCols, setSplitGridCols] = useState<GridSize>(4);
  const [splitGridRows, setSplitGridRows] = useState<GridSize>(4);

  // ── デザインルーム（モーダル） ──────────────────────
  const [showDesignRoom, setShowDesignRoom] = useState<boolean>(false);
  const [showStartSpotlight, setShowStartSpotlight] = useState<boolean>(() => !isTrialMode);
  const [showNotice, setShowNotice] = useState<boolean>(false);
  const startSpotlightTargetRef = useRef<HTMLDivElement | null>(null);
  const [startSpotlightPlacement, setStartSpotlightPlacement] = useState<SpotlightPlacement | null>(null);
  const [designRoomGuideStep, setDesignRoomGuideStep] = useState<DesignRoomGuideStep>(0);
  const [selectedFrameId, setSelectedFrameId] = useState<string>(FRAME_DESIGNS[0].id);
  const [petKind, setPetKind] = useState<PetKindOrNone>(null);
  const [petKindOther, setPetKindOther] = useState<string>("");
  const [stampTextDrafts, setStampTextDrafts] = useState<Record<GridSize, string>>(
    DEFAULT_STAMP_TEXT_DRAFTS,
  );
  const [copied, setCopied] = useState(false);

  const selectedFrame = useMemo(
    () => FRAME_DESIGNS.find((f) => f.id === selectedFrameId) ?? FRAME_DESIGNS[0],
    [selectedFrameId],
  );
  const stampTextDraft = stampTextDrafts[gridSize] ?? DEFAULT_STAMP_TEXT_DRAFTS[gridSize];
  const stampTexts = useMemo(
    () => getStampTextDraftLines(stampTextDraft, gridSize),
    [stampTextDraft, gridSize],
  );
  const generatedPrompt = useMemo(
    () => selectedFrame.buildPrompt({ petKind, petKindOther, stampTexts }, gridSize),
    [selectedFrame, petKind, petKindOther, stampTexts, gridSize],
  );
  // その他選択時は自由記述が必須
  const canCopy =
    petKind !== null && (petKind !== "その他" || petKindOther.trim().length > 0);

  function handleStampTextDraftChange(value: string) {
    setStampTextDrafts((current) => ({ ...current, [gridSize]: value }));
  }

  function handleStampTextDraftReset() {
    setStampTextDrafts((current) => ({
      ...current,
      [gridSize]: DEFAULT_STAMP_TEXT_DRAFTS[gridSize],
    }));
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(generatedPrompt);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = generatedPrompt;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    }
    trackStampEvent("prompt_copy", {
      frame: selectedFrameId,
      gridSize,
      petKind: petKind ?? "none",
    });
  }

  // ── Step 1（Splitter）の state ─────────────────────
  const [sheetSrc, setSheetSrc] = useState<string | null>(null);
  const [verticalCuts, setVerticalCuts] = useState<number[]>(() => defaultCuts(4));
  const [horizontalCuts, setHorizontalCuts] = useState<number[]>(() => defaultCuts(4));
  const [splitCells, setSplitCells] = useState<SourceImage[]>([]);
  const [cellCropOverrides, setCellCropOverrides] = useState<Record<number, CellCropOverride>>({});
  const [intakeMode, setIntakeMode] = useState<IntakeMode>(null);
  const [hasAutoCentered, setHasAutoCentered] = useState<boolean>(false);
  // ⚡おまかせ/シート合算 完了→自動で確認画面へ進めるフラグ
  // fresh=新規セット（選択/オフセットをリセット） append=追加（既存コマの調整を保持）
  const [autoReviewPending, setAutoReviewPending] = useState<null | "fresh" | "append">(null);

  useEffect(() => {
    if (splitCells.length === 0) {
      setIntakeMode(null);
      setHasAutoCentered(false);
      setCellCropOverrides({});
    }
  }, [splitCells.length]);

  function handleImportModeChange(mode: IntakeMode) {
    setIntakeMode(mode);
    setHasAutoCentered(false);
  }

  // グリッドサイズ切替時に分割線をその初期値に戻す（セル数が変わるため）
  useEffect(() => {
    setVerticalCuts(defaultCuts(splitGridCols));
  }, [splitGridCols]);

  useEffect(() => {
    setHorizontalCuts(defaultCuts(splitGridRows));
  }, [splitGridRows]);

  // 画像が入った状態でグリッドサイズを切り替えたら、確認の上で編集状態をリセット
  function handleSplitGridChange(axis: "cols" | "rows", next: GridSize) {
    const current = axis === "cols" ? splitGridCols : splitGridRows;
    if (next === current) return;
    if (sheetSrc && splitCells.length > 0) {
      setSelectedCellIndex(0);
      setCellOffsets({});
      setMainImageId("");
      setTabImageId("");
      setHasAutoCentered(false);
      setCellCropOverrides({});
    }
    if (axis === "cols") {
      setVerticalCuts(defaultCuts(next));
      setSplitGridCols(next);
    } else {
      setHorizontalCuts(defaultCuts(next));
      setSplitGridRows(next);
    }
  }

  function handleDesignGridSizeChange(next: GridSize) {
    setGridSize(next);
    if (!sheetSrc && splitCells.length === 0) {
      setSplitGridCols(next);
      setSplitGridRows(next);
    }
  }

  // ── Step 2 & 3 共通 ───────────────────────────────
  const [selectedCellIndex, setSelectedCellIndex] = useState<number>(0);
  const [mainImageId, setMainImageId] = useState<string>("");
  const [tabImageId, setTabImageId] = useState<string>("");
  const [cellOffsets, setCellOffsets] = useState<Record<string, CellOffset>>({});
  const [bgPreview, setBgPreview] = useState<BgPreview>("checker");
  const [placementSavedAt, setPlacementSavedAt] = useState<number | null>(null);

  useEffect(() => {
    const path = window.location.pathname;
    trackStampEvent("page_view", {
      tool: path === "/stamp-mobile" ? "stamp-mobile" : path === "/stamp-room" ? "stamp-room" : "stamp-v2",
      mode: isTrialMode ? "trial" : "full",
    });
  }, [isTrialMode]);

  useEffect(() => {
    trackStampEvent("step_view", {
      step,
      intakeMode: intakeMode ?? "none",
      cellCount: splitCells.length,
    });
  }, [step, intakeMode, splitCells.length]);

  function nextStepForCurrent(): StepId | null {
    if (step === 1) return intakeMode === "batch" ? 3 : 2;
    if (step === 2) return 3;
    if (step === 3) return 4;
    if (step === 4) return 5;
    return null;
  }

  const nextStep = nextStepForCurrent();
  const canGoNext = nextStep !== null && splitCells.length > 0;
  const hasOpenOverlay = showStartSpotlight || showNotice || showDesignRoom;
  const startSpotlightStyle = startSpotlightPlacement
    ? ({
        "--v2-spotlight-left": `${startSpotlightPlacement.left}px`,
        "--v2-spotlight-top": `${startSpotlightPlacement.top}px`,
        "--v2-spotlight-arrow-left": `${startSpotlightPlacement.arrowLeft}px`,
      } as CSSProperties)
    : undefined;

  useEffect(() => {
    if (!showStartSpotlight) return;

    let frameId = 0;
    let timeoutId = 0;
    const gutter = 16;
    const maxCardWidth = 320;
    const estimatedCardHeight = 220;

    const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

    const updatePlacement = () => {
      if (frameId) window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(() => {
        frameId = 0;
        const target = startSpotlightTargetRef.current;
        if (!target) return;

        const rect = target.getBoundingClientRect();
        const cardWidth = Math.min(maxCardWidth, window.innerWidth - gutter * 2);
        const targetCenter = rect.left + rect.width / 2;
        const left = clamp(targetCenter - cardWidth / 2, gutter, window.innerWidth - cardWidth - gutter);
        const top = clamp(rect.bottom + 32, gutter, window.innerHeight - estimatedCardHeight - gutter);
        const arrowLeft = clamp(targetCenter - left, 28, cardWidth - 28);

        setStartSpotlightPlacement((current) => {
          const next = { left, top, arrowLeft };
          if (
            current &&
            Math.abs(current.left - next.left) < 0.5 &&
            Math.abs(current.top - next.top) < 0.5 &&
            Math.abs(current.arrowLeft - next.arrowLeft) < 0.5
          ) {
            return current;
          }
          return next;
        });
      });
    };

    updatePlacement();
    timeoutId = window.setTimeout(updatePlacement, 120);
    window.addEventListener("resize", updatePlacement);
    window.addEventListener("scroll", updatePlacement, true);

    return () => {
      if (frameId) window.cancelAnimationFrame(frameId);
      if (timeoutId) window.clearTimeout(timeoutId);
      window.removeEventListener("resize", updatePlacement);
      window.removeEventListener("scroll", updatePlacement, true);
    };
  }, [showStartSpotlight]);

  // 取り込み直後に編集へ進むときは、進み方に関係なく各セルの中身を自動で中央寄せする。
  const [centering, setCentering] = useState<boolean>(false);
  async function centerCellsBeforeEdit() {
    if (centering || splitCells.length === 0) return;
    setCentering(true);
    try {
      const centered = await Promise.all(
        splitCells.map(async (c) => ({ ...c, src: await centerImageContent(c.src) })),
      );
      setSplitCells(centered);
      setCellOffsets({}); // 自動中央寄せ後は手動オフセットをリセット
    } catch (e) {
      console.error(e);
    } finally {
      setCentering(false);
    }
  }

  async function goToStep(next: StepId) {
    const target = next === 2 && intakeMode === "batch" ? 3 : next;
    if (target >= 4 && !hasAutoCentered && splitCells.length > 0) {
      await centerCellsBeforeEdit();
      setHasAutoCentered(true);
    }
    setStep(target);
  }

  // ⚡おまかせ/シート合算の完了後: セルstateが反映されてから確認画面（画像配置）へ直行。
  // 中央寄せは Step2Splitter 側で「そのシートの新コマだけ」に済ませてあるため、
  // ここでは全コマの再センターをしない＝④で調整した既存コマの位置が消えない。
  useEffect(() => {
    if (!autoReviewPending || splitCells.length === 0) return;
    const mode = autoReviewPending;
    setAutoReviewPending(null);
    if (mode === "fresh") {
      // 新規セット: 前のセットの選択・手動オフセットを引きずらない
      setSelectedCellIndex(0);
      setCellOffsets({});
      setMainImageId("");
      setTabImageId("");
    }
    setHasAutoCentered(true);
    setStep(4);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoReviewPending, splitCells]);

  function handleNext() {
    if (nextStep) void goToStep(nextStep);
  }

  function handleImportComplete(mode: "sheet" | "batch") {
    trackStampEvent("import_complete", {
      mode,
      cols: splitGridCols,
      rows: splitGridRows,
      cellCount: splitCells.length,
    });
    setStep(mode === "batch" ? 3 : 2);
  }

  function handlePrevious() {
    if (step === 1) return;
    if (step === 3 && intakeMode === "batch") {
      setStep(1);
      return;
    }
    setStep((Math.max(1, step - 1) as StepId));
  }

  function savePlacementDraft(source: "manual" | "return-background" | "return-import-append") {
    setPlacementSavedAt(Date.now());
    trackStampEvent("placement_save", {
      source,
      step,
      cellCount: splitCells.length,
      offsetCount: Object.keys(cellOffsets).length,
    });
  }

  function savePlacementAndReturnToBackground() {
    savePlacementDraft("return-background");
    setStep(3);
  }

  // ④の配置を保存して①へ（シート追加=合算のため）。追加後は自動で④に戻ってくる
  function savePlacementAndAddImages() {
    savePlacementDraft("return-import-append");
    setStep(1);
  }

  function openDesignRoomWithGuide() {
    trackStampEvent("prompt_room_open", { source: "topbar" });
    setShowStartSpotlight(false);
    setShowDesignRoom(true);
    setDesignRoomGuideStep(1);
  }

  function closeDesignRoom() {
    setShowDesignRoom(false);
    setDesignRoomGuideStep(0);
  }

  return (
    <div className="v2-shell">
      {/* ── 上部：タイトル＋ステップナビ＋ツールボタン ── */}
      <header className="v2-topbar">
        <div className="v2-topbar-title">
          <span className="v2-topbar-kicker">STAMP FINISHING SUITE</span>
          <span className="v2-topbar-name">うちのこスタンプ仕上げ室</span>
        </div>
        <nav className="v2-stepnav" aria-label="ステップナビ">
          <button
            type="button"
            className={`v2-stepnav-item${step === 1 ? " is-active" : step > 1 ? " is-done" : ""}`}
            onClick={() => setStep(1)}
          >
            <span className="v2-stepnum">1</span>
            <span className="v2-steptext">
              <span className="v2-steplabel">画像を取り込む</span>
              <span className="v2-stepsub">分割 or 40枚一括</span>
            </span>
          </button>
          <button
            type="button"
            className={`v2-stepnav-item${step === 2 ? " is-active" : step > 2 ? " is-done" : ""}${intakeMode === "batch" ? " is-skipped" : ""}`}
            onClick={() => void goToStep(2)}
            disabled={intakeMode === "batch" || !sheetSrc || splitCells.length === 0 || centering}
          >
            <span className="v2-stepnum">2</span>
            <span className="v2-steptext">
              <span className="v2-steplabel">グリッドを整える</span>
              <span className="v2-stepsub">分割シートだけ</span>
            </span>
          </button>
          <button
            type="button"
            className={`v2-stepnav-item${step === 3 ? " is-active" : step > 3 ? " is-done" : ""}`}
            onClick={() => void goToStep(3)}
            disabled={splitCells.length === 0 || centering}
          >
            <span className="v2-stepnum">3</span>
            <span className="v2-steptext">
              <span className="v2-steplabel">背景透過</span>
              <span className="v2-stepsub">自動 / 色 / 消しゴム</span>
            </span>
          </button>
          <button
            type="button"
            className={`v2-stepnav-item${step === 4 ? " is-active" : step > 4 ? " is-done" : ""}`}
            onClick={() => void goToStep(4)}
            disabled={splitCells.length === 0 || centering}
          >
            <span className="v2-stepnum">4</span>
            <span className="v2-steptext">
              <span className="v2-steplabel">画像配置</span>
              <span className="v2-stepsub">自動中央 / 手動移動</span>
            </span>
          </button>
          <button
            type="button"
            className={`v2-stepnav-item${step === 5 ? " is-active" : ""}`}
            onClick={() => void goToStep(5)}
            disabled={splitCells.length === 0 || centering}
          >
            <span className="v2-stepnum">5</span>
            <span className="v2-steptext">
              <span className="v2-steplabel">LINE用ZIP</span>
              <span className="v2-stepsub">スタンプ / 絵文字</span>
            </span>
          </button>
        </nav>
        <div className="v2-topbar-spacer" />
        <a
          className="v2-topbar-switch"
          href="/stamp-mobile"
          title="スマホ向けの簡易版を開く"
        >
          📱 スマホ版
        </a>
        {isTrialMode ? (
          <div className="v2-trial-chip" aria-label="24時間お試し版">
            <strong>24時間お試し版</strong>
            <span>{TRIAL_DEADLINE_LABEL}</span>
          </div>
        ) : (
          <div
            ref={startSpotlightTargetRef}
            className={`v2-topbar-start${showStartSpotlight ? " is-spotlight-target" : ""}`}
          >
            <button
              type="button"
              className="v2-topbar-tool-btn"
              onClick={openDesignRoomWithGuide}
            >
              ✨ プロンプトを作る
            </button>
          </div>
        )}
      </header>

      <p className="v2-mobile-note">
        スマホでは確認用の表示です。ZIP保存や細かい位置調整はPCでの操作をおすすめします。
      </p>

      {/* ── メイン ── */}
      <main className="v2-main">
        {step === 1 && (
          <Step2Splitter
            phase="import"
            sheetSrc={sheetSrc}
            setSheetSrc={setSheetSrc}
            verticalCuts={verticalCuts}
            setVerticalCuts={setVerticalCuts}
            horizontalCuts={horizontalCuts}
            setHorizontalCuts={setHorizontalCuts}
            splitCells={splitCells}
            setSplitCells={setSplitCells}
            cellCropOverrides={cellCropOverrides}
            setCellCropOverrides={setCellCropOverrides}
            gridCols={splitGridCols}
            gridRows={splitGridRows}
            onChangeGridCols={(next) => handleSplitGridChange("cols", next)}
            onChangeGridRows={(next) => handleSplitGridChange("rows", next)}
            onImportModeChange={handleImportModeChange}
            onImportComplete={handleImportComplete}
            onAutoPilotComplete={(mode) => setAutoReviewPending(mode)}
          />
        )}

        {step === 2 && (
          <Step2Splitter
            phase="grid"
            sheetSrc={sheetSrc}
            setSheetSrc={setSheetSrc}
            verticalCuts={verticalCuts}
            setVerticalCuts={setVerticalCuts}
            horizontalCuts={horizontalCuts}
            setHorizontalCuts={setHorizontalCuts}
            splitCells={splitCells}
            setSplitCells={setSplitCells}
            cellCropOverrides={cellCropOverrides}
            setCellCropOverrides={setCellCropOverrides}
            gridCols={splitGridCols}
            gridRows={splitGridRows}
            onChangeGridCols={(next) => handleSplitGridChange("cols", next)}
            onChangeGridRows={(next) => handleSplitGridChange("rows", next)}
            onImportModeChange={handleImportModeChange}
            onImportComplete={handleImportComplete}
          />
        )}

        {step === 3 && (
          <Step2Splitter
            phase="background"
            sheetSrc={sheetSrc}
            setSheetSrc={setSheetSrc}
            verticalCuts={verticalCuts}
            setVerticalCuts={setVerticalCuts}
            horizontalCuts={horizontalCuts}
            setHorizontalCuts={setHorizontalCuts}
            splitCells={splitCells}
            setSplitCells={setSplitCells}
            cellCropOverrides={cellCropOverrides}
            setCellCropOverrides={setCellCropOverrides}
            gridCols={splitGridCols}
            gridRows={splitGridRows}
            onChangeGridCols={(next) => handleSplitGridChange("cols", next)}
            onChangeGridRows={(next) => handleSplitGridChange("rows", next)}
            onImportModeChange={handleImportModeChange}
            onImportComplete={handleImportComplete}
          />
        )}

        {step === 4 && (
          <Step2ReorderEdit
            splitCells={splitCells}
            setSplitCells={setSplitCells}
            selectedIndex={selectedCellIndex}
            setSelectedIndex={setSelectedCellIndex}
            cellOffsets={cellOffsets}
            setCellOffsets={setCellOffsets}
            mainImageId={mainImageId}
            tabImageId={tabImageId}
            bgPreview={bgPreview}
            setBgPreview={setBgPreview}
            gridCols={splitGridCols}
            gridRows={splitGridRows}
          />
        )}

        {step === 5 && (
          <Step3Export
            splitCells={splitCells}
            mainImageId={mainImageId}
            setMainImageId={setMainImageId}
            tabImageId={tabImageId}
            setTabImageId={setTabImageId}
            cellOffsets={cellOffsets}
            bgPreview={bgPreview}
            setBgPreview={setBgPreview}
            gridCols={splitGridCols}
            gridRows={splitGridRows}
            trialMode={isTrialMode}
          />
        )}
      </main>

      {/* ── 動かせるマスコット（Clippy風） ── */}
      {false && !hasOpenOverlay && <FloatingMascot tipsByStep={MASCOT_TIPS} currentStep={step} />}

      {isTrialExpired && (
        <div className="v2-trial-expired-overlay">
          <div className="v2-trial-expired-card">
            <span>TRIAL CLOSED</span>
            <strong>お試しリンクの利用期限が終了しました</strong>
            <p>
              うちのこスタンプ工房の製品版は、工房本体・カスタマイズ用プロンプト・詳しい使い方ガイド付きです。LINEでご案内している購入リンクをご確認ください。
            </p>
          </div>
        </div>
      )}

      {/* ── 下部：アクションバー ── */}
      <footer className="v2-bottombar">
        <button
          type="button"
          className="v2-btn-secondary"
          disabled={step === 1}
          onClick={handlePrevious}
        >
          ← 戻る
        </button>
        {(step === 4 || step === 5) && (
          <button
            type="button"
            className="v2-btn-save"
            onClick={savePlacementAndReturnToBackground}
          >
            保存して③へ戻る
          </button>
        )}
        {(step === 4 || step === 5) && splitCells.length < 40 && (
          <button
            type="button"
            className="v2-btn-save"
            onClick={savePlacementAndAddImages}
          >
            保存して画像追加①へ
          </button>
        )}
        <p className="v2-bottom-msg">
          {step === 1 && "分割シートか、完成済み画像40枚一括かを選んで取り込みます。"}
          {step === 2 && "分割シートの行数・列数と切り取り線を整えます。40枚一括ではここを飛ばします。"}
          {step === 3 && "白背景の自動透過、色クリック、消しゴムで背景を整えます。"}
          {step === 4 && "画像を自動で中央に寄せたあと、必要なコマだけ手動で位置調整します。"}
          {step === 5 && "スタンプ用または絵文字用の透過PNG ZIPを書き出します。"}
          {placementSavedAt && (step === 3 || step === 4 || step === 5) && (
            <span className="v2-save-status">配置保存済み</span>
          )}
        </p>
        <span className="v2-bottom-disclaimer">
          ※LINE審査の通過を保証するものではありません <a onClick={() => setShowNotice(true)}>詳しく</a>
        </span>
        {step < 5 ? (
          <button
            type="button"
            className="v2-btn-primary"
            disabled={!canGoNext || centering}
            onClick={handleNext}
          >
            {centering
              ? "中央寄せ中…"
              : step === 1 && intakeMode === "batch"
                ? "背景透過へ →"
                : step === 1
                  ? "グリッドを整える →"
                  : step === 2
                    ? "背景透過へ →"
                    : step === 3
                      ? "画像配置へ →"
                      : "LINE用ZIPへ →"}
          </button>
        ) : (
          <a
            className="v2-btn-primary"
            href="https://creator.line.me/ja/"
            target="_blank"
            rel="noopener noreferrer"
            style={{ textDecoration: "none" }}
          >
            LINE Creators へ ↗
          </a>
        )}
      </footer>

      {/* ── 初回チュートリアル：スポットライト ── */}
      {!isTrialMode && showStartSpotlight && (
        <div className="v2-spotlight-overlay" onClick={() => setShowStartSpotlight(false)}>
          <div
            className="v2-spotlight-card"
            style={startSpotlightStyle}
            onClick={(event) => event.stopPropagation()}
          >
            <span>START</span>
            <strong>まずは「プロンプトを作る」から</strong>
            <p>
              光っている「プロンプトを作る」を押して、デザインとペットの種類を選びます。画像ができたらこの画面に戻ってアップロード。まずは元画像のまま分割し、背景は③の背景透過で必要に応じて透明にできます。
            </p>
          </div>
        </div>
      )}

      {/* ── 注意事項モーダル ── */}
      {showNotice && (
        <div
          className="v2-notice-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowNotice(false);
          }}
        >
          <div className="v2-notice-modal">
            <div className="v2-notice-bar">
              <span className="v2-notice-title">ℹ️ ご利用にあたって</span>
              <button
                type="button"
                className="v2-designroom-modal-close"
                onClick={() => setShowNotice(false)}
                aria-label="閉じる"
              >
                ×
              </button>
            </div>
            <div className="v2-notice-body">
              <h4>このツールの位置づけ</h4>
              <p>
                うちのこスタンプ工房は、AIで作った1×1〜5×5画像や完成済み画像40枚までを <strong>背景削除・分割・整形・スタンプ/絵文字ZIP化</strong> まで行うツールです。画像を生成したり、審査を代行したりするものではありません。
              </p>

              <h4>📝 LINE審査について</h4>
              <p>
                このツールが出力するZIPは <strong>LINE Creators Market の画像仕様（スタンプ本体 / 絵文字180×180 / main.png / tab.png 透過PNG）に合わせて書き出せます</strong> が、<strong>審査の通過を保証するものではありません。</strong>
              </p>
              <ul>
                <li>審査基準・ガイドラインは LINE 側の規約をご確認ください</li>
                <li>提出するデザイン・タイトル・説明文の最終判断はご自身で</li>
                <li>リジェクトされた場合の修正対応は本ツールの範囲外です</li>
              </ul>

              <h4>⚠️ 著作権・肖像権</h4>
              <p>素材の権利関係はユーザー自身の責任で確認してください。</p>
              <ul>
                <li>ご自身が撮影した、または使用許諾のある写真のみ使用してください</li>
                <li>既存のキャラクター・有名人・他人のペットを真似た画像はNG</li>
                <li>商用利用が許可されていないAI生成サービスもあります。ご利用のAIの規約をご確認ください</li>
                <li>第三者の著作物・肖像を侵害した結果については、当ツールは責任を負いません</li>
              </ul>

              <h4>🤖 生成AIの利用について</h4>
              <ul>
                <li><strong>ChatGPT 推奨</strong>：プロンプトはChatGPTでの仕上がりに合わせて作成しています</li>
                <li>他の画像生成AI（Gemini・Copilot・Midjourneyなど）でも使えますが、雰囲気が変わる可能性があります。お好みでお試しください</li>
                <li>各AIサービスの利用規約・商用利用ポリシーを必ずご確認ください</li>
                <li>生成画像の権利は使用するAIサービスごとに異なります</li>
              </ul>

              <h4>🎨 透過処理について</h4>
              <p>
                Step3の背景透過で「自動透過を実行」すると、本ツールが<strong>白い背景を自動で透明化</strong>します（画像の縁から繋がった白だけを抜くので、目の白や白文字などの“内側の白”は残ります）。ベタ塗りの白背景＋はっきりした輪郭の絵で特にきれいに抜けます。
              </p>
              <p>
                自動透過がうまくいかない場合や、より精密に仕上げたい場合は、Canva・Photoshop・remove.bg などお手持ちのソフトで透過した画像をアップロードしてください。
              </p>

              <div className="v2-notice-disclaimer">
                <strong>免責事項：</strong>
                本ツールの利用により生じたいかなる損害・トラブル（審査落ち、権利侵害クレーム、収益機会の損失等）についても、提供者は一切の責任を負いません。ツールは現状のまま提供され、機能の保証や継続性も約束されません。
              </div>
            </div>
            <div className="v2-notice-foot">
              <button
                type="button"
                className="v2-notice-close-btn"
                onClick={() => setShowNotice(false)}
              >
                理解しました
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── デザインルーム モーダル ── */}
      {!isTrialMode && showDesignRoom && (
        <div
          className="v2-designroom-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeDesignRoom();
          }}
        >
          <div className="v2-designroom-modal">
            <div className="v2-designroom-modal-bar">
              <div className="v2-designroom-modal-title">
                <small>DESIGN ROOM</small>
                <b>📋 プロンプトを作る</b>
              </div>
              <button
                type="button"
                className="v2-designroom-modal-close"
                onClick={closeDesignRoom}
                aria-label="閉じる"
              >
                ×
              </button>
            </div>
            <div className="v2-designroom-modal-body">
              <DesignRoom
                frames={FRAME_DESIGNS}
                selectedFrameId={selectedFrameId}
                onSelectFrame={setSelectedFrameId}
                selectedFrame={selectedFrame}
                petKind={petKind}
                onChangePetKind={setPetKind}
                petKindOther={petKindOther}
                onChangePetKindOther={setPetKindOther}
                stampTextDraft={stampTextDraft}
                onChangeStampTextDraft={handleStampTextDraftChange}
                onResetStampTextDraft={handleStampTextDraftReset}
                generatedPrompt={generatedPrompt}
                canCopy={canCopy}
                copied={copied}
                onCopy={handleCopy}
                onGoToStep2={() => {
                  closeDesignRoom();
                  setStep(1);
                }}
                guideStep={designRoomGuideStep}
                gridSize={gridSize}
                onChangeGridSize={handleDesignGridSizeChange}
              />
              {designRoomGuideStep > 0 && (
                <DesignRoomCoach
                  step={designRoomGuideStep as Exclude<DesignRoomGuideStep, 0>}
                  onClose={() => setDesignRoomGuideStep(0)}
                  onNext={() =>
                    setDesignRoomGuideStep((current) =>
                      current >= 5 ? 0 : ((current + 1) as DesignRoomGuideStep),
                    )
                  }
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ======================================================================
// Design Room（モーダル内コンテンツ）
// ======================================================================
const DESIGN_ROOM_GUIDE_STEPS: Record<
  Exclude<DesignRoomGuideStep, 0>,
  { kicker: string; title: string; body: string }
> = {
  1: {
    kicker: "STEP 1",
    title: "デザインを選んでね",
    body: "まずはシール風・クッキー型風・果物フレームから、好きな雰囲気を選びます。",
  },
  2: {
    kicker: "STEP 2",
    title: "グリッドを選んでね",
    body: "1×1〜5×5まで選べます。スタンプなら3×3=9コマ、4×4=16コマがおすすめ。絵文字素材や候補出しなら5×5も便利です。",
  },
  3: {
    kicker: "STEP 3",
    title: "うちの子の種類を選んでね",
    body: "犬・猫・うさぎ・ハムスター・その他から選ぶよ。AIが種類を間違えにくくなります。",
  },
  4: {
    kicker: "STEP 4",
    title: "セリフを変えたい時はこちら",
    body: "分割数に合わせて1行1コマでセリフを変えられます。長い言葉は崩れやすいので、短めがおすすめです。",
  },
  5: {
    kicker: "STEP 5",
    title: "プロンプトをコピーしてね",
    body: "コピーしたプロンプトを、ペット画像と一緒にChatGPTへ貼り付けてください。",
  },
};

interface DesignRoomCoachProps {
  step: Exclude<DesignRoomGuideStep, 0>;
  onNext: () => void;
  onClose: () => void;
}

function DesignRoomCoach({ step, onNext, onClose }: DesignRoomCoachProps) {
  const guide = DESIGN_ROOM_GUIDE_STEPS[step];
  const isLast = step === 6;

  return (
    <>
      <div className="v2-design-guide-scrim" />
      <aside className={`v2-design-guide-card is-step-${step}`} aria-live="polite">
        <button
          type="button"
          className="v2-design-guide-close"
          onClick={onClose}
          aria-label="チュートリアルを閉じる"
        >
          ×
        </button>
        <span className="v2-design-guide-kicker">{guide.kicker}</span>
        <strong>{guide.title}</strong>
        <p>{guide.body}</p>
        <div className="v2-design-guide-foot">
          <span>{step} / 6</span>
          <button type="button" onClick={onNext}>
            {isLast ? "画面へ戻る" : "次へ"}
          </button>
        </div>
      </aside>
    </>
  );
}

interface DesignRoomProps {
  frames: FrameDesign[];
  selectedFrameId: string;
  onSelectFrame: (id: string) => void;
  selectedFrame: FrameDesign;
  petKind: PetKindOrNone;
  onChangePetKind: (v: PetKind) => void;
  petKindOther: string;
  onChangePetKindOther: (v: string) => void;
  stampTextDraft: string;
  onChangeStampTextDraft: (v: string) => void;
  onResetStampTextDraft: () => void;
  generatedPrompt: string;
  canCopy: boolean;
  copied: boolean;
  onCopy: () => void;
  onGoToStep2: () => void;
  guideStep?: DesignRoomGuideStep;
  gridSize: GridSize;
  onChangeGridSize: (g: GridSize) => void;
}

function DesignRoom(props: DesignRoomProps) {
  const {
    frames,
    selectedFrameId,
    onSelectFrame,
    selectedFrame,
    petKind,
    onChangePetKind,
    petKindOther,
    onChangePetKindOther,
    stampTextDraft,
    onChangeStampTextDraft,
    onResetStampTextDraft,
    generatedPrompt,
    canCopy,
    copied,
    onCopy,
    onGoToStep2,
    guideStep = 0,
    gridSize,
    onChangeGridSize,
  } = props;

  const [zoomFrameIndex, setZoomFrameIndex] = useState<number | null>(null);
  const [showAllFrames, setShowAllFrames] = useState<boolean>(false);

  // あいこ版（VITE_UNLOCK_ALL_FRAMES=1）では Coming soon を解禁して全フレームを使えるようにする。
  // 通常ビルド（＝デプロイ公開版）は false のままなので、お客さん向けは今まで通りゲートされる。
  const unlockAll = import.meta.env.VITE_UNLOCK_ALL_FRAMES === "1";
  const featuredFrames = frames.filter((f) => f.featured);
  const otherFrames = frames.filter((f) => !f.featured);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (zoomFrameIndex === null) return;
      if (e.key === "Escape") setZoomFrameIndex(null);
      else if (e.key === "ArrowRight") {
        setZoomFrameIndex((c) => (c === null ? null : (c + 1) % frames.length));
      } else if (e.key === "ArrowLeft") {
        setZoomFrameIndex((c) => (c === null ? null : (c - 1 + frames.length) % frames.length));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoomFrameIndex, frames.length]);

  const zoomedFrame = zoomFrameIndex !== null ? frames[zoomFrameIndex] : null;
  const canUseZoomedFrame = Boolean(
    zoomedFrame && (unlockAll || featuredFrames.some((frame) => frame.id === zoomedFrame.id)),
  );
  const stampTextTotal = gridSize * gridSize;
  const stampTextLineCount = stampTextDraft.split(/\r?\n/).filter((line) => line.trim()).length;

  return (
    <div className="v2-design-room">
      {/* LEFT: フレーム選択 */}
      <section className={`v2-design-left${guideStep === 1 ? " is-guide-target" : ""}`}>
        <div className="v2-section-head">
          <span className="v2-section-num">1</span>
          <span className="v2-section-title">デザインを選ぶ</span>
        </div>

        {/* おすすめ4枠 */}
        {featuredFrames.length > 0 && (
          <>
            <div className="v2-frame-section-head">
              <span className="star">⭐</span>
              <span className="v2-frame-section-label">おすすめ</span>
              <span className="v2-frame-section-divider" />
            </div>
            <div className="v2-frame-list">
              {featuredFrames.map((frame) => {
                const idx = frames.findIndex((f) => f.id === frame.id);
                return (
                  <FrameCard
                    key={frame.id}
                    frame={frame}
                    isSelected={selectedFrameId === frame.id}
                    showStar
                    onSelect={() => onSelectFrame(frame.id)}
                    onZoom={() => setZoomFrameIndex(idx)}
                  />
                );
              })}
            </div>
          </>
        )}

        {/* もっと見る切替 */}
        {otherFrames.length > 0 && (
          <div className="v2-more-toggle-wrap">
            <button
              type="button"
              className="v2-more-toggle"
              onClick={() => setShowAllFrames((v) => !v)}
            >
              {showAllFrames
                ? `閉じる ▲`
                : unlockAll
                  ? `▼ もっと見る（全 ${otherFrames.length} 種類）`
                  : `▼ もっと見る（近日追加予定 ${otherFrames.length} 種類）`}
            </button>
          </div>
        )}

        {/* その他のフレーム（折りたたみ） */}
        {showAllFrames && otherFrames.length > 0 && (
          <>
            <div className="v2-frame-section-head is-secondary">
              <span className="v2-frame-section-label">
                {unlockAll ? "その他のデザイン" : "その他のデザイン（Coming soon）"}
              </span>
              <span className="v2-frame-section-divider" />
            </div>
            {!unlockAll && (
              <p className="v2-monitor-note">
                無料モニター中はサムネイルのみ公開中です。プロンプト作成はおすすめ4種類から選んでください。
              </p>
            )}
            <div className="v2-frame-list">
              {otherFrames.map((frame) => {
                const idx = frames.findIndex((f) => f.id === frame.id);
                return (
                  <FrameCard
                    key={frame.id}
                    frame={frame}
                    isSelected={unlockAll && selectedFrameId === frame.id}
                    isLocked={!unlockAll}
                    onSelect={() => (unlockAll ? onSelectFrame(frame.id) : undefined)}
                    onZoom={() => setZoomFrameIndex(idx)}
                  />
                );
              })}
            </div>
          </>
        )}
      </section>

      {/* RIGHT: フォーム＆プロンプト */}
      <section className="v2-design-right">
        {/* ── ② スタンプ何個作る？ ──────────── */}
        <div className="v2-section-head">
          <span className="v2-section-num">2</span>
          <span className="v2-section-title">画像は何分割にする？</span>
        </div>

        <div className="v2-form">
          <div className={`v2-form-row${guideStep === 2 ? " is-guide-target" : ""}`}>
            <div className="v2-form-radios" role="radiogroup" aria-label="グリッドサイズ切替">
              {([1, 2, 3, 4, 5] as GridSize[]).map((size) => (
                <label key={size} className={`v2-form-radio v2-gridsize-radio${gridSize === size ? " is-checked" : ""}`}>
                  <input
                    type="radio"
                    name="v2-grid-size"
                    value={size}
                    checked={gridSize === size}
                    onChange={() => onChangeGridSize(size)}
                  />
                  {size}×{size} <span className="v2-gridsize-radio-sub">{size * size}コマ</span>
                </label>
              ))}
            </div>
            <span className="v2-form-help">
              {gridSize === 1
                ? "1枚だけ確認・単品素材に使えます。"
                : gridSize === 2
                  ? "4枚の試作や表情ラフ向き。"
                  : gridSize === 3
                    ? "8個スタンプ＋予備1。綺麗に作れるしおすすめ ✨"
                    : gridSize === 4
                      ? "16個スタンプを作れます。"
                      : "25枚分の素材をまとめて作れます。絵文字や候補出し向き。"}
            </span>
          </div>
        </div>

        {/* ── ③ スタンプにしたいペットの種類は？ ──────── */}
        <div className="v2-section-head" style={{ marginTop: 12 }}>
          <span className="v2-section-num">3</span>
          <span className="v2-section-title">スタンプにしたいペットの種類は？</span>
        </div>

        <div className="v2-form">
          <div className={`v2-form-row${guideStep === 3 ? " is-guide-target" : ""}`}>
            <span className="v2-form-label">
              種類 <span className="v2-form-required">必須</span>
            </span>
            <div className="v2-form-radios" role="radiogroup" aria-required="true">
              {(["犬", "猫", "うさぎ", "ハムスター", "その他"] as PetKind[]).map((k) => (
                <label key={k} className={`v2-form-radio${petKind === k ? " is-checked" : ""}`}>
                  <input
                    type="radio"
                    name="v2-pet-kind"
                    value={k}
                    checked={petKind === k}
                    onChange={() => onChangePetKind(k)}
                  />
                  {k === "犬" ? "🐶 犬" : k === "猫" ? "🐱 猫" : k === "うさぎ" ? "🐰 うさぎ" : k === "ハムスター" ? "🐹 ハムスター" : "✨ その他"}
                </label>
              ))}
            </div>
            {petKind === "その他" && (
              <input
                className="v2-form-input"
                type="text"
                value={petKindOther}
                onChange={(e) => onChangePetKindOther(e.target.value)}
                placeholder="例：ハムスター / インコ / フェレット / モルモット"
                autoFocus
                style={{ marginTop: 6 }}
              />
            )}
          </div>

          <div className={`v2-form-row${guideStep === 4 ? " is-guide-target" : ""}`}>
            <div className="v2-form-label-row">
              <label className="v2-form-label" htmlFor="v2-stamp-texts">
                セリフを変えたい場合はこちら <span className="v2-form-optional">任意</span>
              </label>
              <button
                type="button"
                className="v2-text-reset"
                onClick={onResetStampTextDraft}
              >
                定番に戻す
              </button>
            </div>
            <textarea
              id="v2-stamp-texts"
              className="v2-form-textarea v2-stamp-textarea"
              value={stampTextDraft}
              onChange={(e) => onChangeStampTextDraft(e.target.value)}
              rows={4}
            />
            <span className="v2-form-help">
              1行1コマで反映します（{stampTextLineCount}/{stampTextTotal}行）。長いセリフは文字が破綻しやすいので、後入れか短い言葉がおすすめです。
            </span>
          </div>
        </div>

        {/* ── ④ プロンプトをコピー ──────────── */}
        <div className="v2-section-head" style={{ marginTop: 12 }}>
          <span className="v2-section-num">4</span>
          <span className="v2-section-title">プロンプトをコピー</span>
        </div>

        <div className={`v2-prompt-out${guideStep === 5 ? " is-guide-target" : ""}`}>
          <div className="v2-prompt-out-head">
            <span className="v2-prompt-out-title">あなた専用にカスタマイズ済み</span>
            <span className="v2-prompt-out-badge">文字入り{gridSize * gridSize}コマ</span>
          </div>

          <div className="v2-prompt-actions">
            <button
              type="button"
              className={`v2-btn-copy${copied ? " is-copied" : ""}`}
              onClick={onCopy}
              disabled={!canCopy}
            >
              {copied ? "✓ コピーしました" : "📋 プロンプトをコピー"}
            </button>
            <button
              type="button"
              className="v2-btn-copy is-secondary"
              onClick={onGoToStep2}
            >
              画像アップロードへ
            </button>
          </div>
        </div>

      </section>

      {/* フレーム拡大モーダル */}
      {zoomedFrame && zoomFrameIndex !== null && (
        <div
          className="v2-frame-zoom-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setZoomFrameIndex(null);
          }}
        >
          <div className="v2-frame-zoom-modal">
            <button
              type="button"
              className="v2-frame-zoom-close"
              onClick={() => setZoomFrameIndex(null)}
              aria-label="閉じる"
            >
              ×
            </button>

            <div className="v2-frame-zoom-image">
              {zoomedFrame.thumbSrc ? (
                <img
                  src={zoomedFrame.thumbSrc}
                  alt={zoomedFrame.name}
                  onError={(e) => {
                    const img = e.currentTarget;
                    img.style.display = "none";
                    const fb = img.parentElement?.querySelector(".v2-frame-zoom-image-fallback") as HTMLElement | null;
                    if (fb) fb.style.display = "block";
                  }}
                />
              ) : null}
              <span
                className="v2-frame-zoom-image-fallback"
                style={{ display: zoomedFrame.thumbSrc ? "none" : "block" }}
              >
                {zoomedFrame.emoji}
              </span>

              <button
                type="button"
                className="v2-frame-zoom-nav prev"
                onClick={() => setZoomFrameIndex((c) => (c === null ? null : (c - 1 + frames.length) % frames.length))}
                aria-label="前のデザイン"
              >
                ←
              </button>
              <button
                type="button"
                className="v2-frame-zoom-nav next"
                onClick={() => setZoomFrameIndex((c) => (c === null ? null : (c + 1) % frames.length))}
                aria-label="次のデザイン"
              >
                →
              </button>
              <span className="v2-frame-zoom-counter">
                {zoomFrameIndex + 1} / {frames.length}　← → / ESC
              </span>
            </div>

            <div className="v2-frame-zoom-info">
              <div className="v2-frame-zoom-name">{zoomedFrame.emoji} {zoomedFrame.name}</div>

              <div className="v2-frame-zoom-actions">
                <button
                  type="button"
                  className="v2-frame-zoom-btn"
                  onClick={() => setZoomFrameIndex(null)}
                >
                  閉じる
                </button>
                <button
                  type="button"
                  className="v2-frame-zoom-btn is-primary"
                  disabled={!canUseZoomedFrame}
                  onClick={() => {
                    if (!canUseZoomedFrame) return;
                    onSelectFrame(zoomedFrame.id);
                    setZoomFrameIndex(null);
                  }}
                >
                  {!canUseZoomedFrame
                    ? "Coming soon"
                    : selectedFrameId === zoomedFrame.id
                      ? "✓ 選択中"
                      : "✓ このデザインを選ぶ"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ======================================================================
// FrameCard ―  デザインルームの個別カード（おすすめ / その他共通）
// ======================================================================
interface FrameCardProps {
  frame: FrameDesign;
  isSelected: boolean;
  isLocked?: boolean;
  showStar?: boolean;
  onSelect: () => void;
  onZoom: () => void;
}

function FrameCard({ frame, isSelected, isLocked, showStar, onSelect, onZoom }: FrameCardProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-disabled={isLocked ? "true" : undefined}
      className={`v2-frame-card${isSelected ? " is-selected" : ""}${isLocked ? " is-locked" : ""}`}
      onClick={() => {
        if (!isLocked) onSelect();
      }}
      onKeyDown={(e) => {
        if (isLocked) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      <div className="v2-frame-card-thumb">
        {showStar && <span className="v2-frame-card-star">⭐</span>}
        {isLocked && <span className="v2-frame-card-coming">Coming soon</span>}
        {frame.thumbSrc ? (
          <img
            src={frame.thumbSrc}
            alt={frame.name}
            onError={(e) => {
              const img = e.currentTarget;
              const parent = img.parentElement;
              if (parent) {
                img.style.display = "none";
                parent.dataset.fallback = frame.emoji;
                parent.classList.add("is-emoji-fallback");
              }
            }}
          />
        ) : (
          <span className="v2-frame-card-thumb-emoji">{frame.emoji}</span>
        )}
        <button
          type="button"
          className="v2-frame-card-expand"
          aria-label={`${frame.name} を拡大表示`}
          onClick={(e) => {
            e.stopPropagation();
            onZoom();
          }}
        >
          🔍
        </button>
      </div>
      <span className="v2-frame-card-name">{frame.name}</span>
    </div>
  );
}
