import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Loader2, BarChart3, Megaphone, Unplug, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import {
  iniciarGoogleMarketing,
  statusGoogleMarketing,
  desconectarGoogleMarketing,
  listarContasGoogleMarketing,
  definirContaGoogleMarketing,
  relatorioGoogleMarketing,
} from "@/lib/google-marketing.functions";

type Servico = "google-analytics" | "google-ads";

function moeda(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Painel dos plugins Google Analytics e Google Ads. */
export function GoogleMarketingPanel({ servico }: { servico: Servico }) {
  const qc = useQueryClient();
  const ads = servico === "google-ads";
  const nome = ads ? "Google Ads" : "Google Analytics";

  const iniciar = useServerFn(iniciarGoogleMarketing);
  const status = useServerFn(statusGoogleMarketing);
  const desconectar = useServerFn(desconectarGoogleMarketing);
  const listar = useServerFn(listarContasGoogleMarketing);
  const definir = useServerFn(definirContaGoogleMarketing);
  const relatorio = useServerFn(relatorioGoogleMarketing);

  const [busy, setBusy] = useState(false);
  const [contas, setContas] = useState<{ id: string; nome: string }[] | null>(null);
  const [dados, setDados] = useState<any>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["google-marketing", servico],
    queryFn: () => status({ data: { servico } }),
  });

  async function run(fn: () => Promise<any>, ok?: string) {
    setBusy(true);
    try {
      const r = await fn();
      if (ok) toast.success(ok);
      qc.invalidateQueries({ queryKey: ["google-marketing", servico] });
      return r;
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

  const selecionado = ads ? data?.customerNome : data?.propertyNome;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        {ads ? <Megaphone className="h-4 w-4 text-primary" /> : <BarChart3 className="h-4 w-4 text-primary" />} {nome}
      </div>

      {!data?.conectado ? (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            {ads
              ? "Entre com a conta Google que administra o Google Ads para acompanhar o desempenho das campanhas dentro do Capi Conversa."
              : "Entre com a conta Google que tem acesso ao Analytics para acompanhar acessos e conversões do site dentro do Capi Conversa."}
          </p>
          <Button
            size="sm"
            disabled={busy}
            onClick={async () => {
              const r: any = await run(() => iniciar({ data: { servico } }));
              if (r?.url) window.open(r.url, "_blank", "width=520,height=650");
            }}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : `Entrar com Google`}
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2">
            <div className="min-w-0">
              <div className="text-xs font-medium text-emerald-600">Conectado</div>
              <div className="text-[11px] text-muted-foreground truncate">
                {data.email ?? "conta Google"}
                {selecionado ? ` · ${selecionado}` : ""}
              </div>
            </div>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => run(() => desconectar({ data: { servico } }), "Conta desconectada")}
            >
              <Unplug className="h-4 w-4 mr-1" /> Desconectar
            </Button>
          </div>

          {ads && !data.devToken && (
            <p className="text-[11px] rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-amber-700">
              Falta o token de desenvolvedor do Google Ads (pedido dentro da sua conta de administrador). Sem ele o
              Google não libera a leitura das campanhas.
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={async () => {
                const r: any = await run(() => listar({ data: { servico } }));
                if (r?.itens) setContas(r.itens);
              }}
            >
              <RefreshCw className="h-4 w-4 mr-1" /> {ads ? "Escolher conta" : "Escolher propriedade"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={async () => {
                const r: any = await run(() => relatorio({ data: { servico, dias: 7 } }));
                if (r) setDados(r);
              }}
            >
              Ver últimos 7 dias
            </Button>
          </div>

          {contas && (
            <div className="space-y-1 max-h-44 overflow-auto rounded-lg border p-2">
              {contas.length === 0 && <p className="text-xs text-muted-foreground">Nenhuma conta encontrada.</p>}
              {contas.map((c) => (
                <button
                  key={c.id}
                  className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-muted"
                  onClick={() =>
                    run(() => definir({ data: { servico, id: c.id, nome: c.nome } }), "Conta selecionada").then(() =>
                      setContas(null),
                    )
                  }
                >
                  {c.nome} <span className="text-muted-foreground">· {c.id}</span>
                </button>
              ))}
            </div>
          )}

          {dados?.tipo === "analytics" && (
            <div className="rounded-lg border p-3 space-y-2">
              <div className="text-xs font-medium">
                {dados.totais.sessoes} sessões · {dados.totais.usuarios} pessoas · {dados.totais.conversoes} conversões
              </div>
              {dados.linhas.map((l: any) => (
                <div key={l.canal} className="flex justify-between text-[11px] text-muted-foreground">
                  <span className="truncate">{l.canal}</span>
                  <span>{l.sessoes} sessões</span>
                </div>
              ))}
            </div>
          )}

          {dados?.tipo === "ads" && (
            <div className="rounded-lg border p-3 space-y-2">
              <div className="text-xs font-medium">
                {dados.totais.cliques} cliques · {moeda(dados.totais.custoCents)} investido ·{" "}
                {Math.round(dados.totais.conversoes)} conversões
              </div>
              {dados.linhas.map((l: any, i: number) => (
                <div key={i} className="flex justify-between text-[11px] text-muted-foreground">
                  <span className="truncate">{l.campanha}</span>
                  <span>{moeda(l.custoCents)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
