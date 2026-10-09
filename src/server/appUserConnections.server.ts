import { encryptConnectionKey, decryptConnectionKey } from "./connectionKeyCrypto";

export async function saveConnectionKeyForUser(
  userId: string,
  connectorId: string,
  connectionAPIKey: string,
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await (supabaseAdmin as any).from("app_user_connections").upsert(
    {
      user_id: userId,
      connector_id: connectorId,
      connection_key_ciphertext: encryptConnectionKey(connectionAPIKey),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,connector_id" },
  );
  if (error) throw error;
}

export async function getConnectionKeyForUser(
  userId: string,
  connectorId: string,
): Promise<string | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await (supabaseAdmin as any)
    .from("app_user_connections")
    .select("connection_key_ciphertext")
    .eq("user_id", userId)
    .eq("connector_id", connectorId)
    .maybeSingle();
  if (error) throw error;
  return data ? decryptConnectionKey(data.connection_key_ciphertext) : null;
}

export async function deleteConnectionForUser(userId: string, connectorId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await (supabaseAdmin as any)
    .from("app_user_connections")
    .delete()
    .eq("user_id", userId)
    .eq("connector_id", connectorId);
}

/** Chave de conexão compartilhada da empresa: só a conta conectada pelo dono/admin. */
export async function getCompanyConnectionKey(
  companyId: string,
  connectorId: string,
): Promise<string | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: membros } = await (supabaseAdmin as any)
    .from("company_user")
    .select("user_id, role")
    .eq("company_id", companyId)
    .eq("ativo", true)
    .in("role", ["owner", "admin"]);
  const lista = (membros ?? []) as { user_id: string; role: string }[];
  if (!lista.length) return null;
  const { data: conns } = await (supabaseAdmin as any)
    .from("app_user_connections")
    .select("user_id, connection_key_ciphertext")
    .eq("connector_id", connectorId)
    .in(
      "user_id",
      lista.map((m) => m.user_id),
    );
  const rows = (conns ?? []) as { user_id: string; connection_key_ciphertext: string }[];
  if (!rows.length) return null;
  const peso = (r: string) => (r === "owner" ? 0 : r === "admin" ? 1 : 2);
  rows.sort(
    (a, b) =>
      peso(lista.find((m) => m.user_id === a.user_id)?.role ?? "") -
      peso(lista.find((m) => m.user_id === b.user_id)?.role ?? ""),
  );
  return decryptConnectionKey(rows[0]!.connection_key_ciphertext);
}
