// Webhook público da Uazapi.
// Normaliza o payload para o mesmo shape que /api/public/whatsapp-webhook já processa
// (event, instance, data.key/message/pushName) e reencaminha internamente por HTTP.
// Assim toda a lógica de IA, fluxos, kanban, CSAT permanece em um único lugar.
import { createFileRoute } from "@tanstack/react-router";

function mapEvent(raw: string | undefined): string | null {
  const e = String(raw ?? "").toLowerCase().replace(/[._-]/g, "");
  if (!e) return null;
  if (e.includes("messagesupdate") || e === "messageupdate" || e === "messagesupdate") return "messages.update";
  if (e.includes("messages") || e === "message" || e.includes("upsert")) return "messages.upsert";
  if (e.includes("connection") || e.includes("status")) return "connection.update";
  if (e.includes("qrcode") || e === "qr") return "qrcode.updated";
  if (e.includes("sendmessage")) return "send.message";
  return null;
}

function pickInstanceName(payload: any): string | null {
  const inst =
    payload?.instance ||
    payload?.instanceName ||
    payload?.owner ||
    payload?.data?.instance ||
    payload?.data?.instanceName ||
    payload?.instance?.name ||
    payload?.data?.instance?.name ||
    null;
  return typeof inst === "string" && inst.trim() ? inst.trim() : null;
}

function buildKey(src: any, fromMe: boolean): any {
  const k = src?.key || src?.data?.key || src || {};
  const remoteJid = k.remoteJid || k.chatid || k.chatId || src?.chatid || src?.chatId || src?.remoteJid || src?.sender || src?.from || src?.number || src?.data?.key?.remoteJid || "";
  const id = k.id || src?.id || src?.messageid || src?.messageId || src?.data?.key?.id || "";
  return { remoteJid, fromMe: !!(k.fromMe ?? src?.fromMe ?? fromMe), id, participant: k.participant };
}

