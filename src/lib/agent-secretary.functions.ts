import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveCompanyIdCached } from "@/lib/company-cache";

async function requireAgentManager(supabase: any, userId: string): Promise<string> {
  const companyId = await resolveCompanyIdCached(supabase, userId);
  const { assertPermission } = await import("./permissions.server");
  await assertPermission(
    supabase,
    companyId,
    userId,
    "agente.manage",
    "Sem permissão para gerenciar o Secretário Executivo do agente.",
  );
  return companyId as string;
}

function sanitizePhonesList(rawPhones: unknown): string[] {
  if (!Array.isArray(rawPhones)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of rawPhones) {
    const digits = String(item || "").replace(/\D/g, "");
    if (digits.length < 10 || seen.has(digits)) continue;
    seen.add(digits);
    out.push(digits);
    if (out.length >= 5) break;
  }
  return out;
}

function sanitizeBriefingHour(raw: unknown): string {
  const s = String(raw || "").trim();
  const match = s.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (!match) return "08:00";
  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

export const saveSecretaryConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    agentId: string;
    enabled: boolean;
    phones: string[];
    briefingHour?: string;
    timezone?: string;
  }) => {
    if (!d?.agentId || typeof d.agentId !== "string") {
      throw new Error("ID do agente é obrigatório.");
    }
    return {
      agentId: d.agentId.trim(),
      enabled: Boolean(d.enabled),
      phones: sanitizePhonesList(d.phones),
      briefingHour: sanitizeBriefingHour(d.briefingHour),
      timezone: String(d.timezone || "America/Sao_Paulo").trim() || "America/Sao_Paulo",
    };
  })
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const companyId = await requireAgentManager(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: updated, error } = await (supabaseAdmin as any)
      .from("agent_config")
      .update({
        secretary_enabled: data.enabled,
        secretary_phones: data.phones,
        secretary_briefing_hour: data.briefingHour,
        secretary_timezone: data.timezone,
        updated_at: new Date().toISOString(),
      })
      .eq("company_id", companyId)
      .eq("id", data.agentId)
      .select("id, secretary_enabled, secretary_phones, secretary_briefing_hour, secretary_timezone")
      .maybeSingle();

    if (error) {
      throw new Error(`Falha ao salvar configuração do Secretário: ${error.message}`);
    }
    if (!updated) {
      throw new Error("Agente não encontrado para esta empresa.");
    }

    return { ok: true, config: updated };
  });

export const listPendingApprovals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { agentId?: string | null }) => ({
    agentId: d?.agentId ? String(d.agentId).trim() : null,
  }))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const companyId = await requireAgentManager(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let query = (supabaseAdmin as any)
      .from("agent_approval_requests")
      .select("*")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(30);

    if (data.agentId) {
      query = query.eq("agent_id", data.agentId);
    }

    const { data: rows, error } = await query;
    if (error) {
      throw new Error(`Falha ao listar aprovações: ${error.message}`);
    }

    const sorted = [...(rows ?? [])].sort((a: any, b: any) => {
      const aPending = a?.status === "pending" ? 0 : 1;
      const bPending = b?.status === "pending" ? 0 : 1;
      if (aPending !== bPending) return aPending - bPending;
      return new Date(b?.created_at || 0).getTime() - new Date(a?.created_at || 0).getTime();
    });

    return {
      approvals: sorted.slice(0, 30),
    };
  });

export const resolveApprovalFromPanel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { approvalId: string; decision: "approved" | "rejected" }) => {
    if (!d?.approvalId) throw new Error("ID da aprovação é obrigatório.");
    if (d.decision !== "approved" && d.decision !== "rejected") {
      throw new Error("Decisão inválida.");
    }
    return {
      approvalId: String(d.approvalId).trim(),
      decision: d.decision,
    };
  })
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const companyId = await requireAgentManager(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { resolveApprovalRequest } = await import("@/lib/ai-secretary.server");

    const res = await resolveApprovalRequest(supabaseAdmin, {
      companyId,
      approvalIdOrCode: data.approvalId,
      decision: data.decision,
      resolvedBy: `panel:${userId}`,
    });

    if (!res.ok) {
      throw new Error(res.summaryText || res.error || "Não foi possível resolver a aprovação.");
    }

    return {
      ok: true,
      approval: res.approval,
      executionResult: res.executionResult ?? null,
      summaryText: res.summaryText,
    };
  });
