import { redirect } from "@tanstack/react-router";

/**
 * Central RBAC guard for TanStack Router `beforeLoad`.
 * Redirects `atendente` users to the dashboard — use on any admin-only route.
 *
 * Usage:
 *   beforeLoad: ({ context }) => requireAdmin(context),
 */
export function requireAdmin(context: any) {
  const role = context?.membership?.role;
  if (role === "atendente") {
    throw redirect({ to: "/app/dashboard" });
  }
}
