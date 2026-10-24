import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const transcribeAudio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { base64: string; mime?: string }) => {
    if (!input?.base64 || typeof input.base64 !== "string") {
      throw new Error("Áudio ausente.");
    }
    return { base64: input.base64, mime: input.mime || "audio/webm" };
  })
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY ausente.");

    const bin = Uint8Array.from(atob(data.base64), (c) => c.charCodeAt(0));
    if (bin.byteLength < 1024) {
      throw new Error("Gravação muito curta. Tente novamente.");
    }

    const mime = data.mime.split(";")[0];
    const extMap: Record<string, string> = {
      "audio/webm": "webm",
      "audio/mp4": "mp4",
      "audio/mpeg": "mp3",
      "audio/wav": "wav",
      "audio/ogg": "ogg",
    };
    const ext = extMap[mime] || "webm";

    const form = new FormData();
    form.append("model", "openai/gpt-4o-mini-transcribe");
    form.append("file", new Blob([bin], { type: mime }), `audio.${ext}`);

    const res = await fetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });

    if (!res.ok) {
      const t = await res.text().catch(() => "");
      if (res.status === 429) throw new Error("Limite de uso da IA atingido. Aguarde um momento.");
      if (res.status === 402) throw new Error("Créditos de IA esgotados no workspace.");
      throw new Error(`Falha ao transcrever: ${res.status} ${t.slice(0, 200)}`);
    }
    const json = await res.json();
    return { text: String(json?.text || "").trim() };
  });

/**
 * Transcreve o áudio de uma mensagem do chat (plugin ia-voz).
 * Baixa o arquivo do storage chat-media e envia ao gateway de IA.
 */
export const transcribeChatAudio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { messageId: string }) => {
    if (!input?.messageId) throw new Error("Mensagem ausente.");
    return { messageId: input.messageId };
  })
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { resolveCompanyIdCached } = await import("./company-cache");
    const companyId = await resolveCompanyIdCached(supabase, userId);

    const { capacidadeAtiva } = await import("@/lib/plugin-gate.server");
    if (!(await capacidadeAtiva(supabase, companyId, "ia-voz"))) {
      throw new Error("Instale o plugin Transcrição de Áudio na Loja de Plugins.");
    }

    const { data: msg } = await supabase
      .from("mensagens")
      .select("id,midia_url,midia_tipo,midia_mime")
      .eq("id", data.messageId)
      .eq("company_id", companyId)
      .maybeSingle();
    if (!msg || msg.midia_tipo !== "audio") throw new Error("Mensagem de áudio não encontrada.");

    let buf: Uint8Array | null = null;
    let mime = (msg.midia_mime || "audio/ogg").split(";")[0];

    // 1. Tentar carregar de message_attachments (Cloudflare R2)
    const { data: att } = await supabase
      .from("message_attachments")
      .select("storage_key, url, mime_type")
      .eq("message_id", data.messageId)
      .maybeSingle();

    if (att?.storage_key) {
      try {
        const { getMediaObject } = await import("@/lib/storage/r2.server");
        const r2Obj = await getMediaObject(att.storage_key);
        if (r2Obj?.body) {
          buf = await r2Obj.body.transformToByteArray();
          if (r2Obj.contentType) mime = r2Obj.contentType.split(";")[0];
        }
      } catch (e) {
        console.warn("[transcribe] Erro ao obter áudio do R2:", e);
      }
    }

    // 2. Tentar decodificar data URI ou baixar de URL direta
    if (!buf && msg.midia_url) {
      if (msg.midia_url.startsWith("data:")) {
        const commaIdx = msg.midia_url.indexOf(",");
        if (commaIdx !== -1) {
          const b64 = msg.midia_url.slice(commaIdx + 1);
          buf = Uint8Array.from(Buffer.from(b64, "base64"));
        }
      } else if (msg.midia_url.startsWith("http://") || msg.midia_url.startsWith("https://")) {
        try {
          const fRes = await fetch(msg.midia_url);
          if (fRes.ok) {
            buf = new Uint8Array(await fRes.arrayBuffer());
          }
        } catch (e) {
          console.warn("[transcribe] Erro ao baixar URL de mídia:", e);
        }
      }
    }

    // 3. Fallback para bucket legado Supabase Storage
    if (!buf && msg.midia_url) {
      const { storagePathFromUrl } = await import("./chat-media.functions");
      const path = storagePathFromUrl(msg.midia_url);
      if (path) {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: file } = await supabaseAdmin.storage.from("chat-media").download(path);
        if (file) {
          buf = new Uint8Array(await file.arrayBuffer());
        }
      }
    }

    if (!buf) throw new Error("Áudio indisponível para transcrição.");
    if (buf.byteLength < 512) throw new Error("Áudio muito curto.");
    if (buf.byteLength > 24 * 1024 * 1024) throw new Error("Áudio muito grande para transcrever.");

    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY ausente.");

    mime = mime || (msg.midia_mime || "audio/ogg").split(";")[0];
    const extMap: Record<string, string> = {
      "audio/webm": "webm",
      "audio/mp4": "mp4",
      "audio/mpeg": "mp3",
      "audio/wav": "wav",
      "audio/ogg": "ogg",
      "audio/opus": "ogg",
    };
    const ext = extMap[mime] || "ogg";

    const form = new FormData();
    form.append("model", "openai/gpt-4o-mini-transcribe");
    form.append("file", new Blob([buf], { type: mime }), `audio.${ext}`);

    const res = await fetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      if (res.status === 429) throw new Error("Limite de uso da IA atingido. Aguarde um momento.");
      if (res.status === 402) throw new Error("Créditos de IA esgotados no workspace.");
      throw new Error(`Falha ao transcrever: ${res.status} ${t.slice(0, 200)}`);
    }
    const json = await res.json();
    const text = String(json?.text || "").trim();
    if (!text) throw new Error("Não entendi o áudio.");
    return { text };
  });
