// Metrix CRM - Premium Visual Identity.
import { createFileRoute } from "@tanstack/react-router";
import { brand } from "@/config/brand";
import metrixLogo from "@/assets/metrix-logo.png.asset.json";
import metrixMascot from "@/assets/metrix-mascot.png.asset.json";
import mascoteNotebook from "@/assets/mascote-notebook-v2.png.asset.json";
import mascoteOferta from "@/assets/mascote-oferta.png.asset.json";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
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


const HOME_TITLE = "Metrix CRM — IA que atende WhatsApp e organiza o CRM";
const HOME_DESC =
  "Metrix CRM é uma plataforma de atendimento, vendas e CRM com IA, integrada ao Google Agenda para criar e gerenciar compromissos autorizados pelo usuário.";
const SITE_URL = "https://metrixcrm.com.br";

const FAQ_QA = [
  { q: "Como o Agente de IA atende meus clientes no WhatsApp?", a: "Você conecta seu WhatsApp por QR Code e treina a IA em uma tela simples, contando sobre sua empresa, produtos e tom de voz. A partir daí ela responde 24/7 no módulo de Conversas, qualifica o lead e só passa pra humano quando precisa." },
  { q: "O CRM Kanban organiza os leads automaticamente?", a: "Sim. Cada conversa vira um card no funil e a IA move o lead pela etapa certa conforme a qualificação avança. Você acompanha vendas, follow-up e pós-venda em um Kanban visual, sem precisar preencher planilha." },
  { q: "Consigo agendar reuniões e compromissos com ajuda da IA?", a: "Consegue. O módulo de Agendamentos tem calendário próprio e a IA marca reuniões, consultas e serviços direto na conversa do WhatsApp — confirma horário, envia lembrete e atualiza o CRM." },
  { q: "Como funcionam as Campanhas e o Catálogo?", a: "Em Campanhas você dispara mensagens em massa segmentando pela etapa do CRM ou por tags de contato. No Catálogo você cadastra produtos e serviços com foto e preço, e a IA usa isso pra recomendar e vender dentro da conversa." },
  { q: "Posso ter vários atendentes e mais de um WhatsApp?", a: "O plano inclui até 3 usuários e 1 conexão de WhatsApp. Cada atendente entra com login próprio, usa Respostas Rápidas com áudio/vídeo/imagem, e você controla permissões pelo módulo de Configurações." },
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
          <h1 className="text-2xl font-black font-display text-[#0B22FE] mb-4">Ops!</h1>
          <p className="mb-6 text-[#0A0A0F]/70 text-sm leading-relaxed">
            Ocorreu um erro ao carregar a página.
          </p>
          <div className="bg-gray-50 p-4 rounded-xl text-xs text-left font-mono text-gray-500 mb-6 break-words border border-gray-100">
            {msg}
          </div>
          <button 
            onClick={() => window.location.reload()}
            className="w-full py-3 bg-[#0B22FE] text-white rounded-full font-bold hover:scale-[1.02] transition-transform shadow-lg shadow-[#0B22FE]/20"
          >
            Recarregar e tentar novamente
          </button>
        </div>
      </div>
    );
  }
});

const BLUE = "#0B22FE";