/** Converte um WAMessage-like da Uazapi no shape esperado pelo webhook Evolution. */
function normalizeMessagePayload(instanceName: string, raw: any): any {
  // Uazapi pode entregar { message: {...} } ou { messages: [...] } ou o próprio objeto.
  // IMPORTANTE: Se vier aninhado em data, precisamos dos campos que estão FORA de data.message também.
  const msgSrc = raw?.data?.message ?? raw?.message ?? raw?.messages?.[0] ?? raw?.data?.messages?.[0] ?? raw?.data ?? raw;
  // O objeto de metadados (key, chatid, fromMe, pushName) pode estar no envelope OU dentro da própria mensagem.
  const context = msgSrc ?? raw?.data ?? raw;

  const fromMe = !!(msgSrc?.fromMe ?? msgSrc?.key?.fromMe ?? raw?.data?.fromMe ?? raw?.data?.key?.fromMe ?? raw?.fromMe);
  const key = buildKey(context, fromMe);

  // Garantir que remoteJid esteja disponível para facilitar a extração no whatsapp-webhook
  const remoteJid =
    key?.remoteJid ||
    msgSrc?.chatid || msgSrc?.chatId || msgSrc?.sender || msgSrc?.remoteJid || msgSrc?.number || msgSrc?.from ||
    raw?.data?.chatid || raw?.data?.remoteJid || raw?.data?.number ||
    raw?.chatid || raw?.remoteJid || raw?.number || "";

  let message: any = msgSrc?.message ?? msgSrc?.msg ?? msgSrc; // msgSrc já pode ser a mensagem
  const hasBaileysShape =
    message && typeof message === "object" &&
    Object.keys(message).some((k) => k === "conversation" || k.endsWith("Message"));


  if (!hasBaileysShape) {
    const text: string =
      (typeof msgSrc?.text === "string" && msgSrc.text) ||
      (typeof msgSrc?.content === "string" && msgSrc.content) ||
      (typeof msgSrc?.caption === "string" && msgSrc.caption) ||
      (typeof msgSrc?.message?.conversation === "string" && msgSrc.message.conversation) ||
      (typeof msgSrc?.data?.message?.conversation === "string" && msgSrc.data.message.conversation) ||
      "";
    
    const type = String(msgSrc?.messageType || msgSrc?.type || msgSrc?.mediaType || "").toLowerCase();
    const mime: string | undefined = msgSrc?.mimetype || msgSrc?.mimeType || undefined;
    const url: string | undefined = msgSrc?.file || msgSrc?.fileURL || msgSrc?.mediaUrl || msgSrc?.url || undefined;
    const fileName: string | undefined = msgSrc?.fileName || msgSrc?.filename || undefined;

    if (type.includes("audio") || type.includes("ptt") || (mime ?? "").startsWith("audio/")) {
      message = { audioMessage: { mimetype: mime || "audio/ogg", url } };
    } else if (type.includes("sticker") || (mime ?? "").includes("webp")) {
      // Figurinhas chegam como StickerMessage (sem texto). Sem este ramo a
      // mensagem era gravada vazia e o chat mostrava "Mídia indisponível".
      message = { stickerMessage: { mimetype: mime || "image/webp", url } };
    } else if (type.includes("image") || (mime ?? "").startsWith("image/")) {
      message = { imageMessage: { mimetype: mime || "image/jpeg", url, caption: text || undefined } };
    } else if (type.includes("video") || (mime ?? "").startsWith("video/")) {
      message = { videoMessage: { mimetype: mime || "video/mp4", url, caption: text || undefined } };
    } else if (type.includes("document") || (!!fileName && !!url)) {
      message = { documentMessage: { mimetype: mime || "application/octet-stream", url, fileName, caption: text || undefined } };
    } else if (type.includes("location")) {
      // Localização: preserva coordenadas para o chat exibir o mapa.
      const locSrc =
        msgSrc?.location ?? msgSrc?.locationMessage ?? msgSrc?.content ?? msgSrc?.data ?? msgSrc;
      const lat = Number(
        locSrc?.degreesLatitude ?? locSrc?.latitude ?? locSrc?.lat ?? msgSrc?.latitude ?? msgSrc?.lat,
      );
      const lng = Number(
        locSrc?.degreesLongitude ?? locSrc?.longitude ?? locSrc?.lng ?? locSrc?.lon ??
        msgSrc?.longitude ?? msgSrc?.lng,
      );
      const nome = locSrc?.name ?? locSrc?.address ?? msgSrc?.name ?? msgSrc?.address ?? text ?? "";
      message = {
        locationMessage: {
          degreesLatitude: Number.isFinite(lat) ? lat : undefined,
          degreesLongitude: Number.isFinite(lng) ? lng : undefined,
          name: nome || undefined,
        },
      };
    } else if (!text && (type.includes("contact") || type.includes("vcard") || type.includes("poll") || type.includes("reaction"))) {
      // Tipos sem texto próprio: grava um rótulo legível em vez de vazio.
      const label =
        type.includes("location") ? "📍 Localização" :
        type.includes("poll") ? "📊 Enquete" :
        type.includes("reaction") ? "💬 Reação" :
        "👤 Contato";
      message = { conversation: label };
    } else {
      message = { conversation: text };
    }

  }

  return {
    event: "messages.upsert",
    instance: instanceName,
    remoteJid,
    data: {
      key: { ...key, remoteJid },

      message,
      pushName: msgSrc?.pushName || msgSrc?.senderName || msgSrc?.notify || msgSrc?.sender_name || raw?.pushName || raw?.senderName || null,
      messageTimestamp: msgSrc?.messageTimestamp || msgSrc?.timestamp || raw?.timestamp || Math.floor(Date.now() / 1000),
    },
  };
}


function normalizeConnectionPayload(instanceName: string, raw: any): any {
  const src = raw?.instance ?? raw?.data ?? raw ?? {};
  const rawStatus = String(src?.status ?? src?.state ?? src?.connection ?? "").toLowerCase();
  const state =
    rawStatus === "connected" ? "open" :
    rawStatus === "connecting" ? "connecting" :
    rawStatus === "disconnected" || rawStatus === "close" ? "close" :
    rawStatus || undefined;
  return {
    event: "connection.update",
    instance: instanceName,
    data: { state, statusReason: src?.statusReason ?? src?.reason },
  };
}

function normalizeUpdatePayload(instanceName: string, raw: any): any {
  return {
    event: "messages.update",
    instance: instanceName,
    data: raw?.data ?? raw,
  };
}

