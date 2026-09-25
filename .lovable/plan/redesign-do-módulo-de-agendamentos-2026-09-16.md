# Redesign do módulo de Agendamentos

Objetivo: transformar a tela de Agendamentos numa agenda de verdade — boa para clínicas (RB Clinic) e útil para todos os segmentos — sem quebrar nada de quem já usa hoje.

## O que muda na tela

1. **Um botão só: "Novo agendamento"**. Dentro dele, o padrão é compromisso; quem quiser só programar uma mensagem escolhe isso numa opção dentro da própria janela. Os dois botões separados somem.
2. **Botão Plugins removido** do cabeçalho.
3. **Calendário como visão principal**, com Dia / Semana / Mês e lista lateral do dia. Semana em grade de horários (colunas = dias, linhas = horários), com os compromissos coloridos pelo serviço. Blocos fora do horário de atendimento aparecem apagados.
4. **Cabeçalho com resumo do dia**: quantos atendimentos, próximo horário, quantos confirmados e horários livres.
5. **Filtros** por profissional e por serviço.

## Agenda por profissional

- Cada usuário da equipe passa a ter seus próprios dias e horários de atendimento (e intervalo de almoço), configurados em Configurações → Equipe. Quem não configurar herda o horário da empresa — nada muda para os clientes atuais.
- Ao criar um agendamento escolhe-se o **profissional**; o sistema mostra só os **horários livres** dele naquele dia, já descontando duração do serviço, compromissos existentes, intervalo e a Google Agenda conectada (já existe essa checagem).
- Conflito continua bloqueado, mas agora por profissional, não pela empresa inteira.

## Seleção por horário livre

No lugar de digitar data e hora, o fluxo passa a ser: serviço → profissional → dia → **clicar num horário livre**. Digitar manualmente continua possível para casos fora do padrão.

## Ligação com o CRM e o WhatsApp

- Ao agendar a partir de um lead, o compromisso continua vinculado ao card; a criação e a mudança de horário viram evento na jornada do lead.
- Lembrete por WhatsApp continua como hoje (minutos antes, configurável), incluindo o texto gerado pela IA.
- Status do compromisso ganha "compareceu" e "faltou", marcáveis em um clique no calendário, para a clínica medir ausências.

## Detalhes técnicos

- Novos campos em `mensagem_agendada`: `profissional_id` (uuid, referência a `auth.users` via `company_user`), preenchido opcionalmente — nulo = agenda da empresa.
- Novo campo em `company_user`: `horarios` (jsonb, mesmo formato de `BusinessHours` em `src/lib/business-hours.ts`), nulo por padrão.
- Novo server fn `listSlotsDisponiveis` em `src/lib/agendamentos.functions.ts`: recebe dia, serviço e profissional, monta a grade a partir dos horários (do profissional, com fallback para `agent_config.horarios_atendimento`), remove compromissos existentes e ocupados do Google (`getFreeBusy` em `google.server.ts`).
- `saveAgendamento` passa a validar conflito por `profissional_id` quando informado.
- `src/routes/app/agendamentos.tsx` reescrito: cabeçalho com métricas, `Tabs` Dia/Semana/Mês, grade de horários, diálogo único com passo serviço → profissional → horário, filtros.
- Migração adiciona colunas com default nulo; contas existentes seguem com o comportamento atual.

## Fora deste escopo

Link público de auto-agendamento, confirmação automática com resposta Sim/Não e controle de no-show automático — ficam para uma segunda etapa.
