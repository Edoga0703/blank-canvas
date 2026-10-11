import { useMemo } from "react";
import { BarChart3, Clock3, Download, HardDrive, Lightbulb } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Metrics = Partial<Record<"likes" | "comments" | "shares" | "saves" | "reach" | "impressions" | "views" | "total_interactions", number | null>>;

export type SocialIntelligencePost = {
  id: string;
  network: string;
  format: string;
  caption: string | null;
  permalink: string | null;
  published_at: string | null;
  archived_media_url: string | null;
  metrics_latest: Metrics | null;
};

const FORMAT_LABEL: Record<string, string> = {
  photo: "Foto", video: "Vídeo", reel: "Reel", story: "Story",
  carousel: "Carrossel", text: "Texto", link: "Link", other: "Outro",
};
const WEEKDAYS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const number = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const display = (value: number | null | undefined, digits = 0) => value == null
  ? "—"
  : value.toLocaleString("pt-BR", { maximumFractionDigits: digits });
function interactionValue(post: SocialIntelligencePost): number | null {
  const metrics = post.metrics_latest ?? {};
  if (metrics.total_interactions != null) return number(metrics.total_interactions);
  const parts = [metrics.likes, metrics.comments, metrics.shares, metrics.saves];
  if (parts.every((value) => value == null)) return null;
  return parts.reduce<number>((sum, value) => sum + number(value), 0);
}

