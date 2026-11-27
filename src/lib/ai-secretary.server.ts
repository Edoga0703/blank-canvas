import { waSendText, type WaInstance, type WaProvider } from "@/lib/wa-dispatch.server";
import { lovableAiChat } from "@/lib/lovable-ai.server";
import { debitAiCredits } from "@/lib/credits.server";
import { executeVerifiedTool } from "@/lib/agent-tools.server";
import { moveCardToStage } from "@/lib/crm-engine.server";
import { phoneVariants } from "@/lib/br-phone";

export function normalizeSecretaryDigits(rawPhone?: string | null): string {
  const s = String(rawPhone || "").trim();
  if (!s || s.includes("@g.us")) return "";
  const base = s.includes("@") ? s.split("@")[0] : s;
  return base.replace(/\D/g, "");
}

export function secretaryPhonesMatch(a?: string | null, b?: string | null): boolean {
  const da = normalizeSecretaryDigits(a);
  const db = normalizeSecretaryDigits(b);
  if (da.length < 10 || db.length < 10) return false;
  if (da === db) return true;
  if (da.slice(-10) === db.slice(-10)) return true;

  const va = new Set(phoneVariants(da));
  const vb = phoneVariants(db);
  return vb.some((v) => va.has(v));
}

export async function resolveConnectedWhatsappInstance(
  admin: any,
  companyId: string,
  preferredInstanceId?: string | null,
): Promise<WaInstance | null> {
  try {
    const { data: rows, error } = await admin
      .from("whatsapp_instances")
      .select("id, company_id, instance_name, instance_token, provider, provider_type, status, paused, phone_number_id, waba_id, updated_at")
      .eq("company_id", companyId)
      .in("provider", ["dapi", "dapi_official"])
      .in("status", ["connected", "open"])
      .or("paused.is.null,paused.eq.false")
      .order("updated_at", { ascending: false });

    if (error || !rows || rows.length === 0) return null;

    const chosen =
      (preferredInstanceId ? rows.find((r: any) => r.id === preferredInstanceId) : null) ||
      rows[0];

    const rawProv = String(chosen.provider || chosen.provider_type || "dapi").toLowerCase();
    const provider: WaProvider =
      rawProv === "dapi_official" || rawProv === "official" || rawProv === "oficial_meta"
        ? "dapi_official"
        : "dapi";

    return {
      id: chosen.id,
      company_id: companyId,
      instance_name: chosen.instance_name,
      instance_token: chosen.instance_token ?? null,
      provider,
      status: chosen.status,
      paused: Boolean(chosen.paused),
      phone_number_id: chosen.phone_number_id ?? null,
      waba_id: chosen.waba_id ?? null,
    };
  } catch (err: any) {
    console.warn("[ai-secretary] Error resolving WhatsApp instance:", err?.message);
    return null;
  }
}

export interface SecretaryMatchResult {
  matched: boolean;
  agent?: any;
  matchedPhone?: string;
}

/**
 * Determina si un número entrante corresponde a un Owner/Admin autorizado en Modo Secretario.
 */
export async function matchSecretaryForPhone(
  admin: any,
  companyId: string,
  rawPhone: string,
): Promise<SecretaryMatchResult> {
  if (!companyId || !rawPhone || rawPhone.includes("@g.us")) {
    return { matched: false };
  }
  const incomingDigits = normalizeSecretaryDigits(rawPhone);
  if (incomingDigits.length < 10) {
    return { matched: false };
  }

  try {
    const { data: agents, error } = await admin
      .from("agent_config")
      .select("*")
      .eq("company_id", companyId)
      .eq("secretary_enabled", true)
      .order("created_at", { ascending: true });

    if (error || !agents || agents.length === 0) {
      return { matched: false };
    }

    for (const agent of agents) {
      const phones = Array.isArray(agent.secretary_phones) ? agent.secretary_phones : [];
      for (const candidate of phones) {
        const cleanCandidate = normalizeSecretaryDigits(String(candidate || ""));
        if (cleanCandidate.length < 10) continue;
        if (secretaryPhonesMatch(incomingDigits, cleanCandidate)) {
          return {
            matched: true,
            agent,
            matchedPhone: cleanCandidate,
          };
        }
      }
    }
    return { matched: false };
  } catch (err: any) {
    console.warn("[ai-secretary] matchSecretaryForPhone error:", err?.message);
    return { matched: false };
  }
}

