import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getDashboardMetrics } from "@/lib/dashboard.functions";

// Períodos fixos ou personalizado no formato "custom:YYYY-MM-DD:YYYY-MM-DD".
export type Range = "today" | "7d" | "30d" | "90d" | (string & {});


export interface DashboardMetrics {
  loading: boolean;
  revenueWon: number;
  revenueDelta: number;
  newLeads: number;
  leadsDelta: number;
  conversionRate: number;
  pipelineValue: number;
  pendingFollowups: number;
  unreadMessages: number;
  salesCount: number;
  avgTicket: number;
  lossCount: number;
  scheduledCount: number;
  unassignedLeads: number;
  csatAvg: number;
  csatCount: number;
  csatSent: number;
  csatResponseRate: number;
  csatPromoters: number;
  csatNeutrals: number;
  csatDetractors: number;
  convTotal: number;
  convAguardando: number;
  convEmAtendimento: number;
  convFinalizados: number;
  atendentesOnline: number;
  atendentesTotal: number;
  tempoEsperaMin: number;
  tempoAtendimentoMin: number;
  revenueSeries: { date: string; value: number }[];
  funnelStages: { stage: string; count: number }[];
  sourcesBreakdown: { name: string; value: number }[];
  channelsBreakdown: { name: string; value: number }[];
  leadsByChannel: { name: string; value: number }[];
  salesByItem: { name: string; value: number }[];
  ranking: { name: string; value: number; avatar_url: string | null }[];
  leadsPerUser: { name: string; value: number; avatar_url: string | null }[];
  generalGoalCents: number;
  totalRevenueCents: number;
  lossValueCents: number;
  aiHandledCount: number;
  aiQualifiedCount: number;
  aiHandoffCount: number;
  agentName: string | null;
  agentTraits: any | null;
  agentAvatarUrl: string | null;
}



const EMPTY: DashboardMetrics = {
  loading: true,
  revenueWon: 0, revenueDelta: 0, newLeads: 0, leadsDelta: 0,
  conversionRate: 0, pipelineValue: 0, pendingFollowups: 0,
  unreadMessages: 0,
  salesCount: 0, avgTicket: 0, lossCount: 0,
  scheduledCount: 0, unassignedLeads: 0,
  csatAvg: 0, csatCount: 0, csatSent: 0, csatResponseRate: 0,
  csatPromoters: 0, csatNeutrals: 0, csatDetractors: 0,
  convTotal: 0, convAguardando: 0, convEmAtendimento: 0, convFinalizados: 0,
  atendentesOnline: 0, atendentesTotal: 0, tempoEsperaMin: 0, tempoAtendimentoMin: 0,
  aiHandledCount: 0, aiQualifiedCount: 0, aiHandoffCount: 0,
  revenueSeries: [], funnelStages: [], sourcesBreakdown: [], channelsBreakdown: [], leadsByChannel: [], salesByItem: [], ranking: [], leadsPerUser: [],
  generalGoalCents: 0, totalRevenueCents: 0, lossValueCents: 0,
  agentName: null, agentTraits: null, agentAvatarUrl: null,
};



// Cache em memória (stale-while-revalidate): ao voltar ao dashboard os números
// aparecem na hora e são atualizados em segundo plano.
const CACHE = new Map<string, { at: number; data: DashboardMetrics }>();
const FRESH_MS = 60_000;
const inflight = new Map<string, Promise<any>>();

export function useDashboardMetrics(workspaceId: string | null, range: Range): DashboardMetrics {
  const fetcher = useServerFn(getDashboardMetrics);
  const key = `${workspaceId ?? "-"}:${range}`;
  const [data, setData] = useState<DashboardMetrics>(() => CACHE.get(key)?.data ?? EMPTY);

  useEffect(() => {
    if (!workspaceId) { setData({ ...EMPTY, loading: false }); return; }
    let cancelled = false;

    const cached = CACHE.get(key);
    if (cached) {
      setData({ ...cached.data, loading: false });
      if (Date.now() - cached.at < FRESH_MS) return;
    } else {
      setData((d) => ({ ...d, loading: true }));
    }

    (async () => {
      try {
        let p = inflight.get(key);
        if (!p) {
          p = fetcher({ data: { range, companyId: workspaceId } }).finally(() => inflight.delete(key));
          inflight.set(key, p);
        }
        const r = await p;
        const next = { ...(r as any), loading: false } as DashboardMetrics;
        CACHE.set(key, { at: Date.now(), data: next });
        if (!cancelled) setData(next);
      } catch {
        if (!cancelled && !cached) setData({ ...EMPTY, loading: false });
      }
    })();
    return () => { cancelled = true; };
  }, [key]);

  return data;
}

