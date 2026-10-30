import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "node:crypto";

export function generateMediaToken(messageId: string, ttlMs = 86400000): { sig: string; exp: number } {
  const exp = Date.now() + ttlMs;
  const secret = process.env.MEDIA_SIGNING_SECRET?.trim();
  if (!secret) throw new Error("MEDIA_SIGNING_SECRET no configurado");
  const sig = createHmac("sha256", secret).update(`${messageId}:${exp}`).digest("hex");
  return { sig, exp };
}

function verifyMediaToken(messageId: string, sig: string, expStr: string): boolean {
  if (!messageId || !sig || !expStr) return false;
  const exp = parseInt(expStr, 10);
  if (isNaN(exp) || exp < Date.now()) return false;
  const secret = process.env.MEDIA_SIGNING_SECRET?.trim();
  if (!secret) return false;
  const expected = createHmac("sha256", secret).update(`${messageId}:${exp}`).digest("hex");
  if (!/^[a-f0-9]{64}$/i.test(sig)) return false;
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(sig, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

async function proxyStream(
  targetUrl: string,
  req: Request,
  fallbackMime?: string | null,
  downloadName?: string | null
): Promise<Response> {
  const fetchHeaders: Record<string, string> = {};
  const range = req.headers.get("range");
  if (range) {
    fetchHeaders["Range"] = range;
  }

  let upstream = await fetch(targetUrl, { headers: fetchHeaders }).catch(() => null);
  if (!upstream || (!upstream.ok && upstream.status !== 206)) {
    if (range) {
      upstream = await fetch(targetUrl).catch(() => null);
    }
  }

  if (!upstream || (!upstream.ok && upstream.status !== 206)) {
    return new Response("Media upstream error", { status: upstream?.status || 502 });
  }

  let contentType = upstream.headers.get("content-type") || fallbackMime || "application/octet-stream";
  if (targetUrl.endsWith(".ogg") && (!contentType || contentType === "application/octet-stream")) {
    contentType = "audio/ogg; codecs=opus";
  }

  const headers = new Headers();
  headers.set("Content-Type", contentType);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  headers.set("Accept-Ranges", "bytes");
  headers.set("Cache-Control", "public, max-age=86400");

  const contentLength = upstream.headers.get("content-length");
  if (contentLength) headers.set("Content-Length", contentLength);

  const contentRange = upstream.headers.get("content-range");
  if (contentRange) headers.set("Content-Range", contentRange);

  if (downloadName) {
    headers.set("Content-Disposition", `attachment; filename="${encodeURIComponent(downloadName)}"`);
  } else {
    headers.set("Content-Disposition", "inline");
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers,
  });
}

function respondBase64Data(
  dataUri: string,
  fallbackMime?: string | null,
  downloadName?: string | null
): Response {
  const commaIdx = dataUri.indexOf(",");
  if (commaIdx === -1) return new Response("Invalid data URI", { status: 400 });
  const meta = dataUri.slice(0, commaIdx);
  const rawBase64 = dataUri.slice(commaIdx + 1);
  const mimeMatch = meta.match(/data:([^;]+)/);
  const mime = mimeMatch ? mimeMatch[1] : (fallbackMime || "application/octet-stream");
  const buf = Buffer.from(rawBase64, "base64");

  const headers = new Headers();
  headers.set("Content-Type", mime);
  headers.set("Content-Length", String(buf.length));
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Accept-Ranges", "bytes");
  headers.set("Cache-Control", "public, max-age=86400");

  if (downloadName) {
    headers.set("Content-Disposition", `attachment; filename="${encodeURIComponent(downloadName)}"`);
  } else {
    headers.set("Content-Disposition", "inline");
  }

  return new Response(buf, {
    status: 200,
    headers,
  });
}

export const Route = createFileRoute("/api/public/chat-media")({
  server: {
    handlers: {
      OPTIONS: async () => {
        return new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
            "Access-Control-Allow-Headers": "Authorization, Content-Type, Range",
          },
        });
      },
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const messageId = url.searchParams.get("id") || "";
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(messageId);
        if (!isUuid) {
          return new Response("Invalid message id", { status: 400 });
        }

        const isDownload = url.searchParams.get("download") === "1" || url.searchParams.has("download");
        const customFilename = url.searchParams.get("filename") || null;

        const sig = url.searchParams.get("sig") || "";
        const exp = url.searchParams.get("exp") || "";
        const authHeader = request.headers.get("authorization") || "";

        // Blindaje Multi-Tenant (E-02): Requiere token HMAC con expiración corta o Bearer token
        const isHmacValid = verifyMediaToken(messageId, sig, exp);
        let authorizedCompanyId: string | null = null;

        if (!isHmacValid) {
          if (!authHeader.startsWith("Bearer ")) {
            return new Response("Unauthorized", { status: 401 });
          }
          const jwtToken = authHeader.replace("Bearer ", "").trim();
          const { createClient } = await import("@supabase/supabase-js");
          const sbAuth = createClient(
            process.env.SUPABASE_URL || "https://llnfjhqdeeuscyqzoqfz.supabase.co",
            process.env.SUPABASE_PUBLISHABLE_KEY || "sb_publishable_AWtQzPmKl_MS9OWWmSkoZg_-vHK23d5",
          );
          const { data: claimsData, error: claimsErr } = await sbAuth.auth.getClaims(jwtToken);
          const userId = claimsData?.claims?.sub;
          if (claimsErr || !userId) {
            return new Response("Unauthorized", { status: 401 });
          }
          const { resolveCompanyIdCached } = await import("@/lib/company-cache");
          authorizedCompanyId = await resolveCompanyIdCached(sbAuth, userId).catch(() => null);
          if (!authorizedCompanyId) {
            return new Response("Forbidden", { status: 403 });
          }
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // 1) Chequear message_attachments (Cloudflare R2) validando compañía si aplica
        let attQuery = (supabaseAdmin as any)
          .from("message_attachments")
          .select("kind,storage_key,storage_url,provider_url,mime_type,file_name,company_id")
          .eq("mensagem_id", messageId);
        if (authorizedCompanyId) {
          attQuery = attQuery.eq("company_id", authorizedCompanyId);
        }
        const { data: attachment } = await attQuery.order("created_at", { ascending: true }).limit(1).maybeSingle();

        // 2) Chequear tabla mensagens
        let msgQuery = supabaseAdmin
          .from("mensagens")
          .select("id,company_id,numero,provider,midia_url,midia_tipo,midia_mime,midia_nome,whatsapp_message_id,raw_payload")
          .eq("id", messageId);
        if (authorizedCompanyId) {
          msgQuery = msgQuery.eq("company_id", authorizedCompanyId);
        }
        const { data: msg } = await msgQuery.maybeSingle();

        if (!attachment && !msg) {
          return new Response("Not found", { status: 404 });
        }

        const fallbackMime = msg?.midia_mime || attachment?.mime_type || "application/octet-stream";
        const downloadFileName = customFilename || msg?.midia_nome || attachment?.file_name || "archivo";

        // Caso R2 con storage_key
        if (attachment?.storage_key) {
          const { createR2DownloadUrl } = await import("@/lib/storage/r2.server");
          const downloadUrl = createR2DownloadUrl(attachment.storage_key, 3600);
          return proxyStream(downloadUrl, request, fallbackMime, isDownload ? downloadFileName : null);
        }

        // Caso attachment con storage_url
        if (attachment?.storage_url && attachment.storage_url.startsWith("http")) {
          return proxyStream(attachment.storage_url, request, fallbackMime, isDownload ? downloadFileName : null);
        }

        // Caso attachment con provider_url
        if (attachment?.provider_url) {
          if (attachment.provider_url.startsWith("data:")) {
            return respondBase64Data(attachment.provider_url, fallbackMime, isDownload ? downloadFileName : null);
          }
          if (attachment.provider_url.startsWith("http")) {
            return proxyStream(attachment.provider_url, request, fallbackMime, isDownload ? downloadFileName : null);
          }
        }

        // Caso mensagens.raw_payload
        const rawUrl = (msg?.raw_payload as any)?.data?.media_url || (msg?.raw_payload as any)?.data?.media_data?.early_media_url;
        if (rawUrl && typeof rawUrl === "string" && rawUrl.startsWith("http")) {
          return proxyStream(rawUrl, request, fallbackMime, isDownload ? downloadFileName : null);
        }

        // Caso mensagens.midia_url
        if (msg?.midia_url) {
          if (msg.midia_url.startsWith("data:")) {
            return respondBase64Data(msg.midia_url, fallbackMime, isDownload ? downloadFileName : null);
          }
          if (msg.midia_url.startsWith("http")) {
            return proxyStream(msg.midia_url, request, fallbackMime, isDownload ? downloadFileName : null);
          }
        }

        // 3) Intentar descarga directa desde D-API si aún no está guardada (mensajes entrantes)
        if (msg?.whatsapp_message_id && msg?.company_id) {
          try {
            const { data: inst } = await supabaseAdmin
              .from("whatsapp_instances")
              .select("instance_name")
              .eq("company_id", msg.company_id)
              .in("provider", ["dapi", "dapi_official"])
              .order("updated_at", { ascending: false })
              .limit(1)
              .maybeSingle();

            if (inst?.instance_name) {
              const { dapiDownloadMedia } = await import("@/lib/dapi.server");
              const dl = await dapiDownloadMedia(inst.instance_name, String(msg.whatsapp_message_id));
              if (dl?.base64) {
                const rawB64 = dl.base64.includes(",") ? dl.base64.split(",")[1] : dl.base64;
                const buf = Buffer.from(rawB64, "base64");
                const mime = dl.mimetype || msg.midia_mime || "application/octet-stream";

                import("@/lib/storage/r2.server").then(async ({ storeMediaObject }) => {
                  try {
                    const stored = await storeMediaObject({
                      companyId: msg.company_id,
                      bytes: buf,
                      mimeType: mime,
                      fileName: msg.midia_nome || "archivo",
                    });
                    await (supabaseAdmin as any).from("message_attachments").upsert({
                      company_id: msg.company_id,
                      mensagem_id: msg.id,
                      attachment_key: stored.sha256,
                      kind: msg.midia_tipo || (mime.startsWith("image/") ? "image" : "document"),
                      storage_key: stored.storageKey,
                      mime_type: mime,
                      file_name: stored.fileName,
                      size_bytes: stored.sizeBytes,
                      sha256: stored.sha256,
                    });
                  } catch (e) {
                    console.warn("[chat-media] background store error:", e);
                  }
                });

                const headers = new Headers();
                headers.set("Content-Type", mime);
                headers.set("Content-Length", String(buf.length));
                headers.set("Access-Control-Allow-Origin", "*");
                headers.set("Accept-Ranges", "bytes");
                headers.set("Cache-Control", "public, max-age=86400");

                if (isDownload) {
                  headers.set("Content-Disposition", `attachment; filename="${encodeURIComponent(downloadFileName)}"`);
                } else {
                  headers.set("Content-Disposition", "inline");
                }

                return new Response(buf, {
                  status: 200,
                  headers,
                });
              }
            }
          } catch (e) {
            console.warn("[chat-media] D-API fetch error:", e);
          }
        }

        return new Response("Media not found", { status: 404 });
      },
    },
  },
});
