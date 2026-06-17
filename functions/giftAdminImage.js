import {
  designObjectForTicket,
  findTicketBySlug,
  getAsset,
  jsonResponse,
  privateImageHeaders,
  requireAdmin,
  requireBindings,
  requireMethod,
  safeIndex,
  safeSlug,
} from "./lib/gift-cloudflare.js";

export async function onRequest(context) {
  const methodError = requireMethod(context.request, ["GET", "HEAD"]);
  if (methodError) return methodError;

  const bindingError = requireBindings(context.env, {needBucket: true});
  if (bindingError) return bindingError;

  const authError = requireAdmin(context);
  if (authError) return authError;

  const url = new URL(context.request.url);
  const slug = safeSlug(url.searchParams.get("slug"));
  if (!slug) return jsonResponse({ok: false, error: "bad_request"}, 400);

  const row = await findTicketBySlug(context.env, slug);
  if (!row) return jsonResponse({ok: false, error: "not_found"}, 404);

  let object = null;
  if (url.searchParams.get("kind") === "source") {
    object = await getAsset(context.env, row.source_photo_key);
  } else {
    const index = safeIndex(url.searchParams.get("index"));
    if (index < 0) return jsonResponse({ok: false, error: "bad_request"}, 400);
    object = await designObjectForTicket(context.env, row, index);
  }
  if (!object) return jsonResponse({ok: false, error: "not_found"}, 404);

  return new Response(context.request.method === "HEAD" ? null : object.body, {
    status: 200,
    headers: privateImageHeaders(object, "image/jpeg"),
  });
}
