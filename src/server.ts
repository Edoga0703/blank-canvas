import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
function isRequestAbort(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  const cause = error.cause;
  const causeCode =
    cause != null && typeof cause === "object" && "code" in cause
      ? String(cause.code)
      : "";
  const message = `${error.name} ${error.message}`.toLowerCase();

  return error.name === "AbortError" || causeCode === "ECONNRESET" || message.includes("aborted");
}

function isPreviewOrLocalHost(request?: Request): boolean {
  if (!request) return false;
  let host = "";
  try {
    const fwdHost = request.headers.get("x-forwarded-host") || request.headers.get("host");
    host = (fwdHost || new URL(request.url).host || "").toLowerCase().split(":")[0];
  } catch {
    return false;
  }
  if (!host) return false;
  if (host === "capiconversa.com" || host === "www.capiconversa.com") return false;
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host.endsWith(".lovable.app") ||
    host.endsWith(".lovableproject.com")
  );
}

function applyHtmlSecurityHeaders(response: Response, request?: Request): Response {
  const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
  if (!contentType.includes("text/html")) return response;

  const headers = new Headers(response.headers);
  const existingCsp = headers.get("Content-Security-Policy");

  if (isPreviewOrLocalHost(request)) {
    headers.delete("X-Frame-Options");
    const previewDirective = "frame-ancestors 'self' https://lovable.dev https://*.lovable.dev";
    if (!existingCsp) {
      headers.set("Content-Security-Policy", previewDirective);
    } else if (!/frame-ancestors/i.test(existingCsp)) {
      headers.set("Content-Security-Policy", `${existingCsp}; ${previewDirective}`);
    }
  } else {
    if (!headers.has("X-Frame-Options")) {
      headers.set("X-Frame-Options", "SAMEORIGIN");
    }
    if (!existingCsp) {
      headers.set("Content-Security-Policy", "frame-ancestors 'self'");
    } else if (!/frame-ancestors/i.test(existingCsp)) {
      headers.set("Content-Security-Policy", `${existingCsp}; frame-ancestors 'self'`);
    }
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function normalizeCatastrophicSsrResponse(
  response: Response,
  request: Request,
): Promise<Response> {
  if (response.status < 500) return applyHtmlSecurityHeaders(response, request);
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return applyHtmlSecurityHeaders(response, request);

  const body = await response.clone().text();
  if (!body.includes('"unhandled":true') || !body.includes('"message":"HTTPError"')) {
    return response;
  }

  const capturedError = consumeLastCapturedError();

  // A closed browser socket can be swallowed by h3 and normalized to its
  // generic HTTPError response. It is a cancelled request, not an SSR crash.
  if (request.signal.aborted || isRequestAbort(capturedError)) {
    return new Response(null, { status: 499 });
  }

  console.error(capturedError ?? new Error(`h3 swallowed SSR error: ${body}`));
  return applyHtmlSecurityHeaders(new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  }), request);
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    if (env && typeof env === "object") {
      const e = env as Record<string, unknown>;
      if (typeof process !== "undefined" && process.env) {
        for (const [key, val] of Object.entries(e)) {
          if (typeof val === "string" && !process.env[key]) {
            process.env[key] = val;
          }
        }
        const extUrl = process.env.EXTERNAL_SUPABASE_URL || "https://supabase.cuentastupana.com";
        const extAnon =
          process.env.EXTERNAL_SUPABASE_ANON_KEY ||
          "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzE5NzkyMDAwLCJleHAiOjIwMzUxNTIwMDB9.zM3xq1Bkafe4-jNNpKDuB4HOpHvVskFxoldZds6raPs";
        const extKey = process.env.EXTERNAL_SERVICE_ROLE_KEY || process.env.APP_SERVICE_ROLE_KEY;
        if (extKey) {
          process.env.SUPABASE_SERVICE_ROLE_KEY = extKey;
          process.env.SUPABASE_URL = extUrl;
          process.env.VITE_SUPABASE_URL = extUrl;
          process.env.SUPABASE_PUBLISHABLE_KEY = extAnon;
          process.env.VITE_SUPABASE_PUBLISHABLE_KEY = extAnon;
        } else if (!process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.APP_SERVICE_ROLE_KEY) {
          process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.APP_SERVICE_ROLE_KEY;
        }
      }
    }
    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response, request);
    } catch (error) {
      if (request.signal.aborted || isRequestAbort(error)) {
        return new Response(null, { status: 499 });
      }
      console.error(error);
      return applyHtmlSecurityHeaders(new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      }), request);
    }
  },
};
