import { isSafeUrl } from "@/lib/agent-sandbox.server";

export type ToolKind = "http" | "webhook_out";
export type ToolMethod = "GET" | "POST" | "PUT";
export type ToolPermissionLevel =
  | "read_only"
  | "write_confirm_customer"
  | "write_require_owner_approval";

export interface AgentToolRecord {
  id: string;
  company_id: string;
  agent_id: string;
  name: string;
  display_name: string;
  description: string;
  kind: ToolKind;
  method: ToolMethod;
  url: string;
  headers: Record<string, string>;
  input_schema: Record<string, any>;
  body_template: any;
  permission_level: ToolPermissionLevel;
  verified: boolean;
  verified_at: string | null;
  last_test_status: number | null;
  last_test_latency_ms: number | null;
  last_test_sample: any;
  active: boolean;
  created_at: string;
  updated_at: string;
}

const SENSITIVE_HEADER_KEYS = [
  "authorization",
  "x-api-key",
  "api-key",
  "token",
  "cookie",
  "secret",
];

const MAX_RESPONSE_CHARS = 4000;

/**
 * Enmascara headers sensibles antes de exponer herramientas a la UI, al prompt o a trazas.
 */
export function redactToolHeaders(
  headers: Record<string, any> | null | undefined,
): Record<string, string> {
  if (!headers || typeof headers !== "object" || Array.isArray(headers)) {
    return {};
  }
  const out: Record<string, string> = {};
  for (const [key, rawVal] of Object.entries(headers)) {
    const kLower = String(key || "").trim().toLowerCase();
    if (!kLower) continue;
    const isSensitive = SENSITIVE_HEADER_KEYS.some((needle) =>
      kLower === needle || kLower.includes(needle),
    );
    out[key] = isSensitive ? "***redacted***" : String(rawVal ?? "");
  }
  return out;
}

/**
 * Devuelve una copia segura de una herramienta con sus headers redactados.
 */
export function sanitizeToolForClient<T extends Record<string, any>>(tool: T): T {
  return {
    ...tool,
    headers: redactToolHeaders(tool?.headers),
  };
}

/**
 * Normaliza un slug técnico seguro para `agent_tools.name`.
 */
export function normalizeToolSlug(rawName: string, fallback = "custom_tool"): string {
  const cleaned = String(rawName || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
  return cleaned || fallback;
}

/**
 * Lista solo las herramientas activas y verificadas para el motor de IA.
 */
export async function listVerifiedToolsForAgent(
  admin: any,
  companyId: string,
  agentId: string,
): Promise<AgentToolRecord[]> {
  if (!companyId || !agentId) return [];
  try {
    const { data, error } = await admin
      .from("agent_tools")
      .select("*")
      .eq("company_id", companyId)
      .eq("agent_id", agentId)
      .eq("active", true)
      .eq("verified", true)
      .order("created_at", { ascending: true });

    if (error) {
      console.warn("[agent-tools] Error listing verified tools:", error.message);
      return [];
    }
    return (data ?? []) as AgentToolRecord[];
  } catch (err: any) {
    console.warn("[agent-tools] Exception listing verified tools:", err?.message);
    return [];
  }
}

function interpolateString(
  template: string,
  vars: Record<string, any>,
  urlEncodeValues: boolean,
): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_, key: string) => {
    const val = vars[key];
    if (val === undefined || val === null) return "";
    const str = typeof val === "object" ? JSON.stringify(val) : String(val);
    return urlEncodeValues ? encodeURIComponent(str) : str;
  });
}

function interpolateValue(value: any, vars: Record<string, any>): any {
  if (typeof value === "string") {
    const exactMatch = value.match(/^\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}$/);
    if (exactMatch && vars[exactMatch[1]] !== undefined) {
      return vars[exactMatch[1]];
    }
    return interpolateString(value, vars, false);
  }
  if (Array.isArray(value)) {
    return value.map((item) => interpolateValue(item, vars));
  }
  if (value && typeof value === "object") {
    const res: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) {
      res[k] = interpolateValue(v, vars);
    }
    return res;
  }
  return value;
}

function truncateToolData(rawText: string, contentType: string): any {
  const limitedText = rawText.slice(0, MAX_RESPONSE_CHARS);
  if (contentType.includes("application/json")) {
    try {
      const parsed = JSON.parse(rawText);
      const serialized = JSON.stringify(parsed);
      if (serialized.length <= MAX_RESPONSE_CHARS) {
        return parsed;
      }
      return limitedText;
    } catch {
      return limitedText;
    }
  }
  return limitedText;
}

