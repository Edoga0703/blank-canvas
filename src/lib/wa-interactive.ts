// Respostas interativas do WhatsApp (formulários/Flows de anúncios, botões e listas).
// Sem isso a mensagem chega sem texto e o chat mostra "Mídia indisponível".

function safeParse(v: any): any {
  if (typeof v !== "string") return v;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
}

function findNode(obj: any, keys: string[], depth = 0): any {
  if (!obj || typeof obj !== "object" || depth > 8) return null;
  for (const k of Object.keys(obj)) {
    const lower = k.toLowerCase();
    if (keys.some((t) => lower === t.toLowerCase())) return obj[k];
  }
  for (const k of Object.keys(obj)) {
    const res = findNode(obj[k], keys, depth + 1);
    if (res) return res;
  }
  return null;
}

function prettyKey(raw: string): string {
  return raw
    .replace(/^screen_\d+_?/i, "")
    .replace(/_[0-9a-f]{6,}$/i, "")
    .replace(/_\d+$/, "")
    .replace(/_/g, " ")
    .trim();
}

function prettyValue(raw: any): string {
  const v = String(raw ?? "").trim();
  return v.replace(/^\d+_/, "").replace(/_/g, " ").trim();
}

/** Texto legível de uma resposta de formulário (Flow) do WhatsApp, ou null. */
export function extractFlowResponseText(payload: any): string | null {
  const flow = findNode(payload, ["NativeFlowResponseMessage", "nativeFlowResponseMessage"]);
  if (!flow) return null;

  const params = safeParse(flow.paramsJSON ?? flow.paramsJson ?? flow.params) || {};
  const lines: string[] = [];

  // Caminho preferido: resposta completa com rótulos originais do formulário.
  const responseMessage = safeParse(params?.wa_flow_response_params?.response_message);
  const screens = Array.isArray(responseMessage?.response) ? responseMessage.response : [];
  for (const screen of screens) {
    for (const comp of screen?.components ?? []) {
      if (comp?.value === undefined || comp?.value === null || comp?.value === "") continue;
      const label = String(comp.label || comp.name || "").trim();
      lines.push(`${label ? `${label}: ` : ""}${prettyValue(comp.value)}`);
    }
  }

  // Fallback: pares screen_0_* do paramsJSON.
  if (!lines.length) {
    for (const [k, v] of Object.entries(params)) {
      if (!/^screen_/i.test(k)) continue;
      if (typeof v === "object") continue;
      const label = prettyKey(k);
      lines.push(`${label ? `${label}: ` : ""}${prettyValue(v)}`);
    }
  }

  if (!lines.length) return null;
  return `📝 Formulário respondido\n${lines.join("\n")}`;
}

/** Texto de respostas de botão/lista, ou null. */
export function extractButtonReplyText(payload: any): string | null {
  const btn = findNode(payload, ["buttonsResponseMessage", "templateButtonReplyMessage"]);
  if (btn) {
    const t = btn.selectedDisplayText || btn.selectedButtonId || btn.selectedId;
    if (t) return String(t);
  }
  const list = findNode(payload, ["listResponseMessage"]);
  if (list) {
    const t = list.title || list.singleSelectReply?.selectedRowId;
    if (t) return String(t);
  }
  return null;
}

/** Texto legível para qualquer resposta interativa suportada. */
export function extractInteractiveText(payload: any): string | null {
  return extractFlowResponseText(payload) ?? extractButtonReplyText(payload);
}
