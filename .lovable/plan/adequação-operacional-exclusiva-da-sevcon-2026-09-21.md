# Adequação operacional exclusiva da Sevcon

Todas as mudanças abaixo serão ativadas somente na conta da Sevcon. Os demais clientes manterão a experiência comercial atual.

## Conversas e detalhes

- Aumentar a largura inicial da lista de conversas para acomodar “Todas”, “Não lidas”, “Minhas” e “Grupos” sem quebra.
- Reduzir a largura do painel lateral de detalhes.
- Ocultar, somente na Sevcon, o valor da oportunidade e o controle “IA na etapa”.
- Adicionar filtro por atendente para Catarina/admin acompanhar a operação diretamente em Conversas.
- Manter o comportamento atual em telas menores, com os painéis alternados para não apertar o chat.

## Campo “Senha Meu Gov”

- Criar o campo personalizado padrão **Senha Meu Gov** para a Sevcon.
- Vincular esse campo aos clientes já existentes e garantir sua presença automática nos novos atendimentos.
- O campo armazenará apenas a informação operacional definida pela equipe; não será preenchido com conteúdo inventado.

## Pesquisa de satisfação individual

- Manter as configurações gerais da pesquisa da empresa.
- Criar uma preferência individual para o envio automático ao finalizar atendimento.
- Cada usuário poderá ativar ou desativar essa opção no próprio perfil.
- Preservar Catarina Alencar desativada e deixar os demais atendentes atuais ativados; novos usuários herdarão o padrão ativo da Sevcon.
- O envio manual da pesquisa continuará disponível quando a pesquisa da empresa estiver ativa.

## Relatório diário operacional

- Criar o módulo **Relatórios**, visível somente na Sevcon e autorizado para owner/admin.
- Exibir por atendimento: cliente, solicitação, status resolvido ou pendente, responsável pela solução, responsável atual pela pendência, setor e horários relevantes.
- Ao finalizar, a IA analisará a conversa e sugerirá solicitação, resolução, situação e encaminhamento; o atendente revisará e confirmará antes de concluir.
- Permitir correção manual posterior por owner/admin, preservando autoria e horário da atualização.
- Oferecer filtros por data, atendente, setor e situação.
- Disponibilizar visualização na tela e exportação em PDF e Excel.

## Monitoramento em tempo real

- Reaproveitar o monitor operacional existente e adicionar ao painel da Sevcon um widget grande por atendente.
- Mostrar atendimentos em aberto, aguardando resposta, mais antigo em espera, atrasados e situação recente.
- Atualizar automaticamente quando mensagens ou responsáveis mudarem.

## Ações das mensagens

- Deixar somente a reação rápida ao lado da mensagem ao passar o mouse.
- Adicionar uma seta dentro da mensagem com menu para responder, reagir, editar quando permitido, baixar mídia/arquivo e apagar.
- A reação abrirá emojis rápidos e uma opção “mais” para o seletor completo.
- Preservar todas as regras atuais de permissão e janela de edição.

## Detalhes técnicos

- Usar uma configuração explícita da empresa para ativar essa modalidade, evitando espalhar verificações pelo identificador da Sevcon.
- Banco: adicionar preferência individual de CSAT, estrutura do relatório diário e vínculo do campo padrão, com RLS e permissões restritas à empresa.
- IA: gerar somente sugestões com base no histórico real; nunca finalizar ou classificar sem confirmação humana.
- Exportações serão geradas a partir dos mesmos filtros e dados exibidos na tela.
- Validar desktop e celular, envio automático por usuários diferentes, filtros, exportações e ações de mensagem.
