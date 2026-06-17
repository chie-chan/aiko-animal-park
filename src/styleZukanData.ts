import { generatedStyleZukanCategories, generatedStyleZukanEntries } from "./styleZukanGeneratedData";

export type StyleZukanEntry = {
  id: string;
  title: string;
  category: string;
  subCategory?: string;
  tags: string[];
  image: string;
  description: string;
  recipePreview: string[];
  goodFor: string[];
  recommendedFor: string;
  requestUrl?: string;
};

export const styleZukanCategories = generatedStyleZukanCategories;

function inferSubCategory(entry: StyleZukanEntry) {
  if (entry.category !== "水彩") return entry.subCategory;
  if (entry.id === "W-007") return "ふんわり水彩";

  const text = [entry.id, entry.title, entry.description, ...entry.tags, ...entry.recipePreview].join(" ");
  if (/ノスタルジック|夕日|夕暮れ|光|逆光/.test(text)) return "ノスタルジック水彩";
  if (/コテージ|苺バスケット|バスケット|リネン|野花|赤毛のアン|田園/.test(text)) return "コテージコア水彩";
  if (/花|ボタニカル|リース|ラナンキュラス|カーネーション/.test(text)) return "お花・ボタニカル水彩";
  if (/スイーツ|クリームソーダ|プリン|ケーキ|苺/.test(text)) return "スイーツ水彩";
  if (/絵本|物語|アリス|童話/.test(text)) return "絵本・物語水彩";
  return "ふんわり水彩";
}

export const styleZukanEntries: StyleZukanEntry[] = generatedStyleZukanEntries.map((entry) => ({
  ...entry,
  subCategory: inferSubCategory(entry),
}));
