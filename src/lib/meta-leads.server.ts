type Admin = any;

/** Normaliza e grava um lead de formulário Meta; usado pelo webhook e pelo job de reconciliação. */
export async function processMetaLeadRecord(admin: Admin, input: { companyId: string; leadId: string; formId?: string; leadData: any }) {
  const fieldData = input.leadData?.field_data || [];
  let nome = "";
  let numero = "";
  let email = "";
  for (const field of fieldData) {
    const name = String(field?.name ?? "").toLowerCase();
    const val = String(field?.values?.[0] ?? "");
    if (name.includes("full_name") || name.includes("nome")) nome = val;
    else if (name.includes("phone") || name.includes("telefone") || name.includes("whatsapp")) numero = val;
    else if (name.includes("email")) email = val;
  }
  const cleanNumero = numero.replace(/\D/g, "");
  if (!cleanNumero) return { ok: false, reason: "lead_sem_telefone" };

  const { data: stages } = await admin.from("crm_stage")
    .select("id,pipeline_id,nome,distribution_queue_id,distribution_user_id,crm_pipeline!inner(tipo,distribution_queue_id)")
    .eq("company_id", input.companyId).eq("crm_pipeline.tipo", "comercial").order("ordem", { ascending: true }).limit(1);
  const firstStage = stages?.[0];
  const now = new Date().toISOString();
  const payload: any = {
    company_id: input.companyId, numero: cleanNumero, nome: nome || `Lead Meta ${input.leadId.slice(-4)}`, email: email || null,
    ultima_mensagem: `Lead capturado via Meta Ads (Form: ${input.formId || "N/A"})`, ultima_em: now,
    canal_entrada: "ads_meta", primeiro_contato_em: now, origem: "meta_lead_ads", meta_lead_id: input.leadId, meta_form_id: input.formId || null,
  };
  if (firstStage) { payload.pipeline_id = firstStage.pipeline_id; payload.stage_id = firstStage.id; payload.status = firstStage.nome; }

  const { data: existing } = await admin.from("crm_cards").select("id,meta_lead_id").eq("company_id", input.companyId).eq("numero", cleanNumero).order("updated_at", { ascending: false }).limit(1).maybeSingle();
  let cardId: string;
  if (existing?.id) {
    await admin.from("crm_cards").update({ ultima_mensagem: payload.ultima_mensagem, ultima_em: payload.ultima_em, meta_lead_id: input.leadId }).eq("id", existing.id);
    cardId = existing.id;
  } else {
    const { data: inserted, error } = await admin.from("crm_cards").insert(payload).select("id").maybeSingle();
    if (error || !inserted?.id) throw new Error(error?.message || "Não foi possível criar o card do lead Meta.");
    cardId = inserted.id;
    try {
      const { pickLeadOwner } = await import("@/lib/crm-engine.server");
      const ownerId = await pickLeadOwner(admin, input.companyId, firstStage?.id);
      if (ownerId) await admin.from("crm_cards").update({ owner_id: ownerId }).eq("id", cardId);
    } catch (error) { console.warn("[meta-lead] atribuição falhou", error); }
  }

  if (existing?.meta_lead_id !== input.leadId) {
    await admin.from("lead_evento").insert({ company_id: input.companyId, card_id: cardId, tipo: "captura", descricao: "Lead capturado automaticamente via Meta Lead Ads" });
  }
  try {
    const { processKanbanReguaForNumero } = await import("@/lib/kanban-engine.server");
    await processKanbanReguaForNumero(admin, input.companyId, cleanNumero);
  } catch (error) { console.warn("[meta-lead] régua falhou", error); }
  return { ok: true, cardId, numero: cleanNumero, created: !existing?.id };
}

export async function fetchAndProcessMetaLead(admin: Admin, pageId: string, leadId: string, formId?: string) {
  const { data: instance } = await admin.from("whatsapp_instances").select("instance_token,company_id").eq("phone_number_id", pageId).like("provider", "meta%").maybeSingle();
  if (!instance?.instance_token || !instance.company_id) throw new Error(`Token Meta não encontrado para a página ${pageId}`);
  const { metaGraphRequest } = await import("@/lib/meta.server");
  const leadData = await metaGraphRequest(`/${encodeURIComponent(leadId)}?fields=id,created_time,field_data,ad_id,form_id`, instance.instance_token);
  return processMetaLeadRecord(admin, { companyId: instance.company_id, leadId, formId, leadData });
}
