import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveCompanyIdCached } from "./company-cache";

export type AddonProduct = {
  id: string;
  slug: string;
  nome: string;
  descricao: string | null;
  tipo: "whatsapp_uazapi" | "whatsapp_meta" | "custom";
  preco_cents: number;
  moeda: string;
  intervalo: "month" | "year";
  checkout_url: string | null;
  provider: string | null;
  external_product_id: string | null;
  ativo: boolean;
  ordem: number;
  concede_usuarios: number;
  concede_conexoes: number;
};

export type CompanyAddon = {
  id: string;
  company_id: string;
  addon_product_id: string;
  quantidade: number;
  status: "active" | "past_due" | "canceled";
  provider: string | null;
  external_subscription_id: string | null;
  buyer_email: string | null;
  current_period_end: string | null;
  canceled_at: string | null;
  created_at: string;
};

async function assertSuperAdmin(supabase: any) {
  const { data, error } = await supabase.rpc("is_super_admin");
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Acesso negado");
}

// ---------- Público (catálogo ativo) ----------
export const listAddonsPublic = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("addon_product")
      .select("*")
      .eq("ativo", true)
      .order("ordem", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as AddonProduct[];
  });

// ---------- Master CRUD ----------
export const listAddonsMaster = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperAdmin(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("addon_product")
      .select("*")
      .order("ordem", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as AddonProduct[];
  });

export const saveAddon = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: Partial<AddonProduct> & { id?: string | null }) => d)
  .handler(async ({ context, data }) => {
    await assertSuperAdmin(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const payload: any = {
      slug: (data.slug || "").toLowerCase().trim(),
      nome: (data.nome || "").trim(),
      descricao: data.descricao ?? null,
      tipo: data.tipo || "custom",
      preco_cents: Number(data.preco_cents ?? 0),
      moeda: data.moeda || "BRL",
      intervalo: data.intervalo || "month",
      checkout_url: (data.checkout_url || "").trim() || null,
      provider: data.provider || "kiwify",
      external_product_id: (data.external_product_id || "").trim() || null,
      ativo: data.ativo ?? true,
      ordem: Number(data.ordem ?? 0),
      concede_usuarios: Math.max(0, Number(data.concede_usuarios ?? 0)),
      concede_conexoes: Math.max(0, Number(data.concede_conexoes ?? 0)),
    };
    if (!payload.slug || !payload.nome) throw new Error("Slug e nome são obrigatórios");
    if (data.id) {
      const { data: row, error } = await supabaseAdmin
        .from("addon_product").update(payload).eq("id", data.id).select().maybeSingle();
      if (error) throw new Error(error.message);
      return row;
    }
    const { data: row, error } = await supabaseAdmin
      .from("addon_product").insert(payload).select().maybeSingle();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteAddon = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ context, data }) => {
    await assertSuperAdmin(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("addon_product").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Empresa: meus add-ons ativos ----------
export const listMyAddons = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const companyId = await resolveCompanyIdCached(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("company_addon")
      .select("*, addon_product(id,slug,nome,tipo,preco_cents,moeda,intervalo,checkout_url)")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as (CompanyAddon & { addon_product: AddonProduct })[];
  });

export const hasAddonTipo = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { tipo: "whatsapp_uazapi" | "whatsapp_meta" | "custom" }) => d)
  .handler(async ({ context, data }) => {
    const companyId = await resolveCompanyIdCached(context.supabase, context.userId);
    const { data: r, error } = await context.supabase.rpc("has_active_addon", {
      _company_id: companyId,
      _tipo: data.tipo,
    });
    if (error) throw new Error(error.message);
    return { has: !!r };
  });

// ---------- Master: cancelar addon de empresa ----------
export const cancelCompanyAddon = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ context, data }) => {
    await assertSuperAdmin(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("company_addon")
      .update({ status: "canceled", canceled_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Master: liberar/revogar tipos de conexão por empresa (cortesia) ----------
export const listCompanyAddonsMaster = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { companyId: string }) => d)
  .handler(async ({ context, data }) => {
    await assertSuperAdmin(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("company_addon")
      .select("*, addon_product(id,slug,nome,tipo,preco_cents,moeda,intervalo)")
      .eq("company_id", data.companyId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (rows ?? []) as unknown as (CompanyAddon & { addon_product: AddonProduct })[];
  });

export const setCompanyAddonAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    companyId: string;
    tipo: "whatsapp_uazapi" | "whatsapp_meta" | "custom";
    enable: boolean;
    cortesia?: boolean;
  }) => d)
  .handler(async ({ context, data }) => {
    await assertSuperAdmin(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: product, error: pErr } = await supabaseAdmin
      .from("addon_product")
      .select("id")
      .eq("tipo", data.tipo)
      .order("ordem", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (pErr) throw new Error(pErr.message);
    if (!product) throw new Error("Produto de add-on não encontrado para este tipo");

    const { data: existing, error: eErr } = await supabaseAdmin
      .from("company_addon")
      .select("id")
      .eq("company_id", data.companyId)
      .eq("addon_product_id", product.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (eErr) throw new Error(eErr.message);

    if (!data.enable) {
      if (existing) {
        const { error } = await supabaseAdmin
          .from("company_addon")
          .update({ status: "canceled", canceled_at: new Date().toISOString() })
          .eq("id", existing.id);
        if (error) throw new Error(error.message);
      }
      return { ok: true, enabled: false };
    }

    const payload = {
      status: "active" as const,
      canceled_at: null,
      current_period_end: null,
      provider: data.cortesia === false ? "master" : "cortesia_master",
    };
    if (existing) {
      const { error } = await supabaseAdmin.from("company_addon").update(payload).eq("id", existing.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin.from("company_addon").insert({
        company_id: data.companyId,
        addon_product_id: product.id,
        quantidade: 1,
        ...payload,
      });
      if (error) throw new Error(error.message);
    }
    return { ok: true, enabled: true };
  });
