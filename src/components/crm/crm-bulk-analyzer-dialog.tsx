import { useState, useEffect, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
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
} from "lucide-react";
import { toast } from "sonner";
import { getStageCardsForBulkFn, processBulkAnalyzeChunkFn } from "@/lib/crm-lead-analyzer.functions";
import type { BulkCardItem, BulkChunkResultItem } from "@/lib/crm-lead-analyzer.server";
import { useLanguage } from "@/lib/i18n/context";

interface CrmBulkAnalyzerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stageId?: string | null;
  stageName?: string | null;
  pipelineId?: string | null;
  onCompleted?: () => void;
}

export function CrmBulkAnalyzerDialog({
  open,
  onOpenChange,
  stageId,
  stageName,
  pipelineId,
  onCompleted,
}: CrmBulkAnalyzerDialogProps) {
  const { t } = useLanguage();
  const getCardsFn = useServerFn(getStageCardsForBulkFn);
  const processChunkFn = useServerFn(processBulkAnalyzeChunkFn);

  // Estado de preparación
  const [loadingCards, setLoadingCards] = useState(false);
  const [cardPool, setCardPool] = useState<BulkCardItem[]>([]);
  const [targetScope, setTargetScope] = useState<"stage" | "pipeline">(stageId ? "stage" : "pipeline");
  const [autoMove, setAutoMove] = useState(true);
  const [sendMetaEvents, setSendMetaEvents] = useState(true);
  const [forceAll, setForceAll] = useState(true);

  // Opciones de privacidad y granularidad de Meta CAPI
  const [includeProductNames, setIncludeProductNames] = useState(false); // Por defecto falso por privacidad comercial
  const [includeValues, setIncludeValues] = useState(true);
  const [includeCustomerNames, setIncludeCustomerNames] = useState(true);
  const [eventPurchase, setEventPurchase] = useState(true);
  const [eventQualified, setEventQualified] = useState(true);
  const [eventLead, setEventLead] = useState(false);

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

  // Cargar lista de cards cuando se abre el modal
  useEffect(() => {
    if (open) {
      void fetchCards();
    } else {
      // Limpiar al cerrar si no está corriendo
      if (status !== "running") {
        setStatus("idle");
        setCurrentIndex(0);
        setRecentLogs([]);
      }
    }
  }, [open, targetScope, stageId, pipelineId, forceAll]);

  async function fetchCards() {
    setLoadingCards(true);
    try {
      const res = await getCardsFn({
        data: {
          stageId: targetScope === "stage" ? stageId : null,
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
  async function handleStart() {
    if (cardPool.length === 0) return;
    setStatus("running");
    isRunningRef.current = true;
    isPausedRef.current = false;
    setCurrentIndex(0);
    setStats({ analyzed: 0, moved: 0, metaEvents: 0, purchases: 0, errors: 0 });
    setRecentLogs([]);

    const CHUNK_SIZE = 5;
    const allCards = [...cardPool];
    let localStats = { analyzed: 0, moved: 0, metaEvents: 0, purchases: 0, errors: 0 };

    for (let i = 0; i < allCards.length; i += CHUNK_SIZE) {
      // Si el usuario pausó
      while (isPausedRef.current && isRunningRef.current) {
        await new Promise((r) => setTimeout(r, 600));
      }

      // Si el usuario canceló
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

        for (const item of res.results) {
          if (!item.ok) localStats.errors++;
          if (item.metaEventSent === "Purchase" || item.toStageName?.toLowerCase().includes("ganado") || item.toStageName?.toLowerCase().includes("activo")) {
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

      // Pequeña pausa de 500ms entre lotes para respiración del servidor y evitar saturación de API
      await new Promise((r) => setTimeout(r, 500));
    }

    isRunningRef.current = false;
    setStatus("completed");
    toast.success("¡Reanálisis masivo completado con éxito!");
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

  return (
    <Dialog open={open} onOpenChange={(o) => {
      if (status === "running") {
        if (confirm("El reanálisis está en curso. ¿Deseas detenerlo y cerrar?")) {
          handleStop();
          onOpenChange(false);
        }
      } else {
        onOpenChange(o);
      }
    }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
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
            Audita conversaciones históricas con el Bot Analista, reclasifica leads automáticamente hacia sus etapas correspondientes y despacha eventos de atribución offline a Meta Ads.
          </DialogDescription>
        </DialogHeader>

        {status === "idle" && (
          <div className="space-y-4 py-2">
            {/* Tarjeta de resumen de alcance */}
            <div className="rounded-xl border border-[color:var(--hairline)] bg-[color:var(--panel-2)]/50 p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Alcance seleccionado
                </span>
                <Badge variant="outline" className="text-xs font-bold text-primary bg-primary/10 border-primary/20">
                  {loadingCards ? (
                    <Loader2 className="size-3 animate-spin mr-1" />
                  ) : (
                    `${cardPool.length} leads listos`
                  )}
                </Badge>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setTargetScope("stage")}
                  disabled={!stageId}
                  className={`text-left p-2.5 rounded-lg border text-xs transition-colors ${
                    targetScope === "stage"
                      ? "border-primary bg-primary/5 text-primary font-bold ring-1 ring-primary/30"
                      : "border-border hover:bg-muted/40 text-foreground"
                  } ${!stageId ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  <span className="block font-semibold">Columna actual</span>
                  <span className="text-[11px] text-muted-foreground font-normal">
                    {stageName ? `"${stageName}"` : "Etapa seleccionada"}
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
                  <span className="block font-semibold">Todo el embudo</span>
                  <span className="text-[11px] text-muted-foreground font-normal">
                    Todas las columnas del pipeline activo
                  </span>
                </button>
              </div>
            </div>

            {/* Opciones de procesamiento */}
            <div className="rounded-xl border border-border p-3.5 space-y-3 text-xs">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block">
                Opciones del proceso
              </span>

              <div className="flex items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <span className="font-semibold block text-foreground">
                    ⚡ Mover de etapa automáticamente según la IA
                  </span>
                  <span className="text-[11px] text-muted-foreground block">
                    Si el análisis sugiere otra etapa y ésta no está bloqueada para humanos, reubica la tarjeta en el Kanban.
                  </span>
                </div>
                <Switch checked={autoMove} onCheckedChange={setAutoMove} />
              </div>

              <div className="border-t border-border/60 pt-2.5 flex items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <span className="font-semibold block text-foreground flex items-center gap-1.5">
                    🎯 Generar y enviar eventos offline a Meta (CAPI)
                    <Badge variant="secondary" className="text-[9px] px-1 py-0 uppercase">Recomendado</Badge>
                  </span>
                  <span className="text-[11px] text-muted-foreground block">
                    Envía conversiones a Meta para entrenar el Pixel y bajar el CAC de tus campañas de anuncios.
                  </span>
                </div>
                <Switch checked={sendMetaEvents} onCheckedChange={setSendMetaEvents} />
              </div>

              {sendMetaEvents && (
                <div className="ml-2 pl-3 border-l-2 border-primary/30 py-1 space-y-2.5 bg-primary/5 rounded-r-lg p-2.5 text-xs">
                  <span className="text-[11px] font-bold text-primary uppercase tracking-wide flex items-center gap-1">
                    🔒 Control de Privacidad de Datos hacia Meta
                  </span>

                  <div className="flex items-center justify-between gap-2">
                    <div className="space-y-0.5">
                      <span className="font-medium text-foreground block text-[11.5px]">
                        Enviar nombres de productos del catálogo (content_name)
                      </span>
                      <span className="text-[10.5px] text-muted-foreground block">
                        Si lo desactivas, Meta nunca sabrá qué cuenta/servicio exacto se vendió o cotizó.
                      </span>
                    </div>
                    <Switch checked={includeProductNames} onCheckedChange={setIncludeProductNames} />
                  </div>

                  <div className="flex items-center justify-between gap-2 border-t border-border/40 pt-2">
                    <div className="space-y-0.5">
                      <span className="font-medium text-foreground block text-[11.5px]">
                        Enviar montos y valores monetarios (value y USD)
                      </span>
                      <span className="text-[10.5px] text-muted-foreground block">
                        Envía el valor económico del pedido para optimizar por ROAS o volumen de compra.
                      </span>
                    </div>
                    <Switch checked={includeValues} onCheckedChange={setIncludeValues} />
                  </div>

                  <div className="flex items-center justify-between gap-2 border-t border-border/40 pt-2">
                    <div className="space-y-0.5">
                      <span className="font-medium text-foreground block text-[11.5px]">
                        Enviar nombres del cliente hasheados (fn y ln)
                      </span>
                      <span className="text-[10.5px] text-muted-foreground block">
                        Si lo desactivas, Meta solo hará el match con el teléfono (ph) en SHA-256.
                      </span>
                    </div>
                    <Switch checked={includeCustomerNames} onCheckedChange={setIncludeCustomerNames} />
                  </div>

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
                        <span>🏆 Purchase (Ventas)</span>
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={eventQualified}
                          onChange={(e) => setEventQualified(e.target.checked)}
                          className="rounded text-primary focus:ring-primary size-3.5"
                        />
                        <span>⭐ QualifiedLead (Calificados)</span>
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={eventLead}
                          onChange={(e) => setEventLead(e.target.checked)}
                          className="rounded text-primary focus:ring-primary size-3.5"
                        />
                        <span>👤 Lead (Cualquier contacto)</span>
                      </label>
                    </div>
                  </div>
                </div>
              )}

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
                  {status === "running" ? "Procesando en segundo plano..." : status === "paused" ? "Pausado" : "¡Completado!"}
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
                onClick={handleStart}
                disabled={loadingCards || cardPool.length === 0}
                className="gap-2 font-bold"
              >
                <Sparkles className="size-4" />
                Iniciar Reanálisis ({cardPool.length} leads)
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
