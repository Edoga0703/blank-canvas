// src/lib/automations/registry.server.ts
import { z } from "zod";
import type {
  AutomationNodeDefinition,
  AutomationExecutionContext,
  NodeExecutionResult,
} from "./types";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  acquireWorkflowControl,
  releaseWorkflowControl,
  handoffToHuman,
  handoffToAi,
} from "./conversation-control.server";

const registry = new Map<string, AutomationNodeDefinition>();

export function registerNode(def: AutomationNodeDefinition) {
  const key = `${def.type}@${def.version}`;
  registry.set(key, def);
}

export function getNodeDefinition(type: string, version = 1): AutomationNodeDefinition | undefined {
  return registry.get(`${type}@${version}`) || registry.get(`${type}@1`);
}

export function getAllNodeDefinitions(): AutomationNodeDefinition[] {
  return Array.from(registry.values());
}

/**
 * Reemplaza variables en textos (ej: {{contact.name}}, {{card.nome}}, {{trigger.text}})
 */
export function interpolateVariables(template: string, ctx: Record<string, any>): string {
  if (!template) return "";
  return template.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_, path) => {
    const parts = path.split(".");
    let val: any = ctx;
    for (const p of parts) {
      if (val === undefined || val === null) return "";
      val = val[p];
    }
    return val !== undefined && val !== null ? String(val) : "";
  });
}

// ============================================================================
// 1. DISPARADORES (TRIGGERS)
// ============================================================================

registerNode({
  type: "messaging.inbound_received",
  version: 1,
  category: "trigger",
  name: "Mensaje Entrante",
  description: "Se activa cuando entra un mensaje por una o varias conexiones/canales.",
  icon: "MessageSquare",
  outputPorts: ["next"],
  configSchema: z.object({
    connectionMode: z.enum(["any", "selected"]).default("any"),
    instanceIds: z.array(z.string()).default([]),
    channels: z.array(z.string()).default(["whatsapp", "instagram_dm", "facebook_messenger", "telegram"]),
    keywords: z.array(z.string()).default([]),
    conversationType: z.enum(["all", "direct", "group"]).default("direct"),
  }),
  async execute(ctx, config) {
    if (ctx.externalConversationId) {
      await acquireWorkflowControl({
        companyId: ctx.companyId,
        externalConversationId: ctx.externalConversationId,
        executionId: ctx.executionId,
        instanceId: ctx.sourceInstanceId,
        cardId: ctx.subject?.id,
        leaseMinutes: 120,
      });
    }
    return { kind: "next", port: "next" };
  },
});

registerNode({
  type: "crm.card_stage_changed",
  version: 1,
  category: "trigger",
  name: "Etapa de Lead Modificada",
  description: "Se activa cuando una tarjeta del embudo pasa a una etapa específica.",
  icon: "KanbanSquare",
  outputPorts: ["next"],
  configSchema: z.object({
    pipelineId: z.string().optional().nullable(),
    fromStageId: z.string().optional().nullable(),
    toStageId: z.string().optional().nullable(),
  }),
  async execute(ctx, config) {
    return { kind: "next", port: "next" };
  },
});

registerNode({
  type: "crm.card_owner_changed",
  version: 1,
  category: "trigger",
  name: "Responsable de Lead Modificado",
  description: "Se activa cuando se asigna o reasigna un asesor comercial a la tarjeta.",
  icon: "UserCheck",
  outputPorts: ["next"],
  configSchema: z.object({
    toOwnerId: z.string().optional().nullable(),
  }),
  async execute(ctx, config) {
    return { kind: "next", port: "next" };
  },
});

registerNode({
  type: "crm.card_tags_changed",
  version: 1,
  category: "trigger",
  name: "Etiquetas de Lead Modificadas",
  description: "Se activa cuando se agrega una etiqueta específica a la tarjeta.",
  icon: "Tag",
  outputPorts: ["next"],
  configSchema: z.object({
    tag: z.string().optional().nullable(),
  }),
  async execute(ctx, config) {
    return { kind: "next", port: "next" };
  },
});

registerNode({
  type: "crm.card_created",
  version: 1,
  category: "trigger",
  name: "Lead Creado en Embudo",
  description: "Se activa cuando entra o se crea una nueva tarjeta en el CRM.",
  icon: "UserPlus",
  outputPorts: ["next"],
  configSchema: z.object({
    pipelineId: z.string().optional().nullable(),
    stageId: z.string().optional().nullable(),
  }),
  async execute(ctx, config) {
    return { kind: "next", port: "next" };
  },
});

