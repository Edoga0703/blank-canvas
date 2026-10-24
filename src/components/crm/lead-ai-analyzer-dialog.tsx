import { useState, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Loader2, CheckCircle2, AlertTriangle, ArrowRight, Lightbulb, Lock, HelpCircle } from "lucide-react";
import { toast } from "sonner";
import { analyzeLeadNow, applyStageMovement, type LeadAnalysisResult } from "@/lib/crm-lead-analyzer.server";

export function LeadAiAnalyzerDialog({
  cardId,
  leadName,
  currentStageName,
  open,
  onOpenChange,
  onStageChanged,
}: {
  cardId: string;
  leadName: string;
  currentStageName: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onStageChanged?: (newStageId: string) => void;
}) {
  const analyzeFn = useServerFn(analyzeLeadNow);
  const moveFn = useServerFn(applyStageMovement);

  const [loading, setLoading] = useState(false);
  const [moving, setMoving] = useState(false);
  const [result, setResult] = useState<LeadAnalysisResult | null>(null);
  const [suggestedBlocked, setSuggestedBlocked] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !cardId) return;
    runAnalysis();
  }, [open, cardId]);

  async function runAnalysis() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await analyzeFn({ data: { cardId } });
      if (!res.ok) {
        setError(res.error || "No se pudo completar el análisis");
      } else {
        setResult(res.result);
        setSuggestedBlocked(res.suggestedStageBlocked);
      }
    } catch (err: any) {
      setError(err?.message || "Error al conectar con el Analista de IA");
    } finally {
      setLoading(false);
    }
  }

  async function handleMove() {
    if (!result?.etapa_sugerida_id) return;
    setMoving(true);
    try {
      await moveFn({ data: { cardId, stageId: result.etapa_sugerida_id } });
      toast.success(`Lead movido a "${result.etapa_sugerida_nome}"`);
      onStageChanged?.(result.etapa_sugerida_id);
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err?.message || "No se pudo mover el lead");
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
              <DialogTitle className="text-base font-semibold">Auditoría y Diagnóstico de Lead</DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Lead: <span className="font-medium text-foreground">{leadName || "Sin nombre"}</span> • Etapa actual:{" "}
                <span className="font-medium text-foreground">{currentStageName}</span>
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {loading && (
            <div className="py-12 flex flex-col items-center justify-center text-center space-y-3">
              <Loader2 className="size-8 text-primary animate-spin" />
              <div className="space-y-1">
                <p className="text-sm font-medium">Analizando historial de la negociación...</p>
                <p className="text-xs text-muted-foreground">
                  Leyendo hasta 100 mensajes y contrastando con los criterios del embudo.
                </p>
              </div>
            </div>
          )}

          {error && !loading && (
            <div className="p-4 rounded-xl border border-destructive/20 bg-destructive/5 text-destructive space-y-2">
              <div className="flex items-center gap-2 font-medium text-sm">
                <AlertTriangle className="size-4 shrink-0" />
                <span>No fue posible analizar la conversación</span>
              </div>
              <p className="text-xs opacity-90">{error}</p>
              <Button size="sm" variant="outline" onClick={runAnalysis} className="mt-2 text-xs">
                Reintentar análisis
              </Button>
            </div>
          )}

          {result && !loading && (
            <div className="space-y-4 animate-in fade-in duration-200">
              {/* Badge de Intención y Calificación */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium text-muted-foreground">Intención del cliente:</span>
                  <Badge variant="outline" className={`font-semibold text-xs px-2.5 py-0.5 ${intencionColor}`}>
                    {result.intencao}
                  </Badge>
                </div>
                {result.calificado && (
                  <Badge className="bg-primary/10 text-primary border-primary/20 text-[11px] font-medium gap-1">
                    <CheckCircle2 className="size-3" /> Lead Calificado
                  </Badge>
                )}
              </div>

              {/* Resumen de la Negociación */}
              <div className="p-3.5 rounded-xl border border-border bg-background space-y-1.5 shadow-sm">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Resumen Ejecutivo
                </span>
                <p className="text-[13.5px] leading-relaxed text-foreground">{result.resumo}</p>
              </div>

              {/* Recomendación de Etapa */}
              <div className="p-4 rounded-xl border border-primary/20 bg-primary/5 space-y-3">
                <span className="text-xs font-semibold text-primary uppercase tracking-wider block">
                  Recomendación de Movimiento
                </span>

                <div className="flex items-center gap-2 text-sm font-medium">
                  <span className="px-2.5 py-1 rounded-md bg-muted text-muted-foreground border border-border">
                    {currentStageName}
                  </span>
                  <ArrowRight className="size-4 text-primary shrink-0" />
                  <span className="px-2.5 py-1 rounded-md bg-primary text-primary-foreground font-semibold shadow-sm">
                    {result.etapa_sugerida_nome}
                  </span>
                </div>

                <div className="text-xs text-muted-foreground leading-relaxed pt-1">
                  <span className="font-semibold text-foreground">Criterio evaluado: </span>
                  {result.justificativa}
                </div>

                {suggestedBlocked && (
                  <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-700 text-xs">
                    <Lock className="size-3.5 shrink-0 mt-0.5" />
                    <span>
                      Esta etapa está protegida como <strong>exclusiva para decisión humana</strong>. Puedes moverla
                      haciendo clic en el botón de abajo.
                    </span>
                  </div>
                )}
              </div>

              {/* Sugerencia de Aprendizaje / Inconsistencia para el Embudo */}
              {result.sugestao_treinamento && (
                <div className="p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/5 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-700">
                    <Lightbulb className="size-4" />
                    <span>Sugerencia para mejorar las reglas de tu embudo</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {result.sugestao_treinamento}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="p-4 border-t border-border bg-muted/20 flex flex-row items-center justify-between sm:justify-between">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>

          {result && (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={runAnalysis} disabled={loading || moving}>
                Re-analizar
              </Button>
              {result.etapa_sugerida_nome.toLowerCase() !== currentStageName.toLowerCase() ? (
                <Button
                  size="sm"
                  onClick={handleMove}
                  disabled={moving}
                  className="bg-primary text-primary-foreground font-semibold gap-1.5"
                >
                  {moving ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
                  Mover a {result.etapa_sugerida_nome}
                </Button>
              ) : (
                <Badge variant="outline" className="text-xs text-muted-foreground px-2.5 py-1">
                  Lead ya en la etapa correcta
                </Badge>
              )}
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
