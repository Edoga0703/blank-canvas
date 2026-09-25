import { supabase } from "@/integrations/supabase/client";

const REMEMBER_KEY = "metrix.auth.remember";
const EXPIRES_KEY = "metrix.auth.expires_at";

/** Sessão sem "manter conectado": expira após esse período de inatividade. */
export const SHORT_SESSION_MS = 12 * 60 * 60 * 1000; // 12h

export function setRememberChoice(remember: boolean) {
  if (typeof window === "undefined") return;
  try {
    if (remember) {
      localStorage.setItem(REMEMBER_KEY, "1");
      localStorage.removeItem(EXPIRES_KEY);
    } else {
      localStorage.setItem(REMEMBER_KEY, "0");
      localStorage.setItem(EXPIRES_KEY, String(Date.now() + SHORT_SESSION_MS));
    }
  } catch {}
}

export function getRememberChoice(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return localStorage.getItem(REMEMBER_KEY) !== "0";
  } catch {
    return true;
  }
}

export function clearSessionPolicy() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(EXPIRES_KEY);
  } catch {}
}

/**
 * Aplica a política de sessão. Retorna true se a sessão expirou
 * (usuário foi deslogado). Quando "manter conectado" está ativo, nunca expira.
 */
export async function enforceSessionPolicy(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (getRememberChoice()) return false;

  let expiresAt = 0;
  try {
    expiresAt = Number(localStorage.getItem(EXPIRES_KEY) ?? 0);
  } catch {
    return false;
  }

  if (expiresAt && Date.now() > expiresAt) {
    clearSessionPolicy();
    try {
      await supabase.auth.signOut();
    } catch {}
    return true;
  }

  // Renova a janela a cada acesso (inatividade, não tempo absoluto).
  try {
    localStorage.setItem(EXPIRES_KEY, String(Date.now() + SHORT_SESSION_MS));
  } catch {}
  return false;
}
