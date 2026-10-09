import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { brand } from "@/config/brand";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Loader2, TrendingUp, TrendingDown, Users, AlertTriangle, Wallet, RefreshCw, Search, Download,
  Ban, CheckCircle2, CalendarClock, Minus,
} from "lucide-react";
import { toast } from "sonner";
import {
  financeOverview, listMasterInvoices, listDelinquent, suspendCompanyBilling, listPayingCustomers,
} from "@/lib/finance.functions";
import { BillingPanel } from "@/components/master/billing-panel";
import { ChargesPanel } from "@/components/master/charges-panel";
import { RevenueProjectionPanel } from "@/components/master/revenue-projection-panel";

export const Route = createFileRoute("/master/financeiro")({
  head: () => ({
    meta: [
      { title: `${brand.name} — Financeiro` },
      { name: "description", content: "Receita recorrente, clientes pagantes, faturas e inadimplência." },
      { property: "og:title", content: `${brand.name} — Financeiro` },
      { property: "og:description", content: "MRR, clientes pagantes, vencimentos e conciliação." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FinanceiroPage,
});

type Tab = "visao" | "clientes" | "faturas" | "inadimplencia" | "conciliacao";

const TABS: { id: Tab; label: string }[] = [
  { id: "visao", label: "Visão geral" },
  { id: "clientes", label: "Clientes" },
  { id: "faturas", label: "Faturas" },
  { id: "inadimplencia", label: "Inadimplência" },
  { id: "conciliacao", label: "Conciliação" },
];

const brl = (cents: number) =>
  ((cents ?? 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });

const dataBr = (v?: string | null) => (v ? new Date(v).toLocaleDateString("pt-BR") : "—");

function FinanceiroPage() {
  const [tab, setTab] = useState<Tab>("visao");

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-[26px] leading-tight tracking-tight">Financeiro</h1>
        <p className="text-sm text-muted-foreground">Receita recorrente, clientes pagantes, faturas e cobrança.</p>
      </div>

      <div className="flex items-center gap-1 border-b border-[color:var(--hairline)] overflow-x-auto no-scrollbar">
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`relative shrink-0 px-3 py-2.5 text-[13px] font-medium whitespace-nowrap transition-colors ${
                active ? "text-[color:var(--brand-text)]" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
              {active && (
                <span className="absolute left-2 right-2 -bottom-px h-[2px] rounded-full" style={{ background: "var(--brand)" }} />
              )}
            </button>
          );
        })}
      </div>

      {tab === "visao" && <VisaoGeral />}
      {tab === "clientes" && <ClientesPagantes />}
      {tab === "faturas" && <Faturas />}
      {tab === "inadimplencia" && <Inadimplencia />}
      {tab === "conciliacao" && (
        <div className="space-y-8">
          <ChargesPanel />
          <div className="pt-2 border-t border-[color:var(--hairline)]">
            <h2 className="text-sm font-semibold mt-4">Eventos dos provedores</h2>
            <p className="text-[12px] text-muted-foreground mb-3">Webhooks recebidos — reprocesse os que falharam.</p>
            <BillingPanel />
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------- Visão geral ------------------------------- */

function VisaoGeral() {
  const load = useServerFn(financeOverview);
  const [d, setD] = useState<any | null>(null);

  async function reload() {
    try { setD(await load()); } catch (e: any) { toast.error(e?.message ?? "Falha ao carregar"); }
  }
  useEffect(() => { void reload(); }, []);

  if (!d) return <Loading />;

  const delta = d.recebidoMesAnterior
    ? Math.round(((d.recebidoMes - d.recebidoMesAnterior) / d.recebidoMesAnterior) * 100)
    : null;

  const cards = [
    {
      label: "Receita recorrente",
      value: brl(d.mrr),
      icon: TrendingUp,
      hint: `${d.clientesPagantes} cliente(s) ativos${d.addonMrr ? ` • upgrades ${brl(d.addonMrr)}` : ""}`,
    },
    {
      label: "Recebido no mês",
      value: brl(d.recebidoMes),
      icon: Wallet,
      hint: d.reembolsoMes ? `− ${brl(d.reembolsoMes)} em reembolsos` : "Sem reembolsos",
      delta,
    },
    { label: "Ticket médio", value: brl(d.arpu), icon: Users, hint: "Por cliente pagante" },
    {
      label: "Em atraso",
      value: String(d.inadimplentes + (d.vencidas?.length ?? 0)),
      icon: AlertTriangle,
      hint: d.vencidas?.length ? `${d.vencidas.length} com ciclo vencido` : "Assinaturas em atraso",
      tone: d.inadimplentes + (d.vencidas?.length ?? 0) > 0 ? "text-red-600" : "",
    },
  ];

  const max = Math.max(1, ...d.serie.map((s: any) => Math.max(s.recebido, s.reembolsos)));

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={reload}><RefreshCw className="size-3.5 mr-1" />Atualizar</Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((c: any) => (
          <Card key={c.label} className="min-w-0 p-3 sm:p-4 rounded-2xl border-[color:var(--hairline)]">
            <div className="flex items-center gap-2 text-muted-foreground min-w-0">
              <c.icon className="size-4 shrink-0" />
              <span className="text-[11.5px] sm:text-[12px] font-medium truncate">{c.label}</span>
            </div>
            <div className={`mt-1.5 text-lg sm:text-2xl font-semibold tracking-tight truncate ${c.tone ?? ""}`}>
              {c.value}
            </div>
            <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
              {c.delta != null && (
                <span
                  className={`inline-flex items-center gap-0.5 text-[10.5px] font-medium rounded-full px-1.5 py-px ${
                    c.delta > 0 ? "bg-emerald-50 text-emerald-700" : c.delta < 0 ? "bg-red-50 text-red-700" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {c.delta > 0 ? <TrendingUp className="size-3" /> : c.delta < 0 ? <TrendingDown className="size-3" /> : <Minus className="size-3" />}
                  {Math.abs(c.delta)}%
                </span>
              )}
              <span className="text-[11px] text-muted-foreground truncate" title={c.hint}>{c.hint}</span>
            </div>
          </Card>
        ))}
      </div>

      <RevenueProjectionPanel />

      <div className="grid lg:grid-cols-[1.6fr_1fr] gap-3">
        <Card className="p-4 rounded-2xl border-[color:var(--hairline)]">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">Faturamento (6 meses)</h2>
            <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <i className="size-2 rounded-full" style={{ background: "var(--brand)" }} /> Recebido
              </span>
              <span className="flex items-center gap-1"><i className="size-2 rounded-full bg-amber-400" /> Reembolsos</span>
            </div>
          </div>
          <div className="mt-5 flex items-end gap-2 sm:gap-4 h-44">
            {d.serie.map((s: any, i: number) => (
              <div key={i} className="flex-1 min-w-0 h-full flex flex-col justify-end items-center gap-1.5">
                <span className="text-[10px] text-muted-foreground truncate w-full text-center">
                  {s.recebido ? brl(s.recebido) : ""}
                </span>
                <div className="w-full flex items-end justify-center gap-1 h-full">
                  <div
                    className="w-full max-w-[26px] rounded-t-md transition-all"
                    style={{ height: `${Math.round((s.recebido / max) * 100)}%`, minHeight: 3, background: "var(--brand)" }}
                  />
                  {s.reembolsos > 0 && (
                    <div
                      className="w-full max-w-[12px] rounded-t-md bg-amber-400"
                      style={{ height: `${Math.round((s.reembolsos / max) * 100)}%`, minHeight: 3 }}
                    />
                  )}
                </div>
                <span className="text-[11px] text-muted-foreground capitalize">{s.mes}</span>
              </div>
            ))}
          </div>
          {(d.conciliacao?.naoReconhecidos > 0 || d.conciliacao?.semValor > 0) && (
            <p className="mt-3 text-[11px] text-muted-foreground">
              {d.conciliacao.naoReconhecidos > 0 && `${d.conciliacao.naoReconhecidos} evento(s) não reconhecidos`}
              {d.conciliacao.naoReconhecidos > 0 && d.conciliacao.semValor > 0 && " • "}
              {d.conciliacao.semValor > 0 && `${d.conciliacao.semValor} pagamento(s) sem valor informado`}
              {" — veja em Conciliação."}
            </p>
          )}
        </Card>

        <Card className="p-4 rounded-2xl border-[color:var(--hairline)]">
          <div className="flex items-center gap-2">
            <CalendarClock className="size-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Próximos vencimentos</h2>
          </div>
          {!d.proximosVencimentos?.length ? (
            <p className="mt-3 text-sm text-muted-foreground">Nenhum vencimento nos próximos 30 dias.</p>
          ) : (
            <div className="mt-1 divide-y divide-[color:var(--hairline)]">
              {d.proximosVencimentos.map((v: any) => (
                <div key={v.company_id} className="py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{v.nome}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {dataBr(v.vence_em)} • {v.dias <= 0 ? "hoje" : `em ${v.dias} dia(s)`}
                    </div>
                  </div>
                  <div className="text-sm font-semibold whitespace-nowrap">{brl(v.valor_cents)}</div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {d.vencidas?.length > 0 && (
        <Card className="p-4 rounded-2xl border-red-200 bg-red-50/40">
          <div className="flex items-center gap-2 text-red-700">
            <AlertTriangle className="size-4" />
            <h2 className="text-sm font-semibold">Fora da receita recorrente (ciclo vencido)</h2>
          </div>
          <p className="text-[12px] text-red-700/80 mt-0.5">
            Continuam marcadas como ativas, mas o ciclo já venceu — não entram no cálculo do MRR.
          </p>
          <div className="mt-2 divide-y divide-red-200/70">
            {d.vencidas.map((v: any) => (
              <div key={v.company_id} className="py-2 flex items-center justify-between gap-3 text-sm">
                <span className="truncate font-medium">{v.nome}</span>
                <span className="text-[12px] text-muted-foreground whitespace-nowrap">
                  venceu {dataBr(v.venceu_em)} • {brl(v.valor_cents)}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="grid md:grid-cols-2 gap-3">
        <BreakdownCard title="Receita por plano" rows={d.receitaPorPlano} total={d.planoMrr} />
        <BreakdownCard title="Receita por upgrade" rows={d.receitaPorAddon} total={d.addonMrr} />
      </div>
    </div>
  );
}

function BreakdownCard({ title, rows, total }: { title: string; rows: any[]; total: number }) {
  return (
    <Card className="p-4 rounded-2xl border-[color:var(--hairline)]">
      <h2 className="text-sm font-semibold">{title}</h2>
      {!rows?.length ? (
        <p className="mt-2 text-sm text-muted-foreground">Nada por aqui ainda.</p>
      ) : (
        <div className="mt-2 space-y-3">
          {rows.map((p: any) => {
            const pct = total > 0 ? Math.round((p.mrr / total) * 100) : 0;
            return (
              <div key={p.nome}>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{p.nome}</div>
                    <div className="text-[11px] text-muted-foreground">{p.clientes} cliente(s)</div>
                  </div>
                  <div className="text-sm font-semibold whitespace-nowrap">{brl(p.mrr)}</div>
                </div>
                <div className="mt-1.5 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "var(--brand)" }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

/* ---------------------------- Clientes pagantes ---------------------------- */

const SITUACAO: Record<string, { label: string; cls: string }> = {
  em_dia: { label: "Em dia", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  vence_breve: { label: "Vence em breve", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  vencido: { label: "Vencido", cls: "bg-red-50 text-red-700 border-red-200" },
};

function ClientesPagantes() {
  const load = useServerFn(listPayingCustomers);
  const [rows, setRows] = useState<any[] | null>(null);
  const [q, setQ] = useState("");

  async function reload() {
    try { setRows(await load()); } catch (e: any) { toast.error(e?.message); setRows([]); }
  }
  useEffect(() => { void reload(); }, []);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return rows ?? [];
    return (rows ?? []).filter(
      (r) => r.nome?.toLowerCase().includes(t) || (r.email ?? "").toLowerCase().includes(t),
    );
  }, [rows, q]);

  const mrr = filtered.filter((r) => r.situacao !== "vencido").reduce((s, r) => s + r.valor_cents, 0);
  const totalPago = filtered.reduce((s, r) => s + (r.total_pago_cents ?? 0), 0);

  function exportCsv() {
    const header = ["Cliente", "E-mail", "Plano", "Valor mensal", "Cobrança", "Próximo vencimento", "Situação", "Total pago", "Último pagamento"];
    const lines = filtered.map((r) => [
      r.nome, r.email ?? "", r.plano, (r.valor_cents / 100).toFixed(2).replace(".", ","), r.provider,
      dataBr(r.proximo_vencimento), SITUACAO[r.situacao]?.label ?? r.situacao,
      ((r.total_pago_cents ?? 0) / 100).toFixed(2).replace(".", ","), dataBr(r.ultimo_pagamento),
    ]);
    const csv = [header, ...lines].map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = `clientes-pagantes-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  if (!rows) return <Loading />;

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center gap-2">
        <div className="relative w-full md:w-[260px]">
          <Search className="size-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar cliente…" className="pl-8 h-9" />
        </div>
        <div className="flex items-center gap-2 md:ml-auto text-sm text-muted-foreground flex-wrap">
          <span>Recorrência: <b className="text-foreground">{brl(mrr)}</b></span>
          <span>• Já pago: <b className="text-foreground">{brl(totalPago)}</b></span>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!filtered.length}>
            <Download className="size-3.5 mr-1" />CSV
          </Button>
          <Button variant="outline" size="sm" onClick={reload}><RefreshCw className="size-3.5 mr-1" />Atualizar</Button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <Empty text="Nenhum cliente pagante encontrado." />
      ) : (
        <>
          {/* Mobile */}
          <div className="lg:hidden space-y-2.5">
            {filtered.map((r) => (
              <Card key={r.id} className="p-3.5 rounded-2xl border-[color:var(--hairline)]">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate">{r.nome}</div>
                    <div className="text-[11px] text-muted-foreground truncate">{r.email ?? "sem e-mail"}</div>
                  </div>
                  <div className="text-sm font-semibold whitespace-nowrap">{brl(r.valor_cents)}/mês</div>
                </div>
                <div className="mt-2 flex items-center gap-2 flex-wrap text-[11px] text-muted-foreground">
                  <Badge variant="outline" className={`text-[10.5px] ${SITUACAO[r.situacao]?.cls}`}>
                    {SITUACAO[r.situacao]?.label}
                  </Badge>
                  <span>Vence {dataBr(r.proximo_vencimento)}</span>
                  <span className="ml-auto">Pago {brl(r.total_pago_cents)}</span>
                </div>
              </Card>
            ))}
          </div>

          <Card className="hidden lg:block rounded-2xl border-[color:var(--hairline)] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-[12px] text-muted-foreground">
                  <tr>
                    <th className="text-left font-medium px-4 py-2.5">Cliente</th>
                    <th className="text-left font-medium px-4 py-2.5">Plano</th>
                    <th className="text-right font-medium px-4 py-2.5">Mensalidade</th>
                    <th className="text-left font-medium px-4 py-2.5">Cobrança</th>
                    <th className="text-left font-medium px-4 py-2.5">Próx. vencimento</th>
                    <th className="text-right font-medium px-4 py-2.5">Total pago</th>
                    <th className="text-left font-medium px-4 py-2.5">Último pgto.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[color:var(--hairline)]">
                  {filtered.map((r) => (
                    <tr key={r.id} className="hover:bg-muted/30">
                      <td className="px-4 py-2.5 min-w-[220px]">
                        <div className="flex items-center gap-2">
                          <span className="font-medium truncate">{r.nome}</span>
                          <Badge variant="outline" className={`text-[10px] ${SITUACAO[r.situacao]?.cls}`}>
                            {SITUACAO[r.situacao]?.label}
                          </Badge>
                        </div>
                        <div className="text-[11px] text-muted-foreground truncate">{r.email ?? "sem e-mail"}</div>
                      </td>
                      <td className="px-4 py-2.5">{r.plano}</td>
                      <td className="px-4 py-2.5 text-right font-medium whitespace-nowrap">{brl(r.valor_cents)}</td>
                      <td className="px-4 py-2.5 capitalize">{r.provider}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        {dataBr(r.proximo_vencimento)}
                        {r.dias_para_vencer != null && (
                          <span className="text-[11px] text-muted-foreground">
                            {" "}
                            ({r.dias_para_vencer < 0 ? `${Math.abs(r.dias_para_vencer)}d atrás` : `${r.dias_para_vencer}d`})
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        {brl(r.total_pago_cents)}
                        <span className="text-[11px] text-muted-foreground"> ({r.pagamentos})</span>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">{dataBr(r.ultimo_pagamento)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

/* --------------------------------- Faturas --------------------------------- */

const STATUS_STYLE: Record<string, string> = {
  pago: "bg-emerald-50 text-emerald-700 border-emerald-200",
  aguardando: "bg-blue-50 text-blue-700 border-blue-200",
  reembolsado: "bg-amber-50 text-amber-700 border-amber-200",
  chargeback: "bg-red-50 text-red-700 border-red-200",
  falhou: "bg-red-50 text-red-700 border-red-200",
  cancelado: "bg-slate-100 text-slate-600 border-slate-200",
  outro: "bg-slate-100 text-slate-600 border-slate-200",
};

const FILTERS = ["todos", "pago", "aguardando", "falhou", "reembolsado", "chargeback", "cancelado"];

function Faturas() {
  const load = useServerFn(listMasterInvoices);
  const [rows, setRows] = useState<any[] | null>(null);
  const [status, setStatus] = useState("todos");
  const [q, setQ] = useState("");
  const [busca, setBusca] = useState("");

  async function reload() {
    setRows(null);
    try { setRows(await load({ data: { status, q: busca, limit: 300 } })); }
    catch (e: any) { toast.error(e?.message); setRows([]); }
  }
  useEffect(() => { void reload(); }, [status, busca]);

  const total = useMemo(
    () => (rows ?? []).filter((r) => r.status === "pago").reduce((s, r) => s + (r.amount_cents ?? 0), 0),
    [rows],
  );

  function exportCsv() {
    const header = ["Data", "Empresa", "E-mail", "Provedor", "Status", "Evento", "Valor", "ID externo"];
    const lines = (rows ?? []).map((r) => [
      new Date(r.created_at).toLocaleString("pt-BR"),
      r.company_nome ?? "",
      r.buyer_email ?? "",
      r.provider,
      r.status,
      r.evento ?? "",
      ((r.amount_cents ?? 0) / 100).toFixed(2).replace(".", ","),
      r.external_id ?? "",
    ]);
    const csv = [header, ...lines].map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = `faturas-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center gap-2 md:flex-wrap">
        <div className="relative w-full md:w-auto">
          <Search className="size-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && setBusca(q)}
            onBlur={() => setBusca(q)}
            placeholder="Buscar por e-mail…"
            className="pl-8 h-9 w-full md:w-[240px]"
          />
        </div>
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar -mx-1 px-1 md:flex-wrap md:overflow-visible md:mx-0 md:px-0">
          {FILTERS.map((f) => (
            <Button key={f} size="sm" variant={status === f ? "default" : "outline"} onClick={() => setStatus(f)} className="capitalize shrink-0">
              {f}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-2 md:ml-auto">
          <span className="text-sm text-muted-foreground truncate">Pago: <b className="text-foreground">{brl(total)}</b></span>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!rows?.length} className="ml-auto md:ml-0">
            <Download className="size-3.5 mr-1" />CSV
          </Button>
          <Button variant="outline" size="sm" onClick={reload}><RefreshCw className="size-3.5 mr-1" />Atualizar</Button>
        </div>
      </div>

      {!rows ? <Loading /> : rows.length === 0 ? (
        <Empty text="Nenhuma fatura encontrada." />
      ) : (
        <>
        {/* Mobile / tablet: cards */}
        <div className="lg:hidden space-y-2.5">
          {rows.map((r) => (
            <Card key={r.id} className="p-3.5 rounded-2xl border-[color:var(--hairline)]">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                <div className="min-w-0">
                  <div className="font-medium text-sm truncate">{r.company_nome ?? "— não vinculado —"}</div>
                  <div className="text-[11px] text-muted-foreground truncate">{r.buyer_email ?? "sem e-mail"}</div>
                </div>
                <div className="text-sm font-semibold whitespace-nowrap shrink-0">
                  {r.amount_cents == null ? "—" : brl(r.amount_cents)}
                </div>
              </div>
              <div className="mt-2.5 flex items-center gap-2 flex-wrap text-[11px] text-muted-foreground">
                <Badge variant="outline" className={`capitalize text-[10.5px] ${STATUS_STYLE[r.status] ?? STATUS_STYLE.outro}`}>{r.status}</Badge>
                <span className="capitalize">{r.provider}</span>
                <span className="ml-auto whitespace-nowrap">
                  {new Date(r.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                </span>
              </div>
            </Card>
          ))}
        </div>

        <Card className="hidden lg:block rounded-2xl border-[color:var(--hairline)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-[12px] text-muted-foreground">
                <tr>
                  <th className="text-left font-medium px-4 py-2.5">Data</th>
                  <th className="text-left font-medium px-4 py-2.5">Cliente</th>
                  <th className="text-left font-medium px-4 py-2.5">Provedor</th>
                  <th className="text-left font-medium px-4 py-2.5">Status</th>
                  <th className="text-right font-medium px-4 py-2.5">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--hairline)]">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-muted/30">
                    <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">
                      {new Date(r.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                    </td>
                    <td className="px-4 py-2.5 min-w-[220px]">
                      <div className="font-medium truncate">{r.company_nome ?? "— não vinculado —"}</div>
                      <div className="text-[11px] text-muted-foreground truncate">{r.buyer_email ?? "sem e-mail"}</div>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="capitalize">{r.provider}</span>
                      {r.evento && <div className="text-[11px] text-muted-foreground truncate">{r.evento}</div>}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge variant="outline" className={`capitalize ${STATUS_STYLE[r.status] ?? STATUS_STYLE.outro}`}>{r.status}</Badge>
                    </td>
                    <td className="px-4 py-2.5 text-right font-medium whitespace-nowrap">
                      {r.amount_cents == null ? "—" : brl(r.amount_cents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        </>
      )}
    </div>
  );
}

/* ------------------------------ Inadimplência ------------------------------ */

function Inadimplencia() {
  const load = useServerFn(listDelinquent);
  const suspend = useServerFn(suspendCompanyBilling);
  const [rows, setRows] = useState<any[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function reload() {
    try { setRows(await load()); } catch (e: any) { toast.error(e?.message); setRows([]); }
  }
  useEffect(() => { void reload(); }, []);

  async function toggle(companyId: string, suspender: boolean) {
    setBusy(companyId);
    try {
      await suspend({ data: { companyId, suspender } });
      toast.success(suspender ? "Acesso suspenso" : "Acesso reativado");
      await reload();
    } catch (e: any) { toast.error(e?.message); } finally { setBusy(null); }
  }

  if (!rows) return <Loading />;
  if (rows.length === 0) return <Empty text="Nenhum cliente em atraso. 🎉" ok />;

  const totalEmRisco = rows.reduce((s, r) => s + (r.valor_cents ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-muted-foreground">
          {rows.length} cliente(s) em atraso • Recorrência em risco <b className="text-foreground">{brl(totalEmRisco)}</b>
        </p>
        <Button variant="outline" size="sm" onClick={reload}><RefreshCw className="size-3.5 mr-1" />Atualizar</Button>
      </div>

      <Card className="rounded-2xl border-[color:var(--hairline)] overflow-hidden">
        <div className="divide-y divide-[color:var(--hairline)]">
          {rows.map((r) => {
            const suspenso = r.status_cobranca === "suspenso";
            return (
              <div key={r.id} className="p-4 flex flex-col md:flex-row md:items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium truncate">{r.company_nome}</span>
                    <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                      {r.dias_atraso != null ? `${r.dias_atraso} dia(s) em atraso` : "em atraso"}
                    </Badge>
                    {suspenso && <Badge variant="outline" className="bg-slate-100 text-slate-600">suspenso</Badge>}
                  </div>
                  <div className="text-[12px] text-muted-foreground truncate">
                    {r.plano} • {brl(r.valor_cents)} • {r.provider} • {r.email ?? "sem e-mail"} {r.telefone ? `• ${r.telefone}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant={suspenso ? "outline" : "destructive"}
                    disabled={busy === r.company_id}
                    onClick={() => toggle(r.company_id, !suspenso)}
                  >
                    {busy === r.company_id ? <Loader2 className="size-3.5 animate-spin" /> : suspenso ? <CheckCircle2 className="size-3.5 mr-1" /> : <Ban className="size-3.5 mr-1" />}
                    {suspenso ? "Reativar" : "Suspender"}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

/* --------------------------------- Shared --------------------------------- */

function Loading() {
  return (
    <div className="py-20 grid place-items-center">
      <Loader2 className="animate-spin size-6 text-muted-foreground" />
    </div>
  );
}

function Empty({ text, ok }: { text: string; ok?: boolean }) {
  return (
    <Card className="p-10 text-center rounded-2xl border-[color:var(--hairline)]">
      {ok ? (
        <CheckCircle2 className="size-10 mx-auto text-emerald-500" />
      ) : (
        <AlertTriangle className="size-10 mx-auto text-muted-foreground/50" />
      )}
      <p className="mt-2 text-sm text-muted-foreground">{text}</p>
    </Card>
  );
}
