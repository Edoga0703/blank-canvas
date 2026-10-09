# Corrigir e aprimorar os grupos

## Objetivo
Deixar a área de grupos fiel ao WhatsApp: total correto, nomes e fotos reais, sem controles ou etiquetas de IA, e detalhes completos dos participantes.

## Alterações
- Carregar a lista completa de grupos usando paginação e usar essa mesma lista no contador, inclusive antes de abrir a aba.
- Priorizar sempre os metadados sincronizados do grupo para nome e foto na lista e no topo da conversa, evitando JIDs ou códigos como título.
- Buscar a foto de cada grupo pelo recurso de avatar quando ela não vier na listagem e armazenar o resultado para reutilização.
- Remover de grupos todas as etiquetas, ícones, status, resumo e controles ligados à IA; grupos continuarão com atendimento exclusivamente humano.
- Trocar o título lateral para **Detalhes do grupo** quando uma conversa de grupo estiver aberta.
- Normalizar os participantes retornados pelo WhatsApp, resolvendo o número real quando houver identificador alternativo e exibindo foto, nome e telefone.
- Adicionar em cada participante uma ação **Conversar no privado**, que abre a conversa individual existente ou prepara uma nova conversa com esse contato.

## Regras
- Não criar leads nem executar automações a partir dos grupos.
- Não inventar nome, telefone ou foto: quando o WhatsApp não fornecer um dado, mostrar uma identificação neutra.
- Manter acesso aos grupos liberado para toda a equipe, sem necessidade de assumir atendimento.

## Validação
- Conferir que o contador corresponde ao total sincronizado de grupos.
- Testar grupos com e sem histórico local, foto, nome e participantes.
- Confirmar que abrir um participante leva ao chat privado correto e que nenhum grupo mostra IA.
- Validar a tela em computador e celular e confirmar a compilação sem erros.
