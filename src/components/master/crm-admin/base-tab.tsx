import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, MessageCircle, RefreshCw } from "lucide-react";
import {
  listAdminBaseRows,
  syncAdminContactsNow,
  type AdminBaseRow,
  type AdminCrmStatus,
} from "@/lib/admin-crm.functions";

const FILTROS = [
  { id: "todos", label: "Todos" },
  { id: "trial", label: "Em teste" },
  { id: "ativos", label: "Ativos" },
  { id: "inadimplentes", label: "Inadimplentes" },
  { id: "inativos", label: "Inativos" },
];

export function BaseTab({ workspace }: { workspace: AdminCrmStatus["workspace"] }) {
  const listar = useServerFn(listAdminBaseRows);
  const sync = useServerFn(syncAdminContactsNow);

  const [filtro, setFiltro] = useState("todos");
  const [busca, setBusca] = useState("");
  const [rows, setRows] = useState<AdminBaseRow[] | null>(null);
  const [syncing, setSyncing] = useState(false);

  const load = async (f = filtro, b = busca) => {
    setRows(null);
    try {
      setRows(await listar({ data: { filtro: f, busca: b } }));
    } catch (e) {
      toast.error((e as Error).message);
      setRows([]);
    }
  };

  useEffect(() => {
    void load(filtro, busca);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtro]);

  function abrirConversa(telefone: string | null) {
    if (!workspace || !telefone) return;
    try {
      sessionStorage.setItem("master_impersonate_company", workspace.id);
    } catch {
      /* ignore */
    }
    window.location.href = `/app/conversas?numero=${encodeURIComponent(telefone)}`;
  }

  return (
    <Card className="p-4 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {FILTROS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFiltro(f.id)}
            className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${
              filtro === f.id ? "text-white" : "text-muted-foreground border-[color:var(--hairline)]"
            }`}
            style={filtro === f.id ? { background: "var(--brand)", borderColor: "var(--brand)" } : undefined}
          >
            {f.label}
          </button>
        ))}
        <div className="flex-1 min-w-[180px]" />
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void load()}
          placeholder="Buscar cliente…"
          className="h-9 w-56"
        />
        <Button
          variant="ghost"
          size="sm"
          disabled={syncing}
          onClick={async () => {
            setSyncing(true);
            try {
              await sync();
              toast.success("Base sincronizada com o CRM");
              await load();
            } catch (e) {
              toast.error((e as Error).message);
            } finally {
              setSyncing(false);
            }
          }}
        >
          {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Sincronizar
        </Button>
      </div>

      {rows === null ? (
        <div className="py-10 grid place-items-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">Nenhum cliente neste filtro.</p>
      ) : (
        <div className="divide-y rounded-md border border-[color:var(--hairline)]">
          {rows.map((r) => (
            <div key={r.id} className="p-3 flex flex-wrap items-center gap-3 text-sm">
              <div className="min-w-0 flex-1">
                <p className="font-medium truncate">{r.nome}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {r.telefone ?? "sem telefone"}
                  {r.plano ? ` · ${r.plano}` : ""}
                  {r.ultimo_acesso
                    ? ` · último acesso ${new Date(r.ultimo_acesso).toLocaleDateString("pt-BR")}`
                    : " · sem acesso registrado"}
                </p>
              </div>
              <Badge variant={r.status === "ativo" ? "secondary" : "outline"}>{r.status}</Badge>
              <Button
                variant="outline"
                size="sm"
                disabled={!r.telefone}
                onClick={() => abrirConversa(r.telefone)}
              >
                <MessageCircle className="h-4 w-4" /> Conversa
              </Button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
