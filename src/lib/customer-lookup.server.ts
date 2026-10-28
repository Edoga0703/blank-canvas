// Módulo para consultar información de clientes en sistemas externos (ej. SMP / Cerebro / CRM externo)

export interface CustomerLookupConfig {
  enabled: boolean;
  name?: string;
  url: string;
  method?: "GET" | "POST";
  headers?: Record<string, string>;
}

interface LookupCacheItem {
  contextSnippet: string;
  fetchedAt: number;
}

const lookupCache = new Map<string, LookupCacheItem>();
const CACHE_TTL_MS = 60 * 1000; // 1 minuto de caché por teléfono para evitar llamadas repetidas en ráfagas

/**
 * Formatea fechas a formato legible DD/MM/AAAA
 */
function formatDate(val: any): string {
  if (!val) return "N/D";
  const d = new Date(val);
  if (Number.isNaN(d.getTime())) return String(val);
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const year = d.getUTCFullYear();
  return `${day}/${month}/${year}`;
}

/**
 * Consulta la API externa con el número de teléfono del cliente
 * y formatea la respuesta en un bloque estructurado para el prompt de la IA.
 */
export async function queryCustomerLookup(
  config: CustomerLookupConfig,
  phone: string,
): Promise<string> {
  if (!config?.enabled || !config?.url) return "";
  const { isSafeUrl } = await import("./agent-sandbox.server");
  if (!isSafeUrl(config.url)) {
    console.warn(`[customer-lookup] URL bloqueada por seguridad SSRF: ${config.url}`);
    return "";
  }
  const cleanPhone = (phone || "").trim();
  if (!cleanPhone) return "";

  const cacheKey = `${config.url}::${cleanPhone}`;
  const now = Date.now();
  const cached = lookupCache.get(cacheKey);
  if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.contextSnippet;
  }

  const method = (config.method || "POST").toUpperCase();
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
    ...(config.headers || {}),
  };

  try {
    let url = config.url;
    let body: string | undefined = undefined;

    if (method === "GET") {
      const u = new URL(url);
      u.searchParams.set("phone", cleanPhone);
      url = u.toString();
    } else {
      body = JSON.stringify({ phone: cleanPhone });
    }

    const res = await fetch(url, {
      method,
      headers,
      body,
      redirect: "error",
      signal: AbortSignal.timeout(4000), // Timeout de 4s para no ralentizar el bot
    });

    if (!res.ok) {
      console.warn(`[customer-lookup] API responded with ${res.status}: ${res.statusText}`);
      return "";
    }

    const data: any = await res.json().catch(() => null);
    if (!data) return "";

    let snippet = "";

    // Formato estilo SMP / Cerebro: { customer, subscriptions, recent_updates }
    const customer = data.customer || (data.cliente ?? null);
    const subs = Array.isArray(data.subscriptions)
      ? data.subscriptions
      : Array.isArray(data.cuentas)
        ? data.cuentas
        : Array.isArray(data.servicios)
          ? data.servicios
          : [];

    if (customer || subs.length > 0) {
      const clientName = customer?.name || customer?.nombre || customer?.display_id || "Cliente";
      const clientPhone = customer?.phone || cleanPhone;

      const linesResumen = subs.map((s: any) => {
        const tipo = s?.account?.type || s?.servicio || s?.producto || "Servicio";
        const pantalla = s?.screen_display_id || s?.pantalla || [tipo, s?.screen_label].filter(Boolean).join(" ");
        const estado = s?.status || s?.estado || "ACTIVO";
        const dias = Number.isFinite(Number(s?.days_left))
          ? Number(s.days_left)
          : null;

        const vencimiento = dias === null
          ? (s?.expires_at ? `Vence: ${formatDate(s.expires_at)}` : "Sin fecha clara")
          : dias < 0
            ? `⚠️ VENCIDA hace ${Math.abs(dias)} días`
            : `Vence en ${dias} días (${formatDate(s?.expires_at)})`;

        return `• Servicio: ${tipo} | Pantalla: ${pantalla || "1"} | Estado: ${estado} | ${vencimiento}`;
      });

      const credenciales = subs.map((s: any) => {
        const tipo = s?.account?.type || s?.servicio || "Servicio";
        const email = s?.account?.email || s?.email || s?.usuario || "N/D";
        const pass = s?.account?.password || s?.password || s?.clave || "N/D";
        const pin = s?.pin ? ` | PIN: ${s.pin}` : "";
        return `• ${tipo}: Usuario: ${email} | Clave: ${pass}${pin}`;
      });

      snippet = `\n\n═══════════════════════════════════════════════════════
[DATOS REALES DEL CLIENTE DESDE TU SISTEMA EXTERNO (${config.name || "Gestión"})]:
Cliente registrado: ${clientName} (${clientPhone})
Servicios / Cuentas asignadas (${subs.length}):
${linesResumen.join("\n") || "• Sin cuentas activas actualmente."}

Credenciales disponibles del cliente:
${credenciales.join("\n") || "• Sin credenciales registradas."}

DIRECTIVA DE ATENCIÓN CON DATOS REALES:
- Usa estos datos como la verdad absoluta de tu panel.
- Si el cliente pregunta si su cuenta está vencida o cuántos días le quedan, dale la respuesta exacta de la lista anterior.
- Si su servicio está vencido, no lo culpes ni inventes; ofrécele amablemente renovar.
═══════════════════════════════════════════════════════`;
    } else if (typeof data === "object") {
      // Formato genérico de API de cliente
      snippet = `\n\n═══════════════════════════════════════════════════════
[DATOS REALES DEL CLIENTE DESDE SISTEMA EXTERNO (${config.name || "API"})]:
${JSON.stringify(data, null, 2)}
═══════════════════════════════════════════════════════`;
    }

    if (snippet) {
      lookupCache.set(cacheKey, { contextSnippet: snippet, fetchedAt: now });
    }

    return snippet;
  } catch (err: any) {
    console.warn("[customer-lookup] Error consultando API:", err?.message);
    return "";
  }
}
