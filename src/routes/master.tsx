import { createFileRoute, Outlet, redirect, Link, useLocation } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { brand } from "@/config/brand";
import {
  LogOut, BarChart3, Building2, Settings, ArrowLeft, Package, CreditCard,
  ChevronDown, Shield, HeadsetIcon, ChevronsLeft, ChevronsRight,
  GraduationCap, Users, Send, Lightbulb, Radar
} from "lucide-react";



import { MasterSubTabs, groupForPath, type MasterTab } from "@/components/master-subtabs";

import { MobileBottomNav, type MobileNavItem } from "@/components/mobile-bottom-nav";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import logoFull from "@/assets/metrix-bubble-v4.png.asset.json";
import faviconMark from "@/assets/metrix-mark.png.asset.json";

import { toast } from "sonner";
import { useMasterAlerts } from "@/hooks/use-master-alerts";
import { MasterAlertsBell } from "@/components/master/alerts-bell";
import type { MasterAlertGroup } from "@/lib/master-alerts.functions";


export const Route = createFileRoute("/master")({
  ssr: false,
  beforeLoad: async () => {
    let authResult: Awaited<ReturnType<typeof supabase.auth.getUser>>;
    try {
      authResult = await supabase.auth.getUser();
    } catch (cause) {
      throw cause instanceof Error
        ? cause
        : new Error("Não foi possível validar a sessão administrativa");
    }
    const { data: u, error: authError } = authResult;
    if (authError) throw new Error(authError.message || "Não foi possível validar a sessão administrativa");
    if (!u.user) throw redirect({ to: "/entrar" });
    const { data: roles, error: rolesError } = await supabase.from("user_roles").select("role").eq("user_id", u.user.id);
    if (rolesError) throw new Error(rolesError.message || "Não foi possível validar as permissões administrativas");
    const isSuper = (roles ?? []).some((r: any) => r.role === "super_admin");
    if (!isSuper) {
      await supabase.auth.signOut();
      throw redirect({ to: "/entrar", search: { modo: "login" } });
    }
    return { user: u.user };
  },
  component: MasterLayout,
});

type NavItem = { to: string; label: string; icon: any; group?: MasterAlertGroup };
type NavSection = { title: string; items: NavItem[] };

const navSections: NavSection[] = [
  {
    title: "Operação",
    items: [
      { to: "/master/painel", label: "Visão geral", icon: BarChart3 },
      { to: "/master/clientes", label: "Clientes", icon: Building2, group: "clientes" },
      { to: "/master/suporte", label: "Suporte", icon: HeadsetIcon, group: "suporte" },
    ],
  },
  {
    title: "Receita",
    items: [
      { to: "/master/financeiro", label: "Financeiro", icon: CreditCard, group: "financeiro" },
      { to: "/master/planos", label: "Catálogo", icon: Package },
      { to: "/master/parceiros", label: "Parceiros", icon: Users },
    ],
  },
  {
    title: "Plataforma",
    items: [
      { to: "/master/crm-admin", label: "CRM Admin", icon: Send },
      { to: "/master/sugestoes", label: "Sugestões", icon: Lightbulb },
      { to: "/master/treinamentos", label: "Treinamentos", icon: GraduationCap, group: "treinamentos" },
      { to: "/master/sistema", label: "Sistema", icon: Settings, group: "sistema" },
    ],
  },

];

const mobileItems: MobileNavItem[] = [
  { to: "/master/painel", label: "Visão", icon: BarChart3 },
  { to: "/master/clientes", label: "Clientes", icon: Building2 },
  { to: "/master/financeiro", label: "Financ.", icon: CreditCard },
  { to: "/master/planos", label: "Catálogo", icon: Package },
  { to: "/master/suporte", label: "Suporte", icon: HeadsetIcon },
  { to: "/master/sistema", label: "Sistema", icon: Settings },
  { to: "/master/treinamentos", label: "Cursos", icon: GraduationCap },
];




