// src/routes/app/automacoes.$workflowId.tsx
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useEffect, useState, useMemo, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
  addEdge,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
  MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import {
  getWorkflowFn,
  saveWorkflowDraftFn,
  publishWorkflowFn,
  listExecutionsFn,
  getAvailableChannelsAndConnectionsFn,
} from "@/lib/automations/functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  ArrowLeft,
  Save,
  Rocket,
  CheckCircle2,
  Clock,
  GitBranch,
  MessageSquare,
  Send,
  UserCheck,
  Bot,
  ArrowRightLeft,
  Tag,
  AlertCircle,
  Hourglass,
  Layers,
  History,
  Check,
  X,
  Loader2,
} from "lucide-react";

export const Route = createFileRoute("/app/automacoes/$workflowId")({
  component: AutomacaoCanvasPage,
});

// ============================================================================
// COMPONENTES DE NODOS PERSONALIZADOS PARA EL CANVAS (@xyflow/react)
// ============================================================================

function TriggerNodeCard({ data, id }: NodeProps) {
  const isMsg = data.type === "messaging.inbound_received";
  return (
    <div className="border-2 border-indigo-500/60 bg-card rounded-2xl p-4 shadow-md w-64 text-xs space-y-2 relative">
      <div className="flex items-center gap-2 text-indigo-600 font-semibold">
        <MessageSquare className="size-4" />
        <span className="truncate">{String(data.name || "Gatilho")}</span>
      </div>
      <p className="text-muted-foreground line-clamp-2">
        {isMsg
          ? `Mensagem recebida (${(data.config as any)?.channels?.join(", ") || "qualquer canal"})`
          : "Disparo automático por evento do CRM"}
      </p>
      <Handle
        type="source"
        position={Position.Bottom}
        id="next"
        className="size-3 bg-indigo-500 border-2 border-white"
      />
    </div>
  );
}

function ActionNodeCard({ data, id }: NodeProps) {
  const isText = data.type === "messaging.send_text";
  const isMove = data.type === "crm.move_card_to_stage";
  const isAi = data.type === "messaging.handoff_to_ai";
  const isHuman = data.type === "messaging.route_to_human";

  return (
    <div className="border-2 border-emerald-500/60 bg-card rounded-2xl p-4 shadow-md w-64 text-xs space-y-2 relative">
      <Handle
        type="target"
        position={Position.Top}
        id="input"
        className="size-3 bg-emerald-500 border-2 border-white"
      />
      <div className="flex items-center gap-2 text-emerald-600 font-semibold">
        {isText && <Send className="size-4" />}
        {isMove && <ArrowRightLeft className="size-4" />}
        {isAi && <Bot className="size-4" />}
        {isHuman && <UserCheck className="size-4" />}
        <span className="truncate">{String(data.name || "Ação")}</span>
      </div>
      <p className="text-muted-foreground line-clamp-2">
        {isText
          ? (data.config as any)?.text || "Configurar texto..."
          : isMove
            ? "Mover lead para etapa..."
            : isAi
              ? "Derivar para IA conversacional"
              : isHuman
                ? "Notificar e pausar bot"
                : "Ação configurada"}
      </p>
      <Handle
        type="source"
        position={Position.Bottom}
        id="next"
        className="size-3 bg-emerald-500 border-2 border-white"
      />
    </div>
  );
}

function ConditionNodeCard({ data, id }: NodeProps) {
  return (
    <div className="border-2 border-amber-500/60 bg-card rounded-2xl p-4 shadow-md w-64 text-xs space-y-2 relative">
      <Handle
        type="target"
        position={Position.Top}
        id="input"
        className="size-3 bg-amber-500 border-2 border-white"
      />
      <div className="flex items-center gap-2 text-amber-600 font-semibold">
        <GitBranch className="size-4" />
        <span className="truncate">{String(data.name || "Condição (Se / Não)")}</span>
      </div>
      <p className="text-muted-foreground line-clamp-2">
        Se { (data.config as any)?.variable || "variável" } { (data.config as any)?.operator || "contém" } &quot;{(data.config as any)?.value || ""}&quot;
      </p>
      <div className="flex justify-between pt-2 text-[10px] font-bold">
        <span className="text-emerald-600">Sim / Verdadeiro</span>
        <span className="text-rose-600">Não / Falso</span>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        id="true"
        style={{ left: "25%" }}
        className="size-3 bg-emerald-500 border-2 border-white"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="false"
        style={{ left: "75%" }}
        className="size-3 bg-rose-500 border-2 border-white"
      />
    </div>
  );
}

