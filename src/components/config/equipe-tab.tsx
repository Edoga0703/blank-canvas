import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  Loader2, UserPlus, Upload, Eye, EyeOff, Pencil, Trash2, ShieldCheck, User,
  Users as UsersIcon, ShieldAlert, ScrollText, Search, MessageSquare, Filter,
  KeyRound, Circle, ListOrdered, Target,
} from "lucide-react";
import {
  listTeam, inviteMember, updateMember, removeMember, setMemberActive,
  listCompanyInstances, listCompanyRoles, listCompanyPipelines, type CompanyRole,
} from "@/lib/team.functions";
import { listDepartments, type Department } from "@/lib/departments.functions";
import { usePlanFeatures } from "@/hooks/use-plan-features";
import { PlanUsageBadge } from "@/components/plan-usage-badge";
import { FuncoesTab } from "./funcoes-tab";
import { LogsTab } from "./logs-tab";
import { DistribuicaoTab } from "./distribuicao-tab";



type Member = {
  id: string;
  user_id: string;
  role: "owner" | "admin" | "atendente";
  ativo: boolean;
  email: string | null;
  nome: string | null;
  avatar_url?: string | null;
  max_chats?: number | null;
  custom_role_id?: string | null;
  last_login_at?: string | null;
  last_login_ip?: string | null;
  last_seen_at?: string | null;
  departments: { id: string; nome: string; cor: string | null }[];
  instances: { id: string; instance_name: string; display_name: string | null; numero: string | null }[];
  pipeline_ids?: string[];
};

const ONLINE_WINDOW_MS = 5 * 60 * 1000;

function formatPhone(n: string | null): string {
  const d = String(n || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.length >= 12) return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, d.length - 4)}-${d.slice(-4)}`;
  return `+${d}`;
}

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "Nunca";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60 * 1000) return "há menos de um minuto";
  const m = Math.floor(diff / 60000);
  if (m < 60) return `há ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  return `há ${d} ${d === 1 ? "dia" : "dias"}`;
}

function initials(s: string) {
  return (s || "?").trim().slice(0, 1).toUpperCase();
}

const AVATAR_TONES = ["#ef4444", "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6", "#ec4899", "#0ea5e9", "#14b8a6"];
function toneFor(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_TONES[h % AVATAR_TONES.length];
}

/**
 * Full Usuários module: header + tabs + KPIs + filters + table + dialog.
 * `showHeader` renders the "Usuários" page title and "+ Novo Usuário" action.
 */
export function EquipeTab({ isOwner, role, showHeader = false }: { isOwner: boolean; role?: string; showHeader?: boolean }) {
  const [tab, setTab] = useState("usuarios");
  const [createSignal, setCreateSignal] = useState(0);

  return (
    <div className="space-y-4 sm:space-y-5">
      {showHeader && (
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Usuários</h1>
            <p className="text-xs sm:text-sm text-muted-foreground">Gerencie usuários, funções e permissões</p>
          </div>
          {tab === "usuarios" && (role === "owner" || role === "admin") && (
            <Button size="sm" className="h-9 shrink-0" onClick={() => setCreateSignal((v) => v + 1)}>
              <UserPlus className="size-4 mr-1.5" /> <span className="hidden sm:inline">Novo Usuário</span><span className="sm:hidden">Novo</span>
            </Button>
          )}
        </div>
      )}

      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="w-full sm:w-auto grid grid-cols-3 sm:flex">
          <TabsTrigger value="usuarios" className="text-xs sm:text-sm"><UsersIcon className="size-4 sm:mr-1.5" /> <span className="hidden sm:inline">Usuários</span><span className="sm:hidden ml-1">Users</span></TabsTrigger>
          <TabsTrigger value="distribuicao" className="text-xs sm:text-sm"><ListOrdered className="size-4 sm:mr-1.5" /> <span className="ml-1 sm:ml-0">Distribuição</span></TabsTrigger>
          {(role === "owner" || role === "admin") && (
            <>

              <TabsTrigger value="funcoes" className="text-xs sm:text-sm"><ShieldAlert className="size-4 sm:mr-1.5" /> <span className="ml-1 sm:ml-0">Funções</span></TabsTrigger>
              <TabsTrigger value="logs" className="text-xs sm:text-sm"><ScrollText className="size-4 sm:mr-1.5" /> <span className="ml-1 sm:ml-0">Logs</span></TabsTrigger>
            </>
          )}
        </TabsList>

        <TabsContent value="usuarios" className="mt-5">
          <UsuariosPanel isOwner={isOwner} userRole={role} createSignal={createSignal} showInlineCreate={!showHeader} />
        </TabsContent>
        <TabsContent value="distribuicao" className="mt-5">
          <DistribuicaoTab />
        </TabsContent>

        {(role === "owner" || role === "admin") && (
          <>

            <TabsContent value="funcoes" className="mt-5">
              <FuncoesTab />
            </TabsContent>
            <TabsContent value="logs" className="mt-5">
              <LogsTab />
            </TabsContent>
          </>
        )}
      </Tabs>
    </div>
  );
}

