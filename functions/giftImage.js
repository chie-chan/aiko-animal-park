import {
  designObjectForTicket,
  findTicketBySlug,
  imageHeaders,
  jsonResponse,
  requireBindings,
  requireMethod,
  safeIndex,
  safeSlug,
  sourceObjectForTicket,
} from "./lib/gift-cloudflare.js";

export async function onRequest(context) {
  const methodError = requireMethod(context.request, ["GET", "HEAD"]);
  if (methodError) return methodError;

  const bindingError = requireBindings(context.env, {needBucket: true});
  if (bindingError) return bindingError;

  const url = new URL(context.request.url);
  const slug = safeSlug(url.searchParams.get("slug"));
  const kind = String(url.searchParams.get("kind") || "").toLowerCase();
  const index = safeIndex(url.searchParams.get("index"));
  if (!slug || (kind !== "source" && index < 0)) {
    return jsonResponse({ok: false, error: "bad_request"}, 400);
  }

  const row = await findTicketBySlug(context.env, slug);
  if (!row || row.status !== "done") {
    return jsonResponse({ok: false, error: "not_found"}, 404);
  }

  const object = kind === "source"
    ? await sourceObjectForTicket(context.env, row)
    : await designObjectForTicket(context.env, row, index);
  if (!object) {
    return jsonResponse({ok: false, error: "not_found"}, 404);
  }

  return new Response(context.request.method === "HEAD" ? null : object.body, {
    status: 200,
    headers: imageHeaders(object, "image/jpeg"),
  });
}
