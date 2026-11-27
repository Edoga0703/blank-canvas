import React, { useEffect, useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { History, RotateCcw, Loader2 } from "lucide-react";
import { listAgentVersions, rollbackAgentVersion } from "@/lib/agent-ai.functions";
import { useLanguage } from "@/lib/i18n/context";

interface AgentVersionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agentId?: string | null;
  activeVersion?: number | null;
  onRestored: (restoredConfig: any) => void;
}

export function AgentVersionsDialog({
  open,
  onOpenChange,
  agentId,
  activeVersion,
  onRestored,
}: AgentVersionsDialogProps) {
  const { language } = useLanguage();
  const isEs = language === "es";

  const fetchVersions = useServerFn(listAgentVersions);
  const doRollback = useServerFn(rollbackAgentVersion);

  const [loading, setLoading] = useState(false);
  const [versions, setVersions] = useState<any[]>([]);
  const [confirmTarget, setConfirmTarget] = useState<any | null>(null);
  const [restoring, setRestoring] = useState(false);

  const load = useCallback(async () => {
    if (!open || !agentId) return;
    setLoading(true);
    try {
      const res: any = await fetchVersions({ data: { agentId } });
      setVersions(res?.versions ?? []);
    } catch (err: any) {
      toast.error(err?.message || (isEs ? "Error cargando versiones" : "Erro ao carregar versões"));
    } finally {
      setLoading(false);
    }
  }, [open, agentId, fetchVersions, isEs]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleConfirmRollback = async () => {
    if (!agentId || !confirmTarget) return;
    setRestoring(true);
    try {
      const res: any = await doRollback({ data: { agentId, versionId: confirmTarget.id } });
      toast.success(
        isEs
          ? `Versión v${confirmTarget.version_number} restaurada correctamente.`
          : `Versão v${confirmTarget.version_number} restaurada com sucesso.`,
      );
      if (res?.config) onRestored(res.config);
      setConfirmTarget(null);
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err?.message || (isEs ? "Error al restaurar" : "Erro ao restaurar"));
    } finally {
      setRestoring(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <History className="size-4 text-primary" />
              {isEs ? "Versiones y Rollback del Agente" : "Versões e Rollback do Agente"}
              {activeVersion ? (
                <Badge variant="outline" className="text-[10px] font-mono">
                  v{activeVersion}
                </Badge>
              ) : null}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {isEs
                ? "Cada guardado genera automáticamente un punto de restauración (hasta 25 versiones recientes)."
                : "Cada salvamento gera automaticamente um ponto de restauração (até 25 versões)."}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {loading ? (
              <div className="py-12 flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                {isEs ? "Cargando versiones..." : "Carregando versões..."}
              </div>
            ) : versions.length === 0 ? (
              <div className="py-10 text-center text-xs text-muted-foreground border border-dashed border-border rounded-xl">
                {isEs
                  ? "Aún no hay versiones guardadas. Guarda cambios para crear el primer snapshot."
                  : "Nenhuma versão salva ainda. Salve alterações para criar a primeira."}
              </div>
            ) : (
              versions.map((ver) => (
                <div
                  key={ver.id}
                  className="flex items-center justify-between gap-3 p-3 rounded-xl border border-border bg-card"
                >
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="font-mono text-xs">
                        v{ver.version_number}
                      </Badge>
                      <span className="text-xs font-medium truncate">
                        {ver.label || (isEs ? "Guardado manual" : "Salvamento manual")}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {new Date(ver.created_at).toLocaleString()}
                    </p>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1.5 shrink-0"
                    onClick={() => setConfirmTarget(ver)}
                  >
                    <RotateCcw className="size-3" />
                    {isEs ? "Restaurar versión" : "Restaurar versão"}
                  </Button>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(confirmTarget)} onOpenChange={(o) => !o && setConfirmTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isEs
                ? `¿Restaurar versión v${confirmTarget?.version_number}?`
                : `Restaurar versão v${confirmTarget?.version_number}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isEs
                ? "Se restaurarán las instrucciones, tono, conocimiento y configuración guardada en esa versión, creando un nuevo snapshot de rollback."
                : "As instruções, tom, conhecimento e configurações da versão serão restaurados, criando um novo snapshot de rollback."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={restoring}>{isEs ? "Cancelar" : "Cancelar"}</AlertDialogCancel>
            <AlertDialogAction disabled={restoring} onClick={() => void handleConfirmRollback()}>
              {restoring ? <Loader2 className="size-3.5 animate-spin mr-1.5" /> : null}
              {isEs ? "Sí, restaurar" : "Sim, restaurar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
