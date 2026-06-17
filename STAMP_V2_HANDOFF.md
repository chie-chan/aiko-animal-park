# うちのこスタンプ仕上げ室 V2  ―  引き継ぎドキュメント

> 最終更新：2026-05-11
> このドキュメントは Codex（後任エージェント）への引き継ぎ用です。
> デプロイ／デバッグ／追加開発の際は最初にここを読んでください。

---

## 1. プロジェクト概要

### サービス名
**うちのこスタンプ仕上げ室 V2**

### 目的
AIで生成した4×4グリッド画像（うちの子のLINEスタンプ原画）を取り込み、**16枚に分割→並び替え・位置微調整→LINE Creators Market 提出用ZIPに書き出す**ためのPC専用ツール。

### note商材として
- ユーザーは「パソコン苦手な人」が中心
- 「無料ユーザーでもできる」「運用コスト 0 円」の方針
- 3ステップで完結する設計
- ChatGPT推奨（プロンプトをChatGPTでチューニング済み）

### URL
- ローカル開発：`http://127.0.0.1:5175/stamp-v2`
- 本番デプロイ後：（Firebase Hosting）`/stamp-v2`
- 旧版（互換のため残置）：`/stamp` （StampTool.tsx）
- ※どちらも `import.meta.env.DEV` ガードで開発時のみ有効になっている設定（[App.tsx](src/App.tsx) 確認）

---

## 2. 技術スタック

| | バージョン |
|---|---|
| React | 18.2 |
| TypeScript | 5.3 |
| Vite | 5.0 |
| React Router | 7.14 |
| JSZip | 3.10 |
| ホスティング | Firebase Hosting |

### 開発コマンド
```bash
npm install        # 依存解決
npm run dev        # 開発サーバー（127.0.0.1:5175）
npm run build      # 本番ビルド → dist/
npm run preview    # ビルド結果のローカルプレビュー
```

### デプロイコマンド
```bash
npm run build
firebase deploy --only hosting
```
※ Firebase CLIへのログインが必要：`firebase login`

---

## 3. ファイル構造（V2関連のみ）

```
src/
├── App.tsx                  ← ルーティング。/stamp-v2 を追加済み
├── StampToolV2.tsx          ← 親コンポーネント・全state・モーダル類
├── Step2Splitter.tsx        ← Step 1（画像取り込み・分割）  ※ファイル名は旧名のまま
├── Step2ReorderEdit.tsx     ← Step 2（並び替え＋位置調整）
├── Step3Export.tsx          ← Step 3（メイン/タブ・ZIP書き出し）
├── stamp-v2-frames.ts       ← 16種類のフレームデザイン定義＋プロンプト生成
├── stamp-v2-split.ts        ← 分割・PNG出力ユーティリティ
└── stamp-tool-v2.css        ← V2 専用スタイル（v2- プレフィックス）

public/
└── stamp-v2-thumbs/         ← 各フレームのサムネイル画像
    ├── sticker-solid.png
    ├── postage-stamp.png
    ├── polaroid.png
    ├── round-postmark.png
    ├── ticket-stub.png
    ├── masking-tape.png
    ├── candy-wrapper.png
    ├── donut.png
    ├── cookie-cutter.png
    ├── jam-jar-label.png
    ├── pin-badge.png
    ├── vintage-tv.png
    ├── window-frame.png
    ├── antique-mirror.png
    ├── playing-card.png
    └── flower-wreath.png
```

### ⚠️ 命名の罠
`Step2Splitter.tsx` というファイル名だが、**現在は Step 1（画像取り込み）として使用**している。
これは元の構成で Step 2 だったため。リネームは未実施（risk: import チェーン全部更新）。

ファイル名 vs 役割の対応表：

| ファイル | 実際のステップ番号 | 役割 |
|---|---|---|
| `Step2Splitter.tsx` | **Step 1** | 画像を入れる |
| `Step2ReorderEdit.tsx` | **Step 2** | 位置調整・並び替え |
| `Step3Export.tsx` | **Step 3** | 書き出し |

---

## 4. UI 構成

### 全体レイアウト
- 上部：`v2-topbar`（タイトル＋ステップナビ＋ℹ️注意点ボタン＋✨プロンプトを作るボタン）
- 中央：`v2-main`（現在のステップを表示）
- 下部：`v2-bottombar`（戻る／次へボタン＋常時表示の免責文）
- ステップ表示は3段：1 画像を入れる / 2 位置調整・並び替え / 3 書き出し

