// Despachador central de mensajería omnicanal:
// - WhatsApp: exclusivamente D-API (dapi y dapi_official)
// - Instagram Direct y Facebook Messenger: Meta Graph API (meta_instagram, meta_messenger)
// - Telegram: Telegram Bot API (telegram)
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { normalizeBrPhone } from "@/lib/br-phone";

export type WaProvider =
  | "dapi"
  | "dapi_official"
  | "meta_instagram"
  | "meta_messenger"
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

const VALID_ACTIVE_PROVIDERS = ["dapi", "dapi_official", "meta_instagram", "meta_messenger", "telegram"];

function normalizeProvider(rawProvider?: string | null, rawType?: string | null): WaProvider {
  const p = String(rawProvider || rawType || "dapi").toLowerCase();
  if (p === "dapi_official" || p === "oficial_meta" || p === "official") return "dapi_official";
  if (p === "meta_instagram") return "meta_instagram";
  if (p === "meta_messenger") return "meta_messenger";
  if (p === "telegram") return "telegram";
  return "dapi";
}

export async function getActiveInstance(companyId: string): Promise<WaInstance | null> {
  const { data: inst } = await supabaseAdmin
    .from("whatsapp_instances")
    .select("instance_name, instance_token, status, paused, provider, provider_type, phone_number_id, waba_id")
    .eq("company_id", companyId)
    .in("provider", VALID_ACTIVE_PROVIDERS)
    .in("status", ["connected", "open"])
    .or("paused.is.null,paused.eq.false")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!inst) return null;

  const provider = normalizeProvider((inst as any).provider, (inst as any).provider_type);

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

    const provider = normalizeProvider((inst as any).provider, (inst as any).provider_type);

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
  if (!isMetaProvider(inst.provider) && inst.provider !== "dapi_official") return;
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

export async function waPresenceTyping(inst: WaInstance, numero: string, _ms: number) {
  try {
    if (isMetaProvider(inst.provider) && inst.instance_token) {
      const { metaSendPresence } = await import("./meta.server");
      await metaSendPresence(inst.instance_token, numero, "composing");
    } else if (inst.provider === "dapi") {
      const { dapiSendPresence } = await import("./dapi.server");
      await dapiSendPresence(inst.instance_name, numero, "composing");
    }
  } catch { /* presence best-effort */ }
}

export function assertSendableNumber(numero: string, provider?: WaProvider): string {
  const raw = String(numero || "").trim();
  if (!raw) throw new Error("Destinatário vazio: envio ignorado.");
  if (provider && (isMetaProvider(provider) || provider === "telegram")) {
    const clean = raw.replace(/^@/, "").trim();
    if (!clean) throw new Error("Destinatário Meta/Telegram inválido.");
    return clean;
  }
  if (raw.includes("@g.us")) throw new Error("Destinatário é um grupo: envio ignorado.");
  const base = raw.includes("@") ? raw.split("@")[0] : raw;
  if (/[a-zA-Z]/.test(base)) {
    throw new Error(`Destinatário inválido (não é um número): ${raw}`);
  }
  const normalized = normalizeBrPhone(base);
  const digits = (normalized || base).replace(/\D/g, "");
  if (!/^[1-9]\d{7,14}$/.test(digits)) {
    throw new Error(`Número inválido para WhatsApp (D-API): ${raw}. Use DDI + número, somente dígitos.`);
  }
  return digits;
}

