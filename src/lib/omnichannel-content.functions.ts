import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveCompanyIdCached as resolveCompanyId } from "./company-cache";
import type {
  SocialPlatform,
  SocialAccount,
  ContentPost,
  ContentPostTarget,
  ContentComment,
  SocialProfileMetrics,
  ContentPerformanceInsight,
} from "./social-content.types";

/**
 * 1. Lista todas as contas sociais conectadas da empresa
 * (Instagram, Facebook, TikTok e YouTube).
 */
export const listSocialAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ accounts: SocialAccount[] }> => {
    const companyId = await resolveCompanyId(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: accounts, error } = await (supabaseAdmin as any)
      .from("meta_social_accounts")
      .select("id,company_id,network,provider,external_id,page_id,ig_user_id,username,display_name,picture_url,status,capabilities,sync_cursor,last_synced_at,last_error,instance_id,created_at")
      .eq("company_id", companyId)
      .order("network");

    if (error || !accounts) return { accounts: [] };

    // Mapeia instâncias para obter instance_name se houver
    const ids = accounts.map((a: any) => a.instance_id).filter(Boolean);
    const { data: instances } = ids.length
      ? await (supabaseAdmin as any).from("whatsapp_instances").select("id,instance_name").in("id", ids)
      : { data: [] };
    const nameMap = new Map((instances ?? []).map((i: any) => [i.id, i.instance_name]));

    return {
      accounts: accounts.map((a: any) => ({
        ...a,
        instance_name: a.instance_id ? nameMap.get(a.instance_id) ?? null : null,
      })),
    };
  });

/**
 * 2. Cria uma publicação multicanal e a dispara de imediato ou a programa
 */
