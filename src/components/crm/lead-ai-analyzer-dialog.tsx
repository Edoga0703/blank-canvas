import { useState, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Loader2, CheckCircle2, AlertTriangle, ArrowRight, Lightbulb, Lock, HelpCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { analyzeLeadNow, applyStageMovement } from "@/lib/crm-lead-analyzer.functions";
import type { LeadAnalysisResult } from "@/lib/crm-stage-meta";
import { useLanguage } from "@/lib/i18n/context";

export function LeadAiAnalyzerDialog({
  cardId,
  leadName,
  currentStageName,
  open,
  onOpenChange,
  initialDiagnostic,
  initialAnalyzedAt,
  onStageChanged,
  onOpenCopilotWithPrompt,
}: {
  cardId: string;
  leadName: string;
  currentStageName: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initialDiagnostic?: LeadAnalysisResult | null;
  initialAnalyzedAt?: string | null;
  onStageChanged?: (newStageId: string) => void;
  onOpenCopilotWithPrompt?: (prompt: string) => void;
}) {
  const { t, formatDate, formatTime } = useLanguage();
  const analyzeFn = useServerFn(analyzeLeadNow);
  const moveFn = useServerFn(applyStageMovement);

  const [loading, setLoading] = useState(false);
  const [moving, setMoving] = useState(false);
  const [result, setResult] = useState<LeadAnalysisResult | null>(initialDiagnostic || null);
  const [analyzedAt, setAnalyzedAt] = useState<string | null>(initialAnalyzedAt || null);
  const [suggestedBlocked, setSuggestedBlocked] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !cardId) return;
    if (initialDiagnostic) {
      setResult(initialDiagnostic);
      setAnalyzedAt(initialAnalyzedAt || null);
      setError(null);
    } else {
      runAnalysis();
    }
  }, [open, cardId, initialDiagnostic, initialAnalyzedAt]);

  async function runAnalysis() {
    setLoading(true);
    setError(null);
    try {
      const res = await analyzeFn({ data: { cardId } });
      if (!res.ok) {
        setError(res.error || t("crm.audit_error_generic", undefined, "No se pudo completar el análisis"));
      } else {
        setResult(res.result);
        setSuggestedBlocked(res.suggestedStageBlocked);
        setAnalyzedAt(res.analyzedAt || new Date().toISOString());
      }
    } catch (err: any) {
      setError(err?.message || t("crm.audit_connection_error", undefined, "Error al conectar con el Analista de IA"));
    } finally {
      setLoading(false);
    }
  }

  async function handleMove() {
    if (!result?.etapa_sugerida_id) return;
    setMoving(true);
    try {
      await moveFn({
        data: {
          cardId,
          stageId: result.etapa_sugerida_id,
          reason: `Movido a "${result.etapa_sugerida_nome}" por recomendación de Auditoría IA`,
        },
      });
      toast.success(t("crm.stage_moved_success", { name: result.etapa_sugerida_nome }, `Lead movido a "${result.etapa_sugerida_nome}"`));
      onStageChanged?.(result.etapa_sugerida_id);
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err?.message || t("crm.stage_move_error", undefined, "No se pudo mover el lead"));
    } finally {
      setMoving(false);
    }
  }

  const intencionColor = {
    POSITIVA: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
    NEGATIVA: "bg-red-500/10 text-red-600 border-red-500/20",
    NEUTRA: "bg-slate-500/10 text-slate-600 border-slate-500/20",
    DUDOSA: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  }[result?.intencao || "NEUTRA"];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md sm:max-w-lg p-0 overflow-hidden border-border bg-card">
        <DialogHeader className="p-5 border-b border-border bg-muted/30">
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-primary/10 text-primary">
              <Sparkles className="size-5" />
            </span>
            <div>
              <DialogTitle className="text-base font-semibold">{t("crm.audit_dialog_title", undefined, "Auditoría y Diagnóstico de Lead")}</DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Lead: <span className="font-medium text-foreground">{leadName || t("common.no_name", undefined, "Sin nombre")}</span> • {t("crm.current_stage", undefined, "Etapa actual")}:{" "}
                <span className="font-medium text-foreground">{currentStageName}</span>
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {loading && (
            <div className="py-12 flex flex-col items-center justify-center gap-3 text-muted-foreground">
              <Loader2 className="size-8 animate-spin text-primary" />
              <p className="text-sm font-medium">{t("crm.audit_in_progress", undefined, "Analizando negociación y mensajes con IA...")}</p>
              <p className="text-xs text-muted-foreground/80 max-w-xs text-center">
                {t("crm.audit_in_progress_desc", undefined, "Leyendo el historial completo para comparar los hechos contra los criterios de las etapas.")}
              </p>
            </div>
          )}

          {error && !loading && (
            <div className="p-4 rounded-xl border border-destructive/30 bg-destructive/5 text-destructive space-y-2">
              <div className="flex items-center gap-2 font-semibold text-sm">
                <AlertTriangle className="size-4" />
                <span>{t("crm.audit_cannot_complete", undefined, "No se pudo completar el análisis")}</span>
              </div>
              <p className="text-xs leading-relaxed text-destructive/90">{error}</p>
              <Button size="sm" variant="outline" onClick={runAnalysis} className="mt-2 text-xs">
                {t("crm.audit_retry", undefined, "Reintentar análisis")}
              </Button>
            </div>
          )}

          {result && !loading && (
            <div className="space-y-4">
              {/* Encabezado de resultado y Timestamp */}
              <div className="flex items-center justify-between gap-2">
                <Badge variant="outline" className={`text-xs px-2.5 py-1 font-bold ${intencionColor}`}>
                  {result.intencao === "POSITIVA" ? "🟢" : result.intencao === "NEGATIVA" ? "🔴" : "🟡"}{" "}
                  {t("crm.intent", undefined, "Intención")}: {result.intencao}
                </Badge>
                {analyzedAt && (
                  <span className="text-[11px] text-muted-foreground">
                    {t("crm.analyzed_at", undefined, "Analizado")}: {formatDate(analyzedAt, { day: "2-digit", month: "2-digit" })} {formatTime(analyzedAt, { hour: "2-digit", minute: "2-digit" })}
                  </span>
                )}
              </div>

              {/* Resumen ejecutivo */}
              <div className="p-3.5 rounded-xl border border-border bg-muted/40 space-y-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  {t("crm.executive_summary", undefined, "Resumen de la Negociación")}
                </span>
                <p className="text-sm text-foreground leading-relaxed">{result.resumo}</p>
              </div>

              {/* Comparación de Etapa Actual vs Sugerida */}
              <div className="p-3.5 rounded-xl border border-border bg-card space-y-3">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  {t("crm.stage_classification", undefined, "Clasificación de Etapa")}
                </span>

                <div className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-muted/50 border border-border/60">
                  <div className="min-w-0">
                    <span className="text-[10px] uppercase text-muted-foreground block">{t("crm.current_stage", undefined, "Etapa Actual")}</span>
                    <span className="text-xs font-semibold text-foreground truncate block">{currentStageName}</span>
                  </div>
                  <ArrowRight className="size-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0 text-right">
                    <span className="text-[10px] uppercase text-primary font-semibold block">{t("crm.suggested_by_ai", undefined, "Sugerida por IA")}</span>
                    <span className="text-xs font-bold text-primary truncate block">{result.etapa_sugerida_nome}</span>
                  </div>
                </div>

                <div className="space-y-1 text-xs">
                  <span className="font-semibold text-muted-foreground">{t("crm.justification", undefined, "Justificación")}:</span>
                  <p className="text-muted-foreground leading-relaxed pl-2 border-l-2 border-primary/40">
                    {result.justificativa}
                  </p>
                </div>

                {suggestedBlocked && (
                  <div className="flex items-start gap-2 p-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-800 text-xs">
                    <Lock className="size-4 shrink-0 text-amber-600 mt-0.5" />
                    <div>
                      <span className="font-semibold block">{t("crm.stage_protected_title", undefined, "Etapa Protegida (Bloqueada para IA)")}</span>
                      <p className="text-[11px] text-amber-800/90 mt-0.5">
                        {t("crm.stage_protected_desc", undefined, "Esta etapa no permite movimientos automáticos sin aprobación. Debes pulsar el botón inferior para confirmar el cambio.")}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Sugerencia de Aprendizaje / Inconsistencia para el Embudo */}
              {result.sugestao_treinamento && (
                <div className="p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/5 space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-700">
                    <Lightbulb className="size-4" />
                    <span>{t("crm.pipeline_training_suggestion", undefined, "Sugerencia para mejorar las reglas de tu embudo")}</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {result.sugestao_treinamento}
                  </p>
                  {onOpenCopilotWithPrompt && (
                    <div className="pt-1 flex justify-end">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-800 dark:text-amber-200 font-semibold gap-1.5"
                        onClick={() => {
                          onOpenChange(false);
                          onOpenCopilotWithPrompt(
                            `Hola Copilot, en la auditoría del lead "${leadName}" la IA generó esta sugerencia para el embudo:\n\n"${result.sugestao_treinamento}"\n\n¿Cómo ajustamos las etapas y criterios para aplicarla?`
                          );
                        }}
                      >
                        <Sparkles className="size-3.5 text-amber-600" />
                        {t("crm.send_to_copilot", undefined, "Gestionar con Copilot del Embudo")}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="p-4 border-t border-border bg-muted/20 flex flex-row items-center justify-between sm:justify-between">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            {t("common.close", undefined, "Cerrar")}
          </Button>

          {result && (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={runAnalysis} disabled={loading || moving} className="gap-1.5">
                <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
                {t("crm.reanalyze_now", undefined, "Re-analizar")}
              </Button>
              {result.etapa_sugerida_nome.toLowerCase() !== currentStageName.toLowerCase() ? (
                <Button
                  size="sm"
                  onClick={handleMove}
                  disabled={moving}
                  className="bg-primary text-primary-foreground font-semibold gap-1.5"
                >
                  {moving ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
                  {t("crm.move_to", { name: result.etapa_sugerida_nome }, `Mover a ${result.etapa_sugerida_nome}`)}
                </Button>
              ) : (
                <Badge variant="outline" className="text-xs text-muted-foreground px-2.5 py-1">
                  {t("crm.already_in_correct_stage", undefined, "Lead ya en la etapa correcta")}
                </Badge>
              )}
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