function WaitNodeCard({ data, id }: NodeProps) {
  const isReply = data.type === "messaging.wait_for_reply";
  return (
    <div className="border-2 border-sky-500/60 bg-card rounded-2xl p-4 shadow-md w-64 text-xs space-y-2 relative">
      <Handle
        type="target"
        position={Position.Top}
        id="input"
        className="size-3 bg-sky-500 border-2 border-white"
      />
      <div className="flex items-center gap-2 text-sky-600 font-semibold">
        {isReply ? <Hourglass className="size-4" /> : <Clock className="size-4" />}
        <span className="truncate">{String(data.name || "Aguardar")}</span>
      </div>
      <p className="text-muted-foreground line-clamp-2">
        {isReply
          ? `Aguardar resposta (timeout: ${(data.config as any)?.timeoutMinutes || 120}m)`
          : `Esperar ${(data.config as any)?.amount || 10} ${(data.config as any)?.unit || "minutos"}`}
      </p>
      {isReply ? (
        <>
          <div className="flex justify-between pt-2 text-[10px] font-bold">
            <span className="text-sky-600">Respondeu</span>
            <span className="text-amber-600">Timeout</span>
          </div>
          <Handle
            type="source"
            position={Position.Bottom}
            id="reply"
            style={{ left: "25%" }}
            className="size-3 bg-sky-500 border-2 border-white"
          />
          <Handle
            type="source"
            position={Position.Bottom}
            id="timeout"
            style={{ left: "75%" }}
            className="size-3 bg-amber-500 border-2 border-white"
          />
        </>
      ) : (
        <Handle
          type="source"
          position={Position.Bottom}
          id="next"
          className="size-3 bg-sky-500 border-2 border-white"
        />
      )}
    </div>
  );
}

function EndNodeCard({ data, id }: NodeProps) {
  return (
    <div className="border-2 border-slate-500/60 bg-card rounded-2xl p-4 shadow-md w-48 text-xs space-y-2 relative text-center">
      <Handle
        type="target"
        position={Position.Top}
        id="input"
        className="size-3 bg-slate-500 border-2 border-white"
      />
      <div className="flex items-center justify-center gap-2 text-slate-600 font-semibold">
        <CheckCircle2 className="size-4" />
        <span>Fim do Fluxo</span>
      </div>
      <p className="text-[10px] text-muted-foreground">Libera o controle da conversa</p>
    </div>
  );
}

const nodeTypes = {
  triggerNode: TriggerNodeCard,
  actionNode: ActionNodeCard,
  conditionNode: ConditionNodeCard,
  waitNode: WaitNodeCard,
  endNode: EndNodeCard,
};

// ============================================================================
// PÁGINA PRINCIPAL DEL CANVAS
// ============================================================================

function AutomacaoCanvasPage() {
  const params = useParams({ strict: false });
  const workflowId = (params as any)?.workflowId || "";
  const getWorkflow = useServerFn(getWorkflowFn);
  const saveDraft = useServerFn(saveWorkflowDraftFn);
  const publishWf = useServerFn(publishWorkflowFn);
  const listExecutions = useServerFn(listExecutionsFn);
  const getAuxData = useServerFn(getAvailableChannelsAndConnectionsFn);

  const [workflow, setWorkflow] = useState<any>(null);
  const [versionNumber, setVersionNumber] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [activeTab, setActiveTab] = useState<"canvas" | "history">("canvas");

  const [auxData, setAuxData] = useState<{ instances: any[]; stages: any[]; pipelines: any[] }>({
    instances: [],
    stages: [],
    pipelines: [],
  });

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedNodeId) || null,
    [nodes, selectedNodeId]
  );

  const updateNodeConfig = useCallback((nodeId: string, key: string, value: unknown) => {
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id !== nodeId) return n;
        return {
          ...n,
          data: {
            ...n.data,
            config: {
              ...((n.data.config as Record<string, any>) || {}),
              [key]: value,
            },
          },
        };
      })
    );
  }, [setNodes]);

  const [executions, setExecutions] = useState<any[]>([]);

  // Cargar datos del flujo
  async function loadData() {
    setLoading(true);
    try {
      const [resWfRaw, resAux] = await Promise.all([
        getWorkflow({ data: { workflowId } }),
        getAuxData(),
      ]);

      const resWf = resWfRaw as any;
      setWorkflow(resWf.workflow);
      setVersionNumber(resWf.versionNumber);
      setAuxData(resAux);

      // Convertir nodos del grafo al formato de React Flow
      const flowNodes: Node[] = (resWf.graph?.nodes || []).map((n: any) => {
        let nType = "actionNode";
        if (n.type.startsWith("messaging.inbound") || n.type.startsWith("crm.card")) nType = "triggerNode";
        else if (n.type.startsWith("condition.")) nType = "conditionNode";
        else if (n.type.startsWith("control.wait") || n.type.startsWith("messaging.wait")) nType = "waitNode";
        else if (n.type === "control.end") nType = "endNode";

        return {
          id: n.id,
          type: nType,
          position: n.position || { x: 100, y: 100 },
          data: {
            ...n,
            name: n.name || n.type,
          },
        };
      });

      const flowEdges: Edge[] = (resWf.graph?.edges || []).map((e: any) => ({
        id: e.id,
        source: e.source,
        sourceHandle: e.sourcePort || "next",
        target: e.target,
        targetHandle: e.targetPort || "input",
        markerEnd: { type: MarkerType.ArrowClosed },
        animated: true,
      }));

      setNodes(flowNodes);
      setEdges(flowEdges);
    } catch (e: any) {
      toast.error(e?.message || "Erro ao carregar dados do canvas");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [workflowId]);

  // Conectar nodos arrastrando edges
  const onConnect = useCallback(
    (params: Connection) =>
      setEdges((eds) =>
        addEdge(
          {
            ...params,
            markerEnd: { type: MarkerType.ArrowClosed },
            animated: true,
          },
          eds
        )
      ),
    [setEdges]
  );

  // Seleccionar nodo para abrir inspector
  const onNodeClick = useCallback((_: any, node: Node) => {
    setSelectedNodeId(node.id);
  }, []);

  // Agregar nuevo nodo desde la paleta
  function addNodeFromPalette(type: string, label: string) {
    const id = `node_${Date.now()}`;
    let nType = "actionNode";
    if (type.startsWith("messaging.inbound") || type.startsWith("crm.card")) nType = "triggerNode";
    else if (type.startsWith("condition.")) nType = "conditionNode";
    else if (type.startsWith("control.wait") || type.startsWith("messaging.wait")) nType = "waitNode";
    else if (type === "control.end") nType = "endNode";

    const newNode: Node = {
      id,
      type: nType,
      position: { x: 250 + Math.random() * 80, y: 150 + Math.random() * 80 },
      data: {
        id,
        type,
        version: 1,
        name: label,
        config: {},
      },
    };

    setNodes((nds) => [...nds, newNode]);
    setSelectedNodeId(newNode.id);
    toast.success(`Nó "${label}" adicionado ao canvas`);
  }

  // Empaquetar grafo actual
  function buildCurrentGraph() {
    return {
      schemaVersion: 1,
      nodes: nodes.map((n) => ({
        id: n.id,
        type: n.data.type as string,
        version: (n.data.version as number) || 1,
        position: n.position,
        config: (n.data.config as Record<string, any>) || {},
      })),
      edges: edges.map((e) => ({
        id: e.id,
        source: e.source,
        sourcePort: e.sourceHandle || "next",
        target: e.target,
        targetPort: e.targetHandle || "input",
      })),
      settings: {
        reentry: "deny_while_active" as const,
        maxRuntimeSeconds: 86400,
        maxSteps: 100,
      },
    };
  }

  async function handleSaveDraft() {
    setSaving(true);
    try {
      const graph = buildCurrentGraph();
      const res = await saveDraft({ data: { workflowId, graph } });
      toast.success(`Rascunho salvo (versão ${res.versionNumber})`);
      setVersionNumber(res.versionNumber);
    } catch (e: any) {
      toast.error(e?.message || "Erro ao salvar rascunho");
    } finally {
      setSaving(false);
    }
  }

  async function handlePublish() {
    setPublishing(true);
    try {
      const graph = buildCurrentGraph();
      const res = await publishWf({ data: { workflowId, graph } });
      toast.success(`Fluxo publicado com sucesso! Versão ${res.versionNumber} ativa.`);
      setVersionNumber(res.versionNumber);
      setWorkflow((prev: any) => ({ ...prev, status: "published" }));
    } catch (e: any) {
      toast.error(e?.message || "Erro ao publicar fluxo");
    } finally {
      setPublishing(false);
    }
  }

  async function loadExecutions() {
    try {
      const list = await listExecutions({ data: { workflowId, limit: 40 } });
      setExecutions(list || []);
    } catch (e: any) {
      toast.error(e?.message || "Erro ao carregar execuções");
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] w-full overflow-hidden bg-background">
      {/* Top Bar */}
      <div className="h-14 border-b bg-card/80 backdrop-blur px-4 flex items-center justify-between gap-4 z-10 shrink-0">
        <div className="flex items-center gap-3">
          <Link
            to="/app/automacoes"
            className="p-2 hover:bg-muted rounded-xl transition-colors text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-sm">{workflow?.name || "Editor de Fluxo"}</h2>
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                  workflow?.status === "published"
                    ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"
                    : "bg-muted text-muted-foreground border"
                }`}
              >
                {workflow?.status === "published" ? `Publicado (v${versionNumber})` : "Rascunho"}
              </span>
            </div>
          </div>
        </div>

        {/* Tab switcher */}
        <div className="flex items-center gap-2">
          <Tabs value={activeTab} onValueChange={(v: any) => {
            setActiveTab(v);
            if (v === "history") loadExecutions();
          }}>
            <TabsList className="h-9">
              <TabsTrigger value="canvas" className="text-xs gap-1.5">
                <Layers className="size-3.5" /> Canvas Visual
              </TabsTrigger>
              <TabsTrigger value="history" className="text-xs gap-1.5">
                <History className="size-3.5" /> Execuções
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleSaveDraft}
            disabled={saving || publishing}
            className="gap-1.5 text-xs"
          >
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
            Salvar Rascunho
          </Button>

          <Button
            size="sm"
            onClick={handlePublish}
            disabled={saving || publishing}
            className="bg-[var(--brand)] hover:bg-[var(--brand)]/90 text-white gap-1.5 text-xs"
          >
            {publishing ? <Loader2 className="size-3.5 animate-spin" /> : <Rocket className="size-3.5" />}
            Publicar Fluxo
          </Button>
        </div>
      </div>

      {/* Main Area */}
      {activeTab === "canvas" ? (
        <div className="flex-1 flex overflow-hidden relative">
          {/* Paleta Lateral */}
          <div className="w-64 border-r bg-card/60 backdrop-blur p-4 space-y-5 overflow-y-auto shrink-0 z-10 text-xs">
            <div>
              <h4 className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wider mb-2">
                Disparadores
              </h4>
              <div className="space-y-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => addNodeFromPalette("messaging.inbound_received", "Mensagem Entrante")}
                  className="w-full justify-start text-xs gap-2 border-indigo-500/30 text-indigo-700 hover:bg-indigo-50 dark:hover:bg-indigo-950"
                >
                  <MessageSquare className="size-3.5" /> Mensagem Entrante
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => addNodeFromPalette("crm.card_stage_changed", "Etapa Modificada")}
                  className="w-full justify-start text-xs gap-2 border-indigo-500/30 text-indigo-700 hover:bg-indigo-50 dark:hover:bg-indigo-950"
                >
                  <ArrowRightLeft className="size-3.5" /> Etapa Modificada
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => addNodeFromPalette("crm.card_owner_changed", "Responsável Alterado")}
                  className="w-full justify-start text-xs gap-2 border-indigo-500/30 text-indigo-700 hover:bg-indigo-50 dark:hover:bg-indigo-950"
                >
                  <UserCheck className="size-3.5" /> Responsável Alterado
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => addNodeFromPalette("crm.card_tags_changed", "Tag Modificada")}
                  className="w-full justify-start text-xs gap-2 border-indigo-500/30 text-indigo-700 hover:bg-indigo-50 dark:hover:bg-indigo-950"
                >
                  <Tag className="size-3.5" /> Tag Modificada
                </Button>
              </div>
            </div>

            <div>
              <h4 className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wider mb-2">
                Ações de Conversa
              </h4>
              <div className="space-y-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => addNodeFromPalette("messaging.send_text", "Enviar Texto")}
                  className="w-full justify-start text-xs gap-2 border-emerald-500/30 text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950"
                >
                  <Send className="size-3.5" /> Enviar Mensagem
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => addNodeFromPalette("messaging.handoff_to_ai", "Derivar para IA")}
                  className="w-full justify-start text-xs gap-2 border-emerald-500/30 text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950"
                >
                  <Bot className="size-3.5" /> Handoff para IA
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => addNodeFromPalette("messaging.route_to_human", "Derivar para Humano")}
                  className="w-full justify-start text-xs gap-2 border-emerald-500/30 text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950"
                >
                  <UserCheck className="size-3.5" /> Derivar para Atendente
                </Button>
              </div>
            </div>

            <div>
              <h4 className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wider mb-2">
                Ações no CRM
              </h4>
              <div className="space-y-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => addNodeFromPalette("crm.move_card_to_stage", "Mover Etapa")}
                  className="w-full justify-start text-xs gap-2 border-emerald-500/30 text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950"
                >
                  <ArrowRightLeft className="size-3.5" /> Mover de Etapa
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => addNodeFromPalette("crm.add_tag", "Adicionar Tag")}
                  className="w-full justify-start text-xs gap-2 border-emerald-500/30 text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950"
                >
                  <Tag className="size-3.5" /> Adicionar Etiqueta
                </Button>
              </div>
            </div>

            <div>
              <h4 className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wider mb-2">
                Lógica & Espera
              </h4>
              <div className="space-y-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => addNodeFromPalette("messaging.wait_for_reply", "Aguardar Resposta")}
                  className="w-full justify-start text-xs gap-2 border-sky-500/30 text-sky-700 hover:bg-sky-50 dark:hover:bg-sky-950"
                >
                  <Hourglass className="size-3.5" /> Esperar Resposta
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => addNodeFromPalette("control.wait_duration", "Esperar Tempo")}
                  className="w-full justify-start text-xs gap-2 border-sky-500/30 text-sky-700 hover:bg-sky-50 dark:hover:bg-sky-950"
                >
                  <Clock className="size-3.5" /> Esperar Tempo
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => addNodeFromPalette("condition.if_else", "Se / Não")}
                  className="w-full justify-start text-xs gap-2 border-amber-500/30 text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950"
                >
                  <GitBranch className="size-3.5" /> Condição Se / Não
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => addNodeFromPalette("control.end", "Fim")}
                  className="w-full justify-start text-xs gap-2 border-slate-500/30 text-slate-700 hover:bg-slate-50 dark:hover:bg-slate-950"
                >
                  <CheckCircle2 className="size-3.5" /> Fim do Fluxo
                </Button>
              </div>
            </div>
          </div>

          {/* Canvas React Flow */}
          <div className="flex-1 h-full w-full bg-slate-50 dark:bg-slate-950 relative">
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="size-8 animate-spin text-[var(--brand)]" />
              </div>
            ) : (
              <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onNodeClick={onNodeClick}
                fitView
              >
                <Background gap={16} size={1} />
                <Controls />
                <MiniMap
                  className="bg-card border rounded-xl overflow-hidden shadow-sm"
                  nodeColor={(n) => {
                    if (n.type === "triggerNode") return "#6366f1";
                    if (n.type === "actionNode") return "#10b981";
                    if (n.type === "conditionNode") return "#f59e0b";
                    if (n.type === "waitNode") return "#0ea5e9";
                    return "#64748b";
                  }}
                />
              </ReactFlow>
            )}
          </div>

          {/* Inspector Drawer */}
          <Sheet open={Boolean(selectedNodeId)} onOpenChange={(open) => !open && setSelectedNodeId(null)}>
            <SheetContent className="sm:max-w-md space-y-4">
              <SheetHeader>
                <SheetTitle className="text-base flex items-center gap-2">
                  Configurar Nó: {selectedNode?.data.name as string}
                </SheetTitle>
              </SheetHeader>

              {selectedNode && (
                <div className="space-y-4 text-xs">
                  {/* messaging.inbound_received (Trigger) */}
                  {selectedNode.data.type === "messaging.inbound_received" && (
                    <>
                      <div className="space-y-1.5">
                        <Label>Canais Habilitados</Label>
                        <div className="grid grid-cols-2 gap-2 pt-1 pb-2">
                          {[
                            { id: "whatsapp", label: "WhatsApp" },
                            { id: "instagram_dm", label: "Instagram DM" },
                            { id: "facebook_messenger", label: "Messenger" },
                            { id: "telegram", label: "Telegram" },
                          ].map((ch) => {
                            const curChannels = ((selectedNode.data.config as any)?.channels as string[]) || [];
                            const isChecked = curChannels.length === 0 || curChannels.includes(ch.id);
                            return (
                              <label key={ch.id} className="flex items-center gap-2 cursor-pointer text-xs">
                                <input
                                  type="checkbox"
                                  className="rounded border-gray-300 text-primary"
                                  checked={isChecked}
                                  onChange={(e) => {
                                    let next: string[];
                                    if (curChannels.length === 0) {
                                      // If empty (all allowed), checking off one means all except this one
                                      const all = ["whatsapp", "instagram_dm", "facebook_messenger", "telegram"];
                                      next = e.target.checked ? all : all.filter((c) => c !== ch.id);
                                    } else {
                                      next = e.target.checked
                                        ? [...curChannels.filter((c) => c !== ch.id), ch.id]
                                        : curChannels.filter((c) => c !== ch.id);
                                    }
                                    updateNodeConfig(selectedNode.id, "channels", next);
                                  }}
                                />
                                <span>{ch.label}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <Label>Modo de Conexão</Label>
                        <Select
                          value={((selectedNode.data.config as any)?.connectionMode as string) || "any"}
                          onValueChange={(val) => updateNodeConfig(selectedNode.id, "connectionMode", val)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="any">Qualquer conexão da empresa</SelectItem>
                            <SelectItem value="selected">Conexão selecionada</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {((selectedNode.data.config as any)?.connectionMode === "selected") && (
                        <div className="space-y-1.5">
                          <Label>Linha / Conexão *</Label>
                          <Select
                            value={((selectedNode.data.config as any)?.instanceIds?.[0] as string) || ""}
                            onValueChange={(val) => updateNodeConfig(selectedNode.id, "instanceIds", val ? [val] : [])}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione a linha..." />
                            </SelectTrigger>
                            <SelectContent>
                              {auxData.instances.map((inst) => (
                                <SelectItem key={inst.id} value={inst.id}>
                                  {inst.display_name || inst.instance_name} ({inst.provider})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                      <div className="space-y-1.5">
                        <Label>Palavras-chave (opcional, separadas por vírgula)</Label>
                        <Input
                          placeholder="Ex: preco, orcamento, comprar, suporte"
                          value={(((selectedNode.data.config as any)?.keywords as string[]) || []).join(", ")}
                          onChange={(e) => {
                            const raw = e.target.value;
                            const arr = raw.split(",").map((s) => s.trim()).filter(Boolean);
                            updateNodeConfig(selectedNode.id, "keywords", arr);
                          }}
                        />
                        <p className="text-[10px] text-muted-foreground">
                          Se preenchido, o fluxo só dispara quando o cliente enviar uma dessas palavras.
                        </p>
                      </div>

                      <div className="space-y-1.5">
                        <Label>Tipo de Conversa</Label>
                        <Select
                          value={((selectedNode.data.config as any)?.conversationType as string) || "direct"}
                          onValueChange={(val) => updateNodeConfig(selectedNode.id, "conversationType", val)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="direct">Apenas conversas individuais (1:1)</SelectItem>
                            <SelectItem value="group">Apenas grupos</SelectItem>
                            <SelectItem value="all">Todas</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </>
                  )}

                  {/* crm.card_tags_changed (Trigger) */}
                  {selectedNode.data.type === "crm.card_tags_changed" && (
                    <div className="space-y-1.5">
                      <Label>Filtrar por Etiqueta / Tag (opcional)</Label>
                      <Input
                        placeholder="Ex: interessado, vip"
                        value={((selectedNode.data.config as any)?.tag as string) || ""}
                        onChange={(e) => updateNodeConfig(selectedNode.id, "tag", e.target.value)}
                      />
                      <p className="text-[10px] text-muted-foreground">
                        Deixe em branco para disparar em qualquer alteração de etiquetas do lead.
                      </p>
                    </div>
                  )}

                  {/* crm.add_tag */}
                  {selectedNode.data.type === "crm.add_tag" && (
                    <div className="space-y-1.5">
                      <Label>Nome da Etiqueta *</Label>
                      <Input
                        placeholder="Ex: interessado, cotacao_enviada, orcamento"
                        value={((selectedNode.data.config as any)?.tag as string) || ""}
                        onChange={(e) => updateNodeConfig(selectedNode.id, "tag", e.target.value)}
                      />
                    </div>
                  )}

                  {/* messaging.send_text */}
                  {selectedNode.data.type === "messaging.send_text" && (
                    <>
                      <div className="space-y-1.5">
                        <Label>Texto da Mensagem *</Label>
                        <Textarea
                          rows={4}
                          placeholder="Digite a mensagem... use {{contact.name}} ou {{card.nome}} para o nome"
                          value={((selectedNode.data.config as any)?.text as string) || ""}
                          onChange={(e) => updateNodeConfig(selectedNode.id, "text", e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Política de Conexão</Label>
                        <Select
                          value={((selectedNode.data.config as any)?.connectionPolicy as string) || "same_as_trigger"}
                          onValueChange={(val) => updateNodeConfig(selectedNode.id, "connectionPolicy", val)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="same_as_trigger">Mesma conexão que disparou o fluxo</SelectItem>
                            <SelectItem value="specific">Conexão específica</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {((selectedNode.data.config as any)?.connectionPolicy === "specific") && (
                        <div className="space-y-1.5">
                          <Label>Linha / Conexão Específica *</Label>
                          <Select
                            value={((selectedNode.data.config as any)?.specificInstanceId as string) || ""}
                            onValueChange={(val) => updateNodeConfig(selectedNode.id, "specificInstanceId", val)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione a linha..." />
                            </SelectTrigger>
                            <SelectContent>
                              {auxData.instances.map((inst) => (
                                <SelectItem key={inst.id} value={inst.id}>
                                  {inst.display_name || inst.instance_name} ({inst.provider})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </>
                  )}

                  {/* crm.move_card_to_stage */}
                  {selectedNode.data.type === "crm.move_card_to_stage" && (
                    <div className="space-y-1.5">
                      <Label>Etapa de Destino *</Label>
                      <Select
                        value={((selectedNode.data.config as any)?.stageId as string) || ""}
                        onValueChange={(val) => updateNodeConfig(selectedNode.id, "stageId", val)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione a etapa..." />
                        </SelectTrigger>
                        <SelectContent>
                          {auxData.stages.map((st) => (
                            <SelectItem key={st.id} value={st.id}>
                              {st.nome}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* condition.if_else */}
                  {selectedNode.data.type === "condition.if_else" && (
                    <>
                      <div className="space-y-1.5">
                        <Label>Variável a Avaliar</Label>
                        <Select
                          value={((selectedNode.data.config as any)?.variable as string) || "trigger.text"}
                          onValueChange={(val) => updateNodeConfig(selectedNode.id, "variable", val)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="trigger.text">Texto da Mensagem</SelectItem>
                            <SelectItem value="card.tags">Etiquetas do Lead</SelectItem>
                            <SelectItem value="trigger.channel">Canal (WhatsApp/IG)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1.5">
                        <Label>Operador</Label>
                        <Select
                          value={((selectedNode.data.config as any)?.operator as string) || "contains"}
                          onValueChange={(val) => updateNodeConfig(selectedNode.id, "operator", val)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="contains">Contém texto</SelectItem>
                            <SelectItem value="not_contains">Não contém texto</SelectItem>
                            <SelectItem value="equals">Igual a</SelectItem>
                            <SelectItem value="has_tag">Possui tag</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1.5">
                        <Label>Valor de Comparação</Label>
                        <Input
                          placeholder="Ex: preço, cotacao"
                          value={((selectedNode.data.config as any)?.value as string) || ""}
                          onChange={(e) => updateNodeConfig(selectedNode.id, "value", e.target.value)}
                        />
                      </div>
                    </>
                  )}

                  {/* control.wait_duration */}
                  {selectedNode.data.type === "control.wait_duration" && (
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1.5">
                        <Label>Tempo</Label>
                        <Input
                          type="number"
                          min={1}
                          value={((selectedNode.data.config as any)?.amount as number) || 10}
                          onChange={(e) => updateNodeConfig(selectedNode.id, "amount", Number(e.target.value))}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Unidade</Label>
                        <Select
                          value={((selectedNode.data.config as any)?.unit as string) || "minutes"}
                          onValueChange={(val) => updateNodeConfig(selectedNode.id, "unit", val)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="minutes">Minutos</SelectItem>
                            <SelectItem value="hours">Horas</SelectItem>
                            <SelectItem value="days">Dias</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}

                  {/* messaging.wait_for_reply */}
                  {selectedNode.data.type === "messaging.wait_for_reply" && (
                    <div className="space-y-1.5">
                      <Label>Tempo Limite de Espera (minutos)</Label>
                      <Input
                        type="number"
                        min={1}
                        value={((selectedNode.data.config as any)?.timeoutMinutes as number) || 120}
                        onChange={(e) => updateNodeConfig(selectedNode.id, "timeoutMinutes", Number(e.target.value))}
                      />
                      <p className="text-[10px] text-muted-foreground">
                        Se o cliente não responder antes desse prazo, o fluxo segue pela saída &quot;Timeout&quot;.
                      </p>
                    </div>
                  )}

                  <div className="pt-4 border-t flex justify-between">
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => {
                        setNodes((nds) => nds.filter((n) => n.id !== selectedNode.id));
                        setEdges((eds) => eds.filter((e) => e.source !== selectedNode.id && e.target !== selectedNode.id));
                        setSelectedNodeId(null);
                        toast.success("Nó removido");
                      }}
                      className="text-xs"
                    >
                      Excluir Nó
                    </Button>
                    <Button size="sm" onClick={() => setSelectedNodeId(null)} className="text-xs">
                      Concluído
                    </Button>
                  </div>
                </div>
              )}
</SheetContent>
          </Sheet>
        </div>
      ) : (
        /* Pestaña de Historial de Ejecuciones */
        <div className="flex-1 overflow-y-auto p-6 max-w-5xl mx-auto w-full space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Histórico de Execuções Recentes</h3>
            <Button variant="outline" size="sm" onClick={loadExecutions} className="text-xs">
              Atualizar
            </Button>
          </div>

          {executions.length === 0 ? (
            <div className="p-8 border rounded-2xl text-center text-muted-foreground text-xs">
              Nenhuma execução registrada para este fluxo ainda.
            </div>
          ) : (
            <div className="border rounded-2xl overflow-hidden bg-card text-xs">
              <table className="w-full text-left">
                <thead className="bg-muted/50 border-b font-medium text-muted-foreground">
                  <tr>
                    <th className="p-3">Data</th>
                    <th className="p-3">Canal</th>
                    <th className="p-3">Conversa / Contato</th>
                    <th className="p-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {executions.map((x) => (
                    <tr key={x.id} className="hover:bg-muted/30">
                      <td className="p-3 text-muted-foreground">
                        {new Date(x.created_at).toLocaleString()}
                      </td>
                      <td className="p-3 font-medium capitalize">
                        {x.source_channel || "whatsapp"}
                      </td>
                      <td className="p-3">{x.external_conversation_id || "N/A"}</td>
                      <td className="p-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${
                            x.status === "succeeded"
                              ? "bg-emerald-500/10 text-emerald-600"
                              : x.status === "waiting"
                                ? "bg-sky-500/10 text-sky-600"
                                : x.status === "failed"
                                  ? "bg-rose-500/10 text-rose-600"
                                  : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {x.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
