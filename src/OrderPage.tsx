export default function OrderPage() {
  return (
    <main className="park-gallery">
      <section className="park-gallery-hero">
        <p className="park-gallery-kicker">ORDER</p>
        <h1>ご注文方法</h1>
        <p>うちの子のお写真を送るだけで、世界に1つだけのアートやグッズに仕上げます。企画によっては500円から気軽にお試しいただけます。</p>
      </section>

      <section className="park-gallery-panel">
        <div className="park-section-head">
          <span>FLOW</span>
          <h2>制作の流れ</h2>
        </div>
        <div className="park-info-block">
          <ol className="park-info-steps">
            <li>
              <strong>公式LINEを友だち追加</strong>
              <small>ご相談やお写真のやり取りは公式LINEで承ります。</small>
              <div className="park-order-actions">
                <a className="park-line-cta" href="https://lin.ee/hsoPQut" target="_blank" rel="noopener noreferrer">
                  公式LINEを追加する
                </a>
              </div>
            </li>
            <li>
              <strong>ショップでご注文</strong>
              <small>BASE / minne / Creema から、お好きな商品を購入してください。</small>
              <div className="hub-chips">
                <a className="hub-chip" href="https://aikoanimal.base.shop/" target="_blank" rel="noopener noreferrer">
                  <img className="hub-chip-balloon" src="/assets/balloon.png" alt="" aria-hidden="true" />
                  BASE
                </a>
                <a className="hub-chip" href="https://minne.com/@aiko-animal" target="_blank" rel="noopener noreferrer">
                  <img className="hub-chip-balloon" src="/assets/balloon.png" alt="" aria-hidden="true" />
                  minne
                </a>
                <a className="hub-chip" href="https://www.creema.jp/c/aiko_animal" target="_blank" rel="noopener noreferrer">
                  <img className="hub-chip-balloon" src="/assets/balloon.png" alt="" aria-hidden="true" />
                  Creema
                </a>
              </div>
            </li>
            <li>
              <strong>LINEでお写真を送る</strong>
              <small>ご注文後、公式LINEでご注文確認メールの注文番号・お写真・ご希望のテイスト・お名前をお送りください。</small>
            </li>
            <li>
              <strong>ご納品</strong>
              <small>デジタル確認用は通常3〜7日を目安にお届けします。グッズは商品ごとの制作・発送日数をご確認ください。</small>
            </li>
          </ol>
        </div>
      </section>

      <section className="park-gallery-panel">
        <div className="park-section-head">
          <span>NOTES</span>
          <h2>ご利用前に</h2>
        </div>
        <div className="park-info-block">
          <ul className="park-info-list">
            <li>連絡時は <strong>購入場所と、ご注文確認メールに記載の注文番号</strong> をお知らせください。</li>
            <li>著作権侵害の可能性のあるものはお受けできません。</li>
            <li>
              <strong>完全再現は難しい場合があります。</strong>あらかじめご了承ください。
              <small>例：「耳の角度が〇度くらい」といった具体的・詳細なご指定など</small>
            </li>
          </ul>
          <p className="park-note-link">
            詳しい流れと注意事項は{" "}
            <a href="https://note.com/aiko_animal/n/n088b5dec33b4" target="_blank" rel="noopener noreferrer">
              note「うちの子AIスタジオ｜初めての方へ」
            </a>
            {" "}でもご紹介しています。
          </p>
        </div>
      </section>

    </main>
  );
}
