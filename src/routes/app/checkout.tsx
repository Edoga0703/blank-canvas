import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { brand } from "@/config/brand";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Coins,
  Copy,
  CreditCard,
  ExternalLink,
  Globe,
  Loader2,
  Lock,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { createCheckoutCompany } from "@/lib/checkout.functions";
import { listPublicPlansFn } from "@/lib/plan-admin.functions";
import {
  createPlanCheckoutBrlFn,
  requestManualUsdChargeFn,
} from "@/lib/plan-checkout.functions";
import { checkChargeStatus } from "@/lib/billing-checkout.functions";
import { extractEnabledModuleLabels } from "@/lib/plan-features";
import { trialDaysLeft } from "@/lib/tenant";
import { requirePermission } from "@/lib/route-guards";

type Search = {
  plano?: string;
  moeda?: "BRL" | "USD";
  ciclo?: "month" | "annual";
};

export const Route = createFileRoute("/app/checkout")({
  beforeLoad: ({ context }) => {
    if ((context as any)?.company) {
      requirePermission(context, "configuracoes.billing");
    }
  },
  validateSearch: (s: Record<string, unknown>): Search => ({
    plano: typeof s.plano === "string" ? s.plano : undefined,
    moeda: s.moeda === "USD" ? "USD" : s.moeda === "BRL" ? "BRL" : undefined,
    ciclo: s.ciclo === "annual" ? "annual" : s.ciclo === "month" ? "month" : undefined,
  }),
  head: () => ({ meta: [{ title: `${brand.name} — Ative seu plano` }] }),
  component: CheckoutPage,
});

