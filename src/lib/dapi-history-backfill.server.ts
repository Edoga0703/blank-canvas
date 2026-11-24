import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  dapiGetCloudAccessToken,
  dapiGetCloudConnection,
  dapiSearchMessages,
  dapiSetWebhookConfig,
  triggerMetaCoexistenceSync,
  type MetaCoexSyncResultItem,
  type MetaCoexSyncType,
} from "@/lib/dapi.server";
import { buildWebhookUrl } from "@/lib/whatsapp-helpers";

function cleanDigits(val: unknown): string {
  const s = String(val ?? "").trim();
  if (!s || s.endsWith("@g.us") || s.endsWith("@lid")) return "";
  return s.split("@")[0].split(":")[0].replace(/\D/g, "");
}

export async function hydrateOfficialInstanceMetadata(instanceRow: {
  id: string;
  company_id: string;
  instance_name: string;
  waba_id?: string | null;
  phone_number_id?: string | null;
  external_connection_id?: string | null;
  instance_token?: string | null;
  numero?: string | null;
  webhook_token?: string | null;
}) {
  const [connInfo, tokInfo] = await Promise.all([
    dapiGetCloudConnection(instanceRow.external_connection_id || instanceRow.instance_name),
    dapiGetCloudAccessToken(instanceRow.external_connection_id || instanceRow.instance_name),
  ]);

  const connectionId = connInfo?.connectionId || instanceRow.external_connection_id || null;
  const wabaId = tokInfo?.wabaId || connInfo?.wabaId || instanceRow.waba_id || null;
  const phoneNumberId = tokInfo?.phoneNumberId || connInfo?.phoneNumberId || instanceRow.phone_number_id || null;
  const accessToken = tokInfo?.accessToken || instanceRow.instance_token || null;
  const displayPhone = connInfo?.displayPhoneNumber ? cleanDigits(connInfo.displayPhoneNumber) : null;
  const coexistenceEnabled = Boolean(connInfo?.coexistenceEnabled);

  const patch: Record<string, any> = {};
  if (connectionId && connectionId !== instanceRow.external_connection_id) patch.external_connection_id = connectionId;
  if (wabaId && wabaId !== instanceRow.waba_id) patch.waba_id = wabaId;
  if (phoneNumberId && phoneNumberId !== instanceRow.phone_number_id) patch.phone_number_id = phoneNumberId;
  if (accessToken && accessToken !== instanceRow.instance_token) patch.instance_token = accessToken;
  if (displayPhone && displayPhone !== instanceRow.numero) patch.numero = displayPhone;

  if (Object.keys(patch).length > 0) {
    patch.updated_at = new Date().toISOString();
    try {
      await (supabaseAdmin as any)
        .from("whatsapp_instances")
        .update(patch)
        .eq("id", instanceRow.id)
        .eq("company_id", instanceRow.company_id);
    } catch (err: any) {
      console.warn("[hydrateOfficialInstanceMetadata] Error actualizando whatsapp_instances:", err?.message);
    }
  }

  return {
    connectionId,
    wabaId,
    phoneNumberId,
    accessToken,
    coexistenceEnabled,
    displayPhoneNumber: displayPhone || instanceRow.numero || null,
  };
}

