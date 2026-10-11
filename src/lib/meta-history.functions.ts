import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveCompanyIdCached as resolveCompanyId } from "./company-cache";

const MISSING = /does not exist|schema cache|Could not find the table/i;
function tableError(message: string) {
  return MISSING.test(message) ? "As tabelas do histórico Meta ainda não existem no banco. Aplique o SQL da fase 1 (docs/sql)." : message;
}

/** Contas sociais Meta da empresa (sem tokens). */
export const listMetaSocialAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const companyId = await resolveCompanyId(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await (supabaseAdmin as any).from("meta_social_accounts")
      .select("id,network,provider,external_id,page_id,ig_user_id,username,display_name,picture_url,status,last_synced_at,last_error,capabilities,instance_id")
      .eq("company_id", companyId).order("network");
    if (error) return { accounts: [], error: tableError(error.message) };
    const ids = (data ?? []).map((a: any) => a.instance_id).filter(Boolean);
    const { data: inst } = ids.length ? await (supabaseAdmin as any).from("whatsapp_instances").select("id,instance_name").in("id", ids) : { data: [] };
    const names = new Map((inst ?? []).map((i: any) => [i.id, i.instance_name]));
    return { accounts: (data ?? []).map((a: any) => ({ ...a, instance_name: names.get(a.instance_id) ?? null })), error: null as string | null };
  });

