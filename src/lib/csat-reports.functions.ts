import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveCompanyIdCached } from "./company-cache";

export type CsatResponseRow = {
  id: string;
  contato_nome: string | null;
  numero: string;
  score: number | null;
  comentario: string | null;
  enviado_em: string;
  respondido_em: string | null;
  atendente_id: string | null;
  atendente_nome: string;
};

export type CsatAgentStat = {
  userId: string | null;
  nome: string;
  enviados: number;
  respondidos: number;
  media: number | null;
  dist: [number, number, number, number, number];
  detratores: number;
};

async function loadRole(supabase: any, userId: string, companyId: string): Promise<string> {
  const { data } = await supabase
    .from("company_user")
    .select("role")
    .eq("user_id", userId)
    .eq("company_id", companyId)
    .maybeSingle();
  return (data?.role as string) ?? "atendente";
}

export const getCsatReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { dias?: number; atendenteId?: string | null }) => d ?? {})
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const companyId = await resolveCompanyIdCached(supabase, userId);
    const role = await loadRole(supabase, userId, companyId);
    const isAdmin = role === "owner" || role === "admin";

    const dias = Math.min(Math.max(data?.dias ?? 30, 1), 365);
    const desde = new Date(Date.now() - dias * 86400_000).toISOString();

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let q = supabaseAdmin
      .from("csat_response")
      .select("id, contato_nome, numero, score, comentario, enviado_em, respondido_em, enviado_por")
      .eq("company_id", companyId)
      .gte("enviado_em", desde)
      .order("enviado_em", { ascending: false })
      .limit(1000);

    if (!isAdmin) q = q.eq("enviado_por", userId);
    else if (data?.atendenteId) q = q.eq("enviado_por", data.atendenteId);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const ids = Array.from(new Set((rows ?? []).map((r: any) => r.enviado_por).filter(Boolean))) as string[];
    const nameById = new Map<string, string>();
    if (ids.length) {
      const { data: profs } = await supabaseAdmin
        .from("profiles")
        .select("user_id, nome, email")
        .in("user_id", ids);
      for (const p of profs ?? []) nameById.set(p.user_id as string, (p.nome as string) || (p.email as string) || "—");
    }

    const respostas: CsatResponseRow[] = (rows ?? []).map((r: any) => ({
      id: r.id,
      contato_nome: r.contato_nome,
      numero: r.numero,
      score: r.score,
      comentario: r.comentario,
      enviado_em: r.enviado_em,
      respondido_em: r.respondido_em,
      atendente_id: r.enviado_por ?? null,
      atendente_nome: r.enviado_por ? (nameById.get(r.enviado_por) ?? "—") : "Automático",
    }));

    const map = new Map<string, CsatAgentStat>();
    for (const r of respostas) {
      const key = r.atendente_id ?? "__auto__";
      let s = map.get(key);
      if (!s) {
        s = { userId: r.atendente_id, nome: r.atendente_nome, enviados: 0, respondidos: 0, media: null, dist: [0, 0, 0, 0, 0], detratores: 0 };
        map.set(key, s);
      }
      s.enviados++;
      if (r.score != null && r.score >= 1 && r.score <= 5) {
        s.respondidos++;
        s.dist[r.score - 1]++;
        if (r.score <= 2) s.detratores++;
      }
    }
    const porAtendente = Array.from(map.values()).map((s) => {
      const soma = s.dist.reduce((acc, n, i) => acc + n * (i + 1), 0);
      return { ...s, media: s.respondidos ? soma / s.respondidos : null };
    }).sort((a, b) => (b.media ?? -1) - (a.media ?? -1));

    const enviados = respostas.length;
    const respondidas = respostas.filter((r) => r.score != null);
    const media = respondidas.length
      ? respondidas.reduce((a, r) => a + (r.score as number), 0) / respondidas.length
      : null;

    // lista de atendentes para o filtro
    let atendentes: Array<{ id: string; nome: string }> = [];
    if (isAdmin) {
      const { data: membros } = await supabaseAdmin
        .from("company_user")
        .select("user_id")
        .eq("company_id", companyId)
        .eq("ativo", true);
      const mIds = (membros ?? []).map((m: any) => m.user_id);
      if (mIds.length) {
        const { data: profs } = await supabaseAdmin
          .from("profiles")
          .select("user_id, nome, email")
          .in("user_id", mIds);
        atendentes = (profs ?? []).map((p: any) => ({ id: p.user_id, nome: p.nome || p.email || "—" }));
      }
    }

    return {
      isAdmin,
      resumo: { enviados, respondidos: respondidas.length, media, taxa: enviados ? respondidas.length / enviados : 0 },
      porAtendente,
      respostas,
      atendentes,
    };
  });
