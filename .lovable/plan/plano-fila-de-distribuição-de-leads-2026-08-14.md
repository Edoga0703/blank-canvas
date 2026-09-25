# Plano: Fila de Distribuição de Leads

Este plano visa transferir a lógica de transferência e distribuição de leads do módulo de Agente IA para um novo submódulo dentro de **Usuários**, permitindo um controle granular (rodízio, ordem específica, pausa, etc.) e visibilidade de carga por atendente.

## Alterações de Backend (Banco de Dados)

1.  **Nova Tabela `crm_distribution_queues`**:
    *   `id`, `company_id`, `name`, `active` (boolean).
    *   `strategy` (enum: 'round_robin', 'weighted', 'sequential').
    *   `created_at`, `updated_at`.
2.  **Nova Tabela `crm_queue_members`**:
    *   `id`, `queue_id`, `user_id`, `order` (integer), `active` (boolean).
    *   `leads_count` (integer - total acumulado).
    *   `last_assigned_at` (timestamp).
3.  **Vínculo com Funis**:
    *   Adicionar `distribution_queue_id` na tabela `crm_pipeline` ou `crm_stage`.
4.  **Permissões (RLS)**:
    *   Políticas para que apenas Admins/Owners gerenciem as filas.

## Alterações de Funcionalidades (Server Functions)

1.  **`src/lib/distribution.functions.ts`**:
    *   `listQueues`: Listar filas da empresa.
    *   `upsertQueue`: Criar ou editar fila e seus membros.
    *   `getNextUserInQueue`: Função (usada internamente por webhooks/agentes) para determinar o próximo atendente com base na estratégia escolhida.
2.  **Migração da Lógica do Agente**:
    *   Remover campos de transferência legados da configuração do Agente IA em `agent_config`.
    *   Ajustar `whatsapp-webhook.ts` e `meta-leads-webhook.ts` para usar a nova fila de distribuição quando um novo lead entrar ou quando a IA solicitar handoff.

## Alterações de Interface (Frontend)

1.  **Novo Submódulo em `src/components/config/equipe-tab.tsx`**:
    *   Adicionar uma nova aba "Fila de Distribuição" ao lado de "Usuários", "Funções" e "Logs".
    *   **Painel de Gestão**:
        *   Lista de filas ativas.
        *   Drag-and-drop para mudar a ordem dos atendentes na fila.
        *   Toggles para pausar/ativar atendentes individuais na distribuição.
        *   Indicadores de performance (leads recebidos).
2.  **Configuração de Funil/Etapa**:
    *   Adicionar seletor de "Fila de Distribuição" na configuração de etapas do CRM (`crm.tsx`) ou nas configurações de funil.
3.  **Limpeza da UI do Agente**:
    *   Remover seções de transferência manual redundantes em `src/routes/app/agente.tsx`.

## Detalhes Técnicos

```text
Estratégia Round-Robin:
1. Busca membros ativos na fila ordenada por 'last_assigned_at' ASC.
2. Atribui ao primeiro da lista.
3. Atualiza 'last_assigned_at' e incrementa 'leads_count'.

Estratégia Sequencial (Ordem Manual):
1. Busca membros ativos ordenados por 'order' ASC.
2. Compara com o último ID atribuído (guardado na fila) e pega o próximo.
```

## Próximos Passos

1. Criar a migração SQL com as novas tabelas e RLS.
2. Implementar as server functions de gestão de fila.
3. Desenvolver a UI na aba de Equipe.
4. Integrar o motor de distribuição nos webhooks de entrada.
