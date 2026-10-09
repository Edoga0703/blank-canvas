/**
 * CRM Interno do Admin (Metrix) — reaproveita o CRM existente.
 *
 * Ideia: existe UMA empresa marcada como `is_internal = true` (o workspace
 * "Metrix Admin"). Os clientes da plataforma viram cards de CRM dentro dessa
 * empresa, e as automações administrativas (boas-vindas, fim de trial,
 * inadimplência, inatividade) disparam pela conexão WhatsApp dessa empresa.
 *
 * Nada disso aparece para os clientes: a empresa interna é comum do ponto de
 * vista do app, mas só o super admin tem acesso a ela.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { normalizeBrPhone } from "@/lib/br-phone";
import { getActiveInstance, waSendText } from "@/lib/wa-dispatch.server";

export type InternalCompany = {
  id: string;
  nome: string;
  slug: string;
  conexao: { instance_name: string; provider: string; status: string } | null;
};

export type SyncResult = { criados: number; atualizados: number; sem_telefone: number };
export type TickResult = { avaliados: number; enviados: number; erros: number; detalhes: string[] };

const DEDUPE_DIAS: Record<string, number> = {
  boas_vindas: 3650,
  fim_trial: 15,
  trial_expirado: 3650,
  pagamento_atrasado: 5,
  inatividade: 30,
};

export async function getInternalCompany(): Promise<InternalCompany | null> {
  const { data } = await supabaseAdmin
    .from("company")
    .select("id, nome, slug")
    .eq("is_internal", true)
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const inst = await getActiveInstance(data.id).catch(() => null);
  return {
    id: data.id,
    nome: data.nome,
    slug: data.slug,
    conexao: inst
      ? { instance_name: inst.instance_name, provider: inst.provider, status: inst.status }
      : null,
  };
}

export async function ensureInternalCompany(ownerUserId: string): Promise<InternalCompany> {
  const existing = await getInternalCompany();
  if (existing) return existing;

  const { data: comp, error } = await supabaseAdmin
    .from("company")
    .insert({
      nome: "Metrix Admin",
      slug: `metrix-admin-${Math.random().toString(36).slice(2, 6)}`,
      is_internal: true,
      status_cobranca: "ativo",
      created_by: ownerUserId,
      onboarding_completed: true,
    })
    .select("id, nome, slug")
    .single();
  if (error) throw new Error(error.message);

  await supabaseAdmin
    .from("company_user")
    .upsert(
      { company_id: comp.id, user_id: ownerUserId, role: "owner", ativo: true },
      { onConflict: "user_id,company_id" },
    );

  return { id: comp.id, nome: comp.nome, slug: comp.slug, conexao: null };
}

type ClientRow = {
  id: string;
  nome: string;
  telefone: string | null;
  status_cobranca: string;
  trial_ate: string;
  created_at: string;
  created_by: string | null;
  selected_plan_slug: string | null;
};

async function listClientCompanies(): Promise<ClientRow[]> {
  const { data } = await supabaseAdmin
    .from("company")
    .select("id, nome, telefone, status_cobranca, trial_ate, created_at, created_by, selected_plan_slug")
    .eq("is_internal", false)
    .order("created_at", { ascending: false });
  return (data ?? []) as ClientRow[];
}

/** Telefone do cliente: company.telefone, senão o telefone do perfil do dono. */
async function resolvePhone(c: ClientRow): Promise<string | null> {
  const raw = c.telefone?.trim();
  if (raw) return normalizeBrPhone(raw) || null;
  if (!c.created_by) return null;
  const { data: prof } = await supabaseAdmin
    .from("profiles")
    .select("telefone")
    .eq("user_id", c.created_by)
    .maybeSingle();
  const t = (prof as { telefone?: string } | null)?.telefone?.trim();
  return t ? normalizeBrPhone(t) || null : null;
}

function tagsFor(c: ClientRow): string[] {
  const t = ["metrix"];
  if (c.status_cobranca === "trial") t.push("lead", "trial");
  else t.push("cliente", c.status_cobranca);
  if (c.selected_plan_slug) t.push(`plano:${c.selected_plan_slug}`);
  return t;
}

