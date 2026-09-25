ALTER TABLE public.olist_integration ADD COLUMN IF NOT EXISTS auto_pedido BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.crm_venda ADD COLUMN IF NOT EXISTS olist_pedido_id TEXT;
ALTER TABLE public.crm_venda ADD COLUMN IF NOT EXISTS olist_situacao TEXT;
ALTER TABLE public.produto ADD COLUMN IF NOT EXISTS olist_id TEXT;
CREATE INDEX IF NOT EXISTS idx_crm_venda_olist_pedido ON public.crm_venda (company_id, olist_pedido_id);
CREATE INDEX IF NOT EXISTS idx_produto_olist_id ON public.produto (company_id, olist_id);