import { normalizePhone } from "./br-phone";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  sortInstances, getInstanceForContact,
  buildWebhookUrl, extractWhatsappMessageId,
  assertNotSendingToOwnConnectedNumber, isPermanentMetaSendError,
  resolveCompanyId,
} from "./evolution-helpers";

export { resolveCompanyId };

const LEGACY_WA_PROVIDERS = new Set(["evolution", "uazapi", "wablast", "lovable_whatsapp"]);
const ALLOWED_INSTANCE_PROVIDERS = new Set([
  "dapi",
  "dapi_official",
  "meta_instagram",
  "meta_messenger",
  "telegram",
]);

export const connectWhatsapp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d?: { instanceName?: string | null; createNew?: boolean; displayName?: string | null; provider?: string | null; phone?: string | null }) => {
    const phone = normalizePhone(d?.phone || "");
    return {
      instanceName: d?.instanceName?.trim() || null,
      createNew: !!d?.createNew,
      displayName: (d?.displayName || "").toString().trim().slice(0, 60) || null,
      phone: phone.length >= 9 ? phone : null,
    };
  })
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const companyId = await resolveCompanyId(supabase, userId);

    if (data.createNew) {
      const { assertWithinLimit } = await import("./plan-limits.server");
      await assertWithinLimit(companyId, "instancias");
    }

    const { supabaseAdmin: sbAdminTok } = await import("@/integrations/supabase/client.server");
    const { dapiCreateSession, dapiGetQr, dapiGetPairingCode, dapiSetWebhookConfig } = await import("./dapi.server");

    const existingQuery = (sbAdminTok as any)
      .from("whatsapp_instances")
      .select("id, instance_name, status, numero, webhook_token, provider")
      .eq("company_id", companyId)
      .eq("provider", "dapi");

    const { data: dRows } = await (data.instanceName
      ? existingQuery.eq("instance_name", data.instanceName).limit(1)
      : existingQuery.order("updated_at", { ascending: false }));

    const existing = data.createNew ? null : (dRows?.[0] ?? null);
    const instanceName = existing?.instance_name || `dapi_${companyId.replace(/-/g, "").slice(0, 8)}_${crypto.randomUUID().slice(0, 4)}`;
    const webhookToken = existing?.webhook_token || crypto.randomUUID();
    const webhookUrl = buildWebhookUrl(webhookToken, "dapi");

    let qrBase64: string | null = null;
    let pairingCode: string | null = null;

    try {
      if (existing && !data.createNew) {
        dapiSetWebhookConfig(instanceName, webhookUrl).catch(() => null);
      }

      if (!existing || data.createNew) {
        const createRes = await dapiCreateSession({
          sessionId: instanceName,
          type: "unofficial",
          connectionMode: data.phone ? "pair" : "qr",
          webhookUrl,
          phoneNumber: data.phone || undefined,
          pairPhone: data.phone || undefined,
        });
        qrBase64 = createRes.qrcode || null;
      }

      if (data.phone) {
        const pairRes = await dapiGetPairingCode(instanceName, data.phone);
        pairingCode = pairRes.code || null;
      } else if (!qrBase64) {
        const qrRes = await dapiGetQr(instanceName);
        qrBase64 = qrRes.qrcode || null;
      }
    } catch (dErr: any) {
      console.warn("[dapi.connectWhatsapp] Erro na sessão D-API:", dErr?.message);
    }

    await (sbAdminTok as any).from("whatsapp_instances").upsert(
      {
        company_id: companyId,
        user_id: userId,
        instance_name: instanceName,
        display_name: data.displayName || "WhatsApp D-API",
        status: "connecting",
        webhook_token: webhookToken,
        provider: "dapi",
        provider_type: "dapi",
        last_state_at: new Date().toISOString(),
      },
      { onConflict: "instance_name" },
    );

    return {
      instanceName,
      qrBase64,
      code: null,
      pairingCode,
      state: "connecting",
      webhookUrl,
    };
  });

