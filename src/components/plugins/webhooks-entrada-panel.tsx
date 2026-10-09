import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  listarInboundWebhooks,
  criarInboundWebhook,
  excluirInboundWebhook,
  alternarInboundWebhook,
} from "@/lib/webhooks-entrada.functions";
import { Webhook, Copy, Trash2, Plus, Loader2, Check } from "lucide-react";
import { toast } from "sonner";

/** Painel do plugin Webhooks de Entrada: gerencia URLs de captura de leads. */
export function WebhooksEntradaPanel() {
  const qc = useQueryClient();
  const listar = useServerFn(listarInboundWebhooks);
  const criar = useServerFn(criarInboundWebhook);
  const excluir = useServerFn(excluirInboundWebhook);
  const alternar = useServerFn(alternarInboundWebhook);
  const [nome, setNome] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [copiado, setCopiado] = useState<string | null>(null);

  const { data: hooks, isLoading } = useQuery({
    queryKey: ["inbound-webhooks"],
    queryFn: () => listar(),
  });

  const urlBase = typeof window !== "undefined" ? window.location.origin : "";

  async function onCriar() {
    if (!nome.trim()) return;
    setSalvando(true);
    try {
      await criar({ data: { nome: nome.trim() } });
      setNome("");
      qc.invalidateQueries({ queryKey: ["inbound-webhooks"] });
      toast.success("Webhook criado.");
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao criar.");
    } finally {
      setSalvando(false);
    }
  }

  function copiar(token: string) {
    navigator.clipboard.writeText(`${urlBase}/api/public/hooks/${token}`);
    setCopiado(token);
    setTimeout(() => setCopiado(null), 2000);
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Receba leads de qualquer ferramenta (RD Station, Typeform, planilhas, seu site) com um
        simples <b>POST</b>. Cada lead cai direto na primeira etapa do funil comercial.
      </p>

      <div className="flex gap-2">
        <Input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Ex.: Formulário do site"
          className="h-8 text-xs"
          maxLength={80}
        />
        <Button size="sm" onClick={onCriar} disabled={salvando || !nome.trim()}>
          {salvando ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-4"><Loader2 className="size-4 animate-spin text-muted-foreground" /></div>
      ) : !hooks?.length ? (
        <p className="text-xs text-muted-foreground text-center py-3">
          Nenhum webhook criado ainda.
        </p>
      ) : (
        <div className="space-y-2">
          {hooks.map((h: any) => (
            <div key={h.id} className="rounded-lg border p-2.5 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Webhook className="size-3.5 shrink-0 text-primary" />
                  <span className="text-xs font-medium truncate">{h.nome}</span>
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    · {h.total_recebidos ?? 0} recebidos
                  </span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Switch
                    checked={!!h.ativo}
                    onCheckedChange={async (v) => {
                      await alternar({ data: { id: h.id, ativo: v } });
                      qc.invalidateQueries({ queryKey: ["inbound-webhooks"] });
                    }}
                  />
                  <Button
                    size="icon" variant="ghost" className="size-7"
                    onClick={async () => {
                      await excluir({ data: { id: h.id } });
                      qc.invalidateQueries({ queryKey: ["inbound-webhooks"] });
                      toast.success("Webhook excluído.");
                    }}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <code className="flex-1 text-[10px] bg-muted rounded px-1.5 py-1 truncate">
                  POST {urlBase}/api/public/hooks/{h.token}
                </code>
                <Button size="icon" variant="ghost" className="size-7 shrink-0" onClick={() => copiar(h.token)}>
                  {copiado === h.token ? <Check className="size-3.5 text-green-600" /> : <Copy className="size-3.5" />}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <details className="text-[11px] text-muted-foreground">
        <summary className="cursor-pointer font-medium text-foreground">Exemplo de envio</summary>
        <pre className="mt-1 bg-muted rounded p-2 overflow-x-auto text-[10px]">{`curl -X POST <url-do-webhook> \\
  -H "Content-Type: application/json" \\
  -d '{"numero":"5511999999999","nome":"Maria","mensagem":"Quero orçamento"}'`}</pre>
        <p className="mt-1">Campos aceitos: numero (obrigatório), nome, email, mensagem, valor, utm_source, utm_medium, utm_campaign, origem.</p>
      </details>
    </div>
  );
}
