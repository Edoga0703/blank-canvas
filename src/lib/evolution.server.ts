// Dispatcher WhatsApp: mantém a interface histórica do wrapper Evolution
// (evoXxx) mas roteia dinamicamente entre Evolution API e Uazapi, com base
// no campo `provider` da instância no banco. Nenhum call-site precisou mudar.
//
// - Se `whatsapp_instances.provider = 'evolution'` → chama evolution-raw.server.ts
// - Se `whatsapp_instances.provider = 'uazapi'`    → chama uazapi.server.ts
//   usando o `instance_token` armazenado.
//
// Para `evoCreateInstance` (que roda antes de existir linha no banco) aceitamos
// um 3º argumento opcional `providerOverride`; o caller (connectWhatsapp)
// passa o `company.wa_provider`.

import * as evo from "./evolution-raw.server";
import * as uaz from "./uazapi.server";
import * as metaApi from "./meta.server";
import * as tgApi from "./telegram.server";

export { EvolutionApiError, extractQrFromPayload } from "./evolution-raw.server";
export { UazapiApiError } from "./uazapi.server";

type Provider = "evolution" | "uazapi" | "meta" | "telegram";

interface InstanceMeta {
  provider: Provider;
  instanceToken: string | null;
  cachedAt: number;
}

const providerCache = new Map<string, InstanceMeta>();
const PROVIDER_TTL_MS = 30_000;

async function loadInstanceMeta(instanceName: string): Promise<InstanceMeta> {
  const cached = providerCache.get(instanceName);
  if (cached && Date.now() - cached.cachedAt < PROVIDER_TTL_MS) return cached;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await (supabaseAdmin as any)
      .from("whatsapp_instances")
      .select("provider,instance_token")
      .eq("instance_name", instanceName)
      .maybeSingle();
    const rawProvider = String(data?.provider ?? "evolution");
    const normalizedProvider: Provider = rawProvider.startsWith("meta")
      ? "meta"
      : rawProvider === "telegram" ? "telegram"
      : rawProvider === "uazapi" ? "uazapi" : "evolution";
    const meta: InstanceMeta = {
      provider: normalizedProvider,
      instanceToken: (data?.instance_token as string | null) ?? null,
      cachedAt: Date.now(),
    };
    providerCache.set(instanceName, meta);
    return meta;
  } catch {
    return { provider: "evolution", instanceToken: null, cachedAt: Date.now() };
  }
}

/** Chamar após mudanças (create/delete/change-provider) para forçar refresh. */
export function invalidateInstanceMetaCache(instanceName?: string) {
  if (instanceName) providerCache.delete(instanceName);
  else providerCache.clear();
}

async function requireUazToken(instanceName: string): Promise<string> {
  const meta = await loadInstanceMeta(instanceName);
  if (meta.provider !== "uazapi") throw new Error(`Instância ${instanceName} não é Uazapi`);
  if (meta.instanceToken) return meta.instanceToken;
  // AUTO-CURA: linha marcada como Uazapi mas sem token (criação anterior falhou
  // ou a instância foi apagada no servidor). Sem isto o cliente ficava preso em
  // "sem token salvo / QR indisponível" para sempre. Recriamos e persistimos.
  console.warn(`[uazapi] Token ausente para ${instanceName} — recriando instância automaticamente.`);
  const created = await uaz.uazCreateInstance(instanceName);
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await (supabaseAdmin as any)
      .from("whatsapp_instances")
      .update({ provider: "uazapi", provider_type: "uazapi", instance_token: created.token })
      .eq("instance_name", instanceName);
    const { data: row } = await (supabaseAdmin as any)
      .from("whatsapp_instances")
      .select("webhook_token")
      .eq("instance_name", instanceName)
      .maybeSingle();
    if (row?.webhook_token) {
      const { buildWebhookUrl } = await import("./evolution-helpers");
      await uaz.uazSetWebhook(created.token, buildWebhookUrl(row.webhook_token, "uazapi"))
        .catch((e: any) => console.warn("[uazapi] setWebhook após auto-cura:", e?.message));
    }

  } catch (e: any) {
    console.warn("[uazapi] falha ao persistir token na auto-cura:", e?.message);
  }
  providerCache.set(instanceName, { provider: "uazapi", instanceToken: created.token, cachedAt: Date.now() });
  return created.token;
}


async function requireTelegramToken(instanceName: string): Promise<string> {
  const m = await loadInstanceMeta(instanceName);
  if (!m.instanceToken) throw new Error(`Conexão Telegram sem bot token (${instanceName}). Reconecte.`);
  return m.instanceToken;
}

