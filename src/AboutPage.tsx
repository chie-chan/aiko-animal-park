export default function AboutPage() {
  return (
    <main className="park-gallery">
      <section className="park-gallery-hero">
        <p className="park-gallery-kicker">ABOUT</p>
        <h1>あいこについて</h1>
        <p>「うちのこAIスタジオ」を運営している、あいこです。</p>
      </section>

      <section className="park-gallery-panel">
        <div className="park-section-head">
          <span>PROFILE</span>
          <h2>プロフィール</h2>
        </div>
        <div className="park-info-block park-profile-block">
          <img className="park-profile-avatar" src="/aiko-profile.jpg" alt="あいこのアイコン" />
          <p>
            はじめまして、<strong>あいこ</strong>です🐾
            「うちのこAIスタジオ」では、あなたの愛犬・愛猫のお写真をもとに、
            最新のAI技術で<strong>世界に一枚だけの「うちのこアート」</strong>を制作しています。
          </p>
          <p>
            水彩・刺繍・ヴィクトリアン・和風など、いろんなテイストで、
            普段の写真とはひと味違う特別な姿に仕上げます。
          </p>
          <p>
            自分で作ってみたい方にも、プロにおまかせしたい方にも。
            看板犬と一緒に、ワクワクする作品をコツコツお届けしていきます🐾
          </p>
        </div>
      </section>

      <section className="park-gallery-panel">
        <div className="park-section-head">
          <span>SERVICES</span>
          <h2>できること</h2>
          <p>「自分で作る・一緒に作る・全部おまかせ」の3つの楽しみ方を用意しています。</p>
        </div>
        <div className="park-info-block">
          <ul className="park-info-list">
            <li>
              <strong>🎨 オーダーメイド制作</strong>
              <small>お写真を送るだけで、デジタルアート＋グッズに仕上げます（修正1回付き）</small>
            </li>
            <li>
              <strong>📖 魔法のレシピ（AIプロンプト）公開</strong>
              <small>noteで毎週新作プロンプトを配信。コピペで自分でも作れます</small>
            </li>
            <li>
              <strong>💻 Zoomオンラインレッスン</strong>
              <small>60分マンツーマン。「AIに興味あるけど難しそう…」という方も安心</small>
            </li>
            <li>
              <strong>🛍 グッズ販売（BASE / minne / Creema）</strong>
              <small>ハンカチ・トートバッグ・ポスター・シールなど、日常に寄り添うアイテムを展開</small>
            </li>
            <li>
              <strong>🌟 メンバーシップ</strong>
              <small>過去のプロンプト見放題、バリエーション付き、限定掲示板での交流</small>
            </li>
          </ul>
        </div>
      </section>

      <section className="park-gallery-panel">
        <div className="park-section-head">
          <span>POLICY</span>
          <h2>大切にしていること</h2>
        </div>
        <div className="park-info-block">
          <ul className="park-info-list">
            <li>
              <strong>「うちの子らしさ」を最優先</strong>
              <small>毛色・模様・耳の形・表情——その子だけの特徴を、丁寧に再現します</small>
            </li>
            <li>
              <strong>女性やAI初心者さんに寄り添う</strong>
              <small>「難しそう」を「楽しい」に変えるレシピと、わかりやすい言葉で発信しています</small>
            </li>
            <li>
              <strong>毎日コツコツ、新しいレシピを</strong>
              <small>季節やイベントに合わせて、何度でも楽しめるバリエーションを増やしていきます</small>
            </li>
          </ul>
        </div>
      </section>

      <section className="park-gallery-panel">
        <div className="park-section-head">
          <span>CONTACT</span>
          <h2>ご相談はこちら</h2>
          <p>ご注文前の相談や、お写真のやり取りは公式LINEからどうぞ。</p>
        </div>
        <div className="park-info-block park-contact-block">
          <a className="park-line-cta" href="https://lin.ee/hsoPQut" target="_blank" rel="noopener noreferrer">
            <span>公式LINEで相談する</span>
            <small>写真選び・作りたいグッズ・注文前の質問はこちら</small>
          </a>
        </div>
      </section>

      <section className="park-gallery-panel">
        <div className="park-section-head">
          <span>SNS</span>
          <h2>SNS</h2>
          <p>最新の作品はSNSで毎日更新中です。</p>
        </div>
        <div className="park-info-block">
          <ul className="park-info-list">
            <li>
              <a href="https://www.threads.net/@aiko.animal" target="_blank" rel="noopener noreferrer">
                Threads（@aiko.animal）
              </a>
              <small>活動場所・最新作品</small>
            </li>
            <li>
              <a href="https://www.instagram.com/aiko.animal/" target="_blank" rel="noopener noreferrer">
                Instagram（@aiko.animal）
              </a>
              <small>うちの子AIアートの作例</small>
            </li>
            <li>
              <a href="https://www.tiktok.com/@aiko.petflower" target="_blank" rel="noopener noreferrer">
                TikTok（@aiko.petflower）
              </a>
              <small>動画で楽しむうちの子AI</small>
            </li>
            <li>
              <a href="https://x.com/aiaiaigirl" target="_blank" rel="noopener noreferrer">
                X（@aiaiaigirl）
              </a>
              <small>コメントお気軽に</small>
            </li>
            <li>
              <a href="https://note.com/aiko_animal" target="_blank" rel="noopener noreferrer">
                note（@aiko_animal）
              </a>
              <small>AIプロンプト集を公開中</small>
            </li>
          </ul>
        </div>
      </section>

      <section className="park-gallery-panel">
        <div className="park-section-head">
          <span>SHOP</span>
          <h2>ショップ</h2>
          <p>制作したイラストはグッズにもしています。</p>
        </div>
        <div className="park-info-block">
          <ul className="park-info-list">
            <li>
              <a href="https://aikoanimal.base.shop/" target="_blank" rel="noopener noreferrer">
                BASE
              </a>
              <small>うちの子グッズ・オーダー</small>
            </li>
            <li>
              <a href="https://minne.com/@aiko-animal" target="_blank" rel="noopener noreferrer">
                minne
              </a>
              <small>ハンドメイドマーケット</small>
            </li>
            <li>
              <a href="https://www.creema.jp/c/aiko_animal" target="_blank" rel="noopener noreferrer">
                Creema（クリーマ）
              </a>
              <small>クリエイターズマーケット</small>
            </li>
          </ul>
        </div>
      </section>
    </main>
  );
}
