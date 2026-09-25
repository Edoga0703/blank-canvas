import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveCompanyIdCached } from "./company-cache";
import { INTEGRACOES } from "./integracoes/catalogo";

async function gate(supabase: any, cid: string, servico: string) {
  if (!INTEGRACOES[servico]) throw new Error("Integração não disponível.");
  const { capacidadeAtiva } = await import("@/lib/plugin-gate.server");
  if (!(await capacidadeAtiva(supabase, cid, servico))) {
    throw new Error("Instale este plugin na Loja de Plugins para usar a integração.");
  }
}

async function lerCampos(supabase: any, cid: string, servico: string) {
  const { data } = await (supabase as any)
    .from("integracao_chave")
    .select("extra, conectado")
    .eq("company_id", cid)
    .eq("servico", servico)
    .maybeSingle();
  if (!data?.conectado) throw new Error("Conecte a integração colando a chave antes de usar.");
  return (data.extra ?? {}) as Record<string, string>;
}

async function registrarResultado(supabase: any, cid: string, servico: string, resumo: string) {
  await (supabase as any)
    .from("integracao_chave")
    .update({ ultima_sync: new Date().toISOString(), ultimo_resultado: resumo })
    .eq("company_id", cid)
    .eq("servico", servico);
}

// ---------------- conexão ----------------

export const statusIntegracao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { servico: string }) => d)
  .handler(async ({ context, data }) => {
    const cid = await resolveCompanyIdCached(context.supabase, context.userId);
    await gate(context.supabase, cid, data.servico);
    const { data: row } = await (context.supabase as any)
      .from("integracao_chave")
      .select("conectado, credencial, auto_envio, ultima_sync, ultimo_resultado")
      .eq("company_id", cid)
      .eq("servico", data.servico)
      .maybeSingle();
    if (!row?.conectado) return { conectado: false as const };
    const cred = String(row.credencial ?? "");
    return {
      conectado: true as const,
      chaveMascarada: cred ? `${cred.slice(0, 4)}••••${cred.slice(-4)}` : "",
      autoEnvio: row.auto_envio !== false,
      ultimaSync: (row.ultima_sync ?? null) as string | null,
      ultimoResultado: (row.ultimo_resultado ?? null) as string | null,
    };
  });

export const conectarIntegracao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { servico: string; campos: Record<string, string> }) => d)
  .handler(async ({ context, data }) => {
    const cid = await resolveCompanyIdCached(context.supabase, context.userId);
    await gate(context.supabase, cid, data.servico);
    const meta = INTEGRACOES[data.servico]!;

    const campos: Record<string, string> = {};
    for (const c of meta.campos) {
      const v = String(data.campos?.[c.id] ?? "").trim();
      if (!v) throw new Error(`Preencha o campo "${c.label}".`);
      campos[c.id] = v;
    }

    const { getAdapter } = await import("@/lib/integracoes/adapters.server");
    await getAdapter(data.servico).validar(campos);

    const principal = campos[meta.campos[0]!.id] ?? "";
    const { error } = await (context.supabase as any).from("integracao_chave").upsert(
      {
        company_id: cid,
        servico: data.servico,
        credencial: principal,
        extra: campos,
        conectado: true,
        ultimo_resultado: null,
      },
      { onConflict: "company_id,servico" },
    );
    if (error) throw error;
    return { ok: true };
  });

export const desconectarIntegracao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { servico: string }) => d)
  .handler(async ({ context, data }) => {
    const cid = await resolveCompanyIdCached(context.supabase, context.userId);
    await gate(context.supabase, cid, data.servico);
    await (context.supabase as any)
      .from("integracao_chave")
      .delete()
      .eq("company_id", cid)
      .eq("servico", data.servico);
    return { ok: true };
  });

export const definirAutoEnvioIntegracao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { servico: string; ativo: boolean }) => d)
  .handler(async ({ context, data }) => {
    const cid = await resolveCompanyIdCached(context.supabase, context.userId);
    await gate(context.supabase, cid, data.servico);
    await (context.supabase as any)
      .from("integracao_chave")
      .update({ auto_envio: !!data.ativo })
      .eq("company_id", cid)
      .eq("servico", data.servico);
    return { ok: true };
  });

// ---------------- ações ----------------

export const testarAvisoIntegracao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { servico: string }) => d)
  .handler(async ({ context, data }) => {
    const cid = await resolveCompanyIdCached(context.supabase, context.userId);
    await gate(context.supabase, cid, data.servico);
    const campos = await lerCampos(context.supabase, cid, data.servico);
    const { getAdapter } = await import("@/lib/integracoes/adapters.server");
    const adapter = getAdapter(data.servico);
    if (!adapter.notificar) throw new Error("Esta integração não envia avisos.");
    await adapter.notificar(campos, "Teste do Metrix CRM: a integração está funcionando.", {
      evento: "teste",
    });
    return { ok: true, resumo: "aviso de teste enviado" };
  });

export const importarClientesIntegracao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { servico: string; paginas?: number }) => d)
  .handler(async ({ context, data }) => {
    const cid = await resolveCompanyIdCached(context.supabase, context.userId);
    await gate(context.supabase, cid, data.servico);
    const campos = await lerCampos(context.supabase, cid, data.servico);
    const { getAdapter } = await import("@/lib/integracoes/adapters.server");
    const adapter = getAdapter(data.servico);
    if (!adapter.importarClientes) throw new Error("Esta integração não importa clientes.");

    const meta = INTEGRACOES[data.servico]!;
    const paginas = Math.min(Math.max(Number(data.paginas ?? 2), 1), 10);

    // primeira etapa do funil comercial
    const { data: pipe } = await (context.supabase as any)
      .from("crm_pipeline")
      .select("id")
      .eq("company_id", cid)
      .eq("tipo", "comercial")
      .order("ordem", { ascending: true })
      .limit(1)
      .maybeSingle();
    let firstStage: any = null;
    if (pipe?.id) {
      const { data: stages } = await (context.supabase as any)
        .from("crm_stage")
        .select("id, pipeline_id, nome, ordem")
        .eq("company_id", cid)
        .eq("pipeline_id", pipe.id)
        .order("ordem", { ascending: true });
      firstStage = stages?.[0] ?? null;
    }

    let criados = 0;
    let atualizados = 0;
    let ignorados = 0;

    for (let p = 1; p <= paginas; p++) {
      const lista = await adapter.importarClientes(campos, p);
      if (!lista.length) break;

      for (const ct of lista) {
        if (!ct.numero) {
          ignorados++;
          continue;
        }
        const nome = ct.nome?.trim().slice(0, 120) || null;
        const email = ct.email?.trim().slice(0, 200) || null;

        const { data: existing } = await (context.supabase as any)
          .from("crm_cards")
          .select("id")
          .eq("company_id", cid)
          .eq("numero", ct.numero)
          .maybeSingle();

        if (existing) {
          await (context.supabase as any)
            .from("crm_cards")
            .update({ nome: nome ?? undefined, email: email ?? undefined })
            .eq("id", existing.id);
          atualizados++;
          continue;
        }

        const payload: any = {
          company_id: cid,
          user_id: context.userId,
          numero: ct.numero,
          nome,
          email,
          canal_entrada: data.servico,
          origem: meta.nome,
          ultima_mensagem: `Importado de ${meta.nome}`,
          ultima_em: new Date().toISOString(),
          primeiro_contato_em: new Date().toISOString(),
        };
        if (firstStage) {
          payload.pipeline_id = firstStage.pipeline_id;
          payload.stage_id = firstStage.id;
          payload.status = firstStage.nome;
        }
        const { error } = await (context.supabase as any).from("crm_cards").insert(payload);
        if (error) {
          ignorados++;
          continue;
        }
        criados++;
      }
      if (lista.length < 40) break;
    }

    const resumo = `${criados} novos, ${atualizados} atualizados, ${ignorados} ignorados`;
    await registrarResultado(context.supabase, cid, data.servico, resumo);
    return { criados, atualizados, ignorados, resumo };
  });

