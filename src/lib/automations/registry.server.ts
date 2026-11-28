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
import { isWithinBusinessHours, getNextBusinessHoursOpen, type BusinessHours } from "@/lib/business-hours";

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
 * Reemplaza variables en textos (ej: {{contact.name}}, {{card.nome}}, {{trigger.text}}, {{lead_name}}, {{post_id}}, {{author}})
 */
export function interpolateVariables(template: string, ctx: Record<string, any>): string {
  if (!template) return "";

  const leadName =
    ctx.card?.nome ||
    ctx.trigger?.senderName ||
    ctx.trigger?.author ||
    ctx.trigger?.from?.name ||
    ctx.contact?.name ||
    "";
  const author =
    ctx.trigger?.senderName ||
    ctx.trigger?.author ||
    ctx.trigger?.from?.name ||
    ctx.card?.nome ||
    "";
  const postId =
    ctx.trigger?.postId ||
    ctx.trigger?.post_id ||
    ctx.trigger?.initial_post_id ||
    ctx.card?.campos_extras?.initial_post_id ||
    "";
  const commentId =
    ctx.trigger?.commentId ||
    ctx.trigger?.comment_id ||
    ctx.trigger?.id ||
    ctx.card?.campos_extras?.initial_comment_id ||
    "";
  const senderId =
    ctx.trigger?.senderId ||
    ctx.trigger?.sender_id ||
    ctx.trigger?.from?.id ||
    ctx.card?.numero ||
    "";

  const lastReplyText = ctx.lastReply?.text || ctx.last_reply?.text || "";
  const aliases: Record<string, string> = {
    lead_name: leadName,
    "lead.name": leadName,
    leadname: leadName,
    nome: leadName,
    "contact.name": leadName,
    "contact.nome": leadName,
    "contact.phone": senderId,
    "contact.telefone": senderId,
    "contact.email": ctx.card?.email || "",
    "card.titulo": leadName,
    "card.nome": leadName,
    "card.numero": ctx.card?.numero || senderId,
    "card.email": ctx.card?.email || "",
    "card.valor": ctx.card?.valor != null ? String(ctx.card.valor) : "",
    "trigger.text": ctx.trigger?.text || "",
    "trigger.sender_id": senderId,
    "last_reply.text": lastReplyText,
    "lastreply.text": lastReplyText,
    author,
    autor: author,
    post_id: postId,
    postid: postId,
    comment_id: commentId,
    commentid: commentId,
    sender_id: senderId,
    senderid: senderId,
    text: ctx.trigger?.text || "",
    message: ctx.trigger?.text || "",
  };

  return template.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_, path) => {
    const key = path.toLowerCase().trim();
    if (key in aliases) {
      return aliases[key];
    }
    const parts = path.split(".");
    let val: any = ctx;
    for (const p of parts) {
      if (val === undefined || val === null) return "";
      val = val[p];
    }
    return val !== undefined && val !== null ? String(val) : "";
  });
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function resolveValidCardId(ctx: AutomationExecutionContext): string | null {
  const candidates = [
    ctx.context?.card?.id,
    ctx.context?.trigger?.cardId,
    ctx.subject?.type === "crm_card" ? ctx.subject.id : null,
    ctx.subject?.id,
  ];
  for (const c of candidates) {
    if (c && UUID_REGEX.test(String(c))) return String(c);
  }
  return null;
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
      case "has_tag": {
        const tags = Array.isArray(ctx.context.card?.tags) ? ctx.context.card.tags : [];
        passed = tags.some((t: string) => String(t).toLowerCase() === target);
        break;
      }
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
// HELPERS REUTILIZABLES DE MENSAJERÍA Y VALIDACIÓN
// ============================================================================

export interface ResolvedMessagingTarget {
  destination: string;
  instanceRow: any;
  isWhatsApp: boolean;
  isMetaIg: boolean;
  isMetaFb: boolean;
  isTelegram: boolean;
}

/**
 * Resuelve el destinatario, la conexión activa, comprueba permisos y compatibilidad de canal
 */
export async function resolveMessagingTarget(
  ctx: AutomationExecutionContext,
  config?: { connectionPolicy?: "same_as_trigger" | "specific"; specificInstanceId?: string | null },
): Promise<ResolvedMessagingTarget> {
  const destination =
    ctx.externalConversationId ||
    ctx.context.trigger?.phone ||
    ctx.context.card?.numero ||
    ctx.context.trigger?.from?.id;

  if (!destination) {
    throw new Error("No hay destinatario ni conversación identificada para enviar el mensaje.");
  }

  let targetInstanceId = ctx.sourceInstanceId;
  if (config?.connectionPolicy === "specific" && config.specificInstanceId) {
    targetInstanceId = config.specificInstanceId;
  }

  if (!targetInstanceId) {
    const channel = String(
      ctx.sourceChannel ||
      ctx.context.trigger?.channel ||
      ctx.context.card?.canal_chat ||
      ""
    ).toLowerCase();

    // P1: Si hay canal identificado (Instagram, Telegram, Messenger), busca conexión de ese canal
    if (channel && channel !== "whatsapp") {
      let provPattern = channel;
      if (channel.includes("instagram")) provPattern = "instagram";
      else if (channel.includes("messenger")) provPattern = "messenger";
      else if (channel.includes("telegram")) provPattern = "telegram";

      const { data: instCandidate } = await (supabaseAdmin as any)
        .from("whatsapp_instances")
        .select("id, instance_name")
        .eq("company_id", ctx.companyId)
        .ilike("provider", `%${provPattern}%`)
        .in("status", ["connected", "ativo", "open", "ready"])
        .limit(1)
        .maybeSingle();

      if (instCandidate) {
        targetInstanceId = instCandidate.id;
      } else {
        throw new Error(
          `Não foi encontrada conexão ativa compatível com o canal do contato (${channel}). O envio automático não converterá o canal em WhatsApp silenciosamente.`
        );
      }
    }

    if (!targetInstanceId) {
      const { getActiveInstance } = await import("@/lib/wa-dispatch.server");
      const activeInst = await getActiveInstance(ctx.companyId).catch(() => null);
      if (activeInst) {
        targetInstanceId = (activeInst as any).id || activeInst.instance_name;
      }
    }
  }

  if (!targetInstanceId) {
    throw new Error("No se pudo determinar una conexión válida para el envío.");
  }

  const { data: instanceRow } = await (supabaseAdmin as any)
    .from("whatsapp_instances")
    .select("id, company_id, instance_name, instance_token, provider, provider_type, phone_number_id, waba_id, status, paused")
    .eq("company_id", ctx.companyId)
    .or(`id.eq.${targetInstanceId},instance_name.eq.${targetInstanceId}`)
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
  const compatible =
    !channel ||
    ((channel === "whatsapp" || channel === "whatsapp_official") && isWhatsApp) ||
    ((channel === "instagram" || channel === "instagram_dm") && isMetaIg) ||
    ((channel === "messenger" || channel === "facebook_messenger") && isMetaFb) ||
    (channel === "telegram" && isTelegram);

  if (!compatible) {
    throw new Error(`La conexión seleccionada no corresponde al canal de origen (${channel}); falta una identidad de contacto para cruzar canales.`);
  }
  if (isWhatsApp && destination.includes("@") && !destination.includes("@s.whatsapp.net") && !destination.includes("@g.us")) {
    throw new Error(`El identificador de destinatario "${destination}" no es compatible con el canal WhatsApp.`);
  }

  return {
    destination,
    instanceRow,
    isWhatsApp,
    isMetaIg,
    isMetaFb,
    isTelegram,
  };
}

/**
 * Normaliza texto eliminando acentos y espacios extras
 */
export function normalizeKeywordText(text: string): string {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Coincidencia de opción interactiva por número de orden, ID exacto o texto de etiqueta
 */
export function matchInteractiveOption(
  rawText: string,
  options: Array<{ id: string; label: string }>,
): { id: string; label: string } | null {
  if (!rawText || !Array.isArray(options) || options.length === 0) return null;
  const clean = normalizeKeywordText(rawText);

  // 1. Por número de orden exacto ("1", "2", etc.)
  const numericMatch = clean.match(/^(\d+)\.?$/);
  if (numericMatch) {
    const idx = parseInt(numericMatch[1], 10) - 1;
    if (idx >= 0 && idx < options.length) {
      return options[idx];
    }
  }

  // 2. Por ID exacto ("opt_1", "opt_2", etc.)
  const byId = options.find((o) => normalizeKeywordText(o.id) === clean);
  if (byId) return byId;

  // 3. Por coincidencia exacta de la etiqueta (label)
  const byExactLabel = options.find((o) => normalizeKeywordText(o.label) === clean);
  if (byExactLabel) return byExactLabel;

  // 4. Coincidencia si una sola opción contiene o es contenida por el texto
  const partials = options.filter((o) => {
    const norm = normalizeKeywordText(o.label);
    return norm.includes(clean) || clean.includes(norm);
  });
  if (partials.length === 1) return partials[0];

  return null;
}

/**
 * Valida y transforma datos capturados según el tipo esperado
 */
export function validateAndParseCollectedInput(
  rawText: string,
  type: "text" | "email" | "phone" | "number" | "currency" | "date",
): { valid: boolean; value?: string | number } {
  const text = String(rawText || "").trim();
  if (!text) return { valid: false };

  if (type === "text") {
    return { valid: true, value: text };
  }

  if (type === "email") {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;
    const match = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    if (match && emailRegex.test(match[0])) {
      return { valid: true, value: match[0].toLowerCase() };
    }
    return { valid: false };
  }

  if (type === "phone") {
    const digits = text.replace(/\D/g, "");
    if (digits.length >= 10 && digits.length <= 15) {
      return { valid: true, value: digits };
    }
    return { valid: false };
  }

  if (type === "number" || type === "currency") {
    // Manejar formato "R$ 1.500,50" o "1500.50"
    const cleaned = text
      .replace(/[R$\s]/gi, "")
      .replace(/\.(?=\d{3}(,|$))/g, "")
      .replace(",", ".");
    const num = Number(cleaned);
    if (Number.isFinite(num)) {
      return { valid: true, value: num };
    }
    return { valid: false };
  }

  if (type === "date") {
    // Soporta DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD
    const dmy = text.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
    if (dmy) {
      const day = parseInt(dmy[1], 10);
      const month = parseInt(dmy[2], 10);
      const year = parseInt(dmy[3], 10);
      const d = new Date(Date.UTC(year, month - 1, day));
      if (d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day) {
        return {
          valid: true,
          value: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
        };
      }
    }
    const ymd = text.match(/^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})$/);
    if (ymd) {
      const year = parseInt(ymd[1], 10);
      const month = parseInt(ymd[2], 10);
      const day = parseInt(ymd[3], 10);
      const d = new Date(Date.UTC(year, month - 1, day));
      if (d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day) {
        return {
          valid: true,
          value: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
        };
      }
    }
    return { valid: false };
  }

  return { valid: true, value: text };
}

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
    const target = await resolveMessagingTarget(ctx, config);

    const { waSendText } = await import("@/lib/wa-dispatch.server");
    const result = await waSendText(target.instanceRow, target.destination, interpolated);

    return {
      kind: "next",
      port: "next",
      output: {
        messageId: (result as any)?.id || (result as any)?.key?.id || null,
        instanceId: target.instanceRow.id,
      },
    };
  },
});

