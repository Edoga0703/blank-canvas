import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveCompanyIdCached } from "./company-cache";

export type StorePlugin = {
  id: string;
  slug: string;
  nome: string;
  descricao: string | null;
  categoria: string;
  icone: string | null;
  auth_tipo: string;
  plano_minimo: string;
  status: string;
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
  // marketplace
  tipo_efeito: string; // canal | capacidade | modulo
  gratuito: boolean;
  preco_mensal: number;
  capacidade_slug: string | null;
  modulo_rota: string | null;
  // estado da empresa
  instalado: boolean;
  ativo: boolean;
  config: Record<string, any>;
  conexao_status: string | null;
  // assinatura do plugin
  assinatura_status: string | null; // ativa | trial | cancelada | expirada
  trial_ends_at: string | null;
  current_period_end: string | null;
  dias_trial_restantes: number | null;
  liberado: boolean;
  checkout_url: string | null;
  /** pago e liberado (assinatura válida) — pode instalar sem passar pelo checkout */
  pago_liberado: boolean;
};



function assinaturaValida(cp: any, gratuito: boolean): boolean {
  if (gratuito) return true;
  if (!cp) return false;
  const now = Date.now();
  const trial = cp.trial_ends_at ? new Date(cp.trial_ends_at).getTime() : 0;
  const periodo = cp.current_period_end ? new Date(cp.current_period_end).getTime() : 0;
  switch (cp.assinatura_status) {
    case "ativa":
      return periodo ? periodo > now : true;
    case "trial":
      return trial > now;
    case "cancelada":
      return Math.max(trial, periodo) > now;
    default:
      return false;
  }
}

function diasRestantes(iso: string | null): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  return ms <= 0 ? 0 : Math.ceil(ms / 86400000);
}


// Plugins que continuam sempre disponíveis (nunca podem ser bloqueados),
// para garantir zero impacto em clientes que já operam com esses canais.
const SEMPRE_DISPONIVEIS = new Set<string>([]);

export const listStorePlugins = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<StorePlugin[]> => {
    const cid = await resolveCompanyIdCached(context.supabase, context.userId);

    const [{ data: plugins, error }, { data: installed }] = await Promise.all([
      context.supabase
        .from("plugin")
        .select("*")
        .neq("status", "descontinuado")
        .eq("visivel_para_clientes", true)
        .order("ordem", { ascending: true }),
      context.supabase.from("company_plugin").select("*").eq("company_id", cid),
    ]);
    if (error) throw new Error(error.message);

    const byPlugin = new Map<string, any>((installed ?? []).map((r: any) => [r.plugin_id, r]));
    return (plugins ?? []).filter((p: any) => !["whatsapp-evolution", "whatsapp-uazapi"].includes(p.slug)).map((p: any) => {
      const cp = byPlugin.get(p.id);
      const forcado = SEMPRE_DISPONIVEIS.has(p.slug);

      return {
        id: p.id,
        slug: p.slug,
        nome: p.nome,
        descricao: p.descricao,
        categoria: p.categoria,
        icone: p.icone,
        auth_tipo: p.auth_tipo,
        plano_minimo: p.plano_minimo,
        status: p.status,
        docs_url: p.docs_url,
        ordem: p.ordem,
        capa_url: p.capa_url ?? null,
        cor_fundo: p.cor_fundo ?? null,
        tagline: p.tagline ?? null,
        descricao_longa: p.descricao_longa ?? null,
        screenshots: Array.isArray(p.screenshots) ? (p.screenshots as string[]) : [],
        destaque: !!p.destaque,
        banner_url: p.banner_url ?? null,
        banner_titulo: p.banner_titulo ?? null,
        banner_subtitulo: p.banner_subtitulo ?? null,
        tipo_efeito: p.tipo_efeito ?? "capacidade",
        gratuito: p.gratuito !== false,
        preco_mensal: Number(p.preco_mensal ?? 0),
        capacidade_slug: p.capacidade_slug ?? p.slug,
        modulo_rota: p.modulo_rota ?? null,
        instalado: forcado ? true : !!cp?.instalado,
        ativo: forcado ? true : !!cp?.ativo,
        config: (cp?.config as Record<string, any>) ?? {},
        conexao_status: cp?.status ?? null,
        assinatura_status: cp?.assinatura_status ?? null,
        trial_ends_at: cp?.trial_ends_at ?? null,
        current_period_end: cp?.current_period_end ?? null,
        dias_trial_restantes:
          cp?.assinatura_status === "trial" ? diasRestantes(cp?.trial_ends_at ?? null) : null,
        liberado: forcado ? true : assinaturaValida(cp, p.gratuito !== false),
        checkout_url: p.checkout_url ?? null,
        pago_liberado:
          forcado || p.gratuito !== false ? true : assinaturaValida(cp, false),
      } satisfies StorePlugin;


    });
  });

