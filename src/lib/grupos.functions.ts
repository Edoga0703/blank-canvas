import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { resolveCompanyIdCached } from "./company-cache";
import { dapiSendText } from "./dapi.server";

export type GrupoWhatsapp = {
  jid: string;
  nome: string | null;
  foto_url: string | null;
  participantes: number | null;
  ultima_em: string | null;
};

async function instanciaDapi(admin: any, companyId: string) {
  const { data } = await admin
    .from("whatsapp_instances")
    .select("id,instance_name,provider,status")
    .eq("company_id", companyId)
    .in("provider", ["dapi", "dapi_official"]);
  const lista = (data ?? []) as any[];
  return lista.find((i) => i.status === "connected") ?? lista[0] ?? null;
}

/** Grupos da conexão WhatsApp da empresa. */
export const listarGrupos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<GrupoWhatsapp[]> => {
    const { supabase, userId } = context;
    const companyId = await resolveCompanyIdCached(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: company } = await supabaseAdmin
      .from("company")
      .select("grupos_ativos")
      .eq("id", companyId)
      .maybeSingle();
    if (!(company as any)?.grupos_ativos) return [];

    const { data } = await (supabaseAdmin as any)
      .from("whatsapp_grupo")
      .select("jid,nome,foto_url,participantes,ultima_em")
      .eq("company_id", companyId)
      .order("ultima_em", { ascending: false, nullsFirst: false })
      .limit(500);
    return (data ?? []) as GrupoWhatsapp[];
  });

/** Envia uma mensagem de texto para um grupo do WhatsApp via D-API. */
export const enviarMensagemGrupo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ jid: z.string().min(5), texto: z.string().min(1) }))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const companyId = await resolveCompanyIdCached(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: company } = await supabaseAdmin
      .from("company")
      .select("grupos_ativos")
      .eq("id", companyId)
      .maybeSingle();
    if (!(company as any)?.grupos_ativos) throw new Error("Grupos não estão habilitados nesta conta.");
    if (!data.jid.includes("@g.us")) throw new Error("Destino inválido: não é um grupo.");

    const inst = await instanciaDapi(supabaseAdmin, companyId);
    if (!inst) throw new Error("Nenhuma conexão de WhatsApp (D-API) disponível para enviar ao grupo.");

    const { assinaturaPrefixo } = await import("./user-scope");
    const prefixo = await assinaturaPrefixo(supabaseAdmin, userId, companyId);
    const texto = `${prefixo}${data.texto}`;

    const res: any = await dapiSendText(inst.instance_name, data.jid, texto);

    const { data: msg } = await supabaseAdmin
      .from("mensagens")
      .insert({
        company_id: companyId,
        user_id: userId,
        numero: data.jid,
        direcao: "saida",
        autor: "humano",
        texto,
        grupo_jid: data.jid,
        status_envio: "enviado",
        whatsapp_message_id: res?.id ?? null,
        created_at: new Date().toISOString(),
      } as any)
      .select("id")
      .maybeSingle();

    await (supabaseAdmin as any)
      .from("whatsapp_grupo")
      .update({ ultima_em: new Date().toISOString() })
      .eq("company_id", companyId)
      .eq("jid", data.jid);

    return { ok: true, id: msg?.id ?? null };
  });

export type GrupoParticipante = {
  jid: string;
  numero: string | null;
  nome: string | null;
  foto_url: string | null;
  admin: boolean;
};
export type GrupoDetalhe = GrupoWhatsapp & { descricao: string | null; lista: GrupoParticipante[] };

/** Detalhes de um grupo: nome, descrição e participantes. */
export const detalhesGrupo = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ jid: z.string().min(5) }))
  .handler(async ({ context, data }): Promise<GrupoDetalhe | null> => {
    const { supabase, userId } = context;
    const companyId = await resolveCompanyIdCached(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: company } = await supabaseAdmin
      .from("company")
      .select("grupos_ativos")
      .eq("id", companyId)
      .maybeSingle();
    if (!(company as any)?.grupos_ativos) return null;

    const { data: row } = await (supabaseAdmin as any)
      .from("whatsapp_grupo")
      .select("jid,nome,foto_url,participantes,ultima_em")
      .eq("company_id", companyId)
      .eq("jid", data.jid)
      .maybeSingle();

    if (!row) return null;
    return {
      jid: data.jid,
      nome: row?.nome ?? null,
      foto_url: row?.foto_url ?? null,
      participantes: row?.participantes ?? null,
      ultima_em: row?.ultima_em ?? null,
      descricao: null,
      lista: [],
    };
  });
