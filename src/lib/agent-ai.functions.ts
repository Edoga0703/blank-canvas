import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ────────────────────────────────────────────────────────────────────────
// Append a corrected example (few-shot) to the agent's config
// ────────────────────────────────────────────────────────────────────────
export const addAgentExample = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    tipo: "qualificacao" | "followup" | "posvenda";
    cliente: string;
    agente: string;
    agentId?: string;
  }) => {
    const cliente = String(d?.cliente || "").trim();
    const agente = String(d?.agente || "").trim();
    if (!cliente || !agente) throw new Error("Preencha a mensagem do cliente e a resposta ideal.");
    return { tipo: d?.tipo || "qualificacao", cliente: cliente.slice(0, 800), agente: agente.slice(0, 1200), agentId: d?.agentId };
  })
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: cu } = await supabase
      .from("company_user")
      .select("company_id")
      .eq("user_id", userId)
      .eq("ativo", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    let companyId = cu?.company_id as string | undefined;
    if (!companyId) {
      const { data: isSuper } = await supabase.rpc("is_super_admin");
      if (isSuper) {
        const { data: anyC } = await supabase.from("company").select("id").order("created_at", { ascending: true }).limit(1).maybeSingle();
        companyId = anyC?.id as string | undefined;
      }
    }
    if (!companyId) throw new Error("Empresa não encontrada.");

    const query = supabase
      .from("agent_config")
      .select("id, exemplos_few_shot");
    
    if (data.agentId) {
      query.eq("id", data.agentId);
    } else {
      query.eq("company_id", companyId).eq("tipo", data.tipo);
    }

    const { data: cfg } = await query.maybeSingle();
    if (!cfg) throw new Error("Configure o agente antes de salvar exemplos.");
    const arr = Array.isArray(cfg.exemplos_few_shot) ? (cfg.exemplos_few_shot as any[]) : [];
    const next = [...arr, { cliente: data.cliente, agente: data.agente }].slice(-12);
    const { error } = await supabase
      .from("agent_config")
      .update({ exemplos_few_shot: next as any })
      .eq("id", cfg.id);
    if (error) throw new Error(error.message);
    return { ok: true, total: next.length };
  });


export type GeneratedAgentConfig = {
  nome_agente: string;
  nome_empresa: string;
  segmento: string;
  regiao_horario: string;
  descricao_negocio: string;
  diferenciais: string;
  publico_alvo: string;
  sobre_empresa: string;
  produtos_servicos: string;
  papel_objetivo: string;
  estilo_comunicacao: string;
  apresentacao: string;
  ofertas: string;
  como_vender: string;
  objecoes: string;
  formas_pagamento: string;
  faq: string;
  politicas: string;
  posvenda_msg: string;
  pode_fazer: string;
  nao_pode_fazer: string;
};

const FIELDS: (keyof GeneratedAgentConfig)[] = [
  "nome_agente","nome_empresa","segmento","regiao_horario","descricao_negocio",
  "diferenciais","publico_alvo","sobre_empresa","produtos_servicos","papel_objetivo",
  "estilo_comunicacao","apresentacao","ofertas","como_vender","objecoes",
  "formas_pagamento","faq","politicas","posvenda_msg","pode_fazer","nao_pode_fazer",
];

function extractJson(raw: string): any {
  const trimmed = (raw || "").trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "");
  try { return JSON.parse(trimmed); } catch {}
  const m = trimmed.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch {} }
  throw new Error("A IA não retornou JSON válido. Tente novamente.");
}

// ────────────────────────────────────────────────────────────────────────
// ANALISADOR PRD: olha o que o usuário escreveu, identifica lacunas críticas
// e gera perguntas guiadas (com exemplos) para o leigo conseguir responder.
// ────────────────────────────────────────────────────────────────────────

export type BriefQuestion = {
  id: string;            // chave estável (ex: "produtos_precos")
  pergunta: string;      // pergunta curta, linguagem leiga
  porque: string;        // por que isso importa (1 frase)
  exemplo: string;       // exemplo concreto pra destravar o usuário
  campo: keyof GeneratedAgentConfig | "extra";
  obrigatoria: boolean;
};

export type BriefAnalysis = {
  pronto: boolean;                 // true se já dá pra gerar com qualidade
  resumo: string;                  // resumo de 1-2 linhas do que entendeu
  cobertura: number;               // 0-100
  perguntas: BriefQuestion[];      // perguntas críticas pendentes (máx 6)
};