async function goCta(path: "/entrar" | "#planos", plano: string = "pro") {
  if (path === "#planos") {
    const el = document.getElementById("planos");
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  if (path === "/entrar") {
    try {
      const { data } = await supabase.auth.getUser();
      if (data.user) {
        window.location.href = `/app/checkout?plano=${plano}`;
        return;
      }
    } catch {}
    window.location.href = `/entrar?modo=signup&plano=${plano}`;
    return;
  }
  window.location.href = path;
}

function Landing() {
  return (
    <div
      className="min-h-screen w-full bg-[#F4F5F9] text-[#0A0A0F] selection:bg-[#0B22FE] selection:text-white antialiased overflow-x-hidden"
      style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}
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
        .font-display { font-family: 'Space Grotesk', system-ui, sans-serif; letter-spacing: -0.02em; }
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
          <img src={metrixLogo.url} alt="Metrix CRM" className="h-7 sm:h-8 md:h-9 w-auto" />
        </a>
        <nav className="hidden lg:flex items-center gap-8 text-sm font-medium text-[#0A0A0F]/70">
          <a href="#como-funciona" className="hover:text-[#0B22FE] transition-colors">Como funciona</a>
          <a href="#recursos" className="hover:text-[#0B22FE] transition-colors">Recursos</a>
          <a href="#planos" className="hover:text-[#0B22FE] transition-colors">Planos</a>
          <a href="#faq" className="hover:text-[#0B22FE] transition-colors">FAQ</a>
        </nav>
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <button
            onClick={() => (window.location.href = "/entrar")}
            className="hidden sm:inline-flex px-3 md:px-4 py-2 text-sm font-semibold text-[#0A0A0F]/80 hover:text-[#0B22FE] transition-colors"
          >
            Entrar
          </button>
          <button
            onClick={() => goCta("/entrar")}
            className="px-3 sm:px-4 py-2 bg-[#0B22FE] text-white rounded-full text-xs sm:text-sm font-bold hover:bg-blue-700 transition-colors whitespace-nowrap"
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
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[#0B22FE]/20 bg-[#0B22FE]/5 text-[#0B22FE] text-xs sm:text-sm font-medium mb-5 md:mb-6">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#0B22FE] opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-[#0B22FE]"></span>
          </span>
          Venda mais, trabalhe menos
        </div>
        <h1 className="font-display font-black mb-5 md:mb-8" style={{ fontSize: "clamp(1.9rem, 5vw, 5.25rem)", lineHeight: 1.05, letterSpacing: "-0.035em" }}>
          Tenha o controle da sua operação. <span className="text-[#0B22FE]">E transforme mais oportunidades em vendas.</span>
        </h1>
        <p className="text-base sm:text-lg md:text-xl text-[#0A0A0F]/70 max-w-xl mx-auto lg:mx-0 mb-4 leading-relaxed">
          Não perca mais clientes por demora no atendimento. A Metrix captura seus leads, qualifica em segundos e organiza tudo em um funil visual perfeito. Seu único trabalho será entregar o produto.
        </p>

        <div className="flex flex-wrap items-center justify-center lg:justify-start gap-4 md:gap-6">
          <button
            onClick={() => goCta("/entrar")}
            className="px-6 sm:px-8 py-3.5 sm:py-4 bg-[#0B22FE] text-white rounded-full font-bold text-sm sm:text-base md:text-lg hover:scale-[1.03] transition-transform cursor-pointer shadow-lg shadow-[#0B22FE]/25"
          >
            Teste grátis por 7 dias
          </button>
        </div>
      </div>

      <div className="lg:col-span-5 relative flex items-center justify-center min-h-[340px] sm:min-h-[420px] lg:min-h-[560px] w-full max-w-lg mx-auto lg:max-w-full">
        {/* Concentric dashed rings */}
        <div aria-hidden className="absolute inset-0 flex items-center justify-center">
          <div className="absolute w-[110%] aspect-square rounded-full border border-dashed border-[#0B22FE]/15" />
          <div className="absolute w-[85%] aspect-square rounded-full border border-dashed border-[#0B22FE]/25" />
          <div className="absolute w-[60%] aspect-square rounded-full border border-dashed border-[#0B22FE]/30" />
          <div className="absolute w-[95%] aspect-square rounded-full bg-[#0B22FE]/10 blur-3xl" />
        </div>

        <img
          src={mascoteNotebook.url}
          alt="Mascote Metrix CRM com notebook"
          className="relative w-[75%] sm:w-[70%] lg:w-full max-w-md lg:max-w-full h-auto object-contain drop-shadow-2xl lg:scale-115"
          loading="eager"
          decoding="async"
        />

        {/* Floating notification cards */}
        <div className="absolute top-2 left-0 md:-left-4 flex items-center gap-2 bg-white rounded-xl shadow-lg shadow-[#0B22FE]/10 px-2.5 sm:px-3 py-1.5 sm:py-2 border border-[#0B22FE]/10 animate-[float_6s_ease-in-out_infinite]">
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-[#0B22FE] flex items-center justify-center text-white shrink-0">
            <MessageCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </div>
          <div className="text-left">
            <div className="text-[11px] sm:text-xs font-bold text-[#0A0A0F]">Nova conversa</div>
            <div className="text-[9px] sm:text-[10px] text-[#0A0A0F]/60">WhatsApp · há 2s</div>
          </div>
        </div>

        <div className="hidden sm:flex absolute top-8 -right-2 md:-right-12 items-center gap-2 bg-white rounded-xl shadow-lg shadow-[#0B22FE]/10 px-3 py-2 border border-[#0B22FE]/10 animate-[float_7s_ease-in-out_infinite_0.8s]">
          <div className="w-8 h-8 rounded-lg bg-[#0B22FE]/10 flex items-center justify-center text-[#0B22FE] shrink-0">
            <TrendingUp className="w-4 h-4" />
          </div>
          <div className="text-left">
            <div className="text-xs font-bold text-[#0A0A0F]">+R$ 12.480 hoje</div>
            <div className="text-[10px] text-[#0A0A0F]/60">↑ 23% vs ontem</div>
          </div>
        </div>


        <div className="absolute bottom-6 sm:bottom-16 left-0 md:-left-6 flex items-center gap-2 bg-white rounded-xl shadow-lg shadow-[#0B22FE]/10 px-2.5 sm:px-3 py-1.5 sm:py-2 border border-[#0B22FE]/10 animate-[float_8s_ease-in-out_infinite_1.4s]">
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-[#0B22FE] flex items-center justify-center text-white shrink-0">
            <Sparkles className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </div>
          <div className="text-left">
            <div className="text-[11px] sm:text-xs font-bold text-[#0A0A0F]">Sistema agiu</div>
            <div className="text-[9px] sm:text-[10px] text-[#0A0A0F]/60">Lead qualificado</div>
          </div>
        </div>

        <div className="hidden sm:flex absolute top-[62%] right-0 md:-right-2 items-center gap-2 bg-white rounded-xl shadow-lg shadow-[#0B22FE]/10 px-3 py-2 border border-[#0B22FE]/10 animate-[float_6.5s_ease-in-out_infinite_0.4s]">
          <div className="w-8 h-8 rounded-lg bg-[#0B22FE]/10 flex items-center justify-center text-[#0B22FE] shrink-0">
            <Calendar className="w-4 h-4" />
          </div>
          <div className="text-left">
            <div className="text-xs font-bold text-[#0A0A0F]">Reunião agendada</div>
            <div className="text-[10px] text-[#0A0A0F]/60">Amanhã, 14h</div>
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
              ? "bg-[#0B22FE] text-white shadow-xl shadow-[#0B22FE]/20"
              : "bg-white border border-gray-200"
          }`}
        >
          <div
            className={`font-bold text-2xl md:text-3xl mb-1 font-display ${it.blue ? "" : "text-[#0B22FE]"}`}
          >
            {it.v}
          </div>
          <div className={`text-xs md:text-sm uppercase tracking-wider font-bold ${it.blue ? "text-white/70" : "text-[#0A0A0F]/60"}`}>
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
    { n: "02", t: "Treine a IA em 1 clique", d: "Suba seu PDF ou cole seu site. A Metrix aprende tudo sobre seu negócio instantaneamente." },
    { n: "03", t: "Veja a mágica no CRM", d: "Contatos salvos, leads qualificados e agenda cheia sem que você precise digitar uma palavra." },
  ];
  return (
    <section id="como-funciona" className="flex flex-col gap-10 md:gap-14">
      <div className="mx-auto max-w-3xl text-center">
        <div className="text-sm font-bold text-[#0B22FE] uppercase tracking-widest mb-4">Agente de IA</div>
        <h2 className="font-bold font-display leading-[1.05] tracking-tight" style={{ fontSize: "clamp(1.75rem, 3.6vw, 3.75rem)" }}>
          Seu agente de IA trabalha por você, <span className="text-[#0B22FE]">qualifica leads 24 horas por dia.</span>
        </h2>
        <p className="mt-5 text-base md:text-lg text-[#0A0A0F]/60 mx-auto max-w-2xl">
          Enquanto você toma um café, a IA atende, entende e move cada lead pra frente no CRM — todos os dias, sem folga.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
        <div className="relative order-2 lg:order-1">
          <div className="absolute inset-0 bg-[#0B22FE]/10 blur-3xl rounded-full" aria-hidden />
          <img
            src={mascoteNotebook.url}
            alt="Mascote da Metrix CRM relaxando enquanto o notebook trabalha sozinho"
            className="relative w-full h-auto max-w-xl mx-auto drop-shadow-2xl"
          />
        </div>

        <ol className="order-1 lg:order-2 flex flex-col gap-4 sm:gap-6">
          {steps.map((s) => (
            <li
              key={s.n}
              className="group flex gap-4 sm:gap-5 p-5 sm:p-6 rounded-2xl bg-white border border-gray-200 hover:border-[#0B22FE]/40 hover:shadow-lg hover:shadow-[#0B22FE]/10 transition-all"
            >
              <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-[#0B22FE] grid place-items-center text-white font-bold shrink-0 font-display group-hover:rotate-6 transition-transform">
                {s.n}
              </div>
              <div className="min-w-0">
                <h3 className="text-lg sm:text-xl font-bold mb-1.5 sm:mb-2 font-display">{s.t}</h3>
                <p className="text-sm sm:text-base text-[#0A0A0F]/60 leading-relaxed">{s.d}</p>
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
        <div className="text-sm font-bold text-[#0B22FE] uppercase tracking-widest mb-4">Recursos</div>
        <h2 className="font-bold font-display leading-[1.05] tracking-tight" style={{ fontSize: "clamp(1.75rem, 3.6vw, 3.75rem)" }}>
          Uma plataforma. <span className="text-[#0B22FE]">Oito módulos</span> que trabalham juntos.
        </h2>
        <p className="mt-5 text-base md:text-lg text-[#0A0A0F]/60 mx-auto max-w-2xl">
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
              className={`group relative rounded-3xl p-6 md:p-7 border transition-all hover:-translate-y-1 hover:shadow-xl hover:shadow-[#0B22FE]/10 flex flex-col gap-4 ${
                featured
                  ? "sm:col-span-2 lg:col-span-1 bg-[#0B22FE] border-[#0B22FE] text-white"
                  : "bg-white border-gray-200 hover:border-[#0B22FE]/40"
              }`}
            >
              <div className="flex items-center justify-between">
                <div
                  className={`w-12 h-12 rounded-2xl grid place-items-center shrink-0 ${
                    featured ? "bg-white/15" : "bg-[#0B22FE]/10 group-hover:bg-[#0B22FE] transition-colors"
                  }`}
                >
                  <FIcon
                    className={`w-6 h-6 ${featured ? "text-white" : "text-[#0B22FE] group-hover:text-white transition-colors"}`}
                  />
                </div>
                <span
                  className={`text-[10px] font-bold uppercase tracking-widest ${
                    featured ? "text-white/70" : "text-[#0B22FE]/70"
                  }`}
                >
                  {f.tag}
                </span>
              </div>
              <div>
                <h3 className={`text-xl font-bold font-display leading-tight ${featured ? "text-white" : "text-[#0A0A0F]"}`}>
                  {f.title}
                </h3>
                <p className={`mt-2 text-sm leading-relaxed ${featured ? "text-white/80" : "text-[#0A0A0F]/60"}`}>
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



function Pricing() {
  const perks = [
    "1 conexão de WhatsApp",
    "Até 3 usuários",
    "Todos os módulos inclusos",
    "Agentes de IA",
    "CRM Kanban + Automações",
    "Agendamentos e Campanhas",
    "Suporte prioritário",
    "Cancele quando quiser",
  ];
  return (
    <section id="planos" className="relative flex flex-col items-center gap-12">
      <div className="text-center max-w-2xl">
        <div className="text-sm font-bold text-[#0B22FE] uppercase tracking-widest mb-3">Plano único</div>
        <h2
          className="font-bold font-display leading-[1.05]"
          style={{ fontSize: "clamp(1.75rem, 3.6vw, 3.75rem)" }}
        >
          Um plano. <span className="text-[#0B22FE]">Tudo incluso.</span>
        </h2>
        <p className="text-[#0A0A0F]/60 mt-4">Sem letra miúda, sem upsell escondido. Comece grátis e veja resultado antes de pagar.</p>
      </div>

      <div className="relative w-full flex justify-center">
        {/* Mascote pequeno no canto */}
        <img
          src={mascoteOferta.url}
          alt="Mascote Metrix"
          className="hidden lg:block absolute right-4 xl:right-16 -bottom-4 w-40 xl:w-48 h-auto drop-shadow-xl animate-float pointer-events-none select-none"
        />

        {/* Card em destaque, centralizado */}
        <div className="w-full max-w-xl bg-white border border-gray-200 rounded-3xl p-6 sm:p-8 md:p-12 shadow-2xl shadow-[#0B22FE]/10 relative overflow-hidden">
          <div className="absolute -top-24 -right-24 w-64 h-64 rounded-full bg-[#0B22FE]/10 blur-3xl" />
          <div className="absolute -bottom-24 -left-24 w-64 h-64 rounded-full bg-[#0B22FE]/5 blur-3xl" />
          <div className="relative text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#0B22FE]/10 text-[#0B22FE] text-xs font-bold uppercase tracking-widest mb-5">
              Metrix PRO
            </div>
            <div className="flex items-baseline justify-center gap-2 mb-2">
              <div className="text-5xl sm:text-6xl md:text-7xl font-bold font-display text-[#0A0A0F]">R$ 79,90</div>
              <div className="text-[#0A0A0F]/50 text-sm sm:text-base">/mês</div>
            </div>
            <div className="text-xs sm:text-sm text-[#0B22FE] font-bold uppercase tracking-widest mb-6 sm:mb-8">
              7 dias grátis · sem cartão
            </div>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 mb-8 text-left">
              {perks.map((p) => (
                <li key={p} className="flex items-center gap-3 text-sm">
                  <div className="w-5 h-5 rounded-full bg-[#0B22FE]/10 grid place-items-center shrink-0">
                    <Check className="w-3 h-3 text-[#0B22FE]" />
                  </div>
                  <span className="text-[#0A0A0F]/80">{p}</span>
                </li>
              ))}
            </ul>
            <button
              onClick={() => goCta("/entrar")}
              className="w-full py-3.5 sm:py-4 bg-[#0B22FE] text-white rounded-full font-bold text-base sm:text-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
            >
              Teste grátis por 7 dias <ArrowRight className="w-4 h-4" />
            </button>
            <div className="text-xs text-[#0A0A0F]/50 mt-4">
              Sem fidelidade · Cancele quando quiser
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section id="faq" className="flex flex-col gap-12">
      <div className="mx-auto max-w-3xl text-center">
        <div className="text-sm font-bold text-[#0B22FE] uppercase tracking-widest mb-4">FAQ</div>
        <h2 className="font-bold font-display leading-[1.05] tracking-tight" style={{ fontSize: "clamp(1.75rem, 3.6vw, 3.75rem)" }}>
          Dúvidas <span className="text-[#0B22FE]">rápidas</span> sobre a plataforma.
        </h2>
        <p className="mt-5 text-base md:text-lg text-[#0A0A0F]/60 mx-auto max-w-2xl">
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
                isOpen ? "border-[#0B22FE]/40 shadow-lg shadow-[#0B22FE]/5" : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <div className="flex items-center justify-between gap-4">
                <div className="font-bold text-base md:text-lg font-display">{it.q}</div>
                <div className={`w-8 h-8 rounded-full grid place-items-center shrink-0 transition-colors ${isOpen ? "bg-[#0B22FE] text-white" : "bg-gray-100 text-[#0A0A0F]/60"}`}>
                  {isOpen ? <Minus className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                </div>
              </div>
              {isOpen && <p className="text-[#0A0A0F]/70 leading-relaxed mt-4">{it.a}</p>}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function CtaImpacto() {
  return (
    <section className="relative overflow-hidden rounded-[1.75rem] sm:rounded-[2rem] md:rounded-[2.5rem] bg-gradient-to-br from-[#0B22FE] via-[#1D33FF] to-[#0A0A0F] px-6 py-10 sm:p-10 md:p-16 text-white">
      <div className="absolute inset-0 opacity-[0.12]" style={{ backgroundImage: "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)", backgroundSize: "48px 48px" }} />
      <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full bg-white/10 blur-3xl" />
      <div className="absolute -bottom-32 -left-32 w-96 h-96 rounded-full bg-[#0B22FE]/40 blur-3xl" />
      <div className="relative z-10 max-w-4xl mx-auto flex flex-col items-center text-center gap-6 sm:gap-8">
        <span className="inline-flex items-center gap-2 px-3 sm:px-4 py-1.5 rounded-full border border-white/20 bg-white/10 backdrop-blur text-[10px] sm:text-xs font-semibold uppercase tracking-[0.2em]">
          Chega de perder venda no WhatsApp
        </span>
        <h2 className="font-display font-black leading-[1.05]" style={{ fontSize: "clamp(1.75rem, 4.5vw, 4.5rem)" }}>
          Enquanto você lê isso, um lead seu está sendo <span className="text-white/60">ignorado</span>.
        </h2>
        <p className="text-base sm:text-lg md:text-xl text-white/80 max-w-2xl leading-relaxed">
          A Metrix responde, qualifica e agenda no automático — 24 horas por dia. Você entra na conversa só quando o cliente está pronto para comprar.
        </p>
        <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-4 pt-2 w-full sm:w-auto">
          <button onClick={() => goCta("#planos")} className="w-full sm:w-auto px-6 sm:px-8 py-3.5 sm:py-4 rounded-2xl bg-white text-[#0B22FE] font-bold text-sm sm:text-base shadow-2xl shadow-black/30 hover:scale-[1.03] transition-transform">
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
          <img src={metrixLogo.url} alt="Metrix CRM" className="h-7 w-auto" />
          <span className="text-sm text-[#0A0A0F]/40">© {new Date().getFullYear()}</span>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-[#0A0A0F]/60">
          <a href="/termos" className="hover:text-[#0B22FE]">Termos</a>
          <a href="/privacidade" className="hover:text-[#0B22FE]">Privacidade</a>
          <a href="/reembolso" className="hover:text-[#0B22FE]">Reembolso</a>
          <a href="/entrar" className="hover:text-[#0B22FE]">Entrar</a>
        </div>
      </div>
    </footer>
  );
}
