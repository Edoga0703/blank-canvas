// SERVER ONLY. Bloqueia ações de escrita quando o teste grátis terminou
// (carência somente-leitura) ou a conta está suspensa/pendente.
import { TRIAL_GRACE_HOURS } from "@/lib/tenant";

export const READ_ONLY_MSG =
  "Seu período de teste terminou. A conta está em modo somente leitura — ative seu plano em Configurações → Plano para voltar a usar o sistema.";

export async function companyCanWrite(companyId: string): Promise<boolean> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("company")
    .select("status_cobranca, trial_ate")
    .eq("id", companyId)
    .maybeSingle();
  if (!data) return true;
  const status = String((data as any).status_cobranca ?? "");
  if (status === "ativo") return true;
  if (status !== "trial") return false;
  const fim = (data as any).trial_ate ? new Date((data as any).trial_ate).getTime() : 0;
  return fim > Date.now();
}

export async function assertCompanyCanWrite(companyId: string): Promise<void> {
  if (await companyCanWrite(companyId)) return;
  throw new Error(READ_ONLY_MSG);
}

export { TRIAL_GRACE_HOURS };
