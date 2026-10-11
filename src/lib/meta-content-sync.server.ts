/**
 * Histórico de contenido Meta (Instagram/Facebook) — server-only.
 * Adaptado de la lógica social-api / stories-capture del proyecto de referencia,
 * usando company_id, whatsapp_instances como transporte y Graph API v25.0.
 * Nunca devuelve ni registra tokens. Lo que la Meta no entrega queda NULL.
 * Ninguna etapa borra datos previos: todo es upsert idempotente.
 */
import { metaGraphRequest } from "@/lib/meta.server";

type Admin = any;

export type MetaIssueKind =
  | "permission_missing"
  | "advanced_access_missing"
  | "token_expired"
  | "rate_limited"
  | "metric_unsupported"
  | "no_data"
  | "internal";

export type StageResult = {
  stage: string;
  ok: boolean;
  count?: number;
  kind?: MetaIssueKind;
  message?: string;
};

/** Clasifica errores de Graph por motivo para mostrar acciones claras. */
export function classifyMetaError(error: unknown): { kind: MetaIssueKind; message: string } {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  const message = raw.replace(/access_token=[^&\s]+/gi, "access_token=***").slice(0, 400);
  const status = (error as any)?.status as number | undefined;
  if (/advanced access|acesso avançado|modo de desenvolvimento/i.test(raw)) return { kind: "advanced_access_missing", message };
  if (/\(#190\)|code\W*190|session has expired|token.*(expired|invalid)|cannot parse access token|não reconheceu o token|Error validating access token/i.test(raw) || status === 401)
    return { kind: "token_expired", message };
  if (/\(#(4|17|32|613|80001|80002|80004|80005|80006)\)|rate limit|too many calls|request limit/i.test(raw) || status === 429)
    return { kind: "rate_limited", message };
  if (/metric|not supported|unsupported|does not support|incompatible|no longer supported/i.test(raw) && /\(#100\)|metric/i.test(raw))
    return { kind: "metric_unsupported", message };
  if (/\(#10\)|\(#200\)|\(#3\)|permission|not authorized|requires .*permission|missing permissions/i.test(raw) || status === 403)
    return { kind: "permission_missing", message };
  return { kind: "internal", message };
}

/** Normaliza el formato real de la publicación. */
export function detectFormat(network: "facebook" | "instagram", item: any): "photo" | "video" | "reel" | "story" | "carousel" | "text" | "link" | "other" {
  if (network === "instagram") {
    const product = String(item?.media_product_type ?? "").toUpperCase();
    const type = String(item?.media_type ?? "").toUpperCase();
    if (product === "STORY") return "story";
    if (product === "REELS") return "reel";
    if (type === "CAROUSEL_ALBUM") return "carousel";
    if (type === "VIDEO") return "video";
    if (type === "IMAGE") return "photo";
    return "other";
  }
  const att = item?.attachments?.data?.[0];
  const t = String(att?.media_type ?? att?.type ?? "").toLowerCase();
  if (att?.subattachments?.data?.length > 1 || t === "album") return "carousel";
  if (t.includes("reel")) return "reel";
  if (t.includes("video")) return "video";
  if (t === "photo" || t.includes("image")) return "photo";
  if (t === "share" || t === "link") return "link";
  if (!att && item?.message) return "text";
  return "other";
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : null);
const dayOf = (d: Date | string = new Date()) => new Date(d).toISOString().slice(0, 10);

function qs(values: Record<string, string | number | undefined | null>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(values)) if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
}

// ───────────────────────── A. Activos ─────────────────────────

type InstanceRow = {
  id: string;
  company_id: string;
  instance_name: string;
  display_name: string | null;
  provider: string;
  phone_number_id: string | null;
  instance_token: string | null;
  status: string | null;
};

export type SocialAccount = {
  id: string;
  company_id: string;
  instance_id: string | null;
  network: "facebook" | "instagram";
  provider: string;
  external_id: string;
  page_id: string | null;
  ig_user_id: string | null;
  username: string | null;
  display_name: string | null;
  sync_cursor: Record<string, unknown> | null;
};

/**
 * Reconcilia whatsapp_instances (transporte) → meta_social_accounts (activo formal).
 * Para Instagram resuelve la Página dueña consultando /me con el propio token del canal,
 * en lugar de suponer "la última instancia Messenger".
 */
export async function reconcileSocialAccounts(admin: Admin, companyId: string): Promise<{ accounts: SocialAccount[]; warnings: string[] }> {
  const warnings: string[] = [];
  const { data: instances, error } = await admin
    .from("whatsapp_instances")
    .select("id,company_id,instance_name,display_name,provider,phone_number_id,instance_token,status")
    .eq("company_id", companyId)
    .in("provider", ["meta_messenger", "meta_instagram"]);
  if (error) throw new Error(`Falha ao ler canais Meta: ${error.message}`);

  for (const inst of (instances ?? []) as InstanceRow[]) {
    if (!inst.phone_number_id) continue;
    const network = inst.provider === "meta_instagram" ? "instagram" : "facebook";
    let pageId: string | null = network === "facebook" ? inst.phone_number_id : null;
    let username: string | null = null;
    let picture: string | null = null;
    const capabilities: Record<string, unknown> = { messaging: true };
    if (inst.instance_token) {
      try {
        if (network === "instagram") {
          const igToken = /^(IGAA|IGQV|IGQW)/.test(inst.instance_token.trim());
          if (igToken) {
            const me = await metaGraphRequest(`/me${qs({ fields: "user_id,username,profile_picture_url" })}`, inst.instance_token, { method: "GET" });
            username = me?.username ?? null;
            picture = me?.profile_picture_url ?? null;
            capabilities.login = "instagram";
          } else {
            const me = await metaGraphRequest(`/me${qs({ fields: "id,instagram_business_account{id,username,profile_picture_url}" })}`, inst.instance_token, { method: "GET" });
            pageId = me?.id ? String(me.id) : null;
            const ig = me?.instagram_business_account;
            if (ig?.id && String(ig.id) !== inst.phone_number_id) {
              warnings.push(`${inst.display_name ?? inst.instance_name}: o token pertence a uma Página vinculada a outro Instagram (${ig.username ?? ig.id}). Reconecte o canal.`);
              capabilities.mismatch = true;
            }
            username = ig?.username ?? null;
            picture = ig?.profile_picture_url ?? null;
            capabilities.login = "facebook_page";
          }
        } else {
          const me = await metaGraphRequest(`/me${qs({ fields: "id,name,picture{url}" })}`, inst.instance_token, { method: "GET" });
          picture = me?.picture?.data?.url ?? null;
          username = me?.name ?? null;
        }
      } catch (e) {
        const c = classifyMetaError(e);
        warnings.push(`${inst.display_name ?? inst.instance_name}: ${c.kind} — ${c.message}`);
      }
    }
    const row = {
      company_id: companyId,
      instance_id: inst.id,
      network,
      provider: inst.provider,
      external_id: inst.phone_number_id,
      page_id: pageId,
      ig_user_id: network === "instagram" ? inst.phone_number_id : null,
      username,
      display_name: inst.display_name,
      picture_url: picture,
      capabilities,
      status: inst.status === "expired" ? "expired" : "active",
      updated_at: new Date().toISOString(),
    };
    const { error: upErr } = await admin.from("meta_social_accounts").upsert(row, { onConflict: "company_id,network,external_id" });
    if (upErr) {
      if (/does not exist|schema cache/i.test(upErr.message)) throw new Error("As tabelas do histórico Meta ainda não foram criadas no banco. Aplique o SQL da fase 1.");
      warnings.push(`Falha ao registrar ${inst.instance_name}: ${upErr.message}`);
    }
  }

  // Vincula IG ↔ Página por page_id.
  const { data: accounts } = await admin.from("meta_social_accounts").select("id,company_id,instance_id,network,provider,external_id,page_id,ig_user_id,username,display_name,sync_cursor").eq("company_id", companyId);
  const list = (accounts ?? []) as SocialAccount[];
  for (const ig of list.filter((a) => a.network === "instagram" && a.page_id)) {
    const fb = list.find((a) => a.network === "facebook" && a.external_id === ig.page_id);
    if (fb) {
      await admin.from("meta_social_accounts").update({ linked_account_id: fb.id }).eq("id", ig.id);
      await admin.from("meta_social_accounts").update({ linked_account_id: ig.id }).eq("id", fb.id);
    }
  }
  return { accounts: list, warnings };
}

async function tokenFor(admin: Admin, account: SocialAccount): Promise<string | null> {
  if (!account.instance_id) return null;
  const { data } = await admin.from("whatsapp_instances").select("instance_token").eq("id", account.instance_id).maybeSingle();
  return data?.instance_token ?? null;
}

// ───────────────────────── Insights tolerantes ─────────────────────────

async function tolerantInsights(token: string, objectId: string, metrics: string[], extra: Record<string, string> = {}) {
  const values: Record<string, number> = {};
  const unavailable: Record<string, MetaIssueKind> = {};
  const read = (row: any) => row?.total_value?.value ?? row?.values?.[row?.values?.length - 1]?.value;
  try {
    const res = await metaGraphRequest(`/${encodeURIComponent(objectId)}/insights${qs({ metric: metrics.join(","), ...extra })}`, token, { method: "GET" });
    for (const m of res?.data ?? []) {
      const v = read(m);
      if (typeof v === "number") values[m.name] = v;
      else if (v && typeof v === "object") values[m.name] = Object.values(v as Record<string, number>).reduce((a, b) => a + (Number(b) || 0), 0);
    }
  } catch (bulkError) {
    const bulk = classifyMetaError(bulkError);
    if (bulk.kind === "token_expired" || bulk.kind === "rate_limited") {
      for (const m of metrics) unavailable[m] = bulk.kind;
      return { values, unavailable };
    }
    for (const metric of metrics) {
      try {
        const res = await metaGraphRequest(`/${encodeURIComponent(objectId)}/insights${qs({ metric, ...extra })}`, token, { method: "GET" });
        const v = read(res?.data?.[0]);
        if (typeof v === "number") values[metric] = v;
        else unavailable[metric] = "no_data";
      } catch (e) {
        unavailable[metric] = classifyMetaError(e).kind;
      }
    }
  }
  for (const m of metrics) if (!(m in values) && !(m in unavailable)) unavailable[m] = "no_data";
  return { values, unavailable };
}

function igMetricsFor(format: string) {
  if (format === "story") return ["reach", "views", "replies", "shares", "total_interactions", "navigation"];
  if (format === "reel") return ["reach", "views", "likes", "comments", "shares", "saved", "total_interactions", "ig_reels_avg_watch_time", "ig_reels_video_view_total_time"];
  return ["reach", "views", "likes", "comments", "shares", "saved", "total_interactions"];
}

const FB_POST_METRICS = ["post_impressions", "post_impressions_unique", "post_clicks", "post_video_views", "post_reactions_by_type_total"];

// ───────────────────────── Persistencia ─────────────────────────

async function upsertPost(admin: Admin, account: SocialAccount, item: any) {
  const network = account.network;
  const format = detectFormat(network, item);
  const ig = network === "instagram";
  const att = item?.attachments?.data?.[0];
  const row = {
    company_id: account.company_id,
    social_account_id: account.id,
    network,
    external_post_id: String(item.id),
    format,
    media_type: ig ? item.media_type ?? null : att?.media_type ?? att?.type ?? null,
    media_product_type: ig ? item.media_product_type ?? null : null,
    caption: ig ? item.caption ?? null : item.message ?? null,
    permalink: ig ? item.permalink ?? null : item.permalink_url ?? null,
    media_url: ig ? item.media_url ?? null : att?.media?.source ?? att?.media?.image?.src ?? item.full_picture ?? null,
    thumbnail_url: ig ? item.thumbnail_url ?? item.media_url ?? null : item.full_picture ?? att?.media?.image?.src ?? null,
    published_at: (ig ? item.timestamp : item.created_time) ?? null,
    expires_at: format === "story" && item.timestamp ? new Date(new Date(item.timestamp).getTime() + 24 * 3600_000).toISOString() : null,
    raw: item,
    last_synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await admin.from("meta_content_posts").upsert(row, { onConflict: "company_id,network,external_post_id" }).select("id,format,archived_media_key").single();
  if (error) throw new Error(`gravar post ${item.id}: ${error.message}`);

  // Medios (carrusel = varios hijos).
  const children: any[] = ig ? item?.children?.data ?? [] : att?.subattachments?.data ?? [];
  const mediaRows = (children.length ? children : [item]).map((c: any, position: number) => ({
    company_id: account.company_id,
    post_id: data.id,
    position,
    external_media_id: c?.id ? String(c.id) : c?.target?.id ? String(c.target.id) : null,
    media_type: ig ? c?.media_type ?? null : c?.media_type ?? c?.type ?? null,
    media_url: ig ? c?.media_url ?? null : c?.media?.source ?? c?.media?.image?.src ?? null,
    thumbnail_url: ig ? c?.thumbnail_url ?? c?.media_url ?? null : c?.media?.image?.src ?? null,
    updated_at: new Date().toISOString(),
  }));
  await admin.from("meta_content_media").upsert(mediaRows, { onConflict: "post_id,position" });
  return data as { id: string; format: string; archived_media_key: string | null };
}

export function normalizeComment(network: "facebook" | "instagram", c: any) {
  const ig = network === "instagram";
  return {
    external_comment_id: String(c.id),
    parent_external_id: ig ? c?.parent_id ?? null : c?.parent?.id ?? null,
    author_id: c?.from?.id ? String(c.from.id) : null,
    author_name: c?.from?.name ?? null,
    author_username: c?.username ?? c?.from?.username ?? null,
    text: ig ? c?.text ?? null : c?.message ?? null,
    like_count: num(c?.like_count),
    reply_count: num(c?.comment_count ?? c?.replies?.data?.length),
    is_hidden: typeof c?.hidden === "boolean" ? c.hidden : typeof c?.is_hidden === "boolean" ? c.is_hidden : null,
    commented_at: (ig ? c?.timestamp : c?.created_time) ?? null,
    raw: c,
  };
}

/**
 * Guarda un comentario público en el histórico de Contenido (nunca en mensagens).
 * Usado por la sincronización y por meta-sync.server.persistComment.
 */
export async function persistContentComment(admin: Admin, input: {
  companyId: string;
  network: "facebook" | "instagram";
  externalPostId: string | null;
  ownerExternalId: string | null;
  comment: any;
  parentExternalId?: string | null;
  postRowId?: string | null;
  socialAccountId?: string | null;
}) {
  if (!input.comment?.id) return false;
  let postId = input.postRowId ?? null;
  let accountId = input.socialAccountId ?? null;
  if (!postId && input.externalPostId) {
    const { data } = await admin.from("meta_content_posts").select("id,social_account_id").eq("company_id", input.companyId).eq("network", input.network).eq("external_post_id", input.externalPostId).maybeSingle();
    postId = data?.id ?? null;
    accountId = accountId ?? data?.social_account_id ?? null;
  }
  const n = normalizeComment(input.network, input.comment);
  const { error } = await admin.from("meta_content_comments").upsert({
    company_id: input.companyId,
    post_id: postId,
    social_account_id: accountId,
    network: input.network,
    external_post_id: input.externalPostId,
    ...n,
    parent_external_id: n.parent_external_id ?? input.parentExternalId ?? null,
    is_own: Boolean(input.ownerExternalId && n.author_id === input.ownerExternalId),
    status: n.is_hidden ? "hidden" : "visible",
    updated_at: new Date().toISOString(),
  }, { onConflict: "company_id,network,external_comment_id" });
  if (error) throw new Error(error.message);
  return true;
}

async function archiveToR2(companyId: string, url: string | null, name: string, occurredAt?: string | null) {
  if (!url) return null;
  const { isR2Configured, storeMediaObject } = await import("@/lib/storage/r2.server");
  if (!isR2Configured()) return null;
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`download ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  const stored = await storeMediaObject({ companyId, bytes, mimeType: res.headers.get("content-type"), fileName: name, occurredAt });
  return stored.storageKey;
}

// ───────────────────────── C. Sincronización orgánica ─────────────────────────

const IG_MEDIA_FIELDS = "id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count,children{id,media_type,media_url,thumbnail_url}";
const FB_POST_FIELDS = "id,message,created_time,permalink_url,full_picture,attachments{media_type,type,url,media,subattachments,target},shares,reactions.limit(0).summary(true),comments.limit(0).summary(true)";

export type ContentSyncSummary = {
  accountId: string;
  network: string;
  status: "ok" | "partial" | "failed";
  counts: { posts: number; comments: number; snapshots: number; profile: number; stories: number; archived: number };
  stages: StageResult[];
};

export async function syncAccountContent(admin: Admin, account: SocialAccount, options: { full?: boolean; trigger?: string; maxPages?: number } = {}): Promise<ContentSyncSummary> {
  const counts = { posts: 0, comments: 0, snapshots: 0, profile: 0, stories: 0, archived: 0 };
  const stages: StageResult[] = [];
  const { data: run } = await admin.from("meta_sync_runs").insert({ company_id: account.company_id, social_account_id: account.id, kind: "content", trigger: options.trigger ?? "manual" }).select("id").single();

  const finish = async (status: "ok" | "partial" | "failed") => {
    if (run?.id) await admin.from("meta_sync_runs").update({ status, counts, stages, finished_at: new Date().toISOString() }).eq("id", run.id);
    await admin.from("meta_social_accounts").update({
      last_synced_at: new Date().toISOString(),
      last_error: stages.find((s) => !s.ok)?.message ?? null,
      status: stages.some((s) => s.kind === "token_expired") ? "expired" : stages.some((s) => !s.ok) ? "degraded" : "active",
    }).eq("id", account.id);
    return { accountId: account.id, network: account.network, status, counts, stages };
  };

  const token = await tokenFor(admin, account);
  if (!token) {
    stages.push({ stage: "token", ok: false, kind: "token_expired", message: "Canal sem token salvo. Reconecte." });
    return finish("failed");
  }

  const ig = account.network === "instagram";
  const ownerId = account.external_id;
  const cursor = (account.sync_cursor ?? {}) as { last_post_at?: string };
  const maxPages = Math.min(options.maxPages ?? (options.full ? 10 : 3), 20);

  // 1) Publicaciones con paginación limitada.
  const posts: any[] = [];
  try {
    let next: string | null = `/${encodeURIComponent(ownerId)}/${ig ? "media" : "published_posts"}${qs({
      fields: ig ? IG_MEDIA_FIELDS : FB_POST_FIELDS,
      limit: 25,
      since: !ig && !options.full && cursor.last_post_at ? Math.floor(new Date(cursor.last_post_at).getTime() / 1000) - 7 * 86400 : undefined,
    })}`;
    let pages = 0;
    while (next && pages < maxPages) {
      const json: any = await metaGraphRequest(next, token, { method: "GET" });
      const batch: any[] = Array.isArray(json?.data) ? json.data : [];
      posts.push(...batch);
      pages += 1;
      // IG no soporta `since` en /media: cortamos al pasar el checkpoint (con 7 días de margen para métricas).
      if (ig && !options.full && cursor.last_post_at) {
        const limit = new Date(cursor.last_post_at).getTime() - 7 * 86400_000;
        if (batch.some((b) => new Date(b.timestamp).getTime() < limit)) break;
      }
      next = typeof json?.paging?.next === "string" ? json.paging.next : null;
    }
    stages.push({ stage: "posts", ok: true, count: posts.length, ...(posts.length ? {} : { kind: "no_data" as const, message: "Nenhuma publicação retornada" }) });
  } catch (e) {
    const c = classifyMetaError(e);
    stages.push({ stage: "posts", ok: false, kind: c.kind, message: c.message });
  }

  let newest = cursor.last_post_at ?? null;
  let commentFailure: StageResult | null = null;
  let insightFailures = 0;
  for (const item of posts) {
    let saved: Awaited<ReturnType<typeof upsertPost>>;
    try {
      saved = await upsertPost(admin, account, item);
      counts.posts += 1;
      const at = ig ? item.timestamp : item.created_time;
      if (at && (!newest || at > newest)) newest = at;
    } catch (e) {
      stages.push({ stage: `post:${item.id}`, ok: false, kind: "internal", message: e instanceof Error ? e.message : String(e) });
      continue;
    }

    // 2) Comentarios + respuestas (solo histórico; nunca mensagens).
    if (!commentFailure) {
      try {
        const fields = ig
          ? "id,text,timestamp,username,from,like_count,hidden,replies.limit(50){id,text,timestamp,username,from,like_count,hidden}"
          : "id,message,created_time,from,like_count,comment_count,is_hidden,parent{id}";
        const res = await metaGraphRequest(`/${encodeURIComponent(String(item.id))}/comments${qs({ fields, limit: 100, ...(ig ? {} : { filter: "stream" }) })}`, token, { method: "GET" });
        for (const c of res?.data ?? []) {
          await persistContentComment(admin, { companyId: account.company_id, network: account.network, externalPostId: String(item.id), ownerExternalId: ownerId, comment: c, postRowId: saved.id, socialAccountId: account.id });
          counts.comments += 1;
          for (const r of c?.replies?.data ?? []) {
            await persistContentComment(admin, { companyId: account.company_id, network: account.network, externalPostId: String(item.id), ownerExternalId: ownerId, comment: r, parentExternalId: String(c.id), postRowId: saved.id, socialAccountId: account.id });
            counts.comments += 1;
          }
        }
      } catch (e) {
        const c = classifyMetaError(e);
        commentFailure = { stage: "comments", ok: false, kind: c.kind, message: c.message };
      }
    }

    // 3) Métricas por publicación (snapshot diario).
    try {
      const metrics = ig ? igMetricsFor(saved.format) : FB_POST_METRICS;
      const ins = await tolerantInsights(token, String(item.id), metrics);
      const v = ins.values;
      if (Object.keys(ins.unavailable).length === metrics.length) insightFailures += 1;
      const snapshot = {
        likes: num(v.likes ?? item.like_count ?? v.post_reactions_by_type_total ?? item?.reactions?.summary?.total_count),
        comments: num(v.comments ?? item.comments_count ?? item?.comments?.summary?.total_count),
        shares: num(v.shares ?? item?.shares?.count),
        saves: num(v.saved),
        reach: num(v.reach ?? v.post_impressions_unique),
        impressions: num(v.impressions ?? v.post_impressions),
        views: num(v.views ?? v.post_video_views),
        total_interactions: num(v.total_interactions),
        replies: num(v.replies),
        avg_watch_time_ms: num(v.ig_reels_avg_watch_time),
        total_watch_time_ms: num(v.ig_reels_video_view_total_time),
      };
      await admin.from("meta_content_metric_snapshots").upsert({
        company_id: account.company_id, post_id: saved.id, social_account_id: account.id,
        collected_date: dayOf(), collected_at: new Date().toISOString(), ...snapshot,
        raw_metrics: Object.keys(v).length ? v : null,
        unavailable: Object.keys(ins.unavailable).length ? ins.unavailable : null,
        source: options.trigger === "cron" ? "cron" : "sync",
      }, { onConflict: "post_id,collected_date" });
      await admin.from("meta_content_posts").update({ metrics_latest: snapshot }).eq("id", saved.id);
      counts.snapshots += 1;
    } catch (e) {
      insightFailures += 1;
    }
  }
  if (posts.length) {
    stages.push(commentFailure ?? { stage: "comments", ok: true, count: counts.comments });
    stages.push(insightFailures && insightFailures === posts.length
      ? { stage: "post_insights", ok: false, kind: "permission_missing", message: "Nenhuma métrica de publicação disponível (verifique instagram_manage_insights / read_insights)." }
      : { stage: "post_insights", ok: true, count: counts.snapshots, ...(insightFailures ? { message: `${insightFailures} publicação(ões) sem métricas` } : {}) });
  }

  // 4) Métricas de perfil.
  try {
    const profileFields = ig ? "followers_count,follows_count,media_count" : "followers_count,fan_count";
    const profile = await metaGraphRequest(`/${encodeURIComponent(ownerId)}${qs({ fields: profileFields })}`, token, { method: "GET" });
    const ins = ig
      ? await tolerantInsights(token, ownerId, ["reach", "profile_views", "accounts_engaged", "views"], { period: "day", metric_type: "total_value" })
      : await tolerantInsights(token, ownerId, ["page_impressions_unique", "page_impressions", "page_post_engagements"], { period: "day" });
    const v = ins.values;
    await admin.from("meta_profile_metric_snapshots").upsert({
      company_id: account.company_id, social_account_id: account.id, snapshot_date: dayOf(), collected_at: new Date().toISOString(),
      followers: num(profile?.followers_count ?? profile?.fan_count),
      follows: num(profile?.follows_count),
      media_count: num(profile?.media_count),
      reach: num(v.reach ?? v.page_impressions_unique),
      impressions: num(v.views ?? v.page_impressions),
      profile_views: num(v.profile_views),
      accounts_engaged: num(v.accounts_engaged ?? v.page_post_engagements),
      raw: { profile, insights: v },
      unavailable: Object.keys(ins.unavailable).length ? ins.unavailable : null,
    }, { onConflict: "social_account_id,snapshot_date" });
    counts.profile = 1;
    stages.push({ stage: "profile", ok: true, count: 1, ...(Object.keys(ins.unavailable).length ? { message: `Indisponível: ${Object.entries(ins.unavailable).map(([k, r]) => `${k} (${r})`).join(", ")}` } : {}) });
  } catch (e) {
    const c = classifyMetaError(e);
    stages.push({ stage: "profile", ok: false, kind: c.kind, message: c.message });
  }

  // 5) Stories (solo Instagram).
  if (ig) {
    const st = await captureStoriesForAccount(admin, account, token);
    counts.stories = st.found;
    counts.archived += st.archived;
    stages.push(st.error ? { stage: "stories", ok: false, kind: st.errorKind, message: st.error } : { stage: "stories", ok: true, count: st.found });
  }

  if (newest) await admin.from("meta_social_accounts").update({ sync_cursor: { ...cursor, last_post_at: newest } }).eq("id", account.id);
  const failed = stages.filter((s) => !s.ok);
  return finish(failed.length === 0 ? "ok" : counts.posts || counts.profile || counts.stories ? "partial" : "failed");
}

// ───────────────────────── D. Stories ─────────────────────────

export async function captureStoriesForAccount(admin: Admin, account: SocialAccount, token: string) {
  const out = { found: 0, created: 0, updated: 0, snapshots: 0, archived: 0, error: null as string | null, errorKind: undefined as MetaIssueKind | undefined };
  let stories: any[] = [];
  try {
    const res = await metaGraphRequest(`/${encodeURIComponent(account.external_id)}/stories${qs({ fields: "id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp" })}`, token, { method: "GET" });
    stories = Array.isArray(res?.data) ? res.data : [];
  } catch (e) {
    const c = classifyMetaError(e);
    out.error = c.message;
    out.errorKind = c.kind;
    return out;
  }
  out.found = stories.length;
  for (const s of stories) {
    try {
      const { data: existing } = await admin.from("meta_content_posts").select("id").eq("company_id", account.company_id).eq("network", "instagram").eq("external_post_id", String(s.id)).maybeSingle();
      const saved = await upsertPost(admin, account, { ...s, media_product_type: "STORY" });
      if (existing) out.updated += 1; else out.created += 1;
      // Conserva el multimedia antes de que la URL de la Meta caduque (sin tocar URLs existentes).
      if (!saved.archived_media_key) {
        try {
          const ext = String(s.media_type).toUpperCase() === "VIDEO" ? "mp4" : "jpg";
          const key = await archiveToR2(account.company_id, s.media_url ?? null, `story-${s.id}.${ext}`, s.timestamp);
          const thumbKey = String(s.media_type).toUpperCase() === "VIDEO" ? await archiveToR2(account.company_id, s.thumbnail_url ?? null, `story-${s.id}-thumb.jpg`, s.timestamp).catch(() => null) : null;
          if (key) {
            await admin.from("meta_content_posts").update({ archived_media_key: key, archived_thumbnail_key: thumbKey }).eq("id", saved.id);
            out.archived += 1;
          }
        } catch (e) {
          console.warn("[meta-stories] arquivo R2 falhou", s.id, e instanceof Error ? e.message : e);
        }
      }
      const ins = await tolerantInsights(token, String(s.id), igMetricsFor("story"));
      const v = ins.values;
      const { error } = await admin.from("meta_content_metric_snapshots").upsert({
        company_id: account.company_id, post_id: saved.id, social_account_id: account.id,
        collected_date: dayOf(), collected_at: new Date().toISOString(),
        reach: num(v.reach), views: num(v.views), replies: num(v.replies), shares: num(v.shares), total_interactions: num(v.total_interactions),
        raw_metrics: Object.keys(v).length ? v : null,
        unavailable: Object.keys(ins.unavailable).length ? ins.unavailable : null,
        source: "stories",
      }, { onConflict: "post_id,collected_date" });
      if (!error) out.snapshots += 1;
      await admin.from("meta_content_posts").update({ metrics_latest: { reach: num(v.reach), views: num(v.views), replies: num(v.replies), shares: num(v.shares), total_interactions: num(v.total_interactions) } }).eq("id", saved.id);
    } catch (e) {
      out.error = e instanceof Error ? e.message : String(e);
      out.errorKind = "internal";
    }
  }
  return out;
}

/** Ejecución cron: un solo run a la vez, por lotes, registrando el resultado. */
export async function runStoriesCron(admin: Admin, options: { batchSize?: number } = {}) {
  // Libera bloqueos huérfanos (> 20 min).
  await admin.from("meta_stories_sync_runs").update({ status: "stale", finished_at: new Date().toISOString() })
    .eq("status", "running").lt("started_at", new Date(Date.now() - 20 * 60_000).toISOString());
  const { data: run, error: lockErr } = await admin.from("meta_stories_sync_runs").insert({ status: "running" }).select("id").single();
  if (lockErr) {
    if (/duplicate key|unique/i.test(lockErr.message)) return { ok: true, skipped: "Outra captura de Stories já está em andamento." };
    throw new Error(lockErr.message);
  }
  const totals = { accounts_processed: 0, stories_found: 0, created: 0, updated: 0, snapshots: 0, archived: 0 };
  const errors: { accountId: string; kind?: string; message: string }[] = [];
  try {
    const { data: accounts } = await admin.from("meta_social_accounts")
      .select("id,company_id,instance_id,network,provider,external_id,page_id,ig_user_id,username,display_name,sync_cursor")
      .eq("network", "instagram").neq("status", "disconnected")
      .order("last_synced_at", { ascending: true, nullsFirst: true })
      .limit(Math.min(Math.max(options.batchSize ?? 25, 1), 100));
    for (const account of (accounts ?? []) as SocialAccount[]) {
      const token = await tokenFor(admin, account);
      if (!token) { errors.push({ accountId: account.id, kind: "token_expired", message: "sem token" }); continue; }
      const r = await captureStoriesForAccount(admin, account, token);
      totals.accounts_processed += 1;
      totals.stories_found += r.found; totals.created += r.created; totals.updated += r.updated; totals.snapshots += r.snapshots; totals.archived += r.archived;
      if (r.error) errors.push({ accountId: account.id, kind: r.errorKind, message: r.error });
    }
    const status = errors.length ? (totals.accounts_processed ? "partial" : "failed") : "ok";
    await admin.from("meta_stories_sync_runs").update({ status, ...totals, errors, finished_at: new Date().toISOString() }).eq("id", run.id);
    return { ok: true, status, ...totals, errors };
  } catch (e) {
    await admin.from("meta_stories_sync_runs").update({ status: "failed", ...totals, errors: [...errors, { accountId: "-", message: e instanceof Error ? e.message : String(e) }], finished_at: new Date().toISOString() }).eq("id", run.id);
    throw e;
  }
}

// ───────────────────────── G. Diagnóstico ─────────────────────────

export type DiagnosticCheck = { key: string; label: string; status: "ok" | "warn" | "fail" | "skip"; detail: string; access?: "standard" | "advanced_missing" | "endpoint_failure" | "permission_missing" };

export async function runMetaDiagnostics(token: string, network: "facebook" | "instagram", externalId: string): Promise<DiagnosticCheck[]> {
  const checks: DiagnosticCheck[] = [];
  const igLogin = /^(IGAA|IGQV|IGQW)/.test(token.trim());
  const probe = async (key: string, label: string, path: string, describe: (json: any) => string, opts: { skipIf?: string } = {}) => {
    if (opts.skipIf) { checks.push({ key, label, status: "skip", detail: opts.skipIf }); return null; }
    try {
      const json = await metaGraphRequest(path, token, { method: "GET" });
      checks.push({ key, label, status: "ok", detail: describe(json), access: "standard" });
      return json;
    } catch (e) {
      const c = classifyMetaError(e);
      const access = c.kind === "advanced_access_missing" ? "advanced_missing" : c.kind === "permission_missing" ? "permission_missing" : "endpoint_failure";
      checks.push({ key, label, status: c.kind === "token_expired" || key === "token" ? "fail" : "warn", detail: `${c.kind}: ${c.message}`, access });
      return null;
    }
  };

  const me = await probe("token", "Token do canal", `/me${qs({ fields: igLogin ? "user_id,username" : "id,name" })}`, (j) => `Válido — ${j?.name ?? j?.username ?? j?.id}`);
  if (!me) return checks;
  const tokenIsPage = !igLogin && network === "facebook" ? String(me.id) === externalId : !igLogin;
  const pageId = igLogin ? null : String(me.id);

  await probe("permissions", "/me/permissions", "/me/permissions", (j) => {
    const granted = (j?.data ?? []).filter((p: any) => p.status === "granted").map((p: any) => p.permission);
    return granted.length ? `Concedidas: ${granted.join(", ")}` : "Sem lista";
  }, { skipIf: tokenIsPage ? "Não aplicável a token de Página (só tokens de usuário listam permissões)." : undefined });
  await probe("accounts", "/me/accounts", `/me/accounts${qs({ fields: "id,name", limit: 25 })}`, (j) => `${(j?.data ?? []).length} Página(s)`, { skipIf: tokenIsPage ? "Não aplicável a token de Página." : undefined });

  const page = await probe("page", "Página acessível", `/${pageId}${qs({ fields: "id,name,instagram_business_account{id,username}" })}`, (j) => `${j?.name} (${j?.id})`, { skipIf: igLogin ? "Conta conectada via Instagram Login (sem Página)." : undefined });
  if (page) {
    const ig = page?.instagram_business_account;
    checks.push(ig?.id
      ? { key: "ig_link", label: "Instagram profissional vinculado", status: network === "instagram" && String(ig.id) !== externalId ? "fail" : "ok", detail: `@${ig.username ?? "?"} (${ig.id})${network === "instagram" && String(ig.id) !== externalId ? " — diferente do canal salvo; reconecte" : ""}` }
      : { key: "ig_link", label: "Instagram profissional vinculado", status: network === "instagram" ? "fail" : "warn", detail: "Nenhum Instagram profissional vinculado a esta Página." });
    await probe("subscribed_apps", "Webhooks (subscribed_apps)", `/${pageId}/subscribed_apps`, (j) => {
      const fields = (j?.data ?? []).flatMap((a: any) => a.subscribed_fields ?? []);
      return fields.length ? `Campos: ${fields.join(", ")}` : "Nenhum app assinado — os webhooks não chegarão.";
    });
  } else if (igLogin) {
    await probe("subscribed_apps", "Webhooks (subscribed_apps)", `/me/subscribed_apps`, (j) => JSON.stringify(j?.data ?? []).slice(0, 200));
  }

  const ig = network === "instagram";
  const posts = await probe("posts", "Leitura de publicações", `/${externalId}/${ig ? "media" : "published_posts"}${qs({ fields: "id", limit: 1 })}`, (j) => `${(j?.data ?? []).length ? "OK" : "Sem publicações"}`);
  const firstPost = posts?.data?.[0]?.id;
  await probe("comments", "Comentários", `/${firstPost}/comments${qs({ limit: 1 })}`, (j) => `${(j?.data ?? []).length} retornado(s)`, { skipIf: firstPost ? undefined : "Sem publicação para testar." });
  await probe("insights", "Insights", ig
    ? `/${externalId}/insights${qs({ metric: "reach", period: "day", metric_type: "total_value" })}`
    : `/${externalId}/insights${qs({ metric: "page_impressions_unique", period: "day" })}`, () => "Métricas disponíveis");
  await probe("messenger", "Conversas Messenger", `/${pageId}/conversations${qs({ limit: 1 })}`, (j) => `${(j?.data ?? []).length} conversa(s) na amostra`, { skipIf: pageId ? undefined : "Sem Página." });
  await probe("instagram_dm", "Conversas Instagram", igLogin ? `/me/conversations${qs({ platform: "instagram", limit: 1 })}` : `/${pageId}/conversations${qs({ platform: "instagram", limit: 1 })}`, (j) => `${(j?.data ?? []).length} conversa(s) na amostra`);

  const degraded = checks.filter((c) => c.status === "warn" || c.status === "fail");
  checks.push({
    key: "summary",
    label: "Modo",
    status: degraded.length ? "warn" : "ok",
    detail: degraded.length
      ? `Modo degradado: ${degraded.map((c) => c.label).join(", ")}${degraded.some((c) => c.access === "advanced_missing") ? ". Falta Advanced Access (App Review)." : ""}`
      : "Todas as verificações passaram.",
  });
  return checks;
}