export const analyzeBusinessBrief = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { descricao: string; respostas?: Record<string, string> }) => {
    const desc = (d?.descricao || "").trim();
    if (desc.length < 10) throw new Error("Conte um pouco mais sobre o negócio.");
    return {
      descricao: desc.slice(0, 8000),
      respostas: d?.respostas && typeof d.respostas === "object" ? d.respostas : {},
    };
  })
  .handler(async ({ data }) => {
    const { lovableAiChat } = await import("./lovable-ai.server");

    const respostasTxt = Object.entries(data.respostas)
      .filter(([, v]) => v && String(v).trim())
      .map(([k, v]) => `- ${k}: ${v}`)
      .join("\n");

    const system = `Você é um Product Manager sênior + consultor de vendas, especialista em montar agentes de WhatsApp para pequenos negócios brasileiros (donos leigos, topo de funil).

Sua tarefa: ANALISAR a descrição do negócio e identificar o que FALTA para um agente atender bem sem dar respostas tortas.

Pense como PRD: o agente precisa saber NO MÍNIMO:
1) O que vende (produtos/serviços com preço ou faixa de preço)
2) Como o cliente recebe/recebe atendimento (entrega, retirada, agendamento, online)
3) Região e horário de atendimento
4) Formas de pagamento
5) Política básica (troca, cancelamento, garantia)
6) O que o agente NÃO pode prometer/fazer
7) Diferencial / motivo pra comprar dali
8) Próximo passo da venda (agendar? pedir endereço? enviar link?)

REGRAS DAS PERGUNTAS:
- Faça NO MÁXIMO 6 perguntas — só as CRÍTICAS que faltam.
- Linguagem de gente, não de formulário. O dono é leigo, topo de funil.
- Cada pergunta tem um EXEMPLO concreto, plausível pro segmento dele, pra destravar.
- NUNCA pergunte coisa que já está clara na descrição ou nas respostas anteriores.
- Se o negócio é simples e já tem o essencial (produtos + como vender + região OU horário), marque "pronto: true" e devolva perguntas: [].
- Se faltar pouco mas crítico (ex: preços, formas de pagamento), marque "pronto: false".

Responda APENAS JSON válido neste formato:
{
  "pronto": boolean,
  "resumo": "string curta do que entendeu do negócio",
  "cobertura": number,   // 0-100, quanto da info essencial já temos
  "perguntas": [
    {
      "id": "snake_case_estavel",
      "pergunta": "pergunta curta em PT-BR",
      "porque": "1 frase de por que isso importa pro atendimento",
      "exemplo": "exemplo concreto e específico pro segmento",
      "campo": "uma das chaves: nome_empresa|segmento|regiao_horario|produtos_servicos|formas_pagamento|politicas|diferenciais|publico_alvo|como_vender|nao_pode_fazer|ofertas|extra",
      "obrigatoria": boolean
    }
  ]
}`;

    const user = `DESCRIÇÃO DO NEGÓCIO:
${data.descricao}

${respostasTxt ? `RESPOSTAS JÁ DADAS PELO DONO:\n${respostasTxt}` : ""}

Analise e devolva o JSON.`;

    const raw = await lovableAiChat(
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      { provider: "gemini", model: "google/gemini-2.5-flash" },
    );

    const parsed = extractJson(raw);
    const perguntas: BriefQuestion[] = Array.isArray(parsed?.perguntas)
      ? parsed.perguntas.slice(0, 6).map((q: any, i: number) => ({
          id: String(q?.id || `q_${i}`).slice(0, 60),
          pergunta: String(q?.pergunta || "").slice(0, 240),
          porque: String(q?.porque || "").slice(0, 240),
          exemplo: String(q?.exemplo || "").slice(0, 320),
          campo: (typeof q?.campo === "string" ? q.campo : "extra") as any,
          obrigatoria: !!q?.obrigatoria,
        })).filter((q: BriefQuestion) => q.pergunta)
      : [];

    const analysis: BriefAnalysis = {
      pronto: !!parsed?.pronto && perguntas.filter((p) => p.obrigatoria).length === 0,
      resumo: String(parsed?.resumo || "").slice(0, 400),
      cobertura: Math.max(0, Math.min(100, Number(parsed?.cobertura) || 0)),
      perguntas,
    };

    return analysis;
  });

// ────────────────────────────────────────────────────────────────────────
// GERAÇÃO DA CONFIG: agora aceita respostas do "interview" e gera PRD completo
// ────────────────────────────────────────────────────────────────────────

