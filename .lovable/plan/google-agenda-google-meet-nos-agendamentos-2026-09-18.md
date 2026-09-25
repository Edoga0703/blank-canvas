# Google Agenda + Google Meet nos Agendamentos

## Situação atual

A ligação com o Google Agenda **já existe** no módulo Agendamentos: em Configurações o cliente conecta a conta Google, escolhe a agenda e, a partir daí, todo compromisso criado, editado ou excluído no Metrix aparece (e some) na agenda dele automaticamente.

O que falta é o **Google Meet**: hoje o campo "Link da reunião" é digitado à mão.

## O que será feito

1. **Botão "Gerar link do Meet"** ao lado do campo Link da reunião, no formulário de compromisso.
   - Ao clicar, o Metrix cria o evento na agenda do cliente já com uma sala do Meet e traz o link pronto para o campo.
   - Se o compromisso ainda não foi salvo, o link é gerado no momento de salvar.
2. **Link também vai para o WhatsApp**: o link do Meet entra no lembrete enviado ao contato, como já acontece com o link digitado.
3. **Aviso claro quando não houver conexão**: se a conta Google não estiver conectada, o botão explica que é preciso conectar em Agendamentos → Configurações.
4. **Excluir/alterar o compromisso** continua atualizando o evento e o Meet na agenda do Google.

## Detalhes técnicos

- Reautorização necessária: o escopo atual é `calendar.events`, suficiente para criar `conferenceData`; a criação do Meet usa `conferenceDataVersion=1` com `createRequest: { requestId, conferenceSolutionKey: { type: "hangoutsMeet" } }` em `buildEventBody`/`upsertCalendarEvent` (src/lib/google.server.ts).
- Nova função de servidor `gerarLinkMeet` em `src/lib/agenda.functions.ts` (ou `google.functions.ts`): cria/atualiza o evento com conferência e devolve `hangoutLink`, gravando em `mensagem_agendada.link_reuniao`, `google_event_id`, `google_calendar_id`.
- `appointment-form.tsx`: botão ao lado do input `ag-link`, estado de carregando, preenchimento automático do campo.
- O Google Meet não precisa de API separada — vem junto com a Calendar API que já está ativada.

## Limites honestos

- A sala do Meet pertence à conta Google conectada (uma conta por empresa, a mesma da sincronização atual).
- Contas Google gratuitas criam salas do Meet normalmente; limites de duração são do próprio Google.
