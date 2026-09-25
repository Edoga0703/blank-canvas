# Reorganização de Metas e Diferenciação de Leads

Reorganizar o módulo de Metas, movendo-o para a seção Comercial, e implementar a diferenciação entre Leads e Contatos Internos para garantir metrificações precisas.

## Alterações

### Comercial e Metas
- Módulo **Metas** movido de "Usuários" para o módulo **Comercial**.
- Adicionados botões de atalho no cabeçalho do Comercial para definir a **Meta Geral** e registrar **Nova Venda**.
- Otimização do cálculo de receita mensal no Comercial para evitar conflitos de variáveis.

### Gestão de Leads vs. Internos
- Criado campo `tipo_contato` na base de dados para distinguir entre **Lead/Oportunidade** e **Interno/Parceiro**.
- Atualizado o **Lead Drawer** para permitir a seleção do tipo de contato.
- Implementado filtro no módulo de **Contatos** para visualizar especificamente "Internos / Parceiros".
- **Inteligência de Dados**: Contatos marcados como "Internos" são automaticamente excluídos das métricas de conversão, contagem de leads e volume do pipeline no Dashboard.

## Detalhes Técnicos
- Migração SQL para adicionar a coluna `tipo_contato` à tabela `public.crm_cards`.
- Ajuste nas queries do `src/lib/dashboard.functions.ts` para filtrar por `tipo_contato`.
- Atualização da interface em `src/routes/app/comercial.tsx`, `src/routes/app/contatos.tsx` e `src/components/config/equipe-tab.tsx`.