### Step 1（画像を入れる）
- 透過済みPNGをドロップ／ファイル選択
- アップロード後、**16セルのライブプレビュー**（CSSで都度切り抜き）が左パネル
- 右パネルに**小さい分割線調整プレビュー**＋分割線の数値表示
- セルをクリックで**拡大モーダル**（← → でセル切替、ESC で閉じる）
- 自動分割：アップロード時 & ドラッグ確定時に `splitSheetImage` 実行 → `splitCells` 更新

### Step 2（位置調整・並び替え）
- 左：4×4の並び替えグリッド
  - HTML5 DnDで順番入れ替え
  - クリックでセル選択（紫枠）
  - M/Tフラグ表示
- 右：選択中セルの位置調整パネル
  - 大きいプレビューを**直接ドラッグ**で位置調整
  - 矢印ボタン（↑↓←→、1.5%刻み）
  - リセット（0）
  - 現在のオフセット数値表示

### Step 3（書き出し）
- 左：16枚の最終確認グリッド（読み取り専用、M/Tフラグ付き）
- 右：**[メイン画像] / [タブ画像] のタブ切替**
  - 各タブでプレビュー＋16サムネ列で選択
- 右下：ZIPダウンロードボタン
- 出力仕様：
  - スタンプ本体：320×320 透過PNG × 16（`01.png`〜`16.png`）
  - main.png：240×240 透過PNG
  - tab.png：96×74 透過PNG

### 番外：デザインルーム（モーダル）
- 右上「✨ プロンプトを作る」ボタンで開く
- 16種類のフレームから選んでプロンプトを生成・コピー
- ペットの種類（犬／猫／うさぎ／その他＋自由記述）と特徴（任意）を入力
- フレームカードに🔍ボタン（ホバーで出現） → 拡大モーダル（← → で切替）
- ChatGPT 推奨を明示
- Canva等の透過案内付き

### 番外：注意点モーダル
- 右上「ℹ️ 注意点」ボタンで開く
- LINE審査の保証なし、著作権・肖像権、生成AIの規約、透過処理、免責事項を明記
- フッターからも「詳しく」リンクで開ける

---

## 5. State 管理

すべての状態は **`StampToolV2.tsx`（親）で一元管理**。子コンポーネントは props で受け取る。

### 主要state

| state | 型 | 用途 |
|---|---|---|
| `step` | `1 \| 2 \| 3` | 現在のステップ |
| `sheetSrc` | `string \| null` | アップロードした4×4画像（dataURL） |
| `verticalCuts` | `number[]` | 縦分割線3本の位置（% 値、default [25,50,75]） |
| `horizontalCuts` | `number[]` | 横分割線3本の位置 |
| `splitCells` | `SourceImage[]` | 分割後の16枚（id, name, src） |
| `selectedCellIndex` | `number` | Step 2 で選択中のセル |
| `mainImageId` | `string` | メイン画像のセルID |
| `tabImageId` | `string` | タブ画像のセルID |
| `cellOffsets` | `Record<string, CellOffset>` | セルID紐付けの位置オフセット |
| `petKind` | `"犬" \| "猫" \| "うさぎ" \| "その他" \| null` | デザインルーム |
| `petKindOther` | `string` | その他選択時の自由記述 |
| `features` | `string` | 特徴の任意入力 |
| `selectedFrameId` | `string` | デザインルームで選んだフレームID |
| `showDesignRoom` | `boolean` | デザインルームモーダルの表示 |
| `showNotice` | `boolean` | 注意点モーダルの表示 |

### state の永続化
**localStorage 等への保存は未実装**。リロードで全消去される。
要望があれば `splitCells` 等を localStorage に保存する実装を追加可能。

---

## 6. 16種類のフレームデザイン

[stamp-v2-frames.ts](src/stamp-v2-frames.ts) で定義。各フレームに以下を持つ：

```ts
interface FrameDesign {
  id: string;                                  // 一意ID
  name: string;                                // 表示名（例：「シール風」）
  emoji: string;                               // フォールバック絵文字
  thumbSrc?: string;                           // public/ 配下のサムネ画像パス
  tag: string;                                 // タグ（現UIには非表示）
  shortDesc: string;                           // 短い説明（現UIには非表示）
  detail: string;                              // 詳細説明（現UIには非表示）
  buildPrompt: (input: PromptInput) => string; // プロンプト生成関数
}
```

### 一覧（全18種類）
⭐ = おすすめ（デザインルームで上部に表示、それ以外は「もっと見る」で展開）