export const createOmnichannelPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (d: {
      assetId?: string | null;
      mediaUrl?: string | null;
      mediaType: "video" | "image" | "carousel" | "text";
      baseCaption?: string | null;
      scheduledAt?: string | null;
      source?: "human" | "external_ai" | "automation";
      approvalState?: "draft" | "awaiting_approval" | "approved";
      timezone?: string | null;
      idempotencyKey?: string | null;
      targets: Array<{
        platform: SocialPlatform;
        socialAccountId?: string | null;
        assetId?: string | null;
        customTitle?: string | null;
        customCaption?: string | null;
        platformSettings?: Record<string, any>;
      }>;
    }) => ({
      assetId: d?.assetId ? String(d.assetId).trim() : null,
      mediaUrl: d?.mediaUrl ? String(d.mediaUrl).trim() : null,
      mediaType: d?.mediaType ?? "video",
      baseCaption: d?.baseCaption ? String(d.baseCaption).trim() : null,
      scheduledAt: d?.scheduledAt ? String(d.scheduledAt).trim() : null,
      source: d?.source ?? "human",
      approvalState: d?.approvalState ?? "approved",
      timezone: d?.timezone ? String(d.timezone).trim() : null,
      idempotencyKey: d?.idempotencyKey ? String(d.idempotencyKey).trim() : null,
      targets: Array.isArray(d?.targets) ? d.targets : [],
    }),
  )
  .handler(async ({ context, data }) => {
    const companyId = await resolveCompanyId(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (!data.targets.length) {
      throw new Error("Selecione ao menos uma rede social para publicar.");
    }

    // Regra F0: Rejeitar destinos não homologados diretamente no servidor
    const implementedPublishers = new Set(["instagram", "facebook", "telegram"]);
    const unsupported = data.targets.filter((t) => !implementedPublishers.has(t.platform));
    if (unsupported.length > 0) {
      const unsupportedNames = unsupported.map((t) => t.platform).join(", ");
      throw new Error(`Publicação direta para ${unsupportedNames} está em fase de homologação OAuth.`);
    }

    // Validações por plataforma e ownership de tenant
    for (const target of data.targets) {
      if (target.socialAccountId) {
        const { data: verifiedAcc } = await (supabaseAdmin as any)
          .from("meta_social_accounts")
          .select("id, network, company_id")
          .eq("id", target.socialAccountId)
          .eq("company_id", companyId)
          .maybeSingle();

        if (!verifiedAcc) {
          throw new Error(`A conta ${target.socialAccountId} não pertence à sua empresa ou não existe.`);
        }
        if (verifiedAcc.network !== target.platform) {
          throw new Error(`A conta selecionada pertence à rede ${verifiedAcc.network}, incompatível com o destino ${target.platform}.`);
        }
      }

      if (target.platform === "youtube") {
        if (!target.customTitle?.trim()) {
          throw new Error("YouTube exige um título obrigatório para o vídeo.");
        }
      }
      if (target.platform === "instagram") {
        if (!data.mediaUrl && !data.assetId) {
          throw new Error("Instagram exige uma foto ou vídeo para publicação.");
        }
      }
      if (target.platform === "telegram") {
        if (!data.baseCaption?.trim() && !data.mediaUrl && !data.assetId && !target.customCaption?.trim()) {
          throw new Error("Telegram exige texto ou mídia para publicação.");
        }
      }
    }

    const isScheduled = Boolean(data.scheduledAt && new Date(data.scheduledAt) > new Date());
    const initialStatus = isScheduled ? "scheduled" : "publishing";

    // 1. Grava o post mestre
    const { data: post, error: postErr } = await (supabaseAdmin as any)
      .from("content_posts")
      .insert({
        company_id: companyId,
        user_id: context.userId,
        media_url: data.mediaUrl,
        media_type: data.mediaType,
        base_caption: data.baseCaption,
        scheduled_at: isScheduled ? data.scheduledAt : null,
        status: initialStatus,
        source: data.source,
        approval_state: data.approvalState,
        timezone: data.timezone,
        idempotency_key: data.idempotencyKey,
      })
      .select("id")
      .single();

    if (postErr || !post) {
      console.error("[createOmnichannelPost] Erro insert content_posts:", postErr?.message);
      throw new Error(`Falha ao registrar publicação no banco de dados: ${postErr?.message || "erro desconhecido"}`);
    }

    const postId = post.id;

    // Insere os alvos na tabela content_post_targets
    if (data.targets.length) {
      const targetRows = data.targets.map((t) => ({
        post_id: postId,
        company_id: companyId,
        platform: t.platform,
        social_account_id: t.socialAccountId || null,
        asset_id: t.assetId || data.assetId || null,
        custom_title: t.customTitle || null,
        custom_caption: t.customCaption || null,
        platform_settings: t.platformSettings || {},
        status: "pending",
      }));

      const { error: targetErr } = await (supabaseAdmin as any)
        .from("content_post_targets")
        .insert(targetRows);

      if (targetErr) {
        console.error("[createOmnichannelPost] Erro insert content_post_targets:", targetErr.message);
        await (supabaseAdmin as any)
          .from("content_posts")
          .update({ status: "failed" })
          .eq("id", postId);
        throw new Error(`Falha ao registrar alvos da publicação: ${targetErr.message}`);
      }
    }

    let targetResults: Array<{ platform: string; status: string; error?: string; url?: string }> = [];

    // 2. Se for imediato, orquestra publicação via fila atômica duradoura isolada por tenant e post (P0.4)
    if (!isScheduled) {
      const { processContentTargetsBatch } = await import("./content/queue.server");
      const workerId = `direct-${crypto.randomUUID().slice(0, 8)}`;
      const batch = await processContentTargetsBatch(workerId, data.targets.length, companyId, postId);
      targetResults = batch.results.map((r) => ({
        platform: r.platform,
        status: r.status,
        error: r.error,
        url: r.externalPostId,
      }));
    }

    return {
      ok: true,
      postId,
      isScheduled,
      results: targetResults,
    };
  });

/**
 * 3. Lista histórico unificado de publicações com alvos por plataforma
 */
export const listOmnichannelPosts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ posts: any[] }> => {
    const companyId = await resolveCompanyId(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: posts } = await (supabaseAdmin as any)
      .from("content_posts")
      .select(`
        id, company_id, user_id, source, approval_state, media_url, media_type,
        media_metadata, base_caption, scheduled_at, timezone, idempotency_key,
        status, published_at, created_at, updated_at,
        targets:content_post_targets(
          id, platform, social_account_id, asset_id, custom_title, custom_caption,
          platform_settings, status, attempts, next_attempt_at, lease_until,
          external_post_id, external_url, error_message, published_at
        )
      `)
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(50);

    return { posts: posts ?? [] };
  });

/**
 * 3.1 Aprova uma publicação mestre (humano ou operador com permissão)
 */
