import { createFileRoute } from "@tanstack/react-router";
import { assertCronRequest } from "@/lib/cron-auth.server";

const BATCH = 20;
const DELAYS_MS = [30_000, 2 * 60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000];

function nextDelayMs(tentativas: number) {
  return DELAYS_MS[Math.min(tentativas, DELAYS_MS.length - 1)];
}

async function processOne(admin: any, item: any): Promise<{ ok: boolean; erro?: string; waId?: string | null; permanent?: boolean }> {
  const rawNumero = String((item as any)?.payload?.numero ?? "");

  const { getInstanceForContact } = await import("@/lib/evolution-helpers");
  const inst = await getInstanceForContact(
    admin,
    item.company_id,
    rawNumero,
    "company_id,instance_name,instance_token,status,updated_at,provider,provider_type,phone_number_id,waba_id",
  );
  if (!inst?.instance_name) return { ok: false, erro: "Sem conexão ativa" };
  if (inst.status && !["open", "connected"].includes(String(inst.status).toLowerCase())) {
    return { ok: false, erro: `Conexão não conectada (${inst.status})` };
  }

  const provider = String((inst as any).provider || (inst as any).provider_type || "dapi");
  const p = item.payload || {};
  if (p.storageKey && (item.kind === "media" || item.kind === "audio")) {
    const { createR2DownloadUrl } = await import("@/lib/storage/r2.server");
    const freshUrl = createR2DownloadUrl(String(p.storageKey));
    if (item.kind === "media") p.media = freshUrl;
    else p.audio = freshUrl;
  }

  const isMetaProvider = /meta|instagram|messenger/i.test(provider);
  const isTelegram = provider === "telegram";

  if (!isMetaProvider && !isTelegram) {
    const { normalizeBrPhone } = await import("@/lib/br-phone");
    const digits = (normalizeBrPhone(rawNumero) || rawNumero).replace(/\D/g, "");
    if (!/^[1-9]\d{7,14}$/.test(digits)) {
      return { ok: false, erro: "Número inválido: use DDI + número, somente dígitos", permanent: true };
    }
    p.numero = digits;
  }

  try {
    const { waSendText, waSendMedia, waSendAudio } = await import("@/lib/wa-dispatch.server");
    const effectiveProvider = isMetaProvider
      ? (/instagram/i.test(provider) ? ("meta_instagram" as const) : ("meta_messenger" as const))
      : isTelegram
        ? ("telegram" as const)
        : provider === "dapi_official"
          ? ("dapi_official" as const)
          : ("dapi" as const);

    const waInst = {
      company_id: item.company_id,
      instance_name: inst.instance_name,
      instance_token: (inst as any).instance_token ?? null,
      provider: effectiveProvider,
      status: inst.status,
      paused: false,
    };
    let resp: any;
    if (item.kind === "text") {
      resp = await waSendText(waInst, p.numero, p.texto, {
        replyToExternalMessageId: p.quoted?.key?.id ?? null,
      });
    } else if (item.kind === "media") {
      resp = await waSendMedia(waInst, p.numero, {
        type: p.mediatype,
        url: p.media,
        mime: p.mimetype,
        fileName: p.fileName,
        caption: p.caption,
      });
    } else if (item.kind === "audio") {
      resp = await waSendAudio(waInst, p.numero, p.audio);
    } else {
      return { ok: false, erro: `Tipo desconhecido: ${item.kind}`, permanent: true };
    }
    return { ok: true, waId: resp?.key?.id ?? resp?.id ?? resp?.messageId ?? resp?.message_id ?? null };
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    return {
      ok: false,
      erro: msg,
      permanent: /invalid|forbidden|blocked|24h|24 horas|response window|advanced access|missing permissions|403|template|recipient|não autorizado/i.test(msg),
    };
  }
}

function payloadFromMessage(m: any, attachment?: any) {
  const storageKey = attachment?.storage_key ?? null;
  if (m.midia_tipo === "audio" && (m.midia_url || storageKey)) return { kind: "audio", payload: { numero: m.numero, audio: m.midia_url, storageKey } };
  if (["image", "video", "document"].includes(m.midia_tipo) && (m.midia_url || storageKey)) {
    return {
      kind: "media",
      payload: {
        numero: m.numero,
        mediatype: m.midia_tipo,
        media: m.midia_url,
        mimetype: m.midia_mime || "application/octet-stream",
        fileName: m.midia_nome || undefined,
        caption: m.texto || undefined,
        storageKey,
      },
    };
  }
  return { kind: "text", payload: { numero: m.numero, texto: m.texto } };
}