/** Sincroniza as empresas cadastradas como cards no CRM interno. */
export async function syncAdminContacts(): Promise<SyncResult> {
  const internal = await getInternalCompany();
  if (!internal) throw new Error("Workspace interno não existe ainda");

  const { data: owner } = await supabaseAdmin
    .from("company_user")
    .select("user_id")
    .eq("company_id", internal.id)
    .eq("role", "owner")
    .limit(1)
    .maybeSingle();
  const ownerId = (owner as { user_id?: string } | null)?.user_id;
  if (!ownerId) throw new Error("Workspace interno sem dono");

  const clients = await listClientCompanies();
  const res: SyncResult = { criados: 0, atualizados: 0, sem_telefone: 0 };

  for (const c of clients) {
    const numero = await resolvePhone(c);
    if (!numero) {
      res.sem_telefone++;
      continue;
    }
    const { data: existing } = await supabaseAdmin
      .from("crm_cards")
      .select("id")
      .eq("company_id", internal.id)
      .eq("numero", numero)
      .maybeSingle();

    const payload = {
      company_id: internal.id,
      user_id: ownerId,
      numero,
      nome: c.nome,
      empresa: c.nome,
      origem: "metrix-admin",
      tags: tagsFor(c),
      observacao: `company:${c.id}`,
    };

    if (existing) {
      await supabaseAdmin
        .from("crm_cards")
        .update({ nome: payload.nome, empresa: payload.empresa, tags: payload.tags, observacao: payload.observacao })
        .eq("id", (existing as { id: string }).id);
      res.atualizados++;
    } else {
      const { error } = await supabaseAdmin.from("crm_cards").insert(payload);
      if (!error) res.criados++;
    }
  }
  return res;
}

function render(tpl: string, vars: Record<string, string | number>) {
  return tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k: string) => String(vars[k] ?? ""));
}

function diasEntre(a: Date, b: Date) {
  return Math.round((a.getTime() - b.getTime()) / 86_400_000);
}

async function jaEnviou(trigger: string, companyId: string, dias: number) {
  const desde = new Date(Date.now() - dias * 86_400_000).toISOString();
  const { data } = await supabaseAdmin
    .from("admin_automation_log")
    .select("id")
    .eq("trigger_key", trigger)
    .eq("target_company_id", companyId)
    .eq("status", "enviado")
    .gte("enviado_em", desde)
    .limit(1);
  return (data ?? []).length > 0;
}

async function ultimoAcesso(companyId: string): Promise<Date | null> {
  const { data } = await supabaseAdmin
    .from("auth_log")
    .select("created_at")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const v = (data as { created_at?: string } | null)?.created_at;
  return v ? new Date(v) : null;
}

/** Grava o envio administrativo como mensagem na conversa do contato. */
export async function logAdminMensagem(companyId: string, numero: string, texto: string, nome?: string) {
  try {
    await supabaseAdmin.from("mensagens").insert({
      company_id: companyId,
      numero,
      contato_nome: nome ?? null,
      texto,
      direcao: "saida",
      autor: "humano",
      created_at: new Date().toISOString(),
    } as never);
  } catch (e) {
    console.warn("[admin-crm] falha ao registrar mensagem", e);
  }
}

