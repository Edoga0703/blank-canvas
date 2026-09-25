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
  name: "send_whatsapp_message",
  title: "Enviar mensagem WhatsApp",
  description: "Envia uma mensagem de texto pelo WhatsApp através da instância conectada da empresa do usuário.",
  inputSchema: {
    numero: z.string().min(8).describe("Número do destinatário com DDI+DDD, ex: 5511999999999."),
    texto: z.string().min(1).max(4000).describe("Texto da mensagem."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  
  handler: async ({ numero, texto }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Não autenticado." }], isError: true };
    const client = sb(ctx);
    const { data: inst, error } = await client.from("whatsapp_instances")
      .select("instance_name, status")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    if (!inst?.instance_name) return { content: [{ type: "text", text: "Nenhuma instância do WhatsApp encontrada." }], isError: true };

    const { evoSendText } = await import("@/lib/evolution.server");
    try {
      await evoSendText(inst.instance_name, numero, texto);
      return { content: [{ type: "text", text: `Mensagem enviada para ${numero}.` }], structuredContent: { ok: true } };
    } catch (e: any) {
      return { content: [{ type: "text", text: e?.message || "Falha ao enviar." }], isError: true };
    }
  },
});