async function enqueueStalePendingAcceptedMessages(admin: any) {
  const cutoff = new Date(Date.now() - 2 * 60_000).toISOString();
  const { data: stale } = await admin
    .from("mensagens")
    .select("id,company_id,numero,texto,midia_tipo,midia_url,midia_mime,midia_nome")
    .eq("direcao", "saida")
    .eq("status_envio", "pendente")
    .not("whatsapp_message_id", "is", null)
    .lt("created_at", cutoff)
    .order("created_at", { ascending: true })
    .limit(50);

  if (!stale?.length) return 0;

  const { data: existingQueue } = await admin
    .from("outbound_queue")
    .select("mensagem_id")
    .in("mensagem_id", stale.map((m: any) => m.id));
  const queuedIds = new Set((existingQueue ?? []).map((row: any) => row.mensagem_id).filter(Boolean));
  const candidates = stale.filter((m: any) => !queuedIds.has(m.id));
  if (!candidates.length) return 0;

  const { data: attachments } = await admin
    .from("message_attachments")
    .select("mensagem_id,storage_key")
    .in("mensagem_id", candidates.map((m: any) => m.id));
  const attachmentByMessage = new Map<string, any>();
  for (const attachment of attachments ?? []) {
    if (attachment?.mensagem_id && !attachmentByMessage.has(attachment.mensagem_id)) {
      attachmentByMessage.set(attachment.mensagem_id, attachment);
    }
  }

  let enqueued = 0;
  for (const m of candidates) {
    const built = payloadFromMessage(m, attachmentByMessage.get(m.id));
    await admin
      .from("mensagens")
      .update({ whatsapp_message_id: null })
      .eq("id", m.id);
    const { error } = await admin.from("outbound_queue").insert({
      company_id: m.company_id,
      mensagem_id: m.id,
      kind: built.kind,
      payload: built.payload,
      status: "pendente",
      tentativas: 0,
      max_tentativas: 5,
      proxima_em: new Date().toISOString(),
      ultimo_erro: "Mensagem aceita sem confirmação de entrega após 2 minutos; reenfileirada automaticamente.",
    });
    if (!error) enqueued++;
  }
  return enqueued;
}

export const Route = createFileRoute("/api/public/hooks/process-retry-queue")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const _cronDeny = assertCronRequest(request);
        if (_cronDeny) return _cronDeny;
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const admin = supabaseAdmin as any;
          const staleRequeued = await enqueueStalePendingAcceptedMessages(admin);
          const nowIso = new Date().toISOString();

          const { data: items } = await admin
            .from("outbound_queue")
            .select("*")
            .in("status", ["pendente", "processando"])
            .lte("proxima_em", nowIso)
            .order("proxima_em", { ascending: true })
            .limit(BATCH);

          let sent = 0, failed = 0, requeued = 0;
          for (const item of items ?? []) {
            await admin.from("outbound_queue").update({ status: "processando", updated_at: new Date().toISOString() }).eq("id", item.id);
            const res = await processOne(admin, item);
            if (res.ok) {
              sent++;
              await admin.from("outbound_queue").update({
                status: "enviado", ultimo_erro: null, updated_at: new Date().toISOString(),
              }).eq("id", item.id);
              if (item.mensagem_id) {
                await admin.from("mensagens").update({
                  status_envio: "enviado",
                  ...(res.waId ? { whatsapp_message_id: res.waId } : {}),
                }).eq("id", item.mensagem_id);
              }
            } else {
              const novasTentativas = (item.tentativas ?? 0) + 1;
              const esgotou = res.permanent || novasTentativas >= (item.max_tentativas ?? 5);
              if (esgotou) {
                failed++;
                await admin.from("outbound_queue").update({
                  status: "falha", tentativas: novasTentativas, ultimo_erro: res.erro ?? "Falha",
                  updated_at: new Date().toISOString(),
                }).eq("id", item.id);
                if (item.mensagem_id) {
                  await admin.from("mensagens").update({ status_envio: "falha" }).eq("id", item.mensagem_id);
                }
              } else {
                requeued++;
                const next = new Date(Date.now() + nextDelayMs(novasTentativas)).toISOString();
                await admin.from("outbound_queue").update({
                  status: "pendente", tentativas: novasTentativas, proxima_em: next,
                  ultimo_erro: res.erro ?? "Erro transitório", updated_at: new Date().toISOString(),
                }).eq("id", item.id);
              }
            }
          }

          return Response.json({ ok: true, staleRequeued, processed: (items ?? []).length, sent, requeued, failed });
        } catch (e: any) {
          console.error("[process-retry-queue]", e?.message);
          return Response.json({ ok: false, error: e?.message }, { status: 500 });
        }
      },
      GET: async () => Response.json({ ok: true, hint: "POST para executar" }),
    },
  },
});
