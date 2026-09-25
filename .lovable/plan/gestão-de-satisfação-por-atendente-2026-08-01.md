# Gestão de satisfação por atendente

## Onde colocar

Recomendação: **em Configurações → Satisfação**, como uma sub-aba "Respostas".

Motivo: a tabela `csat_response` já é do módulo de satisfação e o gestor precisa ver
pergunta, envio e resultado no mesmo lugar. Em Usuários entraria apenas um resumo
(nota média por atendente) — evita duplicar a tela, mas dá o atalho de RH.

Entrega em dois pontos, sem duplicar código:
1. Configurações → Satisfação ganha abas internas: **Configuração** (atual) e **Respostas** (nova).
2. Usuários: uma coluna/linha extra "CSAT" com nota média e nº de respostas do período,
   reaproveitando a mesma função de agregação.

## O que a tela de Respostas mostra

- Filtros: período (7/30/90 dias ou custom) e atendente.
- Cards de topo: nota média geral, total enviados, total respondidos, taxa de resposta.
- Ranking por atendente: nome, nº enviados, nº respondidos, taxa, nota média,
  distribuição 1–5 (barrinhas) e % de detratores (1–2).
- Lista de respostas individuais: contato, nota, comentário, atendente, data.
  Mobile vira lista de cards; desktop, tabela.
- Exportar CSV do período.

## Detalhes técnicos

- Fonte: `public.csat_response` (`enviado_por`, `score`, `respondido_em`, `comentario`,
  `contato_nome`, `numero`, `company_id`). Nenhuma mudança de schema necessária.
- Garantir que `enviado_por` seja sempre preenchido com o dono do lead/atendente que
  finalizou o atendimento no momento do envio (ajuste em `src/lib/csat.functions.ts`
  quando estiver nulo).
- Nova server fn `listCsatResponses` + `getCsatByAgent` em
  `src/lib/csat-config.functions.ts` (ou novo `csat-reports.functions.ts`),
  com `requireSupabaseAuth` e escopo por `company_id`.
- Nomes dos atendentes vindos de `company_user` + `profiles` (mesmo padrão já usado
  em Conversas/CRM, buscando perfis separadamente).
- Permissão: atendente vê só as próprias respostas; owner/admin vê todas.
- UI nova em `src/components/config/csat-respostas-tab.tsx`, plugada na aba
  Satisfação de `src/routes/app/configuracoes.tsx`; resumo em `equipe-tab.tsx`.
