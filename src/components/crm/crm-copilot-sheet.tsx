"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import {
  askCrmCopilot,
  executeCrmCopilotAction,
  type CrmCopilotChatMessage,
} from "@/lib/crm-copilot.functions";
import type { CrmCopilotActionProposal } from "@/lib/crm-copilot.server";
import {
  Sparkles,
  Send,
  Bot,
  User,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Sliders,
  Lock,
  ArrowRight,
  Lightbulb,
  FileText,
  Workflow,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/lib/i18n/context";

interface CrmCopilotSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pipelineId?: string | null;
  pipelineName?: string;
  cardId?: string | null;
  leadName?: string | null;
  initialPrompt?: string | null;
  onStageUpdated?: () => void;
  onLeadMoved?: () => void;
}

export function CrmCopilotSheet({
  open,
  onOpenChange,
  pipelineId,
  pipelineName = "Comercial",
  cardId,
  leadName,
  initialPrompt,
  onStageUpdated,
  onLeadMoved,
}: CrmCopilotSheetProps) {
  const { t } = useLanguage();
  const askCopilot = useServerFn(askCrmCopilot);
  const execAction = useServerFn(executeCrmCopilotAction);

  const [messages, setMessages] = useState<CrmCopilotChatMessage[]>([
    {
      role: "assistant",
      content: `¡Hola! Soy tu **Copilot de Ventas y Arquitecto de Embudos CRM**.

Puedo ayudarte a:
1. **Ajustar los criterios de IA** de tus etapas para que la clasificación automática sea 100% precisa.
2. **Crear nuevas etapas** cuando detectes que a tu proceso le falta un paso (ej.: Reenganchar, Demo agendada).
3. **Proteger etapas críticas** (bloquearlas para que solo un humano confirme el movimiento a Ganado o Soporte).
4. **Optimizar el Prompt Maestro** del Auditor Comercial de este embudo.
${leadName ? `\nActualmente estamos revisando el caso del lead **${leadName}**.` : ""}

¿Qué regla o etapa te gustaría configurar o mejorar?`,
    },
  ]);

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [executingIdx, setExecutingIdx] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentInitialRef = useRef<string | null>(null);

  useEffect(() => {
    if (initialPrompt && open && sentInitialRef.current !== initialPrompt) {
      sentInitialRef.current = initialPrompt;
      handleSend(initialPrompt);
    }
  }, [initialPrompt, open]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  async function handleSend(textToSend?: string) {
    const text = (textToSend || input).trim();
    if (!text || loading) return;

    const userMsg: CrmCopilotChatMessage = { role: "user", content: text };
    const updatedHistory = [...messages, userMsg];
    setMessages(updatedHistory);
    setInput("");
    setLoading(true);

    try {
      const res = await askCopilot({
        data: {
          messages: updatedHistory,
          pipelineId,
          cardId,
        },
      });

      const assistantMsg: CrmCopilotChatMessage = {
        role: "assistant",
        content: res.reply,
        proposals: res.proposals,
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: any) {
      toast.error(err?.message || "Error al consultar al Copilot del CRM");
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Disculpa, ocurrió un error temporal al procesar tu solicitud. Por favor intenta de nuevo.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function handleApplyProposal(
    action: CrmCopilotActionProposal,
    mIdx: number,
    pIdx: number
  ) {
    const key = `${mIdx}-${pIdx}`;
    setExecutingIdx(key);

    try {
      const res = await execAction({
        data: {
          action,
          pipelineId,
          cardId,
        },
      });

      toast.success(res.message);

      setMessages((prev) => {
        const copy = [...prev];
        const msg = copy[mIdx];
        if (msg && msg.proposals && msg.proposals[pIdx]) {
          msg.proposals[pIdx].status = "applied";
        }
        return copy;
      });

      onStageUpdated?.();
      if (action.type === "move_lead") {
        onLeadMoved?.();
      }
    } catch (err: any) {
      toast.error(err?.message || "Error al aplicar la acción.");
    } finally {
      setExecutingIdx(null);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-xl p-0 flex flex-col h-full bg-background border-l border-border"
      >
        <SheetHeader className="p-4 border-b border-border bg-muted/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-sm">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <SheetTitle className="text-base font-semibold flex items-center gap-2">
                  {t("crm.copilot_title", undefined, "Copilot del Embudo CRM")}
                  <Badge variant="outline" className="text-[10px] bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30">
                    Sales Ops IA
                  </Badge>
                </SheetTitle>
                <SheetDescription className="text-xs text-muted-foreground">
                  {t("crm.copilot_subtitle", { pipeline: pipelineName }, `Entrena y optimiza las etapas de "${pipelineName}" conversando naturalmente.`)}
                </SheetDescription>
              </div>
            </div>
          </div>
        </SheetHeader>

        {/* Historial de mensajes */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((msg, mIdx) => (
            <div
              key={mIdx}
              className={cn(
                "flex gap-3",
                msg.role === "user" ? "justify-end" : "justify-start"
              )}
            >
              {msg.role === "assistant" && (
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-600/10 text-blue-600 dark:text-blue-400 mt-1">
                  <Bot className="h-4 w-4" />
                </div>
              )}

              <div
                className={cn(
                  "rounded-2xl px-4 py-3 text-xs max-w-[88%] leading-relaxed shadow-xs space-y-3",
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground rounded-br-xs"
                    : "bg-muted/60 text-foreground border border-border/60 rounded-bl-xs"
                )}
              >
                <div className="whitespace-pre-wrap">{msg.content}</div>

                {/* Acciones propuestas por el Copilot */}
                {msg.proposals && msg.proposals.length > 0 && (
                  <div className="space-y-2.5 pt-2.5 border-t border-border/50">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground block">
                      {t("crm.proposed_actions", undefined, "Acciones Sugeridas para Aplicar:")}
                    </span>

                    {msg.proposals.map((prop, pIdx) => {
                      const isApplying = executingIdx === `${mIdx}-${pIdx}`;
                      const isApplied = prop.status === "applied";

                      return (
                        <div
                          key={pIdx}
                          className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-3 space-y-2 text-foreground"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 font-semibold text-blue-700 dark:text-blue-300">
                              {prop.type === "stage_criteria" && <Sliders className="h-3.5 w-3.5" />}
                              {prop.type === "create_stage" && <Plus className="h-3.5 w-3.5" />}
                              {prop.type === "pipeline_prompt" && <FileText className="h-3.5 w-3.5" />}
                              {prop.type === "stage_automation" && <Workflow className="h-3.5 w-3.5" />}
                              {prop.type === "move_lead" && <ArrowRight className="h-3.5 w-3.5" />}
                              <span>{prop.title}</span>
                            </div>

                            <Badge
                              variant="outline"
                              className={cn(
                                "text-[10px] font-mono",
                                isApplied
                                  ? "bg-green-500/10 text-green-600 border-green-500/30"
                                  : "bg-amber-500/10 text-amber-600 border-amber-500/30"
                              )}
                            >
                              {isApplied ? t("crm.applied", undefined, "Aplicado") : t("crm.pending", undefined, "Pendiente")}
                            </Badge>
                          </div>

                          {prop.description && (
                            <p className="text-[11px] text-muted-foreground">
                              {prop.description}
                            </p>
                          )}

                          {/* Previsualización del cambio */}
                          {prop.type === "stage_criteria" && prop.payload?.criterio_ia && (
                            <div className="rounded-md bg-background/80 p-2 font-mono text-[11px] border border-border/60 space-y-1">
                              <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                                {t("crm.criteria_preview", undefined, "Nuevo Criterio:")}
                              </span>
                              <div className="whitespace-pre-wrap">{prop.payload.criterio_ia}</div>
                              {prop.payload.bloqueada_para_ia && (
                                <span className="inline-flex items-center gap-1 text-[10px] text-amber-600 font-semibold pt-1">
                                  <Lock className="size-3" /> {t("crm.stage_will_be_locked", undefined, "Etapa quedará protegida contra movimientos automáticos")}
                                </span>
                              )}
                            </div>
                          )}

                          {prop.type === "create_stage" && (
                            <div className="rounded-md bg-background/80 p-2 font-mono text-[11px] border border-border/60 space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="size-2.5 rounded-full" style={{ background: prop.payload.cor || "#60A5FA" }} />
                                <b>{prop.payload.nome}</b>
                                <span className="text-[10px] text-muted-foreground">({prop.payload.tipo || "normal"})</span>
                              </div>
                              {prop.payload.criterio_ia && (
                                <p className="text-muted-foreground text-[10.5px] pt-1">{prop.payload.criterio_ia}</p>
                              )}
                            </div>
                          )}

                          {prop.type === "pipeline_prompt" && prop.payload?.crm_master_prompt && (
                            <div className="rounded-md bg-background/80 p-2 font-mono text-[11px] border border-border/60 max-h-24 overflow-y-auto whitespace-pre-wrap">
                              {prop.payload.crm_master_prompt}
                            </div>
                          )}

                          {/* Botón de aplicación con 1 clic */}
                          <div className="flex justify-end pt-1">
                            <Button
                              size="sm"
                              disabled={isApplied || isApplying}
                              onClick={() => handleApplyProposal(prop, mIdx, pIdx)}
                              className={cn(
                                "h-7 text-xs font-semibold gap-1.5",
                                isApplied
                                  ? "bg-green-600 text-white hover:bg-green-600"
                                  : "bg-blue-600 hover:bg-blue-700 text-white"
                              )}
                            >
                              {isApplying ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : isApplied ? (
                                <Check className="h-3.5 w-3.5" />
                              ) : (
                                <Sparkles className="h-3.5 w-3.5" />
                              )}
                              {isApplied
                                ? t("crm.action_applied", undefined, "Aplicado al embudo")
                                : t("crm.apply_to_pipeline", undefined, "Aplicar cambio al embudo")}
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {msg.role === "user" && (
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground mt-1">
                  <User className="h-4 w-4" />
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div className="flex items-center gap-3 text-muted-foreground text-xs py-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600/10 text-blue-600 animate-pulse">
                <Bot className="h-4 w-4" />
              </div>
              <div className="flex items-center gap-1.5">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600" />
                <span>{t("crm.copilot_thinking", undefined, "Analizando arquitectura del embudo y redactando propuesta...")}</span>
              </div>
            </div>
          )}
        </div>

        {/* Píldoras de sugerencias rápidas */}
        {messages.length <= 2 && (
          <div className="px-4 py-2 border-t border-border/40 bg-muted/10 flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => handleSend("Analiza los criterios de mis etapas actuales y dime qué huecos o dudas tienen.")}
              className="rounded-full bg-muted/60 hover:bg-muted text-[11px] px-2.5 py-1 text-muted-foreground transition border border-border/40"
            >
              🔍 Auditar criterios actuales
            </button>
            <button
              type="button"
              onClick={() => handleSend("Quiero crear una etapa para seguimiento de presupuestos enviados.")}
              className="rounded-full bg-muted/60 hover:bg-muted text-[11px] px-2.5 py-1 text-muted-foreground transition border border-border/40"
            >
              ➕ Crear nueva etapa
            </button>
            <button
              type="button"
              onClick={() => handleSend("¿Cuáles etapas de mi embudo deberían estar bloqueadas para la IA?")}
              className="rounded-full bg-muted/60 hover:bg-muted text-[11px] px-2.5 py-1 text-muted-foreground transition border border-border/40"
            >
              🔒 Proteger etapas críticas
            </button>
          </div>
        )}

        {/* Input Footer */}
        <div className="p-3 border-t border-border bg-background">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleSend();
            }}
            className="flex gap-2 items-end"
          >
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void handleSend();
                }
              }}
              placeholder={t("crm.copilot_input_placeholder", undefined, "Describe qué quieres ajustar en el embudo o pega una sugerencia de auditoría...")}
              className="min-h-[44px] max-h-32 text-xs resize-none"
              rows={2}
            />
            <Button
              type="submit"
              disabled={loading || !input.trim()}
              className="h-11 px-3 bg-blue-600 hover:bg-blue-700 text-white shrink-0"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  );
}
