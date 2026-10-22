import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/whatsapp-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          
          const searchParams = new URL(request.url).searchParams;
          const token = searchParams.get("t") || request.headers.get("x-webhook-token");

          if (!token) return new Response("missing token", { status: 400 });

          const rawText = await request.text();
          console.log(`[webhook] PROCESSING:`, rawText.slice(0, 300));
          const payload = JSON.parse(rawText || "{}");
          
          // Helper para busca profunda
          const findKey = (obj: any): any => {
            if (!obj || typeof obj !== 'object') return null;
            if (obj.key && obj.key.remoteJid) return obj.key;
            for (const k in obj) {
              const res = findKey(obj[k]);
              if (res) return res;
            }
            return null;
          };

          const findMessage = (obj: any): any => {
            if (!obj || typeof obj !== 'object') return null;
            if (obj.conversation || obj.extendedTextMessage || obj.text || obj.audioMessage) return obj;
            for (const k in obj) {
              if (k === 'key') continue;
              const res = findMessage(obj[k]);
              if (res) return res;
            }
            return null;
          };

          const key = findKey(payload);
          const message = findMessage(payload);
          
          const remoteJid = payload?.remoteJid || key?.remoteJid || payload?.data?.key?.remoteJid || payload?.data?.remoteJid || "";
          const number = (remoteJid.split("@")[0] || payload?.number || payload?.data?.number || "").replace(/\D/g, "");
          const rawPushName = payload?.pushName || payload?.data?.pushName || payload?.senderName || payload?.data?.senderName || payload?.notify;
          const providerMessageId = key?.id || payload?.id || payload?.data?.key?.id;

          const mAudio = message?.audioMessage || message?.pttMessage || null;
          const mImage = message?.imageMessage || null;
          const mVideo = message?.videoMessage || null;
          const mDoc = message?.documentMessage || null;
          const innerMsg = message?.extendedTextMessage || mImage || mVideo || mDoc || mAudio || message;
          let text = innerMsg?.text || innerMsg?.caption || message?.conversation || (typeof message === 'string' ? message : "");

          // Extração de metadados de mídia
          let midiaUrl: string | null = innerMsg?.url || innerMsg?.directPath || null;
          let midiaTipo: string | null = null;
          let midiaMime: string | null = innerMsg?.mimetype || null;
          let midiaNome: string | null = innerMsg?.fileName || null;

          if (mAudio) {
            midiaTipo = "audio";
            midiaUrl = midiaUrl || mAudio.url || mAudio.directPath || null;
            midiaMime = midiaMime || mAudio.mimetype || "audio/ogg";
          } else if (mImage) {
            midiaTipo = "image";
            midiaUrl = midiaUrl || mImage.url || mImage.directPath || null;
          } else if (mVideo) {
            midiaTipo = "video";
            midiaUrl = midiaUrl || mVideo.url || mVideo.directPath || null;
          } else if (mDoc) {
            midiaTipo = "document";
            midiaUrl = midiaUrl || mDoc.url || mDoc.directPath || null;
          }

          // Fallbacks para payloads de diferentes providers
          if (!midiaUrl && payload?.data?.message?.url) midiaUrl = payload.data.message.url;
          if (!midiaUrl && payload?.url) midiaUrl = payload.url;
          if (!midiaMime && payload?.mimetype) midiaMime = payload.mimetype;
          if (!midiaTipo) {
            const t = String(payload?.type || payload?.data?.messageType || payload?.messageType || midiaMime || "").toLowerCase();
            if (t.includes("audio") || t.includes("ptt")) midiaTipo = "audio";
            else if (t.includes("image")) midiaTipo = "image";
            else if (t.includes("video")) midiaTipo = "video";
            else if (t.includes("document")) midiaTipo = "document";
          }
          if (midiaTipo === "audio" && !text) text = "[ÁUDIO]";

          if (!number) {
            console.warn("[webhook] No number found");
            return new Response("no number", { status: 200 });
          }

          const { isNonContactJid } = await import("@/lib/jid");
          if (isNonContactJid(remoteJid, number)) {
            console.log(`[webhook] grupo/broadcast ignorado: ${remoteJid || number}`);
            return new Response("group-ignored", { status: 200 });
          }

          const { data: inst, error: dbErr } = await (supabaseAdmin as any)
            .from("whatsapp_instances")
            .select("id, company_id, instance_name, user_id, provider, webhook_token")
            .eq("webhook_token", token)
            .maybeSingle();
          
          if (dbErr || !inst) return new Response("unauthorized", { status: 401 });

          const companyId = inst.company_id;
          let userId = inst.user_id;

          // Mapeia direcao e autor de acordo com a restrição do banco
          // CHECK (autor = ANY (ARRAY['ia'::text, 'humano'::text, 'contato'::text]))
          const fromMe = key ? !!key.fromMe : !!payload.fromMe;
          const direcao = fromMe ? "saida" : "entrada";
          const autor = fromMe ? "humano" : "contato";
          // pushName em mensagens enviadas por nós é o nome do perfil da EMPRESA — nunca usar como nome do lead.
          const pushName = fromMe ? null : (rawPushName || null);
          const eventTimestamp = payload?.messageTimestamp || payload?.timestamp || payload?.data?.messageTimestamp || payload?.data?.timestamp || "sem-timestamp";
          const stableMessageId = String(providerMessageId || `evo:${inst.id}:${number}:${eventTimestamp}:${text || midiaTipo || "mensagem"}`);

          console.log(`[webhook] DEEP DETECTED: fromMe=${fromMe}, number=${number}, autor=${autor}`);

          const detectedChannel = payload?.channel || payload?.canal || (inst.provider === "meta_instagram" ? "instagram" : inst.provider === "meta_messenger" ? "messenger" : "whatsapp");

          if (fromMe) {
            const dezMinAtras = new Date(Date.now() - 10 * 60 * 1000).toISOString();
            const { data: jaGravada } = await (supabaseAdmin as any)
              .from("mensagens")
              .select("id, autor, whatsapp_message_id")
              .eq("company_id", companyId)
              .eq("numero", number)
              .eq("direcao", "saida")
              .or(`whatsapp_message_id.eq.${stableMessageId},texto.eq.${encodeURIComponent(text || "")}`)
              .gt("created_at", dezMinAtras)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();

            if (jaGravada) {
              if (!jaGravada.whatsapp_message_id && stableMessageId) {
                await (supabaseAdmin as any)
                  .from("mensagens")
                  .update({ whatsapp_message_id: stableMessageId, status_envio: "enviado" })
                  .eq("id", jaGravada.id);
              }
              console.log(`[whatsapp-webhook] Echo reconciliado (sem duplicar) para ${number}`);
              return new Response(JSON.stringify({ status: "echo_reconciled" }), {
                status: 200,
                headers: { "Content-Type": "application/json" }
              });
            }
          }

          const { data: insertedMsg, error: insertErr } = await (supabaseAdmin as any)
            .from("mensagens")
            .insert({
              company_id: companyId,
              user_id: userId,
              numero: number,
              contato_nome: pushName ?? null,
              direcao: direcao,
              autor: autor,
              texto: text || "",
              provider: inst.provider || (detectedChannel === "instagram" ? "meta_instagram" : detectedChannel === "messenger" ? "meta_messenger" : "lovable_whatsapp"),
              whatsapp_message_id: stableMessageId,
              created_at: new Date().toISOString(),
              midia_url: midiaUrl,
              midia_tipo: midiaTipo,
              midia_mime: midiaMime,
              midia_nome: midiaNome
            })
            .select("*")
            .maybeSingle();

          if (insertErr) {
            console.error("[webhook] DB Insert Error:", insertErr);
            throw insertErr;
          }
          console.log("[webhook] DB SUCCESS:", insertedMsg?.id);

          const { upsertCard, getStagesBrief, pickLeadOwner } = await import("@/lib/crm-engine.server");
          const stages = await getStagesBrief(supabaseAdmin, companyId);
          const currentCard = await upsertCard(supabaseAdmin, companyId, userId, number, pushName || null, text || "", stages, detectedChannel);

          if (currentCard && !fromMe) {
            // PERSISTÊNCIA DE DONO: O upsertCard preserva o dono se ele já existir.
            // Aqui apenas distribuímos se o lead estiver sem dono E a etapa for manual.
            // Busca configuração de IA da etapa atual
            const { data: stageConfig } = await (supabaseAdmin as any)
              .from("crm_stage")
              .select("modo_atendimento")
              .eq("id", currentCard.stage_id)
              .maybeSingle();

            const isManualMode = stageConfig?.modo_atendimento === 'manual';

            // Se modo manual e sem dono, distribui
            if (isManualMode && !currentCard.owner_id) {
              const ownerId = await pickLeadOwner(supabaseAdmin, companyId, currentCard.stage_id);
              if (ownerId) {
                await (supabaseAdmin as any).from("crm_cards").update({ owner_id: ownerId }).eq("id", currentCard.id);
              }
            }
          }

          // Executa uma única decisão: régua fixa ou IA
          if (!fromMe && text) {
            // Se for áudio, tentamos obter o base64 para transcrição/processamento
            if (midiaTipo === "audio" && midiaUrl) {
              try {
                const { evoGetMediaBase64 } = await import("@/lib/evolution.server");
                const mediaData = await evoGetMediaBase64(inst.instance_name, payload);
                if (mediaData?.base64) {
                   // O processAiResponse precisaria ser adaptado para aceitar áudio se quisermos transcrever
                   // Por enquanto garantimos que o áudio seja salvo corretamente no banco (já feito acima)
                   console.log("[webhook] Audio base64 extracted successfully");
                }
              } catch (e) {
                console.error("[webhook] Error fetching audio base64:", e);
              }
            }

            const { processInboundAutomation } = await import("@/lib/inbound-automation.server");
            await processInboundAutomation(supabaseAdmin, {
              companyId,
              numero: number,
              texto: text,
              inboundMessageId: stableMessageId,
              stageId: currentCard?.stage_id,
              isAudioMessage: midiaTipo === "audio",
            });
          }

          return new Response("ok", { status: 200 });
        } catch (e: any) {
          console.error("[webhook] FATAL ERROR:", e);
          return new Response("error: " + e.message, { status: 200 });
        }
      },
    },
  },
});