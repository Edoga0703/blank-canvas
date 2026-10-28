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
        model: agentCtx.agent?.ai_model || "google/gemini-2.5-flash",
      }
    );

    // 4. Parsea saída e ações estruturadas
    const parsed = parseCopilotOutput(rawOutput);
    return parsed;
  });

/**
 * Ejecuta una prueba segura de webhook en el Sandbox
 */
export const testWebhookInSandbox = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    url: string;
    method?: "GET" | "POST" | "PUT";
    headers?: Record<string, string>;
    body?: any;
  }) => {
    if (!d?.url) throw new Error("URL é obrigatória para o teste de sandbox.");
    return d;
  })
  .handler(async ({ data }) => {
    const { testExternalWebhook } = await import("./agent-sandbox.server");
    return await testExternalWebhook(data);
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

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { resolveTargetAgent } = await import("./agent-copilot.server");
    const cfg = await resolveTargetAgent(supabaseAdmin, companyId, data.agentId, data.tipo);

    if (action.type === "rule") {
      const ruleText = String(action.payload?.ruleText || "").trim();
      if (!ruleText) throw new Error("Texto da regra vazio.");

      const current = (cfg.regras_rigidas || "").trim();
      const formatted = ruleText.startsWith("-") || /^\d+\./.test(ruleText) ? ruleText : `- ${ruleText}`;
      const updated = current ? `${current}\n${formatted}` : formatted;

      const { error: upErr } = await (supabaseAdmin as any)
        .from("agent_config")
        .update({ regras_rigidas: updated, updated_at: new Date().toISOString() })
        .eq("id", cfg.id);

      if (upErr) throw new Error(`Falha ao salvar regra: ${upErr.message}`);

      // Registrar auditoria
      await supabaseAdmin.from("audit_log").insert({
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

    // Manejo inteligente de integraciones Webhook (incluso si la IA envió erróneamente type: "config")
    const isWebhookLike =
      action.type === "webhook" ||
      (action.type === "config" && (
        Boolean(action.payload?.url) ||
        Boolean(action.payload?.webhook) ||
        Boolean(action.payload?.integration) ||
        Boolean(action.payload?.updates?.url) ||
        Boolean(action.payload?.updates?.webhook) ||
        Boolean(action.payload?.updates?.customerLookup) ||
        /webhook|lookup|smp|api|conexi[oó]n/i.test(action.title || "") ||
        /webhook|lookup|smp|api|endpoint/i.test(action.description || "")
      ));

    if (isWebhookLike) {
      const integrationKey = String(
        action.payload?.integration ||
        action.payload?.updates?.integration ||
        "customerLookup"
      ).trim();

      const url = String(
        action.payload?.url ||
        action.payload?.updates?.url ||
        action.payload?.webhook?.url ||
        (action.payload?.updates?.customerLookup as any)?.url ||
        ""
      ).trim();

      const method = String(
        action.payload?.method ||
        action.payload?.updates?.method ||
        "POST"
      ).toUpperCase();

      const headers =
        action.payload?.headers ||
        action.payload?.updates?.headers || {
          "Content-Type": "application/json",
        };

      const currentCanais = (cfg.canais_ativos && typeof cfg.canais_ativos === "object")
        ? { ...cfg.canais_ativos }
        : { telegram: false, whatsapp: false, instagram: false };

      const currentIntegrations = currentCanais.integrations || {};
      currentIntegrations[integrationKey] = {
        enabled: true,
        name: action.title || action.payload?.name || "Customer Lookup API",
        url,
        method,
        headers,
        updated_at: new Date().toISOString(),
      };
      currentCanais.integrations = currentIntegrations;

      let updatedRegras = cfg.regras_rigidas || "";
      const ruleText = String(action.payload?.ruleText || action.payload?.updates?.ruleText || "").trim();
      if (ruleText) {
        const formatted = ruleText.startsWith("-") || /^\d+\./.test(ruleText) ? ruleText : `- ${ruleText}`;
        if (!updatedRegras.includes(ruleText)) {
          updatedRegras = updatedRegras ? `${updatedRegras}\n${formatted}` : formatted;
        }
      }

      const { error: upErr } = await (supabaseAdmin as any)
        .from("agent_config")
        .update({
          canais_ativos: currentCanais as any,
          regras_rigidas: updatedRegras,
          updated_at: new Date().toISOString(),
        })
        .eq("id", cfg.id);

      if (upErr) throw new Error(`Falha ao salvar integração webhook: ${upErr.message}`);

      await supabaseAdmin.from("audit_log").insert({
        company_id: companyId,
        user_id: userId,
        acao: "copilot_webhook_integrated",
        detalhes: {
          integration: integrationKey,
          url,
          agent_id: cfg.id,
          applied_at: new Date().toISOString(),
        },
      });

      return {
        ok: true,
        message: `¡Integración "${action.title || action.payload?.name || integrationKey}" conectada exitosamente al agente!`,
      };
    }

    if (action.type === "config") {
      const rawUpdates: Record<string, any> = {
        ...(action.payload?.updates || {}),
        ...(action.payload || {}),
      };
      delete rawUpdates.updates;
      delete rawUpdates.agentId;

      const ALLOWED_CONFIG_KEYS = [
        "segundos_buffer", "tamanho_resposta", "sobre_empresa", "descricao_negocio",
        "formas_pagamento", "estilo_comunicacao", "apresentacao", "como_vender",
        "regras_rigidas", "pode_fazer", "nao_pode_fazer", "palavra_pausar",
        "palavra_despausar", "responder_em_partes", "politicas", "faq", "objecoes",
        "diferenciais", "publico_alvo", "regiao_horario", "knowledge_files"
      ];
      const safeUpdates: Record<string, any> = {};
      for (const k of ALLOWED_CONFIG_KEYS) {
        if (rawUpdates[k] !== undefined) safeUpdates[k] = rawUpdates[k];
      }

      if (Object.keys(safeUpdates).length === 0) {
        if (action.payload?.ruleText || action.description) {
          const ruleCandidate = String(action.payload?.ruleText || action.description).trim();
          const current = (cfg.regras_rigidas || "").trim();
          const formatted = ruleCandidate.startsWith("-") || /^\d+\./.test(ruleCandidate) ? ruleCandidate : `- ${ruleCandidate}`;
          const updated = current ? `${current}\n${formatted}` : formatted;
          await supabaseAdmin.from("agent_config").update({ regras_rigidas: updated, updated_at: new Date().toISOString() }).eq("id", cfg.id);
          return { ok: true, message: "Directiva aplicada con éxito a las Reglas Rígidas!" };
        }
        return { ok: true, message: `Configuración "${action.title}" validada y guardada.` };
      }

      const { error: confErr } = await supabaseAdmin
        .from("agent_config")
        .update({
          ...safeUpdates,
          updated_at: new Date().toISOString(),
        })
        .eq("id", cfg.id);
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

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { resolveTargetAgent } = await import("./agent-copilot.server");
    const cfg = await resolveTargetAgent(supabaseAdmin, companyId, data.agentId, data.tipo);
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
      { provider: "gemini", model: "google/gemini-2.5-flash" }
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
