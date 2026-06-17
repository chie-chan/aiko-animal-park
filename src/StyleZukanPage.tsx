import { useMemo, useState } from "react";
import { styleZukanEntries, type StyleZukanEntry } from "./styleZukanData";
import "./style-zukan.css";

const DEFAULT_REQUEST_URL = "https://aikoanimal.base.shop/";
const ALL_CATEGORY = "すべて";
const CATEGORY_GROUPS = [
  { label: ALL_CATEGORY },
  { label: "水彩", categories: ["水彩"] },
  { label: "刺繍", categories: ["刺繍"] },
  { label: "ステンドグラス", categories: ["ステンドグラス"] },
  { label: "スノードーム", categories: ["スノードーム"] },
  { label: "フローラル・記念日", categories: ["お花", "記念日"] },
  { label: "3D・カフェ・スイーツ", categories: ["カフェ・バー", "スイーツ"] },
  { label: "レトロ・ポップ", categories: ["レトロ", "ポップ"] },
  { label: "ファンタジー・着せ替え", categories: ["着せ替え", "ファンタジー", "リラックス"] },
  { label: "クラフト・シルエット・モダン", categories: ["クラフト", "シルエット", "モダン"] },
] as const;
const displayCategories = CATEGORY_GROUPS.map((group) => group.label);
const overviewCategories = CATEGORY_GROUPS.filter((group) => group.label !== ALL_CATEGORY).map((group) => group.label);
const WATERCOLOR_SUBCATEGORIES = [
  "ふんわり水彩",
  "コテージコア水彩",
  "ノスタルジック水彩",
  "お花・ボタニカル水彩",
  "スイーツ水彩",
  "絵本・物語水彩",
] as const;
const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  [ALL_CATEGORY]: "登録済みのスタイルをまとめて見たい時はこちらから確認できます。迷ったら水彩から見るのがおすすめです。",
  水彩: "やわらかく上品で、ハンカチ・ポスター・トートなどのグッズに合わせやすい雰囲気です。",
  刺繍: "手仕事感と特別感があり、記念日やギフト向けの見せ方に向いています。",
  ステンドグラス: "光と色の印象が強く、飾って楽しむアート寄りの仕上がりです。",
  スノードーム: "季節感や物語性を出しやすく、かわいい世界観を作りたい時に向いています。",
  "フローラル・記念日": "誕生日、母の日、季節のお花など、思い出を残すデザインに使いやすいカテゴリです。",
  "3D・カフェ・スイーツ": "クリームソーダやケーキ、カフェ風の小物感など、見て楽しい世界観です。",
  "レトロ・ポップ": "色や形の遊びが強く、SNSで目を引く明るい仕上がりに向いています。",
  "ファンタジー・着せ替え": "衣装や物語性を楽しみたい時の、変身系・世界観重視のカテゴリです。",
  "クラフト・シルエット・モダン": "クラフト感、シルエット、すっきりしたアート感を出したい時に向いています。",
};

function buildRequestUrl(entry: StyleZukanEntry) {
  if (entry.requestUrl) return entry.requestUrl;
  return `${DEFAULT_REQUEST_URL}?style=${encodeURIComponent(entry.id)}`;
}

function getGroupEntries(groupLabel: string) {
  const group = CATEGORY_GROUPS.find((item) => item.label === groupLabel);
  if (!group || group.label === ALL_CATEGORY) return styleZukanEntries;

  if ("ids" in group) {
    const entriesById = new Map(styleZukanEntries.map((entry) => [entry.id, entry]));
    return group.ids.map((id) => entriesById.get(id)).filter((entry): entry is StyleZukanEntry => Boolean(entry));
  }

  const categories = new Set(group.categories);
  return styleZukanEntries.filter((entry) => categories.has(entry.category));
}

function cleanDisplayTags(items: string[]) {
  return items.filter((item) => !/^\{[A-Z0-9_]+\}$/.test(item.trim()));
}

