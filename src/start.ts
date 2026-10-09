import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";
import { refreshSupabaseSession } from "@/lib/session-middleware";

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

const errorMiddleware = createMiddleware().server(async ({ next, request }) => {
  const url = new URL(request.url);
  if (url.pathname.startsWith("/lovable/")) {
    return next();
  }
  try {
    return await next();
  } catch (error) {
    // Browsers routinely close an SSR request during navigation/HMR. This is
    // a client cancellation, not an application failure, so never render the
    // global 500 page for it.
    if (isRequestAbort(error)) {
      return new Response(null, { status: 499 });
    }
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

export const startInstance = createStart(() => ({
  functionMiddleware: [refreshSupabaseSession, attachSupabaseAuth],
  requestMiddleware: [errorMiddleware],
}));
