import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { brand } from "@/config/brand";
import {
  Loader2, ShieldCheck, ArrowLeft, Check, Lock, Sparkles, ExternalLink,
  ArrowRight, RefreshCw, CircleAlert, Infinity
} from "lucide-react";
import { createCheckoutCompany } from "@/lib/checkout.functions";
import { useServerFn } from "@tanstack/react-start";
import { trialDaysLeft } from "@/lib/tenant";

type Search = { plano?: string };

type Plano = {
  id: string;
  slug: string;
  nome: string;
  descricao: string | null;
  preco_cents: number;
  trial_days: number;
  checkout_url: string | null;
  destaque: boolean;
  limite_mensagens: number;
  limite_instancias: number;
  limite_usuarios: number;
  limite_contatos: number;
  features: string[];
};

export const Route = createFileRoute("/app/checkout")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    plano: typeof s.plano === "string" ? s.plano : undefined,
  }),
  head: () => ({ meta: [{ title: `${brand.name} — Ative seu plano` }] }),
  component: CheckoutPage,
});

function formatBRLParts(cents: number) {
  const [int, dec] = (cents / 100).toFixed(2).split(".");
  return { int: Number(int).toLocaleString("pt-BR"), dec };
}
function defaultCompanyName(email?: string | null) {
  const local = email?.split("@")[0]?.replace(/[._-]+/g, " ").trim();
  return local ? `Empresa de ${local}` : "Minha empresa";
}
function normalizeFeatureText(text: string) {
  if (/n[úu]meros? de whatsapp/i.test(text)) return "1 número de WhatsApp";
  if (/mensagens?|msgs?/i.test(text)) return "Mensagens IA ilimitadas";
  return text;
}
function buildCheckoutUrl(base: string, email?: string | null, companyId?: string | null) {
  try {
    const u = new URL(base);
    if (email) u.searchParams.set("email", email);
    if (companyId) u.searchParams.set("ref", companyId);
    // Parâmetro opcional para restringir métodos de pagamento em gateways que suportam
    u.searchParams.set("payment_methods", "pix,credit_card");
    u.searchParams.set("payment_method", "pix,credit_card");
    return u.toString();
  } catch {
    return base;
  }
}