export const checkWhatsappStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d?: { instanceName?: string | null }) => ({ instanceName: d?.instanceName?.trim() || null }))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    let companyId: string;
    try {
      companyId = await resolveCompanyId(supabase, userId);
    } catch {
      return { status: "disconnected", state: null, numero: null, qrBase64: null, code: null };
    }

    const { supabaseAdmin: sbAdminTok } = await import("@/integrations/supabase/client.server");
    const query = (sbAdminTok as any)
      .from("whatsapp_instances")
      .select("instance_name,status,numero,webhook_token,webhook_configured_at,last_state_at,provider")
      .eq("company_id", companyId)
      .in("provider", ["dapi", "dapi_official"]);
    const { data: rows } = await (data.instanceName
      ? query.eq("instance_name", data.instanceName).limit(1)
      : query.order("updated_at", { ascending: false }));
    const row = sortInstances(rows ?? [])[0] ?? null;
    if (!row) return { status: "disconnected", state: null, numero: null, qrBase64: null, code: null };

    const { dapiGetStatus, dapiGetQr } = await import("./dapi.server");
    const dStatus = await dapiGetStatus(row.instance_name);
    let currentQr = dStatus.qrcode || null;
    if (dStatus.status === "connecting" && !currentQr && row.provider === "dapi") {
      const qrRes = await dapiGetQr(row.instance_name);
      currentQr = qrRes.qrcode || null;
    }
    if (dStatus.status === "connected" && row.status !== "connected") {
      await (sbAdminTok as any)
        .from("whatsapp_instances")
        .update({
          status: "connected",
          numero: dStatus.numero || row.numero,
          last_state_at: new Date().toISOString(),
        })
        .eq("instance_name", row.instance_name);
    }
    return {
      status: dStatus.status || row.status || "disconnected",
      state: dStatus.status,
      numero: dStatus.numero || row.numero || null,
      qrBase64: dStatus.status === "connecting" ? currentQr : null,
      code: null,
    };
  });

export const listWhatsappInstances = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const companyId = await resolveCompanyId(supabase, userId);
    const { supabaseAdmin: sbAdminTok } = await import("@/integrations/supabase/client.server");

    const { data } = await (sbAdminTok as any)
      .from("whatsapp_instances")
      .select("id,instance_name,display_name,status,numero,updated_at,paused,provider,provider_type")
      .eq("company_id", companyId)
      .order("updated_at", { ascending: false });

    const allRows = (data ?? []) as any[];
    const legacyIds: string[] = [];
    const validInstances: any[] = [];

    for (const instance of allRows) {
      const prov = String(instance.provider || instance.provider_type || "").toLowerCase();
      if (LEGACY_WA_PROVIDERS.has(prov) || !ALLOWED_INSTANCE_PROVIDERS.has(prov)) {
        if (instance.id) legacyIds.push(instance.id);
        continue;
      }
      validInstances.push({
        ...instance,
        provider: prov,
        provider_type: prov,
      });
    }

    // Purga automática en caliente de cualquier conexión legada de WhatsApp (Evolution, Uazapi, WaBlast, Lovable)
    if (legacyIds.length > 0) {
      await (sbAdminTok as any)
        .from("company_user_instance")
        .delete()
        .eq("company_id", companyId)
        .in("instance_id", legacyIds)
        .catch(() => null);
      await (sbAdminTok as any)
        .from("whatsapp_instances")
        .delete()
        .eq("company_id", companyId)
        .in("id", legacyIds)
        .catch(() => null);
    }

    return { instances: sortInstances(validInstances) };
  });

export const setWhatsappPaused = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { instanceName?: string | null; paused: boolean }) => ({
    instanceName: d?.instanceName?.trim() || null,
    paused: !!d.paused,
  }))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const companyId = await resolveCompanyId(supabase, userId);
    const q = supabase
      .from("whatsapp_instances")
      .select("instance_name")
      .eq("company_id", companyId);
    const { data: rows } = await (data.instanceName
      ? q.eq("instance_name", data.instanceName).limit(1)
      : q.order("updated_at", { ascending: false }).limit(1));
    const row = (rows ?? [])[0] ?? null;
    if (!row?.instance_name) throw new Error("Instância não encontrada");
    await (supabase as any)
      .from("whatsapp_instances")
      .update({ paused: data.paused })
      .eq("instance_name", row.instance_name);
    return { ok: true, paused: data.paused, instanceName: row.instance_name };
  });

