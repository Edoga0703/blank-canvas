# Plano de Implementação - Refinamento do Módulo Comercial (Produtos e Relatórios)

O objetivo é completar a implementação do módulo Comercial, adicionando as abas de "Produtos" e "Relatórios" conforme os designs fornecidos, utilizando a identidade visual Metrix CRM (#0B22FE).

## Alterações Propostas

### Backend & Lógica
- **`src/lib/comercial-stats.functions.ts`**:
    - Criar `getProductStats`: Retorna métricas de produtos (Total ativos, Mais vendido, Receita total em produtos).
    - Criar `getProductsList`: Retorna a lista de produtos com estatísticas de vendas por produto (agregando `crm_venda`).
    - Criar `getReportsData`: Retorna dados para os gráficos de "Resumo de vendas" e "Resumo por vendedor" filtrados por período.

### Interface (Frontend)
- **`src/routes/app/comercial.tsx`**:
    - Adicionar as abas "Produtos" e "Relatórios" ao componente `Tabs`.
    - Implementar `TabsContent` para **Produtos**:
        - Grid de KPI Cards (Produtos ativos, Mais vendido, Receita em produtos).
        - Tabela de "Produtos e serviços" com barra de busca, filtros e botão "Novo produto".
        - Colunas: Produto, Categoria, Vendas (com sparkline/barra), Receita, Ticket médio, Status, Ações.
    - Implementar `TabsContent` para **Relatórios**:
        - Sidebar interna para navegar entre tipos de relatórios (Resumo de vendas, Desempenho da equipe, etc.).
        - Seção de "Resumo de vendas" com KPIs de topo, gráfico de linha para "Vendas no período" e tabela de "Resumo por vendedor" com barras de progresso de meta.
    - Garantir que a paleta de cores (#0B22FE) e o estilo de cards/tabelas "Metrix" sejam mantidos.

## Detalhes Técnicos
- Utilizar `useQuery` para carregar os dados das novas abas de forma independente.
- Integrar com as tabelas existentes `produto` e `crm_venda`.
- Seguir o padrão de design de 3 colunas ou layouts de dashboard modernos observados nos anexos.
