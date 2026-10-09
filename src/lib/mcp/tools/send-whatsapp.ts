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
  title: "Enviar mensaje por WhatsApp",
  description: "Envía texto con la conexión oficial de WhatsApp vinculada al proyecto.",
  inputSchema: {
    numero: z.string().min(8).describe("Número con código de país, por ejemplo 584121234567."),
    texto: z.string().min(1).max(4000).describe("Texto del mensaje."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },

  handler: async ({ numero, texto }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text" as const, text: "No autenticado." }], isError: true };
    }

    const { data: connection, error } = await sb(ctx)
      .from("whatsapp_instances")
      .select("external_connection_id, instance_name, status")
      .eq("provider", "lovable_whatsapp")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) return { content: [{ type: "text" as const, text: error.message }], isError: true };
    if (!connection) {
      return {
        content: [{ type: "text" as const, text: "No existe una conexión oficial de WhatsApp." }],
        isError: true,
      };
    }

    try {
      const { getMessagingProvider } = await import("@/lib/messaging/provider-registry.server");
      const result = await getMessagingProvider("lovable_whatsapp").sendText({
        connectionExternalId: connection.external_connection_id || connection.instance_name,
        to: numero.replace(/\D/g, ""),
        text: texto,
      });
      return {
        content: [{ type: "text" as const, text: `Mensaje enviado a ${numero}.` }],
        structuredContent: { ok: true, messageId: result.externalMessageId },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo enviar el mensaje.";
      return { content: [{ type: "text" as const, text: message }], isError: true };
    }
  },
});
