import { createFileRoute } from "@tanstack/react-router";
import { assertCronRequest } from "@/lib/cron-auth.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

function getLocalClock(timezone: string): { localDate: string; localHour: number } {
  const tz = timezone || "America/Sao_Paulo";
  const now = new Date();
  try {
    const localDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
    const hourStr = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "2-digit",
      hour12: false,
    }).format(now);
    const parsedHour = Number(hourStr);
    const localHour = parsedHour === 24 ? 0 : Number.isNaN(parsedHour) ? now.getUTCHours() : parsedHour;
    return { localDate, localHour };
  } catch {
    return {
      localDate: now.toISOString().slice(0, 10),
      localHour: now.getUTCHours(),
    };
  }
}

export const Route = createFileRoute("/api/public/hooks/secretary-briefing")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = assertCronRequest(request);
        if (denied) return denied;

        try {
          const { data: agents, error: listErr } = await (supabaseAdmin as any)
            .from("agent_config")
            .select("id, company_id, nome_agente, secretary_enabled, secretary_phones, secretary_briefing_hour, secretary_timezone")
            .eq("secretary_enabled", true);

          if (listErr) throw listErr;

          const {
            buildExecutiveSnapshot,
            normalizeSecretaryDigits,
            resolveConnectedWhatsappInstance,
          } = await import("@/lib/ai-secretary.server");
          const { waSendText } = await import("@/lib/wa-dispatch.server");

          let evaluated = 0;
          let briefingsSent = 0;
          let messagesDispatched = 0;

          for (const agent of agents ?? []) {
            const phones: string[] = Array.isArray(agent.secretary_phones)
              ? agent.secretary_phones
                  .map((p: any) => normalizeSecretaryDigits(String(p || "")))
                  .filter((p: string) => p.length >= 10)
              : [];

            if (phones.length === 0) continue;
            evaluated += 1;

            const tz = String(agent.secretary_timezone || "America/Sao_Paulo").trim() || "America/Sao_Paulo";
            const targetHourStr = String(agent.secretary_briefing_hour || "08:00").trim();
            const targetHour = Number(targetHourStr.split(":")[0]);
            const { localDate, localHour } = getLocalClock(tz);

            if (Number.isNaN(targetHour) || localHour !== targetHour) {
              continue;
            }

            // Verificar que no se haya enviado ya hoy para esta empresa
            try {
              const { data: alreadySent } = await (supabaseAdmin as any)
                .from("audit_log")
                .select("id")
                .eq("company_id", agent.company_id)
                .eq("acao", "secretary_briefing_sent")
                .contains("detalhes", { local_date: localDate })
                .limit(1)
                .maybeSingle();

              if (alreadySent?.id) continue;
            } catch {}

            const waInst = await resolveConnectedWhatsappInstance(supabaseAdmin, agent.company_id);
            if (!waInst) continue;

            const snap = await buildExecutiveSnapshot(supabaseAdmin, agent.company_id, tz);
            const linesAlert =
              snap.lineas_whatsapp.desconectadas.length > 0
                ? `⚠️ *ALERTA Líneas WhatsApp desconectadas:* ${snap.lineas_whatsapp.desconectadas.map((d: any) => d.name).join(", ")}`
                : `✅ Líneas WhatsApp conectadas: ${snap.lineas_whatsapp.conectadas.length}/${snap.lineas_whatsapp.total}`;

            const pendingLines =
              snap.aprobaciones_pendientes.length > 0
                ? `\n• Códigos pendientes: ${snap.aprobaciones_pendientes.map((p: any) => p.short_code).join(", ")}`
                : "";

            const briefingText =
              `📊 *Briefing Diario (${localDate})*\n` +
              `• Leads nuevos ayer: ${snap.leads_ayer_count}\n` +
              `• Leads hoy: ${snap.leads_hoy.length}\n` +
              `• Citas programadas hoy: ${snap.citas_hoy.length}\n` +
              `• Aprobaciones pendientes: ${snap.aprobaciones_pendientes.length}${pendingLines}\n` +
              `• Chats sin respuesta (>2h): ${snap.chats_sin_respuesta_2h.length}\n` +
              `${linesAlert}`;

            let sentForCompany = 0;
            for (const phone of phones.slice(0, 5)) {
              try {
                await waSendText(waInst, phone, briefingText);
                sentForCompany += 1;
                messagesDispatched += 1;
              } catch (sendErr: any) {
                console.warn(`[secretary-briefing] Failed sending to ${phone}:`, sendErr?.message);
              }
            }

            if (sentForCompany > 0) {
              briefingsSent += 1;
              try {
                await (supabaseAdmin as any).from("audit_log").insert({
                  company_id: agent.company_id,
                  acao: "secretary_briefing_sent",
                  recurso: agent.id,
                  detalhes: {
                    local_date: localDate,
                    timezone: tz,
                    target_hour: targetHourStr,
                    sent_count: sentForCompany,
                  },
                });
              } catch {}
            }
          }

          return Response.json({
            ok: true,
            evaluated,
            briefingsSent,
            messagesDispatched,
          });
        } catch (error: any) {
          console.error("[secretary-briefing]", error?.message);
          return Response.json(
            { ok: false, error: "No se pudo procesar el briefing diario del secretario." },
            { status: 500 },
          );
        }
      },
      GET: async () => Response.json({ ok: true, hint: "POST para ejecutar" }),
    },
  },
});
