import * as QRCode from "qrcode";

// Wrapper server-only para a Uazapi (Baileys-based).
// Documentação: https://docs.uazapi.com
//
// Modelo de auth:
//   - Admin token global (env UAZAPI_ADMIN_TOKEN) → cria instância e lista.
//   - Instance token (retornado por /instance/init) → todo o resto.
// Todas as chamadas usam header `token: <value>`.
//
// Este arquivo é *.server.ts e é bloqueado do bundle client.

const SUPPORT_SUFFIX = " Se persistir, abra um chamado no chat de suporte dentro do sistema.";

export class UazapiApiError extends Error {
  status: number;
  details?: unknown;
  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = "UazapiApiError";
    this.status = status;
    this.details = details;
  }
}

function env() {
  const url = process.env.UAZAPI_URL;
  const adminToken = process.env.UAZAPI_ADMIN_TOKEN;
  if (!url || !adminToken) {
    throw new Error(
      `Servidor Uazapi não configurado. Configure UAZAPI_URL e UAZAPI_ADMIN_TOKEN nos segredos do backend.${SUPPORT_SUFFIX}`,
    );
  }
  return { url: url.replace(/\/+$/, ""), adminToken };
}

async function uaz<T = any>(
  path: string,
  init: RequestInit & { json?: any; token?: string; useAdmin?: boolean; timeoutMs?: number } = {},
): Promise<T> {

  const { url, adminToken } = env();
  const useAdmin = !!init.useAdmin;
  const token = useAdmin ? adminToken : init.token || adminToken;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    // Rotas administrativas (criar/listar instância) exigem o header `admintoken`.
    // O header `token` é aceito apenas para o token da instância; usar o admin
    // token em `token` devolve 401 Unauthorized.
    ...(useAdmin ? { admintoken: token } : { token }),
    ...(init.headers as Record<string, string> | undefined),
  };

  let res: Response;
  const fullUrl = `${url}${path}`;
  // Timeout obrigatório: sem isto um 524/hang da Uazapi trava o worker de reenvio
  // e o envio manual fica pendurado até o runtime abortar a requisição.
  const timeoutMs = (init as any).timeoutMs ?? 25_000;
  try {
    console.log(`[uaz-fetch] ${init.method || "GET"} ${fullUrl}`);
    res = await fetch(fullUrl, {
      ...init,
      headers,
      body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
      signal: (init as any).signal ?? AbortSignal.timeout(timeoutMs),
    });
  } catch (e: any) {
    const timedOut = e?.name === "TimeoutError" || e?.name === "AbortError";
    console.error(`[uaz-fetch] Network error for ${fullUrl}:`, e);
    throw new Error(
      timedOut
        ? `Uazapi não respondeu em ${Math.round(timeoutMs / 1000)}s (tempo esgotado).${SUPPORT_SUFFIX}`
        : `Uazapi indisponível: ${e?.message || "falha de rede"}.${SUPPORT_SUFFIX}`,
    );
  }

  const text = await res.text();
  console.log(`[uaz-fetch] Response status: ${res.status}, body length: ${text.length}`);
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const msg = data?.message || data?.error || text || `HTTP ${res.status}`;
    const friendly = res.status === 401 || res.status === 403
      ? `Credenciais Uazapi inválidas ou sem permissão (${res.status}). Verifique UAZAPI_URL, UAZAPI_ADMIN_TOKEN e o token da instância.${SUPPORT_SUFFIX}`
      : `Uazapi: ${msg}.${SUPPORT_SUFFIX}`;
    console.error(`[uaz-fetch] API ERROR: ${res.status} - ${msg}`);
    throw new UazapiApiError(res.status, friendly, data);
  }
  return data as T;
}

// ============================================================
// INSTÂNCIA
// ============================================================

export interface UazapiCreateInstanceResult {
  token: string;
  name: string;
  id?: string;
  raw: any;
}

/** Cria instância. Retorna o token permanente da instância. */
export async function uazCreateInstance(instanceName: string): Promise<UazapiCreateInstanceResult> {
  const data: any = await uaz(`/instance/create`, {
    method: "POST",
    useAdmin: true,
    json: { name: instanceName },
  });
  const inst = data?.instance ?? data;
  const token: string | undefined = inst?.token ?? data?.token;
  if (!token) {
    throw new UazapiApiError(500, `Uazapi não devolveu token da instância.${SUPPORT_SUFFIX}`, data);
  }
  return {
    token,
    name: inst?.name ?? instanceName,
    id: inst?.id,
    raw: data,
  };
}

