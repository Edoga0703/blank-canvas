import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Bell, Trash2, Send, Loader2 } from "lucide-react";
import {
  listBroadcasts, createBroadcast, deleteBroadcast,
} from "@/lib/admin-broadcast.functions";

export const Route = createFileRoute("/master/notificacoes")({
  component: NotificacoesPage,
});

export function NotificacoesPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listBroadcasts);
  const createFn = useServerFn(createBroadcast);
  const deleteFn = useServerFn(deleteBroadcast);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "broadcasts"],
    queryFn: () => listFn(),
  });

  const [titulo, setTitulo] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [link, setLink] = useState("");
  const [targetType, setTargetType] = useState<"all" | "plan" | "status">("all");
  const [targetValue, setTargetValue] = useState<string>("");

  const create = useMutation({
    mutationFn: () => createFn({
      data: {
        titulo, mensagem,
        link: link || null,
        target_type: targetType,
        target_value: targetType === "all" ? null : targetValue,
      },
    }),
    onSuccess: () => {
      toast.success("Notificação enviada");
      setTitulo(""); setMensagem(""); setLink(""); setTargetValue("");
      qc.invalidateQueries({ queryKey: ["admin", "broadcasts"] });
    },
    onError: (e: any) => toast.error(e.message || "Falha ao enviar"),
  });

  const del = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Removida");
      qc.invalidateQueries({ queryKey: ["admin", "broadcasts"] });
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Bell className="size-5" /> Notificações
        </h1>
        <p className="text-sm text-muted-foreground">Envie avisos in-app para os assinantes.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        {/* Form */}
        <Card className="p-5 space-y-4">
          <div className="text-sm font-semibold">Nova notificação</div>
          <div className="space-y-2">
            <Label>Título</Label>
            <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={120} />
          </div>
          <div className="space-y-2">
            <Label>Mensagem</Label>
            <Textarea value={mensagem} onChange={(e) => setMensagem(e.target.value)} rows={4} maxLength={2000} />
          </div>
          <div className="space-y-2">
            <Label>Link (opcional)</Label>
            <Input placeholder="https://..." value={link} onChange={(e) => setLink(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Público-alvo</Label>
              <Select value={targetType} onValueChange={(v: any) => { setTargetType(v); setTargetValue(""); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="plan">Por plano (slug)</SelectItem>
                  <SelectItem value="status">Por status</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {targetType !== "all" && (
              <div className="space-y-2">
                <Label>{targetType === "plan" ? "Slug do plano" : "Status"}</Label>
                {targetType === "status" ? (
                  <Select value={targetValue} onValueChange={setTargetValue}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="trial">trial</SelectItem>
                      <SelectItem value="ativo">ativo</SelectItem>
                      <SelectItem value="suspenso">suspenso</SelectItem>
                      <SelectItem value="pendente">pendente</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <Input placeholder="ex: metrix-pro" value={targetValue} onChange={(e) => setTargetValue(e.target.value)} />
                )}
              </div>
            )}
          </div>

          {/* Preview */}
          <div className="rounded-lg border border-[color:var(--hairline)] p-3 bg-[color:var(--panel-2)]">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Prévia</div>
            <div className="text-sm font-semibold">{titulo || "Título da notificação"}</div>
            <div className="text-sm text-muted-foreground whitespace-pre-wrap">
              {mensagem || "Mensagem exibida ao usuário…"}
            </div>
            {link && <div className="text-xs text-[color:var(--brand-text)] mt-1 truncate">{link}</div>}
          </div>

          <Button
            onClick={() => create.mutate()}
            disabled={create.isPending || !titulo.trim() || !mensagem.trim()}
            className="w-full"
          >
            {create.isPending ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Send className="size-4 mr-2" />}
            Enviar
          </Button>
        </Card>

        {/* Histórico */}
        <Card className="p-5">
          <div className="text-sm font-semibold mb-3">Histórico</div>
          {isLoading ? (
            <div className="py-8 grid place-items-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
          ) : (data?.rows ?? []).length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">Nenhuma notificação enviada ainda.</div>
          ) : (
            <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
              {(data?.rows ?? []).map((b: any) => (
                <div key={b.id} className="rounded-lg border border-[color:var(--hairline)] p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold truncate">{b.titulo}</div>
                      <div className="text-xs text-muted-foreground whitespace-pre-wrap line-clamp-3">{b.mensagem}</div>
                    </div>
                    <button
                      onClick={() => del.mutate(b.id)}
                      className="text-muted-foreground hover:text-destructive p-1"
                      title="Remover"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                  <div className="flex items-center gap-2 mt-2 text-[11px]">
                    <Badge variant="secondary">
                      {b.target_type === "all" ? "Todos" : `${b.target_type}: ${b.target_value}`}
                    </Badge>
                    <span className="text-muted-foreground">
                      {new Date(b.created_at).toLocaleString("pt-BR")}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
