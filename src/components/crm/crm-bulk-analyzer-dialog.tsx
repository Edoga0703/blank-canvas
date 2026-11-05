import { useState, useEffect, useRef, useMemo } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Sparkles,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Play,
  Pause,
  StopCircle,
  ArrowRight,
  TrendingUp,
  Share2,
  DollarSign,
  Users,
  Eye,
  EyeOff,
  ShieldCheck,
  Layers,
  Filter,
  Cloud,
} from "lucide-react";
import { toast } from "sonner";
import { getStageCardsForBulkFn, processBulkAnalyzeChunkFn, startBackgroundReanalysisFn } from "@/lib/crm-lead-analyzer.functions";
import type { BulkCardItem, BulkChunkResultItem } from "@/lib/crm-lead-analyzer.server";
import { useLanguage } from "@/lib/i18n/context";

export interface StageOption {
  id: string;
  nome: string;
  cor?: string;
  count?: number;
}

export interface CrmBulkAnalyzerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialStageId?: string | null;
  pipelineId?: string | null;
  pipelineName?: string | null;
  stages?: StageOption[];
  onCompleted?: () => void;
}

export function CrmBulkAnalyzerDialog({
  open,
  onOpenChange,
  initialStageId,
  pipelineId,
  pipelineName,
  stages = [],
  onCompleted,
}: CrmBulkAnalyzerDialogProps) {
  const { t } = useLanguage();
  const getCardsFn = useServerFn(getStageCardsForBulkFn);
  const processChunkFn = useServerFn(processBulkAnalyzeChunkFn);
  const startBackgroundFn = useServerFn(startBackgroundReanalysisFn);
  const [startingServerWorker, setStartingServerWorker] = useState(false);

  // Alcance del análisis: "stage" (una sola etapa) o "pipeline" (todas las etapas)
  const [targetScope, setTargetScope] = useState<"stage" | "pipeline">(initialStageId ? "stage" : "pipeline");
  const [selectedStageId, setSelectedStageId] = useState<string>(
    initialStageId || (stages.length > 0 ? stages[0].id : "")
  );

  // Sincronizar etapa inicial y alcance al abrir
  useEffect(() => {
    if (open) {
      if (initialStageId) {
        setSelectedStageId(initialStageId);
        setTargetScope("stage");
      } else {
        setTargetScope("pipeline");
        if (stages.length > 0 && !selectedStageId) {
          setSelectedStageId(stages[0].id);
        }
      }
    }
  }, [open, initialStageId, stages]);

  // Estado de preparación
  const [loadingCards, setLoadingCards] = useState(false);
  const [cardPool, setCardPool] = useState<BulkCardItem[]>([]);
  const [autoMove, setAutoMove] = useState(true);
  const [sendMetaEvents, setSendMetaEvents] = useState(true);
  const [forceAll, setForceAll] = useState(true);

  // Opciones de privacidad y granularidad de Meta CAPI
  const [includeProductNames, setIncludeProductNames] = useState(false); // Por defecto FALSO por privacidad
  const [includeValues, setIncludeValues] = useState(true);
  const [includeCustomerNames, setIncludeCustomerNames] = useState(true);
  const [eventPurchase, setEventPurchase] = useState(true);
  const [eventQualified, setEventQualified] = useState(true);
  const [eventLead, setEventLead] = useState(false);
  const [showPayloadPreview, setShowPayloadPreview] = useState(false);

  // Estado de ejecución
  const [status, setStatus] = useState<"idle" | "running" | "paused" | "completed">("idle");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [stats, setStats] = useState({
    analyzed: 0,
    moved: 0,
    metaEvents: 0,
    purchases: 0,
    errors: 0,
  });
  const [recentLogs, setRecentLogs] = useState<BulkChunkResultItem[]>([]);

  // Referencias para control de pausa / abortar
  const isRunningRef = useRef(false);
  const isPausedRef = useRef(false);

  // Cargar lista de cards cuando cambia el alcance o la etapa
  useEffect(() => {
    if (open) {
      void fetchCards();
    } else {
      if (status !== "running") {
        setStatus("idle");
        setCurrentIndex(0);
        setRecentLogs([]);
      }
    }
  }, [open, targetScope, selectedStageId, pipelineId, forceAll]);

  async function fetchCards() {
    setLoadingCards(true);
    try {
      const activeStageId = targetScope === "stage" ? selectedStageId : null;
      const res = await getCardsFn({
        data: {
          stageId: activeStageId,
          pipelineId: targetScope === "pipeline" ? pipelineId : null,
          forceAll,
        },
      });
      setCardPool(res.cards || []);
    } catch (err: any) {
      toast.error(err?.message || "No se pudo cargar la lista de leads");
    } finally {
      setLoadingCards(false);
    }
  }

  // Iniciar proceso
  async function handleStartOnServer() {
    if (cardPool.length === 0) return;
    setStartingServerWorker(true);
    try {
      const allowedMetaEvents: string[] = [];
      if (eventPurchase) allowedMetaEvents.push("Purchase");
      if (eventQualified) allowedMetaEvents.push("QualifiedLead");
      if (eventLead) allowedMetaEvents.push("Lead");

      const activeStageId = targetScope === "stage" ? selectedStageId : null;
      const res = await startBackgroundFn({
        data: {
          stageId: activeStageId,
          pipelineId: targetScope === "pipeline" ? pipelineId : null,
          forceAll,
          sendMetaEvents,
          autoMove,
          allowedMetaEvents,
        },
      });

      if (res.ok) {
        toast.success(res.message, { duration: 6000 });
        onOpenChange(false);
        if (onCompleted) onCompleted();
      } else {
        toast.error(res.message || "No se pudo iniciar la tarea en segundo plano");
      }
    } catch (err: any) {
      toast.error(err?.message || "Error al comunicarse con el servidor");
    } finally {
      setStartingServerWorker(false);
    }
  }

  async function handleStart() {
    if (cardPool.length === 0) return;
    setStatus("running");
    isRunningRef.current = true;
    isPausedRef.current = false;
    setCurrentIndex(0);
    setStats({ analyzed: 0, moved: 0, metaEvents: 0, purchases: 0, errors: 0 });
    setRecentLogs([]);

    const CHUNK_SIZE = 4;
    const allCards = [...cardPool];
    let localStats = { analyzed: 0, moved: 0, metaEvents: 0, purchases: 0, errors: 0 };

    for (let i = 0; i < allCards.length; i += CHUNK_SIZE) {
      while (isPausedRef.current && isRunningRef.current) {
        await new Promise((r) => setTimeout(r, 600));
      }

      if (!isRunningRef.current) break;

      const chunk = allCards.slice(i, i + CHUNK_SIZE);
      const chunkIds = chunk.map((c) => c.id);

      try {
        const allowedMetaEvents: string[] = [];
        if (eventPurchase) allowedMetaEvents.push("Purchase");
        if (eventQualified) allowedMetaEvents.push("QualifiedLead");
        if (eventLead) allowedMetaEvents.push("Lead");

        const res = await processChunkFn({
          data: {
            cardIds: chunkIds,
            sendMetaEvents,
            autoMove,
            includeProductNames,
            includeValues,
            includeCustomerNames,
            allowedMetaEvents,
          },
        });

        localStats.analyzed += res.processed;
        localStats.moved += res.movedCount;
        localStats.metaEvents += res.metaSentCount;

        // Pausa de 350ms entre lotes para suavizar la UI y evitar saturación en Drael
        await new Promise((r) => setTimeout(r, 350));

        for (const item of res.results) {
          if (!item.ok) localStats.errors++;
          if (
            item.metaEventSent === "Purchase" ||
            item.toStageName?.toLowerCase().includes("ganado") ||
            item.toStageName?.toLowerCase().includes("activo")
          ) {
            localStats.purchases++;
          }
        }

        setStats({ ...localStats });
        setCurrentIndex(Math.min(i + CHUNK_SIZE, allCards.length));
        setRecentLogs((prev) => [...res.results, ...prev].slice(0, 8));
      } catch (err) {
        localStats.errors += chunk.length;
        setStats({ ...localStats });
      }

      await new Promise((r) => setTimeout(r, 500));
    }

    isRunningRef.current = false;
    setStatus("completed");
    toast.success("¡Reanálisis completado con éxito!");
    if (onCompleted) onCompleted();
  }

  function handlePauseResume() {
    if (isPausedRef.current) {
      isPausedRef.current = false;
      setStatus("running");
    } else {
      isPausedRef.current = true;
      setStatus("paused");
    }
  }

  function handleStop() {
    isRunningRef.current = false;
    isPausedRef.current = false;
    setStatus("completed");
    if (onCompleted) onCompleted();
  }

  const progressPercent = cardPool.length > 0 ? Math.round((currentIndex / cardPool.length) * 100) : 0;

  // Nombre de la etapa seleccionada
  const activeStageObject = stages.find((s) => s.id === selectedStageId);
  const activeStageLabel = activeStageObject?.nome || "Etapa seleccionada";

  // Previsualización interactiva del JSON que recibirá Meta
  const sampleMetaPayload = useMemo(() => {
    const payload: Record<string, any> = {
      event_name: eventPurchase ? "Purchase" : eventQualified ? "QualifiedLead" : "Lead",
      event_time: 1730489500,
      action_source: "business_messaging",
      user_data: {
        ph: ["9b71d224bd62f3785d96d46ad3ea3d73319bfbc2890caadae2dff72519673ca72 (SHA-256)"],
        country: ["c584795e0c5b52a1... (SHA-256)"],
        ...(includeCustomerNames
          ? {
              fn: ["2c6a4613... (SHA-256)"],
              ln: ["4d8f28a1... (SHA-256)"],
            }
          : {}),
      },
      custom_data: {
        currency: "USD",
        event_source: "crm",
        lead_event_source: "Capiconversa CRM",
        ...(includeValues ? { value: 6.0 } : {}),
        ...(includeProductNames ? { content_name: "Disney+ Premium (Catálogo)" } : {}),
      },
    };
    return payload;
  }, [includeProductNames, includeValues, includeCustomerNames, eventPurchase, eventQualified]);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (status === "running") {
          if (confirm("El reanálisis está en curso. ¿Deseas detenerlo y cerrar?")) {
            handleStop();
            onOpenChange(false);
          }
        } else {
          onOpenChange(o);
        }
      }}
    >
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2 text-primary">
            <span className="grid place-items-center size-8 rounded-xl bg-primary/10 text-primary">
              <Sparkles className="size-4" />
            </span>
            <DialogTitle className="text-lg font-bold">
              Reanálisis Masivo con IA & Tracking Meta (CAPI)
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
            Audita leads contra las reglas y catálogo del embudo, reclasifícalos automáticamente hacia sus etapas correspondientes y envía conversiones offline personalizadas a Meta Ads.
          </DialogDescription>
        </DialogHeader>

        {status === "idle" && (
          <div className="space-y-4 py-2">
            {/* 1. SELECCIÓN DE ALCANCE: UNA SOLA ETAPA VS TODO EL EMBUDO */}
            <div className="rounded-xl border border-[color:var(--hairline)] bg-[color:var(--panel-2)]/60 p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-foreground uppercase tracking-wide flex items-center gap-1.5">
                  <Filter className="size-3.5 text-primary" />
                  Alcance del Reanálisis
                </span>
                <Badge variant="outline" className="text-xs font-bold text-primary bg-primary/10 border-primary/20">
                  {loadingCards ? (
                    <Loader2 className="size-3 animate-spin mr-1" />
                  ) : (
                    `${cardPool.length} leads en cola`
                  )}
                </Badge>
              </div>

              {/* Botones de conmutación de alcance */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setTargetScope("stage")}
                  className={`text-left p-2.5 rounded-lg border text-xs transition-colors ${
                    targetScope === "stage"
                      ? "border-primary bg-primary/5 text-primary font-bold ring-1 ring-primary/30"
                      : "border-border hover:bg-muted/40 text-foreground"
                  }`}
                >
                  <span className="flex items-center gap-1.5 font-bold">
                    <Filter className="size-3.5" /> Una Sola Etapa
                  </span>
                  <span className="text-[11px] text-muted-foreground font-normal block mt-0.5 truncate">
                    Re-analizar solo una columna
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setTargetScope("pipeline")}
                  className={`text-left p-2.5 rounded-lg border text-xs transition-colors ${
                    targetScope === "pipeline"
                      ? "border-primary bg-primary/5 text-primary font-bold ring-1 ring-primary/30"
                      : "border-border hover:bg-muted/40 text-foreground"
                  }`}
                >
                  <span className="flex items-center gap-1.5 font-bold">
                    <Layers className="size-3.5" /> Todo el Embudo
                  </span>
                  <span className="text-[11px] text-muted-foreground font-normal block mt-0.5 truncate">
                    Auditar todas las columnas juntas
                  </span>
                </button>
              </div>

              {/* Si eligió UNA SOLA ETAPA: Mostrar selector desplegable de etapas */}
              {targetScope === "stage" && stages.length > 0 && (
                <div className="pt-1 space-y-1">
                  <label className="text-[11px] font-semibold text-muted-foreground block">
                    Elige la etapa a auditar:
                  </label>
                  <Select value={selectedStageId} onValueChange={setSelectedStageId}>
                    <SelectTrigger className="w-full text-xs h-9 bg-card">
                      <SelectValue placeholder="Selecciona una etapa" />
                    </SelectTrigger>
                    <SelectContent>
                      {stages.map((st) => (
                        <SelectItem key={st.id} value={st.id} className="text-xs">
                          <div className="flex items-center justify-between gap-3 w-full">
                            <span className="flex items-center gap-1.5">
                              {st.cor && (
                                <span
                                  className="size-2 rounded-full shrink-0"
                                  style={{ backgroundColor: st.cor }}
                                />
                              )}
                              <span className="font-medium">{st.nome}</span>
                            </span>
                            {st.count !== undefined && (
                              <span className="text-[10px] text-muted-foreground ml-auto tabular-nums">
                                ({st.count} leads)
                              </span>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {/* 2. OPCIONES DE MOVIMIENTO */}
            <div className="rounded-xl border border-border p-3.5 space-y-3 text-xs">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block">
                Comportamiento en el Tablero
              </span>

              <div className="flex items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <span className="font-semibold block text-foreground">
                    ⚡ Mover de etapa automáticamente según la IA
                  </span>
                  <span className="text-[11px] text-muted-foreground block">
                    Si el análisis concluye que el lead debe ir a otra etapa (y no está bloqueada para humanos), reubica la tarjeta en el tablero.
                  </span>
                </div>
                <Switch checked={autoMove} onCheckedChange={setAutoMove} />
              </div>

              <div className="border-t border-border/60 pt-2.5 flex items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <span className="font-semibold block text-foreground">
                    🔄 Re-analizar leads que ya tenían diagnóstico previo
                  </span>
                  <span className="text-[11px] text-muted-foreground block">
                    Aplica las reglas y criterios vigentes del embudo a todos los leads sin excepción.
                  </span>
                </div>
                <Switch checked={forceAll} onCheckedChange={setForceAll} />
              </div>
            </div>

            {/* 3. CONTROL DE TRACKING OFFLINE HACIA META (CAPI) */}
            <div className="rounded-xl border border-border p-3.5 space-y-3 text-xs">
              <div className="flex items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <span className="font-semibold block text-foreground flex items-center gap-1.5">
                    🎯 Generar y enviar eventos offline a Meta (CAPI)
                    <Badge variant="secondary" className="text-[9px] px-1 py-0 uppercase">Recomendado</Badge>
                  </span>
                  <span className="text-[11px] text-muted-foreground block">
                    Envía conversiones offline a Meta para entrenar el Pixel y bajar el Costo por Adquisición (CAC).
                  </span>
                </div>
                <Switch checked={sendMetaEvents} onCheckedChange={setSendMetaEvents} />
              </div>

              {/* Sub-opciones de Privacidad Granular hacia Meta */}
              {sendMetaEvents && (
                <div className="mt-2 pl-3 border-l-2 border-primary/40 py-1 space-y-3 bg-primary/5 rounded-r-xl p-3 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-primary uppercase tracking-wide flex items-center gap-1">
                      <ShieldCheck className="size-3.5 text-primary" />
                      Control de Privacidad y Datos Hacia Meta
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowPayloadPreview(!showPayloadPreview)}
                      className="text-[11px] font-bold text-primary hover:underline flex items-center gap-1"
                    >
                      {showPayloadPreview ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
                      {showPayloadPreview ? "Ocultar vista previa" : "Ver qué recibirá Meta"}
                    </button>
                  </div>

                  {/* Switch 1: Nombres de catálogo (OFF por defecto) */}
                  <div className="flex items-center justify-between gap-2 border-t border-border/40 pt-2">
                    <div className="space-y-0.5">
                      <span className="font-medium text-foreground block text-[11.5px]">
                        Enviar nombres de productos del catálogo (content_name)
                      </span>
                      <span className="text-[10.5px] text-muted-foreground block">
                        <b>Desactivado por defecto.</b> Si está apagado, Meta NUNCA sabrá qué producto o cuenta vendiste ni qué cotizó el cliente.
                      </span>
                    </div>
                    <Switch checked={includeProductNames} onCheckedChange={setIncludeProductNames} />
                  </div>

                  {/* Switch 2: Montos monetarios */}
                  <div className="flex items-center justify-between gap-2 border-t border-border/40 pt-2">
                    <div className="space-y-0.5">
                      <span className="font-medium text-foreground block text-[11.5px]">
                        Enviar montos y valores monetarios (value y USD)
                      </span>
                      <span className="text-[10.5px] text-muted-foreground block">
                        Envía el valor económico identificado para que Meta optimice por ROAS. Apágalo si prefieres ocultar los montos.
                      </span>
                    </div>
                    <Switch checked={includeValues} onCheckedChange={setIncludeValues} />
                  </div>

                  {/* Switch 3: Nombres de clientes */}
                  <div className="flex items-center justify-between gap-2 border-t border-border/40 pt-2">
                    <div className="space-y-0.5">
                      <span className="font-medium text-foreground block text-[11.5px]">
                        Enviar nombres de cliente hasheados (fn y ln)
                      </span>
                      <span className="text-[10.5px] text-muted-foreground block">
                        Si lo apagas, el match con Meta se hace estrictamente con el teléfono hasheado en SHA-256.
                      </span>
                    </div>
                    <Switch checked={includeCustomerNames} onCheckedChange={setIncludeCustomerNames} />
                  </div>

                  {/* Checkbox de Eventos Permitidos */}
                  <div className="border-t border-border/40 pt-2 space-y-1.5">
                    <span className="text-[10.5px] font-semibold text-foreground block">
                      Tipos de eventos a despachar:
                    </span>
                    <div className="flex flex-wrap gap-3 text-[11px]">
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={eventPurchase}
                          onChange={(e) => setEventPurchase(e.target.checked)}
                          className="rounded text-primary focus:ring-primary size-3.5"
                        />
                        <span className="font-medium">🏆 Purchase (Ventas ganadas)</span>
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={eventQualified}
                          onChange={(e) => setEventQualified(e.target.checked)}
                          className="rounded text-primary focus:ring-primary size-3.5"
                        />
                        <span className="font-medium">⭐ QualifiedLead (Calificados)</span>
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={eventLead}
                          onChange={(e) => setEventLead(e.target.checked)}
                          className="rounded text-primary focus:ring-primary size-3.5"
                        />
                        <span className="font-medium">👤 Lead (Contactos iniciales)</span>
                      </label>
                    </div>
                  </div>

                  {/* Vista previa en vivo del JSON que viajará a Meta */}
                  {showPayloadPreview && (
                    <div className="mt-2 p-2.5 rounded-lg bg-slate-950 text-slate-100 font-mono text-[10.5px] space-y-1 overflow-x-auto border border-slate-800">
                      <div className="flex items-center justify-between text-slate-400 text-[9.5px] border-b border-slate-800 pb-1 mb-1">
                        <span>VISTA PREVIA DEL PAYLOAD EXACTO QUE RECIBIRÁ META:</span>
                        {!includeProductNames && (
                          <span className="text-emerald-400 font-bold">✓ Nombres de productos EXCLUIDOS</span>
                        )}
                      </div>
                      <pre>{JSON.stringify(sampleMetaPayload, null, 2)}</pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {(status === "running" || status === "paused" || status === "completed") && (
          <div className="space-y-4 py-2">
            {/* Barra de progreso */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold flex items-center gap-1.5">
                  {status === "running" && <Loader2 className="size-3.5 animate-spin text-primary" />}
                  {status === "paused" && <Pause className="size-3.5 text-amber-500" />}
                  {status === "completed" && <CheckCircle2 className="size-3.5 text-emerald-600" />}
                  {status === "running"
                    ? `Analizando ${targetScope === "stage" ? `etapa "${activeStageLabel}"` : "todo el embudo"}...`
                    : status === "paused"
                    ? "Pausado"
                    : "¡Reanálisis Completado!"}
                </span>
                <span className="font-bold tabular-nums text-muted-foreground">
                  {currentIndex} / {cardPool.length} ({progressPercent}%)
                </span>
              </div>
              <Progress value={progressPercent} className="h-2.5" />
            </div>

            {/* Métricas en vivo (Grid) */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
              <div className="p-2.5 rounded-xl border border-border bg-card">
                <span className="flex items-center justify-center gap-1 text-[11px] text-muted-foreground font-medium">
                  <Users className="size-3.5 text-primary" /> Analizados
                </span>
                <span className="text-xl font-extrabold tabular-nums text-foreground block mt-0.5">
                  {stats.analyzed}
                </span>
              </div>

              <div className="p-2.5 rounded-xl border border-emerald-500/20 bg-emerald-500/5">
                <span className="flex items-center justify-center gap-1 text-[11px] text-emerald-700 font-medium">
                  <TrendingUp className="size-3.5" /> Movidos
                </span>
                <span className="text-xl font-extrabold tabular-nums text-emerald-700 block mt-0.5">
                  {stats.moved}
                </span>
              </div>

              <div className="p-2.5 rounded-xl border border-blue-500/20 bg-blue-500/5">
                <span className="flex items-center justify-center gap-1 text-[11px] text-blue-700 font-medium">
                  <Share2 className="size-3.5" /> Meta CAPI
                </span>
                <span className="text-xl font-extrabold tabular-nums text-blue-700 block mt-0.5">
                  {stats.metaEvents}
                </span>
              </div>

              <div className="p-2.5 rounded-xl border border-amber-500/20 bg-amber-500/5">
                <span className="flex items-center justify-center gap-1 text-[11px] text-amber-700 font-medium">
                  <DollarSign className="size-3.5" /> Ganados/Activos
                </span>
                <span className="text-xl font-extrabold tabular-nums text-amber-700 block mt-0.5">
                  {stats.purchases}
                </span>
              </div>
            </div>

            {/* Feed de acciones en vivo */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide block">
                Últimos movimientos detectados
              </span>
              <div className="rounded-xl border border-border bg-muted/20 p-2 space-y-1.5 max-h-48 overflow-y-auto text-xs">
                {recentLogs.length === 0 ? (
                  <span className="text-muted-foreground text-[11px] italic block text-center py-2">
                    Iniciando análisis de leads...
                  </span>
                ) : (
                  recentLogs.map((log) => (
                    <div
                      key={log.cardId}
                      className="flex items-center justify-between gap-2 p-1.5 rounded-lg bg-card border border-border/50 text-[11.5px]"
                    >
                      <span className="font-semibold text-foreground truncate max-w-[140px] sm:max-w-[180px]">
                        {log.leadName}
                      </span>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {log.moved ? (
                          <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">
                            → {log.toStageName}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] text-muted-foreground">
                            Mantener en {log.toStageName || "etapa"}
                          </Badge>
                        )}

                        {log.metaEventSent && (
                          <Badge variant="outline" className="text-[9px] bg-blue-50 text-blue-700 border-blue-200 font-bold">
                            Meta: {log.metaEventSent}
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t border-border">
          {status === "idle" && (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={loadingCards}>
                Cancelar
              </Button>
              <Button
                variant="outline"
                onClick={handleStartOnServer}
                disabled={loadingCards || cardPool.length === 0 || startingServerWorker}
                className="gap-2 font-bold border-primary/40 text-primary hover:bg-primary/5"
                title="El servidor ejecutará el análisis en la nube de forma autónoma. Puedes cerrar esta ventana inmediatamente."
              >
                {startingServerWorker ? <Loader2 className="size-4 animate-spin" /> : <Cloud className="size-4" />}
                Iniciar en Servidor (Subtarea)
              </Button>
              <Button
                onClick={handleStart}
                disabled={loadingCards || cardPool.length === 0 || startingServerWorker}
                className="gap-2 font-bold"
                title="Supervisar el proceso en vivo en esta ventana"
              >
                <Sparkles className="size-4" />
                Iniciar en Navegador ({cardPool.length} leads)
              </Button>
            </>
          )}

          {(status === "running" || status === "paused") && (
            <>
              <Button variant="outline" size="sm" onClick={handlePauseResume} className="gap-1.5">
                {status === "paused" ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
                {status === "paused" ? "Continuar" : "Pausar"}
              </Button>
              <Button variant="destructive" size="sm" onClick={handleStop} className="gap-1.5">
                <StopCircle className="size-3.5" />
                Detener
              </Button>
            </>
          )}

          {status === "completed" && (
            <Button
              className="w-full font-bold"
              onClick={() => {
                onOpenChange(false);
                if (onCompleted) onCompleted();
              }}
            >
              <CheckCircle2 className="size-4 mr-2" />
              Ver Tablero Actualizado
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
