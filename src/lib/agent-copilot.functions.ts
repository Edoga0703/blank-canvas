import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveCompanyIdCached } from "@/lib/company-cache";

async function requireAdminCompany(supabase: any, userId: string): Promise<string> {
  const companyId = await resolveCompanyIdCached(supabase, userId);
  const { assertPermission } = await import("./permissions.server");
  await assertPermission(
    supabase,
    companyId,
    userId,
    "agente.manage",
    "Sem permissão para gerenciar os agentes de IA.",
  );
  return companyId as string;
}
import {
  getAgentCopilotContext,
  buildCopilotSystemPrompt,
  parseCopilotOutput,
  type CopilotActionProposal,
  type CopilotTurnResult,
} from "./agent-copilot.server";
import type { ChatMsg } from "./lovable-ai.server";

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

    // 3. Executa chat com a IA nativa do sistema (garante até 8192 tokens para respostas completas)
    const { lovableAiChat } = await import("./lovable-ai.server");
    const rawOutput = await lovableAiChat(
      [
        { role: "system", content: systemPrompt },
        ...historyMsgs,
      ],
      {
        provider: agentCtx.agent?.ai_provider || "gemini",
        model: agentCtx.agent?.ai_model || "gemini-3.5-flash-lite",
        maxTokens: 8192,
        temperature: 0.2,
        telemetry: {
          companyId,
          userId,
          agentId: data.agentId || (agentCtx.agent as any)?.id || null,
          feature: "agent_copilot",
        },
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
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    await requireAdminCompany(supabase, userId);
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

    // Manejo inteligente de herramientas verificadas (type: "tool") e integraciones Webhook (incluso si la IA envió erróneamente type: "config")
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

    if (action.type === "tool" || isWebhookLike) {
      const { testExternalWebhook, isSafeUrl } = await import("./agent-sandbox.server");
      const {
        normalizeToolSlug,
        sanitizeToolForClient,
      } = await import("./agent-tools.server");

      const integrationKey = String(
        action.payload?.integration ||
        action.payload?.updates?.integration ||
        ""
      ).trim();

      const url = String(
        action.payload?.url ||
        action.payload?.updates?.url ||
        action.payload?.webhook?.url ||
        (action.payload?.updates?.customerLookup as any)?.url ||
        ""
      ).trim();

      if (!url || !isSafeUrl(url)) {
        throw new Error("A URL da ferramenta é obrigatória e deve ser válida e segura.");
      }

      const rawMethod = String(
        action.payload?.method ||
        action.payload?.updates?.method ||
        "POST"
      ).toUpperCase();
      const method = (rawMethod === "GET" || rawMethod === "PUT" ? rawMethod : "POST") as "GET" | "POST" | "PUT";

      const rawHeaders =
        action.payload?.headers ||
        action.payload?.updates?.headers ||
        {};
      let headers: Record<string, string> =
        rawHeaders && typeof rawHeaders === "object" && !Array.isArray(rawHeaders)
          ? Object.fromEntries(
              Object.entries(rawHeaders).map(([k, v]) => [String(k), String(v ?? "")]),
            )
          : {};

      const rawKind = String(action.payload?.kind || "").trim().toLowerCase();
      const kind = rawKind === "webhook_out" ? "webhook_out" : "http";

      const rawPerm = String(action.payload?.permission_level || "").trim();
      const permissionLevel = (
        rawPerm === "write_confirm_customer" || rawPerm === "write_require_owner_approval"
          ? rawPerm
          : "read_only"
      ) as "read_only" | "write_confirm_customer" | "write_require_owner_approval";

      const displayName = String(
        action.payload?.display_name ||
        action.payload?.name ||
        action.title ||
        "Herramienta Externa"
      ).trim().slice(0, 120);

      const toolSlug = normalizeToolSlug(
        action.payload?.name || integrationKey || displayName,
        kind === "webhook_out" ? "webhook_saliente" : "herramienta_http",
      );

      const description = String(
        action.payload?.description ||
        action.description ||
        displayName
      ).trim().slice(0, 500);

      const inputSchema =
        action.payload?.input_schema && typeof action.payload.input_schema === "object" && !Array.isArray(action.payload.input_schema)
          ? action.payload.input_schema
          : {};

      const bodyTemplate =
        action.payload?.body_template !== undefined
          ? action.payload.body_template
          : action.payload?.body !== undefined
            ? action.payload.body
            : null;

      // Preservar headers reales si el Copilot recibió valores redactados de una herramienta existente
      if (Object.values(headers).some((v) => v === "***redacted***")) {
        try {
          const { data: existingTool } = await (supabaseAdmin as any)
            .from("agent_tools")
            .select("headers")
            .eq("company_id", companyId)
            .eq("agent_id", cfg.id)
            .eq("name", toolSlug)
            .maybeSingle();
          if (existingTool?.headers && typeof existingTool.headers === "object") {
            const mergedHeaders = { ...headers };
            for (const [k, v] of Object.entries(mergedHeaders)) {
              if (v === "***redacted***" && existingTool.headers[k] !== undefined) {
                mergedHeaders[k] = String(existingTool.headers[k]);
              }
            }
            headers = mergedHeaders;
          }
        } catch {}
      }

      // Exigir verificación HTTP 2xx previa (si no viene ya verificada del Sandbox, probar ahora)
      const preTested = action.payload?.sandboxTestResult;
      let testStatus: number;
      let testLatencyMs: number;
      let testSample: any;

      if (
        preTested &&
        preTested.ok === true &&
        Number(preTested.status) >= 200 &&
        Number(preTested.status) < 300
      ) {
        testStatus = Number(preTested.status);
        testLatencyMs = Math.max(0, Number(preTested.latencyMs) || 0);
        testSample = preTested.responseSample ?? null;
      } else {
        const testRes = await testExternalWebhook({
          url,
          method,
          headers,
          body: action.payload?.test_body ?? action.payload?.body ?? bodyTemplate ?? {},
        });
        if (!testRes.ok || testRes.status < 200 || testRes.status >= 300) {
          throw new Error(
            `La prueba previa en Sandbox falló (HTTP ${testRes.status}): ${testRes.error || testRes.statusText}. Corrige la URL o credenciales antes de guardar.`,
          );
        }
        testStatus = testRes.status;
        testLatencyMs = testRes.latencyMs;
        testSample = testRes.responseSample ?? null;
      }

      const nowIso = new Date().toISOString();
      let safeSample = testSample;
      try {
        const serialized = JSON.stringify(testSample);
        if (serialized && serialized.length > 2000) {
          safeSample = { truncated: serialized.slice(0, 2000) };
        }
      } catch {
        safeSample = null;
      }

      const { data: savedTool, error: toolErr } = await (supabaseAdmin as any)
        .from("agent_tools")
        .upsert(
          {
            company_id: companyId,
            agent_id: cfg.id,
            name: toolSlug,
            display_name: displayName,
            description,
            kind,
            method,
            url,
            headers,
            input_schema: inputSchema,
            body_template: bodyTemplate,
            permission_level: permissionLevel,
            verified: true,
            verified_at: nowIso,
            last_test_status: testStatus,
            last_test_latency_ms: testLatencyMs,
            last_test_sample: safeSample,
            active: true,
            updated_at: nowIso,
          },
          { onConflict: "agent_id,name" },
        )
        .select("*")
        .single();

      if (toolErr || !savedTool) {
        throw new Error(`Falha ao salvar ferramenta verificada: ${toolErr?.message || "Erro desconhecido"}`);
      }

      // Compatibilidad heredada si integration === "customerLookup" o si incluye ruleText
      const ruleText = String(action.payload?.ruleText || action.payload?.updates?.ruleText || "").trim();
      const shouldUpdateCustomerLookup = integrationKey === "customerLookup" || action.type === "webhook";

      if (shouldUpdateCustomerLookup || ruleText) {
        const cfgUpdate: Record<string, any> = { updated_at: nowIso };
        if (integrationKey === "customerLookup") {
          const currentCanais = (cfg.canais_ativos && typeof cfg.canais_ativos === "object")
            ? { ...cfg.canais_ativos }
            : { telegram: false, whatsapp: false, instagram: false };
          const currentIntegrations = currentCanais.integrations || {};
          currentIntegrations[integrationKey] = {
            enabled: true,
            name: displayName,
            url,
            method,
            headers,
            updated_at: nowIso,
          };
          currentCanais.integrations = currentIntegrations;
          cfgUpdate.canais_ativos = currentCanais as any;
        }
        if (ruleText) {
          let updatedRegras = cfg.regras_rigidas || "";
          const formatted = ruleText.startsWith("-") || /^\d+\./.test(ruleText) ? ruleText : `- ${ruleText}`;
          if (!updatedRegras.includes(ruleText)) {
            updatedRegras = updatedRegras ? `${updatedRegras}\n${formatted}` : formatted;
          }
          cfgUpdate.regras_rigidas = updatedRegras;
        }
        const { error: upErr } = await (supabaseAdmin as any)
          .from("agent_config")
          .update(cfgUpdate)
          .eq("id", cfg.id);
        if (upErr) throw new Error(`Falha ao atualizar configuração da integração: ${upErr.message}`);
      }

      try {
        await supabaseAdmin.from("audit_log").insert({
          company_id: companyId,
          user_id: userId,
          acao: action.type === "tool" ? "copilot_tool_verified" : "copilot_webhook_integrated",
          detalhes: {
            tool_id: savedTool.id,
            name: toolSlug,
            kind,
            permission_level: permissionLevel,
            integration: integrationKey || null,
            url,
            status: testStatus,
            latency_ms: testLatencyMs,
            agent_id: cfg.id,
            applied_at: nowIso,
          },
        });
      } catch {}

      return {
        ok: true,
        tool: sanitizeToolForClient(savedTool),
        message: `¡Herramienta verificada "${displayName}" (${toolSlug}) guardada y activa en el agente!`,
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

    const { lovableAiChat } = await import("./lovable-ai.server");
    const raw = await lovableAiChat(
      [
        { role: "system", content: system },
        { role: "user", content: `REGRAS RÍGIDAS ATUAIS:\n${cfg.regras_rigidas}` },
      ],
      {
        provider: "gemini",
        model: "gemini-3.5-flash-lite",
        telemetry: {
          companyId,
          userId,
          agentId: data.agentId || cfg?.id || null,
          feature: "agent_rules_audit",
        },
      }
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

/**
 * Lista las herramientas externas registradas para un agente (con headers redactados)
 */
export const listAgentTools = createServerFn({ method: "POST" })
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
    const { sanitizeToolForClient } = await import("./agent-tools.server");

    const cfg = await resolveTargetAgent(supabaseAdmin, companyId, data.agentId, data.tipo);
    const { data: rows, error } = await (supabaseAdmin as any)
      .from("agent_tools")
      .select("*")
      .eq("company_id", companyId)
      .eq("agent_id", cfg.id)
      .order("created_at", { ascending: true });

    if (error) {
      throw new Error(`Falha ao listar ferramentas: ${error.message}`);
    }

    return {
      agentId: cfg.id,
      tools: (rows ?? []).map((row: any) => sanitizeToolForClient(row)),
    };
  });

/**
 * Activa o pausa una herramienta externa del agente
 */
export const toggleAgentTool = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { toolId: string; active: boolean }) => {
    if (!d?.toolId) throw new Error("ID da ferramenta é obrigatório.");
    return {
      toolId: String(d.toolId).trim(),
      active: Boolean(d.active),
    };
  })
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const companyId = await requireAdminCompany(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: updated, error } = await (supabaseAdmin as any)
      .from("agent_tools")
      .update({
        active: data.active,
        updated_at: new Date().toISOString(),
      })
      .eq("company_id", companyId)
      .eq("id", data.toolId)
      .select("id, active")
      .maybeSingle();

    if (error) {
      throw new Error(`Falha ao atualizar ferramenta: ${error.message}`);
    }
    if (!updated) {
      throw new Error("Ferramenta não encontrada.");
    }

    return { ok: true, id: updated.id, active: updated.active };
  });

/**
 * Elimina una herramienta externa del agente
 */
export const deleteAgentTool = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { toolId: string }) => {
    if (!d?.toolId) throw new Error("ID da ferramenta é obrigatório.");
    return {
      toolId: String(d.toolId).trim(),
    };
  })
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const companyId = await requireAdminCompany(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error } = await (supabaseAdmin as any)
      .from("agent_tools")
      .delete()
      .eq("company_id", companyId)
      .eq("id", data.toolId);

    if (error) {
      throw new Error(`Falha ao excluir ferramenta: ${error.message}`);
    }

    return { ok: true };
  });
