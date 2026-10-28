/**
 * Normalização e validação de números brasileiros e internacionais (E.164) para WhatsApp.
 * Suporta Venezuela (+58), Colômbia (+57), México (+52), Argentina (+54), Chile (+56),
 * Peru (+51), Espanha (+34), EUA (+1), América Central, Caribe e todo o padrão E.164.
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

  // 1. Números internacionales que inician con '+' explícito (E.164: 8 a 15 dígitos)
  if (hasExplicitPlus && d.length >= 8 && d.length <= 15) {
    return d;
  }

  // 2. Números locales de Venezuela sin DDI (10 dígitos empezando por 412, 414, 416, 424, 426)
  if (d.length === 10 && /^(412|414|416|424|426)/.test(d)) {
    return "58" + d;
  }

  // 3. Números locales de Colombia sin DDI (10 dígitos empezando por 300..350)
  if (d.length === 10 && /^3[0-5]\d/.test(d)) {
    return "57" + d;
  }

  // 4. Códigos de país de 3 y 4 dígitos comunes (Latinoamérica, Caribe, etc.)
  // Ej: 507 (Panamá), 506 (Costa Rica), 593 (Ecuador), 591 (Bolivia), 595 (Paraguay), 598 (Uruguay),
  // 502 (Guatemala), 503 (El Salvador), 504 (Honduras), 505 (Nicaragua), 1809/1829/1849 (Rep. Dominicana)
  const cc3 = d.slice(0, 3);
  const cc4 = d.slice(0, 4);
  const KNOWN_CC_3 = new Set([
    "593", "591", "595", "598", "501", "502", "503", "504", "505", "506", "507", "509",
    "1809", "1829", "1849", "1787", "1939"
  ]);
  if ((KNOWN_CC_3.has(cc3) || KNOWN_CC_3.has(cc4)) && d.length >= 10 && d.length <= 13) {
    return d;
  }

  // 5. Códigos de país de 2 dígitos (Latinoamérica y Europa principal)
  // Ej: 58 (Venezuela), 57 (Colombia), 52 (México), 54 (Argentina), 56 (Chile), 51 (Perú), 34 (España)
  const cc2 = d.slice(0, 2);
  const KNOWN_CC_2 = new Set([
    "58", "57", "52", "54", "56", "51", "34", "44", "33", "49", "39", "31", "32", "35", "41", "43", "46", "47", "48", "61", "64"
  ]);
  if (cc2 !== "55" && KNOWN_CC_2.has(cc2) && d.length >= 10 && d.length <= 14) {
    return d;
  }

  // 6. USA / Canadá (DDI 1 + 10 dígitos = 11 dígitos, código de área 200-999)
  if (d.length === 11 && d.startsWith("1") && /^[2-9]/.test(d[1])) {
    return d;
  }

  // 7. Números de Brasil con DDI 55 (12 o 13 dígitos)
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) {
    const br = tryParseBrazilianLocal(d.slice(2));
    if (br.valid && br.numero) return br.numero;
    return d;
  }

  // 8. Números locales de Brasil sin DDI (10 u 11 dígitos)
  // Celular con 9º dígito: 11 dígitos con DDD 11..99 y tercer dígito 9
  if (d.length === 11 && /^[1-9][1-9]9[0-9]{8}$/.test(d)) {
    const br = tryParseBrazilianLocal(d);
    if (br.valid && br.numero) return br.numero;
  }
  // Teléfono fijo de Brasil: 10 dígitos con DDD 11..99 y tercer dígito 2..5
  if (d.length === 10 && /^[1-9][1-9][2-5][0-9]{7}$/.test(d)) {
    const br = tryParseBrazilianLocal(d);
    if (br.valid && br.numero) return br.numero;
  }

  // 9. Ya tiene formato E.164 internacional completo (11 a 15 dígitos)
  if (d.length >= 11 && d.length <= 15) {
    return d;
  }

  // 10. Fallback controlado solo si el usuario/entorno definió un código explícito y el número es corto (< 11)
  if ((d.length === 10 || d.length === 11) && fallbackCountryCode && !d.startsWith(fallbackCountryCode)) {
    return fallbackCountryCode + d;
  }

  return d;
}

export function parseBrPhone(raw: string): BrPhoneResult {
  const norm = normalizePhone(raw);
  if (norm && norm.length >= 8 && norm.length <= 15) {
    return { numero: norm, valid: true };
  }
  return { numero: "", valid: false, reason: "Número inválido" };
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
