# 別PC（1F等）セットアップ手順 — LINEスタンプツール

このリポジトリ（`chie-chan/aiko-animal-park`）を別PCで動かして、スタンプ制作ツールを使えるようにする手順。
3F PCと同じ「git同期」方式（アニマ部屋の2PC同期と同じ考え方）。

## 構成のおさらい
| 部分 | 中身 | AI依存 |
|---|---|---|
| ブラウザツール | `/stamp-room`(StampToolV2) ＋ `/stamp-factory`(量産工房) | なし |
| 仕上げパイプライン | `tools/stamp-finish/finish.py`（透過・白フチ・ダスト・サイズ・zip） | **なし**（ただのプログラム） |
| 画像生成 | Codex の `imagegen` スキル | **あり**（Codexログイン必要） |

→ **画像生成だけがログイン/PC依存**。それ以外はどのPCでも動く。

## 必要なもの
- Git
- Node.js 20+（ブラウザツール用）
- Python 3.10+（仕上げパイプライン用）
- （画像生成までやるなら）Codex CLI ＋ ログイン

## 手順

### 1. リポジトリを取得
```bash
git clone https://github.com/chie-chan/aiko-animal-park.git
cd aiko-animal-park
```
更新を取り込む時：`git pull`

### 2. ブラウザツールを起動
```bash
npm install
npm run dev
```
→ ブラウザで:
- `http://localhost:5173/stamp-room` … スタンプ仕上げ室（透過・整列・zip書き出し）
- `http://localhost:5173/stamp-factory` … 量産工房（ニッチ案件＋プロンプト工場。dev限定）

### 3. 仕上げパイプライン（Python）
```bash
cd tools/stamp-finish
pip install -r requirements.txt
python finish.py --input <白背景画像フォルダ> --output <出力フォルダ> --zip
```
詳細は `tools/stamp-finish/README.md`。

### 4. （任意）画像生成 = Codex
画像生成までこのPCでやるなら Codex CLI にログインが必要：
```bash
codex login
```
※ 1つの個人ログインを複数人で共有するのは OpenAI 規約がグレー。
　 画像生成は「エンジン1台に集約」or「各自ログイン」or「有料API」で別途方針決め（要相談）。

## データ（台帳）について
量産工房の案件台帳は**ブラウザのlocalStorage**に保存される＝**PC間で自動同期されない**。
- 移したい時：工房の「⬇台帳」でJSON書き出し → 別PCで「⬆読込」
- 将来的に Cloudflare KV 等で共有同期にするのは P2 検討事項

## 公開版（参考）
ブラウザツールは Cloudflare Pages にもデプロイ済み：
- `https://aiko-animal-park.pages.dev/stamp-room`
（`/stamp-factory` は dev 限定なので公開版には出ない）

## 参考ドキュメント
- `STAMP_FACTORY_HANDOFF.md` … 量産工房の設計・レビュー反映・今後(P2)
- `STAMP_V2_HANDOFF.md` / `STAMP_V2_TRANSPARENCY_HANDOFF.md` … スタンプツールの引き継ぎ
- `tools/stamp-finish/README.md` … 仕上げパイプラインの使い方
