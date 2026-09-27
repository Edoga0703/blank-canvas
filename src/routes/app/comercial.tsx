import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { brand } from "@/config/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { KpiCard, MetaCard } from "@/components/comercial/comercial-widgets";
import { PeriodFilter, defaultPeriod, type PeriodValue } from "@/components/comercial/period-filter";
import { VendaDialog, type VendaRow } from "@/components/comercial/venda-dialog";
import { MetaDialog, type MetaTarget } from "@/components/comercial/meta-dialog";
import { ProdutoEditDialog } from "@/components/catalogo/produto-edit-dialog";
import { saveProduto, deleteProduto, listProdutos, type Produto } from "@/lib/produtos.functions";
import { deleteSale } from "@/lib/comercial.functions";
import { getComercialStats, getTeamPerformance, getProductStats, getProductsPerformance, getReportsData } from "@/lib/comercial-stats.functions";
import { exportCSV, printReport } from "@/lib/comercial-export";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { HelpTip } from "@/components/help-tip";
import {
  DollarSign, Receipt, TrendingUp, Target, Users, BarChart3, Search, Plus,
  MoreVertical, Trash2, Pencil, Trophy, Download, Edit3, ShoppingBag, Loader2,
} from "lucide-react";
import { InitialsAvatar } from "@/components/ui/initials-avatar";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { toast } from "sonner";

