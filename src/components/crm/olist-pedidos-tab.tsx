import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, ReceiptText, Truck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { pedidosDoContato } from "@/lib/olist.functions";

/** Aba "Pedidos": status em tempo real dos pedidos do contato na Olist. */
export function OlistPedidosTab({ nome }: { nome: string }) {
  const buscar = useServerFn(pedidosDoContato);
  const { data, isLoading } = useQuery({
    queryKey: ["olist-pedidos", nome],
    queryFn: () => buscar({ data: { nome } }),
    enabled: (nome ?? "").trim().length >= 3,
  });

  if ((nome ?? "").trim().length < 3) {
    return <p className="text-xs text-muted-foreground">Informe o nome do contato para consultar os pedidos.</p>;
  }
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Buscando pedidos…
      </div>
    );
  }

  const pedidos = (data as any)?.pedidos ?? [];
  if (!pedidos.length) {
    return <p className="text-xs text-muted-foreground">Nenhum pedido encontrado na Olist para este contato.</p>;
  }

  return (
    <div className="space-y-2">
      {pedidos.map((p: any) => (
        <div key={p.id} className="rounded-lg border border-[var(--border)] p-2.5 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 font-medium">
              <ReceiptText className="h-3.5 w-3.5 text-primary" /> Pedido #{p.numero || p.id}
            </span>
            <Badge variant="secondary">{p.situacao || "—"}</Badge>
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 text-muted-foreground">
            <span>{p.data}</span>
            <span>
              {Number(p.valor || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
            </span>
          </div>
          {p.rastreio ? (
            <div className="mt-1 flex items-center gap-1.5 text-muted-foreground">
              <Truck className="h-3.5 w-3.5" /> {p.rastreio}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
