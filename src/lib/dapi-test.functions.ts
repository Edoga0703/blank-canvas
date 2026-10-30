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

export const testDapiConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ProviderTestResult> => {
    const { data: isSuper } = await context.supabase.rpc("is_super_admin");
    if (!isSuper) throw new Error("Acesso restrito ao super admin");

    const rawUrl = process.env.DAPI_BASE_URL || "https://api.d-api.cloud/api/v1";
    const apiKey = (process.env.DAPI_API_KEY || "").trim();

    if (!apiKey) {
      return {
        provider: "dapi",
        ok: false,
        step: "env",
        latencyMs: 0,
        message: "DAPI_API_KEY não configurada nos segredos do servidor.",
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
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(8000),
      });
    } catch (err: any) {
      return {
        provider: "dapi",
        ok: false,
        step: "network",
        latencyMs: Date.now() - started,
        url,
        tokenPreview,
        message: `Falha de rede ao contatar D-API: ${err?.message || "timeout"}`,
      };
    }

    const latencyMs = Date.now() - started;
    if (res.status === 401 || res.status === 403) {
      return {
        provider: "dapi",
        ok: false,
        step: "auth",
        status: res.status,
        latencyMs,
        url,
        tokenPreview,
        message: "DAPI_API_KEY rejeitada pela D-API (401/403).",
      };
    }

    if (!res.ok) {
      return {
        provider: "dapi",
        ok: false,
        step: "http",
        status: res.status,
        latencyMs,
        url,
        tokenPreview,
        message: `D-API respondeu status ${res.status}`,
      };
    }

    return {
      provider: "dapi",
      ok: true,
      step: "done",
      status: res.status,
      latencyMs,
      url,
      tokenPreview,
      message: `Conexão com D-API operacional (${latencyMs}ms).`,
    };
  });

// Aliases para retrocompatibilidade
export const testUazapiConnection = testDapiConnection;
export type UazapiTestResult = ProviderTestResult;
