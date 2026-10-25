import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Maximize2, Minimize2, Plus, RotateCcw, Settings, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { getWorkspaceBaseLayout } from "@/lib/dashboard-layout.functions";
import { getWidget, WIDGETS_V2, type CellSize, type ChartKind } from "./widgets-registry";
import { useDashboardMetrics, type Range } from "./widget-data";
import { OpsWorkspaceProvider } from "./ops-data";
import { WidgetPicker } from "./WidgetPicker";
import { WidgetSettingsDialog } from "./WidgetSettingsDialog";
import { PeriodFilterButton } from "./PeriodFilterButton";
import { useLanguage } from "@/lib/i18n/context";


interface WidgetState {
  id: string;
  widgetId: string;
  chart: ChartKind;
  x: number;
  y: number;
  size: CellSize;
}

// Layout padrão: exatamente 4 linhas de grade (cabe na altura padrão da tela).
const DEFAULT_STATE: Omit<WidgetState, "id">[] = [
  { widgetId: "kpi_revenue_won", chart: "kpi", x: 0, y: 0, size: 1 },
  { widgetId: "kpi_sales_count", chart: "kpi", x: 1, y: 0, size: 1 },
  { widgetId: "kpi_avg_ticket", chart: "kpi", x: 2, y: 0, size: 1 },
  { widgetId: "kpi_conversion", chart: "progress", x: 3, y: 0, size: 1 },
  { widgetId: "chart_revenue", chart: "area", x: 4, y: 0, size: 2 },
  { widgetId: "kpi_new_leads", chart: "kpi", x: 0, y: 1, size: 1 },
  { widgetId: "kpi_pipeline", chart: "kpi", x: 1, y: 1, size: 1 },
  { widgetId: "kpi_scheduled", chart: "kpi", x: 2, y: 1, size: 1 },
  { widgetId: "kpi_unread", chart: "kpi", x: 3, y: 1, size: 1 },
  { widgetId: "chart_funnel", chart: "funnel", x: 0, y: 2, size: 2 },
  { widgetId: "chart_sources", chart: "pie", x: 2, y: 2, size: 2 },
  { widgetId: "chart_ranking", chart: "bar", x: 4, y: 2, size: 2 },
];

const GAP = 16;

// Bump this whenever DEFAULT_STATE changes so every account (inclusive contas
// antigas que já têm layout salvo) recebe o novo layout padrão.
const LAYOUT_VERSION = 8;

function uid() { return Math.random().toString(36).slice(2, 10); }

function fits(items: WidgetState[], x: number, y: number, size: CellSize, cols: number, ignoreId?: string) {
  if (x < 0 || y < 0 || x + size > cols) return false;
  for (const it of items) {
    if (ignoreId && it.id === ignoreId) continue;
    const x2 = it.x + it.size, y2 = it.y + it.size;
    const cx2 = x + size, cy2 = y + size;
    if (x < x2 && cx2 > it.x && y < y2 && cy2 > it.y) return false;
  }
  return true;
}

function findFirstSlot(items: WidgetState[], size: CellSize, cols: number): { x: number; y: number } {
  for (let y = 0; y < 200; y++) {
    for (let x = 0; x + size <= cols; x++) {
      if (fits(items, x, y, size, cols)) return { x, y };
    }
  }
  return { x: 0, y: 0 };
}


interface Props {
  workspaceId: string | null;
  operationalMode?: boolean;
}

const OPERATIONAL_STATE: Omit<WidgetState, "id">[] = [
  { widgetId: "ops_monitor_usuarios", chart: "bar", x: 0, y: 0, size: 2 },
  { widgetId: "kpi_conv_total", chart: "kpi", x: 2, y: 0, size: 1 },
  { widgetId: "kpi_conv_aguardando", chart: "kpi", x: 3, y: 0, size: 1 },
  { widgetId: "kpi_conv_atendimento", chart: "kpi", x: 4, y: 0, size: 1 },
  { widgetId: "kpi_conv_finalizados", chart: "kpi", x: 5, y: 0, size: 1 },
  { widgetId: "ops_carga_atendente", chart: "bar", x: 2, y: 1, size: 2 },
  { widgetId: "ops_fila_lista", chart: "bar", x: 4, y: 1, size: 2 },
];

