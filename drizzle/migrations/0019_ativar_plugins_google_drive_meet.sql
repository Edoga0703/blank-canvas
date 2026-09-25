UPDATE public.plugin
SET status = 'ativo',
    descricao = 'Organize os arquivos de cada contato na conta de Google Drive da sua equipe.',
    descricao_longa = 'Conecte sua conta do Google Drive e tenha, dentro do detalhe de cada lead, uma pasta exclusiva daquele contato.

Envie arquivos, crie pastas, renomeie, exclua, visualize a prévia e mande o arquivo direto na conversa do WhatsApp.

Os arquivos ficam no Drive da sua conta — não ocupam espaço do Metrix. Cada pessoa da equipe conecta a própria conta uma única vez.',
    tagline = 'Arquivos do contato direto no seu Drive'
WHERE slug = 'google-drive';

UPDATE public.plugin
SET status = 'ativo',
    descricao = 'Crie salas do Google Meet nos compromissos da agenda com um clique.',
    descricao_longa = 'Ao montar um compromisso, o botão Meet cria a sala de reunião na conta Google conectada e preenche o link automaticamente.

O link também entra no lembrete enviado ao cliente pelo WhatsApp e fica gravado no evento da agenda.

Usa a mesma conta Google do plugin Google Calendar.',
    tagline = 'Link de reunião automático nos compromissos'
WHERE slug = 'google-meet';

UPDATE public.plugin
SET descricao = 'Sincronize os compromissos do Metrix com a agenda do Google da sua empresa.',
    tagline = 'Sua agenda do Google sempre em dia'
WHERE slug = 'google-calendar';