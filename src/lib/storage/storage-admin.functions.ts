import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveCompanyIdCached } from "@/lib/company-cache";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  testR2Connection,
  getDefaultR2EnvConfig,
  type StorageProvider,
  type StorageRole,
  type RotationStrategy,
} from "./storage-pool.server";

export interface StorageAccountView {
  id: string;
  provider: StorageProvider;
  label: string;
  role: StorageRole;
  is_active: boolean;
  priority: number;
  bucket_name?: string | null;
  public_domain?: string | null;
  max_capacity_bytes: number;
  current_usage_bytes: number;
  file_count: number;
  status: "ready" | "warning" | "full" | "error" | "syncing";
  health_status: string;
  last_health_check_at?: string | null;
  is_system_fallback?: boolean;
}

export interface StoragePoolSummary {
  hotPool: {
    totalAccounts: number;
    activeAccounts: number;
    totalCapacityBytes: number;
    totalUsageBytes: number;
    usagePercent: number;
    filesCount: number;
  };
  coldVault: {
    connected: boolean;
    provider: string;
    totalCapacityBytes: number;
    totalUsageBytes: number;
    usagePercent: number;
    filesCount: number;
    rootFolderId?: string | null;
  };
  settings: {
    rotationStrategy: RotationStrategy;
    hotRetentionDays: number;
    autoArchiveEnabled: boolean;
    warningThresholdPercent: number;
  };
}

/**
 * Validação rigorosa de autorização: exige que o usuário seja 'owner' ou 'admin' da empresa,
 * ou pertença ao papel global 'super_admin'. Atendentes e usuários comuns são terminantemente bloqueados.
 */
async function requireCompanyAdminOrSuper(supabase: any, userId: string, companyId: string): Promise<boolean> {
  const { data: roleData } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "super_admin")
    .maybeSingle();

  if (roleData?.role === "super_admin") return true;

  const { data: cu, error } = await supabase
    .from("company_user")
    .select("role")
    .eq("company_id", companyId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !cu || !["owner", "admin"].includes(cu.role)) {
    throw new Error("Acesso negado: requer privilégios de administrador ou proprietário da empresa.");
  }
  return true;
}

export const getStoragePoolSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<StoragePoolSummary> => {
    const companyId = await resolveCompanyIdCached(context.supabase, context.userId);

    // 1. Cuentas R2 / Hot Pool aisladas por tenant (o fallback global)
    const { data: accounts } = await (supabaseAdmin as any)
      .from("storage_accounts")
      .select("*")
      .or(`company_id.eq.${companyId},company_id.is.null`)
      .order("priority", { ascending: true });

    const allAccounts = accounts || [];
    const r2Accounts = allAccounts.filter((a: any) => a.provider === "cloudflare_r2" || a.role === "hot_pool");
    const driveAccounts = allAccounts.filter((a: any) => a.provider === "google_drive" || a.role === "cold_archive");

    // Configuración del pool para la empresa específica
    const { data: poolSettings } = await (supabaseAdmin as any)
      .from("storage_pool_settings")
      .select("*")
      .eq("company_id", companyId)
      .limit(1)
      .maybeSingle();

    const rotationStrategy: RotationStrategy = poolSettings?.rotation_strategy || "smart_failover";
    const hotRetentionDays = poolSettings?.hot_retention_days ?? 30;
    const autoArchiveEnabled = poolSettings?.auto_archive_enabled ?? true;
    const warningThresholdPercent = poolSettings?.warning_threshold_percent ?? 80;

    let hotCapacity = 0;
    let hotUsage = 0;
    let hotFiles = 0;
    let activeR2Count = 0;

    if (r2Accounts.length > 0) {
      for (const acc of r2Accounts) {
        if (acc.is_active) activeR2Count++;
        hotCapacity += Number(acc.max_capacity_bytes || 8589934592);
        hotUsage += Number(acc.current_usage_bytes || 0);
        hotFiles += Number(acc.file_count || 0);
      }
    } else {
      activeR2Count = 1;
      hotCapacity = 10 * 1024 * 1024 * 1024;
      hotUsage = 0;
      hotFiles = 0;
    }

    const hotUsagePercent = hotCapacity > 0 ? Math.round((hotUsage / hotCapacity) * 100) : 0;

    const driveAcc = driveAccounts[0];
    const driveConnected = Boolean(driveAcc?.is_active);
    const driveCapacity = Number(driveAcc?.max_capacity_bytes || 5 * 1024 * 1024 * 1024 * 1024);
    const driveUsage = Number(driveAcc?.current_usage_bytes || 0);
    const driveFiles = Number(driveAcc?.file_count || 0);
    const driveUsagePercent = driveCapacity > 0 ? Number(((driveUsage / driveCapacity) * 100).toFixed(2)) : 0;

    return {
      hotPool: {
        totalAccounts: r2Accounts.length || 1,
        activeAccounts: activeR2Count,
        totalCapacityBytes: hotCapacity,
        totalUsageBytes: hotUsage,
        usagePercent: hotUsagePercent,
        filesCount: hotFiles,
      },
      coldVault: {
        connected: driveConnected,
        provider: "Google Drive (5 TB)",
        totalCapacityBytes: driveCapacity,
        totalUsageBytes: driveUsage,
        usagePercent: driveUsagePercent,
        filesCount: driveFiles,
        rootFolderId: driveAcc?.google_root_folder_id || null,
      },
      settings: {
        rotationStrategy,
        hotRetentionDays,
        autoArchiveEnabled,
        warningThresholdPercent,
      },
    };
  });

