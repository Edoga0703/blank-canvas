import { Link } from "@tanstack/react-router";
import { Bell, BellOff, RefreshCw, AlertTriangle, Info } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { UseMasterAlerts } from "@/hooks/use-master-alerts";

function timeAgo(iso: string) {
  const s = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}min`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

export function MasterAlertsBell({ state, onDark = true }: { state: UseMasterAlerts; onDark?: boolean }) {
  const { alerts, unseen, urgentCount, muted, toggleMute, markAllSeen, refresh } = state;
  const hasUrgent = urgentCount > 0;
  const badge = unseen.length;

  return (
    <DropdownMenu onOpenChange={(v) => { if (v) markAllSeen(); }}>
      <DropdownMenuTrigger asChild>
        <button
          title="Alertas do sistema"
          className={`relative size-9 grid place-items-center rounded-lg transition-colors ${
            onDark ? "text-white/85 hover:text-white hover:bg-white/10" : "text-foreground hover:bg-muted"
          }`}
        >
          <Bell className={`size-[18px] ${hasUrgent ? "animate-pulse" : ""}`} />
          {badge > 0 && (
            <span
              className={`absolute -top-0.5 -right-0.5 min-w-[17px] h-[17px] px-1 grid place-items-center rounded-full text-[10px] font-bold leading-none text-white ${
                hasUrgent ? "bg-red-500" : "bg-emerald-500"
              }`}
            >
              {badge > 9 ? "9+" : badge}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[340px] p-0">
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-[color:var(--hairline)]">
          <div className="text-[13px] font-semibold">
            Alertas
            {hasUrgent && (
              <span className="ml-2 text-[11px] font-bold text-red-600">{urgentCount} urgente(s)</span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button onClick={(e) => { e.preventDefault(); void refresh(); }} title="Atualizar" className="size-7 grid place-items-center rounded-md hover:bg-muted">
              <RefreshCw className="size-3.5" />
            </button>
            <button onClick={(e) => { e.preventDefault(); toggleMute(); }} title={muted ? "Ativar sons" : "Silenciar sons"} className="size-7 grid place-items-center rounded-md hover:bg-muted">
              {muted ? <BellOff className="size-3.5 text-muted-foreground" /> : <Bell className="size-3.5" />}
            </button>
          </div>
        </div>

        {alerts.length === 0 ? (
          <div className="px-3 py-8 text-center text-sm text-muted-foreground">Tudo estável por aqui</div>
        ) : (
          <div className="max-h-[420px] overflow-auto">
            {alerts.map((a) => {
              const urgent = a.level === "urgent";
              return (
                <Link
                  key={a.id}
                  to={a.href}
                  className="flex items-start gap-2.5 px-3 py-2.5 hover:bg-accent/50 border-b border-[color:var(--hairline)] last:border-0"
                >
                  <span
                    className={`mt-0.5 size-6 shrink-0 grid place-items-center rounded-md ${
                      urgent ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600"
                    }`}
                  >
                    {urgent ? <AlertTriangle className="size-3.5" /> : <Info className="size-3.5" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-[12.5px] font-semibold truncate ${urgent ? "text-red-700" : ""}`}>{a.title}</span>
                      <span className="text-[10.5px] text-muted-foreground shrink-0">{timeAgo(a.at)}</span>
                    </div>
                    <p className="text-[11.5px] text-muted-foreground line-clamp-2">{a.description}</p>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
