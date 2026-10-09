// Preenchimento automático de dados do lead a partir da conversa.
// Só preenche campos que ainda estão vazios — nunca sobrescreve o que já existe
// e nunca "inventa" dados: se o cliente não informou, fica vazio.

import { isGenericLeadName } from "@/lib/lead-name";

type Admin = any;

const CAMPOS = ["nome", "email", "cpf_cnpj", "endereco", "empresa"] as const;
type Campo = (typeof CAMPOS)[number];

function limpar(v: any): string | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const low = s.toLowerCase();
  if (["null", "n/a", "nao informado", "não informado", "-", "none", "desconhecido"].includes(low)) return null;
  return s.slice(0, 240);
}

export async function preencherDadosLead(
  admin: Admin,
  params: {
    companyId: string;
    numero: string;
    historico: Array<{ direcao: string; autor?: string | null; texto?: string | null }>;
  },
): Promise<Record<string, string> | null> {
  try {
    const { companyId, numero } = params;

    const { data: card } = await admin
      .from("crm_cards")
      .select("id, nome, email, cpf_cnpj, endereco, empresa")
      .eq("company_id", companyId)
      .eq("numero", numero)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!card?.id) return null;

    // "Contato 1234" / o próprio número contam como vazio: precisamos descobrir o nome real.
    const faltando = CAMPOS.filter((c) =>
      c === "nome"
        ? isGenericLeadName((card as any).nome, numero)
        : !limpar((card as any)[c]),
    );
    if (!faltando.length) return null;

    const transcricao = (params.historico || [])
      .slice(-20)
      .map((m) => `${m.direcao === "entrada" ? "Cliente" : "Atendente"}: ${m.texto ?? ""}`)
      .filter((l) => l.trim().length > 10)
      .join("\n");
    if (!transcricao) return null;

    const { lovableAiChat } = await import("./lovable-ai.server");
    const raw = await lovableAiChat(
      [
        {
          role: "system",
          content:
            "Extraia dados cadastrais que o CLIENTE informou explicitamente na conversa. " +
            "Responda APENAS um JSON válido, sem markdown, com as chaves: " +
            JSON.stringify(faltando) +
            ". Use null quando o dado não tiver sido informado. Nunca invente, deduza ou preencha com exemplos. " +
            "nome = nome completo da pessoa; empresa = nome da empresa; cpf_cnpj = só dígitos e pontuação informados; " +
            "email = e-mail válido; endereco = endereço informado.",
        },
        { role: "user", content: transcricao },
      ],
      "google/gemini-2.5-flash",
    );

    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    let parsed: any;
    try {
      parsed = JSON.parse(match[0]);
    } catch {
      return null;
    }

    const patch: Record<string, string> = {};
    for (const c of faltando) {
      const v = limpar(parsed?.[c]);
      if (!v) continue;
      if (c === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) continue;
      patch[c] = v;
    }
    if (!Object.keys(patch).length) return null;

    await admin.from("crm_cards").update(patch).eq("id", card.id);

    try {
      await admin.from("lead_evento").insert({
        company_id: companyId,
        card_id: card.id,
        tipo: "atualizacao",
        descricao: `IA preencheu: ${Object.keys(patch)
          .map((k) => (k === "cpf_cnpj" ? "CPF/CNPJ" : k))
          .join(", ")}`,
      });
    } catch {
      // evento é opcional
    }

    return patch;
  } catch (e: any) {
    console.warn("[lead-extract]", e?.message);
    return null;
  }
}

export type { Campo };
