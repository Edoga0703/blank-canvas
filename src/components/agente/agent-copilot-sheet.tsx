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
import { supabase } from "@/integrations/supabase/client";
import {
  askAgentCopilot,
  executeCopilotAction,
  auditAgentRules,
  testWebhookInSandbox,
  getOrCreateCopilotSession,
  updateCopilotMessageProposalState,
  type CopilotChatMessage,
  type CopilotAttachmentRef,
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
  Terminal,
  Database,
  Play,
  Globe,
  ExternalLink,
  Wrench,
  RefreshCw,
  MessageSquarePlus,
  Paperclip,
  X,
  FileText,
  Image as ImageIcon,
  ListChecks,
} from "lucide-react";
import { cn } from "@/lib/utils";

const WELCOME_MESSAGE: CopilotChatMessage = {
  role: "assistant",
  content: `¡Hola! Soy tu Copilot Arquitecto y Entrenador de IA. 

Puedo ayudarte a:
1. **Analizar dudas de chats reales** (WhatsApp, Instagram, etc.) y redactar reglas exactas.
2. **Cargar o actualizar tu catálogo** simplemente pegando una lista de precios o texto desordenado.
3. **Auditar tus reglas rígidas** para detectar contradicciones o ambigüedades.
4. **Probar y conectar APIs externas / Webhooks en el Sandbox** para obtener datos de clientes en vivo (vencimientos, cuentas activas, etc.).

¿Qué te gustaría configurar o entrenar hoy?`,
};

interface PendingCopilotAttachment {
  id: string;
  file: File;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  previewUrl?: string;
}

const MAX_COPILOT_FILES = 2;
const MAX_COPILOT_FILE_BYTES = 8 * 1024 * 1024;
const ALLOWED_COPILOT_EXTS = new Set(["png", "jpg", "jpeg", "webp", "pdf", "txt", "csv"]);

