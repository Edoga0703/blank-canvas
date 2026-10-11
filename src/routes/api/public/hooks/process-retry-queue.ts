import { createFileRoute } from "@tanstack/react-router";
import { assertCronRequest } from "@/lib/cron-auth.server";

const BATCH = 20;
const DELAYS_MS = [30_000, 2 * 60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000];

function nextDelayMs(tentativas: number) {
  return DELAYS_MS[Math.min(tentativas, DELAYS_MS.length - 1)];
}

function isPermanentWablastError(msg: string): boolean {
  const m = (msg || "").toLowerCase();
  return /invalid|not_found|template.*rejected|unsupported|forbidden|blocked|24h|window|no matching|recipient/i.test(m);
}

async function processOne(admin: any, item: any): Promise<{ ok: boolean; erro?: string; waId?: string | null; permanent?: boolean }> {
  const { hasPermanentInstanceIssue } = await import("@/lib/whatsapp-connection");
  const { parseBrPhone, isPermanentSendError } = await import("@/lib/br-phone");
  const { evoSendText, evoSendMedia, evoSendAudio, evoState, evoFetchInstance } = await import("@/lib/evolution.server");

  const rawNumero = String((item as any)?.payload?.numero ?? "");



  const { getInstanceForContact } = await import("@/lib/evolution-helpers");
  const inst = await getInstanceForContact(
    admin,
    item.company_id,
    rawNumero,
    "company_id,instance_name,instance_token,status,updated_at,provider,provider_type,phone_number_id,waba_id",
  );
  if (!inst?.instance_name) return { ok: false, erro: "Sem instância WhatsApp" };
  if (inst.status && !["open", "connected"].includes(String(inst.status).toLowerCase())) {
    return { ok: false, erro: `Instância não conectada (${inst.status})` };
  }

  const provider = String((inst as any).provider || (inst as any).provider_type || "evolution");
  const p = item.payload || {};
  if (p.storageKey && (item.kind === "media" || item.kind === "audio")) {
    const { createR2DownloadUrl } = await import("@/lib/storage/r2.server");
    const freshUrl = createR2DownloadUrl(String(p.storageKey));
    if (item.kind === "media") p.media = freshUrl;
    else p.audio = freshUrl;
  }

  // Valida/normaliza o destino antes de tentar enviar (evita queimar reputação do número).
  // Exceções: provedores Meta (PSID) e contatos WhatsApp com ID oculto (LID) — não são telefones.
  const { isLidNumber } = await import("@/lib/jid");
  const isMetaProvider = /meta|instagram|messenger/i.test(String(provider ?? ""));
  const isLovableProvider = provider === "lovable_whatsapp";
  if (isLovableProvider) {
    const digits = rawNumero.replace(/\D/g, "");
    if (!/^[1-9]\d{7,14}$/.test(digits)) {
      return { ok: false, erro: "Número inválido: use DDI + número, somente dígitos", permanent: true };
    }
    p.numero = digits;
  } else if (!isMetaProvider && !isLidNumber(rawNumero)) {
    const parsed = parseBrPhone(rawNumero);
    if (!parsed.valid) {
      return { ok: false, erro: `Número inválido: ${parsed.reason ?? "formato desconhecido"}`, permanent: true };
    }
    p.numero = parsed.numero;
  }





  if (isLovableProvider) {
    try {
      const { waSendText, waSendMedia, waSendAudio } = await import("@/lib/wa-dispatch.server");
      const waInst = {
        instance_name: inst.instance_name,
        instance_token: null,
        provider: "lovable_whatsapp" as const,
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
      return { ok: true, waId: resp?.id ?? null };
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      return {
        ok: false,
        erro: msg,
        permanent: /invalid|forbidden|blocked|24h|window|template|recipient|não autorizado/i.test(msg),
      };
    }
  }

  // Instagram e Messenger usam a Graph API também nos reintentos. Sem esta
  // ramificação, mensagens Meta caíam no fallback da Evolution API.
  if (isMetaProvider) {
    try {
      const { waSendText, waSendMedia, waSendAudio } = await import("@/lib/wa-dispatch.server");
      const metaProvider = /instagram/i.test(provider) ? "meta_instagram" as const : "meta_messenger" as const;
      const waInst = {
        company_id: item.company_id,
        instance_name: inst.instance_name,
        instance_token: (inst as any).instance_token ?? null,
        provider: metaProvider,
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
      return { ok: true, waId: resp?.key?.id ?? resp?.id ?? resp?.message_id ?? null };
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      return {
        ok: false,
        erro: msg,
        permanent: /24 horas|response window|advanced access|missing permissions|forbidden|403|invalid recipient/i.test(msg),
      };
    }
  }

  // WaBlast (Cloud API): não valida via evoState; usa helpers próprios
  if (provider === "wablast") {
    const apiKey = (inst as any).instance_token as string | null;
    const accountId = (inst as any).waba_id as string | null;
    if (!apiKey) return { ok: false, erro: "API key WaBlast ausente na conexão", permanent: true };
    try {
      const { wablastSendText, wablastSendMedia } = await import("@/lib/wablast.server");
      let resp: any;
      if (item.kind === "text") {
        resp = await wablastSendText(apiKey, accountId, p.numero, p.texto);
      } else if (item.kind === "media" || item.kind === "audio") {
        resp = await wablastSendMedia(apiKey, accountId, p.numero, {
          url: p.media || p.audio,
          type: (item.kind === "audio" ? "audio" : p.mediatype) as any,
          caption: p.caption,
          fileName: p.fileName,
        });
      } else {
        return { ok: false, erro: `Tipo desconhecido: ${item.kind}` };
      }
      return { ok: true, waId: resp?.id ?? resp?.message_id ?? resp?.messages?.[0]?.id ?? null };
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      return { ok: false, erro: msg, permanent: isPermanentWablastError(msg) };
    }
  }

  try {
    const statePayload: any = await evoState(inst.instance_name);
    const state = statePayload?.instance?.state || statePayload?.state || null;
    if (state !== "open") return { ok: false, erro: `Instância WhatsApp não está aberta (${state || "sem estado"})` };
    const instanceDetails = await evoFetchInstance(inst.instance_name).catch(() => null);
    if (hasPermanentInstanceIssue(instanceDetails)) {
      await admin.from("whatsapp_instances").update({ status: "disconnected", last_state_at: new Date().toISOString() } as any).eq("instance_name", inst.instance_name);
      return { ok: false, erro: "Sessão WhatsApp inválida/removida. Reconecte lendo um novo QR Code." };
    }
  } catch (e: any) {
    return { ok: false, erro: e?.message ?? "Falha ao validar conexão" };
  }

  try {
    if (item.kind === "text") {
      const resp: any = await evoSendText(inst.instance_name, p.numero, p.texto, p.quoted ? { quoted: p.quoted } : undefined);
      return { ok: true, waId: resp?.key?.id ?? resp?.messageId ?? resp?.id ?? null };
    }
    if (item.kind === "media") {
      const resp: any = await evoSendMedia(inst.instance_name, p.numero, {
        mediatype: p.mediatype, media: p.media, mimetype: p.mimetype,
        fileName: p.fileName, caption: p.caption,
      });
      return { ok: true, waId: resp?.key?.id ?? resp?.message?.key?.id ?? resp?.messageId ?? resp?.id ?? null };
    }
    if (item.kind === "audio") {
      const resp: any = await evoSendAudio(inst.instance_name, p.numero, p.audio);
      return { ok: true, waId: resp?.key?.id ?? resp?.message?.key?.id ?? resp?.messageId ?? resp?.id ?? null };
    }
    return { ok: false, erro: `Tipo desconhecido: ${item.kind}` };
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    return { ok: false, erro: msg, permanent: isPermanentSendError(msg) };
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
    .limit(20);

  for (const m of stale ?? []) {
    const { data: existing } = await admin
      .from("outbound_queue")
      .select("id")
      .eq("mensagem_id", m.id)
      .limit(1)
      .maybeSingle();
    if (existing) continue;
    const { data: attachment } = await admin
      .from("message_attachments")
      .select("storage_key")
      .eq("mensagem_id", m.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    const built = payloadFromMessage(m, attachment);
    await admin.from("outbound_queue").insert({
      company_id: m.company_id,
      mensagem_id: m.id,
      kind: built.kind,
      payload: built.payload,
      proxima_em: new Date().toISOString(),
      ultimo_erro: "Sem confirmação de entrega da Evolution; reenfileirado automaticamente.",
    } as any);
  }
}

export const Route = createFileRoute("/api/public/hooks/process-retry-queue")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const _cronDeny = assertCronRequest(request);
        if (_cronDeny) return _cronDeny;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        await enqueueStalePendingAcceptedMessages(supabaseAdmin);
        const { data: pendentes, error } = await supabaseAdmin
          .from("outbound_queue")
          .select("id,company_id,mensagem_id,kind,payload,tentativas,max_tentativas")
          .eq("status", "pendente")
          .lte("proxima_em", new Date().toISOString())
          .order("proxima_em", { ascending: true })
          .limit(BATCH);
        if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

        let sucesso = 0, falhas = 0, permanentes = 0;
        for (const item of pendentes ?? []) {
          const r = await processOne(supabaseAdmin, item);
          if (r.ok) {
            await supabaseAdmin.from("outbound_queue").update({ status: "enviado", ultimo_erro: null }).eq("id", item.id);
            if (item.mensagem_id) {
              await supabaseAdmin.from("mensagens").update({
                status_envio: r.waId ? "pendente" : "enviado",
                ...(r.waId ? { whatsapp_message_id: r.waId } : {}),
              } as any).eq("id", item.mensagem_id);
            }
            sucesso++;
          } else {
            const novaTentativa = item.tentativas + 1;
            const isPermanent = !!r.permanent;
            if (isPermanent || novaTentativa >= item.max_tentativas) {
              await supabaseAdmin.from("outbound_queue").update({
                status: "falha", tentativas: novaTentativa, ultimo_erro: r.erro,
              }).eq("id", item.id);
              if (item.mensagem_id) {
                await supabaseAdmin.from("mensagens").update({ status_envio: "falha" } as any).eq("id", item.mensagem_id);
              }
              try {
                const { raiseAlert } = await import("@/lib/alerts.server");
                await raiseAlert({
                  tipo: "envio_falhou",
                  ref: String(item.id),
                  companyId: item.company_id,
                  severidade: "warning",
                  titulo: `Falha definitiva no envio para ${(item as any)?.payload?.numero ?? "número desconhecido"}`,
                  descricao: r.erro || "Erro desconhecido",
                });
              } catch { /* noop */ }
              permanentes++;
            } else {
              const proxima = new Date(Date.now() + nextDelayMs(novaTentativa)).toISOString();
              await supabaseAdmin.from("outbound_queue").update({
                tentativas: novaTentativa, proxima_em: proxima, ultimo_erro: r.erro,
              }).eq("id", item.id);
              falhas++;
            }
          }

        }
        return Response.json({ ok: true, processados: pendentes?.length ?? 0, sucesso, falhas, permanentes });
      },
    },
  },
});