function MasterLayout() {
  const loc = useLocation();
  const ctx = Route.useRouteContext() as any;
  const email: string | null = ctx?.user?.email ?? null;
  const userId: string | null = ctx?.user?.id ?? null;
  const fallbackName = (email || "Master").split("@")[0];
  const [profile, setProfile] = useState<{ nome: string; avatar_url: string }>({ nome: "", avatar_url: "" });
  const [collapsed, setCollapsed] = useState(false);
  const alertsState = useMasterAlerts();


  useEffect(() => {
    if (!userId) return;
    void (async () => {
      const { data } = await supabase.from("profiles").select("nome, avatar_url").eq("user_id", userId).maybeSingle();
      if (data) setProfile({ nome: (data as any).nome ?? "", avatar_url: (data as any).avatar_url ?? "" });
    })();
  }, [userId]);

  const userName = profile.nome || fallbackName;

  async function signOut() {
    await supabase.auth.signOut();
    toast.success("Sessão encerrada");
    window.location.href = "/entrar";
  }

  const width = collapsed ? "w-[76px]" : "w-[248px]";

  return (
    <div className="h-screen overflow-hidden flex flex-col bg-background text-foreground">
      {/* Mobile top bar */}
      <header className="lg:hidden sticky top-0 z-30 flex items-center justify-between gap-3 px-4 py-3 text-white" style={{ background: "#214AC4" }}>
        <div className="flex items-center min-w-0">
          <img src={logoFull.url} alt={brand.name} className="h-7 w-auto object-contain" />
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="hidden xs:flex items-center gap-1.5 text-[11.5px] font-semibold px-2.5 py-1 rounded-full bg-white/15">
            <Shield className="size-3.5" /> Master
          </span>
          <Link
            to="/app/dashboard"
            title="Voltar ao app"
            className="h-9 px-2.5 flex items-center gap-1.5 rounded-lg text-[12px] font-medium text-white/85 hover:text-white hover:bg-white/10"
          >
            <ArrowLeft className="size-[18px]" />
            <span className="hidden sm:inline">Voltar ao app</span>
          </Link>
          <MasterAlertsBell state={alertsState} />

          <button
            onClick={signOut}

            title="Sair"
            className="size-9 grid place-items-center rounded-lg text-white/80 hover:text-white hover:bg-white/10"
          >
            <LogOut className="size-[18px]" />
          </button>
        </div>
      </header>

      <div className="flex flex-col lg:flex-row flex-1 min-h-0">
        {/* Sidebar — mesma identidade do app */}
        <aside
          className={`hidden lg:flex ${width} h-full min-h-0 flex-col transition-all duration-200 text-white shadow-[0_10px_40px_-20px_rgba(33,74,196,.55)]`}
          style={{ background: "#214AC4" }}
        >
          <div className="h-16 flex items-center gap-2 px-3 border-b border-white/10">
            <div className="flex-1 min-w-0 flex items-center justify-center">
              <img
                src={collapsed ? faviconMark.url : logoFull.url}
                alt={brand.name}
                className={`${collapsed ? "h-9" : "h-9"} w-auto object-contain`}
              />
            </div>
            {!collapsed && (
              <button
                onClick={() => setCollapsed(true)}
                title="Recolher menu"
                className="size-8 grid place-items-center rounded-lg text-white/80 hover:text-white hover:bg-white/10 shrink-0"
              >
                <ChevronsLeft className="size-[18px]" />
              </button>
            )}
          </div>
          {collapsed && (
            <button
              onClick={() => setCollapsed(false)}
              title="Expandir menu"
              className="mx-auto mt-2 size-8 grid place-items-center rounded-lg text-white/80 hover:text-white hover:bg-white/10"
            >
              <ChevronsRight className="size-[18px]" />
            </button>
          )}

          <div className={`px-3 pt-3 flex items-center ${collapsed ? "justify-center" : "justify-between"} gap-2`}>
            {!collapsed && (
              <div className="flex items-center gap-2 text-[11.5px] font-semibold px-3 py-1.5 rounded-full bg-white/15 text-white w-fit">
                <Shield className="size-3.5" /> Modo super admin
              </div>
            )}
            <MasterAlertsBell state={alertsState} />
          </div>

          <nav className="px-3 py-4 [@media(max-height:820px)]:py-2 flex-1 overflow-y-auto overflow-x-hidden no-scrollbar">
            <div className="flex flex-col gap-1">
              {navSections.map((section) => (
                <div key={section.title} className="flex flex-col gap-[3px] mb-2">
                  {!collapsed && (
                    <div className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-[.12em] text-white/45">
                      {section.title}
                    </div>
                  )}
                  {collapsed && <div className="h-px bg-white/10 mx-2 my-1.5" />}
                  {section.items.map((item) => {
                const g = groupForPath(item.to);
                const active = g
                  ? g.tabs.some((t: MasterTab) => loc.pathname.startsWith(t.to))
                  : loc.pathname.startsWith(item.to);

                const c = item.group ? alertsState.counts[item.group] : null;
                const urgent = c?.urgent ?? 0;
                const info = c?.info ?? 0;
                const badge = urgent || info;

                const Icon = item.icon;
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    preload="intent"
                    title={collapsed ? item.label : undefined}
                    className={`group relative flex items-center ${collapsed ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2"} rounded-lg text-[13.5px] font-medium whitespace-nowrap transition-colors ${
                      active ? "bg-white text-[color:var(--brand-text)] shadow-sm" : "text-white hover:bg-white/10"
                    }`}
                  >
                    <Icon className="size-[17px] shrink-0" strokeWidth={active ? 2.2 : 1.9} />
                    {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
                    {badge > 0 && (
                      <span
                        className={`${collapsed ? "absolute top-1 right-2 size-2 p-0" : "min-w-[18px] h-[18px] px-1 text-[10px]"} grid place-items-center rounded-full font-bold leading-none text-white ${
                          urgent > 0 ? "bg-red-500 animate-pulse" : "bg-emerald-500"
                        }`}
                      >
                        {!collapsed && (badge > 9 ? "9+" : badge)}
                      </span>
                    )}
                  </Link>
                 );
                  })}
                </div>
              ))}
            </div>

            <div className="h-px bg-white/10 mx-2 my-3" />

            <Link
              to="/app/dashboard"
              title={collapsed ? "Voltar ao app" : undefined}
              className={`flex items-center ${collapsed ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2"} rounded-lg text-[13px] text-white/80 hover:text-white hover:bg-white/10 transition-colors`}
            >
              <ArrowLeft className="size-[17px] shrink-0" />
              {!collapsed && <span className="truncate">Voltar ao app</span>}
            </Link>
          </nav>

          <div className="p-3 border-t border-white/10">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className={`w-full flex items-center gap-3 ${collapsed ? "px-0 justify-center" : "px-1"} py-1 rounded-lg hover:bg-white/10 transition-colors outline-none`}
                  title={collapsed ? userName : undefined}
                >
                  <div
                    className="size-10 rounded-full grid place-items-center text-[13px] font-bold text-white overflow-hidden ring-2 ring-white/25 shrink-0"
                    style={{ background: profile.avatar_url ? "transparent" : "rgba(255,255,255,.15)" }}
                  >
                    {profile.avatar_url ? (
                      <img src={profile.avatar_url} alt={userName} className="size-full object-cover" />
                    ) : (
                      (userName || "M").slice(0, 1).toUpperCase()
                    )}
                  </div>
                  {!collapsed && (
                    <>
                      <div className="min-w-0 flex-1 text-left">
                        <div className="text-[13px] font-semibold truncate text-white leading-tight">{userName}</div>
                        <div className="text-[11px] text-white/65 truncate leading-tight">{email}</div>
                      </div>
                      <ChevronDown className="size-4 text-white/70 shrink-0" />
                    </>
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start" className="w-60 mb-1">
                <DropdownMenuLabel>
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold truncate">{userName}</span>
                    <span className="text-xs text-muted-foreground truncate">{email}</span>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/app/dashboard"><ArrowLeft className="size-4 mr-2" />Voltar ao app</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/master/perfil"><Shield className="size-4 mr-2" />Meu perfil</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/master/sistema"><Settings className="size-4 mr-2" />Sistema</Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={signOut} className="text-destructive focus:text-destructive">
                  <LogOut className="size-4 mr-2" />Sair
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </aside>

        {/* Main */}
        <div className="flex-1 min-w-0 min-h-0 flex flex-col">
          <MasterSubTabs />

          <main className="flex-1 min-w-0 min-h-0 overflow-y-auto px-3 pt-3 pb-28 sm:px-4 sm:pt-4 md:px-8 md:pt-6 lg:pb-8 w-full">
            <div className="max-w-[1600px] 2xl:max-w-[1920px] w-full mx-auto">
              <Outlet />
            </div>
          </main>
        </div>
      </div>

      <MobileBottomNav items={mobileItems} accent="#ffffff" />
    </div>
  );
}

