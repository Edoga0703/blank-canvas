// Per-isolate in-memory cache for the user's active company.
// Cloudflare Workers reuse isolates across requests, so a short TTL cache
// dramatically reduces `company_user` lookups without weakening RLS.

const TTL_MS = 60_000;
const cache = new Map<string, { companyId: string; expiresAt: number }>();

export async function resolveCompanyIdCached(supabase: any, userId: string): Promise<string> {
  const now = Date.now();
  const hit = cache.get(userId);
  if (hit && hit.expiresAt > now) return hit.companyId;

  const { data, error } = await supabase
    .from("company_user")
    .select("company_id")
    .eq("user_id", userId)
    .eq("ativo", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;

  let companyId: string | null = data?.company_id ?? null;

  if (!companyId) {
    const { data: isSuperAdmin, error: roleError } = await supabase.rpc("is_super_admin");
    if (roleError) throw roleError;
    if (isSuperAdmin) {
      const { data: anyCompany, error: companyError } = await supabase
        .from("company")
        .select("id")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (companyError) throw companyError;
      if (anyCompany?.id) companyId = anyCompany.id as string;
    }
  }

  if (!companyId) {
    throw new Error("Você ainda não possui uma empresa. Finalize o onboarding.");
  }

  cache.set(userId, { companyId, expiresAt: now + TTL_MS });
  return companyId;
}

// Resolves the company a request should act on. When the client passes an
// explicit companyId (multi-company users / super admin impersonation), we
// validate access before trusting it; otherwise fall back to the default.
export async function resolveCompanyIdFor(
  supabase: any,
  userId: string,
  requestedCompanyId?: string | null,
): Promise<string> {
  if (requestedCompanyId) {
    const { data: member } = await supabase
      .from("company_user")
      .select("company_id")
      .eq("user_id", userId)
      .eq("company_id", requestedCompanyId)
      .eq("ativo", true)
      .maybeSingle();
    if (member?.company_id) return member.company_id as string;

    const { data: isSuperAdmin } = await supabase.rpc("is_super_admin");
    if (isSuperAdmin) return requestedCompanyId;
  }
  return resolveCompanyIdCached(supabase, userId);
}

export function invalidateCompanyCache(userId?: string) {
  if (userId) cache.delete(userId);
  else cache.clear();
}
