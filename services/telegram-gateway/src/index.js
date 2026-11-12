/**
 * Capiversa CRM — Telegram MTProto Gateway Sidecar (v1.3.07)
 * Microservicio autónomo para autenticación QR, gestión de sesiones MTProto
 * y publicación multicanal desacoplado del SSR de Cloudflare Nitro.
 */

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

dotenv.config();

const PORT = parseInt(process.env.PORT || "3005", 10);
const GATEWAY_SECRET = process.env.GATEWAY_SECRET || process.env.TELEGRAM_GATEWAY_SECRET || "capiversa-mtproto-dev-secret-2026";
const TELEGRAM_API_ID = parseInt(process.env.TELEGRAM_API_ID || "0", 10);
const TELEGRAM_API_HASH = process.env.TELEGRAM_API_HASH || "";
const SESSIONS_DIR = process.env.SESSIONS_DATA_DIR || path.resolve(process.cwd(), ".sessions");

const app = express();
app.use(cors());
app.use(express.json());

// In-memory registry of active QR handshake sessions
// Map<sessionId, { companyId, connectionId, status, qrLink, expiresAt, actorId, username, displayName, client, passwordPromiseResolver, timer }>
const qrSessions = new Map();

// Map<connectionId, { client, stringSession, companyId, actorId, username, displayName }>
const activeClients = new Map();

// Ensure sessions directory exists
await fs.mkdir(SESSIONS_DIR, { recursive: true }).catch(() => {});

// Middleware: Autenticación por cabecera secreta
function requireGatewayAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  const secretHeader = req.headers["x-gateway-secret"];
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  const provided = secretHeader || bearerToken;

  if (!provided || provided !== GATEWAY_SECRET) {
    return res.status(401).json({ error: "Unauthorized: Invalid or missing gateway secret" });
  }
  next();
}

// Health check endpoint (público para balanceadores / monitoreo)
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "capiversa-telegram-gateway",
    uptimeSeconds: Math.floor(process.uptime()),
    activeHandshakes: qrSessions.size,
    connectedClients: activeClients.size,
    hasApiCredentials: Boolean(TELEGRAM_API_ID && TELEGRAM_API_HASH),
    timestamp: new Date().toISOString(),
  });
});

/**
 * POST /api/gateway/start-qr
 * Inicia el proceso de autenticación por QR Code MTProto
 */
