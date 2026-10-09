import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

function getInitialTheme(): "dark" | "light" {
  if (typeof document === "undefined") return "light";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export function ThemeToggle({ className = "" }: { className?: string }) {
  const [theme, setTheme] = useState<"dark" | "light">("light");

  useEffect(() => {
    setTheme(getInitialTheme());
  }, []);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    const root = document.documentElement;
    if (next === "dark") root.classList.add("dark");
    else root.classList.remove("dark");
    try {
      localStorage.setItem("theme", next);
    } catch {}
  }

  const isDark = theme === "dark";
  return (
    <button
      type="button"
      onClick={toggle}
      title={isDark ? "Tema claro" : "Tema escuro"}
      aria-label="Alternar tema"
      className={`size-9 grid place-items-center rounded-full border-0 outline-none ring-0 focus:outline-none focus:ring-0 bg-[#f1f2f4] text-foreground hover:bg-[#292cff] hover:text-white transition-colors ${className}`}
    >
      {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}
