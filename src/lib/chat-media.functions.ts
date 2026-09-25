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
 * - URL assinada expirada  -> reassina a partir do caminho no storage
 * - Mídia nunca baixada    -> tenta baixar do provedor e guardar no storage
 */
export const resolveChatMediaUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { messageId: string }) => d)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const companyId = await resolveCompanyIdCached(supabase, userId);

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.messageId ?? "");
    if (!isUuid) return { url: null as string | null, tipo: null as string | null };

    const { data: msg } = await supabase
      .from("mensagens")
      .select("id,numero,midia_url,midia_tipo,midia_mime,midia_nome,whatsapp_message_id")
      .eq("id", data.messageId)
      .eq("company_id", companyId)
      .maybeSingle();
    // Mensagem temporária, removida ou de outra empresa: sem mídia, sem derrubar a tela
    if (!msg) return { url: null as string | null, tipo: null as string | null };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 1) Já está no storage: basta reassinar
    const path = storagePathFromUrl(msg.midia_url);
    if (path) {
      const { data: signed } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(path, SIGN_TTL);
      if (signed?.signedUrl) {
        await supabaseAdmin.from("mensagens").update({ midia_url: signed.signedUrl } as any).eq("id", msg.id);
        return { url: signed.signedUrl, tipo: msg.midia_tipo };
      }
      return { url: null as string | null, tipo: msg.midia_tipo };
    }

    // 2) Sem mídia salva: tenta rebaixar do provedor (Uazapi)
    if (!msg.whatsapp_message_id) return { url: null as string | null, tipo: msg.midia_tipo };

    const { data: inst } = await supabaseAdmin
      .from("whatsapp_instances")
      .select("instance_token")
      .eq("company_id", companyId)
      .not("instance_token", "is", null)
      .limit(1)
      .maybeSingle();
    if (!inst?.instance_token) return { url: null as string | null, tipo: msg.midia_tipo };

    const { storeIncomingUazapiMedia } = await import("./incoming-media.server");
    const stored = await storeIncomingUazapiMedia({
      instanceToken: inst.instance_token,
      companyId,
      number: msg.numero,
      messageId: String(msg.whatsapp_message_id),
      message: null,
      fallbackMime: msg.midia_mime,
    });
    if (!stored) return { url: null as string | null, tipo: msg.midia_tipo };

    const mime = stored.mime.toLowerCase();
    const inferredType = msg.midia_tipo || (
      mime.startsWith("image/") ? "image" :
      mime.startsWith("video/") ? "video" :
      mime.startsWith("audio/") ? "audio" : "document"
    );

    await supabaseAdmin
      .from("mensagens")
      .update({
        midia_url: stored.url,
        midia_tipo: inferredType,
        midia_mime: stored.mime,
        midia_nome: msg.midia_nome || stored.name,
      } as any)
      .eq("id", msg.id);

    return { url: stored.url, tipo: inferredType };
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

    const { data: msgs, error } = await supabase
      .from("mensagens")
      .select("id,direcao,midia_url,midia_tipo,midia_mime,midia_nome,created_at")
      .eq("company_id", companyId)
      .eq("numero", data.numero)
      .not("midia_tipo", "is", null)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw error;

    const withPath = (msgs ?? []).filter((m) => !!storagePathFromUrl(m.midia_url));
    const paths = withPath.map((m) => storagePathFromUrl(m.midia_url)!);

    const signedByUrl = new Map<string, string>();
    if (paths.length) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: signedList } = await supabaseAdmin.storage.from(BUCKET).createSignedUrls(paths, SIGN_TTL);
      for (const s of signedList ?? []) {
        if (s?.signedUrl && s.path) signedByUrl.set(s.path, s.signedUrl);
      }
    }

    const out: ConversationMediaItem[] = [];
    for (const m of msgs ?? []) {
      const path = storagePathFromUrl(m.midia_url);
      const url = path ? signedByUrl.get(path) : null;
      if (!url || !/^https?:\/\//i.test(url)) continue;
      out.push({
        id: m.id,
        tipo: m.midia_tipo || "document",
        mime: m.midia_mime,
        nome: m.midia_nome,
        direcao: m.direcao,
        data: m.created_at,
        url,
      });
    }
    return out;
  });
