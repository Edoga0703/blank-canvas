import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveCompanyIdCached } from "@/lib/company-cache";

async function requireAdminCompany(supabase: any, userId: string): Promise<string> {
  const companyId = await resolveCompanyIdCached(supabase, userId);
  const { data: isSuper } = await supabase.rpc("is_super_admin");
  if (!isSuper) {
    const { data: cu } = await supabase
      .from("company_user")
      .select("role")
      .eq("company_id", companyId)
      .eq("user_id", userId)
      .eq("ativo", true)
      .maybeSingle();
    if (!cu || (cu.role !== "owner" && cu.role !== "admin")) {
      throw new Error("Somente o dono ou administradores podem editar os agentes de IA.");
    }
  }
  return companyId as string;
}
import {
  getAgentCopilotContext,
  buildCopilotSystemPrompt,
  parseCopilotOutput,
  type CopilotActionProposal,
  type CopilotTurnResult,
} from "./agent-copilot.server";
import { lovableAiChat, type ChatMsg } from "./lovable-ai.server";

export interface CopilotChatMessage {
  role: "user" | "assistant";
  content: string;
  proposals?: CopilotActionProposal[];
}

/**
 * Consulta interactiva al Copilot Arquitecto y Entrenador
 */
export const askAgentCopilot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    messages: CopilotChatMessage[];
    agentId?: string | null;
    tipo?: string;
  }) => {
    if (!Array.isArray(d?.messages) || d.messages.length === 0) {
      throw new Error("Mensagem inválida.");
    }
    return {
      messages: d.messages,
      agentId: d.agentId || null,
      tipo: d.tipo || "qualificacao",
    };
  })
  .handler(async ({ context, data }): Promise<CopilotTurnResult> => {
    const { supabase, userId } = context;
    const companyId = await requireAdminCompany(supabase, userId);

    // 1. Obtém contexto completo do agente e catálogo
    const agentCtx = await getAgentCopilotContext(supabase, companyId, data.agentId, data.tipo);
    const systemPrompt = buildCopilotSystemPrompt(agentCtx);

    // 2. Converte histórico do chat
    const historyMsgs: ChatMsg[] = data.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    // 3. Executa chat com a IA nativa do sistema
    const rawOutput = await lovableAiChat(
      [
        { role: "system", content: systemPrompt },
        ...historyMsgs,
      ],
      {
        provider: agentCtx.agent?.ai_provider || "gemini",
        model: agentCtx.agent?.ai_model || undefined,
      }
    );

    // 4. Parsea saída e ações estruturadas
    const parsed = parseCopilotOutput(rawOutput);
    return parsed;
  });

/**
 * Executa uma ação proposta pelo Copilot após aprovação do usuário
 */