export async function importDapiStoredMessagesToCrm(params: {
  companyId: string;
  userId?: string | null;
  instance: {
    id: string;
    instance_name: string;
    external_connection_id?: string | null;
    numero?: string | null;
  };
  phoneFilter?: string | null;
  maxPages?: number;
  daysBack?: number;
}): Promise<{ found: number; imported: number; skipped: number }> {
  const { ingestMessagingEvent } = await import("@/lib/messaging/ingest.server");
  const maxPages = Math.min(20, Math.max(1, params.maxPages ?? 5));
  const daysBack = Math.min(185, Math.max(1, params.daysBack ?? 180));
  const dateFrom = new Date(Date.now() - daysBack * 86_400_000).toISOString();

  const sessionIds = Array.from(
    new Set([params.instance.instance_name, params.instance.external_connection_id].filter((v): v is string => !!v)),
  );
  if (sessionIds.length === 0) return { found: 0, imported: 0, skipped: 0 };

  const allowedSessionSet = new Set(sessionIds);
  const ownDigits = cleanDigits(params.instance.numero);
  const cleanFilterPhone = params.phoneFilter ? cleanDigits(params.phoneFilter) : undefined;

  let found = 0;
  let imported = 0;
  let skipped = 0;

  for (let page = 1; page <= maxPages; page++) {
    let searchRes: { messages: any[]; total: number; page: number; totalPages: number };
    try {
      searchRes = await dapiSearchMessages({
        sessionIds,
        phone: cleanFilterPhone,
        limit: 100,
        page,
        sort_field: "timestamp",
        sort_order: "asc",
        dateFrom,
      });
    } catch (err: any) {
      console.warn("[importDapiStoredMessagesToCrm] dapiSearchMessages error:", err?.message);
      break;
    }

    const batch = searchRes.messages || [];
    if (batch.length === 0) break;

    for (const m of batch) {
      if (m.sessionId && !allowedSessionSet.has(String(m.sessionId))) {
        continue;
      }

      const fromMe = Boolean(m.from_me ?? m.fromMe);
      const chatJid = String(m.chatId || m.contact?.jid || "");
      if (chatJid.endsWith("@g.us")) continue;

      const candidatePhone =
        (fromMe
          ? cleanDigits(m.contact?.phone) || cleanDigits(chatJid) || cleanFilterPhone || ""
          : cleanDigits(m.from_phone) || cleanDigits(m.contact?.phone) || cleanDigits(chatJid) || cleanFilterPhone || "");

      if (!candidatePhone || (ownDigits && candidatePhone === ownDigits)) {
        continue;
      }

      found++;
      const msgId = String(m.message_id || m.id || `dapi_hist_${Date.now()}_${found}`);
      const contactName =
        String(m.contact?.full_name || m.contact?.name || m.contact?.push_name || "").trim() || null;
      const msgType = String(m.type || "text").toLowerCase();
      const rawText = String(m.content || m.data?.text || m.data?.body || m.data?.caption || "").trim();
      const mediaUrl = m.s3_url || m.data?.media_url || null;
      const text = rawText || (mediaUrl ? `[${msgType.toUpperCase()}]` : "");

      try {
        const res = await ingestMessagingEvent({
          provider: "dapi",
          externalConnectionId: params.instance.instance_name,
          externalEventId: `dapi_backfill_${msgId}`,
          raw: {
            event: "history.message.upsert",
            sessionId: params.instance.instance_name,
            isHistorySync: true,
            timestamp: m.timestamp,
            data: {
              id: msgId,
              type: msgType,
              text,
              message: text,
              fromMe,
              from: fromMe ? ownDigits || params.instance.instance_name : candidatePhone,
              to: fromMe ? candidatePhone : ownDigits || params.instance.instance_name,
              from_name: !fromMe ? contactName : undefined,
              to_name: fromMe ? contactName : undefined,
              timestamp: m.timestamp,
              media_url: mediaUrl,
              mimetype: m.data?.mimetype || m.data?.media_data?.mimetype || null,
              filename: m.data?.filename || m.data?.media_data?.filename || null,
              isHistorySync: true,
            },
          },
        });
        if (res?.processed > 0) imported++;
        else skipped++;
      } catch {
        skipped++;
      }
    }

    if (page >= searchRes.totalPages || batch.length < 100) break;
  }

  return { found, imported, skipped };
}