/** Roda os gatilhos administrativos (chamado pelo cron). */
export async function runAdminAutomations(): Promise<TickResult> {
  const out: TickResult = { avaliados: 0, enviados: 0, erros: 0, detalhes: [] };
  const internal = await getInternalCompany();
  if (!internal) return { ...out, detalhes: ["workspace interno não configurado"] };

  // Mantém a base espelhada no CRM interno sem depender de clique manual.
  await syncAdminContacts().catch((e) => out.detalhes.push(`sync: ${(e as Error).message}`));

  const inst = await getActiveInstance(internal.id);
  if (!inst || inst.paused) return { ...out, detalhes: ["conexão WhatsApp do admin indisponível"] };


  const { data: autos } = await supabaseAdmin
    .from("admin_automation")
    .select("trigger_key, template, offset_dias, ativo")
    .eq("ativo", true);
  if (!autos?.length) return { ...out, detalhes: ["nenhuma automação ativa"] };

  const clients = await listClientCompanies();
  const hoje = new Date();

  for (const auto of autos as { trigger_key: string; template: string; offset_dias: number }[]) {
    for (const c of clients) {
      out.avaliados++;
      let match = false;
      let dias = 0;

      if (auto.trigger_key === "boas_vindas") {
        match = diasEntre(hoje, new Date(c.created_at)) <= 1;
      } else if (auto.trigger_key === "fim_trial") {
        dias = diasEntre(new Date(c.trial_ate), hoje);
        match = c.status_cobranca === "trial" && dias > 0 && dias <= Math.max(1, auto.offset_dias);
      } else if (auto.trigger_key === "trial_expirado") {
        dias = diasEntre(hoje, new Date(c.trial_ate));
        match = c.status_cobranca === "trial" && dias >= 0 && dias <= 1;
      } else if (auto.trigger_key === "pagamento_atrasado") {
        match = ["inadimplente", "atrasado", "past_due"].includes(c.status_cobranca);
      } else if (auto.trigger_key === "inatividade") {
        if (c.status_cobranca !== "trial") {
          const last = await ultimoAcesso(c.id);
          const ref = last ?? new Date(c.created_at);
          dias = diasEntre(hoje, ref);
          match = dias >= Math.max(1, auto.offset_dias);
        }
      }
      if (!match) continue;

      if (await jaEnviou(auto.trigger_key, c.id, DEDUPE_DIAS[auto.trigger_key] ?? 30)) continue;

      const numero = await resolvePhone(c);
      if (!numero) continue;

      // Boas-vindas já enviadas no cadastro (disparo imediato)? não repete.
      if (auto.trigger_key === "boas_vindas") {
        const { data: jaNoCadastro } = await supabaseAdmin
          .from("signup_welcome_log")
          .select("id")
          .eq("telefone", numero)
          .eq("status", "enviado")
          .limit(1);
        if ((jaNoCadastro ?? []).length) continue;
      }

      const texto = render(auto.template, {
        nome: c.nome,
        empresa: c.nome,
        plano: c.selected_plan_slug ?? "",
        dias,
      });

      try {
        await waSendText(inst, numero, texto);
        out.enviados++;
        await logAdminMensagem(internal.id, numero, texto, c.nome);
        await supabaseAdmin.from("admin_automation_log").insert({
          trigger_key: auto.trigger_key,
          target_company_id: c.id,
          numero,
          status: "enviado",
          mensagem: texto,
        });
      } catch (e) {
        out.erros++;
        await supabaseAdmin.from("admin_automation_log").insert({
          trigger_key: auto.trigger_key,
          target_company_id: c.id,
          numero,
          status: "erro",
          erro: (e as Error)?.message?.slice(0, 400) ?? "erro",
          mensagem: texto,
        });
      }
      // respiro entre envios para preservar o número
      await new Promise((r) => setTimeout(r, 1200));
    }
  }
  return out;
}

export type Segmento = "todos" | "trial" | "ativos" | "inadimplentes" | "inativos";

export async function segmentCompanies(seg: Segmento): Promise<ClientRow[]> {
  const clients = await listClientCompanies();
  if (seg === "todos") return clients;
  if (seg === "trial") return clients.filter((c) => c.status_cobranca === "trial");
  if (seg === "ativos") return clients.filter((c) => c.status_cobranca === "ativo");
  if (seg === "inadimplentes")
    return clients.filter((c) => ["inadimplente", "atrasado", "past_due"].includes(c.status_cobranca));
  const res: ClientRow[] = [];
  for (const c of clients) {
    const last = await ultimoAcesso(c.id);
    if (!last || diasEntre(new Date(), last) >= 15) res.push(c);
  }
  return res;
}

