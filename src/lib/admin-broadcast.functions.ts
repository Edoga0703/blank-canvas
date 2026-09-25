import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertSuper(supabase: any, userId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "super_admin")
    .maybeSingle();
  if (!data) throw new Error("Acesso negado");
}

export const listBroadcasts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuper(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("admin_broadcast")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return { rows: data ?? [] };
  });

export const createBroadcast = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    titulo: string; mensagem: string; link?: string | null;
    target_type: "all" | "plan" | "status"; target_value?: string | null;
  }) => {
    const titulo = String(d.titulo || "").trim();
    const mensagem = String(d.mensagem || "").trim();
    if (titulo.length < 2 || titulo.length > 120) throw new Error("Título inválido");
    if (mensagem.length < 2 || mensagem.length > 2000) throw new Error("Mensagem inválida");
    if (!["all", "plan", "status"].includes(d.target_type)) throw new Error("Target inválido");
    return {
      titulo, mensagem,
      link: d.link ? String(d.link).slice(0, 500) : null,
      target_type: d.target_type,
      target_value: d.target_type === "all" ? null : (d.target_value ? String(d.target_value) : null),
    };
  })
  .handler(async ({ context, data }) => {
    await assertSuper(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("admin_broadcast").insert({
      ...data, created_by: context.userId,
    });
    if (error) throw error;
    return { ok: true };
  });

export const deleteBroadcast = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => ({ id: String(d.id) }))
  .handler(async ({ context, data }) => {
    await assertSuper(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("admin_broadcast").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

// ============ Feedback / Sugestões ============
export const listFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { status?: "aberto" | "respondido" | "arquivado" | "todos" }) => ({
    status: d.status ?? "aberto",
  }))
  .handler(async ({ context, data }) => {
    await assertSuper(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("user_feedback")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.status !== "todos") q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw error;
    const userIds = Array.from(new Set((rows ?? []).map((r: any) => r.user_id)));
    const companyIds = Array.from(new Set((rows ?? []).map((r: any) => r.company_id).filter(Boolean)));
    const [{ data: profs }, { data: comps }] = await Promise.all([
      userIds.length
        ? supabaseAdmin.from("profiles").select("user_id, email, nome").in("user_id", userIds)
        : Promise.resolve({ data: [] as any[] }),
      companyIds.length
        ? supabaseAdmin.from("company").select("id, nome").in("id", companyIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);
    const profMap: Record<string, any> = {};
    for (const p of profs ?? []) profMap[(p as any).user_id] = p;
    const compMap: Record<string, any> = {};
    for (const c of comps ?? []) compMap[(c as any).id] = c;
    return {
      rows: (rows ?? []).map((r: any) => ({
        ...r,
        profile: profMap[r.user_id] ?? null,
        company: r.company_id ? compMap[r.company_id] ?? null : null,
      })),
    };
  });

export const replyFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; reply: string }) => {
    const reply = String(d.reply || "").trim();
    if (reply.length < 2 || reply.length > 4000) throw new Error("Resposta inválida");
    return { id: String(d.id), reply };
  })
  .handler(async ({ context, data }) => {
    await assertSuper(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("user_feedback")
      .update({
        admin_reply: data.reply,
        replied_by: context.userId,
        replied_at: new Date().toISOString(),
        status: "respondido",
      })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const setFeedbackStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; status: "aberto" | "respondido" | "arquivado" }) => d)
  .handler(async ({ context, data }) => {
    await assertSuper(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("user_feedback")
      .update({ status: data.status })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

// Envio de feedback por usuário comum (não exige super)
export const submitFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    category?: string; title?: string | null; message: string;
    link?: string | null; company_id?: string | null;
    attachments?: Array<{ url: string; name: string }> | null;
  }) => {
    const message = String(d.message || "").trim();
    if (message.length < 3 || message.length > 4000) throw new Error("Mensagem inválida");
    const title = d.title ? String(d.title).trim().slice(0, 200) : null;
    let link: string | null = null;
    if (d.link) {
      const l = String(d.link).trim().slice(0, 500);
      if (l) {
        try { const u = new URL(l); if (!/^https?:$/.test(u.protocol)) throw 0; link = u.toString(); }
        catch { throw new Error("Link inválido"); }
      }
    }
    const attachments = Array.isArray(d.attachments)
      ? d.attachments.slice(0, 10).map((a) => ({
          url: String(a.url).slice(0, 1000),
          name: String(a.name || "arquivo").slice(0, 200),
        }))
      : [];
    return {
      category: (d.category || "geral").slice(0, 40),
      title, message, link, attachments,
      company_id: d.company_id ?? null,
    };
  })
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("user_feedback").insert({
      user_id: context.userId,
      company_id: data.company_id,
      category: data.category,
      title: data.title,
      message: data.message,
      link: data.link,
      attachments: data.attachments,
    });
    if (error) throw error;
    return { ok: true };
  });
