import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Settings } from "lucide-react";
import type { ChartKind, WidgetMeta } from "./widgets-registry";

interface Props {
  widget: WidgetMeta;
  chart: ChartKind;
  onChange: (chart: ChartKind) => void;
}

const LABELS: Record<ChartKind, string> = {
  kpi: "Número (KPI)",
  area: "Área",
  bar: "Barras",
  pie: "Pizza",
  progress: "Progresso",
  line: "Linha",
  funnel: "Funil",
};

export function WidgetSettingsDialog({ widget, chart, onChange }: Props) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="h-7 w-7 rounded-md bg-background/80 border grid place-items-center hover:bg-muted"
          onClick={(e) => e.stopPropagation()}
          aria-label="Configurar widget"
        >
          <Settings className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-52 p-2" onClick={(e) => e.stopPropagation()}>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground px-2 pb-1">Tipo</div>
        <div className="space-y-0.5">
          {widget.supportedCharts.map((c) => (
            <button
              key={c}
              onClick={() => onChange(c)}
              className={`w-full text-left text-sm px-2 py-1.5 rounded-md ${
                chart === c ? "bg-primary text-primary-foreground" : "hover:bg-muted"
              }`}
            >
              {LABELS[c]}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
