import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { getSupportConfig, saveSupportConfig } from "@/lib/support.functions";

const DIAS = [
  { v: 0, l: "Dom" }, { v: 1, l: "Seg" }, { v: 2, l: "Ter" }, { v: 3, l: "Qua" },
  { v: 4, l: "Qui" }, { v: 5, l: "Sex" }, { v: 6, l: "Sáb" },
];

export function SupportConfigDialog({
  open,
  onOpenChange,
  inline = false,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  inline?: boolean;
}) {
  const getFn = useServerFn(getSupportConfig);
  const saveFn = useServerFn(saveSupportConfig);
  const [form, setForm] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  const { data } = useQuery({
    queryKey: ["support-config"],
    queryFn: () => getFn({ data: {} }),
    enabled: open,
  });

  useEffect(() => {
    if (data?.config) setForm({ ...data.config });
  }, [data]);

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const toggleDia = (d: number) =>
    setForm((f: any) => {
      const cur: number[] = f.dias_semana ?? [];
      return { ...f, dias_semana: cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort() };
    });

  async function save() {
    setSaving(true);
    try {
      await saveFn({ data: form });
      toast.success("Configuração salva");
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao salvar");
    } finally {
      setSaving(false);
    }
  }

  const body = (
    <>

        {!form ? (
          <div className="py-12 grid place-items-center"><Loader2 className="size-5 animate-spin" /></div>
        ) : (
          <div className="space-y-5">
            <p className="text-xs text-muted-foreground">
              A triagem por IA classifica automaticamente categoria e prioridade de cada novo chamado, definindo o SLA.
            </p>

            <section className="space-y-2 border rounded-lg p-3 bg-card shadow-sm">
              <div className="flex items-center justify-between">
                <Label>Resposta automática ao abrir chamado</Label>
                <Switch checked={!!form.auto_reply_enabled} onCheckedChange={(v) => set("auto_reply_enabled", v)} />
              </div>
              <Textarea rows={3} value={form.auto_reply_message} onChange={(e) => set("auto_reply_message", e.target.value)} />
            </section>

            <section className="space-y-3 border rounded-lg p-3 bg-card shadow-sm">
              <div className="flex items-center justify-between">
                <Label>Mensagem fora do horário</Label>
                <Switch checked={!!form.offhours_enabled} onCheckedChange={(v) => set("offhours_enabled", v)} />
              </div>
              <Textarea rows={2} value={form.offhours_message} onChange={(e) => set("offhours_message", e.target.value)} />
              <div className="flex flex-wrap items-center gap-2">
                <Input type="number" min={0} max={23} className="w-20" value={form.horario_inicio}
                  onChange={(e) => set("horario_inicio", Number(e.target.value))} />
                <span className="text-sm text-muted-foreground">às</span>
                <Input type="number" min={1} max={24} className="w-20" value={form.horario_fim}
                  onChange={(e) => set("horario_fim", Number(e.target.value))} />
                <div className="flex gap-1 ml-2">
                  {DIAS.map((d) => (
                    <button key={d.v} type="button" onClick={() => toggleDia(d.v)}
                      className={`px-2 py-1 rounded text-xs border ${(form.dias_semana ?? []).includes(d.v) ? "bg-[#214AC4] text-white border-[#214AC4]" : "bg-background"}`}>
                      {d.l}
                    </button>
                  ))}
                </div>
              </div>
            </section>

            <section className="space-y-2 border rounded-lg p-3 bg-card shadow-sm">
              <div className="flex items-center justify-between">
                <Label>Pesquisa de satisfação ao resolver</Label>
                <Switch checked={!!form.csat_enabled} onCheckedChange={(v) => set("csat_enabled", v)} />
              </div>
              <Input value={form.csat_message} onChange={(e) => set("csat_message", e.target.value)} />
            </section>
          </div>
        )}
    </>
  );

  const actions = (
    <>
      {!inline && <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>}
      <Button onClick={save} disabled={saving || !form}>
        {saving && <Loader2 className="size-4 mr-1.5 animate-spin" />} Salvar
      </Button>
    </>
  );

  if (inline) {
    return (
      <div className="space-y-4 max-w-3xl rounded-xl border bg-muted/40 p-4 sm:p-5">
        <h1 className="text-xl sm:text-2xl font-semibold flex items-center gap-2">
          <Sparkles className="size-5" /> Automação do suporte
        </h1>
        {body}
        <div className="flex justify-end gap-2">{actions}</div>
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-4" /> Automação do suporte
          </DialogTitle>
        </DialogHeader>
        {body}
        <DialogFooter>{actions}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
