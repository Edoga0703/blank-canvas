/**
 * Detecção de JIDs que NÃO são leads/contatos individuais.
 * Grupos, listas de transmissão, status e newsletters são ignorados pelo sistema.
 */
export function isNonContactJid(remoteJid?: string | null, numero?: string | null): boolean {
  const jid = String(remoteJid || "").toLowerCase();
  if (jid.includes("@lid")) return false;          // contato individual com ID oculto (LID)
  if (jid.includes("@g.us")) return true;          // grupo
  if (jid.includes("@broadcast")) return true;     // lista de transmissão / status
  if (jid.includes("@newsletter")) return true;    // canais
  if (jid.includes("status@")) return true;

  // Fallback por número: IDs de grupo do WhatsApp começam com 1203630 (18 dígitos)
  // ou possuem formato "criador-timestamp" (muito longos).
  const d = String(numero || jid).replace(/\D/g, "");
  if (!d) return false;
  if (d.startsWith("120363")) return true;
  if (d.length >= 19 && jid.includes("-")) return true; // grupo "criador-timestamp"
  return false;
}

/** LID = identificador individual (privacidade) do WhatsApp; não é telefone. */
export function isLidNumber(value?: string | null): boolean {
  const s = String(value || "").toLowerCase();
  if (s.includes("@lid")) return true;
  const d = s.replace(/\D/g, "");
  return d.length >= 15 && !d.startsWith("120363");
}

