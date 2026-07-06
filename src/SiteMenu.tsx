import { useState } from "react";
import { NavLink } from "react-router-dom";
import "./site-menu.css";

type Item = { en: string; jp: string; to: string; external?: boolean };

const items: Item[] = [
  { en: "HOME", jp: "トップ", to: "/" },
  { en: "PROFILE", jp: "あいこのこと", to: "/about" },
  { en: "PROMPT", jp: "無料プロンプト", to: "/prompts" },
  { en: "GALLERY", jp: "さくひん", to: "/gallery?tab=catalog" },
  { en: "ORDER", jp: "ご注文方法", to: "/order" },
  { en: "NOTE", jp: "noteレシピ", to: "https://note.com/aiko_animal", external: true },
  { en: "CONTACT", jp: "制作依頼", to: "https://lin.ee/hsoPQut", external: true }
];

export default function SiteMenu() {
  const [open, setOpen] = useState(false);

  return (
    <aside className={`smenu${open ? " is-open" : ""}`}>
      <div className="smenu-bar">
        <NavLink to="/" className="smenu-logo" onClick={() => setOpen(false)}>
          <span className="smenu-dot">●</span>
          <span className="smenu-logo-text">
            うちの子AIスタジオ
            <small>aiko animal PARK</small>
          </span>
        </NavLink>
        <button
          type="button"
          className="smenu-burger"
          aria-label="メニュー"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <span />
          <span />
          <span />
        </button>
      </div>

      <nav className="smenu-nav" aria-label="メニュー">
        <ul className="smenu-list">
          {items.map((it) => (
            <li key={it.en}>
              {it.external ? (
                <a href={it.to} target="_blank" rel="noreferrer" onClick={() => setOpen(false)}>
                  <span className="smenu-en">{it.en}</span>
                  <span className="smenu-jp">{it.jp} ↗</span>
                </a>
              ) : (
                <NavLink
                  to={it.to}
                  end={it.to === "/"}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) => (isActive ? "is-current" : "")}
                >
                  <span className="smenu-en">{it.en}</span>
                  <span className="smenu-jp">{it.jp}</span>
                </NavLink>
              )}
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}
