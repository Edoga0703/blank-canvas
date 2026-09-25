import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveCompanyIdCached } from "./company-cache";
import { DEFAULT_FIELDS, DEFAULT_THEME, slugifyForm, type LeadFormRow } from "./lead-forms-types";

const SAFE_PUBLIC =
  "id, slug, nome, ativo, theme, campos, pos_envio, redirect_url, mensagem_sucesso";

export const listLeadForms = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const cid = await resolveCompanyIdCached(context.supabase, context.userId);
    const { data } = await (context.supabase as any)
      .from("lead_form")
      .select("*")
      .eq("company_id", cid)
      .order("created_at", { ascending: false });
    return (data ?? []) as LeadFormRow[];
  });

export const saveLeadForm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: Partial<LeadFormRow> & { id?: string }) => d)
  .handler(async ({ context, data }) => {
    const cid = await resolveCompanyIdCached(context.supabase, context.userId);
    const nome = (data.nome || "").trim();
    if (!nome) throw new Error("Dê um nome ao formulário.");
    let slug = slugifyForm(data.slug || nome);

    // garante slug único
    for (let i = 0; i < 20; i++) {
      const { data: clash } = await (context.supabase as any)
        .from("lead_form")
        .select("id")
        .eq("slug", slug)
        .maybeSingle();
      if (!clash || clash.id === data.id) break;
      slug = `${slugifyForm(data.slug || nome)}-${Math.random().toString(36).slice(2, 6)}`;
    }

    const payload: any = {
      company_id: cid,
      slug,
      nome,
      ativo: data.ativo ?? true,
      pipeline_id: data.pipeline_id ?? null,
      stage_id: data.stage_id ?? null,
      owner_mode: data.owner_mode ?? "fila",
      owner_id: data.owner_mode === "fixo" ? data.owner_id ?? null : null,
      distribution_queue_id: data.distribution_queue_id ?? null,
      tags: data.tags ?? [],
      valor_padrao: data.valor_padrao ?? null,
      pos_envio: data.pos_envio ?? "mensagem",
      redirect_url: data.redirect_url ?? null,
      mensagem_sucesso: data.mensagem_sucesso || "Recebemos seus dados!",
      wa_auto_enviar: data.wa_auto_enviar ?? false,
      wa_mensagem: data.wa_mensagem ?? null,
      theme: data.theme ?? DEFAULT_THEME,
      campos: data.campos ?? DEFAULT_FIELDS,
    };

    if (data.id) {
      const { error } = await (context.supabase as any)
        .from("lead_form")
        .update(payload)
        .eq("id", data.id)
        .eq("company_id", cid);
      if (error) throw new Error(error.message);
      return { ok: true, id: data.id, slug };
    }
    const { data: row, error } = await (context.supabase as any)
      .from("lead_form")
      .insert(payload)
      .select("id, slug")
      .maybeSingle();
    if (error || !row) throw new Error(error?.message ?? "Falha ao salvar.");
    return { ok: true, id: row.id as string, slug: row.slug as string };
  });

export const deleteLeadForm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ context, data }) => {
    const cid = await resolveCompanyIdCached(context.supabase, context.userId);
    const { error } = await (context.supabase as any)
      .from("lead_form")
      .delete()
      .eq("id", data.id)
      .eq("company_id", cid);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const duplicateLeadForm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ context, data }) => {
    const cid = await resolveCompanyIdCached(context.supabase, context.userId);
    const { data: src } = await (context.supabase as any)
      .from("lead_form")
      .select("*")
      .eq("id", data.id)
      .eq("company_id", cid)
      .maybeSingle();
    if (!src) throw new Error("Formulário não encontrado.");
    const copy = { ...src };
    delete copy.id;
    delete copy.created_at;
    delete copy.updated_at;
    copy.nome = `${src.nome} (cópia)`;
    copy.slug = `${src.slug}-${Math.random().toString(36).slice(2, 6)}`;
    copy.views = 0;
    copy.submits = 0;
    const { error } = await (context.supabase as any).from("lead_form").insert(copy);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listLeadFormSubmissions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { formId: string }) => d)
  .handler(async ({ context, data }) => {
    const cid = await resolveCompanyIdCached(context.supabase, context.userId);
    const { data: rows } = await (context.supabase as any)
      .from("lead_form_submission")
      .select("id, dados, tracking, crm_card_id, created_at")
      .eq("company_id", cid)
      .eq("form_id", data.formId)
      .order("created_at", { ascending: false })
      .limit(50);
    return rows ?? [];
  });

/** Opções de destino (funis, etapas e equipe) para o construtor. */
export const leadFormOptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const cid = await resolveCompanyIdCached(context.supabase, context.userId);
    const [pipes, stages, team] = await Promise.all([
      (context.supabase as any).from("crm_pipeline").select("id, nome, tipo, ordem").eq("company_id", cid).order("ordem"),
      (context.supabase as any).from("crm_stage").select("id, nome, pipeline_id, ordem").eq("company_id", cid).order("ordem"),
      (context.supabase as any).from("company_user").select("user_id, ativo, profiles(nome)").eq("company_id", cid).eq("ativo", true),
    ]);
    return {
      pipelines: pipes.data ?? [],
      stages: stages.data ?? [],
      team: (team.data ?? []).map((u: any) => ({
        user_id: u.user_id,
        ativo: u.ativo,
        nome: u.profiles?.nome ?? u.user_id,
      })),
    };
  });

/** Leitura pública (sem login) do formulário por slug — só campos seguros. */
export const getPublicLeadForm = createServerFn({ method: "GET" })
  .inputValidator((d: { slug: string }) => d)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await (supabaseAdmin as any)
      .from("lead_form")
      .select(SAFE_PUBLIC)
      .eq("slug", data.slug)
      .eq("ativo", true)
      .maybeSingle();
    if (!row) return null;
    return row as {
      id: string;
      slug: string;
      nome: string;
      ativo: boolean;
      theme: any;
      campos: any[];
      pos_envio: string;
      redirect_url: string | null;
      mensagem_sucesso: string;
    };
  });
