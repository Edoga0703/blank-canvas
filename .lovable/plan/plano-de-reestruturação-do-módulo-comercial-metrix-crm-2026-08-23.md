# Plano de Reestruturação do Módulo Comercial (Metrix CRM)

Este plano visa reconstruir o módulo Comercial seguindo a nova identidade visual "Metrix" apresentada nos anexos, implementando novos submodelos e funcionalidades de gestão de vendas, metas e desempenho.

## Visão Geral das Alterações
O novo layout será dividido em abas principais: **Visão Geral**, **Vendas**, **Metas**, **Equipe**, **Produtos** e **Relatórios**. A interface será limpa, com cards informativos no topo e tabelas detalhadas abaixo.

## Etapas de Implementação

### 1. Reestruturação do Layout Base (`src/routes/app/comercial.tsx`)
- Implementar sistema de abas (`Tabs`) para navegação entre os submodelos.
- Criar o cabeçalho dinâmico com filtros globais (período, vendedor) e ações rápidas (Registrar venda, Nova meta).
- Adaptar o esquema de cores para o padrão Metrix (#0B22FE).

### 2. Submódulo: Visão Geral
- **Cards de KPI**: Receita do mês (com variação %), Meta mensal (barra de progresso), Vendas realizadas e Ticket médio.
- **Lista de Vendas Recentes**: Tabela compacta com os últimos negócios fechados.

### 3. Submódulo: Vendas
- Tabela completa de transações com filtros avançados (canal, status, data).
- **Drawer de Detalhes**: Ao clicar em uma venda, abrir painel lateral com informações completas (cliente, produto, vendedor, método de pagamento).
- Botão "Registrar Venda" com modal otimizado para seleção de itens do catálogo.

### 4. Submódulo: Metas
- Gestão visual da meta geral do mês.
- **Metas por Vendedor**: Lista de atendentes com suas respectivas metas individuais, realizado e progresso visual.
- Painel de configuração de metas por período e responsável.

### 5. Submódulo: Equipe
- Dashboard de desempenho individual: Receita total, volume de vendas, ticket médio e taxa de conversão por vendedor.
- **Destaque do Mês**: Card especial para o vendedor com maior crescimento ou alcance de meta.
- Ranking da equipe.

### 6. Submódulo: Produtos e Serviços
- Integração direta com o catálogo existente.
- Tabela de itens com métricas de vendas: volume vendido e receita gerada por item.
- Visualização de "Mais vendidos".

### 7. Submódulo: Relatórios
- Gráfico de evolução de vendas no período (Recharts).
- Resumo executivo para exportação (PDF/CSV).
- Filtros por categoria e desempenho da equipe.

## Detalhes Técnicos
- **Estado**: Utilizar TanStack Query para gerenciar o cache de vendas e membros, reduzindo latência.
- **Backend**: Atualizar `src/lib/comercial.functions.ts` para suportar as novas consultas de agregados (KPIs) por período.
- **Componentes**: Reaproveitar componentes de UI (Table, Dialog, Tabs) personalizados com a estética Metrix.

## User Feedback Necessário
- As imagens mostram "Troca de limite" e "Antecipação de FGTS". Devo incluir esses produtos como demonstração padrão para novas contas?
- Deseja que o relatório de "Vendas por Canal" inclua origens automáticas (ex: IA Agente, Checkout) ou apenas manuais?
