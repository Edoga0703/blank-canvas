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
  name: "send_whatsapp_message",
  title: "Enviar mensaje por WhatsApp",
  description: "Envía texto con la conexión activa de WhatsApp (D-API o Lovable) vinculada al proyecto.",
  inputSchema: {
    numero: z.string().min(8).describe("Número con código de país, por ejemplo 5511999999999 o 584121234567."),
    texto: z.string().min(1).max(4000).describe("Texto del mensaje."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },

  handler: async ({ numero, texto }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text" as const, text: "No autenticado." }], isError: true };
    }

    const { data: connection, error } = await sb(ctx)
      .from("whatsapp_instances")
      .select("external_connection_id, instance_name, status, provider")
      .in("provider", ["dapi", "dapi_official"])
      .in("status", ["connected", "open"])
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) return { content: [{ type: "text" as const, text: error.message }], isError: true };
    if (!connection) {
      return {
        content: [{ type: "text" as const, text: "No existe una conexión activa de WhatsApp (D-API / Oficial)." }],
        isError: true,
      };
    }

    try {
      const { getMessagingProvider } = await import("@/lib/messaging/provider-registry.server");
      const provId = "dapi" as const;
      const result = await getMessagingProvider(provId).sendText({
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
