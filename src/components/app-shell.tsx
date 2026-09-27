import { Link, useLocation, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { isUserPartner } from "@/lib/partners.functions";

import {
  LayoutDashboard, Bot, KanbanSquare, LogOut, Smartphone, Shield,
  Inbox, Users, BarChart3, Settings, Contact, Megaphone, Webhook, Wallet,
  ChevronsLeft, ChevronsRight, Zap, ChevronDown, CalendarClock, Zap as Bolt, Bell, Volume2, VolumeX,
  PanelLeft, User as UserIcon, Package, Puzzle, MoreHorizontal, Workflow, TrendingUp, FileText,
  GraduationCap, CreditCard, Radar
} from "lucide-react";
import { AgentAvatar } from "@/components/agente/agent-avatar";

import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";



import { supabase } from "@/integrations/supabase/client";
import { brand } from "@/config/brand";
import { NotificationsBell } from "@/components/notifications-bell";
import { BrandMark } from "@/components/brand-mark";
import logoFull from "@/assets/capi-conversa-logo-horizontal-black.png.asset.json";


import { MobileBottomNav, type MobileNavItem } from "@/components/mobile-bottom-nav";
import { toast } from "sonner";
import type { CompanyRow, Membership } from "@/lib/tenant";
import { useWhatsappStatus } from "@/hooks/use-whatsapp-status";
import { useUnreadConversations } from "@/hooks/use-unread-conversations";
import { useRealtimeSounds, useSoundsMuted } from "@/hooks/use-realtime-sounds";
import { SupportFloatingButton } from "@/components/support/support-floating-button";
import { TrialBanner } from "@/components/trial-banner";
import { OnboardingTour } from "@/components/onboarding-tour";
import { useFeatureFlags, type FlagEntry } from "@/hooks/use-feature-flags";
import { useCapacidades } from "@/hooks/use-capacidades";




type NavItem = {
  to?: string;
  label: string;
  icon: any;
  adminOnly?: boolean;
  superOnly?: boolean;
  tag?: string;
  badge?: boolean;
  capacidade?: string;
  children?: NavItem[];
  operationalOnly?: boolean;
};


const sections: { label: string; items: (NavItem & { flag?: string })[] }[] = [
  {
    label: "Atendimento",
    items: [
      { to: "/app/dashboard", label: "Dashboard", icon: LayoutDashboard, flag: "module.dashboard" },
      { to: "/app/conversas", label: "Conversas", icon: Inbox, badge: true, flag: "module.conversas" },
      { to: "/app/crm", label: "CRM Kanban", icon: KanbanSquare, flag: "module.crm" },
      { to: "/app/comercial", label: "Comercial", icon: TrendingUp, flag: "module.comercial" },
      { to: "/app/contatos", label: "Contatos", icon: Contact, flag: "module.contatos" },
      { to: "/app/prospeccao", label: "Prospecção", icon: Radar, capacidade: "prospeccao" },
      { to: "/app/agente", label: "Agente IA", icon: Bot, tag: "IA", flag: "module.agente", adminOnly: true },
      

      { to: "/app/respostas-rapidas", label: "Respostas Rápidas", icon: Bolt, flag: "module.respostas" },
      { to: "/app/agendamentos", label: "Agendamentos", icon: CalendarClock, flag: "module.agendamentos" },
      { to: "/app/campanhas", label: "Campanhas", icon: Megaphone, flag: "module.campanhas" },
      { to: "/app/templates", label: "Templates", icon: FileText, adminOnly: true, tag: "Meta", flag: "module.templates" },
      { to: "/app/catalogo", label: "Catálogo", icon: Package, flag: "module.catalogo" },
      { to: "/app/treinamentos", label: "Capi Conversa Academy", icon: GraduationCap, tag: "Interno", superOnly: true, flag: "module.treinamentos" },

    ],
  },
  {
    label: "Gestão",
    items: [
      { to: "/app/usuarios", label: "Usuários", icon: Users, adminOnly: true, flag: "module.usuarios" },
      { to: "/app/conexao", label: "Conexão", icon: Smartphone, adminOnly: true, flag: "module.conexao" },
      { to: "/app/plugins", label: "Plugins", icon: Puzzle, adminOnly: true, flag: "module.plugins" },
      { to: "/app/configuracoes", label: "Configurações", icon: Settings, flag: "module.configuracoes" },
      { to: "/app/relatorios", label: "Relatórios", icon: BarChart3, adminOnly: true, operationalOnly: true },

      { to: "/app/parceiro", label: "Portal do Parceiro", icon: Users, capacidade: "parceiro" },
    ],
  },
];

const flatNavItems = sections.flatMap((section) => section.items.flatMap((item) => item.children ?? item));

// Empresas com funções individuais (ex.: Sevcon): usuários não-admin acessam
// apenas os módulos operacionais abaixo.
const MODULOS_RESTRITOS = [
  "/app/dashboard",
  "/app/conversas",
  "/app/contatos",
  "/app/respostas-rapidas",
  "/app/agendamentos",
  "/app/configuracoes",
];

// Módulos ocultos para TODOS os usuários (inclusive admin) em contas no modo
// operacional (SevyCon). Para reativar, basta remover a rota desta lista.
const MODULOS_OCULTOS_MODO_OPERACIONAL = [
  "/app/comercial",
  "/app/agente",
  "/app/campanhas",
  "/app/templates",
  "/app/catalogo",
];

const routeSubtitles: Record<string, string> = {
  "/app/dashboard": "Visão geral do atendimento",
  "/app/conversas": "Central de mensagens",
  "/app/crm": "Pipeline de oportunidades",
  "/app/comercial": "Resultados, metas e desempenho da equipe",
  "/app/contatos": "Sua base de leads e clientes",
  "/app/agente": "Configuração da IA",
  
  "/app/respostas-rapidas": "Mensagens prontas para a equipe",
  "/app/agendamentos": "Agenda e compromissos",
  "/app/campanhas": "Disparos em massa",
  "/app/templates": "Modelos HSM aprovados pela Meta",
  "/app/catalogo": "Produtos e serviços",
  "/app/treinamentos": "Centro de treinamento e vídeo aulas do Capi Conversa Academy",
  "/app/conexao": "Status do WhatsApp",
  "/app/usuarios": "Gerencie usuários, funções e permissões",
  "/app/configuracoes": "Preferências da conta",
  "/app/relatorios": "Relatório diário dos atendimentos",
};

function getNavLabel(path: string) {
  return flatNavItems.find((item) => item.to && path.startsWith(item.to))?.label ?? "Carregando";
}

function getRouteSubtitle(path: string) {
  const key = Object.keys(routeSubtitles).find((k) => path.startsWith(k));
  return key ? routeSubtitles[key] : "";
}



export function AppShell({
  children,
  company,
  membership,
  email,
  userId,
  isSuperAdmin,
}: {
  children: ReactNode;
  company: CompanyRow | null;
  membership?: Membership | null;
  email?: string | null;
  userId?: string | null;
  isSuperAdmin?: boolean;
}) {
  const loc = useLocation();
  const navigate = useNavigate();
  
  const routerBusy = useRouterState({ select: (s) => s.status === 'pending' || s.isLoading });
  const [optimisticPath, setOptimisticPath] = useState<string | null>(null);
  const checkPartner = useServerFn(isUserPartner);
  const [isPartner, setIsPartner] = useState(false);

  useEffect(() => {
    if (!userId) return;
    checkPartner().then(setIsPartner).catch(() => setIsPartner(false));
  }, [userId, checkPartner]);


  const pendingPath = optimisticPath && optimisticPath !== loc.pathname ? optimisticPath : null;
  const activePath = pendingPath ?? loc.pathname;

  function startModuleNavigation(to?: string) {
    if (!to || to === loc.pathname) return;
    setOptimisticPath(to);
  }


  useEffect(() => {
    if (!optimisticPath) return;
    if (loc.pathname === optimisticPath) {
      setOptimisticPath(null);
      return;
    }
    const timer = window.setTimeout(() => setOptimisticPath(null), 2500);
    return () => window.clearTimeout(timer);
  }, [loc.pathname, optimisticPath]);

  async function signOut() {
    await supabase.auth.signOut();
    toast.success("Sessão encerrada");
    navigate({ to: "/entrar", replace: true });
  }

  // Mantém a identidade do produto no layout compartilhado.
  const LEGACY_COLORS = ["#22c55e", "#25d366", "#16a34a", "#10b981"];
  const rawPrimary = (company?.primary_color || "").trim().toLowerCase();
  const primary = !rawPrimary || LEGACY_COLORS.includes(rawPrimary) ? brand.primary : company!.primary_color;
  const isAdmin = membership?.role === "owner" || membership?.role === "admin";
  const roleLabel =
    membership?.role === "owner" ? "Dono"
    : membership?.role === "admin" ? "Admin"
    : membership?.role === "atendente" ? "Atendente"
    : "Membro";
  const fallbackName = (email || "Você").split("@")[0];
  const [profile, setProfile] = useState<{ nome: string; avatar_url: string }>({ nome: "", avatar_url: "" });
  const [companyBrand, setCompanyBrand] = useState<{ nome: string; logo_url: string }>({
    nome: company?.nome ?? "",
    logo_url: (company as any)?.logo_url ?? "",
  });
  useEffect(() => {
    setCompanyBrand({ nome: company?.nome ?? "", logo_url: (company as any)?.logo_url ?? "" });
  }, [company?.id, company?.nome, (company as any)?.logo_url]);
  useEffect(() => {
    if (!userId) return;
    void (async () => {
      const { data } = await supabase.from("profiles").select("nome, avatar_url").eq("user_id", userId).maybeSingle();
      if (data) setProfile({ nome: (data as any).nome ?? "", avatar_url: (data as any).avatar_url ?? "" });
    })();
  }, [userId]);
  useEffect(() => {
    function onProfile(e: Event) {
      const d = (e as CustomEvent).detail || {};
      setProfile((p) => ({
        nome: d.nome ?? p.nome,
        avatar_url: d.avatar_url ?? p.avatar_url,
      }));
    }
    function onCompany(e: Event) {
      const d = (e as CustomEvent).detail || {};
      setCompanyBrand((p) => ({
        nome: d.nome ?? p.nome,
        logo_url: d.logo_url ?? p.logo_url,
      }));
    }
    window.addEventListener("profile:updated", onProfile);
    window.addEventListener("company:updated", onCompany);
    return () => {
      window.removeEventListener("profile:updated", onProfile);
      window.removeEventListener("company:updated", onCompany);
    };
  }, []);
  const userName = profile.nome || fallbackName;
  const companyName = companyBrand.nome || "Sua empresa";
  const companyLogo = companyBrand.logo_url || "";

  const [moreOpen, setMoreOpen] = useState(false);
  const { capacidades: capsAtivas, carregando: capsCarregando } = useCapacidades();
  const capOk = (slug?: string) => !slug || capsCarregando || capsAtivas.includes(slug);
  // MVP mobile: apenas módulos operacionais. Os administrativos/complexos
  // ficam disponíveis somente no desktop (mobileHidden).
  const moreItems: { to: string; label: string; icon: any; adminOnly?: boolean; capacidade?: string; mobileHidden?: boolean }[] = [
    { to: "/app/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { to: "/app/conversas", label: "Conversas", icon: Inbox },
    { to: "/app/crm", label: "CRM Kanban", icon: KanbanSquare },
    { to: "/app/contatos", label: "Contatos", icon: Contact },
    { to: "/app/agendamentos", label: "Agendamentos", icon: CalendarClock },
    { to: "/app/respostas-rapidas", label: "Respostas Rápidas", icon: Bolt },
    { to: "/app/configuracoes", label: "Configurações", icon: Settings },
    { to: "/app/comercial", label: "Comercial", icon: TrendingUp },
    { to: "/app/agente", label: "Agente IA", icon: Bot, mobileHidden: true },
    
    { to: "/app/campanhas", label: "Campanhas", icon: Megaphone, mobileHidden: true },
    { to: "/app/templates", label: "Templates", icon: FileText, adminOnly: true, mobileHidden: true },
    { to: "/app/catalogo", label: "Catálogo", icon: Package, mobileHidden: true },

    { to: "/app/usuarios", label: "Usuários", icon: Users, adminOnly: true, mobileHidden: true },
    { to: "/app/conexao", label: "Conexão", icon: Smartphone, adminOnly: true, mobileHidden: true },
    { to: "/app/plugins", label: "Plugins", icon: Puzzle, adminOnly: true, mobileHidden: true },
  ]
    .filter((i: any) => (i.adminOnly ? isAdmin : true))
    .filter((i: any) =>
      !(company as any)?.atendimento_operacional || !MODULOS_OCULTOS_MODO_OPERACIONAL.includes(i.to),
    )
    .filter((i: any) =>
      (company as any)?.funcoes_individuais && !isAdmin && !isSuperAdmin
        ? MODULOS_RESTRITOS.includes(i.to) || ((company as any)?.atendimento_operacional === true && i.to === "/app/crm")
        : true,
    )
    .filter((i: any) => capOk(i.capacidade))
    .filter((i: any) => !i.mobileHidden);


  // Usuários não-admin (atendentes, vendedores) só contam as conversas designadas a eles.
  const soMinhasConversas = !isAdmin && !isSuperAdmin;
  const unreadConversationsCount = useUnreadConversations(company?.id, {
    onlyOwnerId: soMinhasConversas ? userId ?? null : null,
  });

  const crmOculto = !!(company as any)?.funcoes_individuais && (company as any)?.atendimento_operacional !== true && !isAdmin && !isSuperAdmin;
  const mobileItems: MobileNavItem[] = [
    { to: "/app/dashboard", label: "Início", icon: LayoutDashboard },
    { to: "/app/conversas", label: "Conversas", icon: Inbox, badge: unreadConversationsCount },
    ...(crmOculto ? [] : [{ to: "/app/crm", label: "CRM", icon: KanbanSquare } as MobileNavItem]),
    { to: "/app/contatos", label: "Contatos", icon: Contact },
    { label: "Mais", icon: MoreHorizontal, onClick: () => setMoreOpen(true), active: moreOpen },
  ];


  // Sidebar collapse lifted here so the top bar toggle controls it
  const pathForLayout = pendingPath ?? loc.pathname;
  const isConversasPath = pathForLayout.startsWith("/app/conversas");
  const isCrmPath = pathForLayout.startsWith("/app/crm");
  const isTrainingPath = loc.pathname.startsWith("/app/treinamentos");
  const isCurrentConversasPath = loc.pathname.startsWith("/app/conversas");
  const isContainedPath = isConversasPath || isCrmPath;
  const [collapsed, setCollapsed] = useState<boolean>(() => isCurrentConversasPath);
  useEffect(() => {
    setCollapsed(isCurrentConversasPath);
  }, [isCurrentConversasPath]);
  const unreadConversations = unreadConversationsCount;
  useRealtimeSounds(company?.id);
  const { muted: soundsMuted, toggle: toggleSounds } = useSoundsMuted();


  return (
    <div className={`h-screen overflow-hidden flex flex-col bg-background text-foreground ${isTrainingPath ? "dark" : ""}`}>
      <TrialBanner company={company} isSuperAdmin={isSuperAdmin} />

      {/* Mobile / tablet-portrait top bar */}
      <header
        className="lg:hidden sticky top-0 z-30 flex items-center justify-between gap-3 px-4 py-3 text-foreground bg-card border-b border-border"
        style={{
          paddingTop: "max(0.75rem, env(safe-area-inset-top))",
          paddingLeft: "max(1rem, env(safe-area-inset-left))",
          paddingRight: "max(1rem, env(safe-area-inset-right))",
        }}
      >
        <div className="flex items-center min-w-0">
          <img src={logoFull.url} alt={brand.name} className="h-10 w-auto object-contain" loading="eager" decoding="async" />
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <NotificationsBell companyId={company?.id} />
          <button
            onClick={toggleSounds}
            title={soundsMuted ? "Ativar sons" : "Silenciar sons"}
            className="size-9 grid place-items-center rounded-lg text-muted-foreground hover:text-foreground"
          >
            {soundsMuted ? <VolumeX className="size-[18px]" /> : <Volume2 className="size-[18px]" />}
          </button>
          <button
            onClick={signOut}
            title="Sair"
            className="size-9 grid place-items-center rounded-lg text-muted-foreground hover:text-foreground"
          >
            <LogOut className="size-[18px]" />
          </button>
        </div>
      </header>

      <div className="flex flex-col lg:flex-row flex-1 min-h-0">
        {!isTrainingPath && (
          <Sidebar
            activePath={activePath}
            company={company}
            isSuperAdmin={isSuperAdmin}
            isAdmin={isAdmin}
            isPartner={isPartner}
            primary={primary}
            companyName={companyName}
            companyLogo={companyLogo}
            signOut={signOut}
            collapsed={collapsed}
            onToggleCollapsed={() => setCollapsed((v) => !v)}
            unreadConversations={unreadConversations}
            onNavigateStart={startModuleNavigation}
            userName={userName}
            userEmail={email}
            userAvatar={profile.avatar_url}
            userId={userId}
          />
        )}

        <div className="flex-1 min-w-0 min-h-0 flex flex-col">




          <main
            className={
              isTrainingPath
                ? "relative flex-1 min-w-0 min-h-0 w-full overflow-y-auto bg-[#050505]"
                : isConversasPath
                  ? "relative flex-1 min-w-0 min-h-0 w-full overflow-hidden"
                  : isCrmPath
                    ? "relative flex-1 min-w-0 min-h-0 w-full max-w-[1600px] 2xl:max-w-[1920px] mx-auto overflow-hidden px-3 pt-3 pb-24 sm:px-4 sm:pt-4 md:px-8 md:pt-6 lg:pb-6"
                    : "relative flex-1 min-w-0 min-h-0 overflow-y-auto px-3 pt-3 pb-28 sm:px-4 sm:pt-4 md:px-8 md:pt-6 lg:pb-8 w-full"
            }
          >
            {(pendingPath || routerBusy) && (
              <div className="absolute left-0 right-0 top-0 z-30 h-[2px] overflow-hidden bg-transparent" aria-hidden>
                <div className="h-full w-full animate-pulse rounded-full bg-[color:var(--brand)]" />
              </div>
            )}
            <div className={isConversasPath || isCrmPath || isTrainingPath ? "contents" : "max-w-[1600px] 2xl:max-w-[1920px] w-full mx-auto"}>
              {children}
            </div>
          </main>
        </div>
      </div>

      {!isTrainingPath && (
        <MobileBottomNav items={mobileItems} onNavigateStart={startModuleNavigation} activePath={activePath} />
      )}
      {!isTrainingPath && (
        <div className="hidden lg:block">
          <SupportFloatingButton companyId={company?.id ?? null} />
        </div>
      )}
      <OnboardingTour userId={userId} />


      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="lg:hidden rounded-t-2xl max-h-[80vh] overflow-y-auto pb-[max(1rem,env(safe-area-inset-bottom))]">
          <SheetHeader className="text-left">
            <SheetTitle>Mais módulos</SheetTitle>
          </SheetHeader>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Módulos administrativos (Plugins, Conexão, Agente IA, Campanhas) estão disponíveis no desktop.
          </p>

          <div className="mt-3 grid grid-cols-3 gap-2.5">
            {moreItems.map((it) => {
              const Icon = it.icon;
              const active = activePath.startsWith(it.to);
              return (
                <Link
                  key={it.to}
                  to={it.to}
                  preload="intent"
                  onClick={() => {
                    startModuleNavigation(it.to);
                    setMoreOpen(false);
                  }}
                  className="flex min-h-[86px] flex-col items-center justify-center gap-1.5 rounded-2xl border border-[color:var(--hairline)] bg-[color:var(--panel)] px-2 py-3 text-center transition-colors active:scale-[.98] hover:bg-[color:var(--panel-2)]"
                  style={active ? { color: primary, borderColor: primary, background: `color-mix(in oklab, ${primary} 8%, transparent)` } : undefined}
                >
                  <span
                    className="grid size-9 shrink-0 place-items-center rounded-xl"
                    style={{ background: active ? primary : "color-mix(in oklab, currentColor 8%, transparent)", color: active ? "#fff" : undefined }}
                  >
                    <Icon className="size-[18px]" strokeWidth={2} />
                  </span>
                  <span className="text-[11px] font-semibold leading-tight line-clamp-2">{it.label}</span>
                </Link>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>

    </div>
  );
}

function Sidebar({
  activePath, company, isSuperAdmin, isAdmin, isPartner, primary, companyName, companyLogo, signOut, collapsed, onToggleCollapsed, unreadConversations, onNavigateStart, userName, userEmail, userAvatar, userId,
}: any) {
  const flags = useFeatureFlags();
  const { muted: soundsMuted, toggle: toggleSounds } = useSoundsMuted();
  const [activeAgent, setActiveAgent] = useState<any>(null);

  useEffect(() => {
    if (!userId || !activePath.startsWith("/app/agente")) {
      setActiveAgent(null);
      return;
    }
    const fetchActiveAgent = async () => {
      const { data } = await supabase
        .from("agent_config")
        .select("avatar_traits, avatar_url, nome_agente")
        .eq("company_id", company?.id)
        .eq("tipo", "qualificacao") // ou logica para pegar o selecionado
        .limit(1)
        .maybeSingle();
      if (data) setActiveAgent(data);
    };
    fetchActiveAgent();
  }, [userId, company?.id, activePath]);

  const isFeatureVisible = (key?: string) => {
    if (!key) return true;
    if (isSuperAdmin) return true;
    const f = flags.find((x: FlagEntry) => x.key === key);
    if (!f) return true;
    return f.enabled;
  };
  const { capacidades: capsSidebar, carregando: capsSidebarCarregando } = useCapacidades();
  const isCapacidadeVisible = (slug?: string) => {
    if (!slug) return true;
    if (slug === "parceiro") return isPartner;
    return capsSidebarCarregando || capsSidebar.includes(slug);
  };



  const shortcuts = sections.flatMap((sec) => sec.items).filter((item) => item.to && (!item.adminOnly || isAdmin) && (!item.superOnly || isSuperAdmin) && (!item.operationalOnly || company?.atendimento_operacional === true) && !(company?.atendimento_operacional === true && MODULOS_OCULTOS_MODO_OPERACIONAL.includes(item.to)) && isFeatureVisible(item.flag) && isCapacidadeVisible(item.capacidade) && (!(company as any)?.funcoes_individuais || isAdmin || isSuperAdmin || MODULOS_RESTRITOS.includes(item.to) || (company?.atendimento_operacional === true && item.to === "/app/crm")));
  const width = collapsed ? "w-[72px]" : "w-[320px]";

  return (
    <aside
      className={`hidden lg:flex ${width} h-full min-h-0 transition-all duration-200 bg-card text-foreground border-r border-border`}
    >
      <div className="w-[72px] shrink-0 flex flex-col items-center border-r border-border py-4 gap-5">
        <Link to="/app/dashboard" title="Capi Conversa" className="grid size-11 place-items-center rounded-xl bg-muted overflow-hidden">
          <img src="/favicon.png" alt="Capi Conversa" className="size-9 object-contain" />
        </Link>
        <nav aria-label="Atalhos" className="flex-1 flex flex-col items-center gap-3 overflow-y-auto no-scrollbar">
          {shortcuts.map((item) => {
            const Icon = item.icon;
            const active = activePath.startsWith(item.to ?? "#");
            return <Link key={item.to} to={item.to} title={item.label} aria-label={item.label} onPointerDown={() => onNavigateStart?.(item.to)} className={`grid size-10 shrink-0 place-items-center rounded-xl transition-colors ${active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}><Icon className="size-5" strokeWidth={1.8} /></Link>;
          })}
        </nav>
        <button onClick={onToggleCollapsed} title={collapsed ? "Expandir menu" : "Recolher menu"} className="grid size-10 place-items-center rounded-full bg-muted text-foreground hover:bg-accent">
          {collapsed ? <ChevronsRight className="size-5" /> : <ChevronsLeft className="size-5" />}
        </button>
      </div>
      {!collapsed && <div className="w-[248px] min-w-0 h-full flex flex-col">
      {/* Brand + collapse toggle */}
      <div className="h-[72px] flex items-center gap-2 px-5 border-b border-border">
        <div className="flex-1 min-w-0 flex items-center justify-center">
          <img src={logoFull.url} alt={brand.name} className="h-14 w-full object-contain" />
        </div>
      </div>


      <nav className="px-3 py-4 [@media(max-height:820px)]:py-2 flex-1 overflow-y-auto overflow-x-hidden no-scrollbar space-y-4 [@media(max-height:820px)]:space-y-2">
        {sections.map((sec, i) => (
          <div key={sec.label}>
            {i > 0 && <div className="h-px bg-border mx-2 mb-3" />}
            <div className="px-3 pb-2 text-[10px] font-bold uppercase text-muted-foreground">{sec.label}</div>
            <div className="flex flex-col gap-[3px]">
              {sec.items.filter((i: any) => (!i.adminOnly || isAdmin) && (!i.superOnly || isSuperAdmin) && (!i.operationalOnly || company?.atendimento_operacional === true) && !(company?.atendimento_operacional === true && i.to && MODULOS_OCULTOS_MODO_OPERACIONAL.includes(i.to)) && isFeatureVisible(i.flag) && isCapacidadeVisible(i.capacidade) && (!(company as any)?.funcoes_individuais || isAdmin || isSuperAdmin || MODULOS_RESTRITOS.includes(i.to) || (company?.atendimento_operacional === true && i.to === "/app/crm"))).map((item: any) => (
                item.children
                  ? <NavGroup key={item.label} item={item} activePath={activePath} primary={primary} collapsed={collapsed} isAdmin={isAdmin} onNavigateStart={onNavigateStart} />
                  : <NavLink key={item.to} item={item} active={activePath.startsWith(item.to!)} primary={primary} collapsed={collapsed} badgeCount={item.to === "/app/conversas" ? unreadConversations : 0} onNavigateStart={onNavigateStart} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="p-3 border-t border-border">
        <DropdownMenu>


          <DropdownMenuTrigger asChild>
            <button
              className={`w-full flex items-center gap-3 ${collapsed ? "px-0 justify-center" : "px-1"} py-1 rounded-lg hover:bg-muted transition-colors outline-none`}
              title={collapsed ? userName : undefined}
            >
              <div className="relative shrink-0">
                {activePath.startsWith("/app/agente") && (activeAgent?.avatar_traits || activeAgent?.avatar_url) ? (
                  <AgentAvatar 
                    traits={activeAgent.avatar_traits} 
                    avatarUrl={activeAgent.avatar_url} 
                    size={40} 
                    className="ring-2 ring-white/25"
                  />
                ) : (
                  <div
                    className="size-10 rounded-full grid place-items-center text-[13px] font-bold text-foreground bg-accent overflow-hidden ring-2 ring-border"
                  >
                    {userAvatar ? (
                      <img src={userAvatar} alt={userName} className="size-full object-cover" />
                    ) : (
                      (userName || "U").slice(0, 1).toUpperCase()
                    )}
                  </div>
                )}
                {unreadConversations > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] px-1 rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold grid place-items-center ring-2 ring-card">
                    {unreadConversations > 9 ? "9+" : unreadConversations}
                  </span>
                )}
              </div>
              {!collapsed && (
                <>
                  <div className="min-w-0 flex-1 text-left">
                    <div className="text-[13px] font-semibold truncate text-foreground leading-tight" title={(activePath.startsWith("/app/agente") && activeAgent?.nome_agente) || userName}>
                      {(activePath.startsWith("/app/agente") && activeAgent?.nome_agente) || userName}
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate leading-tight" title={userEmail}>{userEmail}</div>
                  </div>
                  <ChevronDown className="size-4 text-muted-foreground shrink-0" />
                </>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-60 mb-1">
            <DropdownMenuLabel>
              <div className="flex flex-col">
                <span className="text-sm font-semibold truncate">{userName}</span>
                <span className="text-xs text-muted-foreground truncate">{userEmail}</span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <div className="px-1 py-0.5">
              <NotificationsBell companyId={company?.id} variant="menu" />
            </div>
            <DropdownMenuItem onClick={(e) => { e.preventDefault(); toggleSounds(); }}>
              {soundsMuted ? <VolumeX className="size-4 mr-2" /> : <Volume2 className="size-4 mr-2" />}
              {soundsMuted ? "Ativar sons" : "Silenciar sons"}
            </DropdownMenuItem>



            <DropdownMenuItem asChild>
              <Link to="/app/configuracoes"><UserIcon className="size-4 mr-2" />Meu perfil</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/app/configuracoes"><Settings className="size-4 mr-2" />Configurações</Link>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => window.dispatchEvent(new Event("tour:start"))}>
              <Zap className="size-4 mr-2" />Fazer tour novamente
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={signOut} className="text-destructive focus:text-destructive">
              <LogOut className="size-4 mr-2" />Sair
            </DropdownMenuItem>

          </DropdownMenuContent>
        </DropdownMenu>
      </div></div>}
    </aside>
  );
}



function NavLink({ item, active, primary, collapsed, badgeCount, onNavigateStart }: { item: NavItem; active: boolean; primary: string; collapsed?: boolean; badgeCount?: number; onNavigateStart?: (to?: string) => void }) {
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      preload="intent"
      onPointerDown={() => onNavigateStart?.(item.to)}
      onClick={(event) => {
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        onNavigateStart?.(item.to);
      }}
      title={collapsed ? item.label : undefined}
      className={`group relative flex items-center ${collapsed ? "justify-center px-0 py-2.5 [@media(max-height:820px)]:py-1.5" : "gap-3 px-3 py-2 [@media(max-height:820px)]:py-1.5"} rounded-lg text-[13.5px] font-medium whitespace-nowrap transition-colors ${
        active
          ? "bg-primary text-primary-foreground"
          : "text-foreground hover:bg-muted"
      }`}
    >
      <div className="relative shrink-0">
        <Icon
          className="size-[17px] transition-colors"
          strokeWidth={active ? 2.2 : 1.9}
        />
        {collapsed && !!badgeCount && badgeCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[15px] h-[15px] px-1 rounded-full bg-red-500 text-white text-[9px] font-bold grid place-items-center ring-2 ring-[color:var(--brand)]">
            {badgeCount > 9 ? "9+" : badgeCount}
          </span>
        )}
      </div>
      {!collapsed && (
        <>
          <span className="flex-1 truncate">{item.label}</span>
          {!!badgeCount && badgeCount > 0 && (
          <span className="min-w-[18px] h-[18px] px-1.5 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold grid place-items-center">
              {badgeCount > 99 ? "99+" : badgeCount}
            </span>
          )}
          {item.tag && (
            <span
              className={`text-[9.5px] font-bold px-1.5 py-0.5 rounded ${
                active ? "bg-card text-foreground" : "bg-muted text-muted-foreground"
              }`}
            >
              {item.tag}
            </span>
          )}
        </>
      )}
    </Link>
  );
}


function NavGroup({ item, activePath, primary, collapsed, isAdmin, onNavigateStart }: { item: NavItem; activePath: string; primary: string; collapsed?: boolean; isAdmin?: boolean; onNavigateStart?: (to?: string) => void }) {
  const children = (item.children || []).filter((c) => !c.adminOnly || isAdmin);
  const anyActive = useMemo(() => children.some((c) => c.to && activePath.startsWith(c.to)), [children, activePath]);
  const [open, setOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return anyActive;
    const saved = localStorage.getItem(`navgroup_${item.label}`);
    return saved === null ? anyActive : saved === "1";
  });
  useEffect(() => { if (anyActive) setOpen(true); }, [anyActive]);
  useEffect(() => { try { localStorage.setItem(`navgroup_${item.label}`, open ? "1" : "0"); } catch {} }, [open, item.label]);

  const Icon = item.icon;

  if (collapsed) {
    // Em modo colapsado, mostra apenas os filhos como ícones diretos
    return (
      <>
        {children.map((c) => (
          <NavLink key={c.to} item={c} active={!!c.to && activePath.startsWith(c.to)} primary={primary} collapsed onNavigateStart={onNavigateStart} />
        ))}
      </>
    );
  }

  return (
    <div className="flex flex-col">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`relative flex items-center gap-3 px-3 py-2 rounded-lg text-[13.5px] font-medium whitespace-nowrap transition-colors ${
          anyActive ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted"
        }`}
      >
        <Icon className="size-[17px] shrink-0" strokeWidth={anyActive ? 2.2 : 1.9} />
        <span className="flex-1 text-left truncate">{item.label}</span>
        <ChevronDown className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="ml-3 pl-3 mt-0.5 border-l border-border flex flex-col gap-[2px]">
          {children.map((c) => (
            <NavLink key={c.to} item={c} active={!!c.to && activePath.startsWith(c.to)} primary={primary} onNavigateStart={onNavigateStart} />
          ))}
        </div>
      )}
    </div>
  );
}



function WhatsappStatusPill() {
  const status = useWhatsappStatus();
  const connected = status === "connected";
  const connecting = status === "connecting";
  const label = connected ? "WhatsApp conectado" : connecting ? "Conectando…" : "WhatsApp desconectado";
  const color = connected ? "#16a34a" : connecting ? "#f59e0b" : "#dc2626";
  return (
    <div
      className="flex items-center gap-2 text-[13.5px] font-medium px-3 py-1.5 rounded-full bg-[color:var(--panel)] border border-[color:var(--hairline)]"
      style={{ color }}
    >
      <span className="size-1.5 rounded-full" style={{ background: color, boxShadow: `0 0 10px ${color}` }} />
      {label}
    </div>
  );
}

function WhatsappDisconnectedBanner() {
  const status = useWhatsappStatus();
  if (status !== "disconnected") return null;
  return (
    <div className="flex items-center justify-between gap-3 px-4 lg:px-6 py-2 bg-red-50 border-b border-red-200 text-red-700 text-[13px]">
      <div className="flex items-center gap-2">
        <span className="size-2 rounded-full bg-red-600 animate-pulse" />
        <span className="font-medium">WhatsApp desconectado.</span>
        <span className="hidden sm:inline text-red-600/80">Verifique internet/bateria do celular e reconecte.</span>
      </div>
      <Link to="/app/conexao" className="text-[12.5px] font-semibold underline underline-offset-2 hover:text-red-800">
        Ir para Conexão
      </Link>
    </div>
  );
}

