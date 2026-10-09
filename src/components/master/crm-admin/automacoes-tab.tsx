import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, Zap } from "lucide-react";
import { getAdminOverviewData, type AdminCrmStatus } from "@/lib/admin-crm.functions";
import { SignupWelcomeCard } from "@/components/master/signup-welcome-card";

type Props = {
  automacoes: AdminCrmStatus["automacoes"];
  temConexao: boolean;
  busy: string | null;
  onSave: (key: string, patch: { id: string; ativo?: boolean; template?: string; offset_dias?: number }, ok: string) => void;
  onRun: () => void;
};

export function AutomacoesTab({ automacoes, temConexao, busy, onSave, onRun }: Props) {
  const fetchOverview = useServerFn(getAdminOverviewData);
  const [matches, setMatches] = useState<Record<string, number>>({});

  useEffect(() => {
    void fetchOverview()
      .then((r) => setMatches((r.matches ?? {}) as Record<string, number>))
      .catch(() => setMatches({}));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 font-medium">
            <Zap className="h-4 w-4" /> Réguas automáticas
          </div>
          <Button variant="outline" size="sm" disabled={busy === "run" || !temConexao} onClick={onRun}>
            {busy === "run" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Rodar agora
          </Button>
        </div>

        {!temConexao && (
          <p className="text-xs text-amber-600">
            Sem número conectado no espaço interno as réguas não enviam nada.
          </p>
        )}

        <div className="space-y-3">
          {automacoes.map((a) => (
            <div key={a.id} className="rounded-lg border border-[color:var(--hairline)] p-3 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-sm flex items-center gap-2">
                    {a.nome}
                    <Badge variant="outline">{matches[a.trigger_key] ?? 0} hoje</Badge>
                  </p>
                  <p className="text-xs text-muted-foreground">{a.descricao}</p>
                </div>
                <Switch
                  checked={a.ativo}
                  onCheckedChange={(v) =>
                    onSave(`a-${a.id}`, { id: a.id, ativo: v }, v ? "Ativada" : "Desativada")
                  }
                />
              </div>
              <Textarea
                defaultValue={a.template}
                rows={2}
                className="text-sm"
                onBlur={(e) => {
                  if (e.target.value !== a.template)
                    onSave(`t-${a.id}`, { id: a.id, template: e.target.value }, "Mensagem salva");
                }}
              />
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground">Dias</Label>
                <Input
                  type="number"
                  className="h-8 w-20"
                  defaultValue={a.offset_dias}
                  onBlur={(e) => {
                    const v = Number(e.target.value);
                    if (v !== a.offset_dias) onSave(`d-${a.id}`, { id: a.id, offset_dias: v }, "Salvo");
                  }}
                />
                <span className="text-xs text-muted-foreground">
                  variáveis: {"{{nome}}"} {"{{plano}}"} {"{{dias}}"}
                </span>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <SignupWelcomeCard />
    </div>
  );
}
