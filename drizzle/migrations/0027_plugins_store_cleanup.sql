-- Remover plugins sem uso e sem plano de implementação
DELETE FROM public.plugin WHERE slug IN ('email-inbox','webchat','sms','ia-base-conhecimento','tiny-erp');

-- WhatsApp Evolution: oculto da loja (segue funcionando para quem já usa)
UPDATE public.plugin SET visivel_para_clientes = false WHERE slug = 'whatsapp-evolution';

-- API Oficial Meta: preço do catálogo de adicionais (R$ 149/mês)
UPDATE public.plugin SET gratuito = false, preco_mensal = 149.00,
  checkout_url = 'https://pay.kiwify.com.br/Ufl4fRu'
WHERE slug = 'meta-official-api';

-- Instagram e Facebook ainda não implementados
UPDATE public.plugin SET status = 'em_breve' WHERE slug IN ('instagram','messenger');

-- Logos que não carregavam
UPDATE public.plugin SET icone = 'https://www.google.com/s2/favicons?domain=linkedin.com&sz=128' WHERE slug = 'linkedin';
UPDATE public.plugin SET icone = 'https://www.google.com/s2/favicons?domain=bling.com.br&sz=128' WHERE slug = 'bling';
UPDATE public.plugin SET icone = 'https://www.google.com/s2/favicons?domain=omie.com.br&sz=128' WHERE slug = 'omie';
UPDATE public.plugin SET icone = 'https://www.google.com/s2/favicons?domain=contaazul.com&sz=128' WHERE slug = 'conta-azul';
UPDATE public.plugin SET icone = 'https://www.google.com/s2/favicons?domain=rdstation.com&sz=128' WHERE slug = 'rd-station';
UPDATE public.plugin SET icone = 'https://www.google.com/s2/favicons?domain=asaas.com&sz=128' WHERE slug = 'asaas';
UPDATE public.plugin SET icone = 'https://www.google.com/s2/favicons?domain=yampi.com.br&sz=128' WHERE slug = 'yampi';
UPDATE public.plugin SET icone = 'https://www.google.com/s2/favicons?domain=nuvemshop.com.br&sz=128' WHERE slug = 'nuvemshop';
UPDATE public.plugin SET icone = 'https://www.google.com/s2/favicons?domain=slack.com&sz=128' WHERE slug = 'slack';
UPDATE public.plugin SET icone = 'https://www.google.com/s2/favicons?domain=teams.microsoft.com&sz=128' WHERE slug = 'microsoft-teams';
UPDATE public.plugin SET icone = 'https://www.google.com/s2/favicons?domain=outlook.com&sz=128' WHERE slug = 'outlook-calendar';
UPDATE public.plugin SET icone = 'https://www.google.com/s2/favicons?domain=olist.com&sz=128', nome = 'Olist ERP (Tiny)' WHERE slug = 'olist';
UPDATE public.plugin SET icone = 'https://api.iconify.design/lucide/webhook.svg?color=%230B22FE' WHERE slug IN ('webhooks-out','webhooks-entrada');