export const Route = createFileRoute("/api/public/uazapi-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const rawText = await request.text();
          console.log(`[uazapi-webhook] Incoming POST for instance identification at ${new Date().toISOString()}`);
          const payload: any = JSON.parse(rawText || "{}");

          const url = new URL(request.url);
          const suppliedToken = url.searchParams.get("t") || "";

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          // 1) Resolve a instância pelo token do webhook (o que sempre existe na URL configurada).
          let inst: any = null;
          if (suppliedToken) {
            const { data } = await supabaseAdmin
              .from("whatsapp_instances")
              .select("*")
              .eq("webhook_token", suppliedToken)
              .maybeSingle();
            inst = data ?? null;
          }
          // 2) Fallback: pelo nome da instância vindo no payload.
          let instanceName = inst?.instance_name || pickInstanceName(payload);
          if (!inst && instanceName) {
            const { data } = await supabaseAdmin
              .from("whatsapp_instances")
              .select("*")
              .eq("instance_name", instanceName)
              .maybeSingle();
            inst = data ?? null;
          }

          if (!inst) {
            console.warn("[uazapi-webhook] No instance found for identification");
            return new Response("instance-not-found", { status: 200 });
          }

          // GARANTIR QUE inst TENHA company_id E user_id populados se vierem da query
          console.log(`[uazapi-webhook] Identified instance: ${inst.instance_name} (Company: ${inst.company_id})`);
          if (!inst?.webhook_token || !instanceName) {
            console.warn("[uazapi-webhook] instância não resolvida", { suppliedToken, keys: Object.keys(payload || {}) });
            return new Response("unknown instance", { status: 200 });
          }

          const mapped = mapEvent(payload?.event || payload?.EventType || payload?.type);
          if (!mapped) {
            console.warn("[uazapi-webhook] evento ignorado", payload?.event ?? payload?.EventType ?? payload?.type);
            return new Response("ignored", { status: 200 });
          }

          console.log(`[uazapi-webhook] Event: ${mapped}, Instance: ${instanceName}, Token match: ${!!inst}`);


          let normalized: any;
          if (mapped === "messages.upsert" || mapped === "send.message") {
            normalized = normalizeMessagePayload(instanceName, payload);
            const jid = String(normalized?.remoteJid || "");
            // Grupos seguem para o handler interno (ele decide conforme a conta).
            if (!jid.includes("@g.us")) {
              const { isNonContactJid } = await import("@/lib/jid");
              if (isNonContactJid(jid)) {
                console.log("[uazapi-webhook] broadcast ignorado:", jid);
                return new Response("group-ignored", { status: 200 });
              }
            }
          } else if (mapped === "connection.update" || mapped === "qrcode.updated") {
            normalized = normalizeConnectionPayload(instanceName, payload);
          } else if (mapped === "messages.update") {
            normalized = normalizeUpdatePayload(instanceName, payload);
          } else {
            return new Response("ignored", { status: 200 });
          }
          const publicOrigin = (
            process.env.PUBLIC_APP_URL ||
            process.env.VITE_PUBLIC_APP_URL ||
            process.env.APP_URL ||
            "https://metrixcrm.com.br"
          ).replace(/\/+$/, "");

          const forwardUrl = `${publicOrigin}/api/public/whatsapp-webhook?t=${encodeURIComponent(inst.webhook_token)}`;

          console.log(`[uazapi-webhook] Forwarding normalized payload to: ${forwardUrl}`);
          
          // Importa o handler diretamente para evitar problemas de rede/loopback em preview
          try {
            console.log(`[uazapi-webhook] Triggering internal handler for ${instanceName}`, {
              instanceId: inst.id,
              companyId: inst.company_id,
              event: normalized.event
            });
            const { handleUazapiWebhookInternal } = await import("@/lib/uazapi-webhook.server");
            await handleUazapiWebhookInternal(inst, normalized);
            return new Response("ok", { status: 200 });
          } catch (internalErr: any) {
            console.error(`[uazapi-webhook] Internal forward failed:`, internalErr);
            return new Response("internal-fail", { status: 200 });
          }
        } catch (e: any) {
          console.warn("[uazapi-webhook] CRITICAL FAIL", e?.message);
          return new Response("error", { status: 200 });
        }
      },
    },
  },
});
