const DEFAULT_RUSH_URL = "https://aikoanimal.base.shop/items/146802769";
const DEFAULT_LINE_URL = "https://lin.ee/hsoPQut";
const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const STATUS_OPEN = ["queued", "processing"];

let schemaReadyPromise = null;

export function text(value, max = 400) {
  return String(value || "").trim().slice(0, max);
}

export function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, max-age=0",
    },
  });
}

export function requireMethod(request, allowed) {
  if (allowed.includes(request.method)) return null;
  return jsonResponse({ok: false, error: "method_not_allowed"}, 405);
}

export function getDb(env) {
  return env && env.GIFT_DB;
}

export function getBucket(env) {
  return env && env.GIFT_IMAGES;
}

export function getKv(env) {
  return env && env.GIFT_KV;
}

function useKv(env) {
  return Boolean(getKv(env));
}

export function requireBindings(env, {needBucket = false} = {}) {
  if (getKv(env)) return null;
  if (!getDb(env)) {
    return jsonResponse({ok: false, error: "cloudflare_d1_binding_missing"}, 503);
  }
  if (needBucket && !getBucket(env)) {
    return jsonResponse({ok: false, error: "cloudflare_r2_binding_missing"}, 503);
  }
  return null;
}

export function appConfig(env = {}) {
  const cfg = limits(env);
  return {
    rushBaseUrl: text(env.GIFT_RUSH_BASE_URL, 300) || DEFAULT_RUSH_URL,
    paidOrderUrl: text(env.GIFT_PAID_ORDER_URL, 300) || text(env.GIFT_RUSH_BASE_URL, 300) || DEFAULT_RUSH_URL,
    lineUrl: text(env.GIFT_LINE_URL, 300) || DEFAULT_LINE_URL,
    instagramAccount: text(env.GIFT_INSTAGRAM_ACCOUNT, 80) || "@uchinoko.aiko",
    dailyAcceptLimit: cfg.dailyAcceptLimit,
    dailyProcessLimit: cfg.dailyProcessLimit,
    minEtaDays: cfg.minEtaDays,
  };
}

export function limits(env = {}) {
  return {
    dailyAcceptLimit: clampInt(env.GIFT_DAILY_ACCEPT_LIMIT, 30, 1, 500),
    dailyProcessLimit: clampInt(env.GIFT_DAILY_PROCESS_LIMIT, 5, 1, 200),
    minEtaDays: clampInt(env.GIFT_MIN_ETA_DAYS, 3, 1, 30),
  };
}

