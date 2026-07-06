import { Navigate, NavLink, Route, Routes, useLocation } from "react-router-dom";
import GalleryPage from "./GalleryPage";
import HomePage from "./HomePage";
import SiteMenu from "./SiteMenu";
import StampToolV2 from "./StampToolV2";
import StampToolMobile from "./StampToolMobile";
import AboutPage from "./AboutPage";
import OrderPage from "./OrderPage";
import StyleZukanPage from "./StyleZukanPage";
import CandidateStudioPage from "./CandidateStudioPage";
import ThreadsPresentPage from "./ThreadsPresentPage";
import PromptsPage from "./PromptsPage";
import StampAnalyticsAdmin from "./StampAnalyticsAdmin";
import StampMonitorPromptPage from "./StampMonitorPromptPage";
import StampFactoryPage from "./StampFactoryPage";

// 旧PC版URLの一時再公開: 2026-07-09 23:59:59 JST まで。
const TEMP_STAMP_V2_OPEN_UNTIL_MS = Date.parse("2026-07-09T14:59:59.999Z");
const STAMP_TOOL_PATHS = new Set(["/stamp", "/stamp-v2", "/stamp-room", "/stamp-room-trial", "/stamp-mobile", "/stamp-monitor-20260629", "/stamp-factory"]);

export default function App() {
  const location = useLocation();
  const isStampToolRoute = STAMP_TOOL_PATHS.has(location.pathname);
  const isHome = location.pathname === "/";
  const chromeless = isStampToolRoute || isHome;
  const showMenu = !chromeless;
  const isTempStampV2Open = Date.now() <= TEMP_STAMP_V2_OPEN_UNTIL_MS;

  return (
    <div className={`app-shell standalone-tool-shell${isStampToolRoute ? " stamp-tool-only-shell" : ""}`}>
      {showMenu ? <SiteMenu /> : null}

      <div className={showMenu ? "site-main site-main--menu" : "site-main"}>

      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/gallery" element={<GalleryPage />} />
        <Route path="/gallery.html" element={<GalleryPage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/order" element={<OrderPage />} />
        <Route path="/prompts" element={<PromptsPage />} />
        <Route path="/threads-present" element={<ThreadsPresentPage />} />
        <Route path="/present" element={<Navigate to="/threads-present" replace />} />
        <Route path="/style-zukan" element={<StyleZukanPage />} />
        <Route path="/candidate-studio" element={<CandidateStudioPage />} />
        <Route path="/styles" element={<Navigate to="/style-zukan" replace />} />
        <Route path="/stamp" element={<Navigate to="/stamp-room" replace />} />
        <Route path="/stamp-room" element={<StampToolV2 />} />
        <Route path="/stamp-room-trial" element={<StampToolV2 mode="trial" />} />
        <Route path="/stamp-v2" element={isTempStampV2Open ? <StampToolV2 /> : <Navigate to="/gallery?tab=catalog" replace />} />
        <Route path="/stamp-v2-admin" element={<StampAnalyticsAdmin />} />
        <Route path="/stamp-mobile" element={<StampToolMobile />} />
        <Route path="/stamp-monitor-20260629" element={<StampMonitorPromptPage />} />
        {/* 社内量産ツール。本番ビルドでは非公開（ローカル dev のみ到達可）。
            公開ビルドで使う場合は StampV2PasswordGate でラップする。 */}
        {import.meta.env.DEV && (
          <Route path="/stamp-factory" element={<StampFactoryPage />} />
        )}
        <Route path="*" element={<Navigate to="/gallery?tab=catalog" replace />} />
      </Routes>

      {showMenu ? <footer className="site-footer">
        <a href="https://x.com/aiaiaigirl" target="_blank" rel="noreferrer">
          Created by aiko animal
        </a>
        <span>掲載画像の無断転載・二次利用はご遠慮ください。</span>
      </footer> : null}
      </div>
    </div>
  );
}
