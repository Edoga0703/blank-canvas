// src/lib/automations/functions.ts
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveCompanyIdCached } from "@/lib/company-cache";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  WorkflowGraphSchema,
  validateWorkflowGraphStructure,
  type WorkflowGraph,
} from "./schema";
import { getNodeDefinition } from "./registry.server";

async function assertAutomationEditor(companyId: string, userId: string, fallbackClient?: any) {
  const sb = (supabaseAdmin as any) || fallbackClient;
  // Bypass para super administradores da plataforma
  const { data: prof } = await sb.from("profiles").select("is_super_admin").eq("user_id", userId).maybeSingle();
  if (prof?.is_super_admin) return;

  let { data: member, error } = await sb
    .from("company_user")
    .select("role, ativo")
    .eq("company_id", companyId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !member || !member.ativo) {
    throw new Error("Acceso denegado: membresía inactiva o no encontrada.");
  }

  const allowedRoles = ["owner", "admin", "super_admin", "gestor"];
  if (!allowedRoles.includes(member.role)) {
    throw new Error("Acceso denegado: permisos insuficientes para modificar automatizaciones.");
  }
}

export const listWorkflowsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const companyId = await resolveCompanyIdCached(context.supabase, context.userId);
    const { data: workflows, error } = await (supabaseAdmin as any)
      .from("automation_workflows")
      .select("id, name, description, status, active_version_id, updated_at, created_at, ui_mode")
      .eq("company_id", companyId)
      .neq("status", "archived")
      .order("updated_at", { ascending: false });

    if (error) throw new Error(error.message);
    return (workflows || []) as any[];
  });

export const getWorkflowFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { workflowId: string }) => {
    if (!d?.workflowId) throw new Error("workflowId es requerido");
    return d;
  })
  .handler(async ({ context, data }) => {
    const companyId = await resolveCompanyIdCached(context.supabase, context.userId);
    const { data: wf, error } = await (supabaseAdmin as any)
      .from("automation_workflows")
      .select("*")
      .eq("company_id", companyId)
      .eq("id", data.workflowId)
      .maybeSingle();

    if (error || !wf) throw new Error("Flujo de automatización no encontrado");

    // A04: Obter versão ativa e versão de rascunho por separado para evitar falsos "Publicado (vN)"
    let graph: WorkflowGraph | null = null;
    let versionNumber = 1;
    let activeVersionNumber: number | null = null;
    let activeVersion: any = null;

    if (wf.active_version_id) {
      const { data: actVer } = await (supabaseAdmin as any)
        .from("automation_workflow_versions")
        .select("id, graph, version_number, published_at")
        .eq("company_id", companyId)
        .eq("id", wf.active_version_id)
        .maybeSingle();

      if (actVer) {
        activeVersion = actVer;
        activeVersionNumber = actVer.version_number;
      }
    }

    // Carregar o rascunho mais recente (maior version_number)
    const { data: latestVer } = await (supabaseAdmin as any)
      .from("automation_workflow_versions")
      .select("id, graph, version_number, published_at")
      .eq("company_id", companyId)
      .eq("workflow_id", wf.id)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestVer) {
      graph = latestVer.graph;
      versionNumber = latestVer.version_number;
    } else if (activeVersion) {
      graph = activeVersion.graph;
      versionNumber = activeVersion.version_number;
    }

    // Calcula se há alterações pendentes de publicação
    const hasUnpublishedChanges =
      !wf.active_version_id ||
      wf.status !== "published" ||
      (latestVer && activeVersion && latestVer.id !== activeVersion.id);

    // Grafo predeterminado se for novo (alinhamento vertical intuitivo)
    if (!graph) {
      graph = {
        schemaVersion: 1,
        nodes: [
          {
            id: "trigger_inbound",
            type: "messaging.inbound_received",
            version: 1,
            position: { x: 250, y: 80 },
            config: {
              connectionMode: "any",
              instanceIds: [],
              channels: ["whatsapp", "instagram_dm", "facebook_messenger", "telegram"],
              keywords: [],
              conversationType: "direct",
            },
          },
          {
            id: "send_welcome",
            type: "messaging.send_text",
            version: 1,
            position: { x: 250, y: 260 },
            config: {
              text: "¡Hola! Gracias por comunicarte con nosotros. ¿En qué podemos ayudarte hoy?",
              connectionPolicy: "same_as_trigger",
            },
          },
        ],
        edges: [
          {
            id: "edge_trigger_welcome",
            source: "trigger_inbound",
            sourcePort: "next",
            target: "send_welcome",
            targetPort: "input",
          },
        ],
        settings: {
          reentry: "deny_while_active",
          maxRuntimeSeconds: 86400 * 7,
          maxSteps: 100,
          ui_mode: "canvas",
          stopOnContactReply: false,
          stopOnStageIds: [],
          timezone: "America/Sao_Paulo",
        },
      };
    }

    return {
      workflow: wf,
      graph: graph as any,
      activeVersion,
      draftVersion: latestVer,
      hasUnpublishedChanges,
      versionNumber,
      activeVersionNumber,
    };
  });

