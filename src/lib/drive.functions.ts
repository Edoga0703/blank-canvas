import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveCompanyIdCached } from "./company-cache";

const GATEWAY_BASE_URL = "https://connector-gateway.lovable.dev";
const CONNECTOR_ID = "google_drive";
const DRIVE_SCOPES = [
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/drive.file",
];
const ROOT_FOLDER_NAME = "Metrix CRM";

export type DriveItem = {
  id: string;
  nome: string;
  mime: string;
  pasta: boolean;
  tamanho: number | null;
  modificado: string | null;
  link: string | null;
  thumbnail: string | null;
};

// ---------- conexão ----------

/** Só dono/admin conectam a conta do Google Drive — ela é compartilhada com a equipe. */
async function ehAdmin(context: any): Promise<boolean> {
  const cid = await resolveCompanyIdCached(context.supabase, context.userId);
  const { data } = await context.supabase
    .from("company_user")
    .select("role")
    .eq("company_id", cid)
    .eq("user_id", context.userId)
    .eq("ativo", true)
    .maybeSingle();
  return ["owner", "admin"].includes((data as any)?.role ?? "");
}

export const startDriveConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!(await ehAdmin(context)))
      throw new Error("Só o dono ou um administrador pode conectar o Google Drive da empresa.");
    const clientKey = process.env['GOOGLE_DRIVE_APP_USER_CONNECTOR_CLIENT_API_KEY'];
    if (!clientKey) throw new Error("Conector do Google Drive não configurado.");
    const request = getRequest();
    if (!request) throw new Error("Requisição inválida.");
    const url = new URL(request.url);
    const sandboxHost = url.hostname === "localhost" ? request.headers.get("x-forwarded-host") : null;
    const returnUrl = new URL(
      "/oauth/drive/return",
      sandboxHost ? `https://${sandboxHost}` : url.origin,
    ).toString();

    const { authorizeAppUserOAuth } = await import("@/integrations/lovable/appUserConnector");
    const { getConnectionKeyForUser } = await import("@/server/appUserConnections.server");
    const existing = await getConnectionKeyForUser(context.userId, CONNECTOR_ID).catch(() => null);

    const { authorizationUrl } = await authorizeAppUserOAuth({
      gatewayBaseUrl: GATEWAY_BASE_URL,
      connectorId: CONNECTOR_ID,
      appUserId: context.userId,
      clientAPIKey: clientKey,
      returnUrl,
      connectionAPIKey: existing ?? undefined,
      credentialsConfiguration: { scopes: DRIVE_SCOPES },
    });
    return { authorizationUrl };
  });

export const completeDriveConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { code: string }) => d)
  .handler(async ({ context, data }) => {
    const { exchangeAppUserOAuthCode } = await import("@/integrations/lovable/appUserConnector");
    const { saveConnectionKeyForUser } = await import("@/server/appUserConnections.server");
    const { connectionAPIKey, connectorId } = await exchangeAppUserOAuthCode(GATEWAY_BASE_URL, data.code);
    if (connectorId !== CONNECTOR_ID) throw new Error("Conector inesperado.");
    await saveConnectionKeyForUser(context.userId, connectorId, connectionAPIKey);
    return { ok: true };
  });

export const disconnectDrive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!(await ehAdmin(context)))
      throw new Error("Só o dono ou um administrador pode desconectar o Google Drive da empresa.");
    const { getConnectionKeyForUser, deleteConnectionForUser } = await import(
      "@/server/appUserConnections.server"
    );
    const key = await getConnectionKeyForUser(context.userId, CONNECTOR_ID);
    if (key) {
      const { disconnectAppUser } = await import("@/integrations/lovable/appUserConnector");
      await disconnectAppUser({
        gatewayBaseUrl: GATEWAY_BASE_URL,
        connectionAPIKey: key,
        connectorId: CONNECTOR_ID,
      }).catch(() => {});
    }
    await deleteConnectionForUser(context.userId, CONNECTOR_ID);
    return { ok: true };
  });

/** Estado da conta única da empresa (conectada pelo dono/admin). */
export const getDriveStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const chave = await chaveDrive(context);
    return { conectado: !!chave, compartilhado: true, podeConectar: await ehAdmin(context) };
  });

// ---------- helpers ----------