async function requireMetaToken(instanceName: string): Promise<string> {
  const m = await loadInstanceMeta(instanceName);
  if (!m.instanceToken) throw new Error(`Conexão Meta sem Page Access Token (${instanceName}). Reconecte.`);
  return m.instanceToken;
}

// ============================================================
// INSTÂNCIA
// ============================================================

export async function evoCreateInstance(
  instanceName: string,
  webhookUrl?: string,
  providerOverride?: Provider,
): Promise<any> {
  const provider = providerOverride ?? (await loadInstanceMeta(instanceName)).provider;
  if (provider === "uazapi") {
    const created = await uaz.uazCreateInstance(instanceName);
    // Persistir provider + token para as próximas chamadas encontrarem via loadInstanceMeta
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await (supabaseAdmin as any)
        .from("whatsapp_instances")
        .update({ provider: "uazapi", instance_token: created.token })
        .eq("instance_name", instanceName);
    } catch (e: any) {
      console.warn("[evoCreateInstance/uazapi] falha ao persistir token", e?.message);
    }
    providerCache.set(instanceName, {
      provider: "uazapi",
      instanceToken: created.token,
      cachedAt: Date.now(),
    });
    let connect: any = null;
    if (webhookUrl) {
      try { await uaz.uazSetWebhook(created.token, webhookUrl); } catch (e: any) {
        console.warn("[uaz.setWebhook]", e?.message);
      }
    }
    try {
      connect = await uaz.uazConnect(created.token);
    } catch (e: any) {
      console.warn("[uaz.connect after create]", e?.message);
    }
    // Compat com extractQrFromPayload do Evolution:
    return { qrcode: { base64: connect?.base64, code: connect?.code, pairingCode: connect?.paircode }, ...created.raw };
  }
  return evo.evoCreateInstance(instanceName, webhookUrl);
}

export async function evoConnect(instanceName: string, phone?: string | null) {
  const meta = await loadInstanceMeta(instanceName);
  if (meta.provider === "meta" || meta.provider === "telegram") return { base64: null, code: null, pairingCode: null } as any;
  if (meta.provider === "uazapi") {
    const token = await requireUazToken(instanceName);
    const r = await uaz.uazConnect(token, phone ?? undefined);
    return { base64: r.base64, code: r.code, pairingCode: r.paircode };
  }
  return evo.evoConnect(instanceName, phone);
}

export async function evoGetQr(instanceName: string, phone?: string | null) {
  const meta = await loadInstanceMeta(instanceName);
  if (meta.provider === "meta" || meta.provider === "telegram") return { base64: null, pairingCode: null } as any;
  if (meta.provider === "uazapi") {
    const token = await requireUazToken(instanceName);
    if (phone) {
      // Sempre começar uma sessão limpa: se houver um QR (ou um código antigo) pendente,
      // o WhatsApp recusa o código novo com "Não foi possível conectar o dispositivo".
      try { await uaz.uazLogout(token); } catch (e: any) { console.warn("[uaz.logout before paircode]", e?.message); }
      await new Promise((res) => setTimeout(res, 1500));
      let r = await uaz.uazConnect(token, phone);
      if (!r.paircode) {
        await new Promise((res) => setTimeout(res, 1500));
        r = await uaz.uazConnect(token, phone);
      }
      return { qrBase64: null, code: null, pairingCode: r.paircode ?? null };
    }
    const r: any = await uaz.uazGetQr(token);
    return { ...r, pairingCode: r?.pairingCode ?? null };
  }
  const r = await evo.evoGetQr(instanceName);
  if (phone) return evo.evoConnect(instanceName, phone).then(extractQrFromPayloadLocal);
  return r;
}

async function extractQrFromPayloadLocal(payload: any) {
  const { extractQrFromPayload } = await import("./evolution-raw.server");
  return extractQrFromPayload(payload);
}

export async function evoState(instanceName: string) {
  const meta = await loadInstanceMeta(instanceName);
  if (meta.provider === "meta" || meta.provider === "telegram") return { instance: { state: "open" } } as any;
  if (meta.provider === "uazapi") {
    const token = await requireUazToken(instanceName);
    return uaz.uazState(token);
  }
  return evo.evoState(instanceName);
}

export async function evoFetchInstance(instanceName: string) {
  const meta = await loadInstanceMeta(instanceName);
  if (meta.provider === "uazapi") {
    const token = await requireUazToken(instanceName);
    return uaz.uazFetchInstance(token);
  }
  return evo.evoFetchInstance(instanceName);
}

