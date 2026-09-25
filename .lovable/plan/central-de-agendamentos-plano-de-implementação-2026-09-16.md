# Central de Agendamentos — plano de implementação

Vou reconstruir o módulo de Agendamentos seguindo as telas anexadas, usando o que já existe hoje (tabela `mensagem_agendada`, serviços, horários da equipe, lembretes no WhatsApp, Google Agenda) e ampliando o que falta. Nada de dados fictícios: tudo lê e grava no banco atual.

## Estrutura da tela

Um único módulo com quatro áreas no topo:

- **Visão geral** — cards Hoje / Próximo / Mensagens programadas / Atenção (clicáveis, já com filtro aplicado), lista de próximos compromissos, central de atenção (não confirmados, conflitos, falhas de envio, atrasados, integrações desconectadas) e mensagens programadas.
- **Agenda** — modos Dia, Semana, Mês e Lista.
- **Mensagens agendadas** — Fila, Calendário e Histórico, com cards Programadas / Enviadas hoje / Falhas / Canceladas e painel lateral da mensagem selecionada.
- **Configurações** — disponibilidade da equipe, tipos de agendamento, serviços e duração, mensagens automáticas, regras de conflito, feriados e bloqueios, integrações, permissões.

A área e o modo escolhidos ficam no endereço da página, então atualizar não perde a visualização. Botão "Criar agendamento" abre menu com Novo compromisso, Nova mensagem, Bloquear horário e Criar recorrência. Ao lado, "Configurar disponibilidade".

## Agenda

- **Dia**: mini calendário, linha do tempo com o horário atual, blocos proporcionais à duração, bloqueios e períodos indisponíveis apagados. Clicar em horário vazio abre o formulário já preenchido; arrastar move; esticar muda a duração; clicar abre o painel lateral.
- **Semana**: grade com horários fixos na rolagem, alternância Por dia / Por profissional, intervalos de 15, 30 ou 60 min, filtros de equipe e "Somente minha agenda".
- **Mês**: até três compromissos por dia, "+X compromissos", indicador de ocupação e painel lateral com o resumo do dia, mensagens e horários livres.
- **Lista**: tabela agrupada por data com seleção múltipla, busca, filtros combinados com chips removíveis, ordenação, paginação, exportação e ações em massa (reagendar, trocar responsável, cancelar).

## Painel lateral do compromisso

Dados completos (contato, telefone, empresa, serviço, responsável, modalidade, endereço/link, observações, tags, mensagens relacionadas, histórico) e ações: abrir contato, abrir conversa, confirmar, reagendar, editar, concluir, marcar falta, cancelar, excluir — com confirmação nas ações destrutivas.

## Compromissos, bloqueios e recorrência

Formulário em painel lateral largo com todos os campos pedidos, status (Agendado, Aguardando confirmação, Confirmado, Em atendimento, Concluído, Reagendado, Cancelado, Falta) e modalidades (Presencial, Ligação, Videoconferência, WhatsApp, Outro). Recorrência diária, semanal, mensal ou por dias da semana, com edição de uma ocorrência, desta em diante ou da série toda. Bloqueio de horário por profissional, equipe, período e motivo.

## Comunicação

Mensagem de confirmação, lembrete com antecedência, reagendamento, cancelamento e pós-atendimento, disparadas na criação, em horário específico, antes/depois do compromisso ou na mudança de status. Modelos com variáveis (nome, responsável, data, horário, serviço, empresa, endereço, link), com pré-visualização e validação.

## Conflitos e disponibilidade

Antes de salvar, o sistema verifica sobreposição do responsável, horário fora do expediente, bloqueio, limite de atendimentos e duração incompatível, explica o motivo e só deixa prosseguir quem tem permissão. Disponibilidade por pessoa: dias, horários, intervalo, duração padrão, folga entre compromissos, antecedência mínima e máxima, exceções por data e fuso.

## Permissões

Administrador (tudo), gestor (toda a equipe), membro (a própria agenda) e visualizador (somente leitura), validados também no servidor, não só na tela.

## Integrações

WhatsApp e Google Agenda já funcionam hoje e continuam. Outlook, Meet e Zoom entram como cartões com estado "Não conectado" e a indicação do que falta configurar — sem fingir sincronização.

## Detalhes técnicos

- Banco: novas tabelas `agenda_tipo`, `agenda_disponibilidade`, `agenda_bloqueio`, `agenda_recorrencia`, `agenda_participante` e `agenda_historico`, todas com `company_id`, GRANTs e RLS por empresa. `mensagem_agendada` ganha `tipo_id`, `recorrencia_id`, `fim_em`, `empresa_nome`, `observacoes_internas`, `tags`, `cancelado_em`, `concluido_em`, `template_id`, `canal` — colunas aditivas e opcionais, sem quebrar contas atuais.
- Server fns novos em `src/lib/agenda/*.functions.ts` (compromissos, disponibilidade, bloqueios, mensagens, visão geral, histórico), com `requireSupabaseAuth` e checagem de papel no handler.
- Tela em `src/routes/app/agendamentos.tsx` com abas por `search params`; componentes em `src/components/agenda/` (timeline-dia, grade-semana, calendario-mes, tabela-lista, painel-compromisso, painel-mensagem, formularios, configurações).
- Arrastar/redimensionar com listeners de ponteiro próprios (sem nova dependência), atualizando otimista e revalidando via React Query.
- Skeletons, estados vazios, erro de carregamento e confirmações em todas as ações destrutivas; layout responsivo com agenda diária e cards no celular.

## Ordem de entrega

1. Banco, RLS e permissões
2. CRUD de compromissos + painel de detalhes
3. Agenda Dia, Semana, Mês e Lista
4. Disponibilidade, bloqueios e regras de conflito
5. Mensagens agendadas
6. Visão geral e configurações
7. Responsividade, estados e refino visual

São muitas telas: vou entregar por etapas, validando cada uma antes de seguir para a próxima.
