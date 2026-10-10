async function readStoredConfig() {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await (supabaseAdmin as any).from("master_settings").select("key,value").limit(100);
    for (const row of data ?? []) {
      const key = String(row?.key ?? "").toLowerCase();
      if (key === "meta_channels_config") return (row?.value ?? {}) as Record<string, unknown>;
      if (/(meta.*(webhook|verify)|((webhook|verify).*meta))/.test(key)) return (row?.value ?? {}) as Record<string, unknown>;
    }
  } catch (error) {
    console.warn("[meta-config] não foi possível consultar master_settings", error instanceof Error ? error.message : String(error));
  }
  return {};
}

/** Configuração server-only dos callbacks Meta. Nunca retorna o segredo ao cliente. */
export async function getMetaWebhookVerifyToken() {
  const fromEnv = String(process.env["META_WEBHOOK_VERIFY_TOKEN"] ?? "").trim();
  if (fromEnv) return fromEnv;
  const value = await readStoredConfig();
  const candidates = [value.verify_token, value.webhook_verify_token, value.meta_webhook_verify_token, value.token];
  const found = candidates.find((candidate) => typeof candidate === "string" && candidate.trim().length >= 16);
  return found ? String(found).trim() : "";
}

export async function getMetaAppSecrets() {
  const envPrimary = String(process.env["META_APP_SECRET"] ?? "").trim();
  const envInstagram = String(process.env["META_APP_SECRET_INSTAGRAM"] ?? "").trim();
  if (envPrimary && envInstagram) return [envPrimary, envInstagram];
  const value = await readStoredConfig();
  return [envPrimary || String(value.app_secret ?? "").trim(), envInstagram || String(value.app_secret_instagram ?? "").trim()].filter(Boolean);
}
