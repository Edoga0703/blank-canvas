import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function getOwnedCompanyId(supabase: any, userId: string): Promise<string> {
  const { data, error } = await supabase
    .from("company_user")
    .select("company_id")
    .eq("user_id", userId)
    .eq("ativo", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Sem empresa.");
  return data.company_id as string;
}

export const getDefaultQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const companyId = await getOwnedCompanyId(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    
    // 1. Busca a primeira fila (padrão)
    let { data: queue, error } = await supabaseAdmin
      .from("crm_distribution_queues")
      .select(`
        *,
        members:crm_queue_members(
          *,
          profile:profiles(nome, avatar_url, last_seen_at)
        )
      `)
      .eq("company_id", companyId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
      
    if (error) throw error;

    // 2. Se não existir, cria a fila padrão
    if (!queue) {
      const { data: newQueue, error: createErr } = await supabaseAdmin
        .from("crm_distribution_queues")
        .insert({
          company_id: companyId,
          nome: "Fila Padrão",
          strategy: "round_robin",
          ativo: true
        })
        .select()
        .single();
      
      if (createErr) throw createErr;
      queue = { ...newQueue, members: [] };
    }

    // 3. Sincroniza membros: todos os usuários ativos da empresa devem estar na fila
    const { data: teamMembers } = await supabaseAdmin
      .from("company_user")
      .select("user_id")
      .eq("company_id", companyId)
      .eq("ativo", true);

    const currentMemberUserIds = new Set((queue as any).members?.map((m: any) => m.user_id) || []);
    const teamUserIds = (teamMembers || []).map((m: any) => m.user_id);

    const toAdd = teamUserIds.filter(uid => !currentMemberUserIds.has(uid));
    
    if (toAdd.length > 0) {
      const nextOrder = (queue as any).members?.length || 0;
      const { error: insErr } = await supabaseAdmin
        .from("crm_queue_members")
        .insert(toAdd.map((uid, idx) => ({
          queue_id: (queue as any).id,
          company_id: companyId,
          user_id: uid,
          ordem: nextOrder + idx,
          ativo: true
        })));
      
      if (!insErr) {
        // Recarrega para vir com profiles
        const { data: updatedQueue } = await supabaseAdmin
          .from("crm_distribution_queues")
          .select(`
            *,
            members:crm_queue_members(
              *,
              profile:profiles(nome, avatar_url, last_seen_at)
            )
          `)
          .eq("id", (queue as any).id)
          .single();
        queue = updatedQueue;
      }
    }

    // Ordena membros localmente por 'ordem'
    if (queue?.members) {
      (queue.members as any[]).sort((a: any, b: any) => a.ordem - b.ordem);
    }

    return queue;
  });

export const updateMemberStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    memberId: z.string(),
    ativo: z.boolean()
  }))
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("crm_queue_members")
      .update({ ativo: data.ativo })
      .eq("id", data.memberId);
    if (error) throw error;
    return { ok: true };
  });

export const updateQueueOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    queueId: z.string(),
    memberOrders: z.array(z.object({
      memberId: z.string(),
      ordem: z.number()
    }))
  }))
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    
    // Batch update order
    for (const item of data.memberOrders) {
      await supabase
        .from("crm_queue_members")
        .update({ ordem: item.ordem })
        .eq("id", item.memberId);
    }
    
    return { ok: true };
  });

/**
 * Função interna para obter o próximo usuário de uma fila.
 * Pode ser usada por webhooks e triggers.
 */
export async function getNextUserInQueue(supabaseAdmin: any, queueId: string): Promise<string | null> {
  const { data: queue, error: qErr } = await supabaseAdmin
    .from("crm_distribution_queues")
    .select("id")
    .eq("id", queueId)
    .eq("ativo", true)
    .single();

  if (qErr || !queue) return null;

  // Todos os membros da fila (inclusive pausados) — os pausados ainda contam
  // para saber quem foi o último a receber, mas nunca recebem lead.
  const { data: allMembers, error: mErr } = await supabaseAdmin
    .from("crm_queue_members")
    .select("id, user_id, ordem, ativo, leads_count, last_assigned_at")
    .eq("queue_id", queueId)
    .order("ordem", { ascending: true });

  if (mErr || !allMembers || allMembers.length === 0) return null;

  const active = (allMembers as any[]).filter((m) => m.ativo);
  if (active.length === 0) return null;

  // Último membro que recebeu um lead (por data), para continuar o rodízio a partir dele.
  let lastOrdem: number | null = null;
  let lastTs = 0;
  for (const m of allMembers as any[]) {
    const ts = m.last_assigned_at ? new Date(m.last_assigned_at).getTime() : 0;
    if (ts > lastTs) {
      lastTs = ts;
      lastOrdem = m.ordem ?? 0;
    }
  }

  // Rodízio estrito pela ordem definida no submódulo Distribuição.
  const member =
    lastOrdem === null
      ? active[0]
      : active.find((m) => (m.ordem ?? 0) > lastOrdem!) || active[0];

  if (!member) return null;

  console.log(
    `[getNextUserInQueue] Fila ${queueId} → user ${member.user_id} (ordem ${member.ordem}, anterior ordem ${lastOrdem})`
  );

  await supabaseAdmin
    .from("crm_queue_members")
    .update({
      last_assigned_at: new Date().toISOString(),
      leads_count: (member.leads_count || 0) + 1,
    })
    .eq("id", member.id);

  return member.user_id;
}


// Mantemos as antigas por compatibilidade temporária
export const listQueues = getDefaultQueue; 
export const upsertQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.any())
  .handler(async () => ({ ok: true }));


export const removeMemberFromQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    memberId: z.string()
  }))
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("crm_queue_members")
      .delete()
      .eq("id", data.memberId);
    if (error) throw error;
    return { ok: true };
  });
