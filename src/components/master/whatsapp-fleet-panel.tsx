import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Wifi, WifiOff, Clock, PauseCircle, Building2, MessageSquare,
  ArrowDownLeft, ArrowUpRight, Gauge, TrendingUp, AlertTriangle, MoonStar,
} from "lucide-react";
import type { WhatsappFleet, FleetInstance } from "@/lib/provider-monitor.functions";
import { useMasterT } from "@/lib/i18n/master-translations";

function Stat({
  icon, label, value, hint, tone = "text-foreground",
}: { icon: React.ReactNode; label: string; value: string | number; hint?: string; tone?: string }) {
  return (
    <Card className="rounded-2xl p-4 bg-card">
      <div className="flex items-center gap-2 text-[11.5px] font-medium text-muted-foreground">
        {icon}{label}
      </div>
      <div className={`mt-1.5 text-[24px] font-bold leading-none ${tone}`}>{value}</div>
      {hint && <div className="text-[11px] text-muted-foreground mt-1.5">{hint}</div>}
    </Card>
  );
}

function nomeInstancia(i: FleetInstance) {
  return i.displayName || i.numero || i.instanceName;
}

export function WhatsappFleetPanel({ fleet }: { fleet: WhatsappFleet | null }) {
  const { mt, localeCode } = useMasterT();
  if (!fleet) {
    return <Card className="rounded-2xl p-6 text-sm text-muted-foreground">{mt("Carregando métricas de conexões…")}</Card>;
  }

  const maxHour = Math.max(1, ...fleet.hourly.map((h) => h.total));
  const barTone =
    fleet.usagePct === null ? "bg-slate-300"
      : fleet.usagePct >= 90 ? "bg-red-500"
        : fleet.usagePct >= 75 ? "bg-amber-500" : "bg-emerald-500";

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={<Wifi className="size-3.5" />} label={mt("Conexões ativas")} value={fleet.connected}
          tone="text-emerald-600" hint={`${fleet.total} ${mt("instância(s) cadastradas")}`} />
        <Stat icon={<WifiOff className="size-3.5" />} label={mt("Fora do ar")} value={fleet.disconnected}
          tone={fleet.disconnected ? "text-red-600" : undefined}
          hint={`${fleet.connecting} ${mt("Conectando").toLowerCase()} · ${fleet.paused} ${mt("Pausadas").toLowerCase()}`} />
        <Stat icon={<Building2 className="size-3.5" />} label={mt("Empresas com conexão")} value={fleet.companies} />
        <Stat icon={<MessageSquare className="size-3.5" />} label={mt("Mensagens 24h")} value={fleet.msgs24h.toLocaleString(localeCode)}
          hint={`${fleet.msgs7d.toLocaleString(localeCode)} ${mt("nos últimos 7 dias")}`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="rounded-2xl p-5 bg-card space-y-3">
          <div className="flex items-center gap-2 text-[12px] font-medium text-muted-foreground">
            <Gauge className="size-4" /> {mt("Capacidade contratada")}
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-[30px] font-bold leading-none">{fleet.total}</span>
            <span className="text-[13px] text-muted-foreground">/ {fleet.capacity ?? "—"} {mt("conexões")}</span>
            {fleet.usagePct !== null && (
              <span className="ml-auto text-[12px] font-semibold text-muted-foreground">{fleet.usagePct}%</span>
            )}
          </div>
          <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
            <div className={`h-full rounded-full transition-all ${barTone}`} style={{ width: `${fleet.usagePct ?? 0}%` }} />
          </div>
          <div className="text-[11.5px] text-muted-foreground">
            {fleet.available === null
              ? mt("Defina o limite contratado no cartão do provedor para acompanhar a ocupação.")
              : `${fleet.available} ${mt("conexão(ões) disponível(is) para novos clientes.")}`}
          </div>
          <div className="grid grid-cols-2 gap-2 pt-1">
            <div className="rounded-lg bg-muted/50 py-2 text-center">
              <div className="flex items-center justify-center gap-1 text-emerald-600">
                <ArrowDownLeft className="size-3.5" /><span className="text-[15px] font-bold">{fleet.msgsIn24h.toLocaleString(localeCode)}</span>
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5">{mt("Recebidas 24h")}</div>
            </div>
            <div className="rounded-lg bg-muted/50 py-2 text-center">
              <div className="flex items-center justify-center gap-1 text-sky-600">
                <ArrowUpRight className="size-3.5" /><span className="text-[15px] font-bold">{fleet.msgsOut24h.toLocaleString(localeCode)}</span>
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5">{mt("Enviadas 24h")}</div>
            </div>
          </div>
        </Card>

        <Card className="rounded-2xl p-5 bg-card lg:col-span-2 space-y-3">
          <div className="flex items-center gap-2 text-[12px] font-medium text-muted-foreground">
            <TrendingUp className="size-4" /> {mt("Volume por hora (últimas 24h)")}
          </div>
          <div className="flex items-end gap-[3px] h-28">
            {fleet.hourly.map((h, i) => (
              <div key={i} className="flex-1 flex flex-col justify-end h-full" title={`${h.hora}h — ${h.total} ${mt("msg")}`}>
                <div
                  className="w-full rounded-t-sm bg-primary/70 hover:bg-primary transition-colors"
                  style={{ height: `${Math.max(3, (h.total / maxHour) * 100)}%` }}
                />
              </div>
            ))}
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>{fleet.hourly[0]?.hora}h</span>
            <span>{mt("pico")} {maxHour.toLocaleString(localeCode)} {mt("msg")}</span>
            <span>{mt("agora")}</span>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="rounded-2xl p-5 bg-card space-y-3">
          <div className="flex items-center gap-2 text-[12px] font-medium text-muted-foreground">
            <AlertTriangle className="size-4" /> {mt("Conexões que precisam de atenção")}
            <Badge variant="outline" className="ml-auto">{fleet.problems.length}</Badge>
          </div>
          <div className="max-h-64 overflow-auto -mx-1 px-1 space-y-1.5">
            {fleet.problems.length === 0 && (
              <div className="text-[12.5px] text-muted-foreground py-6 text-center">{mt("Todas as conexões estão ativas.")}</div>
            )}
            {fleet.problems.map((i) => (
              <div key={i.id} className="flex items-center gap-2 rounded-lg border px-3 py-2">
                <span className="size-2 rounded-full bg-red-500 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium truncate">{i.companyName}</div>
                  <div className="text-[11px] text-muted-foreground truncate">{nomeInstancia(i)}</div>
                </div>
                <div className="text-right shrink-0">
                  <Badge variant="outline" className="text-[10px]">{i.status || mt("desconhecido")}</Badge>
                  {i.lastStateAt && (
                    <div className="text-[10px] text-muted-foreground mt-1">
                      {new Date(i.lastStateAt).toLocaleString(localeCode, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="rounded-2xl p-5 bg-card space-y-3">
          <div className="flex items-center gap-2 text-[12px] font-medium text-muted-foreground">
            <MessageSquare className="size-4" /> {mt("Maiores volumes (24h)")}
          </div>
          <div className="max-h-64 overflow-auto -mx-1 px-1 space-y-1.5">
            {fleet.topInstances.map((i) => (
              <div key={i.id} className="flex items-center gap-2 rounded-lg border px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium truncate">{i.companyName}</div>
                  <div className="text-[11px] text-muted-foreground truncate">{nomeInstancia(i)}</div>
                </div>
                <span className="text-[14px] font-bold shrink-0">{i.msgs24h.toLocaleString(localeCode)}</span>
              </div>
            ))}
            {fleet.topInstances.length === 0 && (
              <div className="text-[12.5px] text-muted-foreground py-6 text-center">{mt("Sem mensagens nas últimas 24h.")}</div>
            )}
          </div>

          {fleet.idle.length > 0 && (
            <div className="border-t pt-3">
              <div className="flex items-center gap-2 text-[11.5px] text-muted-foreground mb-1.5">
                <MoonStar className="size-3.5" /> {mt("Conectadas sem tráfego em 24h")} ({fleet.idle.length})
              </div>
              <div className="flex flex-wrap gap-1.5">
                {fleet.idle.map((i) => (
                  <Badge key={i.id} variant="secondary" className="text-[10.5px] font-normal">{i.companyName}</Badge>
                ))}
              </div>
            </div>
          )}
        </Card>
      </div>

      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <Clock className="size-3" />
        {mt("Métricas geradas às")} {new Date(fleet.generatedAt).toLocaleTimeString(localeCode)}
        <PauseCircle className="size-3 ml-3" /> {fleet.paused} {mt("conexão(ões) pausada(s)")}
      </div>
    </div>
  );
}