export const listStorageAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<StorageAccountView[]> => {
    const companyId = await resolveCompanyIdCached(context.supabase, context.userId);

    const { data: accounts, error } = await (supabaseAdmin as any)
      .from("storage_accounts")
      .select("id,provider,label,role,is_active,priority,bucket_name,public_domain,max_capacity_bytes,current_usage_bytes,file_count,status,health_status,last_health_check_at,company_id")
      .or(`company_id.eq.${companyId},company_id.is.null`)
      .order("priority", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) {
      console.error("[StorageAdmin] Error listando contas:", error);
    }

    const list: StorageAccountView[] = (accounts || []).map((acc: any) => ({
      id: acc.id,
      provider: acc.provider,
      label: acc.label,
      role: acc.role,
      is_active: Boolean(acc.is_active),
      priority: Number(acc.priority || 1),
      bucket_name: acc.bucket_name,
      public_domain: acc.public_domain,
      max_capacity_bytes: Number(acc.max_capacity_bytes || 8589934592),
      current_usage_bytes: Number(acc.current_usage_bytes || 0),
      file_count: Number(acc.file_count || 0),
      status: acc.status || "ready",
      health_status: acc.health_status || "ok",
      last_health_check_at: acc.last_health_check_at,
      is_system_fallback: false,
    }));

    const hasR2 = list.some((a) => a.provider === "cloudflare_r2");
    if (!hasR2) {
      const def = getDefaultR2EnvConfig();
      list.unshift({
        id: "system-default-r2",
        provider: "cloudflare_r2",
        label: `${def.label} (${def.bucket})`,
        role: "hot_pool",
        is_active: true,
        priority: 1,
        bucket_name: def.bucket,
        public_domain: def.publicBaseUrl,
        max_capacity_bytes: 10 * 1024 * 1024 * 1024,
        current_usage_bytes: 0,
        file_count: 0,
        status: "ready",
        health_status: "ok",
        last_health_check_at: new Date().toISOString(),
        is_system_fallback: true,
      });
    }

    return list;
  });

