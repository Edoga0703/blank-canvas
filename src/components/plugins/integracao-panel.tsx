import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Loader2, Plug, Unplug, Download, Send, Bell, ReceiptText } from "lucide-react";
import { toast } from "sonner";
import { INTEGRACOES } from "@/lib/integracoes/catalogo";
import {
  statusIntegracao,
  conectarIntegracao,
  desconectarIntegracao,
  definirAutoEnvioIntegracao,
  testarAvisoIntegracao,
  importarClientesIntegracao,
  importarPedidosIntegracao,
  enviarContatosIntegracao,
} from "@/lib/integracoes.functions";

/** Painel padrão das integrações por chave (cola a chave e usa). */
export function IntegracaoPanel({ servico }: { servico: string }) {
  const meta = INTEGRACOES[servico];
  const qc = useQueryClient();

  const status = useServerFn(statusIntegracao);
  const conectar = useServerFn(conectarIntegracao);
  const desconectar = useServerFn(desconectarIntegracao);
  const setAuto = useServerFn(definirAutoEnvioIntegracao);
  const testar = useServerFn(testarAvisoIntegracao);
  const impClientes = useServerFn(importarClientesIntegracao);
  const impPedidos = useServerFn(importarPedidosIntegracao);
  const envContatos = useServerFn(enviarContatosIntegracao);

  const [campos, setCampos] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["integracao", servico],
    queryFn: () => status({ data: { servico } }),
    enabled: !!meta,
  });

  if (!meta) return null;

  async function run(fn: () => Promise<any>, ok: string) {
    setBusy(true);
    try {
      const r: any = await fn();
      toast.success(r?.resumo ? `${ok}: ${r.resumo}` : ok);
      qc.invalidateQueries({ queryKey: ["integracao", servico] });
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

  const preenchido = meta.campos.every((c) => (campos[c.id] ?? "").trim().length > 2);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Plug className="h-4 w-4 text-primary" /> {meta.nome}
      </div>

      {!data?.conectado ? (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">{meta.ajuda}</p>
          {meta.campos.map((c) => (
            <Input
              key={c.id}
              value={campos[c.id] ?? ""}
              type={c.tipo === "senha" ? "password" : "text"}
              onChange={(e) => setCampos((v) => ({ ...v, [c.id]: e.target.value }))}
              placeholder={c.placeholder ?? c.label}
              className="h-9"
            />
          ))}
          <Button
            size="sm"
            disabled={busy || !preenchido}
            onClick={() =>
              run(
                () =>
                  conectar({ data: { servico, campos } }).then((r) => {
                    setCampos({});
                    return r;
                  }),
                `${meta.nome} conectado`,
              )
            }
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Conectar"}
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2">
            <div className="min-w-0">
              <div className="text-xs font-medium text-emerald-600">Conectado</div>
              <div className="text-[11px] text-muted-foreground truncate">
                {data.chaveMascarada || "chave salva com segurança"}
              </div>
            </div>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => run(() => desconectar({ data: { servico } }), "Integração desconectada")}
            >
              <Unplug className="h-4 w-4 mr-1" /> Desconectar
            </Button>
          </div>

          {meta.autoVenda && (
            <div className="flex items-center justify-between rounded-lg border px-3 py-2">
              <div className="text-xs">
                <div className="font-medium">Enviar vendas automaticamente</div>
                <div className="text-muted-foreground">Cada venda registrada vai para o {meta.nome}.</div>
              </div>
              <Switch
                checked={data.autoEnvio !== false}
                disabled={busy}
                onCheckedChange={(v) =>
                  run(() => setAuto({ data: { servico, ativo: v } }), v ? "Envio automático ligado" : "Envio automático desligado")
                }
              />
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {meta.acoes.includes("testar-aviso") && (
              <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => testar({ data: { servico } }), "Aviso enviado")}>
                <Bell className="h-4 w-4 mr-1" /> Enviar teste
              </Button>
            )}
            {meta.acoes.includes("importar-clientes") && (
              <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => impClientes({ data: { servico } }), "Clientes importados")}>
                <Download className="h-4 w-4 mr-1" /> Importar clientes
              </Button>
            )}
            {meta.acoes.includes("importar-pedidos") && (
              <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => impPedidos({ data: { servico } }), "Pedidos importados")}>
                <ReceiptText className="h-4 w-4 mr-1" /> Importar pedidos
              </Button>
            )}
            {meta.acoes.includes("enviar-contatos") && (
              <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => envContatos({ data: { servico } }), "Contatos enviados")}>
                <Send className="h-4 w-4 mr-1" /> Enviar contatos
              </Button>
            )}
          </div>

          {data.ultimoResultado && (
            <p className="text-[11px] text-muted-foreground">Última ação: {data.ultimoResultado}</p>
          )}
        </div>
      )}

      {meta.rodape && <p className="text-[11px] text-muted-foreground">{meta.rodape}</p>}
    </div>
  );
}