export async function waSendText(
  inst: WaInstance,
  numero: string,
  texto: string,
  options?: {
    replyToExternalMessageId?: string | null;
    quoted?: any;
    quotedText?: string | null;
  },
) {
  numero = assertSendableNumber(numero, inst.provider);
  if (isMetaProvider(inst.provider)) {
    if (!inst.instance_token) throw new Error(`Token da Meta ausente para conexão ${inst.instance_name}`);
    await assertMetaWindowForInstance(inst, numero);
    const { metaSendText } = await import("./meta.server");
    return metaSendText(inst.instance_token, numero, texto);
  }
  if (inst.provider === "telegram") {
    const { tgSendMessage } = await import("./telegram.server");
    return tgSendMessage(inst.instance_token || "", numero, texto);
  }
  if (inst.provider === "dapi_official") {
    await assertMetaWindowForInstance(inst, numero);
  }
  const { dapiSendText } = await import("./dapi.server");
  let contextInfo: any = undefined;
  if (options?.replyToExternalMessageId) {
    contextInfo = {
      stanzaId: options.replyToExternalMessageId,
      participant: `${numero}@s.whatsapp.net`,
      quotedMessage: options.quotedText ? { conversation: options.quotedText } : undefined,
    };
  }
  return dapiSendText(inst.instance_name, numero, texto, options?.replyToExternalMessageId, contextInfo);
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
  if (inst.provider === "dapi_official") {
    await assertMetaWindowForInstance(inst, numero);
  }
  const { dapiSendMedia } = await import("./dapi.server");
  return dapiSendMedia(inst.instance_name, numero, media);
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
  if (inst.provider === "dapi_official") {
    await assertMetaWindowForInstance(inst, numero);
  }
  const { dapiSendAudio } = await import("./dapi.server");
  return dapiSendAudio(inst.instance_name, numero, audioBase64OrUrl);
}

export async function waSendTemplate(
  inst: WaInstance,
  numero: string,
  template: { name: string; language: string; components?: any[] },
) {
  numero = assertSendableNumber(numero, inst.provider);
  const { dapiSendTemplate } = await import("./dapi.server");
  return dapiSendTemplate(inst.instance_name, numero, template);
}

// -------- helpers usados pelo motor de campanha --------

export function spin(text: string): string {
  return text.replace(/\{([^{}]+)\}/g, (_m, group: string) => {
    const opts = group.split("|");
    return opts[Math.floor(Math.random() * opts.length)] ?? "";
  });
}

export function normalizeBrNumber(raw: string): string {
  return normalizeBrPhone(raw);
}

export function localParts(tz: string) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hour12: false, weekday: "short", hour: "2-digit", minute: "2-digit",
  });
  const parts = fmt.formatToParts(new Date());
  const wdMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const wd = wdMap[parts.find(p => p.type === "weekday")?.value ?? "Mon"] ?? new Date().getDay();
  const h = Number(parts.find(p => p.type === "hour")?.value ?? 0);
  const m = Number(parts.find(p => p.type === "minute")?.value ?? 0);
  return { weekday: wd, minutes: h * 60 + m };
}

export function inWindow(
  tzOrObj: string | any,
  diasArg?: number[],
  horaIniArg?: string | null,
  horaFimArg?: string | null,
): boolean {
  const isObj = typeof tzOrObj === "object" && tzOrObj !== null;
  const tz = isObj
    ? (tzOrObj.timezone || tzOrObj.fuso_horario || "America/Sao_Paulo")
    : (tzOrObj || "America/Sao_Paulo");
  const dias: number[] = isObj
    ? (Array.isArray(tzOrObj.janela_dias) ? tzOrObj.janela_dias : Array.isArray(tzOrObj.dias_semana) ? tzOrObj.dias_semana : [1, 2, 3, 4, 5])
    : (Array.isArray(diasArg) ? diasArg : [1, 2, 3, 4, 5]);
  const rawIni = isObj ? (tzOrObj.janela_hora_ini ?? tzOrObj.janela_inicio) : horaIniArg;
  const rawFim = isObj ? (tzOrObj.janela_hora_fim ?? tzOrObj.janela_fim) : horaFimArg;

  const { weekday, minutes } = localParts(tz);
  if (!dias.includes(weekday)) return false;
  const parseHM = (s: string | null | undefined, def: number) => {
    if (!s) return def;
    const [hh, mm] = String(s).split(":").map(Number);
    return (hh || 0) * 60 + (mm || 0);
  };
  const ini = parseHM(rawIni, 8 * 60);
  const fim = parseHM(rawFim, 20 * 60);
  return minutes >= ini && minutes <= fim;
}

export function warmupLimit(
  baseLimit: number,
  secondArg?: string | boolean | null,
  thirdArg?: string | boolean | null,
): number {
  const enabled = typeof secondArg === "boolean" ? secondArg : Boolean(thirdArg);
  const startedAt = typeof secondArg === "string" ? secondArg : (typeof thirdArg === "string" ? thirdArg : null);
  if (!enabled || !startedAt) return baseLimit;
  const days = Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 86_400_000));
  const factor = Math.min(1, 0.25 + days * 0.15);
  return Math.max(5, Math.round(baseLimit * factor));
}
