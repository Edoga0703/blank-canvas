import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveCompanyIdCached } from "./company-cache";

async function resolveCompanyId(supabase: any, userId: string): Promise<string> {
  return resolveCompanyIdCached(supabase, userId);
}

function onlyDigits(v: string) { return String(v || "").replace(/\D/g, ""); }
function normalizeBr(v: string) {
  const d = onlyDigits(v);
  if (!d) return "";
  if (d.length === 10 || d.length === 11) return "55" + d;
  return d;
}

export const listCampaigns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const companyId = await resolveCompanyId(supabase, userId);
    const { data, error } = await supabase
      .from("campaign")
      .select("*")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const companyId = await resolveCompanyId(supabase, userId);
    const { data: c } = await supabase.from("campaign").select("*").eq("id", data.id).eq("company_id", companyId).maybeSingle();
    if (!c) throw new Error("Campanha não encontrada.");
    const { data: targets } = await supabase
      .from("campaign_target")
      .select("*")
      .eq("campaign_id", data.id)
      .order("created_at", { ascending: true })
      .limit(500);
    return { campaign: c, targets: targets ?? [] };
  });

export const listAvailableTags = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const companyId = await resolveCompanyId(supabase, userId);
    const { data } = await supabase.from("crm_cards").select("tags").eq("company_id", companyId);
    const set = new Set<string>();
    for (const row of (data ?? []) as any[]) {
      for (const t of (row.tags ?? []) as string[]) if (t) set.add(t);
    }
    return Array.from(set).sort();
  });

export const previewAudience = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { tags: string[]; pularAtivosDias?: number }) => d)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const companyId = await resolveCompanyId(supabase, userId);
    let q = supabase.from("crm_cards").select("numero, contato_nome, tags").eq("company_id", companyId);
    if (data.tags && data.tags.length) q = q.overlaps("tags", data.tags);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const [{ data: opt }, { data: blk }, { data: pau }] = await Promise.all([
      supabase.from("campaign_optout").select("numero").eq("company_id", companyId),
      supabase.from("campaign_blocklist").select("numero").eq("company_id", companyId),
      supabase.from("contact_pause").select("numero").eq("company_id", companyId).eq("pausado", true),
    ]);
    const bloq = new Set<string>([
      ...(opt ?? []).map((x: any) => normalizeBr(x.numero)),
      ...(blk ?? []).map((x: any) => normalizeBr(x.numero)),
      ...(pau ?? []).map((x: any) => normalizeBr(x.numero)),
    ]);

    let ativos = 0;
    let ativosNumeros = new Set<string>();
    if ((data.pularAtivosDias ?? 0) > 0) {
      const desde = new Date(Date.now() - (data.pularAtivosDias as number) * 86400000).toISOString();
      const { data: recentes } = await supabase
        .from("mensagens").select("numero")
        .eq("company_id", companyId).gte("created_at", desde);
      for (const r of (recentes ?? []) as any[]) ativosNumeros.add(normalizeBr(r.numero));
    }

    const map = new Map<string, { numero: string; nome: string | null }>();
    let pulados = 0;
    for (const r of (rows ?? []) as any[]) {
      const num = normalizeBr(r.numero);
      if (!num) continue;
      if (bloq.has(num) || ativosNumeros.has(num)) { pulados++; continue; }
      if (!map.has(num)) map.set(num, { numero: num, nome: r.contato_nome ?? null });
    }
    ativos = ativosNumeros.size;
    return { total: map.size, pulados, ativos, sample: Array.from(map.values()).slice(0, 10) };
  });

export const listCampaignConnections = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const companyId = await resolveCompanyId(supabase, userId);
    const { data } = await supabase
      .from("whatsapp_instances")
      .select("id,instance_name,display_name,numero,provider_type,status,paused")
      .eq("company_id", companyId)
      .order("updated_at", { ascending: false });
    return data ?? [];
  });

export const listCampaignTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const companyId = await resolveCompanyId(supabase, userId);
    const { data } = await supabase
      .from("message_template")
      .select("id,atalho,texto")
      .eq("company_id", companyId)
      .order("atalho", { ascending: true });
    return data ?? [];
  });

