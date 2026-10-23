import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Loader2, Search, Eye, CalendarPlus, Ban, Mail, KeyRound, Save, Copy, Gift, ShieldCheck, Trash2, Rocket, RotateCcw, BadgeDollarSign, MoreHorizontal } from "lucide-react";
import {
  listMasterSubscriptions,
  listPlansBasic,
  getSubscriberProfile,
  getCompanyDetails,
  updateSubscriberSubscription,
  sendSubscriberResetLink,
  cancelSubscriber,
  resetCompanyOwnerPassword,
  extendTrial,
  listSignups,
  resendSignupConfirmation,
  confirmSignupManually,
  setUserPassword,
  deleteSubscriber,
  provisionSignupCompany,
  reopenOnboarding,
  markCompanyPaidManual,
} from "@/lib/master.functions";
import { listCompanyAddonsMaster, setCompanyAddonAccess } from "@/lib/addons.functions";
import { toast } from "sonner";

export type ClienteRow = {
  id: string;
  company_id: string;
  status: string;
  ciclo: string | null;
  current_period_end: string | null;
  trial_ends_at: string | null;
  cancel_at_period_end: boolean;
  cortesia: boolean | null;
  valor_customizado_cents?: number | null;

  provider: string | null;
  created_at: string;
  plan: { id: string; nome: string; slug: string; preco_cents: number; moeda: string; intervalo: string } | null;
  company: { id: string; nome: string; status_cobranca: string; email_corporativo: string | null; trial_ate: string | null; creditos_saldo: number; created_at: string } | null;
  owner: { user_id: string; email: string | null; nome: string | null } | null;
  conexoes?: { instance_name: string; display_name: string | null; numero: string | null; status: string; paused: boolean; provider: string; updated_at?: string }[];
  conexoes_total?: number;
  conexoes_online?: number;
  /** Preenchido quando a linha é um cadastro que ainda não virou empresa. */
  signup?: { user_id: string; email: string | null; nome: string | null; telefone: string | null; confirmed_at: string | null } | null;
};

const PROVIDER_LABEL: Record<string, string> = {
  dapi: "WhatsApp (D-API)",
  dapi_official: "WhatsApp Oficial (D-API)",
  official: "WhatsApp Oficial (D-API)",
  meta_instagram: "Instagram Direct",
  meta_messenger: "Facebook Messenger",
  telegram: "Telegram",
};

function ConexoesCell({ row }: { row: ClienteRow }) {
  const list = row.conexoes ?? [];
  if (!list.length) return <span className="text-xs text-muted-foreground">sem conexão</span>;
  const online = row.conexoes_online ?? 0;
  return (
    <div className="space-y-1">
      <Badge className={`border font-medium ${online > 0 ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-100 text-slate-700 border-slate-200"}`}>
        {online}/{list.length} online
      </Badge>
      <div className="space-y-0.5">
        {list.slice(0, 2).map((c) => (
          <div key={c.instance_name} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className={`size-1.5 rounded-full ${c.paused ? "bg-amber-500" : c.status === "connected" ? "bg-emerald-500" : "bg-slate-400"}`} />
            <span className="truncate max-w-[150px]">{c.numero || c.display_name || c.instance_name}</span>
            <span className="opacity-70">· {PROVIDER_LABEL[c.provider] ?? c.provider}</span>
          </div>
        ))}
        {list.length > 2 && <div className="text-[11px] text-muted-foreground">+{list.length - 2} conexão(ões)</div>}
      </div>
    </div>
  );
}

const STATUS: Record<string, { label: string; cls: string }> = {
  trialing: { label: "trial", cls: "bg-blue-50 text-blue-700 border-blue-200" },
  active: { label: "ativo", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  past_due: { label: "inadimplente", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  canceled: { label: "cancelado", cls: "bg-red-50 text-red-700 border-red-200" },
  expired: { label: "expirado", cls: "bg-slate-100 text-slate-700 border-slate-200" },
  paused: { label: "pausado", cls: "bg-slate-100 text-slate-700 border-slate-200" },
  incomplete: { label: "incompleto", cls: "bg-slate-100 text-slate-700 border-slate-200" },
  aguardando_email: { label: "e-mail não confirmado", cls: "bg-orange-50 text-orange-700 border-orange-200" },
  onboarding_incompleto: { label: "onboarding incompleto", cls: "bg-violet-50 text-violet-700 border-violet-200" },
};


export function formatBRL(cents: number, moeda?: string | null) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: moeda || "BRL" }).format((cents ?? 0) / 100);
}
function intervalLabel(ciclo: string | null | undefined) {
  switch (ciclo) {
    case "anual": return "ano";
    case "semestral": return "semestre";
    case "trimestral": return "trimestre";
    default: return "mês";
  }
}

const INATIVOS = ["past_due", "canceled", "expired", "paused", "incomplete"];

/** Visões do módulo de clientes — separadas por situação comercial. */
const VIEWS: { id: string; label: string; hint: string }[] = [
  { id: "pagantes", label: "Pagantes", hint: "Plano ativo e pago" },
  { id: "cortesia", label: "Cortesia", hint: "Acesso liberado sem cobrança" },
  { id: "trialing", label: "Em teste", hint: "Período de avaliação" },
  { id: "inativos", label: "Vencidos / inativos", hint: "Inadimplentes, cancelados e expirados" },
  { id: "pendentes", label: "Cadastros parados", hint: "Sem empresa criada" },
  { id: "all", label: "Todos", hint: "Base completa" },
];

