// Capiversa - Premium Visual Identity.
import { createFileRoute } from "@tanstack/react-router";
import { brand } from "@/config/brand";
import capiversaLogo from "@/assets/capi-conversa-logo-horizontal-black.png.asset.json";
import mascoteNotebook from "@/assets/capi-conversa-logo-horizontal-black.png.asset.json";
import mascoteOferta from "@/assets/capi-conversa-logo-horizontal-black.png.asset.json";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listPublicPlansFn } from "@/lib/plan-admin.functions";
import { extractEnabledModuleLabels } from "@/lib/plan-features";
import {
  Check,
  Bot,
  MessageSquareText,
  KanbanSquare,
  Calendar,
  Users,
  Zap,
  Shield,
  ArrowRight,
  Plus,
  Minus,
  
  TrendingUp,
  MessageCircle,
  Sparkles,
  LayoutDashboard,
  Megaphone,
  ShoppingBag,
} from "lucide-react";


const HOME_TITLE = "Capiversa — IA que atende WhatsApp e organiza o CRM";
const HOME_DESC =
  "Capiversa é uma plataforma de atendimento, vendas e CRM com IA, integrada ao Google Agenda para criar e gerenciar compromissos autorizados pelo usuário.";
const SITE_URL = "https://capiconversa.com";

const FAQ_QA = [
  { q: "Como o Agente de IA atende meus clientes no WhatsApp?", a: "Você conecta seu WhatsApp por QR Code e treina a IA em uma tela simples, contando sobre sua empresa, produtos e tom de voz. A partir daí ela responde 24/7 no módulo de Conversas, qualifica o lead e só passa pra humano quando precisa." },
  { q: "O CRM Kanban organiza os leads automaticamente?", a: "Sim. Cada conversa vira um card no funil e a IA move o lead pela etapa certa conforme a qualificação avança. Você acompanha vendas, follow-up e pós-venda em um Kanban visual, sem precisar preencher planilha." },
  { q: "Consigo agendar reuniões e compromissos com ajuda da IA?", a: "Consegue. O módulo de Agendamentos tem calendário próprio e a IA marca reuniões, consultas e serviços direto na conversa do WhatsApp — confirma horário, envia lembrete e atualiza o CRM." },
  { q: "Como funcionam as Campanhas e o Catálogo?", a: "Em Campanhas você dispara mensagens em massa segmentando pela etapa do CRM ou por tags de contato. No Catálogo você cadastra produtos e serviços com foto e preço, e a IA usa isso pra recomendar e vender dentro da conversa." },
  { q: "Posso ter vários atendentes e mais de um WhatsApp?", a: "Sim! Temos planos flexíveis para equipes de todos os tamanhos, com múltiplas conexões de WhatsApp API Oficial Meta e WhatsApp QR Code, Instagram, Facebook e Telegram, além de permissões granulares por usuário." },
];

export const Route = createFileRoute("/")({
  ssr: true,
  head: () => ({
    meta: [
      { title: HOME_TITLE },
      { name: "description", content: HOME_DESC },
      { property: "og:title", content: HOME_TITLE },
      { property: "og:description", content: HOME_DESC },
      { property: "og:url", content: SITE_URL + "/" },
      { property: "og:type", content: "website" },
       { name: "twitter:card", content: "summary" },
      { property: "og:site_name", content: brand.name },
    ],
    links: [{ rel: "canonical", href: SITE_URL + "/" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@graph": [
            { "@type": "Organization", name: brand.name, url: SITE_URL },
            { "@type": "WebSite", name: brand.name, url: SITE_URL },
            {
              "@type": "SoftwareApplication",
              name: brand.name,
              applicationCategory: "BusinessApplication",
              operatingSystem: "Web",
              description: HOME_DESC,
              offers: { "@type": "Offer", price: "79.90", priceCurrency: "BRL" },
            },
            {
              "@type": "FAQPage",
              mainEntity: FAQ_QA.map((it) => ({
                "@type": "Question",
                name: it.q,
                acceptedAnswer: { "@type": "Answer", text: it.a },
              })),
            },
          ],
        }),
      },
    ],
  }),
  component: Landing,
  errorComponent: ({ error }) => {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes("Você ainda não possui uma empresa") || msg.includes("500")) {
       window.location.href = "/entrar";
       return null;
    }
    return (
      <div className="p-8 text-center bg-white min-h-screen flex flex-col items-center justify-center">
        <div className="max-w-md w-full border border-gray-100 rounded-3xl p-8 shadow-sm">
          <h1 className="text-2xl font-black font-display text-[#334155] mb-4">Ops!</h1>
          <p className="mb-6 text-[#12263A]/70 text-sm leading-relaxed">
            Ocorreu um erro ao carregar a página.
          </p>
          <div className="bg-gray-50 p-4 rounded-xl text-xs text-left font-mono text-gray-500 mb-6 break-words border border-gray-100">
            {msg}
          </div>
          <button 
            onClick={() => window.location.reload()}
            className="w-full py-3 bg-primary text-primary-foreground rounded-full font-bold hover:scale-[1.02] transition-transform shadow-lg shadow-[#334155]/20"
          >
            Recarregar e tentar novamente
          </button>
        </div>
      </div>
    );
  }
});

