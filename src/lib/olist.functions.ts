import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveCompanyIdCached } from "./company-cache";

async function gate(supabase: any, cid: string) {
  const { capacidadeAtiva } = await import("@/lib/plugin-gate.server");
  if (!(await capacidadeAtiva(supabase, cid, "olist"))) {
    throw new Error("Instale o plugin Olist ERP na Loja de Plugins.");
  }
}

async function srv() {
  return await import("@/lib/olist.server");
}

async function getToken(supabase: any, cid: string): Promise<string> {
  const { getOlistConfig } = await srv();
  const cfg = await getOlistConfig(supabase, cid);
  if (!cfg) throw new Error("Conecte sua conta Olist informando o Token de acesso.");
  return cfg.token;
}

// ---------- conexão ----------

export const statusOlist = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const cid = await resolveCompanyIdCached(context.supabase, context.userId);
    await gate(context.supabase, cid);
    const { data } = await (context.supabase as any)
      .from("olist_integration")
      .select("conectado, ultima_sync, ultimo_resultado, token, auto_pedido")
      .eq("company_id", cid)
      .maybeSingle();
    if (!data) return { conectado: false as const };
    const t = String(data.token ?? "");
    return {
      conectado: !!data.conectado,
      tokenMascarado: t ? `${t.slice(0, 4)}••••${t.slice(-4)}` : "",
      ultimaSync: data.ultima_sync as string | null,
      ultimoResultado: data.ultimo_resultado as string | null,
      autoPedido: data.auto_pedido !== false,
    };
  });

export const conectarOlist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { token: string }) => d)
  .handler(async ({ context, data }) => {
    const cid = await resolveCompanyIdCached(context.supabase, context.userId);
    await gate(context.supabase, cid);
    const token = String(data.token ?? "").trim();
    if (token.length < 20) throw new Error("Token inválido. Copie o Token de acesso gerado na Olist.");

    const { olistCall } = await srv();
    await olistCall("info.php", token, {});

    const { error } = await (context.supabase as any)
      .from("olist_integration")
      .upsert({ company_id: cid, token, conectado: true }, { onConflict: "company_id" });
    if (error) throw error;
    return { ok: true };
  });

export const desconectarOlist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const cid = await resolveCompanyIdCached(context.supabase, context.userId);
    await gate(context.supabase, cid);
    await (context.supabase as any).from("olist_integration").delete().eq("company_id", cid);
    return { ok: true };
  });

export const definirAutoPedidoOlist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { ativo: boolean }) => d)
  .handler(async ({ context, data }) => {
    const cid = await resolveCompanyIdCached(context.supabase, context.userId);
    await gate(context.supabase, cid);
    await (context.supabase as any)
      .from("olist_integration")
      .update({ auto_pedido: !!data.ativo })
      .eq("company_id", cid);
    return { ok: true };
  });

// ---------- importação de clientes ----------

export const importarClientesOlist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { paginas?: number }) => d)
  .handler(async ({ context, data }) => {
    const cid = await resolveCompanyIdCached(context.supabase, context.userId);
    await gate(context.supabase, cid);
    const token = await getToken(context.supabase, cid);
    const { olistCall, normalizaNumero } = await srv();
    const paginas = Math.min(Math.max(Number(data?.paginas ?? 1), 1), 10);

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
      const retorno = await olistCall("contatos.pesquisa.php", token, { pagina: String(p) });
      const lista: any[] = retorno.contatos ?? [];
      if (!lista.length) break;

      for (const item of lista) {
        const c = item?.contato ?? item;
        const numero = normalizaNumero(c?.celular || c?.fone || "");
        if (!numero) {
          ignorados++;
          continue;
        }
        const nome = String(c?.nome ?? "").trim().slice(0, 120) || null;
        const email = String(c?.email ?? "").trim().slice(0, 200) || null;

        const { data: existing } = await (context.supabase as any)
          .from("crm_cards")
          .select("id")
          .eq("company_id", cid)
          .eq("numero", numero)
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
          numero,
          nome,
          email,
          canal_entrada: "olist",
          origem: "Olist ERP",
          ultima_mensagem: "Importado da Olist",
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
      if (lista.length < 100) break;
    }

    const resumo = `${criados} novos, ${atualizados} atualizados, ${ignorados} ignorados`;
    await (context.supabase as any)
      .from("olist_integration")
      .update({ ultima_sync: new Date().toISOString(), ultimo_resultado: resumo })
      .eq("company_id", cid);

    return { criados, atualizados, ignorados, resumo };
  });

