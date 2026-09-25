// Server-only: dispara webhooks de saída assinados (HMAC-SHA256).
async function hmacSha256Hex(secret: string, body: string) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export type OutboundEvent =
  | "message.received"
  | "message.sent"
  | "lead.created"
  | "lead.won"
  | "lead.lost"
  | "csat.responded";

export async function emitWebhook(companyId: string, event: OutboundEvent | string, payload: any, endpointId?: string) {
  // Avisos nas integrações por chave (Slack, Teams, Zapier, Make, n8n)
  if (!endpointId) {
    try {
      const { notificarIntegracoes } = await import("@/lib/integracoes/runtime.server");
      await notificarIntegracoes(companyId, event, payload);
    } catch (e) {
      console.warn("[integracoes] notificar", e);
    }
  }
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = (supabaseAdmin as any)
      .from("webhook_endpoint")
      .select("id, url, secret, eventos, ativo")
      .eq("company_id", companyId)
      .eq("ativo", true);
    if (endpointId) q = q.eq("id", endpointId);
    const { data: endpoints } = await q;

    const list = endpointId
      ? (endpoints ?? [])
      : (endpoints ?? []).filter((e: any) => !e.eventos?.length || e.eventos.includes(event));
    if (!list.length) return;

    const body = JSON.stringify({ event, company_id: companyId, data: payload, timestamp: new Date().toISOString() });
    await Promise.all(list.map(async (ep: any) => {
      const sig = await hmacSha256Hex(ep.secret, body);
      let status: number | null = null; let erro: string | null = null;
      try {
        const r = await fetch(ep.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-AtendeZap-Event": event,
            "X-AtendeZap-Signature": `sha256=${sig}`,
          },
          body,
          signal: AbortSignal.timeout(10_000),
        });
        status = r.status;
        if (!r.ok) erro = `HTTP ${r.status}`;
      } catch (e: any) {
        erro = String(e?.message ?? e).slice(0, 500);
      }
      await (supabaseAdmin as any).from("webhook_delivery_log").insert({
        company_id: companyId, endpoint_id: ep.id, evento: event, status_code: status, erro,
      });
    }));
  } catch (e) {
    console.warn("[emitWebhook]", e);
  }
}
