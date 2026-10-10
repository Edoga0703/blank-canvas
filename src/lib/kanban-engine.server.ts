// Motor de régua Kanban.
// Processa crm_cards em etapas com regua_ativa=true e dispara mensagem
// única por etapa; move card conforme condições de resposta/sem resposta.
import { firstNameOrEmpty } from "@/lib/lead-name";

type Admin = any;

type KanbanCardRow = {
  id: string;
  company_id: string;
  user_id?: string | null;
  numero: string;
  nome?: string | null;
  valor?: number | string | null;
  stage_id: string | null;
  entrou_stage_em: string;
  regua_ultimo_disparo_em?: string | null;
};

function delayToMs(valor: number, unidade: string): number {
  const v = Math.max(0, Number(valor) || 0);
  if (unidade === "minutos") return v * 60 * 1000;
  if (unidade === "horas") return v * 3600 * 1000;
  return v * 86400 * 1000; // dias
}

function renderTemplate(tpl: string, vars: Record<string, string | number>): string {
  // Substitui somente as variáveis. Quebras de linha, listas, emojis e
  // espaçamento configurados pelo cliente devem chegar intactos ao WhatsApp.
  return tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => String(vars[k] ?? ""));
}

function isPastHoraDoDia(hora?: string | null): boolean {
  if (!hora) return true;
  const [hh, mm] = hora.split(":").map((n) => parseInt(n, 10));
  const now = new Date();
  const target = new Date(now);
  target.setHours(hh || 0, mm || 0, 0, 0);
  return now.getTime() >= target.getTime();
}