// ---------- sincronização de produtos ----------

export const sincronizarProdutosOlist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { paginas?: number }) => d)
  .handler(async ({ context, data }) => {
    const cid = await resolveCompanyIdCached(context.supabase, context.userId);
    await gate(context.supabase, cid);
    const token = await getToken(context.supabase, cid);
    const { olistCall } = await srv();
    const paginas = Math.min(Math.max(Number(data?.paginas ?? 3), 1), 10);

    let criados = 0;
    let atualizados = 0;
    let ignorados = 0;

    for (let p = 1; p <= paginas; p++) {
      const retorno = await olistCall("produtos.pesquisa.php", token, { pagina: String(p) });
      const lista: any[] = retorno.produtos ?? [];
      if (!lista.length) break;

      for (const item of lista) {
        const pr = item?.produto ?? item;
        const nome = String(pr?.nome ?? "").trim().slice(0, 140);
        if (!nome) {
          ignorados++;
          continue;
        }
        const olistId = pr?.id ? String(pr.id) : null;
        const sku = String(pr?.codigo ?? "").trim() || null;
        const preco = Math.max(0, Number(pr?.preco ?? 0) || 0);
        const ativo = String(pr?.situacao ?? "A").toUpperCase() !== "I";

        let existing: any = null;
        if (olistId) {
          const { data: r } = await (context.supabase as any)
            .from("produto")
            .select("id")
            .eq("company_id", cid)
            .eq("olist_id", olistId)
            .maybeSingle();
          existing = r;
        }
        if (!existing && sku) {
          const { data: r } = await (context.supabase as any)
            .from("produto")
            .select("id")
            .eq("company_id", cid)
            .eq("sku", sku)
            .maybeSingle();
          existing = r;
        }

        if (existing) {
          await (context.supabase as any)
            .from("produto")
            .update({ nome, preco, sku, ativo, olist_id: olistId })
            .eq("id", existing.id)
            .eq("company_id", cid);
          atualizados++;
          continue;
        }

        const { error } = await (context.supabase as any).from("produto").insert({
          company_id: cid,
          nome,
          preco,
          sku,
          ativo,
          tipo: "produto",
          olist_id: olistId,
          categoria: String(pr?.categoria ?? "").trim() || null,
        });
        if (error) {
          ignorados++;
          continue;
        }
        criados++;
      }
      if (lista.length < 100) break;
    }

    const resumo = `produtos: ${criados} novos, ${atualizados} atualizados`;
    await (context.supabase as any)
      .from("olist_integration")
      .update({ ultima_sync: new Date().toISOString(), ultimo_resultado: resumo })
      .eq("company_id", cid);

    return { criados, atualizados, ignorados, resumo };
  });

// ---------- pedidos ----------

/** Cria (ou recria) o pedido na Olist a partir de uma venda da Metrix. */
export const enviarVendaParaOlist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { vendaId: string }) => d)
  .handler(async ({ context, data }) => {
    const cid = await resolveCompanyIdCached(context.supabase, context.userId);
    await gate(context.supabase, cid);
    const token = await getToken(context.supabase, cid);
    const { criarPedidoOlist } = await srv();

    const { data: venda } = await (context.supabase as any)
      .from("crm_venda")
      .select("id, contato_nome, contato_numero, descricao, valor_cents, item_nome, olist_pedido_id")
      .eq("id", data.vendaId)
      .eq("company_id", cid)
      .maybeSingle();
    if (!venda) throw new Error("Venda não encontrada.");
    if (venda.olist_pedido_id) return { ok: true, ja: true, pedido: venda.olist_pedido_id };

    const r = await criarPedidoOlist(token, venda as any);
    await (context.supabase as any)
      .from("crm_venda")
      .update({ olist_pedido_id: r.id || r.numero, olist_situacao: "aberto" })
      .eq("id", venda.id);
    return { ok: true, pedido: r.numero || r.id };
  });

