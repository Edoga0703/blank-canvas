import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getRequest } from "@tanstack/react-start/server";
import { canAttemptSilentRecovery, hasPermanentInstanceIssue, isPermanentDisconnectReason, normalizeEvolutionState, statusAfterRecoveryPolicy } from "./whatsapp-connection";
import {
  deriveInstanceName, sortInstances, getPreferredWhatsappInstance, getInstanceForContact,
  buildWebhookUrl, extractWhatsappMessageId, onlyDigits, isSameWhatsappNumber,
  assertNotSendingToOwnConnectedNumber, assertInstanceOpen, isPermanentMetaSendError,
  resolveCompanyId,
} from "./evolution-helpers";

export { resolveCompanyId };

export const connectWhatsapp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d?: { instanceName?: string | null; createNew?: boolean; displayName?: string | null; provider?: "evolution" | "uazapi" | null; phone?: string | null }) => {
    // Telefone (conexão por código de pareamento): só dígitos, com DDI 55 do Brasil.
    let phone = (d?.phone || "").replace(/\D/g, "");
    if (phone && !phone.startsWith("55") && phone.length <= 11) phone = `55${phone}`;
    return {
      instanceName: d?.instanceName?.trim() || null,
      createNew: !!d?.createNew,
      displayName: (d?.displayName || "").toString().trim().slice(0, 60) || null,
      providerOverride: d?.provider === "uazapi" || d?.provider === "evolution" ? d.provider : null,
      phone: phone.length >= 12 ? phone : null,
    };
  })
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const companyId = await resolveCompanyId(supabase, userId);
    const {
      evoCreateInstance,
      evoGetQr,
      evoSetWebhook,
      evoState,
      extractQrFromPayload,
    } = await import("./evolution.server");

    // Provedor: override explícito (por conexão) tem prioridade; senão usa o default da empresa.
    const { data: companyRow } = await (supabase as any)
      .from("company")
      .select("wa_provider")
      .eq("id", companyId)
      .maybeSingle();
    // Uazapi é o único provedor de QR oferecido hoje. Só usamos Evolution quando
    // explicitamente pedido OU quando a empresa realmente já tem uma conexão legada
    // Evolution — nunca por causa de um wa_provider desatualizado no cadastro.
    let provider: "evolution" | "uazapi" = data.providerOverride ?? "uazapi";
    if (!data.providerOverride && (companyRow as any)?.wa_provider === "evolution") {
      const { data: legacy } = await (supabase as any)
        .from("whatsapp_instances")
        .select("id")
        .eq("company_id", companyId)
        .eq("provider", "evolution")
        .limit(1);
      if ((legacy ?? []).length > 0) provider = "evolution";
    }


    if (data.createNew) {
      const { assertWithinLimit, getCompanyPlan } = await import("./plan-limits.server");
      await assertWithinLimit(companyId, "instancias");

      // Exclusividade Evolution ↔ Uazapi apenas quando o plano permite 1 conexão.
      const planoAtual = await getCompanyPlan(companyId);
      if ((planoAtual?.limites?.instancias ?? 1) <= 1) {
        const { data: waRows } = await (supabase as any)
          .from("whatsapp_instances")
          .select("provider")
          .eq("company_id", companyId)
          .in("provider", ["evolution", "uazapi"]);
        const outro = (waRows ?? []).find((r: any) => (r.provider ?? "evolution") !== provider);
        if (outro) {
          throw new Error(
            `Você já possui uma conexão ${outro.provider === "uazapi" ? "WhatsApp Premium (Uazapi)" : "WhatsApp Web (Evolution)"}. Exclua-a ou faça upgrade para usar as duas APIs.`,
          );
        }
      }
    }

    const { supabaseAdmin: sbAdminTok } = await import("@/integrations/supabase/client.server");
    const existingQuery = (sbAdminTok as any)
      .from("whatsapp_instances")
      .select("instance_name,status,numero,webhook_token,updated_at,provider")
      .eq("company_id", companyId);
    const { data: rows } = await (data.instanceName
      ? existingQuery.eq("instance_name", data.instanceName).limit(1)
      : existingQuery.order("updated_at", { ascending: false }));
    // AUDITORIA DE PROVEDOR: nunca reaproveitar uma instância de outro provedor
    // (cliente escolhia Uazapi e caía numa conexão Evolution existente).
    const rowsMesmoProvider = (rows ?? []).filter(
      (r: any) => ((r.provider ?? provider) as string) === provider,
    );
    const existing = data.createNew ? null : sortInstances(rowsMesmoProvider)[0] ?? null;
    const instanceName = existing?.instance_name || deriveInstanceName(companyId, data.createNew ? crypto.randomUUID().replace(/-/g, "").slice(0, 8) : undefined);
    const webhookToken = existing?.webhook_token || crypto.randomUUID();
    const webhookUrl = buildWebhookUrl(webhookToken, provider);
    if (existing?.instance_name) {
      try {
        const s = await evoState(existing.instance_name);
        const existingState = s?.instance?.state || (s as any)?.state;
        const instanceDetails = existingState === "open" ? await (await import("./evolution.server")).evoFetchInstance(existing.instance_name).catch(() => null) : null;
        if (existingState === "open" && !hasPermanentInstanceIssue(instanceDetails)) {
          if (webhookUrl) {
            // fire-and-forget: não bloqueia o retorno
            evoSetWebhook(existing.instance_name, webhookUrl).catch((e) => console.warn("[evolution.setWebhook]", e));
          }
          if (existing.status !== "connected") {
            await supabase
              .from("whatsapp_instances")
              .update({ status: "connected", webhook_token: webhookToken, webhook_configured_at: new Date().toISOString(), last_state_at: new Date().toISOString() } as any)
              .eq("instance_name", existing.instance_name);
          }
          return { instanceName: existing.instance_name, qrBase64: null, code: null, state: "open", webhookUrl };
        }
      } catch {}
    }

    // whatsapp_instances não permite escrita direta pelo cliente porque contém
    // credenciais sensíveis. O usuário e a empresa já foram validados acima;
    // persista a conexão somente pelo cliente privilegiado do servidor.
    const { error: saveInstanceError } = await (sbAdminTok as any)
      .from("whatsapp_instances")
      .upsert(
        { company_id: companyId, user_id: userId, instance_name: instanceName, display_name: data.displayName, status: "connecting", webhook_token: webhookToken, provider, provider_type: provider, last_state_at: new Date().toISOString() } as any,
        { onConflict: "instance_name" },
      );
    if (saveInstanceError) throw new Error(`Falha ao salvar o provedor da conexão: ${saveInstanceError.message}`);

    // Garantia extra: a linha precisa ficar com o provedor escolhido, mesmo que já existisse.
    await (sbAdminTok as any)
      .from("whatsapp_instances")
      .update({ provider, provider_type: provider } as any)
      .eq("instance_name", instanceName);

    let qrBase64: string | null = null;
    let code: string | null = null;
    let pairingCode: string | null = null;
    let lastQrError: unknown = null;
    let alreadyExisted = false;

    try {
      // Evolution v2 já devolve o QR na resposta do /instance/create quando qrcode:true.
      // Uazapi devolve o QR embutido também. O 3º arg fixa o provedor da criação.
      const createResp: any = await evoCreateInstance(instanceName, webhookUrl, provider);
      const fromCreate = await extractQrFromPayload(createResp?.qrcode ?? createResp);
      qrBase64 = fromCreate.qrBase64;
      code = fromCreate.code;
    } catch (e: any) {
      const msg = String(e?.message || "");
      const statusCode = Number(e?.status || 0);
      const detailsMsg = JSON.stringify(e?.details ?? "");
      alreadyExisted = /exists|already|in use|já existe/i.test(msg) || /already|in use|exists/i.test(detailsMsg);
      if (!alreadyExisted) console.warn("[evolution.create]", msg, detailsMsg);
      if (!alreadyExisted && (statusCode === 401 || statusCode === 403)) {
        await (sbAdminTok as any)
          .from("whatsapp_instances")
          .update({ status: "disconnected" } as any)
          .eq("instance_name", instanceName);
        return {
          instanceName,
          qrBase64: null,
          code: null,
          state: "error",
          webhookUrl,
          error: msg || "Credenciais da Evolution API inválidas ou sem permissão.",
        };
      }
      if (!alreadyExisted) throw e;
    }

    // Se a instância já existia, não precisamos criar de novo — só reconfigurar webhook
    // e buscar o QR via /connect.
    if (alreadyExisted && webhookUrl) {
      evoSetWebhook(instanceName, webhookUrl).catch((e) => console.warn("[evolution.setWebhook]", e));
    }

    // Fallback: se create não trouxe QR, tentamos /connect com backoff curto.
    // Com telefone informado, /connect devolve o código de pareamento.
    if (data.phone ? !pairingCode : !qrBase64 && !code) {
      for (let i = 0; i < 6; i++) {
        try {
          const qr: any = await evoGetQr(instanceName, data.phone);
          qrBase64 = qr.qrBase64 ?? qr.base64 ?? null;
          code = qr.code ?? null;
          pairingCode = qr.pairingCode ?? null;
          // Com telefone informado só interessa o código de pareamento.
          if (data.phone ? pairingCode : qrBase64 || code) break;
        } catch (e) { lastQrError = e; console.warn("[evolution.connect]", e); }
        await new Promise((r) => setTimeout(r, 600 + i * 300));
      }
    }

    // Se o servidor Evolution está instável (ex.: 500 no /connect logo após create),
    // não estoure a UI — devolva estado "aguardando" para o cliente re-tentar.
    if (data.phone ? !pairingCode : !qrBase64 && !code) {
      const errMsg = lastQrError instanceof Error ? lastQrError.message : null;
      return {
        instanceName,
        qrBase64: null,
        code: null,
        pairingCode: null,
        state: "connecting",
        webhookUrl,
        error: data.phone
          ? errMsg || "Código de pareamento ainda não disponível. Tente novamente em alguns segundos."
          : errMsg || "QR ainda não disponível. Clique em Conectar WhatsApp novamente em alguns segundos.",
      };
    }

    return { instanceName, qrBase64, code, pairingCode, state: undefined, webhookUrl };
  });



