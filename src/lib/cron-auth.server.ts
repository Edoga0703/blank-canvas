/**
 * Autorização compartilhada para endpoints /api/public/hooks/* chamados por pg_cron.
 * Confirma o header `x-cron-secret` contra CRON_SECRET (env server-only).
 */
export function assertCronRequest(request: Request): Response | null {
  const provided = request.headers.get("x-cron-secret") ?? "";
  const expected = process.env.CRON_SECRET ?? "";
  if (!expected) {
    return new Response(JSON.stringify({ ok: false, error: "CRON_SECRET não configurado" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
  // timing-safe compare
  if (provided.length !== expected.length) {
    return new Response("Unauthorized", { status: 401 });
  }
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  if (diff !== 0) return new Response("Unauthorized", { status: 401 });
  return null;
}
