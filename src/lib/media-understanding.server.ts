// Compreensão de mídia recebida pelo WhatsApp para o agente de IA:
// transcreve áudios, descreve imagens/vídeos e lê documentos (PDF) via provedores diretos (OpenAI/Gemini).
// Conexão ao Lovable Gateway desativada para proteger créditos do workspace.

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

async function getMasterAiKeys() {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: globalSettings } = await (supabaseAdmin as any)
      .from("master_settings")
      .select("value")
      .eq("key", "global_ai_config")
      .maybeSingle();

    const gVal = (globalSettings?.value as any) || {};
    const openAiKey = (gVal.openai_api_key || process.env.OPENAI_API_KEY || "").trim();
    const geminiKey = (gVal.gemini_api_key || process.env.GEMINI_API_KEY || "").trim();
    return {
      openAiKey: openAiKey.startsWith("dk-") ? "" : openAiKey,
      geminiKey,
    };
  } catch {
    const open = (process.env.OPENAI_API_KEY || "").trim();
    return {
      openAiKey: open.startsWith("dk-") ? "" : open,
      geminiKey: (process.env.GEMINI_API_KEY || "").trim(),
    };
  }
}

async function download(url: string): Promise<{ bytes: Uint8Array; mime: string } | null> {
  try {
    if (!url) return null;
    if (url.startsWith("data:")) {
      const commaIdx = url.indexOf(",");
      if (commaIdx === -1) return null;
      const meta = url.slice(0, commaIdx);
      const b64 = url.slice(commaIdx + 1);
      const mimeMatch = meta.match(/^data:([^;,]+)/i);
      const mime = mimeMatch?.[1] || "application/octet-stream";
      const buf = new Uint8Array(Buffer.from(b64, "base64"));
      if (!buf.byteLength) return null;
      return { bytes: buf, mime };
    }

    const absolute = url.startsWith("http")
      ? url
      : `${process.env["PUBLIC_APP_URL"] || process.env["PUBLIC_BASE_URL"] || ""}${url}`;
    if (!absolute.startsWith("http")) return null;
    const res = await fetch(absolute);
    if (!res.ok) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    return { bytes: buf, mime: res.headers.get("content-type") || "application/octet-stream" };
  } catch {
    return null;
  }
}