export const checkWhatsappStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d?: { instanceName?: string | null }) => ({ instanceName: d?.instanceName?.trim() || null }))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    let companyId: string;
    try {
      companyId = await resolveCompanyId(supabase, userId);
    } catch (e) {
      console.warn("[checkWhatsappStatus] Sem empresa resolvida:", e);
      return { status: "disconnected", state: null, numero: null, qrBase64: null, code: null };
    }
    const { evoState, evoFetchInstance, evoFetchNumberFromInstance, evoSetWebhook } = await import("./evolution.server");

    const { supabaseAdmin: sbAdminTok } = await import("@/integrations/supabase/client.server");
    const query = (sbAdminTok as any)
      .from("whatsapp_instances")
      .select("instance_name,status,numero,webhook_token,webhook_configured_at,last_state_at,provider")
      .eq("company_id", companyId);
    const { data: rows } = await (data.instanceName
      ? query.eq("instance_name", data.instanceName).limit(1)
      : query.order("updated_at", { ascending: false }));
    const row = sortInstances(rows ?? [])[0] ?? null;
    if (!row) return { status: "disconnected", state: null, numero: null, qrBase64: null, code: null };

    let state: string | null = null;
    let currentQr: string | null = null;
    let stateError = false;
    try {
      const s = await evoState(row.instance_name);
      state = s?.instance?.state || (s as any)?.state || null;
      currentQr = (s as any)?.qrBase64 ?? null;
    } catch (e) {
      stateError = true;
      console.warn("[evolution.state]", e);
    }

    // IMPORTANTE: NUNCA chamar evoGetQr aqui. Chamar /instance/connect em sessão
    // ativa DERRUBA a sessão do WhatsApp pra gerar um QR novo. QR só é buscado
    // explicitamente em connectWhatsapp (botão "Conectar"). Em erro transitório,
    // preservar o último status conhecido pra não causar "flicker" de desconexão.
    if (stateError) {
      return {
        status: row.status || "disconnected",
        state: null,
        numero: row.numero ?? null,
        qrBase64: null,
        code: null,
      };
    }

    const rawStatus = normalizeEvolutionState(state);
    if (!rawStatus) {
      return { status: row.status || "disconnected", state, numero: row.numero ?? null, qrBase64: currentQr, code: null };
    }

    const instanceDetails = rawStatus === "connected" ? await evoFetchInstance(row.instance_name).catch(() => null) : null;
    const forcedDisconnected = hasPermanentInstanceIssue(instanceDetails);

    const effectiveRawStatus = forcedDisconnected ? "disconnected" : rawStatus;
    const shouldRecover = !forcedDisconnected && canAttemptSilentRecovery({ rawStatus: effectiveRawStatus, previousStatus: row.status, lastStateAt: row.last_state_at });
    const newStatus = forcedDisconnected ? "disconnected" : statusAfterRecoveryPolicy({ rawStatus: effectiveRawStatus, previousStatus: row.status, lastStateAt: row.last_state_at });
    let finalStatus = newStatus;

    // Grace period: tenta recuperar quedas transitórias sem gerar QR novo.
    // Se a sessão foi invalidada/logout, o watchdog/webhook deixa como desconectado.
    if (shouldRecover) {
      try {
        const { evoRestart } = await import("./evolution.server");
        await evoRestart(row.instance_name);
      } catch (e: any) {
        console.warn("[evolution.restart]", e);
        if (isPermanentDisconnectReason(Number(e?.status || 0))) finalStatus = "disconnected";
      }
    }

    let numero: string | null = row.numero ?? null;
    if (finalStatus === "connected" && !numero) {
      try { numero = await evoFetchNumberFromInstance(row.instance_name); } catch {}
    }
    if (finalStatus === "connected" && row.webhook_token) {
      const webhookUrl = buildWebhookUrl(row.webhook_token, (row.provider as any) === "uazapi" ? "uazapi" : "evolution");

      if (webhookUrl) {
        try {
          await evoSetWebhook(row.instance_name, webhookUrl);
          await supabase.from("whatsapp_instances").update({ webhook_configured_at: new Date().toISOString() } as any).eq("instance_name", row.instance_name);
        } catch (e) { console.warn("[evolution.setWebhook]", e); }
      }
    }

    if (finalStatus !== row.status || (numero && numero !== row.numero)) {
      const updateLastStateAt = finalStatus !== row.status || finalStatus === "connected";
      await supabase
        .from("whatsapp_instances")
        .update({ status: finalStatus, ...(updateLastStateAt ? { last_state_at: new Date().toISOString() } : {}), ...(numero ? { numero } : {}) } as any)
        .eq("instance_name", row.instance_name);
    }

    return { status: finalStatus, state, numero, qrBase64: finalStatus === "connecting" ? currentQr : null, code: null };
  });

