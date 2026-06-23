type StampAnalyticsMeta = Record<string, string | number | boolean | null | undefined>;

const VISITOR_KEY = "aiko-animal:stamp-v2:visitor";
const SESSION_KEY = "aiko-animal:stamp-v2:session";
const SESSION_STARTED_KEY = "aiko-animal:stamp-v2:session-started";
const ENDPOINT = "/stampAnalytics";

function randomId(prefix: string) {
  if (window.crypto?.getRandomValues) {
    const bytes = new Uint8Array(12);
    window.crypto.getRandomValues(bytes);
    const token = Array.from(bytes)
      .map((byte) => byte.toString(36).padStart(2, "0"))
      .join("")
      .slice(0, 24);
    return `${prefix}_${token}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 18)}`;
}

function storageGet(storage: Storage, key: string) {
  try {
    return storage.getItem(key) || "";
  } catch {
    return "";
  }
}

function storageSet(storage: Storage, key: string, value: string) {
  try {
    storage.setItem(key, value);
  } catch {
    // Analytics must never break the tool itself.
  }
}

function visitorId() {
  const existing = storageGet(window.localStorage, VISITOR_KEY);
  if (existing) return existing;
  const next = randomId("visitor");
  storageSet(window.localStorage, VISITOR_KEY, next);
  return next;
}

function sessionId() {
  const existing = storageGet(window.sessionStorage, SESSION_KEY);
  if (existing) return existing;
  const next = randomId("session");
  storageSet(window.sessionStorage, SESSION_KEY, next);
  storageSet(window.sessionStorage, SESSION_STARTED_KEY, new Date().toISOString());
  return next;
}

function cleanMeta(meta: StampAnalyticsMeta) {
  const out: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(meta)) {
    if (value === undefined) continue;
    const safeKey = key.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40);
    if (!safeKey) continue;
    if (typeof value === "string") out[safeKey] = value.slice(0, 120);
    else if (typeof value === "number" && Number.isFinite(value)) out[safeKey] = value;
    else if (typeof value === "boolean" || value === null) out[safeKey] = value;
  }
  return out;
}

export function trackStampEvent(event: string, meta: StampAnalyticsMeta = {}) {
  if (typeof window === "undefined") return;
  const safeEvent = event.replace(/[^a-zA-Z0-9_.:-]/g, "_").slice(0, 80);
  if (!safeEvent) return;

  const payload = {
    event: safeEvent,
    visitorId: visitorId(),
    sessionId: sessionId(),
    path: window.location.pathname,
    at: new Date().toISOString(),
    meta: cleanMeta(meta),
  };
  const body = JSON.stringify(payload);

  try {
    if (navigator.sendBeacon) {
      const ok = navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "application/json" }));
      if (ok) return;
    }
    void fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Ignore network/API failures.
  }
}
