-- Migración: Soporte para Analista de Leads CRM, Criterios de Etapa y Control de IA
-- Versión: 20261024170000_crm_lead_analyzer_and_stage_criteria.sql

-- 1. Agregar criterio_ia y bloqueada_para_ia a crm_stage
ALTER TABLE public.crm_stage 
ADD COLUMN IF NOT EXISTS criterio_ia TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS bloqueada_para_ia BOOLEAN DEFAULT FALSE;

-- 2. Agregar crm_master_prompt a crm_pipeline
ALTER TABLE public.crm_pipeline 
ADD COLUMN IF NOT EXISTS crm_master_prompt TEXT DEFAULT NULL;

-- 3. Agregar ultimo_analise_ia_em a crm_cards
ALTER TABLE public.crm_cards 
ADD COLUMN IF NOT EXISTS ultimo_analise_ia_em TIMESTAMPTZ DEFAULT NULL;

-- 4. Comentarios descriptivos
COMMENT ON COLUMN public.crm_stage.criterio_ia IS 'Descripción y criterios que la IA analiza para determinar si un lead pertenece a esta etapa.';
COMMENT ON COLUMN public.crm_stage.bloqueada_para_ia IS 'Si es true, la IA no puede mover leads automáticamente a esta etapa (requiere acción humana).';
COMMENT ON COLUMN public.crm_pipeline.crm_master_prompt IS 'Prompt maestro del Analista de Leads CRM específico para este embudo.';
COMMENT ON COLUMN public.crm_cards.ultimo_analise_ia_em IS 'Marca de tiempo del último análisis realizado por el Bot Analista de CRM.';
