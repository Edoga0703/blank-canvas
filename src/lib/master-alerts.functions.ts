import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { collectMasterAlerts, type MasterAlertsResult } from "@/lib/master-alerts.server";

export type { MasterAlert, MasterAlertGroup, MasterAlertLevel, MasterAlertsResult } from "@/lib/master-alerts.server";

export const getMasterAlerts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MasterAlertsResult> => {
    const empty: MasterAlertsResult = {
      checkedAt: new Date().toISOString(),
      alerts: [],
      counts: {
        clientes: { urgent: 0, info: 0 },
        financeiro: { urgent: 0, info: 0 },
        suporte: { urgent: 0, info: 0 },
        sistema: { urgent: 0, info: 0 },
        treinamentos: { urgent: 0, info: 0 },
      },
    };


    try {
      const { data: isSuper } = await context.supabase.rpc("is_super_admin");
      if (!isSuper) return empty;
      return await collectMasterAlerts();
    } catch (error) {
      console.error("[getMasterAlerts]", error);
      return empty;
    }
  });