export const generateAgentConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { descricao: string; respostas?: Record<string, string>; nome?: string }) => {
    if (!d?.descricao || d.descricao.trim().length < 20) {
      throw new Error("Descreva seu negócio com pelo menos algumas frases (mín. 20 caracteres).");
    }
    return {
      descricao: d.descricao.trim().slice(0, 8000),
      respostas: d?.respostas && typeof d.respostas === "object" ? d.respostas : {},
      nome: d?.nome
    };
  })

  .handler(async ({ data }) => {
    const { lovableAiChat } = await import("./lovable-ai.server");
    const { buildSystemPrompt } = await import("./ai-prompt");

    const respostasTxt = Object.entries(data.respostas)
      .filter(([, v]) => v && String(v).trim())
      .map(([k, v]) => `- ${k}: ${v}`)
      .join("\n");

    const system = `Você é um Product Manager sênior + copywriter de vendas, montando um AGENTE DE WHATSAPP para um pequeno negócio brasileiro.

Você recebe: (1) descrição livre do dono (leigo) e (2) respostas dele para perguntas específicas.
Sua tarefa: gerar a configuração COMPLETA do agente, no padrão de um PRD enxuto e ACIONÁVEL — nada genérico, nada "blá-blá de IA".

Responda APENAS com JSON válido (sem markdown), com EXATAMENTE estas chaves (todas strings, PT-BR):
${FIELDS.map((f) => `- ${f}`).join("\n")}

DIRETRIZES (siga à risca):
- "nome_agente": curto, humano, brasileiro (ex: Lia, Bia, Tom, Rafa). Não use "Assistente", "Bot", "IA".
- "papel_objetivo": 1-2 frases. O QUE o agente faz e PRA QUE (qualificar, vender, agendar).
- "estilo_comunicacao": tom específico pro segmento (ex: padaria de bairro = caloroso e direto; clínica = cordial e seguro).
- "apresentacao": 1ª mensagem real que o agente envia. Curta, humana, 1 emoji só se combinar. Nada de "Olá! Como posso ajudá-lo hoje?".
- "sobre_empresa": parágrafo curto que o agente pode usar quando o cliente perguntar "quem é vocês".
- "produtos_servicos": liste itens com preço/faixa SEMPRE que o dono informou. Se não informou, use categorias e marque "(consultar)". NUNCA invente preço.
- "como_vender": passo a passo NUMERADO (3-6 passos) específico desse negócio — não genérico. Ex: "1. Pergunte se é retirada ou entrega. 2. Se entrega, peça CEP..."
- "objecoes": 3-5 objeções REAIS daquele segmento + resposta curta cada. Ex: "Tá caro" → resposta concreta.
- "faq": 4-6 perguntas que clientes daquele segmento REALMENTE fazem + resposta direta.
- "politicas": troca, cancelamento, garantia, prazo — coerentes com o segmento. Se o dono não falou, escreva uma política padrão razoável e marcada como "(confirmar com o time)".
- "posvenda_msg": mensagem curta de pós-venda alinhada ao tom.
- "pode_fazer": lista (1 por linha) do que o agente pode prometer/fazer.
- "nao_pode_fazer": lista (1 por linha) do que NÃO pode — inclua sempre "Não inventar preço, prazo ou política que não esteja aqui" e "Não fechar venda sem confirmar dado essencial (endereço, horário, forma de pagamento)".
- "ofertas": só preencha se o dono mencionou promoção/cupom. Senão, "".
- "formas_pagamento": só o que o dono disse (ou "(consultar)").
- Use "" (string vazia) quando faltar info — NUNCA omita chaves.
- NÃO invente: preço, endereço, horário, telefone, prazo, estoque. Se faltar, deixe vazio ou marque "(consultar)".

Retorne SÓ o JSON.`;

    const user = `DESCRIÇÃO DO DONO:
${data.descricao}

${respostasTxt ? `RESPOSTAS ESPECÍFICAS DO DONO:\n${respostasTxt}` : ""}

Gere o JSON do agente.`;

    const raw = await lovableAiChat(
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      { provider: "gemini", model: "google/gemini-2.5-flash" },
    );

    const parsed = extractJson(raw) as Partial<GeneratedAgentConfig>;
    const config = {} as GeneratedAgentConfig;
    for (const k of FIELDS) {
      const v = parsed?.[k];
      (config as any)[k] = typeof v === "string" ? v : v == null ? "" : String(v);
    }

    const promptPreview = buildSystemPrompt(config as any, {
      responderEmPartes: true,
      produtos: [],
    });

    return { config, promptPreview };
  });

// ────────────────────────────────────────────────────────────────────────
// LIST AGENTS: Retorna todos os agentes da empresa
// ────────────────────────────────────────────────────────────────────────
export const listAgents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { resolveCompanyIdCached } = await import("./company-cache");
    const companyId = await resolveCompanyIdCached(supabase, userId);
    
    if (!companyId) throw new Error("Empresa não encontrada.");


    const { data, error } = await supabase
      .from("agent_config")
      .select("*")
      .eq("company_id", companyId)
      .order("updated_at", { ascending: false });

    if (error) throw new Error(error.message);
    return data;
  });

export const deleteAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const companyId = await requireAdminCompany(supabase, userId);
    const { error } = await supabase.from("agent_config").delete().eq("id", data.id).eq("company_id", companyId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateAgentAvatar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { agentId: string; traits: any; avatarUrl?: string }) => {
    if (!d.agentId) throw new Error("ID do agente é obrigatório.");
    return d;
  })
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const companyId = await requireAdminCompany(supabase, userId);
    
    // 1. Atualiza o avatar_url no banco de dados
    const { error } = await supabase
      .from("agent_config")
      .update({ 
        avatar_traits: data.traits,
        avatar_url: data.avatarUrl || null 
      } as any)
      .eq("id", data.agentId)
      .eq("company_id", companyId);

    if (error) throw new Error(error.message);
    
    // 2. Resolve o userId do agente (ou da empresa) para invalidar o cache
    // Buscamos o user_id dono dessa config para garantir que o cache de resolveCompanyIdCached seja limpo
    const { data: config } = await supabase
      .from("agent_config")
      .select("user_id, company_id")
      .eq("id", data.agentId)
      .single();

    if (config?.user_id) {
      const { invalidateCompanyCache } = await import("./company-cache");
      invalidateCompanyCache(config.user_id);
    }
    
    return { ok: true };
  });