function sanitizeApprovalPayload(rawPayload: Record<string, any> | null | undefined): Record<string, any> {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) {
    return {};
  }
  const copy: Record<string, any> = {};
  for (const [k, v] of Object.entries(rawPayload)) {
    const lower = k.toLowerCase();
    if (
      lower.includes("header") ||
      lower.includes("token") ||
      lower.includes("secret") ||
      lower.includes("password") ||
      lower.includes("api_key") ||
      lower.includes("apikey")
    ) {
      continue;
    }
    copy[k] = v;
  }
  return copy;
}

export interface CreateApprovalParams {
  companyId: string;
  agentId?: string | null;
  agent?: any;
  kind: "payment_receipt" | "tool_write" | "handoff_sensitive";
  leadNumero: string;
  leadNome?: string | null;
  summary: string;
  payload?: Record<string, any>;
  requestedByInstanceId?: string | null;
  dedupKey?: string | null;
}

/**
 * Crea una solicitud HITL en `agent_approval_requests` y notifica por WhatsApp a los números autorizados.
 */
export async function createAndNotifyApprovalRequest(
  admin: any,
  params: CreateApprovalParams,
): Promise<{ ok: boolean; approval?: any; notifiedCount: number; deduplicated?: boolean; error?: string }> {
  const { companyId, kind, leadNumero, leadNome, summary } = params;
  if (!companyId || !leadNumero || !summary) {
    return { ok: false, notifiedCount: 0, error: "missing_required_fields" };
  }

  const safePayload = sanitizeApprovalPayload({
    ...(params.payload || {}),
    ...(params.dedupKey ? { inbound_message_id: params.dedupKey } : {}),
  });

  if (params.dedupKey) {
    try {
      const { data: existing } = await admin
        .from("agent_approval_requests")
        .select("*")
        .eq("company_id", companyId)
        .eq("kind", kind)
        .eq("lead_numero", leadNumero)
        .contains("payload", { inbound_message_id: params.dedupKey })
        .limit(1)
        .maybeSingle();

      if (existing?.id) {
        return { ok: true, approval: existing, notifiedCount: 0, deduplicated: true };
      }
    } catch {}
  }

  let agentRow = params.agent || null;
  if (!agentRow && params.agentId) {
    try {
      const { data } = await admin
        .from("agent_config")
        .select("id, secretary_enabled, secretary_phones, nome_agente")
        .eq("company_id", companyId)
        .eq("id", params.agentId)
        .maybeSingle();
      agentRow = data;
    } catch {}
  }

  let inserted: any = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const codeNum = Math.floor(1000 + Math.random() * 9000);
    const shortCode = `AP-${codeNum}`;
    try {
      const { data, error } = await admin
        .from("agent_approval_requests")
        .insert({
          company_id: companyId,
          agent_id: params.agentId ?? agentRow?.id ?? null,
          short_code: shortCode,
          kind,
          lead_numero: leadNumero,
          lead_nome: leadNome ?? null,
          summary: String(summary).slice(0, 600),
          payload: safePayload,
          status: "pending",
          requested_by_instance_id: params.requestedByInstanceId ?? null,
        })
        .select("*")
        .single();

      if (!error && data) {
        inserted = data;
        break;
      }
      if (error && error.code !== "23505") {
        console.warn("[ai-secretary] Insert approval error:", error.message);
        return { ok: false, notifiedCount: 0, error: error.message };
      }
    } catch (err: any) {
      return { ok: false, notifiedCount: 0, error: err?.message || "insert_failed" };
    }
  }

  if (!inserted) {
    return { ok: false, notifiedCount: 0, error: "failed_to_generate_short_code" };
  }

  try {
    await admin.rpc("push_notificacao", {
      _company_id: companyId,
      _tipo: "geral",
      _titulo: `Aprobación pendiente [${inserted.short_code}]`,
      _descricao: `${leadNome || leadNumero}: ${String(summary).slice(0, 140)}`,
      _link: "/app/agente",
      _ref_id: inserted.id,
    });
  } catch (notifErr: any) {
    console.warn("[ai-secretary] push_notificacao warning:", notifErr?.message);
  }

  let notifiedCount = 0;
  const phones: string[] = Array.isArray(agentRow?.secretary_phones)
    ? agentRow.secretary_phones.map((p: any) => normalizeSecretaryDigits(String(p || ""))).filter((p: string) => p.length >= 10)
    : [];

  if (phones.length > 0) {
    const waInst = await resolveConnectedWhatsappInstance(
      admin,
      companyId,
      params.requestedByInstanceId ?? null,
    );
    if (waInst) {
      const msgText =
        `🔔 Aprobación pendiente [${inserted.short_code}]\n` +
        `Cliente: ${leadNome || leadNumero} (${leadNumero})\n` +
        `Detalle: ${summary}\n\n` +
        `Responde: APROBAR ${inserted.short_code} o RECHAZAR ${inserted.short_code}`;

      for (const phone of phones.slice(0, 5)) {
        try {
          await waSendText(waInst, phone, msgText);
          notifiedCount++;
        } catch (sendErr: any) {
          console.warn(`[ai-secretary] Failed notifying ${phone}:`, sendErr?.message);
        }
      }
    }
  }

  return { ok: true, approval: inserted, notifiedCount };
}

