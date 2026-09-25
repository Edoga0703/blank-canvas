import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { TrendingUp, Target, Wallet, LineChart, Pencil, Check, X } from "lucide-react";
import { revenueProjection, saveRevenueGoal } from "@/lib/finance.functions";

const brl = (c: number) =>
  ((c ?? 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const brlExato = (c: number) =>
  ((c ?? 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type Cenario = "conservador" | "base" | "otimista";

const CENARIOS: { id: Cenario; label: string; desc: string }[] = [
  { id: "conservador", label: "Conservador", desc: "Base atual, sem novos clientes" },
  { id: "base", label: "Provável", desc: "Mantém o ritmo dos últimos meses" },
  { id: "otimista", label: "Otimista", desc: "Ritmo acelerado de captação" },
];

export function RevenueProjectionPanel() {
  const load = useServerFn(revenueProjection);
  const save = useServerFn(saveRevenueGoal);
  const [d, setD] = useState<any | null>(null);
  const [cenario, setCenario] = useState<Cenario>("base");
  const [editMeta, setEditMeta] = useState(false);
  const [metaInput, setMetaInput] = useState("");

  async function reload() {
    try {
      setD(await load());
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao carregar projeção");
    }
  }
  useEffect(() => {
    void reload();
  }, []);

  const chart = useMemo(() => {
    if (!d) return { pontos: [] as any[], max: 1 };
    const hist = d.historico.map((h: any) => ({ label: h.label, valor: h.liquido, tipo: "real" as const }));
    const proj = d.projecao.slice(0, 6).map((p: any) => ({ label: p.label, valor: p[cenario], tipo: "proj" as const }));
    const pontos = [...hist.slice(-8), ...proj];
    return { pontos, max: Math.max(1, ...pontos.map((p) => p.valor)) };
  }, [d, cenario]);

  if (!d) {
    return <Card className="p-6 rounded-2xl border-[color:var(--hairline)] h-64 animate-pulse bg-muted/30" />;
  }

  const meta = d.ano.meta as number;
  const pctMeta = meta > 0 ? Math.min(100, Math.round((d.ano.projetado / meta) * 100)) : 0;
  const pctMetaReal = meta > 0 ? Math.min(100, Math.round((d.ano.faturado / meta) * 100)) : 0;
  const cresc = Math.round((d.crescimento ?? 0) * 1000) / 10;

  async function salvarMeta() {
    const num = Number(String(metaInput).replace(/[^\d]/g, ""));
    try {
      await save({ data: { metaAnualCents: num * 100 } });
      setEditMeta(false);
      toast.success("Meta atualizada");
      void reload();
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao salvar meta");
    }
  }

  return (
    <div className="space-y-4">
      {/* Faixa principal */}
      <Card className="p-0 overflow-hidden rounded-2xl border-[color:var(--hairline)]">
        <div className="relative bg-[color:var(--brand)] text-white p-6 sm:p-7">
          <div className="relative z-10 grid gap-6 lg:grid-cols-[1.1fr_1fr_1fr]">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-white/70">Faturado desde o início</div>
              <div className="mt-2 text-[38px] sm:text-[44px] font-semibold leading-none tabular-nums">
                {brlExato(d.totalLiquido)}
              </div>
              <div className="mt-2 text-[12.5px] text-white/75">
                {d.mesesAtivos} mês(es) com receita
                {d.totalReembolsos > 0 ? ` • ${brl(d.totalReembolsos)} devolvidos` : ""}
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="text-[11px] uppercase tracking-wider text-white/70">Recorrência contratada</div>
              <div className="text-[26px] font-semibold leading-none tabular-nums">{brlExato(d.mrr)}/mês</div>
              <div className="text-[12.5px] text-white/75">{d.clientesPagantes} cliente(s) pagando hoje</div>
              <div className="text-[12.5px] text-white/75">Média dos últimos 12 meses: {brl(d.mediaMensal12m)}</div>
            </div>
            <div className="space-y-1.5">
              <div className="text-[11px] uppercase tracking-wider text-white/70">Tendência mensal</div>
              <div className="text-[26px] font-semibold leading-none tabular-nums">
                {cresc > 0 ? "+" : ""}
                {cresc.toFixed(1)}%
              </div>
              <div className="text-[12.5px] text-white/75">Variação média da receita mês a mês</div>
              <div className="text-[12.5px] text-white/75">
                Projeção {new Date().getFullYear()}: {brl(d.ano.projetado)}
              </div>
            </div>
          </div>
          <div className="pointer-events-none absolute -right-12 -top-16 size-64 rounded-full bg-white/10 blur-2xl" />
        </div>
      </Card>

      {/* Cenários */}
      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <Card className="p-6 rounded-2xl border-[color:var(--hairline)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-[17px] font-semibold flex items-center gap-2">
                <LineChart className="size-4 text-[color:var(--brand-text)]" />
                Realizado e projeção
              </h3>
              <p className="text-xs text-muted-foreground">Últimos meses recebidos e os próximos 6 projetados</p>
            </div>
            <div className="flex rounded-xl bg-muted p-1">
              {CENARIOS.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setCenario(c.id)}
                  title={c.desc}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                    cenario === c.id ? "bg-white shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-6 flex items-end gap-1.5 h-40">
            {chart.pontos.map((p, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1.5 min-w-0">
                <div className="w-full flex-1 flex items-end">
                  <div
                    className={`w-full rounded-t-md transition-all ${
                      p.tipo === "real"
                        ? "bg-[color:var(--brand)]"
                        : "bg-[color:var(--brand)]/25 border border-dashed border-[color:var(--brand)]/50"
                    }`}
                    style={{ height: `${Math.max(3, (p.valor / chart.max) * 100)}%` }}
                    title={`${p.label}: ${brl(p.valor)}`}
                  />
                </div>
                <span className="text-[10px] text-muted-foreground truncate w-full text-center">{p.label}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-4 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-[color:var(--brand)]" /> Recebido
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-[color:var(--brand)]/25 border border-dashed border-[color:var(--brand)]/50" />{" "}
              Projetado
            </span>
          </div>
        </Card>

        <Card className="p-6 rounded-2xl border-[color:var(--hairline)] space-y-4">
          <div>
            <h3 className="text-[17px] font-semibold flex items-center gap-2">
              <TrendingUp className="size-4 text-emerald-600" />
              Quanto entra pela frente
            </h3>
            <p className="text-xs text-muted-foreground">Soma prevista no cenário {CENARIOS.find((c) => c.id === cenario)?.label.toLowerCase()}</p>
          </div>
          {[
            { label: "Próximos 3 meses", v: d.resumo.prox3[cenario] },
            { label: "Próximos 6 meses", v: d.resumo.prox6[cenario] },
            { label: "Próximos 12 meses", v: d.resumo.prox12[cenario] },
          ].map((r) => (
            <div key={r.label} className="flex items-center justify-between rounded-xl bg-muted/50 px-4 py-3">
              <span className="text-[13px] text-muted-foreground">{r.label}</span>
              <span className="text-[17px] font-semibold tabular-nums">{brl(r.v)}</span>
            </div>
          ))}
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Cálculo a partir da recorrência atual ({brl(d.mrr)}/mês) aplicando a tendência dos últimos meses. Não inclui
            vendas avulsas.
          </p>
        </Card>
      </div>

      {/* Meta do ano */}
      <Card className="p-6 rounded-2xl border-[color:var(--hairline)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-[17px] font-semibold flex items-center gap-2">
              <Target className="size-4 text-amber-600" />
              Meta de {d.ano.ano}
            </h3>
            <p className="text-xs text-muted-foreground">Acompanhe o quanto falta para bater o planejado</p>
          </div>
          {editMeta ? (
            <div className="flex items-center gap-2">
              <Input
                autoFocus
                value={metaInput}
                onChange={(e) => setMetaInput(e.target.value)}
                placeholder="Ex.: 120000"
                className="h-9 w-40"
              />
              <Button size="sm" onClick={salvarMeta}>
                <Check className="size-4" />
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditMeta(false)}>
                <X className="size-4" />
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setMetaInput(meta ? String(Math.round(meta / 100)) : "");
                setEditMeta(true);
              }}
            >
              <Pencil className="size-3.5 mr-1.5" />
              {meta ? "Alterar meta" : "Definir meta"}
            </Button>
          )}
        </div>

        {meta > 0 ? (
          <div className="mt-5 space-y-3">
            <div className="relative h-4 rounded-full bg-muted overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 bg-[color:var(--brand)]/25"
                style={{ width: `${pctMeta}%` }}
              />
              <div
                className="absolute inset-y-0 left-0 bg-[color:var(--brand)]"
                style={{ width: `${pctMetaReal}%` }}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-4">
              <Metric label="Meta do ano" value={brl(meta)} />
              <Metric label="Já faturado" value={brl(d.ano.faturado)} hint={`${pctMetaReal}% da meta`} />
              <Metric label="Projetado até dez" value={brl(d.ano.projetado)} hint={`${pctMeta}% da meta`} />
              <Metric
                label={d.ano.projetado >= meta ? "Acima da meta" : "Falta"}
                value={brl(Math.abs(meta - d.ano.projetado))}
                tone={d.ano.projetado >= meta ? "text-emerald-600" : "text-amber-600"}
              />
            </div>
            {d.ano.projetado < meta && (
              <Badge variant="secondary" className="text-[11.5px] font-normal">
                <Wallet className="size-3.5 mr-1.5" />
                Equivale a ~{Math.ceil((meta - d.ano.projetado) / Math.max(1, d.mrr / Math.max(1, d.clientesPagantes)))}{" "}
                mensalidade(s) adicionais até dezembro
              </Badge>
            )}
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">
            Defina uma meta anual para acompanhar o progresso ao lado da projeção.
          </p>
        )}
      </Card>
    </div>
  );
}

function Metric({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: string }) {
  return (
    <div className="rounded-xl bg-muted/50 px-4 py-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-[18px] font-semibold tabular-nums leading-tight ${tone ?? ""}`}>{value}</div>
      {hint && <div className="text-[11px] text-muted-foreground mt-0.5">{hint}</div>}
    </div>
  );
}
