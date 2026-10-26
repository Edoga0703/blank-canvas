import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { resolveCompanyIdCached } from "./company-cache";

export type SectorOption = { id: string; nome: string; cor: string | null };

export type InboxSectors = {
  sectors: SectorOption[];
  myIds: string[];
};

/** Setores da empresa + os setores do usuário logado (para recorte do atendente). */
export const getInboxSectors = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<InboxSectors> => {
    const { supabase, userId } = context;
    const companyId = await resolveCompanyIdCached(supabase, userId);

    const { data: deps } = await supabase
      .from("department")
      .select("id,nome,cor,ativo")
      .eq("company_id", companyId)
      .eq("ativo", true)
      .order("nome");

    const sectors = ((deps ?? []) as any[]).map((d) => ({ id: d.id, nome: d.nome, cor: d.cor }));

    const { data: mine } = await supabase
      .from("department_member")
      .select("department_id")
      .eq("user_id", userId);

    const validIds = new Set(sectors.map((s) => s.id));
    const myIds = ((mine ?? []) as any[])
      .map((r) => r.department_id as string)
      .filter((id) => validIds.has(id));

    return { sectors, myIds };
  });

/**
 * Move a conversa (card) para um setor. Se o setor tiver fila de distribuição,
 * o próximo atendente da fila vira responsável.
 */
export const transferToSector = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      numero: z.string().min(3),
      department_id: z.string().uuid().nullable(),
    }),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const companyId = await resolveCompanyIdCached(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (!data.department_id) {
      const { error } = await supabaseAdmin
        .from("crm_cards")
        .update({ department_id: null })
        .eq("company_id", companyId)
        .eq("numero", data.numero);
      if (error) throw new Error(error.message);
      return { ok: true, owner_id: null, setor: "Sem setor" };
    }
    const { assignCardToSector } = await import("./sector-assignment.server");
    const result = await assignCardToSector(supabaseAdmin, companyId, data.numero, data.department_id);
    return { ok: true, ...result };
  });

export type RoutingSector = {
  id: string;
  nome: string;
  pipeline_id: string | null;
  membros: { user_id: string; nome: string }[];
};

export type RoutingData = {
  sectors: RoutingSector[];
  pipelines: { id: string; nome: string; stages: { id: string; nome: string }[] }[];
  members: { user_id: string; nome: string }[];
  manualDistribution: boolean;
};

/** Dados para o diálogo de triagem: setores, funil de cada setor, etapas e atendentes. */
export const getSectorRouting = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<RoutingData> => {
    const { supabase, userId } = context;
    const companyId = await resolveCompanyIdCached(supabase, userId);

    const [{ data: deps }, { data: pipes }, { data: stages }, { data: members }, { data: team }, { data: company }] =
      await Promise.all([
        supabase
          .from("department")
          .select("id,nome,pipeline_id")
          .eq("company_id", companyId)
          .eq("ativo", true)
          .order("nome"),
        supabase
          .from("crm_pipeline")
          .select("id,nome,ordem,ativo,oculto")
          .eq("company_id", companyId)
          .eq("ativo", true)
          .order("ordem"),
        supabase.from("crm_stage").select("id,nome,pipeline_id,ordem").eq("company_id", companyId).order("ordem"),
        supabase.from("department_member").select("department_id,user_id"),
        supabase.from("company_user").select("user_id").eq("company_id", companyId).eq("ativo", true),
        supabase.from("company").select("distribuicao_manual").eq("id", companyId).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
      ]);

    const teamIds = ((team ?? []) as any[]).map((t) => t.user_id as string);
    // Atendentes não enxergam o perfil dos colegas via RLS; usamos o client admin
    // apenas para resolver os nomes da própria equipe.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profiles } = teamIds.length
      ? await supabaseAdmin.from("profiles").select("user_id,nome,email").in("user_id", teamIds)
      : { data: [] };
    const profileById = new Map(
      ((profiles ?? []) as any[]).map((p) => [p.user_id as string, (p.nome || p.email || "Usuário") as string]),
    );
    const nomeDe = new Map(teamIds.map((id) => [id, profileById.get(id) ?? "Usuário"]));

    const sectors = ((deps ?? []) as any[]).map((d) => ({
      id: d.id as string,
      nome: d.nome as string,
      pipeline_id: (d.pipeline_id ?? null) as string | null,
      membros: ((members ?? []) as any[])
        .filter((m) => m.department_id === d.id && nomeDe.has(m.user_id))
        .map((m) => ({ user_id: m.user_id as string, nome: nomeDe.get(m.user_id) ?? "Usuário" })),
    }));

    const pipelines = ((pipes ?? []) as any[]).filter((p) => p.oculto !== true).map((p) => ({
      id: p.id as string,
      nome: p.nome as string,
      stages: ((stages ?? []) as any[])
        .filter((s) => s.pipeline_id === p.id)
        .map((s) => ({ id: s.id as string, nome: s.nome as string })),
    }));

    const teamMembers = ((team ?? []) as any[]).map((t) => ({
      user_id: t.user_id as string,
      nome: nomeDe.get(t.user_id as string) ?? "Usuário",
    }));

    return {
      sectors,
      pipelines,
      members: teamMembers,
      manualDistribution: company?.distribuicao_manual === true,
    };
  });

