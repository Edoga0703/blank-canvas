import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type FeatureRollout = "interno" | "beta" | "publico";
export type FlagEntry = { key: string; rollout: FeatureRollout; enabled: boolean };

let cache: FlagEntry[] | null = null;
let inflight: Promise<FlagEntry[]> | null = null;
const listeners = new Set<(f: FlagEntry[]) => void>();

async function fetchFlags(): Promise<FlagEntry[]> {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = (async () => {
    const { data } = await (supabase as any).rpc("list_feature_flags_for_me");
    cache = ((data ?? []) as any[]).map((r) => ({
      key: String(r.key),
      rollout: r.rollout as FeatureRollout,
      enabled: !!r.enabled,
    }));
    listeners.forEach((l) => l(cache!));
    inflight = null;
    return cache;
  })();
  return inflight;
}

export function invalidateFeatureFlags() {
  cache = null;
  inflight = null;
  fetchFlags();
}

export function useFeatureFlags() {
  const [flags, setFlags] = useState<FlagEntry[]>(cache ?? []);
  useEffect(() => {
    let mounted = true;
    fetchFlags().then((f) => mounted && setFlags(f));
    const l = (f: FlagEntry[]) => mounted && setFlags(f);
    listeners.add(l);
    return () => { mounted = false; listeners.delete(l); };
  }, []);
  return flags;
}

export function useFeatureEnabled(
  key: string | undefined,
  opts: { companyId?: string | null; isSuperAdmin?: boolean } = {}
): boolean {
  const flags = useFeatureFlags();
  if (!key) return true;
  if (opts.isSuperAdmin) return true;
  const flag = flags.find((f) => f.key === key);
  if (!flag) return true; // flag inexistente = liberado
  return flag.enabled;
}
