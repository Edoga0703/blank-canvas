/**
 * Nomes "genéricos" gravados quando o WhatsApp não envia o pushName real
 * (ex.: "Contato 1234", o próprio número, "Lead"). Nunca devem ser usados
 * como nome do cliente em mensagens, réguas ou prompts da IA.
 */
export function isGenericLeadName(nome?: string | null, numero?: string | null): boolean {
  const s = String(nome ?? "").trim();
  if (!s) return true;
  if (/^contato\s*\d*$/i.test(s)) return true;
  if (/^lead$/i.test(s)) return true;
  if (/^\+?\d[\d\s()-]{5,}$/.test(s)) return true;
  if (numero && s.replace(/\D/g, "") === String(numero).replace(/\D/g, "")) return true;
  return false;
}

/** Retorna o primeiro nome utilizável, ou string vazia quando for genérico. */
export function firstNameOrEmpty(nome?: string | null, numero?: string | null): string {
  if (isGenericLeadName(nome, numero)) return "";
  return String(nome).trim().split(/\s+/)[0] ?? "";
}