/** Transcreve um áudio recebido via Whisper direto (se chave OpenAI estiver configurada). */
export async function transcribeIncomingAudio(url: string, mime?: string | null): Promise<string | null> {
  const { openAiKey } = await getMasterAiKeys();
  if (!openAiKey) return null; // Sem chave direta, pula sem consumir Lovable

  const file = await download(url);
  if (!file || file.bytes.byteLength < 512) return null;
  const finalMime = (mime || file.mime || "audio/ogg").split(";")[0];
  const extMap: Record<string, string> = {
    "audio/ogg": "ogg",
    "audio/opus": "ogg",
    "audio/mpeg": "mp3",
    "audio/mp4": "mp4",
    "audio/webm": "webm",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
  };
  const ext = extMap[finalMime] || "ogg";

  const form = new FormData();
  form.append("model", "whisper-1");
  form.append("file", new Blob([file.bytes.buffer as ArrayBuffer], { type: finalMime }), `audio.${ext}`);

  try {
    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${openAiKey}` },
      body: form,
    });
    if (!res.ok) return null;
    const json: any = await res.json().catch(() => null);
    return (json?.text || "").trim() || null;
  } catch {
    return null;
  }
}

/** Descreve uma imagem/vídeo ou lê um documento recebido usando visão direta. */
export async function describeIncomingFile(
  url: string,
  tipo: "image" | "video" | "document",
  mime?: string | null,
  caption?: string | null,
  options?: { provider?: string; model?: string },
): Promise<string | null> {
  const { openAiKey } = await getMasterAiKeys();
  if (!openAiKey) return null; // Sem chave direta de visão, não chama Lovable

  const file = await download(url);
  if (!file) return null;
  const finalMime = (mime || file.mime || "application/octet-stream").split(";")[0];
  const dataUrl = `data:${finalMime};base64,${toBase64(file.bytes)}`;

  const instrucao =
    tipo === "document"
      ? "Analiza este documento enviado por el cliente. Si es un comprobante de pago, factura, presupuesto o contrato, extrae de manera estructurada con subtítulos, viñetas y negritas: Tipo de documento, Estatus, Montos y monedas, Número de referencia/factura, Bancos o entidades emisora y receptora, Fecha/hora y Partes involucradas. Responde en el mismo idioma del documento (español por defecto) con formato limpio, espaciado y profesional."
      : "Analiza y describe de forma estructurada esta imagen enviada por el cliente. Si es un comprobante de pago (ej. Pago Móvil, Transferencia bancaria, Zelle), factura o recibo, extrae detalladamente con subtítulos, viñetas y negritas: Estatus de la transacción, Monto y moneda, Banco emisor y receptor, Número de referencia, Fecha y hora, y Datos de las partes (teléfono, cédula o beneficiario). Si es un producto o foto general, describe lo que aparece con textos y detalles útiles. Responde en el mismo idioma del contenido (español por defecto) con formato limpio, ordenado y espaciado.";

  const content: any[] = [{ type: "text", text: caption ? `${instrucao}\nLegenda do cliente: ${caption}` : instrucao }];
  if (tipo === "image") {
    content.push({ type: "image_url", image_url: { url: dataUrl } });
  } else if (tipo === "video") {
    return null; // Vídeo requer processamento assíncrono complexo
  } else {
    if (finalMime !== "application/pdf") return null;
    return null;
  }

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openAiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: options?.model || "gpt-4o-mini",
        messages: [{ role: "user", content }],
      }),
    });
    if (!res.ok) return null;
    const json: any = await res.json().catch(() => null);
    const out = (json?.choices?.[0]?.message?.content || "").trim();
    return out || null;
  } catch {
    return null;
  }
}

/** Gera áudio (base64) a partir de um texto, via OpenAI TTS direto se houver chave. */
export async function textToSpeechBase64(texto: string): Promise<string | null> {
  const { openAiKey } = await getMasterAiKeys();
  if (!openAiKey) return null;

  try {
    const res = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openAiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "tts-1",
        input: texto.slice(0, 1500),
        voice: "alloy",
        response_format: "mp3",
      }),
    });
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (!bytes.byteLength) return null;
    return toBase64(bytes);
  } catch {
    return null;
  }
}

/**
 * Converte a mídia recebida em texto que o agente de IA consegue entender.
 * Retorna null quando não há nada aproveitável.
 */
export async function understandIncomingMedia(params: {
  url: string | null;
  tipo: string | null;
  mime?: string | null;
  caption?: string | null;
}): Promise<{ texto: string; isAudio: boolean } | null> {
  const { url, tipo, mime, caption } = params;
  if (!url || !tipo) return null;
  try {
    if (tipo === "audio") {
      const t = await transcribeIncomingAudio(url, mime);
      if (!t) return null;
      return { texto: t, isAudio: true };
    }
    if (tipo === "image" || tipo === "video" || tipo === "document") {
      const d = await describeIncomingFile(url, tipo, mime, caption);
      if (!d) return null;
      const rotulo = tipo === "document" ? "documento" : tipo === "video" ? "vídeo" : "imagem";
      const legenda = caption ? `\nLegenda: ${caption}` : "";
      return { texto: `[O cliente enviou uma ${rotulo}. Conteúdo: ${d}]${legenda}`, isAudio: false };
    }
  } catch (e: any) {
    console.warn("[media-understanding] failed:", e?.message);
  }
  return null;
}

/**
 * Obtiene la descripción de una imagen/documento desde el caché (raw_payload.ai_media_description)
 * o la analiza UNA ÚNICA VEZ y la persiste en PostgreSQL para futuros contextos.
 */
export async function getOrAnalyzeMessageMedia(
  supabaseAdmin: any,
  msg: {
    id: string;
    midia_url?: string | null;
    midia_tipo?: string | null;
    midia_mime?: string | null;
    texto?: string | null;
    raw_payload?: any;
  },
  companyId: string,
  options?: { provider?: string; model?: string },
): Promise<string | null> {
  if (!msg.midia_url || (msg.midia_tipo !== "image" && msg.midia_tipo !== "document")) {
    return null;
  }

  // 1. Verificar si ya fue analizado previamente (Caché persistido en BD)
  const cached =
    msg.raw_payload?.ai_media_description ||
    (typeof msg.raw_payload === "object" && msg.raw_payload !== null
      ? (msg.raw_payload as any).ai_media_description
      : null);

  if (cached && typeof cached === "string" && cached.trim().length > 0) {
    return cached.trim();
  }

  // 2. Si no está en caché, analizar una única vez
  try {
    const desc = await describeIncomingFile(
      msg.midia_url,
      msg.midia_tipo as "image" | "document",
      msg.midia_mime,
      msg.texto,
      options,
    );

    if (desc && desc.trim().length > 0) {
      const cleanDesc = desc.trim();
      const currentPayload =
        typeof msg.raw_payload === "object" && msg.raw_payload !== null
          ? { ...msg.raw_payload }
          : {};
      currentPayload.ai_media_description = cleanDesc;
      currentPayload.ai_media_analyzed_at = new Date().toISOString();

      if (msg.id && supabaseAdmin) {
        await supabaseAdmin
          .from("mensagens")
          .update({ raw_payload: currentPayload })
          .eq("id", msg.id);
      }

      if (msg.raw_payload && typeof msg.raw_payload === "object") {
        msg.raw_payload.ai_media_description = cleanDesc;
      }

      return cleanDesc;
    }
  } catch (err: any) {
    console.warn("[getOrAnalyzeMessageMedia] Error analyzing media:", err?.message);
  }

  return null;
}
