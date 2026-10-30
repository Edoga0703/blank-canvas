import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";

import { useIsMobile } from "@/hooks/use-mobile";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { InitialsAvatar } from "@/components/ui/initials-avatar";
import { AvatarViewer } from "@/components/ui/avatar-viewer";
import { FormattedMessageText } from "@/components/chat/formatted-message-text";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Save, Trash2, Send, X as XIcon, Plus, Copy, Route as RouteIcon, Sparkles, Loader2, DollarSign, Filter, ChevronDown, ChevronUp, User, Mail, Building2, MapPin, Phone, UserCheck, Share2, Tag as TagIcon, Pencil, CreditCard, Target, Users, Star, Check, Package } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { listTags, type CompanyTag } from "@/lib/tags.functions";
import { getCardStageHistory } from "@/lib/tracking.functions";
import { requestLeadSummary } from "@/lib/lead-summary.functions";
import { analyzeLeadConversation } from "@/lib/lead-coach.functions";
import { CANAL_LABEL, CANAL_COLOR, type CanalEntrada } from "@/lib/tracking-utils";
import { ConversationMediaTab } from "@/components/chat/conversation-media-panel";
import { OlistPedidosTab } from "@/components/crm/olist-pedidos-tab";
import { useLanguage, formatDate, formatTime, formatCurrency, translateDefaultStageName, translateDefaultPipelineName } from "@/lib/i18n/context";

import { applyStageMovement } from "@/lib/crm-lead-analyzer.functions";
import { CrmCopilotSheet } from "@/components/crm/crm-copilot-sheet";
import { useCapacidadeAtiva } from "@/hooks/use-capacidades";
import { LeadAiAnalyzerDialog } from "@/components/crm/lead-ai-analyzer-dialog";
import { LeadAdReferralCard } from "@/components/crm/lead-ad-referral-card";


export interface LeadCard {
  id: string; numero: string; nome: string | null;
  status: string; stage_id: string | null;
  ultima_mensagem: string | null; ultima_em: string;
  observacao: string | null; valor: number | null;
  origem: string | null; owner_id: string | null;
  department_id?: string | null;
  tags: string[]; proxima_acao: string | null;
  foto_url?: string | null;
  email?: string | null; cpf_cnpj?: string | null;
  endereco?: string | null; empresa?: string | null;
  provider?: string | null;
  tipo_contato?: "lead" | "interno" | null;
  transfer_para_user_id?: string | null;
  transfer_de_user_id?: string | null;
  transfer_status?: string | null;
  campos_extras?: { respostas?: RespostaExtra[]; personalizados?: RespostaExtra[] } | null;
}

export interface RespostaExtra {
  label: string;
  valor: string;
  campo_id?: string | null;
  origem?: string | null;
  em?: string;
}



export interface Stage { id: string; nome: string; cor: string; }
export interface Member { user_id: string; email?: string | null; nome?: string | null; }

import { handleChatAction } from "@/lib/whatsapp.functions";
import { EncaminharDialog } from "@/components/chat/encaminhar-dialog";


