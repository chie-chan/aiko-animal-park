import {
  adminTicketFromRow,
  decodeBase64Asset,
  ensureSchema,
  findTicketBySlug,
  jstDateKey,
  jsonResponse,
  nowIso,
  putAsset,
  requireAdmin,
  requireBindings,
  requireMethod,
  revealPhotoKey,
  safeSlug,
  text,
  updateTicketRevealKeys,
} from "./lib/gift-cloudflare.js";

const REVEAL_IMAGE_TYPE = "image/jpeg";

export async function onRequest(context) {
  const methodError = requireMethod(context.request, ["POST"]);
  if (methodError) return methodError;

  const bindingError = requireBindings(context.env, {needBucket: true});
  if (bindingError) return bindingError;

  const authError = requireAdmin(context);
  if (authError) return authError;

  await ensureSchema(context.env);

  const payload = await context.request.json().catch(() => null);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return jsonResponse({ok: false, error: "invalid_request"}, 400);
  }

  const slug = safeSlug(payload.slug);
  if (!slug) return jsonResponse({ok: false, error: "bad_request"}, 400);

  const row = await findTicketBySlug(context.env, slug);
  if (!row) return jsonResponse({ok: false, error: "not_found"}, 404);

  const images = Array.isArray(payload.images) ? payload.images.slice(0, 10) : [];
  if (images.length < 4) {
    return jsonResponse({ok: false, error: "reveal_images_required", message: "At least four reveal images are required."}, 400);
  }

  const dateKey = jstDateKey();
  const revealKeys = [];
  for (let i = 0; i < images.length; i += 1) {
    const item = images[i] || {};
    const contentType = text(item.contentType, 40) || REVEAL_IMAGE_TYPE;
    if (contentType !== REVEAL_IMAGE_TYPE) {
      return jsonResponse({ok: false, error: "invalid_reveal_image_type", message: "gift reveal images must be uploaded as image/jpeg"}, 400);
    }
    const bytes = decodeBase64Asset(item.base64 || item.data || "");
    if (!bytes.length || bytes.length > 8 * 1024 * 1024) {
      return jsonResponse({ok: false, error: "invalid_reveal_image"}, 400);
    }
    const key = revealPhotoKey(dateKey, slug, i, contentType);
    await putAsset(context.env, key, bytes, contentType, {
      slug,
      ticketNo: String(row.ticket_no || ""),
      kind: "gift_instagram_reveal",
      slot: String(i + 1),
      uploadedAt: nowIso(),
    });
    revealKeys.push(key);
  }

  const updated = await updateTicketRevealKeys(context.env, row, revealKeys);
  const origin = new URL(context.request.url).origin;
  const revealImageUrls = revealKeys.map((_, index) =>
    `${origin}/giftRevealImage?slug=${encodeURIComponent(slug)}&index=${index}`
  );

  return jsonResponse({
    ok: true,
    revealImageUrls,
    adminTicket: adminTicketFromRow(updated),
  });
}
