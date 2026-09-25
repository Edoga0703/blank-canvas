/**
 * Fotos de perfil dos leads.
 *
 * As URLs do WhatsApp (pps.whatsapp.net) expiram em poucos dias e passam a
 * responder 403 — era por isso que as fotos "sumiam" do Kanban/Conversas.
 * Aqui baixamos a imagem e guardamos no bucket `lead-avatars`, servindo por
 * uma rota pública estável (`/api/public/lead-photo`).
 */

import { createHmac } from "crypto";

const BUCKET = "lead-avatars";

export function leadPhotoPath(companyId: string, numero: string) {
  return `${companyId}/${String(numero).replace(/\D/g, "")}.jpg`;
}

/**
 * Assinatura estável (HMAC) que impede que terceiros enumerem fotos de leads
 * apenas conhecendo empresa + número.
 */
export function leadPhotoSignature(companyId: string, numero: string) {
  const secret = process.env["LEAD_PHOTO_SECRET"] || process.env["SUPABASE_SERVICE_ROLE_KEY"] || "";
  const n = String(numero).replace(/\D/g, "");
  return createHmac("sha256", secret).update(`${companyId}:${n}`).digest("hex").slice(0, 24);
}

export function leadPhotoPublicUrl(companyId: string, numero: string, v?: number) {
  const n = String(numero).replace(/\D/g, "");
  const s = leadPhotoSignature(companyId, n);
  return `/api/public/lead-photo?c=${companyId}&n=${n}&s=${s}${v ? `&v=${v}` : ""}`;
}

/** Baixa a foto remota e persiste no storage. Retorna a URL estável ou null. */
export async function storeLeadPhoto(
  admin: any,
  companyId: string,
  numero: string,
  remoteUrl: string,
): Promise<string | null> {
  try {
    const res = await fetch(remoteUrl);
    if (!res.ok) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    if (!buf.byteLength) return null;
    const { error } = await admin.storage.from(BUCKET).upload(leadPhotoPath(companyId, numero), buf, {
      contentType: res.headers.get("content-type") || "image/jpeg",
      upsert: true,
    });
    if (error) {
      console.warn("[lead-photo] upload falhou:", error.message);
      return null;
    }
    return leadPhotoPublicUrl(companyId, numero, Date.now());
  } catch (e: any) {
    console.warn("[lead-photo] erro:", e?.message);
    return null;
  }
}

/** Busca a foto na uazapi e persiste, atualizando o card. */
export async function syncLeadPhoto(
  admin: any,
  companyId: string,
  cardId: string,
  numero: string,
  instanceToken: string,
): Promise<string | null> {
  const { uazFetchProfilePic } = await import("@/lib/uazapi.server");
  const remote = await uazFetchProfilePic(instanceToken, numero);
  if (!remote) return null;
  const url = await storeLeadPhoto(admin, companyId, numero, remote);
  if (!url) return null;
  await admin.from("crm_cards")
    .update({ foto_url: url, foto_atualizada_em: new Date().toISOString() })
    .eq("id", cardId);
  return url;
}
