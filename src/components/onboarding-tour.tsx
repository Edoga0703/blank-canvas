import { useEffect, useState, useCallback } from "react";
import { Joyride, STATUS, type EventData, type Step } from "react-joyride";
import confetti from "canvas-confetti";
import { useNavigate } from "@tanstack/react-router";
import noxWelcome from "@/assets/nox-welcome.png.asset.json";
import noxPointing from "@/assets/nox-pointing.png.asset.json";
import noxPointingLeft from "@/assets/nox-pointing-left.png.asset.json";
import noxTablet from "@/assets/nox-tablet.png.asset.json";
import noxPhone from "@/assets/nox-phone.png.asset.json";
import noxCelebrate from "@/assets/nox-celebrate.png.asset.json";
import { brand } from "@/config/brand";

const TOUR_KEY = (userId?: string | null) => `metrix_tour_done_${userId || "anon"}`;

type TourStep = {
  target: string;
  placement?: Step["placement"];
  title: string;
  content: string;
  image?: { url: string };
};

const rawSteps: TourStep[] = [
  {
    target: "body",
    placement: "center",
    title: "Oi! Eu sou o NOX, mascote do Metrix 👋",
    image: noxWelcome,
    content:
      "Vou te dar um tour rápido pelos módulos principais. É rapidinho — e você pode refazer sempre que quiser pelo menu do usuário.",
  },
  { target: 'a[href="/app/dashboard"]', title: "Dashboard", image: noxPointing, content: "Aqui você vê os indicadores da sua operação: conversas, leads, produtividade e receita." },
  { target: 'a[href="/app/conversas"]', title: "Conversas", image: noxPhone, content: "Central de atendimento do WhatsApp. Responda clientes, ative a IA para automatizar e faça handoff quando precisar de humano." },
  { target: 'a[href="/app/crm"]', title: "CRM Kanban", image: noxPointing, content: "Arraste leads entre etapas do funil, atribua responsáveis e acompanhe o pipeline em tempo real." },
  { target: 'a[href="/app/contatos"]', title: "Contatos", image: noxTablet, content: "Sua base de clientes com histórico, tags e campos personalizados. A fonte da verdade da operação." },
  { target: 'a[href="/app/agente"]', title: "Agente IA", image: noxTablet, content: "Configure sua IA: personalidade, base de conhecimento, ferramentas e playground para testar antes de subir ao ar." },
  { target: 'a[href="/app/respostas-rapidas"]', title: "Respostas Rápidas", image: noxPointingLeft, content: "Modelos prontos com atalhos (/oi, /preco…) para responder em segundos." },
  { target: 'a[href="/app/agendamentos"]', title: "Agendamentos", image: noxTablet, content: "Agenda integrada — dia, semana, mês. Ideal pra clínicas, salões e prestadores de serviço." },
  { target: 'a[href="/app/campanhas"]', title: "Campanhas", image: noxPointing, content: "Dispare mensagens em massa segmentadas pela sua base, com controle de entregas." },
  { target: 'a[href="/app/catalogo"]', title: "Catálogo", image: noxPointingLeft, content: "Cadastre produtos/serviços com imagens e preços — pronto pra enviar no chat." },
  { target: 'a[href="/app/conexao"]', title: "Conexão WhatsApp", image: noxPhone, content: "Conecte seu número via QR Code aqui. Se cair, é aqui que você reconecta." },
  { target: 'a[href="/app/configuracoes"]', title: "Configurações", image: noxTablet, content: "Equipe, permissões, horários, integrações e branding da empresa." },
  {
    target: "body",
    placement: "center",
    title: "Prontinho! 🎉",
    image: noxCelebrate,
    content:
      'Você já sabe o essencial. Explora à vontade — e se precisar refazer o tour, clique no seu avatar (canto superior direito) → "Fazer tour novamente".',
  },
];

