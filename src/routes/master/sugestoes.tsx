import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Inbox, Loader2, Archive, Reply, Link2 } from "lucide-react";
import {
  listFeedback, replyFeedback, setFeedbackStatus,
} from "@/lib/admin-broadcast.functions";

export const Route = createFileRoute("/master/sugestoes")({
  component: SugestoesPage,
});

const statusColors: Record<string, string> = {
  aberto: "bg-amber-100 text-amber-800",
  respondido: "bg-emerald-100 text-emerald-800",
  arquivado: "bg-zinc-100 text-zinc-700",
};

export function SugestoesPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listFeedback);
  const replyFn = useServerFn(replyFeedback);
  const statusFn = useServerFn(setFeedbackStatus);

  const [filter, setFilter] = useState<"aberto" | "respondido" | "arquivado" | "todos">("aberto");
  const [selected, setSelected] = useState<any | null>(null);
  const [reply, setReply] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "feedback", filter],
    queryFn: () => listFn({ data: { status: filter } }),
  });

  const replyMut = useMutation({
    mutationFn: () => replyFn({ data: { id: selected.id, reply } }),
    onSuccess: () => {
      toast.success("Resposta enviada");
      setSelected(null); setReply("");
      qc.invalidateQueries({ queryKey: ["admin", "feedback"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const statusMut = useMutation({
    mutationFn: (p: { id: string; status: "aberto" | "respondido" | "arquivado" }) =>
      statusFn({ data: p }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "feedback"] });
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Inbox className="size-5" /> Sugestões
          </h1>
          <p className="text-sm text-muted-foreground">Feedback enviado pelos clientes.</p>
        </div>
        <Select value={filter} onValueChange={(v: any) => setFilter(v)}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="aberto">Abertos</SelectItem>
            <SelectItem value="respondido">Respondidos</SelectItem>
            <SelectItem value="arquivado">Arquivados</SelectItem>
            <SelectItem value="todos">Todos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="py-16 grid place-items-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
      ) : (data?.rows ?? []).length === 0 ? (
        <Card className="p-12 text-center text-muted-foreground">Nenhum feedback nesta caixa.</Card>
      ) : (
        <div className="space-y-3">
          {(data?.rows ?? []).map((f: any) => (
            <Card key={f.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-semibold">
                      {f.profile?.nome || f.profile?.email || "Usuário"}
                    </span>
                    {f.company && <span className="text-xs text-muted-foreground">· {f.company.nome}</span>}
                    <Badge variant="secondary" className="text-[10px]">{f.category}</Badge>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${statusColors[f.status]}`}>{f.status}</span>
                  </div>
                  {f.title && <div className="text-sm font-medium mb-1">{f.title}</div>}
                  <div className="text-sm whitespace-pre-wrap">{f.message}</div>
                  {f.link && (
                    <a href={f.link} target="_blank" rel="noreferrer"
                      className="text-xs mt-1.5 inline-flex items-center gap-1 text-[color:var(--brand)] hover:underline break-all">
                      <Link2 className="size-3" /> {f.link}
                    </a>
                  )}
                  {Array.isArray(f.attachments) && f.attachments.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {f.attachments.map((a: any, i: number) => (
                        <a key={i} href={a.url} target="_blank" rel="noreferrer"
                          className="block w-16 h-16 rounded border border-border overflow-hidden bg-muted">
                          <img src={a.url} alt={a.name} className="w-full h-full object-cover" />
                        </a>
                      ))}
                    </div>
                  )}
                  {f.admin_reply && (
                    <div className="mt-2 pl-3 border-l-2 border-[color:var(--brand)] text-sm text-muted-foreground whitespace-pre-wrap">
                      <span className="font-medium text-foreground">Resposta:</span> {f.admin_reply}
                    </div>
                  )}
                  <div className="text-[11px] text-muted-foreground mt-2">
                    {new Date(f.created_at).toLocaleString("pt-BR")}
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button size="sm" variant="outline" onClick={() => { setSelected(f); setReply(f.admin_reply || ""); }}>
                    <Reply className="size-3.5 mr-1" /> Responder
                  </Button>
                  {f.status !== "arquivado" && (
                    <Button
                      size="sm" variant="ghost"
                      onClick={() => statusMut.mutate({ id: f.id, status: "arquivado" })}
                    >
                      <Archive className="size-3.5 mr-1" /> Arquivar
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Responder feedback</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-3">
              <div className="rounded-lg bg-[color:var(--panel-2)] p-3 text-sm whitespace-pre-wrap">
                {selected.message}
              </div>
              <Textarea rows={5} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Sua resposta…" />
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSelected(null)}>Cancelar</Button>
            <Button onClick={() => replyMut.mutate()} disabled={replyMut.isPending || reply.trim().length < 2}>
              {replyMut.isPending && <Loader2 className="size-4 mr-2 animate-spin" />}
              Enviar resposta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
