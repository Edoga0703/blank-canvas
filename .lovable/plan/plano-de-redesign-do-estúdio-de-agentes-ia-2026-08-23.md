# Plano de Redesign do Estúdio de Agentes IA

O objetivo é transformar a interface do módulo de Agentes IA em um "Studio" moderno, inspirado no layout enviado, removendo o botão de "Edição Avançada" (integrando suas funcionalidades) e melhorando a organização visual dos campos.

## Alterações Visuais e Estruturais

- **Layout de Três Colunas**:
  - **Esquerda**: Barra lateral para navegação entre agentes e criação de novos.
  - **Centro**: Configuração detalhada do agente selecionado (Identidade, Conhecimento, Comportamento, Fluxo).
  - **Direita**: Playground de teste em tempo real com visual de chat.

- **Fim da "Edição Avançada" Separada**:
  - Integração das abas de configuração avançada (Modelo, Vendas, Agendamento) diretamente no Studio Central.
  - Transformação do botão flutuante em abas horizontais ou seções colapsáveis dentro do fluxo de configuração.

- **Refinamento dos Campos**:
  - Uso de cards semânticos para agrupar informações relacionadas.
  - Melhoria no contraste e tipografia para facilitar a leitura das regras e prompts.
  - Implementação de indicadores de status visual (Ativo/Inativo) e selos de tipo de agente.

## Detalhes Técnicos

- **Componente Centralizado**: Unificação da lógica de `src/routes/app/agente.tsx` e `src/routes/app/agente.avancado.tsx` para evitar redundância.
- **Gerenciamento de Estado**: Manutenção do `activeAgentId` para carregar dinamicamente as configurações avançadas sem trocar de página.
- **UI/UX**:
  - Adição de `Tabs` horizontais no centro: Visão Geral, Conhecimento, Comportamento, Fluxo Comercial, Canais, Análises.
  - Implementação de botões de ação fixos no topo (Salvar, Histórico, Pré-visualizar).

## User Review Required

> [!IMPORTANT]
> A página de "Edição Avançada" atual será descontinuada em favor da integração total no Studio. Isso facilitará o ajuste fino sem perder o contexto do teste.
