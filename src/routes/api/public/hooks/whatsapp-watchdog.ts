import { createFileRoute } from "@tanstack/react-router";
import { assertCronRequest } from "@/lib/cron-auth.server";
import { canAttemptSilentRecovery, statusAfterRecoveryPolicy } from "@/lib/whatsapp-connection";

// Cron watchdog: percorre as instâncias D-API (QR / Pairing Code),
// consulta o estado real na D-API e, se caiu, tenta restart silencioso.
export const Route = createFileRoute("/api/public/hooks/whatsapp-watchdog")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const _cronDeny = assertCronRequest(request);
        if (_cronDeny) return _cronDeny;
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { dapiGetStatus, dapiRestartSession, dapiSetWebhookConfig } = await import("@/lib/dapi.server");

          const { data: rows } = await (supabaseAdmin as any)
            .from("whatsapp_instances")
            .select("instance_name, status, numero, company_id, last_state_at, webhook_token, provider")
            .eq("provider", "dapi")
            .in("status", ["connected", "connecting", "disconnected"]);

          const results: any[] = [];
          for (const row of rows ?? []) {
            const name = row.instance_name as string;
            try {
              const dStatus = await dapiGetStatus(name);
              const rawStatus =
                dStatus.status === "connected"
                  ? "connected"
                  : dStatus.status === "connecting"
                    ? "connecting"
                    : "disconnected";
              const permanentIssue = dStatus.status === "logged_out";

              if (row.webhook_token && rawStatus === "connected") {
                const webhookUrl = buildWebhookUrl(row.webhook_token);
                await dapiSetWebhookConfig(name, webhookUrl).catch(() => null);
              }

              const newStatus = permanentIssue
                ? "disconnected"
                : statusAfterRecoveryPolicy({
                    rawStatus,
                    previousStatus: row.status,
                    lastStateAt: row.last_state_at,
                  });

              if (
                !permanentIssue &&
                canAttemptSilentRecovery({ rawStatus, previousStatus: row.status, lastStateAt: row.last_state_at })
              ) {
                try {
                  await dapiRestartSession(name);
                  results.push({ name, provider: "dapi", action: "restart" });
                } catch (e: any) {
                  results.push({ name, provider: "dapi", action: "restart_failed", error: e?.message });
                }
              }

              if (newStatus !== row.status || (dStatus.numero && dStatus.numero !== row.numero)) {
                const updateLastStateAt = newStatus !== row.status || newStatus === "connected";
                await (supabaseAdmin as any)
                  .from("whatsapp_instances")
                  .update({
                    status: newStatus,
                    ...(updateLastStateAt ? { last_state_at: new Date().toISOString() } : {}),
                    ...(dStatus.numero ? { numero: dStatus.numero } : {}),
                  } as any)
                  .eq("instance_name", name);
              }

              try {
                const { raiseAlert, resolveAlert } = await import("@/lib/alerts.server");
                if (newStatus === "connected") {
                  await resolveAlert("conexao_offline", name);
                } else {
                  const since = row.last_state_at ? new Date(row.last_state_at).getTime() : 0;
                  const offlineMin = since ? Math.floor((Date.now() - since) / 60000) : 999;
                  if (offlineMin >= 10) {
                    await raiseAlert({
                      tipo: "conexao_offline",
                      ref: name,
                      companyId: row.company_id,
                      severidade: "critical",
                      titulo: `Conexão WhatsApp D-API offline (${name})`,
                      descricao: `Status: ${newStatus}. Sem conexão há ~${offlineMin} min.${permanentIssue ? " Sessão desconectada: precisa ler o QR Code." : ""}`,
                    });
                  }
                }
              } catch { /* noop */ }

              results.push({ name, provider: "dapi", state: dStatus.status, status: newStatus, permanentIssue });
            } catch (e: any) {
              results.push({ name, provider: "dapi", error: e?.message });
            }
          }

          return Response.json({ ok: true, checked: results.length, results });
        } catch (e: any) {
          console.error("[whatsapp-watchdog]", e?.message);
          return Response.json({ ok: false, error: e?.message }, { status: 500 });
        }
      },
      GET: async () => Response.json({ ok: true, hint: "POST para executar" }),
    },
  },
});

function buildWebhookUrl(token: string) {
  const publicOrigin = (process.env.PUBLIC_APP_URL || process.env.PUBLIC_BASE_URL || process.env.APP_URL || "https://project-blank-github.lovable.app").replace(/\/+$/, "");
  return `${publicOrigin}/api/public/dapi-webhook?t=${encodeURIComponent(token)}`;
}
