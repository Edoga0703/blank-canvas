// Adapter Meta (Messenger + Instagram Direct) via Graph API.
// Server-only. Usa o Page Access Token salvo em whatsapp_instances.instance_token.
export const META_GRAPH_VERSION = "v25.0";
const GRAPH = `https://graph.facebook.com/${META_GRAPH_VERSION}`;
// Tokens da "Instagram API com login do Instagram" (IGAA...) usam outro host.
const GRAPH_IG = `https://graph.instagram.com/${META_GRAPH_VERSION}`;

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
  const rawUrl = /^https?:\/\//i.test(path)
    ? path
    : `${baseFor(cleanToken)}${path.startsWith("/") ? path : `/${path}`}`;
  // A Instagram API with Instagram Login documenta o token como query param;
  // o Graph do Facebook aceita Authorization Bearer.
  const url = instagramLogin && !/[?&]access_token=/i.test(rawUrl)
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

/** Cliente Graph server-only. Mantém tokens fora do navegador e centraliza a versão da API. */
export async function metaGraphRequest(path: string, token: string, init?: RequestInit) {
  return graph(path, token, init);
}

async function graphCollection(path: string, token: string, maxPages = 5) {
  const rows: any[] = [];
  let next: string | null = path;
  let pages = 0;
  while (next && pages < maxPages) {
    const json = await graph(next, token, { method: "GET" });
    if (Array.isArray(json?.data)) rows.push(...json.data);
    next = typeof json?.paging?.next === "string" ? json.paging.next : null;
    pages += 1;
  }
  return { data: rows, pages, next };
}

function qs(values: Record<string, string | number | boolean | null | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  }
  const text = params.toString();
  return text ? `?${text}` : "";
}

/** Conversas e mensagens do Messenger/Instagram para sincronização inicial e reconciliação. */
export async function metaListConversations(token: string, ownerId: string, options?: { since?: string; until?: string; limit?: number; instagram?: boolean }) {
  const cleanToken = normalizeToken(token);
  const instagramLogin = isInstagramToken(cleanToken);
  const instagram = options?.instagram ?? instagramLogin;
  return graphCollection(`/${encodeURIComponent(ownerId)}/conversations${qs({
    platform: instagramLogin ? undefined : instagram ? "instagram" : "messenger",
    fields: "id,updated_time,participants,snippet,messages.limit(100){id,created_time,from,to,message,attachments,sticker}",
    since: options?.since,
    until: options?.until,
    limit: options?.limit ?? 25,
  })}`, cleanToken, 5);
}

export async function metaListConversationMessages(token: string, conversationId: string, options?: { since?: string; until?: string; limit?: number }) {
  return graphCollection(`/${encodeURIComponent(conversationId)}/messages${qs({
    fields: "id,created_time,from,to,message,attachments,sticker",
    since: options?.since,
    until: options?.until,
    limit: options?.limit ?? 100,
  })}`, token, 10);
}

function metaPostFields(instagram: boolean, withEngagement = true) {
  if (instagram) {
    return [
      "id",
      "caption",
      "media_type",
      "media_product_type",
      "media_url",
      "thumbnail_url",
      "permalink",
      "timestamp",
      "username",
      "like_count",
      "comments_count",
      "children.limit(20){id,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp}",
      "comments.limit(100){id,text,timestamp,username,from,like_count,replies.limit(100){id,text,timestamp,username,from}}",
    ].join(",");
  }
  if (!withEngagement) {
    return "id,message,created_time,permalink_url,attachments,shares";
  }
  return "id,message,created_time,permalink_url,attachments,shares,reactions.limit(0).summary(true),comments.limit(100).summary(true){id,message,created_time,from,like_count,parent,comments.limit(100){id,message,created_time,from,like_count,parent}}";
}

