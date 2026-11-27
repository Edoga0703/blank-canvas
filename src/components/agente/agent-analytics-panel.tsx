import React, { useEffect, useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  BarChart3,
  Clock,
  Users,
  ThumbsUp,
  ThumbsDown,
  Loader2,
  RefreshCcw,
  Lock,
  FileText,
} from "lucide-react";
import { getAgentAnalytics } from "@/lib/agent-ai.functions";
import { useLanguage } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";

interface AgentAnalyticsPanelProps {
  agentId?: string | null;
  allowed: boolean;
}

const ROUTE_LABELS: Record<string, string> = {
  greeting_simple: "Saludo simple",
  catalog_price: "Catálogo / Precio",
  scheduling: "Agendamiento",
  payment_receipt: "Comprobante",
  general: "Consulta general",
};

export function AgentAnalyticsPanel({ agentId, allowed }: AgentAnalyticsPanelProps) {
  const { language } = useLanguage();
  const isEs = language === "es";
  const fetchAnalytics = useServerFn(getAgentAnalytics);

  const [days, setDays] = useState("14");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);

  const load = useCallback(async () => {
    if (!allowed) return;
    setLoading(true);
    try {
      const res = await fetchAnalytics({ data: { agentId: agentId || null, days: Number(days) } });
      setData(res);
    } catch (err: any) {
      toast.error(err?.message || (isEs ? "Error cargando métricas" : "Erro ao carregar métricas"));
    } finally {
      setLoading(false);
    }
  }, [allowed, agentId, days, fetchAnalytics, isEs]);

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
          {isEs ? "Análisis y Telemetría Real de IA" : "Análises e Telemetria Real da IA"}
        </h3>
        <p className="text-xs text-muted-foreground max-w-md mx-auto">
          {isEs
            ? "Visualiza latencia promedio, rutas del pre-router, fuentes RAG citadas y trazas turno a turno. Disponible desde el plan Pro."
            : "Visualize latência média, rotas, fontes citadas e rastros por turno. Disponível a partir do plano Pro."}
        </p>
      </div>
    );
  }

  const totalTurns = Number(data?.totalTurns || 0);
  const routeEntries = Object.entries((data?.routeBreakdown || {}) as Record<string, number>);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-bold flex items-center gap-2">
            <BarChart3 className="size-4 text-primary" />
            {isEs ? "Rendimiento real del Agente IA" : "Desempenho real do Agente IA"}
          </h3>
          <p className="text-xs text-muted-foreground">
            {isEs ? "Métricas medidas sobre conversaciones reales en Postgres." : "Métricas reais medidas nas conversas."}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="h-8 w-28 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">7 {isEs ? "días" : "dias"}</SelectItem>
              <SelectItem value="14">14 {isEs ? "días" : "dias"}</SelectItem>
              <SelectItem value="30">30 {isEs ? "días" : "dias"}</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading} className="h-8 text-xs">
            <RefreshCcw className={cn("size-3.5", loading && "animate-spin")} />
          </Button>
        </div>
      </div>

      {/* 4 KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-xl border border-border bg-card p-4 space-y-1">
          <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
            <BarChart3 className="size-3.5" />
            {isEs ? "Turnos analizados" : "Turnos"}
          </div>
          <div className="text-2xl font-bold">{totalTurns}</div>
          {Number(data?.errorCount || 0) > 0 && (
            <div className="text-[10px] text-destructive">{data.errorCount} errores</div>
          )}
        </div>

        <div className="rounded-xl border border-border bg-card p-4 space-y-1">
          <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
            <Clock className="size-3.5" />
            {isEs ? "Latencia promedio" : "Latência média"}
          </div>
          <div className="text-2xl font-bold">{Number(data?.avgLatencyMs || 0)}ms</div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 space-y-1">
          <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
            <Users className="size-3.5" />
            {isEs ? "Derivación a humano" : "Handoff humano"}
          </div>
          <div className="text-2xl font-bold">{Number(data?.handoffRate || 0)}%</div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 space-y-1">
          <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
            <ThumbsUp className="size-3.5" />
            Feedback
          </div>
          <div className="flex items-center gap-3 text-lg font-bold">
            <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
              <ThumbsUp className="size-3.5" /> {Number(data?.feedbackPositive || 0)}
            </span>
            <span className="text-rose-600 dark:text-rose-400 flex items-center gap-1">
              <ThumbsDown className="size-3.5" /> {Number(data?.feedbackNegative || 0)}
            </span>
          </div>
        </div>
      </div>

      {/* Desglose por ruta y Top fuentes */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            {isEs ? "Rutas del Pre-Router" : "Rotas do Pre-Router"}
          </h4>
          <div className="space-y-2.5">
            {routeEntries.map(([route, count]) => {
              const pct = totalTurns > 0 ? Math.round((count / totalTurns) * 100) : 0;
              return (
                <div key={route} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span>{ROUTE_LABELS[route] || route}</span>
                    <span className="font-mono text-muted-foreground">
                      {count} ({pct}%)
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            {isEs ? "Fuentes más citadas (RAG)" : "Fontes mais citadas (RAG)"}
          </h4>
          {Array.isArray(data?.topSources) && data.topSources.length > 0 ? (
            <div className="space-y-2">
              {data.topSources.map((src: any) => (
                <div
                  key={src.source_name}
                  className="flex items-center justify-between text-xs p-2 rounded-lg bg-muted/40 border border-border/50"
                >
                  <span className="flex items-center gap-1.5 truncate">
                    <FileText className="size-3.5 text-blue-500 shrink-0" />
                    <span className="truncate">{src.source_name}</span>
                  </span>
                  <Badge variant="secondary" className="font-mono text-[10px]">
                    {src.count}
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground py-6 text-center">
              {isEs ? "Sin citas de documentos RAG en el período." : "Sem citações de documentos RAG no período."}
            </p>
          )}
        </div>
      </div>

      {/* Últimos 15 turnos */}
      <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          {isEs ? "Últimos 15 turnos ejecutados" : "Últimos 15 turnos executados"}
        </h4>
        {loading && !data ? (
          <div className="py-8 flex justify-center">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          </div>
        ) : !data?.recentTraces?.length ? (
          <p className="text-xs text-muted-foreground text-center py-6">
            {isEs ? "Aún no hay trazas registradas." : "Ainda não há rastros registrados."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">{isEs ? "Fecha" : "Data"}</th>
                  <th className="py-2 pr-3 font-medium">{isEs ? "Contacto" : "Contato"}</th>
                  <th className="py-2 pr-3 font-medium">{isEs ? "Ruta" : "Rota"}</th>
                  <th className="py-2 pr-3 font-medium">{isEs ? "Latencia" : "Latência"}</th>
                  <th className="py-2 pr-3 font-medium">{isEs ? "Fuentes / Tools" : "Fontes / Tools"}</th>
                  <th className="py-2 font-medium">{isEs ? "Estado" : "Status"}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {data.recentTraces.map((tr: any) => (
                  <tr key={tr.id}>
                    <td className="py-2 pr-3 text-[11px] text-muted-foreground whitespace-nowrap">
                      {new Date(tr.created_at).toLocaleString([], {
                        month: "2-digit",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="py-2 pr-3 font-mono text-[11px]">{tr.numero}</td>
                    <td className="py-2 pr-3">
                      <Badge variant="outline" className="text-[10px]">
                        {ROUTE_LABELS[tr.route] || tr.route}
                      </Badge>
                    </td>
                    <td className="py-2 pr-3 font-mono text-[11px]">
                      {typeof tr.latency_ms === "number" ? `${tr.latency_ms}ms` : "—"}
                    </td>
                    <td className="py-2 pr-3 text-[11px] text-muted-foreground">
                      {[
                        ...(Array.isArray(tr.chunks_used) ? tr.chunks_used.map((c: any) => c.source_name) : []),
                        ...(Array.isArray(tr.tools_used)
                          ? tr.tools_used.map((t: any) => (typeof t === "string" ? t : t?.name))
                          : []),
                      ]
                        .filter(Boolean)
                        .slice(0, 3)
                        .join(", ") || "—"}
                    </td>
                    <td className="py-2">
                      {tr.error ? (
                        <Badge variant="destructive" className="text-[10px]">Error</Badge>
                      ) : tr.handoff ? (
                        <Badge variant="secondary" className="text-[10px]">Handoff</Badge>
                      ) : (
                        <Badge className="text-[10px] bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/15">
                          OK
                        </Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