export const listWhatsappInstances = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const companyId = await resolveCompanyId(supabase, userId);
    const { data } = await (supabase as any)
      .from("whatsapp_instances")
      .select("instance_name,display_name,status,numero,updated_at,paused,provider,provider_type")
      .eq("company_id", companyId)
      .order("updated_at", { ascending: false });
    const instances = (data ?? []).map((instance: any) => ({
      ...instance,
      provider_type: instance.provider || instance.provider_type || "evolution",
    }));
    return { instances: sortInstances(instances) };
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
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const companyId = await resolveCompanyId(supabase, userId);
    const { evoRestart, evoSetWebhook, evoState } = await import("./evolution.server");
    const { supabaseAdmin: sbAdminTok } = await import("@/integrations/supabase/client.server");
    const { data: row } = await (sbAdminTok as any)
      .from("whatsapp_instances")
      .select("instance_name,webhook_token,provider")
      .eq("company_id", companyId)
      .eq("status", "connected")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!row?.instance_name || !row?.webhook_token) {
      throw new Error("Instância não conectada. Conecte o WhatsApp primeiro.");
    }
    const webhookUrl = buildWebhookUrl(row.webhook_token, (row.provider as any) === "uazapi" ? "uazapi" : "evolution");
    if (!webhookUrl) throw new Error("Não foi possível montar a URL do webhook.");
    await evoSetWebhook(row.instance_name, webhookUrl);

    let state: string | null = null;
    let reconnecting = false;
    let disconnected = false;
    try {
      const s = await evoState(row.instance_name);
      state = s?.instance?.state || (s as any)?.state || null;
      if (normalizeEvolutionState(state) === "disconnected") {
        await evoRestart(row.instance_name);
        reconnecting = true;
      }
    } catch (e: any) {
      console.warn("[evolution.reconfigureWebhook.state]", e);
      disconnected = isPermanentDisconnectReason(Number(e?.status || 0));
    }
    await supabase
      .from("whatsapp_instances")
      .update({
        webhook_configured_at: new Date().toISOString(),
        ...(reconnecting ? { status: "connecting", last_state_at: new Date().toISOString() } : {}),
        ...(disconnected ? { status: "disconnected", last_state_at: new Date().toISOString() } : {}),
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
    const { evoLogout } = await import("./evolution.server");
    const q = supabase
      .from("whatsapp_instances")
      .select("instance_name")
      .eq("company_id", companyId);
    const { data: rows } = await (data.instanceName
      ? q.eq("instance_name", data.instanceName).limit(1)
      : q.order("updated_at", { ascending: false }).limit(1));
    const row = (rows ?? [])[0] ?? null;
    if (row) {
      try { await evoLogout(row.instance_name); } catch (e) { console.warn("[evolution.logout]", e); }
      await supabase
        .from("whatsapp_instances")
        .update({ status: "disconnected" })
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
    const { evoLogout, evoDelete } = await import("./evolution.server");
    const q = supabase
      .from("whatsapp_instances")
      .select("instance_name")
      .eq("company_id", companyId);
    const { data: row } = await (data.instanceName
      ? q.eq("instance_name", data.instanceName).limit(1)
      : q.order("updated_at", { ascending: false }).limit(1))
      .maybeSingle();
    if (row?.instance_name) {
      try { await evoLogout(row.instance_name); } catch (e) { console.warn("[evolution.logout]", e); }
      try { await evoDelete(row.instance_name); } catch (e) { console.warn("[evolution.delete]", e); }
      const { invalidateInstanceMetaCache } = await import("./evolution.server");
      invalidateInstanceMetaCache(row.instance_name);
    }
    if (row?.instance_name) await supabase.from("whatsapp_instances").delete().eq("instance_name", row.instance_name);
    return { ok: true };
  });

export const getWhatsappProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const companyId = await resolveCompanyId(supabase, userId);
    const { data: row } = await (supabase as any)
      .from("company").select("wa_provider").eq("id", companyId).maybeSingle();
    const { data: roleRow } = await (supabase as any)
      .from("user_roles").select("role").eq("user_id", userId).eq("role", "super_admin").maybeSingle();
    return {
      provider: ((row as any)?.wa_provider === "uazapi" ? "uazapi" : "evolution") as "evolution" | "uazapi",
      canChange: !!roleRow,
    };
  });

