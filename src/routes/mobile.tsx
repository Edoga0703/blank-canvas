import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute('/mobile')({
  component: MobilePage,
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:url", content: URL },
    ],
  }),
})


import { useState, useEffect } from "react";
import { 
  Smartphone, Zap, Bell, KanbanSquare, Download, ArrowRight, 
  MessageSquareText, Calendar, Clock, Sparkles, Check, CheckCircle2, ChevronRight, Menu, X,
  PlayCircle
} from "lucide-react";
import appleIcon from "@/assets/apple.svg.asset.json";
import androidIcon from "@/assets/android2.svg.asset.json";
import { brand } from "@/config/brand";
import { Button } from "@/components/ui/button";
import metrixLogo from "@/assets/metrix-logo.png.asset.json";
import mascotMobile from "@/assets/mascot-mobile.png.asset.json";
import iphoneStep1 from "@/assets/iphone-step-1.png.asset.json";
import iphoneStep2 from "@/assets/iphone-step-2.png.asset.json";
import iphoneStep3 from "@/assets/iphone-step-3.png.asset.json";
import iphoneStep4 from "@/assets/iphone-step-4.png.asset.json";
import iphoneStep5 from "@/assets/iphone-step-5.png.asset.json";
import androidStep1 from "@/assets/android-step-1.png.asset.json";
import androidStep2 from "@/assets/android-step-2.png.asset.json";
import androidStep3 from "@/assets/android-step-3.png.asset.json";
import androidStep4 from "@/assets/android-step-4.png.asset.json";

const TITLE = "Metrix no celular: CRM e WhatsApp na palma da mão";
const DESC = "Instale o Metrix CRM no seu celular em 30 segundos. Responda leads, mova cards no Kanban e receba notificações onde você estiver.";
const URL = "https://metrixcrm.com.br/mobile";

const IOS_STEPS = [
  { text: "1. Abra metrixcrm.com.br no Safari ou Chrome.", img: iphoneStep1.url },
  { text: "2. Toque no botão de opções ou compartilhar.", img: iphoneStep2.url },
  { text: "3. Escolha “Adicionar à Tela de Início”.", img: iphoneStep3.url },
  { text: "4. Confirme em “Adicionar”.", img: iphoneStep4.url },
  { text: "5. O Metrix CRM agora aparecerá junto aos seus apps instalados.", img: iphoneStep5.url },
];

const ANDROID_STEPS = [
  { text: "1. Abra metrixcrm.com.br no navegador e toque no menu ⋮ no canto superior.", img: androidStep1.url },
  { text: "2. Escolha “Instalar e criar atalho” ou “Instalar aplicativo”.", img: androidStep2.url },
  { text: "3. Confirme a instalação clicando em “Instalar”.", img: androidStep3.url },
  { text: "4. O Metrix agora aparecerá junto aos seus apps instalados.", img: androidStep4.url },
];

const MOBILE_FEATURES = [
  { title: "Dashboard", icon: Sparkles, desc: "Visão geral do seu negócio e métricas em tempo real." },
  { title: "Conversas", icon: MessageSquareText, desc: "Atenda leads no WhatsApp, Instagram e Messenger." },
  { title: "CRM Kanban", icon: KanbanSquare, desc: "Mova cards e gerencie seu funil de vendas." },
  { title: "Contatos", icon: Calendar, desc: "Base completa de clientes na palma da mão." },
  { title: "Agendamentos", icon: Clock, desc: "Visualize e gerencie sua agenda diária." },
  { title: "Respostas Rápidas", icon: Zap, desc: "Responda em segundos com atalhos inteligentes." },
  { title: "Configurações", icon: Bell, desc: "Controle total da sua conta e notificações." },
];