/** Encaminha o card: setor + etapa/funil + responsável, tudo escolhido manualmente. */
export const encaminharCard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      numero: z.string().min(3),
      department_id: z.string().uuid().nullable().optional(),
      stage_id: z.string().uuid().nullable(),
      owner_id: z.string().uuid().nullable().optional(),
      assignment_mode: z.enum(["manual", "automatic"]).default("manual"),
      /** Envia como convite: o atendente precisa aceitar para virar responsável. */
      requer_aceite: z.boolean().optional(),
    }),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const companyId = await resolveCompanyIdCached(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: membership } = await supabaseAdmin
      .from("company_user")
      .select("role,custom_role_id")
      .eq("company_id", companyId)
      .eq("user_id", userId)
      .eq("ativo", true)
      .maybeSingle();
    if (!membership) throw new Error("Acesso negado.");
    if (membership.role === "atendente" && membership.custom_role_id) {
      const { data: customRole } = await supabaseAdmin
        .from("company_role")
        .select("permissions")
        .eq("id", membership.custom_role_id)
        .eq("company_id", companyId)
        .eq("ativo", true)
        .maybeSingle();
      const permissions = customRole?.permissions as Record<string, Record<string, boolean>> | null;
      if (permissions?.conversas?.transfer === false) throw new Error("Você não tem permissão para encaminhar atendimentos.");
    }

    const { data: card } = await supabaseAdmin
      .from("crm_cards")
      .select("id,owner_id")
      .eq("company_id", companyId)
      .eq("numero", data.numero)
      .order("updated_at", { ascending: false }).limit(1).maybeSingle();
    if (!card) throw new Error("Conversa não encontrada.");

    const patch: Record<string, any> = {};
    let setorNome: string | null = null;
    let etapaNome: string | null = null;
    let donoNome: string | null = null;
    // owner_id ausente = manter o responsável atual do card.
    let finalOwnerId = data.owner_id === undefined ? ((card as any).owner_id ?? null) : data.owner_id;

    if (data.department_id !== undefined) patch.department_id = data.department_id;
    if (data.department_id) {
      const { data: dep } = await supabaseAdmin
        .from("department")
        .select("nome")
        .eq("id", data.department_id)
        .eq("company_id", companyId)
        .maybeSingle();
      if (!dep) throw new Error("Setor inválido.");
      setorNome = dep.nome as string;
    }

    if (data.assignment_mode === "automatic") {
      if (!data.department_id) throw new Error("Escolha um setor para distribuir automaticamente.");
      const { isManualDistribution } = await import("./crm-engine.server");
      if (await isManualDistribution(supabaseAdmin, companyId)) {
        throw new Error("A distribuição automática está desativada nesta empresa.");
      }
      const { assignCardToSector } = await import("./sector-assignment.server");
      const assigned = await assignCardToSector(supabaseAdmin, companyId, data.numero, data.department_id, { logEvent: false });
      finalOwnerId = assigned.owner_id;
      if (finalOwnerId) patch.owner_id = finalOwnerId;
    }

    if (data.stage_id) {
      const { data: stage } = await supabaseAdmin
        .from("crm_stage")
        .select("id,nome,pipeline_id")
        .eq("id", data.stage_id)
        .eq("company_id", companyId)
        .maybeSingle();
      if (!stage) throw new Error("Etapa inválida.");
      patch.stage_id = stage.id;
      patch.pipeline_id = stage.pipeline_id;
      patch.status = stage.nome;
      patch.entrou_stage_em = new Date().toISOString();
      etapaNome = stage.nome as string;
    }

    // Convite pendente: o card só troca de dono quando o atendente aceitar.
    const convite =
      data.assignment_mode === "manual" &&
      !!data.requer_aceite &&
      !!data.owner_id &&
      data.owner_id !== userId;

    if (convite) {
      patch.transfer_para_user_id = data.owner_id;
      patch.transfer_de_user_id = userId;
      patch.transfer_status = "pendente";
      patch.transfer_em = new Date().toISOString();
      finalOwnerId = (card as any).owner_id ?? null;
    } else {
      if (data.assignment_mode === "manual" && data.owner_id !== undefined) patch.owner_id = data.owner_id;
      patch.transfer_para_user_id = null;
      patch.transfer_de_user_id = null;
      patch.transfer_status = null;
      patch.transfer_em = null;
    }
    if (finalOwnerId) {
      const { data: member } = await supabaseAdmin
        .from("company_user")
        .select("user_id")
        .eq("company_id", companyId)
        .eq("user_id", finalOwnerId)
        .eq("ativo", true)
        .maybeSingle();
      if (!member) throw new Error("Responsável inválido.");
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("nome,email")
        .eq("user_id", finalOwnerId)
        .maybeSingle();
      donoNome = ((profile as any)?.nome || (profile as any)?.email || null) as string | null;
    }

    const { error } = await supabaseAdmin.from("crm_cards").update(patch as any).eq("id", card.id);
    if (error) throw new Error(error.message);

    if (finalOwnerId) {
      const { error: pauseError } = await supabaseAdmin.from("contact_pause").upsert(
        {
          company_id: companyId,
          user_id: userId,
          numero: data.numero,
          pausado: true,
          pausado_por: "humano",
          pausado_em: new Date().toISOString(),
        },
        { onConflict: "company_id,numero" },
      );
      if (pauseError) throw new Error(pauseError.message);
    }

    const partes = [setorNome, etapaNome, donoNome ?? (data.assignment_mode === "automatic" ? "Fila automática" : "Sem responsável")].filter(Boolean).join(" / ");
    await supabaseAdmin.from("lead_evento").insert({
      company_id: companyId,
      card_id: card.id,
      tipo: "transferencia_setor",
      descricao: `Encaminhado para ${partes}`,
    });

    return { ok: true, setor: setorNome, etapa: etapaNome, owner_id: finalOwnerId ?? null, pendente: convite };
  });

