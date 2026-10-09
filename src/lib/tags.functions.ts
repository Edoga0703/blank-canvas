import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveCompanyIdCached } from "./company-cache";

async function resolveCompanyId(supabase: any, userId: string): Promise<string> {
  return resolveCompanyIdCached(supabase, userId);
}
export type CompanyTag = { id: string; nome: string; cor: string | null };
export type CompanyTagWithCount = CompanyTag & { contatos: number };

export const listTags = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CompanyTag[]> => {
    const { supabase, userId } = context;
    const cid = await resolveCompanyId(supabase, userId);
    const { data } = await supabase.from("company_tag").select("id,nome,cor").eq("company_id", cid).order("nome");
    return (data ?? []) as CompanyTag[];
  });

export const listTagsWithCount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ tags: CompanyTagWithCount[]; totalContatos: number }> => {
    const { supabase, userId } = context;
    const cid = await resolveCompanyId(supabase, userId);
    const [{ data: tags }, { data: cards }] = await Promise.all([
      supabase.from("company_tag").select("id,nome,cor").eq("company_id", cid).order("nome"),
      supabase.from("crm_cards").select("id,tags").eq("company_id", cid),
    ]);
    const counts = new Map<string, number>();
    const taggedIds = new Set<string>();
    for (const c of (cards ?? []) as any[]) {
      const ts: string[] = (c.tags ?? []) as string[];
      if (ts.length) taggedIds.add(c.id);
      for (const t of ts) counts.set(t.toLowerCase(), (counts.get(t.toLowerCase()) ?? 0) + 1);
    }
    return {
      tags: (tags ?? []).map((t: any) => ({ ...t, contatos: counts.get((t.nome ?? "").toLowerCase()) ?? 0 })),
      totalContatos: taggedIds.size,
    };
  });

export const updateTag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; nome: string; cor?: string }) => d)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const cidv = await resolveCompanyId(supabase, userId);
    const nome = data.nome.trim();
    if (!nome) throw new Error("Nome vazio.");
    const { error } = await supabase.from("company_tag").update({ nome, cor: data.cor ?? null }).eq("id", data.id).eq("company_id", cidv);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const createTag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { nome: string; cor?: string }) => d)
  .handler(async ({ context, data }): Promise<CompanyTag> => {
    const { supabase, userId } = context;
    const cid = await resolveCompanyId(supabase, userId);
    const nome = data.nome.trim();
    if (!nome) throw new Error("Nome vazio.");
    const { data: existing } = await supabase.from("company_tag").select("id,nome,cor").eq("company_id", cid).ilike("nome", nome).maybeSingle();
    if (existing) return existing as CompanyTag;
    const { data: row, error } = await supabase.from("company_tag").insert({ company_id: cid, nome, cor: data.cor ?? "#8AA89A" }).select("id,nome,cor").maybeSingle();
    if (error || !row) throw new Error(error?.message ?? "Falha ao criar tag.");
    return row as CompanyTag;
  });

export const deleteTag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const cid = await resolveCompanyId(supabase, userId);
    const { error } = await supabase.from("company_tag").delete().eq("id", data.id).eq("company_id", cid);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