function MobilePage() {
  const [platform, setPlatform] = useState<"ios" | "android">("ios");
  const [activeStep, setActiveStep] = useState(0);
  const [activeFeature, setActiveFeature] = useState(0);

  const steps = platform === "ios" ? IOS_STEPS : ANDROID_STEPS;

  // Auto-rotate features like a "demo"
  useEffect(() => {
    const timer = setInterval(() => {
      setActiveFeature((prev) => (prev + 1) % MOBILE_FEATURES.length);
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="min-h-screen bg-[#F4F5F9] text-[#0A0A0F] selection:bg-[#0B22FE] selection:text-white antialiased overflow-x-hidden" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <main className="max-w-7xl mx-auto px-4 sm:px-8 py-12 md:py-24 space-y-24 md:space-y-32">
        
        {/* Header / Hero Section (Aligned with Home Identity) */}
        <section className="relative grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          <div aria-hidden className="pointer-events-none absolute inset-0 -mx-8 -my-10" style={{
            backgroundImage: "linear-gradient(to right, rgba(11,34,254,0.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(11,34,254,0.06) 1px, transparent 1px)",
            backgroundSize: "56px 56px",
            maskImage: "radial-gradient(ellipse at center, rgba(0,0,0,1) 40%, rgba(0,0,0,0) 85%)",
          }} />

          <div className="lg:col-span-7 z-10 text-center lg:text-left space-y-6">
            <img src={metrixLogo.url} alt="Metrix CRM" className="h-12 md:h-16 w-auto mx-auto lg:mx-0 transition-all" />
            
            <div className="space-y-6">
              <h1 className="font-display font-black leading-[1.05] tracking-tight" style={{ fontSize: "clamp(2.5rem, 5vw, 5.5rem)" }}>
                Seu CRM agora cabe no <span className="text-[#0B22FE]">bolso.</span>
              </h1>
              <p className="text-lg md:text-xl text-[#0A0A0F]/70 max-w-xl mx-auto lg:mx-0 leading-relaxed">
                Leve toda a potência do Metrix CRM para onde você estiver. Instalação rápida, interface fluida e produtividade máxima no celular.
              </p>
            </div>
            
            <div className="flex flex-wrap items-center justify-center lg:justify-start gap-4">
              <Button asChild size="lg" className="bg-[#0B22FE] text-white rounded-full h-14 px-8 font-bold text-lg hover:scale-[1.03] transition-transform shadow-lg shadow-[#0B22FE]/25">
                <a href="#instalar">Instalar Agora <Download className="ml-2 size-5" /></a>
              </Button>
            </div>
          </div>

          <div className="lg:col-span-5 relative flex items-center justify-center min-h-[400px]">
             <div aria-hidden className="absolute inset-0 flex items-center justify-center scale-150 lg:scale-100">
                <div className="absolute w-[110%] aspect-square rounded-full border border-dashed border-[#0B22FE]/15" />
                <div className="absolute w-[85%] aspect-square rounded-full border border-dashed border-[#0B22FE]/25" />
                <div className="absolute w-[95%] aspect-square rounded-full bg-[#0B22FE]/10 blur-3xl" />
             </div>
             <img src={mascotMobile.url} alt="Mascote Metrix Mobile" className="relative w-full max-w-md h-auto object-contain drop-shadow-2xl animate-[float_6s_ease-in-out_infinite]" />
          </div>
        </section>

        {/* Instalação Section */}
        <section id="instalar" className="space-y-12">
          <div className="text-center space-y-4">
            <div className="text-sm font-bold text-[#0B22FE] uppercase tracking-widest">Setup Rápido</div>
            <h2 className="font-display font-black leading-[1.05] tracking-tight" style={{ fontSize: "clamp(2.2rem, 4.5vw, 4.5rem)" }}>
              Instalação em <span className="text-[#0B22FE]">30 segundos</span>
            </h2>
            <p className="text-lg md:text-xl text-[#0A0A0F]/60 max-w-2xl mx-auto leading-relaxed">Escolha seu sistema para ver o passo a passo ilustrado.</p>
          </div>

          <div className="flex justify-center p-3 bg-white border border-gray-100 rounded-[2.5rem] w-fit mx-auto shadow-sm gap-2">
            <button
              onClick={() => { setPlatform("ios"); setActiveStep(0); }}
              className={`flex items-center gap-4 px-12 md:px-20 py-6 rounded-[2rem] text-base md:text-xl font-black transition-all ${
                platform === "ios" ? "bg-[#0B22FE] text-white shadow-xl shadow-[#0B22FE]/25 scale-105" : "text-slate-900 hover:bg-slate-50"
              }`}
            >
              <img 
                src={appleIcon.url} 
                className={`size-7 md:size-9 transition-all ${platform === "ios" ? "brightness-0 invert" : ""}`} 
                alt="" 
              /> 
              iPhone (iOS)
            </button>
            <button
              onClick={() => { setPlatform("android"); setActiveStep(0); }}
              className={`flex items-center gap-4 px-12 md:px-20 py-6 rounded-[2rem] text-base md:text-xl font-black transition-all ${
                platform === "android" ? "bg-[#0B22FE] text-white shadow-xl shadow-[#0B22FE]/25 scale-105" : "text-slate-900 hover:bg-slate-50"
              }`}
            >
              <img 
                src={androidIcon.url} 
                className={`size-7 md:size-9 transition-all ${platform === "android" ? "brightness-0 invert" : ""}`} 
                alt="" 
              /> 
              Android
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-start">
            <div className="space-y-4 order-2 lg:order-1">
              {steps.map((step, i) => (
                <button 
                  key={i} 
                  onClick={() => setActiveStep(i)}
                  className={`w-full flex items-center gap-5 p-6 rounded-3xl border transition-all text-left ${
                    activeStep === i ? "bg-white border-[#0B22FE]/30 shadow-xl translate-x-2" : "bg-white/50 border-transparent hover:bg-white"
                  }`}
                >
                  <span className={`shrink-0 h-10 w-10 rounded-full grid place-items-center text-sm font-bold transition-all ${
                    activeStep === i ? "bg-[#0B22FE] text-white scale-110" : "bg-slate-200 text-slate-500"
                  }`}>
                    {i + 1}
                  </span>
                  <span className={`text-base md:text-lg font-bold transition-colors ${activeStep === i ? "text-[#0A0A0F]" : "text-slate-500"}`}>
                    {step.text}
                  </span>
                  {activeStep === i && <ChevronRight className="ml-auto size-5 text-[#0B22FE]" />}
                </button>
              ))}
            </div>

            <div className="relative group order-1 lg:order-2">
              <div className="absolute -inset-10 bg-[#0B22FE]/5 blur-[80px] rounded-full group-hover:bg-[#0B22FE]/10 transition-all" />
              <div className="relative aspect-[9/19] max-w-[300px] mx-auto w-full rounded-[3rem] border-[12px] border-slate-900 bg-slate-900 overflow-hidden shadow-[0_40px_100px_-20px_rgba(0,0,0,0.3)]">
                <img 
                  src={steps[activeStep].img} 
                  alt={`Passo ${activeStep + 1}`} 
                  className="w-full h-full object-cover animate-in fade-in zoom-in-95 duration-500"
                />
              </div>
            </div>
          </div>
        </section>

        {/* App Showcase (Interactive Concept) */}
        <section className="space-y-16">
          <div className="text-center space-y-4">
            <div className="text-sm font-bold text-[#0B22FE] uppercase tracking-widest">Recursos</div>
            <h2 className="font-display font-black leading-[1.05] tracking-tight" style={{ fontSize: "clamp(2.2rem, 4.5vw, 4.5rem)" }}>
              O que você terá no <span className="text-[#0B22FE]">celular</span>
            </h2>
            <p className="text-lg md:text-xl text-[#0A0A0F]/60 max-w-2xl mx-auto leading-relaxed">Explore as funcionalidades como se estivesse dentro do app.</p>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center bg-white rounded-[3rem] p-8 md:p-12 border border-slate-200 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-[#0B22FE]/5 blur-3xl rounded-full -mr-32 -mt-32" />
            
            <div className="lg:col-span-5 relative">
              <div className="relative aspect-[9/19] max-w-[280px] mx-auto w-full rounded-[2.5rem] border-[8px] border-slate-900 bg-slate-900 overflow-hidden shadow-2xl">
                 {/* Mock UI transitions based on active feature */}
                 <div className="absolute inset-0 bg-[#F4F5F9] flex flex-col animate-in fade-in duration-500">
                    <div className="h-14 bg-white border-b border-slate-100 flex items-center px-4 justify-between">
                       <img src={metrixLogo.url} className="h-4 w-auto" alt="" />
                       <Bell className="size-4 text-slate-400" />
                    </div>
                    <div className="flex-1 p-4 space-y-4">
                       <div className="flex items-center gap-2 mb-2">
                          <div className="h-8 w-8 rounded-lg bg-[#0B22FE]/10 flex items-center justify-center text-[#0B22FE]">
                             {(() => {
                                const Icon = MOBILE_FEATURES[activeFeature].icon;
                                return <Icon size={16} />;
                             })()}
                          </div>
                          <span className="font-bold text-xs">{MOBILE_FEATURES[activeFeature].title}</span>
                       </div>
                        <div className="space-y-2">
                           {activeFeature === 0 && ( // Dashboard
                             <div className="space-y-2">
                               <div className="grid grid-cols-2 gap-2">
                                 <div className="h-14 bg-white rounded-xl border border-slate-100 p-2 flex flex-col justify-center gap-1">
                                   <div className="h-1.5 w-1/2 bg-[#0B22FE]/20 rounded" />
                                   <div className="h-3 w-3/4 bg-[#0B22FE] rounded" />
                                 </div>
                                 <div className="h-14 bg-white rounded-xl border border-slate-100 p-2 flex flex-col justify-center gap-1">
                                   <div className="h-1.5 w-1/2 bg-slate-100 rounded" />
                                   <div className="h-3 w-3/4 bg-slate-200 rounded" />
                                 </div>
                               </div>
                               <div className="h-24 w-full bg-white rounded-xl border border-slate-100 p-2 relative overflow-hidden">
                                 <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-[#0B22FE]/10 to-transparent" />
                                 <div className="flex items-end justify-between h-full px-1 pb-1">
                                   {[40, 70, 50, 90, 60, 80].map((h, i) => (
                                     <div key={i} className="w-2 bg-[#0B22FE] rounded-t-sm" style={{ height: `${h}%` }} />
                                   ))}
                                 </div>
                               </div>
                             </div>
                           )}
                           {activeFeature === 1 && ( // Conversas
                             <div className="space-y-2">
                               {[
                                 { n: "Azul Empréstimo", t: "IA respondeu agora", c: "whatsapp" },
                                 { n: "Pedro Silva", t: "Pode me enviar o catálogo?", c: "instagram" },
                                 { n: "Maria Oliveira", t: "Agendamento confirmado!", c: "messenger" }
                               ].map((chat, i) => (
                                 <div key={i} className="h-12 w-full bg-white rounded-xl border border-slate-100 p-2 flex items-center gap-2">
                                   <div className="size-8 rounded-full bg-slate-200 shrink-0" />
                                   <div className="flex-1 min-w-0">
                                     <div className="h-2 w-1/2 bg-slate-900 rounded mb-1" />
                                     <div className="h-1.5 w-3/4 bg-slate-400 rounded" />
                                   </div>
                                 </div>
                               ))}
                             </div>
                           )}
                           {activeFeature === 2 && ( // CRM Kanban
                             <div className="grid grid-cols-2 gap-2 h-48">
                               <div className="bg-slate-50/50 rounded-xl border border-dashed border-slate-200 p-1.5 space-y-1.5">
                                 <div className="h-1.5 w-1/2 bg-[#0B22FE]/30 rounded mx-auto" />
                                 <div className="h-12 w-full bg-white rounded-lg shadow-sm border border-slate-100 p-2">
                                   <div className="h-1.5 w-3/4 bg-slate-800 rounded mb-1" />
                                   <div className="h-1 w-1/2 bg-emerald-500 rounded" />
                                 </div>
                               </div>
                               <div className="bg-slate-50/50 rounded-xl border border-dashed border-slate-200 p-1.5 space-y-1.5">
                                 <div className="h-1.5 w-1/2 bg-slate-200 rounded mx-auto" />
                                 <div className="h-12 w-full bg-white rounded-lg shadow-sm border border-slate-100 p-2 opacity-50">
                                   <div className="h-1.5 w-2/3 bg-slate-800 rounded" />
                                 </div>
                               </div>
                             </div>
                           )}
                           {activeFeature >= 3 && ( // Others fallback
                             <div className="h-40 w-full bg-white rounded-xl border border-slate-100 p-3 flex flex-col gap-2">
                               <div className="h-2 w-2/3 bg-slate-100 rounded" />
                               <div className="h-2 w-full bg-slate-50 rounded" />
                               <div className="h-2 w-1/2 bg-slate-50 rounded" />
                               <div className="mt-auto grid grid-cols-2 gap-2">
                                  <div className="h-8 bg-slate-50 rounded-lg" />
                                  <div className="h-8 bg-[#0B22FE]/10 rounded-lg" />
                               </div>
                             </div>
                           )}
                        </div>
                    </div>
                    <div className="h-14 bg-white border-t border-slate-100 flex items-center justify-around px-2 pb-2">
                       <LayoutDashboard className="size-4 text-[#0B22FE]" />
                       <MessageSquareText className="size-4 text-slate-300" />
                       <div className="h-10 w-10 rounded-full bg-[#0B22FE] shadow-lg shadow-[#0B22FE]/30 flex items-center justify-center text-white -mt-4">
                          <Zap size={20} />
                       </div>
                       <KanbanSquare className="size-4 text-slate-300" />
                       <Bell className="size-4 text-slate-300" />
                    </div>
                 </div>
              </div>
            </div>

            <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-4">
              {MOBILE_FEATURES.map((f, i) => (
                <button 
                  key={i} 
                  onClick={() => setActiveFeature(i)}
                  className={`group p-6 rounded-3xl border transition-all flex gap-4 text-left ${
                    activeFeature === i ? "bg-[#0B22FE] border-[#0B22FE] text-white shadow-xl shadow-[#0B22FE]/20" : "bg-slate-50 border-transparent hover:bg-white hover:border-slate-200"
                  }`}
                >
                  <div className={`h-12 w-12 rounded-2xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-110 ${
                    activeFeature === i ? "bg-white/20 text-white" : "bg-[#0B22FE]/10 text-[#0B22FE]"
                  }`}>
                    <f.icon className="h-6 w-6" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="font-black text-sm uppercase tracking-wider">{f.title}</h3>
                    <p className={`text-xs leading-relaxed ${activeFeature === i ? "text-white/80" : "text-[#0A0A0F]/60"}`}>{f.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* CTA (Aligned with Home Identity) */}
        <section className="bg-[#0B22FE] rounded-[3rem] p-12 md:p-20 text-center space-y-8 shadow-2xl shadow-[#0B22FE]/30 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-96 h-96 bg-white/10 blur-[120px] -mr-48 -mt-48 rounded-full" />
          <div className="absolute bottom-0 left-0 w-96 h-96 bg-black/10 blur-[120px] -ml-48 -mb-48 rounded-full" />
          
          <div className="relative space-y-4 z-10">
            <h2 className="font-display font-black leading-[1.05] tracking-tight text-white" style={{ fontSize: "clamp(2rem, 4vw, 4rem)" }}>
              Pronto para levar sua operação para qualquer lugar?
            </h2>
            <p className="text-white/80 text-lg md:text-xl max-w-2xl mx-auto font-medium leading-relaxed">Siga os passos de instalação acima e comece a usar agora mesmo.</p>
          </div>
          
          <div className="relative pt-6 flex flex-wrap justify-center gap-4 z-10">
            <Button asChild size="lg" className="bg-white text-[#0B22FE] hover:bg-slate-100 rounded-full h-16 px-12 font-black text-xl shadow-xl transition-all hover:scale-105 active:scale-95">
              <a href="#instalar">Instalar Metrix CRM <Download className="ml-3 size-6" /></a>
            </Button>
          </div>
          
          <p className="text-white/50 text-sm font-medium relative z-10">Não requer download na App Store ou Play Store.</p>
        </section>
        
        <footer className="text-center pb-12 border-t border-slate-200 pt-12">
          <img src={metrixLogo.url} alt="Metrix CRM" className="h-6 w-auto mx-auto mb-6 opacity-30 grayscale" />
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">© {new Date().getFullYear()} {brand.name}. Todos os direitos reservados.</p>
        </footer>
      </main>

      <style>{`
        html { scroll-behavior: smooth; }
        .font-display { font-family: 'Space Grotesk', system-ui, sans-serif; letter-spacing: -0.02em; }
        @keyframes float {
          0%, 100% { transform: translateY(0) rotate(0); }
          50% { transform: translateY(-20px) rotate(2deg); }
        }
      `}</style>
    </div>
  );
}

const LayoutDashboard = ({ className, size }: { className?: string, size?: number }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size || 24} height={size || 24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>
);