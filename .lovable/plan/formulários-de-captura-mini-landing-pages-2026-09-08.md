# Formulários de Captura (mini landing pages)

Novo submódulo em Configurações onde cada cliente cria formulários públicos, personaliza o visual e recebe os leads direto no CRM.

## O que o cliente vai poder fazer

1. **Criar formulários** com nome interno e link público em `metrixcrm.com.br/f/apelido-do-form` (apelido editável e único).
2. **Montar os campos livremente**: texto, e-mail, telefone/WhatsApp, número, data, lista de opções, múltipla escolha, texto longo, aceite (checkbox). Cada campo tem rótulo, dica, obrigatório ou não. Nome e WhatsApp entram por padrão (WhatsApp obrigatório, porque é a chave do lead).
3. **Personalizar como mini landing page**: logo, cor principal, cor de fundo ou imagem de fundo, título, subtítulo, lista de benefícios (bullets), texto do botão, cantos arredondados, tema claro/escuro, layout (centralizado ou dividido em duas colunas com imagem), rodapé com aviso de privacidade.
4. **Definir o destino do lead**: funil e etapa exatos, responsável (fixo ou pela fila de distribuição existente), tags automáticas e valor padrão da oportunidade.
5. **Ação após o envio**: mensagem de agradecimento na própria página ou redirecionamento para uma URL; opcionalmente disparar uma mensagem automática no WhatsApp para o lead assim que ele envia (usando a conexão ativa da empresa, com modelo de texto editável).
6. **Acompanhar resultados**: visualizações, envios, taxa de conversão e lista dos últimos envios, com botão de pré-visualizar, copiar link e QR Code.

## Como o lead entra no CRM

Igual ao caminho já existente de captura: telefone normalizado (DDI 55), UTMs/gclid/fbclid/referrer capturados da URL do formulário, lead criado ou atualizado no funil/etapa escolhidos, respondendo à fila de distribuição, sem duplicar card quando o número já existe. Os campos extras do formulário ficam guardados e aparecem no detalhe do lead.

## Segurança e proteção do que já existe

- O envio público passa por um endpoint próprio, com limite de envios por IP, campo-armadilha anti-robô, validação rígida dos dados e limites de tamanho.
- Nenhuma alteração nos módulos atuais de captura, webhooks, Kanban ou automação: o novo fluxo reaproveita as funções existentes sem reescrevê-las.
- Novas tabelas isoladas com regras de acesso por empresa; a página pública só lê o necessário para exibir o formulário (nunca dados de leads).

## Detalhes técnicos

Banco (migração nova, com GRANTs e RLS por empresa):
- `lead_form`: `id`, `company_id`, `slug` (único), `nome`, `ativo`, `pipeline_id`, `stage_id`, `owner_mode` (fixo/fila), `owner_id`, `distribution_queue_id`, `tags[]`, `valor_padrao`, `pos_envio` (mensagem/redirect), `redirect_url`, `mensagem_sucesso`, `wa_auto_enviar`, `wa_mensagem`, `theme` (jsonb: cores, logo, fundo, layout, textos, bullets), `campos` (jsonb com a definição dos campos), `views`, `submits`, timestamps.
- `lead_form_submission`: `id`, `form_id`, `company_id`, `crm_card_id`, `dados` (jsonb), `tracking` (jsonb), `ip_hash`, `created_at`.

Rotas:
- `src/routes/f.$slug.tsx` — página pública SSR do formulário (loader lê o form por slug via função pública com chave publicável; head com título/descrição próprios).
- `src/routes/api/public/form-submit.ts` — recebimento do envio: valida, anti-spam, cria/atualiza o card reutilizando a lógica de `lead-capture.ts` extraída para um helper compartilhado (`src/lib/lead-intake.server.ts`) para não duplicar regras.
- Reaproveita `wa-dispatch.server.ts` para a mensagem automática opcional.

Admin:
- `src/components/config/formularios-tab.tsx` (lista + métricas) e `src/components/config/form-builder-dialog.tsx` (construtor com abas Campos / Aparência / Destino / Pós-envio e pré-visualização ao vivo).
- Nova aba "Formulários" em `src/routes/app/configuracoes.tsx`.
- `src/lib/lead-forms.functions.ts` com as funções autenticadas de listar, criar, salvar, duplicar, ativar/desativar e excluir.

## Entrega em duas etapas

1. Banco, construtor, página pública, envio e entrada no CRM.
2. Métricas, QR Code, duplicação de formulário e disparo automático no WhatsApp.
