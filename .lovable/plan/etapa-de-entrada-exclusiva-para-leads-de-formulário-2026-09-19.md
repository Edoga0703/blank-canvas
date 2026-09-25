# Etapa de entrada exclusiva para leads de formulário

## Situação atual (verificado)

Cada formulário já pode escolher o funil e a etapa de destino (no construtor de formulários, campos "Funil" e "Etapa"), e o cadastro do lead respeita essa escolha. O que não existe é:

- uma marcação visual da etapa como "Formulário" (hoje só existem Normal, Ganho e Perda);
- um destino padrão para leads que chegam por outros caminhos (integrações, webhooks de entrada, links de captura) — esses caem sempre na primeira etapa do funil.

## O que será feito

1. **Novo tipo de etapa: "Formulário"**
   - No menu da etapa no CRM, junto de "Marcar como Ganho / Perda", entra "📝 Marcar como Formulário".
   - A etapa passa a exibir a etiqueta "Formulário", como já acontece com Ganho e Perda.
   - Só uma etapa por funil pode ter essa marcação (mesma regra de Ganho/Perda).

2. **Entrada automática**
   - Todo lead que chegar por formulário (ou por integração/webhook, quando o envio não indicar etapa) vai para a etapa marcada como "Formulário" daquele funil.
   - Se o formulário tiver uma etapa escolhida manualmente, essa escolha continua valendo (tem prioridade).
   - Se nenhuma etapa estiver marcada, o comportamento de hoje continua igual: primeira etapa do funil.

3. **Automação exclusiva**
   - Como a etapa é normal em tudo o mais, toda a automação de etapa já existente (mensagem automática, agente de IA, distribuição, SLA) passa a valer só para quem entra pelo formulário.

## Detalhes técnicos

- Migração aditiva: coluna `crm_stage.entrada_formulario boolean not null default false` (não altera o enum `stage_tipo`, evitando quebra em código existente).
- `src/routes/app/crm.tsx`: `setStageTipo` ganha a ação de marcar/desmarcar `entrada_formulario`, limpando a marcação das outras etapas do mesmo funil; etiqueta no cabeçalho da coluna.
- `src/lib/lead-intake.server.ts`: na resolução de etapa, quando `input.stageId` é nulo e a origem é formulário/integração, procurar `crm_stage` com `entrada_formulario = true` no funil de entrada antes de cair na primeira etapa por ordem.
- `src/routes/api/public/form-submit.ts`, `lead-capture.ts` e webhooks de entrada continuam passando `stageId` quando o formulário define um — sem mudança de contrato.

## Compatibilidade

Nada muda para nenhum cliente enquanto ninguém marcar uma etapa como "Formulário". Nenhuma configuração existente é alterada.
