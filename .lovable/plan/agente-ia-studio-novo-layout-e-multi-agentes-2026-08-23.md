# Agente IA Studio - Novo Layout e Multi-Agentes

Este plano reestrutura o módulo de Agente IA para um modelo de "Studio", permitindo a criação de múltiplos agentes por empresa e personalização de nomes, mantendo total compatibilidade com as configurações existentes.

## Mudanças Visuais e de UI

- **Navegação em Studio:** Implementação de uma barra lateral (Sidebar) dentro da página de agentes para listar os agentes existentes.
- **Criação Dinâmica:** Botão "Novo Agente" para permitir criar agentes com nomes personalizados, além dos tipos pré-definidos (Qualificação, Follow-up, Pós-venda).
- **Layout de Configuração:** Centralização das configurações (Identidade, Comportamento, Base de Conhecimento) em abas ou seções claras.
- **Preservação de Dados:** Os agentes existentes de tipo `qualificacao`, `followup` e `posvenda` serão carregados automaticamente na lista.

## Alterações Técnicas

- **agent-ai.functions.ts:**
  - Atualizar `addAgentExample` para aceitar `agentId` opcional, permitindo salvar exemplos para qualquer agente.
  - Criar função `listAgents` para retornar todos os agentes da empresa.
  - Ajustar `generateAgentConfig` para suportar nomes personalizados vindo da IA.
- **agente.tsx:**
  - Refatorar para um layout de 3 colunas:
    1. Sidebar de agentes (Lista).
    2. Área de configuração (PRD/Treinamento).
    3. Playground de teste (Chat).
  - Atualizar lógica de `upsert` para usar `id` quando disponível, evitando sobrescrever agentes de tipos diferentes.
- **ai-engine.server.ts:**
  - Ajustar a seleção de agente para priorizar o agente marcado como `is_default` ou permitir a troca dinâmica de agentes conforme a etapa do CRM (já suportado via `crm_stage`).
- **Migração Segura:** O código usará `onConflict: "company_id,tipo"` apenas para os tipos legados e `onConflict: "id"` para novos agentes, garantindo que nenhum dado de cliente atual seja perdido.

## Segurança e Performance

- **RLS:** As políticas existentes de `agent_config` (company-scoped) garantem que um usuário só veja/edite agentes da sua própria empresa.
- **Cache:** Utilização do `company_id` do contexto para filtragem eficiente.

