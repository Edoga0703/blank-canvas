import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Lista atendentes disponíveis para receber transferência, junto da conexão vinculada.
export const listHandoffCandidates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
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
    if (!companyId) return { candidates: [] as any[] };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: members } = await supabaseAdmin
      .from("company_user")
      .select("user_id, role, ativo")
      .eq("company_id", companyId)
      .eq("ativo", true);
    const ids = (members ?? []).map((m: any) => m.user_id);
    if (!ids.length) return { candidates: [] };

    const [{ data: profs }, { data: insts }] = await Promise.all([
      supabaseAdmin.from("profiles").select("user_id, nome, email").in("user_id", ids),
      supabaseAdmin.from("whatsapp_instances").select("user_id, numero, instance_name, status").eq("company_id", companyId).in("user_id", ids),
    ]);

    const profMap = new Map<string, any>();
    (profs ?? []).forEach((p: any) => profMap.set(p.user_id, p));
    const instMap = new Map<string, any>();
    (insts ?? []).forEach((i: any) => instMap.set(i.user_id, i));

    const candidates = (members ?? []).map((m: any) => {
      const p = profMap.get(m.user_id);
      const i = instMap.get(m.user_id);
      return {
        user_id: m.user_id,
        nome: p?.nome || null,
        email: p?.email || null,
        role: m.role,
        instance_numero: i?.numero || null,
        instance_name: i?.instance_name || null,
        instance_status: i?.status || null,
      };
    });
    return { candidates };
  });
