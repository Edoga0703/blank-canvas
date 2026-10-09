/**
 * Escopo de visibilidade por usuário.
 *
 * Empresas com `funcoes_individuais` ligado isolam agenda e respostas rápidas:
 * atendente vê só o que é dele; dono e admin continuam vendo tudo.
 */
export type UserScope = {
  role: string;
  isManager: boolean;
  /** true quando o usuário deve ver apenas os próprios registros */
  onlyMine: boolean;
};

export async function getUserScope(
  supabase: any,
  userId: string,
  companyId: string,
): Promise<UserScope> {
  const [{ data: cu }, { data: co }] = await Promise.all([
    supabase.from("company_user").select("role").eq("company_id", companyId).eq("user_id", userId).maybeSingle(),
    supabase.from("company").select("funcoes_individuais").eq("id", companyId).maybeSingle(),
  ]);
  const role = (cu?.role as string) || "atendente";
  const isManager = role === "owner" || role === "admin";
  const individual = !!(co as any)?.funcoes_individuais;
  return { role, isManager, onlyMine: individual && !isManager };
}

/**
 * Prefixo com o nome do atendente.
 * Só vale para contas em modo operacional (`atendimento_operacional`), que foi
 * quem pediu a assinatura; nas demais o atendente nunca assina automaticamente.
 */
export async function assinaturaPrefixo(supabase: any, userId: string, companyId?: string): Promise<string> {
  try {
    let cid = companyId;
    if (!cid) {
      const { data: cu } = await supabase
        .from("company_user")
        .select("company_id")
        .eq("user_id", userId)
        .eq("ativo", true)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      cid = (cu as any)?.company_id;
    }
    if (!cid) return "";

    const { data: co } = await supabase
      .from("company")
      .select("atendimento_operacional")
      .eq("id", cid)
      .maybeSingle();
    if (!(co as any)?.atendimento_operacional) return "";

    const { data } = await supabase
      .from("profiles")
      .select("nome, assinatura_ativa")
      .eq("user_id", userId)
      .maybeSingle();
    if (!data || (data as any).assinatura_ativa === false) return "";
    const nome = String((data as any).nome || "").trim();
    if (!nome) return "";
    return `*${nome.split(" ")[0]}:*\n`;
  } catch {
    return "";
  }
}

export function comAssinatura(prefixo: string, texto: string | null | undefined): string {
  const t = String(texto ?? "");
  if (!prefixo || !t.trim()) return t;
  if (t.startsWith(prefixo)) return t;
  return prefixo + t;
}
