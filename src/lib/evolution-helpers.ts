import { resolveCompanyIdCached } from "./company-cache";

export function deriveInstanceName(companyId: string, suffix?: string) {
  const base = `dapi_${companyId.replace(/-/g, "").slice(0, 8)}`;
  return suffix ? `${base}_${suffix}` : base;
}

export function sortInstances(rows: any[] = []) {
  return [...rows].sort((a, b) => {
    const rank = (s: string) => s === "connected" ? 0 : s === "connecting" ? 1 : 2;
    const diff = rank(a.status) - rank(b.status);
    if (diff) return diff;
    return String(b.updated_at || "").localeCompare(String(a.updated_at || ""));
  });
}

const VALID_WA_PROVIDERS = ["dapi", "dapi_official"];

export async function getPreferredWhatsappInstance(
  supabase: any,
  companyId: string,
  columns = "instance_name,status,provider,instance_token",
  userId?: string,
) {
  if (userId) {
    const [{ data: linkedPivot }, { data: legacyRows }] = await Promise.all([
      supabase
        .from("company_user_instance")
        .select(`instance:whatsapp_instances(${columns})`)
        .eq("company_id", companyId)
        .eq("user_id", userId),
      supabase
        .from("whatsapp_instances")
        .select(columns)
        .eq("company_id", companyId)
        .eq("user_id", userId)
        .in("provider", VALID_WA_PROVIDERS),
    ]);

    const instances = [
      ...(linkedPivot
        ?.map((l: any) => l.instance)
        .filter((i: any) => i && VALID_WA_PROVIDERS.includes(String(i.provider || ""))) || []),
      ...(legacyRows || []),
    ];

    const uniqueInstances = Array.from(new Map(instances.map((item) => [item.instance_name, item])).values());

    if (uniqueInstances.length > 0) {
      const connected = uniqueInstances.filter((i: any) => i.status === "connected");
      if (connected.length > 0) {
        return sortInstances(connected)[0];
      }

      const { data: companyConnected } = await supabase
        .from("whatsapp_instances")
        .select(columns)
        .eq("company_id", companyId)
        .in("provider", VALID_WA_PROVIDERS)
        .eq("status", "connected");
      if (companyConnected && companyConnected.length > 0) {
        return sortInstances(companyConnected)[0];
      }

      return sortInstances(uniqueInstances)[0];
    }
  }

  const { data: allRows } = await supabase
    .from("whatsapp_instances")
    .select(columns)
    .eq("company_id", companyId)
    .in("provider", VALID_WA_PROVIDERS);
  const allInstances = allRows ?? [];
  const connected = allInstances.filter((i: any) => i.status === "connected");

  if (connected.length > 0) {
    return sortInstances(connected)[0];
  }

  return sortInstances(allInstances)[0] ?? null;
}

/**
 * Escolhe a conexão certa para o contato:
 * - Instagram / Messenger -> meta_instagram / meta_messenger
 * - Telegram -> telegram
 * - WhatsApp -> exclusivamente D-API (dapi / dapi_official)
 */
export async function getInstanceForContact(
  supabase: any,
  companyId: string,
  numero: string,
  columns = "instance_name,status,provider,instance_token",
  userId?: string,
) {
  let { data: card } = await supabase
    .from("crm_cards")
    .select("canal_chat,canal_entrada")
    .eq("company_id", companyId)
    .eq("numero", numero)
    .maybeSingle();

  let canal = String((card as any)?.canal_chat ?? "").toLowerCase();
  if (!canal || canal === "null" || canal === "undefined") {
    canal = String((card as any)?.canal_entrada ?? "").toLowerCase();
  }

  if (!canal || canal === "null" || canal === "undefined" || canal === "whatsapp") {
    const { data: lastMsg } = await supabase
      .from("mensagens")
      .select("provider")
      .eq("company_id", companyId)
      .eq("numero", numero)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lastMsg?.provider === "meta_instagram") canal = "instagram";
    else if (lastMsg?.provider === "meta_messenger") canal = "messenger";
    else if (lastMsg?.provider === "telegram") canal = "telegram";
  }

  if (canal === "telegram") {
    const { data } = await supabase
      .from("whatsapp_instances")
      .select(columns)
      .eq("company_id", companyId)
      .eq("provider", "telegram");
    const inst = sortInstances(data ?? [])[0] ?? null;
    if (!inst?.instance_name) {
      throw new Error("Telegram não conectado. Conecte o bot em Conexões.");
    }
    return inst;
  }

  if (canal === "instagram" || canal === "messenger") {
    const provider = canal === "instagram" ? "meta_instagram" : "meta_messenger";
    const { data } = await supabase
      .from("whatsapp_instances")
      .select(columns)
      .eq("company_id", companyId)
      .eq("provider", provider)
      .eq("status", "connected");

    const instances = sortInstances(data ?? []);
    const withToken = instances.filter((i) => !!i.instance_token);
    const inst = withToken[0] ?? instances[0] ?? null;

    if (!inst?.instance_name) {
      throw new Error(
        canal === "instagram"
          ? "Instagram não conectado. Reconecte o canal em Conexões."
          : "Messenger não conectado. Reconecte o canal em Conexões.",
      );
    }
    return inst;
  }

  if (!/^\+?\d[\d\s().-]{6,}$/.test(String(numero).trim())) {
    const { data: metaRows } = await supabase
      .from("whatsapp_instances")
      .select(columns)
      .eq("company_id", companyId)
      .in("provider", ["meta_instagram", "meta_messenger"])
      .eq("status", "connected");
    const metaInst =
      sortInstances(metaRows ?? []).filter((i: any) => !!i.instance_token)[0] ??
      sortInstances(metaRows ?? [])[0] ??
      null;
    if (metaInst?.instance_name) {
      return metaInst;
    }
    throw new Error("Este contato não é do WhatsApp. Reconecte o canal (Instagram/Messenger) em Conexões para responder.");
  }

  const preferred = await getPreferredWhatsappInstance(supabase, companyId, columns, userId);

  if (preferred && preferred.status !== "connected") {
    const { data: allInstances } = await supabase
      .from("whatsapp_instances")
      .select(columns)
      .eq("company_id", companyId)
      .in("provider", VALID_WA_PROVIDERS)
      .eq("status", "connected");

    const connected = sortInstances(allInstances ?? [])[0];
    if (connected) {
      return connected;
    }
  }
  return preferred;
}

