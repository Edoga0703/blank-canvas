import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type StageHistoryRow = {
  id: string;
  card_id: string;
  stage_from: string | null;
  stage_to: string | null;
  stage_from_nome: string | null;
  stage_to_nome: string | null;
  moved_by: string | null;
  moved_by_nome: string | null;
  tempo_na_etapa_seg: number | null;
  created_at: string;
};

export const getCardStageHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { cardId: string }) => z.object({ cardId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<StageHistoryRow[]> => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("crm_card_stage_history")
      .select("id, card_id, stage_from, stage_to, stage_from_nome, stage_to_nome, moved_by, tempo_na_etapa_seg, created_at")
      .eq("card_id", data.cardId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    const ids = Array.from(new Set((rows ?? []).map((r) => r.moved_by).filter(Boolean))) as string[];
    let map = new Map<string, string>();
    if (ids.length > 0) {
      const { data: profs } = await supabase.from("team_profiles" as any).select("user_id, nome").in("user_id", ids);
      map = new Map((profs ?? []).map((p: any) => [p.user_id, p.nome || p.user_id.slice(0, 8)]));
    }
    return (rows ?? []).map((r: any) => ({ ...r, moved_by_nome: r.moved_by ? map.get(r.moved_by) ?? null : null }));
  });

export const listDistinctUtms = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data } = await supabase
      .from("crm_cards")
      .select("utm_source, utm_campaign, canal_entrada")
      .limit(2000);
    const sources = new Set<string>();
    const campaigns = new Set<string>();
    const canais = new Set<string>();
    for (const r of data ?? []) {
      if ((r as any).utm_source) sources.add((r as any).utm_source);
      if ((r as any).utm_campaign) campaigns.add((r as any).utm_campaign);
      if ((r as any).canal_entrada) canais.add((r as any).canal_entrada);
    }
    return {
      utm_sources: Array.from(sources).sort(),
      utm_campaigns: Array.from(campaigns).sort(),
      canais: Array.from(canais).sort(),
    };
  });