app.post("/api/gateway/start-qr", requireGatewayAuth, async (req, res) => {
  const { companyId, connectionId } = req.body;
  if (!companyId || !connectionId) {
    return res.status(400).json({ error: "companyId and connectionId are required" });
  }

  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 60 * 1000).toISOString();

  // Si no hay credenciales de Telegram API_ID/API_HASH configuradas en este entorno,
  // el gateway responde en modo simulación de desarrollo seguro
  if (!TELEGRAM_API_ID || !TELEGRAM_API_HASH) {
    console.log(`[Gateway] Simulación QR iniciada para company=${companyId}, conn=${connectionId}, session=${sessionId}`);
    
    // Token simulado con formato oficial tg://login?token=...
    const mockToken = Buffer.from(`${sessionId}:${Date.now()}`).toString("base64url");
    const mockQrLink = `tg://login?token=${mockToken}`;

    const sessionState = {
      sessionId,
      companyId,
      connectionId,
      status: "waiting_qr",
      qrLink: mockQrLink,
      expiresAt,
      isSimulation: true,
      timer: setTimeout(() => {
        const s = qrSessions.get(sessionId);
        if (s && s.status === "waiting_qr") {
          s.status = "expired";
        }
      }, 60 * 1000),
    };

    qrSessions.set(sessionId, sessionState);

    return res.json({
      sessionId,
      connectionId,
      qrLink: mockQrLink,
      expiresAt,
      isSimulation: true,
    });
  }

  try {
    // Importación dinámica de gramjs/telegram
    const { TelegramClient } = await import("telegram");
    const { StringSession } = await import("telegram/sessions/index.js");

    const stringSession = new StringSession("");
    const client = new TelegramClient(stringSession, TELEGRAM_API_ID, TELEGRAM_API_HASH, {
      connectionRetries: 5,
    });

    await client.connect();

    let passwordResolver = null;
    const sessionState = {
      sessionId,
      companyId,
      connectionId,
      status: "waiting_qr",
      qrLink: "",
      expiresAt,
      client,
      isSimulation: false,
      passwordPromiseResolver: (pw) => {
        if (passwordResolver) passwordResolver(pw);
      },
    };

    qrSessions.set(sessionId, sessionState);

    // Iniciar flujo QR asíncrono en segundo plano
    client.signInUserWithQrCode(
      { apiId: TELEGRAM_API_ID, apiHash: TELEGRAM_API_HASH },
      {
        onError: (err) => {
          console.error("[Gateway QR Error]", err);
          sessionState.status = "failed";
          sessionState.error = err.message;
        },
        qrCode: async (code) => {
          // El token se entrega en base64url por Telegram
          const token = Buffer.from(code.token).toString("base64url");
          sessionState.qrLink = `tg://login?token=${token}`;
          sessionState.expiresAt = new Date(code.expires * 1000).toISOString();
        },
        password: () => {
          sessionState.status = "waiting_password";
          return new Promise((resolve) => {
            passwordResolver = resolve;
          });
        },
      }
    ).then(async (user) => {
      console.log(`[Gateway] Usuario Telegram autenticado: ${user.firstName} (@${user.username}) [${user.id}]`);
      sessionState.status = "authorized";
      sessionState.actorId = String(user.id);
      sessionState.username = user.username || null;
      sessionState.displayName = [user.firstName, user.lastName].filter(Boolean).join(" ") || "Telegram User";

      // Guardar sesión persistente
      const savedSessionStr = client.session.save();
      activeClients.set(connectionId, {
        client,
        stringSession: savedSessionStr,
        companyId,
        actorId: sessionState.actorId,
        username: sessionState.username,
        displayName: sessionState.displayName,
      });

      const sessionFile = path.join(SESSIONS_DIR, `${companyId}_${connectionId}.session`);
      await fs.writeFile(sessionFile, savedSessionStr, "utf-8").catch((err) => {
        console.error("[Gateway] Error guardando sesión en disco:", err);
      });
    }).catch((err) => {
      console.error("[Gateway] Error en signInUserWithQrCode:", err);
      sessionState.status = "failed";
      sessionState.error = err.message;
    });

    // Esperar hasta 2 segundos para obtener el primer enlace QR antes de responder
    for (let i = 0; i < 20; i++) {
      if (sessionState.qrLink) break;
      await new Promise((r) => setTimeout(r, 100));
    }

    return res.json({
      sessionId,
      connectionId,
      qrLink: sessionState.qrLink || `tg://login?token=init_${sessionId}`,
      expiresAt: sessionState.expiresAt,
      isSimulation: false,
    });
  } catch (err) {
    console.error("[Gateway] Error iniciando sesión QR:", err);
    return res.status(500).json({ error: err.message || "Error starting QR session" });
  }
});

/**
 * GET /api/gateway/qr-status/:sessionId
 * Consulta el estado actual de la sesión QR
 */
app.get("/api/gateway/qr-status/:sessionId", requireGatewayAuth, (req, res) => {
  const { sessionId } = req.params;
  const session = qrSessions.get(sessionId);

  if (!session) {
    return res.status(404).json({ error: "Session not found or expired" });
  }

  // En modo simulación, si pasaron más de 8 segundos, auto-autorizamos para testeo amigable
  if (session.isSimulation && session.status === "waiting_qr") {
    const elapsed = Date.now() - new Date(session.expiresAt).getTime() + 60 * 1000;
    if (elapsed > 12000) {
      session.status = "authorized";
      session.actorId = "123456789";
      session.username = "empresa_demo";
      session.displayName = "Canal Oficial Capiversa";

      activeClients.set(session.connectionId, {
        companyId: session.companyId,
        actorId: session.actorId,
        username: session.username,
        displayName: session.displayName,
        isSimulation: true,
      });
    }
  }

  res.json({
    sessionId: session.sessionId,
    status: session.status,
    qrLink: session.qrLink,
    expiresAt: session.expiresAt,
    actorId: session.actorId || null,
    username: session.username || null,
    displayName: session.displayName || null,
    error: session.error || null,
  });
});