/** Capacidades ativas da empresa (usado pelos módulos para liberar recursos). */
export const listCapacidadesAtivas = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<string[]> => {
    const cid = await resolveCompanyIdCached(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("company_plugin")
      .select(
        "ativo, instalado, assinatura_status, trial_ends_at, current_period_end, plugin:plugin(slug, capacidade_slug, status, gratuito)",
      )
      .eq("company_id", cid);
    if (error) throw new Error(error.message);
    const out = new Set<string>(SEMPRE_DISPONIVEIS);


    for (const r of (data ?? []) as any[]) {
      if (!r.instalado || !r.ativo) continue;
      const p = r.plugin;
      if (!p || p.status === "descontinuado" || p.status === "em_breve") continue;
      if (!assinaturaValida(r, p.gratuito !== false)) continue;
      out.add(p.capacidade_slug ?? p.slug);
    }
    return [...out];
  });


export const installPlugin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { pluginId: string }) => d)
  .handler(async ({ context, data }) => {
    const cid = await resolveCompanyIdCached(context.supabase, context.userId);

    const { data: plugin, error: pErr } = await context.supabase
      .from("plugin")
      .select("id, slug, nome, gratuito, preco_mensal, status, visivel_para_clientes, checkout_url")
      .eq("id", data.pluginId)
      .maybeSingle();
    if (pErr) throw new Error(pErr.message);
    if (!plugin || plugin.status === "descontinuado" || !plugin.visivel_para_clientes) {
      throw new Error("Plugin indisponível");
    }
    if (plugin.status === "em_breve") {
      throw new Error("Este plugin ainda está em desenvolvimento. Em breve estará disponível.");
    }

    const pago = plugin.gratuito === false;
    const payload: Record<string, any> = {
      company_id: cid,
      plugin_id: data.pluginId,
      instalado: true,
      ativo: true,
      status: "ok",
      canceled_at: null,
    };

    if (pago) {
      // Plano Cortesia Master: tudo liberado sem cobrança
      const { getCompanyPlan } = await import("./plan-limits.server");
      const plan = await getCompanyPlan(cid);
      if (plan.slug === "cortesia") {
        payload.assinatura_status = "ativa";
        payload.preco_cents = 0;
        payload.current_period_end = null;
      } else {
        const { data: existente } = await context.supabase
          .from("company_plugin")
          .select("assinatura_status, current_period_end")
          .eq("company_id", cid)
          .eq("plugin_id", data.pluginId)
          .maybeSingle();

        const pagoOk =
          existente?.assinatura_status === "ativa" &&
          (!existente?.current_period_end ||
            new Date(existente.current_period_end).getTime() > Date.now());

        // Sem pagamento confirmado → devolve o checkout, não instala.
        if (!pagoOk) {
          return {
            ok: false as const,
            requiresCheckout: true as const,
            checkoutUrl: (plugin as any).checkout_url ?? null,
            nome: plugin.nome as string,
            preco: Number(plugin.preco_mensal ?? 0),
          };
        }

        payload.preco_cents = Math.round(Number(plugin.preco_mensal ?? 0) * 100);
        payload.assinatura_status = "ativa";
      }
    } else {
      payload.assinatura_status = "ativa";
      payload.preco_cents = 0;
    }

    const { error } = await context.supabase
      .from("company_plugin")
      .upsert(payload, { onConflict: "company_id,plugin_id" });
    if (error) throw new Error(error.message);
    return { ok: true as const, requiresCheckout: false as const };
  });



export const setPluginAtivo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { pluginId: string; ativo: boolean }) => d)
  .handler(async ({ context, data }) => {
    const cid = await resolveCompanyIdCached(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("company_plugin")
      .update({ ativo: data.ativo })
      .eq("company_id", cid)
      .eq("plugin_id", data.pluginId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const savePluginConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { pluginId: string; config: Record<string, any> }) => d)
  .handler(async ({ context, data }) => {
    const cid = await resolveCompanyIdCached(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("company_plugin")
      .update({ config: data.config })
      .eq("company_id", cid)
      .eq("plugin_id", data.pluginId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const uninstallPlugin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { pluginId: string }) => d)
  .handler(async ({ context, data }) => {
    const cid = await resolveCompanyIdCached(context.supabase, context.userId);

    const { data: plugin } = await context.supabase
      .from("plugin")
      .select("slug, gratuito")
      .eq("id", data.pluginId)
      .maybeSingle();
    if (plugin && SEMPRE_DISPONIVEIS.has(plugin.slug)) {
      throw new Error("Este plugin é essencial e não pode ser removido.");
    }

    const { error } = await context.supabase
      .from("company_plugin")
      .delete()
      .eq("company_id", cid)
      .eq("plugin_id", data.pluginId);

    if (error) throw new Error(error.message);
    return { ok: true };
  });
