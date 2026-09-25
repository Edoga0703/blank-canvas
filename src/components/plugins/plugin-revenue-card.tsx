import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listPluginReceita, type PluginReceita } from "@/lib/plugins.functions";
import { Card } from "@/components/ui/card";
import { Loader2, TrendingUp } from "lucide-react";

const brl = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function PluginRevenueCard() {
  const list = useServerFn(listPluginReceita);
  const [rows, setRows] = useState<PluginReceita[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await list();
        if (alive) setRows(r);
      } catch {
        /* silencioso: painel auxiliar */
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const mrr = rows.reduce((a, r) => a + r.receita_mensal_cents, 0);
  const trials = rows.reduce((a, r) => a + r.em_trial, 0);

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <TrendingUp className="size-4 text-primary" />
          <h2 className="font-semibold">Receita por plugin</h2>
        </div>
        <div className="text-sm text-muted-foreground">
          MRR de plugins: <span className="font-semibold text-foreground">{brl(mrr)}</span> ·{" "}
          {trials} em teste
        </div>
      </div>

      {loading ? (
        <div className="grid place-items-center py-8">
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground mt-4">Nenhum plugin no catálogo.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Plugin</th>
                <th className="py-2 px-3 font-medium">Preço</th>
                <th className="py-2 px-3 font-medium">Instalações</th>
                <th className="py-2 px-3 font-medium">Em teste</th>
                <th className="py-2 px-3 font-medium">Assinaturas</th>
                <th className="py-2 px-3 font-medium">Canceladas</th>
                <th className="py-2 px-3 font-medium">Churn</th>
                <th className="py-2 pl-3 font-medium text-right">Receita/mês</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const base = r.assinaturas_ativas + r.canceladas;
                const churn = base ? Math.round((r.canceladas / base) * 100) : 0;
                return (
                  <tr key={r.plugin_id} className="border-t border-border/60">
                    <td className="py-2 pr-3 font-medium">{r.nome}</td>
                    <td className="py-2 px-3 text-muted-foreground">
                      {r.gratuito ? "Grátis" : brl(Math.round(r.preco_mensal * 100))}
                    </td>
                    <td className="py-2 px-3">{r.instalacoes}</td>
                    <td className="py-2 px-3">{r.em_trial}</td>
                    <td className="py-2 px-3">{r.assinaturas_ativas}</td>
                    <td className="py-2 px-3 text-muted-foreground">{r.canceladas}</td>
                    <td
                      className={`py-2 px-3 font-medium ${churn >= 20 ? "text-destructive" : "text-muted-foreground"}`}
                    >
                      {base ? `${churn}%` : "—"}
                    </td>
                    <td className="py-2 pl-3 text-right font-semibold">
                      {brl(r.receita_mensal_cents)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
