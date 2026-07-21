import { type MouseEvent, type TouchEvent, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

const LOCAL_MANIFEST_URL = "/gallery-manifest.json";
const REMOTE_WORKS_MANIFEST_URL =
  "https://firebasestorage.googleapis.com/v0/b/aiko-animal-orders-stg.firebasestorage.app/o/gallery-manifest.json?alt=media";
const TRUSTED_GALLERY_BUCKET = "aiko-animal-orders-stg.firebasestorage.app";
const NOTE_CATALOG_URL = "/assets/note-ai-catalog-20260512.json";

const ALLOWED_RETURN_HOSTS = new Set([
  "aiko-animal-orders-stg.web.app",
  "aiko-animal-orders-stg.firebaseapp.com",
  "aiko-animal-orders.web.app",
  "aiko-animal-orders.firebaseapp.com",
  "localhost",
  "127.0.0.1",
]);

function resolveSafeReturnUrl(raw: string | null) {
  if (!raw) return "";
  try {
    const url = new URL(raw, window.location.href);
    if (!["https:", "http:"].includes(url.protocol)) return "";
    if (!ALLOWED_RETURN_HOSTS.has(url.hostname)) return "";
    return url.href;
  } catch {
    return "";
  }
}

type GalleryItem = {
  galleryNo?: string;
  gallery_no?: string;
  imageUrl: string;
  thumbnailUrl?: string;
  thumbUrl?: string;
  previewUrl?: string;
  selectedDesignImageUrl?: string;
  productName?: string;
  title?: string;
  selectedDesignName?: string;
  createdAt?: string;
};

type CatalogVariant = {
  label?: string;
  image: string;
  managementNo?: string;
  styleNo?: string;
  styleFamily?: string;
  styleFamilyLabel?: string;
  promptId?: string;
  _deleted?: boolean;
  hidden?: boolean;
  active?: boolean;
  referenceOnly?: boolean;
};

type CatalogEntry = {
  catalogNo: string;
  styleNo?: string;
  styleFamily?: string;
  styleFamilyLabel?: string;
  title: string;
  shortTitle?: string;
  cleanTitle?: string;
  url: string;
  thumbnail: string;
  variants?: CatalogVariant[];
};

type CatalogData = {
  entries?: CatalogEntry[];
};

type NoteCatalogGroup = {
  key: string;
  title: string;
  description: string;
  catalogNos: string[];
  manualSectionKeys?: string[];
};

type GalleryStyleEntry = {
  id: string;
  title: string;
  image: string;
  tag: string;
  size?: "square" | "landscape" | "portrait";
  variants?: GalleryStyleVariant[];
};

type GalleryStyleVariant = {
  id?: string;
  title?: string;
  image: string;
  tag?: string;
};

type EmbroideryCatalogAlias = {
  id: string;
  sourceNo: string;
  title: string;
  group: string;
  tag: string;
  size?: "square" | "landscape" | "portrait";
};

type EmbroideryCatalogStyle = EmbroideryCatalogAlias & {
  entry: CatalogEntry;
  entryIndex: number;
  variant: CatalogVariant;
  variantIndex: number;
};

type LightboxState =
  | { source: "catalog"; entryIndex: number; variantIndex: number }
  | { source: "works"; itemIndex: number }
  | { source: "styles"; itemIndex: number; variantIndex?: number };

const GALLERY_STYLE_SECTIONS: Array<{
  key: string;
  title: string;
  description: string;
  entries: GalleryStyleEntry[];
}> = [
  {
    key: "watercolor-basic",
    title: "水彩（定番）",
    description: "やわらかい色使いで、ふんわり優しい雰囲気に仕上げる定番スタイルです。",
    entries: [
      { id: "W-002", title: "水彩イラスト（定番）", image: "/assets/style-samples/style-watercolor-default.webp", tag: "グッズ向け", size: "square" },
      { id: "W-003", title: "新緑", image: "/assets/style-samples/style-watercolor-shinryoku.webp", tag: "グッズ向け", size: "square" },
      { id: "W-004", title: "ラナンキュラス", image: "/assets/style-samples/style-watercolor-ranunculus.webp", tag: "定番", size: "square" },
      { id: "W-029", title: "川辺ひまわり水彩", image: "/assets/style-samples/localized/w-029-riverside-sunflower.webp", tag: "グッズ向け", size: "square" },
      { id: "W-030", title: "ひまわりバスケット水彩", image: "/assets/style-samples/localized/w-030-sunflower-basket-watercolor.webp", tag: "グッズ向け", size: "square" },
      { id: "W-008", title: "不思議の国のアリス", image: "/assets/style-samples/style-watercolor-alice-wonderland.webp", tag: "グッズ向け", size: "landscape" },
    ],
  },
  {
    key: "watercolor-nostalgic",
    title: "夕暮れ・街角の水彩",
    description: "夕暮れや街の空気をやさしく描く、静かで詩的な水彩です。",
    entries: [
      {
        id: "N-070",
        title: "夕暮れ・街角の水彩",
        image: "/assets/style-samples/generated-thumbnails/n-070.webp",
        tag: "夕暮れ・街角",
        size: "square",
        variants: [
          { id: "N-070", title: "夕暮れ水彩1", image: "/assets/style-samples/generated-thumbnails/n-070.webp", tag: "夕暮れ・街角" },
          { id: "N-071", title: "夕暮れ水彩2", image: "/assets/style-samples/generated-thumbnails/n-071.webp", tag: "夕暮れ・街角" },
          { id: "N-072", title: "夕暮れ水彩3", image: "/assets/style-samples/generated-thumbnails/n-072.webp", tag: "夕暮れ・街角" },
          { id: "N-073", title: "夕暮れ水彩4", image: "/assets/style-samples/generated-thumbnails/n-073.webp", tag: "夕暮れ・街角" },
        ],
      },
    ],
  },
  {
    key: "watercolor-flower-sweets",
    title: "スイーツの水彩",
    description: "甘いモチーフを添えて、記念日やギフトに使いやすい水彩です。",
    entries: [
      { id: "W-005", title: "水彩プリンアラモード", image: "/assets/style-samples/style-sweets-cake.webp", tag: "スイーツ", size: "landscape" },
      { id: "W-006", title: "水彩クリームソーダ", image: "/assets/style-samples/style-sweets-creamsoda.webp", tag: "スイーツ", size: "landscape" },
    ],
  },
  {
    key: "embroidery",
    title: "刺繍",
    description: "ぬくもりのある刺繍風の仕上がりで、グッズ向けに使いやすいスタイルです。",
    entries: [
      { id: "E-001", title: "刺繍風イラスト", image: "/assets/style-samples/style-embroidery.webp", tag: "ワンポイント", size: "square" },
      { id: "E-002", title: "刺繍風イラスト（定番）", image: "/assets/style-samples/style-embroidery-default.webp", tag: "グッズ向け", size: "square" },
    ],
  },
  {
    key: "diorama",
    title: "ジオラマ",
    description: "小さな世界にうちの子を置いた、物語のあるジオラマ系スタイルです。",
    entries: [
      { id: "D001", title: "ピクニック", image: "/assets/style-samples/style-miniature-diorama-picnic.png", tag: "ジオラマ", size: "landscape" },
      { id: "Q308", title: "紫陽花ピクニック", image: "/assets/style-samples/style-diorama-hydrangea-picnic.webp", tag: "ジオラマ", size: "square" },
      { id: "Q320", title: "エーゲ海", image: "/assets/style-samples/style-diorama-aegean-sea.webp", tag: "ジオラマ", size: "square" },
    ],
  },
  {
    key: "flake-seal",
    title: "フレークシール",
    description: "シール向けの横長デザインです。小さく並べてもかわいく見える雰囲気です。",
    entries: [
      { id: "FS-001", title: "スズラン", image: "/assets/style-samples/style-flakeseal-suzuran.webp", tag: "シール向け", size: "landscape" },
      { id: "FS-002", title: "苺ガーリー", image: "/assets/style-samples/style-flakeseal-strawberry-girly-v2.webp", tag: "シール向け", size: "landscape" },
      { id: "FS-003", title: "カーネーション", image: "/assets/style-samples/style-flakeseal-carnation.webp", tag: "シール向け", size: "landscape" },
      { id: "FS-004", title: "不思議の国のアリス", image: "/assets/style-samples/style-flakeseal-alice-wonderland.webp", tag: "シール向け", size: "landscape" },
      { id: "FS-005", title: "5月アジサイ", image: "/assets/style-samples/style-flakeseal-hydrangea-may.webp", tag: "シール向け", size: "landscape" },
      { id: "Q309", title: "紫陽花ピクニック フレークシール", image: "/assets/style-samples/style-diorama-hydrangea-picnic-flake.webp", tag: "シール向け", size: "landscape" },
      { id: "Q321", title: "エーゲ海 フレークシール", image: "/assets/style-samples/style-diorama-aegean-sea-flake.webp", tag: "シール向け", size: "landscape" },
    ],
  },
];

const galleryStyleEntries = GALLERY_STYLE_SECTIONS.flatMap((section) => section.entries);
const WATERCOLOR_STYLE_SECTION_KEYS = new Set([
  "watercolor-basic",
  "watercolor-flower-sweets",
]);
const EMBROIDERY_STYLE_SECTION_KEYS = new Set(["embroidery"]);
const EMBROIDERY_GROUPED_MANUAL_STYLE_IDS = new Set(["E-001"]);
const EMBROIDERY_MANUAL_GROUP_IDS: Record<string, string[]> = {
  "embroidery-one-point": ["E-001"],
};

const PRODUCT_CATEGORIES = ["すべて", "ハンカチ", "ミニトートバッグ", "ポスター", "フレークシール", "バッグ・その他"];
const WORKS_PREVIEW_LIMIT = 36;

const NOTE_CATALOG_SHORT_TITLES: Record<string, string> = {
  "NC-002": "あみぐるみ",
  "NC-003": "着せ替えサロン",
  "NC-004": "お花・スイーツ刺繍",
  "NC-005": "ステンドグラス",
  "NC-006": "葉の上の妖精",
  "NC-007": "スノードーム",
  "NC-008": "シルクスクリーン",
  "NC-009": "春のボタニカル",
  "NC-010": "お洒落バー",
  "NC-011": "50sヴィンテージ",
  "NC-012": "シルエットアート",
  "NC-013": "監視カメラ風",
  "NC-014": "イースターたまご",
  "NC-015": "花冠ポートレート",
  "NC-016": "フラワーフォト",
  "NC-017": "自転車と花かご",
  "NC-018": "ネオンスプラッシュ",
  "NC-019": "バレンタインハート",
  "NC-020": "スパ美容Day",
  "NC-021": "ふわもこハチ",
  "NC-022": "ベビースタイ",
  "NC-023": "世界旅行フォト",
  "NC-024": "桜ポートレート",
  "NC-025": "おしゃれディスプレイ",
  "NC-026": "成人式コラージュ",
  "NC-027": "スイートバルーン",
  "NC-028": "チェック柄ライト",
  "NC-029": "音楽家シルエット",
  "NC-030": "スイーツ職人",
  "NC-031": "雪跡アート",
  "NC-032": "白馬とリボン",
  "NC-033": "紙破りポップアート",
  "NC-034": "夕暮れ水彩",
  "NC-035": "おうち時間の冬",
  "NC-036": "光る雪だるま",
  "NC-037": "ハートフレーム",
  "NC-038": "和風9分割",
  "NC-039": "パッチワーク",
  "NC-040": "東欧レトロ新年",
  "NC-041": "羽子板",
  "NC-042": "洋風絵画",
  "NC-043": "クリスタル花屋さん",
  "NC-044": "初夏フローラル",
  "NC-045": "フラワーウォール",
  "NC-046": "ソリッドカラー",
  "NC-047": "夕暮れ古都",
};

const NOTE_CATALOG_GROUPS: NoteCatalogGroup[] = [
  {
    key: "note-kawaii",
    title: "かわいい変身・衣装",
    description: "ぬいぐるみ、着せ替え、晴れ着など、うちの子の変身を楽しめるスタイルです。",
    catalogNos: ["NC-002", "NC-003", "NC-021", "NC-022", "NC-026", "NC-030", "NC-039", "NC-041", "NC-042"],
  },
  {
    key: "note-season",
    title: "花・季節イベント",
    description: "お花、桜、冬、お正月など、季節感や記念日の雰囲気を入れたい時に選びやすいスタイルです。",
    catalogNos: ["W-007", "NC-005", "NC-009", "NC-014", "NC-015", "NC-016", "NC-017", "NC-019", "NC-024", "NC-031", "NC-034", "NC-035", "NC-036", "NC-037", "NC-038", "NC-040", "NC-043", "NC-044", "NC-045"],
  },
  {
    key: "note-fantasy",
    title: "ふしぎな世界",
    description: "妖精、白馬、スノードームなど、物語の1場面のような仕上がりを探したい時に向いています。",
    catalogNos: ["NC-006", "NC-032", "NC-007", "NC-012"],
  },
  {
    key: "note-pop",
    title: "カラフル・ポップ",
    description: "色や光、グラフィック感が強く、明るく印象的に見せたい時に選びやすいスタイルです。",
    catalogNos: ["NC-008", "NC-018", "NC-028", "NC-029", "NC-033", "NC-046"],
  },
  {
    key: "note-scene",
    title: "おしゃれなシーン・暮らし",
    description: "バー、旅、ディスプレイ、パーティーなど、1枚の写真として雰囲気を作りたい時におすすめです。",
    catalogNos: ["NC-010", "NC-011", "NC-013", "NC-020", "NC-023", "NC-025", "NC-027", "NC-047"],
    manualSectionKeys: ["watercolor-nostalgic"],
  },
];

const EMBROIDERY_NOTE_SOURCE_CATALOG_NO = "NC-004";
const FEATURED_EMBROIDERY_CATALOG_NOS = new Set([EMBROIDERY_NOTE_SOURCE_CATALOG_NO]);
const HIDDEN_NOTE_CATALOG_NOS = new Set(["NC-034"]);
const NOTE_GROUPED_MANUAL_STYLE_SECTION_KEYS = new Set(
  NOTE_CATALOG_GROUPS.flatMap((group) => group.manualSectionKeys || []),
);

const EMBROIDERY_CATALOG_ALIASES: EmbroideryCatalogAlias[] = [
  { id: "E-003", sourceNo: "NC-004-01", title: "野草リース", group: "wreath", tag: "花リース", size: "square" },
  { id: "E-004", sourceNo: "NC-004-02", title: "野草ワンポイント", group: "one-point", tag: "ワンポイント", size: "square" },
  { id: "E-005", sourceNo: "NC-004-03", title: "苺とバラのリース", group: "wreath", tag: "花リース", size: "square" },
  { id: "E-006", sourceNo: "NC-004-04", title: "苺とバラワンポイント", group: "one-point", tag: "ワンポイント", size: "square" },
  { id: "E-007", sourceNo: "NC-004-05", title: "春の野原リース", group: "wreath", tag: "花リース", size: "square" },
  { id: "E-008", sourceNo: "NC-004-06", title: "苺ワンポイント", group: "one-point", tag: "ワンポイント", size: "square" },
  { id: "E-009", sourceNo: "NC-004-07", title: "苺リース", group: "wreath", tag: "花リース", size: "square" },
  { id: "E-010", sourceNo: "NC-004-08", title: "ガーベラとバルーン", group: "wreath", tag: "花リース", size: "square" },
  { id: "E-011", sourceNo: "NC-004-09", title: "カラフル花刺繍", group: "wreath", tag: "花リース", size: "square" },
  { id: "E-012", sourceNo: "NC-004-10", title: "パステルとカスミソウ", group: "one-point", tag: "ワンポイント", size: "square" },
  { id: "E-013", sourceNo: "NC-004-11", title: "コーヒーカップ花屋", group: "miniature", tag: "ミニチュア花屋", size: "square" },
  { id: "E-014", sourceNo: "NC-004-12", title: "花屋の窓", group: "miniature", tag: "ミニチュア花屋", size: "square" },
  { id: "E-015", sourceNo: "NC-004-13", title: "メロンソーダ刺繍", group: "sweets", tag: "スイーツ", size: "square" },
  { id: "E-016", sourceNo: "NC-004-14", title: "メロンソーダフレーム", group: "sweets", tag: "スイーツ", size: "square" },
  { id: "E-017", sourceNo: "NC-004-15", title: "プリンアラモード", group: "sweets", tag: "スイーツ", size: "square" },
  { id: "E-018", sourceNo: "NC-004-16", title: "チェリータルト", group: "sweets", tag: "スイーツ", size: "square" },
  { id: "E-019", sourceNo: "NC-004-17", title: "イエローゴシック", group: "one-point", tag: "ワンポイント", size: "square" },
];

const EMBROIDERY_ALIAS_GROUPS = [
  {
    key: "embroidery-wreath",
    title: "花リース刺繍",
    description: "お花や苺をぐるりと添えた、やさしい記念日向けの刺繍です。",
    aliasIds: ["E-003", "E-005", "E-007", "E-009", "E-010", "E-011"],
  },
  {
    key: "embroidery-one-point",
    title: "ワンポイント刺繍",
    description: "小さめのモチーフや余白を活かした、布小物に合わせやすい刺繍です。",
    aliasIds: ["E-004", "E-006", "E-008", "E-012", "E-019"],
  },
  {
    key: "embroidery-sweets",
    title: "スイーツ刺繍",
    description: "メロンソーダやケーキの甘い雰囲気を入れたい時に選びやすい刺繍です。",
    aliasIds: ["E-015", "E-016", "E-017", "E-018"],
  },
  {
    key: "embroidery-miniature",
    title: "花屋ミニチュア刺繍",
    description: "小さな花屋さんの世界にうちの子を入れる、物語感のある刺繍です。",
    aliasIds: ["E-013", "E-014"],
  },
];

const EMBROIDERY_ALIAS_BY_SOURCE_NO = new Map(EMBROIDERY_CATALOG_ALIASES.map((alias) => [alias.sourceNo, alias]));

function getNoteCatalogTitle(entry: CatalogEntry): string {
  return NOTE_CATALOG_SHORT_TITLES[entry.catalogNo] || entry.shortTitle || entry.cleanTitle || entry.title;
}

function getActiveCatalogVariants(entry: CatalogEntry): CatalogVariant[] {
  const activeVariants = (entry.variants || []).filter(
    (variant) => variant.image && !variant._deleted && !variant.hidden && variant.active !== false && !variant.referenceOnly,
  );
  return activeVariants.length ? activeVariants : [{ label: "参考画像 1", image: entry.thumbnail, managementNo: entry.catalogNo }];
}

function getCatalogPreviewVariants(entry: CatalogEntry): CatalogVariant[] {
  return getActiveCatalogVariants(entry).slice(0, 4);
}

function getActiveStyleVariants(entry: GalleryStyleEntry): GalleryStyleVariant[] {
  const activeVariants = (entry.variants || []).filter((variant) => variant.image);
  return activeVariants.length
    ? activeVariants
    : [{ id: entry.id, title: entry.title, image: entry.image, tag: entry.tag }];
}

function getStylePreviewVariants(entry: GalleryStyleEntry): GalleryStyleVariant[] {
  return getActiveStyleVariants(entry).slice(0, 4);
}

function getStyleEntryDisplayCount(entry: GalleryStyleEntry): number {
  return getActiveStyleVariants(entry).length;
}

function getStyleVariantCode(entry: GalleryStyleEntry, variant?: GalleryStyleVariant | null): string {
  return variant?.id || entry.id;
}

function getCatalogEntryCode(entry: CatalogEntry): string {
  return entry.styleNo || getActiveCatalogVariants(entry)[0]?.styleNo || entry.catalogNo;
}

function getCatalogVariantCode(entry: CatalogEntry, variant?: CatalogVariant | null): string {
  return variant?.styleNo || variant?.managementNo || entry.styleNo || entry.catalogNo;
}

function buildEmbroideryCatalogStyles(catalogEntries: CatalogEntry[]): EmbroideryCatalogStyle[] {
  const entryIndex = catalogEntries.findIndex((entry) => entry.catalogNo === EMBROIDERY_NOTE_SOURCE_CATALOG_NO);
  if (entryIndex < 0) return [];
  const entry = catalogEntries[entryIndex];
  const variants = getActiveCatalogVariants(entry);
  const variantsByNo = new Map(
    variants.map((variant, variantIndex) => [
      variant.managementNo || `${entry.catalogNo}-${String(variantIndex + 1).padStart(2, "0")}`,
      { variant, variantIndex },
    ])
  );
  return EMBROIDERY_CATALOG_ALIASES.map((alias) => {
    const found = variantsByNo.get(alias.sourceNo);
    if (!found) return null;
    return {
      ...alias,
      entry,
      entryIndex,
      variant: found.variant,
      variantIndex: found.variantIndex,
    };
  }).filter((style): style is EmbroideryCatalogStyle => Boolean(style));
}

function formatGalleryNo(index: number) {
  return `G-${String(index).padStart(3, "0")}`;
}

type FirebaseStorageRef = {
  bucket: string;
  path: string;
};

function parseFirebaseStorageUrl(raw: string | undefined | null): FirebaseStorageRef | null {
  if (!raw || typeof raw !== "string") return null;
  try {
    const url = new URL(raw, window.location.href);
    if (url.hostname === "firebasestorage.googleapis.com") {
      const match = url.pathname.match(/^\/v0\/b\/([^/]+)\/o\/(.+)$/);
      if (!match) return null;
      return {
        bucket: decodeURIComponent(match[1]),
        path: decodeURIComponent(match[2]),
      };
    }
    if (url.hostname === "storage.googleapis.com") {
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts.length < 2) return null;
      return {
        bucket: decodeURIComponent(parts[0]),
        path: parts.slice(1).map((part) => decodeURIComponent(part)).join("/"),
      };
    }
    if (
      url.hostname.endsWith(".firebasestorage.app") ||
      url.hostname.endsWith(".appspot.com") ||
      url.hostname.endsWith(".storage.googleapis.com")
    ) {
      return {
        bucket: url.hostname,
        path: decodeURIComponent(url.pathname.replace(/^\/+/, "")),
      };
    }
  } catch {
    return null;
  }
  return null;
}

