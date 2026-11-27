import React, { useEffect, useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  Wrench,
  CheckCircle2,
  Trash2,
  Loader2,
  Sparkles,
  Lock,
  RefreshCcw,
  Shield,
} from "lucide-react";
import {
  listAgentTools,
  toggleAgentTool,
  deleteAgentTool,
} from "@/lib/agent-copilot.functions";
import { useLanguage } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";

interface AgentToolsPanelProps {
  agentId?: string | null;
  tipo?: string;
  allowed: boolean;
  onOpenCopilotTools: () => void;
}

export function AgentToolsPanel({
  agentId,
  tipo = "qualificacao",
  allowed,
  onOpenCopilotTools,
}: AgentToolsPanelProps) {
  const { language } = useLanguage();
  const isEs = language === "es";

  const fetchTools = useServerFn(listAgentTools);
  const toggleTool = useServerFn(toggleAgentTool);
  const removeTool = useServerFn(deleteAgentTool);

  const [loading, setLoading] = useState(false);
  const [tools, setTools] = useState<any[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!allowed || !agentId) return;
    setLoading(true);
    try {
      const res: any = await fetchTools({ data: { agentId, tipo } });
      setTools(res?.tools ?? []);
    } catch (err: any) {
      toast.error(err?.message || (isEs ? "Error cargando herramientas" : "Erro ao carregar ferramentas"));
    } finally {
      setLoading(false);
    }
  }, [allowed, agentId, tipo, fetchTools, isEs]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!allowed) {
    return (
      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-6 text-center space-y-3">
        <div className="size-10 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-300 flex items-center justify-center mx-auto">
          <Lock className="size-5" />
        </div>
        <h3 className="text-sm font-bold">
          {isEs ? "Librería de Herramientas Verificadas" : "Biblioteca de Ferramentas Verificadas"}
        </h3>
        <p className="text-xs text-muted-foreground max-w-md mx-auto">
          {isEs
            ? "Conecta APIs externas probadas en Sandbox y webhooks salientes reales con tu CRM o ERP. Disponible desde el plan Business / Enterprise."
            : "Conecte APIs externas testadas no Sandbox e webhooks reais com seu CRM ou ERP. Disponível no plano Business / Enterprise."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-border bg-card p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h3 className="text-sm font-bold flex items-center gap-2">
            <Wrench className="size-4 text-emerald-600 dark:text-emerald-400" />
            {isEs ? "Herramientas Externas Verificadas" : "Ferramentas Externas Verificadas"}
          </h3>
          <p className="text-xs text-muted-foreground">
            {isEs
              ? "Todas las APIs deben pasar una prueba HTTP 2xx en el Sandbox antes de quedar activas para el agente."
              : "Todas as APIs passam por um teste HTTP 2xx no Sandbox antes de ficarem ativas para o agente."}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading} className="h-8 text-xs gap-1">
            <RefreshCcw className={cn("size-3.5", loading && "animate-spin")} />
          </Button>
          <Button
            size="sm"
            onClick={onOpenCopilotTools}
            className="h-8 text-xs gap-1.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white"
          >
            <Sparkles className="size-3.5" />
            {isEs ? "+ Probar y Agregar API / Webhook con Copilot" : "+ Testar e Adicionar API / Webhook com Copilot"}
          </Button>
        </div>
      </div>

      {loading && tools.length === 0 ? (
        <div className="flex items-center justify-center py-12 text-xs text-muted-foreground gap-2">
          <Loader2 className="size-4 animate-spin" />
          {isEs ? "Cargando herramientas..." : "Carregando ferramentas..."}
        </div>
      ) : tools.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-8 text-center space-y-2">
          <Wrench className="size-7 text-muted-foreground/40 mx-auto" />
          <p className="text-xs font-medium">
            {isEs ? "Aún no tienes herramientas externas verificadas" : "Nenhuma ferramenta externa verificada ainda"}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {isEs
              ? "Usa el Copilot para describir tu endpoint, probarlo en el Sandbox y guardarlo en 1 clic."
              : "Use o Copilot para testar seu endpoint no Sandbox e salvá-lo em 1 clique."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {tools.map((tool) => {
            const headerEntries =
              tool.headers && typeof tool.headers === "object" ? Object.entries(tool.headers) : [];
            const permLabel =
              tool.permission_level === "write_require_owner_approval"
                ? isEs ? "Aprobación dueño" : "Aprovação do dono"
                : tool.permission_level === "write_confirm_customer"
                  ? isEs ? "Confirmación cliente" : "Confirmação cliente"
                  : isEs ? "Solo lectura" : "Somente leitura";

            return (
              <div
                key={tool.id}
                className="rounded-2xl border border-border bg-card p-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold">{tool.display_name || tool.name}</span>
                      <Badge variant="outline" className="text-[10px] font-mono">
                        {tool.name}
                      </Badge>
                      {tool.verified && (
                        <Badge className="text-[10px] bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/15 gap-1">
                          <CheckCircle2 className="size-2.5" />
                          Verificada {tool.last_test_status ? `(HTTP ${tool.last_test_status})` : "(HTTP 2xx)"}
                        </Badge>
                      )}
                      <Badge variant="secondary" className="text-[10px] gap-1">
                        <Shield className="size-2.5" />
                        {permLabel}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{tool.description}</p>
                  </div>

                  <div className="flex items-center gap-2">
                    <Switch
                      disabled={busyId === tool.id}
                      checked={Boolean(tool.active)}
                      onCheckedChange={async (checked) => {
                        setBusyId(tool.id);
                        try {
                          await toggleTool({ data: { toolId: tool.id, active: checked } });
                          setTools((prev) =>
                            prev.map((item) => (item.id === tool.id ? { ...item, active: checked } : item)),
                          );
                          toast.success(
                            checked
                              ? isEs ? "Herramienta activada" : "Ferramenta ativada"
                              : isEs ? "Herramienta pausada" : "Ferramenta pausada",
                          );
                        } catch (err: any) {
                          toast.error(err?.message || "Error");
                        } finally {
                          setBusyId(null);
                        }
                      }}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={busyId === tool.id}
                      className="size-8 text-destructive"
                      onClick={async () => {
                        setBusyId(tool.id);
                        try {
                          await removeTool({ data: { toolId: tool.id } });
                          setTools((prev) => prev.filter((item) => item.id !== tool.id));
                          toast.success(isEs ? "Herramienta eliminada" : "Ferramenta removida");
                        } catch (err: any) {
                          toast.error(err?.message || "Error");
                        } finally {
                          setBusyId(null);
                        }
                      }}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>

                <div className="rounded-xl bg-muted/40 border border-border/60 p-3 space-y-1.5 font-mono text-[11px]">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="text-[10px] uppercase">
                      {tool.method}
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">
                      {tool.kind === "webhook_out" ? "webhook_out" : "http"}
                    </Badge>
                    <span className="truncate text-foreground">{tool.url}</span>
                    {typeof tool.last_test_latency_ms === "number" && (
                      <span className="text-[10px] text-muted-foreground ml-auto">
                        {tool.last_test_latency_ms}ms
                      </span>
                    )}
                  </div>

                  {headerEntries.length > 0 && (
                    <div className="text-[10px] text-muted-foreground pt-1 border-t border-border/50 flex flex-wrap gap-2">
                      <span>Headers:</span>
                      {headerEntries.map(([hk, hv]) => (
                        <span key={hk} className="bg-background px-1.5 py-0.5 rounded border border-border/60">
                          {hk}: {String(hv)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
