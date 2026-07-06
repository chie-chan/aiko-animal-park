export type PromptEntry = {
  index: number;
  key: string;
  title: string;
  category: string;
  tags: string[];
  summary: string;
  /** 掲載日（新着順の並び替えに使用） */
  publishAt: string;
  /** 作例サムネ（public/assets/prompts/ 配下）。無ければプレースホルダー表示 */
  sampleImage?: string;
  /** コピー用プロンプト全文 */
  body: string;
  /** 使い方のひとことメモ（任意） */
  howto?: string;
};

export const promptCategories = [
  "すべて",
  "季節・イベント",
  "お花・自然",
  "かわいい変身",
  "ファンタジー",
  "アート表現",
  "その他"
];

export const promptEntries: PromptEntry[] = [
  {
    index: 1,
    key: "tanabata-moonlit-watercolor",
    title: "七夕の月夜イラスト（透明水彩）",
    category: "季節・イベント",
    tags: ["七夕", "水彩", "月夜", "星空", "季節"],
    summary:
      "うちの子を主役に、月あかりの海の上でお願いごと。透明水彩の塗り残しと白い紙の質感で、絵本のような一枚に仕上がります。",
    publishAt: "2026-07-06T12:00:00+09:00",
    sampleImage: "/assets/prompts/tanabata-moonlit.jpg",
    howto:
      "ChatGPT（画像生成）に、うちの子の写真1枚＋下のプロンプトを貼るだけ。【　】の中を自分の子の情報に書き換えてね。",
    body: `Use the attached pet photo only as an identity reference.
Preserve the exact pet from the reference photo: species, fur color, coat pattern, face markings, ear shape and size, eye shape and color, nose, mouth, body size, body proportions, and gentle expression.
Do not change the pet into a different animal or a different individual.

Species: 【種類：犬・猫など】
Breed: 【犬種・猫種】
Pet name for internal identity only: 【うちの子の名前（任意）】

Create one polished 4:5 vertical watercolor illustration with the attached pet as the only main character.
Place the pet large near the center so the face and ears read clearly, with a gentle head tilt and one front paw lightly resting on a small glowing crescent-moon ornament at the pet's feet.
Set the scene on a pale stone pavement above a calm moonlit sea, with soft clouds framing the lower edges and a wide luminous night sky opening behind the pet.
Show a large full moon high in the sky, a slim crescent nearby, scattered small stars, and a faint Milky Way glow.
Add a few delicate Tanabata accents only as supporting motifs: bamboo leaves, tiny hanging star ornaments, and a few small paper wish strips with no readable text.
Keep those seasonal accents subtle and airy, and do not let them cover the pet's face or ears.

Render it as transparent high-saturation watercolor on fine cotton paper.
Preserve visible paper texture, white paper showing through, wet-on-wet blooms, soft color bleed, pigment pooling, uneven watercolor edges, faint water-flow traces, and light brush softness.
Keep the outlines soft and naturally blurred rather than inked or hard-edged.
Make the fur airy and softly simplified while still keeping the pet's real markings and expression recognizable.
Use a clean luminous palette of sky blue, moonlight ivory, soft cloud white, and small warm gold accents in the stars and moon ornament.

Composition:
4:5 vertical smartphone-friendly composition.
Leave enough background space to read the moonlit sky, sea horizon, bamboo accents, and clouds, while keeping the pet as the clear main subject.
The scene should feel like a hand-painted storybook watercolor, not a flat icon or plain pet portrait.

Do not include people, human hands, extra animals, readable text, logos, watermarks, UI elements, artist names, or model names.
Do not turn it into flat vector art, cel anime shading, oil painting, or photoreal studio photography.`
  }
];
