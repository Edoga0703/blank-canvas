import { useMemo, useState } from "react";
import { CalendarDays, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { DateRange } from "react-day-picker";
import type { Range } from "./widget-data";

const PRESETS: { key: Range; label: string }[] = [
  { key: "today", label: "Hoje" },
  { key: "7d", label: "Semana" },
  { key: "30d", label: "Mês" },
  { key: "90d", label: "90 dias" },
];

function iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmt(d: string) {
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y.slice(2)}`;
}

export function PeriodFilterButton({
  value,
  onChange,
}: {
  value: Range;
  onChange: (r: Range) => void;
}) {
  const [open, setOpen] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [draft, setDraft] = useState<DateRange | undefined>();

  const label = useMemo(() => {
    const preset = PRESETS.find((p) => p.key === value);
    if (preset) return preset.label;
    if (typeof value === "string" && value.startsWith("custom:")) {
      const [, f, t] = value.split(":");
      return `${fmt(f)} – ${fmt(t)}`;
    }
    return "Período";
  }, [value]);

  const isCustom = typeof value === "string" && value.startsWith("custom:");

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setShowCalendar(false);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="tt-exempt rounded-full h-9 px-3.5 shadow-sm gap-2 text-[12.5px] font-medium"
        >
          <CalendarDays className="h-4 w-4 text-primary" />
          <span className="truncate max-w-[150px]">{label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-2">
        {!showCalendar ? (
          <div className="flex w-52 flex-col gap-0.5">
            {PRESETS.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => {
                  onChange(p.key);
                  setOpen(false);
                }}
                className={`flex items-center justify-between rounded-lg px-3 py-2 text-[13px] transition-colors hover:bg-muted ${
                  value === p.key ? "text-primary font-medium" : "text-foreground"
                }`}
              >
                {p.label}
                {value === p.key && <Check className="h-4 w-4" />}
              </button>
            ))}
            <div className="my-1 h-px bg-border" />
            <button
              type="button"
              onClick={() => setShowCalendar(true)}
              className={`flex items-center justify-between rounded-lg px-3 py-2 text-[13px] transition-colors hover:bg-muted ${
                isCustom ? "text-primary font-medium" : "text-foreground"
              }`}
            >
              Personalizado…
              {isCustom && <Check className="h-4 w-4" />}
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <Calendar
              mode="range"
              numberOfMonths={1}
              selected={draft}
              onSelect={setDraft}
              disabled={{ after: new Date() }}
            />
            <div className="flex items-center justify-between gap-2 border-t pt-2">
              <Button variant="ghost" size="sm" onClick={() => setShowCalendar(false)}>
                Voltar
              </Button>
              <Button
                size="sm"
                disabled={!draft?.from}
                onClick={() => {
                  if (!draft?.from) return;
                  const from = iso(draft.from);
                  const to = iso(draft.to ?? draft.from);
                  onChange(`custom:${from}:${to}`);
                  setOpen(false);
                  setShowCalendar(false);
                }}
              >
                Aplicar
              </Button>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
