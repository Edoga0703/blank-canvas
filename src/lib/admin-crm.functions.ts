import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type AdminAutomation = {
  id: string;
  trigger_key: string;
  nome: string;
  descricao: string | null;
  ativo: boolean;
  template: string;
  offset_dias: number;
  ordem: number;
};

export type AdminCrmStatus = {
  workspace: { id: string; nome: string; slug: string; conexao: { instance_name: string; provider: string; status: string } | null } | null;
  automacoes: AdminAutomation[];
  logs: {
    id: string;
    trigger_key: string;
    numero: string | null;
    status: string;
    erro: string | null;
    mensagem: string | null;
    enviado_em: string;
  }[];
  totais: { clientes: number; trial: number; inadimplentes: number };
};

async function assertSuper(context: { supabase: { rpc: (n: string) => Promise<{ data: unknown }> } }) {
  const { data } = await context.supabase.rpc("is_super_admin");
  if (!data) throw new Error("Acesso restrito ao super admin");
}

export const getAdminCrmStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminCrmStatus> => {
    await assertSuper(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getInternalCompany } = await import("@/lib/admin-crm.server");

    const workspace = await getInternalCompany();
    const [{ data: autos }, { data: logs }, { data: comps }] = await Promise.all([
      supabaseAdmin.from("admin_automation").select("*").order("ordem"),
      supabaseAdmin
        .from("admin_automation_log")
        .select("id, trigger_key, numero, status, erro, mensagem, enviado_em")
        .order("enviado_em", { ascending: false })
        .limit(30),
      supabaseAdmin.from("company").select("status_cobranca").eq("is_internal", false),
    ]);

    const rows = (comps ?? []) as { status_cobranca: string }[];
    return {
      workspace,
      automacoes: (autos ?? []) as AdminAutomation[],
      logs: (logs ?? []) as AdminCrmStatus["logs"],
      totais: {
        clientes: rows.length,
        trial: rows.filter((r) => r.status_cobranca === "trial").length,
        inadimplentes: rows.filter((r) => ["inadimplente", "atrasado", "past_due"].includes(r.status_cobranca)).length,
      },
    };
  });

export const createAdminWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuper(context as never);
    const { ensureInternalCompany } = await import("@/lib/admin-crm.server");
    return ensureInternalCompany(context.userId);
  });

export const saveAdminAutomation = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string; ativo?: boolean; template?: string; offset_dias?: number }) => d)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    await assertSuper(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: { ativo?: boolean; template?: string; offset_dias?: number } = {};
    if (data.ativo !== undefined) patch.ativo = data.ativo;
    if (data.template !== undefined) patch.template = data.template;
    if (data.offset_dias !== undefined) patch.offset_dias = data.offset_dias;
    const { error } = await supabaseAdmin.from("admin_automation").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const syncAdminContactsNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuper(context as never);
    const { syncAdminContacts } = await import("@/lib/admin-crm.server");
    return syncAdminContacts();
  });

export const runAdminAutomationsNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuper(context as never);
    const { runAdminAutomations } = await import("@/lib/admin-crm.server");
    return runAdminAutomations();
  });

export const previewAdminBroadcast = createServerFn({ method: "POST" })
  .inputValidator((d: { segmento: string }) => d)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    await assertSuper(context as never);
    const { segmentCompanies } = await import("@/lib/admin-crm.server");
    const alvos = await segmentCompanies(data.segmento as never);
    return { total: alvos.length, exemplos: alvos.slice(0, 5).map((c) => c.nome) };
  });

export const sendAdminBroadcastNow = createServerFn({ method: "POST" })
  .inputValidator((d: { segmento: string; texto: string }) => d)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    await assertSuper(context as never);
    if (!data.texto.trim()) throw new Error("Mensagem vazia");
    const { sendAdminBroadcast } = await import("@/lib/admin-crm.server");
    return sendAdminBroadcast(data.segmento as never, data.texto);
  });

export type AdminBaseRow = {
  id: string;
  nome: string;
  telefone: string | null;
  plano: string | null;
  status: string;
  criado_em: string;
  trial_ate: string | null;
  ultimo_acesso: string | null;
};

export const getAdminOverviewData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuper(context as never);
    const { getAdminOverview, countAutomationMatches } = await import("@/lib/admin-crm.server");
    const [overview, matches] = await Promise.all([getAdminOverview(), countAutomationMatches()]);
    return { overview, matches };
  });

export const listAdminBaseRows = createServerFn({ method: "POST" })
  .inputValidator((d: { filtro?: string; busca?: string }) => d)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<AdminBaseRow[]> => {
    await assertSuper(context as never);
    const { listAdminBase } = await import("@/lib/admin-crm.server");
    return listAdminBase(data.filtro ?? "todos", data.busca ?? "");
  });

export const listAdminLogRows = createServerFn({ method: "POST" })
  .inputValidator((d: { status?: string; tipo?: string; dias?: number }) => d)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    await assertSuper(context as never);
    const { listAdminLogs } = await import("@/lib/admin-crm.server");
    return listAdminLogs(data);
  });