export function buildWebhookUrl(token?: string | null, _provider: string = "dapi", origin?: string | null) {
  const publicOrigin = (
    origin ||
    process.env.PUBLIC_APP_URL ||
    process.env.PUBLIC_BASE_URL ||
    process.env.APP_URL ||
    process.env.VITE_PUBLIC_APP_URL ||
    "https://capiconversa.com"
  ).replace(/\/+$/, "");
  const tokenQuery = token ? `?t=${encodeURIComponent(token)}` : "";
  return `${publicOrigin}/api/public/dapi-webhook${tokenQuery}`;
}

export function extractWhatsappMessageId(resp: any): string | null {
  if (!resp || typeof resp !== "object") return null;
  const direct =
    resp?.id ??
    resp?.messageId ??
    resp?.key?.id ??
    resp?.data?.id ??
    resp?.data?.messageId ??
    resp?.data?.key?.id ??
    resp?.data?.message?.key?.id ??
    resp?.message?.key?.id ??
    resp?.messages?.[0]?.id ??
    resp?.data?.messages?.[0]?.id ??
    resp?.response?.key?.id ??
    resp?.response?.message?.key?.id ??
    resp?.result?.key?.id ??
    null;
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  const seen = new Set<any>();
  const stack: any[] = [resp];
  while (stack.length) {
    const cur = stack.pop();
    if (!cur || typeof cur !== "object" || seen.has(cur)) continue;
    seen.add(cur);
    if (cur.key && typeof cur.key === "object" && typeof cur.key.id === "string" && cur.key.id.trim()) {
      return cur.key.id.trim();
    }
    for (const v of Object.values(cur)) {
      if (v && typeof v === "object") stack.push(v);
    }
  }
  return null;
}

export function onlyDigits(value: unknown) {
  return String(value ?? "").replace(/\D/g, "");
}

export function isSameWhatsappNumber(a: unknown, b: unknown) {
  const left = onlyDigits(a);
  const right = onlyDigits(b);
  if (!left || !right) return false;
  if (left === right) return true;
  return left.length >= 10 && right.length >= 10 && (left.endsWith(right) || right.endsWith(left));
}

export function assertNotSendingToOwnConnectedNumber(destino: string, instance: any) {
  if (isSameWhatsappNumber(destino, instance?.numero)) {
    throw new Error("Você está tentando enviar mensagem para o próprio número conectado. Para testar, envie para outro WhatsApp.");
  }
}

export async function assertInstanceOpen(
  _evoState?: any,
  _evoFetchInstance?: any,
  _instanceName?: string,
  _provider?: string,
): Promise<string | null> {
  return null;
}

export function isPermanentMetaSendError(provider: string | undefined, message: string | null): boolean {
  if (!provider?.startsWith("meta") || !message) return false;
  return /acesso avançado|advanced access|função no app|role on app|missing permissions|permission.*instagram_manage_messages|403|forbidden|janela de resposta de 24 horas|outside.*24.?hour|response window/i.test(message);
}

export async function resolveCompanyId(supabase: any, userId: string): Promise<string> {
  return resolveCompanyIdCached(supabase, userId);
}
