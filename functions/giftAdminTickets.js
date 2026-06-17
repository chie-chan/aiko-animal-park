import {
  adminTicketFromRow,
  appConfig,
  decodeBase64Asset,
  designPhotoKey,
  ensureSchema,
  findTicketBySlug,
  jstDateKey,
  jsonResponse,
  listAdminTickets,
  nowIso,
  parseJsonArray,
  putAsset,
  requireAdmin,
  requireBindings,
  requireMethod,
  safeSlug,
  ticketFromRow,
  text,
  updateTicketRecord,
} from "./lib/gift-cloudflare.js";

const STATUS_VALUES = new Set(["queued", "processing", "done", "error"]);
const DESIGN_IMAGE_TYPE = "image/jpeg";

export async function onRequest(context) {
  const methodError = requireMethod(context.request, ["GET", "POST"]);
  if (methodError) return methodError;

  const bindingError = requireBindings(context.env, {needBucket: context.request.method === "POST"});
  if (bindingError) return bindingError;

  const authError = requireAdmin(context);
  if (authError) return authError;

  await ensureSchema(context.env);
  if (context.request.method === "GET") return listTickets(context);
  return updateTicket(context);
}

async function listTickets(context) {
  const url = new URL(context.request.url);
  const status = text(url.searchParams.get("status"), 20);
  const limit = Math.max(1, Math.min(100, Number(url.searchParams.get("limit") || 50)));
  const rows = await listAdminTickets(context.env, {
    status: status && STATUS_VALUES.has(status) ? status : "",
    limit,
  });
  return jsonResponse({
    ok: true,
    tickets: rows.map(adminTicketFromRow),
    config: appConfig(context.env),
  });
}

async function updateTicket(context) {
  const payload = await context.request.json().catch(() => null);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return jsonResponse({ok: false, error: "invalid_request"}, 400);
  }
  const slug = safeSlug(payload.slug);
  if (!slug) return jsonResponse({ok: false, error: "bad_request"}, 400);

  const row = await findTicketBySlug(context.env, slug);
  if (!row) return jsonResponse({ok: false, error: "not_found"}, 404);

  const nextStatus = text(payload.status, 20) || row.status || "queued";
  if (!STATUS_VALUES.has(nextStatus)) {
    return jsonResponse({ok: false, error: "invalid_status"}, 400);
  }

  let designKeys = parseJsonArray(row.design_keys);
  if (Array.isArray(payload.designs) && payload.designs.length) {
    designKeys = [];
    const dateKey = jstDateKey();
    for (let i = 0; i < Math.min(payload.designs.length, 6); i += 1) {
      const item = payload.designs[i] || {};
      const contentType = text(item.contentType, 40) || DESIGN_IMAGE_TYPE;
      if (contentType !== DESIGN_IMAGE_TYPE) {
        return jsonResponse({ok: false, error: "invalid_design_image_type", message: "gift design images must be uploaded as image/jpeg"}, 400);
      }
      const bytes = decodeBase64Asset(item.base64 || item.data || "");
      if (!bytes.length || bytes.length > 8 * 1024 * 1024) {
        return jsonResponse({ok: false, error: "invalid_design_image"}, 400);
      }
      const key = designPhotoKey(dateKey, slug, i, contentType);
      await putAsset(context.env, key, bytes, contentType, {
        slug,
        ticketNo: String(row.ticket_no || ""),
        kind: "gift_design",
        uploadedAt: nowIso(),
      });
      designKeys.push(key);
    }
  }

  const completedAt = nextStatus === "done" ? (row.completed_at || nowIso()) : row.completed_at;
  const updated = await updateTicketRecord(context.env, row, {
    status: nextStatus,
    designKeys,
    completedAt,
  });
  return jsonResponse({
    ok: true,
    ticket: await ticketFromRow(context.env, updated),
    adminTicket: adminTicketFromRow(updated),
  });
}