export const generateAgentAvatar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { 
    agentId: string; 
    customPrompt?: string; 
    traits?: any 
  }) => {
    if (!d.agentId) throw new Error("ID do agente é obrigatório.");
    return d;
  })
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const companyId = await requireAdminCompany(supabase, userId);

    // 1. Busca info do agente para compor o prompt se não houver um customizado
    const { data: agent } = await supabase
      .from("agent_config")
      .select("nome_agente, estilo_comunicacao, papel_objetivo, segmento, company_id")
      .eq("id", data.agentId)
      .eq("company_id", companyId)
      .single();

    if (!agent) throw new Error("Agente não encontrado.");

    const traits = data.traits;
    const name = traits?.name || agent.nome_agente;
    const genderStr = traits?.gender || "professional";
    const skinStr = traits?.skinTone ? `with ${traits.skinTone} skin tone` : "";
    const clothingStr = traits?.clothingColor ? `wearing a ${traits.clothingColor} shirt` : "";
    const accStr = (traits?.accessories && Array.isArray(traits.accessories) && traits.accessories.length > 0) 
      ? `accessories: ${traits.accessories.join(", ")}` 
      : "";
    const hairStr = traits?.hair ? `hairstyle: ${traits.hair}` : "";

    // Predefinições Fixas: Estilo 3D Pixar/Disney Stylized (Foto de perfil séria, sem gestos)
    const basePrompt = `Professional 3D character design for a corporate profile picture, high-quality Octane render, soft cinematic lighting, clean minimal solid light grey background. 
      Style: "High-end 3D Stylized animation" (Pixar/Disney style), smooth surfaces, detailed textures.
      Composition: Head and shoulders portrait, strictly centered, frontal view, fixed serious facial expression (slight professional smile), strictly NO hand gestures, NO pointing, arms down or not visible, clean profile photo framing.
      Subject: A professional person named ${name}.
      Details: ${genderStr} ${skinStr}, ${hairStr}, ${clothingStr}, ${accStr}.
      Context: Professional business avatar for ${agent.segmento || "business"}.
      ${data.customPrompt ? `Additional instructions: ${data.customPrompt}` : ""}`;

    // 2. Gera imagem via Lovable AI Gateway (inline: import dinâmico quebra após o split)
    const apiKey = process.env['LOVABLE_API_KEY'];
    if (!apiKey) throw new Error("LOVABLE_API_KEY ausente.");

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/images/generations", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "fetch", "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image",
        prompt: basePrompt,
        size: "1024x1024",
      }),


    });

    if (!aiRes.ok) {
      const t = await aiRes.text().catch(() => "");
      if (aiRes.status === 402) throw new Error("Créditos de IA insuficientes para gerar o avatar.");
      throw new Error(`Falha ao gerar avatar (${aiRes.status}): ${t.slice(0, 160)}`);
    }

    const aiJson: any = await aiRes.json();
    const b64 =
      aiJson?.data?.[0]?.b64_json ||
      aiJson?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    const urlOut = aiJson?.data?.[0]?.url;

    let blob: Blob;
    if (b64) {
      const raw = String(b64).includes(",") ? String(b64).split(",")[1] : String(b64);
      const bin = atob(raw);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      blob = new Blob([bytes], { type: "image/png" });
    } else if (urlOut) {
      blob = await (await fetch(urlOut)).blob();
    } else {
      throw new Error("A IA não retornou uma imagem.");
    }

    const fileName = `${(agent as any).company_id}/avatar-${data.agentId}-${Date.now()}.png`;

    
    const { error: uploadError } = await supabase.storage
      .from("agent-avatars")
      .upload(fileName, blob, { contentType: "image/png", upsert: true });

    if (uploadError) throw new Error(`Falha no upload: ${uploadError.message}`);

    // bucket é privado → URL assinada de longa duração
    const { data: signed } = await supabase.storage
      .from("agent-avatars")
      .createSignedUrl(fileName, 60 * 60 * 24 * 365);
    const publicUrl = signed?.signedUrl || "";

    // 4. Atualiza o banco
    const { error: updateError } = await supabase
      .from("agent_config")
      .update({ 
        avatar_url: publicUrl,
        avatar_prompt: basePrompt,
        avatar_traits: data.traits || null
      } as any)
      .eq("id", data.agentId);


    if (updateError) throw new Error(updateError.message);

    return { avatarUrl: publicUrl };
  });

