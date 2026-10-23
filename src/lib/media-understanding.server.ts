// Compreensão de mídia recebida pelo WhatsApp para o agente de IA:
// transcreve áudios, descreve imagens/vídeos e lê documentos (PDF).

const GATEWAY = "https://ai.gateway.lovable.dev/v1";

function apiKey() {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("LOVABLE_API_KEY ausente.");
  return key;
}

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

async function download(url: string): Promise<{ bytes: Uint8Array; mime: string } | null> {
  try {
    if (!url) return null;
    // Suporte direto a Data URIs Base64 (ex: retornados por dapiDownloadMedia)
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

/** Transcreve um áudio recebido. Retorna null se não for possível. */
export async function transcribeIncomingAudio(url: string, mime?: string | null): Promise<string | null> {
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
  form.append("model", "openai/gpt-4o-mini-transcribe");
  form.append("file", new Blob([file.bytes.buffer as ArrayBuffer], { type: finalMime }), `audio.${ext}`);

  const res = await fetch(`${GATEWAY}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey()}`, "Lovable-API-Key": apiKey() },
    body: form,
  });
  if (!res.ok) {
    console.warn("[media-understanding] transcription failed:", res.status, await res.text().catch(() => ""));
    return null;
  }
  const json: any = await res.json().catch(() => null);
  const text = (json?.text || "").trim();
  return text || null;
}

/** Descreve uma imagem/vídeo ou lê um documento recebido. */
export async function describeIncomingFile(
  url: string,
  tipo: "image" | "video" | "document",
  mime?: string | null,
  caption?: string | null,
): Promise<string | null> {
  const file = await download(url);
  if (!file) return null;
  const finalMime = (mime || file.mime || "application/octet-stream").split(";")[0];
  const dataUrl = `data:${finalMime};base64,${toBase64(file.bytes)}`;

  const instrucao = tipo === "document"
    ? "Resuma objetivamente o conteúdo deste documento enviado pelo cliente, destacando dados relevantes para atendimento comercial."
    : "Descreva objetivamente o que aparece nesta mídia enviada pelo cliente, incluindo textos visíveis, produtos, valores e detalhes úteis para o atendimento.";

  const content: any[] = [{ type: "text", text: caption ? `${instrucao}\nLegenda do cliente: ${caption}` : instrucao }];
  if (tipo === "image") {
    content.push({ type: "image_url", image_url: { url: dataUrl } });
  } else if (tipo === "video") {
    content.push({ type: "video_url", video_url: { url: dataUrl } });
  } else {
    if (finalMime !== "application/pdf") return null;
    content.push({ type: "file", file: { filename: "documento.pdf", file_data: dataUrl } });
  }

  const res = await fetch(`${GATEWAY}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey()}`, "Lovable-API-Key": apiKey(), "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [{ role: "user", content }],
    }),
  });
  if (!res.ok) {
    console.warn("[media-understanding] vision failed:", res.status, await res.text().catch(() => ""));
    return null;
  }
  const json: any = await res.json().catch(() => null);
  const out = (json?.choices?.[0]?.message?.content || "").trim();
  return out || null;
}

/** Gera áudio (base64) a partir de um texto, para a IA responder em áudio. */
export async function textToSpeechBase64(texto: string): Promise<string | null> {
  try {
    const res = await fetch(`${GATEWAY}/audio/speech`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey()}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini-tts",
        input: texto.slice(0, 1500),
        voice: "alloy",
        response_format: "mp3",
        stream_format: "audio",
      }),
    });
    if (!res.ok) {
      console.warn("[media-understanding] tts failed:", res.status, await res.text().catch(() => ""));
      return null;
    }
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (!bytes.byteLength) return null;
    return toBase64(bytes);
  } catch (e: any) {
    console.warn("[media-understanding] tts error:", e?.message);
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