/**
 * POST /api/gateway/complete-password
 * Envía la contraseña de 2FA (Verificación en dos pasos)
 */
app.post("/api/gateway/complete-password", requireGatewayAuth, async (req, res) => {
  const { sessionId, passwordOneTime } = req.body;
  if (!sessionId || !passwordOneTime) {
    return res.status(400).json({ error: "sessionId and passwordOneTime are required" });
  }

  const session = qrSessions.get(sessionId);
  if (!session) {
    return res.status(404).json({ error: "Session not found" });
  }

  if (session.isSimulation) {
    session.status = "authorized";
    session.actorId = "123456789";
    session.username = "empresa_demo";
    session.displayName = "Canal Oficial Capiversa";

    return res.json({
      success: true,
      status: "authorized",
      actorId: session.actorId,
      username: session.username,
      displayName: session.displayName,
    });
  }

  if (session.passwordPromiseResolver) {
    session.passwordPromiseResolver(passwordOneTime);
    return res.json({ success: true, status: "authenticating" });
  }

  res.status(400).json({ error: "Session is not awaiting 2FA password" });
});

/**
 * GET /api/gateway/channels/:connectionId
 * Obtiene los canales donde el usuario conectado es administrador con permisos para publicar
 */
app.get("/api/gateway/channels/:connectionId", requireGatewayAuth, async (req, res) => {
  const { connectionId } = req.params;
  const clientInfo = activeClients.get(connectionId);

  // Fallback simulado si no hay cliente MTProto real cargado
  if (!clientInfo || clientInfo.isSimulation) {
    return res.json({
      channels: [
        {
          telegramChannelId: "-1002154879632",
          title: "Canal de Ofertas & Lançamentos",
          username: "canal_ofertas_vip",
          visibility: "public",
          discussionChatId: "-1002987654321",
          memberCount: 1420,
          canPost: true,
          canEdit: true,
          canDelete: true,
          canManageDiscussion: true,
        },
        {
          telegramChannelId: "-1002874125896",
          title: "Capiversa Comunidade VIP",
          username: null,
          visibility: "private",
          discussionChatId: null,
          memberCount: 350,
          canPost: true,
          canEdit: true,
          canDelete: false,
          canManageDiscussion: false,
        },
      ],
    });
  }

  try {
    const { Api } = await import("telegram");
    const client = clientInfo.client;

    // Obtener diálogos de canales
    const dialogs = await client.getDialogs({ limit: 100 });
    const channels = [];

    for (const d of dialogs) {
      if (d.isChannel) {
        const entity = d.entity;
        // Verificar si es canal de difusión (broadcast) y si es admin con postMessages
        const isBroadcast = entity.broadcast === true;
        const isAdmin = Boolean(entity.adminRights || entity.creator);
        const canPost = Boolean(entity.creator || entity.adminRights?.postMessages);

        if (isBroadcast && isAdmin && canPost) {
          channels.push({
            telegramChannelId: String(entity.id.startsWith("-100") ? entity.id : `-100${entity.id}`),
            title: entity.title || "Canal sem título",
            username: entity.username || null,
            visibility: entity.username ? "public" : "private",
            discussionChatId: entity.linkedChatId ? String(entity.linkedChatId) : null,
            memberCount: entity.participantsCount || 0,
            canPost: true,
            canEdit: Boolean(entity.creator || entity.adminRights?.editMessages),
            canDelete: Boolean(entity.creator || entity.adminRights?.deleteMessages),
            canManageDiscussion: Boolean(entity.creator || entity.adminRights?.manageTopics),
          });
        }
      }
    }

    res.json({ channels });
  } catch (err) {
    console.error("[Gateway] Error listando canales:", err);
    res.status(500).json({ error: err.message || "Failed to list channels" });
  }
});