// 2.1: messaging.send_media
registerNode({
  type: "messaging.send_media",
  version: 1,
  category: "action",
  name: "Enviar Mídia / Arquivo",
  description: "Envia imagem, vídeo, áudio ou PDF (R2 ou URL pública) com legenda opcional.",
  icon: "Image",
  outputPorts: ["next"],
  configSchema: z.object({
    mediaType: z.enum(["image", "video", "audio", "document"]).default("image"),
    mediaUrl: z.string().min(1, "Informe a URL ou faça upload do arquivo"),
    caption: z.string().optional().default(""),
    fileName: z.string().optional().nullable(),
    connectionPolicy: z.enum(["same_as_trigger", "specific"]).default("same_as_trigger"),
    specificInstanceId: z.string().optional().nullable(),
  }),
  async execute(ctx, config) {
    const target = await resolveMessagingTarget(ctx, config);
    const caption = config.caption ? interpolateVariables(config.caption, ctx.context) : "";

    const { waSendMedia, waSendAudio } = await import("@/lib/wa-dispatch.server");
    let result: any = null;
    if (config.mediaType === "audio") {
      result = await waSendAudio(target.instanceRow, target.destination, config.mediaUrl);
    } else {
      result = await waSendMedia(target.instanceRow, target.destination, {
        url: config.mediaUrl,
        type: config.mediaType,
        caption: caption || undefined,
        fileName: config.fileName || undefined,
      });
    }

    return {
      kind: "next",
      port: "next",
      output: {
        messageId: (result as any)?.id || (result as any)?.key?.id || null,
        mediaType: config.mediaType,
        instanceId: target.instanceRow.id,
      },
    };
  },
});

// 2.2: messaging.send_interactive
const InteractiveOptionSchema = z.object({
  id: z.string().min(1),
  label: z.string().trim().min(1, "Texto da opção obrigatório").max(24, "Máximo 24 caracteres"),
});

registerNode({
  type: "messaging.send_interactive",
  version: 1,
  category: "control",
  name: "Menu / Botões Interativos",
  description: "Envia opções clicáveis ou menu numerado e direciona cada escolha para um ramo diferente.",
  icon: "ListChecks",
  outputPorts: ["opt_1", "opt_2", "opt_3", "opt_4", "opt_5", "fallback", "timeout"],
  resolveOutputPorts(config: any) {
    const optIds = Array.isArray(config?.options) ? config.options.map((o: any) => String(o.id)) : [];
    return [...optIds, "fallback", "timeout"];
  },
  configSchema: z.object({
    bodyText: z.string().min(1, "Escreva a mensagem do menu"),
    footerText: z.string().optional().default(""),
    options: z.array(InteractiveOptionSchema).min(1, "Adicione ao menos 1 opção").max(5, "Máximo 5 opções"),
    timeoutMinutes: z.number().positive().default(60),
    maxInvalidRetries: z.number().int().min(0).max(3).default(1),
    maxRetries: z.number().int().min(0).max(5).optional(),
    invalidReplyText: z.string().optional().default("Não entendi sua resposta. Responda com o número ou texto de uma das opções acima."),
    repromptText: z.string().optional(),
    connectionPolicy: z.enum(["same_as_trigger", "specific"]).default("same_as_trigger"),
    specificInstanceId: z.string().optional().nullable(),
  }),
  async execute(ctx, config) {
    const target = await resolveMessagingTarget(ctx, config);
    const body = interpolateVariables(config.bodyText, ctx.context);
    const footer = config.footerText ? interpolateVariables(config.footerText, ctx.context) : "";
    const options = config.options.map((o: any) => ({
      ...o,
      label: interpolateVariables(o.label, ctx.context),
    }));

    // Tentativa de botões nativos quando WhatsApp D-API e <= 3 opções
    let sentNative = false;
    if (target.isWhatsApp && options.length <= 3 && target.instanceRow.instance_name) {
      try {
        const { dapiSendButtons } = await import("@/lib/dapi.server");
        await dapiSendButtons(
          target.instanceRow.instance_name,
          target.destination,
          {
            body,
            footer: footer || undefined,
            buttons: options.map((opt: any) => ({
              type: "quick_reply",
              title: opt.label,
              id: opt.id,
            })),
          },
          target.instanceRow.instance_token
        );
        sentNative = true;
      } catch (err: any) {
        console.warn("[messaging.send_interactive] Falha no envio de botões nativos, usando menu formatado:", err?.message);
      }
    }

    if (!sentNative) {
      // Menu numerado limpo e universal para todos os canais (WhatsApp, IG, Messenger, Telegram)
      const formattedMenu = `${body}\n\n${options.map((o: any, i: number) => `${i + 1}. ${o.label}`).join("\n")}${footer ? `\n\n_${footer}_` : ""}`;
      const { waSendText } = await import("@/lib/wa-dispatch.server");
      await waSendText(target.instanceRow, target.destination, formattedMenu);
    }

    return {
      kind: "wait",
      resumeAt: new Date(Date.now() + config.timeoutMinutes * 60_000).toISOString(),
      waitKey: `interactive_${ctx.nodeId}`,
    };
  },
});

// 2.3: messaging.collect_input
registerNode({
  type: "messaging.collect_input",
  version: 1,
  category: "control",
  name: "Capturar Dado do Lead",
  description: "Faz uma pergunta, valida o formato (email, telefone, número, data ou texto) e salva direto no CRM.",
  icon: "FormInput",
  outputPorts: ["valid", "invalid", "timeout"],
  configSchema: z.object({
    promptText: z.string().min(1, "Escreva a pergunta a enviar"),
    validationType: z.enum(["text", "email", "phone", "number", "currency", "date"]).default("text"),
    targetField: z.enum(["nome", "email", "telefone", "valor", "custom"]).default("custom"),
    customFieldKey: z.string().optional().default(""),
    invalidMessage: z.string().optional().default("Formato inválido. Por favor, informe novamente."),
    maxRetries: z.number().int().min(0).max(5).default(2),
    timeoutMinutes: z.number().positive().default(60),
    connectionPolicy: z.enum(["same_as_trigger", "specific"]).default("same_as_trigger"),
    specificInstanceId: z.string().optional().nullable(),
  }),
  async execute(ctx, config) {
    const target = await resolveMessagingTarget(ctx, config);
    const prompt = interpolateVariables(config.promptText, ctx.context);

    const { waSendText } = await import("@/lib/wa-dispatch.server");
    await waSendText(target.instanceRow, target.destination, prompt);

    return {
      kind: "wait",
      resumeAt: new Date(Date.now() + config.timeoutMinutes * 60_000).toISOString(),
      waitKey: `collect_${ctx.nodeId}`,
    };
  },
});

