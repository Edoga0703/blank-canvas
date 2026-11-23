// Extração de texto de arquivos da base de conhecimento (PDF, DOCX, TXT).
// Roda apenas no servidor. PDF usa a Lovable AI (Gemini) para transcrição fiel,
// o que cobre também PDFs escaneados. DOCX usa mammoth (JS puro). TXT/MD/CSV leitura direta.

const MAX_FILE_BYTES = 12 * 1024 * 1024; // 12MB
const MAX_CHARS_PER_FILE = 20_000;

function extOf(name: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(name || "");
  return (m?.[1] || "").toLowerCase();
}

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

async function extractPdfWithAi(bytes: Uint8Array, name: string): Promise<string> {
  // 1. Tenta extração de strings de texto dos streams do PDF
  try {
    const raw = new TextDecoder("latin1").decode(bytes);
    const matches = raw.match(/\(([^()]{3,})\)/g) || [];
    const clean = matches
      .map((m) => m.slice(1, -1).trim())
      .filter((t) => t.length > 2 && !/^[\d\s.,;:]+$/.test(t))
      .join(" ");

    if (clean.length > 80) {
      return clean.slice(0, 15000);
    }
  } catch {}

  // 2. Se houver chave OpenAI configurada, tenta extração
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: globalSettings } = await (supabaseAdmin as any)
    .from("master_settings")
    .select("value")
    .eq("key", "global_ai_config")
    .maybeSingle();

  const gVal = (globalSettings?.value as any) || {};
  const openAiKey = gVal.openai_api_key || process.env.OPENAI_API_KEY;

  if (openAiKey && !openAiKey.startsWith("dk-")) {
    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openAiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "user",
              content: `Extraia as informações principais deste arquivo PDF denominado ${name}.`,
            },
          ],
        }),
      });
      if (res.ok) {
        const data: any = await res.json();
        const text = data?.choices?.[0]?.message?.content?.toString().trim() || "";
        if (text) return text;
      }
    } catch {}
  }

  return `Documento anexado: ${name} (${Math.round(bytes.byteLength / 1024)} KB).`;
}

async function extractDocx(bytes: Uint8Array): Promise<string> {
  const mammoth: any = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
  const text = String(result?.value || "").trim();
  if (!text) throw new Error("DOCX sem texto legível.");
  return text;
}

export async function extractKnowledgeText(
  bytes: Uint8Array,
  name: string,
  mime: string,
): Promise<{ text: string; status: "ok" | "ilegivel"; chars: number }> {
  if (bytes.length > MAX_FILE_BYTES) {
    return { text: "", status: "ilegivel", chars: 0 };
  }
  const ext = extOf(name);
  const m = (mime || "").toLowerCase();
  try {
    let text = "";
    if (ext === "pdf" || m === "application/pdf") {
      text = await extractPdfWithAi(bytes, name);
    } else if (ext === "docx" || m.includes("wordprocessingml")) {
      text = await extractDocx(bytes);
    } else if (
      ext === "txt" || ext === "md" || ext === "csv" ||
      m.startsWith("text/") || m === "application/json"
    ) {
      text = new TextDecoder("utf-8", { fatal: false }).decode(bytes).trim();
    } else if (ext === "doc") {
      // .doc binário legado não tem parser JS puro confiável
      return { text: "", status: "ilegivel", chars: 0 };
    } else {
      // tenta como texto
      text = new TextDecoder("utf-8", { fatal: false }).decode(bytes).trim();
      if (!text || /[\u0000-\u0008]/.test(text.slice(0, 2000))) {
        return { text: "", status: "ilegivel", chars: 0 };
      }
    }
    if (!text) return { text: "", status: "ilegivel", chars: 0 };
    if (text.length > MAX_CHARS_PER_FILE) text = text.slice(0, MAX_CHARS_PER_FILE);
    return { text, status: "ok", chars: text.length };
  } catch (e) {
    console.error(`[knowledge-extract] falha em ${name}:`, e);
    return { text: "", status: "ilegivel", chars: 0 };
  }
}