/** Feed, comentários e métricas de uma Página. As permissões dependem do modo do app e da revisão Meta. */
export async function metaListPagePosts(token: string, pageId: string, options?: { since?: string; until?: string; limit?: number; instagram?: boolean }) {
  const instagram = options?.instagram ?? isInstagramToken(normalizeToken(token));
  const endpoint = instagram ? "media" : "published_posts";

  try {
    return await graphCollection(`/${encodeURIComponent(pageId)}/${endpoint}${qs({
      fields: metaPostFields(instagram, true),
      since: options?.since,
      until: options?.until,
      limit: options?.limit ?? 25,
    })}`, token, 5);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (!instagram && (msg.includes("pages_read_engagement") || msg.includes("pages_read_user_content") || msg.includes("(#10)"))) {
      console.warn("[metaListPagePosts] Permissões de engajamento limitadas pela Meta. Carregando publicações em modo básico.");
      return await graphCollection(`/${encodeURIComponent(pageId)}/published_posts${qs({
        fields: metaPostFields(false, false),
        since: options?.since,
        until: options?.until,
        limit: options?.limit ?? 25,
      })}`, token, 5);
    }
    throw error;
  }
}

/** Recupera uma publicação específica para abrir links vindos da notificação. */
export async function metaGetPost(token: string, postId: string, options?: { instagram?: boolean }) {
  const instagram = options?.instagram ?? isInstagramToken(normalizeToken(token));
  try {
    return await graph(`/${encodeURIComponent(postId)}${qs({ fields: metaPostFields(instagram, true) })}`, token, { method: "GET" });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (!instagram && (msg.includes("pages_read_engagement") || msg.includes("pages_read_user_content") || msg.includes("(#10)"))) {
      return await graph(`/${encodeURIComponent(postId)}${qs({ fields: metaPostFields(false, false) })}`, token, { method: "GET" });
    }
    throw error;
  }
}

export async function metaListPostComments(token: string, postId: string, options?: { limit?: number; instagram?: boolean }) {
  const instagram = options?.instagram ?? isInstagramToken(normalizeToken(token));
  try {
    return await graphCollection(`/${encodeURIComponent(postId)}/comments${qs({
      fields: instagram
        ? "id,text,timestamp,username,from,like_count,replies.limit(100){id,text,timestamp,username,from}"
        : "id,message,created_time,from,like_count,parent,comments.limit(100){id,message,created_time,from,like_count,parent}",
      limit: options?.limit ?? 100,
    })}`, token, 10);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (!instagram && (msg.includes("pages_read_user_content") || msg.includes("pages_read_engagement") || msg.includes("(#10)"))) {
      console.warn("[metaListPostComments] Acesso a comentários de terceiros no Facebook restrito por permissões Meta (#10).");
      return { data: [], pages: {} };
    }
    throw error;
  }
}

export async function metaReplyToComment(token: string, commentId: string, message: string) {
  return graph(`/${encodeURIComponent(commentId)}/comments`, token, {
    method: "POST",
    body: JSON.stringify({ message }),
  });
}

