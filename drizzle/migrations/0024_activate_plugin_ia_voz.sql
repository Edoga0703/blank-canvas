UPDATE public.plugin
SET status = 'ativo',
    descricao = 'Transcreve os áudios do WhatsApp em texto com IA: todo áudio da conversa ganha o botão Transcrever.',
    categoria = 'ia',
    capacidade_slug = 'ia-voz',
    gratuito = true,
    visivel_para_clientes = true
WHERE slug = 'ia-voz';