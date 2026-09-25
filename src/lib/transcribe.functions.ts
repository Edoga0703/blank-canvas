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
    form.append("language", "pt");

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

    const { storagePathFromUrl } = await import("./chat-media.functions");
    const path = storagePathFromUrl(msg.midia_url);
    if (!path) throw new Error("Áudio indisponível para transcrição.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: file, error } = await supabaseAdmin.storage.from("chat-media").download(path);
    if (error || !file) throw new Error("Não consegui baixar o áudio.");
    const buf = new Uint8Array(await file.arrayBuffer());
    if (buf.byteLength < 512) throw new Error("Áudio muito curto.");
    if (buf.byteLength > 24 * 1024 * 1024) throw new Error("Áudio muito grande para transcrever.");

    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY ausente.");

    const mime = (msg.midia_mime || "audio/ogg").split(";")[0];
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
    form.append("language", "pt");

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
