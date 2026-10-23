import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ProviderTestResult = {
  provider: "dapi";
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

    const rawUrl = process.env.DAPI_BASE_URL || "https://api.d-api.cloud/api/v1";
    const apiKey = process.env.DAPI_API_KEY || "";

    if (!apiKey) {
      return {
        ok: false,
        step: "env",
        latencyMs: 0,
        message: "DAPI_API_KEY não configurada nos segredos.",
      };
    }
    const url = rawUrl.replace(/\/+$/, "");
    const tokenPreview = `${apiKey.slice(0, 4)}…${apiKey.slice(-4)} (${apiKey.length} chars)`;

    const started = Date.now();
    let res: Response;
    try {
      res = await fetch(`${url}/sessions`, {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: apiKey,
        },
      });
    } catch (e: any) {
      return {
        ok: false,
        step: "fetch",
        latencyMs: Date.now() - started,
        url,
        tokenPreview,
        message: `Não foi possível alcançar a D-API: ${e?.message || "erro de rede"}`,
      };
    }
    const latencyMs = Date.now() - started;
    const text = await res.text();
    let parsed: any = null;
    try { parsed = text ? JSON.parse(text) : null; } catch { parsed = { raw: text.slice(0, 500) }; }
    const detailsStr = parsed ? JSON.stringify(parsed).slice(0, 2000) : undefined;

    if (!res.ok) {
      const msg = res.status === 401 || res.status === 403
        ? "Credenciais inválidas — verifique DAPI_API_KEY."
        : `D-API respondeu HTTP ${res.status}.`;
      return { ok: false, step: "auth", status: res.status, latencyMs, url, tokenPreview, message: msg, details: detailsStr };
    }

    const count = Array.isArray(parsed)
      ? parsed.length
      : Array.isArray(parsed?.sessions)
        ? parsed.sessions.length
        : Array.isArray(parsed?.data)
          ? parsed.data.length
          : undefined;
    return {
      ok: true,
      step: "done",
      status: res.status,
      latencyMs,
      url,
      tokenPreview,
      message: count !== undefined ? `Conexão D-API OK — ${count} sessão(ões) na conta.` : "Conexão D-API OK.",
      details: detailsStr,
    };
  });

export const testEvolutionConnection = testUazapiConnection;
