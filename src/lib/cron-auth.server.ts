function matches(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Autorização compartilhada para endpoints /api/public/hooks/* chamados por pg_cron.
 * Confirma o header `x-cron-secret`, `Authorization: Bearer` ou parâmetro `?secret`
 * contra CRON_SECRET (ou credenciais de serviço do servidor como fallback).
 */
export function assertCronRequest(request: Request): Response | null {
  const authHeader = request.headers.get("authorization") ?? "";
  const bearer = authHeader.replace(/^Bearer\s+/i, "").trim();
  const cronHeader = (request.headers.get("x-cron-secret") ?? "").trim();
  let querySecret = "";
  try {
    const url = new URL(request.url);
    querySecret = (url.searchParams.get("cron_secret") || url.searchParams.get("secret") || "").trim();
  } catch { /* noop */ }

  const provided = cronHeader || bearer || querySecret;

  const validSecrets = [
    process.env.CRON_SECRET,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    process.env.META_WEBHOOK_VERIFY_TOKEN,
  ]
    .map((s) => (s ?? "").trim())
    .filter(Boolean);

  if (!validSecrets.length) {
    return new Response(JSON.stringify({ ok: false, error: "CRON_SECRET não configurado" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (validSecrets.some((expected) => matches(provided, expected))) {
    return null;
  }

  return new Response("Unauthorized", { status: 401 });
}

