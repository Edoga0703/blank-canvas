# Plano: API Única e Fixa para Todos os Usuários

Ajustar a lógica de IA para que todas as empresas utilizem uma única configuração de API (provedor e chaves) definida no painel Master, removendo a necessidade ou possibilidade de configuração individual por cliente.

## Alterações Sugeridas

### 1. Banco de Dados (Supabase)
- Adicionar colunas de chaves de API (`openai_api_key`, `anthropic_api_key`, etc.) e configuração de modelo padrão na tabela `system_settings` (ou similar) acessível apenas pelo Master.
- Opcionalmente, manter as colunas em `agent_config` mas ignorá-las na execução, ou criar uma política que as torne nulas para usuários comuns.

### 2. Painel Master (`src/routes/master/sistema.tsx`)
- Adicionar uma nova seção "Configuração de IA Global".
- Permitir que o Super Admin defina:
  - Provedor padrão (Gemini, OpenAI, Anthropic).
  - Chaves de API correspondentes.
  - Modelo padrão para cada provedor.
  - Estas chaves serão armazenadas nos segredos do sistema ou em uma tabela de configuração global.

### 3. Motor de IA (`src/lib/lovable-ai.server.ts` e `src/lib/ai-engine.server.ts`)
- Alterar `lovableAiChat` para buscar as chaves do ambiente (process.env) ou da configuração global do sistema, em vez de recebê-las da configuração individual da empresa (`cfg.openai_api_key`).
- No `ai-engine.server.ts`, remover a extração das chaves da empresa e passar apenas os parâmetros de comportamento (prompt, histórico).

### 4. Interface do Usuário (`src/routes/app/agente.avancado.tsx`)
- Remover os campos de "Chave de API" e "Provedor" da visão do cliente.
- Manter apenas as configurações de *comportamento* (nome do agente, tom, regras, produtos).
- Informar ao usuário que a inteligência é provida nativamente pela plataforma.

## Detalhes Técnicos
- As chaves configuradas no Master serão injetadas via `process.env` ou recuperadas via `supabaseAdmin` no momento da execução das Server Functions.
- Priorizaremos o uso de segredos do ambiente (`secrets--add_secret`) para as chaves globais por segurança.

---
**Observação:** Como o usuário deseja uma "API fixa e todos usarem a mesma", centralizaremos o controle no Master e no ambiente do servidor.
