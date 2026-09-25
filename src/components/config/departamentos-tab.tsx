import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";

import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Loader2, Plus, Pencil, Trash2, Building2, Users } from "lucide-react";
import { toast } from "sonner";
import {
  listDepartments, saveDepartment, deleteDepartment, toggleDepartment, type Department,
} from "@/lib/departments.functions";
import { listTeam } from "@/lib/team.functions";

const COLORS = ["#F59E0B", "#0B22FE", "#EF4444", "#22C55E", "#8B5CF6", "#EC4899", "#14B8A6", "#F97316", "#64748B"];

type TeamMember = { user_id: string; nome: string | null; email: string | null };

export function DepartamentosTab() {
  const load = useServerFn(listDepartments);
  const save = useServerFn(saveDepartment);
  const remove = useServerFn(deleteDepartment);
  const toggle = useServerFn(toggleDepartment);
  const loadTeam = useServerFn(listTeam);

  const [rows, setRows] = useState<Department[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [dlg, setDlg] = useState<{ open: boolean; id?: string; nome: string; descricao: string; cor: string }>({ open: false, nome: "", descricao: "", cor: COLORS[0] });
  const [saving, setSaving] = useState(false);

  async function reload() {
    setLoading(true);
    try {
      const [d, t] = await Promise.all([load(), loadTeam()]);
      setRows(d);
      setTeam((t.members ?? []).filter((m: any) => m.ativo).map((m: any) => ({ user_id: m.user_id, nome: m.nome, email: m.email })));
    } catch (e: any) { toast.error(e?.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { void reload(); }, []);

  async function onSave() {
    if (!dlg.nome.trim()) return toast.error("Informe o nome");
    setSaving(true);
    try {
      await save({ data: { id: dlg.id, nome: dlg.nome, descricao: dlg.descricao, cor: dlg.cor } });
      setDlg({ open: false, nome: "", descricao: "", cor: COLORS[0] });
      toast.success("Salvo");
      await reload();
    } catch (e: any) { toast.error(e?.message); }
    finally { setSaving(false); }
  }

  async function onToggle(d: Department, ativo: boolean) {
    setRows((prev) => prev.map((r) => r.id === d.id ? { ...r, ativo } : r));
    try { await toggle({ data: { id: d.id, ativo } }); }
    catch (e: any) { toast.error(e?.message); await reload(); }
  }

  async function onDelete(id: string) {
    if (!confirm("Excluir este departamento?")) return;
    try { await remove({ data: { id } }); toast.success("Excluído"); await reload(); }
    catch (e: any) { toast.error(e?.message); }
  }


  return (
    <div className="space-y-5">
      <div className="flex justify-stretch sm:justify-end">
        <Dialog open={dlg.open} onOpenChange={(o) => setDlg((d) => ({ ...d, open: o }))}>
          <DialogTrigger asChild>
            <Button className="w-full sm:w-auto" onClick={() => setDlg({ open: true, nome: "", descricao: "", cor: COLORS[0] })}>
              <Plus className="size-4 mr-1.5" /> Novo Departamento
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-[95vw] sm:max-w-lg">
            <DialogHeader><DialogTitle>{dlg.id ? "Editar departamento" : "Novo departamento"}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Nome</Label>
                <Input autoFocus value={dlg.nome} onChange={(e) => setDlg({ ...dlg, nome: e.target.value })} placeholder="Ex.: Suporte" />
              </div>
              <div>
                <Label>Descrição</Label>
                <Textarea rows={2} value={dlg.descricao} onChange={(e) => setDlg({ ...dlg, descricao: e.target.value })} placeholder="Opcional" />
              </div>
              <div>
                <Label>Cor</Label>
                <div className="flex flex-wrap gap-2 mt-1.5">
                  {COLORS.map((c) => (
                    <button key={c} type="button" onClick={() => setDlg({ ...dlg, cor: c })}
                      className={`size-8 rounded-full border-2 ${dlg.cor === c ? "border-foreground scale-110" : "border-transparent"}`}
                      style={{ background: c }} />
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setDlg({ open: false, nome: "", descricao: "", cor: COLORS[0] })}>Cancelar</Button>
              <Button onClick={onSave} disabled={saving}>{saving && <Loader2 className="size-4 mr-1.5 animate-spin" />}Salvar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="grid place-items-center py-10"><Loader2 className="animate-spin text-muted-foreground" /></div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">Nenhum departamento ainda. Clique em "Novo Departamento" para começar.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {rows.map((d) => (
            <Card key={d.id} className={`p-3 sm:p-4 space-y-3 ${d.ativo ? "" : "opacity-60"}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="size-10 rounded-lg grid place-items-center shrink-0" style={{ background: `${d.cor}22`, color: d.cor ?? undefined }}>
                    <Building2 className="size-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-sm truncate">{d.nome}</div>
                    {d.descricao && <div className="text-[11px] text-muted-foreground truncate">{d.descricao}</div>}
                  </div>
                </div>
                <Switch checked={d.ativo} onCheckedChange={(v) => onToggle(d, v)} />
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Users className="size-3" /> {d.member_count} atendente{d.member_count === 1 ? "" : "s"}
              </div>
              <div className="flex items-center gap-1">
                <Button size="icon" variant="ghost" onClick={() => setDlg({ open: true, id: d.id, nome: d.nome, descricao: d.descricao ?? "", cor: d.cor ?? COLORS[0] })}>
                  <Pencil className="size-3.5" />
                </Button>
                <Button size="icon" variant="ghost" className="text-destructive" onClick={() => onDelete(d.id)}>
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <p className="text-[11px] text-muted-foreground text-center">
        Departamentos organizam sua equipe por área. O roteamento automático de conversas por departamento entra em breve.
      </p>

    </div>
  );
}
