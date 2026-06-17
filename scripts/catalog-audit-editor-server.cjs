const http = require("http");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const publicCatalogPath = path.join(root, "public", "assets", "note-ai-catalog-20260512.json");
const distCatalogPath = path.join(root, "dist", "assets", "note-ai-catalog-20260512.json");
const dictionaryPath = "C:\\Users\\genge\\aikoanimal-hosting-new\\assets-private\\note-recipes\\note-catalog-dictionary-20260512.json";
const port = Number(process.env.CATALOG_AUDIT_PORT || 8789);
const referenceRule = `【うちの子参照ルール】
添付写真の{ANIMAL_DESCRIPTION}を最優先で参照し、同一の子として自然に再現してください。
描写する動物は{ANIMAL_COUNT}のみ。複数匹指定がある場合は、指定された匹数だけを自然に配置してください。
名前を入れるスタイルでは「{petName}」を使ってください。名前不要のスタイルでは文字を追加しないでください。
出力比率は{ASPECT_RATIO}に合わせてください。
追加希望・色・雰囲気・NG事項がある場合は、{CUSTOM_NOTES}を反映してください。
顔立ち、毛色、模様、耳、目、鼻、口元、体格など、写真の個体差をできるだけ保ってください。

【スタイル本文】
`;

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(JSON.stringify(payload, null, 2));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 25 * 1024 * 1024) {
        req.destroy();
        reject(new Error("request body too large"));
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function normalizeCatalog(data) {
  const next = {
    ...data,
    updatedAt: new Date().toISOString(),
    entries: Array.isArray(data.entries) ? data.entries : [],
  };
  next.entries = next.entries.map((entry) => {
    const variants = Array.isArray(entry.variants) ? entry.variants.filter((variant) => !variant._deleted && variant.image) : [];
    const usedManagementNos = new Set(variants.map((variant) => variant.managementNo).filter(Boolean));
    const usedPromptIds = new Set(variants.map((variant) => variant.promptId).filter(Boolean));
    variants.forEach((variant, index) => {
      if (!variant.promptDraft || (variant.managementNo && variant.promptId)) return;
      const baseNo = String(entry.catalogNo || "NC-000");
      let serial = index + 1;
      let managementNo = variant.managementNo || `${baseNo}-${String(serial).padStart(2, "0")}`;
      while (!variant.managementNo && usedManagementNos.has(managementNo)) {
        serial += 1;
        managementNo = `${baseNo}-${String(serial).padStart(2, "0")}`;
      }
      if (!variant.managementNo) {
        variant.managementNo = managementNo;
        usedManagementNos.add(managementNo);
      }
      let promptId = variant.promptId || `note_catalog_${String(variant.managementNo).toLowerCase().replace(/-/g, "_")}`;
      let suffix = 2;
      while (!variant.promptId && usedPromptIds.has(promptId)) {
        promptId = `note_catalog_${String(variant.managementNo).toLowerCase().replace(/-/g, "_")}_${suffix}`;
        suffix += 1;
      }
      if (!variant.promptId) {
        variant.promptId = promptId;
        usedPromptIds.add(promptId);
      }
    });
    return {
      ...entry,
      variants,
      images: variants.map((variant) => ({ src: variant.image })),
    };
  });
  return next;
}

function backupFile(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = `${filePath}.bak-${stamp}`;
  fs.copyFileSync(filePath, backupPath);
  return backupPath;
}

function buildPromptBody(promptDraft) {
  const body = String(promptDraft || "").trim();
  if (!body) return "";
  if (body.includes("【うちの子参照ルール】")) return body;
  return `${referenceRule}${body}`;
}

function syncDictionary(data) {
  if (!fs.existsSync(dictionaryPath)) return { updated: 0, inserted: 0, path: null };
  backupFile(dictionaryPath);
  const dictionary = JSON.parse(fs.readFileSync(dictionaryPath, "utf8"));
  if (!Array.isArray(dictionary.prompts)) dictionary.prompts = [];
  const byPromptId = new Map(dictionary.prompts.map((prompt, index) => [prompt.promptId || prompt.id, { prompt, index }]));
  const byManagementNo = new Map(dictionary.prompts.map((prompt, index) => [prompt.managementNo || prompt.styleNo, { prompt, index }]));
  let updated = 0;
  let inserted = 0;
  let maxOrder = dictionary.prompts.reduce((max, prompt) => Math.max(max, Number(prompt.order) || 0), 9000);
  for (const entry of data.entries || []) {
    for (const variant of entry.variants || []) {
      if (!variant.promptDraft || !variant.managementNo || !variant.promptId) continue;
      const promptBody = buildPromptBody(variant.promptDraft);
      const title = `${entry.cleanTitle || entry.shortTitle || entry.title || entry.catalogNo} / ${variant.label || variant.managementNo}`;
      const existing = byPromptId.get(variant.promptId) || byManagementNo.get(variant.managementNo);
      if (existing) {
        Object.assign(existing.prompt, {
          id: variant.promptId,
          promptId: variant.promptId,
          styleNo: variant.managementNo,
          managementNo: variant.managementNo,
          title,
          label: variant.label || variant.managementNo,
          prompt: promptBody,
          thumbnailUrl: variant.image || entry.thumbnail || existing.prompt.thumbnailUrl,
          previewImagePath: variant.image || entry.thumbnail || existing.prompt.previewImagePath,
          updatedAt: new Date().toISOString(),
        });
        updated += 1;
      } else {
        maxOrder += 1;
        const prompt = {
          id: variant.promptId,
          promptId: variant.promptId,
          styleNo: variant.managementNo,
          managementNo: variant.managementNo,
          title,
          label: variant.label || variant.managementNo,
          prompt: promptBody,
          categoryId: "note-catalog",
          category: "AIカタログ",
          styleCategoryId: "note-catalog",
          styleCategory: "AIカタログ",
          styleSeries: entry.cleanTitle || entry.shortTitle || entry.title || entry.catalogNo,
          tags: ["note回収", "AIカタログ"],
          variables: ["{ANIMAL_DESCRIPTION}", "{ANIMAL_COUNT}", "{petName}", "{ASPECT_RATIO}", "{CUSTOM_NOTES}"],
          standardVariables: ["{ANIMAL_DESCRIPTION}", "{ANIMAL_COUNT}", "{petName}", "{ASPECT_RATIO}", "{CUSTOM_NOTES}"],
          variableReady: true,
          isActive: true,
          enabled: true,
          order: maxOrder,
          defaultSize: "square",
          defaultCount: 1,
          aspectRatioText: "正方形（1:1）",
          outputRatioText: "正方形（1:1）",
          thumbnailUrl: variant.image || entry.thumbnail || "",
          previewImagePath: variant.image || entry.thumbnail || "",
          noteUrl: entry.url || "",
          source: "catalog-audit-editor",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        dictionary.prompts.push(prompt);
        byPromptId.set(prompt.promptId, { prompt, index: dictionary.prompts.length - 1 });
        byManagementNo.set(prompt.managementNo, { prompt, index: dictionary.prompts.length - 1 });
        inserted += 1;
      }
    }
  }
  fs.writeFileSync(dictionaryPath, `${JSON.stringify(dictionary, null, 2)}\n`, "utf8");
  return { updated, inserted, path: dictionaryPath };
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "GET" && req.url === "/api/health") {
    sendJson(res, 200, { ok: true, publicCatalogPath, distCatalogPath });
    return;
  }

  if (req.method === "GET" && req.url === "/api/catalog") {
    try {
      const data = JSON.parse(fs.readFileSync(publicCatalogPath, "utf8"));
      sendJson(res, 200, { ok: true, data });
    } catch (error) {
      sendJson(res, 500, { ok: false, error: error.message });
    }
    return;
  }

  if (req.method === "POST" && req.url === "/api/catalog/save") {
    try {
      const body = JSON.parse(await readBody(req));
      const data = normalizeCatalog(body.data || body);
      const publicBackup = backupFile(publicCatalogPath);
      fs.writeFileSync(publicCatalogPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
      let distBackup = null;
      if (fs.existsSync(path.dirname(distCatalogPath))) {
        distBackup = backupFile(distCatalogPath);
        fs.writeFileSync(distCatalogPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
      }
      const dictionarySync = process.env.CATALOG_SYNC_DICTIONARY === "1"
        ? syncDictionary(data)
        : { skipped: true, reason: "review-only; set CATALOG_SYNC_DICTIONARY=1 to sync dictionary" };
      sendJson(res, 200, {
        ok: true,
        entries: data.entries.length,
        publicCatalogPath,
        distCatalogPath: fs.existsSync(path.dirname(distCatalogPath)) ? distCatalogPath : null,
        dictionarySync,
        backups: [publicBackup, distBackup].filter(Boolean),
      });
    } catch (error) {
      sendJson(res, 500, { ok: false, error: error.message });
    }
    return;
  }

  sendJson(res, 404, { ok: false, error: "not found" });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Catalog audit editor API: http://127.0.0.1:${port}`);
  console.log(`Editing: ${publicCatalogPath}`);
});
