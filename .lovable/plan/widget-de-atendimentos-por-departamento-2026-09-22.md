# Widget de atendimentos por departamento

## Resultado
Adicionar à galeria do painel um widget grande chamado **Atendimentos por departamento**, com atualização em tempo real e leitura clara da distribuição da operação.

## Visual
- Gráfico radial moderno no centro, mostrando o total de atendimentos abertos.
- Anéis/segmentos coloridos para representar a participação de cada departamento.
- Lista lateral com nome do departamento, quantidade e percentual do total.
- Destaque do departamento com maior volume.
- Estado vazio bem resolvido quando não houver atendimentos.
- Cores compatíveis com o padrão visual Metrix e adaptação para tema claro/escuro.

## Dados e regras
- Contabilizar apenas tickets atualmente abertos.
- Usar o departamento definido no atendimento; quando necessário, considerar o departamento vinculado à etapa.
- Manter “Sem departamento” separado para evidenciar atendimentos pendentes de organização.
- Para atendentes, respeitar o recorte atual e mostrar somente os tickets que eles podem visualizar.
- Atualizar automaticamente quando mensagens ou atendimentos forem alterados.

## Integração
- Disponibilizar na categoria **Atendimento & Operação** da galeria de widgets.
- Funcionar no tamanho grande 2×2, adequado para o gráfico e a legenda.
- Não alterar os widgets atuais nem o painel padrão já salvo pelos usuários.

## Validação
- Conferir que o widget pode ser adicionado sem travar o painel.
- Validar quantidades, nomes dos departamentos, estado vazio e atualização ao vivo.
- Revisar a apresentação em desktop e tela menor.
