import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarIcon, Check } from "lucide-react";
import { customRange, labelOf, lastDaysRange, monthRange, prevMonthRange, type Range } from "@/lib/comercial-range";
import { useLanguage } from "@/lib/i18n/context";

export type PeriodValue = { range: Range; label: string; preset: string };

export function defaultPeriod(lang?: string): PeriodValue {
  const isPt = lang === "pt";
  const isEn = lang === "en";
  return {
    range: monthRange(),
    label: isPt ? "Este mês" : isEn ? "This month" : "Este mes",
    preset: "mes"
  };
}

const PRESET_DEFS = [
  { key: "mes", pt: "Este mês", es: "Este mes", en: "This month", make: () => monthRange() },
  { key: "mes-anterior", pt: "Mês anterior", es: "Mes anterior", en: "Previous month", make: () => prevMonthRange() },
  { key: "7", pt: "Últimos 7 dias", es: "Últimos 7 días", en: "Last 7 days", make: () => lastDaysRange(7) },
  { key: "30", pt: "Últimos 30 dias", es: "Últimos 30 días", en: "Last 30 days", make: () => lastDaysRange(30) },
  { key: "90", pt: "Últimos 90 dias", es: "Últimos 90 días", en: "Last 90 days", make: () => lastDaysRange(90) },
];

export function PeriodFilter({ value, onChange }: { value: PeriodValue; onChange: (v: PeriodValue) => void }) {
  const { language } = useLanguage();
  const [open, setOpen] = useState(false);
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");

  const presets = PRESET_DEFS.map((p) => ({
    key: p.key,
    label: language === "es" ? p.es : language === "en" ? p.en : p.pt,
    make: p.make,
  }));

  const currentLabel = presets.find((p) => p.key === value.preset)?.label || value.label;

  function apply(preset: string) {
    const p = presets.find((x) => x.key === preset)!;
    onChange({ range: p.make(), label: p.label, preset });
    setOpen(false);
  }

  function applyCustom() {
    if (!de || !ate) return;
    const range = customRange(de, ate);
    onChange({ range, label: labelOf(range), preset: "custom" });
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="gap-2 rounded-xl font-bold text-xs h-10">
          <CalendarIcon className="size-4 text-muted-foreground" />
          {currentLabel}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-2 space-y-1">
        {presets.map((p) => (
          <button
            key={p.key}
            onClick={() => apply(p.key)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium hover:bg-muted transition"
          >
            {p.label}
            {value.preset === p.key && <Check className="size-4 text-[color:var(--brand)]" />}
          </button>
        ))}
        <div className="border-t border-[color:var(--hairline)] pt-3 mt-2 space-y-2 px-1">
          <Label className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
            {language === "es" ? "Período específico" : language === "en" ? "Specific period" : "Período específico"}
          </Label>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1 min-w-0">
              <span className="text-[10px] text-muted-foreground">{language === "es" ? "Desde" : language === "en" ? "From" : "De"}</span>
              <Input type="date" value={de} onChange={(e) => setDe(e.target.value)} className="h-9 w-full text-xs px-2" />
            </div>
            <div className="space-y-1 min-w-0">
              <span className="text-[10px] text-muted-foreground">{language === "es" ? "Hasta" : language === "en" ? "To" : "Até"}</span>
              <Input type="date" value={ate} onChange={(e) => setAte(e.target.value)} className="h-9 w-full text-xs px-2" />
            </div>
          </div>
          <Button size="sm" className="w-full h-9 rounded-lg font-bold text-xs" onClick={applyCustom} disabled={!de || !ate}>
            {language === "en" ? "Apply" : "Aplicar"}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
