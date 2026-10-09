import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertSuper(supabase: any, userId: string) {
  const { data } = await supabase
    .from("user_roles").select("role").eq("user_id", userId).eq("role", "super_admin").maybeSingle();
  if (!data) throw new Error("Acesso negado");
}

export const listWaCompanies = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuper(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("company")
      .select("id, nome")
      .order("nome", { ascending: true })
      .limit(500);
    if (error) throw error;
    return data ?? [];
  });

export const listWaConversations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { companyId: string; search?: string | null }) => ({
    companyId: String(d.companyId),
    search: d.search ? String(d.search).slice(0, 60) : null,
  }))
  .handler(async ({ context, data }) => {
    await assertSuper(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("mensagens")
      .select("numero, contato_nome, direcao, texto, status_envio, created_at")
      .eq("company_id", data.companyId)
      .order("created_at", { ascending: false })
      .limit(500);
    if (data.search) q = q.ilike("numero", `%${data.search}%`);
    const { data: rows, error } = await q;
    if (error) throw error;
    const map = new Map<string, any>();
    for (const r of rows ?? []) {
      const cur = map.get(r.numero);
      if (!cur) {
        map.set(r.numero, {
          numero: r.numero,
          contato_nome: r.contato_nome,
          last_texto: r.texto,
          last_direcao: r.direcao,
          last_status: r.status_envio,
          last_at: r.created_at,
          total: 1,
          erros: r.status_envio === "erro" ? 1 : 0,
        });
      } else {
        cur.total += 1;
        if (r.status_envio === "erro") cur.erros += 1;
      }
    }
    return Array.from(map.values());
  });

export const listWaConversationEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { companyId: string; numero: string; limit?: number }) => ({
    companyId: String(d.companyId),
    numero: String(d.numero),
    limit: Math.max(50, Math.min(500, Math.floor(d.limit ?? 200))),
  }))
  .handler(async ({ context, data }) => {
    await assertSuper(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: msgs, error: e1 } = await supabaseAdmin
      .from("mensagens")
      .select("id, numero, direcao, autor, texto, whatsapp_message_id, status_envio, midia_tipo, midia_url, midia_mime, created_at")
      .eq("company_id", data.companyId)
      .eq("numero", data.numero)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (e1) throw e1;

    const ids = (msgs ?? []).map((m: any) => m.id);
    let queue: any[] = [];
    if (ids.length) {
      const { data: qrows, error: e2 } = await supabaseAdmin
        .from("outbound_queue")
        .select("id, mensagem_id, kind, payload, status, tentativas, max_tentativas, proxima_em, ultimo_erro, created_at, updated_at")
        .in("mensagem_id", ids)
        .order("created_at", { ascending: false });
      if (e2) throw e2;
      queue = qrows ?? [];
    }
    return { messages: msgs ?? [], queue };
  });
