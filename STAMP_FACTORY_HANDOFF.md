# スタンプ量産工房（StampFactory）MVP 引き継ぎ（Codexレビュー用）

> 作成：2026-06（Claude Code）
> 対象：Codex（レビュー担当）
> 範囲：新ツール `/stamp-factory` の新規追加。**新規ファイル中心**で、既存への変更は App.tsx のみ。

## 0. Codexレビュー反映（v2）
1回目レビューの指摘を反映済み：
- **[P1] 公開ガード**：`/stamp-factory` ルートを **`import.meta.env.DEV` ガード**にし、本番ビルドでは到達不可（catch-allでgalleryへ）。公開ビルドで使う場合は `StampV2PasswordGate` でラップ。
- **[P1] niche/audience反映**：`buildPrompt(input: PromptInput, usage)` に変更し、ニッチ名・ターゲットをプロンプトに反映（量産工房の核）。
- **[P2] キャラ反映の安全化**：スロットに `edited` フラグを追加。手編集枠は**上書きしない**＋確認ダイアログ。手編集枠は「手編集」バッジ表示。
- **[P2] import＆検証**：`⬆読込`ボタンでJSON台帳をimport（マージ）。`normalizeProjects()` で壊れ/旧スキーマを検証・補完（`edited`補完含む）し、画面が落ちないように。
- **[P2] P2仕様の具体化**：距離変換(EDT)アルゴリズム・Web Worker化・処理上限・比較サンプルを §5 に明記。

---

## 1. 背景・目的
あいこの受注/自主LINEスタンプ制作を「**ニッチ案件を積み上げて量産する**」ための社内ツール。
方針はユーザー確認済み：

- **完全無料（API課金ゼロ）**：画像生成は **ChatGPT(Pro) で手動**、台帳は **localStorage**、処理は **ブラウザ完結**。
- **ニッチ自動発見は後回し**（将来Phase）。MVPは「台帳＋プロンプト工場」。
- **仕上げ/書き出しは作り直さず、既存 `/stamp-room`(StampToolV2) を再利用**（透過・整列・main240/tab96・zip は既に存在）。

フロー：**案件登録(台帳) → 32枠プロンプト生成 → ChatGPTで画像生成(手動) → /stamp-roomで仕上げ・書き出し → ステータス更新で積み上げ**。

---

## 2. 変更ファイル一覧

### 新規（4ファイル）
- **`src/stampFactoryData.ts`**：型定義（`Project` / `StampSlot` / `ProjectStatus`）、ステータス定義、32枠の用途プリセット `USAGE_PRESETS`、プロンプト組立 `buildPrompt()` / `generateSlots()`、ニッチのシード `SEED_NICHES`。**副作用なしの純データ/関数**。
- **`src/stampFactoryStore.ts`**：localStorage台帳（`loadProjects` / `saveProjects` / `newId` / `exportProjectsJson`）。入出力を `Project[]` のロード/セーブに集約＝**将来 Cloudflare KV(Worker) へ差し替え可能**。
- **`src/StampFactoryPage.tsx`**：UI本体。案件ボード（一覧/追加/削除/ステータス集計）＋詳細（ニッチ/ターゲット/キャラ/メモ編集、32枠生成・編集・コピー、ステータス遷移、/stamp-roomへの導線）。
- **`src/stamp-factory.css`**：スタイル（クラスは `sf-` プレフィックスで衝突回避）。

### 既存への変更（最小）
- **`src/App.tsx`**：
  - `import StampFactoryPage from "./StampFactoryPage";`
  - `STAMP_TOOL_PATHS` に `"/stamp-factory"` 追加（ヘッダ/フッタ非表示のツールレイアウト適用）
  - `<Route path="/stamp-factory" element={<StampFactoryPage />} />` 追加
- ※ナビには未リンク（社内ツール扱い、`/stamp-v2-admin` 等と同様）。

---

## 3. 動作確認（実機 / vite dev）
`npm --prefix . run dev` → `http://localhost:<port>/stamp-factory` で確認済み：
- 初期表示OK（コンソールエラーなし）。
- 「＋新規案件」→ シードから案件追加 → 詳細フォーム表示。
- 「32枠を生成」→ 32スロット生成＋**localStorageに永続化**（`aiko_stamp_factory_projects_v1`）。
- ステータスチップ集計・カードの done/総数 表示・レスポンシブ（760px以下で1カラム）動作。
- `npx tsc --noEmit`：**新規ファイル＆App.tsx は型エラー0**（リポジトリ既存の型エラーは未変更・本変更と無関係）。

---

