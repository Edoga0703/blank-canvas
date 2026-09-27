import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ShoppingBag, Loader2, Download, Unplug, Package, ReceiptText } from "lucide-react";
import { toast } from "sonner";
import {
  statusOlist,
  conectarOlist,
  desconectarOlist,
  importarClientesOlist,
  importarPedidosOlist,
  sincronizarProdutosOlist,
  definirAutoPedidoOlist,
} from "@/lib/olist.functions";

/** Painel do plugin Olist ERP (Tiny). */
export function OlistPanel() {
  const qc = useQueryClient();
  const status = useServerFn(statusOlist);
  const conectar = useServerFn(conectarOlist);
  const desconectar = useServerFn(desconectarOlist);
  const importar = useServerFn(importarClientesOlist);
  const importarPed = useServerFn(importarPedidosOlist);
  const syncProd = useServerFn(sincronizarProdutosOlist);
  const setAuto = useServerFn(definirAutoPedidoOlist);

  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);

  const { data, isLoading } = useQuery({ queryKey: ["olist-status"], queryFn: () => status() });

  async function run(fn: () => Promise<any>, ok: string) {
    setBusy(true);
    try {
      const r: any = await fn();
      toast.success(r?.resumo ? `${ok}: ${r.resumo}` : ok);
      qc.invalidateQueries({ queryKey: ["olist-status"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível concluir.");
    } finally {
      setBusy(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <ShoppingBag className="h-4 w-4 text-primary" /> Olist ERP (Tiny)
      </div>

      {!data?.conectado ? (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Na Olist ERP, acesse Configurações → Geral → Token da API (aba Integrações) e gere o
            Token de acesso. Cole abaixo.
          </p>
          <div className="flex gap-2">
            <Input
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Token de acesso da API"
              className="h-9"
            />
            <Button
              size="sm"
              onClick={() => run(() => conectar({ data: { token: token.trim() } }).then((r) => { setToken(""); return r; }), "Conta Olist conectada")}
              disabled={busy || token.trim().length < 20}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Conectar"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Conectado • token {data.tokenMascarado}
            {data.ultimoResultado ? ` • última sincronização: ${data.ultimoResultado}` : ""}
          </p>

          <div className="flex items-center justify-between rounded-lg border border-[var(--border)] p-2.5">
            <div>
              <p className="text-xs font-medium">Criar pedido na Olist ao registrar venda</p>
              <p className="text-[11px] text-muted-foreground">
                Toda venda registrada no Capi Conversa vira pedido na Olist automaticamente.
              </p>
            </div>
            <Switch
              checked={data.autoPedido !== false}
              disabled={busy}
              onCheckedChange={(v) => run(() => setAuto({ data: { ativo: v } }), v ? "Ativado" : "Desativado")}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => run(() => importar({ data: { paginas: 3 } }), "Clientes importados")} disabled={busy}>
              <Download className="h-4 w-4 mr-2" /> Importar clientes
            </Button>
            <Button size="sm" variant="outline" onClick={() => run(() => syncProd({ data: { paginas: 3 } }), "Produtos sincronizados")} disabled={busy}>
              <Package className="h-4 w-4 mr-2" /> Sincronizar produtos
            </Button>
            <Button size="sm" variant="outline" onClick={() => run(() => importarPed({ data: { paginas: 2 } }), "Pedidos importados")} disabled={busy}>
              <ReceiptText className="h-4 w-4 mr-2" /> Importar pedidos
            </Button>
            <Button size="sm" variant="outline" onClick={() => run(() => desconectar(), "Conta desconectada")} disabled={busy}>
              <Unplug className="h-4 w-4 mr-2" /> Desconectar
            </Button>
          </div>

          <p className="text-[11px] text-muted-foreground">
            Pedidos importados viram vendas no Comercial e notificam a equipe. No card do contato,
            a aba <strong>Pedidos</strong> mostra o status e o rastreio em tempo real.
          </p>
        </div>
      )}
    </div>
  );
}
