import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  resolveEffectivePermissions,
  hasPermission,
  type GranularPermissionKey,
} from "./permissions";

export type ResolvedUserPermissions = {
  role: "owner" | "admin" | "atendente" | null;
  isSuperAdmin: boolean;
  customRoleId: string | null;
  permissionsOverride: Record<string, any>;
  permissions: Record<string, boolean>;
};

export async function getUserEffectivePermissions(
  _supabase: any,
  companyId: string,
  userId: string,
): Promise<ResolvedUserPermissions> {
  const [{ data: superRow }, { data: cu }] = await Promise.all([
    (supabaseAdmin as any)
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "super_admin")
      .maybeSingle(),
    (supabaseAdmin as any)
      .from("company_user")
      .select("role, ativo, custom_role_id, permissions_override")
      .eq("company_id", companyId)
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  const isSuperAdmin = Boolean(superRow);

  if (!isSuperAdmin && (!cu || cu.ativo === false)) {
    throw new Error("Acesso negado à empresa.");
  }

  let customRolePermissions: Record<string, any> | null = null;
  if (cu?.custom_role_id) {
    const { data: crole } = await (supabaseAdmin as any)
      .from("company_role")
      .select("permissions, ativo")
      .eq("id", cu.custom_role_id)
      .eq("company_id", companyId)
      .maybeSingle();
    if (crole?.ativo !== false && crole?.permissions) {
      customRolePermissions = crole.permissions as Record<string, any>;
    }
  }

  const role = (cu?.role as "owner" | "admin" | "atendente" | null) ?? null;
  const permissionsOverride = (cu?.permissions_override as Record<string, any>) ?? {};
  const permissions = resolveEffectivePermissions({
    role,
    isSuperAdmin,
    customRolePermissions,
    permissionsOverride,
  });

  return {
    role,
    isSuperAdmin,
    customRoleId: cu?.custom_role_id ?? null,
    permissionsOverride,
    permissions,
  };
}

export async function assertPermission(
  supabase: any,
  companyId: string,
  userId: string,
  permissionKey: GranularPermissionKey | string,
  customErrorMsg?: string,
): Promise<ResolvedUserPermissions> {
  const resolved = await getUserEffectivePermissions(supabase, companyId, userId);
  if (!hasPermission(resolved.permissions, permissionKey)) {
    throw new Error(customErrorMsg || "Sem permissão para realizar esta ação");
  }
  return resolved;
}
