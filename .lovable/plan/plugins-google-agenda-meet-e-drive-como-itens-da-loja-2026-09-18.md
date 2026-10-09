# Plugins Google: Agenda, Meet e Drive como itens da Loja

## O problema hoje

- A conexão da conta Google existe, mas está escondida: só aparece dentro da Loja de Plugins, ao abrir o card "Google Calendar" já instalado. Em Agendamentos → Configurações não há nada.
- O Google Drive aparece no card do lead para qualquer empresa, sem passar pela Loja.
- Google Drive e Google Meet estão marcados como "Em breve" na Loja, mesmo já funcionando.

## O que será feito

### 1. Três plugins reais na Loja

- **Google Calendar** — sincroniza compromissos com a agenda do cliente.
- **Google Meet** — gera link de reunião nos compromissos.
- **Google Drive** — pasta de arquivos por contato no card do lead.

Os três saem de "Em breve" e ganham descrição, capa e o passo de conexão.

### 2. Conectar a conta dentro do próprio plugin

Ao instalar, o card do plugin mostra o botão de conectar a conta Google e o estado (conectado, e-mail, agenda escolhida, desconectar).

- Calendar e Meet usam a mesma conta da empresa: conectou em um, o outro já aparece conectado (o Meet apenas confere e avisa se faltar).
- Drive é por usuário: cada atendente conecta a própria conta no card do plugin.

### 3. Atalho onde a pessoa realmente procura

Em **Agendamentos → Configurações** entra um bloco "Google Agenda": se o plugin não estiver instalado, convida para a Loja; se estiver, mostra conectar/desconectar e escolher a agenda — o mesmo painel do card do plugin.

### 4. Recursos só aparecem com o plugin instalado

- Botão **Meet** no formulário de compromisso: aparece só com o plugin Google Meet instalado.
- Aba **Drive** na Mídia do lead: aparece só com o plugin Google Drive instalado.
- Sincronização com a agenda: ativa só com o plugin Google Calendar instalado.

Quem não instalou vê um aviso curto com link para a Loja, em vez do recurso quebrado.

## Detalhes técnicos

- Atualizar as linhas de `plugin` (`google-drive`, `google-meet`) para `status = 'ativo'` com textos/capa; `google-calendar` já está ativo.
- `plugin-detail-dialog.tsx`: trocar o `if (slug === "google-calendar")` por um mapa slug → painel de configuração (`GoogleCalendarPanel`, novo `GoogleMeetPanel`, novo `GoogleDrivePanel` reaproveitando o fluxo OAuth de `drive-panel.tsx`).
- Gate client: `useCapacidadeAtiva("google-meet")` no `appointment-form.tsx` e `useCapacidadeAtiva("google-drive")` no `conversation-media-panel.tsx`.
- Gate servidor: `requireCapacidade(supabase, companyId, slug)` em `gerarLinkMeet`, nas funções de `drive.functions.ts` e no upsert/delete de evento do Google em `agenda.functions.ts` — sem bloquear empresas que já usam a agenda hoje (checar antes de ativar o gate no Calendar).
- `settings-area.tsx` (Agendamentos → Configurações): novo bloco renderizando `GoogleCalendarPanel` atrás do gate de capacidade.

## Limites honestos

- Uma conta Google por empresa para Agenda/Meet (como já é hoje); o Drive continua por usuário.
- O consentimento do Google segue mostrando o aviso de app não verificado até a análise do Google concluir.
