import { NavLink } from "react-router-dom";
import SiteMenu from "./SiteMenu";
import "./home.css";

const LINE_URL = "https://lin.ee/hsoPQut";

const shops = [
  { href: "https://aikoanimal.base.shop/", label: "BASE", emoji: "🛍️" },
  { href: "https://minne.com/@aiko-animal", label: "minne", emoji: "🧵" },
  { href: "https://www.creema.jp/c/aiko_animal", label: "Creema", emoji: "🎁" }
];

const socials = [
  { href: "https://www.instagram.com/aiko.animal/", label: "Instagram", emoji: "📷" },
  { href: "https://www.tiktok.com/@aiko.petflower", label: "TikTok", emoji: "🎵" },
  { href: "https://note.com/aiko_animal", label: "note", emoji: "📝" },
  { href: "https://x.com/aiaiaigirl", label: "X", emoji: "✕" },
  { href: "https://www.threads.net/@aiko.animal", label: "Threads", emoji: "＠" }
];

export default function HomePage() {
  return (
    <div className="hub">
      <SiteMenu />

      {/* ===== ワンページ本文 ===== */}
      <div className="hub-content">
        {/* TOP / 表紙（1画面ぶん） */}
        <section id="top" className="hub-cover">
          <div className="hub-cover-inner">
            <div className="hub-top-figure">
              <img src="/assets/hero-balloon-pom.png" alt="バルーンを持ったうちの子" />
            </div>
            <div className="hub-top-main">
              <p className="hub-top-kicker">🎪 WELCOME TO</p>
              <h1 className="hub-top-title">うちの子AIスタジオ</h1>
              <p className="hub-top-sub">aiko animal PARK</p>
              <p className="hub-top-lead">
                うちの子が主役の、AIアートのスタジオです。
                <br />
                無料プロンプトも公開中。ゆっくり見ていってね。
              </p>
              <a className="hub-btn" href="#prompt">
                <img className="hub-btn-balloon" src="/assets/balloon.png" alt="" aria-hidden="true" />
                無料プロンプトを見る →
              </a>
            </div>
          </div>
          <a className="hub-cover-scroll" href="#profile">
            SCROLL ↓
          </a>
        </section>

        {/* PROFILE */}
        <section id="profile" className="hub-sec">
          <p className="hub-sec-en">PROFILE</p>
          <h2 className="hub-sec-title">あいこのこと</h2>
          <p className="hub-sec-body">
            看板犬「あいこ犬」と一緒に、うちの子を世界に一枚のアートに。
            AIで“可愛い”をコツコツお届けしています🐾
          </p>
          <NavLink className="hub-textlink" to="/about">
            くわしいプロフィール →
          </NavLink>
        </section>

        {/* PROMPT */}
        <section id="prompt" className="hub-sec hub-sec--tint">
          <p className="hub-sec-en">PROMPT</p>
          <h2 className="hub-sec-title">無料プロンプト</h2>
          <p className="hub-sec-body">
            写真1枚で作れる無料プロンプトを公開中。コピペして画像生成に貼るだけ。週に数回、新作を追加しています。
          </p>
          <div className="hub-prompt-preview">
            <img src="/assets/prompts/tanabata-moonlit.jpg" alt="七夕の月夜イラストの作例" />
            <div>
              <p className="hub-prompt-name">七夕の月夜イラスト（透明水彩）</p>
              <p className="hub-prompt-desc">月あかりの海の上でお願いごと。絵本のような一枚に。</p>
            </div>
          </div>
          <NavLink className="hub-btn" to="/prompts">
            <img className="hub-btn-balloon" src="/assets/balloon.png" alt="" aria-hidden="true" />
            プロンプト広場へ →
          </NavLink>
        </section>

        {/* GALLERY */}
        <section id="gallery" className="hub-sec">
          <p className="hub-sec-en">GALLERY</p>
          <h2 className="hub-sec-title">さくひん</h2>
          <p className="hub-sec-body">
            作れるアートのスタイルカタログと、実際の制作事例（ビフォーアフター）をご覧いただけます。
          </p>
          <div className="hub-links-row">
            <NavLink className="hub-textlink" to="/gallery?tab=catalog">
              スタイルカタログ →
            </NavLink>
            <NavLink className="hub-textlink" to="/gallery?tab=works">
              制作事例 →
            </NavLink>
          </div>
        </section>

        {/* SHOP */}
        <section id="shop" className="hub-sec hub-sec--tint">
          <p className="hub-sec-en">SHOP</p>
          <h2 className="hub-sec-title">ショップ</h2>
          <p className="hub-sec-body">グッズやデータはこちらのショップで販売中。</p>
          <div className="hub-chips">
            {shops.map((shop) => (
              <a className="hub-chip" href={shop.href} target="_blank" rel="noreferrer" key={shop.label}>
                <img className="hub-chip-balloon" src="/assets/balloon.png" alt="" aria-hidden="true" />
                {shop.label}
              </a>
            ))}
          </div>
        </section>

        {/* SNS */}
        <section id="sns" className="hub-sec">
          <p className="hub-sec-en">ACTIVITY</p>
          <h2 className="hub-sec-title">活動場所</h2>
          <p className="hub-sec-body">最新作やうらばなしは各SNSで発信中。フォローしてね！</p>
          <div className="hub-socials">
            {socials.map((sns) => (
              <a className="hub-social" href={sns.href} target="_blank" rel="noreferrer" key={sns.label}>
                <span className="hub-social-emoji">{sns.emoji}</span>
                <span>{sns.label}</span>
              </a>
            ))}
          </div>
        </section>

        {/* CONTACT */}
        <section id="contact" className="hub-sec hub-sec--tint">
          <p className="hub-sec-en">CONTACT</p>
          <h2 className="hub-sec-title">ご相談・ご依頼</h2>
          <p className="hub-sec-body">
            ご相談・お写真のやり取り、制作のご依頼は公式LINEからどうぞ。
          </p>
          <a className="hub-btn hub-btn--line" href={LINE_URL} target="_blank" rel="noreferrer">
            公式LINEで相談する
          </a>
        </section>

        <footer className="hub-foot">
          <p>またあそびに来てね🎡</p>
          <small>© aiko animal PARK</small>
        </footer>
      </div>
    </div>
  );
}
