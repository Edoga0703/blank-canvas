// Escolhe o próximo atendente para transferência, com base no modo configurado no agent_config.
// Server-only. Usa supabaseAdmin (RLS bypass) pois roda dentro do webhook.

export interface HandoffTarget {
  user_id: string;
  nome: string | null;
  email: string | null;
  instance_numero: string | null;
}

export async function pickHandoffTarget(
  supabaseAdmin: any,
  companyId: string,
  agentConfig: any,
): Promise<HandoffTarget | null> {
  const mode = (agentConfig?.handoff_mode as string) || "user";
  const ids = Array.isArray(agentConfig?.handoff_user_ids) ? (agentConfig.handoff_user_ids as string[]) : [];
  if (!ids.length) return null;

  let chosenId: string;
  if (mode === "round_robin" && ids.length > 1) {
    // Busca o índice atual do banco para garantir consistência entre instâncias/webhooks concorrentes
    const { data: currentCfg } = await supabaseAdmin
      .from("agent_config")
      .select("handoff_rr_index")
      .eq("id", agentConfig.id)
      .maybeSingle();
    
    const idx = ((currentCfg?.handoff_rr_index as number) || 0) % ids.length;
    chosenId = ids[idx];
    
    // Incrementa o índice para o próximo
    try {
      await supabaseAdmin
        .from("agent_config")
        .update({ handoff_rr_index: (idx + 1) % ids.length })
        .eq("id", agentConfig.id);
    } catch (e) {
      console.error("[handoff.rr_update]", e);
    }
  } else {
    // No modo "user" (ou se só tiver 1 ID), usa sempre o primeiro
    chosenId = ids[0];
  }

  const [{ data: prof }, { data: inst }] = await Promise.all([
    supabaseAdmin.from("profiles").select("nome, email").eq("user_id", chosenId).maybeSingle(),
    supabaseAdmin.from("whatsapp_instances").select("numero").eq("company_id", companyId).eq("user_id", chosenId).maybeSingle(),
  ]);

  return {
    user_id: chosenId,
    nome: prof?.nome || null,
    email: prof?.email || null,
    instance_numero: inst?.numero || null,
  };
}