function clampInt(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

export async function ensureSchema(env) {
  if (useKv(env)) return;
  const db = getDb(env);
  if (!db) throw new Error("cloudflare_d1_binding_missing");
  if (!schemaReadyPromise) {
    schemaReadyPromise = (async () => {
      await db.prepare(`
        CREATE TABLE IF NOT EXISTS gift_tickets (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          slug TEXT NOT NULL UNIQUE,
          ticket_no INTEGER NOT NULL UNIQUE,
          instagram_id TEXT NOT NULL,
          instagram_key TEXT NOT NULL UNIQUE,
          pet_name TEXT NOT NULL,
          species TEXT NOT NULL,
          pet_count TEXT NOT NULL DEFAULT '',
          breed TEXT,
          free_note TEXT,
          taste TEXT NOT NULL,
          style_label TEXT NOT NULL,
          plan TEXT NOT NULL DEFAULT 'normal',
          status TEXT NOT NULL DEFAULT 'queued',
          source_photo_key TEXT,
          source_photo_content_type TEXT,
          source_photo_size INTEGER,
          design_keys TEXT NOT NULL DEFAULT '[]',
          reveal_keys TEXT NOT NULL DEFAULT '[]',
          image_assets_deleted_at TEXT,
          image_assets_delete_reason TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          completed_at TEXT,
          ok_share INTEGER NOT NULL DEFAULT 1,
          batch_date_jst TEXT NOT NULL
        )
      `).run();
      await db.prepare("ALTER TABLE gift_tickets ADD COLUMN reveal_keys TEXT NOT NULL DEFAULT '[]'").run()
        .catch((error) => {
          if (!String(error && error.message || "").toLowerCase().includes("duplicate")) throw error;
        });
      await db.prepare("ALTER TABLE gift_tickets ADD COLUMN pet_count TEXT NOT NULL DEFAULT ''").run()
        .catch((error) => {
          if (!String(error && error.message || "").toLowerCase().includes("duplicate")) throw error;
        });
      await db.prepare("ALTER TABLE gift_tickets ADD COLUMN image_assets_deleted_at TEXT").run()
        .catch((error) => {
          if (!String(error && error.message || "").toLowerCase().includes("duplicate")) throw error;
        });
      await db.prepare("ALTER TABLE gift_tickets ADD COLUMN image_assets_delete_reason TEXT").run()
        .catch((error) => {
          if (!String(error && error.message || "").toLowerCase().includes("duplicate")) throw error;
        });
      await db.prepare("CREATE INDEX IF NOT EXISTS idx_gift_tickets_status_created ON gift_tickets(status, created_at)").run();
      await db.prepare("CREATE INDEX IF NOT EXISTS idx_gift_tickets_batch_date ON gift_tickets(batch_date_jst)").run();
      await db.prepare("CREATE INDEX IF NOT EXISTS idx_gift_tickets_instagram_key ON gift_tickets(instagram_key)").run();
    })();
  }
  await schemaReadyPromise;
}

export function validSameOriginPost(request) {
  if (request.method !== "POST") return true;
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch (_) {
    return false;
  }
}

export function validBotGate(payload) {
  const gate = payload && payload.botGate;
  if (!gate || typeof gate !== "object" || Array.isArray(gate)) return false;
  if (text(gate.field, 200)) return false;
  const startedAt = Number(gate.startedAt);
  const submittedAt = Number(gate.submittedAt);
  const elapsed = submittedAt - startedAt;
  return Number.isFinite(elapsed) && elapsed >= 1500 && elapsed <= 6 * 60 * 60 * 1000;
}

export function turnstileMode(env) {
  const flag = text(env.TURNSTILE_ENABLED, 20).toLowerCase();
  const siteKey = text(env.TURNSTILE_SITE_KEY, 300);
  const secretKey = text(env.TURNSTILE_SECRET_KEY, 300);
  if (flag === "false") return {enabled: false, unavailable: false};
  if (siteKey && secretKey) return {enabled: true, unavailable: false};
  if (flag === "true") return {enabled: false, unavailable: true};
  return {enabled: false, unavailable: false};
}

export async function verifyTurnstile(context, token) {
  if (!token) return {ok: false, error: "turnstile_required"};
  const form = new FormData();
  form.append("secret", text(context.env.TURNSTILE_SECRET_KEY, 300));
  form.append("response", token);
  const remoteIp = text(context.request.headers.get("CF-Connecting-IP"), 80);
  if (remoteIp) form.append("remoteip", remoteIp);

  const response = await fetch(TURNSTILE_VERIFY_URL, {
    method: "POST",
    body: form,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.success !== true) {
    return {ok: false, error: "turnstile_failed"};
  }
  if (data.action && data.action !== "gift_reception") {
    return {ok: false, error: "turnstile_failed"};
  }
  return {ok: true};
}

export function normalizeInstagramId(value) {
  return text(value, 80)
    .normalize("NFKC")
    .replace(/^@+/, "")
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, "")
    .replace(/\/.*$/, "");
}

export function hasContactInfo(value) {
  const raw = String(value || "");
  if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(raw)) return true;
  return raw.replace(/[^\d]/g, "").length >= 10;
}

export function styleLabel(taste) {
  if (taste === "seasonal_flower") return "紫陽花入り水彩";
  if (taste === "aiko_omakase") return "おまかせ";
  return "水彩定番";
}

const PET_COUNT_VALUES = ["1", "2", "3", "4+"];

export function normalizePetCount(value) {
  const raw = text(value, 8);
  return PET_COUNT_VALUES.includes(raw) ? raw : "";
}

export function petCountLabel(petCount) {
  const raw = normalizePetCount(petCount);
  if (!raw) return "";
  return raw === "4+" ? "4匹以上" : `${raw}匹`;
}

