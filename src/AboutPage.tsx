export default function AboutPage() {
  return (
    <main className="park-gallery">
      <section className="park-gallery-hero">
        <p className="park-gallery-kicker">ABOUT</p>
        <h1>あいこについて</h1>
        <p>うちの子を、世界に一枚だけのアートに🐾</p>
      </section>

      <section className="park-gallery-panel">
        <div className="park-section-head">
          <span>PROFILE</span>
          <h2>プロフィール</h2>
        </div>
        <div className="park-info-block park-profile-block">
          <img className="park-profile-avatar" src="/assets/profile-aiko.png" alt="あいこのアイコン" />
          <p>はじめまして、<strong>あいこ</strong>です🐾</p>
          <p>看板犬「あいこ犬」と一緒に、ワクワクする作品をコツコツお届けしています。</p>
          <p>AIで“可愛い”を作るのが好き。その一心で制作中です。どうぞよろしくね。</p>
        </div>
      </section>

      <section className="park-gallery-panel">
        <div className="park-section-head">
          <span>SERVICES</span>
          <h2>できること</h2>
          <p>「自分で作る」も「おまかせ」も。</p>
        </div>
        <div className="park-info-block">
          <ul className="park-info-list">
            <li>
              <strong>🎨 オーダーメイド制作</strong>
              <small>写真を送るだけ。アート＋グッズに仕上げます（修正1回付き）</small>
            </li>
            <li>
              <strong>📖 無料プロンプト公開</strong>
              <small>noteで毎週配信。コピペで自分でも作れます</small>
            </li>
            <li>
              <strong>💻 Zoomレッスン</strong>
              <small>60分マンツーマン。はじめてさんも安心</small>
            </li>
            <li>
              <strong>🛍 グッズ販売</strong>
              <small>ハンカチ・トート・ポスター・シールなど</small>
            </li>
            <li>
              <strong>🌟 メンバーシップ</strong>
              <small>過去プロンプト見放題＋限定の交流</small>
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
              <small>毛色・模様・表情、その子だけの特徴を丁寧に</small>
            </li>
            <li>
              <strong>はじめてさんに寄り添う</strong>
              <small>「難しそう」を「楽しい」に変えます</small>
            </li>
            <li>
              <strong>コツコツ新作</strong>
              <small>季節やイベントに合わせて増やしています</small>
            </li>
          </ul>
        </div>
      </section>

      <section className="park-gallery-panel">
        <div className="park-section-head">
          <span>CONTACT</span>
          <h2>ご相談はこちら</h2>
          <p>ご相談・お写真のやり取りは公式LINEへ🐾</p>
        </div>
        <div className="park-info-block park-contact-block">
          <a className="park-line-cta" href="https://lin.ee/hsoPQut" target="_blank" rel="noopener noreferrer">
            公式LINEで相談する
          </a>
        </div>
      </section>

      <section className="park-gallery-panel">
        <div className="park-section-head">
          <span>SNS</span>
          <h2>活動場所</h2>
          <p>最新の作品は各SNSで更新中。</p>
        </div>
        <div className="hub-socials">
          <a className="hub-social" href="https://www.instagram.com/aiko.animal/" target="_blank" rel="noopener noreferrer">
            <span className="hub-social-emoji">📷</span>
            <span>Instagram</span>
          </a>
          <a className="hub-social" href="https://www.tiktok.com/@aiko.petflower" target="_blank" rel="noopener noreferrer">
            <span className="hub-social-emoji">🎵</span>
            <span>TikTok</span>
          </a>
          <a className="hub-social" href="https://note.com/aiko_animal" target="_blank" rel="noopener noreferrer">
            <span className="hub-social-emoji">📝</span>
            <span>note</span>
          </a>
          <a className="hub-social" href="https://x.com/aiaiaigirl" target="_blank" rel="noopener noreferrer">
            <span className="hub-social-emoji">✕</span>
            <span>X</span>
          </a>
          <a className="hub-social" href="https://www.threads.net/@aiko.animal" target="_blank" rel="noopener noreferrer">
            <span className="hub-social-emoji">＠</span>
            <span>Threads</span>
          </a>
        </div>
      </section>

      <section className="park-gallery-panel">
        <div className="park-section-head">
          <span>SHOP</span>
          <h2>ショップ</h2>
          <p>イラストはグッズにもしています。</p>
        </div>
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
      </section>
    </main>
  );
}
