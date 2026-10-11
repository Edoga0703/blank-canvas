import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, CheckCircle2, CircleSlash, ExternalLink, Film, Grid3x3, ImageIcon, Layers, LayoutList, Loader2, PlayCircle, RefreshCw, Stethoscope, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  getMetaProfileGrowth,
  getStoredMetaPost,
  listMetaSocialAccounts,
  reconcileMetaAssets,
  listStoredMetaPosts,
  runMetaChannelDiagnostics,
  syncMetaContentHistory,
} from "@/lib/meta-history.functions";
import { replyMetaComment } from "@/lib/meta-content.functions";
import { MetaSocialIntelligence } from "@/components/content/meta-social-intelligence";

type Account = { id: string; network: string; username: string | null; display_name: string | null; status: string; last_synced_at: string | null; last_error: string | null; instance_name: string | null };
type Metrics = Partial<Record<"likes" | "comments" | "shares" | "saves" | "reach" | "impressions" | "views" | "total_interactions" | "replies" | "avg_watch_time_ms" | "total_watch_time_ms", number | null>>;
type Post = {
  id: string; social_account_id: string | null; network: string; format: string; caption: string | null; permalink: string | null;
  media_url: string | null; thumbnail_url: string | null; archived_media_url: string | null; archived_thumbnail_url: string | null;
  published_at: string | null; metrics_latest: Metrics;
};

const FORMAT_LABEL: Record<string, string> = { photo: "Foto", video: "Vídeo", reel: "Reel", story: "Story", carousel: "Carrossel", text: "Texto", link: "Link", other: "Outro" };
const METRIC_LABEL: Record<string, string> = { likes: "Curtidas", comments: "Comentários", shares: "Compart.", saves: "Salvos", reach: "Alcance", impressions: "Impressões", views: "Visualizações", total_interactions: "Interações", replies: "Respostas", avg_watch_time_ms: "Tempo médio (s)", total_watch_time_ms: "Tempo total (min)" };
const fmt = (v: number | null | undefined) => (v === null || v === undefined ? "—" : v.toLocaleString("pt-BR"));
const accountLabel = (a: Account) => `${a.network === "instagram" ? "Instagram" : "Facebook"} · ${a.username ? (a.network === "instagram" ? `@${a.username}` : a.username) : a.display_name ?? "conta"}`;
const engagement = (m: Metrics) => (m.total_interactions ?? (m.likes ?? 0) + (m.comments ?? 0) + (m.shares ?? 0) + (m.saves ?? 0));

function isVideo(p: Post) { return p.format === "video" || p.format === "reel" || /\.mp4|video/i.test(p.media_url ?? ""); }

function PostMedia({ post, controls = false }: { post: Post; controls?: boolean }) {
  const [failed, setFailed] = useState(false);
  const thumb = post.archived_thumbnail_url ?? post.thumbnail_url ?? (isVideo(post) ? null : post.archived_media_url ?? post.media_url);
  const src = post.archived_media_url ?? post.media_url;
  if (controls && isVideo(post) && src && !failed) {
    return <video src={src} poster={thumb ?? undefined} controls playsInline className="h-full w-full rounded-md bg-muted object-contain" onError={() => setFailed(true)} />;
  }
  if (thumb && !failed) return <img src={thumb} alt={post.caption?.slice(0, 80) ?? "Publicação"} loading="lazy" className="h-full w-full object-cover" onError={() => setFailed(true)} />;
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-muted text-xs text-muted-foreground">
      <ImageIcon className="h-6 w-6" />
      {failed ? "Mídia expirada na Meta" : "Sem prévia"}
    </div>
  );
}

function FormatIcon({ format }: { format: string }) {
  if (format === "reel" || format === "video") return <Film className="h-3.5 w-3.5" />;
  if (format === "carousel") return <Layers className="h-3.5 w-3.5" />;
  if (format === "story") return <PlayCircle className="h-3.5 w-3.5" />;
  return <ImageIcon className="h-3.5 w-3.5" />;
}

