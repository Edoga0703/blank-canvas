# Plano: melhorias CRM/Dashboard, limpeza de botões e correção dos agentes de IA

## 1. Filtro de data personalizado no Dashboard
- Trocar os 4 botões (Hoje/Semana/Mês/90 dias) por um único botão "Período" que abre um menu com essas opções + "Personalizado" (calendário de intervalo, já temos calendário e date-fns instalados).
- Padrão continua "Mês". Nada muda para quem não mexer.
- O cálculo passa a aceitar também data inicial/final; os períodos fixos continuam funcionando exatamente como hoje.

## 2. Adicionar lead manualmente no Kanban (fora do WhatsApp)
- Botão "+ Novo lead" no topo do Kanban (ao lado de "Nova coluna"), abrindo um formulário: nome, telefone (opcional), e-mail, valor da oportunidade, coluna de destino, responsável e **canal de origem**.
- Canais prontos: WhatsApp, Instagram, Facebook/Messenger, Telegram, Site/Formulário, Indicação, Telefone, Presencial, Anúncio Meta, Anúncio Google + opção "Outro" com nome livre.
- O card mostra a etiqueta do canal escolhido (cor e nome), igual à etiqueta do WhatsApp hoje. Canais personalizados aparecem com etiqueta neutra e o nome digitado.
- Leads sem telefone recebem um identificador interno para não conflitar com as conversas do WhatsApp; se depois o telefone for preenchido e esse número mandar mensagem, a conversa vincula ao mesmo card.

## 3. Botão "Agendar" no card do lead e no chat
- Criar um popup reutilizável de agendamento (extraído do formulário que já existe em Agendamentos), já preenchido com nome/telefone do lead.
- Atalhos: ícone de calendário no card do Kanban, botão "Agendar" na aba Dados do detalhe do lead e ícone no cabeçalho da conversa.
- Salva pela mesma rotina do módulo Agendamentos, então aparece lá e sincroniza com o Google Agenda automaticamente, sem redirecionar o usuário.

## 4. Produto/serviço de interesse no detalhe do lead
- Novo campo "Produto / serviço" na aba Dados, com lista do catálogo cadastrado (produtos e serviços) e busca.
- Ao selecionar, sugere preencher o valor da oportunidade com o preço do item (o usuário pode alterar).
- Ao marcar o lead como Ganho, a janela de venda já vem com esse item pré-selecionado.

## 5. Valor total de oportunidades por coluna
- No topo de cada coluna, ao lado da contagem, mostrar a soma dos valores dos cards (ex.: "12 · R$ 45.300").
- No menu "..." da coluna: opção "Mostrar/ocultar valor total" (ligado por padrão), salvo por coluna.

## 6. Limpeza de botões redundantes
- Remover botão "Atualizar" do Kanban (a tela já atualiza em tempo real).
- Remover botão "Atualizar histórico" dentro da conversa.
- Remover botão "Atualizar fotos" em Contatos; a atualização de fotos passa a rodar automaticamente pela rotina agendada (já existe rotina de recuperação; será ampliada para fotos desatualizadas há mais de 7 dias).
- Remover o indicador "X / Y contatos" da página de Contatos.

## 7. Módulo Agente de IA: teste fiel a cada tipo de agente
Situação encontrada no código: o modo de teste envia a mensagem para o agente do tipo selecionado (Qualificação / Follow-up / Pós-venda), mas **em produção toda resposta automática usa sempre o agente de Qualificação**, independente da etapa do funil. Ou seja, hoje os testes de Follow-up e Pós-venda não refletem o que acontece de verdade. Além disso, o Follow-up e o Pós-venda só entram em ação quando a régua da etapa dispara — o teste atual não simula isso.

Correções:
- Produção: cada etapa do Kanban já possui campo "agente"; o motor passa a usar o agente vinculado à etapa (ou o de Qualificação como padrão). Assim etapas de follow-up/pós-venda respondem com o agente correto.
- Teste por tipo:
  - Qualificação: como hoje (simula lead iniciando conversa).
  - Follow-up: cenário real — o sistema primeiro gera a mensagem de reativação (como a régua faria), mostra ela, e depois o usuário responde como se fosse o lead; mostra também para qual etapa o lead seria movido (positivo/negativo).
  - Pós-venda: mesmo formato, partindo de uma venda fechada (primeira mensagem do agente + resposta do cliente).
- O teste passa a usar exatamente a mesma montagem de contexto de produção (histórico, catálogo, etapas) para que o resultado seja fiel.

## 8. Correção: agente repete boas-vindas após follow-up
Causa confirmada no código: ao responder, o agente só carrega o histórico das **últimas 24 horas**. Como a mensagem de follow-up normalmente é enviada dias antes, quando o lead responde o agente não "vê" o próprio follow-up, acha que é o primeiro contato e manda a saudação inicial de novo.

Correção:
- Carregar o histórico desde a entrada do lead na etapa atual (ou, no mínimo, as últimas mensagens da conversa, mesmo antigas), garantindo que o follow-up enviado esteja no contexto.
- Informar explicitamente ao agente que "já houve contato anterior; não se apresente novamente; continue a conversa a partir do follow-up enviado".
- Regra também aplicada ao pós-venda.

## Detalhes técnicos
- Dashboard: `DashboardGrid.tsx` (Popover + Calendar mode range); `dashboard.functions.ts` aceita `range | {from,to}` mantendo `startFrom` para os fixos.
- Novo lead: dialog em `crm.tsx`; insert em `crm_cards` com `origem = "manual"`, `canal_entrada` ampliado (novos valores + `canal_custom` texto) em `tracking-utils.ts`; migration adiciona coluna `canal_custom` e relaxa `canal_entrada`; número interno `manual:<uuid>` quando sem telefone.
- Agendar: extrair `AgendamentoDialog` de `agendamentos.tsx` para `src/components/agendamentos/agendamento-dialog.tsx`; reutiliza `saveAgendamento` (já faz sync Google).
- Produto/serviço: colunas `item_tipo`, `item_id`, `item_nome` em `crm_cards` (mesmo padrão de `crm_venda`); select no `lead-drawer.tsx`; pré-preencher `pendingSale` em `crm.tsx`.
- Soma por coluna: cálculo em `byStage`; coluna `mostrar_valor boolean default true` em `crm_stage`; item no dropdown da coluna.
- Remoções: `crm.tsx:700-709`, `conversas.tsx:1322-1326`, `contatos.tsx:380` e `:425`; cron de fotos usa a função já existente de atualização.
- Agentes: `ai-engine.server.ts:51-57` passa a resolver `agent_config` por `crm_stage.agent_id` com fallback `qualificacao`; `testAiReply` ganha modo "cenário" (gera 1ª mensagem via mesma lógica do `kanban-engine`/prompt do agente e reutiliza `buildSystemPrompt` com mesmos parâmetros de produção).
- Histórico: `ai-engine.server.ts:187-196` troca janela fixa de 24h por `created_at >= entrou_stage_em` (mín. 15 msgs mais recentes) e injeta flag `jaHouveContato` no prompt (`ai-prompt.ts`), suprimindo o bloco de apresentação.
