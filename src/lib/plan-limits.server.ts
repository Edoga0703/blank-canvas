// SERVER ONLY. Usa supabaseAdmin para resolver plano + uso, sem expor chave.
import { PLAN_LABEL, normalizePlanSlug, type PlanSlug } from "./plan-features";

export type LimitKind = "instancias" | "usuarios" | "contatos" | "mensagens";

export type CompanyPlan = {
  slug: PlanSlug;
  nome: string;
  limites: {
    instancias: number;
    usuarios: number;
    contatos: number;
    mensagens: number;
  };
};

export type CompanyUsage = {
  instancias: number;
  usuarios: number;
  contatos: number;
  mensagens: number; // mês corrente
};

function startOfMonthISO(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
}

export async function getCompanyPlan(companyId: string): Promise<CompanyPlan> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // 1) Assinatura ativa/trialing → plano vinculado (+ extras)
  const { data: sub } = await supabaseAdmin
    .from("subscription")
    .select("plan_id, status, extra_usuarios, extra_conexoes, plan:plan(slug, nome, limite_instancias, limite_mensagens, limite_usuarios, limite_contatos)")
    .eq("company_id", companyId)
    .in("status", ["active", "trialing", "past_due"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let row: any = sub?.plan ?? null;
  let extraUsuarios = Number((sub as any)?.extra_usuarios ?? 0);
  let extraConexoes = Number((sub as any)?.extra_conexoes ?? 0);

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

  // 2) Fallback: plano starter ativo
  if (!row) {
    const { data: fallback } = await supabaseAdmin
      .from("plan")
      .select("slug, nome, limite_instancias, limite_mensagens, limite_usuarios, limite_contatos")
      .eq("slug", "starter")
      .maybeSingle();
    row = fallback;
  }

  const slug = normalizePlanSlug(row?.slug);
  return {
    slug,
    nome: row?.nome || PLAN_LABEL[slug],
    limites: {
      instancias: Number(row?.limite_instancias ?? 1) + extraConexoes,
      usuarios: Number(row?.limite_usuarios ?? 1) + extraUsuarios,
      contatos: Number(row?.limite_contatos ?? 1000),
      mensagens: Number(row?.limite_mensagens ?? 1500),
    },
  };
}


export async function getCompanyUsage(companyId: string): Promise<CompanyUsage> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const monthStart = startOfMonthISO();

  const [inst, users, contatos, msgs] = await Promise.all([
    // Canais gratuitos (Meta/Telegram) não consomem o limite de conexões do plano.
    supabaseAdmin
      .from("whatsapp_instances")
      .select("instance_name", { count: "exact", head: true })
      .eq("company_id", companyId)
      .not("provider", "in", '("meta_instagram","meta_messenger","telegram")')
      // Uma tentativa Uazapi que falhou antes de devolver/persistir o token não
      // representa uma conexão e não pode consumir o limite do plano.
      .or("provider.neq.uazapi,instance_token.not.is.null"),
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
    instancias: inst.count ?? 0,
    usuarios: users.count ?? 0,
    contatos: contatos.count ?? 0,
    mensagens: msgs.count ?? 0,
  };
}

export async function getCompanyPlanUsage(companyId: string): Promise<{ plan: CompanyPlan; usage: CompanyUsage }> {
  const [plan, usage] = await Promise.all([getCompanyPlan(companyId), getCompanyUsage(companyId)]);
  return { plan, usage };
}

const LIMIT_MSG: Record<LimitKind, (planName: string, lim: number) => string> = {
  instancias: (p, n) =>
    `Seu plano ${p} permite até ${n} número${n === 1 ? "" : "s"} de WhatsApp. Faça upgrade para conectar mais.`,
  usuarios: (p, n) =>
    `Seu plano ${p} permite até ${n} usuário${n === 1 ? "" : "s"} na equipe. Faça upgrade para adicionar mais.`,
  contatos: (p, n) =>
    `Seu plano ${p} permite até ${n.toLocaleString("pt-BR")} contatos. Faça upgrade para cadastrar mais.`,
  mensagens: (p, n) =>
    `Seu plano ${p} permite até ${n.toLocaleString("pt-BR")} mensagens enviadas por mês. Faça upgrade para continuar respondendo.`,
};

export async function assertWithinLimit(companyId: string, tipo: LimitKind, delta = 1): Promise<void> {
  const { assertCompanyCanWrite } = await import("./billing/access.server");
  await assertCompanyCanWrite(companyId);
  const [plan, usage] = await Promise.all([getCompanyPlan(companyId), getCompanyUsage(companyId)]);
  const limite = plan.limites[tipo];
  const atual = usage[tipo];

  // Se o limite for muito alto (unlimited), não bloqueia.
  if (limite >= 1000000) return;

  if (atual + delta > limite) {
    throw new Error(LIMIT_MSG[tipo](plan.nome, limite));
  }
}

// Sem disparar erro — útil em hot paths (webhook IA) que só pulam a ação.
export async function isWithinLimit(companyId: string, tipo: LimitKind, delta = 1): Promise<boolean> {
  const [plan, usage] = await Promise.all([getCompanyPlan(companyId), getCompanyUsage(companyId)]);
  const limite = plan.limites[tipo];
  if (limite >= 1000000) return true;
  return usage[tipo] + delta <= limite;
}