export const reconfigureWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d?: { instanceName?: string | null }) => ({ instanceName: d?.instanceName?.trim() || null }))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const companyId = await resolveCompanyId(supabase, userId);
    const { supabaseAdmin: sbAdminTok } = await import("@/integrations/supabase/client.server");
    let q = (sbAdminTok as any)
      .from("whatsapp_instances")
      .select("instance_name,webhook_token,provider,provider_type")
      .eq("company_id", companyId)
      .in("provider", ["dapi", "dapi_official"]);
    if (data?.instanceName) {
      q = q.eq("instance_name", data.instanceName);
    } else {
      q = q.eq("status", "connected");
    }
    const { data: row } = await q.order("updated_at", { ascending: false }).limit(1).maybeSingle();
    if (!row?.instance_name || !row?.webhook_token) {
      throw new Error("Instância D-API não encontrada.");
    }
    const webhookUrl = buildWebhookUrl(row.webhook_token, "dapi");

    const { dapiSetWebhookConfig, dapiGetStatus, dapiRestartSession } = await import("./dapi.server");
    await dapiSetWebhookConfig(row.instance_name, webhookUrl);
    if (row.provider === "dapi") {
      const st = await dapiGetStatus(row.instance_name);
      if (st.status === "disconnected") {
        await dapiRestartSession(row.instance_name).catch(() => null);
      }
    }
    await (sbAdminTok as any)
      .from("whatsapp_instances")
      .update({
        webhook_configured_at: new Date().toISOString(),
        last_state_at: new Date().toISOString(),
      } as any)
      .eq("instance_name", row.instance_name);
    return { ok: true, webhookUrl };
  });

export const disconnectWhatsapp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d?: { instanceName?: string | null }) => ({ instanceName: d?.instanceName?.trim() || null }))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const companyId = await resolveCompanyId(supabase, userId);
    const { supabaseAdmin: sbAdminTok } = await import("@/integrations/supabase/client.server");
    const q = (sbAdminTok as any)
      .from("whatsapp_instances")
      .select("instance_name,provider,provider_type")
      .eq("company_id", companyId);
    const { data: rows } = await (data.instanceName
      ? q.eq("instance_name", data.instanceName).limit(1)
      : q.order("updated_at", { ascending: false }).limit(1));
    const row = (rows ?? [])[0] ?? null;
    if (row?.instance_name) {
      const { dapiDeleteSession } = await import("./dapi.server");
      try { await dapiDeleteSession(row.instance_name); } catch (e) { console.warn("[dapi.disconnect]", e); }
      await (sbAdminTok as any)
        .from("whatsapp_instances")
        .update({ status: "disconnected", last_state_at: new Date().toISOString() })
        .eq("company_id", companyId)
        .eq("instance_name", row.instance_name);
    }
    return { ok: true };
  });

export const deleteWhatsapp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d?: { instanceName?: string | null }) => ({ instanceName: d?.instanceName?.trim() || null }))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const companyId = await resolveCompanyId(supabase, userId);
    const { supabaseAdmin: sbAdminTok } = await import("@/integrations/supabase/client.server");
    const q = (sbAdminTok as any)
      .from("whatsapp_instances")
      .select("id,instance_name,provider,provider_type")
      .eq("company_id", companyId);
    const { data: row } = await (data.instanceName
      ? q.eq("instance_name", data.instanceName).limit(1)
      : q.order("updated_at", { ascending: false }).limit(1))
      .maybeSingle();
    if (row?.instance_name) {
      const prov = String(row.provider || row.provider_type || "dapi");
      if (prov === "dapi" || prov === "dapi_official" || String(row.instance_name).startsWith("dapi_")) {
        const { dapiDeleteSession } = await import("./dapi.server");
        try { await dapiDeleteSession(row.instance_name); } catch (e) { console.warn("[dapi.delete]", e); }
      }
      if (row.id) {
        await (sbAdminTok as any)
          .from("company_user_instance")
          .delete()
          .eq("company_id", companyId)
          .eq("instance_id", row.id)
          .catch(() => null);
      }
      await (sbAdminTok as any)
        .from("whatsapp_instances")
        .delete()
        .eq("company_id", companyId)
        .eq("instance_name", row.instance_name);
    }
    return { ok: true };
  });

export const getWhatsappProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: roleRow } = await (supabase as any)
      .from("user_roles").select("role").eq("user_id", userId).eq("role", "super_admin").maybeSingle();
    return {
      provider: "dapi" as const,
      canChange: !!roleRow,
    };
  });

export const setWhatsappProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((_d: { provider?: string }) => ({ provider: "dapi" as const }))
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const companyId = await resolveCompanyId(supabase, userId);
    await (supabase as any).from("company").update({ wa_provider: "dapi" }).eq("id", companyId);
    const { invalidateCompanyCache } = await import("./company-cache");
    try { invalidateCompanyCache?.(companyId); } catch {}
    return { ok: true, provider: "dapi" as const };
  });

