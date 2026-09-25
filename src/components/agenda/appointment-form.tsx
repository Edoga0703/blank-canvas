import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ContactPicker } from "./contact-picker";
import { OptionSelect } from "./option-select";
import { AlertTriangle, ChevronDown, Loader2, Save, Video } from "lucide-react";
import { toast } from "sonner";
import { gerarLinkMeet } from "@/lib/google.functions";
import { useCapacidadeAtiva } from "@/hooks/use-capacidades";
import {
  MODALIDADES, STATUS_COMPROMISSO, STATUS_OPCOES, dateOnly, duracaoItem, fmtData, pad, parseDateOnly,
  type Item, type Local, type Profissional, type Servico, type TipoAgendamento,
} from "./shared";

export type LeadOpt = { id: string; numero: string; nome: string | null };

export type FormState = {
  id: string | null;
  titulo: string;
  card_id: string;
  numero: string;
  nome_lead: string;
  empresa_nome: string;
  tipo_id: string;
  servico_id: string;
  profissional_id: string;
  participantes: string[];
  dia: string;
  hora: string;
  duracao_min: number;
  modalidade: string;
  local: string;
  link_reuniao: string;
  google_event_id?: string | null;
  google_calendar_id?: string | null;
  mensagem: string;
  observacoes_internas: string;
  tags: string[];
  status: string;
  lembrete_min_antes: number;
  lembrete_mensagem: string;
  lembrete_editado: boolean;
  recorrente: boolean;
  rec_frequencia: "diaria" | "semanal" | "mensal";
  rec_intervalo: number;
  rec_dias: number[];
  rec_ocorrencias: number;
  rec_ate: string;
};

export function formVazio(preset?: Partial<FormState>): FormState {
  const agora = new Date();
  return {
    id: null,
    titulo: "",
    card_id: "",
    numero: "",
    nome_lead: "",
    empresa_nome: "",
    tipo_id: "",
    servico_id: "",
    profissional_id: "",
    participantes: [],
    dia: dateOnly(agora),
    hora: `${pad(agora.getHours())}:00`,
    duracao_min: 30,
    modalidade: "presencial",
    local: "",
    link_reuniao: "",
    google_event_id: null,
    google_calendar_id: null,
    mensagem: "",
    observacoes_internas: "",
    tags: [],
    status: "agendado",
    lembrete_min_antes: 60,
    lembrete_mensagem: "",
    lembrete_editado: false,
    recorrente: false,
    rec_frequencia: "semanal",
    rec_intervalo: 1,
    rec_dias: [],
    rec_ocorrencias: 4,
    rec_ate: "",
    ...preset,
  };
}

export function formDeItem(i: Item): FormState {
  const d = new Date(i.agendado_para);
  return formVazio({
    id: i.id,
    titulo: i.titulo || "",
    card_id: i.card_id || "",
    numero: i.numero || "",
    nome_lead: i.nome_lead || "",
    empresa_nome: i.empresa_nome || "",
    tipo_id: i.tipo_id || "",
    servico_id: i.servico_id || "",
    profissional_id: i.profissional_id || "",
    dia: dateOnly(d),
    hora: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
    duracao_min: duracaoItem(i),
    modalidade: i.modalidade || "presencial",
    local: i.local || "",
    link_reuniao: i.link_reuniao || "",
    google_event_id: (i as any).google_event_id ?? null,
    google_calendar_id: (i as any).google_calendar_id ?? null,
    mensagem: i.mensagem || "",
    observacoes_internas: i.observacoes_internas || "",
    tags: i.tags || [],
    status: i.status || "agendado",
    lembrete_min_antes: i.lembrete_min_antes ?? 0,
  });
}

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  form: FormState;
  setForm: (f: FormState) => void;
  leads: LeadOpt[];
  servicos: Servico[];
  tipos?: TipoAgendamento[];
  profissionais: Profissional[];
  locais: Local[];
  slotsLivres: Date[];
  conflitos: { tipo: string; mensagem: string }[];
  podeForcar: boolean;
  salvando: boolean;
  onSalvar: (forcar: boolean) => void;
  onSalvarLocal: (nome: string, endereco: string) => Promise<void> | void;
};

const DIAS = [
  { v: 0, l: "D" }, { v: 1, l: "S" }, { v: 2, l: "T" }, { v: 3, l: "Q" },
  { v: 4, l: "Q" }, { v: 5, l: "S" }, { v: 6, l: "S" },
];