/** Atendente aceita ou recusa um convite de atendimento encaminhado para ele. */
export const responderTransferencia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ numero: z.string().min(3), aceitar: z.boolean() }))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const companyId = await resolveCompanyIdCached(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: card } = await supabaseAdmin
      .from("crm_cards")
      .select("id,owner_id,transfer_para_user_id,transfer_de_user_id,transfer_status")
      .eq("company_id", companyId)
      .eq("numero", data.numero)
      .order("updated_at", { ascending: false }).limit(1).maybeSingle();
    if (!card) throw new Error("Conversa não encontrada.");
    const c = card as any;
    if (c.transfer_status !== "pendente" || c.transfer_para_user_id !== userId) {
      throw new Error("Este atendimento não está aguardando a sua resposta.");
    }

    const patch: Record<string, any> = {
      transfer_para_user_id: null,
      transfer_de_user_id: null,
      transfer_status: null,
      transfer_em: null,
    };
    if (data.aceitar) patch.owner_id = userId;

    const { error } = await supabaseAdmin.from("crm_cards").update(patch as any).eq("id", c.id);
    if (error) throw new Error(error.message);

    await supabaseAdmin.from("lead_evento").insert({
      company_id: companyId,
      card_id: c.id,
      tipo: "transferencia_setor",
      descricao: data.aceitar ? "Atendimento aceito pelo atendente" : "Atendimento recusado pelo atendente",
    });

    return { ok: true, aceito: data.aceitar };
  });
