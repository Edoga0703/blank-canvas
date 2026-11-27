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
  id?: string;
  role: "user" | "assistant";
  content: string;
  proposals?: CopilotActionProposal[];
  createdAt?: string;
}

function defaultModelForProvider(provider: string): string {
  switch (provider.toLowerCase()) {
    case "drael":
      return "drael-v1";
    case "openai":
      return "gpt-4o-mini";
    case "anthropic":
      return "claude-3-5-sonnet-latest";
    default:
      return "gemini-3.5-flash-lite";
  }
}

async function resolveCopilotModelConfig(
  admin: any,
  agent: any,
): Promise<{ provider: string; model: string }> {
  let gVal: Record<string, any> = {};
  try {
    const { data: globalSettings } = await admin
      .from("master_settings")
      .select("value")
      .eq("key", "global_ai_config")
      .maybeSingle();
    gVal = (globalSettings?.value as Record<string, any>) || {};
  } catch {}

  const copilotProvider = String(gVal.copilot_provider || "").trim().toLowerCase();
  const copilotModel = String(gVal.copilot_model || "").trim();
  const globalProvider = String(gVal.ai_provider || "").trim().toLowerCase();
  const globalModel = String(gVal.ai_model || "").trim();
  const agentProvider = String(agent?.ai_provider || "").trim().toLowerCase();
  const agentModel = String(agent?.ai_model || "").trim();

  if (copilotProvider && copilotProvider !== "global" && copilotProvider !== "default") {
    return {
      provider: copilotProvider,
      model: copilotModel || defaultModelForProvider(copilotProvider),
    };
  }

  if (copilotModel) {
    const prov = globalProvider || agentProvider || "gemini";
    return {
      provider: prov,
      model: copilotModel,
    };
  }

  if (globalProvider) {
    return {
      provider: globalProvider,
      model: globalModel || defaultModelForProvider(globalProvider),
    };
  }

  if (agentProvider) {
    return {
      provider: agentProvider,
      model: agentModel || defaultModelForProvider(agentProvider),
    };
  }

  return {
    provider: "gemini",
    model: "gemini-3.5-flash-lite",
  };
}

const SANDBOX_TEST_VARS: Record<string, string> = {
  phone: "584120000000",
  numero: "584120000000",
  name: "Cliente Prueba",
  nome: "Cliente Prueba",
  email: "prueba@example.com",
};

function resolveSandboxVar(key: string): string {
  const exact = SANDBOX_TEST_VARS[key];
  if (exact !== undefined) return exact;
  const lower = key.toLowerCase();
  if (lower.includes("phone") || lower.includes("tel") || lower.includes("whats") || lower.includes("num")) {
    return "584120000000";
  }
  if (lower.includes("mail")) return "prueba@example.com";
  if (lower.includes("name") || lower.includes("nome")) return "Cliente Prueba";
  return "prueba";
}

function interpolateSandboxString(template: string, urlEncodeValues: boolean): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_, key: string) => {
    const val = resolveSandboxVar(key);
    return urlEncodeValues ? encodeURIComponent(val) : val;
  });
}

function interpolateSandboxValue(value: any): any {
  if (typeof value === "string") {
    const exactMatch = value.match(/^\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}$/);
    if (exactMatch) {
      return resolveSandboxVar(exactMatch[1]);
    }
    return interpolateSandboxString(value, false);
  }
  if (Array.isArray(value)) {
    return value.map((item) => interpolateSandboxValue(item));
  }
  if (value && typeof value === "object") {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = interpolateSandboxValue(v);
    }
    return out;
  }
  return value;
}