/** Conta única da empresa: a que o dono/admin conectou, usada por toda a equipe. */
async function chaveDrive(context: any): Promise<string | null> {
  const { getCompanyConnectionKey } = await import("@/server/appUserConnections.server");
  const cid = await resolveCompanyIdCached(context.supabase, context.userId);
  return await getCompanyConnectionKey(cid, CONNECTOR_ID).catch(() => null);
}

async function drive(
  key: string | null,
  path: string,
  init?: RequestInit,
): Promise<{ ok: true; body: any } | { ok: false; reconnect: boolean; erro: string }> {
  if (!key) return { ok: false, reconnect: false, erro: "não conectado" };
  const { callAsAppUser, appUserReconnectRequired } = await import(
    "@/integrations/lovable/appUserConnector"
  );
  const res = await callAsAppUser({
    gatewayBaseUrl: GATEWAY_BASE_URL,
    connectionAPIKey: key,
    connectorId: CONNECTOR_ID,
    path,
    init,
    requiredScopes: DRIVE_SCOPES,
  });
  if (await appUserReconnectRequired(res)) return { ok: false, reconnect: true, erro: "reconectar" };
  const text = await res.text();
  if (!res.ok) {
    console.error(`[drive] ${res.status}: ${text}`);
    return { ok: false, reconnect: false, erro: text || String(res.status) };
  }
  return { ok: true, body: text ? JSON.parse(text) : {} };
}

function esc(s: string) {
  return s.replace(/'/g, "\\'");
}

async function findOrCreateFolder(key: string | null, nome: string, parentId?: string) {
  const q = [
    `name='${esc(nome)}'`,
    "mimeType='application/vnd.google-apps.folder'",
    "trashed=false",
    parentId ? `'${esc(parentId)}' in parents` : null,
  ]
    .filter(Boolean)
    .join(" and ");
  const found = await drive(key, `/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)&pageSize=1`);
  if (!found.ok) return found;
  if (found.body.files?.[0]?.id) return { ok: true as const, body: { id: found.body.files[0].id } };
  const created = await drive(key, "/drive/v3/files?fields=id", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: nome,
      mimeType: "application/vnd.google-apps.folder",
      ...(parentId ? { parents: [parentId] } : {}),
    }),
  });
  return created;
}

function mapFiles(files: any[]): DriveItem[] {
  return (files ?? []).map((f) => ({
    id: f.id,
    nome: f.name,
    mime: f.mimeType,
    pasta: f.mimeType === "application/vnd.google-apps.folder",
    tamanho: f.size ? Number(f.size) : null,
    modificado: f.modifiedTime ?? null,
    link: f.webViewLink ?? null,
    thumbnail: f.thumbnailLink ?? null,
  }));
}

// ---------- operações ----------

export const listDriveFiles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { numero: string; nome?: string | null; folderId?: string | null }) => d)
  .handler(async ({ context, data }) => {
    const key = await chaveDrive(context);
    if (!key)
      return {
        conectado: false as const,
        podeConectar: await ehAdmin(context),
        itens: [] as DriveItem[],
        folderId: null,
      };

    {
      const cid = await resolveCompanyIdCached(context.supabase, context.userId);
      const { capacidadeAtiva } = await import("@/lib/plugin-gate.server");
      if (!(await capacidadeAtiva(context.supabase, cid, "google-drive"))) {
        return { conectado: false as const, semPlugin: true as const, itens: [] as DriveItem[], folderId: null };
      }
    }

    let folderId = data.folderId ?? null;
    if (!folderId) {
      const cid = await resolveCompanyIdCached(context.supabase, context.userId);
      const { data: card } = await context.supabase
        .from("crm_cards")
        .select("id, drive_folder_id")
        .eq("company_id", cid)
        .eq("numero", data.numero)
        .limit(1)
        .maybeSingle();
      folderId = (card as any)?.drive_folder_id ?? null;
      if (!folderId) {
        const root = await findOrCreateFolder(key, ROOT_FOLDER_NAME);
        if (!root.ok) return { conectado: !root.reconnect, reconectar: root.reconnect, itens: [], folderId: null };
        const nomePasta = `${data.nome?.trim() || "Contato"} - ${data.numero}`;
        const pasta = await findOrCreateFolder(key, nomePasta, (root as any).body.id);
        if (!pasta.ok) return { conectado: !pasta.reconnect, reconectar: pasta.reconnect, itens: [], folderId: null };
        folderId = (pasta as any).body.id as string;
        if (card?.id) {
          await (context.supabase as any)
            .from("crm_cards")
            .update({ drive_folder_id: folderId })
            .eq("id", card.id);
        }
      }
    }

    const q = `'${esc(folderId!)}' in parents and trashed=false`;
    const res = await drive(
      key,
      `/drive/v3/files?q=${encodeURIComponent(q)}&orderBy=folder,modifiedTime desc&pageSize=200&fields=files(id,name,mimeType,size,modifiedTime,webViewLink,thumbnailLink,hasThumbnail)`,
    );
    if (!res.ok) return { conectado: !res.reconnect, reconectar: res.reconnect, itens: [], folderId };
    return { conectado: true as const, itens: mapFiles(res.body.files), folderId };
  });

