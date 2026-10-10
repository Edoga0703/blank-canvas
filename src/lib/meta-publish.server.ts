// Servidor para publicação de conteúdo e leitura de feed na Meta (Instagram e Facebook).
// Utiliza a Content Publishing API oficial da Meta (Graph API v25.0).

const GRAPH = "https://graph.facebook.com/v25.0";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function cleanToken(token: string): string {
  return token
    .normalize("NFKC")
    .trim()
    .replace(/^Bearer\s+/i, "")
    .replace(/^["']|["']$/g, "")
    .replace(/[\s\u200B-\u200D\u2060\uFEFF]/g, "");
}

async function graphPost(path: string, token: string, bodyParams: Record<string, any>) {
  const t = cleanToken(token);
  const url = `${GRAPH}${path.startsWith("/") ? path : `/${path}`}`;
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(bodyParams)) {
    if (v !== undefined && v !== null) search.set(k, String(v));
  }
  search.set("access_token", t);

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: search.toString(),
    signal: AbortSignal.timeout(60_000),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.error) {
    const msg = json?.error?.message || `Erro HTTP ${res.status}`;
    console.error("[meta-publish] Erro POST:", path, msg);
    throw new Error(msg);
  }
  return json;
}

async function graphGet(path: string, token: string, queryParams: Record<string, string> = {}) {
  const t = cleanToken(token);
  const url = new URL(`${GRAPH}${path.startsWith("/") ? path : `/${path}`}`);
  for (const [k, v] of Object.entries(queryParams)) {
    url.searchParams.set(k, v);
  }
  url.searchParams.set("access_token", t);

  const res = await fetch(url.toString(), {
    method: "GET",
    signal: AbortSignal.timeout(20_000),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.error) {
    const msg = json?.error?.message || `Erro HTTP ${res.status}`;
    console.error("[meta-publish] Erro GET:", path, msg);
    throw new Error(msg);
  }
  return json;
}

/** Aguarda o container da Meta terminar o processamento de imagem/vídeo. */
async function waitForContainer(containerId: string, token: string, maxTries = 20, intervalMs = 2500) {
  for (let attempt = 0; attempt < maxTries; attempt++) {
    const statusResp = await graphGet(containerId, token, { fields: "status_code,status" });
    const code = statusResp?.status_code;
    if (code === "FINISHED") return;
    if (code === "ERROR" || code === "EXPIRED") {
      throw new Error(`Falha no processamento da mídia pela Meta: ${statusResp?.status || code}`);
    }
    await sleep(intervalMs);
  }
  throw new Error("Tempo esgotado aguardando o processamento da mídia pelo Instagram.");
}

/** Publica o container final no Instagram. */
async function publishContainer(igUserId: string, containerId: string, token: string) {
  const maxTries = 5;
  for (let attempt = 0; attempt < maxTries; attempt++) {
    try {
      return await graphPost(`${igUserId}/media_publish`, token, { creation_id: containerId });
    } catch (e: any) {
      const msg = e?.message ?? "";
      const notReady = /media id is not available|not ready|processing/i.test(msg);
      if (!notReady || attempt === maxTries - 1) throw e;
      await sleep(2500 + attempt * 1000);
    }
  }
  throw new Error("A mídia não pôde ser publicada após várias tentativas.");
}

/** Publica uma imagem no feed do Instagram. */
export async function metaPublishInstagramPhoto(
  token: string,
  igUserId: string,
  imageUrl: string,
  caption?: string,
) {
  const container = await graphPost(`${igUserId}/media`, token, {
    image_url: imageUrl,
    caption: caption || undefined,
  });
  if (!container?.id) throw new Error("A Meta não retornou o identificador do container da imagem.");

  await waitForContainer(container.id, token, 15, 2000);
  const publishResp = await publishContainer(igUserId, container.id, token);
  return { id: publishResp?.id || container.id, success: true };
}

/** Publica um vídeo ou Reels no Instagram. */
export async function metaPublishInstagramVideo(
  token: string,
  igUserId: string,
  videoUrl: string,
  caption?: string,
  coverUrl?: string,
) {
  const container = await graphPost(`${igUserId}/media`, token, {
    media_type: "REELS",
    video_url: videoUrl,
    caption: caption || undefined,
    cover_url: coverUrl || undefined,
  });
  if (!container?.id) throw new Error("A Meta não retornou o identificador do container do vídeo.");

  await waitForContainer(container.id, token, 35, 3000);
  const publishResp = await publishContainer(igUserId, container.id, token);
  return { id: publishResp?.id || container.id, success: true };
}

/** Publica uma postagem de texto/imagem na Página do Facebook. */
export async function metaPublishFacebookPost(
  token: string,
  pageId: string,
  message: string,
  linkOrImageUrl?: string,
) {
  const params: Record<string, any> = { message };
  if (linkOrImageUrl) {
    if (/\.(jpe?g|png|webp|gif)/i.test(linkOrImageUrl)) {
      params.url = linkOrImageUrl;
      return graphPost(`${pageId}/photos`, token, params);
    }
    params.link = linkOrImageUrl;
  }
  return graphPost(`${pageId}/feed`, token, params);
}

export type FeedPost = {
  id: string;
  caption?: string | null;
  media_type?: string;
  media_url?: string;
  permalink?: string;
  thumbnail_url?: string;
  timestamp?: string;
  like_count?: number;
  comments_count?: number;
};

/** Lista as últimas publicações da conta profissional do Instagram. */
export async function metaFetchInstagramFeed(
  token: string,
  igUserId: string,
  limit = 24,
): Promise<FeedPost[]> {
  try {
    const json = await graphGet(`${igUserId}/media`, token, {
      fields: "id,caption,media_type,media_url,permalink,thumbnail_url,timestamp,like_count,comments_count",
      limit: String(limit),
    });
    return (json?.data || []) as FeedPost[];
  } catch (e: any) {
    console.warn("[meta-publish] Erro ao buscar feed do Instagram:", e?.message);
    return [];
  }
}

/** Lista as últimas postagens da Página do Facebook. */
export async function metaFetchFacebookFeed(
  token: string,
  pageId: string,
  limit = 20,
) {
  try {
    const json = await graphGet(`${pageId}/feed`, token, {
      fields: "id,message,created_time,permalink_url,full_picture,shares,comments.summary(true),likes.summary(true)",
      limit: String(limit),
    });
    return (json?.data || []).map((p: any) => ({
      id: p.id,
      caption: p.message || null,
      media_type: p.full_picture ? "IMAGE" : "STATUS",
      media_url: p.full_picture || null,
      permalink: p.permalink_url || null,
      timestamp: p.created_time || null,
      like_count: p.likes?.summary?.total_count || 0,
      comments_count: p.comments?.summary?.total_count || 0,
    })) as FeedPost[];
  } catch (e: any) {
    console.warn("[meta-publish] Erro ao buscar feed do Facebook:", e?.message);
    return [];
  }
}
