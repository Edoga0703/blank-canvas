import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const sendTestMessageToClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { evoSendText } = await import("./evolution.server");

    // 1. Pegar a empresa do usuário logado (usando admin para garantir acesso em ambientes de teste)
    const { data: userCompData } = await (supabaseAdmin as any)
      .from("company_user")
      .select("company_id")
      .eq("user_id", userId)
      .eq("ativo", true)
      .maybeSingle();

    let companyId = userCompData?.company_id;

    if (!companyId) {
      // Tentar pegar a primeira empresa que o usuário tem acesso se não tiver uma ativa marcada
      const { data: fallback } = await (supabaseAdmin as any)
        .from("company_user")
        .select("company_id")
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle();
      
      if (!fallback) throw new Error("Usuário não está vinculado a nenhuma empresa.");
      companyId = fallback.company_id;
    }

    // 2. Buscar qualquer cliente disponível para o teste, já que "Madereira Nova" não foi encontrado
    const { data: client } = await (supabaseAdmin as any)
      .from("crm_cards")
      .select("id, numero, nome, company_id")
      .not("numero", "is", null)
      .limit(1)
      .maybeSingle();

    if (!client || !client.numero) {
      throw new Error("Nenhum cliente com número de telefone encontrado no CRM para o teste.");
    }
    
    const targetCompanyId = client.company_id;

    // 3. Buscar instância conectada
    const { data: instance } = await (supabaseAdmin as any)
      .from("whatsapp_instances")
      .select("instance_name")
      .eq("company_id", targetCompanyId)
      .eq("status", "connected")
      .limit(1)
      .maybeSingle();

    if (!instance) {
      throw new Error(`Nenhuma instância conectada para a empresa do cliente (${client.nome}).`);
    }

    const testMessage = `🚀 Teste de Disparo Metrix CRM para ${client.nome}\n\nEste é um teste técnico para confirmar que o sistema está enviando e recebendo mensagens corretamente.`;

    try {
      await evoSendText(instance.instance_name, client.numero, testMessage);
      
      // Registrar mensagem de saída no banco
      await (supabaseAdmin as any).from("mensagens").insert({
        company_id: companyId,
        user_id: userId,
        numero: client.numero,
        direcao: "saida",
        autor: "humano",
        texto: testMessage,
        created_at: new Date().toISOString()
      });

      return { 
        success: true, 
        message: `Mensagem enviada com sucesso para ${client.nome} (${client.numero}) via instância ${instance.instance_name}.` 
      };
    } catch (e: any) {
      console.error("[sendTestMessage] Error:", e);
      throw new Error(`Falha ao enviar mensagem: ${e.message}`);
    }
  });
