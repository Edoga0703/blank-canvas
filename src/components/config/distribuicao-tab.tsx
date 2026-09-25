import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Loader2,
  ListOrdered,
  MessageSquare,
  UserCheck,
  UserX,
  ArrowUp,
  ArrowDown,
  Trash2,
  Pause,
  Play,
} from "lucide-react";
import { toast } from "sonner";
import {
  getDefaultQueue,
  updateMemberStatus,
  updateQueueOrder,
  removeMemberFromQueue,
} from "@/lib/distribution.functions";

export function DistribuicaoTab() {
  const fetchQueue = useServerFn(getDefaultQueue);
  const setStatus = useServerFn(updateMemberStatus);
  const setOrder = useServerFn(updateQueueOrder);
  const removeMember = useServerFn(removeMemberFromQueue);

  const [queue, setQueue] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const reload = async () => {
    setLoading(true);
    try {
      const data = await fetchQueue();
      setQueue(data);
    } catch (e: any) {
      toast.error("Erro ao carregar fila: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
  }, []);

  const moveMember = async (index: number, direction: "up" | "down") => {
    if (!queue) return;
    const newMembers = [...queue.members];
    const targetIndex = direction === "up" ? index - 1 : index + 1;

    if (targetIndex < 0 || targetIndex >= newMembers.length) return;

    // Swap items
    [newMembers[index], newMembers[targetIndex]] = [newMembers[targetIndex], newMembers[index]];

    // Update local state
    const updatedMembers = newMembers.map((m: any, idx) => ({ ...m, ordem: idx }));
    setQueue({ ...queue, members: updatedMembers });

    try {
      await setOrder({
        data: {
          queueId: queue.id,
          memberOrders: updatedMembers.map((m) => ({ memberId: m.id, ordem: m.ordem })),
        },
      });
    } catch (e: any) {
      toast.error("Erro ao salvar ordem: " + e.message);
      reload();
    }
  };

  const handleToggle = async (memberId: string, currentStatus: boolean) => {
    try {
      await setStatus({ data: { memberId, ativo: !currentStatus } });
      setQueue({
        ...queue,
        members: queue.members.map((m: any) =>
          m.id === memberId ? { ...m, ativo: !currentStatus } : m
        ),
      });
      toast.success(currentStatus ? "Distribuição pausada" : "Distribuição ativada");
    } catch (e: any) {
      toast.error("Erro ao alterar status: " + e.message);
    }
  };

  const handleRemove = async (memberId: string) => {
    if (!confirm("Tem certeza que deseja remover este membro da fila?")) return;
    try {
      await removeMember({ data: { memberId } });
      setQueue({
        ...queue,
        members: queue.members.filter((m: any) => m.id !== memberId),
      });
      toast.success("Membro removido da fila");
    } catch (e: any) {
      toast.error("Erro ao remover membro: " + e.message);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-20 gap-4">
        <Loader2 className="size-10 animate-spin text-primary opacity-50" />
        <p className="text-sm text-muted-foreground animate-pulse">Carregando fila única...</p>
      </div>
    );
  }

  if (!queue) {
    return (
      <Card className="p-16 text-center border-dashed bg-muted/10 flex flex-col items-center gap-6 rounded-2xl">
        <div className="size-20 rounded-full bg-primary/5 flex items-center justify-center">
          <ListOrdered className="size-10 text-primary/40" />
        </div>
        <div className="max-w-md space-y-2">
          <h3 className="text-lg font-semibold text-foreground">Fila não inicializada</h3>
          <p className="text-sm text-muted-foreground">
            Aguarde um momento enquanto o sistema configura sua fila única de distribuição.
          </p>
        </div>
        <Button onClick={reload} variant="outline" className="rounded-xl px-8">
          Tentar Novamente
        </Button>
      </Card>
    );
  }

  return (
    <div className="flex justify-center w-full">
      <div className="space-y-6 w-full max-w-4xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-muted/30 p-4 rounded-xl border border-border/50">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-foreground">Distribuição de Equipe</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Defina a ordem de prioridade e quem está disponível para receber novos leads.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="secondary" className="bg-primary/5 text-primary border-none font-bold px-3 py-1">
              MODO: {queue.strategy === "round_robin" ? "RODÍZIO (ROUND ROBIN)" : "SEQUENCIAL"}
            </Badge>
          </div>
        </div>

        <div className="space-y-3">
          {queue.members.map((m: any, idx: number) => {
            const online =
              m.profile?.last_seen_at &&
              Date.now() - new Date(m.profile.last_seen_at).getTime() < 5 * 60 * 1000;
            const isFirst = idx === 0;
            const isLast = idx === queue.members.length - 1;

            return (
              <Card
                key={m.id}
                className="p-4 relative group overflow-hidden transition-all duration-200 rounded-xl border border-border/50 shadow-sm bg-card hover:bg-muted/50"
              >
                <div className="flex items-center gap-4">
                  <div className="relative shrink-0">
                    <Avatar className="size-12 border-2 border-background shadow-md">
                      <AvatarImage src={m.profile?.avatar_url} />
                      <AvatarFallback className="font-bold bg-primary/10 text-primary">
                        {m.profile?.nome?.charAt(0) || "?"}
                      </AvatarFallback>
                    </Avatar>
                    <span
                      className={`absolute -bottom-0.5 -right-0.5 size-3.5 rounded-full ring-2 ring-background shadow-sm ${
                        online ? "bg-emerald-500" : "bg-slate-300"
                      }`}
                      title={online ? "Online" : "Offline"}
                    />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-base truncate text-foreground">
                        {m.profile?.nome || "Usuário"}
                      </h3>
                      <span className="text-[10px] font-bold font-mono text-primary bg-primary/5 px-2 py-0.5 rounded-full border border-primary/10 whitespace-nowrap">
                        ORDEM {idx + 1}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      <MessageSquare className="size-3" />
                      {m.leads_count || 0} leads atendidos
                    </p>
                  </div>

                  <div className="flex items-center gap-4 shrink-0 ml-4">
                    <div className="flex items-center gap-1">
                      {!isFirst && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 rounded-lg hover:bg-primary/10 hover:text-primary transition-colors"
                          onClick={() => moveMember(idx, "up")}
                        >
                          <ArrowUp className="size-4" />
                        </Button>
                      )}
                      {!isLast && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 rounded-lg hover:bg-primary/10 hover:text-primary transition-colors"
                          onClick={() => moveMember(idx, "down")}
                        >
                          <ArrowDown className="size-4" />
                        </Button>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 rounded-lg hover:bg-amber-500/10 hover:text-amber-500 transition-colors"
                        onClick={() => handleToggle(m.id, m.ativo)}
                        title={m.ativo ? "Pausar" : "Ativar"}
                      >
                        {m.ativo ? <Pause className="size-4" /> : <Play className="size-4" />}
                      </Button>
                      
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 rounded-lg hover:bg-destructive/10 hover:text-destructive transition-colors"
                        onClick={() => handleRemove(m.id)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>

                    <div className="hidden xs:flex items-center gap-2 ml-2">
                      <Switch
                        checked={m.ativo}
                        onCheckedChange={() => handleToggle(m.id, m.ativo)}
                        className="data-[state=checked]:bg-emerald-500"
                      />
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

        {queue.members.length === 0 && (
          <div className="p-12 text-center text-sm text-muted-foreground bg-muted/10 border border-dashed rounded-2xl italic">
            Nenhum usuário disponível para distribuição nesta empresa.
          </div>
        )}
      </div>
    </div>
  );
}