export interface ResolveApprovalParams {
  companyId: string;
  approvalIdOrCode: string;
  decision: "approved" | "rejected";
  resolvedBy: string;
}

/**
 * Resuelve una aprobación HITL pendiente (desde WhatsApp o panel) y ejecuta la acción autorizada.
 */
export async function resolveApprovalRequest(
  admin: any,
  params: ResolveApprovalParams,
): Promise<{
  ok: boolean;
  approval?: any;
  executionResult?: any;
  summaryText: string;
  error?: string;
}> {
  const { companyId, decision, resolvedBy } = params;
  const rawKey = String(params.approvalIdOrCode || "").trim();
  if (!rawKey) {
    return { ok: false, summaryText: "Código o ID de aprobación requerido.", error: "missing_code" };
  }

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawKey);
  const normalizedCode = /^\d{3,6}$/.test(rawKey)
    ? `AP-${rawKey}`
    : rawKey.toUpperCase().replace(/^AP[\s_-]?(\d+)$/, "AP-$1");

  let query = admin
    .from("agent_approval_requests")
    .select("*")
    .eq("company_id", companyId)
    .eq("status", "pending");

  query = isUuid ? query.eq("id", rawKey) : query.eq("short_code", normalizedCode);

  const { data: approval, error: findErr } = await query.maybeSingle();
  if (findErr || !approval) {
    return {
      ok: false,
      summaryText: `No se encontró ninguna solicitud pendiente para "${isUuid ? rawKey : normalizedCode}".`,
      error: findErr?.message || "not_found_or_already_resolved",
    };
  }

  const nowIso = new Date().toISOString();
  if (approval.expires_at && new Date(approval.expires_at).getTime() < Date.now()) {
    try {
      await admin
        .from("agent_approval_requests")
        .update({ status: "expired", resolved_by: "system_expired", resolved_at: nowIso })
        .eq("id", approval.id);
    } catch {}
    return {
      ok: false,
      summaryText: `La solicitud ${approval.short_code} ya expiró.`,
      error: "expired",
    };
  }

  const { data: updated, error: updErr } = await admin
    .from("agent_approval_requests")
    .update({
      status: decision,
      resolved_by: resolvedBy,
      resolved_at: nowIso,
    })
    .eq("id", approval.id)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();

  if (updErr || !updated) {
    return {
      ok: false,
      summaryText: `No se pudo actualizar la solicitud ${approval.short_code} (posiblemente ya fue resuelta).`,
      error: updErr?.message || "race_already_resolved",
    };
  }

  let executionResult: any = null;
  let updatedPayload = { ...(updated.payload || {}) };

  if (decision === "approved") {
    if (updated.kind === "tool_write" && updatedPayload?.toolName && updated.agent_id) {
      executionResult = await executeVerifiedTool(admin, {
        companyId,
        agentId: updated.agent_id,
        toolName: String(updatedPayload.toolName),
        args: {
          ...(updatedPayload.args && typeof updatedPayload.args === "object" ? updatedPayload.args : {}),
          customer_confirmed: true,
        },
        context: {
          phone: updated.lead_numero,
          numero: updated.lead_numero,
          name: updated.lead_nome ?? null,
          companyId,
        },
        ownerApproved: true,
      });

      updatedPayload = {
        ...updatedPayload,
        execution_result: executionResult,
      };
      try {
        await admin
          .from("agent_approval_requests")
          .update({ payload: updatedPayload })
          .eq("id", updated.id);
        updated.payload = updatedPayload;
      } catch {}

      try {
        await admin
          .from("crm_cards")
          .update({
            active_task: {
              tipo: "tool_approval",
              estado: "completed",
              tool: updatedPayload.toolName,
              updated_at: nowIso,
            },
          })
          .eq("company_id", companyId)
          .eq("numero", updated.lead_numero);
      } catch {}
    } else if (updated.kind === "payment_receipt") {
      try {
        await admin
          .from("crm_cards")
          .update({
            active_task: {
              tipo: "verify_payment",
              estado: "approved",
              approved_by: resolvedBy,
              updated_at: nowIso,
            },
          })
          .eq("company_id", companyId)
          .eq("numero", updated.lead_numero);
      } catch {}
    }
  } else {
    try {
      await admin
        .from("crm_cards")
        .update({
          active_task: {
            tipo: updated.kind,
            estado: "rejected",
            rejected_by: resolvedBy,
            updated_at: nowIso,
          },
        })
        .eq("company_id", companyId)
        .eq("numero", updated.lead_numero);
    } catch {}
  }

  const label = updated.lead_nome ? `${updated.lead_nome} (${updated.lead_numero})` : updated.lead_numero;
  let summaryText =
    decision === "approved"
      ? `✅ Solicitud ${updated.short_code} APROBADA (${label}).`
      : `❌ Solicitud ${updated.short_code} RECHAZADA (${label}).`;

  if (decision === "approved" && updated.kind === "tool_write") {
    summaryText += executionResult?.ok
      ? `\nHerramienta "${updatedPayload.toolName}" ejecutada correctamente (HTTP ${executionResult.status}).`
      : `\nAviso al ejecutar "${updatedPayload.toolName}": ${executionResult?.error || "error en destino"}.`;
  }

  return {
    ok: true,
    approval: updated,
    executionResult,
    summaryText,
  };
}

