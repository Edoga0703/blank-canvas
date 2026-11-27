// Multi-provider AI chat: Drael AI (drael.sh + Pool PostgreSQL), OpenAI direto, Anthropic direto, ou Google Gemini direto.
// Conexão ao gateway do Lovable permanentemente bloqueada para eliminar dependências e consumo de créditos.

import {
  acquirePoolSlotWithWait,
  cooldownPoolKey,
  recordAiUsageEvent,
  releasePoolSlot,
} from "./ai-pool.server";

export interface ChatMsg {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AiTelemetryContext {
  companyId?: string | null;
  userId?: string | null;
  agentId?: string | null;
  feature?: string;
}

export interface AiProviderConfig {
  provider?: "gemini" | "openai" | "anthropic" | "drael" | string;
  model?: string;
  openaiKey?: string;
  anthropicKey?: string;
  geminiKey?: string;
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
  telemetry?: AiTelemetryContext;
}

interface ChatCompletionResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

class AiHttpStatusError extends Error {
  status: number;
  bodyText: string;
  constructor(message: string, status: number, bodyText = "") {
    super(message);
    this.name = "AiHttpStatusError";
    this.status = status;
    this.bodyText = bodyText;
  }
}

const MAX_TENTATIVAS = 3;

/** Remove mensagens vazias/nulas — a API rejeita content vazio com 400. */
function sanitizeMessages(messages: ChatMsg[]): ChatMsg[] {
  const out = messages
    .map((m) => ({ role: m.role, content: String(m?.content ?? "").trim() }))
    .filter((m) => m.content.length > 0);
  if (!out.some((m) => m.role === "user")) out.push({ role: "user", content: "Olá" });
  return out;
}

async function fetchJson(url: string, init: RequestInit, timeoutMs = 30_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: init.signal || controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function sanitizeGatewayGeminiModel(model?: string): string {
  if (!model) return "gemini-3.5-flash-lite";
  const m = model.trim().replace(/^google\//, "");
  if (
    m === "gemini-1.5-flash" ||
    m === "gemini-1.5-pro" ||
    m === "gemini-2.0-flash" ||
    m === "gemini-2.0-flash-exp" ||
    m === "gemini-2.5-flash" ||
    m === "gemini-exp-1206"
  ) {
    return "gemini-3.5-flash-lite";
  }
  return m || "gemini-3.5-flash-lite";
}

function classifyDraelCooldownSeconds(errText: string): number {
  if (/in_flight|concurrent/i.test(errText)) return 12;
  if (/limit|quota|window/i.test(errText)) return 600;
  return 15;
}

export async function lovableAiChat(
  messages: ChatMsg[],
  modelOrConfig: string | AiProviderConfig = "drael-v1",
  telemetryArg?: AiTelemetryContext,
): Promise<string> {
  const cfg: AiProviderConfig =
    typeof modelOrConfig === "string"
      ? { provider: "drael", model: modelOrConfig }
      : modelOrConfig;
  const telemetry: AiTelemetryContext = {
    companyId: telemetryArg?.companyId ?? cfg.telemetry?.companyId ?? null,
    userId: telemetryArg?.userId ?? cfg.telemetry?.userId ?? null,
    agentId: telemetryArg?.agentId ?? cfg.telemetry?.agentId ?? null,
    feature: telemetryArg?.feature ?? cfg.telemetry?.feature ?? "chat_agent",
  };

  const msgs = sanitizeMessages(messages);

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: globalSettings } = await (supabaseAdmin as any)
    .from("master_settings")
    .select("value")
    .eq("key", "global_ai_config")
    .maybeSingle();

  const gVal = (globalSettings?.value as any) || {};
  const globalProvider = (gVal.ai_provider || process.env.GLOBAL_AI_PROVIDER || "").toLowerCase();
  const globalModel = gVal.ai_model || process.env.GLOBAL_AI_MODEL;
  const globalOpenAiKey = gVal.openai_api_key || process.env.OPENAI_API_KEY;
  const globalAnthropicKey = gVal.anthropic_api_key || process.env.ANTHROPIC_API_KEY;
  const globalGeminiKey = cfg.geminiKey?.trim() || gVal.gemini_api_key || process.env.GEMINI_API_KEY;

  const globalDraelKey =
    gVal.drael_api_key ||
    (globalOpenAiKey?.startsWith("dk-") ? globalOpenAiKey : "") ||
    process.env.DRAEL_API_KEY;

  const provider = (
    cfg.provider && cfg.provider !== "default"
      ? cfg.provider
      : globalProvider || (globalDraelKey ? "drael" : globalOpenAiKey ? "openai" : "drael")
  ).toLowerCase();

  const recordOk = (
    usedProvider: string,
    usedModel: string,
    res: ChatCompletionResult,
    startedAt: number,
    meta?: { keyId?: string | null; keyAlias?: string | null },
  ) =>
    recordAiUsageEvent({
      companyId: telemetry.companyId,
      userId: telemetry.userId,
      agentId: telemetry.agentId,
      provider: usedProvider,
      model: usedModel,
      keyId: meta?.keyId ?? null,
      keyAlias: meta?.keyAlias ?? null,
      feature: telemetry.feature,
      inputTokens: res.inputTokens,
      outputTokens: res.outputTokens,
      latencyMs: Date.now() - startedAt,
      status: "ok",
    });

  const recordFail = (
    usedProvider: string,
    usedModel: string,
    err: any,
    startedAt: number,
    meta?: { keyId?: string | null; keyAlias?: string | null; status?: "rate_limited" | "error" },
  ) =>
    recordAiUsageEvent({
      companyId: telemetry.companyId,
      userId: telemetry.userId,
      agentId: telemetry.agentId,
      provider: usedProvider,
      model: usedModel,
      keyId: meta?.keyId ?? null,
      keyAlias: meta?.keyAlias ?? null,
      feature: telemetry.feature,
      latencyMs: Date.now() - startedAt,
      status: meta?.status ?? (err?.status === 429 ? "rate_limited" : "error"),
      errorMessage: String(err?.message || err),
      creditsCharged: 0,
    });

  const runGeminiDirect = async (key: string, requestedModel?: string, temp = 0.2): Promise<string> => {
    const model = sanitizeGatewayGeminiModel(requestedModel);
    const t0 = Date.now();
    try {
      const res = await directGeminiChat(key, model, msgs, temp, cfg.maxTokens ?? 8192, cfg.jsonMode ?? false);
      await recordOk("gemini", model, res, t0);
      return res.text;
    } catch (err: any) {
      await recordFail("gemini", model, err, t0);
      throw err;
    }
  };

  const runDraelWithPool = async (requestedModel?: string): Promise<string> => {
    const baseUrl = (gVal.drael_base_url || gVal.base_url || process.env.DRAEL_BASE_URL || "https://drael.sh/v1").trim();
    const model =
      requestedModel && requestedModel !== "default" && !requestedModel.startsWith("google/")
        ? requestedModel
        : "drael-v1";

    const excludeKeyIds: string[] = [];
    let lastError: Error | null = null;
    let triedAnyKey = false;

    for (let keyAttempt = 1; keyAttempt <= 3; keyAttempt++) {
      const slot = await acquirePoolSlotWithWait("drael", {
        maxWaitMs: 8000,
        excludeKeyIds,
        leaseSeconds: 45,
      });

      // Fallback final a chave passada explicitamente em cfg se o pool e legacy estiverem vazios
      const activeKey = slot?.apiKey || (!triedAnyKey ? cfg.openaiKey?.trim() : "");
      if (!activeKey) break;

      triedAnyKey = true;
      const t0 = Date.now();
      try {
        const res = await openAiChat(
          activeKey,
          model,
          msgs,
          cfg.temperature ?? 0.1,
          baseUrl,
          cfg.maxTokens ?? 8192,
          cfg.jsonMode ?? false,
          { disable429InternalRetries: true },
        );
        await recordOk("drael", model, res, t0, {
          keyId: slot?.keyId ?? null,
          keyAlias: slot?.alias ?? null,
        });
        return res.text;
      } catch (err: any) {
        lastError = err;
        const statusCode = err?.status;
        if (statusCode === 429) {
          const rawErr = String(err?.bodyText || err?.message || "");
          const cooldownSeconds = classifyDraelCooldownSeconds(rawErr);
          if (slot?.keyId) {
            await cooldownPoolKey(slot.keyId, cooldownSeconds, rawErr);
            excludeKeyIds.push(slot.keyId);
          } else {
            excludeKeyIds.push("legacy-master");
          }
          await recordFail("drael", model, err, t0, {
            keyId: slot?.keyId ?? null,
            keyAlias: slot?.alias ?? null,
            status: "rate_limited",
          });
          if (!slot?.keyId) break;
          continue;
        }

        await recordFail("drael", model, err, t0, {
          keyId: slot?.keyId ?? null,
          keyAlias: slot?.alias ?? null,
          status: "error",
        });
        throw err;
      } finally {
        await releasePoolSlot(slot?.leaseId);
      }
    }

    // Failover transparente para Gemini Direto se todas as contas Drael estiverem em cooldown/ocupadas
    if (globalGeminiKey) {
      console.warn("[ai-pool] Todas as contas Drael indisponíveis ou em cooldown. Acionando failover transparente para Gemini.");
      return runGeminiDirect(globalGeminiKey, "gemini-3.5-flash-lite", cfg.temperature ?? 0.2);
    }

    if (lastError) throw lastError;
    throw new Error("Chave Drael (dk-...) não configurada no painel Master (Sistema > Inteligência Artificial ou Pool Drael).");
  };

  // 1. Provedor Drael AI (drael.sh / pool por turnos)
  if (provider === "drael") {
    const reqModel =
      cfg.model && cfg.model !== "default" && !cfg.model.startsWith("google/")
        ? cfg.model
        : globalModel && !globalModel.startsWith("google/")
          ? globalModel
          : "drael-v1";
    return runDraelWithPool(reqModel);
  }

  // 2. Provedor OpenAI direto (api.openai.com)
  if (provider === "openai") {
    const customKey =
      (globalOpenAiKey && !globalOpenAiKey.startsWith("dk-") ? globalOpenAiKey.trim() : null) ||
      cfg.openaiKey?.trim();
    if (!customKey) {
      return runDraelWithPool("drael-v1");
    }
    const baseUrl = (gVal.base_url || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").trim();
    const model =
      cfg.model && cfg.model !== "default" && !cfg.model.startsWith("google/") && !cfg.model.startsWith("openai/")
        ? cfg.model
        : globalModel && !globalModel.startsWith("google/")
          ? globalModel
          : "gpt-4o-mini";
    const t0 = Date.now();
    try {
      const res = await openAiChat(customKey, model, msgs, cfg.temperature ?? 0.1, baseUrl, cfg.maxTokens ?? 8192, cfg.jsonMode ?? false);
      await recordOk("openai", model, res, t0);
      return res.text;
    } catch (err: any) {
      await recordFail("openai", model, err, t0);
      throw err;
    }
  }

  // 3. Provedor Anthropic direto (api.anthropic.com)
  if (provider === "anthropic") {
    const customKey = globalAnthropicKey?.trim() || cfg.anthropicKey?.trim();
    if (!customKey) {
      throw new Error("Chave Anthropic (Claude) não configurada no painel Master.");
    }
    const model = cfg.model || globalModel || "claude-3-5-sonnet-latest";
    const t0 = Date.now();
    try {
      const res = await anthropicChat(customKey, model, msgs);
      await recordOk("anthropic", model, res, t0);
      return res.text;
    } catch (err: any) {
      await recordFail("anthropic", model, err, t0);
      throw err;
    }
  }

  // 4. Provedor Google Gemini direto (generativelanguage.googleapis.com)
  if (provider === "gemini") {
    if (globalGeminiKey) {
      const rawModel = cfg.model || globalModel || "gemini-3.5-flash-lite";
      return runGeminiDirect(globalGeminiKey, rawModel, cfg.temperature ?? 0.2);
    }
    try {
      return await runDraelWithPool("drael-v1");
    } catch (draelErr: any) {
      if (globalOpenAiKey && !globalOpenAiKey.startsWith("dk-")) {
        const t0 = Date.now();
        try {
          const res = await openAiChat(globalOpenAiKey, "gpt-4o-mini", msgs, cfg.temperature ?? 0.1, "https://api.openai.com/v1", cfg.maxTokens ?? 8192, cfg.jsonMode ?? false);
          await recordOk("openai", "gpt-4o-mini", res, t0);
          return res.text;
        } catch (err: any) {
          await recordFail("openai", "gpt-4o-mini", err, t0);
          throw err;
        }
      }
      throw new Error(
        draelErr?.message ||
          "Chave do Google Gemini (GEMINI_API_KEY) não configurada no Master. A conexão ao gateway do Lovable está permanentemente bloqueada para proteger seus créditos.",
      );
    }
  }

  // 5. Fallback final para Drael (com pool)
  return runDraelWithPool("drael-v1");
}

/** Chamada direta à API do Google Gemini (generativelanguage.googleapis.com) - Zero dependência do Lovable */
async function directGeminiChat(
  key: string,
  model: string,
  messages: ChatMsg[],
  temperature = 0.2,
  maxOutputTokens = 8192,
  jsonMode = false,
): Promise<ChatCompletionResult> {
  let cleanModel = sanitizeGatewayGeminiModel(model);
  const getUrl = (m: string) => `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${encodeURIComponent(key)}`;

  const systemMsg = messages.find((m) => m.role === "system");
  const contents = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

  if (contents.length === 0) {
    contents.push({ role: "user", parts: [{ text: "Olá" }] });
  }

  const generationConfig: any = {
    temperature,
    maxOutputTokens,
  };
  if (jsonMode) {
    generationConfig.responseMimeType = "application/json";
  }

  const payload: any = {
    contents,
    generationConfig,
  };

  if (systemMsg?.content) {
    payload.systemInstruction = {
      parts: [{ text: systemMsg.content }],
    };
  }

  for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
    try {
      let res = await fetchJson(
        getUrl(cleanModel),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
        30_000,
      );

      if ((res.status === 404 || res.status === 503) && cleanModel !== "gemini-3.5-flash-lite") {
        console.warn(`[Gemini Direct] Modelo '${cleanModel}' retornou ${res.status} no Google AI Studio. Fazendo fallback automático para 'gemini-3.5-flash-lite'...`);
        cleanModel = "gemini-3.5-flash-lite";
        res = await fetchJson(
          getUrl(cleanModel),
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          },
          30_000,
        );
      }

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new AiHttpStatusError(`Google Gemini Direto: ${res.status} ${errText.slice(0, 200)}`, res.status, errText);
      }

      const data: any = await res.json();
      const candidate = data?.candidates?.[0];
      const parts = candidate?.content?.parts || [];
      const text = parts.map((p: any) => p.text || "").join("").trim();
      if (!text) {
        const finishReason = candidate?.finishReason;
        throw new Error(`Google Gemini: resposta vazia (finishReason: ${finishReason || "desconhecido"}).`);
      }
      return {
        text,
        inputTokens: Number(data?.usageMetadata?.promptTokenCount ?? 0),
        outputTokens: Number(data?.usageMetadata?.candidatesTokenCount ?? 0),
      };
    } catch (err: any) {
      if (tentativa === MAX_TENTATIVAS) throw err;
      await sleep(600 * tentativa);
    }
  }

