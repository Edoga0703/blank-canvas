# Boas-vindas automática no WhatsApp ao criar conta

## O que muda para quem se cadastra

Na tela de criar conta passa a existir o campo **WhatsApp** (obrigatório, com máscara `(11) 91234-5678`).
Ordem dos campos: Nome → WhatsApp → E-mail → Senha → Confirmar senha.

Ao clicar em "Criar conta":
1. A conta é criada normalmente e o número fica salvo no perfil da pessoa.
2. O sistema dispara automaticamente uma mensagem de boas-vindas pelo WhatsApp da Metrix.
3. Se o número for inválido ou o envio falhar, o cadastro continua funcionando normalmente (o disparo é registrado como falho, nunca bloqueia o acesso).

## Painel Master (só você)

Nova seção "Boas-vindas no cadastro" em Configurações do Master:

- Liga/desliga o disparo automático.
- Escolhe **qual conexão de WhatsApp** envia a mensagem (lista das conexões conectadas).
- Edita o **texto da mensagem**, com variáveis `{nome}`, `{email}` e `{telefone}`.
- Botão "Enviar teste" para um número informado.
- Lista dos últimos disparos (nome, número, status, data) para conferir entregas.

## Detalhes técnicos

**Banco**
- `profiles.telefone` já existe: passa a ser preenchido no cadastro (via metadata do signup + trigger `handle_new_user`, com migração ajustando o trigger para ler `raw_user_meta_data->>'telefone'`).
- Nova tabela `signup_welcome_log` (id, user_id, email, nome, telefone, status, erro, created_at) com RLS: leitura/escrita só para `super_admin` e `service_role`.
- Configuração guardada em `master_settings` na chave `signup_welcome` (`{ enabled, company_id, mensagem }`).

**Servidor**
- Novo `src/lib/signup-welcome.functions.ts`:
  - `sendSignupWelcome` (pública, sem auth — chamada logo após o signup): valida o número com `parseBrPhone`, aplica rate limit simples por e-mail/número usando o log, resolve a instância pela `company_id` configurada via `getActiveInstance` e envia com `waSendText` de `wa-dispatch.server.ts` (com `assertSendableNumber`), gravando o resultado em `signup_welcome_log`.
  - `getSignupWelcomeConfig` / `saveSignupWelcomeConfig` / `testSignupWelcome` / `listSignupWelcomeLogs` — todas com `requireSupabaseAuth` + checagem de super admin.

**Front**
- `src/routes/entrar.tsx`: campo WhatsApp com máscara e validação `parseBrPhone`; envia `telefone` em `options.data` do `signUp`; depois do signup chama `sendSignupWelcome` sem travar o fluxo (`.catch(() => {})`).
- `src/routes/master/configuracoes.tsx`: novo card com o formulário de configuração, teste e histórico.

**Mensagem padrão**

> Olá {nome}! 👋 Aqui é a Metrix CRM. Sua conta foi criada com sucesso. Qualquer dúvida, é só responder por aqui que a gente te ajuda a começar.
