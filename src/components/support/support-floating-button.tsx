import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useRouterState } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

import { Send, X, ArrowLeft, Loader2, Plus, Paperclip, Check, CheckCheck, Star } from "lucide-react";
import { toast } from "sonner";
import mascotAsset from "@/assets/capi-conversa-logo-horizontal-black.png.asset.json";
import {
  listMyTickets, listMessages, sendMessage, createTicket, markRead, submitTicketCsat,
} from "@/lib/support.functions";
import { SupportHome } from "./support-home";
import { SupportArticle } from "./support-article";
import type { KbArtigo } from "@/lib/support-kb";

type Ticket = {
  id: string; assunto: string; status: string;
  unread_user: number; unread_admin: number;
  last_message_at: string; created_at: string;
  csat_score?: number | null;
};
type Msg = {
  id: string; ticket_id: string; sender_role: "user" | "admin";
  content: string; attachments: any[]; created_at: string; read_at?: string | null;
};

const SUPPORT_ASSUNTOS: string[] = [
  "Dúvida sobre planos e assinatura",
  "Pagamento / cobrança",
  "Conexão do WhatsApp",
  "Agente de IA",
  "CRM / Kanban",
  "Campanhas e disparos",
  
  "Agendamentos",
  "Usuários e permissões",
  "Erro / bug no sistema",
  "Sugestão de melhoria",
  "Outros",
];