export function MetaContentHistory() {
  const listAccounts = useServerFn(listMetaSocialAccounts);
  const reconcileAssets = useServerFn(reconcileMetaAssets);
  const listPosts = useServerFn(listStoredMetaPosts);
  const sync = useServerFn(syncMetaContentHistory);
  const growth = useServerFn(getMetaProfileGrowth);

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [analyticsPosts, setAnalyticsPosts] = useState<Post[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [summary, setSummary] = useState<any[] | null>(null);
  const [view, setView] = useState<"grid" | "table">("grid");
  const [network, setNetwork] = useState("all");
  const [accountId, setAccountId] = useState("all");
  const [format, setFormat] = useState("all");
  const [since, setSince] = useState("");
  const [until, setUntil] = useState("");
  const [profile, setProfile] = useState<any[]>([]);
  const [open, setOpen] = useState<Post | null>(null);

  const reconciledRef = useRef(false);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const analysisEnd = until ? new Date(`${until}T23:59:59`) : new Date();
      const analysisStart = since ? new Date(`${since}T00:00:00`) : new Date(analysisEnd.getTime() - 30 * 86400_000);
      const span = Math.max(analysisEnd.getTime() - analysisStart.getTime(), 86400_000);
      const previousStart = new Date(analysisStart.getTime() - span).toISOString().slice(0, 10);
      const [a, p, analysis, g] = await Promise.all([
        listAccounts(),
        listPosts({ data: { network: network === "all" ? undefined : network, accountId: accountId === "all" ? undefined : accountId, format: format === "all" ? undefined : format, since: since || undefined, until: until || undefined } }),
        listPosts({ data: { network: network === "all" ? undefined : network, accountId: accountId === "all" ? undefined : accountId, format: format === "all" ? undefined : format, since: previousStart, until: until || analysisEnd.toISOString().slice(0, 10) } }),
        growth({ data: { accountId: accountId === "all" ? undefined : accountId } }),
      ]);
      let accs = a.accounts as Account[];
      if (!a.error && accs.length === 0 && !reconciledRef.current) {
        reconciledRef.current = true;
        const rec = await reconcileAssets().catch(() => null);
        for (const w of rec?.warnings ?? []) toast.warning(w);
        if (rec?.ok && rec.count) accs = (await listAccounts()).accounts as Account[];
      }
      setAccounts(accs);
      setPosts(p.posts as Post[]);
      setAnalyticsPosts(analysis.posts as Post[]);
      setProfile(g.profile);
      setError(a.error ?? p.error ?? analysis.error ?? g.error ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar histórico.");
    } finally {
      setLoading(false);
    }
  }, [listAccounts, reconcileAssets, listPosts, growth, network, accountId, format, since, until]);

  useEffect(() => { void load(); }, [load]);

  async function runSync(full: boolean) {
    setSyncing(true);
    try {
      const r = await sync({ data: { accountId: accountId === "all" ? undefined : accountId, full } });
      for (const w of r.warnings ?? []) toast.warning(w);
      if (!r.ok) { toast.error(r.error ?? "Falha na sincronização."); return; }
      setSummary(r.results);
      const bad = r.results.filter((x: any) => x.status !== "ok").length;
      if (bad) toast.warning(`Sincronização concluída com ${bad} conta(s) parcial(is). Veja o resumo.`);
      else toast.success("Histórico sincronizado.");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha na sincronização.");
    } finally {
      setSyncing(false);
    }
  }

  // Comparação de períodos (últimos N dias vs N anteriores) a partir do filtro de datas ou 30 dias.
  const comparison = useMemo(() => {
    const end = until ? new Date(`${until}T23:59:59`) : new Date();
    const start = since ? new Date(since) : new Date(end.getTime() - 30 * 86400_000);
    const span = end.getTime() - start.getTime();
    const prevStart = new Date(start.getTime() - span);
    const inRange = (p: Post, a: Date, b: Date) => p.published_at && new Date(p.published_at) >= a && new Date(p.published_at) <= b;
    const cur = analyticsPosts.filter((p) => inRange(p, start, end));
    const prev = analyticsPosts.filter((p) => inRange(p, prevStart, new Date(start.getTime() - 1)));
    const sum = (list: Post[], k: keyof Metrics) => list.reduce((acc, p) => acc + (Number(p.metrics_latest?.[k]) || 0), 0);
    return (["reach", "views", "total_interactions"] as (keyof Metrics)[]).map((k) => ({ k, cur: sum(cur, k), prev: sum(prev, k) })).concat([{ k: "posts" as any, cur: cur.length, prev: prev.length }]);
  }, [analyticsPosts, since, until]);

  const ranking = useMemo(() => [...posts].filter((p) => p.format !== "story").sort((a, b) => engagement(b.metrics_latest ?? {}) - engagement(a.metrics_latest ?? {})).slice(0, 5), [posts]);
  const growthSeries = useMemo(() => profile.map((r) => ({ date: r.snapshot_date, followers: r.followers, reach: r.reach })), [profile]);

  const filteredAccounts = accounts.filter((a) => network === "all" || a.network === network);

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-6">
          <div className="space-y-1"><span className="text-xs text-muted-foreground">Rede</span>
            <Select value={network} onValueChange={(v) => { setNetwork(v); setAccountId("all"); }}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">Todas</SelectItem><SelectItem value="instagram">Instagram</SelectItem><SelectItem value="facebook">Facebook</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><span className="text-xs text-muted-foreground">Conta</span>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">Todas as contas</SelectItem>{filteredAccounts.map((a) => <SelectItem key={a.id} value={a.id}>{accountLabel(a)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><span className="text-xs text-muted-foreground">Formato</span>
            <Select value={format} onValueChange={setFormat}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">Todos</SelectItem>{Object.entries(FORMAT_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><span className="text-xs text-muted-foreground">De</span><Input type="date" value={since} onChange={(e) => setSince(e.target.value)} className="w-40" /></div>
          <div className="space-y-1"><span className="text-xs text-muted-foreground">Até</span><Input type="date" value={until} onChange={(e) => setUntil(e.target.value)} className="w-40" /></div>
          <div className="ml-auto flex gap-2">
            <Button variant="outline" size="icon" aria-label="Galeria" onClick={() => setView("grid")} className={view === "grid" ? "bg-accent" : ""}><Grid3x3 className="h-4 w-4" /></Button>
            <Button variant="outline" size="icon" aria-label="Tabela" onClick={() => setView("table")} className={view === "table" ? "bg-accent" : ""}><LayoutList className="h-4 w-4" /></Button>
            <Button variant="outline" onClick={() => runSync(true)} disabled={syncing}>Completa</Button>
            <Button onClick={() => runSync(false)} disabled={syncing}>{syncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}Sincronizar histórico</Button>
          </div>
        </CardContent>
      </Card>

      {error && <Card className="border-destructive/40"><CardContent className="flex items-start gap-2 pt-6 text-sm text-destructive"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{error}</CardContent></Card>}

      {summary && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Resumo da sincronização</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            {summary.map((s: any) => {
              const acc = accounts.find((a) => a.id === s.accountId);
              return (
                <div key={s.accountId} className="rounded-md border p-3">
                  <div className="mb-1 flex items-center gap-2 font-medium">{acc ? accountLabel(acc) : s.network}<Badge variant={s.status === "ok" ? "secondary" : "destructive"}>{s.status}</Badge></div>
                  <div className="text-muted-foreground">{s.counts.posts} publicações importadas · {s.counts.comments} comentários · {s.counts.stories} stories · {s.counts.archived} mídias arquivadas</div>
                  <div className="text-muted-foreground">Métricas: {s.counts.snapshots_full ?? 0} snapshot(s) com dados do Graph ({s.counts.graph_metrics ?? 0} valores) · {s.counts.snapshots_fallback ?? 0} básico(s) com curtidas/comentários da publicação ({s.counts.basic_metrics ?? 0} valores){s.counts.db_errors ? ` · ${s.counts.db_errors} erro(s) de gravação` : ""}</div>
                  {s.stages.some((st: any) => st.stage === "posts" && !st.ok && st.kind === "permission_missing" && s.network === "facebook") && (
                    <div className="mt-1 text-destructive">Permissão ausente no Facebook: a Meta exige pages_read_user_content ou Page Public Content Access para ler as publicações da Página.</div>
                  )}
                  {(s.breakers ?? []).length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">{s.breakers.map((b: any, i: number) => <Badge key={i} variant="outline">Circuit breaker: {b.stage} [{b.kind}]</Badge>)}</div>
                  )}
                  <ul className="mt-2 space-y-0.5">
                    {s.stages.map((st: any, i: number) => (
                      <li key={i} className="flex items-start gap-1.5">
                        {st.ok ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 text-primary" /> : <XCircle className="mt-0.5 h-3.5 w-3.5 text-destructive" />}
                        <span><b>{st.stage}</b>{st.kind ? ` [${st.kind}]` : ""}{st.count !== undefined ? ` — ${st.count}` : ""}{st.message ? ` — ${st.message}` : ""}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-4">
        {comparison.map((c) => {
          const delta = c.prev ? Math.round(((c.cur - c.prev) / c.prev) * 100) : null;
          return (
            <Card key={String(c.k)}><CardContent className="pt-5">
              <div className="text-xs text-muted-foreground">{c.k === ("posts" as any) ? "Publicações" : METRIC_LABEL[c.k as string]}</div>
              <div className="text-2xl font-bold">{fmt(c.cur)}</div>
              <div className="text-xs text-muted-foreground">anterior: {fmt(c.prev)}{delta !== null ? ` (${delta >= 0 ? "+" : ""}${delta}%)` : ""}</div>
            </CardContent></Card>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Crescimento do perfil</CardTitle></CardHeader>
          <CardContent className="h-56">
            {growthSeries.length < 2 ? <p className="text-sm text-muted-foreground">Ainda há poucos registros diários. O gráfico aparece após duas sincronizações em dias diferentes.</p> : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={growthSeries}><CartesianGrid strokeDasharray="3 3" className="stroke-border" /><XAxis dataKey="date" fontSize={11} /><YAxis fontSize={11} /><Tooltip /><Line type="monotone" dataKey="followers" name="Seguidores" stroke="hsl(var(--primary))" dot={false} /></LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Ranking por interações</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {ranking.length === 0 ? <p className="text-sm text-muted-foreground">Sem publicações com métricas.</p> : ranking.map((p, i) => (
              <button key={p.id} type="button" onClick={() => setOpen(p)} className="flex w-full items-center gap-3 rounded-md p-1 text-left hover:bg-accent">
                <span className="w-4 text-sm font-bold text-muted-foreground">{i + 1}</span>
                <div className="h-10 w-10 overflow-hidden rounded"><PostMedia post={p} /></div>
                <span className="line-clamp-1 flex-1 text-sm">{p.caption || FORMAT_LABEL[p.format]}</span>
                <span className="text-sm font-semibold">{fmt(engagement(p.metrics_latest ?? {}))}</span>
              </button>
            ))}
          </CardContent>
        </Card>
      </div>

      <MetaSocialIntelligence posts={posts} />

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando histórico…</div>
      ) : posts.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Nenhuma publicação armazenada com esses filtros. Clique em “Sincronizar histórico” para importar da Meta.</CardContent></Card>
      ) : view === "grid" ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {posts.map((p) => (
            <button key={p.id} type="button" onClick={() => setOpen(p)} className="group overflow-hidden rounded-lg border bg-card text-left">
              <div className="relative aspect-square overflow-hidden">
                <PostMedia post={p} />
                <Badge className="absolute left-2 top-2 gap-1" variant="secondary"><FormatIcon format={p.format} />{FORMAT_LABEL[p.format]}</Badge>
              </div>
              <div className="space-y-1 p-2 text-xs">
                <div className="line-clamp-1 text-muted-foreground">{p.published_at ? new Date(p.published_at).toLocaleDateString("pt-BR") : "—"} · {p.network === "instagram" ? "IG" : "FB"}</div>
                <div className="flex gap-3"><span>❤ {fmt(p.metrics_latest?.likes)}</span><span>💬 {fmt(p.metrics_latest?.comments)}</span><span>👁 {fmt(p.metrics_latest?.views ?? p.metrics_latest?.reach)}</span></div>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <Card><CardContent className="pt-4">
          <Table>
            <TableHeader><TableRow><TableHead>Publicação</TableHead><TableHead>Formato</TableHead><TableHead>Data</TableHead>{(["likes", "comments", "shares", "saves", "reach", "views", "total_interactions"] as const).map((k) => <TableHead key={k} className="text-right">{METRIC_LABEL[k]}</TableHead>)}</TableRow></TableHeader>
            <TableBody>
              {posts.map((p) => (
                <TableRow key={p.id} className="cursor-pointer" onClick={() => setOpen(p)}>
                  <TableCell className="max-w-[260px]"><div className="flex items-center gap-2"><div className="h-9 w-9 shrink-0 overflow-hidden rounded"><PostMedia post={p} /></div><span className="line-clamp-1">{p.caption || "—"}</span></div></TableCell>
                  <TableCell>{FORMAT_LABEL[p.format]}</TableCell>
                  <TableCell>{p.published_at ? new Date(p.published_at).toLocaleDateString("pt-BR") : "—"}</TableCell>
                  {(["likes", "comments", "shares", "saves", "reach", "views", "total_interactions"] as const).map((k) => <TableCell key={k} className="text-right">{fmt(p.metrics_latest?.[k])}</TableCell>)}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent></Card>
      )}

      <PostDetailDialog post={open} account={accounts.find((a) => a.id === open?.social_account_id) ?? null} onClose={() => setOpen(null)} />
    </div>
  );
}

function PostDetailDialog({ post, account, onClose }: { post: Post | null; account: Account | null; onClose: () => void }) {
  const getDetail = useServerFn(getStoredMetaPost);
  const reply = useServerFn(replyMetaComment);
  const [detail, setDetail] = useState<{ snapshots: any[]; media: any[]; comments: any[] } | null>(null);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!post) { setDetail(null); return; }
    let alive = true;
    getDetail({ data: { postId: post.id } }).then((d) => { if (alive) setDetail(d); }).catch(() => alive && setDetail({ snapshots: [], media: [], comments: [] }));
    return () => { alive = false; };
  }, [post, getDetail]);

  async function send() {
    if (!replyTo || !text.trim() || !account?.instance_name) return;
    setSending(true);
    try {
      await reply({ data: { instanceName: account.instance_name, commentId: replyTo, message: text.trim() } });
      toast.success("Resposta enviada pela API oficial. Ela aparece aqui após a próxima sincronização.");
      setText(""); setReplyTo(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao responder.");
    } finally {
      setSending(false);
    }
  }

  const top = (detail?.comments ?? []).filter((c) => !c.parent_external_id);
  const repliesOf = (id: string) => (detail?.comments ?? []).filter((c) => c.parent_external_id === id);
  const series = (detail?.snapshots ?? []).map((s) => ({ date: s.collected_date, reach: s.reach, views: s.views, interactions: s.total_interactions ?? s.likes }));
  const last = detail?.snapshots?.[detail.snapshots.length - 1];

  return (
    <Dialog open={Boolean(post)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader><DialogTitle className="flex items-center gap-2">{post ? FORMAT_LABEL[post.format] : ""}{post?.permalink && <a href={post.permalink} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground"><ExternalLink className="h-4 w-4" /></a>}</DialogTitle></DialogHeader>
        {post && (
          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-3">
              <div className="aspect-square overflow-hidden rounded-md border"><PostMedia post={post} controls /></div>
              {(detail?.media?.length ?? 0) > 1 && (
                <div>
                  <div className="mb-2 text-xs font-medium text-muted-foreground">Itens do carrossel ({detail?.media.length})</div>
                  <div className="grid grid-cols-3 gap-2">
                    {detail?.media.map((item: any) => {
                      const src = item.archived_url ?? item.media_url;
                      const video = /video|reel/i.test(String(item.media_type ?? ""));
                      return <div key={item.position} className="aspect-square overflow-hidden rounded-md border bg-muted">{src ? (video ? <video src={src} controls playsInline className="h-full w-full object-contain" /> : <img src={src} alt={`Mídia ${item.position + 1}`} loading="lazy" className="h-full w-full object-cover" />) : <div className="flex h-full items-center justify-center text-xs text-muted-foreground">Sem mídia</div>}</div>;
                    })}
                  </div>
                </div>
              )}
              {post.caption && <p className="whitespace-pre-wrap text-sm">{post.caption}</p>}
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-2">
                {Object.keys(METRIC_LABEL).map((k) => {
                  let v = (last?.[k] ?? post.metrics_latest?.[k as keyof Metrics]) as number | null | undefined;
                  if (k === "avg_watch_time_ms" && typeof v === "number") v = Math.round(v / 1000);
                  if (k === "total_watch_time_ms" && typeof v === "number") v = Math.round(v / 60000);
                  if (v === null || v === undefined) return null;
                  return <div key={k} className="rounded-md border p-2"><div className="text-[11px] text-muted-foreground">{METRIC_LABEL[k]}</div><div className="font-semibold">{fmt(v)}</div></div>;
                })}
              </div>
              {last?.unavailable && <p className="text-xs text-muted-foreground">Não fornecido pela Meta: {Object.entries(last.unavailable).map(([k, r]) => `${k} (${r})`).join(", ")}</p>}
              <div className="h-40">
                {series.length < 2 ? <p className="text-xs text-muted-foreground">A evolução aparece após coletas em dias diferentes.</p> : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={series}><XAxis dataKey="date" fontSize={10} /><YAxis fontSize={10} /><Tooltip /><Line dataKey="reach" name="Alcance" stroke="hsl(var(--primary))" dot={false} /><Line dataKey="interactions" name="Interações" stroke="hsl(var(--muted-foreground))" dot={false} /></LineChart>
                  </ResponsiveContainer>
                )}
              </div>
              <div>
                <h4 className="mb-2 text-sm font-semibold">Comentários armazenados ({detail?.comments.length ?? 0})</h4>
                {!detail ? <Loader2 className="h-4 w-4 animate-spin" /> : top.length === 0 ? <p className="text-xs text-muted-foreground">Sem comentários armazenados.</p> : (
                  <ul className="space-y-2">
                    {top.map((c) => (
                      <li key={c.id} className="rounded-md border p-2 text-sm">
                        <div className="text-xs text-muted-foreground">{c.author_username ? `@${c.author_username}` : c.author_name ?? "—"} · {c.commented_at ? new Date(c.commented_at).toLocaleString("pt-BR") : ""}{c.like_count ? ` · ❤ ${c.like_count}` : ""}{c.status === "hidden" ? " · oculto" : ""}</div>
                        <div>{c.text}</div>
                        {repliesOf(c.external_comment_id).map((r) => (
                          <div key={r.id} className="ml-4 mt-1 border-l pl-2 text-xs"><span className="text-muted-foreground">{r.is_own ? "Você" : r.author_username ? `@${r.author_username}` : r.author_name}:</span> {r.text}</div>
                        ))}
                        {account?.instance_name && <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => setReplyTo(c.external_comment_id)}>Responder</Button>}
                        {replyTo === c.external_comment_id && (
                          <div className="mt-1 space-y-1"><Textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={2000} /><Button size="sm" onClick={send} disabled={sending || !text.trim()}>{sending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}Enviar</Button></div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

type Check = { key: string; label: string; status: "ok" | "warn" | "fail" | "skip"; detail: string; access?: string };

export function MetaDiagnosticsPanel() {
  const listAccounts = useServerFn(listMetaSocialAccounts);
  const diagnose = useServerFn(runMetaChannelDiagnostics);
  const reconcile = useServerFn(reconcileMetaAssets);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selected, setSelected] = useState("");
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [running, setRunning] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      let r = await listAccounts();
      if (!r.error && r.accounts.length === 0) {
        const rec = await reconcile().catch(() => null);
        for (const w of rec?.warnings ?? []) toast.warning(w);
        if (rec && !rec.ok && rec.error) toast.error(rec.error);
        r = await listAccounts();
      }
      setAccounts(r.accounts as Account[]);
      setLoadError(r.error);
      const first = (r.accounts as Account[]).find((a) => a.instance_name);
      if (first?.instance_name) setSelected(first.instance_name);
    })().catch((e) => setLoadError(e instanceof Error ? e.message : String(e)));
  }, [listAccounts, reconcile]);

  async function run() {
    if (!selected) return;
    setRunning(true);
    try { setChecks((await diagnose({ data: { instanceName: selected } })).checks as Check[]); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Falha no diagnóstico."); }
    finally { setRunning(false); }
  }

  const icon = (s: Check["status"]) => s === "ok" ? <CheckCircle2 className="h-4 w-4 text-primary" /> : s === "warn" ? <AlertTriangle className="h-4 w-4 text-muted-foreground" /> : s === "fail" ? <XCircle className="h-4 w-4 text-destructive" /> : <CircleSlash className="h-4 w-4 text-muted-foreground" />;
  const accessLabel: Record<string, string> = { standard: "Standard Access", advanced_missing: "Falta Advanced Access", permission_missing: "Permissão ausente", endpoint_failure: "Falha do endpoint" };

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Stethoscope className="h-4 w-4" />Diagnóstico Meta (somente leitura)</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {loadError && <p className="text-sm text-destructive">{loadError}</p>}
        <div className="flex flex-wrap gap-2">
          <Select value={selected} onValueChange={setSelected}>
            <SelectTrigger className="w-72"><SelectValue placeholder="Escolha um canal" /></SelectTrigger>
            <SelectContent>{accounts.filter((a) => a.instance_name).map((a) => <SelectItem key={a.id} value={a.instance_name!}>{accountLabel(a)}</SelectItem>)}</SelectContent>
          </Select>
          <Button onClick={run} disabled={!selected || running}>{running && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Executar diagnóstico</Button>
        </div>
        {checks && (
          <ul className="divide-y rounded-md border">
            {checks.map((c) => (
              <li key={c.key} className="flex items-start gap-3 p-3 text-sm">
                <span className="mt-0.5">{icon(c.status)}</span>
                <div className="flex-1"><div className="font-medium">{c.label}</div><div className="break-words text-muted-foreground">{c.detail}</div></div>
                {c.access && <Badge variant="outline">{accessLabel[c.access] ?? c.access}</Badge>}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
