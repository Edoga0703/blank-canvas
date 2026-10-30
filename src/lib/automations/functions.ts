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
      .select("id, name, description, status, active_version_id, updated_at, created_at")
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

    // Obtener la versión activa o el último borrador
    let graph: WorkflowGraph | null = null;
    let versionNumber = 1;

    // Cargar la versión más reciente (borrador en edición o publicada) bajo este tenant
    const { data: latestVer } = await (supabaseAdmin as any)
      .from("automation_workflow_versions")
      .select("graph, version_number")
      .eq("company_id", companyId)
      .eq("workflow_id", wf.id)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestVer) {
      graph = latestVer.graph;
      versionNumber = latestVer.version_number;
    }

    // Grafo predeterminado si es nuevo
    if (!graph) {
      graph = {
        schemaVersion: 1,
        nodes: [
          {
            id: "trigger_inbound",
            type: "messaging.inbound_received",
            version: 1,
            position: { x: 100, y: 150 },
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
            position: { x: 450, y: 150 },
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
          maxRuntimeSeconds: 86400,
          maxSteps: 100,
        },
      };
    }

    return {
      workflow: wf,
      graph: graph as any,
      versionNumber,
    };
  });

export const createWorkflowFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { name: string; description?: string }) => {
    if (!d?.name?.trim()) throw new Error("El nombre del flujo es obligatorio");
    return d;
  })
  .handler(async ({ context, data }) => {
    const companyId = await resolveCompanyIdCached(context.supabase, context.userId);
    await assertAutomationEditor(companyId, context.userId);

    const defaultGraph: WorkflowGraph = {
      schemaVersion: 1,
      nodes: [
        {
          id: "trigger_inbound",
          type: "messaging.inbound_received",
          version: 1,
          position: { x: 100, y: 150 },
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
          position: { x: 450, y: 150 },
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
        maxRuntimeSeconds: 86400,
        maxSteps: 100,
      },
    };

    const { data: wf, error } = await (supabaseAdmin as any)
      .from("automation_workflows")
      .insert({
        company_id: companyId,
        name: data.name.trim(),
        description: data.description?.trim() || null,
        status: "draft",
        created_by: context.userId,
        updated_by: context.userId,
      })
      .select("id")
      .single();

    if (error || !wf) throw new Error(error?.message || "Error al crear flujo");

    // Guardar versión 1 borrador
    const { error: verErr } = await (supabaseAdmin as any).from("automation_workflow_versions").insert({
      company_id: companyId,
      workflow_id: wf.id,
      version_number: 1,
      graph: defaultGraph,
      schema_version: 1,
      created_by: context.userId,
    });
    if (verErr) {
      throw new Error(`Error al crear versión inicial del flujo: ${verErr.message}`);
    }

    return { id: wf.id };
  });

export const saveWorkflowDraftFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { workflowId: string; graph: any; name?: string; description?: string }) => {
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
      .select("id")
      .eq("id", data.workflowId)
      .eq("company_id", companyId)
      .maybeSingle();

    if (checkErr || !wfCheck) {
      throw new Error("El flujo no existe o no pertenece a esta empresa.");
    }

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

    return { ok: true, versionNumber: savedVer.version_number, versionId: savedVer.id };
  });

export const publishWorkflowFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { workflowId: string; graph: any }) => {
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

    // 2b. Validación exhaustiva de cada nodo contra su schema y puertos en registry (H8)
    const nodeValidationErrors: string[] = [];
    for (const node of parsedGraph.nodes) {
      const def = getNodeDefinition(node.type, node.version);
      if (!def) {
        nodeValidationErrors.push(`El nodo "${node.id}" tiene un tipo no registrado: "${node.type}".`);
        continue;
      }
      const configRes = def.configSchema.safeParse(node.config || {});
      if (!configRes.success) {
        const issues = configRes.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ");
        nodeValidationErrors.push(`Configuración inválida en nodo "${node.id}" (${def.name}): ${issues}`);
      }

      // Validar puertos de salida usados por las aristas que parten de este nodo
      const outgoingEdges = parsedGraph.edges.filter((e) => e.source === node.id);
      for (const edge of outgoingEdges) {
        const port = edge.sourcePort || "next";
        if (!def.outputPorts.includes(port)) {
          nodeValidationErrors.push(`El puerto de salida "${port}" usado en el enlace "${edge.id}" no existe en el nodo "${node.id}". Puertos válidos: [${def.outputPorts.join(", ")}].`);
        }
      }
      if (node.type === "condition.if_else" || node.type === "messaging.wait_for_reply") {
        for (const port of def.outputPorts) {
          if (!outgoingEdges.some((e) => e.sourcePort === port)) {
            nodeValidationErrors.push(`El nodo "${node.id}" requiere la salida "${port}".`);
          }
        }
      }
      if (node.type === "messaging.send_text" && configRes.success) {
        const cfg = configRes.data as any;
        if (cfg.connectionPolicy === "specific" && !cfg.specificInstanceId) {
          nodeValidationErrors.push(`El nodo "${node.id}" requiere una conexión específica.`);
        }
      }
    }

    if (nodeValidationErrors.length > 0) {
      throw new Error(`Validación de nodos fallida: ${nodeValidationErrors.join(" | ")}`);
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
    const { error: pubErr } = await (supabaseAdmin as any)
      .from("automation_workflows")
      .update({
        status: "published",
        active_version_id: publishedVer.id,
        updated_at: new Date().toISOString(),
        updated_by: context.userId,
      })
      .eq("id", data.workflowId)
      .eq("company_id", companyId);

    if (pubErr) {
      throw new Error(`Error al activar la versión publicada: ${pubErr.message}`);
    }

    return { ok: true, versionNumber: publishedVer.version_number, versionId: publishedVer.id };
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
      .select("id, workflow_id, status, source_channel, external_conversation_id, started_at, finished_at, error_summary, created_at")
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
      .order("started_at", { ascending: true });

    return {
      execution: exec,
      steps: stepRuns || [],
    };
  });

export const getAvailableChannelsAndConnectionsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const companyId = await resolveCompanyIdCached(context.supabase, context.userId);

    const [{ data: instances }, { data: stages }, { data: pipelines }] = await Promise.all([
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
    ]);

    return {
      instances: (instances || []) as any[],
      stages: (stages || []) as any[],
      pipelines: (pipelines || []) as any[],
    };
  });
