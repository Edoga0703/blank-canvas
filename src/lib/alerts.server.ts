import { supabaseAdmin } from "@/integrations/supabase/client.server";

export async function logWebhookError(params: {
  origem: string;
  erro: string;
  companyId?: string;
  payload?: any;
}) {
  try {
    await (supabaseAdmin as any).from("webhook_errors").insert({
      company_id: params.companyId,
      origem: params.origem,
      erro: params.erro,
      payload: params.payload,
    });
  } catch (e) {
    console.error("[logWebhookError] Critical failure:", e);
  }
}

export async function raiseAlert(params: {
  tipo: string;
  titulo: string;
  descricao: string;
  severidade: "info" | "warning" | "critical";
  companyId?: string;
  ref?: string;
}) {
  try {
    await (supabaseAdmin as any).from("system_alerts").insert({
      company_id: params.companyId,
      tipo: params.tipo,
      titulo: params.titulo,
      descricao: params.descricao,
      severidade: params.severidade,
      ref: params.ref,
    });
  } catch (e) {
    console.error("[raiseAlert] Critical failure:", e);
  }
}

export async function resolveAlert(tipo: string, ref: string) {
  try {
    await (supabaseAdmin as any).from("system_alerts")
      .update({ resolvido_em: new Date().toISOString() })
      .eq("tipo", tipo)
      .eq("ref", ref)
      .is("resolvido_em", null);
  } catch (e) {
    console.error("[resolveAlert] Critical failure:", e);
  }
}