export const executeCopilotAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    action: CopilotActionProposal;
    agentId?: string | null;
    tipo?: string;
  }) => {
    if (!d?.action?.type) throw new Error("Ação inválida.");
    return {
      action: d.action,
      agentId: d.agentId || null,
      tipo: d.tipo || "qualificacao",
    };
  })
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const companyId = await requireAdminCompany(supabase, userId);
    const { action } = data;

    if (action.type === "rule") {
      const ruleText = String(action.payload?.ruleText || "").trim();
      if (!ruleText) throw new Error("Texto da regra vazio.");

      let query = supabase.from("agent_config").select("id, regras_rigidas");
      if (data.agentId) query = query.eq("id", data.agentId);
      else query = query.eq("company_id", companyId).eq("tipo", data.tipo);

      const { data: cfg, error: cfgErr } = await query.maybeSingle();
      if (cfgErr || !cfg) throw new Error("Agente não encontrado.");

      const current = (cfg.regras_rigidas || "").trim();
      const formatted = ruleText.startsWith("-") || /^\d+\./.test(ruleText) ? ruleText : `- ${ruleText}`;
      const updated = current ? `${current}\n${formatted}` : formatted;

      const { error: upErr } = await supabase
        .from("agent_config")
        .update({ regras_rigidas: updated, updated_at: new Date().toISOString() })
        .eq("id", cfg.id);

      if (upErr) throw new Error(`Falha ao salvar regra: ${upErr.message}`);

      // Registrar auditoria
      await supabase.from("audit_log").insert({
        company_id: companyId,
        user_id: userId,
        acao: "copilot_rule_applied",
        detalhes: {
          ruleText,
          agent_id: cfg.id,
          applied_at: new Date().toISOString(),
        },
      });

      return { ok: true, message: "Regra aplicada com sucesso às Regras Rígidas!" };
    }

    if (action.type === "catalog") {
      const items = Array.isArray(action.payload?.items) ? action.payload.items : [];
      if (items.length === 0) throw new Error("Nenhum produto para inserir.");

      const inserts = items.map((item: any, idx: number) => ({
        company_id: companyId,
        nome: String(item.nome || "Produto").trim(),
        preco: Math.max(0, Number(item.preco) || 0),
        descricao: item.descricao ? String(item.descricao).trim() : null,
        categoria: item.categoria ? String(item.categoria).trim() : "Geral",
        ativo: true,
        ordem: idx,
      }));

      const { data: savedProds, error: prodErr } = await supabase
        .from("produto")
        .insert(inserts)
        .select("id, nome, preco");

      if (prodErr) throw new Error(`Falha ao salvar produtos: ${prodErr.message}`);

      await supabase.from("audit_log").insert({
        company_id: companyId,
        user_id: userId,
        acao: "copilot_catalog_applied",
        detalhes: {
          itemsCount: items.length,
          saved: savedProds,
        },
      });

      return { ok: true, message: `${inserts.length} produto(s) adicionados ao catálogo com sucesso!` };
    }

    if (action.type === "config") {
      const rawUpdates = action.payload?.updates || {};
      const ALLOWED_CONFIG_KEYS = [
        "segundos_buffer", "tamanho_resposta", "sobre_empresa", "descricao_negocio",
        "formas_pagamento", "estilo_comunicacao", "apresentacao", "como_vender",
        "regras_rigidas", "pode_fazer", "nao_pode_fazer", "palavra_pausar",
        "palavra_despausar", "responder_em_partes", "politicas", "faq", "objecoes",
        "diferenciais", "publico_alvo", "regiao_horario"
      ];
      const safeUpdates: Record<string, any> = {};
      for (const k of ALLOWED_CONFIG_KEYS) {
        if (rawUpdates[k] !== undefined) safeUpdates[k] = rawUpdates[k];
      }
      if (Object.keys(safeUpdates).length === 0) {
        throw new Error("Nenhum campo de configuração permitido para atualizar.");
      }
      let query = supabase.from("agent_config").update({
        ...safeUpdates,
        updated_at: new Date().toISOString(),
      });
      if (data.agentId) query = query.eq("id", data.agentId);
      else query = query.eq("company_id", companyId).eq("tipo", data.tipo);

      const { error: confErr } = await query;
      if (confErr) throw new Error(`Falha ao atualizar configurações: ${confErr.message}`);

      return { ok: true, message: "Configurações do agente atualizadas com sucesso!" };
    }

    throw new Error(`Tipo de ação desconhecido: ${action.type}`);
  });

/**
 * Audita a coerência de todas as regras atuais do agente
 */
export const auditAgentRules = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { agentId?: string | null; tipo?: string }) => ({
    agentId: d?.agentId || null,
    tipo: d?.tipo || "qualificacao",
  }))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const companyId = await requireAdminCompany(supabase, userId);

    let query = supabase.from("agent_config").select("id, nome_agente, regras_rigidas, sobre_empresa, tamanho_resposta, segundos_buffer");
    if (data.agentId) query = query.eq("id", data.agentId);
    else query = query.eq("company_id", companyId).eq("tipo", data.tipo);

    const { data: cfg } = await query.maybeSingle();
    if (!cfg || !cfg.regras_rigidas?.trim()) {
      return {
        has_conflicts: false,
        summary: "Não há regras rígidas suficientes cadastradas para auditar.",
        recommendations: [],
      };
    }

    const system = `Você é um auditor sênior de lógica e engenharia de prompts para agentes de IA de atendimento (WhatsApp e Instagram).
Sua função é analisar a lista de regras rígidas de um agente e encontrar:
1. Contradições diretas (uma regra diz X e outra diz o oposto de X).
2. Ambigüidades perigosas (termos que geram respostas erradas ao cliente).
3. Redundâncias desnecessárias que só gastam tokens.

Responda em formato JSON:
{
  "has_conflicts": boolean,
  "summary": "Resumo executivo em espanhol de 1 a 2 frases",
  "recommendations": [
    {
      "type": "conflict" | "ambiguity" | "redundancy",
      "issue": "Descrição clara do problema",
      "suggested_fix": "Como unificar ou reescrever a regra"
    }
  ]
}`;

    const raw = await lovableAiChat(
      [
        { role: "system", content: system },
        { role: "user", content: `REGRAS RÍGIDAS ATUAIS:\n${cfg.regras_rigidas}` },
      ],
      { provider: "gemini", model: "google/gemini-2.0-flash-exp" }
    );

    let result = { has_conflicts: false, summary: "Regras analisadas com sucesso.", recommendations: [] };
    try {
      const clean = raw.replace(/```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
      result = JSON.parse(clean);
    } catch (e) {
      console.warn("[auditAgentRules] parse error:", e);
    }

    return result;
  });
