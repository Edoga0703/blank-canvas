import { createFileRoute, redirect, Link, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { startGoogleOAuth, disconnectGoogle } from "@/lib/google.functions";
import { saveDepartmentMenu } from "@/lib/department-menu.functions";
import { Calendar, Sliders, ShieldAlert, Cpu } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { HelpTip } from "@/components/help-tip";
import { useEffect, useRef, useState, useMemo, useCallback, useReducer } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";

import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Bot, Loader2, Save, Send, Sparkles, Wand2, ChevronDown, Settings2, RefreshCcw, HelpCircle, ArrowLeft, CheckCircle2, Plus, Trash2, LayoutGrid, Search, UserCircle2, Eye, History, FileText, ShoppingBag, Zap, Share2, BarChart3, Database, Camera, Image as ImageIcon, Globe } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { brand } from "@/config/brand";
import { buildSystemPrompt } from "@/lib/ai-prompt";
import { testAiReply } from "@/lib/whatsapp.functions";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";

import { generateAgentConfig, analyzeBusinessBrief, addAgentExample, listAgents, deleteAgent, generateAgentAvatar, updateAgentKnowledgeFiles, saveAgentConfig, createAgent, indexAgentKnowledge, listAgentSuggestions, applyAgentSuggestion, dismissAgentSuggestion, simulateSuggestionFix, runAutoRegressionTests, type BriefQuestion, type AgentPromptSuggestionItem } from "@/lib/agent-ai.functions";
import { ensureSession, mensagemErroSessao } from "@/lib/ensure-session";
import { InitialsAvatar } from "@/components/ui/initials-avatar";
import { MicDictateButton } from "@/components/mic-dictate-button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Pencil } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AvatarBuilder } from "@/components/agente/avatar-builder";
import { AgentAvatar } from "@/components/agente/agent-avatar";
import { AgentCopilotSheet } from "@/components/agente/agent-copilot-sheet";
import { useLanguage } from "@/lib/i18n/context";

import { cn } from "@/lib/utils";

const searchSchema = z.object({
  id: z.string().optional(),
  tab: z.string().optional(),
});

export const Route = createFileRoute("/app/agente")({
  head: () => ({ meta: [{ title: `${brand.name} — Agente IA Studio` }] }),
  validateSearch: (search: Record<string, unknown>) => searchSchema.parse(search),
  component: AgentePage,
});


const PLACEHOLDER = `Ex: Tenho uma padaria artesanal na Vila Mariana, em São Paulo, aberta de seg a sáb das 6h às 20h. Vendo pães de fermentação natural, doces, bolos sob encomenda e cestas de café da manhã. Entrego em até 5km via Loggi. Quero que a IA atenda no WhatsApp: cumprimente, descubra o que o cliente quer, sugira combos, confirme endereço e mande o link de pagamento. Pode oferecer o cupom PADARIA10 quando fizer sentido.`;

type AgentTipo = "qualificacao" | "followup" | "posvenda";
const TIPO_LABELS: Record<AgentTipo, { label: string; sub: string }> = {
  qualificacao: { label: "Qualificação", sub: "Atende leads no funil de Vendas" },
  followup:     { label: "Follow-up",    sub: "Reengaja leads sem resposta" },
  posvenda:     { label: "Pós-venda",    sub: "Acompanha clientes após a venda" },
};

