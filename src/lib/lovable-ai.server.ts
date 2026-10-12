// Multi-provider AI chat. Gemini default via Lovable Gateway (free for users).
// OpenAI e Anthropic usam a chave da própria empresa.

export interface ChatMsg {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AiProviderConfig {
  provider?: "gemini" | "openai" | "anthropic" | string;
  model?: string;
  openaiKey?: string;
  anthropicKey?: string;
}

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const IMAGE_GATEWAY = "https://ai.gateway.lovable.dev/v1/images/generations";
const MAX_TENTATIVAS = 3;

/** Remove mensagens vazias/nulas — a API rejeita content vazio com 400. */
function sanitizeMessages(messages: ChatMsg[]): ChatMsg[] {
  const out = messages
    .map((m) => ({ role: m.role, content: String(m?.content ?? "").trim() }))
    .filter((m) => m.content.length > 0);
  // garante que exista pelo menos uma mensagem de usuário
  if (!out.some((m) => m.role === "user")) out.push({ role: "user", content: "Olá" });
  return out;
}

async function fetchJson(url: string, init: RequestInit) {
  return fetch(url, init);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function lovableAiChat(
  messages: ChatMsg[],
  modelOrConfig: string | AiProviderConfig = "google/gemini-2.0-flash-exp",
): Promise<string> {
  const cfg: AiProviderConfig =
    typeof modelOrConfig === "string"
      ? { provider: "gemini", model: modelOrConfig }
      : modelOrConfig;
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

  // A configuração global do painel Master tem prioridade sobre a do agente.
  const provider = globalProvider || (cfg.provider || "openai").toLowerCase();

  if (provider === "openai" || provider === "drael") {
    const key = globalOpenAiKey?.trim() || cfg.openaiKey?.trim();
    if (!key) throw new Error("Chave de IA não configurada no painel Master (Sistema > Inteligência Artificial).");
    const isDrael = provider === "drael" || key.startsWith("dk-");
    const baseUrl = (gVal.base_url || process.env.OPENAI_BASE_URL || (isDrael ? "https://drael.sh/v1" : "https://api.openai.com/v1")).trim();
    const model = globalModel || cfg.model || (isDrael ? "drael-v1" : "gpt-4o-mini");
    return openAiChat(key, model, msgs, 0.1, baseUrl);
  }
  if (provider === "anthropic") {
    const key = globalAnthropicKey?.trim() || cfg.anthropicKey?.trim();
    if (!key) throw new Error("Chave Anthropic (Claude) não configurada.");
    const model = globalModel || cfg.model || "claude-3-5-sonnet-latest";
    return anthropicChat(key, model, msgs);
  }



  // default: Gemini via Lovable Gateway (com retry + fallback de modelo)
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY ausente.");
  const principal = cfg.model || "google/gemini-2.0-flash-exp";
  const fallback = "google/gemini-1.5-flash";

  let ultimoErro: Error | null = null;
  for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
    const model = tentativa >= 3 && principal !== fallback ? fallback : principal;
    try {
      const res = await fetchJson(GATEWAY, {
        method: "POST",
        headers: {
          "Lovable-API-Key": key,
          "Content-Type": "application/json",
          "X-Lovable-AIG-SDK": "fetch",
        },
        body: JSON.stringify({ model, messages: msgs }),
      });
      if (res.status === 402) throw new Error("Créditos de IA esgotados no workspace.");
      if (res.status === 429 || res.status >= 500) {
        ultimoErro = new Error(
          res.status === 429
            ? "Limite de uso da IA atingido. Tente em alguns minutos."
            : `Lovable AI indisponível (${res.status}).`,
        );
        if (tentativa < MAX_TENTATIVAS) {
          await sleep(600 * tentativa + Math.floor(Math.random() * 400));
          continue;
        }
        throw ultimoErro;
      }
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(`Lovable AI: ${res.status} ${t.slice(0, 200)}`);
      }
      const data = await res.json();
      const texto = data?.choices?.[0]?.message?.content?.toString().trim() || "";
      if (!texto) {
        ultimoErro = new Error("Resposta vazia da IA.");
        if (tentativa < MAX_TENTATIVAS) {
          await sleep(400 * tentativa);
          continue;
        }
        throw ultimoErro;
      }
      return texto;
    } catch (e: any) {
      ultimoErro = e;
      const recuperavel = /vazia|indisponível|Limite de uso/i.test(String(e?.message));
      if (!recuperavel || tentativa === MAX_TENTATIVAS) break;
      await sleep(600 * tentativa);
    }
  }
  throw ultimoErro ?? new Error("Falha desconhecida na IA.");
}


async function openAiChat(
  key: string,
  model: string,
  messages: ChatMsg[],
  temperature = 0.1,
  baseUrl = "https://api.openai.com/v1",
): Promise<string> {
  const url = `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
  const res = await fetchJson(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, temperature, presence_penalty: 0.2, frequency_penalty: 0.1 }),
  });
  if (!res.ok) {
    const t = await res.text();
    const providerName = baseUrl.includes("drael.sh") ? "Drael" : "OpenAI";
    throw new Error(`${providerName}: ${res.status} ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  return data?.choices?.[0]?.message?.content?.toString().trim() || "";
}

async function anthropicChat(key: string, model: string, messages: ChatMsg[]): Promise<string> {
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
    body: JSON.stringify({ model, max_tokens: 1024, system, messages: conv }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Anthropic: ${res.status} ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  const txt = (data?.content || [])
    .filter((p: any) => p?.type === "text")
    .map((p: any) => p.text)
    .join("\n")
    .trim();
  return txt;
}

export async function lovableAiImage(prompt: string): Promise<string> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY ausente.");

  const res = await fetchJson(IMAGE_GATEWAY, {
    method: "POST",
    headers: {
      "Lovable-API-Key": key,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt,
      n: 1,
      size: "1024x1024",
      response_format: "url",
    }),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Lovable AI Image: ${res.status} ${t.slice(0, 200)}`);
  }

  const data = await res.json();
  const url = data?.data?.[0]?.url;
  if (!url) throw new Error("A IA não retornou uma URL de imagem.");
  
  return url;
}
