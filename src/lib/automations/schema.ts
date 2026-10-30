// src/lib/automations/schema.ts
import { z } from "zod";

export const NodePositionSchema = z.object({
  x: z.number(),
  y: z.number(),
});

export const NodeBaseSchema = z.object({
  id: z.string().min(1).max(100),
  type: z.string().min(1),
  version: z.number().int().positive().default(1),
  position: NodePositionSchema,
  config: z.record(z.string(), z.unknown()).default({}),
});

export const EdgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  sourcePort: z.string().default("next"),
  target: z.string().min(1),
  targetPort: z.string().default("input"),
});

export const WorkflowSettingsSchema = z.object({
  reentry: z.enum(["allow", "deny_while_active", "replace_active"]).default("deny_while_active"),
  maxRuntimeSeconds: z.number().int().min(1).max(86400 * 30).default(86400),
  maxSteps: z.number().int().min(1).max(500).default(100),
});

export const WorkflowGraphSchema = z.object({
  schemaVersion: z.literal(1).default(1),
  nodes: z.array(NodeBaseSchema).min(1, "El flujo debe contener al menos un nodo").max(100, "Máximo 100 nodos por flujo"),
  edges: z.array(EdgeSchema).max(200, "Máximo 200 aristas por flujo").default([]),
  settings: WorkflowSettingsSchema.default({
    reentry: "deny_while_active",
    maxRuntimeSeconds: 86400,
    maxSteps: 100,
  }),
});

export type WorkflowGraph = z.infer<typeof WorkflowGraphSchema>;
export type WorkflowNode = z.infer<typeof NodeBaseSchema>;
export type WorkflowEdge = z.infer<typeof EdgeSchema>;

export interface ValidationError {
  nodeId?: string;
  edgeId?: string;
  message: string;
}

export function validateWorkflowGraphStructure(graph: WorkflowGraph): { valid: boolean; errors: ValidationError[] } {
  const errors: ValidationError[] = [];

  const nodeMap = new Map<string, WorkflowNode>();
  const triggers: WorkflowNode[] = [];
  const inDegree = new Map<string, number>();
  const adjList = new Map<string, string[]>();

  for (const node of graph.nodes) {
    if (nodeMap.has(node.id)) {
      errors.push({ nodeId: node.id, message: `ID de nodo duplicado: "${node.id}"` });
    }
    nodeMap.set(node.id, node);
    inDegree.set(node.id, 0);
    adjList.set(node.id, []);

    if (node.type.startsWith("messaging.inbound") || node.type.startsWith("crm.card")) {
      triggers.push(node);
    }
  }

  if (triggers.length === 0) {
    errors.push({ message: "El flujo debe comenzar con al menos un nodo disparador (Trigger)." });
  } else if (triggers.length > 1) {
    errors.push({ message: "En esta versión, cada flujo debe tener exactamente un nodo disparador." });
  }

  const seenEdges = new Set<string>();

  for (const edge of graph.edges) {
    const edgeKey = `${edge.source}:${edge.sourcePort}->${edge.target}`;
    if (seenEdges.has(edgeKey)) {
      errors.push({ edgeId: edge.id, message: `Conexión duplicada entre nodos: ${edgeKey}` });
    }
    seenEdges.add(edgeKey);

    if (!nodeMap.has(edge.source)) {
      errors.push({ edgeId: edge.id, message: `El enlace apunta desde un nodo inexistente: "${edge.source}"` });
    }
    if (!nodeMap.has(edge.target)) {
      errors.push({ edgeId: edge.id, message: `El enlace apunta hacia un nodo inexistente: "${edge.target}"` });
    } else {
      inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
      if (adjList.has(edge.source)) {
        adjList.get(edge.source)!.push(edge.target);
      }
    }

    if (triggers.some((t) => t.id === edge.target)) {
      errors.push({ edgeId: edge.id, message: "Un nodo disparador no puede recibir conexiones entrantes." });
    }
  }

  // 1. Comprobar alcanzabilidad real desde el Trigger mediante BFS
  const reachableFromTrigger = new Set<string>();
  if (triggers.length > 0) {
    const queue = [triggers[0].id];
    reachableFromTrigger.add(triggers[0].id);

    while (queue.length > 0) {
      const curr = queue.shift()!;
      const neighbors = adjList.get(curr) || [];
      for (const nxt of neighbors) {
        if (!reachableFromTrigger.has(nxt)) {
          reachableFromTrigger.add(nxt);
          queue.push(nxt);
        }
      }
    }

    for (const node of graph.nodes) {
      if (!reachableFromTrigger.has(node.id)) {
        errors.push({ nodeId: node.id, message: `El nodo "${node.id}" no es alcanzable desde el disparador principal.` });
      }
    }
  }

  // 2. Detección de Ciclos (DFS - Algoritmo de Detección de Grafos Acíclicos Dirigidos / DAG)
  const visited = new Set<string>();
  const recStack = new Set<string>();

  function hasCycle(nodeId: string): boolean {
    visited.add(nodeId);
    recStack.add(nodeId);

    const neighbors = adjList.get(nodeId) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        if (hasCycle(neighbor)) return true;
      } else if (recStack.has(neighbor)) {
        return true;
      }
    }

    recStack.delete(nodeId);
    return false;
  }

  for (const node of graph.nodes) {
    if (!visited.has(node.id)) {
      if (hasCycle(node.id)) {
        errors.push({ nodeId: node.id, message: "El flujo contiene un bucle o ciclo infinito (no permitido en esta versión)." });
        break;
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
