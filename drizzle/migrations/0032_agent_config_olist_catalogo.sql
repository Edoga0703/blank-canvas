ALTER TABLE public.agent_config
  ADD COLUMN IF NOT EXISTS olist_catalogo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS olist_pedido_auto boolean NOT NULL DEFAULT false;