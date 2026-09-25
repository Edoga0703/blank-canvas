# Plano de Auditoria e Correção do Motor de Automação

Auditoria geral no sistema de automações (Kanban, Agendamentos e Distribuição) para garantir que mensagens e disparos ocorram corretamente no momento da chegada do lead e transição de etapas.

## Alterações Técnicas

### 1. Kanban e Regras de Automação (`src/lib/kanban-engine.server.ts`)
- **Correção de Disparo Imediato:** Ajustar a lógica de `delayToMs` e `processKanbanReguaCard` para garantir que, se o delay for 0 (ou não definido), a automação tente disparar imediatamente na entrada do lead.
- **Robustez no Webhook:** Garantir que `processKanbanReguaForNumero` seja chamado de forma confiável após a criação do card em todos os pontos de entrada (WhatsApp, Formulários, Leads Meta).

### 2. Integração de Webhooks (`src/lib/uazapi-webhook.server.ts`)
- **Trigger de Automação:** Adicionar chamada explícita para `processKanbanReguaForNumero` dentro de `handleUazapiWebhookInternal` logo após o `upsertCard`, garantindo que novos leads recebam a primeira mensagem da automação sem depender exclusivamente do cron.

### 3. Automação de Agendamentos (Calendário)
- **Sincronização de Status:** Verificar se a criação de eventos no calendário (`crm_agendamentos`) dispara as notificações configuradas corretamente (via webhook ou motor de regras).

### 4. Melhoria na Escolha de Conexão
- **Seleção de Instância:** Otimizar a busca de instâncias conectadas em `kanban-engine.server.ts` para evitar falhas silenciosas quando há múltiplas conexões cadastradas.

## Testes e Validação
- Simular entrada de lead via webhook Uazapi e verificar disparo imediato.
- Validar troca de etapa no Kanban e execução da régua associada.
- Verificar logs do servidor para confirmar execução dos triggers de automação.
