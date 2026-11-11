import { createHmac, createHash } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type StorageProvider = "cloudflare_r2" | "google_drive" | "s3_compatible";
export type StorageRole = "hot_pool" | "cold_archive" | "backup";
export type RotationStrategy = "smart_failover" | "round_robin" | "least_used";

export interface StorageAccountRecord {
  id: string;
  company_id: string | null;
  provider: StorageProvider;
  label: string;
  role: StorageRole;
  is_active: boolean;
  priority: number;
  account_id: string | null;
  access_key_id: string | null;
  secret_access_key: string | null;
  bucket_name: string | null;
  public_domain: string | null;
  region: string | null;
  endpoint: string | null;
  google_service_account: any | null;
  google_root_folder_id: string | null;
  max_capacity_bytes: number;
  current_usage_bytes: number;
  file_count: number;
  status: "ready" | "warning" | "full" | "error" | "syncing";
  health_status: string;
  last_health_check_at: string | null;
  settings: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface StoragePoolSettingsRecord {
  id?: string;
  company_id: string | null;
  rotation_strategy: RotationStrategy;
  hot_retention_days: number;
  auto_archive_enabled: boolean;
  warning_threshold_percent: number;
}

export interface R2ResolvedConfig {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicBaseUrl: string | null;
  maxFileBytes: number;
  signedUrlTtlSeconds: number;
  storageAccountId: string | null;
  label: string;
  isFallback: boolean;
}

// Fallback por defecto extraído de variables de entorno (Idéntico a r2.server.ts para 100% retrocompatibilidad)
const R2_DEFAULTS: Record<string, string> = {
  R2_ACCOUNT_ID: "3bc2408cba1eadcd78d9ccdb0a8c987d",
  R2_ACCESS_KEY_ID: "a0048ab1cf7078594e2057b9b31131de",
  R2_SECRET_ACCESS_KEY: "328e9326f2e6adad6740f7ea6d1cf64ded1d4727e95408ad5fb4451ff5d29a3c",
  R2_BUCKET: "capiversa-media",
  R2_MAX_FILE_BYTES: "524288000", // 500 MB
  R2_SIGNED_URL_TTL_SECONDS: "900",
};

export function getDefaultR2EnvConfig(): R2ResolvedConfig {
  const getEnv = (name: string): string => {
    return (process.env[name]?.trim() || (process.env as any)?.[name]?.trim() || R2_DEFAULTS[name] || "");
  };

  const accountId = getEnv("R2_ACCOUNT_ID") || R2_DEFAULTS.R2_ACCOUNT_ID;
  const accessKeyId = getEnv("R2_ACCESS_KEY_ID") || R2_DEFAULTS.R2_ACCESS_KEY_ID;
  const secretAccessKey = getEnv("R2_SECRET_ACCESS_KEY") || R2_DEFAULTS.R2_SECRET_ACCESS_KEY;
  const bucket = getEnv("R2_BUCKET") || R2_DEFAULTS.R2_BUCKET;
  const publicBaseUrl = (getEnv("R2_PUBLIC_BASE_URL") || "").replace(/\/$/, "") || null;
  const maxFileBytes = Number(getEnv("R2_MAX_FILE_BYTES") || 524288000);
  const signedUrlTtlSeconds = Math.min(604800, Number(getEnv("R2_SIGNED_URL_TTL_SECONDS") || 900));

  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucket,
    publicBaseUrl,
    maxFileBytes: Number.isSafeInteger(maxFileBytes) && maxFileBytes > 0 ? maxFileBytes : 524288000,
    signedUrlTtlSeconds: Number.isSafeInteger(signedUrlTtlSeconds) && signedUrlTtlSeconds > 0 ? signedUrlTtlSeconds : 900,
    storageAccountId: null,
    label: "R2 Cuenta Primaria (Sistema)",
    isFallback: true,
  };
}

// Caché en memoria para firma y descargas ultra rápidas (evita roundtrips a la DB en cada visualización de foto)
const configCache = new Map<string, { config: R2ResolvedConfig; expiresAt: number }>();
const CACHE_TTL_MS = 60 * 1000; // 60 segundos

let roundRobinCounter = 0;

/**
 * Guarda una configuración en la caché en memoria para resoluciones sincrónicas.
 */
export function cacheR2Config(accountId: string, config: R2ResolvedConfig) {
  configCache.set(accountId, { config, expiresAt: Date.now() + CACHE_TTL_MS });
}

/**
 * Obtiene la configuración desde la caché en memoria (síncrono).
 */
export function getCachedR2Config(accountId?: string | null): R2ResolvedConfig {
  if (!accountId) return getDefaultR2EnvConfig();
  const cached = configCache.get(accountId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.config;
  }
  return getDefaultR2EnvConfig();
}