1. ⭐ シール風（sticker-solid）
2. 切手シール風（postage-stamp）
3. ポラロイド風（polaroid）
4. ⭐ 消印スタンプ風（round-postmark）
5. チケット半券風（ticket-stub）
6. マスキングテープ風（masking-tape）
7. キャンディラッパー風（candy-wrapper）
8. ドーナツ風（donut）
9. ⭐ クッキー型風（cookie-cutter）
10. 果物フレーム（fruit-frame）
11. ジャム瓶ラベル風（jam-jar-label）
12. 缶バッジ風（pin-badge）
13. ブラウン管TV風（vintage-tv）
14. ⭐ 窓枠風（window-frame）
15. アンティーク鏡風（antique-mirror）
16. トランプカード風（playing-card）
17. 海フレーム（sea-creatures）
18. お花リース風（flower-wreath）

`FrameDesign` の `featured: true` でマーク。おすすめのセレクションは [stamp-v2-frames.ts](src/stamp-v2-frames.ts) で変更可能。

### プロンプトの作り方
共通ブロック（`commonGridBlock` / `commonPosesBlock` / `commonForbiddenBlock` / `petBlock` / `buildFramePrompt`）と、各フレーム固有の指示・パレットを組み合わせて1つのプロンプト文字列を生成。
ペットの種類が「その他」の場合は `petKindOther` の自由記述がプロンプトに流し込まれる。

---

## 7. 設計判断のメモ（直近の方針）

### 透過処理について
- **ツールは透過処理しない**。ユーザーがCanva/remove.bg/Photoshop 等で先に背景透過してからアップロードする前提
- 理由：精度・コスト・保守性 すべてユーザーの透過ソフトに任せた方が良いと判断
- Step 1 では「透過済みPNG前提」と注意書きを表示

### 「外側余白」スライダーは削除済み・「セル内余白カット」は復活
- 「外側余白」は分割線の直接ドラッグで代替できるため削除
- 「セル内余白カット（trimGutter）」は復活（2026-05-11）：AI生成で隣のセル内容がにじむ問題への対処
- `OUTER_PADDING = 0` 固定、`trimGutter` は Step 1 のスライダーで 0〜8% 調整可能
- CSS ライブプレビューにも即時反映、PNG再生成はスライダー離した瞬間に走る

