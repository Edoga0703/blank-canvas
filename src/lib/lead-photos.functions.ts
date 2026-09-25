import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Reprocessa as fotos dos leads já existentes na base, salvando-as
 * permanentemente no storage (as URLs originais do WhatsApp expiram).
 */
export const backfillLeadPhotos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { companyId: string; limit?: number }) => d)
  .handler(async ({ data, context }) => {
    const { companyId } = data;
    const limit = Math.min(data.limit ?? 200, 500);

    const { data: allowed } = await context.supabase
      .from("company_user")
      .select("id")
      .eq("company_id", companyId)
      .eq("user_id", context.userId)
      .maybeSingle();
    const { data: isSuper } = await context.supabase.rpc("is_super_admin");
    if (!allowed && !isSuper) throw new Error("Acesso negado");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { syncLeadPhoto, leadPhotoSignature } = await import("@/lib/lead-photo.server");

    // 1. Reassina URLs antigas (foto já está no storage, só falta a assinatura)
    let resigned = 0;
    const { data: legacy } = await (supabaseAdmin as any)
      .from("crm_cards")
      .select("id,numero,foto_url")
      .eq("company_id", companyId)
      .like("foto_url", "/api/public/lead-photo%")
      .limit(2000);
    for (const r of legacy ?? []) {
      if (String(r.foto_url).includes("&s=")) continue;
      const n = String(r.numero || "").replace(/\D/g, "");
      if (!n) continue;
      const url = `/api/public/lead-photo?c=${companyId}&n=${n}&s=${leadPhotoSignature(companyId, n)}&v=${Date.now()}`;
      await (supabaseAdmin as any).from("crm_cards").update({ foto_url: url }).eq("id", r.id);
      resigned++;
    }

    const { data: inst } = await (supabaseAdmin as any)
      .from("whatsapp_instances")
      .select("instance_token,status,provider")
      .eq("company_id", companyId)
      .not("instance_token", "is", null)
      .order("updated_at", { ascending: false })
      .limit(5);

    const token = (inst ?? []).find((i: any) => i.instance_token)?.instance_token;
    if (!token) return { ok: resigned > 0, processed: 0, updated: resigned, resigned, motivo: resigned ? undefined : "sem conexão ativa" };


    const { data: cards } = await (supabaseAdmin as any)
      .from("crm_cards")
      .select("id,numero,foto_url,foto_atualizada_em")
      .eq("company_id", companyId)
      .order("ultima_em", { ascending: false, nullsFirst: false })
      .limit(1500);

    const pend = (cards ?? []).filter(
      (c: any) => !(String(c.foto_url || "").startsWith("/api/public/lead-photo") && String(c.foto_url).includes("&s=")),
    ).slice(0, limit);

    let updated = 0;
    for (let i = 0; i < pend.length; i += 5) {
      const batch = pend.slice(i, i + 5);
      const res = await Promise.all(
        batch.map((c: any) =>
          syncLeadPhoto(supabaseAdmin as any, companyId, c.id, c.numero, token).catch(() => null),
        ),
      );
      updated += res.filter(Boolean).length;
    }

    return { ok: true, processed: pend.length, updated: updated + resigned, resigned, restantes: Math.max(0, (cards ?? []).filter((c: any) => !(String(c.foto_url || "").startsWith("/api/public/lead-photo") && String(c.foto_url).includes("&s="))).length - pend.length) };
  });

/**
 * Reassina as URLs de fotos já gravadas (`/api/public/lead-photo?...`) para o
 * novo formato com assinatura HMAC. Somente super admin.
 */
export const resignLeadPhotoUrls = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isSuper } = await context.supabase.rpc("is_super_admin");
    if (!isSuper) throw new Error("Acesso negado");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { leadPhotoSignature } = await import("@/lib/lead-photo.server");

    let updated = 0;
    let from = 0;
    const page = 1000;
    for (;;) {
      const { data: rows } = await (supabaseAdmin as any)
        .from("crm_cards")
        .select("id,company_id,numero,foto_url")
        .like("foto_url", "/api/public/lead-photo%")
        .range(from, from + page - 1);
      if (!rows || rows.length === 0) break;

      for (const r of rows) {
        if (String(r.foto_url).includes("&s=")) continue;
        const n = String(r.numero || "").replace(/\D/g, "");
        if (!n) continue;
        const url = `/api/public/lead-photo?c=${r.company_id}&n=${n}&s=${leadPhotoSignature(r.company_id, n)}&v=${Date.now()}`;
        await (supabaseAdmin as any).from("crm_cards").update({ foto_url: url }).eq("id", r.id);
        updated++;
      }
      if (rows.length < page) break;
      from += page;
    }
    return { ok: true, updated };
  });