export const setWhatsappProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { provider: "evolution" | "uazapi" }) => ({
    provider: d.provider === "uazapi" ? ("uazapi" as const) : ("evolution" as const),
  }))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: roleRow } = await (supabase as any)
      .from("user_roles").select("role").eq("user_id", userId).eq("role", "super_admin").maybeSingle();
    if (!roleRow) throw new Error("Apenas super admin pode trocar o provedor do WhatsApp.");
    const companyId = await resolveCompanyId(supabase, userId);
    const { error } = await (supabase as any)
      .from("company").update({ wa_provider: data.provider }).eq("id", companyId);
    if (error) throw new Error(error.message);
    const { invalidateCompanyCache } = await import("./company-cache");
    try { invalidateCompanyCache?.(companyId); } catch {}
    return { ok: true, provider: data.provider };
  });


export const sendWhatsappText = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { numero: string; texto: string; contatoNome?: string | null; replyToMessageId?: string | null }) => d)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const companyId = await resolveCompanyId(supabase, userId);
    await (await import("./billing/access.server")).assertCompanyCanWrite(companyId);
    const { supabaseAdmin: sbAdmin } = await import("@/integrations/supabase/client.server");
    const inst = await getInstanceForContact(sbAdmin, companyId, data.numero, "instance_name,status,numero,provider,instance_token", userId);
    {
      const { canonicalOutboundNumero } = await import("./phone-thread.server");
      const canon = await canonicalOutboundNumero(sbAdmin, companyId, data.numero, inst as any);
      if (canon && canon !== data.numero) {
        console.log("[sendWhatsappText] Número canônico da conversa:", data.numero, "->", canon);
        data = { ...data, numero: canon };
      }
    }
    console.log("[sendWhatsappText] Instância resolvida para contato:", data.numero, inst?.instance_name, inst?.provider);
    if (!inst?.instance_name) throw new Error("Conexão não disponível para este contato");

    assertNotSendingToOwnConnectedNumber(data.numero, inst);

    // Assinatura do atendente (nome antes do texto), se ele mantiver ligada.
    {
      const { assinaturaPrefixo, comAssinatura } = await import("./user-scope");
      const prefixo = await assinaturaPrefixo(supabase, userId);
      if (prefixo) data = { ...data, texto: comAssinatura(prefixo, data.texto) };
    }

    // Anti-flood: considera apenas envios manuais (humano) no último minuto.
    // Antes contava também mensagens da IA/régua, travando o atendente sem motivo.
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
    const { evoSendText, evoState, evoFetchInstance } = await import("./evolution.server");

    // Se é reply, monta quoted a partir da mensagem original
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
      const isLovable = inst.provider === "lovable_whatsapp";
      sendError = isLovable
        ? null
        : await assertInstanceOpen(evoState, evoFetchInstance, inst.instance_name, inst.provider);

      if (!sendError) {
        console.log("[sendWhatsappText] Enviando por", inst.provider, inst.instance_name);
        const resp: any = isLovable
          ? await (await import("./wa-dispatch.server")).waSendText(
              {
                instance_name: inst.instance_name,
                instance_token: inst.instance_token,
                provider: "lovable_whatsapp",
                status: inst.status,
                paused: false,
              },
              data.numero,
              data.texto,
              { replyToExternalMessageId: quoted?.key?.id ?? null },
            )
          : await evoSendText(inst.instance_name, data.numero, data.texto, quoted ? { quoted } : undefined);
        console.log("[sendWhatsappText] Resposta bruta:", JSON.stringify(resp));
        waId = extractWhatsappMessageId(resp);
        if (!waId) {
          console.warn("[sendWhatsappText] Evolution não retornou ID válido. Resposta:", JSON.stringify(resp));
        }
      }
    } catch (e: any) {
      console.error("[sendWhatsappText] Erro ao enviar:", e);
      sendError = e?.message ?? String(e);
    }

    // Sessão do WhatsApp caiu e não pode se reconectar sozinha: exige novo QR Code.
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
      contato_nome: data.contatoNome ?? null,
      direcao: "saida", autor: "humano", texto: data.texto,
      whatsapp_message_id: waId,
      reply_to_id: data.replyToMessageId ?? null,
      status_envio: permanentFailure ? "falha" : sendError ? "pendente" : waId ? "enviado" : "pendente",
    } as any).select("id").single();
    if (error) {
      console.error("[sendWhatsappText] Erro ao inserir no banco:", error.message);
      throw new Error(error.message);
    }

    if (!permanentFailure && (sendError || !waId)) {
      const { enqueueOutbound } = await import("./outbound-queue.server");
      await enqueueOutbound({
        companyId, mensagemId: inserted?.id ?? null, kind: "text",
        payload: { numero: data.numero, texto: data.texto, quoted },
        erro: sendError ?? "Evolution não retornou ID da mensagem; reenfileirando.",
      });
    }

    await supabase.from("contact_pause").upsert(
      { company_id: companyId, user_id: userId, numero: data.numero, pausado: true, pausado_por: "humano", pausado_em: new Date().toISOString() } as any,
      { onConflict: "company_id,numero" },
    );
    let finalError = sendError;
    if (sessionDead) {
      finalError = "Seu WhatsApp foi desconectado e não consegue reconectar sozinho. Vá em Conexão e leia o QR Code novamente para voltar a enviar mensagens.";
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
    const inst = await getInstanceForContact(sbAdmin, companyId, data.numero, "instance_name,status,numero,provider,instance_token", userId);
    {
      const { canonicalOutboundNumero } = await import("./phone-thread.server");
      const canon = await canonicalOutboundNumero(sbAdmin, companyId, data.numero, inst as any);
      if (canon && canon !== data.numero) {
        console.log("[sendWhatsappMedia] Número canônico da conversa:", data.numero, "->", canon);
        data = { ...data, numero: canon };
      }
    }
    console.log("[sendWhatsappMedia] Instância resolvida:", inst?.instance_name, inst?.provider);
    if (!inst?.instance_name) throw new Error("Conexão não disponível para este contato");

    assertNotSendingToOwnConnectedNumber(data.numero, inst);

    // Assinatura do atendente na legenda da mídia, quando houver legenda.
    if (data.caption) {
      const { assinaturaPrefixo, comAssinatura } = await import("./user-scope");
      const prefixo = await assinaturaPrefixo(supabase, userId);
      if (prefixo) data = { ...data, caption: comAssinatura(prefixo, data.caption) };
    }

    // Janela de 24h desativada — Evolution API (não-oficial) não exige template.

    const { evoSendMedia, evoState, evoFetchInstance } = await import("./evolution.server");
    let waId: string | null = null;
    let sendError: string | null = null;
    try {
      const isLovable = inst.provider === "lovable_whatsapp";
      sendError = isLovable
        ? null
        : await assertInstanceOpen(evoState, evoFetchInstance, inst.instance_name, inst.provider);

      if (!sendError) {
        console.log("[sendWhatsappMedia] Enviando por", inst.provider);
        const resp: any = isLovable
          ? await (await import("./wa-dispatch.server")).waSendMedia(
              {
                instance_name: inst.instance_name,
                instance_token: inst.instance_token,
                provider: "lovable_whatsapp",
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
            )
          : await evoSendMedia(inst.instance_name, data.numero, {
              mediatype: data.mediatype, media: data.media, mimetype: data.mimetype,
              fileName: data.fileName, caption: data.caption,
            });
        console.log("[sendWhatsappMedia] Resposta bruta:", JSON.stringify(resp));
        waId = extractWhatsappMessageId(resp);
        if (!waId) {
          console.warn("[sendWhatsappMedia] Evolution não retornou ID válido. Resposta:", JSON.stringify(resp));
        }
      }
    } catch (e: any) {
      console.error("[sendWhatsappMedia] Erro ao enviar:", e);
      sendError = e?.message ?? String(e);
    }

    const permanentFailure = isPermanentMetaSendError(inst.provider, sendError);
    const { data: inserted, error } = await supabase.from("mensagens").insert({
      company_id: companyId, user_id: userId, numero: data.numero,
      contato_nome: data.contatoNome ?? null,
      direcao: "saida", autor: "humano",
      texto: data.caption ?? (data.mediatype === "image" ? "📷 Foto" : data.mediatype === "video" ? "🎥 Vídeo" : `📎 ${data.fileName ?? "Documento"}`),
      whatsapp_message_id: waId,
      midia_url: data.storageKey ? null : data.midiaUrl ?? null, midia_tipo: data.mediatype, midia_mime: data.mimetype, midia_nome: data.fileName ?? null,
      status_envio: permanentFailure ? "falha" : sendError ? "pendente" : waId ? "enviado" : "pendente",
    } as any).select("id").single();
    if (error) {
      console.error("[sendWhatsappMedia] Erro ao inserir no banco:", error.message);
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
        erro: sendError ?? "Evolution não retornou ID da mensagem; reenfileirando.",
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
    const inst = await getInstanceForContact(sbAdmin, companyId, data.numero, "instance_name,status,numero,provider,instance_token", userId);
    {
      const { canonicalOutboundNumero } = await import("./phone-thread.server");
      const canon = await canonicalOutboundNumero(sbAdmin, companyId, data.numero, inst as any);
      if (canon && canon !== data.numero) {
        console.log("[sendWhatsappAudio] Número canônico da conversa:", data.numero, "->", canon);
        data = { ...data, numero: canon };
      }
    }
    console.log("[sendWhatsappAudio] Instância resolvida:", inst?.instance_name, inst?.provider);
    if (!inst?.instance_name) throw new Error("Conexão não disponível para este contato");

    assertNotSendingToOwnConnectedNumber(data.numero, inst);

    const { evoSendAudio, evoState, evoFetchInstance } = await import("./evolution.server");
    let waId: string | null = null;
    let sendError: string | null = null;
    try {
      sendError = inst.provider === "lovable_whatsapp"
        ? null
        : await assertInstanceOpen(evoState, evoFetchInstance, inst.instance_name, inst.provider);
      if (!sendError) {
        console.log("[sendWhatsappAudio] Chamando dispatcher de áudio...");
        const { waSendAudio } = await import("./wa-dispatch.server");
        const waInst = {
          instance_name: inst.instance_name,
          instance_token: inst.instance_token,
          provider: inst.provider as any,
          status: inst.status,
          paused: false
        };
        const resp: any = await waSendAudio(waInst, data.numero, data.audio);
        console.log("[sendWhatsappAudio] Resposta bruta:", JSON.stringify(resp));
        waId = extractWhatsappMessageId(resp);
        if (!waId) {
          console.warn("[sendWhatsappAudio] Provedor não retornou ID válido. Resposta:", JSON.stringify(resp));
        }
      }
    }
    catch (e: any) {
      console.error("[sendWhatsappAudio] Erro ao enviar:", e);
      sendError = e?.message ?? String(e);
    }


    const permanentFailure = isPermanentMetaSendError(inst.provider, sendError);
    const { data: inserted, error } = await supabase.from("mensagens").insert({
      company_id: companyId, user_id: userId, numero: data.numero,
      contato_nome: data.contatoNome ?? null,
      direcao: "saida", autor: "humano",
      texto: "🎤 Áudio",
      whatsapp_message_id: waId,
      midia_url: data.storageKey ? null : data.midiaUrl ?? null, midia_tipo: "audio", midia_mime: data.mimetype || "audio/ogg", midia_nome: null,
      status_envio: permanentFailure ? "falha" : sendError ? "pendente" : waId ? "enviado" : "pendente",
    } as any).select("id").single();
    if (error) {
      console.error("[sendWhatsappAudio] Erro ao inserir no banco:", error.message);
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
        erro: sendError ?? "Evolution não retornou ID da mensagem; reenfileirando.",
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
  .inputValidator((d: { numero: string }) => d)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const companyId = await resolveCompanyId(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: inst } = await (supabaseAdmin as any)
      .from("whatsapp_instances")
      .select("instance_token")
      .eq("company_id", companyId)
      .not("instance_token", "is", null)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!inst?.instance_token) return { url: null as string | null };

    const { data: card } = await (supabaseAdmin as any)
      .from("crm_cards").select("id").eq("company_id", companyId).eq("numero", data.numero).maybeSingle();
    if (!card) return { url: null as string | null };

    const { syncLeadPhoto } = await import("@/lib/lead-photo.server");
    const url = await syncLeadPhoto(supabaseAdmin as any, companyId, card.id, data.numero, inst.instance_token);
    return { url };
  });

export const testEvolutionConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const started = Date.now();
    const url = process.env.EVOLUTION_API_URL;
    const key = process.env.EVOLUTION_API_KEY;
    if (!url || !key) {
      return {
        ok: false,
        status: 0,
        durationMs: Date.now() - started,
        endpoint: "",
        error: "EVOLUTION_API_URL e/ou EVOLUTION_API_KEY não configurados nos segredos do backend.",
        details: "",
      };
    }
    const base = url.replace(/\/+$/, "");
    const endpoint = `${base}/instance/fetchInstances`;
    try {
      const res = await fetch(endpoint, {
        method: "GET",
        headers: { apikey: key, "Content-Type": "application/json" },
      });
      const text = await res.text();
      let parsed: any = null;
      try { parsed = text ? JSON.parse(text) : null; } catch {}
      const errMsg = res.ok
        ? ""
        : (typeof parsed?.message === "string" ? parsed.message
          : typeof parsed?.error === "string" ? parsed.error
          : text || `HTTP ${res.status}`);
      return {
        ok: res.ok,
        status: res.status,
        durationMs: Date.now() - started,
        endpoint,
        error: errMsg,
        details: parsed ? JSON.stringify(parsed, null, 2) : text,
      };
    } catch (e: any) {
      return {
        ok: false,
        status: 0,
        durationMs: Date.now() - started,
        endpoint,
        error: e?.message || "Falha de rede ao contactar a Evolution API.",
        details: "",
      };
    }
  });


