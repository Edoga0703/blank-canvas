# Corrigir criação duplicada de empresas

## Causa confirmada
O usuário comercialbrilhantao@gmail.com já estava vinculado ao Brilhantão como atendente. Durante um carregamento simultâneo, cinco chamadas do cadastro automático consultaram o vínculo ao mesmo tempo e todas receberam o mesmo estado anterior. Como a verificação e a criação acontecem em etapas separadas, as cinco criaram empresas antes que qualquer uma enxergasse o resultado das demais. Não existe hoje uma trava no banco que serialize essa operação.

## Correção
- Tornar a criação automática atômica no banco, usando uma trava por usuário.
- Dentro da mesma operação, verificar novamente qualquer vínculo ativo antes de criar uma empresa.
- Fazer todas as chamadas simultâneas retornarem a empresa já existente, sem criar cópias.
- Manter usuários com múltiplas empresas já existentes funcionando normalmente; a trava vale apenas durante o provisionamento automático.
- Preservar a conta original do Brilhantão e todos os seus dados.

## Limpeza
- Remover somente as cinco empresas duplicadas criadas às 17:56:44, incluindo suas estruturas padrão vazias.
- Não alterar a empresa original, usuários, mensagens, CRM, agentes, conexão ou financeiro do Brilhantão.

## Validação
- Simular chamadas simultâneas de criação e confirmar que apenas uma empresa pode ser criada.
- Conferir que comercialbrilhantao@gmail.com continua vinculado apenas à empresa original após a limpeza.
