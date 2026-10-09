import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plug, ExternalLink, MessageCircle } from "lucide-react";
import type { AdminCrmStatus } from "@/lib/admin-crm.functions";

type Props = {
  workspace: AdminCrmStatus["workspace"];
  busy: string | null;
  onCreate: () => void;
};

const OK = ["connected", "open", "conectado"];

export function ConnectionHeader({ workspace, busy, onCreate }: Props) {
  const conexao = workspace?.conexao ?? null;
  const conectado = !!conexao && OK.includes(conexao.status.toLowerCase());

  function abrirCrm(rota: string) {
    if (!workspace) return;
    try {
      sessionStorage.setItem("master_impersonate_company", workspace.id);
    } catch {
      /* ignore */
    }
    window.location.href = rota;
  }

  if (!workspace) {
    return (
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2 font-medium">
          <Plug className="h-4 w-4" /> Espaço comercial interno
        </div>
        <p className="text-sm text-muted-foreground">
          Crie o espaço interno para usar o CRM com o seu WhatsApp comercial. Ele funciona como uma
          conta de cliente, só que visível apenas para você.
        </p>
        <Button disabled={busy === "ws"} onClick={onCreate}>
          {busy === "ws" && <Loader2 className="h-4 w-4 animate-spin" />} Criar espaço interno
        </Button>
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                conectado ? "bg-emerald-500" : conexao ? "bg-amber-500" : "bg-rose-500"
              }`}
            />
            <p className="font-medium truncate">{workspace.nome}</p>
            {conexao ? (
              <Badge variant="secondary">
                {conexao.instance_name} · {conexao.status}
              </Badge>
            ) : (
              <Badge variant="destructive">sem número conectado</Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {conectado
              ? "Este é o WhatsApp comercial: as automações e disparos usam a mesma conversa que você atende."
              : conexao
                ? "O número existe mas não está conectado. Reconecte para voltar a enviar."
                : "Conecte um número dentro deste espaço para liberar automações e disparos."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => abrirCrm("/app/conexao")}>
            <Plug className="h-4 w-4" /> Conexões
          </Button>
          <Button variant="outline" size="sm" onClick={() => abrirCrm("/app/conversas")}>
            <MessageCircle className="h-4 w-4" /> Conversas
          </Button>
          <Button size="sm" onClick={() => abrirCrm("/app/crm")}>
            <ExternalLink className="h-4 w-4" /> Abrir meu CRM comercial
          </Button>
        </div>
      </div>
    </Card>
  );
}