const BLUE = "#334155";

async function goCta(path: string, plano: string = "pro") {
  if (path === "#planos") {
    const el = document.getElementById("planos");
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  if (path === "/entrar" || path.startsWith("/entrar?")) {
    const qs = path.includes("?") ? path.slice(path.indexOf("?")) : `?plano=${plano}`;
    try {
      const { data } = await supabase.auth.getUser();
      if (data.user) {
        window.location.href = `/app/checkout${qs}`;
        return;
      }
    } catch {}
    window.location.href = path === "/entrar" ? `/entrar?modo=signup&plano=${plano}` : path;
    return;
  }
  window.location.href = path;
}

function Landing() {
  return (
    <div
      className="public-surface min-h-screen w-full bg-[#F4F5F9] text-[#12263A] selection:bg-[#334155] selection:text-white antialiased overflow-x-hidden"
      style={{ fontFamily: "'Manrope', system-ui, sans-serif" }}
    >
      <Header />
      <main className="max-w-7xl w-full mx-auto flex flex-col gap-16 sm:gap-20 md:gap-28 px-4 md:px-8 pt-24 md:pt-28 pb-16 md:pb-20">
        <Hero />
        <Features />
        
        <HowItWorks />
        <CtaImpacto />
        <Pricing />
        <Faq />
      </main>
      <Footer />
      <style>{`
        html { scroll-behavior: smooth; }
        .font-display { font-family: 'Manrope', system-ui, sans-serif; letter-spacing: -0.02em; }
      `}</style>
    </div>
  );
}

function Header() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <header
      className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${
        scrolled ? "bg-white/80 backdrop-blur-xl border-b border-black/5" : "bg-transparent"
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 md:px-8 h-16 flex items-center justify-between gap-3">
        <a href="/" className="flex items-center min-w-0 shrink">
          <img src={capiversaLogo.url} alt="Capiversa" className="h-7 sm:h-8 md:h-9 w-auto" />
        </a>
        <nav className="hidden lg:flex items-center gap-8 text-sm font-medium text-[#12263A]/70">
          <a href="#como-funciona" className="hover:text-[#334155] transition-colors">Como funciona</a>
          <a href="#recursos" className="hover:text-[#334155] transition-colors">Recursos</a>
          <a href="#planos" className="hover:text-[#334155] transition-colors">Planos</a>
          <a href="#faq" className="hover:text-[#334155] transition-colors">FAQ</a>
        </nav>
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <button
            onClick={() => (window.location.href = "/entrar")}
            className="hidden sm:inline-flex px-3 md:px-4 py-2 text-sm font-semibold text-[#12263A]/80 hover:text-[#334155] transition-colors"
          >
            Entrar
          </button>
          <button
            onClick={() => goCta("/entrar")}
            className="px-3 sm:px-4 py-2 bg-primary text-primary-foreground rounded-full text-xs sm:text-sm font-bold hover:bg-primary/90 transition-colors whitespace-nowrap"
          >
            <span className="sm:hidden">Testar grátis</span>
            <span className="hidden sm:inline">Teste grátis por 7 dias</span>
          </button>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative grid grid-cols-1 lg:grid-cols-12 gap-8 md:gap-12 items-center">
      {/* Subtle grid background */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -mx-4 md:-mx-8 -my-10"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(11,34,254,0.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(11,34,254,0.06) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          maskImage:
            "radial-gradient(ellipse at center, rgba(0,0,0,1) 40%, rgba(0,0,0,0) 85%)",
          WebkitMaskImage:
            "radial-gradient(ellipse at center, rgba(0,0,0,1) 40%, rgba(0,0,0,0) 85%)",
        }}
      />

      <div className="lg:col-span-7 z-10 text-center lg:text-left">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[#334155]/20 bg-[#334155]/5 text-[#334155] text-xs sm:text-sm font-medium mb-5 md:mb-6">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#334155] opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-[#334155]"></span>
          </span>
          Venda mais, trabalhe menos
        </div>
        <h1 className="font-display font-black mb-5 md:mb-8" style={{ fontSize: "clamp(1.9rem, 5vw, 5.25rem)", lineHeight: 1.05, letterSpacing: "-0.035em" }}>
          Tenha o controle da sua operação. <span className="text-[#334155]">E transforme mais oportunidades em vendas.</span>
        </h1>
        <p className="text-base sm:text-lg md:text-xl text-[#12263A]/70 max-w-xl mx-auto lg:mx-0 mb-4 leading-relaxed">
          Não perca mais clientes por demora no atendimento. A Capiversa captura seus leads, qualifica em segundos e organiza tudo em um funil visual perfeito. Seu único trabalho será entregar o produto.
        </p>

        <div className="flex flex-wrap items-center justify-center lg:justify-start gap-4 md:gap-6">
          <button
            onClick={() => goCta("/entrar")}
            className="px-6 sm:px-8 py-3.5 sm:py-4 bg-primary text-primary-foreground rounded-full font-bold text-sm sm:text-base md:text-lg hover:scale-[1.03] transition-transform cursor-pointer shadow-lg shadow-[#334155]/25"
          >
            Teste grátis por 7 dias
          </button>
        </div>
      </div>

      <div className="lg:col-span-5 relative flex items-center justify-center min-h-[340px] sm:min-h-[420px] lg:min-h-[560px] w-full max-w-lg mx-auto lg:max-w-full">
        {/* Concentric dashed rings */}
        <div aria-hidden className="absolute inset-0 flex items-center justify-center">
          <div className="absolute w-[110%] aspect-square rounded-full border border-dashed border-[#334155]/15" />
          <div className="absolute w-[85%] aspect-square rounded-full border border-dashed border-[#334155]/25" />
          <div className="absolute w-[60%] aspect-square rounded-full border border-dashed border-[#334155]/30" />
          <div className="absolute w-[95%] aspect-square rounded-full bg-[#334155]/10 blur-3xl" />
        </div>

        <img
          src={mascoteNotebook.url}
          alt="Logo Capiversa"
          className="relative w-[75%] sm:w-[70%] lg:w-full max-w-md lg:max-w-full rounded-3xl bg-white p-5 h-auto object-contain drop-shadow-2xl lg:scale-115"
          loading="eager"
          decoding="async"
        />

        {/* Floating notification cards */}
        <div className="absolute top-2 left-0 md:-left-4 flex items-center gap-2 bg-white rounded-xl shadow-lg shadow-[#334155]/10 px-2.5 sm:px-3 py-1.5 sm:py-2 border border-[#334155]/10 animate-[float_6s_ease-in-out_infinite]">
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-[#334155] flex items-center justify-center text-white shrink-0">
            <MessageCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </div>
          <div className="text-left">
            <div className="text-[11px] sm:text-xs font-bold text-[#12263A]">Nova conversa</div>
            <div className="text-[9px] sm:text-[10px] text-[#12263A]/60">WhatsApp · há 2s</div>
          </div>
        </div>

        <div className="hidden sm:flex absolute top-8 -right-2 md:-right-12 items-center gap-2 bg-white rounded-xl shadow-lg shadow-[#334155]/10 px-3 py-2 border border-[#334155]/10 animate-[float_7s_ease-in-out_infinite_0.8s]">
          <div className="w-8 h-8 rounded-lg bg-[#334155]/10 flex items-center justify-center text-[#334155] shrink-0">
            <TrendingUp className="w-4 h-4" />
          </div>
          <div className="text-left">
            <div className="text-xs font-bold text-[#12263A]">+R$ 12.480 hoje</div>
            <div className="text-[10px] text-[#12263A]/60">↑ 23% vs ontem</div>
          </div>
        </div>


        <div className="absolute bottom-6 sm:bottom-16 left-0 md:-left-6 flex items-center gap-2 bg-white rounded-xl shadow-lg shadow-[#334155]/10 px-2.5 sm:px-3 py-1.5 sm:py-2 border border-[#334155]/10 animate-[float_8s_ease-in-out_infinite_1.4s]">
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-[#334155] flex items-center justify-center text-white shrink-0">
            <Sparkles className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </div>
          <div className="text-left">
            <div className="text-[11px] sm:text-xs font-bold text-[#12263A]">Sistema agiu</div>
            <div className="text-[9px] sm:text-[10px] text-[#12263A]/60">Lead qualificado</div>
          </div>
        </div>

        <div className="hidden sm:flex absolute top-[62%] right-0 md:-right-2 items-center gap-2 bg-white rounded-xl shadow-lg shadow-[#334155]/10 px-3 py-2 border border-[#334155]/10 animate-[float_6.5s_ease-in-out_infinite_0.4s]">
          <div className="w-8 h-8 rounded-lg bg-[#334155]/10 flex items-center justify-center text-[#334155] shrink-0">
            <Calendar className="w-4 h-4" />
          </div>
          <div className="text-left">
            <div className="text-xs font-bold text-[#12263A]">Reunião agendada</div>
            <div className="text-[10px] text-[#12263A]/60">Amanhã, 14h</div>
          </div>
        </div>

      </div>
    </section>
  );
}


function Metrics() {
  const items = [
    { v: "24/7", l: "Atendimento" },
    { v: "100%", l: "Automação CRM", blue: true },
    { v: "2 min", l: "Setup" },
    { v: "3x", l: "Mais conversão" },
  ];
  return (
    <section className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
      {items.map((it) => (
        <div
          key={it.l}
          className={`p-6 md:p-8 rounded-2xl ${
            it.blue
              ? "bg-primary text-primary-foreground shadow-xl shadow-[#334155]/20"
              : "bg-white border border-gray-200"
          }`}
        >
          <div
            className={`font-bold text-2xl md:text-3xl mb-1 font-display ${it.blue ? "" : "text-[#334155]"}`}
          >
            {it.v}
          </div>
          <div className={`text-xs md:text-sm uppercase tracking-wider font-bold ${it.blue ? "text-white/70" : "text-[#12263A]/60"}`}>
            {it.l}
          </div>
        </div>
      ))}
    </section>
  );
}

function HowItWorks() {
  const steps = [
    { n: "01", t: "Conecte seu WhatsApp", d: "Em 30 segundos sua conta está pronta. Sem configurações complexas ou APIs oficiais caras." },
    { n: "02", t: "Treine a IA em 1 clique", d: "Suba seu PDF ou cole seu site. A Capiversa aprende tudo sobre seu negócio instantaneamente." },
    { n: "03", t: "Veja a mágica no CRM", d: "Contatos salvos, leads qualificados e agenda cheia sem que você precise digitar uma palavra." },
  ];
  return (
    <section id="como-funciona" className="flex flex-col gap-10 md:gap-14">
      <div className="mx-auto max-w-3xl text-center">
        <div className="text-sm font-bold text-[#334155] uppercase tracking-widest mb-4">Agente de IA</div>
        <h2 className="font-bold font-display leading-[1.05] tracking-tight" style={{ fontSize: "clamp(1.75rem, 3.6vw, 3.75rem)" }}>
          Seu agente de IA trabalha por você, <span className="text-[#334155]">qualifica leads 24 horas por dia.</span>
        </h2>
        <p className="mt-5 text-base md:text-lg text-[#12263A]/60 mx-auto max-w-2xl">
          Enquanto você toma um café, a IA atende, entende e move cada lead pra frente no CRM — todos os dias, sem folga.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
        <div className="relative order-2 lg:order-1">
          <div className="absolute inset-0 bg-[#334155]/10 blur-3xl rounded-full" aria-hidden />
          <img
            src={mascoteNotebook.url}
            alt="Logo Capiversa"
            className="relative w-full h-auto max-w-xl mx-auto rounded-3xl bg-white p-6 shadow-sm"
          />
        </div>

        <ol className="order-1 lg:order-2 flex flex-col gap-4 sm:gap-6">
          {steps.map((s) => (
            <li
              key={s.n}
              className="group flex gap-4 sm:gap-5 p-5 sm:p-6 rounded-2xl bg-white border border-gray-200 hover:border-[#334155]/40 hover:shadow-lg hover:shadow-[#334155]/10 transition-all"
            >
              <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-[#334155] grid place-items-center text-white font-bold shrink-0 font-display group-hover:rotate-6 transition-transform">
                {s.n}
              </div>
              <div className="min-w-0">
                <h3 className="text-lg sm:text-xl font-bold mb-1.5 sm:mb-2 font-display">{s.t}</h3>
                <p className="text-sm sm:text-base text-[#12263A]/60 leading-relaxed">{s.d}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

const FEATURES_LIST = [
  {
    key: "dashboard",
    icon: LayoutDashboard,
    tag: "Visão geral",
    title: "Dashboard em tempo real",
    desc: "Todas as métricas que importam num painel só.",
  },
  {
    key: "conversas",
    icon: MessageSquareText,
    tag: "Inbox WhatsApp",
    title: "Conversas integradas",
    desc: "WhatsApp da empresa unificado, com IA e humano lado a lado.",
  },
  {
    key: "crm",
    icon: KanbanSquare,
    tag: "Pipeline",
    title: "CRM Kanban por funis",
    desc: "Venda, follow-up e pós-venda em etapas visuais.",
  },
  {
    key: "agente",
    icon: Bot,
    tag: "Inteligência",
    title: "Agente de IA",
    desc: "Qualifica, faz follow-up e vende no seu tom de voz.",
  },
  {
    key: "respostas",
    icon: Zap,
    tag: "Produtividade",
    title: "Respostas rápidas",
    desc: "Modelos com texto, áudio, imagem, vídeo e documento.",
  },
  {
    key: "agendamentos",
    icon: Calendar,
    tag: "Agenda",
    title: "Agendamentos com IA",
    desc: "Compromissos, serviços e reuniões numa agenda visual.",
  },
  {
    key: "campanhas",
    icon: Megaphone,
    tag: "Marketing",
    title: "Campanhas de disparo",
    desc: "Mensagens em massa segmentadas, com métricas de resposta.",
  },
  {
    key: "catalogo",
    icon: ShoppingBag,
    tag: "Vitrine",
    title: "Catálogo",
    desc: "Produtos e serviços que a IA oferta na hora certa.",
  },
];


function Features() {
  return (
    <section id="recursos" className="flex flex-col gap-12">
      <div className="mx-auto max-w-3xl text-center">
        <div className="text-sm font-bold text-[#334155] uppercase tracking-widest mb-4">Recursos</div>
        <h2 className="font-bold font-display leading-[1.05] tracking-tight" style={{ fontSize: "clamp(1.75rem, 3.6vw, 3.75rem)" }}>
          Uma plataforma. <span className="text-[#334155]">Oito módulos</span> que trabalham juntos.
        </h2>
        <p className="mt-5 text-base md:text-lg text-[#12263A]/60 mx-auto max-w-2xl">
          Do primeiro "oi" no WhatsApp até o pós-venda — tudo conversando entre si, sem gambiarra, sem plugin, sem outra assinatura.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {FEATURES_LIST.map((f, i) => {
          const FIcon = f.icon;
          const featured = i === 0;
          return (
            <div
              key={f.key}
              className={`group relative rounded-3xl p-6 md:p-7 border transition-all hover:-translate-y-1 hover:shadow-xl hover:shadow-[#334155]/10 flex flex-col gap-4 ${
                featured
                  ? "sm:col-span-2 lg:col-span-1 bg-primary border-primary text-primary-foreground"
                  : "bg-white border-gray-200 hover:border-[#334155]/40"
              }`}
            >
              <div className="flex items-center justify-between">
                <div
                  className={`w-12 h-12 rounded-2xl grid place-items-center shrink-0 ${
                    featured ? "bg-white/15" : "bg-[#334155]/10 group-hover:bg-[#334155] transition-colors"
                  }`}
                >
                  <FIcon
                    className={`w-6 h-6 ${featured ? "text-white" : "text-[#334155] group-hover:text-white transition-colors"}`}
                  />
                </div>
                <span
                  className={`text-[10px] font-bold uppercase tracking-widest ${
                    featured ? "text-white/70" : "text-[#334155]/70"
                  }`}
                >
                  {f.tag}
                </span>
              </div>
              <div>
                <h3 className={`text-xl font-bold font-display leading-tight ${featured ? "text-white" : "text-[#12263A]"}`}>
                  {f.title}
                </h3>
                <p className={`mt-2 text-sm leading-relaxed ${featured ? "text-white/80" : "text-[#12263A]/60"}`}>
                  {f.desc}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}



function formatCurrency(cents: number, currency: "BRL" | "USD") {
  if (currency === "USD") {
    return (Number(cents || 0) / 100).toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: Number(cents || 0) % 100 === 0 ? 0 : 2,
    });
  }
  return (Number(cents || 0) / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function Pricing() {
  const fetchPublicPlans = useServerFn(listPublicPlansFn);
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currency, setCurrency] = useState<"BRL" | "USD">("BRL");
  const [cycle, setCycle] = useState<"month" | "annual">("month");

  useEffect(() => {
    let active = true;
    fetchPublicPlans()
      .then((res) => {
        if (active && Array.isArray(res)) setPlans(res);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const maxDiscount = plans.reduce(
    (max, p) => Math.max(max, Number(p.desconto_anual_pct ?? 20)),
    20,
  );

  return (
    <section id="planos" className="relative flex flex-col items-center gap-10">
      <div className="text-center max-w-3xl space-y-4">
        <div className="text-sm font-bold text-[#334155] uppercase tracking-widest">
          Planos transparentes
        </div>
        <h2
          className="font-bold font-display leading-[1.05]"
          style={{ fontSize: "clamp(1.75rem, 3.6vw, 3.75rem)" }}
        >
          Escolha o plano ideal para sua <span className="text-[#334155]">operação.</span>
        </h2>
        <p className="text-[#12263A]/60">
          Comece grátis com créditos de IA inclusos e escale com WhatsApp API Oficial Meta ($0 por conexão), QR Code, Instagram, Facebook e Telegram.
        </p>

        {/* Controles Moeda (Brasil R$ / Venezuela-LATAM US$) + Ciclo (Mensal / Anual) */}
        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <div className="inline-flex rounded-full border border-gray-200 bg-white p-1 shadow-sm">
            <button
              type="button"
              onClick={() => setCurrency("BRL")}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                currency === "BRL"
                  ? "bg-primary text-primary-foreground"
                  : "text-[#12263A]/70 hover:text-[#12263A]"
              }`}
            >
              Brasil (R$)
            </button>
            <button
              type="button"
              onClick={() => setCurrency("USD")}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                currency === "USD"
                  ? "bg-primary text-primary-foreground"
                  : "text-[#12263A]/70 hover:text-[#12263A]"
              }`}
            >
              Venezuela / LATAM (US$)
            </button>
          </div>

          <div className="inline-flex rounded-full border border-gray-200 bg-white p-1 shadow-sm">
            <button
              type="button"
              onClick={() => setCycle("month")}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                cycle === "month"
                  ? "bg-[#12263A] text-white"
                  : "text-[#12263A]/70 hover:text-[#12263A]"
              }`}
            >
              Mensal
            </button>
            <button
              type="button"
              onClick={() => setCycle("annual")}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                cycle === "annual"
                  ? "bg-[#12263A] text-white"
                  : "text-[#12263A]/70 hover:text-[#12263A]"
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

      {loading && plans.length === 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-[440px] rounded-3xl border border-gray-200 bg-white/70 animate-pulse p-8" />
          ))}
        </div>
      ) : (
        <div
          className={`grid grid-cols-1 gap-6 w-full ${
            plans.length === 1
              ? "max-w-lg mx-auto"
              : plans.length === 2
              ? "md:grid-cols-2 max-w-4xl mx-auto"
              : "md:grid-cols-3"
          }`}
        >
          {plans.map((plan) => {
            const pct = Number(plan.desconto_anual_pct ?? 20);
            const monthlyCents =
              currency === "USD" ? Number(plan.preco_usd_cents || 0) : Number(plan.preco_cents || 0);
            const annualMonthlyCents =
              currency === "USD"
                ? Number(plan.preco_anual_usd_cents || Math.round(monthlyCents * (1 - pct / 100)))
                : Number(plan.preco_anual_brl_cents || Math.round(monthlyCents * (1 - pct / 100)));
            const displayCents = cycle === "annual" ? annualMonthlyCents : monthlyCents;
            const moduleLabels = extractEnabledModuleLabels(plan.features, plan.slug);
            const isPopular = Boolean(plan.destaque);

            const perks = [
              `Até ${plan.limite_usuarios ?? 1} usuários com permissões`,
              `${plan.limite_conexoes_oficiais ?? 0} conexões WhatsApp API Oficial Meta ($0)`,
              `${plan.limite_instancias ?? 0} ${Number(plan.limite_instancias ?? 0) === 1 ? "conexão" : "conexões"} WhatsApp QR Code`,
              `${Number(plan.creditos_mensais ?? 0).toLocaleString("pt-BR")} créditos de IA/mês (${Number(plan.creditos_trial ?? 300)} no trial)`,
              "Contatos e mensagens ilimitados",
              ...moduleLabels.filter(
                (lbl) => !lbl.startsWith("WhatsApp "),
              ),
            ];

            return (
              <div
                key={plan.id}
                className={`relative rounded-3xl p-7 sm:p-8 flex flex-col justify-between transition-all ${
                  isPopular
                    ? "bg-[#12263A] text-white border-2 border-[#334155] shadow-2xl shadow-[#12263A]/20"
                    : "bg-white text-[#12263A] border border-gray-200 shadow-lg shadow-[#334155]/5"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-4">
                    <div
                      className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest ${
                        isPopular ? "bg-white/15 text-white" : "bg-[#334155]/10 text-[#334155]"
                      }`}
                    >
                      {plan.nome}
                    </div>
                    {isPopular && (
                      <span className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-emerald-500 text-white">
                        Mais popular
                      </span>
                    )}
                  </div>

                  {plan.descricao && (
                    <p
                      className={`text-sm mb-5 min-h-[40px] ${
                        isPopular ? "text-white/75" : "text-[#12263A]/65"
                      }`}
                    >
                      {plan.descricao}
                    </p>
                  )}

                  <div className="flex items-baseline gap-1.5 mb-1">
                    <span className="text-4xl sm:text-5xl font-bold font-display">
                      {formatCurrency(displayCents, currency)}
                    </span>
                    <span className={isPopular ? "text-white/60 text-sm" : "text-[#12263A]/50 text-sm"}>
                      /mês
                    </span>
                  </div>

                  <div
                    className={`text-xs font-medium mb-6 ${
                      isPopular ? "text-emerald-300" : "text-emerald-700"
                    }`}
                  >
                    {cycle === "annual"
                      ? `Cobrança anual (${formatCurrency(displayCents * 12, currency)}/ano · -${pct}%)`
                      : `${plan.trial_days ?? 7} dias grátis · sem cartão`}
                  </div>

                  <ul className="space-y-2.5 mb-8 text-left">
                    {perks.map((item) => (
                      <li key={item} className="flex items-start gap-2.5 text-sm">
                        <div
                          className={`w-5 h-5 rounded-full grid place-items-center shrink-0 mt-0.5 ${
                            isPopular ? "bg-white/15" : "bg-[#334155]/10"
                          }`}
                        >
                          <Check className={`w-3 h-3 ${isPopular ? "text-emerald-300" : "text-[#334155]"}`} />
                        </div>
                        <span className={isPopular ? "text-white/90" : "text-[#12263A]/80"}>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div>
                  <button
                    type="button"
                    onClick={() =>
                      goCta(
                        `/entrar?modo=signup&plano=${encodeURIComponent(plan.slug)}&moeda=${currency}&ciclo=${cycle}`,
                      )
                    }
                    className={`w-full py-3.5 rounded-full font-bold text-sm sm:text-base transition-colors flex items-center justify-center gap-2 ${
                      isPopular
                        ? "bg-white text-[#12263A] hover:bg-white/90"
                        : "bg-primary text-primary-foreground hover:bg-primary/90"
                    }`}
                  >
                    Começar {plan.trial_days ?? 7} dias grátis <ArrowRight className="w-4 h-4" />
                  </button>
                  <div
                    className={`text-[11px] text-center mt-3 ${
                      isPopular ? "text-white/60" : "text-[#12263A]/50"
                    }`}
                  >
                    Sem fidelidade · Cancele quando quiser
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section id="faq" className="flex flex-col gap-12">
      <div className="mx-auto max-w-3xl text-center">
        <div className="text-sm font-bold text-[#334155] uppercase tracking-widest mb-4">FAQ</div>
        <h2 className="font-bold font-display leading-[1.05] tracking-tight" style={{ fontSize: "clamp(1.75rem, 3.6vw, 3.75rem)" }}>
          Dúvidas <span className="text-[#334155]">rápidas</span> sobre a plataforma.
        </h2>
        <p className="mt-5 text-base md:text-lg text-[#12263A]/60 mx-auto max-w-2xl">
          Como cada módulo trabalha por você — do primeiro contato no WhatsApp até o fechamento no CRM.
        </p>
      </div>
      <div className="max-w-3xl w-full mx-auto flex flex-col gap-3">
        {FAQ_QA.map((it, i) => {
          const isOpen = open === i;
          return (
            <button
              key={it.q}
              onClick={() => setOpen(isOpen ? null : i)}
              className={`text-left bg-white border rounded-2xl p-5 sm:p-6 transition-all ${
                isOpen ? "border-[#334155]/40 shadow-lg shadow-[#334155]/5" : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <div className="flex items-center justify-between gap-4">
                <div className="font-bold text-base md:text-lg font-display">{it.q}</div>
                <div className={`w-8 h-8 rounded-full grid place-items-center shrink-0 transition-colors ${isOpen ? "bg-primary text-primary-foreground" : "bg-gray-100 text-[#12263A]/60"}`}>
                  {isOpen ? <Minus className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                </div>
              </div>
              {isOpen && <p className="text-[#12263A]/70 leading-relaxed mt-4">{it.a}</p>}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function CtaImpacto() {
  return (
    <section className="relative overflow-hidden rounded-[1.75rem] sm:rounded-[2rem] md:rounded-[2.5rem] bg-gradient-to-br from-[#334155] via-[#25364B] to-[#12263A] px-6 py-10 sm:p-10 md:p-16 text-white">
      <div className="absolute inset-0 opacity-[0.12]" style={{ backgroundImage: "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)", backgroundSize: "48px 48px" }} />
      <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full bg-white/10 blur-3xl" />
      <div className="absolute -bottom-32 -left-32 w-96 h-96 rounded-full bg-[#334155]/40 blur-3xl" />
      <div className="relative z-10 max-w-4xl mx-auto flex flex-col items-center text-center gap-6 sm:gap-8">
        <span className="inline-flex items-center gap-2 px-3 sm:px-4 py-1.5 rounded-full border border-white/20 bg-white/10 backdrop-blur text-[10px] sm:text-xs font-semibold uppercase tracking-[0.2em]">
          Chega de perder venda no WhatsApp
        </span>
        <h2 className="font-display font-black leading-[1.05]" style={{ fontSize: "clamp(1.75rem, 4.5vw, 4.5rem)" }}>
          Enquanto você lê isso, um lead seu está sendo <span className="text-white/60">ignorado</span>.
        </h2>
        <p className="text-base sm:text-lg md:text-xl text-white/80 max-w-2xl leading-relaxed">
          A Capiversa responde, qualifica e agenda no automático — 24 horas por dia. Você entra na conversa só quando o cliente está pronto para comprar.
        </p>
        <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-4 pt-2 w-full sm:w-auto">
          <button onClick={() => goCta("#planos")} className="w-full sm:w-auto px-6 sm:px-8 py-3.5 sm:py-4 rounded-2xl bg-white text-[#334155] font-bold text-sm sm:text-base shadow-2xl shadow-black/30 hover:scale-[1.03] transition-transform">
            Ver planos e começar agora →
          </button>
          <span className="text-xs sm:text-sm text-white/70">Teste grátis por 7 dias · sem cartão</span>
        </div>
      </div>
    </section>
  );
}


function Footer() {
  return (
    <footer className="border-t border-black/5 bg-white">
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="flex items-center gap-3">
          <img src={capiversaLogo.url} alt="Capiversa" className="h-7 w-auto" />
          <span className="text-sm text-[#12263A]/40">© {new Date().getFullYear()}</span>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-[#12263A]/60">
          <a href="/termos" className="hover:text-[#334155]">Termos</a>
          <a href="/privacidade" className="hover:text-[#334155]">Privacidade</a>
          <a href="/reembolso" className="hover:text-[#334155]">Reembolso</a>
          <a href="/entrar" className="hover:text-[#334155]">Entrar</a>
        </div>
      </div>
    </footer>
  );
}