### 「次へ」ボタンの挙動
- Step 1: `splitCells.length > 0` で有効
- Step 2: `splitCells.length > 0` で有効
- Step 3: **「次へ」ボタンの代わりに「LINE Creators へ ↗」リンク**（[creator.line.me/ja/](https://creator.line.me/ja/)）

### Design Room はメインフロー外
- 番号ステップ（1,2,3）から外して、右上ボタンからモーダルで開く形式
- 「画像を入れる」が最初のステップという流れに変更（ユーザーは画像を持っている人と作る人の両方をカバー）

### ChatGPT 推奨
- 他のAIへの言及は控えめに（最初は Gemini / Copilot / Midjourney も列挙していたが、現在は ChatGPT のみ表示）
- 注意点モーダル内には「他のAIでも使えますが雰囲気が変わる可能性」を残してある

### Claude は画像生成タグから除外済み
- Claudeはテキスト専用のため、画像生成AIリストから削除済み

---

## 8. 未実装・既知の制約

### 未実装・予定
- [ ] **【優先①】本番デプロイ＆`/stamp-v2` 公開**
  - 現在 `App.tsx` の `enableLocalStampTool = import.meta.env.DEV` で本番非表示になっている
  - 公開時は **ガードを外す**（条件を `true` にするか、Route の `element` を `<StampToolV2 />` 直書きに）
  - その後 `npm run build && firebase deploy --only hosting`
  - 公開URL：`https://aiko-animal-park.web.app/stamp-v2`
  - note 商材としてリリース予定（¥1,980 単品 + ¥500/月サブスク両対応）

- [ ] **【優先②／後追いでOK】パスワード保護機能**
  - 目的：URL流出・解約後の継続利用を抑止
  - 仕組み：`/stamp-v2` にアクセス時、パスワード入力フォーム → 正解で localStorage 保存 → 次回以降スキップ
  - 強度：クライアントサイドのみで OK（ソース見ればバレるが、カジュアル共有抑止としては十分）
  - パスワード値：コード内定数 or 環境変数で管理。月1ローテ運用想定
  - ローテ時のフロー：コード変更 → ビルド＆デプロイ → note 記事のパスワード文字列を更新
  - 既存ユーザー影響なし（localStorage 保存済みは継続使用可能）
  - 推定作業時間：30〜60分

- [ ] **localStorage への state 永続化**（リロードで全消去される。優先度低）
- [ ] **モバイル対応**（PC専用と割り切っている。優先度低）
- [ ] **文字入れ機能**（V1にはあったが、V2では削除。要望次第で復活検討）

### 既知の制約
- 横長以外（縦長3:2など）の入力は想定外。プロンプトはすべて 1:1 出力前提
- フレームの `shortDesc` / `detail` / `tag` はデータには残してあるが UIには非表示（必要なら表示復活可能）
- 注意点モーダルの文言は要法務確認（特に免責事項）

---

## 9. デプロイ手順

### 通常デプロイ
```bash
cd C:\Users\genge\Desktop\aiko-animal-park
npm run build
firebase deploy --only hosting
```

### `/stamp-v2` を本番でも有効化したい場合
[App.tsx](src/App.tsx) を編集：

```tsx
// Before
<Route path="/stamp-v2" element={enableLocalStampTool ? <StampToolV2 /> : <Navigate to="/gallery" replace />} />

// After（本番でも開放）
<Route path="/stamp-v2" element={<StampToolV2 />} />
```

`enableLocalStampTool` 変数（[App.tsx](src/App.tsx)）が `import.meta.env.DEV` を見ているので、本番では false になり Gallery にリダイレクトされる仕様。

### デプロイ後の確認URL
- 本番URL：[https://aiko-animal-park.web.app/stamp-v2](https://aiko-animal-park.web.app/stamp-v2)
- Firebaseプロジェクト名は `aiko-animal-park`（[.firebaserc](.firebaserc) で確認）

---

## 10. デバッグ・確認チェックリスト

### Step 1 確認
- [ ] 透過済みPNG（背景がチェック柄で見えること）をドロップしてアップロードできる
- [ ] アップロード後、16セルのライブプレビューが表示される
- [ ] 右パネルの紫色の分割線をドラッグすると、左の16セルが即時更新される
- [ ] セルをクリックすると拡大モーダルが開く
- [ ] 拡大モーダルで ← → キーでセル切替できる
- [ ] ESC でモーダルが閉じる

### Step 2 確認
- [ ] 16セルが表示される
- [ ] セルをドラッグで並び替えできる
- [ ] セルをクリックで選択（紫枠ハイライト）
- [ ] 右パネルで矢印ボタン押下で位置がずれる
- [ ] 右パネルプレビューを直接ドラッグで位置がずれる
- [ ] 「0」ボタンでオフセットがリセットされる
- [ ] 位置のオフセットはセルIDごとに保持される（並び替えても紐づき維持）

### Step 3 確認
- [ ] [メイン画像] [タブ画像] のタブ切替が動く
- [ ] サムネ列から選択するとプレビューが切り替わる
- [ ] 左パネルの確認グリッドに M / T フラグが反映される
- [ ] ZIPダウンロードボタンで `uchinoko-stamps-TIMESTAMP.zip` が生成される
- [ ] ZIP内の構造：`01.png`〜`16.png` ＋ `main.png` ＋ `tab.png`
- [ ] 各PNGが正しいサイズ（320×320 / 240×240 / 96×74）で透過済み
- [ ] Step 2で設定したセル位置オフセットがPNGに反映されている

### デザインルーム確認
- [ ] 右上「✨ プロンプトを作る」ボタンでモーダルが開く
- [ ] 16フレームのサムネが表示される（PNGが無い場合は絵文字フォールバック）
- [ ] フレームカードをクリックで選択（ピンク枠）
- [ ] 🔍ボタンで拡大モーダルが開く
- [ ] ← → キーで隣のフレームに切替できる
- [ ] 「種類」を選ばないと「コピー」ボタンが無効
- [ ] 「その他」選択時に自由記述欄が表示される
- [ ] 「プロンプトを見る ▼」でプレビューが展開する
- [ ] コピーボタンでクリップボードにプロンプトがコピーされる
- [ ] コピー後、ボタンが「✓ コピーしました」に変わる（約2秒）

### 注意点モーダル確認
- [ ] 右上「ℹ️ 注意点」または下部「詳しく」リンクで開く
- [ ] LINE審査・著作権・AI規約・透過・免責事項のセクションが表示される
- [ ] 「理解しました」ボタンまたは×で閉じる

### 全体
- [ ] ステップ間を行ったり来たりしても state が消えない
- [ ] 横方向のスクロールバーが出ない（各ステップで）
- [ ] フッター「LINE Creators へ ↗」が新タブで [creator.line.me/ja/](https://creator.line.me/ja/) を開く

---

## 11. よくあるトラブル

### 「16枚に分割」ボタンが押せない
→ V2にはこのボタンはありません。アップロード時とドラッグ確定時に自動で分割されます。

### サムネが絵文字（🍓🪩等）で表示される
→ `public/stamp-v2-thumbs/` 配下に対応PNGが無い場合のフォールバック。画像を配置すれば自動で切り替わる。

### ZIP内のスタンプが位置調整されていない
→ `renderCellToSize()` が offset を受け取って canvas に反映する仕組み。
[stamp-v2-split.ts](src/stamp-v2-split.ts) の該当関数を確認。

### 本番で `/stamp-v2` を開くとギャラリーに飛ばされる
→ [App.tsx](src/App.tsx) の `enableLocalStampTool` ガードを外す（上の §9 参照）。

### Canva/remove.bg ではなくCanvasのことを指しているように見える
→ JSXで「Canva」が出るのはユーザー向けの透過ソフトの話。コード内の「Canvas」（大文字S）はHTML5 Canvas API。両者は別物。

---

## 12. 連絡・引き継ぎ

このプロジェクトの所有者：**chihiro09eng@gmail.com**
ターゲット：note商材として「うちのこAIスタジオ」シリーズの一部として展開予定
- AIスタイル図鑑（/style-zukan）
- noteレシピ図鑑（/recipe-zukan）
- ギャラリー（/gallery）
- うちのこスタンプ仕上げ室 V2（/stamp-v2）← このプロジェクト

---

## 付録：直近の重要な意思決定ログ

| 日付 | 決定事項 |
|---|---|
| 2026-05-11 | デザインルームを番号ステップから外し、右上ボタンの独立ツール化 |
| 2026-05-11 | ステップ順を「画像→位置調整＋並び替え→書き出し」に変更（旧：デザインルームが Step 1） |
| 2026-05-11 | Step 3 のメイン/タブをタブ切替UIに変更（縦スクロール回避） |
| 2026-05-11 | フレームカードに🔍クリック拡大モーダル追加 |
| 2026-05-11 | フレームカード・モーダルから説明文（shortDesc/detail/tag）非表示化 |
| 2026-05-11 | ペット種類に「うさぎ」追加＋その他選択時の自由記述欄追加 |
| 2026-05-11 | Claude を画像生成タグから除外 |
| 2026-05-11 | プロンプトプレビューをデフォルト折りたたみ（コピーボタンを目立たせる） |
| 2026-05-11 | 注意点モーダル新設（LINE審査・著作権・AI規約・免責） |
| 2026-05-11 | フッターに常時の免責文「※LINE審査の通過を保証するものではありません」追加 |
| 2026-05-11 | Step 3 の「次へ」ボタンを「LINE Creatorsへ ↗」リンクに変更 |
| 2026-05-11 | Canva限定文言を「お持ちの透過ソフト（Canva・Photoshop・remove.bg など）」に汎用化 |
| 2026-05-11 | デザインルーム：おすすめ4つ＋「もっと見る」で残り12を折りたたみ表示に整理 |
| 2026-05-11 | 共通プロンプトに「セル内に5〜8%余白」ルール追加（分割しやすさUP） |
| 2026-05-11 | 余白ルール内のハート/星/お花の具体名を削除（出現バイアス回避のため形状特徴のみで記述） |
| 2026-05-11 | Step 1 に「セル内余白カット」スライダー復活（隣のセル写り込み対策） |
| 2026-05-11 | フレーム追加：果物フレーム（fruit-frame）／ 海の生き物フレーム（sea-creatures）→ 全18種類に |
| 2026-05-11 | Step 2/3 に背景色プレビュー切替（チェッカー/白/黒/ピンク/ブルー）を追加して透過確認しやすく |
| 2026-05-11 | Step 1 ライブプレビューの比率バグ修正（分割線をずらすとセル内の画像が縦長/横長に歪む問題）。grid-template-columns/rows を cuts に応じて動的計算 |
| 2026-05-11 | Step 1 に「🎬 サンプル画像で試す」ボタン追加（デモ用） |
| 2026-05-11 | Step 1 ドロップ画面にサンプル参考表示（チェッカー背景で透過の例） |
| 2026-05-11 | ガイドキャラ（ポメちゃん）の吹き出しを各ステップに追加（GuideBubble.tsx） |
| 2026-05-11 | ガイドを「動かせる・クリックで喋る」Clippy/カイル風マスコットに変更（FloatingMascot.tsx）。インラインバブルは廃止 |
| 2026-05-11 | 引き継ぎ準備完了：本番デプロイ＋将来的なパスワード保護機能を予定タスクとして明記 |