export function validateWorkflowNodes(parsedGraph: WorkflowGraph): string[] {
  const nodeValidationErrors: string[] = [];

  for (const node of parsedGraph.nodes) {
    const def = getNodeDefinition(node.type, node.version);
    if (!def) {
      nodeValidationErrors.push(`El nodo "${node.id}" tiene un tipo no registrado: "${node.type}".`);
      continue;
    }

    // 1. Validar dinámicamente la configuración del nodo contra su Zod schema registrado
    const configRes = def.configSchema.safeParse(node.config || {});
    if (!configRes.success) {
      const issues = configRes.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ");
      nodeValidationErrors.push(`Configuración inválida en nodo "${node.id}" (${def.name}): ${issues}`);
    }

    // 2. Resolver y validar puertos de salida de forma estática o dinámica
    const parsedCfg = configRes.success ? configRes.data : (node.config || {});
    const validPorts = def.resolveOutputPorts
      ? def.resolveOutputPorts(parsedCfg)
      : [...def.outputPorts];

    const outgoingEdges = parsedGraph.edges.filter((e) => e.source === node.id);
    for (const edge of outgoingEdges) {
      const port = edge.sourcePort || "next";
      if (!validPorts.includes(port)) {
        nodeValidationErrors.push(
          `El puerto de salida "${port}" usado en el enlace "${edge.id}" no existe en el nodo "${node.id}". Puertos válidos: [${validPorts.join(", ")}].`
        );
      }
    }

    // 3. Validar puertos requeridos en nodos de bifurcación y captura
    if (node.type === "condition.if_else" || node.type === "messaging.wait_for_reply") {
      for (const port of def.outputPorts) {
        if (!outgoingEdges.some((e) => e.sourcePort === port)) {
          nodeValidationErrors.push(`El nodo "${node.id}" (${def.name}) requiere la salida "${port}".`);
        }
      }
    } else if (node.type === "messaging.send_interactive") {
      const options = Array.isArray((parsedCfg as any).options) ? (parsedCfg as any).options : [];
      const hasConnectedOption = options.some((opt: any) =>
        outgoingEdges.some((e) => e.sourcePort === String(opt.id))
      );
      if (options.length > 0 && !hasConnectedOption) {
        nodeValidationErrors.push(
          `El nodo "${node.id}" (${def.name}) requiere que al menos 1 opción tenga salida conectada.`
        );
      }
    } else if (node.type === "messaging.collect_input") {
      if (!outgoingEdges.some((e) => e.sourcePort === "valid" || e.sourcePort === "next")) {
        nodeValidationErrors.push(
          `El nodo "${node.id}" (${def.name}) requiere conectar la salida "valid".`
        );
      }
    } else if (node.type === "condition.router") {
      const branches = Array.isArray((parsedCfg as any).branches) ? (parsedCfg as any).branches : [];
      const hasConnectedBranch = branches.some((b: any) =>
        outgoingEdges.some((e) => e.sourcePort === String(b.id))
      );
      if (branches.length > 0 && !hasConnectedBranch) {
        nodeValidationErrors.push(
          `El nodo "${node.id}" (${def.name}) requiere al menos 1 rama conectada.`
        );
      }
    } else if (node.type === "control.business_hours") {
      const mode = (parsedCfg as any).mode || "branch";
      if (mode === "branch") {
        const hasOpenOrClosed = outgoingEdges.some((e) => e.sourcePort === "open" || e.sourcePort === "closed");
        if (!hasOpenOrClosed) {
          nodeValidationErrors.push(
            `El nodo "${node.id}" (${def.name}) en modo ramificación requiere al menos una salida ("open" o "closed") conectada.`
          );
        }
      }
    } else if (node.type === "control.split_ab") {
      const variants = Array.isArray((parsedCfg as any).variants) ? (parsedCfg as any).variants : [];
      if (variants.length < 2) {
        nodeValidationErrors.push(`El nodo "${node.id}" (${def.name}) requiere al menos 2 variantes.`);
      } else {
        const totalWeight = variants.reduce((sum: number, v: any) => sum + (Number(v.weight) || 0), 0);
        if (totalWeight !== 100) {
          nodeValidationErrors.push(`El nodo "${node.id}" (${def.name}) requiere que la suma de pesos de las variantes sea exactamente 100% (actual: ${totalWeight}%).`);
        }
      }
    } else if ((node.type as string) === "ai.classify_and_route") {
      const intents = Array.isArray((parsedCfg as any).intents) ? (parsedCfg as any).intents : [];
      const hasConnectedIntent = intents.some((i: any) =>
        outgoingEdges.some((e) => (e.sourcePort as string) === String(i.id))
      );
      if (intents.length > 0 && !hasConnectedIntent) {
        nodeValidationErrors.push(
          `El nodo "${node.id}" (${def.name}) requiere al menos 1 intención conectada.`
        );
      }
    }

    const cfg = (node.config || {}) as Record<string, any>;

    // 4. Validaciones de negocio específicas adicionales
    const messagingTypes = new Set([
      "messaging.send_text",
      "messaging.send_media",
      "messaging.send_interactive",
      "messaging.collect_input",
      "messaging.send_template",
    ]);
    if (messagingTypes.has(node.type) && cfg.connectionPolicy === "specific" && !cfg.specificInstanceId) {
      nodeValidationErrors.push(`El nodo "${node.id}" (${def.name}) requiere una conexión específica seleccionada.`);
    }
  }

  return nodeValidationErrors;
}

export const createWorkflowFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    name: string;
    description?: string;
    initialGraph?: any;
    ui_mode?: "quick_rule" | "canvas";
    publishImmediately?: boolean;
  }) => {
    if (!d?.name?.trim()) throw new Error("El nombre del flujo es obligatorio");
    return d;
  })
  .handler(async ({ context, data }) => {
    const companyId = await resolveCompanyIdCached(context.supabase, context.userId);
    await assertAutomationEditor(companyId, context.userId);

    const uiMode = data.ui_mode || "canvas";
    const graphToUse: WorkflowGraph = data.initialGraph
      ? WorkflowGraphSchema.parse({
          ...data.initialGraph,
          settings: {
            reentry: "deny_while_active",
            maxRuntimeSeconds: 86400,
            maxSteps: 100,
            ...(data.initialGraph.settings || {}),
            ui_mode: uiMode,
          },
        })
      : {
          schemaVersion: 1,
          nodes: [
            {
              id: "trigger_inbound",
              type: "messaging.inbound_received",
              version: 1,
              position: { x: 250, y: 80 },
              config: {
                connectionMode: "any",
                instanceIds: [],
                channels: ["whatsapp", "instagram_dm", "facebook_messenger", "telegram"],
                keywords: [],
                conversationType: "direct",
              },
            },
            {
              id: "send_welcome",
              type: "messaging.send_text",
              version: 1,
              position: { x: 250, y: 260 },
              config: {
                text: "¡Hola! Gracias por comunicarte con nosotros. ¿En qué podemos ayudarte hoy?",
                connectionPolicy: "same_as_trigger",
              },
            },
          ],
          edges: [
            {
              id: "edge_trigger_welcome",
              source: "trigger_inbound",
              sourcePort: "next",
              target: "send_welcome",
              targetPort: "input",
            },
          ],
          settings: {
            reentry: "deny_while_active",
            maxRuntimeSeconds: 86400 * 7,
            maxSteps: 100,
            ui_mode: uiMode,
            stopOnContactReply: false,
            stopOnStageIds: [],
            timezone: "America/Sao_Paulo",
          },
        };

    if (data.publishImmediately) {
      const validation = validateWorkflowGraphStructure(graphToUse);
      if (!validation.valid) {
        throw new Error(`Validación de estructura fallida: ${validation.errors.map((e) => e.message).join(" | ")}`);
      }
      const nodeErrors = validateWorkflowNodes(graphToUse);
      if (nodeErrors.length > 0) {
        throw new Error("Não é possível publicar: " + nodeErrors.join("; "));
      }
    }

    const { data: wf, error } = await (supabaseAdmin as any)
      .from("automation_workflows")
      .insert({
        company_id: companyId,
        name: data.name.trim(),
        description: data.description?.trim() || null,
        status: data.publishImmediately ? "published" : "draft",
        ui_mode: uiMode,
        created_by: context.userId,
        updated_by: context.userId,
      })
      .select("id")
      .single();

    if (error || !wf) throw new Error(error?.message || "Error al crear flujo");

    // Guardar versión 1
    const { data: ver, error: verErr } = await (supabaseAdmin as any)
      .from("automation_workflow_versions")
      .insert({
        company_id: companyId,
        workflow_id: wf.id,
        version_number: 1,
        graph: graphToUse,
        schema_version: 1,
        published_by: data.publishImmediately ? context.userId : null,
        published_at: data.publishImmediately ? new Date().toISOString() : null,
        created_by: context.userId,
      })
      .select("id")
      .single();

    if (verErr || !ver) {
      throw new Error(`Error al crear versión inicial del flujo: ${verErr?.message}`);
    }

    if (data.publishImmediately) {
      await (supabaseAdmin as any)
        .from("automation_workflows")
        .update({ active_version_id: ver.id })
        .eq("id", wf.id);

      try {
        const { syncWorkflowWebhookEndpoints } = await import("./webhook-endpoints.server");
        await syncWorkflowWebhookEndpoints(supabaseAdmin, companyId, wf.id, graphToUse);
      } catch (err) {
        console.error("Error sincronizando webhook endpoints:", err);
      }
    }

    return { id: wf.id };
  });

