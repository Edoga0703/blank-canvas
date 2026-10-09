# Integrações por chave: 19 plugins prontos para uso

Objetivo: o cliente instala o plugin, cola a chave (ou URL, no caso de Slack/Teams/Zapier/Make/n8n) e já usa — sem nada pendente do nosso lado.

## Como vou construir

Em vez de 19 integrações soltas, crio uma **base única de integrações por chave** (mesmo padrão já usado na Olist) e ligo cada serviço nela. Isso garante comportamento igual em todos: conectar, testar a chave, desconectar, ver último resultado.

### Base comum
- Uma tabela de conexões por empresa guardando serviço, chave (ou URL), estado e data da última sincronização.
- Um painel padrão no card do plugin: campo da chave + instruções de onde obtê-la + botões Conectar / Testar / Desconectar + os botões de ação daquele serviço.
- Bloqueio por plugin: só funciona para quem instalou.

### O que cada grupo faz de fato

**Avisos para a equipe (cola a URL do canal)** — Slack, Microsoft Teams, Zapier, Make, n8n
Envia aviso automático em: lead novo, venda ganha, lead perdido e pesquisa respondida. Botão "Enviar teste".

**ERPs e financeiro (cola o token)** — Bling, Omie, Conta Azul, Asaas, Mercado Pago, Stripe, Pix (Asaas/Mercado Pago)
- Importar clientes como leads no funil.
- Registrar a venda no sistema externo quando a venda é marcada como ganha (chave liga/desliga).
- Consultar situação de cobrança/pagamento do contato na aba do card.

**E-commerce (cola o token)** — Nuvemshop, Yampi, WooCommerce
- Importar clientes como leads.
- Importar pedidos como vendas no Comercial.
- Aba "Pedidos" no card do contato, com status.

**Marketing (cola a chave)** — RD Station, Mailchimp
- Enviar contatos do funil para a lista/base do serviço.
- Trazer leads capturados de lá para o funil.

**Produtividade (cola o token)** — Notion, Trello
- Criar item/cartão a partir de um lead, com nome, telefone e etapa.
- Enviar automaticamente quando o lead entra numa etapa escolhida.

## Ajustes na loja (junto)
- Shopify: removido.
- Meta Ads: fica "em desenvolvimento".
- Google Ads e Google Analytics: ficam como próximos da fila (médios), sem implementar agora.
- Todos os 19 passam para "ativo" só depois de testados.

## Ordem de entrega
1. Base comum + painel padrão.
2. Avisos de equipe (5 serviços) — mais rápidos.
3. ERPs e financeiro (7).
4. E-commerce (3).
5. Marketing (2) e produtividade (2).

Ao final, explico como funcionaria Outlook Calendar e Zoom.

## Detalhes técnicos
- Tabela `integracao_chave` (company_id, servico, credencial, extra jsonb, conectado, ultima_sync, ultimo_resultado) com RLS por empresa e UNIQUE(company_id, servico).
- `src/lib/integracoes/*.server.ts`: um adaptador por serviço com `validar`, `importarClientes`, `criarPedido`, `notificar`, conforme o caso; chamadas HTTP diretas via fetch (todas as APIs são REST e aceitam token).
- `src/lib/integracoes.functions.ts`: server functions genéricas (`statusIntegracao`, `conectarIntegracao`, `desconectarIntegracao`, `executarAcaoIntegracao`) com gate `capacidadeAtiva(slug)`.
- `src/components/plugins/integracao-panel.tsx`: painel genérico configurado por um mapa de metadados (rótulo da chave, link de ajuda, ações disponíveis).
- Registro dos slugs em `PAINEIS` no `plugin-detail-dialog.tsx`.
- Gatilhos reaproveitam `emitWebhook` e o ponto de venda ganha já existente em `comercial.functions.ts`.
- Chaves guardadas com a mesma criptografia já usada em `connectionKeyCrypto.ts`.
