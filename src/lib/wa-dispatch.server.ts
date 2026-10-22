// Despachador neutral usado por atención, IA y campañas.
// La beta prioriza WhatsApp Business de Lovable; los adaptadores heredados se
// conservan para una futura oferta SaaS.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { normalizeBrPhone, parseBrPhone } from "@/lib/br-phone";
import {
  evoSendText, evoSendMedia, evoSendPresence,
} from "@/lib/evolution.server";
import {
  uazSendText, uazSendMedia, uazSendPresence,
} from "@/lib/uazapi.server";
import {
  wablastSendText, wablastSendMedia, wablastSendTemplate,
} from "@/lib/wablast.server";
import { getMessagingProvider } from "@/lib/messaging/provider-registry.server";

export type WaProvider =
  | "lovable_whatsapp"
  | "meta_instagram"
  | "meta_messenger"
  | "evolution"
  | "uazapi"
  | "wablast"
  | "telegram";

export function isMetaProvider(provider?: string | null): boolean {
  return provider === "meta_instagram" || provider === "meta_messenger";
}

export type WaInstance = {
  company_id?: string | null;
  instance_name: string;
  instance_token: string | null;
  provider: WaProvider;
  status: string;
  paused: boolean;
  phone_number_id?: string | null;
  waba_id?: string | null;
};

export async function getActiveInstance(companyId: string): Promise<WaInstance | null> {
  const { data: inst } = await supabaseAdmin
    .from("whatsapp_instances")
    .select("instance_name, instance_token, status, paused, provider, provider_type, phone_number_id, waba_id")
    .eq("company_id", companyId)
    .in("status", ["connected", "open"])
    .or("paused.is.null,paused.eq.false")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!inst) return null;

  const providerType = (inst as any).provider_type as string | null;
  const providerName = String((inst as any).provider || providerType || "evolution");
  let provider: WaProvider = "evolution";
  if (providerName === "lovable_whatsapp") provider = "lovable_whatsapp";
  else if (providerName === "meta_instagram" || providerType === "meta_instagram") provider = "meta_instagram";
  else if (providerName === "meta_messenger" || providerType === "meta_messenger") provider = "meta_messenger";
  else if (providerType === "wablast") provider = "wablast";
  else if (providerType === "uazapi") provider = "uazapi";
  else {
    // Fallback: company.wa_provider (legacy)
    const { data: comp } = await supabaseAdmin
      .from("company").select("wa_provider").eq("id", companyId).maybeSingle();
    if ((comp as any)?.wa_provider === "uazapi") provider = "uazapi";
  }

  return {
    company_id: companyId,
    instance_name: (inst as any).instance_name,
    instance_token: (inst as any).instance_token ?? null,
    provider,
    status: (inst as any).status,
    paused: !!(inst as any).paused,
    phone_number_id: (inst as any).phone_number_id ?? null,
    waba_id: (inst as any).waba_id ?? null,
  };
}

export async function getActiveInstanceForContact(
  companyId: string,
  numero: string,
  userId?: string,
): Promise<WaInstance | null> {
  try {
    const { getInstanceForContact } = await import("@/lib/evolution-helpers");
    const inst = await getInstanceForContact(
      supabaseAdmin,
      companyId,
      numero,
      "instance_name,instance_token,status,provider,provider_type,phone_number_id,waba_id,paused",
      userId,
    );
    if (!inst?.instance_name) return null;

    const providerType = (inst as any).provider_type as string | null;
    const providerName = String((inst as any).provider || providerType || "evolution");
    let provider: WaProvider = "evolution";
    if (providerName === "lovable_whatsapp") provider = "lovable_whatsapp";
    else if (providerName === "meta_instagram" || providerType === "meta_instagram") provider = "meta_instagram";
    else if (providerName === "meta_messenger" || providerType === "meta_messenger") provider = "meta_messenger";
    else if (providerType === "wablast") provider = "wablast";
    else if (providerType === "uazapi") provider = "uazapi";
    else if (providerName === "telegram" || providerType === "telegram") provider = "telegram";

    return {
      company_id: companyId,
      instance_name: (inst as any).instance_name,
      instance_token: (inst as any).instance_token ?? null,
      provider,
      status: (inst as any).status,
      paused: !!(inst as any).paused,
      phone_number_id: (inst as any).phone_number_id ?? null,
      waba_id: (inst as any).waba_id ?? null,
    };
  } catch (e: any) {
    console.warn(`[getActiveInstanceForContact] Falha ao resolver instância para ${numero}, usando fallback:`, e?.message);
    return getActiveInstance(companyId);
  }
}