export const testAiReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    message: string;
    tipo?: "qualificacao" | "followup" | "posvenda";
    history?: { role: "user" | "assistant"; content: string }[];
  }) => d)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const companyId = await resolveCompanyId(supabase, userId);
    const { lovableAiChat } = await import("./lovable-ai.server");
    const { buildSystemPrompt, parseAiOutput } = await import("./ai-prompt");
    const tipo = data.tipo || "qualificacao";
    const [{ data: cfg }, { data: stagesRows }, { data: prodRows }, { data: fbRows }] = await Promise.all([
      supabase.from("agent_config").select("*").eq("company_id", companyId).eq("tipo", tipo).maybeSingle(),
      supabase.from("crm_stage").select("nome, tipo, ordem").eq("company_id", companyId).order("ordem", { ascending: true }),
      supabase.from("produto").select("nome, preco, descricao, sku, tipo, duracao_min, agendavel, ordem").eq("company_id", companyId).eq("ativo", true).order("ordem", { ascending: true }),
      supabase.from("agent_feedback").select("rating, mensagem_texto, nota").eq("company_id", companyId).eq("agent_tipo", tipo).order("created_at", { ascending: false }).limit(8),
    ]);
    const stages = (stagesRows ?? []).map((s: any) => ({ nome: s.nome, tipo: s.tipo }));
    const produtos = (prodRows ?? []).map((p: any) => ({ nome: p.nome, preco: p.preco, descricao: p.descricao, sku: p.sku, tipo: p.tipo, duracao_min: p.duracao_min, agendavel: p.agendavel }));
    const feedback = (fbRows ?? []).map((f: any) => ({ rating: f.rating, texto: f.mensagem_texto || "", nota: f.nota })).filter((f: any) => f.texto);
    const system = buildSystemPrompt(cfg ?? {}, {
      responderEmPartes: cfg?.responder_em_partes ?? true,
      stages,
      produtos,
      feedback,
    });

    const { getCompanyPlan } = await import("./plan-limits.server");
    const { allowsProvider, PLAN_LABEL } = await import("./plan-features");
    const plan = await getCompanyPlan(companyId);
    let provider = ((cfg as any)?.ai_provider || "gemini") as string;
    let model = ((cfg as any)?.ai_model || "google/gemini-2.5-flash") as string;
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
    const { parts, stage } = parseAiOutput(raw, stages);
    return { reply: parts.join("\n\n"), parts, stage, system };
  });