function formatMoney(cents: number, currency: "BRL" | "USD") {
  if (currency === "USD") {
    return (Number(cents || 0) / 100).toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
    });
  }
  return (Number(cents || 0) / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function defaultCompanyName(email?: string | null) {
  const local = email?.split("@")[0]?.replace(/[._-]+/g, " ").trim();
  return local ? `Empresa de ${local}` : "Minha empresa";
}

function CheckoutPage() {
  const ctx = Route.useRouteContext();
  const navigate = useNavigate();
  const search = useSearch({ from: "/app/checkout" }) as Search;

  const createCompany = useServerFn(createCheckoutCompany);
  const fetchPublicPlans = useServerFn(listPublicPlansFn);
  const createBrlCharge = useServerFn(createPlanCheckoutBrlFn);
  const submitManualUsd = useServerFn(requestManualUsdChargeFn);
  const pollCharge = useServerFn(checkChargeStatus);

  const [plans, setPlans] = useState<any[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [selected, setSelected] = useState<string | null>(search.plano ?? null);
  const [currency, setCurrency] = useState<"BRL" | "USD">(search.moeda ?? "BRL");
  const [cycle, setCycle] = useState<"month" | "annual">(search.ciclo ?? "month");
  const [creating, setCreating] = useState(false);

  // Estado da cobrança gerada
  const [payingMethod, setPayingMethod] = useState<"pix" | "card" | "usd" | null>(null);
  const [activeCharge, setActiveCharge] = useState<any | null>(null);
  const [waiting, setWaiting] = useState(false);

  // USD Manual form
  const [usdMethod, setUsdMethod] = useState<"binance_usdt" | "zelle" | "pago_movil">("binance_usdt");
  const [usdRef, setUsdRef] = useState("");
  const [usdNotes, setUsdNotes] = useState("");

  const hasCompany = !!ctx.company;
  const daysLeft = ctx.company?.trial_ate ? trialDaysLeft(ctx.company.trial_ate) : 0;
  const trialActive = hasCompany && ctx.company!.status_cobranca === "trial" && daysLeft > 0;
  const paywallMode = hasCompany && ctx.company!.status_cobranca !== "ativo" && (!!search.plano || !trialActive);
  const podeAssinar = hasCompany && ctx.company!.status_cobranca !== "ativo";

  useEffect(() => {
    if (!ctx.company || search.plano) return;
    if (ctx.company.status_cobranca === "ativo") {
      navigate({
        to: ctx.company.onboarding_completed ? "/app/dashboard" : "/app/onboarding",
        replace: true,
      });
    }
  }, [ctx.company, navigate, search.plano]);

  useEffect(() => {
    let active = true;
    fetchPublicPlans()
      .then((res) => {
        if (!active) return;
        const list = Array.isArray(res) ? res : [];
        setPlans(list);
        if (!list.length) return;
        const initial =
          search.plano ||
          ctx.company?.selected_plan_slug ||
          list.find((p: any) => p.destaque)?.slug ||
          list[0].slug;
        setSelected((prev) => (prev && list.find((p: any) => p.slug === prev) ? prev : initial));

        if (list.length === 1 && !ctx.company && !creating) {
          setCreating(true);
          createCompany({
            data: { nome: defaultCompanyName(ctx.user.email), plano_slug: list[0].slug },
          })
            .then(() => {
              window.location.href = "/app/onboarding";
            })
            .catch((e: any) => {
              setCreating(false);
              toast.error(e?.message || "Falha ao iniciar teste");
            });
        }
      })
      .catch((e: any) => {
        toast.error(e?.message || "Erro ao carregar planos");
      })
      .finally(() => {
        if (active) setLoadingPlans(false);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!waiting || !ctx.company) return;
    const companyId = ctx.company.id;
    const timer = setInterval(async () => {
      try {
        if (activeCharge?.id && activeCharge?.provider !== "manual_usd") {
          const st: any = await pollCharge({ data: { id: activeCharge.id } });
          if (st?.status === "paid") {
            clearInterval(timer);
            toast.success("Pagamento confirmado! Liberando seu acesso...");
            window.location.href = ctx.company?.onboarding_completed ? "/app/dashboard" : "/app/onboarding";
            return;
          }
        }
        const { data: comp } = await supabase
          .from("company")
          .select("id, status_cobranca, onboarding_completed")
          .eq("id", companyId)
          .maybeSingle();
        if (comp?.status_cobranca === "ativo") {
          clearInterval(timer);
          toast.success("Plano ativado! Redirecionando...");
          window.location.href = comp.onboarding_completed ? "/app/dashboard" : "/app/onboarding";
        }
      } catch {
        // Silencioso no polling
      }
    }, 5000);
    return () => clearInterval(timer);
  }, [waiting, ctx.company, activeCharge, pollCharge]);

  const plano = useMemo(() => plans.find((p) => p.slug === selected) ?? plans[0] ?? null, [plans, selected]);

  const priceInfo = useMemo(() => {
    if (!plano) return { monthlyCents: 0, totalChargeCents: 0, pct: 20 };
    const pct = Number(plano.desconto_anual_pct ?? 20);
    const baseMonthly =
      currency === "USD" ? Number(plano.preco_usd_cents || 0) : Number(plano.preco_cents || 0);
    const annualMonthly =
      currency === "USD"
        ? Number(plano.preco_anual_usd_cents || Math.round(baseMonthly * (1 - pct / 100)))
        : Number(plano.preco_anual_brl_cents || Math.round(baseMonthly * (1 - pct / 100)));
    const monthlyCents = cycle === "annual" ? annualMonthly : baseMonthly;
    const totalChargeCents = cycle === "annual" ? monthlyCents * 12 : monthlyCents;
    return { monthlyCents, totalChargeCents, pct };
  }, [plano, currency, cycle]);

  async function iniciarTrial() {
    if (!plano) return toast.error("Selecione um plano.");
    setCreating(true);
    try {
      await createCompany({
        data: { nome: defaultCompanyName(ctx.user.email), plano_slug: plano.slug },
      });
      toast.success(`Teste grátis de ${plano.trial_days ?? 7} dias iniciado!`);
      window.location.href = "/app/onboarding";
    } catch (e: any) {
      toast.error(e?.message || "Falha ao iniciar teste");
    } finally {
      setCreating(false);
    }
  }

  async function pagarBrl(metodo: "pix" | "card") {
    if (!plano) return;
    setPayingMethod(metodo);
    try {
      const charge: any = await createBrlCharge({
        data: { planSlug: plano.slug, cycle, metodo },
      });
      setActiveCharge(charge);
      setWaiting(true);
      if (metodo === "card" && charge?.payment_url) {
        window.open(charge.payment_url, "_blank", "noopener,noreferrer");
      }
      toast.success(metodo === "pix" ? "QR Code PIX gerado!" : "Link de pagamento gerado!");
    } catch (e: any) {
      toast.error(e?.message || "Erro ao gerar cobrança AbacatePay");
    } finally {
      setPayingMethod(null);
    }
  }

  async function enviarComprovanteUsd(e: React.FormEvent) {
    e.preventDefault();
    if (!plano) return;
    if (!usdRef.trim()) {
      toast.error("Informe o número de referência / hash do pagamento.");
      return;
    }
    setPayingMethod("usd");
    try {
      const charge: any = await submitManualUsd({
        data: {
          planSlug: plano.slug,
          cycle,
          metodo: usdMethod,
          reference: usdRef.trim(),
          notes: usdNotes.trim() || undefined,
        },
      });
      setActiveCharge(charge);
      setWaiting(true);
      toast.success("Comprovante enviado! Aguardando aprovação em Conciliação.");
    } catch (err: any) {
      toast.error(err?.message || "Erro ao enviar comprovante");
    } finally {
      setPayingMethod(null);
    }
  }

  const maxDiscount = plans.reduce(
    (max, p) => Math.max(max, Number(p.desconto_anual_pct ?? 20)),
    20,
  );

  return (
    <div className="min-h-screen bg-slate-50 pb-16">
      <div className="relative z-10 flex items-center justify-between px-4 sm:px-8 pt-5 max-w-6xl mx-auto">
        <button
          onClick={() => navigate({ to: hasCompany ? "/app/configuracoes" : "/" })}
          className="group inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-primary transition-colors"
        >
          <ArrowLeft className="size-4 group-hover:-translate-x-0.5 transition-transform" />
          Voltar
        </button>
        {hasCompany && trialActive && (
          <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/app/dashboard" })}>
            Continuar no teste ({daysLeft}d)
          </Button>
        )}
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-8 pt-6 space-y-8">
        {/* Header */}
        <div className="text-center max-w-2xl mx-auto space-y-3">
          <Badge variant="outline" className="gap-1.5 px-3 py-1 bg-white">
            {paywallMode ? <Lock className="size-3.5" /> : <Sparkles className="size-3.5 text-primary" />}
            {paywallMode
              ? "Ative sua assinatura"
              : `${plano?.trial_days ?? 7} dias grátis sem cartão`}
          </Badge>
          <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-slate-900">
            {hasCompany ? "Escolha e ative seu plano" : "Comece seu teste gratuito"}
          </h1>
          <p className="text-sm sm:text-base text-slate-600">
            WhatsApp API Oficial Meta ($0 por conexão), WhatsApp QR Code, Instagram, Facebook, Telegram e Créditos de IA em um só CRM.
          </p>

          {/* Toggle Moeda & Ciclo */}
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <div className="inline-flex rounded-full border bg-white p-1 shadow-sm">
              <button
                type="button"
                onClick={() => {
                  setCurrency("BRL");
                  setActiveCharge(null);
                }}
                className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                  currency === "BRL" ? "bg-primary text-primary-foreground" : "text-slate-600"
                }`}
              >
                Brasil (R$ · PIX / Cartão)
              </button>
              <button
                type="button"
                onClick={() => {
                  setCurrency("USD");
                  setActiveCharge(null);
                }}
                className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-colors flex items-center gap-1 ${
                  currency === "USD" ? "bg-primary text-primary-foreground" : "text-slate-600"
                }`}
              >
                <Globe className="size-3.5" /> Venezuela / LATAM (US$)
              </button>
            </div>

            <div className="inline-flex rounded-full border bg-white p-1 shadow-sm">
              <button
                type="button"
                onClick={() => {
                  setCycle("month");
                  setActiveCharge(null);
                }}
                className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                  cycle === "month" ? "bg-slate-900 text-white" : "text-slate-600"
                }`}
              >
                Mensal
              </button>
              <button
                type="button"
                onClick={() => {
                  setCycle("annual");
                  setActiveCharge(null);
                }}
                className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                  cycle === "annual" ? "bg-slate-900 text-white" : "text-slate-600"
                }`}
              >
                Anual
                <span className="rounded-full bg-emerald-500 text-white text-[10px] px-2 py-0.5 font-bold">
                  -{maxDiscount}%
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Cards de Planos */}
        {loadingPlans ? (
          <div className="flex justify-center py-12">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div
            className={`grid grid-cols-1 gap-4 ${
              plans.length === 1 ? "max-w-lg mx-auto" : plans.length === 2 ? "md:grid-cols-2 max-w-4xl mx-auto" : "md:grid-cols-3"
            }`}
          >
            {plans.map((p) => {
              const isSelected = p.slug === plano?.slug;
              const pct = Number(p.desconto_anual_pct ?? 20);
              const baseM = currency === "USD" ? Number(p.preco_usd_cents || 0) : Number(p.preco_cents || 0);
              const annualM =
                currency === "USD"
                  ? Number(p.preco_anual_usd_cents || Math.round(baseM * (1 - pct / 100)))
                  : Number(p.preco_anual_brl_cents || Math.round(baseM * (1 - pct / 100)));
              const shownCents = cycle === "annual" ? annualM : baseM;
              const modules = extractEnabledModuleLabels(p.features, p.slug);

              return (
                <Card
                  key={p.id}
                  onClick={() => {
                    setSelected(p.slug);
                    setActiveCharge(null);
                  }}
                  className={`p-5 cursor-pointer transition-all flex flex-col justify-between gap-4 ${
                    isSelected
                      ? "border-2 border-primary ring-2 ring-primary/15 shadow-md bg-white"
                      : "hover:border-slate-300 bg-white/85"
                  }`}
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-lg text-slate-900">{p.nome}</span>
                      {p.destaque && (
                        <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30 text-[10px]">
                          Recomendado
                        </Badge>
                      )}
                    </div>
                    {p.descricao && <p className="text-xs text-slate-500">{p.descricao}</p>}

                    <div>
                      <div className="flex items-baseline gap-1">
                        <span className="text-3xl font-bold font-display text-slate-900">
                          {formatMoney(shownCents, currency)}
                        </span>
                        <span className="text-xs text-slate-500">/mês</span>
                      </div>
                      <div className="text-[11px] text-emerald-700 font-medium">
                        {cycle === "annual"
                          ? `Cobrança anual: ${formatMoney(shownCents * 12, currency)} (-${pct}%)`
                          : `${p.trial_days ?? 7} dias de teste grátis`}
                      </div>
                    </div>

                    <div className="space-y-1.5 pt-2 border-t text-xs text-slate-700">
                      <div className="flex items-center gap-2">
                        <Users className="size-3.5 text-primary shrink-0" />
                        <span>Até {p.limite_usuarios ?? 1} usuários</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="size-3.5 text-emerald-600 shrink-0" />
                        <span>{p.limite_conexoes_oficiais ?? 0} WhatsApp API Oficial Meta ($0)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <QrCode className="size-3.5 text-amber-600 shrink-0" />
                        <span>{p.limite_instancias ?? 0} WhatsApp QR Code (D-API)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Coins className="size-3.5 text-primary shrink-0" />
                        <span>
                          {Number(p.creditos_mensais ?? 0).toLocaleString("pt-BR")} créditos IA/mês
                        </span>
                      </div>
                      {modules.slice(0, 6).map((lbl) => (
                        <div key={lbl} className="flex items-center gap-2">
                          <Check className="size-3.5 text-emerald-600 shrink-0" />
                          <span>{lbl}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <Button
                    type="button"
                    variant={isSelected ? "default" : "outline"}
                    className="w-full"
                  >
                    {isSelected ? "Plano selecionado" : "Selecionar"}
                  </Button>
                </Card>
              );
            })}
          </div>
        )}

        {/* Área de Pagamento / Ativação do Plano Selecionado */}
        {plano && (
          <Card className="max-w-3xl mx-auto p-6 sm:p-8 space-y-5 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                  Resumo da assinatura
                </div>
                <h2 className="text-xl font-bold">
                  {plano.nome} · {cycle === "annual" ? "Anual (12 meses)" : "Mensal"}
                </h2>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-primary">
                  {formatMoney(priceInfo.totalChargeCents, currency)}
                </div>
                <div className="text-xs text-muted-foreground">
                  {cycle === "annual"
                    ? `Equivale a ${formatMoney(priceInfo.monthlyCents, currency)}/mês`
                    : "Renovação mensal"}
                </div>
              </div>
            </div>

            {!hasCompany ? (
              <div className="space-y-4">
                <p className="text-sm text-slate-600">
                  Ao iniciar seu teste gratuito, sua conta já recebe{" "}
                  <b>{Number(plano.creditos_trial ?? 300).toLocaleString("pt-BR")} créditos de IA</b> por{" "}
                  <b>{plano.trial_days ?? 7} dias</b> sem compromisso.
                </p>
                <Button
                  size="lg"
                  className="w-full gap-2"
                  disabled={creating}
                  onClick={iniciarTrial}
                >
                  {creating ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
                  Iniciar teste grátis ({plano.trial_days ?? 7} dias)
                </Button>
              </div>
            ) : !podeAssinar ? (
              <div className="text-center text-sm text-emerald-700 font-medium py-2">
                Sua empresa já possui uma assinatura ativa.
              </div>
            ) : activeCharge ? (
              <div className="space-y-4 rounded-xl border p-5 bg-slate-50">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 font-semibold">
                    <RefreshCw className="size-4 animate-spin text-primary" />
                    Aguardando confirmação do pagamento...
                  </div>
                  <Badge variant="outline">{activeCharge.status}</Badge>
                </div>

                {activeCharge.pix_qrcode && (
                  <div className="flex flex-col items-center gap-3 py-2">
                    <img
                      src={
                        String(activeCharge.pix_qrcode).startsWith("data:")
                          ? activeCharge.pix_qrcode
                          : `data:image/png;base64,${activeCharge.pix_qrcode}`
                      }
                      alt="QR Code PIX"
                      className="w-48 h-48 rounded-lg border bg-white p-2"
                    />
                    {activeCharge.pix_copia_cola && (
                      <div className="w-full flex gap-2">
                        <Input readOnly value={activeCharge.pix_copia_cola} className="font-mono text-xs bg-white" />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            navigator.clipboard?.writeText(activeCharge.pix_copia_cola);
                            toast.success("Código PIX copiado!");
                          }}
                        >
                          <Copy className="size-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                {activeCharge.payment_url && (
                  <div className="flex justify-center">
                    <Button asChild>
                      <a href={activeCharge.payment_url} target="_blank" rel="noopener noreferrer" className="gap-2">
                        Abrir tela de pagamento <ExternalLink className="size-4" />
                      </a>
                    </Button>
                  </div>
                )}

                {activeCharge.provider === "manual_usd" && (
                  <div className="text-sm text-slate-700 space-y-1">
                    <p className="flex items-center gap-2 font-medium text-emerald-700">
                      <CheckCircle2 className="size-4" /> Solicitação registrada para conferência financeira!
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Referência informada: <span className="font-mono">{activeCharge.external_id}</span>. Assim que aprovada pelo financeiro, seu plano e créditos serão liberados automaticamente.
                    </p>
                  </div>
                )}

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setActiveCharge(null);
                    setWaiting(false);
                  }}
                >
                  Escolher outra forma de pagamento
                </Button>
              </div>
            ) : currency === "BRL" ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Button
                    size="lg"
                    className="gap-2"
                    disabled={payingMethod !== null}
                    onClick={() => pagarBrl("pix")}
                  >
                    {payingMethod === "pix" ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <QrCode className="size-4" />
                    )}
                    Pagar com PIX (AbacatePay)
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    className="gap-2"
                    disabled={payingMethod !== null}
                    onClick={() => pagarBrl("card")}
                  >
                    {payingMethod === "card" ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <CreditCard className="size-4" />
                    )}
                    Pagar com Cartão (AbacatePay)
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground text-center">
                  Liberação instantânea após confirmação via PIX ou Cartão.
                </p>
              </div>
            ) : (
              <form onSubmit={enviarComprovanteUsd} className="space-y-4">
                <div className="rounded-lg border border-amber-500/30 bg-amber-50/70 p-3.5 text-xs text-amber-900 space-y-1">
                  <div className="font-semibold">Pagamento em Dólares (Venezuela / LATAM)</div>
                  <p>
                    Realize a transferência de <b>{formatMoney(priceInfo.totalChargeCents, "USD")}</b> via Binance Pay (USDT), Zelle ou Pago Móvil e informe o número de referência abaixo para validação.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {[
                    { id: "binance_usdt", label: "Binance Pay (USDT)" },
                    { id: "zelle", label: "Zelle (USD)" },
                    { id: "pago_movil", label: "Pago Móvil (VE)" },
                  ].map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setUsdMethod(m.id as any)}
                      className={`rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
                        usdMethod === m.id
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Referência / Order ID / Comprovante</Label>
                    <Input
                      required
                      value={usdRef}
                      onChange={(e) => setUsdRef(e.target.value)}
                      placeholder="Ex: TX98123456 ou email Zelle"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Observação (opcional)</Label>
                    <Input
                      value={usdNotes}
                      onChange={(e) => setUsdNotes(e.target.value)}
                      placeholder="Nome do titular ou horário"
                    />
                  </div>
                </div>

                <Button type="submit" size="lg" className="w-full gap-2" disabled={payingMethod !== null}>
                  {payingMethod === "usd" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="size-4" />
                  )}
                  Enviar comprovante USD para aprovação
                </Button>
              </form>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