async function assertMetaWindowForInstance(inst: WaInstance, numero: string) {
  if (!isMetaProvider(inst.provider)) return;
  let companyId = inst.company_id ?? null;
  if (!companyId) {
    const { data, error } = await (supabaseAdmin as any).from("whatsapp_instances")
      .select("company_id")
      .eq("instance_name", inst.instance_name)
      .eq("provider", inst.provider)
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    companyId = data?.company_id ?? null;
  }
  if (!companyId) throw new Error(`Empresa da conexão Meta ${inst.instance_name} não encontrada.`);
  const { assertMetaResponseWindow } = await import("./meta-response-window.server");
  await assertMetaResponseWindow(supabaseAdmin, {
    companyId,
    provider: inst.provider,
    contactId: numero,
  });
}

export async function waPresenceTyping(inst: WaInstance, numero: string, ms: number) {
  try {
    if (inst.provider === "wablast" || inst.provider === "lovable_whatsapp") return;
    if (isMetaProvider(inst.provider) && inst.instance_token) {
      const { metaSendPresence } = await import("./meta.server");
      await metaSendPresence(inst.instance_token, numero, "composing");
      return;
    }
    if (inst.provider === "uazapi" && inst.instance_token) {
      await uazSendPresence(inst.instance_token, numero, "composing", ms);
    } else {
      await evoSendPresence(inst.instance_name, numero, "composing", ms);
    }
  } catch { /* presence best-effort */ }
}

/**
 * Valida o destinatário antes de gastar uma tentativa no número conectado.
 * Evita rajadas de erro "the number ... is not on WhatsApp" (e-mails, números
 * truncados, DDD inválido) que sobrecarregam a instância.
 */
export function assertSendableNumber(numero: string, provider?: WaProvider): string {
  const raw = String(numero || "").trim();
  if (!raw) throw new Error("Destinatário vazio: envio ignorado.");
  if (provider && (isMetaProvider(provider) || provider === "telegram")) {
    const clean = raw.replace(/^@/, "").trim();
    if (!clean) throw new Error("Destinatário Meta/Telegram inválido.");
    return clean;
  }
  if (raw.includes("@g.us")) throw new Error("Destinatário é um grupo: envio ignorado.");
  // JID individual válido (…@s.whatsapp.net / @c.us): usa só a parte numérica
  const base = raw.includes("@") ? raw.split("@")[0] : raw;
  if (/[a-zA-Z]/.test(base)) {
    throw new Error(`Destinatário inválido (não é um número): ${raw}`);
  }
  if (provider === "lovable_whatsapp") {
    const digits = base.replace(/\D/g, "");
    if (!/^[1-9]\d{7,14}$/.test(digits)) {
      throw new Error(`Número inválido para WhatsApp Business: ${raw}. Use DDI + número, somente dígitos.`);
    }
    return digits;
  }
  const parsed = parseBrPhone(base);
  if (!parsed.valid || !parsed.numero) {
    throw new Error(`Número inválido para WhatsApp (${parsed.reason ?? "formato"}): ${raw}`);
  }
  return parsed.numero;
}