/** Retorna QR (base64) e/ou pairing code. Chamar após criar a instância. */
export async function uazConnect(
  instanceToken: string,
  phone?: string,
): Promise<{ base64?: string; code?: string; paircode?: string; raw: any }> {
  const data: any = await uaz(`/instance/connect`, {
    method: "POST",
    token: instanceToken,
    json: phone ? { phone } : {},
  });
  const inst = data?.instance ?? data;
  return {
    base64: inst?.qrcode ?? data?.qrcode,
    code: inst?.qrcode_data ?? data?.qrcode_data,
    paircode: inst?.paircode ?? data?.paircode,
    raw: data,
  };
}

function asImageDataUrl(value: unknown): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return null;
  if (text.startsWith("data:image/")) return text;
  if (text.length > 120 && /^[A-Za-z0-9+/=\s]+$/.test(text)) {
    return `data:image/png;base64,${text.replace(/\s/g, "")}`;
  }
  return null;
}

export async function uazGetQr(
  instanceToken: string,
): Promise<{ qrBase64: string | null; code: string | null; pairingCode: string | null }> {
  const payload = await uazConnect(instanceToken);
  const image = asImageDataUrl(payload.base64);
  const pairingCode = payload.paircode ?? null;
  if (image) return { qrBase64: image, code: payload.code ?? null, pairingCode };
  if (payload.code) {
    const qrBase64 = await QRCode.toDataURL(payload.code, { width: 320, margin: 2, errorCorrectionLevel: "M" });
    return { qrBase64, code: payload.code, pairingCode };
  }
  return { qrBase64: null, code: null, pairingCode };
}

export async function uazState(
  instanceToken: string,
): Promise<{ instance?: { state?: string; wa_name?: string; wa_jid?: string }; state?: string; qrBase64?: string | null }> {
  const data: any = await uaz(`/instance/status`, { method: "GET", token: instanceToken });
  const inst = data?.instance ?? data;
  const rawStatus = String(inst?.status ?? inst?.state ?? "").toLowerCase();
  // Uazapi usa "connected"/"connecting"/"disconnected". Mapeia para o vocabulário Baileys ("open"/"connecting"/"close")
  // que o resto do sistema (normalizeEvolutionState) já entende.
  const mapped = rawStatus === "connected" ? "open"
    : rawStatus === "connecting" ? "connecting"
    : rawStatus === "disconnected" || rawStatus === "close" ? "close"
    : rawStatus || undefined;
  const qrImage = asImageDataUrl(inst?.qrcode ?? data?.qrcode);
  const qrData = inst?.qrcode_data ?? data?.qrcode_data;
  const qrBase64 = qrImage || (typeof qrData === "string" && qrData.trim()
    ? await QRCode.toDataURL(qrData, { width: 320, margin: 2, errorCorrectionLevel: "M" })
    : null);
  return {
    instance: { state: mapped, wa_name: inst?.wa_name, wa_jid: inst?.wa_jid },
    state: mapped,
    qrBase64,
  };
}

export async function uazFetchInstance(instanceToken: string): Promise<any | null> {
  try {
    const data: any = await uaz(`/instance/status`, { method: "GET", token: instanceToken });
    return data?.instance ?? data ?? null;
  } catch {
    return null;
  }
}

export async function uazSetWebhook(instanceToken: string, webhookUrl: string) {
  // Uazapi espera excludeMessages como array de strings ("wasSentByApi" | "fromMe" | "isGroup" | ...).
  const res = await uaz(`/webhook`, {
    method: "POST",
    token: instanceToken,
    json: {
      url: webhookUrl,
      enabled: true,
      events: ["messages", "messages_update", "connection", "qrcode", "send_message"],
      excludeMessages: ["wasSentByApi"],
    },
  });
  console.log(`[uazapi] Webhook configurado para ${instanceToken}:`, webhookUrl);
  return res;
}

export async function uazLogout(instanceToken: string) {
  return uaz(`/instance/disconnect`, { method: "POST", token: instanceToken });
}

