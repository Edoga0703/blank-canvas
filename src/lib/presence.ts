import { supabase } from "@/integrations/supabase/client";

/**
 * Registra o último acesso do usuário (heartbeat).
 * Versão robusta que não falha se o usuário não tiver empresa ou perfil completo.
 */
export async function recordHeartbeatClient(): Promise<{ ok: boolean }> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.id) return { ok: false };
    
    const userId = session.user.id;

    // 1. Atualiza profiles (presença global)
    await supabase
      .from("profiles")
      .update({ last_seen_at: new Date().toISOString() } as any)
      .eq("user_id", userId);

    // 2. Atualiza company_user (presença específica na empresa)
    // Isso ajuda a resolver problemas onde o RLS ou cache de 'atendente' 
    // depende do estado ativo/visto recentemente do vínculo.
    const { data: memberships } = await supabase
      .from("company_user")
      .select("company_id")
      .eq("user_id", userId)
      .eq("ativo", true);

    if (memberships && memberships.length > 0) {
      await Promise.all(memberships.map(m => 
        supabase
          .from("company_user")
          .update({ last_login_at: new Date().toISOString() } as any)
          .eq("company_id", m.company_id)
          .eq("user_id", userId)
      ));
    }

    return { ok: true };
  } catch (e) {
    console.warn("[heartbeat] error:", e);
    return { ok: false };
  }
}
