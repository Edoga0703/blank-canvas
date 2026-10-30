// src/routes/app/automacoes.index.tsx
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  listWorkflowsFn,
  createWorkflowFn,
  toggleWorkflowStatusFn,
  deleteWorkflowFn,
} from "@/lib/automations/functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import {
  Workflow,
  Plus,
  Play,
  Pause,
  Trash2,
  MoreVertical,
  Loader2,
  Clock,
  Sparkles,
  ArrowRight,
  GitBranch,
  Layers,
  Zap,
} from "lucide-react";

export const Route = createFileRoute("/app/automacoes/")({
  component: AutomacoesPage,
});

export function AutomacoesPage() {
  const navigate = useNavigate();
  const listWorkflows = useServerFn(listWorkflowsFn);
  const createWorkflow = useServerFn(createWorkflowFn);
  const toggleStatus = useServerFn(toggleWorkflowStatusFn);
  const deleteWorkflow = useServerFn(deleteWorkflowFn);

  const [workflows, setWorkflows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [creating, setCreating] = useState(false);

  async function loadData() {
    setLoading(true);
    try {
      const data = await listWorkflows();
      setWorkflows(data || []);
    } catch (e: any) {
      toast.error(e?.message || "Erro ao carregar automações");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleCreate() {
    if (!newTitle.trim()) {
      toast.error("Informe um nome para o fluxo");
      return;
    }
    setCreating(true);
    try {
      const res = await createWorkflow({
        data: { name: newTitle.trim(), description: newDesc.trim() || undefined },
      });
      toast.success("Fluxo criado com sucesso!");
      setCreateDialogOpen(false);
      setNewTitle("");
      setNewDesc("");
      await loadData();
      navigate({
        to: "/app/automacoes/$workflowId",
        params: { workflowId: res.id },
      });
    } catch (e: any) {
      toast.error(e?.message || "Erro ao criar fluxo");
    } finally {
      setCreating(false);
    }
  }

  async function handleToggleStatus(wf: any) {
    const nextStatus = wf.status === "published" ? "draft" : "published";
    try {
      await toggleStatus({
        data: { workflowId: wf.id, status: nextStatus },
      });
      toast.success(
        nextStatus === "published" ? "Fluxo ativado com sucesso" : "Fluxo desativado (em rascunho)"
      );
      loadData();
    } catch (e: any) {
      toast.error(e?.message || "Erro ao alterar status");
    }
  }

  async function handleDelete(wf: any) {
    if (!confirm(`Tem certeza que deseja excluir o fluxo "${wf.name}"?`)) return;
    try {
      await deleteWorkflow({ data: { workflowId: wf.id } });
      toast.success("Fluxo excluído com sucesso");
      loadData();
    } catch (e: any) {
      toast.error(e?.message || "Erro ao excluir fluxo");
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6 max-w-7xl mx-auto w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-[var(--brand)]/10 text-[var(--brand)] rounded-xl">
              <Zap className="size-6" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Automações & Workflows</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Crie salesbots e fluxos visuais automáticos multicanal (WhatsApp, Instagram, Telegram e CRM).
          </p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)} className="gap-2 bg-[var(--brand)] text-white hover:bg-[var(--brand)]/90">
          <Plus className="size-4" /> Novo Fluxo
        </Button>
      </div>

      {/* Lista de Flujos */}
      {loading ? (
        <div className="flex flex-col items-center justify-center p-16 space-y-3">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Carregando automações...</p>
        </div>
      ) : workflows.length === 0 ? (
        <div className="border border-dashed rounded-2xl p-12 text-center space-y-4 bg-muted/20">
          <div className="size-12 rounded-2xl bg-[var(--brand)]/10 text-[var(--brand)] flex items-center justify-center mx-auto">
            <Workflow className="size-6" />
          </div>
          <div className="space-y-1">
            <h3 className="font-semibold text-lg">Nenhum fluxo criado</h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Comece desenhando o primeiro fluxo de atendimento, triagem por IA ou cadência de vendas da sua empresa.
            </p>
          </div>
          <Button onClick={() => setCreateDialogOpen(true)} className="gap-2 bg-[var(--brand)] text-white">
            <Plus className="size-4" /> Criar Primeiro Fluxo
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {workflows.map((wf) => {
            const isPublished = wf.status === "published";
            return (
              <div
                key={wf.id}
                className="group border rounded-2xl p-5 bg-card hover:border-[var(--brand)] transition-all shadow-sm flex flex-col justify-between space-y-4"
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <span
                      className={`text-[11px] font-semibold px-2 py-0.5 rounded-full inline-block ${
                        isPublished
                          ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {isPublished ? "Ativo" : "Rascunho"}
                    </span>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="size-7 text-muted-foreground">
                          <MoreVertical className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleToggleStatus(wf)} className="gap-2">
                          {isPublished ? <Pause className="size-4" /> : <Play className="size-4" />}
                          {isPublished ? "Pausar fluxo" : "Ativar fluxo"}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleDelete(wf)}
                          className="gap-2 text-destructive focus:text-destructive"
                        >
                          <Trash2 className="size-4" /> Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <Link
                    to="/app/automacoes/$workflowId"
                    params={{ workflowId: wf.id }}
                    className="block group-hover:text-[var(--brand)] transition-colors"
                  >
                    <h3 className="font-semibold text-base leading-tight">
                      {wf.name}
                    </h3>
                  </Link>

                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {wf.description || "Sem descrição"}
                  </p>
                </div>

                <div className="pt-3 border-t flex items-center justify-between text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Clock className="size-3.5" />
                    {new Date(wf.created_at).toLocaleDateString()}
                  </span>
                  <Link
                    to="/app/automacoes/$workflowId"
                    params={{ workflowId: wf.id }}
                    className="text-xs font-semibold text-[var(--brand)] flex items-center gap-1 hover:underline ml-auto"
                  >
                    Editar no Canvas <ArrowRight className="size-3.5" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Novo Fluxo */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Novo Fluxo de Automação</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="wf-name">Nome do Fluxo *</Label>
              <Input
                id="wf-name"
                placeholder="Ex: Qualificação de Leads de Anúncios"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wf-desc">Descrição (opcional)</Label>
              <Textarea
                id="wf-desc"
                placeholder="Descreva o objetivo desta sequência automática..."
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)} disabled={creating}>
              Cancelar
            </Button>
            <Button onClick={handleCreate} disabled={creating} className="bg-[var(--brand)] text-white">
              {creating ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
              Criar e Abrir Canvas
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
