import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveCompanyIdCached } from "./company-cache";
import { getRequest } from "@tanstack/react-start/server";

async function resolveCompanyId(supabase: any, userId: string): Promise<string> {
  return resolveCompanyIdCached(supabase, userId);
}
function appOrigin(): string {
  const envUrl = process.env.PUBLIC_APP_URL || process.env.VITE_PUBLIC_APP_URL;
  if (envUrl) return envUrl.replace(/\/$/, "");
  try {
    const u = new URL(getRequest().url);
    if (u.hostname === "localhost" || u.hostname === "127.0.0.1") return "https://metrixcrm.com.br";
    return `${u.protocol}//${u.host}`;
  } catch { return "https://metrixcrm.com.br"; }
}

function sortWhatsappInstances<T extends { status?: string | null; updated_at?: string | null }>(rows: T[] = []) {
  const rank = (status?: string | null) => {
    if (status === "connected" || status === "open") return 0;
    if (status === "connecting") return 1;
    return 2;
  };
  return [...rows].sort((a, b) => {
    const byStatus = rank(a.status) - rank(b.status);
    if (byStatus) return byStatus;
    return String(b.updated_at || "").localeCompare(String(a.updated_at || ""));
  });
}

export const moveLeadToCsatDestino = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { numero: string }) => d)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const companyId = await resolveCompanyId(supabase, userId);
    const numero = String(data.numero).replace(/\D/g, "");
    if (!numero) return { ok: false as const };
    const { data: comp } = await supabase.from("company").select("csat_move_para_posvenda,csat_destino_pipeline_id,csat_destino_stage_id").eq("id", companyId).maybeSingle();
    if (!comp || comp.csat_move_para_posvenda === false) return { ok: false as const, skipped: true };
    let destPipelineId: string | null = (comp?.csat_destino_pipeline_id as string | null) ?? null;
    let destStageId: string | null = (comp?.csat_destino_stage_id as string | null) ?? null;
    if (!destPipelineId || !destStageId) {
      const { data: pipe } = await supabase.from("crm_pipeline").select("id").eq("company_id", companyId).eq("tipo", "posvenda").maybeSingle();
      if (pipe?.id) {
        destPipelineId = pipe.id;
        const { data: st } = await supabase.from("crm_stage").select("id").eq("pipeline_id", pipe.id).order("ordem", { ascending: true }).limit(1).maybeSingle();
        destStageId = st?.id ?? null;
      }
    }
    if (destPipelineId && destStageId) {
      await supabase.from("crm_cards").update({ pipeline_id: destPipelineId, stage_id: destStageId }).eq("company_id", companyId).eq("numero", numero);
      return { ok: true as const };
    }
    return { ok: false as const };
  });

