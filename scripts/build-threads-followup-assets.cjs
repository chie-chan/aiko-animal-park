#!/usr/bin/env node
/* eslint-disable no-console */
"use strict";

const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const localManifestPath = "C:/Users/genge/aikoanimal-hosting-new/local-ops/public/generated/threads-present-review/manifest.json";
const publicRoot = path.resolve(__dirname, "..", "public");
const outputRoot = path.join(publicRoot, "threads-present-followup");
const afterDir = path.join(outputRoot, "after-jpg");
const beforeDir = path.join(outputRoot, "before-jpg");
const gridDir = path.join(outputRoot, "instagram-grid");
const goodsFile = path.join(outputRoot, "goods-intro.jpg");
const publicBase = "https://aiko-animal-park.pages.dev/threads-present-followup";
const localBase = "http://127.0.0.1:17776";

function safeSlug(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/[^\w.-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80) || "item";
}

function imagePreviewUrl(localPath) {
  return `${localBase}/api/local/local-image-preview?path=${encodeURIComponent(localPath)}`;
}

function dataUrlToBuffer(dataUrl) {
  const match = String(dataUrl || "").match(/^data:image\/jpeg;base64,(.+)$/);
  if (!match) throw new Error("Expected JPEG data URL");
  return Buffer.from(match[1], "base64");
}

function writeJpeg(filePath, dataUrl) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, dataUrlToBuffer(dataUrl));
}

