import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { saveProfissionalHorarios } from "@/lib/agendamentos.functions";
import { DIA_LABEL, defaultHours, type BusinessHours } from "@/lib/business-hours";
import { Loader2 } from "lucide-react";

export type Profissional = {
  user_id: string;
  nome: string;
  avatar_url: string | null;
  role: string;
  horarios: BusinessHours | null;
};

/** Define os dias e horários de atendimento de cada pessoa da equipe. */
export function HorariosEquipeDialog({
  open,
  onOpenChange,
  profissionais,
  empresa,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  profissionais: Profissional[];
  empresa: BusinessHours | null;
  onSaved?: () => void;
}) {
  const salvar = useServerFn(saveProfissionalHorarios);
  const [sel, setSel] = useState<string>("");
  const [h, setH] = useState<BusinessHours | null>(null);
  const [saving, setSaving] = useState(false);

  const atual = useMemo(() => profissionais.find((p) => p.user_id === sel) ?? null, [profissionais, sel]);

  useEffect(() => {
    if (!open) return;
    const first = profissionais[0]?.user_id ?? "";
    setSel(first);
  }, [open, profissionais]);

  useEffect(() => {
    setH(atual?.horarios ?? null);
  }, [atual]);

  function ligarProprio() {
    setH(JSON.parse(JSON.stringify(empresa ?? defaultHours())) as BusinessHours);
  }

  function setDia(dow: string, patch: any | null) {
    setH((prev) => {
      const base = prev ?? defaultHours();
      return { ...base, dias: { ...base.dias, [dow]: patch } };
    });
  }

  async function submit() {
    if (!sel) return;
    setSaving(true);
    try {
      await salvar({ data: { user_id: sel, horarios: h } });
      toast.success("Horários salvos");
      onSaved?.();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || "Não foi possível salvar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Horários de atendimento</DialogTitle>
          <DialogDescription>
            Defina os dias e horários de cada pessoa. Quem não tiver horário próprio usa o horário da empresa.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap gap-1.5">
            {profissionais.map((p) => (
              <button
                key={p.user_id}
                type="button"
                onClick={() => setSel(p.user_id)}
                className={`rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors ${
                  sel === p.user_id ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"
                }`}
              >
                {p.nome}
              </button>
            ))}
          </div>

          {!h ? (
            <div className="rounded-lg border border-dashed p-6 text-center space-y-2">
              <p className="text-sm">
                {atual?.nome || "Esta pessoa"} usa o horário de funcionamento da empresa.
              </p>
              <Button size="sm" variant="outline" onClick={ligarProprio}>Definir horário próprio</Button>
            </div>
          ) : (
            <div className="space-y-2">
              {Object.keys(DIA_LABEL).map((dow) => {
                const dia = h.dias?.[dow] ?? null;
                return (
                  <div key={dow} className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2">
                    <div className="w-24 text-[13px] font-medium">{DIA_LABEL[dow]}</div>
                    <Switch
                      checked={!!dia}
                      onCheckedChange={(v) => setDia(dow, v ? { abre: "09:00", fecha: "18:00" } : null)}
                    />
                    {dia ? (
                      <>
                        <Input
                          type="time"
                          className="h-8 w-28"
                          value={dia.abre}
                          onChange={(e) => setDia(dow, { ...dia, abre: e.target.value })}
                        />
                        <span className="text-muted-foreground text-xs">até</span>
                        <Input
                          type="time"
                          className="h-8 w-28"
                          value={dia.fecha}
                          onChange={(e) => setDia(dow, { ...dia, fecha: e.target.value })}
                        />
                        <label className="ml-auto flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
                          <Switch
                            checked={!!dia.pausa_ativa}
                            onCheckedChange={(v) =>
                              setDia(dow, { ...dia, pausa_ativa: v, pausa_abre: dia.pausa_abre || "12:00", pausa_fecha: dia.pausa_fecha || "13:00" })
                            }
                          />
                          Intervalo
                        </label>
                        {dia.pausa_ativa && (
                          <>
                            <Input
                              type="time"
                              className="h-8 w-24"
                              value={dia.pausa_abre || "12:00"}
                              onChange={(e) => setDia(dow, { ...dia, pausa_abre: e.target.value })}
                            />
                            <Input
                              type="time"
                              className="h-8 w-24"
                              value={dia.pausa_fecha || "13:00"}
                              onChange={(e) => setDia(dow, { ...dia, pausa_fecha: e.target.value })}
                            />
                          </>
                        )}
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground">Não atende</span>
                    )}
                  </div>
                );
              })}
              <button
                type="button"
                className="text-xs text-muted-foreground underline"
                onClick={() => setH(null)}
              >
                Voltar a usar o horário da empresa
              </button>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={() => void submit()} disabled={saving || !sel}>
            {saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
