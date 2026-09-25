import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Loader2, Plus, Pencil, Trash2, Tag as TagIcon, Users, Search } from "lucide-react";
import { toast } from "sonner";
import { listTagsWithCount, createTag, updateTag, deleteTag, type CompanyTagWithCount } from "@/lib/tags.functions";

const COLORS = ["#8AA89A", "#22C55E", "#0B22FE", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899", "#14B8A6", "#F97316", "#64748B"];

export function TagsTab() {
  const load = useServerFn(listTagsWithCount);
  const create = useServerFn(createTag);
  const update = useServerFn(updateTag);
  const remove = useServerFn(deleteTag);

  const [rows, setRows] = useState<CompanyTagWithCount[]>([]);
  const [totalContatos, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [dlg, setDlg] = useState<{ open: boolean; id?: string; nome: string; cor: string }>({ open: false, nome: "", cor: COLORS[0] });
  const [saving, setSaving] = useState(false);

  async function reload() {
    setLoading(true);
    try {
      const r = await load();
      setRows(r.tags);
      setTotal(r.totalContatos);
    } catch (e: any) { toast.error(e?.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { void reload(); }, []);

  const filtered = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return q ? rows.filter((r) => r.nome.toLowerCase().includes(q)) : rows;
  }, [rows, busca]);

  async function onSave() {
    if (!dlg.nome.trim()) return toast.error("Informe o nome");
    setSaving(true);
    try {
      if (dlg.id) await update({ data: { id: dlg.id, nome: dlg.nome, cor: dlg.cor } });
      else await create({ data: { nome: dlg.nome, cor: dlg.cor } });
      setDlg({ open: false, nome: "", cor: COLORS[0] });
      toast.success("Salvo");
      await reload();
    } catch (e: any) { toast.error(e?.message); }
    finally { setSaving(false); }
  }

  async function onDelete(id: string) {
    if (!confirm("Excluir esta tag?")) return;
    try { await remove({ data: { id } }); toast.success("Excluída"); await reload(); }
    catch (e: any) { toast.error(e?.message); }
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-2 sm:gap-3">
        <Card className="p-3 sm:p-4 flex items-center gap-2 sm:gap-3">
          <div className="size-9 sm:size-11 rounded-xl bg-primary/10 grid place-items-center text-primary"><TagIcon className="size-5" /></div>
          <div>
            <div className="text-xl sm:text-2xl font-bold leading-none">{rows.length}</div>
            <div className="text-xs text-muted-foreground mt-1">Tags criadas</div>
          </div>
        </Card>
        <Card className="p-3 sm:p-4 flex items-center gap-2 sm:gap-3">
          <div className="size-9 sm:size-11 rounded-xl bg-emerald-500/10 grid place-items-center text-emerald-600"><Users className="size-5" /></div>
          <div>
            <div className="text-xl sm:text-2xl font-bold leading-none">{totalContatos}</div>
            <div className="text-xs text-muted-foreground mt-1">Contatos taggeados</div>
          </div>
        </Card>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="size-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
          <Input placeholder="Buscar tags..." className="pl-9 h-9 sm:h-10" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <Dialog open={dlg.open} onOpenChange={(o) => setDlg((d) => ({ ...d, open: o }))}>
          <DialogTrigger asChild>
            <Button className="h-9 sm:h-10 shrink-0" onClick={() => setDlg({ open: true, nome: "", cor: COLORS[0] })}>
              <Plus className="size-4 sm:mr-1.5" /> <span className="hidden sm:inline">Nova Tag</span>
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-[95vw] sm:max-w-lg">
            <DialogHeader><DialogTitle>{dlg.id ? "Editar tag" : "Nova tag"}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Nome</Label>
                <Input autoFocus value={dlg.nome} onChange={(e) => setDlg({ ...dlg, nome: e.target.value })} placeholder="Ex.: Cliente VIP" />
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
              <div className="pt-1">
                <div className="text-[11px] text-muted-foreground mb-1">Prévia</div>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium text-white" style={{ background: dlg.cor }}>
                  <TagIcon className="size-3" /> {dlg.nome || "Nome da tag"}
                </span>
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setDlg({ open: false, nome: "", cor: COLORS[0] })}>Cancelar</Button>
              <Button onClick={onSave} disabled={saving}>{saving && <Loader2 className="size-4 mr-1.5 animate-spin" />}Salvar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="grid place-items-center py-10"><Loader2 className="animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">Nenhuma tag encontrada.</p>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((t) => (
            <Card key={t.id} className="p-3 flex items-center gap-3 hover:shadow-sm transition-shadow">
              <div className="size-10 rounded-lg grid place-items-center shrink-0" style={{ background: `${t.cor}22`, color: t.cor ?? undefined }}>
                <TagIcon className="size-4" />
              </div>
              <div className="flex-1 min-w-0">
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold text-white max-w-full truncate"
                  style={{ background: t.cor ?? "#64748B" }} title={t.nome}>
                  {t.nome}
                </span>
                <div className="text-[11px] text-muted-foreground mt-1">{t.contatos} contato{t.contatos === 1 ? "" : "s"}</div>
              </div>
              <div className="flex gap-0.5 shrink-0">
                <Button size="icon" variant="ghost" onClick={() => setDlg({ open: true, id: t.id, nome: t.nome, cor: t.cor ?? COLORS[0] })}>
                  <Pencil className="size-3.5" />
                </Button>
                <Button size="icon" variant="ghost" className="text-destructive" onClick={() => onDelete(t.id)}>
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
