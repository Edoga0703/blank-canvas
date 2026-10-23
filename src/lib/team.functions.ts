import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function getOwnedCompanyId(supabase: any, userId: string): Promise<{ companyId: string; role: string }> {
  const { data, error } = await supabase
    .from("company_user")
    .select("company_id, role")
    .eq("user_id", userId)
    .eq("ativo", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Sem empresa.");
  return { companyId: data.company_id as string, role: data.role as string };
}

function assertAdmin(role: string) {
  if (role !== "owner" && role !== "admin") {
    throw new Error("Apenas owner/admin podem gerenciar a equipe.");
  }
}

export const listTeam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { companyId } = await getOwnedCompanyId(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: members, error } = await supabaseAdmin
      .from("company_user")
      .select("id, user_id, role, ativo, created_at, max_chats, custom_role_id, last_login_at, last_login_ip")
      .eq("company_id", companyId)
      .order("created_at", { ascending: true });
    if (error) throw error;

    const ids = (members ?? []).map((m: any) => m.user_id);
    let profilesById = new Map<string, { email: string | null; nome: string | null; avatar_url: string | null; last_seen_at: string | null }>();
    let depsByUser = new Map<string, { id: string; nome: string; cor: string | null }[]>();
    let instByUser = new Map<string, { id: string; instance_name: string; display_name: string | null; numero: string | null }[]>();
    let pipesByUser = new Map<string, string[]>();

    if (ids.length) {
      const { data: pipeLinks } = await supabaseAdmin
        .from("company_user_pipeline")
        .select("user_id, pipeline_id")
        .eq("company_id", companyId)
        .in("user_id", ids);
      (pipeLinks ?? []).forEach((r: any) => {
        const arr = pipesByUser.get(r.user_id) || [];
        arr.push(r.pipeline_id);
        pipesByUser.set(r.user_id, arr);
      });

      const [{ data: profs }, { data: depsLinks }, { data: instLinks }] = await Promise.all([
        supabaseAdmin.from("profiles").select("user_id, email, nome, avatar_url, last_seen_at").in("user_id", ids),
        supabaseAdmin
          .from("department_member")
          .select("user_id, department:department(id, nome, cor, company_id)")
          .in("user_id", ids),
        supabaseAdmin
          .from("company_user_instance")
          .select("user_id, instance:whatsapp_instances(id, instance_name, display_name, numero)")
          .eq("company_id", companyId)
          .in("user_id", ids),
      ]);
      (profs ?? []).forEach((p: any) =>
        profilesById.set(p.user_id, { email: p.email, nome: p.nome, avatar_url: p.avatar_url, last_seen_at: p.last_seen_at }),
      );
      (depsLinks ?? []).forEach((d: any) => {
        if (!d.department || d.department.company_id !== companyId) return;
        const arr = depsByUser.get(d.user_id) || [];
        arr.push({ id: d.department.id, nome: d.department.nome, cor: d.department.cor });
        depsByUser.set(d.user_id, arr);
      });
      (instLinks ?? []).forEach((r: any) => {
        if (!r.instance) return;
        const arr = instByUser.get(r.user_id) || [];
        arr.push({
          id: r.instance.id,
          instance_name: r.instance.instance_name,
          display_name: r.instance.display_name,
          numero: r.instance.numero,
        });
        instByUser.set(r.user_id, arr);
      });
    }

    return {
      members: (members ?? []).map((m: any) => ({
        ...m,
        email: profilesById.get(m.user_id)?.email ?? null,
        nome: profilesById.get(m.user_id)?.nome ?? null,
        avatar_url: profilesById.get(m.user_id)?.avatar_url ?? null,
        last_seen_at: profilesById.get(m.user_id)?.last_seen_at ?? null,
        departments: depsByUser.get(m.user_id) ?? [],
        instances: instByUser.get(m.user_id) ?? [],
        pipeline_ids: pipesByUser.get(m.user_id) ?? [],
      })),
    };
  });

async function uploadAvatar(supabaseAdmin: any, userId: string, base64: string): Promise<string | null> {
  const m = base64.match(/^data:(image\/[a-zA-Z+.-]+);base64,(.+)$/);
  if (!m) return null;
  const mime = m[1];
  const ext = mime.split("/")[1]?.replace("jpeg", "jpg") || "jpg";
  const bytes = Buffer.from(m[2], "base64");
  const path = `${userId}/avatar-${Date.now()}.${ext}`;
  const up = await supabaseAdmin.storage.from("avatars").upload(path, bytes, { contentType: mime, upsert: true });
  if (up.error) return null;
  const signed = await supabaseAdmin.storage.from("avatars").createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
  return signed.data?.signedUrl ?? null;
}

