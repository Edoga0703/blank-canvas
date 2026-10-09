import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, Sparkles } from "lucide-react";
import { dateOnly, fmtData, pad, type Item, type Profissional } from "./shared";
import type { LeadOpt } from "./appointment-form";
import { ContactPicker } from "./contact-picker";
import { gerarMensagemIA } from "@/lib/agenda.functions";

export const VARIAVEIS = [
  "{{nome}}", "{{responsavel}}", "{{data}}", "{{horario}}", "{{servico}}",
  "{{empresa}}", "{{endereco}}", "{{link}}",
];

export type MensagemForm = {
  id: string | null;
  card_id: string;
  numero: string;
  nome_lead: string;
  titulo: string;
  mensagem: string;
  canal: string;
  dia: string;
  hora: string;
  appointment_id: string;
  profissional_id: string;
  enviar_agora: boolean;
};

export function mensagemVazia(preset?: Partial<MensagemForm>): MensagemForm {
  const agora = new Date();
  return {
    id: null, card_id: "", numero: "", nome_lead: "", titulo: "", mensagem: "",
    canal: "whatsapp", dia: dateOnly(agora), hora: `${pad(agora.getHours())}:${pad(agora.getMinutes())}`,
    appointment_id: "", profissional_id: "", enviar_agora: false, ...preset,
  };
}

export function aplicarVariaveis(
  texto: string,
  ctx: { nome?: string; responsavel?: string; data?: string; horario?: string; servico?: string; empresa?: string; endereco?: string; link?: string },
) {
  return texto
    .replace(/\{\{nome\}\}/g, ctx.nome || "")
    .replace(/\{\{responsavel\}\}/g, ctx.responsavel || "")
    .replace(/\{\{data\}\}/g, ctx.data || "")
    .replace(/\{\{horario\}\}/g, ctx.horario || "")
    .replace(/\{\{servico\}\}/g, ctx.servico || "")
    .replace(/\{\{empresa\}\}/g, ctx.empresa || "")
    .replace(/\{\{endereco\}\}/g, ctx.endereco || "")
    .replace(/\{\{link\}\}/g, ctx.link || "");
}

export function variaveisInvalidas(texto: string) {
  const usados = texto.match(/\{\{[^}]+\}\}/g) ?? [];
  return usados.filter((v) => !VARIAVEIS.includes(v));
}

