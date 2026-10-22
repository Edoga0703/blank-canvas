import { normalizePhone } from "@/lib/br-phone";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { brand } from "@/config/brand";
import { AgentAvatar } from "@/components/agente/agent-avatar";
import {
  Hand, MessageSquareText, Send, Search, Bot,
  Star, ChevronDown, ChevronUp, X, Tag as TagIcon,
  Paperclip, Mic, Square, Trash2, FileText, Play, ThumbsUp, ThumbsDown, Plus, Trash, AlertCircle,
  Smile, PanelRightClose, PanelRightOpen, Pencil, Reply, Package, ChevronLeft, ChevronRight, Info, CheckCircle2,
  UserPlus, Users, Inbox, Wifi, WifiOff, Image as ImageIcon, Mic as MicIcon, Video as VideoIcon,
  Filter as FunnelIcon, Check, CheckCheck, Bell, BellOff, Contact as ContactIcon, Ban, RefreshCw,
  CalendarPlus, Sparkles, Gauge, Download, UserRound,
} from "lucide-react";
import { SendContactDialog } from "@/components/chat/send-contact-dialog";
import { AiAssistButton } from "@/components/chat/ai-assist-button";


import { 
  DropdownMenu, 
  DropdownMenuTrigger, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuSeparator 
} from "@/components/ui/dropdown-menu";
import { WhatsAppGlyph, MessengerGlyph, InstagramGlyph, TelegramGlyph } from "@/components/ui/channel-icons";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { useWhatsappStatus } from "@/hooks/use-whatsapp-status";
import { sendCsat, moveLeadToCsatDestino } from "@/lib/csat.functions";
import { resumirConversa } from "@/lib/resumo.functions";
import { analisarSentimento } from "@/lib/sentimento.functions";
import { Badge } from "@/components/ui/badge";
import { useCapacidadeAtiva } from "@/hooks/use-capacidades";
import { getCsatConfig } from "@/lib/csat-config.functions";
import { reactMessage, editMessage, deleteMessage } from "@/lib/message-actions.functions";
import { toast } from "sonner";
import { InitialsAvatar } from "@/components/ui/initials-avatar";
import { AvatarViewer } from "@/components/ui/avatar-viewer";
import { sendWhatsappText, setContactIaActive, sendWhatsappMedia, sendWhatsappAudio, getWhatsappProfilePic, handleChatAction, syncWhatsappHistory } from "@/lib/evolution.functions";
import { QuickScheduleDialog } from "@/components/agenda/quick-schedule-dialog";
import { LeadDrawer, LeadDetailsPanel, LeadTagsInline, type LeadCard, type Stage, type Member } from "@/components/crm/lead-drawer";
import { GrupoDetailsPanel } from "@/components/chat/grupo-details-panel";
import { listTemplates, type MessageTemplate } from "@/lib/templates.functions";
import { listQuickReplies, toggleQuickReplyFavorito, deleteQuickReply, type QuickReply } from "@/lib/quick-replies.functions";
import { QuickRepliesDialog } from "@/components/chat/quick-replies-dialog";
import { listProdutos, type Produto } from "@/lib/produtos.functions";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { WhatsappAudio } from "@/components/chat/whatsapp-audio";
import { ChatMedia } from "@/components/chat/chat-media";
import { ChatLocation, parseLocationText } from "@/components/chat/chat-location";
import { MediaLightbox, openMediaLightbox } from "@/components/chat/media-lightbox";
import { MediaPreviewDialog } from "@/components/chat/media-preview-dialog";
import { markConvRead, markConvUnread, getConvReadMap, CONV_FORCE_UNREAD } from "@/hooks/use-unread-conversations";
import { getInboxSectors, type SectorOption } from "@/lib/sectors.functions";
import { EncaminharDialog } from "@/components/chat/encaminhar-dialog";
import { ForwardMessageDialog } from "@/components/chat/forward-message-dialog";
import { listarGrupos, enviarMensagemGrupo } from "@/lib/grupos.functions";
import { responderTransferencia } from "@/lib/sectors.functions";
import { Forward } from "lucide-react";
import { useFeatureEnabled } from "@/hooks/use-feature-flags";
import { canTransferConversation } from "@/lib/tenant";
import { salvarRelatorioAtendimento, sugerirRelatorioAtendimento, type AtendimentoSituacao } from "@/lib/atendimento-relatorios.functions";
import { prepareR2Upload } from "@/lib/storage/r2.functions";
import { syncMetaNow } from "@/lib/meta-content.functions";
import { backfillMetaProfiles } from "@/lib/meta.functions";