export async function waSendText(
  inst: WaInstance,
  numero: string,
  texto: string,
  options?: { replyToExternalMessageId?: string | null; quoted?: any },
) {
  numero = assertSendableNumber(numero, inst.provider);
  if (isMetaProvider(inst.provider)) {
    if (!inst.instance_token) throw new Error(`Token da Meta ausente para conexão ${inst.instance_name}`);
    await assertMetaWindowForInstance(inst, numero);
    const { metaSendText } = await import("./meta.server");
    return metaSendText(inst.instance_token, numero, texto);
  }
  if (inst.provider === "lovable_whatsapp") {
    const result = await getMessagingProvider("lovable_whatsapp").sendText({
      connectionExternalId: inst.instance_name,
      to: numero,
      text: texto,
      replyToExternalMessageId: options?.replyToExternalMessageId,
    });
    return { id: result.externalMessageId, provider: result.provider, raw: result.raw };
  }
  if (inst.provider === "wablast") {
    if (!inst.instance_token) throw new Error("WaBlast: API key ausente na conexão");
    return wablastSendText(inst.instance_token, inst.waba_id ?? null, numero, texto);
  }
  if (inst.provider === "telegram") {
    const { tgSendMessage } = await import("./telegram.server");
    return tgSendMessage(inst.instance_token || "", numero, texto);
  }
  if (inst.provider === "uazapi" && inst.instance_token) {
    return uazSendText(inst.instance_token, numero, texto);
  }
  return evoSendText(inst.instance_name, numero, texto, options?.quoted);
}

export async function waSendMedia(
  inst: WaInstance,
  numero: string,
  media: { url: string; type: "image" | "video" | "document" | "audio"; caption?: string; fileName?: string; mime?: string },
) {
  numero = assertSendableNumber(numero, inst.provider);
  if (isMetaProvider(inst.provider)) {
    if (!inst.instance_token) throw new Error(`Token da Meta ausente para conexão ${inst.instance_name}`);
    await assertMetaWindowForInstance(inst, numero);
    const { metaSendMedia } = await import("./meta.server");
    return metaSendMedia(inst.instance_token, numero, {
      mediatype: media.type,
      media: media.url,
      caption: media.caption,
    });
  }
  if (inst.provider === "lovable_whatsapp") {
    const result = await getMessagingProvider("lovable_whatsapp").sendMedia({
      connectionExternalId: inst.instance_name,
      to: numero,
      kind: media.type,
      mediaUrl: media.url,
      mimeType: media.mime,
      fileName: media.fileName,
      caption: media.caption,
    });
    return { id: result.externalMessageId, provider: result.provider, raw: result.raw };
  }
  if (inst.provider === "wablast") {
    if (!inst.instance_token) throw new Error("WaBlast: API key ausente na conexão");
    return wablastSendMedia(inst.instance_token, inst.waba_id ?? null, numero, media);
  }
  if (inst.provider === "uazapi" && inst.instance_token) {
    return uazSendMedia(inst.instance_token, numero, {
      mediatype: media.type === "audio" ? "document" : media.type,
      media: media.url,
      mimetype: media.mime || "application/octet-stream",
      fileName: media.fileName,
      caption: media.caption,
    });
  }
  return evoSendMedia(inst.instance_name, numero, {
    mediatype: media.type === "audio" ? "document" : media.type,
    media: media.url,
    mimetype: media.mime || "application/octet-stream",
    fileName: media.fileName,
    caption: media.caption,
  });
}

export async function waSendAudio(inst: WaInstance, numero: string, audioBase64OrUrl: string) {
  numero = assertSendableNumber(numero, inst.provider);
  if (isMetaProvider(inst.provider)) {
    if (!inst.instance_token) throw new Error(`Token da Meta ausente para conexão ${inst.instance_name}`);
    await assertMetaWindowForInstance(inst, numero);
    const { metaSendMedia } = await import("./meta.server");
    return metaSendMedia(inst.instance_token, numero, {
      mediatype: "audio",
      media: audioBase64OrUrl,
    });
  }
  if (inst.provider === "lovable_whatsapp") {
    const result = await getMessagingProvider("lovable_whatsapp").sendMedia({
      connectionExternalId: inst.instance_name,
      to: numero,
      kind: "audio",
      mediaUrl: audioBase64OrUrl,
      mimeType: "audio/ogg",
    });
    return { id: result.externalMessageId, provider: result.provider, raw: result.raw };
  }
  if (inst.provider === "wablast") {
    if (!inst.instance_token) throw new Error("WaBlast: API key ausente na conexão");
    return wablastSendMedia(inst.instance_token, inst.waba_id ?? null, numero, {
      url: audioBase64OrUrl,
      type: "audio"
    });
  }
  if (inst.provider === "uazapi" && inst.instance_token) {
    const { uazSendAudio } = await import("./uazapi.server");
    return uazSendAudio(inst.instance_token, numero, audioBase64OrUrl);
  }
  const { evoSendAudio } = await import("./evolution.server");
  return evoSendAudio(inst.instance_name, numero, audioBase64OrUrl);
}

