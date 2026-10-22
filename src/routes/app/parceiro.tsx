import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Users, 
  TrendingUp, 
  Wallet, 
  Copy, 
  ExternalLink, 
  CheckCircle2, 
  Loader2,
  Clock,
  ArrowRight
} from "lucide-react";
import { brand } from "@/config/brand";
import { getPartnerReferralStats, requestPartnerWithdrawal } from "@/lib/parceiros-client.functions";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

export const Route = createFileRoute("/app/parceiro")({
  head: () => ({
    meta: [
      { title: `${brand.name} — Painel de Parceiro` },
      { name: "description", content: "Monitore suas indicações e comissões." },
    ],
  }),
  component: PartnerClientDashboard,
});

function PartnerClientDashboard() {
  const load = useServerFn(getPartnerReferralStats);
  const reqWithdraw = useServerFn(requestPartnerWithdrawal);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedRef, setSelectedRef] = useState<any | null>(null);

  async function reload(silent = true) {
    if (!silent) setLoading(true);
    try {
      setData(await load());
    } catch (e: any) {
      if (!silent) toast.error(e?.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
    const ch = supabase
      .channel("portal-parceiro-rt")
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

  if (loading) return <div className="py-20 grid place-items-center"><Loader2 className="animate-spin" /></div>;

  if (!data) {
    return (
      <Card className="p-10 text-center border-dashed max-w-2xl mx-auto mt-10">
        <Users className="size-12 mx-auto text-muted-foreground mb-4 opacity-20" />
        <h2 className="text-xl font-semibold mb-2">Você ainda não é um parceiro</h2>
        <p className="text-muted-foreground mb-6">
          Entre em contato com o suporte para ativar seu painel de parceiro e começar a lucrar com indicações.
        </p>
        <Button onClick={() => window.open(`https://wa.me/5511999999999`, "_blank")}>
          Falar com suporte
        </Button>
      </Card>
    );
  }

  const { partner, referrals } = data;
  const m = data.metrics ?? { cliques: 0, cliques30d: 0, indicacoes: referrals.length, ativos: 0, trial: 0, inadimplentes: 0, conversao: 0 };
  const brl = (cents: number) =>
    (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const referralUrl = `${window.location.origin}/entrar?ref=${partner.codigo_indicacao}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-[26px] leading-tight tracking-tight">Portal do Parceiro</h1>
          <p className="text-sm text-muted-foreground">Bem-vindo, {partner.codigo_indicacao}! Acompanhe seu crescimento.</p>
        </div>
        <div className="flex items-center gap-2 bg-white p-2 rounded-xl border border-[color:var(--hairline)] shadow-sm">
          <div className="px-3 py-1.5 bg-muted/50 rounded-lg flex items-center gap-3">
            <code className="text-xs font-mono font-bold text-brand-700">{referralUrl}</code>
            <button 
              onClick={() => {
                navigator.clipboard.writeText(referralUrl);
                toast.success("Link copiado!");
              }}
              className="text-muted-foreground hover:text-brand-600 transition-colors"
            >
              <Copy className="size-4" />
            </button>
          </div>
          <Button size="sm" onClick={() => window.open(referralUrl, "_blank")} variant="ghost">
            <ExternalLink className="size-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card className="p-5 rounded-2xl border-[color:var(--hairline)] bg-white shadow-sm">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <Users className="size-4" />
            <span className="text-xs font-medium uppercase tracking-wider">Indicações</span>
          </div>
          <div className="text-3xl font-bold">{referrals.length}</div>
          <p className="text-[11px] text-muted-foreground mt-1">Total de empresas indicadas</p>
        </Card>

        <Card className="p-5 rounded-2xl border-[color:var(--hairline)] bg-white shadow-sm">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <TrendingUp className="size-4" />
            <span className="text-xs font-medium uppercase tracking-wider">Comissão Acumulada</span>
          </div>
          <div className="text-3xl font-bold">{brl(partner.total_acumulado_cents)}</div>
          <p className="text-[11px] text-muted-foreground mt-1">{partner.porcentagem_comissao}% de cada pagamento</p>
        </Card>

        <Card className="p-5 rounded-2xl border-[color:var(--hairline)] bg-[#0B22FE] text-white shadow-lg shadow-blue-500/20">
          <div className="flex items-center gap-2 text-white/70 mb-2">
            <Wallet className="size-4" />
            <span className="text-xs font-medium uppercase tracking-wider">Saldo Disponível</span>
          </div>
          <div className="text-3xl font-bold">{brl(partner.saldo_atual_cents)}</div>
          <Button 
            variant="secondary" 
            size="sm" 
            className="w-full mt-3 h-8 text-xs font-bold" 
            disabled={partner.saldo_atual_cents < 5000}
            onClick={async () => {
              try {
                await reqWithdraw({ data: { amountCents: partner.saldo_atual_cents } });
                toast.success("Solicitação enviada com sucesso!");
                reload();
              } catch (e: any) {
                toast.error(e?.message || "Erro ao solicitar saque");
              }
            }}
          >
            Solicitar Saque
          </Button>
        </Card>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Cliques no link", value: m.cliques, hint: `${m.cliques30d} nos últimos 30 dias` },
          { label: "Conversão", value: `${m.conversao}%`, hint: "cliques que viraram cliente" },
          { label: "Clientes ativos", value: m.ativos, hint: "assinaturas em dia" },
          { label: "Em teste / atraso", value: `${m.trial} / ${m.inadimplentes}`, hint: "trial e inadimplentes" },
        ].map((s) => (
          <Card key={s.label} className="p-4 rounded-2xl border-[color:var(--hairline)] bg-white shadow-sm">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{s.label}</p>
            <p className="text-2xl font-bold mt-1">{s.value}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">{s.hint}</p>
          </Card>
        ))}
      </div>

      <Card className="rounded-2xl border-[color:var(--hairline)] bg-white shadow-sm overflow-hidden">
        <div className="p-4 border-b border-[color:var(--hairline)] flex items-center justify-between">
          <h2 className="font-semibold text-sm">Empresas Indicadas</h2>
          <Badge variant="outline">{referrals.length} Clientes</Badge>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-[11px] text-muted-foreground uppercase font-bold tracking-wider">
              <tr>
                <th className="text-left px-6 py-3">Empresa</th>
                <th className="text-left px-6 py-3">Data Adesão</th>
                <th className="text-left px-6 py-3">Status</th>
                <th className="text-right px-6 py-3">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--hairline)]">
              {referrals.map((ref: any) => (
                <tr key={ref.id} className="hover:bg-muted/10 transition-colors">
                  <td className="px-6 py-4">
                    <div className="font-medium text-slate-900">{ref.company?.nome || "Empresa"}</div>
                    <div className="text-[10px] text-muted-foreground">ID: {ref.company_id.split("-")[0]}</div>
                  </td>
                  <td className="px-6 py-4 text-muted-foreground">
                    {new Date(ref.created_at).toLocaleDateString("pt-BR")}
                  </td>
                  <td className="px-6 py-4">
                    <Badge variant={ref.company?.status_cobranca === "ativo" ? "default" : "secondary"} className="capitalize">
                      {ref.company?.status_cobranca}
                    </Badge>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                      <ArrowRight className="size-4 text-muted-foreground" />
                    </Button>
                  </td>
                </tr>
              ))}
              {referrals.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-10 text-center text-muted-foreground italic">
                    Nenhuma indicação realizada ainda. Comece a compartilhar seu link!
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-6 rounded-2xl border-[color:var(--hairline)] bg-white shadow-sm">
        <div className="flex items-start gap-4">
          <div className="size-10 rounded-full bg-brand-50 flex items-center justify-center shrink-0">
            <ExternalLink className="size-5 text-brand-600" />
          </div>
          <div className="space-y-1">
            <h3 className="font-semibold text-sm">Acesso dos seus indicados</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Sempre que você indicar um cliente, ele deve se cadastrar através do seu <b>link exclusivo</b>. 
              Isso garante que o sistema vincule a conta dele à sua agência para o pagamento de comissões recorrentes.
            </p>
          </div>
        </div>
      </Card>
      <Dialog open={!!selectedRef} onOpenChange={(open) => !open && setSelectedRef(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Detalhes da Indicação</DialogTitle>
            <DialogDescription>Informações da empresa indicada e comissão.</DialogDescription>
          </DialogHeader>
          {selectedRef && (
            <div className="space-y-4 pt-2 text-sm">
              <div className="flex justify-between border-b pb-2">
                <span className="text-muted-foreground">Empresa:</span>
                <span className="font-semibold">{selectedRef.company?.nome || "Empresa Cadastrada"}</span>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span className="text-muted-foreground">ID da Conta:</span>
                <span className="font-mono text-xs">{selectedRef.company_id}</span>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span className="text-muted-foreground">Data de Cadastro:</span>
                <span>{new Date(selectedRef.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}</span>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span className="text-muted-foreground">Status de Cobrança:</span>
                <Badge variant={selectedRef.company?.status_cobranca === "ativo" ? "default" : "secondary"}>
                  {selectedRef.company?.status_cobranca || "pendente"}
                </Badge>
              </div>
              <div className="flex justify-between pt-1">
                <span className="text-muted-foreground">Comissão Estimada:</span>
                <span className="font-bold text-emerald-600">
                  {selectedRef.company?.status_cobranca === "ativo" ? "Ativa (Recorrente)" : "Aguardando ativação do plano"}
                </span>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
