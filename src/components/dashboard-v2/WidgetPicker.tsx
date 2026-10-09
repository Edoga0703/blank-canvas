import { useMemo, useState } from "react";
import { Check, Plus, Search } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { WIDGETS_V2, WIDGET_CATEGORIES, type CellSize } from "./widgets-registry";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  activeIds: string[];
  onAdd: (widgetId: string, size: CellSize) => void;
}

export function WidgetPicker({ open, onOpenChange, activeIds, onAdd }: Props) {
  const [q, setQ] = useState("");
  const [size, setSize] = useState<CellSize>(1);
  const [cat, setCat] = useState<string>("Todos");

  const filtered = useMemo(() => {
    const ql = q.toLowerCase();
    return WIDGETS_V2.filter((w) => {
      if (cat !== "Todos" && w.category !== cat) return false;
      if (!ql) return true;
      return w.title.toLowerCase().includes(ql) || w.description.toLowerCase().includes(ql);
    });
  }, [q, cat]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="max-w-md w-full flex flex-col p-0">
        <SheetHeader className="p-6 pb-3">
          <SheetTitle>Adicionar widget</SheetTitle>
        </SheetHeader>
        <div className="px-6 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar widget…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
          </div>
          <div className="flex bg-muted/60 rounded-lg p-1">
            {([1, 2] as CellSize[]).map((s) => (
              <button
                key={s}
                onClick={() => setSize(s)}
                className={`flex-1 text-xs font-medium py-1.5 rounded-md transition-colors ${
                  size === s ? "bg-background shadow-sm" : "text-muted-foreground"
                }`}
              >
                {s === 1 ? "Pequeno (1×1)" : "Grande (2×2)"}
              </button>
            ))}
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {(["Todos", ...WIDGET_CATEGORIES] as const).map((c) => (
              <button
                key={c}
                onClick={() => setCat(c)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  cat === c
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border hover:bg-muted"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-6 pt-3 space-y-2">
          {filtered.map((w) => {
            const added = activeIds.includes(w.id);
            const Icon = w.icon;
            return (
              <button
                key={w.id}
                onClick={() => { onAdd(w.id, size); onOpenChange(false); }}
                className="w-full flex items-start gap-3 p-3 rounded-xl border bg-card hover:border-primary transition-colors text-left"
              >
                <div className="h-9 w-9 shrink-0 rounded-lg bg-primary/10 grid place-items-center">
                  <Icon className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{w.title}</div>
                  <div className="text-xs text-muted-foreground line-clamp-2">{w.description}</div>
                </div>
                <div className="shrink-0">
                  {added ? (
                    <div className="h-6 w-6 rounded-full bg-emerald-500/15 text-emerald-400 grid place-items-center">
                      <Check className="h-3.5 w-3.5" />
                    </div>
                  ) : (
                    <div className="h-6 w-6 rounded-full bg-primary/15 text-primary grid place-items-center">
                      <Plus className="h-3.5 w-3.5" />
                    </div>
                  )}
                </div>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <div className="text-center text-sm text-muted-foreground py-10">Nenhum widget encontrado.</div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