/** Envio de HSM template (obrigatório fora da janela 24h em WaBlast/Cloud API). */
export async function waSendTemplate(
  inst: WaInstance,
  numero: string,
  template: { name: string; language: string; components?: any[] },
) {
  numero = assertSendableNumber(numero, inst.provider);
  if (inst.provider === "lovable_whatsapp") {
    const result = await getMessagingProvider("lovable_whatsapp").sendTemplate({
      connectionExternalId: inst.instance_name,
      to: numero,
      name: template.name,
      language: template.language,
      components: template.components,
    });
    return { id: result.externalMessageId, provider: result.provider, raw: result.raw };
  }
  if (inst.provider !== "wablast") {
    throw new Error("HSM template só é suportado no provider WaBlast (Cloud API).");
  }
  if (!inst.instance_token) throw new Error("WaBlast: API key ausente na conexão");
  return wablastSendTemplate(
    inst.instance_token,
    inst.waba_id ?? null,
    numero,
    template.name,
    template.language,
    template.components,
  );
}

// -------- helpers usados pelo motor de campanha --------

/** Sortear variação a partir de spintax {a|b|c}. */
export function spin(text: string): string {
  return text.replace(/\{([^{}]+)\}/g, (_m, group: string) => {
    const opts = group.split("|");
    return opts[Math.floor(Math.random() * opts.length)] ?? "";
  });
}

/** Normaliza (DDI 55 + 9º dígito por DDD). Retorna "" quando o número é inválido. */
export function normalizeBrNumber(raw: string): string {
  return normalizeBrPhone(raw);
}

/** Hora local no fuso da campanha. */
export function localParts(tz: string) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hour12: false, weekday: "short", hour: "2-digit", minute: "2-digit",
  });
  const parts = fmt.formatToParts(new Date());
  const wdMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const wd = wdMap[parts.find(p => p.type === "weekday")?.value ?? "Mon"] ?? new Date().getDay();
  const hh = Number(parts.find(p => p.type === "hour")?.value ?? "0");
  const mm = Number(parts.find(p => p.type === "minute")?.value ?? "0");
  return { weekday: wd, hour: hh, minute: mm, minutesOfDay: hh * 60 + mm };
}

export function inWindow(tz: string, dias: number[], hIni: string, hFim: string): boolean {
  const { weekday, minutesOfDay } = localParts(tz);
  if (!dias.includes(weekday)) return false;
  const [ah, am] = hIni.split(":").map(Number);
  const [bh, bm] = hFim.split(":").map(Number);
  const startM = ah * 60 + (am || 0);
  const endM = bh * 60 + (bm || 0);
  return minutesOfDay >= startM && minutesOfDay < endM;
}

/** Limite diário aplicando aquecimento incremental. */
export function warmupLimit(cap: number, aquecimentoAtivo: boolean, inicio: string | null): number {
  if (!aquecimentoAtivo || !inicio) return cap;
  const start = new Date(inicio + "T00:00:00Z").getTime();
  const days = Math.max(1, Math.floor((Date.now() - start) / 86400000) + 1);
  // dia 1: 20; dia 2: 40; dia 3: 80; dia 4: 150; depois: 250; depois: cap
  const escala = [20, 40, 80, 150, 250];
  const idx = Math.min(days - 1, escala.length - 1);
  const val = days > escala.length ? cap : escala[idx];
  return Math.min(cap, val);
}
