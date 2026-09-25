# Plano de Refinamento da Automação de CRM e Follow-up

Este plano visa aprimorar a lógica de automação do CRM para suportar fluxos de follow-up complexos, permitindo reengajamento automático com IA e tratamento inteligente de respostas negativas (perda automática) ou positivas (avanço de etapa).

## Alterações

### Banco de Dados (Supabase)
- Adicionar colunas na tabela `crm_stage` para suportar intenções de resposta:
  - `move_se_negativo_para` (UUID): Etapa para onde mover se a IA detectar resposta negativa/desistência.
  - `move_se_positivo_para` (UUID): Etapa para onde mover se a IA detectar resposta positiva/interesse.
  - `intent_handling_enabled` (boolean): Ativa o processamento de intenções pela IA.

### Backend (Server Functions e Webhooks)
- **WhatsApp Webhook (`src/routes/api/public/whatsapp-webhook.ts`)**:
  - Atualizar a lógica de processamento da resposta da IA.
  - Se `intent_handling_enabled` estiver ativo na etapa atual:
    - Solicitar à IA que classifique a intenção do cliente (POSITIVA, NEGATIVA ou NEUTRA).
    - Executar a movimentação do card baseada na classificação e nas novas colunas da etapa.
- **Kanban Engine (`src/lib/kanban-engine.server.ts`)**:
  - Ajustar `onCardResponse` para não interferir quando o processamento de intenção por IA estiver ativo.

### Frontend (UI do CRM)
- **Diálogo de Automação (`src/routes/app/crm.tsx`)**:
  - Na aba **Ações e Regras**, adicionar configurações para:
    - "Se a resposta for negativa, mover para" (com atalho para a etapa de Perda).
    - "Se a resposta for positiva, mover para" (com atalho para a etapa de Ganho ou Comercial).
  - Incluir botões rápidos para facilitar a configuração dessas rotas de contingência.

## Detalhes Técnicos
- Utilizar o `parseAiOutput` existente para capturar novos marcadores como `[INTENCAO: POSITIVA|NEGATIVA|NEUTRA]`.
- Garantir que a movimentação por intenção respeite o `modo_atendimento` da nova etapa (ex: reativar IA em reengajamento).
