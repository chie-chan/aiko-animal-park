const QUEUE_PREFIX = "snsapi:queue:";
const READY_STATUS = "ready";
const WORKER_LIMIT = 20;
const MAX_POST_LATE_MS = 30 * 60 * 1000;
const THREADS_BASE_URL = "https://graph.threads.net/v1.0";
const GRAPH_BASE_URL = "https://graph.facebook.com/v24.0";
const THREADS_PUBLISH_DELAY_MS = 1500;
const INSTAGRAM_CONTAINER_WAIT_MS = 1500;
const MAX_THREADS_CAROUSEL_ITEMS = 20;
const MAX_INSTAGRAM_IMAGES = 10;
const SUPPORTED_PLATFORMS = new Set(["threads", "instagram"]);
const ALLOWED_TARGET_ACCOUNTS = Object.freeze({
  threads: ["aiko.animal", "uchinoko.aiko"],
  instagram: ["aiko.animal", "uchinoko.aiko"],
});

function text(value, max = 5000) {
  return String(value || "").trim().slice(0, max);
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, max-age=0",
    },
  });
}

function plainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function stringArray(value) {
  if (Array.isArray(value)) return value.map((item) => text(item, 300)).filter(Boolean);
  if (typeof value === "string") {
    return value.split(/[,\n]/).map((item) => text(item, 300)).filter(Boolean);
  }
  return [];
}

