import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  HeadsetIcon, Send, Loader2, Paperclip, X, Search, Zap, Building2, CreditCard,
  Smartphone, Sparkles, History, Check, CheckCheck, Plus, Pencil, Trash2, PanelRight,
  StickyNote, Timer, UserCheck, Tag, Star, ChevronLeft,
} from "lucide-react";
import { toast } from "sonner";
import {
  listAllTickets, listMessages, sendMessage, markRead, setTicketStatus,
  ticketContext, listMacros, upsertMacro, deleteMacro,
  setTicketMeta, listSupportAgents, listNotes, addNote, deleteNote,
} from "@/lib/support.functions";
import { SupportMetricsDialog } from "@/components/support/support-metrics-dialog";
import { SupportConfigDialog } from "@/components/support/support-config-dialog";
import { SUPPORT_CATEGORIAS, SUPPORT_PRIORIDADES, SLA_MINUTOS } from "@/lib/support-constants";


export const Route = createFileRoute("/master/suporte")({
  validateSearch: (s: Record<string, unknown>): { v?: "metricas" | "automacao" | "macros" } => {
    const v = s.v;
    return v === "metricas" || v === "automacao" || v === "macros" ? { v } : {};
  },
  component: SuportePage,
});


const statusColors: Record<string, string> = {
  aberto: "bg-amber-100 text-amber-800",
  andamento: "bg-blue-100 text-blue-800",
  resolvido: "bg-emerald-100 text-emerald-800",
};

const brl = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function slaTone(iso?: string | null) {
  if (!iso) return "text-muted-foreground";
  const h = (Date.now() - new Date(iso).getTime()) / 3600000;
  if (h < 1) return "text-emerald-600";
  if (h < 4) return "text-amber-600";
  return "text-red-600";
}

function sinceLabel(iso?: string | null) {
  if (!iso) return "—";
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

const prioMeta: Record<string, { label: string; color: string; bg: string }> = {
  baixa: { label: "Baixa", color: "#64748b", bg: "bg-slate-100 text-slate-700" },
  normal: { label: "Normal", color: "#214AC4", bg: "bg-blue-100 text-blue-800" },
  alta: { label: "Alta", color: "#f59e0b", bg: "bg-amber-100 text-amber-800" },
  urgente: { label: "Urgente", color: "#ef4444", bg: "bg-red-100 text-red-800" },
};

/** SLA de primeira resposta: retorna rótulo + tom */
function slaInfo(t: any) {
  if (!t) return null;
  const mins = SLA_MINUTOS[t.prioridade || "normal"] ?? 480;
  const due = t.sla_due_at
    ? new Date(t.sla_due_at).getTime()
    : new Date(t.created_at).getTime() + mins * 60000;

  if (t.first_response_at) {
    const ok = new Date(t.first_response_at).getTime() <= due;
    return {
      label: ok ? "SLA cumprido" : "SLA estourado",
      tone: ok ? "text-emerald-600" : "text-red-600",
      done: true,
    };
  }
  const left = Math.round((due - Date.now()) / 60000);
  if (left < 0) return { label: `SLA estourado há ${sinceLabel(new Date(due).toISOString())}`, tone: "text-red-600", done: false };
  const label = left < 60 ? `${left}min p/ responder` : `${Math.floor(left / 60)}h p/ responder`;
  return { label, tone: left < 30 ? "text-amber-600" : "text-emerald-600", done: false };
}

function applyVars(text: string, vars: Record<string, string>) {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => vars[k] ?? "");
}