export const updateAgentKnowledgeFiles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { agentId: string; files: any[] }) => {
    if (!d.agentId) throw new Error("ID do agente é obrigatório.");
    return d;
  })
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const companyId = await requireAdminCompany(supabase, userId);
    const { error } = await supabase
      .from("agent_config")
      .update({ 
        knowledge_files: data.files 
      } as any)
      .eq("id", data.agentId)
      .eq("company_id", companyId);

    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ────────────────────────────────────────────────────────────────────────
// Indexa (extrai o texto) dos arquivos da base de conhecimento do agente.
// Sem isso a IA só enxergava o nome/URL do arquivo e ignorava o conteúdo.
// ────────────────────────────────────────────────────────────────────────
export const indexAgentKnowledge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { agentId: string; force?: boolean }) => {
    if (!d?.agentId) throw new Error("ID do agente é obrigatório.");
    return { agentId: d.agentId, force: !!d.force };
  })
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const companyId = await requireAdminCompany(supabase, userId);
    const { extractKnowledgeText } = await import("./knowledge-extract.server");

    const { data: agent, error: agErr } = await supabase
      .from("agent_config")
      .select("id, knowledge_files")
      .eq("id", data.agentId)
      .eq("company_id", companyId)
      .maybeSingle();
    if (agErr) throw new Error(agErr.message);

    const files: any[] = Array.isArray((agent as any)?.knowledge_files)
      ? ((agent as any).knowledge_files as any[])
      : [];
    if (!files.length) return { ok: true, indexed: 0, failed: 0, chars: 0, files: [] };

    let indexed = 0;
    let failed = 0;
    const out: any[] = [];

    for (const f of files) {
      if (!data.force && (f?.textStatus === "ok" || f?.textStatus === "ilegivel")) {
        out.push(f);
        if (f.textStatus === "ok") indexed++;
        else failed++;
        continue;
      }
      try {
        const { data: blob, error: dlErr } = await supabase.storage
          .from("agent-knowledge")
          .download(f.path);
        if (dlErr || !blob) throw new Error(dlErr?.message || "download falhou");
        const bytes = new Uint8Array(await blob.arrayBuffer());
        const res = await extractKnowledgeText(bytes, f.name || f.path, f.type || "");
        if (res.status === "ok") indexed++;
        else failed++;
        out.push({ ...f, text: res.text, textStatus: res.status, textChars: res.chars });
      } catch (e: any) {
        console.error("[indexAgentKnowledge]", f?.name, e?.message);
        failed++;
        out.push({ ...f, text: "", textStatus: "ilegivel", textChars: 0 });
      }
    }

    const { error: upErr } = await supabase
      .from("agent_config")
      .update({ knowledge_files: out } as any)
      .eq("id", data.agentId);
    if (upErr) throw new Error(upErr.message);

    const chars = out.reduce((a, f) => a + (Number(f?.textChars) || 0), 0);
    return { ok: true, indexed, failed, chars, files: out };
  });



// ────────────────────────────────────────────────────────────────────────
// SAVE / CREATE (server-side): resolve a empresa no servidor e valida o
// papel do usuário antes de gravar — evita erros de RLS por contexto
// desatualizado no navegador.
// ────────────────────────────────────────────────────────────────────────
async function requireAdminCompany(supabase: any, userId: string) {
  const { resolveCompanyIdCached } = await import("./company-cache");
  const companyId = await resolveCompanyIdCached(supabase, userId);
  const { data: isSuper } = await supabase.rpc("is_super_admin");
  if (!isSuper) {
    const { data: cu } = await supabase
      .from("company_user")
      .select("role")
      .eq("company_id", companyId)
      .eq("user_id", userId)
      .eq("ativo", true)
      .maybeSingle();
    if (!cu || (cu.role !== "owner" && cu.role !== "admin")) {
      throw new Error("Somente o dono ou administradores podem editar os agentes de IA.");
    }
  }
  return companyId as string;
}

