import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Layout base da empresa: quando o usuário ainda não personalizou o painel,
 * ele herda o layout do dono (ou de um admin) da empresa, em vez do padrão.
 */
export const getWorkspaceBaseLayout = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { workspaceId: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: me } = await context.supabase
      .from("company_user")
      .select("role")
      .eq("company_id", data.workspaceId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!me) return null;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: leaders } = await supabaseAdmin
      .from("company_user")
      .select("user_id, role")
      .eq("company_id", data.workspaceId)
      .in("role", ["owner", "admin"]);
    if (!leaders?.length) return null;

    const ids = [...leaders]
      .sort((a, b) => (a.role === "owner" ? -1 : b.role === "owner" ? 1 : 0))
      .map((l) => l.user_id);

    const { data: prefs } = await supabaseAdmin
      .from("dashboard_preferences")
      .select("user_id, widgets, layout_version")
      .eq("workspace_id", data.workspaceId)
      .in("user_id", ids);
    if (!prefs?.length) return null;

    for (const id of ids) {
      const p = prefs.find((x) => x.user_id === id);
      if (p?.widgets && Array.isArray(p.widgets) && p.widgets.length > 0) {
        return { widgets: p.widgets, layout_version: p.layout_version ?? 0 };
      }
    }
    return null;
  });
