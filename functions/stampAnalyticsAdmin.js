import {
  jsonResponse,
  requireMethod,
} from "./lib/gift-cloudflare.js";

export async function onRequest(context) {
  const methodError = requireMethod(context.request, ["GET", "HEAD"]);
  if (methodError) return methodError;

  return jsonResponse({
    ok: false,
    error: "moved_to_local_hq",
    message: "Stamp analytics admin moved to Local HQ to avoid Workers KV list usage.",
    localUrl: "http://127.0.0.1:17776/stamp-analytics.html",
  }, 410);
}
