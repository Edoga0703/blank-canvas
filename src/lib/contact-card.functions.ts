import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveCompanyIdCached } from "./company-cache";

export type ContatoSugestao = {
  nome: string;
  numero: string;
  foto_url?: string | null;
};

export type ContatoEnviavel = ContatoSugestao;

export const buscarContatosAgenda = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d?: { q?: string; busca?: string | null } | null) => d ?? {})
  .handler(async ({ context, data }): Promise<ContatoSugestao[]> => {
    const { supabase, userId } = context;
    const companyId = await resolveCompanyIdCached(supabase, userId);
    const q = String(data?.q || data?.busca || "").trim();

    let query = supabase
      .from("crm_cards")
      .select("nome,numero,foto_url")
      .eq("company_id", companyId)
      .not("numero", "is", null)
      .order("ultima_em", { ascending: false })
      .limit(60);

    if (q) {
      const safe = q.replace(/[%_,]/g, "");
      query = query.or(`nome.ilike.%${safe}%,numero.ilike.%${safe}%`);
    }

    const { data: rows } = await query;
    const seen = new Set<string>();
    const out: ContatoSugestao[] = [];
    for (const r of (rows ?? []) as any[]) {
      const num = String(r.numero ?? "").replace(/\D/g, "");
      if (!num || seen.has(num)) continue;
      seen.add(num);
      out.push({
        nome: String(r.nome || num).trim(),
        numero: num,
        foto_url: r.foto_url || null,
      });
    }
    return out;
  });

export const listarContatosParaEnvio = buscarContatosAgenda;

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
    if (destino.includes("@g.us")) {
      throw new Error("O envio para grupos não está habilitado.");
    }

    const { getInstanceForContact, extractWhatsappMessageId } = await import("./evolution-helpers");
    const { waSendText } = await import("./wa-dispatch.server");

    let waId: string | null = null;
    const inst = await getInstanceForContact(
      supabaseAdmin,
      companyId,
      destino,
      "instance_name,status,numero,provider,instance_token",
      userId,
    );
    if (!inst?.instance_name) throw new Error("Conexão não disponível para este contato.");

    const provider = inst.provider || "dapi";
    let sentNative = false;

    if (provider === "dapi" || provider === "dapi_official") {
      try {
        const { dapiSendContact } = await import("./dapi.server");
        const resp = await dapiSendContact(inst.instance_name, destino, { name: nome, phone: digitos });
        waId = extractWhatsappMessageId(resp) || resp?.id || null;
        sentNative = true;
      } catch (nativeErr) {
        console.warn("[enviarCartaoContato] Falha no envio nativo de contato via D-API, usando fallback de texto:", nativeErr);
      }
    }

    if (!sentNative) {
      const resp: any = await waSendText(
        {
          company_id: companyId,
          instance_name: inst.instance_name,
          instance_token: inst.instance_token ?? null,
          provider: provider as any,
          status: inst.status ?? "connected",
          paused: false,
        },
        destino,
        `👤 *${nome}*\n📞 ${telefone}`,
      );
      waId = extractWhatsappMessageId(resp) || resp?.id || null;
    }

    await supabase.from("mensagens").insert({
      company_id: companyId,
      user_id: userId,
      numero: destino,
      contato_nome: data.contatoNome ?? null,
      direcao: "saida",
      autor: "humano",
      texto: `👤 ${nome}\n${telefone}`,
      grupo_jid: null,
      whatsapp_message_id: waId,
      status_envio: waId ? "enviado" : "pendente",
    } as any);

    return { ok: true, nome, telefone };
  });
