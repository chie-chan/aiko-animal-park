import { useMemo, useState } from "react";
import "./stamp-monitor.css";
import {
  FRAME_DESIGNS,
  getDefaultStampTextLines,
  type FrameDesign,
  type PetKind,
  type PetKindOrNone,
} from "./stamp-v2-frames";
import type { GridSize } from "./stamp-v2-split";

const GRID_SIZE = 4 as GridSize;
const EXPIRES_AT_MS = Date.UTC(2026, 5, 30, 11, 0); // 2026-06-30 20:00 JST
const EXPIRES_LABEL = "2026/6/30 20:00まで";

const MONITOR_FRAMES = ["simple", "cookie-cutter"] as const;

const PET_OPTIONS: Array<{ label: string; value: PetKind }> = [
  { label: "犬", value: "犬" },
  { label: "猫", value: "猫" },
  { label: "うさぎ", value: "うさぎ" },
  { label: "ハムスター", value: "ハムスター" },
  { label: "その他", value: "その他" },
];

function findFrame(id: string): FrameDesign {
  return FRAME_DESIGNS.find((frame) => frame.id === id) ?? FRAME_DESIGNS[0];
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
  }
}

export default function StampMonitorPromptPage() {
  const [selectedFrameId, setSelectedFrameId] = useState<(typeof MONITOR_FRAMES)[number]>("simple");
  const [petKind, setPetKind] = useState<PetKindOrNone>(null);
  const [petKindOther, setPetKindOther] = useState("");
  const [copied, setCopied] = useState(false);
  const expired = Date.now() >= EXPIRES_AT_MS;

  const selectedFrame = useMemo(() => findFrame(selectedFrameId), [selectedFrameId]);
  const stampTexts = useMemo(() => getDefaultStampTextLines(GRID_SIZE), []);
  const prompt = useMemo(
    () => selectedFrame.buildPrompt({ petKind, petKindOther, stampTexts }, GRID_SIZE),
    [selectedFrame, petKind, petKindOther, stampTexts],
  );

  const canCopy = !expired && petKind !== null && (petKind !== "その他" || petKindOther.trim().length > 0);

  async function handleCopy() {
    if (!canCopy) return;
    await copyToClipboard(prompt);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2200);
  }

  return (
    <main className="monitor-page">
      <section className="monitor-hero">
        <p className="monitor-kicker">MONITOR PROMPT</p>
        <h1>うちのこスタンプ工房 モニター用プロンプト</h1>
        <p>
          写真を添付したChatGPTに貼り付けて、白背景の4×4スタンプ画像を作ってください。
          できた画像はInstagramのDMに送ってください。
        </p>
        <div className={`monitor-deadline${expired ? " is-expired" : ""}`}>
          {expired ? "このモニター用リンクは受付終了しました" : `利用期限: ${EXPIRES_LABEL}`}
        </div>
      </section>

      {!expired ? (
        <section className="monitor-card">
          <div className="monitor-steps" aria-label="手順">
            <span>1. ペット種類を選ぶ</span>
            <span>2. デザインを選ぶ</span>
            <span>3. コピーしてChatGPTへ</span>
          </div>

          <div className="monitor-field">
            <h2>ペットの種類</h2>
            <div className="monitor-choice-row">
              {PET_OPTIONS.map((option) => (
                <button
                  type="button"
                  key={option.value}
                  className={`monitor-pill${petKind === option.value ? " is-active" : ""}`}
                  onClick={() => setPetKind(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            {petKind === "その他" ? (
              <input
                className="monitor-input"
                value={petKindOther}
                onChange={(event) => setPetKindOther(event.target.value)}
                placeholder="例: インコ、フェレット、モルモット"
              />
            ) : null}
          </div>

          <div className="monitor-field">
            <h2>デザインを選ぶ</h2>
            <div className="monitor-designs">
              {MONITOR_FRAMES.map((id) => {
                const frame = findFrame(id);
                return (
                  <button
                    type="button"
                    key={frame.id}
                    className={`monitor-design${selectedFrameId === id ? " is-active" : ""}`}
                    onClick={() => setSelectedFrameId(id)}
                  >
                    <img src={frame.thumbSrc} alt="" />
                    <span>{frame.name}</span>
                    <small>{frame.shortDesc}</small>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="monitor-field">
            <div className="monitor-prompt-head">
              <div>
                <h2>{selectedFrame.name}プロンプト</h2>
                <p>白背景・4×4・16枚用です。写真を添付したChatGPTに貼ってください。</p>
              </div>
              <button type="button" className="monitor-copy" onClick={handleCopy} disabled={!canCopy}>
                {copied ? "コピーしました" : "プロンプトをコピー"}
              </button>
            </div>
            {!canCopy ? (
              <p className="monitor-warning">先にペットの種類を選んでください。</p>
            ) : null}
            <textarea className="monitor-prompt" value={prompt} readOnly />
          </div>

          <div className="monitor-note">
            <strong>お願い</strong>
            <p>
              生成できた画像は、そのままDMに送ってください。こちらで切り分け、背景透過、
              位置調整、LINE用ZIP化まで仕上げます。
            </p>
          </div>
        </section>
      ) : (
        <section className="monitor-card">
          <h2>受付終了</h2>
          <p>モニター用プロンプトの公開期限が終了しました。</p>
        </section>
      )}
    </main>
  );
}