// ============================================================================
// 2. CONTROL Y CONDICIONES (LOGIC & WAIT)
// ============================================================================

registerNode({
  type: "condition.if_else",
  version: 1,
  category: "condition",
  name: "Bifurcación Si / No",
  description: "Evalúa una condición lógica y continúa por la rama verdadera o falsa.",
  icon: "GitBranch",
  outputPorts: ["true", "false"],
  configSchema: z.object({
    variable: z.string().default("trigger.text"),
    operator: z.enum([
      "contains",
      "not_contains",
      "equals",
      "not_equals",
      "is_empty",
      "is_not_empty",
      "has_tag",
    ]).default("contains"),
    value: z.string().default(""),
  }),
  async execute(ctx, config) {
    const rawVal = interpolateVariables(`{{${config.variable}}}`, ctx.context);
    const target = config.value.trim().toLowerCase();
    const current = rawVal.trim().toLowerCase();

    let passed = false;
    switch (config.operator) {
      case "contains":
        passed = current.includes(target);
        break;
      case "not_contains":
        passed = !current.includes(target);
        break;
      case "equals":
        passed = current === target;
        break;
      case "not_equals":
        passed = current !== target;
        break;
      case "is_empty":
        passed = current.length === 0;
        break;
      case "is_not_empty":
        passed = current.length > 0;
        break;
      case "has_tag":
        const tags = Array.isArray(ctx.context.card?.tags) ? ctx.context.card.tags : [];
        passed = tags.some((t: string) => String(t).toLowerCase() === target);
        break;
    }

    return { kind: "next", port: passed ? "true" : "false" };
  },
});

registerNode({
  type: "control.wait_duration",
  version: 1,
  category: "control",
  name: "Esperar Tiempo",
  description: "Pausa el flujo durante minutos, horas o días antes de continuar.",
  icon: "Clock",
  outputPorts: ["next"],
  configSchema: z.object({
    unit: z.enum(["minutes", "hours", "days"]).default("minutes"),
    amount: z.number().positive().default(10),
  }),
  async execute(ctx, config) {
    let multiplier = 60 * 1000;
    if (config.unit === "hours") multiplier = 60 * 60 * 1000;
    if (config.unit === "days") multiplier = 24 * 60 * 60 * 1000;

    const resumeAt = new Date(Date.now() + config.amount * multiplier).toISOString();
    return {
      kind: "wait",
      resumeAt,
      waitKey: `wait_duration_${ctx.nodeId}`,
    };
  },
});

registerNode({
  type: "messaging.wait_for_reply",
  version: 1,
  category: "control",
  name: "Esperar Respuesta del Contacto",
  description: "Espera a que el contacto responda en la conversación. Si no responde antes del tiempo límite, toma la salida de timeout.",
  icon: "Hourglass",
  outputPorts: ["reply", "timeout"],
  configSchema: z.object({
    timeoutMinutes: z.number().positive().default(120),
  }),
  async execute(ctx, config) {
    const resumeAt = new Date(Date.now() + config.timeoutMinutes * 60 * 1000).toISOString();
    return {
      kind: "wait",
      resumeAt,
      waitKey: `reply_wait_${ctx.externalConversationId || ctx.subject?.id || ctx.nodeId}`,
    };
  },
});

registerNode({
  type: "control.end",
  version: 1,
  category: "control",
  name: "Finalizar Flujo",
  description: "Termina la ejecución de la automatización y libera el control de la conversación.",
  icon: "CheckCircle",
  outputPorts: [],
  configSchema: z.object({}),
  async execute(ctx) {
    if (ctx.externalConversationId) {
      await releaseWorkflowControl({
        companyId: ctx.companyId,
        externalConversationId: ctx.externalConversationId,
        executionId: ctx.executionId,
      });
    }
    return { kind: "finish" };
  },
});

// ============================================================================
// 3. ACCIONES DE MENSAJERÍA Y CRM (ACTIONS)
// ============================================================================

