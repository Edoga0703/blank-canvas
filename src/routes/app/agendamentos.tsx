import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertCircle, CalendarIcon, ChevronLeft, ChevronRight, Lock, MessageSquare, MoreHorizontal, Plus, RefreshCw, Settings2,
} from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { brand } from "@/config/brand";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  getAgendaData, saveCompromisso, moverCompromisso, setStatusCompromisso,
  excluirItem, acaoEmMassa, saveMensagemProgramada, acaoMensagem, saveLocal,
} from "@/lib/agenda.functions";
import { listLeadsForPicker } from "@/lib/agendamentos.functions";
import {
  AppointmentForm, formDeItem, formVazio, type FormState, type LeadOpt,
} from "@/components/agenda/appointment-form";
import { DetailPanel } from "@/components/agenda/detail-panel";
import { BlockDialog } from "@/components/agenda/block-dialog";
import { DayAgenda } from "@/components/agenda/day-agenda";
import { MonthView } from "@/components/agenda/month-view";
import { ListView, filtrosVazios, type Filtros } from "@/components/agenda/list-view";
import { MessageForm, mensagemVazia, type MensagemForm } from "@/components/agenda/message-form";
import { SettingsArea } from "@/components/agenda/settings-area";
import {
  addDias, dateOnly, fimItem, fmtDataLonga, inicioSemana, mesmoDia, parseDateOnly,
  type Bloqueio, type Item, type Local, type Profissional, type Servico, type TipoAgendamento,
} from "@/components/agenda/shared";
import { buildSlots, type Ocupado } from "@/components/agenda/slots";
import type { BusinessHours } from "@/lib/business-hours";


type Area = "lista" | "calendario" | "config";
type Modo = "dia" | "semana" | "mes";

type Search = { area: Area; modo: Modo; data: string; prof: string; serv: string; agrupar: string };