export const approveOmnichannelPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { postId: string }) => d)
  .handler(async ({ context, data }) => {
    const companyId = await resolveCompanyId(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: post, error } = await (supabaseAdmin as any)
      .from("content_posts")
      .update({
        approval_state: "approved",
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.postId)
      .eq("company_id", companyId)
      .select("id, status, scheduled_at")
      .single();

    if (error || !post) {
      throw new Error(`Falha ao aprovar postagem: ${error?.message || "Postagem não encontrada"}`);
    }

    // Se a postagem for de envio imediato (scheduled_at nulo ou passado), dispara worker para processar isolado por tenant e post
    if (!post.scheduled_at || new Date(post.scheduled_at).getTime() <= Date.now()) {
      const { processContentTargetsBatch } = await import("./content/queue.server");
      const workerId = `approve-${crypto.randomUUID().slice(0, 8)}`;
      await processContentTargetsBatch(workerId, 5, companyId, post.id).catch(() => {});
    }

    return { ok: true, postId: post.id };
  });

/**
 * 3.2 Reprova uma publicação mestre
 */
export const rejectOmnichannelPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { postId: string; reason?: string }) => d)
  .handler(async ({ context, data }) => {
    const companyId = await resolveCompanyId(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error } = await (supabaseAdmin as any)
      .from("content_posts")
      .update({
        approval_state: "rejected",
        status: "failed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.postId)
      .eq("company_id", companyId);

    if (error) {
      throw new Error(`Falha ao rejeitar postagem: ${error.message}`);
    }

    await (supabaseAdmin as any)
      .from("content_post_targets")
      .update({
        status: "cancelled",
        error_message: data.reason || "Rejeitado pelo operador",
        updated_at: new Date().toISOString(),
      })
      .eq("post_id", data.postId)
      .eq("company_id", companyId);

    return { ok: true };
  });

/**
 * 3.3 Cancela uma postagem agendada ou pendente
 */
export const cancelOmnichannelPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { postId: string }) => d)
  .handler(async ({ context, data }) => {
    const companyId = await resolveCompanyId(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error } = await (supabaseAdmin as any)
      .from("content_posts")
      .update({
        status: "cancelled",
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.postId)
      .eq("company_id", companyId)
      .in("status", ["scheduled", "draft", "publishing"]);

    if (error) {
      throw new Error(`Falha ao cancelar postagem: ${error.message}`);
    }

    await (supabaseAdmin as any)
      .from("content_post_targets")
      .update({
        status: "cancelled",
        error_message: "Publicação cancelada pelo usuário",
        updated_at: new Date().toISOString(),
      })
      .eq("post_id", data.postId)
      .eq("company_id", companyId)
      .in("status", ["pending", "retry_wait", "leased"]);

    return { ok: true };
  });

/**
 * 3.4 Reenfileira um target que falhou (reintento manual)
 */
export const retryOmnichannelTarget = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { targetId: string }) => d)
  .handler(async ({ context, data }) => {
    const companyId = await resolveCompanyId(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // P1.5: Restringe reenvio estritamente a destinos que falharam (impede reenvio acidental de já publicados)
    const { data: target, error } = await (supabaseAdmin as any)
      .from("content_post_targets")
      .update({
        status: "pending",
        attempts: 0,
        provider_job_id: null, // P1.G: Limpa job para iniciar nova postagem em vez de consultar job morto
        external_post_id: null,
        next_attempt_at: null,
        error_message: null,
        lease_owner: null,
        lease_until: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.targetId)
      .eq("company_id", companyId)
      .in("status", ["failed", "failed_terminal"])
      .select("id, post_id")
      .single();

    if (error || !target) {
      throw new Error(`Falha ao redefinir target para reenvio: apenas destinos com falha podem ser reenviados.`);
    }

    // Atualiza post master para publishing
    await (supabaseAdmin as any)
      .from("content_posts")
      .update({ status: "publishing", updated_at: new Date().toISOString() })
      .eq("id", target.post_id)
      .eq("company_id", companyId);

    // Dispara worker imediato isolado por tenant e post
    const { processContentTargetsBatch } = await import("./content/queue.server");
    const workerId = `retry-${crypto.randomUUID().slice(0, 8)}`;
    await processContentTargetsBatch(workerId, 1, companyId, target.post_id).catch(() => {});

    return { ok: true };
  });

/**
 * 4. Métricas e Inteligência Verificável de Conteúdo
 * Não utiliza constantes inventadas nem multiplicações fictícias.
 */
export const getOmnichannelIntelligence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { socialAccountId?: string | null }) => ({
    socialAccountId: d?.socialAccountId || null,
  }))
  .handler(async ({ context, data }) => {
    const companyId = await resolveCompanyId(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;

    // 1. Consulta contas sociais conectadas da empresa
    let accountsQuery = admin
      .from("meta_social_accounts")
      .select("id,network,username,display_name,picture_url,status")
      .eq("company_id", companyId);

    if (data.socialAccountId) {
      accountsQuery = accountsQuery.eq("id", data.socialAccountId);
    }

    const { data: accounts } = await accountsQuery;

    // 2. Consulta histórico de métricas reais (snapshots)
    let snapshotsQuery = admin
      .from("meta_profile_metric_snapshots")
      .select("social_account_id,snapshot_date,followers,follows,media_count,reach,impressions,profile_views")
      .eq("company_id", companyId)
      .order("snapshot_date", { ascending: false })
      .limit(60);

    if (data.socialAccountId) {
      snapshotsQuery = snapshotsQuery.eq("social_account_id", data.socialAccountId);
    }

    const { data: snapshots } = await snapshotsQuery;

    // 3. Consulta publicações com métricas reais
    const { data: posts } = await admin
      .from("meta_content_posts")
      .select("id,published_at,format,metrics_latest,caption,permalink,thumbnail_url,media_url,network")
      .eq("company_id", companyId)
      .not("published_at", "is", null)
      .order("published_at", { ascending: false })
      .limit(200);

    const hasRealSnapshots = Array.isArray(snapshots) && snapshots.length > 0;
    const hasAccounts = Array.isArray(accounts) && accounts.length > 0;

    // Caso não existam dados reais conectados, retorna explicitamente no_data sem números fictícios
    if (!hasAccounts || (!hasRealSnapshots && (!posts || posts.length === 0))) {
      return {
        availability: "no_data" as const,
        reason: "Métricas agregadas indisponíveis para este período. Conecte contas sociais com permissão de Insights e execute a sincronização para carregar dados reais.",
        kpis: null,
        heatmapBestHours: [],
        accounts: accounts ?? [],
        posts: [],
      };
    }

    // Mapeamento enriquecido de contas com seus snapshots mais recentes
    const accountsWithSnapshots = (accounts ?? []).map((acc: any) => {
      const snap = (snapshots ?? []).find((s: any) => s.social_account_id === acc.id);
      return {
        ...acc,
        followers: snap ? Number(snap.followers) || 0 : 0,
        reach: snap ? Number(snap.reach) || 0 : 0,
        impressions: snap ? Number(snap.impressions) || 0 : 0,
        media_count: snap ? Number(snap.media_count) || 0 : 0,
      };
    });

    // Agregação estritamente baseada nos dados existentes
    const latestAccountSnapshots = (snapshots ?? []).slice(0, (accounts ?? []).length);
    const totalFollowers = latestAccountSnapshots.reduce((acc: number, s: any) => acc + (Number(s.followers) || 0), 0);
    const totalImpressions = (snapshots ?? []).reduce((acc: number, s: any) => acc + (Number(s.impressions) || 0), 0);
    const totalReach = (snapshots ?? []).reduce((acc: number, s: any) => acc + (Number(s.reach) || 0), 0);

    // Cálculo de interações observadas por publicação
    let totalInteractions = 0;
    let postsWithInteractions = 0;
    const hourBuckets: Record<number, { count: number; interactions: number }> = {};

    for (const post of posts ?? []) {
      const metrics = post.metrics_latest && typeof post.metrics_latest === "object" ? post.metrics_latest : {};
      const likes = Number(metrics.likes) || 0;
      const comments = Number(metrics.comments) || 0;
      const shares = Number(metrics.shares) || 0;
      const interactions = likes + comments + shares;

      if (interactions > 0) {
        totalInteractions += interactions;
        postsWithInteractions++;
      }

      if (post.published_at) {
        const d = new Date(post.published_at);
        if (!Number.isNaN(d.getTime())) {
          const hour = d.getUTCHours();
          if (!hourBuckets[hour]) hourBuckets[hour] = { count: 0, interactions: 0 };
          hourBuckets[hour].count++;
          hourBuckets[hour].interactions += interactions;
        }
      }
    }

    // Heatmap calculado apenas se houver amostra estatística mínima (>= 2 publicações no horário)
    const heatmapBestHours = Object.entries(hourBuckets)
      .filter(([_, slot]) => slot.count >= 2)
      .map(([hourStr, slot]) => ({
        day: "Geral",
        hour: `${String(hourStr).padStart(2, "0")}:00 UTC`,
        sampleSize: slot.count,
        avgInteractions: Math.round((slot.interactions / slot.count) * 10) / 10,
        score: Math.min(100, Math.round((slot.interactions / Math.max(1, slot.count)) * 10)),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    const performanceScore = totalReach > 0 && totalInteractions > 0
      ? Math.min(100, Math.round((totalInteractions / totalReach) * 1000))
      : null;

    return {
      availability: "available" as const,
      reason: null,
      kpis: {
        totalFollowers,
        totalImpressions,
        totalReach,
        totalInteractions,
        performanceScore,
        samplePostsCount: posts?.length || 0,
        postsWithInteractions,
      },
      heatmapBestHours,
      accounts: accountsWithSnapshots,
      posts: posts ?? [],
    };
  });

/**
 * 4.1 Consulta comentários reais do banco com paginação e filtros.
 */
export const listOmnichannelComments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (d: {
      platform?: string;
      status?: "all" | "pending" | "replied";
      search?: string;
      postId?: string;
      includeOwn?: boolean;
      limit?: number;
      offset?: number;
    }) => ({
      platform: d?.platform || "all",
      status: d?.status || "all",
      search: d?.search?.trim() || "",
      postId: d?.postId?.trim() || "",
      includeOwn: Boolean(d?.includeOwn),
      limit: Math.min(Math.max(d?.limit ?? 50, 1), 100),
      offset: Math.max(d?.offset ?? 0, 0),
    }),
  )
  .handler(async ({ context, data }) => {
    const companyId = await resolveCompanyId(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;

    let q = admin
      .from("meta_content_comments")
      .select(
        "id,company_id,post_id,social_account_id,network,external_comment_id,external_post_id,parent_external_id,author_id,author_name,author_username,text,like_count,reply_count,is_own,status,commented_at,created_at,updated_at,meta_content_posts(caption,permalink,media_url,thumbnail_url)",
        { count: "exact" },
      )
      .eq("company_id", companyId)
      .order("commented_at", { ascending: false, nullsFirst: false })
      .range(data.offset, data.offset + data.limit - 1);

    if (!data.includeOwn) {
      q = q.or("is_own.is.null,is_own.eq.false");
    }
    if (data.platform && data.platform !== "all") {
      q = q.eq("network", data.platform);
    }
    if (data.postId) {
      q = q.or(`external_post_id.eq.${data.postId},post_id.eq.${data.postId}`);
    }
    if (data.status === "pending") {
      q = q.or("status.is.null,status.eq.pending,status.eq.visible");
    } else if (data.status === "replied") {
      q = q.eq("status", "replied");
    }
    if (data.search) {
      q = q.or(`text.ilike.%${data.search}%,author_name.ilike.%${data.search}%,author_username.ilike.%${data.search}%`);
    }

    const [
      { data: rows, count, error },
      { data: socialAccounts },
      { data: metaInstances },
      pendingRes,
      repliedRes,
    ] = await Promise.all([
      q,
      admin
        .from("meta_social_accounts")
        .select("id,network,instance_id,username,display_name,status")
        .eq("company_id", companyId),
      admin
        .from("whatsapp_instances")
        .select("id,instance_name,provider,status")
        .eq("company_id", companyId)
        .in("provider", ["meta_instagram", "meta_messenger"]),
      admin
        .from("meta_content_comments")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .or("is_own.is.null,is_own.eq.false")
        .or("status.is.null,status.eq.pending,status.eq.visible"),
      admin
        .from("meta_content_comments")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .or("is_own.is.null,is_own.eq.false")
        .eq("status", "replied"),
    ]);

    const hasConnectedAccounts = Boolean((socialAccounts?.length ?? 0) > 0 || (metaInstances?.length ?? 0) > 0);

    if (error) {
      return {
        comments: [],
        total: 0,
        hasMore: false,
        hasConnectedAccounts,
        counts: {
          pending: pendingRes?.count ?? 0,
          replied: repliedRes?.count ?? 0,
          all: (pendingRes?.count ?? 0) + (repliedRes?.count ?? 0),
        },
        error: error.message,
      };
    }

    const instById = new Map<string, any>((metaInstances ?? []).map((i: any) => [i.id, i]));
    const instByNetwork = new Map<string, any>();
    for (const i of metaInstances ?? []) {
      const net = i.provider === "meta_instagram" ? "instagram" : "facebook";
      if (!instByNetwork.has(net) || i.status === "connected") {
        instByNetwork.set(net, i);
      }
    }
    const accountById = new Map<string, any>((socialAccounts ?? []).map((a: any) => [a.id, a]));

    // Consultar estado de automatizaciones recientes para los comentarios visibles
    const externalCommentIds = (rows ?? []).map((r: any) => r.external_comment_id).filter(Boolean);
    const autoByCommentId = new Map<string, { status: string; reason?: string | null; workflowId?: string | null }>();

    if (externalCommentIds.length > 0) {
      const { data: evts } = await admin
        .from("automation_events")
        .select("id,entity_id,payload,created_at")
        .eq("company_id", companyId)
        .eq("event_name", "meta.comment_received.v1")
        .in("entity_id", externalCommentIds)
        .order("created_at", { ascending: false });

      const evtIds = (evts ?? []).map((e: any) => e.id).filter(Boolean);
      const execByEventId = new Map<string, any>();
      if (evtIds.length > 0) {
        const { data: execs } = await admin
          .from("automation_executions")
          .select("id,trigger_event_id,workflow_id,status,error_message")
          .eq("company_id", companyId)
          .in("trigger_event_id", evtIds);
        for (const ex of execs ?? []) {
          if (ex.trigger_event_id && !execByEventId.has(ex.trigger_event_id)) {
            execByEventId.set(ex.trigger_event_id, ex);
          }
        }
      }

      for (const ev of evts ?? []) {
        if (!ev.entity_id || autoByCommentId.has(ev.entity_id)) continue;
        const exec = execByEventId.get(ev.id);
        if (exec) {
          autoByCommentId.set(ev.entity_id, {
            status: exec.status || "triggered",
            reason: exec.error_message || null,
            workflowId: exec.workflow_id || null,
          });
        } else if (ev.payload?.skippedReason) {
          autoByCommentId.set(ev.entity_id, {
            status: "skipped",
            reason: ev.payload.skippedReason,
            workflowId: null,
          });
        }
      }
    }

    const comments = (rows ?? []).map((r: any) => {
      const acc = r.social_account_id ? accountById.get(r.social_account_id) : null;
      const inst = (acc?.instance_id ? instById.get(acc.instance_id) : null) || instByNetwork.get(r.network);
      const autoInfo = r.external_comment_id ? autoByCommentId.get(r.external_comment_id) : undefined;
      return {
        id: r.id,
        post_id: r.post_id ?? null,
        social_account_id: r.social_account_id ?? acc?.id ?? null,
        instance_name: inst?.instance_name ?? null,
        platform: r.network as SocialPlatform,
        external_comment_id: r.external_comment_id,
        external_post_id: r.external_post_id,
        parent_external_id: r.parent_external_id ?? null,
        author_id: r.author_id ?? null,
        author_name: r.author_name || (r.author_username ? `@${r.author_username}` : "Usuario"),
        author_username: r.author_username || "",
        text: r.text || "",
        like_count: Number(r.like_count) || 0,
        reply_count: Number(r.reply_count) || 0,
        is_own: Boolean(r.is_own),
        intent: (r.text || "").toLowerCase().match(/precio|preço|valor|plan|plano|comprar|cuanto|quanto|pix|binance|pago|info|informaci[oó]n|disponible|contrat/i)
          ? "commercial"
          : "general",
        status: r.status === "replied" ? "replied" : "pending",
        commented_at: r.commented_at || r.created_at || new Date().toISOString(),
        replied_at: r.status === "replied" ? (r.updated_at || null) : null,
        postCaption: r.meta_content_posts?.caption ?? null,
        permalink: r.meta_content_posts?.permalink ?? null,
        postMediaUrl: r.meta_content_posts?.media_url ?? null,
        postThumbnailUrl: r.meta_content_posts?.thumbnail_url ?? r.meta_content_posts?.media_url ?? null,
        automationStatus: autoInfo?.status ?? null,
        automationReason: autoInfo?.reason ?? null,
        automationWorkflowId: autoInfo?.workflowId ?? null,
      };
    });

    const pendingCount = pendingRes?.count ?? 0;
    const repliedCount = repliedRes?.count ?? 0;

    return {
      comments,
      total: count ?? comments.length,
      hasMore: data.offset + comments.length < (count ?? comments.length),
      hasConnectedAccounts,
      counts: {
        pending: pendingCount,
        replied: repliedCount,
        all: pendingCount + repliedCount,
      },
      error: null,
    };
  });

/**
 * 4.1b Genera una sugerencia real de respuesta con IA para un comentario (pública o DM privado).
 */
export const suggestCommentReplyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: {
    commentText: string;
    authorName?: string;
    platform?: string;
    postCaption?: string | null;
    mode?: "public" | "dm";
  }) => {
    const commentText = String(d?.commentText ?? "").trim();
    if (!commentText) throw new Error("El comentario no tiene texto para analizar.");
    return {
      commentText,
      authorName: String(d?.authorName ?? "").trim(),
      platform: String(d?.platform ?? "instagram").trim(),
      postCaption: d?.postCaption ? String(d.postCaption).trim().slice(0, 500) : "",
      mode: d?.mode === "dm" ? ("dm" as const) : ("public" as const),
    };
  })
  .handler(async ({ context, data }) => {
    const companyId = await resolveCompanyId(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;

    const { data: comp } = await admin
      .from("company")
      .select("nome")
      .eq("id", companyId)
      .maybeSingle();
    const companyName = comp?.nome || "nuestro equipo";

    const modeHint = data.mode === "dm"
      ? "Redacta un mensaje privado directo (DM) amable, claro y orientado a ayudar o cerrar la venta."
      : "Redacta una respuesta pública breve para el comentario en la publicación (máximo 2-3 frases) invitando si corresponde a continuar por DM o WhatsApp.";

    try {
      const { lovableAiChat } = await import("@/lib/lovable-ai.server");
      const suggestion = await lovableAiChat(
        [
          {
            role: "system",
            content:
              `Eres el asistente comercial de "${companyName}". Responde en el mismo idioma del comentario (español por defecto si es ambiguo). ` +
              `${modeHint} No inventes precios ni enlaces si no aparecen en el contexto. Devuelve únicamente el texto listo para enviar, sin comillas.`,
          },
          {
            role: "user",
            content:
              `Red: ${data.platform}\n` +
              `Usuario: ${data.authorName || "Cliente"}\n` +
              (data.postCaption ? `Publicación: ${data.postCaption}\n` : "") +
              `Comentario: ${data.commentText}`,
          },
        ],
        { temperature: 0.5, maxTokens: 220 },
      );

      if (suggestion && suggestion.trim()) {
        return { ok: true, suggestion: suggestion.trim(), source: "ai" as const };
      }
    } catch (err: any) {
      console.warn("[suggestCommentReplyFn] Fallback por error de IA:", err?.message);
    }

    const namePart = data.authorName ? ` ${data.authorName.replace(/^@/, "")}` : "";
    const fallback = data.mode === "dm"
      ? `¡Hola${namePart}! Gracias por escribirnos desde ${data.platform}. Con gusto te comparto toda la información por aquí, ¿qué necesitas consultar específicamente?`
      : `¡Hola${namePart}! Con mucho gusto te ayudamos, te escribimos por mensaje directo o puedes escribirnos a nuestro WhatsApp de atención.`;
    return { ok: true, suggestion: fallback, source: "fallback" as const };
  });

/**
 * 4.2 Atribuição Comercial: Registra evento com evidência explícita (UTM, lead form, referral)
 */
export const recordContentAttributionEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (d: {
      contentPostId?: string;
      campaignId?: string;
      eventType: "lead_created" | "deal_won" | "meeting_booked" | "messaging_referral" | "comment_intent";
      crmCardId?: string;
      sourceUrl?: string;
      utmSource?: string;
      utmMedium?: string;
      utmCampaign?: string;
      utmContent?: string;
      providerEventId?: string;
      evidenceType: "utm" | "lead_form" | "messaging_referral" | "manual_verified";
      confidence?: number;
      dedupKey?: string;
      occurredAt?: string;
    }) => d,
  )
  .handler(async ({ context, data }) => {
    const companyId = await resolveCompanyId(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;

    const dedupKey = data.dedupKey || `${data.eventType}-${data.contentPostId || "none"}-${data.crmCardId || "none"}-${data.occurredAt || Date.now()}`;

    const { error } = await admin.from("content_attribution_events").insert({
      company_id: companyId,
      content_post_id: data.contentPostId || null,
      campaign_id: data.campaignId || null,
      event_type: data.eventType,
      crm_card_id: data.crmCardId || null,
      source_url: data.sourceUrl || null,
      utm_source: data.utmSource || null,
      utm_medium: data.utmMedium || null,
      utm_campaign: data.utmCampaign || null,
      utm_content: data.utmContent || null,
      provider_event_id: data.providerEventId || null,
      evidence_type: data.evidenceType,
      confidence: typeof data.confidence === "number" ? Math.max(0, Math.min(1, data.confidence)) : 1.0,
      dedup_key: dedupKey,
      occurred_at: new Date().toISOString(),
    });

    if (error && !error.message?.includes("duplicate key")) {
      throw new Error(`Erro ao registrar atribuição: ${error.message}`);
    }

    return { ok: true, dedupKey };
  });

/**
 * 4.3 Resumo Comercial: Agregação de leads e vendas atribuídas a publicações
 */
export const getContentAttributionSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { contentPostId?: string }) => ({
    contentPostId: d?.contentPostId || undefined,
  }))
  .handler(async ({ context, data }) => {
    const companyId = await resolveCompanyId(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;

    let q = admin
      .from("content_attribution_events")
      .select("id,event_type,evidence_type,confidence,occurred_at,crm_card_id,crm_cards(nome,valor,stage_id)")
      .eq("company_id", companyId)
      .order("occurred_at", { ascending: false })
      .limit(100);

    if (data.contentPostId) {
      q = q.eq("content_post_id", data.contentPostId);
    }

    const { data: events, error } = await q;
    if (error) {
      return { events: [], summary: { totalLeads: 0, totalWonDeals: 0, totalAttributedValue: 0 } };
    }

    let totalLeads = 0;
    let totalWonDeals = 0;
    let totalAttributedValue = 0;

    for (const evt of events ?? []) {
      if (evt.event_type === "lead_created" || evt.event_type === "messaging_referral") {
        totalLeads++;
      } else if (evt.event_type === "deal_won") {
        totalWonDeals++;
        const val = Number(evt.crm_cards?.valor) || 0;
        totalAttributedValue += val;
      }
    }

    return {
      events: events ?? [],
      summary: {
        totalLeads,
        totalWonDeals,
        totalAttributedValue,
        hasEvidence: (events ?? []).length > 0,
      },
    };
  });

/**
 * 5. Prepara o upload direto de um ativo de mídia em R2 com registro no banco (estado 'prepared')
 */
export const prepareContentAssetFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (d: {
      originalName: string;
      mimeType: string;
      sizeBytes: number;
      width?: number;
      height?: number;
      durationSeconds?: number;
      storageAccountId?: string | null;
    }) => d,
  )
  .handler(async ({ context, data }) => {
    const companyId = await resolveCompanyId(context.supabase, context.userId);
    const { prepareContentAsset } = await import("./content/assets.server");
    return prepareContentAsset({
      companyId,
      originalName: data.originalName,
      mimeType: data.mimeType,
      sizeBytes: data.sizeBytes,
      width: data.width,
      height: data.height,
      durationSeconds: data.durationSeconds,
      storageAccountId: data.storageAccountId,
    });
  });

/**
 * 6. Confirma a conclusão do upload direto no R2 e valida o objeto via HEAD (estado 'ready')
 */
export const completeContentAssetFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { assetId: string; sha256?: string | null }) => d)
  .handler(async ({ context, data }) => {
    const companyId = await resolveCompanyId(context.supabase, context.userId);
    const { completeContentAsset } = await import("./content/assets.server");
    return completeContentAsset({
      companyId,
      assetId: data.assetId,
      sha256: data.sha256,
    });
  });
