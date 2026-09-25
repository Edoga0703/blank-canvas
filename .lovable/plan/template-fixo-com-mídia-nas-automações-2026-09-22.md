# Template fixo com mídia nas automações

## Objetivo
Permitir que a mensagem fixa de uma etapa do CRM envie texto, imagem, vídeo, áudio ou documento, mantendo as automações atuais intactas.

## Alterações
- Adicionar ao template fixo uma área para anexar, visualizar, substituir e remover um arquivo.
- Aceitar imagem, vídeo, áudio e documentos, com validação de tipo e tamanho antes do envio.
- Salvar o anexo por empresa e vinculá-lo à etapa da automação.
- No disparo, enviar a mídia pelo WhatsApp com o texto como legenda quando o formato permitir.
- Para áudio, enviar o áudio e preservar a mensagem textual configurada como um envio complementar quando necessário.
- Registrar o disparo no histórico da conversa com tipo, nome, formato e endereço da mídia.
- Manter o comportamento atual para automações somente com texto, IA ou apenas regras.

## Segurança e confiabilidade
- Somente administradores e responsáveis autorizados continuam podendo editar automações.
- O arquivo será validado e armazenado com isolamento por empresa.
- O disparo só será marcado como concluído depois que o provedor aceitar a mensagem.

## Validação
- Testar criação, substituição e remoção de cada tipo de anexo.
- Testar disparo imediato de texto, imagem, vídeo, áudio e documento.
- Confirmar que templates antigos continuam funcionando sem alteração.
