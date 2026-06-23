import {
  getKv,
  jstDateKey,
  jsonResponse,
  nowIso,
  requireBindings,
  requireMethod,
  text,
} from "./lib/gift-cloudflare.js";

const EVENT_PREFIX = "stamp:v2:event:";
const USER_PREFIX = "stamp:v2:user:";
const EVENT_TTL_SECONDS = 60 * 60 * 24 * 180;
const USER_TTL_SECONDS = 60 * 60 * 24 * 395;
const MAX_META_KEYS = 20;

function safeToken(value, max = 100) {
  return text(value, max).replace(/[^a-zA-Z0-9_.:-]/g, "_").slice(0, max);
}

function safeMeta(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const out = {};
  for (const [key, value] of Object.entries(input).slice(0, MAX_META_KEYS)) {
    const safeKey = safeToken(key, 40);
    if (!safeKey) continue;
    if (typeof value === "string") out[safeKey] = text(value, 120);
    else if (typeof value === "number" && Number.isFinite(value)) out[safeKey] = value;
    else if (typeof value === "boolean" || value === null) out[safeKey] = value;
  }
  return out;
}

function randomPart() {
  try {
    return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  } catch {
    return Math.random().toString(36).slice(2, 14);
  }
}

async function getJson(kv, key, fallback) {
  const raw = await kv.get(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function appendUnique(list, value, max) {
  const next = Array.isArray(list) ? list.filter(Boolean) : [];
  if (value && !next.includes(value)) next.push(value);
  return next.slice(-max);
}

function incrementMap(map, key) {
  const next = map && typeof map === "object" && !Array.isArray(map) ? {...map} : {};
  next[key] = Number(next[key] || 0) + 1;
  return next;
}

export async function onRequest(context) {
  const methodError = requireMethod(context.request, ["POST"]);
  if (methodError) return methodError;

  const bindingError = requireBindings(context.env);
  if (bindingError) return bindingError;
  const kv = getKv(context.env);
  if (!kv) return jsonResponse({ok: false, error: "analytics_kv_missing"}, 503);

  const payload = await context.request.json().catch(() => null);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return jsonResponse({ok: false, error: "invalid_request"}, 400);
  }

  const event = safeToken(payload.event, 80);
  const visitorId = safeToken(payload.visitorId, 100);
  const sessionId = safeToken(payload.sessionId, 100);
  if (!event || !visitorId || !sessionId) {
    return jsonResponse({ok: false, error: "bad_request"}, 400);
  }

  const at = nowIso();
  const dateKey = jstDateKey(new Date(at));
  const item = {
    event,
    visitorId,
    sessionId,
    at,
    dateKey,
    path: text(payload.path, 120) || "/stamp-v2",
    meta: safeMeta(payload.meta),
  };

  const eventKey = `${EVENT_PREFIX}${dateKey}:${Date.now()}:${randomPart()}`;
  await kv.put(eventKey, JSON.stringify(item), {expirationTtl: EVENT_TTL_SECONDS});

  const userKey = `${USER_PREFIX}${visitorId}`;
  const current = await getJson(kv, userKey, null);
  const user = {
    visitorId,
    firstSeen: current?.firstSeen || at,
    lastSeen: at,
    eventCount: Number(current?.eventCount || 0) + 1,
    sessions: appendUnique(current?.sessions, sessionId, 120),
    days: appendUnique(current?.days, dateKey, 395),
    eventCounts: incrementMap(current?.eventCounts, event),
    lastEvent: event,
  };
  await kv.put(userKey, JSON.stringify(user), {expirationTtl: USER_TTL_SECONDS});

  return jsonResponse({ok: true});
}