const LEMBRETES = [
  { v: 0, l: "Sem lembrete" },
  { v: 30, l: "30 min antes" },
  { v: 60, l: "1 h antes" },
  { v: 180, l: "3 h antes" },
  { v: 1440, l: "1 dia antes" },
];

export function AppointmentForm({
  open, onOpenChange, form, setForm, leads, servicos, tipos = [], profissionais, locais,
  slotsLivres, conflitos, podeForcar, salvando, onSalvar, onSalvarLocal,
}: Props) {
  const [customLembrete, setCustomLembrete] = useState(false);
  const [maisOpcoes, setMaisOpcoes] = useState(false);
  const [verSlots, setVerSlots] = useState(false);
  const [salvandoLocal, setSalvandoLocal] = useState(false);
  const [gerandoMeet, setGerandoMeet] = useState(false);
  const temMeet = useCapacidadeAtiva("google-meet");

  useEffect(() => {
    if (!open) { setCustomLembrete(false); setVerSlots(false); return; }
    setMaisOpcoes(Boolean(form.recorrente));
    setCustomLembrete(!LEMBRETES.some((l) => l.v === (form.lembrete_min_antes ?? 0)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const set = (patch: Partial<FormState>) => setForm({ ...form, ...patch });

  const horaFim = useMemo(() => {
    const [h, m] = form.hora.split(":").map(Number);
    const d = parseDateOnly(form.dia);
    d.setHours(h || 0, m || 0, 0, 0);
    const f = new Date(d.getTime() + form.duracao_min * 60_000);
    return `${pad(f.getHours())}:${pad(f.getMinutes())}`;
  }, [form.dia, form.hora, form.duracao_min]);

  /* Texto padrão do lembrete, montado com os dados já preenchidos. */
  const lembretePadrao = useMemo(() => {
    const servico = servicos.find((s) => s.id === form.servico_id)?.nome;
    const assunto = form.titulo || servico || "compromisso";
    const data = fmtData(`${form.dia}T00:00:00`);
    const linhas = [
      `Olá${form.nome_lead ? " " + form.nome_lead : ""}! Passando para lembrar do seu ${assunto} em ${data} às ${form.hora}.`,
    ];
    if (form.modalidade !== "video" && form.local) linhas.push(`Local: ${form.local}`);
    if (form.link_reuniao) linhas.push(`Link: ${form.link_reuniao}`);
    linhas.push("Qualquer dúvida, é só responder por aqui.");
    return linhas.join("\n");
  }, [form.titulo, form.servico_id, form.dia, form.hora, form.nome_lead, form.local, form.link_reuniao, form.modalidade, servicos]);

  const textoLembrete = form.lembrete_editado ? form.lembrete_mensagem : lembretePadrao;

  const lembretePersonalizado =
    customLembrete || !LEMBRETES.some((l) => l.v === form.lembrete_min_antes);

  async function gerarMeet() {
    setGerandoMeet(true);
    try {
      const [h, m] = form.hora.split(":").map(Number);
      const quando = parseDateOnly(form.dia);
      quando.setHours(h || 0, m || 0, 0, 0);
      const r = await gerarLinkMeet({
        data: {
          agendamentoId: form.id,
          titulo: form.titulo || null,
          mensagem: form.mensagem || null,
          agendado_para: quando.toISOString(),
          duracao_min: form.duracao_min,
          local: form.local || null,
        },
      });
      if (!r.ok) { toast.error(r.error); return; }
      set({ link_reuniao: r.link, google_event_id: r.eventId, google_calendar_id: r.calendarId });
      toast.success("Sala do Google Meet criada.");
    } catch {
      toast.error("Não foi possível gerar o link do Meet.");
    } finally {
      setGerandoMeet(false);
    }
  }

  async function salvarLocalAtual() {
    if (!form.local.trim()) return;
    setSalvandoLocal(true);
    try {
      await onSalvarLocal(form.local.trim().slice(0, 40), form.local.trim());
    } finally {
      setSalvandoLocal(false);
    }
  }

  const localJaSalvo = locais.some((l) => l.endereco === form.local);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-2xl p-0 gap-0">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle>{form.id ? "Editar compromisso" : "Novo compromisso"}</DialogTitle>
          <DialogDescription>
            Preencha o essencial. Conflitos de horário são verificados antes de salvar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-6 py-4 max-h-[70vh] overflow-y-auto">
          {conflitos.length > 0 && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Conflito de horário</AlertTitle>
              <AlertDescription>
                <ul className="list-disc pl-4 space-y-0.5">
                  {conflitos.map((c, i) => <li key={i}>{c.mensagem}</li>)}
                </ul>
                {!podeForcar && <p className="mt-1">Escolha outro horário ou peça a um administrador.</p>}
              </AlertDescription>
            </Alert>
          )}

          {/* Contato */}
          <div className="space-y-1.5">
            <Label htmlFor="ag-lead">Contato</Label>
            <ContactPicker
              id="ag-lead"
              leads={leads}
              cardId={form.card_id}
              nome={form.nome_lead}
              numero={form.numero}
              onSelect={(l) => set({ card_id: l.id, numero: l.numero, nome_lead: l.nome || "" })}
            />
            <div className="grid grid-cols-2 gap-3 pt-1">
              <Input
                aria-label="Nome do contato"
                value={form.nome_lead}
                onChange={(e) => set({ nome_lead: e.target.value, card_id: "" })}
                placeholder="Nome"
              />
              <Input
                aria-label="Telefone"
                value={form.numero}
                onChange={(e) => set({ numero: e.target.value, card_id: "" })}
                placeholder="Telefone"
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              Contatos novos são salvos automaticamente no CRM.
            </p>
          </div>

          {/* Título */}
          <div className="space-y-1.5">
            <Label htmlFor="ag-titulo">Título</Label>
            <Input
              id="ag-titulo"
              value={form.titulo}
              onChange={(e) => set({ titulo: e.target.value })}
              placeholder="O que será feito. Ex.: Consulta de avaliação"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ag-servico">Serviço</Label>
              <Select value={form.servico_id || "none"} onValueChange={(v) => {
                const s = servicos.find((x) => x.id === v);
                set({
                  servico_id: v === "none" ? "" : v,
                  duracao_min: s?.duracao_min || form.duracao_min,
                  titulo: form.titulo || s?.nome || "",
                });
              }}>
                <SelectTrigger id="ag-servico"><SelectValue placeholder="Sem serviço" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem serviço</SelectItem>
                  {servicos.filter((s) => s.ativo).map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.nome} · {s.duracao_min}min</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ag-resp">Responsável</Label>
              <Select value={form.profissional_id || "none"} onValueChange={(v) => set({ profissional_id: v === "none" ? "" : v })}>
                <SelectTrigger id="ag-resp"><SelectValue placeholder="Agenda da empresa" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Agenda da empresa</SelectItem>
                  {profissionais.map((p) => (
                    <SelectItem key={p.user_id} value={p.user_id}>{p.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ag-dia">Data</Label>
              <Input id="ag-dia" type="date" value={form.dia} onChange={(e) => set({ dia: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ag-hora">Início</Label>
              <Input id="ag-hora" type="time" value={form.hora} onChange={(e) => set({ hora: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ag-dur">Duração (min)</Label>
              <Input
                id="ag-dur"
                type="number"
                min={5}
                step={5}
                value={form.duracao_min}
                onChange={(e) => set({ duracao_min: Number(e.target.value) || 30 })}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Término previsto: {horaFim}</p>

          {/* Horários livres — opcional, recolhido */}
          <Collapsible open={verSlots} onOpenChange={setVerSlots}>
            <CollapsibleTrigger asChild>
              <Button type="button" variant="ghost" size="sm" className="px-0 text-xs text-muted-foreground">
                <ChevronDown className={`w-3.5 h-3.5 mr-1 transition-transform ${verSlots ? "rotate-180" : ""}`} />
                Ver horários livres ({slotsLivres.length})
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              {slotsLivres.length === 0 ? (
                <p className="text-xs text-muted-foreground pt-1">Nenhum horário livre nesse dia.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5 max-h-40 overflow-auto pt-1">
                  {slotsLivres.map((s) => {
                    const hh = `${pad(s.getHours())}:${pad(s.getMinutes())}`;
                    return (
                      <Button
                        key={hh}
                        type="button"
                        size="sm"
                        variant={form.hora === hh ? "default" : "outline"}
                        className="h-7 text-xs"
                        onClick={() => set({ hora: hh })}
                      >
                        {hh}
                      </Button>
                    );
                  })}
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ag-mod">Modalidade</Label>
              <OptionSelect
                id="ag-mod"
                storageKey="agenda:modalidades"
                options={MODALIDADES}
                value={form.modalidade}
                onChange={(v) => set({ modalidade: v })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ag-status">Status</Label>
              <OptionSelect
                id="ag-status"
                storageKey="agenda:status"
                options={STATUS_OPCOES.map((s) => ({ value: s, label: STATUS_COMPROMISSO[s]?.label || s }))}
                value={form.status}
                onChange={(v) => set({ status: v })}
              />
            </div>
          </div>

          {/* Endereço (um campo só, com locais salvos no menu) */}
          <div className="space-y-1.5">
            <Label htmlFor="ag-local">Endereço</Label>
            <div className="flex gap-2">
              {locais.length > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" variant="outline" size="icon" aria-label="Usar endereço salvo">
                      <ChevronDown className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="max-w-[320px]">
                    {locais.map((l) => (
                      <DropdownMenuItem key={l.id} onClick={() => set({ local: l.endereco })}>
                        <span className="truncate">{l.nome}</span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              <Input id="ag-local" value={form.local} onChange={(e) => set({ local: e.target.value })} placeholder="Rua, número, bairro" />
              {form.local.trim() && !localJaSalvo && (
                <Button type="button" variant="outline" size="sm" onClick={salvarLocalAtual} disabled={salvandoLocal}>
                  {salvandoLocal ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  <span className="ml-1 hidden sm:inline">Salvar local</span>
                </Button>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ag-link">Link da reunião</Label>
            <div className="flex gap-2">
              <Input id="ag-link" value={form.link_reuniao} onChange={(e) => set({ link_reuniao: e.target.value })} placeholder="https://" />
              {temMeet && (
                <Button type="button" variant="outline" onClick={gerarMeet} disabled={gerandoMeet} title="Criar sala do Google Meet">
                  {gerandoMeet ? <Loader2 className="w-4 h-4 animate-spin" /> : <Video className="w-4 h-4" />}
                  <span className="ml-1 hidden sm:inline">Meet</span>
                </Button>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ag-desc">Observações</Label>
            <Textarea id="ag-desc" rows={2} value={form.mensagem} onChange={(e) => set({ mensagem: e.target.value })} />
          </div>

          {/* Lembrete no WhatsApp */}
          <div className="rounded-lg border p-3 space-y-2">
            <Label>Lembrete no WhatsApp</Label>
            <div className="flex flex-wrap gap-1.5">
              {LEMBRETES.map((l) => (
                <Button
                  key={l.v}
                  type="button"
                  size="sm"
                  variant={form.lembrete_min_antes === l.v ? "default" : "outline"}
                  aria-pressed={form.lembrete_min_antes === l.v}
                  className="h-7 text-xs"
                  onClick={() => { setCustomLembrete(false); set({ lembrete_min_antes: l.v }); }}
                >
                  {l.l}
                </Button>
              ))}
              <Button
                type="button"
                size="sm"
                variant={lembretePersonalizado ? "default" : "outline"}
                aria-pressed={lembretePersonalizado}
                className="h-7 text-xs"
                onClick={() => setCustomLembrete(true)}
              >
                Personalizado
              </Button>
            </div>
            {lembretePersonalizado && (
              <div className="flex items-center gap-2">
                <Input
                  aria-label="Minutos antes do compromisso"
                  type="number"
                  min={1}
                  className="h-8 w-24"
                  value={form.lembrete_min_antes || ""}
                  onChange={(e) => set({ lembrete_min_antes: Math.max(0, Number(e.target.value) || 0) })}
                />
                <span className="text-xs text-muted-foreground">minutos antes do compromisso</span>
              </div>
            )}
            {form.lembrete_min_antes > 0 && (
              <div className="space-y-1.5">
                <Label htmlFor="ag-lembrete-msg" className="text-xs text-muted-foreground">
                  Mensagem que o contato vai receber
                </Label>
                <Textarea
                  id="ag-lembrete-msg"
                  rows={4}
                  value={textoLembrete}
                  onChange={(e) => set({ lembrete_mensagem: e.target.value, lembrete_editado: true })}
                />
                {form.lembrete_editado && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 px-0 text-xs text-muted-foreground"
                    onClick={() => set({ lembrete_editado: false, lembrete_mensagem: "" })}
                  >
                    Restaurar mensagem automática
                  </Button>
                )}
              </div>
            )}
          </div>

          <Collapsible open={maisOpcoes} onOpenChange={setMaisOpcoes}>
            <CollapsibleTrigger asChild>
              <Button type="button" variant="ghost" size="sm" className="px-0 text-xs text-muted-foreground">
                <ChevronDown className={`w-3.5 h-3.5 mr-1 transition-transform ${maisOpcoes ? "rotate-180" : ""}`} />
                Mais opções
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-4 pt-3">
              <div className="grid grid-cols-2 gap-3">
                {tipos.length > 0 && (
                  <div className="space-y-1.5">
                    <Label htmlFor="ag-tipo">Tipo</Label>
                    <Select value={form.tipo_id || "none"} onValueChange={(v) => set({ tipo_id: v === "none" ? "" : v })}>
                      <SelectTrigger id="ag-tipo"><SelectValue placeholder="Sem tipo" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sem tipo</SelectItem>
                        {tipos.filter((t) => t.ativo).map((t) => (
                          <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label htmlFor="ag-empresa">Empresa</Label>
                  <Input
                    id="ag-empresa"
                    value={form.empresa_nome}
                    onChange={(e) => set({ empresa_nome: e.target.value })}
                    placeholder="Nome da empresa"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ag-tags">Tags</Label>
                <Input
                  id="ag-tags"
                  value={form.tags.join(", ")}
                  onChange={(e) => set({
                    tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean),
                  })}
                  placeholder="Separe por vírgula"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ag-obs">Observações internas</Label>
                <Textarea
                  id="ag-obs"
                  rows={3}
                  value={form.observacoes_internas}
                  onChange={(e) => set({ observacoes_internas: e.target.value })}
                  placeholder="Visível apenas para a equipe"
                />
              </div>

              {!form.id && (
                <div className="rounded-lg border p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="ag-rec">Repetir</Label>
                    <Switch id="ag-rec" checked={form.recorrente} onCheckedChange={(v) => set({ recorrente: v })} />
                  </div>
                  {form.recorrente && (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <Select value={form.rec_frequencia} onValueChange={(v: any) => set({ rec_frequencia: v })}>
                          <SelectTrigger aria-label="Frequência"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="diaria">Diariamente</SelectItem>
                            <SelectItem value="semanal">Semanalmente</SelectItem>
                            <SelectItem value="mensal">Mensalmente</SelectItem>
                          </SelectContent>
                        </Select>
                        <Input
                          type="number" min={1} value={form.rec_intervalo}
                          aria-label="Intervalo"
                          onChange={(e) => set({ rec_intervalo: Number(e.target.value) || 1 })}
                        />
                      </div>
                      {form.rec_frequencia === "semanal" && (
                        <div className="flex gap-1">
                          {DIAS.map((d) => (
                            <Button
                              key={d.v}
                              type="button"
                              size="sm"
                              variant={form.rec_dias.includes(d.v) ? "default" : "outline"}
                              className="h-7 w-7 p-0 text-xs"
                              aria-pressed={form.rec_dias.includes(d.v)}
                              onClick={() => set({
                                rec_dias: form.rec_dias.includes(d.v)
                                  ? form.rec_dias.filter((x) => x !== d.v)
                                  : [...form.rec_dias, d.v],
                              })}
                            >
                              {d.l}
                            </Button>
                          ))}
                        </div>
                      )}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label htmlFor="rec-oc" className="text-xs">Ocorrências</Label>
                          <Input id="rec-oc" type="number" min={1} max={100} value={form.rec_ocorrencias}
                            onChange={(e) => set({ rec_ocorrencias: Number(e.target.value) || 1 })} />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="rec-ate" className="text-xs">Até a data</Label>
                          <Input id="rec-ate" type="date" value={form.rec_ate} onChange={(e) => set({ rec_ate: e.target.value })} />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>
        </div>

        <div className="flex gap-2 border-t px-6 py-3">
          <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>Cancelar</Button>
          {conflitos.length > 0 && podeForcar && (
            <Button variant="destructive" onClick={() => onSalvar(true)} disabled={salvando}>
              Salvar mesmo assim
            </Button>
          )}
          <Button className="flex-1" onClick={() => onSalvar(false)} disabled={salvando}>
            {salvando && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
            Salvar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
