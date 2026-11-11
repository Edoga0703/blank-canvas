import { supabaseAdmin } from "@/integrations/supabase/client.server";

export interface TargetExecutionItem {
  id?: string;
  platform: string;
  socialAccountId?: string | null;
  customTitle?: string | null;
  customCaption?: string | null;
  platformSettings?: any;
}

export interface PublishPostParams {
  postId: string;
  companyId: string;
  mediaUrl: string | null;
  mediaType: string;
  baseCaption: string | null;
  targets: TargetExecutionItem[];
}

export interface TargetExecutionResult {
  platform: string;
  status: "published" | "failed";
  error?: string;
  url?: string;
}

/**
 * Executa a publicação de um conjunto de alvos (targets) para uma postagem mestre.
 * Utilizado tanto no disparo imediato quanto no worker de agendamentos periódicos.
 */
export async function executePostTargetsPublishing(
  params: PublishPostParams
): Promise<TargetExecutionResult[]> {
  const { postId, companyId, mediaUrl, mediaType, baseCaption, targets } = params;
  const targetResults: TargetExecutionResult[] = [];

  for (const target of targets) {
    let status: "published" | "failed" = "failed";
    let publishedUrl: string | undefined = undefined;
    let errorMessage: string | undefined = undefined;

    try {
      const caption = target.customCaption?.trim() || baseCaption || "";

      if (target.platform === "instagram" && target.socialAccountId) {
        const { data: acc } = await (supabaseAdmin as any)
          .from("meta_social_accounts")
          .select("instance_id,ig_user_id")
          .eq("id", target.socialAccountId)
          .eq("company_id", companyId)
          .maybeSingle();

        if (!acc?.instance_id || !acc?.ig_user_id) {
          throw new Error("Conta Instagram não vinculada ou sem permissão.");
        }

        const { data: inst } = await (supabaseAdmin as any)
          .from("whatsapp_instances")
          .select("instance_token")
          .eq("id", acc.instance_id)
          .eq("company_id", companyId)
          .maybeSingle();

        if (!inst?.instance_token) {
          throw new Error("Token de acesso da página/Instagram não encontrado.");
        }

        const { metaPublishInstagramVideo, metaPublishInstagramPhoto } = await import("./meta-publish.server");
        if (mediaType === "video" && mediaUrl) {
          const res = await metaPublishInstagramVideo(inst.instance_token, acc.ig_user_id, mediaUrl, caption);
          status = "published";
          publishedUrl = res?.id;
        } else if (mediaUrl) {
          const res = await metaPublishInstagramPhoto(inst.instance_token, acc.ig_user_id, mediaUrl, caption);
          status = "published";
          publishedUrl = res?.id;
        } else {
          throw new Error("Instagram requer mídia válida (imagem ou vídeo) para publicação.");
        }
      } else if (target.platform === "facebook" && target.socialAccountId) {
        const { data: acc } = await (supabaseAdmin as any)
          .from("meta_social_accounts")
          .select("instance_id,page_id")
          .eq("id", target.socialAccountId)
          .eq("company_id", companyId)
          .maybeSingle();

        if (!acc?.instance_id || !acc?.page_id) {
          throw new Error("Página Facebook não vinculada ou sem permissão.");
        }

        const { data: inst } = await (supabaseAdmin as any)
          .from("whatsapp_instances")
          .select("instance_token")
          .eq("id", acc.instance_id)
          .eq("company_id", companyId)
          .maybeSingle();

        if (!inst?.instance_token) {
          throw new Error("Token de acesso da página Facebook não encontrado.");
        }

        const { metaPublishFacebookPost } = await import("./meta-publish.server");
        const res = await metaPublishFacebookPost(inst.instance_token, acc.page_id, caption, mediaUrl || undefined);
        status = "published";
        publishedUrl = res?.id;
      } else {
        throw new Error(
          `Publicação direta em ${target.platform} em fase de homologação OAuth; conecte suas credenciais em Configurações.`
        );
      }
    } catch (e: any) {
      status = "failed";
      errorMessage = e?.message || "Erro desconhecido na publicação";
      console.error(`[executePostTargetsPublishing] Falha em ${target.platform} (post ${postId}):`, errorMessage);
    }

    targetResults.push({ platform: target.platform, status, error: errorMessage, url: publishedUrl });

    // Atualiza estado do target individual no banco
    const targetUpdateFilter = (supabaseAdmin as any)
      .from("content_post_targets")
      .update({
        status,
        external_post_id: publishedUrl || null,
        error_message: errorMessage || null,
        published_at: status === "published" ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("post_id", postId)
      .eq("platform", target.platform);

    if (target.socialAccountId) {
      await targetUpdateFilter.eq("social_account_id", target.socialAccountId);
    } else {
      await targetUpdateFilter;
    }
  }

  // Atualiza estado agregado mestre
  const hasPublished = targetResults.some((r) => r.status === "published");
  const hasFailed = targetResults.some((r) => r.status === "failed");
  const aggregateStatus =
    hasPublished && !hasFailed ? "published" : hasPublished && hasFailed ? "partial" : "failed";

  await (supabaseAdmin as any)
    .from("content_posts")
    .update({
      status: aggregateStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("id", postId)
    .eq("company_id", companyId);

  return targetResults;
}
