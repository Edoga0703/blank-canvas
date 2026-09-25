import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveCompanyIdCached } from "./company-cache";

async function resolveCompanyId(supabase: any, userId: string): Promise<string> {
  return resolveCompanyIdCached(supabase, userId);
}
// ---------- Webhooks ----------
export const listWebhooks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const cid = await resolveCompanyId(context.supabase, context.userId);
    // Nunca retornar a coluna `secret` (credencial de assinatura) para o cliente.
    const { data } = await context.supabase
      .from("webhook_endpoint")
      .select("id, company_id, nome, url, eventos, ativo, created_at")
      .eq("company_id", cid)
      .order("created_at", { ascending: false });
    return data ?? [];
  });

export const saveWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id?: string; nome: string; url: string; eventos: string[]; ativo: boolean }) => d)
  .handler(async ({ context, data }) => {
    const cid = await resolveCompanyId(context.supabase, context.userId);
    if (!/^https?:\/\//.test(data.url)) throw new Error("URL deve começar com http(s)://");
    const { capacidadeAtiva } = await import("@/lib/plugin-gate.server");
    if (!(await capacidadeAtiva(context.supabase, cid, "webhooks-out"))) {
      throw new Error("Instale o plugin Webhooks na Loja de Plugins para configurar webhooks.");
    }
    const payload = { company_id: cid, nome: data.nome, url: data.url, eventos: data.eventos, ativo: data.ativo };
    if (data.id) {
      const { error } = await context.supabase.from("webhook_endpoint").update(payload).eq("id", data.id).eq("company_id", cid);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await context.supabase.from("webhook_endpoint").insert(payload);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const deleteWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ context, data }) => {
    const cid = await resolveCompanyId(context.supabase, context.userId);
    const { error } = await context.supabase.from("webhook_endpoint").delete().eq("id", data.id).eq("company_id", cid);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listWebhookLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const cid = await resolveCompanyId(context.supabase, context.userId);
    const { data } = await context.supabase.from("webhook_delivery_log").select("*").eq("company_id", cid).order("created_at", { ascending: false }).limit(50);
    return data ?? [];
  });

// ---------- API tokens ----------
export const listApiTokens = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const cid = await resolveCompanyId(context.supabase, context.userId);
    const { data } = await context.supabase.from("api_token").select("*").eq("company_id", cid).order("created_at", { ascending: false });
    return data ?? [];
  });

export const createApiToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { label: string }) => d)
  .handler(async ({ context, data }) => {
    const cid = await resolveCompanyId(context.supabase, context.userId);
    const { data: row, error } = await context.supabase
      .from("api_token").insert({ company_id: cid, label: data.label, criado_por: context.userId })
      .select("*").maybeSingle();
    if (error || !row) throw new Error(error?.message ?? "Falha.");
    return row;
  });

export const revokeApiToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ context, data }) => {
    const cid = await resolveCompanyId(context.supabase, context.userId);
    const { error } = await context.supabase.from("api_token").update({ revogado: true }).eq("id", data.id).eq("company_id", cid);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Teste de webhook ----------
export const testWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ context, data }) => {
    const cid = await resolveCompanyId(context.supabase, context.userId);
    const { emitWebhook } = await import("./webhooks.server");
    await emitWebhook(cid, "message.received", { teste: true, mensagem: "Disparo de teste do Metrix CRM" }, data.id);
    const { data: log } = await context.supabase
      .from("webhook_delivery_log")
      .select("status_code, erro")
      .eq("company_id", cid)
      .eq("endpoint_id", data.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return { ok: !!log && (log.status_code ?? 0) >= 200 && (log.status_code ?? 0) < 300, status: log?.status_code ?? null, erro: log?.erro ?? null };
  });
