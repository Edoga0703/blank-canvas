// Sandbox seguro de pruebas para Webhooks y APIs externas del Copilot

export interface WebhookTestParams {
  url: string;
  method?: "GET" | "POST" | "PUT";
  headers?: Record<string, string>;
  body?: any;
}

export interface WebhookTestResult {
  ok: boolean;
  status: number;
  statusText: string;
  latencyMs: number;
  responseSample: any;
  error?: string;
}

/**
 * Valida que una URL no intente atacar IPs de metadatos de nube o loopback interno
 */
function isSafeUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    const host = parsed.hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0") return false;
    if (host === "169.254.169.254" || host.startsWith("10.") || host.startsWith("192.168.")) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Ejecuta una petición de prueba en el sandbox con timeout controlado
 */
export async function testExternalWebhook(params: WebhookTestParams): Promise<WebhookTestResult> {
  const start = Date.now();
  const rawUrl = (params.url || "").trim();

  if (!rawUrl) {
    return {
      ok: false,
      status: 400,
      statusText: "Bad Request",
      latencyMs: 0,
      responseSample: null,
      error: "La URL del webhook es requerida.",
    };
  }

  if (!isSafeUrl(rawUrl)) {
    return {
      ok: false,
      status: 403,
      statusText: "Forbidden",
      latencyMs: 0,
      responseSample: null,
      error: "La URL proporcionada no es válida o apunta a una dirección no permitida.",
    };
  }

  const method = (params.method || "POST").toUpperCase();
  const headers: Record<string, string> = {
    Accept: "application/json, text/plain, */*",
    "User-Agent": "Capiconversa-Copilot-Sandbox/1.0",
    ...(params.headers || {}),
  };

  let bodyStr: string | undefined = undefined;
  if (method === "POST" || method === "PUT") {
    if (params.body != null) {
      if (typeof params.body === "string") {
        bodyStr = params.body;
      } else {
        bodyStr = JSON.stringify(params.body);
        if (!headers["Content-Type"]) headers["Content-Type"] = "application/json";
      }
    } else {
      bodyStr = JSON.stringify({});
      if (!headers["Content-Type"]) headers["Content-Type"] = "application/json";
    }
  }

  try {
    const res = await fetch(rawUrl, {
      method,
      headers,
      body: bodyStr,
      signal: AbortSignal.timeout(8000), // 8s timeout máximo
    });

    const latencyMs = Date.now() - start;
    const contentType = res.headers.get("content-type") || "";

    let responseSample: any = null;
    if (contentType.includes("application/json")) {
      responseSample = await res.json().catch(() => null);
    } else {
      const text = await res.text().catch(() => "");
      responseSample = text.slice(0, 1000);
    }

    return {
      ok: res.ok,
      status: res.status,
      statusText: res.statusText || (res.ok ? "OK" : "Error"),
      latencyMs,
      responseSample,
      error: res.ok ? undefined : `El endpoint respondió con HTTP ${res.status}: ${res.statusText}`,
    };
  } catch (err: any) {
    const latencyMs = Date.now() - start;
    const isTimeout = err?.name === "TimeoutError" || err?.name === "AbortError";
    return {
      ok: false,
      status: isTimeout ? 408 : 500,
      statusText: isTimeout ? "Request Timeout" : "Network Error",
      latencyMs,
      responseSample: null,
      error: isTimeout
        ? "Tiempo de espera agotado (timeout de 8s). El servidor no respondió a tiempo."
        : `Fallo de conexión: ${err?.message || "Error desconocido"}`,
    };
  }
}
