import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveCompanyIdCached } from "./company-cache";

async function gate(supabase: any, cid: string) {
  const { capacidadeAtiva } = await import("@/lib/plugin-gate.server");
  if (!(await capacidadeAtiva(supabase, cid, "webhooks-entrada"))) {
    throw new Error("Instale o plugin Webhooks de Entrada na Loja de Plugins.");
  }
}

export const listarInboundWebhooks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const cid = await resolveCompanyIdCached(context.supabase, context.userId);
    await gate(context.supabase, cid);
    const { data, error } = await (context.supabase as any)
      .from("inbound_webhook")
      .select("id, nome, token, ativo, total_recebidos, created_at")
      .eq("company_id", cid)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  });

export const criarInboundWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { nome: string }) => d)
  .handler(async ({ context, data }) => {
    const cid = await resolveCompanyIdCached(context.supabase, context.userId);
    await gate(context.supabase, cid);
    const nome = String(data.nome ?? "").trim().slice(0, 80);
    if (!nome) throw new Error("Informe um nome para identificar a origem.");
    const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "").slice(0, 8);
    const { data: row, error } = await (context.supabase as any)
      .from("inbound_webhook")
      .insert({ company_id: cid, nome, token, user_id: context.userId })
      .select("id, nome, token, ativo, total_recebidos, created_at")
      .maybeSingle();
    if (error) throw error;
    return row;
  });

export const excluirInboundWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ context, data }) => {
    const cid = await resolveCompanyIdCached(context.supabase, context.userId);
    await gate(context.supabase, cid);
    const { error } = await (context.supabase as any)
      .from("inbound_webhook")
      .delete()
      .eq("company_id", cid)
      .eq("id", String(data.id));
    if (error) throw error;
    return { ok: true };
  });

export const alternarInboundWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; ativo: boolean }) => d)
  .handler(async ({ context, data }) => {
    const cid = await resolveCompanyIdCached(context.supabase, context.userId);
    await gate(context.supabase, cid);
    const { error } = await (context.supabase as any)
      .from("inbound_webhook")
      .update({ ativo: !!data.ativo })
      .eq("company_id", cid)
      .eq("id", String(data.id));
    if (error) throw error;
    return { ok: true };
  });