export function validateGiftPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return {ok: false, error: "invalid_request"};
  }
  const instagramId = normalizeInstagramId(payload.instagramId);
  const petName = text(payload.petName, 40);
  const species = text(payload.species, 40);
  const petCount = normalizePetCount(payload.petCount);
  const breed = text(payload.breed, 60);
  const freeNote = text(payload.freeNote, 400);
  const taste = text(payload.taste, 40) || "watercolor_default";
  const plan = text(payload.plan, 20) || "normal";
  const okShare = payload.okShare === true;

  if (!okShare) return {ok: false, error: "share_consent_required"};
  if (plan !== "normal") return {ok: false, error: "paid_order_required"};
  if (!payload.photoBase64) return {ok: false, error: "missing_photo"};
  if (!petName) return {ok: false, error: "pet_name_required"};
  if (!species) return {ok: false, error: "species_required"};
  if (!petCount) return {ok: false, error: "pet_count_required"};
  if (!/^[A-Za-z0-9._]{1,30}$/.test(instagramId)) return {ok: false, error: "instagram_required"};
  if ([petName, species, petCount, breed, freeNote, instagramId].some(hasContactInfo)) {
    return {ok: false, error: "contact_info_not_allowed"};
  }

  let photoBytes;
  try {
    photoBytes = decodeBase64Image(payload.photoBase64);
  } catch (_) {
    return {ok: false, error: "invalid_photo"};
  }
  if (!photoBytes.length) return {ok: false, error: "invalid_photo"};
  if (photoBytes.length > 6 * 1024 * 1024) return {ok: false, error: "photo_too_large"};

  return {
    ok: true,
    data: {
      photoBytes,
      petName,
      species,
      petCount,
      breed,
      freeNote,
      instagramId,
      instagramKey: instagramId.toLowerCase(),
      taste,
      styleLabel: styleLabel(taste),
      plan,
      okShare,
    },
  };
}

function decodeBase64Image(value) {
  const base64 = String(value || "").replace(/^data:[^,]+,/, "").replace(/\s/g, "");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) throw new Error("invalid_base64");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function decodeBase64Asset(value) {
  return decodeBase64Image(value);
}

export function randomSlug() {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";
  const bytes = new Uint8Array(14);
  crypto.getRandomValues(bytes);
  let slug = "";
  for (const byte of bytes) slug += alphabet[byte & 63];
  return slug;
}

export function nowIso() {
  return new Date().toISOString();
}

export function jstDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