export async function evoSetWebhook(instanceName: string, webhookUrl: string) {
  const meta = await loadInstanceMeta(instanceName);
  if (meta.provider === "meta" || meta.provider === "telegram") return { ok: true } as any;
  if (meta.provider === "uazapi") {
    const token = await requireUazToken(instanceName);
    return uaz.uazSetWebhook(token, webhookUrl);
  }
  return evo.evoSetWebhook(instanceName, webhookUrl);
}

export async function evoLogout(instanceName: string) {
  const meta = await loadInstanceMeta(instanceName);
  if (meta.provider === "meta" || meta.provider === "telegram") return { ok: true } as any;
  if (meta.provider === "uazapi") {
    const token = await requireUazToken(instanceName);
    return uaz.uazLogout(token);
  }
  return evo.evoLogout(instanceName);
}

export async function evoRestart(instanceName: string) {
  const meta = await loadInstanceMeta(instanceName);
  if (meta.provider === "meta" || meta.provider === "telegram") return { ok: true } as any;
  if (meta.provider === "uazapi") {
    const token = await requireUazToken(instanceName);
    return uaz.uazRestart(token);
  }
  return evo.evoRestart(instanceName);
}

export async function evoDelete(instanceName: string) {
  const meta = await loadInstanceMeta(instanceName);
  if (meta.provider === "meta" || meta.provider === "telegram") return { ok: true } as any;
  if (meta.provider === "uazapi") {
    const token = await requireUazToken(instanceName);
    try { return await uaz.uazDelete(token); } finally { providerCache.delete(instanceName); }
  }
  return evo.evoDelete(instanceName);
}

export async function evoFetchNumberFromInstance(instanceName: string): Promise<string | null> {
  const meta = await loadInstanceMeta(instanceName);
  if (meta.provider === "uazapi") {
    const token = await requireUazToken(instanceName);
    return uaz.uazFetchNumberFromInstance(token);
  }
  return evo.evoFetchNumberFromInstance(instanceName);
}

// ============================================================
// MENSAGENS
// ============================================================

export async function evoSendText(
  instanceName: string,
  number: string,
  text: string,
  opts?: { quoted?: { key: { id: string; remoteJid: string; fromMe: boolean }; message: any } },
) {
  const meta = await loadInstanceMeta(instanceName);
  if (meta.provider === "telegram") {
    return tgApi.tgSendText(await requireTelegramToken(instanceName), number, text);
  }
  if (meta.provider === "meta") {
    return metaApi.metaSendText(await requireMetaToken(instanceName), number, text);
  }
  if (meta.provider === "uazapi") {
    const token = await requireUazToken(instanceName);
    return uaz.uazSendText(token, number, text, opts);
  }
  return evo.evoSendText(instanceName, number, text, opts);
}

export async function evoSendReaction(
  instanceName: string,
  remoteJid: string,
  messageId: string,
  fromMe: boolean,
  reaction: string,
) {
  const meta = await loadInstanceMeta(instanceName);
  if (meta.provider === "uazapi") {
    const token = await requireUazToken(instanceName);
    return uaz.uazSendReaction(token, remoteJid, messageId, fromMe, reaction);
  }
  return evo.evoSendReaction(instanceName, remoteJid, messageId, fromMe, reaction);
}

export async function evoEditMessage(
  instanceName: string,
  remoteJid: string,
  messageId: string,
  fromMe: boolean,
  newText: string,
) {
  const meta = await loadInstanceMeta(instanceName);
  if (meta.provider === "uazapi") {
    const token = await requireUazToken(instanceName);
    return uaz.uazEditMessage(token, remoteJid, messageId, fromMe, newText);
  }
  return evo.evoEditMessage(instanceName, remoteJid, messageId, fromMe, newText);
}

export async function evoSendPresence(
  instanceName: string,
  number: string,
  presence: "composing" | "paused" | "available",
  delayMs = 1500,
) {
  const meta = await loadInstanceMeta(instanceName);
  if (meta.provider === "telegram") {
    return tgApi.tgSendPresence(await requireTelegramToken(instanceName), number, presence);
  }
  if (meta.provider === "meta") {
    return metaApi.metaSendPresence(await requireMetaToken(instanceName), number, presence);
  }
  if (meta.provider === "uazapi") {
    const token = await requireUazToken(instanceName);
    return uaz.uazSendPresence(token, number, presence, delayMs);
  }
  return evo.evoSendPresence(instanceName, number, presence, delayMs);
}

