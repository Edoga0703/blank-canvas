/**
 * Normalização e validação de números brasileiros para WhatsApp.
 *
 * Regras:
 * - DDI 55 sempre presente
 * - DDD válido (11..99, lista oficial)
 * - Celular: 9 dígitos começando com 9 (o "9º dígito" é adicionado quando faltar)
 * - Fixo (8 dígitos iniciando em 2..5) é aceito como está
 */

const DDDS_VALIDOS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19,
  21, 22, 24, 27, 28,
  31, 32, 33, 34, 35, 37, 38,
  41, 42, 43, 44, 45, 46, 47, 48, 49,
  51, 53, 54, 55,
  61, 62, 63, 64, 65, 66, 67, 68, 69,
  71, 73, 74, 75, 77, 79,
  81, 82, 83, 84, 85, 86, 87, 88, 89,
  91, 92, 93, 94, 95, 96, 97, 98, 99,
]);

export type BrPhoneResult = {
  /** Número normalizado (somente dígitos, com DDI). Vazio quando inválido. */
  numero: string;
  valid: boolean;
  reason?: string;
};

export function parseBrPhone(raw: string): BrPhoneResult {
  let d = String(raw || "").replace(/\D/g, "");
  if (!d) return { numero: "", valid: false, reason: "Número vazio" };

  // remove zeros à esquerda (0xx)
  d = d.replace(/^0+/, "");

  // Números internacionais (não-BR): aceita como está, sem validar 9º dígito.
  if (!d.startsWith("55") && d.length > 11) {
    return { numero: d, valid: true };
  }

  // tira o DDI para trabalhar com DDD + assinante
  let local = d.startsWith("55") ? d.slice(2) : d;
  local = local.replace(/^0+/, "");

  if (local.length < 10 || local.length > 11) {
    return { numero: "", valid: false, reason: `Tamanho inválido (${local.length} dígitos após o DDD/DDI)` };
  }

  const ddd = Number(local.slice(0, 2));
  if (!DDDS_VALIDOS.has(ddd)) {
    return { numero: "", valid: false, reason: `DDD inválido (${ddd})` };
  }

  let assinante = local.slice(2);

  if (assinante.length === 8) {
    const first = assinante[0];
    if (/[6-9]/.test(first)) {
      // celular antigo sem o 9º dígito -> adiciona
      assinante = "9" + assinante;
    } else if (!/[2-5]/.test(first)) {
      return { numero: "", valid: false, reason: "Prefixo de assinante inválido" };
    }
    // fixo (2..5) permanece com 8 dígitos
  } else if (assinante.length === 9) {
    if (assinante[0] !== "9") {
      return { numero: "", valid: false, reason: "Celular de 9 dígitos deve iniciar com 9" };
    }
  }

  return { numero: "55" + String(ddd).padStart(2, "0") + assinante, valid: true };
}

/** Retorna somente o número normalizado (string vazia quando inválido). */
export function normalizeBrPhone(raw: string): string {
  return parseBrPhone(raw).numero;
}

/** Erros de provedor que nunca devem ser retentados. */
export function isPermanentSendError(msg: string): boolean {
  const m = (msg || "").toLowerCase();
  return /invalid|inexistent|not exist|não existe|número inválido|destinatário inválido|destinatário é um grupo|destinatário vazio|number.*not.*whatsapp|not.*on.*whatsapp|rejected|forbidden|blocked|unsupported|not_found|recipient/.test(m);
}

/**
 * Formas equivalentes do mesmo número brasileiro de celular.
 * Ex.: 5585999926859 (com 9º dígito) e 558599926859 (sem) são o mesmo contato.
 * Retorna sempre pelo menos o número em dígitos.
 */
export function phoneVariants(raw: string): string[] {
  const base = String(raw || "").split("@")[0]!.replace(/\D/g, "").replace(/^0+/, "");
  if (!base) return [];
  const out = new Set<string>([base]);
  const norm = normalizeBrPhone(base);
  if (norm) out.add(norm);
  for (const n of [...out]) {
    if (!n.startsWith("55")) continue;
    const local = n.slice(2);
    const ddd = local.slice(0, 2);
    const ass = local.slice(2);
    if (ass.length === 9 && ass.startsWith("9")) out.add("55" + ddd + ass.slice(1)); // sem o 9º dígito
    if (ass.length === 8 && /[6-9]/.test(ass[0]!)) out.add("55" + ddd + "9" + ass);   // com o 9º dígito
  }
  return [...out];
}
