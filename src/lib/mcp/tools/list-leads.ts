import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function sb(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL || "https://llnfjhqdeeuscyqzoqfz.supabase.co", process.env.SUPABASE_PUBLISHABLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxsbmZqaHFkZWV1c2N5cXpvcWZ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDMwMzQ1MDQsImV4cCI6MjA1ODYxMDUwNH0.kK-0_T-X_Fq69v-9192y0E4GzK803F_w7N-sF-3_F24", {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "list_leads",
  title: "Listar leads (CRM)",
  description: "Lista os cards do CRM do usuário autenticado, com nome, telefone, valor e estágio.",
  inputSchema: {
    limit: z.number().int().min(1).max(100).optional().describe("Quantidade máxima (padrão 20)."),
    stage_id: z.string().uuid().optional().describe("Filtrar por estágio específico."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit, stage_id }, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Não autenticado." }], isError: true };
    let q = sb(ctx)
      .from("crm_cards")
      .select("id, nome, numero, valor, stage_id, created_at, updated_at")
      .order("updated_at", { ascending: false })
      .limit(limit ?? 20);
    if (stage_id) q = q.eq("stage_id", stage_id);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { leads: data ?? [] },
    };
  },
});
