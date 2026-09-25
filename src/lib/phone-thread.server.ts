// Resolve o "número canônico" de uma conversa, tratando as duas formas do
// celular brasileiro (com e sem o 9º dígito) como o mesmo contato.
import { phoneVariants, normalizeBrPhone } from "@/lib/br-phone";

export type ThreadNumero = { numero: string; found: boolean };

/**
 * Procura, entre as variantes do número, a que já é usada pela empresa
 * (card do CRM ou mensagens). Se nenhuma existir, devolve o número normalizado.
 */
export async function resolveThread(admin: any, companyId: string, numero: string): Promise<ThreadNumero> {
  const variants = phoneVariants(numero);
  const fallback = normalizeBrPhone(numero) || (variants[0] ?? String(numero || "").replace(/\D/g, ""));
  if (variants.length <= 1) return { numero: fallback, found: false };
  try {
    const { data: cards } = await admin
      .from("crm_cards")
      .select("numero, ultima_em")
      .eq("company_id", companyId)
      .in("numero", variants)
      .order("ultima_em", { ascending: false, nullsFirst: false })
      .limit(1);
    if (cards?.[0]?.numero) return { numero: cards[0].numero as string, found: true };

    const { data: msgs } = await admin
      .from("mensagens")
      .select("numero")
      .eq("company_id", companyId)
      .in("numero", variants)
      .order("created_at", { ascending: false })
      .limit(1);
    if (msgs?.[0]?.numero) return { numero: msgs[0].numero as string, found: true };
  } catch (e) {
    console.warn("[resolveThread] falhou, usando número normalizado:", e);
  }
  return { numero: fallback, found: false };
}

export async function resolveThreadNumero(admin: any, companyId: string, numero: string): Promise<string> {
  return (await resolveThread(admin, companyId, numero)).numero;
}

/**
 * Número a usar no envio e no registro da conversa.
 * 1) reaproveita a conversa já existente (qualquer variante do número);
 * 2) sendo conversa nova, pergunta ao provedor qual é o WhatsApp real.
 */
export async function canonicalOutboundNumero(
  admin: any,
  companyId: string,
  numero: string,
  inst?: { provider?: string | null; provider_type?: string | null; instance_token?: string | null } | null,
): Promise<string> {
  const thread = await resolveThread(admin, companyId, numero);
  if (thread.found) return thread.numero;

  const provider = String(inst?.provider ?? inst?.provider_type ?? "").toLowerCase();
  const token = inst?.instance_token ?? null;
  if (provider === "uazapi" && token) {
    try {
      const { uazResolveNumber } = await import("./uazapi.server");
      const real = await uazResolveNumber(token, thread.numero);
      if (real) return real;
    } catch { /* best-effort */ }
  }
  return thread.numero;
}
