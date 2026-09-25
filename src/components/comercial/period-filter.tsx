import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarIcon, Check } from "lucide-react";
import { customRange, labelOf, lastDaysRange, monthRange, prevMonthRange, type Range } from "@/lib/comercial-range";

export type PeriodValue = { range: Range; label: string; preset: string };

export function defaultPeriod(): PeriodValue {
  return { range: monthRange(), label: "Este mês", preset: "mes" };
}

const PRESETS: Array<{ key: string; label: string; make: () => Range }> = [
  { key: "mes", label: "Este mês", make: () => monthRange() },
  { key: "mes-anterior", label: "Mês anterior", make: () => prevMonthRange() },
  { key: "7", label: "Últimos 7 dias", make: () => lastDaysRange(7) },
  { key: "30", label: "Últimos 30 dias", make: () => lastDaysRange(30) },
  { key: "90", label: "Últimos 90 dias", make: () => lastDaysRange(90) },
];

export function PeriodFilter({ value, onChange }: { value: PeriodValue; onChange: (v: PeriodValue) => void }) {
  const [open, setOpen] = useState(false);
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");

  function apply(preset: string) {
    const p = PRESETS.find((x) => x.key === preset)!;
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
          {value.label}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-2 space-y-1">
        {PRESETS.map((p) => (
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
          <Label className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Período específico</Label>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1 min-w-0">
              <span className="text-[10px] text-muted-foreground">De</span>
              <Input type="date" value={de} onChange={(e) => setDe(e.target.value)} className="h-9 w-full text-xs px-2" />
            </div>
            <div className="space-y-1 min-w-0">
              <span className="text-[10px] text-muted-foreground">Até</span>
              <Input type="date" value={ate} onChange={(e) => setAte(e.target.value)} className="h-9 w-full text-xs px-2" />
            </div>
          </div>
          <Button size="sm" className="w-full h-9 rounded-lg font-bold text-xs" onClick={applyCustom} disabled={!de || !ate}>
            Aplicar
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