function safeGalleryThumbCandidate(raw: string | undefined | null) {
  if (!raw || typeof raw !== "string") return "";
  const ref = parseFirebaseStorageUrl(raw);
  if (!ref) return raw;
  if (ref.bucket !== TRUSTED_GALLERY_BUCKET) return "";
  const storagePath = ref.path.replace(/^\/+/, "");
  if (!/^codex-studio\/cards\/previews\/[^/]+\.webp$/i.test(storagePath)) return "";
  return `https://firebasestorage.googleapis.com/v0/b/${TRUSTED_GALLERY_BUCKET}/o/${encodeURIComponent(storagePath)}?alt=media`;
}

function safeGalleryImageCandidate(raw: string | undefined | null) {
  if (!raw || typeof raw !== "string") return "";
  const ref = parseFirebaseStorageUrl(raw);
  if (!ref) return raw;
  if (ref.bucket !== TRUSTED_GALLERY_BUCKET) return "";
  const storagePath = ref.path.replace(/^\/+/, "");
  if (!/^codex-studio\/cards\/(?!previews\/)[^/]+\.webp$/i.test(storagePath)) return "";
  return `https://firebasestorage.googleapis.com/v0/b/${TRUSTED_GALLERY_BUCKET}/o/${encodeURIComponent(storagePath)}?alt=media`;
}