function getTodayUtcRangeForTimezone(timezone: string): { todayIsoDate: string; startIso: string; endIso: string; yesterdayStartIso: string } {
  const tz = timezone || "America/Sao_Paulo";
  const now = new Date();
  let todayIsoDate = "";
  try {
    todayIsoDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  } catch {
    todayIsoDate = now.toISOString().slice(0, 10);
  }
  const midnightGuess = new Date(`${todayIsoDate}T00:00:00.000Z`);
  let offsetMs = 0;
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).formatToParts(midnightGuess);
    const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
    const asUtc = Date.UTC(
      Number(map.year),
      Number(map.month) - 1,
      Number(map.day),
      Number(map.hour === "24" ? "0" : map.hour),
      Number(map.minute),
      Number(map.second),
    );
    offsetMs = asUtc - midnightGuess.getTime();
  } catch {}
  const startUtc = new Date(midnightGuess.getTime() - offsetMs);
  const endUtc = new Date(startUtc.getTime() + 24 * 60 * 60_000);
  const yesterdayStartUtc = new Date(startUtc.getTime() - 24 * 60 * 60_000);
  return {
    todayIsoDate,
    startIso: startUtc.toISOString(),
    endIso: endUtc.toISOString(),
    yesterdayStartIso: yesterdayStartUtc.toISOString(),
  };
}

