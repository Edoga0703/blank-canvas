# Drael como provedor de IA — análise de compatibilidade

_Data: 2026-10-22 · Escopo: tudo o que o CRM usa IA para (responder mensagens, automatizações, mover leads) × a API real do drael.sh._

## Veredito

**Compatível e funcional.** O contrato assumido no código casa exatamente com a API pública do Drael (verificado em drael.sh/docs):

| O código assume | A API entrega |
|---|---|
| `https://drael.sh/v1/chat/completions` | ✅ base URL `https://drael.sh/v1`, rota `/chat/completions` |
| chave `dk-...` via `Authorization: Bearer` | ✅ prefixo `dk-`, Bearer |
| modelo `drael-v1` | ✅ único modelo; id desconhecido é respondido por ele (não rejeitado) |
| `temperature`, `presence_penalty`, `frequency_penalty` | ✅ "penalties — yours, every one"; campos não documentados são reenviados ao engine sem erro |
| sem `max_tokens` no body OpenAI | ✅ correto: com reasoning ativo o teto é descartado; enviar valeria pouco |

Não há dependência de function calling, JSON mode ou recursos proprietários: o protocolo de marcadores de texto (`[ESTAGIO:]`, `[INTENCAO:]`, `[QUALIFICADO]`, `[HANDOFF]`, `[PRODUTO:sku]`, `[AGENDAR:]`, `[PEDIDO:{json}]`) é regex tolerante — serve a qualquer LLM de texto que siga instruções.

## Como o Drael entra em ação

Ponto único de troca: `src/lib/lovable-ai.server.ts → lovableAiChat`. Com `master_settings[key=global_ai_config].ai_provider = "drael"` + chave `dk-`:

- **A configuração global do Master vence a do agente** (`provider = globalProvider || cfg.provider`) — um clique no painel Master/Sistema troca o provedor de todos os consumidores de uma vez.
- Com provider drael (ou chave `dk-`), o modelo é forçado a `drael-v1` — os nomes fixados `"google/..."`/`"openai/..."` espalhados pelos chamadores são ignorados. (Alívio: não precisa caçar cada hardcode.)
- UI Master já tem o option "Drael (drael.sh / drael-v1)" + campo de chave `dk-`.

**Passa pelo Drael** (via `lovableAiChat`): motor de respostas (regras, intenções, mover lead por estágio/intenção/handoff/qualificação, card de produto, agendamento, pedido Olist), regua do kanban (`mensagem_tipo=ia_leve`), preenchimento automático de dados do lead (`lead-extract`), sentimento, resumo, handoff-summary, análise ao vivo e relatórios de atendimento, extração de agendamento, prospecção, automação de suporte, lead-coach, brief/geração da config do agente (JSON estrito — parser leniente + UX de retry), Evolution (estacionado).

**Fica no gateway Lovable** (fetches diretos, fora do `lovableAiChat` — recursos que o Drael não cobre hoje; consomem créditos Lovable): transcrição de áudio (`transcribe.functions`, `media-understanding`), entendimento de imagem, **TTS das respostas em áudio** (`gpt-4o-mini-tts`), extração de PDF da base de conhecimento, avatar do agente (images), geração da mensagem de agenda (`/v1/responses`). Comportamento esperado agora; são candidatos a troca futura.

## Riscos encontrados (em ordem de importância)

1. **Sem retry no caminho OpenAI/Drael.** O caminho Gemini tem 3 tentativas + fallback; o Drael é um único fetch. Falhas documentadas do Drael matam o turno na hora (`ai_message_processing=failed`, cliente sem resposta): `429 turns_in_flight` (**máx. 4 respostas simultâneas por conta, entre todas as chaves** — nada é cobrado, retry é seguro), `502 upstream_unavailable` (não cobra), `524` do Cloudflare (turno >100 s **é cobrado e se perde**). → Corrigir antes de tráfego real.
2. **Reasoning sempre ligado (default `medium`) em todo turno de chave.** Latência e custo extras por turno (tokens de raciocínio e de prompt são cobrados). O projeto nunca envia `reasoning_effort`. Para turnos curtos (regua `ia_leve`, sentimento, lead-extract, resumo) vale testar `low`.
3. **Catálogo de ferramentas do Drael fica ativo quando a request não leva tools.** O modelo pode espontaneamente rodar `web_search`/`run_code` (15–68 s por busca, cobrado por chamada) numa resposta de venda. Testar se enviar `tools: []` explicitamente desliga o catálogo ("a request that carries its own tools gets a plain relay") antes de contar com isso.
4. **A cadeia inteira roda dentro do handler HTTP do webhook** (`lovable-whatsapp` → `ingestMessagingEvent` → `processInboundAutomation` awaitada). Resposta do webhook = latência total da IA. Idempotência protege de duplicatas (`messaging_inbox_events` por `externalEventId` + dedupe `ai_message_processing`), mas validar no teste one-off se o conector Lovable faz retry agressivo ou timeout.
5. **Créditos internos: empresa nova nasce com `creditos_saldo = 0`** e o motor de resposta exige saldo > 0 (1 crédito por resposta enviada, debitado após enviar). Recarregar antes do teste (existe top-up de plano na migration parity; também `debit`/RPC de ajuste).
6. **Contexto:** prompt grande e recorrente (conhecimento ~15k chars + catálogos + últimos 15 msgs/24h). Prompt que deixe <512 tokens de folga → `400 context_overflow`. O prefixo estável é cobrado a <½ preço (cache) — a arquitetura atual (append-only) aproveita isso naturalmente. Monitorar `audit_log(ai_error)` no teste.
7. **Erros de plano/chave:** `403 plan_required` (API só em plano pago), `402 insufficient_credit` / `spend_limit_reached` — todos chegam como "Drael: 4xx …" no `audit_log`; gestão via painel Master.
8. **Cosméticos:** `ai-health` pinga só o gateway Lovable (mentiroso em modo Drael); campo "Modelo global" da UI Master é ignorado quando drael (correto, mas confunde); `openAiChat` sem timeout explícito.

## Checklist antes do teste Drael

- [ ] Plano ativo no drael.sh (bloco de 4 semanas; chave criada em `/developers`, exibida uma vez) + testar `GET /v1/models` com a chave.
- [ ] Painel Master → Sistema → IA: provider `drael`, chave `dk-…` salva.
- [ ] Agente de qualificação configurado (o `modo_atendimento` do estágio inicial = ia/auto) e empresa com `creditos_saldo > 0`.
- [ ] Pequena mudança sugerida (opinionated, baixa risco): adicionar retry com backoff em `openAiChat` para `429/5xx` (espelhando o loop Gemini); opcional: `reasoning_effort: "low"` nos turnos utilitários.
- [ ] Teste one-off (fora do fluxo do webhook): `curl` direto em `https://drael.sh/v1/chat/completions` reproduzindo o body exato de `openAiChat` (temperature 0.1 + penalties + system prompt real) para conferir parâmetros, latência e latência com/sem `tools: []`.
- [ ] Na conversa real: cobrar os marcadores — `[ESTAGIO:]` movendo o card no kanban, `[HANDOFF]` pausando p/ humano, `[PRODUTO:sku]` enviando card, `[PEDIDO:]` criando na Olist, áudio (TTS continua no Lovable).
- [ ] Monitorar `audit_log(acao in ('ai_error','ia_pedido_olist'))` + `ai_message_processing` durante o teste.