export const Route = createFileRoute("/app/agendamentos")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    area: (["lista", "calendario", "config"].includes(String(s.area)) ? s.area : "lista") as Area,
    modo: (["dia", "semana", "mes"].includes(String(s.modo)) ? s.modo : "mes") as Modo,
    data: typeof s.data === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s.data) ? s.data : dateOnly(new Date()),
    prof: typeof s.prof === "string" ? s.prof : "todos",
    serv: typeof s.serv === "string" ? s.serv : "todos",
    agrupar: typeof s.agrupar === "string" ? s.agrupar : "dia",
  }),

  head: () => ({
    meta: [
      { title: `${brand.name} — Central de Agendamentos` },
      { name: "description", content: "Organize compromissos, disponibilidade da equipe e mensagens programadas em um só lugar." },
      { property: "og:title", content: `${brand.name} — Central de Agendamentos` },
      { property: "og:description", content: "Agenda por dia, semana, mês e lista, com mensagens programadas no WhatsApp." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AgendamentosPage,
});

function horariosDe(prof: Profissional | undefined, empresa: BusinessHours | null): BusinessHours | null {
  return (prof?.horarios as BusinessHours | null) ?? empresa ?? null;
}

function AgendamentosPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const isMobile = useIsMobile();

  const _load = useServerFn(getAgendaData);
  const _leads = useServerFn(listLeadsForPicker);
  const _save = useServerFn(saveCompromisso);
  const _mover = useServerFn(moverCompromisso);
  const _status = useServerFn(setStatusCompromisso);
  const _excluir = useServerFn(excluirItem);
  const _massa = useServerFn(acaoEmMassa);
  const _saveMsg = useServerFn(saveMensagemProgramada);
  const _acaoMsg = useServerFn(acaoMensagem);
  const _saveLocal = useServerFn(saveLocal);

  const [dados, setDados] = useState<any>(null);
  const [leads, setLeads] = useState<LeadOpt[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [form, setForm] = useState<FormState>(formVazio());
  const [formAberto, setFormAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [conflitos, setConflitos] = useState<{ tipo: string; mensagem: string }[]>([]);

  const [msgForm, setMsgForm] = useState<MensagemForm>(mensagemVazia());
  const [msgAberto, setMsgAberto] = useState(false);
  const [salvandoMsg, setSalvandoMsg] = useState(false);

  const [detalheId, setDetalheId] = useState<string | null>(null);
  const [blockAberto, setBlockAberto] = useState(false);
  const [filtrosLista, setFiltrosLista] = useState<Filtros>(filtrosVazios);

  const setSearch = useCallback((patch: Partial<Search>) => {
    void navigate({ search: (prev: Search) => ({ ...prev, ...patch }), replace: true });
  }, [navigate]);

  const dia = useMemo(() => parseDateOnly(search.data), [search.data]);

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      const r: any = await _load({ data: {} });
      setDados(r);
    } catch (e: any) {
      setErro(e?.message || "Não foi possível carregar a agenda.");
    } finally {
      setCarregando(false);
    }
  }, [_load]);

  useEffect(() => { void carregar(); }, [carregar]);
  useEffect(() => { _leads().then((r: any) => setLeads(r ?? [])).catch(() => {}); }, []);

  const itens: Item[] = dados?.itens ?? [];
  const bloqueios: Bloqueio[] = dados?.bloqueios ?? [];
  const profissionais: Profissional[] = dados?.profissionais ?? [];
  const servicos: Servico[] = dados?.servicos ?? [];
  const tipos: TipoAgendamento[] = dados?.tipos ?? [];
  const locais: Local[] = (dados as any)?.locais ?? [];
  const empresaHorarios: BusinessHours | null = dados?.empresa_horarios ?? null;
  const integracoes = dados?.integracoes ?? { whatsapp: false, google: false, outlook: false, meet: false, zoom: false };
  const isManager = !!dados?.me?.isManager;
  const meuId = dados?.me?.userId ?? "";

  const compromissos = useMemo(() => itens.filter((i) => i.tipo === "compromisso"), [itens]);
  const mensagens = useMemo(() => itens.filter((i) => i.tipo === "mensagem"), [itens]);

  const filtrados = useMemo(() => compromissos.filter((c) => {
    if (search.prof === "minha" && c.profissional_id !== meuId) return false;
    if (search.prof !== "todos" && search.prof !== "minha" && c.profissional_id !== search.prof) return false;
    if (search.serv !== "todos" && c.servico_id !== search.serv) return false;
    return true;
  }), [compromissos, search.prof, search.serv, meuId]);

  const listaFiltrada = useMemo(() => {
    const agora = new Date();
    const q = filtrosLista.busca.trim().toLowerCase();
    return filtrados.filter((c) => {
      if (q && !`${c.nome_lead || ""} ${c.numero} ${c.empresa_nome || ""}`.toLowerCase().includes(q)) return false;
      if (filtrosLista.responsavel !== "todos" && c.profissional_id !== filtrosLista.responsavel) return false;
      if (filtrosLista.servico !== "todos" && c.servico_id !== filtrosLista.servico) return false;
      if (filtrosLista.status !== "todos" && c.status !== filtrosLista.status) return false;
      const d = new Date(c.agendado_para);
      if (filtrosLista.periodo === "hoje" && !mesmoDia(d, agora)) return false;
      if (filtrosLista.periodo === "semana" && (d < agora || d > addDias(agora, 7))) return false;
      if (filtrosLista.periodo === "mes" && (d.getMonth() !== agora.getMonth() || d.getFullYear() !== agora.getFullYear())) return false;
      if (filtrosLista.periodo === "passado" && d >= agora) return false;
      if (filtrosLista.periodo === "personalizado") {
        if (filtrosLista.de) {
          const ini = new Date(`${filtrosLista.de}T00:00:00`);
          if (d < ini) return false;
        }
        if (filtrosLista.ate) {
          const fim = new Date(`${filtrosLista.ate}T23:59:59`);
          if (d > fim) return false;
        }
      }
      return true;
    });
  }, [filtrados, filtrosLista]);

  /* ---------------- Slots livres para o formulário ---------------- */
  const slotsLivres = useMemo(() => {
    const alvo = parseDateOnly(form.dia || search.data);
    const prof = profissionais.find((p) => p.user_id === form.profissional_id);
    const h = horariosDe(prof, empresaHorarios);
    const ocupados: Ocupado[] = compromissos
      .filter((c) => mesmoDia(new Date(c.agendado_para), alvo) && c.id !== form.id && !["cancelado", "falta"].includes(c.status))
      .filter((c) => !form.profissional_id || c.profissional_id === form.profissional_id)
      .map((c) => ({ inicio: c.agendado_para, fim: fimItem(c).toISOString() }));
    for (const b of bloqueios) {
      if (!mesmoDia(new Date(b.inicio), alvo)) continue;
      if (b.user_id && form.profissional_id && b.user_id !== form.profissional_id) continue;
      ocupados.push({ inicio: b.inicio, fim: b.fim });
    }
    return buildSlots(h, alvo, form.duracao_min || 30, ocupados);
  }, [form, compromissos, bloqueios, profissionais, empresaHorarios, search.data]);

  const diasVisiveis = useMemo(() => {
    if (search.modo === "semana") {
      const ini = inicioSemana(dia);
      return Array.from({ length: 7 }, (_, i) => addDias(ini, i));
    }
    return [dia];
  }, [search.modo, dia]);


  /* ---------------- Ações ---------------- */
  function abrirNovo(preset?: Partial<FormState>) {
    setConflitos([]);
    setForm(formVazio({ dia: dateOnly(dia), profissional_id: search.prof === "minha" ? meuId : (search.prof !== "todos" ? search.prof : meuId), ...preset }));
    setFormAberto(true);
  }
  function abrirEdicao(i: Item) {
    setConflitos([]);
    setForm(formDeItem(i));
    setFormAberto(true);
  }
  function abrirItem(i: Item) {
    if (i.tipo === "mensagem") {
      const d = new Date(i.agendado_para);
      setMsgForm({
        id: i.id, card_id: i.card_id || "", numero: i.numero, nome_lead: i.nome_lead || "",
        titulo: i.titulo || "", mensagem: i.mensagem || "", canal: i.canal || "whatsapp",
        dia: dateOnly(d), hora: `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`,
        appointment_id: i.appointment_id || "", profissional_id: i.profissional_id || "", enviar_agora: false,
      });
      setMsgAberto(true);
      return;
    }
    setDetalheId(i.id);
  }

  async function salvarLocal(nome: string, endereco: string) {
    try {
      await _saveLocal({ data: { nome, endereco } });
      toast.success("Local salvo.");
      await carregar();
    } catch (e: any) {
      toast.error(e?.message || "Erro ao salvar o local.");
    }
  }

  async function salvarCompromisso(forcar: boolean) {
    setSalvando(true);
    try {
      const [h, m] = form.hora.split(":").map(Number);
      const quando = parseDateOnly(form.dia);
      quando.setHours(h || 0, m || 0, 0, 0);
      const r: any = await _save({
        data: {
          id: form.id,
          titulo: form.titulo || null,
          card_id: form.card_id || null,
          numero: form.numero || null,
          nome_lead: form.nome_lead || null,
          empresa_nome: form.empresa_nome || null,
          tipo_id: form.tipo_id || null,
          servico_id: form.servico_id || null,
          profissional_id: form.profissional_id || null,
          participantes: form.participantes,
          agendado_para: quando.toISOString(),
          duracao_min: form.duracao_min,
          modalidade: form.modalidade,
          local: form.local || null,
          link_reuniao: form.link_reuniao || null,
          google_event_id: form.google_event_id || null,
          google_calendar_id: form.google_calendar_id || null,
          mensagem: form.mensagem || null,
          observacoes_internas: form.observacoes_internas || null,
          tags: form.tags,
          status: form.status,
          lembrete_min_antes: form.lembrete_min_antes,
          lembrete_mensagem: form.lembrete_editado ? form.lembrete_mensagem : null,
          forcar,
          recorrencia: form.recorrente ? {
            frequencia: form.rec_frequencia,
            intervalo: form.rec_intervalo,
            dias_semana: form.rec_dias,
            ocorrencias: form.rec_ocorrencias || null,
            ate_data: form.rec_ate || null,
          } : null,
        },
      });
      if (r?.ok === false) {
        setConflitos(r.conflitos ?? []);
        toast.error("Conflito de horário encontrado.");
        return;
      }
      setConflitos([]);
      setFormAberto(false);
      toast.success(form.id ? "Compromisso atualizado." : "Compromisso criado.");
      await carregar();
    } catch (e: any) {
      toast.error(e?.message || "Erro ao salvar o compromisso.");
    } finally {
      setSalvando(false);
    }
  }

  async function mover(item: Item, inicio: Date, duracao: number, profId?: string | null) {
    try {
      const r: any = await _mover({
        data: { id: item.id, agendado_para: inicio.toISOString(), duracao_min: duracao, profissional_id: profId ?? item.profissional_id },
      });
      if (r?.ok === false) {
        const forcar = isManager && window.confirm(`${r.conflitos?.[0]?.mensagem || "Conflito de horário."}\n\nDeseja salvar mesmo assim?`);
        if (!forcar) { toast.error(r.conflitos?.[0]?.mensagem || "Conflito de horário."); return; }
        await _mover({ data: { id: item.id, agendado_para: inicio.toISOString(), duracao_min: duracao, profissional_id: profId ?? item.profissional_id, forcar: true } });
      }
      toast.success("Compromisso reagendado.");
      await carregar();
    } catch (e: any) {
      toast.error(e?.message || "Erro ao reagendar.");
    }
  }

  async function mudarStatus(i: Item, status: string) {
    try {
      await _status({ data: { id: i.id, status } });
      toast.success("Status atualizado.");
      await carregar();
    } catch (e: any) {
      toast.error(e?.message || "Erro ao alterar status.");
    }
  }

  async function emMassa(ids: string[], acao: "cancelar" | "excluir" | "responsavel" | "reagendar", extra?: any) {
    try {
      await _massa({ data: { ids, acao, ...extra } });
      toast.success("Ação aplicada.");
      await carregar();
    } catch (e: any) {
      toast.error(e?.message || "Erro na ação em massa.");
    }
  }

  async function salvarMensagem() {
    setSalvandoMsg(true);
    try {
      const [h, m] = msgForm.hora.split(":").map(Number);
      const quando = parseDateOnly(msgForm.dia);
      quando.setHours(h || 0, m || 0, 0, 0);
      const r: any = await _saveMsg({
        data: {
          id: msgForm.id,
          card_id: msgForm.card_id || null,
          numero: msgForm.numero,
          nome_lead: msgForm.nome_lead || null,
          titulo: msgForm.titulo || null,
          mensagem: msgForm.mensagem,
          canal: msgForm.canal,
          agendado_para: (msgForm.enviar_agora ? new Date() : quando).toISOString(),
          appointment_id: msgForm.appointment_id || null,
          profissional_id: msgForm.profissional_id || null,
        },
      });
      if (msgForm.enviar_agora && r?.id) {
        await _acaoMsg({ data: { id: r.id, acao: "enviar_agora" } });
      }
      setMsgAberto(false);
      toast.success(msgForm.enviar_agora ? "Mensagem enviada." : "Mensagem programada.");
      await carregar();
    } catch (e: any) {
      toast.error(e?.message || "Erro ao salvar a mensagem.");
    } finally {
      setSalvandoMsg(false);
    }
  }

  /* ---------------- Render ---------------- */
  if (carregando) return <Skeleton />;
  if (erro) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-6 text-center">
          <AlertCircle className="w-6 h-6 mx-auto text-red-600" aria-hidden="true" />
          <p className="mt-2 text-sm font-medium">{erro}</p>
          <Button size="sm" className="mt-3" onClick={() => { setCarregando(true); void carregar(); }}>
            <RefreshCw className="w-4 h-4 mr-1" /> Tentar novamente
          </Button>
        </div>
      </div>
    );
  }

  const tituloPeriodo =
    search.modo === "mes"
      ? dia.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })
      : search.modo === "semana"
        ? `${inicioSemana(dia).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })} — ${addDias(inicioSemana(dia), 6).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}`
        : fmtDataLonga(dia);

  function navegar(delta: number) {
    const d = search.modo === "mes"
      ? new Date(dia.getFullYear(), dia.getMonth() + delta, 1)
      : addDias(dia, delta * (search.modo === "semana" ? 7 : 1));
    setSearch({ data: dateOnly(d) });
  }

  return (
    <div className="p-3 sm:p-4 space-y-4 pb-24">
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold truncate">Agendamentos</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Compromissos e mensagens programadas no mesmo lugar.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline" size="sm" className="hidden sm:inline-flex"
            onClick={() => { setMsgForm(mensagemVazia({ dia: dateOnly(dia), profissional_id: meuId })); setMsgAberto(true); }}
          >
            <MessageSquare className="w-4 h-4 mr-1" /> Mensagem
          </Button>
          <Button size="sm" className="hidden sm:inline-flex" onClick={() => abrirNovo()}>
            <Plus className="w-4 h-4 mr-1" /> Compromisso
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="Mais opções">
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setBlockAberto(true)}>
                <Lock className="w-4 h-4 mr-2" /> Bloquear horário
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSearch({ area: "config" })}>
                <Settings2 className="w-4 h-4 mr-2" /> Horários e serviços
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <Tabs value={search.area} onValueChange={(v) => setSearch({ area: v as Area })}>
        <TabsList className="h-9 w-full sm:w-auto">
          <TabsTrigger value="lista" className="text-xs">Lista</TabsTrigger>
          <TabsTrigger value="calendario" className="text-xs">Calendário</TabsTrigger>
          <TabsTrigger value="config" className="text-xs">Configurações</TabsTrigger>
        </TabsList>
      </Tabs>

      {search.area === "calendario" && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-2">
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Anterior" onClick={() => navegar(-1)}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="sm" className="h-8" onClick={() => setSearch({ data: dateOnly(new Date()) })}>Hoje</Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Próximo" onClick={() => navegar(1)}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 gap-1.5 px-2 text-sm font-medium capitalize min-w-0">
                  <CalendarIcon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{tituloPeriodo}</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={dia}
                  defaultMonth={dia}
                  onSelect={(d) => d && setSearch({ data: dateOnly(d) })}
                  initialFocus
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <Select value={search.prof} onValueChange={(v) => setSearch({ prof: v })}>
                <SelectTrigger className="h-8 w-[160px] text-xs" aria-label="Profissional"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Toda a equipe</SelectItem>
                  <SelectItem value="minha">Minha agenda</SelectItem>
                  {profissionais.map((p) => <SelectItem key={p.user_id} value={p.user_id}>{p.nome}</SelectItem>)}
                </SelectContent>
              </Select>
              <Tabs value={search.modo} onValueChange={(v) => setSearch({ modo: v as Modo })}>
                <TabsList className="h-8">
                  <TabsTrigger value="dia" className="text-xs">Dia</TabsTrigger>
                  <TabsTrigger value="semana" className="text-xs">Semana</TabsTrigger>
                  <TabsTrigger value="mes" className="text-xs">Mês</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </div>

          {(search.modo === "dia" || search.modo === "semana") && (
            <DayAgenda
              dias={diasVisiveis}
              itens={[...filtrados, ...mensagens]}
              servicos={servicos}
              tipos={tipos}
              profissionais={profissionais}
              bloqueios={bloqueios}
              onAbrirItem={abrirItem}
              onCriar={(d) => abrirNovo({ dia: dateOnly(d) })}
              onStatus={(i, s) => void mudarStatus(i, s)}
            />
          )}

          {search.modo === "mes" && (
            <MonthView
              mes={dia}
              diaSelecionado={dia}
              compromissos={filtrados}
              mensagens={mensagens}
              servicos={servicos}
              tipos={tipos}
              bloqueios={bloqueios}
              onSelecionarDia={(d) => setSearch({ data: dateOnly(d) })}
              onAbrirItem={abrirItem}
              onCriar={(d) => abrirNovo({ dia: dateOnly(d) })}
            />
          )}
        </div>
      )}

      {search.area === "lista" && (
        <ListView
          itens={listaFiltrada}
          profissionais={profissionais}
          servicos={servicos}
          filtros={filtrosLista}
          setFiltros={setFiltrosLista}
          podeEditar
          onAbrir={(i) => setDetalheId(i.id)}
          onEditar={abrirEdicao}
          onStatus={mudarStatus}
          onMassa={(ids, acao, extra) => void emMassa(ids, acao, extra)}
          onCriar={() => abrirNovo()}
        />
      )}



      {search.area === "config" && (
        <SettingsArea
          profissionais={profissionais}
          servicos={servicos}
          bloqueios={bloqueios}
          isManager={isManager}
          meuId={meuId}
          onMudou={() => void carregar()}
          onNovoBloqueio={() => setBlockAberto(true)}
        />
      )}

      {isMobile && (
        <Button
          className="fixed bottom-20 right-4 h-12 w-12 rounded-full shadow-lg z-40"
          aria-label="Criar agendamento"
          onClick={() => abrirNovo()}
        >
          <Plus className="w-5 h-5" />
        </Button>
      )}

      <AppointmentForm
        open={formAberto}
        onOpenChange={setFormAberto}
        form={form}
        setForm={setForm}
        leads={leads}
        servicos={servicos}
        tipos={tipos}
        profissionais={profissionais}
        locais={locais}
        slotsLivres={slotsLivres}
        conflitos={conflitos}
        podeForcar={isManager}
        salvando={salvando}
        onSalvar={(forcar) => void salvarCompromisso(forcar)}
        onSalvarLocal={salvarLocal}
      />

      <MessageForm
        open={msgAberto}
        onOpenChange={setMsgAberto}
        form={msgForm}
        setForm={setMsgForm}
        leads={leads}
        compromissos={compromissos}
        profissionais={profissionais}
        salvando={salvandoMsg}
        onSalvar={() => void salvarMensagem()}
      />

      <DetailPanel
        itemId={detalheId}
        onOpenChange={(v) => !v && setDetalheId(null)}
        profissionais={profissionais}
        podeEditar
        onEditar={(i) => { setDetalheId(null); abrirEdicao(i); }}
        onAlterado={() => void carregar()}
      />

      <BlockDialog
        open={blockAberto}
        onOpenChange={setBlockAberto}
        profissionais={profissionais}
        onSalvo={() => void carregar()}
      />
    </div>
  );
}

function Skeleton() {
  return (
    <div className="p-4 space-y-4">
      <div className="h-8 w-56 rounded bg-muted animate-pulse" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-20 rounded-lg bg-muted animate-pulse" />)}
      </div>
      <div className="h-[380px] rounded-lg bg-muted animate-pulse" />
      <span className="sr-only">Carregando agenda…</span>
    </div>
  );
}
