# Uso operacional entre setores (adaptação, sem mudar o que existe)

Objetivo: permitir que empresas com vários departamentos (contabilidade, clínicas, assistências, agências) usem o sistema para atendimento operacional, apenas ativando configurações. Nada é removido, renomeado ou substituído para quem usa hoje de forma comercial.

## O que já existe e será reaproveitado
- Vários usuários com papéis (dono, admin, atendente) e funções personalizadas.
- Departamentos cadastrados e usuários vinculados a departamentos.
- Usuário vinculado a conexões de WhatsApp específicas.
- Filas de distribuição com rodízio automático de responsável.
- Funis Comercial, Follow-up e Pós-venda + funis personalizados com etapas livres.

## O que muda

### 1. Caixa de entrada por setor
- Cada conversa passa a poder ter um setor (Fiscal, Contábil, Pessoal, Suporte, o que a empresa criar).
- Filtro de setor na tela de Conversas, com contador de não lidas por setor.
- Atendente vê por padrão só os setores dele; dono e admin veem tudo. Quem não usa setores continua vendo a tela exatamente como hoje.
- Botão "Transferir para setor": muda o setor da conversa e escolhe o próximo responsável pela fila daquele setor.
- Cada transferência fica registrada no histórico do contato.

### 2. Flexibilizar os funis que já existem
Hoje os três funis padrão não podem ser renomeados nem ocultados, e funis personalizados não têm automação. Isso trava quem não vende.
- Permitir renomear os funis padrão (ex.: "Comercial" vira "Solicitações").
- Permitir ocultar um funil que a empresa não usa (some da navegação, sem apagar dados; pode ser reexibido).
- Liberar as mesmas automações de tempo, IA por etapa e distribuição também nos funis personalizados.
- Nada disso altera empresas atuais: os nomes e a visibilidade continuam como estão.

### 3. Prazo por etapa (opcional)
- Cada etapa pode receber um prazo em horas. Se ficar vazio, tudo funciona como hoje.
- Card mostra selo discreto: no prazo, atenção ou atrasado.
- Filtro "só atrasados" no quadro, por setor e por responsável.

### 4. Setor no card
- O card do quadro pode ter um setor, exibido como etiqueta pequena.
- Ao mover para uma etapa ligada a um setor, o responsável sai da fila daquele setor.

## Fora do escopo (retirado a pedido)
- Novo tipo de funil exclusivo de atendimento.
- Rotinas mensais recorrentes.
- Troca de vocabulário (lead, oportunidade, venda continuam iguais para todos).

## Detalhes técnicos
- Banco: `department_id` opcional em `crm_cards` e na conversa/contato; `sla_horas` (int, nulo) em `crm_stage`; `oculto` (bool) em `crm_pipeline`; `department_id` opcional em `crm_distribution_queues`. Todos os campos opcionais, com default que preserva o comportamento atual.
- Remover a trava de renomear funil `sistema` mantendo a trava de exclusão (evita quebrar automações que dependem do `tipo`).
- Liberar automação em funis personalizados: em `crm.tsx`, `allowAutomacao` deixa de exigir `pipeline.sistema`; o motor `kanban-engine.server.ts` já opera por etapa, então passa a considerar também etapas de funis personalizados.
- UI: filtro/transferência de setor em `src/routes/app/conversas.tsx`; selo de prazo e filtro de atrasados em `src/routes/app/crm.tsx`; campos de prazo e setor no editor de etapa; opção de ocultar/renomear funil no menu do funil.
- Sem migração de dados e sem mudança de comportamento para quem não preencher os novos campos.

## Ordem de execução
1. Setor nas conversas + filtro + transferência por fila.
2. Renomear/ocultar funis e liberar automação nos personalizados.
3. Prazo por etapa e selos de atraso.
4. Setor no card e distribuição por setor.