export const saveWorkflowDraftFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { workflowId: string; graph: any; name?: string; description?: string; switchUiModeToCanvas?: boolean; ui_mode?: "quick_rule" | "canvas" }) => {
    if (!d?.workflowId || !d?.graph) throw new Error("Datos incompletos");
    return d;
  })
  .handler(async ({ context, data }) => {
    const companyId = await resolveCompanyIdCached(context.supabase, context.userId);
    await assertAutomationEditor(companyId, context.userId);
    const parsedGraph = WorkflowGraphSchema.parse(data.graph);

    // Verificar que el flujo pertenezca a la empresa
    const { data: wfCheck, error: checkErr } = await (supabaseAdmin as any)
      .from("automation_workflows")
      .select("id, ui_mode")
      .eq("id", data.workflowId)
      .eq("company_id", companyId)
      .maybeSingle();

    if (checkErr || !wfCheck) {
      throw new Error("El flujo no existe o no pertenece a esta empresa.");
    }

    // El cambio a 'canvas' ocurre exclusivamente si se edita/guarda desde automacoes.$workflowId.tsx (switchUiModeToCanvas: true o graph.settings.ui_mode === 'canvas').
    // Si se guarda o actualiza desde QuickRulesModal, preserva estrictamente 'quick_rule'.
    const targetUiMode =
      data.switchUiModeToCanvas
        ? "canvas"
        : (data.ui_mode || (parsedGraph.settings?.ui_mode === "quick_rule" ? "quick_rule" : (wfCheck.ui_mode || "canvas")));
    parsedGraph.settings.ui_mode = targetUiMode;

    // Obtener última versión existente con reintento ante colisión de versión
    let savedVer: any = null;
    let nextVer = 1;

    for (let attempt = 0; attempt < 3; attempt++) {
      const { data: latestVer } = await (supabaseAdmin as any)
        .from("automation_workflow_versions")
        .select("version_number")
        .eq("company_id", companyId)
        .eq("workflow_id", data.workflowId)
        .order("version_number", { ascending: false })
        .limit(1)
        .maybeSingle();

      nextVer = (latestVer?.version_number || 0) + 1;

      const { data: inserted, error: insErr } = await (supabaseAdmin as any)
        .from("automation_workflow_versions")
        .insert({
          company_id: companyId,
          workflow_id: data.workflowId,
          version_number: nextVer,
          graph: parsedGraph,
          schema_version: 1,
          created_by: context.userId,
        })
        .select("id, version_number")
        .single();

      if (!insErr && inserted) {
        savedVer = inserted;
        break;
      }
    }

    if (!savedVer) {
      throw new Error("No se pudo guardar la versión de borrador tras reintentos.");
    }

    const updates: Record<string, any> = {
      updated_at: new Date().toISOString(),
      updated_by: context.userId,
      ui_mode: targetUiMode,
    };
    if (data.name) updates.name = data.name.trim();
    if (data.description !== undefined) updates.description = data.description?.trim() || null;

    const { error: upErr } = await (supabaseAdmin as any)
      .from("automation_workflows")
      .update(updates)
      .eq("id", data.workflowId)
      .eq("company_id", companyId);

    if (upErr) {
      throw new Error(`Error al actualizar el flujo: ${upErr.message}`);
    }

    return {
      ok: true,
      versionNumber: savedVer.version_number,
      versionId: savedVer.id,
      hasUnpublishedChanges: true,
      ui_mode: targetUiMode,
    };
  });

