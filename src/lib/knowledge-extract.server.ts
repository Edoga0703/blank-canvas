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
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY ausente.");
  const b64 = toBase64(bytes);
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Lovable-API-Key": key,
      "Content-Type": "application/json",
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                "Transcreva TODO o conteúdo textual deste documento de forma fiel e completa, em português, " +
                "preservando a estrutura (títulos, listas, tabelas em texto). Não resuma, não comente, não adicione nada. " +
                "Se uma página for imagem sem texto legível, escreva [página sem texto legível].",
            },
            {
              type: "file",
              file: { filename: name, file_data: `data:application/pdf;base64,${b64}` },
            },
          ],
        },
      ],
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`IA de extração falhou (${res.status}): ${t.slice(0, 160)}`);
  }
  const data: any = await res.json();
  const text = data?.choices?.[0]?.message?.content?.toString().trim() || "";
  if (!text) throw new Error("IA retornou extração vazia.");
  return text;
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