async function processKanbanReguaCard(admin: Admin, card: KanbanCardRow): Promise<any | null> {
  const { getActiveInstance, waSendText, waSendMedia, waSendAudio } = await import("@/lib/wa-dispatch.server");

  const nowIso = new Date().toISOString();
  const { data: stage } = await admin
    .from("crm_stage")
    .select("id, nome, regua_ativa, delay_valor, delay_unidade, hora_do_dia, mensagem_tipo, mensagem_texto, mensagem_prompt, mensagem_midia_url, mensagem_midia_tipo, mensagem_midia_mime, mensagem_midia_nome, move_se_sem_resposta_dias, move_se_sem_resposta_para, parar_se_humano, modo_atendimento")
    .eq("id", card.stage_id)
    .maybeSingle();
  
  if (!stage || !stage.regua_ativa) return { id: card.id, status: "nao_aplicavel" };

  if (stage.parar_se_humano) {
    const { data: pause } = await admin
      .from("contact_pause")
      .select("pausado")
      .eq("company_id", card.company_id)
      .eq("numero", card.numero)
      .maybeSingle();
    if (pause?.pausado) return { id: card.id, skipped: "contato_pausado" };
  }

  const entrouMs = new Date(card.entrou_stage_em).getTime();
  // Delay 0 ou nulo = 0ms
  const delayMs = stage.delay_valor ? delayToMs(stage.delay_valor, stage.delay_unidade) : 0;
  const readyAt = entrouMs + delayMs;
  const now = Date.now();
  const iaMode = (stage as any).modo_atendimento === "ia";
  const onlyRules = stage.mensagem_tipo === "sem_mensagem" || (!stage.mensagem_texto && !stage.mensagem_prompt && !stage.mensagem_midia_url);
  const ultimoDisparoMs = card.regua_ultimo_disparo_em
    ? new Date(card.regua_ultimo_disparo_em).getTime()
    : 0;
  const jaDisparou = ultimoDisparoMs >= entrouMs;

  // Regra "sem resposta": só pode tirar o card da etapa DEPOIS que a etapa
  // cumpriu o papel dela (delay + mensagem enviada) e desde que o lead
  // realmente não tenha respondido. Antes, uma etapa sem mensagem utilizável
  // (ou em modo IA que não falou) movia o card assim que completava o prazo,
  // fazendo o lead "pular" a coluna sem receber nada.
  const podeMoverSemResposta = async (): Promise<boolean> => {
    if (!stage.move_se_sem_resposta_dias || !stage.move_se_sem_resposta_para) return false;
    if (stage.move_se_sem_resposta_para === card.stage_id) return false;

    // A contagem começa no disparo desta etapa. Sem disparo (etapa só de
    // regras ou IA), começa quando o delay da etapa venceu.
    let baseMs = jaDisparou
      ? new Date(card.regua_ultimo_disparo_em as string).getTime()
      : (iaMode || onlyRules)
        ? Math.max(entrouMs, readyAt)
        : null;
    if (baseMs === null) return false;

    // O prazo conta a partir da última mensagem que NÓS enviamos na etapa
    // (régua, IA ou atendente). Assim, se a IA respondeu e o cliente sumiu,
    // o card sai da etapa no prazo em vez de ficar preso.
    const { data: ultima } = await admin
      .from("mensagens")
      .select("created_at")
      .eq("company_id", card.company_id)
      .eq("numero", card.numero)
      .eq("direcao", "saida")
      .gte("created_at", new Date(entrouMs).toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (ultima?.created_at) baseMs = Math.max(baseMs, new Date(ultima.created_at).getTime());

    if (now < baseMs + stage.move_se_sem_resposta_dias * 86400 * 1000) return false;

    // "Sem resposta" de verdade: nenhuma mensagem de entrada depois da base.
    const { data: entrada } = await admin
      .from("mensagens")
      .select("id")
      .eq("company_id", card.company_id)
      .eq("numero", card.numero)
      .eq("direcao", "entrada")
      .gt("created_at", new Date(baseMs).toISOString())
      .limit(1);
    return !entrada?.length;
  };

  if (await podeMoverSemResposta()) {
    const { moveCardToStage } = await import("@/lib/crm-engine.server");
    await moveCardToStage(admin, card.id, stage.move_se_sem_resposta_para);
    return { id: card.id, moved: stage.move_se_sem_resposta_para };
  }

  if (iaMode || onlyRules) return { id: card.id, status: "nao_aplicavel" };
  if (jaDisparou) return { id: card.id, status: "ja_enviado" };
  
  // Se o delay for 0, ignoramos o check de tempo e hora para o primeiro disparo
  if (delayMs > 0) {
    if (now < readyAt) return { id: card.id, status: "aguardando_delay" };
    if (!isPastHoraDoDia(stage.hora_do_dia)) return { id: card.id, status: "aguardando_hora" };
  }


  const inst = await getActiveInstance(card.company_id);
  if (!inst || inst.status !== "connected" || inst.paused) {
    return { id: card.id, status: "whatsapp_desconectado" };
  }


  const diasSemResposta = Math.floor((now - entrouMs) / 86400000);
  const vars = {
    nome: firstNameOrEmpty(card.nome, (card as any).numero),
    valor: card.valor ? `R$ ${Number(card.valor).toFixed(2)}` : "",
    dias_sem_resposta: diasSemResposta,
  };

  let texto = "";
  if (stage.mensagem_tipo === "ia_leve" && stage.mensagem_prompt) {
    const { lovableAiChat } = await import("./lovable-ai.server");
    const prompt = renderTemplate(stage.mensagem_prompt, vars);
    texto = (await lovableAiChat(
      [
        { role: "system", content: "Você redige mensagens curtas de WhatsApp em português brasileiro, tom natural, sem hashtags nem markdown, máximo 3 linhas." },
        { role: "user", content: prompt },
      ],
      "google/gemini-2.5-flash-lite",
    )).trim();
  } else if (stage.mensagem_texto) {
    texto = renderTemplate(stage.mensagem_texto, vars);
  }

  const mediaUrl = String(stage.mensagem_midia_url || "").trim();
  const mediaType = stage.mensagem_midia_tipo as "image" | "video" | "audio" | "document" | null;
  if (!texto && (!mediaUrl || !mediaType)) {
    return { id: card.id, status: "sem_mensagem" };
  }

  let signedMediaUrl = mediaUrl;
  if (mediaUrl && mediaType) {
    const { storagePathFromUrl } = await import("@/lib/chat-media.functions");
    const path = storagePathFromUrl(mediaUrl);
    if (path) {
      const { data: signed, error: signError } = await admin.storage.from("chat-media").createSignedUrl(path, 60 * 60 * 24);
      if (signError || !signed?.signedUrl) throw signError ?? new Error("Não foi possível acessar a mídia da automação.");
      signedMediaUrl = signed.signedUrl;
    }

    if (mediaType === "audio") {
      await waSendAudio(inst, card.numero, signedMediaUrl);
    } else {
      await waSendMedia(inst, card.numero, {
        url: signedMediaUrl,
        type: mediaType,
        caption: texto || undefined,
        fileName: stage.mensagem_midia_nome || undefined,
        mime: stage.mensagem_midia_mime || undefined,
      });
    }

    await admin.from("mensagens").insert({
      company_id: card.company_id,
      user_id: card.user_id,
      numero: card.numero,
      texto: mediaType === "audio" ? "" : texto,
      direcao: "saida",
      autor: "automacao",
      midia_url: mediaUrl,
      midia_tipo: mediaType,
      midia_mime: stage.mensagem_midia_mime || null,
      midia_nome: stage.mensagem_midia_nome || null,
    });

    if (mediaType === "audio" && texto) {
      await waSendText(inst, card.numero, texto);
      await admin.from("mensagens").insert({
        company_id: card.company_id,
        user_id: card.user_id,
        numero: card.numero,
        texto,
        direcao: "saida",
        autor: "automacao",
      });
    }
  } else {
    await waSendText(inst, card.numero, texto);
    await admin.from("mensagens").insert({
      company_id: card.company_id,
      user_id: card.user_id,
      numero: card.numero,
      texto,
      direcao: "saida",
      // Mensagem da régua da etapa: é automação, não o agente de IA.
      autor: "automacao",
    });
  }

  await admin.from("crm_cards")
    .update({ regua_ultimo_disparo_em: new Date().toISOString() })
    .eq("id", card.id);

  return { id: card.id, status: "enviado", sent: true, stage: stage.nome };
}

/** Cron: processa cards prontos para disparo. */
export async function processKanbanReguas(admin: Admin): Promise<{ processed: number; results: any[] }> {
  // Cards com régua ativa (limite pra não estourar)
  // Só etapas com régua ativa entram na fila — evita gastar o limite do lote
  // com cards parados em etapas sem automação (bug: leads novos nunca eram alcançados).
  const { data: activeStages } = await admin
    .from("crm_stage")
    .select("id")
    .eq("regua_ativa", true);
  const stageIds = (activeStages ?? []).map((s: any) => s.id);
  if (!stageIds.length) return { processed: 0, results: [] };

  const { data: cards, error } = await admin
    .from("crm_cards")
    .select("id, company_id, user_id, numero, nome, valor, stage_id, entrou_stage_em, regua_ultimo_disparo_em")
    .eq("regua_status", "ativa")
    .in("stage_id", stageIds)
    // Prioriza quem ainda não recebeu nada e quem entrou há mais tempo.
    .order("regua_ultimo_disparo_em", { ascending: true, nullsFirst: true })
    .order("entrou_stage_em", { ascending: true })
    .limit(2000);
  if (error) throw error;

  const results: any[] = [];
  for (const card of (cards ?? []) as any[]) {
    try {
      const result = await processKanbanReguaCard(admin, card as KanbanCardRow);
      if (result) results.push(result);
    } catch (e: any) {
      results.push({ id: card.id, error: String(e?.message || e).slice(0, 300) });
    }
  }
  return { processed: results.length, results };
}

/** Processa imediatamente a régua do card atual de um contato. */
export async function processKanbanReguaForNumero(admin: Admin, companyId: string, numero: string) {
  const { data: card, error } = await admin
    .from("crm_cards")
    .select("id, company_id, user_id, numero, nome, valor, stage_id, entrou_stage_em, regua_ultimo_disparo_em")
    .eq("company_id", companyId)
    .eq("numero", numero)
    .not("stage_id", "is", null)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!card) return null;
  return processKanbanReguaCard(admin, card as KanbanCardRow);
}

