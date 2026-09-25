// Provider-agnostic WhatsApp dispatch used by mass campaigns.
// Reads company.wa_provider e whatsapp_instances.provider_type; roteia para
// Evolution, Uazapi ou WaBlast (Cloud API oficial via BSP).
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

export type WaProvider = "evolution" | "uazapi" | "wablast";

export type WaInstance = {
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
    .select("instance_name, instance_token, status, paused, provider_type, phone_number_id, waba_id")
    .eq("company_id", companyId)
    .in("status", ["connected", "open"])
    .or("paused.is.null,paused.eq.false")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!inst) return null;

  const providerType = (inst as any).provider_type as string | null;
  let provider: WaProvider = "evolution";
  if (providerType === "wablast") provider = "wablast";
  else if (providerType === "uazapi") provider = "uazapi";
  else {
    // Fallback: company.wa_provider (legacy)
    const { data: comp } = await supabaseAdmin
      .from("company").select("wa_provider").eq("id", companyId).maybeSingle();
    if ((comp as any)?.wa_provider === "uazapi") provider = "uazapi";
  }

  return {
    instance_name: (inst as any).instance_name,
    instance_token: (inst as any).instance_token ?? null,
    provider,
    status: (inst as any).status,
    paused: !!(inst as any).paused,
    phone_number_id: (inst as any).phone_number_id ?? null,
    waba_id: (inst as any).waba_id ?? null,
  };
}

export async function waPresenceTyping(inst: WaInstance, numero: string, ms: number) {
  try {
    if (inst.provider === "wablast") return; // Cloud API não suporta presença
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
export function assertSendableNumber(numero: string): string {
  const raw = String(numero || "").trim();
  if (!raw) throw new Error("Destinatário vazio: envio ignorado.");
  if (raw.includes("@g.us")) throw new Error("Destinatário é um grupo: envio ignorado.");
  // JID individual válido (…@s.whatsapp.net / @c.us): usa só a parte numérica
  const base = raw.includes("@") ? raw.split("@")[0] : raw;
  if (/[a-zA-Z]/.test(base)) {
    throw new Error(`Destinatário inválido (não é um número): ${raw}`);
  }
  const parsed = parseBrPhone(base);
  if (!parsed.valid || !parsed.numero) {
    throw new Error(`Número inválido para WhatsApp (${parsed.reason ?? "formato"}): ${raw}`);
  }
  return parsed.numero;
}

export async function waSendText(inst: WaInstance, numero: string, texto: string) {
  numero = assertSendableNumber(numero);
  if (inst.provider === "wablast") {
    if (!inst.instance_token) throw new Error("WaBlast: API key ausente na conexão");
    return wablastSendText(inst.instance_token, inst.waba_id ?? null, numero, texto);
  }
  if (inst.provider === "uazapi" && inst.instance_token) {
    return uazSendText(inst.instance_token, numero, texto);
  }
  return evoSendText(inst.instance_name, numero, texto);
}

export async function waSendMedia(
  inst: WaInstance,
  numero: string,
  media: { url: string; type: "image" | "video" | "document" | "audio"; caption?: string; fileName?: string; mime?: string },
) {
  numero = assertSendableNumber(numero);
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
  numero = assertSendableNumber(numero);
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