/** Disparo manual para um segmento da base. */
export async function sendAdminBroadcast(seg: Segmento, texto: string): Promise<TickResult> {
  const out: TickResult = { avaliados: 0, enviados: 0, erros: 0, detalhes: [] };
  const internal = await getInternalCompany();
  if (!internal) throw new Error("Workspace interno não configurado");
  const inst = await getActiveInstance(internal.id);
  if (!inst) throw new Error("Conexão WhatsApp do admin não encontrada");

  const alvos = await segmentCompanies(seg);
  for (const c of alvos) {
    out.avaliados++;
    const numero = await resolvePhone(c);
    if (!numero) continue;
    const msg = render(texto, { nome: c.nome, empresa: c.nome, plano: c.selected_plan_slug ?? "", dias: 0 });
    try {
      await waSendText(inst, numero, msg);
      out.enviados++;
      await logAdminMensagem(internal.id, numero, msg, c.nome);
      await supabaseAdmin.from("admin_automation_log").insert({
        trigger_key: `disparo:${seg}`,
        target_company_id: c.id,
        numero,
        status: "enviado",
        mensagem: msg,
      });
    } catch (e) {
      out.erros++;
      await supabaseAdmin.from("admin_automation_log").insert({
        trigger_key: `disparo:${seg}`,
        target_company_id: c.id,
        numero,
        status: "erro",
        erro: (e as Error)?.message?.slice(0, 400) ?? "erro",
      });
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  return out;
}

/* ---------- Leituras para o painel ---------- */

export type BaseRow = {
  id: string;
  nome: string;
  telefone: string | null;
  plano: string | null;
  status: string;
  criado_em: string;
  trial_ate: string | null;
  ultimo_acesso: string | null;
};

export type AdminOverview = {
  clientes: number;
  trial: number;
  ativos: number;
  inadimplentes: number;
  inativos: number;
  envios7d: number;
  falhas7d: number;
  semTelefone: number;
};

export async function listAdminBase(filtro: string, busca: string): Promise<BaseRow[]> {
  const clients = await listClientCompanies();
  const q = busca.trim().toLowerCase();
  const rows: BaseRow[] = [];
  for (const c of clients) {
    const status = c.status_cobranca;
    if (filtro === "trial" && status !== "trial") continue;
    if (filtro === "ativos" && status !== "ativo") continue;
    if (filtro === "inadimplentes" && !["inadimplente", "atrasado", "past_due"].includes(status)) continue;
    if (q && !c.nome.toLowerCase().includes(q)) continue;
    const last = await ultimoAcesso(c.id);
    if (filtro === "inativos" && last && diasEntre(new Date(), last) < 15) continue;
    rows.push({
      id: c.id,
      nome: c.nome,
      telefone: await resolvePhone(c),
      plano: c.selected_plan_slug,
      status,
      criado_em: c.created_at,
      trial_ate: c.trial_ate,
      ultimo_acesso: last ? last.toISOString() : null,
    });
  }
  return rows.slice(0, 300);
}

export async function getAdminOverview(): Promise<AdminOverview> {
  const clients = await listClientCompanies();
  const desde = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const { data: logs } = await supabaseAdmin
    .from("admin_automation_log")
    .select("status")
    .gte("enviado_em", desde);
  const l = (logs ?? []) as { status: string }[];

  let inativos = 0;
  let semTelefone = 0;
  for (const c of clients) {
    const last = await ultimoAcesso(c.id);
    if (!last || diasEntre(new Date(), last) >= 15) inativos++;
    if (!(await resolvePhone(c))) semTelefone++;
  }

  return {
    clientes: clients.length,
    trial: clients.filter((c) => c.status_cobranca === "trial").length,
    ativos: clients.filter((c) => c.status_cobranca === "ativo").length,
    inadimplentes: clients.filter((c) =>
      ["inadimplente", "atrasado", "past_due"].includes(c.status_cobranca),
    ).length,
    inativos,
    envios7d: l.filter((x) => x.status === "enviado").length,
    falhas7d: l.filter((x) => x.status !== "enviado").length,
    semTelefone,
  };
}

export type AdminLogRow = {
  id: string;
  trigger_key: string;
  numero: string | null;
  status: string;
  erro: string | null;
  mensagem: string | null;
  enviado_em: string;
};

export async function listAdminLogs(opts: { status?: string; tipo?: string; dias?: number }): Promise<AdminLogRow[]> {
  let q = supabaseAdmin
    .from("admin_automation_log")
    .select("id, trigger_key, numero, status, erro, mensagem, enviado_em")
    .order("enviado_em", { ascending: false })
    .limit(200);
  if (opts.status && opts.status !== "todos") q = q.eq("status", opts.status);
  if (opts.dias) q = q.gte("enviado_em", new Date(Date.now() - opts.dias * 86_400_000).toISOString());
  const { data } = await q;
  let rows = (data ?? []) as AdminLogRow[];
  if (opts.tipo === "disparo") rows = rows.filter((r) => r.trigger_key.startsWith("disparo:"));
  else if (opts.tipo === "automacao") rows = rows.filter((r) => !r.trigger_key.startsWith("disparo:"));
  return rows;
}

/** Quantos clientes se encaixam hoje em cada gatilho (contador do painel). */
export async function countAutomationMatches(): Promise<Record<string, number>> {
  const clients = await listClientCompanies();
  const hoje = new Date();
  const out: Record<string, number> = {
    boas_vindas: 0,
    fim_trial: 0,
    trial_expirado: 0,
    pagamento_atrasado: 0,
    inatividade: 0,
  };
  for (const c of clients) {
    if (diasEntre(hoje, new Date(c.created_at)) <= 1) out["boas_vindas"]!++;
    if (c.status_cobranca === "trial") {
      const restam = diasEntre(new Date(c.trial_ate), hoje);
      if (restam > 0 && restam <= 3) out["fim_trial"]!++;
      const passou = diasEntre(hoje, new Date(c.trial_ate));
      if (passou >= 0 && passou <= 1) out["trial_expirado"]!++;
    }
    if (["inadimplente", "atrasado", "past_due"].includes(c.status_cobranca)) out["pagamento_atrasado"]!++;
    if (c.status_cobranca !== "trial") {
      const last = await ultimoAcesso(c.id);
      if (!last || diasEntre(hoje, last) >= 15) out["inatividade"]!++;
    }
  }
  return out;
}