function normalizeAccount(value) {
  return text(value, 100)
    .replace(/^https?:\/\/(www\.)?(x|twitter|threads|instagram)\.com\//i, "")
    .replace(/^@+/, "")
    .replace(/\/.*$/, "")
    .toLowerCase();
}

function nowIso() {
  return new Date().toISOString();
}

function queueKey(id) {
  return `${QUEUE_PREFIX}${id}`;
}

function safeId(value) {
  const id = text(value, 180);
  return /^[A-Za-z0-9._:-]{8,180}$/.test(id) ? id : "";
}

function getKv(env) {
  if (!env || !env.SNS_KV) throw new Error("SNS_KV binding is missing");
  return env.SNS_KV;
}

function realPostingEnabled(env) {
  return /^true$/i.test(text(env && env.SNS_API_POSTING_ENABLED, 20));
}

function adminKey(env) {
  return text(env && env.SNS_ADMIN_KEY, 500);
}

function requireAdmin(request, env) {
  const expected = adminKey(env);
  if (!expected) return jsonResponse({ok: false, error: "sns_admin_key_missing"}, 503);
  const auth = text(request.headers.get("authorization"), 600);
  const bearer = auth.replace(/^Bearer\s+/i, "");
  const supplied = text(request.headers.get("x-aiko-sns-admin-key"), 500) || bearer;
  if (!supplied || supplied !== expected) {
    return jsonResponse({ok: false, error: "unauthorized"}, 401);
  }
  return null;
}

function timestampToMillis(value) {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (typeof value === "object" && Number.isFinite(value.seconds)) {
    return value.seconds * 1000;
  }
  return 0;
}

function queuedScheduleMillis(post = {}) {
  const fromTimestamp = timestampToMillis(post.scheduleAt);
  if (fromTimestamp) return fromTimestamp;
  const local = `${post.date || ""}T${post.dueTime || ""}:00+09:00`;
  const parsed = Date.parse(local);
  return Number.isFinite(parsed) ? parsed : 0;
}

function targetAccountForPlatform(platform, post = {}) {
  const targetAccounts = plainObject(post.targetAccounts);
  return normalizeAccount(
    targetAccounts[platform] ||
    post[`${platform}TargetAccount`] ||
    post.targetAccount ||
    "aiko.animal"
  );
}

function assertAllowedTarget(platform, post = {}) {
  const expected = ALLOWED_TARGET_ACCOUNTS[platform] || [];
  const target = targetAccountForPlatform(platform, post);
  if (!expected.includes(target)) {
    throw new Error(`blocked ${platform} target account: @${target || "(empty)"}`);
  }
  return target;
}

function imageEntries(post = {}) {
  if (Array.isArray(post.images) && post.images.length) {
    return post.images
      .map((image) => image && typeof image === "object" ? image : {url: image})
      .filter(Boolean);
  }
  const raw = post.imageUrls || post.imageText || post.images || "";
  const textBlob = Array.isArray(raw) ? raw.join("\n") : String(raw || "");
  return textBlob
    .split(/\r?\n+/)
    .map((line) => text(line, 2000))
    .filter(Boolean)
    .map((line) => /^https?:\/\//i.test(line) ? {source: "url", url: line} : {source: "storage", storagePath: line});
}

function imageUrlsForPost(post = {}) {
  const urls = [];
  for (const image of imageEntries(post)) {
    const url = text(image.url || image.ref, 2000);
    if (/^https?:\/\//i.test(url) && !urls.includes(url)) urls.push(url);
  }
  return urls;
}

function unsupportedImageRefs(post = {}) {
  return imageEntries(post)
    .filter((image) => !/^https?:\/\//i.test(text(image.url || image.ref, 2000)))
    .map((image) => text(image.storagePath || image.ref || image.url, 300))
    .filter(Boolean);
}

function normalizeQueueDoc(raw = {}, id = "") {
  const item = plainObject(raw.queueDoc || raw.item || raw);
  const queueId = safeId(id || raw.id || item.id || item.sourceDocId);
  if (!queueId) throw new Error("queue id is invalid");
  const platforms = stringArray(item.platforms).map((platform) => platform.toLowerCase());
  const unsupported = platforms.filter((platform) => !SUPPORTED_PLATFORMS.has(platform));
  if (!platforms.length) throw new Error("platforms are required");
  if (unsupported.length) throw new Error(`unsupported platforms: ${unsupported.join(",")}`);
  const bodyText = text(item.text, 5000);
  if (!bodyText) throw new Error("text is required");
  const scheduleMs = queuedScheduleMillis(item);
  if (!scheduleMs) throw new Error("scheduleAt is required");
  const images = imageEntries(item).map((image) => {
    const url = text(image.url || image.ref, 2000);
    return /^https?:\/\//i.test(url) ? {source: "url", url} : {source: "storage", storagePath: text(image.storagePath || image.ref || image.url, 500)};
  });
  const badImages = images.filter((image) => image.source !== "url");
  if (badImages.length) throw new Error("Cloudflare SNS queue accepts public https image URLs only");
  const targetAccounts = plainObject(item.targetAccounts);
  const normalizedTargets = {};
  for (const platform of platforms) {
    normalizedTargets[platform] = targetAccounts[platform] || item.targetAccount || "@aiko.animal";
    assertAllowedTarget(platform, {...item, targetAccounts: normalizedTargets});
  }
  const createdAt = text(item.createdAt, 80) || nowIso();
  return {
    ...item,
    id: queueId,
    sourceDocId: item.sourceDocId || queueId,
    text: bodyText,
    replyText: text(item.replyText, 2000),
    platforms,
    targetAccount: text(item.targetAccount, 100) || "@aiko.animal",
    targetAccounts: normalizedTargets,
    automationStatus: text(item.automationStatus, 40) || READY_STATUS,
    workerStatus: text(item.workerStatus, 40) || "queued",
    realPostApproved: item.realPostApproved === true,
    images,
    imageUrls: images.map((image) => image.url).join("\n"),
    backend: "cloudflare-kv",
    createdAt,
    updatedAt: nowIso(),
  };
}

async function readQueueItem(env, id) {
  const raw = await getKv(env).get(queueKey(id));
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

async function putQueueItem(env, item) {
  await getKv(env).put(queueKey(item.id), JSON.stringify(item));
  return item;
}

async function listQueueItems(env, {status = "", limit = 1000} = {}) {
  const kv = getKv(env);
  const items = [];
  let cursor;
  do {
    const page = await kv.list({prefix: QUEUE_PREFIX, cursor, limit: Math.min(1000, limit)});
    for (const key of page.keys || []) {
      if (items.length >= limit) break;
      const item = await readQueueItem(env, key.name.slice(QUEUE_PREFIX.length));
      if (!item) continue;
      if (status && text(item.automationStatus, 40) !== status) continue;
      items.push(item);
    }
    cursor = page.list_complete || items.length >= limit ? undefined : page.cursor;
  } while (cursor);
  return items;
}

function sanitizeErrorMessage(message) {
  return String(message || "")
    .replace(/access_token=[^&\s"]+/gi, "access_token=REDACTED")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/g, "Bearer REDACTED")
    .replace(/OAuth\s+[^"]+/g, "OAuth REDACTED")
    .slice(0, 1000);
}

async function readJsonResponse(label, res) {
  const raw = await res.text();
  let data = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch (_) {
    data = {raw};
  }
  if (!res.ok || data.error) {
    throw new Error(`${label} failed ${res.status}: ${sanitizeErrorMessage(raw)}`);
  }
  return data;
}

async function graphPost(url, params) {
  const res = await fetch(url, {
    method: "POST",
    body: new URLSearchParams(params),
  });
  return readJsonResponse(url, res);
}

async function graphGet(url, params = {}) {
  const parsed = new URL(url);
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && text(value, 1000) !== "") {
      parsed.searchParams.set(key, String(value));
    }
  });
  const res = await fetch(parsed.toString(), {
    headers: {accept: "application/json"},
  });
  return readJsonResponse(parsed.toString(), res);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function requiredEnv(env, key, label) {
  const value = text(env && env[key], 10000);
  if (!value) throw new Error(`${label} secret is not set`);
  return value;
}

function threadsTokenForTarget(env, target) {
  if (normalizeAccount(target) === "uchinoko.aiko") {
    return requiredEnv(env, "UCHINOKO_THREADS_ACCESS_TOKEN", "Uchinoko Threads access token");
  }
  return requiredEnv(env, "SNS_THREADS_ACCESS_TOKEN", "Threads access token");
}

function instagramCredentialsForTarget(env, target) {
  if (normalizeAccount(target) === "uchinoko.aiko") {
    return {
      token: requiredEnv(env, "UCHINOKO_IG_ACCESS_TOKEN", "Uchinoko Instagram access token"),
      userId: requiredEnv(env, "UCHINOKO_IG_USER_ID", "Uchinoko Instagram user ID"),
    };
  }
  return {
    token: requiredEnv(env, "SNS_IG_ACCESS_TOKEN", "Instagram access token"),
    userId: requiredEnv(env, "SNS_IG_USER_ID", "Instagram user ID"),
  };
}

async function resolveThreadsProfile(token) {
  const data = await graphGet(`${THREADS_BASE_URL}/me`, {
    fields: "id,username",
    access_token: token,
  });
  if (!data.id) throw new Error("Threads profile missing id");
  return {id: String(data.id), username: String(data.username || "")};
}

async function resolveInstagramProfile(token, userId) {
  const data = await graphGet(`${GRAPH_BASE_URL}/${encodeURIComponent(userId)}`, {
    fields: "id,username",
    access_token: token,
  });
  if (!data.id) throw new Error("Instagram profile missing id");
  return {id: String(data.id), username: String(data.username || "")};
}

async function createThreadsContainer(userId, token, params, label) {
  const created = await graphPost(`${THREADS_BASE_URL}/${encodeURIComponent(userId)}/threads`, {
    ...params,
    access_token: token,
  });
  if (!created.id) throw new Error(`Threads ${label} create missing id`);
  return String(created.id);
}

async function publishThreadsContainer(userId, token, creationId, label) {
  await sleep(THREADS_PUBLISH_DELAY_MS);
  const published = await graphPost(`${THREADS_BASE_URL}/${encodeURIComponent(userId)}/threads_publish`, {
    creation_id: creationId,
    access_token: token,
  });
  if (!published.id) throw new Error(`Threads ${label} publish missing id`);
  return published;
}

async function createThreadsPostContainer(userId, token, postText, imageUrls) {
  if (imageUrls.length > MAX_THREADS_CAROUSEL_ITEMS) {
    throw new Error(`Threads carousel supports up to ${MAX_THREADS_CAROUSEL_ITEMS} images; received ${imageUrls.length}`);
  }
  if (imageUrls.length > 1) {
    const childIds = [];
    for (const imageUrl of imageUrls) {
      childIds.push(await createThreadsContainer(userId, token, {
        media_type: "IMAGE",
        image_url: imageUrl,
        is_carousel_item: "true",
      }, "carousel image item"));
    }
    await sleep(THREADS_PUBLISH_DELAY_MS);
    const creationId = await createThreadsContainer(userId, token, {
      text: postText,
      media_type: "CAROUSEL",
      children: childIds.join(","),
    }, "carousel");
    return {creationId, mediaCount: childIds.length};
  }
  const firstImage = imageUrls[0] || "";
  const params = {
    text: postText,
    media_type: firstImage ? "IMAGE" : "TEXT",
  };
  if (firstImage) params.image_url = firstImage;
  const creationId = await createThreadsContainer(userId, token, params, firstImage ? "image" : "text");
  return {creationId, mediaCount: firstImage ? 1 : 0};
}

async function publishThreads(env, post, imageUrls) {
  const postText = text(post.text, 5000);
  if (!postText) throw new Error("Threads text is empty");
  const target = assertAllowedTarget("threads", post);
  const token = threadsTokenForTarget(env, target);
  const user = await resolveThreadsProfile(token);
  if (normalizeAccount(user.username) !== target) {
    throw new Error(`blocked Threads authenticated account: @${user.username}; expected @${target}`);
  }
  const postContainer = await createThreadsPostContainer(user.id, token, postText, imageUrls);
  const published = await publishThreadsContainer(user.id, token, postContainer.creationId, "post");
  const media = await graphGet(`${THREADS_BASE_URL}/${encodeURIComponent(published.id)}`, {
    fields: "id,permalink,shortcode,timestamp,media_type,username",
    access_token: token,
  }).catch(() => ({id: published.id}));
  const replyText = text(post.replyText, 2000);
  let replyId = "";
  let replyError = "";
  if (replyText) {
    try {
      const replyCreationId = await createThreadsContainer(user.id, token, {
        text: replyText,
        media_type: "TEXT",
        reply_to_id: published.id,
      }, "reply");
      const replyPublished = await publishThreadsContainer(user.id, token, replyCreationId, "reply");
      replyId = String(replyPublished.id || "");
    } catch (error) {
      replyError = sanitizeErrorMessage(error && error.message ? error.message : error);
    }
  }
  return {
    id: String(media.id || published.id),
    permalink: String(media.permalink || ""),
    shortcode: String(media.shortcode || ""),
    timestamp: String(media.timestamp || ""),
    mediaType: String(media.media_type || ""),
    replyId,
    replyError,
    replyRequested: Boolean(replyText),
    mediaCount: postContainer.mediaCount,
    isCarousel: postContainer.mediaCount > 1,
    username: String(media.username || user.username),
    userId: user.id,
  };
}

async function createInstagramImageContainer(imageUrl, token, userId, carouselItem, caption = "") {
  const params = {
    image_url: imageUrl,
    access_token: token,
  };
  if (carouselItem) params.is_carousel_item = "true";
  if (!carouselItem && caption) params.caption = caption;
  const created = await graphPost(`${GRAPH_BASE_URL}/${encodeURIComponent(userId)}/media`, params);
  if (!created.id) throw new Error("Instagram image container missing id");
  return String(created.id);
}

async function publishInstagramContainer(creationId, token, userId) {
  const published = await graphPost(`${GRAPH_BASE_URL}/${encodeURIComponent(userId)}/media_publish`, {
    creation_id: creationId,
    access_token: token,
  });
  if (!published.id) throw new Error("Instagram publish missing id");
  return {id: String(published.id)};
}

async function publishInstagram(env, post, imageUrls) {
  const caption = text(post.text, 5000);
  if (!caption) throw new Error("Instagram caption is empty");
  if (!imageUrls.length) throw new Error("Instagram publishing requires at least one image");
  const target = assertAllowedTarget("instagram", post);
  const credentials = instagramCredentialsForTarget(env, target);
  const profile = await resolveInstagramProfile(credentials.token, credentials.userId);
  if (normalizeAccount(profile.username) !== target) {
    throw new Error(`blocked Instagram authenticated account: @${profile.username || ""}; expected @${target}`);
  }
  const limitedImages = imageUrls.slice(0, MAX_INSTAGRAM_IMAGES);
  if (limitedImages.length === 1) {
    const creationId = await createInstagramImageContainer(limitedImages[0], credentials.token, credentials.userId, false, caption);
    await sleep(INSTAGRAM_CONTAINER_WAIT_MS);
    const published = await publishInstagramContainer(creationId, credentials.token, credentials.userId);
    const media = await graphGet(`${GRAPH_BASE_URL}/${encodeURIComponent(published.id)}`, {
      fields: "id,permalink,username,timestamp,media_type",
      access_token: credentials.token,
    }).catch(() => ({id: published.id}));
    return {
      id: String(media.id || published.id),
      permalink: String(media.permalink || ""),
      username: String(media.username || profile.username || ""),
      mediaType: String(media.media_type || "IMAGE"),
      mediaCount: 1,
    };
  }
  const childIds = [];
  for (const imageUrl of limitedImages) {
    childIds.push(await createInstagramImageContainer(imageUrl, credentials.token, credentials.userId, true));
  }
  await sleep(INSTAGRAM_CONTAINER_WAIT_MS);
  const parent = await graphPost(`${GRAPH_BASE_URL}/${encodeURIComponent(credentials.userId)}/media`, {
    media_type: "CAROUSEL",
    children: childIds.join(","),
    caption,
    access_token: credentials.token,
  });
  if (!parent.id) throw new Error("Instagram carousel container missing id");
  await sleep(INSTAGRAM_CONTAINER_WAIT_MS);
  const published = await publishInstagramContainer(parent.id, credentials.token, credentials.userId);
  const media = await graphGet(`${GRAPH_BASE_URL}/${encodeURIComponent(published.id)}`, {
    fields: "id,permalink,username,timestamp,media_type",
    access_token: credentials.token,
  }).catch(() => ({id: published.id}));
  return {
    id: String(media.id || published.id),
    permalink: String(media.permalink || ""),
    username: String(media.username || profile.username || ""),
    mediaType: String(media.media_type || "CAROUSEL_ALBUM"),
    mediaCount: childIds.length,
    ignoredImages: Math.max(0, imageUrls.length - childIds.length),
  };
}

function dryRunReason(env, post = {}, nowMs = Date.now(), {forceDryRun = false} = {}) {
  if (post.testOnly === true) return "testOnly queue entry";
  if (post.dryRun === true) return "dryRun queue entry";
  if (forceDryRun) return "manual dry run";
  if (!realPostingEnabled(env)) return "SNS_API_POSTING_ENABLED is not true";
  const platforms = stringArray(post.platforms);
  const unsupported = platforms.filter((platform) => !SUPPORTED_PLATFORMS.has(platform));
  if (unsupported.length) return `unsupported platforms: ${unsupported.join(",")}`;
  if (post.realPostApproved !== true) return "realPostApproved is not true";
  const badImages = unsupportedImageRefs(post);
  if (badImages.length) return "Cloudflare SNS worker requires public image URLs";
  const scheduledMs = queuedScheduleMillis(post);
  if (!scheduledMs) return "scheduleAt is missing";
  if (nowMs - scheduledMs > MAX_POST_LATE_MS) return "scheduleAt is more than 30 minutes old";
  return "";
}

async function markDryRun(env, post, reason) {
  const next = {
    ...post,
    workerStatus: "dryRun",
    lastWorkerCheckAt: nowIso(),
    lastDryRunAt: nowIso(),
    lastDryRunReason: reason,
    dryRunTextPreview: text(post.text, 160).replace(/\s+/g, " "),
    dryRunCount: Number(post.dryRunCount || 0) + 1,
    updatedAt: nowIso(),
  };
  await putQueueItem(env, next);
  return "dry_run_logged";
}

async function claimDuePost(env, id, nowMs) {
  const fresh = await readQueueItem(env, id);
  if (!fresh || fresh.automationStatus !== READY_STATUS) return null;
  const scheduledMs = queuedScheduleMillis(fresh);
  if (!scheduledMs || scheduledMs > nowMs) return null;
  const next = {
    ...fresh,
    automationStatus: "posting",
    workerStatus: "posting",
    startedAt: nowIso(),
    lastWorkerCheckAt: nowIso(),
    updatedAt: nowIso(),
  };
  await putQueueItem(env, next);
  return next;
}

async function publishPlatform(env, platform, post, imageUrls) {
  if (platform === "threads") return publishThreads(env, post, imageUrls);
  if (platform === "instagram") return publishInstagram(env, post, imageUrls);
  throw new Error(`unsupported platform: ${platform}`);
}

async function publishQueuedPost(env, post, nowMs) {
  const claimed = await claimDuePost(env, post.id, nowMs);
  if (!claimed) return "skipped";
  const platforms = stringArray(claimed.platforms);
  const imageUrls = imageUrlsForPost(claimed);
  const platformStatus = {...plainObject(claimed.platformStatus)};
  const platformResults = {...plainObject(claimed.platformResults)};
  const platformErrors = {...plainObject(claimed.platformErrors)};
  const warnings = stringArray(claimed.workerWarnings);

  let postedCount = 0;
  let errorCount = 0;
  for (const platform of platforms) {
    if (platformStatus[platform] === "posted") continue;
    try {
      platformStatus[platform] = "posting";
      await putQueueItem(env, {
        ...claimed,
        platformStatus,
        workerStatus: "posting",
        lastWorkerCheckAt: nowIso(),
        updatedAt: nowIso(),
      });
      const result = await publishPlatform(env, platform, claimed, imageUrls);
      if (result.ignoredImages) warnings.push(`${platform} ignored ${result.ignoredImages} extra image(s)`);
      if (result.replyError) warnings.push(`${platform} reply failed: ${result.replyError}`);
      platformStatus[platform] = "posted";
      platformResults[platform] = {
        ...result,
        route: "cloudflare-worker",
        postedAt: nowIso(),
      };
      delete platformErrors[platform];
      postedCount++;
    } catch (error) {
      errorCount++;
      platformStatus[platform] = "error";
      platformErrors[platform] = sanitizeErrorMessage(error && error.message ? error.message : error);
    }
    await putQueueItem(env, {
      ...claimed,
      platformStatus,
      platformResults,
      platformErrors,
      workerWarnings: warnings,
      lastWorkerCheckAt: nowIso(),
      updatedAt: nowIso(),
    });
  }

  const allPosted = platforms.every((platform) => platformStatus[platform] === "posted");
  const automationStatus = allPosted ? "posted" : (postedCount ? "partial_error" : "error");
  const workerStatus = automationStatus;
  await putQueueItem(env, {
    ...claimed,
    automationStatus,
    workerStatus,
    status: automationStatus,
    platformStatus,
    platformResults,
    platformErrors,
    workerWarnings: warnings,
    postedAt: allPosted ? nowIso() : (claimed.postedAt || ""),
    finishedAt: nowIso(),
    lastWorkerCheckAt: nowIso(),
    updatedAt: nowIso(),
  });
  if (errorCount) return postedCount ? "partial_error" : "error";
  return "posted";
}

async function processDueQueue(env, {forceDryRun = false, limit = WORKER_LIMIT} = {}) {
  const nowMs = Date.now();
  const readyItems = await listQueueItems(env, {status: READY_STATUS, limit: 1000});
  const dueItems = readyItems
    .filter((post) => {
      const scheduledMs = queuedScheduleMillis(post);
      return scheduledMs && scheduledMs <= nowMs;
    })
    .sort((a, b) => queuedScheduleMillis(a) - queuedScheduleMillis(b))
    .slice(0, Math.max(1, Math.min(WORKER_LIMIT, Number(limit) || WORKER_LIMIT)));
  const summary = {
    checked: readyItems.length,
    due: dueItems.length,
    dryRun: 0,
    skipped: 0,
    posted: 0,
    partialError: 0,
    errors: 0,
  };
  for (const post of dueItems) {
    try {
      const reason = dryRunReason(env, post, nowMs, {forceDryRun});
      const result = reason ? await markDryRun(env, post, reason) : await publishQueuedPost(env, post, nowMs);
      if (result === "dry_run_logged") summary.dryRun++;
      else if (result === "posted") summary.posted++;
      else if (result === "partial_error") summary.partialError++;
      else if (result === "error") summary.errors++;
      else summary.skipped++;
    } catch (error) {
      summary.errors++;
      await putQueueItem(env, {
        ...post,
        workerStatus: "error",
        lastWorkerError: sanitizeErrorMessage(error && error.message ? error.message : error),
        lastWorkerCheckAt: nowIso(),
        updatedAt: nowIso(),
      });
    }
  }
  return summary;
}

async function verifyCredentials(env, platforms = [], targetAccounts = {}) {
  const checks = {};
  for (const platform of platforms) {
    if (!SUPPORTED_PLATFORMS.has(platform)) continue;
    const target = normalizeAccount(targetAccounts[platform] || "aiko.animal");
    try {
      if (platform === "threads") {
        const token = threadsTokenForTarget(env, target);
        const profile = await resolveThreadsProfile(token);
        checks[platform] = {
          ok: normalizeAccount(profile.username) === target,
          username: profile.username,
          expected: target,
        };
      }
      if (platform === "instagram") {
        const credentials = instagramCredentialsForTarget(env, target);
        const profile = await resolveInstagramProfile(credentials.token, credentials.userId);
        checks[platform] = {
          ok: normalizeAccount(profile.username) === target,
          username: profile.username,
          expected: target,
        };
      }
    } catch (error) {
      checks[platform] = {
        ok: false,
        expected: target,
        message: sanitizeErrorMessage(error && error.message ? error.message : error),
      };
    }
  }
  return checks;
}

async function handleQueuePost(request, env) {
  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return jsonResponse({ok: false, error: "invalid_request"}, 400);
  }
  let item;
  try {
    item = normalizeQueueDoc(payload);
  } catch (error) {
    return jsonResponse({ok: false, error: "invalid_queue_doc", message: error.message || String(error)}, 400);
  }
  const existing = await readQueueItem(env, item.id);
  if (existing && existing.automationStatus === "posted") {
    return jsonResponse({ok: false, error: "queue_item_already_posted", id: item.id}, 409);
  }
  await putQueueItem(env, {
    ...existing,
    ...item,
    enqueueCount: Number(existing && existing.enqueueCount || 0) + 1,
    updatedAt: nowIso(),
  });
  return jsonResponse({
    ok: true,
    id: item.id,
    item: summarizeQueueItem(item),
    existing: Boolean(existing),
  }, existing ? 200 : 201);
}

function summarizeQueueItem(item = {}) {
  const platforms = stringArray(item.platforms);
  return {
    id: item.id,
    source: item.source || "",
    backend: item.backend || "cloudflare-kv",
    automationStatus: item.automationStatus || "",
    workerStatus: item.workerStatus || "",
    platforms,
    targetAccounts: plainObject(item.targetAccounts),
    date: item.date || "",
    dueTime: item.dueTime || "",
    scheduleAt: item.scheduleAt || "",
    scheduleAtLocal: item.scheduleAtLocal || "",
    textPreview: text(item.text, 160).replace(/\s+/g, " "),
    imageCount: imageUrlsForPost(item).length,
    realPostApproved: item.realPostApproved === true,
    platformStatus: plainObject(item.platformStatus),
    platformResults: plainObject(item.platformResults),
    platformErrors: plainObject(item.platformErrors),
    lastDryRunReason: item.lastDryRunReason || "",
    lastWorkerError: item.lastWorkerError || "",
    postedAt: item.postedAt || "",
    updatedAt: item.updatedAt || "",
    createdAt: item.createdAt || "",
  };
}

async function handleRequest(request, env) {
  const url = new URL(request.url);
  if (url.pathname === "/health") {
    return jsonResponse({
      ok: true,
      service: "aiko-sns-post-worker",
      postingEnabled: realPostingEnabled(env),
      hasKv: Boolean(env && env.SNS_KV),
      queuePrefix: QUEUE_PREFIX,
    });
  }

  if (!url.pathname.startsWith("/admin/")) {
    return jsonResponse({ok: false, error: "not_found"}, 404);
  }
  const authError = requireAdmin(request, env);
  if (authError) return authError;

  if (url.pathname === "/admin/health") {
    const platforms = stringArray(url.searchParams.get("platforms"));
    const targetAccounts = {};
    for (const platform of platforms) {
      targetAccounts[platform] = url.searchParams.get(`${platform}Target`) || url.searchParams.get("target") || "@aiko.animal";
    }
    const checks = platforms.length ? await verifyCredentials(env, platforms, targetAccounts) : {};
    return jsonResponse({
      ok: true,
      service: "aiko-sns-post-worker",
      postingEnabled: realPostingEnabled(env),
      hasKv: Boolean(env && env.SNS_KV),
      checks,
    });
  }

  if (url.pathname === "/admin/queue" && request.method === "POST") {
    return handleQueuePost(request, env);
  }
  if (url.pathname === "/admin/queue" && request.method === "GET") {
    const status = text(url.searchParams.get("status"), 40);
    const limit = Math.max(1, Math.min(1000, Number(url.searchParams.get("limit") || 160) || 160));
    const items = await listQueueItems(env, {status, limit});
    return jsonResponse({
      ok: true,
      items: items.map(summarizeQueueItem),
      count: items.length,
      generatedAt: nowIso(),
    });
  }
  if (url.pathname === "/admin/run-due" && request.method === "POST") {
    const payload = await request.json().catch(() => ({}));
    const forceDryRun = url.searchParams.get("dryRun") === "true" || payload.dryRun === true;
    const summary = await processDueQueue(env, {forceDryRun});
    return jsonResponse({ok: true, dryRun: forceDryRun, summary});
  }
  return jsonResponse({ok: false, error: "not_found"}, 404);
}

export default {
  async fetch(request, env) {
    try {
      return await handleRequest(request, env);
    } catch (error) {
      return jsonResponse({
        ok: false,
        error: "worker_error",
        message: sanitizeErrorMessage(error && error.message ? error.message : error),
      }, 500);
    }
  },
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(processDueQueue(env).catch((error) => {
      console.error("sns post worker scheduled error", sanitizeErrorMessage(error && error.message ? error.message : error));
    }));
  },
};

export {
  dryRunReason,
  imageUrlsForPost,
  listQueueItems,
  normalizeQueueDoc,
  processDueQueue,
  queuedScheduleMillis,
};
