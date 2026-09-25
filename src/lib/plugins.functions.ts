import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type Plugin = {
  id: string;
  slug: string;
  nome: string;
  descricao: string | null;
  categoria: string;
  icone: string | null;
  auth_tipo: string;
  plano_minimo: string;
  status: string;
  visivel_para_clientes: boolean;
  docs_url: string | null;
  ordem: number;
  capa_url: string | null;
  cor_fundo: string | null;
  tagline: string | null;
  descricao_longa: string | null;
  screenshots: string[];
  destaque: boolean;
  banner_url: string | null;
  banner_titulo: string | null;
  banner_subtitulo: string | null;
  tipo_efeito: string;
  gratuito: boolean;
  preco_mensal: number;
  capacidade_slug: string | null;
  modulo_rota: string | null;
  checkout_url: string | null;
  external_product_id: string | null;
};


async function assertSuperAdmin(supabase: any) {
  const { data, error } = await supabase.rpc("is_super_admin");
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Acesso negado");
}

export const listPluginsMaster = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Plugin[]> => {
    await assertSuperAdmin(context.supabase);
    const { data, error } = await context.supabase
      .from("plugin")
      .select("*")
      .order("ordem", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as Plugin[];
  });

export const savePlugin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: Partial<Plugin>) => d)
  .handler(async ({ context, data }) => {
    await assertSuperAdmin(context.supabase);
    if (!data.slug || !data.nome) throw new Error("Slug e nome são obrigatórios");
    const payload = {
      slug: data.slug,
      nome: data.nome,
      descricao: data.descricao ?? null,
      categoria: data.categoria ?? "integracao",
      icone: data.icone ?? null,
      auth_tipo: data.auth_tipo ?? "none",
      plano_minimo: data.plano_minimo ?? "starter",
      status: data.status ?? "rascunho",
      visivel_para_clientes: !!data.visivel_para_clientes,
      docs_url: data.docs_url ?? null,
      ordem: data.ordem ?? 0,
      capa_url: data.capa_url ?? null,
      cor_fundo: data.cor_fundo ?? null,
      tagline: data.tagline ?? null,
      descricao_longa: data.descricao_longa ?? null,
      screenshots: data.screenshots ?? [],
      destaque: !!data.destaque,
      banner_url: data.banner_url ?? null,
      banner_titulo: data.banner_titulo ?? null,
      banner_subtitulo: data.banner_subtitulo ?? null,
      tipo_efeito: data.tipo_efeito ?? "capacidade",
      gratuito: data.gratuito !== false,
      preco_mensal: Number(data.preco_mensal ?? 0),
      capacidade_slug: data.capacidade_slug ?? data.slug,
      modulo_rota: data.modulo_rota ?? null,
      checkout_url: data.checkout_url ?? null,
      external_product_id: data.external_product_id ?? null,
    };

    if (data.id) {
      const { error } = await context.supabase.from("plugin").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await context.supabase.from("plugin").insert(payload);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const deletePlugin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ context, data }) => {
    await assertSuperAdmin(context.supabase);
    const { error } = await context.supabase.from("plugin").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export type PluginReceita = {
  plugin_id: string;
  slug: string;
  nome: string;
  gratuito: boolean;
  preco_mensal: number;
  instalacoes: number;
  em_trial: number;
  assinaturas_ativas: number;
  canceladas: number;
  receita_mensal_cents: number;
};

/** Métricas de instalação e receita por plugin (painel master). */
export const listPluginReceita = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PluginReceita[]> => {
    await assertSuperAdmin(context.supabase);
    const { data, error } = await context.supabase.rpc("plugin_receita_resumo");
    if (error) throw new Error(error.message);
    return (data ?? []).map((r: any) => ({
      plugin_id: r.plugin_id,
      slug: r.slug,
      nome: r.nome,
      gratuito: !!r.gratuito,
      preco_mensal: Number(r.preco_mensal ?? 0),
      instalacoes: Number(r.instalacoes ?? 0),
      em_trial: Number(r.em_trial ?? 0),
      assinaturas_ativas: Number(r.assinaturas_ativas ?? 0),
      canceladas: Number(r.canceladas ?? 0),
      receita_mensal_cents: Number(r.receita_mensal_cents ?? 0),
    }));
  });