async function syncDepartments(supabaseAdmin: any, companyId: string, memberUserId: string, depIds: string[]) {
  const { data: current } = await supabaseAdmin
    .from("department_member")
    .select("department_id, department:department(company_id)")
    .eq("user_id", memberUserId);
  const currentIds = (current ?? [])
    .filter((r: any) => r.department?.company_id === companyId)
    .map((r: any) => r.department_id as string);
  const toDelete = currentIds.filter((id: string) => !depIds.includes(id));
  const toInsert = depIds.filter((id) => !currentIds.includes(id));
  if (toDelete.length) {
    await supabaseAdmin
      .from("department_member")
      .delete()
      .eq("user_id", memberUserId)
      .in("department_id", toDelete);
  }
  if (toInsert.length) {
    await supabaseAdmin
      .from("department_member")
      .insert(toInsert.map((department_id) => ({ department_id, user_id: memberUserId })));
  }
}

async function syncInstances(supabaseAdmin: any, companyId: string, memberUserId: string, instanceIds: string[]) {
  // 1. Atualiza a tabela pivot company_user_instance
  // Remove vínculos antigos da empresa específica para este usuário
  await supabaseAdmin
    .from("company_user_instance")
    .delete()
    .eq("company_id", companyId)
    .eq("user_id", memberUserId);

  if (instanceIds.length > 0) {
    // Insere novos vínculos
    const { error: insError } = await supabaseAdmin.from("company_user_instance").insert(
      instanceIds.map((instance_id) => ({ 
        company_id: companyId, 
        user_id: memberUserId, 
        instance_id 
      })),
    );
    if (insError) console.error("[syncInstances] Erro ao inserir em company_user_instance:", insError);
  }

  // 2. Retro-compatibilidade: Sincroniza a coluna legada 'user_id' na tabela 'whatsapp_instances'
  // Limpa o user_id legado de QUALQUER instância desta empresa que estivesse vinculada a este usuário
  const { error: clearErr } = await supabaseAdmin
    .from("whatsapp_instances")
    .update({ user_id: null })
    .eq("company_id", companyId)
    .eq("user_id", memberUserId);
  
  if (clearErr) console.error("[syncInstances] Erro ao limpar user_id legado:", clearErr);

  // Se houver instâncias selecionadas, seta a vinculação legada na 1ª instância da lista
  if (instanceIds.length > 0) {
    const { error: updErr } = await supabaseAdmin
      .from("whatsapp_instances")
      .update({ user_id: memberUserId })
      .eq("company_id", companyId)
      .in("id", instanceIds); // Garante que TODAS as instâncias selecionadas fiquem vinculadas via user_id legado
      
    if (updErr) console.error("[syncInstances] Erro ao atualizar user_id legado:", updErr);
  }
}


/** Funis liberados para o usuário. Lista vazia = acesso a todos (comportamento padrão). */
async function syncPipelines(supabaseAdmin: any, companyId: string, memberUserId: string, pipelineIds: string[]) {
  await supabaseAdmin
    .from("company_user_pipeline")
    .delete()
    .eq("company_id", companyId)
    .eq("user_id", memberUserId);
  if (pipelineIds.length) {
    const { data: valid } = await supabaseAdmin
      .from("crm_pipeline")
      .select("id")
      .eq("company_id", companyId)
      .in("id", pipelineIds);
    const rows = (valid ?? []).map((p: any) => ({ company_id: companyId, user_id: memberUserId, pipeline_id: p.id }));
    if (rows.length) await supabaseAdmin.from("company_user_pipeline").insert(rows);
  }
}

/** Funis da empresa + o funil vinculado a cada departamento (para sugestão automática). */
export const listCompanyPipelines = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { companyId } = await getOwnedCompanyId(supabase, userId);
    const [{ data: pipes }, { data: deps }] = await Promise.all([
      supabase.from("crm_pipeline").select("id,nome,ordem").eq("company_id", companyId).order("ordem"),
      supabase.from("department").select("id,pipeline_id").eq("company_id", companyId),
    ]);
    return {
      pipelines: ((pipes ?? []) as any[]).map((p) => ({ id: p.id as string, nome: p.nome as string })),
      departmentPipelines: ((deps ?? []) as any[])
        .filter((d) => d.pipeline_id)
        .map((d) => ({ department_id: d.id as string, pipeline_id: d.pipeline_id as string })),
    };
  });

