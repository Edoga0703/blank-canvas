import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveCompanyIdFor } from "@/lib/company-cache";

/**
 * Runs the stage follow-up for a contact after a user changes the card.
 * The Kanban engine stays server-only; the browser only sends the contact
 * number and a company that is validated against the authenticated session.
 */
export const processKanbanReguaForContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId?: string | null; numero: string }) => ({
    companyId: input?.companyId?.trim() || null,
    numero: String(input?.numero || "").trim(),
  }))
  .handler(async ({ context, data }) => {
    if (!data.numero) throw new Error("Número de contato ausente.");

    const companyId = await resolveCompanyIdFor(context.supabase, context.userId, data.companyId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { processKanbanReguaForNumero } = await import("@/lib/kanban-engine.server");
    return processKanbanReguaForNumero(supabaseAdmin, companyId, data.numero);
  });
