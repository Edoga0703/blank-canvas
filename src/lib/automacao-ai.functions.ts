import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Gera uma mensagem curta para régua de automação a partir de um prompt.
export const generateAutomacaoMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { prompt: string; contexto?: string }) => {
    const prompt = String(d?.prompt || "").trim();
    if (!prompt) throw new Error("Descreva no prompt o que a IA deve gerar.");
    return { prompt: prompt.slice(0, 2000), contexto: String(d?.contexto || "").slice(0, 500) };
  })
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: cu } = await supabase
      .from("company_user")
      .select("company_id")
      .eq("user_id", userId)
      .eq("ativo", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    let companyId = cu?.company_id as string | undefined;
    if (!companyId) {
      const { data: isSuper } = await supabase.rpc("is_super_admin");
      if (isSuper) {
        const { data: anyC } = await supabase.from("company").select("id").order("created_at", { ascending: true }).limit(1).maybeSingle();
        companyId = anyC?.id as string | undefined;
      }
    }
    if (!companyId) throw new Error("Empresa não encontrada.");

    const { lovableAiChat } = await import("./lovable-ai.server");
    const sistema =
      "Você gera UMA única mensagem de WhatsApp curta (máx. 2–3 linhas), tom natural, humano e amigável, em português do Brasil. " +
      "Use as variáveis {{nome}}, {{valor}} ou {{dias_sem_resposta}} quando fizer sentido. " +
      "Responda APENAS com a mensagem final, sem aspas, sem explicações, sem prefixos.";
    const user = data.contexto
      ? `Contexto: ${data.contexto}\n\nPrompt: ${data.prompt}`
      : data.prompt;
    const texto = await lovableAiChat(
      [
        { role: "system", content: sistema },
        { role: "user", content: user },
      ],
      "google/gemini-2.5-flash",
    );
    return { texto: (texto || "").trim() };
  });
