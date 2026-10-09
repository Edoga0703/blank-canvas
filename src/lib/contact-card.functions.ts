import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveCompanyIdCached } from "./company-cache";

export type ContatoEnviavel = {
  numero: string;
  nome: string | null;
  foto_url: string | null;
};

/** Lista os contatos salvos da empresa para enviar como cartão de contato no WhatsApp. */
export const listarContatosParaEnvio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { busca?: string | null }) => d ?? {})
  .handler(async ({ context, data }): Promise<ContatoEnviavel[]> => {
    const { supabase, userId } = context;
    const companyId = await resolveCompanyIdCached(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const busca = (data?.busca ?? "").trim().toLowerCase();
    const digitos = busca.replace(/\D/g, "");

    let q = supabaseAdmin
      .from("crm_cards")
      .select("numero,nome,foto_url,ultima_em")
      .eq("company_id", companyId)
      .order("ultima_em", { ascending: false, nullsFirst: false })
      .limit(busca ? 300 : 200);

    if (busca) {
      const termos = [`nome.ilike.%${busca}%`];
      if (digitos) termos.push(`numero.ilike.%${digitos}%`);
      q = q.or(termos.join(","));
    }

    const { data: cards } = await q;
    const vistos = new Set<string>();
    const lista: ContatoEnviavel[] = [];
    for (const c of (cards ?? []) as any[]) {
      const numero = String(c.numero ?? "");
      if (!numero || numero.includes("@g.us") || vistos.has(numero)) continue;
      vistos.add(numero);
      lista.push({ numero, nome: c.nome ?? null, foto_url: c.foto_url ?? null });
    }
    return lista.slice(0, 200);
  });

/** Envia um cartão de contato nativo do WhatsApp para a conversa aberta. */
export const enviarCartaoContato = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    numero: string;
    contatoNome?: string | null;
    cartaoNome: string;
    cartaoNumero: string;
  }) => d)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const companyId = await resolveCompanyIdCached(supabase, userId);
    await (await import("./billing/access.server")).assertCompanyCanWrite(companyId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const nome = String(data.cartaoNome ?? "").trim();
    const digitos = String(data.cartaoNumero ?? "").replace(/\D/g, "");
    if (!nome) throw new Error("Informe o nome do contato.");
    if (digitos.length < 8) throw new Error("Informe um número de telefone válido.");
    const telefone = `+${digitos}`;

    const destino = String(data.numero ?? "").trim();
    if (!destino) throw new Error("Conversa inválida.");
    const grupo = destino.includes("@g.us");

    const { getInstanceForContact, extractWhatsappMessageId } = await import("./evolution-helpers");
    const { evoSendContact } = await import("./evolution.server");
    const { uazSendContact } = await import("./uazapi.server");

    let waId: string | null = null;
    let erro: string | null = null;
    try {
      if (grupo) {
        const { data: lista } = await supabaseAdmin
          .from("whatsapp_instances")
          .select("instance_name,instance_token,provider,status")
          .eq("company_id", companyId);
        const uazs = ((lista ?? []) as any[]).filter(
          (i) => String(i.provider ?? "").toLowerCase() === "uazapi" && i.instance_token,
        );
        const inst = uazs.find((i) => i.status === "connected") ?? uazs[0] ?? null;
        if (!inst) throw new Error("Nenhuma conexão disponível para enviar ao grupo.");
        const resp: any = await uazSendContact(inst.instance_token, destino, {
          fullName: nome, phoneNumber: telefone,
        });
        waId = extractWhatsappMessageId(resp);
      } else {
        const inst = await getInstanceForContact(
          supabaseAdmin, companyId, destino,
          "instance_name,status,numero,provider,instance_token", userId,
        );
        if (!inst?.instance_name) throw new Error("Conexão não disponível para este contato.");
        const resp: any = await evoSendContact(inst.instance_name, destino, {
          fullName: nome, phoneNumber: telefone,
        });
        waId = extractWhatsappMessageId(resp);
      }
    } catch (e: any) {
      erro = e?.message ?? "Falha ao enviar o contato.";
    }

    if (erro) throw new Error(erro);

    await supabase.from("mensagens").insert({
      company_id: companyId, user_id: userId, numero: destino,
      contato_nome: data.contatoNome ?? null,
      direcao: "saida", autor: "humano",
      texto: `👤 ${nome}\n${telefone}`,
      grupo_jid: grupo ? destino : null,
      whatsapp_message_id: waId,
      status_envio: waId ? "enviado" : "pendente",
    } as any);

    return { ok: true, nome, telefone };
  });
