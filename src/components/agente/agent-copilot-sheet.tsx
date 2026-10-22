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
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import {
  askAgentCopilot,
  executeCopilotAction,
  auditAgentRules,
  type CopilotChatMessage,
} from "@/lib/agent-copilot.functions";
import type { CopilotActionProposal } from "@/lib/agent-copilot.server";
import {
  Sparkles,
  Send,
  Bot,
  User,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Zap,
  ShoppingBag,
  Sliders,
  ShieldAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface AgentCopilotSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agentId?: string | null;
  agentName?: string;
  tipo?: string;
  initialPrompt?: string | null;
  onRuleApplied?: () => void;
  onCatalogUpdated?: () => void;
}

export function AgentCopilotSheet({
  open,
  onOpenChange,
  agentId,
  agentName = "Agente",
  tipo = "qualificacao",
  initialPrompt,
  onRuleApplied,
  onCatalogUpdated,
}: AgentCopilotSheetProps) {
  const askCopilot = useServerFn(askAgentCopilot);
  const execAction = useServerFn(executeCopilotAction);
  const runAudit = useServerFn(auditAgentRules);

  const [messages, setMessages] = useState<CopilotChatMessage[]>([
    {
      role: "assistant",
      content: `¡Hola! Soy tu Copilot Arquitecto y Entrenador de IA. 

Puedo ayudarte a:
1. **Analizar dudas de chats reales** (WhatsApp, Instagram, etc.) y redactar reglas exactas.
2. **Cargar o actualizar tu catálogo** simplemente pegando una lista de precios o texto desordenado.
3. **Auditar tus reglas rígidas** para detectar contradicciones o ambigüedades.
4. **Optimizar el buffer de mensajes** y el tono de atención.

¿Qué te gustaría configurar o entrenar hoy?`,
    },
  ]);

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [executingIdx, setExecutingIdx] = useState<string | null>(null);
  const [auditing, setAuditing] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (initialPrompt && open) {
      setInput(initialPrompt);
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

    const newMsgs: CopilotChatMessage[] = [
      ...messages,
      { role: "user", content: text },
    ];
    setMessages(newMsgs);
    setInput("");
    setLoading(true);

    try {
      const res = await askCopilot({
        data: {
          messages: newMsgs,
          agentId,
          tipo,
        },
      });

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: res.reply,
          proposals: res.proposals,
        },
      ]);
    } catch (e: any) {
      toast.error(e.message || "Error al consultar con el Copilot.");
    } finally {
      setLoading(false);
    }
  }

  async function handleExecuteAction(msgIndex: number, propIndex: number, proposal: CopilotActionProposal) {
    const actionKey = `${msgIndex}-${propIndex}`;
    setExecutingIdx(actionKey);

    try {
      const res = await execAction({
        data: {
          action: proposal,
          agentId,
          tipo,
        },
      });

      toast.success(res.message);

      // Marca la propuesta como aplicada
      setMessages((prev) => {
        const copy = [...prev];
        if (copy[msgIndex]?.proposals?.[propIndex]) {
          copy[msgIndex].proposals![propIndex].status = "applied";
        }
        return copy;
      });

      if ((proposal.type === "rule" || proposal.type === "config") && onRuleApplied) onRuleApplied();
      if (proposal.type === "catalog" && onCatalogUpdated) onCatalogUpdated();
    } catch (e: any) {
      toast.error(e.message || "Error al aplicar la acción.");
    } finally {
      setExecutingIdx(null);
    }
  }

  async function handleRunAudit() {
    if (auditing) return;
    setAuditing(true);
    try {
      const res = await runAudit({
        data: { agentId, tipo },
      });

      const recommendationTexts = (res.recommendations || []).map((r: any, i: number) => 
        `• [${r.type.toUpperCase()}] ${r.issue}\n  👉 Sugerencia: ${r.suggested_fix}`
      ).join("\n\n");

      const auditMessage = `🛡️ **Resultado de Auditoría de Reglas**\n\n${res.summary}\n\n${recommendationTexts || "No se detectaron conflictos ni colisiones graves en tus reglas actuales."}`;

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: auditMessage,
        },
      ]);
    } catch (e: any) {
      toast.error(e.message || "Error al auditar reglas.");
    } finally {
      setAuditing(false);
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
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 text-white shadow-sm">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <SheetTitle className="text-base font-semibold flex items-center gap-2">
                  AI Studio Copilot
                  <Badge variant="outline" className="text-[10px] bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/30">
                    Arquitecto IA
                  </Badge>
                </SheetTitle>
                <SheetDescription className="text-xs text-muted-foreground">
                  Entrena a {agentName} conversando naturalmente.
                </SheetDescription>
              </div>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={handleRunAudit}
              disabled={auditing}
              className="h-8 text-xs gap-1.5 border-border hover:bg-muted"
            >
              <ShieldAlert className={cn("h-3.5 w-3.5 text-amber-500", auditing && "animate-spin")} />
              {auditing ? "Auditando..." : "Auditar Reglas"}
            </Button>
          </div>
        </SheetHeader>

        {/* Chat Message Scroll */}
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
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-violet-600/10 text-violet-600 dark:text-violet-400 mt-1">
                  <Bot className="h-4 w-4" />
                </div>
              )}

              <div
                className={cn(
                  "rounded-2xl px-4 py-3 text-xs max-w-[85%] leading-relaxed shadow-xs space-y-3",
                  msg.role === "user"
                    ? "bg-brand text-brand-foreground rounded-br-xs"
                    : "bg-muted/60 text-foreground border border-border/60 rounded-bl-xs"
                )}
              >
                <div className="whitespace-pre-wrap">{msg.content}</div>

                {/* Structured Action Proposals */}
                {msg.proposals && msg.proposals.length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-border/50">
                    {msg.proposals.map((prop, pIdx) => {
                      const isApplying = executingIdx === `${mIdx}-${pIdx}`;
                      const isApplied = prop.status === "applied";

                      return (
                        <div
                          key={pIdx}
                          className="rounded-xl border border-violet-500/30 bg-violet-500/5 p-3 space-y-2 text-foreground"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 font-medium text-violet-700 dark:text-violet-300">
                              {prop.type === "rule" && <Zap className="h-3.5 w-3.5" />}
                              {prop.type === "catalog" && <ShoppingBag className="h-3.5 w-3.5" />}
                              {prop.type === "config" && <Sliders className="h-3.5 w-3.5" />}
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
                              {isApplied ? "Aplicado" : "Pendiente"}
                            </Badge>
                          </div>

                          {prop.description && (
                            <p className="text-[11px] text-muted-foreground">
                              {prop.description}
                            </p>
                          )}

                          {prop.type === "rule" && prop.payload?.ruleText && (
                            <div className="rounded-md bg-background/80 p-2 font-mono text-[11px] border border-border/60">
                              {prop.payload.ruleText}
                            </div>
                          )}

                          {prop.type === "catalog" && Array.isArray(prop.payload?.items) && (
                            <div className="space-y-1 rounded-md bg-background/80 p-2 border border-border/60">
                              {prop.payload.items.map((it: any, iIdx: number) => (
                                <div key={iIdx} className="flex justify-between text-[11px] font-mono">
                                  <span>{it.nome}</span>
                                  <span className="font-semibold">${it.preco}</span>
                                </div>
                              ))}
                            </div>
                          )}

                          {!isApplied ? (
                            <Button
                              size="sm"
                              className="w-full h-7 text-xs gap-1.5 bg-violet-600 hover:bg-violet-700 text-white shadow-xs"
                              onClick={() => handleExecuteAction(mIdx, pIdx, prop)}
                              disabled={isApplying}
                            >
                              {isApplying ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Plus className="h-3.5 w-3.5" />
                              )}
                              {isApplying ? "Aplicando..." : "Aprobar y Guardar"}
                            </Button>
                          ) : (
                            <div className="flex items-center justify-center gap-1 text-[11px] text-green-600 font-medium py-1">
                              <CheckCircle2 className="h-3.5 w-3.5" /> Guardado en el Agente
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {msg.role === "user" && (
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand mt-1">
                  <User className="h-4 w-4" />
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground p-2">
              <Bot className="h-4 w-4 text-violet-500 animate-pulse" />
              <span>El Copilot está analizando tu agente y preparando la respuesta...</span>
            </div>
          )}
        </div>

        {/* Quick Suggestion Chips */}
        <div className="px-4 py-2 border-t border-border/40 bg-muted/10 flex items-center gap-2 overflow-x-auto text-xs scrollbar-none">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-[11px] px-2 rounded-full border border-border/60 hover:border-violet-500/50 hover:bg-violet-500/10 text-muted-foreground hover:text-foreground shrink-0"
            onClick={() => handleSend("Revisa las dudas pendientes de chats reales y dime qué reglas debemos agregar.")}
          >
            💡 Revisar dudas reales
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-[11px] px-2 rounded-full border border-border/60 hover:border-violet-500/50 hover:bg-violet-500/10 text-muted-foreground hover:text-foreground shrink-0"
            onClick={() => handleSend("Quiero actualizar o agregar productos al catálogo, dime cómo te paso la lista.")}
          >
            📦 Actualizar catálogo
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-[11px] px-2 rounded-full border border-border/60 hover:border-violet-500/50 hover:bg-violet-500/10 text-muted-foreground hover:text-foreground shrink-0"
            onClick={() => handleSend("Audita mis reglas rígidas actuales y dime si hay contradicciones o ambigüedades.")}
          >
            🛡️ Auditar reglas
          </Button>
        </div>

        {/* Input Bar */}
        <div className="p-4 border-t border-border bg-background flex items-center gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Pregúntale algo al Copilot o pega tu catálogo/regla..."
            className="min-h-[44px] max-h-32 text-xs resize-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
          />
          <Button
            size="icon"
            className="h-10 w-10 shrink-0 bg-gradient-to-r from-violet-600 to-indigo-600 text-white hover:from-violet-700 hover:to-indigo-700 shadow-sm"
            onClick={() => handleSend()}
            disabled={!input.trim() || loading}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
