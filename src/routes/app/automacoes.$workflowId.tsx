// src/routes/app/automacoes.$workflowId.tsx
import { createFileRoute, Link } from "@tanstack/react-router";
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
  getExecutionDetailFn,
  getAvailableChannelsAndConnectionsFn,
} from "@/lib/automations/functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
  Hourglass,
  Layers,
  History,
  X,
  Loader2,
  Plus,
  UserPlus,
  KanbanSquare,
  Check,
  Sparkles,
  Users,
} from "lucide-react";

export const Route = createFileRoute("/app/automacoes/$workflowId")({
  component: AutomacaoCanvasPage,
});

// ============================================================================
// COMPONENTES DE NODOS PERSONALIZADOS COM PORTAS LEGÍVEIS E BOTÃO '+' (A02)
// ============================================================================

function TriggerNodeCard({ data, id }: NodeProps) {
  const isMsg = data.type === "messaging.inbound_received";
  const isCardCreated = data.type === "crm.card_created";
  const isStage = data.type === "crm.card_stage_changed";
  const isOwner = data.type === "crm.card_owner_changed";
  const isTag = data.type === "crm.card_tags_changed";

  const onAddNext = (data as any)?.onAddNext;

  return (
    <div className="border-2 border-indigo-500/70 bg-card rounded-2xl p-4 shadow-md w-72 text-xs space-y-2 relative group hover:border-indigo-500 transition-colors">
      <div className="flex items-center justify-between text-indigo-600 font-semibold">
        <div className="flex items-center gap-2">
          {isMsg && <MessageSquare className="size-4" />}
          {isCardCreated && <UserPlus className="size-4" />}
          {isStage && <ArrowRightLeft className="size-4" />}
          {isOwner && <UserCheck className="size-4" />}
          {isTag && <Tag className="size-4" />}
          <span className="truncate">{String(data.name || "Gatilho")}</span>
        </div>
        <Badge variant="outline" className="text-[9px] bg-indigo-500/10 text-indigo-700 border-indigo-200">
          Início
        </Badge>
      </div>

      <p className="text-muted-foreground line-clamp-2">
        {isMsg
          ? `Dispara com mensagem recebida (${((data.config as any)?.channels || []).join(", ") || "todos os canais"})`
          : isCardCreated
            ? "Dispara quando um novo lead entra no CRM"
            : isStage
              ? "Dispara quando o lead avança de etapa"
              : isOwner
                ? "Dispara na reatribuição de vendedor"
                : "Dispara ao modificar tags"}
      </p>

      {/* Porta de saída ampliada para 20px com etiqueta e botão + rápido */}
      <div className="pt-2 flex flex-col items-center relative">
        <span className="text-[10px] font-semibold text-indigo-600 tracking-wider uppercase mb-1">
          Próximo Passo
        </span>
        <Handle
          type="source"
          position={Position.Bottom}
          id="next"
          className="!w-5 !h-5 !bg-indigo-500 !border-2 !border-white hover:scale-125 transition-transform cursor-crosshair rounded-full shadow-sm"
        />
        {onAddNext && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onAddNext(id, "next");
            }}
            title="Adicionar próximo passo"
            className="absolute -bottom-6 size-5 bg-indigo-600 text-white rounded-full flex items-center justify-center shadow-md hover:bg-indigo-700 hover:scale-110 transition-all z-10"
          >
            <Plus className="size-3" />
          </button>
        )}
      </div>
    </div>
  );
}

function ActionNodeCard({ data, id }: NodeProps) {
  const isText = data.type === "messaging.send_text";
  const isMove = data.type === "crm.move_card_to_stage";
  const isAi = data.type === "messaging.handoff_to_ai";
  const isHuman = data.type === "messaging.route_to_human";
  const isAddTag = data.type === "crm.add_tag";
  const isTerminal = isHuman; // A11: Derivar a humano é terminal

  const onAddNext = (data as any)?.onAddNext;

  return (
    <div className="border-2 border-emerald-500/70 bg-card rounded-2xl p-4 shadow-md w-72 text-xs space-y-2 relative group hover:border-emerald-500 transition-colors">
      {/* Porta de entrada */}
      <Handle
        type="target"
        position={Position.Top}
        id="input"
        className="!w-5 !h-5 !bg-emerald-500 !border-2 !border-white hover:scale-125 transition-transform cursor-crosshair rounded-full shadow-sm"
      />

      <div className="flex items-center justify-between text-emerald-600 font-semibold">
        <div className="flex items-center gap-2">
          {isText && <Send className="size-4" />}
          {isMove && <ArrowRightLeft className="size-4" />}
          {isAi && <Bot className="size-4" />}
          {isHuman && <UserCheck className="size-4" />}
          {isAddTag && <Tag className="size-4" />}
          <span className="truncate">{String(data.name || "Ação")}</span>
        </div>
        {isTerminal ? (
          <Badge variant="outline" className="text-[9px] bg-rose-500/10 text-rose-700 border-rose-200">
            Pausa Bot
          </Badge>
        ) : (
          <Badge variant="outline" className="text-[9px] bg-emerald-500/10 text-emerald-700 border-emerald-200">
            Ação
          </Badge>
        )}
      </div>

      <p className="text-muted-foreground line-clamp-2">
        {isText
          ? (data.config as any)?.text || "Enviar mensagem..."
          : isMove
            ? "Mover lead para etapa..."
            : isAi
              ? "Derivar para IA Conversacional"
              : isHuman
                ? "Pausa bot e notifica atendente (Terminal)"
                : isAddTag
                  ? `Adicionar tag: "${(data.config as any)?.tag || "..."}"`
                  : "Ação configurada"}
      </p>

      {/* Se for terminal (A11), não desenha porta de saída 'next' enganosa */}
      {!isTerminal ? (
        <div className="pt-2 flex flex-col items-center relative">
          <span className="text-[10px] font-semibold text-emerald-600 tracking-wider uppercase mb-1">
            Próximo Passo
          </span>
          <Handle
            type="source"
            position={Position.Bottom}
            id="next"
            className="!w-5 !h-5 !bg-emerald-500 !border-2 !border-white hover:scale-125 transition-transform cursor-crosshair rounded-full shadow-sm"
          />
          {onAddNext && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onAddNext(id, "next");
              }}
              title="Adicionar próximo passo"
              className="absolute -bottom-6 size-5 bg-emerald-600 text-white rounded-full flex items-center justify-center shadow-md hover:bg-emerald-700 hover:scale-110 transition-all z-10"
            >
              <Plus className="size-3" />
            </button>
          )}
        </div>
      ) : (
        <div className="pt-2 text-center text-[10px] text-muted-foreground italic">
          Finaliza este fluxo e transfere controle.
        </div>
      )}
    </div>
  );
}

