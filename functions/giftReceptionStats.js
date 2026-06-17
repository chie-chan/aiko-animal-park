import {
  appConfig,
  freeReceptionState,
  jsonResponse,
  requireBindings,
  requireMethod,
} from "./lib/gift-cloudflare.js";

export async function onRequest(context) {
  const methodError = requireMethod(context.request, ["GET", "HEAD"]);
  if (methodError) return methodError;

  const bindingError = requireBindings(context.env);
  if (bindingError) return bindingError;

  const reception = await freeReceptionState(context.env);
  return jsonResponse({
    ok: true,
    ...reception,
    config: appConfig(context.env),
  });
}
