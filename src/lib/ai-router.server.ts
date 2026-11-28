export type TurnRoute =
  | "greeting_simple"
  | "payment_receipt"
  | "scheduling"
  | "catalog_price"
  | "general";

export interface TurnContextPlan {
  route: TurnRoute;
  loadCatalog: boolean;
  loadRag: boolean;
  historyLimit: number;
  receiptDetected: boolean;
}

function normalizeForMatch(raw: string): string {
  return String(raw || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

const RECEIPT_TEXT_RE =
  /\b(comprobante|comprovante|pago\s*movil|pix|zelle|binance|referencia|transferencia|voucher|baucher|recibo|deposito|pagado|comprobacion|pago\s+realizado|envio\s+pago)\b/i;

const ATTACHMENT_PAYMENT_RE =
  /\[(?:archivo\s+adjunto|o\s+cliente\s+enviou\s+uma?\s+(?:imagem|documento))[\s\S]*(comprobante|comprovante|pago\s*movil|transferencia|referencia|zelle|pix|binance|monto|banco|recibo|factura|deposito)/i;

const SCHEDULING_RE =
  /\b(cita|citas|agendar|agenda|agendamento|horario|horarios|disponibilidad|disponible|turno|turnos|reserva|reservar|reagendar|marcar\s+horario|hora\s+disponible|que\s+dias|que\s+horas)\b/i;

const CATALOG_PRICE_RE =
  /\b(precio|precios|preco|precos|cuanto\s+(?:cuesta|sale|vale)|quanto\s+(?:custa|sai|vale)|valor|valores|catalogo|producto|productos|produto|produtos|servicio|servicios|servico|servicos|plan|planes|plano|planos|stock|envio|entrega|cotizacion|presupuesto|orcamento|menu|carta|comprar|adquirir|paquete|combo)\b/i;

const SIMPLE_GREETING_RE =
  /^(?:hola+|buen[oa]s(?:\s+(?:dias|tardes|noches))?|saludos|hello|hi|hey|ok+|okay|dale|vale|listo|perfecto|entendido|genial|excelente|gracias|muchas\s+gracias|mil\s+gracias|de\s+nada|oi+|ol[ae]|bom\s+dia|boa\s+(?:tarde|noite)|obrigad[oa]|muito\s+obrigad[oa]|tudo\s+bem|beleza|show|top|perfeito|blz)[\s!.,;?]*$/i;

/**
 * Pre-router determinista antes del LLM (costo $0, <2ms).
 * Decide cuánto contexto cargar (catálogo, RAG e historial) sin saturar Drael AI.
 */
export function planTurnContext(params: {
  text: string;
  activeTask?: Record<string, any> | null;
  catalogCount?: number | null;
}): TurnContextPlan {
  const norm = normalizeForMatch(params.text);
  const raw = String(params.text || "");

  const hasActiveTask = Boolean(
    params.activeTask &&
      typeof params.activeTask === "object" &&
      Object.keys(params.activeTask).length > 0 &&
      !["completed", "closed", "cancelled"].includes(
        String(params.activeTask.estado || params.activeTask.status || "").toLowerCase(),
      ),
  );

  // 1. Detección de comprobante de pago / pago móvil / transferencia
  if (RECEIPT_TEXT_RE.test(norm) || ATTACHMENT_PAYMENT_RE.test(normalizeForMatch(raw))) {
    return {
      route: "payment_receipt",
      loadCatalog: false,
      loadRag: true,
      historyLimit: 10,
      receiptDetected: true,
    };
  }

  // 2. Agendamiento / citas / horarios
  if (SCHEDULING_RE.test(norm)) {
    return {
      route: "scheduling",
      loadCatalog: true,
      loadRag: true,
      historyLimit: 10,
      receiptDetected: false,
    };
  }

  // 3. Catálogo / precios / planes / compra
  if (CATALOG_PRICE_RE.test(norm)) {
    return {
      route: "catalog_price",
      loadCatalog: true,
      loadRag: true,
      historyLimit: 10,
      receiptDetected: false,
    };
  }

  // 4. Saludo o confirmación trivial sin tarea en curso
  const strippedEmoji = norm.replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, "").trim();
  if (!hasActiveTask && strippedEmoji.length > 0 && strippedEmoji.length <= 45 && SIMPLE_GREETING_RE.test(strippedEmoji)) {
    return {
      route: "greeting_simple",
      loadCatalog: false,
      loadRag: false,
      historyLimit: 6,
      receiptDetected: false,
    };
  }

  // 5. Consulta general (carga catálogo solo si es pequeño/mediano <= 30 ítems)
  const smallCatalog = typeof params.catalogCount === "number" && params.catalogCount > 0 && params.catalogCount <= 30;
  return {
    route: "general",
    loadCatalog: smallCatalog,
    loadRag: true,
    historyLimit: 12,
    receiptDetected: false,
  };
}