export const publishWorkflowFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { workflowId: string; graph: any; name?: string }) => {
    if (!d?.workflowId || !d?.graph) throw new Error("Datos incompletos");
    return d;
  })
  .handler(async ({ context, data }) => {
    const companyId = await resolveCompanyIdCached(context.supabase, context.userId);
    await assertAutomationEditor(companyId, context.userId);
    const parsedGraph = WorkflowGraphSchema.parse(data.graph);

    // 1. Validar que el flujo pertenece a la empresa
    const { data: wfCheck, error: checkErr } = await (supabaseAdmin as any)
      .from("automation_workflows")
      .select("id")
      .eq("id", data.workflowId)
      .eq("company_id", companyId)
      .maybeSingle();

    if (checkErr || !wfCheck) {
      throw new Error("El flujo no existe o no pertenece a esta empresa.");
    }

    // 2. Validación exhaustiva de estructura de grafo
    const validation = validateWorkflowGraphStructure(parsedGraph);
    if (!validation.valid) {
      throw new Error(`Validación de estructura fallida: ${validation.errors.map((e) => e.message).join(" | ")}`);
    }

    // 2b. Validación exhaustiva de cada nodo contra su schema y reglas de negocio
    const nodeValidationErrors = validateWorkflowNodes(parsedGraph);
    if (nodeValidationErrors.length > 0) {
      throw new Error("Não é possível publicar: " + nodeValidationErrors.join("; "));
    }

    // 3. Crear versión inmutable
    let publishedVer: any = null;
    let newVersionNumber = 1;

    for (let attempt = 0; attempt < 3; attempt++) {
      const { data: latestVer } = await (supabaseAdmin as any)
        .from("automation_workflow_versions")
        .select("version_number")
        .eq("company_id", companyId)
        .eq("workflow_id", data.workflowId)
        .order("version_number", { ascending: false })
        .limit(1)
        .maybeSingle();

      newVersionNumber = (latestVer?.version_number || 0) + 1;

      const { data: inserted, error: verErr } = await (supabaseAdmin as any)
        .from("automation_workflow_versions")
        .insert({
          company_id: companyId,
          workflow_id: data.workflowId,
          version_number: newVersionNumber,
          graph: parsedGraph,
          schema_version: 1,
          published_by: context.userId,
          published_at: new Date().toISOString(),
          created_by: context.userId,
        })
        .select("id, version_number")
        .single();

      if (!verErr && inserted) {
        publishedVer = inserted;
        break;
      }
    }

    if (!publishedVer) {
      throw new Error("No se pudo crear la versión inmutable de publicación.");
    }

    // 4. Activar versión en el flujo comprobando resultado de la escritura
    const targetUiMode = parsedGraph.settings.ui_mode || "canvas";
    const updates: Record<string, any> = {
      status: "published",
      active_version_id: publishedVer.id,
      ui_mode: targetUiMode,
      updated_at: new Date().toISOString(),
      updated_by: context.userId,
    };
    if (data.name?.trim()) {
      updates.name = data.name.trim();
    }
    const { error: pubErr } = await (supabaseAdmin as any)
      .from("automation_workflows")
      .update(updates)
      .eq("id", data.workflowId)
      .eq("company_id", companyId);

    if (pubErr) {
      throw new Error(`Error al activar la versión publicada: ${pubErr.message}`);
    }

    try {
      const { syncWorkflowWebhookEndpoints } = await import("./webhook-endpoints.server");
      await syncWorkflowWebhookEndpoints(supabaseAdmin, companyId, data.workflowId, parsedGraph);
    } catch (err) {
      console.error("Error sincronizando webhook endpoints al publicar:", err);
    }

    return {
      ok: true,
      versionNumber: publishedVer.version_number,
      versionId: publishedVer.id,
      hasUnpublishedChanges: false,
    };
  });

export const getWorkflowWebhookEndpointsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { workflowId: string }) => {
    if (!d?.workflowId) throw new Error("workflowId es requerido");
    return d;
  })
  .handler(async ({ context, data }) => {
    const companyId = await resolveCompanyIdCached(context.supabase, context.userId);
    const { data: endpoints, error } = await (supabaseAdmin as any)
      .from("automation_webhook_endpoints")
      .select("id, node_id, token, active, last_called_at, created_at, updated_at")
      .eq("company_id", companyId)
      .eq("workflow_id", data.workflowId);

    if (error) throw new Error(error.message);
    return (endpoints || []) as any[];
  });

export const toggleWorkflowStatusFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { workflowId: string; status: "published" | "paused" | "draft" }) => d)
  .handler(async ({ context, data }) => {
    const companyId = await resolveCompanyIdCached(context.supabase, context.userId);
    await assertAutomationEditor(companyId, context.userId);

    const { data: wf, error: wfErr } = await (supabaseAdmin as any)
      .from("automation_workflows")
      .select("id, active_version_id")
      .eq("id", data.workflowId)
      .eq("company_id", companyId)
      .maybeSingle();

    if (wfErr || !wf) throw new Error("Flujo no encontrado o no pertenece a esta empresa.");

    if (data.status === "published" && !wf.active_version_id) {
      throw new Error("No se puede activar un flujo sin una versión publicada. Abre el canvas y haz clic en 'Publicar'.");
    }

    const { error: upErr } = await (supabaseAdmin as any)
      .from("automation_workflows")
      .update({ status: data.status, updated_at: new Date().toISOString(), updated_by: context.userId })
      .eq("id", data.workflowId)
      .eq("company_id", companyId);

    if (upErr) throw new Error(`Error actualizando estado del flujo: ${upErr.message}`);

    return { ok: true, status: data.status };
  });

export const deleteWorkflowFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { workflowId: string }) => d)
  .handler(async ({ context, data }) => {
    const companyId = await resolveCompanyIdCached(context.supabase, context.userId);
    await assertAutomationEditor(companyId, context.userId);

    const { error: delErr } = await (supabaseAdmin as any)
      .from("automation_workflows")
      .update({ status: "archived", archived_at: new Date().toISOString(), updated_by: context.userId })
      .eq("id", data.workflowId)
      .eq("company_id", companyId);

    if (delErr) throw new Error(`Error archivando flujo: ${delErr.message}`);

    return { ok: true };
  });

export const listExecutionsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d?: { workflowId?: string; limit?: number }) => d || {})
  .handler(async ({ context, data }) => {
    const companyId = await resolveCompanyIdCached(context.supabase, context.userId);
    let query = (supabaseAdmin as any)
      .from("automation_executions")
      .select("id, workflow_id, status, source_channel, external_conversation_id, error_code, error_summary, started_at, finished_at, created_at")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(Math.min(data?.limit || 50, 100));

    if (data?.workflowId) {
      query = query.eq("workflow_id", data.workflowId);
    }

    const { data: list } = await query;
    return (list || []) as any[];
  });

