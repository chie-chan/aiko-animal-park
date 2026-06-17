import { useEffect, useMemo, useState } from "react";

type PresentItem = {
  id: string;
  no: string;
  account: string;
  label: string;
  flower: string;
  proofImage: string;
  afterImage: string;
  downloadName: string;
};

type PresentManifest = {
  title: string;
  count: number;
  assets: {
    snsThumbnail: string;
    heroBackground?: string;
  };
  items: PresentItem[];
};

const LINE_URL = "https://lin.ee/hsoPQut";

export default function ThreadsPresentPage() {
  const [manifest, setManifest] = useState<PresentManifest | null>(null);
  const [error, setError] = useState("");
  const [activeItem, setActiveItem] = useState<PresentItem | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/threads-present/manifest.json")
      .then((response) => {
        if (!response.ok) {
          throw new Error(`manifest load failed: ${response.status}`);
        }
        return response.json();
      })
      .then((data: PresentManifest) => {
        if (alive) {
          setManifest(data);
        }
      })
      .catch(() => {
        if (alive) {
          setError("プレゼント画像の一覧を読み込めませんでした。少し時間をおいて再読み込みしてください。");
        }
      });

    return () => {
      alive = false;
    };
  }, []);

  const items = useMemo(() => manifest?.items ?? [], [manifest]);
  const thumbnail = manifest?.assets.snsThumbnail ?? "/threads-present/sns-thumbnail.jpg";
  const heroBackground = manifest?.assets.heroBackground ?? "/threads-present/hero-collage.jpg";

  return (
    <main className="threads-present-page">
      <section className="threads-present-hero" style={{ backgroundImage: `url(${heroBackground})` }}>
        <div className="threads-present-hero-overlay">
          <p className="threads-present-kicker">Threads monitor present</p>
          <h1>あいこからのプレゼント</h1>
          <p>
            プレゼント企画で作ったペットさんの水彩AIイラストをまとめました。該当するご本人様は、
            <span className="threads-present-nowrap">ダウンロードしてね。</span>
          </p>
          <div className="threads-present-actions">
            <a href="#present-list">一覧を見る</a>
            <a href={LINE_URL} target="_blank" rel="noreferrer">
              グッズ相談はLINEからどうぞ！
            </a>
          </div>
        </div>
      </section>

      <section id="present-list" className="threads-present-gallery" aria-label="プレゼント一覧">
        <div className="threads-present-heading">
          <p>Before / After</p>
          <h2>うちの子水彩AIイラスト一覧</h2>
          <span>{manifest ? `${manifest.count}件` : "読み込み中"}</span>
        </div>

        {error ? <p className="threads-present-error">{error}</p> : null}

        {!error && items.length === 0 ? (
          <p className="threads-present-loading">画像一覧を読み込んでいます。</p>
        ) : (
          <div className="threads-present-grid">
            {items.map((item) => (
              <article className="threads-present-card" key={item.id}>
                <button type="button" onClick={() => setActiveItem(item)} aria-label={`${item.account}のビフォーアフターを拡大`}>
                  <img src={item.proofImage} alt={`${item.account}のビフォーアフター`} loading="lazy" />
                </button>
                <div className="threads-present-card-body">
                  <div>
                    <strong>
                      {item.no}. @{item.account}
                    </strong>
                    <small>{item.flower} / WebPプレゼント</small>
                  </div>
                  <a href={item.afterImage} download={item.downloadName}>
                    完成した画像をDLする
                  </a>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="threads-present-note" aria-label="掲載と配布について">
        <h2>配布期間について</h2>
        <p>
          無料WebPはプレゼント企画用の配布データです。一定期間後はダウンロード用画像を外し、ビフォーアフターの制作事例だけ残す場合があります。
        </p>
        <p>
          高画質PNG、透過、ハンカチ・トートなどのグッズ化は、印刷向けに整えてからお渡しします。
        </p>
        <a href={LINE_URL} target="_blank" rel="noreferrer">
          グッズ相談はLINEからどうぞ！
        </a>
      </section>

      {activeItem ? (
        <div className="threads-present-lightbox" role="dialog" aria-modal="true" aria-label="ビフォーアフター拡大">
          <button type="button" className="threads-present-lightbox-close" onClick={() => setActiveItem(null)} aria-label="閉じる">
            ×
          </button>
          <div className="threads-present-lightbox-inner">
            <img src={activeItem.proofImage} alt={`${activeItem.account}のビフォーアフター拡大`} />
            <div>
              <strong>
                {activeItem.no}. @{activeItem.account}
              </strong>
              <a href={activeItem.afterImage} download={activeItem.downloadName}>
                完成した画像をDLする
              </a>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
