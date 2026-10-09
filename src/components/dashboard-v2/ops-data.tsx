import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getOpsMetrics, type OpsMetrics } from "@/lib/dashboard-ops.functions";
import { getTeamOps, type TeamOps } from "@/lib/dashboard-team.functions";
import { supabase } from "@/integrations/supabase/client";
import type { Range } from "./widget-data";

const EMPTY: OpsMetrics = {
  filaTriagem: 0, filaTriagemMaisAntigaHoras: 0, filaLista: [],
  tempoTriagemMin: 0, entradaPorHora: [], entradaPorDiaSemana: [], primeiraRespostaMin: 0,
  porSetor: [], ativosPorSetor: [], porAtendente: [], semResponsavelPorSetor: [], reencaminhamentos: 0,
  noPrazo: 0, atrasadas: 0, semPrazo: 0, venceHoje: 0, vence24h: 0, paradas: [], envelhecimento: [],
  entradasSerie: [], entradasTotal: 0, concluidasTotal: 0, tempoPorEtapa: [],
  aguardandoCliente: [], aguardandoOrgao: [],
  concluidasPorAtendente: [], concluidasPorSetor: [], retrabalho: 0,
  csatPorSetor: [], csatPorAtendente: [], clientesSemDemanda: [],
  rotinasMes: { feitas: 0, total: 0, porSetor: [] },
};

const OpsWorkspaceContext = createContext<string | null>(null);

export function OpsWorkspaceProvider({ workspaceId, children }: { workspaceId: string | null; children: ReactNode }) {
  return <OpsWorkspaceContext.Provider value={workspaceId}>{children}</OpsWorkspaceContext.Provider>;
}

const CACHE = new Map<string, { at: number; data: OpsMetrics }>();
const inflight = new Map<string, Promise<any>>();
const FRESH_MS = 60_000;

export function useOpsMetrics(range: Range): { data: OpsMetrics; loading: boolean } {
  const workspaceId = useContext(OpsWorkspaceContext);
  const fetcher = useServerFn(getOpsMetrics);
  const key = `${workspaceId ?? "-"}:${range}`;
  const cached = CACHE.get(key);
  const [data, setData] = useState<OpsMetrics>(cached?.data ?? EMPTY);
  const [loading, setLoading] = useState(!cached);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const hit = CACHE.get(key);
    if (hit) {
      setData(hit.data);
      setLoading(false);
      if (Date.now() - hit.at < FRESH_MS) return;
    } else {
      setLoading(true);
    }
    const load = async (force = false) => {
      try {
        let p = force ? undefined : inflight.get(key);
        if (!p) {
          p = fetcher({ data: { range, companyId: workspaceId } }).finally(() => inflight.delete(key));
          inflight.set(key, p);
        }
        const r = (await p) as OpsMetrics;
        CACHE.set(key, { at: Date.now(), data: r });
        if (!cancelled) { setData(r); setLoading(false); }
      } catch {
        if (!cancelled) setLoading(false);
      }
    };
    void load();

    const scheduleRefresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void load(true), 1500);
    };
    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      channel = supabase
        .channel(`ops-metrics-${key}-${Math.random().toString(36).slice(2)}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "crm_cards" }, scheduleRefresh);
      channel.subscribe();
    } catch {
      channel = null;
    }

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      if (channel) supabase.removeChannel(channel);
    };
  }, [key]);

  return { data, loading };
}

/* ---------- equipe (ranking, monitor, satisfação) em tempo real ---------- */

const TEAM_EMPTY: TeamOps = { ranking: [], monitor: [], tickets: [], semDono: 0, csat: [], ultimoComentarioNegativo: null, atualizadoEm: "" };
const TEAM_CACHE = new Map<string, { at: number; data: TeamOps }>();
const teamInflight = new Map<string, Promise<any>>();

export function useTeamOps(range: Range): { data: TeamOps; loading: boolean } {
  const workspaceId = useContext(OpsWorkspaceContext);
  const fetcher = useServerFn(getTeamOps);
  const key = `${workspaceId ?? "-"}:${range}`;
  const cached = TEAM_CACHE.get(key);
  const [data, setData] = useState<TeamOps>(cached?.data ?? TEAM_EMPTY);
  const [loading, setLoading] = useState(!cached);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function load(force = false) {
      const hit = TEAM_CACHE.get(key);
      if (hit && !force) {
        setData(hit.data);
        setLoading(false);
        if (Date.now() - hit.at < FRESH_MS) return;
      }
      try {
        let p = force ? undefined : teamInflight.get(key);
        if (!p) {
          p = fetcher({ data: { range, companyId: workspaceId } }).finally(() => teamInflight.delete(key));
          teamInflight.set(key, p);
        }
        const r = (await p) as TeamOps;
        TEAM_CACHE.set(key, { at: Date.now(), data: r });
        if (!cancelled) { setData(r); setLoading(false); }
      } catch {
        if (!cancelled) setLoading(false);
      }
    }

    void load();

    // Tempo real: recarrega agrupado quando chega mensagem ou card muda.
    const agendar = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void load(true), 4000);
    };
    // Canal único por instância: dois widgets com a mesma chave não podem
    // reutilizar o mesmo tópico (o Supabase lança erro e derruba a tela).
    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      channel = supabase
        .channel(`team-ops-${key}-${Math.random().toString(36).slice(2)}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "mensagens" }, agendar)
        .on("postgres_changes", { event: "*", schema: "public", table: "crm_cards" }, agendar);
      channel.subscribe();
    } catch {
      channel = null;
    }

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      if (channel) supabase.removeChannel(channel);
    };
  }, [key]);

  return { data, loading };
}