export function LeadDrawer({
  card, stages, members, companyId, onClose, onChanged, operationalMode = false,
}: {
  card: LeadCard | null; stages: Stage[]; members: Member[];
  companyId: string; onClose: () => void; onChanged: () => void; operationalMode?: boolean;
}) {
  const isMobile = useIsMobile();
  if (!card) return null;
  return (
    <Sheet open={!!card} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side={isMobile ? "bottom" : "right"}
        className={
          isMobile
            ? "h-[85dvh] rounded-t-2xl p-4 flex flex-col overflow-hidden bg-[var(--panel)] border-t border-[var(--border)] shadow-[0_-8px_30px_-12px_rgba(0,0,0,.45)]"
            : "w-full sm:max-w-2xl h-full flex flex-col overflow-hidden bg-[var(--panel)] border-l border-[var(--border)]"
        }
      >
        {isMobile && <div className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-white/20" />}
        <SheetHeader className="shrink-0 pb-4 border-b border-[var(--border)]">
          <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 pr-8">
            <AvatarViewer name={card.nome || card.numero} src={card.foto_url} size={isMobile ? 44 : 48} />
            <div className="min-w-0 flex-1 text-left">
              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                <SheetTitle className="max-w-full truncate text-sm sm:text-base">{card.nome || card.numero}</SheetTitle>
                <LeadTagsInline cardId={card.id} tags={card.tags ?? []} onChanged={onChanged} compact />
              </div>
              <div className="text-[11px] sm:text-xs text-muted-foreground font-mono truncate">{card.numero}</div>
            </div>
          </div>
        </SheetHeader>
        <div className="mt-4 flex min-h-0 min-w-0 flex-1 flex-col [&_*]:min-w-0">
          <LeadDetailsPanel
            card={card} stages={stages} members={members} companyId={companyId}
            onChanged={onChanged}
            onDeleted={() => { onChanged(); onClose(); }} operationalMode={operationalMode}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}


export function LeadDetailsPanel({
  card, stages, members, companyId, onChanged, hideConversation, onDeleted, operationalMode = false,
}: {
  card: LeadCard; stages: Stage[]; members: Member[];
  companyId: string; onChanged: () => void; hideConversation?: boolean;
  onDeleted?: () => void; operationalMode?: boolean;
}) {
  const { t, formatDate, formatTime, formatCurrency, translateDefaultStageName, translateDefaultPipelineName, localeCode } = useLanguage();
  const [local, setLocal] = useState<LeadCard & { pipeline_id?: string | null }>(card as any);
  const [encaminharOpen, setEncaminharOpen] = useState(false);
  const chatActionFn = useServerFn(handleChatAction);
  const moveStageFn = useServerFn(applyStageMovement);
  const [tab, setTab] = useState("dados");
  const [editValor, setEditValor] = useState(false);
  const [funilOpen, setFunilOpen] = useState(false);
  const [aiAnalyzerOpen, setAiAnalyzerOpen] = useState(false);
  const [crmCopilotOpen, setCrmCopilotOpen] = useState(false);
  const [crmCopilotPrompt, setCrmCopilotPrompt] = useState<string | null>(null);
  const [pipelines, setPipelines] = useState<{ id: string; nome: string; tipo: string | null }[]>([]);
  const [allStages, setAllStages] = useState<{ id: string; nome: string; cor: string; pipeline_id: string | null; ordem: number | null }[]>([]);
  const [itens, setItens] = useState<{ id: string; nome: string; tipo: string | null }[]>([]);
  useEffect(() => { setLocal(card as any); setTab("dados"); }, [card.id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from("produto").select("id,nome,tipo").eq("company_id", companyId).order("nome");
      if (!cancelled) setItens((data ?? []) as any);
    })();
    return () => { cancelled = true; };
  }, [companyId]);


  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [p, s, c] = await Promise.all([
        supabase.from("crm_pipeline").select("id,nome,tipo,ordem").eq("company_id", companyId).order("ordem", { ascending: true }),
        supabase.from("crm_stage").select("id,nome,cor,pipeline_id,ordem").eq("company_id", companyId).order("ordem", { ascending: true }),
        // Busca a linha COMPLETA: a lista de conversas entrega apenas algumas
        // colunas, o que fazia os campos do detalhe aparecerem vazios.
        supabase.from("crm_cards").select("*").eq("id", card.id).maybeSingle(),
      ]);
      if (cancelled) return;
      setPipelines((p.data ?? []) as any);
      setAllStages((s.data ?? []) as any);
      if (c.data) setLocal((prev) => ({ ...prev, ...(c.data as any) }));
    })();
    return () => { cancelled = true; };
  }, [card.id, companyId]);


  const currentPipelineId = local.pipeline_id
    ?? allStages.find((s) => s.id === local.stage_id)?.pipeline_id
    ?? null;
  const pipelineStages = currentPipelineId
    ? allStages.filter((s) => s.pipeline_id === currentPipelineId)
    : stages;

  function set<K extends keyof LeadCard>(k: K, v: LeadCard[K]) {
    setLocal((p) => ({ ...p, [k]: v }));
  }

  function changePipeline(pid: string) {
    const firstStage = allStages.find((s) => s.pipeline_id === pid);
    setLocal((p) => ({ ...p, pipeline_id: pid, stage_id: firstStage?.id ?? null, status: firstStage?.nome ?? p.status }));
  }

  async function save() {
    const stage = allStages.find((s) => s.id === local.stage_id) ?? stages.find((s) => s.id === local.stage_id);
    const pid = currentPipelineId;

    const payload: any = {
      nome: local.nome,
      valor: local.valor ?? 0,
      stage_id: local.stage_id,
      pipeline_id: pid,
      status: stage?.nome ?? local.status,
      origem: local.origem,
      owner_id: local.owner_id || null, // Explicitly set to null if empty
      proxima_acao: local.proxima_acao,
      email: local.email || null,
      cpf_cnpj: local.cpf_cnpj || null,
      endereco: local.endereco || null,
      empresa: local.empresa || null,
      tipo_contato: local.tipo_contato || null,
    };

    // Alguns campos podem não existir na base de contas antigas — nesse caso
    // removemos a coluna citada no erro e tentamos novamente, em vez de
    // bloquear o salvamento inteiro.
    let error: any = null;
    for (let attempt = 0; attempt < 6; attempt++) {
      const res = await supabase.from("crm_cards").update(payload).eq("id", local.id);
      error = res.error;
      if (!error) break;
      const msg = `${error.message ?? ""} ${(error as any).details ?? ""}`;
      const col = Object.keys(payload).find((k) => msg.includes(`'${k}'`) || msg.includes(`"${k}"`) || msg.includes(` ${k} `));
      if (!col) break;
      delete payload[col];
      if (Object.keys(payload).length === 0) break;
    }

    if (error) {
      console.error("[save] Error updating card:", error);
      return toast.error(error.message || "Não foi possível salvar o lead");
    }

    // Mantém o nome do contato em sincronia com as Conversas
    if (local.nome && local.numero) {
      await supabase
        .from("mensagens")
        .update({ contato_nome: local.nome } as any)
        .eq("company_id", companyId)
        .eq("numero", local.numero);
    }
    await supabase.from("lead_evento").insert({
      company_id: companyId, card_id: local.id, tipo: "atualizacao", descricao: "Dados atualizados",
    });

    // Se houve mudança de etapa, usa applyStageMovement no servidor
    if (local.stage_id && local.stage_id !== card.stage_id) {
      try {
        await moveStageFn({ data: { cardId: local.id, stageId: local.stage_id, reason: "Etapa actualizada desde el detalle del lead" } });
      } catch (e) {
        console.error("[LeadDetails] Error moving stage:", e);
      }
    }

    toast.success("Lead atualizado");
    onChanged();
  }

  async function persist(patch: Record<string, any>, msg = "Alteração salva") {
    const { error } = await supabase.from("crm_cards").update(patch as any).eq("id", local.id);
    if (error) { toast.error(error.message || "Não foi possível salvar"); return false; }
    if (patch.nome && local.numero) {
      await supabase.from("mensagens").update({ contato_nome: patch.nome } as any)
        .eq("company_id", companyId).eq("numero", local.numero);
    }
    toast.success(msg);
    onChanged();
    return true;
  }

  const olistOn = useCapacidadeAtiva("olist");
  const cols = hideConversation
    ? (olistOn ? "grid-cols-6" : "grid-cols-5")
    : (olistOn ? "grid-cols-7" : "grid-cols-6");


  const currentPipeline = pipelines.find((p) => p.id === currentPipelineId);
  const currentStage = (allStages.length ? allStages : stages).find((s) => s.id === local.stage_id);
  const owner = members.find((m) => m.user_id === local.owner_id);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      {/* Valor da oportunidade + Funil / Etapa */}
      <div className={`grid gap-2.5 ${operationalMode ? "" : "sm:grid-cols-2"}`}>
        {!operationalMode && <div className="flex items-center gap-2.5 rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-2.5 py-2">
          <span className="grid size-8 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
            <DollarSign className="size-3.5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] leading-tight text-muted-foreground">Valor da oportunidade</div>
            <div className="flex items-center gap-1">
              <span className="text-[13px] font-bold">R$</span>
              <input
                type="text"
                inputMode="decimal"
                readOnly={!editValor}
                value={new Intl.NumberFormat(localeCode || "es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(local.valor ?? 0))}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, "");
                  set("valor", digits ? Number(digits) / 100 : 0);
                }}
                className="w-full bg-transparent text-[15px] font-bold outline-none"
              />
            </div>
          </div>
          <button
            type="button"
            className={`shrink-0 ${editValor ? "text-primary" : "text-muted-foreground hover:text-primary"}`}
            aria-label={editValor ? "Salvar valor" : "Editar valor"}
            onClick={async () => {
              if (!editValor) return setEditValor(true);
              setEditValor(false);
              await persist({ valor: local.valor ?? 0 }, "Valor atualizado");
            }}
          >
            {editValor ? <Check className="size-4" /> : <Pencil className="size-3.5" />}
          </button>
        </div>}

        <Popover open={funilOpen} onOpenChange={setFunilOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2.5 text-left hover:border-primary/40"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
                <Filter className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[11px] leading-tight text-muted-foreground">Funil / Etapa</span>
                <span className="block truncate text-sm font-semibold">
                  {currentPipeline?.nome ?? "Funil"} • {currentStage?.nome ?? "Selecionar"}
                </span>
              </span>
              <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
            </button>
          </PopoverTrigger>

          <PopoverContent align="end" className="w-72 space-y-3">
            {pipelines.length > 0 && (
              <div className="space-y-1.5">
                <Label>Funil</Label>
                <Select value={currentPipelineId ?? ""} onValueChange={changePipeline}>
                  <SelectTrigger><SelectValue placeholder="Selecionar funil" /></SelectTrigger>
                  <SelectContent>
                    {pipelines.map((p) => <SelectItem key={p.id} value={p.id}>{translateDefaultPipelineName(p.nome)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Etapa</Label>
              <Select value={local.stage_id ?? ""} onValueChange={(v) => set("stage_id", v)}>
                <SelectTrigger><SelectValue placeholder="Selecionar etapa" /></SelectTrigger>
                <SelectContent>
                  {pipelineStages.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      <span className="inline-flex items-center gap-2"><span className="size-2 rounded-full" style={{ background: s.cor }} />{translateDefaultStageName(s.nome)}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              className="h-9 w-full"
              onClick={async () => {
                if (!local.stage_id) return;
                try {
                  await moveStageFn({ data: { cardId: local.id, stageId: local.stage_id, reason: "Cambio de etapa desde cabecera del lead" } });
                  toast.success(t("crm.stage_updated", undefined, "Funil / etapa atualizados"));
                  setFunilOpen(false);
                  onChanged();
                } catch (err: any) {
                  toast.error(err?.message || "Error al mover etapa");
                }
              }}
            >
              <Save className="size-4 mr-2" /> {t("crm.save_pipeline_stage", undefined, "Salvar funil / etapa")}
            </Button>
          </PopoverContent>
        </Popover>
      </div>

      {/* Botón Auditor / Analista de Negociación con IA */}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setAiAnalyzerOpen(true)}
        className="w-full h-9 rounded-lg border-primary/30 bg-primary/5 hover:bg-primary/10 text-primary font-medium gap-2 shadow-sm transition"
      >
        <Sparkles className="size-4 shrink-0" />
        <span>{t("crm.audit_lead", undefined, "Auditar Lead con IA (Diagnóstico & Etapa)")}</span>
      </Button>

      {/* Banner de recomendación de IA guardada */}
      {(() => {
        const diag = (local as any).campos_extras?.ultimo_diagnostico_ia;
        if (diag?.etapa_sugerida_id && diag.etapa_sugerida_id !== local.stage_id) {
          return (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-800 dark:text-amber-300">
                  <Sparkles className="size-3.5 shrink-0 text-amber-600 animate-pulse" />
                  <span>{t("crm.ai_recommends_stage", undefined, "Recomendación de Etapa por IA")}:</span>
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-800 dark:text-amber-200">
                  {diag.intencao || "AUDITORÍA"}
                </span>
              </div>
              <p className="text-xs text-foreground/80 leading-relaxed">
                {diag.justificativa || diag.resumo}
              </p>
              <div className="pt-1 flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-foreground">
                  ➔ {diag.etapa_sugerida_nome}
                </span>
                <div className="flex items-center gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs border-amber-500/30 text-amber-800 dark:text-amber-200 hover:bg-amber-500/20 font-medium gap-1"
                    onClick={() => {
                      setCrmCopilotPrompt(
                        `Hola Copilot, la IA analizó al lead "${local.nome || local.numero}" y recomendó moverlo a "${diag.etapa_sugerida_nome}". Justificación: "${diag.justificativa || diag.resumo}". ¿Cómo deberíamos afinar las reglas de esta etapa en el embudo?`
                      );
                      setCrmCopilotOpen(true);
                    }}
                  >
                    <Sparkles className="size-3 text-amber-600" />
                    {t("crm.consult_copilot", undefined, "Consultar Copilot")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="h-7 text-xs bg-amber-600 hover:bg-amber-700 text-white font-medium"
                    onClick={async () => {
                      try {
                        await moveStageFn({
                          data: {
                            cardId: local.id,
                            stageId: diag.etapa_sugerida_id,
                            reason: `Movido a "${diag.etapa_sugerida_nome}" por confirmación humana de recomendación IA`,
                          },
                        });
                        setLocal((prev: any) => ({ ...prev, stage_id: diag.etapa_sugerida_id }));
                        toast.success(t("crm.stage_moved_success", { name: diag.etapa_sugerida_nome }, `Movido a "${diag.etapa_sugerida_nome}"`));
                        onChanged();
                      } catch (err: any) {
                        toast.error(err?.message || "Error al mover lead");
                      }
                    }}
                  >
                    <Check className="size-3.5 mr-1" />
                    {t("crm.confirm_and_move", undefined, "Confirmar y mover")}
                  </Button>
                </div>
              </div>
            </div>
          );
        }
        return null;
      })()}

      <LeadAiAnalyzerDialog
        cardId={local.id}
        leadName={local.nome || local.numero}
        currentStageName={currentStage?.nome || "Etapa actual"}
        open={aiAnalyzerOpen}
        onOpenChange={setAiAnalyzerOpen}
        initialDiagnostic={(local as any).campos_extras?.ultimo_diagnostico_ia}
        initialAnalyzedAt={(local as any).ultimo_analise_ia_em || (local as any).campos_extras?.ultimo_analise_ia_em}
        onStageChanged={(newStageId) => {
          setLocal((prev: any) => ({ ...prev, stage_id: newStageId }));
          onChanged();
        }}
        onOpenCopilotWithPrompt={(prompt) => {
          setCrmCopilotPrompt(prompt);
          setCrmCopilotOpen(true);
        }}
      />

      <CrmCopilotSheet
        open={crmCopilotOpen}
        onOpenChange={setCrmCopilotOpen}
        pipelineId={currentPipelineId}
        pipelineName={pipelines.find((p) => p.id === currentPipelineId)?.nome}
        cardId={local.id}
        leadName={local.nome || local.numero}
        initialPrompt={crmCopilotPrompt}
        onStageUpdated={onChanged}
        onLeadMoved={onChanged}
      />

      <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
        <TabsList className={`grid ${cols} w-full shrink-0`}>
          <TabsTrigger value="dados">{t("crm.tabs.data", undefined, "Dados")}</TabsTrigger>
          <TabsTrigger value="midia">{t("crm.tabs.media", undefined, "Mídia")}</TabsTrigger>
          {!hideConversation && <TabsTrigger value="conversa">{t("crm.tabs.conversation", undefined, "Conversa")}</TabsTrigger>}
          <TabsTrigger value="jornada">{t("crm.tabs.journey", undefined, "Jornada")}</TabsTrigger>
          <TabsTrigger value="notas">{t("crm.tabs.notes", undefined, "Notas")}</TabsTrigger>
          <TabsTrigger value="hist">{t("crm.tabs.history", undefined, "Histórico")}</TabsTrigger>
          {olistOn && <TabsTrigger value="pedidos">{t("crm.tabs.orders", undefined, "Pedidos")}</TabsTrigger>}
        </TabsList>

        {olistOn && (
          <TabsContent value="pedidos" className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
            <OlistPedidosTab nome={local.nome ?? ""} />
          </TabsContent>
        )}


        <TabsContent value="dados" className="space-y-2.5 mt-3 min-h-0 flex-1 overflow-y-auto pr-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="space-y-2">
            <SectionTitle>Classificação do contato</SectionTitle>
            <div className="grid grid-cols-3 gap-2">
              {CLASSIFICACOES.map(({ value, label, icon: Icon }) => {
                const activeCls = (local.tipo_contato ?? "lead") === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={async () => {
                      set("tipo_contato", value as any);
                      const patch: any = { tipo_contato: value };
                      if (value === "interno") { patch.stage_id = null; patch.pipeline_id = null; }
                      await persist(patch, `Contato classificado como ${label}`);
                      if (value === "interno") setLocal((p) => ({ ...p, stage_id: null, pipeline_id: null } as any));
                    }}
                    className={`flex items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-[10px] font-medium transition ${
                      activeCls
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-[var(--border)] bg-[var(--panel-2)] text-muted-foreground hover:border-primary/40"
                    }`}
                  >
                    <Icon className="size-3.5" />
                    <span className="text-center leading-tight">{label}</span>
                  </button>
                );
              })}
            </div>
            {local.tipo_contato === "interno" && (
              <p className="text-[10px] text-muted-foreground">Contatos internos não ocupam espaço no funil de vendas.</p>
            )}
          </div>

          <div className="space-y-2">
            <SectionTitle>Informações do contato</SectionTitle>
            <div className="overflow-hidden rounded-lg border border-[var(--border)] divide-y divide-[var(--border)]">

              <InfoRow icon={User} label="Nome" value={local.nome ?? ""} onChange={(v) => set("nome", v)} onCommit={() => persist({ nome: local.nome }, "Nome atualizado")} />
              <InfoRow icon={Mail} label="E-mail" value={local.email ?? ""} onChange={(v) => set("email", v)} onCommit={() => persist({ email: local.email || null }, "E-mail atualizado")} />
              <InfoRow icon={CreditCard} label="CPF/CNPJ" value={local.cpf_cnpj ?? ""} onChange={(v) => set("cpf_cnpj", v)} onCommit={() => persist({ cpf_cnpj: local.cpf_cnpj || null }, "CPF/CNPJ atualizado")} />
              <InfoRow icon={Building2} label="Empresa" value={local.empresa ?? ""} onChange={(v) => set("empresa", v)} onCommit={() => persist({ empresa: local.empresa || null }, "Empresa atualizada")} />
              <InfoRow icon={MapPin} label="Endereço" value={local.endereco ?? ""} onChange={(v) => set("endereco", v)} onCommit={() => persist({ endereco: local.endereco || null }, "Endereço atualizado")} />
              <InfoRow icon={Phone} label="Telefone" value={local.numero} readOnly copy />
              <InfoRow
                icon={UserCheck}
                label="Dono do lead"
                value={owner?.nome || owner?.email || ""}
                onCommit={() => persist({ owner_id: local.owner_id || null }, "Dono atualizado")}
                editor={
                  <Select value={local.owner_id ?? "_none"} onValueChange={(v) => set("owner_id", v === "_none" ? null : v)}>
                    <SelectTrigger className="h-8"><SelectValue placeholder="Sem dono" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">Sem dono</SelectItem>
                      {members.map((m) => (
                        <SelectItem key={m.user_id} value={m.user_id}>{m.nome || m.email || "Usuário sem nome"}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                }
              />
              <InfoRow
                icon={Target}
                label="Próxima ação"
                value={local.proxima_acao ?? ""}
                onCommit={() => persist({ proxima_acao: local.proxima_acao || null }, "Próxima ação atualizada")}
                editor={
                  <Input
                    value={local.proxima_acao ?? ""}
                    onChange={(e) => set("proxima_acao", e.target.value)}
                    placeholder="Ex.: Enviar proposta até quinta-feira"
                    className="h-8"
                  />
                }
              />
              <InfoRow
                icon={Share2}
                label="Origem"
                value={local.origem ?? ""}
                onCommit={() => persist({ origem: local.origem || null }, "Origem atualizada")}
                editor={<OrigemPicker companyId={companyId} value={local.origem ?? ""} onChange={(v) => set("origem", v)} hideLabel />}
              />
              <InfoRow
                icon={Package}
                label="Produto / serviço"
                value={(local as any).item_nome ?? ""}
                onCommit={() => persist(
                  {
                    item_id: (local as any).item_id || null,
                    item_tipo: (local as any).item_tipo || null,
                    item_nome: (local as any).item_nome || null,
                  },
                  "Produto / serviço atualizado",
                )}
                editor={
                  <Select
                    value={(local as any).item_id ?? "_none"}
                    onValueChange={(v) => {
                      if (v === "_none") {
                        setLocal((p) => ({ ...p, item_id: null, item_tipo: null, item_nome: null } as any));
                        return;
                      }
                      const it = itens.find((i) => i.id === v);
                      setLocal((p) => ({ ...p, item_id: v, item_tipo: it?.tipo ?? "produto", item_nome: it?.nome ?? null } as any));
                    }}
                  >
                    <SelectTrigger className="h-8"><SelectValue placeholder="Nenhum" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">Nenhum</SelectItem>
                      {itens.map((i) => (
                        <SelectItem key={i.id} value={i.id}>
                          {i.nome} {i.tipo === "servico" ? "(serviço)" : "(produto)"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                }
              />
            </div>
          </div>

          {/* Rastreamento e Atribuição Meta Ads / Conversions API */}
          <LeadAdReferralCard card={local} onConversionSent={onChanged} />

          {/* Sevcon: esconde a seção de respostas do formulário no detalhe do lead */}
          {!operationalMode && (
            <CamposExtrasSection
              cardId={local.id}
              respostas={((local as any).campos_extras?.respostas ?? []) as RespostaExtra[]}
              outros={(local as any).campos_extras ?? {}}
              onChanged={(lista) => {
                setLocal((p: any) => ({ ...p, campos_extras: { ...(p.campos_extras ?? {}), respostas: lista } }));
                onChanged();
              }}
            />
          )}

          <CamposPersonalizadosSection
            cardId={local.id}
            campos={((local as any).campos_extras?.personalizados ?? []) as RespostaExtra[]}
            outros={(local as any).campos_extras ?? {}}
            onChanged={(lista) => {
              setLocal((p: any) => ({ ...p, campos_extras: { ...(p.campos_extras ?? {}), personalizados: lista } }));
              onChanged();
            }}
          />

          <Button onClick={save} className="w-full h-9"><Save className="size-4 mr-2" />Salvar alterações</Button>

          <EncaminharDialog
            open={encaminharOpen}
            onOpenChange={setEncaminharOpen}
            numero={local.numero}
            onDone={(r) => {
              setLocal((p: any) => ({
                ...p,
                department_id: r.department_id,
                stage_id: r.stage_id ?? p.stage_id,
                owner_id: r.owner_id,
              }));
            }}
          />


          <Button
            variant="outline"
            className="w-full h-9 text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30"
            onClick={async () => {
              if (!local.id) return toast.error("Lead sem identificador válido");
              if (!confirm(`Deseja apagar a conversa do lead "${local.nome || local.numero}" apenas no sistema Capi Conversa?\n\nIsso removerá as mensagens e o card da lista de conversas, mas não afetará o seu celular.`)) return;

              const { error } = await supabase
                .from("mensagens")
                .delete()
                .eq("company_id", companyId)
                .eq("numero", local.numero);

              const { error: cardError } = await supabase
                .from("crm_cards")
                .delete()
                .eq("id", local.id);

              if (error || cardError) return toast.error("Erro ao apagar dados: " + (error?.message || cardError?.message));

              toast.success("Conversa removida do sistema");
              onChanged();
              if (onDeleted) onDeleted();
            }}
          >
            <Trash2 className="size-4 mr-2" /> Remover do sistema
          </Button>

          <OrigemBlock cardId={local.id} />
        </TabsContent>

        <TabsContent value="midia" className="mt-3 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden">
          <ConversationMediaTab numero={local.numero} contatoNome={local.nome} />
        </TabsContent>


      {!hideConversation && (
        <TabsContent value="conversa" className="mt-4 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden">
          <ConversaTab numero={local.numero} companyId={companyId} cardId={card.id} />
        </TabsContent>
      )}

      <TabsContent value="jornada" className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <JornadaTab cardId={local.id} />
      </TabsContent>

      <TabsContent value="notas" className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <NotasTab cardId={local.id} companyId={companyId} />
      </TabsContent>

        <TabsContent value="hist" className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <HistTab cardId={local.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

const CLASSIFICACOES = [
  { value: "lead", label: "Lead / Oportunidade", icon: Target },
  { value: "interno", label: "Contato interno", icon: User },
  { value: "cliente", label: "Cliente", icon: Star },
] as const;


function InfoRow({
  icon: Icon, label, value, onChange, onCommit, editor, readOnly, copy, placeholder,
}: {
  icon: any; label: string; value: string;
  onChange?: (v: string) => void;
  onCommit?: () => void | Promise<any>;
  editor?: React.ReactNode;
  readOnly?: boolean; copy?: boolean; placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);
  const v = (value ?? "").trim();

  async function commit() {
    setEditing(false);
    await onCommit?.();
  }

  return (
    <div className="flex items-center gap-2.5 bg-[var(--panel)] px-2.5 py-1">
      <span className="grid size-6 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
        <Icon className="size-3" />
      </span>
      <span className="w-[68px] shrink-0 truncate text-[11px] text-muted-foreground sm:w-20">{label}</span>
      <div className={`min-w-0 flex-1 ${editing && !readOnly ? "text-left" : "text-right"}`}>
        {editing && !readOnly ? (
          editor ?? (
            <Input
              autoFocus
              className="h-8 w-full rounded-md text-[13px]"
              value={value}
              placeholder={placeholder}
              onChange={(e) => onChange?.(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void commit(); if (e.key === "Escape") setEditing(false); }}
            />
          )
        ) : (
          <span className={`block truncate text-[13px] ${v ? "" : "text-muted-foreground/60"}`}>{v || placeholder || "—"}</span>
        )}
      </div>

      {readOnly ? (
        copy && v ? (
          <button
            type="button"
            className="shrink-0 text-muted-foreground hover:text-foreground"
            onClick={() => { navigator.clipboard.writeText(v); toast.success("Copiado"); }}
          >
            <Copy className="size-3.5" />
          </button>
        ) : null
      ) : editing ? (
        <button
          type="button"
          className="shrink-0 text-primary hover:opacity-80"
          onClick={() => void commit()}
          aria-label={`Salvar ${label}`}
        >
          <Check className="size-4" />
        </button>
      ) : (
        <button
          type="button"
          className="shrink-0 text-muted-foreground hover:text-primary"
          onClick={() => setEditing(true)}
          aria-label={`Editar ${label}`}
        >
          <Pencil className="size-3.5" />
        </button>
      )}
    </div>
  );
}


function Field({ label, value, onChange, type }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function dayLabel(iso: string) {
  const d = new Date(iso);
  const hoje = new Date();
  const ontem = new Date(); ontem.setDate(hoje.getDate() - 1);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(d, hoje)) return "Hoje";
  if (same(d, ontem)) return "Ontem";
  return formatDate(d, { day: "2-digit", month: "long", year: d.getFullYear() === hoje.getFullYear() ? undefined : "numeric" });
}

function autorLabel(m: any) {
  if (m.direcao === "entrada") return "Cliente";
  if (m.autor === "ia") return "Agente IA";
  if (m.autor === "automacao") return "Automação da etapa";
  if (m.autor === "api" || m.autor === "sistema") return "Sistema";
  return "Atendente";
}

function linkify(texto: string) {
  const parts = String(texto).split(/(https?:\/\/[^\s]+)/g);
  return parts.map((p, i) =>
    /^https?:\/\//.test(p)
      ? <a key={i} href={p} target="_blank" rel="noreferrer" className="underline text-[var(--brand-text)] break-all">{p}</a>
      : <span key={i}>{p}</span>,
  );
}

function MediaBubble({ m }: { m: any }) {
  const tipo = String(m.midia_tipo || m.midia_mime || "").toLowerCase();
  const url = m.midia_url as string | null;
  if (!url) return null;
  if (tipo.includes("image") || tipo.includes("imagem")) {
    return <a href={url} target="_blank" rel="noreferrer"><img src={url} alt={m.midia_nome || "Imagem"} className="rounded-lg max-h-48 object-cover" loading="lazy" /></a>;
  }
  if (tipo.includes("audio") || tipo.includes("ptt")) {
    return <audio controls src={url} className="w-56 max-w-full" />;
  }
  if (tipo.includes("video")) {
    return <video controls src={url} className="rounded-lg max-h-48 w-full" />;
  }
  return (
    <a href={url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-[var(--brand-text)] underline break-all">
      <Package className="size-4 shrink-0" />{m.midia_nome || "Arquivo"}
    </a>
  );
}

function ConversaTab({ numero, companyId, cardId }: { numero: string; companyId: string; cardId: string }) {
  const [msgs, setMsgs] = useState<any[]>([]);
  const [limit, setLimit] = useState(60);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [analises, setAnalises] = useState<{ id: string; texto: string; created_at: string }[]>([]);
  const [view, setView] = useState<"mensagens" | "analises">("mensagens");
  const [analisando, setAnalisando] = useState(false);
  const [openAnaliseId, setOpenAnaliseId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const initialScrollDone = useRef(false);
  const analyzeFn = useServerFn(analyzeLeadConversation);

  async function loadAnalises(): Promise<{ id: string; texto: string; created_at: string }[]> {
    const { data } = await supabase.from("lead_nota")
      .select("id,texto,created_at")
      .eq("card_id", cardId)
      .like("texto", "🧠 Análise da conversa (IA)%")
      .order("created_at", { ascending: false })
      .limit(20);
    const lista = (data ?? []).map((n: any) => ({
      id: n.id,
      created_at: n.created_at,
      texto: String(n.texto || "").replace(/^🧠 Análise da conversa \(IA\)\s*/u, "").trim(),
    }));
    setAnalises(lista);
    return lista;
  }

  useEffect(() => {
    initialScrollDone.current = false;
    setView("mensagens");
    setAnalises([]);
    setOpenAnaliseId(null);
    void loadAnalises();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardId]);

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      const { data, count } = await supabase.from("mensagens")
        .select("*", { count: "exact" })
        .eq("company_id", companyId).eq("numero", numero)
        .order("created_at", { ascending: false }).limit(limit);
      if (cancel) return;
      setMsgs((data ?? []).slice().reverse());
      setTotal(count ?? (data ?? []).length);
      setLoading(false);
    })();
    return () => { cancel = true; };
  }, [numero, companyId, limit]);

  useEffect(() => {
    if (loading || initialScrollDone.current || msgs.length === 0 || view !== "mensagens") return;
    const frame = requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
      initialScrollDone.current = true;
    });
    return () => cancelAnimationFrame(frame);
  }, [loading, msgs, view]);

  async function analisar() {
    try {
      setAnalisando(true);
      await analyzeFn({ data: { cardId, companyId, numero } });
      const lista = await loadAnalises();
      setOpenAnaliseId(lista[0]?.id ?? null);
      setView("analises");
      toast.success("Análise gerada e salva.");
    } catch (err: any) {
      toast.error(err?.message || "Não foi possível analisar a conversa.");
    } finally {
      setAnalisando(false);
    }
  }

  const ultima = msgs[msgs.length - 1]?.created_at;
  const recebidas = msgs.filter((m) => m.direcao === "entrada").length;
  const enviadas = msgs.length - recebidas;

  let lastDay = "";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2.5">
      <div className="grid min-w-0 shrink-0 grid-cols-2 gap-x-3 gap-y-1 rounded-lg border border-[var(--border)] bg-[var(--panel-2)] p-2.5 text-[11px] text-muted-foreground sm:grid-cols-4">
        <span className="truncate">Mensagens: <b className="text-foreground">{total}</b></span>
        <span className="truncate">Cliente: <b className="text-foreground">{recebidas}</b></span>
        <span className="truncate">Equipe: <b className="text-foreground">{enviadas}</b></span>
        {ultima && <span className="truncate">Última: <b className="text-foreground">{formatDate(ultima, { day: "2-digit", month: "2-digit" })} {formatTime(ultima, { hour: "2-digit", minute: "2-digit" })}</b></span>}
      </div>


      <div className="flex shrink-0 items-center gap-1 rounded-lg bg-[var(--panel-2)] p-1">
        <button
          type="button"
          onClick={() => setView("mensagens")}
          className={`flex-1 rounded-md px-2 py-1.5 text-[12px] font-medium transition ${view === "mensagens" ? "bg-[var(--panel)] text-foreground shadow-sm" : "text-muted-foreground"}`}
        >Mensagens</button>
        <button
          type="button"
          onClick={() => setView("analises")}
          className={`flex-1 rounded-md px-2 py-1.5 text-[12px] font-medium transition ${view === "analises" ? "bg-[var(--panel)] text-foreground shadow-sm" : "text-muted-foreground"}`}
        >Análises{analises.length > 0 ? ` (${analises.length})` : ""}</button>
      </div>

      {view === "mensagens" ? (
        <div className="flex min-h-0 flex-1 flex-col">
          {total > msgs.length && (
            <div className="shrink-0 text-center">
              <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => setLimit((l) => l + 100)}>Carregar mensagens anteriores</Button>
            </div>
          )}
          <div ref={scrollRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto p-1 scroll-smooth">
            {loading && <div className="text-sm text-muted-foreground text-center py-6">Carregando…</div>}
            {!loading && msgs.length === 0 && <div className="text-sm text-muted-foreground text-center py-6">Sem mensagens.</div>}
            {msgs.map((m) => {
              const d = dayLabel(m.created_at);
              const showDay = d !== lastDay;
              lastDay = d;
              const saida = m.direcao === "saida";
              return (
                <div key={m.id}>
                  {showDay && (
                    <div className="flex items-center gap-2 my-3">
                      <div className="h-px flex-1 bg-[var(--border)]" />
                      <span className="text-[10.5px] uppercase tracking-wide text-muted-foreground">{d}</span>
                      <div className="h-px flex-1 bg-[var(--border)]" />
                    </div>
                  )}
                  <div className={`flex ${saida ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm space-y-1 ${saida ? "bg-[var(--brand)]/15 text-foreground" : "bg-[var(--panel-2)]"}`}>
                      <div className="text-[10px] uppercase opacity-60">{autorLabel(m)}</div>
                      <MediaBubble m={m} />
                      {m.texto && <FormattedMessageText text={m.texto} isOut={saida} />}
                      <div className="text-[10px] opacity-60 text-right tabular-nums">
                        {formatTime(m.created_at, { hour: "2-digit", minute: "2-digit" })}
                        {saida && m.status_envio && m.status_envio !== "enviado" ? ` • ${m.status_envio}` : ""}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-1">
          {analises.length === 0 && (
            <div className="py-10 text-center text-sm text-muted-foreground">
              Nenhuma análise ainda.<br />Use “Analisar conversa” abaixo.
            </div>
          )}
          {analises.map((a) => {
            const aberta = openAnaliseId === a.id;
            const dt = new Date(a.created_at);
            return (
              <div key={a.id} className="rounded-lg border border-[var(--border)] bg-[var(--panel-2)]">
                <button
                  type="button"
                  onClick={() => setOpenAnaliseId(aberta ? null : a.id)}
                  className="flex w-full items-center gap-2 p-3 text-left"
                >
                  <Sparkles className="size-3.5 shrink-0 text-primary" />
                  <span className="flex-1 truncate text-[12px] font-medium text-foreground">
                    Análise feita em {formatDate(dt)} às {formatTime(dt, { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  {aberta ? <ChevronUp className="size-4 shrink-0 text-muted-foreground" /> : <ChevronDown className="size-4 shrink-0 text-muted-foreground" />}
                </button>
                {aberta && (
                  <div className="whitespace-pre-wrap border-t border-[var(--border)] p-3 text-[12.5px] leading-relaxed text-foreground">{a.texto}</div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="grid shrink-0 grid-cols-2 gap-2 border-t border-[var(--border)] pt-2.5">
        <Button
          size="sm"
          variant="outline"
          className="h-9 text-[12px]"
          onClick={() => { window.location.href = `/app/conversas?n=${encodeURIComponent(numero)}`; }}
        >
          <Send className="mr-1.5 size-3.5" />
          Abrir conversa
        </Button>
        <Button
          size="sm"
          className="h-9 text-[12px]"
          onClick={() => void analisar()}
          disabled={analisando || msgs.length === 0}
        >
          {analisando ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : <Sparkles className="mr-1.5 size-3.5" />}
          Analisar conversa
        </Button>
      </div>
    </div>
  );
}

function NotasTab({ cardId, companyId }: { cardId: string; companyId: string }) {
  const [notas, setNotas] = useState<any[]>([]);
  const [texto, setTexto] = useState("");
  const [busy, setBusy] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const generateSummaryFn = useServerFn(requestLeadSummary);

  async function generateAiSummary() {
    try {
      setSummarizing(true);
      const leadNumero = (await supabase.from("crm_cards").select("numero").eq("id", cardId).maybeSingle()).data?.numero;
      if (!leadNumero) throw new Error("Número do lead não encontrado");

      await generateSummaryFn({ data: { cardId, companyId, numero: leadNumero } });
      toast.success("Resumo gerado com sucesso!");
      reload();
    } catch (err: any) {
      toast.error(err.message || "Erro ao gerar resumo");
    } finally {
      setSummarizing(false);
    }
  }
  async function reload() {
    const { data } = await supabase.from("lead_nota").select("*").eq("card_id", cardId).order("created_at", { ascending: false });
    setNotas(data ?? []);
  }
  useEffect(() => { void reload(); }, [cardId]);
  async function add() {
    if (!texto.trim()) return;
    setBusy(true);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("lead_nota").insert({
      company_id: companyId, card_id: cardId, autor_id: u.user?.id ?? null, texto: texto.trim(),
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    setTexto(""); reload();
  }
  async function del(id: string) {
    await supabase.from("lead_nota").delete().eq("id", id);
    reload();
  }
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={2} placeholder="Adicionar nota interna…" />
        <Button onClick={add} disabled={busy}><Send className="size-4" /></Button>
        <Button 
          variant="outline" 
          onClick={generateAiSummary} 
          disabled={summarizing}
          title="Gerar resumo da conversa com IA"
          className="border-primary/30 text-primary hover:bg-primary/5"
        >
          {summarizing ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
        </Button>
      </div>
      <ul className="space-y-2">
        {notas.map((n) => (
          <li key={n.id} className="rounded-xl border border-[var(--border)] bg-[var(--panel-2)] p-3 text-sm">
            <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
              <span>{formatDate(n.created_at)} {formatTime(n.created_at)}</span>
              <button onClick={() => del(n.id)} className="hover:text-destructive"><Trash2 className="size-3.5" /></button>
            </div>
            <div className="whitespace-pre-wrap">{n.texto}</div>
          </li>
        ))}
        {notas.length === 0 && <li className="text-sm text-muted-foreground text-center py-4">Sem notas.</li>}
      </ul>
    </div>
  );
}

function HistTab({ cardId }: { cardId: string }) {
  const [evs, setEvs] = useState<any[]>([]);
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("lead_evento").select("*").eq("card_id", cardId).order("created_at", { ascending: false });
      setEvs(data ?? []);
    })();
  }, [cardId]);
  return (
    <ul className="space-y-2">
      {evs.length === 0 && <li className="text-sm text-muted-foreground text-center py-6">Sem eventos.</li>}
      {evs.map((e) => (
        <li key={e.id} className="rounded-xl border border-[var(--border)] bg-[var(--panel-2)] p-3 text-sm">
          <div className="text-[11px] text-muted-foreground mb-1">{formatDate(e.created_at)} {formatTime(e.created_at)}</div>
          <div><b className="text-[var(--brand-text)]">{e.tipo}</b> — {e.descricao}</div>
        </li>
      ))}
    </ul>
  );
}





/* ========== Resumo do lead ========== */
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </div>
  );
}

function ResumoItem({ label, value, copy }: { label: string; value?: string | null; copy?: boolean }) {
  const v = (value ?? "").trim();
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="flex items-center gap-1 min-w-0">
        <span className={`truncate text-sm ${v ? "" : "text-muted-foreground/60"}`}>{v || "—"}</span>
        {v && copy && (
          <button
            type="button"
            className="shrink-0 text-muted-foreground hover:text-foreground"
            onClick={() => { navigator.clipboard.writeText(v); toast.success("Copiado"); }}
          >
            <Copy className="size-3" />
          </button>
        )}
      </div>
    </div>
  );
}

function LeadResumo({
  card, stages, members,
}: { card: LeadCard; stages: { id: string; nome: string; cor: string }[]; members: Member[] }) {
  const stage = stages.find((s) => s.id === card.stage_id);
  const owner = members.find((m) => m.user_id === card.owner_id);
  const valor = Number(card.valor ?? 0);
  const preenchidos = ["nome", "email", "cpf_cnpj", "empresa", "endereco"].filter(
    (k) => String((card as any)[k] ?? "").trim(),
  ).length;

  return (
    <div className="rounded-lg border border-[var(--border)] bg-muted/30 p-3 space-y-3">
      <div className="flex items-center gap-3">
        <InitialsAvatar name={card.nome || card.numero} src={card.foto_url} size={40} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{card.nome || card.numero}</div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground font-mono">
            <span className="truncate">{card.numero}</span>
            <button
              type="button"
              className="hover:text-foreground"
              onClick={() => { navigator.clipboard.writeText(card.numero); toast.success("Número copiado"); }}
            >
              <Copy className="size-3" />
            </button>
          </div>
        </div>
        {stage && (
          <span
            className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium"
            style={{ background: `${stage.cor}22`, color: stage.cor }}
          >
            {translateDefaultStageName(stage.nome)}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-2">
        <ResumoItem label="E-mail" value={card.email} copy />
        <ResumoItem label="CPF/CNPJ" value={card.cpf_cnpj} copy />
        <ResumoItem label="Empresa" value={card.empresa} />
        <ResumoItem label="Endereço" value={card.endereco} />
        <ResumoItem label="Valor" value={valor ? formatCurrency(valor) : ""} />
        <ResumoItem label="Dono" value={owner?.nome || owner?.email || ""} />
        <ResumoItem label="Origem" value={card.origem} />
        <ResumoItem
          label="Último contato"
          value={card.ultima_em ? `${formatDate(card.ultima_em, { dateStyle: "short" })} ${formatTime(card.ultima_em, { timeStyle: "short" })}` : ""}
        />
      </div>

      {(card.tags?.length ?? 0) > 0 && (
        <div className="flex flex-wrap gap-1">
          {card.tags!.map((t) => (
            <span key={t} className="rounded-full bg-primary/10 text-primary px-2 py-0.5 text-[11px]">{t}</span>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(preenchidos / 5) * 100}%` }} />
        </div>
        <span className="text-[11px] text-muted-foreground">{preenchidos}/5 dados</span>
      </div>
    </div>
  );
}

/* ========== TagsPicker: catálogo persistente por empresa ========== */



function useTagCatalog() {
  const listFn = useServerFn(listTags);
  const [catalog, setCatalog] = useState<CompanyTag[]>([]);
  useEffect(() => { (async () => { try { setCatalog(await listFn()); } catch {} })(); }, []);
  return catalog;
}


/* Chips de tag exibidos ao lado do nome do contato (multi-seleção) */
export function LeadTagsInline({
  cardId, tags, onChanged, compact = false,
}: { cardId: string; tags: string[]; onChanged?: () => void; compact?: boolean }) {
  const catalog = useTagCatalog();
  const [value, setValue] = useState<string[]>(tags ?? []);
  useEffect(() => { setValue(tags ?? []); }, [cardId, (tags ?? []).join("|")]);

  async function apply(next: string[]) {
    setValue(next);
    const { error } = await supabase.from("crm_cards").update({ tags: next }).eq("id", cardId);
    if (error) return toast.error("Não foi possível salvar as tags");
    onChanged?.();
  }

  const cor = (nome: string) => catalog.find((c) => c.nome === nome)?.cor || "#0B22FE";

  return (
    <div className={`flex flex-wrap items-center gap-1 ${compact ? "min-w-0" : ""}`}>
      {value.map((t) => (
        <span
          key={t}
          className="inline-flex max-w-28 items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold text-white"
          style={{ backgroundColor: cor(t) }}
        >
          <span className="truncate">{t}</span>
          <button type="button" onClick={() => apply(value.filter((x) => x !== t))} aria-label={`Remover ${t}`}>
            <XIcon className="size-2.5" />
          </button>
        </span>
      ))}
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="inline-flex shrink-0 items-center gap-1 rounded-md border border-dashed border-[var(--border)] px-1.5 py-0.5 text-[10px] text-muted-foreground hover:border-primary/50 hover:text-primary"
          >
            <TagIcon className="size-2.5" /> tag
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-56 p-2">
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Tags</div>
          <div className="flex flex-wrap gap-1">
            {catalog.length === 0 && <span className="text-xs text-muted-foreground">Nenhuma tag cadastrada</span>}
            {catalog.map((t) => {
              const on = value.includes(t.nome);
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => apply(on ? value.filter((x) => x !== t.nome) : [...value, t.nome])}
                  className={`rounded-md border px-2 py-1 text-[11px] font-medium transition ${on ? "border-transparent text-white" : "border-[var(--border)] text-muted-foreground hover:border-primary/40"}`}
                  style={on ? { backgroundColor: t.cor || "#0B22FE" } : undefined}
                >
                  {t.nome}
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}


/* ========== Origem (rastreio) ========== */
function OrigemBlock({ cardId }: { cardId: string }) {
  const [row, setRow] = useState<any>(null);
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("crm_cards")
        .select("canal_entrada, utm_source, utm_medium, utm_campaign, utm_term, utm_content, referrer, first_page, ctwa_clid, fbclid, gclid, primeiro_contato_em")
        .eq("id", cardId)
        .maybeSingle();
      setRow(data);
    })();
  }, [cardId]);
  if (!row) return null;
  const canal = (row.canal_entrada as CanalEntrada | null) ?? null;
  const items: Array<[string, string | null]> = [
    ["utm_source", row.utm_source],
    ["utm_medium", row.utm_medium],
    ["utm_campaign", row.utm_campaign],
    ["utm_term", row.utm_term],
    ["utm_content", row.utm_content],
    ["referrer", row.referrer],
    ["first_page", row.first_page],
    ["gclid", row.gclid],
    ["fbclid", row.fbclid],
    ["ctwa_clid", row.ctwa_clid],
  ];
  const hasAny = items.some(([, v]) => !!v) || canal;
  if (!hasAny) return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 text-[11px] text-muted-foreground">
      Sem dados de origem para este lead.
    </div>
  );
  const preenchidos = items.filter(([, v]) => !!v);
  return (
    <details className="group rounded-lg border border-[var(--border)] bg-[var(--panel-2)]">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2">
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Origem do lead</span>
        {canal && (
          <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10.5px] font-semibold"
            style={{ backgroundColor: `${CANAL_COLOR[canal]}22`, color: CANAL_COLOR[canal] }}>
            <span className="size-1.5 rounded-full" style={{ background: CANAL_COLOR[canal] }} />
            {CANAL_LABEL[canal]}
          </span>
        )}
        <span className="ml-auto text-[10.5px] text-muted-foreground">
          {preenchidos.length > 0 ? `${preenchidos.length} detalhes` : "detalhes"}
        </span>
        <ChevronDown className="size-3.5 shrink-0 text-muted-foreground transition group-open:rotate-180" />
      </summary>
      <ul className="space-y-1 border-t border-[var(--border)] px-3 py-2 text-[11.5px]">
        {preenchidos.map(([k, v]) => (
          <li key={k} className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground font-mono">{k}</span>
            <span className="flex min-w-0 items-center gap-1">
              <span className="truncate max-w-[200px]" title={v!}>{v}</span>
              <button onClick={() => { navigator.clipboard.writeText(v!); toast.success("Copiado"); }} className="opacity-60 hover:opacity-100">
                <Copy className="size-3" />
              </button>
            </span>
          </li>
        ))}
        {row.primeiro_contato_em && (
          <li className="flex justify-between border-t border-[var(--border)] pt-1 text-[10.5px] text-muted-foreground">
            <span>Primeiro contato</span>
            <span>{formatDate(row.primeiro_contato_em)} {formatTime(row.primeiro_contato_em)}</span>
          </li>
        )}
      </ul>
    </details>
  );
}

/* ========== Jornada (timeline de etapas) ========== */
function JornadaTab({ cardId }: { cardId: string }) {
  const fn = useServerFn(getCardStageHistory);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    (async () => {
      setLoading(true);
      try { setRows(await fn({ data: { cardId } })); } finally { setLoading(false); }
    })();
  }, [cardId]);
  if (loading) return <div className="text-sm text-muted-foreground text-center py-6">Carregando…</div>;
  if (rows.length === 0) return <div className="text-sm text-muted-foreground text-center py-6">Sem movimentações registradas.</div>;
  return (
    <ol className="relative border-l-2 border-[var(--border)] ml-3 space-y-4 pl-4">
      {rows.map((r) => (
        <li key={r.id} className="relative">
          <span className="absolute -left-[22px] top-1 size-3 rounded-full bg-[var(--brand)] ring-4 ring-[var(--panel)]" />
          <div className="rounded-xl border border-[var(--border)] bg-[var(--panel-2)] p-3">
            <div className="text-[11px] text-muted-foreground mb-1 flex items-center gap-1">
              <RouteIcon className="size-3" />
              {formatDate(r.created_at)} {formatTime(r.created_at)}
            </div>
            <div className="text-sm">
              {r.stage_from_nome ? (
                <>
                  <b>{r.stage_from_nome}</b> → <b className="text-[var(--brand-text)]">{r.stage_to_nome}</b>
                </>
              ) : (
                <>Entrou em <b className="text-[var(--brand-text)]">{r.stage_to_nome}</b></>
              )}
            </div>
            <div className="text-[11px] text-muted-foreground mt-1">
              {r.moved_by_nome ? `Por ${r.moved_by_nome}` : "Automação"}
              {r.tempo_na_etapa_seg != null && ` · ficou ${formatDur(r.tempo_na_etapa_seg)} na etapa anterior`}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

function formatDur(seg: number) {
  if (seg < 60) return `${seg}s`;
  if (seg < 3600) return `${Math.round(seg / 60)}min`;
  if (seg < 86400) return `${Math.round(seg / 3600)}h`;
  return `${Math.round(seg / 86400)}d`;
}

/* ========== OrigemPicker (presets + custom + criar nova) ========== */
const ORIGEM_PRESETS = [
  "WhatsApp", "Instagram", "Facebook", "Google", "Site",
  "Indicação", "Notificação", "TikTok", "YouTube", "E-mail",
  "Anúncio", "Landing Page", "Evento", "Outro",
];

function OrigemPicker({ companyId, value, onChange, hideLabel }: { companyId: string; value: string; onChange: (v: string) => void; hideLabel?: boolean }) {
  const [dbOrigens, setDbOrigens] = useState<string[]>([]);
  const [customOrigens, setCustomOrigens] = useState<string[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [novo, setNovo] = useState("");
  const storageKey = `metrix:origens:${companyId}`;

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) setCustomOrigens(JSON.parse(raw));
    } catch {}
    (async () => {
      const { data } = await supabase.from("crm_cards").select("origem").eq("company_id", companyId).not("origem", "is", null).limit(500);
      const uniq = Array.from(new Set(((data ?? []) as any[]).map((r) => (r.origem ?? "").trim()).filter(Boolean)));
      setDbOrigens(uniq);
    })();
  }, [companyId, storageKey]);

  const all = Array.from(new Set([...ORIGEM_PRESETS, ...customOrigens, ...dbOrigens, ...(value ? [value] : [])]));

  function addCustom() {
    const v = novo.trim();
    if (!v) return;
    const next = Array.from(new Set([...customOrigens, v]));
    setCustomOrigens(next);
    try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch {}
    onChange(v);
    setNovo("");
    setAddOpen(false);
  }

  return (
    <div className="space-y-1.5">
      {!hideLabel && <Label>Origem</Label>}
      {addOpen ? (
        <div className="flex gap-1.5">
          <Input autoFocus value={novo} onChange={(e) => setNovo(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustom(); } if (e.key === "Escape") setAddOpen(false); }}
            placeholder="Nova origem…" />
          <Button size="sm" onClick={addCustom} disabled={!novo.trim()}>Add</Button>
          <Button size="sm" variant="ghost" onClick={() => { setAddOpen(false); setNovo(""); }}><XIcon className="size-4" /></Button>
        </div>
      ) : (
        <Select value={value || "_none"} onValueChange={(v) => {
          if (v === "__new__") { setAddOpen(true); return; }
          onChange(v === "_none" ? "" : v);
        }}>
          <SelectTrigger><SelectValue placeholder="Selecionar origem" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="_none">Sem origem</SelectItem>
            {all.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
            <SelectItem value="__new__">
              <span className="inline-flex items-center gap-1.5 text-[var(--brand-text)]"><Plus className="size-3" /> Criar nova origem</span>
            </SelectItem>
          </SelectContent>
        </Select>
      )}
    </div>
  );
}


/* ========== Respostas do formulário / informações extras ========== */
function CamposExtrasSection({
  cardId, respostas, outros, onChanged,
}: { cardId: string; respostas: RespostaExtra[]; outros: Record<string, any>; onChanged: (lista: RespostaExtra[]) => void }) {
  const [editando, setEditando] = useState<number | null>(null);
  const [rascunho, setRascunho] = useState("");
  const [novoLabel, setNovoLabel] = useState("");
  const [novoValor, setNovoValor] = useState("");
  const [adicionando, setAdicionando] = useState(false);
  const [salvando, setSalvando] = useState(false);

  async function persistir(lista: RespostaExtra[], msg: string) {
    setSalvando(true);
    const { error } = await supabase
      .from("crm_cards")
      .update({ campos_extras: { ...(outros ?? {}), respostas: lista } } as any)
      .eq("id", cardId);
    setSalvando(false);
    if (error) return toast.error("Não foi possível salvar");
    onChanged(lista);
    toast.success(msg);
  }

  const origem = respostas.find((r) => r.origem)?.origem;

  if (!respostas.length && !adicionando) {
    return (
      <div className="space-y-2">
        <SectionTitle>Respostas do formulário</SectionTitle>
        <div className="rounded-lg border border-dashed border-[var(--border)] p-3 text-center">
          <p className="text-[11px] text-muted-foreground">Nenhuma informação extra ainda.</p>
          <Button variant="ghost" size="sm" className="mt-1 h-7 text-[11px]" onClick={() => setAdicionando(true)}>
            <Plus className="size-3 mr-1" />Adicionar informação
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <SectionTitle>Respostas do formulário</SectionTitle>
        {origem && <span className="text-[10px] text-muted-foreground truncate max-w-[45%]">{origem}</span>}
      </div>

      <div className="overflow-hidden rounded-lg border border-[var(--border)] divide-y divide-[var(--border)]">
        {respostas.map((r, i) => (
          <div key={`${r.label}-${i}`} className="px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground truncate">{r.label}</span>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  title="Copiar"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => { navigator.clipboard.writeText(r.valor); toast.success("Copiado"); }}
                >
                  <Copy className="size-3" />
                </button>
                <button
                  type="button"
                  title="Editar"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => { setEditando(i); setRascunho(r.valor); }}
                >
                  <Pencil className="size-3" />
                </button>
                <button
                  type="button"
                  title="Remover"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => persistir(respostas.filter((_, x) => x !== i), "Informação removida")}
                >
                  <Trash2 className="size-3" />
                </button>
              </div>
            </div>

            {editando === i ? (
              <div className="mt-1 flex items-center gap-1">
                <Input
                  autoFocus
                  value={rascunho}
                  onChange={(e) => setRascunho(e.target.value)}
                  className="h-7 text-xs"
                  onKeyDown={(e) => { if (e.key === "Escape") setEditando(null); }}
                />
                <Button
                  size="sm"
                  className="h-7 px-2"
                  disabled={salvando}
                  onClick={async () => {
                    const lista = respostas.map((x, xi) => (xi === i ? { ...x, valor: rascunho.trim() } : x));
                    await persistir(lista.filter((x) => x.valor), "Informação atualizada");
                    setEditando(null);
                  }}
                >
                  <Check className="size-3" />
                </Button>
              </div>
            ) : (
              <p className="mt-0.5 text-xs whitespace-pre-wrap break-words">{r.valor}</p>
            )}
          </div>
        ))}
      </div>

      {adicionando ? (
        <div className="flex items-center gap-1">
          <Input placeholder="Pergunta" value={novoLabel} onChange={(e) => setNovoLabel(e.target.value)} className="h-7 text-xs" />
          <Input placeholder="Resposta" value={novoValor} onChange={(e) => setNovoValor(e.target.value)} className="h-7 text-xs" />
          <Button
            size="sm"
            className="h-7 px-2"
            disabled={salvando || !novoLabel.trim() || !novoValor.trim()}
            onClick={async () => {
              await persistir(
                [...respostas, { label: novoLabel.trim(), valor: novoValor.trim(), em: new Date().toISOString() }],
                "Informação adicionada",
              );
              setNovoLabel(""); setNovoValor(""); setAdicionando(false);
            }}
          >
            <Check className="size-3" />
          </Button>
          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setAdicionando(false)}>
            <XIcon className="size-3" />
          </Button>
        </div>
      ) : (
        <Button variant="ghost" size="sm" className="h-7 text-[11px]" onClick={() => setAdicionando(true)}>
          <Plus className="size-3 mr-1" />Adicionar informação
        </Button>
      )}
    </div>
  );
}


/* ========== Campos personalizados do lead ========== */
function CamposPersonalizadosSection({
  cardId, campos, outros, onChanged,
}: { cardId: string; campos: RespostaExtra[]; outros: Record<string, any>; onChanged: (lista: RespostaExtra[]) => void }) {
  const [adicionando, setAdicionando] = useState(false);
  const [novoLabel, setNovoLabel] = useState("");
  const [novoValor, setNovoValor] = useState("");
  const [editando, setEditando] = useState<number | null>(null);
  const [rascunho, setRascunho] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function persistir(lista: RespostaExtra[], msg: string) {
    setSalvando(true);
    const { error } = await supabase
      .from("crm_cards")
      .update({ campos_extras: { ...(outros ?? {}), personalizados: lista } } as any)
      .eq("id", cardId);
    setSalvando(false);
    if (error) return toast.error("Não foi possível salvar");
    onChanged(lista);
    toast.success(msg);
  }

  return (
    <div className="space-y-2">
      <SectionTitle>Campos personalizados</SectionTitle>

      {campos.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-[var(--border)] divide-y divide-[var(--border)]">
          {campos.map((c, i) => (
            <div key={`${c.label}-${i}`} className="px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground truncate">{c.label}</span>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    title="Copiar"
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() => { navigator.clipboard.writeText(c.valor); toast.success("Copiado"); }}
                  >
                    <Copy className="size-3" />
                  </button>
                  <button
                    type="button"
                    title="Editar"
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() => { setEditando(i); setRascunho(c.valor); }}
                  >
                    <Pencil className="size-3" />
                  </button>
                  <button
                    type="button"
                    title="Remover"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => void persistir(campos.filter((_, x) => x !== i), "Campo removido")}
                  >
                    <Trash2 className="size-3" />
                  </button>
                </div>
              </div>
              {editando === i ? (
                <div className="mt-1 flex items-center gap-1">
                  <Input
                    autoFocus
                    value={rascunho}
                    onChange={(e) => setRascunho(e.target.value)}
                    className="h-7 text-xs"
                    onKeyDown={(e) => { if (e.key === "Escape") setEditando(null); }}
                  />
                  <Button
                    size="sm"
                    className="h-7 px-2"
                    disabled={salvando}
                    onClick={async () => {
                      const lista = campos.map((x, xi) => (xi === i ? { ...x, valor: rascunho.trim() } : x));
                      await persistir(lista.filter((x) => x.valor), "Campo atualizado");
                      setEditando(null);
                    }}
                  >
                    <Check className="size-3" />
                  </Button>
                </div>
              ) : (
                <p className="mt-0.5 text-xs whitespace-pre-wrap break-words">{c.valor}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {adicionando ? (
        <div className="flex items-center gap-1">
          <Input placeholder="Nome do campo" value={novoLabel} onChange={(e) => setNovoLabel(e.target.value)} className="h-7 text-xs" />
          <Input placeholder="Valor" value={novoValor} onChange={(e) => setNovoValor(e.target.value)} className="h-7 text-xs" />
          <Button
            size="sm"
            className="h-7 px-2"
            disabled={salvando || !novoLabel.trim() || !novoValor.trim()}
            onClick={async () => {
              await persistir(
                [...campos, { label: novoLabel.trim(), valor: novoValor.trim(), em: new Date().toISOString() }],
                "Campo adicionado",
              );
              setNovoLabel(""); setNovoValor(""); setAdicionando(false);
            }}
          >
            <Check className="size-3" />
          </Button>
          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setAdicionando(false)}>
            <XIcon className="size-3" />
          </Button>
        </div>
      ) : (
        <Button variant="ghost" size="sm" className="h-7 text-[11px]" onClick={() => setAdicionando(true)}>
          <Plus className="size-3 mr-1" />Adicionar campo
        </Button>
      )}
    </div>
  );
}