function matchView(r: ClienteRow, view: string) {
  switch (view) {
    case "all": return true;
    case "pagantes": return r.status === "active" && !r.cortesia && !r.signup;
    case "cortesia": return !!r.cortesia && !r.signup;
    case "trialing": return r.status === "trialing" && !r.signup;
    case "inativos": return !r.signup && INATIVOS.includes(r.status);
    case "pendentes": return !!r.signup;
    default: return r.status === view;
  }
}


export function ClientesLista({ onStats }: { onStats?: (s: { mrr: number; active: number; trial: number; past: number; pendentes: number; total: number }) => void }) {
  const fetchSubscriptions = useServerFn(listMasterSubscriptions);
  const fetchSignups = useServerFn(listSignups);
  const resendConfirm = useServerFn(resendSignupConfirmation);
  const confirmSignup = useServerFn(confirmSignupManually);
  const setSignupPassword = useServerFn(setUserPassword);
  const cancelSub = useServerFn(cancelSubscriber);
  const deleteSub = useServerFn(deleteSubscriber);
  const extend = useServerFn(extendTrial);
  const markPaid = useServerFn(markCompanyPaidManual);
  const provisionSignup = useServerFn(provisionSignupCompany);
  const reopenOnb = useServerFn(reopenOnboarding);
  const [rows, setRows] = useState<ClienteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<string>("pagantes");
  const [selected, setSelected] = useState<ClienteRow | null>(null);

  async function load() {
    try {
      const [subs, signups] = await Promise.all([
        fetchSubscriptions(),
        fetchSignups({ data: { filter: "todos" } }).catch(() => ({ rows: [] as any[] })),
      ]);

      const subscriptionRows = Array.isArray((subs as any)?.rows) ? (subs as any).rows : [];
      const signupRows = Array.isArray((signups as any)?.rows) ? (signups as any).rows : [];
      const pendentes: ClienteRow[] = signupRows.map((s: any) => ({
        id: `signup:${s.user_id}`,
        company_id: "",
        status: s.confirmed_at ? "onboarding_incompleto" : "aguardando_email",
        ciclo: null,
        current_period_end: null,
        trial_ends_at: null,
        cancel_at_period_end: false,
        cortesia: false,
        provider: s.provider ?? null,
        created_at: s.created_at,
        plan: null,
        company: null,
        owner: { user_id: s.user_id, email: s.email, nome: s.nome },
        signup: {
          user_id: s.user_id,
          email: s.email,
          nome: s.nome,
          telefone: s.telefone ?? null,
          confirmed_at: s.confirmed_at ?? null,
        },
      }));

      setRows([...subscriptionRows, ...pendentes] as ClienteRow[]);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Falha ao carregar clientes";
      toast.error(message);
    }
    setLoading(false);
  }
  useEffect(() => {
    setLoading(true);
    load();
    const timer = window.setInterval(load, 15000);
    return () => window.clearInterval(timer);
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (!matchView(r, filter)) return false;
      if (!s) return true;
      return (
        r.company?.nome?.toLowerCase().includes(s) ||
        r.owner?.email?.toLowerCase().includes(s) ||
        r.owner?.nome?.toLowerCase().includes(s) ||
        r.signup?.telefone?.toLowerCase().includes(s) ||
        r.plan?.nome?.toLowerCase().includes(s)
      );
    });
  }, [rows, q, filter]);

  const stats = useMemo(() => {
    const pagantes = rows.filter((r) => matchView(r, "pagantes"));
    const mrr = pagantes.reduce((s, r) => s + (r.plan?.preco_cents ?? 0), 0);
    return {
      mrr,
      pagantes: pagantes.length,
      cortesia: rows.filter((r) => matchView(r, "cortesia")).length,
      trial: rows.filter((r) => r.status === "trialing").length,
      active: rows.filter((r) => r.status === "active").length,
      inativos: rows.filter((r) => matchView(r, "inativos")).length,
      past: rows.filter((r) => r.status === "past_due").length,
      pendentes: rows.filter((r) => !!r.signup).length,
      total: rows.length,
    };
  }, [rows]);

  const viewCount = (id: string) => rows.filter((r) => matchView(r, id)).length;


  useEffect(() => { onStats?.(stats); }, [stats]);

  async function handleExtendTrial(companyId: string) {
    try {
      await extend({ data: { companyId, days: 7 } });
      toast.success("Trial estendido em 7 dias");
      load();
    } catch (e: any) { toast.error(e?.message || "Falha ao estender trial"); }
  }

  async function handleMarkPaid(companyId: string) {
    const row = rows.find((r) => r.company_id === companyId);
    const input = prompt("Confirmar pagamento recebido (PIX, transferência, etc.).\nPor quantos dias liberar o plano?", "30");
    if (input === null) return;
    const dias = Math.max(1, Math.min(365, Number(input) || 30));
    const mensalidade = row?.valor_customizado_cents ?? row?.plan?.preco_cents ?? 0;
    const sugestao = mensalidade ? (mensalidade / 100).toFixed(2).replace(".", ",") : "";

    const valorInput = prompt("Valor recebido (R$):", sugestao);
    if (valorInput === null) return;
    const valorCents = valorInput.trim()
      ? Math.max(0, Math.round(Number(valorInput.replace(/\./g, "").replace(",", ".")) * 100))
      : null;
    try {
      const r: any = await markPaid({ data: { companyId, dias, valorCents } });
      toast.success(`Pagamento confirmado. Plano ativo até ${new Date(r.ate).toLocaleDateString("pt-BR")}`);
      load();
    } catch (e: any) { toast.error(e?.message || "Falha ao confirmar pagamento"); }
  }


  async function handleProvision(row: ClienteRow) {
    const input = prompt("Liberar acesso: criar empresa e trial para este cadastro.\nQuantos dias de trial?", "7");
    if (input === null) return;
    const days = Math.max(1, Math.min(365, Number(input) || 7));
    try {
      const res: any = await provisionSignup({ data: { userId: row.signup!.user_id, nome: row.signup!.nome ?? null, trialDays: days } });
      toast.success(res?.alreadyExisted ? "Este usuário já possui empresa" : `Empresa criada com ${days} dias de trial`);
      load();
    } catch (e: any) { toast.error(e?.message || "Falha ao liberar acesso"); }
  }

  async function handleReopen(companyId: string) {
    const input = prompt("Reabrir onboarding e renovar trial.\nQuantos dias de trial? (0 = não alterar)", "7");
    if (input === null) return;
    const days = Math.max(0, Math.min(365, Number(input) || 0));
    try {
      await reopenOnb({ data: { companyId, trialDays: days } });
      toast.success("Onboarding reaberto");
      load();
    } catch (e: any) { toast.error(e?.message || "Falha ao reabrir onboarding"); }
  }


  async function handleCancel(companyId: string) {
    if (!confirm("Cancelar a assinatura deste cliente?")) return;
    try {
      await cancelSub({ data: { companyId } });
      toast.success("Assinatura cancelada");
      load();
    } catch (e: any) { toast.error(e?.message || "Falha ao cancelar"); }
  }

  async function handleDelete(companyId: string, email: string) {
    if (!confirm(`ATENÇÃO: Isso excluirá permanentEMENTE a empresa e o usuário ${email}. Esta ação não pode ser desfeita. Continuar?`)) return;
    try {
      await deleteSub({ data: { companyId } });
      toast.success("Empresa e usuário excluídos permanentemente");
      load();
    } catch (e: any) { toast.error(e?.message || "Falha ao excluir"); }
  }

  async function handleResend(email: string) {
    try {
      await resendConfirm({ data: { email } });
      toast.success("Confirmação reenviada");
    } catch (e: any) { toast.error(e?.message || "Falha ao reenviar"); }
  }

  async function handleConfirmSignup(userId: string) {
    try {
      await confirmSignup({ data: { userId } });
      toast.success("E-mail confirmado manualmente");
      load();
    } catch (e: any) { toast.error(e?.message || "Falha ao confirmar"); }
  }

  async function handleSignupPassword(userId: string) {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%";
    const arr = new Uint32Array(14);
    (globalThis.crypto as Crypto).getRandomValues(arr);
    const pwd = Array.from(arr, (n) => chars[n % chars.length]).join("");
    try {
      await setSignupPassword({ data: { userId, password: pwd } });
      try { await navigator.clipboard.writeText(pwd); } catch {}
      toast.success(`Senha definida e copiada: ${pwd}`);
    } catch (e: any) { toast.error(e?.message || "Falha ao definir senha"); }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <Stat label="Receita recorrente" value={formatBRL(stats.mrr)} hint={`${stats.pagantes} pagando plano`} tone="emerald" />
        <Stat label="Pagantes" value={String(stats.pagantes)} hint="plano ativo" tone="brand" />
        <Stat label="Cortesia" value={String(stats.cortesia)} hint="sem cobrança" tone="violet" />
        <Stat label="Em teste" value={String(stats.trial)} hint="período de avaliação" tone="blue" />
        <Stat label="Vencidos / inativos" value={String(stats.inativos)} hint={`${stats.past} inadimplentes`} tone="amber" />
        <Stat label="Base total" value={String(stats.total)} hint={`${stats.pendentes} cadastros parados`} />
      </div>

      <Card className="p-3 sm:p-4 rounded-2xl border-[color:var(--hairline)] space-y-3">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1 pb-0.5">
          {VIEWS.map((v) => {
            const n = viewCount(v.id);
            const on = filter === v.id;
            return (
              <button
                key={v.id}
                title={v.hint}
                onClick={() => setFilter(v.id)}
                className={`shrink-0 flex items-center gap-2 text-[13px] font-medium px-3.5 py-2 rounded-xl border transition ${
                  on
                    ? "bg-[color:var(--brand)] text-white border-transparent shadow-sm"
                    : "border-[color:var(--hairline)] text-muted-foreground hover:text-foreground hover:bg-muted/60"
                }`}
              >
                {v.label}
                <span className={`text-[11px] tabular-nums rounded-full px-1.5 py-0.5 ${on ? "bg-white/20" : "bg-muted"}`}>{n}</span>
              </button>
            );
          })}
        </div>
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <div className="relative flex-1">
            <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por empresa, responsável, telefone ou plano..." className="pl-9" />
          </div>
          <div className="text-xs text-muted-foreground shrink-0 sm:pr-1">
            {filtered.length} {filtered.length === 1 ? "cliente" : "clientes"} · {VIEWS.find((v) => v.id === filter)?.hint}
          </div>
        </div>
      </Card>


      {loading ? (
        <div className="grid place-items-center py-20"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted-foreground rounded-2xl">Nenhum cliente encontrado.</Card>
      ) : (
        <>
        {/* Mobile / tablet: cards */}
        <div className="xl:hidden space-y-2.5 max-h-[64vh] overflow-y-auto pr-1">
          {filtered.map((r) => {
            const st = STATUS[r.status] || { label: r.status, cls: "bg-muted text-foreground border-transparent" };
            const dueDate = r.status === "trialing"
              ? (r.trial_ends_at ?? r.company?.trial_ate ?? null)
              : r.current_period_end;
            const displayName = r.company?.nome || r.owner?.nome || r.owner?.email || "—";
            const displayEmail = r.owner?.email || r.company?.email_corporativo || "";
            const isSignup = !!r.signup;
            return (
              <Card
                key={r.id}
                className={`p-3.5 rounded-2xl border-[color:var(--hairline)] ${isSignup ? "" : "cursor-pointer active:bg-muted/40"}`}
                onClick={() => { if (!isSignup) setSelected(r); }}
              >
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate flex items-center gap-1.5">
                      {displayName}
                      {r.cortesia && <Gift className="size-3.5 shrink-0 text-emerald-600" />}
                    </div>
                    {displayEmail && <div className="text-[11px] text-muted-foreground truncate">{displayEmail}</div>}
                    {r.signup?.telefone && <div className="text-[11px] text-muted-foreground truncate">{r.signup.telefone}</div>}
                  </div>
                  <Badge className={`${st.cls} font-medium border shrink-0 text-[10.5px]`}>{st.label}</Badge>
                </div>

                <div className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-2 text-[11.5px]">
                  <div className="min-w-0">
                    <div className="text-muted-foreground text-[10px] uppercase tracking-wide">Plano</div>
                    <div className="truncate font-medium">{r.plan?.nome ?? "—"}</div>
                    {r.plan && (
                      <div className="text-[10.5px] text-muted-foreground truncate">
                        {formatBRL(r.plan.preco_cents, r.plan.moeda)} / {intervalLabel(r.ciclo)}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="text-muted-foreground text-[10px] uppercase tracking-wide">Conexões</div>
                    {isSignup ? <span className="text-muted-foreground">—</span> : <ConexoesCell row={r} />}
                  </div>
                  <div className="min-w-0">
                    <div className="text-muted-foreground text-[10px] uppercase tracking-wide">Cobrança / trial</div>
                    <div className="tabular-nums">{dueDate ? new Date(dueDate).toLocaleDateString("pt-BR") : "—"}</div>
                  </div>
                  <div className="min-w-0">
                    <div className="text-muted-foreground text-[10px] uppercase tracking-wide">Créditos</div>
                    <div className="tabular-nums">{isSignup ? "—" : (r.company?.creditos_saldo ?? 0)}</div>
                  </div>
                </div>

                {r.cancel_at_period_end && <div className="text-[10px] text-amber-600 mt-2">cancela no fim do período</div>}

                <div className="mt-2.5 pt-2.5 border-t border-[color:var(--hairline)] flex items-center justify-between gap-2" onClick={(e) => e.stopPropagation()}>
                  <span className="text-[10.5px] text-muted-foreground truncate">
                    Cadastro {new Date(r.company?.created_at ?? r.created_at).toLocaleDateString("pt-BR")}
                  </span>
                  <ClienteActionsMenu
                    row={r}
                    onOpen={() => setSelected(r)}
                    onMarkPaid={() => handleMarkPaid(r.company_id)}
                    onExtend={() => handleExtendTrial(r.company_id)}
                    onReopen={() => handleReopen(r.company_id)}
                    onCancel={() => handleCancel(r.company_id)}
                    onDelete={() => handleDelete(r.company_id, r.owner?.email || "")}
                    onResend={(email) => handleResend(email)}
                    onConfirm={(userId) => handleConfirmSignup(userId)}
                    onPassword={(userId) => handleSignupPassword(userId)}
                    onProvision={() => handleProvision(r)}
                  />
                </div>
              </Card>
            );
          })}
        </div>

        <Card className="hidden xl:block overflow-hidden rounded-2xl border-[color:var(--hairline)]">
          <div className="overflow-auto max-h-[64vh]">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 backdrop-blur text-xs uppercase tracking-wider text-muted-foreground sticky top-0 z-10">
                <tr>
                  <th className="text-left px-4 py-3">Cliente</th>
                  <th className="text-left px-4 py-3">Plano</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-left px-4 py-3">Conexões</th>
                  <th className="text-left px-4 py-3">Próx. cobrança / fim trial</th>
                  <th className="text-left px-4 py-3">Créditos</th>
                  <th className="text-left px-4 py-3">Cadastro</th>
                  <th className="text-right px-4 py-3">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((r) => {
                  const st = STATUS[r.status] || { label: r.status, cls: "bg-muted text-foreground border-transparent" };
                  const dueDate = r.status === "trialing"
                    ? (r.trial_ends_at ?? r.company?.trial_ate ?? null)
                    : r.current_period_end;
                  const displayName = r.company?.nome || r.owner?.nome || r.owner?.email || "—";
                  const displayEmail = r.owner?.email || r.company?.email_corporativo || "";
                  const isSignup = !!r.signup;
                  return (
                    <tr
                      key={r.id}
                      className={`hover:bg-muted/30 ${isSignup ? "" : "cursor-pointer"}`}
                      onClick={() => { if (!isSignup) setSelected(r); }}
                    >
                      <td className="px-4 py-3">
                        <div className="min-w-0">
                          <div className="font-medium truncate flex items-center gap-1.5">
                            {displayName}
                            {r.cortesia && <Gift className="size-3.5 text-emerald-600" />}
                          </div>
                          {displayEmail && <div className="text-[11px] text-muted-foreground truncate">{displayEmail}</div>}
                          {r.signup?.telefone && <div className="text-[11px] text-muted-foreground">{r.signup.telefone}</div>}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium">{r.plan?.nome ?? "—"}</div>
                        {r.plan && (
                          <div className="text-[11px] text-muted-foreground">
                            {formatBRL(r.plan.preco_cents, r.plan.moeda)} / {intervalLabel(r.ciclo)}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge className={`${st.cls} font-medium border`}>{st.label}</Badge>
                        {r.cancel_at_period_end && <div className="text-[10px] text-amber-600 mt-1">cancela no fim do período</div>}
                      </td>
                      <td className="px-4 py-3">
                        {isSignup ? <span className="text-xs text-muted-foreground">—</span> : <ConexoesCell row={r} />}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {dueDate ? new Date(dueDate).toLocaleDateString("pt-BR") : "—"}
                      </td>
                      <td className="px-4 py-3 text-xs tabular-nums">{isSignup ? "—" : (r.company?.creditos_saldo ?? 0)}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {new Date(r.company?.created_at ?? r.created_at).toLocaleDateString("pt-BR")}
                      </td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end">
                          <ClienteActionsMenu
                            row={r}
                            onOpen={() => setSelected(r)}
                            onMarkPaid={() => handleMarkPaid(r.company_id)}
                            onExtend={() => handleExtendTrial(r.company_id)}
                            onReopen={() => handleReopen(r.company_id)}
                            onCancel={() => handleCancel(r.company_id)}
                            onDelete={() => handleDelete(r.company_id, r.owner?.email || "")}
                            onResend={(email) => handleResend(email)}
                            onConfirm={(userId) => handleConfirmSignup(userId)}
                            onPassword={(userId) => handleSignupPassword(userId)}
                            onProvision={() => handleProvision(r)}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}

              </tbody>
            </table>
          </div>
        </Card>
        </>

      )}

      {selected && (
        <ClienteDialog
          row={selected}
          onClose={() => setSelected(null)}
          onSaved={() => { setSelected(null); load(); }}
        />
      )}
    </div>
  );
}

type ClienteActionsMenuProps = {
  row: ClienteRow;
  onOpen: () => void;
  onMarkPaid: () => void;
  onExtend: () => void;
  onReopen: () => void;
  onCancel: () => void;
  onDelete: () => void;
  onResend: (email: string) => void;
  onConfirm: (userId: string) => void;
  onPassword: (userId: string) => void;
  onProvision: () => void;
};

function ClienteActionsMenu({
  row, onOpen, onMarkPaid, onExtend, onReopen, onCancel, onDelete,
  onResend, onConfirm, onPassword, onProvision,
}: ClienteActionsMenuProps) {
  const signup = row.signup;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-8" aria-label="Abrir ações do cliente">
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        {signup ? (
          <>
            {!signup.confirmed_at && signup.email && (
              <>
                <DropdownMenuItem onClick={() => onResend(signup.email ?? "")}><Mail /> Reenviar confirmação</DropdownMenuItem>
                <DropdownMenuItem onClick={() => onConfirm(signup.user_id)}><ShieldCheck /> Confirmar e-mail</DropdownMenuItem>
              </>
            )}
            <DropdownMenuItem onClick={() => onPassword(signup.user_id)}><KeyRound /> Gerar nova senha</DropdownMenuItem>
            <DropdownMenuItem onClick={onProvision}><Rocket /> Liberar acesso</DropdownMenuItem>
          </>
        ) : (
          <>
            <DropdownMenuItem onClick={onOpen}><Eye /> Abrir ficha</DropdownMenuItem>
            <DropdownMenuItem onClick={onMarkPaid}><BadgeDollarSign className="text-emerald-600" /> Confirmar pagamento</DropdownMenuItem>
            <DropdownMenuItem onClick={onExtend}><CalendarPlus /> Estender trial</DropdownMenuItem>
            <DropdownMenuItem onClick={onReopen}><RotateCcw /> Reabrir onboarding</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onCancel} className="text-destructive focus:text-destructive"><Ban /> Cancelar assinatura</DropdownMenuItem>
            <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive"><Trash2 /> Excluir permanentemente</DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const STAT_TONE: Record<string, string> = {
  emerald: "bg-emerald-500",
  brand: "bg-[color:var(--brand)]",
  violet: "bg-violet-500",
  blue: "bg-blue-500",
  amber: "bg-amber-500",
  slate: "bg-slate-300",
};

function Stat({ label, value, hint, tone = "slate" }: { label: string; value: string; hint?: string; tone?: string }) {
  return (
    <Card className="relative min-w-0 overflow-hidden p-3 sm:p-4 rounded-2xl border-[color:var(--hairline)]">
      <span className={`absolute left-0 top-0 h-full w-1 ${STAT_TONE[tone] ?? STAT_TONE.slate}`} />
      <div className="pl-1.5">
        <div className="text-[10.5px] sm:text-[11px] uppercase tracking-wider text-muted-foreground truncate">{label}</div>
        <div className="text-lg sm:text-2xl font-bold mt-1 truncate tabular-nums">{value}</div>
        {hint && <div className="text-[10px] text-muted-foreground mt-0.5 truncate">{hint}</div>}
      </div>
    </Card>
  );
}


/* ------------- Ficha do cliente ------------- */
function ClienteDialog({ row, onClose, onSaved }: { row: ClienteRow; onClose: () => void; onSaved: () => void }) {
  const fetchProfile = useServerFn(getSubscriberProfile);
  const fetchDetails = useServerFn(getCompanyDetails);
  const fetchPlans = useServerFn(listPlansBasic);
  const saveSub = useServerFn(updateSubscriberSubscription);
  const sendReset = useServerFn(sendSubscriberResetLink);
  const setPassword = useServerFn(resetCompanyOwnerPassword);

  const [tab, setTab] = useState<"cadastro" | "assinatura" | "acesso">("cadastro");
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [details, setDetails] = useState<any>(null);
  const [plans, setPlans] = useState<any[]>([]);

  const [planId, setPlanId] = useState<string>("");
  const [ciclo, setCiclo] = useState<string>("mensal");
  const [status, setStatus] = useState<string>("active");
  const [valorCustom, setValorCustom] = useState<string>("");
  const [extendTrialDays, setExtendTrialDays] = useState<string>("0");
  const [extendAccessDays, setExtendAccessDays] = useState<string>("0");
  const [cortesia, setCortesia] = useState(false);
  const [notas, setNotas] = useState("");
  const [extraUsuarios, setExtraUsuarios] = useState<string>("0");
  const [extraConexoes, setExtraConexoes] = useState<string>("0");
  const [creditos, setCreditos] = useState<string>("");

  const [newPass, setNewPass] = useState("");
  const [sendingReset, setSendingReset] = useState(false);
  const [applyingPass, setApplyingPass] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [p, pl, d] = await Promise.all([
          fetchProfile({ data: { companyId: row.company_id } }),
          fetchPlans(),
          fetchDetails({ data: { companyId: row.company_id } }).catch(() => null),
        ]);
        if (cancelled) return;
        setProfile(p);
        setDetails(d);
        setPlans(pl.plans ?? []);
        const sub = (p as any).subscription;
        setPlanId(sub?.plan?.id ?? "");
        setCiclo(sub?.ciclo ?? "mensal");
        setStatus(sub?.status ?? "active");
        setValorCustom(sub?.valor_customizado_cents ? (sub.valor_customizado_cents / 100).toFixed(2).replace(".", ",") : "");
        setCortesia(!!sub?.cortesia);
        setNotas(sub?.notas_internas ?? "");
        setExtraUsuarios(String(sub?.extra_usuarios ?? 0));
        setExtraConexoes(String(sub?.extra_conexoes ?? 0));
        setCreditos(String((p as any).company?.creditos_saldo ?? 0));
      } catch (e: any) {
        toast.error(e?.message || "Falha ao carregar");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line
  }, [row.company_id]);

  async function handleSave() {
    setSaving(true);
    try {
      const parsedValor = valorCustom.trim() ? Math.round(Number(valorCustom.replace(",", ".")) * 100) : null;
      await saveSub({
        data: {
          companyId: row.company_id,
          planId: planId || null,
          ciclo,
          status,
          valor_customizado_cents: parsedValor,
          extend_trial_days: Number(extendTrialDays) || 0,
          extend_access_days: Number(extendAccessDays) || 0,
          cortesia,
          notas_internas: notas || null,
          extra_usuarios: Number(extraUsuarios) || 0,
          extra_conexoes: Number(extraConexoes) || 0,
          creditos_saldo: creditos.trim() === "" ? null : Number(creditos),
        },
      });
      toast.success("Alterações salvas");
      onSaved();
    } catch (e: any) {
      toast.error(e?.message || "Falha ao salvar");
    } finally {
      setSaving(false);
    }
  }

  async function handleSendReset() {
    setSendingReset(true);
    try {
      const r = await sendReset({ data: { companyId: row.company_id } });
      toast.success(`Link enviado para ${(r as any).email}`);
    } catch (e: any) {
      toast.error(e?.message || "Falha ao enviar link");
    } finally {
      setSendingReset(false);
    }
  }

  async function handleApplyPassword() {
    if (newPass.length < 8) { toast.error("Mínimo 8 caracteres"); return; }
    setApplyingPass(true);
    try {
      await setPassword({ data: { companyId: row.company_id, newPassword: newPass } });
      toast.success("Senha redefinida");
      setNewPass("");
    } catch (e: any) {
      toast.error(e?.message || "Falha ao redefinir");
    } finally {
      setApplyingPass(false);
    }
  }

  const email = profile?.owner?.email ?? row.owner?.email ?? row.company?.email_corporativo ?? "—";
  const nome = profile?.company?.nome ?? row.company?.nome ?? profile?.owner?.nome ?? "—";
  const c = details?.company;

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{nome}</DialogTitle>
          <DialogDescription>Ficha completa do cliente: cadastro, assinatura e acesso.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-3 rounded-lg bg-muted p-1 text-sm font-medium">
          {(["cadastro", "assinatura", "acesso"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`py-2 rounded-md transition capitalize ${tab === t ? "bg-background shadow-sm" : "text-muted-foreground"}`}
            >
              {t}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="grid place-items-center py-10"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
        ) : tab === "cadastro" ? (
          <div className="space-y-4 py-2 text-sm">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Empresa" value={c?.nome ?? nome} />
              <Field label="Slug" value={c?.slug} />
              <Field label="E-mail" value={c?.email_corporativo ?? email} />
              <Field label="Telefone" value={c?.telefone} />
              <Field label="CNPJ/CPF" value={c?.cnpj} />
              <Field label="Segmento" value={c?.segmento} />
              <Field label="Endereço" value={c?.endereco} />
              <Field label="Cidade/UF" value={[c?.cidade, c?.uf].filter(Boolean).join(" / ")} />
              <Field label="Plano" value={profile?.subscription?.plan?.nome ?? "—"} />
              <Field label="Status">
                <Badge className={`${STATUS[status]?.cls ?? "bg-muted"} border`}>{STATUS[status]?.label ?? status}</Badge>
              </Field>
              <Field label="Trial até" value={profile?.company?.trial_ate ? new Date(profile.company.trial_ate).toLocaleString("pt-BR") : "—"} />
              <Field label="Créditos IA" value={String(profile?.company?.creditos_saldo ?? 0)} />
              <Field label="Cadastro" value={profile?.company?.created_at ? new Date(profile.company.created_at).toLocaleString("pt-BR") : "—"} />
            </div>

            <div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">
                Conexões WhatsApp ({row.conexoes_online ?? 0}/{row.conexoes?.length ?? 0} online)
              </div>
              <div className="space-y-1">
                {row.conexoes?.length ? row.conexoes.map((cx) => (
                  <div key={cx.instance_name} className="flex items-center justify-between gap-2 border rounded-md px-3 py-2">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{cx.display_name || cx.numero || cx.instance_name}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {cx.numero || "sem número"} · {PROVIDER_LABEL[cx.provider] ?? cx.provider}
                        {cx.updated_at ? ` · ${new Date(cx.updated_at).toLocaleString("pt-BR")}` : ""}
                      </div>
                    </div>
                    <Badge className={`border ${cx.paused ? "bg-amber-50 text-amber-700 border-amber-200" : cx.status === "connected" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-100 text-slate-700 border-slate-200"}`}>
                      {cx.paused ? "pausada" : cx.status === "connected" ? "conectada" : cx.status}
                    </Badge>
                  </div>
                )) : <div className="text-muted-foreground text-xs">Nenhuma conexão.</div>}
              </div>
            </div>

            <div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">Responsáveis</div>
              <div className="space-y-1">
                {details?.members?.length ? details.members.map((m: any) => (
                  <div key={m.user_id} className="flex items-center justify-between border rounded-md px-3 py-2">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{m.profile?.nome || m.profile?.email || m.user_id}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {m.profile?.email}{m.profile?.telefone ? ` · ${m.profile.telefone}` : ""}
                      </div>
                    </div>
                    <Badge variant={m.role === "owner" ? "default" : "secondary"}>{m.role}</Badge>
                  </div>
                )) : <div className="text-muted-foreground text-xs">Nenhum usuário.</div>}
              </div>
            </div>

            {profile?.owner?.user_id && (
              <div className="rounded-lg border p-3 flex items-center justify-between gap-2">
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground">User ID</div>
                  <div className="font-mono text-xs">{profile.owner.user_id}</div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => { navigator.clipboard.writeText(profile.owner.user_id); toast.success("Copiado"); }}>
                  <Copy className="size-4" />
                </Button>
              </div>
            )}
          </div>
        ) : tab === "assinatura" ? (
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>Plano</Label>
                <Select value={planId} onValueChange={setPlanId}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {plans.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.nome} — {formatBRL(p.preco_cents, p.moeda)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Ciclo</Label>
                <Select value={ciclo} onValueChange={setCiclo}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mensal">Mensal</SelectItem>
                    <SelectItem value="trimestral">Trimestral</SelectItem>
                    <SelectItem value="semestral">Semestral</SelectItem>
                    <SelectItem value="anual">Anual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Ativo</SelectItem>
                    <SelectItem value="trialing">Em trial</SelectItem>
                    <SelectItem value="past_due">Inadimplente</SelectItem>
                    <SelectItem value="canceled">Cancelado</SelectItem>
                    <SelectItem value="expired">Expirado</SelectItem>
                    <SelectItem value="paused">Pausado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Valor customizado (R$)</Label>
                <Input placeholder="Padrão do plano" value={valorCustom} onChange={(e) => setValorCustom(e.target.value)} />
              </div>
              <div>
                <Label>Estender trial (+ dias)</Label>
                <Input type="number" min={0} value={extendTrialDays} onChange={(e) => setExtendTrialDays(e.target.value)} />
              </div>
              <div>
                <Label>Estender acesso (+ dias)</Label>
                <Input type="number" min={0} value={extendAccessDays} onChange={(e) => setExtendAccessDays(e.target.value)} />
              </div>
              <div>
                <Label>Extra de usuários</Label>
                <Input type="number" min={0} value={extraUsuarios} onChange={(e) => setExtraUsuarios(e.target.value)} />
              </div>
              <div>
                <Label>Extra de conexões</Label>
                <Input type="number" min={0} value={extraConexoes} onChange={(e) => setExtraConexoes(e.target.value)} />
              </div>
              <div className="col-span-2">
                <Label>Créditos IA (saldo)</Label>
                <Input type="number" min={0} value={creditos} onChange={(e) => setCreditos(e.target.value)} />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <div className="font-medium text-sm flex items-center gap-1.5"><Gift className="size-4 text-emerald-600" /> Cortesia (sem cobrança)</div>
                <p className="text-xs text-muted-foreground">Acesso liberado sem cobrar.</p>
              </div>
              <Switch checked={cortesia} onCheckedChange={setCortesia} />
            </div>

            <ConexoesLiberadas companyId={row.company_id} />

            <div>
              <Label>Notas internas (opcional)</Label>
              <Textarea placeholder="Motivo da alteração, contato, etc." value={notas} onChange={(e) => setNotas(e.target.value)} rows={3} />
            </div>

            <Button className="w-full" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Save className="size-4 mr-2" />} Salvar alterações
            </Button>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="rounded-lg border p-4 space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium"><Mail className="size-4" /> Enviar link de redefinição</div>
              <p className="text-xs text-muted-foreground">O cliente recebe um e-mail seguro para criar uma nova senha. Recomendado.</p>
              <Button className="w-full" onClick={handleSendReset} disabled={sendingReset}>
                {sendingReset ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Mail className="size-4 mr-2" />}
                Enviar para {email}
              </Button>
            </div>

            <div className="rounded-lg border p-4 space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium"><KeyRound className="size-4 text-amber-600" /> Definir senha manualmente</div>
              <p className="text-xs text-muted-foreground">Para suporte por telefone. Informe a nova senha em canal seguro.</p>
              <div>
                <Label>Nova senha (min. 8 caracteres)</Label>
                <div className="flex gap-2">
                  <Input type="password" value={newPass} onChange={(e) => setNewPass(e.target.value)} placeholder="********" />
                  <Button onClick={handleApplyPassword} disabled={applyingPass || newPass.length < 8}>
                    {applyingPass ? <Loader2 className="size-4 animate-spin" /> : "Aplicar"}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value, children }: { label: string; value?: string | null; children?: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm truncate">{children ?? value ?? "—"}</div>
    </div>
  );
}

const CONEXAO_TIPOS = [
  { tipo: "whatsapp_uazapi" as const, nome: "Uazapi", desc: "Conexão não-oficial estável (add-on pago)." },
  { tipo: "whatsapp_meta" as const, nome: "API Oficial Meta", desc: "WhatsApp Cloud API oficial (add-on pago)." },
];

function ConexoesLiberadas({ companyId }: { companyId: string }) {
  const listAddons = useServerFn(listCompanyAddonsMaster);
  const setAccess = useServerFn(setCompanyAddonAccess);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [ativos, setAtivos] = useState<Set<string>>(new Set());

  async function load() {
    try {
      const rows = await listAddons({ data: { companyId } });
      setAtivos(new Set(
        (rows as any[])
          .filter((r) => r.status === "active" && (!r.current_period_end || new Date(r.current_period_end) > new Date()))
          .map((r) => r.addon_product?.tipo)
          .filter(Boolean),
      ));
    } catch (e: any) {
      toast.error(e?.message || "Falha ao carregar conexões");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [companyId]);

  async function toggle(tipo: "whatsapp_uazapi" | "whatsapp_meta", enable: boolean) {
    setSaving(tipo);
    try {
      await setAccess({ data: { companyId, tipo, enable } });
      setAtivos((prev) => {
        const next = new Set(prev);
        if (enable) next.add(tipo); else next.delete(tipo);
        return next;
      });
      toast.success(enable ? "Conexão liberada" : "Conexão revogada");
    } catch (e: any) {
      toast.error(e?.message || "Falha ao atualizar");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="rounded-lg border p-3 space-y-3">
      <div>
        <div className="font-medium text-sm flex items-center gap-1.5">
          <ShieldCheck className="size-4 text-primary" /> Conexões liberadas
        </div>
        <p className="text-xs text-muted-foreground">
          Libere tipos de conexão extras para este cliente sem cobrança adicional.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" /> Carregando...
        </div>
      ) : (
        CONEXAO_TIPOS.map((c) => (
          <div key={c.tipo} className="flex items-center justify-between gap-3 rounded-md border p-2.5">
            <div className="min-w-0">
              <div className="text-sm font-medium flex items-center gap-2">
                {c.nome}
                {ativos.has(c.tipo) && (
                  <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200">liberado</Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground truncate">{c.desc}</p>
            </div>
            <Switch
              checked={ativos.has(c.tipo)}
              disabled={saving === c.tipo}
              onCheckedChange={(v) => toggle(c.tipo, v)}
            />
          </div>
        ))
      )}
    </div>
  );
}