function buildToolSandboxRequest(params: {
  url: string;
  method: "GET" | "POST" | "PUT";
  bodyTemplate?: any;
  testBody?: any;
  inputSchema?: Record<string, any> | null;
}): { url: string; method: "GET" | "POST" | "PUT"; body: any } {
  const method = params.method;
  let testUrl = String(params.url || "").trim();
  if (/\{\{[^}]+\}\}/.test(testUrl)) {
    testUrl = interpolateSandboxString(testUrl, true);
  }

  const rawCandidate = params.testBody !== undefined ? params.testBody : params.bodyTemplate;
  let interpolatedBody = rawCandidate !== undefined && rawCandidate !== null
    ? interpolateSandboxValue(rawCandidate)
    : undefined;

  if (method === "GET") {
    if (interpolatedBody && typeof interpolatedBody === "object" && !Array.isArray(interpolatedBody)) {
      try {
        const parsedUrl = new URL(testUrl);
        for (const [k, v] of Object.entries(interpolatedBody)) {
          if (v === undefined || v === null) continue;
          if (!parsedUrl.searchParams.has(k)) {
            parsedUrl.searchParams.set(k, typeof v === "object" ? JSON.stringify(v) : String(v));
          }
        }
        testUrl = parsedUrl.toString();
      } catch {}
    }
    return { url: testUrl, method, body: undefined };
  }

  const isEmptyObj =
    interpolatedBody === undefined ||
    interpolatedBody === null ||
    (typeof interpolatedBody === "object" && !Array.isArray(interpolatedBody) && Object.keys(interpolatedBody).length === 0) ||
    (typeof interpolatedBody === "string" && interpolatedBody.trim() === "");

  if (isEmptyObj && params.inputSchema && typeof params.inputSchema === "object") {
    const schemaKeys = Object.keys(params.inputSchema).map((k) => k.toLowerCase());
    if (schemaKeys.includes("phone") || schemaKeys.includes("numero")) {
      interpolatedBody = { phone: "584120000000" };
    }
  }

  return {
    url: testUrl,
    method,
    body: interpolatedBody !== undefined ? interpolatedBody : {},
  };
}

function formatSandboxSampleExcerpt(sample: any): string {
  if (sample === null || sample === undefined) return "";
  try {
    const raw = typeof sample === "string" ? sample : JSON.stringify(sample);
    const clean = raw.replace(/\s+/g, " ").trim();
    if (!clean) return "";
    return clean.length > 250 ? `${clean.slice(0, 250)}...` : clean;
  } catch {
    return "";
  }
}

/**
 * Obtiene la sesión activa más reciente del Copilot o crea una nueva
 */
export const getOrCreateCopilotSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    agentId?: string | null;
    tipo?: string;
    forceNew?: boolean;
  }) => ({
    agentId: d?.agentId || null,
    tipo: d?.tipo || "qualificacao",
    forceNew: Boolean(d?.forceNew),
  }))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const companyId = await requireAdminCompany(supabase, userId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { resolveTargetAgent, sanitizeCopilotProposalsForStorage } = await import("./agent-copilot.server");
    const cfg = await resolveTargetAgent(supabaseAdmin, companyId, data.agentId, data.tipo);

    if (!data.forceNew) {
      const { data: existingSession } = await (supabaseAdmin as any)
        .from("agent_copilot_sessions")
        .select("id, company_id, agent_id, user_id, title, created_at, updated_at")
        .eq("company_id", companyId)
        .eq("agent_id", cfg.id)
        .eq("user_id", userId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingSession?.id) {
        const { data: msgRows } = await (supabaseAdmin as any)
          .from("agent_copilot_messages")
          .select("id, role, content, proposals, created_at")
          .eq("session_id", existingSession.id)
          .eq("company_id", companyId)
          .order("created_at", { ascending: false })
          .limit(40);

        const messages: CopilotChatMessage[] = ((msgRows ?? []).slice().reverse()).map((m: any) => ({
          id: m.id,
          role: m.role === "user" ? "user" : "assistant",
          content: String(m.content || ""),
          proposals: Array.isArray(m.proposals) ? sanitizeCopilotProposalsForStorage(m.proposals) : [],
          createdAt: m.created_at,
        }));

        return {
          session: existingSession,
          messages,
        };
      }
    }

    const { data: createdSession, error: createErr } = await (supabaseAdmin as any)
      .from("agent_copilot_sessions")
      .insert({
        company_id: companyId,
        agent_id: cfg.id,
        user_id: userId,
        title: "Nueva sesión",
      })
      .select("id, company_id, agent_id, user_id, title, created_at, updated_at")
      .single();

    if (createErr || !createdSession) {
      throw new Error(`No se pudo crear la sesión del Copilot: ${createErr?.message || "Error"}`);
    }

    return {
      session: createdSession,
      messages: [] as CopilotChatMessage[],
    };
  });

/**
 * Actualiza el estado (applied / failed / pending) y resultado de Sandbox en una propuesta persistida
 */
