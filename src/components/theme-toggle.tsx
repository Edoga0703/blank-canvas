import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { useLanguage } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";

const THEME_EVENT = "capiversa:theme-change";

function getInitialTheme(): "dark" | "light" {
  if (typeof document === "undefined") return "light";
  if (document.documentElement.classList.contains("dark")) return "dark";
  try {
    return localStorage.getItem("theme") === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

function applyTheme(next: "dark" | "light") {
  const root = document.documentElement;
  if (next === "dark") root.classList.add("dark");
  else root.classList.remove("dark");
  try {
    localStorage.setItem("theme", next);
  } catch {}
  try {
    window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: next }));
  } catch {}
}

export function ThemeToggle({
  className = "",
  variant = "icon",
}: {
  className?: string;
  variant?: "icon" | "segmented" | "menu";
}) {
  const { t } = useLanguage();
  const [theme, setTheme] = useState<"dark" | "light">("light");

  useEffect(() => {
    setTheme(getInitialTheme());
    const onThemeEvent = (ev: Event) => {
      const detail = (ev as CustomEvent<"dark" | "light">).detail;
      if (detail === "dark" || detail === "light") setTheme(detail);
    };
    const onStorage = (ev: StorageEvent) => {
      if (ev.key === "theme") {
        setTheme(ev.newValue === "dark" ? "dark" : "light");
      }
    };
    window.addEventListener(THEME_EVENT, onThemeEvent);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(THEME_EVENT, onThemeEvent);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const isDark = theme === "dark";
  const labelLight = t("common.light_mode", undefined, "Modo claro");
  const labelDark = t("common.dark_mode", undefined, "Modo oscuro");
  const nextLabel = isDark ? labelLight : labelDark;

  function toggle() {
    const next = isDark ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
  }

  if (variant === "segmented") {
    return (
      <div
        className={cn(
          "inline-flex items-center rounded-xl border border-border/80 bg-muted/60 p-1 shadow-2xs shrink-0",
          className,
        )}
        role="group"
        aria-label={t("common.theme", undefined, "Tema")}
      >
        <button
          type="button"
          onClick={() => {
            setTheme("light");
            applyTheme("light");
          }}
          title={labelLight}
          className={cn(
            "inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg transition-all",
            !isDark
              ? "bg-background text-foreground shadow-xs ring-1 ring-border"
              : "text-muted-foreground hover:text-foreground hover:bg-background/40",
          )}
        >
          <Sun className="size-3.5" />
          <span className="text-[11px]">{t("common.theme_light_short", undefined, "Claro")}</span>
        </button>
        <button
          type="button"
          onClick={() => {
            setTheme("dark");
            applyTheme("dark");
          }}
          title={labelDark}
          className={cn(
            "inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg transition-all",
            isDark
              ? "bg-background text-foreground shadow-xs ring-1 ring-border"
              : "text-muted-foreground hover:text-foreground hover:bg-background/40",
          )}
        >
          <Moon className="size-3.5" />
          <span className="text-[11px]">{t("common.theme_dark_short", undefined, "Oscuro")}</span>
        </button>
      </div>
    );
  }

  if (variant === "menu") {
    return (
      <button
        type="button"
        onClick={toggle}
        className={cn(
          "w-full flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-foreground hover:bg-accent hover:text-accent-foreground transition-colors",
          className,
        )}
      >
        {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
        <span>{nextLabel}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      title={nextLabel}
      aria-label={nextLabel}
      className={cn(
        "size-9 shrink-0 grid place-items-center rounded-lg bg-muted text-foreground hover:bg-primary hover:text-primary-foreground transition-colors outline-none",
        className,
      )}
    >
      {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}
