import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { getAgendaData, saveCompromisso, saveMensagemProgramada, saveLocal } from "@/lib/agenda.functions";
import { listLeadsForPicker } from "@/lib/agendamentos.functions";
import { MessageForm, mensagemVazia, type MensagemForm } from "./message-form";
import { AppointmentForm, formVazio, type FormState, type LeadOpt } from "./appointment-form";
import { dateOnly, fimItem, mesmoDia, pad, parseDateOnly, type Item, type Local, type Profissional, type Servico } from "./shared";
import { buildSlots, type Ocupado } from "./slots";
import type { BusinessHours } from "@/lib/business-hours";

export type QuickScheduleTarget = {
  numero: string;
  nome?: string | null;
  cardId?: string | null;
};

/** Popup de agendamento reutilizável (Kanban, detalhe do lead e chat).
 *  Usa exatamente os mesmos formulários do módulo de Agendamentos. */
export function QuickScheduleDialog({
  open,
  onOpenChange,
  target,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  target: QuickScheduleTarget | null;
  onSaved?: () => void;
}) {
  const carregarAgenda = useServerFn(getAgendaData);
  const carregarLeads = useServerFn(listLeadsForPicker);
  const _save = useServerFn(saveCompromisso);
  const _saveMsg = useServerFn(saveMensagemProgramada);
  const _saveLocal = useServerFn(saveLocal);

  const [tipo, setTipo] = useState<"escolha" | "compromisso" | "mensagem">("escolha");
  const [dados, setDados] = useState<any>(null);
  const [leads, setLeads] = useState<LeadOpt[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [conflitos, setConflitos] = useState<{ tipo: string; mensagem: string }[]>([]);

  const [form, setForm] = useState<FormState>(formVazio());
  const [msgForm, setMsgForm] = useState<MensagemForm>(mensagemVazia());

  const profissionais: Profissional[] = dados?.profissionais ?? [];
  const servicos: Servico[] = dados?.servicos ?? [];
  const locais: Local[] = dados?.locais ?? [];
  const itens: Item[] = dados?.itens ?? [];
  const meuId: string = dados?.me?.userId ?? "";
  const isManager = !!dados?.me?.isManager;
  const empresaHorarios: BusinessHours | null = dados?.empresa_horarios ?? null;

  useEffect(() => {
    if (!open) return;
    setTipo("escolha");
    setConflitos([]);
    void (async () => {
      try {
        const [d, l]: any = await Promise.all([carregarAgenda({ data: {} } as any), carregarLeads()]);
        setDados(d);
        setLeads(l ?? []);
      } catch {
        /* segue com o mínimo */
      }
    })();
  }, [open]);

  function base() {
    const agora = new Date(Date.now() + 60 * 60 * 1000);
    agora.setMinutes(0, 0, 0);
    return {
      card_id: target?.cardId ?? "",
      numero: target?.numero ?? "",
      nome_lead: target?.nome ?? "",
      dia: dateOnly(agora),
      hora: `${pad(agora.getHours())}:${pad(agora.getMinutes())}`,
    };
  }

  function abrirCompromisso() {
    setForm(formVazio({ ...base(), profissional_id: meuId }));
    setTipo("compromisso");
  }

  function abrirMensagem() {
    setMsgForm(mensagemVazia({ ...base(), profissional_id: meuId }));
    setTipo("mensagem");
  }

  const slotsLivres = (() => {
    const alvo = parseDateOnly(form.dia || dateOnly(new Date()));
    const prof = profissionais.find((p) => p.user_id === form.profissional_id);
    const h = (prof?.horarios as BusinessHours | null) ?? empresaHorarios ?? null;
    const ocupados: Ocupado[] = itens
      .filter((c) => c.tipo === "compromisso" && mesmoDia(new Date(c.agendado_para), alvo) && !["cancelado", "falta"].includes(c.status))
      .filter((c) => !form.profissional_id || c.profissional_id === form.profissional_id)
      .map((c) => ({ inicio: c.agendado_para, fim: fimItem(c).toISOString() }));
    return buildSlots(h, alvo, form.duracao_min || 30, ocupados);
  })();

  async function salvarLocal(nome: string, endereco: string) {
    try {
      await _saveLocal({ data: { nome, endereco } });
      const d: any = await carregarAgenda({ data: {} } as any);
      setDados(d);
      toast.success("Local salvo.");
    } catch (e: any) {
      toast.error(e?.message || "Erro ao salvar o local.");
    }
  }

  async function submitCompromisso(forcar: boolean) {
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
      toast.success("Compromisso criado.");
      onOpenChange(false);
      onSaved?.();
    } catch (e: any) {
      toast.error(e?.message || "Erro ao salvar o compromisso.");
    } finally {
      setSalvando(false);
    }
  }

  async function submitMensagem() {
    if (!msgForm.numero) return toast.error("Contato sem número");
    if (!msgForm.mensagem.trim()) return toast.error("Escreva a mensagem");
    setSalvando(true);
    try {
      const [h, m] = msgForm.hora.split(":").map(Number);
      const quando = parseDateOnly(msgForm.dia);
      quando.setHours(h || 0, m || 0, 0, 0);
      await _saveMsg({
        data: {
          card_id: msgForm.card_id || null,
          numero: msgForm.numero,
          nome_lead: msgForm.nome_lead || null,
          titulo: msgForm.titulo || null,
          mensagem: msgForm.mensagem,
          canal: msgForm.canal,
          agendado_para: (msgForm.enviar_agora ? new Date() : quando).toISOString(),
          profissional_id: msgForm.profissional_id || null,
        },
      });
      toast.success(msgForm.enviar_agora ? "Mensagem enviada." : "Mensagem programada.");
      onOpenChange(false);
      onSaved?.();
    } catch (e: any) {
      toast.error(e?.message || "Não foi possível programar a mensagem");
    } finally {
      setSalvando(false);
    }
  }

  if (tipo === "compromisso") {
    return (
      <AppointmentForm
        open={open}
        onOpenChange={onOpenChange}
        form={form}
        setForm={setForm}
        leads={leads}
        servicos={servicos}
        profissionais={profissionais}
        locais={locais}
        slotsLivres={slotsLivres}
        conflitos={conflitos}
        podeForcar={isManager}
        salvando={salvando}
        onSalvar={(forcar) => void submitCompromisso(forcar)}
        onSalvarLocal={salvarLocal}
      />
    );
  }

  if (tipo === "mensagem") {
    return (
      <MessageForm
        open={open}
        onOpenChange={onOpenChange}
        form={msgForm}
        setForm={setMsgForm}
        leads={leads}
        profissionais={profissionais}
        salvando={salvando}
        onSalvar={() => void submitMensagem()}
      />
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Novo agendamento</DialogTitle>
          <DialogDescription>
            {target?.nome || target?.numero} — aparece no módulo de Agendamentos.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2">
          <Button variant="outline" className="h-auto justify-start py-3" onClick={abrirCompromisso}>
            <span className="text-left">
              <span className="block text-sm font-medium">Compromisso</span>
              <span className="block text-xs text-muted-foreground">Reunião, consulta ou serviço na agenda</span>
            </span>
          </Button>
          <Button variant="outline" className="h-auto justify-start py-3" onClick={abrirMensagem}>
            <span className="text-left">
              <span className="block text-sm font-medium">Mensagem</span>
              <span className="block text-xs text-muted-foreground">Envio de WhatsApp em data e hora marcadas</span>
            </span>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
