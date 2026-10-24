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

    let syncedToWhatsapp = false;
    if (msg.whatsapp_message_id) {
      try {
        const { getActiveInstanceForContact } = await import("@/lib/wa-dispatch.server");
        const inst = await getActiveInstanceForContact(cid, msg.numero, userId);
        if (inst && (inst.provider === "dapi" || inst.provider === "dapi_official")) {
          const { dapiSendReaction } = await import("@/lib/dapi.server");
          await dapiSendReaction(inst.instance_name, msg.numero, msg.whatsapp_message_id, data.emoji || "");
          syncedToWhatsapp = true;
        }
      } catch (syncErr) {
        console.warn("[reactMessage] Erro ao sincronizar reação com WhatsApp:", syncErr);
      }
    }
    return { ok: true, syncedToWhatsapp };
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
    if (cur.provider === "dapi_official") {
      throw new Error("A API Oficial do WhatsApp (Meta) não suporta edição de mensagens.");
    }
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

    let syncedToWhatsapp = false;
    if (cur.whatsapp_message_id) {
      try {
        const { getActiveInstanceForContact } = await import("@/lib/wa-dispatch.server");
        const inst = await getActiveInstanceForContact(cid, cur.numero, userId);
        if (inst && inst.provider === "dapi") {
          const { dapiEditMessage } = await import("@/lib/dapi.server");
          await dapiEditMessage(inst.instance_name, cur.numero, cur.whatsapp_message_id, novo);
          syncedToWhatsapp = true;
        }
      } catch (syncErr) {
        console.warn("[editMessage] Erro ao sincronizar edição com WhatsApp:", syncErr);
      }
    }
    return { ok: true, syncedToWhatsapp };
  });

export const deleteMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { messageId: string }) => d)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const cid = await resolveCompanyId(supabase, userId);

    const { data: cur } = await supabase
      .from("mensagens")
      .select("id,numero,direcao,whatsapp_message_id,midia_url,provider")
      .eq("id", data.messageId)
      .eq("company_id", cid)
      .maybeSingle();
    if (!cur) throw new Error("Mensagem não encontrada.");
    if (cur.direcao === "saida" && cur.provider === "dapi_official") {
      throw new Error("A API Oficial do WhatsApp (Meta) não suporta exclusão de mensagens para todos.");
    }

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

    let syncedToWhatsapp = false;
    if (cur.whatsapp_message_id && cur.direcao === "saida") {
      try {
        const { getActiveInstanceForContact } = await import("@/lib/wa-dispatch.server");
        const inst = await getActiveInstanceForContact(cid, cur.numero, userId);
        if (inst && inst.provider === "dapi") {
          const { dapiDeleteMessage } = await import("@/lib/dapi.server");
          await dapiDeleteMessage(inst.instance_name, cur.numero, cur.whatsapp_message_id);
          syncedToWhatsapp = true;
        }
      } catch (syncErr) {
        console.warn("[deleteMessage] Erro ao sincronizar exclusão com WhatsApp:", syncErr);
      }
    }
    return { ok: true, syncedToWhatsapp };
  });