/**
 * Resuelve la cuenta R2 activa desde el pool para una NUEVA subida.
 * Aplica estrategia: 'smart_failover', 'round_robin' o 'least_used'.
 */
export async function resolveActiveR2UploadConfig(options?: {
  companyId?: string | null;
  sizeBytes?: number;
}): Promise<R2ResolvedConfig> {
  const sizeBytes = options?.sizeBytes || 0;

  try {
    // 1. Consultar cuentas R2 activas en la base de datos
    let query = (supabaseAdmin as any)
      .from("storage_accounts")
      .select("*")
      .eq("provider", "cloudflare_r2")
      .eq("is_active", true)
      .eq("role", "hot_pool")
      .order("priority", { ascending: true })
      .order("created_at", { ascending: true });

    // Si viene companyId, buscar primero cuentas de esa empresa o globales (company_id IS NULL)
    if (options?.companyId) {
      query = query.or(`company_id.eq.${options.companyId},company_id.is.null`);
    } else {
      query = query.is("company_id", null);
    }

    const { data: accounts, error } = await query;
    if (error || !accounts || accounts.length === 0) {
      return getDefaultR2EnvConfig();
    }

    // 2. Consultar estrategia de rotación (smart_failover, round_robin, least_used)
    let strategy: RotationStrategy = "smart_failover";
    const { data: poolSettings } = await (supabaseAdmin as any)
      .from("storage_pool_settings")
      .select("rotation_strategy")
      .limit(1)
      .maybeSingle();

    if (poolSettings?.rotation_strategy) {
      strategy = poolSettings.rotation_strategy as RotationStrategy;
    }

    // 3. Filtrar cuentas que no estén saturadas (status != 'full' y uso + archivo < max_capacity)
    const availableAccounts = (accounts as StorageAccountRecord[]).filter((acc) => {
      if (acc.status === "error" || acc.status === "full") return false;
      const capacity = Number(acc.max_capacity_bytes || 8589934592);
      const usage = Number(acc.current_usage_bytes || 0);
      return usage + sizeBytes <= capacity;
    });

    const candidatePool = availableAccounts.length > 0 ? availableAccounts : (accounts as StorageAccountRecord[]);

    let selected: StorageAccountRecord;

    if (strategy === "round_robin" && candidatePool.length > 1) {
      roundRobinCounter = (roundRobinCounter + 1) % candidatePool.length;
      selected = candidatePool[roundRobinCounter];
    } else if (strategy === "least_used" && candidatePool.length > 1) {
      // Ordenar por menor porcentaje o bytes usados
      selected = [...candidatePool].sort(
        (a, b) => Number(a.current_usage_bytes || 0) - Number(b.current_usage_bytes || 0),
      )[0];
    } else {
      // smart_failover (por defecto): la primera con espacio disponible según prioridad
      selected = candidatePool[0];
    }

    if (!selected.account_id || !selected.access_key_id || !selected.secret_access_key || !selected.bucket_name) {
      return getDefaultR2EnvConfig();
    }

    const resolved: R2ResolvedConfig = {
      accountId: selected.account_id.trim(),
      accessKeyId: selected.access_key_id.trim(),
      secretAccessKey: selected.secret_access_key.trim(),
      bucket: selected.bucket_name.trim(),
      publicBaseUrl: selected.public_domain ? selected.public_domain.trim().replace(/\/$/, "") : null,
      maxFileBytes: Number(selected.settings?.max_file_bytes || 524288000),
      signedUrlTtlSeconds: Math.min(604800, Number(selected.settings?.signed_ttl || 900)),
      storageAccountId: selected.id,
      label: selected.label,
      isFallback: false,
    };

    cacheR2Config(selected.id, resolved);
    return resolved;
  } catch (err) {
    console.warn("[StoragePool] Error resolviendo cuenta R2 dinámica, usando fallback:", err);
    return getDefaultR2EnvConfig();
  }
}

/**
 * Resuelve la configuración exacta de una cuenta por su ID (para firmas de descarga).
 */
export async function resolveR2ConfigById(storageAccountId?: string | null): Promise<R2ResolvedConfig> {
  if (!storageAccountId) return getDefaultR2EnvConfig();

  const cached = configCache.get(storageAccountId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.config;
  }

  try {
    const { data: acc, error } = await (supabaseAdmin as any)
      .from("storage_accounts")
      .select("*")
      .eq("id", storageAccountId)
      .maybeSingle();

    if (error || !acc || !acc.account_id || !acc.access_key_id || !acc.secret_access_key || !acc.bucket_name) {
      return getDefaultR2EnvConfig();
    }

    const resolved: R2ResolvedConfig = {
      accountId: acc.account_id.trim(),
      accessKeyId: acc.access_key_id.trim(),
      secretAccessKey: acc.secret_access_key.trim(),
      bucket: acc.bucket_name.trim(),
      publicBaseUrl: acc.public_domain ? acc.public_domain.trim().replace(/\/$/, "") : null,
      maxFileBytes: Number(acc.settings?.max_file_bytes || 524288000),
      signedUrlTtlSeconds: Math.min(604800, Number(acc.settings?.signed_ttl || 900)),
      storageAccountId: acc.id,
      label: acc.label,
      isFallback: false,
    };

    cacheR2Config(acc.id, resolved);
    return resolved;
  } catch {
    return getDefaultR2EnvConfig();
  }
}