export async function runOfficialCoexistenceSync(params: {
  companyId: string;
  userId?: string | null;
  instanceName?: string | null;
  syncTypes?: MetaCoexSyncType[];
}): Promise<{
  ok: boolean;
  instanceName: string;
  numero: string | null;
  wabaId: string | null;
  phoneNumberId: string | null;
  coexistenceEnabled: boolean;
  metaResults: MetaCoexSyncResultItem[];
  dapiStoredFound: number;
  dapiStoredImported: number;
  message: string;
}> {
  let q = (supabaseAdmin as any)
    .from("whatsapp_instances")
    .select("id, company_id, user_id, instance_name, provider, status, numero, waba_id, phone_number_id, external_connection_id, instance_token, webhook_token")
    .eq("company_id", params.companyId)
    .in("provider", ["dapi_official", "official"]);

  if (params.instanceName) {
    q = q.eq("instance_name", params.instanceName);
  } else {
    q = q.order("updated_at", { ascending: false });
  }

  const { data: rows, error } = await q.limit(1);
  if (error) throw new Error(error.message);
  const inst = rows?.[0];
  if (!inst) {
    throw new Error("Conexión WhatsApp Oficial (D-API) no encontrada en esta cuenta.");
  }

  // 1. Hidratar credenciales completas desde D-API (/connections/cloud-api/{id}/access-token)
  const hydrated = await hydrateOfficialInstanceMetadata(inst);

  // 2. Asegurar webhook configurado con los eventos de historial y coexistencia
  if (inst.webhook_token) {
    const webhookUrl = buildWebhookUrl(inst.webhook_token, "dapi_official");
    await dapiSetWebhookConfig(inst.instance_name, webhookUrl).catch(() => null);
  }

  // 3. Llamar a Meta Graph API POST /{phoneNumberId}/smb_app_data con "history" y "smb_app_state_sync"
  let metaResults: MetaCoexSyncResultItem[] = [];
  if (hydrated.phoneNumberId && hydrated.accessToken) {
    const metaSync = await triggerMetaCoexistenceSync({
      phoneNumberId: hydrated.phoneNumberId,
      accessToken: hydrated.accessToken,
      syncTypes: params.syncTypes || ["history", "smb_app_state_sync"],
    });
    metaResults = metaSync.results;
  } else {
    throw new Error(
      "No se pudo obtener phoneNumberId o accessToken de Meta desde D-API para esta conexión.",
    );
  }

  // 4. Importar también cualquier mensaje retroactivo ya almacenado en D-API
  const backfill = await importDapiStoredMessagesToCrm({
    companyId: params.companyId,
    userId: params.userId ?? inst.user_id ?? null,
    instance: {
      id: inst.id,
      instance_name: inst.instance_name,
      external_connection_id: hydrated.connectionId,
      numero: hydrated.displayPhoneNumber,
    },
    maxPages: 5,
    daysBack: 180,
  });

  const histRes = metaResults.find((r) => r.syncType === "history");
  const contactsRes = metaResults.find((r) => r.syncType === "smb_app_state_sync");
  const allOk = metaResults.some((r) => r.ok);

  let message = "";
  if (histRes?.ok) {
    message =
      "Sincronización de 6 meses solicitada a Meta (/smb_app_data history). Los chats llegarán en los próximos minutos por webhook.";
  } else if (histRes?.error) {
    message = `Meta respondió en history: ${histRes.error}`;
  }
  if (contactsRes && !contactsRes.ok && contactsRes.error) {
    message += ` | Contactos: ${contactsRes.error}`;
  }
  if (backfill.imported > 0) {
    message += ` (${backfill.imported} mensajes ya almacenados en D-API importados al instante).`;
  }

  return {
    ok: allOk || backfill.imported > 0,
    instanceName: inst.instance_name,
    numero: hydrated.displayPhoneNumber,
    wabaId: hydrated.wabaId,
    phoneNumberId: hydrated.phoneNumberId,
    coexistenceEnabled: hydrated.coexistenceEnabled,
    metaResults,
    dapiStoredFound: backfill.found,
    dapiStoredImported: backfill.imported,
    message: message.trim() || "Verificación de Coexistencia completada.",
  };
}
