import { useMemo, useState } from "react";
import { promptCategories, promptEntries } from "./promptsData";
import "./prompts.css";

const NOTE_MEMBERSHIP_URL = "https://note.com/aiko_animal/membership";

export default function PromptsPage() {
  const [activeCategory, setActiveCategory] = useState("すべて");
  const [query, setQuery] = useState("");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const visibleEntries = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return promptEntries
      .filter((entry) => {
        const categoryMatch = activeCategory === "すべて" || entry.category === activeCategory;
        if (!categoryMatch) return false;
        if (!normalizedQuery) return true;
        const haystack = [entry.title, entry.category, entry.summary, ...entry.tags].join(" ").toLowerCase();
        return haystack.includes(normalizedQuery);
      })
      // 新着順
      .sort((a, b) => new Date(b.publishAt).getTime() - new Date(a.publishAt).getTime());
  }, [activeCategory, query]);

  const handleCopy = async (key: string, body: string) => {
    try {
      await navigator.clipboard.writeText(body);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey((current) => (current === key ? null : current)), 2000);
    } catch {
      // クリップボードが使えない環境向けフォールバック
      const textarea = document.createElement("textarea");
      textarea.value = body;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey((current) => (current === key ? null : current)), 2000);
    }
  };

  return (
    <main className="prompts-page">
      <section className="prompts-hero">
        <p className="prompts-kicker">FREE PROMPT LIBRARY</p>
        <h1>うちのこ 無料プロンプト公開中</h1>
        <p>
          うちの子の写真1枚で作れる「魔法のプロンプト」を無料で公開しています。
          そのままコピーして、ChatGPTなどの画像生成に貼るだけ。週に数回、新作を追加していきます。
        </p>
        <div className="prompts-stats" aria-label="プロンプト数">
          <span>{promptEntries.length}件公開中</span>
          <span>すべて無料・コピペOK</span>
        </div>
      </section>

      <section className="prompts-toolbar">
        <label>
          <span>キーワード検索</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="例：七夕、水彩、月夜"
          />
        </label>
      </section>

      <nav className="prompts-filters" aria-label="プロンプトカテゴリ">
        {promptCategories.map((category) => (
          <button
            type="button"
            key={category}
            className={activeCategory === category ? "is-active" : ""}
            onClick={() => setActiveCategory(category)}
          >
            {category}
          </button>
        ))}
      </nav>

      <section className="prompts-list" aria-label="無料プロンプト一覧">
        {visibleEntries.map((entry) => (
          <article className="prompt-card" key={entry.key}>
            <div className="prompt-card-visual">
              {entry.sampleImage ? (
                <img src={entry.sampleImage} alt={`${entry.title}の作例`} loading="lazy" />
              ) : (
                <div className="prompt-card-visual-placeholder" aria-hidden="true">
                  ✨
                </div>
              )}
              <span className="prompt-card-badge">無料</span>
            </div>

            <div className="prompt-card-body">
              <p className="prompt-card-meta">
                <span>#{String(entry.index).padStart(2, "0")}</span>
                <span>{entry.category}</span>
              </p>
              <h2>{entry.title}</h2>
              <p className="prompt-card-summary">{entry.summary}</p>
              <ul className="prompt-card-tags">
                {entry.tags.map((tag) => (
                  <li key={tag}>#{tag}</li>
                ))}
              </ul>

              {entry.howto ? <p className="prompt-card-howto">💡 {entry.howto}</p> : null}

              <div className="prompt-card-prompt">
                <div className="prompt-card-prompt-head">
                  <span>プロンプト全文</span>
                  <button
                    type="button"
                    className={`prompt-copy-btn${copiedKey === entry.key ? " is-copied" : ""}`}
                    onClick={() => handleCopy(entry.key, entry.body)}
                  >
                    {copiedKey === entry.key ? "コピーしました！" : "コピーする"}
                  </button>
                </div>
                <pre className="prompt-card-text">{entry.body}</pre>
              </div>
            </div>
          </article>
        ))}
      </section>

      {visibleEntries.length === 0 && (
        <p className="prompts-empty">該当するプロンプトが見つかりませんでした。</p>
      )}

      <section className="prompts-upsell">
        <h2>もっと深く楽しみたい方へ</h2>
        <p>
          季節ごとの限定プロンプトや、作り方のコツをまとめた「レシピ集」はnoteメンバーシップで公開中。
          うちの子アートをもっと極めたい方はこちらもどうぞ。
        </p>
        <a href={NOTE_MEMBERSHIP_URL} target="_blank" rel="noreferrer">
          noteメンバーシップを見る
        </a>
      </section>
    </main>
  );
}
