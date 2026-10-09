// Fallback de download de mídia: alguns provedores (Uazapi) entregam a mídia
// como URL direta no payload do webhook em vez de expor endpoint de download.

function pickUrl(msg: any): string | null {
  const nodes = [msg?.imageMessage, msg?.videoMessage, msg?.audioMessage, msg?.documentMessage, msg?.stickerMessage];
  for (const n of nodes) {
    const u = n?.url || n?.directPath || n?.file || n?.mediaUrl;
    if (typeof u === "string" && /^https?:\/\//i.test(u)) return u;
  }
  return null;
}

function pickMeta(msg: any): { mimetype?: string; fileName?: string } {
  const n = msg?.imageMessage || msg?.videoMessage || msg?.audioMessage || msg?.documentMessage || msg?.stickerMessage || {};
  return { mimetype: n?.mimetype, fileName: n?.fileName };
}

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

/** Baixa a mídia diretamente da URL contida na mensagem. Retorna null se não houver URL/falhar. */
export async function mediaFromDirectUrl(
  msg: any,
  timeoutMs = 12_000,
): Promise<{ base64: string; mimetype?: string; fileName?: string } | null> {
  const url = pickUrl(msg);
  if (!url) return null;
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { signal: controller.signal }).finally(() => clearTimeout(t));
    if (!res.ok) {
      console.warn("[media-direct-url] http", res.status, url.slice(0, 120));
      return null;
    }
    const buf = new Uint8Array(await res.arrayBuffer());
    if (!buf.length) return null;
    const meta = pickMeta(msg);
    return {
      base64: toBase64(buf),
      mimetype: res.headers.get("content-type") || meta.mimetype,
      fileName: meta.fileName,
    };
  } catch (e: any) {
    console.warn("[media-direct-url]", e?.message);
    return null;
  }
}