// 2.4: messaging.send_template
registerNode({
  type: "messaging.send_template",
  version: 1,
  category: "action",
  name: "Enviar Template WhatsApp (HSM)",
  description: "Dispara modelo aprovado pela Meta para reativar conversas fora da janela de 24h.",
  icon: "FileCheck2",
  outputPorts: ["next"],
  configSchema: z.object({
    templateName: z.string().trim().min(1, "Informe o nome do template aprovado"),
    languageCode: z.string().trim().min(2).default("pt_BR"),
    bodyParams: z.array(z.string()).default([]),
    bodyParameters: z.array(z.string()).optional(),
    headerMediaUrl: z.string().optional().nullable(),
    connectionPolicy: z.enum(["same_as_trigger", "specific"]).default("same_as_trigger"),
    specificInstanceId: z.string().optional().nullable(),
  }),
  async execute(ctx, config) {
    const target = await resolveMessagingTarget(ctx, config);
    if (!target.isWhatsApp) {
      throw new Error("Templates oficiais da Meta (HSM) só podem ser enviados através de conexões de WhatsApp.");
    }

    const rawParams = (config.bodyParams?.length ? config.bodyParams : (config as any).bodyParameters) || [];
    const interpolatedParams = rawParams.map((p: string) => interpolateVariables(p, ctx.context));
    const components: any[] = [];

    if (config.headerMediaUrl) {
      components.push({
        type: "header",
        parameters: [
          {
            type: "image",
            image: { link: config.headerMediaUrl },
          },
        ],
      });
    }

    if (interpolatedParams.length > 0) {
      components.push({
        type: "body",
        parameters: interpolatedParams.map((text: string) => ({
          type: "text",
          text,
        })),
      });
    }

    const { waSendTemplate } = await import("@/lib/wa-dispatch.server");
    const result = await waSendTemplate(target.instanceRow, target.destination, {
      name: config.templateName,
      language: config.languageCode,
      components: components.length > 0 ? components : undefined,
    });

    return {
      kind: "next",
      port: "next",
      output: {
        messageId: (result as any)?.id || (result as any)?.key?.id || null,
        templateName: config.templateName,
        instanceId: target.instanceRow.id,
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
    const cardId = resolveValidCardId(ctx);
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
    const cardId = resolveValidCardId(ctx);
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
      const { error: upErr } = await (supabaseAdmin as any)
        .from("crm_cards")
        .update({ tags: [...prevTags, newTag], updated_at: new Date().toISOString() })
        .eq("id", cardId)
        .eq("company_id", ctx.companyId);

      if (upErr) {
        throw new Error(`Falha ao adicionar etiqueta no CRM: ${upErr.message}`);
      }
    }

    return { kind: "next", port: "next" };
  },
});

registerNode({
  type: "crm.remove_tag",
  version: 1,
  category: "action",
  name: "Remover Etiqueta",
  description: "Elimina una etiqueta del lead en el CRM.",
  icon: "Tag",
  outputPorts: ["next"],
  configSchema: z.object({
    tag: z.string().min(1, "Escribe el nombre de la etiqueta"),
  }),
  async execute(ctx, config) {
    const cardId = resolveValidCardId(ctx);
    if (!cardId) throw new Error("No hay tarjeta de lead vinculada.");

    const { data: card } = await (supabaseAdmin as any)
      .from("crm_cards")
      .select("tags")
      .eq("company_id", ctx.companyId)
      .eq("id", cardId)
      .maybeSingle();

    const prevTags = Array.isArray(card?.tags) ? card.tags : [];
    const targetTag = config.tag.trim();
    const newTags = prevTags.filter((t: string) => t !== targetTag);

    if (newTags.length !== prevTags.length) {
      const { error: upErr } = await (supabaseAdmin as any)
        .from("crm_cards")
        .update({ tags: newTags, updated_at: new Date().toISOString() })
        .eq("id", cardId)
        .eq("company_id", ctx.companyId);

      if (upErr) throw new Error(`Falha ao remover etiqueta no CRM: ${upErr.message}`);
    }

    return { kind: "next", port: "next" };
  },
});

registerNode({
  type: "crm.assign_card",
  version: 1,
  category: "action",
  name: "Atribuir Responsável",
  description: "Asigna un asesor comercial específico a la tarjeta del lead.",
  icon: "UserCheck",
  outputPorts: ["next"],
  configSchema: z.object({
    ownerId: z.string().min(1, "Selecciona el responsable"),
  }),
  async execute(ctx, config) {
    const cardId = resolveValidCardId(ctx);
    if (!cardId) throw new Error("No hay tarjeta de lead vinculada.");

    const { error: upErr } = await (supabaseAdmin as any)
      .from("crm_cards")
      .update({ owner_id: config.ownerId, updated_at: new Date().toISOString() })
      .eq("id", cardId)
      .eq("company_id", ctx.companyId);

    if (upErr) throw new Error(`Falha ao atribuir responsável no CRM: ${upErr.message}`);

    return { kind: "next", port: "next" };
  },
});

registerNode({
  type: "crm.move_card_stage",
  version: 1,
  category: "action",
  name: "Mover Etapa en CRM",
  description: "Mueve el lead hacia otra etapa del embudo de ventas (alias).",
  icon: "ArrowRightLeft",
  outputPorts: ["next"],
  configSchema: z.object({
    stageId: z.string().min(1, "Selecciona la etapa de destino"),
  }),
  async execute(ctx, config) {
    const cardId = resolveValidCardId(ctx);
    if (!cardId) throw new Error("No hay tarjeta de lead vinculada.");

    const { data: stageCheck } = await (supabaseAdmin as any)
      .from("crm_stage")
      .select("id")
      .eq("company_id", ctx.companyId)
      .eq("id", config.stageId)
      .maybeSingle();

    if (!stageCheck) throw new Error(`La etapa de destino (${config.stageId}) no pertenece a esta empresa.`);

    const { moveCardToStage } = await import("@/lib/crm-engine.server");
    await moveCardToStage(supabaseAdmin, cardId, config.stageId);

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
        instanceId: ctx.sourceInstanceId || null,
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
  outputPorts: [], // Nodo terminal sin salidas
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
        const cardId = resolveValidCardId(ctx);
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

// ============================================================================
// 4. NODOS ESPECÍFICOS DE TELEGRAM (FASE 5)
// ============================================================================

// Trigger 1: telegram.business_message_received
registerNode({
  type: "telegram.business_message_received",
  version: 1,
  category: "trigger",
  name: "Telegram: Mensagem Recebida",
  description: "Dispara quando um cliente envia mensagem para o Telegram Business oficial da empresa.",
  icon: "Send",
  outputPorts: ["next"],
  configSchema: z.object({
    connectionMode: z.enum(["any", "selected"]).default("any"),
    instanceIds: z.array(z.string()).default([]),
    keywords: z.array(z.string()).default([]),
    conversationType: z.enum(["all", "direct", "group"]).default("direct"),
  }),
  async execute(ctx) {
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

// Trigger 2: telegram.channel_post_published
registerNode({
  type: "telegram.channel_post_published",
  version: 1,
  category: "trigger",
  name: "Telegram: Publicação no Canal",
  description: "Dispara quando uma nova publicação ou álbum é emitido no canal oficial de Telegram.",
  icon: "Radio",
  outputPorts: ["next"],
  configSchema: z.object({
    channelId: z.string().optional().nullable(),
    postFormat: z.enum(["all", "photo", "video", "text", "carousel"]).default("all"),
  }),
  async execute() {
    return { kind: "next", port: "next" };
  },
});

// Trigger 3: telegram.channel_comment_received
registerNode({
  type: "telegram.channel_comment_received",
  version: 1,
  category: "trigger",
  name: "Telegram: Comentário no Canal",
  description: "Dispara quando um seguidor comenta em uma publicação do canal de Telegram.",
  icon: "MessageCircle",
  outputPorts: ["next"],
  configSchema: z.object({
    channelId: z.string().optional().nullable(),
    keywords: z.array(z.string()).default([]),
  }),
  async execute() {
    return { kind: "next", port: "next" };
  },
});

// Action 1: telegram.send_business_reply
registerNode({
  type: "telegram.send_business_reply",
  version: 1,
  category: "action",
  name: "Telegram: Responder em Business",
  description: "Envia uma resposta oficial ao cliente através da conexão de Telegram Business.",
  icon: "Send",
  outputPorts: ["next"],
  configSchema: z.object({
    text: z.string().min(1, "O texto da mensagem é obrigatório"),
  }),
  async execute(ctx, config) {
    const interpolated = interpolateVariables(config.text, ctx.context);
    const destination =
      ctx.externalConversationId ||
      ctx.context.trigger?.phone ||
      ctx.context.card?.numero;

    if (!destination) {
      throw new Error("Destinatário ou conversa do Telegram não encontrada no contexto de execução.");
    }

    // Buscar a conexão de Telegram Business da empresa
    const { data: instanceRow } = await (supabaseAdmin as any)
      .from("whatsapp_instances")
      .select("id, company_id, instance_name, instance_token, provider, status, paused")
      .eq("company_id", ctx.companyId)
      .ilike("provider", "%telegram%")
      .in("status", ["connected", "ativo", "open", "ready"])
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!instanceRow) {
      throw new Error("Nenhuma conexão de Telegram Business ativa encontrada para enviar a resposta.");
    }

    if (instanceRow.paused) {
      throw new Error(`A conexão de Telegram ${instanceRow.instance_name} está pausada.`);
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

// Action 2: telegram.publish_to_channel
registerNode({
  type: "telegram.publish_to_channel",
  version: 1,
  category: "action",
  name: "Telegram: Publicar no Canal",
  description: "Publica comunicado, texto ou imagem no canal oficial de Telegram via MTProto Sidecar.",
  icon: "Share2",
  outputPorts: ["next"],
  configSchema: z.object({
    channelId: z.string().optional().nullable(),
    text: z.string().min(1, "O conteúdo da publicação é obrigatório"),
    mediaUrl: z.string().optional().nullable(),
    mediaType: z.enum(["text", "photo", "video"]).default("text"),
    pinMessage: z.boolean().default(false),
  }),
  async execute(ctx, config) {
    const interpolatedText = interpolateVariables(config.text, ctx.context);
    let targetChannelId = config.channelId;

    if (!targetChannelId) {
      const { data: acc } = await (supabaseAdmin as any)
        .from("meta_social_accounts")
        .select("external_id")
        .eq("company_id", ctx.companyId)
        .eq("network", "telegram")
        .limit(1)
        .maybeSingle();
      targetChannelId = acc?.external_id || "";
    }

    if (!targetChannelId) {
      const { data: tch } = await (supabaseAdmin as any)
        .from("telegram_channels")
        .select("telegram_channel_id")
        .eq("company_id", ctx.companyId)
        .limit(1)
        .maybeSingle();
      targetChannelId = tch?.telegram_channel_id || "";
    }

    if (!targetChannelId) {
      return {
        kind: "next",
        port: "error",
        output: { error: "Nenhum canal Telegram configurado ou vinculado nesta empresa." },
      };
    }

    const { publishToTelegramChannel } = await import("@/lib/telegram/mtproto-client.server");
    const { data: conn } = await (supabaseAdmin as any)
      .from("telegram_connections")
      .select("id")
      .eq("company_id", ctx.companyId)
      .eq("transport", "mtproto_account")
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!conn?.id) {
      return {
        kind: "next",
        port: "error",
        output: { error: "Nenhuma conta Telegram MTProto ativa encontrada para publicar." },
      };
    }

    const connectionId = conn.id;
    const mediaUrls = config.mediaUrl ? [config.mediaUrl] : [];

    const result = await publishToTelegramChannel({
      companyId: ctx.companyId,
      connectionId,
      channelId: targetChannelId,
      text: interpolatedText,
      mediaType: config.mediaType === "photo" ? "image" : (config.mediaType || (mediaUrls.length ? "image" : "text")),
      mediaUrls,
      pinMessage: Boolean(config.pinMessage),
    });

    return {
      kind: "next",
      port: "next",
      output: {
        messageId: result.messageId,
        channelUrl: result.channelUrl,
        isSimulation: Boolean(result.isSimulation),
      },
    };
  },
});

// Action 3: telegram.route_to_human
registerNode({
  type: "telegram.route_to_human",
  version: 1,
  category: "action",
  name: "Telegram: Derivar a Atendente",
  description: "Pausa automações e agentes de IA no Telegram e encaminha a conversa a um operador humano.",
  icon: "UserCheck",
  outputPorts: [], // Nodo terminal
  configSchema: z.object({
    reason: z.string().default("Solicitação de atendimento humano via Telegram"),
  }),
  async execute(ctx, config) {
    if (ctx.externalConversationId) {
      await handoffToHuman({
        companyId: ctx.companyId,
        externalConversationId: ctx.externalConversationId,
        instanceId: ctx.sourceInstanceId || null,
        reason: config.reason,
      });

      try {
        const cardId = resolveValidCardId(ctx);
        if (cardId) {
          await (supabaseAdmin as any).from("lead_evento").insert({
            company_id: ctx.companyId,
            card_id: cardId,
            tipo: "handoff",
            descricao: `Derivado a atención humana desde Telegram: ${config.reason || "Sin motivo"}`,
          });
        }
      } catch {
        // best-effort
      }

      try {
        await (supabaseAdmin as any).from("contact_pause").upsert(
          {
            company_id: ctx.companyId,
            numero: ctx.externalConversationId,
            pausado: true,
            pausado_por: "workflow_telegram_route_to_human",
            pausado_em: new Date().toISOString(),
          },
          { onConflict: "company_id,numero" }
        );
      } catch {
        // best-effort
      }
    }
    return { kind: "finish" };
  },
});

// ============================================================================
// 5. NODOS DE AUTOMATIZACIÓN DE META (INSTAGRAM & FACEBOOK - COMENTARIOS A DM)
// ============================================================================

// Trigger: meta.comment_received
registerNode({
  type: "meta.comment_received",
  version: 1,
  category: "trigger",
  name: "Comentario Recibido en Meta",
  description: "Se activa cuando entra un comentario en un Reel o publicación de Instagram o Facebook.",
  icon: "MessageCircle",
  outputPorts: ["next"],
  configSchema: z.object({
    connectionMode: z.enum(["any", "selected"]).default("any"),
    instanceIds: z.array(z.string()).default([]),
    channels: z.array(z.string()).default(["instagram", "facebook"]),
    postId: z.string().optional().nullable(),
    keywords: z.array(z.string()).default([]),
    ignoreNestedReplies: z.boolean().default(false),
    oncePerUserPerPost: z.boolean().default(true),
  }),
  async execute(ctx, config) {
    const trigger = ctx.context.trigger || {};
    const senderId = trigger.senderId || ctx.subject?.id;
    const postId = trigger.postId;

    // Validación de cooldown por (workflow_id, sender_id, post_id)
    if (config.oncePerUserPerPost && senderId && postId) {
      const { data: priorExec } = await (supabaseAdmin as any)
        .from("automation_executions")
        .select("id")
        .eq("company_id", ctx.companyId)
        .eq("workflow_id", ctx.workflowId)
        .neq("id", ctx.executionId)
        .filter("context->trigger->>senderId", "eq", String(senderId))
        .filter("context->trigger->>postId", "eq", String(postId))
        .limit(1)
        .maybeSingle();

      if (priorExec?.id) {
        console.log(
          `[meta.comment_received] Cooldown activo: el contacto ${senderId} ya ejecutó el flujo ${ctx.workflowId} en el post ${postId}. Omitiendo.`
        );
        return { kind: "finish", output: { skipped: true, reason: "once_per_user_per_post_cooldown" } };
      }
    }

    return {
      kind: "next",
      port: "next",
      output: {
        commentId: trigger.commentId,
        postId: trigger.postId,
        parentId: trigger.parentId,
        isNestedReply: trigger.isNestedReply,
        senderId: trigger.senderId,
        senderName: trigger.senderName,
        text: trigger.text,
        channel: trigger.channel,
      },
    };
  },
});

// Action: crm.ensure_lead
registerNode({
  type: "crm.ensure_lead",
  version: 1,
  category: "action",
  name: "Asegurar Lead en CRM",
  description: "Busca o crea una tarjeta de lead para el contacto de Instagram/Facebook por IGSID/PSID antes de enviar mensajes privados.",
  icon: "UserPlus",
  outputPorts: ["next"],
  configSchema: z.object({
    pipelineId: z.string().optional().nullable(),
    stageId: z.string().optional().nullable(),
    tag: z.string().default("Lead-Instagram-Comentarios"),
    defaultNamePrefix: z.string().default("Lead"),
  }),
  async execute(ctx, config) {
    const trigger = ctx.context.trigger || {};
    const senderId = String(trigger.senderId || ctx.subject?.id || ctx.externalConversationId || "").trim();
    if (!senderId) {
      throw new Error("No se encontró senderId/identificador en el contexto para asegurar el lead.");
    }

    const senderName = String(trigger.senderName || "").trim();
    const rawChannel = String(trigger.rawChannel || (trigger.channel?.includes("facebook") ? "messenger" : "instagram"));
    const isFacebook = rawChannel === "facebook" || rawChannel === "messenger" || String(trigger.channel || "").includes("facebook");
    const canalCrm = isFacebook ? "messenger" : "instagram";
    const canalEntrada = isFacebook ? "facebook_comentarios" : "instagram_comentarios";
    const targetTag = (config.tag || (isFacebook ? "Lead-Facebook-Comentarios" : "Lead-Instagram-Comentarios")).trim();

    // 1. Buscar lead existente de forma idempotente por número (IGSID/PSID)
    const { data: existingCard } = await (supabaseAdmin as any)
      .from("crm_cards")
      .select("id, company_id, nome, numero, canal_chat, canal_entrada, pipeline_id, stage_id, owner_id, tags, valor, email, campos_extras")
      .eq("company_id", ctx.companyId)
      .eq("numero", senderId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingCard) {
      // Si existe y falta la etiqueta configurada, agregarla
      if (targetTag) {
        const prevTags = Array.isArray(existingCard.tags) ? existingCard.tags : [];
        if (!prevTags.includes(targetTag)) {
          const updatedTags = [...prevTags, targetTag];
          await (supabaseAdmin as any)
            .from("crm_cards")
            .update({ tags: updatedTags, updated_at: new Date().toISOString() })
            .eq("id", existingCard.id)
            .eq("company_id", ctx.companyId);
          existingCard.tags = updatedTags;
        }
      }

      ctx.context.card = existingCard;
      try {
        await (supabaseAdmin as any)
          .from("automation_executions")
          .update({ card_id: existingCard.id })
          .eq("id", ctx.executionId);
      } catch {}

      return {
        kind: "next",
        port: "next",
        output: { cardId: existingCard.id, leadCreated: false, isNew: false },
      };
    }

    // 2. Si no existe, resolver etapa y pipeline
    let resolvedStageId = config.stageId || null;
    let resolvedPipelineId = config.pipelineId || null;

    if (!resolvedStageId) {
      const { data: defaultStage } = await (supabaseAdmin as any)
        .from("crm_stage")
        .select("id, pipeline_id")
        .eq("company_id", ctx.companyId)
        .order("ordem", { ascending: true })
        .limit(1)
        .maybeSingle();

      resolvedStageId = defaultStage?.id || null;
      resolvedPipelineId = defaultStage?.pipeline_id || null;
    }

    const defaultPrefix = config.defaultNamePrefix || (isFacebook ? "Facebook Lead" : "Instagram Lead");
    const safeName = senderName || `${defaultPrefix} ${senderId.slice(-4)}`;

    const { data: createdCard, error: insertErr } = await (supabaseAdmin as any)
      .from("crm_cards")
      .insert({
        company_id: ctx.companyId,
        nome: safeName,
        numero: senderId,
        canal_chat: canalCrm,
        canal_entrada: canalEntrada,
        pipeline_id: resolvedPipelineId,
        stage_id: resolvedStageId,
        tags: targetTag ? [targetTag] : [],
        origem: `Comentario ${isFacebook ? "Facebook" : "Instagram"}`,
        campos_extras: {
          meta_sender_id: senderId,
          instance_id: ctx.sourceInstanceId || trigger.instanceId || null,
          initial_post_id: trigger.postId || null,
          initial_comment_id: trigger.commentId || null,
          created_via: "meta.comment_to_lead",
        },
      })
      .select("id, company_id, nome, numero, canal_chat, canal_entrada, pipeline_id, stage_id, tags, campos_extras")
      .single();

    if (insertErr) {
      // En caso de inserción concurrente, recuperar por número
      const { data: fallbackCard } = await (supabaseAdmin as any)
        .from("crm_cards")
        .select("id, company_id, nome, numero, canal_chat, canal_entrada, pipeline_id, stage_id, tags, campos_extras")
        .eq("company_id", ctx.companyId)
        .eq("numero", senderId)
        .limit(1)
        .maybeSingle();

      if (fallbackCard) {
        ctx.context.card = fallbackCard;
        return { kind: "next", port: "next", output: { cardId: fallbackCard.id, leadCreated: false, isNew: false } };
      }
      throw new Error(`Error al crear lead en CRM para ${senderId}: ${insertErr.message}`);
    }

    ctx.context.card = createdCard;
    ctx.context.lead_created_via = "meta.comment_to_lead";
    try {
      await (supabaseAdmin as any)
        .from("automation_executions")
        .update({ card_id: createdCard.id })
        .eq("id", ctx.executionId);
    } catch {}

    return {
      kind: "next",
      port: "next",
      output: { cardId: createdCard.id, leadCreated: true, isNew: true },
    };
  },
});

// Action: meta.reply_comment
registerNode({
  type: "meta.reply_comment",
  version: 1,
  category: "action",
  name: "Responder Comentario en Meta",
  description: "Publica una respuesta pública al comentario en Instagram o Facebook, con soporte para variantes aleatorias y retardo.",
  icon: "MessageSquareQuote",
  outputPorts: ["next"],
  configSchema: z.object({
    message: z.string().optional().default(""),
    variants: z.array(z.string()).default([]),
    delaySeconds: z.number().min(0).max(300).default(0),
    minDelaySeconds: z.number().min(0).max(300).optional(),
    maxDelaySeconds: z.number().min(0).max(300).optional(),
  }),
  async execute(ctx, config) {
    const trigger = ctx.context.trigger || {};
    const commentId = String(trigger.commentId || trigger.comment_id || trigger.id || "").trim();
    if (!commentId) {
      throw new Error("No se encontró commentId en el contexto para responder al comentario.");
    }

    // 1. Selección aleatoria entre variantes para evitar bloqueos por repetición de texto
    let template = config.message || "";
    if (Array.isArray(config.variants) && config.variants.length > 0) {
      const validVariants = (config.variants as string[]).map((v: string) => String(v || "").trim()).filter(Boolean);
      if (validVariants.length > 0) {
        template = validVariants[Math.floor(Math.random() * validVariants.length)];
      }
    }
    const finalMessage = interpolateVariables(template, ctx.context);
    if (!finalMessage.trim()) {
      throw new Error("El mensaje de respuesta al comentario está vacío.");
    }

    // 2. Retardo no bloqueante: Ya programado de forma diferida en automation_jobs (run_after) por la cola.
    // No se usa setTimeout ni sleep en el worker para no bloquear procesos concurrentes.
    const delaySec = config.delaySeconds || 0;

    // 3. Obtener token de la instancia de Meta
    const instanceId = ctx.sourceInstanceId || trigger.instanceId;
    const { data: inst, error: instErr } = await (supabaseAdmin as any)
      .from("whatsapp_instances")
      .select("id, instance_token, provider, company_id")
      .eq("company_id", ctx.companyId)
      .eq("id", instanceId)
      .maybeSingle();

    if (instErr || !inst?.instance_token) {
      throw new Error(`Instancia de Meta no encontrada o sin token (${instanceId || 'indefinida'}).`);
    }

    const { metaReplyToComment } = await import("@/lib/meta.server");
    const replyResult = await metaReplyToComment(inst.instance_token, commentId, finalMessage, {
      instagram: inst.provider === "meta_instagram",
    });

    try {
      const { markContentCommentReplied } = await import("@/lib/meta-content-sync.server");
      await markContentCommentReplied(supabaseAdmin as any, ctx.companyId, commentId);
    } catch {}

    return {
      kind: "next",
      port: "next",
      output: {
        replyId: replyResult?.id || null,
        commentId,
        message: finalMessage,
        delayAppliedSeconds: delaySec,
      },
    };
  },
});

// Action: meta.send_private_reply
registerNode({
  type: "meta.send_private_reply",
  version: 1,
  category: "action",
  name: "Enviar Respuesta Privada (DM Meta)",
  description: "Envía un mensaje privado (DM en Instagram o Messenger en Facebook) en respuesta directa a un comentario público.",
  icon: "Send",
  outputPorts: ["next"],
  configSchema: z.object({
    message: z.string().min(1, "Escribe el mensaje a enviar"),
  }),
  async execute(ctx, config) {
    const trigger = ctx.context.trigger || {};
    const commentId = String(trigger.commentId || trigger.comment_id || trigger.id || "").trim();
    if (!commentId) {
      throw new Error("No se encontró commentId en el contexto para enviar respuesta privada.");
    }

    const finalMessage = interpolateVariables(config.message, ctx.context);
    if (!finalMessage.trim()) {
      throw new Error("El mensaje privado a enviar está vacío.");
    }

    const instanceId = ctx.sourceInstanceId || trigger.instanceId;
    const { data: inst, error: instErr } = await (supabaseAdmin as any)
      .from("whatsapp_instances")
      .select("id, instance_token, provider, company_id")
      .eq("company_id", ctx.companyId)
      .eq("id", instanceId)
      .maybeSingle();

    if (instErr || !inst?.instance_token) {
      throw new Error(`Instancia de Meta no encontrada o sin token (${instanceId || 'indefinida'}).`);
    }

    const { metaSendPrivateReply, isPermanentMetaPrivateReplyError } = await import("@/lib/meta.server");

    let apiResult: any = null;
    try {
      apiResult = await metaSendPrivateReply(inst.instance_token, commentId, finalMessage);
      try {
        const { markContentCommentReplied } = await import("@/lib/meta-content-sync.server");
        await markContentCommentReplied(supabaseAdmin as any, ctx.companyId, commentId);
      } catch {}
    } catch (err: any) {
      // Manejo estricto de errores permanentes de Meta Graph API:
      // Ventana de 7 días expirada, DMs cerrados, comentario inexistente o private reply ya enviado
      if (isPermanentMetaPrivateReplyError(err)) {
        console.warn(
          `[meta.send_private_reply] Fallo permanente no reintentable en comentario ${commentId}: ${err.message}`
        );
        return {
          kind: "finish",
          output: {
            error: err.message,
            permanent: true,
            fatal: true,
            commentId,
            failedAt: new Date().toISOString(),
          },
        };
      }
      // Error transitorio (red, timeout, 500): relanzar para que automation_jobs reintente
      throw err;
    }

    // Captura del recipient_id devuelto por Meta Graph API
    const recipientId = String(apiResult?.recipient_id || trigger.senderId || "").trim();
    const messageId = String(apiResult?.message_id || `meta_pr_${commentId}`);

    // Unificación segura con crm_cards.numero y validación de UUID real (nunca un ID numérico de Meta)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const rawCardId = ctx.context.card?.id;
    let activeCardId: string | null = (rawCardId && uuidRegex.test(String(rawCardId))) ? String(rawCardId) : null;

    if (recipientId) {
      // 1. Verificar si ya existe OTRA tarjeta con este recipient_id en la empresa
      const { data: existingCard } = await (supabaseAdmin as any)
        .from("crm_cards")
        .select("id, company_id, nome, numero, canal_chat, canal_entrada, pipeline_id, stage_id, tags, campos_extras")
        .eq("company_id", ctx.companyId)
        .eq("numero", recipientId)
        .limit(1)
        .maybeSingle();

      if (existingCard && existingCard.id !== activeCardId) {
        // Tarjeta previa existente: unificar la ejecución y mensaje a la tarjeta existente
        const tempCardId = activeCardId;
        activeCardId = existingCard.id;
        ctx.context.card = existingCard;

        try {
          await (supabaseAdmin as any)
            .from("automation_executions")
            .update({ card_id: existingCard.id })
            .eq("id", ctx.executionId);
        } catch {}

        // Si la tarjeta actual se acababa de crear como temporal en crm.ensure_lead, limpiarla
        if (tempCardId) {
          const isTempFromContext = ctx.context.lead_created_via === "meta.comment_to_lead";
          let shouldDelete = isTempFromContext;
          if (!shouldDelete) {
            const { data: tempRow } = await (supabaseAdmin as any)
              .from("crm_cards")
              .select("campos_extras")
              .eq("id", tempCardId)
              .eq("company_id", ctx.companyId)
              .maybeSingle();
            if (tempRow?.campos_extras?.created_via === "meta.comment_to_lead") {
              shouldDelete = true;
            }
          }

          if (shouldDelete) {
            try {
              await (supabaseAdmin as any)
                .from("crm_cards")
                .delete()
                .eq("id", tempCardId)
                .eq("company_id", ctx.companyId);
            } catch {}
          }
        }

        // Actualizar tarjeta existente
        try {
          await (supabaseAdmin as any)
            .from("crm_cards")
            .update({
              ultima_mensagem: finalMessage.slice(0, 240),
              ultima_direcao: "saida",
              ultima_em: new Date().toISOString(),
            })
            .eq("id", existingCard.id)
            .eq("company_id", ctx.companyId);
        } catch {}
      } else if (activeCardId) {
        // No hay tarjeta duplicada: actualizar el número con recipient_id
        try {
          await (supabaseAdmin as any)
            .from("crm_cards")
            .update({
              numero: recipientId,
              ultima_mensagem: finalMessage.slice(0, 240),
              ultima_direcao: "saida",
              ultima_em: new Date().toISOString(),
            })
            .eq("id", activeCardId)
            .eq("company_id", ctx.companyId);
        } catch {}

        if (ctx.context.card) {
          ctx.context.card.numero = recipientId;
        }
      }
    }

    // Registro del mensaje saliente en `mensagens` para visualización inmediata en el chat
    if (recipientId) {
      try {
        await (supabaseAdmin as any)
          .from("mensagens")
          .insert({
            company_id: ctx.companyId,
            instance_id: inst.id,
            numero: recipientId,
            direcao: "saida",
            autor: "automacao",
            texto: finalMessage,
            provider: inst.provider,
            whatsapp_message_id: messageId,
            status_envio: "enviado",
            created_at: new Date().toISOString(),
          });
      } catch (msgErr: any) {
        console.warn("[meta.send_private_reply] Aviso al persistir mensaje en histórico:", msgErr?.message);
      }

      // Actualizar external_conversation_id en automation_executions para que queue.server.ts
      // libere automáticamente el control de conversación al terminar la ejecución
      try {
        await (supabaseAdmin as any)
          .from("automation_executions")
          .update({ external_conversation_id: recipientId })
          .eq("id", ctx.executionId);
      } catch {}
      ctx.externalConversationId = recipientId;

      // Tomar control temporal de la conversación (lease de 10 minutos liberado automáticamente al finalizar el flujo)
      try {
        await acquireWorkflowControl({
          companyId: ctx.companyId,
          externalConversationId: recipientId,
          executionId: ctx.executionId,
          instanceId: inst.id,
          cardId: activeCardId || null,
          leaseMinutes: 10,
        });
      } catch {}
    }

    return {
      kind: "next",
      port: "next",
      output: {
        recipientId,
        messageId,
        commentId,
      },
    };
  },
});

// ============================================================================
// SPRINT 3: GHL CORE NODES (Triggers, Control/Lógica y Acciones)
// ============================================================================

// 1. Webhook Inbound Trigger
registerNode({
  type: "webhook.inbound",
  version: 1,
  category: "trigger",
  name: "Webhook de Entrada",
  description: "Dispara o fluxo quando uma requisição POST é recebida no endpoint seguro deste nó.",
  icon: "Webhook",
  outputPorts: ["next"],
  configSchema: z.object({
    description: z.string().optional().default(""),
    requireSecret: z.boolean().default(false),
    secretHeader: z.string().default("x-webhook-secret"),
    phoneFieldPath: z.string().default("phone"),
    nameFieldPath: z.string().default("name"),
    emailFieldPath: z.string().default("email"),
  }),
  async execute(ctx) {
    return { kind: "next", port: "next", output: ctx.context.trigger || {} };
  },
});

// 2. Form Submitted Trigger
registerNode({
  type: "form.submitted",
  version: 1,
  category: "trigger",
  name: "Formulário Enviado",
  description: "Dispara quando um lead preenche e envia um formulário público de captura.",
  icon: "FileText",
  outputPorts: ["next"],
  configSchema: z.object({
    formId: z.string().optional().nullable(),
  }),
  async execute(ctx) {
    return { kind: "next", port: "next", output: ctx.context.trigger || {} };
  },
});

// 3. Meta Lead Ad Received Trigger
registerNode({
  type: "meta.lead_ad_received",
  version: 1,
  category: "trigger",
  name: "Lead Ad do Facebook/Instagram",
  description: "Dispara instantaneamente quando um lead preenche um anúncio de formulário nativo da Meta.",
  icon: "Target",
  outputPorts: ["next"],
  configSchema: z.object({
    formId: z.string().optional().nullable(),
    pageId: z.string().optional().nullable(),
  }),
  async execute(ctx) {
    return { kind: "next", port: "next", output: ctx.context.trigger || {} };
  },
});

// 4. Appointment Created Trigger
registerNode({
  type: "appointment.created",
  version: 1,
  category: "trigger",
  name: "Agendamento Criado",
  description: "Dispara quando um novo compromisso ou consulta é agendado no calendário.",
  icon: "Calendar",
  outputPorts: ["next"],
  configSchema: z.object({
    serviceFilter: z.string().optional().nullable(),
  }),
  async execute(ctx) {
    return { kind: "next", port: "next", output: ctx.context.trigger || {} };
  },
});

// 5. Appointment Status Changed Trigger
registerNode({
  type: "appointment.status_changed",
  version: 1,
  category: "trigger",
  name: "Status do Agendamento Alterado",
  description: "Dispara quando o status de um agendamento muda (confirmado, cancelado, compareceu, etc).",
  icon: "CalendarCheck",
  outputPorts: ["next"],
  configSchema: z.object({
    toStatus: z.string().optional().nullable(),
  }),
  async execute(ctx) {
    return { kind: "next", port: "next", output: ctx.context.trigger || {} };
  },
});

// 6. Router Multi-Rama (AND / OR)
const RouterRuleSchema = z.object({
  field: z.string().min(1),
  operator: z.enum([
    "contains", "not_contains", "equals", "not_equals",
    "gt", "gte", "lt", "lte",
    "is_empty", "is_not_empty", "has_tag", "not_has_tag",
  ]).default("contains"),
  value: z.string().default(""),
});

const RouterBranchSchema = z.object({
  id: z.string().min(1),
  label: z.string().trim().min(1).max(60),
  logic: z.enum(["AND", "OR"]).default("AND"),
  rules: z.array(RouterRuleSchema).min(1),
});

registerNode({
  type: "condition.router",
  version: 1,
  category: "condition",
  name: "Roteador Multi-Ramo (AND / OR)",
  description: "Avalia múltiplas condições combinadas (E/OU) e envia o lead para o primeiro ramo correspondente ou Senão (Else).",
  icon: "GitFork",
  outputPorts: ["branch_1", "branch_2", "branch_3", "branch_4", "branch_5", "else"],
  resolveOutputPorts(config: any) {
    const ids = Array.isArray(config?.branches) ? config.branches.map((b: any) => String(b.id)) : [];
    return [...ids, "else"];
  },
  configSchema: z.object({
    branches: z.array(RouterBranchSchema).min(1, "Adicione ao menos 1 ramo").max(5, "Máximo 5 ramos"),
  }),
  async execute(ctx, config) {
    const branches = config.branches || [];

    const resolveValue = (fieldPath: string): any => {
      const parts = fieldPath.trim().split(".");
      let cur: any = ctx.context;
      for (const p of parts) {
        if (cur == null) return undefined;
        cur = cur[p];
      }
      return cur;
    };

    const evalRule = (rule: z.infer<typeof RouterRuleSchema>): boolean => {
      const actualRaw = resolveValue(rule.field);
      const targetVal = rule.value.trim().toLowerCase();

      if (rule.operator === "has_tag" || rule.operator === "not_has_tag") {
        const tags = Array.isArray(ctx.context.card?.tags)
          ? ctx.context.card.tags.map((t: any) => String(t).trim().toLowerCase())
          : [];
        const has = tags.includes(targetVal);
        return rule.operator === "has_tag" ? has : !has;
      }

      if (rule.operator === "is_empty") {
        return actualRaw == null || String(actualRaw).trim() === "";
      }
      if (rule.operator === "is_not_empty") {
        return actualRaw != null && String(actualRaw).trim() !== "";
      }

      if (["gt", "gte", "lt", "lte"].includes(rule.operator)) {
        const numActual = Number(String(actualRaw ?? "").replace(/[R$\s]/gi, "").replace(",", "."));
        const numTarget = Number(rule.value.replace(/[R$\s]/gi, "").replace(",", "."));
        if (!Number.isFinite(numActual) || !Number.isFinite(numTarget)) return false;
        if (rule.operator === "gt") return numActual > numTarget;
        if (rule.operator === "gte") return numActual >= numTarget;
        if (rule.operator === "lt") return numActual < numTarget;
        if (rule.operator === "lte") return numActual <= numTarget;
      }

      const strActual = String(actualRaw ?? "").toLowerCase();
      if (rule.operator === "contains") return strActual.includes(targetVal);
      if (rule.operator === "not_contains") return !strActual.includes(targetVal);
      if (rule.operator === "equals") return strActual.trim() === targetVal;
      if (rule.operator === "not_equals") return strActual.trim() !== targetVal;

      return false;
    };

    for (const branch of branches) {
      const pass =
        branch.logic === "OR"
          ? branch.rules.some(evalRule)
          : branch.rules.every(evalRule);
      if (pass) {
        return {
          kind: "next",
          port: branch.id,
          output: { matchedBranch: branch.id, label: branch.label },
        };
      }
    }

    return {
      kind: "next",
      port: "else",
      output: { matchedBranch: "else", label: "Senão (Else)" },
    };
  },
});

// 7. Horário Comercial
registerNode({
  type: "control.business_hours",
  version: 1,
  category: "control",
  name: "Horário Comercial",
  description: "Verifica se está dentro do horário de atendimento para bifurcar o fluxo ou pausar até a próxima abertura.",
  icon: "Clock",
  outputPorts: ["open", "closed", "next"],
  resolveOutputPorts(config: any) {
    return config?.mode === "wait_until_open" ? ["next"] : ["open", "closed"];
  },
  configSchema: z.object({
    mode: z.enum(["branch", "wait_until_open"]).default("branch"),
    useCompanyHours: z.boolean().default(true),
    timezone: z.string().default("America/Sao_Paulo"),
    days: z.array(z.number().int().min(0).max(6)).default([1, 2, 3, 4, 5]),
    startHour: z.string().regex(/^\d{2}:\d{2}$/).default("09:00"),
    endHour: z.string().regex(/^\d{2}:\d{2}$/).default("18:00"),
  }),
  async execute(ctx, config) {
    let bizHours: BusinessHours | null = null;

    if (config.useCompanyHours) {
      try {
        const { data: agentRow } = await (supabaseAdmin as any)
          .from("agent_config")
          .select("horarios_atendimento")
          .eq("company_id", ctx.companyId)
          .order("is_default", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (agentRow?.horarios_atendimento?.enabled) {
          bizHours = agentRow.horarios_atendimento;
        }
      } catch (err) {
        console.warn("[control.business_hours] Error al consultar agent_config:", err);
      }
    }

    if (!bizHours) {
      const dias: Record<string, any> = { "0": null, "1": null, "2": null, "3": null, "4": null, "5": null, "6": null };
      for (const d of config.days) {
        dias[String(d)] = { abre: config.startHour, fecha: config.endHour };
      }
      bizHours = { enabled: true, timezone: config.timezone, dias };
    }

    const isOpen = isWithinBusinessHours(bizHours);

    if (config.mode === "branch") {
      return {
        kind: "next",
        port: isOpen ? "open" : "closed",
        output: { isOpen },
      };
    }

    // mode === "wait_until_open"
    if (isOpen) {
      return {
        kind: "next",
        port: "next",
        output: { waited: false, isOpen: true },
      };
    }

    const nextOpen = getNextBusinessHoursOpen(bizHours);
    return {
      kind: "wait",
      resumeAt: nextOpen.toISOString(),
      waitKey: `biz_hours_${ctx.nodeId}`,
      output: { waited: true, resumeAt: nextOpen.toISOString() },
    };
  },
});

// 8. Teste A/B (Split)
registerNode({
  type: "control.split_ab",
  version: 1,
  category: "condition",
  name: "Teste A/B (Split)",
  description: "Divide os leads aleatoriamente entre variantes para testar scripts e ofertas.",
  icon: "Shuffle",
  outputPorts: ["variant_a", "variant_b", "variant_c"],
  resolveOutputPorts(config: any) {
    return Array.isArray(config?.variants) ? config.variants.map((v: any) => String(v.id)) : ["variant_a", "variant_b"];
  },
  configSchema: z.object({
    variants: z.array(z.object({
      id: z.string().min(1),
      label: z.string().min(1),
      weight: z.number().int().min(1).max(100),
    })).min(2).max(3).default([
      { id: "variant_a", label: "Variante A", weight: 50 },
      { id: "variant_b", label: "Variante B", weight: 50 },
    ]),
  }),
  async execute(ctx, config) {
    const roll = Math.random() * 100;
    let acc = 0;
    let chosen = config.variants[config.variants.length - 1];
    for (const v of config.variants) {
      acc += v.weight;
      if (roll <= acc) { chosen = v; break; }
    }
    return { kind: "next", port: chosen.id, output: { chosenVariant: chosen.id, label: chosen.label } };
  },
});

// 9. Atualizar Campo do Lead
registerNode({
  type: "crm.update_field",
  version: 1,
  category: "action",
  name: "Atualizar Campo do Lead",
  description: "Atualiza dados do contato ou card no CRM (nome, e-mail, valor ou campos personalizados).",
  icon: "Edit",
  outputPorts: ["next"],
  configSchema: z.object({
    field: z.enum(["nome", "email", "valor", "origem", "custom"]).default("custom"),
    customKey: z.string().optional().default(""),
    value: z.string().default(""),
  }),
  async execute(ctx, config) {
    const val = interpolateVariables(config.value, ctx.context);
    const cardId = resolveValidCardId(ctx);

    if (cardId) {
      const updates: Record<string, any> = { updated_at: new Date().toISOString() };
      if (!ctx.context.card) ctx.context.card = {};

      if (config.field === "nome") {
        updates.nome = val;
        ctx.context.card.nome = val;
      } else if (config.field === "email") {
        updates.email = val;
        ctx.context.card.email = val;
      } else if (config.field === "valor") {
        const cleaned = val.replace(/[R$\s]/gi, "").replace(",", ".");
        const num = Number(cleaned);
        if (Number.isFinite(num)) {
          updates.valor = num;
          ctx.context.card.valor = num;
        }
      } else if (config.field === "origem") {
        updates.origem = val;
        ctx.context.card.origem = val;
      } else if (config.field === "custom") {
        const key = (config.customKey || "custom").trim();
        const curExtras = (ctx.context.card.campos_extras && typeof ctx.context.card.campos_extras === "object")
          ? { ...ctx.context.card.campos_extras }
          : {};
        curExtras[key] = val;
        updates.campos_extras = curExtras;
        ctx.context.card.campos_extras = curExtras;
      }

      try {
        await (supabaseAdmin as any)
          .from("crm_cards")
          .update(updates)
          .eq("id", cardId)
          .eq("company_id", ctx.companyId);
      } catch (err) {
        console.warn("[crm.update_field] Erro ao atualizar card:", err);
      }
    }

    return {
      kind: "next",
      port: "next",
      output: { field: config.field, value: val, cardId },
    };
  },
});

// 10. Distribuir Lead (Round Robin)
registerNode({
  type: "crm.round_robin_assign",
  version: 1,
  category: "action",
  name: "Distribuir Lead (Round Robin)",
  description: "Atribui o lead automaticamente a um atendente ou departamento via fila de distribuição.",
  icon: "UserCheck",
  outputPorts: ["next"],
  configSchema: z.object({
    departmentId: z.string().optional().nullable(),
    stageId: z.string().optional().nullable(),
    onlyIfUnassigned: z.boolean().default(true),
  }),
  async execute(ctx, config) {
    const cardId = resolveValidCardId(ctx);
    if (!cardId) {
      return { kind: "next", port: "next", output: { skipped: true, reason: "no_card" } };
    }

    if (config.onlyIfUnassigned && ctx.context.card?.owner_id) {
      return {
        kind: "next",
        port: "next",
        output: { skipped: true, reason: "already_assigned", ownerId: ctx.context.card.owner_id },
      };
    }

    let targetOwnerId: string | null = null;

    if (config.departmentId) {
      try {
        const { data: deptMembers } = await (supabaseAdmin as any)
          .from("department_member")
          .select("user_id")
          .eq("department_id", config.departmentId);

        const memberIds = (deptMembers || []).map((m: any) => m.user_id);
        if (memberIds.length > 0) {
          const { data: activeUsers } = await (supabaseAdmin as any)
            .from("company_user")
            .select("user_id")
            .eq("company_id", ctx.companyId)
            .eq("ativo", true)
            .in("user_id", memberIds);

          const activeIds = (activeUsers || []).map((u: any) => u.user_id);
          if (activeIds.length > 0) {
            targetOwnerId = activeIds[Math.floor(Math.random() * activeIds.length)];
          }
        }
      } catch (deptErr) {
        console.warn("[crm.round_robin_assign] Erro ao consultar departamento:", deptErr);
      }
    }

    if (!targetOwnerId) {
      try {
        const { pickLeadOwner } = await import("@/lib/crm-engine.server");
        targetOwnerId = await pickLeadOwner(
          supabaseAdmin,
          ctx.companyId,
          config.stageId || ctx.context.card?.stage_id || undefined
        );
      } catch (err) {
        console.warn("[crm.round_robin_assign] Erro em pickLeadOwner:", err);
      }
    }

    if (targetOwnerId) {
      const updates: Record<string, any> = {
        owner_id: targetOwnerId,
        updated_at: new Date().toISOString(),
      };
      if (config.departmentId) {
        updates.department_id = config.departmentId;
      }

      try {
        await (supabaseAdmin as any)
          .from("crm_cards")
          .update(updates)
          .eq("id", cardId)
          .eq("company_id", ctx.companyId);

        if (!ctx.context.card) ctx.context.card = {};
        ctx.context.card.owner_id = targetOwnerId;

        await (supabaseAdmin as any).from("lead_evento").insert({
          card_id: cardId,
          company_id: ctx.companyId,
          tipo: "atribuicao_automacao",
          descricao: "Lead atribuído via automação (Round Robin)",
          created_at: new Date().toISOString(),
        });
      } catch (upErr) {
        console.warn("[crm.round_robin_assign] Erro ao persistir dono do lead:", upErr);
      }
    }

    return {
      kind: "next",
      port: "next",
      output: { assigned: Boolean(targetOwnerId), ownerId: targetOwnerId },
    };
  },
});

// 11. Notificação Interna
registerNode({
  type: "internal.notify",
  version: 1,
  category: "action",
  name: "Notificação Interna",
  description: "Registra uma nota interna no card, gera alerta no sininho do CRM e opcionalmente notifica via WhatsApp.",
  icon: "Bell",
  outputPorts: ["next"],
  configSchema: z.object({
    addLeadNote: z.boolean().default(true),
    pushBellNotification: z.boolean().default(true),
    title: z.string().default("Alerta de Automação"),
    message: z.string().min(1, "Escreva o conteúdo da notificação"),
    whatsappNotifyPhone: z.string().optional().default(""),
  }),
  async execute(ctx, config) {
    const title = interpolateVariables(config.title, ctx.context);
    const message = interpolateVariables(config.message, ctx.context);
    const cardId = resolveValidCardId(ctx);

    if (config.addLeadNote && cardId) {
      try {
        await (supabaseAdmin as any).from("lead_evento").insert({
          card_id: cardId,
          company_id: ctx.companyId,
          tipo: "nota_automacao",
          descricao: message,
          created_at: new Date().toISOString(),
        });
      } catch (noteErr) {
        console.warn("[internal.notify] Erro ao criar nota de lead:", noteErr);
      }
    }

    if (config.pushBellNotification) {
      try {
        await (supabaseAdmin as any).rpc("push_notificacao", {
          _company_id: ctx.companyId,
          _tipo: "automacao_alerta",
          _titulo: title,
          _descricao: message,
          _link: "/app/conversas",
          _ref_id: `auto_notify:${ctx.executionId}:${ctx.nodeId}`,
        });
      } catch (bellErr) {
        try {
          await (supabaseAdmin as any).from("notificacoes").insert({
            company_id: ctx.companyId,
            tipo: "automacao_alerta",
            titulo: title,
            mensagem: message,
            link: "/app/conversas",
            lida: false,
            created_at: new Date().toISOString(),
          });
        } catch {}
      }
    }

    if (config.whatsappNotifyPhone) {
      const cleanPhone = config.whatsappNotifyPhone.replace(/\D/g, "");
      if (cleanPhone.length >= 8) {
        try {
          const { getActiveInstance, waSendText } = await import("@/lib/wa-dispatch.server");
          const inst = await getActiveInstance(ctx.companyId);
          if (inst) {
            await waSendText(inst, cleanPhone, `🔔 *${title}*\n\n${message}`);
          }
        } catch (waErr) {
          console.warn("[internal.notify] Falha no envio WhatsApp:", waErr);
        }
      }
    }

    return {
      kind: "next",
      port: "next",
      output: { notified: true, title, message },
    };
  },
});

// 12. Webhook HTTP Saliente
registerNode({
  type: "http.webhook",
  version: 1,
  category: "action",
  name: "Webhook HTTP (Saída)",
  description: "Dispara uma requisição HTTP/HTTPS para um serviço externo seguro com proteção anti-SSRF.",
  icon: "Globe",
  outputPorts: ["next"],
  configSchema: z.object({
    url: z.string().url("Informe uma URL HTTPS válida"),
    method: z.enum(["POST", "PUT", "PATCH", "GET"]).default("POST"),
    headers: z.array(z.object({ key: z.string(), value: z.string() })).default([]),
    bodyTemplate: z.string().optional().default('{"lead_name":"{{lead_name}}","phone":"{{card.numero}}","email":"{{card.email}}","text":"{{trigger.text}}"}'),
    timeoutMs: z.number().int().min(1000).max(5000).default(4500),
    continueOnError: z.boolean().default(false),
  }),
  async execute(ctx, config) {
    const interpolatedUrl = interpolateVariables(config.url, ctx.context);
    const { assertSafeWebhookUrl, redactHeadersForLog } = await import("./http-security.server");
    const safeUrl = assertSafeWebhookUrl(interpolatedUrl);

    const headersObj: Record<string, string> = { "Content-Type": "application/json" };
    for (const h of config.headers || []) {
      if (h.key?.trim()) {
        headersObj[h.key.trim()] = interpolateVariables(h.value || "", ctx.context);
      }
    }

    let bodyData: any = undefined;
    if (config.method !== "GET") {
      const rawBody = interpolateVariables(config.bodyTemplate || "{}", ctx.context);
      bodyData = rawBody;
    }

    let res: Response;
    try {
      res = await fetch(safeUrl.toString(), {
        method: config.method,
        headers: headersObj,
        body: bodyData,
        signal: AbortSignal.timeout(config.timeoutMs || 4500),
      });
    } catch (fetchErr: any) {
      if (!config.continueOnError) {
        throw new Error(`Erro na chamada do webhook HTTP: ${fetchErr?.message || fetchErr}`);
      }
      return {
        kind: "next",
        port: "next",
        output: {
          ok: false,
          error: fetchErr?.message,
          headersSent: redactHeadersForLog(headersObj),
        },
      };
    }

    let parsedBody: any = null;
    const textSlice = await res.text().catch(() => "");
    try {
      parsedBody = JSON.parse(textSlice);
    } catch {
      parsedBody = textSlice.slice(0, 1000);
    }

    if (!res.ok && !config.continueOnError) {
      throw new Error(`Webhook HTTP retornou status ${res.status}: ${textSlice.slice(0, 200)}`);
    }

    return {
      kind: "next",
      port: "next",
      output: {
        status: res.status,
        ok: res.ok,
        response: parsedBody,
        headersSent: redactHeadersForLog(headersObj),
      },
    };
  },
});

// ==========================================
// SPRINT 4: NODOS INTELIGENTES E CAPI
// ==========================================

const AiIntentBranchSchema = z.object({
  id: z.string().min(1),
  label: z.string().trim().min(1).max(40),
  description: z.string().trim().min(1).max(200),
});

registerNode({
  type: "ai.classify_and_route",
  version: 1,
  category: "condition",
  name: "IA: Classificar Intenção e Rotear",
  description: "Analisa a mensagem ou histórico com IA e direciona o fluxo para o ramo da intenção detectada.",
  icon: "Sparkles",
  outputPorts: ["intent_1", "intent_2", "intent_3", "intent_4", "intent_5", "fallback"],
  resolveOutputPorts(config: any) {
    const ids = Array.isArray(config?.intents) ? config.intents.map((i: any) => String(i.id)) : [];
    return [...ids, "fallback"];
  },
  configSchema: z.object({
    sourceText: z.string().default("{{trigger.text}}"),
    includeRecentHistory: z.boolean().default(true),
    intents: z.array(AiIntentBranchSchema).min(1, "Adicione ao menos 1 intenção").max(5, "Máximo 5 intenções"),
    minConfidence: z.number().min(0.1).max(1).default(0.6),
  }),
  async execute(ctx, config) {
    const rawSource = config.sourceText || "{{trigger.text}}";
    const evaluatedText = interpolateVariables(rawSource, ctx.context);

    let historyText = "";
    if (config.includeRecentHistory) {
      const targetPhone = ctx.externalConversationId || ctx.context?.trigger?.senderId || ctx.context?.card?.numero;
      if (targetPhone) {
        try {
          const { data: recentMsgs } = await (supabaseAdmin as any)
            .from("mensagens")
            .select("direcao, autor, texto, created_at")
            .eq("company_id", ctx.companyId)
            .eq("numero", targetPhone)
            .order("created_at", { ascending: false })
            .limit(6);
          if (recentMsgs && recentMsgs.length > 0) {
            const chronological = [...recentMsgs].reverse();
            historyText = chronological
              .map((m: any) => `${m.direcao === "entrada" ? "Cliente" : "Atendente"}: ${m.texto || ""}`)
              .filter(Boolean)
              .join("\n");
          }
        } catch (e: any) {
          console.warn("[ai.classify_and_route] Aviso lendo histórico de mensagens:", e?.message);
        }
      }
    }

    const combinedText = historyText
      ? `Histórico recente da conversa:\n${historyText}\n\nMensagem atual do cliente:\n${evaluatedText}`
      : evaluatedText;

    const intentsList = (config.intents || [])
      .map((i: any) => `- ID: "${i.id}" | Rótulo: "${i.label}" | Descrição: ${i.description}`)
      .join("\n");

    try {
      const { lovableAiChat } = await import("@/lib/lovable-ai.server");
      const rawAiResponse = await lovableAiChat(
        [
          {
            role: "system",
            content: `Você é um classificador estrito de intenções de clientes para automações de CRM.
Classifique a mensagem do cliente escolhendo uma das seguintes intenções disponíveis:
${intentsList}
- ID: "fallback" | Rótulo: "Outro / Desconhecido" | Descrição: Quando a mensagem não se enquadrar claramente em nenhuma das opções acima.

Responda ESTRITAMENTE em formato JSON com o seguinte formato:
{
  "intentId": "<id da intenção correspondente ou 'fallback'>",
  "confidence": <número decimal entre 0.0 e 1.0>,
  "reason": "<breve explicação em até 10 palavras>"
}`,
          },
          {
            role: "user",
            content: combinedText || "Olá",
          },
        ],
        {
          temperature: 0.15,
          jsonMode: true,
          telemetry: {
            companyId: ctx.companyId,
            agentId: null,
            feature: "automation_classify",
          },
          maxTokens: 300,
        }
      );

      let parsed: any = null;
      try {
        const cleanJson = rawAiResponse.replace(/```json\s*|\s*```/gi, "").trim();
        parsed = JSON.parse(cleanJson);
      } catch {
        parsed = null;
      }

      const detectedId = parsed?.intentId ? String(parsed.intentId).trim() : "fallback";
      const confidence = typeof parsed?.confidence === "number" ? parsed.confidence : 0.8;
      const reason = parsed?.reason || "Classificação automática por IA";

      const matchedIntent = config.intents.find((i: any) => i.id === detectedId);
      if (matchedIntent && confidence >= config.minConfidence) {
        return {
          kind: "next",
          port: matchedIntent.id,
          output: {
            intentId: matchedIntent.id,
            label: matchedIntent.label,
            confidence,
            reason,
          },
        };
      }

      return {
        kind: "next",
        port: "fallback",
        output: {
          intentId: "fallback",
          confidence,
          reason: confidence < config.minConfidence ? `Confiança ${confidence} abaixo do mínimo requerido (${config.minConfidence})` : reason,
        },
      };
    } catch (err: any) {
      console.warn("[ai.classify_and_route] Erro na inferência do classificador:", err?.message);
      return {
        kind: "next",
        port: "fallback",
        output: {
          intentId: "fallback",
          confidence: 0,
          reason: err?.message || "Falha na chamada ao provedor de IA",
        },
      };
    }
  },
});

const AiExtractFieldDefSchema = z.object({
  key: z.string().trim().min(1),
  target: z.enum(["nome", "email", "valor", "custom"]).default("custom"),
  description: z.string().trim().min(1).max(160),
});

registerNode({
  type: "ai.extract_fields",
  version: 1,
  category: "action",
  name: "IA: Extrair Dados para o CRM",
  description: "Extrai informações estruturadas da conversa com IA e salva automaticamente no cartão do lead.",
  icon: "BrainCircuit",
  outputPorts: ["next"],
  configSchema: z.object({
    sourceText: z.string().default("{{trigger.text}}"),
    includeRecentHistory: z.boolean().default(true),
    fields: z.array(AiExtractFieldDefSchema).min(1, "Adicione ao menos 1 campo").max(8),
  }),
  async execute(ctx, config) {
    const rawSource = config.sourceText || "{{trigger.text}}";
    const evaluatedText = interpolateVariables(rawSource, ctx.context);

    let historyText = "";
    if (config.includeRecentHistory) {
      const targetPhone = ctx.externalConversationId || ctx.context?.trigger?.senderId || ctx.context?.card?.numero;
      if (targetPhone) {
        try {
          const { data: recentMsgs } = await (supabaseAdmin as any)
            .from("mensagens")
            .select("direcao, autor, texto, created_at")
            .eq("company_id", ctx.companyId)
            .eq("numero", targetPhone)
            .order("created_at", { ascending: false })
            .limit(6);
          if (recentMsgs && recentMsgs.length > 0) {
            const chronological = [...recentMsgs].reverse();
            historyText = chronological
              .map((m: any) => `${m.direcao === "entrada" ? "Cliente" : "Atendente"}: ${m.texto || ""}`)
              .filter(Boolean)
              .join("\n");
          }
        } catch (e: any) {
          console.warn("[ai.extract_fields] Aviso lendo histórico de mensagens:", e?.message);
        }
      }
    }

    const combinedText = historyText
      ? `Histórico recente da conversa:\n${historyText}\n\nMensagem atual:\n${evaluatedText}`
      : evaluatedText;

    const fieldsSpec = config.fields
      .map((f: any) => `- "${f.key}" (${f.target}): ${f.description}`)
      .join("\n");

    let extracted: Record<string, any> = {};

    try {
      const { lovableAiChat } = await import("@/lib/lovable-ai.server");
      const rawAiResponse = await lovableAiChat(
        [
          {
            role: "system",
            content: `Você é um extrator de dados estruturados a partir de conversas com clientes.
Analise a conversa e extraia os campos solicitados abaixo.
Campos a extrair:
${fieldsSpec}

Responda ESTRITAMENTE em formato JSON com um objeto onde cada chave seja o nome exato do campo solicitado. Se um campo não foi mencionado ou for desconhecido, retorne null para ele.
Exemplo: { "nome": "Maria Silva", "email": "maria@gmail.com", "orcamento": 5000 }`,
          },
          {
            role: "user",
            content: combinedText || "Sem conteúdo",
          },
        ],
        {
          temperature: 0.1,
          jsonMode: true,
          maxTokens: 500,
          telemetry: {
            companyId: ctx.companyId,
            agentId: null,
            feature: "automation_extract",
          },
        }
      );

      try {
        const cleanJson = rawAiResponse.replace(/```json\s*|\s*```/gi, "").trim();
        extracted = JSON.parse(cleanJson);
      } catch {
        extracted = {};
      }
    } catch (err: any) {
      console.warn("[ai.extract_fields] Erro chamando LLM para extração:", err?.message);
    }

    // Persistir campos no cartão do CRM
    const cardId = resolveValidCardId(ctx);
    if (cardId && extracted && typeof extracted === "object" && Object.keys(extracted).length > 0) {
      try {
        const { data: currentCard } = await (supabaseAdmin as any)
          .from("crm_cards")
          .select("id, nome, email, valor, campos_extras")
          .eq("id", cardId)
          .eq("company_id", ctx.companyId)
          .maybeSingle();

        if (currentCard) {
          const updatePayload: Record<string, any> = {};
          const currentExtras = (currentCard.campos_extras as Record<string, any>) || {};
          let extrasModified = false;

          for (const f of config.fields) {
            const val = extracted[f.key];
            if (val === null || val === undefined || val === "") continue;

            if (f.target === "nome" && typeof val === "string") {
              updatePayload.nome = val.trim();
            } else if (f.target === "email" && typeof val === "string") {
              updatePayload.email = val.trim();
            } else if (f.target === "valor") {
              const num = Number(String(val).replace(/[^\d.,-]/g, "").replace(",", "."));
              if (Number.isFinite(num)) updatePayload.valor = num;
            } else {
              currentExtras[f.key] = val;
              extrasModified = true;
            }
          }

          if (extrasModified) {
            updatePayload.campos_extras = currentExtras;
          }

          if (Object.keys(updatePayload).length > 0) {
            await (supabaseAdmin as any)
              .from("crm_cards")
              .update(updatePayload)
              .eq("id", cardId)
              .eq("company_id", ctx.companyId);

            // Refletir no contexto
            if (!ctx.context.card) ctx.context.card = {};
            Object.assign(ctx.context.card, updatePayload);
            if (updatePayload.nome) {
              ctx.context.card.nome = updatePayload.nome;
              (ctx.context as any).lead_name = updatePayload.nome;
            }
          }
        }
      } catch (e: any) {
        console.warn("[ai.extract_fields] Erro persistindo campos extraídos em crm_cards:", e?.message);
      }
    }

    if (!ctx.context.extracted) ctx.context.extracted = {};
    Object.assign(ctx.context.extracted, extracted);

    return {
      kind: "next",
      port: "next",
      output: { extracted },
    };
  },
});

registerNode({
  type: "meta.capi_event",
  version: 1,
  category: "action",
  name: "Meta CAPI: Enviar Conversão",
  description: "Envia evento oficial de conversão (Lead, QualifiedLead, Schedule, Purchase) para o Pixel/Dataset da Meta.",
  icon: "TrendingUp",
  outputPorts: ["next"],
  configSchema: z.object({
    eventName: z
      .enum(["Lead", "QualifiedLead", "Schedule", "Purchase", "InitiateCheckout", "CompleteRegistration"])
      .default("QualifiedLead"),
    valueTemplate: z.string().optional().default("{{card.valor}}"),
    currency: z.string().default("BRL"),
  }),
  async execute(ctx, config) {
    const cardId = resolveValidCardId(ctx);
    if (!cardId) {
      return { kind: "next", port: "next", output: { skipped: true, reason: "no_card_id" } };
    }
    const rawVal = config.valueTemplate ? interpolateVariables(config.valueTemplate, ctx.context) : "";
    const parsedVal = Number(String(rawVal).replace(/[^\d.,-]/g, "").replace(",", "."));
    const value = Number.isFinite(parsedVal) && parsedVal > 0 ? parsedVal : undefined;

    const { sendMetaConversionForLead } = await import("@/lib/meta-capi.server");
    const res = await sendMetaConversionForLead({
      companyId: ctx.companyId,
      cardId,
      eventName: config.eventName,
      dedupKey: `auto_${ctx.executionId}_${ctx.nodeId}_${config.eventName}`,
      ...(value !== undefined ? { value, currency: config.currency || "BRL" } : {}),
    } as any);

    return {
      kind: "next",
      port: "next",
      output: {
        eventName: config.eventName,
        result: res ?? { ok: true },
      },
    };
  },
});

