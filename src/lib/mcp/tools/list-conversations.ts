import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function sb(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "list_recent_conversations",
  title: "Conversas recentes",
  description: "Lista as últimas conversas do WhatsApp por número, com a mensagem mais recente.",
  inputSchema: {
    limit: z.number().int().min(1).max(50).optional().describe("Quantidade máxima (padrão 15)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Não autenticado." }], isError: true };
    const { data, error } = await sb(ctx).from("mensagens")
      .select("id, numero, direcao, texto, created_at")
      .order("created_at", { ascending: false })
      .limit((limit ?? 15) * 5);
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const seen = new Set<string>();
    const grouped: any[] = [];
    for (const m of data ?? []) {
      if (seen.has(m.numero)) continue;
      seen.add(m.numero);
      grouped.push(m);
      if (grouped.length >= (limit ?? 15)) break;
    }
    return {
      content: [{ type: "text", text: JSON.stringify(grouped, null, 2) }],
      structuredContent: { conversations: grouped },
    };
  },
});