export const getExecutionDetailFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { executionId: string }) => d)
  .handler(async ({ context, data }) => {
    const companyId = await resolveCompanyIdCached(context.supabase, context.userId);

    const { data: exec } = await (supabaseAdmin as any)
      .from("automation_executions")
      .select("*")
      .eq("id", data.executionId)
      .eq("company_id", companyId)
      .maybeSingle();

    if (!exec) throw new Error("Ejecución no encontrada");

    const { data: stepRuns } = await (supabaseAdmin as any)
      .from("automation_step_runs")
      .select("*")
      .eq("execution_id", data.executionId)
      .eq("company_id", companyId)
      .order("started_at", { ascending: true });

    return {
      execution: exec,
      exec: exec, // P1.8: Compatibilidade total de contrato em ambas as propriedades
      steps: stepRuns || [],
    };
  });

export const getAvailableChannelsAndConnectionsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const companyId = await resolveCompanyIdCached(context.supabase, context.userId);

    const [{ data: instances }, { data: stages }, { data: pipelines }, { data: owners }] = await Promise.all([
      (supabaseAdmin as any)
        .from("whatsapp_instances")
        .select("id, instance_name, display_name, provider, status")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false }),
      (supabaseAdmin as any)
        .from("crm_stage")
        .select("id, nome, cor, pipeline_id")
        .eq("company_id", companyId)
        .order("ordem", { ascending: true }),
      (supabaseAdmin as any)
        .from("crm_pipeline")
        .select("id, nome")
        .eq("company_id", companyId)
        .order("ordem", { ascending: true }),
      (supabaseAdmin as any)
        .from("company_user")
        .select("user_id, role")
        .eq("company_id", companyId)
        .eq("ativo", true),
    ]);

    return {
      instances: (instances || []) as any[],
      stages: (stages || []) as any[],
      pipelines: (pipelines || []) as any[],
      owners: (owners || []).map((o: any) => ({ id: o.user_id, name: `Usuário (${o.role})` })),
    };
  });

export const duplicateWorkflowFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { workflowId: string }) => {
    if (!d?.workflowId) throw new Error("workflowId es requerido");
    return d;
  })
  .handler(async ({ context, data }) => {
    const companyId = await resolveCompanyIdCached(context.supabase, context.userId);
    await assertAutomationEditor(companyId, context.userId);

    const { data: srcWf, error: srcErr } = await (supabaseAdmin as any)
      .from("automation_workflows")
      .select("*")
      .eq("id", data.workflowId)
      .eq("company_id", companyId)
      .maybeSingle();

    if (srcErr || !srcWf) {
      throw new Error("Flujo no encontrado o no pertenece a esta empresa.");
    }

    let clonedGraph: any = null;
    if (srcWf.active_version_id) {
      const { data: actVer } = await (supabaseAdmin as any)
        .from("automation_workflow_versions")
        .select("graph")
        .eq("id", srcWf.active_version_id)
        .eq("company_id", companyId)
        .maybeSingle();
      if (actVer?.graph) clonedGraph = actVer.graph;
    }

    if (!clonedGraph) {
      const { data: latestVer } = await (supabaseAdmin as any)
        .from("automation_workflow_versions")
        .select("graph")
        .eq("workflow_id", srcWf.id)
        .eq("company_id", companyId)
        .order("version_number", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (latestVer?.graph) clonedGraph = latestVer.graph;
    }

    if (!clonedGraph) {
      throw new Error("El flujo origen no contiene versiones válidas para clonar.");
    }

    const newName = `${srcWf.name} (Cópia)`;
    const targetUiMode = srcWf.ui_mode || "canvas";

    const { data: newWf, error: newErr } = await (supabaseAdmin as any)
      .from("automation_workflows")
      .insert({
        company_id: companyId,
        name: newName,
        description: srcWf.description || null,
        status: "draft",
        active_version_id: null,
        ui_mode: targetUiMode,
        created_by: context.userId,
        updated_by: context.userId,
      })
      .select("id")
      .single();

    if (newErr || !newWf) {
      throw new Error(`Error al clonar flujo: ${newErr?.message}`);
    }

    const { error: verErr } = await (supabaseAdmin as any)
      .from("automation_workflow_versions")
      .insert({
        company_id: companyId,
        workflow_id: newWf.id,
        version_number: 1,
        graph: clonedGraph,
        schema_version: 1,
        created_by: context.userId,
      });

    if (verErr) {
      throw new Error(`Error al crear versión clonada: ${verErr.message}`);
    }

    return { success: true, workflowId: newWf.id };
  });

export const listMetaPostsForInstanceFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { instanceId: string; limit?: number }) => data)
  .handler(async ({ data, context }) => {
    const companyId = await resolveCompanyIdCached(context.supabase, context.userId);
    if (!companyId) throw new Error("Empresa não identificada.");

    const { data: inst, error: instErr } = await (supabaseAdmin as any)
      .from("whatsapp_instances")
      .select("id, instance_token, phone_number_id, provider, company_id")
      .eq("company_id", companyId)
      .eq("id", data.instanceId)
      .maybeSingle();

    if (instErr || !inst?.instance_token) {
      throw new Error("Instância Meta não encontrada ou sem token de acesso.");
    }
    const pageOrIgId = inst.phone_number_id || inst.id;
    if (!pageOrIgId) {
      throw new Error("Instância Meta sem ID de página ou conta do Instagram vinculada.");
    }

    const { metaListPagePosts } = await import("@/lib/meta.server");
    const isInstagram = String(inst.provider || "").toLowerCase().includes("instagram");
    const rawPosts = await metaListPagePosts(inst.instance_token, pageOrIgId, {
      limit: Math.min(data.limit || 20, 30),
      instagram: isInstagram,
    }).catch((err) => {
      console.warn("[listMetaPostsForInstanceFn] Erro ao listar posts da Meta:", err?.message || err);
      return [];
    });

    const items = Array.isArray(rawPosts) ? rawPosts : (rawPosts as any)?.data || [];
    return {
      posts: items.map((p: any) => ({
        id: String(p.id || ""),
        caption: String(p.caption || p.message || "").trim(),
        thumbnailUrl: p.thumbnail_url || p.media_url || null,
        permalink: p.permalink || null,
        timestamp: p.timestamp || p.created_time || null,
        mediaType: String(p.media_type || "IMAGE"),
      })),
    };
  });

