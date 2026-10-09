# Trazer todas as respostas do formulário para dentro do card do lead

Hoje o formulário já salva todas as respostas (inclusive os campos extras que você cria), mas o card do lead só mostra nome, WhatsApp, e-mail, CPF/CNPJ, empresa e endereço. O resto fica guardado e invisível.

## Melhor alternativa

Criar um bloco **"Respostas do formulário"** dentro do card do lead, que lista automaticamente todos os campos preenchidos — sem precisar criar um campo fixo no CRM para cada pergunta nova.

Funciona assim:

1. Ao enviar o formulário, além de guardar o envio, as respostas também são copiadas para o próprio card do lead (num espaço livre de "informações extras").
2. No card do lead, aparece uma seção nova mostrando pergunta e resposta, na mesma ordem do formulário, com data e nome do formulário de origem.
3. Campos que correspondem a dados oficiais (nome, WhatsApp, e-mail, CPF/CNPJ, empresa, endereço) continuam indo para os campos fixos de sempre — sem duplicar.
4. Se a pessoa enviar o formulário de novo, as respostas novas são acrescentadas (o histórico anterior não se perde).
5. O mesmo espaço serve para leads que chegam por integração (Make/Zapier, webhooks), então qualquer informação extra enviada por eles também passa a aparecer.

## Extras incluídos

- Botão de copiar em cada resposta.
- Possibilidade de editar/apagar uma informação extra manualmente no card.
- As respostas entram também na exportação de contatos.

## Detalhes técnicos

- Migração aditiva: nova coluna `crm_cards.campos_extras` (jsonb, default `{}`) + GRANTs já existentes na tabela.
- `src/lib/lead-intake.server.ts`: aceitar `camposExtras` e gravar no card (merge, nunca sobrescrever chaves oficiais).
- `src/routes/api/public/form-submit.ts`: montar `{ label, valor, campo_id }` a partir das definições do formulário e passar ao intake, mantendo o registro em `lead_form_submission` como está.
- `src/routes/api/public/lead-capture.ts` e webhooks de entrada: enviar campos não reconhecidos para `campos_extras`.
- `src/components/crm/lead-drawer.tsx`: nova seção "Respostas do formulário / Informações extras" (lista, copiar, editar, remover), abaixo dos dados de contato.
- Retrocompatível: leads antigos ficam sem a seção; nenhuma configuração de cliente é alterada.

## Validação

- Typecheck e build.
- Envio de teste num formulário existente e conferência do card gerado.
