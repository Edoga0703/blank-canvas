# Plano de Melhoria na Gestão de Dono e Distribuição de Leads

O objetivo é garantir que o sistema respeite as configurações de automação, especialmente quando conversas são excluídas ou finalizadas, e assegurar uma distribuição justa (rodízio) de leads.

## Alterações Técnicas

### 1. Gestão de Dono (Owner) no CRM
- **Limpeza de Dono ao Excluir**: Em `src/lib/evolution.functions.ts`, na função `handleChatAction` (ação 'delete'), adicionar a limpeza do campo `owner_id` na tabela `crm_cards` para o número correspondente. Isso garante que o lead volte sem dono se retornar.
- **Opções de Finalização**: Em `src/routes/app/conversas.tsx`, na função `finalizar`, implementar a lógica que limpa o `owner_id` se o usuário escolher "Finalizar e Remover Dono".
- **Refinamento na Criação de Leads**: Em `src/lib/crm-engine.server.ts`, ajustar `upsertCard` para que a atribuição automática de dono (`owner_id`) só ocorra se a etapa estiver explicitamente em **modo manual**. Se for IA ou Handoff, o lead inicia sem dono para permitir a triagem ou rodízio posterior.

### 2. Fluxo de Distribuição e IA
- **Distribuição Pós-Qualificação**: Em `src/lib/ai-engine.server.ts`, garantir que ao mover para uma etapa manual após a qualificação, a função `pickLeadOwner` seja chamada imediatamente.
- **Respeito ao Rodízio**: Revisar `src/lib/distribution.functions.ts` para garantir que `last_assigned_at` seja atualizado corretamente em todas as chamadas, evitando que o mesmo usuário receba leads em sequência se houver outros disponíveis.

### 3. Ajustes nos Webhooks
- **Uazapi & Evolution**: Reforçar a verificação de `modo_atendimento` nos webhooks (`src/lib/uazapi-webhook.server.ts` e `src/routes/api/public/whatsapp-webhook.ts`) para que a distribuição humana só ocorra se a etapa não for de IA.

## Verificação
- Testar o fluxo de "Excluir Conversa" e verificar se o `owner_id` no CRM é removido.
- Testar a finalização de atendimento com e sem a opção de manter o dono.
- Validar se novos leads em etapas de IA não recebem dono humano prematuramente.
- Simular múltiplas entradas de leads para validar o rodízio entre usuários ativos na fila.
