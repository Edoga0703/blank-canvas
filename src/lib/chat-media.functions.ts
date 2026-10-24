import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveCompanyIdCached } from "./company-cache";

const BUCKET = "chat-media";
const SIGN_TTL = 60 * 60 * 24 * 365; // 1 ano

/** Extrai o caminho dentro do bucket a partir de uma URL assinada/pública do storage. */
export function storagePathFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(new RegExp(`/storage/v1/object/(?:sign|public|authenticated)/${BUCKET}/([^?]+)`));
  return m?.[1] ? decodeURIComponent(m[1]) : null;
}

/**
 * Devolve uma URL válida para a mídia de uma mensagem.
 * Validado com requireSupabaseAuth e filtrado rigorosamente por company_id
 * para evitar qualquer fuga multi-tenant (IDOR).
 */
export const resolveChatMediaUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { messageId: string }) => d)
  .handler(async ({ context, data }) => {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.messageId ?? "");
    if (!isUuid) return { url: null as string | null, tipo: null as string | null };

    const { supabase, userId } = context;
    const companyId = await resolveCompanyIdCached(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { generateMediaToken } = await import("@/routes/api/public/chat-media");
    const { sig, exp } = generateMediaToken(data.messageId);
    const proxiedUrl = `/api/public/chat-media?id=${data.messageId}&sig=${sig}&exp=${exp}`;

    // 1) Anexo em Cloudflare R2 validando company_id
    const { data: attachment } = await (supabaseAdmin as any)
      .from("message_attachments")
      .select("kind,storage_key,storage_url,provider_url")
      .eq("mensagem_id", data.messageId)
      .eq("company_id", companyId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (attachment?.storage_key) {
      return { url: proxiedUrl, tipo: attachment.kind };
    }
    if (attachment?.storage_url && attachment.storage_url.startsWith("http")) {
      return { url: proxiedUrl, tipo: attachment.kind };
    }
    if (attachment?.provider_url) {
      if (attachment.provider_url.startsWith("data:")) {
        return { url: attachment.provider_url, tipo: attachment.kind };
      }
      return { url: proxiedUrl, tipo: attachment.kind };
    }

    // 2) Mensagem na tabela mensagens validando company_id
    const { data: msg } = await supabaseAdmin
      .from("mensagens")
      .select("id,company_id,numero,provider,midia_url,midia_tipo,midia_mime,midia_nome,whatsapp_message_id,raw_payload")
      .eq("id", data.messageId)
      .eq("company_id", companyId)
      .maybeSingle();

    if (!msg) return { url: null as string | null, tipo: null as string | null };

    // Figurinhas / stickers salvos pelo D-API que tenham URL em raw_payload
    const rawUrl = (msg.raw_payload as any)?.data?.media_url || (msg.raw_payload as any)?.data?.media_data?.early_media_url;
    if (rawUrl && typeof rawUrl === "string" && rawUrl.startsWith("http")) {
      return { url: proxiedUrl, tipo: msg.midia_tipo || (msg.raw_payload as any)?.data?.type || "sticker" };
    }

    // Mídia legada no Supabase Storage: basta reassinar
    const path = storagePathFromUrl(msg.midia_url);
    if (path) {
      const { data: signed } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(path, SIGN_TTL);
      if (signed?.signedUrl) {
        await supabaseAdmin.from("mensagens").update({ midia_url: signed.signedUrl } as any).eq("id", msg.id);
        return { url: signed.signedUrl, tipo: msg.midia_tipo };
      }
    }

    if (msg.midia_url) {
      if (msg.midia_url.startsWith("data:")) {
        return { url: msg.midia_url, tipo: msg.midia_tipo };
      }
      return { url: proxiedUrl, tipo: msg.midia_tipo };
    }

    // 3) Sem mídia salva: tenta baixar via D-API
    if (msg.whatsapp_message_id && msg.company_id) {
      const { data: inst } = await supabaseAdmin
        .from("whatsapp_instances")
        .select("instance_name,provider")
        .eq("company_id", msg.company_id)
        .in("provider", ["dapi", "dapi_official"])
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (inst?.instance_name) {
        const { dapiDownloadMedia } = await import("./dapi.server");
        const dl = await dapiDownloadMedia(inst.instance_name, String(msg.whatsapp_message_id));
        if (dl?.base64) {
          const mime = (dl.mimetype || msg.midia_mime || "application/octet-stream").toLowerCase();
          const inferredType = msg.midia_tipo || (
            mime.startsWith("image/") ? "image" :
            mime.startsWith("video/") ? "video" :
            mime.startsWith("audio/") ? "audio" : "document"
          );
          const dataUrl = String(dl.base64).startsWith("data:")
            ? String(dl.base64)
            : `data:${mime};base64,${dl.base64}`;

          try {
            const rawB64 = dl.base64.includes(",") ? dl.base64.split(",")[1] : dl.base64;
            const bytes = Buffer.from(rawB64, "base64");
            const { storeMediaObject } = await import("@/lib/storage/r2.server");
            const stored = await storeMediaObject({
              companyId: msg.company_id,
              bytes,
              mimeType: mime,
              fileName: msg.midia_nome || "archivo",
            });
            await (supabaseAdmin as any).from("message_attachments").upsert({
              company_id: msg.company_id,
              mensagem_id: msg.id,
              attachment_key: stored.sha256,
              kind: inferredType,
              storage_key: stored.storageKey,
              mime_type: mime,
              file_name: stored.fileName,
              size_bytes: stored.sizeBytes,
              sha256: stored.sha256,
            });
          } catch (e) {
            console.warn("[resolveChatMediaUrl] background R2 archive error:", e);
          }

          return { url: proxiedUrl, tipo: inferredType };
        }
      }
    }

    return { url: null as string | null, tipo: msg.midia_tipo };
  });

export type ConversationMediaItem = {
  id: string;
  tipo: string;
  mime: string | null;
  nome: string | null;
  direcao: string | null;
  data: string;
  url: string;
};

/**
 * Lista toda a mídia de uma conversa (por número), com URLs reassinadas.
 */
export const getConversationMedia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { numero: string }) => d)
  .handler(async ({ context, data }): Promise<ConversationMediaItem[]> => {
    const { supabase } = context;
    const companyId = await resolveCompanyIdCached(supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: msgs, error } = await supabase
      .from("mensagens")
      .select("id,direcao,midia_url,midia_tipo,midia_mime,midia_nome,created_at")
      .eq("company_id", companyId)
      .eq("numero", data.numero)
      .not("midia_tipo", "is", null)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw error;

    const ids = (msgs ?? []).map((m) => m.id);
    const { data: attachments } = ids.length
      ? await (supabaseAdmin as any)
          .from("message_attachments")
          .select("mensagem_id,kind,storage_key,storage_url,provider_url,mime_type,file_name")
          .eq("company_id", companyId)
          .in("mensagem_id", ids)
      : { data: [] };

    const attachmentByMsgId = new Map<string, any>();
    for (const a of attachments ?? []) {
      attachmentByMsgId.set(a.mensagem_id, a);
    }

    const { generateMediaToken } = await import("@/routes/api/public/chat-media");

    const out: ConversationMediaItem[] = [];
    for (const m of msgs ?? []) {
      const att = attachmentByMsgId.get(m.id);
      const { sig, exp } = generateMediaToken(m.id);
      const url = `/api/public/chat-media?id=${m.id}&sig=${sig}&exp=${exp}`;

      out.push({
        id: m.id,
        tipo: att?.kind || m.midia_tipo || "document",
        mime: att?.mime_type || m.midia_mime,
        nome: att?.file_name || m.midia_nome,
        direcao: m.direcao,
        data: m.created_at,
        url,
      });
    }
    return out;
  });
