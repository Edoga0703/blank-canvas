// Adapter Meta (Messenger + Instagram Direct) via Graph API.
// Server-only. Usa o Page Access Token salvo em whatsapp_instances.instance_token.
const GRAPH = "https://graph.facebook.com/v25.0";
// Tokens da "Instagram API com login do Instagram" (IGAA...) usam outro host.
const GRAPH_IG = "https://graph.instagram.com/v25.0";

function normalizeToken(value: string) {
  return value
    .normalize("NFKC")
    .trim()
    .replace(/^Bearer\s+/i, "")
    .replace(/^["']|["']$/g, "")
    .replace(/[\s\u200B-\u200D\u2060\uFEFF]/g, "");
}

function isInstagramToken(token: string) {
  return token.startsWith("IGAA") || token.startsWith("IGQV") || token.startsWith("IGQW");
}

function baseFor(token: string) {
  return isInstagramToken(token) ? GRAPH_IG : GRAPH;
}

export class MetaApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function graph(path: string, token: string, init?: RequestInit) {
  const cleanToken = normalizeToken(token);
  const instagramLogin = isInstagramToken(cleanToken);
  const rawUrl = `${baseFor(cleanToken)}${path.startsWith("/") ? path : `/${path}`}`;
  // A Instagram API with Instagram Login documenta o token como query param;
  // o Graph do Facebook aceita Authorization Bearer.
  const url = instagramLogin
    ? `${rawUrl}${rawUrl.includes("?") ? "&" : "?"}access_token=${encodeURIComponent(cleanToken)}`
    : rawUrl;
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(instagramLogin ? {} : { Authorization: `Bearer ${cleanToken}` }),
      ...(init?.headers ?? {}),
    },
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* noop */ }
  if (!res.ok) {
    const msg = json?.error?.message || text || res.statusText;
    console.error("[meta] graph error", res.status, msg);
    if (res.status === 401 && /cannot parse access token/i.test(msg)) {
      throw new MetaApiError(
        "A Meta não reconheceu o token. Gere e copie um novo token completo no painel da Meta; não use o código OAuth nem o App Secret.",
        res.status,
      );
    }
    if (
      /does not have advanced access|não tem acesso avançado/i.test(msg) ||
      /does not exist, cannot be loaded due to missing permissions/i.test(msg)
    ) {
      throw new MetaApiError(
        "O app da Meta ainda está em modo de desenvolvimento: só é possível responder pessoas que tenham função no app (admin/testador) até a análise ser aprovada. Adicione esse perfil como testador ou finalize a App Review.",
        res.status,
      );
    }

    throw new MetaApiError(`Meta API [${res.status}]: ${msg}`, res.status);
  }
  return json;
}

/** Envia texto para um PSID (Messenger) ou IGSID (Instagram Direct). */
export async function metaSendText(token: string, recipientId: string, text: string) {
  console.log("[meta] enviando texto para:", recipientId);
  const json = await graph("/me/messages", token, {
    method: "POST",
    body: JSON.stringify({
      recipient: { id: recipientId },
      messaging_type: "RESPONSE",
      message: { text },
    }),
  });
  console.log("[meta] resposta de envio:", JSON.stringify(json));
  const provider = token.startsWith("EAAB") ? "meta_instagram" : "meta_messenger"; // Heurística simples se necessário ou passar via parâmetro
  const idSuffix = token.includes("instagram") || recipientId.length > 15 ? "meta_instagram" : "meta_messenger"; // Mais seguro vir do contexto
  return { key: { id: json?.message_id ? `${json.message_id}_meta` : null, remoteJid: recipientId, fromMe: true } };
}

/** Envia mídia por URL pública. */
export async function metaSendMedia(
  token: string,
  recipientId: string,
  params: { mediatype: "image" | "video" | "document" | "audio"; media: string; caption?: string },
) {
  const type =
    params.mediatype === "document" ? "file" :
    params.mediatype === "audio" ? "audio" :
    params.mediatype === "video" ? "video" : "image";

  const json = await graph("/me/messages", token, {
    method: "POST",
    body: JSON.stringify({
      recipient: { id: recipientId },
      messaging_type: "RESPONSE",
      message: { attachment: { type, payload: { url: params.media, is_reusable: true } } },
    }),
  });
  if (params.caption) {
    try { await metaSendText(token, recipientId, params.caption); } catch { /* best-effort */ }
  }
  return { key: { id: json?.message_id ?? null, remoteJid: recipientId, fromMe: true } };
}

/** "Digitando..." — Meta aceita typing_on / typing_off / mark_seen. */
export async function metaSendPresence(
  token: string,
  recipientId: string,
  presence: "composing" | "paused" | "available",
) {
  const action = presence === "composing" ? "typing_on" : presence === "paused" ? "typing_off" : "mark_seen";
  return graph("/me/messages", token, {
    method: "POST",
    body: JSON.stringify({ recipient: { id: recipientId }, sender_action: action }),
  });
}

