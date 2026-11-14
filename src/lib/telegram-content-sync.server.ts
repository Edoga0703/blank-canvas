// src/lib/telegram-content-sync.server.ts
// Sincronización e importación histórica duradera de publicaciones de canales Telegram (Fase 3)

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { fetchChannelBackfill } from "@/lib/telegram/mtproto-client.server";
import { formatScopedPostId, extractTelegramMessageId } from "@/lib/telegram/contracts";

export interface SyncTelegramOptions {
  full?: boolean;
  limit?: number;
}

export interface SyncTelegramResult {
  ok: boolean;
  importedCount: number;
  hasMore: boolean;
  message?: string;
}

/**
 * Sincroniza publicaciones de un canal de Telegram y actualiza el estado duradero de backfill
 */
export async function syncTelegramChannelContent(
  companyId: string,
  socialAccountId: string,
  options: SyncTelegramOptions = {},
): Promise<SyncTelegramResult> {
  // 1. Obtener datos de la cuenta social
  const { data: account, error: accErr } = await (supabaseAdmin as any)
    .from("meta_social_accounts")
    .select("id, company_id, network, external_id, page_id, username, display_name")
    .eq("id", socialAccountId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (accErr || !account) {
    throw new Error("Conta de canal do Telegram não encontrada.");
  }

  const telegramChannelId = account.page_id || account.external_id;
  if (!telegramChannelId) {
    throw new Error("Identificador do canal do Telegram ausente na conta vinculada.");
  }

  // 2. Resolver el registro del canal en telegram_channels
  const { data: channel } = await (supabaseAdmin as any)
    .from("telegram_channels")
    .select("id, telegram_channel_id, title")
    .eq("company_id", companyId)
    .eq("telegram_channel_id", telegramChannelId)
    .maybeSingle();

  const channelDbId = channel?.id ?? null;

  // 3. Resolver la conexión MTProto autorizada
  let connectionId: string | null = null;
  if (channelDbId) {
    const { data: route } = await (supabaseAdmin as any)
      .from("telegram_channel_routes")
      .select("connection_id")
      .eq("channel_id", channelDbId)
      .eq("company_id", companyId)
      .eq("can_post", true)
      .order("preferred", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (route?.connection_id) connectionId = route.connection_id;
  }

  if (!connectionId) {
    const { data: anyConn } = await (supabaseAdmin as any)
      .from("telegram_connections")
      .select("id")
      .eq("company_id", companyId)
      .eq("transport", "mtproto_account")
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (anyConn?.id) connectionId = anyConn.id;
  }

  if (!connectionId) {
    throw new Error("Nenhuma conta Telegram MTProto ativa encontrada para sincronizar o canal.");
  }

  // 4. Leer cursor duradero en social_backfill_state
  let beforeMessageId: string | undefined = undefined;
  let previousImported = 0;

  try {
    const { data: backfillState } = await (supabaseAdmin as any)
      .from("social_backfill_state")
      .select("cursor, imported_count, status")
      .eq("company_id", companyId)
      .eq("platform", "telegram")
      .eq("account_id", socialAccountId)
      .eq("resource", "posts")
      .maybeSingle();

    if (backfillState && !options.full) {
      beforeMessageId = backfillState.cursor?.beforeMessageId;
      previousImported = Number(backfillState.imported_count || 0);
    }
  } catch {
    /* fallback si la tabla no tiene constraint todavía */
  }

  // 5. Consultar publicaciones a la pasarela MTProto con tratamiento estricto de errores (P0-4)
  let backfillResult: any;
  try {
    backfillResult = await fetchChannelBackfill({
      companyId,
      connectionId,
      channelId: telegramChannelId,
      limit: options.limit || 30,
      beforeMessageId,
    });
  } catch (err: any) {
    console.error("[syncTelegramChannelContent] Falha ao consultar pasarela MTProto:", err?.message || err);
    // Registrar erro no social_backfill_state SEM apagar cursor nem marcar complete (P0-4)
    await (supabaseAdmin as any).from("social_backfill_state").upsert(
      {
        company_id: companyId,
        platform: "telegram",
        account_id: socialAccountId,
        resource: "posts",
        status: "failed",
        last_error: String(err?.message || err).slice(0, 500),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "company_id,platform,account_id,resource" },
    );
    throw err;
  }

  if (backfillResult.isSimulation) {
    return {
      ok: false,
      importedCount: 0,
      hasMore: false,
      message: "A pasarela MTProto está em simulação. Sincronização cancelada para proteger dados de produção.",
    };
  }

  const posts = backfillResult.posts || [];
  let insertedCount = 0;

  // 6. Persistir publicaciones en meta_content_posts y social_post_identity con scoping por canal (P1-3)
  for (const p of posts) {
    try {
      const rawPostId = String(p.id);
      // P1-3: Identidad compuesta anti-colisión entre canales de la misma empresa
      const scopedPostId = formatScopedPostId(telegramChannelId, rawPostId);
      const postFormat = p.mediaType === "photo" ? "photo" : p.mediaType === "video" ? "video" : "text";

      const { data: insertedPost, error: postErr } = await (supabaseAdmin as any)
        .from("meta_content_posts")
        .upsert(
          {
            company_id: companyId,
            social_account_id: socialAccountId,
            network: "telegram",
            external_post_id: scopedPostId,
            format: postFormat,
            media_type: p.mediaType,
            caption: p.text || null,
            permalink: p.permalink || null,
            published_at: p.date,
            metrics_latest: {
              views: p.views,
              shares: p.forwards,
              replies: p.replies,
            },
            last_synced_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "company_id,network,external_post_id" },
        )
        .select("id")
        .maybeSingle();

      if (postErr) {
        console.error(`[syncTelegramChannelContent] Erro PostgREST salvando post ${scopedPostId}:`, postErr);
        throw new Error(`Falha ao persistir publicação no banco: ${postErr.message}`);
      }

      // Upsert en social_post_identity con scopedPostId
      const { error: idErr } = await (supabaseAdmin as any).from("social_post_identity").upsert(
        {
          company_id: companyId,
          platform: "telegram",
          account_id: socialAccountId,
          external_post_id: scopedPostId,
          origin: "platform",
          meta_content_post_id: insertedPost?.id || null,
          published_at: p.date,
          sync_state: "synced",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "company_id,platform,account_id,external_post_id" },
      );
      if (idErr) {
        console.warn("[syncTelegramChannelContent] Aviso social_post_identity:", idErr);
      }

      // Upsert en telegram_post_items si tenemos channelDbId
      if (channelDbId) {
        try {
          await (supabaseAdmin as any).from("telegram_post_items").upsert(
            {
              company_id: companyId,
              channel_id: channelDbId,
              item_index: 0,
              telegram_message_id: rawPostId,
              published_at: p.date,
            },
            { onConflict: "channel_id,telegram_message_id" },
          );
        } catch {
          /* best-effort */
        }
      }

      insertedCount++;
    } catch (postErr) {
      console.warn(`[syncTelegramChannelContent] Erro salvando post ${p.id}:`, postErr);
      throw postErr; // P1-4: no avanzar cursor más allá del post que falló
    }
  }

  // 7. Actualizar cursor duradero en social_backfill_state
  try {
    const totalCount = previousImported + insertedCount;
    const nextStatus = backfillResult.hasMore ? "partial" : "complete";

    const { error: stateErr } = await (supabaseAdmin as any).from("social_backfill_state").upsert(
      {
        company_id: companyId,
        platform: "telegram",
        account_id: socialAccountId,
        resource: "posts",
        cursor: {
          beforeMessageId: backfillResult.nextCursor || (posts.length ? extractTelegramMessageId(posts[posts.length - 1].id) : null),
        },
        status: nextStatus,
        imported_count: totalCount,
        last_error: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "company_id,platform,account_id,resource" },
    );
    if (stateErr) {
      console.warn("[syncTelegramChannelContent] Aviso ao atualizar social_backfill_state:", stateErr);
    }
  } catch (stateErr) {
    console.warn("[syncTelegramChannelContent] Aviso ao atualizar social_backfill_state:", stateErr);
  }

  // 8. Actualizar last_synced_at en meta_social_accounts
  await (supabaseAdmin as any)
    .from("meta_social_accounts")
    .update({
      last_synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", socialAccountId)
    .eq("company_id", companyId);

  return {
    ok: true,
    importedCount: insertedCount,
    hasMore: backfillResult.hasMore,
    message: `${insertedCount} publicações sincronizadas com sucesso do canal Telegram.`,
  };
}