function CheckoutPage() {
  const ctx = Route.useRouteContext();
  const navigate = useNavigate();
  const search = useSearch({ from: "/app/checkout" }) as Search;
  const createCompany = useServerFn(createCheckoutCompany);

  const [plans, setPlans] = useState<Plano[]>([]);
  const [selected, setSelected] = useState<string | null>(search.plano ?? null);
  const [creating, setCreating] = useState(false);
  const [waiting, setWaiting] = useState(false);

  const hasCompany = !!ctx.company;
  const trialActive =
    hasCompany && ctx.company!.status_cobranca === "trial" && trialDaysLeft(ctx.company!.trial_ate) > 0;
  const paywallMode =
    hasCompany && ctx.company!.status_cobranca !== "ativo" && (!!search.plano || !trialActive);
  // Quem já tem empresa (inclusive em teste) pode assinar antes do fim do trial.
  const podeAssinar = hasCompany && ctx.company!.status_cobranca !== "ativo";

  useEffect(() => {
    if (!ctx.company || search.plano) return;
    if (ctx.company.status_cobranca === "ativo") {
      navigate({ to: ctx.company.onboarding_completed ? "/app/dashboard" : "/app/onboarding", replace: true });
    }
  }, [ctx.company, navigate]);

  useEffect(() => {
    supabase.from("plan").select("*").eq("ativo", true).order("ordem").then(({ data }) => {
      if (data?.length) {
        const list = (data as Plano[]).filter((p) => p.slug !== "cortesia");
        setPlans(list);
        if (!list.length) return;
        const initial =
          search.plano ||
          ctx.company?.selected_plan_slug ||
          list.find((p) => p.destaque)?.slug ||
          list[0].slug;
        if (!selected || !list.find((p) => p.slug === selected)) setSelected(initial);

        if (list.length === 1 && !ctx.company && !creating) {
          const only = list[0];
          setCreating(true);
          createCompany({ data: { nome: defaultCompanyName(ctx.user.email), plano_slug: only.slug } })
            .then(() => { window.location.href = "/app/onboarding"; })
            .catch((e: any) => {
              setCreating(false);
              toast.error(e?.message || "Falha ao iniciar teste");
            });
        }
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!waiting || !ctx.company) return;
    const id = ctx.company.id;
    const interval = setInterval(async () => {
      const { data: comp } = await supabase
        .from("company")
        .select("id, status_cobranca, onboarding_completed")
        .eq("id", id)
        .maybeSingle();
      if (comp?.status_cobranca === "ativo") {
        clearInterval(interval);
        toast.success("Pagamento confirmado! Liberando seu acesso…");
        setTimeout(() => {
          window.location.href = comp.onboarding_completed ? "/app/dashboard" : "/app/onboarding";
        }, 800);
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [waiting, ctx.company]);

  const plano = useMemo(() => plans.find((p) => p.slug === selected), [plans, selected]);
  const price = plano ? formatBRLParts(plano.preco_cents) : { int: "0", dec: "00" };

  async function iniciarTrial() {
    if (!plano) return toast.error("Selecione um plano.");
    setCreating(true);
    try {
      await createCompany({ data: { nome: defaultCompanyName(ctx.user.email), plano_slug: plano.slug } });
      toast.success(`Teste grátis de ${plano.trial_days} dias iniciado!`);
      window.location.href = "/app/onboarding";
    } catch (e: any) {
      toast.error(e.message || "Falha ao iniciar teste");
    } finally {
      setCreating(false);
    }
  }

  async function pagarAgora() {
    if (!plano) return toast.error("Selecione um plano.");
    if (!plano.checkout_url) {
      return toast.error("Este plano ainda não tem link de checkout configurado. Avise o administrador.");
    }
    const url = buildCheckoutUrl(plano.checkout_url, ctx.user.email, ctx.company?.id ?? null);
    window.open(url, "_blank", "noopener,noreferrer");
    setWaiting(true);
  }

  const headerBadge = paywallMode
    ? { icon: <Lock className="size-3.5" />, text: "Seu período de teste terminou" }
    : { icon: <Sparkles className="size-3.5" />, text: `${plans[0]?.trial_days ?? 3} dias grátis sem cartão` };
  const headerTitle = paywallMode ? "Ative seu plano para continuar" : "Comece grátis em segundos";
  const headerSubtitle = paywallMode
    ? "Seus dados estão preservados e esperando por você. O acesso é liberado instantaneamente após a confirmação do pagamento."
    : "Escolha um plano para começar. Sem cartão — cobramos só se você decidir continuar depois do período de teste.";

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Ambient glow */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(60%_60%_at_50%_0%,rgba(11,34,254,0.10),transparent_70%)]" />

      {/* Top bar */}
      <div className="relative z-10 flex items-center justify-between px-4 sm:px-8 pt-5">
        <button
          onClick={() => navigate({ to: "/app/configuracoes" })}
          className="group inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-[#0B22FE] transition-colors"
        >
          <ArrowLeft className="size-4 group-hover:-translate-x-0.5 transition-transform" />
          Retornar
        </button>

        <div />

      </div>

      <div className="relative z-10 mx-auto max-w-xl px-4 sm:px-6 pb-16 pt-8 sm:pt-14">
        {/* Header */}
        <div className="text-center space-y-3 mb-6 sm:mb-8">
          {!paywallMode && (
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 border border-blue-100 text-[#0B22FE] text-[11px] font-bold uppercase tracking-wider">
              {headerBadge.icon}
              {headerBadge.text}
            </div>
          )}
          <h1 className="font-display text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight leading-tight">
            {headerTitle}
          </h1>
          <p className="text-slate-600 text-xs sm:text-sm leading-relaxed max-w-md mx-auto">
            {headerSubtitle}
          </p>
        </div>


        {plans.length === 0 || !plano ? (
          <div className="grid place-items-center py-24">
            <Loader2 className="size-6 animate-spin text-slate-400" />
          </div>
        ) : (
          <>
            {/* Pricing Card */}
            <div className="w-full bg-white rounded-3xl shadow-2xl shadow-blue-500/10 border border-slate-200 overflow-hidden relative">
              <div className="bg-[#0B22FE] py-2 text-center">
                <span className="text-white text-[10px] font-bold uppercase tracking-[0.2em]">
                  {plano.destaque ? "Melhor custo-benefício" : "Plano selecionado"}
                </span>
              </div>

              <div className="p-6 sm:p-10">
                <div className="flex flex-col items-center mb-8">
                  <span className="text-[#0B22FE] font-bold text-base sm:text-lg mb-2">{plano.nome}</span>
                  <div className="flex items-baseline gap-1">
                    <span className="text-xl sm:text-2xl font-bold text-slate-400">R$</span>
                    <span className="text-5xl sm:text-6xl font-black text-slate-900 tracking-tighter tabular-nums">
                      {price.int},{price.dec}
                    </span>
                    <span className="text-slate-500 font-medium text-base sm:text-lg">/mês</span>
                  </div>
                </div>


                {/* Features */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-3 gap-x-6 mb-8 sm:mb-10">
                  {(plano.features?.length ? plano.features.map(normalizeFeatureText) : [
                    "Todos os módulos",
                    "1 conexão WhatsApp",
                    `Até ${plano.limite_usuarios} usuários`,
                    "Mensagens IA ilimitadas",
                    "Contatos ilimitados",
                    "Suporte via WhatsApp",
                  ]).map((f) => (
                    <div key={f} className="flex items-center gap-3 text-slate-700 font-medium">
                      <div className="flex-shrink-0 size-5 rounded-full bg-blue-100 grid place-items-center">
                        <Check className="size-3 text-[#0B22FE]" strokeWidth={3} />
                      </div>
                      <span className="text-sm flex items-center gap-1">
                        {f.includes("ilimitadas") ? (
                          <>
                            {f.replace("ilimitadas", "")}
                            <Infinity className="size-3 -mt-0.5" />
                            ilimitadas
                          </>
                        ) : f.includes("ilimitados") ? (
                          <>
                            {f.replace("ilimitados", "")}
                            <Infinity className="size-3 -mt-0.5" />
                            ilimitados
                          </>
                        ) : f}
                      </span>
                    </div>
                  ))}
                </div>

                {/* CTA */}
                <div className="space-y-6">
                  {waiting ? (
                    <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-5 space-y-3">
                      <div className="flex items-center justify-center gap-3 text-sm font-medium text-[#0B22FE]">
                        <Loader2 className="size-4 animate-spin" />
                        Aguardando confirmação do pagamento…
                      </div>
                      <p className="text-xs text-slate-600 text-center leading-relaxed">
                        A página de pagamento abriu em outra aba. Assim que aprovado, liberamos seu acesso automaticamente.
                      </p>
                      {plano.checkout_url && (
                        <div className="flex justify-center">
                          <a
                            href={buildCheckoutUrl(plano.checkout_url, ctx.user.email, ctx.company?.id ?? null)}
                            target="_blank" rel="noreferrer"
                            className="text-xs text-[#0B22FE] hover:underline inline-flex items-center gap-1 font-semibold"
                          >
                            <RefreshCw className="size-3" /> Reabrir página de pagamento
                          </a>
                        </div>
                      )}
                    </div>
                  ) : paywallMode || podeAssinar ? (
                    <button
                      onClick={pagarAgora}
                      disabled={!plano.checkout_url}
                      className="w-full group relative flex items-center justify-center gap-3 py-4 sm:py-5 bg-[#0B22FE] hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-base sm:text-lg font-bold rounded-2xl shadow-[0_10px_30px_-10px_rgba(11,34,254,0.5)] transition-all active:scale-[0.98]"
                    >
                      {plano.checkout_url ? `Assinar ${plano.nome} agora` : "Plano sem checkout configurado"}
                      <ArrowRight className="size-5 group-hover:translate-x-1 transition-transform" />
                    </button>
                  ) : (
                    <button
                      onClick={iniciarTrial}
                      disabled={creating}
                      className="w-full group relative flex items-center justify-center gap-3 py-4 sm:py-5 bg-[#0B22FE] hover:bg-blue-700 disabled:opacity-60 text-white text-base sm:text-lg font-bold rounded-2xl shadow-[0_10px_30px_-10px_rgba(11,34,254,0.5)] transition-all active:scale-[0.98]"
                    >
                      {creating ? <Loader2 className="size-5 animate-spin" /> : <Sparkles className="size-5" />}
                      Começar {plano.trial_days} dias grátis
                    </button>
                  )}

                  <div className="flex justify-center">
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-tight">
                      <ShieldCheck className="size-3.5" />
                      Pagamento seguro via Kiwify
                    </div>
                  </div>

                </div>
              </div>
            </div>

            {/* Email notice */}
            {paywallMode && (
              <div className="mt-6 flex items-start gap-3 p-4 bg-amber-50 border border-amber-100 rounded-2xl">
                <CircleAlert className="size-4 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-900 leading-relaxed">
                  <strong>Importante:</strong> use o mesmo e-mail do cadastro{" "}
                  <span className="font-mono font-bold break-all">{ctx.user.email}</span>{" "}
                  na hora de pagar — é assim que a gente libera seu acesso.
                </p>
              </div>
            )}

            {/* Trust */}
            <div className="mt-8 flex flex-nowrap justify-center items-center gap-x-3 sm:gap-x-5 overflow-x-auto">
              <TrustItem>Cancele quando quiser</TrustItem>
              <TrustItem>Dados preservados</TrustItem>
              <TrustItem>Suporte humano</TrustItem>
            </div>

            {paywallMode && plano.checkout_url && !waiting && (
              <p className="mt-6 text-center text-[11px] text-slate-400">
                Ao clicar em assinar, você será redirecionado ao ambiente seguro da Kiwify em uma nova aba.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function PayTag({ children }: { children: React.ReactNode }) {
  return (
    <span className="px-2 py-1 rounded-md border border-slate-200 bg-white text-[10px] font-black text-slate-600 tracking-tight uppercase">
      {children}
    </span>
  );
}

function TrustItem({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1 text-slate-500 text-[9px] font-bold uppercase tracking-wider whitespace-nowrap">
      <ShieldCheck className="size-3" />
      {children}
    </div>

  );
}
