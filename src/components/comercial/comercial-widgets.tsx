import { ReactNode } from "react";
import { TrendingUp, Users, Calendar, Target, DollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";

export function KpiCard({
  title,
  label,
  value,
  subtitle,
  variation,
  icon,
  highlight,
  hero,
}: {
  title?: string;
  label?: string;
  value: string;
  subtitle?: string;
  variation?: number;
  icon: ReactNode;
  highlight?: boolean;
  hero?: boolean;
}) {
  const isHero = highlight ?? hero;
  const heading = title ?? label ?? "";
  return (
    <div className={`rounded-2xl border border-[color:var(--hairline)] p-6 space-y-4 shadow-sm transition-all duration-200 hover:shadow-md ${isHero ? "bg-gradient-to-br from-indigo-50/50 via-white to-white ring-1 ring-[var(--brand)]/10" : "bg-white"}`}>
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{heading}</p>
          <p className="text-2xl font-black tracking-tight text-slate-900">{value}</p>
        </div>
        <div className={`size-12 rounded-2xl flex items-center justify-center ${isHero ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20" : "bg-slate-50 text-slate-400 border border-slate-100"}`}>
          {icon}
        </div>
      </div>
      {(subtitle !== undefined || variation !== undefined) && (
        <div className="flex items-center gap-1.5 pt-2 border-t border-[color:var(--hairline)]">
          <TrendingUp className="size-3 text-emerald-500" />
          <span className="text-[10px] text-muted-foreground">
            {subtitle ?? `${variation! > 0 ? "+" : ""}${variation!.toFixed(1)}% vs período anterior`}
          </span>
        </div>
      )}
    </div>
  );
}

export function MetaCard({
  title = "Meta mensal",
  meta,
  realizado,
  receitaMes,
  perc,
  pct,
  onEdit,
  icon,
  color = "indigo",
}: {
  title?: string;
  meta: number | string;
  realizado?: string;
  receitaMes?: number;
  perc?: number;
  pct?: number;
  onEdit?: () => void;
  icon?: ReactNode;
  color?: "indigo" | "emerald" | "amber";
}) {
  const fmtMoney = (cents: number) =>
    ((cents || 0) / 100).toLocaleString("es-ES", { style: "currency", currency: "USD" });
  const pctVal = Number.isFinite(perc) ? Number(perc) : Number(pct || 0);
  const metaLabel = typeof meta === "number" ? fmtMoney(meta) : meta;
  const realizadoLabel = realizado ?? (typeof receitaMes === "number" ? fmtMoney(receitaMes) : "$ 0,00");

  return (
    <div className="rounded-2xl border border-[color:var(--hairline)] bg-white p-6 space-y-6 shadow-sm hover:shadow-md transition-all">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{title}</p>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-slate-900">{pctVal}%</span>
            <span className="text-xs font-bold text-muted-foreground">atingido</span>
          </div>
        </div>
        {onEdit ? (
          <Button variant="ghost" size="icon" className="size-9 rounded-xl text-[color:var(--brand)] hover:bg-blue-50 cursor-pointer" onClick={onEdit}>
            <Target className="size-5" />
          </Button>
        ) : (
          <div className="size-12 rounded-2xl border flex items-center justify-center text-indigo-600 bg-indigo-50 border-indigo-100">
            {icon ?? <Target className="size-6" />}
          </div>
        )}
      </div>
      <div className="space-y-2">
        <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden p-0.5">
          <div
            className="h-full rounded-full bg-gradient-to-r from-indigo-600 to-indigo-500 transition-all duration-500"
            style={{ width: `${Math.min(Math.max(pctVal, 0), 100)}%` }}
          />
        </div>
        <div className="flex justify-between items-center text-[10px] font-bold text-muted-foreground">
          <span>{realizadoLabel}</span>
          <span>Meta: {metaLabel}</span>
        </div>
      </div>
    </div>
  );
}

export function MetaConfigCard({
  onEdit,
  periodoLabel,
  metricaLabel = "Receita ($)",
  visibilidadeLabel = "Toda a unidade"
}: {
  onEdit?: () => void;
  periodoLabel?: string;
  metricaLabel?: string;
  visibilidadeLabel?: string;
} = {}) {
  const currentPeriod = periodoLabel || new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(new Date());

  return (
    <div className="rounded-2xl border border-[color:var(--hairline)] bg-white p-8 space-y-8 shadow-sm">
      <div className="space-y-1">
        <h3 className="font-bold text-lg text-slate-900">Configuração da meta</h3>
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Ajuste os parâmetros de performance</p>
      </div>
      
      <div className="space-y-6">
        <div className="flex items-center gap-4 group">
          <div className="size-11 rounded-xl bg-slate-50 border border-slate-100 grid place-items-center text-slate-400 group-hover:text-[color:var(--brand)] group-hover:border-[color:var(--brand)]/20 transition-colors">
            <Calendar className="size-5" />
          </div>
          <div>
            <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-0.5">Período</p>
            <p className="text-xs font-bold text-slate-800 uppercase tracking-wider capitalize">{currentPeriod}</p>
          </div>
        </div>

        <div className="flex items-center gap-4 group">
          <div className="size-11 rounded-xl bg-slate-50 border border-slate-100 grid place-items-center text-slate-400 group-hover:text-[color:var(--brand)] group-hover:border-[color:var(--brand)]/20 transition-colors">
            <Target className="size-5" />
          </div>
          <div>
            <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-0.5">Métrica principal</p>
            <p className="text-xs font-bold text-slate-800 uppercase tracking-wider">{metricaLabel}</p>
          </div>
        </div>

        <div className="flex items-center gap-4 group">
          <div className="size-11 rounded-xl bg-slate-50 border border-slate-100 grid place-items-center text-slate-400 group-hover:text-[color:var(--brand)] group-hover:border-[color:var(--brand)]/20 transition-colors">
            <Users className="size-5" />
          </div>
          <div>
            <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-0.5">Visibilidade</p>
            <p className="text-xs font-bold text-slate-800 uppercase tracking-wider">{visibilidadeLabel}</p>
          </div>
        </div>
      </div>

      <Button 
        onClick={onEdit}
        className="w-full rounded-2xl h-12 bg-slate-900 hover:bg-slate-800 text-white font-bold text-[10px] uppercase tracking-wider shadow-lg shadow-slate-900/10 mt-4 cursor-pointer"
      >
        Editar definições
      </Button>
    </div>
  );
}
