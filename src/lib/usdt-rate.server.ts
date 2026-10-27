// Servicio de cotización de USDT y divisas en tiempo real (BCV, Paralelo, Binance P2P)

interface LiveRateCache {
  rates: {
    usdtParalelo: number;
    usdOficialBcv: number;
    updatedAt: string;
    fuente: string;
  };
  fetchedAt: number;
}

let cachedRate: LiveRateCache | null = null;
const CACHE_TTL_MS = 3 * 60 * 1000; // 3 minutos de caché en memoria

/**
 * Consulta la tasa de cambio en vivo para USDT y Dólar (Paralelo / BCV).
 * Utiliza fallback automático entre DolarApi y Yadio.
 */
export async function getLiveUsdtRates(): Promise<{
  usdtParalelo: number;
  usdOficialBcv: number;
  updatedAt: string;
  fuente: string;
} | null> {
  const now = Date.now();
  if (cachedRate && now - cachedRate.fetchedAt < CACHE_TTL_MS) {
    return cachedRate.rates;
  }

  try {
    // 1. Intento principal: DolarApi (proporciona tanto Oficial BCV como Paralelo)
    const res = await fetch("https://ve.dolarapi.com/v1/dolares", {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(4000),
    });

    if (res.ok) {
      const data: any[] = await res.json().catch(() => []);
      const oficialItem = data.find((d) => d.fuente === "oficial" || d.nombre?.toLowerCase().includes("oficial"));
      const paraleloItem = data.find((d) => d.fuente === "paralelo" || d.nombre?.toLowerCase().includes("paralelo"));

      const usdOficialBcv = Number(oficialItem?.promedio || oficialItem?.venta || 0);
      const usdtParalelo = Number(paraleloItem?.promedio || paraleloItem?.venta || 0);

      if (usdOficialBcv > 0 || usdtParalelo > 0) {
        const rates = {
          usdtParalelo: usdtParalelo || usdOficialBcv,
          usdOficialBcv: usdOficialBcv || usdtParalelo,
          updatedAt: new Date().toLocaleTimeString("es-VE", { hour: "2-digit", minute: "2-digit" }),
          fuente: "DolarApi / BCV & Paralelo",
        };
        cachedRate = { rates, fetchedAt: now };
        return rates;
      }
    }
  } catch (e: any) {
    console.warn("[usdt-rate] DolarApi falló, intentando Yadio:", e?.message);
  }

  try {
    // 2. Fallback secundario: Yadio
    const res = await fetch("https://api.yadio.io/rate/VES/USD", {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(4000),
    });

    if (res.ok) {
      const data: any = await res.json().catch(() => null);
      const rate = Number(data?.rate || 0);
      if (rate > 0) {
        const rates = {
          usdtParalelo: rate,
          usdOficialBcv: rate,
          updatedAt: new Date().toLocaleTimeString("es-VE", { hour: "2-digit", minute: "2-digit" }),
          fuente: "Yadio Market Rate",
        };
        cachedRate = { rates, fetchedAt: now };
        return rates;
      }
    }
  } catch (e: any) {
    console.warn("[usdt-rate] Yadio falló:", e?.message);
  }

  // Si falló pero tenemos caché previo, lo usamos
  if (cachedRate) return cachedRate.rates;

  return null;
}

/**
 * Genera el bloque de contexto inyectable en el prompt del agente.
 */
export function buildUsdtRatePromptSnippet(rates: {
  usdtParalelo: number;
  usdOficialBcv: number;
  updatedAt: string;
  fuente: string;
}): string {
  const fParalelo = rates.usdtParalelo.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fBcv = rates.usdOficialBcv.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return `\n\n═══════════════════════════════════════════════════════
COTIZACIÓN Y TASA DE CAMBIO USDT / USD EN VIVO (${rates.fuente}):
• Tasa Paralelo / Binance (USDT): 1 USDT = ${fParalelo} Bs (VES)
• Tasa Oficial BCV: 1 USD = ${fBcv} Bs (VES)
• Hora de actualización: ${rates.updatedAt}

REGLAS PARA PAGOS EN BOLÍVARES / PAGO MÓVIL / USDT:
1. Cuando el cliente pregunte a qué tasa se calcula, cuánto es en bolívares, pagos por Pago Móvil o transferencia en Bs, utiliza SIEMPRE esta tasa actual (${fParalelo} Bs/USDT).
2. Si tus precios en catálogo están en USD o USDT y el cliente solicita pagar en Bs, multiplica el precio por la tasa actual (${fParalelo}) para darle el monto exacto en bolívares.
3. Sé transparente e informa la tasa con naturalidad (ejemplo: "Manejamos una tasa de ${fParalelo} Bs por USDT").
═══════════════════════════════════════════════════════`;
}
