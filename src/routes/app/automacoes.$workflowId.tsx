// src/routes/app/automacoes.$workflowId.tsx
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
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
  duplicateWorkflowFn,
  listExecutionsFn,
  getExecutionDetailFn,
  getAvailableChannelsAndConnectionsFn,
  listMetaPostsForInstanceFn,
  uploadAutomationMediaFn,
} from "@/lib/automations/functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
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
  MessageSquareQuote,
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
  Radio,
  MessageCircle,
  Share2,
  Image,
  ListChecks,
  FormInput,
  FileCheck2,
  Upload,
  Copy,
  Settings,
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
  const isTgMsg = data.type === "telegram.business_message_received";
  const isTgPost = data.type === "telegram.channel_post_published";
  const isTgComment = data.type === "telegram.channel_comment_received";
  const isMetaComment = data.type === "meta.comment_received";

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
          {isTgMsg && <Send className="size-4 text-sky-500" />}
          {isTgPost && <Radio className="size-4 text-sky-500" />}
          {isTgComment && <MessageCircle className="size-4 text-sky-500" />}
          {isMetaComment && <MessageSquareQuote className="size-4 text-fuchsia-600" />}
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
                : isTag
                  ? "Dispara ao modificar tags"
                  : isTgMsg
                    ? "Dispara com mensagem direta no Telegram Business"
                    : isTgPost
                      ? "Dispara com nova publicação no canal Telegram"
                      : isTgComment
                        ? "Dispara com novo comentário em post do Telegram"
                        : isMetaComment
                          ? `Comentário no Instagram/FB (${((data.config as any)?.keywords || []).length > 0 ? ((data.config as any)?.keywords || []).join(", ") : "qualquer post"})`
                          : "Gatilho de automação"}
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
  const isTgReply = data.type === "telegram.send_business_reply";
  const isTgPublish = data.type === "telegram.publish_to_channel";
  const isTgHuman = data.type === "telegram.route_to_human";
  const isEnsureLead = data.type === "crm.ensure_lead";
  const isMetaPrivateReply = data.type === "meta.send_private_reply";
  const isMetaReplyComment = data.type === "meta.reply_comment";
  const isSendMedia = data.type === "messaging.send_media";
  const isSendTemplate = data.type === "messaging.send_template";
  const isTerminal = isHuman || isTgHuman; // Ambos derivar a humano são terminais

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
          {isTgReply && <Send className="size-4 text-sky-500" />}
          {isTgPublish && <Share2 className="size-4 text-sky-500" />}
          {isTgHuman && <UserCheck className="size-4 text-rose-500" />}
          {isEnsureLead && <UserPlus className="size-4 text-indigo-600" />}
          {isMetaPrivateReply && <Send className="size-4 text-fuchsia-600" />}
          {isMetaReplyComment && <MessageSquareQuote className="size-4 text-pink-600" />}
          {isSendMedia && <Image className="size-4 text-emerald-600" />}
          {isSendTemplate && <FileCheck2 className="size-4 text-emerald-600" />}
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
                  : isTgReply
                    ? `Telegram: ${(data.config as any)?.text || "Responder em Business..."}`
                    : isTgPublish
                      ? `Telegram Canal: ${(data.config as any)?.text || "Publicar no canal..."}`
                      : isTgHuman
                        ? "Telegram: Pausa bot e deriva para atendente (Terminal)"
                        : isEnsureLead
                          ? `Garantir lead no CRM (tag: "${(data.config as any)?.tag || "sem tag"}")`
                          : isMetaPrivateReply
                            ? `DM Meta: "${(data.config as any)?.message?.slice(0, 36) || "Enviar mensagem privada..."}..."`
                            : isMetaReplyComment
                              ? `Resposta pública (${((data.config as any)?.variants || []).length > 0 ? `${((data.config as any)?.variants || []).length} variações` : (data.config as any)?.message?.slice(0, 24) || "Comentário público"})`
                              : isSendMedia
                                ? `Enviar Mídia: ${(data.config as any)?.mediaType || "arquivo"} (${(data.config as any)?.caption?.slice(0, 24) || (data.config as any)?.mediaUrl?.slice(0, 24) || "anexo"})`
                                : isSendTemplate
                                  ? `Modelo HSM: ${(data.config as any)?.templateName || "Template WhatsApp"}`
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

function InteractiveNodeCard({ data, id }: NodeProps) {
  const onAddNext = (data as any)?.onAddNext;
  const cfg = (data.config as any) || {};
  const options = Array.isArray(cfg.options) && cfg.options.length > 0
    ? cfg.options
    : [{ id: "opt_1", label: "Opção 1" }, { id: "opt_2", label: "Opção 2" }];

  return (
    <div className="border-2 border-indigo-500/70 bg-card rounded-2xl p-4 shadow-md w-80 text-xs space-y-3 relative hover:border-indigo-500 transition-colors">
      <Handle
        type="target"
        position={Position.Top}
        id="input"
        className="!w-5 !h-5 !bg-indigo-500 !border-2 !border-white hover:scale-125 transition-transform cursor-crosshair rounded-full shadow-sm"
      />

      <div className="flex items-center justify-between text-indigo-600 font-semibold">
        <div className="flex items-center gap-2">
          <ListChecks className="size-4" />
          <span className="truncate">{String(data.name || "Menu / Botões")}</span>
        </div>
        <Badge variant="outline" className="text-[9px] bg-indigo-500/10 text-indigo-700 border-indigo-200">
          Interativo
        </Badge>
      </div>

      <p className="text-muted-foreground line-clamp-2 italic">
        {cfg.bodyText || "Escolha uma das opções abaixo..."}
      </p>

      {/* Lista de opções com Handle à direita para cada ramo */}
      <div className="space-y-2 pt-1 border-t border-border/50">
        <span className="text-[10px] font-semibold text-muted-foreground tracking-wider uppercase">
          Ramos por Opção ({options.length})
        </span>
        {options.map((opt: any, idx: number) => (
          <div
            key={opt.id}
            className="flex items-center justify-between p-2 rounded-lg bg-indigo-500/5 border border-indigo-200/50 dark:border-indigo-900/50 relative group/opt"
          >
            <div className="flex items-center gap-1.5 truncate max-w-[190px]">
              <span className="size-4 rounded-full bg-indigo-500 text-white flex items-center justify-center text-[10px] font-bold shrink-0">
                {idx + 1}
              </span>
              <span className="font-medium truncate">{opt.label || `Opção ${idx + 1}`}</span>
            </div>
            <div className="flex items-center gap-1">
              <Handle
                type="source"
                position={Position.Right}
                id={opt.id}
                className="!w-4 !h-4 !bg-indigo-500 !border-2 !border-white hover:scale-125 transition-transform cursor-crosshair rounded-full shadow-sm"
              />
              {onAddNext && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAddNext(id, opt.id);
                  }}
                  className="size-5 rounded-full bg-indigo-100 hover:bg-indigo-200 dark:bg-indigo-950 dark:hover:bg-indigo-900 text-indigo-600 flex items-center justify-center transition-colors"
                  title={`Conectar ramo para "${opt.label}"`}
                >
                  <Plus className="size-3" />
                </button>
              )}
            </div>
          </div>
        ))}

        {/* Ramo Fallback */}
        <div className="flex items-center justify-between p-1.5 rounded-lg bg-slate-500/5 border border-slate-200/50 dark:border-slate-800 text-muted-foreground">
          <span className="text-[11px]">Outra resposta (Fallback)</span>
          <div className="flex items-center gap-1">
            <Handle
              type="source"
              position={Position.Right}
              id="fallback"
              className="!w-3.5 !h-3.5 !bg-slate-500 !border-2 !border-white hover:scale-125 transition-transform cursor-crosshair rounded-full shadow-sm"
            />
            {onAddNext && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onAddNext(id, "fallback");
                }}
                className="size-4 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-600 flex items-center justify-center transition-colors"
                title="Conectar ramo de fallback"
              >
                <Plus className="size-2.5" />
              </button>
            )}
          </div>
        </div>

        {/* Ramo Timeout */}
        <div className="pt-1 flex flex-col items-center relative">
          <span className="text-[9px] font-semibold text-amber-600 tracking-wider uppercase mb-1">
            Tempo Esgotado ({cfg.timeoutMinutes || 60}m)
          </span>
          <Handle
            type="source"
            position={Position.Bottom}
            id="timeout"
            className="!w-4 !h-4 !bg-amber-500 !border-2 !border-white hover:scale-125 transition-transform cursor-crosshair rounded-full shadow-sm"
          />
          {onAddNext && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onAddNext(id, "timeout");
              }}
              className="mt-1 size-4 rounded-full bg-amber-100 hover:bg-amber-200 dark:bg-amber-950 text-amber-600 flex items-center justify-center transition-colors"
              title="Conectar ramo de timeout"
            >
              <Plus className="size-2.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function CollectInputNodeCard({ data, id }: NodeProps) {
  const onAddNext = (data as any)?.onAddNext;
  const cfg = (data.config as any) || {};
  const vType = cfg.validationType || "text";
  const targetField = cfg.targetField === "custom" ? (cfg.customFieldKey || "campo_extra") : (cfg.targetField || "custom");

  return (
    <div className="border-2 border-teal-500/70 bg-card rounded-2xl p-4 shadow-md w-80 text-xs space-y-3 relative hover:border-teal-500 transition-colors">
      <Handle
        type="target"
        position={Position.Top}
        id="input"
        className="!w-5 !h-5 !bg-teal-500 !border-2 !border-white hover:scale-125 transition-transform cursor-crosshair rounded-full shadow-sm"
      />

      <div className="flex items-center justify-between text-teal-600 font-semibold">
        <div className="flex items-center gap-2">
          <FormInput className="size-4" />
          <span className="truncate">{String(data.name || "Capturar Dado")}</span>
        </div>
        <Badge variant="outline" className="text-[9px] bg-teal-500/10 text-teal-700 border-teal-200">
          CRM: {targetField}
        </Badge>
      </div>

      <p className="text-muted-foreground line-clamp-2 italic">
        {cfg.promptText || "Por favor, digite seu dado..."}
      </p>

      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <span className="font-semibold uppercase tracking-wider text-teal-700 dark:text-teal-400">Validação:</span>
        <Badge variant="secondary" className="text-[9px] font-mono capitalize">
          {vType}
        </Badge>
      </div>

      <div className="space-y-2 pt-1 border-t border-border/50">
        {/* Ramo Válido */}
        <div className="flex items-center justify-between p-2 rounded-lg bg-emerald-500/5 border border-emerald-200/50 dark:border-emerald-900/50">
          <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
            <CheckCircle2 className="size-3.5 text-emerald-600" /> Dado Válido (Salvo no CRM)
          </span>
          <div className="flex items-center gap-1">
            <Handle
              type="source"
              position={Position.Right}
              id="valid"
              className="!w-4 !h-4 !bg-emerald-500 !border-2 !border-white hover:scale-125 transition-transform cursor-crosshair rounded-full shadow-sm"
            />
            {onAddNext && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onAddNext(id, "valid");
                }}
                className="size-5 rounded-full bg-emerald-100 hover:bg-emerald-200 dark:bg-emerald-950 text-emerald-600 flex items-center justify-center transition-colors"
                title="Conectar ramo de dado válido"
              >
                <Plus className="size-3" />
              </button>
            )}
          </div>
        </div>

        {/* Ramo Inválido */}
        <div className="flex items-center justify-between p-2 rounded-lg bg-rose-500/5 border border-rose-200/50 dark:border-rose-900/50">
          <span className="text-[11px] font-medium text-rose-700 dark:text-rose-400 flex items-center gap-1.5">
            <X className="size-3.5 text-rose-600" /> Inválido (após {cfg.maxRetries ?? 2} tentativas)
          </span>
          <div className="flex items-center gap-1">
            <Handle
              type="source"
              position={Position.Right}
              id="invalid"
              className="!w-4 !h-4 !bg-rose-500 !border-2 !border-white hover:scale-125 transition-transform cursor-crosshair rounded-full shadow-sm"
            />
            {onAddNext && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onAddNext(id, "invalid");
                }}
                className="size-5 rounded-full bg-rose-100 hover:bg-rose-200 dark:bg-rose-950 text-rose-600 flex items-center justify-center transition-colors"
                title="Conectar ramo de dado inválido"
              >
                <Plus className="size-3" />
              </button>
            )}
          </div>
        </div>

        {/* Ramo Timeout */}
        <div className="pt-1 flex flex-col items-center relative">
          <span className="text-[9px] font-semibold text-amber-600 tracking-wider uppercase mb-1">
            Tempo Esgotado ({cfg.timeoutMinutes || 60}m)
          </span>
          <Handle
            type="source"
            position={Position.Bottom}
            id="timeout"
            className="!w-4 !h-4 !bg-amber-500 !border-2 !border-white hover:scale-125 transition-transform cursor-crosshair rounded-full shadow-sm"
          />
          {onAddNext && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onAddNext(id, "timeout");
              }}
              className="mt-1 size-4 rounded-full bg-amber-100 hover:bg-amber-200 dark:bg-amber-950 text-amber-600 flex items-center justify-center transition-colors"
              title="Conectar ramo de timeout"
            >
              <Plus className="size-2.5" />
            </button>
          )}
        </div>
      </div>
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
  delayNode: WaitNodeCard, // P1.B: Compatibilidade com nós de atraso
  interactiveNode: InteractiveNodeCard,
  collectNode: CollectInputNodeCard,
  endNode: EndNodeCard,
};