export function SupportFloatingButton({ companyId }: { companyId: string | null | undefined }) {
  const qc = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const hideOnConversas = pathname.startsWith("/app/conversas");
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"home" | "kb" | "list" | "chat" | "new">("home");
  const [article, setArticle] = useState<KbArtigo | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [newSubject, setNewSubject] = useState("");
  const [subjectOption, setSubjectOption] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const presenceRef = useRef<any>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [adminTyping, setAdminTyping] = useState(false);

  const listFn = useServerFn(listMyTickets);
  const msgsFn = useServerFn(listMessages);
  const sendFn = useServerFn(sendMessage);
  const createFn = useServerFn(createTicket);
  const readFn = useServerFn(markRead);
  const csatFn = useServerFn(submitTicketCsat);
  const [csatHover, setCsatHover] = useState(0);
  const [csatSending, setCsatSending] = useState(false);

  const ticketsQ = useQuery({
    queryKey: ["support", "tickets", companyId],
    queryFn: () => listFn({ data: {} as any }),
    enabled: !!companyId,
    refetchOnWindowFocus: false,
  });
  const tickets: Ticket[] = (ticketsQ.data as any)?.rows ?? [];

  const totalUnread = useMemo(
    () => tickets.reduce((s, t) => s + (t.unread_user || 0), 0),
    [tickets],
  );

  const msgsQ = useQuery({
    queryKey: ["support", "messages", activeId],
    queryFn: () => msgsFn({ data: { ticket_id: activeId! } }),
    enabled: !!activeId,
    refetchOnWindowFocus: false,
  });
  const messages: Msg[] = (msgsQ.data as any)?.rows ?? [];

  // Realtime — refresh ticket list and open chat on new messages
  useEffect(() => {
    if (!companyId) return;
    const ch = supabase
      .channel(`support:${companyId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "support_ticket", filter: `company_id=eq.${companyId}` }, () => {
        qc.invalidateQueries({ queryKey: ["support", "tickets"] });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "support_message" }, (payload: any) => {
        const m = payload.new;
        if (m?.ticket_id && activeId === m.ticket_id) {
          qc.invalidateQueries({ queryKey: ["support", "messages", activeId] });
        }
        qc.invalidateQueries({ queryKey: ["support", "tickets"] });
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "support_message" }, (payload: any) => {
        if (payload.new?.ticket_id && activeId === payload.new.ticket_id) {
          qc.invalidateQueries({ queryKey: ["support", "messages", activeId] });
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [companyId, activeId, qc]);

  // Mark read + scroll on open chat
  useEffect(() => {
    if (view === "chat" && activeId) {
      readFn({ data: { ticket_id: activeId } }).then(() => {
        qc.invalidateQueries({ queryKey: ["support", "tickets"] });
      });
    }
  }, [view, activeId, messages.length, readFn, qc]);

  // Presence "digitando…"
  useEffect(() => {
    if (view !== "chat" || !activeId) { presenceRef.current = null; setAdminTyping(false); return; }
    const ch = supabase.channel(`support-typing:${activeId}`, { config: { presence: { key: "user" } } });
    ch.on("presence", { event: "sync" }, () => {
      const state: any = ch.presenceState();
      setAdminTyping(
        Object.entries(state).some(([k, v]: any) => k !== "user" && v?.some?.((x: any) => x.typing)),
      );
    }).subscribe(async (st) => {
      if (st === "SUBSCRIBED") await ch.track({ typing: false });
    });
    presenceRef.current = ch;
    return () => { supabase.removeChannel(ch); presenceRef.current = null; };
  }, [view, activeId]);

  const signalTyping = useCallback(() => {
    const ch = presenceRef.current;
    if (!ch) return;
    ch.track({ typing: true });
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => ch.track({ typing: false }), 2500);
  }, []);

  useEffect(() => {
    if (view === "chat" && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length, view]);

  async function uploadFiles(): Promise<any[]> {
    if (!files.length || !companyId) return [];
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

  const sendMut = useMutation({
    mutationFn: async () => {
      const attachments = await uploadFiles();
      return sendFn({ data: { ticket_id: activeId!, content: draft, attachments } });
    },
    onSuccess: () => {
      setDraft(""); setFiles([]);
      presenceRef.current?.track({ typing: false });
      qc.invalidateQueries({ queryKey: ["support", "messages", activeId] });
      taRef.current?.focus();
    },
    onError: (e: any) => toast.error(e.message || "Falha ao enviar"),
  });

  const createMut = useMutation({
    mutationFn: async () => {
      const t = await createFn({ data: { assunto: newSubject, message: newMessage } });
      const ticket = (t as any).ticket;
      const attachments = await uploadFiles();
      if (attachments.length) {
        await sendFn({ data: { ticket_id: ticket.id, content: "", attachments } });
      }
      return ticket;
    },
    onSuccess: (t: any) => {
      toast.success("Chamado criado!");
      setNewSubject(""); setNewMessage(""); setFiles([]);
      setActiveId(t.id); setView("chat");
      qc.invalidateQueries({ queryKey: ["support", "tickets"] });
    },
    onError: (e: any) => toast.error(e.message || "Falha ao criar chamado"),
  });

  const activeTicket = tickets.find((t) => t.id === activeId);

  // Nome do usuário para a saudação
  useEffect(() => {
    let alive = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!alive) return;
      const u = data.user;
      setUserName((u?.user_metadata as any)?.full_name || (u?.user_metadata as any)?.name || u?.email?.split("@")[0] || null);
    });
    return () => { alive = false; };
  }, []);

  const openWidget = useCallback(() => {
    setOpen(true);
    // Se há resposta não lida, cai direto no chat correspondente
    const pendente = tickets.find((t) => (t.unread_user || 0) > 0);
    if (pendente) { setActiveId(pendente.id); setView("chat"); }
    else { setView("home"); setActiveId(null); setArticle(null); }
  }, [tickets]);

  const goTalkToAgent = useCallback((assunto?: string, contexto?: string) => {
    const match = assunto && SUPPORT_ASSUNTOS.includes(assunto) ? assunto : "";
    setSubjectOption(match || (assunto ? "Outros" : ""));
    setNewSubject(assunto ?? "");
    setNewMessage(contexto ?? "");
    setArticle(null);
    setView("new");
  }, []);

  const isHelpTab = view === "home" || view === "kb" || view === "new";

  if (!companyId || hideOnConversas) return null;


  return (
    <>
      {/* Floating button */}
      <button
        onClick={openWidget}
        title="Suporte"
        className="fixed z-40 bottom-24 right-4 lg:bottom-6 lg:right-6 h-16 w-16 rounded-full shadow-xl transition-transform hover:scale-110"
      >
        <img src={mascotAsset.url} alt="Suporte Capi Conversa" className="h-full w-full rounded-full object-cover" />
        {totalUnread > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-[20px] px-1 rounded-full bg-red-500 text-white text-[11px] font-bold grid place-items-center shadow">
            {totalUnread > 9 ? "9+" : totalUnread}
          </span>
        )}
      </button>

      {open && (
        <div
          className="fixed z-40 bg-white rounded-2xl shadow-2xl border flex flex-col overflow-hidden
                     bottom-24 right-4 lg:bottom-24 lg:right-6
                     w-[calc(100vw-2rem)] sm:w-[380px] h-[70vh] max-h-[600px]"
          role="dialog"
          aria-label="Suporte"
        >
          {/* Header com abas Chat / Histórico */}
          <header className="px-3 py-2.5 border-b flex items-center gap-2 shrink-0 bg-white">
            {(view === "kb" || view === "chat" || view === "new") && (
              <button
                onClick={() => {
                  if (view === "chat") { setView("list"); setActiveId(null); }
                  else if (view === "kb") { setArticle(null); setView("home"); }
                  else setView("home");
                }}
                className="size-8 grid place-items-center rounded-lg hover:bg-muted shrink-0"
                aria-label="Voltar"
              >
                <ArrowLeft className="size-4" />
              </button>
            )}

            <div className="flex-1 min-w-0 flex items-center gap-1 bg-muted/60 rounded-full p-1">
              <button
                onClick={() => { setView("home"); setActiveId(null); setArticle(null); }}
                className={`flex-1 text-xs font-semibold py-1.5 rounded-full transition-colors ${
                  isHelpTab ? "bg-white shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Ajuda
              </button>
              <button
                onClick={() => { setView("list"); setArticle(null); }}
                className={`flex-1 text-xs font-semibold py-1.5 rounded-full transition-colors flex items-center justify-center gap-1.5 ${
                  !isHelpTab ? "bg-white shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Histórico
                {totalUnread > 0 && (
                  <span className="min-w-[16px] h-[16px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold grid place-items-center">
                    {totalUnread > 9 ? "9+" : totalUnread}
                  </span>
                )}
              </button>
            </div>

            <button onClick={() => setOpen(false)} className="size-8 grid place-items-center rounded-lg hover:bg-muted shrink-0" aria-label="Fechar">
              <X className="size-4" />
            </button>
          </header>

          {view === "chat" && (
            <div className="px-4 py-2 border-b bg-muted/40 shrink-0">
              <div className="text-sm font-semibold truncate">{activeTicket?.assunto || "Chamado"}</div>
              <div className="text-[11px] text-muted-foreground">Status: {activeTicket?.status ?? "—"}</div>
            </div>
          )}

          {/* HOME — ajuda / dúvidas rápidas */}
          {view === "home" && (
            <SupportHome
              userName={userName}
              onOpenArticle={(a) => { setArticle(a); setView("kb"); }}
              onTalkToAgent={(assunto) => goTalkToAgent(assunto)}
              onClose={() => setOpen(false)}
            />
          )}

          {/* ARTIGO */}
          {view === "kb" && article && (
            <SupportArticle
              artigo={article}
              onTalkToAgent={(assunto, contexto) => goTalkToAgent(assunto, contexto)}
              onClose={() => setOpen(false)}
            />
          )}


          {/* LIST */}
          {view === "list" && (
            <div className="flex-1 min-h-0 flex flex-col">
              <div className="flex-1 min-h-0 overflow-y-auto">
                {ticketsQ.isLoading ? (
                  <div className="p-8 grid place-items-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
                ) : tickets.length === 0 ? (
                  <div className="p-8 text-center text-sm text-muted-foreground">
                    Você ainda não tem chamados abertos.
                  </div>
                ) : (
                  <ul className="divide-y">
                    {tickets.map((t) => (
                      <li key={t.id}>
                        <button
                          onClick={() => { setActiveId(t.id); setView("chat"); }}
                          className="w-full text-left px-4 py-3 hover:bg-muted flex items-start gap-3"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold truncate">{t.assunto}</span>
                              {t.unread_user > 0 && <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold grid place-items-center">{t.unread_user}</span>}
                            </div>
                            <div className="text-[11px] text-muted-foreground mt-0.5">
                              {new Date(t.last_message_at).toLocaleString("pt-BR")} · {t.status}
                            </div>
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="p-3 border-t">
                <Button className="w-full" onClick={() => setView("new")} style={{ background: "var(--brand)" }}>
                  <Plus className="size-4 mr-2" /> Novo chamado
                </Button>
              </div>
            </div>
          )}

          {/* CHAT */}
          {view === "chat" && (
            <div className="flex-1 min-h-0 flex flex-col bg-[#f8f9fb]">
              <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
                {msgsQ.isLoading ? (
                  <div className="p-4 grid place-items-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
                ) : messages.map((m) => (
                  <div key={m.id} className={`flex ${m.sender_role === "user" ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap ${
                        m.sender_role === "user" ? "text-white rounded-br-sm" : "bg-white border rounded-bl-sm"
                      }`}
                      style={m.sender_role === "user" ? { background: "var(--brand)" } : undefined}
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
                      <div className={`text-[10px] mt-1 flex items-center gap-1 ${m.sender_role === "user" ? "text-white/70 justify-end" : "text-muted-foreground"}`}>
                        {new Date(m.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                        {m.sender_role === "user" && (m.read_at ? <CheckCheck className="size-3" /> : <Check className="size-3" />)}
                      </div>
                    </div>
                  </div>
                ))}
                {adminTyping && (
                  <div className="flex justify-start">
                    <div className="bg-white border rounded-2xl rounded-bl-sm px-3 py-2 text-xs text-muted-foreground">
                      suporte digitando…
                    </div>
                  </div>
                )}
              </div>
              {activeTicket?.status === "resolvido" && !activeTicket?.csat_score && (
                <div className="p-3 border-t bg-amber-50 shrink-0 text-center space-y-2">
                  <p className="text-xs font-medium">Como você avalia este atendimento?</p>
                  <div className="flex justify-center gap-1">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        disabled={csatSending}
                        onMouseEnter={() => setCsatHover(n)}
                        onMouseLeave={() => setCsatHover(0)}
                        onClick={async () => {
                          setCsatSending(true);
                          try {
                            await csatFn({ data: { ticket_id: activeTicket.id, score: n } });
                            toast.success("Obrigado pela avaliação!");
                            qc.invalidateQueries({ queryKey: ["support", "tickets"] });
                          } catch (e: any) {
                            toast.error(e?.message ?? "Falha ao enviar avaliação");
                          } finally {
                            setCsatSending(false);
                          }
                        }}
                      >
                        <Star className={`size-6 ${n <= csatHover ? "fill-amber-400 text-amber-400" : "text-amber-400"}`} />
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {activeTicket?.csat_score ? (
                <div className="p-2 border-t bg-emerald-50 text-center text-xs text-emerald-700 shrink-0">
                  Avaliação enviada: {activeTicket.csat_score}/5 · obrigado!
                </div>
              ) : null}
              <div className="p-3 border-t bg-white space-y-2 shrink-0">
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
                  <Textarea
                    ref={taRef}
                    rows={1}
                    value={draft}
                    onChange={(e) => { setDraft(e.target.value); signalTyping(); }}
                    onPaste={(e) => {
                      const pasted = Array.from(e.clipboardData?.files || []);
                      if (pasted.length) { e.preventDefault(); setFiles((f) => [...f, ...pasted]); }
                    }}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (draft.trim() || files.length) sendMut.mutate(); } }}
                    placeholder="Digite sua mensagem…"
                    className="min-h-[40px] max-h-[120px] resize-none"
                  />
                  <Button
                    onClick={() => sendMut.mutate()}
                    disabled={sendMut.isPending || (!draft.trim() && !files.length)}
                    style={{ background: "var(--brand)" }}
                    className="shrink-0"
                    size="icon"
                  >
                    {sendMut.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* NEW TICKET */}
          {view === "new" && (
            <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
              <div>
                <label className="text-xs font-medium">Assunto</label>
                <select
                  value={subjectOption}
                  onChange={(e) => {
                    const v = e.target.value;
                    setSubjectOption(v);
                    setNewSubject(v === "Outros" ? "" : v);
                  }}
                  className="w-full mt-1 px-3 py-2 rounded-lg border bg-background text-sm"
                >
                  <option value="">Selecione o assunto…</option>
                  {SUPPORT_ASSUNTOS.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                {subjectOption === "Outros" && (
                  <input
                    value={newSubject} onChange={(e) => setNewSubject(e.target.value)}
                    placeholder="Descreva o assunto"
                    className="w-full mt-2 px-3 py-2 rounded-lg border bg-background text-sm"
                  />
                )}
              </div>

              <div>
                <label className="text-xs font-medium">Mensagem</label>
                <Textarea rows={5} value={newMessage} onChange={(e) => setNewMessage(e.target.value)} placeholder="Descreva sua dúvida ou problema…" />
              </div>
              <div>
                <label className="text-xs font-medium">Anexos (opcional)</label>
                <input type="file" multiple onChange={(e) => setFiles([...files, ...Array.from(e.target.files || [])])} className="mt-1 text-sm block" />
                {files.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {files.map((f, i) => (
                      <span key={i} className="text-[11px] bg-muted rounded px-2 py-1 flex items-center gap-1">
                        {f.name}
                        <button onClick={() => setFiles(files.filter((_, k) => k !== i))}><X className="size-3" /></button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <Button
                onClick={() => createMut.mutate()}
                disabled={createMut.isPending || newMessage.trim().length < 2}
                className="w-full"
                style={{ background: "var(--brand)" }}
              >
                {createMut.isPending && <Loader2 className="size-4 mr-2 animate-spin" />}
                Enviar chamado
              </Button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