export const sendWhatsappText = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { numero: string; texto: string; contatoNome?: string | null; replyToMessageId?: string | null }) => d)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const companyId = await resolveCompanyId(supabase, userId);
    await (await import("./billing/access.server")).assertCompanyCanWrite(companyId);
    const { supabaseAdmin: sbAdmin } = await import("@/integrations/supabase/client.server");
    const inst = await getInstanceForContact(sbAdmin, companyId, data.numero, "id,instance_name,status,numero,provider,instance_token", userId);
    {
      const { canonicalOutboundNumero } = await import("./phone-thread.server");
      const canon = await canonicalOutboundNumero(sbAdmin, companyId, data.numero, inst as any);
      if (canon && canon !== data.numero) {
        data = { ...data, numero: canon };
      }
    }
    if (!inst?.instance_name) throw new Error("Conexão não disponível para este contato");

    assertNotSendingToOwnConnectedNumber(data.numero, inst);

    {
      const { assinaturaPrefixo, comAssinatura } = await import("./user-scope");
      const prefixo = await assinaturaPrefixo(supabase, userId);
      if (prefixo) data = { ...data, texto: comAssinatura(prefixo, data.texto) };
    }

    const { data: recentOutbound } = await supabase
      .from("mensagens")
      .select("id")
      .eq("company_id", companyId)
      .eq("numero", data.numero)
      .eq("direcao", "saida")
      .eq("autor", "humano")
      .gte("created_at", new Date(Date.now() - 60_000).toISOString())
      .limit(21);
    if ((recentOutbound?.length ?? 0) >= 20) {
      throw new Error("Muitas mensagens seguidas para este contato. Aguarde alguns segundos.");
    }

    const { assertWithinLimit } = await import("./plan-limits.server");
    await assertWithinLimit(companyId, "mensagens");

    let quoted: any = undefined;
    if (data.replyToMessageId) {
      const { data: orig } = await supabase
        .from("mensagens")
        .select("whatsapp_message_id,texto,direcao,numero")
        .eq("id", data.replyToMessageId)
        .eq("company_id", companyId)
        .maybeSingle();
      if (orig?.whatsapp_message_id) {
        quoted = {
          key: {
            id: orig.whatsapp_message_id,
            remoteJid: `${orig.numero}@s.whatsapp.net`,
            fromMe: orig.direcao === "saida",
          },
          message: { conversation: orig.texto ?? "" },
        };
      }
    }

    let waId: string | null = null;
    let sendError: string | null = null;
    try {
      const { waSendText } = await import("./wa-dispatch.server");
      const resp: any = await waSendText(
        {
          company_id: companyId,
          instance_name: inst.instance_name,
          instance_token: inst.instance_token,
          provider: inst.provider as any,
          status: inst.status,
          paused: false,
        },
        data.numero,
        data.texto,
        {
          replyToExternalMessageId: quoted?.key?.id ?? null,
          quoted: quoted ? { quoted } : undefined,
        },
      );
      waId = extractWhatsappMessageId(resp);
    } catch (e: any) {
      sendError = e?.message ?? String(e);
    }

    const sessionDead = /not reconnectable|não reconect|whatsapp disconnected|desconectad/i.test(sendError ?? "");
    if (sessionDead) {
      try {
        await (sbAdmin as any)
          .from("whatsapp_instances")
          .update({ status: "disconnected", last_state_at: new Date().toISOString() } as any)
          .eq("company_id", companyId)
          .eq("instance_name", inst.instance_name);
      } catch { /* noop */ }
    }
    const permanentFailure = isPermanentMetaSendError(inst.provider, sendError) || sessionDead;
    const { data: inserted, error } = await supabase.from("mensagens").insert({
      company_id: companyId, user_id: userId, numero: data.numero,
      instance_id: inst.id ?? null, provider: inst.provider,
      contato_nome: data.contatoNome ?? null,
      direcao: "saida", autor: "humano", texto: data.texto,
      whatsapp_message_id: waId,
      reply_to_id: data.replyToMessageId ?? null,
      status_envio: permanentFailure ? "falha" : sendError ? "pendente" : waId ? "enviado" : "pendente",
    } as any).select("id").single();
    if (error) {
      throw new Error(error.message);
    }

    if (!permanentFailure && (sendError || !waId)) {
      const { enqueueOutbound } = await import("./outbound-queue.server");
      await enqueueOutbound({
        companyId, mensagemId: inserted?.id ?? null, kind: "text",
        payload: { numero: data.numero, texto: data.texto, quoted },
        erro: sendError ?? "D-API não retornou ID da mensagem; reenfileirando.",
      });
    }

    await supabase.from("contact_pause").upsert(
      { company_id: companyId, user_id: userId, numero: data.numero, pausado: true, pausado_por: "humano", pausado_em: new Date().toISOString() } as any,
      { onConflict: "company_id,numero" },
    );
    let finalError = sendError;
    if (sessionDead) {
      finalError = "Seu WhatsApp foi desconectado. Vá em Conexões e leia o QR Code novamente para voltar a enviar mensagens.";
    }
    if (permanentFailure && inst.provider?.startsWith("meta") && (sendError?.includes("403") || sendError?.toLowerCase().includes("forbidden"))) {
      finalError = "Falha ao enviar: App em Modo de Desenvolvimento. No Instagram, você só pode enviar mensagens para contas configuradas como 'Testadores' no Painel da Meta até que o App seja aprovado e receba Acesso Avançado.";
    }

    return { ok: !sendError, queued: !!sendError && !permanentFailure, error: finalError };
  });

