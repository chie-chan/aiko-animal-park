// スタンプ量産工房（StampFactory）のデータ定義・プロンプト工場
// 設計: ニッチ1つ = 1案件 = LINEスタンプ1パッケージ(最大40個)。
// 画像生成は ChatGPT(Pro) で手動 → 仕上げ/書き出しは既存 /stamp-room を再利用。
// このファイルは純粋なデータ/関数のみ（DOM・副作用なし）。

export type ProjectStatus =
  | "idea" // アイデア
  | "prompt" // プロンプト済
  | "generating" // 生成中
  | "finished" // 仕上げ済
  | "exported" // 書き出し済
  | "submitted" // 申請済
  | "published"; // 公開

export const STATUS_FLOW: ProjectStatus[] = [
  "idea",
  "prompt",
  "generating",
  "finished",
  "exported",
  "submitted",
  "published",
];

export const STATUS_LABELS: Record<ProjectStatus, string> = {
  idea: "アイデア",
  prompt: "プロンプト済",
  generating: "生成中",
  finished: "仕上げ済",
  exported: "書き出し済",
  submitted: "申請済",
  published: "公開",
};

export interface StampSlot {
  id: number; // 1..N
  category: string; // 挨拶 / 返事 / 感情 / 気づかい / 日常
  usage: string; // 用途・キャプション（例: おはよう）
  prompt: string; // 画像生成プロンプト
  done: boolean; // 生成済みチェック
  edited: boolean; // ユーザーが手編集したか（キャラ反映で上書きしないため）
}

// プロンプト組立に使う案件情報（niche/audience も反映する）
export type PromptInput = Pick<Project, "niche" | "audience" | "character">;

export interface Project {
  id: string;
  niche: string; // ニッチ名（例: 整体師さん向け）
  audience: string; // ターゲット（例: 整体師・治療家）
  character: string; // キャラ設定（プロンプトのベース）
  note: string; // メモ（参考検索・売上など自由記述）
  status: ProjectStatus;
  slots: StampSlot[];
  createdAt: number;
  updatedAt: number;
}

// 32枠のデフォルト用途（LINEスタンプの定番＋日常会話）
export const USAGE_PRESETS: { category: string; usage: string }[] = [
  { category: "挨拶", usage: "おはよう" },
  { category: "挨拶", usage: "こんにちは" },
  { category: "挨拶", usage: "こんばんは" },
  { category: "挨拶", usage: "おやすみ" },
  { category: "挨拶", usage: "ありがとう" },
  { category: "挨拶", usage: "よろしく" },
  { category: "返事", usage: "OK!" },
  { category: "返事", usage: "NG" },
  { category: "返事", usage: "わかりました" },
  { category: "返事", usage: "了解！" },
  { category: "返事", usage: "なるほど" },
  { category: "返事", usage: "ちょっと待って" },
  { category: "返事", usage: "考え中…" },
  { category: "感情", usage: "うれしい！" },
  { category: "感情", usage: "かなしい…" },
  { category: "感情", usage: "おこ！" },
  { category: "感情", usage: "びっくり！" },
  { category: "感情", usage: "笑" },
  { category: "気づかい", usage: "大丈夫？" },
  { category: "気づかい", usage: "無理しないで" },
  { category: "気づかい", usage: "応援してるよ" },
  { category: "気づかい", usage: "おつかれさま" },
  { category: "日常", usage: "いただきます" },
  { category: "日常", usage: "いってきます" },
  { category: "日常", usage: "ただいま" },
  { category: "日常", usage: "おめでとう！" },
  { category: "日常", usage: "ごめんね" },
  { category: "日常", usage: "すごい！" },
  { category: "日常", usage: "たのしみ！" },
  { category: "日常", usage: "いいね！" },
  { category: "日常", usage: "さすが！" },
  { category: "日常", usage: "助かる！" },
];

// プロンプト1枠ぶんを組み立て（テンプレ＋辞書ベース。API課金なし）
// niche/audience も反映＝量産工房の核（ニッチ案件）をプロンプトに効かせる。
export function buildPrompt(input: PromptInput, usage: string): string {
  const base = input.character.trim() || "オリジナルキャラクター";
  const niche = input.niche.trim();
  const audience = input.audience.trim();
  const nicheLine = niche ? `テーマ「${niche}」${audience ? `（${audience}向け）` : ""}。` : "";
  const flavor = niche ? `${niche}らしい小物や雰囲気をさりげなく添える。` : "";
  return (
    `${base}、「${usage}」の表情とポーズ。` +
    nicheLine +
    flavor +
    `上部に手描き風の日本語キャプション「${usage}」。` +
    `LINEスタンプ風のコミック塗り、はっきりした太い輪郭線、鮮やかな配色、` +
    `背景は純白(#ffffff)単色、キャラを中央に1体だけ、余白広め、正方形寄り。`
  );
}

export function generateSlots(input: PromptInput): StampSlot[] {
  return USAGE_PRESETS.map((u, i) => ({
    id: i + 1,
    category: u.category,
    usage: u.usage,
    prompt: buildPrompt(input, u.usage),
    done: false,
    edited: false,
  }));
}

// ニッチ候補のシード（手動。①ニッチ自動発見は将来Phase）
export const SEED_NICHES: { niche: string; audience: string; character: string }[] = [
  {
    niche: "KM BAITS ちび鯉キャラ（第3弾）",
    audience: "釣り好き・KM BAITSファン",
    character: "赤いちび鯉のゆるキャラ（大きな口・つぶらな瞳）",
  },
  {
    niche: "整体師・治療家さん向け",
    audience: "整体師/接骨院スタッフ",
    character: "白衣のちびキャラ整体師",
  },
  {
    niche: "夜勤ナースの日常",
    audience: "看護師・夜勤ワーカー",
    character: "ナース服のゆるキャラ",
  },
];
