import { redirect } from "@tanstack/react-router";
import {
  hasPermission,
  resolveEffectivePermissions,
  type GranularPermissionKey,
} from "./permissions";

/**
 * Central RBAC guard for TanStack Router `beforeLoad`.
 * Redirects `atendente` users to the dashboard — use on any admin-only route.
 *
 * Usage:
 *   beforeLoad: ({ context }) => requireAdmin(context),
 */
export function requireAdmin(context: any) {
  if (context?.isSuperAdmin) return;
  const role = context?.membership?.role;
  if (role === "atendente") {
    throw redirect({ to: "/app/dashboard" });
  }
}

/**
 * Guard granular por permissão para `beforeLoad` nas rotas do `/app`.
 */
export function requirePermission(context: any, permissionKey: GranularPermissionKey) {
  if (context?.isSuperAdmin) return;
  const role = context?.membership?.role;
  if (role === "owner" || role === "admin") return;

  const perms: Record<string, boolean> =
    context?.permissions && typeof context.permissions === "object"
      ? context.permissions
      : resolveEffectivePermissions({
          role,
          isSuperAdmin: Boolean(context?.isSuperAdmin),
          customRolePermissions: context?.membership?.custom_permissions ?? null,
          permissionsOverride: context?.membership?.permissions_override ?? null,
        });

  if (!hasPermission(perms, permissionKey)) {
    throw redirect({ to: "/app/dashboard" });
  }
}