export const setContactIaActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { numero: string; ativa: boolean }) => d)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const companyId = await resolveCompanyId(supabase, userId);
    const { error } = await supabase.from("contact_pause").upsert(
      { company_id: companyId, user_id: userId, numero: data.numero, pausado: !data.ativa, pausado_por: data.ativa ? "sistema" : "humano", pausado_em: new Date().toISOString() } as any,
      { onConflict: "company_id,numero" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const sendWhatsappMedia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    numero: string; contatoNome?: string | null;
    mediatype: "image" | "video" | "document";
    media: string; mimetype: string; fileName?: string; caption?: string;
    midiaUrl?: string | null; storageKey?: string | null;
  }) => d)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const companyId = await resolveCompanyId(supabase, userId);
    await (await import("./billing/access.server")).assertCompanyCanWrite(companyId);
    const { supabaseAdmin: sbAdmin } = await import("@/integrations/supabase/client.server");
    const inst = await getInstanceForContact(sbAdmin, companyId, data.numero, "id,instance_name,status,numero,provider,instance_token", userId);
    {
      const { canonicalOutboundNumero } = await import("./phone-thread.server");
      const canon = await canonicalOutboundNumero(sbAdmin, companyId, data.numero, inst as any);
      if (canon && canon !== data.numero) {
        data = { ...data, numero: canon };
      }
    }
    if (!inst?.instance_name) throw new Error("Conexão não disponível para este contato");

    assertNotSendingToOwnConnectedNumber(data.numero, inst);

    if (data.caption) {
      const { assinaturaPrefixo, comAssinatura } = await import("./user-scope");
      const prefixo = await assinaturaPrefixo(supabase, userId);
      if (prefixo) data = { ...data, caption: comAssinatura(prefixo, data.caption) };
    }

    let waId: string | null = null;
    let sendError: string | null = null;
    try {
      const { waSendMedia } = await import("./wa-dispatch.server");
      const resp: any = await waSendMedia(
        {
          company_id: companyId,
          instance_name: inst.instance_name,
          instance_token: inst.instance_token,
          provider: inst.provider as any,
          status: inst.status,
          paused: false,
        },
        data.numero,
        {
          type: data.mediatype,
          url: data.media,
          mime: data.mimetype,
          fileName: data.fileName,
          caption: data.caption,
        },
      );
      waId = extractWhatsappMessageId(resp);
    } catch (e: any) {
      sendError = e?.message ?? String(e);
    }

    const permanentFailure = isPermanentMetaSendError(inst.provider, sendError);
    const { data: inserted, error } = await supabase.from("mensagens").insert({
      company_id: companyId, user_id: userId, numero: data.numero,
      instance_id: inst.id ?? null, provider: inst.provider,
      contato_nome: data.contatoNome ?? null,
      direcao: "saida", autor: "humano",
      texto: data.caption ?? (data.mediatype === "image" ? "📷 Foto" : data.mediatype === "video" ? "🎥 Vídeo" : `📎 ${data.fileName ?? "Documento"}`),
      whatsapp_message_id: waId,
      midia_url: data.storageKey ? null : data.midiaUrl ?? null, midia_tipo: data.mediatype, midia_mime: data.mimetype, midia_nome: data.fileName ?? null,
      status_envio: permanentFailure ? "falha" : sendError ? "pendente" : waId ? "enviado" : "pendente",
    } as any).select("id").single();
    if (error) {
      throw new Error(error.message);
    }

    if (inserted?.id && data.storageKey) {
      const { createHash } = await import("node:crypto");
      const attachmentKey = createHash("sha256").update(data.storageKey).digest("hex");
      const { error: attachmentError } = await (sbAdmin as any).from("message_attachments").upsert({
        company_id: companyId,
        mensagem_id: inserted.id,
        attachment_key: attachmentKey,
        kind: data.mediatype,
        storage_key: data.storageKey,
        mime_type: data.mimetype,
        file_name: data.fileName ?? null,
      }, { onConflict: "mensagem_id,attachment_key" });
      if (attachmentError) throw new Error(`No se pudo registrar el archivo enviado: ${attachmentError.message}`);
    }

    if (!permanentFailure && (sendError || !waId)) {
      const { enqueueOutbound } = await import("./outbound-queue.server");
      await enqueueOutbound({
        companyId, mensagemId: inserted?.id ?? null, kind: "media",
        payload: {
          numero: data.numero, mediatype: data.mediatype, media: data.media,
          mimetype: data.mimetype, fileName: data.fileName, caption: data.caption,
          storageKey: data.storageKey ?? null,
        },
        erro: sendError ?? "D-API não retornou ID da mensagem; reenfileirando.",
      });
    }

    await supabase.from("contact_pause").upsert(
      { company_id: companyId, user_id: userId, numero: data.numero, pausado: true, pausado_por: "humano", pausado_em: new Date().toISOString() } as any,
      { onConflict: "company_id,numero" },
    );
    return { ok: !sendError, queued: !!sendError && !permanentFailure, error: sendError };
  });

