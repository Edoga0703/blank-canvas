import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveCompanyIdCached } from "./company-cache";

async function resolveCompanyId(supabase: any, userId: string): Promise<string> {
  return resolveCompanyIdCached(supabase, userId);
}
const EDIT_WINDOW_MS = 15 * 60_000;

export const reactMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { messageId: string; emoji: string | null }) => d)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const cid = await resolveCompanyId(supabase, userId);

    const { data: msg } = await supabase
      .from("mensagens")
      .select("id,numero,direcao,whatsapp_message_id")
      .eq("id", data.messageId)
      .eq("company_id", cid)
      .maybeSingle();
    if (!msg) throw new Error("Mensagem não encontrada.");

    const { error } = await supabase
      .from("mensagens")
      .update({ reacao: data.emoji })
      .eq("id", data.messageId)
      .eq("company_id", cid);
    if (error) throw new Error(error.message);
    return { ok: true, syncedToWhatsapp: false };
  });

export const editMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { messageId: string; texto: string }) => d)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const cid = await resolveCompanyId(supabase, userId);
    const novo = data.texto.trim();
    if (!novo) throw new Error("Texto vazio.");

    const { data: cur } = await supabase
      .from("mensagens")
      .select("texto,texto_original,direcao,numero,whatsapp_message_id,created_at,midia_tipo")
      .eq("id", data.messageId)
      .eq("company_id", cid)
      .maybeSingle();
    if (!cur) throw new Error("Mensagem não encontrada.");
    if (cur.direcao !== "saida") throw new Error("Só é possível editar mensagens enviadas.");
    if (cur.midia_tipo) throw new Error("Não é permitido editar mensagens com mídia.");
    const age = Date.now() - Date.parse(cur.created_at);
    if (age > EDIT_WINDOW_MS) throw new Error("Janela de 15 min para edição expirou.");

    const patch: any = { texto: novo, editado_em: new Date().toISOString() };
    if (!cur.texto_original) patch.texto_original = cur.texto;
    const { error } = await supabase
      .from("mensagens")
      .update(patch)
      .eq("id", data.messageId)
      .eq("company_id", cid);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { messageId: string }) => d)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const cid = await resolveCompanyId(supabase, userId);

    const { data: cur } = await supabase
      .from("mensagens")
      .select("id,numero,direcao,whatsapp_message_id,midia_url")
      .eq("id", data.messageId)
      .eq("company_id", cid)
      .maybeSingle();
    if (!cur) throw new Error("Mensagem não encontrada.");

    const { error } = await supabase
      .from("mensagens")
      .update({
        deletado_em: new Date().toISOString(),
        texto: "🚫 Mensagem apagada",
        midia_url: null,
        midia_tipo: null,
        midia_mime: null,
        midia_nome: null,
      } as any)
      .eq("id", data.messageId)
      .eq("company_id", cid);
    if (error) throw new Error(error.message);

    return { ok: true, syncedToWhatsapp: false };
  });
