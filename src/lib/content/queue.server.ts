import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { resolveProviderMedia } from "./assets.server";
import {
  getPublisherAdapter,
  PermanentProviderError,
  ProviderResult,
  PublishContext,
  RetryableProviderError,
  SocialPlatform,
} from "./providers";

export interface ProcessedTargetOutcome {
  targetId: string;
  postId: string;
  platform: string;
  status: string;
  error?: string;
  externalPostId?: string;
}

/**
 * Reconcilia e atualiza o estado mestre da postagem a partir do agregado dos seus alvos (targets).
 */
export async function reconcileMasterPostStatus(postId: string, companyId: string): Promise<string> {
  const { data: targets, error } = await (supabaseAdmin as any)
    .from("content_post_targets")
    .select("status")
    .eq("post_id", postId)
    .eq("company_id", companyId);

  if (error || !targets || targets.length === 0) {
    return "draft";
  }

  const statuses = targets.map((t: any) => t.status);

  // Se algum ainda está em trânsito/reintento, a postagem está em processamento
  const hasInTransit = statuses.some((s: string) =>
    ["pending", "leased", "uploading", "processing", "retry_wait"].includes(s)
  );

  if (hasInTransit) {
    await (supabaseAdmin as any)
      .from("content_posts")
      .update({ status: "publishing", updated_at: new Date().toISOString() })
      .eq("id", postId)
      .eq("company_id", companyId);
    return "publishing";
  }

  const allPublished = statuses.every((s: string) => s === "published");
  const hasPublished = statuses.some((s: string) => s === "published");
  const allAwaitingCreator = statuses.every((s: string) => s === "awaiting_creator_post");
  const hasAwaitingCreator = statuses.some((s: string) => s === "awaiting_creator_post");
  const allFailed = statuses.every((s: string) => ["failed_terminal", "failed", "cancelled"].includes(s));

  let aggregateStatus = "draft";
  if (allPublished) {
    aggregateStatus = "published";
  } else if (allAwaitingCreator) {
    aggregateStatus = "awaiting_creator_post";
  } else if (allFailed) {
    aggregateStatus = "failed";
  } else if (hasPublished) {
    aggregateStatus = "partial";
  } else if (hasAwaitingCreator) {
    aggregateStatus = "awaiting_creator_post";
  } else {
    aggregateStatus = "failed";
  }

  const { error: postUpdErr } = await (supabaseAdmin as any)
    .from("content_posts")
    .update({
      status: aggregateStatus,
      published_at: aggregateStatus === "published" || (aggregateStatus === "partial" && hasPublished) ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", postId)
    .eq("company_id", companyId);

  if (postUpdErr) {
    console.error(`[queue.server] Erro ao atualizar status do post mestre ${postId}:`, postUpdErr);
  }

  return aggregateStatus;
}

/**
 * Reclama um único target pronto via RPC atômica (FOR UPDATE SKIP LOCKED) e executa o envio seguro.
 * Suporta filtros opcionais de isolamento de tenant (companyIdFilter) e post (postIdFilter).
 */
export async function claimAndProcessTarget(
  workerId: string,
  companyIdFilter?: string | null,
  postIdFilter?: string | null
): Promise<{
  claimed: boolean;
  outcome?: ProcessedTargetOutcome;
}> {
  // 1. RPC atômica que trava exclusivamente 1 linha e incrementa attempts
  const { data: claimedRows, error: claimErr } = await (supabaseAdmin as any).rpc("claim_content_target", {
    p_worker: workerId,
    p_company_id: companyIdFilter || null,
    p_post_id: postIdFilter || null,
  });

  if (claimErr) {
    console.error("[queue.server] Erro ao chamar RPC claim_content_target:", claimErr);
    return { claimed: false };
  }

  const target = Array.isArray(claimedRows) && claimedRows.length > 0 ? claimedRows[0] : null;
  if (!target) {
    return { claimed: false };
  }

  const targetId = target.id;
  const postId = target.post_id;
  const companyId = target.company_id;
  const platform = target.platform as SocialPlatform;

  try {
    // 2. Busca postagem mestre verificando rigorosamente company_id
    const { data: post, error: postErr } = await (supabaseAdmin as any)
      .from("content_posts")
      .select("id, company_id, media_url, media_type, base_caption, status, approval_state, scheduled_at, timezone")
      .eq("id", postId)
      .eq("company_id", companyId)
      .maybeSingle();

    if (postErr || !post) {
      await (supabaseAdmin as any)
        .from("content_post_targets")
        .update({
          status: "failed_terminal",
          error_message: "Postagem mestre não encontrada ou tenant incompatível.",
          lease_owner: null,
          lease_until: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", targetId)
        .eq("company_id", companyId);

      return {
        claimed: true,
        outcome: {
          targetId,
          postId,
          platform,
          status: "failed_terminal",
          error: "Postagem mestre ausente",
        },
      };
    }

    // Se o post foi cancelado ou reprovado pelo operador humano
    if (post.approval_state === "rejected" || post.status === "cancelled") {
      await (supabaseAdmin as any)
        .from("content_post_targets")
        .update({
          status: "cancelled",
          error_message: "Publicação cancelada pelo usuário.",
          lease_owner: null,
          lease_until: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", targetId)
        .eq("company_id", companyId);

      await reconcileMasterPostStatus(postId, companyId);
      return {
        claimed: true,
        outcome: { targetId, postId, platform, status: "cancelled" },
      };
    }

    // 3. Resolve mídia duradoura em URL temporária fresca (3600s) sem persistir URL efêmera
    let effectiveMediaUrl = post.media_url;
    const effectiveAssetId = target.asset_id || (post as any).asset_id;

    if (effectiveAssetId) {
      try {
        const resolved = await resolveProviderMedia(effectiveAssetId, companyId, platform, 3600);
        if (resolved?.publicUrl) {
          effectiveMediaUrl = resolved.publicUrl;
        }
      } catch (mediaErr: any) {
        console.warn(`[queue.server] Falha ao resolver URL efêmera do ativo ${effectiveAssetId}:`, mediaErr);
      }
    }

    // 4. Monta contexto de execução para o adaptador
    const publishCtx: PublishContext = {
      postId,
      targetId,
      companyId,
      platform,
      socialAccountId: target.social_account_id,
      caption: target.custom_caption?.trim() || post.base_caption || "",
      title: target.custom_title,
      mediaUrl: effectiveMediaUrl,
      mediaType: post.media_type,
      platformSettings: target.platform_settings,
      scheduledAt: post.scheduled_at,
      timezone: post.timezone,
    };

    const adapter = getPublisherAdapter(platform);

    // Validação estrita
    const validation = await adapter.validate(publishCtx);
    if (!validation.valid) {
      throw new PermanentProviderError(validation.error || "Validação do destino falhou", "VALIDATION_FAILED");
    }

    let result: ProviderResult;

    // Se o target já possui provider_job_id (iniciado previamente) e o adaptador suporta reconciliação
    if (target.provider_job_id && adapter.reconcile) {
      result = await adapter.reconcile(target.provider_job_id, companyId, target.social_account_id);
    } else {
      result = await adapter.publish(publishCtx);
    }

    // 5. Persiste resultado do provedor com verificação estrita de posse de lease (P0.3)
    if (result.state === "published" || result.state === "scheduled_on_provider") {
      const { error: updErr } = await (supabaseAdmin as any)
        .from("content_post_targets")
        .update({
          status: "published",
          external_post_id: result.externalPostId,
          external_url: (result as any).externalUrl || null,
          error_message: null,
          lease_owner: null,
          lease_until: null,
          published_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", targetId)
        .eq("company_id", companyId)
        .eq("lease_owner", workerId);

      if (updErr) {
        console.error(`[queue.server] Erro crítico ao persistir status published para ${targetId}:`, updErr);
        throw updErr;
      }

      await reconcileMasterPostStatus(postId, companyId);
      return {
        claimed: true,
        outcome: {
          targetId,
          postId,
          platform,
          status: "published",
          externalPostId: result.externalPostId,
        },
      };
    } else if (result.state === "awaiting_creator_post") {
      const { error: updErr } = await (supabaseAdmin as any)
        .from("content_post_targets")
        .update({
          status: "awaiting_creator_post",
          external_post_id: result.externalPostId || null,
          error_message: null,
          lease_owner: null,
          lease_until: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", targetId)
        .eq("company_id", companyId)
        .eq("lease_owner", workerId);

      if (updErr) {
        console.error(`[queue.server] Erro ao persistir awaiting_creator_post para ${targetId}:`, updErr);
        throw updErr;
      }

      await reconcileMasterPostStatus(postId, companyId);
      return {
        claimed: true,
        outcome: {
          targetId,
          postId,
          platform,
          status: "awaiting_creator_post",
          externalPostId: result.externalPostId,
        },
      };
    } else if (result.state === "processing") {
      // P0.2: Agenda próxima reconciliação em 1 minuto
      const nextAttemptAt = new Date(Date.now() + 60000).toISOString();
      const { error: updErr } = await (supabaseAdmin as any)
        .from("content_post_targets")
        .update({
          status: "processing",
          provider_job_id: result.providerJobId,
          next_attempt_at: nextAttemptAt,
          lease_owner: null,
          lease_until: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", targetId)
        .eq("company_id", companyId)
        .eq("lease_owner", workerId);

      if (updErr) {
        console.error(`[queue.server] Erro ao persistir processamento para ${targetId}:`, updErr);
        throw updErr;
      }

      await reconcileMasterPostStatus(postId, companyId);
      return {
        claimed: true,
        outcome: {
          targetId,
          postId,
          platform,
          status: "processing",
        },
      };
    } else {
      // failed_terminal
      const { error: updErr } = await (supabaseAdmin as any)
        .from("content_post_targets")
        .update({
          status: "failed_terminal",
          error_message: (result as any).message || "Falha terminal na publicação",
          lease_owner: null,
          lease_until: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", targetId)
        .eq("company_id", companyId)
        .eq("lease_owner", workerId);

      if (updErr) {
        console.error(`[queue.server] Erro ao persistir failed_terminal para ${targetId}:`, updErr);
      }

      await reconcileMasterPostStatus(postId, companyId);
      return {
        claimed: true,
        outcome: {
          targetId,
          postId,
          platform,
          status: "failed_terminal",
          error: (result as any).message,
        },
      };
    }
  } catch (err: any) {
    const isRetryable = err instanceof RetryableProviderError;
    const isTerminal = err instanceof PermanentProviderError;
    const currentAttempts = Number(target.attempts || 1);

    if (isRetryable && currentAttempts < 3) {
      const backoffSec = err.retryAfterSeconds || Math.min(300, currentAttempts * 60);
      const nextAttemptAt = new Date(Date.now() + backoffSec * 1000).toISOString();

      await (supabaseAdmin as any)
        .from("content_post_targets")
        .update({
          status: "retry_wait",
          next_attempt_at: nextAttemptAt,
          error_message: err.message,
          lease_owner: null,
          lease_until: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", targetId)
        .eq("company_id", companyId)
        .eq("lease_owner", workerId);

      await reconcileMasterPostStatus(postId, companyId);
      return {
        claimed: true,
        outcome: {
          targetId,
          postId,
          platform,
          status: "retry_wait",
          error: err.message,
        },
      };
    } else {
      // Terminal ou tentativas esgotadas
      const errMsg = isTerminal
        ? err.message
        : `Tentativas esgotadas (${currentAttempts}/3): ${err?.message || "Erro desconhecido"}`;

      await (supabaseAdmin as any)
        .from("content_post_targets")
        .update({
          status: "failed_terminal",
          error_message: errMsg,
          lease_owner: null,
          lease_until: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", targetId)
        .eq("company_id", companyId)
        .eq("lease_owner", workerId);

      await reconcileMasterPostStatus(postId, companyId);
      return {
        claimed: true,
        outcome: {
          targetId,
          postId,
          platform,
          status: "failed_terminal",
          error: errMsg,
        },
      };
    }
  }
}

/**
 * Processa um lote de targets pendentes usando leases atômicos.
 * Suporta isolamento estrito de tenant (companyIdFilter) e post (postIdFilter).
 */
export async function processContentTargetsBatch(
  workerId: string,
  maxItems = 5,
  companyIdFilter?: string | null,
  postIdFilter?: string | null
): Promise<{ processedCount: number; results: ProcessedTargetOutcome[] }> {
  const results: ProcessedTargetOutcome[] = [];

  for (let i = 0; i < maxItems; i++) {
    const step = await claimAndProcessTarget(workerId, companyIdFilter, postIdFilter);
    if (!step.claimed) {
      break; // Não há mais itens prontos para claim
    }
    if (step.outcome) {
      results.push(step.outcome);
    }
  }

  return {
    processedCount: results.length,
    results,
  };
}
