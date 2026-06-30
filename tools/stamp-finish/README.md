# stamp-finish — LINEスタンプ仕上げパイプライン（AIなし）

白背景のラスター画像（顧客提供 or AI生成）を、LINE Creators Market 申請用データに整形する**決定論的プログラム**。
**AI・APIキー・GPU・ログインは一切不要。** どのPCでも動く。

## 何をするか
1. 透過（縁フラッドフィル：縁から繋がった白だけ抜く。内側の白は残す）
2. サイズ統一＋中央寄せ（370×320）
3. 白フチ（距離変換で全方位均一オフセット → 4x生成→縮小で滑らか）
4. ダスト除去（連結成分の最大alpha<100の薄い塊だけ透明化）
5. 軽いシャープ（UnsharpMask。※ESRGANは線画が甘くなるので使わない）
6. main(240×240) / tab(96×74) 生成、申請用zip出力

## セットアップ
```bash
# Python 3.10+ 推奨
pip install -r requirements.txt
```

## 使い方
```bash
python finish.py --input <白背景画像フォルダ> --output <出力フォルダ> [オプション]

# 例: 16枚を仕上げ、1番をメイン・3番をタブにしてzipまで
python finish.py --input ./_raw --output ./_out --main-index 1 --tab-index 3 --zip
```

### 主なオプション
| オプション | 既定 | 意味 |
|---|---|---|
| `--fchi-px` | 2.0 | 白フチの太さ(px) |
| `--fill` | 0.94 | 枠への充填率 |
| `--sharpen` | 60 | UnsharpMask percent（0で無効） |
| `--no-dust` | off | ダスト除去を無効化 |
| `--main-index` | 1 | メインに使うスタンプ番号 |
| `--tab-index` | 1 | タブに使うスタンプ番号 |
| `--zip` | off | 申請用zip(01..NN.png+main+tab)も出力 |

## 出力
- `スタンプ01..NN.png`（370×320・透過・白フチ）
- `main.png`（240×240）/ `tab.png`（96×74）
- `--zip`時：`line_納品一式.zip`（`01..NN.png` + `main.png` + `tab.png`）＋ `_line_upload/` フォルダ

## 注意・既知の勘所
- 入力は**白背景**前提（縁フラッドフィルが背景を抜く）。背景がオフホワイトだと残る場合あり。
- **AI生成画像のキャプション日本語は時々崩れる**（"?????"化）→ 仕上げ前に**目視チェック→崩れたら再生成**。
- サイズ正規化は「内容bbox」基準。特定キャラ（赤い鯉など）を厳密に揃えたい場合は別途調整。
- 背景知識：`~/.claude/projects/D--chie/memory/stamp-finish-pipeline.md`