export function MessageForm({
  open, onOpenChange, form, setForm, leads, compromissos = [], profissionais, salvando, onSalvar,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  form: MensagemForm;
  setForm: (f: MensagemForm) => void;
  leads: LeadOpt[];
  compromissos?: Item[];
  profissionais: Profissional[];
  salvando: boolean;
  onSalvar: () => void;
}) {
  const set = (p: Partial<MensagemForm>) => setForm({ ...form, ...p });
  const _gerar = useServerFn(gerarMensagemIA);
  const [objetivo, setObjetivo] = useState("");
  const [gerando, setGerando] = useState(false);

  const previa = useMemo(() => aplicarVariaveis(form.mensagem, {
    nome: form.nome_lead,
    responsavel: profissionais.find((p) => p.user_id === form.profissional_id)?.nome,
    data: fmtData(`${form.dia}T00:00:00`),
    horario: form.hora,
  }), [form, profissionais]);

  const invalidas = variaveisInvalidas(form.mensagem);

  async function gerarComIA() {
    setGerando(true);
    try {
      const r: any = await _gerar({
        data: {
          nome: form.nome_lead || null,
          objetivo: objetivo.trim() || form.titulo || null,
          data: fmtData(`${form.dia}T00:00:00`),
          hora: form.hora,
        },
      });
      if (r?.texto) set({ mensagem: r.texto });
      else toast.error("A IA não conseguiu gerar a mensagem.");
    } catch (e: any) {
      toast.error(e?.message || "Não foi possível gerar a mensagem.");
    } finally {
      setGerando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-xl p-0 gap-0">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle>{form.id ? "Editar mensagem" : "Nova mensagem"}</DialogTitle>
          <DialogDescription>Programe uma mensagem de WhatsApp para um contato.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-6 py-4 max-h-[70vh] overflow-y-auto">
          <div className="space-y-1.5">
            <Label htmlFor="ms-busca">Destinatário</Label>
            <ContactPicker
              id="ms-busca"
              leads={leads}
              cardId={form.card_id}
              nome={form.nome_lead}
              numero={form.numero}
              onSelect={(l) => set({ card_id: l.id, numero: l.numero, nome_lead: l.nome || "" })}
            />
            <div className="grid grid-cols-2 gap-3 pt-1">
              <Input aria-label="Nome" value={form.nome_lead} onChange={(e) => set({ nome_lead: e.target.value })} placeholder="Nome" />
              <Input aria-label="Telefone" value={form.numero} onChange={(e) => set({ numero: e.target.value })} placeholder="Telefone" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ms-titulo">Título</Label>
              <Input id="ms-titulo" value={form.titulo} onChange={(e) => set({ titulo: e.target.value })} placeholder="Confirmação de consulta" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ms-resp">Responsável</Label>
              <Select value={form.profissional_id || "none"} onValueChange={(v) => set({ profissional_id: v === "none" ? "" : v })}>
                <SelectTrigger id="ms-resp"><SelectValue placeholder="Sem responsável" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem responsável</SelectItem>
                  {profissionais.map((p) => <SelectItem key={p.user_id} value={p.user_id}>{p.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ms-dia">Data</Label>
              <Input id="ms-dia" type="date" value={form.dia} onChange={(e) => set({ dia: e.target.value })} disabled={form.enviar_agora} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ms-hora">Horário</Label>
              <Input id="ms-hora" type="time" value={form.hora} onChange={(e) => set({ hora: e.target.value })} disabled={form.enviar_agora} />
            </div>
          </div>

          {compromissos.length > 0 && (
            <div className="space-y-1.5">
              <Label htmlFor="ms-compromisso">Compromisso relacionado</Label>
              <Select
                value={form.appointment_id || "none"}
                onValueChange={(v) => set({ appointment_id: v === "none" ? "" : v })}
              >
                <SelectTrigger id="ms-compromisso"><SelectValue placeholder="Nenhum" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum</SelectItem>
                  {compromissos.slice(0, 50).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {fmtData(c.agendado_para)} · {c.titulo || c.nome_lead || "Compromisso"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="ms-texto">Mensagem</Label>
            <Textarea id="ms-texto" rows={4} value={form.mensagem} onChange={(e) => set({ mensagem: e.target.value })} />

            <div className="rounded-lg border bg-muted/30 p-2 space-y-2">
              <div className="flex items-center gap-2">
                <Input
                  aria-label="Objetivo da mensagem"
                  value={objetivo}
                  onChange={(e) => setObjetivo(e.target.value)}
                  placeholder="Do que se trata? Ex.: lembrar do retorno"
                  className="h-8 text-[13px]"
                />
                <Button type="button" size="sm" className="h-8 shrink-0" onClick={() => void gerarComIA()} disabled={gerando}>
                  {gerando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  <span className="ml-1 hidden sm:inline">Gerar com IA</span>
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                A IA usa o nome do contato e a data escolhida. Você pode editar o texto depois.
              </p>
            </div>

            <div className="flex flex-wrap gap-1 pt-1">
              {VARIAVEIS.map((v) => (
                <Button key={v} type="button" size="sm" variant="outline" className="h-6 text-[11px]"
                  onClick={() => set({ mensagem: `${form.mensagem}${v}` })}>
                  {v}
                </Button>
              ))}
            </div>
            {invalidas.length > 0 && (
              <p className="text-xs text-red-600">Variáveis inválidas: {invalidas.join(", ")}</p>
            )}
          </div>


          <div className="flex items-center gap-2">
            <Badge
              role="button"
              tabIndex={0}
              variant={form.enviar_agora ? "default" : "outline"}
              onClick={() => set({ enviar_agora: !form.enviar_agora })}
              onKeyDown={(e) => e.key === "Enter" && set({ enviar_agora: !form.enviar_agora })}
              className="cursor-pointer"
            >
              Enviar imediatamente
            </Badge>
          </div>
        </div>

        <div className="flex gap-2 border-t px-6 py-3">
          <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button className="flex-1" onClick={onSalvar} disabled={salvando || invalidas.length > 0}>
            {salvando && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
            {form.enviar_agora ? "Enviar agora" : "Programar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