export const Route = createFileRoute("/app/conversas")({
  errorComponent: ({ error }) => {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes("500") || msg.includes("Você ainda não possui uma empresa")) {
      window.location.href = "/entrar";
      return null;
    }
    return (
      <div className="flex h-screen items-center justify-center p-8 text-center">
        <div>
          <h1 className="text-2xl font-bold mb-4">Erro ao carregar conversas</h1>
          <p className="text-gray-600 mb-6">{msg}</p>
          <button 
            onClick={() => window.location.reload()}
            className="px-6 py-2 bg-[#0B22FE] text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Recarregar página
          </button>
        </div>
      </div>
    );
  },
  head: () => ({
    meta: [
      { title: `${brand.name} — Conversas` },
      { name: "description", content: "Central de conversas e grupos do WhatsApp no Capi Conversa." },
      { property: "og:title", content: `${brand.name} — Conversas` },
      { property: "og:description", content: "Central de conversas e grupos do WhatsApp no Capi Conversa." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  validateSearch: (search: Record<string, unknown>) => ({
    n: typeof search.n === "string" && search.n ? search.n : undefined,
  }),
  component: ConversasPage,
});

const CANAL_CHAT = {
  whatsapp: { label: "WhatsApp", color: "#25D366", Icon: WhatsAppGlyph },
  messenger: { label: "Messenger", color: "#0084FF", Icon: MessengerGlyph },
  instagram: {
    label: "Instagram Direct",
    color: "radial-gradient(circle at 30% 107%, #fdf497 0%, #fdf497 5%, #fd5949 45%,#d6249f 60%,#285AEB 90%)",
    Icon: InstagramGlyph,
  },
  telegram: { label: "Telegram", color: "#229ED9", Icon: TelegramGlyph },
} as const;
type CanalChat = keyof typeof CANAL_CHAT;

function ChannelBadge({ canal, size = 20 }: { canal?: string | null; size?: number; parentSize?: number }) {
  const key = (canal && canal in CANAL_CHAT ? canal : "whatsapp") as CanalChat;
  const { label, color, Icon } = CANAL_CHAT[key];
  
  return (
    <span
      title={label}
      aria-label={label}
      className="absolute z-10 grid place-items-center overflow-hidden rounded-full"
      style={{ 
        background: color, 
        width: size, 
        height: size,
        bottom: size * -0.08,
        right: size * -0.08,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: key === "whatsapp"
          ? `0 0 0 ${Math.max(2, size * 0.1)}px color-mix(in srgb, ${color} 68%, white), 0 1px 3px color-mix(in srgb, black 25%, transparent)`
          : `0 0 0 ${Math.max(2, size * 0.1)}px var(--panel), 0 1px 3px color-mix(in srgb, black 25%, transparent)`,
      }}
    >
      <Icon className="text-white" style={{ width: size * 0.68, height: size * 0.68 }} />
    </span>
  );
}

interface Msg {
  id: string; numero: string; contato_nome: string | null;
  direcao: "entrada" | "saida"; autor: "ia" | "humano" | "contato" | "automacao";
  texto: string; created_at: string; user_id: string | null;
  midia_url?: string | null; midia_tipo?: string | null; midia_mime?: string | null; midia_nome?: string | null;
  reacao?: string | null; editado_em?: string | null;
  whatsapp_message_id?: string | null; reply_to_id?: string | null;
  status_envio?: string | null;
  provider?: string | null;
}

function getChannel(card?: any, lastMsg?: Msg | null): CanalChat {
  const c = String((card as any)?.canal_chat || (card as any)?.canal_entrada || "").toLowerCase();
  if (c === "instagram" || c === "messenger" || c === "telegram") return c as CanalChat;
  if (lastMsg?.provider === "meta_instagram") return "instagram";
  if (lastMsg?.provider === "meta_messenger") return "messenger";
  if (lastMsg?.provider === "telegram") return "telegram";
  return "whatsapp";
}



type Filter = "todas" | "nao_lidas" | "minhas" | "grupos" | "sem_responsavel" | "ia_ativa" | "resolvidas";

const FILTER_LABELS: Record<Filter, string> = {
  todas: "Todas as Mensagens",
  nao_lidas: "Aguardando Resposta",
  minhas: "Meus Atendimentos",
  grupos: "Grupos",
  sem_responsavel: "Sem Responsável",
  ia_ativa: "Atendimento IA",
  resolvidas: "Encerradas",
};

// Filtros rápidos exibidos como chips acima da lista (uso diário)
const QUICK_FILTERS: { key: Filter; label: string }[] = [
  { key: "todas", label: "Todas" },
  { key: "nao_lidas", label: "Não lidas" },
  { key: "minhas", label: "Minhas" },
  { key: "grupos", label: "Grupos" },
];

// Atendente começa pelas conversas dele: Minhas, Não lidas, Grupos.
const QUICK_FILTERS_ATENDENTE: { key: Filter; label: string }[] = [
  { key: "minhas", label: "Minhas" },
  { key: "nao_lidas", label: "Não lidas" },
  { key: "grupos", label: "Grupos" },
];

type StageWithTipo = Stage & { tipo?: string; modo_atendimento?: string };

/** Conversa de grupo do WhatsApp (o número é o JID do grupo). */
const isGrupo = (numero: string) => numero.includes("@g.us");

const numeroComparable = (numero: string) => {
  const digits = numero.replace(/\D/g, "");
  return digits.slice(-8);
};


function ConversasPage() {
  const ctx = Route.useRouteContext();
  const companyId = ctx.company?.id;
  const userId = ctx.user.id;
  const canTransfer = canTransferConversation(ctx.membership, ctx.isSuperAdmin);
  const operationalMode = ctx.company?.atendimento_operacional === true;
  // Grupos do WhatsApp só ficam visíveis em contas com o recurso habilitado.
  const gruposAtivos = (ctx.company as any)?.grupos_ativos === true;
  const operationalManager = operationalMode && (ctx.membership?.role === "owner" || ctx.membership?.role === "admin" || ctx.isSuperAdmin);
  // Atendente não vê a aba "Todas": só os atendimentos designados a ele.
  const isAtendenteUser = (ctx as any).membership?.role === "atendente" && !ctx.isSuperAdmin;
  const baseFilter: Filter = isAtendenteUser ? "minhas" : "todas";

  const sendFn = useServerFn(sendWhatsappText);
  const enviarGrupoFn = useServerFn(enviarMensagemGrupo);
  const listarGruposFn = useServerFn(listarGrupos);
  const responderTransferenciaFn = useServerFn(responderTransferencia);
  const sendCsatFn = useServerFn(sendCsat);
  const moveDestinoFn = useServerFn(moveLeadToCsatDestino);
  const getCsatCfgFn = useServerFn(getCsatConfig);
  const toggleIaFn = useServerFn(setContactIaActive);
  const fetchTemplates = useServerFn(listTemplates);
  const fetchQuickReplies = useServerFn(listQuickReplies);
  const fetchProfilePicFn = useServerFn(getWhatsappProfilePic);
  const chatActionFn = useServerFn(handleChatAction);
  const syncHistoryFn = useServerFn(syncWhatsappHistory);
  const resumirFn = useServerFn(resumirConversa);
  const sugerirRelatorioFn = useServerFn(sugerirRelatorioAtendimento);
  const salvarRelatorioFn = useServerFn(salvarRelatorioAtendimento);
  const resumoAtivo = useCapacidadeAtiva("ia-resumo");
  const [resumoOpen, setResumoOpen] = useState(false);
  const [resumoTexto, setResumoTexto] = useState("");
  const [resumoLoading, setResumoLoading] = useState(false);
  const sentimentoFn = useServerFn(analisarSentimento);
  const sentimentoAtivo = useCapacidadeAtiva("ia-sentimento");
  const [sentOpen, setSentOpen] = useState(false);
  const [sentLoading, setSentLoading] = useState(false);
  const [sentRes, setSentRes] = useState<any>(null);
  const [csatAtivo, setCsatAtivo] = useState(true);
  const [csatFormato, setCsatFormato] = useState<string>("link");
  const [csatAoFinalizar, setCsatAoFinalizar] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const syncMetaFn = useServerFn(syncMetaNow);
  const backfillMetaFn = useServerFn(backfillMetaProfiles);
  const [syncingMeta, setSyncingMeta] = useState(false);
  const [agentConfig, setAgentConfig] = useState<{ avatar_traits?: any, avatar_url?: string, nome_agente?: string } | null>(null);

  useEffect(() => {
    if (!companyId) return;
    const fetchAgent = async () => {
      const { data } = await supabase
        .from("agent_config")
        .select("avatar_traits, avatar_url, nome_agente")
        .eq("company_id", companyId)
        .eq("tipo", "qualificacao")
        .maybeSingle();
      if (data) setAgentConfig(data as any);
    };
    fetchAgent();
    
    // Subscribe to changes to update avatar in real-time
    const sub = supabase
      .channel('agent-avatar-updates')
      .on('postgres_changes', { 
        event: 'UPDATE', 
        schema: 'public', 
        table: 'agent_config',
        filter: `company_id=eq.${companyId}`
      }, (payload) => {
        if (payload.new.tipo === 'qualificacao') {
          setAgentConfig({ avatar_traits: payload.new.avatar_traits, avatar_url: payload.new.avatar_url, nome_agente: payload.new.nome_agente });
        }
      })
      .subscribe();
      
    return () => { supabase.removeChannel(sub); };
  }, [companyId]);

  useEffect(() => {
    getCsatCfgFn().then((c: any) => {
      setCsatAtivo(c?.ativo !== false);
      setCsatFormato(c?.formato === "chat" ? "chat" : "link");
      setCsatAoFinalizar(c?.enviarAoFinalizar === true);
    }).catch(() => {});
  }, [getCsatCfgFn]);

  const [instances, setInstances] = useState<Array<{ id: string; instance_name: string; display_name: string | null; provider: string; status: string; phone_number_id: string | null }>>([]);

  useEffect(() => {
    if (!companyId) return;
    let alive = true;
    async function loadInstances() {
      const { data } = await supabase
        .from("whatsapp_instances")
        .select("id,instance_name,display_name,provider,status,phone_number_id")
        .eq("company_id", companyId ?? "");
      if (alive && data) setInstances(data as any);
    }
    void loadInstances();
    const sub = supabase
      .channel("conversas-instances-status")
      .on("postgres_changes", { event: "*", schema: "public", table: "whatsapp_instances", filter: `company_id=eq.${companyId}` }, () => {
        void loadInstances();
      })
      .subscribe();
    return () => { alive = false; void supabase.removeChannel(sub); };
  }, [companyId]);

  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>([]);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const composerRef = useRef<HTMLInputElement>(null);

  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [cards, setCards] = useState<Record<string, LeadCard>>({});
  const [pauses, setPauses] = useState<Record<string, boolean>>({});
  const [pausesLoaded, setPausesLoaded] = useState(false);
  const [stages, setStages] = useState<StageWithTipo[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [readMap, setReadMap] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>(() => {
    if (typeof window === "undefined") return baseFilter;
    // Sevcon (modo operacional): admin abre por padrão em "Todas"; atendente em "Minhas".
    if (operationalMode && !isAtendenteUser) return "todas";
    const saved = (localStorage.getItem("conv:filter") as Filter) || baseFilter;
    return isAtendenteUser && (saved === "todas" || saved === "sem_responsavel") ? "minhas" : saved;
  });
  const [filterOpen, setFilterOpen] = useState(false);

  // ---- Setores (departamentos) ----
  const [sectors, setSectors] = useState<SectorOption[]>([]);
  const [mySectorIds, setMySectorIds] = useState<string[]>([]);
  const [sectorFilter, setSectorFilter] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("conv:setor") || null;
  });
  const [agentFilter, setAgentFilter] = useState<string | null>(null);
  const [channelFilter, setChannelFilter] = useState<string | null>(null);
  const loadSectorsFn = useServerFn(getInboxSectors);
  const setoresOn = useFeatureEnabled("feature.setores");
  useEffect(() => {
    if (!setoresOn) { setSectors([]); setMySectorIds([]); return; }
    loadSectorsFn()
      .then((r: any) => { setSectors(r?.sectors ?? []); setMySectorIds(r?.myIds ?? []); })
      .catch(() => {});
  }, [loadSectorsFn, setoresOn]);
  useEffect(() => {
    try {
      if (sectorFilter) localStorage.setItem("conv:setor", sectorFilter);
      else localStorage.removeItem("conv:setor");
    } catch {}
  }, [sectorFilter]);

  const { n: numeroParam } = Route.useSearch();
  const [active, setActive] = useState<string | null>(numeroParam ?? null);
  useEffect(() => { if (numeroParam) setActive(numeroParam); }, [numeroParam]);
  const activeRef = useRef<string | null>(active);
  useEffect(() => { activeRef.current = active; }, [active]);

  useEffect(() => {
    if (companyId) setReadMap(getConvReadMap(companyId));
  }, [companyId]);

  const markRead = useCallback((numero: string) => {
    if (!companyId || !numero) return;
    const when = new Date().toISOString();
    markConvRead(companyId, numero, when);
    setReadMap((p) => ({ ...p, [numero]: when }));
  }, [companyId]);

  const markUnread = useCallback((numero: string) => {
    if (!companyId || !numero) return;
    markConvUnread(companyId, numero);
    setReadMap((p) => ({ ...p, [numero]: CONV_FORCE_UNREAD }));
    toast.success("Conversa marcada como não lida");
  }, [companyId]);

  // Não lidas no padrão WhatsApp: mensagens de entrada posteriores à última
  // leitura OU à última resposta enviada pela equipe naquela conversa.
  const unread = useMemo(() => {
    const lastOut: Record<string, number> = {};
    for (const m of msgs) {
      if (m.direcao === "entrada") continue;
      const t = +new Date(m.created_at);
      if (!lastOut[m.numero] || t > lastOut[m.numero]) lastOut[m.numero] = t;
    }
    const counts: Record<string, number> = {};
    for (const m of msgs) {
      if (m.direcao !== "entrada") continue;
      if (m.numero === active) continue;
      const raw = readMap[m.numero];
      if (raw === CONV_FORCE_UNREAD) {
        // Marcada manualmente como não lida: conta entradas sem resposta (mín. 1)
        if (+new Date(m.created_at) > (lastOut[m.numero] ?? 0)) {
          counts[m.numero] = (counts[m.numero] ?? 0) + 1;
        }
        continue;
      }
      const readAt = raw ? +new Date(raw) : 0;
      const cutoff = Math.max(readAt, lastOut[m.numero] ?? 0);
      if (+new Date(m.created_at) <= cutoff) continue;
      counts[m.numero] = (counts[m.numero] ?? 0) + 1;
    }
    for (const [numero, raw] of Object.entries(readMap)) {
      if (raw === CONV_FORCE_UNREAD && numero !== active && !counts[numero]) counts[numero] = 1;
    }
    return counts;
  }, [msgs, readMap, active]);

  const [composer, setComposer] = useState("");
  const [drawerCard, setDrawerCard] = useState<LeadCard | null>(null);
  const [sending, setSending] = useState(false);
  const [finalizarDialogOpen, setFinalizarDialogOpen] = useState(false);
  const [relatorio, setRelatorio] = useState({ solicitacao: "", resolucao: "", situacao: "pendente" as AtendimentoSituacao, pendenteCom: "", aiSugerido: false });
  const [relatorioLoading, setRelatorioLoading] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia("(min-width: 1024px)").matches) return;
    const saved = localStorage.getItem("conv:showDetails");
    if (saved !== null) setShowDetails(saved === "1");
    // Sevcon (modo operacional): painel de detalhes inicia recolhido por padrão.
    else setShowDetails(!operationalMode);
  }, []);
  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches) {
      try { localStorage.setItem("conv:showDetails", showDetails ? "1" : "0"); } catch {}
    }
  }, [showDetails]);
  // arrastar para baixo (mobile) para fechar o painel de detalhes
  const [sheetDrag, setSheetDrag] = useState(0);
  const [sheetDragging, setSheetDragging] = useState(false);
  const dragStartY = useRef<number | null>(null);
  const onSheetPointerDown = (e: React.PointerEvent) => {
    if (typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches) return;
    dragStartY.current = e.clientY;
    setSheetDragging(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onSheetPointerMove = (e: React.PointerEvent) => {
    if (dragStartY.current === null) return;
    setSheetDrag(Math.max(0, e.clientY - dragStartY.current));
  };
  const onSheetPointerUp = () => {
    if (dragStartY.current === null) return;
    dragStartY.current = null;
    setSheetDragging(false);
    setSheetDrag((d) => {
      if (d > 110) setShowDetails(false);
      return 0;
    });
  };
  const INBOX_MIN = operationalMode ? 380 : 320;
  const INBOX_MAX = 520;
  const [inboxWidth, setInboxWidth] = useState<number>(() => {
    if (typeof window === "undefined") return operationalMode ? 410 : 340;
    const saved = Number(localStorage.getItem("conv:inboxWidth"));
    if (saved && saved >= INBOX_MIN && saved <= INBOX_MAX) return saved;
    return operationalMode ? 410 : 340;
  });
  useEffect(() => {
    try { localStorage.setItem("conv:inboxWidth", String(inboxWidth)); } catch {}
  }, [inboxWidth]);
  const gridRootRef = useRef<HTMLDivElement>(null);
  const resizingRef = useRef(false);
  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!resizingRef.current || !gridRootRef.current) return;
      const left = gridRootRef.current.getBoundingClientRect().left;
      const filterWidth = window.innerWidth >= 1280 ? 196 : 0;
      const w = Math.min(INBOX_MAX, Math.max(INBOX_MIN, e.clientX - left - filterWidth));
      setInboxWidth(w);
    }
    function onUp() {
      if (resizingRef.current) {
        resizingRef.current = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      }
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, []);
  const [replyTo, setReplyTo] = useState<Msg | null>(null);
  const [newConvOpen, setNewConvOpen] = useState(false);
  const [contactPickerOpen, setContactPickerOpen] = useState(false);
  const [notifMuted, setNotifMuted] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("conv:muted") === "1";
  });
  useEffect(() => {
    try { localStorage.setItem("conv:muted", notifMuted ? "1" : "0"); } catch {}
  }, [notifMuted]);
  const notifMutedRef = useRef(notifMuted);
  useEffect(() => { notifMutedRef.current = notifMuted; }, [notifMuted]);
  const [encaminharOpen, setEncaminharOpen] = useState(false);
  const [grupos, setGrupos] = useState<{ jid: string; nome: string | null; foto_url: string | null; participantes: number | null; ultima_em: string | null }[]>([]);
  const wppStatus = useWhatsappStatus(30000); // Frequência aumentada para 30s
  const threadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!companyId) return;
    void load(companyId);
    const ch = supabase
      .channel(`tenant:${companyId}:mensagens`)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "mensagens", filter: `company_id=eq.${companyId}` },
        (payload) => {
          const m = payload.new as Msg;
          setMsgs((p) => {
            // dedupe (evita duplicar o otimista quando o realtime chegar)
            if (p.some((x) => x.id === m.id)) return p;
            
            // Remove otimistas correspondentes
            const filtered = p.filter((x) => !(x.id.startsWith("tmp-") && x.numero === m.numero && x.texto === m.texto && x.direcao === m.direcao));
            
            // Adiciona a nova mensagem e re-ordena por created_at descendente para garantir o topo
            const updated = [m, ...filtered];
            return updated.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
          });
          if (m.direcao === "entrada" && m.numero !== activeRef.current) {
            try {
              if (!notifMutedRef.current && typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted" && document.visibilityState !== "visible") {
                new Notification(m.contato_nome ?? m.numero, { body: m.texto?.slice(0, 140) ?? "Nova mensagem", tag: m.numero });
              }
            } catch {}
          }
        },
      )
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "mensagens", filter: `company_id=eq.${companyId}` },
        (payload) => {
          const m = payload.new as Msg;
          setMsgs((p) => p.map((x) => (x.id === m.id ? { ...x, ...m } : x)));
        },
      )
      .on("postgres_changes",
        { event: "*", schema: "public", table: "contact_pause", filter: `company_id=eq.${companyId}` },
        () => { void loadPauses(companyId); },
      )
      .on("postgres_changes",
        { event: "*", schema: "public", table: "crm_cards", filter: `company_id=eq.${companyId}` },
        () => { void loadCards(companyId); }
      )
      .subscribe();


    // Polling de fallback (caso realtime falhe / esteja atrasado)
    const poll = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      void refreshRecent(companyId);
    }, 4000);

    return () => { supabase.removeChannel(ch); clearInterval(poll); };
  }, [companyId]);


  useEffect(() => {
    if (active) markRead(active);
    // rola pra última mensagem ao trocar de conversa / receber nova
    const scrollToBottom = () => {
      const el = threadRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    };
    requestAnimationFrame(() => {
      scrollToBottom();
      requestAnimationFrame(scrollToBottom);
      setTimeout(scrollToBottom, 60);
      setTimeout(scrollToBottom, 200);
      setTimeout(scrollToBottom, 500);
      setTimeout(scrollToBottom, 1000);
    });
    // Re-rola quando mídias (imagens/vídeos/áudios) terminam de carregar e alteram a altura
    const elThread = threadRef.current;
    if (elThread) {
      const media = elThread.querySelectorAll("img, video, audio");
      const onLoad = () => scrollToBottom();
      media.forEach((m) => {
        m.addEventListener("load", onLoad, { once: true });
        m.addEventListener("loadedmetadata", onLoad, { once: true });
      });
    }
    // Busca foto de perfil do WhatsApp se ainda não temos
    if (active && !cards[active]?.foto_url) {
      void (async () => {
        try {
          const { ensureSession } = await import("@/lib/ensure-session");
          await ensureSession();
          const r = await fetchProfilePicFn({ data: { numero: active } });
          if (r?.url) {
            setCards((p) => ({ ...p, [active]: { ...(p[active] ?? {} as any), foto_url: r.url } }));
          }
        } catch {}
      })();
    }
  }, [active, msgs.length]);

  // Histórico completo apenas da conversa aberta (sob demanda).
  const loadedThreads = useRef<Set<string>>(new Set());
  useEffect(() => {
    const cid = ctx?.company?.id;
    if (!active || !cid) return;
    if (loadedThreads.current.has(active)) return;
    loadedThreads.current.add(active);
    void (async () => {
      const { data } = await supabase
        .from("mensagens").select(MSG_COLS)
        .eq("company_id", cid).eq("numero", active)
        .order("created_at", { ascending: false })
        .limit(500);
      if (!data?.length) return;
      setMsgs((prev) => {
        const byId = new Map<string, Msg>();
        for (const m of prev) byId.set(m.id, m);
        for (const m of data as any[]) if (!byId.has(m.id)) byId.set(m.id, m as Msg);
        return Array.from(byId.values()).sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
      });
    })();
  }, [active, ctx?.company?.id]);





  useEffect(() => {
    try { localStorage.setItem("conv:filter", filter); } catch {}
  }, [filter]);

  const reloadQuickReplies = useCallback(async () => {
    try { setQuickReplies(await fetchQuickReplies()); } catch {}
  }, [fetchQuickReplies]);

  useEffect(() => {
    void (async () => {
      try { setTemplates(await fetchTemplates()); } catch {}
      try { setQuickReplies(await fetchQuickReplies()); } catch {}
    })();
    // eslint-disable-next-line
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && active) {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable) return;
        setActive(null);
        (document.activeElement as HTMLElement | null)?.blur();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active]);

  // Hide mobile bottom nav while a chat is open on mobile/tablet
  useEffect(() => {
    const apply = () => {
      const isMobileTablet = window.matchMedia("(max-width: 1023.98px)").matches;
      document.body.classList.toggle("chat-immersive", !!active && isMobileTablet);
    };
    apply();
    window.addEventListener("resize", apply);
    return () => {
      window.removeEventListener("resize", apply);
      document.body.classList.remove("chat-immersive");
    };
  }, [active]);

  async function loadPauses(cid: string) {
    const { data } = await supabase.from("contact_pause").select("numero,pausado").eq("company_id", cid);
    const map: Record<string, boolean> = {};
    (data ?? []).forEach((r: any) => { map[r.numero] = !!r.pausado; });
    setPauses(map);
    setPausesLoaded(true);
  }

  // PostgREST limita 1000 linhas por request. Buscamos em páginas para manter
  // TODO o histórico da conta disponível (sem cortar conversas antigas).
  const MSG_COLS =
    "id,numero,contato_nome,direcao,autor,texto,created_at,user_id,midia_url,midia_tipo,midia_mime,midia_nome,reacao,editado_em,whatsapp_message_id,reply_to_id,status_envio,provider";

  // Paginação por cursor (keyset): OFFSET profundo fazia o banco reler tudo a
  // cada página e era a principal causa da lentidão ao abrir Conversas.
  async function fetchAllMensagens(cid: string, max = 3000) {
    const PAGE = 1000;
    const all: any[] = [];
    let cursor: string | null = null;
    while (all.length < max) {
      let q = supabase
        .from("mensagens").select(MSG_COLS).eq("company_id", cid)
        .order("created_at", { ascending: false })
        .limit(Math.min(PAGE, max - all.length));
      if (cursor) q = q.lt("created_at", cursor);
      const { data, error } = await q;
      if (error || !data || data.length === 0) break;
      all.push(...data);
      cursor = (data[data.length - 1] as any).created_at;
      if (data.length < PAGE) break;
    }
    return all;
  }



  async function loadCards(cid: string) {
    const { data } = await supabase
      .from("crm_cards")
      .select("id,numero,nome,foto_url,owner_id,stage_id,canal_chat,department_id,transfer_para_user_id,transfer_de_user_id,transfer_status")

      .eq("company_id", cid);
    if (!data) return;
    setCards((prev) => {
      const map: Record<string, LeadCard> = { ...prev };
      (data as any[]).forEach((r: any) => { map[r.numero] = r; });
      return map;
    });
  }

  async function load(cid: string) {
    // Tags (cards/etapas/pausas) precisam chegar JUNTO com a primeira pintura
    // da lista — por isso disparam em paralelo com o recorte rápido.
    const metaPromise = Promise.all([
      supabase.from("crm_cards").select("id,numero,nome,foto_url,owner_id,stage_id,canal_chat,department_id,transfer_para_user_id,transfer_de_user_id,transfer_status").eq("company_id", cid),
      supabase.from("crm_stage").select("id,nome,cor,ordem,tipo,modo_atendimento").eq("company_id", cid).order("ordem", { ascending: true }),
      supabase.from("contact_pause").select("numero,pausado").eq("company_id", cid),
      supabase.from("company_user").select("user_id").eq("company_id", cid).eq("ativo", true),
      supabase.from("agent_config").select("company_id, avatar_traits, avatar_url, nome_agente").eq("company_id", cid).eq("tipo", "qualificacao"),
    ]);

    const [quick, [{ data: c }, { data: st }, { data: pz }, { data: cu }, { data: agents }]] = await Promise.all([
      fetchAllMensagens(cid, 300).catch(() => [] as any[]),
      metaPromise,
    ]);

    setCards((prev) => {
      const map: Record<string, LeadCard> = { ...prev };
      (c ?? []).forEach((r: any) => { map[r.numero] = r; });
      return map;
    });
    setStages((st ?? []) as any);
    const pmap: Record<string, boolean> = {};
    (pz ?? []).forEach((r: any) => { pmap[r.numero] = !!r.pausado; });
    setPauses(pmap);
    setPausesLoaded(true);
    if (quick?.length) setMsgs(quick as Msg[]);
    if (agents?.[0]) setAgentConfig({ avatar_traits: agents[0].avatar_traits, avatar_url: agents[0].avatar_url || undefined, nome_agente: agents[0].nome_agente });

    const ids = ((cu ?? []) as any[]).map((r) => r.user_id).filter(Boolean);
    let perfis: any[] = [];
    if (ids.length) {
      const { data: pf } = await supabase.from("team_profiles" as any).select("user_id,nome").in("user_id", ids);
      perfis = pf ?? [];
    }
    setMembers(ids.map((uid: string) => {
      const p = perfis.find((x) => x.user_id === uid);
      return { user_id: uid, nome: p?.nome ?? null, email: null };
    }));

    // Histórico completo entra depois, sem bloquear a primeira pintura.
    // Histórico COMPLETO da conta (sem corte por dias/quantidade) entra depois,
    // sem bloquear a primeira pintura.
    const m = await fetchAllMensagens(cid);
    if (m?.length) setMsgs(m as Msg[]);

  }


  async function runAction(numero: string, action: any) {
    try {
      await chatActionFn({ data: { numero, action } });
      toast.success("Ação concluída com sucesso");
      if (action === "excluir" || action === "excluir_local") {
        setMsgs(prev => prev.filter(m => m.numero !== numero));
        if (active === numero) setActive(null);
      }
    } catch (e: any) {
      toast.error(e.message || "Erro ao executar ação");
    }
  }

  async function refreshRecent(cid: string) {
    const [{ data }, { data: cds }] = await Promise.all([
      supabase
        .from("mensagens").select("id,numero,contato_nome,direcao,autor,texto,created_at,user_id,midia_url,midia_tipo,midia_mime,midia_nome,reacao,editado_em,whatsapp_message_id,reply_to_id,status_envio,provider").eq("company_id", cid)
        .order("created_at", { ascending: false })
        .limit(100),
      supabase.from("crm_cards").select("id,numero,nome,foto_url,owner_id,stage_id,canal_chat,department_id,transfer_para_user_id,transfer_de_user_id,transfer_status").eq("company_id", cid).order("ultima_em", { ascending: false, nullsFirst: false }).limit(400),
    ]);

    if (cds) {
      // MERGE (nunca substitui): substituir o mapa fazia as tags "piscarem"
      // e trocarem de valor nas conversas fora deste recorte.
      setCards((prev) => {
        const map: Record<string, LeadCard> = { ...prev };
        (cds as any[]).forEach((r: any) => { map[r.numero] = r; });
        return map;
      });
    }
    if (!data) return;
    setMsgs((prev) => {
      const byId = new Map<string, Msg>();
      // mantém otimistas (tmp-)
      for (const m of prev) if (m.id.startsWith("tmp-")) byId.set(m.id, m);
      for (const m of data as unknown as Msg[]) byId.set(m.id, m);
      // remove otimistas que já tem versão real
      for (const m of data as unknown as Msg[]) {
        for (const [k, v] of byId) {
          if (k.startsWith("tmp-") && v.numero === m.numero && v.texto === m.texto && v.direcao === m.direcao) {
            byId.delete(k);
          }
        }
      }
      // mescla com o resto que não estava nos recentes
      for (const m of prev) if (!m.id.startsWith("tmp-") && !byId.has(m.id)) byId.set(m.id, m);
      return Array.from(byId.values()).sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
    });
    // atualiza unread para mensagens de entrada em conversas não ativas
    for (const m of data as unknown as Msg[]) {
      if (m.direcao === "entrada" && m.numero !== active) {
        // noop; unread já é somado por realtime; polling não incrementa para não duplicar
      }
    }
  }


  const conversations = useMemo(() => {
    const map = new Map<string, { numero: string; nome: string | null; last: Msg }>();
    const cardByComparableNumber = new Map<string, LeadCard>();
    for (const card of Object.values(cards)) {
      const key = numeroComparable(card.numero);
      if (key) cardByComparableNumber.set(key, card);
    }
    for (const m of msgs) {
      const cur = map.get(m.numero);
      // sempre mantém a mensagem mais recente como "last" (independe da ordem do array)
      if (!cur || +new Date(m.created_at) > +new Date(cur.last.created_at)) {
        // O nome salvo no cadastro (inclusive pela planilha) prevalece sobre o
        // nome público recebido do WhatsApp.
        const grupo = isGrupo(m.numero) ? grupos.find((g) => g.jid === m.numero) : null;
        const savedCard = cards[m.numero] ?? cardByComparableNumber.get(numeroComparable(m.numero));
        map.set(m.numero, { numero: m.numero, nome: grupo?.nome ?? savedCard?.nome ?? m.contato_nome ?? cur?.nome ?? null, last: m });
      }
    }
    // Grupos sem histórico local ainda aparecem na aba Grupos.
    if (filter === "grupos") {
      for (const g of grupos) {
        if (map.has(g.jid)) continue;
        map.set(g.jid, {
          numero: g.jid,
          nome: g.nome,
          last: {
            id: `grupo-${g.jid}`,
            numero: g.jid,
            contato_nome: g.nome,
            direcao: "entrada",
            autor: "contato",
            texto: "",
            created_at: g.ultima_em ?? new Date(0).toISOString(),
          } as Msg,
        });
      }
    }

    let list = Array.from(map.values());

    const isAtendente = (ctx as any).membership?.role === "atendente";

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((c) => (c.nome ?? "").toLowerCase().includes(q) || c.numero.includes(q));
    }
    list = list.filter((c) => {
      const card = cards[c.numero];

      // Grupos ficam numa aba própria e são liberados para toda a equipe.
      if (isGrupo(c.numero)) return filter === "grupos";
      if (filter === "grupos") return false;

      // Restrição de visibilidade para Atendentes:
      // Só vê se for dono (owner_id === userId) OU se não tiver dono (!owner_id)
      // Convites pendentes também aparecem para quem recebeu.
      const convitePraMim =
        (card as any)?.transfer_status === "pendente" && (card as any)?.transfer_para_user_id === userId;
      if (isAtendente && !ctx.isSuperAdmin && !convitePraMim) {
        const ownerId = (card as any)?.owner_id;
        // No modo operacional o atendente só enxerga o que foi designado a ele.
        if (operationalMode ? ownerId !== userId : ownerId && ownerId !== userId) return false;
        // Se o atendente pertence a setores, não vê conversas de outros setores.
        const dep = (card as any)?.department_id as string | null | undefined;
        if (mySectorIds.length && dep && !mySectorIds.includes(dep)) return false;
      }

      if (sectorFilter && (card as any)?.department_id !== sectorFilter) return false;
      if (agentFilter && card?.owner_id !== agentFilter) return false;
      if (channelFilter) {
        const canal = getChannel(card, c.last);
        if (canal !== channelFilter) return false;
      }


      const iaAtiva = !(pauses[c.numero] ?? false);
      const tipo = card?.stage_id ? stages.find((s) => s.id === card.stage_id)?.tipo : null;
      const resolvida = tipo === "ganho" || tipo === "perda";
      switch (filter) {
        case "nao_lidas": return (unread[c.numero] ?? 0) > 0;
        case "minhas": return card?.owner_id === userId || ((card as any)?.transfer_status === "pendente" && (card as any)?.transfer_para_user_id === userId);
        case "sem_responsavel": return !card?.owner_id;
        case "ia_ativa": return iaAtiva && !resolvida;
        case "resolvidas": return resolvida;
        default: return true;
      }
    });
    // ordena SEMPRE pela última mensagem (mais recente no topo)
    return list.sort((a, b) => +new Date(b.last.created_at) - +new Date(a.last.created_at));
  }, [msgs, search, filter, sectorFilter, agentFilter, channelFilter, mySectorIds, unread, cards, pauses, stages, userId, ctx, grupos, operationalMode]);


  const thread = useMemo(() =>
    [...msgs].filter((m) => m.numero === active).sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at)),
    [msgs, active]);

  const activeGroup = active ? grupos.find((g) => g.jid === active) : undefined;
  const activeConv = conversations.find((c) => c.numero === active) ?? (active ? { numero: active, nome: activeGroup?.nome ?? cards[active]?.nome ?? null, last: thread[thread.length - 1] } : null);
  const activeCard = active ? cards[active] : undefined;
  // Grupos são abertos para toda a equipe: ninguém precisa assumir para responder.
  const activeIsGrupo = !!active && isGrupo(active);
  const activeStage = activeCard?.stage_id ? stages.find((s) => s.id === activeCard.stage_id) : null;
  // Empresa usa agente de IA? (alguma etapa em modo IA/auto com IA)
  const usaIa = useMemo(() => stages.some((s) => s.modo_atendimento === "ia"), [stages]);
  const activeTipo = activeStage?.tipo;
  const iaAtivaAqui = active ? !(pauses[active] ?? false) : true;
  // A etapa do lead define se o agente de IA realmente responde.
  const iaDaEtapa = activeStage?.modo_atendimento === "ia";
  const iaRespondeAqui = iaAtivaAqui && iaDaEtapa;
  const totalUnread = Object.values(unread).reduce((a, b) => a + b, 0);

  // Contadores por aba (sobre TODAS as conversas, sem aplicar o filtro atual)
  const tabCounts = useMemo(() => {
    const map = new Map<string, { numero: string; last: Msg }>();
    for (const m of msgs) if (!map.has(m.numero)) map.set(m.numero, { numero: m.numero, last: m });
    
    const isAtendente = (ctx as any).membership?.role === "atendente";

    const all = Array.from(map.values()).filter((c) => {
      const card = cards[c.numero];
      
      // Restrição de visibilidade para Atendentes no contador:
      const convitePraMim =
        (card as any)?.transfer_status === "pendente" && (card as any)?.transfer_para_user_id === userId;
      if (isAtendente && !ctx.isSuperAdmin && !convitePraMim && !isGrupo(c.numero)) {
        const ownerId = (card as any)?.owner_id;
        if (operationalMode ? ownerId !== userId : ownerId && ownerId !== userId) return false;
        const dep = (card as any)?.department_id as string | null | undefined;
        if (mySectorIds.length && dep && !mySectorIds.includes(dep)) return false;
      }

      if (sectorFilter && (card as any)?.department_id !== sectorFilter) return false;


      if (!search.trim()) return true;
      const q = search.toLowerCase();
      const nome = cards[c.numero]?.nome ?? c.last.contato_nome ?? "";
      return nome.toLowerCase().includes(q) || c.numero.includes(q);
    });
    const groupJids = new Set([...grupos.map((g) => g.jid), ...all.filter((x) => isGrupo(x.numero)).map((x) => x.numero)]);
    const c: Record<Filter, number> = { todas: all.filter((x) => !isGrupo(x.numero)).length, nao_lidas: 0, minhas: 0, grupos: groupJids.size, sem_responsavel: 0, ia_ativa: 0, resolvidas: 0 };
    for (const it of all) {
      const card = cards[it.numero];
      const iaAtiva = !(pauses[it.numero] ?? false);
      const tipo = card?.stage_id ? stages.find((s) => s.id === card.stage_id)?.tipo : null;
      const resolvida = tipo === "ganho" || tipo === "perda";
      // Grupos têm aba própria: não entram no contador de "Não lidas".
      if (isGrupo(it.numero)) continue;
      if ((unread[it.numero] ?? 0) > 0) c.nao_lidas++;
      if (card?.owner_id === userId || ((card as any)?.transfer_status === "pendente" && (card as any)?.transfer_para_user_id === userId)) c.minhas++;
      if (!card?.owner_id) c.sem_responsavel++;
      if (iaAtiva && !resolvida) c.ia_ativa++;
      if (resolvida) c.resolvidas++;
    }
    return c;
  }, [msgs, search, sectorFilter, mySectorIds, unread, cards, pauses, stages, userId, ctx, grupos, operationalMode]);

  const channelCounts = useMemo(() => {
    const map = new Map<string, { numero: string; last: Msg }>();
    for (const m of msgs) if (!map.has(m.numero)) map.set(m.numero, { numero: m.numero, last: m });
    const counts = { todos: 0, whatsapp: 0, instagram: 0, messenger: 0 };
    for (const c of map.values()) {
      if (isGrupo(c.numero)) continue;
      const card = cards[c.numero];
      const canal = getChannel(card, c.last);
      counts.todos++;
      if (canal === "instagram") counts.instagram++;
      else if (canal === "messenger") counts.messenger++;
      else counts.whatsapp++;
    }
    return counts;
  }, [msgs, cards]);


  useEffect(() => {
    function onKey(ev: KeyboardEvent) {
      const t = ev.target as HTMLElement | null;
      const typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || (t as any).isContentEditable);
      if (ev.key === "/" && t === composerRef.current && (composerRef.current?.value ?? "") === "") {
        ev.preventDefault();
        setShowTemplatePicker(true);
        return;
      }
      if (ev.key === "Escape") setShowTemplatePicker(false);
      if (typing) return;
      if (ev.key === "j" || ev.key === "k") {
        ev.preventDefault();
        const idx = conversations.findIndex((c) => c.numero === active);
        const next = ev.key === "j" ? Math.min(conversations.length - 1, idx + 1) : Math.max(0, idx - 1);
        const target = conversations[next];
        if (target) setActive(target.numero);
      } else if (ev.key === "r" && active) {
        ev.preventDefault();
        composerRef.current?.focus();
      } else if (ev.key === "e" && active) {
        ev.preventDefault();
        void toggleIa(false);
      } else if (ev.key === "/") {
        ev.preventDefault();
        composerRef.current?.focus();
        setShowTemplatePicker(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line
  }, [active, conversations.length]);

  // Carrega a lista completa desde o início para manter o contador correto.
  useEffect(() => {
    if (!gruposAtivos) { setGrupos([]); return; }
    void listarGruposFn()
      .then((g: any) => setGrupos(Array.isArray(g) ? g : []))
      .catch(() => {});
  }, [listarGruposFn, gruposAtivos]);

  const convitePendente =
    activeCard && (activeCard as any).transfer_status === "pendente" && (activeCard as any).transfer_para_user_id === userId;

  async function responderConvite(aceitar: boolean) {
    if (!active) return;
    try {
      await responderTransferenciaFn({ data: { numero: active, aceitar } });
      setCards((c) =>
        c[active]
          ? {
              ...c,
              [active]: {
                ...c[active],
                transfer_status: null,
                transfer_para_user_id: null,
                ...(aceitar ? { owner_id: userId } : {}),
              } as any,
            }
          : c,
      );
      toast.success(aceitar ? "Você assumiu este atendimento." : "Atendimento recusado.");
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível responder ao convite.");
    }
  }

  async function toggleIa(v: boolean) {
    if (!active || isGrupo(active)) return;
    setPauses((p) => ({ ...p, [active]: !v }));
    try { await toggleIaFn({ data: { numero: active, ativa: v } }); }
    catch (e: any) { toast.error(e?.message); setPauses((p) => ({ ...p, [active]: v })); }
  }

  async function assumir() {
    if (!active) return;
    await toggleIa(false);
    if (companyId && userId) {
      const { error } = await supabase
        .from("crm_cards")
        .update({ owner_id: userId } as any)
        .eq("company_id", companyId)
        .eq("numero", active);
      if (error) console.warn("assumir owner update:", error.message);
      setCards((c) => c[active] ? { ...c, [active]: { ...c[active], owner_id: userId } as any } : c);
    }
    toast.success("Ticket aberto. Você assumiu este atendimento.");
  }


  async function finalizar(manterDono = true) {
    if (!active || !companyId) return;
    const numero = active;
    const nome = activeConv?.nome ?? null;
    
    // Se não for manter o dono, setamos owner_id como null
    const updatePayload: any = {};
    if (!manterDono) {
      updatePayload.owner_id = null;
    }

    const { error } = await supabase
      .from("crm_cards")
      .update(updatePayload)
      .eq("company_id", companyId)
      .eq("numero", numero);

    if (error) { toast.error(error.message); return; }
    
    if (!manterDono) {
      setCards((c) => c[numero] ? { ...c, [numero]: { ...c[numero], owner_id: null } as any } : c);
      // Encerrar o ticket NÃO reativa a IA — ela só volta pela etapa (modo IA) ou pelo botão.
    }

    // Move o lead conforme a configuração (independe da pesquisa estar ativa)
    try { await moveDestinoFn({ data: { numero } }); } catch (e: any) { console.warn("move destino failed:", e?.message); }
    
    setFinalizarDialogOpen(false);

    if (csatAtivo && (operationalMode ? csatAoFinalizar : (csatFormato !== "chat" || csatAoFinalizar))) {
      try {
        const result: any = await sendCsatFn({ data: { numero, contatoNome: nome } });
        if (result?.ok === false) {
          toast.warning(result.message || "Ticket finalizado, mas a pesquisa não foi enviada.");
        } else {
          toast.success("Ticket finalizado. Pesquisa de satisfação enviada.");
        }
      } catch (e: any) {
        toast.success("Ticket finalizado.");
        console.warn("csat send failed:", e?.message);
      }
    } else {
      toast.success("Ticket finalizado.");
    }
  }

  async function finalizarComRelatorio(manterDono: boolean) {
    if (!active || !relatorio.solicitacao.trim()) return toast.error("Informe a solicitação do cliente.");
    setRelatorioLoading(true);
    try {
      await salvarRelatorioFn({ data: {
        numero: active, contatoNome: activeConv?.nome, solicitacao: relatorio.solicitacao,
        resolucao: relatorio.resolucao, situacao: relatorio.situacao,
        pendenteCom: relatorio.pendenteCom || null, aiSugerido: relatorio.aiSugerido,
      } });
      await finalizar(manterDono);
      setRelatorio({ solicitacao: "", resolucao: "", situacao: "pendente", pendenteCom: "", aiSugerido: false });
    } catch (e: any) { toast.error(e?.message ?? "Não foi possível concluir o relatório."); }
    finally { setRelatorioLoading(false); }
  }

  async function sendMsg(text?: string) {
    const txt = (text ?? composer).trim();
    if (!txt || !active || !companyId) return;
    const currentReply = replyTo;
    setSending(true);
    const tmpId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const optimistic: Msg = {
      id: tmpId, numero: active, contato_nome: activeConv?.nome ?? null,
      direcao: "saida", autor: "humano", texto: txt,
      created_at: new Date().toISOString(), user_id: userId,
      reply_to_id: currentReply?.id ?? null,
    };
    setMsgs((p) => [optimistic, ...p].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at)));
    setComposer("");
    setReplyTo(null);
    try {
      if (isGrupo(active)) {
        await enviarGrupoFn({ data: { jid: active, texto: txt } });
        if (companyId) void refreshRecent(companyId);
      } else {
        const result = await sendFn({ data: { numero: active, texto: txt, contatoNome: activeConv?.nome ?? null, replyToMessageId: currentReply?.id ?? null } });
        if (companyId) void refreshRecent(companyId);
        if (!result.ok) toast.error(result.error ?? "A mensagem não foi enviada.");
      }
    } catch (e: any) {
      setMsgs((p) => p.filter((m) => m.id !== tmpId));
      setComposer(txt);
      setReplyTo(currentReply);
      toast.error(e?.message ?? "Falha ao enviar");
    } finally {
      setSending(false);
    }
  }

  /** Mostra a mídia na conversa imediatamente (antes do upload terminar). */
  function addLocalMedia(url: string, tipo: string, mime?: string | null) {
    const tmpId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const optimistic = {
      id: tmpId, numero: active, contato_nome: activeConv?.nome ?? null,
      direcao: "saida", autor: "humano", texto: null,
      created_at: new Date().toISOString(), user_id: userId,
      midia_url: url, midia_tipo: tipo, midia_mime: mime ?? null,
    } as unknown as Msg;
    setMsgs((p) => [optimistic, ...p].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at)));
    return tmpId;
  }

  function removeLocalMsg(id: string) {
    setMsgs((p) => p.filter((m) => m.id !== id));
  }

  async function syncHistory() {
    if (!active) return;
    setSyncing(true);
    try {
      const res = await syncHistoryFn({ data: { numero: active } });
      if (res.ok) {
        toast.success(`${res.synced} mensagens recuperadas com sucesso.`);
        if (companyId) {
          await load(companyId);
          await refreshRecent(companyId);
        }
      }
    } catch (e: any) {
      toast.error(e.message || "Erro ao sincronizar histórico");
    } finally {
      setSyncing(false);
    }
  }

  async function handleSyncMeta() {
    const metaInsts = instances.filter(
      (instance) => instance.provider === "meta_messenger" || instance.provider === "meta_instagram",
    );
    if (metaInsts.length === 0) {
      toast.error("Nenhuma conta Meta conectada.");
      return;
    }
    setSyncingMeta(true);
    try {
      let totalMsgs = 0;
      const failures: string[] = [];
      for (const instance of metaInsts) {
        try {
          const response = await syncMetaFn({
            data: { instanceName: instance.instance_name, full: false },
          });
          totalMsgs += Number(response?.result?.messages ?? 0);
          const errors = Array.isArray(response?.result?.errors) ? response.result.errors : [];
          if (errors.length > 0) {
            failures.push(
              `${instance.display_name || instance.instance_name}: ${errors.join(" | ")}`,
            );
          }
        } catch (error) {
          failures.push(
            `${instance.display_name || instance.instance_name}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }
      // Atualiza nomes e fotos de perfis genéricos (Instagram XXXX, Messenger XXXX)
      let backfilled = 0;
      try {
        const bf = await backfillMetaFn();
        backfilled = Number(bf?.updated ?? 0);
      } catch (bfErr) {
        console.warn("[handleSyncMeta] Erro no backfill de perfis:", bfErr);
      }

      if (companyId) {
        await load(companyId);
        await refreshRecent(companyId);
        await loadCards(companyId);
      }
      if (failures.length > 0) {
        toast.error(`Falhas na sincronização:\n${failures.join("\n")}`, {
          duration: 15_000,
        });
      } else {
        const details: string[] = [];
        if (totalMsgs > 0) details.push(`${totalMsgs} mensagens`);
        if (backfilled > 0) details.push(`${backfilled} perfis atualizados`);
        toast.success(
          details.length > 0
            ? `Sincronização concluída: ${details.join(" e ")}.`
            : "Sincronização concluída. Nenhuma nova alteração encontrada.",
        );
      }
    } finally {
      setSyncingMeta(false);
    }
  }



  return (
    <div className="inbox-workspace w-full h-full lg:p-4 xl:p-5">
      <div
        ref={gridRootRef}
        data-inbox-root
        className="grid h-full min-h-0 grid-cols-1 lg:gap-3 lg:grid-cols-[196px_var(--inbox-w)_minmax(0,1fr)]"
        style={{
          ["--inbox-w" as any]: `${inboxWidth}px`,
          gridTemplateColumns: typeof window !== "undefined" && window.innerWidth >= 1024
            ? (showDetails && active ? `${window.innerWidth >= 1280 ? "196px " : ""}${inboxWidth}px minmax(0,1fr) 280px` : `${window.innerWidth >= 1280 ? "196px " : ""}${inboxWidth}px minmax(0,1fr)`)
            : undefined,
        }}
      >

        <nav aria-label="Pastas de conversas" className="inbox-panel hidden xl:flex flex-col p-3 min-h-0">
          <div className="px-2 pt-3 pb-5 border-b border-border">
            <h2 className="text-base font-extrabold text-foreground">Mensagens</h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">Caixas de entrada</p>
          </div>
          <div className="flex-1 overflow-y-auto py-4 space-y-1">
            {(Object.keys(FILTER_LABELS) as Filter[])
              .filter((key) => !(isAtendenteUser && (key === "todas" || key === "sem_responsavel")) && !(key === "grupos" && !gruposAtivos))
              .map((key) => {
                const activeFilter = filter === key;
                const FilterIcon = key === "nao_lidas" ? Bell : key === "minhas" ? UserRound : key === "grupos" ? Users : key === "ia_ativa" ? Bot : key === "resolvidas" ? CheckCircle2 : key === "sem_responsavel" ? UserPlus : Inbox;
                return (
                  <Button key={key} variant="ghost" onClick={() => setFilter(key)} aria-current={activeFilter ? "page" : undefined}
                    className={`w-full h-auto min-h-10 justify-start gap-2 rounded-xl px-2.5 py-2 text-left text-[11px] font-semibold whitespace-normal leading-tight ${activeFilter ? "bg-accent text-primary hover:bg-accent" : "text-muted-foreground hover:text-foreground"}`}>
                    <FilterIcon className="size-4 shrink-0" strokeWidth={1.8} />
                    <span className="min-w-0 flex-1">{FILTER_LABELS[key]}</span>
                    {(tabCounts[key] ?? 0) > 0 && <span className={`min-w-5 rounded-full px-1 text-center text-[10px] ${activeFilter ? "bg-card text-primary" : "bg-muted text-muted-foreground"}`}>{tabCounts[key]}</span>}
                  </Button>
                );
              })}
          </div>
          <div className="border-t border-border px-2 py-3 text-[11px] text-muted-foreground">{conversations.length} conversas</div>
        </nav>

        {/* ============ LEFT — INBOX ============ */}
        <aside className={`inbox-panel ${active ? "hidden lg:flex" : "flex"} relative flex-col min-h-0`}>
          <div
            onMouseDown={(e) => { e.preventDefault(); resizingRef.current = true; document.body.style.cursor = "col-resize"; document.body.style.userSelect = "none"; }}
            onDoubleClick={() => setInboxWidth(operationalMode ? 410 : 340)}
            title="Arraste para redimensionar (duplo clique para redefinir)"
            className="hidden lg:block absolute top-0 right-0 h-full w-1.5 -mr-[3px] cursor-col-resize z-20 hover:bg-[color:var(--brand)]/30 active:bg-[color:var(--brand)]/50 transition-colors"
          />
           <div className="px-5 pt-5 pb-3 flex items-center justify-between gap-2">
             <div className="min-w-0"><h2 className="font-display text-[19px] font-extrabold text-foreground">Conversas</h2><p className="text-xs text-muted-foreground truncate">{FILTER_LABELS[filter]}</p></div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setNewConvOpen(true)}
                title="Nova conversa"
                aria-label="Nova conversa"
                className="inline-flex items-center justify-center size-8 rounded-xl bg-[color:var(--brand)] text-primary-foreground shadow-sm hover:opacity-90 transition"
              >
                <Plus className="size-4" />
              </button>

              <button
                type="button"
                onClick={() => setContactPickerOpen(true)}
                title="Iniciar conversa com contato salvo"
                aria-label="Iniciar conversa com contato salvo"
                className="inline-flex items-center justify-center size-8 rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <ContactIcon className="size-4" />
              </button>



              <Popover open={filterOpen} onOpenChange={setFilterOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    title="Filtrar conversas"
                    aria-label="Filtrar conversas"
                    className={`relative inline-flex items-center justify-center size-8 rounded-xl transition-colors ${
                      filter !== baseFilter
                        ? "bg-[color:var(--brand)]/10 text-[color:var(--brand)]"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    <FunnelIcon className="size-4" />
                    {filter !== baseFilter && (
                      <span className="absolute top-1 right-1 size-1.5 rounded-full bg-[color:var(--brand)]" />
                    )}
                  </button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-56 p-1.5 rounded-xl">
                  <p className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Filtrar por
                  </p>
                   {(Object.keys(FILTER_LABELS) as Filter[])
                    .filter((k) => !(isAtendenteUser && (k === "todas" || k === "sem_responsavel")) && !(k === "grupos" && !gruposAtivos))
                    .map((k) => {
                    const on = filter === k;
                    const count = tabCounts[k] ?? 0;
                    return (
                      <button
                        key={k}
                        type="button"
                        onClick={() => { setFilter(k); setFilterOpen(false); }}
                        className={`w-full flex items-center gap-2 px-2 py-2 rounded-lg text-[13px] font-medium transition-colors ${
                          on ? "bg-[color:var(--brand)]/10 text-[color:var(--brand)]" : "hover:bg-muted text-foreground"
                        }`}
                      >
                        <Check className={`size-3.5 shrink-0 ${on ? "opacity-100" : "opacity-0"}`} />
                        <span className="flex-1 text-left truncate">{FILTER_LABELS[k]}</span>
                        {count > 0 && (
                          <span className={`inline-flex items-center justify-center min-w-[20px] h-[18px] px-1.5 rounded-full text-[10px] font-bold ${
                            on ? "bg-[color:var(--brand)] text-primary-foreground" : "bg-muted text-muted-foreground"
                          }`}>
                            {count > 999 ? "999+" : count}
                          </span>
                        )}
                      </button>
                    );
                  })}

                  {sectors.length > 0 && (
                    <>
                      <div className="my-1 h-px bg-[color:var(--hairline)]" />
                      <p className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Setor
                      </p>
                      <button
                        type="button"
                        onClick={() => { setSectorFilter(null); setFilterOpen(false); }}
                        className={`w-full flex items-center gap-2 px-2 py-2 rounded-lg text-[13px] font-medium transition-colors ${
                          !sectorFilter ? "bg-[color:var(--brand)]/10 text-[color:var(--brand)]" : "hover:bg-muted text-foreground"
                        }`}
                      >
                        <Check className={`size-3.5 shrink-0 ${!sectorFilter ? "opacity-100" : "opacity-0"}`} />
                        <span className="flex-1 text-left truncate">Todos os setores</span>
                      </button>
                      {sectors.map((s) => {
                        const on = sectorFilter === s.id;
                        return (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => { setSectorFilter(s.id); setFilterOpen(false); }}
                            className={`w-full flex items-center gap-2 px-2 py-2 rounded-lg text-[13px] font-medium transition-colors ${
                              on ? "bg-[color:var(--brand)]/10 text-[color:var(--brand)]" : "hover:bg-muted text-foreground"
                            }`}
                          >
                            <Check className={`size-3.5 shrink-0 ${on ? "opacity-100" : "opacity-0"}`} />
                            <span
                              className="size-2 rounded-full shrink-0"
                              style={{ background: s.cor || "var(--brand)" }}
                            />
                            <span className="flex-1 text-left truncate">{s.nome}</span>
                          </button>
                        );
                      })}
                    </>
                  )}
                  {operationalMode && !isAtendenteUser && members.length > 0 && (
                    <>
                      <div className="my-1 h-px bg-[color:var(--hairline)]" />
                      <p className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Atendente</p>
                      <button type="button" onClick={() => { setAgentFilter(null); setFilterOpen(false); }} className={`w-full flex items-center gap-2 px-2 py-2 rounded-lg text-[13px] ${!agentFilter ? "bg-[color:var(--brand)]/10 text-[color:var(--brand)]" : "hover:bg-muted"}`}>
                        <Check className={`size-3.5 ${!agentFilter ? "opacity-100" : "opacity-0"}`} /> Todos os atendentes
                      </button>
                      {members.map((member) => (
                        <button key={member.user_id} type="button" onClick={() => { setAgentFilter(member.user_id); setFilterOpen(false); }} className={`w-full flex items-center gap-2 px-2 py-2 rounded-lg text-[13px] ${agentFilter === member.user_id ? "bg-[color:var(--brand)]/10 text-[color:var(--brand)]" : "hover:bg-muted"}`}>
                          <Check className={`size-3.5 ${agentFilter === member.user_id ? "opacity-100" : "opacity-0"}`} /><span className="truncate">{member.nome || member.email || "Usuário"}</span>
                        </button>
                      ))}
                    </>
                  )}

                  <div className="my-1 h-px bg-[color:var(--hairline)]" />
                  <p className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Canal / Aplicativo
                  </p>
                  <button
                    type="button"
                    onClick={() => { setChannelFilter(null); setFilterOpen(false); }}
                    className={`w-full flex items-center gap-2 px-2 py-2 rounded-lg text-[13px] font-medium transition-colors ${
                      !channelFilter ? "bg-[color:var(--brand)]/10 text-[color:var(--brand)]" : "hover:bg-muted text-foreground"
                    }`}
                  >
                    <Check className={`size-3.5 shrink-0 ${!channelFilter ? "opacity-100" : "opacity-0"}`} />
                    <span className="flex-1 text-left truncate">Todos os canais</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => { setChannelFilter("whatsapp"); setFilterOpen(false); }}
                    className={`w-full flex items-center gap-2 px-2 py-2 rounded-lg text-[13px] font-medium transition-colors ${
                      channelFilter === "whatsapp" ? "bg-[color:var(--brand)]/10 text-[color:var(--brand)]" : "hover:bg-muted text-foreground"
                    }`}
                  >
                    <Check className={`size-3.5 shrink-0 ${channelFilter === "whatsapp" ? "opacity-100" : "opacity-0"}`} />
                    <WhatsAppGlyph className="size-4 shrink-0 text-[#25D366]" />
                    <span className="flex-1 text-left truncate">WhatsApp</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => { setChannelFilter("instagram"); setFilterOpen(false); }}
                    className={`w-full flex items-center gap-2 px-2 py-2 rounded-lg text-[13px] font-medium transition-colors ${
                      channelFilter === "instagram" ? "bg-[color:var(--brand)]/10 text-[color:var(--brand)]" : "hover:bg-muted text-foreground"
                    }`}
                  >
                    <Check className={`size-3.5 shrink-0 ${channelFilter === "instagram" ? "opacity-100" : "opacity-0"}`} />
                    <InstagramGlyph className="size-4 shrink-0 text-[#E4405F]" />
                    <span className="flex-1 text-left truncate">Instagram Direct</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => { setChannelFilter("messenger"); setFilterOpen(false); }}
                    className={`w-full flex items-center gap-2 px-2 py-2 rounded-lg text-[13px] font-medium transition-colors ${
                      channelFilter === "messenger" ? "bg-[color:var(--brand)]/10 text-[color:var(--brand)]" : "hover:bg-muted text-foreground"
                    }`}
                  >
                    <Check className={`size-3.5 shrink-0 ${channelFilter === "messenger" ? "opacity-100" : "opacity-0"}`} />
                    <MessengerGlyph className="size-4 shrink-0 text-[#0084FF]" />
                    <span className="flex-1 text-left truncate">Facebook Messenger</span>
                  </button>
                </PopoverContent>

              </Popover>

              <button
                type="button"
                onClick={() => {
                  const next = !notifMuted;
                  setNotifMuted(next);
                  toast.success(next ? "Notificações silenciadas" : "Notificações ativadas");
                  if (!next && typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
                    void Notification.requestPermission();
                  }
                }}
                title={notifMuted ? "Notificações silenciadas" : "Silenciar notificações"}
                aria-label={notifMuted ? "Ativar notificações" : "Silenciar notificações"}
                className={`inline-flex items-center justify-center size-8 rounded-xl transition-colors ${
                  notifMuted ? "text-red-500 bg-red-50" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {notifMuted ? <BellOff className="size-4" /> : <Bell className="size-4" />}
              </button>
            </div>

          </div>

          {/* Status dos Canais — dinâmico multicanal */}
          <div className="px-4 sm:px-5 pb-2">
            <div className="flex flex-wrap items-center gap-2.5 text-[11px] font-medium text-muted-foreground">
              {/* WhatsApp */}
              <div className="inline-flex items-center gap-1.5" title="Status do WhatsApp">
                {wppStatus === "connected" ? (
                  <><span className="size-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" /> <WhatsAppGlyph className="size-3 text-[#25D366]" /> <span className="text-foreground">WhatsApp</span></>
                ) : wppStatus === "connecting" ? (
                  <><span className="size-2 rounded-full bg-amber-500 animate-pulse" /> <WhatsAppGlyph className="size-3 text-[#25D366]" /> <span>Conectando…</span></>
                ) : (
                  <><span className="size-2 rounded-full bg-amber-500/70" /> <WhatsAppGlyph className="size-3 text-muted-foreground" /> <span>WhatsApp pendente</span></>
                )}
              </div>

              {/* Instagram */}
              {instances.filter(i => i.provider === "meta_instagram").map(inst => (
                <div key={inst.id} className="inline-flex items-center gap-1.5 pl-2.5 border-l border-[color:var(--hairline)]" title={`Instagram: ${inst.display_name || inst.instance_name}`}>
                  <span className={`size-2 rounded-full ${inst.status === "connected" ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-amber-500"}`} />
                  <InstagramGlyph className="size-3 text-[#E4405F]" />
                  <span className="text-foreground">{inst.display_name || "Instagram"}</span>
                </div>
              ))}

              {/* Messenger */}
              {instances.filter(i => i.provider === "meta_messenger").map(inst => (
                <div key={inst.id} className="inline-flex items-center gap-1.5 pl-2.5 border-l border-[color:var(--hairline)]" title={`Facebook Messenger: ${inst.display_name || inst.instance_name}`}>
                  <span className={`size-2 rounded-full ${inst.status === "connected" ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-amber-500"}`} />
                  <MessengerGlyph className="size-3 text-[#0084FF]" />
                  <span className="text-foreground">{inst.display_name || "Messenger"}</span>
                </div>
              ))}

              {/* Botão Sincronizar Meta */}
              {instances.some(i => i.provider?.startsWith("meta_")) && (
                <button
                  type="button"
                  onClick={handleSyncMeta}
                  disabled={syncingMeta}
                  className="inline-flex items-center gap-1 ml-auto px-2 py-0.5 text-[10.5px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 rounded-md border border-[color:var(--hairline)] transition-colors disabled:opacity-50"
                  title="Sincronizar conversas recentes do Messenger e Instagram"
                >
                  <RefreshCw className={`size-2.5 ${syncingMeta ? "animate-spin text-primary" : ""}`} />
                  <span>{syncingMeta ? "Sincronizando…" : "Sincronizar Meta"}</span>
                </button>
              )}
            </div>
          </div>

          <div className="px-4 pb-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <Input
                placeholder="Buscar conversas..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-10 rounded-xl bg-muted/60 border-transparent focus-visible:border-[color:var(--hairline)] text-[12.5px]"
              />
            </div>

            {/* Abas de Canais Rápidas (Todos, WhatsApp, Instagram, Messenger) */}
            <div className="mt-2.5 flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
              <button
                type="button"
                onClick={() => setChannelFilter(null)}
                className={`inline-flex h-7 shrink-0 items-center gap-1.5 px-2.5 text-[11px] font-medium rounded-lg transition-all ${
                  !channelFilter
                    ? "bg-primary text-primary-foreground shadow-sm font-semibold"
                    : "bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <span>Todos</span>
                <span className="text-[10px] opacity-75 font-semibold">({channelCounts.todos})</span>
              </button>

              <button
                type="button"
                onClick={() => setChannelFilter("whatsapp")}
                className={`inline-flex h-7 shrink-0 items-center gap-1.5 px-2.5 text-[11px] font-medium rounded-lg transition-all ${
                  channelFilter === "whatsapp"
                    ? "bg-[#25D366] text-white shadow-sm font-semibold"
                    : "bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <WhatsAppGlyph className="size-3 shrink-0" />
                <span>WhatsApp</span>
                <span className="text-[10px] opacity-75 font-semibold">({channelCounts.whatsapp})</span>
              </button>

              <button
                type="button"
                onClick={() => setChannelFilter("instagram")}
                className={`inline-flex h-7 shrink-0 items-center gap-1.5 px-2.5 text-[11px] font-medium rounded-lg transition-all ${
                  channelFilter === "instagram"
                    ? "bg-gradient-to-r from-[#833AB4] via-[#FD1D1D] to-[#F77737] text-white shadow-sm font-semibold"
                    : "bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <InstagramGlyph className="size-3 shrink-0" />
                <span>Instagram</span>
                <span className="text-[10px] opacity-75 font-semibold">({channelCounts.instagram})</span>
              </button>

              <button
                type="button"
                onClick={() => setChannelFilter("messenger")}
                className={`inline-flex h-7 shrink-0 items-center gap-1.5 px-2.5 text-[11px] font-medium rounded-lg transition-all ${
                  channelFilter === "messenger"
                    ? "bg-[#0084FF] text-white shadow-sm font-semibold"
                    : "bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <MessengerGlyph className="size-3 shrink-0" />
                <span>Messenger</span>
                <span className="text-[10px] opacity-75 font-semibold">({channelCounts.messenger})</span>
              </button>
            </div>

            {/* Filtros rápidos do dia a dia */}
             <div className="mt-2.5 flex flex-nowrap items-center gap-1 overflow-x-auto pb-0.5 xl:hidden">
              {(isAtendenteUser ? QUICK_FILTERS_ATENDENTE : QUICK_FILTERS).filter((qf) => !(qf.key === "grupos" && !gruposAtivos)).map((qf) => {
                const active = filter === qf.key;
                const count = tabCounts[qf.key] ?? 0;
                return (
                  <button
                    key={qf.key}
                    type="button"
                    onClick={() => setFilter(qf.key)}
                    className={`inline-flex h-7 shrink-0 items-center gap-1 px-2.5 text-[10.5px] font-semibold whitespace-nowrap rounded-full transition-colors ${
                      active
                        ? "bg-[color:var(--brand)] text-primary-foreground shadow-sm"
                        : "bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    {qf.label}
                    <span className={`text-[10px] font-bold tabular-nums ${active ? "opacity-90" : "opacity-60"}`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {sectorFilter && (
              <button
                type="button"
                onClick={() => setSectorFilter(null)}
                className="mt-2 mr-2 inline-flex items-center gap-1.5 h-6 pl-2.5 pr-1.5 rounded-full bg-muted text-foreground text-[11px] font-semibold"
              >
                {sectors.find((s) => s.id === sectorFilter)?.nome ?? "Setor"}
                <X className="size-3" />
              </button>
            )}
            {agentFilter && (
              <button type="button" onClick={() => setAgentFilter(null)} className="mt-2 inline-flex items-center gap-1.5 h-6 pl-2.5 pr-1.5 rounded-full bg-muted text-foreground text-[11px] font-semibold">
                {members.find((m) => m.user_id === agentFilter)?.nome ?? "Atendente"}<X className="size-3" />
              </button>
            )}

            {filter !== baseFilter && !QUICK_FILTERS.some((qf) => qf.key === filter) && (
              <button
                type="button"
                onClick={() => setFilter(baseFilter)}
                className="mt-2 inline-flex items-center gap-1.5 h-6 pl-2.5 pr-1.5 rounded-full bg-[color:var(--brand)]/10 text-[color:var(--brand)] text-[11px] font-semibold"
              >
                {FILTER_LABELS[filter]}
                <X className="size-3" />
              </button>
            )}
          </div>





          <ul className="flex-1 overflow-auto pb-[calc(5.5rem+env(safe-area-inset-bottom))] lg:pb-0">
            {conversations.length === 0 && (
              <li className="p-8 text-sm text-muted-foreground text-center">Nenhuma conversa neste filtro.</li>
            )}
            {conversations.map((c) => {
              const conversaEhGrupo = isGrupo(c.numero);
              const grupo = conversaEhGrupo ? grupos.find((g) => g.jid === c.numero) : undefined;
              const on = c.numero === active;
              const u = unread[c.numero] ?? 0;
              const iaAtiva = !(pauses[c.numero] ?? false);
              const card = cards[c.numero];
              const conversationSector = operationalManager && card?.department_id
                ? sectors.find((sector) => sector.id === card.department_id)
                : undefined;
              const stage = card?.stage_id ? stages.find((s) => s.id === card.stage_id) : null;
              const isMine = card?.owner_id === userId;
              // Precisa de atendimento humano:
              // - última mensagem é do contato (não respondida), ou
              // - há mensagens não lidas, ou
              // - a IA foi desligada/transferiu e ninguém assumiu o ticket
              // Só faz sentido falar em "qualificado pela IA" se a empresa
              // realmente usa IA em alguma etapa. Operações 100% manuais
              // (ex.: atendimento por setores) nunca veem essa tag.
              const transferidaPelaIa = usaIa && !iaAtiva && !card?.owner_id;
              const precisaAtender = !on && u > 0;
              return (
                <li key={c.numero}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setActive(c.numero)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setActive(c.numero);
                      }
                    }}
                   className={`relative w-full text-left flex gap-3 px-3 sm:px-4 py-3 sm:py-3.5 border-b border-border/70 transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
                      on
                         ? "bg-accent/80"
                        : precisaAtender
                           ? "bg-card hover:bg-muted"
                          : "hover:bg-[color:var(--panel-2)]"
                    }`}
                  >
                    {on && <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r bg-[color:var(--brand)]" />}
                    {!on && precisaAtender && <span className="absolute left-0 top-0 bottom-0 w-[3px] bg-[color:var(--brand)]/70" />}
                    <div className="relative size-[42px] shrink-0 self-start group">
                      <InitialsAvatar name={grupo?.nome || c.nome || c.numero} size={42} src={grupo?.foto_url ?? card?.foto_url ?? undefined} />
                      {!conversaEhGrupo && iaAtiva && (
                        <span className="absolute -right-1 -top-1 grid size-4 place-items-center rounded-full border-2 border-background bg-[color:var(--brand)] text-white">
                          <Bot className="size-2.5" />
                        </span>
                      )}
                      <ChannelBadge canal={getChannel(card, c.last)} parentSize={42} />
                    </div>
                    <div className="min-w-0 flex-1 flex flex-col gap-1 relative group/item">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className={`flex min-w-0 items-center gap-1.5 truncate text-[13.5px] ${precisaAtender ? "font-bold text-foreground" : "font-semibold"}`}>
                          {conversationSector && (
                            <span className="size-2 shrink-0 rounded-full ring-2 ring-background" style={{ backgroundColor: conversationSector.cor || "var(--brand)" }} title={conversationSector.nome} />
                          )}
                          {grupo?.nome || c.nome || (conversaEhGrupo ? "Grupo do WhatsApp" : c.numero)}
                        </span>
                        <div className="flex items-center gap-1.5 shrink-0 h-4 min-w-[60px] justify-end relative">
                          <span className={`text-[10.5px] whitespace-nowrap group-hover/item:opacity-0 transition-opacity ${precisaAtender ? "text-[color:var(--brand-strong)] font-semibold" : "text-muted-foreground"}`}>
                            {formatListTimestamp(c.last.created_at)}
                          </span>
                          
                          {u > 0 && (
                             <span className="min-w-[18px] h-[18px] px-1.5 rounded-full bg-[color:var(--status-soft)] text-[color:var(--status-foreground)] text-[10.5px] font-bold grid place-items-center group-hover/item:opacity-0 transition-opacity">
                              {u > 99 ? "99+" : u}
                            </span>
                          )}
                          <div className="absolute right-0 top-1/2 -translate-y-1/2 opacity-0 group-hover/item:opacity-100 transition-opacity flex items-center">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button
                                  type="button"
                                  onClick={(e) => e.stopPropagation()}
                                  className="size-5 flex items-center justify-center rounded-full hover:bg-muted text-muted-foreground transition-colors"
                                >
                                  <ChevronDown className="size-4" />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" sideOffset={8} className="w-40 rounded-xl shadow-lg border-[color:var(--hairline)]">
                                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); markUnread(c.numero); }}>
                                  <MessageSquareText className="size-3.5 mr-2" /> Marcar como não lida
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); runAction(c.numero, "arquivar"); }}>
                                  <Package className="size-3.5 mr-2" /> Arquivar
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); runAction(c.numero, pauses[c.numero] === false ? "bloquear" : "desbloquear"); }}>
                                  <Ban className="size-3.5 mr-2" /> {pauses[c.numero] === false ? "Bloquear" : "Desbloquear"}
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem 
                                  className="text-red-500 focus:text-red-500 focus:bg-red-50"
                                  onClick={(e) => { 
                                    e.stopPropagation(); 
                                    if(confirm(`Deseja apagar a conversa de "${c.nome || c.numero}" apenas no sistema Capi Conversa?`)) {
                                      runAction(c.numero, "excluir_local"); 
                                    }
                                  }}
                                >
                                  <Trash2 className="size-3.5 mr-2" /> Remover do sistema
                                </DropdownMenuItem>
                                <DropdownMenuItem 
                                  className="text-red-500 focus:text-red-500 focus:bg-red-50 font-semibold"
                                  onClick={(e) => { 
                                    e.stopPropagation(); 
                                    if(confirm(`ATENÇÃO: Ação IRREVERSÍVEL.\n\nExcluir conversa de "${c.nome || c.numero}" no WhatsApp (celular) e no sistema?`)) {
                                      runAction(c.numero, "excluir"); 
                                    }
                                  }}
                                >
                                  <Trash className="size-3.5 mr-2" /> Excluir no WhatsApp
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                      </div>
                      <p className={`text-[12px] truncate flex items-center gap-1 ${precisaAtender ? "text-foreground/90 font-medium" : "text-muted-foreground"}`}>
                        {c.last.direcao === "saida" && <span className="font-semibold">Você:</span>}
                        {c.last.midia_tipo === "image" ? <><ImageIcon className="size-3 shrink-0" /><span>Imagem</span></>
                          : c.last.midia_tipo === "audio" ? <><MicIcon className="size-3 shrink-0" /><span>Áudio</span></>
                          : c.last.midia_tipo === "video" ? <><VideoIcon className="size-3 shrink-0" /><span>Vídeo</span></>
                          : c.last.midia_tipo === "document" ? <><FileText className="size-3 shrink-0" /><span>Documento</span></>
                          : <span className="truncate">{c.last.texto || "…"}</span>}
                      </p>
                      <div className="flex items-center flex-wrap gap-1 mt-0.5">
                        {!conversaEhGrupo && transferidaPelaIa && !on && (
                          <span className="inline-flex items-center gap-1 h-[18px] px-1.5 rounded-md bg-[color:var(--brand)] text-white text-[10.5px] font-bold">
                            ⚡ Qualificado pela IA · atender
                          </span>
                        )}
                        {!conversaEhGrupo && isMine && <MiniChip tone="brand">👤 Você</MiniChip>}
                        {conversaEhGrupo ? null : !pausesLoaded ? null : iaAtiva ? (
                          <MiniChip tone="ai">⚡ IA</MiniChip>
                        ) : card?.owner_id ? (
                          <MiniChip tone="human">
                            {members.find((m) => m.user_id === card.owner_id)?.nome || "Atendente"}
                          </MiniChip>
                        ) : (
                          <MiniChip tone="human">Humano</MiniChip>
                        )}
                        {!conversaEhGrupo && stage && <StageChip nome={stage.nome} cor={stage.cor} />}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}



          </ul>
        </aside>

        {/* ============ CENTER — THREAD ============ */}
        <section className={`inbox-panel ${active ? "flex" : "hidden lg:flex"} flex-col min-h-0 min-w-0 h-full relative`}>
          {!active ? (
            <div className="flex-1 w-full h-full grid place-items-center bg-card px-6">
              <div className="flex flex-col items-center gap-5 text-center">
                <div className="grid size-16 place-items-center rounded-[20px] bg-accent text-primary"><MessageSquareText className="size-8" strokeWidth={1.6} /></div>
                <div><h3 className="text-lg font-extrabold text-foreground">Sua caixa de entrada</h3><p className="mt-1 text-sm text-muted-foreground">Selecione uma conversa para começar.</p></div>
              </div>
            </div>
          ) : (
            <>
              {/* Header */}
               <header className="flex flex-col gap-2 lg:flex-row lg:items-center lg:gap-3 px-3 sm:px-6 py-3 sm:py-4 border-b border-border bg-card">
                <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                  <button
                    type="button"
                    onClick={() => setActive(null)}
                    className="lg:hidden size-9 grid place-items-center rounded-full hover:bg-[color:var(--panel-2)] shrink-0"
                    aria-label="Voltar"
                  >
                    <ChevronLeft className="size-5" />
                  </button>
                  <div className="relative size-10 shrink-0">
                    <AvatarViewer name={activeGroup?.nome || activeConv?.nome || (activeIsGrupo ? "Grupo do WhatsApp" : active)} size={40} src={activeGroup?.foto_url ?? activeCard?.foto_url ?? undefined} />
                    {!activeIsGrupo && iaRespondeAqui && (
                      <span className="absolute -right-1 -top-1 grid size-4 place-items-center rounded-full border-2 border-background bg-[color:var(--brand)] text-white">
                        <Bot className="size-2.5" />
                      </span>
                    )}
                    <ChannelBadge canal={getChannel(activeCard, activeConv?.last)} size={18} parentSize={40} />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-[14px] truncate flex items-center gap-1.5">
                      {activeGroup?.nome || activeConv?.nome || (activeIsGrupo ? "Grupo do WhatsApp" : active)}
                    </div>
                    <div className="text-[11.5px] text-muted-foreground truncate">
                      {activeIsGrupo ? (activeGroup?.participantes != null ? `${activeGroup.participantes} participantes` : "Grupo do WhatsApp") : iaRespondeAqui ? "⚡ Atendimento automatizado" : 
                        activeCard?.owner_id === userId
                          ? "Ticket em aberto por você"
                          : activeCard?.owner_id
                            ? `Atribuído a ${members.find((m) => m.user_id === activeCard.owner_id)?.nome ?? "outro atendente"}`
                            : "Sem ticket aberto"}
                    </div>
                  </div>
                  {/* Painel toggle — visível ao lado do nome no mobile/tablet */}
                  <button
                    type="button"
                    onClick={() => setShowDetails((v) => !v)}
                    title={showDetails ? "Ocultar painel" : "Mostrar painel"}
                    aria-label={showDetails ? "Ocultar painel" : "Mostrar painel"}
                    className="lg:hidden shrink-0 grid size-9 place-items-center rounded-full text-muted-foreground hover:text-foreground hover:bg-[color:var(--panel-2)]"
                  >
                    {showDetails ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
                  </button>
                </div>

                <div className="flex items-center gap-1.5 lg:gap-2 flex-nowrap lg:flex-wrap lg:ml-auto overflow-x-auto no-scrollbar -mx-1 px-1 lg:mx-0 lg:px-0 lg:overflow-visible [&>*]:shrink-0">
                  {/* IA pill */}
                  {!activeIsGrupo && !operationalMode && <label
                    className="inline-flex items-center gap-1.5 lg:gap-2 h-9 px-3 rounded-full border border-[color:var(--hairline)] text-[11.5px] lg:text-[12.5px] font-semibold cursor-pointer bg-[color:var(--panel)] shadow-sm"
                    title={!iaDaEtapa ? "Esta etapa do funil está em atendimento manual — o agente de IA não responde aqui." : undefined}
                  >
                    <Bot className={`size-3 lg:size-3.5 ${iaRespondeAqui ? "text-[color:var(--brand-text)]" : "text-muted-foreground"}`} />
                    <span className={iaRespondeAqui ? "text-[color:var(--brand-text)]" : "text-muted-foreground"}>
                      {!iaDaEtapa ? "IA off na etapa" : iaAtivaAqui ? "IA ativa" : "IA pausada"}
                    </span>
                    <Switch checked={iaAtivaAqui} onCheckedChange={(v) => void toggleIa(v)} className="scale-75 lg:scale-100" />
                  </label>}

                  {/* Assumir / Finalizar ticket (grupos não precisam) */}
                  {activeIsGrupo ? null : activeCard?.owner_id === userId ? (
                    <Button
                      size="sm"
                      className="size-9 p-0 rounded-full text-[12.5px] bg-green-500 hover:bg-green-600 text-white shadow-sm"
                      onClick={() => setFinalizarDialogOpen(true)}
                      title="Finalizar atendimento"
                    >
                      <CheckCircle2 className="size-4.5" />
                    </Button>
                  ) : (
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="size-9 p-0 rounded-full text-[12.5px] shadow-sm" 
                      onClick={() => void assumir()}
                      title="Aceitar/Assumir atendimento"
                    >
                      <Hand className="size-4.5" />
                    </Button>
                  )}


                  {/* Encaminhar: setor + etapa + responsável */}
                  {!activeIsGrupo && canTransfer && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="size-9 p-0 rounded-full text-[12.5px] shadow-sm"
                      title="Encaminhar (setor, etapa e responsável)"
                      onClick={() => setEncaminharOpen(true)}
                    >
                      <Forward className="size-4.5" />
                    </Button>
                  )}
                  {!activeIsGrupo && <EncaminharDialog
                    open={encaminharOpen}
                    onOpenChange={setEncaminharOpen}
                    numero={active}
                    onDone={(r) => {
                      if (!active) return;
                      setCards((prev) => ({
                        ...prev,
                        [active]: {
                          ...(prev[active] as any),
                          department_id: r.department_id,
                          stage_id: r.stage_id ?? (prev[active] as any)?.stage_id,
                          owner_id: r.owner_id,
                        },
                      }));
                      if (r.owner_id) setPauses((p) => ({ ...p, [active]: true }));
                    }}
                  />}

                  {/* CSAT */}


                  {!activeIsGrupo && <Button
                    size="sm"
                    variant="outline"
                    className="size-9 p-0 rounded-full text-[12.5px] shadow-sm"
                    title="Enviar Pesquisa CSAT"
                    onClick={async () => {
                      if (!active) return;
                      try {
                        const result: any = await sendCsatFn({ data: { numero: active, contatoNome: activeConv?.nome ?? null } });
                        if (result?.ok === false) {
                          toast.warning(result.message || "Não foi possível enviar a pesquisa.");
                        } else {
                          toast.success("Pesquisa de satisfação enviada");
                        }
                      } catch (e: any) { toast.error(e?.message ?? "Erro ao enviar"); }
                    }}
                  >
                    <Star className="size-4.5" />
                  </Button>}

                  {/* Resumo por IA (plugin Resumo Automático) */}
                  {!activeIsGrupo && resumoAtivo && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="size-9 p-0 rounded-full text-[12.5px] shadow-sm"
                      title="Resumir conversa com IA"
                      disabled={resumoLoading}
                      onClick={async () => {
                        if (!active) return;
                        setResumoOpen(true);
                        setResumoLoading(true);
                        setResumoTexto("");
                        try {
                          const r: any = await resumirFn({ data: { numero: active } });
                          if (r?.ok) setResumoTexto(r.resumo);
                          else toast.warning(r?.erro ?? "Não foi possível resumir.");
                          if (r?.ok === false) setResumoOpen(false);
                        } catch (e: any) {
                          toast.error(e?.message ?? "Erro ao resumir");
                          setResumoOpen(false);
                        } finally {
                          setResumoLoading(false);
                        }
                      }}
                    >
                      <Sparkles className="size-4.5" />
                    </Button>
                  )}

                  {/* Sentimento por IA (plugin Análise de Sentimento) */}
                  {!activeIsGrupo && sentimentoAtivo && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="size-9 p-0 rounded-full text-[12.5px] shadow-sm"
                      title="Analisar sentimento do cliente"
                      disabled={sentLoading}
                      onClick={async () => {
                        if (!active) return;
                        setSentOpen(true);
                        setSentLoading(true);
                        setSentRes(null);
                        try {
                          const r: any = await sentimentoFn({ data: { numero: active } });
                          if (r?.ok) setSentRes(r);
                          else {
                            toast.warning(r?.erro ?? "Não foi possível analisar.");
                            setSentOpen(false);
                          }
                        } catch (e: any) {
                          toast.error(e?.message ?? "Erro ao analisar");
                          setSentOpen(false);
                        } finally {
                          setSentLoading(false);
                        }
                      }}
                    >
                      <Gauge className="size-4.5" />
                    </Button>
                  )}




                  {/* Painel toggle — desktop apenas (fica no canto direito) */}
                  <button
                    type="button"
                    onClick={() => setShowDetails((v) => !v)}
                    title={showDetails ? "Ocultar painel" : "Mostrar painel"}
                    aria-label={showDetails ? "Ocultar painel" : "Mostrar painel"}
                    className="hidden lg:grid size-8 place-items-center rounded-full text-muted-foreground hover:text-foreground hover:bg-[color:var(--panel-2)]"
                  >
                    {showDetails ? <PanelRightClose className="size-4" /> : <PanelRightOpen className="size-4" />}
                  </button>
                  {activeCard?.provider?.startsWith("meta") && activeCard?.status === "expired" && (
                    <div className="flex-1 flex items-center justify-center">
                      <div className="bg-red-50 text-red-600 px-4 py-1.5 rounded-full border border-red-100 flex items-center gap-2 text-xs font-medium animate-in fade-in slide-in-from-top-1">
                        <AlertCircle className="size-3.5" />
                        {activeCard?.provider === "meta_instagram" ? "Instagram" : "Messenger"} não conectado. Reconecte o canal em Conexões.
                      </div>
                    </div>
                  )}
                </div>
              </header>

              {convitePendente && (
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-4 py-3">
                  <div className="text-[13px] text-amber-900">
                    <span className="font-semibold">Atendimento encaminhado para você.</span>{" "}
                    Aceite para assumir a conversa.
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" className="h-8 rounded-full" onClick={() => void responderConvite(true)}>
                      Assumir
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 rounded-full"
                      onClick={() => void responderConvite(false)}
                    >
                      Recusar
                    </Button>
                  </div>
                </div>
              )}

              {/* Thread body */}
              <div
                ref={threadRef}
                 className="flex-1 overflow-auto p-3 sm:p-6 flex flex-col gap-3 bg-muted"
              >
                {thread.map((m, i) => {
                  const quoted = m.reply_to_id ? msgs.find((x) => x.id === m.reply_to_id) ?? null : null;
                  const prev = thread[i - 1];
                  const showSep = !prev || !isSameDay(prev.created_at, m.created_at);
                  return (
                    <>
                      {showSep && (
                        <div key={`sep-${m.id}`} className="flex items-center justify-center my-2">
                          <span className="text-[10.5px] font-semibold uppercase tracking-wider px-3 py-1 rounded-full bg-[color:var(--panel)] border border-[color:var(--hairline)] text-muted-foreground">
                            {formatDaySeparator(m.created_at)}
                          </span>
                        </div>
                      )}
                      <Bubble
                        key={m.id}
                        m={m}
                        quoted={quoted}
                        companyId={companyId ?? ""}
                        onReply={(msg) => setReplyTo(msg)}
                        agentTraits={agentConfig?.avatar_traits}
                        agentAvatarUrl={agentConfig?.avatar_url}

                      />
                    </>
                  );
                })}
              </div>

              {/* Composer estilo WhatsApp */}
              <Composer
                active={active}
                activeName={activeConv?.nome ?? null}
                templates={templates}
                quickReplies={quickReplies}
                onQuickRepliesChanged={() => void reloadQuickReplies()}
                sending={sending}
                onSendText={(t) => void sendMsg(t)}
                companyId={companyId ?? ""}
                iaAtiva={activeIsGrupo ? false : iaAtivaAqui}
                onAssumir={() => void assumir()}
                onEncaminhar={activeIsGrupo ? undefined : canTransfer ? () => setEncaminharOpen(true) : undefined}
                ownerId={activeIsGrupo ? (userId ?? null) : activeCard?.owner_id ?? null}
                currentUserId={userId ?? null}
                ownerNome={members.find((m) => m.user_id === activeCard?.owner_id)?.nome || "Humano"}
                replyTo={replyTo}
                onCancelReply={() => setReplyTo(null)}
                agentTraits={agentConfig?.avatar_traits}
                agentAvatarUrl={agentConfig?.avatar_url}
                scheduleTarget={{ numero: active, nome: activeCard?.nome ?? activeConv?.nome ?? null, cardId: activeCard?.id }}
                onLocalMedia={addLocalMedia}
                onLocalMediaFail={removeLocalMsg}

              />


            </>
          )}

        </section>

        {/* ============ RIGHT — DETAILS ============ */}
        {showDetails && active && (
          <>
            {/* backdrop só no mobile/tablet */}
            <button
              type="button"
              aria-label="Fechar detalhes"
              onClick={() => setShowDetails(false)}
              className="fixed inset-0 z-40 bg-black/40 lg:hidden animate-sheet-fade"
            />
            <aside
              style={{ transform: sheetDrag ? `translateY(${sheetDrag}px)` : undefined, transition: sheetDragging ? "none" : "transform .22s ease" }}
               className="animate-sheet-up fixed inset-x-0 bottom-0 z-50 h-[78dvh] rounded-t-2xl shadow-lg flex flex-col bg-card lg:inbox-panel lg:static lg:z-auto lg:h-auto lg:w-full lg:shadow-none overflow-hidden min-w-0 lg:!transform-none"
            >
            <div
              onPointerDown={onSheetPointerDown}
              onPointerMove={onSheetPointerMove}
              onPointerUp={onSheetPointerUp}
              onPointerCancel={onSheetPointerUp}
              className="lg:hidden pt-3 pb-2 grid place-items-center touch-none cursor-grab active:cursor-grabbing"
            >
              <span className="h-1.5 w-12 rounded-full bg-[color:var(--hairline-strong)]" />
            </div>
            <header
              onPointerDown={onSheetPointerDown}
              onPointerMove={onSheetPointerMove}
              onPointerUp={onSheetPointerUp}
              onPointerCancel={onSheetPointerUp}
              className="flex items-center justify-between px-5 py-3 lg:py-4 border-b border-[color:var(--hairline)] touch-none lg:touch-auto"
            >
              <h3 className="text-[11px] uppercase tracking-[0.14em] font-bold text-foreground">{activeIsGrupo ? "Detalhes do grupo" : "Detalhes do Lead"}</h3>
              <button
                type="button"
                onClick={() => setShowDetails(false)}
                className="size-7 grid place-items-center rounded-full text-muted-foreground hover:bg-[color:var(--panel-2)]"
              >
                <X className="size-4" />
              </button>
            </header>


            {active && activeIsGrupo ? (
              <GrupoDetailsPanel
                jid={active}
                nomeFallback={activeGroup?.nome ?? activeConv?.nome ?? activeCard?.nome ?? null}
                onOpenPrivate={(numero, nome) => {
                  setActive(numero);
                  setCards((current) => current[numero] ? current : ({ ...current, [numero]: { numero, nome, company_id: companyId } as any }));
                  setShowDetails(false);
                }}
              />
            ) : !active || !activeCard ? (
              <p className="text-xs text-muted-foreground text-center mt-6 px-4">
                {active ? "Sem card CRM para este contato." : "Selecione uma conversa para ver os detalhes."}
              </p>
            ) : (
              <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 min-w-0">
                <div className="flex items-center gap-3 mb-4 min-w-0">
                  <AvatarViewer name={activeCard.nome || activeCard.numero} size={44} src={activeCard.foto_url ?? undefined} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="truncate text-sm font-semibold">{activeCard.nome || activeCard.numero}</span>
                      <LeadTagsInline
                        cardId={activeCard.id}
                        tags={activeCard.tags ?? []}
                        onChanged={() => { if (companyId) void load(companyId); }}
                      />
                    </div>
                    <div className="text-[11px] text-muted-foreground font-mono truncate">{activeCard.numero}</div>
                  </div>
                </div>
                {companyId && (
                  <div className="min-w-0 [&_*]:min-w-0">
                    <LeadDetailsPanel
                      card={activeCard}
                      stages={stages}
                      members={members}
                      companyId={companyId}
                      onChanged={() => { if (companyId) void load(companyId); }}
                      onDeleted={() => {
                        setActive(null);
                        if (companyId) void load(companyId);
                      }}
                      hideConversation
                      operationalMode={operationalMode}
                    />
                  </div>
                )}
              </div>

            )}
            </aside>
          </>
        )}
      </div>

      <MediaLightbox />

      {companyId && (
        <LeadDrawer
          card={drawerCard} stages={stages} members={members} companyId={companyId}
          operationalMode={operationalMode}
          onClose={() => setDrawerCard(null)}
          onChanged={() => { if (companyId) void load(companyId); }}
        />
      )}

      <NewConversationDialog
        open={newConvOpen}
        onOpenChange={setNewConvOpen}
        onStart={(numero, nome) => {
          setNewConvOpen(false);
          setActive(numero);
          // Cria card placeholder na UI para aparecer na lista assim que enviar a 1ª msg
          if (nome) {
            setCards((c) => c[numero] ? c : ({ ...c, [numero]: { numero, nome, company_id: companyId } as any }));
          }
        }}
      />

      <ContactPickerDialog
        open={contactPickerOpen}
        onOpenChange={setContactPickerOpen}
        companyId={companyId}
        onPick={(numero, nome) => {
          setContactPickerOpen(false);
          setActive(numero);
          setCards((c) => c[numero] ? c : ({ ...c, [numero]: { numero, nome, company_id: companyId } as any }));
        }}
      />

      <Dialog open={finalizarDialogOpen} onOpenChange={setFinalizarDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Finalizar Atendimento</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <p className="text-sm text-muted-foreground">{operationalMode ? "Revise o registro deste atendimento antes de finalizar." : "Como você deseja finalizar este atendimento? Escolha se deseja continuar sendo o dono deste lead para futuros contatos."}</p>
            {operationalMode && (
              <div className="space-y-3 rounded-lg border border-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">Registro diário</span>
                  <Button type="button" variant="outline" size="sm" disabled={relatorioLoading} onClick={async () => {
                    if (!active) return;
                    setRelatorioLoading(true);
                    try {
                      const s = await sugerirRelatorioFn({ data: { numero: active } });
                      setRelatorio((r) => ({ ...r, ...s, aiSugerido: true }));
                    } catch (e: any) { toast.error(e?.message ?? "Não foi possível analisar."); }
                    finally { setRelatorioLoading(false); }
                  }}><Sparkles className="mr-1.5 size-3.5" />Sugerir com IA</Button>
                </div>
                <div><label className="text-xs font-medium">Solicitação do cliente</label><textarea className="mt-1 min-h-20 w-full rounded-md border border-input bg-background p-2 text-sm" value={relatorio.solicitacao} onChange={(e) => setRelatorio({ ...relatorio, solicitacao: e.target.value })} /></div>
                <div><label className="text-xs font-medium">Solução ou andamento</label><textarea className="mt-1 min-h-20 w-full rounded-md border border-input bg-background p-2 text-sm" value={relatorio.resolucao} onChange={(e) => setRelatorio({ ...relatorio, resolucao: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-2">
                  <select className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={relatorio.situacao} onChange={(e) => setRelatorio({ ...relatorio, situacao: e.target.value as AtendimentoSituacao })}><option value="resolvido">Resolvido</option><option value="pendente">Pendente</option></select>
                  {relatorio.situacao === "pendente" && <select className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={relatorio.pendenteCom} onChange={(e) => setRelatorio({ ...relatorio, pendenteCom: e.target.value })}><option value="">Responsável atual</option>{members.map((m) => <option key={m.user_id} value={m.user_id}>{m.nome || m.email || "Usuário"}</option>)}</select>}
                </div>
              </div>
            )}
            <div className="grid grid-cols-1 gap-3">
              <Button 
                variant="outline" 
                className="justify-start h-auto py-3 px-4 border-emerald-100 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200"
                disabled={relatorioLoading}
                onClick={() => void (operationalMode ? finalizarComRelatorio(true) : finalizar(true))}
              >
                <div className="text-left">
                  <div className="font-semibold text-sm">Finalizar e Manter como Dono</div>
                  <div className="text-[11px] opacity-80">O próximo contato deste lead virá direto para você.</div>
                </div>
              </Button>
              <Button 
                variant="outline" 
                className="justify-start h-auto py-3 px-4 border-blue-100 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200"
                disabled={relatorioLoading}
                onClick={() => void (operationalMode ? finalizarComRelatorio(false) : finalizar(false))}
              >
                <div className="text-left">
                  <div className="font-semibold text-sm">Finalizar e Remover Dono</div>
                  <div className="text-[11px] opacity-80">O lead voltará para a triagem (IA ou Fila) no próximo contato.</div>
                </div>
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={resumoOpen} onOpenChange={setResumoOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Sparkles className="size-4" /> Resumo da conversa</DialogTitle>
          </DialogHeader>
          {resumoLoading ? (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <RefreshCw className="size-4 animate-spin" /> Analisando a conversa…
            </div>
          ) : (
            <div className="text-sm whitespace-pre-wrap leading-relaxed">{resumoTexto}</div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={sentOpen} onOpenChange={setSentOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Gauge className="size-4" /> Sentimento do cliente</DialogTitle>
          </DialogHeader>
          {sentLoading ? (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <RefreshCw className="size-4 animate-spin" /> Analisando a conversa…
            </div>
          ) : sentRes ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Badge
                  className={
                    sentRes.humor === "positivo"
                      ? "bg-emerald-500/15 text-emerald-600 border-emerald-500/30"
                      : sentRes.humor === "negativo"
                        ? "bg-red-500/15 text-red-600 border-red-500/30"
                        : "bg-amber-500/15 text-amber-600 border-amber-500/30"
                  }
                >
                  {sentRes.humor === "positivo" ? "Satisfeito" : sentRes.humor === "negativo" ? "Insatisfeito" : "Neutro"}
                </Badge>
                <span className="text-xs text-muted-foreground">Nota {sentRes.nota}/10</span>
                {sentRes.risco && (
                  <Badge variant="destructive" className="text-[11px]">Risco de perda</Badge>
                )}
              </div>
              {sentRes.motivo && <p className="text-sm leading-relaxed">{sentRes.motivo}</p>}
              {!!sentRes.sinais?.length && (
                <ul className="space-y-1">
                  {sentRes.sinais.map((s: string, i: number) => (
                    <li key={i} className="text-xs text-muted-foreground border-l-2 border-border pl-2 italic">“{s}”</li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

    </div>

  );
}

function DataRow({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 bg-[color:var(--panel)]">
      <span className="text-[11.5px] text-muted-foreground">{label}</span>
      <span className={`text-[12.5px] font-medium text-right ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}

function MiniChip({ children, tone }: { children: React.ReactNode; tone: "brand" | "ai" | "human" | "done" | "warn" }) {
  const style: Record<string, string> = {
    brand: "bg-[color:var(--brand-soft)] text-[color:var(--brand-text)]",
    ai: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400",
    human: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400",
    done: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400",
    warn: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  };
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${style[tone]}`}>
      {children}
    </span>
  );
}

function StageChip({ nome, cor }: { nome: string; cor: string | null }) {
  const c = cor || "#8AA89A";
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full"
      style={{ backgroundColor: `${c}22`, color: c }}
    >
      <span className="size-1.5 rounded-full" style={{ backgroundColor: c }} />
      {nome}
    </span>
  );
}

const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];
const MORE_REACTIONS = ["👏", "🎉", "🔥", "✅", "🤔", "😍", "😡", "💯", "🙌", "🤝", "✨", "😅"];

function Bubble({ m, quoted, companyId, onReply, agentTraits, agentAvatarUrl }: { m: Msg; quoted?: Msg | null; companyId: string; onReply?: (m: Msg) => void; agentTraits?: any; agentAvatarUrl?: string }) {
  const isOut = m.direcao === "saida";
  const ia = m.autor === "ia";
  const automacao = m.autor === "automacao";
  const media = m.midia_tipo && m.midia_url ? { tipo: m.midia_tipo, url: m.midia_url, nome: m.midia_nome, mime: m.midia_mime } : null;
  const [feedback, setFeedback] = useState<"up" | "down" | null>(null);
  const [busy, setBusy] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const [forwardOpen, setForwardOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showReactions, setShowReactions] = useState(false);
  const [showAllReactions, setShowAllReactions] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(m.texto);

  const reactFn = useServerFn(reactMessage);
  const editFn = useServerFn(editMessage);
  const deleteFn = useServerFn(deleteMessage);

  async function removeMessage() {
    if (busy) return;
    const ok = window.confirm(
      isOut
        ? "Apagar esta mensagem no WhatsApp e no sistema?"
        : "Remover esta mensagem do histórico do sistema?",
    );
    if (!ok) return;
    setBusy(true);
    try {
      const res: any = await deleteFn({ data: { messageId: m.id } });
      toast.success(res?.syncedToWhatsapp ? "Mensagem apagada no WhatsApp" : "Mensagem removida do histórico");
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível apagar");
    } finally {
      setBusy(false);
      setShowActions(false);
    }
  }

  async function rate(rating: "up" | "down") {
    if (busy || feedback || !companyId) return;
    setBusy(true);
    let nota: string | null = null;
    if (rating === "down") {
      const r = window.prompt("O que estava errado? (opcional)");
      nota = r?.trim() || null;
    }
    const { error } = await supabase.from("agent_feedback").insert({
      company_id: companyId, rating, nota,
      mensagem_texto: m.texto || "", mensagem_id: m.id, numero: m.numero,
    });
    setBusy(false);
    if (error) { toast.error("Não foi possível salvar o feedback"); return; }
    setFeedback(rating);
    toast.success(rating === "up" ? "Obrigado! A IA vai manter esse padrão." : "Anotado. A IA vai evitar esse tipo de resposta.");
  }

  async function react(emoji: string) {
    setShowReactions(false); setShowActions(false);
    const next = m.reacao === emoji ? null : emoji;
    try { await reactFn({ data: { messageId: m.id, emoji: next } }); } catch (e: any) { toast.error(e?.message ?? "Falha"); }
  }

  async function saveEdit() {
    const t = editText.trim();
    if (!t || t === m.texto) { setEditing(false); return; }
    try {
      const res: any = await editFn({ data: { messageId: m.id, texto: t } });
      if (res?.ok === false) { toast.error(res.error ?? "Falha ao editar"); return; }
      setEditing(false);
      toast.success("Mensagem editada");
    } catch (e: any) { toast.error(e?.message ?? "Falha ao editar"); }
  }

  const ageMs = Date.now() - new Date(m.created_at).getTime();
  // whatsapp_message_id pode chegar depois (realtime); o servidor revalida na edição.
  const canEdit = isOut && m.autor !== "ia" && m.autor !== "automacao" && !!m.texto && !media && ageMs < 15 * 60 * 1000 && (m as any).status_envio !== "erro" && (m as any).status_envio !== "falha";

  return (
    <div
      className={`flex ${isOut ? "justify-end" : "justify-start"} group relative`}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => { if (!showReactions && !menuOpen) setShowActions(false); }}
      onDoubleClick={() => onReply?.(m)}
    >
      <ForwardMessageDialog open={forwardOpen} onOpenChange={setForwardOpen} messageId={m.id} />
      <div className="relative max-w-[78%] sm:max-w-[62%]">
        <div
          className={cn(
            "px-3.5 py-2.5 pr-9 text-[13.5px] shadow-sm relative",
            ia && "ring-1 ring-blue-500/20",
            isOut
               ? "bg-[color:var(--chart-1)] text-primary-foreground rounded-2xl rounded-br-md font-medium"
              : "bg-[color:var(--panel)] text-foreground rounded-2xl rounded-bl-md border border-[color:var(--hairline)]"
          )}
        >
          {!editing && (
            <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
              <DropdownMenuTrigger asChild>
                <button type="button" aria-label="Mais ações" className={cn(
                  "absolute top-1 right-1 z-20 grid size-5 place-items-center rounded transition-opacity bg-transparent border-0 shadow-none",
                  isOut ? "text-primary-foreground/90" : "text-muted-foreground",
                  menuOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
                )}>
                  <ChevronDown className="size-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align={isOut ? "end" : "start"} className="z-50">
                <DropdownMenuItem onClick={() => onReply?.(m)}><Reply className="mr-2 size-4" />Responder</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setForwardOpen(true)}><Forward className="mr-2 size-4" />Encaminhar</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowReactions(true)}><Smile className="mr-2 size-4" />Reagir</DropdownMenuItem>
                {media?.url && <DropdownMenuItem onClick={() => { const a = document.createElement("a"); a.href = media.url; a.download = media.nome || "arquivo"; a.target = "_blank"; a.click(); }}><Download className="mr-2 size-4" />Baixar</DropdownMenuItem>}
                {canEdit && <DropdownMenuItem onClick={() => { setEditText(m.texto); setEditing(true); }}><Pencil className="mr-2 size-4" />Editar</DropdownMenuItem>}
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive" onClick={() => void removeMessage()}><Trash2 className="mr-2 size-4" />Apagar</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {quoted && (
            <div className={`mb-1.5 px-2 py-1 rounded border-l-2 text-[11.5px] ${isOut ? "bg-white/10 border-white/60" : "bg-black/5 border-[color:var(--brand)]"} truncate`}>
              <div className="opacity-70 text-[10px] font-semibold">{quoted.direcao === "saida" ? "Você" : (quoted.contato_nome ?? "Contato")}</div>
              <div className="truncate opacity-90">{quoted.texto || (quoted.midia_tipo ? `[${quoted.midia_tipo}]` : "")}</div>
            </div>
          )}
          {isOut && (
            <div className="flex items-center gap-2 mb-1.5">
              {ia && (agentTraits || agentAvatarUrl) ? (
                <div className="size-5 rounded-md overflow-hidden bg-blue-100 flex items-center justify-center shrink-0">
                  <AgentAvatar traits={agentTraits} avatarUrl={agentAvatarUrl} size={20} />
                </div>

              ) : null}
              <span className="block text-[9.5px] font-bold opacity-80 uppercase tracking-wider">
                {ia ? "⚡ Agente IA" : automacao ? "🤖 Automação da etapa" : "Atendente"}
              </span>
            </div>
          )}
          {media && media.tipo !== "audio" && (
            <ChatMedia messageId={m.id} tipo={media.tipo} url={media.url} nome={media.nome} outbound={isOut} onOpen={openMediaLightbox} />
          )}
          {media?.tipo === "audio" && (
            <div className="mb-1.5 -mx-1">
              <WhatsappAudio 
                src={media.url.startsWith("http") ? media.url : `data:${media.mime || "audio/ogg"};base64,${media.url}`} 
                outbound={isOut} 
              />
            </div>
          )}
          {!media && m.midia_tipo && (
            <ChatMedia messageId={m.id} tipo={m.midia_tipo} url={null} nome={m.midia_nome} outbound={isOut} onOpen={openMediaLightbox} />
          )}
          {!media && !m.midia_tipo && !m.texto && m.whatsapp_message_id && (
            <ChatMedia messageId={m.id} tipo="unknown" url={null} nome={null} outbound={isOut} onOpen={openMediaLightbox} />
          )}
          {editing ? (
            <div className="flex flex-col gap-2 min-w-[240px]">
              <textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                autoFocus
                rows={3}
                className="w-full text-[13px] rounded-md p-2 bg-white/10 text-inherit border border-white/20 outline-none resize-none"
              />
              <div className="flex justify-end gap-1.5">
                <button onClick={() => { setEditing(false); setEditText(m.texto); }} className="text-[11px] px-2 py-1 rounded bg-white/10 hover:bg-white/20">Cancelar</button>
                <button onClick={() => void saveEdit()} className="text-[11px] px-2 py-1 rounded bg-white/25 hover:bg-white/35 font-semibold">Salvar</button>
              </div>
            </div>
          ) : (
            m.texto && !(media && (media.tipo === "audio" || (media.tipo === "document" && m.texto.startsWith("📎")))) && (
              parseLocationText(m.texto)
                ? <ChatLocation loc={parseLocationText(m.texto)!} outbound={isOut} />
                : (
                  <div className="whitespace-pre-wrap break-words">
                    {m.texto === "[ÁUDIO]" ? null : m.texto}
                  </div>
                )
            )
          )}

          <div className={cn(
            "text-[10.5px] mt-1 flex items-center justify-between gap-2",
            isOut ? "text-white/80" : "text-muted-foreground"
          )}>
            <div className="flex items-center gap-1.5 flex-1">
              {ia && (
                <span className="flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-tight bg-blue-100/50 text-blue-700 px-1 rounded">
                  <Bot className="size-2" /> IA
                </span>
              )}
              <span className="flex items-center gap-1">
                {new Date(m.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                {m.editado_em && <span className="italic">· editada</span>}
                {isOut && m.status_envio === "pendente" && <span className="italic">· enviando</span>}
                {isOut && m.status_envio === "falha" && <span className="font-semibold">· falhou</span>}
                {isOut && m.status_envio === "enviado" && <Check className="size-3 text-white/60" />}
                {isOut && ["recebido", "entregue", "delivered"].includes(m.status_envio) && <CheckCheck className="size-3 text-white/70" />}
                {isOut && ["visto", "lido", "read"].includes(m.status_envio) && <CheckCheck className="size-3 text-emerald-500" />}
              </span>
            </div>
            {isOut && ia && (
              <span className="flex items-center gap-1">
                <button type="button" onClick={() => rate("up")} disabled={busy || !!feedback}
                  className={`hover:opacity-100 transition ${feedback === "up" ? "opacity-100" : "opacity-60"}`} title="Boa resposta">
                  <ThumbsUp className="size-3" />
                </button>
                <button type="button" onClick={() => rate("down")} disabled={busy || !!feedback}
                  className={`hover:opacity-100 transition ${feedback === "down" ? "opacity-100" : "opacity-60"}`} title="Resposta ruim">
                  <ThumbsDown className="size-3" />
                </button>
              </span>
            )}
          </div>
        </div>

        {/* Reação existente */}
        {m.reacao && (
          <button
            onClick={() => void react(m.reacao!)}
            className={`absolute -bottom-2 ${isOut ? "right-2" : "left-2"} px-1.5 py-0.5 rounded-full bg-[color:var(--panel)] border border-[color:var(--hairline)] text-[13px] shadow-sm`}
            title="Remover reação"
          >
            {m.reacao}
          </button>
        )}

        {/* No hover, apenas reação fica ao lado; as demais ações ficam na seta da mensagem. */}
        {showActions && !editing && (
          <div className={`absolute top-1/2 -translate-y-1/2 ${isOut ? "-left-9" : "-right-9"} flex items-center z-10`}>
            <button
              type="button"
              onClick={() => setShowReactions((v) => !v)}
              className="size-7 grid place-items-center rounded-full bg-[color:var(--panel)] border border-[color:var(--hairline)] shadow-sm hover:bg-[color:var(--panel-2)]"
              title="Reagir"
            >
              <Smile className="size-3.5" />
            </button>
          </div>
        )}

        {showReactions && (
          <div
            className={`absolute -top-11 ${isOut ? "right-2" : "left-2"} z-20 flex items-center gap-1 p-1.5 rounded-full bg-[color:var(--panel)] border border-[color:var(--hairline)] shadow-lg`}
            onMouseEnter={() => setShowActions(true)}
            onMouseLeave={() => { setShowReactions(false); setShowActions(false); }}
          >
            {QUICK_REACTIONS.map((e) => (
              <button key={e} onClick={() => void react(e)}
                className={`size-7 grid place-items-center rounded-full hover:bg-[color:var(--panel-2)] text-[16px] ${m.reacao === e ? "bg-[color:var(--brand-soft)]" : ""}`}>
                {e}
              </button>
            ))}
            <button type="button" onClick={() => setShowAllReactions((v) => !v)} className="size-7 grid place-items-center rounded-full hover:bg-[color:var(--panel-2)]" title="Mais emojis"><Plus className="size-4" /></button>
            {showAllReactions && <div className={`absolute top-10 ${isOut ? "right-0" : "left-0"} grid grid-cols-6 gap-1 rounded-lg border border-[color:var(--hairline)] bg-[color:var(--panel)] p-2 shadow-lg`}>{MORE_REACTIONS.map((e) => <button key={e} onClick={() => void react(e)} className="size-7 rounded hover:bg-[color:var(--panel-2)] text-base">{e}</button>)}</div>}
          </div>
        )}
      </div>
    </div>
  );
}


/* =============== Composer estilo WhatsApp =============== */
function Composer({
  active, activeName, templates, quickReplies, onQuickRepliesChanged, sending, onSendText, companyId, iaAtiva, onAssumir, onEncaminhar, replyTo, onCancelReply,
  ownerId, currentUserId, ownerNome, agentTraits, agentAvatarUrl, scheduleTarget, onLocalMedia, onLocalMediaFail,
}: {
  active: string;
  activeName: string | null;
  templates: MessageTemplate[];
  quickReplies: QuickReply[];
  onQuickRepliesChanged?: () => void;
  sending: boolean;
  onSendText: (t: string) => void;
  companyId: string;
  iaAtiva: boolean;
  onAssumir: () => void;
  onEncaminhar?: () => void;
  replyTo?: Msg | null;
  onCancelReply?: () => void;
  ownerId: string | null;
  currentUserId: string | null;
  ownerNome?: string | null;
  agentTraits?: any;
  agentAvatarUrl?: string;
  scheduleTarget: { numero: string; nome: string | null; cardId?: string };
  onLocalMedia?: (url: string, tipo: string, mime?: string | null) => string;
  onLocalMediaFail?: (id: string) => void;
}) {


  const sendMediaFn = useServerFn(sendWhatsappMedia);
  const sendAudioFn = useServerFn(sendWhatsappAudio);
  const prepareUploadFn = useServerFn(prepareR2Upload);
  const fetchProdutos = useServerFn(listProdutos);
  const toggleFavFn = useServerFn(toggleQuickReplyFavorito);
  const deleteQrFn = useServerFn(deleteQuickReply);
  const [showQuickPanel, setShowQuickPanel] = useState(false);
  const [agendarOpen, setAgendarOpen] = useState(false);
  const [text, setText] = useState("");
  const [showTpl, setShowTpl] = useState(false);
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recLocked, setRecLocked] = useState(false);
  const [holdDy, setHoldDy] = useState(0);
  const [recSecs, setRecSecs] = useState(0);
  const [recLevels, setRecLevels] = useState<number[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [showProdutos, setShowProdutos] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);

  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [produtosLoaded, setProdutosLoaded] = useState(false);
  const [prodSearch, setProdSearch] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Campo no estilo WhatsApp: altura cresce conforme digita (com limite) e acompanha
  // qualquer mudança de texto — inclusive quando a IA preenche ou ao enviar mensagem.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 150)}px`;
  }, [text]);
  const favoritesRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const mediaRecRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const recTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const holdStartRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const lockedRef = useRef(false);

  async function openProdutos() {
    setShowProdutos(true);
    if (!produtosLoaded) {
      try {
        const list = await fetchProdutos();
        setProdutos((list as Produto[]).filter((p) => p.ativo));
        setProdutosLoaded(true);
      } catch (e: any) {
        toast.error(e?.message ?? "Falha ao carregar catálogo");
      }
    }
  }

  async function sendProduto(p: Produto) {
    if (!p.foto_url) { toast.error("Produto sem foto — cadastre uma imagem primeiro."); return; }
    setBusy(true);
    setShowProdutos(false);
    try {
      const preco = p.preco != null ? `\n💰 ${Number(p.preco).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}` : "";
      const desc = p.descricao ? `\n\n${p.descricao}` : "";
      const caption = `*${p.nome}*${preco}${desc}`;
      await sendMediaFn({ data: {
        numero: active, contatoNome: activeName,
        mediatype: "image", media: p.foto_url,
        mimetype: "image/jpeg", caption, midiaUrl: p.foto_url,
      } });
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao enviar produto");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "/") {
        e.preventDefault();
        setShowQuickPanel((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const [isMobileWidth, setIsMobileWidth] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const upd = () => setIsMobileWidth(mq.matches);
    upd();
    mq.addEventListener("change", upd);
    return () => mq.removeEventListener("change", upd);
  }, []);

  type PickerItem =
    | { kind: "template"; id: string; atalho: string; preview: string }
    | { kind: "quick"; id: string; atalho: string; preview: string; tipo: QuickReply["tipo"]; qr: QuickReply };

  const filtered = useMemo<PickerItem[]>(() => {
    if (!text.startsWith("/")) return [];
    const q = text.slice(1).toLowerCase();
    const qrItems: PickerItem[] = quickReplies
      .filter((r) =>
        r.atalho.toLowerCase().includes(q) ||
        (r.titulo || "").toLowerCase().includes(q) ||
        (r.texto || "").toLowerCase().includes(q)
      )
      .map((r) => ({
        kind: "quick" as const, id: r.id, atalho: r.atalho,
        preview: r.titulo || r.texto || `[${r.tipo}]`, tipo: r.tipo, qr: r,
      }));
    const tplItems: PickerItem[] = templates
      .filter((t) => t.atalho.toLowerCase().includes(q) || t.texto.toLowerCase().includes(q))
      .map((t) => ({ kind: "template" as const, id: t.id, atalho: t.atalho, preview: t.texto }));
    // Deduplicate quick vs template by atalho
    const seen = new Set(qrItems.map((i) => i.atalho));
    return [...qrItems, ...tplItems.filter((t) => !seen.has(t.atalho))].slice(0, 10);
  }, [text, templates, quickReplies]);

  const favoritos = useMemo(() => quickReplies.filter((r) => r.favorito), [quickReplies]);
  const [favoriteScroll, setFavoriteScroll] = useState({ left: false, right: false });

  const updateFavoriteScroll = useCallback(() => {
    const el = favoritesRef.current;
    if (!el) return;
    setFavoriteScroll({
      left: el.scrollLeft > 2,
      right: el.scrollLeft + el.clientWidth < el.scrollWidth - 2,
    });
  }, []);

  useEffect(() => {
    const el = favoritesRef.current;
    if (!el) return;
    updateFavoriteScroll();
    const observer = new ResizeObserver(updateFavoriteScroll);
    observer.observe(el);
    el.addEventListener("scroll", updateFavoriteScroll, { passive: true });
    return () => {
      observer.disconnect();
      el.removeEventListener("scroll", updateFavoriteScroll);
    };
  }, [favoritos.length, updateFavoriteScroll]);

  async function toggleFavorito(qr: QuickReply) {
    if (!qr.favorito && favoritos.length >= 5) {
      toast.error("Você pode favoritar no máximo 5 mensagens rápidas");
      return;
    }
    try {
      await toggleFavFn({ data: { id: qr.id, favorito: !qr.favorito } });
      onQuickRepliesChanged?.();
    } catch (e: any) { toast.error(e?.message ?? "Falha ao favoritar"); }
  }

  async function removeQuickReply(qr: QuickReply) {
    if (!confirm(`Excluir a mensagem rápida "${qr.titulo || qr.atalho}"?`)) return;
    try {
      await deleteQrFn({ data: { id: qr.id } });
      toast.success("Mensagem rápida excluída");
      onQuickRepliesChanged?.();
    } catch (e: any) { toast.error(e?.message ?? "Falha ao excluir"); }
  }

  function insertQuickReply(qr: QuickReply) {
    if (qr.tipo === "texto") {
      setText(qr.texto || "");
      setShowQuickPanel(false);
      setShowTpl(false);
      inputRef.current?.focus();
      return;
    }
    // Mídia não é inserida no campo: exige confirmação explícita antes de enviar
    const nome = qr.titulo || qr.media_nome || qr.atalho;
    if (!confirm(`Enviar o arquivo "${nome}" agora para este contato?`)) return;
    setShowQuickPanel(false);
    void pickQuickReply(qr);
  }

  async function sendQuickReply(qr: QuickReply) {
    if (qr.tipo === "texto") {
      const t = (qr.texto || "").trim();
      if (!t) return;
      onSendText(t);
      setShowTpl(false);
      return;
    }
    await pickQuickReply(qr);
  }

  async function pickQuickReply(qr: QuickReply) {
    if (qr.tipo === "texto") {
      setText(qr.texto || "");
      setShowTpl(false);
      inputRef.current?.focus();
      return;
    }
    if (!qr.media_url) { toast.error("Mídia sem URL"); return; }
    setBusy(true);
    setShowTpl(false);
    setText("");
    try {
      if (qr.tipo === "audio") {
        await sendAudioFn({ data: { numero: active, contatoNome: activeName, audio: qr.media_url, midiaUrl: qr.media_url } });
      } else {
        const mediatype = qr.tipo === "imagem" ? "image" : qr.tipo === "video" ? "video" : "document";
        await sendMediaFn({ data: {
          numero: active, contatoNome: activeName,
          mediatype, media: qr.media_url,
          mimetype: qr.media_mime || "application/octet-stream",
          fileName: qr.media_nome || undefined,
          caption: qr.texto || undefined,
          midiaUrl: qr.media_url,
        } });
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao enviar resposta rápida");
    } finally {
      setBusy(false);
    }
  }

  function handleTextChange(v: string) {
    setText(v);
    setShowTpl(v.startsWith("/"));
  }

  function submit() {
    const t = text.trim();
    if (!t) return;
    onSendText(t);
    setText("");
    setShowTpl(false);
    // Mantém o foco no campo, como no WhatsApp: digita → Enter → digita de novo.
    inputRef.current?.focus();
    requestAnimationFrame(() => inputRef.current?.focus());
    setTimeout(() => inputRef.current?.focus(), 80);
  }

  async function uploadToStorage(file: Blob, ext: string, originalName?: string, mimeOverride?: string): Promise<{ url: string; storageKey: string }> {
    const mimeType = mimeOverride || file.type || "application/octet-stream";
    const target = await prepareUploadFn({ data: {
      fileName: originalName || `archivo.${ext}`,
      mimeType,
      sizeBytes: file.size,
    } });
    const response = await fetch(target.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": target.mimeType },
      body: file,
    });
    if (!response.ok) throw new Error(`R2 rechazó el archivo (${response.status}).`);
    return { url: target.downloadUrl, storageKey: target.storageKey };
  }

  /** Reduz fotos grandes (câmera de celular) antes de subir. */
  async function compressImage(file: File): Promise<Blob> {
    try {
      const bmp = await createImageBitmap(file);
      const max = 1600;
      const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
      if (scale === 1 && file.size <= 1_200_000) return file;
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bmp.width * scale);
      canvas.height = Math.round(bmp.height * scale);
      const cctx = canvas.getContext("2d");
      if (!cctx) return file;
      cctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
      const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, "image/jpeg", 0.82));
      return blob && blob.size < file.size ? blob : file;
    } catch {
      return file;
    }
  }

  async function handleFile(file: File, caption?: string) {
    if (!active) return;
    setBusy(true);
    try {
      const isImg = file.type.startsWith("image/");
      const isVid = file.type.startsWith("video/");
      const mediatype: "image" | "video" | "document" = isImg ? "image" : isVid ? "video" : "document";
      const payload: Blob = isImg ? await compressImage(file) : file;
      const extMime: Record<string, string> = {
        pfx: "application/x-pkcs12", p12: "application/x-pkcs12", cer: "application/pkix-cert",
        crt: "application/x-x509-ca-cert", pem: "application/x-pem-file", xml: "application/xml",
        ofx: "application/x-ofx", zip: "application/zip", rar: "application/vnd.rar", "7z": "application/x-7z-compressed",
      };
      const fileExt = (file.name.split(".").pop() || "").toLowerCase();
      const mimetype = isImg ? (payload.type || file.type || "image/jpeg") : (file.type || extMime[fileExt] || "application/octet-stream");
      const ext = isImg
        ? (mimetype === "image/jpeg" ? "jpg" : (file.name.split(".").pop() || "jpg"))
        : (file.name.split(".").pop() || (isVid ? "mp4" : "bin"));

      const uploaded = await uploadToStorage(payload, ext, file.name, mimetype);
      // El proveedor descarga una URL corta; Capiversa conserva storageKey para
      // renovar el acceso desde R2 en la bandeja y en cada reintento.
      const media = uploaded.url;

      await sendMediaFn({
        data: {
          numero: active, contatoNome: activeName,
          mediatype, media, mimetype,
          fileName: file.name, caption: (caption ?? text).trim() || undefined,
          midiaUrl: null,
          storageKey: uploaded.storageKey,
        },
      });
      if (caption === undefined) setText("");
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao enviar mídia");
    } finally {
      setBusy(false);
    }
  }


  /** Mede o volume do microfone em tempo real para desenhar o gráfico da gravação. */
  function startLevelMeter(stream: MediaStream) {
    try {
      const AC: typeof AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
      const ctxAudio = new AC();
      const source = ctxAudio.createMediaStreamSource(stream);
      const analyser = ctxAudio.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      audioCtxRef.current = ctxAudio;
      const buf = new Uint8Array(analyser.fftSize);
      const tick = () => {
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) {
          const v = (buf[i]! - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / buf.length);
        const level = Math.min(1, rms * 3.2);
        setRecLevels((prev) => {
          const next = prev.concat(level);
          return next.length > 48 ? next.slice(next.length - 48) : next;
        });
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch {
      /* sem medidor de nível */
    }
  }

  function stopLevelMeter() {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    try { void audioCtxRef.current?.close(); } catch {}
    audioCtxRef.current = null;
    setRecLevels([]);
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = ["audio/ogg;codecs=opus", "audio/webm;codecs=opus", "audio/webm", "audio/mp4"]
        .find((t) => MediaRecorder.isTypeSupported(t)) || "audio/webm";
      const mr = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.start();
      mediaRecRef.current = mr;
      setRecording(true);
      setRecSecs(0);
      setRecLevels([]);
      startLevelMeter(stream);
      recTimerRef.current = setInterval(() => setRecSecs((s) => s + 1), 1000);
    } catch (e: any) {
      toast.error("Não foi possível acessar o microfone: " + (e?.message ?? ""));
    }
  }

  function stopStream() {
    stopLevelMeter();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (recTimerRef.current) { clearInterval(recTimerRef.current); recTimerRef.current = null; }
    setRecording(false);
    lockedRef.current = false;
    setRecLocked(false);
    setHoldDy(0);
  }

  async function stopAndSendAudio() {
    const mr = mediaRecRef.current;
    if (!mr) return;
    const blob: Blob = await new Promise((resolve) => {
      mr.onstop = () => resolve(new Blob(chunksRef.current, { type: mr.mimeType || "audio/webm" }));
      mr.stop();
    });
    stopStream();
    const type = blob.type || "audio/webm";
    const ext = type.includes("ogg") ? "ogg" : type.includes("mp4") ? "m4a" : "webm";
    // Mostra o áudio na conversa na hora; upload e envio seguem em segundo plano.
    const localUrl = URL.createObjectURL(blob);
    const tmpId = onLocalMedia?.(localUrl, "audio", type.split(";")[0]) ?? null;
    void (async () => {
      try {
        const uploaded = await uploadToStorage(blob, ext, `audio.${ext}`, type.split(";")[0]);
        await sendAudioFn({ data: { numero: active, contatoNome: activeName, audio: uploaded.url, midiaUrl: null, storageKey: uploaded.storageKey, mimetype: type.split(";")[0] } });
        // O áudio real já foi gravado no servidor: remove a prévia local
        // para não ficar duplicado (a cópia local não tem duração).
        if (tmpId) setTimeout(() => onLocalMediaFail?.(tmpId), 400);
      } catch (e: any) {
        if (tmpId) onLocalMediaFail?.(tmpId);
        toast.error(e?.message ?? "Falha ao enviar áudio");
      }
    })();

  }

  function cancelRecording() {
    try { mediaRecRef.current?.stop(); } catch {}
    stopStream();
    chunksRef.current = [];
    lockedRef.current = false;
    setRecLocked(false);
    setHoldDy(0);
  }

  // --- Segurar para gravar / arrastar pra cima para travar / tocar para travar (estilo WhatsApp) ---
  function onMicPointerDown(e: React.PointerEvent) {
    if (disabled || recording) return;
    if (e.pointerType === "mouse") return; // desktop segue com clique
    e.preventDefault();
    e.stopPropagation();
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch {}
    try { window.getSelection()?.removeAllRanges(); } catch {}
    document.body.classList.add("rec-noselect");
    holdStartRef.current = { x: e.clientX, y: e.clientY, t: Date.now() };
    lockedRef.current = false;
    setRecLocked(false);
    setHoldDy(0);
    void startRecording();

    let moved = 0;
    const onMove = (ev: PointerEvent) => {
      ev.preventDefault();
      const s = holdStartRef.current;
      if (!s || lockedRef.current) return;
      const dy = s.y - ev.clientY;
      const dx = ev.clientX - s.x;
      moved = Math.max(moved, Math.abs(dx) + Math.abs(dy));
      setHoldDy(Math.max(0, Math.min(dy, 90)));
      if (dx < -90) {
        cleanup();
        cancelRecording();
        return;
      }
      if (dy > 70) {
        lockedRef.current = true;
        setRecLocked(true);
        setHoldDy(90);
        cleanup();
      }
    };
    const onUp = () => {
      cleanup();
      if (lockedRef.current) return;
      const held = Date.now() - (holdStartRef.current?.t ?? 0);
      setHoldDy(0);
      if (held < 500 && moved < 12) {
        // Toque curto: trava a gravação (aperta e solta, continua gravando)
        lockedRef.current = true;
        setRecLocked(true);
        toast.info("Gravando… toque em enviar quando terminar");
      } else {
        void stopAndSendAudio();
      }
    };
    const cleanup = () => {
      document.body.classList.remove("rec-noselect");
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }



  const disabled = sending || busy;

  if (ownerId !== currentUserId) {
    const deOutro = !!ownerId;
    return (
      <div className="border-t border-[color:var(--hairline)] bg-[color:var(--panel)] px-3 sm:px-4 py-3 sm:py-4">
        <div className="flex items-center gap-3 px-3 sm:px-4 py-3 rounded-2xl border border-[color:var(--hairline)] bg-[color:var(--panel-2)]">
          <div className="size-9 shrink-0 rounded-full grid place-items-center bg-[color:var(--brand-soft)] text-[color:var(--brand-text)]">
            <Hand className="size-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-semibold truncate">
              {deOutro ? `Ticket de ${ownerNome || "outro atendente"}` : "Ticket não aceito"}
            </div>
            <div className="text-[11.5px] text-muted-foreground">
              {deOutro
                ? "Aceite para assumir a conversa e virar o dono do lead."
                : "Aceite o atendimento para responder — você vira o dono e responsável pelo lead."}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button size="sm" className="h-8 rounded-full" onClick={onAssumir}>
              <Hand className="size-3.5 mr-1" /> {deOutro ? "Assumir" : "Aceitar"}
            </Button>
            {onEncaminhar && (
              <Button size="sm" variant="outline" className="h-8 rounded-full" onClick={onEncaminhar}>
                <Forward className="size-3.5 mr-1" /> Encaminhar
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (iaAtiva) {
    return (
      <div className="border-t border-[color:var(--hairline)] bg-[color:var(--panel)] px-4 py-4">
        <div className="flex items-center gap-3 px-4 py-3 rounded-2xl border border-[color:var(--hairline)] bg-[color:var(--panel-2)]">
          <div className="size-9 rounded-full grid place-items-center bg-[color:var(--brand-soft)] text-[color:var(--brand-text)] overflow-hidden">
            {agentTraits || agentAvatarUrl ? (
              <AgentAvatar traits={agentTraits} avatarUrl={agentAvatarUrl} size={36} />

            ) : (
              <Bot className="size-4" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-semibold">
              {ownerId ? `Atendimento com ${ownerNome}` : "IA em atendimento"}
            </div>
            <div className="text-[11.5px] text-muted-foreground">
              {ownerId ? `O lead está com ${ownerNome}. Pause para assumir.` : "Envio desativado. Pause a IA para responder."}
            </div>
          </div>
          <Button size="sm" variant="outline" className="h-8 rounded-full shrink-0" onClick={onAssumir}>
            <Hand className="size-3.5 mr-1" /> Pausar IA
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="border-t border-[color:var(--hairline)] bg-[color:var(--panel)] pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:pb-2">
      {replyTo && (
        <div className="mx-4 mt-2 flex items-start gap-2 px-3 py-2 rounded-lg border-l-2 border-[color:var(--brand)] bg-[color:var(--panel-2)]">
          <Reply className="size-3.5 mt-0.5 text-[color:var(--brand)] shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-[10.5px] font-semibold text-[color:var(--brand)]">
              Respondendo a {replyTo.direcao === "saida" ? "você" : (replyTo.contato_nome ?? "contato")}
            </div>
            <div className="text-[12px] text-muted-foreground truncate">
              {replyTo.texto || (replyTo.midia_tipo ? `[${replyTo.midia_tipo}]` : "")}
            </div>
          </div>
          <button type="button" onClick={() => onCancelReply?.()} className="p-1 rounded hover:bg-[color:var(--panel)]" title="Cancelar">
            <X className="size-3.5" />
          </button>
        </div>
      )}


      {showTpl && filtered.length > 0 && (
        <div className="mx-4 mb-2 mt-2 max-h-56 overflow-auto rounded-xl border border-[color:var(--hairline)] bg-[color:var(--panel)] shadow-lg p-1">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground px-2 py-1.5 font-semibold">
            Respostas rápidas · Esc fecha
          </div>
          {filtered.map((item) => (
            <button
              key={`${item.kind}-${item.id}`}
              type="button"
              onClick={() => {
                if (item.kind === "quick") {
                  void pickQuickReply(item.qr);
                } else {
                  const tpl = templates.find((t) => t.id === item.id);
                  setText(tpl?.texto ?? "");
                  setShowTpl(false);
                  inputRef.current?.focus();
                }
              }}
              className="w-full text-left flex gap-2 px-2 py-2 rounded-md hover:bg-[color:var(--panel-2)] text-sm items-center"
            >
              <code className="text-[11px] bg-muted px-1.5 py-0.5 rounded font-mono shrink-0">/{item.atalho}</code>
              {item.kind === "quick" && item.tipo !== "texto" && (
                <span className="text-[10px] uppercase font-semibold text-[color:var(--brand)] shrink-0">{item.tipo}</span>
              )}
              <span className="truncate text-muted-foreground">{item.preview}</span>
            </button>
          ))}
        </div>
      )}

      {!recording && (
        <div className="px-2.5 sm:px-4 pt-2 grid grid-cols-[auto_auto_minmax(0,1fr)_auto] items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowQuickPanel(true)}
            className="h-8 shrink-0 rounded-full px-2.5 text-[12px] sm:px-3 sm:text-[12.5px]"
          >
            <MessageSquareText className="size-3.5 shrink-0" />
            <span className="whitespace-nowrap">Mensagens rápidas</span>
          </Button>
          <button type="button" onClick={() => favoritesRef.current?.scrollBy({ left: -220, behavior: "smooth" })} className={`size-7 shrink-0 rounded-full grid place-items-center border border-[color:var(--hairline)] text-muted-foreground hover:bg-[color:var(--panel-2)] ${favoriteScroll.left ? "visible" : "invisible"}`} aria-label="Ver favoritos anteriores" tabIndex={favoriteScroll.left ? 0 : -1}>
            <ChevronLeft className="size-4" />
          </button>
          <div ref={favoritesRef} className="min-w-0 flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {favoritos.map((qr) => (
            <button
              key={qr.id}
              type="button"
              disabled={busy}
              onClick={() => void sendQuickReply(qr)}
              title={qr.tipo === "texto" ? (qr.texto || "") : (qr.media_nome || qr.tipo)}
              className="inline-flex items-center gap-1.5 shrink-0 max-w-[140px] sm:max-w-[220px] px-2.5 sm:px-3 py-1.5 rounded-full border border-[color:var(--hairline)] bg-[color:var(--brand-soft)] text-[color:var(--brand-text)] text-[12px] sm:text-[12.5px] font-medium hover:brightness-95 transition disabled:opacity-50"
            >
              <Send className="size-3.5 shrink-0 opacity-70" />
              <span className="truncate">{qr.titulo || `/${qr.atalho}`}</span>
            </button>
          ))}
          </div>
          <button type="button" onClick={() => favoritesRef.current?.scrollBy({ left: 220, behavior: "smooth" })} className={`size-7 shrink-0 rounded-full grid place-items-center border border-[color:var(--hairline)] text-muted-foreground hover:bg-[color:var(--panel-2)] ${favoriteScroll.right ? "visible" : "invisible"}`} aria-label="Ver mais favoritos" tabIndex={favoriteScroll.right ? 0 : -1}>
            <ChevronRight className="size-4" />
          </button>
        </div>
      )}

      {recording ? (
        <div className="px-2.5 sm:px-4 py-2 sm:py-3 flex items-center gap-2 sm:gap-3">
          <button type="button" onClick={cancelRecording} className="size-10 rounded-full grid place-items-center text-red-500 hover:bg-red-500/10" aria-label="Cancelar">
            <Trash2 className="size-4" />
          </button>
          <div className="flex-1 flex items-center gap-2 px-4 py-2.5 rounded-full bg-red-500/10 text-red-500">
            <span className="size-2.5 rounded-full bg-red-500 animate-pulse" />
            <span className="text-[13px] font-semibold tabular-nums">
              {Math.floor(recSecs / 60).toString().padStart(2, "0")}:{(recSecs % 60).toString().padStart(2, "0")}
            </span>
            <div className="flex-1 min-w-0 flex items-center gap-[2px] h-7" aria-hidden>
              {Array.from({ length: 48 }).map((_, i) => {
                const lvl = recLevels[recLevels.length - 48 + i] ?? 0;
                const h = Math.max(8, Math.round(lvl * 100));
                return (
                  <span
                    key={i}
                    className="flex-1 rounded-full bg-red-500/70 transition-[height] duration-75"
                    style={{ height: `${h}%`, minWidth: 2 }}
                  />
                );
              })}
            </div>
            <span className="text-[12px] opacity-70 truncate hidden sm:inline">
              {isMobileWidth && !recLocked
                ? (holdDy > 20 ? "↑ Solte para travar" : "↑ Arraste pra travar · ← cancelar")
                : recLocked ? "Travado · toque em enviar" : "Gravando…"}
            </span>


          </div>

          <button
            type="button"
            onClick={() => void stopAndSendAudio()}
            disabled={busy}
            className="size-11 rounded-full grid place-items-center text-primary-foreground bg-[color:var(--brand)] hover:brightness-110 transition"
            aria-label="Enviar áudio"
          >
            <Send className="size-4" />
          </button>
        </div>
      ) : (
        <form
          onSubmit={(e) => { e.preventDefault(); submit(); }}
          className="px-2.5 sm:px-4 py-2 sm:py-3 flex gap-1.5 sm:gap-2 items-end"
        >
          <input
            ref={fileRef}
            type="file"
            hidden
            multiple
            onChange={(e) => {
              const list = Array.from(e.target.files ?? []);
              if (list.length) setPendingFiles(list);
              if (fileRef.current) fileRef.current.value = "";
            }}
          />
          {pendingFiles.length > 0 && (
            <MediaPreviewDialog
              files={pendingFiles}
              busy={busy}
              onRemove={(i) => setPendingFiles((p) => p.filter((_, idx) => idx !== i))}
              onCancel={() => setPendingFiles([])}
              onSend={async (caption) => {
                const list = pendingFiles;
                setPendingFiles([]);
                for (let i = 0; i < list.length; i++) {
                  await handleFile(list[i]!, i === 0 ? caption : "");
                }
              }}
            />
          )}
          <ComposerPlusMenu
            disabled={disabled}
            onAttach={() => fileRef.current?.click()}
            onContact={() => setContactOpen(true)}
            onCatalog={() => void openProdutos()}

            onEmoji={(e) => {
              setText((t) => t + e);
              inputRef.current?.focus();
            }}
          />
          <SendContactDialog
            open={contactOpen}
            onOpenChange={setContactOpen}
            numero={active}
            contatoNome={activeName}
          />



          <AiAssistButton
            numero={active}
            rascunho={text}
            disabled={disabled}
            onTexto={(t) => {
              setText(t);
              setTimeout(() => inputRef.current?.focus(), 0);
            }}
          />

          <button
            type="button"
            onClick={() => setAgendarOpen(true)}
            title="Agendar"
            aria-label="Agendar"
            className="size-10 shrink-0 rounded-full grid place-items-center text-muted-foreground hover:bg-[color:var(--panel-2)] hover:text-[color:var(--brand)] transition"
          >
            <CalendarPlus className="size-5" />
          </button>



          <textarea
            ref={inputRef}
            value={text}
            onChange={(e) => handleTextChange(e.target.value)}
            onPaste={(e) => {
              const items = Array.from(e.clipboardData?.items ?? []);
              const files = items
                .filter((it) => it.kind === "file")
                .map((it) => it.getAsFile())
                .filter((f): f is File => !!f);
              if (!files.length) return;
              e.preventDefault();
              (async () => {
                for (let i = 0; i < files.length; i++) {
                  const f = files[i]!;
                  const named = f.name && f.name !== "image.png"
                    ? f
                    : new File([f], `print-${Date.now()}.${(f.type.split("/")[1] || "png")}`, { type: f.type });
                  await handleFile(named, i === 0 ? text.trim() : "");
                }
                setText("");
              })();
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") setShowTpl(false);
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
            }}

            placeholder={isMobileWidth ? "Mensagem…  (/ atalhos)" : "Escreva uma mensagem…   (/ para respostas rápidas)"}
            disabled={busy}
            rows={1}
            wrap="soft"
             className="chat-composer-textarea no-scrollbar flex-1 min-w-0 resize-none overflow-x-hidden overflow-y-auto whitespace-pre-wrap break-words max-h-[150px] min-h-[46px] lg:min-h-[52px] bg-muted border border-border rounded-[20px] px-3.5 sm:px-4 py-3 text-[13.5px] leading-snug outline-none focus:border-primary/60"
          />

          {text.trim() ? (
            <button
            type="submit"
            disabled={disabled}
            onMouseDown={(e) => e.preventDefault()}
              className="size-10 sm:size-11 shrink-0 rounded-full grid place-items-center text-primary-foreground bg-[color:var(--brand)] hover:brightness-110 transition disabled:opacity-50 shadow-sm"
              aria-label="Enviar"
            >
              <Send className="size-4" />
            </button>
          ) : (
            <button
              type="button"
              onPointerDown={onMicPointerDown}
              onClick={(e) => { if (e.detail === 0 || (e.nativeEvent as PointerEvent).pointerType === "mouse") void startRecording(); }}
              onContextMenu={(e) => e.preventDefault()}
              disabled={disabled}
              style={{ touchAction: "none" }}
              className="size-10 sm:size-11 shrink-0 rounded-full grid place-items-center text-primary-foreground bg-[color:var(--brand)] hover:brightness-110 transition disabled:opacity-50 shadow-sm select-none"
              aria-label="Gravar áudio"
              title="Gravar áudio (segure e arraste pra cima para travar)"
            >
              <Mic className="size-4" />
            </button>
          )}

        </form>
      )}

      <Dialog open={showProdutos} onOpenChange={setShowProdutos}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="size-5 text-[color:var(--brand)]" /> Enviar produto do catálogo
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Buscar por nome, SKU, categoria..."
              value={prodSearch}
              onChange={(e) => setProdSearch(e.target.value)}
            />
            {!produtosLoaded ? (
              <div className="py-8 text-center text-sm text-muted-foreground">Carregando...</div>
            ) : produtos.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                Nenhum produto ativo. Cadastre em <b>Catálogo</b>.
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-[420px] overflow-auto pr-1">
                {produtos
                  .filter((p) => {
                    const q = prodSearch.toLowerCase();
                    return !q || p.nome.toLowerCase().includes(q) || (p.sku || "").toLowerCase().includes(q) || (p.categoria || "").toLowerCase().includes(q);
                  })
                  .map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => void sendProduto(p)}
                      disabled={!p.foto_url}
                      className="text-left rounded-lg border border-[color:var(--hairline)] overflow-hidden hover:border-[color:var(--brand)] transition disabled:opacity-50"
                      title={!p.foto_url ? "Produto sem foto" : "Enviar produto"}
                    >
                      <div className="aspect-square bg-muted">
                        {p.foto_url && <img src={p.foto_url} className="w-full h-full object-cover" loading="lazy" />}
                      </div>
                      <div className="p-2">
                        <div className="text-[12.5px] font-semibold truncate">{p.nome}</div>
                        <div className="text-[12px] font-bold text-[color:var(--brand)]">
                          {Number(p.preco || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                        </div>
                      </div>
                    </button>
                  ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <QuickRepliesDialog
        open={showQuickPanel}
        onOpenChange={setShowQuickPanel}
        items={quickReplies}
        onSend={(qr) => void sendQuickReply(qr)}
        onInsert={(qr) => insertQuickReply(qr)}
        onToggleFavorito={(qr) => void toggleFavorito(qr)}
        onDelete={(qr) => void removeQuickReply(qr)}
      />
      <QuickScheduleDialog
        open={agendarOpen}
        onOpenChange={setAgendarOpen}
        target={scheduleTarget}
      />
    </div>
  );
}


/* =============== Emoji Picker =============== */
const EMOJI_LIST = [
  "😀","😃","😄","😁","😆","😅","🤣","😂","🙂","🙃","😉","😊","😇","🥰","😍","🤩","😘","😗","😚","😙",
  "😋","😛","😜","🤪","😝","🤑","🤗","🤭","🤫","🤔","🤐","🤨","😐","😑","😶","😏","😒","🙄","😬","🤥",
  "😌","😔","😪","🤤","😴","😷","🤒","🤕","🤢","🤮","🥵","🥶","🥴","😵","🤯","🤠","🥳","😎","🤓","🧐",
  "😕","😟","🙁","☹️","😮","😯","😲","😳","🥺","😦","😧","😨","😰","😥","😢","😭","😱","😖","😣","😞",
  "😓","😩","😫","🥱","😤","😡","😠","🤬","👍","👎","👏","🙏","🙌","👌","✌️","🤞","🤝","💪","❤️","🔥",
  "✨","🎉","🎊","💯","✅","❌","⚠️","💰","💵","💸","📌","📎","📷","📱","💻","⏰","🕐","📅","📞","✉️",
];

function EmojiPickerButton({ onPick, disabled }: { onPick: (e: string) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
    window.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("mousedown", onDoc); window.removeEventListener("keydown", onKey); };
  }, [open]);
  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        className="size-10 rounded-full grid place-items-center text-muted-foreground hover:text-foreground hover:bg-[color:var(--panel-2)] transition disabled:opacity-40"
        aria-label="Emoji"
        title="Inserir emoji"
      >
        <Smile className="size-5" />
      </button>
      {open && (
        <div className="absolute bottom-12 left-0 z-30 w-[280px] max-h-[240px] overflow-auto p-2 rounded-2xl border border-[color:var(--hairline)] bg-[color:var(--panel)] shadow-xl grid grid-cols-8 gap-1">
          {EMOJI_LIST.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => { onPick(e); setOpen(false); }}
              className="size-8 grid place-items-center rounded-md hover:bg-[color:var(--panel-2)] text-lg"
            >
              {e}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* =============== Composer Plus Menu (Attach + Catalog + Emoji) =============== */
function ComposerPlusMenu({
  disabled,
  onAttach,
  onCatalog,
  onContact,
  onEmoji,
}: {
  disabled?: boolean;
  onAttach: () => void;
  onCatalog: () => void;
  onContact: () => void;

  onEmoji: (e: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"menu" | "emoji">("menu");
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
    window.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("mousedown", onDoc); window.removeEventListener("keydown", onKey); };
  }, [open]);

  useEffect(() => { if (!open) setView("menu"); }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        className="size-10 rounded-full grid place-items-center text-muted-foreground hover:text-foreground hover:bg-[color:var(--panel-2)] transition disabled:opacity-40"
        aria-label="Mais ações"
        title="Anexar, catálogo ou emoji"
      >
        <Plus className={`size-5 transition-transform ${open ? "rotate-45" : ""}`} />
      </button>
      {open && (
        view === "menu" ? (
          <div className="absolute bottom-12 left-0 z-30 min-w-[220px] p-1.5 rounded-2xl border border-[color:var(--hairline)] bg-[color:var(--panel)] shadow-xl">
            <button
              type="button"
              onClick={() => { setOpen(false); onAttach(); }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[color:var(--panel-2)] text-[13.5px]"
            >
              <Paperclip className="size-4 text-muted-foreground" />
              <span>Anexar arquivo</span>
            </button>
            <button
              type="button"
              onClick={() => { setOpen(false); onContact(); }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[color:var(--panel-2)] text-[13.5px]"
            >
              <UserRound className="size-4 text-muted-foreground" />
              <span>Contato</span>
            </button>
            <button
              type="button"
              onClick={() => { setOpen(false); onCatalog(); }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[color:var(--panel-2)] text-[13.5px]"
            >
              <Package className="size-4 text-muted-foreground" />
              <span>Catálogo</span>
            </button>

            <button
              type="button"
              onClick={() => setView("emoji")}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[color:var(--panel-2)] text-[13.5px]"
            >
              <Smile className="size-4 text-muted-foreground" />
              <span>Emoji</span>
            </button>
          </div>
        ) : (
          <div className="absolute bottom-12 left-0 z-30 w-[280px] max-h-[260px] overflow-auto p-2 rounded-2xl border border-[color:var(--hairline)] bg-[color:var(--panel)] shadow-xl grid grid-cols-8 gap-1">
            {EMOJI_LIST.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => { onEmoji(e); setOpen(false); }}
                className="size-8 grid place-items-center rounded-md hover:bg-[color:var(--panel-2)] text-lg"
              >
                {e}
              </button>
            ))}
          </div>
        )
      )}
    </div>
  );
}

// ============ Helpers de data ============
function isSameDay(a: string, b: string) {
  const d1 = new Date(a); const d2 = new Date(b);
  return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate();
}
function formatDaySeparator(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yest = new Date(); yest.setDate(today.getDate() - 1);
  if (isSameDay(iso, today.toISOString())) return "Hoje";
  if (isSameDay(iso, yest.toISOString())) return "Ontem";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
}

// Formato estilo WhatsApp para a lista de conversas
function formatListTimestamp(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOfDay(now) - startOfDay(d)) / 86400000);
  if (diffDays <= 0) return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (diffDays === 1) return "Ontem";
  if (diffDays < 7) {
    const w = d.toLocaleDateString("pt-BR", { weekday: "long" });
    return w.charAt(0).toUpperCase() + w.slice(1).replace("-feira", "");
  }
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

// ============ Nova conversa ============
function NewConversationDialog({
  open, onOpenChange, onStart,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onStart: (numero: string, nome: string | null) => void;
}) {
  const [numero, setNumero] = useState("");
  const [nome, setNome] = useState("");

  function normalize(v: string) {
    return v.replace(/\D+/g, "");
  }
  function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = normalize(numero);
    if (n.length < 8) { toast.error("Informe um número válido com código internacional ou DDD."); return; }
    const withCc = normalizePhone(n);
    onStart(withCc, nome.trim() || null);
    setNumero(""); setNome("");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nova conversa</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3 pt-1">
          <div>
            <label className="text-[12px] font-semibold text-muted-foreground">Número (com DDD)</label>
            <Input
              autoFocus
              value={numero}
              onChange={(e) => setNumero(e.target.value)}
              placeholder="Ex: 11 91234-5678"
              className="mt-1"
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Sem o +55 é adicionado automaticamente.
            </p>
          </div>
          <div>
            <label className="text-[12px] font-semibold text-muted-foreground">Nome (opcional)</label>
            <Input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Como identificar este contato"
              className="mt-1"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit">
              <MessageSquareText className="size-4 mr-1.5" /> Abrir conversa
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ContactPickerDialog({
  open, onOpenChange, companyId, onPick,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  companyId?: string;
  onPick: (numero: string, nome: string | null) => void;
}) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<{ numero: string; nome: string | null }[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !companyId) return;
    let cancel = false;
    setLoading(true);
    const t = setTimeout(async () => {
      let query = supabase.from("crm_cards").select("numero,nome").eq("company_id", companyId)
        .order("ultima_em", { ascending: false, nullsFirst: false }).limit(50);
      const term = q.trim();
      if (term) query = query.or(`nome.ilike.%${term}%,numero.ilike.%${term}%`);
      const { data } = await query;
      if (!cancel) { setRows((data ?? []) as any); setLoading(false); }
    }, 250);
    return () => { cancel = true; clearTimeout(t); };
  }, [open, companyId, q]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Iniciar conversa com contato salvo</DialogTitle>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <Input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nome ou número..."
            className="pl-9 h-10 rounded-xl bg-muted/60 border-transparent text-[13px]"
          />
        </div>
        <div className="max-h-[320px] overflow-auto -mx-2 px-2">
          {loading && <p className="py-6 text-center text-sm text-muted-foreground">Carregando…</p>}
          {!loading && rows.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">Nenhum contato encontrado.</p>
          )}
          {!loading && rows.map((c) => (
            <button
              key={c.numero}
              type="button"
              onClick={() => onPick(c.numero, c.nome)}
              className="w-full flex items-center gap-3 px-2 py-2.5 rounded-xl hover:bg-muted text-left transition-colors"
            >
              <InitialsAvatar name={c.nome ?? c.numero} size={34} />
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-semibold truncate">{c.nome ?? c.numero}</div>
                <div className="text-[11.5px] text-muted-foreground font-mono truncate">{c.numero}</div>
              </div>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