export const createDriveFolder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { parentId: string; nome: string }) => d)
  .handler(async ({ context, data }) => {
    const res = await drive(await chaveDrive(context), "/drive/v3/files?fields=id", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: data.nome,
        mimeType: "application/vnd.google-apps.folder",
        parents: [data.parentId],
      }),
    });
    if (!res.ok) throw new Error(res.erro);
    return { ok: true };
  });

export const uploadDriveFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { parentId: string; nome: string; mime: string; base64: string }) => d)
  .handler(async ({ context, data }) => {
    const boundary = `metrix${Date.now()}`;
    const meta = JSON.stringify({ name: data.nome, parents: [data.parentId] });
    const bin = Buffer.from(data.base64, "base64");
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: ${data.mime || "application/octet-stream"}\r\n\r\n`,
      ),
      bin,
      Buffer.from(`\r\n--${boundary}--`),
    ]);
    const res = await drive(await chaveDrive(context), "/upload/drive/v3/files?uploadType=multipart&fields=id", {
      method: "POST",
      headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
      body: body as unknown as BodyInit,
    });
    if (!res.ok) throw new Error(res.erro);
    return { ok: true };
  });

export const renameDriveItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; nome: string }) => d)
  .handler(async ({ context, data }) => {
    const res = await drive(await chaveDrive(context), `/drive/v3/files/${data.id}?fields=id`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: data.nome }),
    });
    if (!res.ok) throw new Error(res.erro);
    return { ok: true };
  });

/** Baixa o conteúdo do arquivo do Drive em base64 (para pré-visualizar ou enviar no WhatsApp). */
export const getDriveFileContent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ context, data }) => {
    const key = await chaveDrive(context);
    if (!key) throw new Error("Google Drive não conectado.");
    const { callAsAppUser } = await import("@/integrations/lovable/appUserConnector");

    const metaRes = await callAsAppUser({
      gatewayBaseUrl: GATEWAY_BASE_URL,
      connectionAPIKey: key,
      connectorId: CONNECTOR_ID,
      path: `/drive/v3/files/${data.id}?fields=id,name,mimeType,size`,
      requiredScopes: DRIVE_SCOPES,
    });
    if (!metaRes.ok) throw new Error(`Não foi possível ler o arquivo (${metaRes.status}).`);
    const meta: any = await metaRes.json();
    const tamanho = meta.size ? Number(meta.size) : 0;
    if (tamanho > 20 * 1024 * 1024) throw new Error("Arquivo muito grande (limite de 20 MB).");
    if (String(meta.mimeType ?? "").startsWith("application/vnd.google-apps."))
      throw new Error("Arquivos do Google Docs/Planilhas precisam ser exportados no Drive antes de enviar.");

    const res = await callAsAppUser({
      gatewayBaseUrl: GATEWAY_BASE_URL,
      connectionAPIKey: key,
      connectorId: CONNECTOR_ID,
      path: `/drive/v3/files/${data.id}?alt=media`,
      requiredScopes: DRIVE_SCOPES,
    });
    if (!res.ok) throw new Error(`Falha ao baixar o arquivo (${res.status}).`);
    const buf = Buffer.from(await res.arrayBuffer());
    return {
      nome: meta.name as string,
      mime: (meta.mimeType as string) || "application/octet-stream",
      base64: buf.toString("base64"),
    };
  });

export const deleteDriveItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ context, data }) => {
    const res = await drive(await chaveDrive(context), `/drive/v3/files/${data.id}`, { method: "DELETE" });
    if (!res.ok) throw new Error(res.erro);
    return { ok: true };
  });
