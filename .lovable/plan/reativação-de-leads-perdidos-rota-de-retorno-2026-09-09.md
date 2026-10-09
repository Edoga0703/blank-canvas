# Reativação de leads perdidos (Rota de Retorno)

Hoje um lead que vai para a coluna de Perda fica preso lá para sempre, mesmo que volte a falar com a empresa. A solução: cada etapa de Perda passa a ter uma "Rota de Retorno" — para onde o lead volta automaticamente quando responde de novo.

## Como funciona (visão do cliente)

1. Ao marcar uma etapa como Perda, o cliente configura uma vez, no próprio pop-up da etapa:
   - **Reativar se o lead voltar a falar** (liga/desliga)
   - **Funil e etapa de retorno** (pode ser outro funil, ex.: "Reengajamento" ou "Novo lead")
   - **Responsável ao retornar**: mantém o antigo, volta para a fila de distribuição, ou um usuário fixo
   - **Modo de atendimento ao retornar**: IA assume ou humano assume
   - **Prazo**: só reativa se o retorno acontecer dentro de X dias (0 = sempre)
2. O pop-up "Registrar perda" (perda manual) mostra essa rota já preenchida e permite ajustar só para aquele lead — sem mexer na regra da etapa.
3. Vale igual para perda manual e para perda automática por automação (sem resposta / intenção negativa). A regra mora na etapa de destino, então qualquer caminho que jogue o card em Perda herda a mesma rota.
4. Ao entrar na Perda, o atendimento é encerrado: régua parada, IA silenciada, ticket/histórico do ciclo fechado com motivo e valor.
5. Quando o lead manda mensagem de novo, o card sai da Perda para a rota configurada, com um registro no histórico ("Reativado por retorno do lead") e notificação para o responsável.

## Regras de segurança

- Sem rota configurada = comportamento atual (o lead continua na Perda). Nada quebra em funis existentes.
- Funis sem etapa de Perda (ex.: pós-venda) não são afetados.
- Reativação só dispara com mensagem **de entrada** do lead, nunca com envio da empresa, e no máximo uma vez por janela curta (anti-flood).
- Se a etapa de retorno tiver sido apagada, o sistema cai na primeira etapa do funil escolhido e avisa; nunca deixa o card órfão.
- Todo movimento passa pelo motor central de movimentação já existente, então funil e etapa nunca ficam divergentes.

## Detalhes técnicos

- Banco: novas colunas em `crm_stage` — `retorno_ativo`, `retorno_pipeline_id`, `retorno_stage_id`, `retorno_responsavel_modo` ('manter' | 'fila' | 'fixo'), `retorno_user_id`, `retorno_modo_atendimento`, `retorno_janela_dias`. Em `crm_cards` — `perdido_em`, `retorno_stage_id` (override por card), `reativado_em`.
- `src/lib/crm-engine.server.ts`: em `moveCardToStage`, ao entrar em etapa `tipo='perda'` grava `perdido_em`, pausa régua e fecha o ciclo. Nova função `reactivateLostCard(admin, card)` centraliza a volta.
- `src/lib/kanban-engine.server.ts` (`onCardResponse`): se o card está em etapa de Perda, chama `reactivateLostCard` antes de qualquer outra regra e retorna.
- UI: novo bloco "Rota de retorno" no diálogo de automação/etapa em `src/routes/app/crm.tsx`, visível só quando a etapa é Perda; o diálogo "Registrar perda" ganha o seletor de rota pré-preenchido.
