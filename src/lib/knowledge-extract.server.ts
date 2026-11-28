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
  // 1. Tenta extração real do texto em JS/Workerd via unpdf
  let unpdfText = "";
  try {
    const { getDocumentProxy, extractText } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const parsed = await extractText(pdf, { mergePages: true });
    unpdfText = String(parsed?.text || "").replace(/\s+/g, " ").trim();
    if (unpdfText.length >= 80) {
      return unpdfText.slice(0, MAX_CHARS_PER_FILE);
    }
  } catch (unpdfErr) {
    console.warn("[extractPdfWithAi] unpdf fallback para PDF:", unpdfErr);
  }

  // 2. Se for PDF escaneado (< 80 chars úteis) e houver chave Google Gemini, envia os bytes reais do PDF
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: globalSettings } = await (supabaseAdmin as any)
    .from("master_settings")
    .select("value")
    .eq("key", "global_ai_config")
    .maybeSingle();

  const gVal = (globalSettings?.value as any) || {};
  const geminiKey = (gVal.gemini_api_key || process.env.GEMINI_API_KEY || "").trim();

  if (geminiKey) {
    try {
      const b64 = toBase64(bytes);
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${geminiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: `Extrae de forma clara, detallada y organizada toda la información relevante de este documento PDF titulado "${name}" para ser usada como base de conocimiento de atención al cliente (productos, servicios, precios, preguntas frecuentes, políticas).`,
                  },
                  {
                    inlineData: {
                      mimeType: "application/pdf",
                      data: b64,
                    },
                  },
                ],
              },
            ],
          }),
        },
      );
      if (res.ok) {
        const data: any = await res.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
        if (text.length >= 20) return text.slice(0, MAX_CHARS_PER_FILE);
      }
    } catch (geminiErr) {
      console.warn("[extractPdfWithAi] Error extrayendo PDF con Gemini:", geminiErr);
    }
  }

  return unpdfText.length >= 20 ? unpdfText.slice(0, MAX_CHARS_PER_FILE) : "";
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
      // eslint-disable-next-line no-control-regex
      if (!text || /[\u0000-\u0008]/.test(text.slice(0, 2000))) {
        return { text: "", status: "ilegivel", chars: 0 };
      }
    }
    if (!text || text.trim().length < 20) return { text: "", status: "ilegivel", chars: 0 };
    if (text.length > MAX_CHARS_PER_FILE) text = text.slice(0, MAX_CHARS_PER_FILE);
    return { text, status: "ok", chars: text.length };
  } catch (e) {
    console.error(`[knowledge-extract] falha em ${name}:`, e);
    return { text: "", status: "ilegivel", chars: 0 };
  }
}