export default function StyleZukanPage() {
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [activeSubCategory, setActiveSubCategory] = useState<string | null>(null);
  const [openEntry, setOpenEntry] = useState<StyleZukanEntry | null>(null);

  const visibleEntries = useMemo(() => {
    if (!activeCategory) return [];
    const entries = getGroupEntries(activeCategory);
    if (activeCategory === "水彩" && activeSubCategory) {
      return entries.filter((entry) => entry.subCategory === activeSubCategory);
    }
    return entries;
  }, [activeCategory, activeSubCategory]);

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const group of CATEGORY_GROUPS) {
      counts.set(group.label, getGroupEntries(group.label).length);
    }
    return counts;
  }, []);

  const watercolorSubCategoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    const watercolors = getGroupEntries("水彩");
    for (const label of WATERCOLOR_SUBCATEGORIES) {
      counts.set(label, watercolors.filter((entry) => entry.subCategory === label).length);
    }
    return counts;
  }, []);

  function selectCategory(category: string | null) {
    setActiveCategory(category);
    setActiveSubCategory(null);
  }

  return (
    <main className="style-zukan-page">
      <section className="style-zukan-hero">
        <p className="style-zukan-kicker">UCHINOKO AI STYLE BOOK</p>
        <h1>うちの子AIスタイル図鑑</h1>
        <p>
          うちの子をどんな世界観で仕上げられるか、作例から選べるスタイル図鑑です。
          気になる雰囲気を見つけたら、そのまま制作依頼の参考にできます。
        </p>
        <p className="style-zukan-rescue">
          迷ったら「水彩」がおすすめです。やわらかく上品で、ハンカチ・ポスター・トートなどのグッズに合わせやすい定番です。
        </p>
      </section>

      <section className="style-zukan-guide" aria-label="使い方">
        <article>
          <b>1. 大カテゴリを選ぶ</b>
          <span>まずは「すべて」で全体を見て、気になる画風があれば水彩・刺繍などに絞ります。</span>
        </article>
        <article>
          <b>2. 作例を比べる</b>
          <span>カテゴリの中から、うちの子に合いそうなスタイルを探します。</span>
        </article>
        <article>
          <b>3. 依頼に使う</b>
          <span>スタイル番号を添えて相談すると、制作イメージが伝わりやすくなります。</span>
        </article>
      </section>

      <nav className="style-zukan-filters" aria-label="スタイルカテゴリ">
        {displayCategories.map((category) => {
          const isOverview = category === ALL_CATEGORY;
          const isActive = isOverview ? !activeCategory : activeCategory === category;
          return (
            <button
              key={category}
              type="button"
              className={isActive ? "is-active" : ""}
              aria-pressed={isActive}
              onClick={() => selectCategory(isOverview ? null : category)}
            >
              {category}
              <span>{categoryCounts.get(category) || 0}</span>
            </button>
          );
        })}
      </nav>

      {!activeCategory && (
        <section className="style-category-overview" aria-label="大カテゴリ一覧">
          {overviewCategories.map((category) => {
            const entries = getGroupEntries(category);
            const previewEntries = entries.slice(0, 3);
            return (
              <button
                key={category}
                type="button"
                className="style-category-card"
                onClick={() => selectCategory(category)}
              >
                <span className="style-category-card-count">{entries.length}件</span>
                <div className="style-category-card-images" aria-hidden="true">
                  {previewEntries.map((entry) => (
                    <img key={entry.id} src={entry.image} alt="" loading="lazy" />
                  ))}
                </div>
                <div className="style-category-card-body">
                  <h2>{category}</h2>
                  <p>{CATEGORY_DESCRIPTIONS[category]}</p>
                </div>
              </button>
            );
          })}
        </section>
      )}

      {activeCategory && (
        <>
      {activeCategory === "水彩" && (
        <section className="style-subcategory-panel" aria-label="水彩の小分類">
          <div>
            <p className="style-subcategory-kicker">WATERCOLOR TYPES</p>
            <h2>水彩の中から雰囲気を選ぶ</h2>
            <p>定番のふんわり系、赤毛のアン風のコテージコア、ノスタルジック水彩など、同じ水彩でもタッチを分けて増やせるようにしています。</p>
          </div>
          <div className="style-subcategory-buttons">
            <button
              type="button"
              className={!activeSubCategory ? "is-active" : ""}
              onClick={() => setActiveSubCategory(null)}
            >
              水彩すべて
              <span>{categoryCounts.get("水彩") || 0}</span>
            </button>
            {WATERCOLOR_SUBCATEGORIES.map((label) => {
              const count = watercolorSubCategoryCounts.get(label) || 0;
              return (
                <button
                  key={label}
                  type="button"
                  className={activeSubCategory === label ? "is-active" : ""}
                  onClick={() => setActiveSubCategory(label)}
                  disabled={count === 0}
                >
                  {label}
                  <span>{count}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      <div className="style-zukan-summary">
        <p>
          {activeSubCategory || activeCategory}を{visibleEntries.length}件表示中
          <span>全{styleZukanEntries.length}件から選べます</span>
        </p>
        <div className="style-zukan-summary-actions">
          <button type="button" onClick={() => selectCategory(null)}>
            カテゴリに戻る
          </button>
        </div>
      </div>

      <section className="style-zukan-grid" aria-label="スタイル一覧">
        {visibleEntries.map((entry) => (
          <article className="style-card" key={entry.id}>
            <button
              type="button"
              className="style-card-image-button"
              onClick={() => setOpenEntry(entry)}
              aria-label={`${entry.title}の詳細を見る`}
            >
              <img src={entry.image} alt={`${entry.title}の作例`} loading="lazy" />
              <span>{entry.id}</span>
            </button>
            <div className="style-card-body">
              <p className="style-card-category">{entry.subCategory || entry.category}</p>
              <h2>{entry.title}</h2>
              <p>{entry.description}</p>
              <ul>
                {entry.tags.map((tag) => (
                  <li key={tag}>{tag}</li>
                ))}
              </ul>
              <div className="style-card-actions">
                <a href={buildRequestUrl(entry)} target="_blank" rel="noreferrer">
                  このスタイルで相談する
                </a>
              </div>
            </div>
          </article>
        ))}
      </section>
        </>
      )}

      <section className="style-zukan-bottom">
        <div>
          <p className="style-zukan-bottom-label">選び方に迷ったら</p>
          <h2>好きな作例を2〜3個送ってください</h2>
          <p>
            「この色味が好き」「この雰囲気でグッズにしたい」など、ざっくりでも大丈夫です。
            うちの子の写真に合う方向性を一緒に整理します。
          </p>
        </div>
        <div>
          <p className="style-zukan-bottom-label">制作依頼へ</p>
          <h2>画像生成からグッズ化まで相談できます</h2>
          <p>
            AI画像の仕上げ、比率調整、印刷用チェック、LINEスタンプ用の整理など、
            完成まで必要なところだけお手伝いできます。
          </p>
        </div>
      </section>

      {openEntry && (
        <StyleDialog
          entry={openEntry}
          onClose={() => setOpenEntry(null)}
          requestUrl={buildRequestUrl(openEntry)}
        />
      )}
    </main>
  );
}

function StyleDialog({
  entry,
  onClose,
  requestUrl,
}: {
  entry: StyleZukanEntry;
  onClose: () => void;
  requestUrl: string;
}) {
  const recipePreview = cleanDisplayTags(entry.recipePreview);
  const goodFor = cleanDisplayTags(entry.goodFor);

  return (
    <div className="style-prompt-dialog" role="dialog" aria-modal="true" aria-labelledby="style-prompt-title" onClick={onClose}>
      <section className="style-prompt-panel" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="style-prompt-close" onClick={onClose} aria-label="閉じる">
          ×
        </button>
        <div className="style-prompt-head">
          <img src={entry.image} alt="" />
          <div>
            <p>{entry.id}</p>
            <h2 id="style-prompt-title">{entry.title}</h2>
            <span>{entry.recommendedFor}</span>
          </div>
        </div>
        <div className="style-recipe-detail">
          <section>
            <h3>雰囲気</h3>
            <ul>
              {recipePreview.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
          <section>
            <h3>向いている使い道</h3>
            <ul>
              {goodFor.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        </div>
        <p className="style-prompt-note">
          掲載画像はスタイル見本です。実際の制作では、お客様のうちの子写真・名前・匹数・希望比率に合わせて調整します。
        </p>
        <div className="style-prompt-actions">
          <a href={requestUrl} target="_blank" rel="noreferrer">
            このスタイルで相談する
          </a>
        </div>
      </section>
    </div>
  );
}