registerNode({
  type: "messaging.send_text",
  version: 1,
  category: "action",
  name: "Enviar Mensaje de Texto",
  description: "Envía un mensaje de texto con variables por WhatsApp, Instagram o Telegram.",
  icon: "Send",
  outputPorts: ["next"],
  configSchema: z.object({
    text: z.string().min(1, "El texto del mensaje no puede estar vacío"),
    connectionPolicy: z.enum(["same_as_trigger", "specific"]).default("same_as_trigger"),
    specificInstanceId: z.string().optional().nullable(),
  }),
  async execute(ctx, config) {
    const interpolated = interpolateVariables(config.text, ctx.context);
    const destination =
      ctx.externalConversationId ||
      ctx.context.trigger?.phone ||
      ctx.context.card?.numero;

    if (!destination) {
      throw new Error("No hay destinatario ni conversación identificada para enviar el mensaje.");
    }

    let targetInstanceId = ctx.sourceInstanceId;
    if (config.connectionPolicy === "specific" && config.specificInstanceId) {
      targetInstanceId = config.specificInstanceId;
    }

    if (config.connectionPolicy === "same_as_trigger" && !targetInstanceId) {
      throw new Error("No se pudo determinar la conexión de origen (same_as_trigger). Configura una conexión específica en el nodo.");
    }

    if (!targetInstanceId) {
      throw new Error("Falta especificar la conexión de envío para este nodo.");
    }

    const { data: instanceRow } = await (supabaseAdmin as any)
      .from("whatsapp_instances")
      .select("id, company_id, instance_name, instance_token, provider, provider_type, phone_number_id, waba_id, status, paused")
      .eq("company_id", ctx.companyId)
      .eq("id", targetInstanceId)
      .maybeSingle();

    if (!instanceRow) {
      throw new Error(`La conexión de envío (${targetInstanceId}) no existe o no pertenece a esta empresa.`);
    }

    // Comprobar que la instancia no esté pausada (H10)
    if (instanceRow.paused) {
      throw new Error(`La conexión ${instanceRow.instance_name || targetInstanceId} está pausada.`);
    }

    const st = String(instanceRow.status || "").toLowerCase();
    if (!["connected", "ativo", "open", "ready"].includes(st)) {
      throw new Error(`La conexión ${instanceRow.instance_name || targetInstanceId} no está conectada (estado: ${instanceRow.status}).`);
    }

    // Validación de compatibilidad entre canal/proveedor y destino (H17)
    const prov = String(instanceRow.provider || "").toLowerCase();
    const isMetaIg = prov.includes("instagram");
    const isMetaFb = prov.includes("messenger");
    const isTelegram = prov.includes("telegram");
    const isWhatsApp = !isMetaIg && !isMetaFb && !isTelegram;

    const channel = String(ctx.sourceChannel || ctx.context.trigger?.channel || "").toLowerCase();
    const compatible = !channel ||
      ((channel === "whatsapp" || channel === "whatsapp_official") && isWhatsApp) ||
      ((channel === "instagram" || channel === "instagram_dm") && isMetaIg) ||
      ((channel === "messenger" || channel === "facebook_messenger") && isMetaFb) ||
      (channel === "telegram" && isTelegram);
    if (!compatible) {
      throw new Error(`La conexión seleccionada no corresponde al canal de origen (${channel}); falta una identidad de contacto para cruzar canales.`);
    }
    if (isWhatsApp && (destination.includes("@") && !destination.includes("@s.whatsapp.net") && !destination.includes("@g.us"))) {
      throw new Error(`El identificador de destinatario "${destination}" no es compatible con el canal WhatsApp.`);
    }

    const { waSendText } = await import("@/lib/wa-dispatch.server");
    const result = await waSendText(instanceRow, destination, interpolated);

    return {
      kind: "next",
      port: "next",
      output: {
        messageId: (result as any)?.id || (result as any)?.key?.id || null,
        instanceId: instanceRow.id,
      },
    };
  },
});