export const Route = createFileRoute("/app/comercial")({
  head: () => ({
    meta: [
      { title: `${brand.name} — Comercial` },
      { name: "description", content: "Gestão de vendas, metas, produtos e relatórios comerciais no Capi Conversa." },
      { property: "og:title", content: `${brand.name} — Comercial` },
      { property: "og:description", content: "Gestão de vendas, metas, produtos e relatórios comerciais no Capi Conversa." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ComercialPage,
});

const fmtBRL = (cents: number) => ((cents || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "2-digit" }) : "—");

const REPORTS = [
  { key: "resumo-vendas", label: "Resumo de vendas", icon: BarChart3 },
  { key: "desempenho-equipe", label: "Desempenho da equipe", icon: Users },
  { key: "produtos-servicos", label: "Produtos e serviços", icon: Receipt },
  { key: "metas-relatorio", label: "Metas", icon: Target },
] as const;

function ComercialPage() {
  const ctx = Route.useRouteContext();
  const companyId = ctx.company?.id ?? "";
  const qc = useQueryClient();

  const statsFn = useServerFn(getComercialStats);
  const teamFn = useServerFn(getTeamPerformance);
  const productStatsFn = useServerFn(getProductStats);
  const productsPerformanceFn = useServerFn(getProductsPerformance);
  const reportsDataFn = useServerFn(getReportsData);
  const saveProdutoFn = useServerFn(saveProduto);
  const deleteProdutoFn = useServerFn(deleteProduto);
  const listProdutosFn = useServerFn(listProdutos);
  const deleteSaleFn = useServerFn(deleteSale);

  const [tab, setTab] = useState("visao-geral");
  const [periodoGeral, setPeriodoGeral] = useState<PeriodValue>(defaultPeriod());
  const [periodoVendas, setPeriodoVendas] = useState<PeriodValue>(defaultPeriod());
  const [activeReport, setActiveReport] = useState<string>("resumo-vendas");

  const [selectedVenda, setSelectedVenda] = useState<any>(null);
  const [vendaDialog, setVendaDialog] = useState<{ open: boolean; venda?: VendaRow | null }>({ open: false });
  const [metaDialog, setMetaDialog] = useState<{ open: boolean; target?: MetaTarget | null }>({ open: false });
  const [produtoDialog, setProdutoDialog] = useState<Partial<Produto> | null>(null);
  const [rankingOpen, setRankingOpen] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  const [busca, setBusca] = useState("");
  const [fItem, setFItem] = useState("todos");
  const [fCanal, setFCanal] = useState("todos");
  const [fVendedor, setFVendedor] = useState("todos");
  const [buscaProduto, setBuscaProduto] = useState("");
  const [vendas, setVendas] = useState<any[]>([]);
  const [loadingVendas, setLoadingVendas] = useState(true);

  const rangeGeral = periodoGeral.range;
  const rangeVendas = periodoVendas.range;

  const statsQ = useQuery({
    queryKey: ["comercial-stats", companyId, rangeGeral.from, rangeGeral.to],
    queryFn: () => statsFn({ data: { companyId, from: rangeGeral.from, to: rangeGeral.to } }),
    enabled: !!companyId,
  });
  const teamQ = useQuery({
    queryKey: ["team-performance", companyId, rangeGeral.from, rangeGeral.to],
    queryFn: () => teamFn({ data: { companyId, from: rangeGeral.from, to: rangeGeral.to } }),
    enabled: !!companyId,
  });
  const productStatsQ = useQuery({
    queryKey: ["product-stats", companyId, rangeGeral.from, rangeGeral.to],
    queryFn: () => productStatsFn({ data: { companyId, from: rangeGeral.from, to: rangeGeral.to } }),
    enabled: !!companyId,
  });
  const productsPerformanceQ = useQuery({
    queryKey: ["products-performance", companyId, rangeGeral.from, rangeGeral.to],
    queryFn: () => productsPerformanceFn({ data: { companyId, from: rangeGeral.from, to: rangeGeral.to } }),
    enabled: !!companyId,
  });
  const reportsDataQ = useQuery({
    queryKey: ["reports-data", companyId, rangeGeral.from, rangeGeral.to],
    queryFn: () => reportsDataFn({ data: { companyId, from: rangeGeral.from, to: rangeGeral.to } }),
    enabled: !!companyId,
  });

  const stats = statsQ.data ?? { receitaMes: 0, vendasRealizadas: 0, variacaoReceita: 0, ticketMedio: 0, metaGeral: 0, metaAlcancada: 0 };
  const team = (teamQ.data ?? []) as any[];
  const productStats = productStatsQ.data ?? { produtosAtivos: 0, maisVendido: "—", receitaProdutos: 0 };
  const productsPerformance = (productsPerformanceQ.data ?? []) as any[];
  const reportsData = reportsDataQ.data ?? { chart: [] };

  const members = useMemo(() => team.map((t) => ({ user_id: t.user_id, nome: t.nome })), [team]);

  const loadVendas = useCallback(async () => {
    if (!companyId) return;
    setLoadingVendas(true);
    const { data } = await supabase
      .from("crm_venda")
      .select("*")
      .eq("company_id", companyId)
      .gte("vendido_em", rangeVendas.from)
      .lt("vendido_em", rangeVendas.to)
      .order("vendido_em", { ascending: false })
      .limit(500);
    setVendas(data || []);
    setLoadingVendas(false);
  }, [companyId, rangeVendas.from, rangeVendas.to]);

  useEffect(() => { void loadVendas(); }, [loadVendas]);

  const refreshAll = useCallback(() => {
    void loadVendas();
    ["comercial-stats", "team-performance", "product-stats", "products-performance", "reports-data"].forEach((k) =>
      qc.invalidateQueries({ queryKey: [k] }),
    );
  }, [loadVendas, qc]);

  const sellerMap = useMemo(() => {
    const m = new Map<string, { nome: string; avatar_url?: string | null }>();
    team.forEach((t) => { if (t?.user_id) m.set(t.user_id, { nome: t.nome, avatar_url: t.avatar_url }); });
    return m;
  }, [team]);
  const sellerName = (ownerId?: string | null) =>
    (ownerId && sellerMap.get(ownerId)?.nome) || (ownerId ? "Atendente" : "Não atribuído");

  const opcoesItem = useMemo(
    () => Array.from(new Set(vendas.map((v) => v.item_nome).filter(Boolean))).sort() as string[],
    [vendas],
  );
  const opcoesCanal = useMemo(
    () => Array.from(new Set(vendas.map((v) => v.canal).filter(Boolean))).sort() as string[],
    [vendas],
  );
  const opcoesVendedor = useMemo(() => {
    const ids = Array.from(new Set(vendas.map((v) => v.owner_id).filter(Boolean))) as string[];
    return ids.map((id) => ({ id, nome: sellerName(id) })).sort((a, b) => a.nome.localeCompare(b.nome));
  }, [vendas, sellerMap]);

  const filteredVendas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return vendas.filter((v) => {
      if (fItem !== "todos" && (v.item_nome || "") !== fItem) return false;
      if (fCanal !== "todos" && (v.canal || "") !== fCanal) return false;
      if (fVendedor !== "todos" && (v.owner_id || "") !== fVendedor) return false;
      if (!q) return true;
      return (
        v.contato_nome?.toLowerCase().includes(q) ||
        v.item_nome?.toLowerCase().includes(q) ||
        sellerName(v.owner_id).toLowerCase().includes(q)
      );
    });
  }, [vendas, busca, fItem, fCanal, fVendedor, sellerMap]);

  const totalFiltrado = useMemo(
    () => filteredVendas.reduce((s, v) => s + (v.valor_cents || 0), 0),
    [filteredVendas],
  );
  const filtrosAtivos = fItem !== "todos" || fCanal !== "todos" || fVendedor !== "todos" || !!busca.trim();


  const filteredProdutos = useMemo(() => {
    const q = buscaProduto.trim().toLowerCase();
    if (!q) return productsPerformance;
    return productsPerformance.filter((p) => p.nome?.toLowerCase().includes(q) || p.categoria?.toLowerCase().includes(q));
  }, [productsPerformance, buscaProduto]);

  async function handleDeleteVenda(id: string) {
    if (!confirm("Excluir esta venda?")) return;
    try { await deleteSaleFn({ data: { id } }); toast.success("Venda excluída"); setSelectedVenda(null); refreshAll(); }
    catch (e: any) { toast.error(e?.message ?? "Erro ao excluir"); }
  }

  async function handleDeleteProduto(id: string) {
    if (!confirm("Excluir este item do catálogo?")) return;
    try { await deleteProdutoFn({ data: { id } }); toast.success("Item excluído"); refreshAll(); }
    catch (e: any) { toast.error(e?.message ?? "Erro ao excluir"); }
  }

  async function openProdutoEdit(id: string) {
    try {
      const all = (await listProdutosFn()) as Produto[];
      const found = all.find((p) => p.id === id);
      if (!found) return toast.error("Item não encontrado no catálogo");
      setProdutoDialog(found);
    } catch (e: any) { toast.error(e?.message ?? "Erro ao abrir item"); }
  }

  // ---------- Relatórios ----------
  const reportMeta = useMemo(() => {
    const subtitulo = `${periodoGeral.label} · ${new Date(rangeGeral.from).toLocaleDateString("pt-BR")} a ${new Date(new Date(rangeGeral.to).getTime() - 1).toLocaleDateString("pt-BR")}`;
    const resumo = [
      { label: "Receita", value: fmtBRL(stats.receitaMes) },
      { label: "Vendas", value: String(stats.vendasRealizadas) },
      { label: "Ticket médio", value: fmtBRL(stats.ticketMedio) },
    ];
    if (activeReport === "desempenho-equipe") {
      return {
        titulo: "Desempenho da equipe", subtitulo, resumo,
        headers: ["Vendedor", "Vendas", "Receita", "Ticket médio", "Meta", "Progresso"],
        rows: team.map((t) => [t.nome, t.vendas, fmtBRL(t.receita), fmtBRL(t.ticketMedio), fmtBRL(t.meta), `${t.progressoMeta}%`]),
      };
    }
    if (activeReport === "produtos-servicos") {
      return {
        titulo: "Produtos e serviços", subtitulo,
        resumo: [
          { label: "Itens ativos", value: String(productStats.produtosAtivos) },
          { label: "Mais vendido", value: productStats.maisVendido },
          { label: "Receita", value: fmtBRL(productStats.receitaProdutos) },
        ],
        headers: ["Item", "Categoria", "Vendas", "Receita", "Ticket médio"],
        rows: productsPerformance.map((p) => [p.nome, p.categoria || "Geral", p.vendas, fmtBRL(p.receita), fmtBRL(p.ticketMedio)]),
      };
    }
    if (activeReport === "metas-relatorio") {
      return {
        titulo: "Metas", subtitulo,
        resumo: [
          { label: "Meta geral", value: fmtBRL(stats.metaGeral) },
          { label: "Realizado", value: fmtBRL(stats.receitaMes) },
          { label: "Atingimento", value: `${stats.metaAlcancada}%` },
        ],
        headers: ["Vendedor", "Meta", "Realizado", "Progresso", "Falta"],
        rows: team.map((t) => [t.nome, fmtBRL(t.meta), fmtBRL(t.receita), `${t.progressoMeta}%`, fmtBRL(Math.max(0, t.meta - t.receita))]),
      };
    }
    const filtroDesc = [
      fItem !== "todos" ? `Item: ${fItem}` : null,
      fCanal !== "todos" ? `Canal: ${fCanal}` : null,
      fVendedor !== "todos" ? `Vendedor: ${sellerName(fVendedor)}` : null,
      busca.trim() ? `Busca: ${busca.trim()}` : null,
    ].filter(Boolean).join(" · ");
    return {
      titulo: "Resumo de vendas",
      subtitulo: filtroDesc ? `${subtitulo} · ${filtroDesc}` : subtitulo,
      resumo: [
        { label: "Vendas", value: String(filteredVendas.length) },
        { label: "Receita", value: fmtBRL(totalFiltrado) },
        { label: "Ticket médio", value: fmtBRL(filteredVendas.length ? Math.round(totalFiltrado / filteredVendas.length) : 0) },
      ],
      headers: ["Data", "Cliente", "Item", "Canal", "Vendedor", "Pagamento", "Valor"],
      rows: filteredVendas.map((v) => [fmtDate(v.vendido_em), v.contato_nome, v.item_nome || "—", v.canal || "—", sellerName(v.owner_id), v.metodo_pagamento || "—", fmtBRL(v.valor_cents)]),
    };
  }, [activeReport, team, productsPerformance, filteredVendas, totalFiltrado, busca, fItem, fCanal, fVendedor, stats, productStats, periodoGeral.label, rangeGeral, sellerMap]);


  function handleExportVendas() {
    if (!filteredVendas.length) return toast.error("Nenhuma venda para exportar");
    exportCSV(
      `vendas-${new Date().toISOString().slice(0, 10)}`,
      ["Data", "Cliente", "Item", "Canal", "Vendedor", "Pagamento", "Valor"],
      filteredVendas.map((v) => [fmtDate(v.vendido_em), v.contato_nome, v.item_nome || "—", v.canal || "—", sellerName(v.owner_id), v.metodo_pagamento || "—", fmtBRL(v.valor_cents)]),
    );
    toast.success("Vendas exportadas");
  }

  function handleExport() {
    if (!reportMeta.rows.length) return toast.error("Sem dados no período selecionado");
    exportCSV(`${reportMeta.titulo.toLowerCase().replace(/\s+/g, "-")}-${new Date().toISOString().slice(0, 10)}`, reportMeta.headers, reportMeta.rows as any);
    toast.success("Planilha exportada");
  }
  async function handlePDF() {
    if (!reportMeta.rows.length) return toast.error("Sem dados no período selecionado");
    setGeneratingPdf(true);
    try {
      await printReport(reportMeta.titulo, reportMeta.subtitulo, reportMeta.headers, reportMeta.rows as any, reportMeta.resumo);
      toast.success("PDF gerado no padrão Metrix");
    } catch (error) {
      console.error("Falha ao gerar PDF comercial", error);
      toast.error("Não foi possível gerar o PDF");
    } finally {
      setGeneratingPdf(false);
    }
  }

  const maxVendasProduto = Math.max(...productsPerformance.map((p) => p.vendas), 1);
  const faltaMeta = Math.max(0, stats.metaGeral - stats.receitaMes);

  return (
    <div className="space-y-6">
      {/* Cabeçalho padrão Metrix */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-[26px] font-extrabold tracking-tight flex items-center gap-2">
            Comercial <HelpTip text="Acompanhe vendas, metas, produtos e o desempenho da equipe." />
          </h1>
          <p className="text-sm text-muted-foreground">Receita, metas e performance de vendas em um só lugar.</p>
        </div>
        <Button onClick={() => setVendaDialog({ open: true, venda: null })} className="gap-2">
          <Plus className="size-4" /> Nova venda
        </Button>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="bg-[color:var(--panel)] p-1 rounded-xl border border-[color:var(--hairline)] h-auto w-full sm:w-auto overflow-x-auto justify-start">
          {[["visao-geral", "Visão geral"], ["vendas", "Vendas"], ["metas", "Metas"], ["produtos", "Produtos"], ["relatorios", "Relatórios"]].map(([v, l]) => (
            <TabsTrigger key={v} value={v} className="rounded-lg font-bold text-xs px-4 py-2 data-[state=active]:bg-[color:var(--brand)] data-[state=active]:text-white">{l}</TabsTrigger>
          ))}
        </TabsList>

        {/* ================= VISÃO GERAL ================= */}
        <TabsContent value="visao-geral" className="space-y-6 pt-6">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Período: {periodoGeral.label}</p>
            <PeriodFilter value={periodoGeral} onChange={setPeriodoGeral} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard icon={<DollarSign />} label="Receita" value={fmtBRL(stats.receitaMes)} variation={stats.variacaoReceita} hero />
            <KpiCard icon={<Receipt />} label="Vendas" value={String(stats.vendasRealizadas)} />
            <KpiCard icon={<TrendingUp />} label="Ticket médio" value={fmtBRL(stats.ticketMedio)} />
            <MetaCard meta={stats.metaGeral} receitaMes={stats.receitaMes} pct={stats.metaAlcancada} onEdit={() => setMetaDialog({ open: true, target: { userId: null, valorCents: stats.metaGeral } })} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-bold text-sm flex items-center gap-2"><Receipt className="size-4 text-[color:var(--brand)]" /> Vendas recentes</h2>
                <Button variant="ghost" size="sm" className="text-xs font-bold text-[color:var(--brand)]" onClick={() => setTab("vendas")}>Ver todas</Button>
              </div>
              <div className="bg-[color:var(--panel)] rounded-2xl border border-[color:var(--hairline)] overflow-hidden">
                <table className="w-full text-left">
                  <thead className="bg-muted/40 text-[10px] uppercase font-semibold text-muted-foreground tracking-wider border-b border-[color:var(--hairline)]">
                    <tr><th className="px-5 py-3">Data</th><th className="px-5 py-3">Cliente</th><th className="px-5 py-3">Item</th><th className="px-5 py-3 text-right">Valor</th></tr>
                  </thead>
                  <tbody className="divide-y divide-[color:var(--hairline)]">
                    {loadingVendas ? (
                      <tr><td colSpan={4} className="p-10 text-center text-xs text-muted-foreground">Carregando...</td></tr>
                    ) : vendas.length === 0 ? (
                      <tr><td colSpan={4} className="p-10 text-center text-xs text-muted-foreground">Nenhuma venda no período.</td></tr>
                    ) : vendas.slice(0, 6).map((v) => (
                      <tr key={v.id} className="hover:bg-muted/20 transition-colors cursor-pointer" onClick={() => setSelectedVenda(v)}>
                        <td className="px-5 py-4 text-[11px] font-bold text-muted-foreground uppercase">{fmtDate(v.vendido_em)}</td>
                        <td className="px-5 py-4 text-sm font-bold">{v.contato_nome}</td>
                        <td className="px-5 py-4 text-xs text-muted-foreground">{v.item_nome || "—"}</td>
                        <td className="px-5 py-4 text-right text-sm font-bold text-[color:var(--brand)]">{fmtBRL(v.valor_cents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="space-y-3">
              <h2 className="font-bold text-sm flex items-center gap-2"><Trophy className="size-4 text-amber-500" /> Ranking do período</h2>
              <div className="bg-[color:var(--panel)] rounded-2xl border border-[color:var(--hairline)] p-5 space-y-5">
                {team.length === 0 && <p className="text-xs text-muted-foreground py-6 text-center">Sem dados de equipe.</p>}
                {team.slice(0, 3).map((member, i) => (
                  <div key={member.user_id} className="flex items-center gap-4">
                    <div className="relative">
                      <InitialsAvatar name={member.nome} src={member.avatar_url} className="size-11" />
                      <div className={`absolute -top-1 -right-1 size-5 rounded-lg border-2 border-[color:var(--panel)] grid place-items-center text-[10px] font-bold text-white ${i === 0 ? "bg-amber-400" : i === 1 ? "bg-slate-400" : "bg-amber-600"}`}>{i + 1}</div>
                    </div>
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex justify-between items-end gap-2">
                        <p className="text-sm font-bold truncate">{member.nome}</p>
                        <p className="text-[11px] font-bold text-[color:var(--brand)]">{fmtBRL(member.receita)}</p>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className={`h-full ${i === 0 ? "bg-amber-400" : i === 1 ? "bg-slate-400" : "bg-amber-600"}`} style={{ width: `${Math.min(100, member.progressoMeta || 0)}%` }} />
                      </div>
                    </div>
                  </div>
                ))}
                <div className="pt-3 border-t border-[color:var(--hairline)]">
                  <Button variant="ghost" className="w-full text-xs font-bold text-[color:var(--brand)]" onClick={() => setRankingOpen(true)}>Ver ranking completo</Button>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* ================= VENDAS ================= */}
        <TabsContent value="vendas" className="pt-6">
          <div className="bg-[color:var(--panel)] rounded-2xl border border-[color:var(--hairline)] overflow-hidden">
            <div className="p-5 border-b border-[color:var(--hairline)] space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                  <Input placeholder="Buscar por cliente, item ou vendedor..." className="pl-9 rounded-xl h-10" value={busca} onChange={(e) => setBusca(e.target.value)} />
                </div>
                <PeriodFilter value={periodoVendas} onChange={setPeriodoVendas} />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Select value={fItem} onValueChange={setFItem}>
                  <SelectTrigger className="h-9 rounded-xl w-[190px] text-xs font-semibold"><SelectValue placeholder="Item" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os itens</SelectItem>
                    {opcoesItem.map((i) => <SelectItem key={i} value={i}>{i}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={fCanal} onValueChange={setFCanal}>
                  <SelectTrigger className="h-9 rounded-xl w-[170px] text-xs font-semibold"><SelectValue placeholder="Canal" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os canais</SelectItem>
                    {opcoesCanal.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={fVendedor} onValueChange={setFVendedor}>
                  <SelectTrigger className="h-9 rounded-xl w-[190px] text-xs font-semibold"><SelectValue placeholder="Vendedor" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os vendedores</SelectItem>
                    {opcoesVendedor.map((v) => <SelectItem key={v.id} value={v.id}>{v.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
                {filtrosAtivos && (
                  <Button variant="ghost" size="sm" className="h-9 rounded-xl text-xs font-bold" onClick={() => { setFItem("todos"); setFCanal("todos"); setFVendedor("todos"); setBusca(""); }}>
                    Limpar filtros
                  </Button>
                )}
                <div className="ml-auto flex items-center gap-3">
                  <span className="text-[11px] uppercase tracking-wider font-bold text-muted-foreground">
                    {filteredVendas.length} venda(s) · <span className="text-[color:var(--brand)]">{fmtBRL(totalFiltrado)}</span>
                  </span>
                  <Button variant="outline" size="sm" className="h-9 rounded-xl text-xs font-bold gap-2" onClick={handleExportVendas}>
                    <Download className="size-4" /> Exportar
                  </Button>
                </div>
              </div>
            </div>


            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-muted/40 text-[10px] uppercase font-semibold text-muted-foreground tracking-wider border-b border-[color:var(--hairline)]">
                  <tr>
                    <th className="px-5 py-3">Data</th><th className="px-5 py-3">Cliente</th><th className="px-5 py-3">Item</th>
                    <th className="px-5 py-3">Vendedor</th><th className="px-5 py-3">Pagamento</th>
                    <th className="px-5 py-3 text-right">Valor</th><th className="px-5 py-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[color:var(--hairline)]">
                  {loadingVendas ? (
                    <tr><td colSpan={7} className="p-10 text-center text-xs text-muted-foreground"><Loader2 className="size-4 animate-spin inline mr-2" />Carregando...</td></tr>
                  ) : filteredVendas.length === 0 ? (
                    <tr><td colSpan={7} className="p-10 text-center text-xs text-muted-foreground">Nenhuma venda encontrada no período.</td></tr>
                  ) : filteredVendas.map((v) => {
                    const s = v.owner_id ? sellerMap.get(v.owner_id) : null;
                    return (
                      <tr key={v.id} className="hover:bg-muted/20 transition-colors group cursor-pointer" onClick={() => setSelectedVenda(v)}>
                        <td className="px-5 py-4 text-[11px] font-bold text-muted-foreground uppercase">{fmtDate(v.vendido_em)}</td>
                        <td className="px-5 py-4 text-sm font-bold">{v.contato_nome}</td>
                        <td className="px-5 py-4 text-xs text-muted-foreground">{v.item_nome || "—"}</td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2">
                            <InitialsAvatar name={sellerName(v.owner_id)} src={s?.avatar_url} className="size-7" />
                            <span className="text-xs font-bold">{sellerName(v.owner_id)}</span>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-xs text-muted-foreground">{v.metodo_pagamento || "—"}</td>
                        <td className="px-5 py-4 text-right text-sm font-bold text-[color:var(--brand)]">{fmtBRL(v.valor_cents)}</td>
                        <td className="px-5 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" className="size-8 rounded-lg" onClick={() => setVendaDialog({ open: true, venda: v })}>
                              <Pencil className="size-4" />
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="size-8 rounded-lg"><MoreVertical className="size-4" /></Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem className="gap-2" onClick={() => setSelectedVenda(v)}><Search className="size-4" /> Ver detalhes</DropdownMenuItem>
                                <DropdownMenuItem className="gap-2 text-rose-600" onClick={() => handleDeleteVenda(v.id)}><Trash2 className="size-4" /> Excluir</DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        {/* ================= METAS ================= */}
        <TabsContent value="metas" className="pt-6 space-y-6">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Período: {periodoGeral.label}</p>
            <div className="flex items-center gap-2">
              <PeriodFilter value={periodoGeral} onChange={setPeriodoGeral} />
              <Button className="gap-2" onClick={() => setMetaDialog({ open: true, target: null })}><Plus className="size-4" /> Nova meta</Button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <div className="rounded-2xl border border-[color:var(--hairline)] bg-[color:var(--panel)] p-6 space-y-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Meta geral da empresa</p>
                    <p className="text-3xl font-bold tracking-tighter mt-1">{fmtBRL(stats.metaGeral)}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Realizado <b className="text-[color:var(--brand)]">{fmtBRL(stats.receitaMes)}</b> · {faltaMeta > 0 ? <>Faltam <b>{fmtBRL(faltaMeta)}</b></> : "Meta batida 🎉"}
                    </p>
                  </div>
                  <Button variant="outline" className="gap-2" onClick={() => setMetaDialog({ open: true, target: { userId: null, valorCents: stats.metaGeral } })}>
                    <Edit3 className="size-4" /> Editar definições
                  </Button>
                </div>
                <div className="h-3 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-[color:var(--brand)] transition-all duration-700" style={{ width: `${Math.min(100, stats.metaAlcancada)}%` }} />
                </div>
                <p className="text-right text-xs font-bold text-[color:var(--brand)]">{stats.metaAlcancada}% atingido</p>
              </div>

              <div className="bg-[color:var(--panel)] rounded-2xl border border-[color:var(--hairline)] overflow-hidden">
                <div className="px-5 py-3 border-b border-[color:var(--hairline)] text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Metas por vendedor</div>
                <div className="divide-y divide-[color:var(--hairline)]">
                  {team.length === 0 && <p className="p-8 text-center text-xs text-muted-foreground">Nenhum membro na equipe.</p>}
                  {team.map((m) => (
                    <div key={m.user_id} className="p-4 flex items-center gap-4">
                      <InitialsAvatar name={m.nome} src={m.avatar_url} className="size-10" />
                      <div className="flex-1 min-w-0 space-y-1.5">
                        <div className="flex justify-between items-end gap-2">
                          <p className="text-sm font-bold truncate">{m.nome}</p>
                          <p className="text-[11px] font-bold text-muted-foreground">
                            <span className="text-[color:var(--brand)] font-bold">{fmtBRL(m.receita)}</span> / {fmtBRL(m.meta)}
                          </p>
                        </div>
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-[color:var(--brand)]" style={{ width: `${Math.min(100, m.progressoMeta || 0)}%` }} />
                        </div>
                      </div>
                      <Button variant="ghost" size="icon" className="size-9 rounded-lg" onClick={() => setMetaDialog({ open: true, target: { userId: m.user_id, nome: m.nome, valorCents: m.meta } })}>
                        <Edit3 className="size-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-[color:var(--hairline)] bg-[color:var(--panel)] p-6 space-y-5 h-fit">
              <div>
                <h3 className="font-bold">Configuração da meta</h3>
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Parâmetros do período</p>
              </div>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Período</span><b>{new Date(rangeGeral.from).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</b></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Métrica</span><b>Receita (BRL)</b></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Vendedores</span><b>{team.length}</b></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Soma individuais</span><b>{fmtBRL(team.reduce((s, t) => s + (t.meta || 0), 0))}</b></div>
              </div>
              <Button className="w-full gap-2" onClick={() => setMetaDialog({ open: true, target: null })}><Target className="size-4" /> Definir meta</Button>
            </div>
          </div>
        </TabsContent>

        {/* ================= PRODUTOS ================= */}
        <TabsContent value="produtos" className="pt-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <KpiCard icon={<ShoppingBag />} label="Itens ativos" value={String(productStats.produtosAtivos)} />
            <KpiCard icon={<Trophy />} label="Mais vendido" value={productStats.maisVendido} />
            <KpiCard icon={<DollarSign />} label="Receita em itens" value={fmtBRL(productStats.receitaProdutos)} hero />
          </div>

          <div className="bg-[color:var(--panel)] rounded-2xl border border-[color:var(--hairline)] overflow-hidden">
            <div className="p-5 border-b border-[color:var(--hairline)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="font-bold">Produtos e serviços</h2>
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Sincronizado com o Catálogo</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative sm:min-w-[260px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                  <Input placeholder="Buscar no catálogo..." className="pl-9 h-10 rounded-xl" value={buscaProduto} onChange={(e) => setBuscaProduto(e.target.value)} />
                </div>
                <Button className="gap-2" onClick={() => setProdutoDialog({ ativo: true, tipo: "produto" })}><Plus className="size-4" /> Novo item</Button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-muted/40 text-[10px] uppercase font-semibold text-muted-foreground tracking-wider border-b border-[color:var(--hairline)]">
                  <tr><th className="px-5 py-3">Item</th><th className="px-5 py-3">Categoria</th><th className="px-5 py-3 text-center">Vendas</th><th className="px-5 py-3">Receita</th><th className="px-5 py-3">Ticket médio</th><th className="px-5 py-3 text-right">Ações</th></tr>
                </thead>
                <tbody className="divide-y divide-[color:var(--hairline)]">
                  {filteredProdutos.length === 0 && (
                    <tr><td colSpan={6} className="p-10 text-center text-xs text-muted-foreground">Nenhum item no catálogo.</td></tr>
                  )}
                  {filteredProdutos.map((p) => (
                    <tr key={p.id} className="hover:bg-muted/20 transition-colors group">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="size-9 rounded-xl bg-muted grid place-items-center text-muted-foreground"><ShoppingBag className="size-4" /></div>
                          <div>
                            <span className="font-bold text-sm">{p.nome}</span>
                            {!p.ativo && <span className="ml-2 text-[10px] font-bold uppercase text-muted-foreground">Inativo</span>}
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4"><span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground bg-muted px-2.5 py-1 rounded-full">{p.categoria || "Geral"}</span></td>
                      <td className="px-5 py-4">
                        <div className="flex flex-col items-center gap-1.5">
                          <span className="font-bold text-sm">{p.vendas}</span>
                          <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-[color:var(--brand)]" style={{ width: `${(p.vendas / maxVendasProduto) * 100}%` }} />
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4 font-bold text-[color:var(--brand)] text-sm">{fmtBRL(p.receita)}</td>
                      <td className="px-5 py-4 text-sm font-bold">{fmtBRL(p.ticketMedio)}</td>
                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" className="size-8 rounded-lg" onClick={() => openProdutoEdit(p.id)}><Edit3 className="size-4" /></Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="size-8 rounded-lg"><MoreVertical className="size-4" /></Button></DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem className="gap-2 text-rose-600" onClick={() => handleDeleteProduto(p.id)}><Trash2 className="size-4" /> Excluir</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        {/* ================= RELATÓRIOS ================= */}
        <TabsContent value="relatorios" className="pt-6">
          <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6 items-start">
            <div className="bg-[color:var(--panel)] p-3 rounded-2xl border border-[color:var(--hairline)] space-y-1">
              <h3 className="px-3 py-2 text-[10px] font-bold uppercase text-muted-foreground tracking-wider">Relatórios disponíveis</h3>
              {REPORTS.map((r) => (
                <Button key={r.key} variant="ghost"
                  className={`w-full justify-start rounded-xl font-bold text-xs gap-3 h-10 px-3 ${activeReport === r.key ? "bg-[color:var(--brand)] text-white hover:bg-[color:var(--brand)]/90 hover:text-white" : ""}`}
                  onClick={() => setActiveReport(r.key)}>
                  <r.icon className="size-4" /> {r.label}
                </Button>
              ))}
              <div className="pt-3 px-1">
                <Button variant="outline" className="w-full rounded-xl gap-2 font-bold text-xs h-10" onClick={handlePDF} disabled={generatingPdf || !reportMeta.rows.length}>
                  {generatingPdf ? <Loader2 className="size-4 animate-spin" /> : <Receipt className="size-4" />} Gerar relatório
                </Button>
              </div>
            </div>

            <div className="bg-[color:var(--panel)] rounded-2xl border border-[color:var(--hairline)] p-6 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-bold tracking-tight">{reportMeta.titulo}</h2>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{reportMeta.subtitulo}</p>
                </div>
                <div className="flex items-center gap-2">
                  <PeriodFilter value={periodoGeral} onChange={setPeriodoGeral} />
                  <Button variant="outline" size="sm" className="rounded-xl gap-2 font-bold text-xs h-10" onClick={handleExport}><Download className="size-4" /> Exportar</Button>
                  <Button size="sm" className="rounded-xl gap-2 font-bold text-xs h-10" onClick={handlePDF} disabled={generatingPdf || !reportMeta.rows.length}>
                    {generatingPdf ? <Loader2 className="size-4 animate-spin" /> : <Receipt className="size-4" />} Baixar PDF
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {reportMeta.resumo.map((k) => (
                  <div key={k.label} className="p-4 rounded-xl border border-[color:var(--hairline)]">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">{k.label}</p>
                    <p className="text-xl font-bold tracking-tight truncate">{k.value}</p>
                  </div>
                ))}
              </div>

              {activeReport === "resumo-vendas" && (
                <div className="h-64 rounded-xl border border-[color:var(--hairline)] p-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={reportsData.chart}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                      <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${Math.round(Number(v) / 100)}`} />
                      <Tooltip formatter={(v: any) => fmtBRL(Number(v))} />
                      <Line type="monotone" dataKey="value" stroke="var(--brand)" strokeWidth={2.5} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}

              <div className="overflow-x-auto rounded-xl border border-[color:var(--hairline)]">
                <table className="w-full text-left">
                  <thead className="bg-muted/40 text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">
                    <tr>{reportMeta.headers.map((h) => <th key={h} className="px-4 py-3">{h}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y divide-[color:var(--hairline)]">
                    {reportMeta.rows.length === 0 && (
                      <tr><td colSpan={reportMeta.headers.length} className="p-10 text-center text-xs text-muted-foreground">Sem dados no período.</td></tr>
                    )}
                    {reportMeta.rows.slice(0, 100).map((r, i) => (
                      <tr key={i} className="hover:bg-muted/20">
                        {r.map((c, j) => <td key={j} className="px-4 py-3 text-sm font-medium">{c}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Drawer detalhes da venda */}
      <Sheet open={!!selectedVenda} onOpenChange={(o) => !o && setSelectedVenda(null)}>
        <SheetContent className="sm:max-w-md">
          <SheetHeader><SheetTitle>Detalhes da venda</SheetTitle></SheetHeader>
          {selectedVenda && (
            <div className="mt-6 space-y-4 text-sm">
              <div className="p-4 rounded-xl bg-muted/40">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Valor</p>
                <p className="text-3xl font-bold text-[color:var(--brand)] tracking-tighter">{fmtBRL(selectedVenda.valor_cents)}</p>
              </div>
              {[
                ["Cliente", selectedVenda.contato_nome],
                ["WhatsApp", selectedVenda.contato_numero],
                ["Item", selectedVenda.item_nome || "—"],
                ["Vendedor", sellerName(selectedVenda.owner_id)],
                ["Pagamento", selectedVenda.metodo_pagamento || "—"],
                ["Data", fmtDate(selectedVenda.vendido_em)],
                ["Canal", selectedVenda.canal || "—"],
              ].map(([l, v]) => (
                <div key={l as string} className="flex justify-between gap-4 border-b border-[color:var(--hairline)] pb-2">
                  <span className="text-muted-foreground">{l}</span><b className="text-right">{v as any}</b>
                </div>
              ))}
              {selectedVenda.descricao && (
                <div><p className="text-muted-foreground mb-1">Observações</p><p className="text-sm">{selectedVenda.descricao}</p></div>
              )}
              <div className="flex gap-2 pt-2">
                <Button className="flex-1 gap-2" onClick={() => { setVendaDialog({ open: true, venda: selectedVenda }); setSelectedVenda(null); }}>
                  <Pencil className="size-4" /> Editar
                </Button>
                <Button variant="outline" className="gap-2 text-rose-600" onClick={() => handleDeleteVenda(selectedVenda.id)}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Ranking completo */}
      <Sheet open={rankingOpen} onOpenChange={setRankingOpen}>
        <SheetContent className="sm:max-w-md">
          <SheetHeader><SheetTitle>Ranking completo — {periodoGeral.label}</SheetTitle></SheetHeader>
          <div className="mt-6 divide-y divide-[color:var(--hairline)]">
            {team.map((m, i) => (
              <div key={m.user_id} className="py-3 flex items-center gap-3">
                <span className="text-xs font-bold text-muted-foreground w-5">{i + 1}º</span>
                <InitialsAvatar name={m.nome} src={m.avatar_url} className="size-9" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold truncate">{m.nome}</p>
                  <p className="text-[11px] text-muted-foreground">{m.vendas} venda(s) · ticket {fmtBRL(m.ticketMedio)}</p>
                </div>
                <b className="text-sm text-[color:var(--brand)]">{fmtBRL(m.receita)}</b>
              </div>
            ))}
            {team.length === 0 && <p className="text-xs text-muted-foreground py-6 text-center">Sem dados no período.</p>}
          </div>
        </SheetContent>
      </Sheet>

      <VendaDialog
        open={vendaDialog.open}
        onOpenChange={(o) => setVendaDialog({ open: o, venda: o ? vendaDialog.venda : null })}
        venda={vendaDialog.venda}
        members={members}
        onSaved={refreshAll}
      />

      <MetaDialog
        open={metaDialog.open}
        onOpenChange={(o) => setMetaDialog({ open: o, target: o ? metaDialog.target : null })}
        companyId={companyId}
        target={metaDialog.target}
        members={members}
        onSaved={refreshAll}
      />

      {produtoDialog && (
        <ProdutoEditDialog
          initial={produtoDialog}
          companyId={companyId}
          onClose={() => setProdutoDialog(null)}
          onSaved={() => { setProdutoDialog(null); refreshAll(); }}
          onSave={saveProdutoFn as any}
        />
      )}
    </div>
  );
}