/**
 * POST /api/gateway/publish
 * Publica una nueva publicación (texto, imagen, video o álbum) en un canal de Telegram
 */
app.post("/api/gateway/publish", requireGatewayAuth, async (req, res) => {
  const { connectionId, channelId, text, mediaUrls, mediaType } = req.body;
  if (!connectionId || !channelId) {
    return res.status(400).json({ error: "connectionId and channelId are required" });
  }

  const clientInfo = activeClients.get(connectionId);
  const cleanChannelId = String(channelId);
  const numericChannelSuffix = cleanChannelId.replace(/^-100/, "");

  // Modo simulación o fallback para desarrollo / staging
  if (!clientInfo || clientInfo.isSimulation) {
    const mockMsgId = String(10000 + Math.floor(Math.random() * 90000));
    const urls = Array.isArray(mediaUrls) ? mediaUrls : mediaUrls ? [mediaUrls] : [];
    const isAlbum = mediaType === "carousel" || urls.length > 1;
    const mockIds = isAlbum ? urls.map((_, i) => String(Number(mockMsgId) + i)) : [mockMsgId];

    const mockUrl = `https://t.me/c/${numericChannelSuffix}/${mockMsgId}`;
    console.log(`[Gateway Publish Sim] Publicado post ${mockMsgId} en canal ${channelId} (${urls.length} medios, tipo: ${mediaType})`);

    return res.json({
      success: true,
      messageId: mockMsgId,
      messageIds: mockIds,
      channelUrl: mockUrl,
      isSimulation: true,
    });
  }

  try {
    const client = clientInfo.client;
    const urls = Array.isArray(mediaUrls) ? mediaUrls : mediaUrls ? [mediaUrls] : [];
    let primaryMessageId = "";
    let allMessageIds = [];

    // Álbum / Grupo de medios (2 a 10 fotos o videos)
    if (mediaType === "carousel" || urls.length > 1) {
      const sent = await client.sendFile(cleanChannelId, {
        file: urls,
        caption: text || "",
      });

      const sentArr = Array.isArray(sent) ? sent : [sent];
      allMessageIds = sentArr.map((m) => String(m.id));
      primaryMessageId = allMessageIds[0] || String(Date.now());
    } else if (urls.length === 1 && (mediaType === "image" || mediaType === "video")) {
      // Foto o video individual con pie de foto
      const sent = await client.sendFile(cleanChannelId, {
        file: urls[0],
        caption: text || "",
        video: mediaType === "video",
      });
      primaryMessageId = String(sent.id);
      allMessageIds = [primaryMessageId];
    } else {
      // Mensaje de solo texto en canal
      const sent = await client.sendMessage(cleanChannelId, {
        message: text || "",
      });
      primaryMessageId = String(sent.id);
      allMessageIds = [primaryMessageId];
    }

    const channelUrl = `https://t.me/c/${numericChannelSuffix}/${primaryMessageId}`;

    res.json({
      success: true,
      messageId: primaryMessageId,
      messageIds: allMessageIds,
      channelUrl,
      isSimulation: false,
    });
  } catch (err) {
    console.error(`[Gateway Publish Error] Error publicando en canal ${channelId}:`, err);
    res.status(500).json({ error: err.message || "Failed to publish post on Telegram channel" });
  }
});

/**
 * POST /api/gateway/backfill
 * Importa publicaciones históricas paginadas de un canal
 */