export async function metaPublishPagePost(token: string, pageId: string, input: { message?: string; link?: string; photoUrl?: string }) {
  const body: Record<string, string> = {};
  if (input.message?.trim()) body.message = input.message.trim();
  if (input.link?.trim()) body.link = input.link.trim();
  if (input.photoUrl?.trim()) body.url = input.photoUrl.trim();
  return graph(`/${encodeURIComponent(pageId)}/${input.photoUrl ? "photos" : "feed"}`, token, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/** Publicação de imagem no perfil profissional do Instagram (contêiner + publicação). */
export async function metaPublishInstagramImage(token: string, instagramUserId: string, input: { imageUrl: string; caption?: string }) {
  const container = await graph(`/${encodeURIComponent(instagramUserId)}/media`, token, {
    method: "POST",
    body: JSON.stringify({ image_url: input.imageUrl, caption: input.caption?.trim() || undefined }),
  });
  if (!container?.id) throw new MetaApiError("A Meta não devolveu o contêiner do Instagram.", 502);
  return graph(`/${encodeURIComponent(instagramUserId)}/media_publish`, token, {
    method: "POST",
    body: JSON.stringify({ creation_id: container.id }),
  });
}

export async function metaListPageInsights(token: string, pageId: string, metrics: string[], options?: { since?: string; until?: string }) {
  return graph(`/${encodeURIComponent(pageId)}/insights${qs({
    metric: metrics.join(","),
    since: options?.since,
    until: options?.until,
  })}`, token, { method: "GET" });
}

export async function metaGetMediaInsights(token: string, mediaId: string, metrics: string[]) {
  const cleanToken = normalizeToken(token);
  const results = await Promise.allSettled(
    metrics.map(async (metric) => {
      const response = await graph(
        `/${encodeURIComponent(mediaId)}/insights${qs({ metric })}`,
        cleanToken,
        { method: "GET" },
      );
      return Array.isArray(response?.data) ? response.data : [];
    }),
  );
  const data = results.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
  return {
    data,
    unavailable: results
      .map((result, index) => (result.status === "rejected" ? metrics[index] : null))
      .filter(Boolean),
  };
}

export async function metaListLeadForms(token: string, pageId: string, options?: { limit?: number }) {
  return graphCollection(`/${encodeURIComponent(pageId)}/leadgen_forms${qs({ limit: options?.limit ?? 50 })}`, token, 5);
}

export async function metaListFormLeads(token: string, formId: string, options?: { since?: string; until?: string; limit?: number }) {
  return graphCollection(`/${encodeURIComponent(formId)}/leads${qs({
    fields: "id,created_time,field_data,ad_id,form_id",
    since: options?.since,
    until: options?.until,
    limit: options?.limit ?? 100,
  })}`, token, 10);
}

/** Recursos de anúncios. Requer token de sistema/usuário com ads_read ou ads_management. */
export async function metaListAdAccounts(token: string) {
  return graphCollection(`/me/adaccounts${qs({ fields: "id,name,account_status,currency", limit: 50 })}`, token, 5);
}

export async function metaListAdCampaigns(token: string, adAccountId: string, options?: { limit?: number }) {
  const account = adAccountId.startsWith("act_") ? adAccountId : `act_${adAccountId}`;
  return graphCollection(`/${encodeURIComponent(account)}/campaigns${qs({ fields: "id,name,status,effective_status,objective,updated_time", limit: options?.limit ?? 100 })}`, token, 10);
}

export async function metaListAdInsights(token: string, adAccountId: string, options?: { datePreset?: string; since?: string; until?: string; level?: string }) {
  const account = adAccountId.startsWith("act_") ? adAccountId : `act_${adAccountId}`;
  return graph(`/${encodeURIComponent(account)}/insights${qs({ fields: "campaign_id,campaign_name,impressions,reach,clicks,spend,actions,ctr,cpc", date_preset: options?.datePreset ?? "last_7d", since: options?.since, until: options?.until, level: options?.level ?? "campaign" })}`, token, { method: "GET" });
}

export async function metaUpdateCampaignStatus(token: string, campaignId: string, status: "ACTIVE" | "PAUSED" | "ARCHIVED") {
  return graph(`/${encodeURIComponent(campaignId)}`, token, { method: "POST", body: JSON.stringify({ status }) });
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
      instagramId: String(json?.user_id ?? json?.id ?? ""),
      instagramName: (json?.username || json?.name || null) as string | null,
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
      const pageToken = String(page.access_token || cleanToken);
      let instagramId: string | null = null;
      let instagramName: string | null = null;
      try {
        const linked = await graph(`/${encodeURIComponent(page.id)}?fields=instagram_business_account{id,username}`, pageToken, { method: "GET" });
        instagramId = linked?.instagram_business_account?.id ? String(linked.instagram_business_account.id) : null;
        instagramName = (linked?.instagram_business_account?.username || null) as string | null;
      } catch {
        // A Página sem Instagram vinculado ou sem permissão continua válida para Messenger.
      }
      return {
        id: String(page.id),
        name: (page.name || null) as string | null,
        token: pageToken,
        instagramId,
        instagramName,
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
    instagramId: null,
    instagramName: null,
  };
}


/** Assina o app nos eventos de mensagem da Página / conta IG. Sem isso a Meta não envia webhooks. */
export async function metaSubscribePage(token: string, pageId: string, _options?: { instagram?: boolean }) {
  const cleanToken = normalizeToken(token);
  // O tipo de token decide o endpoint: campos de IG (comments, mentions) não existem
  // numa Página e fazem a Meta rejeitar a assinatura inteira.
  const ig = isInstagramToken(cleanToken);
  const fields = ig
    ? "messages,messaging_postbacks,message_reactions,comments,mentions"
    : "messages,messaging_postbacks,messaging_optins,message_deliveries,message_reads,message_reactions,feed,leadgen";
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
