import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Loader2, Plus, Trash2 } from "lucide-react";
import {
  getDisponibilidade, saveDisponibilidade, deleteBloqueio,
} from "@/lib/agenda.functions";
import {
  fmtDataHora, type Bloqueio, type Profissional, type Servico,
} from "./shared";
import { useCapacidadeAtiva } from "@/hooks/use-capacidades";
import { GoogleCalendarPanel } from "@/components/plugins/google-calendar-panel";

const DIAS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

type Regra = {
  weekday: number; ativo: boolean; start_time: string; end_time: string;
  interval_start: string; interval_end: string;
};

const regrasPadrao = (): Regra[] =>
  DIAS.map((_, i) => ({
    weekday: i, ativo: i >= 1 && i <= 5, start_time: "08:00", end_time: "18:00",
    interval_start: "12:00", interval_end: "13:00",
  }));

export function SettingsArea({
  profissionais, servicos, bloqueios, isManager, meuId, onMudou, onNovoBloqueio,
}: {
  profissionais: Profissional[];
  servicos: Servico[];
  bloqueios: Bloqueio[];
  isManager: boolean;
  meuId: string;
  onMudou: () => void;
  onNovoBloqueio: () => void;
}) {
  const _get = useServerFn(getDisponibilidade);
  const _saveDisp = useServerFn(saveDisponibilidade);
  const _delBloq = useServerFn(deleteBloqueio);

  const [alvo, setAlvo] = useState<string>("empresa");
  const [regras, setRegras] = useState<Regra[]>(regrasPadrao());
  const [extras, setExtras] = useState({ duracao: 30, folga: 0, antecedencia: 0, maxDias: 60, tz: "America/Sao_Paulo" });
  const [todas, setTodas] = useState<any[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  

  async function carregar() {
    setCarregando(true);
    try {
      const r: any = await _get();
      setTodas(r ?? []);
    } catch (e: any) {
      toast.error(e?.message || "Não foi possível carregar a disponibilidade.");
    } finally {
      setCarregando(false);
    }
  }
  useEffect(() => { void carregar(); }, []);

  useEffect(() => {
    const userId = alvo === "empresa" ? null : alvo;
    const linhas = todas.filter((r) => (r.user_id ?? null) === userId);
    if (!linhas.length) { setRegras(regrasPadrao()); return; }
    const base = regrasPadrao();
    for (const l of linhas) {
      const i = base.findIndex((b) => b.weekday === l.weekday);
      if (i >= 0) {
        base[i] = {
          weekday: l.weekday, ativo: l.ativo ?? true,
          start_time: (l.start_time || "08:00").slice(0, 5),
          end_time: (l.end_time || "18:00").slice(0, 5),
          interval_start: (l.interval_start || "").slice(0, 5),
          interval_end: (l.interval_end || "").slice(0, 5),
        };
      }
    }
    const p = linhas[0];
    setExtras({
      duracao: p?.duracao_padrao_min ?? 30,
      folga: p?.folga_min ?? 0,
      antecedencia: p?.antecedencia_min_min ?? 0,
      maxDias: p?.antecedencia_max_dias ?? 60,
      tz: p?.timezone || "America/Sao_Paulo",
    });
    setRegras(base);
  }, [alvo, todas]);

  async function salvarDisponibilidade() {
    setSalvando(true);
    try {
      await _saveDisp({
        data: {
          user_id: alvo === "empresa" ? null : alvo,
          regras: regras.map((r) => ({
            weekday: r.weekday, ativo: r.ativo, start_time: r.start_time, end_time: r.end_time,
            interval_start: r.interval_start || null, interval_end: r.interval_end || null,
          })),
          duracao_padrao_min: extras.duracao,
          folga_min: extras.folga,
          antecedencia_min_min: extras.antecedencia,
          antecedencia_max_dias: extras.maxDias,
          timezone: extras.tz,
        },
      });
      toast.success("Disponibilidade salva.");
      await carregar();
      onMudou();
    } catch (e: any) {
      toast.error(e?.message || "Erro ao salvar.");
    } finally {
      setSalvando(false);
    }
  }

  const podeEditarAlvo = isManager || alvo === meuId;
  const temGoogle = useCapacidadeAtiva("google-calendar");

  return (
    <Accordion type="multiple" defaultValue={["disp"]} className="space-y-3">
      <Secao valor="disp" titulo="Disponibilidade da equipe">
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cfg-alvo">Agenda</Label>
              <Select value={alvo} onValueChange={setAlvo}>
                <SelectTrigger id="cfg-alvo" className="w-[220px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="empresa">Padrão da empresa</SelectItem>
                  {profissionais.map((p) => <SelectItem key={p.user_id} value={p.user_id}>{p.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cfg-tz">Fuso horário</Label>
              <Input id="cfg-tz" className="w-[200px]" value={extras.tz} onChange={(e) => setExtras({ ...extras, tz: e.target.value })} />
            </div>
          </div>

          {carregando ? (
            <div className="space-y-2">
              {[0, 1, 2, 3].map((i) => <div key={i} className="h-10 rounded-md bg-muted animate-pulse" />)}
            </div>
          ) : (
            <div className="space-y-1.5">
              {regras.map((r, idx) => (
                <div key={r.weekday} className="grid grid-cols-[110px_auto_1fr] items-center gap-2 rounded-md border p-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Switch
                      checked={r.ativo}
                      aria-label={`Atender na ${DIAS[r.weekday]}`}
                      onCheckedChange={(v) => setRegras(regras.map((x, i) => i === idx ? { ...x, ativo: v } : x))}
                    />
                    <span className="text-xs truncate">{DIAS[r.weekday]}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Input type="time" className="h-8 w-[100px]" aria-label="Início" value={r.start_time} disabled={!r.ativo}
                      onChange={(e) => setRegras(regras.map((x, i) => i === idx ? { ...x, start_time: e.target.value } : x))} />
                    <span className="text-xs text-muted-foreground">até</span>
                    <Input type="time" className="h-8 w-[100px]" aria-label="Fim" value={r.end_time} disabled={!r.ativo}
                      onChange={(e) => setRegras(regras.map((x, i) => i === idx ? { ...x, end_time: e.target.value } : x))} />
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground">Intervalo</span>
                    <Input type="time" className="h-8 w-[100px]" aria-label="Intervalo início" value={r.interval_start} disabled={!r.ativo}
                      onChange={(e) => setRegras(regras.map((x, i) => i === idx ? { ...x, interval_start: e.target.value } : x))} />
                    <Input type="time" className="h-8 w-[100px]" aria-label="Intervalo fim" value={r.interval_end} disabled={!r.ativo}
                      onChange={(e) => setRegras(regras.map((x, i) => i === idx ? { ...x, interval_end: e.target.value } : x))} />
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Campo label="Duração padrão (min)" value={extras.duracao} onChange={(v) => setExtras({ ...extras, duracao: v })} />
            <Campo label="Intervalo entre atendimentos (min)" value={extras.folga} onChange={(v) => setExtras({ ...extras, folga: v })} />
            <Campo label="Antecedência mínima (min)" value={extras.antecedencia} onChange={(v) => setExtras({ ...extras, antecedencia: v })} />
            <Campo label="Prazo máximo (dias)" value={extras.maxDias} onChange={(v) => setExtras({ ...extras, maxDias: v })} />
          </div>

          <Button size="sm" onClick={salvarDisponibilidade} disabled={salvando || !podeEditarAlvo}>
            {salvando && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />} Salvar disponibilidade
          </Button>
          {!podeEditarAlvo && <p className="text-xs text-muted-foreground">Você só pode alterar a sua própria disponibilidade.</p>}
        </div>
      </Secao>

      <Secao valor="servicos" titulo="Serviços e duração">
        {servicos.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Nenhum serviço cadastrado. Gerencie os serviços no módulo Comercial → Catálogo.
          </p>
        ) : (
          <ul className="divide-y rounded-md border">
            {servicos.map((s) => (
              <li key={s.id} className="flex items-center justify-between px-3 py-2 text-sm">
                <span className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: s.cor || "#0B22FE" }} />
                  {s.nome}
                </span>
                <span className="text-xs text-muted-foreground">{s.duracao_min} min</span>
              </li>
            ))}
          </ul>
        )}
        <Button variant="outline" size="sm" className="mt-2" asChild><a href="/app/catalogo">Abrir catálogo</a></Button>
      </Secao>

      <Secao valor="bloqueios" titulo="Feriados e bloqueios">
        <div className="space-y-2">
          <Button size="sm" onClick={onNovoBloqueio}><Plus className="w-4 h-4 mr-1" /> Novo bloqueio</Button>
          {bloqueios.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhum bloqueio cadastrado no período visível.</p>
          ) : (
            <ul className="divide-y rounded-md border">
              {bloqueios.map((b) => (
                <li key={b.id} className="flex items-center justify-between px-3 py-2 text-sm">
                  <div>
                    <p className="font-medium">{b.motivo || "Bloqueio"}</p>
                    <p className="text-xs text-muted-foreground">
                      {fmtDataHora(b.inicio)} — {fmtDataHora(b.fim)} ·{" "}
                      {b.user_id ? profissionais.find((p) => p.user_id === b.user_id)?.nome || "Profissional" : "Toda a equipe"}
                    </p>
                  </div>
                  <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Remover bloqueio"
                    onClick={async () => { await _delBloq({ data: { id: b.id } }); toast.success("Bloqueio removido."); onMudou(); }}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Secao>

      <Secao valor="google" titulo="Google Agenda e Meet">
        {temGoogle ? (
          <GoogleCalendarPanel />
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Para sincronizar os compromissos com a agenda do Google e criar salas do Meet, instale os
              plugins <strong>Google Calendar</strong> e <strong>Google Meet</strong> na Loja de Plugins.
            </p>
            <Button size="sm" variant="outline" asChild><a href="/app/plugins">Abrir Loja de Plugins</a></Button>
          </div>
        )}
      </Secao>
    </Accordion>
  );
}

function Secao({ valor, titulo, children }: { valor: string; titulo: string; children: React.ReactNode }) {
  return (
    <AccordionItem value={valor} className="rounded-lg border bg-card px-3">
      <AccordionTrigger className="text-sm font-semibold">{titulo}</AccordionTrigger>
      <AccordionContent className="pb-4">{children}</AccordionContent>
    </AccordionItem>
  );
}

function Campo({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const id = useMemo(() => `cfg-${label.replace(/\W+/g, "-").toLowerCase()}`, [label]);
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs">{label}</Label>
      <Input id={id} type="number" className="h-8" value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}

