// src/lib/automations/webhook-endpoints.server.ts
import { randomBytes, createHash } from "node:crypto";
import type { WorkflowGraph } from "./schema";

export function generateWebhookToken(): string {
  return `whk_${randomBytes(18).toString("hex")}`;
}

export function hashWebhookSecret(secret: string): string {
  return createHash("sha256").update(secret.trim()).digest("hex");
}

export async function syncWorkflowWebhookEndpoints(
  supabaseAdmin: any,
  companyId: string,
  workflowId: string,
  graph: WorkflowGraph
): Promise<void> {
  const inboundNodes = (graph.nodes || []).filter((n) => n.type === "webhook.inbound");
  const inboundNodeIds = new Set(inboundNodes.map((n) => n.id));

  // 1. Obtener endpoints existentes para este workflow
  const { data: existingEndpoints, error: fetchErr } = await supabaseAdmin
    .from("automation_webhook_endpoints")
    .select("id, node_id, token, active")
    .eq("workflow_id", workflowId);

  if (fetchErr) {
    console.error("[syncWorkflowWebhookEndpoints] Error al consultar endpoints:", fetchErr);
    return;
  }

  const existingMap = new Map<string, any>();
  for (const ep of existingEndpoints || []) {
    existingMap.set(ep.node_id, ep);
  }

  // 2. Desactivar endpoints de nodos eliminados
  for (const ep of existingEndpoints || []) {
    if (!inboundNodeIds.has(ep.node_id) && ep.active) {
      try {
        await supabaseAdmin
          .from("automation_webhook_endpoints")
          .update({ active: false, updated_at: new Date().toISOString() })
          .eq("id", ep.id);
      } catch (err) {
        console.error("[syncWorkflowWebhookEndpoints] Error al desactivar endpoint:", err);
      }
    }
  }

  // 3. Crear o actualizar endpoints para los nodos presentes
  for (const node of inboundNodes) {
    const existing = existingMap.get(node.id);
    const token = existing?.token || generateWebhookToken();
    const cfg = (node.config || {}) as any;
    let secretHash: string | null = null;
    if (cfg.requireSecret && cfg.secret) {
      secretHash = hashWebhookSecret(cfg.secret);
    }

    try {
      await supabaseAdmin
        .from("automation_webhook_endpoints")
        .upsert(
          {
            company_id: companyId,
            workflow_id: workflowId,
            node_id: node.id,
            token,
            secret_hash: secretHash,
            active: true,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "workflow_id,node_id" }
        );
    } catch (err) {
      console.error("[syncWorkflowWebhookEndpoints] Error al sincronizar endpoint:", err);
    }
  }
}