/** Nome e foto do contato (quando a política da Meta permite). */
export async function metaFetchProfile(token: string, userId: string) {
  try {
    const json = await graph(
      `/${encodeURIComponent(userId)}?fields=name,username,profile_pic,first_name,last_name`,
      token,
      { method: "GET" },
    );
    const fullName = json?.name || (json?.first_name ? `${json.first_name}${json.last_name ? ` ${json.last_name}` : ""}` : null);
    const result = {
      name: (fullName || json?.username || null) as string | null,
      picture: (json?.profile_pic || json?.profile_picture_url || null) as string | null,
    };
    if (result.name && (result.name.toLowerCase().includes("instagram") || result.name.toLowerCase().includes("messenger"))) {
      result.name = json?.username || result.name;
    }
    return result;
  } catch {
    return { name: null, picture: null };
  }
}

/** Lista as Páginas do Facebook disponíveis em um User Token. */
export async function metaListPages(token: string) {
  const cleanToken = normalizeToken(token);
  if (isInstagramToken(cleanToken)) return [];
  try {
    const accounts = await graph(`/me/accounts?fields=id,name,access_token&limit=50`, cleanToken, { method: "GET" });
    return (accounts?.data ?? []).map((p: any) => ({
      id: String(p.id),
      name: (p.name || null) as string | null,
    }));
  } catch {
    return [];
  }
}

/** Valida o token e retorna dados da página/conta (+ token efetivo da Página). */
export async function metaFetchPage(token: string, pageId?: string | null) {
  const cleanToken = normalizeToken(token);

  if (isInstagramToken(cleanToken)) {
    let json: any;
    try {
      json = await graph(`/me?fields=user_id,username,name`, cleanToken, { method: "GET" });
    } catch (e) {
      if (e instanceof MetaApiError && e.status === 400) json = await graph(`/me`, cleanToken, { method: "GET" });
      else throw e;
    }
    return {
      id: String(json?.user_id ?? json?.id ?? ""),
      name: (json?.name || json?.username || null) as string | null,
      token: cleanToken,
    };
  }

  // Token do Facebook: pode ser User Token ou Page Token.
  // /me/accounts devolve as Páginas e seus Page Access Tokens (funciona com User Token).
  let accountsError: unknown = null;
  try {
    const accounts = await graph(`/me/accounts?fields=id,name,access_token&limit=50`, cleanToken, { method: "GET" });
    const pages = accounts?.data ?? [];
    const page = pageId ? pages.find((p: any) => String(p.id) === String(pageId)) : pages[0];
    if (pageId && !page) {
      throw new MetaApiError("A Página selecionada não está disponível neste token.", 400);
    }
    if (page?.id) {
      return {
        id: String(page.id),
        name: (page.name || null) as string | null,
        token: String(page.access_token || cleanToken),
      };
    }
    throw new MetaApiError(
      "Nenhuma Página foi encontrada neste token. Gere-o novamente incluindo pages_show_list, pages_messaging, pages_manage_metadata e pages_read_engagement.",
      400,
    );
  } catch (error) {
    accountsError = error;
    /* segue para /me — provavelmente já é um Page Token */
  }


  const accountsMessage = accountsError instanceof Error ? accountsError.message : "";
  const isPageToken = /nonexisting field \(accounts\)|unknown path components.*accounts/i.test(accountsMessage);
  if (accountsError && !isPageToken) {
    if (/pages_read_engagement|Page Public (Content|Metadata) Access/i.test(accountsMessage)) {
      throw new MetaApiError(
        "O token do Messenger está sem permissões. Gere um novo token da Página com pages_show_list, pages_messaging, pages_manage_metadata e pages_read_engagement.",
        400,
      );
    }
    throw accountsError;
  }

  let json: any;
  try {
    json = await graph(`/me?fields=id,name`, cleanToken, { method: "GET" });
  } catch (e) {
    const message = e instanceof Error ? e.message : "";
    if (/pages_read_engagement|Page Public (Content|Metadata) Access/i.test(message)) {
      throw new MetaApiError(
        "O token do Messenger está sem permissões. Gere um novo token da Página com pages_show_list, pages_messaging, pages_manage_metadata e pages_read_engagement.",
        400,
      );
    }
    if (accountsError instanceof MetaApiError) throw accountsError;
    throw e;
  }
  return {
    id: String(json?.id ?? ""),
    name: (json?.name || null) as string | null,
    token: cleanToken,
  };
}


/** Assina o app nos eventos de mensagem da Página / conta IG. Sem isso a Meta não envia webhooks. */
export async function metaSubscribePage(token: string, pageId: string) {
  const cleanToken = normalizeToken(token);
  const ig = isInstagramToken(cleanToken);
  const fields = ig
    ? "messages,messaging_postbacks"
    : "messages,messaging_postbacks,messaging_optins,message_deliveries,message_reads";
  const path = ig
    ? `/me/subscribed_apps?subscribed_fields=${fields}`
    : `/${encodeURIComponent(pageId)}/subscribed_apps?subscribed_fields=${fields}`;
  try {
    const json = await graph(path, cleanToken, { method: "POST" });
    return { ok: json?.success !== false, error: null as string | null };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Falha ao assinar webhooks." };
  }
}