export const updateCopilotMessageProposalState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    messageId: string;
    proposalIndex: number;
    status: "pending" | "applied" | "rejected" | "failed";
    sandboxResult?: any;
  }) => {
    if (!d?.messageId) throw new Error("messageId es obligatorio.");
    const idx = Number(d?.proposalIndex);
    if (!Number.isInteger(idx) || idx < 0) throw new Error("proposalIndex inválido.");
    const status = d?.status;
    if (!["pending", "applied", "rejected", "failed"].includes(status)) {
      throw new Error("Estado de propuesta inválido.");
    }
    return {
      messageId: String(d.messageId).trim(),
      proposalIndex: idx,
      status,
      sandboxResult: d.sandboxResult,
    };
  })
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const companyId = await requireAdminCompany(supabase, userId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const {
      sanitizeCopilotProposalsForStorage,
      sanitizeSandboxResultForStorage,
    } = await import("./agent-copilot.server");

    const { data: msgRow, error: fetchErr } = await (supabaseAdmin as any)
      .from("agent_copilot_messages")
      .select("id, session_id, proposals")
      .eq("id", data.messageId)
      .eq("company_id", companyId)
      .maybeSingle();

    if (fetchErr || !msgRow) {
      throw new Error("Mensaje del Copilot no encontrado.");
    }

    const currentProposals = Array.isArray(msgRow.proposals) ? [...msgRow.proposals] : [];
    if (!currentProposals[data.proposalIndex]) {
      return { ok: true, proposals: sanitizeCopilotProposalsForStorage(currentProposals) };
    }

    const updatedItem = { ...currentProposals[data.proposalIndex], status: data.status };
    if (data.sandboxResult !== undefined) {
      updatedItem.sandboxResult = sanitizeSandboxResultForStorage(data.sandboxResult);
    }
    currentProposals[data.proposalIndex] = updatedItem;

    const sanitizedProposals = sanitizeCopilotProposalsForStorage(currentProposals);

    const { error: updErr } = await (supabaseAdmin as any)
      .from("agent_copilot_messages")
      .update({ proposals: sanitizedProposals })
      .eq("id", msgRow.id)
      .eq("company_id", companyId);

    if (updErr) {
      throw new Error(`No se pudo actualizar la propuesta: ${updErr.message}`);
    }

    return { ok: true, proposals: sanitizedProposals };
  });

/**
 * Consulta interactiva al Copilot Arquitecto y Entrenador
 */