function UsuariosPanel({
  isOwner,
  userRole,
  createSignal,
  showInlineCreate,
}: {
  isOwner: boolean;
  userRole?: string;
  createSignal: number;
  showInlineCreate: boolean;
}) {
  const list = useServerFn(listTeam);
  const invite = useServerFn(inviteMember);
  const update = useServerFn(updateMember);
  const remove = useServerFn(removeMember);
  const toggleActive = useServerFn(setMemberActive);
  const listInst = useServerFn(listCompanyInstances);
  const listRoles = useServerFn(listCompanyRoles);
  const listDeps = useServerFn(listDepartments);
  const listPipes = useServerFn(listCompanyPipelines);
  const plan = usePlanFeatures();

  const [members, setMembers] = useState<Member[]>([]);
  const [instances, setInstances] = useState<any[]>([]);
  const [roles, setRoles] = useState<CompanyRole[]>([]);
  const [deps, setDeps] = useState<Department[]>([]);
  const [pipes, setPipes] = useState<{ id: string; nome: string }[]>([]);
  const [depPipes, setDepPipes] = useState<{ department_id: string; pipeline_id: string }[]>([]);
  const [loading, setLoading] = useState(true);

  const [q, setQ] = useState("");
  const [filterRole, setFilterRole] = useState<string>("todos");
  const [filterStatus, setFilterStatus] = useState<string>("todos");
  const [filterDep, setFilterDep] = useState<string>("todos");

  const [dlgOpen, setDlgOpen] = useState(false);
  const [editing, setEditing] = useState<Member | null>(null);
  const [confirmDel, setConfirmDel] = useState<Member | null>(null);

  // Form state
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [role, setRole] = useState<"admin" | "atendente">("atendente");
  const [customRoleId, setCustomRoleId] = useState<string>("__none__");
  const [maxChats, setMaxChats] = useState<number>(5);
  const [selDeps, setSelDeps] = useState<string[]>([]);
  const [selInsts, setSelInsts] = useState<string[]>([]);
  const [selPipes, setSelPipes] = useState<string[]>([]);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [existingAvatar, setExistingAvatar] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function reload() {
    setLoading(true);
    try {
      const [r, i, cr, dp, pp] = await Promise.all([list(), listInst(), listRoles(), listDeps(), listPipes()]);
      setMembers(r.members as any);
      setInstances((i as any).instances || []);
      setRoles(cr as any);
      setDeps(dp as any);
      setPipes(((pp as any)?.pipelines ?? []) as any);
      setDepPipes(((pp as any)?.departmentPipelines ?? []) as any);
    } catch (e: any) { toast.error(e?.message); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    void reload();
    const onUpdate = () => { void reload(); };
    window.addEventListener("profile:updated", onUpdate);
    return () => window.removeEventListener("profile:updated", onUpdate);
  }, []);

  function resetForm() {
    setEditing(null);
    setNome(""); setEmail(""); setPassword(""); setRole("atendente");
    setCustomRoleId("__none__"); setMaxChats(5); setSelDeps([]); setSelInsts([]); setSelPipes([]);
    setAvatarPreview(null); setExistingAvatar(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function openCreate() { resetForm(); setDlgOpen(true); }
  function openEdit(m: Member) {
    resetForm();
    setEditing(m);
    setNome(m.nome || "");
    setEmail(m.email || "");
    setRole((m.role === "owner" ? "admin" : m.role) as any);
    setCustomRoleId(m.custom_role_id || "__none__");
    setMaxChats(m.max_chats ?? 5);
    setSelDeps(m.departments.map((d) => d.id));
    setSelInsts(m.instances.map((i) => i.id));
    setSelPipes(m.pipeline_ids ?? []);
    setExistingAvatar(m.avatar_url || null);
    setDlgOpen(true);
  }

  // External create trigger from page header
  useEffect(() => {
    if (createSignal > 0) openCreate();
  }, [createSignal]);

  function onPickPhoto(f: File | null) {
    if (!f) return;
    if (f.size > 3 * 1024 * 1024) return toast.error("Foto máx. 3MB");
    const r = new FileReader();
    r.onload = () => setAvatarPreview(r.result as string);
    r.readAsDataURL(f);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const payload = {
        nome, role,
        avatarBase64: avatarPreview,
        max_chats: maxChats,
        custom_role_id: customRoleId === "__none__" ? null : customRoleId,
        department_ids: selDeps,
        instance_ids: selInsts,
        pipeline_ids: selPipes,
      };
      if (editing) {
        await update({ data: { memberId: editing.id, password: password || undefined, ...payload } });
        toast.success("Usuário atualizado");
      } else {
        await invite({ data: { email, password, ...payload } });
        toast.success("Usuário cadastrado");
      }
      setDlgOpen(false); resetForm();
      await Promise.all([reload(), plan.refresh()]);
    } catch (e: any) { toast.error(e?.message); }
    finally { setBusy(false); }
  }

  async function doRemove() {
    if (!confirmDel) return;
    try {
      await remove({ data: { memberId: confirmDel.id } });
      toast.success("Usuário removido");
      setConfirmDel(null);
      await Promise.all([reload(), plan.refresh()]);
    } catch (e: any) { toast.error(e?.message); }
  }

  const isOnline = (m: Member) => {
    if (!m.ativo) return false;
    const lastSeen = m.last_seen_at || m.last_login_at;
    if (!lastSeen) return false;
    return Date.now() - new Date(lastSeen).getTime() < ONLINE_WINDOW_MS;
  };

  const kpis = useMemo(() => ({
    total: members.length,
    online: members.filter(isOnline).length,
    admins: members.filter((m) => m.role === "owner" || m.role === "admin").length,
    atendentes: members.filter((m) => m.role === "atendente").length,
  }), [members]);

  const filtered = members.filter((m) => {
    if (filterStatus === "ativos" && !m.ativo) return false;
    if (filterStatus === "inativos" && m.ativo) return false;
    if (filterStatus === "online" && !isOnline(m)) return false;
    if (filterRole !== "todos") {
      if (filterRole === "admin" && !(m.role === "owner" || m.role === "admin")) return false;
      if (filterRole === "atendente" && m.role !== "atendente") return false;
    }
    if (filterDep !== "todos" && !m.departments.some((d) => d.id === filterDep)) return false;
    if (q) {
      const s = q.toLowerCase();
      if (!(m.nome || "").toLowerCase().includes(s) && !(m.email || "").toLowerCase().includes(s)) return false;
    }
    return true;
  });

  function toggleFromArray(arr: string[], v: string, setter: (a: string[]) => void) {
    setter(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  }

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        <KpiCard label="Total" value={kpis.total}
          icon={<UsersIcon className="size-4" />} tone="bg-muted text-muted-foreground" />
        <KpiCard label="Online" value={kpis.online}
          icon={<Circle className="size-3 fill-emerald-500 text-emerald-500" />} tone="bg-emerald-500/10 text-emerald-600" />
        <KpiCard label="Admins" value={kpis.admins}
          icon={<ShieldCheck className="size-4" />} tone="bg-violet-500/10 text-violet-600" />
        <KpiCard label="Atendentes" value={kpis.atendentes}
          icon={<User className="size-4" />} tone="bg-primary/10 text-primary" />
      </div>

      {/* Filters bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-0 sm:min-w-[240px] max-w-full sm:max-w-md">
          <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9 h-9 sm:h-10 rounded-xl bg-background" placeholder="Buscar usuário..." value={q} onChange={(e) => setQ(e.target.value)} />
        </div>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="h-9 sm:h-10 rounded-xl shrink-0 px-3">
              <Filter className="size-4 sm:mr-1.5" /> <span className="hidden sm:inline">Filtros</span>
            </Button>
          </PopoverTrigger>

          <PopoverContent className="w-64 p-3 space-y-3">
            <div>
              <Label className="text-xs">Função</Label>
              <Select value={filterRole} onValueChange={setFilterRole}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todas</SelectItem>
                  <SelectItem value="admin">Admins</SelectItem>
                  <SelectItem value="atendente">Atendentes</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Status</Label>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="online">Online</SelectItem>
                  <SelectItem value="ativos">Ativos</SelectItem>
                  <SelectItem value="inativos">Inativos</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Departamento</Label>
              <Select value={filterDep} onValueChange={setFilterDep}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  {deps.map((d) => <SelectItem key={d.id} value={d.id}>{d.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </PopoverContent>
        </Popover>

        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          {!plan.loading && (
            <div className="hidden sm:block">
              <PlanUsageBadge label="usuários" used={plan.usage.usuarios} limit={plan.limites.usuarios} />
            </div>
          )}
          {showInlineCreate && (userRole === "owner" || userRole === "admin") && (
            <Button size="sm" className="h-9 sm:h-10" onClick={openCreate}>
              <UserPlus className="size-4 sm:mr-1.5" /> <span className="hidden sm:inline">Novo Usuário</span>
            </Button>
          )}
        </div>

      </div>

      {/* Table */}
      <Card className="overflow-hidden">
        {loading ? (
          <div className="p-12 grid place-items-center"><Loader2 className="animate-spin text-muted-foreground" /></div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-sm text-muted-foreground">Nenhum usuário encontrado.</div>
        ) : (
          <>
          {/* Mobile cards */}
          <div className="md:hidden divide-y">
            {filtered.map((m) => {
              const isOwnerRow = m.role === "owner";
              const customRole = roles.find((r) => r.id === m.custom_role_id);
              const online = isOnline(m);
              const tone = toneFor(m.email || m.id);
              return (
                <div key={m.id} className="p-3 flex items-start gap-3">
                  <div className="relative shrink-0">
                    <Avatar className="size-10">
                      {m.avatar_url ? <AvatarImage src={m.avatar_url} /> : null}
                      <AvatarFallback style={{ background: tone, color: "white" }}>
                        {initials(m.nome || m.email || "?")}
                      </AvatarFallback>
                    </Avatar>
                    <span className={`absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full ring-2 ring-background ${online ? "bg-emerald-500" : "bg-slate-300"}`} aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-[14px] truncate">{m.nome || m.email?.split("@")[0] || "Sem nome"}</div>
                    <div className="text-[12px] text-muted-foreground truncate">{m.email}</div>
                    <div className="flex flex-wrap items-center gap-1 mt-1.5">
                      <span className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                        {(isOwnerRow || m.role === "admin") ? <ShieldCheck className="size-3 text-primary" /> : <User className="size-3" />}
                        {isOwnerRow ? "Super Admin" : m.role === "admin" ? "Admin" : "Atendente"}
                      </span>
                      {m.instances.length > 0 && (
                        <span className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-600">
                          <MessageSquare className="size-3" /> {m.instances[0].display_name || m.instances[0].instance_name}
                        </span>
                      )}
                      <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded-full ${
                        online ? "bg-emerald-500/10 text-emerald-600" : m.ativo ? "bg-slate-500/10 text-slate-600" : "bg-red-500/10 text-red-600"
                      }`}>
                        {online ? "Online" : m.ativo ? "Offline" : "Inativo"}
                      </span>
                      {customRole && (
                        <span className="inline-flex items-center gap-1 text-[11px] text-primary bg-primary/10 rounded-full px-1.5 py-0.5">
                          <KeyRound className="size-3" /> {customRole.nome}
                        </span>
                      )}
                      {m.departments.slice(0, 2).map((d) => (
                        <span key={d.id} className="text-[11px] px-1.5 py-0.5 rounded-full font-medium"
                          style={{ background: (d.cor || "#94a3b8") + "22", color: d.cor || "#475569" }}>
                          {d.nome}
                        </span>
                      ))}
                      {m.departments.length > 2 && (
                        <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">+{m.departments.length - 2}</span>
                      )}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-1">Último acesso: {timeAgo(m.last_login_at)}</div>
                  </div>
                  <div className="flex flex-col items-center gap-0.5 shrink-0">
                    {(userRole === "owner" || userRole === "admin") && (
                      <button aria-label="Editar" onClick={() => openEdit(m)}
                        className="size-8 rounded-md grid place-items-center hover:bg-muted text-muted-foreground">
                        <Pencil className="size-4" />
                      </button>
                    )}
                    {!isOwnerRow && (userRole === "owner" || userRole === "admin") && (
                      <button aria-label={m.ativo ? "Desativar" : "Ativar"}
                        onClick={() => toggleActive({ data: { memberId: m.id, ativo: !m.ativo } }).then(reload).catch((e) => toast.error(e?.message))}
                        className="size-8 rounded-md grid place-items-center hover:bg-muted text-muted-foreground">
                        <ShieldAlert className="size-4" />
                      </button>
                    )}
                    {!isOwnerRow && (userRole === "owner" || userRole === "admin") && (
                      <button aria-label="Excluir" onClick={() => setConfirmDel(m)}
                        className="size-8 rounded-md grid place-items-center hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
                        <Trash2 className="size-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="hidden md:block overflow-x-auto">

            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground border-b bg-muted/30">
                  <th className="text-left px-5 py-3">Usuário</th>
                  <th className="text-left px-5 py-3">Departamentos</th>
                  <th className="text-left px-5 py-3">Conexão</th>
                  <th className="text-left px-5 py-3">Função</th>
                  <th className="text-left px-5 py-3">Status</th>
                  <th className="text-left px-5 py-3">Último acesso</th>
                  <th className="text-right px-5 py-3">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((m) => {
                  const isOwnerRow = m.role === "owner";
                  const customRole = roles.find((r) => r.id === m.custom_role_id);
                  const online = isOnline(m);
                  const tone = toneFor(m.email || m.id);
                  return (
                    <tr key={m.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div className="relative">
                            <Avatar className="size-9">
                              {m.avatar_url ? <AvatarImage src={m.avatar_url} /> : null}
                              <AvatarFallback style={{ background: tone, color: "white" }}>
                                {initials(m.nome || m.email || "?")}
                              </AvatarFallback>
                            </Avatar>
                            <span
                              className={`absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full ring-2 ring-background ${online ? "bg-emerald-500" : "bg-slate-300"}`}
                              aria-hidden
                            />
                          </div>
                          <div className="min-w-0">
                            <div className="font-medium truncate">{m.nome || m.email?.split("@")[0] || "Sem nome"}</div>
                            <div className="text-xs text-muted-foreground truncate">✉ {m.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        {m.departments.length === 0 ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : (
                          <div className="flex flex-wrap gap-1 max-w-[220px]">
                            {m.departments.slice(0, 2).map((d) => (
                              <span key={d.id} className="text-[11px] px-2 py-0.5 rounded-full font-medium"
                                style={{
                                  background: (d.cor || "#94a3b8") + "22",
                                  color: d.cor || "#475569",
                                }}>
                                {d.nome}
                              </span>
                            ))}
                            {m.departments.length > 2 && (
                              <span className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                                +{m.departments.length - 2}
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        {m.instances.length === 0 ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : (
                          <div className="flex flex-wrap gap-1 max-w-[200px]">
                            {m.instances.slice(0, 1).map((inst) => (
                              <span key={inst.id} className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium bg-blue-500/10 text-blue-600">
                                <MessageSquare className="size-3" />
                                {inst.display_name || inst.instance_name}
                              </span>
                            ))}
                            {m.instances.length > 1 && (
                              <span className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                                +{m.instances.length - 1}
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex flex-col gap-1">
                          <span className="inline-flex items-center gap-1.5 text-xs">
                            {(isOwnerRow || m.role === "admin")
                              ? <ShieldCheck className="size-3.5 text-primary" />
                              : <User className="size-3.5 text-muted-foreground" />}
                            {isOwnerRow ? "Super Admin" : m.role === "admin" ? "Admin" : "Atendente"}
                          </span>
                          {customRole && (
                            <span className="inline-flex items-center gap-1 text-[11px] text-primary bg-primary/10 rounded px-1.5 py-0.5 w-fit">
                              <KeyRound className="size-3" /> {customRole.nome}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full ${
                          online ? "bg-emerald-500/10 text-emerald-600"
                          : m.ativo ? "bg-slate-500/10 text-slate-600"
                          : "bg-red-500/10 text-red-600"
                        }`}>
                          <span className={`size-1.5 rounded-full ${online ? "bg-emerald-500" : m.ativo ? "bg-slate-400" : "bg-red-500"}`} />
                          {online ? "Online" : m.ativo ? "Offline" : "Inativo"}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-xs text-muted-foreground whitespace-nowrap">
                        {timeAgo(m.last_login_at)}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-0.5">
                          {!isOwnerRow && (userRole === "owner" || userRole === "admin") && (
                            <button
                              title={m.ativo ? "Desativar" : "Ativar"}
                              onClick={() => toggleActive({ data: { memberId: m.id, ativo: !m.ativo } }).then(reload).catch((e) => toast.error(e?.message))}
                              className="size-8 rounded-md grid place-items-center hover:bg-muted text-muted-foreground hover:text-foreground"
                            >
                              <ShieldAlert className="size-4" />
                            </button>
                          )}
                          {(userRole === "owner" || userRole === "admin") && (
                            <button
                              title="Editar"
                              onClick={() => openEdit(m)}
                              className="size-8 rounded-md grid place-items-center hover:bg-muted text-muted-foreground hover:text-foreground"
                            >
                              <Pencil className="size-4" />
                            </button>
                          )}
                          {!isOwnerRow && (userRole === "owner" || userRole === "admin") && (
                            <button
                              title="Excluir"
                              onClick={() => setConfirmDel(m)}
                              className="size-8 rounded-md grid place-items-center hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                            >
                              <Trash2 className="size-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        )}

      </Card>

      {/* Dialog Novo/Editar */}
      <Dialog open={dlgOpen} onOpenChange={(o) => { setDlgOpen(o); if (!o) resetForm(); }}>
        <DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar usuário" : "Novo Usuário"}</DialogTitle>
            <DialogDescription>
              Vincule o usuário a uma ou mais conexões e departamentos.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={submit} className="space-y-5">
            <div className="flex items-center gap-4">
              <Avatar className="size-16">
                {(avatarPreview || existingAvatar) ? <AvatarImage src={avatarPreview || existingAvatar || ""} /> : null}
                <AvatarFallback>{initials(nome)}</AvatarFallback>
              </Avatar>
              <input ref={fileRef} type="file" accept="image/*" className="hidden"
                onChange={(e) => onPickPhoto(e.target.files?.[0] ?? null)} />
              <Button type="button" size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
                <Upload className="size-3.5 mr-1.5" /> Foto (opcional)
              </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <Label>Nome</Label>
                <Input required value={nome} onChange={(e) => setNome(e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <Label>Email</Label>
                <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} disabled={!!editing} />
              </div>
              <div className="sm:col-span-2">
                <Label>{editing ? "Nova senha (opcional)" : "Senha"}</Label>
                <div className="relative">
                  <Input type={showPwd ? "text" : "password"} required={!editing} minLength={editing ? undefined : 8}
                    value={password} onChange={(e) => setPassword(e.target.value)}
                    placeholder={editing ? "Deixe em branco para manter" : "Mínimo 8 caracteres"} className="pr-9" />
                  <button type="button" onClick={() => setShowPwd((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground">
                    {showPwd ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>

              <div>
                <Label>Função base</Label>
                <Select value={role} onValueChange={(v) => setRole(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="atendente">Atendente</SelectItem>
                    <SelectItem value="admin" disabled={!isOwner}>Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Função personalizada</Label>
                <Select value={customRoleId} onValueChange={setCustomRoleId}>
                  <SelectTrigger><SelectValue placeholder="Nenhuma" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Nenhuma</SelectItem>
                    {roles.filter((r) => r.ativo).map((r) => (
                      <SelectItem key={r.id} value={r.id}>{r.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="flex items-center gap-1.5"><MessageSquare className="size-3.5" /> Máx. atendimentos simultâneos</Label>
                <Input type="number" min={1} max={999} value={maxChats}
                  onChange={(e) => setMaxChats(Math.max(1, Number(e.target.value) || 1))} />
              </div>
            </div>

            {/* Departamentos */}
            <div>
              <Label>Departamentos</Label>
              {deps.length === 0 ? (
                <p className="text-xs text-muted-foreground mt-1">Nenhum departamento cadastrado.</p>
              ) : (
                <div className="mt-2 flex flex-wrap gap-1.5 p-3 border rounded-md">
                  {deps.map((d) => {
                    const active = selDeps.includes(d.id);
                    return (
                      <button type="button" key={d.id}
                        onClick={() => {
                          const willAdd = !active;
                          toggleFromArray(selDeps, d.id, setSelDeps);
                          const pid = depPipes.find((x) => x.department_id === d.id)?.pipeline_id;
                          if (willAdd && pid && !selPipes.includes(pid)) setSelPipes([...selPipes, pid]);
                        }}
                        className={`text-xs px-3 py-1 rounded-full border transition ${active ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"}`}>
                        {d.nome}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Conexões */}
            <div>
              <Label>Conexões vinculadas</Label>
              {instances.length === 0 ? (
                <p className="text-xs text-muted-foreground mt-1">Nenhuma conexão disponível.</p>
              ) : (
                <div className="mt-2 flex flex-wrap gap-1.5 p-3 border rounded-md">
                  {instances.map((i: any) => {
                    const active = selInsts.includes(i.id);
                    const label = i.display_name || formatPhone(i.numero) || i.instance_name;
                    return (
                      <button type="button" key={i.id}
                        onClick={() => toggleFromArray(selInsts, i.id, setSelInsts)}
                        className={`text-xs px-3 py-1 rounded-full border transition ${active ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"}`}>
                        {label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Funis */}
            <div>
              <Label>Funis com acesso</Label>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Se nenhum for marcado, o usuário vê todos os funis. Donos e administradores sempre veem todos.
              </p>
              {pipes.length === 0 ? (
                <p className="text-xs text-muted-foreground mt-1">Nenhum funil cadastrado.</p>
              ) : (
                <div className="mt-2 flex flex-wrap gap-1.5 p-3 border rounded-md">
                  {pipes.map((p) => {
                    const active = selPipes.includes(p.id);
                    return (
                      <button type="button" key={p.id}
                        onClick={() => toggleFromArray(selPipes, p.id, setSelPipes)}
                        className={`text-xs px-3 py-1 rounded-full border transition ${active ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"}`}>
                        {p.nome}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setDlgOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={busy}>
                {busy ? <Loader2 className="size-4 mr-1.5 animate-spin" /> : null}
                {editing ? "Salvar" : "Cadastrar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmDel} onOpenChange={(o) => !o && setConfirmDel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover usuário?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDel?.nome || confirmDel?.email} perderá acesso imediatamente. As conexões vinculadas serão liberadas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={doRemove} className="bg-destructive hover:bg-destructive/90">Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function KpiCard({ label, value, icon, tone }: { label: string; value: number; icon: React.ReactNode; tone: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <div className={`size-10 rounded-lg grid place-items-center ${tone}`}>{icon}</div>
        <div>
          <div className="text-2xl font-bold leading-none">{value}</div>
          <div className="text-xs text-muted-foreground mt-1">{label}</div>
        </div>
      </div>
    </Card>
  );
}
