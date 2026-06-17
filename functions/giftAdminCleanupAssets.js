import {
  adminTicketFromRow,
  deleteTicketImageAssets,
  ensureSchema,
  findTicketBySlug,
  jsonResponse,
  requireAdmin,
  requireBindings,
  requireMethod,
  safeSlug,
  text,
} from "./lib/gift-cloudflare.js";

const CLEANUP_CONFIRMATION = "DELETE_GIFT_IMAGES";

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

  if (text(payload.confirmationText, 80) !== CLEANUP_CONFIRMATION) {
    return jsonResponse({
      ok: false,
      error: "cleanup_confirmation_required",
      message: `confirmationText must be ${CLEANUP_CONFIRMATION}`,
    }, 400);
  }

  const slug = safeSlug(payload.slug);
  if (!slug) return jsonResponse({ok: false, error: "bad_request"}, 400);

  const row = await findTicketBySlug(context.env, slug);
  if (!row) return jsonResponse({ok: false, error: "not_found"}, 404);

  const result = await deleteTicketImageAssets(context.env, row, {
    reason: text(payload.reason, 200) || "instagram_posted_cleanup",
  });

  return jsonResponse({
    ok: true,
    deletedAt: result.deletedAt,
    deletedCount: result.deletedCount,
    results: result.results,
    adminTicket: adminTicketFromRow(result.row),
  });
}
