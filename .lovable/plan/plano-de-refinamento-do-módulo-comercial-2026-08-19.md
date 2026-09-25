# Plano de Refinamento do Módulo Comercial

Este plano descreve as alterações para interligar o módulo Comercial com os módulos de Catálogo e Agendamentos, simplificar a interface e adicionar novas métricas ao Dashboard.

## Alterações Sugeridas

### Banco de Dados (Lovable Cloud)
- Adicionar colunas `item_tipo` (enum: 'produto', 'servico'), `item_id` (uuid) e `item_nome` (text) na tabela `crm_venda`.
- Criar migração para adicionar estas colunas e atualizar o RLS (GRANTs necessários).

### Backend (Server Functions)
- **src/lib/comercial.functions.ts**:
  - Atualizar `registerSale` para aceitar `item_tipo`, `item_id` e `item_nome`.
  - Atualizar o retorno de dados para incluir estas novas colunas.
- **src/lib/dashboard.functions.ts**:
  - Implementar lógica para agrupar vendas por `item_nome` para os novos widgets.
  - Adicionar `salesByItem` ao objeto de retorno das métricas.

### Frontend (Componentes e Rotas)
- **src/routes/app/comercial.tsx**:
  - Remover colunas "Lançado por", "ROI" e "Custo" da tabela de histórico.
  - Atualizar o diálogo de "Nova Venda":
    - Adicionar seletor para tipo de item (Produto/Serviço).
    - Adicionar seletor dinâmico que busca dados de `listProdutos` ou `listServicos` baseada na escolha.
  - Exibir o item vendido na listagem de vendas.
- **src/components/dashboard-v2/widgets-registry.tsx**:
  - Criar um novo widget `chart_sales_by_item` (gráfico de pizza ou barras) para mostrar vendas por produto/serviço.
- **src/components/dashboard-v2/widget-data.ts**:
  - Atualizar o tipo `DashboardMetrics` para incluir `salesByItem`.

## Detalhes Técnicos

### Estrutura do Widget
```typescript
{
  id: "chart_sales_by_item",
  title: "Vendas por Item",
  description: "Distribuição de vendas por produto ou serviço.",
  category: "Vendas",
  // ... render com PieBig ou BarBig
}
```

### Migração SQL
```sql
ALTER TABLE public.crm_venda 
ADD COLUMN item_tipo text CHECK (item_tipo IN ('produto', 'servico')),
ADD COLUMN item_id uuid,
ADD COLUMN item_nome text;

-- Grants já existentes devem cobrir colunas novas se for SELECT *, 
-- mas garantiremos o acesso.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_venda TO authenticated;
```
