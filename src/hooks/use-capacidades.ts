import { useEffect, useState } from "react";
import { listCapacidadesAtivas } from "@/lib/plugin-store.functions";

/**
 * Capacidades liberadas pelos plugins instalados da empresa.
 * Cache em módulo (um fetch por sessão) — o menu e os guards de rota usam isso.
 */
let cache: string[] | null = null;
let inflight: Promise<string[]> | null = null;
const listeners = new Set<(c: string[]) => void>();

async function fetchCapacidades(): Promise<string[]> {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const rows = await listCapacidadesAtivas();
      cache = Array.isArray(rows) ? rows.map(String) : [];
    } catch {
      cache = null;
      inflight = null;
      return [];
    }
    listeners.forEach((l) => l(cache!));
    inflight = null;
    return cache;
  })();
  return inflight;
}

export function invalidateCapacidades() {
  cache = null;
  inflight = null;
  fetchCapacidades();
}

export function useCapacidades() {
  const [caps, setCaps] = useState<string[] | null>(cache);
  useEffect(() => {
    let mounted = true;
    fetchCapacidades().then((c) => mounted && setCaps(c));
    const l = (c: string[]) => mounted && setCaps(c);
    listeners.add(l);
    return () => {
      mounted = false;
      listeners.delete(l);
    };
  }, []);
  return { capacidades: caps ?? [], carregando: caps === null };
}

/** true enquanto carrega (evita piscar o menu) e depois só se a capacidade existir. */
export function useCapacidadeAtiva(slug?: string) {
  const { capacidades, carregando } = useCapacidades();
  if (!slug) return true;
  if (carregando) return true;
  return capacidades.includes(slug);
}
