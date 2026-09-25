import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ProviderTestResult = {
  provider: "uazapi" | "evolution";
  ok: boolean;
  step: string;
  status?: number;
  latencyMs: number;
  url?: string;
  tokenPreview?: string;
  message: string;
  details?: string;
};

export type UazapiTestResult = {
  ok: boolean;
  step: string;
  status?: number;
  latencyMs: number;
  url?: string;
  tokenPreview?: string;
  message: string;
  details?: string;
};

export const testUazapiConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<UazapiTestResult> => {
    const { data: isSuper } = await context.supabase.rpc("is_super_admin");
    if (!isSuper) throw new Error("Acesso restrito ao super admin");

    const rawUrl = process.env.UAZAPI_URL;
    const adminToken = process.env.UAZAPI_ADMIN_TOKEN;

    if (!rawUrl || !adminToken) {
      return {
        ok: false,
        step: "env",
        latencyMs: 0,
        message: "UAZAPI_URL ou UAZAPI_ADMIN_TOKEN não configurados nos segredos.",
      };
    }
    const url = rawUrl.replace(/\/+$/, "");
    const tokenPreview = `${adminToken.slice(0, 4)}…${adminToken.slice(-4)} (${adminToken.length} chars)`;

    const started = Date.now();
    let res: Response;
    try {
      res = await fetch(`${url}/instance/all`, {
        method: "GET",
        headers: {
          Accept: "application/json",
          admintoken: adminToken,
        },
      });
    } catch (e: any) {
      return {
        ok: false,
        step: "fetch",
        latencyMs: Date.now() - started,
        url,
        tokenPreview,
        message: `Não foi possível alcançar a Uazapi: ${e?.message || "erro de rede"}`,
      };
    }
    const latencyMs = Date.now() - started;
    const text = await res.text();
    let parsed: any = null;
    try { parsed = text ? JSON.parse(text) : null; } catch { parsed = { raw: text.slice(0, 500) }; }
    const detailsStr = parsed ? JSON.stringify(parsed).slice(0, 2000) : undefined;

    if (!res.ok) {
      const msg = res.status === 401 || res.status === 403
        ? "Credenciais inválidas — verifique UAZAPI_ADMIN_TOKEN."
        : `Uazapi respondeu HTTP ${res.status}.`;
      return { ok: false, step: "auth", status: res.status, latencyMs, url, tokenPreview, message: msg, details: detailsStr };
    }

    const count = Array.isArray(parsed) ? parsed.length : Array.isArray(parsed?.instances) ? parsed.instances.length : undefined;
    return {
      ok: true,
      step: "done",
      status: res.status,
      latencyMs,
      url,
      tokenPreview,
      message: count !== undefined ? `Conexão OK — ${count} instância(s) na conta.` : "Conexão OK.",
      details: detailsStr,
    };
  });

export const testEvolutionConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ProviderTestResult> => {
    const { data: isSuper } = await context.supabase.rpc("is_super_admin");
    if (!isSuper) throw new Error("Acesso restrito ao super admin");

    const rawUrl = process.env.EVOLUTION_API_URL;
    const apiKey = process.env.EVOLUTION_API_KEY;

    if (!rawUrl || !apiKey) {
      return {
        provider: "evolution",
        ok: false,
        step: "env",
        latencyMs: 0,
        message: "EVOLUTION_API_URL ou EVOLUTION_API_KEY não configurados nos segredos.",
      };
    }
    const url = rawUrl.replace(/\/+$/, "");
    const tokenPreview = `${apiKey.slice(0, 4)}…${apiKey.slice(-4)} (${apiKey.length} chars)`;

    const started = Date.now();
    let res: Response;
    try {
      res = await fetch(`${url}/instance/fetchInstances`, {
        method: "GET",
        headers: { Accept: "application/json", apikey: apiKey },
      });
    } catch (e: any) {
      return {
        provider: "evolution",
        ok: false,
        step: "fetch",
        latencyMs: Date.now() - started,
        url,
        tokenPreview,
        message: `Não foi possível alcançar a Evolution API: ${e?.message || "erro de rede"}`,
      };
    }
    const latencyMs = Date.now() - started;
    const text = await res.text();
    let parsed: any = null;
    try { parsed = text ? JSON.parse(text) : null; } catch { parsed = { raw: text.slice(0, 500) }; }
    const detailsStr = parsed ? JSON.stringify(parsed).slice(0, 2000) : undefined;

    if (!res.ok) {
      const msg = res.status === 401 || res.status === 403
        ? "Credenciais inválidas — verifique EVOLUTION_API_KEY."
        : `Evolution API respondeu HTTP ${res.status}.`;
      return { provider: "evolution", ok: false, step: "auth", status: res.status, latencyMs, url, tokenPreview, message: msg, details: detailsStr };
    }

    const count = Array.isArray(parsed) ? parsed.length : Array.isArray(parsed?.instances) ? parsed.instances.length : undefined;
    return {
      provider: "evolution",
      ok: true,
      step: "done",
      status: res.status,
      latencyMs,
      url,
      tokenPreview,
      message: count !== undefined ? `Conexão OK — ${count} instância(s) na conta.` : "Conexão OK.",
      details: detailsStr,
    };
  });
