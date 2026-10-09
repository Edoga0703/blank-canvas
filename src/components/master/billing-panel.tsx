import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, Trash2, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { listBillingEvents, reprocessBillingEvent, deleteBillingEvent } from "@/lib/master-admin.functions";

export function BillingPanel() {
  const list = useServerFn(listBillingEvents);
  const retry = useServerFn(reprocessBillingEvent);
  const del = useServerFn(deleteBillingEvent);
  const [rows, setRows] = useState<any[] | null>(null);
  const [onlyFailed, setOnlyFailed] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  async function reload() {
    try { setRows(await list({ data: { onlyFailed, limit: 200 } })); } catch (e: any) { toast.error(e?.message); }
  }
  useEffect(() => { void reload(); }, [onlyFailed]);

  async function reprocess(id: string) {
    setBusy(id);
    try {
      const r: any = await retry({ data: { id } });
      if (r?.ok === false) toast.error(`Falhou: ${r.reason ?? "erro"}`);
      else toast.success("Reprocessado");
      await reload();
    } catch (e: any) { toast.error(e?.message); } finally { setBusy(null); }
  }
  async function remove(id: string) {
    if (!confirm("Excluir este evento?")) return;
    setBusy(id);
    try { await del({ data: { id } }); await reload(); } catch (e: any) { toast.error(e?.message); } finally { setBusy(null); }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <p className="text-sm text-muted-foreground">Eventos de webhook dos provedores (Kiwify, Cakto, PerfectPay)</p>
        <div className="flex gap-2">
          <Button variant={onlyFailed ? "default" : "outline"} size="sm" onClick={() => setOnlyFailed(true)}>Só falhas</Button>
          <Button variant={onlyFailed ? "outline" : "default"} size="sm" onClick={() => setOnlyFailed(false)}>Todos</Button>
          <Button variant="outline" size="sm" onClick={reload}><RefreshCw className="size-3.5 mr-1" />Atualizar</Button>
        </div>
      </div>

      {!rows ? (
        <div className="py-20 grid place-items-center"><Loader2 className="animate-spin size-6" /></div>
      ) : rows.length === 0 ? (
        <Card className="p-10 text-center rounded-2xl border-[color:var(--hairline)]">
          <CheckCircle2 className="size-10 mx-auto text-emerald-500" />
          <p className="mt-2 text-sm text-muted-foreground">Nenhum evento {onlyFailed ? "com falha" : ""}.</p>
        </Card>
      ) : (
        <Card className="rounded-2xl border-[color:var(--hairline)] overflow-hidden">
          <div className="divide-y divide-[color:var(--hairline)]">
            {rows.map((r) => (
              <div key={r.id} className="p-4 flex flex-col md:flex-row md:items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="uppercase text-[10px]">{r.provider}</Badge>
                    <span className="text-sm font-medium truncate">{r.event_type ?? "—"}</span>
                    {r.processed ? (
                      <Badge className="text-[10px] bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Processado</Badge>
                    ) : (
                      <Badge variant="destructive" className="text-[10px]"><AlertCircle className="size-3 mr-1" />Pendente</Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1 truncate">
                    {r.buyer_email ?? "—"} · {new Date(r.created_at).toLocaleString("pt-BR")}
                  </div>
                  {r.error && (
                    <div className="text-xs text-destructive mt-1 truncate">Erro: {r.error}</div>
                  )}
                </div>
                <div className="flex gap-2 shrink-0">
                  {r.payload?.provider && (
                    <Button size="sm" variant="outline" disabled={busy === r.id} onClick={() => reprocess(r.id)}>
                      <RefreshCw className="size-3.5 mr-1" />Reprocessar
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" className="text-destructive" disabled={busy === r.id} onClick={() => remove(r.id)}>
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