export const sendWhatsappAudio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { numero: string; contatoNome?: string | null; audio: string; midiaUrl?: string | null; storageKey?: string | null; mimetype?: string | null }) => d)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const companyId = await resolveCompanyId(supabase, userId);
    await (await import("./billing/access.server")).assertCompanyCanWrite(companyId);
    const { supabaseAdmin: sbAdmin } = await import("@/integrations/supabase/client.server");
    const inst = await getInstanceForContact(sbAdmin, companyId, data.numero, "id,instance_name,status,numero,provider,instance_token", userId);
    {
      const { canonicalOutboundNumero } = await import("./phone-thread.server");
      const canon = await canonicalOutboundNumero(sbAdmin, companyId, data.numero, inst as any);
      if (canon && canon !== data.numero) {
        data = { ...data, numero: canon };
      }
    }
    if (!inst?.instance_name) throw new Error("Conexão não disponível para este contato");

    assertNotSendingToOwnConnectedNumber(data.numero, inst);

    let waId: string | null = null;
    let sendError: string | null = null;
    try {
      const { waSendAudio } = await import("./wa-dispatch.server");
      const waInst = {
        company_id: companyId,
        instance_name: inst.instance_name,
        instance_token: inst.instance_token,
        provider: inst.provider as any,
        status: inst.status,
        paused: false,
      };
      const resp: any = await waSendAudio(waInst, data.numero, data.audio);
      waId = extractWhatsappMessageId(resp);
    } catch (e: any) {
      sendError = e?.message ?? String(e);
    }

    const permanentFailure = isPermanentMetaSendError(inst.provider, sendError);
    const { data: inserted, error } = await supabase.from("mensagens").insert({
      company_id: companyId, user_id: userId, numero: data.numero,
      instance_id: inst.id ?? null, provider: inst.provider,
      contato_nome: data.contatoNome ?? null,
      direcao: "saida", autor: "humano",
      texto: "🎤 Áudio",
      whatsapp_message_id: waId,
      midia_url: data.storageKey ? null : data.midiaUrl ?? null, midia_tipo: "audio", midia_mime: data.mimetype || "audio/ogg", midia_nome: null,
      status_envio: permanentFailure ? "falha" : sendError ? "pendente" : waId ? "enviado" : "pendente",
    } as any).select("id").single();
    if (error) {
      throw new Error(error.message);
    }

    if (inserted?.id && data.storageKey) {
      const { createHash } = await import("node:crypto");
      const attachmentKey = createHash("sha256").update(data.storageKey).digest("hex");
      const { error: attachmentError } = await (sbAdmin as any).from("message_attachments").upsert({
        company_id: companyId,
        mensagem_id: inserted.id,
        attachment_key: attachmentKey,
        kind: "audio",
        storage_key: data.storageKey,
        mime_type: data.mimetype || "audio/ogg",
      }, { onConflict: "mensagem_id,attachment_key" });
      if (attachmentError) throw new Error(`No se pudo registrar el audio enviado: ${attachmentError.message}`);
    }

    if (!permanentFailure && (sendError || !waId)) {
      const { enqueueOutbound } = await import("./outbound-queue.server");
      await enqueueOutbound({
        companyId, mensagemId: inserted?.id ?? null, kind: "audio",
        payload: { numero: data.numero, audio: data.audio, storageKey: data.storageKey ?? null },
        erro: sendError ?? "D-API não retornou ID da mensagem; reenfileirando.",
      });
    }

    await supabase.from("contact_pause").upsert(
      { company_id: companyId, user_id: userId, numero: data.numero, pausado: true, pausado_por: "humano", pausado_em: new Date().toISOString() } as any,
      { onConflict: "company_id,numero" },
    );
    return { ok: !sendError, queued: !!sendError && !permanentFailure, error: sendError };
  });

