import { useEffect, useMemo, useRef, useState } from "react";
import {
  STATUS_FLOW,
  STATUS_LABELS,
  generateSlots,
  SEED_NICHES,
  buildPrompt,
} from "./stampFactoryData";
import type { Project, ProjectStatus, StampSlot } from "./stampFactoryData";
import {
  loadProjects,
  saveProjects,
  newId,
  exportProjectsJson,
  importProjectsJson,
} from "./stampFactoryStore";
import "./stamp-factory.css";

// スタンプ量産工房（StampFactory）
// 「案件ボード(積み上げ台帳) ＋ プロンプト工場」。
// 画像生成は ChatGPT(Pro) で手動、仕上げ/書き出しは既存 /stamp-room を再利用。

function makeProject(seedIndex = 0): Project {
  const seed = SEED_NICHES[seedIndex] ?? SEED_NICHES[0];
  const now = Date.now();
  return {
    id: newId(),
    niche: seed.niche,
    audience: seed.audience,
    character: seed.character,
    note: "",
    status: "idea",
    slots: [],
    createdAt: now,
    updatedAt: now,
  };
}

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // 古い環境フォールバック
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  }
}

export default function StampFactoryPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const loaded = loadProjects();
    setProjects(loaded);
    if (loaded.length > 0) setSelectedId(loaded[0].id);
  }, []);

  function persist(next: Project[]) {
    setProjects(next);
    saveProjects(next);
  }

  const selected = useMemo(
    () => projects.find((p) => p.id === selectedId) ?? null,
    [projects, selectedId],
  );

  function updateSelected(patch: Partial<Project>) {
    if (!selected) return;
    const next = projects.map((p) =>
      p.id === selected.id ? { ...p, ...patch, updatedAt: Date.now() } : p,
    );
    persist(next);
  }

  function addProject() {
    const p = makeProject(projects.length % SEED_NICHES.length);
    const next = [p, ...projects];
    persist(next);
    setSelectedId(p.id);
  }

  function removeProject(id: string) {
    if (!window.confirm("この案件を削除しますか？（戻せません）")) return;
    const next = projects.filter((p) => p.id !== id);
    persist(next);
    setSelectedId(next[0]?.id ?? null);
  }

  function regenerateSlots() {
    if (!selected) return;
    if (
      selected.slots.length > 0 &&
      !window.confirm("32枠を再生成すると、現在のプロンプト編集は上書きされます。よいですか？")
    )
      return;
    updateSelected({ slots: generateSlots(selected), status: "prompt" });
  }

  function setSlot(slotId: number, patch: Partial<StampSlot>) {
    if (!selected) return;
    const slots = selected.slots.map((s) => (s.id === slotId ? { ...s, ...patch } : s));
    updateSelected({ slots });
  }

  function refreshSlotPrompts() {
    if (!selected) return;
    const editedCount = selected.slots.filter((s) => s.edited).length;
    if (
      editedCount > 0 &&
      !window.confirm(
        `手編集した ${editedCount} 枠はそのまま残し、未編集の枠だけキャラ/ニッチ設定を反映します。よいですか？`,
      )
    )
      return;
    const slots = selected.slots.map((s) =>
      s.edited ? s : { ...s, prompt: buildPrompt(selected, s.usage) },
    );
    updateSelected({ slots });
  }

  function triggerImport() {
    importInputRef.current?.click();
  }

  async function handleImportFile(file: File) {
    const text = await file.text();
    const incoming = importProjectsJson(text);
    if (!incoming) {
      window.alert("読み込めませんでした（JSON形式が不正です）。");
      return;
    }
    // id一致は上書き、無いものは追加（マージ）
    const map = new Map(projects.map((p) => [p.id, p]));
    for (const p of incoming) map.set(p.id, p);
    const merged = Array.from(map.values());
    persist(merged);
    if (incoming[0]) setSelectedId(incoming[0].id);
    window.alert(`${incoming.length}件を読み込みました（マージ）。`);
  }

  async function copyAllPrompts() {
    if (!selected) return;
    const text = selected.slots
      .map((s) => `${String(s.id).padStart(2, "0")} [${s.category}] ${s.usage}\n${s.prompt}`)
      .join("\n\n");
    await copyText(text);
    flashCopied("all");
  }

  function flashCopied(key: string) {
    setCopied(key);
    window.setTimeout(() => setCopied((c) => (c === key ? null : c)), 1200);
  }

  function downloadJsonBackup() {
    const blob = new Blob([exportProjectsJson(projects)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `stamp-factory-backup-${projects.length}件.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const statusCounts = useMemo(() => {
    const counts: Record<ProjectStatus, number> = {
      idea: 0,
      prompt: 0,
      generating: 0,
      finished: 0,
      exported: 0,
      submitted: 0,
      published: 0,
    };
    for (const p of projects) counts[p.status] += 1;
    return counts;
  }, [projects]);

  const doneCount = selected ? selected.slots.filter((s) => s.done).length : 0;

  return (
    <div className="sf-shell">
      <header className="sf-header">
        <h1>スタンプ量産工房 <span className="sf-beta">MVP</span></h1>
        <p className="sf-sub">
          ニッチ案件を積み上げ → 32枠プロンプトを生成 → ChatGPTで画像生成 → 仕上げ・書き出しは
          <a href="/stamp-room" target="_blank" rel="noreferrer">「スタンプ仕上げ室」</a>へ。
        </p>
        <div className="sf-statusbar">
          {STATUS_FLOW.map((s) => (
            <span key={s} className={`sf-chip sf-chip-${s}`}>
              {STATUS_LABELS[s]}：<b>{statusCounts[s]}</b>
            </span>
          ))}
        </div>
      </header>

      <div className="sf-body">
        {/* 左：案件ボード */}
        <aside className="sf-board">
          <div className="sf-board-head">
            <button className="sf-btn sf-btn-primary" onClick={addProject}>＋ 新規案件</button>
            <button className="sf-btn" onClick={downloadJsonBackup} title="台帳のJSONバックアップ">⬇ 台帳</button>
            <button className="sf-btn" onClick={triggerImport} title="JSON台帳を読み込み（マージ）">⬆ 読込</button>
            <input
              ref={importInputRef}
              type="file"
              accept="application/json,.json"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleImportFile(f);
                e.target.value = "";
              }}
            />
          </div>
          {projects.length === 0 && <p className="sf-empty">案件がありません。「＋ 新規案件」から追加してね。</p>}
          <ul className="sf-list">
            {projects.map((p) => (
              <li
                key={p.id}
                className={`sf-card${p.id === selectedId ? " is-active" : ""}`}
                onClick={() => setSelectedId(p.id)}
              >
                <div className="sf-card-title">{p.niche || "（無題）"}</div>
                <div className="sf-card-meta">
                  <span className={`sf-pill sf-chip-${p.status}`}>{STATUS_LABELS[p.status]}</span>
                  <span className="sf-card-count">{p.slots.filter((s) => s.done).length}/{p.slots.length || 32}</span>
                </div>
              </li>
            ))}
          </ul>
        </aside>

        {/* 右：案件詳細 ＋ プロンプト工場 */}
        <main className="sf-detail">
          {!selected && <p className="sf-empty">左から案件を選ぶか、新規作成してね。</p>}
          {selected && (
            <>
              <div className="sf-fields">
                <label>ニッチ名
                  <input value={selected.niche} onChange={(e) => updateSelected({ niche: e.target.value })} />
                </label>
                <label>ターゲット
                  <input value={selected.audience} onChange={(e) => updateSelected({ audience: e.target.value })} />
                </label>
                <label className="sf-field-wide">キャラ設定（プロンプトのベース）
                  <input value={selected.character} onChange={(e) => updateSelected({ character: e.target.value })} />
                </label>
                <label className="sf-field-wide">メモ（参考検索・件数・売上など）
                  <textarea value={selected.note} onChange={(e) => updateSelected({ note: e.target.value })} rows={2} />
                </label>
              </div>

              <div className="sf-status-row">
                <span className="sf-status-label">ステータス：</span>
                {STATUS_FLOW.map((s) => (
                  <button
                    key={s}
                    className={`sf-status-btn${selected.status === s ? " is-on" : ""}`}
                    onClick={() => updateSelected({ status: s })}
                  >
                    {STATUS_LABELS[s]}
                  </button>
                ))}
                <button className="sf-btn sf-btn-danger" onClick={() => removeProject(selected.id)}>削除</button>
              </div>

              <div className="sf-factory-head">
                <h2>プロンプト工場（32枠）</h2>
                <div className="sf-factory-actions">
                  <button className="sf-btn sf-btn-primary" onClick={regenerateSlots}>
                    {selected.slots.length ? "32枠を再生成" : "32枠を生成"}
                  </button>
                  {selected.slots.length > 0 && (
                    <>
                      <button className="sf-btn" onClick={refreshSlotPrompts} title="キャラ設定を全枠のプロンプトに反映">キャラ反映</button>
                      <button className="sf-btn" onClick={copyAllPrompts}>{copied === "all" ? "コピー済✓" : "全部コピー"}</button>
                    </>
                  )}
                </div>
              </div>

              {selected.slots.length > 0 && (
                <p className="sf-progress">生成チェック：{doneCount} / {selected.slots.length}</p>
              )}

              <ul className="sf-slots">
                {selected.slots.map((s) => (
                  <li key={s.id} className={`sf-slot${s.done ? " is-done" : ""}`}>
                    <div className="sf-slot-head">
                      <label className="sf-slot-check">
                        <input type="checkbox" checked={s.done} onChange={(e) => setSlot(s.id, { done: e.target.checked })} />
                        <b>{String(s.id).padStart(2, "0")}</b>
                        <span className="sf-slot-cat">{s.category}</span>
                        <span className="sf-slot-usage">{s.usage}</span>
                      </label>
                      <button
                        className="sf-btn sf-btn-mini"
                        onClick={() => { void copyText(s.prompt).then(() => flashCopied(`s${s.id}`)); }}
                      >
                        {copied === `s${s.id}` ? "✓" : "コピー"}
                      </button>
                    </div>
                    <textarea
                      className="sf-slot-prompt"
                      value={s.prompt}
                      rows={2}
                      onChange={(e) => setSlot(s.id, { prompt: e.target.value, edited: true })}
                    />
                    {s.edited && <span className="sf-slot-edited">手編集</span>}
                  </li>
                ))}
              </ul>

              <div className="sf-handoff">
                <h3>画像を作ったら…</h3>
                <ol>
                  <li>各プロンプトを ChatGPT(Pro) に貼って画像生成 → 白背景PNGで保存（チェックを付けて管理）</li>
                  <li>生成画像を <a href="/stamp-room" target="_blank" rel="noreferrer">スタンプ仕上げ室</a> で透過・整列・<b>main(240×240)/tab(96×74)・zip書き出し</b></li>
                  <li>このカードのステータスを「書き出し済 → 申請済 → 公開」に更新して積み上げ</li>
                </ol>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