function SuportePage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"aberto" | "andamento" | "resolvido" | "todos">("todos");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [chatSearch, setChatSearch] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [showContext, setShowContext] = useState(true);
  const [macroOpen, setMacroOpen] = useState(false);
  const [macroQuery, setMacroQuery] = useState("");
  const { v: viewParam } = Route.useSearch();
  const navigate = useNavigate();
  const setView = useCallback(
    (nv?: "metricas" | "automacao" | "macros") =>
      navigate({ to: "/master/suporte", search: nv ? { v: nv } : {} }),
    [navigate],
  );
  const macroMgr = viewParam === "macros";
  const setMacroMgr = (open: boolean) => setView(open ? "macros" : undefined);

  const [clientTyping, setClientTyping] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [prioFilter, setPrioFilter] = useState<string>("todas");
  const [catFilter, setCatFilter] = useState<string>("todas");
  const [agentFilter, setAgentFilter] = useState<string>("todos");
  const [noteDraft, setNoteDraft] = useState("");
  const metricsOpen = viewParam === "metricas";
  const setMetricsOpen = (open: boolean) => setView(open ? "metricas" : undefined);
  const configOpen = viewParam === "automacao";
  const setConfigOpen = (open: boolean) => setView(open ? "automacao" : undefined);

  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const presenceRef = useRef<any>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const listFn = useServerFn(listAllTickets);
  const msgsFn = useServerFn(listMessages);
  const sendFn = useServerFn(sendMessage);
  const readFn = useServerFn(markRead);
  const statusFn = useServerFn(setTicketStatus);
  const ctxFn = useServerFn(ticketContext);
  const macrosFn = useServerFn(listMacros);
  const saveMacroFn = useServerFn(upsertMacro);
  const delMacroFn = useServerFn(deleteMacro);
  const metaFn = useServerFn(setTicketMeta);
  const agentsFn = useServerFn(listSupportAgents);
  const notesFn = useServerFn(listNotes);
  const addNoteFn = useServerFn(addNote);
  const delNoteFn = useServerFn(deleteNote);

  const ticketsQ = useQuery({
    queryKey: ["master", "support", "tickets", filter],
    queryFn: () => listFn({ data: { status: filter } }),
    refetchOnWindowFocus: false,
  });
  const allTickets: any[] = (ticketsQ.data as any)?.rows ?? [];
  const tickets = useMemo(() => allTickets.filter((t) => {
    if (prioFilter !== "todas" && (t.prioridade || "normal") !== prioFilter) return false;
    if (catFilter !== "todas" && (t.categoria || "Geral") !== catFilter) return false;
    if (agentFilter === "nao_atribuidos" && t.assigned_to) return false;
    if (agentFilter !== "todos" && agentFilter !== "nao_atribuidos" && t.assigned_to !== agentFilter) return false;
    return true;
  }), [allTickets, prioFilter, catFilter, agentFilter]);
  const totalUnread = useMemo(() => tickets.reduce((s, t) => s + (t.unread_admin || 0), 0), [tickets]);

  const agentsQ = useQuery({
    queryKey: ["master", "support", "agents"],
    queryFn: () => agentsFn({ data: {} as any }),
    refetchOnWindowFocus: false,
  });
  const agents: any[] = (agentsQ.data as any)?.rows ?? [];

  const notesQ = useQuery({
    queryKey: ["master", "support", "notes", activeId],
    queryFn: () => notesFn({ data: { ticket_id: activeId! } }),
    enabled: !!activeId,
    refetchOnWindowFocus: false,
  });
  const notes: any[] = (notesQ.data as any)?.rows ?? [];


  const msgsQ = useQuery({
    queryKey: ["master", "support", "messages", activeId],
    queryFn: () => msgsFn({ data: { ticket_id: activeId! } }),
    enabled: !!activeId,
    refetchOnWindowFocus: false,
  });
  const messages: any[] = (msgsQ.data as any)?.rows ?? [];

  const ctxQ = useQuery({
    queryKey: ["master", "support", "context", activeId],
    queryFn: () => ctxFn({ data: { ticket_id: activeId! } }),
    enabled: !!activeId,
    refetchOnWindowFocus: false,
  });
  const ctx: any = ctxQ.data ?? null;

  const macrosQ = useQuery({
    queryKey: ["master", "support", "macros"],
    queryFn: () => macrosFn({ data: {} as any }),
    refetchOnWindowFocus: false,
  });
  const macros: any[] = (macrosQ.data as any)?.rows ?? [];

  useEffect(() => {
    const ch = supabase
      .channel("master:support")
      .on("postgres_changes", { event: "*", schema: "public", table: "support_ticket" }, () => {
        qc.invalidateQueries({ queryKey: ["master", "support", "tickets"] });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "support_message" }, (p: any) => {
        if (activeId === p.new?.ticket_id) qc.invalidateQueries({ queryKey: ["master", "support", "messages", activeId] });
        qc.invalidateQueries({ queryKey: ["master", "support", "tickets"] });
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "support_message" }, (p: any) => {
        if (activeId === p.new?.ticket_id) qc.invalidateQueries({ queryKey: ["master", "support", "messages", activeId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [activeId, qc]);

  // Presence "digitando…"
  useEffect(() => {
    if (!activeId) { presenceRef.current = null; setClientTyping(false); return; }
    const ch = supabase.channel(`support-typing:${activeId}`, { config: { presence: { key: "admin" } } });
    ch.on("presence", { event: "sync" }, () => {
      const state: any = ch.presenceState();
      const others = Object.entries(state).filter(([k]) => k !== "admin");
      setClientTyping(others.some(([, v]: any) => v?.some?.((x: any) => x.typing)));
    }).subscribe(async (s) => {
      if (s === "SUBSCRIBED") await ch.track({ typing: false });
    });
    presenceRef.current = ch;
    return () => { supabase.removeChannel(ch); presenceRef.current = null; };
  }, [activeId]);

  const signalTyping = useCallback(() => {
    const ch = presenceRef.current;
    if (!ch) return;
    ch.track({ typing: true });
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => ch.track({ typing: false }), 2500);
  }, []);

  useEffect(() => {
    if (activeId) readFn({ data: { ticket_id: activeId } }).then(() => qc.invalidateQueries({ queryKey: ["master", "support", "tickets"] }));
  }, [activeId, messages.length, readFn, qc]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length, activeId]);

  async function uploadFiles(companyId: string): Promise<any[]> {
    const uploaded: any[] = [];
    for (const f of files) {
      if (f.size > 5 * 1024 * 1024) { toast.error(`${f.name}: máx. 5MB`); continue; }
      const path = `${companyId}/${Date.now()}-${f.name.replace(/[^\w.\-]+/g, "_")}`;
      const { error } = await supabase.storage.from("support-attachments").upload(path, f);
      if (error) { toast.error(`Falha no upload: ${f.name}`); continue; }
      const { data: signed } = await supabase.storage.from("support-attachments").createSignedUrl(path, 60 * 60 * 24 * 7);
      uploaded.push({ path, url: signed?.signedUrl, name: f.name, size: f.size, type: f.type });
    }
    return uploaded;
  }

  const activeTicket = tickets.find((t) => t.id === activeId);

  const sendMut = useMutation({
    mutationFn: async () => {
      const attachments = activeTicket ? await uploadFiles(activeTicket.company_id) : [];
      return sendFn({ data: { ticket_id: activeId!, content: draft, attachments } });
    },
    onSuccess: () => {
      setDraft(""); setFiles([]);
      presenceRef.current?.track({ typing: false });
      qc.invalidateQueries({ queryKey: ["master", "support", "messages", activeId] });
      taRef.current?.focus();
    },
    onError: (e: any) => toast.error(e.message || "Falha ao enviar"),
  });

  const statusMut = useMutation({
    mutationFn: (v: "aberto" | "andamento" | "resolvido") => statusFn({ data: { ticket_id: activeId!, status: v } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["master", "support"] }),
  });

  const metaMut = useMutation({
    mutationFn: (patch: any) => metaFn({ data: { ticket_id: activeId!, ...patch } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["master", "support", "tickets"] }),
    onError: (e: any) => toast.error(e.message || "Falha ao atualizar"),
  });

  const noteMut = useMutation({
    mutationFn: () => addNoteFn({ data: { ticket_id: activeId!, content: noteDraft } }),
    onSuccess: () => {
      setNoteDraft("");
      qc.invalidateQueries({ queryKey: ["master", "support", "notes", activeId] });
    },
    onError: (e: any) => toast.error(e.message || "Falha ao salvar nota"),
  });


  const macroVars = useMemo(() => ({
    nome: (ctx?.owner?.nome || ctx?.owner?.nome_completo || "").split(" ")[0] || "",
    empresa: ctx?.company?.nome_fantasia || ctx?.company?.nome || "",
    plano: ctx?.subscription?.plano || "",
  }), [ctx]);

  const filteredMacros = useMemo(() => {
    const q = macroQuery.trim().toLowerCase();
    if (!q) return macros;
    return macros.filter((m) => `${m.atalho} ${m.titulo} ${m.categoria}`.toLowerCase().includes(q));
  }, [macros, macroQuery]);

  function insertMacro(m: any) {
    const text = applyVars(m.conteudo, macroVars);
    setDraft((d) => {
      const cleaned = d.replace(/\/[\w-]*$/, "");
      return (cleaned ? cleaned.replace(/\s*$/, " ") : "") + text;
    });
    setMacroOpen(false); setMacroQuery("");
    setTimeout(() => taRef.current?.focus(), 30);
  }

  function onDraftChange(v: string) {
    setDraft(v);
    signalTyping();
    const m = v.match(/(?:^|\s)\/([\w-]*)$/);
    if (m) { setMacroOpen(true); setMacroQuery(m[1]); }
    else if (macroOpen) { setMacroOpen(false); setMacroQuery(""); }
  }

  const visibleMessages = useMemo(() => {
    const q = chatSearch.trim().toLowerCase();
    if (!q) return messages;
    return messages.filter((m) => (m.content || "").toLowerCase().includes(q));
  }, [messages, chatSearch]);

  if (viewParam === "metricas") {
    return <SupportMetricsDialog inline open onOpenChange={() => setView(undefined)} />;
  }
  if (viewParam === "automacao") {
    return <SupportConfigDialog inline open onOpenChange={() => setView(undefined)} />;
  }
  if (viewParam === "macros") {
    return (
      <MacroManager
        inline open onOpenChange={() => setView(undefined)} macros={macros}
        onSave={async (m) => { await saveMacroFn({ data: m }); qc.invalidateQueries({ queryKey: ["master", "support", "macros"] }); }}
        onDelete={async (id) => { await delMacroFn({ data: { id } }); qc.invalidateQueries({ queryKey: ["master", "support", "macros"] }); }}
      />
    );
  }

  return (
    <div className="space-y-3 sm:space-y-4 h-[calc(100dvh-13rem)] lg:h-[calc(100vh-8rem)] flex flex-col">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-semibold flex items-center gap-2">
            <HeadsetIcon className="size-5 shrink-0" /> Suporte
            {totalUnread > 0 && <span className="ml-1 min-w-[22px] h-[22px] px-1.5 rounded-full bg-red-500 text-white text-xs font-bold grid place-items-center">{totalUnread}</span>}
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground">Chat ao vivo com os clientes, com contexto e respostas rápidas.</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowContext((s) => !s)}
            className="hidden xl:inline-flex size-8 text-muted-foreground hover:text-foreground"
            title={showContext ? "Ocultar contexto" : "Mostrar contexto"}
            aria-label={showContext ? "Ocultar contexto" : "Mostrar contexto"}
          >
            <PanelRight className="size-4" />
          </Button>
        </div>

      </div>

      <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          <Select value={filter} onValueChange={(v: any) => setFilter(v)}>
            <SelectTrigger className="w-[150px] shrink-0 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos status</SelectItem>
              <SelectItem value="aberto">Abertos</SelectItem>
              <SelectItem value="andamento">Em andamento</SelectItem>
              <SelectItem value="resolvido">Resolvidos</SelectItem>
            </SelectContent>
          </Select>
          <Select value={prioFilter} onValueChange={setPrioFilter}>
            <SelectTrigger className="w-[140px] shrink-0 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Toda prioridade</SelectItem>
              {SUPPORT_PRIORIDADES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={catFilter} onValueChange={setCatFilter}>
            <SelectTrigger className="w-[160px] shrink-0 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Toda categoria</SelectItem>
              {SUPPORT_CATEGORIAS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={agentFilter} onValueChange={setAgentFilter}>
            <SelectTrigger className="w-[160px] shrink-0 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos agentes</SelectItem>
              <SelectItem value="nao_atribuidos">Não atribuídos</SelectItem>
              {agents.map((a) => <SelectItem key={a.user_id} value={a.user_id}>{a.nome}</SelectItem>)}
            </SelectContent>
          </Select>
      </div>


      <div className={`flex-1 min-h-0 grid grid-cols-1 gap-4 ${showContext ? "md:grid-cols-[280px_1fr] xl:grid-cols-[300px_1fr_300px]" : "md:grid-cols-[280px_1fr]"}`}>
        {/* List */}
        <Card className={`min-h-0 flex-col overflow-hidden ${activeId ? "hidden md:flex" : "flex"}`}>
          <div className="flex-1 min-h-0 overflow-y-auto">

            {ticketsQ.isLoading ? (
              <div className="p-6 grid place-items-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
            ) : tickets.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">Nenhum chamado.</div>
            ) : (
              <ul className="divide-y">
                {tickets.map((t) => {
                  const sla = slaInfo(t);
                  const pm = prioMeta[t.prioridade || "normal"];
                  return (
                  <li key={t.id}>
                    <button
                      onClick={() => setActiveId(t.id)}
                      className={`w-full text-left px-3 py-3 hover:bg-muted flex items-start gap-2 ${activeId === t.id ? "bg-muted" : ""}`}
                    >
                      <span className="mt-1.5 size-2 rounded-full shrink-0" style={{ background: pm.color }} title={`Prioridade ${pm.label}`} />
                      {t.criador_avatar || t.company?.logo_url ? (
                        <img
                          src={t.criador_avatar || t.company?.logo_url}
                          alt=""
                          className="size-8 rounded-full object-cover border shrink-0"
                          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                        />
                      ) : (
                        <div className="size-8 rounded-full bg-muted text-muted-foreground grid place-items-center text-[11px] font-semibold shrink-0">
                          {(t.criador_nome || t.company?.nome || "?").trim().charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold truncate">{t.company?.nome || "—"}</span>
                          {t.unread_admin > 0 && <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold grid place-items-center">{t.unread_admin}</span>}
                        </div>
                        <div className="text-[11px] text-muted-foreground truncate mt-0.5">{t.assunto}</div>
                        <div className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1.5 flex-wrap">
                          <span className={`px-1.5 py-0.5 rounded-full ${statusColors[t.status]}`}>{t.status}</span>
                          <span className="px-1.5 py-0.5 rounded-full bg-muted">{t.categoria || "Geral"}</span>
                          <span className={slaTone(t.unread_admin > 0 ? t.last_message_at : null)}>
                            {sinceLabel(t.last_message_at)}
                          </span>
                          {t.csat_score && (
                            <span className="px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 flex items-center gap-0.5">
                              <Star className="size-2.5 fill-current" /> {t.csat_score}
                            </span>
                          )}
                        </div>
                        {t.status !== "resolvido" && sla && !sla.done && (
                          <div className={`text-[10px] mt-0.5 flex items-center gap-1 ${sla.tone}`}>
                            <Timer className="size-3" /> {sla.label}
                          </div>
                        )}
                      </div>
                    </button>
                  </li>
                  );
                })}

              </ul>
            )}
          </div>
        </Card>

        {/* Chat */}
        <Card
          className={`min-h-0 flex-col overflow-hidden relative ${activeId ? "flex" : "hidden md:flex"}`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault(); setDragOver(false);
            const dropped = Array.from(e.dataTransfer.files || []);
            if (dropped.length) setFiles((f) => [...f, ...dropped]);
          }}
        >
          {dragOver && activeTicket && (
            <div className="absolute inset-0 z-20 bg-primary/10 border-2 border-dashed border-primary rounded-xl grid place-items-center text-sm font-medium text-primary">
              Solte os arquivos para anexar
            </div>
          )}
          {!activeTicket ? (
            <div className="flex-1 grid place-items-center text-sm text-muted-foreground">
              Selecione um chamado para conversar.
            </div>
          ) : (
            <>
              <header className="px-3 sm:px-4 py-3 border-b space-y-2">
                <div className="flex items-center gap-2 sm:gap-3">
                  <Button
                    variant="ghost" size="icon" className="md:hidden shrink-0"
                    onClick={() => setActiveId(null)} title="Voltar"
                  >
                    <ChevronLeft className="size-4" />
                  </Button>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate text-sm sm:text-base">{activeTicket.company?.nome} · {activeTicket.assunto}</div>
                    <div className="text-[11px] text-muted-foreground flex items-center gap-2 flex-wrap">
                      <span className="hidden sm:inline">Aberto em {new Date(activeTicket.created_at).toLocaleString("pt-BR")}</span>
                      <span>última msg há <span className={slaTone(activeTicket.last_message_at)}>{sinceLabel(activeTicket.last_message_at)}</span></span>
                      {(() => {
                        const sla = slaInfo(activeTicket);
                        return sla ? (
                          <span className={`inline-flex items-center gap-1 font-medium ${sla.tone}`}>
                            <Timer className="size-3" /> {sla.label}
                          </span>
                        ) : null;
                      })()}
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" className="shrink-0" onClick={() => setShowSearch((v) => !v)} title="Buscar no chamado">
                    <Search className="size-4" />
                  </Button>
                  <Select value={activeTicket.status} onValueChange={(v: any) => statusMut.mutate(v)}>
                    <SelectTrigger className="w-[120px] sm:w-[150px] h-8 shrink-0"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="aberto">Aberto</SelectItem>
                      <SelectItem value="andamento">Em andamento</SelectItem>
                      <SelectItem value="resolvido">Resolvido</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-2 overflow-x-auto pb-0.5">
                  <Select
                    value={activeTicket.prioridade || "normal"}
                    onValueChange={(v) => metaMut.mutate({ prioridade: v })}
                  >
                    <SelectTrigger className="w-[130px] shrink-0 h-8 text-xs">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="size-2 rounded-full" style={{ background: prioMeta[activeTicket.prioridade || "normal"].color }} />
                        <SelectValue />
                      </span>
                    </SelectTrigger>
                    <SelectContent>
                      {SUPPORT_PRIORIDADES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                    </SelectContent>
                  </Select>

                  <Select
                    value={activeTicket.categoria || "Geral"}
                    onValueChange={(v) => metaMut.mutate({ categoria: v })}
                  >
                    <SelectTrigger className="w-[150px] shrink-0 h-8 text-xs">
                      <span className="inline-flex items-center gap-1.5"><Tag className="size-3" /><SelectValue /></span>
                    </SelectTrigger>
                    <SelectContent>
                      {SUPPORT_CATEGORIAS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>

                  <Select
                    value={activeTicket.assigned_to || "none"}
                    onValueChange={(v) => metaMut.mutate({ assigned_to: v === "none" ? null : v })}
                  >
                    <SelectTrigger className="w-[170px] shrink-0 h-8 text-xs">
                      <span className="inline-flex items-center gap-1.5"><UserCheck className="size-3" /><SelectValue /></span>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sem responsável</SelectItem>
                      {agents.map((a) => <SelectItem key={a.user_id} value={a.user_id}>{a.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {metaMut.isPending && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
                </div>
              </header>


              {showSearch && (
                <div className="px-4 py-2 border-b bg-muted/40">
                  <Input
                    autoFocus value={chatSearch} onChange={(e) => setChatSearch(e.target.value)}
                    placeholder="Buscar nesta conversa…" className="h-8"
                  />
                  {chatSearch && (
                    <div className="text-[11px] text-muted-foreground mt-1">{visibleMessages.length} mensagem(ns) encontrada(s)</div>
                  )}
                </div>
              )}

              <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-4 space-y-3 bg-[#f8f9fb]">
                {msgsQ.isLoading ? (
                  <div className="grid place-items-center py-6"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
                ) : visibleMessages.map((m: any) => (
                  <div key={m.id} className={`flex ${m.sender_role === "admin" ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[85%] sm:max-w-[70%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap ${
                        m.sender_role === "admin" ? "text-white rounded-br-sm" : "bg-white border rounded-bl-sm"
                      }`}
                      style={m.sender_role === "admin" ? { background: "var(--brand)" } : undefined}
                    >
                      {m.content}
                      {Array.isArray(m.attachments) && m.attachments.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {m.attachments.map((a: any, i: number) => (
                            <a key={i} href={a.url} target="_blank" rel="noreferrer" className="block max-w-[160px]">
                              {a.type?.startsWith("image/") ? (
                                <img src={a.url} alt={a.name} className="rounded-lg max-h-32 object-cover" />
                              ) : (
                                <span className="inline-flex items-center gap-1 text-xs underline break-all">
                                  <Paperclip className="size-3" /> {a.name}
                                </span>
                              )}
                            </a>
                          ))}
                        </div>
                      )}
                      <div className={`text-[10px] mt-1 flex items-center gap-1 ${m.sender_role === "admin" ? "text-white/70 justify-end" : "text-muted-foreground"}`}>
                        {new Date(m.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                        {m.sender_role === "admin" && (m.read_at ? <CheckCheck className="size-3" /> : <Check className="size-3" />)}
                      </div>
                    </div>
                  </div>
                ))}
                {clientTyping && (
                  <div className="flex justify-start">
                    <div className="bg-white border rounded-2xl rounded-bl-sm px-3 py-2 text-xs text-muted-foreground">
                      cliente digitando…
                    </div>
                  </div>
                )}
              </div>

              <div className="p-2 sm:p-3 border-t bg-white space-y-2 relative">
                {macroOpen && filteredMacros.length > 0 && (
                  <div className="absolute bottom-full left-3 right-3 mb-2 z-30 bg-white border rounded-xl shadow-lg max-h-64 overflow-y-auto">
                    <div className="px-3 py-2 text-[11px] text-muted-foreground border-b flex items-center gap-1.5">
                      <Zap className="size-3" /> Respostas rápidas — digite <b>/atalho</b>
                    </div>
                    {filteredMacros.map((m) => (
                      <button
                        key={m.id} onClick={() => insertMacro(m)}
                        className="w-full text-left px-3 py-2 hover:bg-muted border-b last:border-0"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold">{m.titulo}</span>
                          <code className="text-[10px] bg-muted px-1 rounded">/{m.atalho}</code>
                          <Badge variant="secondary" className="text-[9px] py-0">{m.categoria}</Badge>
                        </div>
                        <div className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">
                          {applyVars(m.conteudo, macroVars)}
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {files.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {files.map((f, i) => (
                      <span key={i} className="text-[11px] bg-muted rounded px-2 py-1 flex items-center gap-1">
                        {f.name}
                        <button onClick={() => setFiles(files.filter((_, k) => k !== i))}><X className="size-3" /></button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex items-end gap-2">
                  <label className="size-9 grid place-items-center rounded-lg hover:bg-muted cursor-pointer shrink-0">
                    <Paperclip className="size-4 text-muted-foreground" />
                    <input type="file" multiple className="hidden" onChange={(e) => setFiles([...files, ...Array.from(e.target.files || [])])} />
                  </label>
                  <Button
                    type="button" variant="ghost" size="icon" className="shrink-0"
                    title="Respostas rápidas" onClick={() => { setMacroOpen((v) => !v); setMacroQuery(""); }}
                  >
                    <Zap className="size-4 text-muted-foreground" />
                  </Button>
                  <Textarea
                    ref={taRef}
                    rows={1}
                    value={draft}
                    onChange={(e) => onDraftChange(e.target.value)}
                    onPaste={(e) => {
                      const pasted = Array.from(e.clipboardData?.files || []);
                      if (pasted.length) { e.preventDefault(); setFiles((f) => [...f, ...pasted]); }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Escape" && macroOpen) { setMacroOpen(false); return; }
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        if (macroOpen && filteredMacros[0]) { insertMacro(filteredMacros[0]); return; }
                        if (draft.trim() || files.length) sendMut.mutate();
                      }
                    }}
                    placeholder="Digite sua mensagem… (use / para respostas rápidas)"
                    className="min-h-[40px] max-h-[120px] resize-none"
                  />
                  <Button
                    onClick={() => sendMut.mutate()}
                    disabled={sendMut.isPending || (!draft.trim() && !files.length)}
                    style={{ background: "var(--brand)" }} size="icon" className="shrink-0"
                  >
                    {sendMut.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                  </Button>
                </div>
              </div>
            </>
          )}
        </Card>

        {/* Context */}
        {showContext && (
          <Card className="min-h-0 hidden xl:flex flex-col overflow-hidden">
            {!activeTicket ? (
              <div className="flex-1 grid place-items-center text-xs text-muted-foreground px-4 text-center">
                O contexto do cliente aparece aqui.
              </div>
            ) : ctxQ.isLoading ? (
              <div className="flex-1 grid place-items-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
            ) : (
              <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4 text-sm">
                <section className="space-y-1.5">
                  <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    <Building2 className="size-3.5" /> Empresa
                  </div>
                  <div className="flex items-center gap-3">
                    {ctx?.owner?.avatar_url || ctx?.company?.logo_url ? (
                      <img
                        src={ctx?.owner?.avatar_url || ctx?.company?.logo_url}
                        alt=""
                        className="size-11 rounded-full object-cover border shrink-0"
                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                      />
                    ) : (
                      <div className="size-11 rounded-full bg-muted text-muted-foreground grid place-items-center text-sm font-semibold shrink-0">
                        {(ctx?.owner?.nome_completo || ctx?.owner?.nome || ctx?.company?.nome_fantasia || ctx?.company?.nome || "?").trim().charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="font-semibold truncate">{ctx?.company?.nome_fantasia || ctx?.company?.nome || "—"}</div>
                      {ctx?.owner && (
                        <div className="text-xs text-muted-foreground truncate">
                          {ctx.owner.nome_completo || ctx.owner.nome || "—"}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground break-all">{ctx?.company?.email_corporativo || ctx?.owner?.email || "—"}</div>
                  <div className="text-xs text-muted-foreground">{ctx?.company?.telefone || ctx?.owner?.telefone || "—"}</div>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {ctx?.company?.segmento && <Badge variant="secondary" className="text-[10px]">{ctx.company.segmento}</Badge>}
                    {!ctx?.company?.onboarding_completed && <Badge className="text-[10px] bg-amber-100 text-amber-800">Onboarding incompleto</Badge>}
                  </div>
                </section>

                <section className="space-y-1.5 border-t pt-3">
                  <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    <CreditCard className="size-3.5" /> Plano
                  </div>
                  <div className="font-semibold">{ctx?.subscription?.plano || "Sem assinatura"}</div>
                  {ctx?.subscription && (
                    <>
                      <div className="text-xs">{brl(ctx.subscription.valor_cents || 0)}/mês</div>
                      <div className="flex flex-wrap gap-1.5">
                        <Badge variant="secondary" className="text-[10px]">{ctx.subscription.status}</Badge>
                        {ctx.subscription.cortesia && <Badge className="text-[10px] bg-violet-100 text-violet-800">cortesia</Badge>}
                        {ctx.subscription.cancel_at_period_end && <Badge className="text-[10px] bg-red-100 text-red-800">cancela no fim</Badge>}
                      </div>
                    </>
                  )}
                  <div className="text-xs text-muted-foreground">
                    Cobrança: {ctx?.company?.status_cobranca || "—"}
                    {typeof ctx?.trial_dias === "number" && ctx.trial_dias > -1 && (
                      <> · Trial: {ctx.trial_dias > 0 ? `${ctx.trial_dias} dia(s)` : "expirado"}</>
                    )}
                  </div>
                </section>

                <section className="space-y-1.5 border-t pt-3">
                  <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    <Sparkles className="size-3.5" /> Créditos de IA
                  </div>
                  <div className="text-sm">
                    <b>{ctx?.company?.creditos_saldo ?? 0}</b>
                    {ctx?.subscription?.creditos_mensais ? <span className="text-muted-foreground"> / {ctx.subscription.creditos_mensais} mensais</span> : null}
                  </div>
                </section>

                <section className="space-y-1.5 border-t pt-3">
                  <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    <Smartphone className="size-3.5" /> Conexões
                  </div>
                  {(ctx?.conexoes ?? []).length === 0 ? (
                    <div className="text-xs text-muted-foreground">Nenhuma conexão criada.</div>
                  ) : ctx.conexoes.map((c: any) => (
                    <div key={c.id} className="flex items-center gap-2 text-xs">
                      <span className={`size-2 rounded-full ${c.paused ? "bg-amber-500" : c.status === "connected" || c.status === "open" ? "bg-emerald-500" : "bg-red-500"}`} />
                      <span className="truncate flex-1">{c.display_name || c.instance_name}</span>
                      <span className="text-muted-foreground">{c.paused ? "pausada" : c.status}</span>
                    </div>
                  ))}
                </section>

                <section className="space-y-1.5 border-t pt-3">
                  <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    <History className="size-3.5" /> Chamados anteriores
                  </div>
                  {(ctx?.chamados_anteriores ?? []).length === 0 ? (
                    <div className="text-xs text-muted-foreground">Primeiro chamado desta empresa.</div>
                  ) : ctx.chamados_anteriores.map((t: any) => (
                    <button
                      key={t.id} onClick={() => setActiveId(t.id)}
                      className="w-full text-left text-xs hover:bg-muted rounded p-1.5"
                    >
                      <div className="truncate font-medium">{t.assunto}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {t.status} · {new Date(t.created_at).toLocaleDateString("pt-BR")}
                      </div>
                    </button>
                  ))}
                </section>

                <section className="space-y-2 border-t pt-3">
                  <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    <StickyNote className="size-3.5" /> Notas internas
                  </div>
                  <p className="text-[10px] text-muted-foreground -mt-1">Visível só para a equipe. O cliente não vê.</p>
                  <Textarea
                    rows={2} value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)}
                    placeholder="Anotar algo sobre este chamado…"
                    className="text-xs resize-none bg-amber-50/60 border-amber-200"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && noteDraft.trim()) noteMut.mutate();
                    }}
                  />
                  <Button
                    size="sm" variant="outline" className="w-full h-8 text-xs"
                    disabled={!noteDraft.trim() || noteMut.isPending}
                    onClick={() => noteMut.mutate()}
                  >
                    {noteMut.isPending ? <Loader2 className="size-3.5 animate-spin mr-1.5" /> : <Plus className="size-3.5 mr-1.5" />}
                    Adicionar nota
                  </Button>
                  {notes.length === 0 ? (
                    <div className="text-xs text-muted-foreground">Nenhuma nota ainda.</div>
                  ) : notes.map((n: any) => (
                    <div key={n.id} className="rounded-lg bg-amber-50 border border-amber-200 p-2">
                      <div className="text-xs whitespace-pre-wrap">{n.content}</div>
                      <div className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
                        <span className="flex-1 truncate">
                          {n.author_nome} · {new Date(n.created_at).toLocaleString("pt-BR")}
                        </span>
                        <button
                          className="hover:text-red-600"
                          onClick={async () => {
                            await delNoteFn({ data: { id: n.id } });
                            qc.invalidateQueries({ queryKey: ["master", "support", "notes", activeId] });
                          }}
                        >
                          <Trash2 className="size-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </section>



                <div className="border-t pt-3 flex flex-col gap-2">
                  <Button asChild variant="outline" size="sm">
                    <a href="/master/clientes">Abrir em Clientes</a>
                  </Button>
                  <Button asChild variant="outline" size="sm">
                    <a href="/master/financeiro">Abrir em Financeiro</a>
                  </Button>
                </div>
              </div>
            )}
          </Card>
        )}
      </div>

      <MacroManager
        open={macroMgr} onOpenChange={setMacroMgr} macros={macros}
        onSave={async (m) => { await saveMacroFn({ data: m }); qc.invalidateQueries({ queryKey: ["master", "support", "macros"] }); }}
        onDelete={async (id) => { await delMacroFn({ data: { id } }); qc.invalidateQueries({ queryKey: ["master", "support", "macros"] }); }}
      />

      <SupportMetricsDialog open={metricsOpen} onOpenChange={setMetricsOpen} />
      <SupportConfigDialog open={configOpen} onOpenChange={setConfigOpen} />
    </div>
  );
}

function MacroManager({
  open, onOpenChange, macros, onSave, onDelete, inline = false,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  macros: any[];
  onSave: (m: any) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  inline?: boolean;
}) {
  const empty = { id: undefined as string | undefined, titulo: "", atalho: "", conteudo: "", categoria: "Geral", ordem: 0 };
  const [form, setForm] = useState<any>(empty);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (!open) setForm(empty); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    if (!form.titulo.trim() || !form.atalho.trim() || !form.conteudo.trim()) {
      toast.error("Preencha título, atalho e conteúdo"); return;
    }
    setSaving(true);
    try { await onSave(form); setForm(empty); toast.success("Resposta rápida salva"); }
    catch (e: any) { toast.error(e.message || "Falha ao salvar"); }
    finally { setSaving(false); }
  }

  const body = (
    <>
        <div className={`grid sm:grid-cols-2 gap-4 ${inline ? "" : "max-h-[60vh] overflow-y-auto"}`}>
          <div className="space-y-2">
            <div className="text-xs font-semibold text-muted-foreground uppercase">Biblioteca</div>
            {macros.length === 0 && <div className="text-sm text-muted-foreground">Nenhuma resposta cadastrada.</div>}
            {macros.map((m) => (
              <div key={m.id} className="border rounded-lg p-2.5 bg-card shadow-sm">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium flex-1 truncate">{m.titulo}</span>
                  <code className="text-[10px] bg-muted px-1 rounded">/{m.atalho}</code>
                  <button onClick={() => setForm({ ...m })} className="text-muted-foreground hover:text-foreground"><Pencil className="size-3.5" /></button>
                  <button onClick={() => onDelete(m.id)} className="text-muted-foreground hover:text-red-600"><Trash2 className="size-3.5" /></button>
                </div>
                <div className="text-xs text-muted-foreground line-clamp-2 mt-1">{m.conteudo}</div>
              </div>
            ))}
          </div>
          <div className="space-y-2 rounded-lg border bg-card shadow-sm p-3">
            <div className="text-xs font-semibold text-muted-foreground uppercase">
              {form.id ? "Editar" : "Nova resposta"}
            </div>
            <Input placeholder="Título" value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} />
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="atalho (sem /)" value={form.atalho} onChange={(e) => setForm({ ...form, atalho: e.target.value })} />
              <Input placeholder="Categoria" value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} />
            </div>
            <Textarea
              rows={7} placeholder="Conteúdo… use {{nome}}, {{empresa}}, {{plano}}"
              value={form.conteudo} onChange={(e) => setForm({ ...form, conteudo: e.target.value })}
            />
            <p className="text-[11px] text-muted-foreground">
              Variáveis disponíveis: <code>{"{{nome}}"}</code> <code>{"{{empresa}}"}</code> <code>{"{{plano}}"}</code>
            </p>
          </div>
        </div>
    </>
  );

  const actions = (
    <>
      {form.id && <Button variant="ghost" onClick={() => setForm(empty)}>Cancelar edição</Button>}
      <Button onClick={save} disabled={saving} style={{ background: "var(--brand)" }}>
        {saving ? <Loader2 className="size-4 animate-spin mr-1.5" /> : <Plus className="size-4 mr-1.5" />}
        {form.id ? "Salvar" : "Adicionar"}
      </Button>
    </>
  );

  if (inline) {
    return (
      <div className="space-y-4 rounded-xl border bg-muted/40 p-4 sm:p-5">
        <h1 className="text-xl sm:text-2xl font-semibold flex items-center gap-2"><Zap className="size-5" /> Respostas rápidas</h1>
        {body}
        <div className="flex justify-end gap-2">{actions}</div>
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Zap className="size-4" /> Respostas rápidas</DialogTitle>
        </DialogHeader>
        {body}
        <DialogFooter>{actions}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
