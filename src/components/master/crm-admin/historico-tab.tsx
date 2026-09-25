import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { listAdminLogRows } from "@/lib/admin-crm.functions";

type LogRow = {
  id: string;
  trigger_key: string;
  numero: string | null;
  status: string;
  erro: string | null;
  mensagem: string | null;
  enviado_em: string;
};

const TIPOS = [
  { id: "todos", label: "Tudo" },
  { id: "automacao", label: "Automações" },
  { id: "disparo", label: "Disparos" },
];
const STATUS = [
  { id: "todos", label: "Todos" },
  { id: "enviado", label: "Enviados" },
  { id: "erro", label: "Com erro" },
];
const PERIODOS = [
  { id: 7, label: "7 dias" },
  { id: 30, label: "30 dias" },
  { id: 90, label: "90 dias" },
];

export function HistoricoTab() {
  const listar = useServerFn(listAdminLogRows);
  const [tipo, setTipo] = useState("todos");
  const [status, setStatus] = useState("todos");
  const [dias, setDias] = useState(30);
  const [rows, setRows] = useState<LogRow[] | null>(null);

  useEffect(() => {
    setRows(null);
    void listar({ data: { tipo, status, dias } })
      .then((r) => setRows(r as LogRow[]))
      .catch(() => setRows([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipo, status, dias]);

  const chip = (active: boolean) =>
    `px-3 py-1.5 rounded-full text-xs border transition-colors ${
      active ? "text-white" : "text-muted-foreground border-[color:var(--hairline)]"
    }`;
  const chipStyle = (active: boolean) =>
    active ? { background: "var(--brand)", borderColor: "var(--brand)" } : undefined;

  return (
    <Card className="p-4 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {TIPOS.map((t) => (
          <button key={t.id} onClick={() => setTipo(t.id)} className={chip(tipo === t.id)} style={chipStyle(tipo === t.id)}>
            {t.label}
          </button>
        ))}
        <span className="w-px h-5 bg-[color:var(--hairline)] mx-1" />
        {STATUS.map((s) => (
          <button key={s.id} onClick={() => setStatus(s.id)} className={chip(status === s.id)} style={chipStyle(status === s.id)}>
            {s.label}
          </button>
        ))}
        <span className="w-px h-5 bg-[color:var(--hairline)] mx-1" />
        {PERIODOS.map((p) => (
          <button key={p.id} onClick={() => setDias(p.id)} className={chip(dias === p.id)} style={chipStyle(dias === p.id)}>
            {p.label}
          </button>
        ))}
      </div>

      {rows === null ? (
        <div className="py-10 grid place-items-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">Nenhum envio neste filtro.</p>
      ) : (
        <div className="divide-y rounded-md border border-[color:var(--hairline)]">
          {rows.map((l) => (
            <div key={l.id} className="p-3 flex flex-wrap items-center gap-3 text-sm">
              <div className="min-w-0 flex-1">
                <p className="font-medium truncate">
                  {l.trigger_key.startsWith("disparo:")
                    ? `Disparo · ${l.trigger_key.split(":")[1]}`
                    : l.trigger_key}
                  {l.numero ? ` · ${l.numero}` : ""}
                </p>
                <p className="text-xs text-muted-foreground truncate">{l.erro ?? l.mensagem ?? "—"}</p>
              </div>
              <Badge variant={l.status === "enviado" ? "secondary" : "destructive"}>{l.status}</Badge>
              <span className="text-xs text-muted-foreground">
                {new Date(l.enviado_em).toLocaleString("pt-BR")}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
