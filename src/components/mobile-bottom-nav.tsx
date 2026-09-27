import { Link, useLocation } from "@tanstack/react-router";

export type MobileNavItem = {
  to?: string;
  label: string;
  icon: any;
  onClick?: () => void;
  active?: boolean;
  badge?: number;
};

export function MobileBottomNav({
  items,
  accent = "var(--foreground)",
  onNavigateStart,
  activePath,
}: {
  items: MobileNavItem[];
  accent?: string;
  onNavigateStart?: (to?: string) => void;
  activePath?: string;
}) {
  const loc = useLocation();
  const path = activePath ?? loc.pathname;
  return (
    <nav
      className="mobile-bottom-nav lg:hidden fixed bottom-0 inset-x-0 z-40 px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2"
      aria-label="Navegação principal"
    >
      <div
        className="mx-auto max-w-md sm:max-w-lg rounded-2xl border border-border bg-card shadow-sm flex items-center justify-around px-1.5 py-1.5"
      >
        {items.map((it, idx) => {
          const active =
            it.active ??
            (it.to
              ? it.to === path ||
                (it.to !== "/" && path.startsWith(it.to))
              : false);
          const Icon = it.icon;
          const className =
            `tt-exempt relative min-w-0 flex-1 flex flex-col items-center justify-center gap-0.5 px-0.5 py-1.5 min-h-[48px] rounded-xl text-[10px] sm:text-[10.5px] font-medium transition-all ${active ? "bg-primary" : "text-muted-foreground"}`;
          const style = active ? { color: accent } : undefined;
          const inner = (
            <>
              <span className="relative">
                <Icon className="size-[20px] sm:size-[22px] shrink-0" strokeWidth={active ? 2.4 : 1.9} />
                {!!it.badge && it.badge > 0 && (
                  <span className="absolute -top-1.5 -right-2 min-w-[15px] h-[15px] px-1 grid place-items-center rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold leading-none">
                    {it.badge > 9 ? "9+" : it.badge}
                  </span>
                )}
              </span>
              <span className="truncate max-w-full leading-tight">{it.label}</span>

            </>
          );
          if (it.onClick || !it.to) {
            return (
              <button
                key={idx}
                type="button"
                onClick={it.onClick}
                className={className}
                style={style}
              >
                {inner}
              </button>
            );
          }
          return (
            <Link
              key={idx}
              to={it.to}
              preload="viewport"
              onPointerDown={() => onNavigateStart?.(it.to)}
              onClick={(event) => {
                if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                onNavigateStart?.(it.to);
              }}
              className={className}
              style={style}
            >
              {inner}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
