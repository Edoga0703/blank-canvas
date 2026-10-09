import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveCompanyIdCached } from "./company-cache";

const optionSchema = z.object({
  numero: z.string().trim().regex(/^\d{1,2}$/),
  department_id: z.string().uuid(),
  label: z.string().trim().min(1).max(80),
});

export const saveDepartmentMenu = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      agent_config_id: z.string().uuid(),
      ativo: z.boolean(),
      texto: z.string().trim().max(2000),
      opcoes: z.array(optionSchema).max(12),
    }),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const companyId = await resolveCompanyIdCached(supabase, userId);
    const numbers = data.opcoes.map((option) => option.numero);
    if (new Set(numbers).size !== numbers.length) throw new Error("Cada opção precisa ter um número diferente.");
    if (data.ativo && (!data.texto || data.opcoes.length < 2)) {
      throw new Error("Informe a mensagem e pelo menos duas opções de setor.");
    }

    const departmentIds = [...new Set(data.opcoes.map((option) => option.department_id))];
    if (departmentIds.length) {
      const { data: departments } = await supabase
        .from("department")
        .select("id")
        .eq("company_id", companyId)
        .eq("ativo", true)
        .in("id", departmentIds);
      if ((departments ?? []).length !== departmentIds.length) throw new Error("Uma das opções usa um setor inválido.");
    }

    const { error } = await supabase
      .from("agent_config")
      .update({
        menu_setores_ativo: data.ativo,
        menu_setores_texto: data.texto,
        menu_setores_opcoes: data.opcoes,
      })
      .eq("id", data.agent_config_id)
      .eq("company_id", companyId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });