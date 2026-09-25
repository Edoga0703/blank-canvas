import { supabase } from "@/integrations/supabase/client";

/**
 * Garante que existe uma sessão válida antes de chamar server functions
 * protegidas. Sessões antigas expiram enquanto a pessoa edita a tela e o
 * token deixa de ser anexado, resultando em "Unauthorized".
 */
export async function ensureSession(): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const session = data.session;

  const expiresAt = session?.expires_at ? session.expires_at * 1000 : 0;
  const expiraEmBreve = !expiresAt || expiresAt - Date.now() < 60_000;

  if (!session || expiraEmBreve) {
    const { data: refreshed } = await supabase.auth.refreshSession();
    if (!refreshed.session) {
      throw new Error("Sua sessão expirou. Entre novamente para salvar.");
    }
  }
}

export function mensagemErroSessao(e: any, fallback: string): string {
  const msg = String(e?.message || "");
  if (/unauthorized|authorization header|invalid token|jwt/i.test(msg)) {
    return "Sua sessão expirou. Entre novamente para salvar as alterações.";
  }
  return msg || fallback;
}
