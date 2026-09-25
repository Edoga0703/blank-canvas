# Plan - Otimização do Módulo Agente IA

Otimizar o carregamento e a reatividade do módulo de Agente IA, reduzindo latência e eliminando esperas desnecessárias entre interações no Studio.

## Alterações Técnicas

### 1. Otimização de Carregamento (Frontend)
- **Cache Local:** Implementar cache em memória para as configurações dos agentes no `src/routes/app/agente.tsx`, similar ao que já existe no Dashboard.
- **Carregamento Paralelo:** Ajustar o `useEffect` para carregar a lista de agentes (`loadAgents`) apenas uma vez na montagem, em vez de disparar um `reload` completo a cada troca de ID se os dados básicos já estiverem disponíveis.
- **Redução de State Updates:** Consolidar múltiplos `useState` em um `useReducer` ou objeto de estado para evitar re-renders excessivos.

### 2. Performance do Backend (Server Functions)
- **Otimização de Query:** Simplificar a função `listAgents` em `src/lib/agent-ai.functions.ts` para usar o `resolveCompanyIdCached` (reduzindo latência de consulta de permissão).
- **Redução de Overhead:** Otimizar o `reload` no servidor para não reprocessar o prompt do sistema (`buildSystemPrompt`) se nada mudou na configuração base.

### 3. Melhoria na Experiência do Studio
- **Skeleton Screens:** Substituir o loader de tela cheia por estados de loading parciais (Skeletons) nos componentes de configuração e chat, mantendo a sidebar sempre interativa.
- **Debounce de Busca:** Adicionar debounce na busca de agentes para evitar filtros pesados na lista durante a digitação.

### 4. Correção de Fluxo
- **Gargalo de Setup:** Garantir que o estado `hasConfig` seja validado instantaneamente a partir dos dados locais/cache, eliminando o "pisco" da tela de "Conte sobre seu negócio" ao navegar entre agentes já configurados.
