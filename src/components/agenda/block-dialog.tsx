import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { saveBloqueio } from "@/lib/agenda.functions";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { dateOnly, type Profissional } from "./shared";

const MOTIVOS = ["Almoço", "Reunião interna", "Folga", "Feriado", "Indisponibilidade", "Manutenção"];

export function BlockDialog({
  open, onOpenChange, profissionais, onSalvo,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  profissionais: Profissional[];
  onSalvo: () => void;
}) {
  const _save = useServerFn(saveBloqueio);
  const hoje = dateOnly(new Date());
  const [dia, setDia] = useState(hoje);
  const [inicio, setInicio] = useState("12:00");
  const [fim, setFim] = useState("13:00");
  const [userId, setUserId] = useState("todos");
  const [motivo, setMotivo] = useState("Almoço");
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    const ini = new Date(`${dia}T${inicio}`);
    const f = new Date(`${dia}T${fim}`);
    if (f <= ini) return toast.error("O fim deve ser depois do início.");
    setSalvando(true);
    try {
      await _save({ data: {
        user_id: userId === "todos" ? null : userId,
        inicio: ini.toISOString(),
        fim: f.toISOString(),
        motivo,
        tipo: "bloqueio",
      } } as any);
      toast.success("Horário bloqueado");
      onOpenChange(false);
      onSalvo();
    } catch (e: any) {
      toast.error(e?.message || "Não foi possível bloquear");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Bloquear horário</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="bl-quem">Aplicar a</Label>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger id="bl-quem"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Toda a equipe</SelectItem>
                {profissionais.map((p) => <SelectItem key={p.user_id} value={p.user_id}>{p.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="bl-dia">Data</Label>
              <Input id="bl-dia" type="date" value={dia} onChange={(e) => setDia(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bl-ini">Início</Label>
              <Input id="bl-ini" type="time" value={inicio} onChange={(e) => setInicio(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bl-fim">Fim</Label>
              <Input id="bl-fim" type="time" value={fim} onChange={(e) => setFim(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bl-motivo">Motivo</Label>
            <Input
              id="bl-motivo"
              list="bl-motivos"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
            />
            <datalist id="bl-motivos">
              {MOTIVOS.map((m) => <option key={m} value={m} />)}
            </datalist>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando}>Bloquear</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
