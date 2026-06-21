import assert from "node:assert/strict";
import worker, {
  dryRunReason,
  imageUrlsForPost,
  listQueueItems,
  normalizeQueueDoc,
  processDueQueue,
} from "../src/index.mjs";

class FakeKv {
  constructor() {
    this.store = new Map();
  }

  async get(key) {
    return this.store.get(key) || null;
  }

  async put(key, value) {
    this.store.set(key, String(value));
  }

  async list({prefix = "", cursor, limit = 1000} = {}) {
    const keys = [...this.store.keys()]
      .filter((key) => key.startsWith(prefix))
      .sort()
      .slice(cursor ? Number(cursor) : 0);
    const page = keys.slice(0, limit).map((name) => ({name}));
    const nextIndex = (cursor ? Number(cursor) : 0) + page.length;
    return {
      keys: page,
      list_complete: nextIndex >= keys.length,
      cursor: String(nextIndex),
    };
  }
}

function env(extra = {}) {
  return {
    SNS_KV: new FakeKv(),
    SNS_ADMIN_KEY: "test-admin-key",
    SNS_API_POSTING_ENABLED: "false",
    ...extra,
  };
}

function dueQueueDoc(overrides = {}) {
  const due = new Date(Date.now() - 60 * 1000).toISOString();
  return {
    id: "SNSAPI-20260621-1200-test",
    text: "hello sns",
    platforms: ["threads", "instagram"],
    targetAccount: "@aiko.animal",
    targetAccounts: {threads: "@aiko.animal", instagram: "@aiko.animal"},
    date: "2026-06-21",
    dueTime: "12:00",
    scheduleAt: due,
    scheduleAtLocal: "2026-06-21T12:00",
    automationStatus: "ready",
    workerStatus: "queued",
    realPostApproved: true,
    images: [{source: "url", url: "https://example.com/a.jpg"}],
    ...overrides,
  };
}

{
  const item = normalizeQueueDoc(dueQueueDoc());
  assert.equal(item.backend, "cloudflare-kv");
  assert.equal(item.images.length, 1);
  assert.deepEqual(imageUrlsForPost(item), ["https://example.com/a.jpg"]);
}

{
  assert.throws(() => normalizeQueueDoc(dueQueueDoc({
    id: "SNSAPI-20260621-1200-storage",
    images: [{source: "storage", storagePath: "sns/foo.jpg"}],
  })), /public https image URLs/);
}

{
  const testEnv = env();
  const request = new Request("https://worker.test/admin/queue", {
    method: "POST",
    headers: {
      authorization: "Bearer test-admin-key",
      "content-type": "application/json",
    },
    body: JSON.stringify({queueDoc: dueQueueDoc()}),
  });
  const response = await worker.fetch(request, testEnv);
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.ok, true);
  const items = await listQueueItems(testEnv, {status: "ready"});
  assert.equal(items.length, 1);
}

{
  const testEnv = env();
  const item = normalizeQueueDoc(dueQueueDoc());
  await testEnv.SNS_KV.put(`snsapi:queue:${item.id}`, JSON.stringify(item));
  const summary = await processDueQueue(testEnv);
  assert.equal(summary.dryRun, 1);
  const items = await listQueueItems(testEnv, {status: "ready"});
  assert.equal(items[0].automationStatus, "ready");
  assert.equal(items[0].workerStatus, "dryRun");
  assert.match(items[0].lastDryRunReason, /SNS_API_POSTING_ENABLED/);
}

{
  const enabledEnv = env({SNS_API_POSTING_ENABLED: "true"});
  const stale = dueQueueDoc({
    id: "SNSAPI-20260621-1200-stale",
    scheduleAt: new Date(Date.now() - 31 * 60 * 1000).toISOString(),
  });
  assert.match(dryRunReason(enabledEnv, stale), /more than 30 minutes old/);
}

console.log("sns-post-worker tests passed");
