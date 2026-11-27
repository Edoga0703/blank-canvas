// SERVER ONLY. Usa supabaseAdmin para resolver plano + uso, sem expor chave.
import { PLAN_LABEL, normalizePlanFeatures, normalizePlanSlug, type PlanSlug } from "./plan-features";

export type LimitKind = "instancias" | "instancias_oficiais" | "usuarios" | "contatos" | "mensagens";

export type CompanyPlan = {
  slug: PlanSlug;
  nome: string;
  creditos_mensais: number;
  creditos_trial: number;
  modules: Record<string, boolean>;
  limites: {
    instancias: number;
    instancias_oficiais: number;
    usuarios: number;
    contatos: number;
    mensagens: number;
  };
};

export type CompanyUsage = {
  instancias: number; // WhatsApp QR D-API (provider = 'dapi')
  instancias_oficiais: number; // WhatsApp Cloud API Oficial (provider = 'dapi_official')
  usuarios: number;
  contatos: number;
  mensagens: number; // mês corrente
};

function startOfMonthISO(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
}

export async function getCompanyPlan(companyId: string, userId?: string): Promise<CompanyPlan> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // 1) Bypass incondicional si el usuario tiene rol super_admin
  if (userId) {
    const { data: su } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "super_admin")
      .maybeSingle();
    if (su) {
      return {
        slug: "enterprise",
        nome: "Super Admin (Ilimitado)",
        creditos_mensais: 2147483647,
        creditos_trial: 2147483647,
        modules: normalizePlanFeatures(null, "enterprise"),
        limites: {
          instancias: 2147483647,
          instancias_oficiais: 2147483647,
          usuarios: 2147483647,
          contatos: 2147483647,
          mensagens: 2147483647,
        },
      };
    }
  }

  // 2) Assinatura ativa/trialing → plano vinculado (+ extras)
  const [{ data: sub }, { data: comp }] = await Promise.all([
    (supabaseAdmin as any)
      .from("subscription")
      .select(
        "plan_id, status, extra_usuarios, extra_conexoes, extra_conexoes_oficiais, cortesia, plan:plan(slug, nome, limite_instancias, limite_conexoes_oficiais, limite_mensagens, limite_usuarios, limite_contatos, creditos_mensais, creditos_trial, features)",
      )
      .eq("company_id", companyId)
      .in("status", ["active", "trialing", "past_due"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    (supabaseAdmin as any)
      .from("company")
      .select("id, status_cobranca, selected_plan_slug")
      .eq("id", companyId)
      .maybeSingle(),
  ]);

  // Bypass total para empresa con suscripción de cortesía o status de cobro cortesía
  if (sub?.cortesia || (comp as any)?.status_cobranca === "cortesia") {
    return {
      slug: "cortesia",
      nome: "Cortesia Master (Ilimitado)",
      creditos_mensais: 2147483647,
      creditos_trial: 2147483647,
      modules: normalizePlanFeatures(null, "cortesia"),
      limites: {
        instancias: 2147483647,
        instancias_oficiais: 2147483647,
        usuarios: 2147483647,
        contatos: 2147483647,
        mensagens: 2147483647,
      },
    };
  }

  let row: any = sub?.plan ?? null;
  let extraUsuarios = Number((sub as any)?.extra_usuarios ?? 0);
  let extraConexoes = Number((sub as any)?.extra_conexoes ?? 0);
  const extraConexoesOficiais = Number((sub as any)?.extra_conexoes_oficiais ?? 0);

  // Adicionais contratados (usuário extra, conexão extra) ampliam os limites.
  const { data: addonsAtivos } = await supabaseAdmin
    .from("company_addon")
    .select("quantidade, addon_product(concede_usuarios, concede_conexoes)")
    .eq("company_id", companyId)
    .eq("status", "active");
  for (const a of (addonsAtivos ?? []) as any[]) {
    const qtd = Math.max(1, Number(a.quantidade ?? 1));
    extraUsuarios += qtd * Number(a.addon_product?.concede_usuarios ?? 0);
    extraConexoes += qtd * Number(a.addon_product?.concede_conexoes ?? 0);
  }

  // Fallback: plano escolhido no cadastro ou starter
  if (!row) {
    const targetSlug = (comp as any)?.selected_plan_slug || "starter";
    const { data: fallback } = await supabaseAdmin
      .from("plan")
      .select(
        "slug, nome, limite_instancias, limite_conexoes_oficiais, limite_mensagens, limite_usuarios, limite_contatos, creditos_mensais, creditos_trial, features",
      )
      .eq("slug", targetSlug)
      .maybeSingle();
    if (fallback) {
      row = fallback;
    } else {
      const { data: starter } = await supabaseAdmin
        .from("plan")
        .select(
          "slug, nome, limite_instancias, limite_conexoes_oficiais, limite_mensagens, limite_usuarios, limite_contatos, creditos_mensais, creditos_trial, features",
        )
        .eq("slug", "starter")
        .maybeSingle();
      row = starter;
    }
  }

  const slug = normalizePlanSlug(row?.slug);
  const modules = normalizePlanFeatures(row?.features, slug);

  return {
    slug,
    nome: row?.nome || PLAN_LABEL[slug],
    creditos_mensais: Number(row?.creditos_mensais ?? 1500),
    creditos_trial: Number(row?.creditos_trial ?? 300),
    modules,
    limites: {
      instancias: Number(row?.limite_instancias ?? 1) + extraConexoes,
      instancias_oficiais: Number(row?.limite_conexoes_oficiais ?? 10) + extraConexoesOficiais,
      usuarios: Number(row?.limite_usuarios ?? 1) + extraUsuarios,
      contatos: 2147483647,
      mensagens: 2147483647,
    },
  };
}

export async function getCompanyUsage(companyId: string): Promise<CompanyUsage> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const monthStart = startOfMonthISO();

  const [instDapi, instOfficial, users, contatos, msgs] = await Promise.all([
    // WhatsApp QR (D-API) possui custo por linha e consome cota separada
    supabaseAdmin
      .from("whatsapp_instances")
      .select("instance_name", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("provider", "dapi"),
    // WhatsApp Cloud API Oficial Meta (custo $0 de conexão) possui cota própria
    supabaseAdmin
      .from("whatsapp_instances")
      .select("instance_name", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("provider", "dapi_official"),
    supabaseAdmin.from("company_user").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("ativo", true),
    supabaseAdmin.from("crm_cards").select("id", { count: "exact", head: true }).eq("company_id", companyId),
    supabaseAdmin
      .from("mensagens")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("direcao", "saida")
      .gte("created_at", monthStart),
  ]);

  return {
    instancias: instDapi.count ?? 0,
    instancias_oficiais: instOfficial.count ?? 0,
    usuarios: users.count ?? 0,
    contatos: contatos.count ?? 0,
    mensagens: msgs.count ?? 0,
  };
}

export async function getCompanyPlanUsage(companyId: string, userId?: string): Promise<{ plan: CompanyPlan; usage: CompanyUsage }> {
  const [plan, usage] = await Promise.all([getCompanyPlan(companyId, userId), getCompanyUsage(companyId)]);
  return { plan, usage };
}

const LIMIT_MSG: Record<LimitKind, (planName: string, lim: number) => string> = {
  instancias: (p, n) =>
    `Seu plano ${p} permite até ${n} conexão${n === 1 ? "" : "ões"} de WhatsApp QR (D-API). Faça upgrade para conectar mais.`,
  instancias_oficiais: (p, n) =>
    `Seu plano ${p} permite até ${n} conexão${n === 1 ? "" : "ões"} de WhatsApp API Oficial. Faça upgrade para conectar mais.`,
  usuarios: (p, n) =>
    `Seu plano ${p} permite até ${n} usuário${n === 1 ? "" : "s"} na equipe. Faça upgrade para adicionar mais.`,
  contatos: (p, n) =>
    `Seu plano ${p} permite até ${n.toLocaleString("pt-BR")} contatos. Faça upgrade para cadastrar mais.`,
  mensagens: (p, n) =>
    `Seu plano ${p} permite até ${n.toLocaleString("pt-BR")} mensagens enviadas por mês. Faça upgrade para continuar respondendo.`,
};

export async function assertWithinLimit(companyId: string, tipo: LimitKind, delta = 1, userId?: string): Promise<void> {
  // Mensagens e contatos são sempre ilimitados
  if (tipo === "mensagens" || tipo === "contatos") return;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  if (userId) {
    const { data: su } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "super_admin")
      .maybeSingle();
    if (su) return;
  }

  const { assertCompanyCanWrite } = await import("./billing/access.server");
  await assertCompanyCanWrite(companyId);

  const [{ data: comp }, { data: sub }, plan, usage] = await Promise.all([
    supabaseAdmin.from("company").select("status_cobranca").eq("id", companyId).maybeSingle(),
    supabaseAdmin.from("subscription").select("cortesia").eq("company_id", companyId).maybeSingle(),
    getCompanyPlan(companyId),
    getCompanyUsage(companyId),
  ]);

  const isCortesia = Boolean(sub?.cortesia || (comp as any)?.status_cobranca === "cortesia");
  if (isCortesia) return;

  // Proteção de caixa: bloquear criação de linhas WhatsApp QR D-API (pagas) em trials gratuitos quando permite_dapi_trial != true
  if (
    tipo === "instancias" &&
    (comp as any)?.status_cobranca === "trial" &&
    plan.modules?.permite_dapi_trial !== true
  ) {
    throw new Error(
      "No período de teste grátis, você pode conectar WhatsApp API Oficial, Instagram, Facebook, Telegram e testar o Simulador de IA. Para ativar uma conexão WhatsApp QR dedicada (D-API), ative um plano em Configurações → Plano.",
    );
  }

  const limite = plan.limites[tipo];
  const atual = usage[tipo];

  if (limite >= 1000000) return;

  if (atual + delta > limite) {
    throw new Error(LIMIT_MSG[tipo](plan.nome, limite));
  }
}

export async function isWithinLimit(companyId: string, tipo: LimitKind, delta = 1): Promise<boolean> {
  if (tipo === "mensagens" || tipo === "contatos") return true;
  const [plan, usage] = await Promise.all([getCompanyPlan(companyId), getCompanyUsage(companyId)]);
  const limite = plan.limites[tipo];
  if (limite >= 1000000) return true;
  return usage[tipo] + delta <= limite;
}
