import {
  findTicketBySlug,
  imageHeaders,
  jsonResponse,
  requireBindings,
  requireMethod,
  revealObjectForTicket,
  safeIndex,
  safeSlug,
} from "./lib/gift-cloudflare.js";

export async function onRequest(context) {
  const methodError = requireMethod(context.request, ["GET", "HEAD"]);
  if (methodError) return methodError;

  const bindingError = requireBindings(context.env, {needBucket: true});
  if (bindingError) return bindingError;

  const url = new URL(context.request.url);
  const slug = safeSlug(url.searchParams.get("slug"));
  const index = safeIndex(url.searchParams.get("index"));
  if (!slug || index < 0) {
    return jsonResponse({ok: false, error: "bad_request"}, 400);
  }

  const row = await findTicketBySlug(context.env, slug);
  if (!row) return jsonResponse({ok: false, error: "not_found"}, 404);

  const object = await revealObjectForTicket(context.env, row, index);
  if (!object) return jsonResponse({ok: false, error: "not_found"}, 404);

  return new Response(context.request.method === "HEAD" ? null : object.body, {
    status: 200,
    headers: imageHeaders(object, "image/jpeg"),
  });
}
