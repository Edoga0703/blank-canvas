import { createFileRoute } from "@tanstack/react-router";
import { assertCronRequest } from "@/lib/cron-auth.server";
import { canAttemptSilentRecovery, hasPermanentInstanceIssue, isPermanentDisconnectReason, normalizeEvolutionState, statusAfterRecoveryPolicy } from "@/lib/whatsapp-connection";

// Cron watchdog: percorre todas as instâncias marcadas como conectadas/conectando,
// consulta o estado real na Evolution API e, se caiu, tenta um restart silencioso
// (reusa credenciais do dispositivo — não gera QR novo).
export const Route = createFileRoute("/api/public/hooks/whatsapp-watchdog")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const _cronDeny = assertCronRequest(request);
        if (_cronDeny) return _cronDeny;
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { evoState, evoFetchInstance, evoRestart, evoSetWebhook } = await import("@/lib/evolution.server");
          const { uazState, uazFetchInstance, uazRestart, uazSetWebhook } = await import("@/lib/uazapi.server");

          const { data: rows } = await (supabaseAdmin as any)
            .from("whatsapp_instances")
            .select("instance_name, status, company_id, last_state_at, webhook_token, provider, provider_type, instance_token")
            .in("status", ["connected", "connecting", "disconnected"]);

          const results: any[] = [];
          for (const row of rows ?? []) {
            const name = row.instance_name as string;
            const providerName = String(row.provider || row.provider_type || "evolution").toLowerCase();
            const isUazapi = providerName.includes("uazapi");
            // Canais Meta (Instagram/Messenger) não passam por este watchdog.
            if (/meta|instagram|messenger|wablast|oficial|official|lovable|telegram/.test(providerName)) continue;
            if (isUazapi && !row.instance_token) {
              results.push({ name, error: "instance_token ausente" });
              continue;
            }
            let state: string | null = null;
            try {
              const s: any = isUazapi ? await uazState(row.instance_token) : await evoState(name);
              state = s?.instance?.state || s?.state || null;
            } catch (e: any) {
              results.push({ name, error: e?.message });
              continue;
            }
            let rawStatus = normalizeEvolutionState(state);
            if (!rawStatus) {
              results.push({ name, state, status: row.status, ignored: true });
              continue;
            }

            const instanceDetails = rawStatus === "connected"
              ? isUazapi
                ? await uazFetchInstance(row.instance_token).catch(() => null)
                : await evoFetchInstance(name).catch(() => null)
              : null;
            const permanentIssue = hasPermanentInstanceIssue(instanceDetails);
            if (permanentIssue) rawStatus = "disconnected";

            if (row.webhook_token && rawStatus === "connected") {
              try {
                const webhookUrl = buildWebhookUrl(row.webhook_token, isUazapi);
                if (isUazapi) await uazSetWebhook(row.instance_token, webhookUrl);
                else await evoSetWebhook(name, webhookUrl);
                await (supabaseAdmin as any)
                  .from("whatsapp_instances")
                  .update({ webhook_configured_at: new Date().toISOString() } as any)
                  .eq("instance_name", name);
              } catch (e: any) {
                results.push({ name, action: "webhook_refresh_failed", error: e?.message });
              }
            }

            let newStatus = statusAfterRecoveryPolicy({
              rawStatus,
              previousStatus: row.status,
              lastStateAt: row.last_state_at,
            });

            // Se caiu ou ficou preso em "connecting", tenta restart silencioso por até 10 min.
            if (!permanentIssue && canAttemptSilentRecovery({ rawStatus, previousStatus: row.status, lastStateAt: row.last_state_at })) {
              try {
                if (isUazapi) await uazRestart(row.instance_token);
                else await evoRestart(name);
                results.push({ name, action: "restart" });
              } catch (e: any) {
                if (isPermanentDisconnectReason(Number(e?.status || 0))) newStatus = "disconnected";
                results.push({ name, action: "restart_failed", error: e?.message });
              }
            }

            if (newStatus !== row.status) {
              const updateLastStateAt = newStatus !== row.status || newStatus === "connected";
              await (supabaseAdmin as any)
                .from("whatsapp_instances")
                .update({ status: newStatus, ...(updateLastStateAt ? { last_state_at: new Date().toISOString() } : {}) } as any)
                .eq("instance_name", name);
            }

            // Alertas: conexão fora do ar há mais de 10 min -> abre alerta; ao voltar, resolve.
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
                    titulo: `Conexão WhatsApp offline (${name})`,
                    descricao: `Status: ${newStatus}. Sem conexão há ~${offlineMin} min.${permanentIssue ? " Sessão inválida: precisa reler o QR Code." : ""}`,
                  });
                }
              }
            } catch { /* noop */ }

            results.push({ name, state, status: newStatus, permanentIssue });
          }

          // Silêncio de entrada: conexão "conectada" mas sem nenhuma mensagem recebida há 1h+
          try {
            const { raiseAlert, resolveAlert } = await import("@/lib/alerts.server");
            const conectadas = (rows ?? []).filter((r: any) => r.status === "connected" && r.company_id);
            const umaHora = new Date(Date.now() - 60 * 60_000).toISOString();
            for (const row of conectadas) {
              const { data: ultima } = await (supabaseAdmin as any)
                .from("mensagens")
                .select("created_at")
                .eq("company_id", row.company_id)
                .eq("direcao", "entrada")
                .order("created_at", { ascending: false })
                .limit(1)
                .maybeSingle();
              const silenciosa = !ultima?.created_at || ultima.created_at < umaHora;
              if (silenciosa) {
                await raiseAlert({
                  tipo: "sem_entrada",
                  ref: String(row.company_id),
                  companyId: row.company_id,
                  severidade: "critical",
                  titulo: "Nenhuma mensagem recebida há mais de 1 hora",
                  descricao: `Conexão ${row.instance_name} aparece conectada, mas não há mensagens de entrada desde ${ultima?.created_at ?? "nunca"}. Possível webhook quebrado.`,
                });
              } else {
                await resolveAlert("sem_entrada", String(row.company_id));
              }
            }
          } catch { /* noop */ }

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

function buildWebhookUrl(token: string, isUazapi = false) {
  const publicOrigin = (process.env.PUBLIC_APP_URL || process.env.APP_URL || "https://metrixcrm.com.br").replace(/\/+$/, "");
  const path = isUazapi ? "/api/public/uazapi-webhook" : "/api/public/whatsapp-webhook";
  return `${publicOrigin}${path}?t=${encodeURIComponent(token)}`;
}
