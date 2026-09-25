# Conversa no card do lead: prévia, histórico rico e análise de IA

## Como funciona hoje

A frase que aparece no card do Kanban é **sempre a última mensagem recebida do lead**. Quando o atendente ou a IA responde, a prévia não muda — por isso parece "travada" no vídeo.

No detalhe do lead, a aba Conversa mostra só o texto puro: áudio, imagem, arquivo, documento e link aparecem vazios, sem data nem hora.

## O que muda

### 1. Prévia no card (Kanban)
- Passa a mostrar a última mensagem da conversa, venha do lead ou do atendente/IA.
- Quando a última for do time, aparece com o prefixo "Você:".
- Mensagens sem texto mostram o tipo: "🎤 Áudio", "🖼️ Imagem", "📎 Arquivo", "📍 Localização".

### 2. Aba Conversa do detalhe do lead (reformulada)
- Separadores por dia (Hoje, Ontem, 12 de set.).
- Hora em cada mensagem e nome de quem enviou (lead, atendente ou IA).
- Áudio com player, imagem em miniatura clicável, arquivo/documento com nome e download, link clicável.
- Rolagem com carregamento do histórico mais antigo, e indicador de mensagem não entregue.
- Cabeçalho com resumo rápido: total de mensagens, primeira e última interação, tempo médio de resposta do atendente.

### 3. Análise de IA da conversa
- Botão "Analisar conversa" na aba Conversa, sob demanda.
- A IA lê o histórico e devolve:
  - o que foi bem feito no atendimento;
  - gargalos e pontos de atrito identificados;
  - motivo provável de a conversa ter parado ou não avançado;
  - sugestões práticas de melhoria para aquele atendente;
  - próximo passo recomendado com o lead.
- Resultado fica salvo nas notas do lead, com data, para o gestor consultar depois.

## Detalhes técnicos

- `src/lib/crm-engine.server.ts`: prévia deixa de ser exclusiva do fluxo de entrada; o envio (`wa-dispatch`) também atualiza `ultima_mensagem`/`ultima_em`, com marcador de direção (novo campo `ultima_direcao` em `crm_cards`, default `entrada`).
- `src/routes/app/crm.tsx` (`CardBody`): prefixo "Você:" quando `ultima_direcao = 'saida'`; rótulo por tipo quando texto vazio.
- `src/components/crm/lead-drawer.tsx` (`ConversaTab`): select passa a incluir `midia_url/midia_tipo/midia_mime/midia_nome/status_envio/reply_to_id`; agrupamento por dia, hora, autor, renderização por tipo de mídia e detecção de links; paginação de 50 em 50.
- Novo `src/lib/lead-coach.functions.ts`: `analyzeLeadConversation` (`createServerFn`, `requireSupabaseAuth`, checagem `has_company_access`), lê até 100 mensagens via admin client, chama a Lovable AI Gateway com saída estruturada (pontos fortes, gargalos, causa provável, melhorias, próximo passo) e grava o resultado em `lead_nota`.
- Erros da IA (sem créditos, limite) aparecem na tela com a mensagem real, sem retry automático.