registerNode({
  type: "crm.move_card_to_stage",
  version: 1,
  category: "action",
  name: "Mover Etapa en CRM",
  description: "Mueve el lead hacia otra etapa del embudo de ventas.",
  icon: "ArrowRightLeft",
  outputPorts: ["next"],
  configSchema: z.object({
    stageId: z.string().min(1, "Selecciona la etapa de destino"),
  }),
  async execute(ctx, config) {
    const cardId = ctx.subject?.id || ctx.context.card?.id || ctx.context.trigger?.cardId;
    if (!cardId) {
      throw new Error("No hay tarjeta de lead vinculada a esta ejecución.");
    }

    // Validar que la etapa pertenezca estrictamente a la empresa
    const { data: stageCheck } = await (supabaseAdmin as any)
      .from("crm_stage")
      .select("id")
      .eq("company_id", ctx.companyId)
      .eq("id", config.stageId)
      .maybeSingle();

    if (!stageCheck) {
      throw new Error(`La etapa de destino (${config.stageId}) no pertenece a esta empresa.`);
    }

    const { moveCardToStage } = await import("@/lib/crm-engine.server");
    await moveCardToStage(supabaseAdmin, cardId, config.stageId);

    return { kind: "next", port: "next" };
  },
});

registerNode({
  type: "crm.add_tag",
  version: 1,
  category: "action",
  name: "Añadir Etiqueta",
  description: "Agrega una o más etiquetas al lead.",
  icon: "Tag",
  outputPorts: ["next"],
  configSchema: z.object({
    tag: z.string().min(1, "Escribe el nombre de la etiqueta"),
  }),
  async execute(ctx, config) {
    const cardId = ctx.subject?.id || ctx.context.card?.id || ctx.context.trigger?.cardId;
    if (!cardId) throw new Error("No hay tarjeta de lead vinculada.");

    const { data: card } = await (supabaseAdmin as any)
      .from("crm_cards")
      .select("tags")
      .eq("company_id", ctx.companyId)
      .eq("id", cardId)
      .maybeSingle();

    const prevTags = Array.isArray(card?.tags) ? card.tags : [];
    const newTag = config.tag.trim();
    if (!prevTags.includes(newTag)) {
      await (supabaseAdmin as any)
        .from("crm_cards")
        .update({ tags: [...prevTags, newTag], updated_at: new Date().toISOString() })
        .eq("id", cardId);
    }

    return { kind: "next", port: "next" };
  },
});

registerNode({
  type: "messaging.handoff_to_ai",
  version: 1,
  category: "action",
  name: "Derivar a Agente IA",
  description: "Pasa el control de la conversación al Agente de Inteligencia Artificial para que responda libremente.",
  icon: "Bot",
  outputPorts: ["next"],
  configSchema: z.object({}),
  async execute(ctx) {
    if (ctx.externalConversationId) {
      await handoffToAi({
        companyId: ctx.companyId,
        externalConversationId: ctx.externalConversationId,
      });
    }
    return { kind: "next", port: "next" };
  },
});

registerNode({
  type: "messaging.route_to_human",
  version: 1,
  category: "action",
  name: "Derivar a Asesor Humano",
  description: "Pausa el bot y notifica a los asesores que un cliente requiere atención humana.",
  icon: "UserCheck",
  outputPorts: ["next"],
  configSchema: z.object({
    reason: z.string().default("Cliente solicitó asesor humano"),
  }),
  async execute(ctx, config) {
    if (ctx.externalConversationId) {
      await handoffToHuman({
        companyId: ctx.companyId,
        externalConversationId: ctx.externalConversationId,
        instanceId: ctx.sourceInstanceId || null,
        reason: config.reason,
      });

      // Registrar notificación/evento en el historial del lead
      try {
        const cardId = ctx.subject?.id || ctx.context.card?.id || ctx.context.trigger?.cardId;
        if (cardId) {
          await (supabaseAdmin as any).from("lead_evento").insert({
            company_id: ctx.companyId,
            card_id: cardId,
            tipo: "handoff",
            descricao: `Derivado a atención humana por flujo automático: ${config.reason || "Sin motivo"}`,
          });
        }
      } catch {
        // best-effort
      }

      // Pausar también en contact_pause para consistencia operativa
      try {
        await (supabaseAdmin as any).from("contact_pause").upsert(
          {
            company_id: ctx.companyId,
            numero: ctx.externalConversationId,
            pausado: true,
            pausado_por: "workflow_route_to_human",
            pausado_em: new Date().toISOString(),
          },
          { onConflict: "company_id,numero" }
        );
      } catch {
        // best-effort
      }
    }
    // Finalizar el flujo para que no envíe mensajes automáticos posteriores
    return { kind: "finish" };
  },
});
