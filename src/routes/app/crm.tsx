import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { HelpTip } from "@/components/help-tip";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  DndContext, DragOverlay, MouseSensor, TouchSensor, useDroppable, useDraggable, useSensor, useSensors,
  closestCorners, defaultDropAnimationSideEffects,
  type DragEndEvent, type DragStartEvent,
} from "@dnd-kit/core";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { InitialsAvatar } from "@/components/ui/initials-avatar";
import { toast } from "sonner";
import {
  Plus, MoreHorizontal, Sparkles, Pencil, Trash2, Palette, Zap, Clock, ChevronDown, Lock,
  Users, Loader2, Wand2, Search, SlidersHorizontal, RefreshCw, User as UserIcon,
  TrendingUp, MessageSquare, ArrowRightLeft, Columns3, Calendar, Bot, Star, Coins, CalendarPlus, UserPlus, Eye, EyeOff, Forward,
  Upload, X, FileText, Image as ImageIcon, Video, Mic
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { generateAutomacaoMessage } from "@/lib/automacao-ai.functions";
import { registerSale } from "@/lib/comercial.functions";
import { listProdutos } from "@/lib/produtos.functions";
import { listServicos } from "@/lib/servicos.functions";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { brand } from "@/config/brand";
import { LeadDrawer, type LeadCard, type Stage, type Member } from "@/components/crm/lead-drawer";
import { CANAL_LABEL, CANAL_COLOR, CANAIS_MANUAIS, type CanalEntrada } from "@/lib/tracking-utils";
import { QuickScheduleDialog } from "@/components/agenda/quick-schedule-dialog";
import { EncaminharDialog } from "@/components/chat/encaminhar-dialog";
import { useFeatureEnabled } from "@/hooks/use-feature-flags";
import { resolveStageAiMeta, DEFAULT_CRM_MASTER_PROMPT } from "@/lib/crm-stage-meta";
import { applyStageMovement } from "@/lib/crm-lead-analyzer.functions";
import { useLanguage, translateDefaultStageName, translateDefaultPipelineName } from "@/lib/i18n/context";


export const Route = createFileRoute("/app/crm")({
  head: () => ({ meta: [{ title: `${brand.name} — CRM Kanban` }] }),
  component: KanbanPage,
});

const STAGE_COLORS = ["#8AA89A", "#FFB020", "#22B85F", "#FF5A5A", "#3FD27C", "#60A5FA", "#A78BFA", "#F472B6"];

type Pipeline = { id: string; nome: string; tipo: string | null; agent_id: string | null; ordem: number | null; sistema: boolean; crm_master_prompt?: string | null };
type KanbanStage = Stage & { pipeline_id: string | null; ordem?: number | null; tipo?: string | null; mostrar_valor?: boolean | null };
type KanbanCard = LeadCard & { pipeline_id?: string | null; avatar_traits?: any | null };
type AgentOpt = { id: string; nome: string; tipo: string | null; nome_agente: string | null; avatar_traits?: any | null };
type DistQueue = { id: string; nome: string; ativo: boolean };


// Cache em memória entre navegações: evita tela vazia ao voltar ao CRM.
let crmCache: {
  cid: string;
  pipelines: any[]; stages: any[]; cards: any[];
  members: any[]; agents: any[]; queues: any[];
} | null = null;

function KanbanPage() {
  const { t, translateDefaultStageName, translateDefaultPipelineName, formatDate, formatTime, formatCurrency } = useLanguage();
  const ctx = Route.useRouteContext();
  const companyId = ctx.company?.id ?? "";
  const userId = ctx.user.id;
  const role = (ctx as any).membership?.role as string | undefined;
  const canFilterByOwner = role === "owner" || role === "admin" || (ctx as any).isSuperAdmin;
  // Atendente não mexe em etapas nem em automações do Kanban.
  const canGerenciarEtapas = canFilterByOwner;
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [activePipelineId, setActivePipelineId] = useState<string | null>(null);
  const [allStages, setAllStages] = useState<KanbanStage[]>([]);
  const [allCards, setAllCards] = useState<KanbanCard[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [agents, setAgents] = useState<AgentOpt[]>([]);
  const [queues, setQueues] = useState<DistQueue[]>([]);
  const [pauses, setPauses] = useState<Record<string, boolean>>({});
  // Funis liberados para o usuário (vazio = todos) e setores dele
  const [myPipelineIds, setMyPipelineIds] = useState<string[]>([]);
  const [myDeptIds, setMyDeptIds] = useState<string[]>([]);
  const [myDeptNames, setMyDeptNames] = useState<string[]>([]);

  const [ownerFilter, setOwnerFilter] = useState<string>("all");
  const [canalFilter, setCanalFilter] = useState<string>("all");
  const [showArchived, setShowArchived] = useState(false);
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const navigate = useNavigate();

  const [activeId, setActiveId] = useState<string | null>(null);
  const [selected, setSelected] = useState<LeadCard | null>(null);
  const [newStageOpen, setNewStageOpen] = useState(false);
  const [editingStage, setEditingStage] = useState<Stage | null>(null);
  const [adding, setAdding] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [automacaoStage, setAutomacaoStage] = useState<KanbanStage | null>(null);
  const [limparStage, setLimparStage] = useState<KanbanStage | null>(null);
  const [retornoStage, setRetornoStage] = useState<KanbanStage | null>(null);
  const [pipelineDialog, setPipelineDialog] = useState<{ mode: "new" } | { mode: "edit"; pipeline: Pipeline } | null>(null);
  const [pendingSale, setPendingSale] = useState<{ cardId: string; stageId: string; cardNome: string | null; ownerId: string | null } | null>(null);
  const [pendingLoss, setPendingLoss] = useState<{ cardId: string; stageId: string; cardNome: string | null; ownerId: string | null; currentValue: number | null } | null>(null);
  const [saleValor, setSaleValor] = useState("");
  const [saleDescricao, setSaleDescricao] = useState("");
  const [saleOwnerId, setSaleOwnerId] = useState<string>("");
  const [saleCanal, setSaleCanal] = useState<string>("manual");
  const [saleMetodo, setSaleMetodo] = useState<string>("Pix");
  const [saleItemTipo, setSaleItemTipo] = useState<"produto" | "servico">("produto");
  const [saleSelectedItemId, setSaleSelectedItemId] = useState<string>("");
  const [saleAvailableItems, setSaleAvailableItems] = useState<any[]>([]);
  const [saleSaving, setSaleSaving] = useState(false);
  const [lossValor, setLossValor] = useState("");
  const [lossMotivo, setLossMotivo] = useState("");
  const [lossAgendarRetorno, setLossAgendarRetorno] = useState(false);
  const [lossReturnDate, setLossReturnDate] = useState("");
  const [lossReturnStage, setLossReturnStage] = useState("");
  const [lossRetornoStage, setLossRetornoStage] = useState("");
  const [lossSaving, setLossSaving] = useState(false);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
  );

  async function loadPauses(cid: string) {
    const { data } = await supabase.from("contact_pause").select("numero,pausado").eq("company_id", cid);
    const map: Record<string, boolean> = {};
    (data ?? []).forEach((r: any) => { map[r.numero] = !!r.pausado; });
    setPauses(map);
  }

  const registerSaleFn = useServerFn(registerSale);
  const listProdutosFn = useServerFn(listProdutos);
  const listServicosFn = useServerFn(listServicos);

  async function loadAll(cid: string) {
    void loadPauses(cid);
    const [
      { data: pipes }, { data: st }, { data: cd }, { data: mem }, { data: ags }, { data: qs },
      { data: myPipes }, { data: myDeps },
    ] = await Promise.all([
      supabase.from("crm_pipeline").select("*").eq("company_id", cid).order("ordem", { ascending: true }),
      supabase.from("crm_stage").select("*, pipeline_id, ordem").eq("company_id", cid).order("ordem", { ascending: true }),
      supabase.from("crm_cards").select("*").eq("company_id", cid).or("tipo_contato.is.null,tipo_contato.neq.interno").order("ultima_em", { ascending: false }),
      supabase.from("company_user").select("user_id").eq("company_id", cid).eq("ativo", true),
      supabase.from("agent_config").select("id,nome,tipo,nome_agente,avatar_traits").eq("company_id", cid).order("nome", { ascending: true }),
      supabase.from("crm_distribution_queues").select("id,nome,ativo").eq("company_id", cid).eq("ativo", true).order("nome", { ascending: true }),
      supabase.from("company_user_pipeline").select("pipeline_id").eq("company_id", cid).eq("user_id", userId),
      supabase.from("department_member").select("department_id").eq("user_id", userId),
    ]);

    const allowedIds = ((myPipes ?? []) as any[]).map((r) => r.pipeline_id as string);
    setMyPipelineIds(allowedIds);
    const depIds = ((myDeps ?? []) as any[]).map((r) => r.department_id as string);
    setMyDeptIds(depIds);
    if (depIds.length) {
      const { data: dn } = await supabase.from("department").select("nome").eq("company_id", cid).in("id", depIds);
      setMyDeptNames(((dn ?? []) as any[]).map((d) => String(d.nome || "").trim().toLowerCase()));
    } else setMyDeptNames([]);

    const restringe = allowedIds.length > 0 && !canFilterByOwner && (ctx.company as any)?.atendimento_operacional !== true;
    const nextPipelines = (((pipes ?? []) as Pipeline[])).filter((p) => !restringe || allowedIds.includes(p.id));
    setPipelines(nextPipelines);
    setActivePipelineId((current) => (
      current && nextPipelines.some((p) => p.id === current && !(p as any).oculto)
        ? current
        : (nextPipelines.find((p) => !(p as any).oculto)?.id ?? nextPipelines[0]?.id ?? null)
    ));

    setAllStages((st ?? []) as KanbanStage[]);
    setAllCards((cd ?? []) as KanbanCard[]);
    const ids = ((mem ?? []) as any[]).map((m) => m.user_id).filter(Boolean);
    let perfis: any[] = [];
    if (ids.length) {
      const { data: pf } = await supabase.from("team_profiles" as any).select("user_id,nome").in("user_id", ids);
      perfis = pf ?? [];
    }
    const nextMembers = ids.map((uid: string) => {
      const p = perfis.find((x) => x.user_id === uid);
      return { user_id: uid, email: null, nome: p?.nome ?? null };
    });
    setMembers(nextMembers);
    setAgents((ags ?? []) as AgentOpt[]);
    setQueues((qs ?? []) as DistQueue[]);
    crmCache = {
      cid,
      pipelines: nextPipelines,
      stages: (st ?? []) as KanbanStage[],
      cards: (cd ?? []) as KanbanCard[],
      members: nextMembers,
      agents: (ags ?? []) as AgentOpt[],
      queues: (qs ?? []) as DistQueue[],
    };
  }

  useEffect(() => {
    if (!companyId) return;
    // Pinta na hora com o que já foi carregado antes (troca de módulo instantânea).
    if (crmCache && crmCache.cid === companyId) {
      setPipelines(crmCache.pipelines);
      setAllStages(crmCache.stages);
      setAllCards(crmCache.cards);
      setMembers(crmCache.members);
      setAgents(crmCache.agents);
      setQueues(crmCache.queues);
    }
    void loadAll(companyId);
    let t: any = null;
    const reload = () => { clearTimeout(t); t = setTimeout(() => loadAll(companyId), 1500); };
    const ch = supabase.channel(`tenant:${companyId}:crm`)
      .on("postgres_changes", { event: "*", schema: "public", table: "crm_cards", filter: `company_id=eq.${companyId}` },
        reload)
      .on("postgres_changes", { event: "*", schema: "public", table: "crm_stage", filter: `company_id=eq.${companyId}` },
        reload)
      .on("postgres_changes", { event: "*", schema: "public", table: "contact_pause", filter: `company_id=eq.${companyId}` },
        () => loadPauses(companyId))
      .subscribe();
    return () => { clearTimeout(t); supabase.removeChannel(ch); };
  }, [companyId]);


  const activePipeline = useMemo(
    () => pipelines.find((p) => p.id === activePipelineId) ?? null,
    [pipelines, activePipelineId],
  );

  const visiblePipelines = useMemo(
    () => pipelines.filter((p) => !(p as any).oculto),
    [pipelines],
  );
  const hiddenPipelines = useMemo(
    () => pipelines.filter((p) => !!(p as any).oculto),
    [pipelines],
  );


  const stages = useMemo(() => (
    activePipelineId
      ? allStages.filter((s) => s.pipeline_id === activePipelineId)
      : allStages
  ), [allStages, activePipelineId]);

  const cards = useMemo(() => {
    let list = allCards;

    const isAtendente = role === "atendente";

    if (activePipelineId) {
      const visibleStageIds = new Set(stages.map((s) => s.id));
      list = list.filter((c) => (
        c.pipeline_id === activePipelineId || (!c.pipeline_id && !!c.stage_id && visibleStageIds.has(c.stage_id))
      ));
    }

    // Restrição de visibilidade para Atendentes no Kanban:
    const modoOperacional = (ctx.company as any)?.atendimento_operacional === true;
    if (isAtendente && !(ctx as any).isSuperAdmin && modoOperacional) {
      // SevyCon: funil inteiro visível; só cards designados ao departamento do atendente, em qualquer etapa.
      list = list.filter((c) => {
        const dep = (c as any).department_id as string | null;
        return !!dep && myDeptIds.includes(dep);
      });
    } else if (isAtendente && !(ctx as any).isSuperAdmin) {
      list = list.filter((c) => {
        const ownerId = (c as any).owner_id;
        if (!ownerId || ownerId === userId) return true;
        // Com funis por usuário, o atendente também vê os cards dos setores dele
        const dep = (c as any).department_id as string | null;
        return myPipelineIds.length > 0 && !!dep && myDeptIds.includes(dep);
      });
    }

    if (ownerFilter !== "all") {
      list = ownerFilter === "_none"
        ? list.filter((c) => !(c as any).owner_id)
        : list.filter((c) => (c as any).owner_id === ownerFilter);
    }
    if (canalFilter !== "all") {
      list = canalFilter === "_none"
        ? list.filter((c) => !(c as any).canal_entrada)
        : list.filter((c) => (c as any).canal_entrada === canalFilter);
    }
    // Arquivamento automático da coluna de Perda (o card some do kanban,
    // mas continua no banco, nas conversas, nos contatos e nos relatórios).
    if (!showArchived) {
      const prazoPorEtapa = new Map<string, number>();
      allStages.forEach((s) => {
        const dias = Number((s as any).arquivar_perdidos_dias) || 0;
        if ((s as any).tipo === "perda" && dias > 0) prazoPorEtapa.set(s.id, dias);
      });
      if (prazoPorEtapa.size > 0) {
        const agora = Date.now();
        list = list.filter((c) => {
          const dias = c.stage_id ? prazoPorEtapa.get(c.stage_id) : undefined;
          if (!dias) return true;
          const ref = (c as any).perdido_em ?? (c as any).stage_entrou_em ?? (c as any).entrou_stage_em ?? (c as any).updated_at;
          if (!ref) return true;
          return agora - new Date(ref as string).getTime() < dias * 86400000;
        });
      }
    }

    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((c) => {
        const nome = (c.nome || "").toLowerCase();
        const numero = (c.numero || "").toLowerCase();
        const tagsArr = ((c as any).tags as string[] | null) ?? [];
        const tags = tagsArr.join(" ").toLowerCase();
        return nome.includes(q) || numero.includes(q) || tags.includes(q);
      });
    }
    return list;
  }, [allCards, activePipelineId, stages, allStages, showArchived, ownerFilter, canalFilter, search, role, userId, ctx, myPipelineIds, myDeptIds, myDeptNames]);


  const byStage = useMemo(() => {
    const m: Record<string, LeadCard[]> = {};
    stages.forEach((s) => (m[s.id] = []));
    cards.forEach((c) => {
      const sid = c.stage_id && m[c.stage_id] ? c.stage_id : stages[0]?.id;
      if (sid) (m[sid] ||= []).push(c);
    });
    return m;
  }, [cards, stages]);

  async function moveCard(id: string, stageId: string) {
    const stage = stages.find((s) => s.id === stageId);
    if (!stage) return;
    const card = allCards.find((c) => c.id === id);
    const previousStageId = card?.stage_id;

    // Intercepta drop em "Ganho"
    if (stage.tipo === "ganho" && previousStageId !== stageId) {
      setPendingSale({ cardId: id, stageId, cardNome: card?.nome ?? null, ownerId: (card as any)?.owner_id ?? null });
      setSaleValor(card?.valor ? String(card.valor).replace(".", ",") : "");
      setSaleDescricao(card?.nome ? `Venda: ${card.nome}` : "");
      setSaleOwnerId((card as any)?.owner_id || userId);
      setSaleCanal("manual");
      setSaleMetodo("Pix");
      setSaleItemTipo("produto");
      setSaleSelectedItemId("");
      void loadSaleItems("produto");
      return;
    }

    // Intercepta drop em "Perda"
    if (stage.tipo === "perda" && previousStageId !== stageId) {
      setPendingLoss({ cardId: id, stageId, cardNome: card?.nome ?? null, ownerId: (card as any)?.owner_id ?? null, currentValue: card?.valor ?? 0 });
      setLossValor(card?.valor ? String(card.valor).replace(".", ",") : "");
      setLossMotivo("");
      setLossAgendarRetorno(false);
      setLossRetornoStage(((stage as any).retorno_stage_id as string) || "");
      return;
    }

    const prev = allCards;
    const pipelineId = stage.pipeline_id ?? activePipelineId;
    setAllCards((cs) => cs.map((c) => (c.id === id ? { ...c, stage_id: stageId, status: stage.nome, pipeline_id: pipelineId } : c)));
    const { error } = await supabase.from("crm_cards").update({ stage_id: stageId, status: stage.nome, pipeline_id: pipelineId, entrou_stage_em: new Date().toISOString() } as any).eq("id", id);
    if (error) { setAllCards(prev); return toast.error(error.message); }
    await supabase.from("lead_evento").insert({
      company_id: companyId, card_id: id, tipo: "mudanca_etapa", descricao: `Movido para ${stage.nome}`,
    });
  }

  async function loadSaleItems(tipo: "produto" | "servico") {
    try {
      if (tipo === "produto") {
        const p = await listProdutosFn();
        setSaleAvailableItems(p.filter(x => x.ativo).map(x => ({ id: x.id, nome: x.nome, preco: x.preco })));
      } else {
        const s = await listServicosFn();
        setSaleAvailableItems(s.filter((x: any) => x.ativo).map((x: any) => ({ id: x.id, nome: x.nome, preco: (x.valor_cents || 0) / 100 })));
      }
    } catch (e) {
      console.error("Erro ao carregar itens", e);
    }
  }

  async function confirmSale() {
    if (!pendingSale) return;
    const stage = stages.find((s) => s.id === pendingSale.stageId);
    if (!stage) return;
    const valorNum = Number((saleValor || "0").replace(/\./g, "").replace(",", "."));
    if (!Number.isFinite(valorNum) || valorNum < 0) return toast.error("Informe um valor válido");
    if (!saleOwnerId) return toast.error("Selecione o vendedor");

    setSaleSaving(true);
    try {
      const card = allCards.find(c => c.id === pendingSale.cardId);
      const item = saleAvailableItems.find(i => i.id === saleSelectedItemId);
      const cents = Math.round(valorNum * 100);

      await registerSaleFn({
        data: {
          contato_nome: card?.nome || card?.numero || "Lead",
          contato_numero: card?.numero || "",
          descricao: saleDescricao.trim() || undefined,
          valor_cents: cents,
          vendido_em: new Date().toISOString(),
          owner_id: saleOwnerId,
          canal: saleCanal,
          metodo_pagamento: saleMetodo,
          item_tipo: saleItemTipo,
          item_id: saleSelectedItemId || undefined,
          item_nome: item?.nome || undefined,
        }
      });

      // Atualizar o card no CRM
      const pipelineId = stage.pipeline_id ?? activePipelineId;
      await supabase
        .from("crm_cards")
        .update({
          stage_id: pendingSale.stageId,
          status: stage.nome,
          pipeline_id: pipelineId,
          valor: valorNum,
          owner_id: saleOwnerId
        })
        .eq("id", pendingSale.cardId);

      await supabase.from("lead_evento").insert({
        company_id: companyId, card_id: pendingSale.cardId, tipo: "venda",
        descricao: `Venda registrada: R$ ${valorNum.toFixed(2).replace(".", ",")}`,
      });

      // CSAT opcional
      try {
        const { data: comp } = await supabase.from("company").select("csat_auto_ganho,csat_ativo").eq("id", companyId).maybeSingle();
        if (comp?.csat_auto_ganho && comp?.csat_ativo !== false && card?.numero) {
          const { sendCsat } = await import("@/lib/csat.functions");
          await sendCsat({ data: { numero: card.numero, contatoNome: card.nome ?? null } });
        }
      } catch {}

      toast.success("Venda registrada!");
      setPendingSale(null);
      setSaleValor("");
      setSaleDescricao("");
      setSaleOwnerId("");
      await loadAll(companyId);
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao registrar venda");
    } finally {
      setSaleSaving(false);
    }
  }


  async function confirmLoss() {
    if (!pendingLoss) return;
    const stage = stages.find((s) => s.id === pendingLoss.stageId);
    if (!stage) return;
    const valorNum = Number((lossValor || "0").replace(/\./g, "").replace(",", "."));
    if (!Number.isFinite(valorNum) || valorNum < 0) return toast.error("Informe um valor válido");
    
    setLossSaving(true);
    try {
      const pipelineId = stage.pipeline_id ?? activePipelineId;
      const { error } = await supabase
        .from("crm_cards")
        .update({
          stage_id: pendingLoss.stageId,
          status: stage.nome,
          pipeline_id: pipelineId,
          valor: valorNum,
          perdido_em: new Date().toISOString(),
          retorno_stage_id: lossRetornoStage || null,
          regua_status: "pausada",
          updated_at: new Date().toISOString()
        })
        .eq("id", pendingLoss.cardId);
      if (error) throw error;

      await supabase.from("lead_evento").insert({
        company_id: companyId, card_id: pendingLoss.cardId, tipo: "perda",
        descricao: `Negócio perdido: R$ ${valorNum.toFixed(2).replace(".", ",")} ${lossMotivo ? `- Motivo: ${lossMotivo}` : ""}`,
      });

      if (lossAgendarRetorno && lossReturnDate && lossReturnStage) {
        const agendadoPara = new Date(lossReturnDate).toISOString();
        const card = allCards.find(c => c.id === pendingLoss.cardId);
        await supabase.from("mensagem_agendada").insert({
          company_id: companyId,
          card_id: pendingLoss.cardId,
          created_by: userId,
          tipo: "compromisso",
          status: "pendente",
          agendado_para: agendadoPara,
          mensagem: `Retornar contato com o lead (movido automaticamente para ${stages.find(s => s.id === lossReturnStage)?.nome})`,
          numero: card?.numero || "",
        });

        await supabase.from("lead_evento").insert({
          company_id: companyId, card_id: pendingLoss.cardId, tipo: "agendamento",
          descricao: `Retorno agendado para ${new Date(lossReturnDate).toLocaleString("pt-BR")} na etapa ${stages.find(s => s.id === lossReturnStage)?.nome}`,
        });
      }

      toast.success("Lead movido para perda");
      setPendingLoss(null);
      await loadAll(companyId);
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao registrar perda");
    } finally {
      setLossSaving(false);
    }
  }

  async function createStage(nome: string, cor: string, slaHoras?: number | null) {
    if (!activePipelineId) return toast.error("Selecione um funil");
    const ordem = stages.length;
    const { error } = await supabase.from("crm_stage").insert({ company_id: companyId, pipeline_id: activePipelineId, nome, cor, ordem, tipo: "normal", sla_horas: slaHoras ?? null } as any);
    if (error) toast.error(error.message); else toast.success("Etapa criada");
  }

  async function updateStage(id: string, patch: any) {
    const { error } = await supabase.from("crm_stage").update(patch).eq("id", id);
    if (error) toast.error(error.message);
  }
  async function deleteStage(id: string) {
    if (stages.length <= 1) return toast.error("Mantenha ao menos uma etapa");
    const first = stages.find((s) => s.id !== id);
    if (!first) return;
    await supabase.from("crm_cards").update({ stage_id: first.id, status: first.nome, pipeline_id: first.pipeline_id ?? activePipelineId }).eq("stage_id", id);
    const { error } = await supabase.from("crm_stage").delete().eq("id", id);
    if (error) toast.error(error.message); else toast.success("Etapa removida");
  }
  async function reorderStages(orderedIds: string[]) {
    await Promise.all(orderedIds.map((sid, i) => supabase.from("crm_stage").update({ ordem: i }).eq("id", sid)));
  }

  async function setStageTipo(stageId: string, tipo: "normal" | "ganho" | "perda" | "formulario" | "sem-formulario") {
    const stage = stages.find((s) => s.id === stageId);
    if (!stage) return;

    if (tipo === "sem-formulario") {
      const { error } = await supabase.from("crm_stage").update({ entrada_formulario: false } as any).eq("id", stageId);
      if (error) return toast.error(error.message);
      toast.success("Marcação de Formulário removida");
      await loadAll(companyId);
      return;
    }


    // "Formulário" é uma marcação à parte (não altera o tipo ganho/perda).
    if (tipo === "formulario") {
      const conflicts = stages.filter((s) => s.id !== stageId && (s as any).entrada_formulario).map((s) => s.id);
      if (conflicts.length) {
        await supabase.from("crm_stage").update({ entrada_formulario: false } as any).in("id", conflicts);
      }
      const { error } = await supabase.from("crm_stage").update({ entrada_formulario: true } as any).eq("id", stageId);
      if (error) return toast.error(error.message);
      toast.success("Etapa marcada como Formulário — novos leads de formulário entram aqui");
      await loadAll(companyId);
      return;
    }

    // Só pode existir uma "ganho" e uma "perda" por funil — reseta as outras.
    if (tipo === "ganho" || tipo === "perda") {
      const conflicts = stages.filter((s) => s.id !== stageId && (s as any).tipo === tipo).map((s) => s.id);
      if (conflicts.length) {
        await supabase.from("crm_stage").update({ tipo: "normal" }).in("id", conflicts);
      }
    }
    const patch: any = { tipo };
    if (tipo === "normal" && (stage as any).entrada_formulario) patch.entrada_formulario = false;
    const { error } = await supabase.from("crm_stage").update(patch).eq("id", stageId);
    if (error) return toast.error(error.message);
    toast.success(tipo === "ganho" ? "Etapa marcada como Ganho" : tipo === "perda" ? "Etapa marcada como Perda" : "Etapa marcada como Normal");
    await loadAll(companyId);
  }

  async function toggleStageValor(stageId: string, mostrar: boolean) {
    const { error } = await supabase.from("crm_stage").update({ mostrar_valor: mostrar } as any).eq("id", stageId);
    if (error) return toast.error(error.message);
    setAllStages((prev) => prev.map((s) => (s.id === stageId ? { ...s, mostrar_valor: mostrar } : s)));
  }




  async function createPipeline(nome: string, queueId?: string | null, agentId?: string | null, crmMasterPrompt?: string | null) {
    const ordem = pipelines.length;
    const { data, error } = await supabase.from("crm_pipeline")
      .insert({ company_id: companyId, nome, tipo: "custom", ordem, sistema: false, distribution_queue_id: queueId || null, agent_id: agentId || null, crm_master_prompt: crmMasterPrompt || null })
      .select("id").maybeSingle();
    if (error || !data) return toast.error(error?.message ?? "Falha ao criar funil");
    // Cria etapas iniciais
    await supabase.from("crm_stage").insert([
      { company_id: companyId, pipeline_id: data.id, nome: "A fazer", ordem: 0, cor: "#8AA89A", tipo: "normal" },
      { company_id: companyId, pipeline_id: data.id, nome: "Em andamento", ordem: 1, cor: "#FFB020", tipo: "normal" },

      { company_id: companyId, pipeline_id: data.id, nome: "Concluído", ordem: 2, cor: "#22B85F", tipo: "ganho" },
    ]);
    toast.success("Funil criado");
    setActivePipelineId(data.id);
    await loadAll(companyId);
  }

  async function renamePipeline(id: string, nome: string, queueId?: string | null, agentId?: string | null, crmMasterPrompt?: string | null) {
    const { error } = await supabase.from("crm_pipeline").update({ nome, distribution_queue_id: queueId || null, agent_id: agentId || null, crm_master_prompt: crmMasterPrompt || null }).eq("id", id);
    if (error) return toast.error(error.message);

    toast.success("Funil renomeado");
  }

  async function deletePipeline(id: string) {
    const pipe = pipelines.find((p) => p.id === id);
    if (!pipe || pipe.sistema) return toast.error("Este funil é do sistema e não pode ser excluído");
    if (!confirm(`Excluir funil "${pipe.nome}"? Cards deste funil ficarão sem funil.`)) return;
    await supabase.from("crm_stage").delete().eq("pipeline_id", id);
    const { error } = await supabase.from("crm_pipeline").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Funil excluído");
    setActivePipelineId(pipelines.find((p) => p.id !== id)?.id ?? null);
    await loadAll(companyId);
  }

  async function togglePipelineHidden(id: string, oculto: boolean) {
    const { error } = await supabase.from("crm_pipeline").update({ oculto } as any).eq("id", id);
    if (error) return toast.error(error.message);
    setPipelines((prev) => prev.map((p) => (p.id === id ? ({ ...p, oculto } as any) : p)));
    if (oculto && activePipelineId === id) {
      setActivePipelineId(pipelines.find((p) => p.id !== id && !(p as any).oculto)?.id ?? null);
    } else if (!oculto) {
      setActivePipelineId(id);
    }
    toast.success(oculto ? "Funil ocultado" : "Funil reativado");
  }


  const [movingCard, setMovingCard] = useState<LeadCard | null>(null);

  function onDragStart(e: DragStartEvent) { setActiveId(String(e.active.id)); }
  function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const aId = String(active.id);
    const oId = String(over.id);
    // stage reorder (drop on another stage header or on any column area)
    if (aId.startsWith("stage:")) {
      const from = aId.replace("stage:", "");
      let to: string | null = null;
      if (oId.startsWith("stage:")) to = oId.replace("stage:", "");
      else if (oId.startsWith("col:")) to = oId.replace("col:", "");
      if (!to || from === to) return;
      const ids = stages.map((s) => s.id);
      const fi = ids.indexOf(from), ti = ids.indexOf(to);
      if (fi < 0 || ti < 0) return;
      ids.splice(fi, 1); ids.splice(ti, 0, from);
      setAllStages((ss) => ss.map((stage) => {
        const nextIndex = ids.indexOf(stage.id);
        return nextIndex >= 0 ? { ...stage, ordem: nextIndex } : stage;
      }));
      void reorderStages(ids);
      return;
    }
    // card drop on stage
    const stageId = oId.startsWith("col:") ? oId.replace("col:", "") : null;
    if (!stageId) return;
    const card = cards.find((c) => c.id === aId);
    if (!card || card.stage_id === stageId) return;
    void moveCard(aId, stageId);
  }

  const activeCard = activeId ? cards.find((c) => c.id === activeId) : null;

  // Contagens por etapa e total (para toolbar e legenda)
  const totalContatos = cards.length;
  const stageCounts = useMemo(() => {
    const m: Record<string, number> = {};
    stages.forEach((s) => { m[s.id] = (byStage[s.id] ?? []).length; });
    return m;
  }, [stages, byStage]);

  async function handleRefresh() {
    if (!companyId || refreshing) return;
    setRefreshing(true);
    try { await loadAll(companyId); } finally { setTimeout(() => setRefreshing(false), 350); }
  }

  function scrollToStage(stageId: string) {
    const el = document.getElementById(`kcol-${stageId}`);
    el?.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });
  }

  const hasActiveFilters = ownerFilter !== "all" || canalFilter !== "all";

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
      {/* Título mínimo (padrão do sistema) */}
      <div className="shrink-0">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight flex items-center gap-2">
          {t("crm.title", undefined, "CRM Kanban")}
          <HelpTip text={t("crm.pipeline_tip", undefined, "Funil visual de vendas. Arraste cards entre etapas para acompanhar cada contato.")} />
        </h1>
        <p className="text-xs sm:text-sm text-muted-foreground">
          {activePipeline?.tipo === "pos_venda" ? t("crm.after_sales_funnel", undefined, "Funil de pós-venda") : t("crm.manage_opportunities", undefined, "Gerencie oportunidades por etapa")}
        </p>
      </div>

      {/* Toolbar */}
      <div className="shrink-0 rounded-2xl border border-[color:var(--hairline)] bg-white px-2 sm:px-3 py-1.5 sm:py-2.5 flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2">
        {/* Linha 1 (mobile): funil + adicionar lead */}
        <div className="flex items-center gap-1.5 min-w-0 sm:contents">
        {/* Seletor de pipeline */}
        {pipelines.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-xl border border-[color:var(--hairline)] bg-[color:var(--panel-2)] hover:bg-[color:var(--panel-2)]/80 px-2 sm:px-3 py-1 sm:py-1.5 text-left transition-colors flex-1 min-w-0 sm:w-auto sm:min-w-[180px] sm:flex-none"
              >

                <span className="grid place-items-center size-7 sm:size-8 rounded-lg bg-[var(--brand)]/10 text-[var(--brand)] shrink-0">
                  <TrendingUp className="size-4" />
                </span>
                <span className="flex flex-col min-w-0 flex-1">
                  <span className="text-[13px] font-bold leading-tight truncate">{translateDefaultPipelineName(activePipeline?.nome ?? "Funil")}</span>
                  <span className="text-[10.5px] text-muted-foreground leading-tight">
                    {stages.length} coluna{stages.length === 1 ? "" : "s"} · {totalContatos} contato{totalContatos === 1 ? "" : "s"}
                  </span>
                </span>
                <ChevronDown className="size-4 text-muted-foreground shrink-0" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              {visiblePipelines.map((pipeline) => (
                <DropdownMenuItem
                  key={pipeline.id}
                  onClick={() => setActivePipelineId(pipeline.id)}
                  className="gap-2"
                >
                  <span className="size-2.5 rounded-full bg-[var(--brand)]" />
                  <span className="flex-1">{translateDefaultPipelineName(pipeline.nome)}</span>
                  {pipeline.sistema && <span className="text-[10px] uppercase text-muted-foreground">sistema</span>}
                </DropdownMenuItem>
              ))}
              {canGerenciarEtapas && (
                <DropdownMenuItem onClick={() => setPipelineDialog({ mode: "new" })} className="gap-2 border-t border-[var(--border)] mt-1 pt-2 text-[var(--brand-text)] font-semibold">
                  <Plus className="size-3.5" /> {t("crm.new_pipeline", undefined, "Novo funil")}
                </DropdownMenuItem>
              )}
              {canGerenciarEtapas && activePipeline && (
                <DropdownMenuItem onClick={() => setPipelineDialog({ mode: "edit", pipeline: activePipeline })} className="gap-2">
                  <Pencil className="size-3.5" /> {t("crm.rename_pipeline", undefined, "Renomear funil atual")}
                </DropdownMenuItem>
              )}
              {activePipeline && (
                <DropdownMenuItem onClick={() => togglePipelineHidden(activePipeline.id, true)} className="gap-2">
                  <EyeOff className="size-3.5" /> {t("crm.hide_pipeline", undefined, "Ocultar funil atual")}
                </DropdownMenuItem>
              )}
              {canGerenciarEtapas && activePipeline && !activePipeline.sistema && (
                <DropdownMenuItem onClick={() => deletePipeline(activePipeline.id)} className="gap-2 text-destructive">
                  <Trash2 className="size-3.5" /> {t("crm.delete_pipeline", undefined, "Excluir funil atual")}
                </DropdownMenuItem>
              )}
              {hiddenPipelines.length > 0 && (
                <>
                  <div className="border-t border-[var(--border)] mt-1 pt-2 px-2 pb-1 text-[10px] uppercase tracking-wide text-muted-foreground">Ocultos</div>
                  {hiddenPipelines.map((p) => (
                    <DropdownMenuItem key={p.id} onClick={() => togglePipelineHidden(p.id, false)} className="gap-2">
                      <Eye className="size-3.5" />
                      <span className="flex-1 truncate">{translateDefaultPipelineName(p.nome)}</span>
                      <span className="text-[10px] uppercase text-muted-foreground">reativar</span>
                    </DropdownMenuItem>
                  ))}
                </>
              )}

            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {/* Adicionar lead */}
        <Button
          size="sm"
          variant="outline"
          title="Adicionar lead"
          className="size-8 p-0 shrink-0 sm:size-auto sm:h-9 sm:px-3 rounded-full text-[13px]"
          disabled={!activePipelineId || stages.length === 0}
          onClick={() => setAdding(true)}
        >
          <Plus className="size-4 sm:mr-1" /> <span className="hidden sm:inline">{t("crm.from_whatsapp", undefined, "Do WhatsApp")}</span>
        </Button>

        {/* Novo lead manual */}
        <Button
          size="sm"
          variant="outline"
          title="Novo lead"
          className="size-8 p-0 shrink-0 sm:size-auto sm:h-9 sm:px-3 rounded-full text-[13px]"
          disabled={!activePipelineId || stages.length === 0}
          onClick={() => setManualOpen(true)}
        >
          <UserPlus className="size-4 sm:mr-1" /> <span className="hidden sm:inline">{t("crm.new_lead", undefined, "Novo lead")}</span>
        </Button>

        <span className="text-[12px] text-muted-foreground font-medium hidden md:inline">
          {totalContatos} contato{totalContatos === 1 ? "" : "s"}
        </span>

        <div className="hidden sm:block sm:flex-1" />

        {/* Busca (desktop) */}
        <div className="relative hidden sm:block sm:flex-none">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("common.search", undefined, "Buscar...")}
            className="h-8 sm:h-9 w-full sm:w-[200px] pl-9 rounded-full bg-[color:var(--panel-2)] border-[color:var(--hairline)] text-[13px]"
          />
        </div>


        {/* Filtros (popover) */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={`h-8 w-8 sm:h-9 sm:w-auto p-0 sm:px-3 rounded-full text-[13px] gap-1.5 ${hasActiveFilters ? "border-[var(--brand)] text-[var(--brand-text)]" : ""}`}
            >
              <SlidersHorizontal className="size-4" /> <span className="hidden sm:inline">{t("common.filter", undefined, "Filtros")}</span>
              {hasActiveFilters && <span className="ml-1 size-1.5 rounded-full bg-[var(--brand)]" />}
            </Button>

          </PopoverTrigger>
          <PopoverContent align="end" className="w-72 p-3 space-y-3">
            {canFilterByOwner && (
              <div className="space-y-1.5">
                <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">{t("crm.responsible", undefined, "Responsável")}</Label>
                <Select value={ownerFilter} onValueChange={setOwnerFilter}>
                  <SelectTrigger className="h-9 rounded-lg text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("crm.all_attendants", undefined, "Todos atendentes")}</SelectItem>
                    <SelectItem value="_none">{t("crm.unassigned", undefined, "Sem responsável")}</SelectItem>
                    {members.map((m) => (
                      <SelectItem key={m.user_id} value={m.user_id}>
                        {m.nome || m.email || m.user_id.slice(0, 8)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">{t("crm.entry_channel", undefined, "Canal de entrada")}</Label>
              <Select value={canalFilter} onValueChange={setCanalFilter}>
                <SelectTrigger className="h-9 rounded-lg text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("crm.all_channels", undefined, "Todos os canais")}</SelectItem>
                  <SelectItem value="_none">Sem origem</SelectItem>
                  <SelectItem value="whatsapp_direto">WhatsApp direto</SelectItem>
                  <SelectItem value="wa_link_utm">Link com UTM</SelectItem>
                  <SelectItem value="ads_meta">Anúncio Meta</SelectItem>
                  <SelectItem value="ads_google">Anúncio Google</SelectItem>
                  <SelectItem value="formulario">Formulário</SelectItem>
                  <SelectItem value="organico">Orgânico</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border)] px-2.5 py-2">
              <div className="space-y-0.5">
                <Label className="text-[12px] font-semibold">{t("crm.show_archived", undefined, "Mostrar arquivados")}</Label>
                <p className="text-[10px] leading-tight text-muted-foreground">Exibe os leads perdidos que já passaram do prazo.</p>
              </div>
              <Switch checked={showArchived} onCheckedChange={setShowArchived} />
            </div>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={() => { setOwnerFilter("all"); setCanalFilter("all"); }}
                className="text-[12px] font-semibold text-[var(--brand-text)] hover:underline"
              >
                {t("crm.clear_filters", undefined, "Limpar filtros")}
              </button>
            )}
          </PopoverContent>
        </Popover>






        {/* Nova coluna (mobile: só ícone) */}
        <button
          type="button"
          title="Nova coluna"
          disabled={!activePipelineId}
          onClick={() => setNewStageOpen(true)}
          className="sm:hidden grid h-8 w-8 shrink-0 place-items-center rounded-full border border-[color:var(--hairline)] text-muted-foreground disabled:opacity-50"
        >
          <Columns3 className="size-4" />
        </button>

        {/* Nova coluna (CTA primário, desktop) */}
        <Button
          size="sm"
          className="hidden sm:inline-flex h-8 sm:h-9 rounded-full text-[12.5px] sm:text-[13px] px-2 sm:px-3 bg-[var(--brand)] hover:bg-[var(--brand)]/90 text-primary-foreground"
          disabled={!activePipelineId}
          onClick={() => setNewStageOpen(true)}
        >
          <Plus className="size-3.5 mr-1" /> <span>{t("crm.new_stage", undefined, "Nova Coluna")}</span>
        </Button>

        </div>
      </div>

      {/* Legenda de etapas */}
      {stages.length > 0 && (
        <div className="shrink-0 hidden sm:flex items-center gap-3 flex-wrap overflow-x-auto no-scrollbar px-1">
          {stages.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => scrollToStage(s.id)}
              className="inline-flex shrink-0 items-center gap-1.5 text-[11.5px] font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <span className="size-2 rounded-full" style={{ background: s.cor || "#9ca3af" }} />
              <span className="whitespace-nowrap">{translateDefaultStageName(s.nome)}: <b className="text-foreground">{stageCounts[s.id] ?? 0}</b></span>
            </button>
          ))}

        </div>
      )}




      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        autoScroll={{ threshold: { x: 0.15, y: 0.2 }, acceleration: 12 }}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <div
          ref={(el) => {
            if (!el || (el as any).__dragBound) return;
            (el as any).__dragBound = true;
            let isDown = false, startX = 0, startLeft = 0;
            el.addEventListener("pointerdown", (e: PointerEvent) => {
              const target = e.target as HTMLElement;
              if (target.closest("[data-kanban-card],[data-kanban-header],button,a,input,textarea,[role='menu'],[data-radix-popper-content-wrapper]")) return;
              isDown = true;
              startX = e.clientX; startLeft = el.scrollLeft;
            });
            el.addEventListener("pointermove", (e: PointerEvent) => {
              if (!isDown) return;
              el.scrollLeft = startLeft - (e.clientX - startX);
            });
            const end = () => { isDown = false; };
            el.addEventListener("pointerup", end);
            el.addEventListener("pointerleave", end);
            el.addEventListener("wheel", (e: WheelEvent) => {
              if (e.deltaY === 0 || e.deltaX !== 0) return;
              // Se o mouse estiver sobre uma etapa com scroll vertical disponível, deixa rolar a etapa
              const list = (e.target as HTMLElement)?.closest?.("[data-kanban-list]") as HTMLElement | null;
              if (list && list.scrollHeight > list.clientHeight) {
                const atTop = list.scrollTop <= 0;
                const atBottom = Math.ceil(list.scrollTop + list.clientHeight) >= list.scrollHeight;
                if (!(e.deltaY < 0 && atTop) && !(e.deltaY > 0 && atBottom)) return;
              }
              // Sem scroll vertical: não converte em horizontal (board é manual)
            }, { passive: true });
          }}
          className="kanban-board flex flex-1 min-h-0 gap-2.5 sm:gap-3.5 overflow-x-auto overflow-y-hidden pb-2 cursor-grab active:cursor-grabbing p-1.5 sm:p-3 snap-x snap-mandatory sm:snap-none"
        >
          {stages.map((col, idx) => (
            <Column key={col.id} stage={col} count={(byStage[col.id] ?? []).length}
              total={(byStage[col.id] ?? []).reduce((s, c) => s + (Number((c as any).valor) || 0), 0)}
              onToggleValor={(v) => toggleStageValor(col.id, v)}
              onEdit={() => setEditingStage(col)} onDelete={() => deleteStage(col.id)}
              onAutomacao={() => setAutomacaoStage(col)}
              onSetTipo={(t) => setStageTipo(col.id, t)}
              onLimpar={() => setLimparStage(col)}
              onRetorno={() => setRetornoStage(col)}

              allowAutomacao={canGerenciarEtapas}
              onAdd={() => setAdding(true)}
              isDefault={idx === 0}
              isEmpty={(byStage[col.id] ?? []).length === 0}>
              {(byStage[col.id] ?? []).map((c) => (
                <KCard key={c.id} card={c} pauses={pauses} members={members} slaHoras={(col as any).sla_horas ?? null} onClick={() => setSelected(c)} onMove={() => setMovingCard(c)} />
              ))}

            </Column>
          ))}

        </div>
        <DragOverlay
          dropAnimation={{
            duration: 180,
            easing: "cubic-bezier(0.18, 0.67, 0.6, 1.22)",
            sideEffects: defaultDropAnimationSideEffects({ styles: { active: { opacity: "0.4" } } }),
          }}
        >
          {activeCard ? <div className="w-[85vw] max-w-[300px] sm:w-[300px] pointer-events-none"><CardBody card={activeCard} pauses={pauses} members={members} dragging /></div> : null}
        </DragOverlay>
      </DndContext>

      <Sheet open={!!movingCard} onOpenChange={(o) => !o && setMovingCard(null)}>
        <SheetContent side="bottom" className="lg:hidden rounded-t-2xl max-h-[80vh] overflow-y-auto pb-[max(1rem,env(safe-area-inset-bottom))]">
          <SheetHeader className="text-left">
            <SheetTitle className="truncate">Mover {movingCard?.nome || movingCard?.numero}</SheetTitle>
          </SheetHeader>
          <div className="mt-3 space-y-1.5">
            {stages.map((s) => {
              const atual = movingCard?.stage_id === s.id;
              return (
                <button
                  key={s.id}
                  disabled={atual}
                  onClick={() => { if (movingCard) void moveCard(movingCard.id, s.id); setMovingCard(null); }}
                  className={`w-full flex items-center gap-2.5 rounded-xl border px-3 py-3 text-left text-[13.5px] font-medium transition-colors ${
                    atual ? "opacity-50 border-[var(--border)]" : "border-[var(--border)] active:scale-[.99] hover:bg-[var(--panel-2)]"
                  }`}
                >
                  <span className="size-2.5 rounded-full shrink-0" style={{ background: s.cor || "#94a3b8" }} />
                  <span className="flex-1 truncate">{s.nome}</span>
                  {atual && <span className="text-[11px] text-muted-foreground">atual</span>}
                </button>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>

      <StageDialog open={newStageOpen} onClose={() => setNewStageOpen(false)}
        onSave={(n, c, sla) => { createStage(n, c, sla); setNewStageOpen(false); }} />
      <StageDialog open={!!editingStage} onClose={() => setEditingStage(null)}
        initial={editingStage ?? undefined}
        onSave={(n, c, sla) => { if (editingStage) updateStage(editingStage.id, { nome: n, cor: c, sla_horas: sla }); setEditingStage(null); }} />


      <AutomacaoDialog companyId={companyId} stage={automacaoStage} stages={stages} allStages={allStages} pipelines={pipelines} agents={agents} queues={queues}
        members={members}
        onClose={() => setAutomacaoStage(null)}
        onSaved={() => { setAutomacaoStage(null); loadAll(companyId); }} />

      <LimparColunaDialog
        stage={limparStage}
        onClose={() => setLimparStage(null)}
        onSave={async (dias) => {
          const id = limparStage!.id;
          const { error } = await supabase.from("crm_stage").update({ arquivar_perdidos_dias: dias || null } as any).eq("id", id);
          if (error) { toast.error(error.message); return; }
          setLimparStage(null);
          toast.success(dias > 0 ? `Leads somem da coluna ${dias} dias após entrarem nela` : "Limpeza automática desligada");
          await loadAll(companyId);
        }}
      />

      <RotaRetornoDialog
        stage={retornoStage}
        allStages={allStages}
        pipelines={pipelines}
        members={members}
        onClose={() => setRetornoStage(null)}
        onSave={async (patch) => {
          const id = retornoStage!.id;
          const { error } = await supabase.from("crm_stage").update(patch as any).eq("id", id);
          if (error) { toast.error(error.message); return; }
          setRetornoStage(null);
          toast.success("Rota de retorno salva");
          await loadAll(companyId);
        }}
      />


      <PipelineDialog
        state={pipelineDialog}
        queues={queues}
        agents={agents}
        onClose={() => setPipelineDialog(null)}
        onCreate={(nome, qId, aId) => { void createPipeline(nome, qId, aId); setPipelineDialog(null); }}
        onRename={(id, nome, qId, aId) => { void renamePipeline(id, nome, qId, aId).then(() => loadAll(companyId)); setPipelineDialog(null); }}
      />


      <LeadDrawer card={selected} stages={stages} members={members} companyId={companyId}
        onClose={() => setSelected(null)} onChanged={() => loadAll(companyId)} />

      <Dialog open={!!pendingSale} onOpenChange={(o) => { if (!o && !saleSaving) { setPendingSale(null); setSaleValor(""); setSaleDescricao(""); setSaleOwnerId(""); } }}>
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle>Registrar Venda (Ganho)</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <p className="text-sm text-muted-foreground">
              Você está movendo <span className="font-medium text-foreground">{pendingSale?.cardNome ?? "este lead"}</span> para uma etapa de <span className="font-medium text-foreground">Ganho</span>.
            </p>

            <div className="space-y-1.5">
              <Label>Vendedor responsável</Label>
              <Select value={saleOwnerId} onValueChange={setSaleOwnerId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o vendedor..." />
                </SelectTrigger>
                <SelectContent>
                  {members.map((m) => (
                    <SelectItem key={m.user_id} value={m.user_id}>
                      {m.nome || m.email?.split("@")[0] || "Usuário"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Tipo de Item</Label>
                <Select value={saleItemTipo} onValueChange={(v: any) => { setSaleItemTipo(v); setSaleSelectedItemId(""); void loadSaleItems(v); }}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="produto">Produto</SelectItem>
                    <SelectItem value="servico">Serviço</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Item Vendido</Label>
                <Select value={saleSelectedItemId} onValueChange={(v) => {
                  setSaleSelectedItemId(v);
                  const item = saleAvailableItems.find(i => i.id === v);
                  if (item) setSaleValor(String(item.preco));
                }}>
                  <SelectTrigger>
                    <SelectValue placeholder={`Escolha o ${saleItemTipo}...`} />
                  </SelectTrigger>
                  <SelectContent>
                    {saleAvailableItems.map((i) => (
                      <SelectItem key={i.id} value={i.id}>{i.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Observações (opcional)</Label>
              <Input placeholder="Detalhes adicionais da venda..." value={saleDescricao} onChange={e => setSaleDescricao(e.target.value)} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Canal</Label>
                <Select value={saleCanal} onValueChange={setSaleCanal}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">Manual</SelectItem>
                    <SelectItem value="whatsapp">WhatsApp</SelectItem>
                    <SelectItem value="instagram">Instagram</SelectItem>
                    <SelectItem value="facebook">Facebook</SelectItem>
                    <SelectItem value="site">Site/Checkout</SelectItem>
                    <SelectItem value="anuncio">Anúncio</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Método</Label>
                <Select value={saleMetodo} onValueChange={setSaleMetodo}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Pix">Pix</SelectItem>
                    <SelectItem value="Cartão de Crédito">Cartão de Crédito</SelectItem>
                    <SelectItem value="Boleto">Boleto</SelectItem>
                    <SelectItem value="Transferência">Transferência</SelectItem>
                    <SelectItem value="Dinheiro">Dinheiro</SelectItem>
                    <SelectItem value="Outro">Outro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Valor Total (R$)</Label>
              <Input type="number" step="0.01" placeholder="0,00" value={saleValor} onChange={(e) => setSaleValor(e.target.value)} />
            </div>
            
            <p className="text-[10px] text-muted-foreground">
              💡 O card permanece no funil atual. O mesmo lead pode registrar novas vendas movendo o card entre etapas novamente.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setPendingSale(null); setSaleValor(""); setSaleDescricao(""); setSaleOwnerId(""); }} disabled={saleSaving}>Cancelar</Button>
            <Button onClick={confirmSale} disabled={saleSaving}>
              {saleSaving ? "Salvando..." : "Confirmar Venda"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      <ManualLeadDialog open={manualOpen} onClose={() => setManualOpen(false)}
        companyId={companyId} userId={userId} pipelineId={activePipelineId}
        stages={stages} members={members} onAdded={() => loadAll(companyId)} />

      <AddFromWhatsappDialog open={adding} onClose={() => setAdding(false)}
        companyId={companyId} userId={userId} pipelineId={activePipelineId} firstStageId={stages[0]?.id ?? null}
        firstStageNome={stages[0]?.nome ?? "Conversas"}
        onAdded={() => loadAll(companyId)}
        existingNumbers={new Set(allCards.map((c) => c.numero))} />

      <Dialog open={!!pendingLoss} onOpenChange={(o) => { if (!o && !lossSaving) setPendingLoss(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Registrar perda</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Você está movendo <span className="font-medium text-foreground">{pendingLoss?.cardNome ?? "este lead"}</span> para uma etapa de <span className="font-medium text-foreground">Perda</span>.
            </p>
            
            <div className="space-y-2">
              <Label htmlFor="loss-valor">Valor da negociação perdida (R$)</Label>
              <Input
                id="loss-valor"
                inputMode="decimal"
                placeholder="0,00"
                value={lossValor}
                onChange={(e) => setLossValor(e.target.value.replace(/[^\d,.]/g, ""))}
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="loss-motivo">Motivo da perda (opcional)</Label>
              <Input
                id="loss-motivo"
                placeholder="Ex: Preço alto, já comprou com concorrente..."
                value={lossMotivo}
                onChange={(e) => setLossMotivo(e.target.value)}
              />
            </div>

            <div className="space-y-3 pt-2 border-t border-border/50">
              <div className="flex items-center justify-between">
                <Label className="text-[13px] font-semibold text-foreground flex items-center gap-1.5 cursor-pointer" htmlFor="loss-agendar">
                  <Calendar className="size-3.5 text-muted-foreground" />
                  Agendar retorno automático?
                </Label>
                <Switch id="loss-agendar" checked={lossAgendarRetorno} onCheckedChange={setLossAgendarRetorno} />
              </div>
              
              {lossAgendarRetorno && (
                <div className="space-y-3 animate-in fade-in slide-in-from-top-1">
                  <div className="space-y-1.5">
                    <Label htmlFor="loss-date" className="text-[11px] uppercase text-muted-foreground">Quando?</Label>
                    <Input
                      id="loss-date"
                      type="datetime-local"
                      value={lossReturnDate}
                      onChange={(e) => setLossReturnDate(e.target.value)}
                      className="h-9"
                    />
                  </div>
                  
                  <div className="space-y-1.5">
                    <Label htmlFor="loss-stage" className="text-[11px] uppercase text-muted-foreground">Mover para qual etapa?</Label>
                    <Select value={lossReturnStage} onValueChange={setLossReturnStage}>
                      <SelectTrigger id="loss-stage" className="h-9">
                        <SelectValue placeholder="Selecione a etapa de retorno..." />
                      </SelectTrigger>
                      <SelectContent>
                        {stages.filter(s => s.tipo !== "perda" && s.tipo !== "ganho").map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-1.5 pt-2 border-t border-border/50">
              <Label htmlFor="loss-retorno" className="text-[13px] font-semibold text-foreground">
                Se o lead voltar a falar, mover para
              </Label>
              <Select value={lossRetornoStage || "_none"} onValueChange={(v) => setLossRetornoStage(v === "_none" ? "" : v)}>
                <SelectTrigger id="loss-retorno" className="h-9">
                  <SelectValue placeholder="Usar a rota configurada na etapa" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">Usar a rota configurada na etapa</SelectItem>
                  {allStages.filter((s) => s.tipo !== "perda" && s.tipo !== "ganho").map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.nome}{s.pipeline_id !== activePipelineId ? ` (${pipelines.find(p => p.id === s.pipeline_id)?.nome ?? "outro funil"})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                Vale só para este lead. A regra padrão fica na automação da etapa de perda.
              </p>
            </div>

            <p className="text-[11px] text-muted-foreground bg-muted/30 p-2 rounded-lg leading-relaxed">
              💡 O valor informado será contabilizado para métricas de perda no dashboard.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPendingLoss(null)} disabled={lossSaving}>Cancelar</Button>
            <Button variant="destructive" onClick={confirmLoss} disabled={lossSaving}>
              {lossSaving ? "Salvando..." : "Confirmar Perda"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function LimparColunaDialog({ stage, onClose, onSave }:
  { stage: KanbanStage | null; onClose: () => void; onSave: (dias: number) => void | Promise<void> }) {
  const [dias, setDias] = useState("0");
  useEffect(() => {
    if (stage) setDias(String((stage as any).arquivar_perdidos_dias ?? 0));
  }, [stage]);

  return (
    <Dialog open={!!stage} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Limpar coluna {stage?.nome ?? ""}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-[12px] text-muted-foreground">
            Cada lead sai da coluna depois de completar esse prazo <b>contando da data em que ele entrou nela</b> —
            não limpa a coluna inteira de uma vez. Nada é apagado: conversas, contatos e relatórios
            continuam iguais, e você revê os antigos com o filtro "Mostrar arquivados". Deixe 0 para manter todos.
          </p>
          <div className="flex items-center gap-2">
            <Input type="number" min={0} className="w-28" value={dias} onChange={(e) => setDias(e.target.value)} />
            <span className="text-sm text-muted-foreground">dias na coluna</span>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => void onSave(Number(dias) || 0)}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RotaRetornoDialog({ stage, allStages, pipelines, members, onClose, onSave }: {
  stage: KanbanStage | null;
  allStages: KanbanStage[];
  pipelines: Pipeline[];
  members: { user_id: string; email?: string | null; nome?: string | null }[];
  onClose: () => void;
  onSave: (patch: any) => void | Promise<void>;
}) {
  const [f, setF] = useState<any>({
    retorno_ativo: false, retorno_stage_id: "", retorno_pipeline_id: "",
    retorno_responsavel_modo: "manter", retorno_user_id: "", retorno_modo_atendimento: "humano", retorno_janela_dias: "0",
  });

  useEffect(() => {
    if (!stage) return;
    const s = stage as any;
    setF({
      retorno_ativo: !!s.retorno_ativo,
      retorno_stage_id: s.retorno_stage_id ?? "",
      retorno_pipeline_id: s.retorno_pipeline_id ?? "",
      retorno_responsavel_modo: s.retorno_responsavel_modo ?? "manter",
      retorno_user_id: s.retorno_user_id ?? "",
      retorno_modo_atendimento: s.retorno_modo_atendimento ?? "humano",
      retorno_janela_dias: String(s.retorno_janela_dias ?? 0),
    });
  }, [stage]);

  const groups = pipelines.map((p) => ({
    pipeline: p,
    stages: allStages.filter((s) => s.pipeline_id === p.id && s.id !== stage?.id),
  })).filter((g) => g.stages.length > 0);

  return (
    <Dialog open={!!stage} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Rota de retorno — {stage?.nome ?? ""}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[12px] text-muted-foreground">
              Se o lead perdido voltar a falar, ele sai da coluna de Perda e volta automaticamente para a etapa escolhida.
            </p>
            <Switch checked={f.retorno_ativo} onCheckedChange={(v) => setF({ ...f, retorno_ativo: v })} />
          </div>

          {f.retorno_ativo && (
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <Label>Voltar para a etapa</Label>
                <select
                  className="w-full mt-1 rounded-md border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-sm"
                  value={f.retorno_stage_id}
                  onChange={(e) => {
                    const dest = allStages.find((s) => s.id === e.target.value);
                    setF({ ...f, retorno_stage_id: e.target.value, retorno_pipeline_id: dest?.pipeline_id ?? "" });
                  }}
                >
                  <option value="">— selecione —</option>
                  {groups.map((g) => (
                    <optgroup key={g.pipeline.id} label={`Funil: ${g.pipeline.nome}`}>
                      {g.stages.map((s) => <option key={s.id} value={s.id}>{translateDefaultStageName(s.nome)}</option>)}
                    </optgroup>
                  ))}
                </select>
                <p className="text-[11px] text-muted-foreground mt-1">Pode ser em outro funil (ex.: Reengajamento).</p>
              </div>

              <div>
                <Label>Responsável ao retornar</Label>
                <select
                  className="w-full mt-1 rounded-md border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-sm"
                  value={f.retorno_responsavel_modo}
                  onChange={(e) => setF({ ...f, retorno_responsavel_modo: e.target.value })}
                >
                  <option value="manter">Manter o responsável atual</option>
                  <option value="fila">Distribuir pela fila</option>
                  <option value="fixo">Usuário fixo</option>
                </select>
                {f.retorno_responsavel_modo === "fixo" && (
                  <select
                    className="w-full mt-2 rounded-md border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-sm"
                    value={f.retorno_user_id}
                    onChange={(e) => setF({ ...f, retorno_user_id: e.target.value })}
                  >
                    <option value="">— selecione —</option>
                    {members.map((m) => (
                      <option key={m.user_id} value={m.user_id}>{m.nome || m.email || m.user_id}</option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <Label>Quem atende no retorno</Label>
                <select
                  className="w-full mt-1 rounded-md border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-sm"
                  value={f.retorno_modo_atendimento}
                  onChange={(e) => setF({ ...f, retorno_modo_atendimento: e.target.value })}
                >
                  <option value="humano">Humano assume</option>
                  <option value="ia">IA assume</option>
                </select>
              </div>

              <div className="sm:col-span-2">
                <Label>Reativar só se voltar em até (dias)</Label>
                <Input type="number" min={0} className="mt-1" value={f.retorno_janela_dias}
                  onChange={(e) => setF({ ...f, retorno_janela_dias: e.target.value })} />
                <p className="text-[11px] text-muted-foreground mt-1">0 = sempre reativa, sem prazo.</p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => void onSave({
            retorno_ativo: !!f.retorno_ativo,
            retorno_stage_id: f.retorno_stage_id || null,
            retorno_pipeline_id: f.retorno_pipeline_id || null,
            retorno_responsavel_modo: f.retorno_responsavel_modo || "manter",
            retorno_user_id: f.retorno_responsavel_modo === "fixo" ? (f.retorno_user_id || null) : null,
            retorno_modo_atendimento: f.retorno_modo_atendimento || "humano",
            retorno_janela_dias: Number(f.retorno_janela_dias) || 0,
          })}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


function Column({ stage, count, total, onToggleValor, children, onEdit, onDelete, onAutomacao, onSetTipo, onLimpar, onRetorno, allowAutomacao, onAdd, isDefault, isEmpty }:
  { stage: KanbanStage; count: number; total?: number; onToggleValor?: (v: boolean) => void; children: React.ReactNode; onEdit: () => void; onDelete: () => void; onAutomacao: () => void; onSetTipo: (t: "normal" | "ganho" | "perda" | "formulario" | "sem-formulario") => void; onLimpar?: () => void; onRetorno?: () => void; allowAutomacao: boolean; onAdd: () => void; isDefault?: boolean; isEmpty: boolean }) {
  const { setNodeRef: setColRef, isOver } = useDroppable({ id: `col:${stage.id}` });
  const { attributes, listeners, setNodeRef: setHandleRef } = useDraggable({ id: `stage:${stage.id}` });
  const { t, translateDefaultStageName } = useLanguage();
  const tipo = (stage as any).tipo ?? "normal";
  const entradaForm = !!(stage as any).entrada_formulario;
  const mostrarValor = (stage as any).mostrar_valor !== false;
  const stageMeta = resolveStageAiMeta(stage as any);
  const isAiLocked = stageMeta.bloqueada_para_ia;
  const hasAiCriteria = Boolean(stageMeta.criterio_ia);

  return (
    <div ref={setColRef} id={`kcol-${stage.id}`}
      className={`flex flex-col rounded-lg border bg-white h-full min-h-0 transition-colors snap-start shrink-0 w-[85vw] max-w-[320px] sm:w-[300px] ${
        isOver ? "border-[var(--brand)]/60 ring-2 ring-[var(--brand)]/20" : "border-[color:var(--hairline)]"
      }`}>
      <div ref={setHandleRef} {...attributes} {...listeners} data-kanban-header
        className="px-3.5 pt-3 pb-2.5 cursor-grab">
        <div className="flex items-center gap-2">
        <span className="size-2.5 rounded-full shrink-0" style={{ background: stage.cor }} />
        <b className="font-display text-[13.5px] truncate flex-1">{translateDefaultStageName(stage.nome)}</b>
        <span className="text-[11px] font-semibold text-muted-foreground bg-[color:var(--panel-2)] px-2 py-0.5 rounded-md min-w-[22px] text-center leading-5">{count}</span>
        {isDefault && <span className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground bg-[color:var(--panel-2)] px-1.5 py-0.5 rounded">{t("common.default", undefined, "Padrão")}</span>}
        {tipo === "ganho" && <span className="text-[9px] font-bold uppercase tracking-wide text-[#22B85F] bg-[#22B85F]/12 px-1.5 py-0.5 rounded">{t("crm.stage_won", undefined, "Ganho")}</span>}
        {tipo === "perda" && <span className="text-[9px] font-bold uppercase tracking-wide text-[#FF5A5A] bg-[#FF5A5A]/12 px-1.5 py-0.5 rounded">{t("crm.stage_lost", undefined, "Perda")}</span>}
        {entradaForm && <span className="text-[9px] font-bold uppercase tracking-wide text-[var(--brand)] bg-[var(--brand)]/12 px-1.5 py-0.5 rounded">{t("crm.form", undefined, "Formulário")}</span>}
        {hasAiCriteria && (
          <span className="text-[9px] font-bold uppercase tracking-wide text-primary bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded flex items-center gap-0.5 cursor-help" title={stageMeta.criterio_ia}>
            <Sparkles className="size-2.5 text-primary" />IA
          </span>
        )}
        {isAiLocked && <span className="text-[9px] font-bold uppercase tracking-wide text-amber-700 bg-amber-500/10 border border-amber-200/60 px-1.5 py-0.5 rounded flex items-center gap-0.5" title={t("crm.stage_locked_alert", undefined, "Esta etapa está protegida contra movimentos automáticos de IA.")}><Lock className="size-2.5" />{t("crm.stage_locked_badge", undefined, "Bloqueada")}</span>}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="text-muted-foreground hover:text-foreground p-1 rounded-md" onPointerDown={(e) => e.stopPropagation()}>
              <MoreHorizontal className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {allowAutomacao && <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setTimeout(onEdit, 0); }}><Pencil className="size-3.5 mr-2" />Renomear / cor</DropdownMenuItem>}
            {allowAutomacao && <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setTimeout(onAutomacao, 0); }}><Zap className="size-3.5 mr-2" />Automação</DropdownMenuItem>}
            {onToggleValor && (
              <DropdownMenuItem onClick={() => onToggleValor(!mostrarValor)}>
                <Coins className="size-3.5 mr-2" />{mostrarValor ? "Ocultar valor total" : "Mostrar valor total"}
              </DropdownMenuItem>
            )}
            {allowAutomacao && tipo !== "ganho" && <DropdownMenuItem onClick={() => onSetTipo("ganho")}>🏆 Marcar como Ganho</DropdownMenuItem>}
            {allowAutomacao && tipo === "perda" && onRetorno && (
              <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setTimeout(onRetorno, 0); }}>
                <RefreshCw className="size-3.5 mr-2" />Rota de retorno
              </DropdownMenuItem>
            )}
            {allowAutomacao && tipo === "perda" && onLimpar && (
              <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setTimeout(onLimpar, 0); }}>
                <Trash2 className="size-3.5 mr-2" />Limpar coluna
              </DropdownMenuItem>
            )}
            {allowAutomacao && tipo !== "perda" && <DropdownMenuItem onClick={() => onSetTipo("perda")}>❌ Marcar como Perda</DropdownMenuItem>}
            {allowAutomacao && tipo === "normal" && !entradaForm && <DropdownMenuItem onClick={() => onSetTipo("formulario")}>📝 Marcar como Formulário</DropdownMenuItem>}
            {allowAutomacao && entradaForm && <DropdownMenuItem onClick={() => onSetTipo("sem-formulario")}>📝 Remover marcação de Formulário</DropdownMenuItem>}
            {allowAutomacao && tipo !== "normal" && <DropdownMenuItem onClick={() => onSetTipo("normal")}>↺ Voltar a Normal</DropdownMenuItem>}
            {allowAutomacao && <DropdownMenuItem onClick={onDelete} className="text-destructive"><Trash2 className="size-3.5 mr-2" />Excluir</DropdownMenuItem>}
          </DropdownMenuContent>
        </DropdownMenu>
        </div>
        {mostrarValor && (total ?? 0) > 0 && (
          <div className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-[#22B85F]/12 px-2.5 py-1.5">
            <Coins className="size-3.5 text-[#159A4C] shrink-0" />
            <span className="font-display text-[15px] font-extrabold leading-none tabular-nums text-[#159A4C]">
              {(total ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })}
            </span>
          </div>
        )}
      </div>

      <div data-kanban-list className="flex-1 px-3 pb-2 space-y-2 overflow-y-auto overscroll-contain">
        {children}
        {isEmpty && (
          <div className="flex flex-col items-center justify-center gap-2 mt-4 rounded-xl border border-dashed border-[color:var(--hairline)] py-6 px-3 text-center select-none">
            <span className="grid place-items-center size-10 rounded-full bg-[color:var(--panel-2)] text-muted-foreground">
              <UserIcon className="size-5" />
            </span>
            <span className="text-[12px] text-muted-foreground">Nenhum contato</span>
          </div>
        )}
      </div>
      <button
        onClick={onAdd}
        onPointerDown={(e) => e.stopPropagation()}
        className="flex items-center justify-center gap-1.5 text-[12px] text-muted-foreground hover:text-[var(--brand)] hover:bg-[var(--brand-soft)]/40 border-t border-[color:var(--hairline)] py-2.5 rounded-b-lg transition-colors">
        <Plus className="size-3.5" /> Nova oportunidade
      </button>

    </div>
  );
}


function KCard({ card, pauses, members, onClick, onMove, slaHoras }: { card: LeadCard; pauses: Record<string, boolean>; members: Member[]; onClick: () => void; onMove?: () => void; slaHoras?: number | null }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: card.id });
  const iaActive = pauses[card.numero] === false;

  return (
    <div ref={setNodeRef} {...attributes} {...listeners} data-kanban-card
      onClick={() => { if (!isDragging) onClick(); }}
      className={cn("cursor-grab", isDragging && "opacity-40")}
      style={{
        touchAction: "manipulation",
        WebkitUserSelect: "none",
        userSelect: "none",
        WebkitTouchCallout: "none",
      }}>
      <CardBody card={card} pauses={pauses} members={members} onMove={onMove} iaActive={iaActive} slaHoras={slaHoras} />

    </div>
  );
}


function CardBody({ card, pauses, members, dragging, onMove, iaActive, slaHoras }: { card: LeadCard; pauses: Record<string, boolean>; members: Member[]; dragging?: boolean; onMove?: () => void; iaActive?: boolean; slaHoras?: number | null }) {
  const time = new Date(card.ultima_em);
  const navigate = useNavigate();
  const owner = members.find((m) => m.user_id === (card as any).owner_id);
  const iaOn = !(pauses as any)[card.numero];
  const canal = (card as any).canal_entrada as CanalEntrada | undefined;
  const canalNome = ((card as any).canal_custom as string | null) || (canal ? CANAL_LABEL[canal] : "");
  const temValor = card.valor != null && Number(card.valor) > 0;
  const [agendarOpen, setAgendarOpen] = useState(false);
  const [encaminharOpen, setEncaminharOpen] = useState(false);

  const slaAtraso = (() => {
    if (!slaHoras || slaHoras <= 0) return null;
    const base = (card as any).entrou_stage_em || card.ultima_em;
    if (!base) return null;
    const horas = (Date.now() - new Date(base).getTime()) / 3600000;
    if (horas <= slaHoras) return null;
    const atraso = horas - slaHoras;
    return atraso >= 24 ? `${Math.floor(atraso / 24)}d atrasado` : `${Math.max(1, Math.floor(atraso))}h atrasado`;
  })();


  return (
    <div className={`group relative overflow-hidden rounded-lg border bg-card pl-4 pr-2.5 py-2.5 transition-all ${
      dragging ? "shadow-2xl ring-2 ring-[var(--brand)]/40 rotate-1 border-[var(--brand)]/40" : "border-[var(--border)] shadow-sm hover:shadow-md hover:border-[var(--brand)]/30"
    }`}>
      {/* barra lateral de destaque */}
      <span
        className="absolute left-0 top-0 bottom-0 w-[5px]"
        style={{ background: canal && CANAL_COLOR[canal] ? CANAL_COLOR[canal] : "var(--brand)" }}
      />



      {/* topo: avatar + nome + telefone + ações */}
      <div className="flex items-center gap-2.5">
        <InitialsAvatar name={card.nome || card.numero} src={card.foto_url} size={32} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 min-w-0">
            <span className="text-[13px] font-semibold leading-tight truncate tracking-tight">
              {card.nome || card.numero}
            </span>
            {(card as any).tipo_contato === "cliente" && (
              <Star className="size-3 shrink-0 fill-amber-400 text-amber-400" aria-label="Cliente" />
            )}
          </div>
          <div className="text-[11px] text-muted-foreground tabular-nums truncate leading-tight">
            {card.numero}
          </div>
        </div>
        {temValor && (
          <span className="shrink-0 font-display font-bold text-[13px] text-[var(--brand-text)] tabular-nums leading-tight">
            R$ {Number(card.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
          </span>
        )}
      </div>

      {/* Banner de sugestão da IA */}
      {(() => {
        const diag = (card as any).campos_extras?.ultimo_diagnostico_ia;
        if (diag?.etapa_sugerida_id && diag.etapa_sugerida_id !== card.stage_id) {
          return (
            <div className="mt-1.5 mb-1 flex items-center gap-1.5 rounded-md bg-amber-500/10 border border-amber-500/25 px-2 py-1 text-[11px] text-amber-800 dark:text-amber-300">
              <Sparkles className="size-3 shrink-0 text-amber-600 animate-pulse" />
              <span className="truncate">
                <span className="font-semibold">{t("crm.ai_suggests", undefined, "IA sugiere")}:</span> {diag.etapa_sugerida_nome}
              </span>
            </div>
          );
        }
        return null;
      })()}

      {/* etiquetas + ações rápidas */}
      {(card.tags?.length > 0 || iaOn || canal || slaAtraso || !dragging) && (
        <div className="flex items-center justify-between gap-2 mt-2">
          <div className="flex flex-wrap items-center gap-1.5 min-w-0">
            {slaAtraso && (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 text-red-600 dark:text-red-400 px-2 py-0.5 text-[10.5px] font-bold leading-none shrink-0">
                <Clock className="size-3" /> {slaAtraso}
              </span>
            )}
            {iaOn && (
              <span className="text-[10.5px] font-semibold text-[var(--brand-text)] bg-[var(--brand)]/10 px-2 py-0.5 rounded-full inline-flex items-center gap-1 leading-none">
                <Sparkles className="size-3 shrink-0" /> IA
              </span>
            )}
            {canal && CANAL_LABEL[canal] && (
              <span
                title={canalNome}
                className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full inline-flex items-center leading-none max-w-[120px]"
                style={{ color: CANAL_COLOR[canal], backgroundColor: `${CANAL_COLOR[canal]}1A` }}
              >
                <span className="truncate">{canalNome}</span>
              </span>
            )}
            {card.tags?.map((t) => (
              <span key={t} className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground leading-none max-w-[120px] truncate">{t}</span>
            ))}
          </div>
          {!dragging && (
            <div className="shrink-0 flex items-center gap-0.5 opacity-50 group-hover:opacity-100 transition-opacity">
              {onMove && (
                <button
                  type="button"
                  title="Mover para outra etapa"
                  aria-label="Mover para outra etapa"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); onMove(); }}
                  className="lg:hidden grid place-items-center size-7 rounded-full text-muted-foreground hover:text-[var(--brand-text)] hover:bg-[var(--brand)]/12 transition-colors"
                >
                  <ArrowRightLeft className="size-4" />
                </button>
              )}
              {card.numero && (
                <button
                  type="button"
                  title="Abrir conversa no WhatsApp"
                  aria-label="Abrir conversa"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate({ to: "/app/conversas", search: { n: card.numero } });
                  }}
                  className="grid place-items-center size-7 rounded-full text-[#25D366] hover:bg-[#25D366]/12 transition-colors"
                >
                  <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden>
                    <path d="M12.04 2c-5.5 0-9.96 4.46-9.96 9.96 0 1.76.46 3.48 1.34 5L2 22l5.2-1.36a9.9 9.9 0 0 0 4.84 1.24h.01c5.5 0 9.96-4.46 9.96-9.96 0-2.66-1.04-5.16-2.92-7.04A9.88 9.88 0 0 0 12.04 2Zm0 1.84c2.17 0 4.2.84 5.74 2.38a8.06 8.06 0 0 1 2.38 5.74c0 4.48-3.64 8.12-8.12 8.12a8.1 8.1 0 0 1-4.13-1.13l-.3-.18-3.08.8.82-3-.19-.31a8.05 8.05 0 0 1-1.24-4.3c0-4.48 3.64-8.12 8.12-8.12Zm-3.2 4.2c-.16 0-.42.06-.64.3-.22.24-.84.82-.84 2s.86 2.32.98 2.48c.12.16 1.68 2.68 4.16 3.64 2.06.8 2.48.64 2.92.6.44-.04 1.44-.58 1.64-1.16.2-.58.2-1.06.14-1.16-.06-.1-.22-.16-.46-.28-.24-.12-1.44-.72-1.66-.8-.22-.08-.38-.12-.54.12-.16.24-.62.8-.76.96-.14.16-.28.18-.52.06-.24-.12-1.02-.38-1.94-1.2-.72-.64-1.2-1.42-1.34-1.66-.14-.24-.02-.36.1-.48.11-.11.24-.28.36-.42.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.54-1.32-.76-1.8-.2-.46-.4-.4-.54-.4h-.52Z" />
                  </svg>
                </button>
              )}
              <button
                type="button"
                title="Agendar"
                aria-label="Agendar"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); setAgendarOpen(true); }}
                className="grid place-items-center size-7 rounded-full text-[var(--brand-text)] hover:bg-[var(--brand)]/12 transition-colors"
              >
                <CalendarPlus className="size-4" />
              </button>
              <button
                type="button"
                title="Encaminhar atendimento"
                aria-label="Encaminhar atendimento"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); setEncaminharOpen(true); }}
                className="grid place-items-center size-7 rounded-full text-[var(--brand-text)] hover:bg-[var(--brand)]/12 transition-colors"
              >
                <Forward className="size-4" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* última mensagem (entrada ou saída) */}
      {card.ultima_mensagem && (
        <p className="text-muted-foreground text-[12px] mt-2 line-clamp-1 leading-snug border-l-2 border-[var(--border)] pl-2">
          {(card as any).ultima_direcao === "saida" && (
            <span className="font-medium text-foreground/70">Você: </span>
          )}
          {card.ultima_mensagem}
        </p>
      )}

      {/* rodapé: valor | responsável + data */}
      <div className="flex items-center gap-2 mt-2.5 pt-2 border-t border-[var(--border)]">
        <InitialsAvatar name={iaOn ? "Agente IA" : (owner?.nome || "Humano")} size={20} />
        <span className="text-[11.5px] font-medium truncate min-w-0 flex-1 leading-tight">
          {iaOn ? "Agente IA" : (owner?.nome || "Humano")}
        </span>
        <span className="text-[10.5px] text-muted-foreground tabular-nums truncate leading-tight shrink-0">
          {time.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })} • {time.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
        </span>
        {iaActive && <Bot className="size-3.5 text-[var(--brand)] shrink-0" />}
      </div>

      <div onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
        {agendarOpen && (
          <QuickScheduleDialog
            open={agendarOpen}
            onOpenChange={setAgendarOpen}
            target={{ numero: card.numero, nome: card.nome, cardId: card.id }}
          />
        )}

        {encaminharOpen && (
          <EncaminharDialog
            open={encaminharOpen}
            onOpenChange={setEncaminharOpen}
            numero={card.numero}
          />
        )}
      </div>
    </div>
  );
}




function StageDialog({ open, onClose, onSave, initial }:
  { open: boolean; onClose: () => void; onSave: (nome: string, cor: string, slaHoras: number | null) => void; initial?: Stage }) {
  const [nome, setNome] = useState(initial?.nome ?? "");
  const [cor, setCor] = useState(initial?.cor ?? STAGE_COLORS[0]);
  const [sla, setSla] = useState<string>(String((initial as any)?.sla_horas ?? ""));
  useEffect(() => {
    if (open) {
      setNome(initial?.nome ?? "");
      setCor(initial?.cor ?? STAGE_COLORS[0]);
      setSla(String((initial as any)?.sla_horas ?? ""));
    }
  }, [open, initial?.id]);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{initial ? "Editar etapa" : "Nova etapa"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Nome</Label><Input value={nome} onChange={(e) => setNome(e.target.value)} autoFocus /></div>
          <div>
            <Label className="flex items-center gap-1.5"><Clock className="size-3.5" />Prazo de atendimento (horas)</Label>
            <Input
              type="number" min={0} placeholder="Sem prazo"
              value={sla}
              onChange={(e) => setSla(e.target.value)}
              className="mt-1"
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Opcional. Cards parados nesta etapa além do prazo aparecem marcados como atrasados.
            </p>
          </div>
          <div>
            <Label className="flex items-center gap-1.5"><Palette className="size-3.5" />Cor</Label>
            <div className="flex flex-wrap gap-2 mt-2">
              {STAGE_COLORS.map((c) => (
                <button key={c} onClick={() => setCor(c)}
                  className={`size-8 rounded-full ring-2 transition ${cor === c ? "ring-[var(--brand)] scale-110" : "ring-transparent"}`}
                  style={{ background: c }} />
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => nome.trim() && onSave(nome.trim(), cor, sla.trim() === "" ? null : Math.max(0, Number(sla)) || null)}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


function AddFromWhatsappDialog({ open, onClose, companyId, userId, pipelineId, firstStageId, firstStageNome, onAdded, existingNumbers }: {
  open: boolean; onClose: () => void; companyId: string; userId: string;
  pipelineId: string | null; firstStageId: string | null; firstStageNome: string;
  onAdded: () => void; existingNumbers: Set<string>;
}) {
  const [convs, setConvs] = useState<{ numero: string; contato_nome: string | null; texto: string; created_at: string }[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!open || !companyId) return;
    void (async () => {
      setLoading(true);
      const { data } = await supabase.from("mensagens")
        .select("numero,contato_nome,texto,created_at").eq("company_id", companyId)
        .order("created_at", { ascending: false }).limit(100);
      const seen = new Set<string>(); const list: typeof convs = [];
      (data ?? []).forEach((m: any) => {
        if (seen.has(m.numero) || existingNumbers.has(m.numero)) return;
        seen.add(m.numero); list.push(m);
      });
      setConvs(list); setLoading(false);
    })();
  }, [open, companyId]);

  async function add(c: any) {
    const { error } = await supabase.from("crm_cards").upsert({
      company_id: companyId, user_id: userId, numero: c.numero, nome: c.contato_nome,
      pipeline_id: pipelineId, status: firstStageNome, stage_id: firstStageId,
      ultima_mensagem: c.texto.slice(0, 240), ultima_em: new Date().toISOString(),
    }, { onConflict: "company_id,numero" });
    if (error) return toast.error(error.message);
    toast.success("Adicionado");
    onAdded(); onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Conversas recentes do WhatsApp</DialogTitle></DialogHeader>
        {loading ? <div className="text-sm text-muted-foreground py-6 text-center">Carregando…</div>
          : convs.length === 0 ? <div className="text-sm text-muted-foreground py-6 text-center">Nenhuma conversa nova.</div>
          : (
            <ul className="max-h-80 overflow-auto divide-y divide-[var(--border)]">
              {convs.map((c) => (
                <li key={c.numero} className="py-2.5 flex items-center gap-3">
                  <InitialsAvatar name={c.contato_nome || c.numero} size={32} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{c.contato_nome || c.numero}</div>
                    <div className="text-xs text-muted-foreground truncate">{c.texto}</div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => add(c)}>Adicionar</Button>
                </li>
              ))}
            </ul>
          )}
      </DialogContent>
    </Dialog>
  );
}

function ManualLeadDialog({ open, onClose, companyId, userId, pipelineId, stages, members, onAdded }: {
  open: boolean; onClose: () => void; companyId: string; userId: string;
  pipelineId: string | null; stages: KanbanStage[]; members: Member[]; onAdded: () => void;
}) {
  const [nome, setNome] = useState("");
  const [numero, setNumero] = useState("");
  const [email, setEmail] = useState("");
  const [valor, setValor] = useState("");
  const [stageId, setStageId] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [canal, setCanal] = useState<string>("whatsapp_direto");
  const [canalCustom, setCanalCustom] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setNome(""); setNumero(""); setEmail(""); setValor(""); setCanal("whatsapp_direto"); setCanalCustom("");
    setStageId(stages[0]?.id ?? ""); setOwnerId("");
  }, [open]);

  async function salvar() {
    if (!nome.trim()) return toast.error("Informe o nome do lead");
    if (!stageId) return toast.error("Escolha a coluna");
    if (canal === "outro" && !canalCustom.trim()) return toast.error("Informe o nome do canal");
    setSaving(true);
    const stage = stages.find((s) => s.id === stageId);
    const numeroLimpo = numero.replace(/\D/g, "");
    const valorNum = valor ? Number(valor.replace(/\./g, "").replace(",", ".")) : null;
    const { error } = await supabase.from("crm_cards").insert({
      company_id: companyId,
      user_id: userId,
      numero: numeroLimpo || `manual:${crypto.randomUUID().slice(0, 12)}`,
      nome: nome.trim(),
      email: email.trim() || null,
      valor: valorNum,
      pipeline_id: pipelineId,
      stage_id: stageId,
      status: stage?.nome ?? null,
      owner_id: ownerId || null,
      canal_entrada: canal,
      canal_custom: canal === "outro" ? canalCustom.trim() : null,
      origem: "manual",
      ultima_em: new Date().toISOString(),
    } as any);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Lead adicionado");
    onAdded(); onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !saving) onClose(); }}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader><DialogTitle>Novo lead</DialogTitle></DialogHeader>
        <div className="space-y-3 py-1">
          <div className="space-y-1.5">
            <Label className="text-[12px]">Nome *</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome do lead" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[12px]">Telefone</Label>
              <Input value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="Opcional" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px]">E-mail</Label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Opcional" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[12px]">Valor da oportunidade</Label>
              <Input value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" inputMode="decimal" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px]">Coluna</Label>
              <Select value={stageId} onValueChange={setStageId}>
                <SelectTrigger><SelectValue placeholder="Escolher" /></SelectTrigger>
                <SelectContent>
                  {stages.map((s) => <SelectItem key={s.id} value={s.id}>{translateDefaultStageName(s.nome)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[12px]">Canal de origem</Label>
              <Select value={canal} onValueChange={setCanal}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CANAIS_MANUAIS.map((c) => (
                    <SelectItem key={c} value={c}>{CANAL_LABEL[c]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px]">Responsável</Label>
              <Select value={ownerId || "_none"} onValueChange={(v) => setOwnerId(v === "_none" ? "" : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">Sem responsável</SelectItem>
                  {members.map((m) => (
                    <SelectItem key={m.user_id} value={m.user_id}>{m.nome || m.email || m.user_id.slice(0, 8)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {canal === "outro" && (
            <div className="space-y-1.5">
              <Label className="text-[12px]">Nome do canal *</Label>
              <Input value={canalCustom} onChange={(e) => setCanalCustom(e.target.value)} placeholder="Ex.: Feira de negócios" />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={salvar} disabled={saving}>{saving ? "Salvando..." : "Adicionar lead"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AutomacaoDialog({ companyId, stage, stages, allStages, pipelines, agents, queues, members, onClose, onSaved }: {
  companyId: string;
  stage: KanbanStage | null;
  stages: KanbanStage[];
  allStages: KanbanStage[];
  pipelines: Pipeline[];
  agents: AgentOpt[];
  queues: DistQueue[];

  members: { user_id: string; email?: string | null; nome?: string | null }[];

  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useLanguage();
  const generateAi = useServerFn(generateAutomacaoMessage);
  // Rota de retorno agora é padrão em etapas de Perda.
  const [form, setForm] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [automationTab, setAutomationTab] = useState("atendimento");
  const mediaInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!stage) { setForm(null); return; }
    const s = stage as any;
    const aiMeta = resolveStageAiMeta(s);
    setForm({
      modo_atendimento: s.modo_atendimento ?? "auto",
      criterio_ia: aiMeta.criterio_ia ?? "",
      bloqueada_para_ia: !!aiMeta.bloqueada_para_ia,
      agent_id: s.agent_id ?? "",
      ia_handoff_stage_id: s.ia_handoff_stage_id ?? "",
      distribution_queue_id: s.distribution_queue_id ?? "",
      distribution_user_id: s.distribution_user_id ?? "",

      regua_ativa: !!s.regua_ativa,
      delay_valor: s.delay_valor ?? 0,
      delay_unidade: s.delay_unidade ?? "dias",
      hora_do_dia: s.hora_do_dia ?? "",
      mensagem_tipo: s.mensagem_tipo ?? "template",
      mensagem_texto: s.mensagem_texto ?? "",
      mensagem_prompt: aiMeta.mensagem_prompt ?? "",
      mensagem_midia_url: s.mensagem_midia_url ?? "",
      mensagem_midia_tipo: s.mensagem_midia_tipo ?? "",
      mensagem_midia_mime: s.mensagem_midia_mime ?? "",
      mensagem_midia_nome: s.mensagem_midia_nome ?? "",
      move_se_respondeu_para: s.move_se_respondeu_para ?? "",
      move_se_sem_resposta_dias: s.move_se_sem_resposta_dias ?? 0,
      move_se_sem_resposta_para: s.move_se_sem_resposta_para ?? "",
      move_se_negativo_para: s.move_se_negativo_para ?? "",
      move_se_positivo_para: s.move_se_positivo_para ?? "",
      intent_handling_enabled: !!s.intent_handling_enabled,
      parar_se_responder: s.parar_se_responder ?? true,
      parar_se_humano: s.parar_se_humano ?? true,
      move_apos_qualificar_para: s.move_apos_qualificar_para ?? "",
      retorno_ativo: !!s.retorno_ativo,
      retorno_pipeline_id: s.retorno_pipeline_id ?? "",
      retorno_stage_id: s.retorno_stage_id ?? "",
      retorno_responsavel_modo: s.retorno_responsavel_modo ?? "manter",
      retorno_user_id: s.retorno_user_id ?? "",
      retorno_modo_atendimento: s.retorno_modo_atendimento ?? "humano",
      retorno_janela_dias: s.retorno_janela_dias ?? 0,
      arquivar_perdidos_dias: (s as any).arquivar_perdidos_dias ?? 0,
    });
  }, [stage?.id]);

  if (!stage || !form) return null;
  const currentStage = stage;
  const currentStageId = currentStage.id;

  // Todas as etapas do sistema (agrupadas por funil), exceto a atual.
  // Permite mover o lead entre funis (ex.: Comercial → Follow-up).
  const stageGroups = pipelines.map((p) => ({
    pipeline: p,
    stages: allStages.filter((s) => s.pipeline_id === p.id && s.id !== currentStage.id),
  })).filter((g) => g.stages.length > 0);

  function StageSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
    return (
      <select className="w-full mt-1 rounded-md border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-sm"
        value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">— não mover —</option>
        {stageGroups.map((g) => (
          <optgroup key={g.pipeline.id} label={`Funil: ${g.pipeline.nome}`}>
            {g.stages.map((s) => (
              <option key={s.id} value={s.id}>
                 {s.pipeline_id === currentStage.pipeline_id ? translateDefaultStageName(s.nome) : `${translateDefaultStageName(s.nome)} (${translateDefaultPipelineName(g.pipeline.nome)})`}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    );
  }

  async function gerarMensagemIa() {
    const prompt = String(form.mensagem_prompt || "").trim();
    if (!prompt) return toast.error("Escreva um prompt para a IA gerar a mensagem.");
    setGenerating(true);
    try {
      const contexto = `Etapa do CRM: "${currentStage.nome}". Disparo após ${form.delay_valor || 0} ${form.delay_unidade}.`;
      const r: any = await generateAi({ data: { prompt, contexto } });
      const texto = String(r?.texto || "").trim();
      if (!texto) throw new Error("A IA não retornou uma mensagem.");
      setForm((f: any) => ({ ...f, mensagem_tipo: "template", mensagem_texto: texto }));
      toast.success("Mensagem gerada e definida como padrão.");
    } catch (e: any) {
      toast.error(e?.message || "Falha ao gerar mensagem.");
    } finally {
      setGenerating(false);
    }
  }

  function mediaTypeFor(file: File): "image" | "video" | "audio" | "document" {
    if (file.type.startsWith("image/")) return "image";
    if (file.type.startsWith("video/")) return "video";
    if (file.type.startsWith("audio/")) return "audio";
    return "document";
  }

  async function handleMediaUpload(file: File) {
    if (file.size > 20 * 1024 * 1024) return toast.error("O arquivo deve ter no máximo 20 MB.");
    const allowed = file.type.startsWith("image/") || file.type.startsWith("video/") ||
      file.type.startsWith("audio/") || [
        "application/pdf", "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "text/plain",
      ].includes(file.type);
    if (!allowed) return toast.error("Formato não permitido. Use imagem, vídeo, áudio, PDF, Word, Excel ou TXT.");

    setUploadingMedia(true);
    try {
      const ext = file.name.split(".").pop()?.replace(/[^a-z0-9]/gi, "") || "bin";
      const path = `${companyId}/automation/${currentStageId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage.from("chat-media").upload(path, file, {
        contentType: file.type || "application/octet-stream",
      });
      if (error) throw error;
      const { data, error: signError } = await supabase.storage.from("chat-media").createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
      if (signError || !data?.signedUrl) {
        await supabase.storage.from("chat-media").remove([path]);
        throw signError ?? new Error("Não foi possível preparar o arquivo.");
      }
      setForm((current: any) => ({
        ...current,
        mensagem_midia_url: data.signedUrl,
        mensagem_midia_tipo: mediaTypeFor(file),
        mensagem_midia_mime: file.type || "application/octet-stream",
        mensagem_midia_nome: file.name,
      }));
      toast.success("Arquivo anexado");
    } catch (e: any) {
      toast.error(e?.message || "Falha ao anexar arquivo.");
    } finally {
      setUploadingMedia(false);
      if (mediaInputRef.current) mediaInputRef.current.value = "";
    }
  }

  async function clearMedia() {
    setForm((current: any) => ({
      ...current,
      mensagem_midia_url: "",
      mensagem_midia_tipo: "",
      mensagem_midia_mime: "",
      mensagem_midia_nome: "",
    }));
  }

  async function save() {
    setSaving(true);
    const patch: any = {
      modo_atendimento: form.modo_atendimento || "auto",
      agent_id: form.agent_id || null,
      ia_handoff_stage_id: form.ia_handoff_stage_id || null,
      distribution_queue_id: form.distribution_queue_id || null,
      distribution_user_id: form.distribution_user_id || null,

      regua_ativa: form.regua_ativa,
      delay_valor: Number(form.delay_valor) || 0,
      delay_unidade: form.delay_unidade,
      hora_do_dia: form.hora_do_dia || null,
      mensagem_tipo: form.mensagem_tipo,
      mensagem_texto: form.mensagem_texto || null,
      mensagem_prompt: (form.mensagem_prompt || "").trim() || null,
      criterio_ia: (form.criterio_ia || "").trim() || null,
      bloqueada_para_ia: !!form.bloqueada_para_ia,
      mensagem_midia_url: form.mensagem_tipo === "template" ? (form.mensagem_midia_url || null) : null,
      mensagem_midia_tipo: form.mensagem_tipo === "template" ? (form.mensagem_midia_tipo || null) : null,
      mensagem_midia_mime: form.mensagem_tipo === "template" ? (form.mensagem_midia_mime || null) : null,
      mensagem_midia_nome: form.mensagem_tipo === "template" ? (form.mensagem_midia_nome || null) : null,
      move_se_respondeu_para: form.move_se_respondeu_para || null,
      move_se_sem_resposta_dias: Number(form.move_se_sem_resposta_dias) || null,
      move_se_sem_resposta_para: form.move_se_sem_resposta_para || null,
      move_se_negativo_para: form.move_se_negativo_para || null,
      move_se_positivo_para: form.move_se_positivo_para || null,
      intent_handling_enabled: form.intent_handling_enabled,
      parar_se_responder: form.parar_se_responder,
      parar_se_humano: form.parar_se_humano,
      move_apos_qualificar_para: form.move_apos_qualificar_para || null,
      retorno_ativo: !!form.retorno_ativo,
      retorno_pipeline_id: form.retorno_pipeline_id || null,
      retorno_stage_id: form.retorno_stage_id || null,
      retorno_responsavel_modo: form.retorno_responsavel_modo || "manter",
      retorno_user_id: form.retorno_responsavel_modo === "fixo" ? (form.retorno_user_id || null) : null,
      retorno_modo_atendimento: form.retorno_modo_atendimento || "humano",
      retorno_janela_dias: Number(form.retorno_janela_dias) || 0,
      arquivar_perdidos_dias: Number(form.arquivar_perdidos_dias) || null,
    };
    const { error } = await supabase.from("crm_stage").update(patch).eq("id", currentStage.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Automação salva");
    onSaved();
  }

  function insertVar(v: string) {
    const key = form.mensagem_tipo === "ia_leve" ? "mensagem_prompt" : "mensagem_texto";
    setForm({ ...form, [key]: (form[key] || "") + ` {{${v}}}` });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[90vh] max-w-4xl flex-col gap-0 overflow-hidden border-border bg-card p-0 shadow-2xl">
        <DialogHeader className="border-b border-border px-6 py-5 pr-14 text-left">
          <DialogTitle className="flex items-center gap-2 text-lg"><span className="flex size-8 items-center justify-center rounded-md bg-primary/10"><Zap className="size-4 text-primary" /></span>Automação — {currentStage.nome}</DialogTitle>
          <p className="pl-10 text-xs text-muted-foreground">Configure atendimento, mensagens e regras desta etapa.</p>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto [&_input]:border-input [&_textarea]:border-input [&_select]:border-input [&_input]:bg-background [&_textarea]:bg-background [&_select]:bg-background">
          <Tabs value={automationTab} onValueChange={setAutomationTab} className="w-full">
            <TabsList className="sticky top-0 z-10 grid h-auto w-full grid-cols-3 rounded-none border-b border-border bg-muted/40 px-6 py-0">
              <TabsTrigger value="atendimento" className="gap-2 rounded-none border-b-2 border-transparent px-4 py-3 text-sm data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:shadow-none"><Users className="size-4" />Atendimento</TabsTrigger>
              <TabsTrigger value="mensagem" className="gap-2 rounded-none border-b-2 border-transparent px-4 py-3 text-sm data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:shadow-none"><MessageSquare className="size-4" />Mensagem (Régua)</TabsTrigger>
              <TabsTrigger value="acoes" className="gap-2 rounded-none border-b-2 border-transparent px-4 py-3 text-sm data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:shadow-none"><SlidersHorizontal className="size-4" />Ações e Regras</TabsTrigger>
            </TabsList>
            <TabsContent value="atendimento" className="m-0 space-y-5 p-6">
              <div className="flex items-start justify-between gap-4">
                <div><h3 className="text-sm font-semibold text-foreground">Configuração do atendimento</h3><p className="mt-1 text-xs text-muted-foreground">Defina quem atende e como os leads são distribuídos nesta etapa.</p></div>
                <span className="rounded-md border border-border bg-muted px-2 py-1 text-[11px] font-medium text-muted-foreground">Etapa: {currentStage.nome}</span>
              </div>
              <div className="space-y-4 rounded-lg border border-border bg-background p-5 shadow-sm">
                <div className="text-sm font-semibold">Quem responde nesta etapa?</div>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { v: "auto", label: "Automático", hint: "Régua tem prioridade; IA só entra se não houver mensagem" },
                    { v: "ia", label: "Iniciar IA", hint: "A IA conversa nesta etapa" },
                    { v: "manual", label: "IA desligada", hint: "Só régua e humano" },
                  ].map((opt) => (
                    <button key={opt.v} type="button"
                      onClick={() => setForm({ ...form, modo_atendimento: opt.v })}
                      className={`rounded-md border px-3 py-2 text-left ${form.modo_atendimento === opt.v ? "border-[var(--brand)] bg-[var(--brand)]/10" : "border-[var(--border)]"}`}>
                      <div className="text-sm font-medium">{opt.label}</div>
                      <div className="text-[11px] text-muted-foreground">{opt.hint}</div>
                    </button>
                  ))}
                </div>

                <div className="grid sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <Label>Agente de IA nesta etapa</Label>
                    <select className="w-full mt-1 rounded-md border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-sm"
                      value={form.agent_id}
                      onChange={(e) => setForm({ ...form, agent_id: e.target.value })}>
                      <option value="">— usar agente padrão do funil —</option>
                      {agents.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.nome_agente ? `${a.nome_agente} — ${a.nome}` : a.nome}{a.tipo ? ` (${a.tipo})` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label>Se cliente pedir humano, mover para</Label>
                    <StageSelect
                      value={form.ia_handoff_stage_id}
                      onChange={(v) => setForm({ ...form, ia_handoff_stage_id: v })}
                    />
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Quando a IA detectar que precisa de humano, transfere o lead pra essa etapa e silencia a IA.
                    </p>
                  </div>
                </div>
              
                <div className="pt-2 border-t border-[var(--border)] mt-2">
                  <Label>Distribuição de Leads</Label>
                  <select 
                    className="w-full mt-1 rounded-md border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-sm"
                    value={form.distribution_user_id ? `user:${form.distribution_user_id}` : (form.distribution_queue_id || "")}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val.startsWith("user:")) {
                        setForm({ ...form, distribution_user_id: val.replace("user:", ""), distribution_queue_id: null });
                      } else {
                        setForm({ ...form, distribution_queue_id: val || null, distribution_user_id: null });
                      }
                    }}>
                    <option value="">— não distribuir (manter dono atual) —</option>
                    {queues.map((q) => (
                      <option key={q.id} value={q.id}>
                        Fila: {q.nome}
                      </option>
                    ))}
                    <optgroup label="Atendente Específico">
                      {members.map((m) => (
                        <option key={m.user_id} value={`user:${m.user_id}`}>
                          {m.nome || m.email || "Sem nome"}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Escolha como o lead será atribuído ao entrar nesta etapa: via fila, para um atendente específico ou manter o atual.
                  </p>
                </div>

                <div className="pt-3 border-t border-[var(--border)] mt-2 space-y-3">
                  <div>
                    <Label className="text-xs font-semibold flex items-center gap-1.5">
                      <Sparkles className="size-3.5 text-primary" />
                      Criterio de Clasificación para la IA (Analista de CRM)
                    </Label>
                    <p className="text-[11px] text-muted-foreground mt-0.5 mb-1.5">
                      Explícale al Bot Analista cuándo debe mover un lead a esta etapa (ej.: "Mover aquí cuando el cliente pregunte precios, pida cotización formal o solicite métodos de pago").
                    </p>
                    <Textarea
                      rows={3}
                      value={form.criterio_ia || ""}
                      onChange={(e) => setForm({ ...form, criterio_ia: e.target.value })}
                      placeholder="Describe aquí las condiciones que deben cumplirse para que un lead pertenezca a esta etapa..."
                      className="text-xs"
                    />
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-lg border border-[var(--border)] bg-[var(--panel-2)]">
                    <div className="space-y-0.5 pr-4">
                      <Label className="text-xs font-semibold flex items-center gap-1.5">
                        <Lock className="size-3.5 text-amber-600" />
                        Bloquear para la IA (Transición Exclusiva para Humanos)
                      </Label>
                      <p className="text-[11px] text-muted-foreground">
                        Si se activa, la IA nunca moverá automáticamente a esta etapa (ideal para Ganado, Perdido o Facturación). Solo sugerirá la acción para que un asesor la confirme.
                      </p>
                    </div>
                    <Switch
                      checked={!!form.bloqueada_para_ia}
                      onCheckedChange={(v) => setForm({ ...form, bloqueada_para_ia: v })}
                    />
                  </div>
                </div>

            {form.modo_atendimento === "manual" && (
              <p className="text-[11px] text-muted-foreground pt-2">
                Nesta etapa a IA não responde. Use este modo na primeira etapa quando quiser apenas disparar uma mensagem fixa da régua.
              </p>
            )}
          </div>
        </TabsContent>

            <TabsContent value="mensagem" className="m-0 space-y-5 p-6">
          <div className="flex items-start justify-between gap-4">
            <div><h3 className="text-sm font-semibold text-foreground">Sequência de mensagens</h3><p className="mt-1 text-xs text-muted-foreground">Configure quando e qual conteúdo será enviado automaticamente.</p></div>
            <span className={`rounded-md border px-2 py-1 text-[11px] font-semibold ${form.regua_ativa ? "border-primary/20 bg-primary/10 text-primary" : "border-border bg-muted text-muted-foreground"}`}>{form.regua_ativa ? "Ativa" : "Inativa"}</span>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border bg-background p-4 shadow-sm">
            <div>
              <div className="font-semibold text-sm">Régua automática ativa</div>
              <div className="text-xs text-muted-foreground">Quando ativa, processa regras de mover e, se configurada, dispara mensagem.</div>
            </div>
            <Switch checked={form.regua_ativa} onCheckedChange={(v) => setForm({ ...form, regua_ativa: v })} />
          </div>

          <div className={form.regua_ativa ? "space-y-4" : "pointer-events-none space-y-4 opacity-50"}>
            <div className="rounded-lg border border-border bg-background p-5 shadow-sm">
              <div className="mb-4"><h4 className="text-sm font-semibold">Momento do disparo</h4><p className="mt-1 text-xs text-muted-foreground">Escolha o intervalo e, opcionalmente, um horário específico.</p></div>
              <Label className="flex items-center gap-1.5 mb-2"><Clock className="size-3.5" />Disparar após</Label>
              <div className="grid grid-cols-3 gap-2">
                <Input type="number" min={0} value={form.delay_valor}
                  onChange={(e) => setForm({ ...form, delay_valor: e.target.value })} />
                <select className="rounded-md border border-[var(--border)] bg-[var(--panel)] px-3 text-sm"
                  value={form.delay_unidade}
                  onChange={(e) => setForm({ ...form, delay_unidade: e.target.value })}>
                  <option value="minutos">minutos</option>
                  <option value="horas">horas</option>
                  <option value="dias">dias</option>
                </select>
                <Input type="time" value={form.hora_do_dia}
                  onChange={(e) => setForm({ ...form, hora_do_dia: e.target.value })}
                  placeholder="Hora do dia" />
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setForm({ ...form, delay_valor: 0, delay_unidade: "minutos", hora_do_dia: "" })}>
                  Disparar imediatamente
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                Use 0 minutos para envio imediato. A hora do dia é opcional; se preenchida, o disparo aguarda esse horário.
              </p>
              {form.regua_ativa && Number(form.delay_valor) === 0 && (
                <p className="text-[11px] mt-2 rounded-md border border-amber-300 bg-amber-50 text-amber-800 px-2.5 py-2">
                  Atenção: com disparo imediato, esta mensagem é enviada assim que o lead entra nesta etapa — mesmo antes de o contato escrever. É automação da etapa, não o agente de IA. Coloque um atraso ou desligue a régua se não quiser isso.
                </p>
              )}
            </div>

            <div className="rounded-lg border border-border bg-background p-5 shadow-sm">
              <div className="mb-4"><h4 className="text-sm font-semibold">Conteúdo da automação</h4><p className="mt-1 text-xs text-muted-foreground">Selecione o formato e prepare a mensagem que será enviada.</p></div>
              <Label className="mb-2 block">Tipo de mensagem</Label>
              <div className="grid grid-cols-3 gap-2">
                <button type="button"
                  onClick={() => setForm({ ...form, mensagem_tipo: "sem_mensagem", mensagem_texto: "", mensagem_prompt: "" })}
                  className={`rounded-md border px-3 py-2 text-sm ${form.mensagem_tipo === "sem_mensagem" ? "border-[var(--brand)] bg-[var(--brand)]/10" : "border-[var(--border)]"}`}>
                  Só regras
                </button>
                <button type="button"
                  onClick={() => setForm({ ...form, mensagem_tipo: "template" })}
                  className={`rounded-md border px-3 py-2 text-sm ${form.mensagem_tipo === "template" ? "border-[var(--brand)] bg-[var(--brand)]/10" : "border-[var(--border)]"}`}>
                  Template fixo
                </button>
                <button type="button"
                  onClick={() => setForm({ ...form, mensagem_tipo: "ia_leve" })}
                  className={`rounded-md border px-3 py-2 text-sm ${form.mensagem_tipo === "ia_leve" ? "border-[var(--brand)] bg-[var(--brand)]/10" : "border-[var(--border)]"}`}>
                  IA gera (com base no prompt)
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                Use “Só regras” quando quiser manter o agente respondendo e usar apenas mover se responder/sem resposta.
              </p>
            </div>

            {form.mensagem_tipo === "sem_mensagem" ? (
              <div className="rounded-lg border border-[var(--border)] bg-[var(--panel)] p-3 text-xs text-muted-foreground">
                Nenhuma mensagem automática será enviada por esta régua; somente as regras abaixo serão executadas.
              </div>
            ) : form.mensagem_tipo === "template" ? (
              <div className="space-y-3">
                <Label>Mensagem</Label>
                <Textarea rows={4} value={form.mensagem_texto}
                  onChange={(e) => setForm({ ...form, mensagem_texto: e.target.value })}
                  placeholder={form.mensagem_midia_tipo === "audio" ? "Mensagem opcional enviada depois do áudio" : "Ex.: Oi {{nome}}! 👋 Tudo bem por aí?"} />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {form.mensagem_midia_tipo === "audio"
                    ? "Áudios não aceitam legenda no WhatsApp. Se houver texto, ele será enviado logo depois."
                    : "O texto será enviado sozinho ou como legenda da mídia, preservando linhas, listas e emojis."}
                </p>
                <div className="rounded-md border border-[var(--border)] bg-muted/30 p-3">
                  <input
                    ref={mediaInputRef}
                    type="file"
                    hidden
                    accept="image/*,video/*,audio/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void handleMediaUpload(file);
                    }}
                  />
                  {form.mensagem_midia_url ? (
                    <div className="flex items-center gap-3">
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-background text-[var(--brand)]">
                        {form.mensagem_midia_tipo === "image" ? <ImageIcon className="size-5" />
                          : form.mensagem_midia_tipo === "video" ? <Video className="size-5" />
                          : form.mensagem_midia_tipo === "audio" ? <Mic className="size-5" />
                          : <FileText className="size-5" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{form.mensagem_midia_nome || "Arquivo anexado"}</p>
                        <p className="text-[11px] text-muted-foreground">Anexo do disparo automático</p>
                      </div>
                      <Button type="button" variant="outline" size="sm" disabled={uploadingMedia} onClick={() => mediaInputRef.current?.click()}>
                        Trocar
                      </Button>
                      <Button type="button" variant="ghost" size="icon" disabled={uploadingMedia} onClick={() => void clearMedia()} aria-label="Remover anexo">
                        <X className="size-4" />
                      </Button>
                    </div>
                  ) : (
                    <Button type="button" variant="outline" size="sm" disabled={uploadingMedia} onClick={() => mediaInputRef.current?.click()}>
                      {uploadingMedia ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Upload className="mr-2 size-4" />}
                      Anexar imagem, vídeo, áudio ou arquivo
                    </Button>
                  )}
                  <p className="mt-2 text-[11px] text-muted-foreground">Máximo de 20 MB.</p>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Prompt para a IA</Label>
                  <Button type="button" size="sm" variant="outline" onClick={gerarMensagemIa} disabled={generating}>
                    {generating ? <Loader2 className="size-3.5 mr-1.5 animate-spin" /> : <Wand2 className="size-3.5 mr-1.5" />}
                    {generating ? "Gerando…" : "Gerar mensagem"}
                  </Button>
                </div>
                <Textarea rows={4} value={form.mensagem_prompt}
                  onChange={(e) => setForm({ ...form, mensagem_prompt: e.target.value })}
                  placeholder="Ex.: Gere UMA mensagem curta e amigável de reengajamento para {{nome}}, sem pressão." />
                <p className="text-[11px] text-muted-foreground">
                  Ao gerar, a mensagem vira o template padrão dessa etapa (você pode editar antes de salvar).
                </p>
              </div>
            )}
            {form.mensagem_tipo !== "sem_mensagem" && (
              <div className="flex flex-wrap gap-1.5 -mt-3">
                {["nome", "valor", "dias_sem_resposta"].map((v) => (
                  <button key={v} type="button" onClick={() => insertVar(v)}
                    className="text-[11px] rounded-md border border-[var(--border)] bg-[var(--panel)] px-2 py-1 hover:border-[var(--brand)]">
                    {"{{"}{v}{"}}"}
                  </button>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="acoes" className="m-0 space-y-5 p-6">
          {/* Limpeza da coluna e Rota de retorno saíram daqui: agora ficam nos três pontos da etapa de Perda. */}

          <div><h3 className="text-sm font-semibold text-foreground">Ações e regras</h3><p className="mt-1 text-xs text-muted-foreground">Determine movimentações automáticas e quando a régua deve parar.</p></div>
          <div className="space-y-5 rounded-lg border border-border bg-background p-5 shadow-sm">

            <div className="grid sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <Label>Se responder, mover para</Label>
                <StageSelect
                  value={form.move_se_respondeu_para}
                  onChange={(v) => setForm({ ...form, move_se_respondeu_para: v })}
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Pode mover para uma etapa deste funil ou de outro (ex.: Ganho → Pós-venda).
                </p>
                <div className="flex flex-wrap gap-2 mt-2">
                  <Button type="button" variant="outline" size="sm" className="h-7 text-[10px]"
                    onClick={() => {
                      const lossStage = allStages.find(s => s.pipeline_id === stage.pipeline_id && s.tipo === 'perda');
                      if (lossStage) setForm({ ...form, move_se_respondeu_para: lossStage.id });
                    }}>
                    Mover para Perdido
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="h-7 text-[10px]"
                    onClick={() => {
                      const winStage = allStages.find(s => s.pipeline_id === stage.pipeline_id && s.tipo === 'ganho');
                      if (winStage) setForm({ ...form, move_se_respondeu_para: winStage.id });
                    }}>
                    Mover para Ganho
                  </Button>
                </div>
              </div>


              <div className="sm:col-span-2 pt-2 border-t border-[var(--border)]">
                <div className="flex items-center justify-between mb-2">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-semibold">Tratamento de Intenções (IA)</Label>
                    <p className="text-[11px] text-muted-foreground">A IA classifica se a resposta é positiva ou negativa para mover o lead.</p>
                  </div>
                  <Switch 
                    checked={form.intent_handling_enabled} 
                    onCheckedChange={(v) => setForm({ ...form, intent_handling_enabled: v })} 
                  />
                </div>

                {form.intent_handling_enabled && (
                  <div className="grid sm:grid-cols-2 gap-4 mt-3 p-3 rounded-lg bg-[var(--panel)] border border-[var(--border)] animate-in fade-in slide-in-from-top-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Se resposta for POSITIVA, mover para</Label>
                      <StageSelect
                        value={form.move_se_positivo_para}
                        onChange={(v) => setForm({ ...form, move_se_positivo_para: v })}
                      />
                      <div className="flex justify-end mt-1">
                        <Button type="button" variant="link" size="sm" className="h-auto p-0 text-[10px] text-brand"
                          onClick={() => {
                            const winStage = allStages.find(s => s.pipeline_id === stage.pipeline_id && s.tipo === 'ganho');
                            if (winStage) setForm({ ...form, move_se_positivo_para: winStage.id });
                          }}>
                          Usar Ganho
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Se resposta for NEGATIVA, mover para</Label>
                      <StageSelect
                        value={form.move_se_negativo_para}
                        onChange={(v) => setForm({ ...form, move_se_negativo_para: v })}
                      />
                      <div className="flex justify-end mt-1">
                        <Button type="button" variant="link" size="sm" className="h-auto p-0 text-[10px] text-destructive"
                          onClick={() => {
                            const lossStage = allStages.find(s => s.pipeline_id === stage.pipeline_id && s.tipo === 'perda');
                            if (lossStage) setForm({ ...form, move_se_negativo_para: lossStage.id });
                          }}>
                          Usar Perda
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-2 border-t border-[var(--border)]">
                <div className="flex items-center justify-between mb-2">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-semibold">Qualificação (IA)</Label>
                    <p className="text-[11px] text-muted-foreground">Mover lead somente após a IA completar a qualificação.</p>
                  </div>
                  <Switch
                    checked={!!form.move_apos_qualificar_para}
                    onCheckedChange={(v) => {
                      if (!v) setForm({ ...form, move_apos_qualificar_para: "" });
                      else {
                        const nextStage = allStages.find(s => s.pipeline_id === stage.pipeline_id && s.id !== stage.id);
                        setForm({ ...form, move_apos_qualificar_para: nextStage?.id || "" });
                      }
                    }}
                  />
                </div>
                {!!form.move_apos_qualificar_para && (
                  <div className="space-y-2 animate-in fade-in slide-in-from-top-2">
                    <Label className="text-xs">Após qualificar, mover para</Label>
                    <StageSelect
                      value={form.move_apos_qualificar_para}
                      onChange={(v) => setForm({ ...form, move_apos_qualificar_para: v })}
                    />
                  </div>
                )}
              </div>

              <div className="pt-2 border-t border-[var(--border)] grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Se não responder em (dias)</Label>
                  <Input type="number" min={0} value={form.move_se_sem_resposta_dias}
                    onChange={(e) => setForm({ ...form, move_se_sem_resposta_dias: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs">Mover para (sem resposta)</Label>
                  <StageSelect
                    value={form.move_se_sem_resposta_para}
                    onChange={(v) => setForm({ ...form, move_se_sem_resposta_para: v })}
                  />
                </div>
              </div>
            </div>


            <div className="space-y-2 rounded-lg border border-[var(--border)] p-3">
              <label className="flex items-center justify-between text-sm">
                <span>Parar régua se cliente responder</span>
                <Switch checked={form.parar_se_responder}
                  onCheckedChange={(v) => setForm({ ...form, parar_se_responder: v })} />
              </label>
              <label className="flex items-center justify-between text-sm">
                <span>Parar régua se humano assumir a conversa</span>
                <Switch checked={form.parar_se_humano}
                  onCheckedChange={(v) => setForm({ ...form, parar_se_humano: v })} />
              </label>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>

        <DialogFooter className="border-t border-border bg-muted/30 px-6 py-4 sm:justify-between">
          <p className="hidden text-xs text-muted-foreground sm:block">As alterações serão aplicadas somente nesta etapa.</p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button onClick={save} disabled={saving}>{saving ? <><Loader2 className="mr-2 size-4 animate-spin" />Salvando...</> : "Salvar alterações"}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PipelineDialog({ state, queues, agents, onClose, onCreate, onRename }: {
  state: { mode: "new" } | { mode: "edit"; pipeline: Pipeline } | null;
  queues: DistQueue[];

  onClose: () => void;
  agents?: AgentOpt[];
  onCreate: (nome: string, queueId?: string | null, agentId?: string | null, crmMasterPrompt?: string | null) => void;
  onRename: (id: string, nome: string, queueId?: string | null, agentId?: string | null, crmMasterPrompt?: string | null) => void;
}) {
  const { t } = useLanguage();
  const [nome, setNome] = useState("");
  const [queueId, setQueueId] = useState<string>("");
  const [agentId, setAgentId] = useState<string>("");
  const [crmMasterPrompt, setCrmMasterPrompt] = useState<string>("");
  useEffect(() => { 
    setNome(state?.mode === "edit" ? state.pipeline.nome : ""); 
    setQueueId(state?.mode === "edit" ? (state.pipeline as any).distribution_queue_id ?? "" : "");
    setAgentId(state?.mode === "edit" ? (state.pipeline as any).agent_id ?? "" : "");
    setCrmMasterPrompt(state?.mode === "edit" ? (state.pipeline as any).crm_master_prompt ?? "" : "");
  }, [state]);

  if (!state) return null;
  const isEdit = state.mode === "edit";
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{isEdit ? "Renomear funil" : "Novo funil"}</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Nome do funil</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} autoFocus placeholder="Ex.: Parcerias, Recuperação, Suporte…" />
            {!isEdit && (
              <p className="text-xs text-muted-foreground">
                Funis personalizados não têm automação de mensagens/IA. Use os funis do sistema (Comercial, Follow-up, Pós-venda) para automações.
              </p>
            )}
          </div>

          <div className="space-y-2 pt-2 border-t border-[var(--border)]">
            <Label>Fila de Distribuição Padrão</Label>
            <select className="w-full mt-1 rounded-md border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-sm"
              value={queueId}
              onChange={(e) => setQueueId(e.target.value)}>
              <option value="">— nenhum (mantém sem dono) —</option>
              {queues.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.nome}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-muted-foreground">
              Leads que entrarem neste funil (via API/Meta) sem uma etapa específica definida cairão na primeira etapa e serão distribuídos por esta fila.
            </p>
          </div>

          {agents && agents.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-[var(--border)]">
              <Label className="flex items-center gap-1.5 text-xs font-semibold">
                <Sparkles className="size-3.5 text-primary" />
                {t("crm.pipeline_agent_label", undefined, "Agente de IA do Funil")}
              </Label>
              <select className="w-full mt-1 rounded-md border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-sm"
                value={agentId}
                onChange={(e) => setAgentId(e.target.value)}>
                <option value="">{t("crm.pipeline_use_default_agent", undefined, "— usar agente padrão da empresa —")}</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nome_agente ? `${a.nome_agente} — ${a.nome}` : a.nome}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-muted-foreground">
                {t("crm.pipeline_agent_desc", undefined, "Define el bot de IA especializado que atenderá y auditará este embudo.")}
              </p>
            </div>
          )}

          <div className="space-y-2 pt-2 border-t border-[var(--border)]">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-1.5 text-xs font-semibold">
                <Sparkles className="size-3.5 text-primary" />
                {t("crm.pipeline_master_prompt_label", undefined, "Prompt Maestro del Analista IA (Auditor del Embudo)")}
              </Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 text-[11px] px-2 text-primary"
                onClick={() => setCrmMasterPrompt(DEFAULT_CRM_MASTER_PROMPT)}
              >
                {t("crm.restore_default_prompt", undefined, "Restaurar prompt base")}
              </Button>
            </div>
            <textarea
              value={crmMasterPrompt}
              onChange={(e) => setCrmMasterPrompt(e.target.value)}
              placeholder={t("crm.pipeline_master_prompt_placeholder", undefined, "Instrucciones de auditoría para evaluar los leads de este embudo...")}
              className="w-full min-h-[90px] rounded-md border border-[var(--border)] bg-[var(--panel)] p-2.5 text-xs font-mono resize-y"
            />
            <p className="text-[11px] text-muted-foreground">
              {t("crm.pipeline_master_prompt_hint", undefined, "La IA usará estas reglas para calificar leads y sugerir movimientos de etapa.")}
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button
            disabled={!nome.trim()}
            onClick={() => {
              if (isEdit) onRename(state.pipeline.id, nome.trim(), queueId || null, agentId || null, crmMasterPrompt.trim() || null);
              else onCreate(nome.trim(), queueId || null, agentId || null, crmMasterPrompt.trim() || null);
            }}
          >{isEdit ? t("common.save", undefined, "Salvar") : t("crm.create_pipeline", undefined, "Criar funil")}</Button>
        </DialogFooter>

      </DialogContent>
    </Dialog>
  );
}