## 4. レビューで見てほしい点
1. **台帳がlocalStorageのみ**：単一ブラウザ依存。複数PC運用や消失リスクをどう扱うか（JSONバックアップ機能は実装済み。将来 `SNS_KV` 流の Worker+KV 化が妥当か）。
2. **プロンプト生成がテンプレ＋辞書ベース**（`buildPrompt`）：API不使用。出力品質が実用十分か、テンプレ文面の改善余地。
3. **32枠の用途プリセット**（`USAGE_PRESETS`）：定番として妥当か、カテゴリ追加/可変枠（8/16/24/40対応）にすべきか。
4. **/stamp-room への手渡し設計**：工房側で生成画像のドロップ→仕上げ→zipまで内包すべきか、現状の「別タブで既存ツール」で十分か。
5. **公開面の扱い**：`/stamp-factory` は本番でもルート到達可能（未リンク）。`StampV2PasswordGate` でゲートすべきか。
6. クラス名/命名規約・既存コンポーネントとの一貫性。

---

## 5. 未対応・今後（Phaseロードマップ）
- **P1（本MVP・完了）**：台帳＋プロンプト工場＋既存ツールへの導線。
- **P2（次）**：
  - **白フチ＆ダスト除去のJS(Canvas)移植**。今回のKMベイツ案件で確立したPython手法を移植。
    Canvasには距離変換/LANCZOS/UnsharpMaskが**そのまま無い**ので、以下の実装仕様で：
    - **白フチ（距離変換）**：`binary_dilation`反復は多角形のうねりが出るのでNG。
      ユークリッド距離変換(EDT)で全方位均一オフセットにする。Canvasに無いので
      **typed array上で2パスEDTを自前実装**（推奨：Felzenszwalb & Huttenlocher の
      1D下方包絡を縦横2回。`alpha>0.5`を内側マスク→ `dist[px]`＝最寄り内側までの距離）。
      `backing = clamp((FCHI_PX - dist)/AA + 0.5, 0, 1)`。**4x相当にアップサンプルして
      生成→370に縮小**でアンチエイリアス（スーパーサンプリング）。FCHI_PX≈2px・AA≈1.6px。
    - **ダスト除去**：alpha>8で**連結成分ラベリング（Union-Find or BFS）**→
      各成分の**最大alpha<約100の塊だけ透明化**（濃い正規パーツは残す）。
    - **高画質化**：`createImageBitmap`/Canvas`imageSmoothingQuality:'high'`で拡大＋
      **アンシャープマスク（ガウスぼかしとの差分合成）を自前実装**。
      ESRGANは線画を甘くするので不可（KMベイツ案件で検証済み）。
  - **性能**：1枚あたり数百万px×2パスEDT＋連結成分。32枚直列だとUIが固まるので
    **Web Worker（OffscreenCanvas）化**し、進捗をポーリング。**処理上限**＝入力長辺
    ~1500px程度に正規化してから処理（それ以上はダウンスケール）。
  - **品質保証**：移植時は**Python版出力との比較サンプル**（同一入力で白フチの滑らかさ・
    ダスト残り・線画シャープさを並べた画像）を `codex-checks/` に残すこと。
  - これらを `stamp-v2-split.ts` 系に足し、工房内で生成画像→仕上げ→zipまで一気通貫に。
  - ComfyUI(8188)連携でローカル自動生成オプション（ChatGPT手動と併用）。
  - ※ `stamp-v2` 周辺には既存のtsエラーあり（例 `Step3Export.tsx`/`StampToolV2.tsx`）。
    P2着手時に踏むので、まず該当箇所の型を整えてから拡張するのが安全。
- **P3**：①ニッチ自動発見（LINE STORE検索の件数カウント＋需要シグナル＝Googleトレンド等。**公式API無し・規約グレー・構造変更で壊れやすい**ので半自動＋人手前提）。
- **P4**：売上/公開URLの記録、ROIダッシュボード。

---

## 6. 設計判断メモ（Codexへ）
- **無料厳守**：ChatGPTの画像生成は**UI専用で無料APIが無い**（gpt-image-1は従量課金）。chatgpt.com自動操作は規約違反。→ 画像生成は手動が現実解。完全自動化したいならローカルSD/ComfyUIのみ。
- **再利用優先**：`Step3Export.tsx`(JSZip, MAIN 240/TAB 96)・`stamp-v2-split.ts`(makeImageTransparent/centerImageContent) が既にあるので、P2はこれらの拡張で。
- 関連ドキュメント：`STAMP_V2_HANDOFF.md` / `STAMP_V2_TRANSPARENCY_HANDOFF.md`。
