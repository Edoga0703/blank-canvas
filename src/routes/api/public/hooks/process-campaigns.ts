import { createFileRoute } from "@tanstack/react-router";
import { assertCronRequest } from "@/lib/cron-auth.server";

/**
 * Motor de campanhas (disparo seguro).
 * Executado por pg_cron a cada minuto. Aplica todas as blindagens anti-ban:
 * janela horária, limite diário/aquecimento, opt-out, blocklist, pausa de contato,
 * dedup por atividade recente, spintax, "digitando..." e envio de mídia.
 */
export const Route = createFileRoute("/api/public/hooks/process-campaigns")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const _cronDeny = assertCronRequest(request);
        if (_cronDeny) return _cronDeny;
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const {
            getActiveInstance, waSendText, waSendMedia, waPresenceTyping,
            spin, normalizeBrNumber, inWindow, warmupLimit,
          } = await import("@/lib/wa-dispatch.server");

          // Promove agendadas que chegaram a hora
          await supabaseAdmin
            .from("campaign")
            .update({ status: "enviando" })
            .eq("status", "agendada")
            .lte("proximo_envio_em", new Date().toISOString());

          const { data: due } = await supabaseAdmin
            .from("campaign")
            .select("*")
            .eq("status", "enviando")
            .lte("proximo_envio_em", new Date().toISOString())
            .limit(10);

          const processed: any[] = [];
          const hoje = new Date().toISOString().slice(0, 10);

          for (const c of (due ?? []) as any[]) {
            // 1) Instância ativa e conectada
            const inst = await getActiveInstance(c.company_id);
            if (!inst || inst.paused) {
              processed.push({ id: c.id, skipped: "sem_whatsapp" });
              // adia 2min para tentar de novo
              await supabaseAdmin.from("campaign").update({
                proximo_envio_em: new Date(Date.now() + 120000).toISOString(),
              }).eq("id", c.id);
              continue;
            }

            // 2) Janela horária
            const dias = ((c.janela_dias ?? [1, 2, 3, 4, 5]) as number[]);
            const tz = c.timezone || "America/Sao_Paulo";
            if (!inWindow(tz, dias, c.janela_hora_ini || "09:00", c.janela_hora_fim || "18:00")) {
              // adia 15min
              await supabaseAdmin.from("campaign").update({
                proximo_envio_em: new Date(Date.now() + 15 * 60000).toISOString(),
              }).eq("id", c.id);
              processed.push({ id: c.id, skipped: "fora_janela" });
              continue;
            }

            // 3) Reset contador diário se virou o dia
            let enviadosHoje = c.enviados_hoje ?? 0;
            let dataContador = c.enviados_hoje_data;
            if (dataContador !== hoje) {
              enviadosHoje = 0;
              dataContador = hoje;
              await supabaseAdmin.from("campaign").update({
                enviados_hoje: 0, enviados_hoje_data: hoje,
              }).eq("id", c.id);
            }

            // 4) Limite diário (com aquecimento)
            const limiteHoje = warmupLimit(
              c.limite_diario ?? 200,
              !!c.aquecimento_ativo,
              c.aquecimento_dia_inicio || null,
            );
            if (enviadosHoje >= limiteHoje) {
              // adia para o próximo início da janela (aprox. próximo dia às hora_ini)
              await supabaseAdmin.from("campaign").update({
                proximo_envio_em: new Date(Date.now() + 60 * 60000).toISOString(),
              }).eq("id", c.id);
              processed.push({ id: c.id, skipped: "limite_diario", limiteHoje });
              continue;
            }

            // 5) Pega batch pequeno (respeitando o restante do limite)
            const batchSize = Math.min(5, limiteHoje - enviadosHoje);
            const nowIso = new Date().toISOString();
            const { data: pending } = await supabaseAdmin
              .from("campaign_target")
              .select("id, contato_numero, contato_nome, tentativas, max_tentativas")
              .eq("campaign_id", c.id)
              .eq("status", "pendente")
              .or(`proxima_em.is.null,proxima_em.lte.${nowIso}`)
              .limit(batchSize);

            if (!pending || pending.length === 0) {
              await supabaseAdmin.from("campaign").update({
                status: "concluida",
                concluido_em: new Date().toISOString(),
              }).eq("id", c.id);
              processed.push({ id: c.id, done: true });
              continue;
            }

            // 6) Carrega listas de bloqueio da empresa (uma vez por ciclo)
            const [{ data: optouts }, { data: blocks }, { data: pauses }] = await Promise.all([
              supabaseAdmin.from("campaign_optout").select("numero").eq("company_id", c.company_id),
              supabaseAdmin.from("campaign_blocklist").select("numero").eq("company_id", c.company_id),
              supabaseAdmin.from("contact_pause").select("numero").eq("company_id", c.company_id).eq("pausado", true),
            ]);
            const bloqueados = new Set<string>([
              ...(optouts ?? []).map((x: any) => normalizeBrNumber(x.numero)),
              ...(blocks ?? []).map((x: any) => normalizeBrNumber(x.numero)),
              ...(pauses ?? []).map((x: any) => normalizeBrNumber(x.numero)),
            ]);

            let enviados = 0;
            let falhas = 0;
            let pulados = 0;

            for (const t of pending as any[]) {
              const numero = normalizeBrNumber(t.contato_numero);
              // 7) Skip: bloqueado / opt-out / pausado
              if (bloqueados.has(numero)) {
                await supabaseAdmin.from("campaign_target").update({
                  status: "pulado", erro: "opt-out ou bloqueio",
                }).eq("id", t.id);
                pulados++;
                continue;
              }

              // 8) Skip: cliente já ativo (recebeu mensagem recente)
              const dias = c.pular_ativos_dias ?? 15;
              if (dias > 0) {
                const desde = new Date(Date.now() - dias * 86400000).toISOString();
                const { data: recente } = await supabaseAdmin
                  .from("mensagens")
                  .select("id")
                  .eq("company_id", c.company_id)
                  .eq("numero", numero)
                  .gte("created_at", desde)
                  .limit(1);
                if (recente && recente.length) {
                  await supabaseAdmin.from("campaign_target").update({
                    status: "pulado", erro: `ativo nos últimos ${dias}d`,
                  }).eq("id", t.id);
                  pulados++;
                  continue;
                }
              }

              try {
                // 9) Spintax
                const texto = spin(String(c.mensagem || "")).replace(/\{\{nome\}\}/gi, t.contato_nome || "");

                // 10) Presence "digitando..."
                if (c.simular_digitacao) {
                  const dur = Math.min(8000, Math.max(1200, texto.length * 50));
                  await waPresenceTyping(inst, numero, dur);
                  await new Promise((r) => setTimeout(r, dur));
                }

                // 11) Envio (mídia opcional; senão texto)
                if (c.midia_url_v2 && c.midia_tipo) {
                  await waSendMedia(inst, numero, {
                    url: c.midia_url_v2,
                    type: c.midia_tipo,
                    caption: texto,
                    fileName: c.midia_nome ?? undefined,
                  });
                } else {
                  await waSendText(inst, numero, texto);
                }

                await supabaseAdmin.from("campaign_target").update({
                  status: "enviado",
                  enviado_em: new Date().toISOString(),
                }).eq("id", t.id);

                // Registra no histórico do chat
                if (c.created_by) {
                  await supabaseAdmin.from("mensagens").insert({
                    company_id: c.company_id,
                    user_id: c.created_by,
                    numero,
                    contato_nome: t.contato_nome,
                    direcao: "saida",
                    autor: "sistema",
                    texto,
                    midia_tipo: c.midia_tipo || null,
                    midia_url: c.midia_url_v2 || null,
                    midia_nome: c.midia_nome || null,
                  });
                }
                enviados++;
              } catch (e: any) {
                const tent = (t.tentativas ?? 0) + 1;
                const maxT = t.max_tentativas ?? 3;
                if (tent < maxT) {
                  // retry com backoff exponencial (30s, 2min, 8min)
                  const backoffSeg = 30 * Math.pow(4, tent - 1);
                  await supabaseAdmin.from("campaign_target").update({
                    tentativas: tent,
                    proxima_em: new Date(Date.now() + backoffSeg * 1000).toISOString(),
                    erro: String(e?.message ?? e).slice(0, 500),
                  }).eq("id", t.id);
                } else {
                  await supabaseAdmin.from("campaign_target").update({
                    status: "falhou",
                    tentativas: tent,
                    erro: String(e?.message ?? e).slice(0, 500),
                  }).eq("id", t.id);
                  falhas++;
                }
              }
            }

            // 12) Próximo envio com intervalo aleatório + pausa longa periódica
            const minS = Math.max(2, c.intervalo_min_seg ?? 5);
            const maxS = Math.max(minS, c.intervalo_max_seg ?? 20);
            let nextDelaySeg = Math.floor(minS + Math.random() * (maxS - minS + 1));
            const totalEnviados = (c.total_enviados ?? 0) + enviados;
            const pausaApos = c.pausa_apos_envios ?? 50;
            const pausaDurMin = c.pausa_duracao_min ?? 10;
            if (
              pausaApos > 0 &&
              Math.floor(totalEnviados / pausaApos) > Math.floor((c.total_enviados ?? 0) / pausaApos)
            ) {
              nextDelaySeg = pausaDurMin * 60;
            }

            await supabaseAdmin.from("campaign").update({
              total_enviados: totalEnviados,
              total_falhas: (c.total_falhas ?? 0) + falhas,
              enviados_hoje: enviadosHoje + enviados,
              enviados_hoje_data: hoje,
              proximo_envio_em: new Date(Date.now() + nextDelaySeg * 1000).toISOString(),
            }).eq("id", c.id);

            processed.push({ id: c.id, enviados, falhas, pulados });
          }

          const nowParts = new Intl.DateTimeFormat("en-US", {
            timeZone: "America/Fortaleza", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
          }).formatToParts(new Date());
          const clock = Object.fromEntries(nowParts.map((part) => [part.type, part.value]));
          const reportWindow = ["08:00", "12:00", "17:00"].includes(`${clock.hour}:${clock.minute}`)
            && !["Sat", "Sun"].includes(clock.weekday);
          let reportAi: { analisados: number; falhas: number } | null = null;
          if (reportWindow) {
            const { data: operationalCompanies } = await supabaseAdmin.from("company").select("id").eq("atendimento_operacional", true);
            const { analyzeOperationalCards } = await import("@/lib/atendimento-live-analysis.server");
            reportAi = { analisados: 0, falhas: 0 };
            const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Fortaleza", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
            const start = new Date(`${day}T03:00:00.000Z`).toISOString();
            const end = new Date(new Date(start).getTime() + 24 * 60 * 60_000).toISOString();
            for (const company of operationalCompanies ?? []) {
              const [{ data: cards }, { data: analyses }] = await Promise.all([
                supabaseAdmin.from("crm_cards").select("numero,nome,ultima_em").eq("company_id", company.id)
                  .gte("ultima_em", start).lt("ultima_em", end).order("ultima_em", { ascending: false }).limit(100),
                supabaseAdmin.from("atendimento_live_analise").select("numero,ultima_em_analisada").eq("company_id", company.id),
              ]);
              const prior = new Map((analyses ?? []).map((row: any) => [row.numero, row.ultima_em_analisada]));
              const pending = (cards ?? []).filter((card: any) => {
                const analyzedAt = prior.get(card.numero);
                return !analyzedAt || new Date(card.ultima_em) > new Date(String(analyzedAt));
              }).slice(0, 30);
              const result = await analyzeOperationalCards(supabaseAdmin, company.id, pending);
              reportAi.analisados += result.analisados;
              reportAi.falhas += result.falhas;
            }
          }

          return Response.json({ ok: true, processed, reportAi });
        } catch (e: any) {
          console.error("[process-campaigns]", e);
          return new Response(JSON.stringify({ ok: false, error: String(e?.message ?? e) }), { status: 500 });
        }
      },
    },
  },
});
