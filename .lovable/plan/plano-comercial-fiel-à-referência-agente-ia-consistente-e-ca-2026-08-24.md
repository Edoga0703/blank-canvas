# Plano: Comercial fiel à referência, Agente IA consistente e Catálogo unificado

## 1. Módulo Comercial — aplicar o layout dos 6 anexos

Refazer `src/routes/app/comercial.tsx` seguindo as referências, mantendo a paleta #0B22FE:

- **Cabeçalho dinâmico por aba**: o par de botões da direita muda conforme a aba (Este mês + Exportar + Registrar venda / Nova meta / Todos os vendedores / Buscar produto + Filtros + Novo produto / intervalo de datas + Exportar relatório).
- **Visão geral**: 3 KPI cards (Receita do mês com variação, Meta mensal com barra, Vendas realizadas com ticket médio), faixa azul clara "Faltam R$ X para atingir a meta" com link "Ver metas", e tabela "Vendas recentes" com busca, filtros e "Ver todas as vendas".
- **Vendas**: 2 KPIs (Total vendido com contagem confirmadas/pendentes, Vendas), tabela "Todas as vendas" com busca, filtro de status, intervalo de datas, paginação e coluna Canal; ao clicar numa linha abre o painel lateral "Detalhes da venda" (cliente, produto, data, forma de pagamento, vendedor, status, valor, Editar venda).
- **Metas**: card grande "Meta geral do mês" com progresso e bloco "Faltam", tabela "Metas por vendedor" (meta, realizado, barra colorida por faixa), rodapé com destaque do vendedor mais próximo da meta, e card lateral "Configuração da meta" (período, tipo, responsáveis, Editar configurações).
- **Equipe**: 3 KPIs (Receita da equipe, Vendas, Meta conjunta), tabela "Desempenho da equipe" com colunas ordenáveis e link "Ver desempenho", paginação, e card lateral "Destaque do mês" com avatar, receita, % da meta e maior crescimento.
- **Produtos**: 3 KPIs (Produtos ativos, Mais vendido, Receita em produtos) e tabela "Produtos e serviços" (categoria, vendas, receita com barra proporcional, ticket médio, status, ações).
- **Relatórios**: sidebar esquerda de tipos de relatório (Resumo de vendas, Desempenho da equipe, Produtos e serviços, Metas) + conteúdo com 3 KPIs, gráfico de área "Vendas no período" e tabela "Resumo por vendedor" com barras verdes.

Os agregados vêm de `src/lib/comercial-stats.functions.ts` (ampliar com séries por dia, ranking por vendedor e estatísticas por item do catálogo).

## 2. Agente IA — correções

- **Avatar não atualiza após salvar**: hoje o Studio e o card lateral leem de estado carregado uma vez. Vou fazer `updateAgentAvatar`/`generateAgentAvatar` retornarem o registro atualizado e o Studio atualizar imediatamente o agente na lista e no header (sem depender de recarregar a página nem de cache).
- **Auditoria de funcionamento**: revisão do caminho ponta a ponta (webhook → motor de IA → resposta → movimentação de etapa no Kanban → handoff para atendente), corrigindo o que estiver quebrado. Entrego um resumo do que foi verificado e do que foi ajustado.
- **"Catálogo de produtos" e "Fluxo de CRM" dentro de Conhecimento**: hoje o catálogo é realmente injetado no prompt; o fluxo de CRM é apenas um rótulo informativo. Vou torná-los itens reais e explícitos: liga/desliga por agente, com indicação do que cada um injeta (itens do catálogo e etapas/regras do funil ligado ao agente).

## 3. Unificação Catálogo + Serviços

Um único módulo **Catálogo** passa a guardar produtos e serviços:

- Adicionar em `produto` os campos de serviço (`tipo` produto/serviço, duração em minutos, agendável).
- Migrar os registros de `servico` para `produto` como tipo serviço, mantendo os agendamentos apontando para o item correspondente.
- A aba "Serviços" em Agendamentos deixa de ser cadastro próprio e passa a listar/selecionar itens do catálogo marcados como agendáveis, com atalho para o Catálogo.
- O Catálogo ganha filtro por tipo (Todos / Produtos / Serviços) e os campos de serviço aparecem só quando o tipo é serviço.
- O prompt do Agente IA passa a receber produtos **e** serviços (com duração e se é agendável), e o módulo Comercial usa a mesma fonte única na aba Produtos.

## Detalhes técnicos

- Migração de banco: novas colunas em `public.produto`, cópia dos dados de `public.servico`, `servico_id` do agendamento remapeado; a tabela `servico` fica desativada após a migração.
- Frontend em TanStack Query, componentes shadcn e gráficos com recharts, seguindo o padrão visual já usado no Comercial.