function average(rows: SocialIntelligencePost[], metric: "reach" | "views" | "interactions") {
  const values = rows.map((post) => metric === "interactions" ? interactionValue(post) : post.metrics_latest?.[metric])
    .filter((value): value is number => value !== null && value !== undefined && Number.isFinite(Number(value)))
    .map(Number);
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function csvCell(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

export function MetaSocialIntelligence({ posts }: { posts: SocialIntelligencePost[] }) {
  const published = useMemo(() => posts.filter((post) => post.format !== "story" && post.published_at), [posts]);

  const formatRows = useMemo(() => {
    const groups = new Map<string, SocialIntelligencePost[]>();
    for (const post of published) groups.set(post.format, [...(groups.get(post.format) ?? []), post]);
    return [...groups.entries()].map(([format, rows]) => {
      const reach = average(rows, "reach");
      const total = average(rows, "interactions");
      return {
        format,
        count: rows.length,
        reach,
        views: average(rows, "views"),
        interactions: total,
        engagementRate: reach && total != null ? total / reach * 100 : null,
      };
    }).sort((a, b) => (b.interactions ?? 0) - (a.interactions ?? 0));
  }, [published]);

  const timing = useMemo(() => {
    const days = new Map<number, SocialIntelligencePost[]>();
    const hours = new Map<number, SocialIntelligencePost[]>();
    for (const post of published) {
      const date = new Date(post.published_at!);
      if (Number.isNaN(date.getTime())) continue;
      days.set(date.getDay(), [...(days.get(date.getDay()) ?? []), post]);
      hours.set(date.getHours(), [...(hours.get(date.getHours()) ?? []), post]);
    }
    const best = (groups: Map<number, SocialIntelligencePost[]>) => [...groups.entries()]
      .map(([key, rows]) => ({ key, count: rows.length, score: average(rows, "interactions") ?? 0 }))
      .sort((a, b) => b.score - a.score)[0] ?? null;
    return { day: best(days), hour: best(hours) };
  }, [published]);

  const coverage = useMemo(() => {
    const keys: Array<keyof Metrics> = ["reach", "views", "total_interactions", "shares", "saves"];
    return keys.map((key) => ({
      key,
      available: published.filter((post) => post.metrics_latest?.[key] !== null && post.metrics_latest?.[key] !== undefined).length,
      total: published.length,
    }));
  }, [published]);

  const totals = useMemo(() => {
    const reachValues = published.map((post) => post.metrics_latest?.reach).filter((value): value is number => value != null);
    const interactionValues = published.map(interactionValue).filter((value): value is number => value != null);
    const reach = reachValues.length ? reachValues.reduce((sum, value) => sum + number(value), 0) : null;
    const totalInteractions = interactionValues.length ? interactionValues.reduce((sum, value) => sum + value, 0) : null;
    const archived = posts.filter((post) => post.archived_media_url).length;
    return {
      reach,
      interactions: totalInteractions,
      engagementRate: reach && totalInteractions != null ? totalInteractions / reach * 100 : null,
      archived,
    };
  }, [posts, published]);

  const recommendations = useMemo(() => {
    const messages: string[] = [];
    if (!published.length) return ["Sincronize publicações para gerar recomendações com dados reais."];
    const best = formatRows[0];
    if (best && formatRows.length > 1) messages.push(`${FORMAT_LABEL[best.format] ?? best.format} possui a maior média de interações (${display(best.interactions)} por publicação).`);
    if (timing.day) messages.push(`A melhor média atual ocorre na ${WEEKDAYS[timing.day.key]}, com ${timing.day.count} publicação(ões) analisadas.`);
    if (timing.hour) messages.push(`O horário com maior média de interações é por volta de ${String(timing.hour.key).padStart(2, "0")}:00.`);
    const reachCoverage = coverage.find((item) => item.key === "reach");
    if (reachCoverage && reachCoverage.available < Math.ceil(reachCoverage.total * 0.6)) messages.push("A cobertura de alcance está baixa. Revise read_insights / instagram_manage_insights antes de tomar decisões por alcance.");
    if (totals.archived < posts.length) messages.push(`${posts.length - totals.archived} mídia(s) ainda dependem da URL da Meta. Use a sincronização completa para arquivá-las gradualmente no R2.`);
    return messages.slice(0, 5);
  }, [coverage, formatRows, posts.length, published.length, timing, totals.archived]);

  const exportCsv = () => {
    const header = ["rede", "formato", "publicado_em", "legenda", "curtidas", "comentarios", "compartilhamentos", "salvos", "alcance", "visualizacoes", "interacoes", "link"];
    const rows = posts.map((post) => [
      post.network, post.format, post.published_at ?? "", post.caption ?? "",
      post.metrics_latest?.likes ?? "", post.metrics_latest?.comments ?? "", post.metrics_latest?.shares ?? "",
      post.metrics_latest?.saves ?? "", post.metrics_latest?.reach ?? "", post.metrics_latest?.views ?? "",
      interactionValue(post) ?? "", post.permalink ?? "",
    ]);
    const csv = [header, ...rows].map((row) => row.map(csvCell).join(";")).join("\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `meta-conteudo-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 text-base font-semibold"><BarChart3 className="h-4 w-4" />Inteligência social</h3>
          <p className="text-xs text-muted-foreground">Cálculos feitos somente com as publicações e métricas armazenadas.</p>
        </div>
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={!posts.length}><Download className="mr-2 h-4 w-4" />Exportar CSV</Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card><CardContent className="pt-5"><div className="text-xs text-muted-foreground">Publicações analisadas</div><div className="text-2xl font-bold">{display(published.length)}</div></CardContent></Card>
        <Card><CardContent className="pt-5"><div className="text-xs text-muted-foreground">Alcance somado</div><div className="text-2xl font-bold">{display(totals.reach)}</div></CardContent></Card>
        <Card><CardContent className="pt-5"><div className="text-xs text-muted-foreground">Taxa de interação</div><div className="text-2xl font-bold">{totals.engagementRate == null ? "—" : `${display(totals.engagementRate, 2)}%`}</div></CardContent></Card>
        <Card><CardContent className="pt-5"><div className="flex items-center gap-1 text-xs text-muted-foreground"><HardDrive className="h-3.5 w-3.5" />Mídias no R2</div><div className="text-2xl font-bold">{display(totals.archived)} / {display(posts.length)}</div></CardContent></Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)]">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Desempenho por formato</CardTitle></CardHeader>
          <CardContent>
            {!formatRows.length ? <p className="text-sm text-muted-foreground">Sem dados suficientes.</p> : (
              <Table>
                <TableHeader><TableRow><TableHead>Formato</TableHead><TableHead className="text-right">Posts</TableHead><TableHead className="text-right">Alcance médio</TableHead><TableHead className="text-right">Views médias</TableHead><TableHead className="text-right">Interações médias</TableHead><TableHead className="text-right">Taxa</TableHead></TableRow></TableHeader>
                <TableBody>{formatRows.map((row) => <TableRow key={row.format}><TableCell><Badge variant="secondary">{FORMAT_LABEL[row.format] ?? row.format}</Badge></TableCell><TableCell className="text-right">{row.count}</TableCell><TableCell className="text-right">{display(row.reach)}</TableCell><TableCell className="text-right">{display(row.views)}</TableCell><TableCell className="text-right">{display(row.interactions)}</TableCell><TableCell className="text-right">{row.engagementRate == null ? "—" : `${display(row.engagementRate, 2)}%`}</TableCell></TableRow>)}</TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><Lightbulb className="h-4 w-4" />Recomendações</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {recommendations.map((message, index) => <div key={index} className="rounded-md border p-3 text-sm">{message}</div>)}
            {(timing.day || timing.hour) && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Clock3 className="h-4 w-4" />As recomendações usam média por publicação, evitando favorecer apenas horários com maior volume.</div>}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Cobertura das métricas</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {coverage.map((item) => {
            const percent = item.total ? Math.round(item.available / item.total * 100) : 0;
            return <div key={item.key} className="rounded-md border p-3"><div className="text-xs capitalize text-muted-foreground">{item.key.replace("total_", "")}</div><div className="mt-1 text-lg font-semibold">{percent}%</div><div className="text-[11px] text-muted-foreground">{item.available} de {item.total} publicações</div></div>;
          })}
        </CardContent>
      </Card>
    </div>
  );
}
