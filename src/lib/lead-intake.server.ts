import { normalizePhone } from "./br-phone";
// Entrada de leads compartilhada (formulários públicos e integrações).
// Mantém a mesma regra usada em /api/public/lead-capture.

export type CampoExtra = {
  label: string;
  valor: string;
  campo_id?: string | null;
  origem?: string | null;
  em?: string;
};

/** Junta respostas extras (formulário, integrações) no card sem perder as anteriores. */
export async function mergeCamposExtras(admin: any, cardId: string, novos: CampoExtra[]) {
  const limpos = (novos || [])
    .map((n) => ({
      label: String(n.label ?? "").trim().slice(0, 120),
      valor: String(n.valor ?? "").trim().slice(0, 1000),
      campo_id: n.campo_id ?? null,
      origem: n.origem ?? null,
    }))
    .filter((n) => n.label && n.valor);
  if (!limpos.length) return;

  const { data } = await admin.from("crm_cards").select("campos_extras").eq("id", cardId).maybeSingle();
  const atual = data?.campos_extras && typeof data.campos_extras === "object" ? { ...data.campos_extras } : {};
  const lista: CampoExtra[] = Array.isArray((atual as any).respostas) ? [...(atual as any).respostas] : [];
  const em = new Date().toISOString();

  for (const n of limpos) {
    const item = { ...n, em };
    const i = lista.findIndex((x) => String(x?.label ?? "").toLowerCase() === n.label.toLowerCase());
    if (i >= 0) lista[i] = item;
    else lista.push(item);
  }

  await admin
    .from("crm_cards")
    .update({ campos_extras: { ...atual, respostas: lista.slice(-80) } })
    .eq("id", cardId);
}

export type IntakeInput = {
  companyId: string;
  numeroRaw: string;
  nome?: string | null;
  email?: string | null;
  mensagem?: string | null;
  canal?: string | null;
  origem?: string | null;
  valor?: number | null;
  tags?: string[] | null;
  pipelineId?: string | null;
  stageId?: string | null;
  ownerId?: string | null;
  tracking?: Record<string, any> | null;
  camposExtras?: CampoExtra[] | null;
  /** Quando true, o lead entra com a régua da etapa pausada (não dispara mensagem automática). */
  pausarRegua?: boolean;
};

export function normalizeBrNumber(raw: string): string | null {
  const numero = normalizePhone(raw);
  if (!numero || numero.length < 9) return null;
  return numero;
}

