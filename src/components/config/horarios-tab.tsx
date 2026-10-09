import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import { Coffee, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { getBusinessHours, saveBusinessHours } from "@/lib/templates.functions";
import { defaultHours, DIA_LABEL, type BusinessHours, type DaySchedule } from "@/lib/business-hours";

const TIMEZONES = [
  "America/Sao_Paulo",
  "America/Manaus",
  "America/Fortaleza",
  "America/Belem",
  "America/Cuiaba",
  "America/Recife",
  "America/Rio_Branco",
  "America/Noronha",
];

export function HorariosTab() {
  const fetcher = useServerFn(getBusinessHours);
  const saver = useServerFn(saveBusinessHours);
  const [h, setH] = useState<BusinessHours>(defaultHours());
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const r = await fetcher();
        if (r.horarios) setH({ ...defaultHours(), ...(r.horarios as Partial<BusinessHours>) });
        setMsg(r.mensagem || "Olá! No momento estamos fora do horário de atendimento. Assim que abrirmos, retornamos. 🙏");
      } catch (e: any) {
        toast.error(e?.message);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line
  }, []);

  async function onSave() {
    setSaving(true);
    try {
      await saver({ data: { horarios: h, mensagem: msg } });
      toast.success("Horário salvo");
    } catch (e: any) {
      toast.error(e?.message);
    } finally {
      setSaving(false);
    }
  }

  function toggleDay(d: string, on: boolean) {
    setH((prev) => ({
      ...prev,
      dias: { ...prev.dias, [d]: on ? { abre: "09:00", fecha: "18:00" } : null },
    }));
  }

  function setDay(d: string, key: keyof NonNullable<DaySchedule>, value: any) {
    setH((prev) => {
      const cur = prev.dias[d] ?? { abre: "09:00", fecha: "18:00" };
      return { ...prev, dias: { ...prev.dias, [d]: { ...cur, [key]: value } } };
    });
  }

  if (loading) return <div className="grid place-items-center py-8"><Loader2 className="animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4 max-w-3xl">
      <Card className="p-4 sm:p-5 space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="font-semibold">Horário de atendimento</h2>
            <p className="text-xs text-muted-foreground">
              Quando ativo, fora do horário a IA não responde — envia automaticamente a mensagem abaixo.
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <span>Ativo</span>
            <Switch checked={h.enabled} onCheckedChange={(v) => setH({ ...h, enabled: v })} />
          </label>
        </div>

        <div>
          <Label>Fuso horário</Label>
          <select
            value={h.timezone}
            onChange={(e) => setH({ ...h, timezone: e.target.value })}
            className="w-full h-10 px-3 rounded-md border bg-background text-sm"
          >
            {TIMEZONES.map((tz) => <option key={tz}>{tz}</option>)}
          </select>
        </div>

        <div className="space-y-3">
          {Object.keys(DIA_LABEL).map((d) => {
            const day = h.dias[d];
            const on = !!day;
            return (
              <div
                key={d}
                className={`transition-all duration-200 border rounded-lg p-3 sm:p-4 space-y-3 ${
                  on ? "bg-card shadow-sm border-primary/20" : "bg-muted/30 border-dashed opacity-70"
                }`}
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <Switch checked={on} onCheckedChange={(v) => toggleDay(d, v)} />
                    <span className={`font-medium text-sm sm:text-base ${on ? "text-foreground" : "text-muted-foreground"}`}>
                      {DIA_LABEL[d]}
                    </span>
                  </div>
                  
                  {on && day && (
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className={`h-8 px-2 gap-1.5 text-xs rounded-full transition-colors ${
                        day.pausa_ativa ? "bg-amber-100 text-amber-700 hover:bg-amber-200 hover:text-amber-800" : "text-muted-foreground hover:bg-muted"
                      }`}
                      onClick={() => setDay(d, "pausa_ativa", !day.pausa_ativa)}
                    >
                      <Coffee className="size-3.5" />
                      {day.pausa_ativa ? "Pausa ativa" : "Adicionar pausa"}
                    </Button>
                  )}
                </div>

                {on && day ? (
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3 animate-in fade-in slide-in-from-top-1 duration-200">
                    <div className="flex-1 space-y-1.5">
                      <Label className="text-[10px] uppercase text-muted-foreground font-bold ml-1">Horário de Funcionamento</Label>
                      <div className="flex items-center gap-2">
                        <Input 
                          type="time" 
                          value={day.abre} 
                          onChange={(e) => setDay(d, "abre", e.target.value)} 
                          className="h-9 w-full sm:w-32 bg-background border-primary/10 focus:border-primary" 
                        />
                        <span className="text-muted-foreground text-sm font-medium">às</span>
                        <Input 
                          type="time" 
                          value={day.fecha} 
                          onChange={(e) => setDay(d, "fecha", e.target.value)} 
                          className="h-9 w-full sm:w-32 bg-background border-primary/10 focus:border-primary" 
                        />
                      </div>
                    </div>

                    {day.pausa_ativa && (
                      <div className="flex-1 space-y-1.5 pt-3 sm:pt-0 sm:pl-6 sm:border-l border-dashed border-primary/20 animate-in zoom-in-95 duration-200">
                        <Label className="text-[10px] uppercase text-amber-600 font-bold ml-1">Intervalo (Pausa)</Label>
                        <div className="flex items-center gap-2">
                          <Input 
                            type="time" 
                            value={day.pausa_abre || "12:00"} 
                            onChange={(e) => setDay(d, "pausa_abre", e.target.value)} 
                            className="h-9 w-full sm:w-32 bg-amber-50/30 border-amber-200 focus:border-amber-400 focus:ring-amber-400" 
                          />
                          <span className="text-amber-600/60 text-sm font-medium">às</span>
                          <Input 
                            type="time" 
                            value={day.pausa_fecha || "13:00"} 
                            onChange={(e) => setDay(d, "pausa_fecha", e.target.value)} 
                            className="h-9 w-full sm:w-32 bg-amber-50/30 border-amber-200 focus:border-amber-400 focus:ring-amber-400" 
                          />
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="pl-12">
                    <span className="text-xs text-muted-foreground italic">Fechado para atendimento</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div>
          <Label>Mensagem fora do horário</Label>
          <Textarea rows={3} value={msg} onChange={(e) => setMsg(e.target.value)} />
        </div>

        <div className="flex justify-stretch sm:justify-end">
          <Button className="w-full sm:w-auto" onClick={onSave} disabled={saving}>
            {saving ? <Loader2 className="size-4 mr-1.5 animate-spin" /> : <Save className="size-4 mr-1.5" />} Salvar
          </Button>
        </div>
      </Card>
    </div>
  );
}
