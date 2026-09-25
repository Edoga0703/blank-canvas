# Refinamento de Alta Fidelidade do Módulo Comercial

Este plano detalha a reestruturação do módulo Comercial para alinhar com as referências visuais de alta fidelidade e corrigir lacunas de integração de dados nos sub-módulos.

## Ações imediatas
- Reestruturar as abas do módulo Comercial (`Visão Geral`, `Vendas`, `Metas`, `Equipe`, `Produtos`, `Relatórios`).
- Implementar widgets de dashboard e tabelas de dados com o estilo visual "Metrix" (fundo `#F4F5F9`, destaques `#0B22FE`, tipografia negrito).
- Corrigir a extração de dados nos server functions para garantir que rankings, vendas por produto e relatórios funcionem corretamente.
- Unificar o catálogo de produtos e serviços conforme solicitado.

## Alterações técnicas

### 1. Backend & Server Functions (`src/lib/comercial-stats.functions.ts`)
- **Ranking Real:** Ajustar `getTeamPerformance` para calcular o ranking baseado em faturamento confirmado e adicionar indicadores de posição (1º, 2º, 3º).
- **Vendas por Produto:** Refinar `getProductsPerformance` para buscar o histórico completo de itens vendidos, garantindo que a coluna "Vendas" reflita a realidade.
- **Relatórios:** Expandir `getReportsData` para suportar filtros por vendedor, produto e categoria, além de exportação simulada.

### 2. Interface do Dashboard Comercial (`src/routes/app/comercial.tsx`)
- **Aba Metas:** Recriar a visualização de metas conforme o mockup:
  - Card principal com barra de progresso grande e destaque para "Faltam R$ X".
  - Tabela de metas por vendedor com avatares e barras de progresso individuais.
  - Painel lateral de "Configuração da meta".
- **Aba Vendas:** Adicionar painel de "Detalhes da venda" lateral (drawer/sidebar) que aparece ao clicar em uma linha da tabela.
- **Aba Equipe:** Implementar card de "Destaque do mês" e estatísticas individuais detalhadas.
- **Aba Produtos:** Adicionar KPIs de "Mais vendido" e "Ticket Médio" no topo da listagem.
- **Aba Relatórios:** Criar interface de seleção lateral para diferentes tipos de relatórios (Resumo, Desempenho, Produtos, Metas) com gráficos do `recharts`.

### 3. Componentes UI (`src/components/comercial/`)
- Atualizar `KpiCard` e `MetaCard` para suportar variantes de layout (compacto vs expandido).
- Criar `VendaDetalhesSide` para visualização rápida de transações.

## User Experience
- Navegação fluida entre sub-módulos sem recarregamento de página.
- Visualização clara do progresso das metas para incentivar a equipe.
- Facilidade em identificar os produtos e vendedores com melhor performance.