type UpsertMemberInput = {
  nome: string;
  email: string;
  password: string;
  role: "admin" | "atendente";
  avatarBase64?: string | null;
  max_chats?: number;
  custom_role_id?: string | null;
  department_ids?: string[];
  instance_ids?: string[];
  pipeline_ids?: string[];
};

export const inviteMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: UpsertMemberInput) => {
    const email = String(d.email || "").trim().toLowerCase();
    const nome = String(d.nome || "").trim();
    const password = String(d.password || "");
    if (!nome) throw new Error("Informe o nome");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Email inválido");
    if (password.length < 8) throw new Error("Senha deve ter no mínimo 8 caracteres");
    if (d.role !== "admin" && d.role !== "atendente") throw new Error("Função inválida");
    return {
      nome, email, password, role: d.role,
      avatarBase64: d.avatarBase64 || null,
      max_chats: Math.max(1, Math.min(999, Number(d.max_chats ?? 5))),
      custom_role_id: d.custom_role_id || null,
      department_ids: Array.isArray(d.department_ids) ? d.department_ids : [],
      instance_ids: Array.isArray(d.instance_ids) ? d.instance_ids : [],
      pipeline_ids: Array.isArray(d.pipeline_ids) ? d.pipeline_ids : [],
    };
  })
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { companyId, role } = await getOwnedCompanyId(supabase, userId);
    assertAdmin(role);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let targetUserId: string | null = null;
    let existed = false;
    const { data: prof } = await supabaseAdmin
      .from("profiles").select("user_id").eq("email", data.email).maybeSingle();
    if (prof) { targetUserId = prof.user_id; existed = true; }

    if (targetUserId) {
      const { data: alreadyLinked } = await supabaseAdmin
        .from("company_user").select("id, ativo")
        .eq("company_id", companyId).eq("user_id", targetUserId).maybeSingle();
      if (!alreadyLinked?.ativo) {
        const { assertWithinLimit } = await import("./plan-limits.server");
        await assertWithinLimit(companyId, "usuarios");
      }
    } else {
      const { assertWithinLimit } = await import("./plan-limits.server");
      await assertWithinLimit(companyId, "usuarios");
    }

    if (!targetUserId) {
      const { data: created, error: cErr } = await supabaseAdmin.auth.admin.createUser({
        email: data.email, password: data.password, email_confirm: true,
        user_metadata: { nome: data.nome },
      });
      if (cErr || !created.user) throw new Error(cErr?.message || "Falha ao criar usuário");
      targetUserId = created.user.id;
    }

    let avatarUrl: string | null = null;
    if (data.avatarBase64) {
      try { avatarUrl = await uploadAvatar(supabaseAdmin, targetUserId, data.avatarBase64); } catch {}
    }

    await supabaseAdmin.from("profiles").upsert(
      { user_id: targetUserId, email: data.email, nome: data.nome, ...(avatarUrl ? { avatar_url: avatarUrl } : {}) } as any,
      { onConflict: "user_id" },
    );

    const { error: linkErr } = await supabaseAdmin
      .from("company_user")
      .upsert(
        {
          company_id: companyId, user_id: targetUserId, role: data.role,
          ativo: true, forcar_troca_senha: false,
          max_chats: data.max_chats, custom_role_id: data.custom_role_id,
        },
        { onConflict: "user_id,company_id" },
      );
    if (linkErr) throw linkErr;

    // Sincroniza vínculos
    await syncDepartments(supabaseAdmin, companyId, targetUserId, data.department_ids);
    await syncInstances(supabaseAdmin, companyId, targetUserId, data.instance_ids);
    await syncPipelines(supabaseAdmin, companyId, targetUserId, data.pipeline_ids);

    return { ok: true, existed };
  });

export const setMemberActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { memberId: string; ativo: boolean }) => d)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { companyId, role } = await getOwnedCompanyId(supabase, userId);
    assertAdmin(role);
    if (data.ativo) {
      const { assertWithinLimit } = await import("./plan-limits.server");
      await assertWithinLimit(companyId, "usuarios");
    }
    const { error } = await supabase.from("company_user").update({ ativo: data.ativo }).eq("id", data.memberId);
    if (error) throw error;
    return { ok: true };
  });

export const setMemberRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { memberId: string; role: "owner" | "admin" | "atendente" }) => d)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { role } = await getOwnedCompanyId(supabase, userId);
    if (role !== "owner") throw new Error("Apenas o owner pode alterar papéis.");
    const { error } = await supabase.from("company_user").update({ role: data.role }).eq("id", data.memberId);
    if (error) throw error;
    return { ok: true };
  });

