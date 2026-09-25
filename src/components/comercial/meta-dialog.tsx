import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export type MetaTarget = {
  userId: string | null; // null = meta geral da empresa
  nome?: string;
  valorCents?: number;
  yearMonth?: string;
};

function currentYearMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function MetaDialog({
  open,
  onOpenChange,
  companyId,
  target,
  members,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  companyId: string;
  target?: MetaTarget | null;
  members: Array<{ user_id: string; nome: string }>;
  onSaved: () => void;
}) {
  const [userId, setUserId] = useState<string>("geral");
  const [valor, setValor] = useState("");
  const [yearMonth, setYearMonth] = useState(currentYearMonth());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setUserId(target?.userId ?? "geral");
    setValor(target?.valorCents ? String((target.valorCents / 100).toFixed(2)).replace(".", ",") : "");
    setYearMonth(target?.yearMonth ?? currentYearMonth());
  }, [open, target?.userId, target?.valorCents]);

  async function submit() {
    const cents = Math.round(Number(String(valor).replace(/\./g, "").replace(",", ".")) * 100);
    if (!cents || cents <= 0) return toast.error("Informe um valor de meta válido");
    setSaving(true);
    try {
      const { error } = await supabase.from("crm_goals").upsert(
        {
          company_id: companyId,
          user_id: userId === "geral" ? null : userId,
          year_month: yearMonth,
          value_cents: cents,
        } as any,
        { onConflict: "company_id,user_id,year_month" },
      );
      if (error) throw error;
      toast.success("Meta salva");
      onOpenChange(false);
      onSaved();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao salvar meta");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{target?.valorCents ? "Editar meta" : "Nova meta"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Responsável</Label>
            <Select value={userId} onValueChange={setUserId} disabled={!!target?.userId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="geral">Meta geral da empresa</SelectItem>
                {members.map((m) => <SelectItem key={m.user_id} value={m.user_id}>{m.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Mês de referência</Label>
              <Input type="month" value={yearMonth} onChange={(e) => setYearMonth(e.target.value)} />
            </div>
            <div>
              <Label>Valor da meta (R$)</Label>
              <Input value={valor} onChange={(e) => setValor(e.target.value)} placeholder="50.000,00" inputMode="decimal" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={saving}>
            {saving && <Loader2 className="size-4 animate-spin mr-2" />} Salvar meta
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
