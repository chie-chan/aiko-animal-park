import { useEffect, useMemo, useState } from "react";
import "./stamp-tool-v2.css";
import { FRAME_DESIGNS, type FrameDesign, type PetKind, type PetKindOrNone } from "./stamp-v2-frames";
import FloatingMascot from "./FloatingMascot";
import Step2Splitter from "./Step2Splitter";
import Step2ReorderEdit from "./Step2ReorderEdit";
import Step3Export from "./Step3Export";
import { centerImageContent, defaultCuts, type CellOffset, type GridSize, type SourceImage } from "./stamp-v2-split";

const MASCOT_TIPS: Record<number, string[]> = {
  1: [
    "まずは1×1〜5×5の画像をアップロード！白い背景なら自動で透過するよ。",
    "右の紫線をドラッグすると、分割位置を微調整できるよ。",
    "セルをクリックすると、その1枚を大きく拡大できるよ。",
    "サンプル画像で試したいときは、上のボタンから！",
    "隣のセルがちょっと写り込んでるときは、右下の「内側へ」スライダーを使ってね。",
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
// StampToolV2  ―  PC専用、3ステップ
//   Step 1: 画像を入れる（取り込み・自動分割）
//   Step 2: 位置調整・並び替え
//   Step 3: 書き出し（メイン/タブ → ZIP）
//   ＋ デザインルーム（番号外、右上ボタンから呼び出し）
// ======================================================================

type StepId = 1 | 2 | 3;
type DesignRoomGuideStep = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type BgPreview = "checker" | "white" | "black" | "pink" | "blue";

export default function StampToolV2() {
  const [step, setStep] = useState<StepId>(1);
  const [gridSize, setGridSize] = useState<GridSize>(4);

  // ── デザインルーム（モーダル） ──────────────────────
  const [showDesignRoom, setShowDesignRoom] = useState<boolean>(false);
  const [showStartSpotlight, setShowStartSpotlight] = useState<boolean>(true);
  const [showGuide, setShowGuide] = useState<boolean>(false);
  const [showNotice, setShowNotice] = useState<boolean>(false);
  const [designRoomGuideStep, setDesignRoomGuideStep] = useState<DesignRoomGuideStep>(0);
  const [selectedFrameId, setSelectedFrameId] = useState<string>(FRAME_DESIGNS[0].id);
  const [petKind, setPetKind] = useState<PetKindOrNone>(null);
  const [petKindOther, setPetKindOther] = useState<string>("");
  const [features, setFeatures] = useState("");
  const [copied, setCopied] = useState(false);

  const selectedFrame = useMemo(
    () => FRAME_DESIGNS.find((f) => f.id === selectedFrameId) ?? FRAME_DESIGNS[0],
    [selectedFrameId],
  );
  const generatedPrompt = useMemo(
    () => selectedFrame.buildPrompt({ petKind, petKindOther, features }, gridSize),
    [selectedFrame, petKind, petKindOther, features, gridSize],
  );
  // その他選択時は自由記述が必須
  const canCopy =
    petKind !== null && (petKind !== "その他" || petKindOther.trim().length > 0);

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
  }

  // ── Step 1（Splitter）の state ─────────────────────
  const [sheetSrc, setSheetSrc] = useState<string | null>(null);
  const [verticalCuts, setVerticalCuts] = useState<number[]>(() => defaultCuts(4));
  const [horizontalCuts, setHorizontalCuts] = useState<number[]>(() => defaultCuts(4));
  const [splitCells, setSplitCells] = useState<SourceImage[]>([]);

  // グリッドサイズ切替時に分割線をその初期値に戻す（セル数が変わるため）
  useEffect(() => {
    const d = defaultCuts(gridSize);
    setVerticalCuts(d);
    setHorizontalCuts(d);
  }, [gridSize]);

  // 画像が入った状態でグリッドサイズを切り替えたら、確認の上で編集状態をリセット
  function handleGridSizeChange(next: GridSize) {
    if (next === gridSize) return;
    if (splitCells.length > 0) {
      const cur = `${gridSize}×${gridSize}`;
      const tgt = `${next}×${next}`;
      const ok = window.confirm(
        `グリッドを ${cur} → ${tgt} に切り替えますか？\n\n画像は再分割され、並び替え・位置調整・メイン画像の選択はリセットされます。`,
      );
      if (!ok) return;
      setSelectedCellIndex(0);
      setCellOffsets({});
      setMainImageId("");
      setTabImageId("");
    }
    setGridSize(next);
  }

  // ── Step 2 & 3 共通 ───────────────────────────────
  const [selectedCellIndex, setSelectedCellIndex] = useState<number>(0);
  const [mainImageId, setMainImageId] = useState<string>("");
  const [tabImageId, setTabImageId] = useState<string>("");
  const [cellOffsets, setCellOffsets] = useState<Record<string, CellOffset>>({});
  const [bgPreview, setBgPreview] = useState<BgPreview>("checker");

  const canGoNext =
    step === 3 ? false :
    step === 1 ? splitCells.length > 0 :
    step === 2 ? splitCells.length > 0 :
    false;
  const hasOpenOverlay = showStartSpotlight || showGuide || showNotice || showDesignRoom;

  // 「次へ」：Step1から進むときに各セルの中身を自動で中央寄せしてから Step2 へ
  const [centering, setCentering] = useState<boolean>(false);
  async function handleNext() {
    if (step === 1 && splitCells.length > 0) {
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
    setStep((s) => Math.min(3, s + 1) as StepId);
  }

  function openDesignRoomWithGuide() {
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
          <span className="v2-topbar-kicker">UCHINOKO STAMP STUDIO</span>
          <span className="v2-topbar-name">うちのこスタンプ工房</span>
        </div>
        <nav className="v2-stepnav" aria-label="ステップナビ">
          <button
            type="button"
            className={`v2-stepnav-item${step === 1 ? " is-active" : step > 1 ? " is-done" : ""}`}
            onClick={() => setStep(1)}
          >
            <span className="v2-stepnum">1</span>
            画像を入れる
          </button>
          <button
            type="button"
            className={`v2-stepnav-item${step === 2 ? " is-active" : step > 2 ? " is-done" : ""}`}
            onClick={() => setStep(2)}
            disabled={splitCells.length === 0}
          >
            <span className="v2-stepnum">2</span>
            位置調整・並び替え
          </button>
          <button
            type="button"
            className={`v2-stepnav-item${step === 3 ? " is-active" : ""}`}
            onClick={() => setStep(3)}
            disabled={splitCells.length === 0}
          >
            <span className="v2-stepnum">3</span>
            書き出し
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
        <button
          type="button"
          className="v2-topbar-info-btn"
          onClick={() => setShowNotice(true)}
          title="ご利用の注意点"
        >
          ℹ️ 注意点
        </button>
        <button
          type="button"
          className="v2-topbar-guide-btn"
          onClick={() => {
            setShowStartSpotlight(false);
            setShowGuide(true);
          }}
          title="使い方を見る"
        >
          使い方
        </button>
        <div className={`v2-topbar-start${showStartSpotlight ? " is-spotlight-target" : ""}`}>
          <button
            type="button"
            className="v2-topbar-tool-btn"
            onClick={openDesignRoomWithGuide}
          >
            ✨ プロンプトを作る
          </button>
        </div>
      </header>

      <p className="v2-mobile-note">
        スマホでは確認用の表示です。ZIP保存や細かい位置調整はPCでの操作をおすすめします。
      </p>

      {/* ── メイン ── */}
      <main className="v2-main">
        {step === 1 && (
          <Step2Splitter
            sheetSrc={sheetSrc}
            setSheetSrc={setSheetSrc}
            verticalCuts={verticalCuts}
            setVerticalCuts={setVerticalCuts}
            horizontalCuts={horizontalCuts}
            setHorizontalCuts={setHorizontalCuts}
            splitCells={splitCells}
            setSplitCells={setSplitCells}
            gridSize={gridSize}
            onChangeGridSize={handleGridSizeChange}
          />
        )}

        {step === 2 && (
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
            gridSize={gridSize}
          />
        )}

        {step === 3 && (
          <Step3Export
            splitCells={splitCells}
            mainImageId={mainImageId}
            setMainImageId={setMainImageId}
            tabImageId={tabImageId}
            setTabImageId={setTabImageId}
            cellOffsets={cellOffsets}
            bgPreview={bgPreview}
            gridSize={gridSize}
          />
        )}
      </main>

      {/* ── 動かせるマスコット（Clippy風） ── */}
      {!hasOpenOverlay && <FloatingMascot tipsByStep={MASCOT_TIPS} currentStep={step} />}

      {/* ── 下部：アクションバー ── */}
      <footer className="v2-bottombar">
        <button
          type="button"
          className="v2-btn-secondary"
          disabled={step === 1}
          onClick={() => setStep((s) => Math.max(1, s - 1) as StepId)}
        >
          ← 戻る
        </button>
        <p className="v2-bottom-msg">
          {step === 1 && "白背景の画像でもOK！アップロードすると白い背景を自動で透過 → セルに自動分割します（透過はON/OFF切替可）"}
          {step === 2 && "並び順をドラッグで入れ替え＆クリックで選んだセルの位置を微調整"}
          {step === 3 && "メイン/タブ画像を選んでZIPでダウンロード → LINE Creatorsへ"}
        </p>
        <span className="v2-bottom-disclaimer">
          ※LINE審査の通過を保証するものではありません <a onClick={() => setShowNotice(true)}>詳しく</a>
        </span>
        {step < 3 ? (
          <button
            type="button"
            className="v2-btn-primary"
            disabled={!canGoNext || centering}
            onClick={handleNext}
          >
            {centering ? "中央寄せ中…" : "次へ →"}
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
      {showStartSpotlight && (
        <div className="v2-spotlight-overlay" onClick={() => setShowStartSpotlight(false)}>
          <div
            className="v2-spotlight-card"
            onClick={(event) => event.stopPropagation()}
          >
            <span>START</span>
            <strong>まずは「プロンプトを作る」から</strong>
            <p>
              光っている「プロンプトを作る」を押して、デザインとペットの種類を選びます。画像ができたらこの画面に戻ってアップロード。白い背景はこの工房が自動で透過し、コマごとに分割します（透過はON/OFFで切替できます）。
            </p>
          </div>
        </div>
      )}

      {/* ── 使い方ガイド ── */}
      {showGuide && (
        <StampGuideModal
          onClose={() => setShowGuide(false)}
          onOpenDesignRoom={() => {
            setShowGuide(false);
            openDesignRoomWithGuide();
          }}
          onGoToUpload={() => {
            setShowGuide(false);
            setStep(1);
          }}
        />
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
                うちのこスタンプ工房は、AIで作った1×1〜5×5画像を <strong>背景削除・分割・整形・スタンプ/絵文字ZIP化</strong> まで行うツールです。画像を生成したり、審査を代行したりするものではありません。
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
                Step1の「✨ 白い背景を自動で透過する」をONにすると、本ツールが<strong>白い背景を自動で透明化</strong>します（画像の縁から繋がった白だけを抜くので、目の白や白文字などの“内側の白”は残ります）。ベタ塗りの白背景＋はっきりした輪郭の絵で特にきれいに抜けます。
              </p>
              <p>
                自動透過がうまくいかない場合や、より精密に仕上げたい場合は、Canva・Photoshop・remove.bg などお手持ちのソフトで透過した画像をアップロードしてください（トグルをOFFにすればそのまま使えます）。
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
      {showDesignRoom && (
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
                features={features}
                onChangeFeatures={setFeatures}
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
                onChangeGridSize={handleGridSizeChange}
              />
              {designRoomGuideStep > 0 && (
                <DesignRoomCoach
                  step={designRoomGuideStep as Exclude<DesignRoomGuideStep, 0>}
                  onClose={() => setDesignRoomGuideStep(0)}
                  onNext={() =>
                    setDesignRoomGuideStep((current) =>
                      current >= 6 ? 0 : ((current + 1) as DesignRoomGuideStep),
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
// 使い方ガイド（図解モーダル）
// ======================================================================
interface StampGuideModalProps {
  onClose: () => void;
  onOpenDesignRoom: () => void;
  onGoToUpload: () => void;
}

function StampGuideModal({ onClose, onOpenDesignRoom, onGoToUpload }: StampGuideModalProps) {
  return (
    <div
      className="v2-guide-overlay"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="v2-guide-modal">
        <div className="v2-guide-bar">
          <div>
            <span>GUIDE ・ 💻 PC版</span>
            <strong>スタンプ工房の使い方</strong>
          </div>
          <button type="button" className="v2-designroom-modal-close" onClick={onClose} aria-label="閉じる">
            ×
          </button>
        </div>

        <div className="v2-guide-body">
          <section className="v2-guide-lead">
            <h3>流れは「作る → 入れる（自動透過＆分割）→ 書き出す」です</h3>
            <p>
              プロンプトで <strong>1×1〜5×5</strong> のスタンプ画像を作り、この画面にアップロード。
              <strong>背景はこの工房で自動削除・色指定削除・消しゴム修正</strong>し、コマごとに分割してZIPで書き出します。あとは <strong>LINE Creators Market（Web）</strong> に提出するだけ。
              （スマホで作りたい方は <a href="/stamp-mobile">スマホ版</a> へ）
            </p>
          </section>

          <div className="v2-guide-poster-list" aria-label="うちのこスタンプ工房の使い方ガイド">
            <figure className="v2-guide-poster">
              <img
                src="/stamp-v2-guide/stamp-v2-howto-1.png"
                alt="使い方 1ページ目。プロンプトを作り、ペット写真と一緒にChatGPTへ貼り付ける流れ"
              />
            </figure>
            <figure className="v2-guide-poster">
              <img
                src="/stamp-v2-guide/stamp-v2-howto-2.png"
                alt="使い方 2ページ目。背景を透過し、画像をアップロードして仕上げる流れ"
              />
            </figure>
          </div>

          <div className="v2-guide-note">
            <strong>📱 スマホで触っている方へ</strong>
            <p>
              このガイドはPC版（ZIPでまとめて書き出す用途）の説明です。スマホで作るなら <a href="/stamp-mobile">スマホ版（/stamp-mobile）</a> のほうがおすすめ。
              透過は不要・LINEスタンプメーカー（公式アプリ）が自動でやってくれるので、そのままの画像でアップロードできます。
            </p>
          </div>
        </div>

        <div className="v2-guide-foot">
          <button type="button" className="v2-guide-secondary" onClick={onOpenDesignRoom}>
            プロンプトを作る
          </button>
          <button type="button" className="v2-guide-primary" onClick={onGoToUpload}>
            画像を入れるへ
          </button>
        </div>
      </div>
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
    title: "特徴も入れてね",
    body: "毛色・耳・目・柄などを書くと、うちの子らしさが出やすいです。ここは任意です。",
  },
  5: {
    kicker: "STEP 5",
    title: "プロンプトをコピーしてね",
    body: "コピーしたプロンプトを、ペット画像と一緒にChatGPTへ貼り付けてください。",
  },
  6: {
    kicker: "STEP 6",
    title: "画像ができたらアップロード",
    body: "できた画像をこの画面に戻ってアップロード。白い背景なら自動で透過＆分割されます。",
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
  features: string;
  onChangeFeatures: (v: string) => void;
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
    features,
    onChangeFeatures,
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
    zoomedFrame && featuredFrames.some((frame) => frame.id === zoomedFrame.id),
  );

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
                : `▼ もっと見る（近日追加予定 ${otherFrames.length} 種類）`}
            </button>
          </div>
        )}

        {/* その他のフレーム（折りたたみ） */}
        {showAllFrames && otherFrames.length > 0 && (
          <>
            <div className="v2-frame-section-head is-secondary">
              <span className="v2-frame-section-label">その他のデザイン（Coming soon）</span>
              <span className="v2-frame-section-divider" />
            </div>
            <p className="v2-monitor-note">
              無料モニター中はサムネイルのみ公開中です。プロンプト作成はおすすめ4種類から選んでください。
            </p>
            <div className="v2-frame-list">
              {otherFrames.map((frame) => {
                const idx = frames.findIndex((f) => f.id === frame.id);
                return (
                  <FrameCard
                    key={frame.id}
                    frame={frame}
                    isSelected={false}
                    isLocked
                    onSelect={() => undefined}
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
            <span className="v2-form-help">
              AIが種類を取り違えないよう、必ず選んでください（猫の写真でも犬として描かれてしまうのを防ぎます）。
            </span>
          </div>

          <div className={`v2-form-row${guideStep === 4 ? " is-guide-target" : ""}`}>
            <label className="v2-form-label" htmlFor="v2-pet-features">
              特徴 <span className="v2-form-optional">任意</span>
            </label>
            <textarea
              id="v2-pet-features"
              className="v2-form-textarea"
              value={features}
              onChange={(e) => onChangeFeatures(e.target.value)}
              placeholder="例：白黒のパピヨンミックス、大きな耳、緑がかった目、ふわふわの被毛"
              rows={2}
            />
            <span className="v2-form-help">毛色・柄・耳の形・体型などを書くと再現度が上がります。</span>
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
          </div>

          <div className="v2-ai-hint">
            <span>おすすめ：</span>
            <span className="v2-ai-tag" style={{ background: "linear-gradient(135deg, #f7a8c8, #b89bea)", color: "#fff", border: "none", fontWeight: 900 }}>
              ⭐ ChatGPT
            </span>
          </div>
          <p className="v2-ai-note">
            このプロンプトはChatGPTでの仕上がりに合わせてチューニングしています。
          </p>
        </div>

        <div className={`v2-canva-box${guideStep === 6 ? " is-guide-target" : ""}`}>
          <div className="v2-canva-box-head">
            <span className="v2-canva-box-title">✨ 画像ができたら、この工房で仕上げよう</span>
          </div>
          <p style={{ fontSize: 12.5, color: "var(--v2-ink)", margin: "2px 0 8px", lineHeight: 1.7 }}>
            AIで作った1×1〜5×5画像を、そのままこの工房にアップロードするだけ。
            <strong>背景は自動削除・色指定・消しゴムで調整</strong>し、コマごとに分割してZIPで書き出します。
          </p>
          <ol className="v2-canva-box-steps">
            <li>AIで生成した1×1〜5×5画像をダウンロード</li>
            <li>この画面にアップロード → 背景削除＆コマごとに分割</li>
            <li>位置を整えて、メイン画像・タブ画像を選ぶ</li>
            <li>ZIPで書き出し → <strong>LINE Creators Market（Web）</strong>に提出</li>
          </ol>
          <div className="v2-canva-actions">
            <a
              className="v2-canva-link"
              href="https://creator.line.me/ja/"
              target="_blank"
              rel="noopener noreferrer"
            >
              🌐 LINE Creators Market
            </a>
            <button
              type="button"
              className="v2-canva-link is-primary"
              onClick={onGoToStep2}
            >
              → 画像をアップロードへ
            </button>
          </div>
          <p style={{ fontSize: 11, color: "var(--v2-muted)", margin: "10px 0 0", lineHeight: 1.65 }}>
            スマホで作りたい方は <a href="/stamp-mobile">スマホ版</a> へ（スマホ版は <strong>LINEスタンプメーカー（公式アプリ）</strong> の切り抜き機能で透過します）。自動透過がうまくいかない時は、Canva・Photoshop・remove.bg などで透過した画像をアップしてもOK。
          </p>
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
