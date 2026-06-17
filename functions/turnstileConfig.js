function text(value, max = 400) {
  return String(value || "").trim().slice(0, max);
}

export async function onRequest(context) {
  const flag = text(context.env.TURNSTILE_ENABLED, 20).toLowerCase();
  const siteKey = text(context.env.TURNSTILE_SITE_KEY, 300);
  const secretKey = text(context.env.TURNSTILE_SECRET_KEY, 300);
  const enabled = flag !== "false" && Boolean(siteKey && secretKey);

  return new Response(JSON.stringify({
    ok: true,
    enabled,
    siteKey: enabled ? siteKey : "",
  }), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, max-age=0",
    },
  });
}