  throw new Error("Falha ao comunicar com Google Gemini Direto.");
}

async function openAiChat(
  key: string,
  model: string,
  messages: ChatMsg[],
  temperature = 0.1,
  baseUrl = "https://api.openai.com/v1",
  maxTokens = 8192,
  jsonMode = false,
  opts?: { disable429InternalRetries?: boolean },
): Promise<ChatCompletionResult> {
  const url = `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
  const isDrael = baseUrl.includes("drael.sh") || key.startsWith("dk-");
  const payload: Record<string, any> = {
    model,
    messages,
    temperature,
    max_tokens: maxTokens,
    presence_penalty: 0.2,
    frequency_penalty: 0.1,
  };
  if (jsonMode) {
    payload.response_format = { type: "json_object" };
  }
  if (isDrael) {
    payload.tools = [];
  }

  const MAX_RETRIES = 3;
  let lastError: Error | null = null;
  const providerName = isDrael ? "Drael" : "OpenAI";

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetchJson(
        url,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
        25_000,
      );

      if (res.status === 429) {
        const errBody = await res.text().catch(() => "");
        const err429 = new AiHttpStatusError(
          `${providerName}: 429 (${errBody.slice(0, 140) || "límite de velocidad"})`,
          429,
          errBody,
        );
        if (opts?.disable429InternalRetries) {
          throw err429;
        }
        const retryHeader = res.headers.get("retry-after");
        const delayMs = retryHeader
          ? parseInt(retryHeader, 10) * 1000
          : Math.pow(2, attempt) * 800 + Math.floor(Math.random() * 400);
        console.warn(`[AI RateLimit] ${providerName} retornó 429. Reintento ${attempt}/${MAX_RETRIES} en ${delayMs}ms...`);
        lastError = err429;
        if (attempt < MAX_RETRIES) {
          await sleep(delayMs);
          continue;
        }
        throw err429;
      }

      if (res.status >= 500) {
        const retryHeader = res.headers.get("retry-after");
        const delayMs = retryHeader
          ? parseInt(retryHeader, 10) * 1000
          : Math.pow(2, attempt) * 800 + Math.floor(Math.random() * 400);

        console.warn(`[AI RateLimit] ${providerName} retornó ${res.status}. Reintento ${attempt}/${MAX_RETRIES} en ${delayMs}ms...`);
        lastError = new AiHttpStatusError(`${providerName}: ${res.status} (sobrecarga temporal)`, res.status);

        if (attempt < MAX_RETRIES) {
          await sleep(delayMs);
          continue;
        }
        throw lastError;
      }

      if (!res.ok) {
        const t = await res.text().catch(() => "");
        if (isDrael && (res.status === 403 || t.includes("plan_required"))) {
          throw new AiHttpStatusError(
            "Drael AI (403 plan_required): O plano Pro/Max de 4 semanas no drael.sh precisa ser ativado ou renovado para utilizar a API. Nenhuma chamada foi enviada ao Lovable.",
            403,
            t,
          );
        }
        throw new AiHttpStatusError(`${providerName}: ${res.status} ${t.slice(0, 200)}`, res.status, t);
      }

      const data = await res.json();
      const choice = data?.choices?.[0]?.message;
      const content = choice?.content?.toString().trim() || "";
      if (!content && attempt < MAX_RETRIES) {
        await sleep(500 * attempt);
        continue;
      }
      return {
        text: content,
        inputTokens: Number(data?.usage?.prompt_tokens ?? 0),
        outputTokens: Number(data?.usage?.completion_tokens ?? 0),
      };
    } catch (err: any) {
      if (err instanceof AiHttpStatusError && err.status === 429 && opts?.disable429InternalRetries) {
        throw err;
      }
      lastError = err;
      const isRecoverable = /429|500|502|503|504|timeout|aborted|fetch failed/i.test(String(err?.message));
      if (!isRecoverable || attempt === MAX_RETRIES) break;
      const backoffMs = 1000 * attempt + Math.floor(Math.random() * 500);
      console.warn(`[AI Retrying] ${providerName} error recuperable (${err?.message}). Esperando ${backoffMs}ms...`);
      await sleep(backoffMs);
    }
  }

  throw lastError ?? new Error(`Fallo desconocido al conectar con ${providerName}.`);
}

async function anthropicChat(key: string, model: string, messages: ChatMsg[]): Promise<ChatCompletionResult> {
  const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const conv = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role, content: m.content }));
  const res = await fetchJson("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, max_tokens: 4096, system, messages: conv }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new AiHttpStatusError(`Anthropic: ${res.status} ${t.slice(0, 200)}`, res.status, t);
  }
  const data = await res.json();
  const txt = (data?.content || [])
    .filter((p: any) => p?.type === "text")
    .map((p: any) => p.text)
    .join("\n")
    .trim();
  return {
    text: txt,
    inputTokens: Number(data?.usage?.input_tokens ?? 0),
    outputTokens: Number(data?.usage?.output_tokens ?? 0),
  };
}

export async function lovableAiImage(prompt: string): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: globalSettings } = await (supabaseAdmin as any)
    .from("master_settings")
    .select("value")
    .eq("key", "global_ai_config")
    .maybeSingle();

  const gVal = (globalSettings?.value as any) || {};
  const openAiKey = gVal.openai_api_key || process.env.OPENAI_API_KEY;

  if (openAiKey && !openAiKey.startsWith("dk-")) {
    try {
      const res = await fetchJson(
        "https://api.openai.com/v1/images/generations",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${openAiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            prompt,
            n: 1,
            size: "1024x1024",
            model: "dall-e-3",
          }),
        },
        30_000,
      );
      if (res.ok) {
        const data = await res.json();
        const url = data?.data?.[0]?.url;
        if (url) return url;
      }
    } catch (e: any) {
      console.warn("[lovableAiImage] Error generating with OpenAI:", e?.message);
    }
  }

  const safeSeed = encodeURIComponent(prompt.slice(0, 30).trim() || "capiversa");
  return `https://api.dicebear.com/7.x/bottts/svg?seed=${safeSeed}`;
}
