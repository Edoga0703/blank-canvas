import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { getMasterAlerts, type MasterAlert, type MasterAlertGroup } from "@/lib/master-alerts.functions";
import { playInfoSound, playUrgentSound } from "@/lib/alert-sounds";

const SEEN_KEY = "master_alerts_seen_ids";
const MUTE_KEY = "master_alerts_muted";

type Counts = Record<MasterAlertGroup, { urgent: number; info: number }>;

const EMPTY_COUNTS: Counts = {
  clientes: { urgent: 0, info: 0 },
  financeiro: { urgent: 0, info: 0 },
  suporte: { urgent: 0, info: 0 },
  sistema: { urgent: 0, info: 0 },
  treinamentos: { urgent: 0, info: 0 },
};

function readSeen(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || "[]")); } catch { return new Set(); }
}

export function useMasterAlerts(intervalMs = 60_000) {
  const fetchAlerts = useServerFn(getMasterAlerts);
  const [alerts, setAlerts] = useState<MasterAlert[]>([]);
  const [counts, setCounts] = useState<Counts>(EMPTY_COUNTS);
  const [unseen, setUnseen] = useState<string[]>([]);
  const [muted, setMuted] = useState(false);
  const [loading, setLoading] = useState(true);
  const seenRef = useRef<Set<string>>(new Set());
  const firstRunRef = useRef(true);
  const mutedRef = useRef(false);

  useEffect(() => {
    seenRef.current = readSeen();
    const m = typeof window !== "undefined" && localStorage.getItem(MUTE_KEY) === "1";
    mutedRef.current = m;
    setMuted(m);
  }, []);

  const run = useCallback(async () => {
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data } = await supabase.auth.getSession();
      if (!data.session?.access_token) {
        setLoading(false);
        return;
      }
      const r = await fetchAlerts();
      setAlerts(r.alerts);
      setCounts(r.counts as Counts);
      const fresh = r.alerts.filter((a) => !seenRef.current.has(a.id));
      setUnseen(fresh.map((a) => a.id));

      if (!firstRunRef.current && fresh.length && !mutedRef.current) {
        const urgent = fresh.filter((a) => a.level === "urgent");
        if (urgent.length) {
          playUrgentSound();
          toast.error(urgent[0].title, { description: urgent[0].description, duration: 12000 });
        } else {
          playInfoSound();
          toast(fresh[0].title, { description: fresh[0].description });
        }
      }
      firstRunRef.current = false;
    } catch {
      /* silencioso — não derruba o painel */
    } finally {
      setLoading(false);
    }
  }, [fetchAlerts]);

  useEffect(() => {
    void run();
    const t = setInterval(() => { if (!document.hidden) void run(); }, intervalMs);
    const onVis = () => { if (!document.hidden) void run(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onVis); };
  }, [run, intervalMs]);

  const markAllSeen = useCallback(() => {
    const ids = alerts.map((a) => a.id);
    seenRef.current = new Set([...Array.from(seenRef.current), ...ids].slice(-300));
    try { localStorage.setItem(SEEN_KEY, JSON.stringify(Array.from(seenRef.current))); } catch { /* noop */ }
    setUnseen([]);
  }, [alerts]);

  const toggleMute = useCallback(() => {
    const next = !mutedRef.current;
    mutedRef.current = next;
    setMuted(next);
    try { localStorage.setItem(MUTE_KEY, next ? "1" : "0"); } catch { /* noop */ }
  }, []);

  const urgentCount = alerts.filter((a) => a.level === "urgent").length;

  return { alerts, counts, unseen, urgentCount, muted, loading, refresh: run, markAllSeen, toggleMute };
}

export type UseMasterAlerts = ReturnType<typeof useMasterAlerts>;
