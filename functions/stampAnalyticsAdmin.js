import {
  getKv,
  jsonResponse,
  requireAdmin,
  requireBindings,
  requireMethod,
} from "./lib/gift-cloudflare.js";

const EVENT_PREFIX = "stamp:v2:event:";
const USER_PREFIX = "stamp:v2:user:";

async function listJson(kv, prefix, max = 5000) {
  const rows = [];
  let cursor;
  do {
    const page = await kv.list({prefix, cursor, limit: 1000});
    cursor = page.cursor;
    const names = (page.keys || []).map((key) => key.name).slice(0, Math.max(0, max - rows.length));
    const raws = await Promise.all(names.map((name) => kv.get(name)));
    for (const raw of raws) {
      try {
        if (raw) rows.push(JSON.parse(raw));
      } catch {
        // Ignore corrupt analytics rows.
      }
    }
  } while (cursor && rows.length < max);
  return rows;
}

async function getJson(kv, key) {
  const raw = await kv.get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function listEventsForDays(kv, days, max = 12000) {
  const rows = [];
  for (const date of dayRange(days)) {
    if (rows.length >= max) break;
    const daily = await listJson(kv, `${EVENT_PREFIX}${date}:`, max - rows.length);
    rows.push(...daily);
  }
  return rows;
}

async function getUsersById(kv, visitorIds) {
  const entries = await Promise.all(
    Array.from(visitorIds).map(async (visitorId) => [
      visitorId,
      await getJson(kv, `${USER_PREFIX}${visitorId}`),
    ]),
  );
  return new Map(entries);
}

function isoDaysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days + 1);
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
}

function dayRange(days) {
  const out = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i -= 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
    out.push(jst.toISOString().slice(0, 10));
  }
  return out;
}

function addCount(map, key, amount = 1) {
  map.set(key, (map.get(key) || 0) + amount);
}

function topFromMap(map, limit = 12) {
  return Array.from(map.entries())
    .map(([key, count]) => ({key, count}))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
    .slice(0, limit);
}

function userLabel(visitorId) {
  return String(visitorId || "").slice(0, 18);
}

function routeStats(map, path) {
  const key = String(path || "/stamp-v2").slice(0, 120);
  if (!map.has(key)) {
    map.set(key, {
      path: key,
      events: 0,
      visitors: new Set(),
      sessions: new Set(),
      downloads: 0,
      promptCopies: 0,
      imports: 0,
    });
  }
  return map.get(key);
}

function isDownloadEvent(eventName) {
  return eventName === "export_zip" ||
    eventName === "mobile_share_all" ||
    eventName === "mobile_share_one" ||
    eventName === "mobile_download_one";
}

function isPromptCopyEvent(eventName) {
  return eventName === "prompt_copy" || eventName === "mobile_prompt_copy";
}

function isImportEvent(event) {
  return event.event === "import_complete" || event.event === "mobile_import";
}

