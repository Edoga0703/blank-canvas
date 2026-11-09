import { Link } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";

type Props = {
  label: string;
  used: number;
  limit: number;
  className?: string;
};

export function PlanUsageBadge({ label, used, limit, className }: Props) {
  const unlimited = limit >= 1000000 || limit >= 2147483647;
  const pct = !unlimited && limit > 0 ? (used / limit) * 100 : 0;
  const hit = !unlimited && used >= limit;
  const near = !hit && pct >= 80;
  const tone = unlimited
    ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/20 dark:text-emerald-400"
    : hit
    ? "bg-destructive/15 text-destructive border-destructive/30"
    : near
    ? "bg-amber-500/15 text-amber-700 border-amber-500/30 dark:text-amber-300"
    : "bg-[color:var(--panel-2)] text-muted-foreground border-[color:var(--hairline)]";
  return (
    <div className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[12px] font-medium ${tone} ${className ?? ""}`}>
      <span className="tabular-nums">
        {unlimited ? `${used}/∞` : `${used}/${limit}`}
      </span>
      <span className="opacity-80">{label}</span>
      {unlimited && (
        <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 px-1.5 py-0.2 rounded-full">
          Super Admin
        </span>
      )}
      {hit && !unlimited && (
        <>
          <AlertTriangle className="size-3.5" />
          <Link to="/app/checkout" className="underline underline-offset-2 font-semibold">
            Fazer upgrade
          </Link>
        </>
      )}
    </div>
  );
}
