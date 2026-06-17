import {
  appConfig,
  ensureSchema,
  findTicketByInstagramKey,
  freeReceptionState,
  insertTicket,
  jsonResponse,
  requireBindings,
  requireMethod,
  ticketFromRow,
  turnstileMode,
  text,
  validBotGate,
  validSameOriginPost,
  validateGiftPayload,
  verifyTurnstile,
} from "./lib/gift-cloudflare.js";

export async function onRequest(context) {
  const methodError = requireMethod(context.request, ["POST"]);
  if (methodError) return methodError;

  const bindingError = requireBindings(context.env, {needBucket: true});
  if (bindingError) return bindingError;

  if (!validSameOriginPost(context.request)) {
    return jsonResponse({ok: false, error: "bot_gate_failed"}, 403);
  }

  await ensureSchema(context.env);

  const payload = await context.request.json().catch(() => null);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return jsonResponse({ok: false, error: "invalid_request"}, 400);
  }
  if (!validBotGate(payload)) {
    return jsonResponse({ok: false, error: "bot_gate_failed"}, 403);
  }

  const mode = turnstileMode(context.env || {});
  if (mode.unavailable) {
    return jsonResponse({ok: false, error: "turnstile_unavailable"}, 503);
  }
  if (mode.enabled) {
    const token = text(payload.turnstileToken || payload["cf-turnstile-response"], 4096);
    const result = await verifyTurnstile(context, token);
    if (!result.ok) return jsonResponse({ok: false, error: result.error}, 403);
  }

  const validation = validateGiftPayload(payload);
  if (!validation.ok) {
    const status = validation.error === "paid_order_required" ? 409 : 400;
    return jsonResponse({
      ok: false,
      error: validation.error,
      config: appConfig(context.env),
    }, status);
  }

  const duplicate = await findTicketByInstagramKey(context.env, validation.data.instagramKey);
  if (duplicate) {
    return jsonResponse({
      ok: false,
      error: "duplicate_instagram",
      ticket: await ticketFromRow(context.env, duplicate),
      config: appConfig(context.env),
    }, 409);
  }

  const reception = await freeReceptionState(context.env);
  if (reception.freeReception.isClosed) {
    return jsonResponse({
      ok: false,
      error: "daily_free_closed",
      ...reception,
      config: appConfig(context.env),
    }, 429);
  }

  const row = await insertTicket(context.env, validation.data);
  const ticket = await ticketFromRow(context.env, row);
  return jsonResponse({
    ok: true,
    ticket,
    stats: reception.stats,
    freeReception: reception.freeReception,
    config: appConfig(context.env),
  });
}