export const saveR2StorageAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      id?: string | null;
      label: string;
      accountId: string;
      accessKeyId: string;
      secretAccessKey: string;
      bucketName: string;
      publicDomain?: string | null;
      priority?: number;
      maxCapacityGb?: number;
    }) => ({
      id: input?.id || null,
      label: input?.label?.trim() || "Nova Conta R2",
      accountId: input?.accountId?.trim() || "",
      accessKeyId: input?.accessKeyId?.trim() || "",
      secretAccessKey: input?.secretAccessKey?.trim() || "",
      bucketName: input?.bucketName?.trim() || "",
      publicDomain: input?.publicDomain?.trim() || null,
      priority: Number(input?.priority || 1),
      maxCapacityGb: Number(input?.maxCapacityGb || 8),
    }),
  )
  .handler(async ({ context, data }) => {
    const companyId = await resolveCompanyIdCached(context.supabase, context.userId);
    await requireCompanyAdminOrSuper(context.supabase, context.userId, companyId);

    if (!data.accountId || !data.accessKeyId || !data.secretAccessKey || !data.bucketName) {
      throw new Error("Todos os campos de Cloudflare R2 são obrigatórios.");
    }

    const testResult = await testR2Connection({
      accountId: data.accountId,
      accessKeyId: data.accessKeyId,
      secretAccessKey: data.secretAccessKey,
      bucket: data.bucketName,
    });

    if (!testResult.ok) {
      throw new Error(`Teste de conexão falhou: ${testResult.message}`);
    }

    const maxCapacityBytes = Math.round(data.maxCapacityGb * 1024 * 1024 * 1024);

    const payload = {
      company_id: companyId,
      provider: "cloudflare_r2",
      label: data.label,
      role: "hot_pool",
      is_active: true,
      priority: data.priority,
      account_id: data.accountId,
      access_key_id: data.accessKeyId,
      secret_access_key: data.secretAccessKey,
      bucket_name: data.bucketName,
      public_domain: data.publicDomain,
      max_capacity_bytes: maxCapacityBytes,
      status: "ready",
      health_status: "ok",
      last_health_check_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (data.id && data.id !== "system-default-r2") {
      // Isolamento estrito: só atualiza se pertencer à empresa autenticada
      const { data: updated, error } = await (supabaseAdmin as any)
        .from("storage_accounts")
        .update(payload)
        .eq("id", data.id)
        .eq("company_id", companyId)
        .select("id")
        .maybeSingle();

      if (error || !updated) {
        throw new Error("Conta não encontrada ou sem permissão de alteração.");
      }
      return { ok: true, message: "Conta Cloudflare R2 atualizada com sucesso." };
    } else {
      const { data: inserted, error } = await (supabaseAdmin as any)
        .from("storage_accounts")
        .insert(payload)
        .select("id")
        .single();

      if (error || !inserted) {
        throw new Error(error?.message || "Erro ao adicionar conta R2 ao pool.");
      }
      return { ok: true, message: "Nova conta Cloudflare R2 adicionada ao pool com sucesso." };
    }
  });

export const saveGoogleDriveAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      id?: string | null;
      label: string;
      credentialsJson: string;
      rootFolderId?: string | null;
      maxCapacityTb?: number;
    }) => ({
      id: input?.id || null,
      label: input?.label?.trim() || "Bóveda Google Drive",
      credentialsJson: input?.credentialsJson?.trim() || "",
      rootFolderId: input?.rootFolderId?.trim() || null,
      maxCapacityTb: Number(input?.maxCapacityTb || 5),
    }),
  )
  .handler(async ({ context, data }) => {
    const companyId = await resolveCompanyIdCached(context.supabase, context.userId);
    await requireCompanyAdminOrSuper(context.supabase, context.userId, companyId);

    let parsedJson: any = null;
    try {
      parsedJson = JSON.parse(data.credentialsJson);
      if (!parsedJson.client_email || !parsedJson.private_key) {
        throw new Error("O JSON precisa conter 'client_email' e 'private_key' da Google Service Account.");
      }
    } catch {
      throw new Error("O arquivo ou texto fornecido não é um JSON válido de Google Service Account.");
    }

    const maxCapacityBytes = Math.round(data.maxCapacityTb * 1024 * 1024 * 1024 * 1024);

    const payload = {
      company_id: companyId,
      provider: "google_drive",
      label: data.label,
      role: "cold_archive",
      is_active: true,
      priority: 1,
      google_service_account: parsedJson,
      google_root_folder_id: data.rootFolderId,
      max_capacity_bytes: maxCapacityBytes,
      status: "ready",
      health_status: "ok",
      last_health_check_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (data.id) {
      const { data: updated, error } = await (supabaseAdmin as any)
        .from("storage_accounts")
        .update(payload)
        .eq("id", data.id)
        .eq("company_id", companyId)
        .select("id")
        .maybeSingle();

      if (error || !updated) {
        throw new Error("Bóveda não encontrada ou sem permissão de alteração.");
      }
      return { ok: true, message: "Conexão com Google Drive atualizada com sucesso." };
    } else {
      const { data: inserted, error } = await (supabaseAdmin as any)
        .from("storage_accounts")
        .insert(payload)
        .select("id")
        .single();

      if (error || !inserted) {
        throw new Error(error?.message || "Erro ao conectar bóveda Google Drive.");
      }
      return { ok: true, message: "Bóveda Google Drive conectada com sucesso para armazenamento frio." };
    }
  });

export const updatePoolSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      rotationStrategy: RotationStrategy;
      hotRetentionDays: number;
      autoArchiveEnabled: boolean;
    }) => ({
      rotationStrategy: input?.rotationStrategy || "smart_failover",
      hotRetentionDays: Number(input?.hotRetentionDays || 30),
      autoArchiveEnabled: Boolean(input?.autoArchiveEnabled),
    }),
  )
  .handler(async ({ context, data }) => {
    const companyId = await resolveCompanyIdCached(context.supabase, context.userId);
    await requireCompanyAdminOrSuper(context.supabase, context.userId, companyId);

    const payload = {
      company_id: companyId,
      rotation_strategy: data.rotationStrategy,
      hot_retention_days: data.hotRetentionDays,
      auto_archive_enabled: data.autoArchiveEnabled,
      updated_at: new Date().toISOString(),
    };

    // Consulta estrita por company_id (impede sobrescrever ou capturar a configuração global de outra empresa)
    const { data: existing } = await (supabaseAdmin as any)
      .from("storage_pool_settings")
      .select("id")
      .eq("company_id", companyId)
      .maybeSingle();

    if (existing?.id) {
      const { error } = await (supabaseAdmin as any)
        .from("storage_pool_settings")
        .update(payload)
        .eq("id", existing.id)
        .eq("company_id", companyId);

      if (error) throw new Error(`Falha ao salvar configurações do pool: ${error.message}`);
    } else {
      const { error } = await (supabaseAdmin as any)
        .from("storage_pool_settings")
        .insert(payload);

      if (error) throw new Error(`Falha ao registrar configurações do pool: ${error.message}`);
    }

    return { ok: true, message: "Estratégia do pool e regras de retenção salvas com sucesso." };
  });

export const deleteStorageAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { id: string }) => ({ id: String(input?.id || "") }))
  .handler(async ({ context, data }) => {
    if (data.id === "system-default-r2") {
      throw new Error("A conta primária de sistema não pode ser removida.");
    }

    const companyId = await resolveCompanyIdCached(context.supabase, context.userId);
    await requireCompanyAdminOrSuper(context.supabase, context.userId, companyId);

    // Exclusão estritamente restrita à company_id do usuário autenticado
    const { data: deleted, error } = await (supabaseAdmin as any)
      .from("storage_accounts")
      .delete()
      .eq("id", data.id)
      .eq("company_id", companyId)
      .select("id")
      .maybeSingle();

    if (error || !deleted) {
      throw new Error("Conta não encontrada ou sem permissão para exclusão.");
    }

    return { ok: true, message: "Conta removida do pool com sucesso." };
  });
