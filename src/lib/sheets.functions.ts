import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveCompanyIdCached } from "./company-cache";

const GATEWAY_BASE_URL = "https://connector-gateway.lovable.dev";
const CONNECTOR_ID = "google_sheets";
const SHEETS_SCOPES = [
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/spreadsheets",
];

// ---------- conexão ----------

export const startSheetsConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const clientKey = process.env["GOOGLE_SHEETS_APP_USER_CONNECTOR_CLIENT_API_KEY"];
    if (!clientKey) throw new Error("Conector do Google Sheets não configurado.");
    const request = getRequest();
    if (!request) throw new Error("Requisição inválida.");
    const url = new URL(request.url);
    const sandboxHost = url.hostname === "localhost" ? request.headers.get("x-forwarded-host") : null;
    const returnUrl = new URL(
      "/oauth/sheets/return",
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
      credentialsConfiguration: { scopes: SHEETS_SCOPES },
    });
    return { authorizationUrl };
  });

export const completeSheetsConnect = createServerFn({ method: "POST" })
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

export const disconnectSheets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
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

/** Só informa se este usuário já autorizou a própria conta do Google. */
export const getSheetsStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getConnectionKeyForUser } = await import("@/server/appUserConnections.server");
    const key = await getConnectionKeyForUser(context.userId, CONNECTOR_ID).catch(() => null);
    return { conectado: !!key };
  });

// ---------- helpers ----------

async function sheets(
  userId: string,
  path: string,
  init?: RequestInit,
): Promise<{ ok: true; body: any } | { ok: false; reconnect: boolean; erro: string }> {
  const { getConnectionKeyForUser } = await import("@/server/appUserConnections.server");
  const key = await getConnectionKeyForUser(userId, CONNECTOR_ID);
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
    requiredScopes: SHEETS_SCOPES,
  });
  if (await appUserReconnectRequired(res)) return { ok: false, reconnect: true, erro: "reconectar" };
  const text = await res.text();
  if (!res.ok) {
    console.error(`[sheets] ${res.status}: ${text}`);
    return { ok: false, reconnect: false, erro: text || String(res.status) };
  }
  return { ok: true, body: text ? JSON.parse(text) : {} };
}

// ---------- exportação de contatos ----------

export const exportContatosSheets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const companyId = await resolveCompanyIdCached(context.supabase, context.userId);
    const { capacidadeAtiva } = await import("@/lib/plugin-gate.server");
    if (!(await capacidadeAtiva(context.supabase, companyId, "google-sheets"))) {
      throw new Error("Instale o plugin Google Sheets na Loja de Plugins para exportar.");
    }

    // Carrega todos os contatos da empresa (sem os internos), em lotes.
    const rows: any[] = [];
    const CHUNK = 1000;
    for (let i = 0; i < 50; i++) {
      const { data, error } = await context.supabase
        .from("crm_cards")
        .select("nome,numero,email,valor,ultima_em,stage_id")
        .eq("company_id", companyId)
        .or("tipo_contato.is.null,tipo_contato.neq.interno")
        .order("ultima_em", { ascending: false, nullsFirst: false })
        .range(i * CHUNK, i * CHUNK + CHUNK - 1);
      if (error) throw error;
      rows.push(...(data ?? []));
      if ((data ?? []).length < CHUNK) break;
    }
    if (!rows.length) return { ok: false as const, reconnect: false, erro: "Nenhum contato para exportar." };

    const { data: stages } = await context.supabase
      .from("crm_stage")
      .select("id,nome")
      .eq("company_id", companyId);
    const stageNome = new Map((stages ?? []).map((s: any) => [s.id, s.nome]));

    const header = ["Nome", "Telefone", "E-mail", "Etapa", "Valor", "Última interação"];
    const values = [
      header,
      ...rows.map((c) => [
        c.nome ?? "",
        c.numero ?? "",
        c.email ?? "",
        stageNome.get(c.stage_id) ?? "",
        c.valor ?? "",
        c.ultima_em ? new Date(c.ultima_em).toLocaleString("pt-BR") : "",
      ]),
    ];

    const hoje = new Date().toISOString().slice(0, 10);
    const criada = await sheets(context.userId, "/v4/spreadsheets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ properties: { title: `Metrix CRM — Contatos ${hoje}` } }),
    });
    if (!criada.ok) return { ok: false as const, reconnect: criada.reconnect, erro: criada.erro };
    const id = criada.body.spreadsheetId as string;
    if (!id) return { ok: false as const, reconnect: false, erro: "Planilha não foi criada." };

    const escrita = await sheets(context.userId, `/v4/spreadsheets/${id}/values/A1?valueInputOption=USER_ENTERED`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ values }),
    });
    if (!escrita.ok) return { ok: false as const, reconnect: escrita.reconnect, erro: escrita.erro };

    return {
      ok: true as const,
      total: rows.length,
      url: criada.body.spreadsheetUrl ?? `https://docs.google.com/spreadsheets/d/${id}`,
    };
  });
