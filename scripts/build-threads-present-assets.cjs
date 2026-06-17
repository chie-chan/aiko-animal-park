const fs = require("fs");
const path = require("path");

let sharp;
try {
  sharp = require("sharp");
} catch {
  sharp = require("C:/Users/genge/aikoanimal-hosting-new/functions/node_modules/sharp");
}

const sourceRoot = "C:/Users/genge/Desktop/threads-sunflower-watercolor-trials";
const manifestPath = path.join(sourceRoot, "before-after-97", "before-after-97.manifest.json");
const extraManifestPath = path.join(sourceRoot, "before-after-extra", "before-after-extra.manifest.json");
const publicRoot = path.resolve(__dirname, "..", "public");
const outputRoot = path.resolve(publicRoot, "threads-present");
const afterDir = path.join(outputRoot, "after-webp");
const proofDir = path.join(outputRoot, "before-after-webp");

function assertInside(child, parent) {
  const rel = path.relative(parent, child);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(`Refusing to write outside ${parent}: ${child}`);
  }
}

function safeSlug(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "pet";
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function flowerFromFile(fileName = "") {
  if (/ajisai/i.test(fileName)) return "紫陽花";
  if (/himawari/i.test(fileName)) return "ひまわり";
  return "水彩";
}

async function roundedThumb(inputPath, size) {
  const image = await sharp(inputPath)
    .rotate()
    .resize(size, size, {
      fit: "contain",
      background: "#fffdf8",
      withoutEnlargement: false,
    })
    .flatten({ background: "#fffdf8" })
    .jpeg({ quality: 86 })
    .toBuffer();

  const radius = Math.round(size * 0.11);
  const mask = Buffer.from(
    `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <rect x="0" y="0" width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="#fff"/>
    </svg>`
  );
  return sharp(image)
    .composite([{ input: mask, blend: "dest-in" }])
    .png()
    .toBuffer();
}

async function buildCollage(items) {
  const width = 1600;
  const height = 1600;
  const margin = 54;
  const headerHeight = 280;
  const gridGap = 9;
  const columns = 10;
  const rows = 10;
  const gridTop = headerHeight;
  const cell = Math.floor((width - margin * 2 - gridGap * (columns - 1)) / columns);

  const base = sharp({
    create: {
      width,
      height,
      channels: 4,
      background: "#fffaf3",
    },
  });

  const headerSvg = Buffer.from(
    `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#fff1f6"/>
          <stop offset="48%" stop-color="#fff7df"/>
          <stop offset="100%" stop-color="#eef8f0"/>
        </linearGradient>
      </defs>
      <rect width="${width}" height="${height}" fill="url(#bg)"/>
      <rect x="28" y="28" width="${width - 56}" height="${height - 56}" rx="34" fill="none" stroke="#e7d6bd" stroke-width="4"/>
      <text x="${margin}" y="94" fill="#8a4d67" font-family="Yu Gothic, Noto Sans JP, sans-serif" font-size="34" font-weight="800">aiko animal present</text>
      <text x="${margin}" y="172" fill="#2f302b" font-family="Yu Gothic, Noto Sans JP, sans-serif" font-size="76" font-weight="900">あいこからのプレゼント</text>
      <text x="${margin}" y="226" fill="#5e635a" font-family="Yu Gothic, Noto Sans JP, sans-serif" font-size="34" font-weight="700">${items.length}枚の水彩AIイラストをまとめました</text>
      <text x="${width - margin}" y="226" text-anchor="end" fill="#8a4d67" font-family="Yu Gothic, Noto Sans JP, sans-serif" font-size="28" font-weight="800">ご本人様DL用</text>
    </svg>`
  );

  const composites = [{ input: headerSvg, left: 0, top: 0 }];
  const thumbs = await Promise.all(
    items.map(async (item, index) => ({
      input: await roundedThumb(item.afterSourcePath, cell),
      left: margin + (index % columns) * (cell + gridGap),
      top: gridTop + Math.floor(index / columns) * (cell + gridGap),
    }))
  );
  composites.push(...thumbs.slice(0, columns * rows));

  await base
    .composite(composites)
    .jpeg({ quality: 88, mozjpeg: true })
    .toFile(path.join(outputRoot, "sns-thumbnail.jpg"));
}

async function buildHeroBackground(items) {
  const width = 1800;
  const height = 1200;
  const margin = 42;
  const gridGap = 10;
  const columns = 10;
  const rows = 7;
  const cell = Math.floor((width - margin * 2 - gridGap * (columns - 1)) / columns);

  const base = sharp({
    create: {
      width,
      height,
      channels: 4,
      background: "#fff7ea",
    },
  });

  const backgroundSvg = Buffer.from(
    `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#fff1f6"/>
          <stop offset="52%" stop-color="#fff7df"/>
          <stop offset="100%" stop-color="#eef8f0"/>
        </linearGradient>
      </defs>
      <rect width="${width}" height="${height}" fill="url(#bg)"/>
    </svg>`
  );

  const composites = [{ input: backgroundSvg, left: 0, top: 0 }];
  const thumbs = await Promise.all(
    items.slice(0, columns * rows).map(async (item, index) => ({
      input: await roundedThumb(item.afterSourcePath, cell),
      left: margin + (index % columns) * (cell + gridGap),
      top: margin + Math.floor(index / columns) * (cell + gridGap),
    }))
  );
  composites.push(...thumbs);

  await base
    .composite(composites)
    .jpeg({ quality: 86, mozjpeg: true })
    .toFile(path.join(outputRoot, "hero-collage.jpg"));
}

async function main() {
  assertInside(outputRoot, publicRoot);
  fs.rmSync(outputRoot, { recursive: true, force: true });
  fs.mkdirSync(afterDir, { recursive: true });
  fs.mkdirSync(proofDir, { recursive: true });

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const selected = manifest.selected || [];
  const extraManifest = fs.existsSync(extraManifestPath)
    ? JSON.parse(fs.readFileSync(extraManifestPath, "utf8"))
    : { selected: [] };
  const extraSelected = (extraManifest.selected || []).filter((entry) => {
    const proofSourcePath = entry.beforeAfterPath || path.join(sourceRoot, "before-after-extra", entry.beforeAfterFile || "");
    return fs.existsSync(proofSourcePath);
  });
  if (!Array.isArray(selected) || selected.length === 0) {
    throw new Error(`No selected entries in ${manifestPath}`);
  }

  const builtItems = [];
  for (const entry of selected) {
    const index = String(entry.index).padStart(3, "0");
    const account = entry.account || `account-${index}`;
    const label = entry.displayName || account;
    const slug = `${index}_${safeSlug(account)}`;
    const afterSourcePath = path.join(sourceRoot, entry.desktopOutputFile);
    const proofSourcePath = entry.beforeAfterPath || path.join(sourceRoot, "before-after-97", entry.beforeAfterFile);
    const afterFile = `${slug}.webp`;
    const proofFile = `${slug}_before_after.webp`;

    if (!fs.existsSync(afterSourcePath)) {
      throw new Error(`Missing after image: ${afterSourcePath}`);
    }
    if (!fs.existsSync(proofSourcePath)) {
      throw new Error(`Missing before-after image: ${proofSourcePath}`);
    }

    await sharp(afterSourcePath)
      .rotate()
      .resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82, effort: 5 })
      .toFile(path.join(afterDir, afterFile));

    await sharp(proofSourcePath)
      .rotate()
      .resize(1800, 1200, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80, effort: 5 })
      .toFile(path.join(proofDir, proofFile));

    builtItems.push({
      id: slug,
      no: index,
      account,
      label,
      flower: flowerFromFile(entry.desktopOutputFile),
      proofImage: `/threads-present/before-after-webp/${proofFile}`,
      afterImage: `/threads-present/after-webp/${afterFile}`,
      downloadName: `aiko-present-${slug}.webp`,
      afterSourcePath,
    });
  }

  for (const entry of extraSelected) {
    const index = String(builtItems.length + 1).padStart(3, "0");
    const account = entry.account || `extra-${index}`;
    const label = entry.displayName || account;
    const slug = `${index}_${safeSlug(account)}_extra_${String(entry.index || "").padStart(3, "0")}`;
    const afterSourcePath = path.join(sourceRoot, entry.desktopOutputFile);
    const proofSourcePath = entry.beforeAfterPath || path.join(sourceRoot, "before-after-extra", entry.beforeAfterFile);
    const afterFile = `${slug}.webp`;
    const proofFile = `${slug}_before_after.webp`;

    if (!fs.existsSync(afterSourcePath)) {
      throw new Error(`Missing extra after image: ${afterSourcePath}`);
    }
    if (!fs.existsSync(proofSourcePath)) {
      throw new Error(`Missing extra before-after image: ${proofSourcePath}`);
    }

    await sharp(afterSourcePath)
      .rotate()
      .resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82, effort: 5 })
      .toFile(path.join(afterDir, afterFile));

    await sharp(proofSourcePath)
      .rotate()
      .resize(1800, 1200, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80, effort: 5 })
      .toFile(path.join(proofDir, proofFile));

    builtItems.push({
      id: slug,
      no: index,
      account,
      label,
      flower: `${flowerFromFile(entry.desktopOutputFile)} / 追加分`,
      proofImage: `/threads-present/before-after-webp/${proofFile}`,
      afterImage: `/threads-present/after-webp/${afterFile}`,
      downloadName: `aiko-present-${slug}.webp`,
      afterSourcePath,
    });
  }

  await buildCollage(builtItems);
  await buildHeroBackground(builtItems);

  const publicManifest = {
    title: "あいこからのプレゼント",
    publishedAt: new Date().toISOString(),
    count: builtItems.length,
    campaign: "threads-monitor-watercolor-present-202606",
    distribution: {
      freeFormat: "軽量WebP",
      note: "該当するご本人様のみダウンロードできます。高画質PNG、透過、グッズ化は個別にご相談ください。",
    },
    assets: {
      snsThumbnail: "/threads-present/sns-thumbnail.jpg",
      heroBackground: "/threads-present/hero-collage.jpg",
    },
    items: builtItems.map(({ afterSourcePath, ...item }) => item),
  };

  fs.writeFileSync(
    path.join(outputRoot, "manifest.json"),
    `${JSON.stringify(publicManifest, null, 2)}\n`,
    "utf8"
  );

  const totals = [afterDir, proofDir, outputRoot].map((dir) => {
    const files = fs.readdirSync(dir).filter((name) => fs.statSync(path.join(dir, name)).isFile());
    const bytes = files.reduce((sum, name) => sum + fs.statSync(path.join(dir, name)).size, 0);
    return { dir, files: files.length, bytes };
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        count: builtItems.length,
        manifest: path.join(outputRoot, "manifest.json"),
        snsThumbnail: path.join(outputRoot, "sns-thumbnail.jpg"),
        totals,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