export const listCompanyInstances = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { companyId } = await getOwnedCompanyId(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("whatsapp_instances")
      .select("id, instance_name, display_name, numero, user_id, status, provider")
      .eq("company_id", companyId)
      .in("provider", ["dapi", "dapi_official"]);
    if (error) throw error;

    const missing = (data ?? []).filter((i: any) => !i.numero && i.status === "connected" && i.provider === "dapi");
    if (missing.length) {
      const { dapiGetStatus } = await import("./dapi.server");
      await Promise.all(missing.map(async (i: any) => {
        const st = await dapiGetStatus(i.instance_name).catch(() => null);
        if (st?.numero) {
          const clean = String(st.numero).replace(/@.*/, "").replace(/\D/g, "");
          if (clean) {
            i.numero = clean;
            await supabaseAdmin.from("whatsapp_instances")
              .update({ numero: clean } as any).eq("company_id", companyId).eq("instance_name", i.instance_name);
          }
        }
      }));
    }
    return { instances: data ?? [] };
  });

// Compat: seta uma única instância (dialog antigo)
export const setMemberInstance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { memberUserId: string; instanceName: string | null }) => d)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { companyId, role } = await getOwnedCompanyId(supabase, userId);
    assertAdmin(role);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("whatsapp_instances").update({ user_id: null as any })
      .eq("company_id", companyId).eq("user_id", data.memberUserId);
    if (data.instanceName) {
      const { error } = await supabaseAdmin.from("whatsapp_instances")
        .update({ user_id: data.memberUserId }).eq("company_id", companyId).eq("instance_name", data.instanceName);
      if (error) throw error;
    }
    return { ok: true };
  });

export const updateMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    memberId: string;
    nome?: string;
    password?: string;
    role?: "admin" | "atendente";
    avatarBase64?: string | null;
    max_chats?: number;
    custom_role_id?: string | null;
    department_ids?: string[];
    instance_ids?: string[];
    pipeline_ids?: string[];
  }) => d)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { companyId, role } = await getOwnedCompanyId(supabase, userId);
    assertAdmin(role);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: mem, error: mErr } = await supabaseAdmin
      .from("company_user").select("user_id, role, company_id")
      .eq("id", data.memberId).maybeSingle();
    if (mErr || !mem) throw new Error("Membro não encontrado");
    if (mem.company_id !== companyId) throw new Error("Sem permissão");
    if (mem.role === "owner") data.role = undefined;

    const patchCU: any = {};
    if (data.role && data.role !== mem.role) {
      if (role !== "owner" && data.role === "admin") throw new Error("Apenas o owner pode promover a admin");
      patchCU.role = data.role;
    }
    if (typeof data.max_chats === "number") patchCU.max_chats = Math.max(1, Math.min(999, data.max_chats));
    if (data.custom_role_id !== undefined) patchCU.custom_role_id = data.custom_role_id;
    if (Object.keys(patchCU).length) {
      await supabaseAdmin.from("company_user").update(patchCU).eq("id", data.memberId);
    }

    if (data.password && data.password.length >= 8) {
      await supabaseAdmin.auth.admin.updateUserById(mem.user_id, { password: data.password });
    }

    let avatarUrl: string | null = null;
    if (data.avatarBase64) {
      try { avatarUrl = await uploadAvatar(supabaseAdmin, mem.user_id, data.avatarBase64); } catch {}
    }
    const patchProfile: any = {};
    if (typeof data.nome === "string" && data.nome.trim()) patchProfile.nome = data.nome.trim();
    if (avatarUrl) patchProfile.avatar_url = avatarUrl;
    if (Object.keys(patchProfile).length) {
      // upsert: owners/admins criados antes do trigger podem não ter linha em profiles
      const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(mem.user_id);
      await supabaseAdmin.from("profiles").upsert(
        { user_id: mem.user_id, email: authUser?.user?.email ?? null, ...patchProfile } as any,
        { onConflict: "user_id" },
      );
    }


    if (Array.isArray(data.department_ids)) {
      await syncDepartments(supabaseAdmin, companyId, mem.user_id, data.department_ids);
    }
    if (Array.isArray(data.instance_ids)) {
      await syncInstances(supabaseAdmin, companyId, mem.user_id, data.instance_ids);
    }
    if (Array.isArray(data.pipeline_ids)) {
      await syncPipelines(supabaseAdmin, companyId, mem.user_id, data.pipeline_ids);
    }

    return { ok: true };
  });