export const askAgentCopilot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    messages: CopilotChatMessage[];
    agentId?: string | null;
    tipo?: string;
    sessionId?: string | null;
  }) => {
    if (!Array.isArray(d?.messages) || d.messages.length === 0) {
      throw new Error("Mensagem inválida.");
    }
    return {
      messages: d.messages,
      agentId: d.agentId || null,
      tipo: d.tipo || "qualificacao",
      sessionId: d.sessionId ? String(d.sessionId).trim() : null,
    };
  })
  .handler(async ({ context, data }): Promise<CopilotTurnResult> => {
    const { supabase, userId } = context;
    const companyId = await requireAdminCompany(supabase, userId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const {
      redactCopilotSecretsInText,
      sanitizeCopilotProposalsForStorage,
    } = await import("./agent-copilot.server");

    // 1. Obtém contexto completo do agente e catálogo
    const agentCtx = await getAgentCopilotContext(supabase, companyId, data.agentId, data.tipo);
    const systemPrompt = buildCopilotSystemPrompt(agentCtx);
    const resolvedAgentId = (agentCtx.agent as any)?.id || data.agentId;

    // 2. Resolver o crear sesión persistente en PostgreSQL
    let sessionId: string | null = data.sessionId || null;
    let currentTitle: string | null = null;

    if (sessionId && resolvedAgentId) {
      try {
        const { data: existingSession } = await (supabaseAdmin as any)
          .from("agent_copilot_sessions")
          .select("id, title")
          .eq("id", sessionId)
          .eq("company_id", companyId)
          .eq("agent_id", resolvedAgentId)
          .eq("user_id", userId)
          .maybeSingle();
        if (existingSession?.id) {
          currentTitle = existingSession.title ?? null;
        } else {
          sessionId = null;
        }
      } catch {
        sessionId = null;
      }
    } else {
      sessionId = null;
    }

    if (!sessionId && resolvedAgentId) {
      try {
        const { data: createdSession } = await (supabaseAdmin as any)
          .from("agent_copilot_sessions")
          .insert({
            company_id: companyId,
            agent_id: resolvedAgentId,
            user_id: userId,
            title: "Nueva sesión",
          })
          .select("id, title")
          .single();
        if (createdSession?.id) {
          sessionId = createdSession.id;
          currentTitle = createdSession.title ?? null;
        }
      } catch {}
    }

    // 3. Ventana deslizante de los últimos 16 mensajes para evitar degradación y timeouts
    const windowedMessages = data.messages.slice(-16);
    const historyMsgs: ChatMsg[] = windowedMessages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    // 4. Modelo desacoplado del bot (prioridad global_ai_config.copilot_* -> global_* -> agente -> default)
    const { provider, model } = await resolveCopilotModelConfig(supabaseAdmin, agentCtx.agent);

    // 5. Executa chat com a IA nativa do sistema protegida por semáforo de concorrência
    const { lovableAiChat } = await import("./lovable-ai.server");
    const { globalAiLimiter } = await import("./ai-limiter.server");
    const rawOutput = await globalAiLimiter.schedule(
      () =>
        lovableAiChat(
          [
            { role: "system", content: systemPrompt },
            ...historyMsgs,
          ],
          {
            provider,
            model,
            maxTokens: 8192,
            temperature: 0.2,
            telemetry: {
              companyId,
              userId,
              agentId: resolvedAgentId || null,
              feature: "agent_copilot",
            },
          },
        ),
      1,
    );

    // 6. Parsea saída e ações estruturadas
    const parsed = parseCopilotOutput(rawOutput);

    // 7. Persiste turno (siempre redactando tokens/headers antes de guardar)
    let userMessageId: string | null = null;
    let assistantMessageId: string | null = null;
    const latestMsg = data.messages[data.messages.length - 1];

    if (sessionId) {
      const nowIso = new Date().toISOString();
      if (latestMsg?.role === "user") {
        try {
          const safeUserText = redactCopilotSecretsInText(latestMsg.content);
          const { data: insUser } = await (supabaseAdmin as any)
            .from("agent_copilot_messages")
            .insert({
              session_id: sessionId,
              company_id: companyId,
              role: "user",
              content: safeUserText,
              proposals: [],
            })
            .select("id")
            .single();
          userMessageId = insUser?.id ?? null;
        } catch {}
      }

      try {
        const safeReply = redactCopilotSecretsInText(parsed.reply);
        const safeProposals = sanitizeCopilotProposalsForStorage(parsed.proposals);
        const { data: insAsst } = await (supabaseAdmin as any)
          .from("agent_copilot_messages")
          .insert({
            session_id: sessionId,
            company_id: companyId,
            role: "assistant",
            content: safeReply,
            proposals: safeProposals,
          })
          .select("id")
          .single();
        assistantMessageId = insAsst?.id ?? null;
      } catch {}

      try {
        const sessionUpdate: Record<string, any> = { updated_at: nowIso };
        if ((!currentTitle || currentTitle === "Nueva sesión") && latestMsg?.role === "user") {
          const derivedTitle = redactCopilotSecretsInText(latestMsg.content)
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 72);
          if (derivedTitle) sessionUpdate.title = derivedTitle;
        }
        await (supabaseAdmin as any)
          .from("agent_copilot_sessions")
          .update(sessionUpdate)
          .eq("id", sessionId)
          .eq("company_id", companyId);
      } catch {}
    }

    return {
      sessionId: sessionId || undefined,
      userMessageId,
      assistantMessageId,
      reply: parsed.reply,
      proposals: parsed.proposals,
    };
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
    test_body?: any;
    testBody?: any;
    sample_body?: any;
    body_template?: any;
    input_schema?: Record<string, any> | null;
  }) => {
    if (!d?.url) throw new Error("URL é obrigatória para o teste de sandbox.");
    return d;
  })
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    await requireAdminCompany(supabase, userId);
    const { testExternalWebhook } = await import("./agent-sandbox.server");
    const rawMethod = String(data.method || "POST").toUpperCase();
    const method = (rawMethod === "GET" || rawMethod === "PUT" ? rawMethod : "POST") as "GET" | "POST" | "PUT";
    const reqSpec = buildToolSandboxRequest({
      url: data.url,
      method,
      bodyTemplate: data.body_template,
      testBody: data.test_body ?? data.testBody ?? data.sample_body ?? data.body,
      inputSchema: data.input_schema,
    });
    return await testExternalWebhook({
      url: reqSpec.url,
      method: reqSpec.method,
      headers: data.headers,
      body: reqSpec.body,
    });
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

      try {
        const { recordAgentConfigVersion } = await import("./agent-versions.server");
        await recordAgentConfigVersion(supabaseAdmin, {
          companyId,
          agentId: cfg.id,
          userId,
          label: "Copilot: Regla añadida",
        });
      } catch {}

      // Registrar auditoria
      try {
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
      } catch {}

      return { ok: true, message: "Regra aplicada com sucesso às Regras Rígidas!" };
    }

    if (action.type === "replace_rules") {
      const rulesText = typeof action.payload?.rulesText === "string"
        ? action.payload.rulesText.trim()
        : "";
      if (!rulesText) {
        throw new Error("El texto consolidado de reglas (rulesText) no puede estar vacío.");
      }

      const reason = String(action.payload?.reason || "").trim();

      // Guardar snapshot previo antes de reemplazar para permitir rollback en 1 clic
      try {
        const { recordAgentConfigVersion } = await import("./agent-versions.server");
        await recordAgentConfigVersion(supabaseAdmin, {
          companyId,
          agentId: cfg.id,
          userId,
          label: "Respaldo antes de Copilot (replace_rules)",
        });
      } catch {}

      const nowIso = new Date().toISOString();
      const { error: upErr } = await (supabaseAdmin as any)
        .from("agent_config")
        .update({ regras_rigidas: rulesText, updated_at: nowIso })
        .eq("id", cfg.id);

      if (upErr) throw new Error(`Falha ao substituir regras rígidas: ${upErr.message}`);

      try {
        await supabaseAdmin.from("audit_log").insert({
          company_id: companyId,
          user_id: userId,
          acao: "copilot_rules_replaced",
          detalhes: {
            agent_id: cfg.id,
            reason: reason || null,
            prev_chars: String(cfg.regras_rigidas || "").length,
            new_chars: rulesText.length,
            applied_at: nowIso,
          },
        });
      } catch {}

      return {
        ok: true,
        message: "Reglas Rígidas consolidadas y reemplazadas con respaldo automático de versión.",
      };
    }

    if (action.type === "catalog") {
      const items = Array.isArray(action.payload?.items) ? action.payload.items : [];
      if (items.length === 0) throw new Error("Nenhum produto para inserir.");

      const { data: existingProds, error: listProdErr } = await (supabaseAdmin as any)
        .from("produto")
        .select("id, nome, sku, ordem")
        .eq("company_id", companyId)
        .order("ordem", { ascending: true });

      if (listProdErr) {
        throw new Error(`Falha ao consultar catálogo atual: ${listProdErr.message}`);
      }

      const bySku = new Map<string, any>();
      const byNome = new Map<string, any>();
      let maxOrdem = -1;

      for (const row of existingProds || []) {
        const skuKey = String(row.sku || "").trim().toLowerCase();
        const nomeKey = String(row.nome || "").trim().toLowerCase();
        if (skuKey && !bySku.has(skuKey)) bySku.set(skuKey, row);
        if (nomeKey && !byNome.has(nomeKey)) byNome.set(nomeKey, row);
        if (typeof row.ordem === "number" && row.ordem > maxOrdem) {
          maxOrdem = row.ordem;
        }
      }

      const nowIso = new Date().toISOString();
      let updatedCount = 0;
      let insertedCount = 0;
      const savedProds: Array<{ id: string; nome: string; preco: number; action: "updated" | "inserted" }> = [];

      for (const item of items) {
        const nome = String(item?.nome || "Produto").trim();
        const cleanSku = item?.sku ? String(item.sku).trim() : "";
        const skuKey = cleanSku.toLowerCase();
        const nomeKey = nome.toLowerCase();
        const preco = Math.max(0, Number(item?.preco) || 0);
        const descricao = item?.descricao ? String(item.descricao).trim() : null;
        const categoria = item?.categoria ? String(item.categoria).trim() : "Geral";

        const existingMatch = (skuKey ? bySku.get(skuKey) : null) || byNome.get(nomeKey) || null;

        if (existingMatch?.id) {
          const updatePatch: Record<string, any> = {
            nome,
            preco,
            descricao,
            categoria,
            ativo: true,
            updated_at: nowIso,
          };
          if (cleanSku) {
            updatePatch.sku = cleanSku;
          }

          const { data: updatedRow, error: updErr } = await (supabaseAdmin as any)
            .from("produto")
            .update(updatePatch)
            .eq("id", existingMatch.id)
            .eq("company_id", companyId)
            .select("id, nome, preco")
            .single();

          if (updErr) {
            throw new Error(`Falha ao atualizar produto "${nome}": ${updErr.message}`);
          }

          updatedCount += 1;
          savedProds.push({
            id: updatedRow?.id || existingMatch.id,
            nome: updatedRow?.nome || nome,
            preco: Number(updatedRow?.preco ?? preco),
            action: "updated",
          });
          if (skuKey) bySku.set(skuKey, { ...existingMatch, ...updatePatch });
          if (nomeKey) byNome.set(nomeKey, { ...existingMatch, ...updatePatch });
        } else {
          maxOrdem += 1;
          const insertRow: Record<string, any> = {
            company_id: companyId,
            nome,
            preco,
            descricao,
            categoria,
            ativo: true,
            ordem: maxOrdem,
          };
          if (cleanSku) {
            insertRow.sku = cleanSku;
          }

          const { data: insertedRow, error: insErr } = await (supabaseAdmin as any)
            .from("produto")
            .insert(insertRow)
            .select("id, nome, preco, sku, ordem")
            .single();

          if (insErr) {
            throw new Error(`Falha ao inserir produto "${nome}": ${insErr.message}`);
          }

          insertedCount += 1;
          savedProds.push({
            id: insertedRow.id,
            nome: insertedRow.nome,
            preco: Number(insertedRow.preco ?? preco),
            action: "inserted",
          });
          if (skuKey) bySku.set(skuKey, insertedRow);
          if (nomeKey) byNome.set(nomeKey, insertedRow);
        }
      }

      try {
        await supabaseAdmin.from("audit_log").insert({
          company_id: companyId,
          user_id: userId,
          acao: "copilot_catalog_applied",
          detalhes: {
            itemsCount: items.length,
            updatedCount,
            insertedCount,
            saved: savedProds,
          },
        });
      } catch {}

      return {
        ok: true,
        message: `Catálogo actualizado: ${updatedCount} actualizado(s), ${insertedCount} nuevo(s).`,
      };
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
        const rawTestBody =
          action.payload?.test_body ??
          action.payload?.testBody ??
          action.payload?.sample_body ??
          action.payload?.body ??
          action.payload?.updates?.test_body ??
          action.payload?.updates?.body;

        const sandboxReq = buildToolSandboxRequest({
          url,
          method,
          bodyTemplate,
          testBody: rawTestBody,
          inputSchema,
        });

        const testRes = await testExternalWebhook({
          url: sandboxReq.url,
          method: sandboxReq.method,
          headers,
          body: sandboxReq.body,
        });
        if (!testRes.ok || testRes.status < 200 || testRes.status >= 300) {
          const sampleExcerpt = formatSandboxSampleExcerpt(testRes.responseSample);
          const sampleSuffix = sampleExcerpt ? ` | Respuesta: ${sampleExcerpt}` : "";
          throw new Error(
            `La prueba previa en Sandbox falló (HTTP ${testRes.status}): ${testRes.error || testRes.statusText}${sampleSuffix}. Corrige la URL o credenciales antes de guardar.`,
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
          try {
            const { recordAgentConfigVersion } = await import("./agent-versions.server");
            await recordAgentConfigVersion(supabaseAdmin, {
              companyId,
              agentId: cfg.id,
              userId,
              label: "Copilot: Directiva aplicada",
            });
          } catch {}
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

      try {
        const { recordAgentConfigVersion } = await import("./agent-versions.server");
        await recordAgentConfigVersion(supabaseAdmin, {
          companyId,
          agentId: cfg.id,
          userId,
          label: "Copilot: Ajuste de configuración",
        });
      } catch {}

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
      throw new Error(error.message || "Error al listar herramientas.");
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
    if (!d?.toolId) throw new Error("El ID de la herramienta es obligatorio.");
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
      throw new Error(error.message || "Error al actualizar herramienta.");
    }
    if (!updated) {
      throw new Error("Herramienta no encontrada.");
    }

    return { ok: true, id: updated.id, active: updated.active };
  });

/**
 * Elimina una herramienta externa del agente
 */
export const deleteAgentTool = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { toolId: string }) => {
    if (!d?.toolId) throw new Error("El ID de la herramienta es obligatorio.");
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
      throw new Error(error.message || "Error al eliminar herramienta.");
    }

    return { ok: true };
  });