function renderContent(s: TourStep) {
  return (
    <div className="flex flex-col sm:flex-row gap-2 items-center text-left">
      <img
        src={(s.image ?? noxWelcome).url}
        alt="NOX — mascote Metrix"
        className="w-24 h-24 sm:w-40 sm:h-40 md:w-48 md:h-48 object-contain shrink-0"
        loading="eager"
      />

      <div className="flex-1 min-w-0">
        <div className="font-bold text-base mb-1">{s.title}</div>
        <div className="text-sm text-foreground/85 leading-relaxed">{s.content}</div>
      </div>
    </div>
  );
}

export function OnboardingTour({ userId }: { userId?: string | null }) {
  const [run, setRun] = useState(false);
  const navigate = useNavigate();

  const start = useCallback(() => {
    navigate({ to: "/app/dashboard" }).catch(() => {});
    // pequena espera pra sidebar/rota estarem prontas
    setTimeout(() => setRun(true), 400);
  }, [navigate]);

  // Auto-start no primeiro login
  useEffect(() => {
    if (!userId) return;
    try {
      const done = localStorage.getItem(TOUR_KEY(userId));
      if (!done) {
        // marca imediatamente: o tour automático só acontece uma única vez.
        // Se o usuário fechar/atualizar no meio, não recomeça sozinho —
        // ele pode refazer pelo menu do avatar ("Fazer tour novamente").
        try { localStorage.setItem(TOUR_KEY(userId), "1"); } catch {}
        const t = setTimeout(start, 900);
        return () => clearTimeout(t);
      }
    } catch {}
  }, [userId, start]);

  // Trigger manual via evento global
  useEffect(() => {
    function onStart() { start(); }
    window.addEventListener("tour:start", onStart);
    return () => window.removeEventListener("tour:start", onStart);
  }, [start]);

  const fireConfetti = useCallback(() => {
    const duration = 2500;
    const end = Date.now() + duration;
    const colors = [brand.primary, "#ffffff", "#ffd166", "#06d6a0"];
    (function frame() {
      confetti({ particleCount: 4, angle: 60, spread: 70, origin: { x: 0, y: 0.7 }, colors });
      confetti({ particleCount: 4, angle: 120, spread: 70, origin: { x: 1, y: 0.7 }, colors });
      if (Date.now() < end) requestAnimationFrame(frame);
    })();
    confetti({ particleCount: 120, spread: 90, origin: { y: 0.6 }, colors });
  }, []);

  const handleEvent = useCallback(
    (data: EventData) => {
      const { status } = data;
      if (status === STATUS.FINISHED) {
        fireConfetti();
      }
      if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
        try { if (userId) localStorage.setItem(TOUR_KEY(userId), "1"); } catch {}
        setRun(false);
      }
    },
    [userId, fireConfetti]
  );

  const steps: Step[] = rawSteps.map((s) => ({
    target: s.target,
    placement: s.placement ?? "bottom",
    content: renderContent(s),
    disableBeacon: true,
  }));

  return (
    <Joyride
      steps={steps}
      run={run}
      scrollToFirstStep
      onEvent={handleEvent}
      options={{
        primaryColor: brand.primary,
        zIndex: 10000,
        arrowColor: "#fff",
        backgroundColor: "#fff",
        textColor: "#111",
        overlayColor: "rgba(11, 34, 254, 0.35)",
        showProgress: true,
        skipBeacon: true,
        overlayClickAction: false,
        buttons: ["back", "skip", "primary"],
        spotlightPadding: 8,
      }}
      locale={{
        back: "Voltar",
        close: "Fechar",
        last: "Concluir",
        next: "Próximo",
        skip: "Pular tour",
      }}
      styles={{
        tooltip: { borderRadius: 14, padding: 16, width: 520, maxWidth: "94vw" },
        tooltipContainer: { width: "100%" },
        buttonPrimary: { borderRadius: 8, fontWeight: 600, padding: "8px 14px" },
        buttonBack: { color: "#666", fontWeight: 500 },
        buttonSkip: { color: "#999" },
      }}
    />
  );
}