export interface ExecuteVerifiedToolParams {
  companyId: string;
  agentId: string;
  toolName: string;
  args?: Record<string, any> | null;
  context?: Record<string, any> | null;
  ownerApproved?: boolean;
}

export interface ExecuteVerifiedToolResult {
  ok: boolean;
  status?: number;
  latencyMs?: number;
  data?: any;
  error?: string;
  requiresApproval?: boolean;
  requiresConfirmation?: boolean;
  reason?: string;
}

/**
 * Ejecuta de forma segura una herramienta HTTP previamente verificada y activa.
 */
export async function executeVerifiedTool(
  admin: any,
  params: ExecuteVerifiedToolParams,
): Promise<ExecuteVerifiedToolResult> {
  const { companyId, agentId, toolName, args, context } = params;
  if (!companyId || !agentId || !toolName) {
    return { ok: false, status: 400, latencyMs: 0, error: "invalid_tool_params" };
  }

  let tool: AgentToolRecord | null = null;
  try {
    const { data, error } = await admin
      .from("agent_tools")
      .select("*")
      .eq("company_id", companyId)
      .eq("agent_id", agentId)
      .eq("name", toolName)
      .eq("active", true)
      .eq("verified", true)
      .maybeSingle();

    if (error || !data) {
      return {
        ok: false,
        status: 404,
        latencyMs: 0,
        error: error?.message || "Herramienta no encontrada o no verificada.",
      };
    }
    tool = data as AgentToolRecord;
  } catch (err: any) {
    return {
      ok: false,
      status: 500,
      latencyMs: 0,
      error: err?.message || "Error consultando herramienta.",
    };
  }

  if (!isSafeUrl(tool.url)) {
    return {
      ok: false,
      status: 403,
      latencyMs: 0,
      error: "URL bloqueada por política de seguridad.",
    };
  }

  if (tool.permission_level === "write_require_owner_approval" && !params.ownerApproved) {
    return {
      ok: false,
      requiresApproval: true,
      reason: "owner_approval_required",
    };
  }

  const safeArgs = args && typeof args === "object" && !Array.isArray(args) ? args : {};
  if (tool.permission_level === "write_confirm_customer" && !safeArgs.customer_confirmed) {
    return {
      ok: false,
      requiresConfirmation: true,
      reason: "customer_confirmation_required",
    };
  }

  const templateVars: Record<string, any> = {
    ...(context && typeof context === "object" ? context : {}),
    ...safeArgs,
  };
  if (templateVars.numero && !templateVars.phone) {
    templateVars.phone = templateVars.numero;
  }
  if (templateVars.phone && !templateVars.numero) {
    templateVars.numero = templateVars.phone;
  }

  let targetUrl = tool.url.trim();
  if (/\{\{[^}]+\}\}/.test(targetUrl)) {
    targetUrl = interpolateString(targetUrl, templateVars, true);
  }

  const method = (String(tool.method || "POST").toUpperCase()) as ToolMethod;
  if (method === "GET") {
    try {
      const parsedUrl = new URL(targetUrl);
      const paramSource =
        tool.body_template && typeof tool.body_template === "object" && !Array.isArray(tool.body_template)
          ? interpolateValue(tool.body_template, templateVars)
          : safeArgs;
      for (const [k, v] of Object.entries(paramSource || {})) {
        if (k === "customer_confirmed" || v === undefined || v === null) continue;
        if (!parsedUrl.searchParams.has(k)) {
          parsedUrl.searchParams.set(k, typeof v === "object" ? JSON.stringify(v) : String(v));
        }
      }
      targetUrl = parsedUrl.toString();
    } catch {
      return { ok: false, status: 400, latencyMs: 0, error: "URL destino inválida." };
    }
  }

  if (!isSafeUrl(targetUrl)) {
    return {
      ok: false,
      status: 403,
      latencyMs: 0,
      error: "URL final bloqueada por política de seguridad.",
    };
  }

  const headers: Record<string, string> = {
    Accept: "application/json, text/plain, */*",
    "User-Agent": "Capiconversa-Agent-Tools/1.0",
    ...(tool.headers && typeof tool.headers === "object" ? tool.headers : {}),
  };

  let bodyStr: string | undefined;
  if (method === "POST" || method === "PUT") {
    const cleanArgs = { ...safeArgs };
    delete cleanArgs.customer_confirmed;
    const rawBody =
      tool.body_template !== null && tool.body_template !== undefined
        ? interpolateValue(tool.body_template, templateVars)
        : Object.keys(cleanArgs).length > 0
          ? cleanArgs
          : templateVars.phone
            ? { phone: templateVars.phone }
            : {};
    bodyStr = typeof rawBody === "string" ? rawBody : JSON.stringify(rawBody);
    const hasContentType = Object.keys(headers).some((k) => k.toLowerCase() === "content-type");
    if (!hasContentType) {
      headers["Content-Type"] = "application/json";
    }
  }

  const startedAt = Date.now();
  try {
    const res = await fetch(targetUrl, {
      method,
      headers,
      body: bodyStr,
      redirect: "manual",
      signal: AbortSignal.timeout(8000),
    });

    const latencyMs = Date.now() - startedAt;
    if (res.status >= 300 && res.status < 400) {
      return {
        ok: false,
        status: 403,
        latencyMs,
        data: null,
        error: `Redirección bloqueada por política de seguridad SSRF (HTTP ${res.status}).`,
      };
    }
    const contentType = res.headers.get("content-type") || "";
    const text = await res.text();
    const data = truncateToolData(text, contentType);

    return {
      ok: res.ok,
      status: res.status,
      latencyMs,
      data,
      error: res.ok ? undefined : `HTTP ${res.status}: ${res.statusText || "Error"}`,
    };
  } catch (err: any) {
    const latencyMs = Date.now() - startedAt;
    const isTimeout = err?.name === "TimeoutError" || err?.name === "AbortError";
    return {
      ok: false,
      status: isTimeout ? 408 : 500,
      latencyMs,
      data: null,
      error: isTimeout
        ? "Tiempo de espera agotado (8000ms)."
        : err?.message || "Fallo de conexión ejecutando herramienta.",
    };
  }
}