export const getWhatsappProfilePic = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((_d: { numero: string }) => _d)
  .handler(async () => {
    return { url: null as string | null };
  });

export const testEvolutionConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const started = Date.now();
    const url = (process.env.DAPI_BASE_URL || "https://api.d-api.cloud/api/v1").replace(/\/+$/, "");
    const key = process.env.DAPI_API_KEY || "";
    if (!key) {
      return {
        ok: false,
        status: 0,
        durationMs: Date.now() - started,
        endpoint: "",
        error: "DAPI_API_KEY não configurada nos segredos do backend.",
        details: "",
      };
    }
    const endpoint = `${url}/sessions`;
    try {
      const res = await fetch(endpoint, {
        method: "GET",
        headers: { Authorization: key, "Content-Type": "application/json" },
      });
      const text = await res.text();
      return {
        ok: res.ok,
        status: res.status,
        durationMs: Date.now() - started,
        endpoint,
        error: res.ok ? "" : `HTTP ${res.status}`,
        details: text,
      };
    } catch (e: any) {
      return {
        ok: false,
        status: 0,
        durationMs: Date.now() - started,
        endpoint,
        error: e?.message || "Falha de rede ao contactar a D-API.",
        details: "",
      };
    }
  });

export const testAiReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    message: string;
    tipo?: "qualificacao" | "followup" | "posvenda";
    agentId?: string | null;
    draftCfg?: Record<string, any>;
    history?: { role: "user" | "assistant"; content: string }[];
  }) => d)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const companyId = await resolveCompanyId(supabase, userId);
    const { lovableAiChat } = await import("./lovable-ai.server");
    const { buildSystemPrompt, parseAiOutput } = await import("./ai-prompt");
    const tipo = data.tipo || "qualificacao";

    let agentQuery = supabase.from("agent_config").select("*");
    if (data.agentId) agentQuery = agentQuery.eq("id", data.agentId);
    else agentQuery = agentQuery.eq("company_id", companyId).eq("tipo", tipo);

    const [{ data: dbCfg }, { data: stagesRows }, { data: prodRows }, { data: fbRows }] = await Promise.all([
      agentQuery.maybeSingle(),
      supabase.from("crm_stage").select("nome, tipo, ordem").eq("company_id", companyId).order("ordem", { ascending: true }),
      supabase.from("produto").select("nome, preco, descricao, sku, tipo, duracao_min, agendavel, ordem").eq("company_id", companyId).eq("ativo", true).order("ordem", { ascending: true }),
      supabase.from("agent_feedback").select("rating, mensagem_texto, nota").eq("company_id", companyId).order("created_at", { ascending: false }).limit(8),
    ]);

    const cfg = data.draftCfg ? { ...(dbCfg || {}), ...data.draftCfg } : dbCfg;
    const stages = (stagesRows ?? []).map((s: any) => ({ nome: s.nome, tipo: s.tipo }));
    const produtos = (prodRows ?? []).map((p: any) => ({ nome: p.nome, preco: p.preco, descricao: p.descricao, sku: p.sku, tipo: p.tipo, duracao_min: p.duracao_min, agendavel: p.agendavel }));
    const feedback = (fbRows ?? []).map((f: any) => ({ rating: f.rating, texto: f.mensagem_texto || "", nota: f.nota })).filter((f: any) => f.texto);
    const system = buildSystemPrompt(cfg ?? {}, {
      responderEmPartes: cfg?.responder_em_partes ?? true,
      stages,
      produtos,
      feedbackHints: feedback,
    });

    const { getCompanyPlan } = await import("./plan-limits.server");
    const { allowsProvider, PLAN_LABEL } = await import("./plan-features");
    const plan = await getCompanyPlan(companyId);
    const provider = ((cfg as any)?.ai_provider || "gemini") as string;
    const model = ((cfg as any)?.ai_model || "google/gemini-2.5-flash") as string;
    if (!allowsProvider(plan.slug, provider)) {
      throw new Error(
        `O provedor ${provider.toUpperCase()} não está incluso no plano ${PLAN_LABEL[plan.slug]}. Faça upgrade para Pro para usar GPT/Claude.`,
      );
    }

    const history = Array.isArray(data.history)
      ? data.history
          .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
          .slice(-20)
          .map((m) => ({ role: m.role, content: m.content }))
      : [];

    const raw = await lovableAiChat(
      [
        { role: "system", content: system },
        ...history,
        { role: "user", content: data.message },
      ],
      {
        provider,
        model,
      },
    );
    const parsed = parseAiOutput(raw, stages);

    if (parsed.sugestao) {
      try {
        await (supabase as any).from("audit_log").insert({
          company_id: companyId,
          acao: "ai_prompt_suggestion",
          detalhes: {
            numero: "Playground Test",
            inbound_text: data.message.slice(0, 500),
            previous_reply: parsed.parts.join("\n\n").slice(0, 500),
            history: history.slice(-6),
            intent: parsed.intent || "NEUTRA",
            duda: parsed.sugestao.duda,
            regra_sugerida: parsed.sugestao.regra,
            status: "pending",
            created_at: new Date().toISOString(),
          },
        });
      } catch (e: any) {
        console.warn("[testAiReply] error saving suggestion:", e?.message);
      }
    }

    return { reply: parsed.parts.join("\n\n"), parts: parsed.parts, stage: parsed.stage, sugestao: parsed.sugestao, system };
  });