export const handleChatAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { numero: string; action: "excluir" | "excluir_local" | "arquivar" | "desarquivar" | "bloquear" | "desbloquear" }) => d)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const companyId = await resolveCompanyId(supabase, userId);
    const inst = data.action === "excluir_local"
      ? null
      : await getInstanceForContact(supabase, companyId, data.numero, "instance_name,status,provider", userId);

    if (data.action !== "excluir_local" && !inst?.instance_name) {
      throw new Error("Conexão não disponível");
    }

    const { evoDeleteChat, evoArchiveChat, evoBlockContact } = await import("./evolution.server");

    try {
      if (data.action === "excluir" || data.action === "excluir_local") {
        if (data.action === "excluir" && inst?.instance_name) {
          await evoDeleteChat(inst.instance_name, data.numero);
        }
        // Sempre remove do banco local (sistema) e LIMPA O DONO no CRM
        await supabase.from("mensagens").delete().eq("company_id", companyId).eq("numero", data.numero);
        await supabase.from("crm_cards").update({ owner_id: null } as any).eq("company_id", companyId).eq("numero", data.numero);
        await supabase.from("crm_cards").delete().eq("company_id", companyId).eq("numero", data.numero);
      } else if (inst?.instance_name && (data.action === "arquivar" || data.action === "desarquivar")) {
        await evoArchiveChat(inst.instance_name, data.numero, data.action === "arquivar");
      } else if (inst?.instance_name && (data.action === "bloquear" || data.action === "desbloquear")) {
        await evoBlockContact(inst.instance_name, data.numero, data.action === "bloquear" ? "block" : "unblock");
        // Sincroniza estado de pausa no banco local para refletir na UI imediatamente
        await supabase
          .from("contact_pause")
          .upsert({ 
            company_id: companyId, 
            numero: data.numero, 
            pausado: data.action === "bloquear" 
          } as any, { onConflict: "company_id,numero" });
      }
      return { ok: true };
    } catch (e: any) {
      throw new Error(e.message || "Falha ao executar ação no WhatsApp");
    }
  });

