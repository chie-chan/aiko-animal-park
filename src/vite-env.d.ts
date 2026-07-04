/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "1" のときスタンプ設計の全フレームを解禁（あいこ版）。通常ビルドは未設定＝公開版。 */
  readonly VITE_UNLOCK_ALL_FRAMES?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
