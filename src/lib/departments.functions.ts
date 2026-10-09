import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveCompanyIdCached } from "./company-cache";

export type Department = {
  id: string;
  nome: string;
  descricao: string | null;
  cor: string | null;
  ativo: boolean;
  member_count: number;
};

async function cid(supabase: any, userId: string) {
  return resolveCompanyIdCached(supabase, userId);
}

export const listDepartments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Department[]> => {
    const { supabase, userId } = context;
    const companyId = await cid(supabase, userId);
    const { data } = await supabase
      .from("department")
      .select("id,nome,descricao,cor,ativo,department_member(user_id)")
      .eq("company_id", companyId)
      .order("nome");
    return (data ?? []).map((d: any) => ({
      id: d.id,
      nome: d.nome,
      descricao: d.descricao,
      cor: d.cor,
      ativo: d.ativo,
      member_count: (d.department_member ?? []).length,
    }));
  });

export const saveDepartment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id?: string; nome: string; descricao?: string; cor?: string; ativo?: boolean }) => d)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const companyId = await cid(supabase, userId);
    const nome = data.nome.trim();
    if (!nome) throw new Error("Nome obrigatório.");
    const payload: any = {
      nome,
      descricao: data.descricao ?? null,
      cor: data.cor ?? "#8AA89A",
      ativo: data.ativo ?? true,
    };
    if (data.id) {
      const { error } = await supabase.from("department").update(payload).eq("id", data.id).eq("company_id", companyId);
      if (error) throw new Error(error.message);
      return { ok: true, id: data.id };
    }
    const { data: row, error } = await supabase
      .from("department")
      .insert({ ...payload, company_id: companyId })
      .select("id")
      .maybeSingle();
    if (error || !row) throw new Error(error?.message ?? "Falha ao criar.");
    return { ok: true, id: row.id as string };
  });

export const toggleDepartment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; ativo: boolean }) => d)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const companyId = await cid(supabase, userId);
    const { error } = await supabase.from("department").update({ ativo: data.ativo }).eq("id", data.id).eq("company_id", companyId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteDepartment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const companyId = await cid(supabase, userId);
    const { error } = await supabase.from("department").delete().eq("id", data.id).eq("company_id", companyId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listDepartmentMembers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { department_id: string }) => d)
  .handler(async ({ context, data }): Promise<string[]> => {
    const { supabase } = context;
    const { data: rows } = await supabase.from("department_member").select("user_id").eq("department_id", data.department_id);
    return (rows ?? []).map((r: any) => r.user_id);
  });

export const setDepartmentMembers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { department_id: string; user_ids: string[] }) => d)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const companyId = await cid(supabase, userId);
    const { data: dept } = await supabase.from("department").select("id").eq("id", data.department_id).eq("company_id", companyId).maybeSingle();
    if (!dept) throw new Error("Departamento inválido.");
    await supabase.from("department_member").delete().eq("department_id", data.department_id);
    if (data.user_ids.length) {
      const rows = data.user_ids.map((u) => ({ department_id: data.department_id, user_id: u }));
      const { error } = await supabase.from("department_member").insert(rows);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });
