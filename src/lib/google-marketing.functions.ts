import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveCompanyIdCached } from "./company-cache";

type Servico = "google-analytics" | "google-ads";

function valido(s: string): Servico {
  if (s !== "google-analytics" && s !== "google-ads") throw new Error("Integração não disponível.");
  return s;
}

async function ctx(context: any, servico: Servico) {
  const companyId = await resolveCompanyIdCached(context.supabase, context.userId);
  const { capacidadeAtiva } = await import("@/lib/plugin-gate.server");
  if (!(await capacidadeAtiva(context.supabase, companyId, servico))) {
    throw new Error("Instale este plugin na Loja de Plugins para usar a integração.");
  }
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return { companyId, admin: supabaseAdmin as any };
}

async function origem() {
  const { getRequest } = await import("@tanstack/react-start/server");
  const u = new URL(getRequest().url);
  if (u.host.includes("metrixcrm.com.br")) return "https://metrixcrm.com.br";
  return `${u.protocol}//${u.host}`;
}

export const iniciarGoogleMarketing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { servico: string }) => d)
  .handler(async ({ context, data }) => {
    const servico = valido(data.servico);
    const { companyId } = await ctx(context, servico);
    const { googleClient, ESCOPOS, stateMarketing } = await import("@/lib/google-marketing.server");
    const { id } = googleClient();
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", id);
    url.searchParams.set("redirect_uri", `${await origem()}/api/public/google-marketing-callback`);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
    url.searchParams.set("include_granted_scopes", "true");
    url.searchParams.set("scope", ESCOPOS[servico]);
    url.searchParams.set("state", stateMarketing(companyId, servico));
    return { ok: true as const, url: url.toString() };
  });

export const statusGoogleMarketing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { servico: string }) => d)
  .handler(async ({ context, data }) => {
    const servico = valido(data.servico);
    const { companyId, admin } = await ctx(context, servico);
    const { lerConta } = await import("@/lib/google-marketing.server");
    const conta = await lerConta(admin, companyId, servico);
    return {
      conectado: !!conta,
      email: conta?.email ?? null,
      propertyId: conta?.property_id ?? null,
      propertyNome: conta?.property_nome ?? null,
      customerId: conta?.customer_id ?? null,
      customerNome: conta?.customer_nome ?? null,
      devToken: servico === "google-ads" ? !!process.env["GOOGLE_ADS_DEVELOPER_TOKEN"] : true,
    };
  });

export const desconectarGoogleMarketing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { servico: string }) => d)
  .handler(async ({ context, data }) => {
    const servico = valido(data.servico);
    const { companyId, admin } = await ctx(context, servico);
    await admin.from("integracao_chave").delete().eq("company_id", companyId).eq("servico", servico);
    return { ok: true };
  });

export const listarContasGoogleMarketing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { servico: string }) => d)
  .handler(async ({ context, data }) => {
    const servico = valido(data.servico);
    const { companyId, admin } = await ctx(context, servico);
    const { tokenValido, ga4Propriedades, adsContas } = await import("@/lib/google-marketing.server");
    const auth = await tokenValido(admin, companyId, servico);
    if (!auth) throw new Error("Conecte a conta Google primeiro.");
    const itens = servico === "google-analytics" ? await ga4Propriedades(auth.token) : await adsContas(auth.token);
    return { itens };
  });

export const definirContaGoogleMarketing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { servico: string; id: string; nome: string }) => d)
  .handler(async ({ context, data }) => {
    const servico = valido(data.servico);
    const { companyId, admin } = await ctx(context, servico);
    const { atualizarSelecao } = await import("@/lib/google-marketing.server");
    await atualizarSelecao(
      admin,
      companyId,
      servico,
      servico === "google-analytics"
        ? { property_id: data.id, property_nome: data.nome }
        : { customer_id: data.id, customer_nome: data.nome },
    );
    return { ok: true };
  });

export const relatorioGoogleMarketing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { servico: string; dias?: number }) => d)
  .handler(async ({ context, data }) => {
    const servico = valido(data.servico);
    const { companyId, admin } = await ctx(context, servico);
    const dias = Math.min(Math.max(Number(data.dias ?? 7), 1), 30);
    const { tokenValido, lerConta, ga4Relatorio, adsResumo } = await import("@/lib/google-marketing.server");
    const auth = await tokenValido(admin, companyId, servico);
    if (!auth) throw new Error("Conecte a conta Google primeiro.");
    const conta = (await lerConta(admin, companyId, servico)) ?? {};

    if (servico === "google-analytics") {
      if (!conta.property_id) throw new Error("Escolha a propriedade do Analytics.");
      return { tipo: "analytics" as const, ...(await ga4Relatorio(auth.token, conta.property_id, dias)) };
    }
    if (!conta.customer_id) throw new Error("Escolha a conta do Google Ads.");
    return {
      tipo: "ads" as const,
      ...(await adsResumo(auth.token, conta.customer_id, dias, conta.login_customer_id)),
    };
  });
