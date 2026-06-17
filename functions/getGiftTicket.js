import {
  appConfig,
  findTicketBySlug,
  jsonResponse,
  requireBindings,
  requireMethod,
  safeSlug,
  ticketFromRow,
} from "./lib/gift-cloudflare.js";

export async function onRequest(context) {
  const methodError = requireMethod(context.request, ["GET", "HEAD"]);
  if (methodError) return methodError;

  const bindingError = requireBindings(context.env);
  if (bindingError) return bindingError;

  const url = new URL(context.request.url);
  const slug = safeSlug(url.searchParams.get("slug"));
  if (!slug) return jsonResponse({ok: false, error: "bad_request"}, 400);

  const row = await findTicketBySlug(context.env, slug);
  if (!row) return jsonResponse({ok: false, error: "not_found"}, 404);

  return jsonResponse({
    ok: true,
    ticket: await ticketFromRow(context.env, row),
    config: appConfig(context.env),
  });
}
