import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function sb(ctx: ToolContext) {
  const url = process.env.EXTERNAL_SUPABASE_URL || (process.env.SUPABASE_URL && !process.env.SUPABASE_URL.includes("llnfjhqdeeuscyqzoqfz") ? process.env.SUPABASE_URL : "https://supabase.cuentastupana.com");
  const key = process.env.EXTERNAL_SUPABASE_ANON_KEY || (process.env.SUPABASE_PUBLISHABLE_KEY && !process.env.SUPABASE_PUBLISHABLE_KEY.startsWith("sb_publishable_AWtQzPmKl") ? process.env.SUPABASE_PUBLISHABLE_KEY : "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzE5NzkyMDAwLCJleHAiOjIwMzUxNTIwMDB9.zM3xq1Bkafe4-jNNpKDuB4HOpHvVskFxoldZds6raPs");
  return createClient(url, key, {
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
