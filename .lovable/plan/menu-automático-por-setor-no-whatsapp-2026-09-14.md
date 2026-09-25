# Menu automático por setor no WhatsApp

## Objetivo
Permitir que cada empresa ative um menu inicial fixo, associe opções numéricas aos seus setores e encaminhe automaticamente o contato para a fila correta, sem mudar o atendimento comercial de quem não ativar o recurso.

## Implementação
- Adicionar ao Agente IA uma configuração opcional de “Menu por setores”.
- Permitir escrever a mensagem exatamente como será enviada e vincular cada número a um setor ativo.
- Validar opções duplicadas, setores inválidos e menu sem texto antes de salvar.
- No primeiro contato, enviar o texto fixo sem passar pela IA, preservando linhas e organização.
- Enquanto o menu estiver aguardando escolha:
  - resposta válida transfere o card/conversa ao setor;
  - distribui para o próximo atendente da fila do setor;
  - sem fila, escolhe o membro com menos conversas;
  - resposta inválida repete o menu;
  - após transferência, o agente segue conforme as regras atuais.
- Impedir reenvios repetidos do menu na mesma conversa e registrar a transferência no histórico.
- Manter tudo desligado por padrão e preservar integralmente o fluxo atual das empresas existentes.

## Dados e segurança
- Guardar a configuração e o estado de espera no banco com acesso restrito à empresa.
- Validar no servidor que todos os setores pertencem à empresa antes de transferir.
- Reaproveitar a distribuição por setor já existente para manter o mesmo comportamento da transferência manual.

## Validação
- Testar menu desligado, primeiro contato, opção válida, opção inválida, atendente em vários setores e setor com/sem fila.
- Conferir a tela em computador e celular e validar compilação e erros de execução.