export const handleChatAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { numero: string; action: "excluir" | "excluir_local" | "arquivar" | "desarquivar" | "bloquear" | "desbloquear" }) => d)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const companyId = await resolveCompanyId(supabase, userId);

    if (data.action === "excluir" || data.action === "excluir_local") {
      await supabase.from("mensagens").delete().eq("company_id", companyId).eq("numero", data.numero);
      await supabase.from("crm_cards").update({ owner_id: null } as any).eq("company_id", companyId).eq("numero", data.numero);
      await supabase.from("crm_cards").delete().eq("company_id", companyId).eq("numero", data.numero);
    } else if (data.action === "bloquear" || data.action === "desbloquear") {
      await supabase
        .from("contact_pause")
        .upsert({
          company_id: companyId,
          numero: data.numero,
          pausado: data.action === "bloquear",
        } as any, { onConflict: "company_id,numero" });
    }
    return { ok: true };
  });

export const syncWhatsappHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { numero: string }) => d)
  .handler(async () => {
    return { ok: true, synced: 0 };
  });

export const connectDapiOfficial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    displayName?: string;
    sessionId?: string;
    wabaId?: string;
    phoneNumberId?: string;
    accessToken?: string;
    phoneNumber?: string;
  }) => d)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const companyId = await resolveCompanyId(supabase, userId);
    const { dapiCreateOfficialConnection } = await import("./dapi.server");
    const { supabaseAdmin: sbAdminTok } = await import("@/integrations/supabase/client.server");

    const instanceName =
      data.sessionId?.trim() ||
      `dapi_meta_${companyId.replace(/-/g, "").slice(0, 8)}_${crypto.randomUUID().slice(0, 4)}`;
    const webhookToken = crypto.randomUUID();
    const webhookUrl = buildWebhookUrl(webhookToken, "dapi_official");

    await dapiCreateOfficialConnection({
      sessionId: instanceName,
      wabaId: data.wabaId,
      phoneNumberId: data.phoneNumberId,
      accessToken: data.accessToken,
      webhookUrl,
    });

    await (sbAdminTok as any).from("whatsapp_instances").upsert(
      {
        company_id: companyId,
        user_id: userId,
        instance_name: instanceName,
        display_name: data.displayName || "WhatsApp Oficial Meta",
        status: "connected",
        numero: data.phoneNumber ? data.phoneNumber.replace(/\D/g, "") : null,
        webhook_token: webhookToken,
        provider: "dapi_official",
        provider_type: "dapi_official",
        waba_id: data.wabaId || null,
        phone_number_id: data.phoneNumberId || null,
        instance_token: data.accessToken || null,
        last_state_at: new Date().toISOString(),
      },
      { onConflict: "instance_name" },
    );

    return { success: true, instanceName };
  });
