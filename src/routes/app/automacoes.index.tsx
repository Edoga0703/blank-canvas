// src/routes/app/automacoes.index.tsx
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  listWorkflowsFn,
  getWorkflowFn,
  createWorkflowFn,
  publishWorkflowFn,
  saveWorkflowDraftFn,
  toggleWorkflowStatusFn,
  deleteWorkflowFn,
  duplicateWorkflowFn,
  getAvailableChannelsAndConnectionsFn,
  listMetaPostsForInstanceFn,
  uploadAutomationMediaFn,
} from "@/lib/automations/functions";
import { useLanguage } from "@/lib/i18n/context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
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
  Copy,
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
  MessageSquare,
  MessageSquareQuote,
  Send,
  UserPlus,
  Bot,
  Tag,
  AlertTriangle,
  CheckCircle2,
  Check,
  X,
  ExternalLink,
  Image,
  ListChecks,
  FormInput,
  FileCheck2,
  Upload,
  UserCheck,
} from "lucide-react";

export const Route = createFileRoute("/app/automacoes/")({
  component: AutomacoesPage,
});

export function AutomacoesPage() {
  const navigate = useNavigate();
  const { t } = useLanguage();

  const listWorkflows = useServerFn(listWorkflowsFn);
  const getWorkflow = useServerFn(getWorkflowFn);
  const createWorkflow = useServerFn(createWorkflowFn);
  const toggleStatus = useServerFn(toggleWorkflowStatusFn);
  const deleteWorkflow = useServerFn(deleteWorkflowFn);
  const duplicateWorkflow = useServerFn(duplicateWorkflowFn);
  const getConnections = useServerFn(getAvailableChannelsAndConnectionsFn);

  const [workflows, setWorkflows] = useState<any[]>([]);
  const [connections, setConnections] = useState<{
    instances: any[];
    stages: any[];
    pipelines: any[];
    owners: any[];
  }>({
    instances: [],
    stages: [],
    pipelines: [],
    owners: [],
  });

  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [creating, setCreating] = useState(false);

  // Quick Rules Modal State
  const [quickRuleOpen, setQuickRuleOpen] = useState(false);
  const [editingWorkflow, setEditingWorkflow] = useState<any | null>(null);
  const [lockedModalOpen, setLockedModalOpen] = useState(false);
  const [lockedWorkflowId, setLockedWorkflowId] = useState<string | null>(null);

  // Template Modal State
  const [selectedTemplate, setSelectedTemplate] = useState<any | null>(null);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);

  async function loadData() {
    setLoading(true);
    try {
      const [wfData, connData] = await Promise.all([
        listWorkflows(),
        getConnections().catch(() => ({ instances: [], stages: [], pipelines: [], owners: [] })),
      ]);
      setWorkflows(wfData || []);
      if (connData) {
        setConnections(connData);
      }
    } catch (e: any) {
      toast.error(e?.message || t("automations.loading_error", undefined, "Erro ao carregar automações"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleCreateManual() {
    if (!newTitle.trim()) {
      toast.error(t("automations.name_required", undefined, "Informe um nome para o fluxo"));
      return;
    }
    setCreating(true);
    try {
      const res = await createWorkflow({
        data: {
          name: newTitle.trim(),
          description: newDesc.trim() || undefined,
          ui_mode: "canvas",
        },
      });
      toast.success(t("automations.create_success", undefined, "Fluxo criado com sucesso!"));
      setCreateDialogOpen(false);
      setNewTitle("");
      setNewDesc("");
      await loadData();
      navigate({
        to: "/app/automacoes/$workflowId",
        params: { workflowId: res.id },
      });
    } catch (e: any) {
      toast.error(e?.message || t("automations.create_error", undefined, "Erro ao criar fluxo"));
    } finally {
      setCreating(false);
    }
  }

  async function handleToggleStatus(wf: any) {
    if (wf.status === "draft" && !wf.active_version_id) {
      toast.info(t("automations.open_to_publish", undefined, "Abra o fluxo no editor e clique em 'Publicar Fluxo' para ativá-lo pela primeira vez."));
      navigate({
        to: "/app/automacoes/$workflowId",
        params: { workflowId: wf.id },
      });
      return;
    }

    const nextStatus = wf.status === "published" ? "paused" : "published";
    try {
      await toggleStatus({
        data: { workflowId: wf.id, status: nextStatus },
      });
      toast.success(
        nextStatus === "published"
          ? t("automations.activated_success", undefined, "Fluxo ativado com sucesso")
          : t("automations.paused_success", undefined, "Fluxo pausado com sucesso")
      );
      loadData();
    } catch (e: any) {
      toast.error(e?.message || t("automations.status_change_error", undefined, "Erro ao alterar status"));
    }
  }

  async function handleDelete(wf: any) {
    if (!confirm(t("automations.confirm_delete", undefined, `Tem certeza que deseja excluir o fluxo "${wf.name}"?`))) return;
    try {
      await deleteWorkflow({ data: { workflowId: wf.id } });
      toast.success(t("automations.delete_success", undefined, "Fluxo excluído com sucesso"));
      loadData();
    } catch (e: any) {
      toast.error(e?.message || t("automations.delete_error", undefined, "Erro ao excluir fluxo"));
    }
  }

  async function handleDuplicate(wf: any) {
    try {
      await duplicateWorkflow({ data: { workflowId: wf.id } });
      toast.success(t("automations.duplicated_success", undefined, "Fluxo duplicado com sucesso!"));
      await loadData();
    } catch (e: any) {
      toast.error(e?.message || "Erro ao duplicar fluxo");
    }
  }

  async function handleOpenEditRule(wf: any) {
    if (wf.ui_mode === "canvas") {
      setLockedWorkflowId(wf.id);
      setLockedModalOpen(true);
      return;
    }
    try {
      const res = await getWorkflow({ data: { workflowId: wf.id } });
      setEditingWorkflow({
        ...wf,
        ...(res?.workflow || {}),
        graph: res?.graph,
        active_version: res?.activeVersion,
      });
      setQuickRuleOpen(true);
    } catch (e: any) {
      toast.error(e?.message || "Erro ao carregar detalhes do fluxo");
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-8 max-w-7xl mx-auto w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-[var(--brand)]/10 text-[var(--brand)] rounded-xl">
              <Zap className="size-6" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">
              {t("automations.title", undefined, "Automações & Workflows")}
            </h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {t("automations.subtitle", undefined, "Crie salesbots e fluxos visuais automáticos multicanal (WhatsApp, Instagram, Telegram e CRM).")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => {
              setEditingWorkflow(null);
              setQuickRuleOpen(true);
            }}
            variant="outline"
            className="gap-2 border-[var(--brand)]/40 text-[var(--brand)] hover:bg-[var(--brand)]/5"
          >
            <Sparkles className="size-4" />
            {t("automations.create_quick_rule", undefined, "Nova Regra Rápida")}
          </Button>
          <Button
            onClick={() => setCreateDialogOpen(true)}
            className="gap-2 bg-[var(--brand)] text-white hover:bg-[var(--brand)]/90"
          >
            <Plus className="size-4" />
            {t("automations.new_flow", undefined, "Novo Fluxo")}
          </Button>
        </div>
      </div>

      {/* Galeria de Modelos Prontos (WorkflowTemplatesGallery) */}
      <WorkflowTemplatesGallery
        connections={connections}
        onSelectTemplate={(tpl) => {
          setSelectedTemplate(tpl);
          setTemplateModalOpen(true);
        }}
      />

      {/* Lista de Flujos */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">
            {t("automations.workflows_list_title", undefined, "Seus Fluxos Ativos e Rascunhos")}
          </h2>
          <span className="text-xs text-muted-foreground">
            {workflows.length} {workflows.length === 1 ? "fluxo" : "fluxos"}
          </span>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center p-16 space-y-3">
            <Loader2 className="size-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {t("automations.loading", undefined, "Carregando automações...")}
            </p>
          </div>
        ) : workflows.length === 0 ? (
          <div className="border border-dashed rounded-2xl p-12 text-center space-y-4 bg-muted/20">
            <div className="size-12 rounded-2xl bg-[var(--brand)]/10 text-[var(--brand)] flex items-center justify-center mx-auto">
              <Workflow className="size-6" />
            </div>
            <div className="space-y-1">
              <h3 className="font-semibold text-lg">
                {t("automations.no_workflows", undefined, "Nenhum fluxo criado")}
              </h3>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                {t("automations.no_workflows_desc", undefined, "Comece desenhando o primeiro fluxo de atendimento, triagem por IA ou cadência de vendas da sua empresa.")}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <Button
                onClick={() => {
                  setEditingWorkflow(null);
                  setQuickRuleOpen(true);
                }}
                variant="outline"
                className="gap-2"
              >
                <Sparkles className="size-4 text-[var(--brand)]" />
                {t("automations.create_quick_rule", undefined, "Criar Regra Rápida")}
              </Button>
              <Button onClick={() => setCreateDialogOpen(true)} className="gap-2 bg-[var(--brand)] text-white">
                <Plus className="size-4" />
                {t("automations.create_first", undefined, "Criar no Canvas")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {workflows.map((wf) => {
              const isPublished = wf.status === "published";
              const isQuickRule = wf.ui_mode === "quick_rule";

              return (
                <div
                  key={wf.id}
                  className="group border rounded-2xl p-5 bg-card hover:border-[var(--brand)] transition-all shadow-sm flex flex-col justify-between space-y-4"
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span
                          className={`text-[11px] font-semibold px-2 py-0.5 rounded-full inline-block ${
                            wf.status === "published"
                              ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"
                              : wf.status === "paused"
                                ? "bg-amber-500/10 text-amber-600 border border-amber-500/20"
                                : "bg-muted text-muted-foreground border"
                          }`}
                        >
                          {wf.status === "published"
                            ? t("automations.status_published", undefined, "Publicado (Ativo)")
                            : wf.status === "paused"
                              ? t("automations.status_paused", undefined, "Pausado")
                              : t("automations.status_draft", undefined, "Rascunho")}
                        </span>

                        {isQuickRule ? (
                          <Badge variant="outline" className="text-[10px] bg-purple-500/10 text-purple-700 border-purple-200">
                            <Sparkles className="size-2.5 mr-1" />
                            {t("automations.quick_rule_badge", undefined, "Regra Rápida")}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] bg-sky-500/10 text-sky-700 border-sky-200">
                            <GitBranch className="size-2.5 mr-1" />
                            {t("automations.canvas_badge", undefined, "Canvas")}
                          </Badge>
                        )}
                      </div>

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="size-7 text-muted-foreground">
                            <MoreVertical className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleToggleStatus(wf)} className="gap-2">
                            {isPublished ? <Pause className="size-4" /> : <Play className="size-4" />}
                            {isPublished
                              ? t("automations.pause", undefined, "Pausar fluxo")
                              : t("automations.activate", undefined, "Ativar fluxo")}
                          </DropdownMenuItem>
                          {isQuickRule && (
                            <DropdownMenuItem onClick={() => handleOpenEditRule(wf)} className="gap-2">
                              <Sparkles className="size-4 text-purple-600" />
                              {t("automations.edit_quick_rule", undefined, "Editar Regra Rápida")}
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={() => handleDuplicate(wf)} className="gap-2">
                            <Copy className="size-4" />
                            {t("automations.duplicate", undefined, "Duplicar")}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleDelete(wf)}
                            className="gap-2 text-destructive focus:text-destructive"
                          >
                            <Trash2 className="size-4" />
                            {t("automations.delete", undefined, "Excluir")}
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
                      {wf.description || t("common.no_description", undefined, "Sem descrição")}
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
                      {t("automations.edit_canvas", undefined, "Editar no Canvas")} <ArrowRight className="size-3.5" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal Bloqueio Regra Rápida -> Canvas */}
      <Dialog open={lockedModalOpen} onOpenChange={setLockedModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="size-10 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center mb-2">
              <AlertTriangle className="size-5" />
            </div>
            <DialogTitle>
              {t("automations.quick_rule_locked_title", undefined, "Fluxo no Modo Canvas Avançado")}
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground pt-1">
              {t(
                "automations.quick_rule_locked_desc",
                undefined,
                "Este fluxo foi personalizado diretamente no editor visual avançado. Para não sobrescrever configurações complexas, edite-o diretamente no Canvas."
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setLockedModalOpen(false)}>
              {t("common.close", undefined, "Fechar")}
            </Button>
            {lockedWorkflowId && (
              <Button
                onClick={() => {
                  setLockedModalOpen(false);
                  navigate({
                    to: "/app/automacoes/$workflowId",
                    params: { workflowId: lockedWorkflowId },
                  });
                }}
                className="bg-[var(--brand)] text-white"
              >
                {t("automations.open_canvas", undefined, "Abrir no Canvas")}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Criação Manual Canvas */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("automations.new_flow", undefined, "Novo Fluxo de Automação")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="wf-name">
                {t("automations.rule_name", undefined, "Nome do Fluxo")} *
              </Label>
              <Input
                id="wf-name"
                placeholder="Ex: Qualificação de Leads de Anúncios"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wf-desc">
                {t("common.description", undefined, "Descrição (opcional)")}
              </Label>
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
              {t("common.cancel", undefined, "Cancelar")}
            </Button>
            <Button onClick={handleCreateManual} disabled={creating} className="bg-[var(--brand)] text-white">
              {creating ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
              {t("automations.create_first", undefined, "Criar e Abrir Canvas")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Assistente de Regras Rápidas (3 passos sem código) */}
      <QuickRulesModal
        open={quickRuleOpen}
        onOpenChange={(isOpen) => {
          setQuickRuleOpen(isOpen);
          if (!isOpen) setEditingWorkflow(null);
        }}
        connections={connections}
        editingWorkflow={editingWorkflow}
        onCreated={async () => {
          await loadData();
        }}
      />

      {/* Modal de Configuração de Plantilla (WorkflowTemplatesGallery) */}
      {selectedTemplate && (
        <TemplateConfigModal
          open={templateModalOpen}
          onOpenChange={setTemplateModalOpen}
          template={selectedTemplate}
          connections={connections}
          onCreated={async (workflowId) => {
            await loadData();
            navigate({
              to: "/app/automacoes/$workflowId",
              params: { workflowId },
            });
          }}
        />
      )}
    </div>
  );
}

// ============================================================================
// WORKFLOW TEMPLATES GALLERY (Modelos Prontos em 1 Clique)
// ============================================================================

interface WorkflowTemplatesGalleryProps {
  connections: { instances: any[]; stages: any[]; pipelines: any[] };
  onSelectTemplate: (tpl: any) => void;
}

function WorkflowTemplatesGallery({ connections, onSelectTemplate }: WorkflowTemplatesGalleryProps) {
  const { t } = useLanguage();

  const templates = [
    {
      id: "comment_to_dm",
      title: t("automations.tpl_comment_to_dm_title", undefined, "Comment-to-DM Instagram/Facebook"),
      description: t(
        "automations.tpl_comment_to_dm_desc",
        undefined,
        "Converta comentários em vendas: envie DM privado instantâneo e responda publicamente com retardo humano."
      ),
      icon: MessageSquareQuote,
      channelRequired: "meta",
      channelLabel: "Instagram & Facebook",
      color: "from-fuchsia-500/10 via-pink-500/10 to-rose-500/10 border-pink-200/60 dark:border-pink-900/40",
      badgeColor: "bg-pink-500/10 text-pink-700 dark:text-pink-400 border-pink-200",
      badge: "Alta Conversão",
    },
    {
      id: "keyword_responder",
      title: t("automations.tpl_keyword_title", undefined, "Auto-resposta por Palavra-Chave"),
      description: t(
        "automations.tpl_keyword_desc",
        undefined,
        "Detecte palavras como 'preço', 'catálogo' ou 'info' no WhatsApp/Direct e envie resposta imediata."
      ),
      icon: MessageSquare,
      channelRequired: "whatsapp_or_meta",
      channelLabel: "WhatsApp & Instagram",
      color: "from-emerald-500/10 via-teal-500/10 to-cyan-500/10 border-emerald-200/60 dark:border-emerald-900/40",
      badgeColor: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200",
      badge: "Inbound 24/7",
    },
    {
      id: "welcome_triage",
      title: t("automations.tpl_welcome_title", undefined, "Boas-vindas e Triagem de Leads"),
      description: t(
        "automations.tpl_welcome_desc",
        undefined,
        "Receba novos contatos cordialmente, cadastre no CRM e transfira o atendimento ao Agente de IA."
      ),
      icon: Bot,
      channelRequired: "any",
      channelLabel: "Todos os Canais",
      color: "from-blue-500/10 via-indigo-500/10 to-violet-500/10 border-blue-200/60 dark:border-blue-900/40",
      badgeColor: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-200",
      badge: "Triagem Inteligente",
    },
    {
      id: "followup_24h",
      title: t("automations.tpl_followup_title", undefined, "Follow-up 24h de Propostas"),
      description: t(
        "automations.tpl_followup_desc",
        undefined,
        "Envie um lembrete automático 24h após enviar orçamento para reaquecer negociações frias."
      ),
      icon: Clock,
      channelRequired: "whatsapp_or_meta",
      channelLabel: "CRM & WhatsApp",
      color: "from-amber-500/10 via-orange-500/10 to-amber-600/10 border-amber-200/60 dark:border-amber-900/40",
      badgeColor: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200",
      badge: "Fechamento",
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
        <div>
          <h2 className="text-lg font-semibold tracking-tight flex items-center gap-2">
            <Sparkles className="size-5 text-[var(--brand)]" />
            {t("automations.templates_gallery", undefined, "Modelos Prontos em 1 Clique")}
          </h2>
          <p className="text-xs text-muted-foreground">
            {t("automations.templates_desc", undefined, "Inicie com automações validadas para vendas, resposta a comentários e triagem.")}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {templates.map((tpl) => {
          const Icon = tpl.icon;
          return (
            <div
              key={tpl.id}
              className={`rounded-2xl border p-4 bg-gradient-to-b ${tpl.color} flex flex-col justify-between space-y-4 hover:shadow-md transition-all`}
            >
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="p-2 rounded-xl bg-card shadow-xs">
                    <Icon className="size-5 text-foreground" />
                  </div>
                  <Badge variant="outline" className={`text-[10px] font-semibold ${tpl.badgeColor}`}>
                    {tpl.badge}
                  </Badge>
                </div>

                <div>
                  <h3 className="font-semibold text-sm leading-snug">{tpl.title}</h3>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    {tpl.description}
                  </p>
                </div>
              </div>

              <div className="pt-2 border-t border-border/40 flex items-center justify-between">
                <span className="text-[11px] font-medium text-muted-foreground">
                  {tpl.channelLabel}
                </span>
                <Button
                  size="sm"
                  onClick={() => onSelectTemplate(tpl)}
                  className="h-8 text-xs font-semibold bg-[var(--brand)] text-white hover:bg-[var(--brand)]/90 gap-1.5"
                >
                  {t("automations.use_template", undefined, "Usar")}
                  <ArrowRight className="size-3" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// MODAL DE REGLAS RÁPIDAS (Quick Rules - 3 Passos sem Código)
// Compila a: meta.comment_received -> crm.ensure_lead -> meta.send_private_reply -> meta.reply_comment
// ============================================================================

interface QuickRulesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connections: { instances: any[]; stages: any[]; pipelines: any[] };
  onCreated: (workflowId: string) => Promise<void>;
  editingWorkflow?: any | null;
}

function QuickRulesModal({ open, onOpenChange, connections, onCreated, editingWorkflow }: QuickRulesModalProps) {
  const { t } = useLanguage();
  const createWorkflow = useServerFn(createWorkflowFn);
  const publishWorkflow = useServerFn(publishWorkflowFn);
  const listMetaPosts = useServerFn(listMetaPostsForInstanceFn);
  const uploadMedia = useServerFn(uploadAutomationMediaFn);

  // Modo da Regra Rápida (3 Modos Sprint 2)
  const [ruleMode, setRuleMode] = useState<"comment_to_dm" | "keyword_reply" | "welcome_menu">("comment_to_dm");
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [submitting, setSubmitting] = useState(false);
  const [ruleName, setRuleName] = useState("");

  // Estado para busca visual de posts Meta
  const [loadingMetaPosts, setLoadingMetaPosts] = useState(false);
  const [metaPostsList, setMetaPostsList] = useState<any[]>([]);
  const [uploadingMedia, setUploadingMedia] = useState(false);

  // MODO 1: Comment-to-DM (Meta)
  const [selectedInstanceId, setSelectedInstanceId] = useState("");
  const [postMode, setPostMode] = useState<"all" | "specific">("all");
  const [specificPostId, setSpecificPostId] = useState("");
  const [keywordsInput, setKeywordsInput] = useState("");
  const [ignoreNestedReplies, setIgnoreNestedReplies] = useState(true);
  const [oncePerUserPerPost, setOncePerUserPerPost] = useState(true);
  const [dmText, setDmText] = useState("Olá {{lead_name}}! Aqui está o material que você solicitou no post: https://");
  const [selectedPipelineId, setSelectedPipelineId] = useState("");
  const [selectedStageId, setSelectedStageId] = useState("");
  const [leadTag, setLeadTag] = useState("lead-comentario");
  const [variants, setVariants] = useState<string[]>([
    "Te enviei uma mensagem no direct! Dá uma olhada 🚀",
    "Acabei de te responder por privado! 📩",
    "Prontinho! Dá uma olhada no seu direct ✨",
  ]);
  const [newVariantInput, setNewVariantInput] = useState("");
  const [minJitter, setMinJitter] = useState(5);
  const [maxJitter, setMaxJitter] = useState(25);

  // MODO 2: Palavra-chave no WhatsApp / Direct
  const [kwChannels, setKwChannels] = useState<string[]>(["whatsapp"]);
  const [kwInstanceId, setKwInstanceId] = useState("");
  const [kwKeywords, setKwKeywords] = useState("preco, valor, catalogo, proposta");
  const [kwReplyText, setKwReplyText] = useState("Olá! Seguem os detalhes solicitados:");
  const [kwMediaType, setKwMediaType] = useState<"image" | "document" | "video" | "audio">("image");
  const [kwMediaUrl, setKwMediaUrl] = useState("");
  const [kwTag, setKwTag] = useState("interessado");
  const [kwPipelineId, setKwPipelineId] = useState("");
  const [kwStageId, setKwStageId] = useState("");

  // MODO 3: Menu Interativo de Boas-Vindas
  const [wmChannels, setWmChannels] = useState<string[]>(["whatsapp"]);
  const [wmInstanceId, setWmInstanceId] = useState("");
  const [wmBodyText, setWmBodyText] = useState("Olá! Seja bem-vindo ao nosso atendimento. Como podemos te ajudar hoje?");
  const [wmFooterText, setWmFooterText] = useState("Selecione uma opção digitando o número:");
  const [wmOptions, setWmOptions] = useState<Array<{
    id: string;
    label: string;
    actionType: "text" | "ai" | "human";
    replyText?: string;
  }>>([
    { id: "opt_1", label: "Consultar Preços & Planos", actionType: "text", replyText: "Nossos planos começam a partir de R$ 97/mês com suporte incluso." },
    { id: "opt_2", label: "Falar com Atendente", actionType: "human", replyText: "" },
    { id: "opt_3", label: "Tirar Dúvidas com IA", actionType: "ai", replyText: "" },
  ]);

  // Pre-carregar e detectar modo ao editar
  useEffect(() => {
    if (editingWorkflow && open) {
      setRuleName(editingWorkflow.name || "");
      const activeGraph = editingWorkflow.active_version?.graph || editingWorkflow.graph;
      if (activeGraph?.nodes) {
        if (activeGraph.nodes.some((n: any) => n.type === "meta.comment_received")) {
          // Detectado MODO 1: comment_to_dm
          setRuleMode("comment_to_dm");
          const triggerNode = activeGraph.nodes.find((n: any) => n.type === "meta.comment_received");
          if (triggerNode?.config) {
            const preselectedInstId =
              (Array.isArray(triggerNode.config.instanceIds) && triggerNode.config.instanceIds[0]) ||
              triggerNode.config.instanceId ||
              "";
            if (preselectedInstId) setSelectedInstanceId(preselectedInstId);
            if (triggerNode.config.postId) {
              setPostMode("specific");
              setSpecificPostId(triggerNode.config.postId);
            } else {
              setPostMode("all");
              setSpecificPostId("");
            }
            if (Array.isArray(triggerNode.config.keywords)) {
              setKeywordsInput(triggerNode.config.keywords.join(", "));
            }
            if (typeof triggerNode.config.ignoreNestedReplies === "boolean") {
              setIgnoreNestedReplies(triggerNode.config.ignoreNestedReplies);
            }
            if (typeof triggerNode.config.oncePerUserPerPost === "boolean") {
              setOncePerUserPerPost(triggerNode.config.oncePerUserPerPost);
            }
          }

          const leadNode = activeGraph.nodes.find((n: any) => n.type === "crm.ensure_lead");
          if (leadNode?.config) {
            if (leadNode.config.pipelineId) setSelectedPipelineId(leadNode.config.pipelineId);
            if (leadNode.config.stageId) setSelectedStageId(leadNode.config.stageId);
            if (leadNode.config.tag) setLeadTag(leadNode.config.tag);
          }

          const dmNode = activeGraph.nodes.find((n: any) => n.type === "meta.send_private_reply");
          if (dmNode?.config?.message) {
            setDmText(dmNode.config.message);
          }

          const replyNode = activeGraph.nodes.find((n: any) => n.type === "meta.reply_comment");
          if (replyNode?.config) {
            if (Array.isArray(replyNode.config.variants) && replyNode.config.variants.length > 0) {
              setVariants(replyNode.config.variants);
            } else if (replyNode.config.message) {
              setVariants([replyNode.config.message]);
            }
            if (replyNode.config.minDelaySeconds !== undefined) setMinJitter(replyNode.config.minDelaySeconds);
            if (replyNode.config.maxDelaySeconds !== undefined) setMaxJitter(replyNode.config.maxDelaySeconds);
          }
        } else if (activeGraph.nodes.some((n: any) => n.type === "messaging.send_interactive")) {
          // Detectado MODO 3: welcome_menu
          setRuleMode("welcome_menu");
          const trig = activeGraph.nodes.find((n: any) => n.type === "messaging.inbound_received");
          if (trig?.config) {
            if (trig.config.instanceIds?.[0]) setWmInstanceId(trig.config.instanceIds[0]);
            if (Array.isArray(trig.config.channels)) setWmChannels(trig.config.channels);
          }
          const inter = activeGraph.nodes.find((n: any) => n.type === "messaging.send_interactive");
          if (inter?.config) {
            if (inter.config.bodyText) setWmBodyText(inter.config.bodyText);
            if (inter.config.footerText) setWmFooterText(inter.config.footerText);
            if (Array.isArray(inter.config.options)) {
              const optsWithActions = inter.config.options.map((opt: any) => {
                const edge = (activeGraph.edges || []).find(
                  (e: any) => e.source === inter.id && (e.sourcePort || e.sourceHandle) === opt.id
                );
                const targetNode = edge ? activeGraph.nodes.find((n: any) => n.id === edge.target) : null;
                let actionType: "text" | "ai" | "human" = "text";
                let replyText = "";
                if (targetNode?.type === "messaging.handoff_to_ai") actionType = "ai";
                else if (targetNode?.type === "messaging.route_to_human") actionType = "human";
                else if (targetNode?.type === "messaging.send_text") {
                  actionType = "text";
                  replyText = targetNode.config?.text || "";
                }
                return {
                  id: opt.id,
                  label: opt.label || "Opção",
                  actionType,
                  replyText,
                };
              });
              setWmOptions(optsWithActions);
            }
          }
        } else {
          // Detectado MODO 2: keyword_reply
          setRuleMode("keyword_reply");
          const trig = activeGraph.nodes.find((n: any) => n.type === "messaging.inbound_received");
          if (trig?.config) {
            if (trig.config.instanceIds?.[0]) setKwInstanceId(trig.config.instanceIds[0]);
            if (Array.isArray(trig.config.channels)) setKwChannels(trig.config.channels);
            if (Array.isArray(trig.config.keywords)) setKwKeywords(trig.config.keywords.join(", "));
          }
          const textNode = activeGraph.nodes.find((n: any) => n.type === "messaging.send_text");
          if (textNode?.config?.text) setKwReplyText(textNode.config.text);
          const mediaNode = activeGraph.nodes.find((n: any) => n.type === "messaging.send_media");
          if (mediaNode?.config?.mediaUrl) {
            setKwMediaUrl(mediaNode.config.mediaUrl);
            if (mediaNode.config.mediaType) setKwMediaType(mediaNode.config.mediaType);
          }
          const tagNode = activeGraph.nodes.find((n: any) => n.type === "crm.add_tag");
          if (tagNode?.config?.tag) setKwTag(tagNode.config.tag);
          const stageNode = activeGraph.nodes.find((n: any) => n.type === "crm.move_card_to_stage");
          if (stageNode?.config?.stageId) setKwStageId(stageNode.config.stageId);
        }
      }
    } else if (!editingWorkflow && open) {
      setRuleName("");
      setPostMode("all");
      setSpecificPostId("");
      setKeywordsInput("");
      setIgnoreNestedReplies(true);
      setOncePerUserPerPost(true);
      setDmText("Olá {{lead_name}}! Aqui está o material que você solicitou no post: https://");
      setKwKeywords("preco, valor, catalogo, proposta");
      setKwReplyText("Olá! Seguem os detalhes solicitados:");
      setKwMediaUrl("");
      setStep(1);
    }
  }, [editingWorkflow, open]);

  // Instâncias Meta
  const metaInstances = useMemo(() => {
    return (connections.instances || []).filter((i: any) => {
      const p = String(i.provider || "").toLowerCase();
      const isMeta = p.includes("meta") || p.includes("instagram") || p.includes("messenger");
      const isConnected = !i.status || ["connected", "open", "ativo", "ready"].includes(String(i.status).toLowerCase());
      return isMeta && isConnected;
    });
  }, [connections.instances]);

  // Todas as conexões
  const allInstances = useMemo(() => {
    return (connections.instances || []).filter((i: any) => {
      return !i.status || ["connected", "open", "ativo", "ready"].includes(String(i.status).toLowerCase());
    });
  }, [connections.instances]);

  // Etapas disponíveis
  const availableStages = useMemo(() => {
    const pipeId = ruleMode === "comment_to_dm" ? selectedPipelineId : kwPipelineId;
    if (!pipeId) return connections.stages || [];
    return (connections.stages || []).filter((s: any) => s.pipeline_id === pipeId);
  }, [connections.stages, selectedPipelineId, kwPipelineId, ruleMode]);

  // Defaults iniciais
  useEffect(() => {
    if (metaInstances.length > 0 && !selectedInstanceId) {
      setSelectedInstanceId(metaInstances[0].id);
    }
    if (allInstances.length > 0) {
      if (!kwInstanceId) setKwInstanceId(allInstances[0].id);
      if (!wmInstanceId) setWmInstanceId(allInstances[0].id);
    }
    if (connections.pipelines.length > 0) {
      if (!selectedPipelineId) setSelectedPipelineId(connections.pipelines[0].id);
      if (!kwPipelineId) setKwPipelineId(connections.pipelines[0].id);
    }
  }, [metaInstances, allInstances, connections.pipelines]);

  useEffect(() => {
    if (availableStages.length > 0) {
      if (ruleMode === "comment_to_dm" && !selectedStageId) setSelectedStageId(availableStages[0].id);
      if (ruleMode === "keyword_reply" && !kwStageId) setKwStageId(availableStages[0].id);
    }
  }, [availableStages, ruleMode]);

  function handleAddVariant() {
    if (!newVariantInput.trim()) return;
    setVariants([...variants, newVariantInput.trim()]);
    setNewVariantInput("");
  }

  function handleRemoveVariant(idx: number) {
    if (variants.length <= 1) {
      toast.error("Mantenha ao menos 1 variação de resposta");
      return;
    }
    setVariants(variants.filter((_, i) => i !== idx));
  }

  // Compilação e Publicação
  async function handleCompileAndPublish() {
    if (!ruleName.trim()) {
      toast.error(t("automations.name_required", undefined, "Informe um nome para a regra"));
      setStep(1);
      return;
    }

    setSubmitting(true);
    try {
      let compiledGraph: any;

      if (ruleMode === "comment_to_dm") {
        if (!selectedStageId) {
          toast.error(t("automations.select_stage", undefined, "Selecione uma etapa do CRM"));
          setStep(2);
          setSubmitting(false);
          return;
        }
        if (!dmText.trim()) {
          toast.error("Informe a mensagem do DM privado");
          setStep(2);
          setSubmitting(false);
          return;
        }
        if (variants.length === 0 || !variants.some((v) => v.trim())) {
          toast.error("Informe ao menos uma variação de resposta pública");
          setStep(3);
          setSubmitting(false);
          return;
        }

        const keywords = keywordsInput
          .split(",")
          .map((k) => k.trim())
          .filter(Boolean);

        const selectedInst = (connections.instances || []).find((i: any) => i.id === selectedInstanceId);
        const isInstagram = selectedInst?.provider === "meta_instagram" || selectedInst?.provider === "instagram";
        const isFacebook = selectedInst?.provider === "meta_messenger" || selectedInst?.provider === "facebook";
        const channels = isInstagram ? ["instagram"] : isFacebook ? ["facebook"] : ["instagram", "facebook"];

        compiledGraph = {
          schemaVersion: 1,
          nodes: [
            {
              id: "node_trigger_comment",
              type: "meta.comment_received",
              name: "Comentário no Instagram/Facebook",
              version: 1,
              position: { x: 250, y: 50 },
              config: {
                connectionMode: selectedInstanceId ? "selected" : "any",
                instanceIds: selectedInstanceId ? [selectedInstanceId] : [],
                channels,
                postId: postMode === "specific" ? specificPostId.trim() || undefined : undefined,
                keywords,
                ignoreNestedReplies,
                oncePerUserPerPost,
              },
            },
            {
              id: "node_crm_ensure_lead",
              type: "crm.ensure_lead",
              name: "Garantir Lead no CRM",
              version: 1,
              position: { x: 250, y: 200 },
              config: {
                pipelineId: selectedPipelineId || undefined,
                stageId: selectedStageId || undefined,
                tag: leadTag.trim() || undefined,
              },
            },
            {
              id: "node_meta_send_dm",
              type: "meta.send_private_reply",
              name: "Enviar Resposta Privada (DM Meta)",
              version: 1,
              position: { x: 250, y: 350 },
              config: {
                message: dmText.trim(),
              },
            },
            {
              id: "node_meta_reply_public",
              type: "meta.reply_comment",
              name: "Responder Comentário Público",
              version: 1,
              position: { x: 250, y: 500 },
              config: {
                message: variants[0] || "",
                variants: variants.filter((v) => v.trim()),
                delaySeconds: 0,
                minDelaySeconds: Number(minJitter) || 5,
                maxDelaySeconds: Number(maxJitter) || 25,
              },
            },
          ],
          edges: [
            {
              id: "edge_trigger_to_lead",
              source: "node_trigger_comment",
              sourcePort: "next",
              target: "node_crm_ensure_lead",
              targetPort: "input",
            },
            {
              id: "edge_lead_to_dm",
              source: "node_crm_ensure_lead",
              sourcePort: "next",
              target: "node_meta_send_dm",
              targetPort: "input",
            },
            {
              id: "edge_dm_to_reply",
              source: "node_meta_send_dm",
              sourcePort: "next",
              target: "node_meta_reply_public",
              targetPort: "input",
            },
          ],
          settings: {
            reentry: "allow",
            maxRuntimeSeconds: 86400 * 7,
            maxSteps: 100,
            ui_mode: "quick_rule",
          },
        };
      } else if (ruleMode === "keyword_reply") {
        if (!kwReplyText.trim()) {
          toast.error("Informe a mensagem de resposta.");
          setStep(2);
          setSubmitting(false);
          return;
        }

        const keywords = kwKeywords
          .split(",")
          .map((k) => k.trim())
          .filter(Boolean);

        const nodes: any[] = [
          {
            id: "node_trigger_inbound",
            type: "messaging.inbound_received",
            name: "Mensagem Recebida",
            version: 1,
            position: { x: 250, y: 50 },
            config: {
              channels: kwChannels,
              connectionMode: kwInstanceId ? "selected" : "any",
              instanceIds: kwInstanceId ? [kwInstanceId] : [],
              keywords,
            },
          },
          {
            id: "node_send_text",
            type: "messaging.send_text",
            name: "Enviar Mensagem de Texto",
            version: 1,
            position: { x: 250, y: 200 },
            config: {
              text: kwReplyText.trim(),
              connectionPolicy: "same_as_trigger",
            },
          },
        ];

        const edges: any[] = [
          {
            id: "edge_trig_to_text",
            source: "node_trigger_inbound",
            sourcePort: "next",
            target: "node_send_text",
            targetPort: "input",
          },
        ];

        let lastNodeId = "node_send_text";
        let currY = 350;

        // Se houver mídia anexa
        if (kwMediaUrl.trim()) {
          const mediaNodeId = "node_send_media";
          nodes.push({
            id: mediaNodeId,
            type: "messaging.send_media",
            name: "Enviar Mídia Anexa",
            version: 1,
            position: { x: 250, y: currY },
            config: {
              mediaType: kwMediaType,
              mediaUrl: kwMediaUrl.trim(),
              connectionPolicy: "same_as_trigger",
            },
          });
          edges.push({
            id: `edge_${lastNodeId}_to_${mediaNodeId}`,
            source: lastNodeId,
            sourcePort: "next",
            target: mediaNodeId,
            targetPort: "input",
          });
          lastNodeId = mediaNodeId;
          currY += 150;
        }

        // Se houver tag a adicionar
        if (kwTag.trim()) {
          const tagNodeId = "node_add_tag";
          nodes.push({
            id: tagNodeId,
            type: "crm.add_tag",
            name: `Tag: ${kwTag.trim()}`,
            version: 1,
            position: { x: 250, y: currY },
            config: {
              tag: kwTag.trim(),
            },
          });
          edges.push({
            id: `edge_${lastNodeId}_to_${tagNodeId}`,
            source: lastNodeId,
            sourcePort: "next",
            target: tagNodeId,
            targetPort: "input",
          });
          lastNodeId = tagNodeId;
          currY += 150;
        }

        // Se houver etapa de funil
        if (kwStageId) {
          const stageNodeId = "node_move_stage";
          nodes.push({
            id: stageNodeId,
            type: "crm.move_card_to_stage",
            name: "Mover Etapa CRM",
            version: 1,
            position: { x: 250, y: currY },
            config: {
              stageId: kwStageId,
            },
          });
          edges.push({
            id: `edge_${lastNodeId}_to_${stageNodeId}`,
            source: lastNodeId,
            sourcePort: "next",
            target: stageNodeId,
            targetPort: "input",
          });
        }

        compiledGraph = {
          schemaVersion: 1,
          nodes,
          edges,
          settings: {
            reentry: "allow",
            maxRuntimeSeconds: 86400 * 7,
            maxSteps: 100,
            ui_mode: "quick_rule",
          },
        };
      } else {
        // MODO 3: welcome_menu
        if (!wmBodyText.trim()) {
          toast.error("Informe a mensagem do menu.");
          setStep(2);
          setSubmitting(false);
          return;
        }
        if (wmOptions.length < 2) {
          toast.error("Adicione ao menos 2 opções no menu interativo.");
          setStep(2);
          setSubmitting(false);
          return;
        }

        const nodes: any[] = [
          {
            id: "node_trigger_inbound",
            type: "messaging.inbound_received",
            name: "Primeira Mensagem Recebida",
            version: 1,
            position: { x: 250, y: 50 },
            config: {
              channels: wmChannels,
              connectionMode: wmInstanceId ? "selected" : "any",
              instanceIds: wmInstanceId ? [wmInstanceId] : [],
              keywords: [],
            },
          },
          {
            id: "node_menu_interactive",
            type: "messaging.send_interactive",
            name: "Menu de Boas-Vindas",
            version: 1,
            position: { x: 250, y: 200 },
            config: {
              bodyText: wmBodyText.trim(),
              footerText: wmFooterText.trim() || undefined,
              options: wmOptions.map((opt) => ({ id: opt.id, label: opt.label.trim() })),
              invalidReplyText: "Por favor, digite o número de uma das opções válidas.",
              maxInvalidRetries: 2,
              timeoutMinutes: 60,
            },
          },
        ];

        const edges: any[] = [
          {
            id: "edge_trig_to_menu",
            source: "node_trigger_inbound",
            sourcePort: "next",
            target: "node_menu_interactive",
            targetPort: "input",
          },
        ];

        // Cria nós de ação para cada opção
        wmOptions.forEach((opt, idx) => {
          const actNodeId = `node_act_${opt.id}`;
          const posX = 100 + idx * 220;
          const posY = 400;

          if (opt.actionType === "ai") {
            nodes.push({
              id: actNodeId,
              type: "messaging.handoff_to_ai",
              name: `IA: ${opt.label}`,
              version: 1,
              position: { x: posX, y: posY },
              config: { promptOverride: "" },
            });
          } else if (opt.actionType === "human") {
            nodes.push({
              id: actNodeId,
              type: "messaging.route_to_human",
              name: `Humano: ${opt.label}`,
              version: 1,
              position: { x: posX, y: posY },
              config: { queue: "default" },
            });
          } else {
            nodes.push({
              id: actNodeId,
              type: "messaging.send_text",
              name: `Resposta: ${opt.label}`,
              version: 1,
              position: { x: posX, y: posY },
              config: {
                text: opt.replyText?.trim() || `Você escolheu: ${opt.label}. Em breve te responderemos.`,
                connectionPolicy: "same_as_trigger",
              },
            });
          }

          edges.push({
            id: `edge_menu_${opt.id}_to_act`,
            source: "node_menu_interactive",
            sourcePort: opt.id,
            target: actNodeId,
            targetPort: "input",
          });
        });

        compiledGraph = {
          schemaVersion: 1,
          nodes,
          edges,
          settings: {
            reentry: "deny_while_active",
            maxRuntimeSeconds: 86400 * 7,
            maxSteps: 100,
            ui_mode: "quick_rule",
          },
        };
      }

      let workflowIdToReturn = "";
      if (editingWorkflow?.id) {
        await publishWorkflow({
          data: {
            workflowId: editingWorkflow.id,
            graph: compiledGraph,
            name: ruleName.trim(),
          },
        });
        toast.success(t("automations.update_success", undefined, "Regra rápida atualizada com sucesso!"));
        workflowIdToReturn = editingWorkflow.id;
      } else {
        const res = await createWorkflow({
          data: {
            name: ruleName.trim(),
            description: `Regra Rápida (${ruleMode})`,
            initialGraph: compiledGraph,
            ui_mode: "quick_rule",
            publishImmediately: true,
          },
        });
        toast.success(t("automations.create_success", undefined, "Regra rápida ativada com sucesso!"));
        workflowIdToReturn = res.id;
      }

      onOpenChange(false);
      await onCreated(workflowIdToReturn);
    } catch (e: any) {
      toast.error(e?.message || "Erro ao salvar regra rápida");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2 text-purple-600 mb-1">
            <Sparkles className="size-5" />
            <span className="text-xs font-semibold uppercase tracking-wider">
              {t("automations.quick_rules", undefined, "Regras Rápidas")}
            </span>
          </div>
          <DialogTitle className="text-xl">
            {editingWorkflow
              ? t("automations.edit_quick_rule", undefined, "Editar Regra Rápida")
              : "Criar Regra Rápida em 3 Passos"}
          </DialogTitle>
          <DialogDescription>
            Configure automações profissionais sem complicação com passos guiados.
          </DialogDescription>
        </DialogHeader>

        {/* Seletor de Modo de Regra Rápida (Aparece se for nova regra ou mostra o ativo) */}
        {!editingWorkflow ? (
          <div className="grid grid-cols-3 gap-2 p-1.5 bg-muted/60 rounded-xl text-xs">
            <button
              type="button"
              onClick={() => {
                setRuleMode("comment_to_dm");
                setStep(1);
              }}
              className={`p-2 rounded-lg flex items-center justify-center gap-1.5 font-medium transition-all ${
                ruleMode === "comment_to_dm"
                  ? "bg-card text-purple-700 dark:text-purple-300 shadow font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <MessageSquareQuote className="size-4" />
              <span>Comment-to-DM</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setRuleMode("keyword_reply");
                setStep(1);
              }}
              className={`p-2 rounded-lg flex items-center justify-center gap-1.5 font-medium transition-all ${
                ruleMode === "keyword_reply"
                  ? "bg-card text-purple-700 dark:text-purple-300 shadow font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <MessageSquare className="size-4" />
              <span>Palavra-Chave</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setRuleMode("welcome_menu");
                setStep(1);
              }}
              className={`p-2 rounded-lg flex items-center justify-center gap-1.5 font-medium transition-all ${
                ruleMode === "welcome_menu"
                  ? "bg-card text-purple-700 dark:text-purple-300 shadow font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <ListChecks className="size-4" />
              <span>Menu Boas-Vindas</span>
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 p-2 rounded-xl bg-purple-500/10 text-purple-700 text-xs font-semibold">
            <Sparkles className="size-4" />
            <span>
              Tipo de Regra:{" "}
              {ruleMode === "comment_to_dm"
                ? "Comment-to-DM (Instagram / Facebook)"
                : ruleMode === "welcome_menu"
                  ? "Menu Interativo de Boas-Vindas"
                  : "Auto-Resposta por Palavra-Chave"}
            </span>
          </div>
        )}

        {/* Stepper Header */}
        <div className="grid grid-cols-3 gap-2 py-3 border-y text-xs font-medium">
          <button
            type="button"
            onClick={() => setStep(1)}
            className={`p-2 rounded-xl text-center transition-all ${
              step === 1 ? "bg-purple-500/10 text-purple-700 font-bold border border-purple-300" : "text-muted-foreground hover:bg-muted"
            }`}
          >
            1. Disparador
          </button>
          <button
            type="button"
            onClick={() => setStep(2)}
            className={`p-2 rounded-xl text-center transition-all ${
              step === 2 ? "bg-purple-500/10 text-purple-700 font-bold border border-purple-300" : "text-muted-foreground hover:bg-muted"
            }`}
          >
            2. Resposta Principal
          </button>
          <button
            type="button"
            onClick={() => setStep(3)}
            className={`p-2 rounded-xl text-center transition-all ${
              step === 3 ? "bg-purple-500/10 text-purple-700 font-bold border border-purple-300" : "text-muted-foreground hover:bg-muted"
            }`}
          >
            {ruleMode === "comment_to_dm" ? "3. Resposta Pública" : ruleMode === "welcome_menu" ? "3. Ações por Opção" : "3. Tags & CRM"}
          </button>
        </div>

        {/* CONTEÚDO DOS PASSOS */}
        <div className="py-3 space-y-4">
          {/* ============================================================== */}
          {/* PASSO 1: DISPARADOR (Por Modo) */}
          {/* ============================================================== */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="qr-name">{t("automations.rule_name", undefined, "Nome da Regra")} *</Label>
                <Input
                  id="qr-name"
                  placeholder={
                    ruleMode === "comment_to_dm"
                      ? "Ex: Resposta Automática no Post de Lançamento"
                      : ruleMode === "welcome_menu"
                        ? "Ex: Menu Inicial de Atendimento no WhatsApp"
                        : "Ex: Tabela de Preços no WhatsApp"
                  }
                  value={ruleName}
                  onChange={(e) => setRuleName(e.target.value)}
                />
              </div>

              {/* MODO 1: Comment-to-DM Gatilho */}
              {ruleMode === "comment_to_dm" && (
                <>
                  <div className="space-y-2">
                    <Label>{t("automations.select_meta_account", undefined, "Conta de Meta (Instagram / Facebook)")}</Label>
                    {metaInstances.length === 0 ? (
                      <div className="p-3 bg-amber-500/10 border border-amber-300 rounded-xl text-xs text-amber-800 space-y-2">
                        <p className="font-semibold flex items-center gap-1.5">
                          <AlertTriangle className="size-4" />
                          {t("automations.channel_not_connected", undefined, "Nenhuma conta de Instagram/Facebook conectada.")}
                        </p>
                      </div>
                    ) : (
                      <Select value={selectedInstanceId} onValueChange={setSelectedInstanceId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione a conta" />
                        </SelectTrigger>
                        <SelectContent>
                          {metaInstances.map((inst: any) => (
                            <SelectItem key={inst.id} value={inst.id}>
                              {inst.display_name || inst.instance_name} ({inst.provider})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>{t("automations.post_target", undefined, "Publicação Alvo")}</Label>
                      {postMode === "specific" && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={loadingMetaPosts || !selectedInstanceId}
                          onClick={async () => {
                            if (!selectedInstanceId) {
                              toast.error("Selecione uma conta Meta primeiro.");
                              return;
                            }
                            setLoadingMetaPosts(true);
                            try {
                              const res = await listMetaPosts({ data: { instanceId: selectedInstanceId, limit: 12 } });
                              setMetaPostsList(res.posts || []);
                              if (!res.posts?.length) toast.info("Nenhuma publicação recente encontrada.");
                              else toast.success(`${res.posts.length} posts carregados!`);
                            } catch (e: any) {
                              toast.error(e?.message || "Erro ao carregar posts.");
                            } finally {
                              setLoadingMetaPosts(false);
                            }
                          }}
                          className="text-xs gap-1 h-7"
                        >
                          {loadingMetaPosts ? <Loader2 className="size-3 animate-spin" /> : <Image className="size-3" />}
                          Carregar Posts Recentes
                        </Button>
                      )}
                    </div>

                    <div className="flex items-center gap-4 text-xs">
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="radio"
                          name="postMode"
                          checked={postMode === "all"}
                          onChange={() => {
                            setPostMode("all");
                            setSpecificPostId("");
                          }}
                        />
                        {t("automations.all_posts", undefined, "Qualquer publicação")}
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="radio"
                          name="postMode"
                          checked={postMode === "specific"}
                          onChange={() => setPostMode("specific")}
                        />
                        {t("automations.specific_post", undefined, "Publicação específica")}
                      </label>
                    </div>

                    {postMode === "specific" && (
                      <div className="space-y-2">
                        <Input
                          placeholder="Cole o ID do post ou selecione na lista abaixo"
                          value={specificPostId}
                          onChange={(e) => setSpecificPostId(e.target.value)}
                        />
                        {metaPostsList.length > 0 && (
                          <div className="grid grid-cols-4 gap-2 border rounded-xl p-2 bg-muted/20 max-h-40 overflow-y-auto">
                            {metaPostsList.map((p) => {
                              const isSel = specificPostId === p.id;
                              return (
                                <button
                                  key={p.id}
                                  type="button"
                                  onClick={() => setSpecificPostId(p.id)}
                                  className={`p-1 border rounded-lg text-left transition-all relative ${
                                    isSel ? "border-primary ring-2 ring-primary/40 bg-primary/10" : "hover:border-primary/50 bg-card"
                                  }`}
                                >
                                  {p.thumbnailUrl ? (
                                    <img src={p.thumbnailUrl} alt="Thumbnail" className="w-full h-12 object-cover rounded" />
                                  ) : (
                                    <div className="w-full h-12 bg-muted flex items-center justify-center rounded">
                                      <Image className="size-4 text-muted-foreground" />
                                    </div>
                                  )}
                                  <span className="text-[9px] line-clamp-1 block mt-1">{p.caption || "Post"}</span>
                                  {isSel && (
                                    <span className="absolute top-1 right-1 bg-primary text-white rounded-full p-0.5">
                                      <Check className="size-2.5" />
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="qr-keywords">{t("automations.keywords_label", undefined, "Palavras-chave (opcional)")}</Label>
                    <Input
                      id="qr-keywords"
                      placeholder="Ex: preço, valor, link, info (separadas por vírgula)"
                      value={keywordsInput}
                      onChange={(e) => setKeywordsInput(e.target.value)}
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Deixe em branco para disparar com qualquer texto de comentário.
                    </p>
                  </div>
                </>
              )}

              {/* MODO 2: Palavra-chave no WhatsApp/Direct */}
              {ruleMode === "keyword_reply" && (
                <>
                  <div className="space-y-2">
                    <Label>Linha / Conexão de Envio</Label>
                    <Select value={kwInstanceId} onValueChange={setKwInstanceId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione a conexão" />
                      </SelectTrigger>
                      <SelectContent>
                        {allInstances.map((inst: any) => (
                          <SelectItem key={inst.id} value={inst.id}>
                            {inst.display_name || inst.instance_name} ({inst.provider})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Palavras-chave Disparadoras *</Label>
                    <Input
                      placeholder="Ex: preco, orcamento, comprar, catalogo, suporte"
                      value={kwKeywords}
                      onChange={(e) => setKwKeywords(e.target.value)}
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Separadas por vírgula. Se o contato digitar qualquer uma dessas palavras, a resposta será enviada.
                    </p>
                  </div>
                </>
              )}

              {/* MODO 3: Menu de Boas-Vindas */}
              {ruleMode === "welcome_menu" && (
                <>
                  <div className="space-y-2">
                    <Label>Linha / Conexão do Menu</Label>
                    <Select value={wmInstanceId} onValueChange={setWmInstanceId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione a conexão" />
                      </SelectTrigger>
                      <SelectContent>
                        {allInstances.map((inst: any) => (
                          <SelectItem key={inst.id} value={inst.id}>
                            {inst.display_name || inst.instance_name} ({inst.provider})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    O menu interativo será apresentado como boas-vindas na primeira mensagem do contato.
                  </p>
                </>
              )}
            </div>
          )}

          {/* ============================================================== */}
          {/* PASSO 2: RESPOSTA PRINCIPAL (Por Modo) */}
          {/* ============================================================== */}
          {step === 2 && (
            <div className="space-y-4">
              {/* MODO 1: DM + Funil CRM */}
              {ruleMode === "comment_to_dm" && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="qr-dm">{t("automations.dm_text_label", undefined, "Mensagem Privada a Enviar (DM)")} *</Label>
                    <Textarea
                      id="qr-dm"
                      rows={4}
                      value={dmText}
                      onChange={(e) => setDmText(e.target.value)}
                    />
                    <span className="text-[11px] text-muted-foreground block">
                      Variáveis disponíveis: <code className="bg-muted px-1 rounded">{"{{lead_name}}"}</code>, <code className="bg-muted px-1 rounded">{"{{sender_id}}"}</code>
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t">
                    <div className="space-y-2">
                      <Label>{t("automations.select_pipeline", undefined, "Funil de Vendas")} *</Label>
                      <Select value={selectedPipelineId} onValueChange={(val) => {
                        setSelectedPipelineId(val);
                        setSelectedStageId("");
                      }}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o funil" />
                        </SelectTrigger>
                        <SelectContent>
                          {(connections.pipelines || []).map((pipe: any) => (
                            <SelectItem key={pipe.id} value={pipe.id}>
                              {pipe.nome}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>{t("automations.select_stage", undefined, "Etapa de Entrada no CRM")} *</Label>
                      <Select value={selectedStageId} onValueChange={setSelectedStageId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione a etapa" />
                        </SelectTrigger>
                        <SelectContent>
                          {availableStages.map((stage: any) => (
                            <SelectItem key={stage.id} value={stage.id}>
                              {stage.nome}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="qr-tag">Etiqueta do Lead (Tag CRM)</Label>
                    <Input
                      id="qr-tag"
                      value={leadTag}
                      onChange={(e) => setLeadTag(e.target.value)}
                      placeholder="Ex: lead-comentario, promo-instagram"
                    />
                  </div>
                </>
              )}

              {/* MODO 2: Resposta de Texto & Mídia */}
              {ruleMode === "keyword_reply" && (
                <>
                  <div className="space-y-2">
                    <Label>Texto da Resposta *</Label>
                    <Textarea
                      rows={4}
                      value={kwReplyText}
                      onChange={(e) => setKwReplyText(e.target.value)}
                      placeholder="Digite a resposta que será enviada automaticamente..."
                    />
                  </div>

                  <div className="space-y-2 pt-2 border-t">
                    <Label>Mídia Anexa (Opcional - Cloudflare R2 / URL)</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        placeholder="https://... ou faça upload"
                        value={kwMediaUrl}
                        onChange={(e) => setKwMediaUrl(e.target.value)}
                      />
                      <label className="cursor-pointer shrink-0">
                        <input
                          type="file"
                          className="hidden"
                          disabled={uploadingMedia}
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            if (file.size > 15 * 1024 * 1024) {
                              toast.error("O arquivo excede o limite máximo de 15 MB.");
                              return;
                            }
                            setUploadingMedia(true);
                            try {
                              const reader = new FileReader();
                              reader.onload = async () => {
                                try {
                                  const base64 = (reader.result as string)?.split(",")?.[1] || "";
                                  const res = await uploadMedia({
                                    data: {
                                      fileName: file.name,
                                      base64,
                                      mimeType: file.type || "application/octet-stream",
                                    },
                                  });
                                  setKwMediaUrl(res.url);
                                  toast.success("Arquivo enviado com sucesso!");
                                } catch (err: any) {
                                  toast.error(err?.message || "Erro no upload.");
                                } finally {
                                  setUploadingMedia(false);
                                }
                              };
                              reader.readAsDataURL(file);
                            } catch {
                              setUploadingMedia(false);
                              toast.error("Falha ao ler arquivo.");
                            }
                          }}
                        />
                        <Button type="button" variant="outline" size="sm" asChild disabled={uploadingMedia} className="gap-1 text-xs">
                          <span>
                            {uploadingMedia ? <Loader2 className="size-3 animate-spin" /> : <Upload className="size-3" />}
                            Upload
                          </span>
                        </Button>
                      </label>
                    </div>
                  </div>
                </>
              )}

              {/* MODO 3: Pergunta e Opções do Menu */}
              {ruleMode === "welcome_menu" && (
                <>
                  <div className="space-y-2">
                    <Label>Texto de Boas-Vindas / Pergunta Principal *</Label>
                    <Textarea
                      rows={3}
                      value={wmBodyText}
                      onChange={(e) => setWmBodyText(e.target.value)}
                      placeholder="Olá! Como podemos te ajudar?"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Rodapé (Opcional)</Label>
                    <Input
                      value={wmFooterText}
                      onChange={(e) => setWmFooterText(e.target.value)}
                      placeholder="Selecione uma opção digitando o número:"
                    />
                  </div>

                  <div className="space-y-2 pt-2 border-t">
                    <div className="flex items-center justify-between">
                      <Label className="font-semibold">Opções do Menu (2 a 4)</Label>
                      <span className="text-[10px] text-muted-foreground">{wmOptions.length} de 4</span>
                    </div>

                    <div className="space-y-2">
                      {wmOptions.map((opt, idx) => (
                        <div key={opt.id} className="flex items-center gap-2 bg-muted/40 p-2 rounded-xl border">
                          <span className="size-5 rounded-full bg-purple-600 text-white flex items-center justify-center text-[10px] font-bold shrink-0">
                            {idx + 1}
                          </span>
                          <Input
                            value={opt.label}
                            placeholder={`Opção ${idx + 1}`}
                            onChange={(e) => {
                              const updated = [...wmOptions];
                              updated[idx] = { ...updated[idx], label: e.target.value };
                              setWmOptions(updated);
                            }}
                            className="h-8 text-xs"
                          />
                          {wmOptions.length > 2 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => setWmOptions(wmOptions.filter((_, i) => i !== idx))}
                              className="size-8 text-muted-foreground hover:text-destructive shrink-0"
                            >
                              <X className="size-3.5" />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>

                    {wmOptions.length < 4 && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const n = wmOptions.length + 1;
                          setWmOptions([
                            ...wmOptions,
                            { id: `opt_${n}`, label: `Nova Opção ${n}`, actionType: "text", replyText: "" },
                          ]);
                        }}
                        className="w-full text-xs gap-1 mt-1"
                      >
                        <Plus className="size-3" /> Adicionar Opção ao Menu
                      </Button>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ============================================================== */}
          {/* PASSO 3: CONCLUSÃO / RAMOS (Por Modo) */}
          {/* ============================================================== */}
          {step === 3 && (
            <div className="space-y-4">
              {/* MODO 1: Variações de Comentário Público & Jitter */}
              {ruleMode === "comment_to_dm" && (
                <>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>{t("automations.public_reply_label", undefined, "Variações de Resposta Pública")}</Label>
                      <span className="text-[11px] text-muted-foreground">Rotação aleatória</span>
                    </div>

                    <div className="space-y-2">
                      {variants.map((v, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <Input
                            value={v}
                            onChange={(e) => {
                              const updated = [...variants];
                              updated[i] = e.target.value;
                              setVariants(updated);
                            }}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemoveVariant(i)}
                            className="text-muted-foreground hover:text-destructive shrink-0 size-8"
                          >
                            <X className="size-4" />
                          </Button>
                        </div>
                      ))}
                    </div>

                    <div className="flex gap-2 pt-1">
                      <Input
                        placeholder="Nova variação..."
                        value={newVariantInput}
                        onChange={(e) => setNewVariantInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleAddVariant();
                          }
                        }}
                      />
                      <Button type="button" variant="outline" onClick={handleAddVariant} className="shrink-0 gap-1 text-xs">
                        <Plus className="size-3.5" /> Adicionar
                      </Button>
                    </div>
                  </div>

                  <div className="p-3 bg-muted/40 rounded-xl space-y-3 border">
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold flex items-center gap-1.5">
                        <Clock className="size-3.5 text-purple-600" />
                        {t("automations.jitter_label", undefined, "Retardo Humano Aleatório (Segundos)")}
                      </Label>
                      <p className="text-[11px] text-muted-foreground">
                        Simula tempo real de digitação entre o envio do direct e a resposta pública.
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-[11px]">Mínimo (seg)</Label>
                        <Input
                          type="number"
                          min={1}
                          max={60}
                          value={minJitter}
                          onChange={(e) => setMinJitter(Number(e.target.value))}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px]">Máximo (seg)</Label>
                        <Input
                          type="number"
                          min={minJitter}
                          max={120}
                          value={maxJitter}
                          onChange={(e) => setMaxJitter(Number(e.target.value))}
                        />
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* MODO 2: Ações de CRM (Tags e Etapa) */}
              {ruleMode === "keyword_reply" && (
                <>
                  <div className="space-y-2">
                    <Label>Adicionar Tag CRM ao Contato (Opcional)</Label>
                    <Input
                      placeholder="Ex: interessado, pediu-preco"
                      value={kwTag}
                      onChange={(e) => setKwTag(e.target.value)}
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t">
                    <div className="space-y-2">
                      <Label>Funil de Vendas (Opcional)</Label>
                      <Select value={kwPipelineId} onValueChange={(val) => {
                        setKwPipelineId(val);
                        setKwStageId("");
                      }}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o funil" />
                        </SelectTrigger>
                        <SelectContent>
                          {(connections.pipelines || []).map((pipe: any) => (
                            <SelectItem key={pipe.id} value={pipe.id}>
                              {pipe.nome}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Mover para Etapa (Opcional)</Label>
                      <Select value={kwStageId} onValueChange={setKwStageId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione a etapa" />
                        </SelectTrigger>
                        <SelectContent>
                          {availableStages.map((stage: any) => (
                            <SelectItem key={stage.id} value={stage.id}>
                              {stage.nome}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </>
              )}

              {/* MODO 3: Configurar Ação para Cada Opção */}
              {ruleMode === "welcome_menu" && (
                <div className="space-y-3">
                  <span className="text-xs font-semibold block">O que acontece quando o lead escolhe cada opção?</span>
                  {wmOptions.map((opt, idx) => (
                    <div key={opt.id} className="p-3 bg-muted/40 rounded-xl border space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-xs flex items-center gap-2">
                          <span className="size-4 rounded-full bg-purple-600 text-white text-[9px] flex items-center justify-center font-bold">
                            {idx + 1}
                          </span>
                          "{opt.label}"
                        </span>
                        <Select
                          value={opt.actionType}
                          onValueChange={(val: any) => {
                            const updated = [...wmOptions];
                            updated[idx] = { ...updated[idx], actionType: val };
                            setWmOptions(updated);
                          }}
                        >
                          <SelectTrigger className="h-7 text-xs w-48">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="text">Enviar Mensagem</SelectItem>
                            <SelectItem value="ai">Transferir para IA</SelectItem>
                            <SelectItem value="human">Transferir para Humano</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {opt.actionType === "text" && (
                        <Textarea
                          rows={2}
                          placeholder={`Texto enviado se o lead escolher "${opt.label}"...`}
                          value={opt.replyText || ""}
                          onChange={(e) => {
                            const updated = [...wmOptions];
                            updated[idx] = { ...updated[idx], replyText: e.target.value };
                            setWmOptions(updated);
                          }}
                          className="text-xs"
                        />
                      )}

                      {opt.actionType === "ai" && (
                        <p className="text-[11px] text-purple-700 bg-purple-50 dark:bg-purple-950/40 p-2 rounded-lg flex items-center gap-1.5">
                          <Bot className="size-3.5 shrink-0" />
                          O Agente IA assumirá a conversa e responderá com base na base de conhecimento.
                        </p>
                      )}

                      {opt.actionType === "human" && (
                        <p className="text-[11px] text-amber-700 bg-amber-50 dark:bg-amber-950/40 p-2 rounded-lg flex items-center gap-1.5">
                          <UserCheck className="size-3.5 shrink-0" />
                          A automação é pausada e a equipe de atendentes é notificada na central de conversas.
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Navigation */}
        <DialogFooter className="flex items-center justify-between sm:justify-between w-full border-t pt-3">
          {step > 1 ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => setStep((step - 1) as any)}
              disabled={submitting}
            >
              Voltar
            </Button>
          ) : (
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancelar
            </Button>
          )}

          {step < 3 ? (
            <Button
              type="button"
              onClick={() => setStep((step + 1) as any)}
              className="bg-purple-600 text-white hover:bg-purple-700"
            >
              Próximo Passo <ArrowRight className="size-4 ml-1" />
            </Button>
          ) : (
            <Button
              type="button"
              onClick={handleCompileAndPublish}
              disabled={submitting}
              className="bg-purple-600 text-white hover:bg-purple-700"
            >
              {submitting ? <Loader2 className="size-4 animate-spin mr-2" /> : <CheckCircle2 className="size-4 mr-2" />}
              {t("automations.save_and_activate", undefined, "Salvar e Ativar Regra")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// MODAL DE CONFIGURAÇÃO DE MODELO (WorkflowTemplatesGallery Config Modal)
// ============================================================================

interface TemplateConfigModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: any;
  connections: { instances: any[]; stages: any[]; pipelines: any[] };
  onCreated: (workflowId: string) => Promise<void>;
}

function TemplateConfigModal({
  open,
  onOpenChange,
  template,
  connections,
  onCreated,
}: TemplateConfigModalProps) {
  const { t } = useLanguage();
  const createWorkflow = useServerFn(createWorkflowFn);

  const [title, setTitle] = useState(template.title);
  const [selectedPipelineId, setSelectedPipelineId] = useState("");
  const [selectedStageId, setSelectedStageId] = useState("");
  const [selectedInstanceId, setSelectedInstanceId] = useState("");
  const [customText, setCustomText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Validar canal conectado
  const availableInstances = useMemo(() => {
    const isConn = (i: any) => !i.status || ["connected", "open", "ativo", "ready"].includes(String(i.status).toLowerCase());
    if (template.channelRequired === "meta") {
      return (connections.instances || []).filter((i: any) => {
        const p = String(i.provider || "").toLowerCase();
        return (p.includes("meta") || p.includes("instagram") || p.includes("messenger")) && isConn(i);
      });
    }
    if (template.channelRequired === "whatsapp_or_meta") {
      return (connections.instances || []).filter((i: any) => {
        const p = String(i.provider || "").toLowerCase();
        return p !== "telegram" && isConn(i);
      });
    }
    return (connections.instances || []).filter(isConn);
  }, [connections.instances, template.channelRequired]);

  const availableStages = useMemo(() => {
    if (!selectedPipelineId) return connections.stages || [];
    return (connections.stages || []).filter((s: any) => s.pipeline_id === selectedPipelineId);
  }, [connections.stages, selectedPipelineId]);

  useEffect(() => {
    setTitle(template.title);
    if (availableInstances.length > 0 && !selectedInstanceId) {
      setSelectedInstanceId(availableInstances[0].id);
    }
    if (connections.pipelines.length > 0 && !selectedPipelineId) {
      setSelectedPipelineId(connections.pipelines[0].id);
    }
  }, [template, availableInstances, connections.pipelines]);

  useEffect(() => {
    if (availableStages.length > 0 && !selectedStageId) {
      setSelectedStageId(availableStages[0].id);
    }
  }, [availableStages]);

  const channelMissing = availableInstances.length === 0 && template.channelRequired !== "any";

  async function handleApplyTemplate() {
    if (channelMissing) {
      toast.error(t("automations.channel_not_connected", undefined, "Conecte uma conta para este canal antes de publicar."));
      return;
    }
    const needsStage = template.id !== "keyword_responder";
    if (needsStage && !selectedStageId) {
      toast.error(t("automations.select_stage", undefined, "Selecione uma etapa do CRM"));
      return;
    }

    setSubmitting(true);
    try {
      let initialGraph: any = null;

      if (template.id === "comment_to_dm") {
        const selectedInst = (connections.instances || []).find((i: any) => i.id === selectedInstanceId);
        const isInstagram = selectedInst?.provider === "meta_instagram" || selectedInst?.provider === "instagram";
        const isFacebook = selectedInst?.provider === "meta_messenger" || selectedInst?.provider === "facebook";
        const channels = isInstagram ? ["instagram"] : isFacebook ? ["facebook"] : ["instagram", "facebook"];

        initialGraph = {
          schemaVersion: 1,
          nodes: [
            {
              id: "trigger_comment",
              type: "meta.comment_received",
              name: "Comentário no Instagram/Facebook",
              version: 1,
              position: { x: 250, y: 50 },
              config: {
                connectionMode: selectedInstanceId ? "selected" : "any",
                instanceIds: selectedInstanceId ? [selectedInstanceId] : [],
                channels,
                ignoreNestedReplies: true,
                oncePerUserPerPost: true,
              },
            },
            {
              id: "crm_ensure",
              type: "crm.ensure_lead",
              name: "Garantir Lead no CRM",
              version: 1,
              position: { x: 250, y: 200 },
              config: {
                pipelineId: selectedPipelineId || undefined,
                stageId: selectedStageId || undefined,
                tag: "lead-comentario",
              },
            },
            {
              id: "meta_dm",
              type: "meta.send_private_reply",
              name: "Enviar Resposta Privada (DM Meta)",
              version: 1,
              position: { x: 250, y: 350 },
              config: {
                message: customText || "Olá {{lead_name}}! Vi seu comentário e te mandei as informações por aqui.",
              },
            },
            {
              id: "meta_reply",
              type: "meta.reply_comment",
              name: "Responder Comentário Público",
              version: 1,
              position: { x: 250, y: 500 },
              config: {
                message: "Te enviei os detalhes no seu direct! 🚀",
                variants: [
                  "Te enviei os detalhes no seu direct! 🚀",
                  "Acabei de te chamar por mensagem privada! 📩",
                  "Prontinho! Dá uma olhada no seu direct ✨",
                ],
                minDelaySeconds: 5,
                maxDelaySeconds: 25,
                delaySeconds: 0,
              },
            },
          ],
          edges: [
            { id: "e1", source: "trigger_comment", sourcePort: "next", target: "crm_ensure", targetPort: "input" },
            { id: "e2", source: "crm_ensure", sourcePort: "next", target: "meta_dm", targetPort: "input" },
            { id: "e3", source: "meta_dm", sourcePort: "next", target: "meta_reply", targetPort: "input" },
          ],
          settings: { reentry: "allow", maxRuntimeSeconds: 86400, maxSteps: 100, ui_mode: "quick_rule" },
        };
      } else if (template.id === "keyword_responder") {
        initialGraph = {
          schemaVersion: 1,
          nodes: [
            {
              id: "trigger_kw",
              type: "messaging.inbound_received",
              name: "Mensagem Recebida (Palavra-Chave)",
              version: 1,
              position: { x: 250, y: 80 },
              config: {
                connectionMode: selectedInstanceId ? "selected" : "any",
                instanceIds: selectedInstanceId ? [selectedInstanceId] : [],
                keywords: ["preço", "preco", "catalogo", "catálogo", "valor", "info"],
                channels: ["whatsapp", "instagram_dm", "facebook_messenger"],
                conversationType: "direct",
              },
            },
            {
              id: "send_kw_reply",
              type: "messaging.send_text",
              name: "Enviar Resposta Imediata",
              version: 1,
              position: { x: 250, y: 240 },
              config: {
                text: customText || "Olá! Segue nosso catálogo com valores e detalhes: https://",
                connectionPolicy: "same_as_trigger",
              },
            },
            {
              id: "add_kw_tag",
              type: "crm.add_tag",
              name: "Adicionar Tag de Interesse",
              version: 1,
              position: { x: 250, y: 400 },
              config: { tag: "interesse-catalogo" },
            },
          ],
          edges: [
            { id: "e1", source: "trigger_kw", sourcePort: "next", target: "send_kw_reply", targetPort: "input" },
            { id: "e2", source: "send_kw_reply", sourcePort: "next", target: "add_kw_tag", targetPort: "input" },
          ],
          settings: { reentry: "deny_while_active", maxRuntimeSeconds: 86400, maxSteps: 100, ui_mode: "canvas" },
        };
      } else if (template.id === "welcome_triage") {
        initialGraph = {
          schemaVersion: 1,
          nodes: [
            {
              id: "trigger_inbound",
              type: "messaging.inbound_received",
              name: "Mensagem Recebida",
              version: 1,
              position: { x: 250, y: 80 },
              config: {
                connectionMode: selectedInstanceId ? "selected" : "any",
                instanceIds: selectedInstanceId ? [selectedInstanceId] : [],
                channels: ["whatsapp", "instagram_dm", "facebook_messenger", "telegram"],
                conversationType: "direct",
              },
            },
            {
              id: "welcome_msg",
              type: "messaging.send_text",
              name: "Boas-vindas",
              version: 1,
              position: { x: 250, y: 220 },
              config: {
                text: customText || "Olá! Seja bem-vindo à nossa empresa. Como podemos te ajudar hoje?",
                connectionPolicy: "same_as_trigger",
              },
            },
            {
              id: "move_stage",
              type: "crm.move_card_to_stage",
              name: "Mover para Triagem",
              version: 1,
              position: { x: 250, y: 360 },
              config: {
                pipelineId: selectedPipelineId || undefined,
                stageId: selectedStageId || undefined,
              },
            },
            {
              id: "handoff_ai",
              type: "messaging.handoff_to_ai",
              name: "Derivar para IA",
              version: 1,
              position: { x: 250, y: 500 },
              config: {},
            },
          ],
          edges: [
            { id: "e1", source: "trigger_inbound", sourcePort: "next", target: "welcome_msg", targetPort: "input" },
            { id: "e2", source: "welcome_msg", sourcePort: "next", target: "move_stage", targetPort: "input" },
            { id: "e3", source: "move_stage", sourcePort: "next", target: "handoff_ai", targetPort: "input" },
          ],
          settings: { reentry: "deny_while_active", maxRuntimeSeconds: 86400, maxSteps: 100, ui_mode: "canvas" },
        };
      } else {
        // followup_24h
        initialGraph = {
          schemaVersion: 1,
          nodes: [
            {
              id: "trigger_stage_changed",
              type: "crm.card_stage_changed",
              name: "Lead Entrou em Proposta",
              version: 1,
              position: { x: 250, y: 80 },
              config: {
                pipelineId: selectedPipelineId || undefined,
                toStageId: selectedStageId || undefined,
              },
            },
            {
              id: "wait_24h",
              type: "control.wait_duration",
              name: "Aguardar 24 Horas",
              version: 1,
              position: { x: 250, y: 220 },
              config: {
                unit: "hours",
                amount: 24,
              },
            },
            {
              id: "followup_msg",
              type: "messaging.send_text",
              name: "Mensagem de Follow-up 24h",
              version: 1,
              position: { x: 250, y: 360 },
              config: {
                text: customText || "Olá {{lead_name}}! Tudo bem? Passando para saber se conseguiu avaliar nossa proposta comercial.",
                connectionPolicy: "same_as_trigger",
              },
            },
            {
              id: "add_followup_tag",
              type: "crm.add_tag",
              name: "Marcar Follow-up",
              version: 1,
              position: { x: 250, y: 500 },
              config: { tag: "followup-enviado" },
            },
          ],
          edges: [
            { id: "e1", source: "trigger_stage_changed", sourcePort: "next", target: "wait_24h", targetPort: "input" },
            { id: "e2", source: "wait_24h", sourcePort: "next", target: "followup_msg", targetPort: "input" },
            { id: "e3", source: "followup_msg", sourcePort: "next", target: "add_followup_tag", targetPort: "input" },
          ],
          settings: { reentry: "deny_while_active", maxRuntimeSeconds: 86400 * 3, maxSteps: 100, ui_mode: "canvas" },
        };
      }

      const res = await createWorkflow({
        data: {
          name: title.trim(),
          description: template.description,
          initialGraph,
          ui_mode: initialGraph.settings.ui_mode || "canvas",
          publishImmediately: true,
        },
      });

      toast.success(t("automations.create_success", undefined, "Modelo ativado com sucesso!"));
      onOpenChange(false);
      await onCreated(res.id);
    } catch (e: any) {
      toast.error(e?.message || "Erro ao configurar modelo");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <template.icon className="size-5 text-[var(--brand)]" />
            <span className="text-xs font-semibold text-[var(--brand)] uppercase tracking-wider">
              {template.badge}
            </span>
          </div>
          <DialogTitle>{template.title}</DialogTitle>
          <DialogDescription>{template.description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {channelMissing && (
            <div className="p-3 bg-rose-500/10 border border-rose-300 rounded-xl text-xs text-rose-800 space-y-1">
              <p className="font-semibold flex items-center gap-1.5">
                <AlertTriangle className="size-4" />
                {t("automations.channel_required", undefined, "Canal Necessário")}
              </p>
              <p>{t("automations.channel_not_connected", undefined, "Nenhuma conta conectada para este canal.")}</p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="tpl-name">{t("automations.rule_name", undefined, "Nome do Fluxo")}</Label>
            <Input id="tpl-name" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          {availableInstances.length > 0 && (
            <div className="space-y-2">
              <Label>{t("automations.select_channel", undefined, "Selecione a Conexão")}</Label>
              <Select value={selectedInstanceId} onValueChange={setSelectedInstanceId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a conexão" />
                </SelectTrigger>
                <SelectContent>
                  {availableInstances.map((inst: any) => (
                    <SelectItem key={inst.id} value={inst.id}>
                      {inst.display_name || inst.instance_name} ({inst.provider})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {template.id !== "keyword_responder" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>{t("automations.select_pipeline", undefined, "Funil de Vendas")}</Label>
                <Select value={selectedPipelineId} onValueChange={(v) => {
                  setSelectedPipelineId(v);
                  setSelectedStageId("");
                }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Funil" />
                  </SelectTrigger>
                  <SelectContent>
                    {(connections.pipelines || []).map((pipe: any) => (
                      <SelectItem key={pipe.id} value={pipe.id}>
                        {pipe.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>{t("automations.select_stage", undefined, "Etapa no CRM")}</Label>
                <Select value={selectedStageId} onValueChange={setSelectedStageId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Etapa" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableStages.map((stage: any) => (
                      <SelectItem key={stage.id} value={stage.id}>
                        {stage.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="tpl-text">Texto da Mensagem Principal</Label>
            <Textarea
              id="tpl-text"
              rows={3}
              placeholder="Digite a mensagem que será enviada automaticamente..."
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            {t("common.cancel", undefined, "Cancelar")}
          </Button>
          <Button
            onClick={handleApplyTemplate}
            disabled={submitting || channelMissing}
            className="bg-[var(--brand)] text-white hover:bg-[var(--brand)]/90"
          >
            {submitting ? <Loader2 className="size-4 animate-spin mr-2" /> : <Check className="size-4 mr-2" />}
            {t("automations.publish_template", undefined, "Publicar Automação")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
