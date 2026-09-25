import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { brand } from "@/config/brand";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Loader2,
  Users,
  Search,
  Plus,
  Copy,
  CheckCircle2,
  X,
  Wallet,
  Settings,
  AlertCircle,
  ThumbsUp,
  ThumbsDown,
  Clock,
  MousePointerClick,
  Building2,
  Trash2,
  BarChart3,
  Link2,
} from "lucide-react";
import { toast } from "sonner";
import { 
  getPartners, 
  createPartner, 
  updatePartner, 
  getAllProfiles, 
  getWithdrawalRequests, 
  updateWithdrawalStatus,
  updatePartnerConfig,
  getPartnersWithMetrics,
  getPartnerDetails,
  listAssignableCompanies,
  assignCompanyToPartner,
  unassignCompany
} from "@/lib/partners.functions";
import { supabase } from "@/integrations/supabase/client";


export const Route = createFileRoute("/master/parceiros")({
  head: () => ({
    meta: [
      { title: `${brand.name} — Parceiros` },
      { name: "description", content: "Gerenciamento de agências e parceiros de indicação." },
    ],
  }),
  component: PartnersPage,
});

function PartnersPage() {
  const [tab, setTab] = useState<"lista" | "saques" | "config">("lista");

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-[26px] leading-tight tracking-tight">Parceiros</h1>
        <p className="text-sm text-muted-foreground">Agências e parceiros comerciais que indicam o {brand.name}.</p>
      </div>

      <div className="flex items-center gap-1 border-b border-[color:var(--hairline)]">
        {[
          { id: "lista", label: "Lista de Parceiros" },
          { id: "saques", label: "Solicitações de Saque" },
          { id: "config", label: "Configurações" },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as any)}
            className={`relative px-3 py-2.5 text-[13px] font-medium transition-colors ${
              tab === t.id ? "text-[color:var(--brand-text)]" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
            {tab === t.id && (
              <span className="absolute left-2 right-2 -bottom-px h-[2px] rounded-full" style={{ background: "var(--brand)" }} />
            )}
          </button>
        ))}
      </div>

      {tab === "lista" && <PartnersList />}
      {tab === "saques" && <WithdrawalsList />}
      {tab === "config" && <PartnerSettings />}

    </div>
  );
}

function PartnersList() {
  const load = useServerFn(getPartnersWithMetrics);
  const [partners, setPartners] = useState<any[] | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [q, setQ] = useState("");

  async function reload() {
    try {
      setPartners(await load());
    } catch (e: any) {
      toast.error(e?.message);
    }
  }

  useEffect(() => {
    void reload();
    const ch = supabase
      .channel("master-parceiros-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "parceiro_indicacao" }, () => void reload())
      .on("postgres_changes", { event: "*", schema: "public", table: "parceiro_clique" }, () => void reload())
      .on("postgres_changes", { event: "*", schema: "public", table: "parceiro" }, () => void reload())
      .subscribe();
    const t = setInterval(() => void reload(), 30_000);
    return () => {
      supabase.removeChannel(ch);
      clearInterval(t);
    };
  }, []);

  const filtered = (partners ?? []).filter(p => 
    p.profile?.nome?.toLowerCase().includes(q.toLowerCase()) || 
    p.profile?.email?.toLowerCase().includes(q.toLowerCase()) ||
    p.codigo_indicacao.toLowerCase().includes(q.toLowerCase())
  );

  if (!partners) return <div className="py-20 grid place-items-center"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="size-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input 
            placeholder="Buscar parceiro..." 
            className="pl-8 h-9" 
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <Button size="sm" onClick={() => setShowAdd(true)}>
          <Plus className="size-4 mr-1.5" /> Novo Parceiro
        </Button>
      </div>

      {showAdd && <AddPartnerModal onClose={() => setShowAdd(false)} onSave={reload} />}

      <div className="grid gap-3">
        {filtered.map((p) => (
          <PartnerCard key={p.id} partner={p} onUpdate={reload} />
        ))}
        {filtered.length === 0 && (
          <Card className="p-10 text-center border-dashed">
            <Users className="size-8 mx-auto text-muted-foreground mb-2 opacity-20" />
            <p className="text-sm text-muted-foreground">Nenhum parceiro encontrado.</p>
          </Card>
        )}
      </div>
    </div>
  );
}

function PartnerCard({ partner, onUpdate }: { partner: any; onUpdate: () => void }) {
  const update = useServerFn(updatePartner);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const m = partner.metrics ?? { cliques: 0, cliques30d: 0, indicacoes: 0, ativos: 0, trial: 0, inadimplentes: 0, conversao: 0 };

  async function toggleStatus() {
    setLoading(true);
    try {
      await update({
        data: {
          id: partner.id,
          comissao: partner.porcentagem_comissao,
          status: partner.status === "ativo" ? "inativo" : "ativo"
        }
      });
      toast.success("Status atualizado");
      onUpdate();
    } catch (e: any) {
      toast.error(e?.message);
    } finally {
      setLoading(false);
    }
  }

  const brl = (cents: number) =>
    (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const referralUrl = `${window.location.origin}/entrar?ref=${partner.codigo_indicacao}`;

  return (
    <Card className="p-4 rounded-2xl border-[color:var(--hairline)] bg-white shadow-sm overflow-hidden">
      <div className="flex flex-col md:flex-row md:items-center gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold text-sm truncate">{partner.profile?.nome || "Sem nome"}</h3>
            <Badge variant={partner.status === "ativo" ? "default" : "secondary"} className="text-[10px] h-4">
              {partner.status}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground truncate mb-2">{partner.profile?.email}</p>
          
          <div className="flex items-center gap-3">
            <div className="bg-muted/50 rounded-md px-2 py-1 flex items-center gap-2 border border-[color:var(--hairline)]">
              <code className="text-[10px] font-mono">{partner.codigo_indicacao}</code>
              <button 
                onClick={() => {
                  navigator.clipboard.writeText(referralUrl);
                  toast.success("Link copiado!");
                }}
                className="hover:text-foreground text-muted-foreground transition-colors"
              >
                <Copy className="size-3" />
              </button>
            </div>
            <span className="text-[11px] font-medium text-brand-600 bg-brand-50 px-1.5 py-0.5 rounded">
              {partner.porcentagem_comissao}% comissão
            </span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 md:gap-8 border-t md:border-t-0 md:border-l border-[color:var(--hairline)] pt-4 md:pt-0 md:pl-6">
          <div className="text-center md:text-left">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Acumulado</p>
            <p className="text-sm font-semibold">{brl(partner.total_acumulado_cents)}</p>
          </div>
          <div className="text-center md:text-left">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Saldo</p>
            <p className="text-sm font-semibold text-emerald-600">{brl(partner.saldo_atual_cents)}</p>
          </div>
          <div className="flex items-center justify-end gap-2">
             <Button variant="secondary" size="sm" className="h-8 text-xs" onClick={() => setOpen(true)}>
               <BarChart3 className="size-3.5 mr-1" /> Painel
             </Button>
             <Button 
               variant="outline" 
               size="sm" 
               onClick={toggleStatus} 
               disabled={loading}
               className="h-8 text-xs"
             >
               {partner.status === "ativo" ? "Desativar" : "Reativar"}
             </Button>
          </div>
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-[color:var(--hairline)] grid grid-cols-2 sm:grid-cols-5 gap-3">
        <MiniStat icon={<MousePointerClick className="size-3.5" />} label="Cliques no link" value={m.cliques} hint={`${m.cliques30d} em 30 dias`} />
        <MiniStat icon={<Users className="size-3.5" />} label="Indicações" value={m.indicacoes} />
        <MiniStat icon={<CheckCircle2 className="size-3.5" />} label="Clientes ativos" value={m.ativos} tone="text-emerald-600" />
        <MiniStat icon={<Clock className="size-3.5" />} label="Em teste" value={m.trial} />
        <MiniStat icon={<AlertCircle className="size-3.5" />} label="Conversão" value={`${m.conversao}%`} />
      </div>

      {open && <PartnerDetailModal partner={partner} onClose={() => setOpen(false)} onChange={onUpdate} />}
    </Card>
  );
}

function MiniStat({ icon, label, value, hint, tone }: { icon: React.ReactNode; label: string; value: any; hint?: string; tone?: string }) {
  return (
    <div className="rounded-xl bg-muted/30 border border-[color:var(--hairline)] px-3 py-2">
      <div className="flex items-center gap-1.5 text-muted-foreground mb-0.5">
        {icon}
        <span className="text-[10px] uppercase tracking-wider font-medium truncate">{label}</span>
      </div>
      <p className={`text-base font-semibold ${tone ?? ""}`}>{value}</p>
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function PartnerDetailModal({ partner, onClose, onChange }: { partner: any; onClose: () => void; onChange: () => void }) {
  const details = useServerFn(getPartnerDetails);
  const listCompanies = useServerFn(listAssignableCompanies);
  const assign = useServerFn(assignCompanyToPartner);
  const unassign = useServerFn(unassignCompany);
  const [data, setData] = useState<any>(null);
  const [busca, setBusca] = useState("");
  const [options, setOptions] = useState<any[]>([]);
  const [showAssign, setShowAssign] = useState(false);

  async function reload() {
    try {
      setData(await details({ data: { partnerId: partner.id } }));
    } catch (e: any) {
      toast.error(e?.message);
    }
  }

  useEffect(() => {
    void reload();
    const ch = supabase
      .channel(`parceiro-detail-${partner.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "parceiro_indicacao" }, () => void reload())
      .on("postgres_changes", { event: "*", schema: "public", table: "parceiro_clique" }, () => void reload())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [partner.id]);

  useEffect(() => {
    if (!showAssign) return;
    const t = setTimeout(async () => {
      try {
        setOptions(await listCompanies({ data: { busca } }));
      } catch (e: any) {
        toast.error(e?.message);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [busca, showAssign]);

  const m = data?.metrics;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <Card className="w-full max-w-3xl max-h-[88vh] overflow-y-auto p-6 animate-in fade-in zoom-in duration-200">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="font-semibold text-lg">{partner.profile?.nome || partner.codigo_indicacao}</h2>
            <p className="text-xs text-muted-foreground">{partner.profile?.email}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="size-4" /></Button>
        </div>

        {!data ? (
          <div className="py-16 grid place-items-center"><Loader2 className="animate-spin" /></div>
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <MiniStat icon={<MousePointerClick className="size-3.5" />} label="Cliques" value={m.cliques} hint={`${m.cliques30d} em 30 dias`} />
              <MiniStat icon={<Users className="size-3.5" />} label="Indicações" value={m.indicacoes} />
              <MiniStat icon={<CheckCircle2 className="size-3.5" />} label="Ativos" value={m.ativos} tone="text-emerald-600" />
              <MiniStat icon={<AlertCircle className="size-3.5" />} label="Inadimplentes" value={m.inadimplentes} tone="text-amber-600" />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold">Clientes indicados</h3>
                <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setShowAssign((v) => !v)}>
                  <Plus className="size-3.5 mr-1" /> Atribuir cliente
                </Button>
              </div>

              {showAssign && (
                <div className="mb-3 rounded-xl border border-[color:var(--hairline)] p-3 bg-muted/20 space-y-2">
                  <Input placeholder="Buscar empresa pelo nome..." className="h-9" value={busca} onChange={(e) => setBusca(e.target.value)} />
                  <div className="max-h-52 overflow-y-auto divide-y divide-[color:var(--hairline)]">
                    {options.map((c) => (
                      <div key={c.id} className="flex items-center justify-between py-2">
                        <div className="min-w-0">
                          <p className="text-sm truncate">{c.nome}</p>
                          <p className="text-[11px] text-muted-foreground capitalize">{c.status_cobranca}</p>
                        </div>
                        <Button
                          size="sm"
                          className="h-7 text-xs"
                          onClick={async () => {
                            try {
                              await assign({ data: { partnerId: partner.id, companyId: c.id } });
                              toast.success("Cliente atribuído ao parceiro");
                              setShowAssign(false);
                              void reload();
                              onChange();
                            } catch (e: any) {
                              toast.error(e?.message);
                            }
                          }}
                        >
                          Atribuir
                        </Button>
                      </div>
                    ))}
                    {options.length === 0 && (
                      <p className="py-4 text-center text-xs text-muted-foreground">Nenhuma empresa disponível.</p>
                    )}
                  </div>
                </div>
              )}

              <div className="rounded-xl border border-[color:var(--hairline)] divide-y divide-[color:var(--hairline)]">
                {data.referrals.map((r: any) => (
                  <div key={r.id} className="flex items-center justify-between px-3 py-2.5">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Building2 className="size-3.5 text-muted-foreground" />
                        <p className="text-sm font-medium truncate">{r.company?.nome || "Empresa"}</p>
                        <Badge variant="outline" className="text-[10px] h-4 capitalize">{r.origem === "manual" ? "atribuído" : "link"}</Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Desde {new Date(r.created_at).toLocaleDateString("pt-BR")}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={r.company?.status_cobranca === "ativo" ? "default" : "secondary"} className="capitalize text-[10px]">
                        {r.company?.status_cobranca}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        onClick={async () => {
                          try {
                            await unassign({ data: { indicacaoId: r.id } });
                            toast.success("Vínculo removido");
                            void reload();
                            onChange();
                          } catch (e: any) {
                            toast.error(e?.message);
                          }
                        }}
                      >
                        <Trash2 className="size-3.5 text-muted-foreground" />
                      </Button>
                    </div>
                  </div>
                ))}
                {data.referrals.length === 0 && (
                  <p className="py-6 text-center text-xs text-muted-foreground">Nenhum cliente vinculado ainda.</p>
                )}
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5"><Link2 className="size-4" /> Últimos acessos ao link</h3>
              <div className="rounded-xl border border-[color:var(--hairline)] divide-y divide-[color:var(--hairline)] max-h-56 overflow-y-auto">
                {data.cliques.map((c: any) => (
                  <div key={c.id} className="px-3 py-2 flex items-center justify-between text-xs">
                    <span>{new Date(c.created_at).toLocaleString("pt-BR")}</span>
                    <span className="text-muted-foreground truncate max-w-[50%]">{c.referer || "acesso direto"}</span>
                  </div>
                ))}
                {data.cliques.length === 0 && (
                  <p className="py-6 text-center text-xs text-muted-foreground">Nenhum acesso registrado ainda.</p>
                )}
              </div>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

function AddPartnerModal({ onClose, onSave }: { onClose: () => void; onSave: () => void }) {
  const create = useServerFn(createPartner);
  const fetchProfiles = useServerFn(getAllProfiles);
  const [email, setEmail] = useState("");
  const [codigo, setCodigo] = useState("");
  const [comissao, setComissao] = useState(20);
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<any[]>([]);
  const [foundUser, setFoundUser] = useState<any>(null);

  useEffect(() => {
    void (async () => {
      try {
        const data = await fetchProfiles();
        if (data) setUsers(data);
      } catch (e: any) {
        toast.error("Erro ao carregar usuários: " + e.message);
      }
    })();
  }, []);

  function handleUserSelect(val: string) {
    setEmail(val);
    const user = users.find(u => u.email === val);
    if (user) {
      setFoundUser(user);
      if (!codigo) {
        setCodigo(user.nome?.split(" ")[0].toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "") || "");
      }
    } else {
      setFoundUser(null);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!foundUser) return toast.error("Selecione um usuário válido");
    setLoading(true);
    try {
      await create({
        data: {
          userId: foundUser.user_id,
          codigo: codigo.trim().toLowerCase(),
          comissao: Number(comissao)
        }
      });
      toast.success("Parceiro criado com sucesso");
      onSave();
      onClose();
    } catch (e: any) {
      toast.error(e?.message || "Erro ao criar parceiro");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <Card className="w-full max-w-md p-6 animate-in fade-in zoom-in duration-200">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-lg">Vincular Novo Parceiro</h2>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="size-4" /></Button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Selecionar Usuário (já cadastrado)</label>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              value={email}
              onChange={(e) => handleUserSelect(e.target.value)}
            >
              <option value="">Selecione um usuário...</option>
              {users.map(u => (
                <option key={u.user_id} value={u.email}>{u.nome} ({u.email})</option>
              ))}
            </select>
            {foundUser && (
              <div className="flex items-center gap-2 mt-1 p-2 bg-emerald-50 border border-emerald-100 rounded-md">
                <CheckCircle2 className="size-3 text-emerald-600" />
                <span className="text-[11px] text-emerald-700 font-medium">{foundUser.nome}</span>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Código de Indicação (Slug)</label>
            <Input 
              placeholder="ex: agenciamkt" 
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ""))}
            />
            <p className="text-[10px] text-muted-foreground">Usado no link: metrixcrm.com.br/entrar?ref=<b>{codigo || "codigo"}</b></p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Comissão Recorrente (%)</label>
            <Input 
              type="number"
              value={comissao}
              onChange={(e) => setComissao(Number(e.target.value))}
            />
          </div>

          <div className="pt-2 flex gap-3">
            <Button type="button" variant="ghost" className="flex-1" onClick={onClose}>Cancelar</Button>
            <Button type="submit" className="flex-1" disabled={loading || !foundUser}>
              {loading ? <Loader2 className="size-4 animate-spin mr-2" /> : <CheckCircle2 className="size-4 mr-2" />} 
              Vincular Parceiro
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

function WithdrawalsList() {
  const load = useServerFn(getWithdrawalRequests);
  const updateStatus = useServerFn(updateWithdrawalStatus);
  const [requests, setRequests] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);

  async function reload() {
    try {
      setRequests(await load());
    } catch (e: any) {
      toast.error(e?.message);
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  async function handleStatus(id: string, status: "aprovado" | "rejeitado") {
    setLoading(true);
    try {
      await updateStatus({ data: { id, status } });
      toast.success(`Solicitação ${status === "aprovado" ? "aprovada" : "rejeitada"}`);
      reload();
    } catch (e: any) {
      toast.error(e?.message);
    } finally {
      setLoading(false);
    }
  }

  if (!requests) return <div className="py-20 grid place-items-center"><Loader2 className="animate-spin" /></div>;

  const brl = (cents: number) =>
    (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <div className="grid gap-3">
      {requests.map((r) => (
        <Card key={r.id} className="p-4 rounded-2xl border-[color:var(--hairline)] bg-white shadow-sm overflow-hidden">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-full bg-brand-50 flex items-center justify-center">
                <Wallet className="size-5 text-brand-600" />
              </div>
              <div>
                <h3 className="font-semibold text-sm">{r.profile?.nome || "Parceiro"}</h3>
                <p className="text-[10px] text-muted-foreground">Slug: {r.parceiro?.codigo_indicacao}</p>
              </div>
            </div>
            <div className="flex items-center gap-6">
              <div className="text-right">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Valor</p>
                <p className="text-sm font-bold">{brl(r.valor_cents)}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Data</p>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="size-3" />
                  {new Date(r.created_at).toLocaleDateString("pt-BR")}
                </div>
              </div>
              <div>
                <Badge variant={r.status === "aprovado" ? "default" : r.status === "rejeitado" ? "destructive" : "secondary"}>
                  {r.status}
                </Badge>
              </div>
              {r.status === "pendente" && (
                <div className="flex items-center gap-2 border-l border-[color:var(--hairline)] pl-4">
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    className="h-8 w-8 p-0 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                    onClick={() => handleStatus(r.id, "aprovado")}
                    disabled={loading}
                  >
                    <ThumbsUp className="size-4" />
                  </Button>
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    className="h-8 w-8 p-0 text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                    onClick={() => handleStatus(r.id, "rejeitado")}
                    disabled={loading}
                  >
                    <ThumbsDown className="size-4" />
                  </Button>
                </div>
              )}
            </div>
          </div>
        </Card>
      ))}
      {requests.length === 0 && (
        <Card className="p-10 text-center border-dashed">
          <AlertCircle className="size-8 mx-auto text-muted-foreground mb-2 opacity-20" />
          <p className="text-sm text-muted-foreground">Nenhuma solicitação de saque encontrada.</p>
        </Card>
      )}
    </div>
  );
}

function PartnerSettings() {
  const update = useServerFn(updatePartnerConfig);
  const [minWithdraw, setMinWithdraw] = useState(50);
  const [defCommission, setDefCommission] = useState(20);
  const [loading, setLoading] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await update({
        data: {
          min_withdraw_cents: minWithdraw * 100,
          default_commission: defCommission
        }
      });
      toast.success("Configurações salvas");
    } catch (e: any) {
      toast.error(e?.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <Card className="p-6 rounded-2xl border-[color:var(--hairline)] bg-white shadow-sm">
        <div className="flex items-center gap-3 mb-6">
          <div className="size-10 rounded-full bg-slate-100 flex items-center justify-center">
            <Settings className="size-5 text-slate-600" />
          </div>
          <div>
            <h2 className="font-semibold text-base">Regras do Programa</h2>
            <p className="text-xs text-muted-foreground">Defina as regras globais para todos os parceiros.</p>
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-6">
          <div className="grid sm:grid-cols-2 gap-6">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Saque Mínimo (R$)</label>
              <Input 
                type="number" 
                value={minWithdraw}
                onChange={(e) => setMinWithdraw(Number(e.target.value))}
              />
              <p className="text-[10px] text-muted-foreground">Valor mínimo que o parceiro pode solicitar.</p>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Comissão Padrão (%)</label>
              <Input 
                type="number" 
                value={defCommission}
                onChange={(e) => setDefCommission(Number(e.target.value))}
              />
              <p className="text-[10px] text-muted-foreground">Sugestão de comissão para novos parceiros.</p>
            </div>
          </div>

          <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl flex items-start gap-3">
            <AlertCircle className="size-4 text-blue-600 mt-0.5 shrink-0" />
            <div className="space-y-1">
              <p className="text-[11px] font-semibold text-blue-900 leading-none">Importante</p>
              <p className="text-[10px] text-blue-700 leading-relaxed">
                As alterações aqui refletem na interface do parceiro e nas sugestões de novos vínculos, mas não alteram contratos de comissão já ativos individualmente.
              </p>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="size-4 animate-spin mr-2" />}
              Salvar Configurações
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}


