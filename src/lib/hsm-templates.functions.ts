import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveCompanyIdCached } from "./company-cache";

async function cid(supabase: any, userId: string) {
  return resolveCompanyIdCached(supabase, userId);
}

export type HsmStatus = "rascunho" | "pendente" | "aprovado" | "reprovado";
export type HsmCategoria = "MARKETING" | "UTILITY" | "AUTHENTICATION";
export type HsmHeader = "NONE" | "TEXT" | "MEDIA";
export type HsmButton = { type: "QUICK_REPLY" | "URL" | "PHONE"; texto: string; valor?: string };

export type HsmTemplate = {
  id: string;
  company_id: string;
  instance_id: string | null;
  nome: string;
  categoria: HsmCategoria;
  idioma: string;
  header_tipo: HsmHeader;
  header_conteudo: string | null;
  corpo: string;
  rodape: string | null;
  botoes: HsmButton[];
  variaveis: Record<string, string>;
  status: HsmStatus;
  meta_template_id: string | null;
  meta_ultimo_erro: string | null;
  created_at: string;
  updated_at: string;
};

export type HsmListItem = HsmTemplate & {
  instance_name: string | null;
  instance_display_name: string | null;
  instance_provider_type: string | null;
};

const SLUG_RE = /^[a-z0-9_]{3,60}$/;

export const listHsmInstances = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const companyId = await cid(context.supabase, context.userId);
    const { data } = await context.supabase
      .from("whatsapp_instances")
      .select("id,instance_name,display_name,numero,provider_type,status,waba_id,phone_number_id")
      .eq("company_id", companyId)
      .in("provider_type", ["oficial_meta", "wablast"])
      .order("updated_at", { ascending: false });
    return data ?? [];
  });


export const listHsmTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => ({
    search: (d?.search ?? "").toString().trim(),
    status: d?.status ?? "all",
    instanceId: d?.instanceId ?? "all",
    categoria: d?.categoria ?? "all",
    page: Math.max(1, Number(d?.page) || 1),
    pageSize: Math.min(100, Math.max(5, Number(d?.pageSize) || 10)),
  }))
  .handler(async ({ context, data }) => {
    const companyId = await cid(context.supabase, context.userId);
    const from = (data.page - 1) * data.pageSize;
    const to = from + data.pageSize - 1;

    let q = context.supabase
      .from("message_hsm_template")
      .select(
        "*, whatsapp_instances:instance_id(instance_name,display_name,provider_type)",
        { count: "exact" },
      )
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });

    if (data.search) q = q.ilike("nome", `%${data.search}%`);
    if (data.status !== "all") q = q.eq("status", data.status);
    if (data.categoria !== "all") q = q.eq("categoria", data.categoria);
    if (data.instanceId !== "all") q = q.eq("instance_id", data.instanceId);

    const { data: rows, count, error } = await q.range(from, to);
    if (error) throw new Error(error.message);

    const items: HsmListItem[] = (rows ?? []).map((r: any) => ({
      ...r,
      instance_name: r.whatsapp_instances?.instance_name ?? null,
      instance_display_name: r.whatsapp_instances?.display_name ?? null,
      instance_provider_type: r.whatsapp_instances?.provider_type ?? null,
    }));

    const { count: aprovados } = await context.supabase
      .from("message_hsm_template")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("status", "aprovado");

    return { items, total: count ?? 0, aprovados: aprovados ?? 0 };
  });

export const getHsmTemplate = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => {
    if (!d?.id) throw new Error("id obrigatório");
    return { id: d.id };
  })
  .handler(async ({ context, data }) => {
    const companyId = await cid(context.supabase, context.userId);
    const { data: row, error } = await context.supabase
      .from("message_hsm_template")
      .select("*, whatsapp_instances:instance_id(instance_name,display_name,provider_type)")
      .eq("id", data.id)
      .eq("company_id", companyId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Template não encontrado");
    const r: any = row;
    return {
      ...r,
      instance_name: r.whatsapp_instances?.instance_name ?? null,
      instance_display_name: r.whatsapp_instances?.display_name ?? null,
      instance_provider_type: r.whatsapp_instances?.provider_type ?? null,
    } as HsmListItem;
  });

export const saveHsmTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => {
    const nome = (d?.nome ?? "").toString().trim().toLowerCase();
    if (!SLUG_RE.test(nome)) throw new Error("Nome inválido: 3-60 caracteres, apenas letras minúsculas, números e _");
    const corpo = (d?.corpo ?? "").toString().trim();
    if (!corpo) throw new Error("Corpo obrigatório");
    if (corpo.length > 1024) throw new Error("Corpo máximo de 1024 caracteres");
    const categoria = (d?.categoria ?? "MARKETING").toString();
    if (!["MARKETING", "UTILITY", "AUTHENTICATION"].includes(categoria)) throw new Error("Categoria inválida");
    const header_tipo = (d?.header_tipo ?? "NONE").toString();
    if (!["NONE", "TEXT", "MEDIA"].includes(header_tipo)) throw new Error("Header inválido");
    const botoes = Array.isArray(d?.botoes) ? d.botoes.slice(0, 3) : [];
    return {
      id: d?.id as string | undefined,
      instance_id: (d?.instance_id ?? null) as string | null,
      nome,
      categoria,
      idioma: (d?.idioma ?? "pt_BR").toString().slice(0, 10),
      header_tipo,
      header_conteudo: (d?.header_conteudo ?? null) as string | null,
      corpo,
      rodape: (d?.rodape ?? null) as string | null,
      botoes,
      variaveis: (d?.variaveis ?? {}) as Record<string, string>,
      submitToMeta: !!d?.submitToMeta,
    };
  })
  .handler(async ({ context, data }) => {
    const companyId = await cid(context.supabase, context.userId);
    const status: HsmStatus = data.submitToMeta ? "pendente" : "rascunho";
    const payload: any = {
      company_id: companyId,
      instance_id: data.instance_id,
      nome: data.nome,
      categoria: data.categoria,
      idioma: data.idioma,
      header_tipo: data.header_tipo,
      header_conteudo: data.header_conteudo,
      corpo: data.corpo,
      rodape: data.rodape,
      botoes: data.botoes,
      variaveis: data.variaveis,
      status,
    };
    if (data.id) {
      const { error } = await context.supabase
        .from("message_hsm_template")
        .update(payload)
        .eq("id", data.id)
        .eq("company_id", companyId);
      if (error) throw new Error(error.message);
      return { ok: true, id: data.id };
    }
    const { data: ins, error } = await context.supabase
      .from("message_hsm_template")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, id: ins!.id };
  });

