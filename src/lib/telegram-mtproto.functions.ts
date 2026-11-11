// src/lib/telegram-mtproto.functions.ts
// Server Functions para el flujo QR MTProto y Gestión de Canales de Telegram en Capiversa CRM

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveCompanyIdCached } from "./company-cache";
import QRCode from "qrcode";
import type {
  TelegramChannelInfo,
  TelegramConnectedAccount,
  TelegramQrSessionStatus,
} from "./telegram/contracts";

/**
 * 1. Inicia sesión QR MTProto y genera el Data URL para visualización en cliente
 */
export const startTelegramQrSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const companyId = await resolveCompanyIdCached(supabase, userId);

    const { requireCapacidade } = await import("./plugin-gate.server");
    await requireCapacidade(supabase, companyId, "telegram");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Crear un registro pendiente en telegram_connections
    let connectionId = crypto.randomUUID();
    const { data: existingPending } = await (supabaseAdmin as any)
      .from("telegram_connections")
      .select("id")
      .eq("company_id", companyId)
      .eq("transport", "mtproto_account")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingPending?.id) {
      connectionId = existingPending.id;
    } else {
      const { data: created, error: createErr } = await (supabaseAdmin as any)
        .from("telegram_connections")
        .insert({
          id: connectionId,
          company_id: companyId,
          transport: "mtproto_account",
          status: "pending",
          rights: { stage: "qr_handshake" },
        })
        .select("id")
        .maybeSingle();

      if (created?.id) connectionId = created.id;
      else if (createErr) {
        console.warn("[startTelegramQrSession] Error insertando telegram_connections:", createErr);
      }
    }

    const { startQrAuth } = await import("./telegram/mtproto-client.server");
    const result = await startQrAuth(companyId, connectionId);

    // Generar imagen QR en base64
    let qrDataUrl = "";
    try {
      qrDataUrl = await QRCode.toDataURL(result.qrLink, {
        margin: 2,
        width: 280,
        color: {
          dark: "#0f172a",
          light: "#ffffff",
        },
      });
    } catch (qrErr) {
      console.warn("[startTelegramQrSession] Fallo generando QR DataURL:", qrErr);
    }

    return {
      sessionId: result.sessionId,
      connectionId,
      qrLink: result.qrLink,
      qrDataUrl,
      expiresAt: result.expiresAt,
      isSimulation: result.isSimulation,
    };
  });

/**
 * 2. Consulta estado de la sesión QR e indexa la cuenta al autorizar
 */
export const checkTelegramQrStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: { sessionId: string; connectionId: string }) => d,
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const companyId = await resolveCompanyIdCached(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { checkQrAuthStatus } = await import("./telegram/mtproto-client.server");
    const result = await checkQrAuthStatus(companyId, data.sessionId);

    if (result.status === "authorized" && result.actorId) {
      // Actualizar conexión en base de datos
      try {
        await (supabaseAdmin as any)
          .from("telegram_connections")
          .update({
            telegram_actor_id: String(result.actorId),
            username: result.username ?? null,
            display_name: result.displayName ?? "Conta Telegram MTProto",
            status: "active",
            rights: {
              can_post: true,
              authorized_at: new Date().toISOString(),
            },
            updated_at: new Date().toISOString(),
          })
          .eq("id", data.connectionId)
          .eq("company_id", companyId);
      } catch (dbErr) {
        console.warn("[checkTelegramQrStatus] Error actualizando telegram_connections:", dbErr);
      }
    }

    return result;
  });

/**
 * 3. Envío seguro de contraseña 2FA (Verificación en dos pasos)
 */
export const submitTelegram2faPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: { sessionId: string; connectionId: string; password: string }) => d,
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const companyId = await resolveCompanyIdCached(supabase, userId);

    const { submit2FaPassword } = await import("./telegram/mtproto-client.server");
    const result = await submit2FaPassword(companyId, data.sessionId, data.password);

    if (result.status === "authorized") {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await (supabaseAdmin as any)
        .from("telegram_connections")
        .update({
          status: "active",
          updated_at: new Date().toISOString(),
        })
        .eq("id", data.connectionId)
        .eq("company_id", companyId);
    }

    return result;
  });

/**
 * 4. Lista los canales administrables por la cuenta MTProto conectada
 */
export const listTelegramAdminChannels = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { connectionId: string }) => d)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const companyId = await resolveCompanyIdCached(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Obtener canales de Telegram a través del MTProto client
    const { fetchAdminChannels } = await import("./telegram/mtproto-client.server");
    const channels = await fetchAdminChannels(companyId, data.connectionId);

    // Cruzar con los canales ya guardados en la base de datos
    let savedMap = new Map<string, { id: string; social_account_id: string | null }>();
    try {
      const { data: dbChannels } = await (supabaseAdmin as any)
        .from("telegram_channels")
        .select("id, telegram_channel_id, social_account_id")
        .eq("company_id", companyId);

      if (dbChannels) {
        for (const row of dbChannels) {
          savedMap.set(row.telegram_channel_id, {
            id: row.id,
            social_account_id: row.social_account_id,
          });
        }
      }
    } catch {
      /* tabla aún no aplicada en staging */
    }

    const annotatedChannels: TelegramChannelInfo[] = channels.map((c) => {
      const saved = savedMap.get(c.telegramChannelId);
      return {
        ...c,
        isLinked: Boolean(saved),
        socialAccountId: saved?.social_account_id ?? null,
      };
    });

    return { channels: annotatedChannels };
  });

