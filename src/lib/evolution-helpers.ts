import { resolveCompanyIdCached } from "./company-cache";
import { canAttemptSilentRecovery, hasPermanentInstanceIssue, isPermanentDisconnectReason, normalizeEvolutionState, statusAfterRecoveryPolicy } from "./whatsapp-connection";

export function deriveInstanceName(companyId: string, suffix?: string) {
  const base = `atendezap_${companyId.replace(/-/g, "").slice(0, 16)}`;
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

export async function getPreferredWhatsappInstance(supabase: any, companyId: string, columns = "instance_name,status,provider,instance_token", userId?: string) {
  // 1. Prioridade Máxima: Instâncias vinculadas ao usuário (Nova ou Antiga arquitetura)
  if (userId) {
    console.log(`[getPreferredWhatsappInstance] Buscando vínculo para usuário: ${userId} na empresa: ${companyId}`);
    
    // Tenta buscar via tabela pivot e via coluna legada em paralelo para ser resiliente
    const [{ data: linkedPivot }, { data: legacyRows }] = await Promise.all([
      supabase.from("company_user_instance").select(`instance:whatsapp_instances(${columns})`).eq("company_id", companyId).eq("user_id", userId),
      supabase.from("whatsapp_instances").select(columns).eq("company_id", companyId).eq("user_id", userId)
    ]);

    let instances = [
      ...(linkedPivot?.map((l: any) => l.instance).filter(Boolean) || []),
      ...(legacyRows || [])
    ];

    // Remove duplicados (mesmo nome de instância)
    const uniqueInstances = Array.from(new Map(instances.map(item => [item.instance_name, item])).values());

    if (uniqueInstances.length > 0) {
      // Se houver alguma vinculada que esteja 'connected', usamos ela
      const connected = uniqueInstances.filter((i: any) => i.status === 'connected');
      if (connected.length > 0) {
        const sorted = sortInstances(connected);
        console.log(`[getPreferredWhatsappInstance] Usando instância vinculada CONNECTED: ${sorted[0].instance_name}`);
        return sorted[0];
      }
      
      // Se as vinculadas estão offline, mas a empresa tem alguma conectada, usamos a da empresa como failover imediato
      const { data: companyConnected } = await supabase.from("whatsapp_instances").select(columns).eq("company_id", companyId).eq("status", "connected");
      if (companyConnected && companyConnected.length > 0) {
        const sorted = sortInstances(companyConnected);
        console.log(`[getPreferredWhatsappInstance] Vinculadas offline, usando fallback CONNECTED da empresa: ${sorted[0].instance_name}`);
        return sorted[0];
      }

      // Se nada está conectado, retorna a melhor vinculada
      console.log(`[getPreferredWhatsappInstance] Nada conectado, retornando melhor vinculada offline: ${uniqueInstances[0].instance_name}`);
      return sortInstances(uniqueInstances)[0];
    }
  }

  // 2. Fallback: Qualquer instância conectada da empresa
  console.log(`[getPreferredWhatsappInstance] Sem vínculos específicos para ${userId || 'n/a'}, buscando na empresa ${companyId}`);
  const { data: allRows } = await supabase.from("whatsapp_instances").select(columns).eq("company_id", companyId);
  const allInstances = allRows ?? [];
  const connected = allInstances.filter((i: any) => i.status === 'connected');

  if (connected.length > 0) {
    const sorted = sortInstances(connected);
    return sorted[0];
  }

  return sortInstances(allInstances)[0] ?? null;
}

/**
 * Escolhe a conexão certa para o contato: se a conversa veio do Instagram ou
 * Messenger, precisa sair pela instância Meta correspondente (o número na
 * verdade é um IGSID/PSID e não existe no WhatsApp).
 */
export async function getInstanceForContact(
  supabase: any,
  companyId: string,
  numero: string,
  columns = "instance_name,status,provider,instance_token",
  userId?: string,
) {
  console.log("[getInstanceForContact] Buscando para:", numero, "Usuário:", userId);

  // 1. Tenta descobrir o canal pelo crm_cards (canal_chat, com fallback canal_entrada)
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
  console.log("[getInstanceForContact] Canal inicial (CRM):", canal);


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
    console.log("[getInstanceForContact] Buscando instância Meta para:", provider);
    const { data } = await supabase
      .from("whatsapp_instances")
      .select(columns)
      .eq("company_id", companyId)
      .eq("provider", provider)
      .eq("status", "connected");
    
    const instances = sortInstances(data ?? []);
    
    // Prioriza instâncias que têm token (token do Instagram/Messenger é vital)
    const withToken = instances.filter(i => !!i.instance_token);
    const inst = withToken[0] ?? instances[0] ?? null;

    if (!inst?.instance_name) {
      console.warn(`[getInstanceForContact] Nenhuma instância encontrada para o provedor ${provider} na empresa ${companyId}`);
      throw new Error(
        canal === "instagram"
          ? "Instagram não conectado. Reconecte o canal em Conexões."
          : "Messenger não conectado. Reconecte o canal em Conexões.",
      );
    }
    console.log("[getInstanceForContact] Instância Meta selecionada:", inst.instance_name);
    return inst;
  }
  
  // Identificador que não é telefone (IGSID/PSID/e-mail) nunca pode sair pelo WhatsApp
  if (!/^\+?\d[\d\s().-]{6,}$/.test(String(numero).trim())) {
    const { data: metaRows } = await supabase
      .from("whatsapp_instances")
      .select(columns)
      .eq("company_id", companyId)
      .in("provider", ["meta_instagram", "meta_messenger"])
      .eq("status", "connected");
    const metaInst = sortInstances(metaRows ?? []).filter((i: any) => !!i.instance_token)[0]
      ?? sortInstances(metaRows ?? [])[0]
      ?? null;
    if (metaInst?.instance_name) {
      console.log("[getInstanceForContact] Destinatário não-numérico, usando instância Meta:", metaInst.instance_name);
      return metaInst;
    }
    throw new Error("Este contato não é do WhatsApp. Reconecte o canal (Instagram/Messenger) em Conexões para responder.");
  }

  console.log("[getInstanceForContact] Fallback para WhatsApp");
  const preferred = await getPreferredWhatsappInstance(supabase, companyId, columns, userId);

  
  if (!preferred) {
     console.warn(`[getInstanceForContact] Nenhuma instância WhatsApp (atendente/geral) encontrada para empresa ${companyId}`);
  } else {
    // Se a instância preferida não está conectada, mas existe uma geral conectada, priorizamos a conectada
    if (preferred.status !== 'connected') {
      const { data: allInstances } = await supabase
        .from("whatsapp_instances")
        .select(columns)
        .eq("company_id", companyId)
        .eq("status", "connected");
      
      const connected = sortInstances(allInstances ?? [])[0];
      if (connected) {
        console.log("[getInstanceForContact] Instância preferida offline, usando alternativa conectada:", connected.instance_name);
        return connected;
      }
    }
  }
  return preferred;
}


