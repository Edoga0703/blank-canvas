import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, DollarSign, ArrowDownToLine, ArrowUpFromLine, Repeat, AlertCircle, Wallet, Settings2 } from "lucide-react";
import { getOpenAiSpend, getOpenAiCredit, setOpenAiCredit, type OpenAiRange } from "@/lib/openai-usage.functions";
import { toast } from "sonner";

const RANGES: { v: OpenAiRange; label: string }[] = [
  { v: "mes", label: "Este mês" },
  { v: "mes_anterior", label: "Mês anterior" },
  { v: "7d", label: "Últimos 7 dias" },
  { v: "30d", label: "Últimos 30 dias" },
  { v: "90d", label: "Últimos 90 dias" },
];

const nf = new Intl.NumberFormat("pt-BR");
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

function Kpi({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint?: string }) {
  return (
    <Card className="p-4 rounded-2xl border-[color:var(--hairline)]">
      <div className="flex items-center gap-2 text-muted-foreground text-[12px]">{icon}{label}</div>
      <div className="mt-1 text-[22px] font-semibold tracking-tight">{value}</div>
      {hint && <div className="text-[11px] text-muted-foreground mt-0.5">{hint}</div>}
    </Card>
  );
}

export function OpenAiSpendPanel() {
  const load = useServerFn(getOpenAiSpend);
  const loadCredit = useServerFn(getOpenAiCredit);
  const saveCredit = useServerFn(setOpenAiCredit);
  const [range, setRange] = useState<OpenAiRange>("mes");
  const [data, setData] = useState<any | null>(null);
  const [credit, setCredit] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [creditOpen, setCreditOpen] = useState(false);
  const [creditTotal, setCreditTotal] = useState("");
  const [creditDesde, setCreditDesde] = useState("");
  const [saving, setSaving] = useState(false);

  function refreshCredit() {
    void loadCredit({})
      .then((r: any) => {
        setCredit(r);
        if (r?.configurado) {
          setCreditTotal(String(r.totalUsd));
          setCreditDesde(r.desde);
        }
      })
      .catch(() => setCredit(null));
  }

  useEffect(() => {
    let alive = true;
    setLoading(true);
    void load({ data: { range } })
      .then(r => { if (alive) setData(r); })
      .catch(() => { if (alive) setData(null); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [range, load]);

  useEffect(() => { refreshCredit(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSaveCredit() {
    const total = Number(String(creditTotal).replace(",", "."));
    if (!total || total <= 0) { toast.error("Informe o valor do crédito (ex.: 5)"); return; }
    if (!creditDesde) { toast.error("Informe a data da recarga"); return; }
    setSaving(true);
    try {
      await saveCredit({ data: { totalUsd: total, desde: creditDesde } });
      toast.success("Crédito salvo");
      setCreditOpen(false);
      refreshCredit();
    } catch {
      toast.error("Não foi possível salvar");
    } finally {
      setSaving(false);
    }
  }

  const maxDia = data?.serie?.length ? Math.max(...data.serie.map((s: any) => s.usd)) : 0;

  return (
    <Card className="p-5 sm:p-6 rounded-2xl border-[color:var(--hairline)] space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold">Gasto real na OpenAI</h2>
          <p className="text-xs text-muted-foreground">Custo e tokens direto da conta que roda os agentes. Os dados podem ter até 24h de atraso em relação ao painel da OpenAI.</p>
        </div>
        <div className="flex items-center gap-2">
          <Popover open={creditOpen} onOpenChange={setCreditOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 gap-1.5">
                <Wallet className="size-3.5" /> Crédito
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 space-y-3" align="end">
              <div className="text-sm font-medium flex items-center gap-1.5">
                <Settings2 className="size-4" /> Crédito da conta OpenAI
              </div>
              <p className="text-[11px] text-muted-foreground">
                Informe o valor da última recarga (ex.: 5 dólares) e a data. O saldo é calculado automaticamente pelo gasto real.
              </p>
              <div className="space-y-1.5">
                <Label className="text-xs">Crédito total (US$)</Label>
                <Input value={creditTotal} onChange={e => setCreditTotal(e.target.value)} placeholder="5.00" inputMode="decimal" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Data da recarga</Label>
                <Input type="date" value={creditDesde} onChange={e => setCreditDesde(e.target.value)} />
              </div>
              <Button size="sm" className="w-full" onClick={handleSaveCredit} disabled={saving}>
                {saving && <Loader2 className="size-3.5 animate-spin" />} Salvar
              </Button>
            </PopoverContent>
          </Popover>
          <Select value={range} onValueChange={v => setRange(v as OpenAiRange)}>
            <SelectTrigger className="w-[180px] h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {RANGES.map(r => <SelectItem key={r.v} value={r.v}>{r.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {credit?.configurado && (
        <div className="space-y-2 rounded-xl border border-[color:var(--hairline)] bg-muted/40 px-4 py-3 text-sm">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Wallet className="size-4" />
              Crédito: <strong className="text-foreground">{usd.format(credit.totalUsd)}</strong>
            </span>
            <span className="text-muted-foreground">
              Gasto desde {new Date(credit.desde + "T00:00:00Z").toLocaleDateString("pt-BR")}:{" "}
              <strong className="text-foreground">{usd.format(credit.gastoDesde)}</strong>
            </span>
            <span className="text-muted-foreground">
              Saldo estimado:{" "}
              <strong className={credit.restante <= credit.totalUsd * 0.2 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}>
                {usd.format(credit.restante)}
              </strong>
            </span>
          </div>
          {credit.tokensRestantes != null && (
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-[12px] text-muted-foreground border-t border-[color:var(--hairline)] pt-2">
              <span>
                Tokens ainda disponíveis (estimado):{" "}
                <strong className="text-foreground">{nf.format(credit.tokensRestantes)}</strong>
              </span>
              {credit.mensagensRestantes != null && (
                <span>
                  Respostas de IA restantes (estimado):{" "}
                  <strong className="text-foreground">{nf.format(credit.mensagensRestantes)}</strong>
                </span>
              )}
              {credit.custoPorMensagem != null && (
                <span>Custo médio por resposta: US$ {credit.custoPorMensagem.toFixed(5)}</span>
              )}
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div className="py-10 flex justify-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
      ) : !data || data.configurado === false ? (
        <div className="flex items-start gap-2 rounded-xl bg-amber-500/10 text-amber-700 dark:text-amber-400 p-3 text-xs">
          <AlertCircle className="size-4 shrink-0 mt-0.5" />
          <span>{data?.motivo ?? "Não foi possível carregar o gasto da OpenAI."}</span>
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi icon={<DollarSign className="size-3.5" />} label="Gasto no período" value={usd.format(data.totalUsd)} hint={data.periodo.label} />
            <Kpi icon={<Repeat className="size-3.5" />} label="Chamadas" value={nf.format(data.requests)} hint="Requisições aos modelos" />
            <Kpi icon={<ArrowDownToLine className="size-3.5" />} label="Tokens de entrada" value={nf.format(data.inputTokens)} />
            <Kpi icon={<ArrowUpFromLine className="size-3.5" />} label="Tokens de saída" value={nf.format(data.outputTokens)} />
          </div>

          {data.serie.length > 0 && (
            <div>
              <div className="text-xs text-muted-foreground mb-2">Gasto por dia</div>
              <div className="flex items-end gap-1 h-24">
                {data.serie.map((s: any) => (
                  <div key={s.dia} className="flex-1 min-w-[3px] rounded-t bg-primary/70" title={`${s.dia}: ${usd.format(s.usd)}`}
                    style={{ height: `${maxDia > 0 ? Math.max(4, (s.usd / maxDia) * 100) : 4}%` }} />
                ))}
              </div>
            </div>
          )}

          {data.modelos.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-muted-foreground">
                  <tr className="text-left">
                    <th className="py-2 pr-3 font-medium">Modelo</th>
                    <th className="py-2 pr-3 font-medium text-right">Chamadas</th>
                    <th className="py-2 pr-3 font-medium text-right">Entrada</th>
                    <th className="py-2 font-medium text-right">Saída</th>
                  </tr>
                </thead>
                <tbody>
                  {data.modelos.map((m: any) => (
                    <tr key={m.modelo} className="border-t border-[color:var(--hairline)]">
                      <td className="py-2 pr-3">{m.modelo}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{nf.format(m.requests)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{nf.format(m.input)}</td>
                      <td className="py-2 text-right tabular-nums">{nf.format(m.output)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