export function DashboardGrid({ workspaceId, operationalMode = false }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [cols, setCols] = useState(6);
  const [cellW, setCellW] = useState(160);
  const [cellH, setCellH] = useState(160);

  const [items, setItems] = useState<WidgetState[] | null>(null);
  const [editing, setEditing] = useState(false);
  const [range, setRange] = useState<Range>("30d");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerCell, setPickerCell] = useState<{ x: number; y: number } | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const metrics = useDashboardMetrics(workspaceId, range);

  // responsive cols + cell size
  const layoutRows = useMemo(() => {
    if (!items || items.length === 0) return 4;
    return items.reduce((m, w) => Math.max(m, w.y + w.size), 0);
  }, [items]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const compute = () => {
      const w = el.getBoundingClientRect().width;
       const c = w >= 850 ? 6 : w >= 600 ? 4 : 2;
      // Largura: sempre ocupa 100% do container (sem sobra à direita).
      const cw = Math.floor((w - GAP * (c - 1)) / c);
      // Alturas confortáveis preservam legibilidade dos gráficos e do ranking.
      let ch = Math.max(164, Math.round(cw * 0.8));
      if (w < 640) {
        // Mobile: cartões mais baixos que largos para reduzir a rolagem.
        ch = Math.max(112, Math.round(cw * 0.8));
      }
      setCols(c);
      setCellW(cw);
      setCellH(ch);
    };

    const ro = new ResizeObserver(compute);
    ro.observe(el);
    window.addEventListener("resize", compute);
    compute();
    return () => { ro.disconnect(); window.removeEventListener("resize", compute); };
  }, [layoutRows]);

  // Re-flow widgets so the layout always adapts to the current column count.
  // Repack whenever the current layout doesn't span the available columns
  // (e.g. a mobile layout being loaded on desktop) or when a widget overflows.
  useEffect(() => {
    setItems((prev) => {
      if (!prev || prev.length === 0) return prev;

      const maxX = prev.reduce((m, w) => Math.max(m, w.x + w.size), 0);
      const anyOverflow = prev.some((w) => w.x + w.size > cols || w.size > cols);
      const underfilled = maxX < cols; // layout was packed for fewer columns

      if (!anyOverflow && !underfilled) return prev;

      const sorted = [...prev].sort((a, b) => a.y - b.y || a.x - b.x);
      const repacked: WidgetState[] = [];
      for (const w of sorted) {
        const size: CellSize = (w.size > cols ? 1 : w.size) as CellSize;
        const slot = findFirstSlot(repacked, size, cols);
        repacked.push({ ...w, size, ...slot });
      }
      return repacked;
    });
  }, [cols, items?.length]);


  // Só persistimos quando o usuário realmente mexe no layout.
  // Sem isso, abrir o painel no celular (2 colunas) reempacotava o layout
  // e salvava essa versão, quebrando o desktop.
  const dirtyRef = useRef(false);
  const markDirty = useCallback(() => { dirtyRef.current = true; }, []);

  // load preferences
  useEffect(() => {
    const fallback = operationalMode ? OPERATIONAL_STATE : DEFAULT_STATE;
    if (!workspaceId) { setItems(fallback.map((w) => ({ ...w, id: uid() }))); return; }
    let cancelled = false;
    dirtyRef.current = false;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data } = await supabase
        .from("dashboard_preferences")
        .select("widgets, layout_version")
        .eq("user_id", u.user.id)
        .eq("workspace_id", workspaceId)
        .maybeSingle();
      if (cancelled) return;
      let raw = (data?.widgets as WidgetState[] | undefined) ?? null;
      let version = (data as { layout_version?: number } | null)?.layout_version ?? 0;

      // Sem layout próprio: herda o layout do dono/admin da empresa.
      if (!raw || !Array.isArray(raw) || raw.length === 0) {
        try {
          const base = await getWorkspaceBaseLayout({ data: { workspaceId } });
          if (cancelled) return;
          if (base?.widgets && Array.isArray(base.widgets) && base.widgets.length > 0) {
            raw = base.widgets as unknown as WidgetState[];
            version = base.layout_version ?? 0;
          }
        } catch { /* ignora e usa o padrão */ }
      }

      if (!raw || !Array.isArray(raw) || raw.length === 0 || version < LAYOUT_VERSION) {
        // Layout padrão novo: aplica para contas novas e para quem ainda está
        // numa versão antiga. Não persistimos aqui — só quando o usuário editar —
        // assim o padrão fica idêntico em todas as contas.
        setItems(fallback.map((w) => ({ ...w, id: uid() })));
      } else {
        const cleaned: WidgetState[] = [];
        for (const w of raw) {
          if (!getWidget(w.widgetId)) continue;
          const size: CellSize = w.size === 2 ? 2 : 1;
          const chart: ChartKind = w.chart || getWidget(w.widgetId)!.defaultChart;
          if (typeof w.x !== "number" || typeof w.y !== "number") {
            const slot = findFirstSlot(cleaned, size, 6);
            cleaned.push({ id: w.id ?? uid(), widgetId: w.widgetId, chart, size, ...slot });
          } else {
            cleaned.push({ id: w.id ?? uid(), widgetId: w.widgetId, chart, size, x: w.x, y: w.y });
          }
        }
        setItems(cleaned);
      }
    })();
    return () => { cancelled = true; };
  }, [workspaceId, operationalMode]);

  // persist debounced
  const saveTimer = useRef<number | null>(null);
  useEffect(() => {
    // Nunca persistir um layout reempacotado para poucas colunas (mobile/tablet),
    // senão o desktop de cada usuário fica diferente.
    if (!items || !workspaceId || !dirtyRef.current || cols < 6) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      await supabase.from("dashboard_preferences").upsert(
        {
          user_id: u.user.id,
          workspace_id: workspaceId,
          widgets: items as unknown as never,
          layout_version: LAYOUT_VERSION,
        } as never,
        { onConflict: "user_id,workspace_id" },
      );
    }, 500);
    return () => { if (saveTimer.current) window.clearTimeout(saveTimer.current); };
  }, [items, workspaceId, cols]);


  const addWidget = useCallback((widgetId: string, size: CellSize) => {
    markDirty();
    setItems((prev) => {
      const list = prev ?? [];
      const meta = getWidget(widgetId);
      if (!meta) return list;
      const requestedSize: CellSize = widgetId === "ops_atendimentos_departamento" ? 2 : size;
      const slot = pickerCell && fits(list, pickerCell.x, pickerCell.y, requestedSize, cols)
        ? pickerCell
        : findFirstSlot(list, requestedSize, cols);
      return [...list, { id: uid(), widgetId, chart: meta.defaultChart, size: requestedSize, ...slot }];
    });
    setPickerCell(null);
    toast.success("Widget adicionado");
  }, [cols, pickerCell, markDirty]);

  const removeWidget = (id: string) => {
    markDirty();
    setItems((prev) => (prev ?? []).filter((w) => w.id !== id));
  };

  const resizeWidget = (id: string) => {
    markDirty();
    setItems((prev) => {
      const list = prev ?? [];
      return list.map((w) => {
        if (w.id !== id) return w;
        const newSize: CellSize = w.size === 1 ? 2 : 1;
        if (fits(list, w.x, w.y, newSize, cols, id)) return { ...w, size: newSize };
        const slot = findFirstSlot(list.filter((it) => it.id !== id), newSize, cols);
        return { ...w, size: newSize, ...slot };
      });
    });
  };

  const changeChart = (id: string, chart: ChartKind) => {
    markDirty();
    setItems((prev) => (prev ?? []).map((w) => (w.id === id ? { ...w, chart } : w)));
  };

  const moveWidget = (id: string, x: number, y: number) => {
    markDirty();
    setItems((prev) => {
      const list = prev ?? [];
      const w = list.find((it) => it.id === id);
      if (!w) return list;
      if (!fits(list, x, y, w.size, cols, id)) return list;
      return list.map((it) => (it.id === id ? { ...it, x, y } : it));
    });
  };


  const restore = () => { markDirty(); setItems((operationalMode ? OPERATIONAL_STATE : DEFAULT_STATE).map((w) => ({ ...w, id: uid() }))); };

  // grid dimensions
  const maxRow = useMemo(() => {
    if (!items) return 0;
    return items.reduce((m, w) => Math.max(m, w.y + w.size), 0);
  }, [items]);
  const rowsToRender = maxRow + (editing ? 2 : 0);

  // occupied lookup
  const occupied = useMemo(() => {
    const set = new Set<string>();
    (items ?? []).forEach((w) => {
      for (let dy = 0; dy < w.size; dy++)
        for (let dx = 0; dx < w.size; dx++)
          set.add(`${w.x + dx}:${w.y + dy}`);
    });
    return set;
  }, [items]);

  // alerts
  const alerts = useMemo(() => {
    const list: { level: "warn" | "danger"; text: string }[] = [];
    if (metrics.pendingFollowups > 10) list.push({ level: "warn", text: `${metrics.pendingFollowups} follow-ups pendentes` });
    if (metrics.conversionRate < 15) list.push({ level: "danger", text: `Conversão baixa: ${metrics.conversionRate}%` });
    if (metrics.unreadMessages > 20) list.push({ level: "warn", text: `${metrics.unreadMessages} mensagens não lidas` });
    if (metrics.unassignedLeads > 5) list.push({ level: "warn", text: `${metrics.unassignedLeads} leads sem responsável` });
    if (metrics.scheduledCount > 0) list.push({ level: "warn", text: `${metrics.scheduledCount} compromissos agendados` });
    return list;
  }, [metrics]);

  const gridHeight = rowsToRender * cellH + Math.max(0, rowsToRender - 1) * GAP;

  return (
    <OpsWorkspaceProvider workspaceId={workspaceId}>
     <div className="space-y-6 sm:space-y-7">
      {/* Toolbar */}
       <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto] gap-4 items-start rounded-[20px] border border-border bg-card px-5 py-5 sm:px-7 sm:py-6 shadow-sm">
        <div>
           <h1 className="text-[26px] sm:text-[32px] font-extrabold leading-tight tracking-tight text-foreground">Painel</h1>
          <p className="text-[12px] sm:text-[13px] text-muted-foreground mt-0.5">Visão geral em tempo real do seu negócio</p>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2 flex-nowrap sm:flex-wrap sm:justify-end self-end">
          <div className="-mx-1 px-1 min-w-0 flex-1 sm:flex-none sm:w-auto">
            <PeriodFilterButton value={range} onChange={setRange} />
          </div>

          <Button aria-label={t("dashboard.add_widget", undefined, "Adicionar widget")} variant="outline" size="sm" className="rounded-full h-8 w-8 sm:h-9 p-0 sm:w-auto sm:px-4 shadow-sm shrink-0" onClick={() => { setPickerCell(null); setPickerOpen(true); }}>
            <Plus className="h-4 w-4 sm:mr-1" /> <span className="hidden sm:inline">{t("dashboard.add_widget", undefined, "Widget")}</span>
          </Button>
          {editing && (
            <Button aria-label="Restaurar" variant="ghost" size="sm" className="rounded-full h-8 w-8 sm:h-9 p-0 sm:w-auto sm:px-3 shrink-0" onClick={restore}>
              <RotateCcw className="h-4 w-4 sm:mr-1" /> <span className="hidden sm:inline">Restaurar</span>
            </Button>
          )}
          <Button aria-label={editing ? "Concluir" : "Personalizar"} variant={editing ? "default" : "outline"} size="sm" className="rounded-full h-8 w-8 sm:h-9 p-0 sm:w-auto sm:px-4 shadow-sm shrink-0" onClick={() => setEditing((v) => !v)}>
            <Settings className="h-4 w-4 sm:mr-1" /> <span className="hidden sm:inline">{editing ? t("dashboard.finish", undefined, "Concluir") : t("dashboard.customize", undefined, "Personalizar")}</span>
          </Button>
        </div>
      </div>




      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="flex gap-1.5 sm:gap-2 flex-nowrap sm:flex-wrap overflow-x-auto -mx-1 px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {alerts.map((a, i) => (
            <div
              key={i}
              className={`inline-flex shrink-0 items-center gap-1 sm:gap-1.5 text-[10.5px] sm:text-xs px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full border whitespace-nowrap ${
                a.level === "danger"
                  ? "bg-destructive/10 border-destructive/30 text-destructive"
                   : "bg-prospect-warning border-prospect-warning-foreground/30 text-prospect-warning-foreground"
              }`}
            >
              <AlertTriangle className="h-3 w-3 shrink-0" />
              {a.text}
            </div>
          ))}
        </div>
      )}


      {/* Grid */}
      <div ref={wrapRef} className="relative w-full max-w-full">
        {items === null ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-32 sm:h-48 rounded-2xl" />)}
          </div>
        ) : (
          <div style={{ position: "relative", height: gridHeight }}>
            {/* empty cells (edit mode) */}
            {editing && Array.from({ length: rowsToRender }).flatMap((_, y) =>
              Array.from({ length: cols }).map((__, x) => {
                if (occupied.has(`${x}:${y}`)) return null;
                const left = x * (cellW + GAP);
                const top = y * (cellH + GAP);
                return (
                  <button
                    key={`e-${x}-${y}`}
                    onClick={() => { setPickerCell({ x, y }); setPickerOpen(true); }}
                    onDragOver={(e) => {
                      if (!draggingId) return;
                      const w = items.find((it) => it.id === draggingId);
                      if (!w) return;
                      if (fits(items, x, y, w.size, cols, draggingId)) e.preventDefault();
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (draggingId) moveWidget(draggingId, x, y);
                    }}
                    style={{ position: "absolute", left, top, width: cellW, height: cellH }}
                    className="rounded-2xl border-2 border-dashed border-border/60 bg-muted/20 hover:border-primary hover:bg-primary/5 transition-colors grid place-items-center text-muted-foreground"
                  >
                    <Plus className="h-5 w-5" />
                  </button>
                );
              }),
            )}

            {/* widgets */}
            {items.map((w) => {
              const meta = getWidget(w.widgetId);
              if (!meta) return null;
              const left = w.x * (cellW + GAP);
              const top = w.y * (cellH + GAP);
              const width = w.size * cellW + (w.size - 1) * GAP;
              const height = w.size * cellH + (w.size - 1) * GAP;
              return (
                <div
                  key={w.id}
                  draggable={editing}
                  onDragStart={() => setDraggingId(w.id)}
                  onDragEnd={() => setDraggingId(null)}
                  style={{ position: "absolute", left, top, width, height }}
                  className={`transition-[left,top,width,height] duration-200 ease-out ${
                    editing ? "cursor-grab active:cursor-grabbing" : ""
                  } ${draggingId === w.id ? "opacity-50" : ""}`}
                >
                  <div className="relative h-full w-full">
                    {meta.render({ chart: w.chart, size: w.size, metrics, range })}
                    {editing && (
                      <div className="absolute top-2 right-2 flex gap-1 z-10">
                        <WidgetSettingsDialog widget={meta} chart={w.chart} onChange={(c) => changeChart(w.id, c)} />
                        <button
                          onClick={(e) => { e.stopPropagation(); resizeWidget(w.id); }}
                          className="h-7 w-7 rounded-md bg-background/80 border grid place-items-center hover:bg-muted"
                          aria-label="Redimensionar"
                        >
                          {w.size === 1 ? <Maximize2 className="h-3.5 w-3.5" /> : <Minimize2 className="h-3.5 w-3.5" />}
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); removeWidget(w.id); }}
                          className="h-7 w-7 rounded-md bg-background/80 border grid place-items-center hover:bg-destructive hover:text-destructive-foreground"
                          aria-label="Remover"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <WidgetPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        activeIds={(items ?? []).map((w) => w.widgetId)}
        onAdd={addWidget}
      />
    </div>
    </OpsWorkspaceProvider>
  );
}
