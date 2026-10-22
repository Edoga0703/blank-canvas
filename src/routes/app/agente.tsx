import { createFileRoute, redirect, Link, useNavigate } from "@tanstack/react-router";
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
import { Bot, Loader2, Save, Send, Sparkles, Wand2, ChevronDown, Settings2, RefreshCcw, HelpCircle, ArrowLeft, CheckCircle2, Plus, Trash2, LayoutGrid, Search, UserCircle2, Eye, History, FileText, ShoppingBag, Zap, Share2, BarChart3, Database, Camera, Image as ImageIcon } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { brand } from "@/config/brand";
import { buildSystemPrompt } from "@/lib/ai-prompt";
import { testAiReply } from "@/lib/evolution.functions";
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

import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/agente")({
  head: () => ({ meta: [{ title: `${brand.name} — Agente IA Studio` }] }),
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
  const ctx = Route.useRouteContext();
  const navigate = useNavigate();
  const companyId = ctx.company?.id;
  const fetchAgents = useServerFn(listAgents);
  const removeAgent = useServerFn(deleteAgent);
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
  const [channelStatus, setChannelStatus] = useState({ whatsapp: true, instagram: true, telegram: true });

  const loadHistory = async () => {
    setLoadingAuditLogs(true);
    try {
      const { data: logs } = await supabase
        .from("audit_log")
        .select("*")
        .in("acao", ["ai_response", "copilot_rule_applied", "agent_config_saved", "agent_teach_saved"])
        .order("created_at", { ascending: false })
        .limit(25);
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
      loadSuggestions(data.id);
    } else if (data) {
      setCfg(data);
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
          setActiveAgentId(def.id);
          setTipo(def.tipo as AgentTipo);
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
    if (activeAgentId) {
      void reload(); 
    } else if (companyId) {
      void loadAgents();
    }
  }, [companyId, activeAgentId]);



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
    };
    const { id: _id, user_id: _u, company_id: _c, updated_at: _ua, ...rest } = payload;
    const savePayload = { 
      company_id: companyId, 
      user_id: ctx.user.id, 
      ...rest,
      nome_agente: cfg.nome_agente || TIPO_LABELS[tipo].label
    };

    try {
      await ensureSession();
      const res = await persistAgent({ data: { id: activeAgentId, payload: savePayload } });
      if (!activeAgentId && (res as any)?.id) setActiveAgentId((res as any).id);
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

  async function runTest() {
    const msg = testInput.trim();
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

      const currentFiles = cfg?.knowledge_files || [];
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

      const nextFiles = (cfg?.knowledge_files || []).filter((f: any) => f.path !== filePath);
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
    if (!txt) return toast.error("Escreva o que a IA deve aprender.");
    setTeachSaving(true);
    try {
      const nextLivre = (livre?.trim() ? livre.trim() + "\n\n" : "") + txt;
      setLivre(nextLivre);
      let teachQuery = supabase.from("agent_config").update({ sobre_empresa: nextLivre });
      if (activeAgentId) teachQuery = teachQuery.eq("id", activeAgentId);
      else teachQuery = teachQuery.eq("company_id", companyId).eq("tipo", tipo);
      const { error } = await teachQuery;
      if (error) throw error;
      setCfg((prev: any) => ({ ...(prev || {}), sobre_empresa: nextLivre }));
      setPromptPreview(buildSystemPrompt({ ...(cfg || {}), sobre_empresa: nextLivre } as any, { responderEmPartes, produtos: [] }));
      toast.success("Conhecimento adicionado — o agente já sabe disso.");
      setTeachOpen(false);
      setTeachText("");
    } catch (e: any) {
      toast.error(e?.message || "Falha ao salvar conhecimento");
    } finally {
      setTeachSaving(false);
    }
  }

  async function createNewAgent() {
    if (!newAgentName.trim()) return toast.error("Digite o nome do agente");
    setSaving(true);
    try {
      const data = await addAgent({ data: { nome: newAgentName, tipo: newAgentTipo } });
      
      toast.success("Agente criado com sucesso");
      setNewAgentOpen(false);
      setNewAgentName("");
      setActiveAgentId(data.id);
      await reload(data.id);
    } catch (e: any) {
      toast.error(e.message || "Erro ao criar agente");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteAgent(id: string) {
    setSaving(true);
    try {
      await removeAgent({ data: { id } });
      toast.success("Agente excluído");
      if (activeAgentId === id) setActiveAgentId(null);
      await reload(null);
    } catch (e: any) {
      toast.error("Erro ao excluir agente");
    } finally {
      setSaving(false);
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
          <h2 className="font-display text-lg font-bold">Agente Studio</h2>
          <Button size="icon" variant="ghost" onClick={() => setNewAgentOpen(true)} className="size-8">
            <Plus className="size-4" />
          </Button>
        </div>
        
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <Input 
            placeholder="Buscar agente..." 
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
          <Link
            to="/app/agente-avancado"
            className="text-xs text-muted-foreground underline cursor-pointer"
          >
            Prefiro preencher tudo manualmente (edição avançada)
          </Link>
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
                    <Pencil className="size-3" /> Editar avatar
                  </Button>
                  <Badge variant={currentAgent?.is_active !== false ? "outline" : "secondary"} className={cn("text-[10px] uppercase", currentAgent?.is_active !== false ? "border-green-500/50 text-green-600 bg-green-50" : "")}>
                    {currentAgent?.is_active !== false ? "Ativo" : "Inativo"}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground flex items-center gap-2">
                  {TIPO_LABELS[tipo].label} • WhatsApp • Funil de Vendas
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" className="gap-2 text-xs" asChild>
                <Link
                  to="/app/agente-avancado"
                  search={{ id: activeAgentId || undefined }}
                >
                  <Settings2 className="size-3.5" /> Configuração avançada
                </Link>
              </Button>
              <Button 
                onClick={() => { setHistoryDialogOpen(true); void loadHistory(); }} 
                variant="outline" 
                size="sm" 
                className="gap-2 text-xs cursor-pointer hover:bg-slate-50"
              >
                <History className="size-3.5" /> Histórico
              </Button>
              <Button 
                onClick={() => setPreviewDialogOpen(true)} 
                variant="outline" 
                size="sm" 
                className="gap-2 text-xs cursor-pointer hover:bg-slate-50"
              >
                <Eye className="size-3.5" /> Pré-visualizar
              </Button>
              <Button onClick={() => { setCopilotInitialPrompt(null); setCopilotOpen(true); }} size="sm" className="gap-2 text-xs bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white shadow-xs">
                <Sparkles className="size-3.5" /> Entrenar con Copilot IA
              </Button>
              <Button onClick={save} disabled={saving} size="sm" className="gap-2 text-xs bg-[var(--brand)] hover:bg-[var(--brand)]/90">
                {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />} 
                Salvar alterações
              </Button>
            </div>
          </div>

          <Tabs defaultValue="conhecimento" className="w-full">
            <TabsList className="w-full justify-start bg-transparent border-b border-[var(--border)] rounded-none h-12 p-0 gap-8">
              <TabsTrigger value="visao" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-[var(--brand)] rounded-none h-full px-0 text-sm font-medium">Visão geral</TabsTrigger>
              <TabsTrigger value="conhecimento" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-[var(--brand)] rounded-none h-full px-0 text-sm font-medium">Conhecimento</TabsTrigger>
              <TabsTrigger value="comportamento" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-[var(--brand)] rounded-none h-full px-0 text-sm font-medium">Comportamento</TabsTrigger>
              <TabsTrigger value="fluxo" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-[var(--brand)] rounded-none h-full px-0 text-sm font-medium">Treinamento</TabsTrigger>
              <TabsTrigger value="canais" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-[var(--brand)] rounded-none h-full px-0 text-sm font-medium">Canais</TabsTrigger>
              <TabsTrigger value="analises" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-[var(--brand)] rounded-none h-full px-0 text-sm font-medium">Análises</TabsTrigger>
            </TabsList>

            <div className="grid lg:grid-cols-[1fr_360px] gap-8 pt-8">
              <div className="space-y-8">
                <TabsContent value="conhecimento" className="mt-0 space-y-8">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-bold">Base de conhecimento</h3>
                      <p className="text-xs text-muted-foreground">Organize as informações que o agente usa para responder.</p>
                    </div>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="gap-2 border-[var(--brand)] text-[var(--brand)] hover:bg-[var(--brand)]/5"
                      onClick={() => setTeachOpen(true)}
                    >
                      <Plus className="size-3.5" /> Adicionar conhecimento
                    </Button>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div className="p-4 rounded-xl border border-[var(--border)] bg-white space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="size-8 rounded-lg bg-blue-50 flex items-center justify-center">
                          <FileText className="size-4 text-blue-600" />
                        </div>
                        <span className="text-lg font-bold">
                          {(cfg?.knowledge_files?.length || 0) + (livre?.trim() ? 1 : 0) + (Array.isArray(cfg?.produtos_servicos) ? cfg.produtos_servicos.length : 0)}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground uppercase font-semibold">Fontes vinculadas</p>
                    </div>
                    <div className="p-4 rounded-xl border border-[var(--border)] bg-white space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="size-8 rounded-lg bg-green-50 flex items-center justify-center">
                          <Zap className="size-4 text-green-600" />
                        </div>
                        <span className="text-[10px] text-green-600 font-medium">Atualizado agora</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground uppercase font-semibold">Status</p>
                    </div>
                    <div className="p-4 rounded-xl border border-[var(--border)] bg-white space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="size-8 rounded-lg bg-purple-50 flex items-center justify-center">
                          <CheckCircle2 className="size-4 text-purple-600" />
                        </div>
                        <span className="text-lg font-bold">100%</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground uppercase font-semibold">Processado</p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <Collapsible>
                      <CollapsibleTrigger asChild>
                        <div className="w-full">
                          <KnowledgeCard 
                            icon={<LayoutGrid className="size-4" />} 
                            title="Informações da Empresa" 
                            description={livre || "Configurações gerais e regras de negócio"}
                            status="Ativo"
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
                    
                    <KnowledgeCard 
                      icon={<ShoppingBag className="size-4" />} 
                      title="Catálogo de Produtos" 
                      description="Integrado automaticamente com o módulo de Catálogo"
                      badge="Automático"
                    />
                    <KnowledgeCard 
                      icon={<Share2 className="size-4" />} 
                      title="Fluxo de CRM" 
                      description="Regras de movimentação automática entre etapas do funil"
                      badge="Automático"
                    />
                  </div>

                  <div className="space-y-3">
                    {cfg?.knowledge_files?.length > 0 && (
                      <div className="flex items-center justify-between">
                        <p className="text-[11px] text-muted-foreground">
                          Conhecimento indexado: <strong>{(cfg.knowledge_files as any[]).reduce((a, f) => a + (Number(f?.textChars) || 0), 0).toLocaleString()}</strong> caracteres
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
                    {cfg?.knowledge_files?.map((file: any) => (
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
                      <h4 className="font-bold text-sm">Treinar com novos arquivos</h4>
                      <p className="text-xs text-muted-foreground">Clique ou arraste arquivos (PDF, TXT, DOCX)</p>
                    </div>
                  </div>

                </TabsContent>

                <TabsContent value="visao" className="mt-0 space-y-6">
                  <div className="space-y-6">
                    <Section title="Informações básicas">
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label>Nome do Agente</Label>
                          <Input value={cfg?.nome_agente || ""} onChange={(e) => setCfg({...cfg, nome_agente: e.target.value})} placeholder="Ex: Consultor de Vendas" />
                        </div>
                        <div className="space-y-2">
                          <Label>Papel e Objetivo</Label>
                          <Textarea value={cfg?.papel_objetivo || ""} onChange={(e) => setCfg({...cfg, papel_objetivo: e.target.value})} placeholder="O que o agente deve fazer..." rows={4} />
                        </div>
                      </div>
                    </Section>
                    <Section title="Estatísticas do Agente">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-[var(--panel-2)]">
                          <span className="text-xs text-muted-foreground">Exemplos treinados</span>
                          <span className="font-bold">{(cfg?.exemplos_few_shot?.length || 0)}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-[var(--panel-2)]">
                          <span className="text-xs text-muted-foreground">Fontes ativas</span>
                          <span className="font-bold text-green-600">{(cfg?.knowledge_files?.length || 0) + (livre?.trim() ? 1 : 0)}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-[var(--panel-2)]">
                          <span className="text-xs text-muted-foreground">Buffer de resposta</span>
                          <span className="font-bold">{segundosBuffer}s</span>
                        </div>
                      </div>
                    </Section>
                  </div>
                </TabsContent>

                <TabsContent value="comportamento" className="mt-0 space-y-6">
                  <div className="space-y-6">
                    <Section title="Personalidade">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Tom das respostas</Label>
                          <Select value={tamanhoResposta} onValueChange={(v) => setTamanhoResposta(v as any)}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="curtas">Curtas (estilo WhatsApp)</SelectItem>
                              <SelectItem value="medias">Médias</SelectItem>
                              <SelectItem value="longas">Longas (explicativas)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Estilo de Comunicação</Label>
                          <Input value={cfg?.estilo_comunicacao || "Humano e prestativo"} onChange={(e) => setCfg({...cfg, estilo_comunicacao: e.target.value})} />
                        </div>
                      </div>
                    </Section>

                    <Section title="Configurações Avançadas">
                      <div className="space-y-5">
                        <div className="grid grid-cols-2 gap-6">
                          <div className="space-y-4">
                            <div className="flex items-center justify-between">
                              <div className="space-y-0.5">
                                <Label>Responder em partes</Label>
                                <p className="text-[10px] text-muted-foreground">Simula comportamento humano no WhatsApp</p>
                              </div>
                              <Switch checked={responderEmPartes} onCheckedChange={setResponderEmPartes} />
                            </div>
                            <div className="space-y-2">
                              <Label>Telefone para transferência</Label>
                              <Input value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="Ex: 5511999999999" />
                            </div>
                          </div>
                          <div className="space-y-4">
                            <div className="space-y-2">
                              <Label>Palavra para pausar IA</Label>
                              <Input value={palavraPausar} onChange={(e) => setPalavraPausar(e.target.value)} />
                            </div>
                            <div className="space-y-2">
                              <Label>Palavra para despausar IA</Label>
                              <Input value={palavraDespausar} onChange={(e) => setPalavraDespausar(e.target.value)} />
                            </div>
                          </div>
                        </div>

                        {/* Buffer / Debounce de Mensagens (Fase A) */}
                        <div className="rounded-xl border border-border/80 bg-muted/20 p-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-2">
                                <Label className="text-sm font-medium">Buffer de Mensagens (Espera antes de responder)</Label>
                                <Badge variant="secondary" className="font-mono text-xs">{segundosBuffer}s</Badge>
                              </div>
                              <p className="text-xs text-muted-foreground">
                                Agrupa mensagens seguidas do cliente (ex: &ldquo;Hola&rdquo;, &ldquo;¿Tienen Netflix?&rdquo;, &ldquo;¿A cómo?&rdquo;) enviadas dentro deste intervalo em uma única resposta completa e coerente. 0 = imediato.
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
                              <button type="button" onClick={() => setSegundosBuffer(0)} className="hover:text-foreground">0s (imediato)</button>
                              <button type="button" onClick={() => setSegundosBuffer(3)} className="hover:text-foreground">3s</button>
                              <button type="button" onClick={() => setSegundosBuffer(5)} className="hover:text-foreground font-semibold text-brand">5s (recomendado)</button>
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
                  <Section title="Mensagem inicial (abertura padrão)">
                    <div className="space-y-2">
                      <Textarea
                        value={cfg?.apresentacao || ""}
                        onChange={(e) => setCfg({ ...cfg, apresentacao: e.target.value })}
                        placeholder={`Ex: Oi! Aqui é a ${cfg?.nome_agente || "Lia"} da ${cfg?.nome_empresa || "sua empresa"}. Vi que você chegou pelo anúncio — me conta rapidinho o que você procura?`}
                        rows={3}
                      />
                      <p className="text-[11px] text-muted-foreground">
                        É exatamente assim que o agente vai abrir a conversa (1ª mensagem). Escreva a frase pronta.
                      </p>
                    </div>
                  </Section>

                  <Section title={tipo === "posvenda" ? "Roteiro de pós-venda (passo a passo)" : tipo === "followup" ? "Roteiro de follow-up (passo a passo)" : "Roteiro de qualificação/venda (passo a passo)"}>
                    <div className="space-y-2">
                      <Textarea
                        value={cfg?.como_vender || ""}
                        onChange={(e) => setCfg({ ...cfg, como_vender: e.target.value })}
                        placeholder={"1. Confirme o nome do cliente\n2. Pergunte o que ele procura\n3. Pergunte prazo/urgência\n4. Pergunte orçamento\n5. Ofereça a solução e conduza para agendamento"}
                        rows={9}
                      />
                      <p className="text-[11px] text-muted-foreground">
                        O agente segue essas etapas na ordem, uma pergunta por vez.
                      </p>
                    </div>
                  </Section>

                  <div className="grid grid-cols-2 gap-6">
                    <Section title="Objeções e respostas">
                      <Textarea
                        value={cfg?.objecoes || ""}
                        onChange={(e) => setCfg({ ...cfg, objecoes: e.target.value })}
                        placeholder={'"Tá caro" → mostre o valor e as condições de pagamento\n"Vou pensar" → pergunte qual é a dúvida que ficou'}
                        rows={7}
                      />
                    </Section>
                    <Section title="Perguntas frequentes (FAQ)">
                      <Textarea
                        value={cfg?.faq || ""}
                        onChange={(e) => setCfg({ ...cfg, faq: e.target.value })}
                        placeholder={"Vocês atendem em qual região? → ...\nQual a forma de pagamento? → ..."}
                        rows={7}
                      />
                    </Section>
                  </div>

                  {tipo === "posvenda" && (
                    <Section title="Mensagem padrão de pós-venda">
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

                  <Section title="Regras rígidas (o agente nunca quebra)">
                    <Textarea
                      value={regrasRigidas}
                      onChange={(e) => setRegrasRigidas(e.target.value)}
                      placeholder="Ex: 1. Nunca dê desconto sem aprovação. 2. Sempre peça o e-mail. 3. Nunca fale de concorrentes."
                      rows={8}
                    />
                  </Section>

                  <Section title="Exemplos de conversa (treino)">
                    <div className="space-y-3">
                      {(Array.isArray(cfg?.exemplos_few_shot) ? cfg.exemplos_few_shot : []).map((ex: any, i: number) => (
                        <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-start">
                          <Textarea
                            rows={2}
                            placeholder="Cliente disse..."
                            value={ex?.cliente || ""}
                            onChange={(e) => {
                              const list = [...(cfg.exemplos_few_shot || [])];
                              list[i] = { ...list[i], cliente: e.target.value };
                              setCfg({ ...cfg, exemplos_few_shot: list });
                            }}
                          />
                          <Textarea
                            rows={2}
                            placeholder="Agente deve responder..."
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
                            Remover
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
                        Adicionar exemplo
                      </Button>
                      <p className="text-[11px] text-muted-foreground">
                        O agente imita o estilo destes exemplos. Use o Playground ao lado para testar e a opção “Corrigir” para transformar uma resposta ruim em exemplo bom.
                      </p>
                    </div>
                  </Section>
                </TabsContent>
                <TabsContent value="canais" className="mt-0 space-y-6">
                  <Section title="Conectar Canais de Atendimento">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="p-4 rounded-xl border border-[var(--border)] bg-white space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="size-10 rounded-lg bg-green-50 flex items-center justify-center">
                              <Zap className="size-5 text-green-600" />
                            </div>
                            <div>
                              <h4 className="text-sm font-bold">WhatsApp</h4>
                              <p className="text-[10px] text-muted-foreground">Uazapi, Evolution, WaBlast, Lovable</p>
                            </div>
                          </div>
                          <Switch checked={channelStatus.whatsapp} onCheckedChange={(val) => setChannelStatus(prev => ({ ...prev, whatsapp: val }))} />
                        </div>
                        <Button variant="outline" size="sm" className="w-full text-xs" asChild><Link to="/app/conexao">Gerenciar conexões</Link></Button>
                      </div>
                      <div className="p-4 rounded-xl border border-[var(--border)] bg-white space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="size-10 rounded-lg bg-blue-50 flex items-center justify-center">
                              <Share2 className="size-5 text-blue-600" />
                            </div>
                            <div>
                              <h4 className="text-sm font-bold">Instagram Direct</h4>
                              <p className="text-[10px] text-muted-foreground">Mensagens diretas oficiais</p>
                            </div>
                          </div>
                          <Switch checked={channelStatus.instagram} onCheckedChange={(val) => setChannelStatus(prev => ({ ...prev, instagram: val }))} />
                        </div>
                        <Button variant="outline" size="sm" className="w-full text-xs" asChild><Link to="/app/conexao" search={{ tab: "instagram" }}>Configurar canal</Link></Button>
                      </div>
                      <div className="p-4 rounded-xl border border-[var(--border)] bg-white space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="size-10 rounded-lg bg-sky-50 flex items-center justify-center">
                              <Send className="size-5 text-sky-600" />
                            </div>
                            <div>
                              <h4 className="text-sm font-bold">Telegram</h4>
                              <p className="text-[10px] text-muted-foreground">Bot API e chats diretos</p>
                            </div>
                          </div>
                          <Switch checked={channelStatus.telegram} onCheckedChange={(val) => setChannelStatus(prev => ({ ...prev, telegram: val }))} />
                        </div>
                        <Button variant="outline" size="sm" className="w-full text-xs" asChild><Link to="/app/conexao" search={{ tab: "telegram" }}>Configurar bot</Link></Button>
                      </div>
                    </div>
                  </Section>
                </TabsContent>

                <TabsContent value="analises" className="mt-0 space-y-6">
                  <Section title="Desempenho da IA">
                    <div className="h-[300px] flex items-center justify-center border-2 border-dashed border-[var(--border)] rounded-xl bg-[var(--panel)]/30">
                      <div className="text-center space-y-2">
                        <BarChart3 className="size-8 text-muted-foreground/30 mx-auto" />
                        <p className="text-xs text-muted-foreground">Dados de análise serão exibidos após as primeiras interações.</p>
                      </div>
                    </div>
                  </Section>
                </TabsContent>
              </div>

              <div className="space-y-8">
                <Section title="Testar agente" icon={<Bot className="size-3.5" />}>


                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="size-2 rounded-full bg-green-500" />
                      <span className="text-[10px] text-muted-foreground font-medium">{cfg?.nome_agente || "Agente"} está ativo</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="sm" onClick={() => setChat([])} className="h-7 text-[10px] gap-1">
                        <RefreshCcw className="size-3" /> Novo teste
                      </Button>
                      <Badge variant="outline" className="text-[9px] py-0 h-5">Novo lead <ChevronDown className="size-2 ml-1" /></Badge>
                    </div>
                  </div>

                  <div ref={scrollRef} className="rounded-xl border border-[var(--border)] bg-[var(--panel-2)]/50 p-4 space-y-4 h-[440px] overflow-y-auto mb-3">
                    {chat.length === 0 && !testing && (
                      <div className="h-full flex flex-col items-center justify-center text-center gap-2 p-6">
                        <Bot className="size-8 text-muted-foreground/30" />
                        <p className="text-xs text-muted-foreground">Inicie uma conversa para testar o comportamento do agente.</p>
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
                          <Loader2 className="size-3 animate-spin" /> Digitando...
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="relative">
                    <Input
                      value={testInput}
                      onChange={(e) => setTestInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void runTest(); } }}
                      placeholder="Digite como um cliente..."
                      disabled={testing}
                      className="pr-10 bg-white"
                    />
                    <Button 
                      onClick={runTest} 
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
                      onClick={() => {
                        const lastAssistantIdx = chat.map(m => m.role).lastIndexOf("assistant");
                        if (lastAssistantIdx === -1) {
                          toast.error("Nenhuma resposta da IA para marcar como correta.");
                          return;
                        }
                        const userMsg = chat.slice(0, lastAssistantIdx).reverse().find(m => m.role === "user");
                        const clientText = userMsg ? userMsg.content : "Pergunta de teste";
                        const agentText = chat[lastAssistantIdx].content;
                        const nextExamples = [...(Array.isArray(cfg?.exemplos_few_shot) ? cfg.exemplos_few_shot : []), { cliente: clientText, agente: agentText }];
                        setCfg({ ...cfg, exemplos_few_shot: nextExamples });
                        toast.success("Resposta marcada como correta e adicionada aos exemplos de estilo!");
                      }}
                      className="text-[10px] h-8 gap-1.5 border-green-200 text-green-700 hover:bg-green-50 hover:text-green-800 cursor-pointer"
                    >
                      <CheckCircle2 className="size-3.5" /> Resposta correta
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => {
                        const lastAssistantIdx = chat.map(m => m.role).lastIndexOf("assistant");
                        if (lastAssistantIdx === -1) {
                          toast.error("Nenhuma resposta da IA para corrigir ainda.");
                          return;
                        }
                        openCorrect(lastAssistantIdx);
                      }}
                      className="text-[10px] h-8 gap-1.5 border-orange-200 text-orange-700 hover:bg-orange-50 hover:text-orange-800 cursor-pointer"
                    >
                      <Sparkles className="size-3.5" /> Precisa melhorar
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
              <Eye className="size-5 text-[var(--brand)]" /> Pré-visualizar System Prompt
            </DialogTitle>
            <DialogDescription>
              Prompt completo compilado com as diretrizes da empresa, produtos, regras rígidas e variáveis ativas.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-auto bg-slate-900 text-slate-100 p-4 rounded-xl font-mono text-xs whitespace-pre-wrap select-all">
            {promptPreview || "Carregando diretrizes do agente..."}
          </div>
          <DialogFooter className="flex justify-between items-center sm:justify-between pt-2">
            <span className="text-xs text-muted-foreground font-mono">
              ~{Math.round((promptPreview?.length || 0) / 4)} tokens estimados
            </span>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => {
                  navigator.clipboard.writeText(promptPreview);
                  toast.success("Prompt copiado para a área de transferência!");
                }}
              >
                Copiar Prompt
              </Button>
              <Button size="sm" onClick={() => setPreviewDialogOpen(false)}>Fechar</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de Histórico de Execuções e Auditoria */}
      <Dialog open={historyDialogOpen} onOpenChange={setHistoryDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="size-5 text-[var(--brand)]" /> Histórico de Ações da IA
            </DialogTitle>
            <DialogDescription>
              Últimas execuções, disparos de regras e alterações de treinamento auditadas.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-auto divide-y">
            {loadingAuditLogs ? (
              <div className="py-12 text-center text-muted-foreground">Carregando auditoria...</div>
            ) : auditLogs.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">Nenhuma ação registrada no histórico recente.</div>
            ) : (
              auditLogs.map((log) => (
                <div key={log.id} className="py-3 flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-700">{log.acao}</p>
                    <p className="text-xs text-muted-foreground">{log.detalhes?.descricao || log.detalhes?.message || JSON.stringify(log.detalhes || {})}</p>
                  </div>
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                    {new Date(log.created_at).toLocaleString("pt-BR")}
                  </span>
                </div>
              ))
            )}
          </div>
          <DialogFooter className="pt-2">
            <Button size="sm" onClick={() => setHistoryDialogOpen(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={teachOpen} onOpenChange={setTeachOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Ensinar algo novo à IA</DialogTitle>
            <DialogDescription>
              Adicione informações específicas que o agente deve saber. Isso será anexado à base de conhecimento.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>O que você quer ensinar?</Label>
              <Textarea 
                value={teachText} 
                onChange={(e) => setTeachText(e.target.value)}
                placeholder="Ex: A partir de hoje aceitamos Pix com 5% de desconto."
                rows={6}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTeachOpen(false)}>Cancelar</Button>
            <Button onClick={saveTeach} disabled={teachSaving}>
              {teachSaving ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Plus className="size-4 mr-2" />}
              Salvar Conhecimento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={correctOpen} onOpenChange={setCorrectOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Corrigir resposta do agente</DialogTitle>
            <DialogDescription>
              Escreva como o agente deveria ter respondido para que ele aprenda com este exemplo.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Resposta ideal</Label>
              <Textarea 
                value={correctIdeal} 
                onChange={(e) => setCorrectIdeal(e.target.value)}
                placeholder="Digite a resposta perfeita..."
                rows={6}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCorrectOpen(false)}>Cancelar</Button>
            <Button onClick={submitCorrection} disabled={correctSaving}>
              {correctSaving ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Save className="size-4 mr-2" />}
              Salvar Correção
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingId} onOpenChange={(open) => !open && setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir agente?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O agente e todo o seu treinamento serão removidos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => deletingId && handleDeleteAgent(deletingId)}
              className="bg-red-600 hover:bg-red-700"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={newAgentOpen} onOpenChange={setNewAgentOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Configurar novo agente</DialogTitle>
            <DialogDescription>
              Siga os passos abaixo para criar um agente personalizado para seu negócio.
            </DialogDescription>
          </DialogHeader>
          
          <Tabs defaultValue="base" className="w-full mt-4">
            <TabsList className="grid grid-cols-3 w-full">
              <TabsTrigger value="base">Identidade</TabsTrigger>
              <TabsTrigger value="objetivo">Objetivo</TabsTrigger>
              <TabsTrigger value="avatar">Avatar</TabsTrigger>
            </TabsList>
            
            <TabsContent value="base" className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Nome do Agente</Label>
                <Input 
                  value={newAgentName} 
                  onChange={(e) => setNewAgentName(e.target.value)}
                  placeholder="Ex: Lia, Max, Bia..."
                />
              </div>
              <div className="space-y-2">
                <Label>Tipo de Agente</Label>
                <Select value={newAgentTipo} onValueChange={(v) => setNewAgentTipo(v as AgentTipo)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="qualificacao">Qualificação / Vendas</SelectItem>
                    <SelectItem value="followup">Follow-up / Reengajamento</SelectItem>
                    <SelectItem value="posvenda">Pós-venda / Suporte</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </TabsContent>

            <TabsContent value="objetivo" className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Descrição do Negócio</Label>
                <Textarea 
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  placeholder="Conte um pouco sobre o que sua empresa faz e o que este agente deve fazer..."
                  rows={6}
                />
              </div>
            </TabsContent>

            <TabsContent value="avatar" className="space-y-4 py-4">
              <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-xl bg-slate-50">
                <Bot className="size-12 text-slate-300 mb-4" />
                <p className="text-sm text-slate-500 text-center">
                  Após criar o agente, você poderá usar o Gerador de Avatares Pixar para dar uma identidade visual única a ele.
                </p>
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter className="mt-6">
            <Button variant="outline" onClick={() => setNewAgentOpen(false)}>Cancelar</Button>
            <Button onClick={createNewAgent} disabled={saving || !newAgentName.trim()}>
              {saving ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Plus className="size-4 mr-2" />}
              Criar Agente
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
        agentId={activeAgentId}
        agentName={cfg?.nome_agente || "Agente"}
        tipo={tipo}
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
};

