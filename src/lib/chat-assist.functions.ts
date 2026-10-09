import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveCompanyIdCached } from "./company-cache";

export type AssistResult = { texto: string };

/** Verifica se a empresa está no plano Cortesia (recurso em teste). */
async function assertCortesia(companyId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await (supabaseAdmin as any)
    .from("subscription")
    .select("cortesia, status, plan:plan(slug)")
    .eq("company_id", companyId)
    .maybeSingle();
  const ok = !!data && (data.cortesia === true || (data.plan as any)?.slug === "cortesia");
  if (!ok) throw new Error("Recurso disponível apenas para contas no plano Cortesia.");
}

export const assistenteChatDisponivel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<boolean> => {
    try {
      const companyId = await resolveCompanyIdCached(context.supabase, context.userId);
      await assertCortesia(companyId);
      return true;
    } catch {
      return false;
    }
  });

const SYSTEM = [
  "Você é um assistente de atendimento por WhatsApp de uma empresa brasileira.",
  "Escreva sempre em português do Brasil, com tom profissional, cordial e objetivo.",
  "Nunca invente preços, prazos, horários, promoções ou dados que não estejam no contexto.",
  "Responda APENAS com o texto da mensagem pronta para envio, sem aspas e sem explicações.",
  "Use no máximo 4 linhas curtas.",
].join(" ");

/** Lê a conversa e sugere a próxima mensagem do atendente. */
export const sugerirProximaMensagem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { numero: string }) => {
    const numero = String(d?.numero || "").trim();
    if (!numero) throw new Error("Conversa inválida.");
    return { numero };
  })
  .handler(async ({ context, data }): Promise<AssistResult> => {
    const companyId = await resolveCompanyIdCached(context.supabase, context.userId);
    await assertCortesia(companyId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: msgs } = await (supabaseAdmin as any)
      .from("mensagens")
      .select("direcao,texto,midia_tipo,created_at,contato_nome")
      .eq("company_id", companyId)
      .eq("numero", data.numero)
      .order("created_at", { ascending: false })
      .limit(25);

    const lista = ((msgs ?? []) as any[]).reverse();
    if (!lista.length) throw new Error("Sem histórico nessa conversa para analisar.");

    const contato = lista.find((m) => m.contato_nome)?.contato_nome || "Cliente";
    const transcricao = lista
      .map((m) => {
        const quem = m.direcao === "entrada" ? contato : "Atendente";
        const txt = String(m.texto || "").trim() || (m.midia_tipo ? `[${m.midia_tipo}]` : "");
        return txt ? `${quem}: ${txt}` : "";
      })
      .filter(Boolean)
      .join("\n");

    const { lovableAiChat } = await import("./lovable-ai.server");
    const texto = await lovableAiChat([
      { role: "system", content: SYSTEM },
      {
        role: "user",
        content:
          "Abaixo está a conversa com o cliente. Sugira a próxima mensagem que o atendente deve enviar agora.\n\n" +
          transcricao,
      },
    ]);
    return { texto: String(texto || "").trim() };
  });

/** Recebe um rascunho simples e devolve a mensagem melhor estruturada. */
export const estruturarMensagem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { rascunho: string; numero?: string | null }) => {
    const rascunho = String(d?.rascunho || "").trim();
    if (rascunho.length < 2) throw new Error("Escreva uma ideia para a IA estruturar.");
    return { rascunho, numero: d?.numero ?? null };
  })
  .handler(async ({ context, data }): Promise<AssistResult> => {
    const companyId = await resolveCompanyIdCached(context.supabase, context.userId);
    await assertCortesia(companyId);

    let contexto = "";
    if (data.numero) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: msgs } = await (supabaseAdmin as any)
        .from("mensagens")
        .select("direcao,texto,created_at")
        .eq("company_id", companyId)
        .eq("numero", data.numero)
        .order("created_at", { ascending: false })
        .limit(8);
      const lista = ((msgs ?? []) as any[]).reverse();
      contexto = lista
        .map((m) => `${m.direcao === "entrada" ? "Cliente" : "Atendente"}: ${String(m.texto || "").trim()}`)
        .filter((l) => l.length > 12)
        .join("\n");
    }

    const { lovableAiChat } = await import("./lovable-ai.server");
    const texto = await lovableAiChat([
      { role: "system", content: SYSTEM },
      {
        role: "user",
        content:
          (contexto ? `Contexto da conversa:\n${contexto}\n\n` : "") +
          "Reescreva a ideia abaixo como uma mensagem de WhatsApp clara, cordial e bem estruturada. " +
          "Mantenha o mesmo sentido e não acrescente informações novas.\n\nIdeia: " +
          data.rascunho,
      },
    ]);
    return { texto: String(texto || "").trim() };
  });