export function etaTextFor(daysFromToday) {
  const target = new Date(Date.now() + daysFromToday * 24 * 60 * 60 * 1000);
  const parts = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
  }).formatToParts(target);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.month}/${map.day}ごろ`;
}

export async function countRows(env, whereSql = "", binds = []) {
  if (useKv(env)) {
    const rows = await kvAllRows(env);
    if (whereSql.includes("batch_date_jst")) {
      return rows.filter((row) => row.batch_date_jst === binds[0]).length;
    }
    if (whereSql.includes("ticket_no <")) {
      return rows.filter((row) => STATUS_OPEN.includes(row.status) && Number(row.ticket_no || 0) < Number(binds[0] || 0)).length;
    }
    if (whereSql.includes("status IN")) {
      return rows.filter((row) => STATUS_OPEN.includes(row.status)).length;
    }
    return rows.length;
  }
  const db = getDb(env);
  const row = await db.prepare(`SELECT COUNT(*) AS count FROM gift_tickets ${whereSql}`).bind(...binds).first();
  return Number(row && row.count || 0);
}

export async function statsForNextTicket(env) {
  await ensureSchema(env);
  const cfg = limits(env);
  const waitingCount = await countRows(env, `WHERE status IN ('queued', 'processing')`);
  const acceptedToday = await countRows(env, "WHERE batch_date_jst = ?", [jstDateKey()]);
  const estimatedDays = Math.max(cfg.minEtaDays, Math.ceil((waitingCount + 1) / cfg.dailyProcessLimit));
  return {
    waitingCount,
    acceptedToday,
    etaText: etaTextFor(estimatedDays),
    minEtaDays: cfg.minEtaDays,
  };
}

export async function freeReceptionState(env) {
  const cfg = limits(env);
  const stats = await statsForNextTicket(env);
  const isClosed = stats.acceptedToday >= cfg.dailyAcceptLimit;
  return {
    stats,
    freeReception: {
      isClosed,
      message: isClosed ?
        "本日の無料枠は終了しました。明日また受付します。優先制作は受付中です。" :
        "",
    },
  };
}

export async function findTicketBySlug(env, slug) {
  await ensureSchema(env);
  if (useKv(env)) {
    return kvGetJson(env, `gift:ticket:${slug}`);
  }
  return getDb(env).prepare("SELECT * FROM gift_tickets WHERE slug = ? LIMIT 1").bind(slug).first();
}

export async function findTicketByInstagramKey(env, instagramKey) {
  await ensureSchema(env);
  if (useKv(env)) {
    const slug = await getKv(env).get(`gift:instagram:${instagramKey}`);
    return slug ? findTicketBySlug(env, slug) : null;
  }
  return getDb(env).prepare("SELECT * FROM gift_tickets WHERE instagram_key = ? LIMIT 1").bind(instagramKey).first();
}

export async function ticketStats(env, row) {
  const cfg = limits(env);
  const aheadCount = await countRows(
    env,
    "WHERE status IN ('queued', 'processing') AND ticket_no < ?",
    [Number(row.ticket_no || 0)],
  );
  const estimatedDays = Math.max(cfg.minEtaDays, Math.ceil((aheadCount + 1) / cfg.dailyProcessLimit));
  return {
    aheadCount,
    etaText: row.status === "done" ? "完成済み" : etaTextFor(estimatedDays),
  };
}

export async function ticketFromRow(env, row) {
  if (!row) return null;
  const stats = await ticketStats(env, row);
  const imageAssetsDeletedAt = text(row.image_assets_deleted_at, 80);
  const designKeys = parseJsonArray(row.design_keys);
  const revealKeys = parseJsonArray(row.reveal_keys);
  const slug = String(row.slug || "");
  return {
    slug,
    ticketNo: Number(row.ticket_no || row.id || 0),
    status: row.status || "queued",
    isDone: row.status === "done",
    petName: row.pet_name || "",
    petCount: normalizePetCount(row.pet_count),
    petCountLabel: petCountLabel(row.pet_count),
    instagramId: row.instagram_id || "",
    styleLabel: row.style_label || styleLabel(row.taste),
    taste: row.taste || "watercolor_default",
    stats,
    config: appConfig(env),
    imageAssetsDeletedAt,
    downloadsClosed: Boolean(imageAssetsDeletedAt),
    designs: designKeys.map((_, index) => ({
      url: `/giftImage?slug=${encodeURIComponent(slug)}&index=${index}`,
    })),
    revealImages: revealKeys.map((_, index) => ({
      url: `/giftRevealImage?slug=${encodeURIComponent(slug)}&index=${index}`,
    })),
    createdAt: row.created_at || "",
    completedAt: row.completed_at || "",
  };
}

export function parseJsonArray(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed.filter(Boolean).map(String) : [];
  } catch (_) {
    return [];
  }
}

export function safeSlug(value) {
  const slug = text(value, 100);
  return /^[A-Za-z0-9_-]{8,80}$/.test(slug) ? slug : "";
}

export function safeIndex(value) {
  const index = Number(value);
  if (!Number.isInteger(index) || index < 0 || index > 11) return -1;
  return index;
}

export function imageHeaders(object, contentTypeFallback = "image/jpeg") {
  const headers = new Headers();
  headers.set("content-type", object.httpMetadata?.contentType || object.customMetadata?.contentType || contentTypeFallback);
  headers.set("cache-control", "public, max-age=300");
  headers.set("x-content-type-options", "nosniff");
  return headers;
}

export function privateImageHeaders(object, contentTypeFallback = "image/jpeg") {
  const headers = imageHeaders(object, contentTypeFallback);
  headers.set("cache-control", "no-store, max-age=0");
  return headers;
}

async function deleteAsset(env, key) {
  const safeKey = String(key || "");
  if (!safeKey) return {key: safeKey, skipped: true};
  if (useKv(env)) {
    await getKv(env).delete(safeKey);
    return {key: safeKey, deleted: true, store: "kv"};
  }
  const bucket = getBucket(env);
  if (!bucket) throw new Error("cloudflare_r2_binding_missing");
  await bucket.delete(safeKey);
  return {key: safeKey, deleted: true, store: "r2"};
}

export async function deleteTicketImageAssets(env, row, {reason = "posted_cleanup"} = {}) {
  if (!row) throw new Error("gift_ticket_required");
  const deletedAt = nowIso();
  const keys = [...new Set([
    String(row.source_photo_key || ""),
    ...parseJsonArray(row.design_keys),
    ...parseJsonArray(row.reveal_keys),
  ].filter(Boolean))];
  const results = [];
  for (const key of keys) {
    results.push(await deleteAsset(env, key));
  }
  const updateReason = text(reason, 200) || "posted_cleanup";
  if (useKv(env)) {
    const updated = {
      ...row,
      source_photo_key: "",
      source_photo_size: 0,
      design_keys: "[]",
      reveal_keys: "[]",
      image_assets_deleted_at: deletedAt,
      image_assets_delete_reason: updateReason,
      updated_at: deletedAt,
    };
    await getKv(env).put(`gift:ticket:${row.slug}`, JSON.stringify(updated));
    return {
      row: updated,
      deletedAt,
      deletedCount: results.filter((item) => item.deleted).length,
      results,
    };
  }
  await getDb(env).prepare(`
    UPDATE gift_tickets
    SET source_photo_key = '',
        source_photo_size = 0,
        design_keys = '[]',
        reveal_keys = '[]',
        image_assets_deleted_at = ?,
        image_assets_delete_reason = ?,
        updated_at = ?
    WHERE slug = ?
  `).bind(deletedAt, updateReason, deletedAt, row.slug).run();
  return {
    row: await findTicketBySlug(env, row.slug),
    deletedAt,
    deletedCount: results.filter((item) => item.deleted).length,
    results,
  };
}

export function requireAdmin(context) {
  const expected = text(context.env && context.env.GIFT_ADMIN_KEY, 300);
  if (!expected) return jsonResponse({ok: false, error: "gift_admin_key_missing"}, 503);
  const supplied = text(context.request.headers.get("x-aiko-gift-admin-key"), 300);
  if (!supplied || supplied !== expected) {
    return jsonResponse({ok: false, error: "unauthorized"}, 401);
  }
  return null;
}

export function sourcePhotoKey(dateKey, slug) {
  return `gift/source/${dateKey}/${slug}.jpg`;
}

export function designPhotoKey(dateKey, slug, index, contentType = "image/jpeg") {
  const ext = contentType.includes("webp") ? "webp" : contentType.includes("png") ? "png" : "jpg";
  return `gift/design/${dateKey}/${slug}/${String(index + 1).padStart(2, "0")}.${ext}`;
}

export function revealPhotoKey(dateKey, slug, index, contentType = "image/jpeg") {
  const ext = contentType.includes("webp") ? "webp" : contentType.includes("png") ? "png" : "jpg";
  const names = ["01-cover", "02-source", "03-design", "04-cta"];
  const name = names[index] || `${String(index + 1).padStart(2, "0")}-extra`;
  return `gift/reveal/${dateKey}/${slug}/${name}.${ext}`;
}

export async function insertTicket(env, data) {
  await ensureSchema(env);
  if (useKv(env)) return kvInsertTicket(env, data);
  const db = getDb(env);
  const createdAt = nowIso();
  const batchDate = jstDateKey();
  let slug = randomSlug();

  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const key = sourcePhotoKey(batchDate, slug);
      const result = await db.prepare(`
        INSERT INTO gift_tickets (
          slug, ticket_no, instagram_id, instagram_key, pet_name, species, pet_count,
          breed, free_note, taste, style_label, plan, status,
          source_photo_key, source_photo_content_type, source_photo_size,
          design_keys, created_at, updated_at, ok_share, batch_date_jst
        ) VALUES (?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'normal', 'queued', ?, 'image/jpeg', ?, '[]', ?, ?, 1, ?)
      `).bind(
        slug,
        data.instagramId,
        data.instagramKey,
        data.petName,
        data.species,
        data.petCount,
        data.breed,
        data.freeNote,
        data.taste,
        data.styleLabel,
        key,
        data.photoBytes.length,
        createdAt,
        createdAt,
        batchDate,
      ).run();
      const id = Number(result.meta && result.meta.last_row_id || 0);
      await db.prepare("UPDATE gift_tickets SET ticket_no = ? WHERE id = ?").bind(id, id).run();
      await getBucket(env).put(key, data.photoBytes, {
        httpMetadata: {contentType: "image/jpeg"},
        customMetadata: {
          slug,
          instagramId: data.instagramId,
          createdAt,
          kind: "gift_source_photo",
        },
      });
      return findTicketBySlug(env, slug);
    } catch (error) {
      if (!String(error && error.message || "").includes("UNIQUE")) throw error;
      slug = randomSlug();
    }
  }
  throw new Error("ticket_insert_conflict");
}

export async function designObjectForTicket(env, row, index) {
  const keys = parseJsonArray(row && row.design_keys);
  const key = keys[index];
  if (!key) return null;
  return getAsset(env, key);
}

export async function revealObjectForTicket(env, row, index) {
  const keys = parseJsonArray(row && row.reveal_keys);
  const key = keys[index];
  if (!key) return null;
  return getAsset(env, key);
}

export async function sourceObjectForTicket(env, row) {
  const key = String(row && row.source_photo_key || "");
  if (!key) return null;
  return getAsset(env, key);
}

export function adminTicketFromRow(row) {
  const slug = String(row.slug || "");
  return {
    slug,
    ticketNo: Number(row.ticket_no || row.id || 0),
    status: row.status || "queued",
    petName: row.pet_name || "",
    species: row.species || "",
    petCount: normalizePetCount(row.pet_count),
    petCountLabel: petCountLabel(row.pet_count),
    breed: row.breed || "",
    freeNote: row.free_note || "",
    instagramId: row.instagram_id || "",
    taste: row.taste || "",
    styleLabel: row.style_label || styleLabel(row.taste),
    sourcePhotoUrl: `/giftAdminImage?slug=${encodeURIComponent(slug)}&kind=source`,
    sourcePhotoSize: Number(row.source_photo_size || 0),
    designCount: parseJsonArray(row.design_keys).length,
    revealCount: parseJsonArray(row.reveal_keys).length,
    imageAssetsDeletedAt: row.image_assets_deleted_at || "",
    downloadsClosed: Boolean(row.image_assets_deleted_at),
    revealImageUrls: parseJsonArray(row.reveal_keys).map((_, index) =>
      `/giftRevealImage?slug=${encodeURIComponent(slug)}&index=${index}`
    ),
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || "",
    completedAt: row.completed_at || "",
  };
}

export async function getAsset(env, key) {
  if (useKv(env)) {
    const result = await getKv(env).getWithMetadata(key, "arrayBuffer");
    if (!result || !result.value) return null;
    return {
      body: result.value,
      httpMetadata: {contentType: result.metadata && result.metadata.contentType},
      customMetadata: result.metadata || {},
    };
  }
  return getBucket(env).get(key);
}

export async function putAsset(env, key, bytes, contentType, metadata = {}) {
  if (useKv(env)) {
    await getKv(env).put(key, bytes, {
      metadata: {
        ...metadata,
        contentType,
      },
    });
    return;
  }
  await getBucket(env).put(key, bytes, {
    httpMetadata: {contentType},
    customMetadata: metadata,
  });
}

export async function listAdminTickets(env, {status = "", limit = 50} = {}) {
  await ensureSchema(env);
  if (useKv(env)) {
    const rows = await kvAllRows(env);
    return rows
      .filter((row) => !status || row.status === status)
      .sort((a, b) => Number(a.ticket_no || 0) - Number(b.ticket_no || 0))
      .slice(0, limit);
  }
  const binds = [];
  let where = "";
  if (status) {
    where = "WHERE status = ?";
    binds.push(status);
  }
  binds.push(limit);
  const result = await getDb(env)
    .prepare(`SELECT * FROM gift_tickets ${where} ORDER BY ticket_no ASC LIMIT ?`)
    .bind(...binds)
    .all();
  return result.results || [];
}

export async function updateTicketRecord(env, row, {status, designKeys, completedAt}) {
  const updatedAt = nowIso();
  if (useKv(env)) {
    const updated = {
      ...row,
      status,
      design_keys: JSON.stringify(designKeys),
      completed_at: completedAt || null,
      updated_at: updatedAt,
    };
    await getKv(env).put(`gift:ticket:${row.slug}`, JSON.stringify(updated));
    return updated;
  }
  await getDb(env).prepare(`
    UPDATE gift_tickets
    SET status = ?, design_keys = ?, completed_at = ?, updated_at = ?
    WHERE slug = ?
  `).bind(
    status,
    JSON.stringify(designKeys),
    completedAt || null,
    updatedAt,
    row.slug,
  ).run();
  return findTicketBySlug(env, row.slug);
}

export async function updateTicketRevealKeys(env, row, revealKeys = []) {
  const updatedAt = nowIso();
  const normalizedKeys = Array.isArray(revealKeys) ? revealKeys.filter(Boolean).map(String) : [];
  if (useKv(env)) {
    const updated = {
      ...row,
      reveal_keys: JSON.stringify(normalizedKeys),
      updated_at: updatedAt,
    };
    await getKv(env).put(`gift:ticket:${row.slug}`, JSON.stringify(updated));
    return updated;
  }
  await getDb(env).prepare(`
    UPDATE gift_tickets
    SET reveal_keys = ?, updated_at = ?
    WHERE slug = ?
  `).bind(
    JSON.stringify(normalizedKeys),
    updatedAt,
    row.slug,
  ).run();
  return findTicketBySlug(env, row.slug);
}

async function kvInsertTicket(env, data) {
  const kv = getKv(env);
  const createdAt = nowIso();
  const batchDate = jstDateKey();
  const ticketNo = await kvNextTicketNo(env);
  const slug = randomSlug();
  const key = sourcePhotoKey(batchDate, slug);
  const row = {
    id: ticketNo,
    slug,
    ticket_no: ticketNo,
    instagram_id: data.instagramId,
    instagram_key: data.instagramKey,
    pet_name: data.petName,
    species: data.species,
    pet_count: data.petCount,
    breed: data.breed,
    free_note: data.freeNote,
    taste: data.taste,
    style_label: data.styleLabel,
    plan: "normal",
    status: "queued",
    source_photo_key: key,
    source_photo_content_type: "image/jpeg",
    source_photo_size: data.photoBytes.length,
    design_keys: "[]",
    reveal_keys: "[]",
    created_at: createdAt,
    updated_at: createdAt,
    completed_at: null,
    ok_share: 1,
    batch_date_jst: batchDate,
  };
  await putAsset(env, key, data.photoBytes, "image/jpeg", {
    slug,
    instagramId: data.instagramId,
    createdAt,
    kind: "gift_source_photo",
  });
  await kv.put(`gift:ticket:${slug}`, JSON.stringify(row));
  await kv.put(`gift:instagram:${data.instagramKey}`, slug);
  await kv.put(`gift:date:${batchDate}:${slug}`, slug);
  return row;
}

async function kvNextTicketNo(env) {
  const kv = getKv(env);
  const current = Number(await kv.get("gift:seq") || 0);
  const next = current + 1;
  await kv.put("gift:seq", String(next));
  return next;
}

async function kvGetJson(env, key) {
  const raw = await getKv(env).get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

async function kvAllRows(env) {
  const kv = getKv(env);
  const rows = [];
  let cursor;
  do {
    const page = await kv.list({prefix: "gift:ticket:", cursor, limit: 1000});
    for (const key of page.keys || []) {
      const row = await kvGetJson(env, key.name);
      if (row) rows.push(row);
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return rows;
}