export interface OutboxDispatchResult {
  ok: boolean;
  outboxId: string;
  status: "pending" | "sent" | "failed";
  httpStatus: number | null;
  error?: string;
}

/**
 * Ejecuta el envío HTTP real de una fila del outbox y persiste su estado.
 */
export async function dispatchWebhookOutboxItem(
  admin: any,
  outboxRow: any,
): Promise<OutboxDispatchResult> {
  const outboxId = String(outboxRow?.id || "");
  const attempts = Number(outboxRow?.attempts || 0) + 1;
  const rawUrl = String(outboxRow?.url || "").trim();

  if (!isSafeUrl(rawUrl)) {
    try {
      await admin
        .from("agent_webhook_outbox")
        .update({
          status: "failed",
          http_status: 403,
          attempts,
          last_error: "URL bloqueada por política SSRF.",
        })
        .eq("id", outboxId);
    } catch {}
    return {
      ok: false,
      outboxId,
      status: "failed",
      httpStatus: 403,
      error: "URL bloqueada por política SSRF.",
    };
  }

  const method = String(outboxRow?.method || "POST").toUpperCase();
  const headers: Record<string, string> = {
    Accept: "application/json, text/plain, */*",
    "User-Agent": "Capiconversa-Webhook-Outbox/1.0",
    ...(outboxRow?.headers && typeof outboxRow.headers === "object" ? outboxRow.headers : {}),
  };

  let bodyStr: string | undefined;
  if (method === "POST" || method === "PUT") {
    bodyStr = JSON.stringify(outboxRow?.payload ?? {});
    const hasContentType = Object.keys(headers).some((k) => k.toLowerCase() === "content-type");
    if (!hasContentType) {
      headers["Content-Type"] = "application/json";
    }
  }

  try {
    const res = await fetch(rawUrl, {
      method,
      headers,
      body: bodyStr,
      redirect: "manual",
      signal: AbortSignal.timeout(6000),
    });

    if (res.status >= 300 && res.status < 400) {
      const ssrfErr = `Redirección bloqueada por política SSRF (HTTP ${res.status}).`;
      try {
        await admin
          .from("agent_webhook_outbox")
          .update({
            status: "failed",
            http_status: 403,
            attempts,
            last_error: ssrfErr,
            sent_at: null,
          })
          .eq("id", outboxId);
      } catch (updErr: any) {
        console.warn("[agent-tools] Failed updating outbox status:", updErr?.message);
      }
      return {
        ok: false,
        outboxId,
        status: "failed",
        httpStatus: 403,
        error: ssrfErr,
      };
    }

    let rawText = "";
    try {
      rawText = await res.text();
    } catch {}
    const errDetail = res.ok ? null : rawText.slice(0, 500) || `HTTP ${res.status}`;
    const finalStatus = res.ok ? "sent" : "failed";

    try {
      await admin
        .from("agent_webhook_outbox")
        .update({
          status: finalStatus,
          http_status: res.status,
          attempts,
          last_error: errDetail,
          sent_at: res.ok ? new Date().toISOString() : null,
        })
        .eq("id", outboxId);
    } catch (updErr: any) {
      console.warn("[agent-tools] Failed updating outbox status:", updErr?.message);
    }

    return {
      ok: res.ok,
      outboxId,
      status: finalStatus,
      httpStatus: res.status,
      error: errDetail || undefined,
    };
  } catch (err: any) {
    const isTimeout = err?.name === "TimeoutError" || err?.name === "AbortError";
    const httpStatus = isTimeout ? 408 : 500;
    const errorMsg = (isTimeout ? "Timeout 6000ms" : err?.message || "Network error").slice(0, 500);

    try {
      await admin
        .from("agent_webhook_outbox")
        .update({
          status: "failed",
          http_status: httpStatus,
          attempts,
          last_error: errorMsg,
        })
        .eq("id", outboxId);
    } catch {}

    return {
      ok: false,
      outboxId,
      status: "failed",
      httpStatus,
      error: errorMsg,
    };
  }
}

