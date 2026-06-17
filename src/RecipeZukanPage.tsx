import { useMemo, useState } from "react";
import { recipeZukanCategories, recipeZukanEntries } from "./recipeZukanData";
import "./recipe-zukan.css";

const MEMBERSHIP_URL = "https://note.com/aiko_animal/membership";

export default function RecipeZukanPage() {
  const [activeCategory, setActiveCategory] = useState("すべて");
  const [query, setQuery] = useState("");

  const visibleEntries = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return recipeZukanEntries.filter((entry) => {
      const categoryMatch = activeCategory === "すべて" || entry.category === activeCategory;
      if (!categoryMatch) return false;
      if (!normalizedQuery) return true;
      const haystack = [entry.title, entry.originalTitle, entry.category, entry.summary, ...entry.tags].join(" ").toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [activeCategory, query]);

  const paidCount = recipeZukanEntries.filter((entry) => entry.price > 0).length;
  const freeCount = recipeZukanEntries.filter((entry) => entry.price === 0).length;

  return (
    <main className="recipe-zukan-page">
      <section className="recipe-zukan-hero">
        <p className="recipe-zukan-kicker">AIKO'S RECIPE ARCHIVE</p>
        <h1>AIスタジオ noteレシピ図鑑</h1>
        <p>
          noteメンバーシップで公開している「魔法のレシピ」を、探しやすい見本帳として整理しました。
          ここでは雰囲気と入口だけをまとめ、プロンプト全文はnoteで読めるようにしています。
        </p>
        <div className="recipe-zukan-stats" aria-label="レシピ数">
          <span>{recipeZukanEntries.length}件</span>
          <span>メンバー限定 {paidCount}件</span>
          <span>無料公開 {freeCount}件</span>
        </div>
      </section>

      <section className="recipe-zukan-toolbar">
        <label>
          <span>キーワード検索</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="例：花冠、刺繍、スノードーム"
          />
        </label>
        <a href={MEMBERSHIP_URL} target="_blank" rel="noreferrer">
          noteメンバーシップを見る
        </a>
      </section>

      <nav className="recipe-zukan-filters" aria-label="レシピカテゴリ">
        {recipeZukanCategories.map((category) => (
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

      <section className="recipe-zukan-grid" aria-label="noteレシピ一覧">
        {visibleEntries.map((entry) => (
          <article className="recipe-card" key={entry.key}>
            <a className="recipe-card-image" href={entry.url} target="_blank" rel="noreferrer">
              <img src={entry.eyecatch} alt={`${entry.title}のサムネイル`} loading="lazy" />
              <span className={entry.price > 0 ? "is-paid" : "is-free"}>{entry.price > 0 ? "メンバー限定" : "無料"}</span>
            </a>
            <div className="recipe-card-body">
              <p className="recipe-card-meta">
                <span>#{String(entry.index).padStart(2, "0")}</span>
                <span>{entry.category}</span>
              </p>
              <h2>{entry.title}</h2>
              <p>{entry.summary}</p>
              <ul>
                {entry.tags.map((tag) => (
                  <li key={tag}>{tag}</li>
                ))}
              </ul>
              <div className="recipe-card-footer">
                <span>{entry.likeCount} likes</span>
                <a href={entry.url} target="_blank" rel="noreferrer">
                  noteで見る
                </a>
              </div>
            </div>
          </article>
        ))}
      </section>

      {visibleEntries.length === 0 && (
        <p className="recipe-zukan-empty">該当するレシピが見つかりませんでした。</p>
      )}
    </main>
  );
}