export const removeMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { memberId: string }) => d)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { companyId, role } = await getOwnedCompanyId(supabase, userId);
    assertAdmin(role);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: mem } = await supabaseAdmin
      .from("company_user").select("user_id, role, company_id")
      .eq("id", data.memberId).maybeSingle();
    if (!mem) throw new Error("Membro não encontrado");
    if (mem.company_id !== companyId) throw new Error("Sem permissão");
    if (mem.role === "owner") throw new Error("Não é possível remover o owner");

    await supabaseAdmin.from("whatsapp_instances")
      .update({ user_id: null as any })
      .eq("company_id", companyId).eq("user_id", mem.user_id);
    await supabaseAdmin.from("company_user_instance")
      .delete().eq("company_id", companyId).eq("user_id", mem.user_id);

    const { error } = await supabaseAdmin.from("company_user").delete().eq("id", data.memberId);
    if (error) throw error;
    return { ok: true };
  });

// ============ Company roles (funções personalizadas) ============

export type CompanyRole = {
  id: string;
  nome: string;
  descricao: string | null;
  cor: string | null;
  base_role: "owner" | "admin" | "atendente";
  permissions: Record<string, any>;
  ativo: boolean;
};

export const listCompanyRoles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CompanyRole[]> => {
    const { supabase, userId } = context;
    const { companyId } = await getOwnedCompanyId(supabase, userId);
    const { data } = await supabase
      .from("company_role")
      .select("id, nome, descricao, cor, base_role, permissions, ativo")
      .eq("company_id", companyId)
      .order("nome");
    return (data ?? []) as any;
  });

export const saveCompanyRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    id?: string;
    nome: string;
    descricao?: string;
    cor?: string;
    base_role: "admin" | "atendente";
    permissions: Record<string, any>;
    ativo?: boolean;
  }) => d)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { companyId, role } = await getOwnedCompanyId(supabase, userId);
    assertAdmin(role);
    const nome = data.nome.trim();
    if (!nome) throw new Error("Nome obrigatório");
    const payload: any = {
      nome,
      descricao: data.descricao || null,
      cor: data.cor || "#6366F1",
      base_role: data.base_role,
      permissions: data.permissions ?? {},
      ativo: data.ativo ?? true,
    };
    if (data.id) {
      const { error } = await supabase.from("company_role").update(payload)
        .eq("id", data.id).eq("company_id", companyId);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await supabase.from("company_role")
      .insert({ ...payload, company_id: companyId }).select("id").maybeSingle();
    if (error || !row) throw new Error(error?.message ?? "Falha ao criar");
    return { id: row.id as string };
  });

export const deleteCompanyRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { companyId, role } = await getOwnedCompanyId(supabase, userId);
    assertAdmin(role);
    const { error } = await supabase.from("company_role").delete()
      .eq("id", data.id).eq("company_id", companyId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============ Auth log ============

export const recordLogin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    try {
      const { companyId } = await getOwnedCompanyId(supabase, userId);
      const { getRequest } = await import("@tanstack/react-start/server");
      let ip: string | null = null;
      let ua: string | null = null;
      try {
        const req: any = getRequest();
        ip = req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
        ua = req.headers.get("user-agent");
      } catch {}
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.from("auth_log").insert({ company_id: companyId, user_id: userId, ip, user_agent: ua, event: "login" });
      await supabase.from("company_user")
        .update({ last_login_at: new Date().toISOString(), last_login_ip: ip })
        .eq("company_id", companyId).eq("user_id", userId);
    } catch { /* silent */ }
    return { ok: true };
  });

export const listAuthLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { limit?: number } | undefined) => d ?? {})
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { companyId, role } = await getOwnedCompanyId(supabase, userId);
    assertAdmin(role);
    const limit = Math.min(500, Math.max(10, data.limit ?? 200));
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin
      .from("auth_log")
      .select("id, user_id, ip, user_agent, event, created_at")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(limit);
    const ids = Array.from(new Set((rows ?? []).map((r: any) => r.user_id)));
    const nameByUser = new Map<string, { nome: string | null; email: string | null }>();
    if (ids.length) {
      const { data: profs } = await supabaseAdmin.from("profiles").select("user_id, nome, email").in("user_id", ids);
      (profs ?? []).forEach((p: any) => nameByUser.set(p.user_id, { nome: p.nome, email: p.email }));
    }
    return (rows ?? []).map((r: any) => ({
      ...r,
      nome: nameByUser.get(r.user_id)?.nome ?? null,
      email: nameByUser.get(r.user_id)?.email ?? null,
    }));
  });