export const saveAgentConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id?: string | null; payload: Record<string, any> }) => {
    if (!d?.payload || typeof d.payload !== "object") throw new Error("Dados inválidos.");
    return d;
  })
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const companyId = await requireAdminCompany(supabase, userId);

    const { id: _i, company_id: _c, user_id: _u, updated_at: _ua, created_at: _ca, ...rest } = data.payload as any;
    const row: any = { ...rest, company_id: companyId, user_id: userId };

    async function executeSafeMutation(isUpdate: boolean, targetId?: string) {
      const payloadToSave = { ...row };
      let lastError: any = null;
      for (let attempt = 0; attempt < 5; attempt++) {
        let res: any;
        if (isUpdate) {
          res = await supabase
            .from("agent_config")
            .update(payloadToSave)
            .eq("id", targetId)
            .eq("company_id", companyId);
        } else {
          res = await supabase
            .from("agent_config")
            .insert(payloadToSave)
            .select("id")
            .single();
        }
        if (!res.error) {
          return res.data || { id: targetId };
        }
        lastError = res.error;
        // Se a coluna não existe no cache do schema do Supabase, remove-a e tenta salvar o restante
        const match = res.error.message?.match(/Could not find the '([^']+)' column/i);
        if (match && match[1] && match[1] in payloadToSave) {
          console.warn(`[saveAgentConfig] Removendo campo desconhecido '${match[1]}' e tentando salvar novamente.`);
          delete payloadToSave[match[1]];
          continue;
        }
        break;
      }
      throw new Error(lastError?.message || "Falha ao salvar configuração do agente.");
    }

    if (data.id) {
      await executeSafeMutation(true, data.id);
      return { id: data.id };
    }

    // Procura por agente existente
    const { data: existing } = await supabase
      .from("agent_config")
      .select("id")
      .eq("company_id", companyId)
      .eq("tipo", row.tipo || "qualificacao")
      .maybeSingle();

    if (existing?.id) {
      await executeSafeMutation(true, existing.id);
      return { id: existing.id };
    }

    const saved = await executeSafeMutation(false);
    return { id: saved?.id };
  });

export const createAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { nome: string; tipo: string }) => {
    if (!d?.nome?.trim()) throw new Error("Digite o nome do agente.");
    return { nome: d.nome.trim(), tipo: d.tipo };
  })
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const companyId = await requireAdminCompany(supabase, userId);

    const { data: created, error } = await supabase
      .from("agent_config")
      .insert({
        company_id: companyId,
        user_id: userId,
        nome: data.nome,
        nome_agente: data.nome,
        tipo: (data.tipo || "qualificacao").toLowerCase(),
        is_default: false,
        sobre_empresa: "",
        papel_objetivo: "",
        estilo_comunicacao: "Humano e prestativo",
      } as any)
      .select()
      .single();

    if (error) {
      if ((error as any).code === "23505") {
        throw new Error("Já existe um agente com esse nome ou tipo nesta empresa.");
      }
      throw new Error(error.message);
    }
    return created;
  });

// ────────────────────────────────────────────────────────────────────────
// AI SUGGESTIONS / TRAINING LOOP (Phase B)
// ────────────────────────────────────────────────────────────────────────
export interface AgentPromptSuggestionItem {
  id: string;
  numero: string;
  inbound_text: string;
  previous_reply?: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  intent: string;
  duda: string;
  regra_sugerida: string;
  status: "pending" | "approved" | "dismissed";
  created_at: string;
  last_simulation?: {
    simulated_at: string;
    new_reply: string;
    doubt_resolved: boolean;
    candidate_rule?: string;
  };
}

export const listAgentSuggestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d?: { agentId?: string | null }) => d || {})
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const companyId = await requireAdminCompany(supabase, userId);

    const { data, error } = await supabase
      .from("audit_log")
      .select("id, acao, detalhes, created_at")
      .eq("company_id", companyId)
      .eq("acao", "ai_prompt_suggestion")
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      console.warn("[listAgentSuggestions] error:", error);
      return [];
    }

    const items: AgentPromptSuggestionItem[] = (data ?? [])
      .map((row: any) => ({
        id: row.id,
        numero: String(row.detalhes?.numero || ""),
        inbound_text: String(row.detalhes?.inbound_text || ""),
        previous_reply: row.detalhes?.previous_reply ? String(row.detalhes.previous_reply) : undefined,
        history: Array.isArray(row.detalhes?.history) ? row.detalhes.history : undefined,
        intent: String(row.detalhes?.intent || "NEUTRA"),
        duda: String(row.detalhes?.duda || ""),
        regra_sugerida: String(row.detalhes?.regra_sugerida || ""),
        status: (row.detalhes?.status as any) || "pending",
        created_at: row.created_at,
        last_simulation: row.detalhes?.last_simulation || undefined,
      }))
      .filter((s) => s.status === "pending" && s.regra_sugerida.length > 0);

    return items;
  });