interface VariableChipsProps {
  onInsert: (variable: string) => void;
}

const AVAILABLE_VARIABLES: Array<{ label: string; tag: string }> = [
  { label: "Nome", tag: "{{contact.nome}}" },
  { label: "Telefone", tag: "{{contact.telefone}}" },
  { label: "E-mail", tag: "{{contact.email}}" },
  { label: "Card CRM", tag: "{{card.titulo}}" },
  { label: "Valor", tag: "{{card.valor}}" },
  { label: "Texto Gatilho", tag: "{{trigger.text}}" },
  { label: "ID Remetente", tag: "{{trigger.sender_id}}" },
  { label: "Última Resposta", tag: "{{last_reply.text}}" },
];

function VariableChips({ onInsert }: VariableChipsProps) {
  return (
    <div className="flex flex-wrap items-center gap-1 pt-1">
      <span className="text-[10px] text-muted-foreground mr-1">Inserir:</span>
      {AVAILABLE_VARIABLES.map((v) => (
        <button
          key={v.tag}
          type="button"
          onClick={() => onInsert(v.tag)}
          className="px-1.5 py-0.5 rounded text-[10px] bg-muted hover:bg-muted/80 text-foreground border transition-colors font-mono"
        >
          {v.label}
        </button>
      ))}
    </div>
  );
}

// ============================================================================
// PÁGINA PRINCIPAL DO CANVAS COM INSPECTOR FIXO LATERAL (A01)
// ============================================================================