export async function uazRestart(instanceToken: string) {
  // Nunca usar /instance/connect como fallback: ele troca as chaves e invalida
  // o QR que pode estar aberto no celular durante o pareamento.
  return uaz(`/instance/reset`, { method: "POST", token: instanceToken });
}

export async function uazDelete(instanceToken: string) {
  return uaz(`/instance`, { method: "DELETE", token: instanceToken });
}

export async function uazFetchNumberFromInstance(instanceToken: string): Promise<string | null> {
  try {
    const inst = await uazFetchInstance(instanceToken);
    const raw = inst?.wa_jid || inst?.owner || inst?.number || null;
    if (!raw) return null;
    return String(raw).split("@")[0].replace(/\D/g, "") || null;
  } catch {
    return null;
  }
}

// ============================================================
// MENSAGENS
// ============================================================

function normalizeNumber(n: string) {
  const raw = String(n || "");
  const digits = raw.replace(/\D/g, "");
  // Grupos: o destino precisa manter o sufixo @g.us.
  if (raw.toLowerCase().includes("@g.us") || digits.startsWith("120363")) {
    return `${digits}@g.us`;
  }
  // Contatos com privacidade de número (LID) chegam com ID de 15+ dígitos.
  // Enviar só os dígitos falha silenciosamente ("enviando" eterno);
  // a Uazapi aceita o destino no formato <id>@lid.
  if (raw.toLowerCase().includes("@lid") || (digits.length >= 15 && !digits.startsWith("120363"))) {
    return `${digits}@lid`;
  }
  return digits;
}


export async function uazSendText(
  instanceToken: string,
  number: string,
  text: string,
  opts?: { quoted?: { key: { id: string; remoteJid: string; fromMe: boolean }; message: any } },
): Promise<any> {
  const json: any = { number: normalizeNumber(number), text };
  if (opts?.quoted?.key?.id) json.replyid = opts.quoted.key.id;
  return uaz(`/send/text`, { method: "POST", token: instanceToken, json });
}

export async function uazSendReaction(
  instanceToken: string,
  remoteJid: string,
  messageId: string,
  _fromMe: boolean,
  reaction: string,
) {
  return uaz(`/message/react`, {
    method: "POST",
    token: instanceToken,
    json: { number: remoteJid.split("@")[0], id: messageId, text: reaction },
  });
}

export async function uazEditMessage(
  instanceToken: string,
  remoteJid: string,
  messageId: string,
  _fromMe: boolean,
  newText: string,
) {
  return uaz(`/message/edit`, {
    method: "POST",
    token: instanceToken,
    json: { number: remoteJid.split("@")[0], id: messageId, text: newText },
  });
}

export async function uazSendPresence(
  instanceToken: string,
  number: string,
  presence: "composing" | "paused" | "available",
  delayMs = 1500,
) {
  try {
    await uaz(`/message/presence`, {
      method: "POST",
      token: instanceToken,
      json: { number: normalizeNumber(number), presence, delay: delayMs },
    });
  } catch {
    // best-effort
  }
}

export async function uazSendMedia(
  instanceToken: string,
  number: string,
  params: { mediatype: "image" | "video" | "document"; media: string; mimetype: string; fileName?: string; caption?: string },
) {
  return uaz(`/send/media`, {
    method: "POST",
    token: instanceToken,
    json: {
      number: normalizeNumber(number),
      type: params.mediatype,
      file: params.media,
      docName: params.fileName,
      text: params.caption,
      mimetype: params.mimetype,
    },
  });
}

/** Envia um cartão de contato nativo do WhatsApp (vCard). */
export async function uazSendContact(
  instanceToken: string,
  number: string,
  contato: { fullName: string; phoneNumber: string; organization?: string | null },
) {
  return uaz(`/send/contact`, {
    method: "POST",
    token: instanceToken,
    json: {
      number: normalizeNumber(number),
      fullName: contato.fullName,
      phoneNumber: contato.phoneNumber,
      ...(contato.organization ? { organization: contato.organization } : {}),
    },
  });
}

export async function uazSendAudio(

  instanceToken: string,
  number: string,
  audioBase64OrUrl: string,
  mimetype?: string | null,
) {
  return uaz(`/send/media`, {
    method: "POST",
    token: instanceToken,
    json: {
      number: normalizeNumber(number),
      type: "ptt",
      file: audioBase64OrUrl,
      ...(mimetype ? { mimetype } : {}),
    },
  });
}

