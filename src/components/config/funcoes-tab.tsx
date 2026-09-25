import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Loader2, Plus, Pencil, Trash2, KeyRound, ChevronDown, ChevronUp,
  MessageSquare, Users, Send, FileText, Bot, Kanban, Calendar, TrendingUp,
  BookOpen, ShoppingBag, Zap, Wifi, Settings as SettingsIcon,
} from "lucide-react";
import { toast } from "sonner";
import { listCompanyRoles, saveCompanyRole, deleteCompanyRole, type CompanyRole } from "@/lib/team.functions";

type Action = { key: string; label: string; desc: string };
type ModuleDef = { key: string; label: string; icon: any; actions: Action[] };

const CRUD: Action[] = [
  { key: "view", label: "Visualizar", desc: "Ver registros" },
  { key: "create", label: "Criar", desc: "Criar novos" },
  { key: "edit", label: "Editar", desc: "Modificar" },
  { key: "delete", label: "Excluir", desc: "Remover" },
  { key: "toggle", label: "Ativar/Desativar", desc: "Controlar ativação" },
];

const CONV_ACTIONS: Action[] = [
  { key: "view", label: "Visualizar", desc: "Ver conversas" },
  { key: "reply", label: "Responder", desc: "Enviar mensagens" },
  { key: "transfer", label: "Transferir", desc: "Passar para outro" },
  { key: "close", label: "Encerrar", desc: "Finalizar atendimento" },
  { key: "assign", label: "Assumir", desc: "Puxar para si" },
  { key: "notes", label: "Notas internas", desc: "Anotações privadas" },
  { key: "delete", label: "Excluir", desc: "Apagar mensagens" },
  { key: "export", label: "Exportar", desc: "Baixar histórico" },
];

const MODULES: ModuleDef[] = [
  { key: "conversas", label: "Conversas", icon: MessageSquare, actions: CONV_ACTIONS },
  { key: "contatos", label: "Contatos", icon: Users, actions: CRUD },
  { key: "crm", label: "CRM", icon: Kanban, actions: CRUD },
  { key: "campanhas", label: "Campanhas", icon: Send, actions: CRUD.slice(0, 4).concat([{ key: "send", label: "Disparar", desc: "Executar envio" }]) },
  { key: "templates", label: "Templates HSM", icon: FileText, actions: CRUD },
  { key: "agente", label: "Agente IA", icon: Bot, actions: CRUD },
  { key: "agendamentos", label: "Agendamentos", icon: Calendar, actions: CRUD },
  { key: "comercial", label: "Comercial", icon: TrendingUp, actions: [
    { key: "view", label: "Visualizar", desc: "Ver dashboard" },
    { key: "export", label: "Exportar", desc: "Baixar relatório" },
    { key: "goals", label: "Metas", desc: "Definir metas" },
  ] },
  
  { key: "respostas_rapidas", label: "Respostas rápidas", icon: BookOpen, actions: CRUD.slice(0, 4) },
  { key: "catalogo", label: "Catálogo", icon: ShoppingBag, actions: CRUD },
  { key: "conexao", label: "Conexões", icon: Wifi, actions: CRUD },
  { key: "configuracoes", label: "Configurações", icon: SettingsIcon, actions: [
    { key: "view", label: "Visualizar", desc: "Ver configurações" },
    { key: "edit", label: "Editar", desc: "Alterar dados" },
    { key: "manage_users", label: "Gerenciar usuários", desc: "Convidar/remover" },
    { key: "manage_roles", label: "Gerenciar funções", desc: "Perfis de acesso" },
    { key: "billing", label: "Financeiro", desc: "Ver faturas/plano" },
  ] },
];

const COLORS = [
  "#6366F1", "#8B5CF6", "#EC4899", "#EF4444",
  "#F59E0B", "#10B981", "#06B6D4", "#0B22FE",
];

const PRESETS: Record<string, { label: string; make: () => Record<string, Record<string, boolean>> }> = {
  atendente: {
    label: "Atendente",
    make: () => ({
      conversas: { view: true, reply: true, assign: true, close: true, notes: true },
      contatos: { view: true, create: true, edit: true },
      agendamentos: { view: true, create: true, edit: true },
    }),
  },
  supervisor: {
    label: "Supervisor",
    make: () => {
      const p: any = {};
      MODULES.forEach((m) => {
        p[m.key] = {};
        m.actions.forEach((a) => { if (a.key !== "delete") p[m.key][a.key] = true; });
      });
      return p;
    },
  },
};

function totalActions() {
  return MODULES.reduce((n, m) => n + m.actions.length, 0);
}
function countSelected(perms: Record<string, Record<string, boolean>>) {
  let n = 0;
  MODULES.forEach((m) => {
    const p = perms[m.key] || {};
    m.actions.forEach((a) => { if (p[a.key]) n++; });
  });
  return n;
}