type CampaignInput = {
  id?: string;
  nome: string;
  descricao?: string | null;
  mensagem: string;
  agendado_para?: string | null;
  filtro_tags?: string[];
  intervalo_min_seg?: number;
  intervalo_max_seg?: number;
  pausa_apos_envios?: number;
  pausa_duracao_min?: number;
  janela_dias?: number[];
  janela_hora_ini?: string;
  janela_hora_fim?: string;
  timezone?: string;
  limite_diario?: number;
  aquecimento_ativo?: boolean;
  aquecimento_dia_inicio?: string | null;
  simular_digitacao?: boolean;
  pular_ativos_dias?: number;
  midia_url_v2?: string | null;
  midia_tipo?: string | null;
  midia_nome?: string | null;
  origem_destinatarios?: "crm" | "csv";
  custom_targets?: { numero: string; nome?: string | null }[];
  whatsapp_instance_id?: string | null;
  velocidade_msg_seg?: number;

};

export const saveCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: CampaignInput) => d)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const companyId = await resolveCompanyId(supabase, userId);
    const cleanCustom = (data.custom_targets ?? [])
      .map((r) => ({ numero: normalizeBr(String(r.numero || "")), nome: r.nome ?? null }))
      .filter((r) => r.numero);
    const payload: any = {
      company_id: companyId,
      created_by: userId,
      nome: data.nome,
      mensagem: data.mensagem,
      agendado_para: data.agendado_para || null,
      filtro_tags: data.filtro_tags ?? [],
      intervalo_min_seg: Math.max(2, data.intervalo_min_seg ?? 5),
      intervalo_max_seg: Math.max(data.intervalo_min_seg ?? 5, data.intervalo_max_seg ?? 20),
      pausa_apos_envios: Math.max(0, data.pausa_apos_envios ?? 50),
      pausa_duracao_min: Math.max(1, data.pausa_duracao_min ?? 10),
      janela_dias: data.janela_dias ?? [1, 2, 3, 4, 5],
      janela_hora_ini: data.janela_hora_ini ?? "09:00",
      janela_hora_fim: data.janela_hora_fim ?? "18:00",
      timezone: data.timezone ?? "America/Sao_Paulo",
      limite_diario: Math.max(10, data.limite_diario ?? 200),
      aquecimento_ativo: !!data.aquecimento_ativo,
      aquecimento_dia_inicio: data.aquecimento_dia_inicio ?? null,
      simular_digitacao: data.simular_digitacao ?? true,
      pular_ativos_dias: Math.max(0, data.pular_ativos_dias ?? 15),
      midia_url_v2: data.midia_url_v2 ?? null,
      midia_tipo: data.midia_tipo ?? null,
      midia_nome: data.midia_nome ?? null,
      origem_destinatarios: data.origem_destinatarios ?? "crm",
      custom_targets: cleanCustom,
      descricao: data.descricao ?? null,
      whatsapp_instance_id: data.whatsapp_instance_id ?? null,
      velocidade_msg_seg: Math.max(1, Math.min(60, data.velocidade_msg_seg ?? 20)),
    };

    if (data.id) {
      const { data: row, error } = await supabase.from("campaign").update(payload).eq("id", data.id).eq("company_id", companyId).select("*").maybeSingle();
      if (error) throw new Error(error.message);
      return row;
    }
    const { data: row, error } = await supabase.from("campaign").insert(payload).select("*").maybeSingle();
    if (error) throw new Error(error.message);
    return row;
  });

