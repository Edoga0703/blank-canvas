# Integração Meta: Graph, Webhooks e reconciliação

## Rotas

- `GET/POST /api/public/meta-webhook`: verificação e eventos de Messenger/Instagram; mensagens e comentários entram na mesma pipeline de atendimento.
- `GET/POST /api/public/meta-leads-webhook`: callback dedicado de Lead Ads. O `meta-webhook` também processa `leadgen` quando a Meta entrega esse campo no callback principal.
- `POST /api/public/hooks/meta-sync`: backup periódico. Requer `x-cron-secret: $CRON_SECRET` e aceita `?full=1` para sincronização inicial.

## Variáveis obrigatórias

```text
META_WEBHOOK_VERIFY_TOKEN=<segredo usado no painel da Meta>
META_APP_SECRET=<App Secret da Meta>
PUBLIC_APP_URL=https://seu-dominio.example
CRON_SECRET=<segredo para o job periódico>
```

`META_ALLOW_UNSIGNED_WEBHOOKS=true` existe somente para um ambiente de desenvolvimento isolado. Em produção deve ficar ausente ou como `false`.

Se `META_WEBHOOK_VERIFY_TOKEN` ou os App Secrets não estiverem no ambiente de execução, o callback procura de forma server-only a configuração `meta_channels_config` em `master_settings`. Os valores nunca são enviados na resposta nem para o navegador; são usados apenas para comparar o challenge e a assinatura HMAC.

## Operação

1. O OAuth salva o token da Página/conta em `whatsapp_instances.instance_token`.
2. O webhook valida `X-Hub-Signature-256`, registra o payload em `messaging_inbox_events` e deduplica reentregas.
3. Mensagens e comentários são normalizados para `whatsapp-webhook`; por isso continuam usando cards, pipeline, régua e motor de IA/Drael quando esse motor estiver configurado.
4. Entregas e leituras são gravadas em `message_status_events` e refletem o status local da mensagem (`enviado`, `recebido`, `visto`).
5. Reações atualizam `mensagens.reacao` pela mensagem original (`mid`) e não abrem uma nova resposta da IA.
6. O job periódico usa cursores em `messaging_inbox_events` e só avança o cursor quando o bloco terminou sem erros.

As chamadas de publicação, resposta de comentários, insights, anúncios e sincronização manual estão em `src/lib/meta-content.functions.ts` e mantêm os tokens somente no servidor.

## Painel operacional

A aba **Integrações → Meta** permite selecionar o canal conectado, executar a reconciliação, consultar publicações e comentários, responder comentários, publicar conteúdo e acompanhar contas/campanhas de anúncios. Alterações de status de campanha exigem confirmação na interface e continuam sujeitas às permissões `ads_read` ou `ads_management` aprovadas no App da Meta.