/**
 * 5. Vincula los canales seleccionados a telegram_channels y meta_social_accounts
 */
export const linkTelegramChannels = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      connectionId: string;
      channels: Array<{
        telegramChannelId: string;
        title: string;
        username: string | null;
        visibility: "public" | "private";
        discussionChatId?: string | null;
        memberCount: number;
      }>;
    }) => d,
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const companyId = await resolveCompanyIdCached(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let linkedCount = 0;

    for (const ch of data.channels) {
      try {
        // 1. Upsert en meta_social_accounts para visibilidad en el módulo de contenido
        const { data: socialAccount, error: socErr } = await (supabaseAdmin as any)
          .from("meta_social_accounts")
          .upsert(
            {
              company_id: companyId,
              network: "telegram",
              provider: "telegram",
              external_id: ch.telegramChannelId,
              page_id: ch.telegramChannelId,
              username: ch.username,
              display_name: ch.title,
              status: "active",
              capabilities: {
                can_post: true,
                is_channel: true,
                visibility: ch.visibility,
                member_count: ch.memberCount,
              },
            },
            { onConflict: "company_id,network,external_id" },
          )
          .select("id")
          .maybeSingle();

        const socialAccountId = socialAccount?.id ?? null;

        // 2. Upsert en telegram_channels
        const { data: telChannel, error: chErr } = await (supabaseAdmin as any)
          .from("telegram_channels")
          .upsert(
            {
              company_id: companyId,
              telegram_channel_id: ch.telegramChannelId,
              social_account_id: socialAccountId,
              username: ch.username,
              title: ch.title,
              visibility: ch.visibility,
              discussion_chat_id: ch.discussionChatId ?? null,
              member_count: ch.memberCount,
              member_count_observed_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
            { onConflict: "company_id,telegram_channel_id" },
          )
          .select("id")
          .maybeSingle();

        // 3. Upsert en telegram_channel_routes
        if (telChannel?.id) {
          await (supabaseAdmin as any).from("telegram_channel_routes").upsert(
            {
              company_id: companyId,
              channel_id: telChannel.id,
              connection_id: data.connectionId,
              can_post: true,
              can_edit: true,
              can_delete: true,
              can_manage_discussion: Boolean(ch.discussionChatId),
              preferred: true,
              rights_checked_at: new Date().toISOString(),
            },
            { onConflict: "channel_id,connection_id" },
          );
        }

        linkedCount++;
      } catch (err) {
        console.warn(`[linkTelegramChannels] Error vinculando canal ${ch.telegramChannelId}:`, err);
      }
    }

    return { success: true, linkedCount };
  });

/**
 * 6. Lista las cuentas MTProto conectadas de la empresa
 */
export const listConnectedTelegramAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const companyId = await resolveCompanyIdCached(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    try {
      const { data: rows } = await (supabaseAdmin as any)
        .from("telegram_connections")
        .select("id, company_id, transport, telegram_actor_id, display_name, username, status, created_at")
        .eq("company_id", companyId)
        .eq("transport", "mtproto_account")
        .order("created_at", { ascending: false });

      if (!rows) return { accounts: [] };

      // Contar canales vinculados
      const { data: routes } = await (supabaseAdmin as any)
        .from("telegram_channel_routes")
        .select("connection_id")
        .eq("company_id", companyId);

      const routeCounts = new Map<string, number>();
      if (routes) {
        for (const r of routes) {
          routeCounts.set(r.connection_id, (routeCounts.get(r.connection_id) || 0) + 1);
        }
      }

      const accounts: TelegramConnectedAccount[] = rows.map((r: any) => ({
        id: r.id,
        companyId: r.company_id,
        transport: r.transport,
        telegramActorId: r.telegram_actor_id,
        displayName: r.display_name,
        username: r.username,
        status: r.status,
        createdAt: r.created_at,
        channelCount: routeCounts.get(r.id) || 0,
      }));

      return { accounts };
    } catch {
      return { accounts: [] };
    }
  });

/**
 * 7. Desconecta una cuenta QR MTProto y limpia sus rutas
 */
export const disconnectTelegramQrAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { connectionId: string }) => d)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const companyId = await resolveCompanyIdCached(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { logoutGatewaySession } = await import("./telegram/mtproto-client.server");
    await logoutGatewaySession(companyId, data.connectionId);

    try {
      await (supabaseAdmin as any)
        .from("telegram_connections")
        .update({
          status: "disconnected",
          updated_at: new Date().toISOString(),
        })
        .eq("id", data.connectionId)
        .eq("company_id", companyId);

      // Eliminar rutas de canales asociadas
      await (supabaseAdmin as any)
        .from("telegram_channel_routes")
        .delete()
        .eq("connection_id", data.connectionId)
        .eq("company_id", companyId);
    } catch (dbErr) {
      console.warn("[disconnectTelegramQrAccount] Error actualizando DB:", dbErr);
    }

    return { success: true };
  });