export const sendCsat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { numero: string; contatoNome?: string | null }) => d)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const companyId = await resolveCompanyId(supabase, userId);
    const numero = String(data.numero).replace(/\D/g, "");
    if (!numero) throw new Error("Número inválido.");

    const { data: comp } = await supabase.from("company").select("csat_pergunta,csat_ativo,csat_formato,csat_move_para_posvenda,csat_destino_pipeline_id,csat_destino_stage_id").eq("id", companyId).maybeSingle();
    if (comp && comp.csat_ativo === false) throw new Error("Pesquisa de satisfação desativada.");

    const noChat = (comp as any)?.csat_formato === "chat";

    // Encerra pesquisas antigas ainda abertas neste número
    if (noChat) {
      await supabase
        .from("csat_response")
        .update({ estado: "abandonado" } as any)
        .eq("company_id", companyId)
        .eq("numero", numero)
        .in("estado", ["aguardando_nota", "aguardando_comentario"]);
    }

    const { data: row, error } = await supabase
      .from("csat_response")
      .insert({
        company_id: companyId,
        numero,
        contato_nome: data.contatoNome ?? null,
        enviado_por: userId,
        ...(noChat
          ? {
              canal: "chat",
              estado: "aguardando_nota",
              expira_em: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            }
          : { canal: "link" }),
      } as any)
      .select("token")
      .maybeSingle();
    if (error || !row) throw new Error(error?.message ?? "Falha ao registrar CSAT.");

    const { getActiveInstance, waSendText } = await import("./wa-dispatch.server");
    const inst = await getActiveInstance(companyId);
    if (!inst) throw new Error("Nenhuma conexão WhatsApp encontrada. Conecte em Configurações → Integrações.");

    const link = `${appOrigin()}/csat/${row.token}`;
    const pergunta = (comp?.csat_pergunta as string | null) || "Como foi nosso atendimento?";
    // No formato "chat" a pergunta vai exatamente como foi escrita, sem link.
    const texto = noChat ? pergunta : `${pergunta}\nAvalie em 1 minuto: ${link}`;
    try {
      await waSendText(inst, numero, texto);
    } catch (e: any) {
      const msg = String(e?.message ?? "");
      console.warn("[csat evo send failed]", {
        msg,
        status: e?.status,
        details: JSON.stringify(e?.details ?? null),
        instance: inst.instance_name,
        numero,
      });
      if (/not.*connect|closed|disconnect|state/i.test(msg)) {
        return { ok: false as const, token: row.token, reason: "whatsapp_disconnected" as const, message: "WhatsApp desconectado. Reconecte em Configurações → Integrações." };
      }
      return { ok: false as const, token: row.token, reason: "evolution_error" as const, message: msg || "Falha ao enviar pela Evolution API.", details: e?.details };
    }
    const { error: msgErr } = await supabase.from("mensagens").insert({
      company_id: companyId, user_id: userId, numero, contato_nome: data.contatoNome ?? null,
      direcao: "saida", autor: "humano", texto,
    });
    if (msgErr) console.warn("[csat mensagens insert]", msgErr);

    // Move card para primeiro estágio do pipeline de pós-venda (se ativo)
    if (comp?.csat_move_para_posvenda !== false) {
      let destPipelineId: string | null = (comp?.csat_destino_pipeline_id as string | null) ?? null;
      let destStageId: string | null = (comp?.csat_destino_stage_id as string | null) ?? null;
      if (!destPipelineId || !destStageId) {
        const { data: pipe } = await supabase.from("crm_pipeline").select("id").eq("company_id", companyId).eq("tipo", "posvenda").maybeSingle();
        if (pipe?.id) {
          destPipelineId = pipe.id;
          const { data: st } = await supabase.from("crm_stage").select("id").eq("pipeline_id", pipe.id).order("ordem", { ascending: true }).limit(1).maybeSingle();
          destStageId = st?.id ?? null;
        }
      }
      if (destPipelineId && destStageId) {
        await supabase.from("crm_cards").update({ pipeline_id: destPipelineId, stage_id: destStageId }).eq("company_id", companyId).eq("numero", numero);
      }
    }

    return { ok: true, token: row.token };
  });


export const submitCsat = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string; score: number; comentario?: string }) => d)
  .handler(async ({ data }) => {
    if (!data.token || data.score < 1 || data.score > 5) throw new Error("Dados inválidos.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await (supabaseAdmin as any).from("csat_response").select("id, respondido_em").eq("token", data.token).maybeSingle();
    if (!row) throw new Error("Pesquisa não encontrada.");
    if (row.respondido_em) throw new Error("Pesquisa já respondida.");
    const { error } = await (supabaseAdmin as any).from("csat_response").update({
      score: data.score, comentario: data.comentario ?? null, respondido_em: new Date().toISOString(),
    }).eq("id", row.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getCsatByToken = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string }) => d)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await (supabaseAdmin as any)
      .from("csat_response")
      .select("token, respondido_em, company_id")
      .eq("token", data.token)
      .maybeSingle();
    if (!row) return { found: false as const };
    const { data: comp } = await (supabaseAdmin as any).from("company").select("nome, primary_color").eq("id", row.company_id).maybeSingle();
    return { found: true as const, respondido: !!row.respondido_em, empresa: comp?.nome ?? "", primaryColor: comp?.primary_color ?? "#0B22FE" };
  });
