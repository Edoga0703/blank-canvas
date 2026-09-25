# Plugin Google Agenda — integração real no sistema

## Objetivo
Transformar o plugin Google Agenda em algo que o cliente conecta uma vez e passa a ver e criar compromissos direto do CRM (Agendamentos, CRM/Lead e Agente IA), sem sair da plataforma.

## O que já existe
- OAuth Google por empresa (conectar/desconectar, escolher agenda, evento de teste).
- Tabela `google_integration` com tokens + `calendar_id` e refresh automático.
- Criação de evento no Google ao salvar agendamento.

## O que falta para ser uma integração de verdade

### 1. Sincronia nos dois sentidos
- Hoje: CRM -> Google (só criação).
- Adicionar: editar e cancelar no CRM refletem no Google (update/delete do evento).
- Adicionar: Google -> CRM via canal de notificação (watch) do Google Calendar batendo em `/api/public/hooks/google-calendar`, atualizando/removendo o agendamento local.
- Renovação automática do canal (expira em ~7 dias) no cron já existente.

### 2. Disponibilidade real (free/busy)
- Consultar `freeBusy` antes de oferecer horários, respeitando os horários comerciais já cadastrados.
- Evita marcar em cima de compromissos pessoais do dono da agenda.

### 3. Agendamento pelo Agente IA
- Nova ferramenta do agente: "ver horários livres" e "marcar horário".
- Fluxo no WhatsApp: cliente pede horário -> IA lista 3 opções livres -> confirma -> evento criado no Google + card no CRM.

### 4. Onde aparece no sistema
- Módulo Agendamentos: selo "sincronizado com Google" e botão abrir no Google.
- Lead/Card do CRM: botão "Agendar" usando a agenda conectada.
- Conexões/Plugins: status do plugin (conectado, agenda escolhida, última sincronização).

### 5. Lembretes
- Lembrete automático por WhatsApp X horas antes (usa o motor de disparo já existente), configurável no plugin.

### 6. Robustez
- Fila de retry quando o Google retorna erro/limite.
- Marcar plugin como "reconectar" quando o refresh token for revogado, com aviso no painel.

## Detalhes técnicos
- Novos campos em `agendamento`: `google_calendar_id`, `sincronizado_em`, `origem` (crm|google|ia).
- Novos campos em `google_integration`: `channel_id`, `resource_id`, `channel_expira_em`, `sync_token`.
- Server fns em `src/lib/google.functions.ts`: `listFreeBusy`, `updateCalendarEvent`, `deleteCalendarEvent`, `startCalendarWatch`.
- Rota pública `src/routes/api/public/hooks/google-calendar.ts` validando `X-Goog-Channel-Token`.
- Gate por capacidade `google-calendar` em todas as chamadas (padrão `requireCapacidade`).

## Ordem sugerida
1. Sincronia bidirecional (editar/cancelar + webhook).
2. Free/busy + botão Agendar no lead.
3. Agente IA marcando horários.
4. Lembretes e robustez.