export const applyAgentSuggestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { suggestionId: string; agentId?: string | null; ruleText: string; tipo?: string }) => {
    if (!d?.suggestionId || !d?.ruleText?.trim()) throw new Error("Parâmetros inválidos.");
    return {
      suggestionId: d.suggestionId,
      agentId: d.agentId || null,
      ruleText: d.ruleText.trim(),
      tipo: d.tipo || "qualificacao",
    };
  })
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const companyId = await requireAdminCompany(supabase, userId);

    let query = supabase.from("agent_config").select("id, regras_rigidas").eq("company_id", companyId);
    if (data.agentId) {
      query = query.eq("id", data.agentId);
    } else {
      query = query.eq("tipo", data.tipo);
    }

    const { data: cfg, error: cfgErr } = await query.maybeSingle();
    if (cfgErr || !cfg) throw new Error("Configuração do agente não encontrada.");

    const currentRegras = (cfg.regras_rigidas || "").trim();
    const newRuleFormatted = data.ruleText.startsWith("-") || /^\d+\./.test(data.ruleText)
      ? data.ruleText
      : `- ${data.ruleText}`;
    const updatedRegras = currentRegras ? `${currentRegras}\n${newRuleFormatted}` : newRuleFormatted;

    const { error: upErr } = await supabase
      .from("agent_config")
      .update({ regras_rigidas: updatedRegras, updated_at: new Date().toISOString() })
      .eq("id", cfg.id);
    if (upErr) throw new Error(`Falha ao atualizar regras do agente: ${upErr.message}`);

    const { data: auditRow } = await supabase
      .from("audit_log")
      .select("detalhes")
      .eq("id", data.suggestionId)
      .eq("company_id", companyId)
      .maybeSingle();

    if (auditRow) {
      await supabase
        .from("audit_log")
        .update({
          detalhes: {
            ...(auditRow.detalhes || {}),
            status: "approved",
            approved_at: new Date().toISOString(),
          },
        })
        .eq("id", data.suggestionId);
    }

    return { ok: true, regras_rigidas: updatedRegras };
  });

export const dismissAgentSuggestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { suggestionId: string }) => {
    if (!d?.suggestionId) throw new Error("ID da sugestão é obrigatório.");
    return { suggestionId: d.suggestionId };
  })
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const companyId = await requireAdminCompany(supabase, userId);

    const { data: auditRow } = await supabase
      .from("audit_log")
      .select("detalhes")
      .eq("id", data.suggestionId)
      .eq("company_id", companyId)
      .maybeSingle();

    if (auditRow) {
      await supabase
        .from("audit_log")
        .update({
          detalhes: {
            ...(auditRow.detalhes || {}),
            status: "dismissed",
            dismissed_at: new Date().toISOString(),
          },
        })
        .eq("id", data.suggestionId);
    }

    return { ok: true };
  });