interface AgentCopilotSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId?: string | null;
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
  companyId,
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
  const runSandbox = useServerFn(testWebhookInSandbox);
  const loadOrCreateSession = useServerFn(getOrCreateCopilotSession);
  const persistProposalState = useServerFn(updateCopilotMessageProposalState);

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loadingSession, setLoadingSession] = useState(false);
  const [messages, setMessages] = useState<CopilotChatMessage[]>([WELCOME_MESSAGE]);

  const [input, setInput] = useState("");
  const [guidedReadyPrompt, setGuidedReadyPrompt] = useState<string | null>(null);
  const [pendingAttachments, setPendingAttachments] = useState<PendingCopilotAttachment[]>([]);
  const [uploadingAttachments, setUploadingAttachments] = useState(false);
  const [loading, setLoading] = useState(false);
  const [executingIdx, setExecutingIdx] = useState<string | null>(null);
  const [testingKey, setTestingKey] = useState<string | null>(null);
  const [sandboxResults, setSandboxResults] = useState<Record<string, any>>({});
  const [auditing, setAuditing] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const loadedContextRef = useRef<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const ctxKey = `${agentId || "default"}:${tipo || "qualificacao"}`;
    if (loadedContextRef.current === ctxKey && sessionId) return;

    let cancelled = false;
    setLoadingSession(true);
    void loadOrCreateSession({
      data: { agentId, tipo },
    })
      .then((res: any) => {
        if (cancelled) return;
        loadedContextRef.current = ctxKey;
        setSessionId(res?.session?.id || null);
        const restored: CopilotChatMessage[] = Array.isArray(res?.messages) ? res.messages : [];
        if (restored.length > 0) {
          setMessages(restored);
          const nextSandbox: Record<string, any> = {};
          restored.forEach((m, mIdx) => {
            (m.proposals || []).forEach((p, pIdx) => {
              if (p?.sandboxResult) {
                nextSandbox[`${mIdx}-${pIdx}`] = p.sandboxResult;
              }
            });
          });
          setSandboxResults(nextSandbox);
        } else {
          setMessages([WELCOME_MESSAGE]);
          setSandboxResults({});
        }
      })
      .catch(() => {
        if (!cancelled) {
          setMessages([WELCOME_MESSAGE]);
          setSandboxResults({});
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingSession(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, agentId, tipo]);

  async function handleNewSession() {
    if (loadingSession || loading) return;
    setLoadingSession(true);
    try {
      const res: any = await loadOrCreateSession({
        data: { agentId, tipo, forceNew: true },
      });
      loadedContextRef.current = `${agentId || "default"}:${tipo || "qualificacao"}`;
      setSessionId(res?.session?.id || null);
      setMessages([WELCOME_MESSAGE]);
      setSandboxResults({});
      toast.success("Nueva sesión del Copilot iniciada.");
    } catch (e: any) {
      toast.error(e?.message || "No se pudo iniciar una nueva sesión.");
    } finally {
      setLoadingSession(false);
    }
  }

  useEffect(() => {
    if (initialPrompt && open) {
      setInput(initialPrompt);
      setGuidedReadyPrompt(initialPrompt);
    } else if (!open) {
      setGuidedReadyPrompt(null);
    }
  }, [initialPrompt, open]);

  useEffect(() => {
    return () => {
      pendingAttachments.forEach((att) => {
        if (att.previewUrl) URL.revokeObjectURL(att.previewUrl);
      });
    };
  }, []);

  function addCopilotFiles(files: File[]) {
    if (!files.length) return;
    const nextList: PendingCopilotAttachment[] = [...pendingAttachments];
    for (const file of files) {
      if (nextList.length >= MAX_COPILOT_FILES) {
        toast.warning(`Máximo ${MAX_COPILOT_FILES} archivos adjuntos por mensaje.`);
        break;
      }
      const ext = ((/\.([a-z0-9]+)$/i.exec(file.name || "")?.[1]) || "").toLowerCase();
      const mime = String(file.type || "").toLowerCase();
      const allowedByMime =
        mime.startsWith("image/") ||
        mime === "application/pdf" ||
        mime === "text/plain" ||
        mime === "text/csv";
      if (!ALLOWED_COPILOT_EXTS.has(ext) && !allowedByMime) {
        toast.error(`Formato no soportado (${file.name}). Usa PNG, JPG, WEBP, PDF, TXT o CSV.`);
        continue;
      }
      if (file.size > MAX_COPILOT_FILE_BYTES) {
        toast.error(`"${file.name}" supera el límite de 8 MB.`);
        continue;
      }
      const isImg = mime.startsWith("image/") || ["png", "jpg", "jpeg", "webp"].includes(ext);
      const previewUrl = isImg ? URL.createObjectURL(file) : undefined;
      nextList.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        file,
        fileName: file.name || `captura.${ext || "png"}`,
        mimeType: file.type || (isImg ? `image/${ext || "png"}` : "application/octet-stream"),
        sizeBytes: file.size,
        previewUrl,
      });
    }
    setPendingAttachments(nextList);
  }

  function removePendingAttachment(id: string) {
    setPendingAttachments((prev) => {
      const target = prev.find((a) => a.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((a) => a.id !== id);
    });
  }

  function handlePasteFiles(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const items = e.clipboardData?.items;
    if (!items) return;
    const pastedFiles: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === "file" && item.type.startsWith("image/")) {
        const f = item.getAsFile();
        if (f) {
          const ext = f.type.split("/")[1]?.replace("jpeg", "jpg") || "png";
          const named = f.name && f.name !== "image.png" ? f : new File([f], `captura-${Date.now()}.${ext}`, { type: f.type });
          pastedFiles.push(named);
        }
      }
    }
    if (pastedFiles.length > 0) {
      e.preventDefault();
      addCopilotFiles(pastedFiles);
      toast.success("Captura adjuntada desde el portapapeles.");
    }
  }

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  async function resolveUploadCompanyId(): Promise<string> {
    if (companyId) return companyId;
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData?.user?.id;
    if (!uid) throw new Error("Sesión no disponible para subir archivos.");
    const { data: cu } = await supabase
      .from("company_user")
      .select("company_id")
      .eq("user_id", uid)
      .eq("ativo", true)
      .limit(1)
      .maybeSingle();
    if (!cu?.company_id) throw new Error("No se encontró la empresa activa para subir adjuntos.");
    return cu.company_id;
  }

  async function handleSend(textToSend?: string) {
    const rawText = (textToSend ?? input).trim();
    const filesToUpload = [...pendingAttachments];
    if ((!rawText && filesToUpload.length === 0) || loading || uploadingAttachments) return;

    const text = rawText || "Analiza el archivo adjunto y dime qué debemos configurar o corregir.";
    const displayLabels = filesToUpload.map((f) => `[Archivo: ${f.fileName}]`).join(" ");
    const uiMessageText = displayLabels ? `${text}\n\n${displayLabels}` : text;

    const userMsgIdx = messages.length;
    const newMsgs: CopilotChatMessage[] = [
      ...messages,
      { role: "user", content: uiMessageText },
    ];
    const requestMsgs: CopilotChatMessage[] = [
      ...messages,
      { role: "user", content: text },
    ];

    setMessages(newMsgs);
    setInput("");
    setGuidedReadyPrompt(null);
    setLoading(true);

    try {
      let uploadedRefs: CopilotAttachmentRef[] = [];
      if (filesToUpload.length > 0) {
        setUploadingAttachments(true);
        const cid = await resolveUploadCompanyId();
        uploadedRefs = await Promise.all(
          filesToUpload.map(async (item, idx) => {
            const safeName = (item.fileName || "archivo")
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "")
              .replace(/[^a-zA-Z0-9._-]+/g, "-")
              .replace(/^-+|-+$/g, "")
              .slice(0, 80) || "archivo";
            const storagePath = `${cid}/copilot/${Date.now()}-${idx}-${safeName}`;
            const { error: upErr } = await supabase.storage
              .from("agent-knowledge")
              .upload(storagePath, item.file, {
                contentType: item.mimeType || "application/octet-stream",
                upsert: false,
              });
            if (upErr) {
              throw new Error(`Error subiendo "${item.fileName}": ${upErr.message}`);
            }
            return {
              bucket: "agent-knowledge",
              path: storagePath,
              mimeType: item.mimeType,
              fileName: item.fileName,
            };
          }),
        );
        setUploadingAttachments(false);
        filesToUpload.forEach((f) => {
          if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
        });
        setPendingAttachments([]);
      }

      const res = await askCopilot({
        data: {
          messages: requestMsgs,
          agentId,
          tipo,
          sessionId,
          ...(uploadedRefs.length > 0 ? { attachments: uploadedRefs } : {}),
        },
      });

      if (res.sessionId) {
        setSessionId(res.sessionId);
      }

      setMessages((prev) => {
        const copy = [...prev];
        if (copy[userMsgIdx] && res.userMessageId) {
          copy[userMsgIdx] = { ...copy[userMsgIdx], id: res.userMessageId };
        }
        copy.push({
          id: res.assistantMessageId || undefined,
          role: "assistant",
          content: res.reply,
          proposals: res.proposals,
        });
        return copy;
      });
    } catch (e: any) {
      toast.error(e.message || "Error al consultar con el Copilot.");
    } finally {
      setUploadingAttachments(false);
      setLoading(false);
    }
  }

  async function handleTestWebhook(msgIndex: number, propIndex: number, payload: any) {
    const actionKey = `${msgIndex}-${propIndex}`;
    setTestingKey(actionKey);
    try {
      const resolvedTestBody =
        payload?.test_body ??
        payload?.testBody ??
        payload?.sample_body ??
        payload?.body ??
        payload?.body_template;
      const res = await runSandbox({
        data: {
          url: payload?.url,
          method: payload?.method || "POST",
          headers: payload?.headers,
          body: resolvedTestBody,
          test_body: payload?.test_body ?? payload?.testBody ?? payload?.sample_body,
          body_template: payload?.body_template,
          input_schema: payload?.input_schema,
        },
      });
      setSandboxResults((prev) => ({ ...prev, [actionKey]: res }));

      const targetMsg = messages[msgIndex];
      if (targetMsg?.id) {
        const currentStatus = targetMsg.proposals?.[propIndex]?.status || "pending";
        void persistProposalState({
          data: {
            messageId: targetMsg.id,
            proposalIndex: propIndex,
            status: currentStatus,
            sandboxResult: res,
          },
        }).catch(() => {});
      }

      if (res.ok) {
        toast.success(`Prueba exitosa en Sandbox: HTTP ${res.status} (${res.latencyMs}ms)`);
      } else {
        toast.error(`Prueba en Sandbox: HTTP ${res.status} - ${res.error || res.statusText}`);
      }
    } catch (e: any) {
      toast.error(e.message || "Error al ejecutar prueba en el sandbox.");
    } finally {
      setTestingKey(null);
    }
  }

  async function handleExecuteAction(msgIndex: number, propIndex: number, proposal: CopilotActionProposal) {
    const actionKey = `${msgIndex}-${propIndex}`;
    setExecutingIdx(actionKey);
    const existingTest = sandboxResults[actionKey];
    const targetMsgId = messages[msgIndex]?.id;

    try {
      const actionToSend: CopilotActionProposal =
        (proposal.type === "tool" || proposal.type === "webhook") && existingTest?.ok
          ? {
              ...proposal,
              payload: {
                ...(proposal.payload || {}),
                sandboxTestResult: existingTest,
              },
            }
          : proposal;

      const res = await execAction({
        data: {
          action: actionToSend,
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

      if (targetMsgId) {
        void persistProposalState({
          data: {
            messageId: targetMsgId,
            proposalIndex: propIndex,
            status: "applied",
            ...(existingTest ? { sandboxResult: existingTest } : {}),
          },
        }).catch(() => {});
      }

      if (
        (proposal.type === "rule" ||
          proposal.type === "replace_rules" ||
          proposal.type === "resolve_suggestion" ||
          proposal.type === "config" ||
          proposal.type === "webhook" ||
          proposal.type === "tool") &&
        onRuleApplied
      ) {
        onRuleApplied();
      }
      if (proposal.type === "catalog" && onCatalogUpdated) {
        onCatalogUpdated();
      }
    } catch (e: any) {
      setMessages((prev) => {
        const copy = [...prev];
        if (copy[msgIndex]?.proposals?.[propIndex]) {
          copy[msgIndex].proposals![propIndex].status = "failed";
        }
        return copy;
      });
      if (targetMsgId) {
        void persistProposalState({
          data: {
            messageId: targetMsgId,
            proposalIndex: propIndex,
            status: "failed",
            ...(existingTest ? { sandboxResult: existingTest } : {}),
          },
        }).catch(() => {});
      }
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

            <div className="flex items-center gap-1.5">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleNewSession}
                disabled={loadingSession || loading}
                className="h-8 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
                title="Iniciar un nuevo hilo de conversación"
              >
                <MessageSquarePlus className="h-3.5 w-3.5" />
                Nueva sesión
              </Button>
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
          </div>
        </SheetHeader>

        {/* Chat Message Scroll */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
          {loadingSession && (
            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground py-3">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-500" />
              <span>Cargando historial de sesión...</span>
            </div>
          )}
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
                <div className="whitespace-pre-wrap break-words">{msg.content}</div>

                {/* Structured Action Proposals */}
                {msg.proposals && msg.proposals.length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-border/50">
                    {msg.proposals.map((prop, pIdx) => {
                      const isApplying = executingIdx === `${mIdx}-${pIdx}`;
                      const isApplied = prop.status === "applied";
                      const isTesting = testingKey === `${mIdx}-${pIdx}`;
                      const testResult = sandboxResults[`${mIdx}-${pIdx}`];

                      return (
                        <div
                          key={pIdx}
                          className="rounded-xl border border-violet-500/30 bg-violet-500/5 p-3 space-y-2 text-foreground"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 font-medium text-violet-700 dark:text-violet-300">
                              {prop.type === "rule" && <Zap className="h-3.5 w-3.5" />}
                              {prop.type === "replace_rules" && <RefreshCw className="h-3.5 w-3.5 text-amber-500" />}
                              {prop.type === "resolve_suggestion" && <ListChecks className="h-3.5 w-3.5 text-emerald-600" />}
                              {prop.type === "catalog" && <ShoppingBag className="h-3.5 w-3.5" />}
                              {prop.type === "config" && <Sliders className="h-3.5 w-3.5" />}
                              {prop.type === "test_webhook" && <Terminal className="h-3.5 w-3.5 text-blue-500" />}
                              {prop.type === "webhook" && <Database className="h-3.5 w-3.5 text-emerald-500" />}
                              {prop.type === "tool" && <Wrench className="h-3.5 w-3.5 text-emerald-500" />}
                              <span>{prop.title}</span>
                            </div>
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-[10px] font-mono",
                                isApplied
                                  ? "bg-green-500/10 text-green-600 border-green-500/30"
                                  : prop.status === "failed"
                                    ? "bg-destructive/10 text-destructive border-destructive/30"
                                    : prop.type === "test_webhook"
                                      ? "bg-blue-500/10 text-blue-600 border-blue-500/30"
                                      : prop.type === "replace_rules"
                                        ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40"
                                        : prop.type === "resolve_suggestion"
                                          ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
                                          : "bg-amber-500/10 text-amber-600 border-amber-500/30"
                              )}
                            >
                              {isApplied
                                ? "Aplicado"
                                : prop.status === "failed"
                                  ? "Falló"
                                  : prop.type === "test_webhook"
                                    ? "Sandbox"
                                    : prop.type === "replace_rules"
                                      ? "Reemplazo limpio"
                                      : prop.type === "resolve_suggestion"
                                        ? "Resolver sugerencias"
                                        : "Pendiente"}
                            </Badge>
                          </div>

                          {prop.description && (
                            <p className="text-[11px] text-muted-foreground">
                              {prop.description}
                            </p>
                          )}

                          {/* Rule proposal payload */}
                          {prop.type === "rule" && prop.payload?.ruleText && (
                            <div className="rounded-md bg-background/80 p-2 font-mono text-[11px] border border-border/60">
                              {prop.payload.ruleText}
                            </div>
                          )}

                          {/* Resolve suggestion proposal payload */}
                          {prop.type === "resolve_suggestion" && (() => {
                            const sugIds = Array.isArray(prop.payload?.suggestionIds)
                              ? prop.payload.suggestionIds
                              : prop.payload?.suggestionId
                                ? [prop.payload.suggestionId]
                                : [];
                            const resMode = String(prop.payload?.resolution || "approved").toLowerCase() === "dismissed"
                              ? "Descartar"
                              : "Marcar como resuelta";
                            return (
                              <div className="rounded-md bg-background/80 p-2 font-mono text-[11px] border border-border/60 space-y-1">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-foreground font-semibold">{resMode}</span>
                                  <span className="text-[10px] text-muted-foreground">{sugIds.length} sugerencia(s)</span>
                                </div>
                                {prop.payload?.note && (
                                  <div className="text-[10px] text-muted-foreground font-sans">{prop.payload.note}</div>
                                )}
                              </div>
                            );
                          })()}

                          {/* Replace rules proposal payload */}
                          {prop.type === "replace_rules" && prop.payload?.rulesText && (() => {
                            const rulesPreview = String(prop.payload.rulesText).trim();
                            return (
                              <div className="space-y-1.5">
                                {prop.payload?.reason && (
                                  <div className="text-[10px] text-amber-700 dark:text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded px-2 py-1">
                                    Motivo: {prop.payload.reason}
                                  </div>
                                )}
                                <div className="rounded-md bg-background/80 p-2.5 border border-border/60 space-y-1">
                                  <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                                    <span>Vista previa de Reglas Rígidas consolidadas</span>
                                    <span className="font-mono">{rulesPreview.length} caracteres</span>
                                  </div>
                                  <pre className="max-h-44 overflow-y-auto font-mono text-[11px] whitespace-pre-wrap text-foreground">
                                    {rulesPreview}
                                  </pre>
                                </div>
                              </div>
                            );
                          })()}

                          {/* Catalog proposal payload */}
                          {prop.type === "catalog" && Array.isArray(prop.payload?.items) && (
                            <div className="space-y-1 rounded-md bg-background/80 p-2 border border-border/60">
                              {prop.payload.items.map((it: any, iIdx: number) => (
                                <div key={iIdx} className="flex justify-between gap-2 text-[11px] font-mono">
                                  <span className="truncate">
                                    {it.nome}
                                    {it.sku ? <span className="text-muted-foreground ml-1">[{it.sku}]</span> : null}
                                  </span>
                                  <span className="font-semibold shrink-0">${it.preco}</span>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Sandbox Test Webhook card */}
                          {prop.type === "test_webhook" && (
                            <div className="space-y-2">
                              <div className="rounded-md bg-background/80 p-2.5 font-mono text-[11px] border border-border/60 space-y-1">
                                <div className="flex items-center gap-1.5 font-semibold text-foreground">
                                  <Badge variant="secondary" className="text-[10px] uppercase font-mono px-1.5 py-0">
                                    {prop.payload?.method || "POST"}
                                  </Badge>
                                  <span className="truncate">{prop.payload?.url}</span>
                                </div>
                                {prop.payload?.body && (
                                  <div className="text-[10px] text-muted-foreground pt-1 border-t border-border/40">
                                    <span className="text-foreground/70 font-semibold">Body:</span> {JSON.stringify(prop.payload.body)}
                                  </div>
                                )}
                              </div>

                              {testResult && (
                                <div
                                  className={cn(
                                    "rounded-md p-2.5 text-[11px] font-mono border space-y-1.5",
                                    testResult.ok
                                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-950 dark:text-emerald-200"
                                      : "bg-destructive/10 border-destructive/30 text-destructive dark:text-red-300"
                                  )}
                                >
                                  <div className="flex items-center justify-between font-semibold">
                                    <span>
                                      {testResult.ok ? `🟢 HTTP ${testResult.status} OK` : `🔴 HTTP ${testResult.status}`}
                                    </span>
                                    <span className="text-[10px] text-muted-foreground">
                                      {testResult.latencyMs}ms
                                    </span>
                                  </div>

                                  {testResult.responseSample && (
                                    <pre className="max-h-36 overflow-y-auto text-[10px] p-2 bg-background/90 rounded border border-border/40 text-foreground whitespace-pre-wrap">
                                      {typeof testResult.responseSample === "object"
                                        ? JSON.stringify(testResult.responseSample, null, 2)
                                        : String(testResult.responseSample)}
                                    </pre>
                                  )}

                                  {testResult.error && (
                                    <p className="text-[10px] text-destructive">
                                      {testResult.error}
                                    </p>
                                  )}
                                </div>
                              )}

                              <Button
                                size="sm"
                                className="w-full h-7 text-xs gap-1.5 bg-blue-600 hover:bg-blue-700 text-white shadow-xs"
                                onClick={() => handleTestWebhook(mIdx, pIdx, prop.payload)}
                                disabled={isTesting}
                              >
                                {isTesting ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Play className="h-3.5 w-3.5" />
                                )}
                                {isTesting ? "Probando en Sandbox..." : "🧪 Probar en Sandbox"}
                              </Button>
                            </div>
                          )}

                          {/* Final Webhook / Verified Tool Connection card */}
                          {(prop.type === "webhook" || prop.type === "tool") && (() => {
                            const permLevel = prop.payload?.permission_level || "read_only";
                            const permLabel =
                              permLevel === "write_require_owner_approval"
                                ? "Aprobación dueño"
                                : permLevel === "write_confirm_customer"
                                  ? "Confirmación cliente"
                                  : "Solo lectura";
                            const permClass =
                              permLevel === "write_require_owner_approval"
                                ? "bg-rose-500/10 text-rose-600 border-rose-500/30 dark:text-rose-300"
                                : permLevel === "write_confirm_customer"
                                  ? "bg-amber-500/10 text-amber-600 border-amber-500/30 dark:text-amber-300"
                                  : "bg-emerald-500/10 text-emerald-600 border-emerald-500/30 dark:text-emerald-300";

                            return (
                              <div className="space-y-2">
                                <div className="rounded-md bg-background/80 p-2.5 font-mono text-[11px] border border-border/60 space-y-1.5">
                                  <div className="flex items-center justify-between gap-2 flex-wrap">
                                    <div className="flex items-center gap-1.5 font-semibold text-foreground min-w-0">
                                      <Badge variant="secondary" className="text-[10px] uppercase font-mono px-1.5 py-0">
                                        {prop.payload?.method || "POST"}
                                      </Badge>
                                      {prop.payload?.name && (
                                        <span className="text-[10px] text-violet-600 dark:text-violet-300 font-semibold">
                                          {prop.payload.name}
                                        </span>
                                      )}
                                      <span className="truncate">{prop.payload?.url}</span>
                                    </div>
                                    <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", permClass)}>
                                      {permLabel}
                                    </Badge>
                                  </div>
                                  {prop.payload?.kind === "webhook_out" && (
                                    <div className="text-[10px] text-blue-600 dark:text-blue-300">
                                      Tipo: Webhook Saliente (webhook_out)
                                    </div>
                                  )}
                                  {prop.payload?.ruleText && (
                                    <div className="text-[10px] text-muted-foreground pt-1 border-t border-border/40">
                                      <span className="text-foreground/70 font-semibold">Directiva:</span> {prop.payload.ruleText}
                                    </div>
                                  )}
                                </div>

                                {testResult && (
                                  <div
                                    className={cn(
                                      "rounded-md p-2.5 text-[11px] font-mono border space-y-1.5",
                                      testResult.ok
                                        ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-950 dark:text-emerald-200"
                                        : "bg-destructive/10 border-destructive/30 text-destructive dark:text-red-300",
                                    )}
                                  >
                                    <div className="flex items-center justify-between font-semibold">
                                      <span>
                                        {testResult.ok ? `🟢 Sandbox HTTP ${testResult.status} OK` : `🔴 Sandbox HTTP ${testResult.status}`}
                                      </span>
                                      <span className="text-[10px] text-muted-foreground">
                                        {testResult.latencyMs}ms
                                      </span>
                                    </div>
                                    {testResult.responseSample && (
                                      <pre className="max-h-28 overflow-y-auto text-[10px] p-2 bg-background/90 rounded border border-border/40 text-foreground whitespace-pre-wrap">
                                        {typeof testResult.responseSample === "object"
                                          ? JSON.stringify(testResult.responseSample, null, 2)
                                          : String(testResult.responseSample)}
                                      </pre>
                                    )}
                                    {testResult.error && (
                                      <p className="text-[10px] text-destructive">{testResult.error}</p>
                                    )}
                                  </div>
                                )}

                                {!isApplied ? (
                                  <div className="flex flex-col sm:flex-row gap-1.5">
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      className="h-7 text-xs gap-1.5 sm:w-auto"
                                      onClick={() => handleTestWebhook(mIdx, pIdx, prop.payload)}
                                      disabled={isTesting || isApplying}
                                    >
                                      {isTesting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                                      {isTesting ? "Probando..." : "Probar en Sandbox"}
                                    </Button>
                                    <Button
                                      size="sm"
                                      className="flex-1 h-7 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs"
                                      onClick={() => handleExecuteAction(mIdx, pIdx, prop)}
                                      disabled={isApplying}
                                    >
                                      {isApplying ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                      ) : (
                                        <Plus className="h-3.5 w-3.5" />
                                      )}
                                      {isApplying ? "Verificando y guardando..." : "Guardar Herramienta Verificada"}
                                    </Button>
                                  </div>
                                ) : (
                                  <div className="flex items-center justify-center gap-1 text-[11px] text-emerald-600 font-medium py-1">
                                    <CheckCircle2 className="h-3.5 w-3.5" /> Herramienta Verificada y Guardada
                                  </div>
                                )}
                              </div>
                            );
                          })()}

                          {/* Default Action for rule, catalog, config */}
                          {prop.type !== "test_webhook" && prop.type !== "webhook" && prop.type !== "tool" && (
                            !isApplied ? (
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
                            )
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
            onClick={() => handleSend("Quiero integrar un webhook externo o API de clientes (para saber vencimientos y cuentas). ¿Cómo lo probamos en el sandbox?")}
          >
            🔌 Integrar API / Webhook
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
        <div className="p-4 border-t border-border bg-background flex flex-col gap-2">
          {guidedReadyPrompt && !loading && (
            <div className="flex items-center justify-between gap-2 rounded-lg border border-violet-500/30 bg-violet-500/10 px-3 py-1.5 text-[11px]">
              <span className="text-violet-700 dark:text-violet-300 font-medium truncate">
                ✨ Guía rápida cargada y lista para iniciar
              </span>
              <Button
                type="button"
                size="sm"
                className="h-6 px-2.5 text-[11px] bg-violet-600 hover:bg-violet-700 text-white shrink-0"
                onClick={() => handleSend(guidedReadyPrompt)}
              >
                Iniciar ahora
              </Button>
            </div>
          )}

          {pendingAttachments.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {pendingAttachments.map((att) => (
                <div
                  key={att.id}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-violet-500/30 bg-violet-500/10 px-2 py-1 text-[11px] text-foreground max-w-[230px]"
                >
                  {att.previewUrl ? (
                    <img
                      src={att.previewUrl}
                      alt={att.fileName}
                      className="h-5 w-5 rounded object-cover shrink-0 border border-border/40"
                    />
                  ) : att.mimeType.startsWith("image/") ? (
                    <ImageIcon className="h-3.5 w-3.5 text-violet-500 shrink-0" />
                  ) : (
                    <FileText className="h-3.5 w-3.5 text-violet-500 shrink-0" />
                  )}
                  <span className="truncate">{att.fileName}</span>
                  <button
                    type="button"
                    onClick={() => removePendingAttachment(att.id)}
                    className="text-muted-foreground hover:text-destructive shrink-0"
                    title="Quitar adjunto"
                    disabled={loading || uploadingAttachments}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {uploadingAttachments && (
            <div className="flex items-center gap-1.5 text-[11px] text-violet-600 dark:text-violet-400">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>Subiendo adjunto(s) seguro(s) a Storage...</span>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept=".png,.jpg,.jpeg,.webp,.pdf,.txt,.csv"
            multiple
            className="hidden"
            onChange={(e) => {
              const selected = e.target.files ? Array.from(e.target.files) : [];
              addCopilotFiles(selected);
              e.target.value = "";
            }}
          />

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-10 w-10 shrink-0 border-border hover:bg-muted"
              onClick={() => fileInputRef.current?.click()}
              disabled={loading || uploadingAttachments || pendingAttachments.length >= MAX_COPILOT_FILES}
              title="Adjuntar captura o lista de precios (PNG, JPG, WEBP, PDF, TXT, CSV)"
            >
              <Paperclip className="h-4 w-4 text-muted-foreground" />
            </Button>
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onPaste={handlePasteFiles}
              placeholder="Pregunta, pega una captura (Ctrl+V) o adjunta una lista de precios..."
              className="min-h-[44px] max-h-32 text-xs resize-none"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  if ((e.nativeEvent as any)?.isComposing) return;
                  e.preventDefault();
                  handleSend();
                }
              }}
            />
            <Button
              size="icon"
              className="h-10 w-10 shrink-0 bg-gradient-to-r from-violet-600 to-indigo-600 text-white hover:from-violet-700 hover:to-indigo-700 shadow-sm"
              onClick={() => handleSend()}
              disabled={(!input.trim() && pendingAttachments.length === 0) || loading || uploadingAttachments}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
          <div className="flex items-center justify-between text-[10px] text-muted-foreground/75 px-1">
            <span>
              <kbd className="font-mono bg-muted/80 px-1 py-0.5 rounded text-[9px] border border-border/50">Enter</kbd> enviar · <kbd className="font-mono bg-muted/80 px-1 py-0.5 rounded text-[9px] border border-border/50">Ctrl+V</kbd> pegar captura
            </span>
            <span className="text-violet-600 dark:text-violet-400 font-medium">Modelo con Razonamiento</span>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
