import { createFileRoute } from "@tanstack/react-router";
import { readWablastWebhookHeaders, verifyWablastSignature } from "@/lib/wablast.server";

// Normaliza status Cloud API → nossa taxonomia
function mapStatus(s?: string | null): "enviado" | "entregue" | "lido" | "falha" | null {
  const v = (s || "").toLowerCase();
  if (v === "sent") return "enviado";
  if (v === "delivered") return "entregue";
  if (v === "read") return "lido";
  if (v === "failed" || v === "undelivered") return "falha";
  return null;
}

function pickMediaFromEvent(d: any): {
  kind: "image" | "video" | "audio" | "document" | null;
  mediaId: string | null;
  mime: string | null;
  fileName: string | null;
  caption: string;
} {
  const t = d?.type;
  const node = d?.media || null;
  const caption = String(node?.caption ?? "");
  const mime = node?.mime_type ?? null;
  const mediaId = node?.id ?? null;
  const fileName = node?.filename ?? null;
  if (t === "image" || t === "video" || t === "audio" || t === "document") {
    return { kind: t, mediaId, mime, fileName, caption };
  }
  return { kind: null, mediaId: null, mime, fileName, caption };
}

export const Route = createFileRoute("/api/public/wablast-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const raw = await request.text();
        const headers = readWablastWebhookHeaders(request);
        if (!verifyWablastSignature(raw, headers)) {
          return new Response("Invalid signature", { status: 401 });
        }
        let envelope: any;
        try { envelope = JSON.parse(raw); } catch {
          return new Response("Invalid JSON", { status: 400 });
        }

        const type: string = envelope?.type || "";
        const accountId: string | null = envelope?.account_id ?? null;
        const data: any = envelope?.data ?? {};

        // endpoint.test → apenas 200
        if (type === "endpoint.test") {
          return new Response("ok", { status: 200 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // ===== Partner onboarding: nova conta conectada =====
        if (type === "account.connected") {
          const externalRef: string | null = data?.external_ref || null;
          const wabaId: string | null = data?.waba_id || null;
          const phoneNumber: string | null = data?.phone_number || null;
          const phoneNumberId: string | null = data?.phone_number_id || null;
          const displayName: string | null = data?.display_name || null;
          if (!externalRef || !wabaId) return new Response("missing fields", { status: 200 });

          const { data: company } = await (supabaseAdmin as any)
            .from("company").select("id").eq("id", externalRef).maybeSingle();
          if (!company) return new Response("unknown company", { status: 200 });

          const { data: existing } = await (supabaseAdmin as any)
            .from("whatsapp_instances")
            .select("id").eq("company_id", externalRef).eq("waba_id", wabaId).maybeSingle();
          if (existing) {
            await (supabaseAdmin as any).from("whatsapp_instances")
              .update({
                status: "connected",
                display_name: displayName ?? undefined,
                numero: phoneNumber?.replace(/\D/g, "") ?? undefined,
                phone_number_id: phoneNumberId ?? undefined,
                last_state_at: new Date().toISOString(),
              }).eq("id", existing.id);
            return new Response("updated", { status: 200 });
          }

          const instanceName = `wablast_${externalRef.replace(/-/g, "").slice(0, 12)}_${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;
          const webhookToken = crypto.randomUUID();
          await (supabaseAdmin as any).from("whatsapp_instances").insert({
            company_id: externalRef,
            user_id: null,
            instance_name: instanceName,
            display_name: displayName || "WhatsApp Oficial",
            status: "connected",
            webhook_token: webhookToken,
            provider: "wablast",
            provider_type: "wablast",
            instance_token: null,
            waba_id: wabaId,
            phone_number_id: phoneNumberId,
            numero: phoneNumber?.replace(/\D/g, "") || null,
            last_state_at: new Date().toISOString(),
          });
          return new Response("connected", { status: 200 });
        }

        // Localiza instância pelo account_id (armazenado em waba_id)
        let inst: any = null;
        if (accountId) {
          const { data: r } = await (supabaseAdmin as any)
            .from("whatsapp_instances")
            .select("id, company_id, user_id, instance_name, waba_id, phone_number_id")
            .eq("waba_id", accountId).maybeSingle();
          inst = r;
        }
        if (!inst) return new Response("unknown account", { status: 200 });

        const companyId = inst.company_id as string;
        const userId = inst.user_id as string | null;

        // ===== Status =====
        if (type === "message.sent" || type === "message.delivered" || type === "message.read" || type === "message.failed") {
          const messageId: string | null = data?.message_id || null;
          const nextStatus = mapStatus(data?.status || type.replace("message.", ""));
          if (!messageId || !nextStatus) return new Response("ok", { status: 200 });
          await (supabaseAdmin as any)
            .from("mensagens")
            .update({ status_envio: nextStatus })
            .eq("company_id", companyId)
            .eq("whatsapp_message_id", messageId);
          return new Response("ack", { status: 200 });
        }

        // ===== Inbound / Echo (enviado pelo app oficial do dono) =====
        if (type === "message.received" || type === "message.echoed") {
          const isEcho = type === "message.echoed";
          const from: string = (isEcho ? data?.to : data?.from) || "";
          const number = String(from).replace(/\D/g, "");
          if (!number) return new Response("no number", { status: 200 });

          const messageId: string | null = data?.message_id || null;
          if (messageId) {
            const { data: dup } = await (supabaseAdmin as any)
              .from("mensagens").select("id")
              .eq("company_id", companyId)
              .eq("whatsapp_message_id", messageId).maybeSingle();
            if (dup) return new Response("duplicate", { status: 200 });
          }

          const media = pickMediaFromEvent(data);
          const text: string = data?.text || media.caption || "";
          const contactName: string | null = data?.contact_name || null;

          const placeholder = media.kind
            ? (media.kind === "audio" ? "🎤 Áudio"
               : media.kind === "image" ? "🖼️ Imagem"
               : media.kind === "video" ? "🎬 Vídeo"
               : `📎 ${media.fileName || "Documento"}`)
            : "";
          const effective = (text && text.trim()) || placeholder;
          if (!effective) return new Response("empty", { status: 200 });

          // Mídia da WaBlast vem como media_id da Meta — não temos URL pública direta.
          // Guardamos referência; download/rehost pode ser feito sob demanda depois.
          await (supabaseAdmin as any).from("mensagens").insert({
            company_id: companyId,
            user_id: userId,
            numero: number,
            contato_nome: contactName,
            direcao: isEcho ? "saida" : "entrada",
            autor: isEcho ? "humano" : "contato",
            texto: effective,
            midia_tipo: media.kind,
            midia_url: null,
            midia_mime: media.mime,
            midia_nome: media.fileName,
            whatsapp_message_id: messageId,
            created_at: new Date().toISOString(),
          });
          return new Response("ok", { status: 200 });
        }

        // ===== Account / phone number / template / capability updates =====
        if (
          type === "account.updated" ||
          type === "phone_number.quality_updated" ||
          type === "phone_number.name_updated" ||
          type === "business_capability.updated" ||
          type === "template.status_updated" ||
          type === "template.quality_updated" ||
          type === "account.alert"
        ) {
          // Best-effort: só atualiza last_state_at
          await (supabaseAdmin as any)
            .from("whatsapp_instances")
            .update({ last_state_at: new Date().toISOString() })
            .eq("id", inst.id);
          return new Response("ok", { status: 200 });
        }

        return new Response(JSON.stringify({ ok: true, ignored: type }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
