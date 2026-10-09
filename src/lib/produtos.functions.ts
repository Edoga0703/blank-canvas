import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveCompanyIdCached } from "./company-cache";

export type CatalogoTipo = "produto" | "servico";

export type Produto = {
  id: string;
  company_id: string;
  nome: string;
  preco: number;
  descricao: string | null;
  foto_url: string | null;
  sku: string | null;
  categoria: string | null;
  ativo: boolean;
  ordem: number;
  created_at: string;
  tipo: CatalogoTipo;
  duracao_min: number | null;
  agendavel: boolean;
  cor: string | null;
};

async function resolveCompanyId(supabase: any, userId: string): Promise<string> {
  return resolveCompanyIdCached(supabase, userId);
}

export const listProdutos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const companyId = await resolveCompanyId(supabase, userId);
    const { data, error } = await supabase
      .from("produto")
      .select("*")
      .eq("company_id", companyId)
      .order("ativo", { ascending: false })
      .order("categoria", { ascending: true, nullsFirst: false })
      .order("ordem", { ascending: true })
      .order("nome", { ascending: true });
    if (error) throw error;
    return (data ?? []) as Produto[];
  });

export const saveProduto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    id?: string | null;
    nome: string;
    preco: number;
    descricao?: string | null;
    foto_url?: string | null;
    sku?: string | null;
    categoria?: string | null;
    ativo?: boolean;
    tipo?: CatalogoTipo;
    duracao_min?: number | null;
    agendavel?: boolean;
    cor?: string | null;
  }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const companyId = await resolveCompanyId(supabase, userId);
    const tipo: CatalogoTipo = data.tipo === "servico" ? "servico" : "produto";
    const payload: any = {
      company_id: companyId,
      nome: data.nome.trim(),
      preco: Math.max(0, Number(data.preco) || 0),
      descricao: data.descricao?.trim() || null,
      foto_url: data.foto_url || null,
      sku: data.sku?.trim() || null,
      categoria: data.categoria?.trim() || null,
      ativo: data.ativo ?? true,
      tipo,
      duracao_min: tipo === "servico" ? Math.max(5, Math.round(Number(data.duracao_min) || 30)) : null,
      agendavel: tipo === "servico" ? (data.agendavel ?? true) : false,
      cor: data.cor || null,
    };
    if (data.id) {
      const { data: row, error } = await supabase
        .from("produto").update(payload).eq("id", data.id).eq("company_id", companyId)
        .select().maybeSingle();
      if (error) throw error;
      return row;
    }
    const { data: row, error } = await supabase.from("produto").insert(payload).select().maybeSingle();
    if (error) throw error;
    return row;
  });

export const deleteProduto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const companyId = await resolveCompanyId(supabase, userId);
    const { error } = await supabase.from("produto").delete().eq("id", data.id).eq("company_id", companyId);
    if (error) throw error;
    return { ok: true };
  });
