import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveCompanyIdCached } from "./company-cache";

async function resolveCompanyId(supabase: any, userId: string): Promise<string> {
  return resolveCompanyIdCached(supabase, userId);
}
export const getCsatConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const cid = await resolveCompanyId(supabase, userId);
    const [{ data }, { data: profile }] = await Promise.all([
      supabase.from("company").select("csat_pergunta,csat_ativo,csat_formato,csat_pedir_comentario,csat_texto_comentario,csat_texto_agradecimento,csat_enviar_ao_finalizar,csat_move_para_posvenda,csat_auto_ganho,csat_destino_pipeline_id,csat_destino_stage_id,atendimento_operacional").eq("id", cid).maybeSingle(),
      supabase.from("profiles").select("csat_auto_finalizar").eq("user_id", userId).maybeSingle(),
    ]);
    const { data: pipes } = await supabase.from("crm_pipeline").select("id,nome,tipo,ordem").eq("company_id", cid).order("ordem", { ascending: true });
    const { data: stages } = await supabase.from("crm_stage").select("id,nome,pipeline_id,ordem").eq("company_id", cid).order("ordem", { ascending: true });
    return {
      pergunta: (data?.csat_pergunta as string | null) ?? "Como você avalia nosso atendimento de 1 a 5? 🙏",
      ativo: data?.csat_ativo !== false,
      formato: ((data as any)?.csat_formato as string | null) ?? "link",
      pedirComentario: (data as any)?.csat_pedir_comentario !== false,
      textoComentario: ((data as any)?.csat_texto_comentario as string | null) ?? "",
      textoAgradecimento: ((data as any)?.csat_texto_agradecimento as string | null) ?? "",
      enviarAoFinalizar: (data as any)?.atendimento_operacional
        ? (profile as any)?.csat_auto_finalizar !== false
        : (data as any)?.csat_enviar_ao_finalizar === true,
      envioIndividual: (data as any)?.atendimento_operacional === true,
      moverPosVenda: data?.csat_move_para_posvenda !== false,
      autoGanho: data?.csat_auto_ganho === true,
      destinoPipelineId: (data?.csat_destino_pipeline_id as string | null) ?? null,
      destinoStageId: (data?.csat_destino_stage_id as string | null) ?? null,
      pipelines: (pipes ?? []) as Array<{ id: string; nome: string; tipo: string; ordem: number }>,
      stages: (stages ?? []) as Array<{ id: string; nome: string; pipeline_id: string; ordem: number }>,
    };
  });

export const updateCsatConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    pergunta: string; ativo: boolean; moverPosVenda: boolean; autoGanho: boolean;
    destinoPipelineId?: string | null; destinoStageId?: string | null;
    formato?: string; pedirComentario?: boolean; textoComentario?: string | null;
    textoAgradecimento?: string | null; enviarAoFinalizar?: boolean;
  }) => d)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const cid = await resolveCompanyId(supabase, userId);
    const { error } = await supabase.from("company").update({
      csat_pergunta: data.pergunta.trim() || null,
      csat_ativo: data.ativo,
      ...(data.formato ? { csat_formato: data.formato === "chat" ? "chat" : "link" } : {}),
      ...(data.pedirComentario === undefined ? {} : { csat_pedir_comentario: data.pedirComentario }),
      ...(data.textoComentario === undefined ? {} : { csat_texto_comentario: data.textoComentario?.trim() || null }),
      ...(data.textoAgradecimento === undefined ? {} : { csat_texto_agradecimento: data.textoAgradecimento?.trim() || null }),
      ...(data.enviarAoFinalizar === undefined ? {} : { csat_enviar_ao_finalizar: data.enviarAoFinalizar }),
      csat_move_para_posvenda: data.moverPosVenda,
      csat_auto_ganho: data.autoGanho,
      csat_destino_pipeline_id: data.destinoPipelineId ?? null,
      csat_destino_stage_id: data.destinoStageId ?? null,
    }).eq("id", cid);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
