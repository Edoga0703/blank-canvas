import { createMiddleware } from "@tanstack/react-start";

/**
 * Renova a sessão do Supabase (quando expirada ou prestes a expirar) antes de
 * qualquer chamada de server function, evitando o erro
 * "Unauthorized: No authorization header provided".
 */
export const refreshSupabaseSession = createMiddleware({ type: "function" }).client(
  async ({ next }) => {
    if (typeof window !== "undefined") {
      try {
        const { supabase } = await import("@/integrations/supabase/client");
        const { data } = await supabase.auth.getSession();
        const session = data.session;
        const expiresAt = session?.expires_at ? session.expires_at * 1000 : 0;
        if (session && (!expiresAt || expiresAt - Date.now() < 60_000)) {
          await supabase.auth.refreshSession();
        }
      } catch {
        // segue o fluxo; o servidor responde 401 se realmente não houver sessão
      }
    }
    return next();
  },
);