function AgentePage() {
  const { t, language } = useLanguage();
  const ctx = Route.useRouteContext();
  const search = Route.useSearch();
  const searchAgentId = search?.id;
  const searchTab = search?.tab;
  const navigate = useNavigate();
  const companyId = ctx.company?.id;
  const fetchAgents = useServerFn(listAgents);
  const removeAgent = useServerFn(deleteAgent);
  const saveMenu = useServerFn(saveDepartmentMenu);
  const gStart = useServerFn(startGoogleOAuth);
  const gDisc = useServerFn(disconnectGoogle);

  const [activeTab, setActiveTab] = useState<string>(searchTab || "conhecimento");
  const [aiProvider, setAiProvider] = useState("drael");
  const [aiModel, setAiModel] = useState("drael-v1");
  const [temperatura, setTemperatura] = useState(0.5);
  const [agendamentoAtivo, setAgendamentoAtivo] = useState(false);
  const [servicosAgendaveis, setServicosAgendaveis] = useState("");
  const [duracaoPadrao, setDuracaoPadrao] = useState("30 min");
  const [horariosDisponiveis, setHorariosDisponiveis] = useState("");
  const [antecedenciaMin, setAntecedenciaMin] = useState("2 horas");
  const [menuSetoresAtivo, setMenuSetoresAtivo] = useState(false);
  const [menuSetoresTexto, setMenuSetoresTexto] = useState("");
  const [menuSetoresOpcoes, setMenuSetoresOpcoes] = useState<{ numero: string; department_id: string; label: string }[]>([]);
  const [olistCatalogo, setOlistCatalogo] = useState(false);
  const [departments, setDepartments] = useState<{ id: string; nome: string }[]>([]);
  const [produtos, setProdutos] = useState<any[]>([]);
  const [stages, setStages] = useState<any[]>([]);
  const [googleIntegration, setGoogleIntegration] = useState<any>(null);
  const [connectingGoogle, setConnectingGoogle] = useState(false);
  const generate = useServerFn(generateAgentConfig);
  const analyze = useServerFn(analyzeBusinessBrief);
  const test = useServerFn(testAiReply);
  const saveExample = useServerFn(addAgentExample);
  const generateAvatar = useServerFn(generateAgentAvatar);
  const persistAgent = useServerFn(saveAgentConfig);
  const addAgent = useServerFn(createAgent);
  const fetchSuggestions = useServerFn(listAgentSuggestions);
  const applySuggestion = useServerFn(applyAgentSuggestion);
  const dismissSuggestion = useServerFn(dismissAgentSuggestion);
  const simulateFix = useServerFn(simulateSuggestionFix);
  const autoTestAll = useServerFn(runAutoRegressionTests);

  const [avatarLoading, setAvatarLoading] = useState(false);

  const [agents, setAgents] = useState<any[]>([]);
  const [tipo, setTipo] = useState<AgentTipo>("qualificacao");
  const [loading, setLoading] = useState(true);
  const [hasConfig, setHasConfig] = useState(false);
  const [cfg, setCfg] = useState<any>(null);
  const [descricao, setDescricao] = useState("");
  const [generating, setGenerating] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [promptPreview, setPromptPreview] = useState("");
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loadingAuditLogs, setLoadingAuditLogs] = useState(false);
  const [channelStatus, setChannelStatus] = useState<Record<string, boolean>>({ whatsapp: true, instagram: true, telegram: true });

  useEffect(() => {
    if (searchTab && ["visao", "conhecimento", "comportamento", "fluxo", "canais", "avancado", "analises"].includes(searchTab)) {
      setActiveTab(searchTab);
    }
  }, [searchTab]);

  useEffect(() => {
    if (!companyId) return;
    void (async () => {
      try {
        const [{ data: deps }, { data: prods }, { data: stgs }, { data: g }] = await Promise.all([
          supabase.from("department").select("id,nome").eq("company_id", companyId).eq("ativo", true).order("nome"),
          supabase.from("produto").select("id,nome,preco,ativo").eq("company_id", companyId).order("ordem", { ascending: true }),
          supabase.from("crm_stage").select("id,nome,cor,ordem").eq("company_id", companyId).order("ordem", { ascending: true }),
          supabase.from("google_integration").select("company_id,email,conectado,calendar_id,expiry,updated_at").eq("company_id", companyId).maybeSingle(),
        ]);
        if (deps) setDepartments(deps);
        if (prods) setProdutos(prods);
        if (stgs) setStages(stgs);
        setGoogleIntegration(g || null);
      } catch (err) {
        console.warn("[agente] Erro ao carregar dados auxiliares:", err);
      }
    })();
  }, [companyId]);

  async function handleConnectGoogle() {
    setConnectingGoogle(true);
    try {
      const r: any = await gStart({});
      if (!r.ok) return toast.error(r.error || "Falha ao conectar Google");
      window.location.href = r.url;
    } catch (e: any) {
      toast.error(e?.message || "Falha ao conectar Google Agenda");
    } finally {
      setConnectingGoogle(false);
    }
  }

  async function handleDisconnectGoogle() {
    setConnectingGoogle(true);
    try {
      await gDisc({});
      toast.success("Google Agenda desconectado.");
      setGoogleIntegration(null);
    } catch (e: any) {
      toast.error(e?.message || "Falha ao desconectar Google Agenda");
    } finally {
      setConnectingGoogle(false);
    }
  }

  const loadHistory = async () => {
    setLoadingAuditLogs(true);
    try {
      let q = supabase
        .from("audit_log")
        .select("*")
        .in("acao", ["ai_response", "copilot_rule_applied", "agent_config_saved", "agent_teach_saved"])
        .order("created_at", { ascending: false })
        .limit(25);
      if (companyId) q = q.eq("company_id", companyId);
      const { data: logs } = await q;
      setAuditLogs(logs || []);
    } catch (e: any) {
      console.warn("Erro ao buscar histórico:", e);
    } finally {
      setLoadingAuditLogs(false);
    }
  };

  // PRD interview flow
  type Step = "descrever" | "entrevista" | "pronto";
  const [step, setStep] = useState<Step>("descrever");
  const [perguntas, setPerguntas] = useState<BriefQuestion[]>([]);
  const [respostas, setRespostas] = useState<Record<string, string>>({});
  const [resumoIA, setResumoIA] = useState("");
  const [cobertura, setCobertura] = useState(0);

  // Ajustes finos
  const [tamanhoResposta, setTamanhoResposta] = useState<"curtas" | "medias" | "longas">("curtas");
  const [telefone, setTelefone] = useState("");
  const [palavraPausar, setPalavraPausar] = useState("/pausar");
  const [palavraDespausar, setPalavraDespausar] = useState("/despausar");
  const [responderEmPartes, setResponderEmPartes] = useState(true);
  const [segundosBuffer, setSegundosBuffer] = useState<number>(3);

  // Sugestões de treinamento da IA (Fase B + Regression Replay)
  const [suggestions, setSuggestions] = useState<AgentPromptSuggestionItem[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [simulatingId, setSimulatingId] = useState<string | null>(null);
  const [runningBatchTest, setRunningBatchTest] = useState(false);
  const [simulationDiffs, setSimulationDiffs] = useState<Record<string, {
    new_reply: string;
    previous_reply?: string;
    doubt_resolved: boolean;
    simulated_at: string;
  }>>({});

  const [regrasRigidas, setRegrasRigidas] = useState("");
  const [livre, setLivre] = useState("");
  const [editingLivre, setEditingLivre] = useState(false);

  // Sidebar / Studio state
  const [searchDraft, setSearchDraft] = useState("");
  const searchTerm = useDebounce(searchDraft, 300);
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null);
  const lastLoadedAgentIdRef = useRef<string | null>(null);
  const [newAgentOpen, setNewAgentOpen] = useState(false);
  const [newAgentName, setNewAgentName] = useState("");
  const [newAgentTipo, setNewAgentTipo] = useState<AgentTipo>("qualificacao");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [testInput, setTestInput] = useState("");
  const [testing, setTesting] = useState(false);

  // Correção inline (few-shot)
  const [correctOpen, setCorrectOpen] = useState(false);
  const [correctIndex, setCorrectIndex] = useState<number | null>(null);
  const [correctIdeal, setCorrectIdeal] = useState("");
  const [correctSaving, setCorrectSaving] = useState(false);

  // Ensinar IA (append direto na base de conhecimento)
  const [teachOpen, setTeachOpen] = useState(false);
  const [teachText, setTeachText] = useState("");
  const [teachSaving, setTeachSaving] = useState(false);
  const [avatarBuilderOpen, setAvatarBuilderOpen] = useState(false);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [copilotInitialPrompt, setCopilotInitialPrompt] = useState<string | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const saveKnowledgeFiles = useServerFn(updateAgentKnowledgeFiles);
  const indexKnowledge = useServerFn(indexAgentKnowledge);
  const [indexingKnowledge, setIndexingKnowledge] = useState(false);


  // Auto-scroll do playground

  const scrollRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [chat, testing]);



  const loadSuggestions = useCallback(async (agentId?: string | null) => {
    try {
      setLoadingSuggestions(true);
      const res = await fetchSuggestions({ data: { agentId } });
      setSuggestions(res || []);
    } catch (e: any) {
      console.warn("[agente] Falha ao carregar sugestões:", e?.message);
    } finally {
      setLoadingSuggestions(false);
    }
  }, [fetchSuggestions]);

  function applyAgentData(data: any) {
    if (data && data.nome_agente && data.nome_agente.trim() && (data.sobre_empresa || data.descricao_negocio)) {
      setHasConfig(true);
      setStep("pronto");
      setCfg(data);
        if (data?.canais_ativos) setChannelStatus(data.canais_ativos);
      setActiveAgentId(data.id);
      setTipo(data.tipo as AgentTipo);
      setTamanhoResposta((data.tamanho_resposta as any) || "curtas");
      setTelefone(data.telefone_transferencia || "");
      setPalavraPausar(data.palavra_pausar || "/pausar");
      setPalavraDespausar(data.palavra_despausar || "/despausar");
      setResponderEmPartes(data.responder_em_partes ?? true);
      setSegundosBuffer(typeof data.segundos_buffer === "number" ? data.segundos_buffer : 3);
      setRegrasRigidas(data.regras_rigidas || "");
      setPromptPreview(buildSystemPrompt(data as any, { responderEmPartes: data.responder_em_partes ?? true, produtos: [] }));
      setLivre(composeKnowledge(data));
      setAiProvider(data.ai_provider || "gemini");
      const normalizedModel = !data.ai_model || data.ai_model.includes("2.0") || data.ai_model.includes("1.5") || data.ai_model.includes("2.5") ? "gemini-3.5-flash-lite" : data.ai_model.replace(/^google\//, "");
      setAiModel(normalizedModel);
      setTemperatura(typeof data.temperatura === "number" ? data.temperatura : 0.5);
      setAgendamentoAtivo(Boolean(data.agendamento_ativo));
      setServicosAgendaveis(data.servicos_agendaveis || "");
      setDuracaoPadrao(data.duracao_padrao || "30 min");
      setHorariosDisponiveis(data.horarios_disponiveis || "");
      setAntecedenciaMin(data.antecedencia_min || "2 horas");
      setMenuSetoresAtivo(Boolean(data.menu_setores_ativo));
      setMenuSetoresTexto(data.menu_setores_texto || "");
      setMenuSetoresOpcoes(Array.isArray(data.menu_setores_opcoes) ? data.menu_setores_opcoes : []);
      setOlistCatalogo(Boolean(data.olist_catalogo));
      loadSuggestions(data.id);
    } else if (data) {
      setAiProvider(data.ai_provider || "gemini");
      const normalizedModel = !data.ai_model || data.ai_model.includes("2.0") || data.ai_model.includes("1.5") || data.ai_model.includes("2.5") ? "gemini-3.5-flash-lite" : data.ai_model.replace(/^google\//, "");
      setAiModel(normalizedModel);
      setTemperatura(typeof data.temperatura === "number" ? data.temperatura : 0.5);
      setAgendamentoAtivo(Boolean(data.agendamento_ativo));
      setServicosAgendaveis(data.servicos_agendaveis || "");
      setDuracaoPadrao(data.duracao_padrao || "30 min");
      setHorariosDisponiveis(data.horarios_disponiveis || "");
      setAntecedenciaMin(data.antecedencia_min || "2 horas");
      setMenuSetoresAtivo(Boolean(data.menu_setores_ativo));
      setMenuSetoresTexto(data.menu_setores_texto || "");
      setMenuSetoresOpcoes(Array.isArray(data.menu_setores_opcoes) ? data.menu_setores_opcoes : []);
      setOlistCatalogo(Boolean(data.olist_catalogo));
      setCfg(data);
      if (data?.canais_ativos) setChannelStatus(data.canais_ativos);
      setActiveAgentId(data.id);
      setSegundosBuffer(typeof data.segundos_buffer === "number" ? data.segundos_buffer : 3);
      setRegrasRigidas(data.regras_rigidas || "");
      setLivre(composeKnowledge(data));
      // Garante que o prompt preview seja atualizado se a config mudar
      setPromptPreview(buildSystemPrompt(data as any, { responderEmPartes: data.responder_em_partes ?? true, produtos: [] }));
      loadSuggestions(data.id);
    } else {
      setHasConfig(false);
      setCfg(null);
      setLivre("");
      setSuggestions([]);
    }
  }

  // Hook local useDebounce para busca
  function useDebounce<T>(value: T, delay: number): T {
    const [debouncedValue, setDebouncedValue] = useState<T>(value);
    useEffect(() => {
      const handler = setTimeout(() => {
        setDebouncedValue(value);
      }, delay);
      return () => {
        clearTimeout(handler);
      };
    }, [value, delay]);
    return debouncedValue;
  }




  async function loadAgents(targetIdToSelect?: string) {
    if (!companyId) return;
    try {
      const { data, error } = await supabase
        .from("agent_config")
        .select("*")
        .eq("company_id", companyId)
        .order("updated_at", { ascending: false });

      if (error) throw error;
      
      setAgents(data || []);
      
      // Se não tem agente ativo selecionado, tenta selecionar o target ou o default ou o primeiro
      if ((targetIdToSelect || !activeAgentId) && data && data.length > 0) {
        const def = targetIdToSelect 
          ? data.find(a => a.id === targetIdToSelect) 
          : (data.find(a => a.is_default) || data[0]);
        
        if (def) {
          lastLoadedAgentIdRef.current = def.id;
          setActiveAgentId(def.id);
          setTipo(def.tipo as AgentTipo);
          void reload(def.id);
        }
      }

    } catch (e: any) {
      toast.error("Erro ao carregar agentes");
    } finally {
      setLoading(false);
    }
  }

  async function reload(agentId?: string | null) {
    if (!companyId) {
      setLoading(false);
      return;
    }

    const targetId = agentId || activeAgentId;
    if (!targetId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      // Sempre busca do banco para evitar dados obsoletos
      const { data, error } = await supabase
        .from("agent_config")
        .select("*")
        .eq("id", targetId)
        .maybeSingle();

      if (error) throw error;
      
      if (data) {
        applyAgentData(data);
        // Atualiza o item na lista de agentes se ele já existir
        setAgents(prev => prev.map(a => a.id === data.id ? data : a));
      } else {
        setHasConfig(false);
        setCfg(null);
      }

      if (agentId && agentId !== activeAgentId) {
        setChat([]);
        setTestInput("");
      }
      setAvatarLoading(false);
    } catch (e: any) {
      toast.error(e?.message || "Erro ao carregar o agente");
    } finally {
      setLoading(false);
    }
  }



  async function handleGenerateAvatar() {
    if (!activeAgentId) return;
    setAvatarLoading(true);
    try {
      const r = await generateAvatar({ data: { agentId: activeAgentId } });
      setCfg((prev: any) => ({ ...prev, avatar_url: r.avatarUrl }));
      // Invalida o cache local da lista para que a mudança apareça na barra lateral
      setAgents(prev => prev.map(a => a.id === activeAgentId ? { ...a, avatar_url: r.avatarUrl } : a));
      toast.success("Avatar gerado com sucesso!");
    } catch (e: any) {
      toast.error(e?.message || "Erro ao gerar avatar");
    } finally {
      setAvatarLoading(false);
    }
  }



  useEffect(() => { 
    if (searchAgentId) {
      void loadAgents(searchAgentId);
    } else if (activeAgentId) {
      if (lastLoadedAgentIdRef.current !== activeAgentId) {
        lastLoadedAgentIdRef.current = activeAgentId;
        void reload(activeAgentId);
      }
    } else if (companyId) {
      void loadAgents();
    }
  }, [companyId, searchAgentId, activeAgentId]);



  async function runAnalyze() {
    if (descricao.trim().length < 20) {
      return toast.error("Conte um pouco mais sobre o negócio (mínimo ~20 caracteres).");
    }
    setAnalyzing(true);
    try {
      const a: any = await analyze({ data: { descricao, respostas: {} } });
      setResumoIA(a.resumo || "");
      setCobertura(a.cobertura || 0);
      setPerguntas(a.perguntas || []);
      if (a.pronto || !a.perguntas?.length) {
        // já dá pra gerar direto
        await runGenerate({});
      } else {
        setStep("entrevista");
      }
    } catch (e: any) {
      toast.error(e?.message || "Falha ao analisar");
    } finally {
      setAnalyzing(false);
    }
  }

  async function runGenerate(extraRespostas: Record<string, string>) {
    setGenerating(true);
    try {
      const merged = { ...respostas, ...extraRespostas };
      const r: any = await generate({ data: { descricao, respostas: merged } });
      setCfg((prev: any) => ({ ...(prev || {}), ...r.config }));
      setPromptPreview(r.promptPreview);
      setHasConfig(true);
      setStep("pronto");
      toast.success("Pronto! Sua IA foi montada com base no seu negócio.");
    } catch (e: any) {
      toast.error(e?.message || "Falha ao gerar configuração");
    } finally {
      setGenerating(false);
    }
  }

  async function submitEntrevista() {
    // valida obrigatórias
    const faltando = perguntas.filter((q) => q.obrigatoria && !(respostas[q.id] || "").trim());
    if (faltando.length) {
      return toast.error(`Faltou responder: ${faltando[0].pergunta}`);
    }
    await runGenerate(respostas);
  }


  async function save() {
    if (!companyId || !cfg) return;
    setSaving(true);
    const payload = {
      ...cfg,
      sobre_empresa: livre || cfg?.sobre_empresa || "",
      segmento: cfg?.segmento ?? "",
      regiao_horario: cfg?.regiao_horario ?? "",
      produtos_servicos: cfg?.produtos_servicos ?? "",
      pode_fazer: cfg?.pode_fazer ?? "",
      nao_pode_fazer: cfg?.nao_pode_fazer ?? "",
      tipo,
      tamanho_resposta: tamanhoResposta,
      telefone_transferencia: telefone,
      palavra_pausar: palavraPausar,
      palavra_despausar: palavraDespausar,
      responder_em_partes: responderEmPartes,
      segundos_buffer: segundosBuffer,
      regras_rigidas: regrasRigidas,
      is_default: cfg?.is_default ?? (tipo === "qualificacao"),
      nome: cfg?.nome || cfg?.nome_agente || TIPO_LABELS[tipo].label,
      canais_ativos: channelStatus,
      ai_provider: aiProvider,
      ai_model: aiModel,
      temperatura,
      agendamento_ativo: agendamentoAtivo,
      servicos_agendaveis: servicosAgendaveis,
      duracao_padrao: duracaoPadrao,
      horarios_disponiveis: horariosDisponiveis,
      antecedencia_min: antecedenciaMin,
      menu_setores_ativo: menuSetoresAtivo,
      menu_setores_texto: menuSetoresTexto,
      menu_setores_opcoes: menuSetoresOpcoes,
      olist_catalogo: olistCatalogo,
    };
    const { id: _id, user_id: _u, company_id: _c, updated_at: _ua, ...rest } = payload;
    const savePayload = { 
      company_id: companyId, 
      user_id: ctx.user.id, 
      ...rest,
      nome_agente: cfg?.nome_agente || TIPO_LABELS[tipo].label,
      canais_ativos: channelStatus,
      ai_provider: aiProvider,
      ai_model: aiModel,
      temperatura,
      agendamento_ativo: agendamentoAtivo,
      servicos_agendaveis: servicosAgendaveis,
      duracao_padrao: duracaoPadrao,
      horarios_disponiveis: horariosDisponiveis,
      antecedencia_min: antecedenciaMin,
      menu_setores_ativo: menuSetoresAtivo,
      menu_setores_texto: menuSetoresTexto,
      menu_setores_opcoes: menuSetoresOpcoes,
      olist_catalogo: olistCatalogo,
    };

    try {
      await ensureSession();
      const res = await persistAgent({ data: { id: activeAgentId, payload: savePayload } });
      const targetAgentId = activeAgentId || (res as any)?.id;
      if (!activeAgentId && (res as any)?.id) setActiveAgentId((res as any).id);

      if (targetAgentId) {
        try {
          await saveMenu({ data: {
            agent_config_id: targetAgentId,
            ativo: Boolean(menuSetoresAtivo),
            texto: String(menuSetoresTexto || ""),
            opcoes: menuSetoresOpcoes,
          } });
        } catch (menuErr) {
          console.warn("[agente.save] Aviso ao salvar menu de setores:", menuErr);
        }
      }
    } catch (e: any) {
      setSaving(false);
      return toast.error(mensagemErroSessao(e, "Falha ao salvar configuração"));
    }
    setSaving(false);
    toast.success("Configuração salva");
    setPromptPreview(buildSystemPrompt(payload as any, { responderEmPartes, produtos: [] }));
  }

  async function handleApplySuggestion(sug: AgentPromptSuggestionItem) {
    try {
      const res = await applySuggestion({
        data: {
          suggestionId: sug.id,
          agentId: activeAgentId,
          ruleText: sug.regra_sugerida,
          tipo,
        },
      });
      if (res?.regras_rigidas) {
        setRegrasRigidas(res.regras_rigidas);
      } else {
        const next = regrasRigidas ? `${regrasRigidas}\n- ${sug.regra_sugerida}` : `- ${sug.regra_sugerida}`;
        setRegrasRigidas(next);
      }
      setSuggestions((prev) => prev.filter((s) => s.id !== sug.id));
      toast.success("¡Regla agregada con éxito a las Reglas Rígidas!");
    } catch (e: any) {
      toast.error(e?.message || "Error al aplicar regla sugerida");
    }
  }

  async function handleDismissSuggestion(id: string) {
    try {
      await dismissSuggestion({ data: { suggestionId: id } });
      setSuggestions((prev) => prev.filter((s) => s.id !== id));
      toast.success("Sugerencia descartada");
    } catch (e: any) {
      toast.error(e?.message || "Error al descartar sugerencia");
    }
  }

  async function handleSimulateFix(sug: AgentPromptSuggestionItem) {
    try {
      setSimulatingId(sug.id);
      const res = await simulateFix({
        data: {
          suggestionId: sug.id,
          candidateRule: sug.regra_sugerida,
          agentId: activeAgentId,
          tipo,
        },
      });
      if (res?.ok) {
        setSimulationDiffs((prev) => ({
          ...prev,
          [sug.id]: {
            new_reply: res.new_reply,
            previous_reply: res.previous_reply || sug.previous_reply,
            doubt_resolved: res.doubt_resolved,
            simulated_at: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          },
        }));
        if (res.doubt_resolved) {
          toast.success("✅ Simulación completada: ¡La regla resuelve la ambigüedad con éxito!");
        } else {
          toast.warning("⚠️ Simulación completada: La IA aún detectó dudas. Revisa la redacción de la regla.");
        }
      }
    } catch (e: any) {
      toast.error(e?.message || "Error al simular fix");
    } finally {
      setSimulatingId(null);
    }
  }

  async function handleRunBatchTests() {
    try {
      setRunningBatchTest(true);
      const res = await autoTestAll({
        data: {
          agentId: activeAgentId,
          tipo,
        },
      });
      if (res?.results?.length) {
        const nextDiffs: Record<string, any> = { ...simulationDiffs };
        for (const item of res.results) {
          if (item?.suggestionId && item.new_reply) {
            nextDiffs[item.suggestionId] = {
              new_reply: item.new_reply,
              previous_reply: item.previous_reply,
              doubt_resolved: item.doubt_resolved,
              simulated_at: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            };
          }
        }
        setSimulationDiffs(nextDiffs);
        toast.success(`⚡ Pruebas automáticas: ${res.resolved} de ${res.total} sugerencias resueltas exitosamente.`);
      } else {
        toast.info("No hay sugerencias pendientes para probar.");
      }
    } catch (e: any) {
      toast.error(e?.message || "Error al ejecutar pruebas automáticas");
    } finally {
      setRunningBatchTest(false);
    }
  }

  async function runTest(overrideMsg?: string) {
    const msg = (typeof overrideMsg === "string" ? overrideMsg : testInput).trim();
    if (!msg || testing) return;
    const nextChat: ChatMsg[] = [...chat, { role: "user", content: msg }];
    setChat(nextChat);
    setTestInput("");
    setTesting(true);
    try {
      const history = chat.map((m) => ({ role: m.role, content: m.content }));
      const liveDraft = {
        ...(cfg || {}),
        regras_rigidas: regrasRigidas,
        sobre_empresa: livre,
        tamanho_resposta: tamanhoResposta,
        responder_em_partes: responderEmPartes,
        segundos_buffer: segundosBuffer,
        ai_provider: aiProvider,
        ai_model: aiModel,
        temperatura,
        agendamento_ativo: agendamentoAtivo,
        menu_setores_ativo: menuSetoresAtivo,
        olist_catalogo: olistCatalogo,
      };
      const r = await test({ data: { message: msg, tipo, agentId: activeAgentId, draftCfg: liveDraft, history } });
      setChat((c) => [...c, { role: "assistant", content: r.parts.join("\n\n"), parts: r.parts }]);
      if ((r as any)?.sugestao) {
        toast.info("💡 La IA detectó una oportunidad de mejora y generó una sugerencia de entrenamiento.");
        loadSuggestions(activeAgentId);
      }
    } catch (e: any) {
      toast.error(e?.message || "Falha");
      setChat((c) => c.slice(0, -1));
      setTestInput(msg);
    } finally {
      setTesting(false);
    }
  }

  function openCorrect(assistantIdx: number) {
    setCorrectIndex(assistantIdx);
    setCorrectIdeal(chat[assistantIdx]?.content || "");
    setCorrectOpen(true);
  }

  async function submitCorrection() {
    if (correctIndex === null) return;
    const ideal = correctIdeal.trim();
    if (!ideal) return toast.error("Escreva como o agente deveria ter respondido.");
    // pega a última mensagem do cliente antes desta resposta
    let clienteMsg = "";
    for (let i = correctIndex - 1; i >= 0; i--) {
      if (chat[i].role === "user") { clienteMsg = chat[i].content; break; }
    }
    if (!clienteMsg) return toast.error("Não achei a mensagem do cliente correspondente.");
    setCorrectSaving(true);
    try {
      await saveExample({ data: { tipo, cliente: clienteMsg, agente: ideal, agentId: activeAgentId || undefined } });
      setChat((c) => c.map((m, i) => (i === correctIndex ? { ...m, content: ideal, parts: [ideal] } : m)));
      toast.success("Exemplo salvo — o agente vai usar isso como referência.");
      setCorrectOpen(false);
    } catch (e: any) {
      toast.error(e?.message || "Falha ao salvar exemplo");
    } finally {
      setCorrectSaving(false);
    }
  }


  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !activeAgentId || !companyId) return;

    setUploadingFile(true);
    try {
      const fileName = `${companyId}/${activeAgentId}/${Date.now()}-${file.name}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("agent-knowledge")
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: signed } = await supabase.storage
        .from("agent-knowledge")
        .createSignedUrl(fileName, 60 * 60 * 24 * 365 * 10); // 10 years

      const newFile = {
        name: file.name,
        path: fileName,
        url: signed?.signedUrl,
        size: file.size,
        type: file.type,
        uploadedAt: new Date().toISOString()
      };

      const currentFiles = Array.isArray(cfg?.knowledge_files) ? cfg.knowledge_files : [];
      const nextFiles = [...currentFiles, newFile];

      await saveKnowledgeFiles({ data: { agentId: activeAgentId, files: nextFiles } });
      setCfg((prev: any) => ({ ...prev, knowledge_files: nextFiles }));

      // Extrai o texto do arquivo para a IA realmente ler o conteúdo
      setIndexingKnowledge(true);
      try {
        const idx: any = await indexKnowledge({ data: { agentId: activeAgentId } });
        if (idx?.files) setCfg((prev: any) => ({ ...prev, knowledge_files: idx.files }));
        if (idx?.failed > 0) {
          toast.warning("Arquivo enviado, mas parte do conteúdo não pôde ser lida (ex.: PDF de imagem).");
        } else {
          toast.success(`Arquivo enviado e indexado (${idx?.chars ?? 0} caracteres de conhecimento).`);
        }
      } catch {
        toast.warning("Arquivo enviado, mas a indexação falhou. Use 'Reindexar base'.");
      } finally {
        setIndexingKnowledge(false);
      }
    } catch (e: any) {
      toast.error("Erro no upload: " + e.message);
    } finally {
      setUploadingFile(false);
      e.target.value = "";
    }
  }

  async function handleDeleteFile(filePath: string) {
    if (!activeAgentId) return;
    try {
      const { error: storageError } = await supabase.storage
        .from("agent-knowledge")
        .remove([filePath]);

      if (storageError) throw storageError;

      const nextFiles = (Array.isArray(cfg?.knowledge_files) ? cfg.knowledge_files : []).filter((f: any) => f.path !== filePath);
      await saveKnowledgeFiles({ data: { agentId: activeAgentId, files: nextFiles } });
      setCfg((prev: any) => ({ ...prev, knowledge_files: nextFiles }));
      toast.success("Arquivo removido.");
    } catch (e: any) {
      toast.error("Erro ao remover arquivo: " + e.message);
    }
  }

  async function saveTeach() {
    if (!companyId || !cfg) return;
    const txt = teachText.trim();
    if (!txt) return toast.error(language === "es" ? "Escribe lo que la IA debe aprender." : "Escreva o que a IA deve aprender.");
    setTeachSaving(true);
    try {
      const nextLivre = (livre?.trim() ? livre.trim() + "\n\n" : "") + txt;
      setLivre(nextLivre);

      const payload = {
        ...cfg,
        sobre_empresa: nextLivre,
      };
      await persistAgent({ data: { id: activeAgentId, payload } });

      setCfg((prev: any) => ({ ...(prev || {}), sobre_empresa: nextLivre }));
      setPromptPreview(buildSystemPrompt({ ...(cfg || {}), sobre_empresa: nextLivre } as any, { responderEmPartes, produtos: [] }));

      // Registrar en audit_log para trazabilidad en el Historial
      try {
        await supabase.from("audit_log").insert({
          company_id: companyId,
          user_id: ctx.user.id,
          acao: "agent_teach_saved",
          detalhes: {
            descricao: `Entrenamiento rápido añadido: "${txt.slice(0, 120)}${txt.length > 120 ? '...' : ''}"`,
            agent_id: activeAgentId,
            agent_nome: cfg?.nome_agente,
          }
        });
      } catch {}

      toast.success(language === "es" ? "Conocimiento añadido — el agente ya lo sabe." : "Conhecimento adicionado — o agente já sabe disso.");
      setTeachOpen(false);
      setTeachText("");
    } catch (e: any) {
      toast.error(e?.message || (language === "es" ? "Fallo al guardar conocimiento" : "Falha ao salvar conhecimento"));
    } finally {
      setTeachSaving(false);
    }
  }

  async function createNewAgent() {
    if (!newAgentName.trim()) return toast.error(language === "es" ? "Escribe el nombre del agente" : "Digite o nome do agente");
    setSaving(true);
    try {
      const data = await addAgent({ data: { nome: newAgentName, tipo: newAgentTipo, descricao: descricao.trim() } });
      
      toast.success(language === "es" ? "Agente creado con éxito" : "Agente criado com sucesso");
      setNewAgentOpen(false);
      setNewAgentName("");
      setDescricao("");
      setActiveAgentId(data.id);
      await loadAgents(data.id);
      await reload(data.id);
    } catch (e: any) {
      toast.error(e.message || (language === "es" ? "Error al crear agente" : "Erro ao criar agente"));
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteAgent(id: string) {
    setSaving(true);
    try {
      await removeAgent({ data: { id } });
      toast.success(language === "es" ? "Agente eliminado" : "Agente excluído");
      if (activeAgentId === id) setActiveAgentId(null);
      await loadAgents();
      await reload(null);
    } catch (e: any) {
      toast.error(language === "es" ? "Error al eliminar agente" : "Erro ao excluir agente");
    } finally {
      setSaving(false);
      setDeletingId(null);
    }
  }

  const studioHeader = (
    <div className="max-w-4xl mx-auto mb-6">
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
        <Bot className="size-3.5" />
        <span>Studio de Agentes</span>
        <span>/</span>
        <span className="text-foreground font-medium">{cfg?.nome_agente || "Agente"}</span>
      </div>
    </div>
  );

  const studioSidebar = (
    <div className="w-full lg:w-72 shrink-0 flex flex-col gap-4 border-r border-[var(--border)] pr-6 mb-6 lg:mb-0">
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-lg font-bold">{t("ai.agent_studio", undefined, "Agente Studio")}</h2>
          <Button size="icon" variant="ghost" onClick={() => setNewAgentOpen(true)} className="size-8">
            <Plus className="size-4" />
          </Button>
        </div>
        
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <Input 
            placeholder={t("ai.search_agent", undefined, "Buscar agente...")} 
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            className="pl-9 h-9 text-xs"
          />
        </div>
      </div>

      <ScrollArea className="flex-1 -mr-2 pr-2">
        <div className="space-y-1">
          {agents
            .filter(a => a.nome_agente?.toLowerCase().includes(searchTerm.toLowerCase()))
            .map((agent) => (
              <div 
                key={agent.id}
                className={cn(
                  "group flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors",
                  activeAgentId === agent.id ? "bg-[var(--brand)] text-white" : "hover:bg-[var(--panel-2)]"
                )}
                onClick={() => setActiveAgentId(agent.id)}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={cn(
                    "size-8 rounded-full flex items-center justify-center shrink-0 overflow-hidden",
                    activeAgentId === agent.id ? "bg-white/20" : "bg-[var(--panel)]"
                  )}>
                    <AgentAvatar 
                      avatarUrl={agent.avatar_url} 
                      traits={agent.avatar_traits} 
                      fallbackName={agent.nome_agente || "IA"}
                      size={32} 
                    />
                  </div>

                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{agent.nome_agente || "Sem nome"}</p>
                    <p className={cn(
                      "text-[10px] truncate",
                      activeAgentId === agent.id ? "text-white/70" : "text-muted-foreground"
                    )}>
                      {TIPO_LABELS[agent.tipo as AgentTipo]?.label || agent.tipo}
                    </p>
                  </div>
                </div>
                
                {!agent.is_default && (
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeletingId(agent.id);
                    }}
                    className={cn(
                      "opacity-0 group-hover:opacity-100 p-1 hover:bg-red-500/20 rounded transition-all",
                      activeAgentId === agent.id ? "text-white" : "text-muted-foreground hover:text-red-500"
                    )}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </div>
            ))
          }
        </div>
      </ScrollArea>
    </div>
  );

  if (loading && agents.length === 0) return (
    <div className="flex h-screen items-center justify-center bg-[#F4F5F9]">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="size-8 animate-spin text-[var(--brand)]" />
        <p className="text-sm text-muted-foreground animate-pulse">Carregando Studio...</p>
      </div>
    </div>
  );

    if (loading && activeAgentId) {
      return (
        <div className="flex flex-col lg:flex-row min-h-[calc(100vh-140px)] gap-6">
          {studioSidebar}
          <div className="flex-1 space-y-8 p-6 max-w-4xl mx-auto w-full">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-6">
              <div className="flex items-center gap-4">
                <Skeleton className="size-16 rounded-2xl" />
                <div className="space-y-2">
                  <Skeleton className="h-6 w-48" />
                  <Skeleton className="h-4 w-32" />
                </div>
              </div>
              <div className="flex gap-2">
                <Skeleton className="h-8 w-24 rounded-lg" />
                <Skeleton className="h-8 w-24 rounded-lg" />
              </div>
            </div>
            
            <div className="space-y-6">
              <Skeleton className="h-10 w-full rounded-lg" />
              <div className="grid grid-cols-3 gap-4">
                <Skeleton className="h-24 rounded-xl" />
                <Skeleton className="h-24 rounded-xl" />
                <Skeleton className="h-24 rounded-xl" />
              </div>
              <Skeleton className="h-[400px] w-full rounded-xl" />
            </div>
          </div>
        </div>
      );
    }




  // ---------- Tela inicial: descrição livre → análise PRD ----------
  if (!hasConfig) {
    // Se estiver carregando e não tivermos config ainda, mostra Skeleton de setup
    if (loading) {
      return (
        <div className="flex flex-col lg:flex-row min-h-[calc(100vh-140px)] gap-6">
          {studioSidebar}
          <div className="flex-1 space-y-8 p-6 max-w-2xl mx-auto w-full">
            <div className="space-y-4">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-10 w-64" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-64 w-full rounded-2xl" />
            </div>
          </div>
        </div>
      );
    }

    if (step === "entrevista") {
      return (
        <div className="flex flex-col lg:flex-row min-h-[calc(100vh-140px)] gap-6">
          {studioSidebar}
          <div className="flex-1 space-y-6 max-w-2xl mx-auto">
            {studioHeader}

            <header className="space-y-2 pt-2">
              <button
                onClick={() => setStep("descrever")}
                className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
              >
                <ArrowLeft className="size-3" /> Voltar e reescrever
              </button>
              <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--brand-text)]">
                <HelpCircle className="size-3.5" /> Faltam alguns detalhes
              </div>
              <h1 className="font-display text-2xl sm:text-3xl font-bold">
                Pra IA não responder torto, me ajuda com isso
              </h1>
              {resumoIA && (
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">Entendi até aqui:</span> {resumoIA}
                </p>
              )}
              <div className="flex items-center gap-2 pt-1">
                <div className="h-1.5 flex-1 rounded-full bg-[var(--panel-2)] overflow-hidden">
                  <div
                    className="h-full bg-[var(--brand)] transition-all"
                    style={{ width: `${Math.max(15, cobertura)}%` }}
                  />
                </div>
                <span className="text-[11px] text-muted-foreground tabular-nums">{cobertura}%</span>
              </div>
            </header>

            <div className="space-y-3">
              {perguntas.map((q) => (
                <div
                  key={q.id}
                  className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-4 space-y-2"
                >
                  <div className="flex items-start justify-between gap-3">
                    <Label className="text-sm font-medium leading-snug">
                      {q.pergunta}
                      {q.obrigatoria && <span className="text-[var(--brand-text)] ml-1">*</span>}
                    </Label>
                  </div>
                  {q.porque && (
                    <p className="text-[11.5px] text-muted-foreground">
                      <span className="font-medium">Por que importa:</span> {q.porque}
                    </p>
                  )}
                  <Textarea
                    value={respostas[q.id] || ""}
                    onChange={(e) => setRespostas((r) => ({ ...r, [q.id]: e.target.value }))}
                    placeholder={q.exemplo ? `Ex: ${q.exemplo}` : ""}
                    rows={2}
                    className="text-sm"
                  />
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between gap-3 flex-wrap pt-2">
              <button
                onClick={() => runGenerate(respostas)}
                disabled={generating}
                className="text-xs text-muted-foreground underline disabled:opacity-50"
              >
                Pular e gerar com o que tenho
              </button>
              <Button onClick={submitEntrevista} disabled={generating} size="lg">
                {generating ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Wand2 className="size-4 mr-2" />}
                Gerar atendimento da IA
              </Button>
            </div>
          </div>
        </div>
      );
    }
    
    // Se estiver carregando mas tem agentes, não mostra o setup até terminar de carregar o cfg
    if (loading && agents.length > 0) {
      return (
        <div className="flex flex-col lg:flex-row min-h-[calc(100vh-140px)] gap-6">
          {studioSidebar}
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="size-8 animate-spin text-[var(--brand)] opacity-20" />
          </div>
        </div>
      );
    }


    return (
      <div className="flex flex-col lg:flex-row min-h-[calc(100vh-140px)] gap-6">
        {studioSidebar}
        <div className="flex-1 space-y-6 max-w-3xl mx-auto">
          {studioHeader}
          <header className="space-y-2 text-center pt-4">

          <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--brand-text)]">
            <Sparkles className="size-3.5" /> Agente IA
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold">Conte sobre o seu negócio</h1>
          <p className="text-sm text-muted-foreground">
            Escreva do seu jeito. A IA vai ler, ver o que falta e te perguntar antes de montar — pra não responder torto depois.
          </p>
        </header>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-5 space-y-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <Label className="text-sm font-medium">
              Descreva seu negócio, como você atende e o que a IA deve fazer
            </Label>
            <MicDictateButton
              onTranscript={(t) =>
                setDescricao((prev) => (prev.trim() ? prev.trim() + " " + t : t))
              }
              disabled={analyzing || generating}
            />
          </div>
          <Textarea
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder={PLACEHOLDER}
            rows={10}
            className="text-sm leading-relaxed"
          />
          <p className="text-[11px] text-muted-foreground">
            Dica: clique em <strong>Ditar por voz</strong> e fale naturalmente — o texto será transcrito e adicionado aqui.
          </p>
          <div className="grid sm:grid-cols-4 gap-2 text-[11px] text-muted-foreground">
            <Hint icon={<CheckCircle2 className="size-3" />} text="O que vende e preço" />
            <Hint icon={<CheckCircle2 className="size-3" />} text="Região e horário" />
            <Hint icon={<CheckCircle2 className="size-3" />} text="Como atende (entrega/agenda)" />
            <Hint icon={<CheckCircle2 className="size-3" />} text="Formas de pagamento" />
          </div>
          <div className="flex items-center justify-end gap-3 flex-wrap pt-1">
            <Button onClick={runAnalyze} disabled={analyzing || generating} size="lg">
              {analyzing ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Wand2 className="size-4 mr-2" />}
              Analisar e treinar IA
            </Button>
          </div>
        </div>

        <div className="text-center">
          <button
            type="button"
            onClick={() => { setStep("pronto"); setActiveTab("avancado"); }}
            className="text-xs text-muted-foreground underline cursor-pointer hover:text-foreground"
          >
            Prefiro preencher tudo manualmente (edição avançada)
          </button>
        </div>
        </div>
      </div>
    );
  }



  // ---------- Tela com config: resumo + ajustes finos + teste ----------
  const currentAgent = agents.find(a => a.id === activeAgentId);

  return (
    <div className="flex flex-col lg:flex-row min-h-[calc(100vh-140px)] gap-6">
      {studioSidebar}
      <div className="flex-1 space-y-6">
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[var(--border)] pb-6">
            <div className="flex items-center gap-4">
              <div className="relative group size-16 shrink-0 rounded-full bg-[var(--panel-2)] flex items-center justify-center overflow-hidden">
                <AgentAvatar
                  avatarUrl={cfg?.avatar_url || undefined}
                  traits={cfg?.avatar_traits || undefined}
                  fallbackName={cfg?.nome_agente || "IA"}
                  size={64}
                  className="rounded-full"
                />
                
                <button 
                  onClick={() => setAvatarBuilderOpen(true)}
                  disabled={avatarLoading}
                  className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-100"
                >
                  {avatarLoading ? (
                    <Loader2 className="size-5 text-white animate-spin" />
                  ) : (
                    <Camera className="size-5 text-white" />
                  )}
                </button>
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-bold tracking-tight">{cfg?.nome_agente || "Agente sem nome"}</h1>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="h-7 text-[10px] gap-2 rounded-lg border-slate-200"
                    onClick={() => setAvatarBuilderOpen(true)}
                  >
                    <Pencil className="size-3" /> {t("ai.edit_avatar", undefined, "Editar avatar")}
                  </Button>
                  <Badge variant={currentAgent?.is_active !== false ? "outline" : "secondary"} className={cn("text-[10px] uppercase", currentAgent?.is_active !== false ? "border-green-500/50 text-green-600 bg-green-50" : "")}>
                    {currentAgent?.is_active !== false ? t("ai.active", undefined, "Activo") : t("ai.inactive", undefined, "Inactivo")}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground flex items-center gap-2">
                  {TIPO_LABELS[tipo].label} • WhatsApp • {language === "es" ? "Embudo de Ventas" : language === "en" ? "Sales Funnel" : "Funil de Vendas"}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button 
                variant={activeTab === "avancado" ? "default" : "outline"} 
                size="sm" 
                className="gap-2 text-xs cursor-pointer" 
                onClick={() => setActiveTab("avancado")}
              >
                <Settings2 className="size-3.5" /> {t("ai.advanced_config", undefined, "Configuración avanzada")}
              </Button>
              <Button 
                onClick={() => { setHistoryDialogOpen(true); void loadHistory(); }} 
                variant="outline" 
                size="sm" 
                className="gap-2 text-xs cursor-pointer hover:bg-slate-50"
              >
                <History className="size-3.5" /> {t("ai.history", undefined, "Historial")}
              </Button>
              <Button 
                onClick={() => setPreviewDialogOpen(true)} 
                variant="outline" 
                size="sm" 
                className="gap-2 text-xs cursor-pointer hover:bg-slate-50"
              >
                <Eye className="size-3.5" /> {t("ai.preview", undefined, "Vista previa")}
              </Button>
              <Button onClick={() => { setCopilotInitialPrompt(null); setCopilotOpen(true); }} size="sm" className="gap-2 text-xs bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white shadow-xs">
                <Sparkles className="size-3.5" /> {t("ai.train_copilot", undefined, "Entrenar con Copilot IA")}
              </Button>
              <Button onClick={save} disabled={saving} size="sm" className="gap-2 text-xs bg-[var(--brand)] hover:bg-[var(--brand)]/90">
                {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />} 
                {t("ai.save_changes", undefined, "Guardar cambios")}
              </Button>
            </div>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="w-full justify-start bg-transparent border-b border-[var(--border)] rounded-none h-12 p-0 gap-6 overflow-x-auto">
              <TabsTrigger value="visao" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-[var(--brand)] rounded-none h-full px-0 text-sm font-medium">{t("ai.overview", undefined, "Visión general")}</TabsTrigger>
              <TabsTrigger value="conhecimento" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-[var(--brand)] rounded-none h-full px-0 text-sm font-medium">{t("ai.knowledge", undefined, "Conocimiento")}</TabsTrigger>
              <TabsTrigger value="comportamento" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-[var(--brand)] rounded-none h-full px-0 text-sm font-medium">{t("ai.behavior", undefined, "Comportamiento")}</TabsTrigger>
              <TabsTrigger value="fluxo" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-[var(--brand)] rounded-none h-full px-0 text-sm font-medium">{t("ai.training", undefined, "Entrenamiento")}</TabsTrigger>
              <TabsTrigger value="canais" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-[var(--brand)] rounded-none h-full px-0 text-sm font-medium">{t("ai.channels", undefined, "Canales")}</TabsTrigger>
              <TabsTrigger value="avancado" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-[var(--brand)] rounded-none h-full px-0 text-sm font-medium">{t("ai.advanced", undefined, "Avanzado")}</TabsTrigger>
              <TabsTrigger value="analises" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-[var(--brand)] rounded-none h-full px-0 text-sm font-medium">{t("ai.analytics", undefined, "Análisis")}</TabsTrigger>
            </TabsList>

            <div className="grid lg:grid-cols-[1fr_360px] gap-8 pt-8">
              <div className="space-y-8">
                <TabsContent value="conhecimento" className="mt-0 space-y-8">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-bold">{t("ai.knowledge_base", undefined, "Base de conocimiento")}</h3>
                      <p className="text-xs text-muted-foreground">{t("ai.knowledge_subtitle", undefined, "Organiza la información que el agente usa para responder.")}</p>
                    </div>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="gap-2 border-[var(--brand)] text-[var(--brand)] hover:bg-[var(--brand)]/5"
                      onClick={() => setTeachOpen(true)}
                    >
                      <Plus className="size-3.5" /> {t("ai.add_knowledge", undefined, "Añadir conocimiento")}
                    </Button>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div className="p-4 rounded-xl border border-[var(--border)] bg-white space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="size-8 rounded-lg bg-blue-50 flex items-center justify-center">
                          <FileText className="size-4 text-blue-600" />
                        </div>
                        <span className="text-lg font-bold">
                          {(Array.isArray(cfg?.knowledge_files) ? cfg.knowledge_files.length : 0) + (livre?.trim() ? 1 : 0) + (Array.isArray(cfg?.produtos_servicos) ? cfg.produtos_servicos.length : 0)}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground uppercase font-semibold">{t("ai.linked_sources", undefined, "Fuentes vinculadas")}</p>
                    </div>
                    <div className="p-4 rounded-xl border border-[var(--border)] bg-white space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="size-8 rounded-lg bg-green-50 flex items-center justify-center">
                          <Zap className="size-4 text-green-600" />
                        </div>
                        <span className="text-[10px] text-green-600 font-medium">{t("ai.updated_now", undefined, "Actualizado ahora")}</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground uppercase font-semibold">{t("ai.status", undefined, "Estado")}</p>
                    </div>
                    <div className="p-4 rounded-xl border border-[var(--border)] bg-white space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="size-8 rounded-lg bg-purple-50 flex items-center justify-center">
                          <CheckCircle2 className="size-4 text-purple-600" />
                        </div>
                        <span className="text-lg font-bold">100%</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground uppercase font-semibold">{t("ai.processed", undefined, "Procesado")}</p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <Collapsible>
                      <CollapsibleTrigger asChild>
                        <div className="w-full">
                          <KnowledgeCard 
                            icon={<LayoutGrid className="size-4" />} 
                            title={t("ai.company_info", undefined, "Información de la Empresa")} 
                            description={livre || t("ai.company_info_desc", undefined, "Configuración general y reglas de negocio")}
                            status={language === "es" ? "Activo" : language === "en" ? "Active" : "Ativo"}
                          />
                        </div>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="mt-2 p-4 rounded-xl border border-[var(--border)] bg-white space-y-4">
                        <div className="space-y-2">
                          <Label>Conhecimento Geral e Regras</Label>
                          <Textarea 
                            value={livre} 
                            onChange={(e) => setLivre(e.target.value)} 
                            placeholder="Descreva aqui tudo que a IA deve saber sobre sua empresa, produtos e como atender..." 
                            rows={12}
                            className="text-sm leading-relaxed"
                          />
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                    
                    <Collapsible>
                      <CollapsibleTrigger asChild>
                        <div className="w-full">
                          <KnowledgeCard 
                            icon={<ShoppingBag className="size-4" />} 
                            title={t("ai.product_catalog", undefined, "Catálogo de Productos")} 
                            description={produtos.length > 0 ? (language === "es" ? `${produtos.length} producto(s) sincronizado(s) en el sistema` : `${produtos.length} produto(s) sincronizado(s) no sistema`) : (language === "es" ? "Integrado con el catálogo de productos y servicios" : "Integrado com o catálogo de produtos e serviços")}
                            badge={produtos.length > 0 ? (language === "es" ? `${produtos.length} productos` : `${produtos.length} produtos`) : (language === "es" ? "Automático" : "Automático")}
                          />
                        </div>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="mt-2 p-4 rounded-xl border border-[var(--border)] bg-white space-y-4">
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <p className="text-sm font-semibold">{language === "es" ? "Consultar y recomendar catálogo" : "Consultar e recomendar catálogo"}</p>
                            <p className="text-xs text-muted-foreground">{language === "es" ? "Permite que la IA consulte fotos, descripciones y precios para sugerir artículos a los clientes." : "Permite que a IA consulte fotos, descrições e preços para sugerir itens aos clientes."}</p>
                          </div>
                          <Switch 
                            checked={olistCatalogo} 
                            onCheckedChange={setOlistCatalogo} 
                          />
                        </div>
                        <div className="flex items-center justify-between pt-2 border-t">
                          <span className="text-xs text-muted-foreground">
                            {produtos.filter(p => p.ativo !== false).length} de {produtos.length} {language === "es" ? "productos activos" : "produtos ativos"}
                          </span>
                          <Button variant="outline" size="sm" className="h-7 text-xs" asChild>
                            <Link to="/app/catalogo">{language === "es" ? "Gestionar Catálogo" : "Gerenciar Catálogo"}</Link>
                          </Button>
                        </div>
                      </CollapsibleContent>
                    </Collapsible>

                    <Collapsible>
                      <CollapsibleTrigger asChild>
                        <div className="w-full">
                          <KnowledgeCard 
                            icon={<Share2 className="size-4" />} 
                            title={t("ai.crm_flow", undefined, "Flujo de CRM")} 
                            description={stages.length > 0 ? (language === "es" ? `${stages.length} etapas activas en el embudo de ventas` : `${stages.length} etapas ativas no funil de vendas`) : (language === "es" ? "Reglas de movimiento automático entre etapas" : "Regras de movimentação automática entre etapas")}
                            badge={stages.length > 0 ? (language === "es" ? `${stages.length} etapas` : `${stages.length} etapas`) : (language === "es" ? "Automático" : "Automático")}
                          />
                        </div>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="mt-2 p-4 rounded-xl border border-[var(--border)] bg-white space-y-4">
                        <div>
                          <p className="text-sm font-semibold">Movimentação Inteligente no Kanban</p>
                          <p className="text-xs text-muted-foreground">A IA analisa o diálogo em tempo real e avança o contato automaticamente conforme a intenção do cliente.</p>
                        </div>
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {stages.map((stg: any) => (
                            <Badge key={stg.id} variant="secondary" className="text-xs flex items-center gap-1">
                              <span className="size-1.5 rounded-full" style={{ backgroundColor: stg.cor || '#2563EB' }} />
                              {stg.nome}
                            </Badge>
                          ))}
                        </div>
                        <div className="flex items-center justify-end pt-2 border-t">
                          <Button variant="outline" size="sm" className="h-7 text-xs" asChild>
                            <Link to="/app/crm">Abrir Funil de CRM</Link>
                          </Button>
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  </div>

                  <div className="space-y-3">
                    {Array.isArray(cfg?.knowledge_files) && cfg.knowledge_files.length > 0 && (
                      <div className="flex items-center justify-between">
                        <p className="text-[11px] text-muted-foreground">
                          Conhecimento indexado: <strong>{(Array.isArray(cfg?.knowledge_files) ? cfg.knowledge_files : []).reduce((a: number, f: any) => a + (Number(f?.textChars) || 0), 0).toLocaleString()}</strong> caracteres
                        </p>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-[11px]"
                          disabled={indexingKnowledge}
                          onClick={async () => {
                            if (!activeAgentId) return;
                            setIndexingKnowledge(true);
                            try {
                              const idx: any = await indexKnowledge({ data: { agentId: activeAgentId, force: true } });
                              if (idx?.files) setCfg((prev: any) => ({ ...prev, knowledge_files: idx.files }));
                              toast.success(`Base reindexada: ${idx?.chars ?? 0} caracteres${idx?.failed ? ` (${idx.failed} arquivo(s) ilegível)` : ""}.`);
                            } catch (e: any) {
                              toast.error("Falha ao reindexar: " + (e?.message || "erro"));
                            } finally {
                              setIndexingKnowledge(false);
                            }
                          }}
                        >
                          {indexingKnowledge ? <Loader2 className="size-3 animate-spin mr-1" /> : <RefreshCcw className="size-3 mr-1" />}
                          Reindexar base
                        </Button>
                      </div>
                    )}
                    {(Array.isArray(cfg?.knowledge_files) ? cfg.knowledge_files : []).map((file: any) => (
                      <div key={file.path} className="flex items-center justify-between p-3 rounded-xl border border-[var(--border)] bg-white group">
                        <div className="flex items-center gap-3">
                          <div className="size-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
                            <FileText className="size-4" />
                          </div>
                          <div>
                            <p className="text-xs font-bold truncate max-w-[200px]">{file.name}</p>
                            <p className="text-[10px] text-muted-foreground">
                              {(file.size / 1024).toFixed(1)} KB • {new Date(file.uploadedAt).toLocaleDateString()}
                              {file.textStatus === "ok" && (
                                <span className="ml-1 text-emerald-600 font-semibold">• Indexado ({Number(file.textChars || 0).toLocaleString()} chars)</span>
                              )}
                              {file.textStatus === "ilegivel" && (
                                <span className="ml-1 text-amber-600 font-semibold">• Não legível pela IA</span>
                              )}
                              {!file.textStatus && (
                                <span className="ml-1 text-amber-600 font-semibold">• Não indexado — clique em Reindexar base</span>
                              )}
                            </p>
                          </div>
                        </div>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="size-8 text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => handleDeleteFile(file.path)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>

                  <div className="relative border-2 border-dashed border-[var(--brand)]/30 rounded-2xl p-8 flex flex-col items-center justify-center text-center gap-3 bg-[var(--brand)]/5 hover:bg-[var(--brand)]/10 transition-colors">
                    <input 
                      type="file" 
                      className="absolute inset-0 opacity-0 cursor-pointer" 
                      onChange={handleFileUpload}
                      disabled={uploadingFile}
                      accept=".pdf,.txt,.doc,.docx"
                    />
                    <div className="size-12 rounded-full bg-blue-50 flex items-center justify-center text-blue-600">
                      {uploadingFile ? <Loader2 className="size-6 animate-spin" /> : <Database className="size-6" />}
                    </div>
                    <div>
                      <h4 className="font-bold text-sm">{t("ai.train_with_files", undefined, "Entrenar con nuevos archivos")}</h4>
                      <p className="text-xs text-muted-foreground">{t("ai.drag_files", undefined, "Haz clic o arrastra archivos (PDF, TXT, DOCX)")}</p>
                    </div>
                  </div>

                </TabsContent>

                <TabsContent value="visao" className="mt-0 space-y-6">
                  <div className="space-y-6">
                    <Section title={language === "es" ? "Información básica" : "Informações básicas"}>
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label>{language === "es" ? "Nombre del Agente" : "Nome do Agente"}</Label>
                          <Input value={cfg?.nome_agente || ""} onChange={(e) => setCfg({...cfg, nome_agente: e.target.value})} placeholder={language === "es" ? "Ej: Consultor de Ventas" : "Ex: Consultor de Vendas"} />
                        </div>
                        <div className="space-y-2">
                          <Label className="flex items-center gap-1.5 font-medium text-xs">
                            <Globe className="size-3.5 text-primary" />
                            {language === "es" ? "Idioma de Atención de la IA" : "Idioma de Atendimento da IA"}
                          </Label>
                          <div className="grid grid-cols-3 gap-2">
                            {[
                              { code: "es", label: "Español", flag: "🇪🇸" },
                              { code: "pt", label: "Português", flag: "🇧🇷" },
                              { code: "en", label: "English", flag: "🇺🇸" },
                            ].map((item) => (
                              <button
                                key={item.code}
                                type="button"
                                onClick={() => setCfg({ ...cfg, idioma: item.code })}
                                className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg border text-xs font-medium transition-all ${
                                  (cfg?.idioma || "es") === item.code
                                    ? "border-primary bg-primary/10 text-primary font-bold ring-1 ring-primary/20"
                                    : "border-border bg-card hover:bg-muted/50 text-foreground"
                                }`}
                              >
                                <span>{item.flag}</span>
                                <span>{item.label}</span>
                              </button>
                            ))}
                          </div>
                          <p className="text-[11px] text-muted-foreground">
                            {language === "es" ? "Define el idioma en el cual la IA conversará con los clientes en WhatsApp y redes sociales." : "Define o idioma no qual a IA conversará com os clientes no WhatsApp e redes sociais."}
                          </p>
                        </div>
                        <div className="space-y-2">
                          <Label>{language === "es" ? "Rol y Objetivo" : "Papel e Objetivo"}</Label>
                          <Textarea value={cfg?.papel_objetivo || ""} onChange={(e) => setCfg({...cfg, papel_objetivo: e.target.value})} placeholder={language === "es" ? "¿Qué debe hacer el agente?..." : "O que o agente deve fazer..."} rows={4} />
                        </div>
                      </div>
                    </Section>
                    <Section title={language === "es" ? "Estadísticas del Agente" : "Estatísticas do Agente"}>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-[var(--panel-2)]">
                          <span className="text-xs text-muted-foreground">{language === "es" ? "Ejemplos entrenados" : "Exemplos treinados"}</span>
                          <span className="font-bold">{(cfg?.exemplos_few_shot?.length || 0)}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-[var(--panel-2)]">
                          <span className="text-xs text-muted-foreground">{language === "es" ? "Fuentes activas" : "Fontes ativas"}</span>
                          <span className="font-bold text-green-600">{(Array.isArray(cfg?.knowledge_files) ? cfg.knowledge_files.length : 0) + (livre?.trim() ? 1 : 0)}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-[var(--panel-2)]">
                          <span className="text-xs text-muted-foreground">{language === "es" ? "Buffer de respuesta" : "Buffer de resposta"}</span>
                          <span className="font-bold">{segundosBuffer}s</span>
                        </div>
                      </div>
                    </Section>
                  </div>
                </TabsContent>

                <TabsContent value="comportamento" className="mt-0 space-y-6">
                  <div className="space-y-6">
                    <Section title={language === "es" ? "Personalidad" : "Personalidade"}>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>{language === "es" ? "Tono de las respuestas" : "Tom das respostas"}</Label>
                          <Select value={tamanhoResposta} onValueChange={(v) => setTamanhoResposta(v as any)}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="curtas">{language === "es" ? "Cortas (estilo WhatsApp)" : "Curtas (estilo WhatsApp)"}</SelectItem>
                              <SelectItem value="medias">{language === "es" ? "Medias" : "Médias"}</SelectItem>
                              <SelectItem value="longas">{language === "es" ? "Largas (explicativas)" : "Longas (explicativas)"}</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>{language === "es" ? "Estilo de Comunicación" : "Estilo de Comunicação"}</Label>
                          <Input value={cfg?.estilo_comunicacao || "Humano e prestativo"} onChange={(e) => setCfg({...cfg, estilo_comunicacao: e.target.value})} />
                        </div>
                      </div>
                    </Section>

                    <Section title={language === "es" ? "Configuraciones Avanzadas" : "Configurações Avançadas"}>
                      <div className="space-y-5">
                        <div className="grid grid-cols-2 gap-6">
                          <div className="space-y-4">
                            <div className="flex items-center justify-between">
                              <div className="space-y-0.5">
                                <Label>{language === "es" ? "Responder en partes" : "Responder em partes"}</Label>
                                <p className="text-[10px] text-muted-foreground">{language === "es" ? "Simula comportamiento humano en WhatsApp" : "Simula comportamento humano no WhatsApp"}</p>
                              </div>
                              <Switch checked={responderEmPartes} onCheckedChange={setResponderEmPartes} />
                            </div>
                            <div className="space-y-2">
                              <Label>{language === "es" ? "Teléfono para transferencia" : "Telefone para transferência"}</Label>
                              <Input value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="Ex: +58 412 1234567 ou 5511999999999" />
                            </div>
                          </div>
                          <div className="space-y-4">
                            <div className="space-y-2">
                              <Label>{language === "es" ? "Comando para pausar IA" : "Palavra para pausar IA"}</Label>
                              <Input value={palavraPausar} onChange={(e) => setPalavraPausar(e.target.value)} />
                            </div>
                            <div className="space-y-2">
                              <Label>{language === "es" ? "Comando para despausar IA" : "Palavra para despausar IA"}</Label>
                              <Input value={palavraDespausar} onChange={(e) => setPalavraDespausar(e.target.value)} />
                            </div>
                          </div>
                        </div>

                        {/* Buffer / Debounce de Mensagens (Fase A) */}
                        <div className="rounded-xl border border-border/80 bg-muted/20 p-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-2">
                                <Label className="text-sm font-medium">{language === "es" ? "Buffer de Mensajes (Espera antes de responder)" : "Buffer de Mensagens (Espera antes de responder)"}</Label>
                                <Badge variant="secondary" className="font-mono text-xs">{segundosBuffer}s</Badge>
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {language === "es" ? "Agrupa mensajes seguidos del cliente (ej: \"Hola\", \"¿Tienen Netflix?\", \"¿A cómo?\") enviados dentro de este intervalo en una única respuesta completa y coherente. 0 = inmediato." : "Agrupa mensagens seguidas do cliente (ex: \"Hola\", \"¿Tienen Netflix?\", \"¿A cómo?\") enviadas dentro deste intervalo em uma única resposta completa e coerente. 0 = imediato."}
                              </p>
                            </div>
                          </div>
                          <div className="space-y-2 pt-1">
                            <Slider
                              value={[segundosBuffer]}
                              min={0}
                              max={30}
                              step={1}
                              onValueChange={([val]) => setSegundosBuffer(val)}
                            />
                            <div className="flex justify-between text-[11px] text-muted-foreground font-mono">
                              <button type="button" onClick={() => setSegundosBuffer(0)} className="hover:text-foreground">0s ({language === "es" ? "inmediato" : "imediato"})</button>
                              <button type="button" onClick={() => setSegundosBuffer(3)} className="hover:text-foreground">3s</button>
                              <button type="button" onClick={() => setSegundosBuffer(5)} className="hover:text-foreground font-semibold text-brand">5s ({language === "es" ? "recomendado" : "recomendado"})</button>
                              <button type="button" onClick={() => setSegundosBuffer(10)} className="hover:text-foreground">10s</button>
                              <button type="button" onClick={() => setSegundosBuffer(15)} className="hover:text-foreground">15s</button>
                              <button type="button" onClick={() => setSegundosBuffer(30)} className="hover:text-foreground">30s</button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </Section>
                  </div>
                </TabsContent>

                
                <TabsContent value="fluxo" className="mt-0 space-y-6">
                  {/* Banner Copilot Entrenador */}
                  <div className="rounded-xl border border-violet-500/30 bg-gradient-to-r from-violet-500/10 via-indigo-500/5 to-transparent p-5 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 text-white shadow-sm">
                          <Sparkles className="h-5 w-5" />
                        </div>
                        <div>
                          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                            AI Studio Copilot
                            <Badge variant="outline" className="text-[10px] bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/30">
                              Arquitecto y Entrenador
                            </Badge>
                          </h3>
                          <p className="text-xs text-muted-foreground">
                            Configura productos, redacta reglas y resuelve dudas de clientes hablando directamente con la IA.
                          </p>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        className="h-8 text-xs gap-1.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white shadow-xs shrink-0"
                        onClick={() => {
                          setCopilotInitialPrompt(null);
                          setCopilotOpen(true);
                        }}
                      >
                        <Sparkles className="h-3.5 w-3.5" /> Abrir Chat de Entrenamiento
                      </Button>
                    </div>
                  </div>
                  <Section title={language === "es" ? "Mensaje inicial (apertura estándar)" : "Mensagem inicial (abertura padrão)"}>
                    <div className="space-y-2">
                      <Textarea
                        value={cfg?.apresentacao || ""}
                        onChange={(e) => setCfg({ ...cfg, apresentacao: e.target.value })}
                        placeholder={`Ex: Oi! Aqui é a ${cfg?.nome_agente || "Lia"} da ${cfg?.nome_empresa || "sua empresa"}. Vi que você chegou pelo anúncio — me conta rapidinho o que você procura?`}
                        rows={3}
                      />
                      <p className="text-[11px] text-muted-foreground">
                        {language === "es" ? "Es exactamente así como el agente iniciará la conversación (1er mensaje). Escribe la frase lista." : "É exatamente assim que o agente vai abrir a conversa (1ª mensagem). Escreva a frase pronta."}
                      </p>
                    </div>
                  </Section>

                  <Section title={tipo === "posvenda" ? (language === "es" ? "Guión de postventa (paso a paso)" : "Roteiro de pós-venda (passo a passo)") : tipo === "followup" ? (language === "es" ? "Guión de follow-up (paso a paso)" : "Roteiro de follow-up (passo a passo)") : (language === "es" ? "Guión de calificación/venta (paso a paso)" : "Roteiro de qualificação/venda (passo a passo)")}>
                    <div className="space-y-2">
                      <Textarea
                        value={cfg?.como_vender || ""}
                        onChange={(e) => setCfg({ ...cfg, como_vender: e.target.value })}
                        placeholder={"1. Confirme o nome do cliente\n2. Pergunte o que ele procura\n3. Pergunte prazo/urgência\n4. Pergunte orçamento\n5. Ofereça a solução e conduza para agendamento"}
                        rows={9}
                      />
                      <p className="text-[11px] text-muted-foreground">
                        {language === "es" ? "El agente sigue estas etapas en orden, una pregunta a la vez." : "O agente segue essas etapas na ordem, uma pergunta por vez."}
                      </p>
                    </div>
                  </Section>

                  <div className="grid grid-cols-2 gap-6">
                    <Section title={language === "es" ? "Objeciones y respuestas" : "Objeções e respostas"}>
                      <Textarea
                        value={cfg?.objecoes || ""}
                        onChange={(e) => setCfg({ ...cfg, objecoes: e.target.value })}
                        placeholder={'"Tá caro" → mostre o valor e as condições de pagamento\n"Vou pensar" → pergunte qual é a dúvida que ficou'}
                        rows={7}
                      />
                    </Section>
                    <Section title={language === "es" ? "Preguntas frecuentes (FAQ)" : "Perguntas frequentes (FAQ)"}>
                      <Textarea
                        value={cfg?.faq || ""}
                        onChange={(e) => setCfg({ ...cfg, faq: e.target.value })}
                        placeholder={"Vocês atendem em qual região? → ...\nQual a forma de pagamento? → ..."}
                        rows={7}
                      />
                    </Section>
                  </div>

                  {tipo === "posvenda" && (
                    <Section title={language === "es" ? "Mensaje estándar de postventa" : "Mensagem padrão de pós-venda"}>
                      <Textarea
                        value={cfg?.posvenda_msg || ""}
                        onChange={(e) => setCfg({ ...cfg, posvenda_msg: e.target.value })}
                        rows={3}
                        placeholder="Ex: Oi {nome}, tudo certo com o seu pedido? Qualquer coisa é só me chamar por aqui."
                      />
                    </Section>
                  )}

                  {/* Sugerencias de Entrenamiento / Bucle de Aprendizaje (Fase B) */}
                  {suggestions.length > 0 && (
                    <div className="rounded-xl border-2 border-amber-500/40 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent p-5 space-y-4 shadow-sm">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/20 text-amber-600 dark:text-amber-400">
                            <Sparkles className="h-4 w-4 animate-pulse" />
                          </div>
                          <div>
                            <h3 className="font-semibold text-sm text-foreground flex items-center gap-2">
                              💡 Sugerencias de Entrenamiento
                              <Badge className="bg-amber-500 text-white hover:bg-amber-600 font-mono text-[10px]">
                                {suggestions.length} pendiente{suggestions.length > 1 ? "s" : ""}
                              </Badge>
                            </h3>
                            <p className="text-xs text-muted-foreground">
                              La IA detectó dudas, expresiones con doble sentido o falta de reglas en chats reales con clientes.
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs gap-1.5 bg-background border-amber-500/30 text-amber-700 dark:text-amber-300 hover:bg-amber-500/10 shadow-xs"
                            onClick={handleRunBatchTests}
                            disabled={runningBatchTest || loadingSuggestions}
                          >
                            <Zap className={cn("h-3.5 w-3.5", runningBatchTest && "animate-spin text-amber-500")} />
                            {runningBatchTest ? "Probando..." : "⚡ Pruebas Automáticas"}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs text-muted-foreground hover:text-foreground"
                            onClick={() => loadSuggestions(activeAgentId)}
                            disabled={loadingSuggestions}
                          >
                            <RefreshCcw className={cn("h-3.5 w-3.5 mr-1", loadingSuggestions && "animate-spin")} />
                            Actualizar
                          </Button>
                        </div>
                      </div>

                      <div className="space-y-3">
                        {suggestions.map((sug) => {
                          const sim = simulationDiffs[sug.id] || sug.last_simulation;
                          const isSimulating = simulatingId === sug.id;
                          return (
                          <div
                            key={sug.id}
                            className="rounded-lg border border-border/80 bg-background/90 p-4 space-y-3 shadow-xs"
                          >
                            <div className="flex items-center justify-between gap-2 border-b border-border/40 pb-2">
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="font-mono text-[11px] font-medium">
                                  {sug.numero || "Cliente"}
                                </Badge>
                                {sug.intent && (
                                  <Badge variant="secondary" className="text-[10px]">
                                    Intención: {sug.intent}
                                  </Badge>
                                )}
                              </div>
                              <span className="text-[11px] text-muted-foreground font-mono">
                                {new Date(sug.created_at).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}
                              </span>
                            </div>

                            {sug.inbound_text && (
                              <div className="rounded-md bg-muted/50 p-2.5 text-xs text-foreground font-sans border-l-2 border-amber-500">
                                <span className="font-semibold text-muted-foreground mr-1">Mensaje del cliente:</span>
                                &ldquo;{sug.inbound_text}&rdquo;
                              </div>
                            )}

                            <div className="space-y-1 text-xs">
                              <span className="font-semibold text-amber-700 dark:text-amber-400">
                                Duda / Oportunidad de mejora:
                              </span>
                              <p className="text-muted-foreground">{sug.duda}</p>
                            </div>

                            <div className="rounded-md bg-brand/5 border border-brand/20 p-2.5 space-y-1 text-xs">
                              <span className="font-semibold text-brand">
                                Regla sugerida para el Agente:
                              </span>
                              <p className="font-mono text-[11px] text-foreground">{sug.regra_sugerida}</p>
                            </div>

                            {/* Comparativa Before vs After (Regression Test Simulation) */}
                            {sim && (
                              <div className="rounded-lg border border-border/80 bg-muted/30 p-3 space-y-2 text-xs">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-1.5 font-semibold text-foreground">
                                    <Sparkles className="h-3.5 w-3.5 text-brand" />
                                    <span>Simulación con la Regla (Before vs After)</span>
                                  </div>
                                  {sim.doubt_resolved ? (
                                    <Badge className="bg-emerald-600/90 text-white hover:bg-emerald-600 text-[10px] gap-1">
                                      <CheckCircle2 className="h-3 w-3" />
                                      Ambigüedad resuelta
                                    </Badge>
                                  ) : (
                                    <Badge variant="destructive" className="text-[10px]">
                                      Aún requiere ajuste
                                    </Badge>
                                  )}
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-1">
                                  <div className="rounded border border-red-500/20 bg-red-500/5 p-2 space-y-1">
                                    <div className="text-[10px] font-semibold text-red-600 dark:text-red-400 uppercase tracking-wide">
                                      🔴 Respuesta Original (Sin Fix):
                                    </div>
                                    <p className="text-[11px] text-muted-foreground whitespace-pre-wrap">
                                      {sim.previous_reply || sug.previous_reply || "No registrada"}
                                    </p>
                                  </div>

                                  <div className="rounded border border-emerald-500/20 bg-emerald-500/5 p-2 space-y-1">
                                    <div className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide">
                                      🟢 Nueva Respuesta con Fix Aplicado:
                                    </div>
                                    <p className="text-[11px] text-foreground font-medium whitespace-pre-wrap">
                                      {sim.new_reply}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            )}

                            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-border/40">
                              <div className="flex items-center gap-2">
                                <Button
                                  onClick={() => {
                                    setCopilotInitialPrompt(`Analiza esta duda del cliente: "${sug.inbound_text || ""}". Duda: "${sug.duda || ""}". ¿Cómo redactarías una regla óptima para que el agente responda bien y sin romper otras intenciones?`);
                                    setCopilotOpen(true);
                                  }}
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-xs gap-1 border-violet-500/30 text-violet-700 dark:text-violet-300 hover:bg-violet-500/10"
                                >
                                  <Sparkles className="size-3" /> Resolver con Copilot
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs gap-1.5 text-brand hover:bg-brand/10 border-brand/30"
                                  onClick={() => handleSimulateFix(sug)}
                                  disabled={isSimulating}
                                >
                                  <RefreshCcw className={cn("h-3 w-3", isSimulating && "animate-spin")} />
                                  {isSimulating ? "Simulando respuesta..." : "🧪 Simular Fix (Before vs After)"}
                                </Button>
                              </div>

                              <div className="flex items-center gap-2">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 text-xs text-muted-foreground hover:text-foreground"
                                  onClick={() => handleDismissSuggestion(sug.id)}
                                >
                                  Descartar
                                </Button>
                                <Button
                                  size="sm"
                                  className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 shadow-xs"
                                  onClick={() => handleApplySuggestion(sug)}
                                >
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                  + Agregar a Reglas Rígidas
                                </Button>
                              </div>
                            </div>
                          </div>
                        );
                        })}
                      </div>
                    </div>
                  )}

                  <Section title={language === "es" ? "Reglas rígidas (el agente nunca las rompe)" : "Regras rígidas (o agente nunca quebra)"}>
                    <Textarea
                      value={regrasRigidas}
                      onChange={(e) => setRegrasRigidas(e.target.value)}
                      placeholder={language === "es" ? "Ej: 1. Nunca des descuento sin aprobación. 2. Siempre pide el correo y teléfono. 3. Nunca hables mal de la competencia." : "Ex: 1. Nunca dê desconto sem aprovação. 2. Sempre peça o e-mail. 3. Nunca fale de concorrentes."}
                      rows={8}
                    />
                  </Section>

                  <Section title={language === "es" ? "Ejemplos de conversación (entrenamiento few-shot)" : "Exemplos de conversa (treino)"}>
                    <div className="space-y-3">
                      {(Array.isArray(cfg?.exemplos_few_shot) ? cfg.exemplos_few_shot : []).map((ex: any, i: number) => (
                        <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-start">
                          <Textarea
                            rows={2}
                            placeholder={language === "es" ? "El cliente dijo..." : "Cliente disse..."}
                            value={ex?.cliente || ""}
                            onChange={(e) => {
                              const list = [...(cfg.exemplos_few_shot || [])];
                              list[i] = { ...list[i], cliente: e.target.value };
                              setCfg({ ...cfg, exemplos_few_shot: list });
                            }}
                          />
                          <Textarea
                            rows={2}
                            placeholder={language === "es" ? "El agente debe responder..." : "Agente deve responder..."}
                            value={ex?.agente || ""}
                            onChange={(e) => {
                              const list = [...(cfg.exemplos_few_shot || [])];
                              list[i] = { ...list[i], agente: e.target.value };
                              setCfg({ ...cfg, exemplos_few_shot: list });
                            }}
                          />
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              const list = [...(cfg.exemplos_few_shot || [])];
                              list.splice(i, 1);
                              setCfg({ ...cfg, exemplos_few_shot: list });
                            }}
                          >
                            {language === "es" ? "Eliminar" : "Remover"}
                          </Button>
                        </div>
                      ))}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setCfg({
                            ...cfg,
                            exemplos_few_shot: [...(Array.isArray(cfg?.exemplos_few_shot) ? cfg.exemplos_few_shot : []), { cliente: "", agente: "" }],
                          })
                        }
                      >
                        {language === "es" ? "+ Añadir ejemplo" : "Adicionar exemplo"}
                      </Button>
                      <p className="text-[11px] text-muted-foreground">
                        {language === "es" ? "El agente imita el estilo y tono de estos ejemplos. Usa el simulador al lado para probar y la opción 'Corregir' para convertir una respuesta mala en un ejemplo de entrenamiento ideal." : "O agente imita o estilo destes exemplos. Use o Playground ao lado para testar e a opção “Corrigir” para transformar uma resposta ruim em exemplo bom."}
                      </p>
                    </div>
                  </Section>
                </TabsContent>
                <TabsContent value="canais" className="mt-0 space-y-6">
                  <Section title={language === "es" ? "Conectar Canales de Atención" : "Conectar Canais de Atendimento"}>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="p-4 rounded-xl border border-[var(--border)] bg-white space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="size-10 rounded-lg bg-green-50 flex items-center justify-center">
                              <Zap className="size-5 text-green-600" />
                            </div>
                            <div>
                              <h4 className="text-sm font-bold">WhatsApp</h4>
                              <p className="text-[10px] text-muted-foreground">{language === "es" ? "D-API QR Code & API Oficial Meta" : "D-API QR Code & API Oficial Meta"}</p>
                            </div>
                          </div>
                          <Switch checked={channelStatus.whatsapp} onCheckedChange={(val) => setChannelStatus(prev => ({ ...prev, whatsapp: val }))} />
                        </div>
                        <Button variant="outline" size="sm" className="w-full text-xs" asChild><Link to="/app/conexao">{language === "es" ? "Gestionar conexiones" : "Gerenciar conexões"}</Link></Button>
                      </div>
                      <div className="p-4 rounded-xl border border-[var(--border)] bg-white space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="size-10 rounded-lg bg-blue-50 flex items-center justify-center">
                              <Share2 className="size-5 text-blue-600" />
                            </div>
                            <div>
                              <h4 className="text-sm font-bold">Instagram Direct</h4>
                              <p className="text-[10px] text-muted-foreground">{language === "es" ? "Mensajes directos oficiales" : "Mensagens diretas oficiais"}</p>
                            </div>
                          </div>
                          <Switch checked={channelStatus.instagram} onCheckedChange={(val) => setChannelStatus(prev => ({ ...prev, instagram: val }))} />
                        </div>
                        <Button variant="outline" size="sm" className="w-full text-xs" asChild><Link to="/app/conexao" search={{ tab: "instagram" }}>{language === "es" ? "Configurar canal" : "Configurar canal"}</Link></Button>
                      </div>
                      <div className="p-4 rounded-xl border border-[var(--border)] bg-white space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="size-10 rounded-lg bg-sky-50 flex items-center justify-center">
                              <Send className="size-5 text-sky-600" />
                            </div>
                            <div>
                              <h4 className="text-sm font-bold">Telegram</h4>
                              <p className="text-[10px] text-muted-foreground">{language === "es" ? "Bot API y chats directos" : "Bot API e chats diretos"}</p>
                            </div>
                          </div>
                          <Switch checked={channelStatus.telegram} onCheckedChange={(val) => setChannelStatus(prev => ({ ...prev, telegram: val }))} />
                        </div>
                        <Button variant="outline" size="sm" className="w-full text-xs" asChild><Link to="/app/conexao" search={{ tab: "telegram" }}>{language === "es" ? "Configurar bot" : "Configurar bot"}</Link></Button>
                      </div>
                    </div>
                  </Section>
                </TabsContent>

                <TabsContent value="avancado" className="mt-0 space-y-6">
                  {/* 1. Provedor e Modelo da IA */}
                  <Section title={language === "es" ? "Cerebro de la IA (Proveedor, Modelo y Razonamiento)" : "Cérebro da IA (Provedor, Modelo e Raciocínio)"} icon={<Cpu className="size-4 text-purple-600" />}>
                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label>{language === "es" ? "Proveedor de Inteligencia" : "Provedor de Inteligência"}</Label>
                        <Select value={aiProvider} onValueChange={(val) => {
                          setAiProvider(val);
                          if (val === "drael") setAiModel("drael-v1");
                          else if (val === "openai") setAiModel("gpt-4o-mini");
                          else if (val === "anthropic") setAiModel("claude-3-5-sonnet-latest");
                          else setAiModel("gemini-3.5-flash-lite");
                        }}>
                          <SelectTrigger className="bg-white">
                            <SelectValue placeholder={language === "es" ? "Selecciona el proveedor" : "Selecione o provedor"} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="gemini">Google Gemini (Directo — Recomendado)</SelectItem>
                            <SelectItem value="drael">Drael AI (drael.sh / drael-v1 — Base Recomendada)</SelectItem>
                            <SelectItem value="openai">OpenAI (ChatGPT / GPT-4o mini)</SelectItem>
                            <SelectItem value="anthropic">Anthropic (Claude 3.5)</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-[11px] text-muted-foreground">{language === "es" ? "Proveedor centralizado con alta velocidad de inferencia y redundancia activa." : "Provedor centralizado com alta velocidade de inferência e redundância ativa."}</p>
                      </div>

                      <div className="space-y-1.5">
                        <Label>{language === "es" ? "Modelo de Lenguaje (LLM)" : "Modelo de Linguagem (LLM)"}</Label>
                        <Select value={aiModel} onValueChange={setAiModel}>
                          <SelectTrigger className="bg-white">
                            <SelectValue placeholder={language === "es" ? "Selecciona el modelo" : "Selecione o modelo"} />
                          </SelectTrigger>
                          <SelectContent>
                            {aiProvider === "gemini" && (
                              <>
                                <SelectItem value="gemini-3.5-flash-lite">Gemini 3.5 Flash-Lite (Recomendado — Ultrarrápido y Actual)</SelectItem>
                                <SelectItem value="gemini-3.8-flash">Gemini 3.8 Flash (Nueva Generación — Alta Capacidad)</SelectItem>
                                <SelectItem value="gemini-3.5-flash">Gemini 3.5 Flash (Equilibrado y Potente)</SelectItem>
                                <SelectItem value="gemini-flash-latest">Gemini Flash Latest (Siempre Última Versión Estable)</SelectItem>
                                <SelectItem value="gemini-flash-lite-latest">Gemini Flash Lite Latest (Siempre Última Versión Ligera)</SelectItem>
                                <SelectItem value="gemini-2.5-flash">Gemini 2.5 Flash</SelectItem>
                                <SelectItem value="gemini-2.5-flash-lite">Gemini 2.5 Flash-Lite</SelectItem>
                              </>
                            )}
                            {aiProvider === "drael" && (
                              <>
                                <SelectItem value="drael-v1">Drael v1 (Recomendado / Base)</SelectItem>
                                <SelectItem value="drael-fast">Drael Fast</SelectItem>
                              </>
                            )}
                            {aiProvider === "openai" && (
                              <>
                                <SelectItem value="gpt-4o-mini">GPT-4o mini (Rápido y Económico)</SelectItem>
                                <SelectItem value="gpt-4o">GPT-4o (Alta Capacidad)</SelectItem>
                                <SelectItem value="gpt-4.1-mini">GPT-4.1 mini</SelectItem>
                              </>
                            )}
                            {aiProvider === "anthropic" && (
                              <>
                                <SelectItem value="claude-3-5-sonnet-latest">Claude 3.5 Sonnet (Excelente escritura humana)</SelectItem>
                                <SelectItem value="claude-3-5-haiku-latest">Claude 3.5 Haiku (Rápido e conciso)</SelectItem>
                              </>
                            )}
                          </SelectContent>
                        </Select>
                        <p className="text-[11px] text-muted-foreground">{language === "es" ? "El modelo seleccionado se utiliza tanto en la atención en vivo como en el simulador." : "O modelo selecionado é usado tanto no atendimento ao vivo quanto no simulador."}</p>
                      </div>
                    </div>

                    <div className="pt-2 space-y-2 border-t">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs">{language === "es" ? "Nivel de Creatividad / Temperatura" : "Nível de Criatividade / Temperatura"}: {temperatura}</Label>
                        <Badge variant="outline" className="text-[10px]">
                          {temperatura <= 0.3 ? (language === "es" ? "Conservador / Factual" : "Conservador / Factual") : temperatura <= 0.6 ? (language === "es" ? "Equilibrado (Ventas)" : "Equilibrado (Vendas)") : (language === "es" ? "Creativo / Extrovertido" : "Criativo / Extrovertido")}
                        </Badge>
                      </div>
                      <Slider
                        value={[temperatura * 100]}
                        min={0}
                        max={100}
                        step={5}
                        onValueChange={(val) => setTemperatura(val[0] / 100)}
                        className="w-full"
                      />
                      <div className="flex justify-between text-[10px] text-muted-foreground">
                        <span>{language === "es" ? "0.0 Factual (Seguir reglas al pie de la letra)" : "0.0 Factual (Seguir regras ao pé da letra)"}</span>
                        <span>{language === "es" ? "0.5 Estándar" : "0.5 Padrão"}</span>
                        <span>{language === "es" ? "1.0 Creativo (Más expansivo)" : "1.0 Criativo (Mais expansivo)"}</span>
                      </div>
                    </div>
                  </Section>

                  {/* 2. Agendamento Automático */}
                  <Section title={language === "es" ? "Agendamiento Inteligente (Google Calendar y Reuniones)" : "Agendamento Inteligente (Google Calendar & Reuniões)"} icon={<Calendar className="size-4 text-blue-600" />}>
                    <div className="flex items-center justify-between pb-3 border-b">
                      <div>
                        <h4 className="text-sm font-semibold">{language === "es" ? "Activar Agendamiento Automático por IA" : "Ativar Agendamento Automático pela IA"}</h4>
                        <p className="text-xs text-muted-foreground">{language === "es" ? "La IA detecta solicitudes de reunión, consulta horarios y agenda directamente en tu calendario." : "A IA detecta pedidos de reunião, consulta horários e agenda direto na sua agenda."}</p>
                      </div>
                      <Switch checked={agendamentoAtivo} onCheckedChange={setAgendamentoAtivo} />
                    </div>

                    {agendamentoAtivo && (
                      <div className="space-y-4 pt-2">
                        <div className="grid md:grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <Label className="text-xs">{language === "es" ? "Servicios o tipos de reunión agendables" : "Serviços ou tipos de reunião agendáveis"}</Label>
                            <Input
                              value={servicosAgendaveis}
                              onChange={(e) => setServicosAgendaveis(e.target.value)}
                              placeholder="Ex: Demonstração do CRM, Consultoria de Vendas"
                              className="bg-white text-xs"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs">{language === "es" ? "Duración estándar de la reunión" : "Duração padrão da reunião"}</Label>
                            <Select value={duracaoPadrao} onValueChange={setDuracaoPadrao}>
                              <SelectTrigger className="bg-white text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="15 min">15 {language === "es" ? "minutos" : "minutos"}</SelectItem>
                                <SelectItem value="30 min">30 {language === "es" ? "minutos (Recomendado)" : "minutos (Recomendado)"}</SelectItem>
                                <SelectItem value="45 min">45 {language === "es" ? "minutos" : "minutos"}</SelectItem>
                                <SelectItem value="1 hora">1 {language === "es" ? "hora" : "hora"}</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        <div className="grid md:grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <Label className="text-xs">{language === "es" ? "Horarios disponibles para ofrecer por la IA" : "Horários disponíveis para a IA oferecer"}</Label>
                            <Input
                              value={horariosDisponiveis}
                              onChange={(e) => setHorariosDisponiveis(e.target.value)}
                              placeholder="Ex: Seg a Sex das 09h às 18h"
                              className="bg-white text-xs"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs">{language === "es" ? "Anticipación mínima para agendar" : "Antecedência mínima para agendar"}</Label>
                            <Input
                              value={antecedenciaMin}
                              onChange={(e) => setAntecedenciaMin(e.target.value)}
                              placeholder="Ex: 2 horas, 1 dia"
                              className="bg-white text-xs"
                            />
                          </div>
                        </div>

                        <div className="p-3 rounded-xl border border-[var(--border)] bg-[var(--panel-2)]/30 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="size-8 rounded-lg bg-blue-50 flex items-center justify-center">
                              <Calendar className="size-4 text-blue-600" />
                            </div>
                            <div>
                              <p className="text-xs font-semibold">Google Calendar</p>
                              <p className="text-[11px] text-muted-foreground">
                                {googleIntegration?.conectado 
                                  ? `Conectado como ${googleIntegration.email || 'Google Conta'}`
                                  : "Conecte sua agenda para sincronização bidirecional em tempo real."}
                              </p>
                            </div>
                          </div>
                          {googleIntegration?.conectado ? (
                            <Button variant="outline" size="sm" className="h-7 text-xs text-red-600 hover:bg-red-50" onClick={handleDisconnectGoogle} disabled={connectingGoogle}>
                              Desconectar
                            </Button>
                          ) : (
                            <Button size="sm" className="h-7 text-xs bg-blue-600 hover:bg-blue-700 text-white" onClick={handleConnectGoogle} disabled={connectingGoogle}>
                              {connectingGoogle ? <Loader2 className="size-3 animate-spin mr-1" /> : null} Conectar Google Agenda
                            </Button>
                          )}
                        </div>
                      </div>
                    )}
                  </Section>

                  {/* 3. Menu Automático por Setores */}
                  <Section title={language === "es" ? "Menú Automático por Sectores / Departamentos" : "Menu Automático por Setores / Departamentos"} icon={<Sliders className="size-4 text-emerald-600" />}>
                    <div className="flex items-center justify-between pb-3 border-b">
                      <div>
                        <h4 className="text-sm font-semibold">{language === "es" ? "Menú Interactivo de Auto-atención" : "Menu Interativo de Auto-atendimento"}</h4>
                        <p className="text-xs text-muted-foreground">{language === "es" ? "Presenta opciones numeradas (1, 2, 3...) para dirigir al cliente al sector correspondiente." : "Apresenta opções numeradas (1, 2, 3...) para direcionar o cliente ao setor correto."}</p>
                      </div>
                      <Switch checked={menuSetoresAtivo} onCheckedChange={setMenuSetoresAtivo} />
                    </div>

                    {menuSetoresAtivo && (
                      <div className="space-y-4 pt-2">
                        <div className="space-y-1.5">
                          <Label className="text-xs">{language === "es" ? "Mensaje inicial del menú" : "Mensagem inicial do menu"}</Label>
                          <Textarea
                            value={menuSetoresTexto}
                            onChange={(e) => setMenuSetoresTexto(e.target.value)}
                            placeholder={language === "es" ? "¡Hola! Bienvenido a nuestra empresa. Para agilizar tu atención, responde con el número de la opción deseada:" : "Olá! Seja bem-vindo à nossa empresa. Para agilizar o seu atendimento, digite o número da opção desejada:"}
                            rows={3}
                            className="bg-white text-xs"
                          />
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Label className="text-xs font-semibold">{language === "es" ? "Opciones numéricas de enrutamiento" : "Opções numéricas de encaminhamento"}</Label>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs gap-1"
                              onClick={() => {
                                const nextNum = String(menuSetoresOpcoes.length + 1);
                                const availableDep = departments.find(d => !menuSetoresOpcoes.some(o => o.department_id === d.id)) || departments[0];
                                if (!availableDep) return toast.error(language === "es" ? "Crea departamentos en Configuración > Departamentos para vincular." : "Cadastre departamentos em Configurações > Departamentos para vincular.");
                                setMenuSetoresOpcoes([...menuSetoresOpcoes, { numero: nextNum, department_id: availableDep.id, label: availableDep.nome }]);
                              }}
                            >
                              <Plus className="size-3" /> {language === "es" ? "Añadir opción" : "Adicionar opção"}
                            </Button>
                          </div>

                          {menuSetoresOpcoes.length === 0 ? (
                            <div className="p-4 rounded-xl border border-dashed text-center text-xs text-muted-foreground">
                              {language === "es" ? "Ninguna opción configurada. Haz clic en 'Añadir opción' para crear opciones como 1 - Ventas, 2 - Soporte." : "Nenhuma opção cadastrada. Clique em \"Adicionar opção\" para criar opções como 1 - Vendas, 2 - Suporte."}
                            </div>
                          ) : (
                            <div className="space-y-2">
                              {menuSetoresOpcoes.map((opt, idx) => (
                                <div key={idx} className="flex items-center gap-2 p-2 rounded-lg border bg-white">
                                  <div className="size-7 rounded bg-[var(--brand)] text-white flex items-center justify-center font-bold text-xs shrink-0">
                                    {opt.numero}
                                  </div>
                                  <Input
                                    value={opt.label}
                                    onChange={(e) => {
                                      const updated = [...menuSetoresOpcoes];
                                      updated[idx] = { ...updated[idx], label: e.target.value };
                                      setMenuSetoresOpcoes(updated);
                                    }}
                                    placeholder={language === "es" ? "Etiqueta (ej: Hablar con Ventas)" : "Rótulo (ex: Falar com Vendas)"}
                                    className="h-8 text-xs flex-1"
                                  />
                                  <Select
                                    value={opt.department_id}
                                    onValueChange={(val) => {
                                      const updated = [...menuSetoresOpcoes];
                                      const dep = departments.find(d => d.id === val);
                                      updated[idx] = { ...updated[idx], department_id: val, label: updated[idx].label || dep?.nome || "Setor" };
                                      setMenuSetoresOpcoes(updated);
                                    }}
                                  >
                                    <SelectTrigger className="h-8 text-xs w-48 bg-white"><SelectValue placeholder={language === "es" ? "Sector destino" : "Setor destino"} /></SelectTrigger>
                                    <SelectContent>
                                      {departments.map(d => (
                                        <SelectItem key={d.id} value={d.id}>{d.nome}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="size-8 text-muted-foreground hover:text-red-600"
                                    onClick={() => {
                                      setMenuSetoresOpcoes(menuSetoresOpcoes.filter((_, i) => i !== idx));
                                    }}
                                  >
                                    <Trash2 className="size-3.5" />
                                  </Button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </Section>

                  {/* 4. Segurança e Transbordo */}
                  <Section title={language === "es" ? "Seguridad Operativa y Comandos de Pausa" : "Segurança Operacional e Comandos de Pausa"} icon={<ShieldAlert className="size-4 text-orange-600" />}>
                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label className="text-xs">{language === "es" ? "Comando para pausar la IA en la conversación" : "Comando para pausar a IA na conversa"}</Label>
                        <Input
                          value={palavraPausar}
                          onChange={(e) => setPalavraPausar(e.target.value)}
                          placeholder="/pausar"
                          className="bg-white text-xs font-mono"
                        />
                        <p className="text-[11px] text-muted-foreground">{language === "es" ? "El asesor puede escribir este comando en el chat para silenciar al bot." : "O atendente pode digitar esse comando no chat para calar o robô."}</p>
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-xs">{language === "es" ? "Comando para reactivar la IA" : "Comando para despausar a IA"}</Label>
                        <Input
                          value={palavraDespausar}
                          onChange={(e) => setPalavraDespausar(e.target.value)}
                          placeholder="/despausar"
                          className="bg-white text-xs font-mono"
                        />
                        <p className="text-[11px] text-muted-foreground">{language === "es" ? "Restaura las respuestas automáticas de la IA inmediatamente." : "Restaura as respostas automáticas da IA imediatamente."}</p>
                      </div>
                    </div>

                    <div className="grid md:grid-cols-2 gap-4 pt-2 border-t">
                      <div className="space-y-1.5">
                        <Label className="text-xs">{language === "es" ? "Teléfono para transferencia humana" : "Telefone para transbordo humano"}</Label>
                        <Input
                          value={telefone}
                          onChange={(e) => setTelefone(e.target.value)}
                          placeholder="Ex: +58 412 1234567 ou 5511999999999"
                          className="bg-white text-xs"
                        />
                        <p className="text-[11px] text-muted-foreground">{language === "es" ? "Cuando la IA no sepa responder o el cliente pida un asesor, transfiere a este número." : "Quando a IA não souber responder ou o cliente pedir atendente, encaminha para este número."}</p>
                      </div>

                      <div className="flex items-center justify-between p-3 rounded-xl border bg-white">
                        <div>
                          <Label className="text-xs font-semibold">{language === "es" ? "Dividir mensajes en partes" : "Dividir mensagens em partes"}</Label>
                          <p className="text-[11px] text-muted-foreground">{language === "es" ? "Envía párrafos separados con pequeñas pausas naturales (estilo humano)." : "Envia parágrafos separados com pequenas pausas naturais."}</p>
                        </div>
                        <Switch checked={responderEmPartes} onCheckedChange={setResponderEmPartes} />
                      </div>
                    </div>
                  </Section>
                </TabsContent>

                <TabsContent value="analises" className="mt-0 space-y-6">
                  <Section title={language === "es" ? "Rendimiento de la IA" : "Desempenho da IA"}>
                    <div className="h-[300px] flex items-center justify-center border-2 border-dashed border-[var(--border)] rounded-xl bg-[var(--panel)]/30">
                      <div className="text-center space-y-2">
                        <BarChart3 className="size-8 text-muted-foreground/30 mx-auto" />
                        <p className="text-xs text-muted-foreground">{language === "es" ? "Los datos de análisis y métricas se mostrarán después de las primeras interacciones con clientes." : "Dados de análise serão exibidos após as primeiras interações."}</p>
                      </div>
                    </div>
                  </Section>
                </TabsContent>
              </div>

              <div className="space-y-8">
                <Section title={t("ai.test_agent", undefined, "Probar agente")} icon={<Bot className="size-3.5" />}>


                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="size-2 rounded-full bg-green-500" />
                      <span className="text-[10px] text-muted-foreground font-medium">{cfg?.nome_agente || t("ai.agent", undefined, "Agente")} {t("ai.is_active", undefined, "está activo")}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="sm" onClick={() => setChat([])} className="h-7 text-[10px] gap-1">
                        <RefreshCcw className="size-3" /> {t("ai.new_test", undefined, "Nueva prueba")}
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1 cursor-pointer">
                            <UserCircle2 className="size-3" />
                            <span>{t("ai.simulate_lead", undefined, "Simular lead")}</span>
                            <ChevronDown className="size-2.5 opacity-60" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-64 text-xs">
                          <DropdownMenuItem className="cursor-pointer" onClick={() => void runTest("Hola, vi su anuncio y me gustaría recibir más información.")}>
                            💬 Lead Frío (Primer contacto)
                          </DropdownMenuItem>
                          <DropdownMenuItem className="cursor-pointer" onClick={() => void runTest("¡Hola! ¿Qué productos o servicios tienen y cuáles son los precios?")}>
                            🏷️ Consulta de Precio / Catálogo
                          </DropdownMenuItem>
                          <DropdownMenuItem className="cursor-pointer" onClick={() => void runTest("¿Hacen envíos o atienden en mi zona? ¿Cuál es el plazo y costo?")}>
                            🚚 Consulta de Entrega / Zona
                          </DropdownMenuItem>
                          <DropdownMenuItem className="cursor-pointer" onClick={() => void runTest("Me gustaría agendar una cita para esta semana, ¿tienen disponibilidad?")}>
                            📅 Agendamiento de Horario
                          </DropdownMenuItem>
                          <DropdownMenuItem className="cursor-pointer" onClick={() => void runTest("Me parece un poco costoso comparado con otros. ¿Tienen algún descuento?")}>
                            🤝 Negociación / Objeción
                          </DropdownMenuItem>
                          <DropdownMenuItem className="cursor-pointer" onClick={() => void runTest("Hola, hice una compra y tengo una duda sobre mi pedido.")}>
                            🛡️ Post-venta / Soporte
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>

                  <div ref={scrollRef} className="rounded-xl border border-[var(--border)] bg-[var(--panel-2)]/50 p-4 space-y-4 h-[440px] overflow-y-auto mb-3">
                    {chat.length === 0 && !testing && (
                      <div className="h-full flex flex-col items-center justify-center text-center gap-2 p-6">
                        <Bot className="size-8 text-muted-foreground/30" />
                        <p className="text-xs text-muted-foreground">{t("ai.start_conversation_to_test", undefined, "Inicia una conversación para probar el comportamiento del agente.")}</p>
                      </div>
                    )}
                    {chat.map((m, i) =>
                      m.role === "user" ? (
                        <div key={i} className="flex justify-end">
                          <div className="max-w-[85%] bg-[var(--brand)] text-white rounded-2xl rounded-tr-sm px-4 py-2.5 text-xs shadow-sm">{m.content}</div>
                        </div>
                      ) : (
                        <div key={i} className="flex justify-start gap-2 items-start group">
                          <AgentAvatar 
                            traits={cfg?.avatar_traits} 
                            avatarUrl={cfg?.avatar_url}
                            fallbackName={cfg?.nome_agente || "IA"}
                            size={28} 
                            className="shrink-0 border border-[var(--border)]" 
                          />
                          <div className="max-w-[85%] flex flex-col gap-2">

                            {(m.parts && m.parts.length ? m.parts : [m.content]).map((p, j) => (
                              <div key={j} className="bg-white border border-[var(--border)] text-foreground rounded-2xl rounded-tl-sm px-4 py-2.5 text-xs shadow-sm">
                                {p}
                              </div>
                            ))}
                            
                            {(m.fonte || m.regra) && (
                              <div className="flex flex-wrap gap-2 mt-1">
                                {m.fonte && (
                                  <Badge variant="secondary" className="bg-blue-50 text-[9px] text-blue-600 border-none font-normal gap-1">
                                    <FileText className="size-2.5" /> Fonte: <span className="font-bold">{m.fonte}</span>
                                  </Badge>
                                )}
                                {m.regra && (
                                  <Badge variant="secondary" className="bg-purple-50 text-[9px] text-purple-600 border-none font-normal gap-1">
                                    <Zap className="size-2.5" /> Regra: <span className="font-bold">{m.regra}</span>
                                  </Badge>
                                )}
                              </div>
                            )}

                            <button
                              onClick={() => openCorrect(i)}
                              className="self-start inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-[var(--brand-text)] opacity-0 group-hover:opacity-100 transition mt-1"
                            >
                              <Pencil className="size-2.5" /> Corrigir resposta
                            </button>
                          </div>
                        </div>
                      ),
                    )}
                    {testing && (
                      <div className="flex justify-start gap-2 items-start">
                        <AgentAvatar 
                          traits={cfg?.avatar_traits} 
                          avatarUrl={cfg?.avatar_url}
                          fallbackName={cfg?.nome_agente || "IA"}
                          size={28} 
                          className="shrink-0 border border-[var(--border)]" 
                        />

                        <div className="bg-white border border-[var(--border)] rounded-2xl rounded-tl-sm px-4 py-2.5 text-xs shadow-sm italic text-muted-foreground flex items-center gap-2">
                          <Loader2 className="size-3 animate-spin" /> {t("ai.typing", undefined, "Escribiendo...")}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="relative">
                    <Input
                      value={testInput}
                      onChange={(e) => setTestInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void runTest(); } }}
                      placeholder={t("ai.type_as_client", undefined, "Escribe como un cliente...")}
                      disabled={testing}
                      className="pr-10 bg-white"
                    />
                    <Button 
                      onClick={() => runTest()} 
                      disabled={testing || !testInput.trim()} 
                      size="icon" 
                      className="absolute right-1 top-1 size-8 rounded-lg bg-[var(--brand)] hover:bg-[var(--brand)]/90"
                    >
                      {testing ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
                    </Button>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mt-4">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={async () => {
                        const lastAssistantIdx = chat.map(m => m.role).lastIndexOf("assistant");
                        if (lastAssistantIdx === -1) {
                          toast.error(language === "es" ? "Ninguna respuesta de la IA para marcar como correcta." : "Nenhuma resposta da IA para marcar como correta.");
                          return;
                        }
                        const userMsg = chat.slice(0, lastAssistantIdx).reverse().find(m => m.role === "user");
                        const clientText = userMsg ? userMsg.content : "Pergunta de teste";
                        const agentText = chat[lastAssistantIdx].content;
                        const nextExamples = [...(Array.isArray(cfg?.exemplos_few_shot) ? cfg.exemplos_few_shot : []), { cliente: clientText, agente: agentText }];
                        setCfg((prev: any) => ({ ...prev, exemplos_few_shot: nextExamples }));
                        try {
                          await saveExample({ data: { tipo, cliente: clientText, agente: agentText, agentId: activeAgentId || undefined } });
                          toast.success(language === "es" ? "¡Respuesta guardada como ejemplo de entrenamiento de la IA!" : "Resposta salva como exemplo de treinamento da IA!");
                        } catch (err: any) {
                          toast.success(language === "es" ? "¡Respuesta marcada como correcta en los ejemplos!" : "Resposta marcada como correta nos exemplos!");
                        }
                      }}
                      className="text-[10px] h-8 gap-1.5 border-green-200 text-green-700 hover:bg-green-50 hover:text-green-800 cursor-pointer"
                    >
                      <CheckCircle2 className="size-3.5" /> {t("ai.correct_response", undefined, "Respuesta correcta")}
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => {
                        const lastAssistantIdx = chat.map(m => m.role).lastIndexOf("assistant");
                        if (lastAssistantIdx === -1) {
                          toast.error(language === "es" ? "Ninguna respuesta de la IA para corregir aún." : "Nenhuma resposta da IA para corrigir ainda.");
                          return;
                        }
                        openCorrect(lastAssistantIdx);
                      }}
                      className="text-[10px] h-8 gap-1.5 border-orange-200 text-orange-700 hover:bg-orange-50 hover:text-orange-800 cursor-pointer"
                    >
                      <Sparkles className="size-3.5" /> {t("ai.needs_improvement", undefined, "Necesita mejorar")}
                    </Button>
                  </div>
                </Section>
              </div>
            </div>
          </Tabs>
        </div>
      </div>

      {/* Dialog de Pré-visualização do System Prompt */}
      <Dialog open={previewDialogOpen} onOpenChange={setPreviewDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="size-5 text-[var(--brand)]" /> {t("ai.preview_system_prompt", undefined, "Vista previa del System Prompt")}
            </DialogTitle>
            <DialogDescription>
              {t("ai.preview_system_prompt_desc", undefined, "Prompt completo compilado con las directrices de la empresa, productos, reglas estrictas y variables activas.")}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-auto bg-slate-900 text-slate-100 p-4 rounded-xl font-mono text-xs whitespace-pre-wrap select-all">
            {promptPreview || t("ai.loading_agent_guidelines", undefined, "Cargando directrices del agente...")}
          </div>
          <DialogFooter className="flex justify-between items-center sm:justify-between pt-2">
            <span className="text-xs text-muted-foreground font-mono">
              ~{Math.round((promptPreview?.length || 0) / 4)} {t("ai.estimated_tokens", undefined, "tokens estimados")}
            </span>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => {
                  navigator.clipboard.writeText(promptPreview);
                  toast.success(t("ai.prompt_copied", undefined, "¡Prompt copiado al portapapeles!"));
                }}
              >
                {t("ai.copy_prompt", undefined, "Copiar Prompt")}
              </Button>
              <Button size="sm" onClick={() => setPreviewDialogOpen(false)}>{t("common.close", undefined, "Cerrar")}</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de Histórico de Execuções e Auditoria */}
      <Dialog open={historyDialogOpen} onOpenChange={setHistoryDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="size-5 text-[var(--brand)]" /> {t("ai.audit_history_title", undefined, "Historial de Acciones de la IA")}
            </DialogTitle>
            <DialogDescription>
              {t("ai.audit_history_desc", undefined, "Últimas ejecuciones, disparos de reglas y cambios de entrenamiento auditados.")}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-auto divide-y">
            {loadingAuditLogs ? (
              <div className="py-12 text-center text-muted-foreground">{t("common.loading", undefined, "Cargando auditoría...")}</div>
            ) : auditLogs.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">{t("ai.no_audit_actions", undefined, "Ninguna acción registrada en el historial reciente.")}</div>
            ) : (
              auditLogs.map((log) => (
                <div key={log.id} className="py-3 flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-700">{log.acao}</p>
                    <p className="text-xs text-muted-foreground">{log.detalhes?.descricao || log.detalhes?.message || JSON.stringify(log.detalhes || {})}</p>
                  </div>
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                    {new Date(log.created_at).toLocaleString(language === "es" ? "es-ES" : language === "en" ? "en-US" : "pt-BR")}
                  </span>
                </div>
              ))
            )}
          </div>
          <DialogFooter className="pt-2">
            <Button size="sm" onClick={() => setHistoryDialogOpen(false)}>{t("common.close", undefined, "Cerrar")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={teachOpen} onOpenChange={setTeachOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{t("ai.teach_new_thing", undefined, "Enseñar algo nuevo a la IA")}</DialogTitle>
            <DialogDescription>
              {t("ai.teach_new_thing_desc", undefined, "Añade información específica que el agente deba conocer. Esto se adjuntará a la base de conocimiento.")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{language === "es" ? "¿Qué quieres enseñar a la IA?" : "O que você quer ensinar?"}</Label>
              <Textarea 
                value={teachText} 
                onChange={(e) => setTeachText(e.target.value)}
                placeholder={language === "es" ? "Ej: A partir de hoy aceptamos pagos por Zelle, Binance Pay y transferencias en moneda local con 5% de descuento." : "Ex: A partir de hoje aceitamos Pix com 5% de desconto."}
                rows={6}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTeachOpen(false)}>{language === "es" ? "Cancelar" : "Cancelar"}</Button>
            <Button onClick={saveTeach} disabled={teachSaving}>
              {teachSaving ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Plus className="size-4 mr-2" />}
              {language === "es" ? "Guardar Conocimiento" : "Salvar Conhecimento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={correctOpen} onOpenChange={setCorrectOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{language === "es" ? "Corregir respuesta del agente" : "Corrigir resposta do agente"}</DialogTitle>
            <DialogDescription>
              {language === "es" ? "Escribe cómo debería haber respondido el agente para que aprenda con este ejemplo." : "Escreva como o agente deveria ter respondido para que ele aprenda com este exemplo."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{language === "es" ? "Respuesta ideal" : "Resposta ideal"}</Label>
              <Textarea 
                value={correctIdeal} 
                onChange={(e) => setCorrectIdeal(e.target.value)}
                placeholder={language === "es" ? "Escribe la respuesta ideal..." : "Digite a resposta perfeita..."}
                rows={6}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCorrectOpen(false)}>{language === "es" ? "Cancelar" : "Cancelar"}</Button>
            <Button onClick={submitCorrection} disabled={correctSaving}>
              {correctSaving ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Save className="size-4 mr-2" />}
              {language === "es" ? "Guardar Corrección" : "Salvar Correção"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingId} onOpenChange={(open) => !open && setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{language === "es" ? "¿Eliminar agente?" : "Excluir agente?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {language === "es" ? "Esta acción no se puede deshacer. El agente y todo su entrenamiento serán eliminados." : "Esta ação não pode ser desfeita. O agente e todo o seu treinamento serão removidos."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{language === "es" ? "Cancelar" : "Cancelar"}</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => deletingId && handleDeleteAgent(deletingId)}
              className="bg-red-600 hover:bg-red-700"
            >
              {language === "es" ? "Eliminar" : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={newAgentOpen} onOpenChange={setNewAgentOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{language === "es" ? "Configurar nuevo agente" : "Configurar novo agente"}</DialogTitle>
            <DialogDescription>
              {language === "es" ? "Sigue los pasos a continuación para crear un agente personalizado para tu negocio." : "Siga os passos abaixo para criar um agente personalizado para seu negócio."}
            </DialogDescription>
          </DialogHeader>
          
          <Tabs defaultValue="base" className="w-full mt-4">
            <TabsList className="grid grid-cols-3 w-full">
              <TabsTrigger value="base">{language === "es" ? "Identidad" : "Identidade"}</TabsTrigger>
              <TabsTrigger value="objetivo">{language === "es" ? "Objetivo" : "Objetivo"}</TabsTrigger>
              <TabsTrigger value="avatar">{language === "es" ? "Avatar" : "Avatar"}</TabsTrigger>
            </TabsList>
            
            <TabsContent value="base" className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>{language === "es" ? "Nombre del Agente" : "Nome do Agente"}</Label>
                <Input 
                  value={newAgentName} 
                  onChange={(e) => setNewAgentName(e.target.value)}
                  placeholder={language === "es" ? "Ej: Lia, Max, Sofía..." : "Ex: Lia, Max, Bia..."}
                />
              </div>
              <div className="space-y-2">
                <Label>{language === "es" ? "Tipo de Agente" : "Tipo de Agente"}</Label>
                <Select value={newAgentTipo} onValueChange={(v) => setNewAgentTipo(v as AgentTipo)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="qualificacao">{language === "es" ? "Calificación / Ventas" : "Qualificação / Vendas"}</SelectItem>
                    <SelectItem value="followup">{language === "es" ? "Follow-up / Reenganche" : "Follow-up / Reengajamento"}</SelectItem>
                    <SelectItem value="posvenda">{language === "es" ? "Postventa / Soporte" : "Pós-venda / Suporte"}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </TabsContent>

            <TabsContent value="objetivo" className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>{language === "es" ? "Descripción del Negocio" : "Descrição do Negócio"}</Label>
                <Textarea 
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  placeholder={language === "es" ? "Cuéntanos un poco sobre lo que hace tu empresa y lo que este agente debe hacer..." : "Conte um pouco sobre o que sua empresa faz e o que este agente deve fazer..."}
                  rows={6}
                />
              </div>
            </TabsContent>

            <TabsContent value="avatar" className="space-y-4 py-4">
              <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-xl bg-slate-50">
                <Bot className="size-12 text-slate-300 mb-4" />
                <p className="text-sm text-slate-500 text-center">
                  {language === "es" ? "Después de crear el agente, podrás usar el generador de avatares para darle una identidad visual única." : "Após criar o agente, você poderá usar o Gerador de Avatares Pixar para dar uma identidade visual única a ele."}
                </p>
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter className="mt-6">
            <Button variant="outline" onClick={() => setNewAgentOpen(false)}>{language === "es" ? "Cancelar" : "Cancelar"}</Button>
            <Button onClick={createNewAgent} disabled={saving || !newAgentName.trim()}>
              {saving ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Plus className="size-4 mr-2" />}
              {language === "es" ? "Crear Agente" : "Criar Agente"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AvatarBuilder 
        open={avatarBuilderOpen}
        onOpenChange={setAvatarBuilderOpen}
        agentId={activeAgentId || ""}
        agentName={cfg?.nome_agente || "IA"}
        currentTraits={cfg?.avatar_traits}
        currentAvatarUrl={cfg?.avatar_url}
        onSuccess={(url, traits) => {
          setCfg((prev: any) => ({ ...prev, avatar_url: url, avatar_traits: traits }));
          setAgents(prev => prev.map(a => a.id === activeAgentId ? { ...a, avatar_url: url, avatar_traits: traits } : a));
        }}
      />
      <AgentCopilotSheet
        open={copilotOpen}
        onOpenChange={setCopilotOpen}
        agentId={activeAgentId || cfg?.id || null}
        agentName={cfg?.nome_agente || "Agente"}
        tipo={tipo || cfg?.tipo || "qualificacao"}
        initialPrompt={copilotInitialPrompt}
        onRuleApplied={async () => {
          await loadAgents(activeAgentId || undefined);
          if (activeAgentId) {
            const { data: updated } = await supabase
              .from("agent_config")
              .select("*")
              .eq("id", activeAgentId)
              .maybeSingle();
            if (updated) applyAgentData(updated);
          }
        }}
        onCatalogUpdated={() => {
          toast.success("Catálogo actualizado con éxito");
        }}
      />
    </div>
  );
}





function KnowledgeCard({ icon, title, description, status, badge }: { icon: React.ReactNode; title: string; description: string; status?: string; badge?: string }) {
  return (
    <div className="flex items-center justify-between p-4 rounded-xl border border-[var(--border)] bg-white hover:bg-[var(--panel-2)]/30 transition-colors cursor-pointer group">
      <div className="flex items-center gap-4">
        <div className="size-10 shrink-0 aspect-square rounded-lg bg-[var(--panel-2)] flex items-center justify-center text-muted-foreground group-hover:bg-white transition-colors">
          {icon}
        </div>
        <div className="space-y-0.5">
          <h4 className="text-sm font-bold">{title}</h4>
          <p className="text-xs text-muted-foreground line-clamp-1">{description}</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {status && <span className="text-[10px] font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded-full">{status}</span>}
        {badge && <span className="text-[10px] font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">{badge}</span>}
        <ChevronDown className="size-4 text-muted-foreground -rotate-90" />
      </div>
    </div>
  );
}






function Section({ title, icon, children, className }: { title?: string; icon?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-5 space-y-3", className)}>
      {title && (
        <h3 className="font-display text-[12px] font-semibold uppercase tracking-wider text-[var(--brand-text)] flex items-center gap-1.5">
          {icon}{title}
        </h3>
      )}
      {children}
    </div>
  );
}


function SummaryRow({ label, value, multiline }: { label: string; value?: string; multiline?: boolean }) {
  if (!value || !value.trim()) return null;
  return (
    <div className="space-y-1">
      <div className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-sm ${multiline ? "whitespace-pre-wrap leading-relaxed" : ""}`}>{value}</div>
    </div>
  );
}

function EditableRow({ label, value, multiline, onChange }: { label: string; value?: string; multiline?: boolean; onChange: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || "");
  useEffect(() => { setDraft(value || ""); }, [value]);
  const hasValue = !!(value && value.trim());
  return (
    <div className="group space-y-1 rounded-lg -mx-1 px-1 py-1 hover:bg-[var(--panel-2)] transition">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
        {!editing && (
          <button
            type="button"
            onClick={() => { setDraft(value || ""); setEditing(true); }}
            className="opacity-0 group-hover:opacity-100 transition text-muted-foreground hover:text-[var(--brand-text)]"
            aria-label={`Editar ${label}`}
          >
            <Pencil className="size-3.5" />
          </button>
        )}
      </div>
      {editing ? (
        <div className="space-y-2">
          {multiline ? (
            <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={4} autoFocus />
          ) : (
            <Input value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus />
          )}
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => { onChange(draft.trim()); setEditing(false); }}>
              <CheckCircle2 className="size-3.5 mr-1" /> OK
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setDraft(value || ""); setEditing(false); }}>Cancelar</Button>
          </div>
        </div>
      ) : hasValue ? (
        <div className={`text-sm ${multiline ? "whitespace-pre-wrap leading-relaxed" : ""}`}>{value}</div>
      ) : (
        <div className="text-sm italic text-muted-foreground">— vazio (clique no lápis para adicionar)</div>
      )}
    </div>
  );
}

function Hint({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-1.5 rounded-lg bg-[var(--panel-2)] px-2 py-1.5">
      <span className="text-[var(--brand-text)]">{icon}</span>
      <span className="truncate">{text}</span>
    </div>
  );
}

function composeKnowledge(data: any): string {
  if (!data) return "";
  return data.sobre_empresa || "";
}

type ChatMsg = {
  role: "user" | "assistant";
  content: string;
  parts?: string[];
  fonte?: string;
  regra?: string;
};

