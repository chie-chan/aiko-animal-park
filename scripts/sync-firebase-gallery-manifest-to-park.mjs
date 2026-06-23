import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PARK_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LOCAL_MANIFEST_PATH = path.join(PARK_ROOT, "public", "gallery-manifest.json");
const WORKS_DIR = path.join(PARK_ROOT, "public", "assets", "gallery", "works");
const REMOTE_MANIFEST_URL =
  "https://firebasestorage.googleapis.com/v0/b/aiko-animal-orders-stg.firebasestorage.app/o/gallery-manifest.json?alt=media";

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");

function galleryNoNumber(value) {
  const match = String(value || "").match(/G-(\d+)/i);
  return match ? Number(match[1]) || 0 : 0;
}

function safePublicText(value, fallback = "") {
  return String(value || fallback || "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[A-Z0-9]{12,}/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extensionFromContentType(contentType, fallbackUrl) {
  const type = String(contentType || "").toLowerCase();
  if (type.includes("webp")) return ".webp";
  if (type.includes("png")) return ".png";
  if (type.includes("jpeg") || type.includes("jpg")) return ".jpg";
  const cleanUrl = String(fallbackUrl || "").split("?")[0];
  const ext = path.extname(decodeURIComponent(cleanUrl)).toLowerCase();
  return [".webp", ".png", ".jpg", ".jpeg"].includes(ext) ? ext : ".webp";
}

function assetNameFor(item, bytes, contentType) {
  const no = String(item.galleryNo || "").toLowerCase();
  const hash = crypto.createHash("sha1").update(bytes).digest("hex").slice(0, 16);
  let sourceName = "sns-card";
  try {
    const url = new URL(item.imageUrl);
    const object = decodeURIComponent(url.pathname.split("/o/")[1] || "");
    sourceName = path.basename(object).replace(/\.[^.]+$/, "") || sourceName;
  } catch {
    sourceName = String(item.selectedDesign || item.productName || sourceName);
  }
  const cleaned = sourceName
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 72) || "sns-card";
  return `${no}-${cleaned}-${hash}${extensionFromContentType(contentType, item.imageUrl)}`;
}

function publicItemFromRemote(item, publicPath) {
  const productName = safePublicText(item.productTypeLabel || item.productName || item.selectedDesignName, "制作事例");
  return {
    galleryNo: String(item.galleryNo || "").trim().toUpperCase(),
    productName,
    selectedDesignName: safePublicText(item.selectedDesignName || productName, productName),
    createdAt: safePublicText(item.createdAt, new Date().toISOString().slice(0, 10)),
    imageUrl: publicPath,
    thumbnailUrl: publicPath,
  };
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

async function fetchJson(url) {
  const response = await fetch(`${url}&ts=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`Remote manifest fetch failed: ${response.status}`);
  return response.json();
}

async function downloadImage(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Image fetch failed: ${response.status} ${url}`);
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.toLowerCase().startsWith("image/")) {
    throw new Error(`Not an image: ${contentType} ${url}`);
  }
  return {
    bytes: Buffer.from(await response.arrayBuffer()),
    contentType,
  };
}

async function main() {
  const localItems = await readJson(LOCAL_MANIFEST_PATH, []);
  const remoteItemsRaw = await fetchJson(REMOTE_MANIFEST_URL);
  const remoteItems = Array.isArray(remoteItemsRaw.items)
    ? remoteItemsRaw.items
    : Array.isArray(remoteItemsRaw)
      ? remoteItemsRaw
      : [];

  const localNos = new Set(localItems.map((item) => String(item.galleryNo || "").toUpperCase()));
  const missing = remoteItems
    .filter((item) => /^G-\d+$/i.test(String(item.galleryNo || "")))
    .filter((item) => item.imageUrl && !localNos.has(String(item.galleryNo || "").toUpperCase()))
    .sort((a, b) => galleryNoNumber(b.galleryNo) - galleryNoNumber(a.galleryNo));

  console.log(`remote=${remoteItems.length} local=${localItems.length} missing=${missing.length}`);
  if (!missing.length) return;

  if (!apply) {
    for (const item of missing) {
      console.log(`[dry-run] ${item.galleryNo} ${safePublicText(item.productName || item.selectedDesignName, "制作事例")} ${item.createdAt || ""}`);
    }
    console.log("Run with --apply to download public card images and update public/gallery-manifest.json.");
    return;
  }

  await fs.mkdir(WORKS_DIR, { recursive: true });
  const imported = [];
  for (const item of missing) {
    const { bytes, contentType } = await downloadImage(item.thumbnailUrl || item.imageUrl);
    const fileName = assetNameFor(item, bytes, contentType);
    const filePath = path.join(WORKS_DIR, fileName);
    await fs.writeFile(filePath, bytes);
    const publicPath = `/assets/gallery/works/${fileName}`;
    imported.push(publicItemFromRemote(item, publicPath));
    console.log(`imported ${item.galleryNo} -> ${publicPath} (${Math.round(bytes.length / 1024)}KB)`);
  }

  const nextItems = [...imported, ...localItems]
    .filter((item, index, array) => {
      const no = String(item.galleryNo || "").toUpperCase();
      return no && array.findIndex((candidate) => String(candidate.galleryNo || "").toUpperCase() === no) === index;
    })
    .slice(0, 300);

  await fs.writeFile(LOCAL_MANIFEST_PATH, `${JSON.stringify(nextItems, null, 2)}\n`, "utf8");
  console.log(`updated ${LOCAL_MANIFEST_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