export async function uazFetchProfilePic(instanceToken: string, number: string): Promise<string | null> {
  try {
    const data: any = await uaz(`/chat/details`, {
      method: "POST",
      token: instanceToken,
      json: { number: normalizeNumber(number), preview: true },
    });
    return data?.imagePreview || data?.image || data?.imgUrl || data?.url || null;
  } catch {
    return null;
  }
}

/**
 * Converte um identificador de privacidade (@lid) no telefone real do contato.
 * Sem isso, o mesmo contato abre uma segunda conversa com um "número" fictício
 * de 15+ dígitos. Retorna null quando a Uazapi não souber informar.
 */
export async function uazResolveLidPhone(instanceToken: string, lid: string): Promise<string | null> {
  const id = String(lid || "").replace(/\D/g, "");
  if (!id) return null;
  for (const alvo of [`${id}@lid`, id]) {
    try {
      const data: any = await uaz(`/chat/details`, {
        method: "POST",
        token: instanceToken,
        json: { number: alvo, preview: false },
      });
      const d = data?.chat ?? data?.contact ?? data?.data ?? data;
      const raw = String(
        d?.phoneNumber || d?.PhoneNumber || d?.phone || d?.pn || d?.wa_number ||
        d?.wa_chatid || d?.jid || d?.id || "",
      );
      const digits = raw.split("@")[0]?.replace(/\D/g, "") ?? "";
      if (digits && digits !== id && digits.length >= 10 && digits.length <= 14) return digits;
    } catch {
      /* tenta o próximo formato */
    }
  }
  return null;
}

export async function uazFetchMessages(instanceToken: string, number: string, limit = 100): Promise<any[]> {
  try {
    const data: any = await uaz(`/chat/messages`, {
      method: "POST",
      token: instanceToken,
      json: { number: normalizeNumber(number), limit },
    });
    return Array.isArray(data) ? data : data?.messages ?? [];
  } catch (e: any) {
    console.warn("[uazFetchMessages]", e?.message);
    return [];
  }
}

