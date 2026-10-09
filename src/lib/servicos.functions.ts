import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveCompanyIdCached } from "./company-cache";

// Serviços agora vivem no catálogo unificado (public.produto com tipo = 'servico').
// Estas funções mantêm o formato antigo para os módulos que já consomem serviços.

async function resolveCompanyId(supabase: any, userId: string): Promise<string> {
  return resolveCompanyIdCached(supabase, userId);
}

function toServico(row: any) {
  return {
    id: row.id,
    company_id: row.company_id,
    nome: row.nome,
    duracao_min: row.duracao_min ?? 30,
    valor_cents: Math.round((Number(row.preco) || 0) * 100),
    cor: row.cor ?? null,
    ativo: row.ativo,
    created_at: row.created_at,
  };
}

export const listServicos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const companyId = await resolveCompanyId(supabase, userId);
    const { data, error } = await supabase
      .from("produto")
      .select("*")
      .eq("company_id", companyId)
      .eq("tipo", "servico")
      .order("ativo", { ascending: false })
      .order("nome", { ascending: true });
    if (error) throw error;
    return (data ?? []).map(toServico);
  });

export const saveServico = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    id?: string | null;
    nome: string;
    duracao_min: number;
    valor_cents?: number;
    cor?: string | null;
    ativo?: boolean;
  }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const companyId = await resolveCompanyId(supabase, userId);
    const payload: any = {
      company_id: companyId,
      nome: data.nome.trim(),
      tipo: "servico",
      agendavel: true,
      duracao_min: Math.max(5, Math.round(data.duracao_min || 30)),
      preco: Math.max(0, Math.round(data.valor_cents || 0)) / 100,
      cor: data.cor || null,
      ativo: data.ativo ?? true,
    };
    if (data.id) {
      const { data: row, error } = await supabase
        .from("produto").update(payload).eq("id", data.id).eq("company_id", companyId)
        .select().maybeSingle();
      if (error) throw error;
      return row ? toServico(row) : null;
    }
    const { data: row, error } = await supabase.from("produto").insert(payload).select().maybeSingle();
    if (error) throw error;
    return row ? toServico(row) : null;
  });

export const deleteServico = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const companyId = await resolveCompanyId(supabase, userId);
    const { error } = await supabase
      .from("produto").delete().eq("id", data.id).eq("company_id", companyId).eq("tipo", "servico");
    if (error) throw error;
    return { ok: true };
  });
