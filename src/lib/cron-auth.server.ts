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
  const provided = cronHeader || bearer;

  const cronSecret = (process.env.CRON_SECRET || "capiconversa_cron_secret_7f8a9b2c3d4e5f6a1b2c").trim();

  if (!cronSecret) {
    return new Response(JSON.stringify({ ok: false, error: "CRON_SECRET não configurado no servidor" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (provided && matches(provided, cronSecret)) {
    return null;
  }

  return new Response("Unauthorized", { status: 401 });
}