export async function evoSendMedia(
  instanceName: string,
  number: string,
  params: { mediatype: "image" | "video" | "document"; media: string; mimetype: string; fileName?: string; caption?: string },
) {
  const meta = await loadInstanceMeta(instanceName);
  if (meta.provider === "telegram") {
    return tgApi.tgSendMedia(await requireTelegramToken(instanceName), number, params);
  }
  if (meta.provider === "meta") {
    return metaApi.metaSendMedia(await requireMetaToken(instanceName), number, params);
  }
  if (meta.provider === "uazapi") {
    const token = await requireUazToken(instanceName);
    return uaz.uazSendMedia(token, number, params);
  }
  return evo.evoSendMedia(instanceName, number, params);
}

/** Envia um cartão de contato nativo do WhatsApp (vCard). */
export async function evoSendContact(
  instanceName: string,
  number: string,
  contato: { fullName: string; phoneNumber: string; organization?: string | null },
) {
  const meta = await loadInstanceMeta(instanceName);
  if (meta.provider === "uazapi") {
    const token = await requireUazToken(instanceName);
    return uaz.uazSendContact(token, number, contato);
  }
  if (meta.provider === "telegram" || meta.provider === "meta") {
    throw new Error("Envio de contato não é suportado neste canal.");
  }
  return evo.evoSendContact(instanceName, number, contato);
}

export async function evoSendAudio(instanceName: string, number: string, audioBase64OrUrl: string) {

  const meta = await loadInstanceMeta(instanceName);
  if (meta.provider === "telegram") {
    return tgApi.tgSendAudio(await requireTelegramToken(instanceName), number, audioBase64OrUrl);
  }
  if (meta.provider === "meta") {
    return metaApi.metaSendMedia(await requireMetaToken(instanceName), number, { mediatype: "audio", media: audioBase64OrUrl });
  }
  if (meta.provider === "uazapi") {
    const token = await requireUazToken(instanceName);
    return uaz.uazSendAudio(token, number, audioBase64OrUrl);
  }
  return evo.evoSendAudio(instanceName, number, audioBase64OrUrl);
}

export async function evoFetchProfilePic(instanceName: string, number: string): Promise<string | null> {
  const meta = await loadInstanceMeta(instanceName);
  if (meta.provider === "telegram") {
    return tgApi.tgFetchProfilePic(await requireTelegramToken(instanceName), number);
  }
  if (meta.provider === "meta") {
    const p = await metaApi.metaFetchProfile(await requireMetaToken(instanceName), number);
    return p.picture;
  }
  if (meta.provider === "uazapi") {
    const token = await requireUazToken(instanceName);
    return uaz.uazFetchProfilePic(token, number);
  }
  return evo.evoFetchProfilePic(instanceName, number);
}
export async function evoFetchMessages(instanceName: string, number: string, limit = 100): Promise<any[]> {
  const meta = await loadInstanceMeta(instanceName);
  if (meta.provider === "uazapi") {
    const token = await requireUazToken(instanceName);
    return uaz.uazFetchMessages(token, number, limit);
  }
  return [];
}


export async function evoGetMediaBase64(instanceName: string, message: any) {
  const meta = await loadInstanceMeta(instanceName);
  if (meta.provider === "uazapi") {
    const token = await requireUazToken(instanceName);
    return uaz.uazGetMediaBase64(token, message);
  }
  return evo.evoGetMediaBase64(instanceName, message);
}

export async function evoDeleteChat(instanceName: string, number: string) {
  const meta = await loadInstanceMeta(instanceName);
  if (meta.provider === "uazapi") {
    const token = await requireUazToken(instanceName);
    return uaz.uazDeleteChat(token, number);
  }
  return evo.evoDeleteChat(instanceName, number);
}

export async function evoArchiveChat(instanceName: string, number: string, archive: boolean) {
  const meta = await loadInstanceMeta(instanceName);
  if (meta.provider === "uazapi") {
    const token = await requireUazToken(instanceName);
    return uaz.uazArchiveChat(token, number, archive);
  }
  return evo.evoArchiveChat(instanceName, number, archive);
}

export async function evoBlockContact(instanceName: string, number: string, block: "block" | "unblock") {
  const meta = await loadInstanceMeta(instanceName);
  if (meta.provider === "uazapi") {
    const token = await requireUazToken(instanceName);
    return uaz.uazBlockContact(token, number, block);
  }
  return evo.evoBlockContact(instanceName, number, block);
}


export async function evoDeleteMessage(
  instanceName: string,
  remoteJid: string,
  messageId: string,
  fromMe: boolean,
) {
  const meta = await loadInstanceMeta(instanceName);
  if (meta.provider === "uazapi") {
    const token = await requireUazToken(instanceName);
    return uaz.uazDeleteMessage(token, messageId);
  }
  return evo.evoDeleteMessage(instanceName, remoteJid, messageId, fromMe);
}