export async function buildExecutiveSnapshot(
  admin: any,
  companyId: string,
  timezone = "America/Sao_Paulo",
) {
  const { todayIsoDate, startIso, endIso, yesterdayStartIso } = getTodayUtcRangeForTimezone(timezone);
  const twoHoursAgoIso = new Date(Date.now() - 2 * 60 * 60_000).toISOString();

  const [
    leadsTodayRes,
    leadsYesterdayRes,
    pendingApprovalsRes,
    appointmentsRes,
    waInstancesRes,
    staleCardsRes,
    stagesRes,
  ] = await Promise.all([
    admin
      .from("crm_cards")
      .select("id, numero, nome, stage_id, created_at")
      .eq("company_id", companyId)
      .gte("created_at", startIso)
      .lt("created_at", endIso)
      .order("created_at", { ascending: false })
      .limit(20),
    admin
      .from("crm_cards")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .gte("created_at", yesterdayStartIso)
      .lt("created_at", startIso),
    admin
      .from("agent_approval_requests")
      .select("id, short_code, kind, lead_numero, lead_nome, summary, created_at")
      .eq("company_id", companyId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(10),
    admin
      .from("mensagem_agendada")
      .select("id, numero, nome_lead, titulo, mensagem, agendado_para, status")
      .eq("company_id", companyId)
      .gte("agendado_para", startIso)
      .lt("agendado_para", endIso)
      .order("agendado_para", { ascending: true })
      .limit(15),
    admin
      .from("whatsapp_instances")
      .select("id, instance_name, status, paused, provider")
      .eq("company_id", companyId)
      .in("provider", ["dapi", "dapi_official"]),
    admin
      .from("crm_cards")
      .select("numero, nome, ultima_em, ultima_mensagem, stage_id")
      .eq("company_id", companyId)
      .lt("ultima_em", twoHoursAgoIso)
      .order("ultima_em", { ascending: false })
      .limit(16),
    admin
      .from("crm_stage")
      .select("id, nome, tipo")
      .eq("company_id", companyId)
      .order("ordem", { ascending: true }),
  ]);

  const staleCandidates = staleCardsRes.data ?? [];
  const unansweredChats: Array<{ numero: string; nome: string | null; ultima_em: string; ultima_mensagem: string | null }> = [];
  if (staleCandidates.length > 0) {
    for (const c of staleCandidates) {
      if (unansweredChats.length >= 8) break;
      try {
        const { data: lastMsg } = await admin
          .from("mensagens")
          .select("autor")
          .eq("company_id", companyId)
          .eq("numero", c.numero)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (lastMsg?.autor === "contato") {
          unansweredChats.push({
            numero: c.numero,
            nome: c.nome ?? null,
            ultima_em: c.ultima_em,
            ultima_mensagem: c.ultima_mensagem ?? null,
          });
        }
      } catch {}
    }
  }

  const instances = waInstancesRes.data ?? [];
  const connectedLines = instances.filter((i: any) => (i.status === "connected" || i.status === "open") && !i.paused);
  const disconnectedLines = instances.filter((i: any) => !connectedLines.includes(i));

  return {
    todayIsoDate,
    timezone,
    leads_hoy: (leadsTodayRes.data ?? []).map((l: any) => ({
      numero: l.numero,
      nome: l.nome,
      stage_id: l.stage_id,
    })),
    leads_ayer_count: leadsYesterdayRes.count ?? 0,
    aprobaciones_pendientes: pendingApprovalsRes.data ?? [],
    citas_hoy: (appointmentsRes.data ?? []).map((a: any) => ({
      titulo: a.titulo,
      numero: a.numero,
      nome_lead: a.nome_lead,
      agendado_para: a.agendado_para,
      status: a.status,
    })),
    lineas_whatsapp: {
      total: instances.length,
      conectadas: connectedLines.map((i: any) => i.instance_name),
      desconectadas: disconnectedLines.map((i: any) => ({ name: i.instance_name, status: i.status, paused: Boolean(i.paused) })),
    },
    chats_sin_respuesta_2h: unansweredChats,
    etapas_crm: (stagesRes.data ?? []).map((s: any) => s.nome),
  };
}

export interface HandleSecretaryMessageParams {
  companyId: string;
  agent: any;
  ownerPhone: string;
  text: string;
  instanceId?: string | null;
  isAudioMessage?: boolean;
  audioUrl?: string | null;
  audioMime?: string | null;
}

/**
 * Procesa mensajes entrantes enviados por el dueño/admin al bot en Modo Secretario Ejecutivo.
 */
export async function handleSecretaryMessage(
  admin: any,
  params: HandleSecretaryMessageParams,
): Promise<{ handled: boolean; mode: string; reply?: string }> {
  const { companyId, agent, ownerPhone, instanceId } = params;
  const waInst = await resolveConnectedWhatsappInstance(admin, companyId, instanceId);

  const sendReplyToOwner = async (msg: string) => {
    if (!waInst) {
      console.warn("[ai-secretary] No connected WhatsApp instance to reply to owner.");
      return;
    }
    try {
      await waSendText(waInst, ownerPhone, msg);
    } catch (err: any) {
      console.warn("[ai-secretary] Failed sending reply to owner:", err?.message);
    }
  };

  let effectiveText = String(params.text || "").trim();
  const upperRaw = effectiveText.toUpperCase();
  const needsAudioTranscription =
    Boolean(params.isAudioMessage) ||
    !effectiveText ||
    upperRaw === "[ÁUDIO]" ||
    upperRaw === "[AUDIO]";

  if (needsAudioTranscription && (!effectiveText || upperRaw === "[ÁUDIO]" || upperRaw === "[AUDIO]")) {
    let transcribed: string | null = null;
    if (params.audioUrl) {
      try {
        const { transcribeIncomingAudio } = await import("@/lib/media-understanding.server");
        transcribed = await transcribeIncomingAudio(params.audioUrl, params.audioMime ?? null);
      } catch (err: any) {
        console.warn("[ai-secretary] Audio transcription error:", err?.message);
      }
    }

    if (!transcribed || !transcribed.trim()) {
      const msg = "No pude transcribir tu nota de voz. ¿Podrías repetir el audio más claro o enviármelo por escrito?";
      await sendReplyToOwner(msg);
      return { handled: true, mode: "audio_unreadable", reply: msg };
    }
    effectiveText = transcribed.trim();
  }

  // Atajo determinista HITL (0 costo LLM)
  const cmdMatch = effectiveText.match(
    /^\s*(aprobar|aprovar|approve|rechazar|rejeitar|reject|denegar)(?:\s+(?:AP[\s_-]?)?(\d{3,6}))?\s*[!.]?\s*$/i,
  );
  if (cmdMatch) {
    const verb = cmdMatch[1].toLowerCase();
    const decision: "approved" | "rejected" =
      verb.startsWith("ap") ? "approved" : "rejected";
    const explicitDigits = cmdMatch[2];

    if (explicitDigits) {
      const res = await resolveApprovalRequest(admin, {
        companyId,
        approvalIdOrCode: `AP-${explicitDigits}`,
        decision,
        resolvedBy: `whatsapp:${ownerPhone}`,
      });
      await sendReplyToOwner(res.summaryText);
      try {
        await admin.from("audit_log").insert({
          company_id: companyId,
          acao: "ai_secretary_turn",
          detalhes: { ownerPhone, mode: "hitl_shortcut", code: `AP-${explicitDigits}`, decision, ok: res.ok },
        });
      } catch {}
      return { handled: true, mode: "hitl_shortcut", reply: res.summaryText };
    }

    // Si omitió el código: listar o resolver si hay exactamente 1
    const { data: pendings } = await admin
      .from("agent_approval_requests")
      .select("id, short_code, lead_numero, lead_nome, summary, created_at")
      .eq("company_id", companyId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(10);

    const pendingList = pendings ?? [];
    if (pendingList.length === 0) {
      const msg = "No tienes aprobaciones pendientes en este momento.";
      await sendReplyToOwner(msg);
      return { handled: true, mode: "hitl_empty", reply: msg };
    }
    if (pendingList.length === 1) {
      const res = await resolveApprovalRequest(admin, {
        companyId,
        approvalIdOrCode: pendingList[0].short_code,
        decision,
        resolvedBy: `whatsapp:${ownerPhone}`,
      });
      await sendReplyToOwner(res.summaryText);
      try {
        await admin.from("audit_log").insert({
          company_id: companyId,
          acao: "ai_secretary_turn",
          detalhes: { ownerPhone, mode: "hitl_single_shortcut", code: pendingList[0].short_code, decision, ok: res.ok },
        });
      } catch {}
      return { handled: true, mode: "hitl_single_shortcut", reply: res.summaryText };
    }

    const listText = pendingList
      .map((p: any) => `• [${p.short_code}] ${p.lead_nome || p.lead_numero}: ${String(p.summary).slice(0, 80)}`)
      .join("\n");
    const msg =
      `Tienes ${pendingList.length} aprobaciones pendientes. Indica el código exacto (ej. ${decision === "approved" ? "APROBAR" : "RECHAZAR"} ${pendingList[0].short_code}):\n\n${listText}`;
    await sendReplyToOwner(msg);
    return { handled: true, mode: "hitl_list", reply: msg };
  }

  // Consultas y comandos ejecutivos (1 única llamada LLM con snapshot vivo precargado)
  const snapshot = await buildExecutiveSnapshot(
    admin,
    companyId,
    agent?.secretary_timezone || "America/Sao_Paulo",
  );

  const systemPrompt = `Eres el Secretario Ejecutivo privado del dueño de la empresa. Hablas directo, claro y conciso por WhatsApp en el idioma del dueño (generalmente español).

DATOS VIVOS DE LA EMPRESA HOY (${snapshot.todayIsoDate}, tz: ${snapshot.timezone}):
${JSON.stringify(snapshot)}

REGLAS ESTRICTAS:
1. Solo afirma cifras, leads, citas, líneas WhatsApp o aprobaciones que estén en el JSON anterior. Nunca inventes datos.
2. Si el dueño pide pausar/reactivar la IA de un lead, mover un lead de etapa, ver el resumen de un chat o crear un recordatorio, rellena "action". De lo contrario, deja "action": null.
3. Responde EXCLUSIVAMENTE un objeto JSON válido con este formato:
{
  "reply": "Mensaje corto y útil para el dueño",
  "action": null | {
    "type": "pause_lead_ai" | "resume_lead_ai" | "move_lead_stage" | "get_lead_summary" | "create_reminder",
    "numero": "teléfono del lead si aplica",
    "stage_name": "nombre exacto de etapa CRM si aplica",
    "reminder_text": "texto del recordatorio si aplica",
    "reminder_at": "ISO-8601 con zona si aplica"
  }
}`;

  let parsedReply = "No pude procesar tu consulta en este momento.";
  let action: any = null;
  let llmUsed = false;

  try {
    const rawOut = await lovableAiChat(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: effectiveText },
      ],
      {
        provider: agent?.ai_provider || "gemini",
        model: agent?.ai_model || undefined,
        jsonMode: true,
        maxTokens: 1200,
        temperature: 0.2,
        telemetry: {
          companyId,
          agentId: agent?.id ?? null,
          feature: "ai_secretary",
        },
      },
    );

    if (rawOut) llmUsed = true;
    const clean = rawOut.replace(/```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    const json = JSON.parse(clean);
    if (json && typeof json.reply === "string" && json.reply.trim()) {
      parsedReply = json.reply.trim();
    }
    if (json && json.action && typeof json.action === "object" && !Array.isArray(json.action)) {
      action = json.action;
    }
  } catch (llmErr: any) {
    console.warn("[ai-secretary] LLM error:", llmErr?.message);
  }

  let finalReply = parsedReply;
  let executedActionType: string | null = null;

  if (action?.type) {
    try {
      const findLeadCard = async (rawLeadNum?: string) => {
        const digits = normalizeSecretaryDigits(rawLeadNum);
        if (!digits) return null;
        const { data: exact } = await admin
          .from("crm_cards")
          .select("id, numero, nome, stage_id")
          .eq("company_id", companyId)
          .eq("numero", digits)
          .limit(1)
          .maybeSingle();
        if (exact) return exact;

        const { data: candidates } = await admin
          .from("crm_cards")
          .select("id, numero, nome, stage_id")
          .eq("company_id", companyId)
          .ilike("numero", `%${digits.slice(-8)}%`)
          .limit(5);
        return (candidates ?? []).find((c: any) => secretaryPhonesMatch(c.numero, digits)) || (candidates ?? [])[0] || null;
      };

      if (action.type === "pause_lead_ai" || action.type === "resume_lead_ai") {
        const card = await findLeadCard(action.numero);
        if (card?.numero) {
          const pausar = action.type === "pause_lead_ai";
          await admin.from("contact_pause").upsert(
            {
              company_id: companyId,
              numero: card.numero,
              pausado: pausar,
              pausado_por: pausar ? "humano" : "ia",
              pausado_em: new Date().toISOString(),
            },
            { onConflict: "company_id,numero" },
          );
          executedActionType = action.type;
        } else {
          finalReply = `${parsedReply}\n\n(No encontré un lead con ese número en tu CRM para ${action.type === "pause_lead_ai" ? "pausar" : "reactivar"} la IA.)`;
        }
      } else if (action.type === "move_lead_stage") {
        const card = await findLeadCard(action.numero);
        const targetStageName = String(action.stage_name || "").trim().toLowerCase();
        const { data: stages } = await admin
          .from("crm_stage")
          .select("id, nome")
          .eq("company_id", companyId);
        const stageRow = (stages ?? []).find((s: any) => String(s.nome || "").trim().toLowerCase() === targetStageName);
        if (card?.id && stageRow?.id) {
          await moveCardToStage(admin, card.id, stageRow.id);
          executedActionType = "move_lead_stage";
        } else {
          finalReply = `${parsedReply}\n\n(No se pudo mover la etapa: verifica que el lead y la etapa "${action.stage_name || ""}" existan.)`;
        }
      } else if (action.type === "get_lead_summary") {
        const card = await findLeadCard(action.numero);
        const targetNum = card?.numero || normalizeSecretaryDigits(action.numero);
        if (targetNum) {
          const { data: recentMsgs } = await admin
            .from("mensagens")
            .select("autor, texto, created_at")
            .eq("company_id", companyId)
            .eq("numero", targetNum)
            .order("created_at", { ascending: false })
            .limit(8);
          const snippet = (recentMsgs ?? [])
            .reverse()
            .map((m: any) => `- ${m.autor === "contato" ? "Cliente" : "Equipo/IA"}: ${String(m.texto || "").slice(0, 120)}`)
            .join("\n");
          finalReply = snippet
            ? `${parsedReply}\n\nÚltimos mensajes (${card?.nome || targetNum}):\n${snippet}`
            : `${parsedReply}\n\n(Sin mensajes recientes para ${targetNum}.)`;
          executedActionType = "get_lead_summary";
        }
      } else if (action.type === "create_reminder") {
        const reminderText = String(action.reminder_text || effectiveText).trim().slice(0, 500);
        const parsedAt = action.reminder_at ? new Date(action.reminder_at) : new Date(Date.now() + 60 * 60_000);
        const scheduledIso = Number.isNaN(parsedAt.getTime())
          ? new Date(Date.now() + 60 * 60_000).toISOString()
          : parsedAt.toISOString();
        await admin.from("mensagem_agendada").insert({
          company_id: companyId,
          numero: ownerPhone,
          titulo: "Recordatorio Ejecutivo",
          mensagem: reminderText,
          agendado_para: scheduledIso,
          status: "agendado",
          tipo: "compromisso",
          origem: "ia",
        });
        executedActionType = "create_reminder";
      }
    } catch (actErr: any) {
      console.warn("[ai-secretary] Executive action error:", actErr?.message);
    }
  }

  await sendReplyToOwner(finalReply);

  try {
    await admin.from("audit_log").insert({
      company_id: companyId,
      acao: "ai_secretary_turn",
      detalhes: {
        ownerPhone,
        agentId: agent?.id ?? null,
        actionType: executedActionType,
      },
    });
  } catch {}

  if (llmUsed) {
    await debitAiCredits(admin, companyId, 1, "ai_secretary", agent?.id ?? undefined);
  }

  return { handled: true, mode: "executive_llm", reply: finalReply };
}
