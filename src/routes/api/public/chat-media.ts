import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/chat-media")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const messageId = url.searchParams.get("id") || "";
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(messageId);
        if (!isUuid) {
          return new Response("Invalid message id", { status: 400 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // 1) Chequear message_attachments (Cloudflare R2)
        const { data: attachment } = await (supabaseAdmin as any)
          .from("message_attachments")
          .select("kind,storage_key,storage_url,provider_url,mime_type")
          .eq("mensagem_id", messageId)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();

        if (attachment?.storage_key) {
          const { createR2DownloadUrl } = await import("@/lib/storage/r2.server");
          const downloadUrl = createR2DownloadUrl(attachment.storage_key, 3600);
          return new Response(null, {
            status: 302,
            headers: {
              Location: downloadUrl,
              "Cache-Control": "public, max-age=1800",
            },
          });
        }

        if (attachment?.storage_url && attachment.storage_url.startsWith("http")) {
          return new Response(null, {
            status: 302,
            headers: {
              Location: attachment.storage_url,
              "Cache-Control": "public, max-age=3600",
            },
          });
        }

        if (attachment?.provider_url && attachment.provider_url.startsWith("http")) {
          return new Response(null, {
            status: 302,
            headers: {
              Location: attachment.provider_url,
              "Cache-Control": "public, max-age=3600",
            },
          });
        }

        // 2) Chequear tabla mensagens
        const { data: msg } = await supabaseAdmin
          .from("mensagens")
          .select("id,company_id,numero,provider,midia_url,midia_tipo,midia_mime,midia_nome,whatsapp_message_id,raw_payload")
          .eq("id", messageId)
          .maybeSingle();

        if (!msg) {
          return new Response("Not found", { status: 404 });
        }

        const rawUrl = (msg.raw_payload as any)?.data?.media_url || (msg.raw_payload as any)?.data?.media_data?.early_media_url;
        if (rawUrl && typeof rawUrl === "string" && rawUrl.startsWith("http")) {
          return new Response(null, {
            status: 302,
            headers: {
              Location: rawUrl,
              "Cache-Control": "public, max-age=86400",
            },
          });
        }

        if (msg.midia_url && msg.midia_url.startsWith("http")) {
          return new Response(null, {
            status: 302,
            headers: {
              Location: msg.midia_url,
              "Cache-Control": "public, max-age=3600",
            },
          });
        }

        // 3) Intentar descarga directa desde D-API si aún no está guardada
        if (msg.whatsapp_message_id && msg.company_id) {
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

                // Guardar en R2 en background para próximas lecturas
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

                return new Response(buf, {
                  status: 200,
                  headers: {
                    "Content-Type": mime,
                    "Content-Length": String(buf.length),
                    "Cache-Control": "public, max-age=86400",
                  },
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