export function buildWebhookUrl(token?: string | null, provider: "evolution" | "uazapi" = "evolution") {
  // Webhook precisa ser uma URL pública/canônica. Nunca usar URL de preview,
  // porque provedores externos não passam pelo auth-bridge do preview.
  const publicOrigin = (
    process.env.PUBLIC_APP_URL ||
    process.env.APP_URL ||
    process.env.VITE_PUBLIC_APP_URL ||
    "https://metrixcrm.com.br"
  ).replace(/\/+$/, "");
  const path = provider === "uazapi" ? "/api/public/uazapi-webhook" : "/api/public/whatsapp-webhook";
  const tokenQuery = token ? `?t=${encodeURIComponent(token)}` : "";
  return `${publicOrigin}${path}${tokenQuery}`;
}


export function extractWhatsappMessageId(resp: any): string | null {
  if (!resp || typeof resp !== "object") return null;
  // Busca ampla — Evolution v2 pode devolver em vários shapes
  const direct =
    resp?.key?.id ??
    resp?.message?.key?.id ??
    resp?.data?.key?.id ??
    resp?.data?.message?.key?.id ??
    resp?.response?.key?.id ??
    resp?.response?.message?.key?.id ??
    resp?.result?.key?.id ??
    resp?.messageId ??
    resp?.data?.messageId ??
    resp?.id ??
    resp?.data?.id ??
    null;
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  // Fallback: DFS por qualquer objeto com { key: { id: string, remoteJid } }
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
  console.warn("[extractWhatsappMessageId] shape não reconhecido:", JSON.stringify(resp).slice(0, 500));
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
  evoState: (instanceName: string) => Promise<any>,
  evoFetchInstance: (instanceName: string) => Promise<any | null>,
  instanceName: string,
  provider?: string,
): Promise<string | null> {
  // Conexões Meta (Instagram/Messenger) são "stateless" por API e não precisam de validação 'open' via QR
  if (provider?.startsWith("meta")) return null;

  try {
    const statePayload: any = await evoState(instanceName);
    const state = statePayload?.instance?.state || statePayload?.state || null;
    if (state === "open") {
      const instance = await evoFetchInstance(instanceName).catch(() => null);
      if (hasPermanentInstanceIssue(instance)) {
        return "Sessão WhatsApp inválida/removida. Reconecte lendo um novo QR Code.";
      }
      return null;
    }
    return `Instância WhatsApp não está aberta na Evolution (${state || "sem estado"})`;
  } catch (e: any) {
    return e?.message ?? "Falha ao validar conexão WhatsApp";
  }
}

export function isPermanentMetaSendError(provider: string | undefined, message: string | null): boolean {
  if (!provider?.startsWith("meta") || !message) return false;
  // Captura erros de Modo de Desenvolvimento (403 Forbidden) ou falta de permissões avançadas
  return /acesso avançado|advanced access|função no app|role on app|missing permissions|permission.*instagram_manage_messages|403|forbidden/i.test(message);
}

export async function resolveCompanyId(supabase: any, userId: string): Promise<string> {
  return resolveCompanyIdCached(supabase, userId);
}
