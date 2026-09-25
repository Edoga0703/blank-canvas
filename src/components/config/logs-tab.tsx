import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, LogIn } from "lucide-react";
import { toast } from "sonner";
import { listAuthLogs } from "@/lib/team.functions";

type Row = {
  id: string;
  user_id: string;
  ip: string | null;
  user_agent: string | null;
  event: string;
  created_at: string;
  nome: string | null;
  email: string | null;
};

function formatDate(iso: string) {
  try { return new Date(iso).toLocaleString("pt-BR"); } catch { return iso; }
}
function shortUA(ua: string | null) {
  if (!ua) return "—";
  const m = ua.match(/(Chrome|Firefox|Safari|Edge|Opera)\/[\d.]+/);
  const os = ua.match(/(Windows|Mac OS|Linux|Android|iPhone|iPad)/);
  return [os?.[1], m?.[1]].filter(Boolean).join(" · ") || ua.slice(0, 40);
}

export function LogsTab() {
  const load = useServerFn(listAuthLogs);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  async function reload() {
    setLoading(true);
    try { setRows((await load({ data: { limit: 300 } })) as any); }
    catch (e: any) { toast.error(e?.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { void reload(); }, []);

  const filtered = rows.filter((r) => {
    if (!q) return true;
    const s = q.toLowerCase();
    return (r.nome || "").toLowerCase().includes(s)
      || (r.email || "").toLowerCase().includes(s)
      || (r.ip || "").toLowerCase().includes(s);
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold">Logs de acesso</h2>
          <p className="text-sm text-muted-foreground">Histórico de logins dos membros nesta empresa.</p>
        </div>
        <div className="relative">
          <Search className="size-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-8 w-64" placeholder="Buscar por nome, email ou IP" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      {loading ? (
        <div className="p-10 grid place-items-center"><Loader2 className="animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">Nenhum evento de login registrado ainda.</Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-2.5">Usuário</th>
                  <th className="text-left px-4 py-2.5">Evento</th>
                  <th className="text-left px-4 py-2.5">IP</th>
                  <th className="text-left px-4 py-2.5">Dispositivo</th>
                  <th className="text-left px-4 py-2.5">Data</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-t border-border hover:bg-muted/30">
                    <td className="px-4 py-2.5">
                      <div className="font-medium">{r.nome || "—"}</div>
                      <div className="text-xs text-muted-foreground">{r.email}</div>
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge variant="outline" className="gap-1"><LogIn className="size-3" /> {r.event}</Badge>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs">{r.ip || "—"}</td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{shortUA(r.user_agent)}</td>
                    <td className="px-4 py-2.5 text-xs">{formatDate(r.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
