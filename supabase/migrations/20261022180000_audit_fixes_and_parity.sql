-- Migration: 20261022180000_audit_fixes_and_parity.sql
-- Resolves schema parity, multi-agent constraints, created_at column, and provider checks.

-- 1. agent_config: add created_at if missing
ALTER TABLE public.agent_config ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

-- 2. agent_config: drop single-agent-per-type constraint to enable multi-agent support
DROP INDEX IF EXISTS public.agent_config_company_tipo_uk;

-- 3. agent_config: broaden tipo check to allow customizable and additional agent types
ALTER TABLE public.agent_config DROP CONSTRAINT IF EXISTS agent_config_tipo_check;
ALTER TABLE public.agent_config ADD CONSTRAINT agent_config_tipo_check 
  CHECK (tipo = ANY (ARRAY['qualificacao'::text, 'followup'::text, 'posvenda'::text, 'custom'::text, 'vendas'::text, 'suporte'::text]) OR length(tipo) > 0);

-- 4. agent_config: allow 'drael' provider in ai_provider check
ALTER TABLE public.agent_config DROP CONSTRAINT IF EXISTS agent_config_ai_provider_check;
ALTER TABLE public.agent_config ADD CONSTRAINT agent_config_ai_provider_check 
  CHECK (ai_provider = ANY (ARRAY['gemini'::text, 'openai'::text, 'anthropic'::text, 'drael'::text]));

-- 5. mensagens: expand autor check to accept system, automated, and dispatch authors safely
ALTER TABLE public.mensagens DROP CONSTRAINT IF EXISTS mensagens_autor_check;
ALTER TABLE public.mensagens ADD CONSTRAINT mensagens_autor_check 
  CHECK (autor = ANY (ARRAY['ia'::text, 'humano'::text, 'contato'::text, 'automacao'::text, 'sistema'::text, 'atendente'::text, 'telefone'::text, 'api'::text, 'agendamento'::text]));

-- 6. agendamento: ensure status column allows pendente / confirmado / cancelado
ALTER TABLE public.agendamento DROP CONSTRAINT IF EXISTS agendamento_status_check;