function AutomacaoCanvasPage() {
  const { workflowId } = Route.useParams();
  const getWorkflow = useServerFn(getWorkflowFn);
  const saveDraft = useServerFn(saveWorkflowDraftFn);
  const publishWf = useServerFn(publishWorkflowFn);
  const duplicateWf = useServerFn(duplicateWorkflowFn);
  const listExecutions = useServerFn(listExecutionsFn);
  const getExecutionDetail = useServerFn(getExecutionDetailFn);
  const getAuxData = useServerFn(getAvailableChannelsAndConnectionsFn);
  const listMetaPosts = useServerFn(listMetaPostsForInstanceFn);
  const uploadMedia = useServerFn(uploadAutomationMediaFn);
  const navigate = useNavigate();

  const [workflow, setWorkflow] = useState<any>(null);
  const [versionNumber, setVersionNumber] = useState(1);
  const [activeVersionNumber, setActiveVersionNumber] = useState<number | null>(null);
  const [hasUnpublishedChanges, setHasUnpublishedChanges] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [activeTab, setActiveTab] = useState<"canvas" | "history">("canvas");

  const [workflowSettings, setWorkflowSettings] = useState<{
    reentry: "allow" | "deny_while_active" | "replace_active";
    maxRuntimeSeconds: number;
    maxSteps: number;
    ui_mode: "quick_rule" | "canvas";
    stopOnContactReply: boolean;
    stopOnStageIds: string[];
    timezone: string;
  }>({
    reentry: "deny_while_active",
    maxRuntimeSeconds: 604800,
    maxSteps: 100,
    ui_mode: "canvas",
    stopOnContactReply: false,
    stopOnStageIds: [],
    timezone: "America/Sao_Paulo",
  });
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [loadingMetaPosts, setLoadingMetaPosts] = useState(false);
  const [metaPostsList, setMetaPostsList] = useState<any[]>([]);
  const [uploadingMedia, setUploadingMedia] = useState(false);

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
      } else if (typeKey === "crm.move_card_to_stage" || typeKey === "crm.move_card_stage") {
        nodeType = "actionNode";
        nodeName = "Mover Etapa CRM";
        initialConfig = { stageId: "" };
      } else if (typeKey === "crm.assign_card") {
        nodeType = "actionNode";
        nodeName = "Atribuir Responsável";
        initialConfig = { ownerId: "" };
      } else if (typeKey === "condition.if_else" || typeKey === "flow.condition") {
        nodeType = "conditionNode";
        nodeName = "Condição Se / Senão";
        initialConfig = { variable: "trigger.text", operator: "contains", value: "" };
      } else if (typeKey === "messaging.wait_for_reply") {
        nodeType = "waitNode";
        nodeName = "Aguardar Resposta";
        initialConfig = { timeoutMinutes: 60 };
      } else if (typeKey === "control.wait_duration") {
        nodeType = "waitNode";
        nodeName = "Aguardar Tempo";
        initialConfig = { unit: "minutes", amount: 15 };
      } else if (typeKey === "telegram.send_business_reply") {
        nodeType = "actionNode";
        nodeName = "Telegram: Responder em Business";
        initialConfig = { text: "Olá! Obrigado pelo contato via Telegram." };
      } else if (typeKey === "telegram.publish_to_channel") {
        nodeType = "actionNode";
        nodeName = "Telegram: Publicar no Canal";
        initialConfig = { text: "Comunicado oficial no canal...", mediaType: "text", pinMessage: false };
      } else if (typeKey === "telegram.route_to_human") {
        nodeType = "actionNode";
        nodeName = "Telegram: Derivar a Atendente";
        initialConfig = { reason: "Solicitação de atendimento humano via Telegram" };
      } else if (typeKey === "meta.comment_received") {
        nodeType = "triggerNode";
        nodeName = "Comentário no Instagram/FB";
        initialConfig = { connectionMode: "any", instanceIds: [], channels: ["instagram", "facebook"], postId: "", keywords: [], ignoreNestedReplies: true, oncePerUserPerPost: true };
      } else if (typeKey === "crm.ensure_lead") {
        nodeType = "actionNode";
        nodeName = "Garantir Lead no CRM";
        initialConfig = { pipelineId: "", stageId: "", tag: "lead-comentario" };
      } else if (typeKey === "meta.send_private_reply") {
        nodeType = "actionNode";
        nodeName = "Enviar DM Privado (Meta)";
        initialConfig = { message: "Olá {{lead_name}}! Vi seu comentário e te mandei os detalhes por aqui." };
      } else if (typeKey === "meta.reply_comment") {
        nodeType = "actionNode";
        nodeName = "Responder Comentário Público";
        initialConfig = {
          message: "Te mandei uma mensagem no direct! 🚀",
          variants: [
            "Te mandei uma mensagem no direct! 🚀",
            "Acabei de te responder por mensagem privada! 📩",
            "Prontinho! Dá uma olhada no seu direct ✨",
          ],
          delaySeconds: 0,
          minDelaySeconds: 5,
          maxDelaySeconds: 25,
        };
      } else if (typeKey === "messaging.send_media") {
        nodeType = "actionNode";
        nodeName = "Enviar Mídia";
        initialConfig = {
          mediaType: "image",
          mediaUrl: "",
          caption: "",
          connectionPolicy: "same_as_trigger",
        };
      } else if (typeKey === "messaging.send_interactive") {
        nodeType = "interactiveNode";
        nodeName = "Menu / Botões";
        initialConfig = {
          bodyText: "Como podemos te ajudar hoje?",
          footerText: "Selecione uma opção",
          options: [
            { id: "opt_1", label: "Falar com Vendas" },
            { id: "opt_2", label: "Tirar Dúvidas" },
          ],
          repromptText: "Por favor, digite o número correspondente a uma das opções.",
          maxRetries: 2,
          timeoutMinutes: 60,
        };
      } else if (typeKey === "messaging.collect_input") {
        nodeType = "collectNode";
        nodeName = "Capturar Informação";
        initialConfig = {
          promptText: "Por favor, digite seu e-mail para continuarmos:",
          validationType: "email",
          targetField: "email",
          invalidMessage: "Formato inválido. Por favor, digite um e-mail válido:",
          maxRetries: 2,
          timeoutMinutes: 60,
        };
      } else if (typeKey === "messaging.send_template") {
        nodeType = "actionNode";
        nodeName = "Modelo WhatsApp (HSM)";
        initialConfig = {
          templateName: "",
          languageCode: "pt_BR",
          bodyParameters: [],
          connectionPolicy: "same_as_trigger",
        };
      }

      const newNode: Node = {
        id: newId,
        type: nodeType,
        position: newPos,
        data: {
          id: newId,
          type: typeKey === "flow.condition" ? "condition.if_else" : typeKey === "crm.move_card_stage" ? "crm.move_card_to_stage" : typeKey,
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

      // P1.E: Interpolação inteligente de nós (Splice).
      // Se já existia uma conexão daquela porta para um nó destino, encadeia newNode -> oldTarget
      // para não romper a continuidade do fluxo e não deixar o nó antigo órfão.
      const existingEdge = edges.find(
        (e) => e.source === sourceId && (e.sourceHandle || "next") === sourcePort
      );

      const hasOutputPort = nodeType !== "endNode" && typeKey !== "messaging.route_to_human" && typeKey !== "telegram.route_to_human";
      let chainedEdge: Edge | null = null;

      if (existingEdge && hasOutputPort) {
        const outHandle =
          nodeType === "conditionNode"
            ? "true"
            : typeKey === "messaging.wait_for_reply"
              ? "reply"
              : typeKey === "messaging.send_interactive"
                ? (initialConfig.options?.[0]?.id || "opt_1")
                : typeKey === "messaging.collect_input"
                  ? "valid"
                  : "next";

        chainedEdge = {
          id: `edge_${newId}_${outHandle}_to_${existingEdge.target}`,
          source: newId,
          sourceHandle: outHandle,
          target: existingEdge.target,
          targetHandle: existingEdge.targetHandle || "input",
          markerEnd: { type: MarkerType.ArrowClosed },
          animated: true,
        };
      }

      setEdges((eds) => {
        const filtered = eds.filter(
          (e) => !(e.source === sourceId && (e.sourceHandle || "next") === sourcePort)
        );
        const nextEds = [...filtered, newEdge];
        if (chainedEdge) {
          nextEds.push(chainedEdge);
        }
        return nextEds;
      });

      setNodes((nds) => [...nds, newNode]);
      setSelectedNodeId(newId);
      setIsDirty(true);
      setQuickPicker(null);

      if (existingEdge && !hasOutputPort) {
        toast.info("Nó terminal adicionado; conexão anterior foi desvinculada.");
      } else if (existingEdge && chainedEdge) {
        toast.success(`Passo "${nodeName}" inserido entre os passos existentes!`);
      } else {
        toast.success(`Passo "${nodeName}" adicionado e conectado!`);
      }
    },
    [nodes, edges, setNodes, setEdges]
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

      if (resWf.graph?.settings) {
        setWorkflowSettings((prev) => ({
          ...prev,
          ...resWf.graph.settings,
        }));
      }

      const flowNodes: Node[] = (resWf.graph?.nodes || []).map((n: any) => {
        let nType = "actionNode";
        if (
          n.type.startsWith("messaging.inbound") ||
          n.type.startsWith("crm.card") ||
          n.type.startsWith("telegram.business_message") ||
          n.type.startsWith("telegram.channel_") ||
          n.type === "meta.comment_received"
        ) nType = "triggerNode";
        else if (n.type.startsWith("condition.")) nType = "conditionNode";
        else if (n.type === "messaging.send_interactive") nType = "interactiveNode";
        else if (n.type === "messaging.collect_input") nType = "collectNode";
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
      if (
        sourceNode.type === "endNode" ||
        sourceNode.data?.type === "messaging.route_to_human" ||
        sourceNode.data?.type === "telegram.route_to_human"
      ) {
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
    if (
      type.startsWith("messaging.inbound") ||
      type.startsWith("crm.card") ||
      type.startsWith("telegram.business_message") ||
      type.startsWith("telegram.channel_") ||
      type === "meta.comment_received"
    ) nType = "triggerNode";
    else if (type.startsWith("condition.")) nType = "conditionNode";
    else if (type === "messaging.send_interactive") nType = "interactiveNode";
    else if (type === "messaging.collect_input") nType = "collectNode";
    else if (type.startsWith("control.wait") || type.startsWith("messaging.wait")) nType = "waitNode";
    else if (type === "control.end") nType = "endNode";

    let initialConfig: Record<string, any> = {};
    if (type === "meta.comment_received") {
      initialConfig = { connectionMode: "any", instanceIds: [], channels: ["instagram", "facebook"], postId: "", keywords: [], ignoreNestedReplies: true, oncePerUserPerPost: true };
    } else if (type === "crm.ensure_lead") {
      initialConfig = { pipelineId: "", stageId: "", tag: "lead-comentario" };
    } else if (type === "meta.send_private_reply") {
      initialConfig = { message: "Olá {{lead_name}}! Vi seu comentário e te mandei os detalhes por aqui." };
    } else if (type === "meta.reply_comment") {
      initialConfig = {
        message: "Te mandei uma mensagem no direct! 🚀",
        variants: [
          "Te mandei uma mensagem no direct! 🚀",
          "Acabei de te responder por mensagem privada! 📩",
          "Prontinho! Dá uma olhada no seu direct ✨",
        ],
        delaySeconds: 0,
        minDelaySeconds: 5,
        maxDelaySeconds: 25,
      };
    } else if (type === "messaging.send_media") {
      initialConfig = {
        mediaType: "image",
        mediaUrl: "",
        caption: "",
        connectionPolicy: "same_as_trigger",
      };
    } else if (type === "messaging.send_interactive") {
      initialConfig = {
        bodyText: "Como podemos te ajudar hoje?",
        footerText: "Selecione uma opção",
        options: [
          { id: "opt_1", label: "Falar com Vendas" },
          { id: "opt_2", label: "Tirar Dúvidas" },
        ],
        repromptText: "Por favor, digite o número correspondente a uma das opções.",
        maxRetries: 2,
        timeoutMinutes: 60,
      };
    } else if (type === "messaging.collect_input") {
      initialConfig = {
        promptText: "Por favor, digite seu e-mail para continuarmos:",
        validationType: "email",
        targetField: "email",
        invalidMessage: "Formato inválido. Por favor, digite um e-mail válido:",
        maxRetries: 2,
        timeoutMinutes: 60,
      };
    } else if (type === "messaging.send_template") {
      initialConfig = {
        templateName: "",
        languageCode: "pt_BR",
        bodyParameters: [],
        connectionPolicy: "same_as_trigger",
      };
    }

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
        config: initialConfig,
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
        ...workflowSettings,
        ui_mode: "canvas" as const,
      },
    };
  }

  async function handleSaveDraft() {
    setSaving(true);
    try {
      const graph = buildCurrentGraph();
      const res = await saveDraft({ data: { workflowId, graph, switchUiModeToCanvas: true } });
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

  async function handleDuplicate() {
    setDuplicating(true);
    try {
      const res = await duplicateWf({ data: { workflowId } });
      toast.success("Fluxo duplicado com sucesso!");
      navigate({
        to: "/app/automacoes/$workflowId",
        params: { workflowId: res.workflowId },
      });
    } catch (e: any) {
      toast.error(e?.message || "Erro ao duplicar fluxo");
    } finally {
      setDuplicating(false);
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
            variant="ghost"
            size="sm"
            onClick={() => setSettingsOpen(true)}
            className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            title="Configurações Gerais do Fluxo"
          >
            <Settings className="size-3.5" />
            Configurações
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleDuplicate}
            disabled={duplicating || saving || publishing}
            className="gap-1.5 text-xs"
            title="Duplicar fluxo"
          >
            {duplicating ? <Loader2 className="size-3.5 animate-spin" /> : <Copy className="size-3.5" />}
            Duplicar
          </Button>

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
                  onClick={() => addNodeFromPalette("meta.comment_received", "Comentário no Instagram/FB")}
                  className="w-full justify-start text-xs gap-2 border-fuchsia-500/30 text-fuchsia-700 hover:bg-fuchsia-50 dark:hover:bg-fuchsia-950"
                >
                  <MessageSquareQuote className="size-3.5 text-fuchsia-600" /> Comentário Instagram/FB
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
                  onClick={() => addNodeFromPalette("messaging.send_media", "Enviar Mídia")}
                  className="w-full justify-start text-xs gap-2 border-emerald-500/30 text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950"
                >
                  <Image className="size-3.5" /> Enviar Mídia (Foto/Doc)
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => addNodeFromPalette("messaging.send_interactive", "Menu / Botões")}
                  className="w-full justify-start text-xs gap-2 border-indigo-500/30 text-indigo-700 hover:bg-indigo-50 dark:hover:bg-indigo-950"
                >
                  <ListChecks className="size-3.5" /> Menu / Botões Interativos
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => addNodeFromPalette("messaging.collect_input", "Capturar Informação")}
                  className="w-full justify-start text-xs gap-2 border-teal-500/30 text-teal-700 hover:bg-teal-50 dark:hover:bg-teal-950"
                >
                  <FormInput className="size-3.5" /> Capturar Dado no CRM
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => addNodeFromPalette("messaging.send_template", "Modelo WhatsApp (HSM)")}
                  className="w-full justify-start text-xs gap-2 border-emerald-500/30 text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950"
                >
                  <FileCheck2 className="size-3.5" /> Modelo WhatsApp (HSM)
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
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => addNodeFromPalette("meta.send_private_reply", "Enviar DM Privado (Meta)")}
                  className="w-full justify-start text-xs gap-2 border-fuchsia-500/30 text-fuchsia-700 hover:bg-fuchsia-50 dark:hover:bg-fuchsia-950"
                >
                  <Send className="size-3.5 text-fuchsia-600" /> Enviar DM Privado (Meta)
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => addNodeFromPalette("meta.reply_comment", "Responder Comentário Público")}
                  className="w-full justify-start text-xs gap-2 border-pink-500/30 text-pink-700 hover:bg-pink-50 dark:hover:bg-pink-950"
                >
                  <MessageSquareQuote className="size-3.5 text-pink-600" /> Responder Comentário (Meta)
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
                  onClick={() => addNodeFromPalette("crm.ensure_lead", "Garantir Lead no CRM")}
                  className="w-full justify-start text-xs gap-2 border-indigo-500/30 text-indigo-700 hover:bg-indigo-50 dark:hover:bg-indigo-950"
                >
                  <UserPlus className="size-3.5 text-indigo-600" /> Garantir Lead no CRM
                </Button>
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
              <h4 className="font-semibold text-sky-600 dark:text-sky-400 uppercase text-[10px] tracking-wider mb-2 flex items-center gap-1.5">
                <Send className="size-3" /> Telegram Oficial
              </h4>
              <div className="space-y-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => addNodeFromPalette("telegram.business_message_received", "Telegram: Mensagem Recebida")}
                  className="w-full justify-start text-xs gap-2 border-sky-500/30 text-sky-700 hover:bg-sky-50 dark:hover:bg-sky-950 dark:text-sky-300"
                >
                  <Send className="size-3.5" /> Telegram Business (Gatilho)
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => addNodeFromPalette("telegram.channel_post_published", "Telegram: Post em Canal")}
                  className="w-full justify-start text-xs gap-2 border-sky-500/30 text-sky-700 hover:bg-sky-50 dark:hover:bg-sky-950 dark:text-sky-300"
                >
                  <Radio className="size-3.5" /> Post em Canal (Gatilho)
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => addNodeFromPalette("telegram.channel_comment_received", "Telegram: Comentário em Canal")}
                  className="w-full justify-start text-xs gap-2 border-sky-500/30 text-sky-700 hover:bg-sky-50 dark:hover:bg-sky-950 dark:text-sky-300"
                >
                  <MessageCircle className="size-3.5" /> Comentário Canal (Gatilho)
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => addNodeFromPalette("telegram.send_business_reply", "Telegram: Responder em Business")}
                  className="w-full justify-start text-xs gap-2 border-sky-500/30 text-sky-700 hover:bg-sky-50 dark:hover:bg-sky-950 dark:text-sky-300"
                >
                  <Send className="size-3.5" /> Responder Business
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => addNodeFromPalette("telegram.publish_to_channel", "Telegram: Publicar no Canal")}
                  className="w-full justify-start text-xs gap-2 border-sky-500/30 text-sky-700 hover:bg-sky-50 dark:hover:bg-sky-950 dark:text-sky-300"
                >
                  <Share2 className="size-3.5" /> Publicar no Canal
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => addNodeFromPalette("telegram.route_to_human", "Telegram: Derivar a Atendente")}
                  className="w-full justify-start text-xs gap-2 border-rose-500/30 text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950 dark:text-rose-300"
                >
                  <UserCheck className="size-3.5" /> Derivar para Atendente
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
                        placeholder="Digite a mensagem... use {{contact.nome}} ou {{card.titulo}}"
                        value={((selectedNode.data.config as any)?.text as string) || ""}
                        onChange={(e) => updateNodeConfig(selectedNode.id, "text", e.target.value)}
                      />
                      <VariableChips
                        onInsert={(v: string) => {
                          const cur = ((selectedNode.data.config as any)?.text as string) || "";
                          updateNodeConfig(selectedNode.id, "text", cur + (cur ? " " : "") + v);
                        }}
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

                {/* telegram.business_message_received (Trigger) */}
                {selectedNode.data.type === "telegram.business_message_received" && (
                  <>
                    <div className="space-y-1.5">
                      <Label>Modo de Conexão Telegram</Label>
                      <Select
                        value={((selectedNode.data.config as any)?.connectionMode as string) || "any"}
                        onValueChange={(val) => updateNodeConfig(selectedNode.id, "connectionMode", val)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="any">Qualquer conexão Telegram da empresa</SelectItem>
                          <SelectItem value="selected">Conexão Telegram específica</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {((selectedNode.data.config as any)?.connectionMode === "selected") && (
                      <div className="space-y-1.5">
                        <Label>Linha Telegram Business *</Label>
                        <Select
                          value={((selectedNode.data.config as any)?.instanceIds?.[0] as string) || ""}
                          onValueChange={(val) => updateNodeConfig(selectedNode.id, "instanceIds", val ? [val] : [])}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione a linha Telegram..." />
                          </SelectTrigger>
                          <SelectContent>
                            {auxData.instances.filter((i) => i.provider?.toLowerCase().includes("telegram")).map((inst) => (
                              <SelectItem key={inst.id} value={inst.id}>
                                {inst.display_name || inst.instance_name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

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
                          <SelectItem value="direct">Apenas conversas diretas (1 a 1)</SelectItem>
                          <SelectItem value="group">Apenas grupos / supergrupos</SelectItem>
                          <SelectItem value="all">Todas as conversas</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <Label>Palavras-chave (opcional, separadas por vírgula)</Label>
                      <Input
                        placeholder="Ex: orcamento, comprar, suporte, catalogo"
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

                {/* telegram.channel_post_published (Trigger) */}
                {selectedNode.data.type === "telegram.channel_post_published" && (
                  <>
                    <div className="space-y-1.5">
                      <Label>Identificador do Canal (opcional)</Label>
                      <Input
                        placeholder="Ex: -1002244668899 ou em branco para qualquer canal"
                        value={((selectedNode.data.config as any)?.channelId as string) || ""}
                        onChange={(e) => updateNodeConfig(selectedNode.id, "channelId", e.target.value || null)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Formato do Post</Label>
                      <Select
                        value={((selectedNode.data.config as any)?.postFormat as string) || "all"}
                        onValueChange={(val) => updateNodeConfig(selectedNode.id, "postFormat", val)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todos os formatos (Texto, Fotos, Vídeos, Álbuns)</SelectItem>
                          <SelectItem value="photo">Apenas Fotos</SelectItem>
                          <SelectItem value="video">Apenas Vídeos</SelectItem>
                          <SelectItem value="text">Apenas Mensagens de Texto</SelectItem>
                          <SelectItem value="carousel">Apenas Carrosséis / Álbuns</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                )}

                {/* telegram.channel_comment_received (Trigger) */}
                {selectedNode.data.type === "telegram.channel_comment_received" && (
                  <>
                    <div className="space-y-1.5">
                      <Label>Identificador do Canal (opcional)</Label>
                      <Input
                        placeholder="Ex: -1002244668899 ou em branco para todos"
                        value={((selectedNode.data.config as any)?.channelId as string) || ""}
                        onChange={(e) => updateNodeConfig(selectedNode.id, "channelId", e.target.value || null)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Filtrar Palavras-chave no Comentário (opcional)</Label>
                      <Input
                        placeholder="Ex: valor, comprar, quero, preco"
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

                {/* telegram.send_business_reply (Action) */}
                {selectedNode.data.type === "telegram.send_business_reply" && (
                  <div className="space-y-1.5">
                    <Label>Texto da Resposta Oficial *</Label>
                    <Textarea
                      rows={4}
                      placeholder="Olá {{contact.name}}! Como podemos te ajudar hoje?"
                      value={((selectedNode.data.config as any)?.text as string) || ""}
                      onChange={(e) => updateNodeConfig(selectedNode.id, "text", e.target.value)}
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Suporta variáveis dinâmicas como {'{{contact.name}}'}, {'{{card.nome}}'} e {'{{trigger.text}}'}.
                    </p>
                  </div>
                )}

                {/* telegram.publish_to_channel (Action) */}
                {selectedNode.data.type === "telegram.publish_to_channel" && (
                  <>
                    <div className="space-y-1.5">
                      <Label>Canal de Destino (opcional)</Label>
                      <Input
                        placeholder="Em branco para usar o canal oficial da empresa"
                        value={((selectedNode.data.config as any)?.channelId as string) || ""}
                        onChange={(e) => updateNodeConfig(selectedNode.id, "channelId", e.target.value || null)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Conteúdo da Publicação *</Label>
                      <Textarea
                        rows={4}
                        placeholder="Escreva o texto ou comunicado para o canal..."
                        value={((selectedNode.data.config as any)?.text as string) || ""}
                        onChange={(e) => updateNodeConfig(selectedNode.id, "text", e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Tipo de Mídia</Label>
                      <Select
                        value={((selectedNode.data.config as any)?.mediaType as string) || "text"}
                        onValueChange={(val) => updateNodeConfig(selectedNode.id, "mediaType", val)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="text">Apenas Texto</SelectItem>
                          <SelectItem value="photo">Foto com Legenda</SelectItem>
                          <SelectItem value="video">Vídeo com Legenda</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {((selectedNode.data.config as any)?.mediaType !== "text") && (
                      <div className="space-y-1.5">
                        <Label>URL da Mídia (R2 ou pública)</Label>
                        <Input
                          placeholder="https://..."
                          value={((selectedNode.data.config as any)?.mediaUrl as string) || ""}
                          onChange={(e) => updateNodeConfig(selectedNode.id, "mediaUrl", e.target.value || null)}
                        />
                      </div>
                    )}
                    <label className="flex items-center gap-2 cursor-pointer text-xs pt-1">
                      <input
                        type="checkbox"
                        className="rounded border-gray-300 text-primary"
                        checked={Boolean((selectedNode.data.config as any)?.pinMessage)}
                        onChange={(e) => updateNodeConfig(selectedNode.id, "pinMessage", e.target.checked)}
                      />
                      <span>Fixar mensagem no topo do canal (Pin)</span>
                    </label>
                  </>
                )}

                {/* telegram.route_to_human (Terminal Handoff) */}
                {selectedNode.data.type === "telegram.route_to_human" && (
                  <div className="space-y-1.5">
                    <Label>Motivo da Derivação Humana</Label>
                    <Input
                      placeholder="Ex: Cliente solicitou atendente no Telegram"
                      value={((selectedNode.data.config as any)?.reason as string) || "Solicitação de atendimento humano via Telegram"}
                      onChange={(e) => updateNodeConfig(selectedNode.id, "reason", e.target.value)}
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Pausa o bot e agentes de IA no Telegram e encaminha o atendimento. Este nó é terminal e encerra o fluxo automaticamente.
                    </p>
                  </div>
                )}

                {/* meta.comment_received (Trigger) */}
                {selectedNode.data.type === "meta.comment_received" && (
                  <div className="space-y-4">
                    <div className="p-3 bg-fuchsia-500/10 border border-fuchsia-200 rounded-xl text-xs text-fuchsia-900 space-y-1">
                      <p className="font-semibold flex items-center gap-1.5">
                        <MessageSquareQuote className="size-4 text-fuchsia-600" />
                        Comentário no Instagram / Facebook
                      </p>
                      <p className="text-[11px] text-fuchsia-800 leading-relaxed">
                        Dispara quando um usuário comenta em uma publicação ou reel oficial da página conectada.
                      </p>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs">Conta do Instagram / Facebook</Label>
                      <Select
                        value={
                          ((selectedNode.data.config as any)?.instanceIds?.[0] as string) ||
                          ((selectedNode.data.config as any)?.instanceId as string) ||
                          "all"
                        }
                        onValueChange={(val) => {
                          const instId = val === "all" ? undefined : val;
                          const inst = (auxData.instances || []).find((i: any) => i.id === instId);
                          const isIg = inst?.provider === "meta_instagram" || inst?.provider === "instagram";
                          const isFb = inst?.provider === "meta_messenger" || inst?.provider === "facebook";
                          const chs = isIg ? ["instagram"] : isFb ? ["facebook"] : ["instagram", "facebook"];
                          updateNodeConfig(selectedNode.id, "instanceId", instId);
                          updateNodeConfig(selectedNode.id, "connectionMode", instId ? "selected" : "any");
                          updateNodeConfig(selectedNode.id, "instanceIds", instId ? [instId] : []);
                          updateNodeConfig(selectedNode.id, "channels", chs);
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Qualquer conta de Meta" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todas as contas Meta conectadas</SelectItem>
                          {(auxData.instances || [])
                            .filter((i: any) => {
                              const p = String(i.provider || "").toLowerCase();
                              return p.includes("meta") || p.includes("instagram") || p.includes("messenger");
                            })
                            .map((inst: any) => (
                              <SelectItem key={inst.id} value={inst.id}>
                                {inst.display_name || inst.instance_name} ({inst.provider})
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs">Publicação ou Reel Específico (opcional)</Label>
                        {Boolean((selectedNode.data.config as any)?.postId) && (
                          <button
                            type="button"
                            onClick={() => updateNodeConfig(selectedNode.id, "postId", undefined)}
                            className="text-[10px] text-primary hover:underline"
                          >
                            Limpar (Qualquer post)
                          </button>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <Input
                          placeholder="Deixe em branco para qualquer post ou selecione abaixo"
                          value={((selectedNode.data.config as any)?.postId as string) || ""}
                          onChange={(e) => updateNodeConfig(selectedNode.id, "postId", e.target.value.trim() || undefined)}
                          className="text-xs"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={loadingMetaPosts}
                          onClick={async () => {
                            const instId =
                              ((selectedNode.data.config as any)?.instanceIds?.[0] as string) ||
                              ((selectedNode.data.config as any)?.instanceId as string) ||
                              auxData.instances.find((i: any) => {
                                const p = String(i.provider || "").toLowerCase();
                                return p.includes("meta") || p.includes("instagram") || p.includes("messenger");
                              })?.id;

                            if (!instId) {
                              toast.error("Selecione uma conta Meta conectada para listar publicações.");
                              return;
                            }
                            setLoadingMetaPosts(true);
                            try {
                              const res = await listMetaPosts({ data: { instanceId: instId, limit: 12 } });
                              setMetaPostsList(res.posts || []);
                              if (!res.posts?.length) {
                                toast.info("Nenhuma publicação encontrada nesta conta ou falta permissão.");
                              } else {
                                toast.success(`${res.posts.length} publicações carregadas!`);
                              }
                            } catch (err: any) {
                              toast.error(err?.message || "Erro ao buscar publicações da Meta.");
                            } finally {
                              setLoadingMetaPosts(false);
                            }
                          }}
                          className="shrink-0 text-xs gap-1"
                        >
                          {loadingMetaPosts ? <Loader2 className="size-3.5 animate-spin" /> : <Image className="size-3.5" />}
                          <span>Buscar Posts</span>
                        </Button>
                      </div>

                      {/* Grade de Posts Recentes */}
                      {metaPostsList.length > 0 && (
                        <div className="border rounded-xl p-2 bg-muted/20 space-y-2">
                          <span className="text-[10px] font-semibold text-muted-foreground block">
                            Selecione o post ou reel desejado:
                          </span>
                          <div className="grid grid-cols-3 gap-2 max-h-48 overflow-y-auto pr-1">
                            {metaPostsList.map((post) => {
                              const isSelected = (selectedNode.data.config as any)?.postId === post.id;
                              return (
                                <button
                                  key={post.id}
                                  type="button"
                                  onClick={() => updateNodeConfig(selectedNode.id, "postId", post.id)}
                                  className={`group relative rounded-lg overflow-hidden border text-left p-1 transition-all ${
                                    isSelected
                                      ? "ring-2 ring-primary border-primary bg-primary/10"
                                      : "hover:border-primary/50 bg-card"
                                  }`}
                                >
                                  {post.thumbnailUrl ? (
                                    <img
                                      src={post.thumbnailUrl}
                                      alt="Post thumbnail"
                                      className="w-full h-14 object-cover rounded"
                                    />
                                  ) : (
                                    <div className="w-full h-14 bg-muted flex items-center justify-center rounded">
                                      <Image className="size-5 text-muted-foreground" />
                                    </div>
                                  )}
                                  <p className="text-[9px] line-clamp-2 mt-1 font-medium text-foreground leading-tight">
                                    {post.caption || "(Sem legenda)"}
                                  </p>
                                  {isSelected && (
                                    <span className="absolute top-1 right-1 bg-primary text-white rounded-full p-0.5">
                                      <Check className="size-2.5" />
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      <p className="text-[10px] text-muted-foreground">
                        Se em branco, dispara para comentários em qualquer publicação.
                      </p>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs">Palavras-chave Disparadoras (opcional)</Label>
                      <Input
                        placeholder="Ex: preço, valor, link, quero (separadas por vírgula)"
                        value={(((selectedNode.data.config as any)?.keywords as string[]) || []).join(", ")}
                        onChange={(e) => {
                          const arr = e.target.value.split(",").map((s) => s.trim()).filter(Boolean);
                          updateNodeConfig(selectedNode.id, "keywords", arr);
                        }}
                      />
                      <p className="text-[10px] text-muted-foreground">
                        Deixe em branco para disparar com qualquer texto de comentário.
                      </p>
                    </div>

                    <div className="pt-2 border-t space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label className="text-xs">Ignorar Respostas Aninhadas</Label>
                          <p className="text-[10px] text-muted-foreground">
                            Não dispara quando alguém responde a outro comentário secundário.
                          </p>
                        </div>
                        <Switch
                          checked={((selectedNode.data.config as any)?.ignoreNestedReplies ?? true)}
                          onCheckedChange={(checked) => updateNodeConfig(selectedNode.id, "ignoreNestedReplies", checked)}
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label className="text-xs">Disparar apenas 1x por usuário por post</Label>
                          <p className="text-[10px] text-muted-foreground">
                            Aplica cooldown anti-spam por usuário/publicação.
                          </p>
                        </div>
                        <Switch
                          checked={((selectedNode.data.config as any)?.oncePerUserPerPost ?? true)}
                          onCheckedChange={(checked) => updateNodeConfig(selectedNode.id, "oncePerUserPerPost", checked)}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* crm.ensure_lead (Action) */}
                {selectedNode.data.type === "crm.ensure_lead" && (
                  <div className="space-y-4">
                    <div className="p-3 bg-indigo-500/10 border border-indigo-200 rounded-xl text-xs text-indigo-900 space-y-1">
                      <p className="font-semibold flex items-center gap-1.5">
                        <UserPlus className="size-4 text-indigo-600" />
                        Garantir Lead no CRM
                      </p>
                      <p className="text-[11px] text-indigo-800 leading-relaxed">
                        Cria ou vincula o lead no CRM de forma idempotente usando o identificador Meta (IGSID/PSID) antes de enviar mensagens privadas.
                      </p>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs">Funil de Vendas</Label>
                      <Select
                        value={((selectedNode.data.config as any)?.pipelineId as string) || ""}
                        onValueChange={(val) => {
                          updateNodeConfig(selectedNode.id, "pipelineId", val);
                          updateNodeConfig(selectedNode.id, "stageId", undefined);
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o funil" />
                        </SelectTrigger>
                        <SelectContent>
                          {(auxData.pipelines || []).map((pipe: any) => (
                            <SelectItem key={pipe.id} value={pipe.id}>
                              {pipe.nome}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs">Etapa de Entrada</Label>
                      <Select
                        value={((selectedNode.data.config as any)?.stageId as string) || ""}
                        onValueChange={(val) => updateNodeConfig(selectedNode.id, "stageId", val)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione a etapa" />
                        </SelectTrigger>
                        <SelectContent>
                          {(auxData.stages || [])
                            .filter((s: any) => !(selectedNode.data.config as any)?.pipelineId || s.pipeline_id === (selectedNode.data.config as any)?.pipelineId)
                            .map((stage: any) => (
                              <SelectItem key={stage.id} value={stage.id}>
                                {stage.nome}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs">Etiqueta do Lead (opcional)</Label>
                      <Input
                        placeholder="Ex: lead-comentario, promo-instagram"
                        value={((selectedNode.data.config as any)?.tag as string) || ""}
                        onChange={(e) => updateNodeConfig(selectedNode.id, "tag", e.target.value.trim() || undefined)}
                      />
                    </div>
                  </div>
                )}

                {/* meta.send_private_reply (Action) */}
                {selectedNode.data.type === "meta.send_private_reply" && (
                  <div className="space-y-4">
                    <div className="p-3 bg-fuchsia-500/10 border border-fuchsia-200 rounded-xl text-xs text-fuchsia-900 space-y-1">
                      <p className="font-semibold flex items-center gap-1.5">
                        <Send className="size-4 text-fuchsia-600" />
                        Resposta Privada Oficial (Meta Private Reply)
                      </p>
                      <p className="text-[11px] text-fuchsia-800 leading-relaxed">
                        Envia mensagem direta (DM no Instagram ou Messenger no Facebook) respondendo ao comentário. Captura o <code>recipient_id</code> e unifica a conversa em /app/conversas.
                      </p>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs">Mensagem Privada a Enviar *</Label>
                      <Textarea
                        rows={4}
                        placeholder="Ex: Olá {{lead_name}}! Vi seu comentário e te mandei os detalhes por aqui..."
                        value={((selectedNode.data.config as any)?.message as string) || ""}
                        onChange={(e) => updateNodeConfig(selectedNode.id, "message", e.target.value)}
                      />
                      <div className="flex items-center gap-1.5 flex-wrap pt-1 text-[11px] text-muted-foreground">
                        <span>Variáveis dinâmicas:</span>
                        <button
                          type="button"
                          onClick={() => {
                            const cur = ((selectedNode.data.config as any)?.message as string) || "";
                            updateNodeConfig(selectedNode.id, "message", `${cur}{{lead_name}}`);
                          }}
                          className="px-1.5 py-0.5 rounded bg-muted hover:bg-muted/80 text-[10px] font-mono"
                        >
                          {"{{lead_name}}"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const cur = ((selectedNode.data.config as any)?.message as string) || "";
                            updateNodeConfig(selectedNode.id, "message", `${cur}{{sender_id}}`);
                          }}
                          className="px-1.5 py-0.5 rounded bg-muted hover:bg-muted/80 text-[10px] font-mono"
                        >
                          {"{{sender_id}}"}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* meta.reply_comment (Action) */}
                {selectedNode.data.type === "meta.reply_comment" && (
                  <div className="space-y-4">
                    <div className="p-3 bg-pink-500/10 border border-pink-200 rounded-xl text-xs text-pink-900 space-y-1">
                      <p className="font-semibold flex items-center gap-1.5">
                        <MessageSquareQuote className="size-4 text-pink-600" />
                        Responder Comentário Público
                      </p>
                      <p className="text-[11px] text-pink-800 leading-relaxed">
                        Publica resposta pública no Instagram/Facebook. Suporta rotação aleatória de variantes para evitar bloqueios de spam e retardo não bloqueante em <code>automation_jobs</code>.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs">Variações de Resposta Pública</Label>
                        <span className="text-[10px] text-muted-foreground">Rotação aleatória</span>
                      </div>

                      <div className="space-y-1.5">
                        {((((selectedNode.data.config as any)?.variants as string[]) || []).map((variant, vIdx) => (
                          <div key={vIdx} className="flex items-center gap-1.5">
                            <Input
                              value={variant}
                              onChange={(e) => {
                                const updated = [...(((selectedNode.data.config as any)?.variants as string[]) || [])];
                                updated[vIdx] = e.target.value;
                                updateNodeConfig(selectedNode.id, "variants", updated);
                                updateNodeConfig(selectedNode.id, "message", updated[0] || "");
                              }}
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                const updated = (((selectedNode.data.config as any)?.variants as string[]) || []).filter(
                                  (_, i) => i !== vIdx
                                );
                                updateNodeConfig(selectedNode.id, "variants", updated);
                                updateNodeConfig(selectedNode.id, "message", updated[0] || "");
                              }}
                              className="size-8 text-muted-foreground hover:text-destructive shrink-0"
                            >
                              <X className="size-4" />
                            </Button>
                          </div>
                        )))}
                      </div>

                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const current = (((selectedNode.data.config as any)?.variants as string[]) || []);
                          const updated = [...current, "Te mandei uma mensagem no direct! 🚀"];
                          updateNodeConfig(selectedNode.id, "variants", updated);
                          updateNodeConfig(selectedNode.id, "message", updated[0] || "");
                        }}
                        className="w-full text-xs gap-1 mt-1"
                      >
                        <Plus className="size-3.5" /> Adicionar Variação de Texto
                      </Button>
                    </div>

                    <div className="p-3 bg-muted/50 rounded-xl space-y-2 border">
                      <Label className="text-xs font-semibold flex items-center gap-1.5">
                        <Clock className="size-3.5 text-purple-600" />
                        Retardo Humano Diferido (Jitter não bloqueante)
                      </Label>
                      <p className="text-[10px] text-muted-foreground">
                        Intervalo em segundos que a fila aguarda entre o DM e a resposta pública para simular digitação real.
                      </p>
                      <div className="grid grid-cols-2 gap-3 pt-1">
                        <div className="space-y-1">
                          <Label className="text-[11px]">Mínimo (seg)</Label>
                          <Input
                            type="number"
                            min={1}
                            max={60}
                            value={(selectedNode.data.config as any)?.minDelaySeconds ?? 5}
                            onChange={(e) => updateNodeConfig(selectedNode.id, "minDelaySeconds", Number(e.target.value))}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[11px]">Máximo (seg)</Label>
                          <Input
                            type="number"
                            min={1}
                            max={120}
                            value={(selectedNode.data.config as any)?.maxDelaySeconds ?? 25}
                            onChange={(e) => updateNodeConfig(selectedNode.id, "maxDelaySeconds", Number(e.target.value))}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* messaging.send_media (Action) */}
                {selectedNode.data.type === "messaging.send_media" && (
                  <div className="space-y-4">
                    <div className="p-3 bg-emerald-500/10 border border-emerald-200 rounded-xl text-xs text-emerald-900 space-y-1">
                      <p className="font-semibold flex items-center gap-1.5">
                        <Image className="size-4 text-emerald-600" />
                        Envio de Mídia Rica (WhatsApp / D-API / Meta)
                      </p>
                      <p className="text-[11px] text-emerald-800 leading-relaxed">
                        Envia imagens, vídeos, áudios PTT ou documentos anexos. Suporta upload direto para Cloudflare R2 ou URL externa.
                      </p>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs">Tipo de Mídia</Label>
                      <Select
                        value={((selectedNode.data.config as any)?.mediaType as string) || "image"}
                        onValueChange={(val) => updateNodeConfig(selectedNode.id, "mediaType", val)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="image">Imagem (JPEG / PNG / WEBP)</SelectItem>
                          <SelectItem value="video">Vídeo (MP4)</SelectItem>
                          <SelectItem value="audio">Áudio (Mensagem de Voz / OGG)</SelectItem>
                          <SelectItem value="document">Documento (PDF / Arquivo)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs">Arquivo de Mídia</Label>
                      <div className="flex items-center gap-2">
                        <Input
                          placeholder="https://... ou faça upload"
                          value={((selectedNode.data.config as any)?.mediaUrl as string) || ""}
                          onChange={(e) => updateNodeConfig(selectedNode.id, "mediaUrl", e.target.value.trim())}
                          className="text-xs"
                        />
                        <label className="cursor-pointer">
                          <input
                            type="file"
                            className="hidden"
                            disabled={uploadingMedia}
                            accept={
                              (selectedNode.data.config as any)?.mediaType === "image"
                                ? "image/*"
                                : (selectedNode.data.config as any)?.mediaType === "video"
                                  ? "video/*"
                                  : (selectedNode.data.config as any)?.mediaType === "audio"
                                    ? "audio/*"
                                    : "*/*"
                            }
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              if (file.size > 15 * 1024 * 1024) {
                                toast.error("O arquivo excede o limite máximo de 15 MB.");
                                return;
                              }
                              setUploadingMedia(true);
                              try {
                                const reader = new FileReader();
                                reader.onload = async () => {
                                  try {
                                    const base64 = (reader.result as string)?.split(",")?.[1] || "";
                                    const res = await uploadMedia({
                                      data: {
                                        fileName: file.name,
                                        base64,
                                        mimeType: file.type || "application/octet-stream",
                                      },
                                    });
                                    updateNodeConfig(selectedNode.id, "mediaUrl", res.url);
                                    if (file.name) {
                                      updateNodeConfig(selectedNode.id, "fileName", file.name);
                                    }
                                    toast.success("Arquivo enviado com sucesso para o R2!");
                                  } catch (err: any) {
                                    toast.error(err?.message || "Erro no upload do arquivo.");
                                  } finally {
                                    setUploadingMedia(false);
                                  }
                                };
                                reader.readAsDataURL(file);
                              } catch (err: any) {
                                setUploadingMedia(false);
                                toast.error("Falha ao ler arquivo local.");
                              }
                            }}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            asChild
                            disabled={uploadingMedia}
                            className="text-xs gap-1.5 shrink-0"
                          >
                            <span>
                              {uploadingMedia ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
                              Upload
                            </span>
                          </Button>
                        </label>
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        Tamanho máximo: 15MB. Os arquivos são armazenados no bucket seguro do Capiversa.
                      </p>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs">Legenda da Mensagem (Opcional)</Label>
                      <Textarea
                        rows={3}
                        placeholder="Digite a legenda opcional..."
                        value={((selectedNode.data.config as any)?.caption as string) || ""}
                        onChange={(e) => updateNodeConfig(selectedNode.id, "caption", e.target.value)}
                      />
                      <VariableChips
                        onInsert={(v: string) => {
                          const cur = ((selectedNode.data.config as any)?.caption as string) || "";
                          updateNodeConfig(selectedNode.id, "caption", cur + (cur ? " " : "") + v);
                        }}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs">Política de Conexão</Label>
                      <Select
                        value={((selectedNode.data.config as any)?.connectionPolicy as string) || "same_as_trigger"}
                        onValueChange={(val) => updateNodeConfig(selectedNode.id, "connectionPolicy", val)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="same_as_trigger">Mesma linha/conexão do gatilho</SelectItem>
                          <SelectItem value="specific">Linha específica</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}

                {/* messaging.send_interactive (Action / Branching) */}
                {selectedNode.data.type === "messaging.send_interactive" && (
                  <div className="space-y-4">
                    <div className="p-3 bg-indigo-500/10 border border-indigo-200 rounded-xl text-xs text-indigo-900 space-y-1">
                      <p className="font-semibold flex items-center gap-1.5">
                        <ListChecks className="size-4 text-indigo-600" />
                        Menu Interativo & Botões (Kommo / ManyChat)
                      </p>
                      <p className="text-[11px] text-indigo-800 leading-relaxed">
                        Apresenta opções em botões nativos (quando suportado) ou menu numerado humanizado. Cada opção cria um ramo de saída independente no Canvas.
                      </p>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs">Texto Principal / Pergunta *</Label>
                      <Textarea
                        rows={3}
                        placeholder="Ex: Olá! Como posso te ajudar hoje?"
                        value={((selectedNode.data.config as any)?.bodyText as string) || ""}
                        onChange={(e) => updateNodeConfig(selectedNode.id, "bodyText", e.target.value)}
                      />
                      <VariableChips
                        onInsert={(v: string) => {
                          const cur = ((selectedNode.data.config as any)?.bodyText as string) || "";
                          updateNodeConfig(selectedNode.id, "bodyText", cur + (cur ? " " : "") + v);
                        }}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs">Rodapé (Opcional)</Label>
                      <Input
                        placeholder="Ex: Digite o número ou toque no botão"
                        value={((selectedNode.data.config as any)?.footerText as string) || ""}
                        onChange={(e) => updateNodeConfig(selectedNode.id, "footerText", e.target.value)}
                      />
                    </div>

                    <div className="space-y-2 pt-2 border-t">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-semibold">Opções de Resposta (1 a 5)</Label>
                        <span className="text-[10px] text-muted-foreground">
                          {(((selectedNode.data.config as any)?.options as any[]) || []).length} de 5
                        </span>
                      </div>

                      <div className="space-y-2">
                        {((((selectedNode.data.config as any)?.options as any[]) || []).map((opt: any, idx: number) => (
                          <div key={opt.id || idx} className="flex items-center gap-2 bg-muted/40 p-2 rounded-lg border">
                            <span className="size-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px] font-bold shrink-0">
                              {idx + 1}
                            </span>
                            <Input
                              value={opt.label || ""}
                              placeholder={`Título da Opção ${idx + 1}`}
                              onChange={(e) => {
                                const opts = [...(((selectedNode.data.config as any)?.options as any[]) || [])];
                                opts[idx] = { ...opts[idx], label: e.target.value };
                                updateNodeConfig(selectedNode.id, "options", opts);
                              }}
                              className="text-xs h-8"
                            />
                            {(((selectedNode.data.config as any)?.options as any[]) || []).length > 1 && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  const opts = (((selectedNode.data.config as any)?.options as any[]) || []).filter(
                                    (_, i) => i !== idx
                                  );
                                  updateNodeConfig(selectedNode.id, "options", opts);
                                  // Remove edges conectadas a esta opção deletada
                                  setEdges((eds) => eds.filter((ed) => !(ed.source === selectedNode.id && ed.sourceHandle === opt.id)));
                                }}
                                className="size-8 text-muted-foreground hover:text-destructive shrink-0"
                              >
                                <X className="size-3.5" />
                              </Button>
                            )}
                          </div>
                        )))}
                      </div>

                      {((((selectedNode.data.config as any)?.options as any[]) || []).length < 5) && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const cur = [ ...(((selectedNode.data.config as any)?.options as any[]) || []) ];
                            const nextNum = cur.length + 1;
                            cur.push({ id: `opt_${nextNum}_${crypto.randomUUID().slice(0, 4)}`, label: `Opção ${nextNum}` });
                            updateNodeConfig(selectedNode.id, "options", cur);
                          }}
                          className="w-full text-xs gap-1.5 mt-1"
                        >
                          <Plus className="size-3.5" /> Adicionar Opção
                        </Button>
                      )}
                    </div>

                    <div className="space-y-1.5 pt-2 border-t">
                      <Label className="text-xs">Mensagem de Resposta Inválida (Reprompt)</Label>
                      <Input
                        value={((selectedNode.data.config as any)?.repromptText as string) || ""}
                        placeholder="Por favor, selecione uma das opções válidas digitando o número."
                        onChange={(e) => updateNodeConfig(selectedNode.id, "repromptText", e.target.value)}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-1">
                      <div className="space-y-1">
                        <Label className="text-[11px]">Tentativas (Retries)</Label>
                        <Input
                          type="number"
                          min={1}
                          max={5}
                          value={(selectedNode.data.config as any)?.maxRetries ?? 2}
                          onChange={(e) => updateNodeConfig(selectedNode.id, "maxRetries", Number(e.target.value))}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px]">Tempo Limite (min)</Label>
                        <Input
                          type="number"
                          min={1}
                          max={1440}
                          value={(selectedNode.data.config as any)?.timeoutMinutes ?? 60}
                          onChange={(e) => updateNodeConfig(selectedNode.id, "timeoutMinutes", Number(e.target.value))}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* messaging.collect_input (Action / CRM Capture) */}
                {selectedNode.data.type === "messaging.collect_input" && (
                  <div className="space-y-4">
                    <div className="p-3 bg-teal-500/10 border border-teal-200 rounded-xl text-xs text-teal-900 space-y-1">
                      <p className="font-semibold flex items-center gap-1.5">
                        <FormInput className="size-4 text-teal-600" />
                        Captura de Dados Validada (Kommo Salesbot)
                      </p>
                      <p className="text-[11px] text-teal-800 leading-relaxed">
                        Pergunta e valida e-mail, telefone, valor ou campos extras, salvando automaticamente no cartão CRM correspondente.
                      </p>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs">Pergunta / Solicitação de Dado *</Label>
                      <Textarea
                        rows={3}
                        placeholder="Ex: Por favor, digite seu e-mail para enviarmos a proposta:"
                        value={((selectedNode.data.config as any)?.promptText as string) || ""}
                        onChange={(e) => updateNodeConfig(selectedNode.id, "promptText", e.target.value)}
                      />
                      <VariableChips
                        onInsert={(v: string) => {
                          const cur = ((selectedNode.data.config as any)?.promptText as string) || "";
                          updateNodeConfig(selectedNode.id, "promptText", cur + (cur ? " " : "") + v);
                        }}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs">Tipo de Validação *</Label>
                      <Select
                        value={((selectedNode.data.config as any)?.validationType as string) || "text"}
                        onValueChange={(val) => updateNodeConfig(selectedNode.id, "validationType", val)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="text">Texto Livre (Não vazio)</SelectItem>
                          <SelectItem value="email">E-mail Válido (usuario@dominio.com)</SelectItem>
                          <SelectItem value="phone">Telefone / WhatsApp (10-15 dígitos)</SelectItem>
                          <SelectItem value="number">Número (Inteiro ou Decimal)</SelectItem>
                          <SelectItem value="currency">Valor Monetário (R$)</SelectItem>
                          <SelectItem value="date">Data (DD/MM/AAAA)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs">Campo Destino no CRM *</Label>
                      <Select
                        value={((selectedNode.data.config as any)?.targetField as string) || "custom"}
                        onValueChange={(val) => updateNodeConfig(selectedNode.id, "targetField", val)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="nome">Nome do Lead / Contato</SelectItem>
                          <SelectItem value="email">E-mail Principal</SelectItem>
                          <SelectItem value="telefone">Telefone / Celular</SelectItem>
                          <SelectItem value="valor">Valor do Negócio (Card CRM)</SelectItem>
                          <SelectItem value="custom">Campo Personalizado (campos_extras)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {((selectedNode.data.config as any)?.targetField === "custom") && (
                      <div className="space-y-1.5">
                        <Label className="text-xs">Chave do Campo Personalizado *</Label>
                        <Input
                          placeholder="Ex: cpf, cargo, empresa, cidade"
                          value={((selectedNode.data.config as any)?.customFieldKey as string) || ""}
                          onChange={(e) => updateNodeConfig(selectedNode.id, "customFieldKey", e.target.value.trim().toLowerCase())}
                        />
                      </div>
                    )}

                    <div className="space-y-1.5">
                      <Label className="text-xs">Mensagem de Formato Inválido</Label>
                      <Input
                        value={((selectedNode.data.config as any)?.invalidMessage as string) || ""}
                        placeholder="Ex: E-mail inválido. Por favor, digite um e-mail válido:"
                        onChange={(e) => updateNodeConfig(selectedNode.id, "invalidMessage", e.target.value)}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-1">
                      <div className="space-y-1">
                        <Label className="text-[11px]">Tentativas de Correção</Label>
                        <Input
                          type="number"
                          min={1}
                          max={5}
                          value={(selectedNode.data.config as any)?.maxRetries ?? 2}
                          onChange={(e) => updateNodeConfig(selectedNode.id, "maxRetries", Number(e.target.value))}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px]">Tempo Limite (min)</Label>
                        <Input
                          type="number"
                          min={1}
                          max={1440}
                          value={(selectedNode.data.config as any)?.timeoutMinutes ?? 60}
                          onChange={(e) => updateNodeConfig(selectedNode.id, "timeoutMinutes", Number(e.target.value))}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* messaging.send_template (Action) */}
                {selectedNode.data.type === "messaging.send_template" && (
                  <div className="space-y-4">
                    <div className="p-3 bg-emerald-500/10 border border-emerald-200 rounded-xl text-xs text-emerald-900 space-y-1">
                      <p className="font-semibold flex items-center gap-1.5">
                        <FileCheck2 className="size-4 text-emerald-600" />
                        Modelo WhatsApp HSM (Meta Cloud API / D-API)
                      </p>
                      <p className="text-[11px] text-emerald-800 leading-relaxed">
                        Dispara modelos oficiais aprovados pela Meta para abertura da janela de 24 horas com leads inativos ou reengajamento.
                      </p>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs">Nome do Modelo (Template Name) *</Label>
                      <Input
                        placeholder="Ex: notificacao_proposta_v1"
                        value={((selectedNode.data.config as any)?.templateName as string) || ""}
                        onChange={(e) => updateNodeConfig(selectedNode.id, "templateName", e.target.value.trim())}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs">Código do Idioma *</Label>
                      <Input
                        placeholder="pt_BR"
                        value={((selectedNode.data.config as any)?.languageCode as string) || "pt_BR"}
                        onChange={(e) => updateNodeConfig(selectedNode.id, "languageCode", e.target.value.trim())}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs">URL da Mídia do Cabeçalho (Opcional)</Label>
                      <Input
                        placeholder="https://... (para templates com imagem ou documento de cabeçalho)"
                        value={((selectedNode.data.config as any)?.headerMediaUrl as string) || ""}
                        onChange={(e) => updateNodeConfig(selectedNode.id, "headerMediaUrl", e.target.value.trim() || undefined)}
                      />
                    </div>

                    <div className="space-y-2 pt-2 border-t">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-semibold">Parâmetros do Corpo (Variáveis {`{{1}}`}, {`{{2}}`})</Label>
                        <span className="text-[10px] text-muted-foreground">
                          {(((selectedNode.data.config as any)?.bodyParameters as string[]) || []).length} parâmetros
                        </span>
                      </div>

                      <div className="space-y-2">
                        {((((selectedNode.data.config as any)?.bodyParameters as string[]) || []).map((param: string, pIdx: number) => (
                          <div key={pIdx} className="flex items-center gap-2">
                            <span className="text-[10px] font-mono text-muted-foreground shrink-0 w-6">
                              {`{{${pIdx + 1}}}`}:
                            </span>
                            <Input
                              value={param}
                              placeholder="Ex: {{contact.name}} ou valor fixo"
                              onChange={(e) => {
                                const params = [...(((selectedNode.data.config as any)?.bodyParameters as string[]) || [])];
                                params[pIdx] = e.target.value;
                                updateNodeConfig(selectedNode.id, "bodyParameters", params);
                              }}
                              className="text-xs h-8"
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                const params = (((selectedNode.data.config as any)?.bodyParameters as string[]) || []).filter(
                                  (_, i) => i !== pIdx
                                );
                                updateNodeConfig(selectedNode.id, "bodyParameters", params);
                              }}
                              className="size-8 text-muted-foreground hover:text-destructive shrink-0"
                            >
                              <X className="size-3.5" />
                            </Button>
                          </div>
                        )))}
                      </div>

                      <div className="flex items-center gap-2 pt-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const cur = [...(((selectedNode.data.config as any)?.bodyParameters as string[]) || [])];
                            cur.push("{{contact.name}}");
                            updateNodeConfig(selectedNode.id, "bodyParameters", cur);
                          }}
                          className="text-xs gap-1"
                        >
                          <Plus className="size-3" /> Adicionar Parâmetro
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-1.5 pt-2 border-t">
                      <Label className="text-xs">Política de Conexão</Label>
                      <Select
                        value={((selectedNode.data.config as any)?.connectionPolicy as string) || "same_as_trigger"}
                        onValueChange={(val) => updateNodeConfig(selectedNode.id, "connectionPolicy", val)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="same_as_trigger">Mesma linha/conexão do gatilho</SelectItem>
                          <SelectItem value="specific">Linha específica</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
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
                      onClick={() => quickPicker && handleAddSpecificNode(quickPicker.sourceId, quickPicker.sourcePort, "messaging.send_media")}
                      className="p-3 text-left border rounded-xl hover:border-emerald-500 hover:bg-emerald-500/5 transition-colors flex flex-col gap-1"
                    >
                      <span className="font-semibold text-xs flex items-center gap-1.5 text-foreground">
                        <Image className="size-3.5 text-emerald-600" /> Enviar Mídia
                      </span>
                      <span className="text-[11px] text-muted-foreground">Imagem, vídeo, áudio ou documento (R2/URL).</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => quickPicker && handleAddSpecificNode(quickPicker.sourceId, quickPicker.sourcePort, "messaging.send_interactive")}
                      className="p-3 text-left border rounded-xl hover:border-indigo-500 hover:bg-indigo-500/5 transition-colors flex flex-col gap-1"
                    >
                      <span className="font-semibold text-xs flex items-center gap-1.5 text-foreground">
                        <ListChecks className="size-3.5 text-indigo-600" /> Menu / Botões Interativos
                      </span>
                      <span className="text-[11px] text-muted-foreground">Botões ou menu numerado com ramos por opção.</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => quickPicker && handleAddSpecificNode(quickPicker.sourceId, quickPicker.sourcePort, "messaging.collect_input")}
                      className="p-3 text-left border rounded-xl hover:border-teal-500 hover:bg-teal-500/5 transition-colors flex flex-col gap-1"
                    >
                      <span className="font-semibold text-xs flex items-center gap-1.5 text-foreground">
                        <FormInput className="size-3.5 text-teal-600" /> Capturar Dado no CRM
                      </span>
                      <span className="text-[11px] text-muted-foreground">Valida e salva email, telefone, nome ou campo custom.</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => quickPicker && handleAddSpecificNode(quickPicker.sourceId, quickPicker.sourcePort, "messaging.send_template")}
                      className="p-3 text-left border rounded-xl hover:border-emerald-500 hover:bg-emerald-500/5 transition-colors flex flex-col gap-1"
                    >
                      <span className="font-semibold text-xs flex items-center gap-1.5 text-foreground">
                        <FileCheck2 className="size-3.5 text-emerald-600" /> Modelo WhatsApp (HSM)
                      </span>
                      <span className="text-[11px] text-muted-foreground">Template aprovado pela Meta com parâmetros.</span>
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
                  <h4 className="text-xs font-semibold text-fuchsia-600 dark:text-fuchsia-400 mb-2 uppercase tracking-wider flex items-center gap-1.5">
                    <MessageSquareQuote className="size-3" /> Meta (Instagram & Facebook)
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => quickPicker && handleAddSpecificNode(quickPicker.sourceId, quickPicker.sourcePort, "meta.send_private_reply")}
                      className="p-3 text-left border rounded-xl hover:border-fuchsia-500 hover:bg-fuchsia-500/5 transition-colors flex flex-col gap-1"
                    >
                      <span className="font-semibold text-xs flex items-center gap-1.5 text-foreground">
                        <Send className="size-3.5 text-fuchsia-600" /> Enviar DM Privado (Meta)
                      </span>
                      <span className="text-[11px] text-muted-foreground">Envia mensagem direta no Instagram ou Messenger.</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => quickPicker && handleAddSpecificNode(quickPicker.sourceId, quickPicker.sourcePort, "meta.reply_comment")}
                      className="p-3 text-left border rounded-xl hover:border-pink-500 hover:bg-pink-500/5 transition-colors flex flex-col gap-1"
                    >
                      <span className="font-semibold text-xs flex items-center gap-1.5 text-foreground">
                        <MessageSquareQuote className="size-3.5 text-pink-600" /> Responder Comentário
                      </span>
                      <span className="text-[11px] text-muted-foreground">Publica resposta no post com retardo humano e variantes.</span>
                    </button>
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-semibold text-sky-600 dark:text-sky-400 mb-2 uppercase tracking-wider flex items-center gap-1.5">
                    <Send className="size-3" /> Ações Telegram
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => quickPicker && handleAddSpecificNode(quickPicker.sourceId, quickPicker.sourcePort, "telegram.send_business_reply")}
                      className="p-3 text-left border rounded-xl hover:border-sky-500 hover:bg-sky-500/5 transition-colors flex flex-col gap-1"
                    >
                      <span className="font-semibold text-xs flex items-center gap-1.5 text-foreground">
                        <Send className="size-3.5 text-sky-500" /> Responder Business
                      </span>
                      <span className="text-[11px] text-muted-foreground">Dispara resposta oficial no chat Telegram Business.</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => quickPicker && handleAddSpecificNode(quickPicker.sourceId, quickPicker.sourcePort, "telegram.publish_to_channel")}
                      className="p-3 text-left border rounded-xl hover:border-sky-500 hover:bg-sky-500/5 transition-colors flex flex-col gap-1"
                    >
                      <span className="font-semibold text-xs flex items-center gap-1.5 text-foreground">
                        <Share2 className="size-3.5 text-sky-500" /> Publicar no Canal
                      </span>
                      <span className="text-[11px] text-muted-foreground">Emite comunicado ou mídia no canal oficial.</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => quickPicker && handleAddSpecificNode(quickPicker.sourceId, quickPicker.sourcePort, "telegram.route_to_human")}
                      className="p-3 text-left border rounded-xl hover:border-rose-500 hover:bg-rose-500/5 transition-colors flex flex-col gap-1"
                    >
                      <span className="font-semibold text-xs flex items-center gap-1.5 text-foreground">
                        <UserCheck className="size-3.5 text-rose-500" /> Derivar para Humano
                      </span>
                      <span className="text-[11px] text-muted-foreground">Pausa IA e notifica equipe no Telegram (Terminal).</span>
                    </button>
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">Ações de CRM & Leads</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => quickPicker && handleAddSpecificNode(quickPicker.sourceId, quickPicker.sourcePort, "crm.ensure_lead")}
                      className="p-3 text-left border rounded-xl hover:border-primary hover:bg-primary/5 transition-colors flex flex-col gap-1"
                    >
                      <span className="font-semibold text-xs flex items-center gap-1.5 text-foreground">
                        <UserPlus className="size-3.5 text-indigo-600" /> Garantir Lead no CRM
                      </span>
                      <span className="text-[11px] text-muted-foreground">Cadastra ou vincula o contato antes de enviar DMs.</span>
                    </button>
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
                      onClick={() => quickPicker && handleAddSpecificNode(quickPicker.sourceId, quickPicker.sourcePort, "crm.move_card_to_stage")}
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
                      onClick={() => quickPicker && handleAddSpecificNode(quickPicker.sourceId, quickPicker.sourcePort, "condition.if_else")}
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

          {/* Modal Configurações do Fluxo */}
          <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
            <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="text-base flex items-center gap-2">
                  <Settings className="size-4 text-primary" />
                  <span>Configurações Gerais do Fluxo</span>
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4 pt-2 text-xs">
                <div className="space-y-1.5">
                  <Label>Política de Reentrada (Reentry)</Label>
                  <Select
                    value={workflowSettings.reentry}
                    onValueChange={(val: any) => {
                      setIsDirty(true);
                      setWorkflowSettings((prev) => ({ ...prev, reentry: val }));
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="deny_while_active">Negar nova execução se já estiver ativo (Padrão)</SelectItem>
                      <SelectItem value="replace_active">Cancelar execução ativa e reiniciar com o novo evento</SelectItem>
                      <SelectItem value="allow">Permitir execuções concorrentes simultâneas</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Tempo Máximo de Execução (horas)</Label>
                    <Input
                      type="number"
                      min={1}
                      max={720}
                      value={Math.round(workflowSettings.maxRuntimeSeconds / 3600)}
                      onChange={(e) => {
                        setIsDirty(true);
                        setWorkflowSettings((prev) => ({
                          ...prev,
                          maxRuntimeSeconds: Math.max(60, Number(e.target.value) * 3600),
                        }));
                      }}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label>Limite Máximo de Passos</Label>
                    <Input
                      type="number"
                      min={10}
                      max={500}
                      value={workflowSettings.maxSteps}
                      onChange={(e) => {
                        setIsDirty(true);
                        setWorkflowSettings((prev) => ({
                          ...prev,
                          maxSteps: Math.min(500, Math.max(1, Number(e.target.value))),
                        }));
                      }}
                    />
                  </div>
                </div>

                <div className="pt-2 border-t space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="text-xs">Parar ao responder (Stop on reply)</Label>
                      <p className="text-[10px] text-muted-foreground">
                        Encerra automaticamente o fluxo com sucesso se o contato responder antes da próxima ação.
                      </p>
                    </div>
                    <Switch
                      checked={workflowSettings.stopOnContactReply}
                      onCheckedChange={(checked) => {
                        setIsDirty(true);
                        setWorkflowSettings((prev) => ({ ...prev, stopOnContactReply: checked }));
                      }}
                    />
                  </div>

                  <div className="space-y-1.5 pt-1">
                    <Label className="text-xs">Parar ao alcançar Etapas (Stop on stage)</Label>
                    <p className="text-[10px] text-muted-foreground">
                      Se o cartão do lead for movido para uma dessas etapas, o fluxo é encerrado imediatamente.
                    </p>
                    <div className="grid grid-cols-2 gap-2 pt-1 max-h-36 overflow-y-auto">
                      {(auxData.stages || []).map((stage: any) => {
                        const isChecked = workflowSettings.stopOnStageIds.includes(stage.id);
                        return (
                          <label key={stage.id} className="flex items-center gap-2 cursor-pointer text-[11px]">
                            <input
                              type="checkbox"
                              className="rounded border-gray-300 text-primary"
                              checked={isChecked}
                              onChange={(e) => {
                                setIsDirty(true);
                                setWorkflowSettings((prev) => ({
                                  ...prev,
                                  stopOnStageIds: e.target.checked
                                    ? [...prev.stopOnStageIds, stage.id]
                                    : prev.stopOnStageIds.filter((s) => s !== stage.id),
                                }));
                              }}
                            />
                            <span className="truncate">{stage.nome}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t flex justify-end">
                  <Button size="sm" onClick={() => setSettingsOpen(false)}>
                    Concluído
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      )}
    </div>
  );
}
