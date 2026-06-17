#!/usr/bin/env node
/* eslint-disable no-console */
"use strict";

const fs = require("fs");
const path = require("path");

let sharp;
try {
  sharp = require("sharp");
} catch {
  sharp = require("C:/Users/genge/aikoanimal-hosting-new/functions/node_modules/sharp");
}

const reviewManifestPath = "C:/Users/genge/aikoanimal-hosting-new/local-ops/public/generated/threads-present-review/manifest.json";
const publicRoot = path.resolve(__dirname, "..", "public");
const outputRoot = path.join(publicRoot, "threads-present-followup");
const afterDir = path.join(outputRoot, "after-jpg");
const beforeDir = path.join(outputRoot, "before-jpg");
const gridDir = path.join(outputRoot, "instagram-grid");
const manifestPath = path.join(outputRoot, "manifest.json");
const templatePath = path.join(outputRoot, "template", "blank-4.png");
const fallbackTemplatePath = "C:/Users/genge/Desktop/動物/新しいフォルダー/写真から/4.png";
const publicBase = "https://aiko-animal-park.pages.dev/threads-present-followup";

function safeSlug(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/[^\w.-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80) || "item";
}

function assertInside(child, parent) {
  const rel = path.relative(parent, child);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(`Refusing to write outside ${parent}: ${child}`);
  }
}

async function squareJpeg(inputPath, outputPath, quality) {
  await sharp(inputPath)
    .rotate()
    .resize(1080, 1080, {
      fit: "contain",
      background: "#fffaf2",
      withoutEnlargement: false,
    })
    .flatten({ background: "#fffaf2" })
    .jpeg({ quality, mozjpeg: true })
    .toFile(outputPath);
}

async function templateGrid(inputPath, outputPath) {
  const template = fs.existsSync(templatePath) ? templatePath : fallbackTemplatePath;
  if (!fs.existsSync(template)) throw new Error(`Missing grid template: ${template}`);

  const card = await sharp(inputPath)
    .rotate()
    .resize(1048, 675, {
      fit: "contain",
      background: "#faf6ee",
      withoutEnlargement: false,
    })
    .flatten({ background: "#faf6ee" })
    .jpeg({ quality: 90 })
    .toBuffer();

  await sharp(template)
    .rotate()
    .composite([{ input: card, left: 16, top: 367 }])
    .jpeg({ quality: 90, mozjpeg: true })
    .toFile(outputPath);
}

async function main() {
  assertInside(outputRoot, publicRoot);
  fs.mkdirSync(afterDir, { recursive: true });
  fs.mkdirSync(beforeDir, { recursive: true });
  fs.mkdirSync(gridDir, { recursive: true });

  const review = JSON.parse(fs.readFileSync(reviewManifestPath, "utf8"));
  const publicManifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const extraItems = (review.items || []).filter((item) => Number(item.no) >= 98);
  if (!extraItems.length) throw new Error("No review extra items found. Rebuild the review manifest first.");

  const built = [];
  for (const item of extraItems) {
    const slug = `${item.no}_${safeSlug(item.account)}`;
    const afterFile = `${slug}.jpg`;
    const beforeFile = `${slug}.jpg`;
    const gridFile = `${slug}.jpg`;

    for (const [label, filePath] of [
      ["after", item.afterPath],
      ["before", item.beforePath],
      ["beforeAfter", item.beforeAfterPath],
    ]) {
      if (!fs.existsSync(filePath)) throw new Error(`Missing ${label}: ${filePath}`);
    }

    await squareJpeg(item.afterPath, path.join(afterDir, afterFile), 86);
    await squareJpeg(item.beforePath, path.join(beforeDir, beforeFile), 84);
    await templateGrid(item.beforeAfterPath, path.join(gridDir, gridFile));

    built.push({
      id: item.id,
      no: item.no,
      account: item.account,
      mention: item.mention,
      label: item.label,
      displayName: item.displayName,
      flower: item.flower,
      postText: item.postText,
      replyText: item.replyText,
      assets: {
        after: `${publicBase}/after-jpg/${encodeURIComponent(afterFile)}`,
        before: `${publicBase}/before-jpg/${encodeURIComponent(beforeFile)}`,
        goodsIntro: `${publicBase}/goods-intro.jpg`,
        instagramGrid: `${publicBase}/instagram-grid/${encodeURIComponent(gridFile)}`,
      },
      images: {
        threads: [
          `${publicBase}/after-jpg/${encodeURIComponent(afterFile)}`,
          `${publicBase}/before-jpg/${encodeURIComponent(beforeFile)}`,
          `${publicBase}/goods-intro.jpg`,
        ],
        x: [
          `${publicBase}/after-jpg/${encodeURIComponent(afterFile)}`,
          `${publicBase}/before-jpg/${encodeURIComponent(beforeFile)}`,
          `${publicBase}/goods-intro.jpg`,
        ],
        instagram: [
          `${publicBase}/instagram-grid/${encodeURIComponent(gridFile)}`,
          `${publicBase}/after-jpg/${encodeURIComponent(afterFile)}`,
          `${publicBase}/before-jpg/${encodeURIComponent(beforeFile)}`,
          `${publicBase}/goods-intro.jpg`,
        ],
      },
    });
  }

  const baseItems = (publicManifest.items || []).filter((item) => Number(item.no) < 98);
  const nextManifest = {
    ...publicManifest,
    generatedAt: new Date().toISOString(),
    count: baseItems.length + built.length,
    schedule: {
      startDate: "2026-06-07",
      times: ["12:00", "16:00", "20:40"],
      timezone: "Asia/Tokyo",
    },
    items: [...baseItems, ...built],
  };
  fs.writeFileSync(manifestPath, `${JSON.stringify(nextManifest, null, 2)}\n`, "utf8");

  console.log(JSON.stringify({
    ok: true,
    base: baseItems.length,
    extra: built.length,
    count: nextManifest.count,
    firstExtra: built[0],
    lastExtra: built[built.length - 1],
    manifest: manifestPath,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