export interface EnqueueOutboxParams {
  companyId: string;
  agentId?: string | null;
  toolId?: string | null;
  numero?: string | null;
  inboundMessageId?: string | null;
  eventName: string;
  url: string;
  method?: string;
  headers?: Record<string, any>;
  payload?: Record<string, any>;
}

/**
 * Inserta en `agent_webhook_outbox` de forma idempotente (por `inbound_message_id` + `event_name`)
 * e intenta el despacho HTTP inmediato.
 */
export async function enqueueAndDispatchAgentWebhook(
  admin: any,
  params: EnqueueOutboxParams,
): Promise<OutboxDispatchResult & { deduplicated?: boolean }> {
  const cleanInboundId = params.inboundMessageId ? String(params.inboundMessageId).trim() : null;
  const cleanEvent = String(params.eventName || "webhook_event").trim();

  if (cleanInboundId) {
    try {
      const { data: existing } = await admin
        .from("agent_webhook_outbox")
        .select("*")
        .eq("company_id", params.companyId)
        .eq("inbound_message_id", cleanInboundId)
        .eq("event_name", cleanEvent)
        .maybeSingle();

      if (existing?.id) {
        if (existing.status === "sent") {
          return {
            ok: true,
            outboxId: existing.id,
            status: "sent",
            httpStatus: existing.http_status ?? 200,
            deduplicated: true,
          };
        }
        return await dispatchWebhookOutboxItem(admin, existing);
      }
    } catch {}
  }

  try {
    const { data: inserted, error: insErr } = await admin
      .from("agent_webhook_outbox")
      .insert({
        company_id: params.companyId,
        agent_id: params.agentId ?? null,
        tool_id: params.toolId ?? null,
        numero: params.numero ?? null,
        inbound_message_id: cleanInboundId,
        event_name: cleanEvent,
        url: params.url,
        method: (params.method || "POST").toUpperCase(),
        headers: params.headers && typeof params.headers === "object" ? params.headers : {},
        payload: params.payload && typeof params.payload === "object" ? params.payload : {},
        status: "pending",
      })
      .select("*")
      .single();

    if (insErr || !inserted) {
      return {
        ok: false,
        outboxId: "",
        status: "failed",
        httpStatus: null,
        error: insErr?.message || "No se pudo insertar en outbox.",
      };
    }

    return await dispatchWebhookOutboxItem(admin, inserted);
  } catch (err: any) {
    return {
      ok: false,
      outboxId: "",
      status: "failed",
      httpStatus: null,
      error: err?.message || "Excepción al encolar webhook en outbox.",
    };
  }
}
