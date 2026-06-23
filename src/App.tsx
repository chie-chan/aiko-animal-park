import { Navigate, NavLink, Route, Routes, useLocation } from "react-router-dom";
import GalleryPage from "./GalleryPage";
import StampToolV2 from "./StampToolV2";
import StampToolMobile from "./StampToolMobile";
import AboutPage from "./AboutPage";
import OrderPage from "./OrderPage";
import StyleZukanPage from "./StyleZukanPage";
import CandidateStudioPage from "./CandidateStudioPage";
import ThreadsPresentPage from "./ThreadsPresentPage";
import StampAnalyticsAdmin from "./StampAnalyticsAdmin";

const NOTE_HOME_URL = "https://note.com/aiko_animal";

export default function App() {
  const location = useLocation();
  const galleryTab = new URLSearchParams(location.search).get("tab") === "works" ? "works" : "catalog";
  const isGalleryRoute = location.pathname === "/gallery" || location.pathname === "/gallery.html";

  return (
    <div className="app-shell standalone-tool-shell">
      <header className="site-header standalone-tool-header">
        <NavLink to="/gallery?tab=catalog" className="brand-link" aria-label="うちの子AIスタジオ">
          <img className="brand-mark" src="/aiko-dog-icon.jpeg" alt="" />
          <span>
            <span className="brand-name">うちの子AIスタジオ</span>
            <span className="brand-sub">aiko animal PARK</span>
          </span>
        </NavLink>

        <nav className="site-nav compact-nav" aria-label="メニュー">
          <NavLink to="/gallery?tab=works" className={() => `nav-link${isGalleryRoute && galleryTab === "works" ? " is-active" : ""}`}>
            制作事例
          </NavLink>
          <NavLink to="/threads-present" className={({ isActive }) => `nav-link${isActive ? " is-active" : ""}`}>
            プレゼント企画
          </NavLink>
          <NavLink to="/gallery?tab=catalog" className={() => `nav-link${isGalleryRoute && galleryTab === "catalog" ? " is-active" : ""}`}>
            スタイルカタログ
          </NavLink>
          <a className="nav-link" href={NOTE_HOME_URL} target="_blank" rel="noreferrer">
            noteレシピ
          </a>
          <NavLink to="/order" className={({ isActive }) => `nav-link${isActive ? " is-active" : ""}`}>
            ご注文方法
          </NavLink>
          <NavLink to="/about" className={({ isActive }) => `nav-link${isActive ? " is-active" : ""}`}>
            あいこについて
          </NavLink>
          <a className="shop-link" href="https://lin.ee/hsoPQut" target="_blank" rel="noreferrer">
            制作依頼
          </a>
        </nav>
      </header>

      <Routes>
        <Route path="/" element={<Navigate to="/gallery?tab=catalog" replace />} />
        <Route path="/gallery" element={<GalleryPage />} />
        <Route path="/gallery.html" element={<GalleryPage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/order" element={<OrderPage />} />
        <Route path="/threads-present" element={<ThreadsPresentPage />} />
        <Route path="/present" element={<Navigate to="/threads-present" replace />} />
        <Route path="/style-zukan" element={<StyleZukanPage />} />
        <Route path="/candidate-studio" element={<CandidateStudioPage />} />
        <Route path="/styles" element={<Navigate to="/style-zukan" replace />} />
        <Route path="/stamp" element={<Navigate to="/stamp-v2" replace />} />
        <Route path="/stamp-v2" element={<StampToolV2 />} />
        <Route path="/stamp-v2-admin" element={<StampAnalyticsAdmin />} />
        <Route path="/stamp-mobile" element={<StampToolMobile />} />
        <Route path="*" element={<Navigate to="/gallery?tab=catalog" replace />} />
      </Routes>

      <footer className="site-footer">
        <a href="https://x.com/aiaiaigirl" target="_blank" rel="noreferrer">
          Created by aiko animal
        </a>
        <span>掲載画像の無断転載・二次利用はご遠慮ください。</span>
      </footer>
    </div>
  );
}
