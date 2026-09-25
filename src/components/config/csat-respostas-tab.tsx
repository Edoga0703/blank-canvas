import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Star, Download, Users } from "lucide-react";
import { toast } from "sonner";
import { getCsatReport } from "@/lib/csat-reports.functions";

function fmtMedia(n: number | null) {
  return n == null ? "—" : n.toFixed(2).replace(".", ",");
}
function fmtPct(n: number) {
  return `${Math.round(n * 100)}%`;
}
function fmtData(iso: string | null) {
  return iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";
}

export function CsatRespostasTab() {
  const fetchFn = useServerFn(getCsatReport);
  const [dias, setDias] = useState(30);
  const [atendenteId, setAtendenteId] = useState<string>("todos");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    void (async () => {
      try {
        const r: any = await fetchFn({ data: { dias, atendenteId: atendenteId === "todos" ? null : atendenteId } });
        if (alive) setData(r);
      } catch (e: any) {
        toast.error(e?.message ?? "Erro ao carregar satisfação");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [dias, atendenteId]);

  const respostas = data?.respostas ?? [];

  const csv = useMemo(() => {
    const head = "Contato;Numero;Nota;Comentario;Atendente;Enviado em;Respondido em";
    const linhas = respostas.map((r: any) =>
      [r.contato_nome ?? "", r.numero, r.score ?? "", (r.comentario ?? "").replace(/[;\n]/g, " "), r.atendente_nome, fmtData(r.enviado_em), fmtData(r.respondido_em)].join(";")
    );
    return [head, ...linhas].join("\n");
  }, [respostas]);

  function exportar() {
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `satisfacao-${dias}d.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  if (loading && !data) return <Card className="p-6"><Loader2 className="size-4 animate-spin" /></Card>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={String(dias)} onValueChange={(v) => setDias(Number(v))}>
          <SelectTrigger className="w-[140px] h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Últimos 7 dias</SelectItem>
            <SelectItem value="30">Últimos 30 dias</SelectItem>
            <SelectItem value="90">Últimos 90 dias</SelectItem>
            <SelectItem value="365">Último ano</SelectItem>
          </SelectContent>
        </Select>
        {data?.isAdmin && (
          <Select value={atendenteId} onValueChange={setAtendenteId}>
            <SelectTrigger className="w-[190px] h-9"><SelectValue placeholder="Atendente" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os atendentes</SelectItem>
              {(data?.atendentes ?? []).map((a: any) => (
                <SelectItem key={a.id} value={a.id}>{a.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Button variant="outline" size="sm" className="ml-auto h-9" onClick={exportar} disabled={!respostas.length}>
          <Download className="size-4 mr-1.5" /> CSV
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="p-3">
          <div className="text-xs text-muted-foreground">Nota média</div>
          <div className="text-xl font-bold flex items-center gap-1">
            <Star className="size-4 text-amber-500 fill-amber-500" />{fmtMedia(data?.resumo?.media ?? null)}
          </div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-muted-foreground">Enviadas</div>
          <div className="text-xl font-bold">{data?.resumo?.enviados ?? 0}</div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-muted-foreground">Respondidas</div>
          <div className="text-xl font-bold">{data?.resumo?.respondidos ?? 0}</div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-muted-foreground">Taxa de resposta</div>
          <div className="text-xl font-bold">{fmtPct(data?.resumo?.taxa ?? 0)}</div>
        </Card>
      </div>

      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Users className="size-4" />
          <h3 className="font-semibold text-sm">Desempenho por atendente</h3>
        </div>
        {(data?.porAtendente ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma pesquisa no período.</p>
        ) : (
          <div className="space-y-2">
            {data.porAtendente.map((s: any) => {
              const total = s.respondidos || 1;
              return (
                <div key={s.userId ?? "auto"} className="rounded-lg border p-3 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-sm">{s.nome}</span>
                    <Badge variant="secondary" className="text-[10px]">
                      <Star className="size-3 mr-1 text-amber-500 fill-amber-500" />{fmtMedia(s.media)}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {s.respondidos}/{s.enviados} respondidas · {fmtPct(s.enviados ? s.respondidos / s.enviados : 0)}
                    </span>
                    {s.detratores > 0 && (
                      <Badge variant="destructive" className="text-[10px]">{s.detratores} detrator(es)</Badge>
                    )}
                  </div>
                  <div className="space-y-1">
                    {[5, 4, 3, 2, 1].map((n) => (
                      <div key={n} className="flex items-center gap-2">
                        <span className="text-[10px] w-3 text-muted-foreground">{n}</span>
                        <div className="h-1.5 flex-1 rounded bg-muted overflow-hidden">
                          <div
                            className="h-full bg-primary"
                            style={{ width: `${(s.dist[n - 1] / total) * 100}%` }}
                          />
                        </div>
                        <span className="text-[10px] w-6 text-right text-muted-foreground">{s.dist[n - 1]}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card className="p-4 space-y-3">
        <h3 className="font-semibold text-sm">Respostas</h3>
        {respostas.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma pesquisa no período.</p>
        ) : (
          <>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground border-b">
                    <th className="text-left py-2 font-medium">Contato</th>
                    <th className="text-left font-medium">Nota</th>
                    <th className="text-left font-medium">Comentário</th>
                    <th className="text-left font-medium">Atendente</th>
                    <th className="text-left font-medium">Data</th>
                  </tr>
                </thead>
                <tbody>
                  {respostas.map((r: any) => (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="py-2">{r.contato_nome || r.numero}</td>
                      <td>{r.score != null ? `${r.score}★` : <span className="text-muted-foreground">sem resposta</span>}</td>
                      <td className="max-w-[280px] truncate text-muted-foreground">{r.comentario || "—"}</td>
                      <td>{r.atendente_nome}</td>
                      <td className="whitespace-nowrap text-muted-foreground">{fmtData(r.respondido_em ?? r.enviado_em)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="md:hidden space-y-2">
              {respostas.map((r: any) => (
                <div key={r.id} className="rounded-lg border p-3 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-sm truncate">{r.contato_nome || r.numero}</span>
                    <Badge variant={r.score != null ? "secondary" : "outline"} className="text-[10px] shrink-0">
                      {r.score != null ? `${r.score}★` : "sem resposta"}
                    </Badge>
                  </div>
                  {r.comentario && <p className="text-xs text-muted-foreground">{r.comentario}</p>}
                  <div className="text-[11px] text-muted-foreground">
                    {r.atendente_nome} · {fmtData(r.respondido_em ?? r.enviado_em)}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