/** Cliente respondeu: mover card conforme move_se_respondeu_para e/ou parar régua. */
export async function onCardResponse(admin: Admin, companyId: string, numero: string) {
  try {
    const { data: cards } = await admin
      .from("crm_cards")
      .select("id, company_id, numero, owner_id, stage_id, entrou_stage_em, perdido_em, retorno_stage_id")
      .eq("company_id", companyId)
      .eq("numero", numero);
    if (!cards?.length) return;

    for (const card of cards as any[]) {
      if (!card.stage_id) continue;
      const { data: stage } = await admin
        .from("crm_stage")
        .select("tipo, move_se_respondeu_para, parar_se_responder, modo_atendimento")
        .eq("id", card.stage_id)
        .maybeSingle();
      if (!stage) continue;

      // Lead perdido que voltou a falar: rota de retorno tem prioridade
      // sobre qualquer outra regra da etapa.
      if (stage.tipo === "perda") {
        const { reactivateLostCard } = await import("@/lib/crm-engine.server");
        await reactivateLostCard(admin, card);
        continue;
      }


      // "Responder" só conta se já saiu alguma mensagem nossa nesta etapa
      // (régua ou IA). Sem isso, o 1º contato do lead seria tratado como
      // resposta e o card pularia de etapa antes de qualquer atendimento.
      let houveSaidaNaEtapa = false;
      let houveSaidaHumanaNaEtapa = false;
      {
        const { data: saida } = await admin
          .from("mensagens")
          .select("id, autor")
          .eq("company_id", companyId)
          .eq("numero", numero)
          .eq("direcao", "saida")
          .gte("created_at", card.entrou_stage_em)
          .limit(50);
        houveSaidaNaEtapa = !!saida?.length;
        houveSaidaHumanaNaEtapa = (saida ?? []).some((m: any) => m.autor === "humano");
      }

      const patch: any = {};
      let moveTo: string | null = null;
      // A regra "se responder, mover para X" é explícita do cliente e vale
      // também em etapas "Somente IA": a IA já falou nesta etapa, o lead
      // respondeu, então o card avança e o atendimento continua na etapa nova.
      if (stage.move_se_respondeu_para && houveSaidaNaEtapa && stage.move_se_respondeu_para !== card.stage_id) {
        moveTo = stage.move_se_respondeu_para;
        patch.regua_status = "ativa";
      }
      // Só uma mensagem de atendente humano pausa o acompanhamento. Resposta
      // automática da IA não pausa — senão o card trava na etapa e nunca vai
      // para o follow-up quando o cliente some.
      if (stage.parar_se_responder && houveSaidaHumanaNaEtapa) patch.regua_status = "pausada";
      if (moveTo) {
        const { moveCardToStage } = await import("@/lib/crm-engine.server");
        await moveCardToStage(admin, card.id, moveTo, patch);
      } else if (Object.keys(patch).length) {
        await admin.from("crm_cards").update(patch).eq("id", card.id);
      }
    }


  } catch {
    // silencioso
  }
}

/** Humano assumiu: pausa régua de todos os cards deste contato. */
export async function pauseCardsForNumero(
  admin: Admin,
  companyId: string,
  numero: string,
  _motivo: string,
) {
  try {
    await admin
      .from("crm_cards")
      .update({ regua_status: "pausada" })
      .eq("company_id", companyId)
      .eq("numero", numero)
      .eq("regua_status", "ativa");
  } catch {
    // silencioso
  }
}