// ────────────────────────────────────────────────────────────────────────
// SIMULAÇÃO DE FIX / REGRESSION TESTING DE SUGESTÕES (Replay Engine)
// ────────────────────────────────────────────────────────────────────────
async function executeSuggestionSimulation(
  supabase: any,
  companyId: string,
  params: {
    suggestionId: string;
    candidateRule?: string;
    agentId?: string | null;
    tipo?: string;
  },
) {
  const { lovableAiChat } = await import("./lovable-ai.server");
  const { buildSystemPrompt, parseAiOutput } = await import("./ai-prompt");

  // 1. Carregar a sugestão do audit_log
  const { data: auditRow, error: auditErr } = await supabase
    .from("audit_log")
    .select("id, detalhes")
    .eq("id", params.suggestionId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (auditErr || !auditRow) throw new Error("Sugestão não encontrada.");

  const detalhes = auditRow.detalhes || {};
  const inboundText = String(detalhes.inbound_text || "").trim();
  const ruleToTest = params.candidateRule || String(detalhes.regra_sugerida || "").trim();
  const originalReply = String(detalhes.previous_reply || "");
  const numero = String(detalhes.numero || "");

  if (!inboundText) throw new Error("Mensagem de entrada não encontrada para simulação.");

  // 2. Carregar o agente alvo, estágios e produtos
  let query = supabase.from("agent_config").select("*");
  if (params.agentId) query = query.eq("id", params.agentId);
  else query = query.eq("company_id", companyId).eq("tipo", params.tipo || "qualificacao");

  const [{ data: cfg }, { data: stagesRows }, { data: prodRows }, { data: fbRows }, { data: googleIntegration }] = await Promise.all([
    query.maybeSingle(),
    supabase.from("crm_stage").select("nome, tipo, ordem").eq("company_id", companyId).order("ordem", { ascending: true }),
    supabase.from("produto").select("nome, preco, descricao, sku, tipo, duracao_min, agendavel, ordem").eq("company_id", companyId).eq("ativo", true).order("ordem", { ascending: true }),
    supabase.from("agent_feedback").select("rating, mensagem_texto, nota").eq("company_id", companyId).order("created_at", { ascending: false }).limit(8),
    supabase.from("google_integration").select("company_id, conectado").eq("company_id", companyId).eq("conectado", true).maybeSingle(),
  ]);

  if (!cfg) throw new Error("Configuração do agente não encontrada.");

  const stages = (stagesRows ?? []).map((s: any) => ({ nome: s.nome, tipo: s.tipo }));
  const produtos = (prodRows ?? []).map((p: any) => ({
    nome: p.nome,
    preco: p.preco,
    descricao: p.descricao,
    sku: p.sku,
    tipo: p.tipo,
    duracao_min: p.duracao_min,
    agendavel: p.agendavel,
  }));

  // Injeta a regra candidata temporariamente nas regras rígidas para a simulação
  const currentRegras = (cfg.regras_rigidas || "").trim();
  const formattedRule = ruleToTest.startsWith("-") || /^\d+\./.test(ruleToTest) ? ruleToTest : `- ${ruleToTest}`;
  const testRegras = currentRegras.includes(ruleToTest)
    ? currentRegras
    : currentRegras ? `${currentRegras}\n${formattedRule}` : formattedRule;

  const testCfg = {
    ...cfg,
    regras_rigidas: testRegras,
  };

  const feedbackHints = (fbRows ?? []).map((f: any) => ({
    rating: f.rating === "up" ? "up" : "down",
    texto: f.mensagem_texto || "",
    nota: f.nota || null,
  })).filter((f: any) => f.texto);
  const googleConectado = Boolean(googleIntegration && googleIntegration.conectado);

  const system = buildSystemPrompt(testCfg as any, {
    responderEmPartes: cfg.responder_em_partes ?? true,
    stages,
    produtos,
    feedback: feedbackHints,
    feedbackHints,
    googleConectado,
  });

  // Recupera histórico relevante (seja dos detalhes ou das mensagens)
  let history: { role: "user" | "assistant"; content: string }[] = [];
  if (Array.isArray(detalhes.history) && detalhes.history.length > 0) {
    history = detalhes.history.map((m: any) => ({ role: m.role, content: String(m.content || "") }));
  } else if (numero && numero !== "Playground Test") {
    const { data: dbMsgs } = await supabase
      .from("mensagens")
      .select("autor, texto")
      .eq("company_id", companyId)
      .eq("numero", numero)
      .order("created_at", { ascending: false })
      .limit(8);
    history = (dbMsgs ?? [])
      .reverse()
      .filter((m: any) => m.texto && m.texto !== inboundText)
      .map((m: any) => ({
        role: m.autor === "contato" ? "user" : "assistant",
        content: m.texto || "",
      }));
  }

  // 3. Executar nova inferência na API com a regra aplicada
  const rawNewResponse = await lovableAiChat(
    [
      { role: "system", content: system },
      ...history,
      { role: "user", content: inboundText },
    ],
    {
      provider: cfg.ai_provider || "gemini",
      model: cfg.ai_model || undefined,
    }
  );

  const parsedNew = parseAiOutput(rawNewResponse, stages);
  const newReply = parsedNew.parts.join("\n\n");
  const doubtResolved = !parsedNew.sugestao;

  const simulationResult = {
    simulated_at: new Date().toISOString(),
    new_reply: newReply,
    doubt_resolved: doubtResolved,
    candidate_rule: ruleToTest,
  };

  // Persistir o resultado da simulação na sugestão
  await supabase
    .from("audit_log")
    .update({
      detalhes: {
        ...detalhes,
        last_simulation: simulationResult,
      },
    })
    .eq("id", params.suggestionId);

  return {
    ok: true,
    suggestionId: params.suggestionId,
    inbound_text: inboundText,
    previous_reply: originalReply,
    new_reply: newReply,
    doubt_resolved: doubtResolved,
    candidate_rule: ruleToTest,
    still_has_doubt: Boolean(parsedNew.sugestao),
    new_sugestao: parsedNew.sugestao,
  };
}

export const simulateSuggestionFix = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    suggestionId: string;
    candidateRule?: string;
    agentId?: string | null;
    tipo?: string;
  }) => {
    if (!d?.suggestionId) throw new Error("ID da sugestão é obrigatório.");
    return {
      suggestionId: d.suggestionId,
      candidateRule: d.candidateRule?.trim() || undefined,
      agentId: d.agentId || null,
      tipo: d.tipo || "qualificacao",
    };
  })
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const companyId = await requireAdminCompany(supabase, userId);
    return executeSuggestionSimulation(supabase, companyId, data);
  });

export const runAutoRegressionTests = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d?: { agentId?: string | null; tipo?: string }) => d || {})
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const companyId = await requireAdminCompany(supabase, userId);

    const { data: suggestions, error } = await supabase
      .from("audit_log")
      .select("id, detalhes")
      .eq("company_id", companyId)
      .eq("acao", "ai_prompt_suggestion")
      .order("created_at", { ascending: false })
      .limit(10);

    if (error || !suggestions?.length) {
      return { total: 0, resolved: 0, results: [] };
    }

    const pending = suggestions.filter(
      (s: any) => s.detalhes?.status === "pending" && s.detalhes?.inbound_text && s.detalhes?.regra_sugerida,
    );
    if (!pending.length) {
      return { total: 0, resolved: 0, results: [] };
    }

    const results: any[] = [];
    let resolvedCount = 0;

    for (const sug of pending) {
      try {
        const sim = await executeSuggestionSimulation(supabase, companyId, {
          suggestionId: sug.id,
          agentId: data?.agentId,
          tipo: data?.tipo,
        });
        if (sim?.doubt_resolved) resolvedCount++;
        results.push(sim);
      } catch (err: any) {
        results.push({
          suggestionId: sug.id,
          error: err?.message || "Falha na simulação",
          doubt_resolved: false,
        });
      }
    }

    return {
      total: pending.length,
      resolved: resolvedCount,
      results,
    };
  });
