# Sevcon — painel por usuário, grupos, assinatura e atendimento individual

Cinco entregas. Tudo aplicado apenas à Sevcon, exceto onde indicado.

## 1. Painel com os números do próprio usuário

Hoje o painel mostra os números da empresa inteira para qualquer pessoa.

- Dono e admin continuam vendo os números da empresa.
- Atendente passa a ver os mesmos indicadores e gráficos, mas contando só os leads, vendas, conversas, agendamentos e satisfação em que ele é o responsável.
- Nenhum indicador é escondido: muda apenas o recorte dos números.

## 2. Grupos do WhatsApp

- Nova aba **Grupos** ao lado de "Minhas" na lista de conversas.
- Puxa os grupos da conexão do usuário direto do provedor (nome, foto, nº de participantes).
- Mensagens recebidas em grupo passam a ser guardadas e exibidas (hoje são descartadas), com identificação de quem enviou.
- Envio de texto, mídia e áudio para o grupo liberado.
- Grupos ficam visíveis para todos os usuários da Sevcon; grupos não entram no funil (não viram card de lead) e não acionam IA nem automações.

## 3. Assinatura do atendente

- Mensagens enviadas manualmente saem com o nome do atendente antes do texto (ex.: `*Marcos:*` + quebra de linha + mensagem).
- Ligado por padrão; cada usuário pode desativar nas preferências do próprio perfil.
- Não se aplica a mensagens da IA, campanhas, automações e lembretes.

## 4. Agenda e respostas rápidas individuais

- Atendente passa a ver e gerenciar apenas os compromissos e as respostas rápidas que ele criou.
- Dono e admin continuam vendo tudo, de todos.
- Conteúdo já existente sem autor definido fica visível para dono/admin e é atribuído a quem criou quando essa informação existir.

## 5. Encaminhar conversa com aceite

- Admin pode responder qualquer conversa, inclusive as de outro atendente.
- Ao encaminhar para um usuário, a conversa entra como **convite pendente** para ele: aparece em "Minhas" destacada, com botões **Assumir** e **Recusar**.
- Só depois de aceitar ele vira o responsável; se recusar, volta para quem encaminhou.
- Enquanto pendente, a conversa continua visível para o admin.

## Detalhes técnicos

- Banco: colunas novas (todas opcionais) — `profiles.assinatura_ativa`; `crm_cards.transfer_para_user_id` e `crm_cards.transfer_status`; `quick_reply.user_id` já existe e passa a ser usado no filtro; `agenda`/`agendamento` filtrados por criador. Tabela `mensagens` ganha `grupo_jid` e `remetente_nome` para grupos, mais tabela `whatsapp_grupo` com cache dos grupos por conexão.
- `src/lib/jid.ts` deixa de descartar `@g.us` quando a empresa tem grupos habilitados; webhooks (`uazapi-webhook`, `whatsapp-webhook`) passam a persistir mensagens de grupo sem criar card nem disparar IA.
- `src/lib/wa-dispatch.server.ts` deixa de bloquear destino de grupo em envio manual.
- Novo `src/lib/grupos.functions.ts` (listar/sincronizar grupos via Uazapi) e nova aba na lista de `src/routes/app/conversas.tsx`.
- Recorte do painel por usuário dentro de `getDashboardMetrics` (`src/lib/dashboard.functions.ts`), via papel do usuário na empresa.
- Assinatura aplicada no ponto único de envio manual, lendo a preferência do perfil.
- Flag de empresa para grupos e para o recorte individual, para não afetar outros clientes.