export async function onRequest(context) {
  const methodError = requireMethod(context.request, ["GET", "HEAD"]);
  if (methodError) return methodError;

  const bindingError = requireBindings(context.env);
  if (bindingError) return bindingError;

  const authError = requireAdmin(context);
  if (authError) return authError;

  const kv = getKv(context.env);
  if (!kv) return jsonResponse({ok: false, error: "analytics_kv_missing"}, 503);

  const url = new URL(context.request.url);
  const days = Math.max(1, Math.min(180, Number(url.searchParams.get("days") || 30)));
  const sinceIso = isoDaysAgo(days);

  const allEvents = await listEventsForDays(kv, days);
  const events = allEvents
    .filter((event) => String(event.at || "") >= sinceIso)
    .sort((a, b) => String(b.at || "").localeCompare(String(a.at || "")));

  const byEvent = new Map();
  const visitors = new Set();
  const sessions = new Set();
  const byPath = new Map();
  const byDay = new Map(dayRange(days).map((date) => [date, {
    date,
    events: 0,
    visitors: new Set(),
    sessions: new Set(),
    downloads: 0,
    promptCopies: 0,
  }]));
  const userRange = new Map();

  for (const event of events) {
    const eventName = String(event.event || "unknown");
    const visitorId = String(event.visitorId || "");
    const sessionId = String(event.sessionId || "");
    const dateKey = String(event.dateKey || "").slice(0, 10);
    const pathStats = routeStats(byPath, event.path);

    addCount(byEvent, eventName);
    if (visitorId) visitors.add(visitorId);
    if (sessionId) sessions.add(sessionId);
    pathStats.events += 1;
    if (visitorId) pathStats.visitors.add(visitorId);
    if (sessionId) pathStats.sessions.add(sessionId);
    if (isDownloadEvent(eventName)) pathStats.downloads += 1;
    if (isPromptCopyEvent(eventName)) pathStats.promptCopies += 1;
    if (isImportEvent(event)) pathStats.imports += 1;

    const day = byDay.get(dateKey);
    if (day) {
      day.events += 1;
      if (visitorId) day.visitors.add(visitorId);
      if (sessionId) day.sessions.add(sessionId);
      if (isDownloadEvent(eventName)) day.downloads += 1;
      if (isPromptCopyEvent(eventName)) day.promptCopies += 1;
    }

    if (visitorId) {
      const current = userRange.get(visitorId) || {
        visitorId,
        events: 0,
        sessions: new Set(),
        days: new Set(),
        lastSeen: "",
        lastEvent: "",
        eventCounts: new Map(),
      };
      current.events += 1;
      if (sessionId) current.sessions.add(sessionId);
      if (dateKey) current.days.add(dateKey);
      if (!current.lastSeen || String(event.at || "") > current.lastSeen) {
        current.lastSeen = String(event.at || "");
        current.lastEvent = eventName;
      }
      addCount(current.eventCounts, eventName);
      userRange.set(visitorId, current);
    }
  }

  const userById = await getUsersById(kv, userRange.keys());
  const activeUsers = Array.from(userRange.values()).map((range) => {
    const user = userById.get(range.visitorId) || {};
    const firstSeen = String(user.firstSeen || range.lastSeen || "");
    const isNew = firstSeen >= sinceIso;
    const isReturning = !isNew || range.sessions.size > 1 || range.days.size > 1;
    return {
      visitorId: range.visitorId,
      label: userLabel(range.visitorId),
      firstSeen,
      lastSeen: range.lastSeen,
      events: range.events,
      sessions: range.sessions.size,
      daysActive: range.days.size,
      lastEvent: range.lastEvent,
      isNew,
      isReturning,
      topEvents: topFromMap(range.eventCounts, 5),
    };
  }).sort((a, b) => b.lastSeen.localeCompare(a.lastSeen));

  const summary = {
    days,
    events: events.length,
    visitors: visitors.size,
    sessions: sessions.size,
    newVisitors: activeUsers.filter((user) => user.isNew).length,
    returningVisitors: activeUsers.filter((user) => user.isReturning).length,
    downloads: events.filter((event) => isDownloadEvent(event.event)).length,
    promptCopies: events.filter((event) => isPromptCopyEvent(event.event)).length,
    sheetImports: events.filter((event) => event.event === "import_complete" && event.meta?.mode === "sheet").length,
    batchImports: events.filter((event) => event.event === "import_complete" && event.meta?.mode === "batch").length,
    mobileImports: events.filter((event) => event.event === "import_complete" && event.meta?.mode === "mobile_sheet").length,
  };

  return jsonResponse({
    ok: true,
    summary,
    topEvents: topFromMap(byEvent, 16),
    toolUsage: Array.from(byPath.values())
      .map((row) => ({
        path: row.path,
        events: row.events,
        visitors: row.visitors.size,
        sessions: row.sessions.size,
        downloads: row.downloads,
        promptCopies: row.promptCopies,
        imports: row.imports,
      }))
      .sort((a, b) => b.events - a.events || a.path.localeCompare(b.path)),
    daily: Array.from(byDay.values()).map((day) => ({
      date: day.date,
      events: day.events,
      visitors: day.visitors.size,
      sessions: day.sessions.size,
      downloads: day.downloads,
      promptCopies: day.promptCopies,
    })),
    users: activeUsers.slice(0, 200),
    recentEvents: events.slice(0, 100).map((event) => ({
      event: event.event,
      at: event.at,
      dateKey: event.dateKey,
      path: event.path,
      visitorLabel: userLabel(event.visitorId),
      sessionId: String(event.sessionId || "").slice(0, 12),
      meta: event.meta || {},
    })),
  });
}
