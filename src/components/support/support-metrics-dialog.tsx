import { useMemo } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { Loader2, Star, Timer, CheckCircle2, TicketIcon } from "lucide-react";
import { supportMetrics } from "@/lib/support.functions";

const fmtMin = (m: number) => (m <= 0 ? "—" : m < 60 ? `${m}min` : `${Math.floor(m / 60)}h ${m % 60}min`);

export function SupportMetricsDialog({
  open,
  onOpenChange,
  inline = false,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  inline?: boolean;
}) {
  const fn = useServerFn(supportMetrics);
  const { data, isLoading } = useQuery({
    queryKey: ["support-metrics", 30],
    queryFn: () => fn({ data: { dias: 30 } }),
    enabled: open,
  });

  const maxDia = useMemo(
    () => Math.max(1, ...((data?.por_dia ?? []).map((d: any) => d.total))),
    [data],
  );

  const body = (
    <>
        {isLoading || !data ? (
          <div className="py-16 grid place-items-center text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Kpi icon={<TicketIcon className="size-4" />} label="Chamados" value={String(data.total)} sub={`${data.abertos} em aberto`} />
              <Kpi icon={<Timer className="size-4" />} label="1ª resposta" value={fmtMin(data.tempo_primeira_resposta_min)} sub={`SLA cumprido ${data.sla_percent}%`} />
              <Kpi icon={<CheckCircle2 className="size-4" />} label="Resolução" value={fmtMin(data.tempo_resolucao_min)} sub={`${data.resolvidos} resolvidos`} />
              <Kpi icon={<Star className="size-4" />} label="Satisfação" value={data.csat_medio ? `${data.csat_medio}/5` : "—"} sub={`${data.csat_respostas} avaliações`} />
            </div>

            <Card className="p-4 bg-card shadow-sm">
              <p className="text-sm font-medium mb-3">Volume por dia</p>
              <div className="flex items-end gap-[3px] h-28">
                {data.por_dia.map((d: any) => (
                  <div key={d.dia} className="flex-1 group relative">
                    <div
                      className="w-full rounded-t bg-[#214AC4]/80 min-h-[2px]"
                      style={{ height: `${(d.total / maxDia) * 100}%` }}
                      title={`${d.dia}: ${d.total}`}
                    />
                  </div>
                ))}
              </div>
            </Card>

            <div className="grid md:grid-cols-2 gap-3">
              <Breakdown title="Por categoria" rows={data.por_categoria} />
              <Breakdown title="Por prioridade" rows={data.por_prioridade} />
            </div>
          </div>
        )}
    </>
  );

  if (inline) {
    return (
      <div className="space-y-4 rounded-xl border bg-muted/40 p-4 sm:p-5">
        <h1 className="text-xl sm:text-2xl font-semibold">Métricas do suporte · últimos 30 dias</h1>
        {body}
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Métricas do suporte · últimos 30 dias</DialogTitle>
        </DialogHeader>
        {body}
      </DialogContent>
    </Dialog>
  );
}

function Kpi({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <Card className="p-4 bg-card shadow-sm">
      <div className="flex items-center gap-2 text-muted-foreground text-xs">{icon}{label}</div>
      <p className="text-2xl font-semibold mt-1">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </Card>
  );
}

function Breakdown({ title, rows }: { title: string; rows: { nome: string; total: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.total));
  return (
    <Card className="p-4 bg-card shadow-sm">
      <p className="text-sm font-medium mb-3">{title}</p>
      <div className="space-y-2">
        {rows.length === 0 && <p className="text-sm text-muted-foreground">Sem dados.</p>}
        {rows.map((r) => (
          <div key={r.nome} className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="truncate">{r.nome}</span>
              <span className="text-muted-foreground">{r.total}</span>
            </div>
            <div className="h-1.5 rounded bg-muted overflow-hidden">
              <div className="h-full bg-[#214AC4]" style={{ width: `${(r.total / max) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