export const syncWhatsappHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { numero: string }) => d)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const companyId = await resolveCompanyId(supabase, userId);

    const inst = await getInstanceForContact(supabase, companyId, data.numero, "instance_name,status,provider", userId);
    
    if (!inst?.instance_name) throw new Error("Conexão não disponível para este contato");
    
    const { evoFetchMessages } = await import("./evolution.server");
    const rawMessages = await evoFetchMessages(inst.instance_name, data.numero, 1000);
    
    console.log(`[syncWhatsappHistory] Buscadas ${rawMessages.length} mensagens para ${data.numero}`);
    
    if (!rawMessages.length) return { ok: true, synced: 0 };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const formatted = rawMessages.map((m: any) => {
      // Normalização para diferentes provedores (Evolution v2 / Uazapi)
      const fromMe = !!(m.key?.fromMe ?? m.fromMe);
      const text = m.message?.conversation || 
                   m.message?.extendedTextMessage?.text || 
                   m.text || 
                   m.content || 
                   m.message?.imageMessage?.caption ||
                   m.message?.videoMessage?.caption ||
                   "";
      
      const timestamp = m.messageTimestamp || m.timestamp || Math.floor(Date.now() / 1000);
      const msgId = m.key?.id || m.id;
      
      return {
        company_id: companyId,
        numero: data.numero,
        direcao: fromMe ? "saida" : "entrada",
        autor: fromMe ? "humano" : "contato",
        texto: text,
        created_at: new Date(Number(timestamp) * 1000).toISOString(),
        whatsapp_message_id: msgId,
        status_envio: "enviado",
        canal: inst.provider?.startsWith("meta") ? inst.provider.split("_")[1] : "whatsapp"
      } as any;
    }).filter(m => m.texto || m.whatsapp_message_id); // Mantém mesmo sem texto se tiver ID (pode ser mídia)

    if (formatted.length > 0) {
      const { error } = await supabaseAdmin.from("mensagens").upsert(formatted, { onConflict: "company_id,whatsapp_message_id" });
      if (error) console.warn("[syncWhatsappHistory] upsert error", error.message);
    }

    return { ok: true, synced: formatted.length };
  });