async function main() {
  const manifest = JSON.parse(fs.readFileSync(localManifestPath, "utf8"));
  const items = manifest.items || [];
  if (!items.length) throw new Error(`No review items in ${localManifestPath}`);

  fs.rmSync(outputRoot, { recursive: true, force: true });
  fs.mkdirSync(afterDir, { recursive: true });
  fs.mkdirSync(beforeDir, { recursive: true });
  fs.mkdirSync(gridDir, { recursive: true });

  const browser = await chromium.launch({
    headless: true,
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  });
  const page = await browser.newPage({ viewport: { width: 1200, height: 1200 } });
  await page.goto(`${localBase}/threads-present-review.html`, { waitUntil: "domcontentloaded" });

  const goodsUrl = imagePreviewUrl(items[0].goodsIntroPath);
  const goodsDataUrl = await page.evaluate(async ({ goodsUrl }) => {
    const image = await loadImage(goodsUrl);
    return squareJpeg(image, 1080, 0.86);

    function loadImage(src) {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(`image load failed: ${src}`));
        img.src = src;
      });
    }

    function drawContain(ctx, img, x, y, w, h) {
      const scale = Math.min(w / img.naturalWidth, h / img.naturalHeight);
      const dw = img.naturalWidth * scale;
      const dh = img.naturalHeight * scale;
      ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
    }

    function squareJpeg(img, size, quality) {
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fffaf2";
      ctx.fillRect(0, 0, size, size);
      drawContain(ctx, img, 0, 0, size, size);
      return canvas.toDataURL("image/jpeg", quality);
    }
  }, { goodsUrl });
  writeJpeg(goodsFile, goodsDataUrl);

  const built = [];
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    const slug = `${item.no}_${safeSlug(item.account)}`;
    const afterFile = `${slug}.jpg`;
    const beforeFile = `${slug}.jpg`;
    const gridFile = `${slug}.jpg`;

    const rendered = await page.evaluate(async ({ afterUrl, beforeUrl, account, label, no }) => {
      const [after, before] = await Promise.all([loadImage(afterUrl), loadImage(beforeUrl)]);
      return {
        after: squareJpeg(after, 1080, 0.86),
        before: squareJpeg(before, 1080, 0.84),
        grid: gridJpeg(after, before, { account, label, no }),
      };

      function loadImage(src) {
        return new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error(`image load failed: ${src}`));
          img.src = src;
        });
      }

      function roundedRect(ctx, x, y, w, h, r) {
        const radius = Math.min(r, w / 2, h / 2);
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.arcTo(x + w, y, x + w, y + h, radius);
        ctx.arcTo(x + w, y + h, x, y + h, radius);
        ctx.arcTo(x, y + h, x, y, radius);
        ctx.arcTo(x, y, x + w, y, radius);
        ctx.closePath();
      }

      function drawContain(ctx, img, x, y, w, h) {
        const scale = Math.min(w / img.naturalWidth, h / img.naturalHeight);
        const dw = img.naturalWidth * scale;
        const dh = img.naturalHeight * scale;
        ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
      }

      function squareJpeg(img, size, quality) {
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#fffaf2";
        ctx.fillRect(0, 0, size, size);
        drawContain(ctx, img, 28, 28, size - 56, size - 56);
        return canvas.toDataURL("image/jpeg", quality);
      }

      function drawPanel(ctx, img, x, y, w, h, title) {
        ctx.save();
        roundedRect(ctx, x, y, w, h, 28);
        ctx.fillStyle = "#ffffff";
        ctx.fill();
        ctx.strokeStyle = "#dfd2c3";
        ctx.lineWidth = 4;
        ctx.stroke();
        ctx.clip();
        drawContain(ctx, img, x + 22, y + 74, w - 44, h - 112);
        ctx.restore();
        ctx.fillStyle = "#5a4b3f";
        ctx.font = '700 34px "Yu Gothic", "Meiryo", sans-serif';
        ctx.textAlign = "center";
        ctx.fillText(title, x + w / 2, y + 48);
      }

      function gridJpeg(after, before, meta) {
        const canvas = document.createElement("canvas");
        canvas.width = 1080;
        canvas.height = 1080;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#fffaf2";
        ctx.fillRect(0, 0, 1080, 1080);

        ctx.fillStyle = "#f8e8df";
        roundedRect(ctx, 32, 32, 1016, 1016, 36);
        ctx.fill();
        ctx.strokeStyle = "#decfbd";
        ctx.lineWidth = 4;
        ctx.stroke();

        ctx.fillStyle = "#2e3030";
        ctx.font = '800 48px "Yu Gothic", "Meiryo", sans-serif';
        ctx.textAlign = "center";
        ctx.fillText("写真から水彩イラストへ", 540, 96);

        ctx.fillStyle = "#8b4b62";
        ctx.font = '700 30px "Yu Gothic", "Meiryo", sans-serif';
        const handle = `@${meta.account || ""}${meta.label && meta.label !== meta.account ? ` / ${meta.label}` : ""}`;
        ctx.fillText(handle.slice(0, 48), 540, 140);

        drawPanel(ctx, after, 70, 184, 455, 720, "完成イラスト");
        drawPanel(ctx, before, 555, 184, 455, 720, "元写真");

        ctx.fillStyle = "#2e3030";
        ctx.font = '800 30px "Yu Gothic", "Meiryo", sans-serif';
        ctx.fillText("写真から、やさしい水彩イラストにしました", 540, 970);

        ctx.fillStyle = "#82746a";
        ctx.font = '700 22px "Yu Gothic", "Meiryo", sans-serif';
        ctx.fillText(`aiko animal present ${meta.no || ""}`, 540, 1012);

        return canvas.toDataURL("image/jpeg", 0.88);
      }
    }, {
      afterUrl: imagePreviewUrl(item.afterPath),
      beforeUrl: imagePreviewUrl(item.beforePath),
      account: item.account,
      label: item.displayName || item.label || "",
      no: item.no,
    });

    writeJpeg(path.join(afterDir, afterFile), rendered.after);
    writeJpeg(path.join(beforeDir, beforeFile), rendered.before);
    writeJpeg(path.join(gridDir, gridFile), rendered.grid);

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

    if ((index + 1) % 10 === 0) console.log(`rendered ${index + 1}/${items.length}`);
  }

  await browser.close();

  const publicManifest = {
    ok: true,
    generatedAt: new Date().toISOString(),
    title: "Threads present follow-up assets",
    count: built.length,
    publicBase,
    schedule: {
      startDate: "2026-06-08",
      times: ["08:20", "12:20", "20:40"],
      timezone: "Asia/Tokyo",
    },
    items: built,
  };
  fs.writeFileSync(path.join(outputRoot, "manifest.json"), `${JSON.stringify(publicManifest, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    ok: true,
    count: built.length,
    outputRoot,
    manifest: path.join(outputRoot, "manifest.json"),
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
