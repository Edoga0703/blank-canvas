import { Link, useLocation } from "@tanstack/react-router";

export type MasterTab = { to: string; label: string; search?: Record<string, string> };


/** Grupos do painel master: 6 itens no menu, sub-abas dentro de cada grupo. */
export const masterGroups: { id: string; tabs: MasterTab[] }[] = [
  {
    id: "clientes",
    tabs: [{ to: "/master/clientes", label: "Clientes" }],
  },

  {
    id: "financeiro",
    tabs: [{ to: "/master/financeiro", label: "Financeiro" }],
  },
  {
    id: "parceiros",
    tabs: [{ to: "/master/parceiros", label: "Parceiros" }],
  },
  {
    id: "crm-admin",
    tabs: [{ to: "/master/crm-admin", label: "CRM Admin" }],
  },

  {
    id: "catalogo",
    tabs: [
      { to: "/master/planos", label: "Planos" },
      { to: "/master/addons", label: "Upgrades" },
      { to: "/master/plugins", label: "Plugins" },
    ],
  },
  {
    id: "suporte",
    tabs: [
      { to: "/master/suporte", label: "Tickets" },
      { to: "/master/suporte", label: "Métricas", search: { v: "metricas" } },
      { to: "/master/suporte", label: "Automação", search: { v: "automacao" } },
      { to: "/master/suporte", label: "Respostas rápidas", search: { v: "macros" } },
    ],
  },

  {
    id: "sistema",
    tabs: [
      { to: "/master/diagnostico", label: "Monitoramento WhatsApp" },
      { to: "/master/sistema", label: "Inteligência Artificial" },
      { to: "/master/sistema", label: "Popups e Avisos", search: { v: "popups" } },
      { to: "/master/configuracoes", label: "Webhooks" },
      { to: "/master/feature-flags", label: "Feature flags" },
      { to: "/master/notificacoes", label: "Notificações" },
    ],
  },
  {
    id: "sugestoes",
    tabs: [{ to: "/master/sugestoes", label: "Sugestões" }],
  },


  {
    id: "treinamentos",
    tabs: [
      { to: "/master/treinamentos", label: "Cursos" },
      { to: "/master/treinamentos", label: "Categorias", search: { v: "categorias" } },
      { to: "/master/treinamentos", label: "Banners", search: { v: "banners" } },
      { to: "/master/treinamentos", label: "Conteúdo", search: { v: "conteudo" } },
      { to: "/master/treinamentos", label: "Ajustes", search: { v: "ajustes" } },
    ],
  },

];

export function groupForPath(pathname: string) {
  return masterGroups.find((g) => g.tabs.some((t) => pathname.startsWith(t.to))) ?? null;
}

export function MasterSubTabs() {
  const loc = useLocation();
  const group = groupForPath(loc.pathname);
  if (!group || group.tabs.length < 2) return null;

  return (
    <div className="border-b border-[color:var(--hairline)] bg-white px-3 sm:px-4 md:px-8">
      <div className="max-w-[1600px] 2xl:max-w-[1920px] mx-auto flex items-center gap-1 overflow-x-auto no-scrollbar">
        {group.tabs.map((t) => {
          const currentV = (loc.search as Record<string, unknown> | undefined)?.v as string | undefined;
          const tabV = t.search?.v;
          const active = loc.pathname.startsWith(t.to) && (currentV ?? "") === (tabV ?? "");
          return (
            <Link
              key={`${t.to}-${tabV ?? ""}`}
              to={t.to}
              search={(t.search ?? {}) as never}

              className={`relative shrink-0 px-3 py-2.5 text-[13px] font-medium whitespace-nowrap transition-colors ${
                active ? "text-[color:var(--brand-text)]" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
              {active && (
                <span
                  className="absolute left-2 right-2 -bottom-px h-[2px] rounded-full"
                  style={{ background: "var(--brand)" }}
                />
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