/**
 * Registra incremento o decremento de uso en una cuenta de almacenamiento.
 */
export async function recordStorageUsageDelta(
  storageAccountId: string | null,
  deltaBytes: number,
  deltaFiles = 1,
) {
  if (!storageAccountId) return;
  try {
    const { data: acc } = await (supabaseAdmin as any)
      .from("storage_accounts")
      .select("id,current_usage_bytes,file_count,max_capacity_bytes")
      .eq("id", storageAccountId)
      .maybeSingle();

    if (!acc) return;

    const currentUsage = Math.max(0, Number(acc.current_usage_bytes || 0) + deltaBytes);
    const fileCount = Math.max(0, Number(acc.file_count || 0) + deltaFiles);
    const maxCapacity = Number(acc.max_capacity_bytes || 8589934592);

    let status = "ready";
    if (currentUsage >= maxCapacity) {
      status = "full";
    } else if (currentUsage >= maxCapacity * 0.8) {
      status = "warning";
    }

    await (supabaseAdmin as any)
      .from("storage_accounts")
      .update({
        current_usage_bytes: currentUsage,
        file_count: fileCount,
        status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", storageAccountId);
  } catch (err) {
    console.warn("[StoragePool] Error actualizando métricas de uso:", err);
  }
}

/**
 * Prueba la conexión de una cuenta Cloudflare R2 realizando un PUT y DELETE de prueba (0 bytes).
 */
export async function testR2Connection(credentials: {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}): Promise<{ ok: boolean; message: string }> {
  try {
    const host = `${credentials.accountId.trim()}.r2.cloudflarestorage.com`;
    const probeKey = `_system/health-check-${Date.now()}.txt`;
    const canonicalUri = `/${encodeURIComponent(credentials.bucket.trim())}/${encodeURIComponent(probeKey)}`;
    const endpoint = `https://${host}${canonicalUri}`;

    const now = new Date();
    const compact = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
    const dateStamp = compact.slice(0, 8);
    const payloadHash = createHash("sha256").update("").digest("hex");

    const dateKey = createHmac("sha256", `AWS4${credentials.secretAccessKey.trim()}`).update(dateStamp).digest();
    const regionKey = createHmac("sha256", dateKey).update("auto").digest();
    const serviceKey = createHmac("sha256", regionKey).update("s3").digest();
    const signingKey = createHmac("sha256", serviceKey).update("aws4_request").digest();

    const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${compact}\n`;
    const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
    const canonicalRequest = ["PUT", canonicalUri, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
    const scope = `${dateStamp}/auto/s3/aws4_request`;
    const stringToSign = ["AWS4-HMAC-SHA256", compact, scope, createHash("sha256").update(canonicalRequest).digest("hex")].join("\n");
    const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex");
    const authHeader = `AWS4-HMAC-SHA256 Credential=${credentials.accessKeyId.trim()}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const putRes = await fetch(endpoint, {
      method: "PUT",
      headers: {
        Authorization: authHeader,
        "X-Amz-Content-Sha256": payloadHash,
        "X-Amz-Date": compact,
      },
    });

    if (!putRes.ok) {
      const errText = await putRes.text();
      return { ok: false, message: `Cloudflare R2 respondió con error ${putRes.status}: ${errText.slice(0, 200)}` };
    }

    // Limpiar archivo de prueba con DELETE
    const delCanonicalReq = ["DELETE", canonicalUri, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
    const delStringToSign = ["AWS4-HMAC-SHA256", compact, scope, createHash("sha256").update(delCanonicalReq).digest("hex")].join("\n");
    const delSig = createHmac("sha256", signingKey).update(delStringToSign).digest("hex");
    const delAuth = `AWS4-HMAC-SHA256 Credential=${credentials.accessKeyId.trim()}/${scope}, SignedHeaders=${signedHeaders}, Signature=${delSig}`;

    await fetch(endpoint, {
      method: "DELETE",
      headers: {
        Authorization: delAuth,
        "X-Amz-Content-Sha256": payloadHash,
        "X-Amz-Date": compact,
      },
    }).catch(() => null);

    return { ok: true, message: "Conexión exitosa a Cloudflare R2 con permisos de lectura y escritura." };
  } catch (e: any) {
    return { ok: false, message: `Error de red al conectar con R2: ${e?.message || String(e)}` };
  }
}
