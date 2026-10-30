import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const resetCompanyData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ companyId: z.string().uuid() }))
  .handler(async ({ context, data }) => {
    const { companyId } = data;
    const userId = context.userId;

    // Verificar se o usuário é admin/owner da empresa
    const { data: membership, error: mErr } = await context.supabase
      .from("company_user")
      .select("role, ativo")
      .eq("company_id", companyId)
      .eq("user_id", userId)
      .maybeSingle();

    if (mErr || !membership?.ativo || !["owner", "admin"].includes(membership.role)) {
      throw new Error("Apenas administradores podem resetar os dados da empresa.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Tabelas para limpar dados (preservando a empresa e usuários)
    // A ordem importa devido a chaves estrangeiras
    const tablesToClear = [
      "mensagens",
      "conversas",
      "crm_cards",
      "crm_columns",
      "crm_boards",
      "contatos",
      "campanha_alvos",
      "campanhas",
      "agendamentos",
      "quick_replies",
      "produtos",
      "servicos",
      "csat_respostas",
      "audit_log",
      "automation_step_runs",
      "automation_jobs",
      "automation_executions",
      "automation_events",
      "automation_conversation_control",
      "automation_workflow_versions",
      "automation_workflows",
      "automation_logs",
      "ai_training_data",
      "agent_ai_configs"
    ];

    // Executar as deleções
    for (const table of tablesToClear) {
      try {
        const { error } = await supabaseAdmin
          .from(table as any)
          .delete()
          .eq("company_id", companyId);
        
        if (error) {
          console.error(`Erro ao limpar tabela ${table}:`, error);
        }
      } catch (err) {
        console.error(`Falha crítica ao limpar tabela ${table}:`, err);
      }
    }

    // Registrar ação no log de auditoria master
    await supabaseAdmin.from("audit_log").insert({
      company_id: companyId,
      user_id: userId,
      acao: "company_data_reset",
      recurso: "company",
      detalhes: { timestamp: new Date().toISOString(), requested_by: userId }
    });

    return { success: true, message: "Dados da empresa resetados com sucesso." };
  });