export const importarPedidosIntegracao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { servico: string; paginas?: number }) => d)
  .handler(async ({ context, data }) => {
    const cid = await resolveCompanyIdCached(context.supabase, context.userId);
    await gate(context.supabase, cid, data.servico);
    const campos = await lerCampos(context.supabase, cid, data.servico);
    const { getAdapter } = await import("@/lib/integracoes/adapters.server");
    const adapter = getAdapter(data.servico);
    if (!adapter.importarPedidos) throw new Error("Esta integração não importa pedidos.");
    const { emitWebhook } = await import("@/lib/webhooks.server");
    const meta = INTEGRACOES[data.servico]!;
    const paginas = Math.min(Math.max(Number(data.paginas ?? 2), 1), 10);

    let criados = 0;
    let ignorados = 0;

    for (let p = 1; p <= paginas; p++) {
      const lista = await adapter.importarPedidos(campos, p);
      if (!lista.length) break;

      for (const ped of lista) {
        const referencia = `${data.servico}:${ped.id}`;
        if (!ped.id || !ped.valorCents) {
          ignorados++;
          continue;
        }

        const { data: existente } = await (context.supabase as any)
          .from("crm_venda")
          .select("id")
          .eq("company_id", cid)
          .eq("olist_pedido_id", referencia)
          .maybeSingle();
        if (existente) continue;

        let cardId: string | null = null;
        if (ped.numero) {
          const { data: card } = await (context.supabase as any)
            .from("crm_cards")
            .select("id")
            .eq("company_id", cid)
            .eq("numero", ped.numero)
            .maybeSingle();
          cardId = card?.id ?? null;
          if (cardId) {
            await (context.supabase as any)
              .from("crm_cards")
              .update({ tipo_contato: "cliente" })
              .eq("id", cardId);
          }
        }

        const { error } = await (context.supabase as any).from("crm_venda").insert({
          company_id: cid,
          card_id: cardId,
          owner_id: context.userId,
          contato_numero: ped.numero ?? "",
          contato_nome: ped.nome,
          descricao: `Pedido ${meta.nome} #${ped.id}`,
          valor_cents: ped.valorCents,
          vendido_em: ped.data || new Date().toISOString().slice(0, 10),
          canal: data.servico,
          metodo_pagamento: meta.nome,
          created_by: context.userId,
          olist_pedido_id: referencia,
          olist_situacao: ped.situacao,
        });
        if (error) {
          ignorados++;
          continue;
        }
        criados++;
        await emitWebhook(cid, "pedido.importado", {
          servico: data.servico,
          pedido: ped.id,
          nome: ped.nome,
          valor_cents: ped.valorCents,
          situacao: ped.situacao,
        });
      }
      if (lista.length < 40) break;
    }

    const resumo = `pedidos: ${criados} novos, ${ignorados} ignorados`;
    await registrarResultado(context.supabase, cid, data.servico, resumo);
    return { criados, ignorados, resumo };
  });

export const enviarContatosIntegracao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { servico: string; limite?: number }) => d)
  .handler(async ({ context, data }) => {
    const cid = await resolveCompanyIdCached(context.supabase, context.userId);
    await gate(context.supabase, cid, data.servico);
    const campos = await lerCampos(context.supabase, cid, data.servico);
    const { getAdapter } = await import("@/lib/integracoes/adapters.server");
    const adapter = getAdapter(data.servico);
    if (!adapter.enviarContato) throw new Error("Esta integração não recebe contatos.");

    const limite = Math.min(Math.max(Number(data.limite ?? 100), 1), 300);
    const { data: cards } = await (context.supabase as any)
      .from("crm_cards")
      .select("nome, numero, email, status, tipo_contato")
      .eq("company_id", cid)
      .order("ultima_em", { ascending: false })
      .limit(limite);

    let enviados = 0;
    let ignorados = 0;
    for (const c of (cards ?? []) as any[]) {
      if (c.tipo_contato === "interno") {
        ignorados++;
        continue;
      }
      try {
        await adapter.enviarContato(campos, {
          nome: c.nome ?? null,
          numero: c.numero ?? null,
          email: c.email ?? null,
          etapa: c.status ?? null,
        });
        enviados++;
      } catch {
        ignorados++;
      }
    }

    const resumo = `${enviados} contatos enviados, ${ignorados} ignorados`;
    await registrarResultado(context.supabase, cid, data.servico, resumo);
    return { enviados, ignorados, resumo };
  });
