// Tipos / utilitários compartilhados de tenant.
export type CompanyRow = {
  id: string;
  nome: string;
  slug: string;
  primary_color: string;
  logo_url: string | null;
  telefone: string | null;
  status_cobranca: "trial" | "ativo" | "suspenso" | "pendente" | "checkout_pending";
  trial_ate: string;
  onboarding_completed?: boolean | null;
  onboarding_step?: number | null;
  tipo_pessoa?: "pf" | "pj" | null;
  cnpj_cpf?: string | null;
  razao_social?: string | null;
  nome_fantasia?: string | null;
  segmento?: string | null;
  porte?: string | null;
  site?: string | null;
  email_corporativo?: string | null;
  cep?: string | null;
  rua?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  estado?: string | null;
  pais?: string | null;
  financeiro_ativo?: boolean | null;
  financeiro_dias_vencimento_padrao?: number | null;
  selected_plan_slug?: string | null;
  atendimento_operacional?: boolean | null;
  grupos_ativos?: boolean | null;
};

export type Membership = {
  company_id: string;
  role: "owner" | "admin" | "atendente";
  forcar_troca_senha: boolean;
  custom_role_id?: string | null;
  custom_permissions?: Record<string, Record<string, boolean>> | null;
};

export function canTransferConversation(
  membership: Membership | null | undefined,
  isSuperAdmin = false,
): boolean {
  if (isSuperAdmin) return true;
  if (!membership) return false;
  if (membership.role === "owner" || membership.role === "admin") return true;
  const permission = membership.custom_permissions?.conversas?.transfer;
  return permission !== false;
}

export type TenantContext = {
  user: { id: string; email?: string | null };
  company: CompanyRow | null;
  membership: Membership | null;
  isSuperAdmin: boolean;
};

export function trialDaysLeft(trialAte: string): number {
  const end = new Date(trialAte).getTime();
  const ms = end - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

/** Horas de carência (somente leitura) depois que o teste grátis termina. */
export const TRIAL_GRACE_HOURS = 24;

export type AccessState = "ativo" | "trial" | "carencia" | "bloqueado";

export type AccessInfo = {
  state: AccessState;
  /** Dias completos desde o fim do teste (0 quando ainda está no teste). */
  diasDesdeFim: number;
  /** Horas restantes de carência (somente leitura). */
  horasCarencia: number;
  /** Data em que o teste terminou/termina. */
  fimTrial: Date | null;
};

export function getAccessInfo(company: CompanyRow | null): AccessInfo {
  if (!company) return { state: "ativo", diasDesdeFim: 0, horasCarencia: 0, fimTrial: null };

  const status = company.status_cobranca;
  const fimTrial = company.trial_ate ? new Date(company.trial_ate) : null;
  const now = Date.now();
  const fim = fimTrial ? fimTrial.getTime() : 0;
  const diasDesdeFim = fim ? Math.max(0, Math.floor((now - fim) / 86_400_000)) : 0;

  if (status === "ativo") return { state: "ativo", diasDesdeFim: 0, horasCarencia: 0, fimTrial };

  if (status === "trial") {
    if (fim > now) return { state: "trial", diasDesdeFim: 0, horasCarencia: 0, fimTrial };
    const limite = fim + TRIAL_GRACE_HOURS * 3_600_000;
    if (now < limite) {
      return {
        state: "carencia",
        diasDesdeFim,
        horasCarencia: Math.max(1, Math.ceil((limite - now) / 3_600_000)),
        fimTrial,
      };
    }
    return { state: "bloqueado", diasDesdeFim, horasCarencia: 0, fimTrial };
  }

  return { state: "bloqueado", diasDesdeFim, horasCarencia: 0, fimTrial };
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 48) || "empresa";
}
