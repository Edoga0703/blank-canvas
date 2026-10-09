import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Loader2, RefreshCw, CheckCircle2, Search } from "lucide-react";
import { listChargesMaster, markChargePaidMaster, syncChargeMaster } from "@/lib/billing-checkout.functions";

const brl = (c: number) => ((c ?? 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const STATUS: { id: string | null; label: string }[] = [
  { id: null, label: "Todas" },
  { id: "pending", label: "Aguardando" },
  { id: "paid", label: "Pagas" },
  { id: "failed", label: "Falhas" },
  { id: "canceled", label: "Canceladas" },
];

/** Cobranças geradas pelo checkout próprio (Abacate Pay). */
export function ChargesPanel() {
  const listFn = useServerFn(listChargesMaster);
  const markFn = useServerFn(markChargePaidMaster);
  const syncFn = useServerFn(syncChargeMaster);

  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      setRows((await listFn({ data: { status, busca } })) as any);
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, [status]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold">Cobranças do checkout</h2>
          <p className="text-[12px] text-muted-foreground">Geradas dentro do sistema (Abacate Pay).</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {STATUS.map((s) => (
            <Button
              key={s.label}
              size="sm"
              variant={status === s.id ? "default" : "outline"}
              onClick={() => setStatus(s.id)}
            >
              {s.label}
            </Button>
          ))}
          <Input
            className="w-44 h-9"
            placeholder="Buscar empresa"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && load()}
          />
          <Button variant="outline" size="icon" className="size-9" onClick={() => load()} aria-label="Buscar">
            <Search className="size-4" />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="grid place-items-center py-14">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground rounded-2xl border-[color:var(--hairline)]">
          Nenhuma cobrança gerada pelo checkout próprio.
        </Card>
      ) : (
        <div className="space-y-2">
          {rows.map((c) => (
            <Card key={c.id} className="p-4 flex items-center gap-3 flex-wrap rounded-2xl border-[color:var(--hairline)]">
              <div className="min-w-0 flex-1">
                <div className="font-medium truncate">{c.company?.nome ?? "—"}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {c.descricao} · {c.metodo === "pix" ? "PIX" : "Cartão"} · {c.origem}
                  {c.ciclo_ref ? ` · ciclo ${c.ciclo_ref}` : ""}
                </div>
                {c.erro && <div className="text-xs text-destructive truncate">{c.erro}</div>}
              </div>
              <div className="text-sm text-muted-foreground">{new Date(c.created_at).toLocaleDateString("pt-BR")}</div>
              <div className="font-semibold">{brl(c.total_cents)}</div>
              <Badge
                variant={c.status === "paid" ? "default" : "outline"}
                className={c.status === "paid" ? "bg-emerald-600 hover:bg-emerald-600" : ""}
              >
                {c.status}
              </Badge>
              {c.status !== "paid" && (
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busyId === c.id}
                    onClick={async () => {
                      setBusyId(c.id);
                      try {
                        const r: any = await syncFn({ data: { id: c.id } });
                        toast.success(`Status: ${r?.status}`);
                        await load();
                      } catch (e: any) {
                        toast.error(e?.message ?? "Erro");
                      } finally {
                        setBusyId(null);
                      }
                    }}
                  >
                    <RefreshCw className="size-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busyId === c.id}
                    onClick={async () => {
                      if (!confirm("Dar baixa manual nesta cobrança?")) return;
                      setBusyId(c.id);
                      try {
                        await markFn({ data: { id: c.id } });
                        toast.success("Baixa registrada");
                        await load();
                      } catch (e: any) {
                        toast.error(e?.message ?? "Erro");
                      } finally {
                        setBusyId(null);
                      }
                    }}
                  >
                    <CheckCircle2 className="size-3.5 mr-1" /> Baixa manual
                  </Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