export const deleteHsmTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => {
    if (!d?.id) throw new Error("id obrigatório");
    return { id: d.id };
  })
  .handler(async ({ context, data }) => {
    const companyId = await cid(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("message_hsm_template")
      .delete()
      .eq("id", data.id)
      .eq("company_id", companyId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const syncHsmTemplatesFromMeta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { instanceId?: string }) => ({ instanceId: d?.instanceId ?? null }))
  .handler(async ({ context, data }) => {
    if (!data.instanceId) return { ok: false, imported: 0, reason: "Selecione uma conexão." };
    const companyId = await cid(context.supabase, context.userId);
    const { data: inst } = await context.supabase
      .from("whatsapp_instances")
      .select("id,provider_type,waba_id")
      .eq("id", data.instanceId)
      .eq("company_id", companyId)
      .maybeSingle();
    if (!inst) return { ok: false, imported: 0, reason: "Conexão não encontrada." };
    if ((inst as any).provider_type !== "wablast") {
      return { ok: false, imported: 0, reason: "Sincronização automática disponível apenas para conexões WaBlast." };
    }
    if (!(inst as any).waba_id) {
      return { ok: false, imported: 0, reason: "WABA ID ausente — reconecte a conta WaBlast." };
    }
    const { wablastListTemplates } = await import("@/lib/wablast.server");
    let resp: any;
    try { resp = await wablastListTemplates((inst as any).waba_id); }
    catch (e: any) { return { ok: false, imported: 0, reason: e?.message || "Falha ao consultar WaBlast." }; }
    const list: any[] = Array.isArray(resp) ? resp : (resp?.data ?? resp?.templates ?? []);
    let imported = 0;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    for (const t of list) {
      const nome = String(t.name || t.nome || "").toLowerCase();
      if (!SLUG_RE.test(nome)) continue;
      const components: any[] = t.components || [];
      const bodyComp = components.find((c: any) => (c.type || "").toUpperCase() === "BODY");
      const headerComp = components.find((c: any) => (c.type || "").toUpperCase() === "HEADER");
      const footerComp = components.find((c: any) => (c.type || "").toUpperCase() === "FOOTER");
      const buttonsComp = components.find((c: any) => (c.type || "").toUpperCase() === "BUTTONS");
      const statusRaw = String(t.status || "").toUpperCase();
      const status: HsmStatus = statusRaw === "APPROVED" ? "aprovado"
        : statusRaw === "REJECTED" ? "reprovado"
        : statusRaw === "PENDING" ? "pendente" : "rascunho";
      const payload: any = {
        company_id: companyId,
        instance_id: (inst as any).id,
        nome,
        categoria: String(t.category || "MARKETING").toUpperCase(),
        idioma: t.language || "pt_BR",
        header_tipo: headerComp ? (headerComp.format === "TEXT" ? "TEXT" : "MEDIA") : "NONE",
        header_conteudo: headerComp?.text ?? null,
        corpo: bodyComp?.text ?? "",
        rodape: footerComp?.text ?? null,
        botoes: (buttonsComp?.buttons ?? []).map((b: any) => ({
          type: (b.type || "QUICK_REPLY").toUpperCase(),
          texto: b.text ?? "",
          valor: b.url || b.phone_number || undefined,
        })),
        variaveis: {},
        status,
        meta_template_id: t.id ?? null,
      };
      const { data: existing } = await (supabaseAdmin as any)
        .from("message_hsm_template")
        .select("id")
        .eq("company_id", companyId)
        .eq("instance_id", (inst as any).id)
        .eq("nome", nome)
        .maybeSingle();
      const op = existing?.id
        ? (supabaseAdmin as any).from("message_hsm_template").update(payload).eq("id", existing.id)
        : (supabaseAdmin as any).from("message_hsm_template").insert(payload);
      const { error } = await op;
      if (!error) imported++;

    }
    return { ok: true, imported, total: list.length };
  });


export const listApprovedHsmForInstance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { instanceId: string }) => ({ instanceId: d?.instanceId ?? "" }))
  .handler(async ({ context, data }) => {
    if (!data.instanceId) return [];
    const companyId = await cid(context.supabase, context.userId);
    const { data: rows } = await context.supabase
      .from("message_hsm_template")
      .select("id,nome,corpo,categoria,idioma,status")
      .eq("company_id", companyId)
      .eq("instance_id", data.instanceId)
      .eq("status", "aprovado")
      .order("nome");
    return rows ?? [];
  });
