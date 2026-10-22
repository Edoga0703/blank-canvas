// Diagnóstico de inicialização
console.log("[uazapi-internal] Module loaded");

export async function handleUazapiWebhookInternal(inst: any, normalized: any) {
  console.log(`[uazapi-internal] handleUazapiWebhookInternal entry: ${normalized.event}`);
  
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Log recursivo para depurar o objeto inst
  console.log(`[uazapi-internal] inst object keys:`, Object.keys(inst || {}));
  console.log(`[uazapi-internal] inst.company_id: ${inst?.company_id}`);

  const companyId = inst?.company_id;
  if (!companyId) {
    console.error("[uazapi-internal] CRITICAL: companyId is missing in inst object", inst);
    return;
  }

  // Se for mensagem, extraímos os dados para o motor de IA e CRM
  if (normalized.event === "messages.upsert") {
    const payload = normalized;
    
    // Helper para busca profunda (copiado do whatsapp-webhook para consistência)
    const findKey = (obj: any): any => {
      if (!obj || typeof obj !== 'object') return null;
      if (obj.key && obj.key.remoteJid) return obj.key;
      for (const k in obj) {
        const res = findKey(obj[k]);
        if (res) return res;
      }
      return null;
    };

    const findMessage = (obj: any): any => {
      if (!obj || typeof obj !== 'object') return null;
      if (
        obj.conversation || obj.extendedTextMessage || obj.text ||
        obj.audioMessage || obj.pttMessage || obj.imageMessage ||
        obj.videoMessage || obj.documentMessage || obj.stickerMessage ||
        obj.locationMessage
      ) return obj;
      for (const k in obj) {
        if (k === 'key') continue;
        const res = findMessage(obj[k]);
        if (res) return res;
      }
      return null;
    };

    const key = findKey(payload);
    const message = findMessage(payload);
    
    const remoteJid = payload?.remoteJid || key?.remoteJid || payload?.data?.key?.remoteJid || payload?.data?.remoteJid || "";
    let number = (remoteJid.split("@")[0] || payload?.number || payload?.data?.number || "").replace(/\D/g, "");
    const rawPushName = payload?.pushName || payload?.data?.pushName || payload?.senderName || payload?.data?.senderName || payload?.notify;
    const providerMessageId = key?.id || payload?.id || payload?.data?.key?.id;

    // Contatos com privacidade de número chegam com o ID interno (@lid) no lugar
    // do telefone: sem converter, o mesmo contato vira uma segunda conversa.
    const ehLid = String(remoteJid || "").toLowerCase().includes("@lid") ||
      (!String(remoteJid || "").includes("@g.us") && number.length >= 15 && !number.startsWith("120363"));
    if (ehLid && number) {
      const pnDireto = String(
        payload?.senderPn || payload?.sender_pn || payload?.data?.senderPn || payload?.data?.sender_pn ||
        key?.senderPn || key?.participantPn || payload?.participantPn || "",
      ).split("@")[0]?.replace(/\D/g, "") ?? "";
      if (pnDireto && pnDireto.length >= 10 && pnDireto.length <= 14) {
        number = pnDireto;
      } else if (inst?.instance_token) {
        try {
          const { uazResolveLidPhone } = await import("@/lib/uazapi.server");
          const real = await uazResolveLidPhone(inst.instance_token, number);
          if (real) number = real;
        } catch (e: any) {
          console.warn("[uazapi-internal] Falha ao resolver @lid:", e?.message);
        }
      }
    }

    const mAudio = message?.audioMessage || message?.pttMessage || null;
    const mImage = message?.imageMessage || null;
    const mVideo = message?.videoMessage || null;
    const mDoc = message?.documentMessage || null;
    const mSticker = message?.stickerMessage || null;
    const mLoc = message?.locationMessage || null;
    const innerMsg = message?.extendedTextMessage || mImage || mVideo || mDoc || mAudio || mSticker || message;
    let text = innerMsg?.text || innerMsg?.caption || message?.conversation || (typeof message === 'string' ? message : "");

    // Localização: guarda rótulo + link com coordenadas para o chat renderizar o mapa.
    if (mLoc) {
      const lat = Number(mLoc.degreesLatitude);
      const lng = Number(mLoc.degreesLongitude);
      const label = String(mLoc.name || mLoc.address || "").trim();
      text = Number.isFinite(lat) && Number.isFinite(lng)
        ? `📍 Localização${label ? `: ${label}` : ""}\nhttps://www.google.com/maps?q=${lat},${lng}`
        : `📍 Localização${label ? `: ${label}` : ""}`;
    }

    // Lead vindo de anúncio Click-to-WhatsApp: o link e o título do anúncio vêm
    // em externalAdReply e antes eram descartados.
    const { extractAdContext, extractTrackingFromText, deriveCanal } = await import("@/lib/tracking-utils");
    const adCtx = extractAdContext(payload);
    if (adCtx && (adCtx.sourceUrl || adCtx.title)) {
      const linha = [
        `📣 Veio do anúncio${adCtx.title ? `: ${adCtx.title}` : ""}`,
        adCtx.sourceUrl ? adCtx.sourceUrl : null,
      ].filter(Boolean).join("\n");
      text = text ? `${text}\n\n${linha}` : linha;
    }

    // Resposta de formulário/botão do WhatsApp (anúncios com Flow): não é mídia,
    // mas chega sem texto e aparecia como "Mídia indisponível" no chat.
    if (!text) {
      const { extractInteractiveText } = await import("@/lib/wa-interactive");
      const interativo = extractInteractiveText(payload);
      if (interativo) text = interativo;
    }

    // Extração de metadados de mídia
    let midiaUrl: string | null = innerMsg?.url || innerMsg?.directPath || null;
    let midiaTipo: string | null = null;
    let midiaMime: string | null = innerMsg?.mimetype || null;
    let midiaNome: string | null = innerMsg?.fileName || null;

    if (mAudio) {
      midiaTipo = "audio";
      midiaUrl = midiaUrl || mAudio.url || mAudio.directPath || null;
      midiaMime = midiaMime || mAudio.mimetype || "audio/ogg";
    } else if (mImage) {
      midiaTipo = "image";
      midiaUrl = midiaUrl || mImage.url || mImage.directPath || null;
      midiaMime = midiaMime || mImage.mimetype || "image/jpeg";
    } else if (mVideo) {
      midiaTipo = "video";
      midiaUrl = midiaUrl || mVideo.url || mVideo.directPath || null;
      midiaMime = midiaMime || mVideo.mimetype || "video/mp4";
    } else if (mDoc) {
      midiaTipo = "document";
      midiaUrl = midiaUrl || mDoc.url || mDoc.directPath || null;
      midiaMime = midiaMime || mDoc.mimetype || "application/octet-stream";
      midiaNome = midiaNome || mDoc.fileName || mDoc.title || null;
    } else if (mSticker) {
      midiaTipo = "image";
      midiaUrl = midiaUrl || mSticker.url || mSticker.directPath || null;
      midiaMime = midiaMime || mSticker.mimetype || "image/webp";
    }

    // Se a Uazapi mandou a mídia em um campo diferente (comum em payloads normalizados)
    if (!midiaUrl && payload?.data?.message?.url) midiaUrl = payload.data.message.url;
    if (!midiaUrl && payload?.url) midiaUrl = payload.url;
    if (!midiaMime && payload?.mimetype) midiaMime = payload.mimetype;
    if (!midiaTipo) {
      const t = String(payload?.type || payload?.data?.messageType || payload?.messageType || midiaMime || "").toLowerCase();
      if (t.includes("audio") || t.includes("ptt")) midiaTipo = "audio";
      else if (t.includes("image")) midiaTipo = "image";
      else if (t.includes("video")) midiaTipo = "video";
      else if (t.includes("document")) midiaTipo = "document";
    }
    if (midiaTipo === "audio" && !text) text = "[ÁUDIO]";

    // URLs internas do WhatsApp frequentemente não vêm no webhook. Nesse caso,
    // baixa a mídia pela Uazapi e a guarda no storage antes de salvar a mensagem.
    const { isRenderableMediaUrl } = await import("@/lib/incoming-media.server");
    if (midiaTipo && !isRenderableMediaUrl(midiaUrl) && providerMessageId) {
      try {
        const { storeIncomingUazapiMedia } = await import("@/lib/incoming-media.server");
        const stored = await storeIncomingUazapiMedia({
          instanceToken: inst.instance_token,
          companyId,
          number,
          messageId: String(providerMessageId),
          message,
          fallbackMime: midiaMime,
          fileName: midiaNome,
        });
        if (stored) {
          midiaUrl = stored.url;
          midiaMime = stored.mime;
          midiaNome = midiaNome || stored.name;
        } else {
          console.warn(`[uazapi-internal] Media download unavailable for ${providerMessageId}`);
        }
      } catch (mediaError: any) {
        console.error(`[uazapi-internal] Media persistence failed for ${providerMessageId}:`, mediaError?.message);
      }
    }

    if (!number) {
      console.warn("[uazapi-internal] No number found in payload");
      return;
    }

    const ehGrupo = String(remoteJid || "").includes("@g.us");
    if (ehGrupo) {
      // Grupos: guardamos a mensagem para leitura/resposta manual, sem criar
      // lead no funil e sem acionar IA ou automações.
      const { data: co } = await supabaseAdmin
        .from("company")
        .select("grupos_ativos")
        .eq("id", companyId)
        .maybeSingle();
      if (!(co as any)?.grupos_ativos) {
        console.log(`[uazapi-internal] grupo ignorado (recurso desligado): ${remoteJid}`);
        return;
      }
      await salvarMensagemGrupo(supabaseAdmin, {
        companyId,
        instanceId: inst?.id ?? null,
        jid: remoteJid,
        nome: payload?.chatName || payload?.groupName || payload?.data?.chatName || null,
        remetente: rawPushName || null,
        texto: text || "",
        fromMe: key ? !!key.fromMe : !!payload.fromMe,
        messageId: providerMessageId ? String(providerMessageId) : null,
        midiaUrl,
        midiaTipo,
        midiaMime,
        midiaNome,
        userId: inst?.user_id ?? null,
      });
      return;
    }

    const { isNonContactJid } = await import("@/lib/jid");
    if (isNonContactJid(remoteJid, number)) {
      console.log(`[uazapi-internal] broadcast ignorado: ${remoteJid || number}`);
      return;
    }

    const fromMe = key ? !!key.fromMe : !!payload.fromMe;
    const direcao = fromMe ? "saida" : "entrada";
    const autor = fromMe ? "humano" : "contato";
    // pushName de mensagens nossas = nome do perfil da EMPRESA; nunca usar como nome do lead.
    const pushName = fromMe ? null : (rawPushName || null);
    const eventTimestamp = payload?.messageTimestamp || payload?.timestamp || payload?.data?.messageTimestamp || payload?.data?.timestamp || "sem-timestamp";
    const stableMessageId = String(providerMessageId || `uaz:${inst.id}:${number}:${eventTimestamp}:${text || midiaTipo || "mensagem"}`);

    console.log(`[uazapi-internal] DB INSERT: fromMe=${fromMe}, number=${number}, text=${text?.slice(0, 50)}`);

    // 1. Salvar mensagem
    console.log(`[uazapi-internal] Attempting DB insert for ${number}...`);
    
    // FALLBACK: Se inst.user_id for nulo, buscamos o primeiro admin da empresa
    let effectiveUserId = inst.user_id;
    if (!effectiveUserId) {
      console.log(`[uazapi-internal] Instance user_id is null, fetching fallback admin for company ${companyId}`);
      const { data: adminUser } = await supabaseAdmin
        .from("company_user")
        .select("user_id")
        .eq("company_id", companyId)
        .eq("ativo", true)
        .limit(1)
        .maybeSingle();
      effectiveUserId = adminUser?.user_id;
      console.log(`[uazapi-internal] Fallback user_id: ${effectiveUserId}`);
    }

    if (!effectiveUserId) {
      console.error("[uazapi-internal] CRITICAL: No user_id found for company", companyId);
      return;
    }

    // ECO DE MENSAGEM NOSSA (fromMe): o sistema já gravou a mensagem quando a IA
    // ou o atendente enviou. Sem esta conciliação a conversa mostra duplicado.
    if (fromMe) {
      const dezMinAtras = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const safeText = (text || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      const { data: jaGravada } = await supabaseAdmin
        .from("mensagens")
        .select("id, autor, whatsapp_message_id")
        .eq("company_id", companyId)
        .eq("numero", number)
        .eq("direcao", "saida")
        .or(`whatsapp_message_id.eq."${stableMessageId}",texto.eq."${safeText}"`)
        .gt("created_at", dezMinAtras)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (jaGravada) {
        if (!jaGravada.whatsapp_message_id) {
          await supabaseAdmin
            .from("mensagens")
            .update({ whatsapp_message_id: stableMessageId, status_envio: "enviado" } as any)
            .eq("id", jaGravada.id);
        }
        console.log(`[uazapi-internal] Echo reconciliado (sem duplicar) para ${number}`);
        return;
      }

      // Mensagem enviada direto pelo celular/WhatsApp Web por um humano:
      // atendimento humano assumiu → IA desligada para este contato.
      await supabaseAdmin
        .from("contact_pause")
        .upsert(
          { company_id: companyId, user_id: effectiveUserId, numero: number, pausado: true, pausado_por: "humano", pausado_em: new Date().toISOString() } as any,
          { onConflict: "company_id,numero" },
        );
    }

    const { data: insertedMsg, error: insertErr } = await supabaseAdmin
      .from("mensagens")
      .insert({
        company_id: companyId,
        user_id: effectiveUserId,
        numero: number,
        contato_nome: pushName || null,
        direcao: direcao,
        autor: autor,
        texto: text || "",
        whatsapp_message_id: stableMessageId,
        created_at: new Date().toISOString(),
        status_envio: 'enviado',
        midia_url: midiaUrl,
        midia_tipo: midiaTipo,
        midia_mime: midiaMime,
        midia_nome: midiaNome
      })
      .select("*")
      .maybeSingle();

    if (insertErr) {
      console.error("[uazapi-internal] DB Insert Error DETAILS:", JSON.stringify(insertErr, null, 2));
      return;
    }
    console.log(`[uazapi-internal] DB Insert SUCCESS: ${insertedMsg?.id}`);

    try {
      const { emitWebhook } = await import("@/lib/webhooks.server");
      await emitWebhook(companyId, fromMe ? "message.sent" : "message.received", {
        id: insertedMsg?.id,
        numero: number,
        contato_nome: pushName || null,
        texto: text || "",
        midia_tipo: midiaTipo,
        midia_url: midiaUrl,
        direcao,
      });
    } catch (e) { console.warn("[uazapi-internal] webhook emit failed", e); }

    // 2. Atualizar CRM
    const { upsertCard, getStagesBrief, pickLeadOwner } = await import("@/lib/crm-engine.server");
    const stages = await getStagesBrief(supabaseAdmin, companyId);
    const currentCard = await upsertCard(supabaseAdmin, companyId, effectiveUserId, number, pushName || null, text || "", stages, "whatsapp");

    // Foto do lead: URLs de perfil do WhatsApp expiram, então renovamos quando
    // está faltando ou tem mais de 24h (é o que fazia a foto "sumir" do Kanban).
    if (currentCard && !fromMe && inst?.instance_token) {
      try {
        const atualizadaEm = currentCard.foto_atualizada_em ? +new Date(currentCard.foto_atualizada_em) : 0;
        const isStored = (currentCard.foto_url || "").startsWith("/api/public/lead-photo") && (currentCard.foto_url || "").includes("&s=");
        const stale = !isStored || Date.now() - atualizadaEm > 7 * 24 * 3600 * 1000;
        if (stale) {
          const { syncLeadPhoto } = await import("@/lib/lead-photo.server");
          await syncLeadPhoto(supabaseAdmin as any, companyId, currentCard.id, number, inst.instance_token);
        }
      } catch (e: any) {
        console.warn("[uazapi-internal] profile pic refresh failed:", e?.message);
      }
    }


    // 2.0 Origem do lead (anúncio / link com UTM) — só preenche o que está vazio.
    if (currentCard && !fromMe) {
      try {
        const t = extractTrackingFromText(text);
        const patch: Record<string, string> = {};
        const set = (col: string, val: string | null | undefined) => {
          if (val && !(currentCard as any)[col]) patch[col] = String(val).slice(0, 500);
        };
        set("utm_source", t.utm_source); set("utm_medium", t.utm_medium);
        set("utm_campaign", t.utm_campaign); set("utm_term", t.utm_term);
        set("utm_content", t.utm_content); set("gclid", t.gclid); set("fbclid", t.fbclid);
        if (adCtx) {
          set("ctwa_clid", adCtx.ctwaClid ?? t.ctwa_clid);
          set("referrer", adCtx.sourceUrl);
          set("origem", adCtx.title || (adCtx.sourceId ? `Anúncio ${adCtx.sourceId}` : null));
          set("utm_campaign", adCtx.sourceId);
        } else {
          set("ctwa_clid", t.ctwa_clid);
        }
        const canal = deriveCanal(t, !!adCtx?.ctwaClid || !!adCtx?.sourceUrl);
        const canalAtual = (currentCard as any).canal_entrada;
        if (canal !== "whatsapp_direto" && (!canalAtual || canalAtual === "whatsapp_direto")) {
          patch.canal_entrada = canal;
        }
        if (Object.keys(patch).length) {
          await (supabaseAdmin as any).from("crm_cards").update(patch).eq("id", currentCard.id);
        }
      } catch (e: any) {
        console.warn("[uazapi-internal] tracking de anúncio falhou:", e?.message);
      }
    }

    if (currentCard && !fromMe) {
      // 2.1 PERSISTÊNCIA DE DONO (Dono Permanente)
      // Se o card já tem um dono e o lead retornou, mantemos o dono.
      // A lógica no upsertCard foi ajustada para não forçar dono em etapas de IA,
      // mas se o dono já existir (persistente), ele é respeitado.

      // 2.2 Busca configuração de IA da etapa atual
      const { data: stageConfig } = await supabaseAdmin
        .from("crm_stage")
        .select("modo_atendimento")
        .eq("id", currentCard.stage_id)
        .maybeSingle();

      const isManualMode = stageConfig?.modo_atendimento === 'manual';

      // Se a IA NÃO estiver ativa nesta etapa (modo manual), E o lead não tem dono, distribuímos
      if (isManualMode && !currentCard.owner_id) {
        console.log(`[uazapi-internal] Manual mode and no owner, picking owner for ${number}`);
        const ownerId = await pickLeadOwner(supabaseAdmin, companyId, currentCard.stage_id);
        if (ownerId) {
          await (supabaseAdmin as any).from("crm_cards").update({ owner_id: ownerId }).eq("id", currentCard.id);
        }
      } else if (!isManualMode && currentCard.owner_id) {
        // Se a etapa é de IA (auto/ia) mas o card tem um dono, verificamos se ele deve ser removido
        // Isso acontece se a conversa foi excluída anteriormente (o que remove o dono do card, mas aqui é redundância de segurança)
        // Ou se o lead retornou e a configuração da etapa exige que a IA assuma do zero.
        console.log(`[uazapi-internal] AI mode stage ${currentCard.stage_id} for card ${currentCard.id} with owner ${currentCard.owner_id}`);
      }
    }

    // 3. Executar somente um motor: régua fixa ou IA
    if (!fromMe && (text || midiaUrl)) {
      // Mídia recebida vira texto compreensível para a IA (áudio transcrito,
      // imagem/vídeo descritos, documento resumido).
      let textoParaIA = text || "";
      if (midiaUrl && midiaTipo) {
        try {
          const { understandIncomingMedia } = await import("@/lib/media-understanding.server");
          const entendido = await understandIncomingMedia({
            url: midiaUrl,
            tipo: midiaTipo,
            mime: midiaMime,
            caption: text && text !== "[ÁUDIO]" ? text : null,
          });
          if (entendido) {
            textoParaIA = entendido.texto;
            if (entendido.isAudio && insertedMsg?.id) {
              // Guarda a transcrição junto da mensagem para o atendente ler.
              await supabaseAdmin
                .from("mensagens")
                .update({ texto: entendido.texto } as any)
                .eq("id", insertedMsg.id);
            }
          }
        } catch (e: any) {
          console.warn("[uazapi-internal] media understanding failed:", e?.message);
        }
      }

      if (textoParaIA) {
        const { processInboundAutomation } = await import("@/lib/inbound-automation.server");
        const result = await processInboundAutomation(supabaseAdmin, {
          companyId,
          numero: number,
          texto: textoParaIA,
          inboundMessageId: stableMessageId,
          stageId: currentCard?.stage_id,
          // O agente sempre responde por texto, mesmo quando o cliente manda áudio.
          responderEmAudio: false,
        });
        console.log(`[uazapi-internal] Automation finished for ${number}: ${result.engine}`);
      }
    }
  } else if (normalized.event === "connection.update") {
    // Atualizar status da instância se necessário
    const state = normalized.data?.state;
    if (state) {
      console.log(`[uazapi-internal] Updating status for ${inst.instance_name} to ${state}`);
      const mappedStatus = state === "open" ? "connected" : "disconnected";
      await (supabaseAdmin as any)
        .from("whatsapp_instances")
        .update({ status: mappedStatus, last_state_at: new Date().toISOString() })
        .eq("id", inst.id);
    }
  }
}

/** Guarda mensagem de grupo (sem funil, sem IA) e mantém o grupo na lista. */
async function salvarMensagemGrupo(
  supabaseAdmin: any,
  p: {
    companyId: string;
    instanceId: string | null;
    jid: string;
    nome: string | null;
    remetente: string | null;
    texto: string;
    fromMe: boolean;
    messageId: string | null;
    midiaUrl: string | null;
    midiaTipo: string | null;
    midiaMime: string | null;
    midiaNome: string | null;
    userId: string | null;
  },
) {
  let userId = p.userId;
  if (!userId) {
    const { data: adminUser } = await supabaseAdmin
      .from("company_user")
      .select("user_id")
      .eq("company_id", p.companyId)
      .eq("ativo", true)
      .limit(1)
      .maybeSingle();
    userId = adminUser?.user_id ?? null;
  }
  if (!userId) return;

  const agora = new Date().toISOString();
  if (p.messageId) {
    const { data: ja } = await supabaseAdmin
      .from("mensagens")
      .select("id")
      .eq("company_id", p.companyId)
      .eq("whatsapp_message_id", p.messageId)
      .maybeSingle();
    if (ja) return;
  }

  await supabaseAdmin.from("mensagens").insert({
    company_id: p.companyId,
    user_id: userId,
    numero: p.jid,
    contato_nome: p.nome,
    grupo_jid: p.jid,
    remetente_nome: p.fromMe ? null : p.remetente,
    direcao: p.fromMe ? "saida" : "entrada",
    autor: p.fromMe ? "humano" : "contato",
    texto: p.texto,
    whatsapp_message_id: p.messageId,
    created_at: agora,
    status_envio: "enviado",
    midia_url: p.midiaUrl,
    midia_tipo: p.midiaTipo,
    midia_mime: p.midiaMime,
    midia_nome: p.midiaNome,
  } as any);

  await supabaseAdmin.from("whatsapp_grupo").upsert(
    {
      company_id: p.companyId,
      instance_id: p.instanceId,
      jid: p.jid,
      nome: p.nome,
      ultima_em: agora,
      updated_at: agora,
    },
    { onConflict: "company_id,jid" },
  );
}
