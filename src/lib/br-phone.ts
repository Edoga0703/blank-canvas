/**
 * Normalização e validação de números brasileiros e internacionais (E.164) para WhatsApp.
 *
 * Regras para números do Brasil:
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

function tryParseBrazilianLocal(localDigits: string): BrPhoneResult {
  const local = localDigits.replace(/^0+/, "");
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
      assinante = "9" + assinante;
    } else if (!/[2-5]/.test(first)) {
      return { numero: "", valid: false, reason: "Prefixo de assinante inválido" };
    }
  } else if (assinante.length === 9) {
    if (assinante[0] !== "9") {
      return { numero: "", valid: false, reason: "Celular de 9 dígitos deve iniciar com 9" };
    }
  }

  return { numero: "55" + String(ddd).padStart(2, "0") + assinante, valid: true };
}

export function parseBrPhone(raw: string): BrPhoneResult {
  const rawStr = String(raw || "").trim();
  const hasExplicitPlus = rawStr.startsWith("+");
  let d = rawStr.replace(/\D/g, "");
  if (!d) return { numero: "", valid: false, reason: "Número vazio" };

  d = d.replace(/^0+/, "");

  // 1. Si comienza con 55 y tiene longitud de número de Brasil (12 o 13 dígitos)
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) {
    return tryParseBrazilianLocal(d.slice(2));
  }

  // 2. Si NO tiene '+' internacional explícito y tiene 10 u 11 dígitos, probar primero como DDD de Brasil
  if (!hasExplicitPlus && (d.length === 10 || d.length === 11)) {
    const brCandidate = tryParseBrazilianLocal(d);
    if (brCandidate.valid) {
      return brCandidate;
    }
  }

  // 3. Números internacionales (não-BR) en formato E.164 (9 a 15 dígitos)
  if (!d.startsWith("55") && d.length >= 9 && d.length <= 15) {
    return { numero: d, valid: true };
  }

  return tryParseBrazilianLocal(d.startsWith("55") ? d.slice(2) : d);
}

/**
 * Normaliza cualquier número nacional (Brasil) o internacional (E.164).
 * Respeta prefijos internacionales existentes (58 Venezuela, 57 Colombia, 1 USA, 52 México, etc.)
 * y normaliza números locales de Brasil (con o sin DDI 55, incluyendo São Paulo DDD 11..19).
 */
export function normalizePhone(raw: unknown, fallbackCountryCode?: string): string {
  const rawStr = String(raw ?? "").trim();
  const hasExplicitPlus = rawStr.startsWith("+");
  let d = rawStr.replace(/\D/g, "");
  if (!d) return "";
  d = d.replace(/^0+/, "");

  // 1. Números de Brasil con DDI 55 (12 o 13 dígitos)
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) {
    const br = tryParseBrazilianLocal(d.slice(2));
    if (br.valid && br.numero) return br.numero;
  }

  // 2. Números internacionales completos (12 a 15 dígitos): ya traen su DDI
  if (d.length >= 12 && d.length <= 15) {
    return d;
  }

  // 3. Si el usuario escribió '+' explícitamente (ej. +1 305 555 0199 o +58 412 1234567), respetar su DDI
  if (hasExplicitPlus && d.length >= 9 && d.length <= 15) {
    return d;
  }

  // 4. Números locales de Brasil de 10 u 11 dígitos sin DDI (ej. (11) 98765-4321 o (85) 99999-0000)
  // Nota: un celular de São Paulo tiene 11 dígitos, empieza con 11..19 y su 3er dígito es 9.
  if (d.length === 10 || d.length === 11) {
    const ddi2 = d.slice(0, 2);
    const isKnownHispanoDdi = ["58", "57", "52", "54", "56", "51", "34"].includes(ddi2) && d[2] !== "9";
    if (isKnownHispanoDdi) {
      return d;
    }

    const br = tryParseBrazilianLocal(d);
    if (br.valid && br.numero) {
      return br.numero;
    }

    // USA / Canadá (11 dígitos que inician con 1 y no coincidieron como celular de SP)
    if (d.length === 11 && d.startsWith("1")) {
      return d;
    }
  }

  // 5. Fallback con código de país por defecto
  const envCc = typeof process !== "undefined" && process.env ? (process.env.DEFAULT_COUNTRY_CODE || "55") : "55";
  const cc = fallbackCountryCode !== undefined ? fallbackCountryCode : envCc;
  if ((d.length === 10 || d.length === 11) && cc && !d.startsWith(cc)) {
    return cc + d;
  }

  return d;
}

/** Retorna el número normalizado (acepta tanto BR como internacional E.164). */
export function normalizeBrPhone(raw: string): string {
  return normalizePhone(raw);
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
    if (ass.length === 9 && ass.startsWith("9")) out.add("55" + ddd + ass.slice(1));
    if (ass.length === 8 && /[6-9]/.test(ass[0]!)) out.add("55" + ddd + "9" + ass);
  }
  return [...out];
}
