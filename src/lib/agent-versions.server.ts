/**
 * Helper compartido para snapshots y versionado de configuraciones de agentes IA
 * en `public.agent_config_versions` (conservando las últimas 25 versiones).
 */

const NON_SNAPSHOT_FIELDS = new Set([
  "id",
  "company_id",
  "user_id",
  "created_at",
  "updated_at",
  "active_version",
]);

export const EDITABLE_RESTORE_FIELDS = [
  "nome", "nome_agente", "nome_empresa", "tipo", "idioma", "papel_objetivo",
  "estilo_comunicacao", "sobre_empresa", "descricao_negocio", "diferenciais",
  "publico_alvo", "regiao_horario", "produtos_servicos", "ofertas", "cupom",
  "como_vender", "objecoes", "formas_pagamento", "ticket_medio", "faq",
  "politicas", "posvenda_msg", "pedir_avaliacao", "reativar_cliente",
  "pode_fazer", "nao_pode_fazer", "regras_rigidas", "exemplos_few_shot",
  "telefone_transferencia", "palavra_pausar", "palavra_despausar",
  "segundos_buffer", "responder_em_partes", "tamanho_resposta",
  "ai_provider", "ai_model", "temperatura", "agendamento_ativo",
  "servicos_agendaveis", "duracao_padrao", "horarios_disponiveis",
  "antecedencia_min", "menu_setores_ativo", "menu_setores_texto",
  "menu_setores_opcoes", "olist_catalogo", "canais_ativos",
  "knowledge_files", "avatar_url", "avatar_traits", "studio_mode",
  "secretary_enabled", "secretary_phones", "secretary_briefing_hour", "secretary_timezone",
];

export function buildSafeAgentSnapshot(row: Record<string, any> | null | undefined): Record<string, any> {
  if (!row || typeof row !== "object") return {};
  const snap: Record<string, any> = {};
  for (const [key, val] of Object.entries(row)) {
    if (NON_SNAPSHOT_FIELDS.has(key)) continue;
    if (key === "canais_ativos" && val && typeof val === "object" && !Array.isArray(val)) {
      const cloned = { ...val };
      if (cloned.integrations && typeof cloned.integrations === "object") {
        const cleanInt: Record<string, any> = {};
        for (const [ik, iv] of Object.entries(cloned.integrations)) {
          if (iv && typeof iv === "object") {
            const { headers: _h, token: _t, secret: _s, ...safeIv } = iv as any;
            cleanInt[ik] = safeIv;
          } else {
            cleanInt[ik] = iv;
          }
        }
        cloned.integrations = cleanInt;
      }
      snap[key] = cloned;
      continue;
    }
    snap[key] = val;
  }
  return snap;
}

export async function recordAgentConfigVersion(
  _supabase: any,
  params: { companyId: string; agentId: string; userId: string; label: string },
): Promise<number | null> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: agentRow }, { data: maxVerRow }] = await Promise.all([
      (supabaseAdmin as any)
        .from("agent_config")
        .select("*")
        .eq("company_id", params.companyId)
        .eq("id", params.agentId)
        .maybeSingle(),
      (supabaseAdmin as any)
        .from("agent_config_versions")
        .select("version_number")
        .eq("agent_id", params.agentId)
        .order("version_number", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (!agentRow) return null;
    const currentActive = Number(agentRow.active_version || 1);
    const maxStored = Number(maxVerRow?.version_number || 0);
    const nextVersion = Math.max(currentActive, maxStored) + 1;
    const snapshot = buildSafeAgentSnapshot(agentRow);

    const { error: insErr } = await (supabaseAdmin as any)
      .from("agent_config_versions")
      .insert({
        company_id: params.companyId,
        agent_id: params.agentId,
        version_number: nextVersion,
        label: params.label.slice(0, 140),
        snapshot,
        created_by: params.userId,
      });

    if (insErr) {
      console.warn("[agent-versions] insert warning:", insErr.message);
      return null;
    }

    await (supabaseAdmin as any)
      .from("agent_config")
      .update({ active_version: nextVersion })
      .eq("company_id", params.companyId)
      .eq("id", params.agentId);

    // Conservar las últimas 25 versiones por agente
    const { data: allRows } = await (supabaseAdmin as any)
      .from("agent_config_versions")
      .select("id")
      .eq("agent_id", params.agentId)
      .order("version_number", { ascending: false })
      .limit(100);

    if (Array.isArray(allRows) && allRows.length > 25) {
      const toDelete = allRows.slice(25).map((r: any) => r.id);
      if (toDelete.length > 0) {
        await (supabaseAdmin as any)
          .from("agent_config_versions")
          .delete()
          .in("id", toDelete);
      }
    }

    return nextVersion;
  } catch (err: any) {
    console.warn("[agent-versions] snapshot error:", err?.message);
    return null;
  }
}
