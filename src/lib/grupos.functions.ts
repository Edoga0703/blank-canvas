import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { resolveCompanyIdCached } from "./company-cache";

export type GrupoWhatsapp = {
  jid: string;
  nome: string | null;
  foto_url: string | null;
  participantes: number | null;
  ultima_em: string | null;
};

async function instanciaUazapi(admin: any, companyId: string) {
  const { data } = await admin
    .from("whatsapp_instances")
    .select("id,instance_name,instance_token,provider,status")
    .eq("company_id", companyId);
  const lista = (data ?? []) as any[];
  const uaz = lista.filter((i) => String(i.provider ?? "").toLowerCase() === "uazapi" && i.instance_token);
  return uaz.find((i) => i.status === "connected") ?? uaz[0] ?? null;
}

/** Grupos da conexão WhatsApp da empresa (sincroniza com a Uazapi quando possível). */
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

    const inst = await instanciaUazapi(supabaseAdmin, companyId);
    if (inst) {
      try {
        const { uazListGroups } = await import("./uazapi.server");
        const grupos = await uazListGroups(inst.instance_token);
        if (grupos.length) {
          await (supabaseAdmin as any).from("whatsapp_grupo").upsert(
            grupos.map((g) => ({
              company_id: companyId,
              instance_id: inst.id,
              jid: g.jid,
              nome: g.nome,
              foto_url: g.foto_url,
              participantes: g.participantes,
              updated_at: new Date().toISOString(),
            })),
            { onConflict: "company_id,jid" },
          );
        }
      } catch (e: any) {
        console.warn("[grupos] sincronização falhou:", e?.message);
      }
    }

    const { data } = await (supabaseAdmin as any)
      .from("whatsapp_grupo")
      .select("jid,nome,foto_url,participantes,ultima_em")
      .eq("company_id", companyId)
      .order("ultima_em", { ascending: false, nullsFirst: false })
      .limit(500);
    return (data ?? []) as GrupoWhatsapp[];
  });

/** Envia uma mensagem de texto para um grupo do WhatsApp. */
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

    const inst = await instanciaUazapi(supabaseAdmin, companyId);
    if (!inst) throw new Error("Nenhuma conexão de WhatsApp disponível para enviar ao grupo.");

    const { assinaturaPrefixo } = await import("./user-scope");
    const prefixo = await assinaturaPrefixo(supabaseAdmin, userId, companyId);
    const texto = `${prefixo}${data.texto}`;

    const { uazSendText } = await import("./uazapi.server");
    const res: any = await uazSendText(inst.instance_token, data.jid, texto);

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
        whatsapp_message_id: res?.id ?? res?.key?.id ?? null,
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

    let info: any = null;
    const inst = await instanciaUazapi(supabaseAdmin, companyId);
    if (inst) {
      try {
        const { uazGroupInfo } = await import("./uazapi.server");
        info = await uazGroupInfo(inst.instance_token, data.jid);
      } catch (e: any) {
        console.warn("[grupos] detalhes falharam:", e?.message);
      }
    }

    if (info && (info.nome || info.lista?.length)) {
      await (supabaseAdmin as any).from("whatsapp_grupo").upsert(
        {
          company_id: companyId,
          instance_id: inst?.id ?? null,
          jid: data.jid,
          nome: info.nome ?? row?.nome ?? null,
          foto_url: info.foto_url ?? row?.foto_url ?? null,
          participantes: info.participantes ?? row?.participantes ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "company_id,jid" },
      );
    }

    if (!info && !row) return null;
    return {
      jid: data.jid,
      nome: info?.nome ?? row?.nome ?? null,
      foto_url: info?.foto_url ?? row?.foto_url ?? null,
      participantes: info?.participantes ?? row?.participantes ?? null,
      ultima_em: row?.ultima_em ?? null,
      descricao: info?.descricao ?? null,
      lista: (info?.lista ?? []) as GrupoParticipante[],
    };
  });