export function FuncoesTab() {
  const load = useServerFn(listCompanyRoles);
  const save = useServerFn(saveCompanyRole);
  const remove = useServerFn(deleteCompanyRole);

  const [rows, setRows] = useState<CompanyRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CompanyRole | null>(null);
  const [busy, setBusy] = useState(false);

  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [cor, setCor] = useState(COLORS[0]);
  const [baseRole, setBaseRole] = useState<"admin" | "atendente">("atendente");
  const [perms, setPerms] = useState<Record<string, Record<string, boolean>>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  async function reload() {
    setLoading(true);
    try { setRows(await load()); }
    catch (e: any) { toast.error(e?.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { void reload(); }, []);

  // Migra permissions antigas (booleano por módulo) para o formato granular.
  function normalizePerms(raw: any): Record<string, Record<string, boolean>> {
    const out: Record<string, Record<string, boolean>> = {};
    if (!raw || typeof raw !== "object") return out;
    Object.entries(raw).forEach(([k, v]) => {
      if (typeof v === "boolean") {
        if (v) {
          const m = MODULES.find((x) => x.key === k);
          out[k] = {};
          m?.actions.forEach((a) => { out[k][a.key] = true; });
        }
      } else if (v && typeof v === "object") {
        out[k] = v as any;
      }
    });
    return out;
  }

  function openCreate() {
    setEditing(null);
    setNome(""); setDescricao(""); setCor(COLORS[0]); setBaseRole("atendente");
    setPerms({}); setExpanded({});
    setOpen(true);
  }
  function openEdit(r: CompanyRole) {
    setEditing(r);
    setNome(r.nome); setDescricao(r.descricao ?? "");
    setCor(r.cor || COLORS[0]);
    setBaseRole(r.base_role === "owner" ? "admin" : r.base_role);
    setPerms(normalizePerms(r.permissions));
    setExpanded({});
    setOpen(true);
  }

  function toggleAction(mkey: string, akey: string, v: boolean) {
    setPerms((p) => {
      const cur = { ...(p[mkey] || {}) };
      if (v) cur[akey] = true; else delete cur[akey];
      const next = { ...p };
      if (Object.keys(cur).length) next[mkey] = cur; else delete next[mkey];
      return next;
    });
  }
  function toggleModuleAll(m: ModuleDef, v: boolean) {
    setPerms((p) => {
      const next = { ...p };
      if (v) {
        const cur: any = {};
        m.actions.forEach((a) => { cur[a.key] = true; });
        next[m.key] = cur;
      } else {
        delete next[m.key];
      }
      return next;
    });
  }
  function applyPreset(key: keyof typeof PRESETS) {
    setPerms(PRESETS[key].make());
  }
  function selectAll() {
    const p: any = {};
    MODULES.forEach((m) => {
      p[m.key] = {};
      m.actions.forEach((a) => { p[m.key][a.key] = true; });
    });
    setPerms(p);
  }
  function clearAll() { setPerms({}); }

  const selCount = useMemo(() => countSelected(perms), [perms]);
  const totalCount = totalActions();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await save({ data: { id: editing?.id, nome, descricao, cor, base_role: baseRole, permissions: perms, ativo: true } });
      toast.success(editing ? "Função atualizada" : "Função criada");
      setOpen(false);
      await reload();
    } catch (e: any) { toast.error(e?.message); }
    finally { setBusy(false); }
  }

  async function doRemove(r: CompanyRole) {
    if (!confirm(`Remover a função "${r.nome}"?`)) return;
    try { await remove({ data: { id: r.id } }); await reload(); toast.success("Removida"); }
    catch (e: any) { toast.error(e?.message); }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold">Funções personalizadas</h2>
          <p className="text-sm text-muted-foreground">Crie perfis com permissões granulares por ação.</p>
        </div>
        <Button onClick={openCreate}><Plus className="size-4 mr-1.5" /> Nova função</Button>
      </div>

      {loading ? (
        <div className="p-10 grid place-items-center"><Loader2 className="animate-spin text-muted-foreground" /></div>
      ) : rows.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">Nenhuma função personalizada. Use os papéis padrão (Admin/Atendente) ou crie um perfil.</Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((r) => {
            const p = normalizePerms(r.permissions);
            const n = countSelected(p);
            const c = r.cor || COLORS[0];
            return (
              <Card key={r.id} className="p-5 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <div
                      className="size-9 rounded-lg grid place-items-center shrink-0"
                      style={{ background: `${c}20`, color: c }}
                    >
                      <KeyRound className="size-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold truncate">{r.nome}</div>
                      {r.descricao && <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{r.descricao}</div>}
                    </div>
                  </div>
                  <Badge variant="outline" className="capitalize">{r.base_role}</Badge>
                </div>
                <div className="text-xs text-muted-foreground">{n} de {totalCount} permissões</div>
                <div className="flex gap-1.5 mt-auto pt-1">
                  <Button size="sm" variant="outline" className="flex-1" onClick={() => openEdit(r)}>
                    <Pencil className="size-3.5 mr-1" /> Editar
                  </Button>
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => doRemove(r)}>
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[92vh] overflow-hidden flex flex-col p-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b">
            <div className="flex items-start gap-3">
              <div className="size-10 rounded-lg grid place-items-center shrink-0" style={{ background: `${cor}20`, color: cor }}>
                <KeyRound className="size-5" />
              </div>
              <div className="flex-1 min-w-0">
                <DialogTitle>{editing ? "Editar Função" : "Nova Função"}</DialogTitle>
                <DialogDescription>Configure nome, cor e permissões granulares</DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <form onSubmit={submit} className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-4 items-start">
              <div>
                <Label>Nome</Label>
                <Input required value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Gerente de Vendas" className="mt-1.5" />
              </div>
              <div>
                <Label>Cor</Label>
                <div className="mt-1.5 flex gap-1.5">
                  {COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCor(c)}
                      className={`size-7 rounded-md border-2 transition ${cor === c ? "border-foreground scale-110" : "border-transparent"}`}
                      style={{ background: c }}
                      aria-label={c}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div>
              <Label>Descrição</Label>
              <Textarea rows={2} value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Descrição opcional da função" className="mt-1.5" />
            </div>

            <div>
              <Label>Papel base</Label>
              <Select value={baseRole} onValueChange={(v) => setBaseRole(v as any)}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="atendente">Atendente</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                <div>
                  <Label>Permissões</Label>
                  <div className="text-xs text-muted-foreground">{selCount} permissões selecionadas</div>
                </div>
                <div className="flex items-center gap-1 flex-wrap">
                  <Button type="button" size="sm" variant="outline" onClick={() => applyPreset("atendente")}>Atendente</Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => applyPreset("supervisor")}>Supervisor</Button>
                  <Button type="button" size="sm" variant="ghost" onClick={selectAll}>Todas</Button>
                  <Button type="button" size="sm" variant="ghost" onClick={clearAll}>Limpar</Button>
                </div>
              </div>

              <div className="space-y-2">
                {MODULES.map((m) => {
                  const mp = perms[m.key] || {};
                  const enabled = m.actions.filter((a) => mp[a.key]).length;
                  const all = enabled === m.actions.length;
                  const some = enabled > 0 && !all;
                  const isOpen = expanded[m.key] ?? enabled > 0;
                  const Icon = m.icon;
                  return (
                    <div key={m.key} className="border rounded-lg overflow-hidden">
                      <div className="flex items-center gap-2 px-3 py-2.5 bg-muted/30">
                        <Checkbox
                          checked={all ? true : some ? "indeterminate" : false}
                          onCheckedChange={(v) => toggleModuleAll(m, !!v)}
                        />
                        <Icon className="size-4 text-muted-foreground" />
                        <div className="font-medium text-sm flex-1">{m.label}</div>
                        <Badge variant={enabled ? "default" : "outline"} className="text-[11px] h-5">
                          {enabled}/{m.actions.length}
                        </Badge>
                        <button
                          type="button"
                          onClick={() => setExpanded((s) => ({ ...s, [m.key]: !isOpen }))}
                          className="p-1 hover:bg-muted rounded"
                        >
                          {isOpen ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                        </button>
                      </div>
                      {isOpen && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-3">
                          {m.actions.map((a) => (
                            <label key={a.key} className="flex items-start gap-2 p-2 rounded hover:bg-muted/40 cursor-pointer">
                              <Checkbox
                                checked={!!mp[a.key]}
                                onCheckedChange={(v) => toggleAction(m.key, a.key, !!v)}
                                className="mt-0.5"
                              />
                              <div className="min-w-0">
                                <div className="text-sm font-medium leading-tight">{a.label}</div>
                                <div className="text-xs text-muted-foreground">{a.desc}</div>
                              </div>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </form>

          <DialogFooter className="px-6 py-4 border-t bg-muted/20 flex-row sm:justify-between items-center">
            <div className="text-xs text-muted-foreground">{selCount} permissões selecionadas</div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={busy} onClick={submit as any} style={{ background: cor }}>
                {busy && <Loader2 className="size-4 mr-1.5 animate-spin" />}
                {editing ? "Salvar" : "Salvar Função"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