export const uploadAutomationMediaFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { fileName: string; mimeType: string; base64: string }) => data)
  .handler(async ({ data, context }) => {
    const companyId = await resolveCompanyIdCached(context.supabase, context.userId);
    if (!companyId) throw new Error("Empresa não identificada.");
    await assertAutomationEditor(companyId, context.userId);

    if (!data.base64) throw new Error("Nenhum arquivo enviado.");
    const cleanBase64 = data.base64.replace(/^data:[^;]+;base64,/, "");
    const buffer = Buffer.from(cleanBase64, "base64");
    if (buffer.byteLength > 15 * 1024 * 1024) {
      throw new Error("O arquivo excede o limite máximo permitido de 15 MB.");
    }

    const { storeMediaObject, resolveR2DownloadUrlAsync } = await import("@/lib/storage/r2.server");
    const stored = await storeMediaObject({
      companyId,
      bytes: buffer,
      mimeType: data.mimeType || "application/octet-stream",
      fileName: data.fileName || "upload.bin",
    });

    const url =
      stored.storageUrl ||
      (await resolveR2DownloadUrlAsync(stored.storageKey, 86400 * 365, stored.storageAccountId));

    return {
      url,
      storageKey: stored.storageKey,
      fileName: stored.fileName,
      mimeType: stored.mimeType,
    };
  });

// ==========================================
// SPRINT 4: OBSERVABILIDADE, CONTROLE E DRY-RUN
// ==========================================

export const getWorkflowNodeStatsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { workflowId: string; days?: number }) => d)
  .handler(async ({ context, data }) => {
    const companyId = await resolveCompanyIdCached(context.supabase, context.userId);
    const days = data.days && data.days > 0 ? data.days : 30;
    const cutoffIso = new Date(Date.now() - days * 86_400_000).toISOString();

    const { data: execs, error: execErr } = await (supabaseAdmin as any)
      .from("automation_executions")
      .select("id")
      .eq("company_id", companyId)
      .eq("workflow_id", data.workflowId)
      .gte("created_at", cutoffIso)
      .limit(1000);

    if (execErr || !execs || execs.length === 0) {
      return {};
    }

    const execIds = execs.map((e: any) => e.id);
    const stats: Record<string, { succeeded: number; waiting: number; failed: number }> = {};

    const chunkSize = 200;
    for (let i = 0; i < execIds.length; i += chunkSize) {
      const chunk = execIds.slice(i, i + chunkSize);
      const { data: steps, error: stepErr } = await (supabaseAdmin as any)
        .from("automation_step_runs")
        .select("node_id, status")
        .eq("company_id", companyId)
        .in("execution_id", chunk);

      if (stepErr || !steps) continue;

      for (const s of steps) {
        const nid = s.node_id;
        if (!nid) continue;
        if (!stats[nid]) stats[nid] = { succeeded: 0, waiting: 0, failed: 0 };
        if (s.status === "succeeded") stats[nid].succeeded++;
        else if (s.status === "waiting") stats[nid].waiting++;
        else if (s.status === "failed") stats[nid].failed++;
      }
    }

    return stats;
  });

export const retryExecutionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { executionId: string }) => d)
  .handler(async ({ context, data }) => {
    const companyId = await resolveCompanyIdCached(context.supabase, context.userId);
    await assertAutomationEditor(companyId, context.userId);

    const { data: exec, error: execErr } = await (supabaseAdmin as any)
      .from("automation_executions")
      .select("id, company_id, status, current_node_id")
      .eq("id", data.executionId)
      .eq("company_id", companyId)
      .maybeSingle();

    if (execErr || !exec) {
      throw new Error("Execução não encontrada.");
    }

    if (!["failed", "needs_review"].includes(exec.status) || !exec.current_node_id) {
      throw new Error("Apenas execuções com falha ou revisão pendente e nó ativo podem ser reintentadas.");
    }

    await (supabaseAdmin as any)
      .from("automation_executions")
      .update({
        status: "running",
        error_code: null,
        error_summary: null,
        finished_at: null,
      })
      .eq("id", data.executionId)
      .eq("company_id", companyId);

    await (supabaseAdmin as any)
      .from("automation_jobs")
      .insert({
        company_id: companyId,
        execution_id: data.executionId,
        node_id: exec.current_node_id,
        status: "pending",
        idempotency_key: `retry_${data.executionId}_${Date.now()}`,
        run_after: new Date().toISOString(),
        attempts: 0,
      });

    try {
      const { drainImmediateAutomationJobs } = await import("@/lib/automations/queue.server");
      await drainImmediateAutomationJobs({ workerId: "manual_retry", maxJobs: 8, maxTimeMs: 3000 });
    } catch (drainErr: any) {
      console.warn("[retryExecutionFn] Aviso drenando jobs imediatos:", drainErr?.message);
    }

    return { ok: true };
  });

export const cancelExecutionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { executionId: string }) => d)
  .handler(async ({ context, data }) => {
    const companyId = await resolveCompanyIdCached(context.supabase, context.userId);
    await assertAutomationEditor(companyId, context.userId);

    const { data: exec, error: execErr } = await (supabaseAdmin as any)
      .from("automation_executions")
      .select("id, company_id, status, external_conversation_id, source_channel")
      .eq("id", data.executionId)
      .eq("company_id", companyId)
      .maybeSingle();

    if (execErr || !exec) {
      throw new Error("Execução não encontrada.");
    }

    if (["queued", "running", "waiting"].includes(exec.status)) {
      await (supabaseAdmin as any)
        .from("automation_executions")
        .update({
          status: "cancelled",
          finished_at: new Date().toISOString(),
          error_code: "CANCELLED_BY_USER",
          error_summary: "Cancelada manualmente pelo operador",
        })
        .eq("id", data.executionId)
        .eq("company_id", companyId);

      await (supabaseAdmin as any)
        .from("automation_jobs")
        .update({ status: "cancelled" })
        .eq("company_id", companyId)
        .eq("execution_id", data.executionId)
        .eq("status", "pending");

      if (exec.external_conversation_id) {
        try {
          const { releaseWorkflowControl } = await import("@/lib/automations/conversation-control.server");
          await releaseWorkflowControl({
            companyId,
            externalConversationId: exec.external_conversation_id,
            executionId: data.executionId,
          });
        } catch (relErr: any) {
          console.warn("[cancelExecutionFn] Aviso liberando controle do bot:", relErr?.message);
        }
      }
    }

    return { ok: true };
  });

export const simulateWorkflowDryRunFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      graph: any;
      sampleText?: string;
      sampleChannel?: string;
      sampleCardId?: string | null;
    }) => d
  )
  .handler(async ({ context, data }) => {
    const companyId = await resolveCompanyIdCached(context.supabase, context.userId);
    const { WorkflowGraphSchema, validateWorkflowGraphStructure, isTriggerNodeType } = await import("@/lib/automations/schema");
    const { interpolateVariables } = await import("@/lib/automations/registry.server");

    const parsedGraph = WorkflowGraphSchema.parse(data.graph);
    const structRes = validateWorkflowGraphStructure(parsedGraph);
    if (!structRes.valid) throw new Error(structRes.errors.map((e) => e.message).join(", "));

    let sampleCard: any = null;
    if (data.sampleCardId) {
      try {
        const { data: c } = await (supabaseAdmin as any)
          .from("crm_cards")
          .select("id, titulo, email, numero, valor, tags, campos_extras")
          .eq("id", data.sampleCardId)
          .eq("company_id", companyId)
          .maybeSingle();
        if (c) sampleCard = c;
      } catch {}
    }

    if (!sampleCard) {
      sampleCard = {
        id: "00000000-0000-0000-0000-000000000001",
        titulo: "Lead Simulado",
        nome: "Lead Simulado",
        numero: "5511999999999",
        email: "teste@exemplo.com",
        tags: ["teste-simulacao"],
        valor: 1500,
        campos_extras: { origem: "simulacao" },
      };
    }

    const sampleText = data.sampleText || "Olá, gostaria de saber mais informações";
    const sampleChannel = data.sampleChannel || "whatsapp";

    const simContext: Record<string, any> = {
      trigger: {
        text: sampleText,
        senderId: sampleCard.numero,
        channel: sampleChannel,
        cardId: sampleCard.id,
      },
      card: sampleCard,
      lastReply: { text: sampleText },
      extracted: {},
    };

    const visitedNodeIds: string[] = [];
    const visitedEdgeIds: string[] = [];
    const steps: Array<{
      nodeId: string;
      nodeName: string;
      nodeType: string;
      portTaken: string | null;
      preview: string;
    }> = [];

    const triggers = parsedGraph.nodes.filter((n) => isTriggerNodeType(n.type));
    let currentNode =
      triggers.find((t) => {
        if (sampleChannel === "instagram_dm" || sampleChannel === "facebook_messenger") {
          return t.type === "meta.comment_received" || t.type === "messaging.inbound_received";
        }
        if (sampleChannel === "telegram") {
          return t.type.startsWith("telegram.") || t.type === "messaging.inbound_received";
        }
        return t.type === "messaging.inbound_received";
      }) || triggers[0] || parsedGraph.nodes[0];

    if (!currentNode) {
      return { ok: true, visitedNodeIds: [], visitedEdgeIds: [], steps: [] };
    }

    let currentStepCount = 0;
    const maxSteps = 25;

    while (currentNode && currentStepCount < maxSteps) {
      currentStepCount++;
      visitedNodeIds.push(currentNode.id);

      const cfg = (currentNode.config as Record<string, any>) || {};
      let portTaken: string | null = "next";
      let preview = "";

      if (isTriggerNodeType(currentNode.type)) {
        portTaken = "next";
        preview = `Disparado com texto: "${sampleText}"`;
      } else if (currentNode.type === "condition.if_else") {
        const fieldVal = interpolateVariables(cfg.field || "{{trigger.text}}", simContext);
        const op = cfg.operator || "contains";
        const targetVal = cfg.value || "";
        let isMatch = false;
        if (op === "contains") isMatch = String(fieldVal).toLowerCase().includes(String(targetVal).toLowerCase());
        else if (op === "not_contains") isMatch = !String(fieldVal).toLowerCase().includes(String(targetVal).toLowerCase());
        else if (op === "equals") isMatch = String(fieldVal).toLowerCase() === String(targetVal).toLowerCase();
        else if (op === "not_equals") isMatch = String(fieldVal).toLowerCase() !== String(targetVal).toLowerCase();
        else if (op === "is_empty") isMatch = !fieldVal;
        else if (op === "is_not_empty") isMatch = Boolean(fieldVal);
        else isMatch = true;

        portTaken = isMatch ? "true" : "false";
        preview = `Condição (${cfg.field} ${op} "${targetVal}") => ${isMatch ? "Verdadeiro (Sim)" : "Falso (Não)"}`;
      } else if (currentNode.type === "condition.router") {
        const branches = Array.isArray(cfg.branches) ? cfg.branches : [];
        let matchedBranchId: string | null = null;

        for (const b of branches) {
          const logic = b.logic || "AND";
          const rules = Array.isArray(b.rules) ? b.rules : [];
          if (rules.length === 0) continue;

          const results = rules.map((r: any) => {
            const val = interpolateVariables(r.field || "{{trigger.text}}", simContext);
            const op = r.operator || "contains";
            const tVal = r.value || "";
            if (op === "contains") return String(val).toLowerCase().includes(String(tVal).toLowerCase());
            if (op === "not_contains") return !String(val).toLowerCase().includes(String(tVal).toLowerCase());
            if (op === "equals") return String(val).toLowerCase() === String(tVal).toLowerCase();
            if (op === "not_equals") return String(val).toLowerCase() !== String(tVal).toLowerCase();
            if (op === "is_empty") return !val;
            if (op === "is_not_empty") return Boolean(val);
            return true;
          });

          const passed = logic === "OR" ? results.some(Boolean) : results.every(Boolean);
          if (passed) {
            matchedBranchId = b.id;
            break;
          }
        }

        if (matchedBranchId) {
          portTaken = matchedBranchId;
          const bObj = branches.find((b: any) => b.id === matchedBranchId);
          preview = `Roteado para porta "${bObj?.label || matchedBranchId}"`;
        } else if (cfg.elseFallback !== false) {
          portTaken = "else";
          preview = "Nenhuma regra satisfeita => Roteado para porta Senão (Else)";
        } else {
          portTaken = null;
          preview = "Nenhum ramo satisfeito e sem fallback => Interrompido";
        }
      } else if (currentNode.type === "ai.classify_and_route") {
        const intents = Array.isArray(cfg.intents) ? cfg.intents : [];
        if (intents.length > 0) {
          const sampleLower = sampleText.toLowerCase();
          const matched = intents.find((i: any) =>
            sampleLower.includes(String(i.label || "").toLowerCase()) ||
            sampleLower.includes(String(i.description || "").toLowerCase())
          );
          if (matched) {
            portTaken = matched.id;
            preview = `IA detectou intenção "${matched.label}" (Simulação)`;
          } else {
            portTaken = intents[0].id;
            preview = `IA selecionou ramo "${intents[0].label}" (Confiança 0.92)`;
          }
        } else {
          portTaken = "fallback";
          preview = "Sem intenções configuradas => Fallback";
        }
      } else if (currentNode.type === "control.business_hours") {
        if (cfg.mode === "wait_until_open") {
          portTaken = "next";
          preview = "Modo Aguardar Abertura => Continuaria na próxima abertura comercial";
        } else {
          portTaken = "open";
          preview = "Modo Horário Comercial => Porta Aberto (Horário de atendimento)";
        }
      } else if (currentNode.type === "control.split_ab") {
        const variants = Array.isArray(cfg.variants) && cfg.variants.length > 0 ? cfg.variants : [{ id: "variant_a", label: "A" }];
        portTaken = variants[0].id;
        preview = `Teste A/B: Selecionou variante "${variants[0].label || variants[0].id}" (50% tráfego)`;
      } else if (currentNode.type === "messaging.send_text") {
        const text = interpolateVariables(cfg.text || "", simContext);
        portTaken = "next";
        preview = `Enviaria mensagem: "${text}"`;
      } else if (currentNode.type === "messaging.send_media") {
        portTaken = "next";
        preview = `Enviaria mídia (${cfg.mediaType || "imagem"}): "${cfg.caption ? interpolateVariables(cfg.caption, simContext) : "Sem legenda"}"`;
      } else if (currentNode.type === "messaging.send_interactive") {
        const options = Array.isArray(cfg.options) && cfg.options.length > 0 ? cfg.options : [{ id: "opt_1", label: "Opção 1" }];
        portTaken = options[0].id;
        preview = `Enviaria menu (${options.length} opções). Avança pela 1ª opção: "${options[0].label}"`;
      } else if (currentNode.type === "messaging.collect_input") {
        portTaken = "valid";
        preview = `Captura de dado (${cfg.targetField || "custom"}). Simula entrada válida.`;
      } else if (currentNode.type === "messaging.wait_for_reply") {
        portTaken = "reply";
        preview = "Aguardar Resposta: Simula resposta recebida pelo lead";
      } else if (currentNode.type === "meta.send_private_reply") {
        const text = interpolateVariables(cfg.message || "", simContext);
        portTaken = "next";
        preview = `Enviaria DM Privado (Instagram/FB): "${text}"`;
      } else if (currentNode.type === "meta.reply_comment") {
        portTaken = "next";
        preview = `Responderia comentário público: "${cfg.message || "Resposta"}" (com delay simulado)`;
      } else if (currentNode.type === "meta.capi_event") {
        portTaken = "next";
        preview = `Enviaria evento Meta CAPI "${cfg.eventName || "QualifiedLead"}" (valor: ${cfg.valueTemplate || "0"} ${cfg.currency || "BRL"})`;
      } else if (currentNode.type === "ai.extract_fields") {
        portTaken = "next";
        const fieldKeys = (cfg.fields || []).map((f: any) => f.key).join(", ");
        preview = `IA extrairia dados para o CRM: [${fieldKeys || "campos"}]`;
      } else if (currentNode.type === "http.webhook") {
        portTaken = "next";
        preview = `Dispararia requisição HTTP ${cfg.method || "POST"} para ${cfg.url || "URL"}`;
      } else if (currentNode.type === "internal.notify") {
        portTaken = "next";
        preview = `Alerta interno: "${cfg.title || "Alerta"}" (nota no card + sininho)`;
      } else if (currentNode.type === "crm.round_robin_assign") {
        portTaken = "next";
        preview = "Distribuiria o lead para o próximo corretor da fila circular";
      } else if (currentNode.type === "crm.update_field") {
        portTaken = "next";
        preview = `Atualizaria campo "${cfg.field}" com valor "${interpolateVariables(cfg.value || "", simContext)}"`;
      } else if (currentNode.type === "crm.add_tag") {
        portTaken = "next";
        preview = `Adicionaria etiqueta CRM: "${cfg.tag || "tag"}"`;
      } else if (currentNode.type === "crm.remove_tag") {
        portTaken = "next";
        preview = `Removeria etiqueta CRM: "${cfg.tag || "tag"}"`;
      } else if (currentNode.type === "crm.move_card_to_stage") {
        portTaken = "next";
        preview = "Moveria cartão no funil de vendas";
      } else if (currentNode.type === "control.wait_duration") {
        portTaken = "next";
        preview = `Pausa simulada de ${cfg.durationValue || 5} ${cfg.durationUnit || "minutes"}`;
      } else if (
        currentNode.type === "messaging.route_to_human" ||
        currentNode.type === "telegram.route_to_human" ||
        currentNode.type === "control.end"
      ) {
        portTaken = null;
        preview = "Ponto terminal do fluxo: Execução concluída.";
      } else {
        portTaken = "next";
        preview = `Ação executada (${currentNode.name || currentNode.type})`;
      }

      steps.push({
        nodeId: currentNode.id,
        nodeName: currentNode.name || currentNode.type,
        nodeType: currentNode.type,
        portTaken,
        preview,
      });

      if (!portTaken) {
        break;
      }

      const nextEdge =
        parsedGraph.edges.find(
          (e) => e.source === currentNode.id && (e.sourcePort || (e as any).sourceHandle || "next") === portTaken
        ) || parsedGraph.edges.find((e) => e.source === currentNode.id);

      if (nextEdge) {
        visitedEdgeIds.push(nextEdge.id);
        const nextNode = parsedGraph.nodes.find((n) => n.id === nextEdge.target);
        if (!nextNode || visitedNodeIds.includes(nextNode.id)) {
          if (visitedNodeIds.includes(nextNode?.id || "")) {
            steps.push({
              nodeId: nextNode?.id || "loop",
              nodeName: "Loop Detectado",
              nodeType: "system.loop",
              portTaken: null,
              preview: "Loop detectado no fluxo. Simulação interrompida.",
            });
          }
          break;
        }
        currentNode = nextNode;
      } else {
        break;
      }
    }

    return {
      ok: true,
      visitedNodeIds,
      visitedEdgeIds,
      steps,
    };
  });