// Upload de mídia para o bucket `campaign-media`, retorna URL assinada válida por 1 ano.
export const uploadCampaignMedia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { fileName: string; mime: string; base64: string }) => d)
  .handler(async ({ context, data }) => {
    const { userId } = context;
    const companyId = await resolveCompanyId(context.supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const bytes = Buffer.from(data.base64, "base64");
    const safe = data.fileName.replace(/[^\w.\-]+/g, "_");
    const path = `${companyId}/${Date.now()}_${safe}`;
    const { error: upErr } = await supabaseAdmin.storage
      .from("campaign-media")
      .upload(path, bytes, { contentType: data.mime, upsert: false });
    if (upErr) throw new Error(upErr.message);
    const { data: signed, error: sErr } = await supabaseAdmin.storage
      .from("campaign-media").createSignedUrl(path, 60 * 60 * 24 * 365);
    if (sErr) throw new Error(sErr.message);
    return { url: signed.signedUrl, path, mime: data.mime, fileName: safe };
  });

export const deleteCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const companyId = await resolveCompanyId(supabase, userId);
    const { error } = await supabase.from("campaign").delete().eq("id", data.id).eq("company_id", companyId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const startCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const companyId = await resolveCompanyId(supabase, userId);
    const { data: c } = await supabase.from("campaign").select("*").eq("id", data.id).eq("company_id", companyId).maybeSingle();
    if (!c) throw new Error("Campanha não encontrada.");
    if (c.status === "enviando" || c.status === "agendada") throw new Error("Campanha já está em execução.");

    const map = new Map<string, string | null>();
    const origem = (c as any).origem_destinatarios || "crm";
    if (origem === "csv") {
      const custom = ((c as any).custom_targets ?? []) as { numero: string; nome?: string | null }[];
      for (const r of custom) {
        const num = normalizeBr(r.numero);
        if (!num) continue;
        if (!map.has(num)) map.set(num, r.nome ?? null);
      }
    } else {
      let q = supabase.from("crm_cards").select("numero, contato_nome, tags").eq("company_id", companyId);
      if ((c.filtro_tags ?? []).length) q = q.overlaps("tags", c.filtro_tags as string[]);
      const { data: rows } = await q;
      for (const r of (rows ?? []) as any[]) {
        const num = normalizeBr(r.numero);
        if (!num) continue;
        if (!map.has(num)) map.set(num, r.contato_nome ?? null);
      }
    }
    if (map.size === 0) throw new Error("Nenhum contato encontrado para disparo.");

    await supabase.from("campaign_target").delete().eq("campaign_id", c.id);
    const inserts = Array.from(map.entries()).map(([numero, nome]) => ({
      campaign_id: c.id,
      company_id: companyId,
      contato_numero: numero,
      contato_nome: nome,
      status: "pendente" as const,
    }));
    for (let i = 0; i < inserts.length; i += 500) {
      const { error } = await supabase.from("campaign_target").insert(inserts.slice(i, i + 500));
      if (error) throw new Error(error.message);
    }

    const proximo = c.agendado_para && new Date(c.agendado_para) > new Date() ? c.agendado_para : new Date().toISOString();
    const status = c.agendado_para && new Date(c.agendado_para) > new Date() ? "agendada" : "enviando";
    const { error } = await supabase.from("campaign").update({
      status,
      total_destinatarios: inserts.length,
      total_enviados: 0,
      total_falhas: 0,
      enviados_hoje: 0,
      enviados_hoje_data: new Date().toISOString().slice(0, 10),
      iniciado_em: new Date().toISOString(),
      proximo_envio_em: proximo,
      concluido_em: null,
    }).eq("id", c.id);
    if (error) throw new Error(error.message);
    return { ok: true, total: inserts.length };
  });

export const pauseCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; pause: boolean }) => d)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const companyId = await resolveCompanyId(supabase, userId);
    const status = data.pause ? "pausada" : "enviando";
    const update: any = { status };
    if (!data.pause) update.proximo_envio_em = new Date().toISOString();
    const { error } = await supabase.from("campaign").update(update).eq("id", data.id).eq("company_id", companyId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const cancelCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const companyId = await resolveCompanyId(supabase, userId);
    const { error } = await supabase.from("campaign").update({ status: "cancelada", concluido_em: new Date().toISOString() }).eq("id", data.id).eq("company_id", companyId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============================================================
// Listas de bloqueio (opt-out e blocklist) — administração
// ============================================================

export const listBlocklist = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const companyId = await resolveCompanyId(supabase, userId);
    const [{ data: opt }, { data: blk }] = await Promise.all([
      supabase.from("campaign_optout").select("*").eq("company_id", companyId).order("created_at", { ascending: false }),
      supabase.from("campaign_blocklist").select("*").eq("company_id", companyId).order("created_at", { ascending: false }),
    ]);
    return { optouts: opt ?? [], blocklist: blk ?? [] };
  });

export const addBlock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { numero: string; motivo?: string }) => d)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const companyId = await resolveCompanyId(supabase, userId);
    const numero = normalizeBr(data.numero);
    if (!numero) throw new Error("Número inválido.");
    const { error } = await supabase.from("campaign_blocklist").insert({
      company_id: companyId, numero, motivo: data.motivo ?? null, created_by: userId,
    });
    if (error && !String(error.message).includes("duplicate")) throw new Error(error.message);
    return { ok: true };
  });

export const removeBlock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; tipo: "optout" | "blocklist" }) => d)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const companyId = await resolveCompanyId(supabase, userId);
    const table = data.tipo === "optout" ? "campaign_optout" : "campaign_blocklist";
    const { error } = await supabase.from(table).delete().eq("id", data.id).eq("company_id", companyId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
