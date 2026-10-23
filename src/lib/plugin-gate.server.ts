/**
 * Gate real de plugin, validado no servidor.
 * Módulos que vêm de plugin (Fluxos, Comercial) só respondem se a capacidade
 * estiver liberada para a empresa. Nunca confiar apenas no client.
 */

// Capacidades que nunca podem ser bloqueadas (canais/módulos essenciais).
const SEMPRE_LIBERADAS = new Set<string>([]);

function assinaturaValida(cp: any, gratuito: boolean): boolean {
  if (gratuito) return true;
  if (!cp) return false;
  const now = Date.now();
  const trial = cp.trial_ends_at ? new Date(cp.trial_ends_at).getTime() : 0;
  const periodo = cp.current_period_end ? new Date(cp.current_period_end).getTime() : 0;
  switch (cp.assinatura_status) {
    case "ativa":
      return periodo ? periodo > now : true;
    case "trial":
      return trial > now;
    case "cancelada":
      return Math.max(trial, periodo) > now;
    default:
      return false;
  }
}

export async function capacidadeAtiva(
  supabase: any,
  companyId: string,
  slug: string,
): Promise<boolean> {
  if (SEMPRE_LIBERADAS.has(slug)) return true;
  const { data, error } = await supabase
    .from("company_plugin")
    .select(
      "ativo, instalado, assinatura_status, trial_ends_at, current_period_end, plugin:plugin(slug, capacidade_slug, status, gratuito)",
    )
    .eq("company_id", companyId);
  if (error) return false;
  for (const r of (data ?? []) as any[]) {
    const p = r.plugin;
    if (!p || p.status === "descontinuado") continue;
    if ((p.capacidade_slug ?? p.slug) !== slug) continue;
    if (!r.instalado || !r.ativo) continue;
    if (!assinaturaValida(r, p.gratuito !== false)) continue;
    return true;
  }
  return false;
}

export async function requireCapacidade(supabase: any, companyId: string, slug: string) {
  const ok = await capacidadeAtiva(supabase, companyId, slug);
  if (!ok) {
    throw new Error(
      "Este módulo faz parte de um plugin que não está instalado. Instale-o na Loja de Plugins.",
    );
  }
}