/** Importa pedidos da Olist como vendas na Metrix e dispara automações. */
export const importarPedidosOlist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { paginas?: number }) => d)
  .handler(async ({ context, data }) => {
    const cid = await resolveCompanyIdCached(context.supabase, context.userId);
    await gate(context.supabase, cid);
    const token = await getToken(context.supabase, cid);
    const { olistCall, normalizaNumero } = await srv();
    const { emitWebhook } = await import("@/lib/webhooks.server");
    const paginas = Math.min(Math.max(Number(data?.paginas ?? 2), 1), 10);

    let criados = 0;
    let atualizados = 0;
    let ignorados = 0;

    for (let p = 1; p <= paginas; p++) {
      const retorno = await olistCall("pedidos.pesquisa.php", token, { pagina: String(p) });
      const lista: any[] = retorno.pedidos ?? [];
      if (!lista.length) break;

      for (const item of lista) {
        const ped = item?.pedido ?? item;
        const pedidoId = String(ped?.id ?? ped?.numero ?? "");
        if (!pedidoId) {
          ignorados++;
          continue;
        }
        const nome = String(ped?.nome ?? ped?.cliente?.nome ?? "Cliente Olist").slice(0, 120);
        const numero =
          normalizaNumero(ped?.cliente?.fone ?? ped?.cliente?.celular ?? "") ?? null;
        const valorCents = Math.round((Number(ped?.valor ?? ped?.total_pedido ?? 0) || 0) * 100);
        const situacao = String(ped?.situacao ?? "").toLowerCase();

        const { data: existente } = await (context.supabase as any)
          .from("crm_venda")
          .select("id, olist_situacao")
          .eq("company_id", cid)
          .eq("olist_pedido_id", pedidoId)
          .maybeSingle();

        if (existente) {
          if (existente.olist_situacao !== situacao) {
            await (context.supabase as any)
              .from("crm_venda")
              .update({ olist_situacao: situacao })
              .eq("id", existente.id);
            await emitWebhook(cid, "pedido.atualizado", { pedido: pedidoId, situacao, nome });
            atualizados++;
          }
          continue;
        }

        if (!valorCents) {
          ignorados++;
          continue;
        }

        let cardId: string | null = null;
        if (numero) {
          const { data: card } = await (context.supabase as any)
            .from("crm_cards")
            .select("id")
            .eq("company_id", cid)
            .eq("numero", numero)
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
          contato_numero: numero ?? "",
          contato_nome: nome,
          descricao: `Pedido Olist #${ped?.numero ?? pedidoId}`,
          valor_cents: valorCents,
          vendido_em: String(ped?.data_pedido ?? new Date().toISOString().slice(0, 10)),
          canal: "olist",
          metodo_pagamento: "Olist",
          created_by: context.userId,
          olist_pedido_id: pedidoId,
          olist_situacao: situacao,
        });
        if (error) {
          ignorados++;
          continue;
        }
        criados++;
        await emitWebhook(cid, "pedido.importado", {
          pedido: pedidoId,
          situacao,
          nome,
          valor_cents: valorCents,
        });
        await (context.supabase as any).rpc("push_notificacao", {
          _company_id: cid,
          _tipo: "olist",
          _titulo: "Pedido importado da Olist",
          _descricao: `${nome} • ${(valorCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`,
          _link: "/app/comercial",
          _ref_id: pedidoId,
        });
      }
      if (lista.length < 100) break;
    }

    const resumo = `pedidos: ${criados} novos, ${atualizados} atualizados`;
    await (context.supabase as any)
      .from("olist_integration")
      .update({ ultima_sync: new Date().toISOString(), ultimo_resultado: resumo })
      .eq("company_id", cid);

    return { criados, atualizados, ignorados, resumo };
  });

/** Consulta o status dos pedidos de um contato (usado no chat / CRM). */
export const pedidosDoContato = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { nome: string }) => d)
  .handler(async ({ context, data }) => {
    const cid = await resolveCompanyIdCached(context.supabase, context.userId);
    await gate(context.supabase, cid);
    const token = await getToken(context.supabase, cid);
    const { buscarPedidosPorCliente, obterPedido } = await srv();

    const nome = String(data.nome ?? "").trim();
    if (nome.length < 3) return { pedidos: [] };

    let lista: any[] = [];
    try {
      lista = await buscarPedidosPorCliente(token, nome);
    } catch {
      return { pedidos: [] };
    }

    const top = lista.slice(0, 5);
    const detalhes = await Promise.all(
      top.map(async (p) => {
        let rastreio: string | null = null;
        try {
          const det = await obterPedido(token, String(p?.id ?? ""));
          rastreio = det?.codigo_rastreamento || det?.url_rastreamento || null;
        } catch {
          /* detalhe opcional */
        }
        return {
          id: String(p?.id ?? ""),
          numero: String(p?.numero ?? ""),
          data: String(p?.data_pedido ?? ""),
          situacao: String(p?.situacao ?? ""),
          valor: Number(p?.valor ?? p?.total_pedido ?? 0) || 0,
          rastreio,
        };
      }),
    );
    return { pedidos: detalhes };
  });