export async function uazGetMediaBase64(

  instanceToken: string,
  message: any,
): Promise<{ base64: string; mimetype?: string; fileName?: string } | null> {
  const id = message?.key?.id;
  if (!id) return null;

  // No webhook a mídia costuma ser pedida antes de a Uazapi terminar de
  // persistir a mensagem → 404 "Message not found". Tentamos de novo com
  // pequenas pausas antes de desistir.
  const esperas = [0, 1500, 4000];
  for (let i = 0; i < esperas.length; i++) {
    if (esperas[i]) await new Promise((r) => setTimeout(r, esperas[i]));
    try {
      const data: any = await uaz(`/message/download`, {
        method: "POST",
        token: instanceToken,
        json: { id },
      });
      let base64 = data?.base64 || data?.file || data?.data?.base64 || null;
      const mimetype = data?.mimetype || data?.mediaType;
      // A Uazapi frequentemente devolve uma URL (fileURL) em vez de base64.
      if (typeof base64 === "string" && /^https?:\/\//i.test(base64)) {
        base64 = null;
      }
      const url: string | null =
        data?.fileURL || data?.fileUrl || data?.url ||
        (typeof (data?.file) === "string" && /^https?:\/\//i.test(data.file) ? data.file : null);
      if (!base64 && url) {
        const { mediaFromDirectUrl } = await import("@/lib/media-fetch.server");
        const viaUrl = await mediaFromDirectUrl({ documentMessage: { url, mimetype, fileName: data?.fileName } });
        if (viaUrl) return viaUrl;
      }
      if (!base64 || typeof base64 !== "string") return null;
      return { base64, mimetype, fileName: data?.fileName };
    } catch (e: any) {
      const notFound = e instanceof UazapiApiError && e.status === 404;
      if (notFound && i < esperas.length - 1) continue;
      console.warn("[uazGetMediaBase64]", e?.message);
      return null;
    }
  }
  return null;
}

export async function uazDeleteChat(instanceToken: string, number: string) {
  return uaz(`/chat/clear`, {
    method: "POST",
    token: instanceToken,
    json: { number: number.replace(/\D/g, "") },
  }).catch(() => {
    // Fallback para delete se clear não existir ou falhar
    return uaz(`/chat/delete`, {
      method: "DELETE",
      token: instanceToken,
      json: { number: number.replace(/\D/g, "") },
    });
  });
}

export async function uazArchiveChat(instanceToken: string, number: string, archive: boolean) {
  return uaz(`/chat/archive`, {
    method: "POST",
    token: instanceToken,
    json: { number: number.replace(/\D/g, ""), archive },
  });
}

export async function uazBlockContact(instanceToken: string, number: string, action: "block" | "unblock") {
  return uaz(`/chat/block`, {
    method: "POST",
    token: instanceToken,
    json: { number: number.replace(/\D/g, ""), action },
  });
}




/** Apaga uma mensagem no WhatsApp (para todos). */
export async function uazDeleteMessage(instanceToken: string, messageId: string) {
  return uaz(`/message/delete`, {
    method: "POST",
    token: instanceToken,
    json: { id: messageId },
  });
}

/**
 * Descobre o número real do WhatsApp (JID) de um destinatário.
 * Resolve o caso do 9º dígito: quem digita 5585999926859 pode ter, de fato,
 * o WhatsApp em 558599926859. Retorna null quando não conseguir confirmar.
 */
export async function uazResolveNumber(instanceToken: string, number: string): Promise<string | null> {
  const digits = String(number || "").replace(/\D/g, "");
  if (!digits) return null;
  try {
    const data: any = await uaz(`/chat/check`, {
      method: "POST",
      token: instanceToken,
      json: { numbers: [digits] },
    });
    const arr = Array.isArray(data) ? data : Array.isArray(data?.result) ? data.result : [data];
    const hit = arr.find((r: any) => r && (r.exists === true || r.isInWhatsapp === true || r.jid || r.wa_chatid));
    const jid = String(hit?.jid ?? hit?.wa_chatid ?? "");
    const resolved = jid.split("@")[0]?.replace(/\D/g, "") ?? "";
    if (jid.includes("@lid")) return null;
    return resolved.length >= 10 ? resolved : null;
  } catch {
    return null;
  }
}

// ============================================================
// GRUPOS
// ============================================================

export interface UazGroup {
  jid: string;
  nome: string | null;
  participantes: number | null;
  foto_url: string | null;
}

function groupArray(data: any): any[] {
  return Array.isArray(data) ? data : data?.groups ?? data?.data?.groups ?? data?.data ?? [];
}

/** Lista todos os grupos da instância, percorrendo a paginação da Uazapi. */
export async function uazListGroups(instanceToken: string): Promise<UazGroup[]> {
  const limit = 50;
  const encontrados = new Map<string, any>();
  for (let offset = 0; offset < 2_000; offset += limit) {
    let data: any = null;
    try {
      data = await uaz("/group/list", {
        method: "POST",
        token: instanceToken,
        json: { limit, offset, noParticipants: true },
      });
    } catch {
      if (offset > 0) break;
      data = await uaz("/group/list?force=false", { method: "GET", token: instanceToken });
    }
    const pagina = groupArray(data);
    for (const grupo of pagina) {
      const jid = String(grupo?.JID || grupo?.jid || grupo?.id || grupo?.remoteJid || "");
      if (jid.includes("@g.us")) encontrados.set(jid, grupo);
    }
    const total = Number(data?.total ?? data?.pagination?.total ?? data?.data?.total ?? 0);
    const hasMore = data?.hasMore ?? data?.pagination?.hasMore ?? data?.data?.hasMore;
    if (pagina.length < limit || hasMore === false || (total > 0 && offset + pagina.length >= total)) break;
  }

  const grupos = Array.from(encontrados.values())
    .map((g: any) => {
      const jid = String(g?.JID || g?.jid || g?.id || g?.remoteJid || "");
      if (!jid.includes("@g.us")) return null;
      const participantes = Array.isArray(g?.Participants || g?.participants)
        ? (g.Participants || g.participants).length
        : typeof g?.size === "number"
          ? g.size
          : null;
      return {
        jid,
        nome: (g?.Name || g?.name || g?.subject || null) as string | null,
        participantes,
        foto_url: (g?.imgUrl || g?.profilePicUrl || g?.picture || null) as string | null,
      };
    })
    .filter(Boolean) as UazGroup[];

  const enriquecidos = await Promise.all(grupos.map(async (grupo) => {
    if (grupo.foto_url) return grupo;
    const foto_url = await uazFetchProfilePic(instanceToken, grupo.jid);
    return { ...grupo, foto_url };
  }));
  return enriquecidos;
}

export interface UazGroupParticipant {
  jid: string;
  numero: string | null;
  nome: string | null;
  foto_url: string | null;
  admin: boolean;
}

export interface UazGroupInfo extends UazGroup {
  descricao: string | null;
  criado_em: string | null;
  lista: UazGroupParticipant[];
}

/** Detalhes de um grupo (nome, descrição e participantes). */
export async function uazGroupInfo(instanceToken: string, jid: string): Promise<UazGroupInfo | null> {
  const rotas: { path: string; method: "GET" | "POST" }[] = [
    { path: `/group/info?groupjid=${encodeURIComponent(jid)}`, method: "GET" },
    { path: `/group/info`, method: "POST" },
  ];
  let data: any = null;
  for (const r of rotas) {
    try {
      data = await uaz(r.path, {
        method: r.method,
        token: instanceToken,
        ...(r.method === "POST" ? { json: { groupjid: jid, groupJid: jid } } : {}),
      });
      if (data) break;
    } catch {
      /* tenta a próxima rota */
    }
  }
  const g: any = data?.group ?? data?.data ?? data;
  if (!g) return null;
  const raw: any[] = Array.isArray(g?.Participants || g?.participants) ? (g.Participants || g.participants) : [];
  const listaBase: Array<UazGroupParticipant & { precisaDetalhe: boolean }> = raw.map((p: any) => {
    const pj = String(p?.JID || p?.jid || p?.id || "");
    const numeroRaw = String(p?.PhoneNumber || p?.phoneNumber || p?.phone || p?.number || p?.pn || "");
    const numero = numeroRaw.replace(/\D/g, "") || (!pj.includes("@lid") ? pj.split("@")[0]?.replace(/\D/g, "") : "") || null;
    const foto_url = (p?.imgUrl || p?.profilePicUrl || p?.picture || p?.image || null) as string | null;
    const nome = (p?.Name || p?.name || p?.pushName || p?.notify || null) as string | null;
    return {
      jid: pj,
      numero,
      nome,
      foto_url,
      admin: Boolean(p?.IsAdmin ?? p?.isAdmin ?? p?.admin ?? (p?.IsSuperAdmin ?? p?.isSuperAdmin)),
      precisaDetalhe: !numero || !nome || !foto_url,
    };
  }).filter((p) => p.jid);

  const lista: UazGroupParticipant[] = await Promise.all(listaBase.map(async (p) => {
    if (!p.precisaDetalhe) {
      const { precisaDetalhe: _, ...pronto } = p;
      return pronto;
    }
    try {
      const detalhe: any = await uaz("/chat/details", {
        method: "POST",
        token: instanceToken,
        json: { number: p.jid, preview: true },
      });
      const d = detalhe?.chat ?? detalhe?.contact ?? detalhe?.data ?? detalhe;
      const numeroRaw = String(d?.phoneNumber || d?.PhoneNumber || d?.phone || d?.number || d?.pn || d?.wa_number || "");
      const numero = numeroRaw.replace(/\D/g, "") || p.numero;
      return {
        jid: p.jid,
        numero,
        nome: p.nome || d?.name || d?.Name || d?.pushName || d?.notify || null,
        foto_url: p.foto_url || d?.imagePreview || d?.image || d?.imgUrl || d?.profilePicUrl || d?.url || null,
        admin: p.admin,
      };
    } catch {
      const { precisaDetalhe: _, ...fallback } = p;
      return fallback;
    }
  }));
  const fotoGrupo = (g?.imgUrl || g?.profilePicUrl || g?.picture || null) as string | null;
  return {
    jid: String(g?.JID || g?.jid || jid),
    nome: (g?.Name || g?.name || g?.subject || null) as string | null,
    foto_url: fotoGrupo || await uazFetchProfilePic(instanceToken, jid),
    participantes: lista.length || (typeof g?.size === "number" ? g.size : null),
    descricao: (g?.Topic || g?.topic || g?.description || g?.desc || null) as string | null,
    criado_em: (g?.GroupCreated || g?.creation || null) as string | null,
    lista,
  };
}