/** Sincroniza histórico (posts, comentários, métricas, perfil, Stories) para uma ou todas as contas. */
export const syncMetaContentHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { accountId?: string; full?: boolean }) => ({ accountId: d?.accountId ? String(d.accountId) : undefined, full: Boolean(d?.full) }))
  .handler(async ({ context, data }) => {
    const companyId = await resolveCompanyId(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { reconcileSocialAccounts, syncAccountContent } = await import("./meta-content-sync.server");
    try {
      const { accounts, warnings } = await reconcileSocialAccounts(supabaseAdmin, companyId);
      const targets = data.accountId ? accounts.filter((a) => a.id === data.accountId) : accounts;
      if (!targets.length) return { ok: false as const, error: "Nenhuma conta Meta conectada.", warnings, results: [] };
      const results = [];
      for (const account of targets) results.push(await syncAccountContent(supabaseAdmin, account, { full: data.full, trigger: "manual" }));
      return { ok: true as const, error: null, warnings, results };
    } catch (e) {
      return { ok: false as const, error: tableError(e instanceof Error ? e.message : String(e)), warnings: [], results: [] };
    }
  });

/** Publicações armazenadas com filtros. */
export const listStoredMetaPosts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { network?: string; accountId?: string; format?: string; since?: string; until?: string }) => ({
    network: ["facebook", "instagram"].includes(String(d?.network)) ? String(d!.network) : undefined,
    accountId: d?.accountId || undefined,
    format: ["photo", "video", "reel", "story", "carousel", "text", "link", "other"].includes(String(d?.format)) ? String(d!.format) : undefined,
    since: d?.since || undefined,
    until: d?.until || undefined,
  }))
  .handler(async ({ context, data }) => {
    const companyId = await resolveCompanyId(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = (supabaseAdmin as any).from("meta_content_posts")
      .select("id,social_account_id,network,external_post_id,format,caption,permalink,media_url,thumbnail_url,archived_media_key,archived_thumbnail_key,published_at,expires_at,metrics_latest,last_synced_at")
      .eq("company_id", companyId).order("published_at", { ascending: false, nullsFirst: false }).limit(300);
    if (data.network) q = q.eq("network", data.network);
    if (data.accountId) q = q.eq("social_account_id", data.accountId);
    if (data.format) q = q.eq("format", data.format);
    if (data.since) q = q.gte("published_at", data.since);
    if (data.until) q = q.lte("published_at", `${data.until}T23:59:59Z`);
    const { data: rows, error } = await q;
    if (error) return { posts: [], error: tableError(error.message) };
    const { isR2Configured, createR2DownloadUrl } = await import("./storage/r2.server");
    const r2 = isR2Configured();
    return {
      error: null as string | null,
      posts: (rows ?? []).map((p: any) => ({
        ...p,
        archived_media_url: r2 && p.archived_media_key ? createR2DownloadUrl(p.archived_media_key, 3600) : null,
        archived_thumbnail_url: r2 && p.archived_thumbnail_key ? createR2DownloadUrl(p.archived_thumbnail_key, 3600) : null,
      })),
    };
  });

/** Detalhe: série de métricas, mídias e comentários armazenados. */
export const getStoredMetaPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { postId?: string }) => {
    if (!d?.postId) throw new Error("Publicação obrigatória.");
    return { postId: String(d.postId) };
  })
  .handler(async ({ context, data }) => {
    const companyId = await resolveCompanyId(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const [snap, media, comments] = await Promise.all([
      admin.from("meta_content_metric_snapshots").select("collected_date,likes,comments,shares,saves,reach,impressions,views,total_interactions,replies,avg_watch_time_ms,total_watch_time_ms,unavailable").eq("company_id", companyId).eq("post_id", data.postId).order("collected_date"),
      admin.from("meta_content_media").select("position,media_type,media_url,thumbnail_url,storage_key").eq("company_id", companyId).eq("post_id", data.postId).order("position"),
      admin.from("meta_content_comments").select("id,external_comment_id,parent_external_id,author_name,author_username,text,like_count,is_own,status,commented_at").eq("company_id", companyId).eq("post_id", data.postId).order("commented_at").limit(500),
    ]);
    return { snapshots: snap.data ?? [], media: media.data ?? [], comments: comments.data ?? [] };
  });

/** Crescimento do perfil e últimas execuções. */
export const getMetaProfileGrowth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { accountId?: string }) => ({ accountId: d?.accountId || undefined }))
  .handler(async ({ context, data }) => {
    const companyId = await resolveCompanyId(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    let q = admin.from("meta_profile_metric_snapshots").select("social_account_id,snapshot_date,followers,follows,media_count,reach,impressions,profile_views,accounts_engaged").eq("company_id", companyId).order("snapshot_date").limit(400);
    if (data.accountId) q = q.eq("social_account_id", data.accountId);
    let r = admin.from("meta_sync_runs").select("id,social_account_id,kind,trigger,status,counts,stages,started_at,finished_at").eq("company_id", companyId).order("started_at", { ascending: false }).limit(10);
    if (data.accountId) r = r.eq("social_account_id", data.accountId);
    const [profile, runs] = await Promise.all([q, r]);
    return { profile: profile.data ?? [], runs: runs.data ?? [], error: profile.error ? tableError(profile.error.message) : null };
  });

/** Diagnóstico read-only de um canal Meta. Nunca devolve tokens. */
export const runMetaChannelDiagnostics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { instanceName?: string }) => {
    const instanceName = String(d?.instanceName ?? "").trim();
    if (!instanceName) throw new Error("Canal obrigatório.");
    return { instanceName };
  })
  .handler(async ({ context, data }) => {
    const companyId = await resolveCompanyId(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: inst } = await (supabaseAdmin as any).from("whatsapp_instances")
      .select("instance_token,phone_number_id,provider")
      .eq("company_id", companyId).eq("instance_name", data.instanceName)
      .in("provider", ["meta_instagram", "meta_messenger"]).maybeSingle();
    if (!inst?.phone_number_id) throw new Error("Canal Meta não encontrado.");
    if (!inst.instance_token) return { checks: [{ key: "token", label: "Token do canal", status: "fail", detail: "Canal sem token salvo. Reconecte." }] };
    const { runMetaDiagnostics } = await import("./meta-content-sync.server");
    return { checks: await runMetaDiagnostics(inst.instance_token, inst.provider === "meta_instagram" ? "instagram" : "facebook", String(inst.phone_number_id)) };
  });