function safePublicGalleryText(value: unknown, fallback = "") {
  return String(value || fallback || "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[A-Z0-9]{12,}/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
}

function sanitizeRemoteGalleryItem(source: unknown): GalleryItem | null {
  if (!source || typeof source !== "object") return null;
  const item = source as Record<string, unknown>;
  const galleryNo = String(item.galleryNo || item.gallery_no || "").trim().toUpperCase();
  if (!/^G-\d{3,}$/.test(galleryNo)) return null;

  const imageUrl = safeGalleryImageCandidate(typeof item.imageUrl === "string" ? item.imageUrl : "");
  const thumbnailUrl = safeGalleryThumbCandidate(typeof item.thumbnailUrl === "string" ? item.thumbnailUrl : "");
  if (!imageUrl || !thumbnailUrl) return null;

  const productName = safePublicGalleryText(item.productTypeLabel || item.productName || item.selectedDesignName, "制作事例");
  return {
    galleryNo,
    imageUrl,
    thumbnailUrl,
    productName,
    selectedDesignName: safePublicGalleryText(item.selectedDesignName || productName, productName),
    createdAt: safePublicGalleryText(item.createdAt),
  };
}

function getGalleryThumbUrl(item: GalleryItem) {
  const explicitThumb = safeGalleryThumbCandidate(item.thumbnailUrl || item.thumbUrl || item.previewUrl);
  if (explicitThumb) return explicitThumb;

  const orderPreview = safeGalleryThumbCandidate(item.selectedDesignImageUrl);
  if (orderPreview) return orderPreview;

  return safeGalleryThumbCandidate(item.imageUrl);
}

function getGalleryImageUrl(item: GalleryItem) {
  return safeGalleryImageCandidate(item.imageUrl) || getGalleryThumbUrl(item);
}

function galleryNoNumber(value: string | undefined) {
  const match = String(value || "").match(/^G-(\d+)$/i);
  return match ? Number(match[1]) || 0 : 0;
}

function detectCategory(source: GalleryItem): string {
  const text = [source.productName, source.title, source.selectedDesignName].filter(Boolean).join(" ");
  if (/フレークシール/.test(text)) return "フレークシール";
  if (/ミニトート/.test(text)) return "ミニトートバッグ";
  if (/ハンカチ/.test(text)) return "ハンカチ";
  if (/ポスター|A4/i.test(text)) return "ポスター";
  if (/斜め掛け|オーロラ/.test(text)) return "バッグ・その他";
  return "バッグ・その他";
}

function normalizeTitle(item: GalleryItem): string {
  const title = item.productName || item.selectedDesignName || item.title || "制作事例";
  if (/フレークシール/.test(title)) return "フレークシール";
  if (/25\s*cm|25cm/i.test(title) && /ハンカチ/.test(title)) return "25cmハンカチ";
  if (/ハンカチ/.test(title)) return "20cmハンカチ";
  if (/ミニトート/.test(title)) return "ミニトートバッグ";
  if (/斜め掛け/.test(title)) return "斜め掛けバッグ";
  if (/オーロラ/.test(title)) return "オーロラバッグ";
  return title;
}

export default function GalleryPage() {
  const [searchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") === "works" ? "works" : "catalog";
  const returnUrl = useMemo(() => resolveSafeReturnUrl(searchParams.get("returnUrl")), [searchParams]);
  const hasReturnUrl = Boolean(returnUrl);
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [catalogEntries, setCatalogEntries] = useState<CatalogEntry[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState("");
  const [activeCategory, setActiveCategory] = useState("すべて");
  const [lightbox, setLightbox] = useState<LightboxState | null>(null);
  const [copiedCode, setCopiedCode] = useState("");
  const [showPageShortcuts, setShowPageShortcuts] = useState(false);
  const [showAllWorks, setShowAllWorks] = useState(false);
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    let alive = true;
    async function loadWorks() {
      try {
        setLoading(true);
        setError("");
        const cacheBust = Date.now();
        const [localResult, remoteResult] = await Promise.allSettled([
          fetch(`${LOCAL_MANIFEST_URL}?ts=${cacheBust}`, { cache: "no-store" }).then(async (response) => {
            if (!response.ok) throw new Error("local manifest not found");
            const data = await response.json();
            return Array.isArray(data.items) ? data.items : Array.isArray(data) ? data : [];
          }),
          fetch(`${REMOTE_WORKS_MANIFEST_URL}&ts=${cacheBust}`, { cache: "no-store" }).then(async (response) => {
            if (!response.ok) throw new Error("remote manifest not found");
            const data = await response.json();
            const rawItems = Array.isArray(data.items) ? data.items : Array.isArray(data) ? data : [];
            return rawItems
              .map((item: unknown) => sanitizeRemoteGalleryItem(item))
              .filter((item: GalleryItem | null): item is GalleryItem => Boolean(item));
          }),
        ]);

        if (localResult.status === "rejected" && remoteResult.status === "rejected") {
          throw new Error("works manifests not found");
        }

        const localItems = localResult.status === "fulfilled"
          ? (localResult.value as GalleryItem[]).filter((item) => getGalleryImageUrl(item))
          : [];
        const remoteItems = remoteResult.status === "fulfilled" ? remoteResult.value : [];
        const localGalleryNos = new Set(localItems.map((item) => String(item.galleryNo || item.gallery_no || "").toUpperCase()));
        const nextItems = [
          ...remoteItems.filter((item) => !localGalleryNos.has(String(item.galleryNo || item.gallery_no || "").toUpperCase())),
          ...localItems,
        ].sort((a, b) => galleryNoNumber(b.galleryNo || b.gallery_no) - galleryNoNumber(a.galleryNo || a.gallery_no));

        if (alive) setItems(nextItems);
      } catch {
        if (alive) setError("制作事例の読み込みに失敗しました。");
      } finally {
        if (alive) setLoading(false);
      }
    }
    loadWorks();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const updateShortcutVisibility = () => setShowPageShortcuts(window.scrollY > 520);
    updateShortcutVisibility();
    window.addEventListener("scroll", updateShortcutVisibility, { passive: true });
    return () => window.removeEventListener("scroll", updateShortcutVisibility);
  }, [activeTab]);

  useEffect(() => {
    setShowAllWorks(false);
  }, [activeCategory]);

  useEffect(() => {
    let alive = true;
    async function loadCatalog() {
      try {
        setCatalogLoading(true);
        setCatalogError("");
        const response = await fetch(`${NOTE_CATALOG_URL}?ts=${Date.now()}`, { cache: "no-store" });
        if (!response.ok) throw new Error("catalog not found");
        const data = (await response.json()) as CatalogData;
        const nextEntries = (data.entries || []).filter((entry) => entry.thumbnail && entry.catalogNo !== "NC-001" && !HIDDEN_NOTE_CATALOG_NOS.has(entry.catalogNo));
        if (alive) setCatalogEntries(nextEntries);
      } catch {
        if (alive) setCatalogError("スタイルカタログの読み込みに失敗しました。");
      } finally {
        if (alive) setCatalogLoading(false);
      }
    }
    loadCatalog();
    return () => {
      alive = false;
    };
  }, []);

  const visibleItems = useMemo(() => {
    if (activeCategory === "すべて") return items;
    return items.filter((item) => detectCategory(item) === activeCategory);
  }, [activeCategory, items]);

  const displayedWorkItems = useMemo(() => {
    if (activeTab !== "works") return visibleItems;
    if (activeCategory !== "すべて" || showAllWorks) return visibleItems;
    return visibleItems.slice(0, WORKS_PREVIEW_LIMIT);
  }, [activeCategory, activeTab, showAllWorks, visibleItems]);

  const isWorksPreviewLimited = activeTab === "works" && activeCategory === "すべて" && displayedWorkItems.length < visibleItems.length;

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { すべて: items.length };
    for (const item of items) {
      const category = detectCategory(item);
      counts[category] = (counts[category] || 0) + 1;
    }
    return counts;
  }, [items]);

  const styleSections = useMemo(() => {
    return GALLERY_STYLE_SECTIONS.filter((section) => section.entries.length > 0);
  }, []);
  const watercolorStyleSections = useMemo(() => {
    return styleSections.filter((section) => WATERCOLOR_STYLE_SECTION_KEYS.has(section.key));
  }, [styleSections]);
  const embroideryStyleSections = useMemo(() => {
    return styleSections.filter((section) => EMBROIDERY_STYLE_SECTION_KEYS.has(section.key));
  }, [styleSections]);
  const otherManualStyleSections = useMemo(() => {
    return styleSections.filter(
      (section) =>
        !WATERCOLOR_STYLE_SECTION_KEYS.has(section.key) &&
        !EMBROIDERY_STYLE_SECTION_KEYS.has(section.key) &&
        !NOTE_GROUPED_MANUAL_STYLE_SECTION_KEYS.has(section.key),
    );
  }, [styleSections]);
  const manualNoteSectionsByKey = useMemo(() => {
    const manualSectionsByKey = new Map(styleSections.map((section) => [section.key, section]));
    return new Map(
      NOTE_CATALOG_GROUPS.map((group) => [
        group.key,
        (group.manualSectionKeys || [])
          .map((key) => manualSectionsByKey.get(key))
          .filter((section): section is (typeof styleSections)[number] => Boolean(section)),
      ]),
    );
  }, [styleSections]);
  const embroideryCatalogStyles = useMemo(() => buildEmbroideryCatalogStyles(catalogEntries), [catalogEntries]);
  const embroideryCatalogStyleGroups = useMemo(() => {
    const stylesById = new Map(embroideryCatalogStyles.map((style) => [style.id, style]));
    const manualStylesById = new Map(galleryStyleEntries.map((style, styleIndex) => [style.id, { ...style, styleIndex }]));
    return EMBROIDERY_ALIAS_GROUPS.map((group) => ({
      ...group,
      styles: [
        ...(EMBROIDERY_MANUAL_GROUP_IDS[group.key] || [])
          .map((id) => {
            const style = manualStylesById.get(id);
            return style
              ? {
                  ...style,
                  lightbox: { source: "styles" as const, itemIndex: style.styleIndex },
                }
              : null;
          })
          .filter((style): style is GalleryStyleEntry & { styleIndex: number; lightbox: LightboxState } => Boolean(style)),
        ...group.aliasIds
          .map((id) => stylesById.get(id))
          .filter((style): style is EmbroideryCatalogStyle => Boolean(style))
          .map((style) => ({
            ...style,
            image: style.variant.image,
            lightbox: { source: "catalog" as const, entryIndex: style.entryIndex, variantIndex: style.variantIndex },
          })),
      ],
    })).filter((group) => group.styles.length > 0);
  }, [embroideryCatalogStyles]);

  const noteCatalogSections = useMemo(() => {
    const entriesByNo = new Map(catalogEntries.map((entry) => [entry.catalogNo, entry]));
    const groupedNos = new Set([...NOTE_CATALOG_GROUPS.flatMap((group) => group.catalogNos), ...FEATURED_EMBROIDERY_CATALOG_NOS]);
    const groupedSections = NOTE_CATALOG_GROUPS.map((group) => ({
      ...group,
      entries: group.catalogNos.map((catalogNo) => entriesByNo.get(catalogNo)).filter((entry): entry is CatalogEntry => Boolean(entry)),
    })).filter((section) => section.entries.length > 0);
    const otherEntries = catalogEntries.filter((entry) => !groupedNos.has(entry.catalogNo));
    return otherEntries.length
      ? [...groupedSections, { key: "note-other", title: "その他のスタイル", description: "ほかのカテゴリに入らないスタイルです。", catalogNos: [], entries: otherEntries }]
      : groupedSections;
  }, [catalogEntries]);

  const currentCatalogEntry = lightbox?.source === "catalog" ? catalogEntries[lightbox.entryIndex] : null;
  const currentCatalogVariants = currentCatalogEntry ? getActiveCatalogVariants(currentCatalogEntry) : [];
  const currentCatalogVariant = lightbox?.source === "catalog" ? currentCatalogVariants[lightbox.variantIndex] : null;
  const currentCatalogAlias = currentCatalogVariant?.managementNo ? EMBROIDERY_ALIAS_BY_SOURCE_NO.get(currentCatalogVariant.managementNo) : null;
  const currentCatalogCode = currentCatalogEntry ? (currentCatalogAlias?.id || getCatalogVariantCode(currentCatalogEntry, currentCatalogVariant)) : "";
  const currentCatalogTitle = currentCatalogEntry ? (currentCatalogAlias?.title || getNoteCatalogTitle(currentCatalogEntry)) : "";
  const currentCatalogLabel = currentCatalogAlias?.tag || currentCatalogVariant?.label || `参考画像 ${lightbox?.source === "catalog" ? lightbox.variantIndex + 1 : 1}`;
  const currentWork = lightbox?.source === "works" ? visibleItems[lightbox.itemIndex] : null;
  const currentWorkImageUrl = currentWork ? getGalleryImageUrl(currentWork) : "";
  const currentStyle = lightbox?.source === "styles" ? galleryStyleEntries[lightbox.itemIndex] : null;
  const currentStyleVariants = currentStyle ? getActiveStyleVariants(currentStyle) : [];
  const currentStyleVariant = lightbox?.source === "styles" ? currentStyleVariants[lightbox.variantIndex || 0] : null;
  const currentStyleCode = currentStyle ? getStyleVariantCode(currentStyle, currentStyleVariant) : "";
  const currentStyleLabel = currentStyleVariant?.title || currentStyle?.tag || "";

  const moveLightbox = (direction: 1 | -1) => {
    if (!lightbox) return;
    if (lightbox.source === "catalog") {
      const total = currentCatalogVariants.length;
      if (!total) return;
      setLightbox({
        ...lightbox,
        variantIndex: (lightbox.variantIndex + direction + total) % total,
      });
      return;
    }
    if (lightbox.source === "styles") {
      const style = galleryStyleEntries[lightbox.itemIndex];
      const variants = style ? getActiveStyleVariants(style) : [];
      if (variants.length > 1) {
        setLightbox({
          ...lightbox,
          variantIndex: ((lightbox.variantIndex || 0) + direction + variants.length) % variants.length,
        });
        return;
      }
      const total = galleryStyleEntries.length;
      if (!total) return;
      setLightbox({
        source: "styles",
        itemIndex: (lightbox.itemIndex + direction + total) % total,
      });
      return;
    }
    const total = visibleItems.length;
    if (!total) return;
    setLightbox({
      source: "works",
      itemIndex: (lightbox.itemIndex + direction + total) % total,
    });
  };

  const handleLightboxTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    const start = swipeStartRef.current;
    swipeStartRef.current = null;
    if (!start) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy) * 1.25) return;
    moveLightbox(dx < 0 ? 1 : -1);
  };

  const copyStyleCode = async (code: string, event?: MouseEvent<HTMLElement>) => {
    event?.preventDefault();
    event?.stopPropagation();
    const value = code.trim();
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = value;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
    setCopiedCode(value);
    window.setTimeout(() => setCopiedCode((current) => (current === value ? "" : current)), 6000);
  };

  const closeCatalogTab = () => {
    window.close();
  };

  const returnToOrderPage = () => {
    if (returnUrl) {
      window.location.href = returnUrl;
      return;
    }
    closeCatalogTab();
  };

  const scrollPageToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const renderStyleCard = (entry: GalleryStyleEntry, isPriorityImage = false) => {
    const styleIndex = galleryStyleEntries.findIndex((item) => item.id === entry.id);
    const variants = getActiveStyleVariants(entry);
    const previewVariants = getStylePreviewVariants(entry);
    const hasMultiPreview = variants.length > 1;

    return (
      <button
        className={`park-style-card${hasMultiPreview ? " park-catalog-card park-manual-catalog-card" : ""}`}
        type="button"
        key={entry.id}
        onClick={() => setLightbox({ source: "styles", itemIndex: Math.max(styleIndex, 0), variantIndex: 0 })}
        aria-label={`${entry.id} ${entry.title}を開く`}
      >
        {hasMultiPreview ? (
          <div className="park-catalog-thumb multi">
            {previewVariants.map((variant, index) => (
              <img
                src={variant.image}
                alt={variant.title || `${entry.title} ${index + 1}`}
                loading={isPriorityImage && index === 0 ? "eager" : "lazy"}
                fetchpriority={isPriorityImage && index === 0 ? "high" : "auto"}
                key={`${variant.image}-${index}`}
              />
            ))}
            {variants.length > previewVariants.length && <span className="park-catalog-more">+{variants.length - previewVariants.length}</span>}
          </div>
        ) : (
          <div className={`park-style-image ${entry.size === "square" ? "square" : ""}`}>
            <img src={entry.image} alt={entry.title} loading={isPriorityImage ? "eager" : "lazy"} fetchpriority={isPriorityImage ? "high" : "auto"} />
          </div>
        )}
        <div className="park-card-body">
          <strong>{entry.title}</strong>
          <span>
            <span className={`park-copy-code${copiedCode === entry.id ? " copied" : ""}`} onClick={(event) => copyStyleCode(entry.id, event)} title={`${entry.id}をコピー`}>
              <b>{entry.id}</b>
              <small>コピー</small>
            </span>
            <small>{hasMultiPreview ? `バリエ ${variants.length}枚` : entry.tag}</small>
          </span>
        </div>
      </button>
    );
  };

  return (
    <main className="park-gallery-page">
      <section className="park-gallery-hero">
        <p className="park-gallery-kicker">{activeTab === "works" ? "制作事例" : "スタイル選び"}</p>
        <h1>{activeTab === "works" ? "うちの子制作事例" : "うちの子スタイルカタログ"}</h1>
        <p>
          {activeTab === "works"
            ? "実際にお届けしたうちの子グッズの一部をご紹介します。"
            : hasReturnUrl
              ? "仕上がりの雰囲気を画像で見ながら選べるサンプル集です。気に入った番号をコピーして教えてね。"
              : "仕上がりの雰囲気を画像で見ながら選べるサンプル集です。気に入った番号をコピーして教えてね。"}
        </p>
      </section>

      {activeTab === "catalog" && (
        <section className="park-gallery-panel">
          <div className="park-section-head">
            <span>STYLE CATALOG</span>
            <h2>スタイルカタログ</h2>
            <p>水彩・刺繍の定番と、変身・季節・ファンタジーなどのスタイルを、仕上がりイメージから探せるようにまとめています。</p>
          </div>

          <div className="park-copy-guide" aria-label="注文番号の使い方">
            <div>
              <p>気に入った番号をコピーしてね！</p>
            </div>
            <button type="button" onClick={returnToOrderPage}>
              {hasReturnUrl ? "注文ページに戻る" : "閉じて戻ってね"}
            </button>
          </div>

          <nav className="park-catalog-jump" aria-label="スタイルの種類">
            <a href="#catalog-watercolor">水彩</a>
            <a href="#catalog-embroidery">刺繍</a>
            {otherManualStyleSections.map((section) => (
              <a href={`#catalog-${section.key}`} key={section.key}>{section.title}</a>
            ))}
            {noteCatalogSections.map((section) => (
              <a href={`#${section.key}`} key={section.key}>{section.title}</a>
            ))}
          </nav>

          <div className="park-catalog-subhead" id="catalog-watercolor">
            <strong>水彩</strong>
          </div>
          {watercolorStyleSections.map((section, sectionIndex) => (
            <section className="park-style-section" key={section.key}>
              <h3>{section.title}</h3>
              <p>{section.description}</p>
              <div className="park-style-grid">
                {section.entries.map((entry, entryIndex) => renderStyleCard(entry, sectionIndex === 0 && entryIndex < 4))}
              </div>
            </section>
          ))}

          <div className="park-catalog-subhead" id="catalog-embroidery">
            <strong>刺繍</strong>
            <span>布小物やグッズに合わせやすい、ぬくもりのあるスタイルです。定番刺繍と、お花・スイーツの刺繍スタイルをまとめています。</span>
          </div>
          {embroideryStyleSections.map((section) => (
            <section className="park-style-section" key={section.key}>
              <h3>{section.title}</h3>
              <p>{section.description}</p>
              <div className="park-style-grid">
                {section.entries.filter((entry) => !EMBROIDERY_GROUPED_MANUAL_STYLE_IDS.has(entry.id)).map((entry) => renderStyleCard(entry))}
              </div>
              {embroideryCatalogStyleGroups.map((group) => (
                <div className="park-embroidery-group" key={group.key}>
                  <h4>
                    {group.title}
                    <span className="park-section-count">{group.styles.length}件</span>
                  </h4>
                  <p>{group.description}</p>
                  <div className="park-style-grid">
                    {group.styles.map((entry) => (
                      <button
                        className="park-style-card park-embroidery-card"
                        type="button"
                        key={entry.id}
                        onClick={() => setLightbox(entry.lightbox)}
                        aria-label={`${entry.id} ${entry.title}を開く`}
                      >
                        <div className={`park-style-image ${entry.size === "square" ? "square" : ""}`}>
                          <img src={entry.image} alt={entry.title} loading="lazy" />
                        </div>
                        <div className="park-card-body">
                          <strong>{entry.title}</strong>
                          <span>
                            <span className={`park-copy-code${copiedCode === entry.id ? " copied" : ""}`} onClick={(event) => copyStyleCode(entry.id, event)} title={`${entry.id}をコピー`}>
                              <b>{entry.id}</b>
                              <small>コピー</small>
                            </span>
                            <small>{entry.tag}</small>
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </section>
          ))}

          {otherManualStyleSections.map((section) => (
            <section className="park-style-section" id={`catalog-${section.key}`} key={section.key}>
              <h3>{section.title}</h3>
              <p>{section.description}</p>
              <div className="park-style-grid">
                {section.entries.map((entry) => renderStyleCard(entry))}
              </div>
            </section>
          ))}

          <div className="park-catalog-subhead park-catalog-note-head">
            <strong>そのほかのスタイルを探す</strong>
            <span>サムネイルを開くと、同じスタイルの追加イメージを左右でめくって確認できます。</span>
          </div>

          {catalogLoading && <div className="park-empty-state">スタイルカタログを読み込み中...</div>}
          {!catalogLoading && catalogError && <div className="park-empty-state">{catalogError}</div>}
          {!catalogLoading && !catalogError && catalogEntries.length === 0 && <div className="park-empty-state">スタイルカタログの項目がまだありません。</div>}
          {!catalogLoading && !catalogError && noteCatalogSections.map((section, sectionIndex) => {
            const manualSections = manualNoteSectionsByKey.get(section.key) || [];
            const manualEntries = manualSections.flatMap((manualSection) => manualSection.entries);
            const manualEntryCount = manualEntries.reduce((total, entry) => total + getStyleEntryDisplayCount(entry), 0);
            return (
            <section className="park-style-section park-note-section" id={section.key} key={section.key}>
              <h3>
                {section.title}
                <span className="park-section-count">{section.entries.length + manualEntryCount}件</span>
              </h3>
              <p>{section.description}</p>
              <div className="park-catalog-grid">
                {manualEntries.map((entry) => renderStyleCard(entry))}
                {section.entries.map((entry, cardIndex) => {
                  const entryIndex = catalogEntries.findIndex((item) => item.catalogNo === entry.catalogNo);
                  const variants = getActiveCatalogVariants(entry);
                  const previewVariants = getCatalogPreviewVariants(entry);
                  const title = getNoteCatalogTitle(entry);
                  const catalogCode = getCatalogEntryCode(entry);
                  return (
                    <button
                      className="park-style-card park-catalog-card"
                      type="button"
                      key={`${entry.catalogNo}-${entry.url}`}
                      onClick={() => setLightbox({ source: "catalog", entryIndex: Math.max(entryIndex, 0), variantIndex: 0 })}
                      aria-label={`${catalogCode} ${title}を開く`}
                    >
                      <div className={`park-catalog-thumb ${previewVariants.length > 1 ? "multi" : ""}`}>
                        {previewVariants.map((variant, index) => (
                          <img
                            src={variant.image}
                            alt={`${title} ${index + 1}`}
                            loading={sectionIndex === 0 && cardIndex < 2 && index === 0 ? "eager" : "lazy"}
                            fetchpriority={sectionIndex === 0 && cardIndex < 2 && index === 0 ? "high" : "auto"}
                            key={`${variant.image}-${index}`}
                          />
                        ))}
                        {variants.length > previewVariants.length && <span className="park-catalog-more">+{variants.length - previewVariants.length}</span>}
                      </div>
                      <div className="park-card-body">
                        <strong>{title}</strong>
                        <span>
                          <span className={`park-copy-code${copiedCode === catalogCode ? " copied" : ""}`} onClick={(event) => copyStyleCode(catalogCode, event)} title={`${catalogCode}をコピー`}>
                            <b>{catalogCode}</b>
                            <small>コピー</small>
                          </span>
                          <small>バリエ {variants.length}枚</small>
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
            );
          })}
        </section>
      )}

      {activeTab === "works" && (
        <section className="park-gallery-panel">
          <div className="park-section-head park-works-head">
            <span>WORKS</span>
            <h2>みんなのうちの子グッズ</h2>
            <p>まずは一部の制作事例を表示しています。</p>
          </div>

          <div className="park-category-tabs" role="tablist" aria-label="カテゴリ絞り込み">
            {PRODUCT_CATEGORIES.map((category) => (
              <button
                key={category}
                type="button"
                aria-selected={activeCategory === category}
                onClick={() => setActiveCategory(category)}
              >
                {category}
                <small>{categoryCounts[category] || 0}</small>
              </button>
            ))}
          </div>

          {loading && <div className="park-empty-state">読み込み中...</div>}
          {!loading && error && <div className="park-empty-state">{error}</div>}
          {!loading && !error && visibleItems.length === 0 && <div className="park-empty-state">まだ制作事例がありません。</div>}
          {!loading && !error && visibleItems.length > 0 && (
            <>
              <div className="park-work-grid">
                {displayedWorkItems.map((item, index) => {
                  const title = normalizeTitle(item);
                  const galleryNo = item.galleryNo || item.gallery_no || formatGalleryNo(index + 1);
                  const thumbUrl = getGalleryThumbUrl(item);
                  const imageUrl = getGalleryImageUrl(item);
                  return (
                    <button
                      className="park-work-card"
                      type="button"
                      key={`${imageUrl || galleryNo}-${galleryNo}`}
                      onClick={() => setLightbox({ source: "works", itemIndex: index })}
                      aria-label={`${title}の制作事例を開く`}
                    >
                      <div className={`park-card-image${thumbUrl ? "" : " placeholder"}`}>
                        {thumbUrl ? (
                          <img src={thumbUrl} alt={title} loading={index < 8 ? "eager" : "lazy"} fetchpriority={index < 4 ? "high" : "auto"} />
                        ) : (
                          <span className="park-card-image-placeholder">OPEN</span>
                        )}
                      </div>
                      <div className="park-card-body park-work-card-body">
                        <strong>{title}</strong>
                      </div>
                    </button>
                  );
                })}
              </div>
              {isWorksPreviewLimited && (
                <div className="park-work-more">
                  <p>まずは{displayedWorkItems.length}件だけ表示しています。</p>
                  <button type="button" onClick={() => setShowAllWorks(true)}>
                    すべての制作事例を見る（{visibleItems.length}件）
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      )}

      {lightbox && (
        <div className="park-lightbox" role="dialog" aria-modal="true" aria-label="画像プレビュー" onClick={() => setLightbox(null)}>
          <button className="park-lightbox-close" type="button" aria-label="閉じる">
            ×
          </button>
          <button
            className="park-lightbox-nav park-lightbox-prev"
            type="button"
            aria-label="前の画像"
            onClick={(event) => {
              event.stopPropagation();
              moveLightbox(-1);
            }}
          >
            ‹
          </button>
          <button
            className="park-lightbox-nav park-lightbox-next"
            type="button"
            aria-label="次の画像"
            onClick={(event) => {
              event.stopPropagation();
              moveLightbox(1);
            }}
          >
            ›
          </button>
          <div
            className="park-lightbox-inner"
            onClick={(event) => event.stopPropagation()}
            onTouchStart={(event) => {
              const touch = event.touches[0];
              swipeStartRef.current = { x: touch.clientX, y: touch.clientY };
            }}
            onTouchEnd={handleLightboxTouchEnd}
          >
            {currentCatalogEntry && currentCatalogVariant && (
              <>
                <img src={currentCatalogVariant.image} alt={currentCatalogVariant.label || currentCatalogTitle} />
                <div>
                  <strong>{currentCatalogTitle}</strong>
                  <span>
                    {currentCatalogCode} / {currentCatalogLabel} /{" "}
                    {lightbox.source === "catalog" ? lightbox.variantIndex + 1 : 1} of {currentCatalogVariants.length}
                  </span>
                  <button className="park-lightbox-copy" type="button" onClick={(event) => copyStyleCode(currentCatalogCode, event)}>
                    {currentCatalogCode} をコピー
                  </button>
                </div>
              </>
            )}
            {currentWork && currentWorkImageUrl && (
              <>
                <img src={currentWorkImageUrl} alt={normalizeTitle(currentWork)} />
                <div>
                  <strong>{normalizeTitle(currentWork)}</strong>
                </div>
              </>
            )}
            {currentStyle && currentStyleVariant && (
              <>
                <img src={currentStyleVariant.image} alt={currentStyleLabel || currentStyle.title} />
                <div>
                  <strong>{currentStyle.title}</strong>
                  <span>
                    {currentStyleCode} / {currentStyleLabel}
                    {currentStyleVariants.length > 1 ? ` / ${(lightbox.variantIndex || 0) + 1} of ${currentStyleVariants.length}` : ""}
                  </span>
                  <button className="park-lightbox-copy" type="button" onClick={(event) => copyStyleCode(currentStyleCode, event)}>
                    {currentStyleCode} をコピー
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
      {showPageShortcuts && !lightbox && (
        <div className="park-catalog-float" aria-label={activeTab === "catalog" ? "カタログ操作" : "制作事例操作"}>
          <button type="button" onClick={scrollPageToTop}>
            ↑ 上へ
          </button>
          {activeTab === "catalog" && (
            <button type="button" onClick={returnToOrderPage}>
              {hasReturnUrl ? "戻る" : "閉じる"}
            </button>
          )}
        </div>
      )}
      {copiedCode && (
        <div className="toast park-copy-toast">
          <span>{copiedCode} コピーしたよ！</span>
          {activeTab === "catalog" && (
            <button type="button" onClick={returnToOrderPage}>
              {hasReturnUrl ? "戻ってね！" : "閉じて戻ってね"}
            </button>
          )}
        </div>
      )}
    </main>
  );
}
