import { useLanguage } from "@/lib/i18n/context";
import type { SupportedLanguage } from "@/lib/i18n/translations";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Check, Globe } from "lucide-react";
import { cn } from "@/lib/utils";

export function LanguageSwitcher({
  variant = "dropdown",
  className,
}: {
  variant?: "dropdown" | "compact" | "pill" | "select";
  className?: string;
}) {
  const { language, setLanguage, languages, t } = useLanguage();
  const currentLang = languages.find((l) => l.code === language) || languages[0];

  if (variant === "select") {
    return (
      <select
        value={language}
        onChange={(e) => setLanguage(e.target.value as SupportedLanguage)}
        className={cn(
          "w-full rounded-md border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary",
          className
        )}
      >
        {languages.map((l) => (
          <option key={l.code} value={l.code}>
            {l.flag} {l.nativeName} ({l.name})
          </option>
        ))}
      </select>
    );
  }

  if (variant === "compact") {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              "flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/60 transition",
              className
            )}
            title={t("common.switch_language")}
          >
            <span className="text-base leading-none">{currentLang.flag}</span>
            <span className="uppercase tracking-wider">{currentLang.code}</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          {languages.map((l) => (
            <DropdownMenuItem
              key={l.code}
              onClick={() => setLanguage(l.code)}
              className="flex items-center justify-between cursor-pointer text-xs py-2"
            >
              <span className="flex items-center gap-2">
                <span>{l.flag}</span>
                <span className="font-medium">{l.nativeName}</span>
              </span>
              {l.code === language && <Check className="size-3.5 text-primary" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  if (variant === "pill") {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              "inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-border/60 bg-background/80 backdrop-blur-sm text-xs font-medium text-foreground hover:bg-muted transition shadow-xs",
              className
            )}
          >
            <Globe className="size-3.5 text-muted-foreground" />
            <span>{currentLang.flag} {currentLang.nativeName}</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          {languages.map((l) => (
            <DropdownMenuItem
              key={l.code}
              onClick={() => setLanguage(l.code)}
              className="flex items-center justify-between cursor-pointer text-xs py-2"
            >
              <span className="flex items-center gap-2">
                <span className="text-sm">{l.flag}</span>
                <span className="font-medium">{l.nativeName}</span>
              </span>
              {l.code === language && <Check className="size-3.5 text-primary" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  // Default dropdown button
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn("h-8 gap-1.5 px-2.5 text-xs font-medium border-border/70", className)}
        >
          <span className="text-sm">{currentLang.flag}</span>
          <span>{currentLang.nativeName}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        {languages.map((l) => (
          <DropdownMenuItem
            key={l.code}
            onClick={() => setLanguage(l.code)}
            className="flex items-center justify-between cursor-pointer text-xs py-2"
          >
            <span className="flex items-center gap-2">
              <span className="text-sm">{l.flag}</span>
              <span className="font-medium">{l.nativeName}</span>
            </span>
            {l.code === language && <Check className="size-3.5 text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
