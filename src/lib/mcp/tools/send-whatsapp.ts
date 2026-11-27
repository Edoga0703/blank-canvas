import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import type { WaInstance } from "@/lib/wa-dispatch.server";

function sb(ctx: ToolContext) {
  const url = process.env.EXTERNAL_SUPABASE_URL || (process.env.SUPABASE_URL && !process.env.SUPABASE_URL.includes("llnfjhqdeeuscyqzoqfz") ? process.env.SUPABASE_URL : "https://supabase.cuentastupana.com");
  const key = process.env.EXTERNAL_SUPABASE_ANON_KEY || (process.env.SUPABASE_PUBLISHABLE_KEY && !process.env.SUPABASE_PUBLISHABLE_KEY.startsWith("sb_publishable_AWtQzPmKl") ? process.env.SUPABASE_PUBLISHABLE_KEY : "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzE5NzkyMDAwLCJleHAiOjIwMzUxNTIwMDB9.zM3xq1Bkafe4-jNNpKDuB4HOpHvVskFxoldZds6raPs");
  return createClient(url, key, {
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
      .select("id, company_id, instance_name, instance_token, status, paused, provider, provider_type, phone_number_id, waba_id")
      .in("provider", ["dapi", "dapi_official"])
      .in("status", ["connected", "open"])
      .or("paused.is.null,paused.eq.false")
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
      const { waSendText } = await import("@/lib/wa-dispatch.server");
      const { extractWhatsappMessageId } = await import("@/lib/whatsapp-helpers");
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

      const prov = connection.provider === "dapi_official" ? ("dapi_official" as const) : ("dapi" as const);
      const waInst: WaInstance = {
        id: connection.id,
        company_id: connection.company_id,
        instance_name: connection.instance_name,
        instance_token: connection.instance_token ?? null,
        provider: prov,
        status: connection.status,
        paused: Boolean(connection.paused),
        phone_number_id: connection.phone_number_id ?? null,
        waba_id: connection.waba_id ?? null,
      };

      const cleanNumero = numero.replace(/\D/g, "");
      const sendRes = await waSendText(waInst, cleanNumero, texto);
      const extMsgId = extractWhatsappMessageId(sendRes) || null;

      await (supabaseAdmin as any).from("mensagens").insert({
        company_id: connection.company_id,
        instance_id: connection.id,
        numero: cleanNumero,
        texto,
        direcao: "saida",
        autor: "humano",
        provider: prov,
        whatsapp_message_id: extMsgId,
        status_envio: "enviado",
        created_at: new Date().toISOString(),
      });

      return {
        content: [{ type: "text" as const, text: `Mensaje enviado a ${numero}.` }],
        structuredContent: { ok: true, messageId: extMsgId, provider: prov, instanceId: connection.id },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo enviar el mensaje.";
      return { content: [{ type: "text" as const, text: message }], isError: true };
    }
  },
});
