import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveCompanyIdCached } from "./company-cache";
import { z } from "zod";

export type PluginSuggestion = {
  id: string;
  company_id: string;
  user_id: string | null;
  titulo: string;
  descricao: string | null;
  status: 'pendente' | 'analise' | 'aprovado' | 'recusado';
  created_at: string;
};

export const suggestPlugin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    titulo: z.string().min(1, "O título é obrigatório"),
    descricao: z.string().optional(),
  }))
  .handler(async ({ context, data }) => {
    const cid = await resolveCompanyIdCached(context.supabase, context.userId);
    
    // Bypass type checking for custom table not yet in generated types
    const { error } = await (context.supabase as any)
      .from("plugin_suggestion")
      .insert({
        company_id: cid,
        user_id: context.userId,
        titulo: data.titulo,
        descricao: data.descricao,
        status: 'pendente'
      });
      
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listSuggestionsMaster = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PluginSuggestion[]> => {
    // Apenas super admins
    const { data: isAdmin } = await context.supabase.rpc("is_super_admin");
    if (!isAdmin) throw new Error("Acesso negado");

    const { data, error } = await (context.supabase as any)
      .from("plugin_suggestion")
      .select("*, company(nome)")
      .order("created_at", { ascending: false });
      
    if (error) throw new Error(error.message);
    return data as any;
  });

export const updateSuggestionStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    id: z.string(),
    status: z.enum(['pendente', 'analise', 'aprovado', 'recusado'])
  }))
  .handler(async ({ context, data }) => {
    const { data: isAdmin } = await context.supabase.rpc("is_super_admin");
    if (!isAdmin) throw new Error("Acesso negado");

    const { error } = await (context.supabase as any)
      .from("plugin_suggestion")
      .update({ status: data.status })
      .eq("id", data.id);
      
    if (error) throw new Error(error.message);
    return { ok: true };
  });