function ConditionNodeCard({ data, id }: NodeProps) {
  const onAddNext = (data as any)?.onAddNext;

  return (
    <div className="border-2 border-amber-500/70 bg-card rounded-2xl p-4 shadow-md w-72 text-xs space-y-2 relative group hover:border-amber-500 transition-colors">
      <Handle
        type="target"
        position={Position.Top}
        id="input"
        className="!w-5 !h-5 !bg-amber-500 !border-2 !border-white hover:scale-125 transition-transform cursor-crosshair rounded-full shadow-sm"
      />

      <div className="flex items-center justify-between text-amber-600 font-semibold">
        <div className="flex items-center gap-2">
          <GitBranch className="size-4" />
          <span className="truncate">{String(data.name || "Condição (Se / Não)")}</span>
        </div>
        <Badge variant="outline" className="text-[9px] bg-amber-500/10 text-amber-700 border-amber-200">
          Decisão
        </Badge>
      </div>

      <p className="text-muted-foreground line-clamp-2">
        Se { (data.config as any)?.variable || "mensagem" } { (data.config as any)?.operator || "contém" } &quot;{(data.config as any)?.value || ""}&quot;
      </p>

      {/* Portas com identificadores claros Sim e Não */}
      <div className="pt-3 pb-2 flex justify-between items-center text-[11px] font-bold">
        <div className="flex flex-col items-center relative pl-4">
          <span className="text-emerald-600 mb-1">Sim</span>
          <Handle
            type="source"
            position={Position.Bottom}
            id="true"
            style={{ left: "28%" }}
            className="!w-5 !h-5 !bg-emerald-500 !border-2 !border-white hover:scale-125 transition-transform cursor-crosshair rounded-full shadow-sm"
          />
          {onAddNext && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onAddNext(id, "true");
              }}
              title="Adicionar ação para ramo Sim"
              className="absolute -bottom-6 left-[20%] size-5 bg-emerald-600 text-white rounded-full flex items-center justify-center shadow-md hover:bg-emerald-700 hover:scale-110 transition-all z-10"
            >
              <Plus className="size-3" />
            </button>
          )}
        </div>

        <div className="flex flex-col items-center relative pr-4">
          <span className="text-rose-600 mb-1">Não</span>
          <Handle
            type="source"
            position={Position.Bottom}
            id="false"
            style={{ left: "72%" }}
            className="!w-5 !h-5 !bg-rose-500 !border-2 !border-white hover:scale-125 transition-transform cursor-crosshair rounded-full shadow-sm"
          />
          {onAddNext && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onAddNext(id, "false");
              }}
              title="Adicionar ação para ramo Não"
              className="absolute -bottom-6 right-[20%] size-5 bg-rose-600 text-white rounded-full flex items-center justify-center shadow-md hover:bg-rose-700 hover:scale-110 transition-all z-10"
            >
              <Plus className="size-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function WaitNodeCard({ data, id }: NodeProps) {
  const isReply = data.type === "messaging.wait_for_reply";
  const onAddNext = (data as any)?.onAddNext;

  return (
    <div className="border-2 border-sky-500/70 bg-card rounded-2xl p-4 shadow-md w-72 text-xs space-y-2 relative group hover:border-sky-500 transition-colors">
      <Handle
        type="target"
        position={Position.Top}
        id="input"
        className="!w-5 !h-5 !bg-sky-500 !border-2 !border-white hover:scale-125 transition-transform cursor-crosshair rounded-full shadow-sm"
      />

      <div className="flex items-center justify-between text-sky-600 font-semibold">
        <div className="flex items-center gap-2">
          {isReply ? <Hourglass className="size-4" /> : <Clock className="size-4" />}
          <span className="truncate">{String(data.name || "Aguardar")}</span>
        </div>
        <Badge variant="outline" className="text-[9px] bg-sky-500/10 text-sky-700 border-sky-200">
          Espera
        </Badge>
      </div>

      <p className="text-muted-foreground line-clamp-2">
        {isReply
          ? `Aguardar resposta do cliente (tempo limite: ${(data.config as any)?.timeoutMinutes || 120}m)`
          : `Esperar ${(data.config as any)?.amount || 10} ${(data.config as any)?.unit || "minutos"}`}
      </p>

      {isReply ? (
        <div className="pt-3 pb-2 flex justify-between items-center text-[11px] font-bold">
          <div className="flex flex-col items-center relative pl-4">
            <span className="text-sky-600 mb-1">Respondeu</span>
            <Handle
              type="source"
              position={Position.Bottom}
              id="reply"
              style={{ left: "28%" }}
              className="!w-5 !h-5 !bg-sky-500 !border-2 !border-white hover:scale-125 transition-transform cursor-crosshair rounded-full shadow-sm"
            />
            {onAddNext && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onAddNext(id, "reply");
                }}
                title="Adicionar ação se cliente respondeu"
                className="absolute -bottom-6 left-[20%] size-5 bg-sky-600 text-white rounded-full flex items-center justify-center shadow-md hover:bg-sky-700 hover:scale-110 transition-all z-10"
              >
                <Plus className="size-3" />
              </button>
            )}
          </div>

          <div className="flex flex-col items-center relative pr-4">
            <span className="text-amber-600 mb-1">Tempo Esgotado</span>
            <Handle
              type="source"
              position={Position.Bottom}
              id="timeout"
              style={{ left: "72%" }}
              className="!w-5 !h-5 !bg-amber-500 !border-2 !border-white hover:scale-125 transition-transform cursor-crosshair rounded-full shadow-sm"
            />
            {onAddNext && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onAddNext(id, "timeout");
                }}
                title="Adicionar ação se estourar tempo"
                className="absolute -bottom-6 right-[20%] size-5 bg-amber-600 text-white rounded-full flex items-center justify-center shadow-md hover:bg-amber-700 hover:scale-110 transition-all z-10"
              >
                <Plus className="size-3" />
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="pt-2 flex flex-col items-center relative">
          <span className="text-[10px] font-semibold text-sky-600 tracking-wider uppercase mb-1">
            Após Espera
          </span>
          <Handle
            type="source"
            position={Position.Bottom}
            id="next"
            className="!w-5 !h-5 !bg-sky-500 !border-2 !border-white hover:scale-125 transition-transform cursor-crosshair rounded-full shadow-sm"
          />
          {onAddNext && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onAddNext(id, "next");
              }}
              title="Adicionar próximo passo"
              className="absolute -bottom-6 size-5 bg-sky-600 text-white rounded-full flex items-center justify-center shadow-md hover:bg-sky-700 hover:scale-110 transition-all z-10"
            >
              <Plus className="size-3" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function EndNodeCard({ data }: NodeProps) {
  return (
    <div className="border-2 border-slate-500/70 bg-card rounded-2xl p-4 shadow-md w-56 text-xs space-y-2 relative text-center hover:border-slate-500 transition-colors">
      <Handle
        type="target"
        position={Position.Top}
        id="input"
        className="!w-5 !h-5 !bg-slate-500 !border-2 !border-white hover:scale-125 transition-transform cursor-crosshair rounded-full shadow-sm"
      />
      <div className="flex items-center justify-center gap-2 text-slate-700 dark:text-slate-300 font-semibold">
        <CheckCircle2 className="size-4" />
        <span>Fim do Fluxo</span>
      </div>
      <p className="text-[10px] text-muted-foreground">Libera o controle e encerra a execução.</p>
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
// PÁGINA PRINCIPAL DO CANVAS COM INSPECTOR FIXO LATERAL (A01)
// ============================================================================

function AutomacaoCanvasPage() {
  const { workflowId } = Route.useParams();
  const getWorkflow = useServerFn(getWorkflowFn);
  const saveDraft = useServerFn(saveWorkflowDraftFn);
  const publishWf = useServerFn(publishWorkflowFn);
  const listExecutions = useServerFn(listExecutionsFn);
  const getExecutionDetail = useServerFn(getExecutionDetailFn);
  const getAuxData = useServerFn(getAvailableChannelsAndConnectionsFn);

  const [workflow, setWorkflow] = useState<any>(null);
  const [versionNumber, setVersionNumber] = useState(1);
  const [activeVersionNumber, setActiveVersionNumber] = useState<number | null>(null);
  const [hasUnpublishedChanges, setHasUnpublishedChanges] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [activeTab, setActiveTab] = useState<"canvas" | "history">("canvas");

  const [auxData, setAuxData] = useState<{
    instances: any[];
    stages: any[];
    pipelines: any[];
    owners?: any[];
  }>({
    instances: [],
    stages: [],
    pipelines: [],
    owners: [],
  });

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const [executions, setExecutions] = useState<any[]>([]);
  const [selectedExecDetail, setSelectedExecDetail] = useState<{ execution?: any; exec?: any; steps: any[] } | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [quickPicker, setQuickPicker] = useState<{ sourceId: string; sourcePort: string } | null>(null);

  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedNodeId) || null,
    [nodes, selectedNodeId]
  );

  const updateNodeConfig = useCallback((nodeId: string, key: string, value: unknown) => {
    setIsDirty(true);
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

  // P1.9: Conexão rápida com botão '+' abre o seletor modal de tipo de nó em vez de forçar mensagem de texto fixa
  const handleAddNextNode = useCallback(
    (sourceId: string, sourcePort: string) => {
      const sourceNode = nodes.find((n) => n.id === sourceId);
      if (!sourceNode) return;
      setQuickPicker({ sourceId, sourcePort });
    },
    [nodes]
  );

  const handleAddSpecificNode = useCallback(
    (sourceId: string, sourcePort: string, typeKey: string) => {
      const sourceNode = nodes.find((n) => n.id === sourceId);
      if (!sourceNode) return;

      const newId = `node_${crypto.randomUUID().slice(0, 8)}`;
      const newPos = {
        x: sourceNode.position.x + (sourcePort === "false" || sourcePort === "timeout" ? 140 : 0),
        y: sourceNode.position.y + 190,
      };

      let nodeType = "actionNode";
      let nodeName = "Ação";
      let initialConfig: Record<string, any> = {};

      if (typeKey === "messaging.send_text") {
        nodeType = "actionNode";
        nodeName = "Enviar Mensagem";
        initialConfig = { text: "Olá! Como podemos te ajudar?", connectionPolicy: "same_as_trigger" };
      } else if (typeKey === "messaging.handoff_to_ai") {
        nodeType = "actionNode";
        nodeName = "Transmitir para IA";
        initialConfig = { promptOverride: "" };
      } else if (typeKey === "messaging.route_to_human") {
        nodeType = "actionNode";
        nodeName = "Transferir para Atendente";
        initialConfig = { queue: "default" };
      } else if (typeKey === "crm.add_tag") {
        nodeType = "actionNode";
        nodeName = "Adicionar Tag CRM";
        initialConfig = { tag: "interessado" };
      } else if (typeKey === "crm.remove_tag") {
        nodeType = "actionNode";
        nodeName = "Remover Tag CRM";
        initialConfig = { tag: "lead" };
      } else if (typeKey === "crm.move_card_stage") {
        nodeType = "actionNode";
        nodeName = "Mover Etapa CRM";
        initialConfig = {};
      } else if (typeKey === "crm.assign_card") {
        nodeType = "actionNode";
        nodeName = "Atribuir Responsável";
        initialConfig = {};
      } else if (typeKey === "flow.condition") {
        nodeType = "conditionNode";
        nodeName = "Condição Se / Senão";
        initialConfig = { field: "text", operator: "contains", value: "" };
      } else if (typeKey === "messaging.wait_for_reply") {
        nodeType = "waitNode";
        nodeName = "Aguardar Resposta";
        initialConfig = { timeoutMinutes: 60 };
      } else if (typeKey === "control.wait_duration") {
        nodeType = "delayNode";
        nodeName = "Aguardar Tempo";
        initialConfig = { durationMinutes: 15 };
      }

      const newNode: Node = {
        id: newId,
        type: nodeType,
        position: newPos,
        data: {
          id: newId,
          type: typeKey,
          version: 1,
          name: nodeName,
          config: initialConfig,
        },
      };

      const newEdge: Edge = {
        id: `edge_${sourceId}_${sourcePort}_to_${newId}`,
        source: sourceId,
        sourceHandle: sourcePort,
        target: newId,
        targetHandle: "input",
        markerEnd: { type: MarkerType.ArrowClosed },
        animated: true,
      };

      // Substitui aresta existente daquela mesma porta, se houver
      setEdges((eds) => {
        const filtered = eds.filter(
          (e) => !(e.source === sourceId && (e.sourceHandle || "next") === sourcePort)
        );
        return [...filtered, newEdge];
      });

      setNodes((nds) => [...nds, newNode]);
      setSelectedNodeId(newId);
      setIsDirty(true);
      setQuickPicker(null);
      toast.success(`Passo "${nodeName}" adicionado e conectado!`);
    },
    [nodes, setNodes, setEdges]
  );

  // Injeta callback de adicionar próximo passo em cada nó
  const decoratedNodes = useMemo(() => {
    return nodes.map((n) => ({
      ...n,
      data: {
        ...n.data,
        onAddNext: handleAddNextNode,
      },
    }));
  }, [nodes, handleAddNextNode]);

  // Carga inicial do fluxo
  async function loadData() {
    if (!workflowId) return;
    setLoading(true);
    try {
      const [resWfRaw, resAux] = await Promise.all([
        getWorkflow({ data: { workflowId } }),
        getAuxData(),
      ]);

      const resWf = resWfRaw as any;
      setWorkflow(resWf.workflow);
      setVersionNumber(resWf.versionNumber);
      setActiveVersionNumber(resWf.activeVersionNumber || null);
      setHasUnpublishedChanges(resWf.hasUnpublishedChanges);
      setAuxData(resAux as any);
      setIsDirty(false);

      const flowNodes: Node[] = (resWf.graph?.nodes || []).map((n: any) => {
        let nType = "actionNode";
        if (n.type.startsWith("messaging.inbound") || n.type.startsWith("crm.card")) nType = "triggerNode";
        else if (n.type.startsWith("condition.")) nType = "conditionNode";
        else if (n.type.startsWith("control.wait") || n.type.startsWith("messaging.wait")) nType = "waitNode";
        else if (n.type === "control.end") nType = "endNode";

        return {
          id: n.id,
          type: nType,
          position: n.position || { x: 250, y: 100 },
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

  // A03: Validação de conexões estritas no motor sequencial v1
  const isValidConnection = useCallback(
    (connection: Connection | Edge) => {
      if (!connection.source || !connection.target) return false;
      if (connection.source === connection.target) return false;

      const sourceNode = nodes.find((n) => n.id === connection.source);
      const targetNode = nodes.find((n) => n.id === connection.target);
      if (!sourceNode || !targetNode) return false;

      // Triggers não podem receber conexões de entrada
      if (targetNode.type === "triggerNode") return false;

      // Nodos terminais não podem ter conexões de saída
      if (sourceNode.type === "endNode" || sourceNode.data?.type === "messaging.route_to_human") {
        return false;
      }

      // P1: Permite que onConnect substitua a conexão daquela porta para o novo destino.
      // Bloqueia apenas conexões idênticas duplicadas (mesmo source, porta e target).
      const port = connection.sourceHandle || "next";
      const isDuplicate = edges.some(
        (e) =>
          e.source === connection.source &&
          (e.sourceHandle || "next") === port &&
          e.target === connection.target
      );
      if (isDuplicate) {
        return false;
      }

      return true;
    },
    [nodes, edges]
  );

  const onConnect = useCallback(
    (params: Connection) => {
      const port = params.sourceHandle || "next";
      const existingIndex = edges.findIndex(
        (e) => e.source === params.source && (e.sourceHandle || "next") === port
      );

      setIsDirty(true);

      // Se já existia aresta daquela porta, substitui a anterior
      if (existingIndex >= 0) {
        setEdges((eds) => {
          const filtered = eds.filter((_, idx) => idx !== existingIndex);
          return addEdge(
            { ...params, markerEnd: { type: MarkerType.ArrowClosed }, animated: true },
            filtered
          );
        });
        toast.info("Conexão anterior substituída.");
      } else {
        setEdges((eds) =>
          addEdge(
            { ...params, markerEnd: { type: MarkerType.ArrowClosed }, animated: true },
            eds
          )
        );
      }
    },
    [edges, setEdges]
  );

  const onNodeClick = useCallback((_: any, node: Node) => {
    setSelectedNodeId(node.id);
  }, []);

  // Adicionar novo nó a partir da paleta lateral
  function addNodeFromPalette(type: string, label: string) {
    const id = `node_${crypto.randomUUID().slice(0, 8)}`;
    let nType = "actionNode";
    if (type.startsWith("messaging.inbound") || type.startsWith("crm.card")) nType = "triggerNode";
    else if (type.startsWith("condition.")) nType = "conditionNode";
    else if (type.startsWith("control.wait") || type.startsWith("messaging.wait")) nType = "waitNode";
    else if (type === "control.end") nType = "endNode";

    // Posicionamento inteligente abaixo do nó mais baixo ou no centro
    const maxY = nodes.length > 0 ? Math.max(...nodes.map((n) => n.position.y)) : 50;
    const posX = nodes.length > 0 ? nodes[0].position.x : 250;

    const newNode: Node = {
      id,
      type: nType,
      position: { x: posX, y: maxY + 170 },
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
    setIsDirty(true);
    toast.success(`Nó "${label}" adicionado ao canvas`);
  }

  // Empacotar grafo atual preservando nome e propriedades
  function buildCurrentGraph() {
    return {
      schemaVersion: 1,
      nodes: nodes.map((n) => ({
        id: n.id,
        type: n.data.type as string,
        version: (n.data.version as number) || 1,
        name: (n.data.name as string) || n.data.type,
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
      toast.success(`Rascunho salvo com sucesso (v${res.versionNumber})`);
      setVersionNumber(res.versionNumber);
      setHasUnpublishedChanges(true);
      setIsDirty(false);
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
      toast.success(`Fluxo publicado! Versão ${res.versionNumber} ativa em produção.`);
      setVersionNumber(res.versionNumber);
      setActiveVersionNumber(res.versionNumber);
      setHasUnpublishedChanges(false);
      setIsDirty(false);
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

  async function viewExecutionTrace(execId: string) {
    setLoadingDetail(true);
    try {
      const detail = await getExecutionDetail({ data: { executionId: execId } });
      setSelectedExecDetail(detail as any);
    } catch (e: any) {
      toast.error(e?.message || "Erro ao carregar detalhes da execução");
    } finally {
      setLoadingDetail(false);
    }
  }

  return (
    <div className="flex flex-col h-full w-full overflow-hidden bg-background">
      {/* Top Bar com distinção de Rascunho vs Publicado (A04) */}
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

              {/* Badges claros A04: Publicado vs Rascunho vs Alterações sem publicar */}
              {workflow?.status === "published" ? (
                hasUnpublishedChanges ? (
                  <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-700 border-amber-300 gap-1 font-medium">
                    <span className="size-1.5 rounded-full bg-amber-500 inline-block animate-pulse" />
                    Publicado v{activeVersionNumber} · Alterações não publicadas (v{versionNumber})
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-700 border-emerald-300 gap-1 font-medium">
                    <Check className="size-3" />
                    Publicado (v{activeVersionNumber})
                  </Badge>
                )
              ) : workflow?.status === "paused" ? (
                <Badge variant="outline" className="text-[10px] bg-slate-500/10 text-slate-700 border-slate-300">
                  Pausado (v{activeVersionNumber || versionNumber})
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[10px] bg-muted text-muted-foreground border">
                  Rascunho (v{versionNumber})
                </Badge>
              )}

              {isDirty && (
                <span className="text-[10px] text-muted-foreground italic font-normal">
                  (não salvo)
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Tab switcher */}
        <div className="flex items-center gap-2">
          <Tabs
            value={activeTab}
            onValueChange={(v: any) => {
              setActiveTab(v);
              if (v === "history") loadExecutions();
            }}
          >
            <TabsList className="h-9">
              <TabsTrigger value="canvas" className="text-xs gap-1.5">
                <Layers className="size-3.5" /> Canvas Visual
              </TabsTrigger>
              <TabsTrigger value="history" className="text-xs gap-1.5">
                <History className="size-3.5" /> Histórico & Auditoria
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
            className="bg-[var(--brand)] hover:bg-[var(--brand)]/90 text-white gap-1.5 text-xs shadow-sm"
          >
            {publishing ? <Loader2 className="size-3.5 animate-spin" /> : <Rocket className="size-3.5" />}
            Publicar Fluxo
          </Button>
        </div>
      </div>

      {/* Main Area */}
      {activeTab === "canvas" ? (
        <div className="flex-1 flex overflow-hidden relative">
          {/* Paleta Lateral Plegável */}
          <aside className="w-64 border-r bg-card/60 backdrop-blur p-4 space-y-5 overflow-y-auto shrink-0 z-10 text-xs">
            <div>
              <h4 className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wider mb-2">
                Disparadores (Triggers)
              </h4>
              <div className="space-y-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => addNodeFromPalette("messaging.inbound_received", "Mensagem Recebida")}
                  className="w-full justify-start text-xs gap-2 border-indigo-500/30 text-indigo-700 hover:bg-indigo-50 dark:hover:bg-indigo-950"
                >
                  <MessageSquare className="size-3.5" /> Mensagem Recebida
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => addNodeFromPalette("crm.card_created", "Novo Lead no Funil")}
                  className="w-full justify-start text-xs gap-2 border-indigo-500/30 text-indigo-700 hover:bg-indigo-50 dark:hover:bg-indigo-950"
                >
                  <UserPlus className="size-3.5" /> Novo Lead no Funil
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
                  onClick={() => addNodeFromPalette("messaging.send_text", "Enviar Mensagem")}
                  className="w-full justify-start text-xs gap-2 border-emerald-500/30 text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950"
                >
                  <Send className="size-3.5" /> Enviar Mensagem
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => addNodeFromPalette("messaging.handoff_to_ai", "Handoff para IA")}
                  className="w-full justify-start text-xs gap-2 border-emerald-500/30 text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950"
                >
                  <Bot className="size-3.5" /> Derivar para IA
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
                  onClick={() => addNodeFromPalette("crm.move_card_to_stage", "Mover de Etapa")}
                  className="w-full justify-start text-xs gap-2 border-emerald-500/30 text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950"
                >
                  <KanbanSquare className="size-3.5" /> Mover de Etapa
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => addNodeFromPalette("crm.add_tag", "Adicionar Etiqueta")}
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
                  onClick={() => addNodeFromPalette("condition.if_else", "Condição Se / Não")}
                  className="w-full justify-start text-xs gap-2 border-amber-500/30 text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950"
                >
                  <GitBranch className="size-3.5" /> Condição Se / Não
                </Button>
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
                  onClick={() => addNodeFromPalette("control.end", "Fim do Fluxo")}
                  className="w-full justify-start text-xs gap-2 border-slate-500/30 text-slate-700 hover:bg-slate-50 dark:hover:bg-slate-950"
                >
                  <CheckCircle2 className="size-3.5" /> Fim do Fluxo
                </Button>
              </div>
            </div>
          </aside>

          {/* Canvas React Flow Central */}
          <main className="flex-1 h-full w-full bg-slate-50 dark:bg-slate-950 relative">
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="size-8 animate-spin text-[var(--brand)]" />
              </div>
            ) : (
              <ReactFlow
                nodes={decoratedNodes}
                edges={edges}
                nodeTypes={nodeTypes}
                onNodesChange={(changes) => {
                  setIsDirty(true);
                  onNodesChange(changes);
                }}
                onEdgesChange={(changes) => {
                  setIsDirty(true);
                  onEdgesChange(changes);
                }}
                onConnect={onConnect}
                isValidConnection={isValidConnection}
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
          </main>

          {/* A01: Inspector Fixo Não-Modal (Painel Lateral Direito sem overlay escuro!) */}
          {selectedNode && (
            <aside className="w-80 md:w-96 border-l bg-card flex flex-col shrink-0 overflow-y-auto z-20 shadow-lg animate-in slide-in-from-right duration-200">
              <div className="p-4 border-b flex items-center justify-between bg-muted/20">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-xs truncate max-w-[200px]">
                    {selectedNode.data.name as string || "Configurar Nó"}
                  </span>
                  <Badge variant="outline" className="text-[10px]">
                    {selectedNode.type}
                  </Badge>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 text-muted-foreground hover:text-foreground"
                  onClick={() => setSelectedNodeId(null)}
                >
                  <X className="size-4" />
                </Button>
              </div>

              <div className="p-4 space-y-4 text-xs flex-1 overflow-y-auto">
                {/* 1. Nome do Nó no Canvas */}
                <div className="space-y-1.5">
                  <Label>Rótulo / Nome do Passo</Label>
                  <Input
                    value={(selectedNode.data.name as string) || ""}
                    onChange={(e) => {
                      const newName = e.target.value;
                      setIsDirty(true);
                      setNodes((nds) =>
                        nds.map((n) =>
                          n.id === selectedNode.id
                            ? { ...n, data: { ...n.data, name: newName } }
                            : n
                        )
                      );
                    }}
                  />
                </div>

                {/* 2. Formulários Especializados por Tipo de Nó */}

                {/* messaging.inbound_received (Trigger) */}
                {selectedNode.data.type === "messaging.inbound_received" && (
                  <>
                    <div className="space-y-1.5">
                      <Label>Canais Habilitados (A06)</Label>
                      <div className="grid grid-cols-2 gap-2 pt-1 pb-2">
                        {[
                          { id: "whatsapp", label: "WhatsApp" },
                          { id: "instagram_dm", label: "Instagram DM" },
                          { id: "facebook_messenger", label: "Messenger" },
                          { id: "telegram", label: "Telegram" },
                        ].map((ch) => {
                          const curChannels = ((selectedNode.data.config as any)?.channels as string[]) || [];
                          const isChecked = curChannels.includes(ch.id);
                          return (
                            <label key={ch.id} className="flex items-center gap-2 cursor-pointer text-xs">
                              <input
                                type="checkbox"
                                className="rounded border-gray-300 text-primary"
                                checked={isChecked}
                                onChange={(e) => {
                                  const next = e.target.checked
                                    ? [...curChannels.filter((c) => c !== ch.id), ch.id]
                                    : curChannels.filter((c) => c !== ch.id);
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
                          <SelectItem value="selected">Conexão específica</SelectItem>
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
                    </div>
                  </>
                )}

                {/* crm.card_created (Trigger A05) */}
                {selectedNode.data.type === "crm.card_created" && (
                  <>
                    <div className="space-y-1.5">
                      <Label>Funil / Pipeline</Label>
                      <Select
                        value={((selectedNode.data.config as any)?.pipelineId as string) || "all"}
                        onValueChange={(val) => updateNodeConfig(selectedNode.id, "pipelineId", val === "all" ? null : val)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Qualquer funil" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Qualquer funil</SelectItem>
                          {auxData.pipelines.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.nome}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <Label>Etapa Inicial (Opcional)</Label>
                      <Select
                        value={((selectedNode.data.config as any)?.stageId as string) || "all"}
                        onValueChange={(val) => updateNodeConfig(selectedNode.id, "stageId", val === "all" ? null : val)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Qualquer etapa inicial" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Qualquer etapa inicial</SelectItem>
                          {auxData.stages.map((st) => (
                            <SelectItem key={st.id} value={st.id}>
                              {st.nome}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                )}

                {/* crm.card_stage_changed (Trigger A05) */}
                {selectedNode.data.type === "crm.card_stage_changed" && (
                  <>
                    <div className="space-y-1.5">
                      <Label>Funil / Pipeline</Label>
                      <Select
                        value={((selectedNode.data.config as any)?.pipelineId as string) || "all"}
                        onValueChange={(val) => updateNodeConfig(selectedNode.id, "pipelineId", val === "all" ? null : val)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Qualquer funil" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Qualquer funil</SelectItem>
                          {auxData.pipelines.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.nome}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <Label>Etapa de Origem (De onde veio)</Label>
                      <Select
                        value={((selectedNode.data.config as any)?.fromStageId as string) || "any"}
                        onValueChange={(val) => updateNodeConfig(selectedNode.id, "fromStageId", val === "any" ? null : val)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Qualquer etapa anterior" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="any">Qualquer etapa anterior</SelectItem>
                          {auxData.stages.map((st) => (
                            <SelectItem key={st.id} value={st.id}>
                              {st.nome}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <Label>Etapa de Destino * (Para onde foi)</Label>
                      <Select
                        value={((selectedNode.data.config as any)?.toStageId as string) || ""}
                        onValueChange={(val) => updateNodeConfig(selectedNode.id, "toStageId", val)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione a etapa destino..." />
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
                  </>
                )}

                {/* crm.card_owner_changed (Trigger A05) */}
                {selectedNode.data.type === "crm.card_owner_changed" && (
                  <div className="space-y-1.5">
                    <Label>Novo Responsável Designado</Label>
                    <Select
                      value={((selectedNode.data.config as any)?.toOwnerId as string) || "any"}
                      onValueChange={(val) => updateNodeConfig(selectedNode.id, "toOwnerId", val === "any" ? null : val)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Qualquer responsável" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">Qualquer responsável</SelectItem>
                        {(auxData.owners || []).map((u) => (
                          <SelectItem key={u.id} value={u.id}>
                            {u.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
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
                  </div>
                )}

                {/* messaging.send_text (Action) */}
                {selectedNode.data.type === "messaging.send_text" && (
                  <>
                    <div className="space-y-1.5">
                      <Label>Texto da Mensagem *</Label>
                      <Textarea
                        rows={4}
                        placeholder="Digite a mensagem... use {{contact.name}} ou {{card.nome}}"
                        value={((selectedNode.data.config as any)?.text as string) || ""}
                        onChange={(e) => updateNodeConfig(selectedNode.id, "text", e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Política de Conexão de Envio</Label>
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

                {/* crm.move_card_to_stage (Action) */}
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

                {/* crm.add_tag (Action) */}
                {selectedNode.data.type === "crm.add_tag" && (
                  <div className="space-y-1.5">
                    <Label>Nome da Etiqueta *</Label>
                    <Input
                      placeholder="Ex: interessado, cotacao_enviada"
                      value={((selectedNode.data.config as any)?.tag as string) || ""}
                      onChange={(e) => updateNodeConfig(selectedNode.id, "tag", e.target.value)}
                    />
                  </div>
                )}

                {/* condition.if_else (Logic) */}
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
                          <SelectItem value="trigger.channel">Canal (WhatsApp/Instagram)</SelectItem>
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

                {/* control.wait_duration (Logic) */}
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

                {/* messaging.wait_for_reply (Wait) */}
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
                      Se o cliente não responder antes desse prazo, o fluxo segue pela saída &quot;Tempo Esgotado&quot;.
                    </p>
                  </div>
                )}

                {/* messaging.route_to_human (Handoff) */}
                {selectedNode.data.type === "messaging.route_to_human" && (
                  <div className="space-y-1.5">
                    <Label>Motivo da Derivação</Label>
                    <Input
                      placeholder="Ex: Cliente solicitou atendimento humano"
                      value={((selectedNode.data.config as any)?.reason as string) || "Cliente solicitou assessor humano"}
                      onChange={(e) => updateNodeConfig(selectedNode.id, "reason", e.target.value)}
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Pausa o bot e notifica a equipe. Este nó encerra o fluxo automaticamente (A11).
                    </p>
                  </div>
                )}

                <div className="pt-4 border-t flex justify-between gap-2">
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => {
                      setNodes((nds) => nds.filter((n) => n.id !== selectedNode.id));
                      setEdges((eds) => eds.filter((e) => e.source !== selectedNode.id && e.target !== selectedNode.id));
                      setSelectedNodeId(null);
                      setIsDirty(true);
                      toast.success("Nó removido do canvas");
                    }}
                    className="text-xs"
                  >
                    Excluir Nó
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => setSelectedNodeId(null)}
                    className="text-xs"
                  >
                    Concluir
                  </Button>
                </div>
              </div>
            </aside>
          )}
        </div>
      ) : (
        /* Pestaña de Historial de Ejecuciones com Auditoria Detalhada (A14) */
        <div className="flex-1 overflow-y-auto p-6 max-w-5xl mx-auto w-full space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold">Histórico de Execuções Recentes</h3>
              <p className="text-xs text-muted-foreground">
                Acompanhe o caminho percorrido, erros e transições de cada disparo.
              </p>
            </div>
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
                    <th className="p-3 text-right">Ação</th>
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
                      <td className="p-3 font-mono text-[11px]">{x.external_conversation_id || "N/A"}</td>
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
                      <td className="p-3 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => viewExecutionTrace(x.id)}
                          className="h-7 px-2 text-xs text-primary"
                        >
                          Ver Passos
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Modal com Rastro Detalhado da Execução (A14 / P1.8) */}
          <Dialog open={Boolean(selectedExecDetail)} onOpenChange={(o) => !o && setSelectedExecDetail(null)}>
            <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="text-base flex items-center gap-2">
                  <span>Trilha da Execução</span>
                  <Badge variant="outline" className="text-xs">
                    {(selectedExecDetail?.execution || selectedExecDetail?.exec)?.status || "desconhecido"}
                  </Badge>
                </DialogTitle>
              </DialogHeader>

              {loadingDetail ? (
                <div className="py-8 flex justify-center">
                  <Loader2 className="size-6 animate-spin text-primary" />
                </div>
              ) : (
                <div className="space-y-4 text-xs">
                  <div className="grid grid-cols-2 gap-2 p-3 bg-muted/40 rounded-xl">
                    <div>
                      <span className="text-muted-foreground block text-[10px]">ID da Execução:</span>
                      <span className="font-mono text-[11px]">{(selectedExecDetail?.execution || selectedExecDetail?.exec)?.id}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block text-[10px]">Iniciado em:</span>
                      <span>
                        {(selectedExecDetail?.execution || selectedExecDetail?.exec)?.created_at
                          ? new Date((selectedExecDetail?.execution || selectedExecDetail?.exec).created_at).toLocaleString()
                          : "—"}
                      </span>
                    </div>
                  </div>

                  <h4 className="font-semibold text-xs pt-2">Passos Executados (Steps):</h4>
                  <div className="space-y-2 border rounded-xl p-3 bg-card divide-y">
                    {(selectedExecDetail?.steps || []).length === 0 ? (
                      <p className="text-muted-foreground text-center py-4">Nenhum passo registrado nesta execução.</p>
                    ) : (
                      selectedExecDetail?.steps.map((step: any, idx: number) => (
                        <div key={step.id || idx} className="py-2.5 flex items-center justify-between gap-3 first:pt-0 last:pb-0">
                          <div>
                            <div className="font-medium flex items-center gap-1.5">
                              <span className="size-4 rounded-full bg-primary/10 text-primary text-[10px] flex items-center justify-center font-bold">
                                {idx + 1}
                              </span>
                              <span>Nó: {step.node_id}</span>
                              {step.selected_port && (
                                <Badge variant="secondary" className="text-[9px]">
                                  Ramo: {step.selected_port}
                                </Badge>
                              )}
                            </div>
                            <span className="text-[10px] text-muted-foreground block mt-0.5">
                              Duração: {step.duration_ms || 0}ms · Tentativa: {step.attempt || 1}
                            </span>
                          </div>
                          <div>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                                step.status === "succeeded"
                                  ? "bg-emerald-500/10 text-emerald-600"
                                  : step.status === "waiting"
                                    ? "bg-sky-500/10 text-sky-600"
                                    : "bg-rose-500/10 text-rose-600"
                              }`}
                            >
                              {step.status}
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>

          {/* Modal Seletor de Próximo Passo ao clicar no botão '+' (P1.9) */}
          <Dialog open={Boolean(quickPicker)} onOpenChange={(o) => !o && setQuickPicker(null)}>
            <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="text-base flex items-center gap-2">
                  <Plus className="size-5 text-primary" />
                  <span>Escolha o Próximo Passo do Fluxo</span>
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">Mensagens & Atendimento</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => quickPicker && handleAddSpecificNode(quickPicker.sourceId, quickPicker.sourcePort, "messaging.send_text")}
                      className="p-3 text-left border rounded-xl hover:border-primary hover:bg-primary/5 transition-colors flex flex-col gap-1"
                    >
                      <span className="font-semibold text-xs flex items-center gap-1.5 text-foreground">
                        <MessageSquare className="size-3.5 text-primary" /> Enviar Mensagem
                      </span>
                      <span className="text-[11px] text-muted-foreground">Dispara texto no canal da conversa.</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => quickPicker && handleAddSpecificNode(quickPicker.sourceId, quickPicker.sourcePort, "messaging.handoff_to_ai")}
                      className="p-3 text-left border rounded-xl hover:border-primary hover:bg-primary/5 transition-colors flex flex-col gap-1"
                    >
                      <span className="font-semibold text-xs flex items-center gap-1.5 text-foreground">
                        <Sparkles className="size-3.5 text-purple-600" /> Transmitir para IA
                      </span>
                      <span className="text-[11px] text-muted-foreground">Transfere para o Agente IA inteligente.</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => quickPicker && handleAddSpecificNode(quickPicker.sourceId, quickPicker.sourcePort, "messaging.route_to_human")}
                      className="p-3 text-left border rounded-xl hover:border-primary hover:bg-primary/5 transition-colors flex flex-col gap-1"
                    >
                      <span className="font-semibold text-xs flex items-center gap-1.5 text-foreground">
                        <UserCheck className="size-3.5 text-amber-600" /> Transferir para Humano
                      </span>
                      <span className="text-[11px] text-muted-foreground">Pausa automação e chama atendente (terminal).</span>
                    </button>
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">Ações de CRM & Leads</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => quickPicker && handleAddSpecificNode(quickPicker.sourceId, quickPicker.sourcePort, "crm.add_tag")}
                      className="p-3 text-left border rounded-xl hover:border-primary hover:bg-primary/5 transition-colors flex flex-col gap-1"
                    >
                      <span className="font-semibold text-xs flex items-center gap-1.5 text-foreground">
                        <Tag className="size-3.5 text-emerald-600" /> Adicionar Tag CRM
                      </span>
                      <span className="text-[11px] text-muted-foreground">Aplica etiqueta ao lead.</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => quickPicker && handleAddSpecificNode(quickPicker.sourceId, quickPicker.sourcePort, "crm.remove_tag")}
                      className="p-3 text-left border rounded-xl hover:border-primary hover:bg-primary/5 transition-colors flex flex-col gap-1"
                    >
                      <span className="font-semibold text-xs flex items-center gap-1.5 text-foreground">
                        <Tag className="size-3.5 text-rose-600" /> Remover Tag CRM
                      </span>
                      <span className="text-[11px] text-muted-foreground">Remove etiqueta específica.</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => quickPicker && handleAddSpecificNode(quickPicker.sourceId, quickPicker.sourcePort, "crm.move_card_stage")}
                      className="p-3 text-left border rounded-xl hover:border-primary hover:bg-primary/5 transition-colors flex flex-col gap-1"
                    >
                      <span className="font-semibold text-xs flex items-center gap-1.5 text-foreground">
                        <Layers className="size-3.5 text-blue-600" /> Mover Etapa Funil
                      </span>
                      <span className="text-[11px] text-muted-foreground">Avança o cartão no pipeline de vendas.</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => quickPicker && handleAddSpecificNode(quickPicker.sourceId, quickPicker.sourcePort, "crm.assign_card")}
                      className="p-3 text-left border rounded-xl hover:border-primary hover:bg-primary/5 transition-colors flex flex-col gap-1"
                    >
                      <span className="font-semibold text-xs flex items-center gap-1.5 text-foreground">
                        <Users className="size-3.5 text-teal-600" /> Atribuir Responsável
                      </span>
                      <span className="text-[11px] text-muted-foreground">Define o corretor/atendente do lead.</span>
                    </button>
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">Controle de Fluxo & Lógica</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => quickPicker && handleAddSpecificNode(quickPicker.sourceId, quickPicker.sourcePort, "flow.condition")}
                      className="p-3 text-left border rounded-xl hover:border-primary hover:bg-primary/5 transition-colors flex flex-col gap-1"
                    >
                      <span className="font-semibold text-xs flex items-center gap-1.5 text-foreground">
                        <GitBranch className="size-3.5 text-amber-500" /> Condição (Sim / Não)
                      </span>
                      <span className="text-[11px] text-muted-foreground">Bifurca o fluxo de acordo com respostas ou tags.</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => quickPicker && handleAddSpecificNode(quickPicker.sourceId, quickPicker.sourcePort, "messaging.wait_for_reply")}
                      className="p-3 text-left border rounded-xl hover:border-primary hover:bg-primary/5 transition-colors flex flex-col gap-1"
                    >
                      <span className="font-semibold text-xs flex items-center gap-1.5 text-foreground">
                        <Clock className="size-3.5 text-sky-500" /> Aguardar Resposta
                      </span>
                      <span className="text-[11px] text-muted-foreground">Espera mensagem do lead com ramo de timeout.</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => quickPicker && handleAddSpecificNode(quickPicker.sourceId, quickPicker.sourcePort, "control.wait_duration")}
                      className="p-3 text-left border rounded-xl hover:border-primary hover:bg-primary/5 transition-colors flex flex-col gap-1"
                    >
                      <span className="font-semibold text-xs flex items-center gap-1.5 text-foreground">
                        <Clock className="size-3.5 text-indigo-500" /> Aguardar Tempo
                      </span>
                      <span className="text-[11px] text-muted-foreground">Pausa por minutos, horas ou dias.</span>
                    </button>
                  </div>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      )}
    </div>
  );
}
