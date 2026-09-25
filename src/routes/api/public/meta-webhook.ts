import { createFileRoute } from "@tanstack/react-router";
import { createHmac } from "node:crypto";

// Webhook unificado Messenger (Facebook) + Instagram Direct.
// Etapa 1: validação (GET) + assinatura (POST).
// Etapa 2: normaliza o evento para o mesmo shape do webhook interno de WhatsApp
// e reencaminha, reaproveitando toda a pipeline (Conversas, IA, Kanban, CSAT).
export const Route = createFileRoute("/api/public/meta-webhook")({
  server: {
    handlers: {
      // Verificação do webhook na Meta
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const mode = url.searchParams.get("hub.mode");
        const token = url.searchParams.get("hub.verify_token");
        const challenge = url.searchParams.get("hub.challenge") ?? "";
        const expected = process.env["META_WEBHOOK_VERIFY_TOKEN"];

        if (mode === "subscribe" && expected && token === expected) {
          return new Response(challenge, {
            status: 200,
            headers: { "Content-Type": "text/plain" },
          });
        }
        return new Response("Forbidden", { status: 403 });
      },

      POST: async ({ request }) => {
        const rawBuf = Buffer.from(await request.arrayBuffer());
        const raw = rawBuf.toString("utf8");
        const clean = (v?: string) =>
          v
            ?.normalize("NFKC")
            .trim()
            .replace(/^Bearer\s+/i, "")
            .replace(/^["']|["']$/g, "")
            .replace(/[\s\u200B-\u200D\u2060\uFEFF]/g, "");
        // Instagram pode estar em outro app Meta (secret diferente do Messenger)
        const secrets = [
          clean(process.env["META_APP_SECRET"]),
          clean(process.env["META_APP_SECRET_INSTAGRAM"]),
        ].filter((s): s is string => !!s);
        const signature = request.headers
          .get("x-hub-signature-256")
          ?.trim()
          .toLowerCase()
          .replace(/^sha256=/, "") ?? "";

        if (secrets.length && signature) {
          let ok = false;
          const expectedList: string[] = [];
          for (const secret of secrets) {
            const digestBytes = createHmac("sha256", secret).update(rawBuf).digest("hex");
            const digestText = createHmac("sha256", secret).update(raw, "utf8").digest("hex");
            expectedList.push(`${secret.slice(0, 4)}:${digestBytes.slice(0, 8)}`);
            if (signature === digestBytes || signature === digestText) {
              ok = true;
              break;
            }
          }
          if (!ok) {
            let objType = "?";
            try {
              objType = String(JSON.parse(raw)?.object ?? "?");
            } catch {
              /* ignore */
            }
            console.error(
              `[meta-webhook] assinatura inválida (object=${objType}; recebida ${signature.slice(0, 8)}…; esperadas ${expectedList.join(", ")})`,
            );
            return new Response("Invalid signature", { status: 401 });
          }

        } else if (!secrets.length) {
          console.warn("[meta-webhook] META_APP_SECRET ausente — seguindo sem verificar assinatura");
        }



        let payload: any = null;
        try {
          payload = JSON.parse(raw);
        } catch {
          return new Response("Bad payload", { status: 400 });
        }

        // object: "page" (Messenger) | "instagram" (Direct)
        const canal = payload?.object === "instagram" ? "instagram" : "messenger";

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          const publicOrigin = (
            process.env["PUBLIC_APP_URL"] ||
            process.env["APP_URL"] ||
            "https://metrixcrm.com.br"
          ).replace(/\/+$/, "");

          for (const entry of payload?.entry ?? []) {
            // Em Messenger/Instagram o "recipient" é a Página/conta profissional.
            const events = entry?.messaging ?? entry?.standby ?? entry?.changes ?? [];
            for (const ev of events) {
              const senderId = ev?.sender?.id || ev?.value?.from?.id || ev?.value?.sender_id;
              const pageId = String(ev?.recipient?.id ?? entry?.id ?? ev?.value?.page_id ?? "");
              const isEcho = ev?.message?.is_echo === true;
              
              // Log detalhado para depuração se não for mensagem direta
              if (!ev?.message && !ev?.postback && !ev?.optin && !ev?.value) {
                console.log("[meta-webhook] Evento ignorado ou formato desconhecido:", JSON.stringify(ev));
                continue;
              }
              if (isEcho || !senderId || !pageId) continue;

              const texto: string =
                ev?.message?.text ??
                ev?.value?.message?.text ??
                ev?.postback?.payload ??
                ev?.postback?.title ??
                "";
              const attachment = ev?.message?.attachments?.[0] ?? ev?.value?.message?.attachments?.[0];
              const isNewMessaging = !!(ev?.message || ev?.value?.message);

              // Resolve a conexão Meta da empresa pelo id da página/conta.
              const { data: inst } = await (supabaseAdmin as any)
                .from("whatsapp_instances")
                .select("instance_name, webhook_token, provider, company_id, instance_token")
                .eq("phone_number_id", pageId)
                .like("provider", "meta%")
                .maybeSingle();

              if (!inst?.webhook_token) {
                console.warn("[meta-webhook] conexão não encontrada para página", pageId, canal, "Verifique se a página ID está correta no banco.");
                continue;
              }

              // Busca o perfil real do usuário na Graph API (nome + foto),
              // para não exibir o PSID/IGSID numérico nas Conversas.
              let perfilNome: string | null = null;
              let perfilFoto: string | null = null;
              if (inst.instance_token) {
                const token = inst.instance_token as string;
                const isIgToken = /^IG(AA|QV|QW)/.test(token);
                const base = isIgToken ? "https://graph.instagram.com/v23.0" : "https://graph.facebook.com/v23.0";
                const fields = isIgToken
                  ? "name,username,profile_pic"
                  : "first_name,last_name,name,profile_pic";
                try {
                  const r = await fetch(
                    `${base}/${encodeURIComponent(String(senderId))}?fields=${fields}&access_token=${encodeURIComponent(token)}`,
                  );
                  const j: any = await r.json().catch(() => null);
                  if (j && !j.error) {
                    perfilNome =
                      j.name ||
                      [j.first_name, j.last_name].filter(Boolean).join(" ") ||
                      (j.username ? `@${j.username}` : null) ||
                      null;
                    perfilFoto = j.profile_pic || j.profile_picture_url || null;
                  } else if (j?.error) {
                    console.warn("[meta-webhook] perfil indisponível", j.error?.message);
                  }
                } catch (e: any) {
                  console.warn("[meta-webhook] falha ao buscar perfil", e?.message);
                }

                // Fallback Messenger: o PSID não é consultável direto, mas aparece
                // como participante da conversa da Página.
                if (!perfilNome && !isIgToken) {
                  try {
                    const r = await fetch(
                      `https://graph.facebook.com/v23.0/${encodeURIComponent(pageId)}/conversations?platform=messenger&user_id=${encodeURIComponent(String(senderId))}&fields=participants&limit=1&access_token=${encodeURIComponent(token)}`,
                    );
                    const j: any = await r.json().catch(() => null);
                    const part = j?.data?.[0]?.participants?.data?.find(
                      (p: any) => String(p.id) === String(senderId),
                    );
                    if (part?.name) perfilNome = String(part.name);
                  } catch (e: any) {
                    console.warn("[meta-webhook] fallback conversations falhou", e?.message);
                  }
                }
              }

              // Último recurso: rótulo amigável em vez do ID numérico.
              if (!perfilNome) {
                const suf = String(senderId).slice(-4);
                perfilNome = canal === "instagram" ? `Instagram ${String(senderId).slice(-4)}` : `Messenger ${String(senderId).slice(-4)}`;
              }

              // Se não há texto nem anexo, e é uma mensagem nova, pode ser um evento de "seen" ou similar.
              if (!texto && !attachment && isNewMessaging) {
                 console.log("[meta-webhook] ignorando evento sem conteúdo de texto/mídia");
                 continue;
              }

              // Monta o payload no formato que o webhook interno já entende.
              let message: any = { conversation: texto };
              if (attachment?.payload?.url) {
                const url = attachment.payload.url as string;
                const type = String(attachment.type ?? "").toLowerCase();
                if (type === "image") message = { imageMessage: { mimetype: "image/jpeg", url, caption: texto || undefined } };
                else if (type === "video") message = { videoMessage: { mimetype: "video/mp4", url, caption: texto || undefined } };
                else if (type === "audio") message = { audioMessage: { mimetype: "audio/mp4", url } };
                else message = { documentMessage: { mimetype: "application/octet-stream", url, fileName: "arquivo", caption: texto || undefined } };
              }

              const normalized = {
                event: "messages.upsert",
                instance: inst.instance_name,
                data: {
                  key: { remoteJid: `${senderId}@s.whatsapp.net`, fromMe: false, id: ev?.message?.mid || ev?.value?.message?.mid || `meta_${Date.now()}` },
                  message,
                  pushName: perfilNome,
                  messageTimestamp: Math.floor((ev?.timestamp ?? Date.now()) / 1000),
                },
              };

              const forwardUrl = `${publicOrigin}/api/public/whatsapp-webhook?t=${encodeURIComponent(inst.webhook_token)}`;
              await fetch(forwardUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json", "x-webhook-token": inst.webhook_token },
                body: JSON.stringify(normalized),
              }).catch((e) => console.warn("[meta-webhook] forward failed", e?.message));

              // Marca o canal do lead (e salva nome/foto do perfil Meta).
              try {
                const patch: any = { canal_chat: canal };
                if (perfilNome) patch.nome = perfilNome;
                if (perfilFoto) patch.foto_url = perfilFoto;
                for (let i = 0; i < 3; i++) {
                  const { data } = await (supabaseAdmin as any)
                    .from("crm_cards")
                    .update(patch)
                    .eq("company_id", inst.company_id)
                    .eq("numero", String(senderId))
                    .select("id");
                  if (data?.length) break;
                  await new Promise((r) => setTimeout(r, 400));
                }
                if (perfilNome) {
                  await (supabaseAdmin as any)
                    .from("whatsapp_mensagens")
                    .update({ contato_nome: perfilNome })
                    .eq("company_id", inst.company_id)
                    .eq("numero", String(senderId));
                }
              } catch (e: any) {
                console.warn("[meta-webhook] update card falhou", e?.message);
              }
            }
          }
        } catch (e: any) {
          console.warn("[meta-webhook]", e?.message);
        }

        // A Meta exige 200 rápido
        return new Response("EVENT_RECEIVED", { status: 200 });
      },
    },
  },
});