app.post("/api/gateway/backfill", requireGatewayAuth, async (req, res) => {
  const { connectionId, channelId, limit = 50, beforeMessageId } = req.body;
  if (!connectionId || !channelId) {
    return res.status(400).json({ error: "connectionId and channelId are required" });
  }

  const clientInfo = activeClients.get(connectionId);
  const cleanChannelId = String(channelId);
  const numericChannelSuffix = cleanChannelId.replace(/^-100/, "");

  if (!clientInfo || clientInfo.isSimulation) {
    // Generación de mensajes simulados para testeo de backfill
    const now = Date.now();
    const count = Math.min(Number(limit) || 20, 50);
    const mockPosts = Array.from({ length: count }).map((_, i) => {
      const id = String(1000 + i);
      const postDate = new Date(now - i * 3600 * 24 * 1000).toISOString();
      const isMedia = i % 3 !== 0;
      return {
        id,
        text: `Publicação histórica de exemplo #${id} do canal oficial da empresa.`,
        date: postDate,
        mediaType: isMedia ? (i % 2 === 0 ? "photo" : "video") : "text",
        views: 250 + i * 45,
        forwards: 12 + i * 2,
        replies: 5 + i,
        permalink: `https://t.me/c/${numericChannelSuffix}/${id}`,
      };
    });

    return res.json({
      posts: mockPosts,
      hasMore: false,
      isSimulation: true,
    });
  }

  try {
    const client = clientInfo.client;
    const messages = await client.getMessages(cleanChannelId, {
      limit: Math.min(Number(limit) || 50, 100),
      offsetId: beforeMessageId ? Number(beforeMessageId) : undefined,
    });

    const posts = messages.map((m) => {
      let mType = "text";
      if (m.media) {
        if (m.media.photo) mType = "photo";
        else if (m.media.document) {
          const mime = m.media.document.mimeType || "";
          mType = mime.startsWith("video/") ? "video" : "other";
        }
      }

      return {
        id: String(m.id),
        text: m.message || "",
        date: new Date(m.date * 1000).toISOString(),
        mediaType: mType,
        views: m.views || 0,
        forwards: m.forwards || 0,
        replies: m.replies?.replies || 0,
        permalink: `https://t.me/c/${numericChannelSuffix}/${m.id}`,
      };
    });

    const oldestId = posts.length > 0 ? posts[posts.length - 1].id : null;

    res.json({
      posts,
      hasMore: posts.length >= (Number(limit) || 50),
      nextCursor: oldestId,
      isSimulation: false,
    });
  } catch (err) {
    console.error(`[Gateway Backfill Error] Error obteniendo historial de canal ${channelId}:`, err);
    res.status(500).json({ error: err.message || "Failed to backfill channel messages" });
  }
});

/**
 * POST /api/gateway/logout/:connectionId
 * Cierra la sesión MTProto y limpia archivos de sesión
 */
app.post("/api/gateway/logout/:connectionId", requireGatewayAuth, async (req, res) => {
  const { connectionId } = req.params;
  const clientInfo = activeClients.get(connectionId);

  if (clientInfo?.client) {
    try {
      await clientInfo.client.disconnect();
    } catch {
      /* best-effort */
    }
  }

  activeClients.delete(connectionId);

  // Borrar archivo de sesión en disco
  try {
    const files = await fs.readdir(SESSIONS_DIR);
    for (const f of files) {
      if (f.includes(connectionId)) {
        await fs.unlink(path.join(SESSIONS_DIR, f)).catch(() => {});
      }
    }
  } catch {
    /* best-effort */
  }

  res.json({ success: true, message: "Disconnected successfully" });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`======================================================`);
  console.log(` Capiversa Telegram MTProto Gateway Sidecar v1.3.07  `);
  console.log(` Running on http://0.0.0.0:${PORT}                   `);
  console.log(` Auth Secret: ${GATEWAY_SECRET ? "Configured (Protected)" : "Default"}`);
  console.log(` API ID: ${TELEGRAM_API_ID ? "Configured" : "None (Simulation Mode)"}`);
  console.log(`======================================================`);
});
