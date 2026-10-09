# Plano de Integração do Módulo Agente IA

Este plano visa tornar o módulo de Agente IA 100% funcional e integrado com os demais módulos (Dashboard, Conversas, CRM).

## Ações Propostas

### 1. Integração com o Dashboard
- **Objetivo**: Permitir que o gestor acompanhe o desempenho da IA em tempo real.
- **Implementação**: 
    - Adicionar novos widgets no `DashboardGrid.tsx` focados em IA:
        - "Atendimentos por IA": Quantidade de conversas gerenciadas pela IA no período.
        - "Taxa de Qualificação (IA)": Percentual de leads que a IA marcou como `[QUALIFICADO]`.
        - "Leads Transferidos": Quantidade de leads que a IA passou para humanos (`[HANDOFF]`).
    - Atualizar `widget-data.ts` e `dashboard.functions.ts` para buscar essas métricas no banco.

### 2. Integração com o CRM (Kanban)
- **Objetivo**: Visualizar e controlar a atuação da IA diretamente no funil de vendas.
- **Implementação**:
    - Adicionar indicadores visuais nos cards do Kanban quando a IA estiver ativa.
    - Permitir alternar entre "Modo IA" e "Modo Manual" diretamente na configuração da etapa (`crm_stage`).
    - Implementar a transição automática de etapas baseada na intenção detectada pela IA (`ai-engine.server.ts`).

### 3. Integração com o Módulo de Conversas
- **Objetivo**: Melhorar a experiência do atendente ao lidar com leads atendidos por IA.
- **Implementação**:
    - Exibir o histórico de "pensamento" ou logs da IA na conversa (opcional/admin).
    - Botão de "Intervir": Pausar a IA instantaneamente ao enviar uma mensagem manual.
    - Destaque visual para mensagens enviadas pela IA.

### 4. Ajustes Estruturais e Estabilidade
- **Objetivo**: Garantir que a IA obedeça rigidamente às instruções.
- **Implementação**:
    - Refinamento do `ai-prompt.ts` para garantir prioridade máxima à Base de Conhecimento.
    - Ajuste fino de temperatura e parâmetros no `lovable-ai.server.ts`.
    - Melhorar a detecção de instâncias de WhatsApp ativas para evitar falhas de envio.

## Detalhes Técnicos
- Utilização de `createServerFn` para novas métricas de dashboard.
- Atualização de RLS policies para garantir que as novas métricas respeitem a multi-tenancy.
- Otimização do processamento de webhooks para reduzir latência.
