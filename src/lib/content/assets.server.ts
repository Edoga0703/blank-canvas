import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  createR2UploadTarget,
  verifyR2ObjectExists,
  resolveR2DownloadUrlAsync,
} from "@/lib/storage/r2.server";
import type { ReadyAsset, SocialPlatform } from "@/lib/social-content.types";

export interface PrepareAssetParams {
  companyId: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  width?: number | null;
  height?: number | null;
  durationSeconds?: number | null;
  storageAccountId?: string | null;
}

export interface PreparedAssetResult {
  assetId: string;
  uploadUrl: string;
  storageKey: string;
  storageAccountId: string | null;
  expiresInSeconds: number;
}

/**
 * Prepara o upload de um ativo de mídia no Cloudflare R2 com rastreamento persistente de ciclo de vida.
 * Registra o ativo no banco com estado 'prepared'.
 */
export async function prepareContentAsset(params: PrepareAssetParams): Promise<PreparedAssetResult> {
  const { companyId, originalName, mimeType, sizeBytes, width, height, durationSeconds, storageAccountId } = params;

  if (!sizeBytes || sizeBytes <= 0) {
    throw new Error("Tamanho de arquivo inválido para upload.");
  }

  // Gera o destino de upload assinado no R2 (respeitando pool de contas)
  const target = await createR2UploadTarget({
    companyId,
    fileName: originalName,
    mimeType,
    sizeBytes,
    storageAccountId,
  });

  // Registra o ativo no banco com estado 'prepared'
  const { data: asset, error: assetErr } = await (supabaseAdmin as any)
    .from("content_assets")
    .insert({
      company_id: companyId,
      storage_key: target.storageKey,
      storage_account_id: target.storageAccountId || null,
      original_name: originalName,
      mime_type: target.mimeType,
      size_bytes: sizeBytes,
      width: width || null,
      height: height || null,
      duration_seconds: durationSeconds || null,
      state: "prepared",
    })
    .select("id")
    .single();

  if (assetErr || !asset) {
    console.error("[prepareContentAsset] Erro ao registrar content_assets:", assetErr);
    throw new Error(`Falha ao registrar ativo de mídia no banco: ${assetErr?.message || "erro desconhecido"}`);
  }

  return {
    assetId: asset.id,
    uploadUrl: target.uploadUrl,
    storageKey: target.storageKey,
    storageAccountId: target.storageAccountId || null,
    expiresInSeconds: 900,
  };
}

/**
 * Confirma o upload e valida a presença e integridade do objeto no R2 via HEAD.
 * Promove o estado de 'prepared' / 'uploading' para 'ready'.
 */
export async function completeContentAsset(params: {
  companyId: string;
  assetId: string;
  sha256?: string | null;
}): Promise<ReadyAsset> {
  const { companyId, assetId, sha256 } = params;

  const { data: asset, error: fetchErr } = await (supabaseAdmin as any)
    .from("content_assets")
    .select("*")
    .eq("id", assetId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (fetchErr || !asset) {
    throw new Error("Ativo de mídia não encontrado para a empresa especificada.");
  }

  // Se já estiver pronto, retorna imediatamente
  if (asset.state === "ready") {
    return {
      id: asset.id,
      companyId: asset.company_id,
      storageKey: asset.storage_key,
      storageAccountId: asset.storage_account_id,
      mimeType: asset.mime_type,
      sizeBytes: Number(asset.size_bytes),
      sha256: asset.sha256,
      width: asset.width,
      height: asset.height,
      durationSeconds: asset.duration_seconds ? Number(asset.duration_seconds) : null,
    };
  }

  // Validação real de existência do objeto no R2 via HEAD
  const check = await verifyR2ObjectExists(asset.storage_key, asset.storage_account_id);
  if (!check.exists) {
    await (supabaseAdmin as any)
      .from("content_assets")
      .update({ state: "failed", error_message: "Objeto não encontrado no R2 após upload." })
      .eq("id", assetId);

    throw new Error("O arquivo não foi localizado no armazenamento R2. Por favor, tente o envio novamente.");
  }

  const patch: Record<string, any> = {
    state: "ready",
    updated_at: new Date().toISOString(),
  };

  if (sha256) patch.sha256 = sha256;
  if (check.sizeBytes) patch.size_bytes = check.sizeBytes;

  const { error: updateErr } = await (supabaseAdmin as any)
    .from("content_assets")
    .update(patch)
    .eq("id", assetId)
    .eq("company_id", companyId);

  if (updateErr) {
    throw new Error(`Falha ao validar ativo: ${updateErr.message}`);
  }

  return {
    id: asset.id,
    companyId: asset.company_id,
    storageKey: asset.storage_key,
    storageAccountId: asset.storage_account_id,
    mimeType: asset.mime_type,
    sizeBytes: check.sizeBytes || Number(asset.size_bytes),
    sha256: sha256 || asset.sha256,
    width: asset.width,
    height: asset.height,
    durationSeconds: asset.duration_seconds ? Number(asset.duration_seconds) : null,
  };
}

/**
 * Resolve o acesso seguro e temporário para o provedor externo no momento exato do envio.
 * Revalida tenant, integridade 'ready' e gera URL assinada com TTL adequado para processamento.
 * NUNCA armazena a URL assinada como estado permanente no banco!
 */
export async function resolveProviderMedia(
  assetId: string,
  companyId: string,
  platform: SocialPlatform,
  ttlSeconds = 3600,
): Promise<{ publicUrl: string; asset: ReadyAsset }> {
  const { data: asset, error } = await (supabaseAdmin as any)
    .from("content_assets")
    .select("*")
    .eq("id", assetId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (error || !asset) {
    throw new Error(`Ativo ${assetId} não encontrado ou sem permissão para a empresa.`);
  }

  if (asset.state !== "ready") {
    throw new Error(`Ativo ${assetId} não está em estado pronto (estado atual: ${asset.state}).`);
  }

  const publicUrl = await resolveR2DownloadUrlAsync(
    asset.storage_key,
    ttlSeconds,
    asset.storage_account_id,
  );

  return {
    publicUrl,
    asset: {
      id: asset.id,
      companyId: asset.company_id,
      storageKey: asset.storage_key,
      storageAccountId: asset.storage_account_id,
      mimeType: asset.mime_type,
      sizeBytes: Number(asset.size_bytes),
      sha256: asset.sha256,
      width: asset.width,
      height: asset.height,
      durationSeconds: asset.duration_seconds ? Number(asset.duration_seconds) : null,
    },
  };
}