/** Cria (ou atualiza) o card do CRM. Retorna { cardId, created }. */
export async function intakeLead(admin: any, input: IntakeInput) {
  const numero = normalizeBrNumber(input.numeroRaw);
  if (!numero) throw new Error("numero inválido");

  const now = new Date().toISOString();
  const t = input.tracking ?? {};

  let pipelineId = input.pipelineId ?? null;
  let stageId = input.stageId ?? null;
  let stageNome: string | null = null;

  if (stageId) {
    const { data: st } = await admin
      .from("crm_stage")
      .select("id, pipeline_id, nome")
      .eq("id", stageId)
      .eq("company_id", input.companyId)
      .maybeSingle();
    if (st) {
      pipelineId = st.pipeline_id;
      stageNome = st.nome;
    } else {
      stageId = null;
    }
  }

  if (!stageId) {
    const { data: entrada } = await admin
      .from("crm_pipeline")
      .select("id")
      .eq("company_id", input.companyId)
      .eq("entrada", true)
      .limit(1)
      .maybeSingle();
    let pipe = entrada;
    if (!pipe?.id) {
      const { data: comercial } = await admin
        .from("crm_pipeline")
        .select("id")
        .eq("company_id", input.companyId)
        .eq("tipo", "comercial")
        .order("ordem", { ascending: true })
        .limit(1)
        .maybeSingle();
      pipe = comercial;
    }
    if (pipe?.id) {
      const { data: stages } = await admin
        .from("crm_stage")
        .select("id, pipeline_id, nome, ordem, entrada_formulario")
        .eq("company_id", input.companyId)
        .eq("pipeline_id", pipe.id)
        .order("ordem", { ascending: true });
      // Etapa marcada como "Formulário" tem prioridade sobre a primeira etapa.
      const first = stages?.find((s: any) => s.entrada_formulario) ?? stages?.[0];
      if (first) {
        stageId = first.id;
        pipelineId = first.pipeline_id;
        stageNome = first.nome;
      }
    }
  }

  const { data: existing } = await admin
    .from("crm_cards")
    .select("id")
    .eq("company_id", input.companyId)
    .eq("numero", numero)
    .maybeSingle();

  const ultimaMensagem = (input.mensagem || "Lead capturado via formulário").slice(0, 240);

  if (existing) {
    await admin
      .from("crm_cards")
      .update({ ultima_mensagem: ultimaMensagem, ultima_em: now })
      .eq("id", existing.id);
    if (input.camposExtras?.length) {
      try {
        await mergeCamposExtras(admin, existing.id, input.camposExtras);
      } catch (e: any) {
        console.warn("[lead-intake.extras]", e?.message);
      }
    }
    return { cardId: existing.id as string, created: false, numero };
  }

  const payload: any = {
    company_id: input.companyId,
    numero,
    nome: input.nome || null,
    email: input.email || null,
    ultima_mensagem: ultimaMensagem,
    ultima_em: now,
    primeiro_contato_em: now,
    canal_entrada: input.canal || "formulario",
    origem: input.origem || t.utm_source || "formulario",
    utm_source: t.utm_source ?? null,
    utm_medium: t.utm_medium ?? null,
    utm_campaign: t.utm_campaign ?? null,
    utm_term: t.utm_term ?? null,
    utm_content: t.utm_content ?? null,
    gclid: t.gclid ?? null,
    fbclid: t.fbclid ?? null,
    referrer: t.referrer ?? null,
    first_page: t.first_page ?? null,
  };
  if (input.valor != null) payload.valor = input.valor;
  if (input.tags?.length) payload.tags = input.tags;
  if (stageId) {
    payload.stage_id = stageId;
    payload.pipeline_id = pipelineId;
    payload.status = stageNome;
  }

  let ownerId = input.ownerId ?? null;
  if (!ownerId) {
    const { pickLeadOwner } = await import("./crm-engine.server");
    ownerId = await pickLeadOwner(admin, input.companyId, stageId ?? undefined);
  }
  if (ownerId) payload.owner_id = ownerId;

  let effectiveUserId: string | null = ownerId;
  if (!effectiveUserId) {
    const { data: anyUser } = await admin
      .from("company_user")
      .select("user_id")
      .eq("company_id", input.companyId)
      .eq("ativo", true)
      .limit(1)
      .maybeSingle();
    effectiveUserId = anyUser?.user_id ?? null;
  }
  if (!effectiveUserId) throw new Error("empresa sem usuário ativo");
  payload.user_id = effectiveUserId;

  const { data: inserted, error } = await admin
    .from("crm_cards")
    .insert(payload)
    .select("id")
    .maybeSingle();
  if (error || !inserted) throw new Error(error?.message ?? "falha ao criar lead");

  if (input.camposExtras?.length) {
    try {
      await mergeCamposExtras(admin, inserted.id, input.camposExtras);
    } catch (e: any) {
      console.warn("[lead-intake.extras]", e?.message);
    }
  }

  await admin.from("lead_evento").insert({
    company_id: input.companyId,
    card_id: inserted.id,
    tipo: "captura",
    descricao: `Lead via ${input.canal || "formulário"}`,
  });

  if (input.pausarRegua) {
    try {
      await admin
        .from("crm_cards")
        .update({ regua_status: "pausada", regua_ultimo_disparo_em: now } as any)
        .eq("id", inserted.id);
    } catch (e: any) {
      console.warn("[lead-intake.regua-pausa]", e?.message);
    }
  } else {
    try {
      const { processKanbanReguaForNumero } = await import("./kanban-engine.server");
      await processKanbanReguaForNumero(admin, input.companyId, numero);
    } catch (e: any) {
      console.warn("[lead-intake.regua]", e?.message);
    }
  }

  void import("@/lib/crm-lead-analyzer.server")
    .then(({ checkAndAnalyzeLeadCooldown }) => checkAndAnalyzeLeadCooldown(input.companyId, numero))
    .catch(() => null);

  return { cardId: inserted.id as string, created: true, numero };
}
