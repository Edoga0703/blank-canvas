import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, AlertTriangle } from "lucide-react";
import { getAdminOverviewData, type AdminCrmStatus } from "@/lib/admin-crm.functions";

type Overview = {
  clientes: number;
  trial: number;
  ativos: number;
  inadimplentes: number;
  inativos: number;
  envios7d: number;
  falhas7d: number;
  semTelefone: number;
};

export function OverviewTab({ status }: { status: AdminCrmStatus }) {
  const fetchOverview = useServerFn(getAdminOverviewData);
  const [ov, setOv] = useState<Overview | null>(null);

  useEffect(() => {
    void fetchOverview()
      .then((r) => setOv(r.overview as Overview))
      .catch(() => setOv(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const alertas: string[] = [];
  if (!status.workspace?.conexao) alertas.push("Nenhum número de WhatsApp conectado no espaço interno.");
  if (status.automacoes.length && status.automacoes.every((a) => !a.ativo))
    alertas.push("Todas as automações estão desligadas.");
  if (ov?.falhas7d) alertas.push(`${ov.falhas7d} envio(s) falharam nos últimos 7 dias.`);
  if (ov?.semTelefone) alertas.push(`${ov.semTelefone} cliente(s) sem telefone cadastrado.`);

  const cards: { label: string; value: number | string }[] = ov
    ? [
        { label: "Clientes", value: ov.clientes },
        { label: "Em teste", value: ov.trial },
        { label: "Ativos", value: ov.ativos },
        { label: "Inadimplentes", value: ov.inadimplentes },
        { label: "Inativos (15+ dias)", value: ov.inativos },
        { label: "Envios (7 dias)", value: ov.envios7d },
      ]
    : [];

  return (
    <div className="space-y-4">
      {ov ? (
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-6">
          {cards.map((c) => (
            <Card key={c.label} className="p-4">
              <p className="text-xs text-muted-foreground">{c.label}</p>
              <p className="text-2xl font-semibold">{c.value}</p>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="p-6 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Calculando indicadores…
        </Card>
      )}

      {alertas.length > 0 && (
        <Card className="p-4 space-y-2">
          <p className="font-medium text-sm flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" /> Pontos de atenção
          </p>
          <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1">
            {alertas.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="p-4">
        <p className="font-medium text-sm mb-2">Últimos envios</p>
        {status.logs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum envio ainda.</p>
        ) : (
          <div className="space-y-1.5">
            {status.logs.slice(0, 8).map((l) => (
              <div
                key={l.id}
                className="flex items-center justify-between gap-3 text-xs border-b border-[color:var(--hairline)] pb-1.5"
              >
                <span className="font-medium">{l.trigger_key}</span>
                <span className="text-muted-foreground truncate flex-1">{l.erro ?? l.mensagem}</span>
                <Badge variant={l.status === "enviado" ? "secondary" : "destructive"}>{l.status}</Badge>
                <span className="text-muted-foreground">
                  {new Date(l.enviado_em).toLocaleString("pt-BR")}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
